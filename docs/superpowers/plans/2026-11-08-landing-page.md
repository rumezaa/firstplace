# Chatterbox Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, pastel, picture-book landing page for Chatterbox in `website/`: a six-panel scroll hero story, a light legend, three tabs (people / venues / how we built it) and a footer.

**Architecture:** One `index.html`, one stylesheet, two small ES modules (`js/tabs.js` with pure, testable hash logic; `js/main.js` for scroll reveals and the header). Images are pre-compressed WebP in `website/img/`. Tests run with Node's built-in `node:test` (no dependencies). Visual checks use the cached headless Chromium.

**Tech Stack:** HTML, CSS (scroll-snap, custom properties), vanilla JS modules, Google Fonts (Fredoka for headings), ImageMagick for image prep, Node 22 `node:test`.

**Spec:** `docs/specs/2026-11-08-landing-page-design.md`. Read it first; copy comes from there.

## Global Constraints

- Everything lives in `website/`. Do not touch `app/`, `src/`, `server/`, `package.json` or the Expo config.
- No build step and no npm dependencies. External requests are allowed only to `fonts.googleapis.com` / `fonts.gstatic.com`.
- The product name is **Chatterbox** everywhere. Never "FirstPlace" or "Third Place".
- Green / yellow / red mean only the table light: green "Say hi" (open to talk, walk over and join), yellow "Free table" (claim it to start your own), red "Not now" (taken or not available).
- Ink #2e2a3a, card paper #fffaf2. Paper components have a 3px ink outline, about 20px radius and a 6px 6px 0 ink hard shadow. No gradient blobs, glows, emoji icons, uppercase eyebrow labels or soft shadow stacks.
- Width 360px and up with a 16px side gutter, no sideways scroll. `prefers-reduced-motion` disables all animation.
- Total page weight under 3 MB. Every image has meaningful `alt` text. Text contrast is at least 4.5:1.
- Commits: plain messages, **no AI co-author lines** (repo rule in `docs/REVIEW_BRIEF.md`).
- The page works when opened from disk (`file://`), so no `fetch` of local files. ES modules over `file://` are blocked in Chrome, so load scripts as classic `<script defer>`. Write `tabs.js` so it also exports for Node: `if (typeof module !== 'undefined') module.exports = {...}`, and the browser reads `window.ChatterTabs`.

## Review Focus

1. Portrait phone (375×812): a 16:9 image under `object-fit: cover` hides most of the scene. Expect the main character to be visible in every panel and the card never over a face. Tested by the Task 6 screenshots.
2. Deep link `index.html#venues` on a fresh load: the venues tab is open and the tabs section is in view, not the hero. Tested by `tabFromHash` units and a Task 6 screenshot.
3. Unknown hash (`#contact`, `#p3`, `#nonsense`): the tabs fall back to "people", nothing throws, and `#contact` still scrolls to the footer. Unit test in Task 4.
4. Reduced motion: panels and cards are fully visible with no transition, so no content stays at opacity 0. Test in Task 3 (CSS contains a reduced-motion block that sets `.reveal` visible).
5. JS disabled or failed: all content is still visible and the first tab panel shows. Elements are visible by default, and JS only adds `.js` to `<html>`, which enables the hidden-before-reveal styles. Tested in Task 3.

---

## File map

```
website/
  index.html          markup for every section
  css/site.css        tokens, layout, hero, legend, tabs, footer
  js/tabs.js          tab logic (pure hash fn + DOM wiring), UMD-style export
  js/main.js          .js flag, IntersectionObserver reveals, header state
  img/                *.webp scenes (2 widths), logo.png, favicon
  tests/site.test.cjs node:test checks on html, assets, budget
  tests/tabs.test.cjs node:test unit tests for tabs.js
  tests/shoot.sh      headless Chromium screenshots → website/tests/shots/ (gitignored)
  README.md           how to open, test and deploy (Caddy root)
```

---

### Task 1: Image assets  *(Haiku)*

**Files:** Create `website/img/*`, `website/tests/site.test.cjs` (asset section), `website/.gitignore` (`tests/shots/`).

**Produces:** `img/<name>-1920.webp` and `img/<name>-960.webp` for all 9 scenes in `assets/chatterbox-web-assets/*.png` (same base names), plus `img/logo.png` (256px) and `img/favicon.png` (64px) from `assets/LogoTransparent.png`.

