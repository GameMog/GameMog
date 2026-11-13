# tools/hometown/osm_roads.py: the national OSM lane side table (grade-lanes, spec Option A), built OFFLINE once per
# Overture release on the dev Mac, never on Render:
#
#   curl -L -o <dl>/us-YYMMDD.osm.pbf https://download.geofabrik.de/north-america/us-YYMMDD.osm.pbf   (~12 GB, no account)
#   python -I tools/hometown/osm_roads.py <dl>/us-YYMMDD.osm.pbf <out>/osm-roads-us.parquet
#
# needs pyosmium (`pip install osmium pyarrow`, its own venv). It reads the ways only (no node locations): every way whose
# highway is a main class or its link (ROADS) and that carries at least one of the tags below. Columns: way_id (int64,
# sorted) and the tags as strings (null when absent). About 30-60 MB. The compiler joins it to Overture segments by
# `sources[].record_id` (w<way id>@<version>: the version is ignored), see compile.py OsmRoads.
#
# Licence: an ODbL 1.0 derived database of OpenStreetMap (© OpenStreetMap contributors); the packages already carry the
# ODbL attribution. Keep this script public with the compiler (share-alike).
import hashlib
import json
import os
import sys
import time

import osmium
import pyarrow as pa
import pyarrow.parquet as pq

ROADS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
TAGS = ['lanes', 'lanes:forward', 'lanes:backward', 'oneway', 'width', 'turn:lanes', 'layer', 'bridge', 'tunnel', 'maxspeed']
COLS = ['highway'] + [t.replace(':', '_') for t in TAGS]


def build(src, out):
    """Streams the kept ways in batches (a .osm.pbf lists its ways by ascending id: the table comes out sorted; checked)."""
    t0 = time.time()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    schema = pa.schema([('way_id', pa.int64())] + [(c, pa.string()) for c in COLS])
    wr = pq.ParquetWriter(out + '.part', schema, compression='zstd')
    rows = {c: [] for c in ['way_id'] + COLS}
    n = kept = 0
    last = -1

    def flush():
        if rows['way_id']:
            wr.write_table(pa.table({c: pa.array(v, schema.field(c).type) for c, v in rows.items()}, schema=schema))
            for v in rows.values():
                v.clear()
    fp = osmium.FileProcessor(src, osmium.osm.WAY).with_filter(osmium.filter.KeyFilter('highway'))
    for w in fp:
        n += 1
        hw = w.tags.get('highway')
        if hw not in ROADS:
            continue
        vals = [w.tags.get(t) for t in TAGS]
        if not any(v is not None for v in vals):
            continue
        assert w.id > last, 'ways not sorted by id'
        last = w.id
        kept += 1
        rows['way_id'].append(w.id)
        rows['highway'].append(hw)
        for c, v in zip(COLS[1:], vals):
            rows[c].append(v)
        if len(rows['way_id']) >= 200000:
            flush()
            print('%d kept of %d highway ways, %.0fs' % (kept, n, time.time() - t0), flush=True)
    flush()
    wr.close()
    os.replace(out + '.part', out)
    h = hashlib.sha256(open(out, 'rb').read()).hexdigest()
    rec = {'source': os.path.basename(src), 'ways': kept, 'highwayWaysSeen': n, 'sha256': h, 'bytes': os.path.getsize(out),
           'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'licence': 'ODbL 1.0, (c) OpenStreetMap contributors', 'columns': ['way_id'] + COLS}
    json.dump(rec, open(out + '.json', 'w'), indent=1, sort_keys=True)
    print(json.dumps(rec), '%.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: osm_roads.py <us.osm.pbf> <out.parquet>')
    build(sys.argv[1], sys.argv[2])
