import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { StockModule } from '../stock/stock.module';
import { WebsocketModule } from '../../websocket/websocket.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsGateway } from './payments.gateway';

@Module({
  imports: [TicketsModule, StockModule, WebsocketModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsGateway],
  exports: [PaymentsService],
})
export class PaymentsModule {}