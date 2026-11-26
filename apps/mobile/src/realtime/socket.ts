import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import * as Haptics from 'expo-haptics';
import type { QueueEvent } from './events';

export interface RealtimeHandlers {
  onEvent: (event: QueueEvent) => void;
  onConnection: (online: boolean) => void;
}

let socket: Socket | null = null;

/** Connect with JWT; reconnect otomatis; room ditentukan server dari peran token. */
export function connectRealtime(serverUrl: string, token: string, handlers: RealtimeHandlers): Socket {
  disconnectRealtime();

  socket = io(serverUrl, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => handlers.onConnection(true));
  socket.on('disconnect', () => handlers.onConnection(false));

  const listen = (name: QueueEvent['type']) => {
    socket?.on(name, (payload: unknown) => {
      handlers.onEvent({ type: name, payload } as QueueEvent);
      void vibrateFor(name);
    });
  };

  [
    'ticket:created',
    'subticket:updated',
    'ticket:ready',
    'ticket:eta-updated',
    'station:queue-updated',
    'stock:changed',
  ].forEach((name) => listen(name as QueueEvent['type']));

  return socket;
}

/** Haptic berbeda per event; diam bila perangkat tidak mendukung. */
export async function vibrateFor(name: string): Promise<void> {
  // Web/DevTools: tanpa haptic & suara, tidak boleh mengganggu smoke test.
  if (Platform.OS === 'web') return;
  try {
    if (name === 'ticket:created') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (name === 'ticket:ready') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (name === 'station:queue-updated') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else await Haptics.selectionAsync();
  } catch {
    // Perangkat tanpa haptic: abaikan.
  }
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}
