import { Module } from '@nestjs/common';
import { IngredientsService } from './ingredients.service';
import { IngredientsController } from './ingredients.controller';
import { MenusModule } from '../menus/menus.module';
import { WebsocketModule } from '../../websocket/websocket.module';

@Module({
  imports: [MenusModule, WebsocketModule],
  controllers: [IngredientsController],
  providers: [IngredientsService],
  exports: [IngredientsService],
})
export class IngredientsModule {}
