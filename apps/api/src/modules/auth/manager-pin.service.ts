import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';

const MANAGER_KIND = 'MANAGER';

/**
 * Verifies a manager/owner PIN for sensitive operations (paid-ticket cancellation,
 * shift-close variance above threshold, ...).
 *
 * Attempts and lockouts live in the `PinAttempt` table, so they survive restarts
 * and are shared by every API instance. Lockout is staggered: after the attempt
 * limit the outlet is locked for a short period, then for a longer one.
 */
@Injectable()
export class ManagerPinService {
  private readonly logger = new Logger(ManagerPinService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async verify(
    outletId: string,
    pin: string,
    opts: { action: string; entity: string; entityId: string; actorId: string },
    _ip = '',
  ) {
    const now = new Date();
    const maxAttempts = this.configService.get<number>('app.pin.maxAttempts') ?? 5;
    const shortLockMinutes = this.configService.get<number>('app.pin.shortLockMinutes') ?? 1;
    const longLockMinutes = this.configService.get<number>('app.pin.lockoutMinutes') ?? 15;

    // Manager PIN lockout is per outlet (not per IP): one locked outlet blocks
    // every caller until the lock expires, regardless of where it is accessed.
    const attempt = await this.prisma.pinAttempt.upsert({
      where: {
        kind_outletId_userId_ip: { kind: MANAGER_KIND, outletId, userId: '', ip: '' },
      },
      update: {},
      create: { outletId, kind: MANAGER_KIND, userId: '', ip: '' },
    });

    if (attempt.lockedUntil && attempt.lockedUntil > now) {
      const remainingMin = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 60000);
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
      const attempts = attempt.attempts + 1;
      let lockLevel = attempt.lockLevel;
      let lockedUntil: Date | null = null;

      if (attempts >= maxAttempts) {
        if (lockLevel === 0) {
          lockedUntil = new Date(now.getTime() + shortLockMinutes * 60 * 1000);
          lockLevel = 1;
        } else {
          lockedUntil = new Date(now.getTime() + longLockMinutes * 60 * 1000);
          lockLevel = 2;
        }
      }

      await this.prisma.pinAttempt.update({
        where: { id: attempt.id },
        data: { attempts, lockLevel, lockedUntil, lastAttemptAt: now },
      });

      await this.prisma.auditLog.create({
        data: {
          outletId,
          actorId: opts.actorId,
          action: 'MANAGER_PIN_FAILED',
          entity: opts.entity,
          entityId: opts.entityId,
          diff: { source: opts.action, attempts, lockLevel },
        },
      });

      this.logger.warn(`Failed manager PIN attempt ${attempts}/${maxAttempts} for outlet ${outletId}`);
      throw new ForbiddenException('Manager PIN tidak valid');
    }

    if (attempt.attempts !== 0 || attempt.lockLevel !== 0 || attempt.lockedUntil) {
      await this.prisma.pinAttempt.update({
        where: { id: attempt.id },
        data: { attempts: 0, lockLevel: 0, lockedUntil: null, lastAttemptAt: now },
      });
    }

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