- [ ] **Step 1: Write the failing test** in `tests/site.test.cjs`: `test('every scene has 1920 and 960 webp')` loops over the 9 base names and asserts both files exist. `test('image budget')` asserts each `-1920.webp` is under 350 KB, each `-960.webp` under 120 KB, and `logo.png` under 40 KB.
- [ ] **Step 2: Run** `node --test website/tests/` and confirm it fails (files missing).
- [ ] **Step 3: Convert** with `magick <src> -resize 1920x -quality 72 img/<name>-1920.webp` (and `960x`, quality 70). Logo: `magick ... -resize 256x256` and `64x64`. Lower the quality if a budget fails.
- [ ] **Step 4: Run** the tests again and confirm they pass.
- [ ] **Step 5: Commit** "Landing page: web-sized scene images and logo".

### Task 2: Page skeleton, tokens, header and the six hero panels  *(Sonnet)*

**Files:** Create `website/index.html` and `website/css/site.css`, and extend `tests/site.test.cjs`.

**Produces:**
- Sections in order: `header.site-header`, `main` > `section.story` with 6 × `article.panel#p1..#p6`, `section#legend`, `section#how` (tabs, filled in Task 4), and `footer#contact`.
- Each panel: `<article class="panel panel--{pos}" id="pN">` containing `<picture>` (srcset 960w/1920w, `sizes="100vw"`, `alt` text describing the scene), then `<div class="card reveal"><h2>` headline `</h2><p>` line `</p></div>`. `{pos}` is one of `bl tr tl br tc`.
- CSS custom properties on `:root`: `--ink #2e2a3a`, `--paper #fffaf2`, `--cream #fdf6ec`, `--mint #cdeedd`, `--lilac #e4dcf7`, `--peach #fde0cc`, `--butter #fbefb8`, `--sky #d4e8fa`, `--go #3f9d5d`, `--free #e5b52a`, `--stop #e0605a`.

Panel content (copy exact):

| id | image | pos | headline | line |
|---|---|---|---|---|
| p1 | lonely_chatter_park | bl | A city full of people. | Chatter still eats lunch alone. |
| p2 | chatter_lonely_cafe | tr | Wanting to talk is easy. | Knowing who else does is the hard part. So nobody walks over. |
| p3 | chatter_cafe_hope | tl | What if the table told you? | A small light on each table: green means "come sit, I'm open to talk." |
| p4 | chatter_hope_study | br | Just pull up a chair. | Check the kiosk map, find a green table, walk over. No awkward guessing. |
| p5 | chatter_happy_cafe | tr | The first minute, handled. | An icebreaker gets you talking. Hit it off? Both say yes before socials are shared. |
| p6 | chatter_happy2_cafe | tc | Strangers become regulars. | Venues host meetups, and a café becomes your third place. |

Panel 1 also carries an `<h1>` above its card: "Chatterbox", with the subline "A light on the table that says: come say hi." Add a scroll hint ("Scroll the story ↓", text, not an emoji). Header: logo + "Chatterbox" on the left; links "For people", "For venues", "How we built it" (to `#people`, `#venues`, `#built`) and a "Contact us" button on the right. Collapse the links on screens under 640px so only the logo and Contact us remain.

Layout rules:
- Landscape or wide (`min-aspect-ratio: 1/1`): each panel is `100svh` and the image covers it. The card is absolutely placed by `{pos}` with a 24–48px inset, and the top inset clears the 56px header. `max-width: min(420px, 40vw)`.
- Portrait: the image area is `68svh` with `object-fit: cover` and a per-panel `object-position` set by `--focus-x` on the panel (start at p1 72%, p2 32%, p3 30%, p4 40%, p5 50%, p6 50%; Task 6 tunes them). The card sits below, overlapping the image's bottom edge by 32px, and is full width minus the 16px gutters.
- `.story` uses `scroll-snap-type: y proximity` on `html`, and panels use `scroll-snap-align: start`.

