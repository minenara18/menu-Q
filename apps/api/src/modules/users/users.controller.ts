import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  pin: z.string().length(6),
  role: z.nativeEnum(UserRole),
  stationIds: z.array(z.string().uuid()).optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pin: z.string().length(6).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  stationIds: z.array(z.string().uuid()).optional(),
});

const SetStationsSchema = z.object({
  stationIds: z.array(z.string().uuid()),
});

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'List all users in outlet' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @CurrentUser('outletId') outletId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.usersService.findAll(outletId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get user by ID' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.findById(outletId, id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Create new user' })
  async create(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CreateUserSchema>,
  ) {
    return this.usersService.create(outletId, { ...body, role: body.role as UserRole, outletId });
  }

  @Put(':id/stations')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Replace a user’s station assignments' })
  async setStations(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof SetStationsSchema>,
  ) {
    return this.usersService.setStations(outletId, id, body.stationIds);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update user' })
  async update(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof UpdateUserSchema>,
  ) {
    const updateData = { ...body, role: body.role as UserRole | undefined };
    return this.usersService.update(outletId, id, updateData);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user' })
  async delete(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.delete(outletId, id);
  }
}