import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@order-q/shared';
import { v4 as uuidv4 } from 'uuid';

interface CreateUserDto {
  outletId: string;
  name: string;
  pin: string;
  role: UserRole;
}

interface UpdateUserDto {
  name?: string;
  pin?: string;
  role?: UserRole;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async findAll(outletId: string) {
    return this.prisma.user.findMany({
      where: { outletId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(outletId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, outletId },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(outletId: string, dto: CreateUserDto) {
    // Check if name already exists in outlet
    const existing = await this.prisma.user.findFirst({
      where: { outletId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException('User with this name already exists in outlet');
    }

    const pinHash = await this.authService.hashPin(dto.pin);

    return this.prisma.user.create({
      data: {
        outletId,
        name: dto.name,
        pinHash,
        role: dto.role,
      },
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async update(outletId: string, id: string, dto: UpdateUserDto) {
    const user = await this.findById(outletId, id);

    const data: any = { ...dto };
    if (dto.pin) {
      data.pinHash = await this.authService.hashPin(dto.pin);
      delete data.pin;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async delete(outletId: string, id: string) {
    await this.findById(outletId, id);

    // Prevent deleting the last owner
    const ownerCount = await this.prisma.user.count({
      where: { outletId, role: UserRole.OWNER, isActive: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user?.role === UserRole.OWNER && ownerCount <= 1) {
      throw new ConflictException('Cannot delete the last owner');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  }
}