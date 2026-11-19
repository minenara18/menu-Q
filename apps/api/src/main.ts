import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', reason as Error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error.stack);
  process.exit(1);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'v1';
  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: configService.get<string>('app.socket.corsOrigin') ?? '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Order-Q API')
    .setDescription('Queue-first POS API for F&B')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication')
    .addTag('shifts', 'Shift Management')
    .addTag('menus', 'Menu Management')
    .addTag('categories', 'Category Management')
    .addTag('stations', 'Station Management')
    .addTag('ingredients', 'Ingredient Management')
    .addTag('recipes', 'Recipe/BOM Management')
    .addTag('stock', 'Stock Management')
    .addTag('orders', 'Order & Checkout')
    .addTag('tickets', 'Ticket & Queue Management')
    .addTag('payments', 'Payment Processing')
    .addTag('settings', 'Outlet Settings')
    .addTag('users', 'User Management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('app.port') ?? 3000;
  // Bind 0.0.0.0 so the API is reachable from LAN/devices (not just localhost).
  await app.listen(port, '0.0.0.0');
  logger.log(`Order-Q API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
