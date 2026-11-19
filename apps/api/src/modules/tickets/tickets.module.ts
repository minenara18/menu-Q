import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';

@Module({
  imports: [StockModule, WebsocketModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}