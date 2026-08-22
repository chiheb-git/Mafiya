import React, { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { setBaseUrl } from '@workspace/api-client-react';
import { registerGlobals } from '@livekit/react-native';
import { useAudioPlayer } from 'expo-audio';
import { FilmVignette } from '@/components/cinematic';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN || null);
registerGlobals();

const queryClient = new QueryClient();

function GlobalAmbience() {
  const pathname = usePathname();
  const ambiencePlayer = useAudioPlayer(require('@/assets/audio/lobby-ambience.mp3'));
  const startedRef = React.useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (pathname === '/' || pathname === '') return; // still on the intro video screen
    startedRef.current = true;
    ambiencePlayer.loop = true;
    ambiencePlayer.volume = 0.3;
    ambiencePlayer.play();
  }, [pathname]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: '#0A0A0A' },
        animation: 'fade',
        animationDuration: 260,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={{ headerShown: false }} />
      <Stack.Screen name="room/[code]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
            <KeyboardProvider>
              <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
              <GlobalAmbience />
              <View style={{ flex: 1 }}>
                <RootLayoutNav />
                <FilmVignette intensity={0.28} />
              </View>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
