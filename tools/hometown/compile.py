# tools/hometown/compile.py: Hometown compiler 0.3.0 on the national grid hg1 (grid.py). A TILE is compiled from its
# own sources and context alone: tile = f(buildId, key, sources over tile + halo, ctx blocks). It never reads a whole
# place's inputs nor a neighbour's output, so neighbouring towns share identical tiles, any tile can be compiled on first
# request, and a 4 x 4 block compiled in one process gives the same bytes as its 16 tiles compiled one by one.
#
#   --tile hg1-{d}/0/{c}/{r} --out -        one tile, HTL1 bytes on stdout (the tile server's subprocess contract)
#   --block hg1-{d}/2/{C}/{R}               the 16 tiles of an L2 block, stored ifAbsent in --store
#   --ctx hg1-{d}/4/{C}/{R}                 a context block (context.py), stored in --store
#   --descriptor <placeId> --stage 1|2      the session descriptor: stage 1 (gazetteer + grid), stage 2 (+ tiles)
#   --id <placeId>                          LEGACY ASSEMBLER: descriptor, the place's tiles, then today's single-package
#                                           layout in session coordinates (cities/pkg/packages/<id>/, ?city=pkg)
# Raw inputs: fetch.py --regions (Overture rows per L4 region) and the 3DEP ETag mirror (dem.py Sampler).
# Store (--store, default .scratch/hometown/store): tiles/{buildId}/hg1-{d}/0/{c}/{r}, ctx/{buildId}/hg1-{d}/4/{C}/{R},
# manifests/{buildId}/{placeId}.json, builds/{buildId}.json. Every object deterministic (sorted JSON, gzip mtime 0).
import argparse
import gzip
import hashlib
import io
import json
import math
import os
import struct
import sys
import time

import duckdb
import numpy as np
import shapely
from PIL import Image, ImageDraw
from shapely.geometry import LineString, Point, Polygon, box as sbox
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grid  # noqa: E402
import context  # noqa: E402
import far as farlib  # noqa: E402
from context import Context, building_owner_cm, downtown_at, floor_div, largest_polygon, water_polys, exact_centroid_cm  # noqa: E402
import dem as demlib  # noqa: E402
from dem import Sampler  # noqa: E402
from sources import Sources, blocks_for, MissingRegion  # noqa: E402

# bump on ANY change to a tile's bytes (a rule, a constant, an output field). 0.1.0 90bae8c; 0.2.0 water rule, 1 cm
# steps, density, paved lots, yard trees, edge cuts, tunnels, bridges, slopes, integer tree hash; 0.3.0 hg1 national grid:
# per-tile compile from tile + halo sources and ctx blocks (no whole-place inputs), split-at-grid-line roads with border
# nodes, centroid-owned buildings, absolute cm heights + wet mask, per-polygon water levels
COMPILER_VERSION = '0.3.0'
OVERTURE_RELEASE = '2026-10-21.0'
TILE, TCM = grid.TILE, grid.TILE_CM
ROAD_HALO = 160      # m: segments read round a tile (owned pieces, curb islands' roadway, sidewalk bands)
ISLAND_HALO = 128    # m: the curb islands' window
POST_HALO = 128      # m: the post window (building bases may overhang the tile)
BRIDGE_MAX = 600     # m: longer bridge spans are never raised (their checks would reach past the tile's coverage)
CTX_REACH = 3200     # m: the ctx a tile reads (dense blend 1 km; downtown 250 + 2000 + 350 m round building centroids up to
                     # ~600 m off the tile: its paved-lot neighbours)
CENTRE_REACH = 900   # m: the downtown centres a tile looks for round itself
LOAD_REACH = 3200    # m: the regions a tile compile loads
ATTRIBUTION = [
    '© OpenStreetMap contributors (ODbL 1.0), via Overture Maps Foundation',
    'Overture Maps Foundation (CDLA Permissive 2.0 / ODbL 1.0 per theme)',
    'USGS 3D Elevation Program (public domain)',
]
LICENSES = {
    'buildings': 'ODbL 1.0 (OpenStreetMap-derived rows) / CDLA Permissive 2.0 (Microsoft, Google, Esri rows)',
    'transportation': 'ODbL 1.0 (OpenStreetMap)', 'places': 'CDLA Permissive 2.0', 'base': 'ODbL 1.0 (OpenStreetMap)',
    'dem': 'Public domain (USGS)',
}
FLAGS = {'freeway': 1, 'tunnel': 2, 'ramp': 4, 'pedestrian': 8, 'private': 16, 'alley': 32, 'crooked': 64}
# Road classes: curb-to-curb width (m), lanes (both ways), sidewalk (m each side, 0 none), rank. Estimates by class.
ROAD = {
    'motorway': (22.0, 4, 0.0, 6), 'trunk': (18.0, 4, 0.0, 5), 'primary': (15.0, 4, 2.4, 5), 'secondary': (13.0, 2, 2.2, 4),
    'tertiary': (11.0, 2, 2.0, 3), 'residential': (8.5, 2, 1.6, 2), 'living_street': (7.0, 2, 1.6, 1),
    'unclassified': (7.5, 2, 0.0, 2), 'service': (6.0, 2, 0.0, 1), 'unknown': (7.0, 2, 0.0, 1),
}
SKIP_SUBCLASS = {'driveway', 'parking_aisle', 'drive_through'}
MASK = {'asphalt': 0, 'sidewalk': 1, 'lawn': 2, 'sand': 3, 'rock': 4, 'waterEdge': 5, 'water': 6}
BTYPES = ['shed', 'rowhouse', 'flats', 'apartment', 'office-low', 'warehouse', 'midrise', 'tower', 'civic', 'landmark']
PALETTES = ['victorian', 'north-beach', 'chinatown', 'downtown', 'soma']
ERAS = ['unknown', 'victorian-edwardian', 'interwar', 'postwar', 'contemporary']
FACADES = ['unknown', 'glass', 'concrete', 'stone', 'metal', 'terracotta']
BFIELDS = ['base', 'roof', 'peak', 'ringStart', 'ringCount', 'theta', 'massStart', 'massCount', 'shops', 'type', 'palette', 'bays',
           'garage', 'era', 'frontW', 'row', 'storeyH', 'stories', 'facade', 'podium']
CIVIC = {'church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'school', 'university', 'college', 'hospital', 'public',
         'civic', 'government', 'post_office', 'library', 'fire_station', 'police', 'train_station', 'museum', 'courthouse', 'townhall'}
SHOPS = {'retail', 'commercial', 'supermarket', 'kiosk', 'shop'}
SHEDS = {'garage', 'garages', 'shed', 'carport', 'roof', 'barn', 'farm_auxiliary', 'greenhouse', 'storage_tank', 'silo', 'outbuilding'}
WAREHOUSE = {'industrial', 'warehouse', 'manufacture', 'factory', 'hangar', 'service', 'transportation', 'agricultural'}
GENERIC = {
    'gas_station': 'the gas station', 'fuel': 'the gas station', 'restaurant': 'the diner', 'fast_food_restaurant': 'the burger stand',
    'cafe': 'the coffee shop', 'coffee_shop': 'the coffee shop', 'bar': 'the bar', 'grocery_store': 'the grocery', 'supermarket': 'the supermarket',
    'convenience_store': 'the corner store', 'pharmacy': 'the pharmacy', 'bank': 'the bank', 'hotel': 'the motel', 'motel': 'the motel',
    'auto_repair': 'the garage', 'car_dealer': 'the car lot', 'hardware_store': 'the hardware store', 'church': 'the church',
    'place_of_worship': 'the church', 'school': 'the school', 'park': 'the park', 'post_office': 'the post office', 'library': 'the library',
    'hospital': 'the hospital', 'police_station': 'the police station', 'fire_station': 'the fire station', 'city_hall': 'city hall',
    'museum': 'the museum', 'parking': 'the parking lot', 'dollar_store': 'the discount store', 'clothing_store': 'the clothes shop',
    'beauty_salon': 'the salon', 'barber': 'the barber', 'laundromat': 'the laundromat', 'stadium': 'the stadium', 'cemetery': 'the cemetery',
}
PUBLIC = {'school', 'park', 'post_office', 'library', 'hospital', 'police_station', 'fire_station', 'city_hall', 'museum', 'cemetery',
          'church', 'place_of_worship', 'stadium', 'courthouse', 'government', 'community_center'}
