# The story runner: reference

`wagmi/storyrun/` plays a Story Kit world on Mog City's own engine and presentation. A Story Kit world is a sealed
runner pack from GameMog's world store. The runner loads only when the address has `?pack=`. Without it, nothing in
`wagmi/storyrun/` is imported and the game is exactly mc.gamemog.com.

The pack format, the gate, the store and how GameMog frames this game are on GameMog's `main` branch:

- `storykit/README.md`: the pack format and the gate;
- `storykit/BUILDER.md`: how each step plays, written for authors;
- `docs/STORYKIT-ARCHITECTURE.md`: the store, publishing, and the play frame.

This file is the runtime side: the step kinds, the address switches, the messages, the sets and the test tools.

GameMog's first showcase world, **Pickup Time** (gamemog.com/g/pickup-time: 15 missions, the Vantor GT, sets, the
money meter), is what most of the November work was built for. Its screenshots are on GameMog's `main` in
`docs/media/pickup-time/`.

## The modules

| file | what it does |
|---|---|
| `index.js` | `install(W)`: the HUD, the start gate with the world's title, the places, the cast, the voices and the HUD additions. Then it plays the opening and the acts in order, with free roam between missions, the per-world save (`localStorage` `mc.pack.<id>.v1`), Mission select and the end card. |
| `pack.js` | `load()`: fetches `?pack=`, checks the SHA-256 against a content-addressed name, and validates the shape (`check()`). A refused world falls back to plain Mog City. |
| `allow.js` | which `?pack=` and `?host=` addresses are read, and which files a pack may name (`packUrl`, `hostOf`, `assetUrl`) |
| `runner.js` | `createRunner(ctx)`: plays one mission step by step (the `STEPS` table below), plus the opening, checkpoints, retry and fail |
| `rules.js` | the play rules as pure functions: the money and meter text, named timers, sight cones, the convoy band, the passenger speed rule, the MISSION PASSED card. Tested offline. |
| `hud.js` | what Mog City's HUD lacked: a timer chip (with LATE), meter pills, the timed choice panel |
| `host.js` | messages to the framing GameMog (below) |
| `autopilot.js` | the test drive (`?autopilot=1`) |
| `cast.js`, `ride.js`, `places.js`, `pet.js` | people (Mog City's own natively, forged or hand-built ones from the world's GLBs), the sheet car, New York's place names, a pet that follows the hero |
| `gt.js`, `vantor.js` | the Vantor GT. `gt.js` is a built body. `vantor.js` uses a downloaded body (`car: { model: 'mogcity/gt' }`; `body: 'built'` picks `gt.js`), de-badged, CC BY 4.0, credits in `assets/vehicles/vantor/CREDITS.md`. Its electric mode (Q) plays a quiet electric motor. |
| `sets.js`, `setkit.js`, `rooms.js` | cutscenes staged in rooms and closed exteriors (below) |
| `dressing.js`, `nightlit.js` | what the city wears (blackout, Christmas, snow, rain), and a readable lit night for story worlds only |
| `juice.js` | the action beats' punch: alerts, slow motion, NEAR MISS. It never changes a rule. |
| `title.js` | the world's own title in the lockup's lettering. Mog City is the engine, never the world's name. |
| `cond.js` | conditions and values (`'flag'`, `'cash >= 40'`, `'done:M2'`) for `if`, `set` and branches |

## Steps

A mission is `{ id, title, vehicle, time, stakes, passLine, reward, steps }`. Steps play in order.

These fields work on any step:

| field | what it does |
|---|---|
| `id` | names the step (for `goto` and `&step=`) |
| `if` | skips the step unless the condition holds (`cond.js`) |
| `checkpoint: true` | Retry restarts here |
| `objective` | the objective line |
| `help` | a hint |
| `during: [...]` | side steps that run alongside this step. Each has `at` (seconds in), and is ended with its step unless it has `persist` or `until`. |
| `do` | what a trigger runs |
| `after` | a `set` applied when a side step ends |
| `ref` | plays one of Mog City's own mission phases instead (`m2.tail`, `m3.escape` ...: `PART_REFS`) |
| `dress` | sets up one of Mog City's set pieces first |

These kinds also run in the background when they have nothing to reach or last: `trigger`, `comfort`, `stealth`
without `to`/`secs`, and `roadblock` without `to`. They stay active beside the steps after them.

