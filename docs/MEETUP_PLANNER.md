# Planning the second meeting

> Why FirstPlace does not just call Gemini and ask for an itinerary, and what we
> built instead. Code: `db/migrations/100_meetups.sql`, `server/src/planner.ts`,
> `server/src/weather.ts`, `server/src/ideas.ts`, `app/meetup/[connectionId].tsx`.

## 1. What Gemini's itinerary building actually is

Two different things get called "Gemini itinerary building", and it is worth
separating them before copying either:

| | What it does | Shape |
|---|---|---|
| **Canvas for travel in AI Mode** (Google Search) | You describe a trip, pick "Create Canvas", and a plan appears in a side panel pulling in Google Flights/Hotels data, Maps reviews and web sources. Follow-ups let you weigh tradeoffs ("a hotel closer to brunch or closer to the trails?"). Desktop, US, Labs opt-in. | One person, one prompt, one document |
| **Gemini app Canvas** (general builder) | Will happily *build you a trip-planner app*. One reviewer got a shareable board with drag-and-drop pinning; another got a day-by-day Osaka itinerary and an infographic. | One person generating an artifact |

Both are genuinely good at the thing they do: turning a vague intent into a
plausible, well-written, well-sourced plan in seconds. The flight and hotel
integration is a real advantage over other chatbots.

### Where it breaks

Reviewers testing it as a real trip planner keep finding the same four classes
of failure:

1. **Ground truth goes stale.** A reporter who followed a two-night Gemini
   itinerary without checking anything hit wrong walkability claims, missed
   seasonal opening hours, and learned about rail disruption late. The
   conclusion was that it needs real-time checks and flexible plans.
2. **It loses the thread.** In a Malaysia test the model mixed up the travel
   dates while searching flights and offered hotels for dates that were not in
   its own itinerary, and had to be re-told the plan.
3. **It is confidently generic.** Information is often dated, and it
   hallucinates. Other tests found it missing obvious basics.
4. **It is single-player.** This is the important one for us, and it is not a
   bug — it is the shape of the product. The prompt comes from one person, the
   plan is returned to one person, and when sharing shows up it is sharing a
   *document*, not reconciling two sets of preferences. Nothing in it asks "what
   does the other person want, and when are they actually free?"

