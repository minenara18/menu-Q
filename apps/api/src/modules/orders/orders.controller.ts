import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, OrderType, PaymentMethod } from '@order-q/shared';
import { IdempotencyKeyPipe, IDEMPOTENCY_KEY_HEADER } from '../../common/pipes/idempotency-key.pipe';
import { z } from 'zod';

const CartItemSchema = z.object({
  menuId: z.string().uuid(),
  qty: z.number().int().positive(),
  note: z.string().optional(),
});

const CheckoutPaymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive(),
  splitGroupId: z.string().optional(),
});

const DiscountSchema = z.object({
  type: z.enum(['amount', 'percent']),
  value: z.number().min(0),
}).refine((d) => (d.type === 'percent' ? d.value <= 100 : true), {
  message: 'Discount percent must be <= 100',
});

const CheckoutSchema = z.object({
  items: z.array(CartItemSchema).min(1),
  customerName: z.string().optional(),
  orderType: z.nativeEnum(OrderType),
  tableNumber: z.string().optional(),
  payments: z.array(CheckoutPaymentSchema).min(1),
  idempotencyKey: z.string().uuid(),
  discount: DiscountSchema.optional(),
});

const ValidateDraftSchema = z.object({
  items: z.array(CartItemSchema).min(1),
});

type CheckoutBody = z.infer<typeof CheckoutSchema>;

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post('checkout')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Checkout order (pay-first)' })
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, description: 'UUID v4 for idempotency', required: true })
  async checkout(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('shiftId') shiftId: string,
    @CurrentUser('sub') userId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string,
    @Body() body: CheckoutBody,
  ) {
    // Use idempotency key from header or body
    const key = idempotencyKey || body.idempotencyKey;
    return this.ordersService.checkout(outletId, shiftId, userId, { ...body, idempotencyKey: key });
  }

  @Post('validate')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate draft order (check stock, calculate total & ETA)' })
  async validateDraft(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof ValidateDraftSchema>,
  ) {
    return this.ordersService.validateDraft(outletId, body.items);
  }
}