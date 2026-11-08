import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { LightPole } from '@/components/LightPole';
import { Button } from '@/components/ui';
import type { BoxLight } from '@/lib/conversations';
import { colors } from '@/lib/theme';

/** Shown once, right after the first sign-in. */
export const INTRO_SEEN_KEY = 'firstplace.intro.v1';

export const PAGES: { light: BoxLight; title: string; body: string }[] = [
  {
    light: 'green',
    title: 'See who’s open to talk',
    body: 'Every ChatterBox table has a small light. It tells you, at a glance, whether the person sitting there is happy to chat.',
  },
  {
    light: 'yellow',
    title: 'Three colours, no guessing',
    body: 'Green: someone’s open to talk, say hi. Red: they’d rather not right now. Yellow: the seat is free, take it.',
  },
  {
    light: 'off',
    title: 'Private by design',
    body: 'Nobody sees your profile. The lights never show who is sitting there, and you only see what you have in common once you both agree to talk.',
  },
];

export default function Welcome() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;
  const p = PAGES[page];

  async function finish() {
    await AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => undefined);
    router.replace('/');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8 }}>
        {!last ? (
          <Pressable onPress={() => void finish()} accessibilityRole="button" hitSlop={12}>
            <Text style={{ fontSize: 16, color: colors.mocha }}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ height: 20 }} />
        )}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 32 }}>
        <LightPole light={p.light} size="lg" />
        <View style={{ gap: 12 }}>
          <Text display accessibilityRole="header" style={{ fontSize: 32, lineHeight: 37, fontWeight: '700', letterSpacing: -0.6, color: colors.espresso, textAlign: 'center' }}>
            {p.title}
          </Text>
          <Text style={{ fontSize: 17, lineHeight: 25, color: colors.mocha, textAlign: 'center' }}>{p.body}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((_, i) => (
            <View key={i} style={{ width: i === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? colors.clay : colors.border }} />
          ))}
        </View>
        <Button label={last ? 'Start exploring' : 'Next'} onPress={() => (last ? void finish() : setPage(page + 1))} />
        {page > 0 ? <Button label="Back" variant="quiet" onPress={() => setPage(page - 1)} /> : null}
      </View>
    </SafeAreaView>
  );
}
