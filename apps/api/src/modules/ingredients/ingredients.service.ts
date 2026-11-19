import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { MenusService } from '../menus/menus.service';
import { v4 as uuidv4 } from 'uuid';

interface CreateIngredientDto {
  name: string;
  unit: string;
  currentQty?: number;
  minThreshold?: number;
  costPerUnit?: number;
}

interface UpdateIngredientDto {
  name?: string;
  unit?: string;
  minThreshold?: number;
  costPerUnit?: number;
}

@Injectable()
export class IngredientsService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: WebsocketGateway,
    private menusService: MenusService,
  ) {}

  async findAll(outletId: string, lowStockOnly = false) {
    const where: any = { outletId };

    if (lowStockOnly) {
      where.currentQty = { lte: this.prisma.ingredient.fields.minThreshold };
    }

    return this.prisma.ingredient.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      include: {
        _count: { select: { recipeLines: true } },
      },
    });
  }

  async findLowStock(outletId: string) {
    const all = await this.prisma.ingredient.findMany({
      where: { outletId },
      orderBy: { currentQty: 'asc' },
      include: {
        recipeLines: {
          include: { menu: { select: { id: true, name: true } } },
        },
      },
    });
    return all.filter((i: typeof all[0]) => i.currentQty <= i.minThreshold);
  }

  async findById(outletId: string, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, outletId },
      include: {
        recipeLines: {
          include: { menu: { select: { id: true, name: true, price: true } } },
        },
      },
    });

    if (!ingredient) {
      throw new NotFoundException('Ingredient not found');
    }

    return ingredient;
  }

  async create(outletId: string, dto: CreateIngredientDto) {
    const existing = await this.prisma.ingredient.findFirst({
      where: { outletId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Ingredient with this name already exists');
    }

    return this.prisma.ingredient.create({
      data: {
        outletId,
        name: dto.name,
        unit: dto.unit,
        currentQty: dto.currentQty ?? 0,
        minThreshold: dto.minThreshold ?? 5,
        costPerUnit: dto.costPerUnit,
      },
    });
  }

  async update(outletId: string, id: string, dto: UpdateIngredientDto) {
    await this.findById(outletId, id);

    if (dto.name) {
      const existing = await this.prisma.ingredient.findFirst({
        where: { outletId, name: dto.name, NOT: { id } },
      });

      if (existing) {
        throw new ConflictException('Ingredient with this name already exists');
      }
    }

    return this.prisma.ingredient.update({
      where: { id },
      data: dto,
    });
  }

  async delete(outletId: string, id: string) {
    await this.findById(outletId, id);

    const recipeCount = await this.prisma.recipeLine.count({ where: { ingredientId: id } });
    if (recipeCount > 0) {
      throw new ConflictException('Cannot delete ingredient used in recipes');
    }

    await this.prisma.ingredient.delete({ where: { id } });
    return { success: true };
  }

  async adjustStock(outletId: string, id: string, delta: number, userId: string, reason: string, refId?: string, refType?: string) {
    await this.findById(outletId, id);

    const result = await this.prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      // Atomic guarded update: decrements only when enough quantity remains
      const updated = await tx.ingredient.updateMany({
        where: delta < 0 ? { id, currentQty: { gte: -delta } } : { id },
        data: { currentQty: { increment: delta } },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Insufficient stock');
      }

      await tx.stockMove.create({
        data: {
          outletId,
          ingredientId: id,
          qtyDelta: delta,
          reason: reason as any,
          refId,
          refType,
          createdBy: userId,
        },
      });

      return tx.ingredient.findUniqueOrThrow({ where: { id } });
    });

    await this.menusService.recalculateAvailability(outletId);

    this.websocketGateway.emitStockChanged(outletId, {
      outletId,
      reason: reason as 'SALE' | 'REFUND' | 'OPNAME' | 'ADJUSTMENT' | 'WASTE' | 'RECEIVE',
      changes: [{ ingredientId: id, qtyDelta: delta }],
      at: new Date().toISOString(),
    });

    return result;
  }
}