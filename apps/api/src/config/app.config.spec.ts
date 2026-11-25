import { parseTrustProxy } from './app.config';

describe('parseTrustProxy', () => {
  it('is off when unset or blank', () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy('')).toBeUndefined();
  });

  it('parses booleans and hop counts', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
  });

  it('ignores invalid values', () => {
    expect(parseTrustProxy('abc')).toBeUndefined();
  });
});