PARK_SUB = ('park', 'recreation', 'golf', 'grass', 'cemetery')
PARK_CLASS = ('park', 'playground', 'pitch', 'recreation_ground', 'golf_course', 'grass', 'cemetery', 'village_green')


# ------------------------------------------------------------------------------------------------------------- helpers
def q1(v):
    return round(float(v) * 10) / 10


def cm(v):
    return int(np.rint(float(v) * 100))


def ring_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, z0 = pts[i - 1]
        x1, z1 = pts[i]
        a += x0 * z1 - x1 * z0
    return a / 2


def neg_ring(coords):
    pts = [(float(x), float(z)) for x, z in coords]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if ring_area(pts) > 0:
        pts.reverse()
    return pts


def gz(b):
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode='wb', compresslevel=9, mtime=0, filename='') as g:
        g.write(b)
    return bio.getvalue()


def jdump(o):
    return json.dumps(o, sort_keys=True, separators=(',', ':'))


def dominant_angle(pts):
    sx = sy = 0.0
    n = len(pts)
    for i in range(n):
        ax, az = pts[i]
        bx, bz = pts[(i + 1) % n]
        L = math.hypot(bx - ax, bz - az)
        phi = math.atan2(bz - az, bx - ax)
        sx += L * math.cos(4 * phi)
        sy += L * math.sin(4 * phi)
    return math.atan2(sy, sx) / 4


def access_dir(ar):
    d = 0
    for a in ar or []:
        w = a.get('when') or {}
        if a.get('access_type') != 'denied' or not w.get('heading') or w.get('mode') or w.get('using') or w.get('vehicle') or w.get('during') or a.get('between'):
            continue
        d = 1 if w['heading'] == 'backward' else -1
    return d


def flagged(rules, name):
    return any(name in (r.get('values') or []) for r in rules or [])


def pretty_raw(name):
    if not name:
        return ''
    n = ' ' + name.upper() + ' '
    for a, b in ((' STREET ', ' ST '), (' AVENUE ', ' AVE '), (' BOULEVARD ', ' BLVD '), (' DRIVE ', ' DR '), (' ROAD ', ' RD '),
                 (' PLACE ', ' PL '), (' LANE ', ' LN '), (' COURT ', ' CT '), (' TERRACE ', ' TER '), (' HIGHWAY ', ' HWY '),
                 (' NORTH ', ' N '), (' SOUTH ', ' S '), (' EAST ', ' E '), (' WEST ', ' W '), (' PARKWAY ', ' PKWY '), (' ALLEY ', ' ALY ')):
        n = n.replace(a, b)
    return n.strip()


def lines_of(g):
    if g.is_empty:
        return []
    if g.geom_type == 'LineString':
        return [g]
    return [h for k in getattr(g, 'geoms', []) for h in lines_of(k)]


