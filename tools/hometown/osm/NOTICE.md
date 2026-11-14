# OSM lane side table (osm-roads-us.parquet)

**© OpenStreetMap contributors. Available under the Open Database License (ODbL 1.0,
https://opendatacommons.org/licenses/odbl/1-0/; https://www.openstreetmap.org/copyright).**

`osm-roads-us.parquet` is a derived database of OpenStreetMap data: for every US way tagged `highway=*` that a car
can drive (3,727,594 ways of 52.2 M highway ways read), its `way_id`, `highway`, `lanes`, `lanes:forward`,
`lanes:backward`, `oneway`, `width`, `turn:lanes`, `layer`, `bridge`, `tunnel`, `maxspeed`, `sidewalk`,
`sidewalk:both/left/right`, `cycleway` and `cycleway:both/left/right` tags, unchanged. It was
made from Geofabrik's `us-261112.osm.pbf` extract (12 Nov 2026) by `tools/hometown/osm_roads.py` (the code that made it
is in this folder's parent, under the MIT License; the data is not). `osm-roads-us.parquet.json` records its source,
size, columns and sha256 (`369b9debd00efaefdee5957bd95f4f6d32f3ca509d3b906d5f79dedda25e0128`).

The ODbL applies to this file and to every database made from it: the Hometown compiler's tiles and packages
(their `manifest.json` and `geodata.js` carry the credit) and the towns built on gamemog.com. If you publicly use,
share or adapt it, keep this notice, credit "© OpenStreetMap contributors", and offer any adapted database under
the ODbL. It is NOT covered by the MIT License in this repository's LICENSE.

Why it is here: the compiler reads lane counts, widths, one-ways, sidewalks and bike lanes from it (compile.py `--osm-roads`, default
`<data>/osm/osm-roads-us.parquet`, else this copy), and it is part of the build record (its sha256), so the
production town builder must read these exact bytes. A new extract is a new file and a new buildId.
