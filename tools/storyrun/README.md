# The story runner's tools

`wagmi/storyrun` plays a Story Kit world (a sealed runner pack from GameMog's world store) on Mog City's own engine and
presentation. It is loaded only with `?pack=`; without it the game is exactly mc.gamemog.com.

## Test worlds (`test-packs/`)

- `native.json`: Mog City's own people (Dan, Jane, a Suit) on Dan's roadster. Two missions: a drive with Jane on the car
  phone (a recorded line), a cutscene, a choice, a DM, then a search, a fight and a transition card.
- `night-shift/world.json`: the Story Kit's Night Shift world: three forged people (the hero among them), a vehicle-sheet
  cab, 24 Kokoro clips, a chase. Its `.glb` and `.ogg` files are not committed. Copy them from the Story Kit branch:

  ```
  SK=$GAMEMOG_DIR/public/storykit      # GAMEMOG_DIR: a GameMog checkout with the Story Kit
  cp $SK/cast/test-night-shift/*.glb tools/storyrun/test-packs/night-shift/
  mkdir -p tools/storyrun/test-packs/night-shift/voice && cp $SK/packs/test-night-shift/voice/*.ogg tools/storyrun/test-packs/night-shift/voice/
  ```
- `tow.json`: Night Hook, two tows in a vehicle-sheet wrecker (the Story Kit's `wrecker` sheet: tow rig, light bar,
  opening doors): TW-1 hooks a stalled van (a ride of the world's, from its sheet) on 6th Ave and tows it to 11th Ave;
  TW-2 a blue sedan (the city's own body) to Chelsea Park. Both pass under the autopilot (`&autopilot=1&mission=TW-1`).
- `dressing-*.json`: still worlds (one mission that waits) for the set dressing (`wagmi/storyrun/dressing.js`), each
  with the look its `dressing` asks for: `blackout` (midnight, `blackout: "midtown"`), `christmas` (midnight,
  `holiday: ["christmas"]`), `xmasday` (the same at midday, for the hats), `snow` (midday), `rain` (twilight), and
  the city as it is at the same times for the before shots: `night`, `day`, `dusk`. A world without these words (or
  in the clear) is never dressed: `node --test tests/dressing.test.mjs`.

- `sf2040.json`: **SF 2040** (San Francisco, `?city=sf`), the owner's post-impact story: Cal Mercer rides Ranger (the
  world's car `{ "model": "mogcity/horse" }`) through the city after the asteroid Erebus, looking for his wife Nina and
  their daughter June, and finds the Iron Saints steering the Bio-Preserve's creatures with WARDEN-7's tone. An opening
  at the Embarcadero camp, then six missions in three acts, each with its own verb: Market Street (mount, gaits, collect
  in the saddle, the first saddle fight), Quiet Hooves (`sneak` past the Brood Mother's nest, medicine, Nina's note, the
  Brood Mother), Wild Horses (Old Silver, June's backpack, `drove` the herd into the corral), The Shepherd (WARDEN-7,
  three relays against a clock, the choice, Hollis's confession), Lafayette Park (`track` June's whistle, `flee` The
  Matriarch downhill and fight her, the reunion), Homecoming (hold the camp: three `waves`, Deacon Vale last), then a
  `coda`. Radio on the rides (`during` calls) and between missions (`between.radio`). Its design:
  `.scratch/story2/DESIGN.md`. `dressing.apocalypse: "dusk"`. Play it at
  `/?city=sf&pack=/tools/storyrun/test-packs/sf2040.json` (`&autopilot=1&autocard=1&flowfast=1` for the test drive).
  Stand-ins: Cal is Dan's body, Nina is Jane's, Hollis is Gears'; June is GameMog's hand-built `young-mother` body
  (`sf2040/june.glb`, credits beside it) stood at 0.88 (the cast's `scale`) until she has a body of her own. Street
  cutscenes take a shot's `act` as a set's do (`walk` to a point, `hug`: the reunion), and a lair boss's wake is framed
  by a short beat (`wakeShot: false` leaves it out).
- `sf-steps.json`: the SF 2040 steps close together by the Ferry Building (a test drive of about a minute): collect in
  the saddle, dismount, collect on foot, mount, a herd, two knights and a held scorpion boss.

### The SF 2040 steps (San Francisco; `node --test tests/storyrun-sf2040.test.mjs`)

- `fight` with `foes` and/or `boss`: the library's creatures (`creature-knight`, `-ogre`, `-centaur`, `-ape`, `-mech`,
  `-scorpion`, `-trex`) through `W.creatures`: `foes: [id | { id, count, height, name, heavy, stats }]` round the
  `arena`, `boss: { id, name, height, phases: [0.66, 0.33], stats, at: '@place', hold: { wake, leash } }` under the boss
  bar (with `hold` it waits in its lair until he comes within `wake` m or hits it, then fights within `leash` m of
  home). `wake: [who, line]` is said when it wakes; `counter`, `barks`, `hp`, `timer`, `why` as a fight of men. Done when
  every one is down. At most 8 creatures; refused outside San Francisco. A fight of men (`enemies`) is unchanged.
- `collect`: `{ kind, label, items: ['@place' | [x, z] | { at: [x, z], name }], need, look: crate | case | bag | can,
  color, radius, objective, barks }`: glowing pickups with a beam, on the radar, the route to the nearest one left, the
  tally on the HUD ('FOOD 3/5'), taken on foot or in the saddle (1.6 m further). Done when `need` (all) are taken.
- `mount` (`at`: Ranger stood there first) and `dismount`; `walk` with `enterCar` / `leaveCar` say Mount / dismount on a
  horse. Every leg, chase and the GPS work in the saddle: the horse is the car entity (wagmi/horse).
- `herd`: `{ id, creature: 'creature-horse', at, count, radius }` wildlife for the mission (gone when it ends, or with
  `{ type: 'herd', remove: id }`). For a set piece: `hold: true` keeps each where it stands, never running (WARDEN-7's
  dead hulk); `walkTo: '@place' | [x, z]` walks them there together; `scatter: true` sends each its own way. A herd
  step naming a standing herd's `id` and no `at` changes what that herd does (M4's consequence beat).
- `mount` takes `arm: 'bat' | 'bottle'` (something in his hand for the saddle's blows: J from the saddle).

### The wild steps (the verbs of SF 2040's rides; each tells the test drive what it needs in `M.wild`)

- `sneak`: `{ to, radius, sleepers: [{ id, at, name, height, yaw, ears }], objective, help, warn: [who, text], why, woke }`
  past sleeping creatures to a place. Each hears him within a distance set by his gait (a horse's walk 6 m, trot 17,
  gallop 36; a man walking 6, running 11) times its `ears`; while one does, the NOISE bar fills (faster the nearer), and
  drains when none does. At half it stirs (a growl, `warn`); full, or hit, they wake: the step fails (`why`, the tip:
  walk with Q) or, with `woke: <step id>`, goes there. They are on the radar, and gone when the step ends.
- `flee`: `{ to, radius, creature: { id, name, height, boss, phases, stats, at }, behind, speed, catch, grace, keep,
  objective, alert, barks: { <secs in>: [who, text] } }` a creature on his heels to a place (from its `at`, else `behind` m back). It is never quite as fast
  as a gallop (`speed`, 11) and gains on anything slower; far behind (32 m) it closes up. Within `catch` m of its body
  for `grace` s in all it has him (fails, tip: gallop); knocked out fails too. A bar shows how close it is. `keep: true`
  (with an `id`) keeps it for the next fight: that fight's `boss.from: <the flee's id>` fights the same creature.
- `drove`: `{ herd: <a herd step's id>, to, radius, need, pull, label, objective, help, barks }` a herd driven into a
  pen: they run from him, so he rides round behind them; running and near him they drift toward the pen (`pull` m/s);
  in, they stay. The route leads behind the herd, the pen is a green ring; the counter keeps the tally ('HORSES 2/3').
- `track`: `{ at, radius, label, cue: 'whistle' | 'ding', every, objective, help, hint }` something heard, not seen: no
  route, a bar that fills as he nears, and a sound from the place every `every` s (the whistle's three short blasts,
  louder and brighter as he nears) with 'Warmer' / 'Colder'. After `hint` s (90) the route is given.
- `fight` takes `waves: [{ foes, boss, from, pause, say, alert, objective, wake }]`: after the step's own foes and boss
  (if any), each wave comes in turn once the last is down, `pause` s later (5), running in from its `from` place, its
  `say` line in the breather; he gets back a third of what he lost between waves. The counter shows WAVE n/N. A boss
  (in a wave or not) with `from: <flee id>` is the creature that flee kept.

### Between missions, Continue, the coda

- a mission's `between.radio: [[who, text], ...]` is said over the radio a few seconds into the free roam before it
  (`radioAt` s, 4), cut off when he reaches the start.
- Continue: every checkpoint reached is saved (`mc.pack.<id>.v1`'s `resume`, the runner's snapshot); loading the story
  again (no `?mission=`, no test drive) puts him back in that mission at that checkpoint, under a CONTINUE card. Passing
  the mission clears it. `&nosave` leaves the save alone.
- a world's `coda` (an opening's shape: `place`, `shots`) plays after STORY COMPLETE and the title: a post-credits
  scene.
- the test drive's `&fair=1`: fights and chases without the autopilot's help (no health topped up, no finishing blow),
  to see whether a fight can be won by a player pressing J; `&realpace=1` with it for a player's pace.

On a local server (`python3 -m http.server 4981 --bind 127.0.0.1` in the repo):
`http://127.0.0.1:4981/?pack=/tools/storyrun/test-packs/native.json`.

- `packs/mog-city.json` (repo root, committed): Mog City's own story as a world, the parity world: the opening and
  Missions 1-3 (Bagged, Burner, Occupied). Its cutscenes are `scene` steps naming Mog City's own set pieces (`opening`,
  `m1.arrival`, `m1.tracker`, `m2.start`, `m2.crash`, `m2.chat`, `m3.garage`, `m3.rally`, `m3.dump`, `m3.home`; `m1.park`
  as a step's `dress`, `m1.van` as the drive's `dressNear` 320 m out), its car-phone calls are Mog City's own by id
  (`{ "type": "call", "ref": "m1-drive" }`; a mission's `between.step` 'free:J' / 'free:G' rings m2-handoff and
  m3-handoff on the way to the J and the G). Mission 1's steps are the runner's own on Mog City's parts (the drive's
  area cards are its `areas`, the get-in its `from.getIn`); Missions 2 and 3's play steps name Mog City's own mission
  phases by `ref` (`m2.go`, `m2.tail`, `m2.yard`, `m2.fight`, `m2.chase`, `m2.phone`, `m3.square`, `m3.rigs`,
  `m3.escape`, `m3.ret`: m2.js / m3.js `playPart`, their own rules, objectives, calls and fail reasons). A mission's
  `after` is its afterword (DMs, a line) after MISSION PASSED; its `pass.stats` take `{ label, stat, of }` or
  `{ label, value }`. Read from the game's own origin on any host: `?pack=/packs/mog-city.json`.

## A sealed world from a local Story Kit store

A store's world and its files are content-addressed (`/storykit/f/<sha256>.<ext>`). Copy the world's blobs (the store's
`files` rows for the draft) into one folder, serve the repo with `/storykit/f/` mapped to that folder, and pass the
server as the dev host: `?pack=/storykit/f/<world hash>.json&host=http://127.0.0.1:4981`.

## The test drive (`drive.mts`)

Under the shared Chrome lock, from the GameMog checkout:

```
node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts \
  <repo>/tools/storyrun/drive.mts http://127.0.0.1:4981/ /tools/storyrun/test-packs/night-shift/world.json <shots prefix> 220
```

It loads the world with `&nogate&trailer=0&autopilot=1&autocard=1&flowfast=1`, prints every message the game would post
to a framing GameMog (`ready`, `mission-start`, `progress`, `mission-fail`, `mission-end`, `story-end`), the page's
errors and the autopilot's nudges, and saves a JPEG every 20 s.

## Side by side (`parity.mts`) and stills (`moments.mts`)

`parity.mts <base> ship|pack <prefix> [moments]` takes the same moments in the shipped game (`?m1=...`) and in
`packs/mog-city.json` (`&step=...`): the opening at 22 s, Mr. Big's study at 52 s, Jane's call, the fight, the tracker
close-up, MISSION PASSED. `moments.mts <base> <world> <prefix> [query]` takes a world's gate, first call, choice, night
drive, cutscene close-up and MISSION PASSED.

`parity23.mts <base> ship|pack <prefix> <moments>` does the same for Missions 2 and 3 (`m2meet`, `m2tail`, `m2yard`,
`m2fight`, `m2chase`, `m2chat`, `m2passed`, `m3garage`, `m3rigs`, `m3escape`, `m3passed`; the shipped game at
`?nointro&m2=...` / `?m3=...`, the world at `&mission=M2&step=...`). `m1diff.mts <base> ship|pack <prefix>` checks
Mission 1's get-in, its Garment District card and the van at the park 320 m out in both.

A test drive of a long mission inside the 4-minute Chrome budget: `drive.mts ... 225 "mission=M2&skipscenes=4&missionsecs=600"`
(authored scenes skipped after 4 s, as a held Space would); `flowfast=0&autocontinue=1` plays the free roam between
missions too (the test drive is put down by the next one's corona).

## Address switches

| Switch | What it does |
|---|---|
| `?pack=<world>` | the world (allow.js: sealed `/storykit/f/<sha256>.json` on gamemog.com; locally also the dev host's drafts and these test worlds) |
| `&host=<origin>&game=<id>` | the framing GameMog (messages go there only) and its game id (`result` messages) |
| `&mission=<ID>` | start at that mission |
| `&step=<id>` | start that mission at that step, where the step's `from` puts him (`{ car, dan }` marks, or a place) |
| `&nogate` | no start gate |
| `&autopilot=1` | the test drive (autopilot.js); with it calls are answered and the first choice taken |
| `&autoanswer=1`, `&autochoose=<n>` | answer calls; take option n of every choice |
| `&autocard=1`, `&flowfast=1` | short cards; no free roam between missions |
| `&missionsecs=<s>` | the test drive's time limit per mission (240) |
| `&skipscenes=<s>` | under the autopilot, each authored scene skipped after s seconds |
| `&keyart=1` | under the autopilot, a wide and a square JPEG of the first drive, posted as `keyart` |
| `&realpace=1` | under the autopilot, a player's pace: no leg jumped, a sneak walked round its sleepers |
| `&fair=1` | under the autopilot, no health topped up and no finishing blow (is the fight winnable?) |
| `&nosave` | no Continue checkpoint saved |
