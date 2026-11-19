import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class PaymentsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsGateway.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private ticketsService: TicketsService,
  ) {}

  onModuleInit() {
    // Check for expired QRIS payments every minute
    this.interval = setInterval(() => {
      void this.checkExpiredPayments();
    }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async checkExpiredPayments() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const expiredPayments = await this.prisma.payment.findMany({
        where: {
          method: 'QRIS',
          status: 'PENDING',
          createdAt: { lt: fiveMinutesAgo },
        },
        include: { ticket: { include: { orderItems: true } } },
      });

      for (const payment of expiredPayments) {
        // Mark as failed
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED' },
        });

        // Check if all payments for this ticket are failed
        const allPayments = await this.prisma.payment.findMany({
          where: { ticketId: payment.ticketId },
        });

        const allFailed = allPayments.every(
          (p: typeof allPayments[0]) => p.status === 'FAILED' || p.status === 'REFUNDED',
        );

        if (allFailed) {
          // Cancel ticket and release stock (system-initiated: no manager PIN required)
          const ticket = payment.ticket;
          await this.ticketsService.cancelTicket(ticket.outletId, ticket.id, 'system', {
            managerPin: '',
            reason: 'QRIS payment timeout (5 min)',
          }, { system: true });
        }
      }
    } catch (error) {
      this.logger.error('Error checking expired payments', error as Error);
    }
  }
}