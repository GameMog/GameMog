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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import duck  # noqa: E402
from dem import read_dem  # noqa: E402

RELEASE = '2026-10-21.0'
S3 = 's3://overturemaps-us-west-2/release/%s' % RELEASE
# (theme, type, columns): what the compiler reads; geometry as WKB
LAYERS = [
    ('buildings', 'building', 'id, geometry, height, num_floors, min_height, class, subtype, roof_shape, roof_height, is_underground, names.primary AS name, sources'),
    ('buildings', 'building_part', 'id, geometry, height, num_floors, min_height, building_id'),
    ('transportation', 'segment', 'id, geometry, subtype, class, subclass, names, connectors, access_restrictions, road_flags, width_rules, level_rules, subclass_rules'),
    ('transportation', 'connector', 'id, geometry'),
    ('places', 'place', 'id, geometry, names.primary AS name, basic_category, taxonomy, confidence, operating_status'),
    ('base', 'water', 'id, geometry, subtype, class, names.primary AS name, is_salt, is_intermittent'),
    ('base', 'land_use', 'id, geometry, subtype, class, names.primary AS name'),
    ('base', 'infrastructure', 'id, geometry, subtype, class, names.primary AS name'),
]
STATES = {'AL': 'US-AL', 'AK': 'US-AK', 'AZ': 'US-AZ', 'AR': 'US-AR', 'CA': 'US-CA', 'CO': 'US-CO', 'CT': 'US-CT', 'DE': 'US-DE', 'FL': 'US-FL', 'GA': 'US-GA', 'HI': 'US-HI', 'ID': 'US-ID', 'IL': 'US-IL', 'IN': 'US-IN', 'IA': 'US-IA', 'KS': 'US-KS', 'KY': 'US-KY', 'LA': 'US-LA', 'ME': 'US-ME', 'MD': 'US-MD', 'MA': 'US-MA', 'MI': 'US-MI', 'MN': 'US-MN', 'MS': 'US-MS', 'MO': 'US-MO', 'MT': 'US-MT', 'NE': 'US-NE', 'NV': 'US-NV', 'NH': 'US-NH', 'NJ': 'US-NJ', 'NM': 'US-NM', 'NY': 'US-NY', 'NC': 'US-NC', 'ND': 'US-ND', 'OH': 'US-OH', 'OK': 'US-OK', 'OR': 'US-OR', 'PA': 'US-PA', 'RI': 'US-RI', 'SC': 'US-SC', 'SD': 'US-SD', 'TN': 'US-TN', 'TX': 'US-TX', 'UT': 'US-UT', 'VT': 'US-VT', 'VA': 'US-VA', 'WA': 'US-WA', 'WV': 'US-WV', 'WI': 'US-WI', 'WY': 'US-WY', 'DC': 'US-DC'}
MAX_SIDE_M = 4500  # a place's box is capped at this many metres a side (v0 compiles a town, not a county)


def connect(**kw):
    """httpfs + spatial LOADED from the preinstalled extension directory (duck.py: never INSTALL at run time), anonymous S3."""
    c = duck.connect('httpfs', 'spatial', **kw)
    c.execute("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")
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


# ------------------------------------------------------------------------------------------------- hg1 regions (L4)
# A region is one hg1 context block (L4: 16 x 16 tiles, 8192 grid-m) and REGION_HALO grid-m round it: every Overture row
# whose bbox meets that envelope (whole rows, never clipped), saved under <data>/regions/hg1-{d}/4/{C}/{R}/. A tile or
# ctx compile reads the regions covering its windows (compile.py checks the coverage), so the same rows reach every
# compile of a tile whichever place asked for it. Several regions are fetched with ONE read of S3 per layer (the union
# of their envelopes), split locally: the same rows as one read per region.
REGION_HALO = 300


def region_dir(data_dir, dom, C, R):
    return os.path.join(data_dir, 'regions', 'hg1-%s' % dom, '4', str(C), str(R))


def region_envelope(dom, C, R, halo=REGION_HALO):
    """The lon/lat bbox of block (C, R) + halo: 33 inverse-projected points per edge, then a 1e-4 degree pad."""
    import numpy as np
    import grid
    d = grid.domain(dom)
    B = 8192
    e0, e1, s0, s1 = C * B - halo, (C + 1) * B + halo, R * B - halo, (R + 1) * B + halo
    t = np.linspace(0, 1, 33)
    E = np.concatenate([e0 + (e1 - e0) * t, np.full(33, e1), e1 - (e1 - e0) * t, np.full(33, e0)])
    S = np.concatenate([np.full(33, s0), s0 + (s1 - s0) * t, np.full(33, s1), s1 - (s1 - s0) * t])
    lon, lat = d.inverse(E, S)
    pad = 1e-4
    return (float(lon.min()) - pad, float(lat.min()) - pad, float(lon.max()) + pad, float(lat.max()) + pad)


