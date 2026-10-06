import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecipesService } from './recipes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@order-q/shared';
import { z } from 'zod';

const RecipeLineSchema = z.object({
  ingredientId: z.string().uuid(),
  qtyPerPortion: z.number().positive(),
});

const UpdateRecipeSchema = z.object({
  recipeLines: z.array(RecipeLineSchema).min(1),
});

@ApiTags('recipes')
@Controller('recipes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RecipesController {
  constructor(private recipesService: RecipesService) {}

  @Get(':menuId')
  @Roles(UserRole.OWNER, UserRole.MAKER)
  @ApiOperation({ summary: 'Get recipe lines for a menu' })
  async findByMenu(
    @CurrentUser('outletId') outletId: string,
    @Param('menuId') menuId: string,
  ) {
    return this.recipesService.findByMenu(outletId, menuId);
  }

  @Put(':menuId')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update/replace recipe for a menu' })
  async update(
    @CurrentUser('outletId') outletId: string,
    @Param('menuId') menuId: string,
    @Body() body: z.infer<typeof UpdateRecipeSchema>,
  ) {
    return this.recipesService.update(outletId, menuId, body);
  }

  @Delete(':menuId')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete recipe for a menu' })
  async delete(
    @CurrentUser('outletId') outletId: string,
    @Param('menuId') menuId: string,
  ) {
    return this.recipesService.delete(outletId, menuId);
  }
}