import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';

interface AttemptState {
  attempts: number;
  lockedUntil?: number;
}

/**
 * Verifies a manager/owner PIN for sensitive operations (paid-ticket cancellation,
 * shift-close variance above threshold, ...). Includes per-outlet brute-force
 * protection (lockout) and writes an audit log entry for every approval/failure.
 */
@Injectable()
export class ManagerPinService {
  private readonly logger = new Logger(ManagerPinService.name);
  private attempts = new Map<string, AttemptState>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async verify(outletId: string, pin: string, opts: { action: string; entity: string; entityId: string; actorId: string }) {
    const key = outletId;
    const now = Date.now();
    const state = this.attempts.get(key);
    const maxAttempts = this.configService.get<number>('app.pin.maxAttempts') ?? 5;
    const lockoutMinutes = this.configService.get<number>('app.pin.lockoutMinutes') ?? 15;

    if (state?.lockedUntil && state.lockedUntil > now) {
      const remainingMin = Math.ceil((state.lockedUntil - now) / 60000);
      throw new ForbiddenException(`Too many failed manager PIN attempts. Coba lagi dalam ${remainingMin} menit.`);
    }

    const owners = await this.prisma.user.findMany({
      where: { outletId, role: 'OWNER', isActive: true },
    });

    let approver: typeof owners[number] | null = null;
    for (const owner of owners) {
      if (await argon2.verify(owner.pinHash, pin)) {
        approver = owner;
        break;
      }
    }

    if (!approver) {
      const next = { attempts: (state?.attempts ?? 0) + 1 } as AttemptState;
      if (next.attempts >= maxAttempts) {
        next.lockedUntil = now + lockoutMinutes * 60 * 1000;
      }
      this.attempts.set(key, next);
      await this.prisma.auditLog.create({
        data: {
          outletId,
          actorId: opts.actorId,
          action: 'MANAGER_PIN_FAILED',
          entity: opts.entity,
          entityId: opts.entityId,
          diff: { source: opts.action, attempts: next.attempts },
        },
      });
      this.logger.warn(`Failed manager PIN attempt ${next.attempts}/${maxAttempts} for outlet ${outletId}`);
      throw new ForbiddenException('Manager PIN tidak valid');
    }

    this.attempts.delete(key);
    await this.prisma.auditLog.create({
      data: {
        outletId,
        actorId: approver.id,
        action: 'PIN_APPROVE',
        entity: opts.entity,
        entityId: opts.entityId,
        diff: {
          approvedBy: approver.name,
          approvedById: approver.id,
          requestedBy: opts.actorId,
          source: opts.action,
        },
      },
    });
    return approver;
  }
}
