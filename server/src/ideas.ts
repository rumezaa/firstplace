// ============================================================================
// The catalogue of things two people might do next
// ============================================================================
// Tags are drawn from the interest vocabulary the profile screen actually
// offers (app/(tabs)/profile.tsx INTEREST_SUGGESTIONS) plus the seeded topics,
// because an idea can only be recommended when it matches a word BOTH people
// picked. Adding an idea with invented tags makes it unreachable.
//
// `conversation` is weighted heavily by the planner on purpose. These two met
// by talking at a table; a loud show where they cannot hear each other is a bad
// second meeting even when it matches their taste perfectly.

import type { PartOfDay } from './weather.js';

export type Exposure = 'indoor' | 'covered' | 'outdoor';
export type Cost = 'free' | 'cheap' | 'moderate';

export interface WeatherNeeds {
  exposure: Exposure;
  /** Apparent-temperature range the activity itself needs. */
  minFeelsLikeC?: number;
  maxFeelsLikeC?: number;
  /** Percent chance of precipitation this stops working at. */
  maxPrecipProb?: number;
  maxWindKph?: number;
  needsDaylight?: boolean;
  /** Wants it cold: outdoor ice. */
  needsFreezing?: boolean;
}

export interface Idea {
  id: string;
  title: string;
  /** Second person, present tense, no names — goes straight on the card. */
  blurb: string;
  tags: string[];
  /** 1 = sitting down, 5 = you will need a shower afterwards. */
  energy: number;
  cost: Cost;
  /** 0..1 how well you can actually talk to each other while doing it. */
  conversation: number;
  parts: PartOfDay[];
  /** Which seeded venue type to anchor to, or null for "outdoors, no venue". */
  venue: 'cafe' | 'study' | 'any' | null;
  /** Shown when there is no venue row to name. */
  area?: string;
  weather: WeatherNeeds;
}

const INDOOR: WeatherNeeds = { exposure: 'indoor' };

