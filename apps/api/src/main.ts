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

  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const qrisEnabled = configService.get<boolean>('app.qris.enabled') === true;
  if (nodeEnv === 'production') {
    if (!qrisEnabled) {
      logger.error('FATAL: QRIS_ENABLED must be true in production (payment collection requires a real QRIS gateway). Refusing to boot.');
      process.exit(1);
    }
    const merchantId = configService.get<string>('app.qris.merchantId');
    const apiKey = configService.get<string>('app.qris.apiKey');
    const webhookSecret = configService.get<string>('app.qris.webhookSecret');
    if (!merchantId || !apiKey || !webhookSecret) {
      logger.error('FATAL: QRIS is enabled but QRIS_MERCHANT_ID / QRIS_API_KEY / QRIS_WEBHOOK_SECRET are missing. Refusing to boot.');
      process.exit(1);
    }
    const jwtSecret = configService.get<string>('app.jwt.secret');
    if (!jwtSecret || jwtSecret === 'change-me-in-production-min-32-chars') {
      logger.error('FATAL: JWT_SECRET must be set to a strong random value in production (the code default is not acceptable). Refusing to boot.');
      process.exit(1);
    }
  }

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
