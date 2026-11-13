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
python tools/hometown/compile.py --dem-snapshot                            # pin the DEM (once per build)
```

The 3DEP heights are read lazily from the USGS cloud-optimized GeoTIFFs (HTTP range reads of 512 px internal tiles).

**The DEM snapshot pin.** USGS serves each file at a mutable `.../TIFF/current/` URL, so a build pins the DEM with a
snapshot: `python tools/hometown/compile.py --dem-snapshot` lists the bucket once (S3 ListObjectsV2, ~10 s: every 1/3"
and 1" `.tif` with its ETag) and stores it content-addressed at `dem/snapshots/dem-{16 hex}.json` in the store, with
`dem/current.json` pointing at it (`HOMETOWN_DEM_SNAPSHOT=<id>` names another). The build record's `demSnapshot.id` is that
id, so the buildId changes exactly when the DEM it reads does; a compile with no snapshot in its store refuses to start.
Every read of a file (its IFD header and each internal tile) is a range read with `If-Match: "<snapshot ETag>"`: a file
USGS replaced since answers 412 and the compile fails (`DemChanged`) rather than mixing bytes of two versions. The bytes
are mirrored in the store at `dem/{13|1}/{nXXwYYY}/{etag}/` (`meta.json`, `{k}.bin`, written ifAbsent), so every worker
sharing the store reads the same bytes and `/current/` is read once per internal tile; the old local mirror
`<data>/dem/` seeds it when its ETag matches. A file the snapshot does not list has no data (a tile with none is refused,
naming it). `--dem-snapshot-from-mirror` makes an offline, partial snapshot of the local mirror's files.
`tools/hometown/test_dem_pin.py` tests all of this offline.

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

## The far field (`far.py`, `cities/pkg/js/pkg-far.js`)

The land past a place's compiled tiles, to the horizon (no sea round a dry town). Far tiles are keyed on the hg1 grid
itself at coarse levels, so in any session frame (session m = grid m / k0) they are an exact uniform grid, and they are
self-contained and shared by neighbouring places:

| tier | level | tile | posts | step | heights | reach past the core |
|---|---|---|---|---|---|---|
| b | L3 | 4096 grid m | 65 x 65 | 64 m | 3DEP 1" (`dem.Sampler(product='1')`, same snapshot), mean of 2 x 2 point samples per post | 10 km |
| c | L5 | 16384 grid m | 65 x 65 | 256 m | 3DEP 1", mean of 8 x 8 | 30 km |

A tile's edge posts are its neighbours' (same global post, same computation: byte-identical). Classes per post: water
where the 3 x 3 block of 1" pixels nearest it is exactly flat (3DEP is hydro-flattened; no land is flat to 1 mm over
~90 m), arid land by the compiler's desert rule (lon < -104, lat < 37.5, per post), else land. Store key
`far/{buildId}/hg1-{d}/{L}/{C}/{R}`, `--far hg1-{d}/{3|5}/{C}/{R} --out -` for one; the legacy package carries them as
`data/far/{b|c}-{C}-{R}.bin.gz` (SFB1 `hometown-far`: uint16 heights, NAVD88 = -100 + 0.1 q, q 0 no data; uint8
class), listed in `PKG.far` and `manifest.json` `files` (so a Mog's pinned file hashes cover them). About 80 tiles,
~0.5 MB a place. The runtime (`pkg-far.js`) draws a zero-byte fill and apron at boot, then the tiles after boot (off
the critical path) as Terrain patches (`surface`: groundAt is the 3DEP height over far water) and meshes; the core is
never changed. Tests: `test_far.py`, `tests/pkg-far.test.mjs`.

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
- **masses**: `rects.py`, a port of Slop San Francisco's `tools/rect-cover.mjs` (MIT): rectangles over the footprint
  in its turn, written for coverage >= 0.9 (houses, garages and churches always, their roofs are laid over them).
- **roofs**: Overture `roof_shape` / `roof_height` where present (`roofShape`; `roof` = eave, `peak` = ridge), else the
  engine picks by kind and the region table (`cities/pkg/js/pkg-buildings.js`); houses get the eave at height - roof.
- **parts**: a building whose `building_part`s cover 90% of it is written as its parts (own heights, `minH` =
  `min_height`), in the parent's tile; towers without parts get an estimated podium setback on broad plans and a
  penthouse crown on half of them.
- **front / frontDist**: the direction and distance to the nearest roadway edge within 12 m (porches, awnings).
- **region**: the tile's centre by coarse US regions (`region_of`), in the tile header and the package's buildings header.
- Elevated footprints (`min_height` >= 3 m) are not dropped by the in-the-roadway rule.

Step 0 (Overture 2026-10-21.0, the fetched regions): `roof_shape` on 0 of 3,186 Okemah buildings, 225 of 182,368
round Phoenix, 538 of 272,900 round Pittsburgh; `roof_height` and facade / roof colours on none (they are not fetched;
`wall`, `wallRGB`, `roofRGB` stay 0 until they are); `building_part` 0 / 205 / 144 rows (on 0 / 91 / 63 buildings);
`min_height` > 0 on 0 / 4 / 0 buildings. So the look rests on the rules and the region tables.

## Rules that are estimates, not data

Road widths, lanes and sidewalks by class; building type by Overture class, footprint area, height and the downtown
field; a house at least 3.4 m; signals and stops; the street density; paved aprons round non-house buildings. No brand
names: a business is called by what it is and its street; public institutions keep their own names.

Licences and credits: © OpenStreetMap contributors (ODbL 1.0) via Overture Maps Foundation (CDLA Permissive 2.0 /
ODbL by theme), USGS 3DEP (public domain); every package's `manifest.json` and `geodata.js` carry them.