The key fields of each kind, as `runner.js` reads them:

| kind | what it plays | key fields |
|---|---|---|
| `place` | puts the hero somewhere | `at` (a place, `mode` car/walk), `time`, `bonus` |
| `say` | a subtitle line, voiced when it has a clip | `who`, `text`, `secs`, `wait: false` (don't wait for it) |
| `wait` | a pause | `secs`, `call` (end early once the call is over) |
| `dm` | a text message | `from`, `text`, `secs`, `wait` |
| `set` | changes meters and flags | `set: { meters, flags }` |
| `label` / `goto` / `end` | a label, a jump, the end of the mission | `label`; `to`; `fail` (end as a failure, with that reason) |
| `timer` | a named timer (several may run across steps) | `name`, `seconds`, `label`, `fail` (`hard` fails; soft goes LATE and costs `set`), `why`, `stop`, `add`, `lateLabel`, `card`, `flag`, `radius`/`stopSpeed` (the arrival that stops it) |
| `drive` | drive to a place | `to`, `blip`, `areas` (place cards on the way), `dressNear`, `stopTimer`, `bonus`, `flag` |
| `stops` | several drive legs, each with its own `set` | `stops: [...]` |
| `walk` | on foot to a place | `to`, `radius`, `beam`, `enterCar`, `leaveCar` |
| `search` | search a spot, holding a key | `at`, `radius`, `secs`, `ring`, `noun`, `label`, `on`, `part` |
| `npc` | stands a cast member somewhere | `who`, `id`, `at` (`{ rel: 'player', right, fwd }` or a place), `remove` |
| `cutscene` | shots on the street or in a set | `shots` (each: `cam`, `to`, `look`, `lookTo`, `fov`, `dur`, `say`/`who`, `text`/`line`, `caption`, `card`, `title`, `where`, `act`, `at`, `heading`, `if`), `set` (a set: below), `place` |
| `beat` | one shot without bars | `say`, `shot`, `dur` |
| `vignette` | a short run of shots | `shots` |
| `transition` | a title card, optionally moving the clock | `kicker`, `clock`, `text`, `sub`, `secs`, `time`, `place`, `set` |
| `actEnd` | the act's card | `heading`, `title`, `quote`, `stats`, `minSecs`, `next` |
| `choice` | a timed choice | `who`, `prompt`, `timeout`, `default`, `flag`, `fork`, `silenceValue`, `silenceReply`, `options: [{ text, value, set, reply, goto }]` |
| `call` | the car phone, or a phone on foot | `who`, `lines`, `ref` (one of Mog City's calls), `auto`, `inCar`, `ring`, `interrupts` (call waiting), `extra`, `wrap`, `hold: { pause, resume }`, `wrapNear`/`hurryNear`, `choice`, `role` ('Voice note' ...), `decline`, `voicemail`, `answer` |
| `voicemail` / `voicenote` | a message played as a phone line | `who`, `text`, `secs`, `set` |
| `fight` | Mog City's street fighting | `enemies`, `arena`, `win` (`ko-all` \| `survive`), `timer`, `rules` (`lesson`), `hp`, `crewAt`, `reinforce`, `counter`, `barks`, `why` |
| `pursuit` | a chase | `goal` (`lose` ...), `level`, `kind`, `count`, `loseTime`, `alert`, `clear`, `to`, `until`, `bonus`, `flag` |
| `tail` | follow a car without being seen, with a distance meter to the destination | `route`, `car`, `color`, `name`, `id`, `speed`, `ring`, `lostDist`, `lostTime`, `spotTime` |
| `trigger` | fires when an area, a street or a condition is met | `area`, `street`, `when`, `cue`, `say`, `set`, `flag`, `do`, `once` |
| `scene` | one of Mog City's own set pieces by name (`SCENES`) | `name`, `time`, `chat`, `bonus`, `flag` |
| `passenger` | someone walks to the car, rides along and gets out | `who`, `board`, `from`, `to`, `seat`, `radius`, `pickObjective`, `limit`/`limitSecs`/`warn` (a speed rule), `comfort`, `drop`, `lead`, `car`, `fail`, `why`, `set`, `flag` |
| `comfort` | a passenger's comfort meter: braking and knocks drain it, smooth driving refills it | `who`, `label`, `drain`, `refill`, `start`, `lines`, `fail`, `why`, `car` |
| `tow` | hook a car and tow it | `target`, `to`, `name`, `back`, `secs`, `radius`, `hookObjective`, `dropObjective`, `bonus`, `flag` |
| `ally` | a friend's car drives itself to a place or to the hero | `who`, `ally`, `name`, `from`, `to` (`'player'`), `out`, `flag` |
| `convoy` | stay with an ally's car | `ally`, `route`, `band` [near, far], `speed`, `hp`, `knock`, `hitLine`, `wreckWhy`, `drain`, `refill`, `label`, `fail`, `why` |
| `stealth` | Mog City's lookouts, with sight cones and a detection bar ('?' to '!') | `units`, `to` or `secs`, `grace`, `detect`, `onDetect` (`{ set }`, `{ goto }`, `{ pursuit }`), `hint`, `radius`, `label`, `meter`, `why` |
| `car` | parks a car as dressing | `id`, `name`, `car`, `at`, `heading`, `kerb`, `color`, `back`, `remove` |
| `roadblock` | cars across a street. The GPS routes round it, and a ram at speed goes through. | `at`, `cars`, `kind`, `r`, `crew`, `text`, `ram`, `ramSpeed`, `to`, `back`, `flag` |
| `patrol`, `wallet` | no Mog City part yet (`KINDS_STUB`). They say so in the console and pass. | `set` |

`passenger` is defined twice in `runner.js`. The second definition, the full pick-up, ride and drop-off, is the one
that runs.

### Cards and meters

- **MISSION PASSED** (`rules.js passCard`) shows the money gained, each meter's change, the time, a bar toward the
  money goal, the pass line and the next mission's title and stakes.
- **Act cards** (`actEnd`) come between acts.
- **STORY COMPLETE** shows after the last mission, with the goal meters where they ended. Free roam follows.
- **The money meter** (`hud.meters`, `kind: 'money'`) reads `$632,000 / $1,000,000`.

## Sets and rooms

A cutscene's `set` (or the opening's `sets`) stages its shots in a room of their own, the way Mog City's opening
stages Mr. Big's study. Each set is drawn in place of the city's frame, so no traffic passes through a close-up.
`sets.js` lifts the world's cast out of the street into the set and puts them back afterwards. The hero appears as a
double.

```jsonc
"set": {
  "room": "bank-office",            // bank-office | school | hideout | pizzeria | apartment | garage | steps | park | lobby | plaza | alley
  "light": "day",                   // day | golden | night (else the city's time)
  "sign": "...",                    // lettering, in the story's own words
  "people": [ { "who": "pell", "at": [0.4, -1.2], "face": "john", "pose": "idle",
                "walk": { "to": [0, 0], "secs": 2 }, "hug": "<who>", "hold": { "who": "<who>", "side": "L" } } ]
}
```

- `rooms.js` (`ROOMS`) lays each room out round x 0, z 0, with the windows at -z and the way in at +z. Each room has
  named marks.
- `setkit.js` builds the rooms from boxes, scanned CC0 surfaces and props (`assets/sets/`, see its `CREDITS.md`), and
  layers the city through the windows.
- Shot cameras work as they do on the street: `{ rel: '<who>' }` is relative to someone's head, and `'player'` is the
  hero.
- Arms rest at the sides after every pose. `tools/storyrun/arms.mts` checks this.

## Address switches

`index.js` (with `pack.js` and `host.js`), and `trailer.js` for `trailer`.

| switch | what it does |
|---|---|
| `?pack=<world>` | the world. Allowed: GameMog's sealed `/storykit/f/<sha256>.json`. Locally, also a dev host's drafts and these test worlds. |
| `&host=<origin>` | the framing GameMog. Messages go there only, if `allow.js hostOf` allows it. |
| `&game=<id>` | the game id named in `result` messages |
| `&mission=<ID>` | start at that mission |
| `&step=<id>` | start that mission at that step, where the step's `from` puts him |
| `&opening=0` / `=1` | leave out the world's opening / play it even when it would not play. By default it plays on a first start. |
| `&nogate` | no start gate. Also turns off the trailer. |
| `&trailer=1` / `only` | the cold-open trailer first / alone. Never with `nogate`, `nointro` or a mission switch. Test runs pass `trailer=0`. |
| `&autopilot=1` | the test drive (`autopilot.js`). It also answers calls, takes option 0 of every choice, and retries a failed mission automatically. |
| `&autoanswer=1` | answer every call |
| `&autochoose=<n>` | take option n of every choice |
| `&autocard=1` | short cards |
| `&flowfast=1` | no free roam between missions; short waits |
| `&autocontinue=1` | under the autopilot, plays the free roam between missions, driving into the next mission's marker |
| `&missionsecs=<s>` | the test drive's time limit per mission (240) |
| `&skipscenes=<s>` | under the autopilot, skips each authored scene after s seconds (as holding Space would) |
| `&realpace=1` | under the autopilot, a player's pace: no leg, tail or convoy jumped, a 20 m/s cruise. Use it to time what is timed to a player. |
| `&failstop` | under the autopilot, stops at the first failure instead of retrying (normally it stops after 3 fails, a timeout or a bad place) |
| `&stealthfair` | under the autopilot, no extra grace before a lookout's detection |
| `&keyart=1` | under the autopilot, a staged hero shot of the first drive (low 3/4 front of the hero car, the HUD hidden), posted as `keyart` |
| `&sandbox` | keeps the developers' mode keys 1 to 4 |

## Messages to the host (`host.js`)

Each message is `{ source: 'gamemog', type, ...data }`, sent with `postMessage` to `?host=` only, and only when the
page is framed. Nothing inbound is read.

| type | data |
|---|---|
| `ready` | `{ gameId, hash, story: { v: 2, ok, id, hash, clips \| why } }` |
| `mission-start` | `{ id, title }` |
| `progress` | `{ mission, step, kind, i, n }`, as each step starts |
| `mission-fail` | `{ id, why, step, kind }` (`timeout: true` from the test drive) |
| `mission-end` | `{ id, how, secs \| why }` |
| `result` | `{ game, mission, passed: true, story, secs }`, once per mission per session, only with `?game=` |
| `story-end` | `{ id }` |
| `keyart` | `{ wide, square }`, JPEG bytes as transferred ArrayBuffers |
| `hidden` | `{ hidden }`, the tab went behind or came back |
| `error` | `{ kind: 'page' \| 'rejection' \| 'load', message, where? }`, each distinct error once, 40 at most |

`W.storyrun.host` keeps the last 200 messages for a headless run to read.

## Test worlds (`test-packs/`)

- **`native.json`:** Mog City's own people (Dan, Jane, a Suit) on Dan's roadster. Two missions:
  - a drive with Jane on the car phone, a cutscene, a choice and a DM;
  - a search, a fight and a transition card.
- **`night-shift/world.json`:** the Story Kit's Night Shift: three forged people, a cab built from a vehicle sheet,
  24 Kokoro clips and a chase. Its `.glb` and `.ogg` files are not committed. Copy them from a GameMog checkout:

  ```
  SK=$GAMEMOG_DIR/public/storykit
  cp $SK/cast/test-night-shift/*.glb tools/storyrun/test-packs/night-shift/
  mkdir -p tools/storyrun/test-packs/night-shift/voice && cp $SK/packs/test-night-shift/voice/*.ogg tools/storyrun/test-packs/night-shift/voice/
  ```
- **`pickup-eng.json` ("Engine Check"):** each play step a long story needs, one mission each: the money meter, named
  timers, stealth, ally, convoy, passenger, roadblock, a parked car, triggers and calls. `tests/storyrun-rules.test.mjs`
  checks it.
- **`vantor-gt-day.json`, `vantor-gt-night.json`, `vantor-ext-day.json`, `vantor-ext-night.json`:** still worlds for
  the Vantor GT, built and downloaded bodies, by day and night.
- **`tow.json` ("Night Hook"):** two tows in a wrecker built from a vehicle sheet. Both pass under the autopilot
  (`&autopilot=1&mission=TW-1`).
- **`dressing-*.json`:** still worlds for the set dressing (`blackout`, `christmas`, `xmasday`, `snow`, `rain`), plus
  `night`, `day` and `dusk` for the before shots.
- **`pickup-time/world.json`:** Pickup Time as a local runner world. It is **not committed**. Make it from a GameMog
  checkout with `storykit/showcase/pickup-time/merge.mjs --no-write --runner <this repo>/tools/storyrun/test-packs/pickup-time/world.json`,
  then copy the GLBs from GameMog's `public/storykit/cast/hand/` into `pickup-time/cast/`. It needs its clips in
  `pickup-time/voice/` to be heard; without them, every line is a subtitle. `arms.mts` uses it, and
  `tests/storyrun.test.mjs` checks John only where it is present.
- **`packs/mog-city.json`** (at the repo root, committed): Mog City's own story as a world, the parity world. It holds
  the opening and Missions 1 to 3.
  - Its cutscenes are `scene` steps that name Mog City's own set pieces.
  - Its calls are Mog City's own, by `ref`.
  - Missions 2 and 3's steps name Mog City's mission phases by `ref` (`m2.tail`, `m3.escape` ...).
  - Read it as `?pack=/packs/mog-city.json`.

Run a local server (`python3 -m http.server 4981 --bind 127.0.0.1` in the repo), then open
`http://127.0.0.1:4981/?pack=/tools/storyrun/test-packs/native.json`.

To play a sealed world from a local Story Kit store, copy its blobs into one folder, serve `/storykit/f/` from that
folder, and pass the server as the host: `?pack=/storykit/f/<world hash>.json&host=http://127.0.0.1:4981`.

## Test tools

### Offline tests (`tests/`)

Run with `node --test <file>`. No browser needed.

| test | covers |
|---|---|
| `tests/storyrun.test.mjs` | what the runner reads, what it refuses (`pack.js check`, `allow.js`), and what it never says |
| `tests/storyrun-rules.test.mjs` | `rules.js`: money and meters, named timers, sight cones, the convoy band, the passenger speed rule, the MISSION PASSED card (including STORY COMPLETE's goal meters), the GPS's held-off streets, and the Engine Check world |
| `tests/dressing.test.mjs` | what a dressing may say, and that the city is dressed only when asked |
| `tests/story-default.test.mjs`, `tests/story-scrub.test.mjs` | Mog City's own story pack (`?story=`, `tools/story/`), the neighbour of `?pack=` |

`node --test tests/storyrun*.test.mjs tests/dressing.test.mjs` should pass before every commit to `wagmi/storyrun/`.

### Headless tools (`tools/storyrun/*.mts`)

These run in headless Chrome through GameMog's driver. Run them from a GameMog checkout, or set `GAMEMOG_DIR`, under a
one-Chrome lock where the machine has one:

```
node --import ./scripts/ts-resolve.mjs [<lock>] <mog city>/tools/storyrun/<tool>.mts <base url> ...
```

| tool | what it does |
|---|---|
| `drive.mts <base> <world> <prefix> [secs] [query]` | a world's test drive. It loads `?pack=<world>&nogate&trailer=0&autopilot=1&autocard=1&flowfast=1`, prints every host message, page error and autopilot nudge, and saves a JPEG every 20 s and at each mission's first travel step. Add `flowfast=0&autocontinue=1` to play the free roam too, or `"mission=M2&skipscenes=4&missionsecs=600"` for a long mission. |
| `arms.mts <base> [mission] [prefix]` | Pickup Time, starting from a save at a mission (PT-6 by default), under the test drive. After each step, once the hero is on foot (after a call, walk, set cutscene, fight, search, or getting in and out of the car), it checks that each wrist hangs at least 0.3 m below its shoulder and out at his side. Then it tests three ways in and out of the car. Exits 1 on any failure. |
| `moments.mts <base> <world> <prefix> [query]` | stills of a world: the start gate, the first call, the choice panel, a night drive, a cutscene close-up, MISSION PASSED |
| `parity.mts <base> ship\|pack <prefix> [moments]` | the shipped game (`?m1=...`) and `packs/mog-city.json` (`&step=...`) at the same Mission 1 moments, for side-by-side shots |
| `parity23.mts <base> ship\|pack <prefix> <moments>` | the same for Missions 2 and 3 (`m2meet`, `m2tail`, `m2yard`, `m2fight`, `m2chase`, `m2chat`, `m2passed`, `m3garage`, `m3rigs`, `m3escape`, `m3passed`) |
| `m1diff.mts <base> ship\|pack <prefix>` | Mission 1's get-in, its Garment District card, and the van at the park once 320 m out, in both |
