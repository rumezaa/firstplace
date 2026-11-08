import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Text';

import { errorMessage } from '@/lib/api';
import {
  COST_LABEL,
  EXPOSURE_LABEL,
  PARTS,
  PART_LABEL,
  buildPlan,
  cancelMeetup,
  dayLabel,
  daysFrom,
  fetchMeetup,
  openMeetup,
  respondToMeetup,
  saveAvailability,
  slotKey,
  weatherShort,
  weatherTone,
  type ForecastWindow,
  type MeetupPlan,
  type MeetupView,
  type PartOfDay,
  type Slot,
} from '@/lib/meetups';
import { useVenueTablesRealtime } from '@/hooks/useRealtime';
import { fetchConnectionItinerary, type ItineraryResponse } from '@/lib/plans';
import { useAsync } from '@/hooks/useAsync';
import { MIN_TAP_TARGET } from '@/lib/theme';
import {
  Badge, Body, Button, Caption, Card, ErrorNote, Loading, Screen, SectionTitle, Title,
} from '@/components/ui';

/** A week is what the forecast can honestly support, and what people plan in. */
const DAYS_SHOWN = 7;

/**
 * Plan the next one.
 *
 * The screen is a handshake, not a calendar invite. You tick the windows that
 * work for you; you are told whether the other person has answered but never
 * what they picked; once you both have, the overlap appears and the plan is
 * built from it. Then it takes two yeses, like everything else in this app.
 */
export default function MeetupScreen() {
  const { connectionId, meetup } = useLocalSearchParams<{ connectionId: string; meetup?: string }>();
  const activeId = useRef<{ connection: string; id: string } | null>(null);
  const acting = useRef(false);
  const router = useRouter();

  // open_meetup resumes any plan already in flight, so this is safe to re-run.
  const state = useAsync(async () => {
    let id = meetup ?? (activeId.current?.connection === connectionId ? activeId.current.id : undefined);
    if (!id) id = (await openMeetup(connectionId)).meetup_id;
    activeId.current = { connection: connectionId, id };
    return fetchMeetup(id);
  }, [connectionId, meetup]);
  useVenueTablesRealtime(null, () => { if (!acting.current) void state.reload(); });

  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const view = state.data;

  // What the picker shows: my unsaved edits when I have made any, otherwise
  // whatever I ticked last time. Derived rather than copied into state in an
  // effect, so there is one source of truth and no cascading render.
  const selection = useMemo(
    () => picked ?? new Set((view?.my_windows ?? []).map(slotKey)),
    [picked, view?.my_windows],
  );

  const act = async (name: string, fn: () => Promise<unknown>) => {
    if (acting.current) return;
    acting.current = true;
    setBusy(name);
    setActionError(null);
    try {
      await fn();
      setPicked(null);
      if (name !== 'restart') await state.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      acting.current = false;
      setBusy(null);
    }
  };

  const restart = () => act('restart', async () => {
    const { meetup_id } = await openMeetup(connectionId);
    activeId.current = { connection: connectionId, id: meetup_id };
    setEditing(false);
    router.replace(`/meetup/${connectionId}?meetup=${meetup_id}`);
  });

  if (state.loading && !view) {
    return <Screen><Loading label="Opening the plan" /></Screen>;
  }
  if (state.error || !view) {
    return (
      <Screen>
        <Title>Cannot open this plan</Title>
        <ErrorNote error={state.error ?? 'That plan is not available.'} onRetry={() => void state.reload()} />
        <Button label="Back to connections" variant="quiet" onPress={() => router.back()} />
      </Screen>
    );
  }

  const name = view.their_first_name ?? 'them';
  const showPicker = view.status === 'collecting' && (editing || view.overlap.waiting_on === 'you');

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />

      <View className="gap-1">
        <Title>{view.status === 'confirmed' ? `Your plan with ${name}` : `Plan with ${name}`}</Title>
        <Body>
          {view.status === 'confirmed'
            ? 'You both said yes. Here is the plan you agreed on.'
            : `Pick the times that work for you. Only the times you both pick are shared.`}
        </Body>
      </View>

      <SharedCard view={view} />

      {actionError ? <ErrorNote error={actionError} /> : null}

      {view.status === 'confirmed' && view.plan ? (
        <View className="gap-3"><ConfirmedCard plan={view.plan} name={name} />
          <Button label="Plan another" variant="secondary" busy={busy === 'restart'} onPress={() => void restart()} />
        </View>
      ) : null}

      {view.status === 'proposed' && view.plan ? (
        <PlanCard
          plan={view.plan}
          name={name}
          mine={view.i_accepted}
          theirs={view.they_accepted}
          busy={busy}
          onRespond={(accept) => void act('respond', () => respondToMeetup(view.meetup_id, accept))}
          onRebuild={() => void act('rebuild', () => buildPlan(view.meetup_id))}
        />
      ) : null}

      {view.status === 'declined' || view.status === 'expired' ? (
        <Card accent="amber" className="gap-3">
          <SectionTitle>This one did not happen</SectionTitle>
          <Body>No hard feelings — start another whenever you like.</Body>
          <Button
            label="Start a new plan"
            busy={busy === 'restart'}
            onPress={() => void restart()}
          />
        </Card>
      ) : null}

      {showPicker ? (
        <Picker
          view={view}
          picked={selection}
          onToggle={(slot) => {
            const next = new Set(selection);
            const key = slotKey(slot);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            setPicked(next);
          }}
          busy={busy === 'save'}
          onSave={() => {
            const slots = [...selection].map((key) => {
              const [day, part] = key.split('|');
              return { day: day!, part: part as PartOfDay };
            });
            setEditing(false);
            void act('save', () => saveAvailability(view.meetup_id, slots));
          }}
        />
      ) : null}

      {view.status === 'collecting' && !showPicker ? (
        <Waiting
          view={view}
          name={name}
          busy={busy}
          onEdit={() => setEditing(true)}
          onBuild={() => void act('build', () => buildPlan(view.meetup_id))}
        />
      ) : null}

      {view.status === 'collecting' || view.status === 'proposed' ? (
        <Button
          label="Call it off"
          variant="quiet"
          busy={busy === 'cancel'}
          onPress={() => void act('cancel', () => cancelMeetup(view.meetup_id))}
        />
      ) : null}

      <WalkingPlan connectionId={connectionId} />

      <Card className="gap-2">
        <SectionTitle>How this works</SectionTitle>
        <Caption>
          Suggestions come from the interests you have both listed — never one of you alone — and
          from the Calgary forecast for the window you both picked. You cannot see {name}&apos;s
          times and {name} cannot see yours; only the overlap is shared, and only once you have
          both answered.
        </Caption>
      </Card>
    </Screen>
  );
}

