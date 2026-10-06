import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@order-q/shared';
import { PaymentGateway, CreatePaymentParams } from './payment-gateway.interface';
import { MockPaymentGateway } from './mock-payment.gateway';
import { XenditPaymentGateway } from './xendit-payment.gateway';
import { TicketsService } from '../tickets/tickets.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
  private gateways: Map<string, PaymentGateway> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private ticketsService: TicketsService,
    private websocketGateway: WebsocketGateway,
  ) {
    // Register gateways
    this.gateways.set('mock', new MockPaymentGateway());
    if (this.configService.get('QRIS_ENABLED') === 'true') {
      this.gateways.set('xendit', new XenditPaymentGateway(configService));
    }
  }

  private getGateway(): PaymentGateway {
    const gatewayName = this.configService.get('QRIS_ENABLED') === 'true' ? 'xendit' : 'mock';
    const gateway = this.gateways.get(gatewayName);
    if (!gateway) {
      throw new BadRequestException(`Payment gateway ${gatewayName} not configured`);
    }
    return gateway;
  }

  async createQRISPayment(outletId: string, ticketId: string, amount: number, userId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, outletId },
      include: { payments: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const pendingPayment = ticket.payments.find((p) => p.method === PaymentMethod.QRIS && p.status === PaymentStatus.PENDING);
    if (!pendingPayment) {
      throw new BadRequestException('No pending QRIS payment for this ticket');
    }

    // Check if already paid
    const paidPayment = ticket.payments.find((p) => p.method === PaymentMethod.QRIS && p.status === PaymentStatus.PAID);
    if (paidPayment) {
      throw new ConflictException('QRIS payment already completed');
    }

    const gateway = this.getGateway();
    const callbackUrl = `${this.configService.get('APP_URL') || 'http://localhost:3000'}/v1/payments/qris/callback/${ticketId}`;

    const params: CreatePaymentParams = {
      amount,
      orderId: ticketId,
      description: `Order ${ticket.ticketNumber}`,
      callbackUrl,
      metadata: { ticketId, outletId },
    };

    const result = await gateway.createPayment(params);

    // Update payment with gateway reference
    await this.prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        qrisRef: result.paymentId,
        qrisPayload: result.rawResponse,
      },
    });

    return {
      paymentId: result.paymentId,
      qrCode: result.qrCode,
      paymentUrl: result.paymentUrl,
      expiresAt: result.expiresAt,
    };
  }

  async handleQRISWebhook(outletId: string, payload: any, signature: string) {
    const gateway = this.getGateway();
    const verification = await gateway.verifyWebhook(payload, signature);

    if (!verification.valid || !verification.paymentId) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Find payment by gateway reference
    const payment = await this.prisma.payment.findFirst({
      where: { qrisRef: verification.paymentId },
      include: { ticket: true },
    });

    if (!payment) {
      // Idempotency: payment might have been processed already
      return { success: true, message: 'Payment not found (already processed?)' };
    }

    if (payment.status === PaymentStatus.PAID) {
      return { success: true, message: 'Payment already processed' };
    }

    const ticket = payment.ticket;

    if (verification.status === 'paid') {
      // Update payment status
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PAID },
      });

      // Check if all payments are paid
      const allPayments = await this.prisma.payment.findMany({ where: { ticketId: ticket.id } });
      const allPaid = allPayments.every((p) => p.status === PaymentStatus.PAID);

      if (allPaid) {
        // Update ticket status to ORDERED
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: 'ORDERED' },
        });

        // Emit ticket created event for kitchen
        this.websocketGateway.emitTicketCreated(outletId, ticket);
      }

      return { success: true, message: 'Payment successful' };
    } else if (verification.status === 'expired' || verification.status === 'failed') {
      // Mark payment as failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      // Check if all QRIS payments failed - cancel ticket
      const qrisPayments = await this.prisma.payment.findMany({
        where: { ticketId: ticket.id, method: PaymentMethod.QRIS },
      });

      const allFailed = qrisPayments.every((p) => p.status === PaymentStatus.FAILED);
      if (allFailed && ticket.payments.every((p) => p.method === PaymentMethod.QRIS)) {
        // All payments are QRIS and all failed - cancel ticket and release stock
        await this.ticketsService.cancelTicket(outletId, ticket.id, payment.ticketId, {
          managerPin: '000000', // System cancellation
          reason: 'QRIS payment expired/failed',
        });
      }

      return { success: true, message: 'Payment failed/expired' };
    }

    return { success: true, message: 'Webhook received' };
  }

  async handleQRISCallback(ticketId: string, query: any) {
    // Handle redirect callback from payment gateway
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // In real implementation, verify with gateway
    return { success: true, ticket };
  }

  async checkPaymentStatus(outletId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, outletId },
      include: { payments: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      payments: ticket.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
        status: p.status,
      })),
    };
  }

  async cancelQRISPayment(outletId: string, ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, outletId },
      include: { payments: true },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const qrisPayment = ticket.payments.find((p) => p.method === PaymentMethod.QRIS);
    if (!qrisPayment) {
      throw new BadRequestException('No QRIS payment for this ticket');
    }

    if (qrisPayment.status === PaymentStatus.PAID) {
      throw new ConflictException('Cannot cancel paid QRIS payment');
    }

    // Mark as failed
    await this.prisma.payment.update({
      where: { id: qrisPayment.id },
      data: { status: PaymentStatus.FAILED },
    });

    // If all payments failed, cancel ticket
    const allPayments = await this.prisma.payment.findMany({ where: { ticketId } });
    const allFailed = allPayments.every((p) => p.status === PaymentStatus.FAILED || p.status === PaymentStatus.REFUNDED);

    if (allFailed) {
      await this.ticketsService.cancelTicket(outletId, ticketId, userId, {
        managerPin: '000000',
        reason: 'Customer cancelled QRIS payment',
      });
    }

    return { success: true };
  }
}