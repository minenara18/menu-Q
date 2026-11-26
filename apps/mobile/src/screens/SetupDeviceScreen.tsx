import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDeviceStore, type DeviceRole, type DeviceConfig } from '../stores/device';
import { strings } from '../strings';
import { getTheme, space, radius, typography, touch } from '../theme/tokens';
import { PrimaryButton } from '../components/ui';
import { getBaseUrl } from '../stores/device';
import type { RootStackParamList } from '../navigation/types';

export function SetupDeviceScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Setup'>) {
  const config = useDeviceStore((s) => s.config);
  const save = useDeviceStore((s) => s.save);
  const load = useDeviceStore((s) => s.load);
  const [serverUrl, setServerUrl] = useState(config?.serverUrl ?? getBaseUrl());
  const [outletCode, setOutletCode] = useState(config?.outletCode ?? '');
  const [role, setRole] = useState<DeviceRole>(config?.role ?? 'CASHIER');
  const [error, setError] = useState('');
  const theme = getTheme('light');

  useEffect(() => {
    void load().then(() => {
      const saved = useDeviceStore.getState().config;
      if (saved) {
        // KDS juga perlu login maker; hanya Display yang masuk langsung ke pairing.
        navigation.replace(saved.role === 'DISPLAY' ? 'Display' : 'Login');
      }
    });
  }, [load, navigation]);

  const submit = async () => {
    if (!serverUrl.trim() || !outletCode.trim()) {
      setError(strings.common.error);
      return;
    }
    await save({ serverUrl: serverUrl.trim(), outletCode: outletCode.trim().toUpperCase(), role });
    navigation.replace('Login');
  };

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{strings.setup.title}</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>{strings.setup.subtitle}</Text>

      <Text accessibilityLabel={strings.setup.server} style={[styles.label, { color: theme.ink }]}>{strings.setup.server}</Text>
      <TextInput
        accessibilityLabel={strings.setup.server}
        style={[styles.input, { borderColor: theme.border, color: theme.ink }]}
        value={serverUrl}
        onChangeText={setServerUrl}
        autoCapitalize="none"
        keyboardType="url"
      />

      <Text accessibilityLabel={strings.setup.outletCode} style={[styles.label, { color: theme.ink }]}>{strings.setup.outletCode}</Text>
      <TextInput
        accessibilityLabel={strings.setup.outletCode}
        style={[styles.input, { borderColor: theme.border, color: theme.ink }]}
        value={outletCode}
        onChangeText={setOutletCode}
        autoCapitalize="characters"
      />

      {(['CASHIER', 'KDS', 'DISPLAY'] as DeviceRole[]).map((r) => (
        <PrimaryButton
          key={r}
          mode="light"
          label={r === 'CASHIER' ? strings.setup.roleCashier : r === 'KDS' ? strings.setup.roleKds : strings.setup.roleDisplay}
          onPress={() => setRole(r)}
          disabled={role === r}
        />
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton mode="light" label={strings.setup.save} onPress={() => void submit()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: space.xl },
  title: { fontFamily: typography.display, fontSize: typography.heading, marginBottom: space.sm },
  sub: { fontFamily: typography.body, marginBottom: space.xl },
  label: { fontFamily: typography.body, marginTop: space.lg, marginBottom: space.xs },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: touch.min },
  error: { color: '#DC2626', marginTop: space.md },
});
