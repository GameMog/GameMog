# Story Kit: writing and running a story pack

A story is one JSON file of data, with no code and no coordinates: `storykit/packs/<id>.json` (story pack v2). GameMog
gates it, forges its people, voices its lines and stores the world; **Mog City** (mc.gamemog.com, its own repo) plays
it, on Mog City's engine, city, HUD, cars, cast and look (`base.engine: "mogcity-1"`, New York). GameMog keeps no
engine of its own for stories. The worked example is `packs/test-night-shift.json` ("Night Shift": New York, a winter
night, three people, the Night Cab, two calls with timed choices, a chase and a close-up in a cutscene).

| folder | what it is |
|---|---|
| `pack/` | the pack's schema (`schema.mjs` writes `schema.json`), the gate (`gate.ts`), the cities' place lists (`cities.ts`), good fixtures |
| `packs/` | creators' packs (the files you write; the test packs are the checks' fixtures) |
| `vehicles/` | the vehicle sheet, `buildVehicle`, the stock sheets (`sheets/night-cab.json` ...), the studio (Mog City's runner carries a copy) |
| `voices/` | Kokoro voice design, the in-browser voice pass and the creator's voice page (`voices/README.md`) |
| `cast/` | the cast registry's rules and the seeds of Mog City's shipped people (`cast/README.md`) |
| `cities/sf/` | San Francisco, kept for later as a city module (`cities/README.md`): no runtime plays it yet, and it is not served |
| `hometown/` | Hometown: a town's CityPackage (`city-package.ts`), SF's place library as one (`sf-package.ts`), the hometown gate (`hometown-gate.ts`: gatePack with the town's table, the town lock) and the real-place safety rules (`safety.ts`); the builder's side is `../lib/storykit-hometown.ts`, the checks `../scripts/storykit-hometown-check.ts` |
| `BUILDER.md` | the chapter GameMog's builder model reads to write a pack (`lib/storykit-build.ts`) |
| `../scripts/forge/` | the Character Forge: a person's sheet becomes a rigged GLB on the 66-bone cast rig, in Node or in the creator's browser |
| `../public/storykit/` | what the site serves for it: the forge, the voices, the work page, the cast registry (`../public/storykit/README.md`) |

## Build a pack's fixtures

```
npm run storykit:pack -- test-night-shift     # gate it, forge its cast (changed sheets or forge), build it
```

`storykit:pack` (`scripts/storykit-pack.ts`) does four things:

1. **Gate:** it runs `gatePack`. A refused pack stops here and every problem is printed.
2. **Forge:** each person with a sheet is built by `scripts/forge/forge.mjs` (about 2.5 s each) into
   `public/storykit/cast/<id>/<cast id>.glb`. Their sheet is kept beside the GLB as `<cast id>.sheet.json`, and a
   person is only built again when their sheet changes or the forge does (a hash of the forge's modules is kept as
   `<cast id>.forge`; `--reforge` builds everyone again). It then rebuilds the browser forge (`public/storykit/forge/forge.js`).
3. **Clip pack:** the shared clip pack (`public/storykit/cast/cast-clips.glb`) is built once, for every story.
4. **Build:** it writes `public/storykit/packs/<id>.json`, the runner's format (`toRunnerPack`, the same format the
   store hands Mog City). That file holds the cast's names, colours, GLBs and sheet clips, the car as a vehicle sheet
   and the dressing.

Then the voices: open `/storykit/voices/studio.html?pack=<id>` on the dev server. It renders every spoken line that has
no clip yet in your browser and stores the clips in `public/storykit/packs/<id>/voice/`. The model files must be served
first (`npm run storykit:voice-files`, see `voices/README.md`). `storykit:pack` prints how many lines are voiced.

`--no-forge` skips step 2. `npm run check` fails when a built pack is stale or a GLB is older than its sheet, so after
editing a pack, run the command again before committing.

The forge's Node tools find what lives outside this repo from the environment, or from places relative to the
checkout (`scripts/forge/paths.mjs`; no machine path is written in the repo): `FORGE_TOOLBOX_DIR` (the glTF toolbox
with `diet/build.mjs` and its `node_modules`; default `.scratch/tools/gltf`), `FORGE_MOGCITY` (a Mog City checkout;
default `MogCity/` in the checkout), `FORGE_MH_TARGETS` and `FORGE_MH_BASE` (MakeHuman's targets and `base.obj`),
`FORGE_GAMEMOG`, and `CHROME_LOCK_MODULE` (a shared one-Chrome lock, where a machine has one).

**To play one,** it goes through the store like any world: a draft (`POST /api/storykit/drafts`), sealed, framed on
Mog City as `<mc>/?pack=<site>/storykit/f/<sha256>.json&host=<site>&game=<id>`. Locally `STORYKIT_MC_ORIGIN` names a
Mog City dev server. Mog City's runner, its test switches (`autopilot`, `autoanswer`, `autochoose`, `skipscenes` ...)
and its runs live in Mog City's repo (`wagmi/storyrun/`, `tools/storyrun/`).

## Write a pack

The schema is `pack/schema.json`, and the gate's extra rules are listed at the top of `pack/gate.ts`. The shape:

```jsonc
{
  "storykit": 2, "id": "test-night-shift", "title": "Night Shift", "kicker": "NEW YORK", "tagline": "...",
  "base": { "engine": "mogcity-1", "city": "ny", "cityBuild": "ny-mogcity-1" },   // a Mog keeps its parent's city
  "dressing": { "time": "midnight", "season": "winter", "weather": "snow", "holiday": [] },
  "hero": "dez", "ride": "rides.night-cab",
  "hud": { "clock": { "label": "NIGHT", "format": "count", "unit": "night" }, "meters": [{ "id": "cash", "kind": "money" }] },
  "places": { "kwon-corner": { "@": "les", "name": "Orchard St & Rivington St" } },   // your names for city places
  "cast": [ { "id": "kwon", "anchor": "grandmother", "color": "#E8726A", "voice": { ... }, "sheet": { ... } } ],
  "vehicles": [ { "v": 1, "id": "rides.night-cab", "family": "car4", "class": "taxi", ... } ],   // or { "stock": "vandal" }
  "acts": [ { "id": "act1", "timeline": { ... }, "end": { ... }, "missions": [ ... ] } ],
  "voices": {}
}
```

### People

Each person in `cast` is one of three kinds:

- **A seen person** has a Character Forge `sheet`, whose rules are in `../scripts/forge/character-sheet.schema.json`.
  The sheet's `id` equals the cast `id`, and its `voice.id` equals the voice block's `id`. The forge builds the GLB.
  On the street the person plays their sheet's `posture.idle`, walks with `posture.walk` when a step moves them, sits
  in a car, and talks (the `talk` / `sitTalk` clips and a moving jaw) while one of their lines is on screen.
- **A shipped person** is `"model": "mogcity/<name>"` with no sheet: a hand-polished person from the cast registry
  (`cast/README.md`: Mog City's Dan, Jane, Mr. Big, Gears, Fiona, the Suits, and Moon the dog as a pet), with their own
  GLB, clips, face rig, props and recorded lines. A Mog that changes how one of them looks replaces them with a forged
  sheet from their seed and the registry's anchor.
- **A voice-only person** is `"voiceOnly": true` with no sheet. They can call and speak but never appear: the gate
  refuses them as a passenger, as an npc and in a close-up.

`voice` is a Kokoro block (`kokoro` or a `blend` of up to 3 voices, plus `speed`, `pitch` and a `description`). The
browser voice pass renders every line in it (`voices/README.md`). A changed block re-renders only that person's lines.
Night Shift's three voices sit at median pitches of 92, 115 and 169 Hz.

Any age (16 to 92) and any build works. When an age, a weight or a face word presses the lips or the lids together
past what the face finder reads, the forge carries those landmarks from the base body instead (the mesh is the same
everywhere), and uses the finder's own answer only when the two agree. The GLB records which one it used
(`extras.forge.landmarks.source`), and the engine's face takes the forge's numbers where it was carried. A sweep of 80
random sheets (ages 16 to 92, every frame, weight and muscle) builds with 0 failures; 5 of them needed the carry.

#### The forge in the creator's browser

The forge's modules (`compile`, `core`, `post`, `diet`, `targets`, `landmarks`, `library`) use no Node API. They run on
a platform object: `env-node.mjs` for the CLI, `env-browser.mjs` for a browser (`pipeline.mjs` runs the steps). Both
read the same static files: the asset library (`/assets/`) and the forge kit (`/storykit/forge/kit/`: the face targets,
the two rig templates and Dan's frame, made by `npm run storykit:forge-kit`). `forge.mjs` is now a thin Node wrapper
round `pipeline.mjs`.

```js
import { forge } from '/storykit/forge/forge.js';      // npm run storykit:forge-web builds it (storykit:pack does too)
const { glb, rec } = await forge(sheet);                 // glb: Uint8Array; rec: times, size, clamps, landmarks, checks
```

`/storykit/forge/?sheet=<url>&auto=1` is a bare page that forges a sheet and offers the GLB for download. For Mrs. Kwon,
the browser build matches the Node build exactly in every accessor (521,726 values), node, skin, material and extra.
Only the WebP textures differ, because the two use different encoders: alpha is identical, and the visible colour
differs by 0.002 to 1.2 levels on average (up to 3.8 under the soft edges of the brows and hair). It takes 3.4 to 3.6 s in
headless Chrome and 2.5 s in Node. `.scratch/storykit/fb/forge-browser.mts` (under the Chrome lock) and `glbdiff.mjs`
repeat the check.

### Vehicles

A vehicle is either a full vehicle sheet (see `vehicles/README.md`; `sheets/night-cab.json` is the cab) or
`{ "stock": "trailhand" | "vandal" | "roadster" }`.

- Each mission names one with `vehicle`, or uses `on-foot`.
- The mission's `verbs`, plus the verbs implied by its steps and written in its text, must be possible on that ride,
  or the gate refuses the pack. For example, an escape needs a vehicle, and boost needs `abilities: ["boost"]`.

### Places

A place is always a name: `"@les"`, or `{ "@": "bowery", "face": "ludlow" }`. The keys are each city's list in
`pack/cities.ts`.

- A `drive` can't go to a `foot` place (one off the lanes) or a `startOnly` place (the FDR).
- In a label, another city's name is refused; in dialogue it is only a warning. "Houston" is New York's Houston St
  here, not Texas.

### Missions and steps

A mission is `{ id, title, vehicle, verbs, start, traffic, stakes, passLine, reward, steps }`. The step kinds are the
schema's (`pack/schema.mjs`); `BUILDER.md` says how Mog City plays each one, and which kinds Mog City has no part for
yet. Speakers are cast ids. Night Shift uses these:

| want | write |
|---|---|
| a line under the action | `{ "type": "say", "who": "kwon", "text": "...", "secs": 3 }` |
| a call while driving, answered, then a timed choice | a `drive` with `during: [{ "at": 3, "type": "call", "who": "ray", "lines": [{ "who": "ray", "text": "..." }], "choice": { "who": "ray", "prompt": "...", "timeout": 7, "default": 0, "options": [{ "text": "...", "reply": "...", "set": { "meters": { "trust": 5 } } }] }, "voicemail": { "text": "..." } }]` |
| a timed choice | `{ "type": "choice", "who": "kwon", "prompt": "...", "timeout": 8, "default": 0, "flag": "bag", "options": [...] }` |
| someone waiting at the kerb beside the car | `{ "type": "npc", "who": "kwon", "id": "kwon-kerb", "at": { "rel": "player", "right": 3.4, "fwd": 0.8 } }` (right of the car is the kerb; they face the car) |
| a close-up of them talking | `{ "type": "cutscene", "shots": [{ "cam": { "rel": "kwon", "fwd": 1.05, "right": 0.22 }, "look": { "rel": "kwon", "up": -0.04 }, "fov": 30, "dur": 3.8, "say": "kwon", "line": "..." }] }` (`rel: <cast id>` is that person's eyes, in their frame) |
| a chase to lose | `{ "type": "pursuit", "goal": "lose", "count": 1, "level": 1, "kind": "crew", "loseDist": 150, "loseTime": 3.5, "los": 4 }` |
| a street fight on foot | `{ "type": "fight", "enemies": ["vance", "marko", "tomas"], "arena": "@the-corner", "win": "ko-all", "timer": 180 }` (or `"win": "survive"` with its `timer`; `"rules": "lesson"` for a forgiving first fight) |
| one of Mog City's own set pieces | `{ "type": "scene", "name": "m1.arrival" }` (a Mog of Mog City, with Dan as the hero) |

Missions follow one another Mog City's way: MISSION PASSED, then free roam to the next mission's marker.

### Fights

`fight` is Mog City's street fighting (`W.combat`: freeflow strikes, heavies, the counter on a yellow cue, the dodge
that is the only answer to a red one, knockdowns, KOs, the fight's camera). It works for any pack's hero and any of its
people as the other side, because they all stand on the 66-bone cast rig and move with the shared clip pack: a forged
person, or a shipped one from the cast registry (Mog City's own Suits as their own men). A Mog that reskins or renames
a man keeps the fight as it is. Melee only: no weapons. The gate refuses the hero as an enemy, a voice-only enemy,
someone not in the cast, an arena the city does not have and a survive fight without a timer; `fight` is a verb every
ride can do (the hero gets out of the car). `packs/test-fight.json` ("Corner Work") is the gate's worked example.

### Text

Every text field has a length limit. Markup, unknown `{tokens}`, blocked words and the never-mention list are refused,
and so is any likeness ("looks like", "played by", a likeness field). Real names outside the cast fields still need
the names check that episodes get.

## The builder (CREATE A WORLD and MOG)

Behind the server switch `STORYKIT=on` (off by default: the build route then refuses a story build before anything is
spent, and every other build is unchanged; `STORYKIT=owner` opens all of it to the owner's /admin session only, see
`lib/storykit-switch.ts` and `docs/RULES.md` 1h), the build route writes packs with GameMog's builder model (`GAME_MODEL`,
the existing route, its slots, day cap and pass limit):

```
POST /api/generate { prompt, storykit: { city: "ny" }, consent }            CREATE A WORLD (New York; San Francisco is refused for now)
POST /api/generate { mogOf: <story world slug>, prompt, consent }           MOG: the parent's city, locked
```

`lib/storykit-build.ts` gives the model its own system prompt: `BUILDER.md` (the pack, places, the city rule, the
rename rule, verbs, people, voices, rides, dressing, steps, words, the Dognapped lessons), New York's place list, the anchors, the Kokoro voice table, the three schemas and Night Shift as the worked example (about
106 K characters, cached). Each reply (a meta block and the pack) is held to the platform's fields (the id; a Mog's
parent; the base: the picked city's, or the parent's copied and refused if changed), `gatePack` (with the parent), a
Create's 6 to 9 missions, no em dash, the vehicle brand rule, and real people and brands (the reply's own lists plus an
independent names check of what it wrote; on a Mog only the texts it did not inherit; consented people allowed). A
refused reply goes back with every problem, up to 3 passes. A passed pack is stored as a GameMog draft (module
`GameMog.world({ storykit: <pack> });`, meta `mode: 'storykit'`, `storykit: { city, pack: <store draft id>, ... }`)
and as a Story Kit store draft whose id and write token reach the creator's page once (`done.story`). What a Mog
inherits by hash is in the draft's report (`inherit`): each person's sheet and voice, each line's clip name, each
ride, and what is left for the browser (`todo.forge`, `todo.voice`); the store carries the parent's GLBs and clips
over without copying bytes.

`npm run storykit:builder-check` runs it all against a stand-in model on 127.0.0.1 (no paid call): the switch, San
Francisco refused, a good Create in New York on `mogcity-1`, a good Mog of Night Shift (a new person, a new car,
Christmas), and
bad replies sent back and fixed (Chicago labels in New York, a bike called a car, an unknown place, a real person), and
a Mog that keeps moving the city refused to the pass limit.

## The creator's browser's work, publishing and playing (end to end)

When a story build's draft arrives (`done.story`: the store draft and its write token), the creator's page
(`app/create/story-work.ts`, from `useGeneration`) opens `public/storykit/work.html?draft=<id>&embed=1#t=<token>` in a
frame it keeps out of sight, and the build show follows it (Cast, Voices, Test drive, Key art). `work.js` does, in that
browser, only what is not stored yet (so the page can be reopened on the same draft and carries on):

1. **Forge:** each person without a GLB: `forge/forge.js` -> `PUT files/glb/<cast id>`; then every person's headshot
   (`forge/portrait.html`, from the stored GLB) -> `PUT files/art/head-<cast id>.jpg`, shown on their card.
2. **Voices:** `voices/studio.html?draft=<id>&auto=1` in a hidden frame: every line without a clip, stored.
3. **Test drive:** the draft is sealed and framed on Mog City (`<mc>/?pack=<sealed world>&host=<site>&autopilot=1
   &autoanswer=1&autochoose=0 ... &keyart=1`). Mog City's runner drives it and posts ready, mission-start, progress,
   mission-fail, mission-end, keyart, result and story-end; the work page listens to Mog City's origin only. The limits
   count only time the tab is in front: 90 s with no progress on a step, 6 min per mission, 60 s between missions,
   2 min to load, 20 min in all; it stops at the first stuck or failed mission with the reason.
4. **Key art:** Mog City sends its frames in the `keyart` message -> `PUT files/art/key-wide.jpg`, `key-square.jpg`.
   Since 5 Nov (mogcity branch) the frame is a staged hero shot: a low three-quarter front of the hero car on a long
   lens, its face lit, the HUD hidden (the chase camera's view when no side is clear).
5. **Report:** `POST /api/storykit/drafts/<id>/report { missions, errors, ms, stages }`. The GameMog draft made with
   that store draft (`lib/storykit-publish.ts`) gets it as its test drive (`passed` only when every mission passed with
   0 page errors, for its exact code), the plain frame as its cover, and the frames titled in Mog City's lockup
   (`lib/story-art.ts`: graded, edges thrown out of focus, the title with its last word in gold, the kicker as the tag
   line) as its key art, wide and square. A story world published before this is titled the first time its cover is
   asked for (`titleStoryArt`, `app/g/[slug]/cover`). The draft result then shows.

`GET /api/storykit/drafts/<id>/source` (with the token) gives the work page the gated source pack (the sheets).

**Publishing** (`POST /api/games`, as every draft): a story draft's store draft is sealed and kept with the game (never
swept), and the game's meta names the sealed world (`storykit.world`, its SHA-256). With the switch off a story draft
is not published (409). **Playing:** `/g/<slug>/play`, `/d/<id>/play` and the game page frame
`https://mc.gamemog.com/?pack=<site>/storykit/f/<sha256>.json&host=<site>&game=<id>` (a draft is sealed as it is
played). `/storykit/f/*` answers CORS for Mog City's origin only. A play counts once, when a mission of that exact world
passes. A **Mog** of a published story world opens its store draft with that kept world as parent: unchanged people keep
their GLBs and unchanged lines their clips.

## What is still stubbed

- **Mog City's runner** does not send `hidden` or `error` yet: the work page is ready for both and pauses on its own
  tab's visibility either way.
- **Step kinds** Mog City has no part for (`BUILDER.md`) pass at once without playing; the gate warns, the builder
  refuses them in a new Create.
- **Weather** other than clear is kept as the pack's setting; Mog City draws none yet (the owner sees it before it ships).
- **San Francisco** is kept as a module for later (`cities/sf/`); stories are New York only.
- **Voices:** a choice's prompt is not voiced; the voices were checked by pitch and timing, not by ear.
- **The creator's work needs the tab open** (most of it the test drive), in a desktop browser with WebGPU.
