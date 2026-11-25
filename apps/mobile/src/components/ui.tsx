import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, radius, space, touch, typography, getTheme, type ThemeMode } from '../theme/tokens';
import { StationCode } from '@order-q/shared';

const stationColors: Record<string, string> = {
  BAR: palette.bar,
  KITCHEN: palette.kitchen,
  PASTRY: palette.pastry,
};

export function StationChip({ code, mode = 'dark' }: { code: StationCode; mode?: ThemeMode }) {
  const theme = getTheme(mode);
  return (
    <View style={[styles.chip, { backgroundColor: stationColors[code] ?? theme.muted }]}>
      <Text style={styles.chipText}>{code === 'BAR' ? 'Bar' : code === 'KITCHEN' ? 'Dapur' : 'Pastry'}</Text>
    </View>
  );
}

export function StatusBadge({ status, mode = 'dark' }: { status: string; mode?: ThemeMode }) {
  const theme = getTheme(mode);
  const color = theme.status[status as keyof typeof theme.status] ?? theme.muted;
  return (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={styles.chipText}>
        {status === 'ORDERED' ? 'Dipesan' : status === 'IN_PROGRESS' ? 'Dibuat' : status === 'READY' ? 'Siap' : status}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  mode = 'dark',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  mode?: ThemeMode;
}) {
  const theme = getTheme(mode);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? theme.muted : theme.accent, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** ETA ditampilkan sebagai "bar bahan bakar", bukan spinner. */
export function EtaBar({ min, max, mode = 'dark' }: { min: number; max: number; mode?: ThemeMode }) {
  const theme = getTheme(mode);
  const fill = Math.max(8, Math.min(100, (max / 60) * 100));
  return (
    <View style={styles.etaWrap}>
      <View style={[styles.etaTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.etaFill, { width: `${fill}%`, backgroundColor: theme.accent }]} />
      </View>
      <Text style={[styles.etaText, { color: theme.ink }]}>{min}–{max} menit</Text>
    </View>
  );
}

export function OfflineBadge() {
  return (
    <View style={[styles.chip, { backgroundColor: palette.cancelled }]}>
      <Text style={styles.chipText}>OFFLINE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  chipText: { color: palette.white, fontFamily: typography.body, fontSize: typography.caption, fontWeight: '700' },
  button: { minHeight: touch.action, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: palette.white, fontFamily: typography.body, fontSize: typography.title, fontWeight: '700' },
  etaWrap: { marginVertical: space.sm },
  etaTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  etaFill: { height: 8, borderRadius: radius.pill },
  etaText: { marginTop: space.xs, fontFamily: typography.display, fontVariant: ['tabular-nums'] },
});