Sources: [Google's announcement](https://blog.google/products/search/agentic-plans-booking-travel-canvas-ai-mode/),
[Tom's Guide](https://www.tomsguide.com/ai/i-used-canvas-in-gemini-to-plan-a-trip-and-it-found-free-activities-i-didnt-expect),
[a tech writer's test](https://www.thestar.com.my/tech/tech-news/2026/05/07/opinion-a-tech-writer-puts-googles-ai-to-the-test-as-a-trip-planner),
[a Malaysia trip test](https://hulry.com/google-ai-travel-planner/),
[Afar's comparison of four AI planners](https://www.afar.com/magazine/we-tested-ai-travel-planning-apps-here-are-the-3-that-actually-worked).

## 2. Why that shape is wrong for FirstPlace

Our problem is not "plan a trip". It is the second line of the README: *the
people you keep seeing never become people you know.* The box gets two
strangers talking once. The thing that turns a good conversation into a
friendship is a **second meeting**, and that is where it falls apart — because
arranging one requires someone to go first, propose something, and risk a no.

So the planner's job is not to produce an impressive document. It is to **lower
the cost of asking**. That changes every design decision:

- A single-player planner would make one person the organiser, which is exactly
  the social risk we are removing.
- A plan built from one person's taste is a plan the other person has to be
  polite about.
- "Just share your calendar" is a privacy problem, not a feature. Telling
  someone you met once when you are and are not home is a bad trade.
- A confident outdoor suggestion that ignores the forecast is worse than no
  suggestion in a city that goes from +15 °C to −20 °C in a week.

## 3. The key features, and where each one lives

| Feature | Why it is necessary to *connect people* | Where |
|---|---|---|
| **Two-sided input, intersected** | The suggestion is built from `app_private.shared_between()` — the same 3-interest/5-topic intersection the conversation card uses. Every match is therefore a mutual interest, so the planner is structurally incapable of suggesting something only one of them likes. | `shared_between()`, `interestScore()` |
| **Mutual consent as the state machine** | A plan is a *proposal*: `collecting → proposed → confirmed`, and it only confirms when both have said yes. Identical to a chat request and a familiar face, so the app never asks anyone to be the one who put themselves out there. | `respond_to_meetup()` |
| **Calendar privacy** | Each side ticks day + part-of-day. `meetup_overlap()` returns the **intersection**, and only once both have answered; before that it returns `waiting_on` and an empty list. There is no query that returns one person's windows to the other, so the feature cannot be used to probe when someone is free — or when they are not home. | `meetup_overlap()` |
| **Coarse time, on purpose** | Morning / afternoon / evening. A week-out forecast cannot honestly support finer, and it keeps this from becoming a location-sharing feature. | `public.part_of_day` |
| **A real forecast, scored on feels-like** | Open-Meteo (no API key), bucketed per window. Scored on *apparent* temperature: a +12 °C chinook afternoon with a 45 km/h wind feels like +3, and "12 °C, go for a walk" is wrong in the way that makes people stop trusting the app. | `weather.ts` |
| **Temperature as a gate, not a vote** | An early version averaged comfort, rain and wind, which scored a −28 °C afternoon at 0.34 because it was dry and calm. A still, clear −28 is not 34% of a nice day. Comfort now multiplies. | `outdoorScore()` |
| **Indoor is the default, not the consolation** | Indoor ideas score 0.80–0.95, rising as outside gets worse. Capped just below a genuinely lovely window so a rare +16 °C morning gets them onto the river path instead of into a cafe. | `weatherScore()` |
| **A backup plan, always** | Every weather-exposed plan ships with an indoor alternative for the same window. A seven-day forecast is a guess, and "cancelled" is how a second meeting quietly never happens. | `buildPlan()` |
| **Conversation-weighted ranking** | These two met by talking, so a loud show is a bad second meeting even when it matches their taste. `conversation` carries more weight than cost or time-of-day fit. | `WEIGHTS` |
| **Grounded in our own venue data** | Venues come from `public.venues` with real coordinates, and the default is the place they already met — "where you already know the way in". The model is never asked to name a cafe, so it cannot invent one. | `chooseVenue()` |
| **It explains itself** | Every plan carries `why`: the shared words it used, the forecast line, the venue, and whether it is quiet enough to talk. A suggestion you cannot audit is a suggestion you cannot correct. | `explain()` |
| **AI writes copy, never decides** | Gemini gets the finished plan and writes one warm opening line. It cannot change the activity, day or venue, and names are never sent. No key, or an outage → the line is absent and everything else still works. | `invitationLine()` |
| **Safety carries forward** | A block suppresses the connection, the plan and the list. Availability is deleted once a plan is settled. | `meetup_other()`, `expire_stale_meetups()` |

## 4. The scoring model

```
score = 0.38 · interest    every match is mutual, because the input is an intersection
      + 0.30 · weather     heavy: this is the half a generic planner gets wrong
      + 0.18 · talk        these two met by talking; protect that
      + 0.09 · time        an idea in a part of day it suits
      + 0.05 · cost        a cheap second meeting is easier to say yes to
```

Ranked over every (mutual window × idea) pair. An idea matching nothing they
both listed scores zero and is dropped entirely rather than padded out.

Two deliberate edge cases:

- **No shared interests at all.** Some pairs have none — the overlap is capped
  at three interests. Every idea then scores a flat 0.3 and ranking falls
  through to conversation value and weather. A plain, talkable suggestion beats
  refusing to suggest anything.
- **Activities that want the cold.** Outdoor skating is scored on its own terms
  (`needsFreezing`): above freezing there is no ice, and a −8 °C still afternoon
  is ideal rather than a hardship. The generic comfort curve would have called
  it a bad day.

The catalogue is checked by a test that every interest it knows has at least one
**indoor** option — otherwise a pair who share only "hiking" gets nothing during
a cold snap. (That test failed when first written, which is why `trail-planning`,
`museum` and `indoor-skatepark` exist.)

## 5. Tests

```bash
cd server && npm test                                  # 32 unit tests, no DB or network needed
python3 tests/meetup_test.py http://localhost:8787     # 43 assertions, real forecast, fresh seed
```

The unit tests cover the judgement calls: the chinook trap, the deep freeze, ice
needing cold, daylight gating, the intersection-only invariant, and determinism.
The end-to-end test covers the handshake, including the two privacy assertions
that neither side can see the other's windows before both have answered.

## 6. Not built

- **Notifications.** The other person finds out by opening the app. A plan
  waiting for a yes is the obvious first push notification.
- **Time of day is as fine as it gets.** No "2pm at the north entrance". That
  needs a message thread, which is a product decision, not a technical one.
- **Travel fairness.** `distanceKm` ranks venues near where they met; it does
  not balance the two people's actual journeys, because we deliberately do not
  store where anyone lives.
- **Real venues for non-cafe ideas.** `museum`, `pottery`, `climbing-gym` and
  friends name an area, not a business. They want a Places lookup or a curated
  table.
- **Learning.** Nothing records whether a confirmed plan actually happened, so
  the weights are reasoned, not fitted.
