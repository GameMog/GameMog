# Hometown compiler 0.14.0 (the national grid hg1)

Turns open US map data into **tiles on one national grid**. A tile is compiled from its own sources and context alone,
so any tile can be compiled on first request, neighbouring towns share identical tiles, and a place is just a list of
tiles plus a session frame. The legacy assembler still lays a place out as one package for Mog City's San Francisco
engine base: `?city=pkg&pkg=<id>`.

## Run it

Python 3.14 with the pins of `requirements.txt` (`duckdb`, `numpy`, `shapely` 2, `pillow`), installed from the
hash-pinned `requirements.lock` (`lock_requirements.py` regenerates it from PyPI; `--check` says whether it is stale):

```bash
python3.14 -m venv venv && venv/bin/pip install --only-binary :all: --require-hashes -r tools/hometown/requirements.lock
venv/bin/python tools/hometown/duck.py --install     # the ONE step that downloads duckdb's httpfs + spatial extensions
```

Nothing installs anything at run time: `duck.py connect()` only `LOAD`s the extensions, from `DUCKDB_EXTENSION_DIRECTORY`
(the town-builder image installs them there at build time) or duckdb's default directory, with auto-install and
auto-load off, and fails loudly (`MissingExtension`) when one is not there. No account, no API key. Raw data and the
store live under `.scratch/` (git-ignored).

```bash
# 1. Overture rows per L4 region (the regions a place's tiles + 3.2 km touch; one S3 read per layer for all of them)
python tools/hometown/fetch.py --regions "conus:362,535;363,535;362,536;363,536;362,537;363,537"
# 2. a place (tools/hometown/places.json): its descriptor, its tiles (store), then the legacy package
python tools/hometown/compile.py --id okemah                       # -> cities/pkg/packages/okemah/
# or single products (the tile service's subprocess contract):
python tools/hometown/compile.py --tile hg1-conus/0/5806/8582 --out -      # HTL1 on stdout
python tools/hometown/compile.py --block hg1-conus/2/1451/2145 --out -     # HTB1: the 16 children
python tools/hometown/compile.py --ctx hg1-conus/4/362/536
python tools/hometown/compile.py --descriptor okemah --stage 1             # JSON
python tools/hometown/compile.py --print-build --data <data>               # the buildId and its record (pass the
                                                                           # same --data as the compiles: the OSM
                                                                           # lane table under it is in the id)
python tools/hometown/compile.py --dem-snapshot                            # re-pin the DEM to a NEW listing
# the production builder's jobs (one process each, every product stored ifAbsent, or HTB1 on stdout with --out -):
python tools/hometown/compile.py --tiles hg1-conus/0/5805/8582,hg1-conus/0/5806/8582 --out -   # a tile list, ONE World
python tools/hometown/compile.py --far-list hg1-conus/1/2902/4291,hg1-conus/3/725/1072        # a far window
python tools/hometown/compile.py --frame okemah --out frame.json                               # the frame (below)
python tools/hometown/compile.py --assemble okemah --window district --frame frame.json --out <empty dir>   # a bundle
python tools/hometown/fetch.py --index                                    # once per Overture release: the file index
```

### Pre-warm a list of towns (hosting, phase 1)

GameMog's server only serves towns; they are built here, one child process per town, and uploaded. `requirements.txt`
pins the libraries: a build's id hashes their versions (and Python's and zlib's), so another environment makes another
build. GameMog's `scripts/hometown-prewarm-list.ts` writes the list (top N by 2010 population, as `us-<GEOID>`, each
with its capped play box) in `places.json` format:

```bash
python tools/hometown/prewarm.py --places top100.json --store .scratch/prewarm/store [--only us-4054200] [--jobs 1]
```

A town whose regions are not fetched is refused by the compiler with the regions it needs; `prewarm.py` fetches them
and retries. Finished towns go to `<store>/state/prewarm-<buildId>.jsonl` (seconds, tiles, bytes, the terrain share,
the peak RSS of the children so far) and are skipped on the next run. Peak RSS measured on an M-series Mac
(`/usr/bin/time -l`, 12 Nov): a whole-place compile 1.2-1.8 GB, one `--block` 0.36-1.2 GB, one `--tile` 0.35-1.2 GB,
a stage-1 descriptor 65 MB, and `fetch.py --regions` (duckdb over S3, no memory limit) about 3 GB.

The 3DEP heights are read lazily from the USGS cloud-optimized GeoTIFFs (HTTP range reads of 512 px internal tiles,
If-Match the store's DEM snapshot) and mirrored
in the store's `dem/` prefix; after the first read everything is offline. A store with no `dem/current.json` (a new
GameMog or Render disk) is seeded with the snapshot the compiler ships, `dem-snapshots/dem-12b3e06663843b4d.json.gz`
(`dem.PINNED`, the one the pre-warmed packages were built at), so it reaches the same buildId with no USGS listing;
`compile.py --dem-snapshot` moves a store to a newer listing (a new buildId). When USGS replaces a pinned file under
`/current/` (412), the pinned version is read from its dated copy under `.../TIFF/historical/{name}/` (matched by
ETag and size, still If-Match), with the same bytes and demSource: a build never fails because upstream moved, unless
USGS kept no copy of that version (`dem.DemUnavailable`, refused per tile).

## The grid (`grid.py`, frozen as hg1)

