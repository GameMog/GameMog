You are working in the GameMog repository at /Users/sheed/Desktop/GameMog. Run every command from that directory (cd /Users/sheed/Desktop/GameMog). Read this whole brief before changing anything. Every measurement below was taken on roblox.com on 23 Sep 2026 at 1440x900 and 375x812, so you do not need network access to match it.

=== 1. WHAT GAMEMOG IS ===

GameMog is an AI-native games network: "the internet, playable". Someone types a prompt, Claude writes a 3D world on the GameMog Runtime, the world is playtested in real Chrome, and it is published. Anyone can "Mog" a game: challenge it with a better variation, which becomes a new game in the same family. Players pick winners in head-to-head Mog-offs. The site's job is to make that catalogue feel like a place people want to be, the way Roblox does.

Stack: Next.js 15 (app router), TypeScript, React, node:sqlite. No CSS framework.

Where things are:
- Repo root: /Users/sheed/Desktop/GameMog
- Homepage: /Users/sheed/Desktop/GameMog/app/page.tsx
- Classic page (all 22 Classic races): /Users/sheed/Desktop/GameMog/app/classic/page.tsx
- Homepage film player: /Users/sheed/Desktop/GameMog/app/hero-film.tsx
- Film files: /Users/sheed/Desktop/GameMog/public/media/la-olympics-2028-wide.mp4, -wide.jpg, -4x3.mp4, -4x3.jpg
- Film recorder: /Users/sheed/Desktop/GameMog/scripts/media/record-hero.ts (npm run media:hero -- <slug>)
- Tile: /Users/sheed/Desktop/GameMog/app/tile.tsx
- Rail (horizontal shelf with arrows): /Users/sheed/Desktop/GameMog/app/rail.tsx
- Drawn covers for Classic games (SVG): /Users/sheed/Desktop/GameMog/app/cover.tsx
- Header, footer and icons: /Users/sheed/Desktop/GameMog/app/header.tsx
- Styles: /Users/sheed/Desktop/GameMog/app/globals.css
- Root layout: /Users/sheed/Desktop/GameMog/app/layout.tsx
- World game page: /Users/sheed/Desktop/GameMog/app/g/[slug]/custom-page.tsx
- Classic game page: /Users/sheed/Desktop/GameMog/app/g/[slug]/page.tsx
- Mog panels (lineage, Mog-off, Mogs tab): /Users/sheed/Desktop/GameMog/app/g/[slug]/mog.tsx and mog-off.tsx
- Play frame: /Users/sheed/Desktop/GameMog/app/g/[slug]/play-frame.tsx
- Cover image route: /Users/sheed/Desktop/GameMog/app/g/[slug]/cover/route.ts
- Mog composer page: /Users/sheed/Desktop/GameMog/app/mog/[slug]/page.tsx
- Create page: /Users/sheed/Desktop/GameMog/app/create/page.tsx
- Database helpers: /Users/sheed/Desktop/GameMog/lib/db.ts (data file /Users/sheed/Desktop/GameMog/data/gamemog.db)
- GameMog Runtime: /Users/sheed/Desktop/GameMog/lib/runtime/v1.js (test and recording hooks are in the "debug" object near the end: start, autopilot, invincible, cinematic, timeScale, film)
- Playtest: /Users/sheed/Desktop/GameMog/lib/playtest-runtime.ts
- Headless Chrome driver: /Users/sheed/Desktop/GameMog/lib/browser.ts
- Design contract: /Users/sheed/Desktop/GameMog/scripts/design-check.ts
- Rules of play: /Users/sheed/Desktop/GameMog/docs/RULES.md
- README: /Users/sheed/Desktop/GameMog/README.md
- Secrets: /Users/sheed/Desktop/GameMog/.env.local (never open, print or commit it)

