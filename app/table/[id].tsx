import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MIN_TAP_TARGET } from '@/lib/theme';

import { errorMessage } from '@/lib/api';
import {
  LIGHT_INFO,
  claimTable,
  fetchIncomingRequests,
  fetchTableView,
  joinGreen,
  leaveNow,
  requestChat,
  respondToRequest,
  setLight,
  stepAway,
  type Light,
  type RequestCard,
} from '@/lib/conversations';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { LightPole } from '@/components/LightPole';
import { Badge, Body, Button, Caption, Card, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * What you see after tapping a box. Three cases:
 *   - nobody's claim  → claim it and pick a light (yellow by default)
 *   - your claim      → change your light, see requests, step away, leave
 *   - someone's claim → join on green, request on yellow, leave them be on red
 */
export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const view = useAsync(() => fetchTableView(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => void view.reload(), [view]);
  useVenueTablesRealtime(id, reload);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await view.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (!view.data) {
    return (
      <Screen>
        {view.error ? <ErrorNote error={view.error} onRetry={reload} /> : <Loading label="Reading the box" />}
      </Screen>
    );
  }

  const { table, light, mine } = view.data;
  const title = `${table.label} · ${table.venue_name}`;

  return (
    <Screen>
      <Stack.Screen options={{ title: table.venue_name }} />
      <View className="gap-1">
        <Title>{mine ? "You're here" : 'Conversation zone'}</Title>
        <Caption>{title}</Caption>
      </View>

      <LightPole light={light} size="lg" />
      <Body className="text-center">
        {LIGHT_INFO[light].label}: {LIGHT_INFO[light].meaning}
      </Body>

      {error ? <ErrorNote error={error} /> : null}

      {!table.box_enabled ? (
        <Card accent="amber">
          <Body>This table isn&apos;t a conversation zone right now.</Body>
        </Card>
      ) : mine ? (
        <MyTable
          myLight={mine.light}
          busy={busy}
          onLight={(l) => run(`light-${l}`, () => setLight(l))}
          onStepAway={() => run('away', stepAway)}
          onLeave={() => run('leave', async () => { await leaveNow(); router.back(); })}
          onConversation={() => router.push('/conversation')}
        />
      ) : light === 'off' ? (
        <ClaimTable busy={busy} onClaim={(l) => run('claim', () => claimTable(table.id, l))} />
      ) : light === 'green' ? (
        <Card accent="sage" className="gap-3">
          <SectionTitle>Open to talk to anyone</SectionTitle>
          <Body>Walk over and say hi. Tap below so you both see the topics you share.</Body>
          <Button
            label="Say hi and join"
            busy={busy === 'join'}
            onPress={() =>
              run('join', async () => {
                await joinGreen(table.id);
                router.replace('/conversation');
              })
            }
          />
        </Card>
      ) : light === 'yellow' ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>They choose who they talk to</SectionTitle>
          <Body>Send a request. They&apos;ll see your first name and what you have in common, nothing more.</Body>
          <Button
            label="Request to chat"
            busy={busy === 'request'}
            onPress={() =>
              run('request', async () => {
                const r = await requestChat(table.id);
                router.replace(`/waiting/${r.request_id}`);
              })
            }
          />
        </Card>
      ) : (
        <Card accent="brick" className="gap-2">
          <SectionTitle>Not open right now</SectionTitle>
          <Body>Please don&apos;t disturb. Another table might be open to talk.</Body>
        </Card>
      )}

      <Caption className="text-center">
        Conversation zone. Anyone can sit here. Light off: just a table. Green: say hi. Yellow: request
        through the app. Red: please don&apos;t disturb.
      </Caption>
    </Screen>
  );
}

/* -------------------------------------------------------------- claiming -- */

