import { redactSecrets } from './redact';

describe('log redaction', () => {
  it('masks PIN, token and secret values recursively', () => {
    const input = {
      outletId: 'outlet-1',
      pin: '123456',
      managerPin: '123456',
      refreshToken: 'eyJhbGciOi...',
      headers: { authorization: 'Bearer secret-token', cookie: 'sid=abc' },
      body: { nested: { apiKey: 'xnd_test_123', pin: '000000' } },
    };

    const result = redactSecrets(input) as Record<string, any>;
    const json = JSON.stringify(result);

    expect(result.pin).toBe('[REDACTED]');
    expect(result.managerPin).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.headers.authorization).toBe('[REDACTED]');
    expect(result.body.nested.apiKey).toBe('[REDACTED]');
    expect(result.body.nested.pin).toBe('[REDACTED]');
    expect(json).not.toContain('123456');
    expect(json).not.toContain('secret-token');
    expect(json).not.toContain('xnd_test_123');
    expect(result.outletId).toBe('outlet-1');
  });
});
