import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, TextInput, View } from 'react-native';

import { APP_NAME } from '@/lib/branding';
import { fetchCheckinHistory } from '@/lib/checkins';
import { relativeDay, timeOfDay } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { fetchVenues } from '@/lib/venues';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/providers/SessionProvider';
import {
  Badge,
  Body,
  Button,
  Caption,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Loading,
  Screen,
  SectionTitle,
  Title,
  ToggleRow,
} from '@/components/ui';

/** Starting points so the chips are not an empty box on a new account. */
const INTEREST_SUGGESTIONS = [
  'board games',
  'running',
  'climbing',
  'novels',
  'film photography',
  'cooking',
  'live music',
  'cycling',
  'languages',
  'chess',
  'knitting',
  'grad school',
];

const VIBE_SUGGESTIONS = [
  'quiet worker',
  'laptop crowd',
  'chatty',
  'studying',
  'regular',
  'morning person',
  'night owl',
  'new in town',
];

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session, updateProfile, signOut } = useSession();
  const history = useAsync(() => fetchCheckinHistory(20), []);
  const venues = useAsync(fetchVenues, []);

  const [name, setName] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [kioskVenueId, setKioskVenueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    return (
      <Screen>
        <Loading label="Loading your profile" />
      </Screen>
    );
  }

  async function save(patch: Parameters<typeof updateProfile>[0]): Promise<boolean> {
    setError(null);
    try {
      await updateProfile(patch);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  // Blur fires on web and when switching tabs; onEndEditing alone does not.
  async function saveName() {
    const next = name?.trim();
    if (name === null || !next || next === profile?.name) return;
    if (await save({ name: next })) {
      setName(null);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    }
  }

  function toggleIn(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const nameValue = name ?? profile.name;

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={history.loading} onRefresh={() => void history.reload()} />
      }
    >
      <View className="gap-1">
        <Title>You</Title>
        <Caption>{session?.user.email}</Caption>
      </View>

      {error ? <ErrorNote error={error} /> : null}

      <Card className="gap-3">
        <SectionTitle>Name</SectionTitle>
        <Caption>
          Only ever shown to someone you have both said yes to in familiar faces. We show the first
          name only.
        </Caption>
        <TextInput
          value={nameValue}
          onChangeText={setName}
          onBlur={() => void saveName()}
          onSubmitEditing={() => void saveName()}
          returnKeyType="done"
          placeholder="Your name"
          placeholderTextColor="#A1897A"
          accessibilityLabel="Your name"
          className="bg-cream border-border-warm text-espresso rounded-tile border px-4 py-3 text-base"
          style={{ minHeight: 48 }}
        />
        {nameSaved ? <Caption className="text-sage">Saved</Caption> : null}
      </Card>

      <Card className="gap-3">
        <SectionTitle>Interests</SectionTitle>
        <Caption>Used to suggest places, never shown next to your name.</Caption>
        <View className="flex-row flex-wrap gap-2">
          {Array.from(new Set([...profile.interests, ...INTEREST_SUGGESTIONS])).map((interest) => (
            <Chip
              key={interest}
              label={interest}
              selected={profile.interests.includes(interest)}
              onPress={() => void save((p) => ({ interests: toggleIn(p.interests, interest) }))}
            />
          ))}
        </View>
      </Card>

      <Card className="gap-3">
        <SectionTitle>Your vibe</SectionTitle>
        <Caption>
          These feed the aggregated &quot;who tends to be here&quot; on venue screens. A tag is only
          ever shown once at least three people there share it.
        </Caption>
        <View className="flex-row flex-wrap gap-2">
          {Array.from(new Set([...profile.vibe_tags, ...VIBE_SUGGESTIONS])).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected={profile.vibe_tags.includes(tag)}
              onPress={() => void save((p) => ({ vibe_tags: toggleIn(p.vibe_tags, tag) }))}
            />
          ))}
        </View>
      </Card>

      <Card className="gap-1">
        <SectionTitle>Privacy</SectionTitle>
        <ToggleRow
          label="Incognito"
          description="Check in without counting. You disappear from every number and from familiar faces."
          value={profile.incognito}
          onChange={(next) => void save({ incognito: next })}
        />
        <View className="border-border-warm border-t" />
        <ToggleRow
          label="Familiar faces"
          description="Let us tell you when you keep crossing paths with the same regular."
          value={profile.familiar_faces_opt_in}
          onChange={(next) => void save({ familiar_faces_opt_in: next })}
        />
        {profile.incognito ? (
          <Caption className="text-amber mt-2">
            While incognito, familiar faces stays off regardless of the switch above.
          </Caption>
        ) : null}
      </Card>

      <Card className="gap-3">
        <SectionTitle>Check-in history</SectionTitle>
        {history.error ? (
          <ErrorNote error={history.error} onRetry={() => void history.reload()} />
        ) : null}
        {history.loading && !history.data ? <Loading label="Loading your visits" /> : null}
        {history.data && history.data.length === 0 ? (
          <EmptyState
            title="No visits yet"
            body="Claim a table at a cafe and your visit will show up here."
          />
        ) : null}
        <View className="gap-3">
          {(history.data ?? []).map((row) => (
            <View key={row.id} className="border-border-warm gap-1 border-b pb-3">
              <View className="flex-row items-center justify-between gap-2">
                <Body className="flex-1">{row.venues?.name ?? 'A place'}</Body>
                <Caption>{relativeDay(row.checked_in_at)}</Caption>
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Caption>
                  {timeOfDay(row.checked_in_at)}
                  {row.checked_out_at ? ` – ${timeOfDay(row.checked_out_at)}` : ' · still here'}
                </Caption>
                {row.tables?.is_chat_table ? <Badge label="Chat table" tone="chat" /> : null}
                {row.open_to_chat ? <Badge label="Open to chat" tone="open" /> : null}
              </View>
            </View>
          ))}
        </View>
      </Card>

      {/* The "hidden" kiosk entry point from the brief. Not secret, just out of
          the way: a customer has no reason to tap it, staff know to look here. */}
      <Card className="gap-3">
        <SectionTitle>Kiosk mode</SectionTitle>
        <Caption>
          For cafe staff. Turns a tablet into the {APP_NAME} kiosk: a rotating QR code and a table
          grid you can tap to mark tables open or taken.
        </Caption>
        <View className="flex-row flex-wrap gap-2">
        {(venues.data ?? []).map((v) => (
          <Chip
            key={v.id}
            label={v.name}
            selected={kioskVenueId === v.id}
            onPress={() => setKioskVenueId(v.id)}
          />
        ))}
        </View>
        <Button
          label="Open kiosk mode"
          variant="quiet"
          onPress={() => kioskVenueId && router.push(`/kiosk/${kioskVenueId}`)}
          disabled={!kioskVenueId}
        />
        <Caption>Pick the venue this tablet belongs to first.</Caption>
      </Card>

      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