/* --------------------------------------------------------------- the pair -- */

function SharedCard({ view }: { view: MeetupView }) {
  const common = [...new Set([...view.shared.interests, ...view.shared.topics])].slice(0, 5);
  // One quiet line under the title; the name is already the headline.
  const bits = [view.met_at ? `Met at ${view.met_at.name}` : null, common.length ? `both like ${common.join(', ')}` : null].filter(Boolean);
  return bits.length ? <Caption>{bits.join(' · ')}</Caption> : null;
}

/* ------------------------------------------------------------- the picker -- */

function Picker({
  view, picked, onToggle, onSave, busy,
}: {
  view: MeetupView;
  picked: Set<string>;
  onToggle: (slot: Slot) => void;
  onSave: () => void;
  busy: boolean;
}) {
  const days = useMemo(() => daysFrom(view.today, DAYS_SHOWN), [view.today]);
  const byKey = useMemo(() => {
    const map = new Map<string, ForecastWindow>();
    for (const w of view.forecast) map.set(`${w.day}|${w.part}`, w);
    return map;
  }, [view.forecast]);

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <SectionTitle>When are you free?</SectionTitle>
        <Caption>
          {view.forecast_available
            ? 'With the forecast for each.'
            : 'The forecast is unavailable right now, so these are times only.'}
        </Caption>
      </View>

      {days.map((day) => (
        <View key={day} className="gap-2">
          <Caption className="font-semibold">{dayLabel(day, view.today)}</Caption>
          <View className="flex-row gap-2">
            {PARTS.map((part) => {
              const w = byKey.get(`${day}|${part}`) ?? null;
              const on = picked.has(slotKey({ day, part }));
              return (
                <SlotChip
                  key={part}
                  part={part}
                  weather={w}
                  selected={on}
                  onPress={() => onToggle({ day, part })}
                />
              );
            })}
          </View>
        </View>
      ))}

      <Button
        label={picked.size ? `Save ${picked.size} time${picked.size === 1 ? '' : 's'}` : 'Pick at least one'
        }
        disabled={picked.size === 0}
        busy={busy}
        onPress={onSave}
      />
    </Card>
  );
}

