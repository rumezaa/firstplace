import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { relativeDay } from '@/lib/format';
import { fetchConnections } from '@/lib/conversations';
import { fetchMyMeetups, type MeetupSummary } from '@/lib/meetups';
import { useAsync } from '@/hooks/useAsync';
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
  return <Screen><MyConnections /></Screen>;
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
