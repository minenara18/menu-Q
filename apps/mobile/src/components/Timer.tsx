import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, space, typography, getTheme, type ThemeMode } from '../theme/tokens';

export function timerColor(elapsedMs: number, slaMs: number): string {
  if (slaMs <= 0) return palette.ready;
  const ratio = elapsedMs / slaMs;
  if (ratio < 0.6) return palette.ready;
  if (ratio < 1) return palette.ordered;
  return palette.cancelled;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface Props {
  startedAt: string | number | Date;
  slaMinutes: number;
  now?: number;
  mode?: ThemeMode;
}

/** SLA timer: warna hijau → kuning → merah, teks tetap terbaca (bukan hanya warna). */
export function Timer({ startedAt, slaMinutes, now, mode = 'dark' }: Props) {
  const [tick, setTick] = useState(now ?? Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [now]);

  const elapsed = tick - new Date(startedAt).getTime();
  const color = timerColor(elapsed, slaMinutes * 60_000);
  const theme = getTheme(mode);

  return (
    <View style={[styles.pill, { backgroundColor: theme.surface, borderColor: color }]}>
      <Text accessibilityLabel={`Waktu berjalan ${formatElapsed(elapsed)}`} style={[styles.text, { color }]}>
        {formatElapsed(elapsed)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  text: {
    fontFamily: typography.display,
    fontSize: typography.bodySize,
    fontVariant: ['tabular-nums'],
  },
});
