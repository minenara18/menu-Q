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
import { IngredientsService } from './ingredients.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { StockMoveReason } from '@order-q/shared';
import { z } from 'zod';

const CreateIngredientSchema = z.object({
  name: z.string().min(1).max(100),
  unit: z.string().min(1).max(20),
  currentQty: z.number().nonnegative().optional(),
  minThreshold: z.number().nonnegative().optional(),
  costPerUnit: z.number().nonnegative().optional(),
});

const UpdateIngredientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  unit: z.string().min(1).max(20).optional(),
  minThreshold: z.number().nonnegative().optional(),
  costPerUnit: z.number().nonnegative().optional(),
});

const AdjustStockSchema = z.object({
  delta: z.number(),
  reason: z.nativeEnum(StockMoveReason),
  refId: z.string().uuid().optional(),
  refType: z.string().optional(),
});

@ApiTags('ingredients')
@Controller('ingredients')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class IngredientsController {
  constructor(private ingredientsService: IngredientsService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MAKER)
  @ApiOperation({ summary: 'List all ingredients' })
  @ApiQuery({ name: 'lowStockOnly', required: false, type: Boolean })
  async findAll(
    @CurrentUser('outletId') outletId: string,
    @Query('lowStockOnly') lowStockOnly?: string,
  ) {
    return this.ingredientsService.findAll(outletId, lowStockOnly === 'true');
  }

  @Get('low-stock')
  @Roles(UserRole.OWNER, UserRole.MAKER)
  @ApiOperation({ summary: 'Get low stock ingredients with affected menus' })
  async findLowStock(@CurrentUser('outletId') outletId: string) {
    return this.ingredientsService.findLowStock(outletId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MAKER)
  @ApiOperation({ summary: 'Get ingredient by ID with recipes' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.ingredientsService.findById(outletId, id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Create new ingredient' })
  async create(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CreateIngredientSchema>,
  ) {
    return this.ingredientsService.create(outletId, body);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update ingredient' })
  async update(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof UpdateIngredientSchema>,
  ) {
    return this.ingredientsService.update(outletId, id, body);
  }

  @Post(':id/adjust')
  @Roles(UserRole.OWNER, UserRole.MAKER)
  @ApiOperation({ summary: 'Adjust stock (receive, opname, adjustment, waste)' })
  async adjustStock(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof AdjustStockSchema>,
  ) {
    return this.ingredientsService.adjustStock(outletId, id, body.delta, userId, body.reason, body.refId, body.refType);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete ingredient' })
  async delete(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.ingredientsService.delete(outletId, id);
  }
}