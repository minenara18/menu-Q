import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { z } from 'zod';

const CreateQRISPaymentSchema = z.object({
  ticketId: z.string().uuid(),
});

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('qris')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create QRIS payment for ticket' })
  async createQRISPayment(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: z.infer<typeof CreateQRISPaymentSchema>,
  ) {
    const ticket = await this.paymentsService['prisma'].ticket.findFirst({
      where: { id: body.ticketId, outletId },
      include: { payments: true },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const qrisPayment = ticket.payments.find((p: { method: string; status: string }) => p.method === 'QRIS' && p.status === 'PENDING');
    if (!qrisPayment) {
      throw new Error('No pending QRIS payment');
    }

    return this.paymentsService.createQRISPayment(outletId, body.ticketId, qrisPayment.amount, userId);
  }

  @Post('webhooks/qris')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'QRIS webhook endpoint (Xendit/Midtrans)' })
  // Generous but bounded: webhooks are called by the payment provider, not humans.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'x-callback-signature', description: 'Webhook signature', required: false })
  async handleQRISWebhook(
    @Headers('x-callback-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: any,
  ) {
    // Get outletId from payload or query
    const outletId = payload.outletId || payload.metadata?.outletId;
    if (!outletId) {
      throw new Error('Outlet ID not found in webhook');
    }

    return this.paymentsService.handleQRISWebhook(outletId, payload, signature || '');
  }

  @Get('qris/callback/:ticketId')
  @ApiOperation({ summary: 'QRIS callback redirect' })
  async handleQRISCallback(
    @Param('ticketId') ticketId: string,
    @Query() query: any,
  ) {
    return this.paymentsService.handleQRISCallback(ticketId, query);
  }

  @Get(':ticketId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check payment status for ticket' })
  async checkPaymentStatus(
    @CurrentUser('outletId') outletId: string,
    @Param('ticketId') ticketId: string,
  ) {
    return this.paymentsService.checkPaymentStatus(outletId, ticketId);
  }

  @Post('qris/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel pending QRIS payment' })
  async cancelQRISPayment(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: z.infer<typeof CreateQRISPaymentSchema>,
  ) {
    return this.paymentsService.cancelQRISPayment(outletId, body.ticketId, userId);
  }
}