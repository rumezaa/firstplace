import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { ApiNotConfigured, Loading, Screen } from '@/components/ui';
import { apiConfigProblem, isApiConfigured } from '@/lib/api';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { initializing } = useSession();

  // A fresh clone with no .env would otherwise show a stack of network errors.
  if (!isApiConfigured) return <ApiNotConfigured problem={apiConfigProblem} />;

  if (initializing) {
    return (
      <Screen>
        <Loading label="Finding your seat" />
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.cream },
        headerTintColor: colors.espresso,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="venue/[id]" options={{ title: '' }} />
      <Stack.Screen
        name="kiosk/[venueId]"
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen name="dashboard/[venueId]" options={{ title: 'Venue dashboard' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
    </Stack>
  );
}
