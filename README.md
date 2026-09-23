# GameMog

The internet, playable. Prompt → build a world → play → share → **Mog** it: challenge any game
with a better variation. AI generates, humans select, winners reproduce. The platform's rules,
in the owner's words next to how the code reads them, are in [docs/RULES.md](docs/RULES.md).

Muse Sprint, the hand-built rhythm footrace this platform was extracted from, is the
featured game on the homepage, and it now runs on the same engine every generated world uses.

```bash
npm install
npm run build:engine     # regenerate the engine from reference/musesprint.original.html
npm run seed             # put Muse Sprint in the database
npm run dev              # http://localhost:3939
```

Set `ANTHROPIC_API_KEY` in `.env.local` for real generation (Claude Opus 5.5). Written games are playtested in the Chrome installed on this machine; set `CHROME_PATH` if it lives somewhere unusual. Without it, `/create` still works
end to end on a deterministic placeholder world, so the whole product is demoable with no spend,
and an uploaded character still sets the racer, because its colour is read in the browser rather
than by a model.

```bash
npm run check            # regression guard; the featured game is the canary
npm run check:runtime    # the framework's rules, asserted in real Chrome (needs the dev server)
npm run check:platform   # Mog: lineage, Mog-offs and family ranking, end to end (needs the dev server)
npm run publish:world -- la-olympics-2028   # a first-party world from worlds/, through the same gate
npm run assets:fetch && npm run assets:build # rebuild the licensed asset library from its pinned sources
```

---

## Mog

Every game page has a **Mog** button. It opens `/mog/<slug>`, where a challenger says in a line
how to beat the game. Claude Opus 5.5 is given the original's complete code (a runtime world's
module; for older formats, what the game was built from), the original creator's prompt and the
challenger's idea, and writes a complete new world. It goes through exactly the gate any world
does, the static check and the Chrome playtest with up to three repair rounds, and publishes
from the draft that passed.

- **Lineage.** A Mog records its parent, its family's root and its generation. Its page says
  "Mogged from …" and links the original; the original's page says how many Mogs challenge it
  and lists them under a Mogs tab. The original is always credited, at any depth.
- **Mog-off.** A Mog's page asks: this Mog, or the game it challenged? A pick counts only once
  that browser has finished a run in **both** games (`plays`, reported by the game frame when a
  run ends). One pick per browser per Mog-off, changeable.
- **Selection.** A family is ranked by Elo over its counted picks (K = 32, from 1000), then by
  distinct players. The leader is marked on its page.

Players are ids the browser makes for itself, so this counts browsers, not verified humans.
That is enough to rank a family honestly among people acting in good faith; creator earnings
tied to verified human audiences need accounts first. `npm run check:platform` publishes a
throwaway family through the real API, asserts all of the above and removes it.

## The framework: GameMog Runtime + world modules

GameMog works the way Roblox does, without a studio to download. Roblox owns the engine and
creators script experiences on it; here the **GameMog Runtime** (`lib/runtime/v1.js`) owns the
rules, and **Claude Opus 5.5** writes a **world module** from a creator's prompt.

**The runtime owns the rules, and no world can change them:**
- Every world is 3D, seen through the runtime's chase camera. No 2D, top-down or side-on
  games: the static check refuses a world that creates, moves or re-projects a camera, and the
  runtime re-asserts its camera every frame.
- Endless laps; your level is the lap you are on.
- One rival lines up beside you on the start line; every lap one more joins at the line as you
  cross it (in a clear lane, holding it for 2.5 seconds before it hunts you).
- Every lap is harder, gradually: your speeds rise 5% a lap (up to 1.6x); rival k joins at
  0.80x your cruising speed plus 0.05 per earlier rival, and every rival gains 0.015 on you and
  0.02 aggression each lap it races; moving obstacles speed up 4% a lap (up to 1.5x).
- The only way to die is to touch a rival or an obstacle.
- Golden **GM** coins, re-laid every lap, identical in every world.
- Arrow keys or WASD steer and change speed, Space pauses, touch buttons on phones.
- Title, countdown, HUD, level-up banners, rear warnings, pause, results, restart, leaderboard
  (highest level, then GM).

