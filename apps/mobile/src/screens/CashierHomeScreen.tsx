import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StationCode, OrderType, PaymentMethod } from '@order-q/shared';
import type { MenuItem, Ticket } from '../api/endpoints';
import { endpoints } from '../api/endpoints';
import { tokens } from '../stores/device';
import { useCartStore } from '../stores/cart';
import { useRealtime } from '../realtime/useRealtime';
import { initialQueueState, reduceQueueEvent, type QueueEvent } from '../realtime/events';
import { strings } from '../strings';
import { formatIDR, getTheme, space, radius, typography } from '../theme/tokens';
import { TicketCard } from '../components/TicketCard';
import { PrimaryButton, StationChip } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

export function CashierHomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Cashier'>) {
  const { width } = useWindowDimensions();
  const columns = width > 840 ? 2 : 1;
  const theme = getTheme('light');
  const client = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [station, setStation] = useState<StationCode | null>(null);
  const [queue, setQueue] = useState(initialQueueState);
  const [online, setOnline] = useState(true);
  const lines = useCartStore((s) => s.lines);
  const add = useCartStore((s) => s.add);

  React.useEffect(() => {
    void tokens.get().then(setToken);
  }, []);

  const onEvent = useCallback(
    (event: QueueEvent) => {
      setQueue((state) => reduceQueueEvent(state, event));
      void client.invalidateQueries({ queryKey: ['tickets'] });
    },
    [client],
  );
  const onOnline = useCallback((value: boolean) => setOnline(value), []);
  useRealtime(token, onEvent, onOnline);

  const menus = useQuery({
    queryKey: ['menus'],
    queryFn: async () => endpoints.menus((await tokens.get()) ?? ''),
    enabled: !!token,
  });
  const tickets = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => endpoints.tickets((await tokens.get()) ?? ''),
    enabled: !!token,
  });

  const visible = useMemo(() => {
    return (menus.data ?? []).filter(
      (m) =>
        (!station || m.stationCode === station) &&
        m.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [menus.data, station, search]);

  const active = tickets.data?.tickets ?? [];

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.title, { color: theme.ink }]}>{strings.cashier.title}</Text>
        <TextInput
          accessibilityLabel={strings.cashier.search}
          placeholder={strings.cashier.search}
          value={search}
          onChangeText={setSearch}
          style={[styles.search, { borderColor: theme.border, color: theme.ink }]}
        />
        <ScrollView horizontal style={styles.filters}>
          {([null, StationCode.BAR, StationCode.KITCHEN, StationCode.PASTRY] as Array<StationCode | null>).map((code) => (
            <PrimaryButton
              key={code ?? 'all'}
              mode="light"
              label={code ?? 'Semua'}
              disabled={station === code}
              onPress={() => setStation(code)}
            />
          ))}
        </ScrollView>

        <View style={styles.grid}>
          {visible.map((menu) => (
            <View key={menu.id} style={[styles.menu, { backgroundColor: theme.surface, borderColor: theme.border, width: `${100 / columns - 3}%` }]}>
              <StationChip code={menu.stationCode as StationCode} mode="light" />
              <Text style={{ color: theme.ink, fontFamily: typography.body }}>{menu.name}</Text>
              <Text style={{ color: theme.ink, fontFamily: typography.display }}>{formatIDR(menu.price)}</Text>
              <Text style={{ color: menu.availability === 'UNAVAILABLE' ? '#DC2626' : theme.muted }}>
                {menu.availability === 'UNAVAILABLE' ? strings.cashier.soldOut : strings.cashier.remaining(99)}
              </Text>
              <PrimaryButton
                mode="light"
                label="+"
                disabled={menu.availability === 'UNAVAILABLE'}
                onPress={() => add({ menuId: menu.id, qty: 1, note: '', name: menu.name, price: menu.price })}
              />
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Strip antrean persisten */}
      <View style={[styles.strip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.ink, fontFamily: typography.body }}>{strings.cashier.activeTickets}</Text>
        <ScrollView horizontal>
          {active.slice(0, 12).map((ticket) => (
            <TicketCard
              key={ticket.id}
              compact
              mode="light"
              ticket={{
                id: ticket.id,
                ticketNumber: ticket.ticketNumber,
                status: ticket.status,
                etaMin: ticket.etaMin,
                etaMax: ticket.etaMax,
                subtickets: (ticket.subtickets ?? []).map((s) => ({
                  id: s.id,
                  stationId: s.stationId,
                  stationCode: s.station?.code,
                  status: s.status,
                })),
              }}
            />
          ))}
        </ScrollView>
      </View>

      <View style={[styles.cart, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.ink }}>{strings.cashier.cart}: {lines.length}</Text>
        <PrimaryButton
          mode="light"
          label={strings.cashier.checkout}
          disabled={lines.length === 0}
          onPress={() => navigation.navigate('Payment')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wrap: { padding: space.lg, paddingBottom: 160 },
  title: { fontFamily: typography.display, fontSize: typography.heading, marginBottom: space.md },
  search: { borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: 48 },
  filters: { flexDirection: 'row', marginVertical: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  menu: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, gap: 4 },
  strip: { position: 'absolute', left: 0, right: 0, bottom: 72, borderTopWidth: 1, padding: space.sm },
  cart: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, padding: space.sm },
});
