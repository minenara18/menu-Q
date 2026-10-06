import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class PinStrategy extends PassportStrategy(Strategy, 'pin') {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'userId',
      passwordField: 'pin',
      passReqToCallback: true,
    });
  }

  async validate(req: any, userId: string, pin: string) {
    const outletId = req.body.outletId || req.query.outletId;
    if (!outletId) {
      throw new UnauthorizedException('Outlet ID is required');
    }

    const result = await this.authService.validatePin(outletId, userId, pin);
    return result;
  }
}