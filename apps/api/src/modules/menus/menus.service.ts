import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MenuAvailability } from '@order-q/shared';
import { Prisma, MenuAvailability as PrismaMenuAvailability } from '@prisma/client';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { v4 as uuidv4 } from 'uuid';

interface CreateMenuDto {
  categoryId: string;
  stationId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string | null;
  displayOrder?: number;
  avgMakeSeconds?: number;
}

interface UpdateMenuDto {
  categoryId?: string;
  stationId?: string;
  name?: string;
  description?: string;
  price?: number;
  imageUrl?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  avgMakeSeconds?: number;
}

export interface MenuWithPortion {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  categoryId: string;
  stationId: string;
  stationCode: string;
  stationColor: string;
  categoryName: string;
  avgMakeSeconds: number;
  availability: MenuAvailability;
  maxPortion: number | null;
  isActive: boolean;
  displayOrder: number;
}

@Injectable()
export class MenusService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
  ) {}

  async findAll(outletId: string, query: {
    station?: string;
    categoryId?: string;
    q?: string;
    isActive?: boolean;
  }) {
    const where: any = { outletId };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.station) {
      where.station = { code: query.station };
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.q) {
      where.name = { contains: query.q, mode: 'insensitive' };
    }

    const menus = await this.prisma.menu.findMany({
      where,
      include: {
        category: true,
        station: true,
        recipeLines: {
          include: { ingredient: true },
        },
      },
      orderBy: [
        { station: { displayOrder: 'asc' } },
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return menus.map((menu: typeof menus[0]) => this.enrichMenuWithPortion(menu));
  }

  async findById(outletId: string, id: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id, outletId },
      include: {
        category: true,
        station: true,
        recipeLines: {
          include: { ingredient: true },
        },
      },
    });

    if (!menu) {
      throw new NotFoundException('Menu not found');
    }

    return this.enrichMenuWithPortion(menu);
  }

  private enrichMenuWithPortion(menu: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
    categoryId: string;
    stationId: string;
    avgMakeSeconds: number;
    availability: string;
    isActive: boolean;
    displayOrder: number;
    category?: { name: string } | null;
    station?: { code: string; color: string } | null;
    recipeLines?: Array<{
      ingredient: { currentQty: number; minThreshold: number };
      qtyPerPortion: number;
    }>;
  }): MenuWithPortion {
    let maxPortion: number | null = null;
    let availability: MenuAvailability = menu.availability as MenuAvailability;

    if (menu.recipeLines && menu.recipeLines.length > 0) {
      const portions = menu.recipeLines.map((rl) => {
        if (rl.ingredient.currentQty <= 0 || rl.qtyPerPortion <= 0) return 0;
        return Math.floor(rl.ingredient.currentQty / rl.qtyPerPortion);
      });

      maxPortion = Math.min(...portions);

      if (maxPortion <= 0) {
        availability = MenuAvailability.UNAVAILABLE;
      } else if (maxPortion <= (menu.recipeLines[0]?.ingredient.minThreshold || 5)) {
        availability = MenuAvailability.LOW_STOCK;
      } else {
        availability = MenuAvailability.AVAILABLE;
      }
    }

    return {
      id: menu.id,
      name: menu.name,
      price: menu.price,
      imageUrl: menu.imageUrl,
      categoryId: menu.categoryId,
      stationId: menu.stationId,
      stationCode: menu.station?.code ?? '',
      stationColor: menu.station?.color ?? '',
      categoryName: menu.category?.name ?? '',
      avgMakeSeconds: menu.avgMakeSeconds,
      availability,
      maxPortion,
      isActive: menu.isActive,
      displayOrder: menu.displayOrder,
    };
  }

  async create(outletId: string, dto: CreateMenuDto) {
    // Verify category and station belong to outlet
    const [category, station] = await Promise.all([
      this.prisma.category.findFirst({ where: { id: dto.categoryId, outletId } }),
      this.prisma.station.findFirst({ where: { id: dto.stationId, outletId } }),
    ]);

    if (!category) throw new BadRequestException('Category not found');
    if (!station) throw new BadRequestException('Station not found');

    const maxOrder = await this.prisma.menu.aggregate({
      where: { outletId, stationId: dto.stationId },
      _max: { displayOrder: true },
    });

    return this.prisma.menu.create({
      data: {
        outletId,
        categoryId: dto.categoryId,
        stationId: dto.stationId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        imageUrl: dto.imageUrl,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
        avgMakeSeconds: dto.avgMakeSeconds ?? 180,
      },
      include: { category: true, station: true },
    });
  }

  async update(outletId: string, id: string, dto: UpdateMenuDto) {
    await this.findById(outletId, id);

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, outletId } });
      if (!category) throw new BadRequestException('Category not found');
    }

    if (dto.stationId) {
      const station = await this.prisma.station.findFirst({ where: { id: dto.stationId, outletId } });
      if (!station) throw new BadRequestException('Station not found');
    }

    const menu = await this.prisma.menu.update({
      where: { id },
      data: dto,
      include: { category: true, station: true, recipeLines: { include: { ingredient: true } } },
    });

    return this.enrichMenuWithPortion(menu);
  }

  async toggleAvailability(outletId: string, id: string) {
    const menu = await this.findById(outletId, id);

    const newAvailability = (menu.availability as MenuAvailability) === MenuAvailability.UNAVAILABLE
      ? MenuAvailability.AVAILABLE
      : MenuAvailability.UNAVAILABLE;

    await this.prisma.menu.update({
      where: { id },
      data: { availability: newAvailability as unknown as PrismaMenuAvailability },
    });

    this.websocketGateway.emitStockChanged(outletId, {
      outletId,
      reason: 'MENU_TOGGLE',
      menuIds: [id],
      changes: [],
      at: new Date().toISOString(),
    });

    return { availability: newAvailability };
  }

  async delete(outletId: string, id: string) {
    await this.findById(outletId, id);
    await this.prisma.menu.delete({ where: { id } });
    return { success: true };
  }

  async recalculateAvailability(outletId: string) {
    const menus = await this.prisma.menu.findMany({
      where: { outletId, isActive: true },
      include: {
        recipeLines: { include: { ingredient: true } },
      },
    });

    const updates = menus.map((menu: typeof menus[0]) => {
      let availability = MenuAvailability.AVAILABLE;

      if (menu.recipeLines.length > 0) {
        const portions = menu.recipeLines.map((rl: typeof menu.recipeLines[0]) => {
          if (rl.ingredient.currentQty <= 0 || rl.qtyPerPortion <= 0) return 0;
          return Math.floor(rl.ingredient.currentQty / rl.qtyPerPortion);
        });

        const maxPortion = Math.min(...portions);

        if (maxPortion <= 0) {
          availability = MenuAvailability.UNAVAILABLE;
        } else if (maxPortion <= 5) { // Default low threshold
          availability = MenuAvailability.LOW_STOCK;
        }
      }

      if ((menu.availability as MenuAvailability) !== availability) {
        return this.prisma.menu.update({
          where: { id: menu.id },
          data: { availability: availability as unknown as PrismaMenuAvailability },
        });
      }
      return null;
    });

    await this.prisma.$transaction(updates.filter(Boolean) as any[]);
    return { updated: updates.filter(Boolean).length };
  }
}