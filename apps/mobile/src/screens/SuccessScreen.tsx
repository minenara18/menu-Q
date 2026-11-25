import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { strings } from '../strings';
import { getTheme, space, typography } from '../theme/tokens';
import { EtaBar } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

export function SuccessScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Success'>) {
  const theme = getTheme('light');
  const { ticketNumber, etaMin, etaMax } = route.params;

  useEffect(() => {
    const id = setTimeout(() => navigation.replace('Cashier'), 3000);
    return () => clearTimeout(id);
  }, [navigation]);

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{strings.success.title}</Text>
      <Text accessibilityLabel={`Nomor tiket ${ticketNumber}`} style={[styles.number, { color: theme.accent }]}>
        {ticketNumber}
      </Text>
      <EtaBar min={etaMin} max={etaMax} mode="light" />
      <Text style={{ color: theme.muted }}>{strings.success.backIn(3)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  title: { fontFamily: typography.body, fontSize: typography.title },
  number: { fontFamily: typography.display, fontSize: 96, fontVariant: ['tabular-nums'], marginVertical: space.xl },
});
