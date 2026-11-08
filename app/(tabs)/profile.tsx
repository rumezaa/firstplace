import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, TextInput, View } from 'react-native';
import { Text } from '@/components/Text';

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
      {/* Header: who you are here, at a glance. */}
      <View className="flex-row items-center gap-4">
        <View
          style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' }}
          className="bg-clay-soft"
          accessible={false}
        >
          <Text display className="text-clay text-[30px] font-bold">
            {initials(nameValue)}
          </Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text display accessibilityRole="header" className="text-espresso text-[34px] leading-[40px] font-bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {nameValue?.trim() || 'Your profile'}
          </Text>
          <Caption numberOfLines={1}>{session?.user.email}</Caption>
          {history.data ? (
            <Caption>
              {history.data.length} {history.data.length === 1 ? 'visit' : 'visits'} recently
            </Caption>
          ) : null}
        </View>
      </View>

      {error ? <ErrorNote error={error} /> : null}

      <Card className="gap-2">
        <SectionTitle>Name</SectionTitle>
        <TextInput
          value={nameValue}
          onChangeText={setName}
          onEndEditing={() => {
            if (name !== null && name !== profile.name) void save({ name: name.trim() });
          }}
          placeholder="Your name"
          placeholderTextColor="#8A8F93"
          accessibilityLabel="Your name"
          className="bg-cream border-border-warm text-espresso rounded-tile border px-4 py-3 text-base"
          style={{ minHeight: 48 }}
        />
        <Caption>Only your first name, and only to people you&apos;ve both said yes to.</Caption>
      </Card>

      <Card className="gap-5">
        <ChipGroup
          title="Interests"
          selected={profile.interests}
          suggestions={INTEREST_SUGGESTIONS}
          onToggle={(v) => void save({ interests: toggleIn(profile.interests, v) })}
        />
        <ChipGroup
          title="Topics you like"
          selected={extra.topics ?? []}
          suggestions={TOPIC_SUGGESTIONS}
          onToggle={(v) => void save({ topics: toggleIn(extra.topics ?? [], v) } as never)}
        />
        <ChipGroup
          title="Languages"
          selected={extra.languages ?? []}
          suggestions={LANGUAGE_SUGGESTIONS}
          onToggle={(v) => void save({ languages: toggleIn(extra.languages ?? [], v) } as never)}
        />
        <Caption>People only ever see the ones you both share.</Caption>
      </Card>

      <Card className="gap-3">
        <ChipGroup
          title="Your vibe"
          selected={profile.vibe_tags}
          suggestions={VIBE_SUGGESTIONS}
          onToggle={(v) => void save({ vibe_tags: toggleIn(profile.vibe_tags, v) })}
        />
        <Caption>Shown on venues only as a group, once three or more people share a tag.</Caption>
      </Card>

      <Card className="gap-1">
        <SectionTitle>Privacy</SectionTitle>
        <ToggleRow
          label="Incognito"
          description="Check in without being counted anywhere."
          value={profile.incognito}
          onChange={(next) => void save({ incognito: next })}
        />
        <View className="border-border-warm border-t" />
        <ToggleRow
          label="Familiar faces"
          description="Know when you keep crossing paths with a regular."
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
          description="When you meet someone, show what you both listed and use it for conversation ideas. If either of you turns it off, neither sees it."
          value={profile.share_overlap ?? true}
          onChange={(next) => void save({ share_overlap: next })}
        />
        <View className="border-border-warm mt-2 border-t pt-3">
          <Caption>
            Nobody sees your profile. Conversation ideas come from Google Gemini using only the words you share, never your name, email or photo. Check-ins are deleted after 90 days.
          </Caption>
        </View>
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
          {(history.data ?? []).slice(0, 5).map((row) => (
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

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

/**
 * Shows what you picked, quietly. "Edit" opens the suggestions; "Done" closes
 * them. Keeps the profile from being a wall of forty chips.
 */
function ChipGroup({
  title,
  selected,
  suggestions,
  onToggle,
}: {
  title: string;
  selected: string[];
  suggestions: string[];
  onToggle: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const all = Array.from(new Set([...selected, ...suggestions]));
  const shown = editing ? all : selected;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <Pressable onPress={() => setEditing(!editing)} accessibilityRole="button" accessibilityLabel={`${editing ? 'Done editing' : 'Edit'} ${title}`} hitSlop={12}>
          <Text className="text-clay text-[16px] font-semibold">{editing ? 'Done' : selected.length ? 'Edit' : 'Add'}</Text>
        </Pressable>
      </View>
      {shown.length ? (
        <View className="flex-row flex-wrap gap-2">
          {shown.map((v) => (
            <Chip key={v} label={v} selected={selected.includes(v)} onPress={editing ? () => onToggle(v) : undefined} />
          ))}
        </View>
      ) : (
        <Caption>Nothing yet.</Caption>
      )}
    </View>
  );
}
