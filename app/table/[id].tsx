import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';

import { errorMessage } from '@/lib/api';
import {
  LIGHT_INFO,
  claimTable,
  fetchIncomingRequests,
  fetchTableView,
  joinGreen,
  leaveNow,
  respondToRequest,
  setLight,
  stepAway,
  type Light,
  type RequestCard,
} from '@/lib/conversations';
import { colors } from '@/lib/theme';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { useIsSignedIn } from '@/providers/SessionProvider';
import { LightPicker } from '@/components/LightPicker';
import { LightPole } from '@/components/LightPole';
import { Badge, Body, Button, Caption, Card, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * What you see after tapping a box (design kit v2, section 04):
 *   free (yellow)   → take it and pick green or red
 *   your claim      → status + light picker in one card, requests, leave
 *   someone's claim → one action for their light: say hi / ask / nothing
 */
export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const view = useAsync(() => fetchTableView(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = useIsSignedIn();
  const acting = useRef(false);

  const reload = useCallback(() => void view.reload(), [view]);
  useVenueTablesRealtime(id, reload);

  async function run(key: string, fn: () => Promise<unknown>) {
    if (acting.current) return;
    acting.current = true;
    setBusy(key);
    setError(null);
    try {
      await fn();
      await view.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      acting.current = false;
      setBusy(null);
    }
  }

  if (!view.data || view.error) {
    return (
      <Screen>
        {view.error ? <ErrorNote error={view.error} onRetry={reload} /> : <Loading label="Reading the box" />}
      </Screen>
    );
  }

  const { table, light, mine } = view.data;
  const stateLine =
    light === 'off' ? 'Not a ChatterBox table right now' : `${LIGHT_INFO[light].label}: ${LIGHT_INFO[light].meaning}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: '', headerShadowVisible: false }} />

      {mine ? (
        <MyTable
          tableLabel={table.label}
          venueName={table.venue_name}
          myLight={mine.light}
          busy={busy}
          onLight={(l) => run(`light-${l}`, () => setLight(l))}
          onStepAway={() => run('away', stepAway)}
          onLeave={() =>
            run('leave', async () => {
              await leaveNow();
              router.back();
            })
          }
          onConversation={() => router.push('/conversation')}
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <LightPole light={light} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, color: colors.espresso }}>
                {table.label}
              </Text>
              <Text style={{ fontSize: 15, color: colors.mocha }}>{table.venue_name}</Text>
              <Text style={{ fontSize: 15, color: colors.mocha }}>{stateLine}</Text>
            </View>
          </View>

          {error ? <ErrorNote error={error} /> : null}

          {!table.box_enabled ? (
            <Body className="mt-6">This table isn&apos;t a conversation zone right now.</Body>
          ) : light === 'off' && view.data.boxes_open === false && !mine ? (
            <View style={{ marginTop: 24, gap: 8 }}>
              <SectionTitle>Closed for the night</SectionTitle>
              <Body>Conversation tables are off from 10pm to 6am. You can still sit here; it&apos;s just a table.</Body>
            </View>
          ) : light === 'yellow' ? (
            // Yellow = free seat: take it and choose your light.
            <ClaimTable
              busy={busy}
              signedIn={signedIn}
              onSignIn={() => router.push('/sign-in')}
              onClaim={(l) => run('claim', () => claimTable(table.id, l))}
            />
          ) : light === 'green' ? (
            <View style={{ marginTop: 24, gap: 8 }}>
              <SectionTitle className="text-[22px] leading-[28px] font-bold">Walk over and say hi.</SectionTitle>
              <Body>Then tap below, and you&apos;ll both see what you have in common.</Body>
              <Button
                className="mt-5"
                label="I said hi"
                busy={busy === 'join'}
                onPress={() =>
                  run('join', async () => {
                    await joinGreen(table.id);
                    router.replace('/conversation');
                  })
                }
              />
            </View>
          ) : light === 'off' ? (
            <View style={{ marginTop: 24, gap: 8 }}>
              <SectionTitle className="text-[22px] leading-[28px] font-bold">This box is off</SectionTitle>
              <Body>It&apos;s closed or after hours. Any seat is just a seat for now.</Body>
            </View>
          ) : (
            <View style={{ marginTop: 24, gap: 8 }}>
              <SectionTitle className="text-[22px] leading-[28px] font-bold">Not open right now</SectionTitle>
              <Body>Please don&apos;t disturb. Other tables nearby may be open to talk.</Body>
            </View>
          )}
        </>
      )}

    </Screen>
  );
}

/* -------------------------------------------------------------- claiming -- */

function ClaimTable({
  busy,
  signedIn,
  onSignIn,
  onClaim,
}: {
  busy: string | null;
  signedIn: boolean;
  onSignIn: () => void;
  onClaim: (l: Light) => void;
}) {
  const [choice, setChoice] = useState<Light>('green');
  return (
    <View style={{ marginTop: 28, gap: 12 }}>
      <SectionTitle>Your light</SectionTitle>
      <LightPicker value={choice} onChange={setChoice} />
      {signedIn ? (
        <Button className="mt-5" label="Claim table" busy={busy === 'claim'} onPress={() => onClaim(choice)} />
      ) : (
        // A box tap opens this page signed out. Claiming needs an account.
        <Button className="mt-5" label="Sign in to claim" onPress={onSignIn} />
      )}
      <Caption className="text-center">For right now. Tables can&apos;t be reserved.</Caption>
    </View>
  );
}

function MyTable({
  tableLabel,
  venueName,
  myLight,
  busy,
  onLight,
  onStepAway,
  onLeave,
  onConversation,
}: {
  tableLabel: string;
  venueName: string;
  myLight: Light;
  busy: string | null;
  onLight: (l: Light) => void;
  onStepAway: () => void;
  onLeave: () => void;
  onConversation: () => void;
}) {
  return (
    <>
      <View style={{ gap: 4 }}>
        <Title>You&apos;re here</Title>
        <Text style={{ fontSize: 15, color: colors.mocha }}>
          {tableLabel} · {venueName}
        </Text>
      </View>

      <IncomingRequests onAccepted={onConversation} />

      <Card className="gap-3.5">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <LightPole light={myLight} size="sm" />
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.espresso }}>{LIGHT_INFO[myLight].label}</Text>
            <Text style={{ fontSize: 13, color: colors.mocha }}>The box shows the same</Text>
          </View>
        </View>
        <LightPicker value={myLight} onChange={onLight} disabled={Boolean(busy)} />
      </Card>

      <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden', marginTop: 8 }}>
        <Row icon="time-outline" label="I'll be right back" detail="Holds the table for 5 minutes" onPress={onStepAway} busy={busy === 'away'} />
        <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 52 }} />
        <Row icon="log-out-outline" label="Leave table" danger onPress={onLeave} busy={busy === 'leave'} />
      </View>
    </>
  );
}

function Row({
  icon,
  label,
  detail,
  danger,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  danger?: boolean;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 16, opacity: busy ? 0.5 : 1 }}
    >
      <Ionicons name={icon} size={22} color={danger ? colors.brick : colors.mocha} />
      <View style={{ flex: 1, paddingVertical: 12, gap: 2 }}>
        <Text style={{ fontSize: 17, color: danger ? colors.brick : colors.espresso }}>{label}</Text>
        {detail ? <Text style={{ fontSize: 13, color: colors.mocha }}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------- requests --- */

function IncomingRequests({ onAccepted }: { onAccepted: () => void }) {
  const requests = useAsync(fetchIncomingRequests, []);
  const reload = useCallback(() => void requests.reload(), [requests]);
  useVenueTablesRealtime(null, reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(30);
  const acting = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const cards = requests.data ?? [];
  if (error || requests.error) return <ErrorNote error={error ?? requests.error!} onRetry={() => { setError(null); reload(); }} />;
  if (requests.loading && !requests.data) return <Loading label="Checking requests" />;
  if (cards.length === 0) {
    return <Body className="px-1">No requests yet. Keep this screen open to see new requests.</Body>;
  }

  async function respond(card: RequestCard, accept: boolean) {
    if (acting.current) return;
    acting.current = true;
    setError(null);
    setBusy(`${card.id}-${accept}`);
    try {
      const r = await respondToRequest(card.id, accept, minutes);
      if (r.accepted) onAccepted();
      else await requests.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      acting.current = false;
      setBusy(null);
    }
  }

  return (
    <>
      {cards.map((card) => {
        const likes = [...new Set([...card.shared.interests, ...card.shared.topics])].slice(0, 3);
        return (
          <Card key={card.id} className="gap-4">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sunk, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 22, fontWeight: '600', color: colors.mocha }}>
                  {(card.first_name ?? '?').slice(0, 1)}
                </Text>
              </View>
              <View style={{ gap: 4, flex: 1 }}>
                <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.espresso }}>
                  {card.first_name ?? 'Someone'} wants to chat
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {card.verified ? <Badge label="Verified" tone="chat" /> : null}
                  {card.age_range ? <Badge label={card.age_range} /> : null}
                </View>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <KV k="You both like" v={likes.length ? likes.join(', ') : 'Nothing listed yet'} />
              {card.shared.languages.length ? <KV k="Both speak" v={card.shared.languages.join(', ')} /> : null}
              {card.comm_pref ? <KV k={`${card.first_name ?? 'They'} says`} v={`"${card.comm_pref}"`} /> : null}
            </View>
            <SectionTitle className="text-[15px]">How long?</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 2, padding: 3, backgroundColor: colors.sunk, borderRadius: 12 }}>
              {[15, 30, 45].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMinutes(m)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: minutes === m }}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: minutes === m ? colors.surface : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: minutes === m ? colors.espresso : colors.mocha }}>
                    {m} min
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ gap: 8 }}>
              <Button label="Accept" busy={busy === `${card.id}-true`} onPress={() => void respond(card, true)} />
              <Button label="Not right now" variant="quiet" busy={busy === `${card.id}-false`} onPress={() => void respond(card, false)} />
            </View>
            <Caption className="text-center">{card.first_name ?? 'They'} will only see &quot;not available&quot;.</Caption>
          </Card>
        );
      })}
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ width: 96, fontSize: 15, color: colors.mocha }}>{k}</Text>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: colors.espresso }}>{v}</Text>
    </View>
  );
}