# ---- the per-release file index (M5): Overture's S3 layout makes a glob read open EVERY file's footer (hundreds of
# ranged GETs, the main cost of a cold fetch far from us-west-2). index.json lists, per layer, each file with the bbox of
# its rows (the union of its row groups' bbox statistics), built ONCE per release (a P5 job; stored by the builder at
# src/overture/{release}/index.json); a region fetch then reads only the files whose bbox meets its envelope.
INDEX_FORMAT = 'hometown-overture-index'


def index_path(data_dir, release=RELEASE):
    return os.path.join(data_dir, 'overture-index', '%s.json' % release)


def build_index(data_dir, release=RELEASE, workers=8):
    from concurrent.futures import ThreadPoolExecutor
    c = connect(threads=4, object_cache=True)
    out = {'format': INDEX_FORMAT, 'version': 1, 'release': release, 'layers': {}}

    def one(layer):
        theme, typ = layer
        cur = c.cursor()
        files = [r[0] for r in cur.execute(f"SELECT file FROM glob('s3://overturemaps-us-west-2/release/{release}/theme={theme}/type={typ}/*.parquet') ORDER BY file").fetchall()]
        lst = ', '.join("'%s'" % f for f in files)
        rows = cur.execute(f"""SELECT file_name, path_in_schema, min(TRY_CAST(stats_min AS DOUBLE)), max(TRY_CAST(stats_max AS DOUBLE)), sum(row_group_num_rows)
            FROM parquet_metadata([{lst}]) WHERE path_in_schema IN ('bbox, xmin', 'bbox, ymin', 'bbox, xmax', 'bbox, ymax')
            GROUP BY 1, 2 ORDER BY 1, 2""").fetchall()
        fb = {}
        for f, col, lo, hi, n in rows:
            e = fb.setdefault(f, {})
            e[col.split(', ')[1]] = (lo, hi)
            e['rows'] = max(e.get('rows', 0), int(n or 0))
        lst_out = []
        for f in files:
            e = fb.get(f)
            if not e or any(k not in e or e[k][0] is None for k in ('xmin', 'ymin', 'xmax', 'ymax')):
                lst_out.append({'file': f, 'bbox': None})   # (no statistics: always read)
            else:
                lst_out.append({'file': f, 'bbox': [e['xmin'][0], e['ymin'][0], e['xmax'][1], e['ymax'][1]]})
        return '%s/%s' % (theme, typ), lst_out
    with ThreadPoolExecutor(workers) as ex:
        for k, v in ex.map(one, sorted({(t, y) for t, y, _ in LAYERS})):
            out['layers'][k] = v
    p = index_path(data_dir, release)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p + '.part', 'w') as f:
        json.dump(out, f, sort_keys=True, separators=(',', ':'))
    os.replace(p + '.part', p)
    return out


def load_index(data_dir, release=RELEASE):
    p = index_path(data_dir, release)
    if not os.path.exists(p):
        return None
    ix = json.load(open(p))
    assert ix.get('format') == INDEX_FORMAT and ix.get('release') == release, p
    return ix


def layer_files(ix, theme, typ, W, S_, E_, N):
    """The S3 files of a layer whose rows can meet the bbox (all of them without an index: the glob)."""
    if ix is None:
        return "'%s/theme=%s/type=%s/*.parquet'" % (S3, theme, typ)
    fs = [e['file'] for e in ix['layers']['%s/%s' % (theme, typ)]
          if e['bbox'] is None or not (e['bbox'][0] > E_ or e['bbox'][2] < W or e['bbox'][1] > N or e['bbox'][3] < S_)]
    return '[%s]' % ', '.join("'%s'" % f for f in fs) if fs else None


# duckdb limits for a region fetch (a 4c-8g builder slot): every layer read in parallel through one database (cursors
# share its memory_limit), 4 threads, the object cache on (a file's footer read once per run)
FETCH_THREADS = int(os.environ.get('HOMETOWN_FETCH_THREADS', '4'))
FETCH_MEMORY = os.environ.get('HOMETOWN_FETCH_MEMORY', '2GB')


