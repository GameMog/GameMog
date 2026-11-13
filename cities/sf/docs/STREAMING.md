# Streaming: tiles round the player, and a floating origin

Milestone 3 groundwork. The product loads a city as tiles around the player: a tile is compiled on its first request
and cached by compiler version. Today San Francisco loads whole (about 60 MB of binary data and every system built over
it at start, `cities/sf/js/main.js`). This document covers four things: the tile grid, the rings and budgets, what each
system must do when a tile arrives or leaves, and the floating origin. It also says what is built now and what is
left. The tile **format** belongs to the city compiler (Milestone 2), so the runtime is written against an
interface, not a file layout.

Built now (all of it behind flags, so nothing changes without them):

| piece | file | flag |
| --- | --- | --- |
| TileSource interface + tile manager (rings, LRU, budget, `ensureLoaded`) | `wagmi/world/tiles.js` | always present, idle until used |
| in-memory TileSource: slices the city that is already loaded | `wagmi/world/tiles-mem.js` | |
| `world.ensureLoaded(x, z, r, lod)` returning a real Promise, `world.tiles` | `wagmi/world/common.js` | |
| manager follows the player (4 Hz) | `common.js` | `?tiles=1` (`&tileSize=`) |
| floating origin (render-space rebasing) | `wagmi/world/origin.js`, `index.html` | `?origin=float` (`&originN=` metres, `&originSnap=`) |

## 1. What San Francisco loads today, and the cells it already uses

| data / system | extent and grain | where |
| --- | --- | --- |
| core height field | 2 m cells, 4274 x 5590 m box from (-2584, -2892) | `terrain.js` (`Terrain.heightAt`), `data/terrain-core.bin` |
| region ground | city tier 8 m (1000 m tiles, -12..5 km x -6..10 km); horizon tier 32 m (4000 m tiles, 52 x 36 km) | `region.js` (`Terrain.addPatch`) |
| ground classes | 1 m mask over the core; 4 m region mask | `data/groundmask-core.bin`, `region/` |
| terrain mesh | 64 m chunks, LOD 2/4/8/16 m by distance, one mesh per 512 m tile | `terrain-mesh.js` |
| curb islands (blocks) | polygons, 64 m spatial index | `city-config.js` (`BLOCKS`, `blockAt`, `blocksInRect`) |
| ground and sidewalks | merged per 512 m cell | `sf-ground.js` |
| buildings | 15.7k footprints, extruded at load; region boxes in 1200 m chunks | `sf-buildings.js`, `buildings.js`, `region.js` |
| colliders | 54,584 static polygons and OBBs; a 48 m cell index built on first query | `controllers.js` (`nearColliders`) |
| road graph | 2,209 junctions and 4,809 drivable edges, built at load from the sidewalks and footprints | `road-network.js` → `trafficSystem.network` |
| static props | instanced and chunked by `scene-culling.js` (500 m shadow cells, 1000 m static cells) | `street-details.js`, `scene-culling.js` |

Every system already works on square cells of 48 to 4000 m, but each has its own cell size and builds its index once,
from the whole city. Streaming gives them one grid and a lifecycle.

## 2. Tile grid and keys

- Square tiles of `size` metres (**256 m** by default) on a grid that starts at the frame's origin:
  `ix = floor(x / size)`, `iz = floor(z / size)`. The frame is the world contract's frame (`world.frame`: metres,
  +x east, -z north). Tile keys are therefore stable across compiles, and a city's tiles never move.
- Each power-of-two multiple of 256 m lines up with the cells the systems use today (512 m terrain tiles and ground
  cells, 1024 m static cells), so moving a system onto the grid does not re-cut its data.
- **Cache key**: `<city>@<compilerVersion>:<ix>,<iz>`, for example `sf@mem-1:2,-3` (`manager.keyOf`). A new compiler
  version is a new key space: old tiles are never mixed with new ones. The server's cache and the browser's
  (Cache API / IndexedDB, Milestone 3) share this key.
- `source.has(ix, iz)` marks where a city has data. Tiles outside it are never requested. The in-memory source uses
  the region's flight bounds.

## 3. Rings, levels of detail, budgets

The manager wants each tile at the level of detail of the ring it falls in, by Chebyshev distance in tiles from the
player's tile:

| ring | radius (tiles) | reach at 256 m | level | carries (in-memory source) |
| --- | --- | --- | --- | --- |
| near | 1 (3 x 3) | ~384-640 m | `near` | everything: heights at 2 m, the 1 m ground mask, colliders, road edges and junctions, blocks, places |
| mid | 2 (5 x 5) | ~640-896 m | `mid` | heights at 8 m, roads, junctions, blocks, places (no colliders, no mask) |
| far | 4 (9 x 9) | ~1.1-1.4 km | `far` | heights at 32 m only (the horizon mesh) |

