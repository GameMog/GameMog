# San Francisco (`?city=sf`)

Mog City's second city: **Slop San Francisco** by Kamil ([@unable0_](https://x.com/unable0_)), itself built on Mr.doob's
Slop New York, MIT (see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md); its map data keeps its own terms, below). Open
the game with `?city=sf` and it boots this city on Mog City's own engine: Dan, his car, the fight, the street, the
crashes, the chases, the radio, the pad, the HUD, the map and the pause menu, in free roam on the Embarcadero by the
Ferry Building. Without `?city=sf` the game is New York, exactly as before. It runs on WebGPU only (desktop Chrome or
Edge): without it a card says so and offers New York.

## Where it came from

A copy of `storykit/cities/sf` in GameMog (itself upstream
[unable12/slop-sanfrancisco](https://github.com/unable12/slop-sanfrancisco) at `bdd5d37`, with GameMog's small Story
Kit patches): its runtime scripts (`js/`), its data (`data/`), its licence, notice and the two data docs (`docs/`).
Not copied: upstream's `index.html` (Mog City's own page boots it), its settings dialog and robotaxi ride (`settings.js`,
`ride*.js`: Mog City's pause menu and Dan's car are the game's), its offline data tools (`tools/`, in upstream and in
GameMog's copy) and `data/terrain-region.bin`, which nothing loads.

`index.html` picks the scripts: the ones here, and the modules both cities share from `js/` as they are
(`pedestrians.js`, `touch-controls.js`, `gamepad-controls.js`, `cameras.js`, `scene-culling.js`, `vehicle-lights.js`).
`js/cameras.js` carries this city's hill clearance (the lens over the ground, under a tunnel's roof, the boom shortened
by a hill) and its scenic shots (`SCENIC_CAMERAS`, below); none of it runs in New York, which has no terrain.

## What Mog City changed here

- `js/sf-hud.js` (new): this city's words on the markup the two cities share (the loading line, the map's title,
  search and its OpenStreetMap credit line, the teleport list, the scenic cameras' shots), and the needs-WebGPU card.
- `js/main.js`: booted by Mog City's page (its HUD markup, its graphics row in the pause menu, the game pad, Dan's car's
  dial, Mog City's key guide); the spawn on the Embarcadero; no settings dialog, no ride, no R reset (R is the radio).
- `js/controllers.js`: what Mog City's game reads from New York's controllers, ported: the camera-relative walk, the
  fight's and Dan's hooks, the pad's input, the car's drive model, keyboard handling and own body against the walls,
  the crash's hooks, the low things on foot, `baseHeight(x, z)` (the bare ground), and the curb for a car's wheels; each
  building's outline given a fitted turned box (`obb`) for the game's readers of the colliders.
- `js/world-collision.js`: a car's footprint from its own body's box (`carShape(..., body)`, `bodyReach`).
- `js/traffic.js`: the game's `blockers` and `hold(rects)`, and the freeway cars' `place`, `near` and `knock`.
- `js/sf-street-details.js`: `window.NYC.breakables` (masts, lamps, signs and poles that snap, hydrants and meters
  that fly, the street trees solid) and `window.NYC.streetFootprints`, as New York's street details publish them.
- `js/sf-map.js`: the player's waypoint (`userWaypoint`, `onWaypoint`), the game's places in the search
  (`searchExtra`), and the sandbox's teleport behind `?debug`.
- `js/data-loader.js`: the data ships gzipped (`data/*.bin.gz`, 60 MB to 20 MB) and is inflated as it loads.
- No company's name on screen: the landmark labels (`city-config.js`), the rooftop sign (`landmarks.js`) and the shop
  signs (`buildings.js`) say what a place is instead.

## Data and its terms

City and County of San Francisco open data (DataSF): PDDL / CC0. USGS 3D Elevation Program: a US government work.
(c) OpenStreetMap contributors, ODbL 1.0: the OSM-derived parts of `js/sf-geodata.js`, the landmark anchors in
`js/sf-places.js`, and the regional coast, islands and ferry routes in `data/region`; the game credits them on its map
and its Credits page. Sources and provenance: [docs/data-sources.md](docs/data-sources.md); formats:
[docs/formats.md](docs/formats.md). Each `.bin.gz` is its `.bin` gzipped (`gzip -9 -n`), byte for byte once inflated.
