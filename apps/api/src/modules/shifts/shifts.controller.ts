import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { z } from 'zod';

const OpenShiftSchema = z.object({
  openingCash: z.number().int().min(0),
});

const CloseShiftSchema = z.object({
  countedCash: z.number().int().min(0),
  cashCounts: z.array(z.object({
    denomination: z.number().int().positive(),
    count: z.number().int().nonnegative(),
  })),
  varianceNote: z.string().optional(),
  managerPin: z.string().length(6).optional(),
  forceClose: z.boolean().optional().default(false),
});

@ApiTags('shifts')
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Get('current')
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get current open shift' })
  async getCurrent(@CurrentUser('outletId') outletId: string) {
    return this.shiftsService.findCurrent(outletId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Get shift by ID' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.shiftsService.findById(outletId, id);
  }

  @Post('open')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @ApiOperation({ summary: 'Open new shift' })
  async open(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: z.infer<typeof OpenShiftSchema>,
  ) {
    return this.shiftsService.open(outletId, userId, body);
  }

  @Get(':id/summary')
  @Roles(UserRole.OWNER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Get shift summary for closing' })
  async getSummary(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.shiftsService.getSummary(outletId, id);
  }

  @Post(':id/close')
  @Roles(UserRole.CASHIER, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close shift with cash reconciliation' })
  async close(
    @CurrentUser('outletId') outletId: string,
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof CloseShiftSchema>,
  ) {
    // For now, we'll skip manager PIN verification in the controller
    // The service will handle the threshold check
    return this.shiftsService.close(outletId, id, userId, body);
  }
}