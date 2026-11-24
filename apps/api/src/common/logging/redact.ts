/**
 * Redaction applied before anything reaches the structured logger.
 * Sensitive keys are replaced recursively; values are never logged verbatim.
 */
const SENSITIVE_KEY = /(pin|pinHash|managerPin|token|refreshToken|jwtSecret|secret|apiKey|webhookSecret|password|authorization|cookie)/i;

export function redactSecrets<T>(value: T): T | Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSecrets(child);
    }
    return result;
  }
  return value;
}
