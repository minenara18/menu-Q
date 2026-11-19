import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { MenusModule } from '../menus/menus.module';
import { AuthModule } from '../auth/auth.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';

@Module({
  imports: [StockModule, MenusModule, AuthModule, WebsocketModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
