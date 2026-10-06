import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MenusService } from './menus.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { StationCode } from '@order-q/shared';
import { z } from 'zod';

const CreateMenuSchema = z.object({
  categoryId: z.string().uuid(),
  stationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price: z.number().int().positive(),
  imageUrl: z.string().url().optional().nullable(),
  displayOrder: z.number().int().nonnegative().optional(),
  avgMakeSeconds: z.number().int().positive().optional(),
});

const UpdateMenuSchema = z.object({
  categoryId: z.string().uuid().optional(),
  stationId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  price: z.number().int().positive().optional(),
  imageUrl: z.string().url().optional().nullable(),
  displayOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  avgMakeSeconds: z.number().int().positive().optional(),
});

@ApiTags('menus')
@Controller('menus')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MenusController {
  constructor(private menusService: MenusService) {}

  @Get()
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'List menus with availability and max portion' })
  @ApiQuery({ name: 'station', required: false, enum: StationCode })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @CurrentUser('outletId') outletId: string,
    @Query('station') station?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.menusService.findAll(outletId, {
      station,
      categoryId,
      q,
      isActive: isActive ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get menu by ID with recipe lines' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.menusService.findById(outletId, id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Create new menu' })
  async create(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CreateMenuSchema>,
  ) {
    return this.menusService.create(outletId, body);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update menu' })
  async update(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof UpdateMenuSchema>,
  ) {
    return this.menusService.update(outletId, id, body);
  }

  @Patch(':id/toggle')
  @Roles(UserRole.OWNER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Toggle menu availability (temporarily close/open)' })
  async toggleAvailability(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.menusService.toggleAvailability(outletId, id);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete menu' })
  async delete(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.menusService.delete(outletId, id);
  }

  @Post('recalculate-availability')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Recalculate all menu availability based on stock' })
  async recalculateAvailability(@CurrentUser('outletId') outletId: string) {
    return this.menusService.recalculateAvailability(outletId);
  }
}