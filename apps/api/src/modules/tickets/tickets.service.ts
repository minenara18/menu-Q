import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, TicketStatus as PrismaTicketStatus, SubTicketStatus as PrismaSubTicketStatus } from '@prisma/client';
import { TicketStatus, SubTicketStatus } from '@order-q/shared';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { StockService } from '../stock/stock.service';
import { MenusService } from '../menus/menus.service';
import { ManagerPinService } from '../auth/manager-pin.service';
import { OrdersService } from '../orders/orders.service';
import {
  DEFAULT_MAKE_SECONDS,
  computePriorityScore,
  nextEma,
  orderQueue,
} from '../../common/queue/queue-math';
import { buildReceiptData } from '../../common/receipt/receipt-data';
import {
  escPosBase64,
  renderKitchenSlip,
  renderReceiptText,
  type PaperWidth,
} from '../../common/receipt/receipt-renderer';

interface ActingUser {
  id: string;
  role: string;
  stationId?: string | null;
  stationIds?: string[];
}

interface SubTicketStatusUpdate {
  status: SubTicketStatus;
}

interface TicketStatusUpdate {
  status: TicketStatus;
}

interface CancelTicketDto {
  managerPin: string;
  reason: string;
}

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
    private stockService: StockService,
    private menusService: MenusService,
    private managerPin: ManagerPinService,
    private ordersService: OrdersService,
  ) {}

  async findAll(outletId: string, query: {
    status?: TicketStatus;
    station?: string;
    q?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }, user?: ActingUser) {
    const where: any = { outletId };

    if (query.status) where.status = query.status;

    const subticketFilter: any = {};
    if (query.station) subticketFilter.station = { code: query.station };
    // Makers only see tickets that contain work for any of their stations.
    if (user?.role === 'MAKER') {
      const stationIds = user.stationIds?.length
        ? user.stationIds
        : user.stationId
          ? [user.stationId]
          : [];
      if (stationIds.length === 0) {
        throw new ForbiddenException('Maker is not assigned to a station');
      }
      subticketFilter.stationId = { in: stationIds };
    }
    if (Object.keys(subticketFilter).length > 0) {
      where.subtickets = { some: subticketFilter };
    }
    if (query.q) {
      where.OR = [
        { ticketNumber: { contains: query.q, mode: 'insensitive' } },
        { customerName: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = query.dateFrom;
      if (query.dateTo) where.createdAt.lte = query.dateTo;
    }

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          subtickets: { include: { station: true } },
          orderItems: { include: { menu: true } },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    await this.attachPriorityMetadata(outletId, tickets);

    return { tickets, total };
  }

  /**
   * Attach transparent priority ordering (score + short reason + rank) to the
   * active subtickets of the returned tickets. Ranks are per station.
   */
  private async attachPriorityMetadata(outletId: string, tickets: any[]) {
    const activeSubtickets = await this.prisma.subTicket.findMany({
      where: { ticket: { outletId }, status: { in: ['ORDERED', 'IN_PROGRESS'] } },
      include: { station: true },
    });

    const byStation = new Map<string, typeof activeSubtickets>();
    for (const subticket of activeSubtickets) {
      const list = byStation.get(subticket.stationId) ?? [];
      list.push(subticket);
      byStation.set(subticket.stationId, list);
    }

    const rankedById = new Map<string, { score: number; reason: string; rank: number }>();
    for (const list of byStation.values()) {
      const ranked = orderQueue(
        list.map((subticket: typeof activeSubtickets[number]) => ({
          id: subticket.id,
          stationId: subticket.stationId,
          createdAtMs: subticket.createdAt.getTime(),
          slaSeconds: subticket.station.slaMinutes * 60,
          priorityBump: subticket.priorityBump ?? 0,
        })),
        Date.now(),
      );
      for (const item of ranked) {
        rankedById.set(item.entry.id, { score: item.score, reason: item.reason, rank: item.rank });
      }
    }

    for (const ticket of tickets) {
      for (const subticket of ticket.subtickets ?? []) {
        const ranked = rankedById.get(subticket.id);
        if (ranked) {
          subticket.priority = ranked;
          subticket.priorityReason = ranked.reason;
        }
      }
      ticket.subtickets?.sort(
        (a: { priority?: { score: number } }, b: { priority?: { score: number } }) =>
          (a.priority?.score ?? 0) - (b.priority?.score ?? 0),
      );
      const best = ticket.subtickets?.find((s: { priority?: { score: number; reason: string } }) => s.priority);
      if (best) {
        ticket.priorityReason = best.priority.reason;
        ticket.priorityScore = best.priority.score;
      }
    }

    tickets.sort(
      (a: { priorityScore?: number }, b: { priorityScore?: number }) =>
        (a.priorityScore ?? Number.MAX_SAFE_INTEGER) - (b.priorityScore ?? Number.MAX_SAFE_INTEGER),
    );
  }

  async findById(outletId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, outletId },
      include: {
        subtickets: { include: { station: true, orderItems: { include: { menu: true } } } },
        orderItems: { include: { menu: true } },
        payments: true,
        shift: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async updateSubTicketStatus(outletId: string, subticketId: string, userId: string, userRole: string, dto: SubTicketStatusUpdate, userStationId?: string | null, userStationIds?: string[]) {
    const subticket = await this.prisma.subTicket.findFirst({
      where: { id: subticketId, ticket: { outletId } },
      include: { ticket: true, station: true },
    });

    if (!subticket) {
      throw new NotFoundException('Sub-ticket not found');
    }

    // Makers can only update sub-tickets for one of their assigned stations.
    if (userRole === 'MAKER') {
      const stationIds = userStationIds?.length
        ? userStationIds
        : userStationId
          ? [userStationId]
          : [];
      if (stationIds.length === 0) {
        throw new ForbiddenException('Maker is not assigned to a station');
      }
      if (!stationIds.includes(subticket.stationId)) {
        throw new ForbiddenException('Maker hanya boleh mengupdate sub-tiket stasiunnya sendiri');
      }
    }

    const validTransitions: Record<SubTicketStatus, SubTicketStatus[]> = {
      [SubTicketStatus.ORDERED]: [SubTicketStatus.IN_PROGRESS, SubTicketStatus.CANCELLED],
      [SubTicketStatus.IN_PROGRESS]: [SubTicketStatus.READY, SubTicketStatus.ORDERED], // Allow undo
      [SubTicketStatus.READY]: [SubTicketStatus.IN_PROGRESS], // Allow undo
      [SubTicketStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[subticket.status as SubTicketStatus]?.includes(dto.status);
    if (!allowed) {
      throw new BadRequestException(`Invalid status transition from ${subticket.status} to ${dto.status}`);
    }

    const updated = await this.prisma.subTicket.update({
      where: { id: subticketId },
      data: {
        status: dto.status as unknown as PrismaSubTicketStatus,
        startedAt: dto.status === SubTicketStatus.IN_PROGRESS && !subticket.startedAt ? new Date() : subticket.startedAt,
        readyAt: dto.status === SubTicketStatus.READY ? new Date() : subticket.readyAt,
      },
      include: { station: true, ticket: true },
    });

    // Update aggregate ticket status
    await this.updateAggregateTicketStatus(subticket.ticketId);

    // Emit WebSocket event
    this.websocketGateway.emitSubTicketUpdated(outletId, {
      subticketId: updated.id,
      ticketId: updated.ticketId,
      stationId: updated.stationId,
      status: updated.status,
      startedAt: updated.startedAt,
      readyAt: updated.readyAt,
    });

    // If all subtickets ready, emit ticket ready event
    if (dto.status === SubTicketStatus.READY) {
      // Learn the real make time from this subticket, then refresh the ticket ETA.
      await this.learnMakeTime(updated);
      await this.ordersService.recalculateTicketEta(outletId, updated.ticketId);
      this.websocketGateway.emitStationQueueUpdated(outletId, {
        outletId,
        stationId: updated.stationId,
        subticketId: updated.id,
        ticketId: updated.ticketId,
        reason: 'SUBTICKET_READY',
      });
      await this.checkAndEmitTicketReady(outletId, subticket.ticketId);
    }

    return updated;
  }

  /**
   * Update each menu's avgMakeSeconds with an EMA of the subticket duration
   * (ready_at - started_at). The sample count is persisted so the category
   * fallback is used until MIN_SAMPLE_COUNT real observations exist.
   */
  private async learnMakeTime(subticket: { id: string; startedAt: Date | null; readyAt: Date | null }) {
    if (!subticket.startedAt || !subticket.readyAt) return;

    const sampleSeconds = Math.max(
      0,
      (subticket.readyAt.getTime() - subticket.startedAt.getTime()) / 1000,
    );

    const orderItems = await this.prisma.orderItem.findMany({
      where: { subticketId: subticket.id },
      include: { menu: { include: { category: true } } },
    });

    const seen = new Set<string>();
    for (const orderItem of orderItems) {
      if (seen.has(orderItem.menuId)) continue;
      seen.add(orderItem.menuId);

      const menu = orderItem.menu;
      const fallback = menu.category?.defaultMakeSeconds ?? DEFAULT_MAKE_SECONDS;
      const previous = menu.avgMakeSeconds > 0 ? menu.avgMakeSeconds : fallback;
      const count = menu.makeSampleCount ?? 0;
      const next = nextEma(previous, sampleSeconds, count);

      await this.prisma.menu.update({
        where: { id: menu.id },
        data: {
          avgMakeSeconds: Math.round(next),
          makeSampleCount: { increment: 1 },
        },
      });
    }
  }

  async updateTicketStatus(outletId: string, ticketId: string, userId: string, dto: TicketStatusUpdate) {
    const ticket = await this.findById(outletId, ticketId);

    const validTransitions: Record<TicketStatus, TicketStatus[]> = {
      [TicketStatus.DRAFT]: [TicketStatus.PENDING_PAYMENT, TicketStatus.CANCELLED],
      [TicketStatus.PENDING_PAYMENT]: [TicketStatus.ORDERED, TicketStatus.CANCELLED],
      [TicketStatus.ORDERED]: [TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED],
      [TicketStatus.IN_PROGRESS]: [TicketStatus.READY, TicketStatus.CANCELLED],
      [TicketStatus.READY]: [TicketStatus.COMPLETED, TicketStatus.IN_PROGRESS],
      [TicketStatus.COMPLETED]: [],
      [TicketStatus.CANCELLED]: [],
    };

    const allowed = validTransitions[ticket.status as TicketStatus]?.includes(dto.status);
    if (!allowed) {
      throw new BadRequestException(`Invalid status transition from ${ticket.status} to ${dto.status}`);
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: dto.status as unknown as PrismaTicketStatus },
      include: { subtickets: { include: { station: true } } },
    });

    this.websocketGateway.emitTicketUpdated(outletId, {
      ticketId: updated.id,
      status: updated.status,
      updatedFields: { status: dto.status },
    });

    return updated;
  }

  async completeTicket(outletId: string, ticketId: string, userId: string) {
    const ticket = await this.findById(outletId, ticketId);

    // Check if all subtickets are ready (based on outlet policy)
    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    const policy = outlet?.partialReadyPolicy || 'WAIT_ALL';

    if (policy === 'WAIT_ALL') {
      const notReady = ticket.subtickets.filter((st: typeof ticket.subtickets[0]) => st.status !== 'READY');
      if (notReady.length > 0) {
        throw new BadRequestException('Not all subtickets are ready');
      }
    }

    return this.updateTicketStatus(outletId, ticketId, userId, { status: TicketStatus.COMPLETED });
  }

  async cancelTicket(outletId: string, ticketId: string, userId: string, dto: CancelTicketDto, opts?: { system?: boolean; ip?: string }) {
    const ticket = await this.findById(outletId, ticketId);

    if ((ticket.status as TicketStatus) === TicketStatus.CANCELLED) {
      throw new BadRequestException('Ticket already cancelled');
    }

    if ((ticket.status as TicketStatus) === TicketStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed ticket');
    }

    // Verify manager PIN if ticket is paid and this is a user-initiated cancellation
    const hasPaidPayments = ticket.payments.some((p: typeof ticket.payments[0]) => p.status === 'PAID');
    if (hasPaidPayments && !opts?.system) {
      await this.managerPin.verify(outletId, dto.managerPin, {
        action: 'CANCEL_PAID_TICKET',
        entity: 'Ticket',
        entityId: ticketId,
        actorId: userId,
      }, opts?.ip ?? '');
    }

    // Release stock if ticket was ordered
    // StockMove.createdBy is an FK to User, so system-initiated refunds attribute to the shift opener
    const stockActorId = userId === 'system' ? (ticket.shift?.openedBy ?? userId) : userId;
    if ((ticket.status as TicketStatus) === TicketStatus.ORDERED || (ticket.status as TicketStatus) === TicketStatus.IN_PROGRESS) {
      const items = ticket.orderItems.map((oi: typeof ticket.orderItems[0]) => ({ menuId: oi.menuId, qty: oi.qty }));
      const changes = await this.stockService.releaseStock(outletId, items, ticketId, stockActorId);
      if (changes.length > 0) {
        this.websocketGateway.emitStockChanged(outletId, {
          outletId,
          reason: 'REFUND',
          ticketId,
          changes,
          at: new Date().toISOString(),
        });
      }
    }

    // Update payments to refunded
    await this.prisma.payment.updateMany({
      where: { ticketId, status: 'PAID' },
      data: { status: 'REFUNDED' },
    });

    // Cancel all subtickets
    await this.prisma.subTicket.updateMany({
      where: { ticketId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    });

    const updated = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'CANCELLED' },
      include: { subtickets: true, payments: true },
    });

    // Recalculate menu availability now that stock was released
    await this.menusService.recalculateAvailability(outletId);

    // Audit log (system actions have no user actor)
    await this.prisma.auditLog.create({
      data: {
        outletId,
        actorId: userId === 'system' ? null : userId,
        action: 'TICKET_CANCEL',
        entity: 'Ticket',
        entityId: ticketId,
        diff: { previousStatus: ticket.status, reason: dto.reason, system: userId === 'system' ? true : undefined },
      },
    });

    this.websocketGateway.emitTicketUpdated(outletId, {
      ticketId: updated.id,
      status: updated.status,
      updatedFields: { status: 'CANCELLED' },
    });

    return updated;
  }

  /** Structured receipt data + rendered text/ESC-POS, from one canonical builder. */
  async getReceipt(outletId: string, id: string, width: PaperWidth = 32) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, outletId },
      include: {
        shift: {
          include: {
            outlet: true,
            openedByUser: { select: { id: true, name: true } },
          },
        },
        orderItems: { include: { menu: true } },
        payments: true,
        subtickets: {
          include: { station: true, orderItems: { include: { menu: true } } },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const receipt = buildReceiptData(ticket);
    const text = renderReceiptText(receipt, width);
    const kitchenSlips = ticket.subtickets.map((subticket) => ({
      subticketId: subticket.id,
      stationCode: subticket.station.code,
      lines: renderKitchenSlip(
        {
          ticketNumber: ticket.ticketNumber,
          stationCode: subticket.station.code,
          stationName: subticket.station.name,
          at: receipt.date,
          items: subticket.orderItems.map((oi) => ({
            name: oi.menu.name,
            qty: oi.qty,
            note: oi.note,
          })),
        },
        width,
      ),
    }));

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        etaMin: ticket.etaMin,
        etaMax: ticket.etaMax,
      },
      receipt,
      text,
      escpos: escPosBase64(text),
      kitchenSlips,
    };
  }

  /** Reprint is audited so every extra print is attributable. */
  async reprint(outletId: string, id: string, userId: string, width: PaperWidth = 32) {
    const data = await this.getReceipt(outletId, id, width);

    await this.prisma.auditLog.create({
      data: {
        outletId,
        actorId: userId,
        action: 'TICKET_REPRINT',
        entity: 'Ticket',
        entityId: id,
        diff: { ticketNumber: data.receipt.ticketNumber, width },
      },
    });

    return {
      success: true,
      ticketNumber: data.receipt.ticketNumber,
      text: data.text,
      escpos: data.escpos,
    };
  }

  /** Manual maker bump: raises a subticket's priority and writes an audit log. */
  async bumpSubticket(
    outletId: string,
    subticketId: string,
    userId: string,
    userRole: string,
    userStationId: string | null,
    reason?: string,
    userStationIds?: string[],
  ) {
    const subticket = await this.prisma.subTicket.findFirst({
      where: { id: subticketId, ticket: { outletId } },
      include: { station: true, ticket: true },
    });

    if (!subticket) {
      throw new NotFoundException('Sub-ticket not found');
    }

    if (userRole === 'MAKER') {
      const stationIds = userStationIds?.length
        ? userStationIds
        : userStationId
          ? [userStationId]
          : [];
      if (!stationIds.includes(subticket.stationId)) {
        throw new ForbiddenException('Maker hanya boleh mengubah sub-tiket stasiunnya sendiri');
      }
    }

    const updated = await this.prisma.subTicket.update({
      where: { id: subticket.id },
      data: { priorityBump: { increment: 1 } },
      include: { station: true, ticket: true },
    });

    await this.prisma.auditLog.create({
      data: {
        outletId,
        actorId: userId,
        action: 'SUBTICKET_PRIORITY_BUMP',
        entity: 'SubTicket',
        entityId: subticket.id,
        diff: {
          reason: reason ?? '',
          newBump: updated.priorityBump,
          ticketId: subticket.ticketId,
        },
      },
    });

    const { score, reason: priorityReason } = computePriorityScore({
      createdAtMs: updated.createdAt.getTime(),
      slaSeconds: updated.station.slaMinutes * 60,
      nowMs: Date.now(),
      priorityBump: updated.priorityBump,
    });

    this.websocketGateway.emitStationQueueUpdated(outletId, {
      outletId,
      stationId: updated.stationId,
      subticketId: updated.id,
      ticketId: updated.ticketId,
      reason: 'PRIORITY_BUMP',
    });

    return { ...updated, priority: { score, reason: priorityReason } };
  }

  private async updateAggregateTicketStatus(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { subtickets: true },
    });

    if (!ticket) return;

    let newStatus: string = ticket.status;

    // Determine aggregate status from subtickets
    const statuses = ticket.subtickets.map((st: typeof ticket.subtickets[0]) => st.status);

    if (statuses.every((s: typeof statuses[0]) => s === 'READY')) {
      newStatus = 'READY';
    } else if (statuses.some((s: typeof statuses[0]) => s === 'IN_PROGRESS')) {
      newStatus = 'IN_PROGRESS';
    } else if (statuses.every((s: typeof statuses[0]) => s === 'CANCELLED')) {
      newStatus = 'CANCELLED';
    } else if (statuses.some((s: typeof statuses[0]) => s === 'ORDERED')) {
      newStatus = 'ORDERED';
    }

    if (newStatus !== ticket.status) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: newStatus as unknown as PrismaTicketStatus },
      });
    }
  }

  private async checkAndEmitTicketReady(outletId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { subtickets: true },
    });

    if (!ticket) return;

    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    const policy = outlet?.partialReadyPolicy || 'WAIT_ALL';

    let isReady = false;
    if (policy === 'CALL_PER_STATION') {
      isReady = ticket.subtickets.some((st: typeof ticket.subtickets[0]) => st.status === 'READY');
    } else {
      isReady = ticket.subtickets.every((st: typeof ticket.subtickets[0]) => st.status === 'READY');
    }

    if (isReady && (ticket.status as TicketStatus) !== TicketStatus.READY && (ticket.status as TicketStatus) !== TicketStatus.COMPLETED) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'READY' },
      });

      this.websocketGateway.emitTicketReady(outletId, {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        orderType: ticket.orderType,
        status: 'READY',
        etaMin: ticket.etaMin,
        etaMax: ticket.etaMax,
      });
    }
  }
}