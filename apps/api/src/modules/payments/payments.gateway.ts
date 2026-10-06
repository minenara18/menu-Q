import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentStatus, PaymentMethod } from '@order-q/shared';
import { TicketsService } from '../tickets/tickets.service';
import { StockService } from '../stock/stock.service';

@Injectable()
export class PaymentsGateway implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private ticketsService: TicketsService,
    private stockService: StockService,
  ) {}

  onModuleInit() {
    // Check for expired QRIS payments every minute
    this.interval = setInterval(() => this.checkExpiredPayments(), 60 * 1000);
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
          method: PaymentMethod.QRIS,
          status: PaymentStatus.PENDING,
          createdAt: { lt: fiveMinutesAgo },
        },
        include: { ticket: true },
      });

      for (const payment of expiredPayments) {
        // Mark as failed
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });

        // Check if all payments for this ticket are failed
        const allPayments = await this.prisma.payment.findMany({
          where: { ticketId: payment.ticketId },
        });

        const allFailed = allPayments.every(
          (p) => p.status === PaymentStatus.FAILED || p.status === PaymentStatus.REFUNDED,
        );

        if (allFailed) {
          // Cancel ticket and release stock
          const ticket = payment.ticket;
          const items = ticket.orderItems.map((oi) => ({ menuId: oi.menuId, qty: oi.qty }));

          // Release stock
          await this.stockService.releaseStock(
            ticket.outletId,
            items,
            ticket.id,
            'system',
          );

          // Cancel ticket
          await this.prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: 'CANCELLED' },
          });

          // Cancel subtickets
          await this.prisma.subTicket.updateMany({
            where: { ticketId: ticket.id, status: { not: 'CANCELLED' } },
            data: { status: 'CANCELLED' },
          });

          // Audit log
          await this.prisma.auditLog.create({
            data: {
              outletId: ticket.outletId,
              actorId: 'system',
              action: 'QRIS_TIMEOUT_CANCEL',
              entity: 'Ticket',
              entityId: ticket.id,
              diff: { reason: 'QRIS payment timeout (5 min)' },
            },
          });
        }
      }
    } catch (error) {
      console.error('Error checking expired payments:', error);
    }
  }
}