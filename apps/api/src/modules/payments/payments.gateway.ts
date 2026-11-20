import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

/**
 * Background sweep that expires stale QRIS payments.
 *
 * Multi-instance safety: the whole sweep runs inside one transaction that first
 * takes a Postgres transaction-scoped advisory lock. A second instance blocks on
 * the lock, and by the time it proceeds the payments are already FAILED, so it
 * never cancels the same ticket twice or refunds stock twice.
 */
@Injectable()
export class PaymentsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsGateway.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private ticketsService: TicketsService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const intervalMs = this.configService.get<number>('app.qris.sweepIntervalMs') ?? 60_000;
    this.interval = setInterval(() => {
      void this.checkExpiredPayments();
    }, intervalMs);
    this.logger.log(`QRIS expiry sweep scheduled every ${intervalMs}ms`);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async checkExpiredPayments() {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Serialize sweeps across all API instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'orderq:qris-expiry-sweep'}), 0)`;

        const expiryMinutes = this.configService.get<number>('app.qris.expiryMinutes') ?? 5;
        const cutoff = new Date(Date.now() - expiryMinutes * 60 * 1000);

        const expiredPayments = await tx.payment.findMany({
          where: {
            method: 'QRIS',
            status: 'PENDING',
            createdAt: { lt: cutoff },
          },
          include: { ticket: { include: { orderItems: true } } },
        });

        for (const payment of expiredPayments) {
          try {
            if (payment.status !== 'PENDING') continue;

            await tx.payment.update({
              where: { id: payment.id },
              data: { status: 'FAILED' },
            });

            const allPayments = await tx.payment.findMany({
              where: { ticketId: payment.ticketId },
            });

            const allFailed = allPayments.every(
              (p: typeof allPayments[number]) => p.status === 'FAILED' || p.status === 'REFUNDED',
            );

            if (allFailed) {
              // Cancel ticket and release stock (system-initiated: no manager PIN required)
              const ticket = payment.ticket;
              await this.ticketsService.cancelTicket(ticket.outletId, ticket.id, 'system', {
                managerPin: '',
                reason: `QRIS payment timeout (${expiryMinutes} min)`,
              }, { system: true });
            }
          } catch (error) {
            // Defensive: a concurrent actor may already have cancelled this ticket.
            this.logger.error(`Failed to expire QRIS payment ${payment.id}`, error as Error);
          }
        }
      });
    } catch (error) {
      this.logger.error('Error checking expired payments', error as Error);
    }
  }
}
