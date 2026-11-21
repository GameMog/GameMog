# Mog City: video calls

A story world's conversation can be a video call (a pack's `vcall` step, 18 Nov 2026). Everyone on it sits in an
office of their own, seen head and shoulders through their own webcam, in a call's layout: their tiles, their names,
the one talking lit, the subtitles under them, the call's bar on top and its controls at the foot. It hides what a
full-body scene asks of a made person (walking, hands, standing together) and suits the way people talk: over each
other. Action stays on the street.

| File | What it does |
|---|---|
| `wagmi/storyrun/vcall.js` | plays the step: the offices stood up (sets.js), the call's UI, the lines in turn (radio/turns.js), the call's events between them, hold Space to skip |
| `wagmi/storyrun/vcall-plan.js` | the pure part: the step read and checked (`planCall`), the tiles' rects for any screen (`layout`), a webcam on someone's eyes (`camOf`) |
| `wagmi/storyrun/vcall-draw.js` | the picture: each office drawn through its webcam into a texture the size of its tile (frozen: not drawn again; blur: the room drawn small and spread under them), the tiles put together on one frame through the city's own passes |
| `wagmi/storyrun/offices.js` | the fourteen offices: `exec`, `startup`, `backstage`, `boardroom`, `kitchen`, `study`, `van` (a broadcast van's back), `greenroom` (an arena's green room), and away from a desk `truck` (a food truck's kitchen), `diner` (a diner booth), `lot` (a lot out back, a loading dock), `green` (a lawn by a station, a bench), `car` (a car's front seat), `house` (row one of an arena's seats) (set kit rooms dressed for the webcam's one view, lit so faces read; also sets.js rooms `office-<look>`) |

## The step (runner pack)

```json
{ "type": "vcall", "title": "Colter Family Call", "layout": "grid", "end": "leave", "time": "night",
  "people": [{ "who": "Tessa Colter", "office": "kitchen", "sub": "the books" }, { "who": "player", "office": "study", "muted": true },
             { "who": "Vance Mercer", "office": "exec", "late": true, "blur": true }],
  "lines": [{ "who": "Tessa Colter", "text": "Dad, they hit Wade." }, { "who": "Jack Colter", "text": "Stay with the herd." },
            { "who": "Tessa Colter", "text": "You're on mute." }, { "do": "unmute", "who": "player" },
            { "do": "join", "who": "Vance Mercer" }, { "who": "Vance Mercer", "text": "Twelve million, Jack.", "cut": 0.7 },
            { "do": "share", "who": "Vance Mercer", "slide": { "title": "A Fair Offer", "lines": ["Three hundred acres"], "big": "$12M" } }] }
```

GameMog's pack v2 writes `line` for `text` and cast ids for names (storykit/pack/gate.ts `vcallProblems`, `toRunnerPack`).

- **People** (2-6): `who` (a cast name, or `player`), `office`, `label`, `sub`, `blur`, `muted` (from the start), `late`
  (not on the call until a `join`), `light`, `cam` (`close` head and shoulders, `wide`, `low`).
- **Lines**: `{ who, text, how, pre, post, pause, overlap, cut, muted }`: said in turn as a cutscene's (turns.js). `cut`
  hands over once that share of the line is said (the next person talks over it). A line said while its speaker is
  muted (or `muted: true`) is played to nobody: their mouth still moves (face.js reads `muted` from the voices' log and
  chatters), the subtitle reads "(muted)".
- **Events** (`do`): `mute` `unmute` `join` `drop` `freeze` `unfreeze` `share` (`slide`: `title`, up to 4 `lines`, `big`)
  `unshare` `blur` `unblur` `hand` `wait` (`secs`).
- The others' voices go through the 'video' band (voices.js); the hero's is his own room's.
- Every webcam is framed on its person's eyes as they sit, from a little under them; their head is turned up to the
  lens over their idle (cast.js gazeStep), so a clip that hangs the head still looks into the camera.
- With more than two tiles, the ones not talking are drawn every other frame (a call's 30 frames a second).

## On the car's screen

A car-phone `call` (auto or inCar) with `video: { office, blur, light }` shows the caller in their office on webcam in
a small picture at the top right while the call is on (`vcall.js feed`, `vcall-draw.js drawFeed`): their office drawn
into its picture every other frame, the picture a quad held in front of the city's lens (it goes through the city's
own passes with the street), lit green while they talk; gone in a cutscene and when the call ends.
While it is up it is the call's one card: its name tag carries the call's status (Incoming call, On call, Call
waiting), and the caller card under it is put away (`body.wg-vfeed-on`); on hold or out of the car, the card is back.

## The screen

The tiles end above two lines of the subtitle (or the tallest it has been in this call), so a strip's name tags are
never under it; a tile's Waiting to join / Reconnecting sits above its name tag (smaller in a small tile). The
CONNECTING cover is over the tiles, which wait unseen until they are laid out. Each speaker's call sound is put back
after the call as it was before it (`W.voice.fxOf`), not cleared.

## Tests

`node --test tests/vcall.test.mjs`: the plan (mute carried to a line, nobody talking after they drop, slides and waits
clamped), the layout on four screens for 2-6 tiles (inside the screen, never overlapping, 16:9, the speaker stage and
the shared screen over the strip), the webcam, and the offices.