def polygons(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if hasattr(g, 'geoms'):
        out = []
        for h in g.geoms:
            out += polygons(h)
        return out
    return []


def cut_holes(poly):
    todo, out = [poly], []
    while todo:
        p = todo.pop()
        if not p.interiors:
            out.append(p)
            continue
        h = p.interiors[0]
        cx = Polygon(h).representative_point().x
        x0, z0, x1, z1 = p.bounds
        todo += polygons(p.intersection(sbox(x0 - 1, z0 - 1, cx, z1 + 1))) + polygons(p.intersection(sbox(cx, z0 - 1, x1 + 1, z1 + 1)))
    out.sort(key=lambda g: (round(g.bounds[0], 2), round(g.bounds[1], 2), round(g.area, 2)))
    return out


def hash01(x, z, k):
    v = (int(x) * 0x9E3779B1 + int(z) * 0x85EBCA77 + int(k) * 0xC2B2AE3D) & 0xFFFFFFFFFFFFFFFF
    v ^= v >> 33
    v = (v * 0xFF51AFD7ED558CCD) & 0xFFFFFFFFFFFFFFFF
    v ^= v >> 33
    v = (v * 0xC4CEB9FE1A85EC53) & 0xFFFFFFFFFFFFFFFF
    v ^= v >> 33
    return (v >> 11) / float(1 << 53)


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def classify(r, area, h, downtown):
    c = (r['class'] or '').lower()
    if c in CIVIC:
        return 'civic', 3
    if c in SHEDS or area < 30:
        return 'shed', 0
    if h >= 45:
        return 'tower', 3
    if h >= 18:
        return 'midrise', 3
    if c in WAREHOUSE or (area > 1500 and h < 12):
        return 'warehouse', 4
    if c in SHOPS or c in ('office', 'hotel') or (downtown and area > 120):
        return 'office-low', 3 if downtown else 4
    if c in ('apartments', 'dormitory') or area > 400:
        return 'apartment', 0
    return 'rowhouse', 0


def lib_versions():
    import PIL
    import zlib
    return {'python': '%d.%d.%d' % sys.version_info[:3], 'duckdb': duckdb.__version__, 'shapely': shapely.__version__,
            'geos': shapely.geos_version_string, 'numpy': np.__version__, 'pillow': PIL.__version__, 'zlib': zlib.ZLIB_RUNTIME_VERSION}


# ------------------------------------------------------------------------------------------------------------- build id
# The DEM a build reads is pinned by a snapshot (dem.py): the S3 listing of every 3DEP 1/3" and 1" file with its ETag,
# stored content-addressed at dem/snapshots/{id}.json in the store. The build record names that id, so the buildId
# changes when the DEM it reads does; every read is If-Match its pinned ETag. The snapshot is the store's
# dem/current.json (compile.py --dem-snapshot lists USGS and points it at a new one) unless HOMETOWN_DEM_SNAPSHOT names one.
class NoDemSnapshot(Exception):
    pass


def dem_snapshot(store):
    sid, snap = demlib.load_snapshot(store, os.environ.get('HOMETOWN_DEM_SNAPSHOT') or None)
    if sid is None:
        raise NoDemSnapshot('no DEM snapshot in the store %s: run tools/hometown/compile.py --dem-snapshot (lists USGS 3DEP once)' % store.root)
    return sid, snap


def build_record(store):
    sid, snap = dem_snapshot(store)
    return {'format': 'hometown-build', 'version': 1, 'grid': grid.GRID, 'compilerVersion': COMPILER_VERSION, 'libs': lib_versions(),
            'image': os.environ.get('HOMETOWN_IMAGE_DIGEST', 'unpinned (local venv %s)' % '.'.join(map(str, sys.version_info[:2]))),
            'overture': OVERTURE_RELEASE,
            'demSnapshot': {'id': sid, 'key': 'dem/snapshots/%s.json' % sid, 'products': {p: len(v) for p, v in sorted(snap['products'].items())},
                            'partial': snap.get('partial') or None,
                            'policy': 'every 3DEP file at its snapshot ETag; range reads If-Match; bytes mirrored at dem/{product}/{name}/{etag}/'}}


def build_id_of(rec):
    return 'htc-%s-%s-b%s' % (COMPILER_VERSION, grid.GRID, hashlib.sha256(jdump(rec).encode()).hexdigest()[:8])


# ------------------------------------------------------------------------------------------------------------- store
class Store:
    def __init__(self, root):
        self.root = root

    def path(self, key):
        return os.path.join(self.root, *key.split('/'))

    def get(self, key):
        p = self.path(key)
        return open(p, 'rb').read() if os.path.exists(p) else None

    def put(self, key, body):
        """Overwrite (only the dem/current.json pointer)."""
        p = self.path(key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = '%s.%d.tmp' % (p, os.getpid())
        with open(tmp, 'wb') as f:
            f.write(body)
        os.replace(tmp, p)

    def put_if_absent(self, key, body):
        p = self.path(key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = '%s.%d.tmp' % (p, os.getpid())
        with open(tmp, 'wb') as f:
            f.write(body)
        try:
            os.link(tmp, p)
            created = True
        except FileExistsError:
            created = False
        os.remove(tmp)
        return created


def tile_key(bid, dom, c, r):
    return 'tiles/%s/%s-%s/0/%d/%d' % (bid, grid.GRID, dom, c, r)


def ctx_key(bid, dom, C, R):
    return 'ctx/%s/%s-%s/4/%d/%d' % (bid, grid.GRID, dom, C, R)


# ------------------------------------------------------------------------------------------------------------- world
class World:
    """Everything a set of tile compiles shares: the regions' rows (projected once), the DEM sampler, the ctx blocks and
    per-feature caches (a segment's pieces, a building's record, a bridge). Every cached value is a pure function of
    one feature and the global data, so a tile compiled in a big World and alone in a small one gives the same bytes."""
    def __init__(self, data, dom, window, store, bid, log=None, dem_store=None, dem_snap=None):
        x0, z0, x1, z1 = window
        self.dom_name = dom
        self.blocks = blocks_for(x0 - LOAD_REACH, z0 - LOAD_REACH, x1 + LOAD_REACH, z1 + LOAD_REACH)
        self.src = Sources(data, dom, self.blocks, skip_missing=True)
        self.d = self.src.dom
        # (the DEM is an input: read through the shared store's dem/ mirror even when the compile's own outputs are not)
        self.dem_store = dem_store or store
        self.dem_snap = dem_snap if dem_snap is not None else (dem_snapshot(self.dem_store)[1] if self.dem_store else None)
        self.dem = Sampler(os.path.join(data, 'dem'), self.dem_store, self.dem_snap)
        self.store, self.bid = store, bid
        self.ctxs = {}
        self.pieces_c, self.junction_c, self.brec_c, self.bridge_c, self.k_c = {}, {}, {}, {}, {}
        self.log = log or (lambda *a: None)

    # ---- ctx
    def ctx_block(self, C, R):
        if (C, R) not in self.ctxs:
            k = ctx_key(self.bid, self.dom_name, C, R)
            b = self.store.get(k) if self.store else None
            if b is None:
                h, bc, pc = context.compile_ctx(self.src, self.dem, C, R, self.bid)
                b = context.pack_ctx(h, bc, pc)
                if self.store:
                    self.store.put_if_absent(k, b)
                    b = self.store.get(k)
            self.ctxs[(C, R)] = context.unpack_ctx(b)
        return self.ctxs[(C, R)]

    def context_for(self, x0, z0, x1, z1):
        return Context({k: self.ctx_block(*k) for k in blocks_for(x0, z0, x1, z1)})

    def k_tile(self, c, r):
        if (c, r) not in self.k_c:
            lon, lat = self.d.inverse([c * TILE + TILE / 2], [r * TILE + TILE / 2])
            self.k_c[(c, r)] = self.d.scale(float(lon[0]), float(lat[0]))
        return self.k_c[(c, r)]

    # ---- roads: a segment's pieces between its connectors (pure per segment)
    def pieces(self, s):
        sid = s['id']
        if sid in self.pieces_c:
            return self.pieces_c[sid]
        out = []
        self.pieces_c[sid] = out
        if s['subtype'] != 'road':
            return out
        cls = s['class'] or 'unknown'
        g = s['geom']
        if cls not in ROAD or s['subclass'] in SKIP_SUBCLASS or g.geom_type != 'LineString':
            return out
        L = g.length
        if L < 0.5:
            return out
        w, lanes, sw, rank = ROAD[cls]
        wr = [r['value'] for r in s['width_rules'] or [] if r.get('value') and not r.get('between')]
        if wr and 3 <= wr[0] <= 40:
            w = float(wr[0])
        d = access_dir(s['access_restrictions'])
        flags = 0
        if s['subclass'] == 'alley':
            flags |= FLAGS['alley']
            w = min(w, 5.0)
        if any((a.get('access_type') == 'allowed' and 'as_private' in ((a.get('when') or {}).get('recognized') or [])) for a in s['access_restrictions'] or []) and cls == 'service':
            flags |= FLAGS['private']
        if flagged(s['road_flags'], 'is_tunnel') and not any(r.get('between') for r in s['road_flags'] or [] if 'is_tunnel' in (r.get('values') or [])):
            flags |= FLAGS['tunnel']
        spans = {'is_bridge': [], 'is_tunnel': []}
        for rr in s['road_flags'] or []:
            for k in spans:
                if k in (rr.get('values') or []):
                    spans[k].append(tuple(rr['between']) if rr.get('between') else (0.0, 1.0))
        if d:
            w = max(6.0, w * 0.6) if lanes >= 4 else w
            lanes = max(1, lanes // 2) if lanes >= 4 else max(1, lanes)
        cs = sorted([(c['at'], c['connector_id']) for c in s['connectors'] or [] if c.get('connector_id') is not None and c.get('at') is not None])
        if len(cs) < 2:
            return out
        verts = shapely.get_coordinates(g)
        name = pretty_raw(s['name'])

        def snap(p):
            dd = np.hypot(verts[:, 0] - p.x, verts[:, 1] - p.y)
            i = int(np.argmin(dd))
            return (cm(verts[i, 0]), cm(verts[i, 1])) if dd[i] < 0.01 else (cm(p.x), cm(p.y))
        k = 0
        for (a0, c0), (a1, c1) in zip(cs, cs[1:]):
            if a1 - a0 <= 1e-9 or c0 == c1:
                continue
            piece = shapely.ops.substring(g, a0 * L, a1 * L)
            if piece.length < 0.3:
                continue
            under = sum(max(0, min(a1, t1) - max(a0, t0)) for t0, t1 in spans['is_tunnel'] if (t0, t1) != (0.0, 1.0))
            if under > 0.5 * (a1 - a0):
                continue
            pts = [(cm(x), cm(z)) for x, z in shapely.get_coordinates(piece.simplify(0.4))]
            pts[0], pts[-1] = snap(Point(piece.coords[0])), snap(Point(piece.coords[-1]))
            # (consecutive duplicate cm points dropped)
            q = [pts[0]]
            for p in pts[1:]:
                if p != q[-1]:
                    q.append(p)
            if len(q) < 2:
                continue
            out.append({'seg': sid, 'i': k, 'a': c0, 'b': c1, 'pts': q, 'w': w, 'lanes': lanes, 'dir': d, 'flags': flags, 'sw': sw,
                        'cls': cls, 'rank': rank, 'name': name})
            k += 1
        # grid-line splits along the whole segment (ordinals count along it, piece after piece)
        ordinal = 0
        for p in out:
            subs, cur, ids = [], [p['pts'][0]], ['c:' + p['a']]
            for (x0, z0), (x1, z1) in zip(p['pts'], p['pts'][1:]):
                for t, axis, kk, pt in grid.crossings((x0, z0), (x1, z1)):
                    if pt == cur[-1]:
                        continue
                    cur.append(pt)
                    subs.append((cur, ids[-1], 'b:%s:%s%d:%d' % (sid, axis, kk, ordinal)))
                    ids.append(subs[-1][2])
                    ordinal += 1
                    cur = [pt]
                if (x1, z1) != cur[-1]:
                    # an interior vertex exactly on a grid line splits too
                    on = grid.on_line(x1, z1) if (x1, z1) != p['pts'][-1] else []
                    cur.append((x1, z1))
                    if on:
                        axis, kk = on[0]
                        subs.append((cur, ids[-1], 'b:%s:%s%d:%d' % (sid, axis, kk, ordinal)))
                        ids.append(subs[-1][2])
                        ordinal += 1
                        cur = [(x1, z1)]
            if len(cur) >= 2:
                subs.append((cur, ids[-1], 'c:' + p['b']))
            p['subs'] = []
            for j, (pts, na, nb) in enumerate(subs):
                (ax, az), (bx, bz) = pts[0], pts[1]
                own = ((ax + bx) // (2 * TCM), (az + bz) // (2 * TCM))
                p['subs'].append({'j': j, 'pts': pts, 'na': na, 'nb': nb, 'own': own})
        return out

    def pieces_near(self, geom):
        out = []
        for s in self.src.query('segments', geom):
            out += self.pieces(s)
        return out

    def junction(self, cid, pos):
        """(control, top rank) of a connector, from every piece that ends there (pure: those segments all pass within
        a centimetre of it)."""
        if cid in self.junction_c:
            return self.junction_c[cid]
        x, z = pos[0] / 100.0, pos[1] / 100.0
        inc = []
        for p in self.pieces_near(Point(x, z).buffer(0.05)):
            if p['a'] == cid:
                inc.append(p)
            if p['b'] == cid:
                inc.append(p)
        inc.sort(key=lambda p: (p['seg'], p['i']))
        drive = [p for p in inc if not p['flags'] & (FLAGS['private'] | FLAGS['pedestrian'])]
        res = (0, 0)
        if len(set(p['name'] for p in drive)) >= 2 and len(drive) >= 3:
            ranks = sorted((p['rank'] for p in drive), reverse=True)
            top = ranks[0]
            if ranks[1] >= 4 and ranks[2] >= 3:
                res = (1, top)
            else:
                ctl = (2 if len(drive) >= 4 else 3) if top <= 2 else 3
                if ctl == 3 and not any(p['rank'] < top for p in inc):
                    ctl = 0
                res = (ctl, top)
        self.junction_c[cid] = res
        return res

    # ---- bridges raised on the ground (pure per segment)
    def bridges(self, s):
        if s['id'] in self.bridge_c:
            return self.bridge_c[s['id']]
        out = []
        self.bridge_c[s['id']] = out
        ps = self.pieces(s)
        if not ps or s['geom'].geom_type != 'LineString':
            return out
        g, L = s['geom'], s['geom'].length
        w = ps[0]['w']
        for rr in s['road_flags'] or []:
            if 'is_bridge' not in (rr.get('values') or []):
                continue
            b0, b1 = tuple(rr['between']) if rr.get('between') else (0.0, 1.0)
            if b1 - b0 <= 1e-6:
                continue
            line = shapely.ops.substring(g, b0 * L, b1 * L)
            if line.length <= 3 or line.length > BRIDGE_MAX:
                continue
            crossing = [p for p in self.pieces_near(line) if p['seg'] != s['id'] and LineString([(x / 100.0, z / 100.0) for x, z in p['pts']]).crosses(line)]
            if crossing:
                continue
            if any(r['poly'].intersects(line.buffer(w / 2 + 10)) for r in water_polys(self.src, line.buffer(w / 2 + 10))):
                continue
            (x0, z0), (x1, z1) = line.coords[0], line.coords[-1]
            lon, lat = self.d.inverse([x0, x1], [z0, z1])
            e = self.dem.sample(lon, lat)
            if np.isfinite(e).all():
                out.append((line, w, float(e[0]), float(e[1])))
        return out

    # ---- terrain: the global post function
    def raw_posts(self, I0, J0, I1, J1, ctx):
        """Raw heights (NAVD88 m, float64) and the wet flags of global posts [I0, I1) x [J0, J1): DEM bilinear at each
        post's lon/lat, water polygons flattened to their ctx level (per post's block), bridges raised."""
        ii, jj = np.meshgrid(np.arange(I0, I1), np.arange(J0, J1))
        X, Z = ii * float(grid.POST), jj * float(grid.POST)
        lon, lat = self.d.inverse(X.ravel(), Z.ravel())
        h = self.dem.sample(lon, lat).reshape(X.shape)
        nan = ~np.isfinite(h)
        h[nan] = 0.0
        wet = np.zeros(X.shape, bool)
        win = sbox(X.min(), Z.min(), X.max(), Z.max())
        BL = context.BLOCK
        Cb, Rb = np.floor_divide(ii * grid.POST, BL), np.floor_divide(jj * grid.POST, BL)
        for r in water_polys(self.src, win):
            inside = shapely.contains_xy(r['poly'], X.ravel(), Z.ravel()).reshape(X.shape) & ~wet
            if not inside.any():
                continue
            for C, R in sorted(set(zip(Cb[inside].tolist(), Rb[inside].tolist()))):
                lv = ctx.level(r['id'], C, R)
                if lv is None:
                    continue
                sel = inside & (Cb == C) & (Rb == R)
                h[sel] = lv / 100.0
                wet |= sel
        for s in self.src.query('segments', win.buffer(30)):
            for line, w, e0, e1 in self.bridges(s):
                bx0, bz0, bx1, bz1 = line.bounds
                reach = w / 2 + 10
                ci = (X[0] >= bx0 - reach) & (X[0] <= bx1 + reach)
                cj = (Z[:, 0] >= bz0 - reach) & (Z[:, 0] <= bz1 + reach)
                if not ci.any() or not cj.any():
                    continue
                XX, ZZ = np.meshgrid(X[0][ci], Z[:, 0][cj])
                pts = shapely.points(XX.ravel(), ZZ.ravel())
                dd = shapely.distance(line, pts).reshape(XX.shape)
                t = shapely.line_locate_point(line, pts, normalized=True).reshape(XX.shape)
                deck = e0 + (e1 - e0) * t
                core = w / 2 + 1.5
                target = np.where(dd <= core, deck, deck - (dd - core) * 0.7)
                sub = h[np.ix_(cj, ci)]
                h[np.ix_(cj, ci)] = np.where((dd <= reach) & ~wet[np.ix_(cj, ci)], np.maximum(sub, target), sub)
        return h, wet, int(nan.sum())

    def posts_cm(self, I0, J0, I1, J1, ctx):
        """Final post heights, int cm (NAVD88), of global posts [I0, I1) x [J0, J1): the raw posts blurred (sigma 1
        post, land only) with a 2-post halo, then quantised half-even. Pure per post."""
        H = 2
        h, wet, nan = self.raw_posts(I0 - H, J0 - H, I1 + H, J1 + H, ctx)
        K = np.array([0.0545, 0.2442, 0.4026, 0.2442, 0.0545])

        def blur(src, axis):
            num = np.zeros_like(src)
            den = np.zeros_like(src)
            n = src.shape[axis]
            for d in range(-2, 3):
                sd, ss = [slice(None)] * 2, [slice(None)] * 2
                if d < 0:
                    sd[axis], ss[axis] = slice(-d, n), slice(0, n + d)
                else:
                    sd[axis], ss[axis] = slice(0, n - d), slice(d, n)
                ok = ~wet[tuple(ss)]
                num[tuple(sd)] += np.where(ok, src[tuple(ss)], 0) * K[d + 2]
                den[tuple(sd)] += ok * K[d + 2]
            out = np.where(den > 0, num / np.maximum(den, 1e-9), src)
            return np.where(wet, src, out)
        hb = blur(blur(h, 1), 0)
        hb = hb[H:-H, H:-H]
        return np.rint(hb * 100).astype(np.int64), wet[H:-H, H:-H], nan

    # ---- buildings (pure per building)
    def brec(self, r, ctx, centres):
        bid = r['id']
        if bid in self.brec_c:
            return self.brec_c[bid]
        self.brec_c[bid] = None
        if r['is_underground']:
            return None
        own = building_owner_cm(r)
        if own is None:
            return None
        g = largest_polygon(r['geom'])
        if g is None:
            return None
        wg = largest_polygon(g.buffer(0))
        if wg is None or wg.is_empty or wg.area < 8:
            return None
        wg = Polygon(wg.exterior).simplify(0.25)
        if wg.is_empty or wg.geom_type != 'Polygon':
            return None
        bx0, bz0, bx1, bz1 = wg.bounds
        near = self.pieces_near(sbox(bx0 - 15, bz0 - 15, bx1 + 15, bz1 + 15))
        parts = []
        for p in sorted(near, key=lambda p: (p['seg'], p['i'])):
            if p['flags'] & FLAGS['pedestrian']:
                continue
            pg = LineString([(x / 100.0, z / 100.0) for x, z in p['pts']]).buffer(p['w'] / 2 + max(p['sw'], 0.6), quad_segs=4)
            if pg.intersects(wg):
                parts.append(pg)
        if parts:
            hit = unary_union(parts)
            inter = hit.intersection(wg).area
            if inter > 0.35 * wg.area:
                return None
            if inter > 0:
                g2 = wg.difference(hit.buffer(0.3))
                g2 = max(polygons(g2), key=lambda p: (p.area, p.bounds)) if not g2.is_empty else None
                if g2 is None or g2.area < 8:
                    return None
                wg = Polygon(g2.exterior).simplify(0.25)
        oc = (floor_div(own[0], own[2], TCM), floor_div(own[1], own[2], TCM))
        ci, cj = floor_div(own[0], own[2], context.CELL), floor_div(own[1], own[2], context.CELL)
        k = self.k_tile(*oc)
        dsum = ctx.bdensity_sum(ci, cj)
        dens = dsum / ((2.048 / k) ** 2)
        wgt = smoothstep(800, 1600, dens)
        area = wg.area
        gx, gs = own[0] // own[2], own[1] // own[2]
        dt = downtown_at(centres, gx, gs)
        h = r['height']
        if h is None and r['num_floors']:
            h = r['num_floors'] * 3.3 + 0.8
        if h is None:
            sparse = 4.5 if area < 250 else 7.0 if area < 1500 else 9.0
            dense = 6.5 if area < 60 else 8.5 if area < 250 else 9.5 if area < 1500 else 9.0
            h = sparse + (dense - sparse) * wgt
        h = float(h)
        btype, pal = classify(r, area, h, dt)
        h = max(h, 3.4 if btype in ('rowhouse', 'shed') else 4.0)
        rec = {'id': bid, 'g': wg, 'own': oc, 'gx': gx, 'gs': gs, 'h': h, 'btype': btype, 'pal': pal, 'downtown': dt, 'area': area,
               'shops': 1 if (r['class'] or '') in SHOPS or (dt and btype == 'office-low') else 0,
               'stories': r['num_floors'] or max(1, int(round(h / 3.4))), 'peakAdd': 1.6 if btype == 'rowhouse' and area < 300 else 0.6,
               'heightFromOverture': r['height'] is not None}
        self.brec_c[bid] = rec
        return rec


# ------------------------------------------------------------------------------------------------------------- one tile
def htl1(header, sections):
    """HTL1: 'HTL1', u32 header length, the header JSON (padded to 4 bytes), then the sections back to back; gzipped."""
    body, meta, off = [], [], 0
    for name, enc, b in sections:
        meta.append({'name': name, 'enc': enc, 'offset': off, 'bytes': len(b)})
        body.append(b)
        off += len(b)
        pad = (4 - off % 4) % 4
        if pad:
            body.append(b'\0' * pad)
            off += pad
    header = dict(header, sections=meta)
    js = jdump(header).encode()
    pad = (4 - len(js) % 4) % 4
    return gz(b'HTL1' + struct.pack('<I', len(js) + pad) + js + b' ' * pad + b''.join(body))


def compile_tile(Wd, c, r):
    """The tile (c, r) of Wd's domain -> (gz HTL1 bytes, summary). Reads only: rows within the tile's halos (Sources
    queries, sorted by id), the ctx blocks within CTX_REACH and the DEM under its posts."""
    t0 = time.time()
    d, dom = Wd.d, Wd.dom_name
    X0, Z0, X1, Z1 = c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE
    Wd.src.require(X0 - LOAD_REACH, Z0 - LOAD_REACH, X1 + LOAD_REACH, Z1 + LOAD_REACH, 'tile %d,%d' % (c, r))
    ctx = Wd.context_for(X0 - CTX_REACH, Z0 - CTX_REACH, X1 + CTX_REACH, Z1 + CTX_REACH)
    ctx_ids = sorted('%s-%s/4/%d/%d' % (grid.GRID, dom, C, R) for C, R in ctx.blocks)
    Wd.dem.used = {}
    TB = sbox(X0, Z0, X1, Z1)
    cells = context.CELL / 100.0
    centres = ctx.centres(int((X0 - CENTRE_REACH) // cells), int((Z0 - CENTRE_REACH) // cells), int((X1 + CENTRE_REACH) // cells), int((Z1 + CENTRE_REACH) // cells))
    lon_c, lat_c = d.inverse([X0 + TILE / 2], [Z0 + TILE / 2])
    lon_c, lat_c = float(lon_c[0]), float(lat_c[0])
    k_tile = Wd.k_tile(c, r)
    # ---- roads
    win_roads = TB.buffer(ROAD_HALO, join_style='mitre')
    pieces = Wd.pieces_near(win_roads)
    links, nodes = [], {}

    def node(nid, pt):
        if nid not in nodes:
            n = {'id': nid, 'u': pt[0] - c * TCM, 'v': pt[1] - r * TCM}
            if nid.startswith('c:'):
                ctl, _ = Wd.junction(nid[2:], pt)
                n['control'] = ctl
                n['own'] = list(grid.tile_of(*pt)) == [c, r]
            else:
                n['border'] = True
            nodes[nid] = n
        return nid
    for p in pieces:
        for sb in p['subs']:
            if sb['own'] != (c, r):
                continue
            pts = sb['pts']
            stops = []
            for end, nid in (('a', sb['na']), ('b', sb['nb'])):
                stop = 0
                if nid.startswith('c:'):
                    ctl, top = Wd.junction(nid[2:], pts[0] if end == 'a' else pts[-1])
                    stop = 1 if ctl in (2, 3) and (ctl == 2 or p['rank'] < top) else 0
                stops.append(stop)
            links.append({'a': node(sb['na'], pts[0]), 'b': node(sb['nb'], pts[-1]), 'pts': [[x - c * TCM, z - r * TCM] for x, z in pts],
                          'w': p['w'], 'lanes': p['lanes'], 'dir': p['dir'], 'flags': p['flags'], 'sw': p['sw'], 'cls': p['cls'], 'rank': p['rank'],
                          'name': p['name'], 'seg': p['seg'], 'piece': p['i'], 'sub': sb['j'], 'stopA': stops[0], 'stopB': stops[1]})
    links.sort(key=lambda l: (l['seg'], l['piece'], l['sub']))
    # ---- curb islands over the tile + ISLAND_HALO, classified before the clip
    WB = TB.buffer(ISLAND_HALO, join_style='mitre')
    waters = water_polys(Wd.src, WB)
    roads_poly = []
    for p in sorted(pieces, key=lambda p: (p['seg'], p['i'])):
        if p['flags'] & FLAGS['pedestrian']:
            continue
        roads_poly.append(LineString([(x / 100.0, z / 100.0) for x, z in p['pts']]).buffer(p['w'] / 2, quad_segs=4))
    roadway = unary_union(roads_poly) if roads_poly else Polygon()
    land = WB
    WB10 = TB.buffer(ISLAND_HALO + 10, join_style='mitre')
    if waters:
        land = land.difference(unary_union([w['poly'].intersection(WB10) for w in waters]).buffer(1.5))
    raised = land.difference(roadway)
    parks = []
    for lu in Wd.src.query('land_use', WB):
        if lu['subtype'] not in PARK_SUB and lu['class'] not in PARK_CLASS:
            continue
        g = lu['geom']
        if g.geom_type not in ('Polygon', 'MultiPolygon'):
            continue
        pg = g.buffer(0)
        if pg.area < 200:
            continue
        parks.append((lu, pg))
    park_union = unary_union([pg for _, pg in parks]) if parks else None
    wb_edge = WB.exterior
    islands = []   # (unclipped polygon, kind)
    for pp in sorted(polygons(raised), key=lambda g: (round(g.bounds[0], 2), round(g.bounds[1], 2), round(g.area, 2))):
        if pp.area < 6:
            continue
        mrr = pp.minimum_rotated_rectangle
        sides = sorted(LineString(mrr.exterior.coords[i:i + 2]).length for i in range(2)) if mrr.geom_type == 'Polygon' else [0, 0]
        if pp.distance(wb_edge) < 1e-6:
            # (cut by the window: its area is the window's, not its own, so it counts as large; but a strip narrower
            # than 6 m is a median whatever its length, and its width is the same in every window that holds it)
            kind = 'island' if sides[0] < 6 else 'block'
        else:
            kind = 'island' if (pp.area < 120 or sides[0] < 6) else 'block'
        islands.append((pp, kind))
    blocks = []
    for pp, kind in islands:
        if not pp.intersects(TB):
            continue
        for part in polygons(pp.intersection(TB)):
            for piece in cut_holes(part):
                piece = piece.simplify(0.3)
                for q in polygons(piece):
                    if q.area < 6:
                        continue
                    pts = neg_ring(list(q.exterior.coords))
                    if len(pts) < 3:
                        continue
                    ring = [(cm(x) - c * TCM, cm(z) - r * TCM) for x, z in pts]
                    cut = []
                    for i in range(len(ring)):
                        (ua, va), (ub, vb) = ring[i], ring[(i + 1) % len(ring)]
                        on = (ua == ub and ua in (0, TCM)) or (va == vb and va in (0, TCM))
                        cut.append(1 if on else 0)
                    share, pname = 0.0, ''
                    if park_union is not None:
                        share = q.intersection(park_union).area / q.area
                        if share > 0.5:
                            rp = q.representative_point()
                            pname = next((lu['name'] for lu, pg in parks if lu['name'] and pg.contains(rp)), '') or ''
                    theta = dominant_angle(pts) % (math.pi / 2)
                    bx0, bz0, bx1, bz1 = q.bounds
                    rect = q.area / max(1e-9, (bx1 - bx0) * (bz1 - bz0)) > 0.97
                    blocks.append({'ring': [v for p in ring for v in p], 'cut': cut, 'kind': kind, 'park': round(share, 2) if share > 0.5 else 0,
                                   'parkName': pname if share > 0.5 else '', 'rect': 1 if rect else 0, 'theta': round(theta, 4)})
    # ---- terrain posts (the tile's 257 x 257 and a POST_HALO window round it for building bases and slopes)
    hp = POST_HALO // grid.POST
    PI0, PJ0 = c * (grid.POSTS - 1) - hp, r * (grid.POSTS - 1) - hp
    PW = grid.POSTS + 2 * hp
    hcm, wetp, nan = Wd.posts_cm(PI0, PJ0, PI0 + PW, PJ0 + PW, ctx)
    tpost = hcm[hp:hp + grid.POSTS, hp:hp + grid.POSTS]

    def ground(xs, zs):
        """Bilinear post heights (m) at grid-metre points inside the post window."""
        fi = np.asarray(xs) / grid.POST - PI0
        fj = np.asarray(zs) / grid.POST - PJ0
        i = np.clip(np.floor(fi).astype(int), 0, PW - 2)
        j = np.clip(np.floor(fj).astype(int), 0, PW - 2)
        tx, tz = fi - i, fj - j
        Hm = hcm / 100.0
        a = Hm[j, i] * (1 - tx) + Hm[j, i + 1] * tx
        b = Hm[j + 1, i] * (1 - tx) + Hm[j + 1, i + 1] * tx
        return a * (1 - tz) + b * tz

    # ---- buildings: owned by the tile holding the full footprint's centroid
    brecs_near = {}
    tb28 = TB.buffer(28, join_style='mitre')
    for b in Wd.src.query('buildings', TB.buffer(29, join_style='mitre'), predicate=None):
        o = building_owner_cm(b) if not b['is_underground'] else None
        if o is None:
            continue
        mine = (floor_div(o[0], o[2], TCM), floor_div(o[1], o[2], TCM)) == (c, r)
        if not mine and not b['geom'].intersects(TB.buffer(29, join_style='mitre')):
            continue
        rec = Wd.brec(b, ctx, centres)
        if rec is not None and (mine or rec['g'].intersects(tb28)):
            # (a centroid farther than CENTRE_REACH - 350 m off the tile could miss a centre: never, the footprint meets
            # the tile + 29 m)
            brecs_near[b['id']] = (b, rec)
    owned, foreign = [], set()
    for bid in sorted(brecs_near):
        b, rec = brecs_near[bid]
        if rec['own'] == (c, r):
            owned.append((b, rec))
        elif rec['g'].intersects(TB):
            foreign.add(grid.tile_id(dom, *rec['own']))
    bout, bverts = [], []
    for b, rec in owned:
        g = rec['g']
        pts = neg_ring(list(g.exterior.coords))
        xs, zs = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
        bb = g.bounds
        if bb[0] < PI0 * 2 or bb[1] < PJ0 * 2 or bb[2] > (PI0 + PW - 1) * 2 or bb[3] > (PJ0 + PW - 1) * 2:
            # (a footprint past the post window: the post function evaluated over its own bbox)
            qi0, qj0 = int(bb[0] // 2) - 1, int(bb[1] // 2) - 1
            qi1, qj1 = int(bb[2] // 2) + 3, int(bb[3] // 2) + 3
            hh, _, _ = Wd.posts_cm(qi0, qj0, qi1, qj1, ctx)
            fi, fj = np.append(xs, rec['gx'] / 100.0) / 2 - qi0, np.append(zs, rec['gs'] / 100.0) / 2 - qj0
            i, j = np.floor(fi).astype(int), np.floor(fj).astype(int)
            tx, tz = fi - i, fj - j
            Hm = hh / 100.0
            gr = (Hm[j, i] * (1 - tx) + Hm[j, i + 1] * tx) * (1 - tz) + (Hm[j + 1, i] * (1 - tx) + Hm[j + 1, i + 1] * tx) * tz
        else:
            gr = ground(np.append(xs, rec['gx'] / 100.0), np.append(zs, rec['gs'] / 100.0))
        base = float(gr.min())
        rise = min(8.0, float(gr.max()) - base)
        theta = -dominant_angle(pts)
        start = len(bverts) // 2
        for x, z in pts:
            bverts += [cm(x) - c * TCM, cm(z) - r * TCM]
        bout.append({'id': rec['id'], 'base': cm(base), 'roof': cm(base + rise + rec['h']), 'peak': cm(base + rise + rec['h'] + rec['peakAdd']),
                     'ringStart': start, 'ringCount': len(pts), 'theta': round(theta, 4), 'shops': rec['shops'], 'type': BTYPES.index(rec['btype']),
                     'palette': rec['pal'], 'stories': int(rec['stories']), 'fromOverture': 1 if rec['heightFromOverture'] else 0,
                     'downtown': 1 if rec['downtown'] else 0})
    # ---- paved lots (footprints within 25 m, buffered 8 / 12 m) and the sidewalk bands
    paved = [rec['g'].buffer(12 if rec['downtown'] else 8, quad_segs=2) for bid, (b, rec) in sorted(brecs_near.items()) if rec['btype'] not in ('rowhouse', 'shed')]
    paved_u = unary_union(paved) if paved else None
    bands = []
    for p in sorted(pieces, key=lambda p: (p['seg'], p['i'])):
        if p['sw'] <= 0 or p['flags'] & FLAGS['pedestrian']:
            continue
        bands.append(LineString([(x / 100.0, z / 100.0) for x, z in p['pts']]).buffer(p['w'] / 2 + p['sw'], quad_segs=4))
    band = unary_union(bands) if bands else None
    # ---- ground mask: 512 x 512 global 1 m cells
    img = Image.new('L', (TILE, TILE), MASK['asphalt'])
    dr = ImageDraw.Draw(img)
    tb40 = TB.buffer(40, join_style='mitre')

    def poly(draw, ring, v):
        draw.polygon([((x - X0), (z - Z0)) for x, z in ring], fill=v)
    for pp, kind in islands:
        if pp.intersects(tb40):
            for q in polygons(pp.intersection(tb40)):
                poly(dr, list(q.exterior.coords), MASK['sidewalk'] if kind == 'island' else MASK['lawn'])
                for hole in q.interiors:
                    poly(dr, list(hole.coords), MASK['asphalt'])
    if paved_u is not None:
        for pp in polygons(paved_u.intersection(tb40)):
            poly(dr, list(pp.exterior.coords), MASK['sidewalk'])
    if band is not None:
        for g in polygons(band.intersection(tb40)):
            poly(dr, list(g.exterior.coords), MASK['sidewalk'])
            for hole in g.interiors:
                poly(dr, list(hole.coords), 255)
    a = np.array(img, dtype=np.uint8)
    a[a == 255] = MASK['lawn']
    road = Image.new('L', (TILE, TILE), 0)
    rd = ImageDraw.Draw(road)
    for g in polygons(roadway.intersection(tb40)):
        poly(rd, list(g.exterior.coords), 1)
        for hole in g.interiors:
            poly(rd, list(hole.coords), 0)
    a[np.array(road, dtype=bool)] = MASK['asphalt']
    xs = X0 + np.arange(TILE) + 0.5
    zs = Z0 + np.arange(TILE) + 0.5
    XX, ZZ = np.meshgrid(xs, zs)
    gxr = (ground(XX + 1, ZZ) - ground(XX - 1, ZZ)) / 2
    gzr = (ground(XX, ZZ + 1) - ground(XX, ZZ - 1)) / 2
    a[(np.hypot(gxr, gzr) > 0.7) & (a == MASK['lawn'])] = MASK['rock']
    wsec = []
    if waters:
        wu = unary_union([w['poly'].intersection(tb40) for w in waters])
        near = shapely.contains_xy(wu.buffer(3.0), XX.ravel(), ZZ.ravel()).reshape(XX.shape)
        a[near] = MASK['waterEdge']
        BL = context.BLOCK
        for w in waters:
            inside = shapely.contains_xy(w['poly'], XX.ravel(), ZZ.ravel()).reshape(XX.shape)
            a[inside] = MASK['water']
            if not w['poly'].intersects(TB):
                continue
            lv = ctx.level(w['id'], X0 // BL, Z0 // BL)
            rings = []
            for q in polygons(w['poly'].intersection(TB)):
                rings.append([v for x, z in neg_ring(list(q.simplify(0.5).exterior.coords)) for v in (cm(x) - c * TCM, cm(z) - r * TCM)])
            wsec.append({'id': w['id'], 'level_cm': lv, 'cells': int(inside.sum()), 'rings': rings, 'name': w['name'] or ''})
    # ---- trees: a global 13 m lattice over the lawns (yards: 3 m clear of a building, within 25 m of one, off lots)
    STEP = 13.0
    desert = lon_c < -104 and lat_c < 37.5
    btree = shapely.STRtree([rec['g'] for _, (b, rec) in sorted(brecs_near.items())]) if brecs_near else None
    ptree = shapely.STRtree(polygons(paved_u)) if paved_u is not None else None
    trees = []
    for pp, kind in islands:
        if kind == 'island' or pp.area < 250 or not pp.intersects(TB):
            continue
        inner = pp.buffer(-2.0)
        if inner.is_empty or not inner.intersects(TB):
            continue
        x0, z0, x1, z1 = inner.intersection(TB).bounds
        cand = []
        for j in range(math.floor(z0 / STEP), math.floor(z1 / STEP) + 1):
            for i in range(math.floor(x0 / STEP), math.floor(x1 / STEP) + 1):
                if hash01(i, j, 3 ^ d.index) > 0.42:
                    continue
                x = (i + 0.15 + 0.7 * hash01(i, j, 1 ^ d.index)) * STEP
                z = (j + 0.15 + 0.7 * hash01(i, j, 2 ^ d.index)) * STEP
                if X0 <= x < X1 and Z0 <= z < Z1:
                    cand.append((x, z, i, j))
        if not cand:
            continue
        pts = shapely.points(np.array([(q[0], q[1]) for q in cand]))
        ok = shapely.contains(inner, pts)
        for kk, q in enumerate(cand):
            if not ok[kk]:
                continue
            pt = pts[kk]
            if btree is None or len(btree.query(pt.buffer(3.0), predicate='intersects')) or not len(btree.query(pt.buffer(25.0), predicate='intersects')):
                continue
            if ptree is not None and len(ptree.query(pt, predicate='intersects')):
                continue
            hh = hash01(q[2], q[3], 4 ^ d.index)
            cls = (2 if hh < 0.55 else 0) if desert else (0 if hh < 0.5 else 1 if hh < 0.85 else 4)
            trees.append((cm(q[0]) - c * TCM, cm(q[1]) - r * TCM, cls, int(12 + 30 * hash01(q[2], q[3], 5 ^ d.index))))
    trees.sort()
    # ---- places (POIs owned by the tile)
    places = []
    for p in Wd.src.places_in(TB):
        if not (X0 * 100 <= p['gx'] < X1 * 100 and Z0 * 100 <= p['gs'] < Z1 * 100):
            continue
        cat = p['basic_category'] or p['cat'] or ''
        if not cat or (p['confidence'] or 0) < 0.45 or (p['operating_status'] and p['operating_status'] != 'open'):
            continue
        kind = cat if cat in GENERIC else next((k for k in GENERIC if k in cat), None)
        if not kind:
            continue
        places.append({'id': p['id'], 'u': p['gx'] - c * TCM, 'v': p['gs'] - r * TCM, 'kind': kind, 'name': p['name'] if (kind in PUBLIC and p['name']) else ''})
    # ---- parks (clipped, for the map)
    psec = []
    for lu, pg in parks:
        if not pg.intersects(TB):
            continue
        for q in polygons(pg.intersection(TB)):
            if q.area < 1:
                continue
            psec.append({'id': lu['id'], 'name': lu['name'] or '', 'cat': lu['subtype'] or lu['class'] or 'park',
                         'ring': [v for x, z in neg_ring(list(q.exterior.coords)) for v in (cm(x) - c * TCM, cm(z) - r * TCM)]})
    # ---- sections
    base = int(tpost.min())
    rel = tpost - base
    if rel.max() <= 65535:
        terr = ('terrain', 'u16', rel.astype('<u2').tobytes())
    else:
        terr = ('terrain', 'i32', tpost.astype('<i4').tobytes())
    nodes_out = [nodes[k] for k in sorted(nodes)]
    sections = [
        terr,
        ('mask', 'u8', a.tobytes()),
        ('buildings', 'json', jdump(bout).encode()),
        ('bverts', 'i32', np.array(bverts, dtype='<i4').tobytes()),
        ('roads', 'json', jdump({'nodes': nodes_out, 'links': links}).encode()),
        ('blocks', 'json', jdump(blocks).encode()),
        ('trees', 'i32', np.array(trees, dtype='<i4').reshape(-1).tobytes()),
        ('places', 'json', jdump(places).encode()),
        ('water', 'json', jdump(wsec).encode()),
        ('parks', 'json', jdump(psec).encode()),
    ]
    header = {'format': 'hometown-tile', 'version': 1, 'grid': grid.GRID, 'domain': dom, 'L': 0, 'c': c, 'r': r, 'id': grid.tile_id(dom, c, r),
              'buildId': Wd.bid, 'compiler': COMPILER_VERSION, 'demSource': Wd.dem.sources(), 'vdatum': 'NAVD88 (3DEP), no datum shift',
              'posts': grid.POSTS, 'post': grid.POST, 'mask': {'cell': 1, 'n': TILE, 'classes': list(MASK)}, 'base_cm': base,
              'bcount': len(bout), 'groundAreaM2': round((TILE / k_tile) ** 2, 1), 'k_tile': round(k_tile, 9), 'gamma_tile': round(d.gamma(lon_c), 6),
              'centre': [round(lon_c, 7), round(lat_c, 7)], 'waters': [{'id': w['id'], 'level_cm': w['level_cm'], 'cells': w['cells']} for w in wsec],
              'foreign': sorted(foreign), 'ctx': ctx_ids, 'noDemPosts': nan, 'desert': desert,
              'counts': {'links': len(links), 'nodes': len(nodes_out), 'blocks': len(blocks), 'trees': len(trees), 'places': len(places)}}
    if nan == wetp.size:
        raise RefusedTile('tile %s: no 3DEP data under any post (%s)' % (grid.tile_id(dom, c, r), '; '.join(sorted(Wd.dem.missing)) or 'outside the DEM'))
    out = htl1(header, sections)
    return out, {'id': header['id'], 'bytes': len(out), 'ms': round((time.time() - t0) * 1000), **header['counts'], 'buildings': len(bout)}


class RefusedTile(Exception):
    pass


def read_htl1(b):
    raw = gzip.decompress(b)
    assert raw[:4] == b'HTL1'
    n = struct.unpack('<I', raw[4:8])[0]
    h = json.loads(raw[8:8 + n])
    o = 8 + n
    sec = {}
    for s in h['sections']:
        v = raw[o + s['offset']:o + s['offset'] + s['bytes']]
        if s['enc'] == 'json':
            v = json.loads(v)
        elif s['enc'] == 'u16':
            v = np.frombuffer(v, dtype='<u2').astype(np.int64)
        elif s['enc'] == 'i32':
            v = np.frombuffer(v, dtype='<i4').astype(np.int64)
        elif s['enc'] == 'u8':
            v = np.frombuffer(v, dtype=np.uint8)
        sec[s['name']] = v
    t = sec['terrain'].reshape(h['posts'], h['posts'])
    sec['terrain_cm'] = t + h['base_cm'] if [s for s in h['sections'] if s['name'] == 'terrain'][0]['enc'] == 'u16' else t
    sec['mask'] = sec['mask'].reshape(grid.TILE, grid.TILE)
    return h, sec, raw


# ------------------------------------------------------------------------------------------------------------- CLI glue
def default_paths():
    root = os.path.abspath(os.path.join(HERE, '../..'))
    return {'data': os.path.join(root, '.scratch/hometown-m2/data'), 'store': os.path.join(root, '.scratch/hometown/store'),
            'out': os.path.join(root, 'cities/pkg/packages')}


def register_build(store):
    rec = build_record(store)
    bid = build_id_of(rec)
    store.put_if_absent('builds/%s.json' % bid, (jdump(rec) + '\n').encode())
    return bid, rec


def tile_window(c0, r0, c1, r1):
    return c0 * TILE, r0 * TILE, (c1 + 1) * TILE, (r1 + 1) * TILE


def far_tiles(dom, bid, data, store, keys, log=print, dem_store=None):
    """Far tiles [(tier, C, R)] -> {key: gzipped SFB1 bytes}, compiled or read from the store (far.py)."""
    Wd = None
    out = {}
    for tier, C_, R_ in keys:
        k = farlib.far_key(bid, dom, tier, C_, R_)
        b = store.get(k) if store else None
        if b is None:
            if Wd is None:
                dsn = dem_snapshot(dem_store or store)[1]
                Wd = Sampler(os.path.join(data, 'dem'), dem_store or store, dsn, product='1')
            t0 = time.time()
            b = gz(farlib.compile_far(dom, tier, C_, R_, Wd, bid))
            if store:
                store.put_if_absent(k, b)
                b = store.get(k)
            log(jdump({'far': k, 'bytes': len(b), 'ms': round((time.time() - t0) * 1000)}))
        out[(tier, C_, R_)] = b
    return out


def compile_tiles(Wd, store, tiles, log=print):
    """Compile (or read from the store) each (c, r); children stored ifAbsent. -> {(c, r): bytes}"""
    out = {}
    for c, r in tiles:
        k = tile_key(Wd.bid, Wd.dom_name, c, r)
        b = store.get(k) if store else None
        if b is None:
            b, info = compile_tile(Wd, c, r)
            if store:
                store.put_if_absent(k, b)
                b = store.get(k)
            log(jdump(info))
        out[(c, r)] = b
    return out


if __name__ == '__main__':
    P = default_paths()
    ap = argparse.ArgumentParser()
    ap.add_argument('--tile')
    ap.add_argument('--block')
    ap.add_argument('--ctx')
    ap.add_argument('--far', help='one far tile hg1-{d}/{3|5}/{C}/{R} (far.py)')
    ap.add_argument('--descriptor')
    ap.add_argument('--stage', type=int, default=2)
    ap.add_argument('--id')
    ap.add_argument('--name')
    ap.add_argument('--out', default=None)
    ap.add_argument('--data', default=P['data'])
    ap.add_argument('--store', default=P['store'])
    ap.add_argument('--places', default=os.path.join(HERE, 'places.json'))
    ap.add_argument('--no-store', action='store_true', help='--tile: compile without reading or writing the store (ctx included)')
    ap.add_argument('--print-build', action='store_true', help='the buildId and its record (the tile service registers it)')
    ap.add_argument('--dem-snapshot', action='store_true', help='list USGS 3DEP (1/3" and 1") once, store the snapshot, make it current')
    ap.add_argument('--dem-snapshot-from-mirror', action='store_true', help='offline: a partial snapshot of the files the local mirror holds')
    a = ap.parse_args()
    store = Store(os.path.abspath(a.store))
    if a.dem_snapshot or a.dem_snapshot_from_mirror:
        snap = demlib.list_snapshot() if a.dem_snapshot else demlib.snapshot_from_mirror(os.path.join(a.data, 'dem'))
        sid = demlib.store_snapshot(store, snap)
        print(jdump({'demSnapshot': sid, 'files': {p: len(v) for p, v in snap['products'].items()}}))
        sys.exit(0)
    bid, rec = register_build(store)
    if a.print_build:
        print(jdump({'buildId': bid, 'record': rec}))
        sys.exit(0)
    log = lambda s: print(s, file=sys.stderr, flush=True)  # noqa: E731
    try:
        if a.tile:
            dom, L, c, r = grid.parse_tile_id(a.tile)
            assert L == 0, 'tiles are L0'
            Wd = World(a.data, dom, tile_window(c, r, c, r), None if a.no_store else store, bid, dem_store=store)
            b, info = compile_tile(Wd, c, r)
            log(jdump(info))
            if a.out in (None, '-'):
                sys.stdout.buffer.write(b)
            else:
                open(a.out, 'wb').write(b)
        elif a.block:
            dom, L, C, R = grid.parse_tile_id(a.block)
            assert L == grid.BLOCK_L, 'blocks are L2'
            n = 1 << L
            Wd = World(a.data, dom, tile_window(C * n, R * n, C * n + n - 1, R * n + n - 1), store, bid)
            kids = [(c, r) for r in range(R * n, R * n + n) for c in range(C * n, C * n + n)]
            if a.out == '-':
                # HTB1 on stdout (the tile service's block contract, server/tiles/src/compilers/subprocess.mjs): per child
                # u32 id length, id, u32 body length (0xffffffff: refused, then u32 reason length, reason), body
                w = sys.stdout.buffer
                w.write(b'HTB1')
                for c, r in kids:
                    tid = grid.tile_id(dom, c, r).encode()
                    w.write(struct.pack('<I', len(tid)) + tid)
                    try:
                        b = compile_tiles(Wd, store, [(c, r)], log)[(c, r)]
                        w.write(struct.pack('<I', len(b)) + b)
                    except (RefusedTile, MissingRegion) as e:
                        why = str(e).encode()
                        w.write(struct.pack('<II', 0xffffffff, len(why)) + why)
                w.flush()
            else:
                compile_tiles(Wd, store, kids, log)
                print(jdump({'block': a.block, 'buildId': bid}))
        elif a.far:
            dom, tier, C_, R_ = farlib.parse_far_id(a.far)
            b = far_tiles(dom, bid, a.data, None if a.no_store else store, [(tier, C_, R_)], log, dem_store=store)[(tier, C_, R_)]
            if a.out in (None, '-'):
                sys.stdout.buffer.write(b)
            else:
                open(a.out, 'wb').write(b)
        elif a.ctx:
            dom, L, C, R = grid.parse_tile_id(a.ctx)
            assert L == grid.CTX_L
            B = TILE << L
            Wd = World(a.data, dom, (C * B + LOAD_REACH, R * B + LOAD_REACH, (C + 1) * B - LOAD_REACH, (R + 1) * B - LOAD_REACH), store, bid)
            h = Wd.ctx_block(C, R)[0]
            if a.out == '-':
                sys.stdout.buffer.write(store.get(ctx_key(bid, dom, C, R)))
            else:
                print(jdump({'ctx': a.ctx, 'buildId': bid, 'waters': len(h['wlev'])}))
        elif a.descriptor or a.id or a.print_build:
            import assemble
            pid = a.descriptor or a.id
            if a.descriptor and a.stage == 1:
                print(jdump(assemble.stage1(pid, json.load(open(a.places))['places'], bid)))
            else:
                assemble.compile_place(pid, json.load(open(a.places))['places'], a.data, store, bid, a.out or (P['out'] if a.id else None), log=log)
        else:
            ap.error('--tile, --block, --ctx, --descriptor or --id')
    except (MissingRegion, RefusedTile) as e:
        print(jdump({'refused': str(e)}), file=sys.stderr)
        sys.exit(3)
