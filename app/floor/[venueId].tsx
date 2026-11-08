import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/Text';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

import { LIGHT_INFO, fetchFloor, type BoxLight, type FloorTable } from '@/lib/conversations';
import { FLOOR_LAYOUTS, type FloorLayout, type FloorPlan } from '@/lib/floorLayouts';
import { errorMessage } from '@/lib/api';
import { enterVenue, fetchRoom, fetchVenue, roomSummary } from '@/lib/venues';
import { colors } from '@/lib/theme';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/providers/SessionProvider';
import { Body, Button, Caption, Card, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * The floor view (docs/specs/2026-11-08-floor-map-design.md). An NFC tag at the
 * entrance opens <server>/v/<venueId>, which forwards to floor/<venueId>?here=1:
 * the whole floor at a glance, every table's live light, and the room in
 * counts. Arriving from the tag checks you in to the venue (no profile goes
 * over NFC; your login says who you are). Pick a table; from there it's the
 * usual table flow. Colours and counts only, never who is sitting where.
 */
const DOT: Record<BoxLight, string> = { green: colors.go, yellow: colors.ask, red: colors.stop, off: '#B9BCB8' };
const CHIP: Record<BoxLight, string> = { green: 'Say hi', yellow: 'Ask first', red: 'Not now', off: 'Just a table' };

export default function FloorScreen() {
  const { venueId, here } = useLocalSearchParams<{ venueId: string; here?: string }>();
  const router = useRouter();
  const { session } = useSession();
  const venue = useAsync(() => fetchVenue(venueId), [venueId]);
  const floor = useAsync(() => fetchFloor(venueId), [venueId]);
  const room = useAsync(() => fetchRoom(venueId), [venueId]);
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);

  const reloadRoom = room.reload;
  const checkIn = useCallback(async () => {
    setEntering(true);
    setEnterError(null);
    try {
      await enterVenue(venueId);
      await reloadRoom();
    } catch (e) {
      setEnterError(errorMessage(e));
    } finally {
      setEntering(false);
    }
  }, [venueId, reloadRoom]);

  // Opened from the entrance tag: check in once, without a tap.
  const autoEntered = useRef(false);
  useEffect(() => {
    if (here !== '1' || !session || autoEntered.current) return;
    autoEntered.current = true;
    void checkIn();
  }, [here, session, checkIn]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // useAsync keeps the last good data when a refresh fails, so the lights stay
  // on screen with an error and Retry (spec: behaviour).
  const tables = floor.data ?? [];
  const loaded = Boolean(floor.data);

  const reload = floor.reload;
  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => {
        void reload();
        void reloadRoom();
      }, 3000);
      return () => clearInterval(t);
    }, [reload, reloadRoom]),
  );

  const layout = FLOOR_LAYOUTS[venueId];
  const counts: Record<BoxLight, number> = { green: 0, yellow: 0, red: 0, off: 0 };
  for (const t of tables) counts[t.light] += 1;
  const lightSummary =
    [counts.green ? `${counts.green} open to talk` : '', counts.yellow ? `${counts.yellow} asking first` : '']
      .filter(Boolean)
      .join(' · ') || 'No open lights right now';

  const selected = tables.find((t) => t.id === selectedId) ?? null;
  const open = (t: FloorTable) => router.push(`/table/${t.id}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />

      <Card className="gap-1">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Title>{venue.data?.name ?? 'This floor'}</Title>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: floor.error ? colors.mocha : colors.clay }} />
            <Caption>{floor.error ? 'Offline' : 'Live'}</Caption>
          </View>
        </View>
        <Body>{room.data ? roomSummary(room.data) : loaded ? lightSummary : 'Reading the lights on this floor.'}</Body>
        <CheckInRow
          signedIn={Boolean(session)}
          here={room.data?.here ?? false}
          busy={entering}
          error={enterError}
          onCheckIn={() => void checkIn()}
          onSignIn={() => router.push('/sign-in')}
        />
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['green', 'yellow', 'red', 'off'] as BoxLight[]).map((l) => (
          <View
            key={l}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: DOT[l] }} />
            <Text style={{ fontSize: 13, color: colors.espresso }}>{CHIP[l]}</Text>
          </View>
        ))}
      </View>

      {floor.error ? <ErrorNote error={floor.error} onRetry={() => void floor.reload()} /> : null}
      {!loaded && floor.loading ? <Loading label="Reading the lights" /> : null}

      {layout && loaded ? (
        <FloorMap layout={layout} tables={tables} selectedId={selectedId} onSelect={(t) => setSelectedId(t.id)} />
      ) : null}

      {selected ? <TableSheet table={selected} onOpen={() => open(selected)} /> : null}

      {tables.length ? <SectionTitle>Tables on this floor</SectionTitle> : null}
      {loaded && tables.length === 0 ? <Body>No FirstPlace tables on this floor yet.</Body> : null}
      {tables.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => open(t)}
          accessibilityRole="button"
          accessibilityLabel={`${t.label}${t.mine ? ', your table' : ''}. ${LIGHT_INFO[t.light].label}: ${LIGHT_INFO[t.light].meaning}`}
          style={{ minHeight: 44 }}
        >
          <Card className="flex-row items-center gap-3">
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: DOT[t.light] }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.espresso }}>
                {t.label}
                {t.mine ? ' · you' : ''}
              </Text>
              <Caption>
                {LIGHT_INFO[t.light].label}: {LIGHT_INFO[t.light].meaning}
              </Caption>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

/** "You're checked in here", an "I'm here" button, or a nudge to sign in. */
function CheckInRow({
  signedIn,
  here,
  busy,
  error,
  onCheckIn,
  onSignIn,
}: {
  signedIn: boolean;
  here: boolean;
  busy: boolean;
  error: string | null;
  onCheckIn: () => void;
  onSignIn: () => void;
}) {
  if (!signedIn) {
    return (
      <View className="mt-2 gap-2">
        <Caption>Sign in to check in and see what you have in common with people here.</Caption>
        <Button label="Sign in" variant="secondary" onPress={onSignIn} />
      </View>
    );
  }
  if (here) return <Caption>You&apos;re checked in here.</Caption>;
  return (
    <View className="mt-2 gap-2">
      {error ? <ErrorNote error={error} onRetry={onCheckIn} /> : null}
      <Button
        label="I'm here"
        variant="secondary"
        busy={busy}
        accessibilityHint="Checks you in to this place. Nobody sees your name."
        onPress={onCheckIn}
      />
    </View>
  );
}

function FloorMap({
  layout,
  tables,
  selectedId,
  onSelect,
}: {
  layout: FloorLayout;
  tables: FloorTable[];
  selectedId: string | null;
  onSelect: (t: FloorTable) => void;
}) {
  const pct = (n: number) => `${n * 100}%` as const;
  return (
    <View
      style={{
        aspectRatio: layout.aspect,
        width: '100%',
        // Phone-sized on laptops and tablets too, so the whole floor fits on screen.
        maxWidth: 440,
        alignSelf: 'center',
        // A real plan floats on the page like a printed map; the schematic gets a card.
        ...(layout.plan
          ? {}
          : { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' as const }),
      }}
    >
      {layout.plan ? (
        <PlanDrawing plan={layout.plan} labels={layout.labels ?? []} />
      ) : (
        <>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 5, backgroundColor: colors.claySoft }} />
          <View
            style={{ position: 'absolute', top: 0, bottom: 0, left: pct(layout.corridor.x), width: pct(layout.corridor.w), backgroundColor: colors.cream }}
          />
        </>
      )}
      <Text style={{ position: 'absolute', top: 2, right: 2, fontSize: 11, fontWeight: '700', color: colors.mocha }}>N ↑</Text>
      {layout.zones.map((z) => (
        <View
          key={z.label}
          style={{ position: 'absolute', left: pct(z.x), top: pct(z.y), width: pct(z.w), height: pct(z.h), borderRadius: 10, backgroundColor: colors.sunk }}
        >
          <Text style={{ position: 'absolute', bottom: 4, left: 6, right: 4, fontSize: 10, color: colors.mocha }} numberOfLines={1}>
            {z.label}
          </Text>
        </View>
      ))}
      <View
        style={{ position: 'absolute', left: pct(layout.entrance.x), top: pct(layout.entrance.y), width: 90, marginLeft: -45, marginTop: -14, alignItems: 'center' }}
      >
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.clay, borderWidth: 2, borderColor: colors.surface }} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.clay }}>You are here</Text>
      </View>

      {tables.map((t, i) => {
        const spot = t.pos_x != null && t.pos_y != null ? { x: t.pos_x, y: t.pos_y } : layout.defaultSpots[i];
        if (!spot) return null;
        return <TableMarker key={t.id} table={t} x={spot.x} y={spot.y} selected={selectedId === t.id} onPress={() => onSelect(t)} />;
      })}
    </View>
  );
}

/**
 * The traced building in FirstPlace's palette: a soft shadow, white floor,
 * rooms in warm grey separated by white gaps instead of lines, corridors in a pale teal wash, stairs and elevators in
 * the accent, washrooms muted. Area names sit on top, quietly.
 */
function PlanDrawing({ plan, labels }: { plan: FloorPlan; labels: { text: string; x: number; y: number }[] }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${plan.w} ${plan.h}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', top: 0, left: 0 }}
      // Decoration only: the markers and the list carry everything for screen readers.
      pointerEvents="none"
      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { importantForAccessibility: 'no-hide-descendants' as const })}
    >
      {/* Shadow, then the floor. No outline: the shape alone carries the building. */}
      <Path d={plan.outline} fill="#000" opacity={0.07} transform="translate(0 6)" />
      <Path d={plan.outline} fill={colors.surface} />
      <G>
        {plan.corridors.map((d, i) => (
          <Path key={`c${i}`} d={d} fill={colors.claySoft} />
        ))}
        {plan.rooms.map((d, i) => (
          <Path key={`r${i}`} d={d} fill={colors.sunk} stroke={colors.surface} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {plan.washrooms.map((d, i) => (
          <Path key={`w${i}`} d={d} fill="#DCDCD6" />
        ))}
        {plan.stairs.map((d, i) => (
          <Path key={`s${i}`} d={d} fill={colors.clay} opacity={0.25} />
        ))}
        {plan.elevators.map((d, i) => (
          <Path key={`e${i}`} d={d} fill={colors.clay} opacity={0.5} />
        ))}
      </G>
      {labels.map((l) => (
        <SvgText
          key={l.text}
          x={l.x * plan.w}
          y={l.y * plan.h}
          fontSize={15}
          fontWeight="600"
          fill={colors.mocha}
          textAnchor="middle"
        >
          {l.text}
        </SvgText>
      ))}
    </Svg>
  );
}

function TableMarker({ table, x, y, selected, onPress }: { table: FloorTable; x: number; y: number; selected: boolean; onPress: () => void }) {
  // Green gently pulses, unless the person has asked for reduced motion.
  const [pulse] = useState(() => new Animated.Value(1));
  const flip = x > 0.55;
  useEffect(() => {
    if (table.light !== 'green') return;
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.4, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [table.light, pulse]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${table.label}${table.mine ? ', your table' : ''}, ${LIGHT_INFO[table.light].label}`}
      style={{
        position: 'absolute',
        top: `${y * 100}%`,
        marginTop: -22,
        minHeight: 44,
        alignItems: 'center',
        gap: 0,
        // Labels on the right half go to the left of the dot so they never clip.
        ...(flip
          ? { right: `${(1 - x) * 100}%`, marginRight: -22, flexDirection: 'row-reverse' }
          : { left: `${x * 100}%`, marginLeft: -22, flexDirection: 'row' }),
      }}
    >
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        {table.light === 'green' ? (
          <Animated.View style={{ position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: colors.go, opacity: 0.25, transform: [{ scale: pulse }] }} />
        ) : null}
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: DOT[table.light],
            borderWidth: selected || table.mine ? 3 : 2,
            borderColor: selected ? colors.espresso : table.mine ? colors.clay : colors.surface,
          }}
        />
      </View>
      {/* Short room code on the map; the full name and meaning are in the card and list. */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.espresso }}>
        {table.mine ? 'You' : table.label.split(' · ')[0]}
      </Text>
    </Pressable>
  );
}

function TableSheet({ table, onOpen }: { table: FloorTable; onOpen: () => void }) {
  const action = table.mine
    ? 'Open my table'
    : table.light === 'green'
      ? 'Go to this table'
      : table.light === 'yellow'
        ? 'Ask to join'
        : table.light === 'off'
          ? 'Sit here'
          : null;
  return (
    <Card className="gap-2">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: DOT[table.light] }} />
        <SectionTitle>{table.label}</SectionTitle>
      </View>
      <Body>{table.mine ? 'This is your table.' : `${LIGHT_INFO[table.light].meaning}.`}</Body>
      {action ? <Button label={action} onPress={onOpen} /> : <Caption>They&apos;d rather not be disturbed right now.</Caption>}
    </Card>
  );
}
