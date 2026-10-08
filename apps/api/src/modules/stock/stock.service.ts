import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockMoveReason } from '@order-q/shared';
import { MenusService } from '../menus/menus.service';

export interface StockCheckResult {
  canFulfill: boolean;
  insufficientItems: Array<{
    ingredientId: string;
    ingredientName: string;
    required: number;
    available: number;
    unit: string;
    menuId: string;
    menuName: string;
  }>;
}

@Injectable()
export class StockService {
  constructor(
    private prisma: PrismaService,
    private menusService: MenusService,
  ) {}

  async checkAvailability(outletId: string, items: Array<{ menuId: string; qty: number }>): Promise<StockCheckResult> {
    const insufficientItems: StockCheckResult['insufficientItems'] = [];

    for (const item of items) {
      const menu = await this.prisma.menu.findFirst({
        where: { id: item.menuId, outletId },
        include: {
          recipeLines: {
            include: { ingredient: true },
          },
        },
      });

      if (!menu) {
        throw new NotFoundException(`Menu ${item.menuId} not found`);
      }

      if (!menu.isActive) {
        throw new BadRequestException(`Menu ${menu.name} is not active`);
      }

      // If menu has no recipe lines, skip stock check (sell by unit)
      if (menu.recipeLines.length === 0) {
        continue;
      }

      for (const rl of menu.recipeLines) {
        const required = rl.qtyPerPortion * item.qty;
        if (rl.ingredient.currentQty < required) {
          insufficientItems.push({
            ingredientId: rl.ingredientId,
            ingredientName: rl.ingredient.name,
            required,
            available: rl.ingredient.currentQty,
            unit: rl.ingredient.unit,
            menuId: menu.id,
            menuName: menu.name,
          });
        }
      }
    }

    return {
      canFulfill: insufficientItems.length === 0,
      insufficientItems,
    };
  }

  async reserveStock(outletId: string, items: Array<{ menuId: string; qty: number }>, ticketId: string, userId: string) {
    // Sort by ingredientId to prevent deadlock
    const allRecipeLines: Array<{ ingredientId: string; qty: number; menuId: string }> = [];

    for (const item of items) {
      const menu = await this.prisma.menu.findFirst({
        where: { id: item.menuId, outletId },
        include: { recipeLines: true },
      });

      if (!menu || menu.recipeLines.length === 0) continue;

      for (const rl of menu.recipeLines) {
        allRecipeLines.push({
          ingredientId: rl.ingredientId,
          qty: rl.qtyPerPortion * item.qty,
          menuId: item.menuId,
        });
      }
    }

    // Sort by ingredientId to ensure consistent lock order
    allRecipeLines.sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));

    return this.prisma.$transaction(async (tx: typeof this.prisma) => {
      // Lock ingredients in order
      for (const rl of allRecipeLines) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: rl.ingredientId },
        });

        if (!ingredient) {
          throw new NotFoundException(`Ingredient ${rl.ingredientId} not found`);
        }

        if (ingredient.currentQty < rl.qty) {
          throw new ConflictException(`Insufficient stock for ${ingredient.name}: need ${rl.qty}, have ${ingredient.currentQty}`);
        }

        // Decrement stock
        await tx.ingredient.update({
          where: { id: rl.ingredientId },
          data: { currentQty: { decrement: rl.qty } },
        });

        // Create stock move
        await tx.stockMove.create({
          data: {
            outletId,
            ingredientId: rl.ingredientId,
            qtyDelta: -rl.qty,
            reason: StockMoveReason.SALE,
            refId: ticketId,
            refType: 'ticket',
            createdBy: userId,
          },
        });
      }
    });
  }

  async releaseStock(outletId: string, items: Array<{ menuId: string; qty: number }>, ticketId: string, userId: string) {
    const allRecipeLines: Array<{ ingredientId: string; qty: number }> = [];

    for (const item of items) {
      const menu = await this.prisma.menu.findFirst({
        where: { id: item.menuId, outletId },
        include: { recipeLines: true },
      });

      if (!menu || menu.recipeLines.length === 0) continue;

      for (const rl of menu.recipeLines) {
        allRecipeLines.push({
          ingredientId: rl.ingredientId,
          qty: rl.qtyPerPortion * item.qty,
        });
      }
    }

    // Sort by ingredientId for consistent lock order
    allRecipeLines.sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));

    return this.prisma.$transaction(async (tx: typeof this.prisma) => {
      for (const rl of allRecipeLines) {
        await tx.ingredient.update({
          where: { id: rl.ingredientId },
          data: { currentQty: { increment: rl.qty } },
        });

        await tx.stockMove.create({
          data: {
            outletId,
            ingredientId: rl.ingredientId,
            qtyDelta: rl.qty,
            reason: StockMoveReason.REFUND,
            refId: ticketId,
            refType: 'ticket',
            createdBy: userId,
          },
        });
      }
    });
  }

  async getStockMoves(outletId: string, query: {
    ingredientId?: string;
    reason?: StockMoveReason;
    refId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { outletId };

    if (query.ingredientId) where.ingredientId = query.ingredientId;
    if (query.reason) where.reason = query.reason;
    if (query.refId) where.refId = query.refId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = query.dateFrom;
      if (query.dateTo) where.createdAt.lte = query.dateTo;
    }

    const [moves, total] = await Promise.all([
      this.prisma.stockMove.findMany({
        where,
        include: { ingredient: true, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.stockMove.count({ where }),
    ]);

    return { moves, total };
  }
}