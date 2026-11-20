# Jensen Heist: the pack's sources

`storykit/packs/jensen-heist.json` is the committed pack. `gen.mjs` writes it, so edit the pack through `gen.mjs` and
run it again; the two never drift apart. It is GameMog's second showcase (`SHOWCASE_PACKS`) and its first in a
hometown: San Jose (`us-0668000`) on Mog City's engine. It is an owner-approved, affectionate parody of a public
keynote persona; every other person, company, product and place name in it is invented.

| file | what it is |
|---|---|
| `gen.mjs` | the script, as data: cast, places, opening, 8 missions in 4 acts. Every conversation scene is a video call (`vcall`), every car-phone call that rides a drive shows its caller on the car's screen (`call.video`), and the finale is played on the arena's stage (the `stage` set). |
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
3. **The voices.** 687 spoken lines, 677 clips to render (Mr. Board's recordings do not match his new words).
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

## The room's rewrite (round 2, 18 Nov)

The writers' room (a head writer's brief, three writers: the opening to Mission 2, Missions 3 to 5, Mission 6 to the
end) rewrote the story's spine and its talk; this pack is their scenes merged:

- **The chip was always bait.** The Board needs Jensen out of the arena all day while he takes the building: a
  mahogany chair wheeled in at the arena stop (Mission 1, "furniture, executive"), the run of show back as
  "Presenter: TBC" (Mission 3), "a delivery for the Board" at the dock (Mission 5), and the voicemail that says it
  (Mission 6). Jensen sees the pattern at the midpoint ("He buys you something small, then he gives you an address"),
  goes on purpose and gives Wesley a job (the dock), which is how the grey SUV is found.
- **Jensen's flaw costs him** (on mute through the logo spin, the founder story told differently every time, Lola's
  March forgotten, talking over Wesley's confession) and the finale pays it: the booth story told true, the crowd
  finishing his line, and the Board given his wish ("Give him his applause") for leaving.
