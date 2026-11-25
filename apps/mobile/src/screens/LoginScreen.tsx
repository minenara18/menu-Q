import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { endpoints } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useDeviceStore, tokens } from '../stores/device';
import { strings } from '../strings';
import { getTheme, space, radius, touch, typography } from '../theme/tokens';
import { PrimaryButton, OfflineBadge } from '../components/ui';
import type { LoginOption } from '@order-q/shared';
import type { RootStackParamList } from '../navigation/types';

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const config = useDeviceStore((s) => s.config);
  const [staff, setStaff] = useState<LoginOption[]>([]);
  const [selected, setSelected] = useState<LoginOption | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [reload, setReload] = useState(0);
  const theme = getTheme('light');

  useEffect(() => {
    if (config?.role === 'DISPLAY') {
      navigation.replace('Display');
      return;
    }
    let active = true;
    setOnline(true);
    endpoints
      .loginOptions(config?.outletCode ?? '')
      .then((res) => {
        if (active) {
          setStaff(res.staff);
          setOnline(true);
        }
      })
      .catch(() => {
        if (active) {
          setOnline(false);
          setStaff([]);
        }
      });
    return () => {
      active = false;
    };
  }, [config?.outletCode, config?.role, navigation, reload]);

  const login = useCallback(async () => {
    if (!selected || pin.length !== 6) return;
    setError('');
    try {
      const res = await endpoints.login(config?.outletCode ?? '', selected.id, pin);
      await tokens.set(res.accessToken);
      await tokens.setRefresh(res.refreshToken);
      navigation.replace(config?.role === 'KDS' ? 'KDS' : 'Shift');
    } catch (e) {
      const apiError = e as ApiError;
      setError(
        apiError.status === 401 || apiError.status === 429
          ? strings.login.locked
          : apiError.status === 0
            ? strings.login.serverError
            : strings.login.wrongPin,
      );
    }
  }, [selected, pin, config, navigation]);

  const pressDigit = (digit: string) => {
    setPin((prev) => {
      const next = (prev + digit).slice(0, 6);
      if (next.length === 6) void loginWith(next);
      return next;
    });
  };

  const loginWith = async (value: string) => {
    if (!selected) return;
    try {
      const res = await endpoints.login(config?.outletCode ?? '', selected.id, value);
      await tokens.set(res.accessToken);
      await tokens.setRefresh(res.refreshToken);
      navigation.replace(config?.role === 'KDS' ? 'KDS' : 'Shift');
    } catch (e) {
      const apiError = e as ApiError;
      setError(apiError.status === 401 || apiError.status === 429 ? strings.login.locked : strings.login.wrongPin);
      setPin('');
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>{strings.login.title}</Text>
      {!online ? (
        <View style={styles.offlineBox}>
          <OfflineBadge />
          <Text style={[styles.error, { color: theme.ink }]}>{strings.login.serverError}</Text>
          <PrimaryButton mode="light" label={strings.login.retry} onPress={() => setReload((n) => n + 1)} />
          <PrimaryButton mode="light" label={strings.login.goSettings} onPress={() => navigation.navigate('Setup')} />
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.ink }]}>{strings.login.pickStaff}</Text>
      {staff.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          accessibilityLabel={s.name}
          onPress={() => {
            setSelected(s);
            setPin('');
            setError('');
          }}
          style={[styles.staff, { borderColor: selected?.id === s.id ? theme.accent : theme.border }]}
        >
          <Text style={[styles.staffName, { color: theme.ink }]}>{s.name}</Text>
          <Text style={{ color: theme.muted }}>{s.role}</Text>
        </Pressable>
      ))}

      <Text accessibilityLabel={strings.login.pin} style={[styles.pin, { color: theme.ink }]}>
        {pin.replace(/./g, '•') || strings.login.pin}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Pressable key={d} accessibilityLabel={d} onPress={() => pressDigit(d)} style={styles.key}>
            <Text style={styles.keyText}>{d}</Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton mode="light" label={strings.login.pin} onPress={() => void login()} disabled={!selected || pin.length !== 6} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, padding: space.xl },
  title: { fontFamily: typography.display, fontSize: typography.heading, marginBottom: space.lg },
  label: { fontFamily: typography.body, marginTop: space.lg },
  staff: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginTop: space.sm, minHeight: touch.min },
  staffName: { fontFamily: typography.body, fontSize: typography.title },
  pin: { fontFamily: typography.display, fontSize: typography.heading, marginTop: space.xl, textAlign: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginVertical: space.lg },
  key: { width: 72, height: 56, alignItems: 'center', justifyContent: 'center', margin: 4, borderRadius: radius.md, backgroundColor: '#E7E1D8' },
  keyText: { fontFamily: typography.display, fontSize: typography.title },
  error: { color: '#DC2626', marginTop: space.md },
  offlineBox: { padding: space.md, borderRadius: radius.md, backgroundColor: '#FEE2E2' },
});
