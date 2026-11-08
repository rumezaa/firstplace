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

const TOPIC_SUGGESTIONS = ['hiking', 'board games', 'Calgary food', 'music', 'books', 'travel', 'coffee', 'running', 'tech', 'art'];
const LANGUAGE_SUGGESTIONS = ['English', 'French', 'Punjabi', 'Tagalog', 'Mandarin', 'Cantonese', 'Spanish', 'Arabic', 'Urdu', 'Hindi'];

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
  // PRD profile fields not yet in the generated types.
  const extra = (profile ?? {}) as { topics?: string[]; languages?: string[] };
  const history = useAsync(() => fetchCheckinHistory(20), []);
  const venues = useAsync(fetchVenues, []);

  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!profile) {
    return (
      <Screen>
        <Loading label="Loading your profile" />
      </Screen>
    );
  }

  async function save(patch: Parameters<typeof updateProfile>[0]) {
    setError(null);
    try {
      await updateProfile(patch);
    } catch (e) {
      setError(errorMessage(e));
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
          Only your first name, and only to people you&apos;ve both said yes to.
        </Caption>
        <TextInput
          value={nameValue}
          onChangeText={setName}
          onEndEditing={() => {
            if (name !== null && name !== profile.name) void save({ name: name.trim() });
          }}
          placeholder="Your name"
          placeholderTextColor="#A1897A"
          accessibilityLabel="Your name"
          className="bg-cream border-border-warm text-espresso rounded-tile border px-4 py-3 text-base"
          style={{ minHeight: 48 }}
        />
      </Card>

      <Card className="gap-3">
        <SectionTitle>Interests</SectionTitle>
        <Caption>Others only see the ones you share.</Caption>
        <View className="flex-row flex-wrap gap-2">
          {Array.from(new Set([...profile.interests, ...INTEREST_SUGGESTIONS])).map((interest) => (
            <Chip
              key={interest}
              label={interest}
              selected={profile.interests.includes(interest)}
              onPress={() => void save({ interests: toggleIn(profile.interests, interest) })}
            />
          ))}
        </View>
      </Card>

      <Card className="gap-3">
        <SectionTitle>Topics you like</SectionTitle>
        <Caption>Others only see the ones you share.</Caption>
        <View className="flex-row flex-wrap gap-2">
          {Array.from(new Set([...(extra.topics ?? []), ...TOPIC_SUGGESTIONS])).map((topic) => (
            <Chip
              key={topic}
              label={topic}
              selected={(extra.topics ?? []).includes(topic)}
              onPress={() => void save({ topics: toggleIn(extra.topics ?? [], topic) } as never)}
            />
          ))}
        </View>
      </Card>

      <Card className="gap-3">
        <SectionTitle>Languages</SectionTitle>
        <Caption>Shared ones are shown when you talk.</Caption>
        <View className="flex-row flex-wrap gap-2">
          {Array.from(new Set([...(extra.languages ?? []), ...LANGUAGE_SUGGESTIONS])).map((lang) => (
            <Chip
              key={lang}
              label={lang}
              selected={(extra.languages ?? []).includes(lang)}
              onPress={() => void save({ languages: toggleIn(extra.languages ?? [], lang) } as never)}
            />
          ))}
        </View>
      </Card>

      <Card className="gap-3">
        <SectionTitle>Your vibe</SectionTitle>
        <Caption>
          Shown on venues only as a group, once three or more people share a tag.
        </Caption>
        <View className="flex-row flex-wrap gap-2">
          {Array.from(new Set([...profile.vibe_tags, ...VIBE_SUGGESTIONS])).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected={profile.vibe_tags.includes(tag)}
              onPress={() => void save({ vibe_tags: toggleIn(profile.vibe_tags, tag) })}
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
        <View className="border-border-warm border-t" />
        <ToggleRow
          label="Show what we have in common"
          description="When you meet someone, show the interests, topics and languages you both listed, and use them for conversation ideas. Off for either of you means neither sees it."
          value={profile.share_overlap ?? true}
          onChange={(next) => void save({ share_overlap: next })}
        />
      </Card>

      <Card className="gap-2">
        <SectionTitle>How your data is used</SectionTitle>
        <Caption>
          Nobody sees your profile. People you meet only see what you both have in common, and only
          after you have both agreed to talk. Conversation ideas are written by Google Gemini from
          those shared words alone: no name, email, age or photo is ever sent. Lights never show who
          is sitting at a table. Your personal check-ins are deleted after 90 days.
        </Caption>
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
            body="Scan a kiosk code at a cafe and it will show up here."
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
          Turns a tablet into the counter display for a venue.
        </Caption>
        <Button
          label="Open kiosk mode"
          variant="quiet"
          onPress={() => {
            const first = venues.data?.[0];
            if (first) router.push(`/kiosk/${first.id}`);
          }}
          disabled={!venues.data?.length}
        />
      </Card>

      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
    </Screen>
  );
}
