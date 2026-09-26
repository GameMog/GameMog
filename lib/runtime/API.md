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
  steer, up goes faster, down goes slower. Space pauses. Touch screens get on-screen buttons.
  With the sword on, X (or J or K, or a sword button on touch screens) swings it.
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
world uses; it all loads before `build()` runs.

| id | what it is |
|---|---|
| `human-athlete-male` | a realistic male athlete: skins `african`, `caucasian`, `caucasian2`, `asian`; hair `short02`, `short04`, `afro01`; motion-captured idle, standing start, run, sprint and fall, and sword motion (a guard, three cuts, a hit and a death) |
| `human-athlete-female` | the same for a female athlete: skins `african`, `caucasian`, `asian` |
| `hdri-sunset-city` | a golden-hour city sky for `graphics.environment.hdri` |
| `texture-asphalt-track` | scanned race-track asphalt (colour, normal and roughness maps; one tile is 2 m of road) for `ctx.assets.texture` |

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

`ctx.assets.car(options)` builds a racing car for `player()` or `rival()` in a world with
`play.vehicle` and returns `{ object, animate, name, color, vehicle }`: return it as it is (set
`name` and `color` on it for a rival). It needs no library asset. Four kinds, each built from its
class's real dimensions: `hypercar` (a road hypercar, cab-forward, a big rear wing), `formula`
(a single-seater: open wheels, halo, wings, sparks from the floor at speed), `stockcar` (a stock
car with its number on the doors and roof, a window net, a spoiler) and `monster` (a monster truck
on 66-inch tyres and long-travel shocks). The paint is clear-coated with its livery painted on
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
authored facing +Z like any character; do not scale it.

`ctx.assets.texture(id)` returns a scanned surface as `{ map, normalMap, roughnessMap, size }`
(`size`: metres one tile covers) to put on a material: set `repeat` on the maps to match your
geometry's UVs (a `ribbon` of width w spans u 0 to 1 across and v one unit per w metres along).
It returns `null` if the library could not load: keep a surface of your own.

### graphics (optional)
Turns on the runtime's cinematic renderer. Use it whenever the world should look its best,
and always for a realistic world. Every value is optional and bounded.

```js
graphics: {
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

## Never

Build a 2D game, move or replace the camera, create a renderer, call `requestAnimationFrame`, `setTimeout` or `setInterval`, add event
listeners, touch the page (`document.body`, `innerHTML`, `appendChild`), call
`GameMog.ready` or `GameMog.finish`, use the network, storage, `eval`, dialogs or imports,
or make GM coins. The runtime does all of it.

## Performance

60 fps on a laptop. Under 300 draw calls: instance anything repeated, merge small static
props, at most one shadow-casting light.
