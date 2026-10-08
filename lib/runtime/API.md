# GameMog World API (runtime v1)

Every GameMog game is a **world module** running on the **GameMog Runtime**. The runtime is
the platform: it owns the rules, so every world plays by them. The world module is the
creativity: it decides what the world is, who lives in it, and how it looks, moves and sounds.

## The rules (the runtime owns these; a world cannot change them)

- **3D only.** Every world is a 3D place seen through the runtime's chase camera, from behind
  the player. There are no 2D, top-down, side-scrolling or isometric worlds, and a world never
  moves, replaces or re-projects the camera.
- **Endless laps.** There is no final lap. Your level is the lap you are on.
- **Rivals.** One rival lines up beside you on the start line. Every lap, one more joins at the
  line as you cross it (a few metres ahead, where you can see it), faster and more aggressive than
  the last, and holds its lane for a moment before it starts to hunt you.
- **Every lap is harder.** Every lap you run faster (5% a lap, up to 1.6x), every rival already
  racing gains on you and hunts harder, and moving obstacles speed up. The first rival starts
  slower than you; later ones catch you from behind.
- **Death.** The only way to die is to touch a rival or an obstacle. One touch ends the run.
  In a world with the sword on (`play.combat`), a rival you cut down falls and runs again from
  the line next lap; touching one still standing ends the run all the same.
- **You.** The player is the person playing. Once they have made their character (a realistic
  human athlete from the library, about 1.7 to 1.8 m tall, in their own kit with their name on
  the bib), it replaces `player()`. Build every world for a human runner: its scale, its
  clearances and a track a person could run on. Still write `player()`, which plays when there
  is no character, and never depend on the player's shape. In a world of cars
  (`play.vehicle`), they drive the world's own car in their colours instead, and the world is
  built for cars.
- **GM.** Golden GM coins are laid along the track and re-laid every lap. They are the
  platform's currency and look the same in every world. Do not make coins. A world may lay none
  (`play.coins: false`) and pay a bounty for every lap finished instead (`play.bounty`).
- **Controls.** The player moves forward on their own. Arrow keys (or WASD): left and right
  steer, up goes faster, down goes slower, Space jumps, P pauses. Touch screens get the same
  controls in every world: a stick wherever the left thumb lands (steer, and push up or down for
  the pace), and round buttons on the right, the main one biggest and furthest right (SLOW,
  SPRINT and JUMP, BRAKE, GAS and JUMP in a car, SPRINT, JUMP and SLASH with the sword; an open
  world has RUN, JUMP, DODGE and PUNCH).
- **The jump.** The hero (and every rival) jumps anything lower than nine tenths of the hero's
  height: hurdles, barriers, logs, crates, cones. The runtime sizes the jump to the world's
  tallest such obstacle, so it always clears with room to spare; anything taller is steered
  round. Make obstacles that ask to be jumped low, and ones that ask to be dodged tall.
  With the sword on, X (or J or K, or SLASH on touch screens) swings it.
- **Screens.** No card over the game. Until the player starts, the world races itself (a demo
  run: it steers itself, cannot crash, is silent and is never scored) with nothing over it, so a
  visitor sees the world moving. The start screen appears only when someone asks to play (the
  page's Play button, or a tap or key on the demo). Then countdown, HUD (level,
  time, GM, rival count, a warning when a rival closes from behind), level-up banners naming the
  new rival, and pause and results as a bar along the bottom. Build every world to look good in
  motion from the first frame: the demo is its first impression.
- **Leaderboard.** Runs rank by level reached, then GM collected.

## The world module (you own this)

One script that calls `GameMog.world({...})` exactly once. `THREE` (three.js r157) is a
global. There are no addons, no modules and no network. Use the platform's library and kits
(`ctx.assets`) first, for every person, vehicle, sky, surface and track they cover, and build
everything else in code, in detail.

```js
GameMog.world({
  assets,     // optional: ids from the platform's licensed asset library
  play,       // optional: platform options (no coins, a lap bounty, the sword)
  theme,      // colours and font for the HUD and screens
  graphics,   // optional: cinematic rendering (light from the sky, bloom, grading)
  camera,     // optional: how the chase camera frames the world
  track,      // the loop: control points and width
  build,      // the world: sky, ground, the track's surface, scenery, lights
  player,     // the player's character
  rival,      // rival number k (1, 2, 3, ...), called as each one joins
  obstacles,  // the hazards on the track
  update,     // optional: ambient life, every frame
  ambient,    // optional: background sound, once audio is allowed
});
```

### play (optional)
Platform options, the same in every world that turns them on. Leave `play` out for the
standard race.

```js
play: {
  coins: false,                                            // no GM coins on the track
  bounty: { base: 100, step: 50, name: 'Lap bounty' },     // GM paid for each finished lap: base, plus step every lap
  combat: { mark: '!', verb: 'Cut down' },                 // the sword: X swings; mark shows over a rival in reach
  vehicle: true,                                           // a world of cars (below)
}
```

- **combat**: a swing cuts for a moment a little after the key, up to about 3.4 m ahead, 1.6 m
  behind and 2.6 m to either side. A rival cut down falls where it was, sinks away, and runs
  again from the line on the next lap. The runtime handles all of it; a rival from
  `ctx.assets.human` with a `weapon` swings and dies by itself, and any other rival topples.
  Give the player a weapon (below) so the swing shows. Rivals alongside you swing back (for
  show: only a touch ends a run).
- **bounty**: the level-up banner shows the bounty; use `ctx.on('lap', ...)` to celebrate it in
  the world (fireworks, a bell, a gong).
- **vehicle**: a race of cars. Every speed and every distance along the track is 2.2 times a
  runner's (160 km/h cruising on lap 1, over 350 km/h flat out late in a run), so a lap may be
  704 to 1,980 m and the road 10 to 24 m wide, and a lap still takes about as long. Build the
  player and every rival with `ctx.assets.car` (below): a car's hitbox is its length and width,
  not a circle. The HUD adds a speedometer, the engines are the runtime's, and a rival the
  camera would be inside is not drawn. Build the track for cars: street widths (16 m or more),
  bends of 30 m radius or more, walls or barriers at the edges, and scenery at car scale.

- **The creator's options** (obstacles each lap: fewer, the same or more; music on or off) are
  chosen on the page and enforced by the runtime. Do not set them; build for the one you are
  told, and never compose or synthesise music yourself.

**Where the music plays from** (optional): a world with a place the music comes from (a DJ's
booth, a stage, a bandstand) may say where it is, `music: { source: { at: [0, 1.5, 9], near: 8,
far: 140, floor: 0.12, boost: 1.6, sub: 0.8, crowd: 0.6, keep: true, rooms: [{ min: [x, z], max:
[x, z] }] } }`, and when the music is on it is heard from there: loud and full within `near`
metres (`boost`, 0.5 to 2.5, times the platform's level), falling with distance and losing its top
end to the air until by `far` it is muffled at `floor` (0 to 1), panned to the side it is on, with
the bass you feel by the speakers (`sub`, 0 to 2) and, far off, a slap back off the valley. `crowd`
(0 to 1.5, 0 for none) is a crowd on the floor heard with it (and with the music off), cheering on
the drop and when a man is knocked out within 18 m of `at`. `keep: true` lets it play on through scenes, a knockout and the
results instead of falling away. `rooms` are boxes on the ground (up to 16): heard from inside one
when the source is outside it (or the other way round), it is duller and quieter, as through a wall.
In an open world it is heard from the hero (from the camera in a scene), and a blow he lands near
it cuts through it a little (at most every 0.4 s; the blows he takes do not). Every field but `at`
is optional. Without `source` the music plays as it always has.

### theme
`{ sky, fog, ink, panel, accent, font }`. Colours are `#RRGGBB`. The HUD, screens and touch
controls are the platform's and look the same in every world (frosted glass, white type in
Oxanium); `accent` is this world's colour in them: the lit edges, glows and buttons. Pick an
accent that reads on dark glass. `ink` and `font` letter the world's key art; `font` is one
Google Font family name (for example `"Fredoka"`, `"Baloo 2"`, `"Bungee"`, `"Rubik"`), loaded
for the world to letter its own scenery with. `panel` is accepted and unused.

### assets (optional)
Ids from the platform's asset library: licensed files (CC0 and the CMU motion capture terms),
checked against their SHA-256 when they load, credited on the site's Library page. List what the
world uses (up to 24); it all loads before `build()` runs.

