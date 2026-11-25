import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { endpoints } from '../api/endpoints';
import { tokens } from '../stores/device';
import { useRealtime } from '../realtime/useRealtime';
import type { QueueEvent } from '../realtime/events';
import { strings } from '../strings';
import { getTheme, space, typography } from '../theme/tokens';
import { PrimaryButton } from '../components/ui';

interface DisplayTicket {
  ticketNumber: string;
  status: string;
  etaMin: number | null;
  etaMax: number | null;
}

export function DisplayScreen() {
  const theme = getTheme('dark');
  const [code, setCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<DisplayTicket[]>([]);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    void tokens.getDisplay().then(setToken);
  }, []);

  const redeem = async () => {
    setError('');
    try {
      const res = await endpoints.displayPair(code);
      await tokens.setDisplay(res.token);
      setToken(res.token);
    } catch {
      setError(strings.display.pairingFailed);
    }
  };

  const onEvent = useCallback((event: QueueEvent) => {
    if (event.type !== 'ticket:ready' && event.type !== 'ticket:eta-updated') return;
    const p = event.payload as { ticketNumber?: string; status?: string; etaMin?: number | null; etaMax?: number | null };
    if (!p.ticketNumber) return;
    setItems((prev) => {
      const without = prev.filter((t) => t.ticketNumber !== p.ticketNumber);
      return [
        {
          ticketNumber: p.ticketNumber!,
          status: p.status ?? 'READY',
          etaMin: p.etaMin ?? null,
          etaMax: p.etaMax ?? null,
        },
        ...without,
      ].slice(0, 12); // maksimal 12 nomor
    });
  }, []);
  const onOnline = useCallback((value: boolean) => setOnline(value), []);
  useRealtime(token, onEvent, onOnline);

  if (!token) {
    return (
      <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.ink }]}>{strings.display.pairing}</Text>
        <TextInput
          accessibilityLabel={strings.display.pairing}
          keyboardType="numeric"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          style={[styles.input, { borderColor: theme.border, color: theme.ink }]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label={strings.display.redeem} onPress={() => void redeem()} disabled={code.length !== 6} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{strings.display.title}</Text>
      {items.length === 0 ? <Text style={{ color: theme.muted }}>{strings.display.empty}</Text> : null}
      {items.map((item) => (
        <View key={item.ticketNumber} style={styles.row}>
          <Text style={[styles.number, { color: theme.accent }]}>{item.ticketNumber}</Text>
          <Text style={{ color: theme.ink }}>{item.status === 'READY' ? strings.display.call : item.status}</Text>
        </View>
      ))}
      <Text style={{ color: theme.muted }}>{strings.display.max}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.xl },
  title: { fontFamily: typography.display, fontSize: typography.heading, marginBottom: space.lg },
  input: { borderWidth: 1, borderRadius: 12, padding: space.md, fontFamily: typography.display, marginBottom: space.md },
  number: { fontFamily: typography.display, fontSize: 72, fontVariant: ['tabular-nums'] },
  row: { marginBottom: space.lg },
  error: { color: '#DC2626' },
});