- Loads are queued **nearest first**, two at a time (`concurrency`). A tile that comes nearer is **upgraded**: the
  finer copy replaces the coarse one, and an `upgrade` event carries both.
- A tile that leaves every ring becomes **cold**. It stays in memory in an **LRU** and is unloaded only when the budget
  needs the room (default **160 tiles / 96 MB**). The rings always win: a tile inside a ring is never evicted. Driving
  back the way you came finds its tiles still there.
- Queued loads that fall out of every ring are dropped. A tile `ensureLoaded` asked for is **pinned** (kept and
  queued first) until that promise settles.
- A failed load emits `error`, rejects the `ensureLoaded` calls waiting on that tile, and is retried after 2 s.
- **Downgrade** (giving a mid tile's near layers back without unloading it) is not built yet: a tile keeps the finest
  level it has had until it is evicted. With real tiles the near layers dominate the bytes, so Milestone 3 should
  downgrade cold tiles before evicting them.
- Frame budget: the in-memory source slices a tile in its own task, so no single frame does more than one. Real tiles
  should decode off the main thread (a worker returning transferable typed arrays) and hand each system no more than
  one tile per frame.

`world.ensureLoaded(x, z, r, lod = 'near')` (or `({ x, z, r })`, or `({ minX, maxX, minZ, maxZ })`) returns a
Promise of the tiles the area touches. It resolves once each of them is at `lod` or finer. Mission placement
(`findMissionSites`), story markers, teleports and spawns must `await` it before they touch an area away from the
player.

## 4. What each system does when a tile arrives or leaves

Events: `manager.on('load' | 'upgrade' | 'unload' | 'error', fn)`. A system subscribes, adds what the tile carries for
it on `load` or `upgrade`, and takes it out on `unload`. Rule for all of them: **nothing in a ring is ever pulled out
from under the player**. Only cold tiles unload, and they are at least one ring (256 m or more) away.

| system | on load / upgrade | on unload | today (whole city) |
| --- | --- | --- | --- |
| **ground height** (`Terrain`, `world.groundY`) | register the tile's height grid as a patch for its rectangle (`Terrain.addPatch`, finest first) | remove the patch; queries there fall back to the next tier (mid → far → water level) | one core grid + region patches |
| **terrain / ground mesh** | build the tile's mesh at its level (the 64 m chunks inside it); skirts at the tile's edge | dispose its geometry | 512 m tiles over the core, LOD by distance |
| **physics colliders** (`controllerManager`) | add the near tile's colliders to the cell index (`nearColliders`' 48 m cells; 256 is a multiple of 64, not of 48, so the index cell should become 64 m) | remove them | all colliders, index built once |
| **road graph** (traffic, GPS, pursuit nav) | add the tile's edges and junctions; stitch edges that cross the tile border by their junction ids (the compiler must give border junctions stable ids, shared by both tiles) | remove the tile's edges; a route that crosses an unloaded tile goes on through the coarse graph of the mid and far rings | one graph, built at load |
| **chase** (`wagmi/pursuit`) | `nav` rebuilds the adjacency of the tiles it touched | chase cars further than the near ring are respawned (they already are, out of sight); their next route is planned within the loaded graph | A* over the whole graph |
| **traffic** (`traffic.js`) | lanes in near and mid tiles become spawnable | cars on a leaving tile are despawned (they already despawn out of range) | spawns round the camera on the whole graph |
| **crowds** (`pedestrians.js` via `traffic.js`) | sidewalks of near tiles become spawnable | people on a leaving tile are recycled into the pool (a fixed GPU buffer: no reallocation) | spawns round the camera |
| **places / mission sites** (`world.places`, `findMissionSites`) | index the tile's places | keep a light index of all places (the place library is small) so missions can choose sites anywhere, then `ensureLoaded` before they use one | whole place library at start |
| **story markers, set dressing** | anchor to a place or point; draw once that tile is `near` (`await world.ensureLoaded`) | stay registered; their meshes are hidden while the tile is cold | always present |
| **buildings, props** | instance the tile's buildings and props (near: full fronts; mid: boxes; far: the region's boxes) | dispose; shared materials and pipelines stay compiled | built whole at load, distance culled |

## 5. Floating origin (`?origin=float`)

**The problem.** The GPU works in 32-bit floats. At about 8 km from the origin a float32 resolves only about 1 mm,
and at 30 km about 4 mm. Vertices jitter, shadows crawl, and depth-sensitive effects break down. San Francisco's
playable core is within about 3.5 km of its origin (Market St x Montgomery St), so today it is fine. A larger city,
or any city whose origin is not near the action, is not.

