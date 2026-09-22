# GameMog

Give a character a world to run through. Describe a setting, get a playable link.

Muse Sprint — the hand-built rhythm footrace this platform was extracted from — is the
featured game on the homepage, and it now runs on the same engine every generated world uses.

```bash
npm install
npm run build:engine     # regenerate the engine from reference/musesprint.original.html
npm run seed             # put Muse Sprint in the database
npm run dev              # http://localhost:3939
```

Set `ANTHROPIC_API_KEY` in `.env.local` for real generation. Without it, `/create` still works
end to end on a deterministic placeholder world, so the whole product is demoable with no spend.

---

## The one decision everything rests on

**Generated games are data, never code.**

A model never writes a line of JavaScript here. It fills in a `WorldSpec` — colours, counts,
names, four track knobs — and a fixed, reviewed engine reads it. That single constraint is what
delivers most of the hard requirements for free:

| Requirement | How it is met |
|---|---|
| Change the track without breaking controls | The model cannot reach the controls. Physics and timing come from a named difficulty preset, not from generation. |
| Isolate generated code | There is no generated code. The world is JSON; the engine is a shipped artifact. |
| Keep the world frame consistent | Every game is the same engine with different data, by construction. |
| Automatic playtesting | A world is a value, so it can be checked statically — before anything runs. |

The remaining risk is not "did the model write valid code" but "is this world worth playing",
which is the right problem to have.

## How a world is built

```
prompt ──▶ Claude (structured output) ──▶ Brief ──▶ expandBrief ──▶ WorldSpec ──▶ playtest ──▶ publish
                     │                                   │                          │
            narrow creative surface          clamps + procedural track      gate: errors block
```

- **`lib/generate.ts`** — the model's output surface (`BriefSchema`) is deliberately *narrower*
  than a WorldSpec. It picks a mood, a palette, a cast and four track knobs. Colours are
  unconstrained strings there on purpose: a rejected generation is worse than one that needs a
  `#` prepended, so everything is normalised rather than refused.
- **`lib/track.ts`** — the model never emits spline points. It says "big, twisty, hilly, 11
  corners" and the loop is built in polar form with a jittered radius, which makes it
  *star-shaped about its centre* — and a star-shaped polygon cannot self-intersect. That one
  property removes an entire class of broken tracks.
- **`lib/playtest.ts`** — static playtest. Catches what a human would otherwise find by loading
  the game: lanes hanging off the road, a racer camouflaged against the ground, a lap so short
  the tempo banner covers it, a scene budget no phone will hold. Errors block publishing;
  warnings are shown. It does not tell you whether a game is fun. Nothing automatic does.
- **`lib/worldspec.ts`** — the authored schema, the tuned difficulty ladders, and `compileWorld`,
  which expands a spec into exactly what the engine reads.

## The engine

`scripts/build-engine.mjs` transforms `reference/musesprint.original.html` into
`public/engine/engine.js` by replacing 45 hardcoded constants with config reads. Every
substitution is asserted — if the source drifts and an anchor stops matching, the build fails
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
checks that catch accidents and casual tampering — a floor derived from the world's own
physically fastest race, a ceiling, a valid finishing place. **It is not proof.** Real
verification needs replay validation; the shape is there for it to slot into.

## Data

SQLite via Node's built-in `node:sqlite` — no native module, no build step, one file in `data/`.
`games`, `scores`, and `generations` (prompt, model, attempts, findings, latency) so generation
quality can actually be measured rather than guessed at.

## What is not built yet

Named honestly, because an MVP that pretends to be complete is worse than one that doesn't:

- **Character upload.** The flow is described on the homepage but `/create` takes text only. The
  path is short — pass the image to the model as a content block and let it derive the player's
  colour and name — but it is not wired.
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
