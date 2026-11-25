import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('login-options')
  @ApiOperation({ summary: 'Public staff options for a device (id, name, role only)' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async loginOptions(@Query('outletCode') outletCode?: string) {
    return this.authService.loginOptions(outletCode ?? '');
  }

  @Post('display-pair-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.CASHIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a single-use 6-digit display pairing code' })
  async displayPairCode(@CurrentUser('outletId') outletId: string) {
    return this.authService.createDisplayPairCode(outletId);
  }

  @Post('display-pair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a display pairing code for a read-only token' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async displayPair(@Body() body: { code: string }) {
    return this.authService.redeemDisplayPairCode(body.code ?? '');
  }

  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with PIN' })
  // Strict per-IP + per-user limit to slow down PIN brute force.
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
      getTracker: (req: Record<string, any>) => `${req.ip}:${req.body?.userId ?? ''}`,
    },
  })
  async pinLogin(
    @Req() req: Request,
    @Body() body: { outletId: string; userId: string; pin: string },
  ) {
    return this.authService.login(body.outletId, body.userId, body.pin, req.ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout: revoke the refresh-token family' })
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @Post('display-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.CASHIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Issue a read-only token for the customer display' })
  async displayToken(@CurrentUser('outletId') outletId: string) {
    return this.authService.createDisplayToken(outletId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() user: any) {
    return user;
  }
}