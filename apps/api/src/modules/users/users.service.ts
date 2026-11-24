import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@order-q/shared';
import { Prisma, UserRole as PrismaUserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

interface CreateUserDto {
  outletId: string;
  name: string;
  pin: string;
  role: UserRole;
  stationIds?: string[];
}

interface UpdateUserDto {
  name?: string;
  pin?: string;
  role?: UserRole;
  isActive?: boolean;
  stationIds?: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  /** Validate that all station IDs belong to the outlet. */
  private async assertStations(outletId: string, stationIds?: string[]) {
    if (!stationIds || stationIds.length === 0) return;
    const unique = [...new Set(stationIds)];
    const count = await this.prisma.station.count({ where: { id: { in: unique }, outletId } });
    if (count !== unique.length) {
      throw new BadRequestException('One or more stations not found in this outlet');
    }
  }

  /** Replace the user's station assignments (keeps legacy stationId untouched). */
  private async syncStations(userId: string, stationIds?: string[]) {
    await this.prisma.userStation.deleteMany({ where: { userId } });
    if (stationIds && stationIds.length > 0) {
      await this.prisma.userStation.createMany({
        data: [...new Set(stationIds)].map((stationId) => ({ userId, stationId })),
      });
    }
  }

  async setStations(outletId: string, userId: string, stationIds: string[]) {
    await this.findById(outletId, userId);
    await this.assertStations(outletId, stationIds);
    await this.syncStations(userId, stationIds);
    return this.findById(outletId, userId);
  }

  async findAll(outletId: string) {
    return this.prisma.user.findMany({
      where: { outletId },
      orderBy: { createdAt: 'desc' },
      include: { stations: { include: { station: true } } },
    });
  }

  async findById(outletId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, outletId },
      include: { stations: { include: { station: true } } },
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

    await this.assertStations(outletId, dto.stationIds);

    const created = await this.prisma.user.create({
      data: {
        outletId,
        name: dto.name,
        pinHash,
        role: dto.role as unknown as PrismaUserRole,
      },
    });

    if (dto.stationIds) {
      await this.syncStations(created.id, dto.stationIds);
    }

    return this.findById(outletId, created.id);
  }

  async update(outletId: string, id: string, dto: UpdateUserDto) {
    await this.findById(outletId, id);

    const { stationIds, pin, ...rest } = dto;
    const data: any = { ...rest };
    if (pin) {
      data.pinHash = await this.authService.hashPin(pin);
    }
    if (stationIds) {
      await this.assertStations(outletId, stationIds);
      await this.syncStations(id, stationIds);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      include: { stations: { include: { station: true } } },
    });
  }

  async delete(outletId: string, id: string) {
    await this.findById(outletId, id);

    // Prevent deleting the last owner
    const ownerCount = await this.prisma.user.count({
      where: { outletId, role: 'OWNER', isActive: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user?.role === 'OWNER' && ownerCount <= 1) {
      throw new ConflictException('Cannot delete the last owner');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  }
}