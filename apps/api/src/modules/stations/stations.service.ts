import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StationCode } from '@order-q/shared';
import { orderQueue } from '../../common/queue/queue-math';
import { v4 as uuidv4 } from 'uuid';

const STATION_DEFAULTS: Record<StationCode, { name: string; color: string; slaMinutes: number }> = {
  BAR: { name: 'Bar', color: '#2563EB', slaMinutes: 10 },
  KITCHEN: { name: 'Dapur', color: '#EA580C', slaMinutes: 20 },
  PASTRY: { name: 'Pastry', color: '#9333EA', slaMinutes: 15 },
};

interface CreateStationDto {
  code: StationCode;
  name?: string;
  displayOrder?: number;
  slaMinutes?: number;
}

interface UpdateStationDto {
  name?: string;
  displayOrder?: number;
  slaMinutes?: number;
  isActive?: boolean;
  color?: string;
}

@Injectable()
export class StationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(outletId: string) {
    return this.prisma.station.findMany({
      where: { outletId },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
      include: { _count: { select: { menus: true, subtickets: true } } },
    });
  }

  async findById(outletId: string, id: string) {
    const station = await this.prisma.station.findFirst({
      where: { id, outletId },
      include: { _count: { select: { menus: true, subtickets: true } } },
    });

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    return station;
  }

  async create(outletId: string, dto: CreateStationDto) {
    const existing = await this.prisma.station.findFirst({
      where: { outletId, code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Station ${dto.code} already exists for this outlet`);
    }

    const defaults = STATION_DEFAULTS[dto.code];
    const maxOrder = await this.prisma.station.aggregate({
      where: { outletId },
      _max: { displayOrder: true },
    });

    return this.prisma.station.create({
      data: {
        outletId,
        code: dto.code,
        name: dto.name ?? defaults.name,
        color: defaults.color,
        slaMinutes: dto.slaMinutes ?? defaults.slaMinutes,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });
  }

  async update(outletId: string, id: string, dto: UpdateStationDto) {
    await this.findById(outletId, id);
    return this.prisma.station.update({
      where: { id },
      data: dto,
    });
  }

  async delete(outletId: string, id: string) {
    await this.findById(outletId, id);

    const menuCount = await this.prisma.menu.count({ where: { stationId: id } });
    if (menuCount > 0) {
      throw new ConflictException('Cannot delete station with existing menus');
    }

    await this.prisma.station.delete({ where: { id } });
    return { success: true };
  }

  /** Ordered, transparent priority queue for one station. */
  async getQueue(outletId: string, stationId: string) {
    const station = await this.prisma.station.findFirst({ where: { id: stationId, outletId } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const active = await this.prisma.subTicket.findMany({
      where: { stationId, status: { in: ['ORDERED', 'IN_PROGRESS'] } },
      include: {
        ticket: { select: { ticketNumber: true, customerName: true, orderType: true } },
        orderItems: { include: { menu: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const byId = new Map(active.map((subticket: typeof active[number]) => [subticket.id, subticket]));
    const ranked = orderQueue(
      active.map((subticket: typeof active[number]) => ({
        id: subticket.id,
        stationId: subticket.stationId,
        createdAtMs: subticket.createdAt.getTime(),
        slaSeconds: station.slaMinutes * 60,
        priorityBump: subticket.priorityBump ?? 0,
      })),
      Date.now(),
    );

    return ranked.map((item) => {
      const subticket = byId.get(item.entry.id)!;
      return {
        subticketId: subticket.id,
        ticketId: subticket.ticketId,
        ticketNumber: subticket.ticket?.ticketNumber,
        customerName: subticket.ticket?.customerName,
        status: subticket.status,
        rank: item.rank,
        score: item.score,
        reason: item.reason,
        items: subticket.orderItems.map(
          (orderItem: typeof subticket.orderItems[number]) => ({
            name: orderItem.menu.name,
            qty: orderItem.qty,
            note: orderItem.note,
          }),
        ),
      };
    });
  }

  async ensureDefaults(outletId: string) {
    const existing = await this.prisma.station.findMany({ where: { outletId } });
    const existingCodes = new Set(existing.map((s: typeof existing[0]) => s.code));

    for (const code of Object.values(StationCode)) {
      if (!existingCodes.has(code)) {
        const defaults = STATION_DEFAULTS[code];
        const maxOrder = await this.prisma.station.aggregate({
          where: { outletId },
          _max: { displayOrder: true },
        });
        await this.prisma.station.create({
          data: {
            outletId,
            code,
            name: defaults.name,
            color: defaults.color,
            slaMinutes: defaults.slaMinutes,
            displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
          },
        });
      }
    }

    return this.findAll(outletId);
  }
}