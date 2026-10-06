import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { z } from 'zod';

const UpdateOutletSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  serviceRate: z.number().min(0).max(1).optional(),
  timezone: z.string().optional(),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  varianceThreshold: z.number().nonnegative().optional(),
  partialReadyPolicy: z.enum(['WAIT_ALL', 'CALL_PER_STATION']).optional(),
});

const UpdateStationSettingsSchema = z.object({
  slaMinutes: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

const CustomSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
});

@ApiTags('settings')
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get all outlet settings' })
  async getSettings(@CurrentUser('outletId') outletId: string) {
    return this.settingsService.getOutletSettings(outletId);
  }

  @Patch()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update outlet settings' })
  async updateSettings(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof UpdateOutletSettingsSchema>,
  ) {
    return this.settingsService.updateOutletSettings(outletId, body);
  }

  @Patch('stations/:stationId')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update station settings (SLA, active)' })
  async updateStationSettings(
    @CurrentUser('outletId') outletId: string,
    @Param('stationId') stationId: string,
    @Body() body: z.infer<typeof UpdateStationSettingsSchema>,
  ) {
    return this.settingsService.updateStationSettings(outletId, stationId, body);
  }

  @Post('custom')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Set custom setting' })
  async setCustomSetting(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CustomSettingSchema>,
  ) {
    return this.settingsService.setCustomSetting(outletId, body.key, body.value);
  }

  @Get('custom/:key')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get custom setting' })
  async getCustomSetting(
    @CurrentUser('outletId') outletId: string,
    @Param('key') key: string,
  ) {
    return this.settingsService.getCustomSetting(outletId, key);
  }
}