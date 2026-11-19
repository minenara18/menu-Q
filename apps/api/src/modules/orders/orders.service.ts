import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { MenusService } from '../menus/menus.service';
import { ShiftsService } from '../shifts/shifts.service';
import { Prisma, OrderType as PrismaOrderType, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { PaymentMethod, PaymentStatus, TicketStatus, SubTicketStatus, OrderType } from '@order-q/shared';
import { WebsocketGateway } from '../../websocket/websocket.gateway';

interface CartItem {
  menuId: string;
  qty: number;
  note?: string;
}

interface CheckoutPayment {
  method: PaymentMethod;
  amount: number;
  splitGroupId?: string;
}

interface CheckoutDto {
  items: CartItem[];
  customerName?: string;
  orderType: OrderType;
  tableNumber?: string;
  payments: CheckoutPayment[];
  idempotencyKey: string;
  discount?: { type: 'amount' | 'percent'; value: number };
}

export interface CheckoutResult {
  ticket: any;
  receipt: any;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private menusService: MenusService,
    private shiftsService: ShiftsService,
    private websocketGateway: WebsocketGateway,
  ) {}

  async checkout(outletId: string, shiftId: string, userId: string, dto: CheckoutDto): Promise<CheckoutResult> {
    if (!shiftId) {
      // JWT carries shiftId at login time; an open shift created afterwards requires a re-login.
      throw new BadRequestException('No active shift in token. Open a shift and sign in again.');
    }

    // Check idempotency: the Idempotency-Key header is stored on the first payment row.
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existingPayment) {
      // Return existing ticket if found
      const existingTicket = await this.prisma.ticket.findUnique({
        where: { id: existingPayment.ticketId },
        include: {
          subtickets: { include: { station: true } },
          orderItems: { include: { menu: true } },
          payments: true,
        },
      });
      if (existingTicket) {
        return this.buildCheckoutResult(existingTicket);
      }
    }

    // Get active shift
    const shift = await this.shiftsService.findById(outletId, shiftId);
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('Shift is not open');
    }

    // Validate items and get menu details
    const menuIds = dto.items.map((i) => i.menuId);
    const menus = await this.prisma.menu.findMany({
      where: { id: { in: menuIds }, outletId },
      include: { recipeLines: { include: { ingredient: true } }, station: true },
    });

    if (menus.length !== menuIds.length) {
      throw new NotFoundException('One or more menus not found');
    }

    // Check stock availability
    const stockCheck = await this.stockService.checkAvailability(outletId, dto.items);
    if (!stockCheck.canFulfill) {
      throw new ConflictException({
        message: 'Insufficient stock',
        details: stockCheck.insufficientItems,
      });
    }

    // Calculate totals
    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    const taxRate = outlet?.taxRate || 0.11;
    const serviceRate = outlet?.serviceRate || 0.05;

    let subtotal = 0;
    const orderItemsData: any[] = [];

    for (const item of dto.items) {
      const menu = menus.find((m: typeof menus[0]) => m.id === item.menuId)!;
      const itemSubtotal = menu.price * item.qty;
      subtotal += itemSubtotal;

      orderItemsData.push({
        menuId: menu.id,
        qty: item.qty,
        priceSnapshot: menu.price,
        note: item.note,
      });
    }

    const taxAmount = Math.round(subtotal * taxRate);
    const serviceAmount = Math.round(subtotal * serviceRate);

    // Optional ticket-level discount (validated). applied only against subtotal+tax+service.
    let discountAmount = 0;
    if (dto.discount) {
      const { type, value } = dto.discount;
      if (type === 'percent') {
        if (typeof value !== 'number' || value < 0 || value > 100) {
          throw new BadRequestException('Discount percent must be between 0 and 100');
        }
        discountAmount = Math.round((subtotal + taxAmount + serviceAmount) * (value / 100));
      } else if (type === 'amount') {
        if (typeof value !== 'number' || value < 0) {
          throw new BadRequestException('Discount amount must be non-negative');
        }
        discountAmount = Math.min(Math.round(value), subtotal + taxAmount + serviceAmount);
      } else {
        throw new BadRequestException('Discount type must be "amount" or "percent"');
      }
    }

    const totalAmount = subtotal + taxAmount + serviceAmount - discountAmount;

    // Validate payments
    const paymentTotal = dto.payments.reduce((sum, p) => sum + p.amount, 0);
    if (paymentTotal !== totalAmount) {
      throw new BadRequestException(`Payment total (${paymentTotal}) does not match order total (${totalAmount})`);
    }

    // Check cash payment amount matches
    const cashPayments = dto.payments.filter((p) => p.method === PaymentMethod.CASH);
    const qrisPayments = dto.payments.filter((p) => p.method === PaymentMethod.QRIS);

    if (cashPayments.length > 0) {
      const cashTotal = cashPayments.reduce((sum, p) => sum + p.amount, 0);
      // Cash can be more than total (change given)
    }

    // Calculate ETA
    const eta = await this.calculateETA(outletId, dto.items, menus);

    let stockChanges: Array<{ ingredientId: string; qtyDelta: number }> = [];

    const runCheckout = async () => this.prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      // Serialize checkouts per shift so dailyNo allocation is race-free
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${outletId} || ':' || ${shiftId}))`;

      // Generate ticket number atomically inside the transaction
      const lastTicket = await tx.ticket.findFirst({
        where: { shiftId },
        orderBy: { dailyNo: 'desc' },
        select: { dailyNo: true },
      });
      const dailyNo = (lastTicket?.dailyNo ?? 0) + 1;
      const ticketNumber = `A-${dailyNo.toString().padStart(3, '0')}`;

      // Create ticket
      const ticket = await tx.ticket.create({
        data: {
          outletId,
          shiftId,
          dailyNo,
          ticketNumber,
          customerName: dto.customerName,
          orderType: dto.orderType as unknown as PrismaOrderType,
          tableNumber: dto.tableNumber,
          status: 'ORDERED',
          etaMin: eta.min,
          etaMax: eta.max,
          subtotal,
          taxAmount,
          serviceAmount,
          discountAmount,
          totalAmount,
        },
      });

      // Group items by station for subtickets
      const itemsByStation = new Map<string, typeof orderItemsData>();
      for (const itemData of orderItemsData) {
        const menu = menus.find((m: typeof menus[0]) => m.id === itemData.menuId)!;
        const stationId = menu.stationId;
        if (!itemsByStation.has(stationId)) {
          itemsByStation.set(stationId, []);
        }
        itemsByStation.get(stationId)!.push({ ...itemData, stationId });
      }

      // Create subtickets and order items
      for (const [stationId, items] of itemsByStation) {
        const subticket = await tx.subTicket.create({
          data: {
            ticketId: ticket.id,
            stationId,
            status: 'ORDERED',
            priorityScore: Date.now(), // FIFO by creation time
          },
        });

        for (const item of items) {
          await tx.orderItem.create({
            data: {
              ticketId: ticket.id,
              subticketId: subticket.id,
              menuId: item.menuId,
              qty: item.qty,
              priceSnapshot: item.priceSnapshot,
              note: item.note,
            },
          });
        }
      }

// Create payments. The idempotency key is stored on the first payment row only;
      // the DB unique index on idempotencyKey then guarantees exactly one ticket per key.
      let keyAssigned = false;
      for (const payment of dto.payments) {
        await tx.payment.create({
          data: {
            ticketId: ticket.id,
            method: payment.method as unknown as PrismaPaymentMethod,
            amount: payment.amount,
            status: String(payment.method) === 'QRIS' ? 'PENDING' : 'PAID',
            splitGroupId: payment.splitGroupId,
            qrisRef: payment.method === PaymentMethod.QRIS ? dto.idempotencyKey : null,
            idempotencyKey: keyAssigned ? null : dto.idempotencyKey,
          },
        });
        keyAssigned = true;
      }

      // Reserve stock atomically in the same transaction
      stockChanges = await this.stockService.reserveStock(outletId, dto.items, ticket.id, userId, tx);

      return ticket;
    });

    let result: { id: string };
    try {
      result = await runCheckout();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Idempotency race: another identical checkout may have committed first.
        const existingPayment = await this.prisma.payment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existingPayment) {
          const existingTicket = await this.prisma.ticket.findUnique({
            where: { id: existingPayment.ticketId },
            include: {
              subtickets: { include: { station: true } },
              orderItems: { include: { menu: true } },
              payments: true,
            },
          });
          if (existingTicket) {
            return this.buildCheckoutResult(existingTicket);
          }
        }
        // Otherwise it was a dailyNo/unique race; retry once.
        result = await runCheckout();
      } else {
        throw error;
      }
    }

    // Recalculate menu availability now that the transaction committed
    await this.menusService.recalculateAvailability(outletId);

    // Fetch complete ticket with relations
    const completeTicket = await this.prisma.ticket.findUnique({
      where: { id: result.id },
      include: {
        subtickets: { include: { station: true } },
        orderItems: { include: { menu: true } },
        payments: true,
      },
    });

    // Emit WebSocket events
    this.websocketGateway.emitTicketCreated(outletId, completeTicket!);
    if (stockChanges.length > 0) {
      this.websocketGateway.emitStockChanged(outletId, {
        outletId,
        reason: 'SALE',
        ticketId: result.id,
        changes: stockChanges,
        at: new Date().toISOString(),
      });
    }

    return this.buildCheckoutResult(completeTicket!);
  }

  private async calculateETA(outletId: string, items: CartItem[], menus: Array<{ id: string; stationId: string; avgMakeSeconds: number }>): Promise<{ min: number; max: number }> {
    // Get current queue load per station
    const stationLoads = await this.prisma.subTicket.groupBy({
      by: ['stationId'],
      where: {
        ticket: { outletId, shift: { status: 'OPEN' } },
        status: { in: ['ORDERED', 'IN_PROGRESS'] },
      },
      _sum: { priorityScore: true },
      _count: true,
    });

    // Get station SLA
    const stations = await this.prisma.station.findMany({
      where: { outletId, isActive: true },
      select: { id: true, slaMinutes: true },
    });

    const stationSlaMap = new Map(stations.map((s: typeof stations[0]) => [s.id, s.slaMinutes]));

    let maxEta = 0;

    for (const item of items) {
      const menu = menus.find((m: typeof menus[0]) => m.id === item.menuId)!;
      const stationId = menu.stationId;
      const slaMinutes = Number(stationSlaMap.get(stationId) ?? 15);

      // Base time: avg make time * qty
      const baseTime = menu.avgMakeSeconds * item.qty / 60; // in minutes

      // Add queue load
      const load = stationLoads.find((l: typeof stationLoads[0]) => l.stationId === stationId);
      const queueTime = load ? load._count * 2 : 0; // Estimate 2 min per queued item

      const stationEta = baseTime + queueTime + slaMinutes;
      maxEta = Math.max(maxEta, stationEta);
    }

    // Add buffer (±30%)
    const min = Math.max(1, Math.round(maxEta * 0.7));
    const max = Math.round(maxEta * 1.3);

    return { min, max };
  }

  private buildCheckoutResult(ticket: any) {
    const cashPayments = ticket.payments.filter((p: any) => p.method === PaymentMethod.CASH);
    const cashTotal = cashPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
    const change = cashTotal > ticket.totalAmount ? cashTotal - ticket.totalAmount : 0;

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        etaMin: ticket.etaMin,
        etaMax: ticket.etaMax,
        totalAmount: ticket.totalAmount,
        subtickets: ticket.subtickets.map((st: any) => ({
          id: st.id,
          stationCode: st.station.code,
          stationName: st.station.name,
          status: st.status,
        })),
      },
      receipt: {
        outletName: ticket.shift?.outlet?.name || 'Order-Q',
        ticketNumber: ticket.ticketNumber,
        items: ticket.orderItems.map((oi: any) => ({
          name: oi.menu.name,
          qty: oi.qty,
          price: oi.priceSnapshot,
          subtotal: oi.priceSnapshot * oi.qty,
        })),
        subtotal: ticket.subtotal,
        taxAmount: ticket.taxAmount,
        serviceAmount: ticket.serviceAmount,
        discountAmount: ticket.discountAmount,
        total: ticket.totalAmount,
        payments: ticket.payments.map((p: any) => ({
          method: p.method,
          amount: p.amount,
        })),
        change: change > 0 ? change : undefined,
        timestamp: ticket.createdAt.toISOString(),
      },
    };
  }

  async validateDraft(outletId: string, items: CartItem[]) {
    const stockCheck = await this.stockService.checkAvailability(outletId, items);

    const menus = await this.prisma.menu.findMany({
      where: { id: { in: items.map((i) => i.menuId) } },
      include: { station: true },
    });

    let subtotal = 0;
    for (const item of items) {
      const menu = menus.find((m: typeof menus[0]) => m.id === item.menuId)!;
      subtotal += menu.price * item.qty;
    }

    // Estimate ETA
    const eta = await this.calculateETA(outletId, items, menus);

    return {
      valid: stockCheck.canFulfill,
      insufficientItems: stockCheck.insufficientItems,
      subtotal,
      eta,
    };
  }
}
