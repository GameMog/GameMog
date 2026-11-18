# tools/hometown/cores.py: the CORE POINTS of the big US places (compiler 0.14.0, the box rule's second step), the
# table cores.json beside this file, keyed by Census GEOID:
#
#   {"format": "hometown-cores", "version": 1, "overture": <release>, "rule": ..., "cores": {"0668000": [lon, lat, "<division id>"], ...}}
#
# A place's core is its Overture locality point (theme divisions, subtype locality: OpenStreetMap's place=city / town /
# village node, which mappers put on the downtown, the main square or the city hall), matched to the Census place by
# state, name and the place's search box. assemble.downtown_box reads it when a capped place's Census internal point
# (a polygon's interior point, often kilometres from anything: San Jose's lies 8 km south-east of its downtown) is so far
# from that core that the internal point's own window (half a box each way) cannot reach it. Only those places are
# listed: a place whose core is inside its internal point's window keeps the 0.8.0 rule (and its box) unchanged, so the
# table holds exactly the places whose box the rule may move.
#
# Built OFFLINE once per Overture release (one read of the divisions points, ~10 s), from the GameMog place index (the
# Census Gazetteer, public domain; columns: geoid name state lsad lat lon pop2010 aland awater aliases):
#
#   python tools/hometown/cores.py --census <GameMog>/lib/places/us-places.tsv.gz [--out tools/hometown/cores.json]
#
# The table's sha256 is in every build record (compile.py build_record 'cores'), so a new table is a new buildId.
# Licence: the points are OpenStreetMap's via Overture (ODbL 1.0, (c) OpenStreetMap contributors): the packages already
# carry that attribution.
import argparse
import gzip
import hashlib
import json
import math
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
CORES_FILE = os.path.join(HERE, 'cores.json')
CORES_FORMAT = 'hometown-cores'
MAX_SIDE_M = 4500       # fetch.py MAX_SIDE_M (the cap); repeated so this module needs no duckdb to load the table
CLASS_RANK = {'city': 0, 'town': 1, 'village': 2, 'municipality': 2}

_TABLE = {'cores': None, 'meta': None}


