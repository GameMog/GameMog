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
