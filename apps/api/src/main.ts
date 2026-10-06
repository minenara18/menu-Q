import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix(configService.get('app.apiPrefix'));
  app.enableCors({
    origin: configService.get('app.socket.corsOrigin'),
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

  const port = configService.get('app.port');
  await app.listen(port);
  console.log(`🚀 Order-Q API running on http://localhost:${port}/${configService.get('app.apiPrefix')}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();