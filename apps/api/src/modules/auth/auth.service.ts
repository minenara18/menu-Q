import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@order-q/shared';

export interface TokenPayload {
  sub: string;
  outletId: string;
  name: string;
  role: UserRole;
  shiftId?: string;
  stationId?: string | null;
  stationIds?: string[];
}

const LOGIN_KIND = 'LOGIN';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /** SHA-256 of a refresh token; only the hash is stored. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshSecret(): string {
    return this.configService.get<string>('app.jwt.secret') + '-refresh';
  }

  private decodeExpiry(token: string): Date {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    if (decoded?.exp) return new Date(decoded.exp * 1000);
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  private stationIdsOf(user: { stationId?: string | null; stations?: Array<{ stationId: string }> }): string[] {
    const ids = (user.stations ?? []).map((s) => s.stationId);
    if (ids.length === 0 && user.stationId) ids.push(user.stationId);
    return ids;
  }

  async validatePin(outletId: string, userId: string, pin: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        outlet: true,
        stations: true,
      },
    });

    if (!user || user.outletId !== outletId) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const isValid = await argon2.verify(user.pinHash, pin);
    if (!isValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    // Check for active shift
    const activeShift = await this.prisma.shift.findFirst({
      where: {
        outletId,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
    });

    return {
      user,
      shift: activeShift,
    };
  }

  async login(outletId: string, userId: string, pin: string, ip = '') {
    const now = new Date();
    const maxAttempts = this.configService.get<number>('app.pin.maxAttempts') ?? 5;
    const shortLockMinutes = this.configService.get<number>('app.pin.shortLockMinutes') ?? 1;
    const longLockMinutes = this.configService.get<number>('app.pin.lockoutMinutes') ?? 15;

    const attempt = await this.prisma.pinAttempt.upsert({
      where: {
        kind_outletId_userId_ip: { kind: LOGIN_KIND, outletId, userId, ip },
      },
      update: {},
      create: { outletId, kind: LOGIN_KIND, userId, ip },
    });

    if (attempt.lockedUntil && attempt.lockedUntil > now) {
      const remainingMin = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 60000);
      throw new UnauthorizedException(`Terlalu banyak percobaan login. Coba lagi dalam ${remainingMin} menit.`);
    }

    let user: Awaited<ReturnType<typeof this.validatePin>>['user'];
    let shift: Awaited<ReturnType<typeof this.validatePin>>['shift'];

    try {
      const result = await this.validatePin(outletId, userId, pin);
      user = result.user;
      shift = result.shift;
    } catch (error) {
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

      throw error;
    }

    if (attempt.attempts !== 0 || attempt.lockLevel !== 0 || attempt.lockedUntil) {
      await this.prisma.pinAttempt.update({
        where: { id: attempt.id },
        data: { attempts: 0, lockLevel: 0, lockedUntil: null, lastAttemptAt: now },
      });
    }

    const payload: TokenPayload = {
      sub: user.id,
      outletId: user.outletId,
      name: user.name,
      role: user.role as UserRole,
      shiftId: shift?.id,
      stationId: user.stationId,
      stationIds: this.stationIdsOf(user),
    };

    const accessToken = this.jwtService.sign(payload);
    // jti keeps each refresh token unique even for logins in the same second.
    const refreshToken = this.jwtService.sign({ ...payload, jti: randomUUID() }, {
      secret: this.refreshSecret(),
      expiresIn: this.configService.get('app.jwt.refreshExpiry'),
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: this.decodeExpiry(refreshToken),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        outletId: user.outletId,
      },
      shift: shift
        ? {
            id: shift.id,
            status: shift.status,
            openingCash: shift.openingCash,
          }
        : null,
    };
  }

  async refreshToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Reuse of an already-rotated token: revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token sudah dipakai');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token kedaluwarsa');
    }

    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshSecret(),
      }) as TokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { stations: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const newPayload: TokenPayload = {
      sub: user.id,
      outletId: user.outletId,
      name: user.name,
      role: user.role as UserRole,
      shiftId: payload.shiftId,
      stationId: user.stationId,
      stationIds: this.stationIdsOf(user),
    };

    const accessToken = this.jwtService.sign(newPayload);
    const newRefreshToken = this.jwtService.sign({ ...newPayload, jti: randomUUID() }, {
      secret: this.refreshSecret(),
      expiresIn: this.configService.get('app.jwt.refreshExpiry'),
    });
    const newHash = this.hashToken(newRefreshToken);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedByHash: newHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          familyId: stored.familyId,
          expiresAt: this.decodeExpiry(newRefreshToken),
        },
      }),
    ]);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
    });

    if (stored) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revokedAt: new Date() },
      });
    }

    return { success: true };
  }

  async hashPin(pin: string): Promise<string> {
    return argon2.hash(pin, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verifyPin(hash: string, pin: string): Promise<boolean> {
    return argon2.verify(hash, pin);
  }
}