- **Mission 1 stops at the arena:** two drives (the arena's front, then the market) with Marge's call spanning both
  (`span: 4`), three lines at the stop, Wesley's call waiting 6 s into the second leg. **Mission 3** drives straight
  to the diner (a `drive.to` list goes to the nearest of its places, never legs).
- **The finale on the stage:** a pre-show call (H1: the Board launches an empty velvet stand, Jensen's calendar joins
  him on the arena's screen), the back lot and the headset fight ("Fog. Go." / "Not the fog."), then six stage
  scenes on the `stage` set and three crowd choices; the ending branches on the crowd (70).
- **The opening is a kitchen** (the kitchen office as a set room), Nico and the title framed on the car.
- **The hero's car is lime green** (`#76B900`, paint only, no logo or livery: the stock roadster's `paint`, which
  the runner world carries as `carPaint`). Every "white car" line is gone; the paint guy called the colour "keynote",
  and Nico names her "Seven-Oh-Four".
- 687 spoken lines (the brief's budget 650-690): the two optional extras on Nico's tail call (the Pope, the
  highlighter) and the headset fight's "Standby... fog?" were cut to fit. Marge's "Not the fog." is `urgent`, not a
  shout: the voice bible gives her one shout (Mission 6).

## The polish round (19 Nov): the stage, the plants, the calls at real pace

Needs a Mog City engine with MogCity `jh-pack` 26a943c (the stage room, `house`, the npc's chair and lanyard, the
`van` and `greenroom` offices, linger, the call fixes); an older one draws the old dark stage and ignores the rest.

- **The arena lit as a keynote** (needs a Mog City engine with `stage-room.js`): an LED wall the stage's width glowing
  with the set's sign and lighting the deck and the front rows, the presenter's key from the front-of-house truss and a
  cool rim from upstage, haze in the cans' beams, and the house: the standing pit packed to the barrier (the city's own
  people, kept a metre clear of the cast) and the seats behind, phones up. ST3A and ST4A set `house: 'up'`: the house
  on its feet, cheering. The front row's mahogany chair is in every stage set; Marge walks through the barrier's gap
  and sits in it.
- **Every stage line plays over its speaker.** The cameras are placed in the room and written relative to the person
  they are on (`camAt`, `close`, `shotOn` in gen.mjs); exchanges became shots of their own, a two-shot holds both
  faces, and a short line from off is kept only as a deliberate interjection (Lola's "Not for sale.", Jensen's "Is that
  bad?"). ST3A opens on the house standing seen from the stage over the two of them, then the Board's face turned to it
  (its near-black first frame was a lens inside the wall). ST3W is new: Wesley's line on the wall, ninety metres wide.
- **The choices stay on the stage:** Mog City's runner holds a set's last frame through the choice or lines after it
  (they were played on the street outside the arena), and dips to black into the next set. So ST1, ST2 and ST3W end on
  Jensen (his choice and its reply over him), ST4A and ST4B on Wesley (Chat's verdict).
- **The chair plant is shown:** at the arena stop Director Grey, in a lanyard, wheels the mahogany chair along the
  kerb (`npc` with `push`, `lanyard`, `walk`), and a `beat` holds on him for "why is a man in a lanyard wheeling a
  mahogany chair into my arena?" (C1's span is 5).
- **C1 at real pace:** a mission line waits for the call's line on screen (it was cut and said twice), the beat keeps
  the call quiet through the exchange, and the market's video call lets C1 wrap first: Marge's "You're back..." after
  W1 and "Four o'clock. Then I call it. Copy?" are heard. The seats exchange is the first extra (ST3 pays it off).
- **W1's switch-over:** Wesley's office is built while he rings, and his picture is the call's one card from the answer
  (the caller card and the feed were both up for two seconds while it compiled). Marge's feed says "Call waiting ·
  WESLEY TROUT" while he rings.
- **Labels match the rooms:** Dex is in a broadcast van (`van`), Mr. Board's pre-show and Jensen's after-show are in
  the green room (`greenroom`: the mirror's bulbs, the fruit, the jacket on its rail); Marge's tile reads "no headset",
  Wesley's "row one · live" (a long one now ends in an ellipsis).
- **Nico stays with the oven:** K1 ends "Nico, keys. Marge, no hold." / "Keys are in her, boss. I'll mind the oven."
  (Jensen drives all day, as C1's brakes demo has it; BT-3 finds Nico at the house). His card: "the car guy".

## The second polish round (19 Nov)

- **Every tile's sub is the office behind it.** Mog City now has offices for calls taken away from a desk: `truck`
  (Lola's food-truck kitchen: the flat-top and hood, the serving window, the ticket rail, the blue cooler, her OPEN
  door), `diner` (a booth in red vinyl, the counter and its stools behind), `lot` (a lot out back: a loading dock, a
  van, the dumpster and the blue recycling bins), `green` (a bench on the green by the station, tents on the grass),
  `car` (a car's front seat) and `house` (row one of the arena's seats). Lola, Nico's last plate and Jensen "in the
  back" of the truck are in `truck`; booth three and the Directors' booths in `diner`; X1, S1's dock and A1's dock door
  in `lot`; I1 on the `green`; Nico out front and the Directors' black cars in `car`; Wesley's row one in `house`; his
  car-screen calls from the fan line on the `green` (W1, W3) and from behind the museum's bins in the `lot` (W2).
  Dex's A1 tile is the van, pivoting. Marge wears her headset on every body, so her tile now says "headset: a spare, no
  channel" (her own was taken). The pack check reads every tile's sub against its office.
- **TP-6:** "Nico. The car guy. Pothole namer." (was "Driver."), matching his card.
- **The stage:** the pit's cheering is made by hand in the engine (arms up, clapping, a fist pumped, a phone held up to
  film, each person on their own beat), no capture data; on WebGL2 the pit is a lighter crowd of its own, cheering the
  same. Marge sits in the mahogany chair at the seat's height, seen through the barrier's gap. The fight's help card
  is cleared before a set's dip to black. Director Grey pushes the chair with both hands on its back, and his lanyard
  comes off when the mission ends.

## What changed from the script (draft 2), and why

- **Video calls** (the owner, 18 Nov): the conversation scenes are calls, each person in an office of their own.
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