function LightPicker({ value, onPick, busy }: { value: Light; onPick: (l: Light) => void; busy: string | null }) {
  return (
    <View className="gap-2" accessibilityRole="radiogroup">
      {(['green', 'yellow', 'red'] as Light[]).map((l) => {
        const selected = value === l;
        return (
          <Pressable
            key={l}
            onPress={() => onPick(l)}
            disabled={Boolean(busy)}
            accessibilityRole="radio"
            accessibilityLabel={`${LIGHT_INFO[l].label}: ${LIGHT_INFO[l].meaning}`}
            accessibilityState={{ selected, disabled: Boolean(busy) }}
            style={{ minHeight: MIN_TAP_TARGET }}
            className={`rounded-tile flex-row items-center gap-3 border-2 px-4 py-3 active:opacity-80 ${
              selected ? 'bg-clay-soft border-clay' : 'bg-surface border-border-warm'
            } ${busy ? 'opacity-50' : ''}`}
          >
            <Text className="text-espresso w-5 text-center text-lg font-bold">{LIGHT_INFO[l].symbol}</Text>
            <View className="flex-1">
              <Text className="text-espresso text-base font-semibold">{LIGHT_INFO[l].label}</Text>
              <Caption>{LIGHT_INFO[l].meaning}</Caption>
            </View>
            {selected ? <Text className="text-clay text-sm font-semibold">Selected</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ClaimTable({ busy, onClaim }: { busy: string | null; onClaim: (l: Light) => void }) {
  const [choice, setChoice] = useState<Light>('yellow');
  return (
    <Card className="gap-3">
      <SectionTitle>Claim this table</SectionTitle>
      <Body>Choose your light. Yellow means people can ask, and you decide.</Body>
      <LightPicker value={choice} onPick={setChoice} busy={null} />
      <Button label="Claim table" busy={busy === 'claim'} onPress={() => onClaim(choice)} />
      <Caption>A claim is for right now. Tables can&apos;t be reserved ahead.</Caption>
    </Card>
  );
}

function MyTable({
  myLight,
  busy,
  onLight,
  onStepAway,
  onLeave,
  onConversation,
}: {
  myLight: Light;
  busy: string | null;
  onLight: (l: Light) => void;
  onStepAway: () => void;
  onLeave: () => void;
  onConversation: () => void;
}) {
  return (
    <>
      <IncomingRequests onAccepted={onConversation} />
      <Card className="gap-3">
        <SectionTitle>Your light</SectionTitle>
        <LightPicker value={myLight} onPick={onLight} busy={busy} />
      </Card>
      <View className="flex-row gap-3">
        <Button className="flex-1" label="Right back (5 min)" variant="quiet" busy={busy === 'away'} onPress={onStepAway} />
        <Button className="flex-1" label="Leave table" variant="danger" busy={busy === 'leave'} onPress={onLeave} />
      </View>
    </>
  );
}

/* ------------------------------------------------------------- requests --- */

function IncomingRequests({ onAccepted }: { onAccepted: () => void }) {
  const requests = useAsync(fetchIncomingRequests, []);
  const reload = useCallback(() => void requests.reload(), [requests]);
  useVenueTablesRealtime(null, reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cards = requests.data ?? [];
  if (cards.length === 0) return null;

  async function respond(card: RequestCard, accept: boolean, minutes = 30) {
    setBusy(`${card.id}-${accept ? minutes : 'no'}`);
    setError(null);
    try {
      const r = await respondToRequest(card.id, accept, minutes);
      if (r.accepted) onAccepted();
      else await requests.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error ? <ErrorNote error={error} /> : null}
      {cards.map((card) => {
        const common = [...card.shared.interests, ...card.shared.topics].slice(0, 3);
        return (
          <Card key={card.id} accent="berry" className="gap-3">
            <View className="flex-row flex-wrap items-center gap-2">
              <SectionTitle>{card.first_name ?? 'Someone'} would like to chat</SectionTitle>
              {card.verified ? <Badge label="Verified" tone="open" /> : null}
              {card.age_range ? <Badge label={card.age_range} /> : null}
            </View>
            {common.length ? <Body>You both like {common.join(', ')}.</Body> : <Body>No shared interests listed yet.</Body>}
            {card.shared.languages.length ? <Caption>Languages: {card.shared.languages.join(', ')}</Caption> : null}
            {card.comm_pref ? <Caption>They mentioned: “{card.comm_pref}”</Caption> : null}
            <Caption>Pick a time to accept. Declining is private: they just see “not available”.</Caption>
            <View className="flex-row gap-2">
              {[15, 30, 45].map((m) => (
                <Button
                  key={m}
                  className="flex-1"
                  label={`${m} min`}
                  busy={busy === `${card.id}-${m}`}
                  onPress={() => void respond(card, true, m)}
                />
              ))}
            </View>
            <Button label="Not right now" variant="quiet" busy={busy === `${card.id}-no`} onPress={() => void respond(card, false)} />
          </Card>
        );
      })}
    </>
  );
}
