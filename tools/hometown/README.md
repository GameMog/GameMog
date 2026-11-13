# Hometown compiler (v0)

Turns open US map data for one place into a **city package** that Mog City's San Francisco engine base plays through
the world contract: `?city=pkg&pkg=<id>`.

## Run it

Python 3.11+ with `duckdb` (with its `httpfs` and `spatial` extensions, installed on first use), `numpy`, `shapely` 2,
`pillow` (`pip install duckdb numpy shapely pillow`). No account, no API key.

```bash
# 1. fetch the place's raw inputs, by bounding box only (into .scratch/hometown-m2/data/<id>/, git-ignored)
python tools/hometown/fetch.py --id okemah --place "Okemah, OK"
python tools/hometown/fetch.py --id phoenix --bbox -112.080,33.444,-112.062,33.458
# 2. compile it (offline: reads only what fetch.py saved) into cities/pkg/packages/<id>/ (git-ignored)
python tools/hometown/compile.py --id okemah --name "Okemah, OK"
# 3. play it
open "http://localhost:<port>/?city=pkg&pkg=okemah"          # add &start=chase for the chase-first opening
```

`--place "Name, ST"` is resolved through Overture's divisions theme (the locality of that name in that state: its area's
bbox, capped at 4.5 km a side). `--bbox lonW,latS,lonE,latN` skips that.

## Sources (all read by bounding box)

| Source | What | How |
|---|---|---|
| Overture Maps, release `2026-10-21.0` | buildings (footprints, heights, floors, class), transportation segments + connectors (the road graph: class, subclass, names, one-way from access restrictions, bridge/tunnel flags), places (POIs for missions), base water and land use | duckdb over the public GeoParquet on S3 (`s3://overturemaps-us-west-2/release/...`), `WHERE bbox` filter (row-group statistics), saved as small parquet files |
| USGS 3DEP 1/3 arc-second (`StagedProducts/Elevation/13/TIFF/current`) | bare-earth ground | `dem.py`: the cloud-optimized GeoTIFFs' internal 512 px tiles under the box, HTTP range requests, LZW + floating-point predictor decoded in Python; cached by ETag |

Licences and credits: © OpenStreetMap contributors (ODbL 1.0) for the OSM-derived Overture rows, Overture Maps
Foundation (CDLA Permissive 2.0 / ODbL by theme), USGS 3DEP (public domain). Every package's `manifest.json` carries
them, `geodata.js` repeats them in its header, the game's map and credits show them (`cities/pkg/js/pkg-hud.js`,
`wagmi/credits.js`), and the repository `NOTICE` lists them.

## Package format (`cities/pkg/packages/<id>/`)

| File | Content |
|---|---|
| `manifest.json` | `format: hometown-package`, `version: 1`; `compiler` (name, version, tile size); `sources` (Overture release and per-layer row counts, the DEM files' URLs + ETags + Last-Modified, the bbox and how it was resolved); `attribution`; `frame`; `box`; `waterLevel`; `tiles`; `stats`; `files` (bytes + sha256 each); `size` |
| `geodata.js` | `window.NYC.GEO` in the SF engine's schema (`cities/sf/docs/formats.md`, `tools/geo-roadgraph.mjs`): `frame`, `box`, `data` (the bins' urls), `land`, `blocks` (curb islands), `roadGraph` (nodes, names, links `[a, b, name, width, lanes, dir, inner, flags, swL, swR]`, `control`, `stopMask`, `nhoods`, `linkNhood`, `decks`), `parks`, `water`, and empty SF-only tables (`piers`, `rail`, `transit`, `landmarks`, `bridges`...); `window.NYC.PLACE_DATA` (`regional`: the arrivals, as the teleport list); `window.NYC.PKG` (id, name, compiler, tile size, density, spawn, spawns, places, frame, box, tiles, downtown) |
| `data/terrain.bin.gz` | SFB1 `sf-terrain` v1: 2 m cells, uint16, 1 cm steps; y = NAVD88 m minus `frame.yOffset` |
| `data/buildings.bin.gz` | SFB1 `sf-buildings` v3: the SF engine's 20 fields per footprint (base/roof/peak in frame y, type by rule), outlines only (`massCount` 0) in v0 |
| `data/groundmask.bin.gz` | SFB1 `sf-groundmask` v1: 1 m cells, `asphalt, sidewalk, lawn, sand, rock, waterEdge` |

Every `.gz` is written with `mtime 0` and no file name: the same inputs and compiler version give the same bytes.

**Frame.** Metres, origin the box centre (`lat0`, `lon0` rounded to 1e-6 degree), +x east, +z south (north is -z), the
SF tools' local equirectangular projection on the WGS84 ellipsoid. y is the NAVD88 height minus `yOffset`, a whole
number of metres: the river's surface (when the place's lowest ground is a river) or the box's lowest ground, so the
place sits near y 0 as San Francisco does.

## Stages

1. **place**: frame, height datum, water level (only water lying in the place's lowest ground: the engine has one water
   level, and every sample under it is water), terrain lattice and quantisation.
2. **network** (the whole place: roads cross tiles): Overture road segments split at their connectors into links
   between nodes; widths, lanes and sidewalks by class (Overture has no lane counts and rarely widths); one-ways from
   access restrictions; signals where two main roads meet, all-way stops at residential crossings, stops on the minor
   approaches elsewhere (a rule: Overture has no signals). Curb islands ("blocks") = the land minus every roadway
   buffered to its curb-to-curb width (round ends make the corner radii), minus the water; holes cut open; under 120 m2
   or narrower than 6 m: an island (median).
3. **tiles** (512 m squares, `compile_tile` = `terrain_tile` + `buildings_tile` + `mask_tile`): each tile's output
   depends only on the place stage, the network and its own sources. Terrain is computed with a 2-sample halo so the
   Gaussian smoothing matches across tile seams.
4. **assemble**: tiles concatenated (tile order, then Overture id) into the engine's single-file containers.

v1 plan: compile on first request, cache by `compiler.version` + tile; the network stage per tile with a halo.

## Rules that are estimates, not data

Road widths, lanes and sidewalks by class; building type (house, shop, warehouse, civic, tower) by Overture class,
footprint area, height and whether it stands downtown; a house's height at least 3.4 m (Overture's ML heights are
eaves); signals and stops; the street density (buildings per km2); paved aprons round non-house buildings. No brand
names: a business is called by what it is and its street ("the gas station on W Broadway St"); public institutions
keep their own names.
