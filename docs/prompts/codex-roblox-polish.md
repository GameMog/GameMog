# Codex brief: give GameMog Roblox's polish

You are working in `~/Desktop/GameMog`. Read this whole brief before changing anything. Every
number below was measured on roblox.com on 23 Sep 2026 at 1440x900 and 375x812, so you do not
need network access to match it.

## 1. What GameMog is

GameMog is an AI-native games network: "the internet, playable". Someone types a prompt, Claude
writes a 3D world on the GameMog Runtime (`lib/runtime/v1.js`), the world is playtested in real
Chrome, and it is published. Anyone can **Mog** a game: challenge it with a better variation,
which becomes a new game in the same family. Players pick winners in head-to-head Mog-offs.
The site's job is to make that catalogue feel like a place people want to be, the way Roblox does.

- Stack: Next.js 15 (app router), TypeScript, React, `node:sqlite` (`data/gamemog.db`), no CSS
  framework (`app/globals.css`).
- Run: `npm run dev` serves http://localhost:3939. The first request after an edit recompiles
  that route and can take 60 to 100 seconds, so use generous timeouts.
- Checks, all of which must pass when you finish:
  - `npx tsc --noEmit -p .`
  - `npm run check` (includes the design contract in `scripts/design-check.ts`)
  - `npm run check:runtime` (real Chrome, needs the dev server)
  - `npm run check:platform` (Mog end to end, needs the dev server)
- Real Chrome: `lib/browser.ts` exports `withBrowser(fn, { width, height })`, which drives
  headless Chrome over DevTools. Headless Chrome's window includes 87px of browser chrome, so
  pass `height: viewportHeight + 87`, and it will not go narrower than 500px.
- The rules of play live in `docs/RULES.md`. Mog is described in the README.

## 2. The goal

The homepage, game pages and header should look and behave like roblox.com's Charts and
experience pages: the same density, rhythm, type scale, controls and metadata. The branding
stays GameMog's. Right now the pages copy Roblox's colours and radii but not its magic.

**What the magic actually is (priority order):**

1. **Key art.** Every Roblox thumbnail is designed art, not a screenshot: a character close up,
   usually facing the camera, huge bold title lettering with a thick outline, and saturated
   colour. GameMog's 3D worlds use a playtest screenshot taken from behind the runner, with
   small figures and no title. This is the largest gap.
2. **Density and rhythm.** Roblox shows 8½ square tiles per row at 1440px, each with a name
   and two numbers. The eye scans dozens of choices per screen.
3. **Type.** Roblox uses its own typeface, Builder Sans, at weights 400 to 800. GameMog uses
   Helvetica Neue, which is only Roblox's fallback, so everything reads generic.
4. **Controls.** Roblox uses dark pill filters, arrows in the rail gutters, a 300x68 Play
   button, and a stats strip between two rules. These are small things that add up.

## 3. Roblox, measured

### Page and header (desktop)

| Element | Measurement |
|---|---|
| Page background | Charts `#FFFFFF`. GameMog's contract requires `#F7F7F8`; keep ours. |
| Body text | 16px, colour `#202227` |
| Header | 40px tall, fixed, background `#F7F7F8`, 1px bottom border `#FFFFFF`, no shadow |
| Header search | 360x28, background `rgba(27,37,75,.08)`, border `1px solid rgba(27,37,75,.12)`, radius 8px, 16px text |
| Primary header button (Sign Up) | 30px tall, padding 6px 9px, `#335FFF`, text `#F7F7F8`, 16px/500, radius 8px |
| Secondary header button (Log In) | 30px tall, transparent, `1px solid #494D5A`, text `#6A6F81`, radius 8px |
| Page title (h1 "Charts") | 32px/800, line-height 44.8px |
| Filter pills | 32px tall, background `#272930`, text white 16px/700, radius 999px, padding 9px, trailing chevron |
| Rail heading (h2) | 20px/700, line-height 28px, followed by an ⓘ info icon |
| Rail caption (under some headings) | 14px/400, `#494D5A`, e.g. "Results for all devices and locations" |
| "See All →" | 16px/500, `#393B3D`, right-aligned on the heading row |

### Tiles and rails (desktop)

| Element | Measurement |
|---|---|
| Thumbnail | **150x150 square**, radius 8px, overflow hidden, placeholder `rgba(27,37,75,.12)` |
| Tile gap | 14px |
| Whole tile | 150x240 |
| Name | 16px/700, line-height 22.4px, margin-top 6px, up to two lines |
| Stats row | 12px/500, line-height 18px, `#494D5A`: thumbs-up icon + "98%", then person icon + "150.9K" |
| Rail arrows | chevrons centred in a 30px gutter at each end of the rail (tiles start 30px inside the content edge); no circle and no shadow |
| Hover | none on Charts tiles |

### Phone (375px)

| Element | Measurement |
|---|---|
| Header | 74px in two rows: logo, primary buttons and search icon on top; nav links spread across the second row |
| h1 | 24px |
| Rail heading | 16px |
| Tiles | about 88px squares, about 3½ visible, swipe only (no arrows) |
| Filter pills | same dark pills, full size |

