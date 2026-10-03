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
  world has RUN, JUMP and PUNCH).
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
| `model-fire-hydrant` | a scanned fire hydrant, new (`fire_hydrant`) and aged (`fire_hydrant_aged`) |
| `model-street-seating` | scanned modular street benches (legs, seats, backs as parts) |

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
    shirt: { kind: 'tank', color: '#F4F1EA' },   // kind: tank, tee, long, open, polo, uniform (a police shirt: badge, patches); print: plain, floral, stripes, camo, check; color2: the print's colour
    pants: { kind: 'jeans', color: '#4A6A92' },  // kind: jeans, trousers, shorts
    jacket: { kind: 'vest', color: '#121012' },  // vest (leather, open) or jacket (open, long sleeves)
    belt: '#2A1C12',                             // false for none
    tattoos: { arms: true, chest: false, neck: true, color: '#1C2A38' },   // ink where the skin shows
    beard: 'full',                               // stubble, full, goatee
  },
  gear: { chain: '#D4AF37', shades: '#0E0F12', cap: { color: '#101012', backwards: true }, bandana: '#8C1C1C', police: '#111827' },
})
```

Hats hide the hair under them. A weapon for a street fight: `weapon: { kind: 'bat' }` (also
`baton`, `pipe`, `chain`, or a sword), carried in the right hand.

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

`ctx.assets.model(id)` returns a scanned model: `{ object, parts, size, part(name), instanced(count, fn, parts) }`.
`object` is the whole model (a new copy each call), `part(name)` one of its parts (a rock of the
set, a fern), `size` its bounding box in metres. Scenery repeated along the track goes in one
`instanced(count, (i, dummy) => { dummy.position.set(...); dummy.rotation.y = ...; dummy.scale.setScalar(...) }, parts)`
call: every copy of every part in a handful of draw calls. Models are at true scale and stand on
y = 0: place them, never stretch them into something else.

```js
var lamps = ctx.assets.model('model-street-lamp');
if (lamps) ctx.scene.add(lamps.instanced(40, function (i, d) { var p = ctx.track.pointAt(i * 25, 13, 0); d.position.set(p.x, 0, p.z); }));
```

### graphics (optional)
Turns on the runtime's cinematic renderer. Use it whenever the world should look its best,
and always for a realistic world. Every value is optional and bounded.

```js
graphics: {
  preset: 'daylight',                            // optional: 'daylight', 'golden', 'moonlit' or 'toy' (below)
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
  `'swing'` (`{ n }`), `'slay'` (`{ name, slain }`), `'crash'` (`{ into }`), `'start'`
- `ctx.audio` (inside `ambient`)

## Open worlds

When the creator ticks "Open world", the world is not a lap race: ignore the lap rules above
(track, laps, rivals joining at the line, obstacles, coins along a lap). An open world is a place
the player roams on foot, seen over the shoulder, and the game is survival: people come for the
player, the player knocks them out (jab, cross, hook, a jump clear of a blow; in a big fight, the boss close or four or more at once, the camera comes in over the shoulder and the combo runs to five with body shots and uppercuts), their GM spills on the ground, and
the heat rises with time and knockouts. More come at once, each takes more punches, bikers join
at heat 2, the police arrive by patrol car from heat 3, and a boss comes at every third level.
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
    heat: { every: 40 },           // seconds a level of heat lasts (15 to 180)
    health: 100, maxEnemies: 12, civilians: 12,
    weapons: { count: 8, kinds: { bat: 3, pipe: 3, chain: 2, baton: 2, sword: 1 }, drops: true },   // or false: fists only
    gait: 'walkCool',              // the hero's walk: walk, walkCool, walkHeavy, walkF
    hud: { gm: 'Club fund', banner: 'Stack GM for the club. Survive.' },   // what the story calls the GM, and the first banner
    intro: { shots: [ /* the opening scene, below */ ] },
    goal: { gm: 10000, title: 'Cured', text: 'a line for the win' },   // always: 10,000 unless the creator names an amount
    outro: { shots: [ /* the closing scene, played when the goal is reached */ ] },
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
`argue`, `phone`, `arms`, `dance`; one-off moves: `shrug`, `wave`.

The opening scene, `intro.shots`, plays letterboxed before the first run of a visit (Enter,
Space, Esc or Skip skips it). Each shot: `t` seconds; `cam: { from: [x,y,z], to, look: [x,y,z] |
'og' | a cast id, lookTo, fov, fovTo }`; `cast: [{ id: 'og' | a name, kind: 'thug' (a new person),
at: [x,z] (placed at the cut), to: [x,z] or path: [[x,z], ...], speed, gait, stance, face: degrees |
'og' | 'cam' | [x,z] | a cast id, act: [['shrug', atSeconds, rate]], stay: true }]`; text:
`place` and `time` (a location card), `say` (a subtitle), `title` and `tagline` (the title card);
`fade: 'in' | 'out' | 'both'`. Whoever is marked `stay` is there when the run begins and comes
for you; the run begins where the scene leaves the hero. The closing scene (`outro`) takes the
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

Hidden weapons are on unless `weapons: false`: `count` street weapons (bat, pipe, chain, baton,
or a rare katana, `sword`, weighted by `kinds`) lie in the map's hiding places (in alleys, on
bins, by the lifeguard towers, against fences) and glint now and then. Walking over one takes it,
E (or GRAB) swaps it for the one in hand; it swings harder and further than a fist and breaks
after its hits. With `drops`, an armed enemy put down may drop his. The hero has no gun.

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
run up and a roof edge to swing from).

```js
open: {
  map: 'city',
  city: {
    time: 'night',                 // 'day', 'dusk' or 'night' (lit windows, lamps, glowing shops)
    ads: [['QUARANTINE ZONE', 'STAY INDOORS', '#101014', '#2A2A30', '#F4F1E8', '#D11F1F']],   // the billboards' copy: title, line, colours (optional)
    signs: [['PHARMACY', '#EEF1F4', '#B8202C']],                                               // the shop signs: name, board, letters (optional)
  },
  traversal: {},
},
graphics: { preset: 'moonlit', exposure: 0.55 },   // at night: dark streets, the city's own lights carrying the picture
```

## Never

Build a 2D game, move or replace the camera, create a renderer, call `requestAnimationFrame`, `setTimeout` or `setInterval`, add event
listeners, touch the page (`document.body`, `innerHTML`, `appendChild`), call
`GameMog.ready` or `GameMog.finish`, use the network, storage, `eval`, dialogs or imports,
or make GM coins. The runtime does all of it.

## Performance

60 fps on a laptop. Under 300 draw calls: instance anything repeated, merge small static
props, at most one shadow-casting light.