Running:
- npm run dev serves http://localhost:3939. If it is already running, use it. The first request after an edit recompiles that route and can take 60 to 100 seconds, so use generous timeouts.
- Checks, all of which must pass when you finish: npx tsc --noEmit -p . ; npm run check (includes the design contract) ; npm run check:runtime (real Chrome, needs the dev server) ; npm run check:platform (Mog end to end, needs the dev server).
- lib/browser.ts exports withBrowser(fn, { width, height }), which drives headless Chrome over DevTools. Headless Chrome's window includes 87px of browser chrome, so pass height = viewport height + 87. It will not go narrower than 500px.

=== 2. THE GOAL ===

The homepage, game pages and header should look and behave like roblox.com's Charts and experience pages: the same density, rhythm, type scale, controls and metadata. The branding stays GameMog's. Today the pages copy Roblox's colours and radii but not its magic. What the magic actually is, in priority order:

1. Key art. Every Roblox thumbnail is designed art, not a screenshot: a character close up, usually facing the camera, huge bold title lettering with a thick outline, saturated colour. GameMog's 3D worlds use a playtest screenshot taken from behind the runner, with small figures and no title. This is the biggest gap.
2. Density and rhythm. Roblox shows 8.5 square tiles per row at 1440px, each with a name and two numbers.
3. Type. Roblox uses its own typeface, Builder Sans, at weights 400 to 800. GameMog uses Helvetica Neue, which is only Roblox's fallback, so everything reads generic.
4. Controls. Dark pill filters, arrows in the rail gutters, a 300x68 Play button, a stats strip between two rules.

=== 3. ROBLOX, MEASURED ===

Page and header (desktop 1440):
- Page background: Roblox Charts is #FFFFFF; GameMog's contract requires #F7F7F8, keep ours.
- Body text: 16px, #202227.
- Header: 40px tall, fixed, background #F7F7F8, 1px bottom border #FFFFFF, no shadow.
- Header search: 360x28, background rgba(27,37,75,.08), border 1px solid rgba(27,37,75,.12), radius 8px, 16px text.
- Roblox has Sign Up and Log In buttons at the right of its header. GameMog's header has no buttons there, by the owner's choice. Do not add any.
- Primary button style (for buttons elsewhere): 30px tall, padding 6px 9px, #335FFF, text #F7F7F8, 16px/500, radius 8px.
- Page title h1: 32px/800, line-height 44.8px.
- Filter pills: 32px tall, background #272930, white 16px/700 text, radius 999px, padding 9px, trailing chevron.
- Rail heading h2: 20px/700, line-height 28px, followed by an (i) info icon.
- Rail caption under some headings: 14px/400, #494D5A.
- "See All" link with a right arrow: 16px/500, #393B3D, right-aligned on the heading row.

Tiles and rails (desktop):
- Thumbnail: 150x150 square, radius 8px, overflow hidden, placeholder rgba(27,37,75,.12).
- Gap between tiles: 14px. Whole tile: 150x240.
- Name: 16px/700, line-height 22.4px, margin-top 6px, up to two lines.
- Stats row: 12px/500, line-height 18px, #494D5A: thumbs-up icon + "98%", then person icon + "150.9K".
- Rail arrows: plain chevrons centred in a 30px gutter at each end of the rail (tiles start 30px inside the content edge). No circle, no shadow.
- Hover: none on Charts tiles.

Phone (375px):
- Header: 74px in two rows: logo and a search icon on top (Roblox also puts its buttons there; GameMog has none); nav links spread across the second row.
- h1 24px. Rail heading 16px.
- Tiles: about 88px squares, about 3.5 visible, swipe only, no arrows.
- Filter pills: same dark pills.

