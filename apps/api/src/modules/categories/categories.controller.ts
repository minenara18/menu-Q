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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { z } from 'zod';

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().nonnegative().optional(),
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

const ReorderSchema = z.object({
  ids: z.array(z.string().uuid()),
});

@ApiTags('categories')
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  @Roles(UserRole.CASHIER, UserRole.MAKER, UserRole.OWNER)
  @ApiOperation({ summary: 'List all categories' })
  async findAll(@CurrentUser('outletId') outletId: string) {
    return this.categoriesService.findAll(outletId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Get category by ID' })
  async findById(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.categoriesService.findById(outletId, id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Create new category' })
  async create(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof CreateCategorySchema>,
  ) {
    return this.categoriesService.create(outletId, body);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update category' })
  async update(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof UpdateCategorySchema>,
  ) {
    return this.categoriesService.update(outletId, id, body);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category' })
  async delete(
    @CurrentUser('outletId') outletId: string,
    @Param('id') id: string,
  ) {
    return this.categoriesService.delete(outletId, id);
  }

  @Post('reorder')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Reorder categories' })
  async reorder(
    @CurrentUser('outletId') outletId: string,
    @Body() body: z.infer<typeof ReorderSchema>,
  ) {
    return this.categoriesService.reorder(outletId, body.ids);
  }
}