import '../global.css';

import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { ApiNotConfigured, Loading, Screen } from '@/components/ui';
import { apiConfigProblem, isApiConfigured } from '@/lib/api';
import { colors } from '@/lib/theme';
import { HelpButton } from '@/components/HelpButton';

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
  const { initializing, session } = useSession();
  const segments = useSegments();

  // A fresh clone with no .env would otherwise show a stack of network errors.
  if (!isApiConfigured) return <ApiNotConfigured problem={apiConfigProblem} />;

  if (initializing) {
    return (
      <Screen>
        <Loading label="Finding your seat" />
      </Screen>
    );
  }

  const protectedRoutes = ['meetup', 'dashboard', 'waiting', 'conversation', 'rewards'];
  if (!session && protectedRoutes.includes(segments[0] ?? '')) return <Redirect href="/sign-in" />;

  return (
    <View key={session?.token ?? 'guest'} style={{ flex: 1 }}>
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
      <Stack.Screen name="table/[id]" options={{ title: '' }} />
      <Stack.Screen name="waiting/[requestId]" options={{ title: 'Request sent' }} />
      <Stack.Screen name="conversation" options={{ title: 'In conversation' }} />
      <Stack.Screen name="meetup/[connectionId]" options={{ title: 'Plan the next one' }} />
      <Stack.Screen name="box/[tableId]" options={{ headerShown: false }} />
      <Stack.Screen name="rewards" options={{ title: '' }} />
      <Stack.Screen name="help" options={{ title: 'Help', presentation: 'modal' }} />
      <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
    </Stack>
    {/* PRD: a Help button in the same place on every screen, signed in or not. */}
    <HelpButton />
    </View>
  );
}
