import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface UpdateOutletSettingsDto {
  name?: string;
  address?: string;
  phone?: string;
  taxRate?: number;
  serviceRate?: number;
  timezone?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  lowStockThreshold?: number;
  varianceThreshold?: number;
  partialReadyPolicy?: 'WAIT_ALL' | 'CALL_PER_STATION';
}

interface UpdateStationSettingsDto {
  slaMinutes?: number;
  isActive?: boolean;
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getOutletSettings(outletId: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
      include: {
        stations: { orderBy: { displayOrder: 'asc' } },
        categories: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } },
      },
    });

    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    const settings = await this.prisma.outletSetting.findMany({ where: { outletId } });
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    return {
      outlet: {
        id: outlet.id,
        name: outlet.name,
        address: outlet.address,
        phone: outlet.phone,
        taxRate: outlet.taxRate,
        serviceRate: outlet.serviceRate,
        currency: outlet.currency,
        timezone: outlet.timezone,
        receiptHeader: outlet.receiptHeader,
        receiptFooter: outlet.receiptFooter,
        lowStockThreshold: outlet.lowStockThreshold,
        varianceThreshold: outlet.varianceThreshold,
        partialReadyPolicy: outlet.partialReadyPolicy,
      },
      stations: outlet.stations,
      categories: outlet.categories,
      customSettings: Object.fromEntries(settingsMap),
    };
  }

  async updateOutletSettings(outletId: string, dto: UpdateOutletSettingsDto) {
    const outlet = await this.prisma.outlet.update({
      where: { id: outletId },
      data: dto,
    });

    return {
      id: outlet.id,
      name: outlet.name,
      address: outlet.address,
      phone: outlet.phone,
      taxRate: outlet.taxRate,
      serviceRate: outlet.serviceRate,
      currency: outlet.currency,
      timezone: outlet.timezone,
      receiptHeader: outlet.receiptHeader,
      receiptFooter: outlet.receiptFooter,
      lowStockThreshold: outlet.lowStockThreshold,
      varianceThreshold: outlet.varianceThreshold,
      partialReadyPolicy: outlet.partialReadyPolicy,
    };
  }

  async updateStationSettings(outletId: string, stationId: string, dto: UpdateStationSettingsDto) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, outletId },
    });

    if (!station) {
      throw new NotFoundException('Station not found');
    }

    return this.prisma.station.update({
      where: { id: stationId },
      data: dto,
    });
  }

  async setCustomSetting(outletId: string, key: string, value: any) {
    return this.prisma.outletSetting.upsert({
      where: { outletId_key: { outletId, key } },
      update: { value },
      create: { outletId, key, value },
    });
  }

  async getCustomSetting(outletId: string, key: string) {
    const setting = await this.prisma.outletSetting.findUnique({
      where: { outletId_key: { outletId, key } },
    });
    return setting?.value;
  }
}