**The world module owns everything else:** the track's shape, the sky, the ground and the
scenery, the player and every rival (look, name, colour, animation), the obstacles, ambient
life and sound, and the HUD's colours and font. The API it writes against is
[`lib/runtime/API.md`](lib/runtime/API.md), the same document a human developer would read;
[`lib/runtime/reference-world.js`](lib/runtime/reference-world.js) is the worked example.

**The runtime also guards the world against itself.** Hitboxes are measured from the models
rather than trusted. An obstacle row that closes the whole track is thinned. Scenery inside
the racing corridor is hidden, so nothing can block the chase camera; that was the start gate
whose banner filled the screen in an earlier game. Every repair is reported, and the model is
told once so it can do better.

**Every world is raced before it can be published** (`playtestWorld` in
`lib/playtest-runtime.ts`): real Chrome boots it, starts a run, drives several laps of rivals
joining through the runtime's own test hooks, measures the frame rate, forces a crash, and
checks the result reaches the platform. Blocking problems go back to the model in the same
conversation, up to two repair rounds. The cover is a frame from that run with the HUD hidden.

**The rules are tested in real Chrome too.** `npm run check:runtime` drives the reference
world through the keyboard, the pause key, eight laps and a crash, and asserts every rule above
(25 checks).

Worlds are pinned to the runtime version they were written against, so a later runtime can
change without changing a world that already shipped.

**Cinematic graphics, opt-in** (`graphics` in the API). A world that declares it renders into a
multisampled HDR target with image-based light baked from its own sky (`ctx.sky`), a 2048 shadow
map that follows the player (texel-snapped, so edges do not crawl), bloom on anything brighter
than white, filmic tone mapping, grading, vignette and grain. The runtime holds 60 fps by
lowering the resolution, then the antialiasing, then the bloom; it drops NaN and infinite pixels
before they can bloom; and `ctx.quality` tells a world to build lighter on phones. Worlds
without `graphics` render exactly as before. A tall screen widens the vertical field of view so
the track never shrinks to a sliver.