- [ ] **Step 1: Write failing tests:** `test('six panels in story order')` parses `index.html` with regexes, asserts ids p1–p6 appear in order, and that each panel's `<h2>` equals the table headline. `test('no tags on cards')` asserts no `class="tag"` exists. `test('every img has non-empty alt')`. `test('positions alternate')` asserts no two consecutive panels share a `panel--` position class. `test('only google fonts external')` asserts every `http(s)://` in `href`/`src` matches `fonts.(googleapis|gstatic).com`. `test('name')` asserts the html never contains "FirstPlace" or "Third Place" (case-insensitive).
- [ ] **Step 2: Run** `node --test website/tests/` and confirm the new tests fail.
- [ ] **Step 3: Build** `index.html` and `site.css` to the rules above.
- [ ] **Step 4: Run** the tests and confirm they pass. Open the page through `website/tests/shoot.sh` (Task 6 creates it; until then run `chrome-headless-shell --screenshot` by hand at 1440×900 and 375×812) and look at p1.
- [ ] **Step 5: Commit** "Landing page: hero story panels and header".

### Task 3: Motion and header state  *(Sonnet)*

**Files:** Create `website/js/main.js`. Modify `site.css` and `index.html` (`<script defer src="js/main.js">`).

**Produces:** `main.js` adds `js` to `document.documentElement.classList`. An IntersectionObserver (threshold 0.35) adds `.is-in` to `.reveal` elements and to `.panel`. Header gets `.is-solid` once `#p6` has scrolled past (observer on `#legend`).

CSS: `.js .reveal { opacity:0; transform: translateY(16px) }` and `.reveal.is-in { opacity:1; transform:none; transition: 500ms ease 150ms }`. The panel image scales from 1.06 to 1 on `.is-in` (700ms). `@media (prefers-reduced-motion: reduce)` sets every `.reveal` to `opacity:1; transform:none; transition:none` and removes the image scale.

- [ ] **Step 1: Write failing tests:** `test('content visible without js')` asserts `site.css` has no rule hiding `.reveal` unless it is prefixed by `.js`. `test('reduced motion block')` asserts `site.css` contains `prefers-reduced-motion: reduce` and that block mentions `.reveal`. `test('scripts are classic defer')` asserts every `<script` has `defer` and no `type="module"`.
- [ ] **Step 2: Run** the tests and confirm they fail.
- [ ] **Step 3: Implement** `main.js` and the CSS.
- [ ] **Step 4: Run** the tests and confirm they pass.
- [ ] **Step 5: Commit** "Landing page: scroll reveals and header state".

### Task 4: Light legend, tabs and footer  *(Sonnet)*

**Files:** Create `website/js/tabs.js` and `website/tests/tabs.test.cjs`. Modify `index.html` and `site.css`.

**Interfaces / Produces:**
- `tabFromHash(hash: string): 'people' | 'venues' | 'built' | null`. It returns the id for `#people`, `#venues` and `#built` (case-insensitive, leading `#` optional), and `null` for anything else.
- `initTabs(root: HTMLElement): void` wires `[role=tab]` buttons. On load it calls `tabFromHash(location.hash)`. If that gives an id, it selects that tab and calls `root.scrollIntoView()`. Otherwise it selects `people` without scrolling. A click selects the tab and calls `history.replaceState(null, '', '#' + id)`. Left/Right/Home/End move focus and selection. It listens to `hashchange` so header links work.
- Export: `if (typeof window !== 'undefined') window.ChatterTabs = {...}` and `if (typeof module !== 'undefined') module.exports = {...}`; nothing touches the DOM at load time, so Node can `require` it. `main.js` calls `ChatterTabs.initTabs(document.getElementById('how'))`.

Markup:
- `#legend`: three paper chips with a coloured dot and text. "Say hi": someone's here and open to talk, walk over and join. "Free table": nobody's claimed it, claim it to start your own. "Not now": taken, or not available. Use a heading such as "What the lights mean".
- `#how`: `div[role=tablist]` with three `button[role=tab]` (`id="tab-people"` etc., `aria-controls`, `aria-selected`) and three `div[role=tabpanel]` (`id="people"`, `"venues"`, `"built"`, `aria-labelledby`). The first panel is visible with no JS, the others use `hidden`. Folder-tab styling: paper, with the selected tab joined to its panel.
  - **people** (banner `chatter_lonely_park`): numbered steps from the spec, in order. 1 Scan in at the kiosk. 2 See the floor map of tables. 3 Find a green table to join, or claim a yellow one to start your own. 4 Walk over and say hi. 5 Stuck for words? A Gemini icebreaker gets you going. 6 After the chat, rate it; if you both want to meet again, you swap socials. Report or block is always one tap away.
  - **venues** (banner `chatter_study_happy`): "What you get": a kiosk with a live floor map, a light box on each table, events for groups, a dashboard with totals only, never who. "How to join": Contact us → we set up the boxes → place your tables on the floor map → set your hours (lights switch off after 10pm). End with a "Contact us" button to `#contact`.
  - **built**: banner `chatter_study_alone`, the diagram (Task 5) and the privacy promises list.
