"""The Python side of the stage-1 / play-box cross-check (task G1, G4). Reads places on stdin (JSON list of
{placeId, geoid, lat, lon, bbox}: the place search's box) and writes, for each, the box from fetch.py's own cap and the
stage-1 descriptor from assemble.stage1, the compiler's authority. Run by scripts/hometown-build-fixture.ts with
the compiler's venv and tools/hometown on sys.path (argv[1]).

The cap's expressions are checked against fetch.resolve()'s own source, so a change to fetch.py's rule fails here
instead of silently drifting from GameMog's lib/hometown/box.ts.

Compiler 0.14.0+ (tools/hometown/cores.py): the core table is derived from this repo's place index by the compiler's own
reading of it (cores.census_rows: the search box of lib/places/search.ts toPlace, the play box of box.ts). Each place
also gets that reading (`coreInput`) and its table row (`core`, or null), so `npm run check` proves the table was cut
from the same boxes GameMog sends."""
import inspect
import json
import math
import sys

sys.path.insert(0, sys.argv[1])
import fetch  # noqa: E402
import assemble  # noqa: E402
try:
    import cores  # noqa: E402  (0.14.0+)
except ImportError:
    cores = None
ROWS = {r['geoid']: r for r in cores.census_rows('lib/places/us-places.tsv.gz')} if cores else {}

SRC = inspect.getsource(fetch.resolve)
for expr in ('kx = 111320 * math.cos(math.radians(lat))', 'half_x, half_y = MAX_SIDE_M / 2 / kx, MAX_SIDE_M / 2 / 111132',
             'W, E = max(W, lon - half_x), min(E, lon + half_x)', 'S, N = max(S, lat - half_y), min(N, lat + half_y)',
             'r = lambda v: round(v, 6)'):
    if expr not in SRC:
        raise SystemExit('fetch.resolve() no longer has %r: lib/hometown/box.ts must follow it' % expr)


def cap(lon, lat, bbox):
    W, S, E, N = bbox
    kx = 111320 * math.cos(math.radians(lat))
    half_x, half_y = fetch.MAX_SIDE_M / 2 / kx, fetch.MAX_SIDE_M / 2 / 111132
    W, E = max(W, lon - half_x), min(E, lon + half_x)
    S, N = max(S, lat - half_y), min(N, lat + half_y)
    r = lambda v: round(v, 6)  # noqa: E731
    return [r(W), r(S), r(E), r(N)]


out = []
for p in json.load(sys.stdin):
    box = cap(p['lon'], p['lat'], p['bbox'])
    places = {p['placeId']: {'geoid': p['geoid'], 'anchor': [p['lon'], p['lat']], 'bbox': box, 'name': p['placeId']}}
    core = {}
    if cores:
        r = ROWS.get(p['geoid'])
        row = cores.load().get(p['geoid'])
        core = {'coreInput': None if r is None else {'searchBbox': r['searchBbox'], 'bbox': r['bbox']}, 'core': None if row is None else [row[0], row[1]]}
    try:
        d = assemble.stage1(p['placeId'], places, 'htc-0.0.0-hg1-b00000000')
        out.append({'placeId': p['placeId'], 'box': box, 'domain': d['domain'], 'origin': d['origin'], 'k0': d['k0'], 'gamma0': d['gamma0'],
                    'playBox': d['playBox'], 'tileRange': d['tileRange'], 'tiles': len(d['tiles']), 'first': d['tiles'][0], **core})
    except SystemExit as e:
        out.append({'placeId': p['placeId'], 'box': box, 'refused': str(e), **core})
json.dump({'maxSideM': fetch.MAX_SIDE_M, 'places': out, **({'cores': cores.meta()} if cores else {})}, sys.stdout, sort_keys=True, separators=(',', ':'))