/**
 * One tappable window.
 *
 * Note the colours: the forecast tint uses the sage/amber/brick tones, never
 * the box light's green/yellow/red, which mean one thing only in this app.
 */
function SlotChip({
  part, weather, selected, onPress,
}: {
  part: PartOfDay;
  weather: ForecastWindow | null;
  selected: boolean;
  onPress: () => void;
}) {
  const edge = selected ? 'bg-clay border-clay' : 'bg-surface border-border-warm';

  const short = weatherShort(weather);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        `${PART_LABEL[part]}${weather ? `, ${weather.headline}` : ''}, ${selected ? 'selected' : 'not selected'}`
      }
      style={{ minHeight: MIN_TAP_TARGET }}
      className={`flex-1 items-center justify-center rounded-tile border px-2 py-2 ${edge}`}
    >
      <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-espresso'}`}>
        {PART_LABEL[part]}
      </Text>
      {short ? (
        <Text className={`text-xs ${selected ? 'text-white' : 'text-mocha'}`}>{short}</Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------- in between -- */

function Waiting({
  view, name, busy, onEdit, onBuild,
}: {
  view: MeetupView;
  name: string;
  busy: string | null;
  onEdit: () => void;
  onBuild: () => void;
}) {
  const { waiting_on, ready, windows } = view.overlap;

  if (ready) {
    return (
      <Card accent="berry" className="gap-3">
        <Badge label={`${windows.length} time${windows.length === 1 ? '' : 's'} work for you both`} tone="chat" />
        <SectionTitle>You have an overlap</SectionTitle>
        <Body>
          {windows.map((w) => `${dayLabel(w.day, view.today)} ${w.part}`).join(' · ')}
        </Body>
        <Button label="Build the plan" busy={busy === 'build'} onPress={onBuild} />
        <Button label="Change my times" variant="quiet" onPress={onEdit} />
      </Card>
    );
  }

  if (waiting_on === 'no_overlap') {
    return (
      <Card accent="amber" className="gap-3">
        <SectionTitle>None of your times line up</SectionTitle>
        <Body>
          You have both answered, but not with a window in common. Adding a couple more is usually
          enough.
        </Body>
        <Button label="Add more times" onPress={onEdit} />
      </Card>
    );
  }

  return (
    <Card accent="clay" className="gap-3">
      <Badge label={`Waiting on ${name}`} tone="filling" />
      <SectionTitle>Your times are saved</SectionTitle>
      <Body>
        {name} has not picked yet. As soon as they do, the times you both chose show up here — and
        only those.
      </Body>
      <Button label="Change my times" variant="quiet" onPress={onEdit} />
    </Card>
  );
}

/* --------------------------------------------------------------- the plan -- */

function PlanCard({
  plan, name, mine, theirs, busy, onRespond, onRebuild,
}: {
  plan: MeetupPlan;
  name: string;
  mine: boolean;
  theirs: boolean;
  busy: string | null;
  onRespond: (accept: boolean) => void;
  onRebuild: () => void;
}) {
  return (
    <Card accent="berry" className="gap-3">
      {theirs ? <Badge label={`${name} is in`} tone="chat" /> : null}
      {mine && !theirs ? <Badge label={`Waiting on ${name}`} tone="filling" /> : null}

      <PlanBody plan={plan} />

      {mine ? (
        <Caption>You have said yes. We will tell you when {name} does.</Caption>
      ) : (
        <View className="gap-3">
          <Button label="I am in" busy={busy === 'respond'} onPress={() => onRespond(true)} />
          <Button
            label="Not this one"
            variant="quiet"
            disabled={busy !== null}
            onPress={() => onRespond(false)}
          />
          <Button
            label="Suggest something else"
            variant="secondary"
            busy={busy === 'rebuild'}
            onPress={onRebuild}
          />
        </View>
      )}
    </Card>
  );
}

function ConfirmedCard({ plan, name }: { plan: MeetupPlan; name: string }) {
  return (
    <Card accent="sage" className="gap-3">
      <Badge label="You are both in" tone="open" />
      <PlanBody plan={plan} />
      <Caption>
        Confirmed with {name}. The weather line was the forecast when this was planned — worth a
        glance again on the day.
      </Caption>
    </Card>
  );
}

/** The plan itself, shared by the proposed and confirmed cards. */
function PlanBody({ plan }: { plan: MeetupPlan }) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Caption className="font-semibold">{plan.when}</Caption>
        <SectionTitle>{plan.idea.title}</SectionTitle>
        <Body>{plan.idea.blurb}</Body>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Badge label={EXPOSURE_LABEL[plan.idea.exposure]} />
        <Badge label={COST_LABEL[plan.idea.cost]} />
        {plan.weather ? (
          <Badge label={plan.weather.headline} tone={weatherTone(plan.weather)} />
        ) : null}
      </View>

      {plan.venue ? (
        <Body>
          {plan.venue.name}
          {plan.venue.address ? ` · ${plan.venue.address}` : ''}
        </Body>
      ) : plan.area ? (
        <Body>Somewhere like {plan.area}.</Body>
      ) : null}

      {plan.invitation ? (
        <View className="bg-sunk rounded-tile p-3">
          <Caption>{plan.invitation}</Caption>
        </View>
      ) : null}

      <View className="gap-1">
        {plan.why.map((line) => (
          <Caption key={line}>· {line}</Caption>
        ))}
      </View>

      {plan.backup ? (
        <View className="border-border-warm rounded-tile border p-3">
          <Caption className="font-semibold">If the weather turns: {plan.backup.title}</Caption>
          <Caption>
            {plan.backup.blurb}
            {plan.backup.venue ? ` (${plan.backup.venue})` : ''}
          </Caption>
        </View>
      ) : null}

      {plan.alternatives.length ? (
        <Caption>
          Other options: {plan.alternatives.map((a) => `${a.title} (${a.when})`).join(' · ')}
        </Caption>
      ) : null}
    </View>
  );
}