- Per-domain Lambert Conformal Conic on GRS80, Snyder's ellipsoidal forms, no datum shift. Domains `conus`, `ak`
  (longitudes normalised to (-200, -125]), `hi`, `pr` (+USVI), `gu` (+CNMI), `as` (n < 0); the domain comes from the
  Census GEOID's state prefix. Grid metres E' = E + FE, S = S0 - N (southing: the engine's +z).
- Integer centimetres once per source vertex (`round_half_even`); every ownership and clipping decision is integer or
  exact-rational after that.
- L0 tiles 512 grid-m (`c = gx // 51200`), 2 m posts (257 x 257, edges shared), 1 m mask cells, L2 compile blocks,
  L4 context blocks (8192 grid-m).
- `grid-vectors.json` (`grid_vectors.py`): 91 vectors over the six domains, edge-exact cm points, Attu, American Samoa;
  `tests/grid.test.mjs` holds the JS twin to them.
- Changing any of this is **hg2** (a new key namespace).

## A tile = f(buildId, key, sources over tile + halo, ctx blocks)

| Layer | Rule |
|---|---|
| terrain | each post's lon/lat (inverse projected) sampled bilinearly on the global 1/3" lattice, every pixel from the one file whose degree cell holds it (`dem.py` Sampler); water posts flattened to their polygon's level from ctx (per block); bridges up to 600 m with no road under and no water under raised; blur sigma 1 post with a 2-post halo; cm half-even; stored absolute (NAVD88), `base_cm` + uint16 |
| roads | whole Overture segments meeting tile + 160 m, split at their connectors, then at every grid line E' = 512k / S = 512k exactly (int cm, `Fraction`); border nodes `b:{segment}:{E|S}{k}:{ordinal}`; a sub-piece belongs to the tile holding its first edge's midpoint; junction controls from every piece at the connector; no box-edge cut |
| curb islands | land minus roadways over tile + 128 m, each island classified before the clip: one under 120 m2 inside the window is a median; the rest by local width (`ISLAND_W` 6 m: the parts a 6 m morphological opening leaves out are islands, the rest block, so a polygon the window cuts gets the same kinds where two tiles' windows share it), clipped to the tile, clipped edges flagged `cut` |
| buildings | owned by the tile holding the exact centroid of the full footprint (integer shoelace), outline kept whole (may overhang), base and rise from the post function over the footprint; `foreign` lists the owners of buildings overlapping the tile |
| ground | off the curb islands asphalt; on them the climate's open land (`climate.py` from the tile centre: humid lawn, dry scrub, arid sand), Overture land use over it (`lu_ground`, larger first), the **beaches** over that (Overture land subtype `sand`: OSM `natural=beach / sand / dune`, not `shingle`; a beach resort's land use too) as **beach (10)**, then paved: Overture car parks (infrastructure `parking` polygons) and 6 m lots round commercial buildings (`LOT_KINDS`) as **lot (7)**, a downtown's buildings in 12 m of paved square, the narrow islands (but a divided road's median island: open ground) and the sidewalk bands (class sidewalk width past the curb) as sidewalk; a humid open hillside (slope > 0.35, 12 m from any house) **woods (9)**, rock past the cliff slope (never on a beach); a beach's sand within 6 m of the water, and the water's edge band within 4 m of a beach, **wet sand (11)**; a curb island's park share leaves its beaches out (a park's beach is no lawn). 0.11.0 (r7), the warm band only: a trunk / primary road's **planting strip** (each side with a sidewalk has it `STRIP_M` 2 m back from the curb, the grass strip between, a cross street's own sidewalk running on over it), and the **dunes** behind a beach (the open land, no land use and nothing paved, within `DUNE_M` 30 m of the sand: beach sand where a value noise on a global 5 m lattice is under 0.75 less 0.6 x the share of 30 m it lies back from the beach (in 6 m steps), scrub elsewhere) |
| trees | yards: a 13 m lattice in global grid integers, `hash01(i, j, k ^ domain)`, 3..25 m from a building, clear of footprints + 8 / 12 m and bare ground (paved, water, beach and wet sand); woodland: a 16 m lattice over the woods cells; `desert` = arid climate. The **warm band** (`climate.warmth`, below): yards 3..45 m from a building, the paved squares allowed, a palm / sea grape / evergreen mix (`WARM_YARD`); and street plantings (`warm_plantings`): stations along every street piece's ground lines at fixed arcs from the piece's start, each side of a segment planted or not and its species by `hash01(crc32(segment id), side, k ^ domain)` (rows): palms every 12 / 15 m in the strip 1.8 m past the sidewalk, clipped **hedge** blocks every 2 m on the property line (0.7 m past it; the class's fourth field is the block's yaw in degrees; 0.8.2: on a trunk / primary / secondary road a **hedge wall**, its field the yaw + 180, on 85% / 75% of the sides (tropical / subtropical) instead of 60% / 35%, on lawn, scrub or a paved lot; the engine draws it 2.4 m tall, 1.4 m thick, and an older engine as a plain hedge turned 180 degrees), and on one-way pieces palms 1.3 m past the curb where that is a narrow island (medians). 0.8.2: **hedge walls round the car parks** (Overture parking polygons of 300 m2 or more, kind 4): a block every 2 m round each polygon's exterior ring (counter-clockwise, from its first point), 0.9 m outside it, dropped inside any car park, within 2.5 m of a street hedge's raw station, or off lawn / scrub / lot, deduped 1 m by key (car park id, polygon, k). Each side reads its own sidewalk (fid-roads' `swl` / `swr`); a divided road's inner side (towards its other carriageway, `pair`) has no hedge, and its street palms stand only where the median is wider than a narrow island (kind 3, deduped as the street row). A station of a kind is dropped where one of the same kind with a smaller key (segment, piece, line, side, k) stands within 5 / 1 / 5 m (raw stations, before any check, so every tile agrees), then kept only inside its tile, on lawn / scrub / sand (a hedge: lawn / scrub along its length; a median palm: a narrow island), clear of buildings (2.5 m, a hedge 1.2 m) and decks. 0.11.0 (r7): a street piece with a planting strip has its palms and hedge `STRIP_M` m farther out; a hedge wall side the draw left bare keeps the stations where a lot fronts the road (residential or developed land use 4 m behind the hedge line); every street hedge and car-park wall (and the trees over it) has a gap where any other Overture segment (a driveway, a lot entrance, a footway) crosses its line within 3 m (cos < 0.7 to the hedge); and **trees over the hedge walls** (kind 5): a station every 8 m, 2.6 m behind the wall, 70% of them by the station's hash, a ficus (a quarter of them) or a sea grape, on lawn or scrub, none within 2.5 m of a street palm's raw station, deduped 5 m. Classes: 0 plane, 1 ficus, 2 palm, 3 elm, 4 conifer, 5 locust (San Francisco's), 6 royal palm, 7 coconut palm, 8 sabal palm, 9 sea grape, 10 hedge |
| mask | 512 x 512 1 m cells: asphalt, sidewalk, lawn, sand (3: bare desert ground), rock, waterEdge, **water (6)**, lot (7), scrub (8), woods (9), beach (10), wetsand (11) |
| places, water, parks | POIs owned by the tile; water and park polygons clipped, each water with its ctx `level_cm` |

**Context blocks** (`context.py`, L4): `bcnt` / `pcnt` (buildings / places per 64 m cell) and `wlev` (each water
polygon's median DEM height inside it, per block). They replace v0's whole-place inputs: the dense height blend
(buildings within 1 km of a building, `smoothstep(800, 1600)` per km2), the downtown field (POI scores within 250 m,
centres by non-max suppression within 2 km, downtown = within 350 m of a centre) and the per-polygon water levels.
A tile reads the ctx blocks within 3.2 km and the regions within 3.2 km (a tile whose regions are not fetched is refused
with the fetch command to run).

**buildId** `htc-0.14.0-hg1-b{8 hex}`: the first 8 hex of the sha256 of the build record (`builds/{buildId}.json`:
compiler version, libraries incl. GEOS and zlib, the CPU architecture (`machine`) and the duckdb `spatial` extension's
version, image digest (`HOMETOWN_IMAGE_DIGEST` from the environment: the town-builder image sets a recipe id), Overture
release, DEM snapshot, grid, and since 0.14.0 the core table's sha256, `cores`). Compiler logic
changes bump `COMPILER_VERSION`; library, image or source changes change only `b`.

## Containers (gzip, mtime 0, sorted JSON)

- **HTL1** tile: `HTL1`, u32 header length, header JSON (format `hometown-tile` v1, grid, domain, L, c, r, buildId,
  demSource, vdatum, bcount, groundAreaM2, k_tile, waters, foreign, ctx, sections), then sections: `terrain`, `mask`,
  `buildings` (JSON, heights in absolute cm), `bverts` (int32 cm, tile-local), `roads`, `blocks`, `trees`, `props` (0.13.0), `places`,
  `water`, `parks`. `wagmi/world/tiles-net.js` decodes it.
- **HTC1** ctx, **HTB1** block stream (per child: u32 id length, id, u32 body length or 0xffffffff + reason).

## The frame and lock v3 (`frame.py`, the production builder's spawn-first path)

A town's **frame** (`--frame <placeId>`, stored at `frames/{buildId}/{placeId}.json`, format `hometown-frame` v1) is
everything the story and the engine pin, computed from stage 1, the ctx blocks, the regions and the DEM and **never
from a compiled tile**, so it exists seconds after a town is picked and is the same bytes whatever tiles the store holds
(`test_frame.py`: none, some, all, and a store that fails on any `tiles/` read):

- `yOffset`, `waterLevel`: stage 2's rule (0.5th percentile of dry ground; the largest water within 1 m above it) on the
  tiles' own post function at every 8th post (16 m) over the play box (3DEP bilinear at the 5 x 5 posts round it, water
  flattened to its ctx level, the sigma-1-post blur; `test_frame.py` proves it equals `World.posts_cm` there), less
  the bridge raise (it never lowers ground).
- spawns and story places: the tiles' own road pieces (`World.pieces`: same projection, cm, names) less motorways,
  private, pedestrian, tunnel and any bridge or level > 0 stretch; places by the tiles' rule, snapped within 80 m;
  downtown from ctx; nearest-lane ties broken by (segment, piece), never by an index's order. Their street names are
  spelled as a sign spells them (`street_names.street_case`: "N 3rd St", "NE 2nd Ave", "McDonald Ave", "US Hwy 1",
  "St John's Rd"; before 0.10.0 Python's `str.title()` wrote "N 3Rd St"). Tests: `test_street_names.py`.
- 0.12.0 (r8): each story place's **approach** `ax, az` (`approach.py`; `aHow` says how it was found, `approachRule` counts them):
  where a person on foot is sent, never inside a building (the owner's rule, 14 Nov: nobody can enter one on the
  platform). Outdoors, 1.5 m clear of every Overture footprint (a roof a person walks under, ROOFS or raised 3 m, is
  no wall on the way but no place to stand), off the water and off the carriageway (half its class width, or its width
  rule, plus 0.75 m), with a straight walk 0.5 m clear of every wall to the place's lane point (or, that lane point
  under a roof, to the nearest open road point within 25 m). The place itself when a person can stand there (a park,
  an open lot), else its front toward its lane (the first free point from its centre toward the lane), else the
  nearest free point round it within 60 m; once more at a relaxed clearance; none: no `ax, az` (the engine keeps the
  lane point, and the story runner's guard moves any target a person cannot stand on). The tiles are untouched: only
  the frame (and so the bundle's `PKG.places`) gains the fields. Tests: `test_approach.py`; `reach_scan.py <package>`
  checks a compiled town's places against its own compiled buildings and ground mask.
- the **spawn district**: the spawn's tile and 2 tiles each way (5 x 5); spawns and places inside it less 300 m carry
  `district: true` (the Story Kit keeps mission 1 there).
- `streets` (names and metres in the box) and `density` (ctx building counts per km2 of land).
- **lock v3** `{format 'hometown-city-lock', formatVersion 3, place, buildId, grid, domain, origin, k0, gamma0,
  yOffset, waterLevel, tiles}` with `tiles = sha256(buildId + '\n' + the sorted tile ids joined by '\n')` (no trailing
  newline): the same for every bundle variant. The stage-2 manifest keeps the content `tileSetHash`.

Since 0.8.0 stage 1 is round 3's: a capped place (its `searchBbox` wider than its capped `bbox`) takes the same size of
box centred on its downtown (`assemble.downtown_box`), so the frame's play box, tile range, district, spawns and lock
are all over the downtown-centred box.

**The core step (0.14.0).** The 0.8.0 search looks for that downtown only within half a box of the Census internal
point, and some big places' internal points are farther than that from their downtown: San Jose's lies 8 km south-east
of it (its 0.8.0 box is Story Rd and Senter Rd), Phoenix's 14 km north, Los Angeles' 16 km west. `cores.json` lists the
**core** of each such place: its Overture locality point (OpenStreetMap's place node, which mappers put on the downtown,
the main square or the city hall), matched to the Census place by state, folded name and its search box, for the 1,580
capped places whose core lies outside the internal point's window (`cores.py --census <GameMog lib/places/us-places.tsv.gz>`
rebuilds it, ~10 s, once per Overture release). When the 0.8.0 box misses the core, `downtown_box` takes the strongest
ctx centre within half a box of the core instead, if it scores at least the 0.8.0 centre (POIs within 250 m); else the
0.8.0 box with `boxRule.coreKept` saying why. The frame's `boxRule` names the core, its source and both centres. Every
place whose 0.8.0 box already holds its core, or that has none, keeps that box byte for byte (checked on Bozeman and
Pittsburgh: the same box, tiles and `boxRule` as 0.13.2), no tile's bytes change, and the session frame's origin stays
the internal point's tile (a moved box lies kilometres from the origin; every coordinate is still the frame's). A
places entry may carry its own `core: [lon, lat]` (a dev box, a test). Tests: `test_cores.py` (the rule on stubbed
centres; the table; `HOMETOWN_CORES_CENSUS=<tsv>` re-derives the table and compares). GameMog's
`scripts/hometown-build-pycheck.py` checks that the table reads the same search and play boxes GameMog sends.

| place | 0.13.2 box (W, S, E, N) | 0.14.0 box | moved |
|---|---|---|---|
| San Jose (us-0668000) | -121.85016, 37.29601, -121.79935, 37.3365 | -121.91628, 37.31515, -121.86546, 37.35564 | onto downtown (score 921 vs 210) |
| Phoenix (us-0455000) | -112.13506, 33.56426, -112.08654, 33.60475 | -112.09776, 33.42904, -112.04924, 33.46953 | onto downtown (897 vs 239) |
| Bozeman (us-3008950) | -111.06506, 45.6587, -111.00719, 45.6992 | the same | no (core in its window) |
| Pittsburgh (us-4261000) | -80.02648, 40.41855, -79.97337, 40.45904 | the same | no (0.8.0 box holds the core) |

**Releasing it.** Stored worlds pin their buildId: 0.13.2's frames and bundles stay and are served as before; a
published story pinned to a town whose box moved stays on its build (GameMog lib/storykit-upgrade.ts: a place not on the
new map, or a datum that moved, holds it). Like any compiler release every town rebuilds cold under the new buildId on
its first visit (`HOMETOWN_DAILY_COLD`); the towns whose box moves are exactly the listed places whose 0.8.0 box misses
their core. No engine change: the engine plays a box kilometres from the origin (driven: San Jose, 0.14.0).

The assembler lays out spawns, places, the datum and density **from the frame** (one source of truth); `--id` computes
and stores the frame first. `--assemble <placeId> --window district|full --frame <file> --out <dir>` writes a **bundle**
over a window: `geodata.json` (`hometown-bundle` v1: GEO, PLACE_DATA, PKG), `lock.json`, `data/*.bin.gz`,
`manifest.json` and, last, `bundle.json` (every file's sha256). `PKG.variant` (`district-{c}-{r}` | `full`),
`PKG.window` (`{variant, tileRange, box, full}`), `PKG.district`, `PKG.tilesId`; far tiles are listed by store key
(`far/{buildId}/hg1-{d}/{L}/{C}/{R}`, with sha256 and bytes) instead of copied, a district's only those already stored
(`--far-mode stored`), and a district's arrivals (`PLACE_DATA.regional`) only those inside its window less 150 m. The
bytes are a function of (frame, window, the tiles, the far tiles) (`test_assemble_window.py`, cold store or warm: the grade groups' diagnostic `stats.grade`, which only
covers the tiles a run compiled itself, goes to the build log, never into `manifest.json`).

## Fast cold fetch (`fetch.py`, M5)

- `fetch.py --index` lists, once per Overture release, every S3 file of the 8 layers with the bbox of its rows (its row
  groups' `bbox` statistics) into `<data>/overture-index/{release}.json`; `--regions` then reads only the files whose
  bbox meets the envelope (none: an empty layer), instead of opening every footer.
- The 8 layers are read in parallel through one duckdb database (cursors share `memory_limit` 2GB; `threads` 4; the
  object cache on; `HOMETOWN_FETCH_MEMORY` / `HOMETOWN_FETCH_THREADS`). `--no-index` / `--serial` give the old read.
- Each region's share of each layer is split from the union locally, in parallel through the same database.
- Since 0.8.1 a region also holds `overture-base-land.parquet` (Overture's natural features, less the coastline land
  masses, subtype `land`: `fetch.LAYER_WHERE`); the compiler reads its sand (beaches) and refuses a region fetched
  without it (`sources.REQUIRED_FILES`), naming `fetch.py --regions`, which for a fetched region reads only the layers it
  has no file of (a top-up; `prewarm.py` runs it on the refusal). An index built before the layer lists no files for it:
  that layer is read by the glob.
- `dem.py` reads every internal tile a sample needs ahead of the loop, 16 range reads at a time
  (`HOMETOWN_DEM_THREADS`); the values are unchanged.

Measured 13 Nov 2026 on the dev Mac (a loaded 10-core M-series, load average ~300 from other work; Phoenix's 4 regions
`conus:530,453;531,453;530,454;531,454`, from Overture's public S3 in us-west-2): the old read (glob, one layer at a
time) **418 s**, peak RSS 0.89 GB; the index, once per release, 263 s (512 + 128 + ... = 769 files), 0.58 GB; the
indexed parallel read **23 s** (each layer reads 1-3 files), peak RSS 1.13 GB. Every region has the same rows (row
counts and an md5 over every row, in id order). The same day: `--frame` 5.4 s CPU, 1.05 GB peak (Okemah; ctx stored);
`--assemble --window district` 2.4 s CPU, 0.24 GB; `--window full` 4.5 s CPU, 0.62 GB (tiles and far tiles stored);
the whole town (`--id`, every tile and far tile compiled) 118 s CPU, 0.97 GB.

## The place: descriptor and legacy package (`assemble.py`)

- Stage 1 (gazetteer + grid): domain, anchor (Census INTPTLAT/INTPTLONG; a bbox-only place: its centre), origin
  `(c0, r0)`, `k0`, `gamma0`, the play box in cm, the pinned tile set (play box + 1 km, at most 1024).
- Stage 2 (from the tiles): `yOffset` and `waterLevel` (v0's rule over the play box's tiles), spawns on lanes,
  mission places, the downtown spawn (the strongest ctx centre in the box, else its top-scoring cell), density from the
  tile headers, `tiles [{id, sha256 of the decoded tile}]`, `tileSetHash` (sorted `"{id} {sha256}\n"` lines) and the
  lock v2. Written to `manifests/{buildId}/{placeId}.json`.
- The legacy package: the tiles' posts, masks, buildings, roads (stitched by node id), curb islands (merged back across
  cut edges), trees, places, water and parks in session coordinates, `frame.bearingDeg = gamma0`, terrain cell
  `2 / k0`, mask cell `1 / k0`, the interim water shim. `PKG` carries buildId, grid, domain, origin, k0, gamma0, the
  tile ids and their headers.

## The far field (`far.py`, `cities/pkg/js/pkg-far.js`)

The land past a place's compiled tiles, to the horizon (no sea round a dry town). Far tiles are keyed on the hg1 grid
itself at coarse levels, so in any session frame (session m = grid m / k0) they are an exact uniform grid, and they are
self-contained and shared by neighbouring places:

| tier | level | tile | posts | step | heights | reach past the core |
|---|---|---|---|---|---|---|
| a | L1 | 1024 grid m | 65 x 65 | 16 m | the core's own post function on land (`compile.py posts_cm`: 3DEP 1/3" bilinear at the 5 x 5 posts round it, the sigma-1-post blur, cm), so at the core's edge far = core | 1 km (a ring: tiles wholly inside the core are not listed) |
| b | L3 | 4096 grid m | 65 x 65 | 64 m | 3DEP 1" (`dem.Sampler(product='1')`, same snapshot), mean of 2 x 2 point samples per post | 10 km |
| c | L5 | 16384 grid m | 65 x 65 | 256 m | 3DEP 1", mean of 8 x 8 | 30 km |

A tile's edge posts are its neighbours' (same global post, same computation: byte-identical). Classes per post: water
where the 3 x 3 block of DEM pixels nearest it (1/3" for A, 1" for B and C) is exactly flat (3DEP is hydro-flattened;
no land is flat to 1 mm over ~30-90 m), else the post's climate (`climate.py`, per post): 2 arid, 3 dry (steppe), 0 land (humid). Store key
`far/{buildId}/hg1-{d}/{L}/{C}/{R}`, `--far hg1-{d}/{1|3|5}/{C}/{R} --out -` for one; the legacy package carries them as
`data/far/{a|b|c}-{C}-{R}.bin.gz` (SFB1 `hometown-far`: uint16 heights, NAVD88 = -100 + 0.1 q, q 0 no data; uint8
class), listed in `PKG.far` and `manifest.json` `files` (so a Mog's pinned file hashes cover them). About 110-130
tiles, ~0.8-1 MB a place. The runtime (`pkg-far.js`) draws a zero-byte fill and apron at boot, then the tiles after boot
(off the critical path) as Terrain patches (`surface`: groundAt is the 3DEP height over far water) and meshes; the core
is never changed. Seams: tier A's last 64 m snaps to the core's own edge posts (the core's water flattening and bridges),
`Terrain.edgeBlend` (32 m) takes up the core's 2 m ground between them, and each tier's outer 16 posts blend into the next
coarser tier: heightAt is continuous core -> A -> B -> C. Near the core the far ground takes the core's own edge ground
(park lawns, else the mask class under the block tops) and fades to its own over 300 m (a humid hillside wooded, not rock); water shores are marching squares on the
smoothed wetness. Budget (horizon.md): far draw calls (chunks merged: A by quadrant, B and C 2 x 2 tiles, one water mesh a
tier) about 35 of <= 80; Low graphics / a short draw distance draws every other post (`DATA.pkgFar.stats.budget`:
phone triangles <= 0.6 M). Tests: `test_far.py`, `tests/pkg-far.test.mjs`.

## Building shapes (sf-buildings v4)

Each building record is a function of its own Overture row and Sources queries round its footprint (places inside it
and within 20 m, the land use under it, buildings within 0.5 m, roads within 12 m), never of a whole place, so a tile
stays the same bytes in any compile that holds it (the seam / block / overlap proofs, `.scratch/hg1/proofs.sh`).

- **kind** (`compile.py shape_building`): Overture `class`, then the places inside the footprint (`basic_category`
  `christian_place_of_worship`: church; `jewish_ / muslim_ / buddhist_ / hindu_place_of_worship`, `place_of_worship`:
  civic, no religious detail; `elementary_ / middle_ / high_school`, `preschool`: school; `gas_station`,
  `fueling_station` within 20 m: a `roof` / `carport` / `shelter` footprint or one with `min_height` >= 3.5 m is a
  canopy; store / restaurant / cafe / bar / salon / bank ... names: shop), the land use (retail / commercial with a road
  front: shop; industrial: warehouse), then size, height and `row` (1 + the buildings within 0.5 m).
  **mall** (0.8.2, fid2-mall; checked after tower, before warehouse): a building of 1,500 m2 or more under 18 m, not of
  an industrial / warehouse class (`WAREHOUSE`), a residential, hotel, office or parking class (`MALL_NOT`) nor on
  industrial land (subtype or class), with any of: a `shopping_mall` / `shopping_center` / `outlet_mall` /
  `department_store` place inside it, a retail / supermarket / shop class (`MALL_CLASSES`), 3 or more shop places inside
  it (`SHOP_WORDS`), retail land use under it; or one shop place inside it and either the `commercial` class (offices
  and storage have it too) or commercial land use with Overture car parks (less its own footprint) of 800 m2 and a
  quarter of its area within 12 m.
  It gets `shops` = 1 and a paved lot round it; the engine (`cities/sf/js/buildings.js`, `cities/pkg/js/pkg-buildings.js`)
  draws it as a storefront storey on every open wall with a plain stucco band over it, cream and white (beige outside
  the stucco regions), a colonnade along each wall 8 m or longer (canopy on square columns, planters, pilasters) and a
  tall parapet. Before 0.8.2 such a building was a warehouse (over 1,500 m2 and under 12 m) or a shop.
- **masses**: `rects.py`, a port of Slop San Francisco's `tools/rect-cover.mjs` (MIT): rectangles over the footprint
  in its turn, written for coverage >= 0.9 (houses, garages and churches always, their roofs are laid over them).
- **roofs**: Overture `roof_shape` / `roof_height` where present (`roofShape`; `roof` = eave, `peak` = ridge), else the
  engine picks by kind and the region table (`cities/pkg/js/pkg-buildings.js`); houses get the eave at height - roof.
- **parts**: a building whose `building_part`s cover 90% of it is written as its parts (own heights, `minH` =
  `min_height`), in the parent's tile; towers without parts get an estimated podium setback on broad plans and a
  penthouse crown on half of them.
- **front / frontDist**: the direction and distance to the nearest roadway edge within 12 m (porches, awnings).
- **region**: the tile's centre by coarse US regions (`region_of`), in the tile header and the package's buildings header.
  Florida and Puerto Rico / the Virgin Islands in the warm band are `south-florida` (white, cream and pastel stucco and
  concrete, no brick, flat roofs behind 0.95 m parapets or low barrel-tile hips; condo and hotel blocks of 20 m and more
  get balcony slabs on every storey over pale balcony glass or painted concrete: `pkg-buildings.js`, `buildings.js`).
- **climate** / **climateZone** (tile header, `PKG`): `climate` is the ground zone (`climate.zone`: humid / dry / arid,
  as before; the ground and the far field read it); `climateZone` is `climate.zone_name`: the warm band's `tropical` /
  `subtropical` (`climate.warmth`: \|lat\| < 23.5, the Florida peninsula south of 27.0 N, then subtropical to 29.2 N
  and the south Texas coast and Rio Grande valley south of 28.0 N between -99.6 and -96.8), else the ground zone.
- Elevated footprints (`min_height` >= 3 m) are not dropped by the in-the-roadway rule.
- **Site roads (0.8.1, `World.footprint` / `site_cut` / `site_run`):** a footprint more than 35% in the roadway is
  dropped, but round a building of 150 m2 or more that is not a roof or carport a site's own road (`soft`: class
  service, any subclass or none, or private access) that runs into it does not count (Bal Harbour's 24,000 m2 mall
  outline stood over its service passage). `site_run` says how a soft piece runs into a footprint (shrunk 1 m): half
  its length or more inside, it is no road (dropped from every product: links, roadway, islands, junction controls,
  the frame's lanes); in from an end, it is cut back to 1 m + half its width off the footprint, its new end a dead-end
  node `x:{segment}:{piece}:a|b` (control 0, never a border); through the middle (or a bridge, tunnel, level or link
  piece), it is kept whole and counts against the building unless that has 1,000 m2 (a passage under a mall or a
  garage; a house with a drive through it is dropped, as before). Site roads beside a building count as every road
  does (an alley garage half in the alley is still dropped), so a building that takes a road off the map always keeps
  its own place. Bridges, decks, tunnels, grade groups and this test read the data's own pieces (`raw_pieces`), never
  the cut ones (no cycle, tiles stay pure). Public streets are never touched; smaller buildings, roofs and carports
  keep the old rule.

Step 0 (Overture 2026-10-21.0, the fetched regions): `roof_shape` on 0 of 3,186 Okemah buildings, 225 of 182,368
round Phoenix, 538 of 272,900 round Pittsburgh; `roof_height` and facade / roof colours on none (they are not fetched;
`wall`, `wallRGB`, `roofRGB` stay 0 until they are); `building_part` 0 / 205 / 144 rows (on 0 / 91 / 63 buildings);
`min_height` > 0 on 0 / 4 / 0 buildings. So the look rests on the rules and the region tables. (0.13.0 fetches the colours, materials and the parts' roofs:
see Stage 0 below.)

## Stage 0: the OSM tags already downloaded (0.13.0, release r13)

What OSM maps and Overture carries, read where it is tagged; where it is not, the look is 0.12.0's.

- **Extras files** (`fetch.py EXTRAS_SPECS`): beside the segment extras, every region now holds
  `overture-buildings-building-extras.parquet` (`roof_direction, roof_orientation, roof_color, roof_material,
  facade_color, facade_material, min_floor`) and `overture-buildings-building_part-extras.parquet` (the same and the
  part's own `roof_shape, roof_height`), semi-joined to the region's own ids. A region without them is refused
  (`sources.BUILDING_EXTRAS`) with `fetch.py --regions`, which tops up only the missing files (one small read per
  layer; never a refetch of the building layer, whose cached files would silently lack widened columns).
- **Looks** (`looks.py`): `facade_material` -> `wall` (a `WALLS` index: plaster/stucco/render -> stucco, cement_block ->
  concrete, wood, brick, stone, metal, glass ...) and, on towers and midrises (parts of 18 m and more), `facade` (the
  curtain-wall choice: glass, metal, concrete, stone, brick -> terracotta); `facade_color` -> `wallRGB`, `roof_color`
  -> `roofRGB`, else `roof_material` picks the roof colour (slate, roof tiles, copper, metal, concrete, tar ...).
  Colours are clamped in HLS (lightness 0.18 to 0.90, saturation at most 0.55 walls / 0.60 roofs: no pure black, white
  or neon block), integers under 2^24 (exact in the engine's float32 table); 0 = none (the engine's region palette),
  so a colour that would be 0 is written 0x010101. A part's own values win over its building's. The engine already
  read these fields (`pkg-buildings.js styleFor`); 0.12.0 wrote them as 0.
- **Part roofs** (`compile.part_roof`): a part tagged gabled / hipped / pyramidal / dome / round / mansard ... gets
  `roofShape` and its rise: `roof_height` (at most 60% of the part) or 0.38 of its short half-span (0.75 to 9 m);
  `roof` is its eave, `peak` its top (Overture's height is the top; a height from the floors has the roof put on it).
  The engine draws `dome` as a low-poly dome (8 x 3 facets to the apex, 40 triangles, on a flat roof a shade darker
  than the roof's colour) and `round` as a barrel vault; both were hipped / gabled before.
- **Junction control** (`World.junction_data`): an OSM `traffic_signals` node within 15 m of a junction of 3 or more
  drive approaches and within 3 m of one of them signals it (control 1); else `stop` / `give_way` nodes within 25 m
  on an approach (nearer this end of the piece than its other) mark those approaches: all of them an all-way stop
  (2), some a minor stop (3), each link's `stopA` / `stopB` from its own approach. Where no node is mapped there, the
  rank heuristic stands. Pure per connector (a Sources query round it). The engine reads `control` / `stopMask` as
  before; its crosswalks follow the control.
- **Street props** (new HTL1 section `props`, i32 `[u, v, kind, 0]`): OSM `street_lamp` (1), `fire_hydrant` (2),
  `bench` (3) nodes off the footprints, and `crossing` nodes on a drive piece (2 m) more than 12 m from its ends
  (5: a mid-block crosswalk); owned by the tile their cm point is in, at most 600 a tile. `assemble.py` writes them to
  `GEO.streetProps` `[x, z, kind, ...]` (an older assembler or engine ignores both). The engine
  (`sf-street-details.js`) stands the lamps and hydrants on the sidewalk (its drawn lamps keep 20 m off a mapped one;
  a junction with a mapped hydrant within 35 m has that one instead of its own), benches as one instanced mesh (36
  triangles each, breakable: they fly as New York's plaza benches do), and `road-paint.js` paints a zebra across the
  road at each crossing clear of the junctions' markings, its lane and centre lines cut 0.5 m either side of it.
  (The engine also sets every stop bar 1 m behind its crosswalk.)
- **Data trees**: OSM `natural=tree` nodes and `tree_row` ways (one every 8 m) in the trees section, off buildings,
  decks, the roadway, lots and water, the climate's species by hash, at most 500 a tile; no lattice tree within 6 m of
  one. Same section and format. On phones the engine brings the town's tree levels nearer (`trees.js TIER_LOD`: the
  Low graphics, `?gfx=phone`, full detail within 52 m and coarse within 210 m; Medium 0.75 of High's), so the extra
  trees cost a phone 4 to 9% more triangles at street level instead of High's 45 to 62%.
- `building:levels` was already read (`num_floors`: the height where `height` is missing), and so was `roof_shape` on
  whole buildings. Not read yet: `roof_direction` / `roof_orientation` (fetched; 3% of NYC's parts), `min_floor`.

**Releasing it (r13).** Stored worlds pin their buildId: 0.12.0's tiles, frames and bundles stay in the store and are
served as before, and the new engine plays them (every new field is optional: no `streetProps`, 0 colours, no part
roof shape is 0.12.0's look). Order: (1) the engine files (`cities/sf/js/sf-street-details.js`, `road-paint.js`,
`trees.js`, `cities/pkg/js/pkg-buildings.js`, `index.html` stamps `20261115-r13`) to `mogcity` first; (2) this compiler to
`hometown-compiler`; (3) GameMog's `deploy/town-builder/workflow-build.sh` MOGCITY_SHA re-pinned to it. No new env var
or secret. The builder's cached regions are refused once each and top up their two building extras files (one small
S3 read per layer); every town then rebuilds cold under the new buildId on its first visit, which counts against
`HOMETOWN_DAILY_COLD` (raise it for a day, or pre-warm the top towns). Credits are unchanged (OSM ODbL via Overture).

Coverage (the fetched regions, inside a district): Okemah has no building tags and almost no street furniture (a few
stop nodes); Pittsburgh's downtown and Phoenix gain hundreds of signals, stop signs, benches and thousands of trees,
few colours; New York's midtown parts carry roof shapes on 88%, facade colours on 82% and roof materials on 84%.

## 0.13.2: the ties keep every crossing (0.13.1's review)

0.13.1's ties lifted decks into the decks crossing over them and brought decks down onto the ones under them
(Pittsburgh: Crosstown Blvd 9.5 -> 2.8 m under Bigelow Blvd; Long Beach: W Ocean Blvd's bridge 1.8-6.3 m short over the
deck under it). Fixed in `grade.solve` and `building_height`:

- **Every deck crossing keeps the side the untied solve put it on** (`grade.links`: the cluster's `under` both ways, and
  `Piece.over`, a deck of another cluster crossing over it, read as its base profile). In the tied solves a deck that
  stood under another rises (by its ties, or by the free nodes its twin's ties lifted) no higher than that deck's
  untied height less its clearance and the vertical curve's rise (a tent at G off the crossing, never under its own
  untied height); one that stood over another is never brought down under that deck's untied height plus its clearance
  (or its own untied height, if that was lower).
- **No tie where the twins cross a deck on different levels** (one over it, the other under): not within `TIE_SPLIT`
  (150 m) of it; the twins part there, each on its own clearances.
- **A tie never moves a deck end** out over its fill (`reach`: the clearances alone do). Moved for its tie, Crosstown
  Blvd's deck ran out over the fill where Bigelow Blvd crosses it.
- **The third solve's node cap keeps the free chain's clearances**: a free node brought down beside its twin stays as
  high as the free nodes beyond it need to climb to their clearances at RELAX.
- **The crest rounding's climb cap holds the ties only**: a clearance is raised by its shortfall as in 0.13.0 (0.13.1
  capped it too, and left Pittsburgh's ramps at (444, 631) and (-1355, 919) 2.7 m lower under the decks over them).
- **A MultiPolygon's other polygons stand at their own height** (`building_height`): the row's floors, else the default
  for the polygon's own area, never taller than the row; the row's height is its tallest part's (the Long Beach
  Convention Center's 50.1 m arena), and its exhibit halls stood as 50 m slabs.

| full build | 0.13.0 | 0.13.1 | 0.13.2 |
|---|---|---|---|
| Pittsburgh `grade.unmet` | 201 | 209 | 173 |
| Long Beach `grade.unmet` | 134 | 139 | 123 |
| Crosstown Blvd under Bigelow Blvd (-1149, 29) | 9.5 m | 2.8 m | 9.5 m |
| ramp under Penn-Lincoln Pkwy N (-2660, 832) | 6.6 m | 3.8 m | 6.6 m |
| ramps at (444, 631) / (-1355, 919) | 2.2 / 3.7 m | 0.5 / 2.2 m | 2.5 / 4.0 m |
| W Ocean Blvd bridge `bafc56c5` over the deck under it | met | 1.8-6.3 m short | met |
| Seaside Freeway twins over the harbour (x -5600..-4400), widest gap | 34.1 m | 0.3 m | 0.3 m |
| Convention Center exhibit halls (10,078 / 5,496 m2 drawn) | (not drawn) | 56.5 / 57.5 m | 15.4 / 16.5 m |

(Pittsburgh's two new unmet constraints are counted, not made: ramps `52b01767` (6.3 m short) and `c29a7610` (0.6 m)
are as short under 0.13.0's solver, their 7-piece cluster now reaching a compiled tile through a twin.)

## 0.13.1: twin carriageways, multipolygon buildings (Cold Harbor, Long Beach)

The bugs the owner met in Long Beach (pinned to `htc-0.12.0-hg1-b0d9f54c8`), fixed for every town:

- **A divided road's two carriageways share one grade.** Two one-way pieces are the two directions of one road
  (`World.paired`) when both found another carriageway (`pair()`), they share a name (unnamed: a class), both are
  mainline or both links, and one runs abeam of the other, travelling the other way within ~25 degrees, 3-45 m off,
  at 3 or more grade stations (`abeam`). Paired pieces are in each other's `deck_near` (one grade cluster) and each
  station abeam is a tie (`grade.Piece.ties`). `grade.solve` then solves the cluster three times: untied; tied UP
  (each deck at least at its twin's untied height, so both stand at the higher of the two, never lowered under a road
  or water the other must clear); and tied DOWN where one twin is held down by an anchor (an at-grade junction where
  it lands): the other is capped at the landed one's height + 5 cm abeam, the cap spreading at RELAX along it and to
  its free end nodes, never under a clearance tent and never steeper than RELAX off its own ends. The stats count
  `ties` and the widest gap left (`tieGap`). Long Beach's grade cluster of Seaside Freeway / W Ocean Blvd (35 pieces,
  1,467 tie stations): abeam gaps over 5 m 1,057 -> 151, the widest 39.2 -> 11.8 m (where both data carriageways end on
  different anchors), mean 23.8 -> 1.2 m; the twin decks over the harbour channel 0-0.1 m apart (were 35-38 m).
- **No crest ratchet.** The box filter rounds a crest down, so each constraint is raised by its shortfall and profiled
  again (4 rounds); a shortfall the RELAX cap made (an anchor too near) was raised too, and each round spread its tent
  higher (a tied carriageway stood 29 m over its twin). A constraint is now raised no further than the cap at its
  station plus the filter's reach (RELAX x VC / 2). Long Beach's steepest deck grade 0.28 -> 0.25, constraints met the
  same.
- **A MultiPolygon building is all of its polygons.** Overture gives some buildings as a MultiPolygon; the compiler
  drew only the largest. Each other polygon of `MULTI_MIN` (100 m2) and `MULTI_FRAC` (5%) of the largest or more is a
  row of its own (`building_rows`: id `{id}~{k}`, owned by the tile of its own centroid, the row's height, names and
  tags), each with the parts standing mostly on it (`parts_for`). The Long Beach Convention & Entertainment Center was
  its 11,964 m2 arena alone; its 11,350 and 5,591 m2 exhibit halls are back (its 280 m2 stair cores stay out).
- **A road at grade in a tunnel under a building trims it, never drops it.** The tunnel-cover rule (a building with less
  than `TUNNEL_COVER` of ground over a tunnel's road is in a portal's cut: dropped) also dropped a building standing ON
  a cut-and-cover passage at grade: E Seaside Way runs under the Convention Center's 11,350 m2 hall at 2.4-2.6 m, the
  hall's base 2.41 m. A tunnel road within `AT_GRADE_TUNNEL` (1.5 m) of the ground over it now trims the footprint like
  a road on the ground (`brec`), and the rule counts only a footprint lying 1 m2 or more over a tunnel's road.
- **Pico Avenue is a bridge in the data.** OSM way 172876528 (Overture `66d45bf9`, from way 13400335) is
  `bridge=yes layer=1` over the Pier B rail yard (Pier F and Pier J leads) and the I-710 southbound ramp (way
  159431149, layer 0), and the 3DEP bare earth shows its approach fills (10.1 and 7.8 m either side of a 4.7-6 m yard),
  so the compiler builds it as a deck, as it should. Pico's underpass is under W Ocean Blvd / the Seaside Freeway
  (z 580 m in the town's frame), where Pico runs at grade under both carriageways' decks.

## Decks and lanes (grade-lanes)

**Decks** (`grade.py`, the solver; `compile.py` World.deck_iv / deck_profile). A piece's deck interval is its Overture
`is_bridge` stretch, unless it is a *culvert* (under `CULVERT_MAX` 25 m, no drivable road crossing it, no water within
w/2 + 10 m: the old terrain raise, `bridges()`), plus a level > 0 stretch over an unconnected lower road that the data
forgot to tag (`bridgeTagMissing`, ±`PROMOTE_PAD` m round the crossing). A level without `is_bridge` is not a deck: an
embankment, already in 3DEP.

- **Grade group** (`World.deck_group`): the deck pieces joined through *free* nodes (every drivable piece there is on
  its deck at that node) and to the deck pieces they interact with (one crossing it, or one of another level within
  max(w, w') / 2 + 15 m: a stacked deck), all of one *home cell* (the L4 block of a piece's first point; when that group
  is wider than `CLUSTER_CAP` 6 km, the L3 cell: `clusterSplit`). Every relation is symmetric, so the group is the same
  set whichever piece a tile starts from, and its rows are loaded wherever it reaches (`World.ensure`, a region not
  fetched refuses the tile): a tile's deck heights never depend on the place, the window or the compile order. A node
  with an at-grade road, a dead end, a deck interval's end inside a piece, or a piece of another home cell is an
  *anchor* at the terrain's height (the final post function: the heights the engine reads). A deck of another group
  under this one is read solved in full when that group ranks lower (home cells in order), else as its base profile
  (solved with no other group), so no two groups wait on each other.
- **Tunnels:** a tunnel's portals split the road (node `p:{segment}:{at}`; both of them, 0.8.1); a piece inside it is a
  tunnel link (flag 2), kept so the road through it connects (Fort Pitt's bridge runs into its tunnel), with `elev` the
  straight line between the ground at its tunnel's two portals (pure per segment; the engine bores it where the hill
  stands 3 m over it). Its interior (30 m in from a portal) is not roadway: the ground over it keeps its blocks and
  buildings. A portal within `PORTAL_SNAP` (30 m) of a connector is at the connector, with a bridge that starts or ends
  there and the roadway it had (no link that short at a portal: the engine folds a link under 8 m into its junction and
  loses a short one off a fork from its traffic network; Fort Pitt's deck now starts where its tunnel ends, at one
  height). A tunnel that leaves another underground (a portal at a connector inside another tunnel's span) starts at
  that tunnel's road, not on the hill over it.
- **demSource:** the DEM files a tile's own outputs were computed from (`dem.Sampler.record`: its posts, its decks'
  groups, culverts; a cached value carries its files), the same whatever was compiled before it in the session.
- **Constraints:** a road under it (no shared connector) +6.5 m, rail +8.4 m, water (wet posts: the DEM's flattened
  water surface) +6 m, +3 m over a wet run of 20 m or less; +0.3 m margin each. Two decks crossing: the higher level goes
  over, on equal levels the lower segment id (its profile is solved first, its own cluster).
- **Profile:** free nodes by arc-weighted harmonic interpolation between the anchors (on a chain: the chord), at least
  each constraint's tent (4 % mainlines, 6 % links and streets) and the ground + 0.3; along each piece the max of chord,
  tents and ground + 0.3, held to 10 % off each end (`gradeRelaxed` counts the clamps), rounded by a box filter as long
  as a vertical curve (40 m mainline, 20 m link). No sag below the chord, no dip into a ravine, a river bridge between
  high banks stays at the chord. `python tools/hometown/test_grade.py` (13 cases).
- **Tile output:** each road link (tile sub-piece) of a deck piece gets `elev: [step_cm, y_cm...]` (every 5 m of its
  own arc from its start and at its end, int cm NAVD88) and flag 128 (`deck`) when its range meets the deck interval.
  The deck's interior (10 m in from each abutment) leaves the roadway and the sidewalk bands, so the ground under it is
  ground (curb islands, lawn), the buildings-on-roads rule ignores it, a building whose roof reaches the deck's
  underside (y − 1.4) − 0.5 m is dropped (`underDeckDropped`), no tree under it.
- **Junctions:** no signal or stop where only motorways, trunks and links meet, or on a deck.
- **Package (assemble.py):** links gain [10] lanes forwards, [11] lanes backwards, [12] the deck profile
  `[step, y0, y1, ...]` in session metres (step = 5 / k0) or null, [13] the speed limit in mph (−1 unknown). Spawns and
  mission places never land on a deck. Stats: `deckLinks`, `deckMetres`, `grade` (clusters, constraints, unmet,
  gradeRelaxed, p95 grades, bridgeTagMissing).
- **Engine** (cities/sf/js, inert without field [12]): `road-network.js` deckOf / boreY (the whole link's profile,
  blended over the last 8 m to the engine's terrain at an anchored end), lanesOf from [10]/[11];
  `grade-separation.js` builds the deck (slab, parapets open 14 m before a merge, columns every 30 m off the streets
  under it, piers into water), floor discs at every deck node, a 16 m floor grid whose `find()` returns the nearest
  floor below (stacked decks), `roofAt` under a deck, `onDeckAt`; `controllers.js` getGroundHeight(x, z, mode, y) (an
  entity's own height; no curb on a deck), groundAt; `traffic.js` the player is on the road at their own level, cars
  ignore a player one level away; the pursuit's cars and thrusters ride at their own height.

**Lanes** (World.lanes, per segment): (1) the OSM tags through `sources[].record_id` (way id) and the national side
table `osm_roads.py` builds from Geofabrik's US extract (`lanes`, `lanes:forward/backward`, `turn:lanes`, `width`,
`maxspeed`; main classes and their links), (2) `width_rules` (one-way n = ⌊(w − 1)/3.3⌋, two-way per side
⌊(w/2 − 0.5)/3.3⌋), (3) class defaults per direction (urban: 340+ buildings within 300 m): motorway 3 / 2, link 1
(2 if 7 m wide), trunk 2, primary 2 per side (3 one-way urban), secondary 2 per side at 40 mph+ urban, else 1. The
width follows the lanes (3.4 m each + 1 m; motorway carriageway + 4.2 m shoulders; link + 2.2 m; a centre turn lane
+3.4 m), streets keep their class width where wider; no halving. One-ways: heading denials for motor vehicles (or no
mode), per piece where the rule has `between`. Segments' way ids and speed limits come from
`overture-transportation-segment-extras.parquet` per region, which `fetch.py --regions` fetches with the region since
0.8.1 (`--extras <regions>` adds it to a region fetched before). A region without it counts as not fetched: the
compiler refuses its tiles with the `fetch.py --regions` command (`prewarm.py` runs it and retries), because a town
built without it silently fell back to the class defaults (production Bal Harbour, FL, 0.8.0: Collins Ave one lane
and 9 m a carriageway instead of OSM's three and 11.2 m). The side table: `--osm-roads <parquet>` or `<data>/osm/osm-roads-us.parquet`; its sha256 is in the
build record (a new table, a new buildId).

**Sides** (0.8.1, fid-roads; World.pair / World.sides, per segment, left / right of the segment's own direction, which
is the OSM way's): a one-way carriageway's **pair** is the other half of a divided road: a one-way road of the same name
(both unnamed: the same main class) running the other way, parallel within ~25 degrees, 3-45 m off the centreline and
abeam of its middle (else a quarter or three quarters along). **Sidewalks** from the side table's `sidewalk`,
`sidewalk:left/right/both` (`separate` counts as one: the tiles draw no footways; a class with none by default gets
2 m), else a paired carriageway has its class sidewalk on its outer side only, else both sides as before. **Bike lanes**
from `cycleway`, `cycleway:left/right/both` (0 none, 1 shared lane, 2 lane, 3 track; a one-way's plain tag on the right
of travel). A paired carriageway with OSM lanes is as wide as its lanes (3.4 m each + 1 m, no class floor). The tiles'
links carry `swl`, `swr`, `cyl`, `cyr`; the sidewalk bands follow each side (`side_band`: the round-capped buffer when
both sides match, as before, else the bare side cut off flat); a narrow curb island inside a pair's median (each
carriageway's inner side, half way to the other) is open ground (lawn in a humid place) instead of paving. The package's
links: [8] / [9] the sidewalk left / right (they were the one class width twice), [14] / [15] the bike lanes. The engine
(`cities/sf/js/road-paint.js`, packages only) paints solid edge lines along a road with two or more lanes one way:
white on the right of the travel, yellow on the left of a one-way roadway, beside the outer lanes.

Building the side table (offline, the dev Mac, once per Overture release; never on Render):

```bash
mkdir -p <dl> && curl -L -o <dl>/us-YYMMDD.osm.pbf https://download.geofabrik.de/north-america/us-YYMMDD.osm.pbf   # ~12 GB
# (check it against Geofabrik's .md5; pyosmium + pyarrow in their own venv; -I: never import from the download's dir)
python -I tools/hometown/osm_roads.py <dl>/us-YYMMDD.osm.pbf <data>/osm/osm-roads-us.parquet
python tools/hometown/fetch.py --extras "conus:C,R;C,R..."      # the regions' way ids + speed limits
```

First build (13 Nov 2026): `us-261112.osm.pbf` (12,264,531,947 B, md5 11b2a6f5dcfe611cbba52cafe354edf1), 52.2 M highway
ways read, 3,670,803 kept, 17.1 MB, sha256 `555ea001a758b77b...`, 36 min on a loaded 10-core Mac. Second build
(14 Nov 2026, 0.8.1, the same extract, + the sidewalk and cycleway tags): 3,727,594 kept (every earlier row's lane
columns unchanged; 56,791 more ways that carry only the new tags), 19.4 MB, sha256 `369b9debd00efaef...`, 20 min.
ODbL 1.0 (© OpenStreetMap contributors), a derived database: keep `osm_roads.py` public with the compiler.

That build is committed beside the compiler: `tools/hometown/osm/osm-roads-us.parquet` (+ `.json`, its record; ODbL
notice in `tools/hometown/osm/NOTICE.md`), so a checkout of this repository at a pinned commit carries the exact bytes
the production town builder needs. The compiler reads `<data>/osm/osm-roads-us.parquet` when there is one, else
this copy (`--osm-roads` / `HOMETOWN_OSM_ROADS` override both); the build record pins it by sha256 either way.

## Rules that are estimates, not data

Road widths, lanes and sidewalks by class; building type by Overture class, footprint area, height and the downtown
field; a house at least 3.4 m; signals and stops; the street density; paved aprons round non-house buildings; the warm
band's bounds, its planting shares and spacings, and the south-florida look (no data says which street has palms or a
hedge: Overture's fetched layers carry no tree points). No brand
names: a business is called by what it is and its street; public institutions keep their own names.

Licences and credits: © OpenStreetMap contributors (ODbL 1.0) via Overture Maps Foundation (CDLA Permissive 2.0 /
ODbL by theme), USGS 3DEP (public domain); every package's `manifest.json` and `geodata.js` carry them.
