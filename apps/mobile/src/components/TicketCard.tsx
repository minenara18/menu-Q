import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { palette, radius, space, typography, getTheme, type ThemeMode } from '../theme/tokens';
import type { QueueTicket } from '../realtime/events';
import { SubTicketStatus } from '@order-q/shared';

interface Props {
  ticket: QueueTicket;
  mode?: ThemeMode;
  compact?: boolean;
  onPress?: () => void;
}

/** Ticket-shaped card with SVG zigzag perforation and a large ticket number. */
export function TicketCard({ ticket, mode = 'dark', compact = false, onPress }: Props) {
  const theme = getTheme(mode);
  const styles = makeStyles(theme, compact);
  const statusColor =
    theme.status[ticket.status as keyof typeof theme.status] ?? theme.muted;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={{ opacity }}>
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Svg height={8} width={320} style={styles.perforation}>
          <Path d="M0 4 L8 0 L16 8 L24 0 L32 8 L40 0 L48 8 L56 0 L64 8 L72 0 L80 8 L88 0 L96 8 L104 0 L112 8 L120 0 L128 8 L136 0 L144 8 L152 0 L160 8 L168 0 L176 8 L184 0 L192 8 L200 0 L208 8 L216 0 L224 8 L232 0 L240 8 L248 0 L256 8 L264 0 L272 8 L280 0 L288 8 L296 0 L304 8 L312 0 L320 8"
            stroke={statusColor} strokeWidth={2} fill="none" />
        </Svg>

        <View style={styles.body}>
          <Text accessibilityLabel={`Nomor tiket ${ticket.ticketNumber}`} style={styles.number}>
            {ticket.ticketNumber}
          </Text>
          {!compact && (
            <View style={styles.row}>
              {ticket.subtickets.map((s) => (
                <Text key={s.id} style={[styles.station, { color: theme.station[s.stationCode as keyof typeof theme.station] ?? theme.muted }]}>
                  {s.stationCode ?? s.stationId.slice(0, 3)}
                </Text>
              ))}
            </View>
          )}
          <Text style={[styles.status, { color: statusColor }]}>
            {statusLabel(ticket.status)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function statusLabel(status: string): string {
  switch (status) {
    case SubTicketStatus.ORDERED:
      return 'Dipesan';
    case SubTicketStatus.IN_PROGRESS:
      return 'Dibuat';
    case SubTicketStatus.READY:
      return 'Siap';
    case SubTicketStatus.CANCELLED:
      return 'Batal';
    default:
      return 'Selesai';
  }
}

function makeStyles(theme: ReturnType<typeof getTheme>, compact: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderRadius: radius.md,
      overflow: 'hidden',
      marginVertical: space.sm,
      minHeight: compact ? 72 : 132,
    },
    perforation: { alignSelf: 'stretch' },
    body: { padding: compact ? space.sm : space.lg },
    number: {
      fontFamily: typography.display,
      fontSize: compact ? 24 : typography.ticket,
      color: theme.ink,
      fontVariant: ['tabular-nums'],
    },
    row: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
    station: { fontFamily: typography.body, fontSize: typography.caption, fontWeight: '700' },
    status: { marginTop: space.xs, fontFamily: typography.body, fontSize: typography.bodySize },
  });
}

export { palette };