/**
 * "Or just go for a walk": a short route from where you first met, built on
 * public City of Calgary places, today's weather, the time and holidays
 * (server/src/itinerary.ts). Gemini writes the stops from what you both share;
 * without it the route still works. Loads only when asked.
 */
const START_TIMES = ['Now', '12:00', '14:00', '17:00'] as const;

function WalkingPlan({ connectionId }: { connectionId: string }) {
  const [start, setStart] = useState<(typeof START_TIMES)[number] | null>(null);
  const [data, setData] = useState<ItineraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(at: (typeof START_TIMES)[number]) {
    setStart(at);
    setLoading(true);
    setError(null);
    try {
      setData(await fetchConnectionItinerary(connectionId, at === 'Now' ? {} : { start: at }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const it = data?.itinerary ?? null;
  const ctx = data?.context;
  return (
    <Card className="gap-3">
      <SectionTitle>Or just go for a walk</SectionTitle>
      <Caption>A short route from where you met, using public Calgary places, today&apos;s weather and what you both like.</Caption>
      <View className="flex-row flex-wrap gap-2">
        {START_TIMES.map((t) => (
          <Button
            key={t}
            label={t === 'Now' ? 'Now' : to12h(t)}
            variant={start === t ? 'primary' : 'quiet'}
            busy={loading && start === t}
            onPress={() => void load(t)}
          />
        ))}
      </View>

      {error ? <ErrorNote error={error} /> : null}
      {ctx?.weather ? (
        <Caption>
          {ctx.weekday[0].toUpperCase() + ctx.weekday.slice(1)} · {ctx.weather.condition}
          {ctx.weather.tempC != null ? `, ${Math.round(ctx.weather.tempC)}°C` : ''}
          {ctx.weather.feelsLikeC != null ? ` (feels ${Math.round(ctx.weather.feelsLikeC)}°)` : ''}
          {ctx.holiday ? ` · ${ctx.holiday}` : ''}
        </Caption>
      ) : null}
      {data && !it ? <Body>{data.message ?? 'Nothing fits that time. Try another.'}</Body> : null}

      {it ? (
        <View className="gap-3">
          <Text style={{ fontSize: 17, fontWeight: '700' }}>{it.title}</Text>
          {it.stops.map((stop) => (
            <View key={stop.order} className="gap-1">
              <Caption>
                {stop.arriveClock} · {stop.walkMinFromPrev} min walk
              </Caption>
              <Text style={{ fontSize: 16, fontWeight: '600' }}>{stop.place.name}</Text>
              <Body>{stop.what}</Body>
              {stop.icebreaker ? <Caption>Ask: {stop.icebreaker}</Caption> : null}
            </View>
          ))}
          {it.notes.map((n) => (
            <Caption key={n}>{n}</Caption>
          ))}
          {data?.generated ? <Caption>Written with Gemini from what you both listed. Places: City of Calgary open data.</Caption> : null}
        </View>
      ) : null}
    </Card>
  );
}

function to12h(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}