**The asset library** (`public/assets`, browsable at `/library`) gives worlds realistic people and
real skies. `npm run assets:fetch` downloads the pinned, licensed sources in
`assets-src/sources.json` (MakeHuman's CC0 body, skins, hair and eyes; CMU motion capture; a
Poly Haven CC0 sky), locking each file's SHA-256 in `sources.lock.json`, so a source that changes
upstream stops the build. `npm run assets:build` turns them into compact assets: MakeHuman's base
mesh shaped into athletes with five runtime morphs, its 163-bone rig reduced to 66, proxies
fitted and skinned, a kit layer with position and normal maps so the runtime can paint any kit
and bib in body space, and CMU captures retargeted by bone direction into a run, a sprint, an
idle, a standing start and a fall. `library.json` lists every file's hash and every asset's
licences. A world names ids in `assets`; the runtime fetches them from `/assets/` (the only
network a world's CSP allows), refuses any file whose hash does not match, and hands
`ctx.assets.human(...)` to the world. `npm run check` fails on any file without a licensed
source, and `check:runtime` boots a library athlete in Chrome and a missing id that must fall back.

**First-party worlds** live in `worlds/` as a module and its metadata, and publish with
`npm run publish:world -- <name>` through the same static check and Chrome playtest as a
generated world; publishing again updates the game in place. *LA Olympics 2028*
(`worlds/la-olympics-2028.js`) is the showcase: a standard 400m track (84.39m straights, 36.5m
kerb, nine lanes, the 400m stagger), a two-tier bowl of about 48,000 instanced fans who do the
wave, a colonnade with the cauldron burning at the open end, and library athletes in national
kits running on motion capture, lit by a real sunset sky; its own procedural sprinters remain as
the fallback.

### Earlier formats, still playable

- **Race worlds.** Muse Sprint and the first worlds: a `WorldSpec` filled in for the tuned
  rhythm-race engine. Safe and consistent, but a reskin at most; no prompt could change the
  controls, the movement or the creatures.
- **Written games.** Pepe's Bog Derby: Opus wrote an entire game with no framework. Unlimited,
  but nothing guaranteed the platform's rules. The framework keeps the freedom and adds the
  rules.

| Requirement | How the framework meets it |
|---|---|
| Isolate generated code | A sandboxed opaque origin, a CSP carrying `sandbox` (so it holds in a tab of its own), `connect-src 'none'`, no remote images or media, and a static read that refuses network, storage, eval, timers, the DOM, input listeners and the runtime's own jobs |
| Automatic playtesting | Real Chrome races the world through the runtime's test hooks; the rules themselves are tested by `check:runtime` |
| Reliable editing | A world module only describes the world; it cannot reach the controls, the rules or the scoring, so no edit can break them |
| Consistent frame | One runtime; every world on it plays by the same rules and speaks the same contract |

## How a world is built

```
character ─┐
           ├─▶ Claude (vision + structured output) ─▶ Brief ─▶ expandBrief ─▶ protectCharacter ─▶ playtest ─▶ publish
prompt ────┘              │                                        │                 │              │
                  narrow creative surface            clamps + procedural track   world yields   errors block
```

- **`lib/generate.ts`**: the model's output surface (`BriefSchema`) is deliberately *narrower*
  than a WorldSpec. It picks a mood, a palette, a cast and four track knobs. Colours are
  unconstrained strings there on purpose: a rejected generation is worse than one that needs a
  `#` prepended, so everything is normalised rather than refused.
- **`lib/track.ts`**: the model never emits spline points. It says "big, twisty, hilly, 11
  corners" and the loop is built in polar form with a jittered radius, which makes it
  *star-shaped about its centre*, and a star-shaped polygon cannot self-intersect. That one
  property removes an entire class of broken tracks.
- **`lib/playtest.ts`**: static playtest. Catches what a human would otherwise find by loading
  the game: lanes hanging off the road, a racer camouflaged against the ground, a lap so short
  the tempo banner covers it, a scene budget no phone will hold. Errors block publishing;
  warnings are shown. It does not tell you whether a game is fun. Nothing automatic does.
- **`lib/rig.ts`**: the creature itself. Muse Sprint's animal was a fixed lathe profile, four
  limb spheres and a face plate, which made every generated world *the same animal in a new
  colour*. A rig now authors the body: height, girth, how much of a head it has, leg and arm
  length, fur length and density, how far the hood opens, eye size and spread, mouth width, and
  what is on its head (ears, horns, antennae, a crest, or nothing). Every field is a **bounded
  multiplier against the shipped silhouette**, never an absolute measurement, so the identity
  rig reproduces Muse Sprint exactly, and every other rig is a deformation of a shape already
  known to read at racing speed. The model designs one rig, the player's; rivals are jittered
  from it so the field looks like one species with individual variation rather than five
  unrelated creatures (and so the grammar budget survives).
- **`lib/character.ts`**: an uploaded character is the one thing in a world that is not up for
  negotiation. Its colour is fixed; when the generated palette would swallow it, the **world**
  moves (terrain shifts away, rivals recolour) and the creator is told what gave way rather
  than silently overruled. The image is downsampled to 768px in the browser before upload
  (a character reference needs no fidelity, and it keeps the vision token cost honest), and its
  dominant colour is read there too, ignoring the white backdrop that exports almost always
  carry. A plain average returns white for exactly the kind of image people upload.
- **`lib/worldspec.ts`**: the authored schema, the tuned difficulty ladders, and `compileWorld`,
  which expands a spec into exactly what the engine reads.

## Enforce, don't instruct

The system prompt asks for readable colours. Asking is not enforcing, and the point of a fixed
engine is that correctness does not depend on a model remembering an instruction. So the same
rules are applied in code after generation, and every threshold is calibrated against the Muse
Sprint cast, a field that has actually been watched race:

| | verified-good floor | gate |
|---|---|---|
| racer vs ground, hue distance | 167 | 90 |
| racer vs ground, luminance contrast | 1.46 | 1.30 |
| player vs rival, hue distance | 49 | 34 |

Both metrics are needed. Distance alone misses a rival that differs in hue but sits at the same
brightness as the ground; contrast alone misses one that shares the ground's hue. The first
version of this checked only distance and shipped two invisible rivals.

`npm run check` asserts the featured game still passes its own playtest, that protection is
idempotent and keeps the character's exact colour, and that 400 procedurally generated tracks
stay star-shaped, unpinched and a sane length. It has already caught two real defects: an
8-racer grid whose lanes overlapped, and a confusable-colour threshold tuned so tight it
rejected the shipped game.

## Difficulty

Every lap is a level. Lap 1 is the original hand-tuned ANDANTE, untouched, and
anybody who can keep a beat leads it. Laps 2 and 3 keep their original rhythm
and stride too, so the game feels the same and runs at the same top speed; what
changes is what they demand:

|          | lap 1 | lap 2 | lap 3 |
|----------|-------|-------|-------|
| window   | 210-420ms (210 wide) | 177-247ms (70 wide) | 152-170ms (18 wide) |
| stride   | 297ms | 212ms | 161ms |
| pack     | 0.85x | 1.32x | 1.30x, just under top speed |

Measured on the real game in Chrome at 60fps and in the simulator, standard
tier:

| player | after lap 1 | lap 2 | finishes | wins |
|---|---|---|---|---|
| ordinary (30ms timing) | leads | gets caught | last | 0% |
| good (16ms) | leads | holds on | 3rd-4th | 0% |
| expert (11ms) | leads | leads | 2nd-4th | 0% |
| elite (7ms, the limit of trained timing) | leads | leads | usually 2nd | ~10% |
| flawless (3ms) | leads | leads | 1st | ~100% |

Two things hold that together.

**Lap 3's pack runs just under top speed.** A pack faster than 36 m/s catches
even flawless play on any loop long enough to give it time; tried once, that
made every world over ~700m unwinnable. Held just under, flawless play always
wins, and the lap asks only whether you can stay that close to flawless.

**Each world's pack is scaled for its own track.** Rivals lose 5.5 m/s per
radian of curvature, and across the published worlds corners cost them
anywhere from 0.5 to 4.8 m/s. Unscaled, a merely good player won the twisty
Whaleback Night Market 87% of the time while elite play managed 1% on the
flowing Tick Vault. `lib/course.ts` measures each track exactly as the engine
does, and `paceFor()` scales laps 2 and 3 by a plane fitted to all 21 real
tracks (worst error half a percent). Across all 25 track types the generator
can make, an elite run now wins between 4% and 20%, a good player never.

**How this went wrong first.** An earlier pass hit its win-rate targets on paper
and wrecked the game: it slowed lap 1 from 297ms to 400ms strides, narrowed its
window from 210ms to 80ms and cut top speed, so races ran a quarter longer and
the lock chain fell from ~28 a race to ~4. It was tuned against a simulator
that had only ever been checked against the original game, where everyone
wins, which proves nothing; the simulator's flat corner guess was off by 2x.
So `npm run check` now pins the feel first (lap 1, every stride, drag and top
speed must equal the original) before it measures a single outcome, and the
simulator's numbers are quoted only because they were checked against real
races.

Published worlds needed no migration: a game row stores its authored
WorldSpec and `compileWorld` runs per request, so every world moved at once.

## The interface

The catalogue is built to Roblox's measurements, not to an impression of them. Every value in
`app/globals.css` was read off `roblox.com/charts` and a Roblox game page with `getComputedStyle`
at a 1440px viewport, and the readings are written down in `design/roblox.measured.md` with the
date. When the look needs to change, re-measure rather than nudge.

What that produced: 150x150 thumbnails at an 8px radius with a 14px gap, names at 16px/700 on a
22.4px line clamped to two lines, metadata at 12px/500, a 40px nav, a 32px/800 page title, one
primary action at 300x60 in `#335FFF`, and pills at 999px in `#272930`. Text is `#202227` over
`#494D5A` over `#6A6F81`. There is no centred marketing container and no card wrapping each
section; tiles sit directly on the page, which is what makes a catalogue read as a catalogue.

There is no webfont. Roblox ships a proprietary face and falls back to Helvetica Neue, so we
render the fallback they already render, out of the operating system, with no network request.

The brief for this interface was mostly a list of things it must not do: no drop shadows, no
gradients in the chrome, no frosted glass, no transitions, no soft radii, no purple, no neon, no
webfont, no em dashes, no emoji, no three-across feature cards. A list like that decays the first
time someone adds a component in a hurry, so it lives in `scripts/design-check.ts` as assertions
and runs inside `npm run check`. The same file asserts the things that must be present: a terms
page, a privacy page, skeleton loaders where content is genuinely pending, and a hero that runs
the real game rather than showing a picture of it.

House punctuation is enforced the same way. The system prompt asks the model not to use em
dashes; `houseCopy()` in `lib/generate.ts` rewrites every line of generated copy on its way into
a spec, so a published world cannot carry one whatever came back.


## The engine

`scripts/build-engine.mjs` transforms `reference/musesprint.original.html` into
`public/engine/engine.js` by replacing 73 hardcoded constants with config reads: the world's
palette and props, and the creature's own geometry, fur shader and face shader. Every
substitution is asserted, so if the source drifts and an anchor stops matching the build fails
loudly rather than shipping a half-parameterised engine. It also guards against a source block
shadowing the injected config binding, which is a real bug this caught once.

Keeping the original as the source of truth means the featured game is *provably* the same game:
if the engine ever stops reproducing it from `lib/presets/muse-sprint.ts`, the abstraction has
sprung a leak.

## Safe execution

Every game is served from its own route (`/g/[slug]/play`, drafts at `/d/[id]/play`) into an
iframe with `sandbox="allow-scripts"` and **no** `allow-same-origin`. That puts it on an opaque
origin: it cannot read the host page, our cookies, or our API. Its only channel is
`postMessage`, verified by *source window* rather than origin string (an opaque origin reports
as `"null"`).

Written games get more, because they are untrusted code (`lib/custom-game.ts`): the document's
own CSP carries `sandbox allow-scripts allow-pointer-lock`, so opening the game in its own tab
still gives it an opaque origin; `connect-src 'none'`, and images and media only from `data:`
and `blob:`, so it cannot send anything anywhere; no `unsafe-eval`. A static read refuses
network, storage, eval, dialogs and imports before a game ever runs, so a player never meets a
game that throws on them. What a game can still do is burn its own tab's CPU; the runtime
playtest rejects the ones that do.

The embedding page asks the game whether it is running (`hello`) until it answers (`ready`),
rather than waiting to be told. A game can finish booting before the page's own script starts,
and a message sent before anyone is listening is lost; that was once a "browser is blocking the
embedded game" warning sitting over a game that was running fine underneath.

A posted score is a claim from an untrusted surface. `POST /api/scores` does the cheap sanity
checks that catch accidents and casual tampering. **It is not proof.** Real verification needs
replay validation; the shape is there for it to slot into.

## Data

SQLite via Node's built-in `node:sqlite`: no native module, no build step, one file in `data/`.
`games` (with `parent_id`, `root_id`, `generation`, `mog_prompt` for Mogs), `scores`, `plays`
(finished runs per player), `mog_picks`, and `generations` (prompt, model, attempts, findings,
latency) so generation quality can actually be measured rather than guessed at.

## What is not built yet

Named honestly, because an MVP that pretends to be complete is worse than one that doesn't:

- **Phone playtesting.** Worlds are playtested in desktop Chrome; nothing yet asserts frame time
  on a real phone.
- **The other three formats.** Only `race` exists. The engine contract (`WorldSpec` in, canvas
  out) is what the others would implement.
- **Server-side refusal fallbacks.** `generate.ts` handles `stop_reason: "refusal"` with a clear
  error rather than wiring `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`,
  because that path could not be tested without a key. One-line change when you want it.
- **Mog steps 5 and 6.** Family leaders are ranked and marked but not yet featured on the
  homepage, and there is no share card for a Mog-off.
- **Verified players.** Mog-off picks and distinct players count browsers; see Mog above.
- **Auth, rate limiting, moderation.** None. Do not deploy this publicly as is.
