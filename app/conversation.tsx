import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import {
  REPORT_REASONS,
  blockUser,
  endConversation,
  fetchConversation,
  fetchTopics,
  reportUser,
  timeLeft,
  voteConversation,
  voteExtend,
  type Conversation,
  type ReportReason,
} from '@/lib/conversations';
import { useAsync } from '@/hooks/useAsync';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { Body, Button, Caption, Card, Chip, ErrorNote, Loading, Screen, SectionTitle, Title } from '@/components/ui';

/**
 * The conversation: their first name, what you share, Gemini prompts, the
 * timer. When it ends, each person privately votes. Only a mutual "good"
 * becomes a connection, and nobody ever sees the other vote.
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

  return (
    <Screen>
      <Stack.Screen options={{ title: ended ? 'How was it?' : 'In conversation' }} />
      {error ? <ErrorNote error={error} /> : null}
      {reporting ? (
        <ReportForm conversationId={c.id} onDone={() => { setReporting(false); router.replace('/'); }} onCancel={() => setReporting(false)} />
      ) : ended ? (
        <Vote conversation={c} onVoted={() => (endedId === c.id ? reload() : setEndedId(c.id))} onDone={() => router.replace('/')} />
      ) : (
        <Live conversation={c} onError={setError} onEnded={reload} onReport={() => setReporting(true)} />
      )}
    </Screen>
  );
}

/* ----------------------------------------------------------------- live --- */

function Live({
  conversation: c,
  onError,
  onEnded,
  onReport,
}: {
  conversation: Conversation;
  onError: (e: string) => void;
  onEnded: () => void;
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
      onEnded();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const shared = [...c.shared.interests, ...c.shared.topics];
  const nearEnd = left && left.ms <= 2 * 60_000;

  return (
    <>
      <View className="gap-1">
        <Title>You&apos;re talking with {c.their_first_name ?? 'someone new'}</Title>
        {left ? (
          <Caption>{left.label} left</Caption>
        ) : (
          <Caption>No timer. End whenever you like.</Caption>
        )}
      </View>

      {shared.length ? (
        <Card className="gap-3">
          <SectionTitle>You both like</SectionTitle>
          <View className="flex-row flex-wrap gap-2">
            {[...new Set(shared)].map((s) => <Chip key={s} label={s} />)}
          </View>
          {c.shared.languages.length ? <Caption>You both speak {c.shared.languages.join(', ')}.</Caption> : null}
        </Card>
      ) : null}

      <Card accent="clay" className="gap-2">
        <SectionTitle>Things to talk about</SectionTitle>
        {topics.data ? (
          topics.data.prompts.map((p) => <Body key={p}>• {p}</Body>)
        ) : (
          <Loading label="Finding conversation starters" />
        )}
      </Card>

      {nearEnd ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>{left && left.ms === 0 ? "Time's up" : 'Two minutes left'}</SectionTitle>
          <Body>Keep going? You only continue if you both choose to.</Body>
          <View className="flex-row gap-2">
            <Button className="flex-1" label="Extend 15 min" busy={busy === 'ext'} onPress={() => run('ext', () => voteExtend(true))} />
            <Button className="flex-1" label="Wrap up" variant="quiet" busy={busy === 'wrap'} onPress={() => run('wrap', () => voteExtend(false))} />
          </View>
          {c.my_extend === true ? <Caption>You chose to extend. Waiting for them.</Caption> : null}
        </Card>
      ) : null}

      <Button label="End conversation" variant="quiet" busy={busy === 'end'} onPress={() => run('end', endConversation)} />
      <Button label="Report or block" variant="danger" onPress={onReport} />
    </>
  );
}

/* ----------------------------------------------------------------- vote --- */

function Vote({ conversation: c, onVoted, onDone }: { conversation: Conversation; onVoted: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(v: 'good' | 'not_for_me') {
    setBusy(v);
    setError(null);
    try {
      await voteConversation(c.id, v);
      onVoted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (c.connected) {
    return (
      <>
        <Title>You&apos;re connected</Title>
        <Card accent="sage" className="gap-2">
          <Body>You both said it was a good conversation. You&apos;ll find {c.their_first_name ?? 'them'} under Connections.</Body>
        </Card>
        <Button label="Done" onPress={onDone} />
      </>
    );
  }

  if (c.my_vote) {
    return (
      <>
        <Title>Thanks</Title>
        <Card className="gap-2">
          <Body>
            Your answer is private. If you both said it was good, you&apos;ll see each other under Connections.
          </Body>
        </Card>
        <Button label="Done" onPress={onDone} />
      </>
    );
  }

  return (
    <>
      <Title>How was it?</Title>
      <Body>Only you see your answer. Nobody is told how anyone voted.</Body>
      {error ? <ErrorNote error={error} /> : null}
      <Button label="Good conversation" busy={busy === 'good'} onPress={() => void vote('good')} />
      <Button label="Not for me" variant="quiet" busy={busy === 'not_for_me'} onPress={() => void vote('not_for_me')} />
    </>
  );
}

/* --------------------------------------------------------------- report --- */

function ReportForm({ conversationId, onDone, onCancel }: { conversationId: string; onDone: () => void; onCancel: () => void }) {
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
      <Body>Reporting ends the conversation, blocks them and turns your light red straight away. A person reviews every report.</Body>
      {error ? <ErrorNote error={error} /> : null}
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
      <Button label="Send report" variant="danger" disabled={!reason} busy={busy === 'report'}
        onPress={() => reason && run('report', () => reportUser(conversationId, reason, note || undefined))} />
      <Button label="Just block them" variant="quiet" busy={busy === 'block'} onPress={() => run('block', async () => { await blockUser(conversationId); await endConversation(); })} />
      <Button label="Cancel" variant="quiet" onPress={onCancel} />
    </>
  );
}
