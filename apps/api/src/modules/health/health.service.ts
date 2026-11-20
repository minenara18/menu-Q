import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { connect } from 'net';

/**
 * Readiness probe helper.
 *
 * - Database is mandatory: a failed ping makes the app "not ready".
 * - Redis is optional: it is pinged only when REDIS_URL is configured, and its
 *   status is reported but does NOT fail readiness (the API runs without Redis).
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async checkDatabase(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Database readiness check failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  async checkRedis(): Promise<{ configured: boolean; ok?: boolean; error?: string }> {
    const url = this.configService.get<string>('app.redis.url');
    if (!url) {
      return { configured: false };
    }

    const ok = await this.pingRedis(url);
    return ok
      ? { configured: true, ok: true }
      : { configured: true, ok: false, error: 'Redis PING failed' };
  }

  /** Minimal RESP PING over TCP so no Redis client dependency is required. */
  private pingRedis(rawUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      let target: URL;
      try {
        target = new URL(rawUrl);
      } catch {
        resolve(false);
        return;
      }

      const socket = connect({
        host: target.hostname,
        port: Number(target.port || 6379),
      });

      const finish = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(1500);
      socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
      socket.once('data', (buf) => finish(buf.toString('utf8').includes('PONG')));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
      socket.once('close', () => finish(false));
    });
  }
}
