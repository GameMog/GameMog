# Story Kit vehicles

A ride in a Story Kit world is a **vehicle sheet**: word lists and bounded numbers an LLM can fill in. It never holds curves, code or real names. `buildVehicle(THREE, sheet)` turns the sheet into a drivable car. The car comes with its own handling and engine sound, and it speaks the player-car interface Mog City's runner fits under the player (`wagmi/storyrun/ride.js` in Mog City, which plays every Story Kit world; it carries a copy of this folder's `sheet.js`, `classes.js`, `tune.js` and `build-vehicle.js`, so a change here is copied there).

The folder is served at `/storykit/vehicles/` through the symlink `public/storykit/vehicles` (for the studio, on the dev server).

| File | What it is |
|---|---|
| `vehicle-sheet.schema.json` | The sheet: enums, plus knobs clamped to -1..1. It is the single source of the word lists. |
| `sheet.js` | `checkSheet(raw)` → `{ ok, sheet, problems, notes }`. It clamps numbers, refuses unknown words, unknown fields and families that aren't built, and refuses real names (the brand rule). It also fills in the class defaults. |
| `classes.js` | The class presets (15 car4 classes), the rear-shape table, the handling ranges and the real-name list. |
| `tune.js` | Maps handling adjectives to drive-model numbers, springs and tail-out, and the sound block to an engine profile. |
| `build-vehicle.js` | `buildVehicle(THREE, sheet)` and `resolveShape(sheet)`. |
| `sheets/*.json` | Seven example sheets, listed below. |
| `studio.html` | A turntable: `?sheet=<name>`, `?view=34\|front\|rear\|side\|top\|seat\|low`, `?lineup=1`, `?night=1`, `?door=0..1`, `?tow=out,lift`, `?beacon=1`. |

## The sheets

| Sheet | What it proves |
|---|---|
| `trailhand` | The stock `trailhand` as a sheet. Handling 28 / 39.4 m/s, grip 27, rMin 5.7, mass 2.6, the same V8 seven-speed. |
| `vandal-gt` | The stock `vandal` (Vandal GT) as a sheet. 33 / 50.4 m/s, grip 34, rMin 5.0, tail-happy (the same `onDrive`), the muscle profile's gearbox scaled to its boost. |
| `roadster` | Rebuilds the Mog City roadster. 34 / 55.8 m/s, grip 48, rMin 4.6, the default V8 gearbox to within 0.01. It has up-doors, a black lower half and tail thrusters (hop, dash). This is the loosest of the three in shape: no knife-edge fenders or sails. |
| `night-cab` | New from text: a 1990s yellow city cab with no logos. It has the roof sign, checker band, partition and hubcaps, a soft V8 on a four-speed, and floaty handling. |
| `work-van` | New from text: a battered white work van. It has a high roof, a sliding door, a ladder rack, a mismatched door, rust and streaks, a diesel profile (4300 red line, pitch 0.74), and tank handling. |
| `black-sedan` | New from text: a modern black luxury sedan. It has an LED light line, chrome trim, a sunroof, tan leather, a smooth V12 profile, and planted handling. |
| `wrecker` | A tow truck (class `wrecker`, ability `tow`): a red regular cab, the tow rig on its bed (a tower and headboard, a yellow boom on a ram with its cable, hook and chains, toolboxes, work lamps, a wheel-lift under the tail with wheel cradles and plain safety stripes), an amber light bar, a diesel. No lettering. |

## In a world

- **A story pack's `car`** can be `{ "sheet": "<name>" }` or `{ "sheet": { ...inline sheet } }`. `rides: { id: sheet | name }` adds more rides, and a mission's `vehicle` names one by its sheet id.
- **Mog City's runner** (`wagmi/storyrun/ride.js`) builds a sheet car with its copy of `build-vehicle.js` and fits the city's car entity from the sheet (`tune.js`); the hero's way in and out swings its driver's door, his hand on the handle, as on the roadster. A stock `roadster` is Dan's own car.
- **Doors:** each front door is cut out of the merged body (its skin, glass, seals, handle and moulding between its cuts, from the sill to its window frame) onto a hinge at its front cut, with a trim panel and an armrest inside. `setDoor('L' | 'R', 0..1)` (L the driver's, +x), `doorT(side)`, `doors[side].pivot` (its first child is the hand's frame: its point (0.86, 0.86, -0.18) is the handle, the roadster's hand point). A conventional door swings out 70 degrees; an up door swings up from the windscreen. Studio: `?door=1`.
- **Tow rig:** on a bed with the `tow` ability (a `wrecker`, or a `pickup`; refused on any other class or rear). `rs.tow.set(out, lift)` moves the wheel-lift (0 stowed; out 1 lift 0 down under a car's front wheels; lift 1 raised), `rs.tow.hitch(v)` is the crossbar's top in the world (where a towed car's front wheels sit), `rs.setBeacon(on)` flashes the light bar. Mog City's runner plays it in the pack step `tow`. Studio: `?tow=1,0`, `?beacon=1`.
- **Sound:** the car's own profile object (`rs.sound`) goes on top of Mog City's engine sound, plus a `pitch` for the firing note.

## Not built yet (refused, never faked)

- **Families:** `heavy4`, `motorbike`, `scooter`, `bicycle` (see `x-planned` in the schema).
- **Doors:** the back doors and a van's sliding door don't open (`doorType` draws their cuts and rails only).
- **No LOD.** Each sheet builds to 34–64k triangles (the gate checks a 400k budget).
