import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { registerRootComponent } from 'expo';
import { AppNavigator } from './src/navigation';
import { palette } from './src/theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
});

function App() {
  const [loaded, fontError] = useFonts({
    SpaceGrotesk: SpaceGrotesk_400Regular,
    SpaceGroteskBold: SpaceGrotesk_700Bold,
    Inter: Inter_400Regular,
    InterBold: Inter_700Bold,
  });

  if (fontError) {
    console.warn('[Order-Q] Font gagal dimuat, memakai font sistem:', String(fontError));
  }
  // Web/DevTools: jangan mem-blok UI bila font belum siap (smoke UI harus tetap jalan).
  if (!loaded && Platform.OS !== 'web') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.charcoal }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <AppNavigator />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(App);
export default App;
