import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import {
  REPORT_REASONS,
  blockMember,
  endConversation,
  fetchConversation,
  fetchTopics,
  keepTalking,
  leaveConversation,
  reportMember,
  requestSwap,
  timeLeft,
  voteExtend,
  voteMember,
  type Conversation,
  type Member,
  type ReportReason,
  type Vote,
} from '@/lib/conversations';
import { fetchConversationItinerary, type ItineraryResponse } from '@/lib/plans';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { Body, Button, Caption, Card, Chip, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * CHATTERBOX as a social guide. While talking: who's here, what the group
 * shares, Gemini icebreakers, the timer. It ends once at least half of the
 * people tap End, and the table resets. Then, per person, three paths:
 * hit it off (connect, swap socials, plan a hangout), not a match (no
 * pressure; whoever said yes may ask once to swap), or unsafe (anonymous
 * report). Nobody ever sees anyone else's vote.
 */
export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [endedId, setEndedId] = useState<string | null>(params.id ?? null);
  const conv = useAsync(() => fetchConversation(endedId ?? undefined), [endedId]);
  const reload = useCallback(() => void conv.reload(), [conv]);
  useVenueTablesRealtime(null, reload);

  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  if (conv.loading && !conv.data) return <Screen><Loading label="Joining the conversation" /></Screen>;
  if (!conv.data) {
    return (
      <Screen>
        <Title>No conversation right now</Title>
        <Body>Tap a box with a green or yellow light to start one.</Body>
        <Button label="Back" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const c = conv.data;
  const ended = Boolean(c.ended_at);
  // Keep showing this conversation after it ends, so everyone can vote.
  const afterChange = () => (endedId === c.id ? reload() : setEndedId(c.id));

  return (
    <Screen>
      <Stack.Screen options={{ title: ended ? 'How was it?' : 'In conversation' }} />
      {error ? <ErrorNote error={error} /> : null}
      {reporting ? (
        <ReportForm
          conversation={c}
          onDone={() => { setReporting(false); afterChange(); }}
          onCancel={() => setReporting(false)}
        />
      ) : ended ? (
        <Outcomes conversation={c} onChanged={afterChange} onDone={() => router.replace('/')} onReport={() => setReporting(true)} />
      ) : (
        <Live conversation={c} onError={setError} onChanged={afterChange} onReport={() => setReporting(true)} />
      )}
    </Screen>
  );
}

const others = (c: Conversation) => c.members.filter((m) => !m.is_me);
const name = (m: Member) => m.first_name ?? 'Someone';

/* ----------------------------------------------------------------- live --- */

function Live({
  conversation: c,
  onError,
  onChanged,
  onReport,
}: {
  conversation: Conversation;
  onError: (e: string) => void;
  onChanged: () => void;
  onReport: () => void;
}) {
  const topics = useAsync(fetchTopics, [c.id]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeft(c.ends_at, now);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const here = others(c).filter((m) => m.here);
  const group = here.length > 1;
  const shared = [...new Set([...c.shared.interests, ...c.shared.topics])];
  const nearEnd = left && left.ms <= 2 * 60_000;
  const stillNeeded = Math.max(0, c.end_votes.needed - c.end_votes.wanting);

  return (
    <>
      <View className="gap-1">
        <Title>
          {group ? `You're in a group of ${here.length + 1}` : `You're talking with ${here[0] ? name(here[0]) : 'someone new'}`}
        </Title>
        {group ? (
          <View className="flex-row flex-wrap gap-2">
            {here.map((m) => <Chip key={m.member_id} label={name(m)} />)}
          </View>
        ) : null}
        <Caption>{left ? `${left.label} left` : 'No timer. End whenever you like.'}</Caption>
      </View>

      {shared.length ? (
        <Card className="gap-3">
          <SectionTitle>{group ? 'Your group likes' : 'You both like'}</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {shared.map((s) => <Chip key={s} label={s} />)}
          </View>
          {c.shared.languages.length ? <Caption>Shared languages: {c.shared.languages.join(', ')}.</Caption> : null}
        </Card>
      ) : null}

      <Card accent="clay" className="gap-2">
        <SectionTitle>Icebreakers</SectionTitle>
        {topics.data ? (
          topics.data.prompts.map((p) => <Body key={p}>• {p}</Body>)
        ) : (
          <Loading label="Finding conversation starters" />
        )}
      </Card>

      {nearEnd ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>{left && left.ms === 0 ? "Time's up" : 'Two minutes left'}</SectionTitle>
          <Body>Keep going? You only continue if everyone chooses to.</Body>
          <View className="flex-row gap-2">
            <Button className="flex-1" label="Extend 15 min" busy={busy === 'ext'} onPress={() => run('ext', () => voteExtend(true))} />
            <Button className="flex-1" label="Wrap up" variant="quiet" busy={busy === 'wrap'} onPress={() => run('wrap', () => voteExtend(false))} />
          </View>
          {c.my_extend === true ? <Caption>You chose to extend. Waiting for the others.</Caption> : null}
        </Card>
      ) : null}

      {c.end_votes.me ? (
        <Card className="gap-2">
          <Body>
            You tapped End. It ends when {stillNeeded} more {stillNeeded === 1 ? 'person taps' : 'people tap'} End too.
          </Body>
          <Button label="Keep talking" variant="quiet" busy={busy === 'keep'} onPress={() => run('keep', keepTalking)} />
        </Card>
      ) : (
        <>
          <Button label="End conversation" variant="quiet" busy={busy === 'end'} onPress={() => run('end', endConversation)} />
          {group ? <Caption>Ends when at least half of you tap End ({c.end_votes.needed} of {c.end_votes.present}).</Caption> : null}
        </>
      )}
      {group ? <Button label="Leave the group" variant="quiet" busy={busy === 'leave'} onPress={() => run('leave', leaveConversation)} /> : null}
      <Button label="Report or block" variant="danger" onPress={onReport} />
    </>
  );
}

/* ------------------------------------------------------------- outcomes --- */

function Outcomes({
  conversation: c,
  onChanged,
  onDone,
  onReport,
}: {
  conversation: Conversation;
  onChanged: () => void;
  onDone: () => void;
  onReport: () => void;
}) {
  const people = others(c);
  const anyConnected = people.some((m) => m.connected);
  return (
    <>
      <Title>How was it?</Title>
      <Body>Only you see your answers. Nobody is ever told how anyone voted.</Body>
      {people.map((m) => <PersonOutcome key={m.member_id} conversationId={c.id} member={m} onChanged={onChanged} />)}
      {anyConnected ? <HangoutPlan conversationId={c.id} /> : null}
      <Button label="Done" onPress={onDone} />
      <Button label="Something felt wrong? Report" variant="quiet" onPress={onReport} />
    </>
  );
}

function PersonOutcome({ conversationId, member: m, onChanged }: { conversationId: string; member: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  const vote = (v: Vote) => run(v, () => voteMember(conversationId, m.member_id, v));
  const swap = () => run('swap', () => requestSwap(conversationId, m.member_id));

  return (
    <Card accent={m.connected ? 'sage' : undefined} className="gap-2">
      <SectionTitle>{name(m)}</SectionTitle>
      {error ? <ErrorNote error={error} /> : null}

      {m.my_vote === null ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" label="Good conversation" busy={busy === 'good'} onPress={() => void vote('good')} />
          <Button className="flex-1" label="Not for me" variant="quiet" busy={busy === 'not_for_me'} onPress={() => void vote('not_for_me')} />
        </View>
      ) : m.my_vote === 'not_for_me' ? (
        <>
          <Body>No pressure. Nothing is shared with them.</Body>
          <Button label="Actually, it was good" variant="quiet" busy={busy === 'good'} onPress={() => void vote('good')} />
        </>
      ) : (
        <>
          <Body>
            {m.connected
              ? 'You hit it off! You both said it was a good conversation.'
              : 'Thanks. If they felt the same, you’ll be connected.'}
          </Body>
          {m.swap === 'can_ask' ? (
            <Button label="Ask to swap socials" variant="secondary" busy={busy === 'swap'} onPress={() => void swap()} />
          ) : m.swap === 'they_asked' ? (
            <Button label={`${name(m)} asked to swap socials. Swap?`} busy={busy === 'swap'} onPress={() => void swap()} />
          ) : m.swap === 'asked' ? (
            <Caption>You asked to swap socials. If they agree, you’ll find theirs under Connections.</Caption>
          ) : m.swap === 'swapped' ? (
            <Caption>Socials swapped. They’re under Connections.</Caption>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Gemini + City of Calgary open data: a walking plan from the box you met at. */
function HangoutPlan({ conversationId }: { conversationId: string }) {
  const [plan, setPlan] = useState<ItineraryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setPlan(await fetchConversationItinerary({ conversationId }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!plan) {
    return (
      <Card accent="clay" className="gap-2">
        <SectionTitle>Keep hanging out?</SectionTitle>
        <Body>Get an easy walking plan nearby, built from Calgary public places, today’s weather and opening hours.</Body>
        {error ? <ErrorNote error={error} /> : null}
        <Button label="Plan a hangout" busy={busy} onPress={() => void load()} />
      </Card>
    );
  }

  const it = plan.itinerary;
  return (
    <Card accent="clay" className="gap-3">
      <SectionTitle>{it ? it.title : 'Nothing nearby right now'}</SectionTitle>
      {plan.context.weather ? (
        <Caption>
          {plan.context.localTime} · {plan.context.weather.condition}
          {plan.context.weather.tempC !== null ? `, ${Math.round(plan.context.weather.tempC)}°C` : ''}
        </Caption>
      ) : null}
      {it ? (
        it.stops.map((s) => (
          <View key={s.order} className="gap-1">
            <Body>{s.arriveClock} · {s.place.name}{s.walkMinFromPrev ? ` (${s.walkMinFromPrev} min walk)` : ''}</Body>
            <Caption>{s.what}</Caption>
            {s.icebreaker ? <Caption>Ask: {s.icebreaker}</Caption> : null}
          </View>
        ))
      ) : (
        <Body>{plan.message ?? 'Try again a bit later.'}</Body>
      )}
      {it?.notes.map((n) => <Caption key={n}>{n}</Caption>)}
    </Card>
  );
}

/* --------------------------------------------------------------- report --- */

function ReportForm({ conversation: c, onDone, onCancel }: { conversation: Conversation; onDone: () => void; onCancel: () => void }) {
  const people = others(c);
  const [who, setWho] = useState<string | null>(people.length === 1 ? people[0].member_id : null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Title>Report or block</Title>
      <Body>
        Reports are anonymous: they are never told who reported them. Reporting blocks them, flags their profile for a
        person to review, and takes you out of the conversation straight away.
      </Body>
      {error ? <ErrorNote error={error} /> : null}
      {people.length > 1 ? (
        <>
          <SectionTitle>Who?</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {people.map((m) => (
              <Chip key={m.member_id} label={name(m)} selected={who === m.member_id} onPress={() => setWho(m.member_id)} />
            ))}
          </View>
        </>
      ) : null}
      <SectionTitle>What happened?</SectionTitle>
      <View className="gap-2">
        {REPORT_REASONS.map((r) => (
          <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Anything else? (optional)"
        placeholderTextColor="#A1897A"
        multiline
        accessibilityLabel="Optional note"
        className="bg-surface border-border-warm text-espresso rounded-tile border px-4 py-3 text-base"
        style={{ minHeight: 80 }}
      />
      <Button label="Send report" variant="danger" disabled={!reason || !who} busy={busy === 'report'}
        onPress={() => reason && who && run('report', () => reportMember(c.id, who, reason, note || undefined))} />
      <Button label="Just block them" variant="quiet" disabled={!who} busy={busy === 'block'}
        onPress={() => who && run('block', async () => {
          await blockMember(c.id, who);
          if (!c.ended_at) await leaveConversation();
        })} />
      <Caption>In danger right now? Call 911, or find venue staff. More help is under Help.</Caption>
      <Button label="Cancel" variant="quiet" onPress={onCancel} />
    </>
  );
}
