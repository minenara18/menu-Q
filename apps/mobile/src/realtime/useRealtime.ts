import { useEffect } from 'react';
import { getBaseUrl } from '../stores/device';
import { connectRealtime, disconnectRealtime } from './socket';
import type { QueueEvent } from './events';

export function useRealtime(token: string | null | undefined, onEvent: (event: QueueEvent) => void, onOnline: (online: boolean) => void) {
  useEffect(() => {
    if (!token) return;
    connectRealtime(getBaseUrl(), token, { onEvent, onConnection: onOnline });
    return () => disconnectRealtime();
  }, [token, onEvent, onOnline]);
}
