import { Module } from '@nestjs/common';
import { MenusModule } from '../menus/menus.module';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

@Module({
  imports: [MenusModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}