import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import type { FamiliarFaceCard } from '@/lib/database.types';
import { faceDetail, faceHeadline, faceState, fetchFamiliarFaces, respondToFamiliarFace } from '@/lib/familiarFaces';
import { relativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import {
  SOCIAL_LABELS,
  endReasonLabel,
  fetchConnections,
  fetchContacts,
  fetchHistory,
  fetchSwapRequests,
  respondToSwap,
  type Socials,
} from '@/lib/conversations';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/providers/SessionProvider';
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Screen,
  SectionTitle,
  Title,
} from '@/components/ui';

export default function ConnectionsScreen() {
  const { profile, updateProfile } = useSession();
  const faces = useAsync(fetchFamiliarFaces, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const respond = useCallback(
    async (card: FamiliarFaceCard, accept: boolean) => {
      setBusyId(card.id);
      setActionError(null);
      try {
        await respondToFamiliarFace(card.id, accept);
        await faces.reload();
      } catch (e) {
        setActionError(errorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [faces],
  );

  const optedOut = profile && !profile.familiar_faces_opt_in;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={faces.loading} onRefresh={() => void faces.reload()} />}
    >
      <SwapRequests />
      <MyConnections />
      <MyContacts />

      <View className="gap-1">
        <Title>Familiar faces</Title>
        <Body>
          The people you keep seeing, without either of you having to make the first move.
        </Body>
      </View>

      {optedOut ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>Familiar faces is off</SectionTitle>
          <Body>
            Turn it on and we will tell you when you have crossed paths with the same regular three
            or more times. Nothing is shared unless you both say yes.
          </Body>
          <Button
            label="Turn on familiar faces"
            onPress={() => void updateProfile({ familiar_faces_opt_in: true })}
          />
        </Card>
      ) : null}

      {actionError ? <ErrorNote error={actionError} /> : null}
      {faces.error ? <ErrorNote error={faces.error} onRetry={() => void faces.reload()} /> : null}

      {faces.loading && !faces.data ? <Loading label="Checking who you keep running into" /> : null}

      {faces.data && faces.data.length === 0 && !optedOut ? (
        <EmptyState
          title="No familiar faces yet"
          body="Once you and another regular have overlapped at the same place three times, a card shows up here. Keep going back to the same spot."
        />
      ) : null}

      {(faces.data ?? []).map((card) => (
        <FaceCard
          key={card.id}
          card={card}
          busy={busyId === card.id}
          onRespond={(accept) => void respond(card, accept)}
        />
      ))}

      <Card className="gap-2">
        <SectionTitle>How this works</SectionTitle>
        <Caption>
          We count overlapping check-ins at the same place. Three or more and you both get a card.
          Names are revealed only when you have both said yes. Nobody ever sees where you are right
          now, and going incognito takes you out of this entirely.
        </Caption>
      </Card>

      <ChatHistory />
    </Screen>
  );
}

function FaceCard({
  card,
  busy,
  onRespond,
}: {
  card: FamiliarFaceCard;
  busy: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const router = useRouter();
  const state = faceState(card);

  return (
    <Card accent={state === 'mutual' ? 'berry' : 'clay'} className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        {state === 'mutual' ? <Badge label="You both said yes" tone="chat" /> : null}
        {state === 'waiting_on_them' ? <Badge label="Waiting on them" tone="filling" /> : null}
        {state === 'pending' ? <Badge label="New" tone="open" /> : null}
        {card.last_overlap_at ? <Badge label={`Last seen ${relativeDay(card.last_overlap_at)}`} /> : null}
      </View>

      <SectionTitle>{faceHeadline(card)}</SectionTitle>
      <Body>{faceDetail(card)}</Body>

      {state === 'pending' ? (
        <View className="flex-row gap-3">
          <Button
            label="Say yes"
            className="flex-1"
            busy={busy}
            onPress={() => onRespond(true)}
          />
          <Button
            label="Ignore"
            variant="quiet"
            className="flex-1"
            disabled={busy}
            onPress={() => onRespond(false)}
          />
        </View>
      ) : null}

      {state === 'waiting_on_them' ? (
        <Button
          label="Change my mind"
          variant="quiet"
          busy={busy}
          onPress={() => onRespond(false)}
        />
      ) : null}

      {state === 'mutual' ? (
        <Button
          label={`Meet at the chat table at ${card.venue_name}`}
          variant="secondary"
          onPress={() => router.push(`/venue/${card.venue_id}`)}
        />
      ) : null}
    </Card>
  );
}

/**
 * People you met at a box and BOTH said it was a good conversation. Only the
 * first name and what you share; photos and socials come later, by choice.
 */
function MyConnections() {
  const connections = useAsync(fetchConnections, []);
  const list = connections.data ?? [];
  if (list.length === 0) return null;
  return (
    <View className="gap-3">
      <Title>Your connections</Title>
      {list.map((c) => {
        const common = [...new Set([...c.shared.interests, ...c.shared.topics])].slice(0, 4);
        return (
          <Card key={c.id} accent="sage" className="gap-2">
            <SectionTitle>{c.first_name ?? 'A new friend'}</SectionTitle>
            {c.venue_name ? <Caption>Met at {c.venue_name} · {relativeDay(c.created_at)}</Caption> : null}
            {common.length ? <Body>You both like {common.join(', ')}.</Body> : null}
            {c.socials ? <SocialsList socials={c.socials} /> : null}
          </Card>
        );
      })}
    </View>
  );
}

function SocialsList({ socials }: { socials: Socials }) {
  const entries = Object.entries(socials).filter(([, v]) => v) as [keyof Socials, string][];
  if (!entries.length) return <Caption>They haven&apos;t added any socials yet.</Caption>;
  return (
    <View className="gap-1">
      {entries.map(([k, v]) => <Body key={k}>{SOCIAL_LABELS[k] ?? k}: {v}</Body>)}
    </View>
  );
}

/** Someone asked to swap socials. Declining is private: they are never told. */
function SwapRequests() {
  const requests = useAsync(fetchSwapRequests, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = requests.data ?? [];
  if (list.length === 0) return null;

  async function respond(id: string, accept: boolean) {
    setBusy(id + accept);
    setError(null);
    try {
      await respondToSwap(id, accept);
      await requests.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="gap-3">
      <Title>Swap socials?</Title>
      {error ? <ErrorNote error={error} /> : null}
      {list.map((r) => (
        <Card key={r.id} accent="clay" className="gap-2">
          <SectionTitle>{r.first_name ?? 'Someone'} would like to swap socials</SectionTitle>
          {r.venue_name ? <Caption>You talked at {r.venue_name}{r.met_at ? ` · ${relativeDay(r.met_at)}` : ''}</Caption> : null}
          <Caption>If you say no, they won&apos;t be told, and they can&apos;t ask again.</Caption>
          <View className="flex-row gap-2">
            <Button className="flex-1" label="Swap" busy={busy === r.id + 'true'} onPress={() => void respond(r.id, true)} />
            <Button className="flex-1" label="No thanks" variant="quiet" busy={busy === r.id + 'false'} onPress={() => void respond(r.id, false)} />
          </View>
        </Card>
      ))}
    </View>
  );
}

/** People you swapped socials with but didn't both vote "good" (connections show theirs above). */
function MyContacts() {
  const contacts = useAsync(fetchContacts, []);
  const list = (contacts.data ?? []).filter((c) => !c.connected);
  if (list.length === 0) return null;
  return (
    <View className="gap-3">
      <Title>Swapped socials</Title>
      {list.map((c) => (
        <Card key={c.id} className="gap-2">
          <SectionTitle>{c.first_name ?? 'Someone'}</SectionTitle>
          {c.venue_name ? <Caption>Met at {c.venue_name}{c.met_at ? ` · ${relativeDay(c.met_at)}` : ''}</Caption> : null}
          <SocialsList socials={c.socials} />
        </Card>
      ))}
    </View>
  );
}

/** Chatting history: one line per conversation, nothing about anyone's votes. */
function ChatHistory() {
  const history = useAsync(() => fetchHistory(20), []);
  const list = history.data ?? [];
  if (list.length === 0) return null;
  return (
    <View className="gap-3">
      <Title>Chatting history</Title>
      {list.map((h) => (
        <Card key={h.id} className="gap-1">
          <SectionTitle>{h.venue_name ?? 'A chat table'}{h.table_label ? ` · ${h.table_label}` : ''}</SectionTitle>
          <Caption>
            {relativeDay(h.started_at)} · {h.minutes} min · {h.people} people · {endReasonLabel(h.end_reason)}
          </Caption>
          {h.connected_with.length ? <Body>Connected with {h.connected_with.join(', ')}</Body> : null}
        </Card>
      ))}
    </View>
  );
}
