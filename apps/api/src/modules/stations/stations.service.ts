import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StationCode } from '@order-q/shared';
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

  async ensureDefaults(outletId: string) {
    const existing = await this.prisma.station.findMany({ where: { outletId } });
    const existingCodes = new Set(existing.map((s) => s.code));

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