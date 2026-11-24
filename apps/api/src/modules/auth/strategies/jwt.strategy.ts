import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('app.jwt.secret'),
    });
  }

  async validate(payload: TokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { stations: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    return {
      sub: user.id,
      outletId: user.outletId,
      name: user.name,
      role: user.role,
      shiftId: payload.shiftId,
      stationId: user.stationId,
      stationIds: user.stations.map((s: { stationId: string }) => s.stationId),
    };
  }
}