**The design: rebase render space, not world space.** The world contract's coordinates stay absolute metres in the
city's frame, forever. That covers physics, the road graph, the chase, the crowds, mission and story coordinates, saved
games, and story packs. They are JavaScript numbers (64-bit), so even 100 km out they resolve to about 10⁻¹¹ m. Moving
that state at each rebase would touch every system and every pack's coordinates, for no precision gain. What is
rebased is what the GPU sees:

- `wagmi/world/origin.js` wraps `renderer.render`. For each render of the city's scene, it shifts the scene root by
  `-origin` and the camera by the same amount, renders, then puts both back. It also recomputes the matrices
  (`scene.updateMatrixWorld()`), so a raycast, `getWorldPosition` or a projected HUD marker between frames sees the
  absolute frame exactly as before. A nested render, such as the shadow cascades, runs inside the shifted one.
- **Rebase**: when the camera is more than `threshold` m (`?originN=`, default 1000) from the origin, the origin moves
  to the camera, on a grid of `originSnap` m. Nothing else moves: the next frame simply draws with the new offset.
- **Lights** whose direction is their position (the `SunLight`, the hemisphere light, a target-less directional light)
  are held where they are, so the sun does not turn. Positional lights move with the scene.
- **Shaders**: TSL's `positionWorld` and `cameraPosition` are swapped, in `window.NYC.TSL` (`index.html`), for
  themselves plus `NYC.ORIGIN`. That is a uniform equal to the origin during the city's renders and 0 otherwise. A
  world-anchored pattern, the region's ground mask lookup or the aerial fog's western bank therefore stays where it
  was. The post-processing fog reconstructs world positions from `camera.matrixWorld` after the scene pass, which is
  already absolute again. `NYC.renderOrigin` gives the same offset, during a render, to scripts that read the camera
  from inside it (the tree LODs' `scene.onBeforeRender`).
- **Cost**: one extra matrix pass over the scene per frame (2,892 objects), paid only once the origin is off zero.
  In San Francisco it runs about 0.6 ms a frame (0.3 to 1.0 ms across runs; see section 6).
- **What streaming adds**: a tile's vertices must be stored **tile-local** (relative to the tile's corner), with the
  tile's mesh placed at its corner. Today's city meshes carry world coordinates in their float32 vertices, so they
  keep the precision they have now. Rebasing makes the matrices exact; tile-local vertices make the geometry exact.

**Known limits.** A module that imports `positionWorld` straight from `three/tsl` rather than `window.NYC.TSL` is not
patched, so its world-anchored pattern would follow render space. In San Francisco only three's own addons do this,
and they use it relative to the camera. `wagmi/mission/m2-set.js`, New York's mission 2 set, also does it. Shadow
texel snapping is relative to the camera, so a rebase can move a shadow edge by up to a texel for one frame.

## 6. Measurements

Setup: San Francisco on this machine (headless Chrome on Metal, 1280 x 720, `gfx=high`), driven by the scripts in
`.scratch/st/` (git-ignored). Each run used a fresh browser, and the four configurations were interleaved over 3
rounds. Other agents' browsers were running on the same machine throughout, so whole-frame numbers vary 12-22 ms
from run to run whatever the flags. Read the costs measured directly (the last three rows of the table) rather than
the frame-time differences.

`bench2.mts`, main.js's `?bench=car` path (a 1.3 km street-level camera flight over 20 s). The CPU figure is the
time per frame inside the city's loop: update plus render submission, not GPU time.

| | off | `?tiles=1` | `?origin=float&originN=300` | both |
| --- | --- | --- | --- | --- |
| loop CPU ms, median of run medians (runs) | 15.7 (22.3, 15.7, 15.0) | 18.9 (20.8, 18.9, 12.8) | 17.5 (20.4, 17.5, 13.1) | 16.3 (17.9, 16.3, 12.6) |
| loop CPU p95 ms, per run | 69.9, 40.1, 40.9 | 58.8, 52.0, 32.5 | 55.8, 47.9, 33.6 | 51.9, 43.6, 31.5 |
| JS heap, MB, 5 s after the path | 1198, 1366, 1299 | 1378, 1294, 1060 | 1320, 1350, 1125 | 1306, 1326, 1341 |
| tiles in memory, payload | none | 135-137 tiles, 5.9 MB | none | 135 tiles, 5.9 MB |
| tile slice, mean / slowest ms | | 0.17-0.34 / 16.7-35.9 | | 0.21-0.27 / 20.9-25.8 |
| origin: rebases, extra matrix pass ms/frame | | | 5, 0.58-0.88 | 5, 0.59-0.77 |