### Experience page (desktop)

| Element | Measurement |
|---|---|
| Content column | 970px, centred |
| Media | 640x360 carousel with 48px circular arrows (`#F7F7F8`) at the left and right edges |
| Title | h1 32px/800, line-height 44.8px, beside the media |
| Byline | "By <creator>" 16px, then a small maturity line |
| Play | **300x68**, `#335FFF`, radius 8px, play glyph only |
| Under Play | Favorite, thumbs up with count, a thin vote bar, thumbs down with count |
| Tabs | About / Store / Servers, 40px tall, 16px, full column width, active tab underlined |
| Section heading | "Description" 20px/700 |
| Stats strip | full column width between two 1px rules `#BCBEC8`, padding 12px 0, equal centred columns, label 12px/500 `#494D5A` over value 12px/400 `#202227`: Active, Favorites, Visits, Voice Chat, Camera, Updated, Server Size, Genre, Subgenre |
| Below | "People Also Join" rail of standard tiles |

## 4. Where GameMog is now

- `app/page.tsx`: a full-width billboard for LA Olympics 2028 playing a real gameplay film
  (`app/hero-film.tsx`, made by `npm run media:hero`), with Play and Mog it buttons, then rails
  of **264px 16:9 tiles** (`app/tile.tsx`). **Keep the billboard exactly as it is.** The owner
  asked for it. It sits above the Roblox-style rails.
- Tiles are 16:9 only because the 3D covers are 16:9 screenshots. Once key art exists (task A),
  go back to Roblox's exact 150x150 squares.
- 22 of the 26 published games are the older 2D race format. Their covers are drawn server-side
  in `app/cover.tsx` (SVG, title lettering included). They already read as key art but all use
  one template. 4 games are 3D worlds or custom games, and their cover is a JPEG screenshot from
  the playtest (`gameCover()` in `lib/db.ts`, served by `app/g/[slug]/cover/route.ts`).
- Header and footer: `app/header.tsx`. Game pages: `app/g/[slug]/custom-page.tsx` (worlds) and
  `app/g/[slug]/page.tsx` (race). Rails: `app/rail.tsx`. Mog panels: `app/g/[slug]/mog.tsx`.
- Body font: `'Helvetica Neue', Helvetica, Arial` in `app/globals.css`.

## 5. The work, in order

Commit after each task. Small commits, each passing `npm run check`.

### A. Key art for every 3D world (the most important task)

Build `scripts/media/key-art.ts` (`npm run media:art [-- <slug>]`, all worlds when no slug is
given), modelled on `scripts/media/record-hero.ts`. For each game with format `world`:

1. Open `/g/<slug>/play`, start the race, turn on autopilot and invincibility, and fast-forward
   (`debug.timeScale(6)`) to lap 3 so rivals are nearby. Then return to real time.
2. Frame a **front three-quarter hero shot of the player's character**, facing the camera, with
   a rival behind. `debug.film()` in `lib/runtime/v1.js` currently only places the camera behind
   the runner. Extend it: a `target: 'player'` option that looks at the character and allows a
   negative `distance` (camera ahead of the runner). It stays recording-only and marks the run
   `assisted`. Do not change the play camera.
3. Hide the HUD (`debug.cinematic(true)`). Add a temporary overlay in the page with the world's
   title set big: the theme's font, a thick outline in the theme's `ink`, fill in `accent`,
   `paint-order: stroke`. This is the style the runtime's title card already uses. The title
   should fill most of the width, as on Roblox thumbnails. Then screenshot the viewport.
4. Write `public/media/art/<slug>-icon.jpg` (512x512, square, for tiles) and
   `public/media/art/<slug>-wide.jpg` (1280x720, for the game page and sharing). Use JPEG
   quality around 85.
5. Serve them: `app/g/[slug]/cover/route.ts` returns the key art when it exists
   (`?shape=square` for the icon, wide by default), falling back to the playtest screenshot.
6. **Make it automatic for every new world.** In `lib/playtest-runtime.ts` the playtest already
   takes a cover screenshot. Take the key-art shots in the same browser session and store them
   with the draft, so every world Claude writes gets key art without anyone running a script.
   This is platform work: it matters more than any single page.

Acceptance: a contact sheet of every world's icon at 150px looks like a row of Roblox
thumbnails. You can see a face, the title reads at a glance, and nothing is a dark, empty track.

### B. Tiles and rails, exactly as Roblox

- Tiles back to **150x150 squares**, using the icon from A for worlds and `Cover` (square) for
  race games. Name 16/700/22.4 over two lines, margin-top 6px. Stats row 12/500 `#494D5A` with
  like % (when there are votes) and plays, formatted 1.2K / 3.4M (`short()` in `app/tile.tsx`).
  Keep the Mog count and the MOG / NEW / FLAGSHIP badges.
- Rails: 14px gap, a 30px arrow gutter at each end with plain chevrons (no circle), and arrows
  only on the side that has more to show.
- Update the design contract's tile assertion in `scripts/design-check.ts` to 150x150 again,
  with a one-line reason.

### C. Type

