import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShiftStatus } from '@order-q/shared';
import { ManagerPinService } from '../auth/manager-pin.service';

interface OpenShiftDto {
  openingCash: number;
}

interface CloseShiftDto {
  countedCash: number;
  cashCounts: { denomination: number; count: number }[];
  varianceNote?: string;
  managerPin?: string;
  forceClose?: boolean; // Allow closing with open tickets
}

@Injectable()
export class ShiftsService {
  constructor(
    private prisma: PrismaService,
    private managerPin: ManagerPinService,
  ) {}

  async findCurrent(outletId: string) {
    return this.prisma.shift.findFirst({
      where: { outletId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      include: {
        openedByUser: { select: { id: true, name: true } },
        closedByUser: { select: { id: true, name: true } },
        cashCounts: true,
        _count: { select: { tickets: true } },
      },
    });
  }

  async findById(outletId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, outletId },
      include: {
        openedByUser: { select: { id: true, name: true } },
        closedByUser: { select: { id: true, name: true } },
        cashCounts: true,
        tickets: {
          include: {
            payments: true,
            orderItems: { include: { menu: true } },
          },
        },
        _count: { select: { tickets: true } },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found');
    }

    return shift;
  }

  async open(outletId: string, userId: string, dto: OpenShiftDto) {
    // Check if there's already an open shift
    const existingShift = await this.prisma.shift.findFirst({
      where: { outletId, status: 'OPEN' },
    });

    if (existingShift) {
      throw new ConflictException('There is already an open shift');
    }

    return this.prisma.shift.create({
      data: {
        outletId,
        openedBy: userId,
        openingCash: dto.openingCash,
        status: 'OPEN',
      },
      include: {
        openedByUser: { select: { id: true, name: true } },
      },
    });
  }

  async getSummary(outletId: string, shiftId: string) {
    const shift = await this.findById(outletId, shiftId);

    // Calculate expected cash: opening + cash payments - cash refunds
    const cashPayments = await this.prisma.payment.aggregate({
      where: {
        ticket: { shiftId },
        method: 'CASH',
        status: 'PAID',
      },
      _sum: { amount: true },
    });

    const cashRefunds = await this.prisma.payment.aggregate({
      where: {
        ticket: { shiftId },
        method: 'CASH',
        status: 'REFUNDED',
      },
      _sum: { amount: true },
    });

    const qrisPayments = await this.prisma.payment.aggregate({
      where: {
        ticket: { shiftId },
        method: 'QRIS',
        status: 'PAID',
      },
      _sum: { amount: true },
    });

    const expectedCash = shift.openingCash + (cashPayments._sum.amount || 0) - (cashRefunds._sum.amount || 0);

    return {
      shift: {
        id: shift.id,
        status: shift.status,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        openingCash: shift.openingCash,
        expectedCash,
        countedCash: shift.countedCash,
        variance: shift.variance,
        varianceNote: shift.varianceNote,
      },
      totals: {
        cash: cashPayments._sum.amount || 0,
        qris: qrisPayments._sum.amount || 0,
        refunds: cashRefunds._sum.amount || 0,
        tickets: shift._count?.tickets || 0,
      },
      tickets: shift.tickets,
    };
  }

  async close(outletId: string, shiftId: string, userId: string, dto: CloseShiftDto) {
    const shift = await this.findById(outletId, shiftId);

    if ((shift.status as ShiftStatus) === ShiftStatus.CLOSED) {
      throw new BadRequestException('Shift is already closed');
    }

    // Check for open tickets unless forceClose
    if (!dto.forceClose) {
      const openTickets = await this.prisma.ticket.count({
        where: {
          shiftId,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      });

      if (openTickets > 0) {
        throw new BadRequestException(`${openTickets} tickets are still open. Use forceClose to close anyway.`);
      }
    }

    // Calculate expected cash
    const cashPayments = await this.prisma.payment.aggregate({
      where: {
        ticket: { shiftId },
        method: 'CASH',
        status: 'PAID',
      },
      _sum: { amount: true },
    });

    const cashRefunds = await this.prisma.payment.aggregate({
      where: {
        ticket: { shiftId },
        method: 'CASH',
        status: 'REFUNDED',
      },
      _sum: { amount: true },
    });

    const expectedCash = shift.openingCash + (cashPayments._sum.amount || 0) - (cashRefunds._sum.amount || 0);
    const variance = dto.countedCash - expectedCash;

    // Check if variance exceeds threshold and requires manager PIN
    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    const threshold = outlet?.varianceThreshold || 10000;

    if (Math.abs(variance) > threshold) {
      if (!dto.managerPin) {
        throw new BadRequestException('Variance exceeds threshold. Manager PIN required.');
      }
      // Verifies against active OWNER PINs in the same outlet and writes an audit log entry.
      await this.managerPin.verify(outletId, dto.managerPin, {
        action: 'CLOSE_SHIFT_VARIANCE',
        entity: 'Shift',
        entityId: shiftId,
        actorId: userId,
      });
    }

    // Save cash counts
    await this.prisma.cashCount.deleteMany({ where: { shiftId } });
    await this.prisma.cashCount.createMany({
      data: dto.cashCounts.map((cc) => ({
        shiftId,
        denomination: cc.denomination,
        count: cc.count,
      })),
    });

    // Close shift
    const closedShift = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: userId,
        expectedCash,
        countedCash: dto.countedCash,
        variance,
        varianceNote: dto.varianceNote,
      },
      include: {
        cashCounts: true,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        outletId,
        actorId: userId,
        action: 'SHIFT_CLOSE',
        entity: 'Shift',
        entityId: shiftId,
        diff: {
          expectedCash,
          countedCash: dto.countedCash,
          variance,
          varianceNote: dto.varianceNote,
        },
      },
    });

    return closedShift;
  }
}