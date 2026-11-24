import { shouldEnableDocs } from './swagger';

describe('Swagger gating', () => {
  it('is enabled outside production regardless of the flag', () => {
    expect(shouldEnableDocs('development', false)).toBe(true);
    expect(shouldEnableDocs('test', false)).toBe(true);
  });

  it('is disabled in production by default', () => {
    expect(shouldEnableDocs('production', false)).toBe(false);
  });

  it('can be explicitly enabled in production with ENABLE_DOCS=true', () => {
    expect(shouldEnableDocs('production', true)).toBe(true);
  });
});
