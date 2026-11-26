import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { shouldUseWebFallback, createMemoryStorage } from './web-storage';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__ === true;
const memory = createMemoryStorage();
let warned = false;

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[Order-Q][WEB/DEV] Token disimpan di memory browser untuk debugging. ' +
      'Jangan gunakan mode web untuk data produksi; perangkat tetap memakai expo-secure-store.',
  );
}

function assertNativeStorageAvailable(): void {
  if (Platform.OS === 'web' && !isDev) {
    throw new Error('Web production tidak didukung untuk penyimpanan token. Gunakan aplikasi native.');
  }
}

export async function getToken(key: string): Promise<string | null> {
  if (shouldUseWebFallback(Platform.OS, isDev)) {
    warnOnce();
    return memory.getItem(key);
  }
  assertNativeStorageAvailable();
  return SecureStore.getItemAsync(key);
}

export async function setToken(key: string, value: string): Promise<void> {
  if (shouldUseWebFallback(Platform.OS, isDev)) {
    warnOnce();
    memory.setItem(key, value);
    return;
  }
  assertNativeStorageAvailable();
  await SecureStore.setItemAsync(key, value);
}

export async function deleteToken(key: string): Promise<void> {
  if (shouldUseWebFallback(Platform.OS, isDev)) {
    warnOnce();
    memory.deleteItem(key);
    return;
  }
  assertNativeStorageAvailable();
  await SecureStore.deleteItemAsync(key);
}