- `footer#contact`: logo, "Chatterbox · Made in Calgary", the heading "Contact us", and the note "We're setting up venue sign-ups. Check back soon."

- [ ] **Step 1: Write failing tests** in `tabs.test.cjs`: `tabFromHash('#venues') === 'venues'`, `tabFromHash('BUILT') === 'built'`, `tabFromHash('#contact') === null`, `tabFromHash('#p3') === null`, `tabFromHash('') === null`, `tabFromHash(undefined) === null`. In `site.test.cjs`: `test('tabs a11y')` asserts 3 `role="tab"`, 3 `role="tabpanel"`, and exactly two panels carrying `hidden`. `test('legend copy')` asserts the html contains "Say hi", "Free table" and "Not now". `test('contact')` asserts `id="contact"` exists and every "Contact us" link has `href="#contact"`.
- [ ] **Step 2: Run** `node --test website/tests/` and confirm they fail.
- [ ] **Step 3: Implement** to the interfaces above.
- [ ] **Step 4: Run** the tests and confirm they pass.
- [ ] **Step 5: Commit** "Landing page: light legend, tabs and contact footer".

### Task 5: "How we built it" diagram and stack  *(Sonnet)*

**Files:** Modify `index.html` (inside `#built`) and `site.css`.

**Produces:** an inline SVG (`role="img"`, `<title>` + `<desc>`) in the paper style: ink 3px strokes, rounded boxes in pastel fills, hand-drawn feel through slight rounding (no filters). Nodes: "Phone app (Expo)", "Kiosk", "API (Hono on Node)", "Database (Tiger Data)", "Gemini + Calgary open data", "Table box (ESP32)". Edges: phone → API, kiosk → API, API ↔ database, API → Gemini, box → API labelled "every 2s: what colour?" and API → box labelled "just a colour". On narrow screens, stack it vertically (two SVGs toggled by media query, or a viewBox that reads at 360px).

Then add a stack list (Expo / React Native, Expo Router, Hono on Node 22, Tiger Data (Postgres + TimescaleDB), Auth0, Gemini grounded in Calgary open data, ESP32 table box, Vultr + Caddy) and the privacy list: the box only ever learns a colour; a decline looks exactly like "not available"; venues see totals, never people; blocked users never see each other.

- [ ] **Step 1: Write failing test** `test('diagram')`: `#built` contains an `<svg` with `role="img"` and a `<title>`, and the html contains "Tiger Data", "Auth0", "ESP32" and "just a colour".
- [ ] **Step 2: Run** the test and confirm it fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and confirm they pass.
- [ ] **Step 5: Commit** "Landing page: how-we-built-it diagram and stack".

### Task 6: Visual pass, crops and README  *(Sonnet)*

**Files:** Create `website/tests/shoot.sh` and `website/README.md`. Tune `--focus-x` and the card positions in `site.css` / `index.html`.

**Produces:** `shoot.sh` runs `~/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell --headless --hide-scrollbars --screenshot=<out> --window-size=<w>,<h> "file://$PWD/website/index.html#<anchor>"` for widths 375×812 and 1440×900, and anchors p1–p6, legend, venues, built, contact. Output goes to `website/tests/shots/<w>-<anchor>.png`. Anchors scroll the page on load.

- [ ] **Step 1: Run** `bash website/tests/shoot.sh` and **look at every shot**. For each, check: main character visible; card not over any face; card clear of the header; no sideways overflow (also assert `document.documentElement.scrollWidth <= innerWidth` with `--dump-dom` plus a tiny inline check, or by eye); `#venues` shows the venues tab open.
- [ ] **Step 2: Fix** crops and positions until every shot passes, then re-run.
- [ ] **Step 3: Budget:** `du -cb website/index.html website/css website/js website/img/*-1920.webp website/img/logo.png | tail -1` is under 3 000 000.
- [ ] **Step 4: README:** open `website/index.html` directly or `python3 -m http.server -d website`; run tests with `node --test website/tests/`; deploy by pointing Caddy's root `file_server` at `website/`.
- [ ] **Step 5: Run** `node --test website/tests/` (all pass), then commit "Landing page: visual pass, crops, README".
