import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import type { FamiliarFaceCard } from '@/lib/database.types';
import { faceDetail, faceHeadline, faceState, fetchFamiliarFaces, respondToFamiliarFace } from '@/lib/familiarFaces';
import { relativeDay } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { fetchConnections } from '@/lib/conversations';
import { fetchMyMeetups, type MeetupSummary } from '@/lib/meetups';
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
      <MyConnections />

      <View className="gap-1">
        <SectionTitle className="text-[22px] leading-[28px]">Familiar faces</SectionTitle>
        <Caption>People you keep running into. Nobody has to make the first move.</Caption>
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
          Three visits at the same place and time makes a card. First names appear only after you
          both say yes. Nobody ever sees where you are right
          now, and going incognito takes you out of this entirely.
        </Caption>
      </Card>
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
          label="Meet at the chat table"
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
 *
 * One conversation is not a friendship, so each card leads into the meetup
 * planner — the second meeting is the one that actually matters.
 */
function MyConnections() {
  const router = useRouter();
  const connections = useAsync(fetchConnections, []);
  const meetups = useAsync(fetchMyMeetups, []);
  const reloadConnections = connections.reload;
  const reloadMeetups = meetups.reload;
  useFocusEffect(useCallback(() => { void reloadConnections(); void reloadMeetups(); }, [reloadConnections, reloadMeetups]));
  const list = connections.data ?? [];
  if (connections.loading && !connections.data) return <Loading label="Loading connections" />;
  if (connections.error) return <ErrorNote error={connections.error} onRetry={() => void connections.reload()} />;
  if (list.length === 0) return <EmptyState title="No connections yet" body="After a conversation, you will connect here if you both say it went well." />;

  // The live plan per connection, if any. my_meetups() is newest first.
  const live = new Map<string, MeetupSummary>();
  for (const m of meetups.data ?? []) {
    if (!live.has(m.connection_id) && m.status !== 'declined' && m.status !== 'expired') {
      live.set(m.connection_id, m);
    }
  }

  return (
    <View className="gap-3">
      <Title>Your connections</Title>
      {meetups.error ? <ErrorNote error={meetups.error} onRetry={() => void meetups.reload()} /> : null}
      {list.map((c) => {
        const common = [...new Set([...c.shared.interests, ...c.shared.topics])].slice(0, 4);
        const plan = live.get(c.id);
        return (
          <Card key={c.id} accent="sage" className="gap-2">
            <SectionTitle>{c.first_name ?? 'A new friend'}</SectionTitle>
            {c.venue_name ? <Caption>Met at {c.venue_name} · {relativeDay(c.created_at)}</Caption> : null}
            {common.length ? <Body>You both like {common.join(', ')}.</Body> : null}

            {plan?.status === 'confirmed' && plan.plan ? (
              <Badge label={`${plan.plan.idea.title} · ${plan.plan.when}`} tone="open" />
            ) : null}
            {plan?.status === 'proposed' ? (
              <Badge
                label={plan.i_accepted ? `Waiting on ${c.first_name ?? 'them'}` : 'A plan is waiting for you'}
                tone={plan.i_accepted ? 'filling' : 'chat'}
              />
            ) : null}

            <Button
              label={meetupLabel(plan)}
              disabled={!meetups.data || Boolean(meetups.error)}
              variant={plan?.status === 'confirmed' ? 'quiet' : 'secondary'}
              onPress={() => router.push(plan ? `/meetup/${c.id}?meetup=${plan.id}` : `/meetup/${c.id}`)}
            />
          </Card>
        );
      })}
    </View>
  );
}

function meetupLabel(plan: MeetupSummary | undefined): string {
  if (!plan) return 'Plan the next one';
  if (plan.status === 'confirmed') return 'See the plan';
  if (plan.status === 'proposed') return plan.i_accepted ? 'See the plan' : 'See what we found';
  return 'Carry on planning';
}
