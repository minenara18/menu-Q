import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrderType, PaymentMethod } from '@order-q/shared';
import { endpoints } from '../api/endpoints';
import { ApiError } from '../api/client';
import { tokens } from '../stores/device';
import { useCartStore } from '../stores/cart';
import { strings } from '../strings';
import { formatIDR, getTheme, radius, space, typography } from '../theme/tokens';
import { cartSubtotal, changeDue, formatEta } from '../utils/cart';
import { newId } from '../utils/id';
import { PrimaryButton, EtaBar } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

export function PaymentScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Payment'>) {
  const theme = getTheme('light');
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const subtotal = cartSubtotal(lines);
  const [total, setTotal] = useState(subtotal);
  const [paid, setPaid] = useState(String(subtotal));
  const [error, setError] = useState('');
  const [eta, setEta] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const token = await tokens.get();
      if (!token || lines.length === 0) return;
      try {
        const result = await endpoints.validate(
          token,
          lines.map((l) => ({ menuId: l.menuId, qty: l.qty, note: l.note })),
        );
        if (!active) return;
        setTotal(result.total);
        setPaid(String(result.total));
        setEta(result.eta);
      } catch {
        // Biarkan total sementara; kesalahan akan muncul saat checkout.
      }
    })();
    return () => {
      active = false;
    };
  }, [lines]);

  const pay = async () => {
    const token = await tokens.get();
    if (!token) return;
    const clientTicketId = newId();
    try {
      const res = await endpoints.checkout(
        token,
        {
          items: lines.map((l) => ({ menuId: l.menuId, qty: l.qty, note: l.note })),
          orderType: OrderType.TAKEAWAY,
          payments: [{ method: PaymentMethod.CASH, amount: Number(paid) }],
          idempotencyKey: clientTicketId,
          clientTicketId,
        },
        clientTicketId,
      );
      clear();
      navigation.navigate('Success', {
        ticketNumber: res.ticket.ticketNumber,
        etaMin: res.ticket.etaMin ?? 0,
        etaMax: res.ticket.etaMax ?? 0,
      });
    } catch (e) {
      setError((e as ApiError).message ?? strings.common.error);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{strings.payment.title}</Text>
      <Text style={{ color: theme.ink }}>{strings.payment.total}: {formatIDR(total)}</Text>
      {eta ? <EtaBar min={eta.min} max={eta.max} mode="light" /> : null}
      <Text style={{ color: theme.muted }}>{formatEta(eta?.min, eta?.max)}</Text>

      <TextInput
        accessibilityLabel={strings.payment.paid}
        keyboardType="numeric"
        value={paid}
        onChangeText={setPaid}
        style={[styles.input, { borderColor: theme.border, color: theme.ink }]}
      />
      <View style={styles.quick}>
        {[total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000].map((v) => (
          <PrimaryButton key={v} mode="light" label={formatIDR(v)} onPress={() => setPaid(String(v))} />
        ))}
      </View>
      <Text style={[styles.change, { color: theme.ink }]}>
        {strings.payment.change}: {formatIDR(changeDue(total, Number(paid)))}
      </Text>
      {Number(paid) < total ? <Text style={styles.error}>{strings.payment.insufficient}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        mode="light"
        label={strings.payment.pay}
        disabled={Number(paid) < total || lines.length === 0}
        onPress={() => void pay()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.xl },
  title: { fontFamily: typography.display, fontSize: typography.heading, marginBottom: space.lg },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontFamily: typography.display, marginVertical: space.md },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  change: { fontFamily: typography.display, fontSize: typography.title, marginVertical: space.lg },
  error: { color: '#DC2626' },
});
