# OSM lane side table (osm-roads-us.parquet)

**© OpenStreetMap contributors. Available under the Open Database License (ODbL 1.0,
https://opendatacommons.org/licenses/odbl/1-0/; https://www.openstreetmap.org/copyright).**

`osm-roads-us.parquet` is a derived database of OpenStreetMap data: for every US way tagged `highway=*` that a car
can drive (3,670,803 ways of 52.2 M highway ways read), its `way_id`, `highway`, `lanes`, `lanes:forward`,
`lanes:backward`, `oneway`, `width`, `turn:lanes`, `layer`, `bridge`, `tunnel` and `maxspeed` tags, unchanged. It was
made from Geofabrik's `us-261112.osm.pbf` extract (12 Nov 2026) by `tools/hometown/osm_roads.py` (the code that made it
is in this folder's parent, under the MIT License; the data is not). `osm-roads-us.parquet.json` records its source,
size, columns and sha256 (`555ea001a758b77bf5c5c0e6103276f55901cd62e64ef822c0f1dd05bdb52f65`).

The ODbL applies to this file and to every database made from it: the Hometown compiler's tiles and packages
(their `manifest.json` and `geodata.js` carry the credit) and the towns built on gamemog.com. If you publicly use,
share or adapt it, keep this notice, credit "© OpenStreetMap contributors", and offer any adapted database under
the ODbL. It is NOT covered by the MIT License in this repository's LICENSE.

Why it is here: the compiler reads lane counts, widths and one-ways from it (compile.py `--osm-roads`, default
`<data>/osm/osm-roads-us.parquet`, else this copy), and it is part of the build record (its sha256), so the
production town builder must read these exact bytes. A new extract is a new file and a new buildId.
