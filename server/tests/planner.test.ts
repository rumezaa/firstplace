// Unit tests for the meetup planner's judgement calls.
// Run: npm test   (in server/)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IDEAS } from '../src/ideas.js';
import {
  buildPlan, chooseVenue, distanceKm, interestScore, rankPicks, sharedVocabulary,
  weatherScore, whenLabel, type SharedProfile, type Venue,
} from '../src/planner.js';
import {
  headline, interpolate, outdoorScore, toReport, type PartOfDay, type WeatherReport, type WindowWeather,
} from '../src/weather.js';

// ---------------------------------------------------------------- helpers ----
const idea = (id: string) => {
  const found = IDEAS.find((i) => i.id === id);
  assert.ok(found, `no such idea: ${id}`);
  return found;
};

/** A forecast window, scored by the real functions so tests cannot drift. */
function mkWindow(day: string, part: PartOfDay, c: Partial<WindowWeather> = {}): WindowWeather {
  const base = {
    day, part,
    tempC: c.tempC ?? 14,
    feelsLikeC: c.feelsLikeC ?? c.tempC ?? 14,
    feelsLikeMinC: c.feelsLikeMinC ?? c.feelsLikeC ?? c.tempC ?? 14,
    precipProb: c.precipProb ?? 0,
    precipMm: c.precipMm ?? 0,
    snowCm: c.snowCm ?? 0,
    windKph: c.windKph ?? 8,
    daylight: c.daylight ?? 1,
    code: c.code ?? 0,
  };
  return { ...base, outdoorScore: outdoorScore(base), headline: headline(base) };
}

const report = (windows: WindowWeather[]): WeatherReport => ({
  latitude: 51, longitude: -114, timezone: 'America/Edmonton',
  windows, fetchedAt: new Date().toISOString(), source: 'open-meteo',
});

const VENUES: Venue[] = [
  { id: 'v1', name: 'Kensington Coffee Co.', lat: 51.0527, lng: -114.0876, type: 'cafe', address: 'A', is_quiet: false },
  { id: 'v2', name: 'Ninth & Ink', lat: 51.0387, lng: -114.033, type: 'cafe', address: 'B', is_quiet: false },
  { id: 'v3', name: 'Reading Room', lat: 51.045, lng: -114.06, type: 'study', address: 'C', is_quiet: true },
];

const shared = (interests: string[], topics: string[] = []): SharedProfile =>
  ({ interests, topics, languages: [] });

// ------------------------------------------------------------ interpolate ----
describe('interpolate', () => {
  it('clamps outside the table and reads the ends exactly', () => {
    const pts: [number, number][] = [[0, 0], [10, 1]];
    assert.equal(interpolate(-5, pts), 0);
    assert.equal(interpolate(0, pts), 0);
    assert.equal(interpolate(10, pts), 1);
    assert.equal(interpolate(99, pts), 1);
  });

  it('interpolates linearly between points', () => {
    const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
    near(interpolate(5, [[0, 0], [10, 1]]), 0.5);
    near(interpolate(3, [[0, 0], [4, 0.8], [10, 1]]), 0.6);
  });
});

// ----------------------------------------------------------- outdoorScore ----
describe('outdoorScore', () => {
  it('loves a mild, calm, dry afternoon', () => {
    assert.ok(mkWindow('2026-11-12', 'afternoon').outdoorScore > 0.9);
  });

  it('writes off a deep freeze', () => {
    const w = mkWindow('2026-11-12', 'afternoon', { tempC: -18, feelsLikeC: -26, feelsLikeMinC: -29 });
    assert.ok(w.outdoorScore < 0.12, `expected near zero, got ${w.outdoorScore}`);
  });

  it('scores the chinook trap on feels-like, not air temperature', () => {
    // A real Calgary pattern: +12 °C air, 45 km/h wind, feels like +3.
    const warmLooking = mkWindow('2026-11-12', 'afternoon', { tempC: 12, feelsLikeC: 3, windKph: 45 });
    const genuinelyMild = mkWindow('2026-11-12', 'afternoon', { tempC: 12, feelsLikeC: 12, windKph: 8 });
    assert.ok(
      warmLooking.outdoorScore < genuinelyMild.outdoorScore - 0.2,
      `wind chill ignored: ${warmLooking.outdoorScore} vs ${genuinelyMild.outdoorScore}`,
    );
    assert.match(warmLooking.headline, /feels like 3°/);
    assert.match(warmLooking.headline, /windy/);
  });

  it('penalises rain and darkness', () => {
    const wet = mkWindow('2026-11-12', 'afternoon', { precipProb: 90, precipMm: 6 });
    const dark = mkWindow('2026-11-12', 'evening', { daylight: 0 });
    assert.ok(wet.outdoorScore < 0.4, `wet: ${wet.outdoorScore}`);
    assert.ok(dark.outdoorScore < 0.5, `dark: ${dark.outdoorScore}`);
    assert.match(wet.headline, /90% chance of rain/);
  });
});