Replace Helvetica Neue with a self-hosted open-licence (SIL OFL) typeface close to Builder Sans:
geometric, large x-height, weights 400 to 800. Use **Figtree** via `npm install
@fontsource-variable/figtree` (the owner approves this one dependency). Import it in
`app/layout.tsx`; do not fetch from Google Fonts (the contract forbids it). Keep Roblox's type
scale from section 3. Inter, Geist and Space Grotesk are banned. Never copy Builder Sans files.

### D. Header

- Desktop: 40px, fixed, measurements from section 3. Nav: Charts, Create, Library, and Mogs
  (linking to the "New Mogs" chart from task E; there is no Mogs page yet, so build that first).
  Search 360x28. The right-hand button is "Create a world", with Roblox's primary button spec.
- Phone: Roblox's two-row 74px header, with the nav links as the second row.
- Remove nav items that do nothing. Currently "Obstacle" and "Survival" are greyed-out and inert.

### E. Homepage below the billboard

- Real filter pills in Roblox's dark style that actually filter: Format (All / 3D worlds /
  Classic) and Genre (from each game's `meta.genre`). Nothing inert.
- Rails, in Roblox's naming style, each shown only when it has at least 6 distinct games:
  "Top Trending" (plays), "Up-and-Coming" (newest), "Top Rated" (like %), "Most Mogged" (Mog
  count), "New Mogs" (games with a parent), "3D Worlds". Each has an ⓘ with a one-line
  explanation and a caption where Roblox would have one.
- "See All" goes to a real sorted grid (for example `/charts/<sort>`), not to an anchor.

### F. Game page, Roblox's experience layout

Apply section 3's experience-page measurements to `custom-page.tsx` and the race `page.tsx`:
the 970px column, a 640x360 media area (keep the live game frame as the first slide, then the
hero film if one exists, then the key art, with 48px round arrows), h1 32/800, and a Play button
of exactly 300x68. Put a stats strip between two `#BCBEC8` rules, with centred columns: Plays,
Players, Likes, Mogs, Generation, Created, Updated, Genre, Rivals. Keep every Mog element (the
Mog button, lineage, Mog-off panel, Mogs tab); they are the product. Tabs are 40px tall. The
"Recommended" rail becomes "Players Also Play" with standard tiles.

### G. Footer, empty states, phone pass

- Footer: a Roblox-style row of links, then fine print. Only link pages that exist.
- Every rail, grid and tab has a real empty state; no blank boxes.
- A full pass at 375px and 1440px against section 3. Tiles on phones are about 88px.

## 6. Rules you must not break

- **No Roblox brand assets.** Match layout, metrics and behaviour only. No Roblox logo, name,
  wordmark, Builder Sans files, icons, images or copy. GameMog must never look like it claims
  to be Roblox. LA Olympics must not use the Olympic rings or the LA28 logo.
- **The design contract** (`scripts/design-check.ts`) was the owner's brief. It bans drop shadows,
  gradients in the interface (drawn art and generated images are exempt), frosted glass, CSS
  transitions and animations, emoji, em dashes, purple, fully saturated neon colours, and radii
  between 9px and a full pill. It requires the page background `#F7F7F8`. Stay inside it. Where
  a task above changes a measured rule, update the assertion and give the reason in a comment.
  Never weaken a rule just to make a check pass.
- **Honest numbers.** Show the real plays, likes and Mogs. Never inflate, seed or fake counts
  or badges.
- **Do not change** the rules of play (`RULES` in `lib/runtime/v1.js`, `docs/RULES.md`), the Mog
  logic or API semantics, or any rows in `data/gamemog.db`. Do not delete, hide or re-feature
  any game; if you think a game should move, say so in your report.
- **Secrets.** `.env.local` holds a real API key. Never print it, read it into output, or commit
  it.
- **Downloads.** The only new dependency allowed is `@fontsource-variable/figtree`. Do not add
  other packages, fonts, images or third-party assets without asking.
- **Commits.** There is no global git identity. Commit with
  `git -c user.name='sheed' -c user.email='65737256+whyagents@users.noreply.github.com' commit ...`. Do not push.
- The Mac may sleep when idle. Run long Chrome jobs under `caffeinate -i`.

## 7. How to verify

1. Run all four checks from section 1.
2. Screenshot these pages in real Chrome through `lib/browser.ts` at 1440x900 and at phone
   width: `/`, `/g/la-olympics-2028`, `/g/pepe-s-thunderbog-dash`, `/g/muse-sprint`, `/create`
   and `/mog/la-olympics-2028`. For true 375px, add an `emulate({ width, height, mobile })`
   method to the `Page` type in `lib/browser.ts` using DevTools'
   `Emulation.setDeviceMetricsOverride`.
3. Compare each screenshot against section 3, line by line. Fix any difference over 2px, or any
   wrong weight or colour.
4. Build a contact sheet of all tiles at 150px and look at it. If any tile looks like a
   screenshot rather than key art, task A is not done.

## 8. Report back

- What changed, per task, with the commit hashes.
- The screenshots from section 7, before and after.
- Anything you could not match and why.
- Decisions for the owner. For example: whether the 22 classic 2D games should stay on the
  homepage, given the owner's rule that new games are 3D only.
