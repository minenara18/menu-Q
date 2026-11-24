import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import pino from 'pino';
import { redactSecrets } from './redact';

/**
 * Structured JSON logger. Redaction is applied to the payload before pino
 * serializes it, so PINs, tokens and secrets never reach the log stream.
 */
export const structuredLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'body.pin',
      'body.managerPin',
      'body.refreshToken',
      'body.token',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Attaches a request id, exposes it as X-Request-Id, and logs one structured
 * JSON object per request.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: () => void) {
  const requestId = randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const started = Date.now();
  res.on('finish', () => {
    structuredLogger.info(
      redactSecrets({
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        body: req.body,
      }),
      'request completed',
    );
  });

  next();
}