- **The tile manager** costs about 0.2-0.3 ms per tile slice, one tile per task. The one exception is the first slice,
  at 17-36 ms, because it builds the source's indexes over the whole city in one go. That hitch belongs to the
  in-memory adapter (real tiles carry their own index); it could be split across idle time if the adapter stays.
  Updating the rings at 4 Hz is negligible. The payload is 5.9 MB for the 135 tiles of this path: about 44 kB per
  tile on average, and up to about 150 kB for a near tile with its 1 m mask and 2 m heights. That is about 0.5% of
  the page's 1.1-1.4 GB JS heap, which sits inside the heap's run-to-run noise (±150 MB). The colliders, roads,
  blocks and places a tile lists are references to the loaded city's records, not copies.
- **The floating origin** costs 0.6-0.9 ms per frame on this path for the extra matrix pass. It costs nothing until
  the first rebase.
- Whole-frame medians: no difference shows above the noise. Every configuration's runs overlap the others'
  (12.6-22.3 ms).

## 7. Verification

Runs on 12 Nov 2026, scripts and logs in `.scratch/st/` and `.scratch/hometown/` (git-ignored).

- **Unit tests**: `node --test tests/tiles.test.mjs` passes 6 of 6 (rings, upgrades, LRU eviction, `ensureLoaded`
  as a Promise, rectangles and `has`, failures and retries). The repo's whole node suite has the same failures with and
  without this branch: 39 test cases fail on both, all of them in files this branch does not touch.
- **Flags off, behaviour unchanged**: `fixcheck` gives `errors: []` on all 5 worlds (sf2040, ny-free, pickup-eng,
  night-shift, native). The full SF 2040 test drive reaches `story-end` at 894 s with 0 errors.
- **Flags on**: the full SF 2040 drive with `?origin=float&originN=300&tiles=1` reaches `story-end` at 930 s with 0
  errors. Along the way it makes 15 rebases (origins from (-2364, 2353) to (626, -621)) and loads 437 tiles,
  evicting 277 of them under the 160-tile budget, with 0 tile errors (`driveOn.log`). An earlier run with the same
  flags finished the story with 0 errors and 16 rebases; its end was confirmed from the screenshot, because the
  script then lost track of host messages (fixed since).
- **No jump at a rebase, frame for frame** (`rebase.mts`): the city frozen and the player standing on the Embarcadero.
  Four forced rebases were made, to the player, 3.2 km away, back to 0, and 50 m off. Each changed the image by no
  more than two frames 0.4 s apart with no rebase (mean abs difference 0.9-1.1 against 1.1-1.3; the crowd and
  the sky move). A sample of the scene's world matrices and the player's position read back identical after every
  rebase. The screenshots (`rbA-*.jpg`) show the same street, shadows, crowd and car; a cutscene at an origin 3.2 km
  off renders normally (`rbB-3-far.jpg`).
- **A 2-3 km drive under a chase** (`chase2k.mts`, `?start=chase`, the car steered along the GPS route to Civic
  Center, sampled every second): 7 runs with `originN=250` drove 1.4-3.0 km each, with 2-9 rebases per run and 1-5
  of them during the chase. The largest one-second move was 33-49 m (the car's own speed). No sample showed a jump,
  and the pursuit stayed `on` across every rebase.
  **Open**: the chase ended as lost before the 100-160 s mark in 5 of 7 rebasing runs, against 1 of 6 runs without
  the flag. Every lost chase traced so far went the same way as the one lost without the flag: the player's ramming
  wrecks one car (heat 2 sends no reinforcement), and the other loses sight. The pursuit's inputs were checked at its
  own step: the camera's matrix matches its position (0 mismatches in 704 frames), and its frustum, sight lines,
  colliders and routes are all JavaScript-side. So no mechanism linking the rebase to it has been found, but the
  skew has not been explained either. Re-check it with a seeded `Math.random` before relying on `?origin=float` in
  chase-heavy play.

## 8. Left for Milestone 3

- Sources: a `CompiledTileSource` over the compiler's tiles (`fetch` with the cache key, worker decode), and the
  in-memory source kept for tests.
- Systems on the events (section 4), one at a time, each behind its own flag until it plays the full SF 2040 drive
  with 0 errors. Do ground height and colliders first (correctness), then roads (the stitching rule), then meshes.
- Downgrade before evict; byte budgets per layer; a frame budget per system.
- Tile-local vertices in the format, then retire world-space vertices.
