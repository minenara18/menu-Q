import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomInt, randomUUID } from 'crypto';
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

  /** Device-friendly login: resolve the outlet from its public short code. */
  async loginWithCode(outletCode: string, userId: string, pin: string, ip = '') {
    const outlet = await this.prisma.outlet.findUnique({ where: { code: outletCode?.trim() ?? '' } });
    // Uniform failure so outlet codes cannot be enumerated through login.
    if (!outlet) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.login(outlet.id, userId, pin, ip);
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

  /**
   * Public login options for a device. Unknown outlets get the same empty
   * response as outlets with no active staff, so codes cannot be enumerated.
   */
  async loginOptions(outletCode: string) {
    const outlet = await this.prisma.outlet.findUnique({ where: { code: outletCode.trim() } });
    if (!outlet) {
      return { staff: [] as Array<{ id: string; name: string; role: string }> };
    }

    const users = await this.prisma.user.findMany({
      where: { outletId: outlet.id, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });

    return {
      // Hanya nama depan: tidak perlu identitas lengkap untuk memilih staf di perangkat.
      staff: users.map((user) => ({
        id: user.id,
        name: user.name.trim().split(/\s+/)[0],
        role: String(user.role),
      })),
    };
  }

  /** Single-use, short-lived 6-digit code that redeems into a display token. */
  async createDisplayPairCode(outletId: string) {
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    await this.prisma.displayPairCode.create({
      data: {
        outletId,
        codeHash: this.hashToken(code),
        expiresAt,
      },
    });

    return { code, expiresAt, expiresInSeconds: 120 };
  }

  async redeemDisplayPairCode(code: string) {
    const record = await this.prisma.displayPairCode.findUnique({
      where: { codeHash: this.hashToken(code.trim()) },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Kode pairing tidak valid atau kedaluwarsa');
    }

    // Atomic claim: only one device can redeem a code.
    const claimed = await this.prisma.displayPairCode.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new UnauthorizedException('Kode pairing tidak valid atau kedaluwarsa');
    }

    return this.createDisplayToken(record.outletId);
  }

  /** Read-only token for the customer-facing display screen. */
  async createDisplayToken(outletId: string) {
    const token = this.jwtService.sign(
      {
        sub: `display:${randomUUID()}`,
        outletId,
        name: 'Display',
        role: 'DISPLAY',
        type: 'DISPLAY',
      },
      { expiresIn: '12h' },
    );
    return { token, tokenType: 'Bearer' };
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
