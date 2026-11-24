import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { MenusService } from '../menus/menus.service';
import { ShiftsService } from '../shifts/shifts.service';
import { Prisma, OrderType as PrismaOrderType, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { PaymentMethod, PaymentStatus, TicketStatus, SubTicketStatus, OrderType } from '@order-q/shared';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import {
  DEFAULT_MAKE_SECONDS,
  estimateStationEtaSeconds,
  estimateTicketEta,
  resolveAvgMakeSeconds,
} from '../../common/queue/queue-math';
import { applyDiscount, calcTotals } from '../../common/money';
import { buildReceiptData } from '../../common/receipt/receipt-data';

/** Minimal menu shape needed for ETA computation. */
interface EtaMenu {
  id: string;
  stationId: string;
  avgMakeSeconds: number;
  makeSampleCount?: number;
  category?: { defaultMakeSeconds?: number } | null;
}

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

    const requestHash = this.hashRequest(dto);

    // Per-outlet idempotency record carrying a hash of the request body.
    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { outletId_key: { outletId, key: dto.idempotencyKey } },
    });

    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'Idempotency-Key sudah dipakai dengan isi request yang berbeda',
        );
      }
      if (existingKey.ticketId) {
        const existingTicket = await this.prisma.ticket.findFirst({
          where: { id: existingKey.ticketId, outletId },
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
    }

    // Legacy support: keys created before the IdempotencyKey table existed are
    // still found on the first payment row. Checked only when no new record exists.
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

    // Get active shift
    const shift = await this.shiftsService.findById(outletId, shiftId);
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('Shift is not open');
    }

    // Validate items and get menu details
    const menuIds = dto.items.map((i) => i.menuId);
    const menus = await this.prisma.menu.findMany({
      where: { id: { in: menuIds }, outletId },
      include: { recipeLines: { include: { ingredient: true } }, station: true, category: true },
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

    // Calculate totals (single source of truth: common/money.ts, integer rupiah + bps)
    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    const taxBps = outlet?.taxRate ?? 1100;
    const serviceBps = outlet?.serviceRate ?? 500;

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

    const { tax: taxAmount, service: serviceAmount } = calcTotals(subtotal, taxBps, serviceBps);

    // Validate the optional ticket-level discount; the math lives in common/money.ts.
    if (dto.discount) {
      const { type, value } = dto.discount;
      if (type === 'percent') {
        if (typeof value !== 'number' || value < 0 || value > 100) {
          throw new BadRequestException('Discount percent must be between 0 and 100');
        }
      } else if (type === 'amount') {
        if (typeof value !== 'number' || value < 0) {
          throw new BadRequestException('Discount amount must be non-negative');
        }
      } else {
        throw new BadRequestException('Discount type must be "amount" or "percent"');
      }
    }

    const { discountAmount, total: totalAmount } = applyDiscount(
      subtotal,
      taxAmount,
      serviceAmount,
      dto.discount,
    );

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
    const eta = await this.computeEtaForItems(outletId, dto.items, menus);

    let stockChanges: Array<{ ingredientId: string; qtyDelta: number }> = [];

    const runCheckout = async () => this.prisma.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      // Serialize checkouts per shift so dailyNo allocation is race-free
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${outletId} || ':' || ${shiftId}))`;

      // Claim the idempotency key inside the transaction (unique per outlet).
      await tx.idempotencyKey.create({
        data: {
          outletId,
          key: dto.idempotencyKey,
          requestHash,
        },
      });

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

      // Link the claimed idempotency key to the created ticket.
      await tx.idempotencyKey.update({
        where: { outletId_key: { outletId, key: dto.idempotencyKey } },
        data: { ticketId: ticket.id },
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
        // Check the new per-outlet key first so a different body yields 422.
        const existingKey = await this.prisma.idempotencyKey.findUnique({
          where: { outletId_key: { outletId, key: dto.idempotencyKey } },
        });
        if (existingKey) {
          if (existingKey.requestHash !== requestHash) {
            throw new UnprocessableEntityException(
              'Idempotency-Key sudah dipakai dengan isi request yang berbeda',
            );
          }
          if (existingKey.ticketId) {
            const existingTicket = await this.prisma.ticket.findFirst({
              where: { id: existingKey.ticketId, outletId },
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
        }
        // Legacy key from before the IdempotencyKey table existed.
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
    this.websocketGateway.emitStationQueueUpdated(outletId, {
      outletId,
      ticketId: result.id,
      reason: 'TICKET_CREATED',
    });
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

  /**
   * Remaining work (seconds) per station for all active subtickets in the
   * outlet's open shift. Work = Σ(resolved make time × qty) over order items.
   */
  private async getQueueWorkByStation(outletId: string): Promise<{ work: Map<string, number>; activeCount: number }> {
    const activeSubtickets = await this.prisma.subTicket.findMany({
      where: {
        ticket: { outletId, shift: { status: 'OPEN' } },
        status: { in: ['ORDERED', 'IN_PROGRESS'] },
      },
      include: {
        orderItems: { include: { menu: { include: { category: true } } } },
      },
    });

    const work = new Map<string, number>();
    for (const subticket of activeSubtickets) {
      let subticketWork = 0;
      for (const orderItem of subticket.orderItems) {
        const menu = orderItem.menu;
        const fallback = menu.category?.defaultMakeSeconds ?? DEFAULT_MAKE_SECONDS;
        const avg = resolveAvgMakeSeconds(menu.avgMakeSeconds, menu.makeSampleCount ?? 0, fallback);
        subticketWork += avg * orderItem.qty;
      }
      work.set(subticket.stationId, (work.get(subticket.stationId) ?? 0) + subticketWork);
    }

    return { work, activeCount: activeSubtickets.length };
  }

  /** ETA for a prospective order (checkout / validate). */
  async computeEtaForItems(outletId: string, items: CartItem[], menus: EtaMenu[]): Promise<{ min: number; max: number }> {
    const { work: queueWork, activeCount } = await this.getQueueWorkByStation(outletId);

    const newWork = new Map<string, number>();
    for (const item of items) {
      const menu = menus.find((m) => m.id === item.menuId)!;
      const fallback = menu.category?.defaultMakeSeconds ?? DEFAULT_MAKE_SECONDS;
      const avg = resolveAvgMakeSeconds(menu.avgMakeSeconds, menu.makeSampleCount ?? 0, fallback);
      newWork.set(menu.stationId, (newWork.get(menu.stationId) ?? 0) + avg * item.qty);
    }

    // Only stations involved in this order affect its ETA; other stations are
    // independent queues, so a big ticket elsewhere never blocks this one.
    const stationEtas = [...newWork.keys()].map((stationId) =>
      estimateStationEtaSeconds(queueWork.get(stationId) ?? 0, newWork.get(stationId) ?? 0),
    );

    // Congestion is measured over the stations involved in this order.
    const involved = new Set(newWork.keys());
    const activeInStations = [...queueWork.keys()]
      .filter((stationId) => involved.has(stationId))
      .length;
    const { min, max } = estimateTicketEta(stationEtas, activeInStations);

    return { min, max };
  }

  /** Recompute and persist a ticket's ETA after its queue changes. */
  async recalculateTicketEta(outletId: string, ticketId: string): Promise<{ ticketId: string; ticketNumber: string; etaMin: number; etaMax: number } | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        subtickets: {
          include: {
            orderItems: { include: { menu: { include: { category: true } } } },
          },
        },
      },
    });

    if (!ticket || ticket.outletId !== outletId) return null;

    const active = ticket.subtickets.filter(
      (st: typeof ticket.subtickets[number]) => st.status === 'ORDERED' || st.status === 'IN_PROGRESS',
    );

    const workByStation = new Map<string, number>();
    for (const subticket of active) {
      let subticketWork = 0;
      for (const orderItem of subticket.orderItems) {
        const menu = orderItem.menu;
        const fallback = menu.category?.defaultMakeSeconds ?? DEFAULT_MAKE_SECONDS;
        const avg = resolveAvgMakeSeconds(menu.avgMakeSeconds, menu.makeSampleCount ?? 0, fallback);
        subticketWork += avg * orderItem.qty;
      }
      workByStation.set(subticket.stationId, (workByStation.get(subticket.stationId) ?? 0) + subticketWork);
    }

    const { min, max } = estimateTicketEta([...workByStation.values()], active.length);

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { etaMin: min, etaMax: max },
    });

    const event = { ticketId, ticketNumber: ticket.ticketNumber, etaMin: min, etaMax: max };
    this.websocketGateway.emitTicketEtaUpdated(outletId, event);
    return event;
  }

  /** Deterministic hash of the checkout payload (excluding the key itself). */
  private hashRequest(dto: CheckoutDto): string {
    const canonical = {
      items: dto.items.map((i) => ({ menuId: i.menuId, qty: i.qty, note: i.note ?? null })),
      customerName: dto.customerName ?? null,
      orderType: dto.orderType,
      tableNumber: dto.tableNumber ?? null,
      payments: dto.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        splitGroupId: p.splitGroupId ?? null,
      })),
      discount: dto.discount ?? null,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private buildCheckoutResult(ticket: any) {
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
      receipt: buildReceiptData(ticket),
    };
  }

  async validateDraft(outletId: string, items: CartItem[]) {
    const stockCheck = await this.stockService.checkAvailability(outletId, items);

    const menus = await this.prisma.menu.findMany({
      where: { id: { in: items.map((i) => i.menuId) } },
      include: { station: true, category: true },
    });

    let subtotal = 0;
    for (const item of items) {
      const menu = menus.find((m: typeof menus[0]) => m.id === item.menuId)!;
      subtotal += menu.price * item.qty;
    }

    // Estimate ETA
    const eta = await this.computeEtaForItems(outletId, items, menus);

    return {
      valid: stockCheck.canFulfill,
      insufficientItems: stockCheck.insufficientItems,
      subtotal,
      eta,
    };
  }
}