export const IDEAS: Idea[] = [
  // ------------------------------------------------------------- indoor ----
  {
    id: 'board-games',
    title: 'A board game and a long coffee',
    blurb: 'Pick something short enough to finish and slow enough to talk over.',
    tags: ['board games', 'chess', 'coffee'],
    energy: 1, cost: 'cheap', conversation: 0.95,
    parts: ['morning', 'afternoon', 'evening'], venue: 'cafe', weather: INDOOR,
  },
  {
    id: 'chess',
    title: 'Chess at a quiet table',
    blurb: 'Best of three, loser buys the second round.',
    tags: ['chess', 'board games', 'grad school'],
    energy: 1, cost: 'cheap', conversation: 0.8,
    parts: ['morning', 'afternoon', 'evening'], venue: 'cafe', weather: INDOOR,
  },
  {
    id: 'book-swap',
    title: 'Trade one book each',
    blurb: 'Both bring something you have finished, swap, and report back next time.',
    tags: ['novels', 'zines', 'podcasts', 'languages', 'grad school'],
    energy: 1, cost: 'cheap', conversation: 0.9,
    parts: ['morning', 'afternoon', 'evening'], venue: 'cafe', weather: INDOOR,
  },
  {
    id: 'study-session',
    title: 'A side-by-side work session',
    blurb: 'Two hours heads-down, then compare what you actually got done.',
    tags: ['grad school', 'languages', 'novels', 'coffee'],
    energy: 1, cost: 'free', conversation: 0.55,
    parts: ['morning', 'afternoon'], venue: 'study', weather: INDOOR,
  },
  {
    id: 'cooking-class',
    title: 'A drop-in cooking class',
    blurb: 'Someone else does the dishes and you both leave knowing one new thing.',
    tags: ['cooking', 'baking', 'travel'],
    energy: 2, cost: 'moderate', conversation: 0.8,
    parts: ['afternoon', 'evening'], venue: null,
    area: 'a drop-in class downtown', weather: INDOOR,
  },
  {
    id: 'pottery',
    title: 'A pottery wheel for an hour',
    blurb: 'You will both make something slightly wrong, which is the point.',
    tags: ['pottery', 'knitting', 'cooking'],
    energy: 2, cost: 'moderate', conversation: 0.85,
    parts: ['afternoon', 'evening'], venue: null,
    area: 'a drop-in studio', weather: INDOOR,
  },
  {
    id: 'climbing-gym',
    title: 'Two hours of bouldering',
    blurb: 'Rentals at the door, no partner skills needed, plenty of sitting-down between problems.',
    tags: ['climbing', 'running', 'cycling', 'hiking'],
    energy: 4, cost: 'moderate', conversation: 0.7,
    parts: ['morning', 'afternoon', 'evening'], venue: null,
    area: 'a bouldering gym', weather: INDOOR,
  },
  {
    id: 'gallery',
    title: 'A gallery, then argue about one piece',
    blurb: 'Agree in advance to each pick a favourite and defend it over coffee.',
    tags: ['film photography', 'zines', 'travel', 'novels'],
    energy: 2, cost: 'cheap', conversation: 0.85,
    parts: ['morning', 'afternoon'], venue: null,
    area: 'a gallery downtown', weather: INDOOR,
  },
  {
    id: 'market-crawl',
    title: 'Eat your way through a market',
    blurb: 'One thing each from three different stalls, split everything.',
    tags: ['cooking', 'baking', 'coffee', 'travel', 'languages'],
    energy: 2, cost: 'cheap', conversation: 0.9,
    parts: ['morning', 'afternoon'], venue: null,
    area: 'an indoor market', weather: { exposure: 'covered', minFeelsLikeC: -20 },
  },
  {
    id: 'knit-night',
    title: 'Bring your project to a knit night',
    blurb: 'Hands busy, mouths free — the easiest kind of hanging out.',
    tags: ['knitting', 'pottery', 'podcasts'],
    energy: 1, cost: 'free', conversation: 0.95,
    parts: ['evening'], venue: 'cafe', weather: INDOOR,
  },
  {
    id: 'language-exchange',
    title: 'Half an hour in each language',
    blurb: 'Set a timer, switch when it goes, be patient with each other.',
    tags: ['languages', 'travel', 'grad school'],
    energy: 1, cost: 'free', conversation: 1,
    parts: ['morning', 'afternoon', 'evening'], venue: 'cafe', weather: INDOOR,
  },
  {
    id: 'live-music',
    title: 'Catch a local set',
    blurb: 'Get there early so you can actually talk before the band starts.',
    tags: ['live music', 'guitar', 'zines'],
    energy: 2, cost: 'moderate', conversation: 0.35,
    parts: ['evening'], venue: null,
    area: 'a small venue', weather: INDOOR,
  },
  {
    id: 'bake-off',
    title: 'Bake the same recipe, compare notes',
    blurb: 'Same recipe, separate kitchens, bring both to the table and judge honestly.',
    tags: ['baking', 'cooking'],
    energy: 1, cost: 'cheap', conversation: 0.9,
    parts: ['morning', 'afternoon'], venue: 'cafe', weather: INDOOR,
  },

  {
    id: 'trail-planning',
    title: 'Plan a trail day over coffee',
    blurb: 'Maps out, pick a route for the first decent weekend, agree who drives.',
    tags: ['hiking', 'birdwatching', 'travel', 'climbing', 'cycling', 'coffee'],
    energy: 1, cost: 'cheap', conversation: 0.95,
    parts: ['morning', 'afternoon', 'evening'], venue: 'cafe', weather: INDOOR,
  },
  {
    id: 'museum',
    title: 'The natural history halls',
    blurb: 'Dinosaurs and stuffed birds, and a cafe when your feet give out.',
    tags: ['birdwatching', 'hiking', 'travel', 'grad school', 'film photography', 'novels'],
    energy: 2, cost: 'cheap', conversation: 0.8,
    parts: ['morning', 'afternoon'], venue: null,
    area: 'a museum', weather: INDOOR,
  },
  {
    id: 'indoor-skatepark',
    title: 'An indoor skatepark session',
    blurb: 'Warm concrete in February. Bring a board or rent one at the desk.',
    tags: ['skateboarding', 'cycling', 'climbing', 'zines'],
    energy: 4, cost: 'cheap', conversation: 0.55,
    parts: ['afternoon', 'evening'], venue: null,
    area: 'an indoor park', weather: INDOOR,
  },

  // ------------------------------------------------------------ outdoor ----
  {
    id: 'river-walk',
    title: 'Walk the river pathway',
    blurb: 'Flat, free, and you can turn back whenever you have run out of things to say.',
    tags: ['running', 'birdwatching', 'film photography', 'cycling', 'hiking'],
    energy: 2, cost: 'free', conversation: 0.95,
    parts: ['morning', 'afternoon'], venue: null,
    area: 'the Bow River pathway',
    weather: { exposure: 'outdoor', minFeelsLikeC: -12, maxPrecipProb: 55, maxWindKph: 45, needsDaylight: true },
  },
  {
    id: 'photo-walk',
    title: 'A photo walk, one roll each',
    blurb: 'Pick a neighbourhood, shoot one roll or one battery, compare at the end.',
    tags: ['film photography', 'zines', 'travel', 'novels'],
    energy: 2, cost: 'free', conversation: 0.85,
    parts: ['morning', 'afternoon'], venue: null,
    area: 'Inglewood or Kensington',
    weather: { exposure: 'outdoor', minFeelsLikeC: -10, maxPrecipProb: 45, maxWindKph: 40, needsDaylight: true },
  },
  {
    id: 'bike-pathway',
    title: 'Ride the river pathway',
    blurb: 'Easy pace, coffee at the far end, ride back when you feel like it.',
    tags: ['cycling', 'running', 'hiking'],
    energy: 4, cost: 'free', conversation: 0.5,
    parts: ['morning', 'afternoon'], venue: null,
    area: 'the Bow River pathway',
    weather: { exposure: 'outdoor', minFeelsLikeC: 2, maxPrecipProb: 35, maxWindKph: 35, needsDaylight: true },
  },
  {
    id: 'foothills-hike',
    title: 'Get out to a foothills trail',
    blurb: 'An hour out of town, half a day gone, the best conversation you will have all month.',
    tags: ['hiking', 'birdwatching', 'film photography', 'travel', 'climbing'],
    energy: 4, cost: 'cheap', conversation: 0.9,
    parts: ['morning'], venue: null,
    area: 'Kananaskis or Bragg Creek',
    weather: { exposure: 'outdoor', minFeelsLikeC: -5, maxPrecipProb: 30, maxWindKph: 40, needsDaylight: true },
  },
  {
    id: 'easy-run',
    title: 'An easy run, talking pace',
    blurb: 'Agree on "talking pace" out loud first, or one of you will quietly race.',
    tags: ['running', 'cycling', 'climbing'],
    energy: 5, cost: 'free', conversation: 0.6,
    parts: ['morning', 'evening'], venue: null,
    area: 'a park loop',
    weather: { exposure: 'outdoor', minFeelsLikeC: -8, maxPrecipProb: 50, maxWindKph: 40 },
  },
  {
    id: 'birding',
    title: 'Early birding at the sanctuary',
    blurb: 'Bring one pair of binoculars between you and take turns.',
    tags: ['birdwatching', 'film photography', 'hiking'],
    energy: 2, cost: 'free', conversation: 0.75,
    parts: ['morning'], venue: null,
    area: 'the bird sanctuary',
    weather: { exposure: 'outdoor', minFeelsLikeC: -8, maxPrecipProb: 40, maxWindKph: 35, needsDaylight: true },
  },
  {
    id: 'skate-session',
    title: 'A skate session',
    blurb: 'Bring a board, borrow a board, or just sit on the ledge and watch.',
    tags: ['skateboarding', 'cycling', 'running'],
    energy: 4, cost: 'free', conversation: 0.6,
    parts: ['afternoon', 'evening'], venue: null,
    area: 'the skate park',
    weather: { exposure: 'outdoor', minFeelsLikeC: 4, maxPrecipProb: 25, maxWindKph: 35, needsDaylight: true },
  },
  {
    id: 'outdoor-rink',
    title: 'Skate an outdoor rink',
    blurb: 'Free rinks, cheap rentals, and falling over together is a shortcut to friendship.',
    tags: ['skateboarding', 'running', 'hiking', 'cycling'],
    energy: 3, cost: 'free', conversation: 0.75,
    parts: ['afternoon', 'evening'], venue: null,
    area: 'an outdoor rink',
    // The one idea that WANTS the cold: no ice above freezing.
    weather: { exposure: 'outdoor', needsFreezing: true, minFeelsLikeC: -18, maxPrecipProb: 60, maxWindKph: 35 },
  },
];

/** Ideas that work whatever the sky is doing — the pool backup plans come from. */
export const INDOOR_IDEAS = IDEAS.filter((i) => i.weather.exposure === 'indoor');