// ----------------------------------------------------------- weatherScore ----
describe('weatherScore', () => {
  it('rules out an outdoor walk in a deep freeze but keeps the cafe', () => {
    const freeze = mkWindow('2026-11-12', 'afternoon', { tempC: -20, feelsLikeC: -28, feelsLikeMinC: -30 });
    assert.ok(weatherScore(idea('river-walk'), freeze) < 0.05);
    assert.ok(weatherScore(idea('board-games'), freeze) > 0.9);
  });

  it('prefers being outside on a beautiful day', () => {
    const lovely = mkWindow('2026-11-12', 'afternoon', { tempC: 20, feelsLikeC: 20 });
    assert.ok(weatherScore(idea('river-walk'), lovely) > weatherScore(idea('board-games'), lovely));
  });

  it('wants the cold for outdoor ice, and only the cold', () => {
    const mild = mkWindow('2026-11-12', 'afternoon', { tempC: 8, feelsLikeC: 8 });
    const frosty = mkWindow('2026-11-12', 'afternoon', { tempC: -7, feelsLikeC: -8, feelsLikeMinC: -9 });
    assert.ok(weatherScore(idea('outdoor-rink'), mild) < 0.1, 'no ice above freezing');
    assert.ok(weatherScore(idea('outdoor-rink'), frosty) > 0.8, 'frosty is ideal rink weather');
    // And the generic comfort curve would have called that frosty window bad.
    assert.ok(weatherScore(idea('river-walk'), frosty) < weatherScore(idea('outdoor-rink'), frosty));
  });

  it('discounts outdoor plans when there is no forecast at all', () => {
    assert.equal(weatherScore(idea('board-games'), null), 0.8);
    assert.ok(weatherScore(idea('river-walk'), null) < 0.3);
  });

  it('blocks daylight-dependent ideas after dark', () => {
    const night = mkWindow('2026-11-12', 'evening', { tempC: 10, feelsLikeC: 10, daylight: 0 });
    assert.ok(weatherScore(idea('photo-walk'), night) < 0.1);
  });
});

// ---------------------------------------------------------- interestScore ----
describe('interestScore', () => {
  it('ignores ideas matching nothing they share', () => {
    assert.deepEqual(interestScore(idea('pottery'), ['cycling']), { score: 0, matched: [] });
  });

  it('rewards each additional shared word, up to 1', () => {
    assert.equal(interestScore(idea('board-games'), ['board games']).score, 0.6);
    assert.equal(interestScore(idea('board-games'), ['board games', 'chess']).score, 0.8);
    assert.equal(interestScore(idea('board-games'), ['board games', 'chess', 'coffee']).score, 1);
  });

  it('falls back to neutral when the pair shares nothing at all', () => {
    assert.equal(interestScore(idea('board-games'), []).score, 0.3);
  });

  it('normalises and merges interests with topics', () => {
    assert.deepEqual(
      sharedVocabulary(shared([' Hiking ', 'novels'], ['hiking', 'Travel'])).sort(),
      ['hiking', 'novels', 'travel'],
    );
  });
});

