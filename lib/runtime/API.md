# GameMog World API (runtime v1)

Every GameMog game is a **world module** running on the **GameMog Runtime**. The runtime is
the platform: it owns the rules, so every world plays by them. The world module is the
creativity: it decides what the world is, who lives in it, and how it looks, moves and sounds.

## The rules (the runtime owns these; a world cannot change them)

- **Endless laps.** There is no final lap. Your level is the lap you are on.
- **Rivals.** Lap 1 has one rival. Every new lap adds one more rival, faster and more
  aggressive than the last. The first is slower than you; by the fifth they match your pace;
  after that they come from behind.
- **Death.** The only way to die is to touch a rival or an obstacle. One touch ends the run.
- **GM.** Golden GM coins are laid along the track and re-laid every lap. They are the
  platform's currency and look the same in every world. Do not make coins.
- **Controls.** The player moves forward on their own. Arrow keys (or WASD): left and right
  steer, up goes faster, down goes slower. Space pauses. Touch screens get on-screen buttons.
- **Screens.** Title, countdown, HUD (level, time, GM, rival count, a warning when a rival
  closes from behind), level-up banners naming the new rival, pause, results, restart.
- **Leaderboard.** Runs rank by level reached, then GM collected.

## The world module (you own this)

One script that calls `GameMog.world({...})` exactly once. `THREE` (three.js r157) is a
global. There are no addons, no modules and no network: build every mesh, texture and sound
procedurally.

```js
GameMog.world({
  theme,      // colours and font for the HUD and screens
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

### theme
`{ sky, fog, ink, panel, accent, font }`. Colours are `#RRGGBB`. `ink` is text and borders,
`panel` is the HUD boards and cards, `accent` is highlights. `font` is one Google Font family
name (for example `"Fredoka"`, `"Baloo 2"`, `"Bungee"`, `"Rubik"`). Pick them for this world.

### camera (optional)
`{ distance, height, fov }`: metres behind the player (6 to 14), metres above (2.5 to 6.5),
field of view (50 to 78). The runtime drives the camera; this only frames it.

### track
`{ points: [[x, y, z], ...], width }`. 6 to 80 control points forming a closed loop (do not
repeat the first point at the end), smoothed into a Catmull-Rom spline. `y` is height, so the
loop can climb and dip gently. A lap must be 320 to 900 metres; the runtime rescales a loop
outside that. `width` is 8 to 18 metres. The loop must never pass close to itself. Give it a
shape that belongs to the world: a figure that winds round a lake, climbs a hill, snakes
through a market.

### build(ctx)
Build everything that is not a character or an obstacle: sky, ground, water, the track's
surface, scenery, lights (at least a HemisphereLight and a DirectionalLight in the world's
own colours; one shadow-casting light with a map of 1024 or smaller).

- Draw the track surface with `ctx.track.ribbon({ width, offset, y, color | material })`.
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
  crashed.
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
- `ctx.theme` (resolved colours), `ctx.rules` (the rule numbers, read-only)
- `ctx.random()`: seeded by the world's title, so a world builds the same every time
- `ctx.track`: `length`, `halfWidth`, `width`, `frameAt(d)` (returns `{ pos, tan, right, up }`),
  `pointAt(d, x, y)`, `nearest(x, z)` (returns `{ d, distance, lateral }`), `clear(x, z, margin)`,
  `ribbon(opts)`
- `ctx.textures.canvas(width, height, (g, w, h) => { ...draw with 2D canvas... })`
- `ctx.instanced(geometry, material, count, fn)`
- `ctx.audio` (inside `ambient`)

## Never

Create a renderer, call `requestAnimationFrame`, `setTimeout` or `setInterval`, add event
listeners, touch the page (`document.body`, `innerHTML`, `appendChild`), call
`GameMog.ready` or `GameMog.finish`, use the network, storage, `eval`, dialogs or imports,
or make GM coins. The runtime does all of it.

## Performance

60 fps on a laptop. Under 300 draw calls: instance anything repeated, merge small static
props, at most one shadow-casting light.
