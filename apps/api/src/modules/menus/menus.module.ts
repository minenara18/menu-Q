import { Module } from '@nestjs/common';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';
import { WebsocketModule } from '../../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