Experience (game) page, desktop:
- Content column 970px, centred.
- Media: 640x360 carousel with 48px circular arrows (#F7F7F8) at the left and right edges.
- Title: h1 32px/800, line-height 44.8px, beside the media. Byline "By <creator>" 16px, then a small maturity line.
- Play button: exactly 300x68, #335FFF, radius 8px, play glyph only.
- Under Play: Favorite, thumbs up with count, a thin vote bar, thumbs down with count.
- Tabs: 40px tall, 16px, full column width, active tab underlined.
- Section heading "Description": 20px/700.
- Stats strip: full column width between two 1px rules #BCBEC8, padding 12px 0, equal centred columns; label 12px/500 #494D5A above value 12px/400 #202227.
- Below: a "People Also Join" rail of standard tiles.

=== 4. WHERE GAMEMOG IS NOW ===

Homepage (/Users/sheed/Desktop/GameMog/app/page.tsx), top to bottom:
1. A full-width billboard for LA Olympics 2028 playing a real gameplay film, with Play and Mog it buttons. KEEP THE BILLBOARD EXACTLY AS IT IS. The owner asked for it.
2. "Top playing now": a rail of the 4 current games (3 worlds on the GameMog Runtime plus 1 older custom 3D game), as 264px 16:9 tiles. The homepage shows worlds only.

Classic page (/Users/sheed/Desktop/GameMog/app/classic/page.tsx, at /classic): all 22 games on the original race engine, as a grid sorted by plays, under an h1 "Classic" and a caption. These games are 3D, but they are the older format: three laps run to a beat, no GM coins, no rival joining each lap, so they do not follow the platform's current rules. Their covers are drawn SVG illustrations with title lettering (/Users/sheed/Desktop/GameMog/app/cover.tsx), all from one template. A game is Classic when format = 'race' in the games table. Game pages already recommend their own kind: worlds with worlds, Classic with Classic.

Header nav (the owner's decision, keep it exactly): "Classic" (/classic), "Create" (/create), "Racing" (/?f=race). The wordmark links home. There is no "Create a world" button and no Charts link. Racing currently points to /?f=race, which the homepage ignores. Give it a real destination (task E) without renaming or removing it.

Tiles show MOG and NEW badges. There is no FLAGSHIP badge; the owner removed it. Muse Sprint still has featured = 1 in the database because npm run check plays the featured game as its canary. Leave that flag alone.

- The 3D worlds' covers are JPEG screenshots from the playtest (gameCover() in /Users/sheed/Desktop/GameMog/lib/db.ts, served by /Users/sheed/Desktop/GameMog/app/g/[slug]/cover/route.ts).
- Tiles are 16:9 only because those screenshots are 16:9. Once key art exists (task A), go back to Roblox's exact 150x150 squares.
- The body font is 'Helvetica Neue', Helvetica, Arial in /Users/sheed/Desktop/GameMog/app/globals.css.

THE CLASSIC SPLIT IS THE OWNER'S DECISION: Classic games appear only on /classic and on their own game pages. They never appear on the homepage, in the world rails and charts, or in the billboard.

=== 5. THE WORK, IN ORDER ===

Commit after each task. Keep commits small, and make sure each one passes npm run check.

A. KEY ART FOR EVERY 3D WORLD (the most important task)

Build /Users/sheed/Desktop/GameMog/scripts/media/key-art.ts as npm run media:art [-- <slug>], covering all games with format 'world' when no slug is given. Model it on /Users/sheed/Desktop/GameMog/scripts/media/record-hero.ts. For each world:
1. Open http://localhost:3939/g/<slug>/play. Start the race, turn on autopilot and invincibility, and fast-forward (debug.timeScale(6)) to lap 3 so rivals are nearby. Then go back to real time.
2. Frame a front three-quarter hero shot of the player's character, facing the camera, with a rival behind. debug.film() in /Users/sheed/Desktop/GameMog/lib/runtime/v1.js only places the camera behind the runner today. Extend it with a target: 'player' option that looks at the character and allows a negative distance (camera ahead of the runner). It stays recording-only and marks the run assisted. Do not change the play camera.
3. Hide the HUD (debug.cinematic(true)). Add a temporary overlay in the page with the world's title set big: the theme's font, a thick outline in the theme's ink colour, fill in its accent colour, paint-order: stroke. This matches the runtime's own title card. The title should fill most of the width, as on Roblox thumbnails. Screenshot the viewport.
4. Write /Users/sheed/Desktop/GameMog/public/media/art/<slug>-icon.jpg (512x512, for tiles) and <slug>-wide.jpg (1280x720, for the game page and sharing), JPEG quality about 85.
5. Serve them from /Users/sheed/Desktop/GameMog/app/g/[slug]/cover/route.ts: return the key art when it exists (?shape=square for the icon, wide by default) and fall back to the playtest screenshot.
6. Make it automatic for every new world. /Users/sheed/Desktop/GameMog/lib/playtest-runtime.ts already takes a cover screenshot during the playtest. Take the key-art shots in the same browser session and store them with the draft, so every world Claude writes gets key art without anyone running a script. This is platform work and matters more than any single page.
Acceptance: a contact sheet of every world's icon at 150px looks like a row of Roblox thumbnails. You can see a face, the title reads at a glance, and nothing is a dark, empty track.

B. TILES AND RAILS, EXACTLY AS ROBLOX

- Tiles back to 150x150 squares: the key-art icon for worlds, and the square Cover (app/cover.tsx without "wide") for Classic games. Name 16/700/22.4 over up to two lines, margin-top 6px. Stats row 12/500 #494D5A with like % (when there are votes) and plays formatted 1.2K / 3.4M (short() in app/tile.tsx). Keep the Mog count and the MOG / NEW badges. Do not bring back FLAGSHIP.
- Rails: 14px gap, a 30px arrow gutter at each end with plain chevrons (no circle), arrows only on the side that has more to show. No arrows on phones.
- Update the tile assertion in /Users/sheed/Desktop/GameMog/scripts/design-check.ts back to 150x150, with a one-line reason.

C. TYPE

Replace Helvetica Neue with a self-hosted, SIL OFL-licensed typeface close to Builder Sans: geometric, large x-height, weights 400 to 800. Use Figtree: npm install @fontsource-variable/figtree (the owner approves this one dependency). Import it in /Users/sheed/Desktop/GameMog/app/layout.tsx. Do not fetch from Google Fonts (the contract forbids it). Use Roblox's type scale from section 3. Inter, Geist and Space Grotesk are banned. Never copy Builder Sans files.

D. HEADER (/Users/sheed/Desktop/GameMog/app/header.tsx)

- Desktop: 40px, fixed, with the measurements from section 3. Keep the nav items exactly as the owner set them: Classic, Create, Racing. Do not add, rename or remove any, and add no buttons on the right. Search 360x28.
- Phone: Roblox's two-row 74px header, with the nav links as the second row.

E. HOMEPAGE BELOW THE BILLBOARD

- Main section (worlds only, format not 'race'): Roblox-style rails. Only show a rail when it has at least 4 games and does not just repeat a rail above it. Candidates: "Top Trending" (plays), "Up-and-Coming" (newest), "Top Rated" (like %), "Most Mogged" (Mog count), "New Mogs" (games with a parent). Each has an (i) info icon with a one-line explanation, and a caption where Roblox would have one.
- Real filter pills in Roblox's dark style that actually filter the main section, e.g. Genre (from each game's meta.genre). No inert controls.
- No Classic games on the homepage.
- The Classic page (/classic) becomes a Roblox Charts page of its own: the h1 "Classic" and its caption, dark sort pills that actually sort (Most played, Newest, Best record), and 150px tiles.
- Chart pages for worlds: build /charts/<sort> (e.g. /charts/trending, /charts/new-mogs, /charts/racing) as Roblox-style grids of 150px tiles with the h1 and pills. "See All" links go there, and there are no anchors pretending to be pages. Point the "Racing" nav item at /charts/racing (racing worlds).

F. GAME PAGE, ROBLOX'S EXPERIENCE LAYOUT

Apply section 3's experience-page measurements to /Users/sheed/Desktop/GameMog/app/g/[slug]/custom-page.tsx (worlds) and /Users/sheed/Desktop/GameMog/app/g/[slug]/page.tsx (Classic):
- 970px column.
- 640x360 media area: keep the live game frame as the first slide, then the hero film if one exists, then the key art, with 48px round arrows.
- h1 32/800. Play button exactly 300x68.
- Stats strip between two #BCBEC8 rules with centred columns: Plays, Players, Likes, Mogs, Generation, Created, Updated, Genre, Rivals.
- Tabs 40px tall.
- Keep every Mog element (Mog button, lineage line, Mog-off panel, Mogs tab); they are the product.
- The "Recommended" rail becomes "Players Also Play" with standard tiles. Keep the existing split: worlds recommend worlds, Classic recommends Classic.
- Classic game pages carry a small "Classic" label near the title.

G. FOOTER, EMPTY STATES, PHONE PASS

- Footer: a Roblox-style row of links, then fine print. Only link pages that exist.
- Every rail, grid and tab gets a real empty state. No blank boxes.
- Do a full pass at 375px and at 1440px against section 3. Tiles on phones are about 88px.

=== 6. RULES YOU MUST NOT BREAK ===

- No Roblox brand assets. Match layout, metrics and behaviour only. No Roblox logo, name, wordmark, Builder Sans files, icons, images or copy. GameMog must never look like it claims to be Roblox. LA Olympics must not use the Olympic rings or the LA28 logo.
- The design contract (/Users/sheed/Desktop/GameMog/scripts/design-check.ts) is the owner's brief. It bans:
  - drop shadows;
  - gradients in the interface (drawn art and generated images are exempt);
  - frosted glass;
  - CSS transitions and animations;
  - emoji and em dashes;
  - purple, and fully saturated neon colours;
  - radii between 9px and a full pill.
  It also requires the page background #F7F7F8. Stay inside it. Where a task above changes a measured rule, update the assertion and put the reason in a comment. Never weaken a rule just to make a check pass.
- Keep the billboard as it is. Keep the Classic split (Classic only on /classic and on its own game pages). Keep the header nav as Classic, Create, Racing, with no "Create a world" button and no FLAGSHIP badge.
- Honest numbers. Show the real plays, likes and Mogs. Never inflate, seed or fake counts or badges.
- Do not change:
  - the rules of play (RULES in /Users/sheed/Desktop/GameMog/lib/runtime/v1.js, and /Users/sheed/Desktop/GameMog/docs/RULES.md);
  - the Mog logic or API semantics (/Users/sheed/Desktop/GameMog/app/api);
  - any rows in /Users/sheed/Desktop/GameMog/data/gamemog.db.
  Do not delete, hide or re-feature any game. If you think one should move, say so in your report.
- Secrets: /Users/sheed/Desktop/GameMog/.env.local holds a real API key. Never open it, print it or commit it.
- Downloads: the only new dependency allowed is @fontsource-variable/figtree. Add no other packages, fonts, images or third-party assets without asking.
- Commits: there is no global git identity. Commit with git -c user.name='sheed' -c user.email='65737256+whyagents@users.noreply.github.com' commit ... and do not push.
- The Mac can sleep when idle. Run long Chrome jobs under caffeinate -i.

=== 7. HOW TO VERIFY ===

1. Run all four checks from section 1.
2. Screenshot these pages in real Chrome through /Users/sheed/Desktop/GameMog/lib/browser.ts, at 1440x900 and at phone width:
   - http://localhost:3939/
   - /g/la-olympics-2028
   - /g/pepe-s-thunderbog-dash
   - /g/muse-sprint
   - /classic
   - /create
   - /mog/la-olympics-2028
   For a true 375px width, add an emulate({ width, height, mobile }) method to the Page type in lib/browser.ts using DevTools' Emulation.setDeviceMetricsOverride.
3. Compare each screenshot against section 3, line by line. Fix any difference larger than 2px, and any wrong weight or colour.
4. Build a contact sheet of all tiles at 150px and look at it. If any world tile looks like a screenshot rather than key art, task A is not done.

=== 8. REPORT BACK ===

- What changed, per task, with the commit hashes.
- Before and after screenshots from section 7.
- Anything you could not match, and why.
- Decisions for the owner: anything you think should change but that this brief tells you to leave alone.
