import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MenusService } from '../menus/menus.service';

interface RecipeLineDto {
  ingredientId: string;
  qtyPerPortion: number;
}

interface UpdateRecipeDto {
  recipeLines: RecipeLineDto[];
}

@Injectable()
export class RecipesService {
  constructor(
    private prisma: PrismaService,
    private menusService: MenusService,
  ) {}

  async findByMenu(outletId: string, menuId: string) {
    // Verify menu belongs to outlet
    await this.menusService.findById(outletId, menuId);

    return this.prisma.recipeLine.findMany({
      where: { menuId },
      include: {
        ingredient: true,
      },
      orderBy: { ingredient: { name: 'asc' } },
    });
  }

  async update(outletId: string, menuId: string, dto: UpdateRecipeDto) {
    // Verify menu belongs to outlet
    await this.menusService.findById(outletId, menuId);

    // Validate all ingredients exist and belong to outlet
    const ingredientIds = dto.recipeLines.map((rl) => rl.ingredientId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, outletId },
    });

    if (ingredients.length !== ingredientIds.length) {
      throw new BadRequestException('One or more ingredients not found or not in outlet');
    }

    // Check for duplicate ingredients
    const uniqueIds = new Set(ingredientIds);
    if (uniqueIds.size !== ingredientIds.length) {
      throw new BadRequestException('Duplicate ingredients in recipe');
    }

    // Validate quantities
    for (const rl of dto.recipeLines) {
      if (rl.qtyPerPortion <= 0) {
        throw new BadRequestException('Quantity per portion must be positive');
      }
    }

    return this.prisma.$transaction(async (tx: typeof this.prisma) => {
      // Delete existing recipe lines
      await tx.recipeLine.deleteMany({ where: { menuId } });

      // Create new recipe lines
      const created = await Promise.all(
        dto.recipeLines.map((rl) =>
          tx.recipeLine.create({
            data: {
              menuId,
              ingredientId: rl.ingredientId,
              qtyPerPortion: rl.qtyPerPortion,
            },
            include: { ingredient: true },
          }),
        ),
      );

      // Trigger menu availability recalculation
      await this.menusService.recalculateAvailability(outletId);

      return created;
    });
  }

  async delete(outletId: string, menuId: string) {
    await this.menusService.findById(outletId, menuId);

    await this.prisma.recipeLine.deleteMany({ where: { menuId } });

    // Trigger menu availability recalculation
    await this.menusService.recalculateAvailability(outletId);

    return { success: true };
  }
}