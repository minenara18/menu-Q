import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { SetupDeviceScreen } from '../screens/SetupDeviceScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ShiftScreen } from '../screens/ShiftScreen';
import { CashierHomeScreen } from '../screens/CashierHomeScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { SuccessScreen } from '../screens/SuccessScreen';
import { KDSScreen } from '../screens/KDSScreen';
import { DisplayScreen } from '../screens/DisplayScreen';
import { getTheme } from '../theme/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const theme = getTheme('dark');
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Setup"
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.ink,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Setup" component={SetupDeviceScreen} options={{ title: 'Setup Perangkat' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Masuk' }} />
        <Stack.Screen name="Shift" component={ShiftScreen} options={{ title: 'Shift' }} />
        <Stack.Screen name="Cashier" component={CashierHomeScreen} options={{ title: 'Beranda Kasir' }} />
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Pembayaran' }} />
        <Stack.Screen name="Success" component={SuccessScreen} options={{ title: 'Tiket', headerShown: false }} />
        <Stack.Screen name="KDS" component={KDSScreen} options={{ title: 'Dapur' }} />
        <Stack.Screen name="Display" component={DisplayScreen} options={{ title: 'Display' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
