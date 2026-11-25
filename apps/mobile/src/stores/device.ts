import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type DeviceRole = 'CASHIER' | 'KDS' | 'DISPLAY';

export interface DeviceConfig {
  serverUrl: string;
  outletCode: string;
  role: DeviceRole;
}

declare const process: { env: Record<string, string | undefined> };

const CONFIG_KEY = 'orderq.device.config';
const TOKEN_KEY = 'orderq.accessToken';
const REFRESH_KEY = 'orderq.refreshToken';
const DISPLAY_KEY = 'orderq.displayToken';

let current: DeviceConfig | null = null;

interface DeviceState {
  config: DeviceConfig | null;
  ready: boolean;
  load: () => Promise<void>;
  save: (config: DeviceConfig) => Promise<void>;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  config: null,
  ready: false,
  load: async () => {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    const parsed = raw ? (JSON.parse(raw) as DeviceConfig) : null;
    current = parsed;
    set({ config: parsed, ready: true });
  },
  save: async (config) => {
    current = config;
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    set({ config, ready: true });
  },
}));

/** Base URL used by the API client. Never hardcoded in components. */
export function getBaseUrl(): string {
  const fromConfig = current?.serverUrl?.trim();
  if (fromConfig) return fromConfig.replace(/\/$/, '');
  return (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
}

export const tokens = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (value: string) => SecureStore.setItemAsync(TOKEN_KEY, value),
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  setRefresh: (value: string) => SecureStore.setItemAsync(REFRESH_KEY, value),
  getDisplay: () => SecureStore.getItemAsync(DISPLAY_KEY),
  setDisplay: (value: string) => SecureStore.setItemAsync(DISPLAY_KEY, value),
  clear: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
