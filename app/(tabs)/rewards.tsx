import { useRouter } from 'expo-router';
import { RefreshControl, Pressable, Text, View } from 'react-native';

import type { Venue } from '@/lib/database.types';
import {
  CHAT_TABLE_VISIT_WEIGHT,
  FREQUENT_REWARD_TARGET,
  buildPassport,
  fetchRewards,
  fetchVisitedVenueIds,
  frequentProgress,
  passportProgress,
  progressFraction,
} from '@/lib/rewards';
import { MIN_TAP_TARGET } from '@/lib/theme';
import { fetchVenues } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import {
  Badge,
  Body,
  Caption,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  ProgressBar,
  Screen,
  SectionTitle,
  Title,
} from '@/components/ui';

export default function RewardsScreen() {
  const venues = useAsync(fetchVenues, []);
  const rewards = useAsync(fetchRewards, []);
  const visited = useAsync(fetchVisitedVenueIds, []);

  const loading = venues.loading || rewards.loading || visited.loading;
  const error = venues.error ?? rewards.error ?? visited.error;

  function reloadAll() {
    void venues.reload();
    void rewards.reload();
    void visited.reload();
  }

  const allVenues = venues.data ?? [];
  const rewardRows = rewards.data ?? [];
  const visitedIds = visited.data ?? new Set<string>();
  const passport = buildPassport(allVenues, visitedIds);

  // Only cafes the user has actually been to get a frequent-visit card.
  const frequentVenues = allVenues.filter((v) => visitedIds.has(v.id));

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reloadAll} />}>
      <View className="gap-1">
        <Title>Rewards</Title>
        <Body>Showing up counts. Sitting at the chat table counts double.</Body>
      </View>

      {error ? <ErrorNote error={error} onRetry={reloadAll} /> : null}
      {loading && allVenues.length === 0 ? <Loading /> : null}

      {/* TODO(rewards): these numbers come straight from the rewards table,
          which is seeded by hand right now because public.recompute_rewards()
          is still a stub (migration 0500). Once it is written, call
          recompute_rewards() after each check-in and these will be live. */}

      <Card className="gap-3">
        <View className="flex-row items-baseline justify-between">
          <SectionTitle>Cafe passport</SectionTitle>
          <Caption>
            {passportProgress(rewardRows) || visitedIds.size} of {allVenues.length}
          </Caption>
        </View>
        <ProgressBar
          fraction={allVenues.length ? visitedIds.size / allVenues.length : 0}
          label={`Passport: ${visitedIds.size} of ${allVenues.length} places visited`}
          tone="berry"
        />
        <PassportGrid entries={passport} />
      </Card>

      <SectionTitle>Frequent visits</SectionTitle>
      <Caption>
        {FREQUENT_REWARD_TARGET} visits to one cafe earns a reward. A chat table check-in is worth{' '}
        {CHAT_TABLE_VISIT_WEIGHT}.
      </Caption>

      {frequentVenues.length === 0 && !loading ? (
        <EmptyState
          title="No visits yet"
          body="Check in somewhere and your progress shows up here."
        />
      ) : null}

      {frequentVenues.map((venue) => {
        const progress = frequentProgress(rewardRows, venue.id);
        const earned = progress >= FREQUENT_REWARD_TARGET;
        return (
          <Card key={venue.id} accent={earned ? 'sage' : undefined} className="gap-3">
            <View className="flex-row items-start justify-between gap-3">
              <SectionTitle className="flex-1">{venue.name}</SectionTitle>
              {earned ? <Badge label="Earned" tone="open" /> : null}
            </View>
            <ProgressBar
              fraction={progressFraction(progress)}
              label={`${venue.name}: ${progress} of ${FREQUENT_REWARD_TARGET} visits`}
            />
            <Caption>
              {progress} of {FREQUENT_REWARD_TARGET} visits
            </Caption>
          </Card>
        );
      })}
    </Screen>
  );
}

function PassportGrid({ entries }: { entries: { venue: Venue; visited: boolean }[] }) {
  const router = useRouter();

  return (
    <View className="flex-row flex-wrap gap-2">
      {entries.map(({ venue, visited }) => (
        <Pressable
          key={venue.id}
          onPress={() => router.push(`/venue/${venue.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${venue.name}, ${visited ? 'visited' : 'not visited yet'}`}
          style={{ minHeight: MIN_TAP_TARGET + 16, minWidth: 100 }}
          className={`rounded-tile flex-1 justify-center border-2 p-3 active:opacity-80 ${
            visited ? 'bg-sage-soft border-sage' : 'bg-sunk border-border-warm'
          }`}
        >
          <Text
            numberOfLines={2}
            className={`text-sm font-semibold ${visited ? 'text-sage' : 'text-mocha'}`}
          >
            {venue.name}
          </Text>
          <Text className={`mt-1 text-xs ${visited ? 'text-sage' : 'text-mocha'}`}>
            {visited ? 'Stamped' : 'Not yet'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
