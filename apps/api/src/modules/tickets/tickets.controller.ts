import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { TicketStatus, SubTicketStatus } from '@order-q/shared';
import { StationCode } from '@order-q/shared';
import { z } from 'zod';

const SubTicketStatusSchema = z.object({
  status: z.nativeEnum(SubTicketStatus).refine((v) => v !== SubTicketStatus.CANCELLED, {
    message: 'Use ticket cancellation endpoint for cancelled',
  }),
});

const TicketStatusSchema = z.object({
  status: z.nativeEnum(TicketStatus).refine(
    (v) => [TicketStatus.COMPLETED, TicketStatus.CANCELLED].includes(v),
    { message: 'Only completed or cancelled allowed at ticket level' },
  ),
});

const CancelTicketSchema = z.object({
  managerPin: z.string().length(6),
  reason: z.string().min(1).max(200),
});

@ApiTags('tickets')
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Get()
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'List tickets with filters' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'station', required: false, enum: StationCode })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @CurrentUser('stationId') userStationId: string | null,
    @Query('status') status?: TicketStatus,
    @Query('station') station?: StationCode,
    @Query('q') q?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.ticketsService.findAll(outletId, {
      status,
      station,
      q,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    }, { id: userId, role: userRole, stationId: userStationId });
  }

  @Get(':id')
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get ticket detail with timeline' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.ticketsService.findById(outletId, id);
  }

  @Patch('subtickets/:subticketId/status')
  @Roles(UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'Update subticket status (ordered -> in_progress -> ready)' })
  async updateSubTicketStatus(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @CurrentUser('stationId') userStationId: string | null,
    @Param('subticketId') subticketId: string,
    @Body() body: z.infer<typeof SubTicketStatusSchema>,
  ) {
    return this.ticketsService.updateSubTicketStatus(outletId, subticketId, userId, userRole, body, userStationId);
  }

  @Patch(':id/status')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiOperation({ summary: 'Update ticket status (completed/cancelled)' })
  async updateTicketStatus(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof TicketStatusSchema>,
  ) {
    return this.ticketsService.updateTicketStatus(outletId, id, userId, body);
  }

  @Post(':id/complete')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiOperation({ summary: 'Mark ticket as completed (picked up by customer)' })
  async completeTicket(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.ticketsService.completeTicket(outletId, id, userId);
  }

  @Post(':id/cancel')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel ticket (requires manager PIN if paid)' })
  async cancelTicket(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof CancelTicketSchema>,
  ) {
    return this.ticketsService.cancelTicket(outletId, id, userId, body);
  }
}