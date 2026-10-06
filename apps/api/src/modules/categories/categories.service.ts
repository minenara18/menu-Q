import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

interface CreateCategoryDto {
  name: string;
  displayOrder?: number;
}

interface UpdateCategoryDto {
  name?: string;
  displayOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(outletId: string) {
    return this.prisma.category.findMany({
      where: { outletId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(outletId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, outletId },
      include: { _count: { select: { menus: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async create(outletId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { outletId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    const maxOrder = await this.prisma.category.aggregate({
      where: { outletId },
      _max: { displayOrder: true },
    });

    return this.prisma.category.create({
      data: {
        outletId,
        name: dto.name,
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });
  }

  async update(outletId: string, id: string, dto: UpdateCategoryDto) {
    await this.findById(outletId, id);

    if (dto.name) {
      const existing = await this.prisma.category.findFirst({
        where: { outletId, name: dto.name, NOT: { id } },
      });

      if (existing) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async delete(outletId: string, id: string) {
    await this.findById(outletId, id);

    const menuCount = await this.prisma.menu.count({
      where: { categoryId: id },
    });

    if (menuCount > 0) {
      throw new ConflictException('Cannot delete category with existing menus');
    }

    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }

  async reorder(outletId: string, ids: string[]) {
    const updates = ids.map((id, index) =>
      this.prisma.category.update({
        where: { id },
        data: { displayOrder: index },
      }),
    );
    await this.prisma.$transaction(updates);
    return this.findAll(outletId);
  }
}