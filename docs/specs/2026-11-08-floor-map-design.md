# Floor map screen: design spec

**Date:** 2026-11-08 · **Status:** design approved, not built yet
**Design file:** [`docs/design/floor-3.html`](../design/floor-3.html), a Claude Design export. Open it in a browser.

## The scenario

Someone walks onto Floor 3 of the Taylor Family Digital Library and taps the NFC tag at the entrance. The app opens on `firstplace://floor/<venueId>` and shows the whole floor at a glance: every FirstPlace table at its real spot, each with its live light. They pick a green table, walk over, and from there it's the usual table flow.

## What the screen shows

From the design file, top to bottom:

1. **Floating header card:** "TFDL · Floor 3", a live summary ("2 open to talk · 1 asking first") and a "Live" marker.
2. **Legend chips:** Say hi (green) · Ask first (yellow) · Not now (red) · Just a table (grey).
3. **Floor map:** our own simplified outline of the floor, upright to fill the phone. It has a Windows edge, a central corridor, and zones labelled Stacks, Open study and Group rooms.
4. **Table markers:** a dot in the light's colour with the table name and meaning beside it. Green gently pulses, the selected table gets a ring, and the caller's own table is marked. Small grey dots are tables without a light.
5. **"You are here" pin:** at the entrance, where the NFC tag is.
6. **Bottom card for the selected table:** name, one line on what the light means, and one action. "Go to this table" for green, "Ask to join" for yellow; red has no action.
7. **"Tables on this floor" list:** every table with its light chip and meaning, for screen readers and anyone who prefers a list.

## Decisions

- **Don't use the university PDF as the map.** Its footer forbids reproducing it without permission, and its room numbers are unreadable on a phone. We draw an original outline, using the PDF as a shape reference only.
- **Box positions aren't decided yet.** Each table stores its own position, so moving a box means editing a row, not code.
- **No floor switcher for now.** The design has a 4 / 3 / 2 / 1 switcher. It appears only when a building has more than one floor set up, which today it doesn't.
- **Use the app's own colours.** The design's colours are close; the build uses `src/lib/theme.ts` so everything matches.
- **Privacy stays the same:** tables and their colours only, never who is sitting where.

## How it will be built

**Data**
- Add `pos_x` and `pos_y` to `public.tables` (numbers from 0 to 1 across the floor outline; null means not placed). This is a new migration, plus values for the three TFDL tables.
- `GET /venues/:id/floor` also returns `pos_x` and `pos_y`. Nothing else changes in what it returns.

**Floor outline**
- `src/lib/floorLayouts.ts`: the outline for each venue (zones, corridor, Windows edge, entrance pin), in the same 0–1 coordinates. TFDL floor 3 is the only entry for now. A venue without a layout falls back to the list only.

**Components** (replacing the schematic in `app/floor/[venueId].tsx`)
- `FloorMap`: draws the outline and markers with `react-native-svg`, which is already a dependency and works in Expo Go.
- `TableMarker`: dot, label and pulse. Tap targets are at least 44pt.
- `TableSheet`: the bottom card and its single action.
- The existing table list, restyled to match the design.

**Behaviour**
- Refreshes every 3 seconds while the screen is open, as today.
- On a failed refresh, the last known lights stay on screen, with an error and Retry.
- Tables without a position are left off the map but stay in the list.

## Out of scope
- Floors other than TFDL Floor 3, and the floor switcher.
- Turn-by-turn directions to a table.
- Placing tables by dragging them on the map; positions are set in the database for now.