def fetch_regions(dom, blocks, data_dir, use_index=True, parallel=True):
    from concurrent.futures import ThreadPoolExecutor
    todo = []
    for C, R in blocks:
        out = region_dir(data_dir, dom, C, R)
        if os.path.exists(os.path.join(out, 'region.json')):
            continue
        todo.append((C, R, out, region_envelope(dom, C, R)))
    if not todo:
        return
    W = min(t[3][0] for t in todo); S_ = min(t[3][1] for t in todo); E_ = max(t[3][2] for t in todo); N = max(t[3][3] for t in todo)
    ix = load_index(data_dir) if use_index else None
    c = connect(threads=FETCH_THREADS, memory_limit=FETCH_MEMORY, object_cache=True)
    tmp = os.path.join(data_dir, 'regions', '.tmp')
    os.makedirs(tmp, exist_ok=True)
    recs = {(C, R): {'grid': 'hg1', 'domain': dom, 'block': [C, R], 'halo': REGION_HALO, 'envelope': list(env),
                     'overture': {'release': RELEASE, 'layers': {}}} for C, R, _, env in todo}
    t_all = time.time()

    def read(layer):
        theme, typ, cols = layer
        cur = c.cursor()
        f = os.path.join(tmp, f'{theme}-{typ}.parquet')
        t = time.time()
        src = layer_files(ix, theme, typ, W, S_, E_, N)
        nfiles = None if ix is None else (0 if src is None else src.count("'") // 2)
        if not os.path.exists(f):
            if src is None:   # (no file can hold a row of the envelope: an empty layer of the same schema)
                cur.execute(f"""COPY (SELECT {cols}, bbox FROM read_parquet('{S3}/theme={theme}/type={typ}/*.parquet', hive_partitioning=0) LIMIT 0)
                    TO '{f}.part' (FORMAT parquet, COMPRESSION zstd)""")
            else:
                cur.execute(f"""COPY (SELECT {cols}, bbox FROM read_parquet({src}, hive_partitioning=0)
                    WHERE bbox.xmin <= {E_} AND bbox.xmax >= {W} AND bbox.ymin <= {N} AND bbox.ymax >= {S_} ORDER BY id)
                    TO '{f}.part' (FORMAT parquet, COMPRESSION zstd)""")
            os.replace(f + '.part', f)
        return layer, f, time.time() - t, nfiles
    with ThreadPoolExecutor(len(LAYERS) if parallel else 1) as ex:
        res = list(ex.map(read, LAYERS))
    for (theme, typ, cols), f, dt, nfiles in res:
        print(f'regions {theme}/{typ}: union read {dt:.1f}s' + ('' if nfiles is None else f' ({nfiles} indexed files)'), flush=True)
        for C, R, out, (w, s, e, n) in todo:
            os.makedirs(out, exist_ok=True)
            g = os.path.join(out, f'overture-{theme}-{typ}.parquet')
            c.execute(f"""COPY (SELECT * FROM read_parquet('{f}') WHERE bbox.xmin <= {e} AND bbox.xmax >= {w} AND bbox.ymin <= {n} AND bbox.ymax >= {s}
                ORDER BY id) TO '{g}' (FORMAT parquet, COMPRESSION zstd)""")
            nrows = c.execute(f"SELECT count(*) FROM read_parquet('{g}')").fetchone()[0]
            recs[(C, R)]['overture']['layers'][f'{theme}/{typ}'] = {'rows': nrows}
    for C, R, out, _ in todo:
        json.dump(recs[(C, R)], open(os.path.join(out, 'region.json'), 'w'), indent=1, sort_keys=True)
        print('region', dom, C, R, recs[(C, R)]['overture']['layers'], flush=True)
    print(json.dumps({'regionsFetched': len(todo), 'seconds': round(time.time() - t_all, 1), 'index': ix is not None, 'parallel': parallel}), flush=True)
    for name in os.listdir(tmp):
        os.remove(os.path.join(tmp, name))


# Segment extras (grade-lanes): the OSM way ids (`sources[].record_id`) and `speed_limits` of every segment of a fetched
# region, in their own file beside the segments (overture-transportation-segment-extras.parquet), so the lanes can be
# joined to the OSM side table (osm_roads.py) without refetching the regions. One S3 read of the union per run.
EXTRAS = ('transportation', 'segment', 'id, sources, speed_limits')
EXTRAS_FILE = 'overture-transportation-segment-extras.parquet'


def fetch_extras(dom, blocks, data_dir):
    todo = []
    for C, R in blocks:
        out = region_dir(data_dir, dom, C, R)
        if not os.path.exists(os.path.join(out, 'region.json')):
            raise SystemExit('region %s/%d/%d not fetched: fetch it first (--regions)' % (dom, C, R))
        if not os.path.exists(os.path.join(out, EXTRAS_FILE)):
            todo.append((C, R, out, region_envelope(dom, C, R)))
    if not todo:
        return
    W = min(t[3][0] for t in todo); S_ = min(t[3][1] for t in todo); E_ = max(t[3][2] for t in todo); N = max(t[3][3] for t in todo)
    c = connect()
    tmp = os.path.join(data_dir, 'regions', '.tmp-extras')
    os.makedirs(tmp, exist_ok=True)
    theme, typ, cols = EXTRAS
    f = os.path.join(tmp, 'extras.parquet')
    t = time.time()
    if not os.path.exists(f):
        c.execute(f"""COPY (SELECT {cols}, bbox FROM read_parquet('{S3}/theme={theme}/type={typ}/*.parquet', hive_partitioning=0)
            WHERE bbox.xmin <= {E_} AND bbox.xmax >= {W} AND bbox.ymin <= {N} AND bbox.ymax >= {S_} ORDER BY id)
            TO '{f}.part' (FORMAT parquet, COMPRESSION zstd)""")
        os.replace(f + '.part', f)
    print(f'extras: union read {time.time() - t:.1f}s', flush=True)
    for C, R, out, (w, s, e, n) in todo:
        g = os.path.join(out, EXTRAS_FILE)
        # (exactly the region's segment ids)
        c.execute(f"""COPY (SELECT x.id, x.sources, x.speed_limits FROM read_parquet('{f}') x
            SEMI JOIN read_parquet('{os.path.join(out, 'overture-transportation-segment.parquet')}') s ON s.id = x.id ORDER BY x.id) TO '{g}.part' (FORMAT parquet, COMPRESSION zstd)""")
        os.replace(g + '.part', g)
        rj = os.path.join(out, 'region.json')
        rec = json.load(open(rj))
        rec['overture']['layers']['transportation/segment-extras'] = {'rows': c.execute(f"SELECT count(*) FROM read_parquet('{g}')").fetchone()[0], 'columns': cols}
        json.dump(rec, open(rj, 'w'), indent=1, sort_keys=True)
        print('extras', dom, C, R, rec['overture']['layers']['transportation/segment-extras'], flush=True)
    for name in os.listdir(tmp):
        os.remove(os.path.join(tmp, name))


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
    ap.add_argument('--id')
    ap.add_argument('--place')
    ap.add_argument('--bbox', help='lonW,latS,lonE,latN')
    ap.add_argument('--regions', help='hg1 L4 blocks: dom:C,R;C,R... (fetched with one S3 read per layer)')
    ap.add_argument('--index', action='store_true', help='build the per-release file index (overture-index/{release}.json under --data)')
    ap.add_argument('--no-index', action='store_true', help='--regions: glob every file (the pre-index read, for measuring)')
    ap.add_argument('--serial', action='store_true', help='--regions: one layer at a time (the pre-M5 read, for measuring)')
    ap.add_argument('--extras', help='hg1 L4 blocks (as --regions): add the segments\' OSM way ids and speed limits (grade-lanes)')
    ap.add_argument('--data', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../.scratch/hometown-m2/data'))
    a = ap.parse_args()
    if a.index:
        t = time.time()
        ix = build_index(os.path.abspath(a.data))
        print(json.dumps({'index': index_path(os.path.abspath(a.data)), 'files': {k: len(v) for k, v in ix['layers'].items()}, 'seconds': round(time.time() - t, 1)}))
        raise SystemExit(0)
    if a.regions:
        dom, _, rest = a.regions.partition(':')
        fetch_regions(dom, [tuple(int(v) for v in b.split(',')) for b in rest.split(';')], os.path.abspath(a.data), use_index=not a.no_index, parallel=not a.serial)
        raise SystemExit(0)
    if a.extras:
        dom, _, rest = a.extras.partition(':')
        fetch_extras(dom, [tuple(int(v) for v in b.split(',')) for b in rest.split(';')], os.path.abspath(a.data))
        raise SystemExit(0)
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
