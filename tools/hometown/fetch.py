# tools/hometown/fetch.py: the raw inputs of one place, by bounding box only, into <data>/<id>/:
#   overture-<theme>-<type>.parquet   Overture Maps rows whose bbox meets the box (duckdb over the public S3 GeoParquet;
#                                     row-group statistics on bbox keep the read to the box's own row groups)
#   dem/                              the USGS 3DEP 1/3" internal tiles under the box (dem.py, HTTP range reads)
#   fetch.json                        what was read: the box, the Overture release, the DEM files' ETags, row counts
# No account, no API key, no national or state extract. Usage:
#   python fetch.py --id okemah --place "Okemah, OK"            (resolved through Overture divisions; see resolve())
#   python fetch.py --id phoenix --bbox -112.080,33.444,-112.062,33.458
import argparse
import json
import math
import os
import sys
import time

import duckdb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dem import read_dem  # noqa: E402

RELEASE = '2026-10-21.0'
S3 = 's3://overturemaps-us-west-2/release/%s' % RELEASE
# (theme, type, columns): what the compiler reads; geometry as WKB
LAYERS = [
    ('buildings', 'building', 'id, geometry, height, num_floors, min_height, class, subtype, roof_shape, roof_height, is_underground, names.primary AS name, sources'),
    ('buildings', 'building_part', 'id, geometry, height, num_floors, min_height, building_id'),
    ('transportation', 'segment', '*'),
    ('transportation', 'connector', 'id, geometry'),
    ('places', 'place', 'id, geometry, names.primary AS name, basic_category, taxonomy, confidence, operating_status'),
    ('base', 'water', 'id, geometry, subtype, class, names.primary AS name, is_salt, is_intermittent'),
    ('base', 'land_use', 'id, geometry, subtype, class, names.primary AS name'),
    ('base', 'infrastructure', 'id, geometry, subtype, class, names.primary AS name'),
]
STATES = {'AL': 'US-AL', 'AK': 'US-AK', 'AZ': 'US-AZ', 'AR': 'US-AR', 'CA': 'US-CA', 'CO': 'US-CO', 'CT': 'US-CT', 'DE': 'US-DE', 'FL': 'US-FL', 'GA': 'US-GA', 'HI': 'US-HI', 'ID': 'US-ID', 'IL': 'US-IL', 'IN': 'US-IN', 'IA': 'US-IA', 'KS': 'US-KS', 'KY': 'US-KY', 'LA': 'US-LA', 'ME': 'US-ME', 'MD': 'US-MD', 'MA': 'US-MA', 'MI': 'US-MI', 'MN': 'US-MN', 'MS': 'US-MS', 'MO': 'US-MO', 'MT': 'US-MT', 'NE': 'US-NE', 'NV': 'US-NV', 'NH': 'US-NH', 'NJ': 'US-NJ', 'NM': 'US-NM', 'NY': 'US-NY', 'NC': 'US-NC', 'ND': 'US-ND', 'OH': 'US-OH', 'OK': 'US-OK', 'OR': 'US-OR', 'PA': 'US-PA', 'RI': 'US-RI', 'SC': 'US-SC', 'SD': 'US-SD', 'TN': 'US-TN', 'TX': 'US-TX', 'UT': 'US-UT', 'VT': 'US-VT', 'VA': 'US-VA', 'WA': 'US-WA', 'WV': 'US-WV', 'WI': 'US-WI', 'WY': 'US-WY', 'DC': 'US-DC'}
MAX_SIDE_M = 4500  # a place's box is capped at this many metres a side (v0 compiles a town, not a county)


def connect():
    c = duckdb.connect()
    c.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")
    return c


