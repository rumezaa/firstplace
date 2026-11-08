import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, View } from 'react-native';

import { hourLabel } from '@/lib/format';
import { fetchDashboardInsight, fetchVenueDashboard } from '@/lib/kiosk';
import { Text } from '@/components/Text';
import { fetchVenue } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import {
  Body,
  Caption,
  Card,
  ErrorNote,
  Loading,
  ProgressBar,
  Screen,
  SectionTitle,
  Title,
} from '@/components/ui';

/**
 * Cafe owner view. Aggregates only, and the database decides what is allowed
 * out: public.venue_dashboard() returns {suppressed: true} and nothing else
 * when fewer than 5 distinct people visited in the window. The client is never
 * sent individual users, so it cannot show them even by mistake.
 */
export default function DashboardScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const id = String(venueId);

  const venue = useAsync(() => fetchVenue(id), [id]);
  const dash = useAsync(() => fetchVenueDashboard(id, 30), [id]);

  if (dash.loading && !dash.data) {
    return (
      <Screen>
        <Loading label="Counting, carefully" />
      </Screen>
    );
  }

  if (dash.error) {
    return (
      <Screen>
        <ErrorNote error={dash.error} onRetry={() => void dash.reload()} />
      </Screen>
    );
  }

  const data = dash.data;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={dash.loading} onRefresh={() => void dash.reload()} />}
    >
      <Stack.Screen options={{ title: '' }} />
      <View className="gap-1">
        <Title>Venue dashboard</Title>
        <Body>{venue.data?.name ?? 'Your venue'}</Body>
        <Caption>Last {data?.days ?? 30} days · anonymous aggregates only</Caption>
      </View>

      {venue.error ? <ErrorNote error={venue.error} onRetry={() => void venue.reload()} /> : null}
      {!data ? <Body>No dashboard data is available yet.</Body> : null}
      {data?.suppressed ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>Not enough visitors to show anything yet</SectionTitle>
          <Body>
            We only report numbers once at least {data.min_group_size} different people have visited
            in the window. Below that, a &quot;number&quot; would describe individuals.
          </Body>
          <Caption>
            This is not a loading state and not a permissions problem. It is the rule working.
          </Caption>
        </Card>
      ) : null}

      {data && !data.suppressed ? (
        <>
          <View className="flex-row gap-3">
            <StatTile label="visitors" value={String(data.visitors)} />
            <StatTile label="visits" value={String(data.total_visits)} />
          </View>
          <View className="flex-row gap-3">
            <StatTile label="came back" value={`${Math.round(data.repeat_visit_rate * 100)}%`} />
            <StatTile label="chat table check-ins" value={String(data.chat_table_visits)} />
          </View>

          <Tip venueId={venueId} />

          {data.peak_hours.length > 0 ? (
            <Card className="gap-3">
              <SectionTitle>Peak hours</SectionTitle>
              <View className="gap-2">
                {data.peak_hours.map((h) => {
                  const max = Math.max(1, ...data.peak_hours.map((x) => x.visits));
                  return (
                    <View key={h.hour} className="flex-row items-center gap-3">
                      <Caption className="w-12">{hourLabel(h.hour)}</Caption>
                      <View className="flex-1">
                        <ProgressBar
                          fraction={h.visits / max}
                          label={`${hourLabel(h.hour)}, ${h.visits} check-ins`}
                        />
                      </View>
                      <Caption className="w-8 text-right">{h.visits}</Caption>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      <Caption>
        Never shown: who visited, who is here now, or where anyone sat. Incognito visits aren&apos;t
        counted. The database enforces this, not the app.
      </Caption>
    </Screen>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex-1 gap-0.5">
      <Text display className="text-espresso text-[30px] leading-[34px] font-bold">
        {value}
      </Text>
      <Caption>{label}</Caption>
    </Card>
  );
}

/** One Gemini idea from the same anonymous numbers. Hidden if there isn't one. */
function Tip({ venueId }: { venueId: string }) {
  const tip = useAsync(() => fetchDashboardInsight(venueId).catch(() => null), [venueId]);
  if (!tip.data) return null;
  return (
    <Card className="bg-clay-soft gap-1">
      <Caption className="text-clay">Idea for you</Caption>
      <Body className="text-espresso">{tip.data}</Body>
    </Card>
  );
}
