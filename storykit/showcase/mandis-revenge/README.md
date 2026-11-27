# Mandi's Revenge: the pack's sources

`storykit/packs/mandis-revenge.json` is the pack. `gen.mjs` writes it, so edit the pack through `gen.mjs` and run it
again; the two never drift apart. It is GameMog's third showcase (`SHOWCASE_PACKS`) and its second in a hometown:
Chicago (`us-1714000`) on Mog City's engine, from the owner-approved story outline (25 Nov 2026). Every person, company
and brand in it is invented.

| file | what it is |
|---|---|
| `gen.mjs` | the script, as data: cast, places, opening, 8 missions in 4 acts. Every conversation is a video call (`vcall`); every side character is seen only on Mandi's foldable phone (`calls: { style: 'fold' }`, Mog City `docs/VCALL.md`), never on a card. |
| `sheets.mjs` | writes `sheets/`, the seen people's Character Forge sheets |
| `town.json.gz` | the Chicago CityPackage the pack is gated with and pinned to (`base.hometown`): the frame of a local build of compiler 0.14.0 (the downtown box, moved onto the Loop by the core step) |
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
- **Voices later**: every line is a subtitle; `LINES.md` lists them all for casting.

## Where it plays (keys of the town's frame; the real names are never shown)

The district (built first) is the Loop and the river (2.5 km square round the spawn); the town is 4.9 km a side, from
the West Loop to the lakefront and from the Near North Side to the stadium. Distances are straight lines between the
places' street points; "nearest sensitive" is the nearest school, place of worship, hospital, police or fire station
in Overture's data (it files many small training firms in the Loop as schools).

| pack place | key | in district | what is there | nearest sensitive |
|---|---|---|---|---:|
| studio | `park19` | yes | a lot by the river and the tracks (Mission 1 starts here) | 175 m |
| jay-lot | `parking251` | yes | a lot on S Franklin St by Van Buren, under the tracks: search, Diego's call, the fight (moved off a lot on Lower Wacker, where the fight camera sat under the upper deck) | 140 m |
| salon | `parking108` | no | a West Loop lot (Kiki's salon) | 223 m |
| warehouse | `parking15` | no | a lot on Carroll Ave in the warehouse blocks: stealth and fight | 122 m |
| ramp, lower-level | `parking225`, `parking103` | yes | lots by Wacker Dr: the roadblock, the ducks | 118 m, 154 m |
| mirror | `park143` | yes | the plaza by the mirrored sculpture | 135 m |
| harbor | `park15` | no | the harbor drive (the convoy's end) | 387 m |
| pier | `park30` | no | the park at the pier's foot: the contract call, Brick's fight | 173 m (a memorial park) |
| south-lot | `parking182` | no | a lot on S Michigan Ave (Mission 6 starts here) | 140 m |
| stadium-lot | `parking165` | no | the stadium's lot on Waldron Dr | 131 m (a memorial) |
| riverwalk | `park62` | yes | the riverwalk's west end (the convoy's end) | 167 m |
| upstream | `park152` | yes | a park on the north branch: the ducks go in, the fight | 358 m |
| north-ave | `bank212` | no | Michigan Ave north of the river: the run-up to the jump (the limo's way onto the bridge, going south) | 34 m |
| bridge | `parking73` | yes | a lot on Michigan Ave just south of its bridge: the bascule the jump is off (the one nearest it), where the limo pulls up, Diego's fight (27 Nov: the lot past the bridge, `parking186`, left out: the limo's way to it looped 330 m round the one-way blocks) | 87 m |

Mission 1 is entirely inside the district (the spawn-district rule). None of the places is itself sensitive (the
gate's rule); a few are closer than Jensen Return's 250 m judgement, because the Loop's data is dense with small
"schools": the README's figures are the ones to review.

## Weather (MogCity `js/weather.js`)

Every mission is at dusk or night, so each gets the world's `dressing.nightWeather`, a drizzle, unless it names its own:
rain for the chases (M3 Lower Level, which the lower deck shelters, M6 Wrong Way Jay, M8 Bridge Up) and river mist for
M7 Double or Nothing on the riverwalk. The streets are damp, never mirror-wet.

## Pacing (the Jensen rules: a drive or tail about 2 minutes at most, never 3 minutes without a beat)

Straight-line legs: studio to Jay's lot 1.1 km, Jay's lot to the salon 1.2, the salon to the warehouse (tail) 0.76,
the lower level to the mirror 1.09, the mirror to the harbor (convoy) 0.72, the harbor to the pier 1.24, the south lot
to the stadium (tail) 1.14, the salon to the riverwalk (convoy) 0.92, the riverwalk to upstream (the RACE timer) 0.45,
upstream to the bridge (the limo) 1.30 (by road about 2.4 km: along the river's north side, up to Ohio St and down
Michigan Ave onto the bridge from the north, a run-up of 200 m to the leaf; the tail measured 2.5 minutes at a player's pace). Every drive or tail has a call or timed lines on it; no step runs long without
a line, a text or a scene. These are first targets: a test drive of each mission sets the real times (and the medals).

## What is not built yet (engine and art)

- **Rooms**: Mandi's studio, the casting studio, Kiki's salon, the riverboat lounge and the powder room are Mog City's
  existing offices for now (`study`, `startup`, `greenroom`, `exec`, `greenroom`). New offices are engine work.
- **The CLIENT · DV tile** is a late tile that never joins (it reads "Waiting to join"): Mog City has no camera-off tile.
- **Brick** joins the audition from his own phone (a tile can hold one person, so he cannot lean into Jay's).
- **Set pieces**: the rising bridge and the jump are played (MogCity `chicago-weather`, `cities/sf/js/bascule.js`): M8's
  `bridge` step waits for the Kastell coming down Michigan Ave behind the limo (`near`), rings the bells, drops the gates
  and raises the north and south leaves to 12 degrees, timed to be up as she gets there; she drives up the north leaf and
  over the gap, the engine's hero shot (`jump`: slow motion, the lens flying alongside her on the river's side, the
  Kastell lit by a lent key light against the Loop's towers) handed back as she lands about 28 m past the far hinge. The city's cars hold at the gates. The
  elevated train, the sea of ducks, the Ferris wheel and the limo's flag are described, not modelled. The tail and convoy cars are city
  bodies in colour (the yellow Derby van is a yellow SUV while it moves, a van when parked; the white limo a white sedan).
- **Medals** are time and damage (Mog City's); the outline's named medals ("Callback", "Fresh Set"...) are not a field.
- **Lines**: 244 spoken lines, a first playable script; the outline's budget for the voiced game is 600 to 700.

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
3. **The voices** (`LINES.md`), the art (cover, wide, icon, the headshot sky), the record and the migration, as Jensen
   Return's.
