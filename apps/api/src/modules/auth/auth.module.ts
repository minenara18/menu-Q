import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ManagerPinService } from './manager-pin.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PinStrategy } from './strategies/pin.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('app.jwt.secret'),
        signOptions: {
          expiresIn: configService.get('app.jwt.accessExpiry'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PinStrategy, ManagerPinService],
  exports: [AuthService, JwtModule, ManagerPinService],
})
export class AuthModule {}
