# The story runner's tools

`wagmi/storyrun` plays a Story Kit world (a sealed runner pack from GameMog's world store) on Mog City's own engine and
presentation. It is loaded only with `?pack=`; without it the game is exactly mc.gamemog.com.

## Test worlds (`test-packs/`)

- `native.json`: Mog City's own people (Dan, Jane, a Suit) on Dan's roadster. Two missions: a drive with Jane on the car
  phone (a recorded line), a cutscene, a choice, a DM, then a search, a fight and a transition card.
- `night-shift/world.json`: the Story Kit's Night Shift world: three forged people (the hero among them), a vehicle-sheet
  cab, 24 Kokoro clips, a chase. Its `.glb` and `.ogg` files are not committed. Copy them from the Story Kit branch:

  ```
  SK=/Users/sheed/Desktop/GameMog-storykit/public/storykit
  cp $SK/cast/test-night-shift/*.glb tools/storyrun/test-packs/night-shift/
  mkdir -p tools/storyrun/test-packs/night-shift/voice && cp $SK/packs/test-night-shift/voice/*.ogg tools/storyrun/test-packs/night-shift/voice/
  ```

On a local server (`python3 -m http.server 4981 --bind 127.0.0.1` in the repo):
`http://127.0.0.1:4981/?pack=/tools/storyrun/test-packs/native.json`.

## The test drive (`drive.mts`)

Under the shared Chrome lock, from the GameMog checkout:

```
node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts \
  <repo>/tools/storyrun/drive.mts http://127.0.0.1:4981/ /tools/storyrun/test-packs/night-shift/world.json <shots prefix> 220
```

It loads the world with `&nogate&trailer=0&autopilot=1&autocard=1&flowfast=1`, prints every message the game would post
to a framing GameMog (`ready`, `mission-start`, `progress`, `mission-fail`, `mission-end`, `story-end`), the page's
errors and the autopilot's nudges, and saves a JPEG every 20 s.

## Address switches

| Switch | What it does |
|---|---|
| `?pack=<world>` | the world (allow.js: sealed `/storykit/f/<sha256>.json` on gamemog.com; locally also the dev host's drafts and these test worlds) |
| `&host=<origin>&game=<id>` | the framing GameMog (messages go there only) and its game id (`result` messages) |
| `&mission=<ID>` | start at that mission |
| `&nogate` | no start gate |
| `&autopilot=1` | the test drive (autopilot.js); with it calls are answered and the first choice taken |
| `&autoanswer=1`, `&autochoose=<n>` | answer calls; take option n of every choice |
| `&autocard=1`, `&flowfast=1` | short cards; no free roam between missions |
| `&missionsecs=<s>` | the test drive's time limit per mission (240) |
| `&keyart=1` | under the autopilot, a wide and a square JPEG of the first drive, posted as `keyart` |
