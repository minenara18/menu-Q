import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SubTicketStatus } from '@order-q/shared';
import type { Ticket } from '../api/endpoints';
import { endpoints } from '../api/endpoints';
import { tokens } from '../stores/device';
import { useRealtime } from '../realtime/useRealtime';
import { initialQueueState, reduceQueueEvent, type QueueEvent } from '../realtime/events';
import { strings } from '../strings';
import { getTheme, space, radius, typography } from '../theme/tokens';
import { OfflineBadge, PrimaryButton, StationChip } from '../components/ui';
import { TicketCard } from '../components/TicketCard';
import { Timer } from '../components/Timer';

interface WorkItem {
  subticketId: string;
  ticket: Ticket;
  stationCode: string;
  status: SubTicketStatus;
  startedAt?: string;
}

export function KDSScreen() {
  const { width } = useWindowDimensions();
  const columns = width > 840 ? 3 : 1;
  const theme = getTheme('dark');
  const client = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState(initialQueueState);
  const [undo, setUndo] = useState<{ id: string; back: SubTicketStatus } | null>(null);

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

  const tickets = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => endpoints.tickets((await tokens.get()) ?? ''),
    enabled: !!token,
    refetchInterval: online ? false : 5000, // polling fallback saat socket putus
  });

  const items: WorkItem[] = [];
  for (const ticket of tickets.data?.tickets ?? []) {
    for (const st of ticket.subtickets ?? []) {
      items.push({
        subticketId: st.id,
        ticket,
        stationCode: st.station?.code ?? '',
        status: st.status,
        startedAt: st.startedAt ? new Date(st.startedAt).toISOString() : undefined,
      });
    }
  }

  const act = async (item: WorkItem, status: SubTicketStatus, back: SubTicketStatus) => {
    const access = await tokens.get();
    if (!access) return;
    await endpoints.updateSubticket(access, item.subticketId, status);
    setUndo({ id: item.subticketId, back });
    setTimeout(() => setUndo(null), 5000);
    void client.invalidateQueries({ queryKey: ['tickets'] });
  };

  const renderColumn = (status: SubTicketStatus, label: string) => (
    <View key={status} style={[styles.column, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.columnTitle, { color: theme.ink }]}>{label}</Text>
      {items
        .filter((item) => item.status === status)
        .map((item) => (
          <View key={item.subticketId} style={styles.item}>
            <TicketCard
              mode="dark"
              ticket={{
                id: item.ticket.id,
                ticketNumber: item.ticket.ticketNumber,
                status: item.ticket.status,
                etaMin: item.ticket.etaMin,
                etaMax: item.ticket.etaMax,
                subtickets: [],
              }}
            />
            <StationChip code={item.stationCode as never} />
            {item.startedAt ? <Timer startedAt={item.startedAt} slaMinutes={10} /> : null}
            {status === SubTicketStatus.ORDERED ? (
              <PrimaryButton label={strings.kds.start} onPress={() => void act(item, SubTicketStatus.IN_PROGRESS, SubTicketStatus.ORDERED)} />
            ) : status === SubTicketStatus.IN_PROGRESS ? (
              <PrimaryButton label={strings.kds.finish} onPress={() => void act(item, SubTicketStatus.READY, SubTicketStatus.IN_PROGRESS)} />
            ) : null}
            {undo?.id === item.subticketId ? (
              <PrimaryButton
                label={strings.kds.undo}
                onPress={() => {
                  const current = undo;
                  setUndo(null);
                  void act(item, current.back, status);
                }}
              />
            ) : null}
          </View>
        ))}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.ink }]}>{strings.kds.title}</Text>
        {!online ? <OfflineBadge /> : null}
      </View>
      <ScrollView contentContainerStyle={[styles.wrap, { flexDirection: 'row', flexWrap: 'wrap', gap: space.md }]}>
        {renderColumn(SubTicketStatus.ORDERED, strings.kds.new)}
        {renderColumn(SubTicketStatus.IN_PROGRESS, strings.kds.working)}
        {renderColumn(SubTicketStatus.READY, strings.kds.ready)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg },
  title: { fontFamily: typography.display, fontSize: typography.heading },
  wrap: { padding: space.md },
  column: { borderWidth: 1, borderRadius: radius.md, padding: space.md, width: '100%' },
  columnTitle: { fontFamily: typography.body, fontSize: typography.title, marginBottom: space.sm },
  item: { marginBottom: space.md },
});