// --------------------------------------------------------------- the plan ----
describe('buildPlan', () => {
  const windows = [
    { day: '2026-11-12', part: 'afternoon' as PartOfDay },
    { day: '2026-11-14', part: 'morning' as PartOfDay },
  ];

  it('gets them outside when the weather earns it', () => {
    const plan = buildPlan({
      windows,
      shared: shared(['hiking', 'birdwatching']),
      weather: report([
        mkWindow('2026-11-12', 'afternoon', { tempC: -22, feelsLikeC: -28, feelsLikeMinC: -30 }),
        mkWindow('2026-11-14', 'morning', { tempC: 16, feelsLikeC: 15 }),
      ]),
      venues: VENUES, metAt: VENUES[1]!, today: '2026-11-11',
    });
    assert.ok(plan);
    // It must choose the mild morning over the frozen afternoon.
    assert.equal(plan.day, '2026-11-14');
    assert.equal(plan.idea.exposure, 'outdoor');
    assert.ok(plan.backup, 'an outdoor plan ships with an indoor backup');
  });

  it('moves the same pair indoors when every window is brutal', () => {
    const plan = buildPlan({
      windows,
      shared: shared(['hiking', 'birdwatching']),
      weather: report([
        mkWindow('2026-11-12', 'afternoon', { tempC: -24, feelsLikeC: -31, feelsLikeMinC: -33 }),
        mkWindow('2026-11-14', 'morning', { tempC: -21, feelsLikeC: -29, feelsLikeMinC: -31 }),
      ]),
      venues: VENUES, metAt: VENUES[1]!, today: '2026-11-11',
    });
    assert.ok(plan);
    assert.equal(plan.idea.exposure, 'indoor');
    assert.equal(plan.backup, null, 'an indoor plan needs no backup');
    assert.ok(plan.why.some((w) => /indoors/.test(w)), plan.why.join(' | '));
  });

  it('only ever suggests something both of them named', () => {
    const plan = buildPlan({
      windows,
      shared: shared(['board games']),
      weather: report([mkWindow('2026-11-14', 'morning')]),
      venues: VENUES, metAt: VENUES[0]!, today: '2026-11-11',
    });
    assert.ok(plan);
    assert.ok(idea(plan.idea.id).tags.includes('board games'), `${plan.idea.id} is not about board games`);
    assert.deepEqual(plan.sharedInterests, ['board games']);
    assert.match(plan.why[0]!, /You both put down board games/);
  });

  it('still produces a plan for a pair with no overlap, ranked on conversation', () => {
    const plan = buildPlan({
      windows,
      shared: shared([]),
      weather: report([mkWindow('2026-11-14', 'morning')]),
      venues: VENUES, metAt: VENUES[0]!, today: '2026-11-11',
    });
    assert.ok(plan);
    assert.ok(idea(plan.idea.id).conversation >= 0.85, 'should lean on talkable ideas');
    assert.match(plan.why[0]!, /not listed much in common/);
  });

  it('keeps outdoor plans out of windows with no forecast', () => {
    const plan = buildPlan({
      windows, shared: shared(['hiking', 'birdwatching']),
      weather: null, venues: VENUES, metAt: VENUES[0]!, today: '2026-11-11',
    });
    assert.ok(plan);
    assert.equal(plan.idea.exposure, 'indoor');
    assert.equal(plan.weatherSource, 'unavailable');
    assert.ok(plan.why.some((w) => /could not be reached/.test(w)), plan.why.join(' | '));
  });

  it('never proposes a window outside the mutual overlap', () => {
    const plan = buildPlan({
      windows: [{ day: '2026-11-12', part: 'afternoon' }],
      shared: shared(['hiking']),
      weather: report([
        mkWindow('2026-11-12', 'afternoon', { tempC: -25, feelsLikeC: -30, feelsLikeMinC: -32 }),
        // A gorgeous day neither of them offered: must be ignored.
        mkWindow('2026-11-13', 'afternoon', { tempC: 21, feelsLikeC: 21 }),
      ]),
      venues: VENUES, metAt: VENUES[0]!, today: '2026-11-11',
    });
    assert.ok(plan);
    assert.equal(plan.day, '2026-11-12');
  });

  it('offers two different alternatives', () => {
    const plan = buildPlan({
      windows, shared: shared(['hiking', 'novels', 'coffee']),
      weather: report([mkWindow('2026-11-14', 'morning'), mkWindow('2026-11-12', 'afternoon')]),
      venues: VENUES, metAt: VENUES[0]!, today: '2026-11-11',
    });
    assert.ok(plan);
    assert.equal(plan.alternatives.length, 2);
    const titles = new Set([plan.idea.title, ...plan.alternatives.map((a) => a.title)]);
    assert.equal(titles.size, 3, 'alternatives must differ from each other and the pick');
  });

  it('returns null rather than inventing a window', () => {
    assert.equal(
      buildPlan({ windows: [], shared: shared(['hiking']), weather: null, venues: VENUES, metAt: null, today: '2026-11-11' }),
      null,
    );
  });
});

// ------------------------------------------------------------ venue choice ----
describe('chooseVenue', () => {
  it('reuses the place they met when it suits the idea', () => {
    assert.equal(chooseVenue(idea('board-games'), VENUES, VENUES[1]!)?.id, 'v2');
  });

  it('switches venue type when the idea needs it, picking the nearest', () => {
    const v = chooseVenue(idea('study-session'), VENUES, VENUES[0]!);
    assert.equal(v?.id, 'v3', 'a work session wants the quiet/study venue');
  });

  it('gives outdoor ideas no venue at all', () => {
    assert.equal(chooseVenue(idea('river-walk'), VENUES, VENUES[0]!), null);
  });
});

