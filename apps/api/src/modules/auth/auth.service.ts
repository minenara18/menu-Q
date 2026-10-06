import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ShiftStatus } from '@order-q/shared';
import { v4 as uuidv4 } from 'uuid';

interface TokenPayload {
  sub: string;
  outletId: string;
  name: string;
  role: UserRole;
  shiftId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validatePin(outletId: string, userId: string, pin: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        outlet: true,
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
        status: ShiftStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });

    return {
      user,
      shift: activeShift,
    };
  }

  async login(outletId: string, userId: string, pin: string) {
    const { user, shift } = await this.validatePin(outletId, userId, pin);

    const payload: TokenPayload = {
      sub: user.id,
      outletId: user.outletId,
      name: user.name,
      role: user.role as UserRole,
      shiftId: shift?.id,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('app.jwt.secret') + '-refresh',
      expiresIn: this.configService.get('app.jwt.refreshExpiry'),
    });

    // Store refresh token hash in database (optional, for revocation)
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        // Could store refresh token hash here if needed
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
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('app.jwt.secret') + '-refresh',
      }) as TokenPayload;

      // Verify user still exists and is active
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
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
      };

      const accessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get('app.jwt.secret') + '-refresh',
        expiresIn: this.configService.get('app.jwt.refreshExpiry'),
      });

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
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