import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { MenusModule } from '../menus/menus.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [StockModule, MenusModule, ShiftsModule, WebsocketModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}