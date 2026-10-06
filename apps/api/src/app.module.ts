import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import appConfig from './config/app.config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { StationsModule } from './modules/stations/stations.module';
import { MenusModule } from './modules/menus/menus.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { StockModule } from './modules/stock/stock.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigModule],
      useFactory: (configService: any) => ({
        throttlers: [
          {
            ttl: configService.get('app.rateLimit.windowMs'),
            limit: configService.get('app.rateLimit.maxRequests'),
          },
        ],
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ShiftsModule,
    CategoriesModule,
    StationsModule,
    MenusModule,
    IngredientsModule,
    RecipesModule,
    StockModule,
    OrdersModule,
    TicketsModule,
    PaymentsModule,
    SettingsModule,
    WebsocketModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}