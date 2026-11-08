import '../global.css';

import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '@/providers/SessionProvider';
import { ApiNotConfigured, Loading, Screen } from '@/components/ui';
import { apiConfigProblem, isApiConfigured } from '@/lib/api';
import { colors } from '@/lib/theme';
import { HelpButton } from '@/components/HelpButton';
import { ConversationWatcher } from '@/components/ConversationWatcher';

export default function RootLayout() {
  // Bundled with the app, so this resolves almost instantly; until then (or if
  // a font fails) text falls back to the system face rather than blocking.
  useFonts({
    Fraunces_500Medium, Fraunces_600SemiBold,
    Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold,
  });
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

  const protectedRoutes = ['meetup', 'dashboard', 'waiting', 'conversation', 'rewards', 'onboarding'];
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
      <Stack.Screen name="floor/[venueId]" options={{ title: '' }} />
      <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="onboarding/index" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
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
    {/* Someone said hi at your table: open the conversation on your phone too. */}
    <ConversationWatcher />
    </View>
  );
}
