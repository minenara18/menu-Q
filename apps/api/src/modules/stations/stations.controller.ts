import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { StationCode } from '@order-q/shared';
import { z } from 'zod';

const CreateStationSchema = z.object({
  code: z.nativeEnum(StationCode),
  name: z.string().min(1).max(50).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  slaMinutes: z.number().int().positive().optional(),
});

const UpdateStationSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  slaMinutes: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

@ApiTags('stations')
@Controller('stations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StationsController {
  constructor(private stationsService: StationsService) {}

  @Get()
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'List all stations' })
  async findAll(@CurrentUser('outletId') outletId: string) {
    return this.stationsService.findAll(outletId);
  }

  @Get(':id/queue')
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get the ordered priority queue for a station' })
  async getQueue(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('role') userRole: string,
    @CurrentUser('stationId') userStationId: string | null,
    @Param('id') id: string,
  ) {
    if (userRole === UserRole.MAKER && userStationId !== id) {
      throw new ForbiddenException('Maker hanya boleh melihat antrean stasiunnya sendiri');
    }
    return this.stationsService.getQueue(outletId, id);
  }

  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get station by ID' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.stationsService.findById(outletId, id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Create new station' })
  async create(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CreateStationSchema>,
  ) {
    return this.stationsService.create(outletId, body);
  }

  @Post('ensure-defaults')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Ensure default stations exist' })
  async ensureDefaults(@CurrentUser('outletId') outletId: string) {
    return this.stationsService.ensureDefaults(outletId);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update station' })
  async update(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof UpdateStationSchema>,
  ) {
    return this.stationsService.update(outletId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete station' })
  async delete(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.stationsService.delete(outletId, id);
  }
}