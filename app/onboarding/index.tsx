import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/Text';
import { ChipGroup } from '@/components/ChipGroup';
import { LightPole } from '@/components/LightPole';
import { Button, Caption, Chip, ErrorNote, Loading } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { INTEREST_SUGGESTIONS, LANGUAGE_SUGGESTIONS, TOPIC_SUGGESTIONS } from '@/lib/profileOptions';
import { colors } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { INTRO_SEEN_KEY, PAGES } from '../welcome';

/**
 * First-time setup, one question per screen. Every step saves as it goes
 * (PATCH /me), so quitting keeps progress and reopening resumes at the first
 * unfinished step. Finishing sets users.onboarded_at (migration 220).
 */
const STEP_KEY = 'chatterbox.onboarding.step.v1';
type Step = 'intro' | 'name' | 'interests' | 'more' | 'gender' | 'done';
const ORDER: Step[] = ['intro', 'name', 'interests', 'more', 'gender', 'done'];
const MIN_INTERESTS = 3;

type Gender = 'woman' | 'man' | 'non_binary' | 'self_describe' | 'prefer_not';
const GENDERS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'self_describe', label: 'Prefer to self-describe' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

export default function Onboarding() {
  const router = useRouter();
  const { profile, updateProfile } = useSession();
  const [step, setStep] = useState<Step | null>(null);
  const [introPage, setIntroPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [selfDescribe, setSelfDescribe] = useState('');

  const extra = (profile ?? {}) as { topics?: string[]; languages?: string[] };
  const interests = profile?.interests ?? [];

  // Resume: the first required step that's missing, or the furthest step reached.
  useEffect(() => {
    if (!profile || step) return;
    void (async () => {
      const [seenIntro, saved] = await Promise.all([
        AsyncStorage.getItem(INTRO_SEEN_KEY).catch(() => null),
        AsyncStorage.getItem(STEP_KEY).catch(() => null),
      ]);
      setName(profile.name?.trim().split(/\s+/)[0] ?? '');
      setSelfDescribe(profile.gender_self_describe ?? '');
      let at: Step = seenIntro ? 'name' : 'intro';
      if (seenIntro && profile.name?.trim()) at = 'interests';
      if (seenIntro && profile.name?.trim() && (profile.interests?.length ?? 0) >= MIN_INTERESTS) {
        at = saved && ORDER.includes(saved as Step) && ORDER.indexOf(saved as Step) > ORDER.indexOf('interests') ? (saved as Step) : 'more';
      }
      setStep(at);
    })();
  }, [profile, step]);

  async function go(next: Step) {
    setError(null);
    setStep(next);
    await AsyncStorage.setItem(STEP_KEY, next).catch(() => undefined);
  }

  async function save(patch: Record<string, unknown>, next?: Step) {
    setBusy(true);
    setError(null);
    try {
      await updateProfile(patch as never);
      if (next) await go(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(list: string[], v: string) {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function finish() {
    await save({ onboarded: true });
    await AsyncStorage.multiRemove([STEP_KEY]).catch(() => undefined);
    router.replace('/');
  }

  if (!profile || !step) return <Loading label="Getting things ready" />;

  const index = ORDER.indexOf(step);
  const shared = [...new Set([...interests, ...(extra.topics ?? [])])].slice(0, 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      {/* Progress: one segment per step, current and done ones filled. */}
      <View
        style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 8 }}
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${index + 1} of ${ORDER.length}`}
      >
        {ORDER.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? colors.clay : colors.border }} />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          {step === 'intro' ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
              <LightPole light={PAGES[introPage].light} size="lg" />
              <Heading center>{PAGES[introPage].title}</Heading>
              <Text style={{ fontSize: 17, lineHeight: 25, color: colors.mocha, textAlign: 'center' }}>{PAGES[introPage].body}</Text>
            </View>
          ) : null}

          {step === 'name' ? (
            <>
              <Heading>What should people call you?</Heading>
              <Lead>Just your first name. It&apos;s only shown after you and someone else both agree to chat.</Lead>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="First name"
                placeholderTextColor={colors.mocha}
                autoFocus
                autoCapitalize="words"
                maxLength={40}
                accessibilityLabel="Your first name"
                returnKeyType="next"
                onSubmitEditing={() => name.trim() && void save({ name: name.trim() }, 'interests')}
                className="bg-cream border-border-warm text-espresso rounded-tile border px-4 text-[18px]"
                style={{ minHeight: 52 }}
              />
            </>
          ) : null}

          {step === 'interests' ? (
            <>
              <Heading>Pick a few things you&apos;d happily talk about</Heading>
              <Lead>
                We use these to show what you have in common with someone, never as a list on your profile.
                Pick at least {MIN_INTERESTS}.
              </Lead>
              <ChipGroup alwaysOpen allowCustom selected={interests} suggestions={INTEREST_SUGGESTIONS} onToggle={(v) => void save({ interests: toggle(interests, v) })} />
              <Caption>{interests.length >= MIN_INTERESTS ? `${interests.length} picked` : `${MIN_INTERESTS - interests.length} more to go`}</Caption>
            </>
          ) : null}

          {step === 'more' ? (
            <>
              <Heading>Anything else?</Heading>
              <Lead>Optional. Topics you like and languages you speak, for more in common.</Lead>
              <ChipGroup title="Topics" alwaysOpen allowCustom selected={extra.topics ?? []} suggestions={TOPIC_SUGGESTIONS} onToggle={(v) => void save({ topics: toggle(extra.topics ?? [], v) })} />
              <ChipGroup title="Languages" alwaysOpen allowCustom selected={extra.languages ?? []} suggestions={LANGUAGE_SUGGESTIONS} onToggle={(v) => void save({ languages: toggle(extra.languages ?? [], v) })} />
            </>
          ) : null}

          {step === 'gender' ? (
            <>
              <Heading>Your gender</Heading>
              {/* TODO(gender): say why we ask once the team decides what it's for
                  (e.g. an optional comfort setting). Nothing uses it yet. */}
              <Lead>Optional. This is private. It&apos;s never shown on your profile, at a table, or to anyone you chat with.</Lead>
              <View style={{ gap: 8 }}>
                {GENDERS.map((g) => {
                  const on = profile.gender === g.value;
                  return (
                    <Pressable
                      key={g.value}
                      onPress={() => void save({ gender: g.value })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={g.label}
                      style={{
                        minHeight: 52, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        borderWidth: on ? 2 : 1, borderColor: on ? colors.clay : colors.border, backgroundColor: on ? colors.claySoft : colors.surface,
                      }}
                    >
                      <Text style={{ fontSize: 17, color: colors.espresso }}>{g.label}</Text>
                      <Text style={{ fontSize: 17, color: colors.clay }}>{on ? '✓' : ''}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {profile.gender === 'self_describe' ? (
                <TextInput
                  value={selfDescribe}
                  onChangeText={setSelfDescribe}
                  onEndEditing={() => selfDescribe.trim() && void save({ gender: 'self_describe', gender_self_describe: selfDescribe.trim() })}
                  placeholder="In your own words"
                  placeholderTextColor={colors.mocha}
                  maxLength={40}
                  accessibilityLabel="Describe your gender, up to 40 characters"
                  className="bg-cream border-border-warm text-espresso rounded-tile border px-4 text-base"
                  style={{ minHeight: 48 }}
                />
              ) : null}
            </>
          ) : null}

          {step === 'done' ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
              <LightPole light="green" size="md" />
              <Heading>You&apos;re set{profile.name ? `, ${profile.name.trim().split(/\s+/)[0]}` : ''}</Heading>
              <Lead>Find a green light and say hi. When you meet someone, these are what you might share:</Lead>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {shared.map((v) => (
                  <Chip key={v} label={v} />
                ))}
              </View>
            </View>
          ) : null}

          {error ? <ErrorNote error={error} /> : null}
        </ScrollView>

        <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 8 }}>
          {step === 'intro' ? (
            <>
              <Button
                label={introPage < PAGES.length - 1 ? 'Next' : 'Get started'}
                onPress={() => {
                  if (introPage < PAGES.length - 1) setIntroPage(introPage + 1);
                  else {
                    void AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => undefined);
                    void go('name');
                  }
                }}
              />
              {introPage < PAGES.length - 1 ? (
                <Button label="Skip intro" variant="quiet" onPress={() => { void AsyncStorage.setItem(INTRO_SEEN_KEY, '1').catch(() => undefined); void go('name'); }} />
              ) : null}
            </>
          ) : null}
          {step === 'name' ? <Button label="Continue" busy={busy} disabled={!name.trim()} onPress={() => void save({ name: name.trim() }, 'interests')} /> : null}
          {step === 'interests' ? <Button label="Continue" disabled={interests.length < MIN_INTERESTS} onPress={() => void go('more')} /> : null}
          {step === 'more' ? (
            <>
              <Button label="Continue" onPress={() => void go('gender')} />
              <Button label="Skip" variant="quiet" onPress={() => void go('gender')} />
            </>
          ) : null}
          {step === 'gender' ? (
            <>
              <Button label="Continue" busy={busy} onPress={() => void go('done')} />
              <Button label="Skip" variant="quiet" onPress={() => void go('done')} />
            </>
          ) : null}
          {step === 'done' ? <Button label="Open the map" busy={busy} onPress={() => void finish()} /> : null}
          {index > 1 && step !== 'done' ? (
            <Button label="Back" variant="quiet" onPress={() => void go(ORDER[index - 1])} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Heading({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <Text display accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4, color: colors.espresso, textAlign: center ? 'center' : 'left' }}>
      {children}
    </Text>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 17, lineHeight: 25, color: colors.mocha }}>{children}</Text>;
}
