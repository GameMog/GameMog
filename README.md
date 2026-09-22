# GameMog

Give a character a world to run through. Describe a setting, get a playable link.

Muse Sprint, the hand-built rhythm footrace this platform was extracted from, is the
featured game on the homepage, and it now runs on the same engine every generated world uses.

```bash
npm install
npm run build:engine     # regenerate the engine from reference/musesprint.original.html
npm run seed             # put Muse Sprint in the database
npm run dev              # http://localhost:3939
```

Set `ANTHROPIC_API_KEY` in `.env.local` for real generation. Without it, `/create` still works
end to end on a deterministic placeholder world, so the whole product is demoable with no spend,
and an uploaded character still sets the racer, because its colour is read in the browser rather
than by a model.

```bash
npm run check            # regression guard; the featured game is the canary
```

---

## The one decision everything rests on

**Generated games are data, never code.**

A model never writes a line of JavaScript here. It fills in a `WorldSpec`: colours, counts,
names, four track knobs. A fixed, reviewed engine reads it. That single constraint is what
delivers most of the hard requirements for free:

| Requirement | How it is met |
|---|---|
| Change the track without breaking controls | The model cannot reach the controls. Physics and timing come from a named difficulty preset, not from generation. |
| Isolate generated code | There is no generated code. The world is JSON; the engine is a shipped artifact. |
| Keep the world frame consistent | Every game is the same engine with different data, by construction. |
| Automatic playtesting | A world is a value, so it can be checked statically, before anything runs. |

The remaining risk is not "did the model write valid code" but "is this world worth playing",
which is the right problem to have.

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

The game is served from its own route (`/g/[slug]/play`) into an iframe with
`sandbox="allow-scripts"` and **no** `allow-same-origin`. That puts it on an opaque origin: it
cannot read the host page, our cookies, or our API. Its only channel is one `postMessage`
carrying a result, verified by *source window* rather than origin string (an opaque origin
reports as `"null"`, so origin checks are useless here). A tight CSP allows inline script and
two CDN hosts and nothing else.

A posted score is a claim from an untrusted surface. `POST /api/scores` does the cheap sanity
checks that catch accidents and casual tampering: a floor derived from the world's own
physically fastest race, a ceiling, a valid finishing place. **It is not proof.** Real
verification needs replay validation; the shape is there for it to slot into.

## Data

SQLite via Node's built-in `node:sqlite`: no native module, no build step, one file in `data/`.
`games`, `scores`, and `generations` (prompt, model, attempts, findings, latency) so generation
quality can actually be measured rather than guessed at.

## What is not built yet

Named honestly, because an MVP that pretends to be complete is worse than one that doesn't:

- **Runtime playtesting.** Static validation catches config-level defects. It does not catch a
  world that loads and then drops to 20fps on a real phone. That needs a headless browser
  running a scripted race and asserting on frame time, which is the next thing worth building.
- **The other three formats.** Only `race` exists. The engine contract (`WorldSpec` in, canvas
  out) is what the others would implement.
- **Server-side refusal fallbacks.** `generate.ts` handles `stop_reason: "refusal"` with a clear
  error rather than wiring `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`,
  because that path could not be tested without a key. One-line change when you want it.
- **Remix.** The button links to `/create?remix=slug`; the create page does not read the param yet.
- **Auth, rate limiting, moderation.** None. Do not deploy this publicly as is.
