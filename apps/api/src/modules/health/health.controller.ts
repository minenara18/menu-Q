import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { HealthService } from './health.service';

/**
 * Liveness/readiness probes.
 *
 * These are deliberately outside the global `/v1` prefix and are excluded from
 * throttling (`@SkipThrottle`). No authentication is required.
 */
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  async liveness() {
    return { status: 'ok', service: 'order-q-api', at: new Date().toISOString() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (database ping; optional Redis ping)' })
  async readiness(@Res({ passthrough: true }) res: Response) {
    const database = await this.healthService.checkDatabase();
    const redis = await this.healthService.checkRedis();

    if (!database.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: database.ok ? 'ready' : 'not-ready',
      database: database.ok ? 'up' : 'down',
      redis: redis.configured ? (redis.ok ? 'up' : 'down') : 'not-configured',
      at: new Date().toISOString(),
    };
  }
}
