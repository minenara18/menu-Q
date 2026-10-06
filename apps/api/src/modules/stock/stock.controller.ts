import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { StockMoveReason } from '@order-q/shared';
import { z } from 'zod';

const CheckStockSchema = z.object({
  items: z.array(z.object({
    menuId: z.string().uuid(),
    qty: z.number().int().positive(),
  })).min(1),
});

@ApiTags('stock')
@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StockController {
  constructor(private stockService: StockService) {}

  @Post('check')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiOperation({ summary: 'Check stock availability for items' })
  async checkAvailability(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CheckStockSchema>,
  ) {
    return this.stockService.checkAvailability(outletId, body.items);
  }

  @Get('moves')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get stock move history' })
  @ApiQuery({ name: 'ingredientId', required: false, type: String })
  @ApiQuery({ name: 'reason', required: false, enum: StockMoveReason })
  @ApiQuery({ name: 'refId', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getStockMoves(
    @CurrentUser('outletId') outletId: string,
    @Query('ingredientId') ingredientId?: string,
    @Query('reason') reason?: StockMoveReason,
    @Query('refId') refId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.stockService.getStockMoves(outletId, {
      ingredientId,
      reason,
      refId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }
}