describe('distanceKm', () => {
  it('measures a few km across Calgary', () => {
    const d = distanceKm(VENUES[0]!, VENUES[1]!);
    assert.ok(d > 3 && d < 6, `got ${d} km`);
  });
});

// ----------------------------------------------------------------- labels ----
describe('whenLabel', () => {
  it('uses relative names close by and a date further out', () => {
    assert.equal(whenLabel('2026-11-11', 'afternoon', '2026-11-11'), 'this afternoon');
    assert.equal(whenLabel('2026-11-12', 'morning', '2026-11-11'), 'tomorrow morning');
    assert.equal(whenLabel('2026-11-14', 'evening', '2026-11-11'), 'Saturday evening');
    assert.equal(whenLabel('2026-11-21', 'morning', '2026-11-11'), 'Saturday 21 Nov, morning');
  });
});

// --------------------------------------------------------------- bucketing ----
describe('toReport', () => {
  it('folds hourly readings into parts of the day', () => {
    const time: string[] = [];
    for (let h = 0; h < 24; h += 1) time.push(`2026-11-12T${String(h).padStart(2, '0')}:00`);
    const at = (h: number, v: number): number[] => time.map((_, i) => (i === h ? v : 0));

    const r = toReport(51, -114, {
      timezone: 'America/Edmonton',
      hourly: {
        time,
        temperature_2m: time.map(() => 10),
        apparent_temperature: time.map((_, i) => (i === 13 ? 2 : 8)),
        precipitation_probability: at(13, 70),
        precipitation: at(13, 3),
        snowfall: time.map(() => 0),
        wind_speed_10m: at(14, 50),
        is_day: time.map((_, i) => (i >= 8 && i < 17 ? 1 : 0)),
        weather_code: time.map(() => 3),
      },
    });

    assert.deepEqual(r.windows.map((w) => w.part), ['morning', 'afternoon', 'evening']);

    const afternoon = r.windows.find((w) => w.part === 'afternoon')!;
    assert.equal(afternoon.precipProb, 70, 'takes the worst hour for precipitation');
    assert.equal(afternoon.windKph, 50, 'takes the strongest gust');
    assert.equal(afternoon.feelsLikeMinC, 2, 'keeps the coldest feels-like');
    assert.equal(afternoon.daylight, 1, '12:00–17:00 is all daylight in the fixture');

    const evening = r.windows.find((w) => w.part === 'evening')!;
    assert.equal(evening.daylight, 0, '17:00–21:00 is dark in the fixture');

    // 00:00–08:00 is in no bucket: nobody is meeting then.
    assert.equal(r.windows.length, 3);
  });
});

// --------------------------------------------------------------- integrity ----
describe('the idea catalogue', () => {
  it('has unique ids and reachable tags', () => {
    assert.equal(new Set(IDEAS.map((i) => i.id)).size, IDEAS.length);
    for (const i of IDEAS) {
      assert.ok(i.tags.length > 0, `${i.id} has no tags and can never be suggested`);
      assert.ok(i.parts.length > 0, `${i.id} fits no part of day`);
      assert.ok(i.conversation >= 0 && i.conversation <= 1, `${i.id} conversation out of range`);
      assert.ok(i.energy >= 1 && i.energy <= 5, `${i.id} energy out of range`);
    }
  });

  it('can offer something indoors for every interest it knows', () => {
    const indoorTags = new Set(IDEAS.filter((i) => i.weather.exposure !== 'outdoor').flatMap((i) => i.tags));
    const outdoorOnly = [...new Set(IDEAS.flatMap((i) => i.tags))].filter((t) => !indoorTags.has(t));
    // Otherwise a pair who share only that word gets nothing in a cold snap.
    assert.deepEqual(outdoorOnly, [], `interests with no indoor option: ${outdoorOnly.join(', ')}`);
  });

  it('ranks deterministically', () => {
    const args = {
      windows: [{ day: '2026-11-14', part: 'morning' as PartOfDay }],
      shared: shared(['hiking', 'coffee']),
      weather: report([mkWindow('2026-11-14', 'morning')]),
    };
    const a = rankPicks(args.windows, args.shared, args.weather).map((p) => p.idea.id);
    const b = rankPicks(args.windows, args.shared, args.weather).map((p) => p.idea.id);
    assert.deepEqual(a, b);
  });
});
