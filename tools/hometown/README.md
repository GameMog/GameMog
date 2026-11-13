# Hometown compiler 0.3.0 (the national grid hg1)

Turns open US map data into **tiles on one national grid**. A tile is compiled from its own sources and context alone,
so any tile can be compiled on first request, neighbouring towns share identical tiles, and a place is just a list of
tiles plus a session frame. The legacy assembler still lays a place out as one package for Mog City's San Francisco
engine base: `?city=pkg&pkg=<id>`.

## Run it

Python 3.11+ with `duckdb` (its `httpfs` and `spatial` extensions install on first use), `numpy`, `shapely` 2,
`pillow`. No account, no API key. Raw data and the store live under `.scratch/` (git-ignored).

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
python tools/hometown/compile.py --print-build                             # the buildId and its record
```

The 3DEP heights are read lazily from the USGS cloud-optimized GeoTIFFs (HTTP range reads of 512 px internal tiles) and
mirrored by ETag under `<data>/dem/`; after the first read everything is offline.

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
| curb islands | land minus roadways over tile + 128 m, each island classified before the clip (median: < 120 m2 or < 6 m wide; cut by the window: < 6 m wide), clipped to the tile, clipped edges flagged `cut` |
| buildings | owned by the tile holding the exact centroid of the full footprint (integer shoelace), outline kept whole (may overhang), base and rise from the post function over the footprint; `foreign` lists the owners of buildings overlapping the tile |
| paved lots, trees | footprints within 25 m (buffer 8 / 12 m downtown); a 13 m tree lattice in global grid integers, `hash01(i, j, k ^ domain)`; `desert` from the tile centre |
| mask | 512 x 512 1 m cells: asphalt, sidewalk, lawn, sand, rock, waterEdge, **water (6)** |
| places, water, parks | POIs owned by the tile; water and park polygons clipped, each water with its ctx `level_cm` |

**Context blocks** (`context.py`, L4): `bcnt` / `pcnt` (buildings / places per 64 m cell) and `wlev` (each water
polygon's median DEM height inside it, per block). They replace v0's whole-place inputs: the dense height blend
(buildings within 1 km of a building, `smoothstep(800, 1600)` per km2), the downtown field (POI scores within 250 m,
centres by non-max suppression within 2 km, downtown = within 350 m of a centre) and the per-polygon water levels.
A tile reads the ctx blocks within 3.2 km and the regions within 3.2 km (a tile whose regions are not fetched is refused
with the fetch command to run).

**buildId** `htc-0.3.0-hg1-b{8 hex}`: the first 8 hex of the sha256 of the build record (`builds/{buildId}.json`:
compiler version, libraries incl. GEOS and zlib, image digest, Overture release, DEM snapshot, grid). Compiler logic
changes bump `COMPILER_VERSION`; library, image or source changes change only `b`.

## Containers (gzip, mtime 0, sorted JSON)

- **HTL1** tile: `HTL1`, u32 header length, header JSON (format `hometown-tile` v1, grid, domain, L, c, r, buildId,
  demSource, vdatum, bcount, groundAreaM2, k_tile, waters, foreign, ctx, sections), then sections: `terrain`, `mask`,
  `buildings` (JSON, heights in absolute cm), `bverts` (int32 cm, tile-local), `roads`, `blocks`, `trees`, `places`,
  `water`, `parks`. `wagmi/world/tiles-net.js` decodes it.
- **HTC1** ctx, **HTB1** block stream (per child: u32 id length, id, u32 body length or 0xffffffff + reason).

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

## Decks and lanes (grade-lanes)

**Decks** (`grade.py`, the solver; `compile.py` World.deck_iv / deck_profile). A piece's deck interval is its Overture
`is_bridge` stretch, unless it is a *culvert* (under `CULVERT_MAX` 25 m, no drivable road crossing it, no water within
w/2 + 10 m: the old terrain raise, `bridges()`), plus a level > 0 stretch over an unconnected lower road that the data
forgot to tag (`bridgeTagMissing`, ±`PROMOTE_PAD` m round the crossing). A level without `is_bridge` is not a deck: an
embankment, already in 3DEP.

- **Grade cluster:** the deck pieces joined through *free* nodes (every drivable piece there is on its deck at that
  node). A node with an at-grade road, a dead end, or a deck interval's end inside a piece is an *anchor* at the
  terrain's height (the final post function: the heights the engine reads). Cluster extent cap `CLUSTER_CAP` 3 km
  (`clusterSplit`); one cluster is solved once per World and cached per piece, so every tile that holds a piece writes
  the same heights.
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
`fetch.py --extras <regions>` (`overture-transportation-segment-extras.parquet` per region; used only when every loaded
region has one). The side table: `--osm-roads <parquet>` or `<data>/osm/osm-roads-us.parquet`; its sha256 is in the
build record (a new table, a new buildId).

Building the side table (offline, the dev Mac, once per Overture release; never on Render):

```bash
mkdir -p <dl> && curl -L -o <dl>/us-YYMMDD.osm.pbf https://download.geofabrik.de/north-america/us-YYMMDD.osm.pbf   # ~12 GB
# (check it against Geofabrik's .md5; pyosmium + pyarrow in their own venv; -I: never import from the download's dir)
python -I tools/hometown/osm_roads.py <dl>/us-YYMMDD.osm.pbf <data>/osm/osm-roads-us.parquet
python tools/hometown/fetch.py --extras "conus:C,R;C,R..."      # the regions' way ids + speed limits
```

First build (13 Nov 2026): `us-261112.osm.pbf` (12,264,531,947 B, md5 11b2a6f5dcfe611cbba52cafe354edf1), 52.2 M highway
ways read, 3,670,803 kept, 17.1 MB, sha256 `555ea001a758b77b...`, 36 min on a loaded 10-core Mac. ODbL 1.0
(© OpenStreetMap contributors), a derived database: keep `osm_roads.py` public with the compiler.

## Rules that are estimates, not data

Road widths, lanes and sidewalks by class; building type by Overture class, footprint area, height and the downtown
field; a house at least 3.4 m; signals and stops; the street density; paved aprons round non-house buildings. No brand
names: a business is called by what it is and its street; public institutions keep their own names.

Licences and credits: © OpenStreetMap contributors (ODbL 1.0) via Overture Maps Foundation (CDLA Permissive 2.0 /
ODbL by theme), USGS 3DEP (public domain); every package's `manifest.json` and `geodata.js` carry them.
