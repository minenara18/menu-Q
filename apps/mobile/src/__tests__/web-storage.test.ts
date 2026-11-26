import { createMemoryStorage, shouldUseWebFallback } from '../stores/web-storage';

describe('web storage shim', () => {
  it('only enables the fallback on web AND dev', () => {
    expect(shouldUseWebFallback('web', true)).toBe(true);
    expect(shouldUseWebFallback('web', false)).toBe(false);
    expect(shouldUseWebFallback('ios', true)).toBe(false);
    expect(shouldUseWebFallback('android', true)).toBe(false);
  });

  it('stores and deletes values in memory', () => {
    const storage = createMemoryStorage();
    expect(storage.getItem('token')).toBeNull();
    storage.setItem('token', 'abc');
    expect(storage.getItem('token')).toBe('abc');
    storage.deleteItem('token');
    expect(storage.getItem('token')).toBeNull();
  });
});