def resolve(c, place):
    """'Okemah, OK' -> (bbox, how): the Overture locality of that name in that state (divisions theme, one column read
    over the division points), its area's bbox when Overture has one, capped at MAX_SIDE_M round its point."""
    name, _, st = [s.strip() for s in place.partition(',')]
    region = STATES.get(st.upper(), st)
    rows = c.execute(f"""SELECT id, ST_X(geometry), ST_Y(geometry) FROM read_parquet('{S3}/theme=divisions/type=division/*.parquet')
      WHERE country = 'US' AND subtype = 'locality' AND names.primary = ? AND region = ? ORDER BY id""", [name, region]).fetchall()
    if not rows:
        raise SystemExit(f'no Overture locality named {name!r} in {region}')
    did, lon, lat = rows[0]
    kx = 111320 * math.cos(math.radians(lat))
    d = 0.08
    area = c.execute(f"""SELECT bbox.xmin, bbox.ymin, bbox.xmax, bbox.ymax FROM read_parquet('{S3}/theme=divisions/type=division_area/*.parquet')
      WHERE division_id = ? AND bbox.xmin > ? AND bbox.xmax < ? AND bbox.ymin > ? AND bbox.ymax < ? ORDER BY id LIMIT 1""",
                     [did, lon - d * 4, lon + d * 4, lat - d * 4, lat + d * 4]).fetchall()
    half_x, half_y = MAX_SIDE_M / 2 / kx, MAX_SIDE_M / 2 / 111132
    if area:
        W, S, E, N = area[0]
        W, E = max(W, lon - half_x), min(E, lon + half_x)
        S, N = max(S, lat - half_y), min(N, lat + half_y)
        how = f'Overture division {did} (area bbox, capped at {MAX_SIDE_M} m)'
    else:
        W, S, E, N = lon - half_x / 2, lat - half_y / 2, lon + half_x / 2, lat + half_y / 2
        how = f'Overture division {did} (point, {MAX_SIDE_M // 2} m box)'
    r = lambda v: round(v, 6)
    return (r(W), r(S), r(E), r(N)), how


def fetch(pid, bbox, data_dir, margin_m=150, place=None, how=None):
    out = os.path.join(data_dir, pid)
    os.makedirs(out, exist_ok=True)
    W, S, E, N = bbox
    lat = (S + N) / 2
    mx, my = margin_m / (111320 * math.cos(math.radians(lat))), margin_m / 111132
    # the read box: the place's box and a margin (roads leaving it, the buildings on its edge)
    RW, RS, RE, RN = W - mx, S - my, E + mx, N + my
    c = connect()
    rec = {'id': pid, 'place': place, 'resolvedBy': how, 'bbox': list(bbox), 'readBbox': [RW, RS, RE, RN], 'overture': {'release': RELEASE, 'layers': {}}}
    for theme, typ, cols in LAYERS:
        f = os.path.join(out, f'overture-{theme}-{typ}.parquet')
        t = time.time()
        if not os.path.exists(f):
            q = f"""COPY (SELECT {cols} FROM read_parquet('{S3}/theme={theme}/type={typ}/*.parquet', hive_partitioning=0)
                WHERE bbox.xmin <= {RE} AND bbox.xmax >= {RW} AND bbox.ymin <= {RN} AND bbox.ymax >= {RS} ORDER BY id)
                TO '{f}' (FORMAT parquet, COMPRESSION zstd)"""
            c.execute(q)
        n = c.execute(f"SELECT count(*) FROM read_parquet('{f}')").fetchone()[0]
        rec['overture']['layers'][f'{theme}/{typ}'] = {'rows': n, 'bytes': os.path.getsize(f)}
        print(f'{pid}: {theme}/{typ}: {n} rows, {os.path.getsize(f)} B, {time.time() - t:.1f}s', flush=True)
    # elevation over the read box and 300 m more (the terrain's apron)
    ax, ay = 300 / (111320 * math.cos(math.radians(lat))), 300 / 111132
    t = time.time()
    grid, lon0, lat0, res, sources = read_dem((RW - ax, RS - ay, RE + ax, RN + ay), out)
    rec['dem'] = {'dataset': 'USGS 3DEP 1/3 arc-second (current)', 'files': sources, 'shape': list(grid.shape)}
    print(f'{pid}: dem {grid.shape} from {len(sources)} file(s), {time.time() - t:.1f}s', flush=True)
    json.dump(rec, open(os.path.join(out, 'fetch.json'), 'w'), indent=1, sort_keys=True)
    return rec


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--place')
    ap.add_argument('--bbox', help='lonW,latS,lonE,latN')
    ap.add_argument('--data', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.scratch/hometown-m2/data'))
    a = ap.parse_args()
    how = None
    if a.bbox:
        bbox = tuple(float(v) for v in a.bbox.split(','))
        how = 'given bbox'
    elif a.place:
        bbox, how = resolve(connect(), a.place)
    else:
        raise SystemExit('--place or --bbox')
    print(a.id, bbox, how, flush=True)
    fetch(a.id, bbox, os.path.abspath(a.data), place=a.place, how=how)
