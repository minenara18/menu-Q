import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, TicketStatus as PrismaTicketStatus, SubTicketStatus as PrismaSubTicketStatus } from '@prisma/client';
import { TicketStatus, SubTicketStatus } from '@order-q/shared';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { StockService } from '../stock/stock.service';

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
  ) {}

  async findAll(outletId: string, query: {
    status?: TicketStatus;
    station?: string;
    q?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { outletId };

    if (query.status) where.status = query.status;
    if (query.station) where.subtickets = { some: { station: { code: query.station } } };
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

    return { tickets, total };
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

  async updateSubTicketStatus(outletId: string, subticketId: string, userId: string, userRole: string, dto: SubTicketStatusUpdate) {
    const subticket = await this.prisma.subTicket.findFirst({
      where: { id: subticketId, ticket: { outletId } },
      include: { ticket: true, station: true },
    });

    if (!subticket) {
      throw new NotFoundException('Sub-ticket not found');
    }

    // Check permissions: makers can only update their station
    if (userRole === 'maker') {
      // In real implementation, check if user is assigned to this station
      // For now, allow all makers to update any subticket
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
      await this.checkAndEmitTicketReady(outletId, subticket.ticketId);
    }

    return updated;
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

  async cancelTicket(outletId: string, ticketId: string, userId: string, dto: CancelTicketDto) {
    const ticket = await this.findById(outletId, ticketId);

    if ((ticket.status as TicketStatus) === TicketStatus.CANCELLED) {
      throw new BadRequestException('Ticket already cancelled');
    }

    if ((ticket.status as TicketStatus) === TicketStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed ticket');
    }

    // Verify manager PIN if ticket is paid
    const hasPaidPayments = ticket.payments.some((p: typeof ticket.payments[0]) => p.status === 'PAID');
    if (hasPaidPayments) {
      // In real implementation, verify against manager's PIN
      // For now, just check if PIN was provided
      if (!dto.managerPin || dto.managerPin.length !== 6) {
        throw new ForbiddenException('Manager PIN required for paid ticket cancellation');
      }
    }

    // Release stock if ticket was ordered
    if ((ticket.status as TicketStatus) === TicketStatus.ORDERED || (ticket.status as TicketStatus) === TicketStatus.IN_PROGRESS) {
      const items = ticket.orderItems.map((oi: typeof ticket.orderItems[0]) => ({ menuId: oi.menuId, qty: oi.qty }));
      await this.stockService.releaseStock(outletId, items, ticketId, userId);
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

    // Recalculate menu availability
    await this.prisma.menu.findMany({ where: { outletId } }).then((menus: any[]) => {
      // Trigger recalculation via service
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        outletId,
        actorId: userId,
        action: 'TICKET_CANCEL',
        entity: 'Ticket',
        entityId: ticketId,
        diff: { previousStatus: ticket.status, reason: dto.reason },
      },
    });

    this.websocketGateway.emitTicketUpdated(outletId, {
      ticketId: updated.id,
      status: updated.status,
      updatedFields: { status: 'CANCELLED' },
    });

    return updated;
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
      });
    }
  }
}