| id | what it is |
|---|---|
| `human-athlete-male` | a realistic male athlete: skins `african`, `caucasian`, `caucasian2`, `asian`; hair `short02`, `short04`, `afro01`; motion-captured idle, standing start, run, sprint and fall, and sword motion (a guard, three cuts, a hit and a death) |
| `human-athlete-female` | the same for a female athlete: skins `african`, `caucasian`, `asian` |
| `human-pack-male`, `human-pack-female` | the people pack for that body (list it with the body): real garments, shoes and hats fitted to it, seven more hairstyles, the middle-aged and old skins, and two more shapes, `age` and `weight` (below) |
| `human-moves-male`, `human-moves-female` | the motion pack for that body (list it with the body, 0.20 MB): thirteen more clips by name: for a party, the dances `danceTwist`, `danceCabbage`, `danceLambada`, `danceMacarena`; a drunk's `drunkIdle`, `drunkWalk` (a gait) and `drink`; `cheer`, `toast`, `smash` (a bottle over the head); `leanBar`, `sitTalk`; and `crush`, an overhead punch down onto a man on the ground (the punch finisher's, below) |
| `hdri-sunset-city` | a golden-hour city sky for `graphics.environment.hdri` |
| `sky-noon`, `sky-partly-cloudy`, `sky-sunset`, `sky-dusk`, `sky-night`, `sky-overcast` | photographed skies, open all round, full dynamic range, for `ctx.sky({ hdri })` |
| `sky-beach` | a photographed Mediterranean beach at midday: sand, pines, a headland, the sea to the horizon (`face` turns its sea) |
| `sky-city-night` | a photographed waterfront city at night: towers, neon, river light (`face` turns its skyline) |
| `texture-asphalt-track` | scanned race-track asphalt (one tile is 2 m of road) |
| `texture-sand`, `texture-grass`, `texture-plaster`, `texture-concrete`, `texture-brick`, `texture-planks`, `texture-snow`, `texture-forest-floor`, `texture-cobblestone`, `texture-corrugated-metal` | scanned surfaces, a tile 2 m across, for `ctx.assets.surface` |
| `texture-rock` (4 m), `texture-bark` (1 m) | scanned rock face and tree bark |
| `model-boulder` | a scanned weathered boulder about 1.8 m tall |
| `model-mossy-rocks` | six scanned mossy rocks, each its own part |
| `model-coastal-cliff` | a scanned sea cliff 87 m long and 11 m high |
| `model-fern`, `model-shrub`, `model-grass` | scanned plants: four ferns, a shrub 2.6 m across, seventeen clumps of grass (each its own part) |
| `model-street-lamp` | a scanned 3.9 m cast-iron street lamp |
| `model-concrete-barrier` | a scanned concrete road barrier 1.5 m long |
| `model-fire-hydrant` | a scanned fire hydrant, new (`fire_hydrant`) and aged (`fire_hydrant_aged`). Two map sets (heavy) |
| `model-street-seating` | scanned modular street benches (legs, seats, backs as parts). Four map sets (the heaviest model, about 112 MB) |
| `model-trash-cans` | two galvanised trash cans 0.91 m tall, `metal_trash_can` (bright) and `metal_trash_can_rust`, each with its handles, and their lids `metal_trash_can_lid` and `metal_trash_can_rust_lid`, lying flat (to cap a can, set its lid at y = 0.9); every part stands on its own spot: place parts. Two map sets (heavy) |
| `model-cardboard-box` | a battered, taped cardboard box 0.52 by 0.39 m and 0.34 m tall, handling marks printed on it |
| `model-wooden-chest` | a weathered lidded wooden chest 0.83 m long and 0.35 m tall, rope handles (parts `wooden_crate_01`, `wooden_crate_01_lid`, `wooden_crate_01_latch`) |
| `model-plastic-crate` | a stackable vented plastic crate in amber, 0.51 m long and 0.25 m tall (the vents are cut out) |
| `model-red-drum`, `model-blue-drum`, `model-burn-barrel` | a red steel oil drum 0.88 m tall with a hazard pictogram; a blue steel drum 0.93 m tall; a rusted, fire-blackened burn barrel 0.86 m tall, open at the top |
| `model-old-tyre`, `model-wheel-rim` | a worn car tyre 0.6 m across and a rusted wheel rim 0.4 m across, each standing on its edge across x (a tyre wall or pile is one `instanced()` call) |
| `model-covered-car` | a saloon car under a dusty fabric cover, 4.4 m long along z and 1.4 m tall; the body `covered_car`, wheels `covered_car_wheel_01` to `_04` |
| `model-concrete-block` | a chipped concrete barrier block 1.6 m long and 1.1 m tall |
| `model-door-shutter`, `model-shop-shutter` | closed steel roller shutters, plain: a doorway's 1.1 m wide and 2.4 m tall, a shop window's 2.1 m wide and 1.85 m tall; the back (the wall) is at z = 0 and the shutter faces +z, its housing 0.3 m deep |
| `model-wall-lantern` | a black wrought-iron wall lantern with its glass and bulb, standing on its bracket: the wall plate is at z = 0 and the lantern stands about 0.6 m out along +z; y = 0 is the bracket arm, the lantern rises 1.3 m above it (the glass 0.55 to 0.9 m) and a thin brace reaches 0.4 m below it on the wall, so set y = 0 about 2 m up a wall, with 1.3 m of room above |
| `model-plastic-chair` | a white plastic patio chair 0.88 m tall |
| `model-cafe-set` | a folding cafe table `outdoor_table_chair_set_01_table` (0.73 m tall) and two folding chairs `outdoor_table_chair_set_01_chair_01` and `_chair_02`, slatted wood on black steel; each stands on its own spot: place the parts, as many as a terrace wants. Two map sets (heavy) |
| `model-fire-escape` | a black steel fire-escape kit, each part standing on its own spot: landings `modular_fire_escape_platform_bottom` and `_platform_middle` (4.8 by 1.4 m, 0.77 m deep), their railings `_railing_bottom` and `_railing_middle` (sit them on a landing's edge), a short landing rail `_platform_railing`, a stair flight `_stairs` (3 m long, climbing 4 m) and a ladder `_ladder_bottom` (6.5 m). Heavy |
| `model-drainpipes` | a galvanised gutter kit, each part on its own spot, all named `modular_metal_gutter` plus: (nothing: a gutter run 1.5 m), `_section` (a downpipe section 1 m), `_corner`, `_bend`, `_outlet`, `_funnel` (the hopper), `_coupler`, `_gutter_coupler`, `_gutter_plug`, `_bracing`, `_gutter_bracing`, `_shower_receiver` |
| `model-air-ducts` | a round sheet-metal air-duct kit lying along z (0.38 m round), each part on its own spot, named `modular_airduct_circular_` plus `single`, `double`, `triple` (straight runs), `bend_half`, `bend_quater`, `smooth_single`, `smooth_double`, `smooth_triple`, `smooth_bend_half`, `smooth_bend_quater`, `fan`, `brace`, `brace_extention`, `brace_extention_wires`, and `modular_airduct_rectangular_converter`, `modular_airduct_rectangular_vent_fan` |
| `model-industrial-pipes` | a painted steel pipe kit standing upright, up to 1.95 m: `modular_industrial_pipes_01_pipe01` to `_pipe08` (straight runs, elbows, tees, a valve with a gauge), each on its own spot. Heavy |
| `model-wooden-pier` | a weathered wooden pier 12.4 m long along z and 2.5 m wide on its pilings, with a rope-hoist frame; y = 0 is its lowest piling foot and the deck is about 3.6 m above it, so sink it into the water to set the deck where it should be. Parts `modular_wooden_pier_section_01` to `_05` (`_05` is the hoist). Heavy |
| `model-fort` | a weathered stone fort kit, each part on its own spot (never place the whole object): walls 8.5 m tall, all named `modular_fort_01_` plus `wall_thick_straight_01`/`_02` (14.6 m), `wall_thick_corner_01`/`_02`, `wall_thick_end_01`/`_02`, `wall_thick_thin_transition_01`, `wall_thin_straight_01` to `_04`, `wall_thin_corner_01` to `_03`, `wall_thin_gate_01` (an arched gate), `wall_walkway_straight_01`/`_02`, `wall_walkway_corner_01`/`_02`, `wall_walkway_end_01`, `wall_stairs_straight_01`, and `tower_round` (13.5 m tall, 15.8 m across). Three map sets (about 84 MB) |
| `model-castle-door` | an arched, iron-strapped wooden double door 2 m wide and 3 m tall in its frame: `large_castle_door_frame`, leaves `large_castle_door_left` and `_right` |
| `model-fire-pit` | a ring of stones round a sooty fire bed, 1.45 m across (the fire is the world's own) |
| `model-wine-barrel` | an iron-hooped oak barrel 0.87 m tall |
| `model-sea-marker` | a weathered red channel-marker buoy 6.8 m tall with a daymark and a handrail; y = 0 is its waterline (1.3 m of it floats below) |
| `model-dead-trunk` | a fallen dead tree trunk 4 m long along x, bark and lichen |
| `model-cannon` | an old ship cannon on its wooden carriage, 2.3 m long along z: `cannon_01_barrel`, `cannon_01_frame`, `cannon_01_pusherblock`, wheels `cannon_01_wheel_01` to `_04`, and three cannonballs `cannon_01_ball_01` to `_03` beside it |
| `sky-winter-square` | a photographed small-town square on a snowy, overcast night (1024 x 512): warm street lamps, festive lights, houses all round. A light, not a sky: use it as `graphics.environment.hdri` (warm lamplight in glass, metal and snow) behind a sky of your own, never in `ctx.sky` (its brightest pixel is a street lamp, which the environment turns to the world's key light; as a visible sky it would also count as day). 1.75 MB |
| `texture-snow-aerial` | a snowfield photographed from the air, one tile 80 m across: patchy snow over dark soil and scrub, for mountain slopes and ground seen from far off (`ctx.assets.surface`), where a 2 m snow tile repeats |
| `texture-snow-trodden` (2 m), `texture-chalet-planks` (1.57 m), `texture-roof-slates` (3 m), `texture-stone-wall` (1.5 m), `texture-dark-rock` (2 m) | scanned surfaces for an Alpine resort: snow trodden into paths with boot prints; dark weathered horizontal plank siding (chalet walls); a weathered roof of small grey-brown slates; dry-laid flat stacked stone (chalet bases, terraces); dark layered rock with fractured ledges (outcrops, with `project: 'box'`) |
| `texture-fir-cards` | not a surface: an atlas of three conifer branch sprays on green, colour, normal and an `alpha` cut-out map, for alpha-tested branch cards on firs and spruces. `ctx.assets.texture` gives `alphaMap` and `cards`, each spray's rectangle (below) |
| `model-lantern` | an antique brass hurricane lantern 0.29 m tall (0.12 m across) with a carry handle; its smoky glass globe, 0.06 to 0.13 m up, is a part of its own (`Lantern_01`, `Lantern_01_glass`). Nothing glows: the flame and its light are the world's |
| `model-lounge-chair` | a mid-century swivel lounge chair 1.17 m tall, 1.01 m wide and 1.19 m deep: a bent-wood shell with worn brown leather cushions on a five-star base; it faces +z |
| `model-bar-stool` | a vintage wooden bar stool 0.75 m tall with a round seat 0.48 m across, beaded trim and a ring footrest |
| `model-coffee-table` | a round coffee table 1.3 m across and 0.49 m tall, a white marble top on looping black metal legs |
| `heightfield-massif` | not a surface: a terrain, a snow-capped mountain massif on a square 5 km a side (1024 x 1024 heights, 16-bit, about 4.9 m apart), about 4.5 km across and rising from 1.3 m on the flat plain at its edges to a summit of 1988 m a little east and south of the middle: sharp rocky ridges run west and south from the summit with cliffs on their flanks, a broad snow bowl opens to the north below them, and eroded spurs and gullies fall away all round. Its `colorMap` (1024 px) is the snow cover with bare grey rock on the steep faces. For mountains round a valley, seen from afar: `ctx.assets.heightfield` (below). 1.92 MB |

`ctx.assets.human(id, options)` returns `{ object, animate, name, color }`: return it straight
from `player()` or `rival()`. It idles when standing, plays a standing start when it first moves,
runs and sprints with its stride matched to its speed, falls when it crashes, and leans into
bends. It stands plumb on a slope, so a track may climb steep stairs. Options, all optional:

```js
ctx.assets.human('human-athlete-male', {
  skin: 'african', skinTint: '#FFFFFF', hair: 'short04', hairColor: '#1A120C', eyes: 'brown',
  height: 1.86, build: { muscle: 0.8, lean: 0.4 }, face: 'african',
  outfit: { top: '#15264F', trim: '#D22B3A', shorts: '#15264F', shoes: '#F4C542',
            pattern: 'band',                 // plain, band, sash, stripes, split, checker, yoke
            bib: { name: 'BANKS', number: '28' }, glow: 0 },   // glow lights the trim
  name: 'Banks (USA)', color: '#15264F',
})
```

`tone: '#RRGGBB'` in place of `skin` and `skinTint` picks the nearest skin texture and tints it
to that colour.

`hairColor` tints the style's own hair, which is dark: it can warm it or darken it, never lighten
it (a white `hairColor` on most styles is still dark hair). For grey, silver, white, blond or dyed
hair add `hairDye: true`: the hair is then drawn in `hairColor` itself, its strands' light and
shade kept (`hairColor: '#E4E1DA', hairDye: true` is silver-white). It works on every style, the
people pack's too; the brows and lashes keep the tint.

For a world with the sword on: `weapon: { blade, grip, trail }` (colours, or `true`) puts a katana
in the right hand, carried back along the forearm while running and brought round for a cut,
with a trail on the swing; `stance: 'guard'` stands on guard instead of idling. The athlete then
cuts when the player swings and dies when cut down.

Headgear (a mask, a helmet, a band) goes on the athlete's `head` bone. The body's shape moves the
face off that bone by centimetres, so fit gear to the mesh itself: its geometry's
`userData.groups` names each group in order (`body`, `eyes`, `brows`, `hair:<style>`, ...),
and the vertices the head carries give the brow line, the eyes and the face's width and depth.

`ctx.assets.cyclist(id, options)` puts the same athlete on a racing bicycle and returns
`{ object, animate, name, color, radius }` for `player()` or `rival()`. The bike is built and
fitted to the rider (saddle height from the legs, the bars from the arms); the rider's own
skeleton is posed on it every frame: hips on the saddle, back flat, feet on the turning pedals
and hands on the drops by IK. The wheels and cranks turn with the speed, the bike leans into
bends at the angle a real one would (less the track's banking), the rider stands on the pedals
to accelerate, and both go down in a crash. All the human options apply, plus:

```js
ctx.assets.cyclist('human-athlete-female', {
  skin: 'caucasian', height: 1.72, outfit: { top: '#1D3F9E', trim: '#E4002B', shorts: '#1D3F9E', shoes: '#FFFFFF', pattern: 'band', bib: { name: 'DUBOIS', number: '14' } },
  bike: { kind: 'track', frame: '#1D3F9E', trim: '#FFFFFF', rear: 'disc', front: 'five' },  // kind: track or road; wheels: disc, five, deep, spoked
  helmet: { kind: 'aero', color: '#FFFFFF', trim: '#E4002B', visor: true },               // kind: aero or road
  name: 'Dubois (FRA)', color: '#1D3F9E',
})
```

A track bike has a disc wheel, a five-spoke front and a fixed gear; a road bike deep-section
rims and a vented helmet. Build the track for a bicycle: bikes go the runtime's speeds, so
leave room in the bends. `outfit.top: null` leaves the chest bare. `ctx.assets.ready(id)` is false if the library could not
load: always keep a fallback of your own. `ctx.assets.info(id)` lists an asset's skins, hair and
clips.

`ctx.assets.skater(id, options)` puts the same athlete in a speed-skating skinsuit on clap skates
and returns `{ object, animate, name, color }` for `player()` or `rival()`. The skater's own
skeleton is posed every frame through the stroke: a deep sit with the trunk near level, a glide
over one skate while the other pushes out sideways until the leg is straight and the clap's heel
lifts off the blade, then the recovery back under the hip. In the bends the skater leans in and
crosses over; the hands rest on the back while cruising, swing when driving, and the outside one
swings through bends; from a standstill the first strides are a run on the blades. The blades
stay on the ice. All the human options apply, plus:

```js
ctx.assets.skater('human-athlete-female', {
  skin: 'caucasian', height: 1.72, build: { muscle: 0.8, lean: 0.5 },
  suit: { color: '#F36C21', trim: '#1B1B1B', accent: '#FFFFFF', pattern: 'panels',   // panels, split, band, chevron, stripes, plain
          code: 'NED', number: '12', gloves: '#16171A', hood: true },               // country and number on the back and thighs
  skates: { boot: '#F2F2F0', trim: '#F36C21', tube: '#1B1C20' },
  glasses: { lens: '#C9A45A', frame: '#141416' },                                    // glasses: false for none
  name: 'Mulder (NED)', color: '#F36C21',
})
```

`suit` also works on `ctx.assets.human` (a skinsuit for any athlete: the kit and hair are hidden
under it, the feet are left for the world's own footwear). Build an oval for skaters: they lean
hard at the runtime's speeds, so give the bends a radius of 25 m or more.

Street clothes for any library human (`clothes`, painted onto the body; the kit's singlet and
shorts come off, its `shoes` stay) and small things worn (`gear`):

```js
ctx.assets.human('human-athlete-male', {
  skin: 'caucasian2', hair: 'short04', height: 1.86, build: { muscle: 0.9, lean: 0.35 }, outfit: { shoes: '#F7F7F7' },
  clothes: {
    shirt: { kind: 'tank', color: '#F4F1EA' },   // kind: tank, tee, long, open, polo, uniform (a police shirt: badge, patches), hoodie (pouch, drawstrings),
                                                 // sweater (knit), shirt (collar, buttons; tie: '#8C1C1C' adds a tie), scrubs (V-neck), turtleneck,
                                                 // dress (to the knee: with pants: 'none'); print: plain, floral, stripes, camo, check; color2: the print's colour
    pants: { kind: 'jeans', color: '#4A6A92' },  // kind: jeans, trousers, shorts, cargo (thigh pockets), joggers, track (side stripes in color2), leggings, none
    jacket: { kind: 'vest', color: '#121012' },  // vest (leather, open), jacket (open, long sleeves), coat (to the knee), puffer (quilted),
                                                 // blazer (lapels), hazmat (a whole suit, neck to ankles: add gloves, boots, a mask)
    belt: '#2A1C12',                             // false for none
    gloves: '#1A1A1C', boots: '#2A1D14',         // optional: gloves on the hands, boots up the shins
    tattoos: { arms: true, chest: false, neck: true, color: '#1C2A38' },   // ink where the skin shows
    beard: 'full',                               // stubble, full, goatee
  },
  gear: { chain: '#D4AF37', shades: '#0E0F12', glasses: '#1A1A1C', cap: { color: '#101012', backwards: true }, beanie: { color: '#B8302A', pom: '#F2F2EE' },
          bandana: '#8C1C1C', police: '#111827', mask: '#9CCBE6', backpack: '#2D4F7E' },
})
```

Mix them so a crowd reads as people, not a uniform: a city's commuters in coats, blazers and
puffers, a hospital's scrubs, an outbreak's hazmat suits, a park's hoodies, joggers and track
pants. Hats and beanies hide the hair under them. A weapon for a street fight: `weapon: { kind: 'bat' }` (also
`baton`, `pipe`, `chain`, or a sword), carried in the right hand.

**The people pack**: real clothes, more hair and older people. List the pack next to its body
(`assets: ['human-athlete-male', 'human-pack-male', 'human-athlete-female', 'human-pack-female']`);
a world that leaves it out downloads none of it (11 MB for the male pack, 8.5 MB for the female):

```js
ctx.assets.human('human-athlete-male', {
  skin: 'caucasian-old',                    // african-, asian- or caucasian- with middle or old: the face stays that ethnicity's
  hair: 'short01', hairColor: '#C8C4BC',    // short01, short03, bob01, bob02, braid01, long01, ponytail01 (either body)
  build: { age: 0.8, weight: 0.4 },         // 0 to 1, with muscle and lean: age (an older frame), weight (a heavier body)
  wear: ['male_casualsuit03', { name: 'shoes02', color: '#3A2A1E' }, 'fedora01'],   // one per slot: suit, shoes, hat; color tints it
})
```

Suits for `human-athlete-male`: `male_casualsuit01` (navy shirt, grey jeans), `male_casualsuit02`
(blue long-sleeved top, jeans), `male_casualsuit03` (striped shirt, jeans), `male_casualsuit04`
(blue tee, jeans), `male_casualsuit05` (olive jacket over a shirt, jeans), `male_casualsuit06`
(white tee, jeans), `male_elegantsuit01` (black suit, shirt and tie), `male_worksuit01` (denim
overalls over a white tee). For `human-athlete-female`: `female_casualsuit01` (blue tee, jeans),
`female_casualsuit02` (blue tee, denim shorts), `female_elegantsuit01` (striped blouse, dark
skirt), `female_sportsuit01` (crop top, leggings). For both: `shoes01` (tan leather), `shoes02`
(worn boots), `shoes03` (black dress shoes), `shoes04` (black leather), `shoes05` (white
trainers), `shoes06` (blue trainers), and the hats `fedora01` and `fedora_cocked`.

A suit replaces the kit and any painted `clothes` (a beard, tattoos and gloves stay); shoes
replace the kit's shoes and painted boots; a hat, like a cap, a beanie or a hood, hides the hair.
Mix pack and painted people in one crowd. Without the pack, its names fall back: `caucasian-old`
is the young `caucasian`, an unknown hair is the body's first, and `wear` is ignored.

**The motion pack**: party motion, and the punch finisher's last blow. List `human-moves-male` or `human-moves-female` next to its
body (`assets: ['human-athlete-male', 'human-moves-male']`); a world that leaves it out gets none
of it, and the body itself is the same file either way. Its clips join the body's own
(`ctx.assets.info(id).clips` lists them) and play wherever a person's stance, gait or move is
named: in an open world a cast member's `stance`, `gait` and `act`, a crew look's `gait`, and
`s.brawl` for a body of your own. The times are at rate 1:

| clip | plays | what it is |
|---|---|---|
| `danceTwist` | loop, 1.33 s | the Twist: hips and heels swung one way and back, the arms with them |
| `danceCabbage` | loop, 2.5 s | the Cabbage Patch: the fists together, stirred round twice in front of the chest, bobbing |
| `danceLambada` | loop, 1 s | a partner's hold (left hand raised, right at the chest), the hips and a step out and back |
| `danceMacarena` | loop, 5.27 s | a whole Macarena: hands behind the head, on the hips, a hop, arms out, palms over, hands to the shoulders (the dance's quarter turn is a hop on the spot) |
| `drunkIdle` | loop, 8 s | swaying, a stagger, a hand to the head |
| `drunkWalk` | gait, 0.76 m/s (0.67 the female) | lurching steps: `gait: 'drunkWalk'`, paced to the speed like the walks |
| `drink` | once, 6.5 s, contact 2.5 s | a drunk's long drink: a mug in both hands, up to the mouth in the right (at `contact`), the head tipped back, down again |
| `toast` | once, 1.37 s, contact 0.4 s | a glass raised high in the left hand (at `contact`) and lowered |
| `cheer` | once, 1.13 s | a jump for joy, the arms flung up, landing a step forward |
| `smash` | once, 1.57 s, contact 0.38 s | the right hand up over the head and down in a lunge (a bottle over someone's head), from a crouch; `contact` is the downswing |
| `leanBar` | loop, 2.5 s | leaning forward on the forearms on a rail or bar top 1.05 m high (0.93 m the female), its edge 0.3 to 0.6 m in front of the feet |
| `sitTalk` | loop, 2.93 s | seated, talking with the hands: hips 0.58 m up (0.53 m the female), a seat about 0.48 m high |
| `crush` | once, 1.5 s, contact 0.56 s | from the fight guard: a step in and down onto the right knee (hips 0.5 m up), the right fist high overhead (elbow up, the shoulder turned back), then driven straight down onto a head on the ground: at `contact` the knuckles are 0.21 m over the floor, 0.56 m ahead of the body's spot and 0.26 m to its right; held there a beat, then back up into the guard. Keyed by hand (the fists the guard's). A hero who only punches throws it as his finisher (`open.kicks: false`, below) |

Heights are at the bodies' own heights (1.87 m and 1.70 m) and scale with `height`. The dances and
`drunkIdle` keep their hips' own sway over the spot (the Twist 0.27 m, the drunk 0.38 m, the
others about 0.1 m): stand dancers a metre apart. `drink`, `toast` and `smash` thrown while walking
play on the arms over the walking legs. Nothing is held: put the glass, mug or bottle on the hand
bone, `person.object.getObjectByName('wrist_R')` (the drink and the smash; `wrist_L` for the
toast). Motion capture has no fingers, so the captured clips' hands rest loosely closed.

**An endoskeleton** (optional): `endo` draws the person as a machine of warm, grimy nickel chrome
in place of the skin, kit, clothes, garments, hair and eyes: a heavy machine, its outline close
to the person's own at full muscle. A satin chrome skull with red optics on a thick ringed neck
between rods and cables, pistons out from the base of the neck and from behind it to big
ball-housed shoulders under domed caps, a Y plate over a deep cage of curved rib plates (chevrons
from the front, an open arch under the sternum) crowded with cylinders, shoulder-blade plates and a
backbone behind, a thick segmented spine between pistons and hoses, a wide pelvic girdle with
iliac plates and a drum on each hip, limbs that are bundles of big hydraulic cylinders round a
strut, heavy domed knees and hinged elbows, big five-fingered hands and four-toed plated feet,
with grime and dark rust stains. It moves on the person's own skeleton, so every clip, the fights, the finisher
and the pick-ups work as they do for anyone; standing still, its feet are set on the ground (on
the move, the capture is as it is):

```js
ctx.assets.human('human-athlete-male', {
  endo: true,                      // or { metal: '#D3C6AF', eyes: '#FF2A12', glow: 1, rim: 0.12, rimColor: '#FFDCB4' }: the chrome's tint, the optics' colour, their glow 0 to 4,
                                   // a faint rim 0 to 1 at its edges (0: none) and, optional, the rim's own colour (below)
  height: 1.95, build: { muscle: 1 },   // height and build as for anyone (a heavier build is a little heavier metal)
  weapon: { kind: 'bat' },         // a weapon or gear still goes on
})
```

The rim is the metal's own colour unless `rimColor` gives it one: then it is a light on the
machine's edges (dimmed where the part is grimy or rusted), which carries its outline where the
chrome reflects much the same colours as the ground round it, a night of cool snow, ice and a dark
deck. Use it with a `rim` of 0.6 to 1, and pick a colour away from the world's: warm (`#FFDCB4`)
against a cool night, cool against a warm one. A warmer `metal` does the same for the body: AI
Alps' hero is `{ metal: '#E6C89A', rim: 0.8, rimColor: '#FFDCB4', glow: 2 }`.

Write it as `endo: ...` in the world's source: the page carries the endoskeleton's script only for
a world whose source says so (a body given `endo` without it warns and is drawn as the person). It
returns what any person returns, and `bones` besides: the skeleton's bones by name (`head`,
`wrist_R`, `foot_L`, `finger2-3_L` ...), for hanging things on it. Chrome shows what it reflects:
give the world a `graphics.environment` with its own light in it (bright `extras`: lit ground,
windows, lamps, signs), or at night the machine is a dark shape with red eyes. A body that cannot
be built warns and is drawn as the person instead. About 155,000 triangles (72,000 on phones),
built once per body.

`ctx.assets.car(options)` builds a racing car for `player()` or `rival()` in a world with
`play.vehicle` and returns `{ object, animate, name, color, vehicle }`: return it as it is (set
`name` and `color` on it for a rival). It needs no library asset. Five kinds, each built from its
class's real dimensions: `hypercar` (a road hypercar, cab-forward, a big rear wing), `formula`
(a single-seater: open wheels, halo, wings, sparks from the floor at speed), `stockcar` (a stock
car with its number on the doors and roof, a window net, a spoiler), `monster` (a monster truck
on 66-inch tyres and long-travel shocks) and `roadster` (an open two-seat sports car, also
`convertible`, `spider`, `speedster`: long bonnet, round lamps in the wings, a raked screen, a
leather cockpit and speedster humps) and `van` (a step van, a food truck, also `foodtruck`,
`icecream`: a tall box over a short cab, a serving window under a striped awning on the kerb
side, polka dots (`pattern: 'dots'`) and a cone (`art: 'cone'`) on its flanks, its `livery` name
big on the side and the roof, a lit `sign` over the cab, a `motto` on the back doors). The paint is clear-coated with its livery painted on
the body; a driver in a helmet turns the wheel. The car drives by itself: wheels roll and steer,
the body rolls, dives and squats, the gears climb and the exhaust pops, brake lights and discs
glow, and in a crash it spins, flips or barrel-rolls with sparks, smoke and debris.

```js
ctx.assets.car({
  kind: 'formula', paint: '#0E7C86', trim: '#F2F2F2', accent: '#FFB000',
  pattern: 'split',                 // plain, stripes, arrow, split, flames, teeth, bands
  number: '27', livery: 'AURORA',   // the number on the car, a name along its flanks
  driver: { suit: '#101820', helmet: '#FFB000' }, rims: '#23252A', calipers: '#C8102E',
  metallic: 0.2, chrome: false, iridescent: false,   // paint: how metallic, mirror chrome, colour-shift
  glow: '#FF2A2A', spikes: false,   // a meaner rival: neon under the car; spikes on a monster truck
  name: 'Aurora GP', color: '#0E7C86',
})
```

Make later rivals meaner: `glow`, `chrome` or `iridescent` paint, `spikes` on trucks. A car is
authored facing +Z like any character; do not scale it. Any car can be `armed: true` (twin guns
on its roof, fired by the runtime in a derby); a van can wear a `topper: 'swirl'` (a grinning
soft-serve on a spring that rocks with every lurch, `swirl: '#FFB3CF'` its colour). A car takes
damage by itself: smoke from under the bonnet as it is hurt, and a wreck sags, burns and scorches.

```js
ctx.assets.car({ kind: 'van', paint: '#F8F5EF', trim: '#F0468C', accent: '#FF8DC0', livery: 'SCOOPS',
  sign: 'ICE CREAM', motto: 'BRAKES FOR SPRINKLES', topper: 'swirl', armed: true })
```

A person at the wheel: `driver: { human: 'human-athlete-male' }` (or `-female`; list it in
`assets`) seats the library's scanned athlete in the car in place of the helmeted driver: hips on
the seat, feet on the pedals, hands on the wheel turning with it, head into the bends. All the
human options apply inside `driver` (`skin`, `tone`, `hair`, `hairColor`, `height`, `outfit`).
Use it for every open car (a roadster's driver is in full view) and for anyone the story puts
behind a wheel; a roadster's `interior` is the leather's colour. The returned car's
`driver.bones` is the seated person's skeleton: a costume's hat, beard or glasses go on
`driver.bones.head`, fitted to the mesh as for any athlete (see headgear above).

```js
ctx.assets.car({ kind: 'roadster', paint: '#B01C22', interior: '#7A4326',
  driver: { human: 'human-athlete-male', skin: 'african', hair: 'short02', outfit: { top: '#F4F1EA' } } })
```

`ctx.assets.surface(id, options)` returns a scanned surface as a ready material, laid on by
where each point is in the world at the scan's true scale, so it needs no UVs and fits geometry
of any size: ground, beaches, pavements, walls, cliffs. Across a big field the scan is shifted,
turned and blended region by region with a broad light-and-dark mottle, so no repeat shows to the
horizon. Use it for every ground and every wall; a flat colour is never ground.

```js
var sand = ctx.assets.surface('texture-sand');                           // ground, laid from above
var wall = ctx.assets.surface('texture-plaster', { project: 'box', color: '#F3E4D0' });  // walls, rocks: from all three sides
var road = ctx.assets.surface('texture-cobblestone', { size: 3, roughness: 0.9, normal: 1.4, mottle: 0.2, clearcoat: 0.6 });  // wet
```

Options: `color` (a tint), `roughness` and `normal` (multipliers), `size` (metres a tile covers),
`project` (`'ground'` or `'box'`), `mottle` (0 to 0.6), `variety: false` (one plain tiling),
`clearcoat` (wet, polished), `side: 'double'`. It returns `null` if the library could not load:
keep a material of your own.

`ctx.assets.texture(id)` returns the raw maps instead, `{ map, normalMap, roughnessMap, size }`
(`size`: metres one tile covers), for geometry with its own UVs: set `repeat` on the maps to match
(a `ribbon` of width w spans u 0 to 1 across and v one unit per w metres along).

An atlas with a cut-out (`texture-fir-cards`) also gives `alphaMap` and `cards`: one
`{ uv: [u0, v0, u1, v1], stem: 'right' }` per spray, v measured up from the image's foot as three.js
samples it, the cut stem at u1. Build a card from a plane whose UVs span one rectangle, with
`alphaMap`, `alphaTest: 0.5` and `side: THREE.DoubleSide`, set the maps' `wrapS`/`wrapT` to
`THREE.ClampToEdgeWrapping`, and fix the stem end to the trunk; instance the cards along each tier.
`size` (1) is nominal: the publisher gives no scale, so size the cards yourself (a fir branch is
about 0.5 to 1.5 m).

`ctx.assets.heightfield(id)` returns a terrain listed in `assets` (kind `heightfield`:
`heightfield-massif`): `{ width, height, data, size, range, sample(u, v), heightAt(x, z), colorMap }`.
`data` holds `width` x `height` heights from 0 to 1, row by row from the image's top; `size` is the
metres a side covers and `range` the `[lowest, highest]` metres 0 and 1 stand for. `sample(u, v)`
reads it bilinearly, u west to east (x) and v north to south (z), both 0 to 1 and clamped;
`heightAt(x, z)` gives metres with the field centred on x = z = 0, ready for `open.ground`.
`colorMap`, when the terrain has one, lines up with a plane laid flat (`rotation.x = -Math.PI / 2`).
It returns `null` when the id is not loaded. The massif's 5 km and 2 km are its publisher's scale for
the series (the source holds heights 0 to 1), and the camera sees 1800 m: shrink the mesh to fit,
the same in x, y and z.

```js
var hf = ctx.assets.heightfield('heightfield-massif');
if (hf) {
  var geo = new THREE.PlaneGeometry(hf.size, hf.size, 255, 255);   // 256 x 256 points: plenty far off
  geo.rotateX(-Math.PI / 2);
  var p = geo.attributes.position;
  for (var i = 0; i < p.count; i++) p.setY(i, hf.heightAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  var massif = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: hf.colorMap, roughness: 0.9 }));
  massif.scale.setScalar(0.3);                                      // 1.5 km a side, peaks 600 m up
  massif.position.set(0, -20, -950);                                // north of the play area, inside 1800 m
  ctx.scene.add(massif);
}
```

`ctx.assets.model(id)` returns a scanned model: `{ object, parts, size, part(name), instanced(count, fn, parts) }`.
`object` is the whole model (a new copy each call), `part(name)` one of its parts (a rock of the
set, a fern), `size` its bounding box in metres. Scenery repeated along the track goes in one
`instanced(count, (i, dummy) => { dummy.position.set(...); dummy.rotation.y = ...; dummy.scale.setScalar(...) }, parts)`
call: every copy of every part in a handful of draw calls. Models are at true scale and stand on
y = 0: place them, never stretch them into something else. A kit (the table says so) has each part
centred on its own spot at y = 0, so its `object` is not a layout: place its parts.

Every map of every model a world lists stays in graphics memory for the whole run, whether the
world places it once, a thousand times or not at all; more copies cost nothing, another model does.
On a phone each set of maps costs about 28 MB: most models have one, a heavy one two (about 56 MB), the
fort three, the street seating four (about 112 MB); a plant or the plastic crate, cut out, about 37 MB.
Keep a world's models to about 160 MB in all (five or six models), less when it also lists people,
a city map or more than one sky: a phone that runs out reloads the page. List only the models the
world places, and prefer one kit's parts to several separate models.

```js
var lamps = ctx.assets.model('model-street-lamp');
if (lamps) ctx.scene.add(lamps.instanced(40, function (i, d) { var p = ctx.track.pointAt(i * 25, 13, 0); d.position.set(p.x, 0, p.z); }));
```

### graphics (optional)
Turns on the runtime's cinematic renderer. Use it whenever the world should look its best,
and always for a realistic world. Every value is optional and bounded.

```js
graphics: {
  preset: 'daylight',                            // optional: 'daylight', 'golden', 'moonlit' or 'toy' (below; a kart race also 'kart')
  exposure: 1,                                   // 0.3 to 3, filmic tone mapping
  environment: true,                             // light every surface from the world's own sky
                                                 // (or { hdri: 'hdri-sunset-city', intensity, extras },
                                                 // or (ctx) => Object3D of extra bright shapes, such
                                                 // as floodlight panels; a library sky's sun is
                                                 // turned to match your key light)
  bloom: { strength: 0.5, threshold: 1, radius: 0.7 },  // glow on anything brighter than white
  grade: { contrast: 1.04, saturation: 1.05, warmth: 0, vignette: 0.25, grain: 0.015,
           split: 0, highlights: 1, paper: 0 },   // a painter's dusk: split 0-1 lifts the shadows cold and
                                                  // warms the highlights, highlights 0.6-1.6 keeps their
                                                  // heat while mid-tones stay muted, paper 0-0.08 a still
                                                  // paper grain
  shadows: { extent: 38, mapSize: 2048 },         // a sharp shadow map that follows the player
  reflections: true,                              // the world itself in cars' paint and glass, kept live
  motion: 0.5,                                    // 0 to 1: the edges of the picture stream with speed
}
```

- `preset` is a calibrated starting point for the time of day: it sets the exposure, bloom and
  grade (anything you set yourself wins) and, with a photographed sky, draws the sky at a
  brightness that suits the light whichever photograph it is, and lights the world from it at
  the preset's strength. `daylight` for sun and open sky, `golden` for the low warm sun of
  sunrise or sunset, `moonlit` for night (the sky dim, lamps and neon carrying the picture),
  `toy` for a bright, saturated toy or cartoon world. Use one unless you have a reason to tune
  every value by hand.
- The environment is baked from `ctx.sky(...)` if the world built one, otherwise from the theme.
  Metal, wet skin, glass and paint only look real with it on: use `MeshStandardMaterial` or
  `MeshPhysicalMaterial` with honest `roughness` and `metalness`.
- Bloom catches colours brighter than white: give lamps, floodlights, neon, lava and the sun
  `emissive` colours with `emissiveIntensity` of 2 to 12. Ordinary surfaces never glow.
- The shadow map follows the player, so the one shadow-casting `DirectionalLight` needs no
  shadow camera of its own. Scenery far away does not need to cast shadows.
- In an open world on its own ground (no `map`), `shadows: { follow: 'hero' }` (optional) keeps
  the shadow map on the hero, a little ahead of him where the camera looks (ahead of the camera in
  a scene), and `reflections: 'hero'` (optional) films the live cube from his chest, for his chrome.
- `reflections` renders the world round the player into a cube, a face a frame, for the paint,
  glass and chrome of `ctx.assets.car` (not on phones). Use it in a world of cars.
- `motion` blurs the edges of the picture outward with speed, keeping the middle sharp. Use it
  in a world of cars (about 0.5); runners do not need it.
- The runtime lowers the resolution, then the antialiasing, then the reflections, then the
  bloom if a device cannot hold 60 fps.

### camera (optional)
`{ distance, height, fov, side, look }`: metres behind the player (3 to 14), metres above
(1.8 to 6.5), field of view (50 to 78), metres over the right shoulder (-2 to 2, default 0) and
the height the camera aims at 9 m ahead (0.3 to 3, default 1.3). The camera holds that distance
at any speed. Under 5 m is a close action view with the athlete a third of the screen tall or
more; aim it lower (`look` about 0.7) so the feet stay in frame, and put it over the shoulder
(`side` about 0.8) so the athlete does not hide the track ahead. 9 (the default) shows more of
the course. The runtime drives the camera; this only frames it. `ctx.camera` is
read-only: read its position (to face a billboard at it), never write to it.

### track
`{ points: [[x, y, z], ...], width }`. 6 to 80 control points forming a closed loop (do not
repeat the first point at the end), smoothed into a Catmull-Rom spline. `y` is height, so the
loop can climb and dip gently. A point may carry a fourth value, `[x, y, z, bank]`: the track
banks there, in degrees up to 45, positive raising the right-hand edge (the outside of a
left-hand bend), and eases between points. Everything on the track tilts with it: runners,
rivals, coins, obstacles and `ribbon()` lines. A velodrome banks its bends at about 42 degrees
and its straights at about 12. A lap must be 320 to 900 metres; the runtime rescales a loop
outside that. `width` is 8 to 18 metres. The loop must never pass close to itself. Give it a
shape that belongs to the world: a figure that winds round a lake, climbs a hill, snakes
through a market.

### build(ctx)
Build everything that is not a character or an obstacle: sky, ground, water, the track's
surface, scenery, lights (at least a HemisphereLight and a DirectionalLight in the world's
own colours; one shadow-casting light, with a map of 1024 or smaller unless `graphics.shadows`
sizes it).

Lights are in the runtime's units (three.js's legacy units), not physical ones: a sun
(`DirectionalLight`) of 2 to 4, a `HemisphereLight` of 0.4 to 1.5, and a lamp (`PointLight`,
`SpotLight`) of 0.5 to 4. A lamp's light fades from full at the lamp to nothing at its
`distance`, so always give it one; without a distance it never fades. Physical values in the
tens or hundreds wash the whole picture out white.

- Draw the track surface with `ctx.track.ribbon({ width, offset, y, color | material })`. It
  returns a `Mesh` and does not add it: `ctx.scene.add(ctx.track.ribbon({...}))`.
  Ribbons for edges, stripes, kerbs, boardwalk planks and so on are cheap.
- Keep the racing corridor clear: nothing taller than 0.8m within the track's half width plus
  1.2m of the centre line, below 7m. Use `ctx.track.clear(x, z, margin)` before placing
  scenery. Overhead arches and banners must clear 7m. The runtime hides anything that
  intrudes, because the chase camera would be inside it.
- Put scenery in `ctx.scenery` (a Group) or straight into `ctx.scene`.
- Anything repeated more than a dozen times goes through `ctx.instanced(geometry, material,
  count, (i, dummy) => { dummy.position.set(...); dummy.scale.set(...); })`.

### player(ctx) and rival(ctx, k)
Each returns `{ object, radius?, name?, color?, animate? }`.

- `object` is a `THREE.Object3D`, authored **facing +Z** with its feet on **y = 0**, about 1
  to 2.5 metres tall. The runtime carries it along the track inside its own container, so
  animate `object` and its children freely (hop, bob, lean, flap, tumble).
- `radius` is optional; the hitbox is measured from the model, so make the model's footprint
  honest.
- `name` and `color` (rivals): shown in the level-up banner and the rear warning.
- `animate(t, dt, s)` runs every frame. `s = { speed, lateral, crashed, paused }`: speed in
  m/s, lateral steering speed (positive is to the player's right), and whether this run just
  crashed. With the sword on it also carries `attack` (`{ t, n }` while swinging: seconds into
  the swing and which of three cuts) and, for a rival, `slain` once it is cut down.
- `rival(ctx, k)` is called for k = 1, 2, 3, ... with no upper limit. Every rival must be
  distinct in colour and name, and later ones should look meaner: bigger, spikier, glowing,
  whatever fits. Handle any k (cycle a list of names, add numerals, vary the build).

### obstacles(ctx)
Returns an array of `{ at, x, object, radius?, move?, animate? }`.

- `at` is where on the lap, from 0 to 1. `x` is metres from the centre line (positive is to
  the right when facing forward).
- `object` is authored like a character: facing +Z, resting on y = 0.
- `move: { amplitude, period }` slides it side to side (metres, seconds).
- Keep the first 45 metres clear, average at most one obstacle per 11 metres of track, and
  never close a row: always leave a gap wider than the player. The runtime repairs these,
  but a repaired course is a worse course.
- Obstacles are part of the world: logs in a swamp, crates in a market, snowmen on a slope.
- Height decides how one is passed: lower than nine tenths of the hero is jumped (Space, JUMP),
  taller is steered round. A hurdle race lays hurdles; a world can mix low ones to jump and tall
  ones to dodge.

### update(ctx, t, dt) (optional)
Ambient life every frame: water shimmer, swaying reeds, fireflies, drifting clouds, birds.
`t` is seconds of game time (it stops while paused).

### ambient(ctx) (optional)
Called once, after the first key press or tap. `ctx.audio.context` is an AudioContext and
`ctx.audio.destination` a gain node to connect to: frogs, wind, market chatter, all
synthesised. Keep it quiet; the runtime plays the coin, level and crash sounds.

### ctx
- `ctx.THREE`, `ctx.scene`, `ctx.scenery`, `ctx.camera`
- `ctx.theme` (resolved colours), `ctx.rules` (the rule numbers, read-only: `pace(level)`,
  `rivalSpeed(k, level)`, `rivalAggression(k, level)`, `obstaclePace(level)`)
- `ctx.quality`: `'high'` on laptops and desktops, `'low'` on phones and tablets. On `'low'`, build
  lighter: fewer instances, simpler meshes. The track, the rules and the obstacles stay the same.
- `ctx.random()`: seeded by the world's title, so a world builds the same every time
- `ctx.track`: `length`, `halfWidth`, `width`, `frameAt(d)` (returns `{ pos, tan, right, up }`),
  `pointAt(d, x, y)`, `nearest(x, z)` (returns `{ d, distance, lateral }`), `clear(x, z, margin)`,
  `ribbon(opts)`
- `ctx.textures.canvas(width, height, (g, w, h) => { ...draw with 2D canvas... }, { linear })`:
  colour maps by default; pass `{ linear: true }` for roughness and other data maps
- `ctx.textures.normal(width, height, (g, w, h) => { ...draw heights in greys... }, strength)`:
  a normal map from a height field (white is high): grain, weave, cracks, pores
- `ctx.sky({ top, horizon, bottom, sun: [x, y, z], sunColor, sunSize, glow, haze, curve })`: a sky
  dome with a glowing sun (`sun` is the direction towards it, `sunSize` in degrees; `curve` above
  0.45 keeps the horizon colour higher up the sky); it always stays around the camera. Match
  `sun` to the direction of your key light.
- `ctx.sky({ hdri: 'sky-noon', sun: [x, y, z], exposure, light })`: a photographed sky from the library
  (list it in `assets`), turned so its sun stands at `sun`'s bearing, at the height it was
  photographed; the environment lighting is baked from the same photograph. `exposure` (0.1 to 4)
  is how bright the sky looks, and the light follows it unless `light` (0 to 4) sets the light on
  the world apart from the look. The skies differ a lot in brightness and draw without tone
  mapping (`sky-overcast`, `sky-dusk` and `sky-night` wash out white at 1): under a
  `graphics.preset`, leave both out and the runtime calibrates them. A photograph with
  land in it (`sky-beach`, `sky-city-night`) takes `face: [x, z]` in place of `sun`: its sea or
  skyline is turned to lie that way, so the photograph's sea meets the world's sea. Either way,
  light the world from the photograph: the returned mesh's `userData.sun` is the direction of
  its sun (put the key light there) and `userData.haze` the colour of its horizon (the fog).

  ```js
  var sky = ctx.sky({ hdri: 'sky-beach', face: [1, 0] });          // the sea lies east
  var sun = new ctx.THREE.DirectionalLight('#FFF3E0', 3.2); sun.position.copy(sky.userData.sun).multiplyScalar(200);
  ctx.scene.fog = new ctx.THREE.Fog(sky.userData.haze, 300, 2400);
  ```
- `ctx.water({ y, color, deep, waves, wind: [x, z], shore, beach, surf, reflect, size })`: a sea
  or a lake to the horizon at height `y`: long swells (`waves` 0 to 2), ripples blown by `wind`,
  the world's reflection, turquoise over the shallows and `deep` farther out. `shore` is the
  waterline as `[[x, z], ...]`, walked with the water on its left; the water stays off the land
  and the swell dies before the beach. `beach: { land, width, back, texture }` lays scanned sand
  from the land's height (`land`, flat for `back` metres) down under the water, and surf rolls in
  along the whole shore, foam and wet sand. One water per world. Keep the sea close to the road
  and in the camera's view: a coast world the player cannot see the sea from is not a coast.
- `ctx.instanced(geometry, material, count, fn)`
- `ctx.mirror(material, { y, strength, blur, distortion })`: makes a `MeshStandardMaterial` or
  `MeshPhysicalMaterial` on a level surface a live mirror of the world: ice, still water, a
  polished floor. The runtime renders the scene again from under the plane every frame; the
  material takes it as its reflection (its clear coat's when it has one, so ice is white paint
  under a mirror coat), bent by its normal map, blurred by `blur` and its roughness (sharp at a
  glance, soft looking down), and weighted by Fresnel. Every mirror lies at one height `y`. Give
  paint under the ice the same treatment so it reflects with it. It costs a second render:
  mark distant clutter (a bowl of fans, roof gear) `object.userData.noReflection = true` to keep
  it out of the reflection.
- `ctx.broadcast()`: a live television picture of the race for a world's big screens, as a
  texture for an `emissiveMap`. The runtime's own TV camera cuts between a rail camera beside
  the player, a long lens head-on and a high wide shot. Returns `null` on phones and tablets:
  always keep a screen picture of your own.
- `ctx.play`: the platform options as the runtime read them
- `ctx.on(name, fn)`: moments to stage in the world: `'lap'` (`{ lap, level, bounty, gm }`),
  `'swing'` (`{ n }`), `'slay'` (`{ name, slain }`), `'crash'` (`{ into }`), `'start'`; and, in an
  open world that asks for them with `open.events: true` (optional) or tells a `story`, its own:
  `'knockout'` (`{ kind, name, kos, heat, x, z }`), `'heat'` (`{ heat }`), `'goal'` (`{ gm, time
  }`), `'chapter'` (`{ chapter, beat, gm, objective }`, a story's beat beginning), `'weapon'` (`{
  kind }`, one picked up), `'intro'` (a scene beginning), `'finisher'` (`{ name, kind }`), `'heal'`
  (`{ hp }`) and `'shatter'` (`{ kind }`, a bottle or glass broken). Without either, those names
  are not heard.
- `ctx.audio` (inside `ambient`)

## Open worlds

When the creator ticks "Open world", the world is not a lap race: ignore the lap rules above
(track, laps, rivals joining at the line, obstacles, coins along a lap). An open world is a place
the player roams on foot, seen over the shoulder, and the game is survival: people come for the
player, the player knocks them out bare-handed in freeflow (a four-blow chain of punches that ends on a rising uppercut or a haymaker, now and then a roundhouse kick, and a dash at whoever he goes for up to 5 m off, the leaping kick only from 4.4 m; in a fight one on one the camera comes in close over his shoulder; `fight: 'boxing'` keeps a boxer's jab, cross and hook, which in a big fight run to five with body shots and uppercuts) or with a weapon picked up; a dodge (C or L, DODGE on a touch screen: a back flip, or a side flip the way the stick points) takes no harm, and done just before a man's blow lands is perfect: time slows and the next blow is a counter (there is no icon over his head: the wind-up is the warning, and the first two blows of a run slow time a moment and say how to dodge); a held attack launches a man and the hero rises with him, for two blows in the air and a slam whose landing hurts and knocks down whoever is close (he gets up a moment later); blows fill focus (three bars, shown under health), spent on a finisher (R, FINISH on a touch screen: a flying kick that puts a man down for good, two bars for a boss) or a heal (Z, HEAL: 35 health); a jump clears a blow too, their GM spills on the ground, and
the heat rises with time and knockouts. More come at once, each takes more punches, bikers join
at heat 2, the police arrive by patrol car from heat 3, and a boss comes at every third level. On the city map the
patrol car is one of the street's own vehicles, down the nearest avenue with its bar flashing (it lights the street
round it at night); `patrol: { car: 'suv' | 'sedan' | 'van' | 'pickup', color: '#ECEBE4', lights: ['#FFB020', '#2E6BFF'] }`
dresses it (a quarantine's white SUV, amber and blue).
The runtime runs the fight, the people's movement and routes round walls, the crowd, the heat,
the HUD (health, heat stars, a radar, the time survived) and the scores (the time survived). The
world says where it happens and who they are:

```js
GameMog.world({
  assets: ['human-athlete-male', 'human-athlete-female'],
  open: {
    map: 'ocean-drive',            // optional: a library map (below); without one, build the place yourself
    bounds: { x: [-80, 80], z: [-120, 120] },   // without a map: the walkable area
    spawn: [-4, 30, 180],          // x, z, facing in degrees
    heat: { every: 40 },           // seconds a level of heat lasts (15 to 180); kos, max, bosses, police, escort, room below
    health: 100, maxEnemies: 12, civilians: 12,   // optional: civilians as { count, look, zones, ... }, a crowd the world places (below); steps: 'snow'
    weapons: { count: 8, kinds: { bat: 3, pipe: 3, chain: 2, baton: 2, sword: 1 }, drops: true },   // or false: fists only
    gait: 'walkCool',              // the hero's walk: walk, walkCool, walkHeavy, walkF
    hud: { gm: 'Club fund', banner: 'Stack GM for the club. Survive.' },   // what the story calls the GM, and the first banner
    intro: { shots: [ /* the opening scene, below */ ] },
    goal: { gm: 10000, title: 'Cured', text: 'a line for the win' },   // always: 10,000 unless the creator names an amount
    outro: { shots: [ /* the closing scene, played when the goal is reached */ ] },
    story: { every: 1500, beats: [ /* optional: a scene and a new objective as the GM comes in, below */ ] },
    events: true,                  // optional: hear this open world's moments with ctx.on (a story turns them on too)
    keyArt: { at: [x, z], look: 107, tilt: 0.15 },   // where the thumbnail is shot: the player there, the camera looking along `look` degrees
    crew: {                        // who comes for you; every field optional
      thug:  { names: ['Hustler', 'Enforcer'], look: function (ctx, i, heat) { return { /* human options: clothes, gear, weapon */ }; }, hp: 3, damage: 7 },
      biker: { names: ['Road Dog'], look: function (ctx, i) { return { clothes: {...}, gear: {...}, weapon: { kind: 'chain' } }; } },
      cop:   { names: ['Officer Ruiz'], look: function (ctx, i) { return { clothes: { shirt: { kind: 'uniform' } }, gear: { police: '#111827' }, weapon: { kind: 'baton' } }; } },
      boss:  { names: ['El Jefe', 'La Reina'], look: function (ctx, i) { return { height: 2.02, build: { muscle: 1 }, clothes: {...}, gear: {...}, weapon: { kind: 'bat' } }; } },
      // or anything that is not a person: a creature body, and a shot from range
      // thug: { names: ['Zorg'], body: { plan: 'biped', height: 2.4, skin: { color: '#4FBF3A' }, head: { shape: 'dome', size: 1.5 } },
      //         ranged: { every: 3, range: 16, damage: 8, color: '#FF7A1A' } },
    },
  },
  theme: {...}, graphics: {...}, camera: { distance: 5.2, height: 1.55, fov: 54 },
  build: function (ctx) { /* scenery; ctx.solid(box or object) for anything nobody walks through */ },
  player: function (ctx) { return ctx.assets.human('human-athlete-male', { /* the hero: clothes, gear */ }); },
})
```

A look may name its body (`body: 'human-athlete-female'`). Other fields per kind: `hp`
(punches to put one down at heat 1), `damage`, `speed` (m/s), `reach` (m), `windup` (s),
`moves` (`jab`, `cross`, `hook`, `slash1` to `slash3`), `gm` (coins dropped), `weapon`.
Without a map, build the ground, the streets and the buildings yourself and give every wall,
car, tree and post a collider with `ctx.solid({ min: { x, z }, max: { x, z } })`, `ctx.solid({ x, z, r })`
or `ctx.solid(object)`; leave open ground to fight on. No `track`, `rival()` or `obstacles()`.

People move on captured motion (CMU): a crew look may set `gait` (`walk` everyday,
`walkCool` the street's cool walk, `walkHeavy` a big man's confident walk, `walkF` a woman's);
by default thugs walk cool, bikers and bosses heavy, women their own walk. Fighters stand in a
boxer's guard and move on his footwork; stances for standing about: `shift` (weight shifting),
`argue`, `phone`, `arms`, `dance`; one-off moves: `shrug`, `wave`. With the motion pack listed,
its clips are stances, a gait and moves too (a party: `stance: 'danceMacarena'`, `gait:
'drunkWalk'`, `act: [['cheer', 1.5], ['drink', 4]]`).

**A crowd the world dresses and places** (optional; `civilians: 12`, a plain number, is the
street's people as they always were: beachwear, walking about at random). `civilians` may be an
object instead: `{ count: 18, look: function (ctx, i) { return { /* human options: body, clothes,
gear */ }; }, stances: { dance: 5, talk: 2, phone: 1, arms: 1, shift: 1 }, zones: [{ x: 0, z: 2,
r: 4.5, count: 10, stance: 'dance', face: [0, 9] }, { x: -11, z: 2, r: 2.5 }], wander: false,
turn: { kind: 'thug', share: 0.5 } }`. Every field is optional. `count` is how many (0 to 24).
`look` dresses each one from a plain body (the street's mix of skin, hair and height unless the
look sets them; nothing of the beach's clothes); without one, `crew.civ.look` is used if the
world gives it. `zones` are where they stand: each person gets a spot of their own in a zone
(`r` metres round `x, z`), the zones that give a `count` take theirs first, the rest are shared
among the zones that give none, and any left over walk about as the street's people do. At
their spot they do the zone's `stance` (a dance floor dances) or one picked by the `stances`
weights (`dance`, `talk`, `phone`, `arms`, `shift`, `argue`, or a motion pack's), and face the
zone's `face` point (dancers facing the DJ's booth), whoever they are talking to, or the zone's
middle. Dancers never move in step: each has a pace of their own, now and then steps off the
floor to talk or fold their arms, and with the motion pack listed may dance any of its dances.
They back off from a fight (a blow, a knockout near them): clear of the hero (8 m), for two
seconds at most, then they watch it, and walk briskly back to their spots, so a fight never
empties the floor for long; `wander: false` keeps them there, otherwise they move to another spot now and then. `turn`: when
the heat sends one more of the crew and someone of a zone is 6 to 30 m from the hero, by its
`share` (0 to 1) that party-goer turns on him (as `kind`, `thug`, `biker` or `cop`, in the clothes
they wore, with that crew's weapon if it has one) instead of one
arriving out of sight; a newcomer takes their spot a while later. With no zones nobody turns.

**Footsteps** (optional): `steps: 'snow'` crunches packed snow under the hero at his stride
(faster as he runs), and more quietly under anyone walking within 8 m of him. A world without
it hears nothing underfoot.

**A warm-up** (optional): `warm: true` compiles every material in the world and sends its
textures to the graphics card before the world is ready (a library map's always are), so a
glint, a beam or a bottle's shards do not stall a frame the first time they are seen. It costs a
little loading time, never the look. Use it in a world on its own ground with custom shaders or
party weapons. (What the world keeps hidden until it is used is compiled too.)

**The heat's own pace and what it sends** (all optional; each left out is as it always was).
`heat: { every: 180, kos: 0, max: 7, bosses: false, police: false, escort: 1, room: true }`:

- `kos`: the takedowns that raise the heat a level (default 8; `0`, by the clock alone).
- `max`: the highest the clock and the takedowns take it (1 to 99; none by default). A story's
  beat may still set it higher.
- `bosses: false`: the heat sends no boss at its third levels (a story's beats bring them). The
  publish playtest, whose autopilot plays no beat, then asks for a boss directly to see one come.
- `police: false`: no police at heat 3 and up (no patrol car; without a map, no officers on foot).
- `escort`: the most men a boss brings (0 to 3; default 3, one at his first, more later).
- `room: true`: a boss's men and the police's officers come only while `maxEnemies` has room for
  them, counting those already on their way; the boss himself always comes. Without it they
  come on top of `maxEnemies`.

Pace a long run with these: a 15 to 25 minute run wants the heat by the clock (`kos: 0`), a top
(`max`) and the bosses from the story, so the stakes rise chapter by chapter, never all at once.

**Coins that keep out of the way** (optional): `coinFly: 'low'`. A knockout's coins come a quarter
of a second after he drops, out low along the ground (under knee height) on the far side of him
from the camera, and fly to the hero at his waist, never between him and the camera. Without it
they spill up in an arc from his chest, as they always have.

**Faces far off** (optional): `lod: true` (or the metres from which, 4 to 80; `true` is 12):
people further from the camera than that, as far as the lens makes it (a scene's long lens sees
them from further off), are drawn without the face's small parts, the eyeballs, brows and lashes,
which are a pixel or two there and a draw call each (twice with shadows). Use it in a world with a
crowd; nearer, they are drawn whole.

The opening scene, `intro.shots`, plays letterboxed before the first run of a visit (Enter,
Space, Esc or Skip skips it; on a touch screen the pad is put away for any scene). Each shot: `t` seconds; `cam: { from: [x,y,z], to, look: [x,y,z] |
'og' | a cast id, lookTo, fov, fovTo }`; `cast: [{ id: 'og' | a name, kind: 'thug' (a new person),
at: [x,z] (placed at the cut), to: [x,z] or path: [[x,z], ...], speed, gait, stance, face: degrees |
'og' | 'cam' | [x,z] | a cast id, act: [['shrug', atSeconds, rate]], stay: true }]`; text:
`place` and `time` (a location card), `say` (a subtitle), `title` and `tagline` (the title card);
`fade: 'in' | 'out' | 'both'`. Whoever is marked `stay` is there when the run begins and comes
for you; the run begins where the scene leaves the hero. With `traversal` on, a mark may take a
height, `at: [x, z, y]`: they stand on the roof (or ledge) at or just below `y`, and a run that
begins there begins up on it. On the city map the street's own people keep out of a shot played at
street level, round its cast and camera. The closing scene (`outro`) takes the
same shots when the `goal` is reached, then the win. A cast member may bring its own `look` (any
human options, e.g. a doctor: white `jacket`, `gear: { mask: '#9CCBE6' }`, `weapon: { kind:
'syringe' }`), walk through walls with `ghost: true` (out of a doorway), and `act: [['heal', at,
seconds]]` drains a sickness away in a warm light. A human's `sick: 0 to 1` makes the skin pale
and grey-green, the eyes sunk, veins showing (the hero of an outbreak story); the heal cures it.
Knockouts drop the crew's `gm` (more with the heat), in up to a dozen coins.

**Every open world is a story with a goal.** The GM is what the hero is after (a vaccine, a
ticket home, the fuel for a ship), and `goal.gm` is how much: 10,000 unless the creator names an
amount. The HUD shows it as "of 10,000". Write the opening scene (`intro`) that introduces the
hero, the place and the mission, and what the GM is for (`hud.gm` names it), and the closing scene
(`outro`) where the hero gets it. A world with no goal gets 10,000 and a plain win.

**A story told as the GM comes in** (optional; a world without `story` plays no scene between its
intro and its outro). `story: { objective: 'Get to the party', every: 1500, wait: 20, beats: [...] }`: each
beat plays a scene once the GM reaches its `gm` (or, with `every`, the beats in order at 1,500,
3,000, ...), as soon as no blow is in the air, and then the run goes on where it was: the GM, the
heat, the knockouts, the time and the hero's health are kept. A beat: `{ gm: 1500, shots: [ /* the
intro's shots */ ], banner: 'Chapter 2', objective: 'Find the DJ', heat: 3, boss: true | 'Name' }`.
The scene clears the fight it cuts away from (any coins on the ground are banked first) and
whoever it marks `stay` is there when the run goes on; Enter, Space, Esc or Skip skips it as the
intro's. Then the `banner` (default "Chapter N") with the objective under it, the objective in a
line under the GM board (`story.objective` is the first, shown from the start), the heat raised to
at least `heat` (tougher people), and with `boss` a boss on his way (by that name if it is one). A
beat at or past `goal.gm` never plays: the goal comes first. Beats never play while the autopilot
drives, nor in a run made invincible or sped up (the attract demo, the playtest, films). While a
boss is on the hero or on his way a beat waits for him to go down, but only `story.wait` seconds of
the fight (0 to 120, default 20); then it plays all the same. A boss still standing then is set
aside for the scene and comes back after it, a few metres off and as hurt as he was, unless the
beat brings a boss of its own: then he goes with the scene, one boss at a time. The heat a beat raises brings what the heat brings as it climbs: a boss if it passes a
third level (the beat's own, if it names one) and, from heat 3, the police. A beat breaks into a
fight, so a skip is not taken for its first 0.7 s (a punch still being mashed), and on a touch
screen the pad is put away and Skip moves to the top right for it. Keep a story in one place with
rising stakes: the scene says what changed and what to do next.

**Through a machine's eyes** (optional, any shot of an intro, an outro or a beat): `vision: {
tint: '#FF1A1A', lines: ['TARGET: DJ VOLT', 'THREAT: LOW'], track: 'dj' }` washes the frame in
`tint` (its colour over the frame's light and dark), with fine scanlines, types the `lines` out one
by one in a monospace face (up to 10, 60 characters each), and holds a box on the head of the cast
member `track` names ('og' for the hero) wherever the camera goes. For a robot's, a cyborg's or a
drone's point of view; a shot without `vision` is the ordinary frame.

**Enemies can be anything the creator asks for.** When they are not people (aliens, robots,
monsters, animals, ghosts), they must not be people in costume: give the crew kind a `body`.
`body: { ... }` builds one from the platform's creature kit (`ctx.assets.creature`, also usable
anywhere else), animated by the runtime like a person: it walks, squares up, strikes, shoots,
flinches and goes down. Its options, all optional:

- `plan`: `'biped'` (two legs, two arms: aliens, robots, demons, mutants), `'beast'` (four legs,
  a long body, a neck and a tail: hounds, cats, lizards, insects), `'floater'` (hovers, no legs:
  drones, ghosts, jellyfish, orbs)
- `height` (m; for a beast, at the shoulder)
- `skin: { color, color2 (the belly), glow (eyes, spots and shots), spots (glowing dots, 0 to 20),
  pattern: 'spots' | 'stripes' | 'scales' | 'panels', metalness (a robot: 0.8), roughness, sheen, gloss }`
- `head: { shape: 'dome' (the classic big-skulled alien) | 'long' | 'round' | 'snout' | 'visor' (a
  robot), size (1 is a person's; 1.5 is too big, on purpose), eyes: { count (0 to 8), size, color,
  glow, shape: 'almond' | 'round' }, antennae, horns, mouth: false }`
- `body: { build (0 thin to 1 bulky), arms, legs, neck (lengths, 1 is a person's), fingers, tail,
  digitigrade, tendrils (a floater's), length (a beast's) }`
- `suit: { color, metalness }` for armour or a uniform over the skin
- `name`

For full control, `body` may be a function returning your own `{ object, animate(t, dt, s) }`
(forward is +z, the feet at y = 0); `s.speed` is m/s and `s.brawl` is `{ stance, action: { name,
id }, ko }`: a new `action.id` is a new move (a strike, a cast, a hit), `ko` is down for good.

`ranged: { every (s), range (m), speed (m/s), damage, size, color, keep (stay at range, default
true), melee (also fight up close, default true) }` gives a crew kind a shot: a fireball, a bolt,
spit or a beam, aimed a little ahead of the player. A jump clears a low one; a wall stops it. The
hero fights hand to hand and with what they find.

**Ground, GM, the hero's weapon and the hero's body** (all optional):

- `ground: function (x, z) { return height; }`: without a map, the walkable ground's height in
  metres (dunes, hills, a crater). Everyone walks on it and the camera stays above it. It runs
  for every person every frame, so keep it a cheap sum of curves, and build the ground mesh from
  the same function so the feet meet it.
- `coins: false`: no GM at all (also the creator's "No GM" option): no coins, no goal, no outro,
  no `hud.gm`. The run is survival and the board ranks the time survived, then the takedowns.
- `hero: { weapon: 'staff' }`: the hero's own weapon, always in hand and never worn out, swung
  in its three blows (`staff`: the longest reach, the third blow a sweep; also `sword`, `knife`,
  `bat`, `pipe`, `baton`, `chain`). Pair it with `weapons: false` when nothing else fits the world.
  The crew may carry `staff` and `knife` (a long curved knife) too.
- `words: { kos: 'Takedowns', kod: 'taken down', down: 'Fallen', by: ' brought you down.', won:
  'The desert won.' }`: the HUD's and the end screen's words, in the world's voice.
- A hero who is not a person (a plush, a robot, an animal): `player()` may return its own `{
  object, animate(t, dt, s), height, radius, timing }`, animated from the same state as a crew
  body (`s.speed`, `s.brawl.stance`, `s.brawl.action`, `s.brawl.ko`, and `s.air` while jumping);
  its moves are timed like a creature's.

**A hero with fewer moves** (all optional; leave them out and he fights as above). Each takes a
move away, and the controls card and the game page name only what is left:

- `kicks: false`: he only punches. No roundhouse, no leaping kick (out of reach he charges in and
  throws a punch), no air game; the chain runs jab, cross, hook, body shot, lead uppercut, and ends
  on a rear uppercut or a haymaker, never one motion twice running. A held attack throws a haymaker
  with everything behind it (the boxer's own looping hook, slow, the camera kicked), never the
  motion just thrown: with `impact` (below) a hold straight after a hook throws the rear uppercut
  instead, with the same power, falloff and rest. Thrown back to back (within 2.4 s, no other blow
  landing between them) each is wilder: 5, then 3, then 2 of power, and the next is wound up only
  once the last is done; a blow of the chain landing makes the next a full one again, so a combo
  ending on a held haymaker is the strongest way to fight. The finisher is a punch: a haymaker drops
  the man, faster than a knockout falls, and the hero's fist comes straight down on his head as it
  reaches the ground. With the motion pack listed for the hero's body (`human-moves-<gender>`), that
  second blow is the pack's `crush`: he drops to one knee beside the man, the fist high overhead,
  and drives it down onto his head once he is on the ground, holds it there and rises back into his
  guard (the finisher takes 2.1 s of game time, against the slam's 1.3).
- `jump: false`: he never leaves the ground. Space, K and JUMP do nothing (no JUMP button), and the
  air game is off. Space still skips a scene and starts a run. (With `traversal`, Space is the
  traversal's, so this changes nothing there.)
- `dodge: false`: he never flips or rolls. C and L do nothing (no DODGE button, no counter), and no
  warning slows time to say "Dodge".
- `tank: true` (or `{ block: 0.4 }`): he walks through blows. An ordinary blow neither shoves him
  nor makes him flinch nor stops his punch; one from in front of him (within 70 degrees of where he
  faces) while he is not throwing a punch (its wind-up and strike: once it has landed his guard is
  back up) lands on his forearms for `block` of its harm (0 to 1, default 0.4), his guard up, with
  sparks off his forearms and a clank of metal. A heavy blow (a boss's, or one of 14 or more before
  the heat adds to it) still rocks him back; the heat never makes an ordinary man's blow heavy.
- `impact: true` (on by itself with `kicks: false`; `impact: false` keeps it off): every landed
  punch connects. In the last 0.12 s before a blow lands the hero closes (or opens) the gap so his
  fist lands on the face (the chin for an uppercut, the ribs for a body shot), turned so a hook's
  fist comes onto it and leaning in over a shorter man; the man stops and squares up. Only a man the
  blow would have reached anyway is pulled in (by the very reach and cone it lands by, nothing
  added), so nothing that missed now lands. On the frame it lands the man's head, neck and upper
  back snap away from it the way the fist went (a hook turns his head, an uppercut lifts his chin, a
  body shot folds him), over his own flinch; a short true hit-stop holds both of them (55 ms for a
  jab or a cross, 70 ms for a hook, 110 ms for a heavy blow, 150 ms for a knockout, eased out) while
  he shudders; the camera is kicked along the blow with a touch of roll and a narrower lens for an
  instant (a heavy blow and a knockout 30% harder); a small flash, a ring and a spray of sweat leave
  the fist; and the hit is the fist's thud, louder: its tone falling from 120 + 30 x power Hz to 45
  Hz and its band of noise, twice as loud and held fuller as it falls, a little longer on a heavy
  blow, which (its peak held at the master's limiter) adds a sub, a sine falling from 70 to 32 Hz;
  a knockout a short, dark room after it. Nothing bright: no crack. A big blow near the world's
  crowd (`civilians` as an object) draws an "ooh"; a knockout stops longest, punches the camera in
  toward him a moment and falls in 0.7 s of slow motion. The chain's hook and
  haymaker and the finisher's haymaker are the boxer's looping hook (the freeflow hook's fist never
  reaches a man standing in front of him), so a held haymaker thrown after a hook (the same clip) is
  the boxer's rear uppercut. Every other world fights as before.

Hidden weapons are on unless `weapons: false`: `count` street weapons (bat, pipe, chain, baton,
or a rare katana, `sword`, weighted by `kinds`) lie in the map's hiding places (in alleys, on
bins, by the lifeguard towers, against fences) and glint now and then. Walking over one takes it,
E (or GRAB) swaps it for the one in hand; it swings harder and further than a fist and breaks
after its hits. With `drops`, an armed enemy put down may drop his. The hero has no gun.

**A party's weapons and the world's own places for them** (all optional; a world that names none
of these gets the street's weapons above, hidden as above):

- Four more kinds for `weapons.kinds` (or a spot's `kind`), each turning up only where a world
  names it: `bottle` (a dark green wine bottle, held by the neck), `magnum` (a champagne magnum in
  gold foil), `glass` (a heavy cut tumbler of whisky) and `bucket` (a polished steel ice bucket).
  Short reach, thrown with the right hand as punches are, from a boxer's stance (not the sword's
  guard). A bottle or a glass breaks over the head of the first man it hits: it shatters there,
  shards of its glass and a spray of what was in it flying off his head, with the smash; a magnum
  takes two blows; the ice bucket dents and clangs on two heads and gives out on the third, its ice
  spilling. A bottle drops a man where he stands (no flight), his GM flying a moment after the
  shards, and the line says both ("The bottle shattered. Knockout +2 GM"); the magnum and bucket
  throw him a little. E.g. `weapons: { count: 30, kinds: { bottle: 4, glass: 3, magnum: 1, bucket: 1 } }`.
- `spots: [{ x, z, y, kind, stand, lean, yaw }]`: the world's own places for them, and then only
  there (no random hiding places): a bar top, a table, a shelf. `y` is the surface's height (the
  ground's without it), `stand: true` stands the prop upright on it (it does not glint: it is in
  plain sight), `kind` puts that kind there (otherwise one from `kinds`), `lean` (radians) leans it
  against a wall instead, `yaw` turns it. Every spot is filled when a run starts; walking within
  about a metre of one takes it, so set them near the front edge of a bar. With spots, `count` may
  be up to 60, and is every spot unless the world says.
- `every`: seconds before a taken one is replaced (3 to 600, default 30): somewhere out of sight in
  the street; on the world's own spots, back on an empty spot once the hero is out of arm's reach of
  it (2.5 m), so a bar restocks while the fight stays at the party.
- The crew may carry one: `crew.biker: { weapon: 'bottle', moves: ['ffCross', 'cross'] }` (or `{
  kind: 'bottle' }` in a look). It squares up as a boxer does and swings it with the right hand;
  theirs never breaks.

**A derby: an open world on wheels.** `open.vehicle` turns the fight into car combat in an
arena (Mog Derby, worlds/mog-derby.js): the hero drives the car `player()` returns (W/S
throttle, brake and reverse, A/D steer, Space the handbrake, Shift boost, J or a held click the
roof guns if the car is `armed`), and every crew kind drives a car. A hit lands by zone (a nose
is the weak point, a tail the strong one) and grows with the change of speed it causes; a car
you hit that spins pays by how far it turns (90, 180, 360 degrees), and a wreck pays most and
spills the crew's `gm` on the floor. The others ram back: they lead you, go for your back
corners, back in with a dented nose and steer off the wall. Build the arena's wall and stands
yourself; the runtime keeps the cars inside the ellipse.

```js
open: {
  vehicle: { arena: { x: 0, z: 0, rx: 54, rz: 38 },     // the wall: an ellipse round the floor
    gates: [[48, 0], [0, 32], [-48, 0], [0, -32]],       // where the crew drive in
    guns: true, armor: 0.55,                             // how hard hits land on the hero
    gm: { spin90: 30, spin180: 60, spin360: 150, wreck: 150 } },
  crew: {
    thug: { names: ['Rust Bucket'], gm: 110, hp: 3, car: function (ctx, i, heat) { return { kind: 'stockcar', paint: '#C8102E', number: String(i + 2) }; } },
    boss: { names: ['Big Tusk'], gm: 900, hp: 14, car: { kind: 'monster', spikes: true }, ranged: { every: 3.4, range: 26, color: '#FF8A2A' } },
  },
  heat: { every: 45, say: ['Hot rods roll in', 'The sheriff is coming'] },   // the banner at heat 2, 3, ...
}
```

A crew kind's `car` is the car kit's options (or a function returning them); `body` may build its
own and return the car (a light bar on a cruiser). `hp` counts as armour (30 a point). The intro
and outro cast cars the same way: `kind` brings a crew car, `speed` up to 30 m/s.

**Traversal: a hero who swings, climbs and runs on walls.** `open.traversal` gives a library
human hero a grapple line and the moves of a free-running hero (the runtime's traversal, from
Spiderbench, used with its author's permission): swinging from the edges of roofs, running up and
along walls and crawling on them, perching on edges, zipping to a marked point, flips off a
release, and a dive that lands as a takedown on everyone close. Keys: W A S D, the mouse looks
(a click locks it), Space jumps (hold for higher), the right button held swings, E zips to the
marked point (in the air with none, a dash), C dives, Shift runs up and along walls, Q is a boost in
the air; J, X, F or a click punch on the ground, G picks up a weapon. Touch: JUMP, SWING (held),
ZIP, PUNCH, RUN, GRAB.

```js
open: {
  traversal: { line: '#1C1E22' },     // the grapple cable's colour; {} or true for the default
  crew: { thug: { climb: 0.5 } },     // the share of a crew who climb walls after you (0 to 1)
}
```

It needs something to swing from: buildings, towers and walls with colliders
(`ctx.solid({ min: { x, y: 0, z }, max: { x, y: height, z } })`, the `y` of `max` the roof). Every
box collider is a building: its roof is ground to stand and fight on, its walls are climbed, its
edges are anchors and zip points. Lines bite on edges 6 m up or more; streets 10 to 20 m wide
between blocks 15 to 60 m tall swing best. Everyone stands on what is under them: a crew member
who walks off a roof falls, the climbers come up the wall after a hero on a roof, the rest wait at
its foot, and shooters shoot up at him. The hero must be a library human (`ctx.assets.human`);
coins that drop on a roof stay on it.

Where the walkable ground ends, something you can see ends it: on a library map the runtime
builds it; without one, build a wall, fence or barrier at every edge of `bounds` and give it a
collider. People move like people: a guard held up while stepping, sidesteps and backpedals
round a foe, punches thrown on the move, leaning into turns; the runtime animates it all.

The library map `ocean-drive` is Miami Beach at sunrise (StarKnightt/ocean-drive, MIT): a mile
of Ocean Drive with its pastel deco hotels, cafés, palms, parked cars and passing traffic, the
park, the beach with lifeguard towers and surf, and the Atlantic. It brings its own sky, sun,
shadows, fog and colliders, so add no lights or sky of your own; `+x` is east (the sea), `-z`
north; the hotel fronts are at x = -30, the road at x = -21 to -14, the park to x = 12, the sand to
the water at x = 90; blocks run from z = -340 to 340. The alleys between the hotels and the cross
streets go 20 m back (to x = -50) to walls and roadblocks, both ends are fenced, and the player can
wade into the sea to the swim-area buoys (x = 104, about mid-thigh). `def.onMap(ctx, map)` runs
once it is built; `map.hideouts` lists the hiding places and `map.water.depthAt(x, z)` the sea's depth.

The library map `city` is a midtown district of a procedural Manhattan (from Spiderbench, used with its
author's permission): 500 by 400 m of avenues, cross streets and the Broadway diagonal, about 1,100 buildings
with lit rooms behind their windows, water towers and plant on the roofs, shop fronts, street lamps, signals,
hydrants, trash cans, newsstands, sidewalk sheds and street trees, and the city's skyline round it. It brings
its own light for the time of day, its own night lights (every street lamp and lit shop window lights the
street and the people in it) and its colliders, so add no lights or sky of your own. `+x` is east, `-z`
north; the district runs from x = -250 to 250 (8th, 6th and 5th Avenues at x = -250, 0 and 250, each 22 m
wide with 5 m sidewalks) and z = -480 to -80 (cross streets every 80 m at z = -480, -400, ..., -80, 10 m wide, 18 m at
z = -480, with 4 m sidewalks); spawn on a sidewalk or in a street. It suits `traversal` (every building is a wall to
run up and a roof edge to swing from). Its streets are alive: cars, cabs, vans, trucks and buses drive them,
stop at the lights, come in from beyond the district and drive off into it, and stop for the player and for
your own people on foot; a crowd walks the sidewalks and crosses at the crosswalks, and it turns to look at the
player, films a landing and steps back from it. `traffic: false` / `people: false` empties the streets; a
number thins or fills them (1 as made, up to 2).

```js
open: {
  map: 'city',
  city: {
    time: 'night',                 // 'day', 'dusk' or 'night' (lit windows, lamps, glowing shops)
    ads: [['QUARANTINE ZONE', 'STAY INDOORS', '#101014', '#2A2A30', '#F4F1E8', '#D11F1F']],   // the billboards' copy: title, line, colours (optional)
    signs: [['PHARMACY', '#EEF1F4', '#B8202C']],                                               // the shop signs: name, board, letters (optional)
    traffic: 1,                    // the cars: false for none, 0.5 for half (optional)
    people: 1,                     // the crowd on the sidewalks: false for none, 0.5 for half (optional)
  },
  traversal: {},
},
graphics: { preset: 'moonlit', exposure: 0.55 },   // at night: dark streets, the city's own lights carrying the picture
```

## Kart races

A kart race (Meme Kart, the owner 6 Oct 2026: "3 laps, 8 karts ... bumping + items (contact never ends the run)")
is its own kind of world: name `kart: {...}` among `GameMog.world`'s own keys (not with `open`), written out there as
an object (`kart: KART` or a shorthand `kart` is not seen, and the world races the endless laps). Ignore the lap rules
above (endless laps, a rival joining at the line, obstacles, one touch ending the run): eight karts line up on a grid,
count down (gas as the "1" lands is a Moon Launch), and race the laps of your `track` for places. The runtime runs all
of it: the driving (a hop into a drift that charges Green Candle, Gold, then MOG; boosts; the slipstream; bumping;
walls; the Rescue Claw), the rivals, the course features you name, the GM coins, the camera, the HUD, the finish, the
podium and the scores (place, then time, then GM). You give the track, the course, the racers and the place.

```js
const COURSE = {
  shoulder: 4,                                        // grass between the road's edge and the walls, metres
  pads: [{ at: 0.15, x: -2.5 }],                      // Green Candle pads: +28% for 1 s (at: a fraction of the lap, or metres)
  ramps: [{ at: 0.64, x: 0, width: 8, size: 'small' }],   // at: the lip; 'small' or 'big'; Space in the air is a trick
  offroad: [{ from: 0.47, to: 0.5, side: 'outside', width: 5, kind: 'mud' }],   // side: left, right, inside, outside (or x: [a, b]); mud, grass, shoulder
  walls: { gaps: [{ from: 0.67, to: 0.7, side: 'left', water: true }] },          // no wall here: water past it (or water: false, a void)
  airdrops: [{ at: 0.24, x: 0, n: 5 }, { at: 0.42, n: 4 }, { at: 0.82 }],        // rows of Airdrop crates (n 4 or 5, up to 12 rows); 'auto' (or left out): four a lap; false: none
  gm: 'auto',                                         // eight lines of five GM a lap; a number a lap, or false
  // the chaos (below): bumps to fly off, a break to jump, rails to grind, hazards on their clocks
  bumps: [{ at: 0.52, size: 'roller', n: 3 }, { at: 0.574, x: 4.5, width: 6, size: 'lip' }],   // 'roller' (n humps), 'bump', 'lip'; at: where it begins (a lip: its edge)
  breaks: [{ from: 0.576, len: 8 }],                  // the road gone, 3 to 14 m (to: instead of len; x: [a, b] or side and width for part of it; water: true; guard: true, a kerb along its side)
  rails: [{ points: [[0.562, -5], [0.585, -5]] }, { points: [[0.585, -5], [0.6, -2.5]] }],   // [at, x] on down the lap (or from, to, x), h 0.5; an end at another's start links them
  hazards: [{ kind: 'crossing', at: 0.72 }, { kind: 'topple', at: 0.79, side: 'right' }, { kind: 'meteor', from: 0.87, to: 0.95 }],   // every, offset (seconds), model: false
};
GameMog.world({
  theme: { sky: '#A9D3F2', fog: '#CFE6F6', accent: '#5CFFC0', font: 'Oxanium' },
  graphics: { preset: 'kart' },                       // the kart preset (the default when a kart world names none; below)
  track: { width: 16, points: [ /* a loop of 1,350 to 1,600 m: a 16 to 22 m hairpin and two 35 to 60 m sweepers */ ] },
  kart: { laps: 3, class: 'normal', course: COURSE }, // laps 1 to 5 (2 to 4 in a Mog); class 'chill', 'normal' or 'degen' (top speeds 27.3, 31, 35 m/s)
  // kart.items: { weights: { 'Laser Eyes': 45, 'WHALE DUMP': 0 } } (0 to 60 each, 30 as it comes, five kinds left in at least), or false
  music: { style: 'tropical', key: 'F', mode: 'major', tempo: 160, seed: 'Meme Kart 92' },   // the score: it builds with the laps, and the last lap goes 5% faster
  // or kart.score: true (and no music): the race's own kart theme, as Meme Kart races to (below)
  build(ctx) { /* the ground, the road (ctx.track.ribbon), kerbs, the walls (leave the gaps), the water past a gap, scenery */ },
  player(ctx) { return ctx.kart.racer('pepe'); },
  rival(ctx, k) { return ctx.kart.racer(['doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat'][k - 1]); },   // k = 1 to 7
});
```

- **Racers.** `ctx.kart.racer(id, { jersey, paint, name, stats })` is one of the runtime's eight, a character in its
  kart, built in code and driven by the race: `'pepe'` (Pepe, the Swamp Skimmer), `'doge'` (Doge, the Wow Wagon),
  `'shiba'` (Shiba, the Sakura Dart), `'bike'` (Bike Tyson, whose body is the bike), `'bull'` (Bull Run, the
  Stampede), `'bear'` (Big Bear, the Sell-Off), `'whale'` (The Whale, the Bubble Sub) and `'mooncat'` (Moon Cat, the
  Crater Hopper); `ctx.kart.racers` is that list. Pick any racer by its id, as often as you like; `jersey` and `paint`
  (hex) turn the racer's own colours (its outfit, its kart's paintwork) to yours, shading and all; `name` and `stats`
  replace its own (each has its handling: the light ones quick off the line, the heavies faster flat out and hard to
  shove). Each is drawn near, mid and far by its distance (only the kart the camera follows and the two nearest
  others near), steers with its hands on the wheel and its head leading, rolls into a drift, hops and lands with a
  squash, stretches on a boost, looks at the nearest rival and back over its shoulder on C, blinks, pulls a face for a
  drift, a boost, a hit and a spin, and celebrates on the podium (Bike Tyson with a wheelie and a punch at the sky; he
  leans his bike 30 degrees through a turn, 35 drifting, and pedals at the wheels' speed). On the start screen the
  player picks one of the eight karts the world built (left and right, a tap, the pad's stick); the pick drives your
  kart, the other seven the rest, and the platform remembers it.
- **Your own racers.** `player(ctx)` and `rival(ctx, k)` may instead return `{ object, name, color, stats, animate }`,
  built facing +Z on y = 0, about 1.3 m wide and 2.4 long; `ctx.kart.greybox({ paint, driver, helmet, name, stats })`
  is a stand-in kart of boxes. `stats` is the racer's handling, each about 1: `top` (0.95 to 1.05), `accel` (0.85 to
  1.2), `handling` (0.9 to 1.1), `mass` (0.8 to 1.4), `drift` (how fast a drift charges, 0.9 to 1.15). `animate(t, dt,
  s)` receives `{ speed, steer, drift, tier, boost, air, hop, trick, hit (a bonk, a hard knock, the Claw, an item), bump, spun,
  place, finished, roll, detail ('near', 'mid' or 'far'), back, gaze ([x, y] toward the nearest kart, or null),
  celebrate, sad, angry (0 to 1: road rage), grind (on a rail), charge (0 to 1: a charge jump charging) }`; never move
  `object` yourself. A racer's road manner is its persona (below): the roster's by its id, a greybox's
  `ctx.kart.greybox({ persona: 'ram' })`, or your own model's `object.userData.kartRacer = { stats, persona }`.
- **Impostors.** `ctx.kart.impostors({ cast, frames, cell, size, foot, cols, across, light })` films animated models,
  off screen and before the race, into one sheet of pictures, for cards that stand in for them by the hundred in one
  draw (Meme Kart's crowd in its stands). A world never makes a camera; the film is the kit's, through its own lens into
  its own render targets. `cast` is `[{ object, cycle, step(dt), settle() }]`: the model (built facing +Z, its feet on
  y = 0), its cycle in seconds, a function that moves it on `dt` seconds, and (optional) one called once it stands in
  the studio, before the film rolls, to bring it into its stance. Each is filmed alone, `frames` pictures through its
  cycle (12; 1 to 32), square-on through a lens `size: [wide, high]` metres (1.24 x 2.8), its feet `foot` metres over
  the cell's foot (0), each picture `cell: [wide, high]` pixels (96 x 216), filmed at twice that and halved, its colour
  carried out past its edges (no dark rim when drawn small) and kept as its square root (decode with `c * c * 2`), in a
  studio lit as stands at dusk (`light: { sky, ground, hemi, key: [colour, intensity, [x, y, z]], rim: [...] }` to
  light it otherwise). Picture `f` of look `i` is cell `i * frames + f`, `cols` cells across (2 x `frames`), the first
  row at the bottom of the sheet (v = 0). It returns `{ texture, target, cols, rows, frames, looks, cell, ms }` (or
  null: nothing to film, or a sheet larger than the screen allows) and leaves each model where it was, out of the studio
  and shown, to use or let go. Draw your cards with your own material from `texture`, e.g.
  `const s = ctx.kart.impostors({ cast: fans.map((p) => ({ object: p.object, cycle: 1.2, step: (dt) => p.animate(dt) })), frames: 12 });`
- **The chaos** (the owner, 7 Oct: "more chaotic fun, in terms of roads, breaks, jumps and players interacting with each
  other in terms of bumps, road rage etc."). All of it the runtime's, every kart world's, a Mog's too:
  - *Charge jump.* Space held driving straight (the stick under a quarter) after the hop lands charges it (a glow under
    the kart, the pill says Jump); let go after 0.25 s and the kart jumps 0.41 to 0.63 m (a full charge at 0.6 s, twice
    a hop), 0.55 to 0.7 s in the air: over a break, onto a rail. A steer while it charges is a drift, as before. Jumps
    hang near the top (gravity eased to 0.55 under 2 m/s), so all air feels floaty.
  - *Rails* (`course.rails`): caught coming down onto one (a charge jump, a ramp, a bump), within 1 m across: the kart
    grinds along it, sparks and the rail lit, its speed rising to +12% over 1.2 s; Space hops off (to the side the stick
    says, or straight up and back on); off the end (or the last of linked ones) it pops up with a trick's window. Either
    way the grind is paid: +20% for 0.4 to 1.0 s. On the ground a rail is a wall (a glance or a scrape, never a bonk).
    Rivals take them (Moon Cat nine times in ten).
  - *Bumps* (`course.bumps`): rollers, bumps and lips in the road that the karts ride and, over 12 m/s, fly off; Space up
    there is a trick (+15% for 0.5 s), as off a ramp (+20%).
  - *Breaks* (`course.breaks`): the road gone. On the ground over one a kart falls, and the Rescue Claw sets it down
    30 m before the break (2 GM lighter; beside one across part of the road, 2.5 m clear of it and of any rail). Jump it: a charge jump at the edge, a lip or a ramp just before it, a rail over
    it. Keep a full-width one to 8 to 10 m (a charge jump at speed clears 13 m); the rivals use whichever you give them.
    Draw nothing for it: the runtime draws the drop over your road (stars down it; water where `water: true`). One
    across part of the road may have `guard: true`: a low kerb along its side on the road (striped gold and black,
    drawn by the runtime), a wall to a kart on the ground coming at it from the road beside it (a glance or a scrape,
    never a bonk), its front left open, so whoever drives into it, or hops or jumps over the kerb, still falls in. Meme
    Kart guards its crater gap and the bayou's channel (8 Oct: a person on the keys reacting in 0.25 s swung off the
    line into the channel from the side, lap after lap).
  - *The Rescue Claw* (a fall into a break, 0.4 s in deep water past a gap in the wall, 3 m down a void, off the course):
    0.5 s more of the fall, then 1.0 s on the claw down onto the road, square to it, rolling at 0.4 of the top speed, a
    ghost for a second, 2 GM lighter; 12 m back on the racing line (back past any gap in the wall), or before a break
    as above. For 1.2 s after it a hand is on the wheel (your steering from 0.3 of itself up to all of it, the rest
    holding the road's heading), so a key still held from the fall does not throw the kart straight back in. Called
    again within 12 s and 60 m of the last time, it sets the kart down past what it fell into instead, 6 m on (12 m
    further each time more): no kart is set down by it three times in 20 s (8 Oct: a person reacting in 0.25 s was put
    back before the crater gap and fell in again 59 times running).
  - *Hazards* (`course.hazards`), each on its own clock from GO (`every`, `offset` seconds), the same every race:
    `topple` (a giant red candle at the road's side, `side`: its shadow across the road 1.4 s, then it falls and spins
    whoever is under it, lies across the road 2.5 s as a log to jump off, and stands again), `crossing` (a giant GM coin
    rolls across, 8 m/s, its line lit 1 s before; it bonks whoever it meets) and `meteor` (a red ring somewhere between
    `from` and `to` for 1.6 s, then the strike: a spin, and up in the air; every other strike is aimed where the racer
    furthest on in the stretch will be when it lands, a few metres either way). Each hit is an item's: a second untouchable
    after it, so nothing chains. `model: false` keeps the warnings and leaves the thing itself to you:
    `ctx.kart.hazards()` is `[{ kind, phase ('idle', 'warn', 'fall', 'lie', 'rise', 'roll', 'smoke'), u (0 to 1 through
    the phase), d, x, side, lens }]`, e.g. `update(ctx) { const h = ctx.kart.hazards()[0]; myRock.visible = h.phase === 'warn'; }`.
    `lens` is true while a crossing has rolled in under the camera behind your kart (2.2 m and more behind it, within
    3.5 m of the lens): hide your model then, as the runtime hides its own coin and a rival there.
  - *Contact.* Bumps go by weight (a kart's mass squared: Big Bear shoves Bike Tyson 2.7 times as hard as he shoves
    her), with sparks, a flash, a BONK and a little shake. A hop-bash (a hop sideways into a kart) shoves it 6.5 m/s
    across times your mass over its, wobbles it and knocks a GM out of it for anyone (the basher first); a side knock
    over 8 m/s knocks one loose too. Each rival starts with 2 GM. A kart bashed is safe from another for 1.2 s.
  - *Road rage.* The rivals have manners: Bull Run rams, Big Bear blocks the line behind him, The Whale bullies lighter
    karts, Doge spams items, Shiba drafts and slingshots out, Bike Tyson throws hop-bashes, Moon Cat takes the risky
    lines (the rest race clean). A rival bumped hard, bashed or hit by a kart's item is angry for 4 s (steam off its
    head, its angry face, a honk): it hunts that kart, then calms, and is not angry again for 6 s. `kart.rage: false`
    and everyone races clean.
  - *The pack.* From 12% to 75% of the race the catch-up holds the field together round you (a rival 50 m ahead eases
    to 0.94, one 20 to 80 m behind finds up to 1.06), still out of your sight only and never past 1.06; rivals go for
    the crates (seven times in ten), use items sooner, and crates come back in 1 s.
  - *Juice.* Speed lines past the camera at speed (from 0.7 of the top), on a boost or a rail, flashes and sparks on
    every hit, a squash on landing (the longer the air the harder), a camera rumble on bashes, strikes and big
    landings (smooth, never a jump from frame to frame; none for a person who asks the page for less motion). None of
    it may hide the road ahead or your kart for more than a few frames (7 Oct, round 3): dust, smoke and every effect
    sprite fade near the lens (an item's inside 0.9 m whatever its size, thinned from where the camera is that frame), a
    burst on your own kart is drawn at two thirds of its size with its ring laid on the road, a meteor or a whale coming
    down near the camera thins out, and a FUD Cloud on you hangs high in the picture, never over the road.
- **The driving and the camera** (the owner, 7 Oct: "turning is SOOO tough and not smooth", "the camera view loses the
  rider and kart when he drops and dips"; round 3: "normal cart speed needs to increase, karting is slightly too
  slow"). The runtime's, every kart world's: a top speed of 31 m/s (112 km/h; 26.5 until 7 Oct's third review, every
  speed and turn rate 1.17 times what it was, so a line through a bend is the same line, faster); a key steers nearly
  half lock at once and the rest in 0.12 s, straight again in 0.09 s; a stick is followed in 0.11 s; full lock turns
  8.7 m at 70 km/h, 16.5 m at 105 and 18.2 m at the top speed (and costs up to 6% of it); a drift at 105 km/h runs
  12.5 m steering in to 75 m counter-steering, keys moving it smoothly between. The field of view opens 7 degrees from
  half the top speed to the top (7 more on a boost) and the speed lines stream from 0.7 of it. A wall under 30 degrees is a glance, to 60 a scrape, past it a
  bonk that turns the nose off the wall. The chase camera follows the road's own height (no lag down a slope), only
  0.6 of a jump's, tips its aim down drops and up climbs, and keeps your kart and racer in the frame (on a phone, above
  the touch buttons): build steep drops, steps and jumps freely. Bends of 25 m and up are taken flat out on the line;
  the rivals plan theirs at 85% of full lock. Every kart is drawn on the road between its samples and moved on by
  the frame's own time, so a slope, a crate row or a drop never shakes it.
- **The track.** A lap of 1,350 to 1,600 m (at 31 m/s, a session of about 2:25 to 2:50 from Play to the results;
  the runtime takes 800 to 1,800) and 13 to 18 m wide (14 to 28). The
  walls stand `shoulder` metres past the road's edge on both sides; build yours there, and leave the course's gaps.
  Anything the course puts on the road (pads, ramps, mud) the runtime draws; give your own walls and props
  `userData.gmKart = true` if they stand inside the corridor, or they are hidden from the camera.
- **Fixed.** The hop and drift timing and the tiers (Green Candle, Gold and MOG at a charge of 0.6, 1.6 and 2.2; a
  drift charges 1.17 a second steering into it, 0.88 neutral, 0.64 counter-steering), the charge jump, the grind, the
  hazards' timings, the rivals' manners, the boost sizes, the physics,
  the controls, the flyover to the grid (4 s, skippable), the 3-2-1 and the Moon Launch, the camera and the HUD are
  the runtime's; a Mog keeps the kind, the first four racers (the stars), the
  laps (2 to 4) and the items' names.
- **Events.** `ctx.on('lap', ({ lap, place, gm }) => ...)`, `ctx.on('start', ...)` and `ctx.on('finish', ({ place,
  time, gm }) => ...)`.
- **Assisted.** A race driven with help is never ranked: any of the runtime's test controls (`debug.kart()`'s, the
  autopilot, the time scale and fixed step, invincibility) used at any point of a session, before a race or during an
  earlier one, a slow motion switched on and off again included, marks that race and every later one as assisted until
  the page is loaded again (8 Oct: the flag was set afresh at each count, so a time control let go before the race went
  unmarked).
- **Items.** Drive through an Airdrop crate (rows across the road, from `course.airdrops`; a crate is back 1 s
  after it is taken) and the slot under the lap spins its roulette for 1.2 s (a tap of the item button stops it, at
  0.5 s at the soonest). One item at a time; X (or J, K, Shift; ITEM on touch, the left shoulder or X on a pad) uses
  it, E (or the stick up) throws it ahead, with S or down (or C, or the stick down) behind; held, a Rug Pull or Laser
  Eyes is dragged behind you as a shield (and goes ahead when let go if it was pushed up, or E, as the drag began). The ten: **GM Bag** (+3 GM), **Rug Pull** (a trap: a second's spin at 0.35
  of the speed and a GM; hop it), **Cold Wallet** (blocks one hit or FUD for 12 s; not the Whale), **Laser Eyes**
  (homes on the next kart ahead: a tumble, 0.30, 3 GM spilled; a Wallet, something dragged behind, a hop as it
  closes, a wall), **Pump** (+32% for 1.2 s), **Much Wow** (three of those, 1.0 s each), **FUD Cloud** (everyone
  ahead: a storm cloud over each one's kart raining red arrows on it, 8% slower for 2.5 s, a rival's line shaken too;
  on you it hangs high in the picture and the screen's edges darken a little, never the middle: the road ahead and
  your kart stay in the clear, and no effect of any item may hide them for more than a few frames), **WHALE DUMP**
  (on the leader: a 2.5 s shadow, the slam 8.2 m round where it locked 0.25 s before: a 1.6 s flip at 0.20 and 3 GM;
  a boost of +20% at the lock gets you out), **Diamond Hands** (6 s untouchable at +12%, off the road as on it,
  spinning whoever it touches) and **To The Moon** (3.5 s on a rocket down the racing line at 46.8 m/s, untouchable;
  it never runs out over a break or just short of one).
  Each hit is followed by a second untouchable. The odds go by your place (more for those further back), the
  rivals use their items too, and the names, looks and rules are the runtime's: a world (and a Mog) may only weigh
  them (`kart.items.weights`) or turn them off (`kart.items: false`).
- **The score.** With `music`, the race's laps lift it (energy 1, 2, then 3 on the final lap, a sting as each lap
  starts), and the final lap plays the same song 5% faster (160 to 168 BPM), from the next bar line. With
  `kart.score: true` (and no `music`) the race plays its own score instead (`lib/runtime/kart-music.js`, in a kart
  world's runtime only): a jazz-funk big-band kart theme in Bb at 160 BPM, written out note by note (a slap bass, a
  clavinet, horns answering a whistle-able hook, claps, a cowbell), every sound synthesised. The start screen and the
  flyover hear its groove, quietly; the count is its two-bar intro, so the verse's first downbeat lands on GO (a rip
  and a crash on it); each lap adds layers and a sting; the final lap rips up a semitone to B at 168 BPM on the next
  bar line, with its own sting; your finish has a sting over the score, the podium a fanfare (a place on it) or a
  shrug (off it) over the score stopped, then the groove back in as it ends, on into the results. Everything that ducks the score ducks it,
  and its beats are the runtime's `beat` events. It keeps a second of itself scheduled ahead, so a page busy for up to
  that long (a long frame, a busy machine) does not stop it; busy for longer, it comes back in on the beat it has
  reached. A world that names a library track keeps that.
- **The sound.** The runtime's own, under the score: your engine and the two karts nearest it (a single-cylinder
  two-stroke, its revs from the speed, about 11,500 at the top, softly into a 13,000 ceiling so a boost on top of the GM
  and the slipstream still revs it; up on a boost and in the air, down on a hit; the others panned to where they
  are), the tyres in a drift, a hop and a landing, a crowd at the start line that cheers at GO, each lap and the
  finish, and every item; the score steps back (ducks) for the big ones, all under the master limiter. A world adds
  nothing to it.
- **The look.** A kart world is graded the way its racers were drawn: `graphics.preset: 'kart'` (exposure 1.05, a
  bloom on emissive only, saturation 1.1, a little warmth and split, no grain, a speed blur) where the world names no
  preset, and `grade.curve: 'neutral'` (the Khronos PBR Neutral tone curve, which keeps a colour's hue as it
  brightens, where ACES turns saturated greens and oranges yellow) where it names no other (`'aces'` keeps the
  filmic one). Both only in a kart world. On a phone a kart race draws at 1.25 pixels a point at most. The racers
  (and the items' models) are lit as toys on the track, not haloed: no rim light, no specular at the silhouette, and
  they are kept out of the bloom (only their headlights and other glow parts bloom); a fill that follows the camera,
  in the colour of the world's sky light, shapes the side you see even with the sun behind them, and each kart has a
  soft contact shadow on the road (one draw call for the field).
- **GM.** Lines of five coins down the lap (`course.gm`), at a kart's scale: 0.56 m across, half a metre up, taken
  inside 1.3 m of a kart's middle.
- **Performance.** A racer near is about 25k to 30k triangles and 5 to 10 draw calls (the phone's near level at
  `low` quality, half that), mid about 5k in 3 to 5, far about 1k in one or two; keep your own scenery under the rest
  of the phone's budget (150 draw calls and 350k triangles a frame, shadows included). A see-through two-sided material
  is drawn twice (back, then front) unless it sets `forceSinglePass: true`, which is safe for added light and for flat
  things; the kit's own flames, rings, skid marks and added-light item effects do, and on a phone a boost flame's core
  shows only on a racer near the camera; over 135 calls a phone draws one other racer near, the middle level only to
  27 m (a racer held there drops at once), and a far racer's flame not at all.

### The kart score

Every kart race is scored by the runtime's `KartScore` (`lib/runtime/kart-score.js`, carried in a kart world's
runtime only, a global; the scores route and the game page load the same file): one number, 0 to 10,000, where 10,000
is the perfect race no run reaches (the most any input scores is 9,975). Time is 80% of it (against your racer's own
perfect time), the place 10%, GM 5% and enemies hit 5%; the board shows each player's best run. A world does nothing
for it: its constants (`meta.kartScore`: each racer's perfect time and floor, the GM and hit caps) are measured from
its track when it is published (docs/RULES.md "Kart score").

```js
KartScore.score({ timeMs, place, karts, gm, hits, estimated, progress, racer }, C)
  // -> { total, time, finish, gm, hits, tier: { id, name, min, color, bar }, v, tStar, x }
KartScore.TIERS     // MOG 9,450 / Moonshot 9,150 / Diamond Hands 8,750 / Green Candle 7,700 / HODL 6,350 / Paper Hands 4,450 / Rekt 0
KartScore.tier(s); KartScore.ceiling(C, racer); KartScore.timeFor(s, run, C)   // the slowest time (ms) still scoring s
```

The result a kart race reports (`GameMog.finish`) is scored from its parts, never from its `score`: `place`, `timeMs`,
`laps`, `gm`, `hits` (enemies hit: your bashes and your items that landed), `estimated` and `progress` (a race called
before you finished: the share of it you drove, 0 to 1) and `racer` (its id, e.g. `pepe`).

## Never

Build a 2D game, move or replace the camera, create a renderer, call `requestAnimationFrame`, `setTimeout` or `setInterval`, add event
listeners, touch the page (`document.body`, `innerHTML`, `appendChild`), call
`GameMog.ready` or `GameMog.finish`, use the network, storage, `eval`, dialogs or imports,
or make GM coins. The runtime does all of it.

## Performance

60 fps on a laptop. Under 300 draw calls: instance anything repeated, merge small static
props, at most one shadow-casting light. In an open world the runtime keeps its people cheap: a
person other than the hero is drawn only where some of them could be in view (or cast a shadow
into it), a person's gear is one draw per material, and a person removed frees what they held on
the graphics card; a crowd may add `lod` (above). The scenery is the world's: at heat 3 a party of
22 costs about 140 draw calls in view, so keep the place itself near 150.
