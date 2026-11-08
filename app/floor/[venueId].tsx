import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LIGHT_INFO, fetchFloor, type FloorTable } from '@/lib/conversations';
import { fetchVenue } from '@/lib/venues';
import { colors } from '@/lib/theme';
import { useAsync } from '@/hooks/useAsync';
import { LightPole } from '@/components/LightPole';
import { Body, Caption, Card, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * The floor view. An NFC tag at the entrance opens this
 * (firstplace://floor/<venueId>): the whole floor at a glance, every table's
 * light, live. Tap a table to go to it; from there it's the usual flow.
 *
 * Positions are a simple schematic (up to six tables); the server only says
 * which colour each table shows, never who is sitting there.
 */
const SPOTS = [
  { left: '8%', top: '14%' },
  { left: '30%', top: '42%' },
  { left: '12%', top: '66%' },
  { left: '58%', top: '8%' },
  { left: '60%', top: '74%' },
  { left: '34%', top: '40%' },
] as const;

export default function FloorScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const router = useRouter();
  const venue = useAsync(() => fetchVenue(venueId), [venueId]);
  const floor = useAsync(() => fetchFloor(venueId), [venueId]);

  // Live while the screen is open: the lights change as people sit and leave.
  const reload = floor.reload;
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => void reload(), 3000);
      return () => clearInterval(t);
    }, [reload]),
  );

  const tables = floor.data ?? [];
  const green = tables.filter((t) => t.light === 'green').length;
  const name = venue.data?.name ?? 'This floor';

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ gap: 4 }}>
        <Title>{name}</Title>
        <Body>
          {floor.data
            ? green === 0
              ? 'No green lights right now. Yellow means ask in the app first.'
              : `${green} ${green === 1 ? 'table is' : 'tables are'} open to talk. Sit beside a green light and say hi.`
            : 'Reading the lights on this floor.'}
        </Body>
      </View>

      {floor.error ? <ErrorNote error={floor.error} onRetry={() => void floor.reload()} /> : null}
      {floor.loading && !floor.data ? <Loading label="Reading the lights" /> : null}

      {floor.data ? (
        <FloorPlan tables={tables} onOpen={(t) => router.push(`/table/${t.id}`)} />
      ) : null}

      {tables.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => router.push(`/table/${t.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${t.label}, light ${LIGHT_INFO[t.light].label}. ${LIGHT_INFO[t.light].meaning}`}
          style={{ minHeight: 44 }}
        >
          <Card className="flex-row items-center gap-4">
            <LightPole light={t.light} size="sm" />
            <View style={{ flex: 1, gap: 2 }}>
              <SectionTitle>
                {t.label}
                {t.mine ? ' · you' : ''}
              </SectionTitle>
              <Caption>
                {LIGHT_INFO[t.light].label}: {LIGHT_INFO[t.light].meaning}
              </Caption>
            </View>
          </Card>
        </Pressable>
      ))}

      <Caption>
        Off: just a table. Green: say hi. Yellow: ask in the app. Red: please don&apos;t disturb. Lights
        never show who is sitting there.
      </Caption>
    </Screen>
  );
}

function FloorPlan({ tables, onOpen }: { tables: FloorTable[]; onOpen: (t: FloorTable) => void }) {
  return (
    <View
      accessible={false}
      style={{
        aspectRatio: 1.1,
        width: '100%',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {/* Windows along the top edge */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: colors.claySoft }} />
      <Text style={{ position: 'absolute', top: 10, right: 12, fontSize: 12, color: colors.mocha }}>Windows</Text>
      {/* Book stacks down the right side */}
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            right: 10,
            top: `${30 + i * 15}%`,
            width: '22%',
            height: 10,
            borderRadius: 3,
            backgroundColor: colors.sunk,
          }}
        />
      ))}
      <Text style={{ position: 'absolute', bottom: 34, right: 12, fontSize: 12, color: colors.mocha }}>Stacks</Text>
      {/* Entrance, where the tag is */}
      <View style={{ position: 'absolute', bottom: 0, left: '40%', width: '20%', height: 6, backgroundColor: colors.clay }} />
      <Text style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: colors.mocha }}>
        You are here
      </Text>

      {tables.slice(0, SPOTS.length).map((t, i) => (
        <Pressable
          key={t.id}
          onPress={() => onOpen(t)}
          accessibilityRole="button"
          accessibilityLabel={`${t.label}, light ${LIGHT_INFO[t.light].label}`}
          style={{ position: 'absolute', ...SPOTS[i], alignItems: 'center', gap: 6, minWidth: 44, minHeight: 44 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 56,
                height: 36,
                borderRadius: 8,
                backgroundColor: colors.sunk,
                borderWidth: t.mine ? 2 : 1,
                borderColor: t.mine ? colors.clay : colors.border,
              }}
            />
            <LightPole light={t.light} size="sm" />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.espresso }}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
