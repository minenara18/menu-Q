import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

/**
 * Docs are available by default in development, but disabled in production
 * unless ENABLE_DOCS=true. This decision is a pure function so it can be tested.
 */
export function shouldEnableDocs(nodeEnv: string, enableDocs: boolean): boolean {
  if (nodeEnv === 'production') {
    return enableDocs === true;
  }
  return true;
}

export function configureSwagger(app: INestApplication, configService: ConfigService): void {
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const enableDocs = configService.get<boolean>('app.docs.enabled') === true;

  if (!shouldEnableDocs(nodeEnv, enableDocs)) {
    return;
  }

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

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
}
