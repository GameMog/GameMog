# Mandi's Revenge: the pack's sources

`storykit/packs/mandis-revenge.json` is the pack. `gen.mjs` writes it, so edit the pack through `gen.mjs` and run it
again; the two never drift apart. It is GameMog's third showcase (`SHOWCASE_PACKS`) and its second in a hometown:
Chicago (`us-1714000`) on Mog City's engine, from the owner-approved story outline (25 Nov 2026). Every person, company
and brand in it is invented.

| file | what it is |
|---|---|
| `gen.mjs` | the script, as data: cast, places, opening, 8 missions in 4 acts. Every conversation is a video call (`vcall`); every side character is seen only on Mandi's foldable phone (`calls: { style: 'fold' }`, Mog City `docs/VCALL.md`), never on a card. |
| `sheets.mjs` | writes `sheets/`, the seen people's Character Forge sheets |
| `town.json.gz` | the Chicago CityPackage the pack is gated with and pinned to (`base.hometown`): production's Chicago, `htc-0.15.0-hg1-b6f7c162d` (27 Nov: its `citypackage.json`, the same 4936 places as the local 0.15.0 build the missions were played on) |
| `LINES.md` | every spoken line, for casting (written by the script below; do not edit) |

```
node storykit/showcase/mandis-revenge/sheets.mjs                                 # writes sheets/
node storykit/showcase/mandis-revenge/gen.mjs                                    # writes the pack
node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --gate
node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --lines storykit/showcase/mandis-revenge/LINES.md
node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-mandi.ts --draft <out.json> --cast id=url,...
```

## The owner's rules this pack keeps

- **Mandi never changes outfit.** The leopard bikini and the fuzzy slides, all game. She takes Jay's leather jacket off
  the hook in the leaving beat and carries it (it rides on the passenger seat); she never wears it. Every jacket line
  is about the jacket on the seat.
- **Her car is the Kastell**, Mog City's black off-roader (`{ stock: 'gwagon', label: 'Kastell', paint: '#060708' }`,
  the runner's `car { model: 'mogcity/gwagon' }`). The red coupe is Jay's: it waits at his lot in Mission 1 (she
  searches it there), and Diego calls it collateral.
