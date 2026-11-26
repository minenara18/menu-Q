import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { endpoints } from '../api/endpoints';
import { tokens } from '../stores/device';
import { strings } from '../strings';
import { getTheme, space, radius, typography } from '../theme/tokens';
import { PrimaryButton } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

export function ShiftScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Shift'>) {
  const [cash, setCash] = useState('100000');
  const [error, setError] = useState('');
  const theme = getTheme('light');

  const open = async () => {
    const token = await tokens.get();
    if (!token) {
      navigation.replace('Login');
      return;
    }
    // Cek dulu agar tidak menghasilkan 409 yang terdengar seperti error.
    const current = await endpoints.currentShift(token).catch(() => null);
    if (!current) {
      try {
        await endpoints.openShift(token, Number(cash));
      } catch {
        setError(strings.shift.openFailed);
        return;
      }
    }
    // Server menurunkan shift aktif saat checkout; tidak perlu login ulang.
    navigation.replace('Cashier');
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{strings.shift.title}</Text>
      <Text style={{ color: theme.muted }}>{strings.shift.noShift}</Text>
      <Text accessibilityLabel={strings.shift.openingCash} style={[styles.label, { color: theme.ink }]}>
        {strings.shift.openingCash}
      </Text>
      <TextInput
        accessibilityLabel={strings.shift.openingCash}
        keyboardType="numeric"
        value={cash}
        onChangeText={setCash}
        style={[styles.input, { borderColor: theme.border, color: theme.ink }]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton mode="light" label={strings.shift.open} onPress={() => void open()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.xl },
  title: { fontFamily: typography.display, fontSize: typography.heading, marginBottom: space.md },
  label: { marginTop: space.xl, marginBottom: space.xs },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontFamily: typography.display },
  error: { color: '#DC2626', marginTop: space.md },
});
