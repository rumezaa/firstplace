# Chatterbox landing page: design spec

**Date:** 2026-11-08 · **Status:** design approved, not built yet
**Folder:** `website/` (separate from the app; not part of the Expo project)

## Why it exists

A public front page for **Chatterbox**, the product. It is *not* the app and shows no app screens as UI. Right now the audience is a hackathon judge. They should leave feeling that community matters, that this is something real people would use, and that they could take part (as a person or as a venue).

Design for human attention: one idea per screen, short lines, the "what is this" answered on the first screen, a clear payoff at the end, and no walls of text.

## Goals

- Tell the problem → idea → hello → community story in six illustrated panels.
- Explain how to use it as a person, how to bring it to a venue, and how it was built.
- Look like a fun, pastel, hand-drawn picture book that matches the art.

**Non-goals:** sign-up, login, a working contact form, live data, app screenshots, an app store link.
**Anti-goals:** generic "AI landing page" look (gradient blobs, glowing buttons, emoji icons, centred walls of text, uppercase eyebrow labels); heavy JS frameworks; anything that janks on a phone.

## Constraints

- Plain HTML, CSS and vanilla JS, no build step. It deploys as static files (TECH_STACK.md plans Caddy on Vultr to serve the landing page from the root domain).
- Works at phone width (360px) with a 16px side gutter and no sideways scroll. Respects `prefers-reduced-motion`.
- Images come from `assets/chatterbox-web-assets/` and `assets/LogoTransparent.png`. Copy them into `website/` as web-sized versions (about 2000px wide max for the hero, compressed). The originals are 2752×1536 PNGs at about 3 MB each and must not ship as-is.
- The name is **Chatterbox**. The repo and older docs say "FirstPlace" or "Third Place"; the site uses Chatterbox only.
- The light colours green / yellow / red are used only to mean the table light, as in the app.

## The hero story (agreed)

Six full-screen panels. Each image is the full background (`object-fit: cover`). On top sits a **paper card**: cream (#fffaf2) fill, about 3px dark ink outline (#2e2a3a), about 20px radius, and a hard offset shadow (6px 6px 0 ink), so it matches the outlined art. Each card has a **headline and one short line. No tags.** The card's position **changes from panel to panel** (for example bottom-left → top-right → bottom-right → top-left → bottom-left → centre-bottom) and never covers the characters' faces.

| # | Image | Headline | Line |
|---|---|---|---|
| 1 | `lonely_chatter_park` | A city full of people. | Chatter still eats lunch alone. |
| 2 | `chatter_lonely_cafe` | Wanting to talk is easy. | Knowing who else does is the hard part. So nobody walks over. |
| 3 | `chatter_cafe_hope` | What if the table told you? | A small light on each table: green means "come sit, I'm open to talk." |
| 4 | `chatter_hope_study` | Just pull up a chair. | Check the kiosk map, find a green table, walk over. No awkward guessing. |
| 5 | `chatter_happy_cafe` | The first minute, handled. | An icebreaker gets you talking. Hit it off? Both say yes before socials are shared. |
| 6 | `chatter_happy2_cafe` | Strangers become regulars. | Venues host meetups, and a café becomes your third place. |

Panel 1 must say what Chatterbox is without scrolling: a fixed small header with the logo and the name "Chatterbox", plus a scroll hint.

**Scroll behaviour (builder's call, within these rules):** each panel fills the viewport. Moving between panels feels like turning pages in a picture book: a crossfade or gentle parallax, with the card easing in slightly after the image. Use CSS scroll-snap and/or IntersectionObserver only, no scroll-jacking. With reduced motion, panels simply stack.

The earlier mockup had a loneliness statistic on panel 1. It was a placeholder and is **dropped**. Add one only if a real, citable Canadian/Calgary source is linked.

## Below the story

1. **Light legend:** one compact, friendly key: green = "Say hi" (someone's here and open to talk, walk over and join), yellow = "Free table" (nobody's claimed it yet, claim it to start your own table), red = "Not now" (taken, or not available). *(Decided by the owner: follows PROJECT_CONCEPT.md. The app's LightPicker copy for yellow currently says "ask to join" and is out of date; that is not part of this work.)*
2. **Three tabs**, styled as paper-card folder tabs. They must be accessible: `role="tablist"`, arrow-key navigation, and the right tab opens from a URL hash (`#people`, `#venues`, `#built`).
   - **For people** (image: `chatter_lonely_park`): scan in at the kiosk → see the floor map of tables → find a green table to join, or claim a yellow (free) table to start your own → walk over and say hi → Gemini icebreaker → after the chat, rate it; if both want to meet again, socials are exchanged; report/block is always one tap away. Written as numbered steps.
   - **For venues** (image: `chatter_study_happy`): what a venue gets (front-door kiosk with live floor map, a light box on each table, events for groups, a dashboard that shows totals only, never who) and how to join (contact us → we set up the boxes → place tables on your floor map → set hours; lights switch off after 10pm). Ends with a **Contact us** button.
   - **How we built it** (image: `chatter_study_alone`): a small hand-drawn-style SVG diagram (phone app + kiosk → API → database; ESP32 box polls the API every 2s and gets back only a colour). Stack list: Expo / React Native, Expo Router, Hono on Node, Tiger Data (Postgres + TimescaleDB), Auth0, Gemini grounded in Calgary open data, ESP32 table box, Vultr + Caddy. Privacy promises: the box only ever learns a colour; a decline looks exactly like "not available"; venues see totals, never people; blocked users never see each other.
3. **Footer:** logo, "Chatterbox · Made in Calgary", Contact us.

**Contact us** is a button or link that goes nowhere yet (`href="#contact"`, with a short "coming soon" note). No form submission.

## Look

- Pastel palette taken from the art: cream paper, mint, lilac, peach, butter yellow, sky blue, with dark ink (#2e2a3a) for text and outlines. Text contrast ≥ 4.5:1.
- Rounded, friendly display font for headlines (Fredoka or similar from Google Fonts); system or a clean sans for body text.
- Outlined "paper" components everywhere (cards, tabs, buttons) for consistency with the hero card. Hard offset shadows, no soft blur stacks.
- The character sheet images (`characters/*.png`) have white backgrounds. Use them only where white suits (inside cream cards), or leave them out.

## Settled after review (my calls)

- **Contact us:** every Contact us link goes to `#contact`, which is the footer. The footer holds a short note: "We're setting up venue sign-ups. Check back soon." No modal.
- **Tab hashes:** loading with `#people` / `#venues` / `#built` opens that tab and scrolls to the tabs section, skipping the hero. Clicking a tab updates the hash with `history.replaceState`, so the Back button doesn't step through tabs.
- **How we built it tab:** shows both the image (as a short banner at the top of the tab) and the SVG diagram below it.
- **Header:** stays fixed on the whole page. It is small (about 56px), with a cream paper background once you've scrolled past the hero. Hero cards keep clear of it with a top safe margin.
- **Phone crops:** tune `object-position` per panel so the main characters stay in frame at 375px portrait. On narrow screens the card may sit at the top or bottom edge, but never over a face. Check every panel by screenshot.
- **Light meanings:** set by the owner, see the legend above.

## Left to the builder

The exact animation, file structure inside `website/`, image sizes and format (WebP with JPEG fallback is fine), the tab layout on desktop vs phone, the diagram's drawing, and the final wording of tab copy (short, plain, kind).

## Done means

- `website/index.html` opens straight from disk and from a static server, with no console errors.
- Looked at by screenshot at 375px and 1440px wide: no sideways scroll, cards never cover faces, everything readable.
- Total page weight under about 3 MB.
