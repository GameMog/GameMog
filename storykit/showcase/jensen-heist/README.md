# Jensen Heist: the pack's sources

`storykit/packs/jensen-heist.json` is the committed pack. `gen.mjs` writes it, so edit the pack through `gen.mjs` and
run it again; the two never drift apart. It is GameMog's second showcase (`SHOWCASE_PACKS`) and its first in a
hometown: San Jose (`us-0668000`) on Mog City's engine. It is an owner-approved, affectionate parody of a public
keynote persona; every other person, company, product and place name in it is invented.

| file | what it is |
|---|---|
| `gen.mjs` | the script, as data: cast, places, opening, 8 missions in 4 acts. Every conversation scene is a video call (`vcall`), and every car-phone call that rides a drive shows its caller on the car's screen (`call.video`). |
| `town.json.gz` | the San Jose CityPackage the pack is gated with and pinned to (`base.hometown`): the frame of a local build of compiler 0.14.0 (the downtown box). |
| `sheets/` | the seen people's Character Forge sheets, from the hand-built cast's track. |

```
node storykit/showcase/jensen-heist/gen.mjs                                    # writes the pack
node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-jensen.ts --draft <out.json> [--cast id=url,...]
node --import ./scripts/ts-resolve.mjs scripts/storykit-showcase-jensen.ts --export [--voice <dir>]
```

`npm run check` gates the pack in its town as a showcase on every run (`scripts/storykit-pack-check.ts`). The migration
(`deploy/migrate.mjs` `2026-11-18-jensen-heist`) waits until the record exists, and publishes the world hidden.

## Before it can ship

1. **The town, built in production.** Release compiler 0.14.0 (the downtown box), then an owner session's
   `POST /api/towns {placeId: 'us-0668000'}`. Its buildId differs from the local one (the image digest is in it), so
   write that frame's package over `town.json.gz` and run `gen.mjs` again (the pin is read from it). The place keys
   come from the same compiler and data; the gate says so if one moved.
2. **The bodies.** The hand-built cast's GLBs at `public/storykit/cast/hand/jh-<id>.glb`
   (`scripts/storykit-showcase-jensen.ts` `BODIES`). Mr. Board is Mog City's own Mr. Big, renamed (`model:
   mogcity/mrbig`), until his hand-built derivative replaces him: give him a sheet and a body then.
3. **The voices.** 650 spoken lines, 649 clips to render (Mr. Board's 4 recordings do not match his new words).
   Render them, then `--export --voice <dir>`.
4. **The art.** `deploy/migrations/jensen-heist-{cover,wide,icon,sky}.jpg`.
5. **The credit line** (the owner's to approve): "A parody of a public figure's public keynote persona. Not endorsed.
   Built from CC0 MakeHuman parts." It is in the game's meta (`storykit.credit`).

## Where it plays (keys of the town's frame; the real names are never shown)

| pack place | key | what is there, and the nearest sensitive place |
|---|---|---|
| kitchen | `parking55` | a lot south of downtown, in the spawn district (Mission 1's start) |
| stage-run, arena | `stadium4` | the arena's front |
| market | `parking41` | a lot on W Santa Clara St, about 250 m clear of any school or museum |
| santa-clara | `hotel33` | W Santa Clara St, between the market and the arena |
| station | `parking32` | the station's lot (the tail's last mark) |
| station-lot | `park65` | the green by the station: Mission 2's fight, 229 m from the nearest temple |
| diner | `restaurant31` | a diner on W Santa Clara St, 243 m clear |
| museum-lot, museum-van | `hotel36` | the block behind the science museum (about 170 m off): stealth and a cable pull, no violence |
| convention-dock | `parking42` | a lot by the convention hall, 246 m clear: the roadblock and the case |
| viaduct | `parking5` | by the 280, east of the children's museum (266 m): the freeway chase starts here |
| stack | `restaurant160` | under the 87/280 stack (a fire station 149 m off): the tail starts here |
| north-87 | `park47` | north of downtown, a route mark the tail passes |
| rose-garden, rose-lawn | `parking63` | the north river park, nothing sensitive within 300 m: Mission 6's fight |
| arena-line | `park54` | the arena's green: the fan line |
| arena-approach | `stadium4` | the arena's front, a block short of the dock (the convoy's end) |
| arena-dock, stage-door, backlot-a/b/c | `parking64` | the arena's back lot, nothing sensitive within 300 m: Missions 7 and 8 |

## What changed from the script (draft 2), and why

- **Video calls** (the owner, 18 Nov): the 12 conversation scenes are calls, each person in an office of their own.
  Captions became screen shares (the card, the napkin, the letter, the cone, the quiet launch, the Mahogany One).
  K1 opens with Jensen on mute (two new lines: "Marge? Marge, can you hear me? Are we off?" / "You're on mute,
  Jensen..."). W1's "Wesley, this is a phone call." is "Wesley, this is a video call. I can see your cat." F3 has a
  0.8 s wait. Staging for street cutscenes is gone: L1's walk to the window, S1's Directors, A1's people and car.
- **The gate's refusals:** "Chat loves him now" became "adores" (the brand list matches "Love's"); "the bike rack"
  became "the recycling bins" (bike words on a car mission); "Park somewhere they'll tow you" became "ticket you"
  (a tow verb the roadster lacks); "You ram, I yell." became "You shove, I yell." and the `ram` verbs went (the
  roadster has no rammer; the roadblocks are still rammed through). On-screen labels never name another city: Mr.
  Board and Nico are "from back east" on their cards and sheets; the dialogue keeps New York. Jensen's sheet role was
  shortened to 80 characters.
- **The split pairs** are named Intern One / Intern Two and Director Grey / Director Navy: Mog City keys a body by
  its display name, so two "Director"s would be one man.
- **Places:** the kitchen moved off the west side's homes (a private home is never a story place, and Mission 1 must
  start in the part of town built first); the opening's card reads "South of downtown". The market, the diner and the
  station fight moved to spots well clear of schools and places of worship (see the table).
- **Mission 6's search of the velvet bag** is gone: the rose garden's lot is drive-up only (its middle is inside a
  structure), and no walk-up place is near. Jensen still says "There you are."
- **Mission 1's call waiting** (Wesley) rings 45 s into the drive, not 80: the drive is about 1.3 km.
- **Mission 7's convoy** ends at the arena's front (a block short of the dock) down Santa Clara St: ended on the side
  street by the dock, Lola's truck locked nose to nose with town traffic in a test drive. **Mission 8** starts at the
  arena's front, so the back-lot sneak is a walk past all three Directors.
- Lines ending in "..." are written as cut-ins (`cut`), and short replies over them as `overlap`.

## A Mog of it

It is Moggable with the town locked (a hometown story whose meta names its place). A Mog keeps the showcase's longer
limits. The builder's independent names check reads only the texts a Mog adds or changes (its tagline, blurb and new
lines), so the inherited cast and lines, the name "Jensen" among them, pass as they are; a new line or title that
names him is read by the check, which lists real people, and a real person is sent back unless the creator consented
for that name. A Mog that moves the town is refused.
