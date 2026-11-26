/**
 * Web-only, DEV-only token storage fallback. Native always uses expo-secure-store.
 * In production web builds this returns false, so the insecure fallback cannot
 * be activated by accident.
 */
export function shouldUseWebFallback(platformOS: string, isDev: boolean): boolean {
  return platformOS === 'web' && isDev === true;
}

export function createMemoryStorage() {
  const values: Record<string, string> = {};
  return {
    getItem(key: string): string | null {
      return values[key] ?? null;
    },
    setItem(key: string, value: string): void {
      values[key] = value;
    },
    deleteItem(key: string): void {
      delete values[key];
    },
  };
}