def jdump(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'))


def load(path=CORES_FILE):
    """The table (cached): {geoid: (lon, lat, division id)} and its meta {sha256, n, overture} (None: no table)."""
    if _TABLE['cores'] is None:
        if os.path.exists(path):
            raw = open(path, 'rb').read()
            t = json.loads(raw)
            if t.get('format') != CORES_FORMAT or t.get('version') != 1:
                raise SystemExit('%s: not a %s v1 table' % (path, CORES_FORMAT))
            _TABLE['cores'] = {g: (float(v[0]), float(v[1]), str(v[2])) for g, v in t['cores'].items()}
            _TABLE['meta'] = {'sha256': hashlib.sha256(raw).hexdigest(), 'n': len(t['cores']), 'overture': t.get('overture')}
        else:
            _TABLE['cores'], _TABLE['meta'] = {}, None
    return _TABLE['cores']


def meta():
    load()
    return _TABLE['meta']


def core_of(pl):
    """A places entry's core [lon, lat] and where it came from: the entry's own `core` (a dev box, a test), else the
    table's row for its GEOID, else (None, None)."""
    if pl.get('core'):
        return (float(pl['core'][0]), float(pl['core'][1])), pl.get('coreSource', 'the places entry')
    g = pl.get('geoid')
    row = load().get(str(g)) if g else None
    if row:
        return (row[0], row[1]), 'Overture locality %s (cores.json)' % row[2]
    return None, None


# ------------------------------------------------------------------------------------------------- the box geometry
def window(anchor, bbox, sbox):
    """assemble.downtown_box's search window: half the capped box each way round `anchor`, inside the search box."""
    lon, lat = anchor
    hx, hy = (bbox[2] - bbox[0]) / 2, (bbox[3] - bbox[1]) / 2
    return [max(sbox[0], lon - hx), max(sbox[1], lat - hy), min(sbox[2], lon + hx), min(sbox[3], lat + hy)]


def inside(pt, b):
    return b[0] <= pt[0] <= b[2] and b[1] <= pt[1] <= b[3]


def capped(bbox, sbox):
    """assemble.downtown_box's test: the search box is wider (or taller) than the capped box."""
    return bool(sbox) and not (sbox[2] - sbox[0] <= bbox[2] - bbox[0] + 2e-5 and sbox[3] - sbox[1] <= bbox[3] - bbox[1] + 2e-5)


# ------------------------------------------------------------------------- the Census side (GameMog's place index)
def py_round(v, n):
    return float('%.*f' % (n, v))


def census_rows(path):
    """GameMog's lib/places/us-places.tsv.gz rows -> dicts with the search box (lib/places/search.ts toPlace) and the
    capped box (lib/hometown/box.ts playBox), the same expressions."""
    out = []
    with gzip.open(path, 'rt', encoding='utf8') as f:
        for line in f:
            if not line.strip() or line[0] == '#':
                continue
            c = line.rstrip('\n').split('\t')
            geoid, name, st, lsad = c[0], c[1], c[2], c[3]
            lat, lon = float(c[4]), float(c[5])
            area = float(c[7]) + float(c[8])
            half = max(1000.0, 0.75 * math.sqrt(area))
            dlat, dlon = half / 111320, half / (111320 * max(0.05, math.cos(math.radians(lat))))
            r5 = lambda v: math.floor(v * 1e5 + 0.5) / 1e5  # noqa: E731  (JS Math.round)
            sbox = [r5(lon - dlon), r5(lat - dlat), r5(lon + dlon), r5(lat + dlat)]
            kx = 111320 * math.cos(math.radians(lat))
            hx, hy = MAX_SIDE_M / 2 / kx, MAX_SIDE_M / 2 / 111132
            bbox = [py_round(max(sbox[0], lon - hx), 6), py_round(max(sbox[1], lat - hy), 6), py_round(min(sbox[2], lon + hx), 6), py_round(min(sbox[3], lat + hy), 6)]
            aliases = [a for a in (c[9].split('|') if len(c) > 9 and c[9] else []) if a]
            out.append({'geoid': geoid, 'name': name, 'state': st, 'lsad': lsad, 'anchor': [lon, lat], 'searchBbox': sbox, 'bbox': bbox,
                        'aliases': aliases, 'pop': int(c[6]) if c[6] else None})
    return out


def fold(s):
    """'San José' -> 'san jose'; 'St. Louis' -> 'saint louis'; punctuation to spaces."""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[^a-z0-9]+", ' ', s).strip()
    s = re.sub(r'^(st|ste)\b', 'saint', s)
    s = re.sub(r'^(ft)\b', 'fort', s)
    s = re.sub(r'^(mt)\b', 'mount', s)
    return s


def names_of(row):
    ns = {fold(row['name'])} | {fold(a) for a in row['aliases']}
    if '/' in row['name']:
        ns.add(fold(row['name'].split('/')[0]))
    return {n for n in ns if n}


def match(rows, localities):
    """{geoid: (lon, lat, id)} for every CAPPED Census place whose matched locality point lies outside its internal
    point's window (and inside its search box). A locality matches by state and folded name; of several, the best
    class (city, town, village, the rest), then the largest population, then the nearest to the internal point, then
    the lowest id. -> (cores, counts)."""
    by = {}
    for (did, name, region, cls, pop, lon, lat) in localities:
        if lon is None or lat is None or not name or not region or not region.startswith('US-'):
            continue
        by.setdefault((region[3:], fold(name)), []).append((did, cls, pop, float(lon), float(lat)))
    cores, n = {}, {'capped': 0, 'matched': 0, 'outsideWindow': 0}
    for row in rows:
        if not capped(row['bbox'], row['searchBbox']):
            continue
        n['capped'] += 1
        cand = []
        for nm in sorted(names_of(row)):
            cand += [c for c in by.get((row['state'], nm), []) if inside((c[3], c[4]), row['searchBbox'])]
        if not cand:
            continue
        lon0, lat0 = row['anchor']
        kx = 111320 * math.cos(math.radians(lat0))
        best = min(set(cand), key=lambda c: (CLASS_RANK.get(c[1], 3), -(c[2] or 0), math.hypot((c[3] - lon0) * kx, (c[4] - lat0) * 111320), c[0]))
        n['matched'] += 1
        if inside((best[3], best[4]), window(row['anchor'], row['bbox'], row['searchBbox'])):
            continue
        n['outsideWindow'] += 1
        cores[row['geoid']] = [round(best[3], 6), round(best[4], 6), best[0]]
    return cores, n


def build(census, out):
    import fetch
    c = fetch.connect()
    loc = c.execute(f"""SELECT id, names.primary, region, class, population, ST_X(geometry), ST_Y(geometry)
      FROM read_parquet('{fetch.S3}/theme=divisions/type=division/*.parquet') WHERE country = 'US' AND subtype = 'locality' ORDER BY id""").fetchall()
    rows = census_rows(census)
    cores, n = match(rows, loc)
    t = {'format': CORES_FORMAT, 'version': 1, 'overture': fetch.RELEASE,
         'rule': 'a capped Census place whose Overture locality point (state + folded name, inside its search box) lies outside '
                 'half its capped box round the internal point: [lon, lat, division id]',
         'source': 'Overture Maps divisions (OpenStreetMap, ODbL 1.0) x US Census Gazetteer places (GameMog lib/places/us-places.tsv.gz, sha256 %s)'
                   % hashlib.sha256(open(census, 'rb').read()).hexdigest()[:16],
         'counts': dict(n, localities=len(loc)), 'cores': dict(sorted(cores.items()))}
    write(t, out)
    print(jdump({'out': out, **t['counts'], 'listed': len(cores)}))


def write(t, out):
    """Sorted JSON, one place a line (a reviewable diff when a release moves a few points)."""
    t = dict(t)
    rows = t.pop('cores')
    head = jdump(t)
    body = ',\n'.join('%s:%s' % (json.dumps(k), jdump(v)) for k, v in sorted(rows.items()))
    with open(out, 'w') as f:
        f.write(head[:-1] + ',"cores":{\n' + body + '\n}}\n')


if __name__ == '__main__':
    sys.path.insert(0, HERE)
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--census', required=True, help="GameMog's lib/places/us-places.tsv.gz")
    ap.add_argument('--out', default=CORES_FILE)
    a = ap.parse_args()
    build(a.census, a.out)
