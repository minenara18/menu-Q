import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'v1',
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production-min-32-chars',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  pin: {
    maxAttempts: parseInt(process.env.PIN_MAX_ATTEMPTS || '5', 10),
    lockoutMinutes: parseInt(process.env.PIN_LOCKOUT_MINUTES || '15', 10),
  },
  printer: {
    enabled: process.env.PRINTER_ENABLED === 'true',
    type: process.env.PRINTER_TYPE || 'bluetooth',
    macAddress: process.env.PRINTER_MAC_ADDRESS || '',
    ip: process.env.PRINTER_IP || '',
    port: parseInt(process.env.PRINTER_PORT || '9100', 10),
  },
  qris: {
    enabled: process.env.QRIS_ENABLED === 'true',
    merchantId: process.env.QRIS_MERCHANT_ID || '',
    apiKey: process.env.QRIS_API_KEY || '',
    webhookSecret: process.env.QRIS_WEBHOOK_SECRET || '',
  },
  socket: {
    corsOrigin: process.env.SOCKET_CORS_ORIGIN || '*',
  },
}));