- **Side characters only on the foldable phone**: every call is a car-phone call with `video` (the caller on the
  phone's inner screen) or a `vcall` (on the phone, big). No caller cards.
- **The audition is on her laptop**: `vcall` with `device: 'laptop'` (new, MogCity `mandi`): the full-screen call in a
  laptop's frame (bezel and webcam dot), not on the phone. Every other vcall is on the phone.
- **Every line voiced** (27 Nov, the owner: "there was also NO VOICES?!"; 28 Nov, every new line of the story pass too): every spoken line's clip in
  `deploy/migrations/mandis-revenge/voice/`, their lengths, QA and provenance in `deploy/migrations/mandis-revenge-voice.json`
  (`scripts/storykit-showcase-mandi.ts --voice <dir>`; licensing in `storykit/voices/LICENSING.md`). Rendered on the Mac as
  Jensen Heist's were: each voice designed once from a written description (Qwen3-TTS 1.7B VoiceDesign, standard American,
  no accent, no real person), every line cloned from it (Qwen3-TTS 0.6B Base, Mog City's own voice build), each take
  through Whisper and finished at -16 LUFS. Mandi is a warm bright mezzo, quick and wry. The pipeline and the audition
  reels are in the character folder (`Mandi/voice/`, `Mandi/review/voice/`). A changed line needs its clip re-rendered
  and `--voice` again (the check names a clip no line plays). The live game is voiced by `2026-11-27-mandis-revenge-voice`.
  Mandi's and Jay's call faces lip-sync with no pack change: their bodies carry the visemes, and Mog City's baked face
  (`wagmi/face-baked.js`) shapes them from the clip's level and the line's words.

## Where it plays (keys of the town's frame; the real names are never shown)

The district (built first) is the Loop and the river (2.5 km square round the spawn); the town is 4.9 km a side, from
the West Loop to the lakefront and from the Near North Side to the stadium. 28 Nov, the story pass (the playtest's B2):
every place the script names is now that real place, on the street at it. "Route" is the GPS's route at the start's
heading, measured in the engine (r42, production Chicago), not a straight line.

| pack place | key | what is there | route from the step before |
|---|---|---|---:|
| studio | `parking28` | a lot on S Wabash Ave, under the Wabash tracks (Mission 1 starts here) | |
| jay-lot | `restaurant1602` + offset = anchor `jay-lot` | the car park beside the Lake St L: the search, Diego's call, the fight (was a lot on Franklin with no tracks) | 1.8 km |
| salon | `restaurant1373` | Kiki's salon on W Lake St, under the same L (was a West Loop lot 2.4 km away) | 2.0 km |
| warehouse | `parking15` | a lot on Carroll Ave in the warehouse blocks: stealth and fight | 1.1 km (the tail) |
| ramp, lower-level | `parking225`, `parking103` | lots by Wacker Dr: the roadblock, the duffel; lower-level carries `heading: 186` (its first leg was a U-turn on Wacker) | |
| mirror | `park143` | the plaza by the mirrored sculpture | 2.0 km (was 2.5) |
| harbor | `park15` | the harbor drive (the convoy's end) | 1.1 km (the convoy) |
| ohio | `parking83` | a lot on E Ohio St, a block west of Michigan Ave: Missions 5 and 8 start here | |
| pier-foot | `restaurant1151` | the foot of the pier on E Illinois St: the drive ends here (every car route along the pier looped 2-6 km on the lanes; M5 used to start at the harbor, 3-5 km round Lake Shore Dr, the U-turn the playtest got stuck on) | 1.5 km |
| pier | `restaurant1805` + offset = anchor `wheel` (foot) | the pier by the wheel, walked out to: the contract call, Brick's entrance and fight, the lake at the kerb | 0.4 km on foot |
| south-lot | `parking182` | a lot on S Michigan Ave (Mission 6 starts here) | |
| stadium-lot | `parking165` = anchor `stadium-lot` | the stadium's own lot on Waldron Dr | 2.1 km (the tail) |
| crew | `parking130` | a lot on N Franklin St by the river: the crew meets here (Mission 7 starts here; it was the salon, 2.9 km from the Riverwalk) | |
| riverwalk | `park137` | the Riverwalk on Wacker at LaSalle: the finish line, Kiki's stream | 0.9 km (the convoy) |
| upstream-wall | `bank168` + offset = anchor `riverwalk-east` (foot) | the river wall upstream (the river runs backwards, away from the lake: upstream is east), walked to with the duffel: the ducks go in, the fight | 0.23 km on foot |
| north-ave, bridge | `bank212`, `parking73` | Michigan Ave north of the river and the bascule: the run-up, the jump, the boss fight | 0.8 km |
| dawn, dawn-jay | `restaurant1805` + offsets = anchor `wheel` (foot) | the pier by the wheel at first light (the epilogue's `place` step puts her there); Jay 2.4 m east of her, so over his shoulder the skyline across the harbor is behind her | |

The anchors (`Mandi/review/city2/ANCHORS.md`) are compiled into the `mandi-city` Chicago bundle, which production does
not run yet; this pack is gated against and pinned to production's. So each anchored place is an `offset` (60 m at most)
from a key both bundles have, measured in the engine (the key's own lane point and heading) to land on the anchor's
point within a metre: on the new bundle the L, the wheel and the river wall stand there; on production's the same spot
is the same street. Once production runs the new bundle and `town.json.gz` is re-pinned, point the aliases' `@` at the
anchor keys and drop the offsets.

Mission 1 is entirely inside the district (the spawn-district rule). None of the places is itself sensitive (the
gate's rule).

## Weather and time (MogCity `js/weather.js`; the playtest's H5)

The story is one night in late November, when Chicago is dark by 4:30: every mission is at `midnight` (the opening's
7:40 PM too; it played as golden dusk), and the epilogue at `dawn` (6:52 AM, BU-8's `place` step). The weather builds
over the night instead of jumping: clear at 7:52 (M1), drizzle from 8:20 (M2 to M4), the lake wind at the pier (M5),
rain for the lakefront chase and the race (M6, M7), easing to drizzle for the bridge (M8). The epilogue keeps M8's
drizzle: the engine sets weather once per mission (an engine item below).

## Pacing (the owner's rules: a drive or tail about 2 minutes at most, never 3 minutes without a beat)

Every drive, tail, convoy and chase has talk in motion, Jane-and-Dan style: Jay's call from the boat and Bernie behind
it (M1), Kiki live from her chair (M2, the 2-minute silent drive), Brick knitting at the lights (M3), Jay from Diego's
other bathroom and Diego asking after his accountant mid-convoy (M4), Bernie on the drive and Mandi on the boards (M5),
Kiki's cousin the temp the whole tail and the crew meeting Jay over the chase (M6), Kiki's stream and Jay in the seat
(M7), Diego taunting from the limo (M8). Five stop-and-talk calls became calls in motion (k1, a6, d3 and Jay's
kidnapping, which left the audition for the drive). The test drive's numbers are in the story review
(`Mandi/review/story/`).

## What is not built yet (engine and art), and where the pack is ready for it

- **Props and set pieces** (MogCity `mandi-props`, `Mandi/review/props/HOOKS.md`): the pack carries them as shot fields
  and step fields an older engine ignores, so every mission still plays on r42 as before: the open duffel of sevens in
  the Kastell's trunk (LL-3 `ducks`), the 980 sevens poured into the river (DN-7 `phones`) and 600 still drifting at dawn
  (BU-8 `dawn`, with Jay's jacket over her arm), the bucket, suds and the sponge passed hand to hand at the limo (WW-6
  `reunion`/`sponge`, Jay stood 1.1 m from her), the white stretch limo (`stretch: 2.6` on both limos), lens moves
  (`move`), `cine: { drift, room }`, and the calls played over the street (`live`: g1, c1, c2 wait for their end; plan
  runs over the convoy). The schema fields are in `storykit/pack/schema.mjs` (Mog City mandi-props). Not used: the
  `prop`/`flotilla` step kinds (an older engine has no part for them), a prop-relative lens, and a search ring at a car's
  door: Jay's coupe is the search's own prop (`prop: 'sedan', propColor`), parked at the ring in red on either engine.
- **The elevated L** over Wabash and Lake St (the studio and Jay's lot are under it; another agent's), **the wheel** on
  the pier, and **Diego going over the rail** (the finisher looks at the water while Jay calls it).
- **The anchored places** (above) on the `mandi-city` bundle: the offsets land on the anchors' points; switching to the
  anchor keys themselves waits for that bundle in production (and MR_ROUTES re-measured).
- **Weather inside a mission** (the dawn after BU-8's rain) and **the time after the credits** (index.js sets midday).
- **The GPS** still plans U-turns across divided roads and cannot reach the pier's Dock St from the city; the pack routes
  round it (headings, the pier on foot), the router itself is engine work.
- **Rooms**: Mandi's studio, the casting studio, Kiki's salon, the riverboat lounge and the powder room are Mog City's
  existing offices. **The CLIENT · DV tile**: Mog City has no camera-off tile, so the client is on the audition in Simone's
  words ("camera off, he likes to listen first"), and the line pays off in MP-4.
- **Medals** are time and damage (Mog City's).

## Before it can ship (the owner's to approve)

1. **The town, built in production**: release compiler 0.14.0 with the deck fix this build needed (MogCity `mandi`,
   `tools/hometown/compile.py` `deck_profile` / `deck_base`: a split grade group whose least member keyed another
   group's solve; Chicago's river decks hit it, `KeyError` in tile `hg1-conus/0/7207/7131`), then an owner session's
   `POST /api/towns {placeId: 'us-1714000'}`. The production buildId differs from the local one (the image digest is
   in it), so write that frame's package over `town.json.gz` and run `gen.mjs` again (the pin is read from it). Cost:
   a 4c-8g run bills $1.00/h; this town's frame plus 210 tiles took about 3.5 CPU-minutes locally, so roughly $0.10.
2. **The bodies**: Mandi and Jay are private premium assets and are never committed here. Once private hosting exists,
   the world names them like any other body, by content address (`/storykit/f/<sha256>.glb`), served from the private
   store to a signed-in player; the pack itself needs no change. The side cast is forged from `sheets/`
   (`node scripts/forge/forge.mjs <out> storykit/showcase/mandis-revenge/sheets/<id>.json`).
3. **The voices** (`LINES.md`), the art (cover, wide, icon, the headshot sky) and the record, as Jensen Return's. The
   migration is written and waits for them: `deploy/migrate.mjs` `2026-11-27-mandis-revenge` publishes the game HIDDEN
   from `deploy/migrations/mandis-revenge-story.json` and `mandis-revenge/world.json`, the side cast from
   `deploy/migrations/mandis-revenge/cast/`, and Mandi's and Jay's bodies (record rows `src: 'private:<sha256>.glb'`)
   from the server's own `data/storykit-private/<sha256>.glb`, never from the repo; until all are there it is tried
   again at each boot and never recorded. The record is written by `storykit-showcase-mandi.ts --export` (27 Nov): the
   side cast copied in with `--cast-from <dir of forged GLBs>`, Mandi's and Jay's bodies only hashed, from
   `MR_MANDI_GLB` / `MR_JAY_GLB` or their own folders beside the checkout (on a machine without them the record's rows
   stand). Done 27 Nov: the town is built in production and the pack pinned to it (step 1), the record, the world, the
   side cast and the art are in; the two bodies go to the server's `data/storykit-private/` last.
