# tools/hometown/compile.py: Hometown compiler v0. One place's raw open data (fetch.py: Overture Maps buildings,
# transportation, places and base themes; USGS 3DEP 1/3" elevation) -> a versioned city package that Mog City's San
# Francisco engine base plays through the world contract (wagmi/world/pkg.js, ?city=pkg&pkg=<id>).
#
#   python compile.py --id okemah [--name "Okemah, OK"] [--data <raw dir>] [--out <packages dir>]
#
# Package (docs: tools/hometown/README.md), every file deterministic (same inputs + COMPILER_VERSION -> same bytes):
#   manifest.json        compiler version, source dataset versions, attribution, frame, tiles, counts, sizes
#   geodata.js           window.NYC.GEO (the SF engine's vector schema: frame, box, land, blocks, roadGraph, parks,
#                        water, ...), window.NYC.PLACE_DATA (arrivals) and window.NYC.PKG (the package's own: places,
#                        spawn points, landmarks, the manifest summary)
#   data/terrain.bin.gz      SFB1 sf-terrain v1 (2 m cells, uint16), y = NAVD88 m minus frame.yOffset
#   data/buildings.bin.gz    SFB1 sf-buildings v3 (the SF engine's 20 fields; outlines, no rectangle masses in v0)
#   data/groundmask.bin.gz   SFB1 sf-groundmask v1 (1 m cells: asphalt, sidewalk, lawn, sand, rock, waterEdge)
#
# Stages: place (frame, height datum, water level, quantisation: a few numbers for the whole place), network (road graph
# and curb islands over the place, they cross tiles), then per tile (TILE m squares: terrain samples, buildings, ground
# mask cells; compile_tile(), each tile's output depends only on the place stage, the network and that tile's sources),
# then assemble (tiles concatenated in tile order into the engine's single-file containers).
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
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box as sbox
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

COMPILER_VERSION = '0.1.0'
TILE = 512          # m: the compile unit
CELL = 2            # m: terrain samples
MARGIN = 120        # m of terrain round the place's box
MASK_CELL = 1       # m: ground mask cells
ATTRIBUTION = [
    '© OpenStreetMap contributors (ODbL 1.0), via Overture Maps Foundation',
    'Overture Maps Foundation (CDLA Permissive 2.0 / ODbL 1.0 per theme)',
    'USGS 3D Elevation Program (public domain)',
]
LICENSES = {
    'buildings': 'ODbL 1.0 (OpenStreetMap-derived rows) / CDLA Permissive 2.0 (Microsoft, Google, Esri rows)',
    'transportation': 'ODbL 1.0 (OpenStreetMap)',
    'places': 'CDLA Permissive 2.0',
    'base': 'ODbL 1.0 (OpenStreetMap)',
    'dem': 'Public domain (USGS)',
}
FLAGS = {'freeway': 1, 'tunnel': 2, 'ramp': 4, 'pedestrian': 8, 'private': 16, 'alley': 32, 'crooked': 64}

# Road classes (Overture transportation segment `class`): curb-to-curb width (m), lanes (both ways), sidewalk (m each
# side, 0: none), rank (for right of way and signals). Estimates by class, not measurements: Overture rarely carries
# width_rules, never lanes.
ROAD = {
    'motorway':     (22.0, 4, 0.0, 6),
    'trunk':        (18.0, 4, 0.0, 5),
    'primary':      (15.0, 4, 2.4, 5),
    'secondary':    (13.0, 2, 2.2, 4),
    'tertiary':     (11.0, 2, 2.0, 3),
    'residential':  (8.5, 2, 1.6, 2),
    'living_street': (7.0, 2, 1.6, 1),
    'unclassified': (7.5, 2, 0.0, 2),
    'service':      (6.0, 2, 0.0, 1),
    'unknown':      (7.0, 2, 0.0, 1),
}
SKIP_SUBCLASS = {'driveway', 'parking_aisle', 'drive_through'}


# ------------------------------------------------------------------------------------------------------------- helpers
def q1(v):
    return round(float(v) * 10) / 10


def flat(coords):
    out = []
    for x, z in coords:
        out += [q1(x), q1(z)]
    return out


def ring_area(pts):  # shoelace in (x, z): the NYC convention wants every ring negative
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


def sfb1(header, payload):
    js = json.dumps(header, sort_keys=True, separators=(',', ':')).encode()
    pad = (4 - len(js) % 4) % 4
    return b'SFB1' + struct.pack('<I', len(js) + pad) + js + b' ' * pad + payload


def gz(b):
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode='wb', compresslevel=9, mtime=0, filename='') as g:
        g.write(b)
    return bio.getvalue()


def dominant_angle(pts):  # rect-cover.mjs dominantAngle: edge directions modulo 90 degrees, length-weighted
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


class Frame:
    """The SF engine's frame (tools/geo-base.mjs): metres, +x east, +z south, origin (lat0, lon0), local radii of the
    WGS84 ellipsoid at lat0; y = NAVD88 m minus yOffset (a whole number of metres, so the place's ground sits near 0)."""
    def __init__(self, lat0, lon0, y_offset=0):
        A, E2 = 6378137.0, 6.69437999014e-3
        phi = math.radians(lat0)
        s = math.sin(phi)
        N = A / math.sqrt(1 - E2 * s * s)
        M = A * (1 - E2) / (1 - E2 * s * s) ** 1.5
        self.lat0, self.lon0, self.y_offset = lat0, lon0, y_offset
        self.KX = math.pi / 180 * N * math.cos(phi)
        self.KY = math.pi / 180 * M

    def to_world(self, lon, lat):
        return (np.asarray(lon) - self.lon0) * self.KX, -(np.asarray(lat) - self.lat0) * self.KY

    def from_world(self, x, z):
        return self.lon0 + np.asarray(x) / self.KX, self.lat0 - np.asarray(z) / self.KY

    def geom(self, g):
        return shapely.transform(g, lambda c: np.column_stack(self.to_world(c[:, 0], c[:, 1])))


# ------------------------------------------------------------------------------------------------------------- sources
def load_sources(raw):
    c = duckdb.connect()
    c.execute('INSTALL spatial; LOAD spatial;')
    p = lambda n: os.path.join(raw, n)

    def rows(sql):
        cur = c.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    S = {}
    S['buildings'] = rows(f"""SELECT id, ST_AsWKB(geometry) AS wkb, height, num_floors, min_height, class, subtype, roof_shape,
        roof_height, is_underground, name FROM read_parquet('{p('overture-buildings-building.parquet')}') ORDER BY id""")
    S['segments'] = rows(f"""SELECT id, ST_AsWKB(geometry) AS wkb, subtype, class, subclass, names.primary AS name, connectors,
        access_restrictions, road_flags, width_rules, level_rules, subclass_rules FROM read_parquet('{p('overture-transportation-segment.parquet')}') ORDER BY id""")
    S['connectors'] = rows(f"SELECT id, ST_X(geometry) AS lon, ST_Y(geometry) AS lat FROM read_parquet('{p('overture-transportation-connector.parquet')}') ORDER BY id")
    S['places'] = rows(f"""SELECT id, ST_X(geometry) AS lon, ST_Y(geometry) AS lat, name, basic_category, taxonomy.primary AS cat,
        confidence, operating_status FROM read_parquet('{p('overture-places-place.parquet')}') ORDER BY id""")
    S['water'] = rows(f"SELECT id, ST_AsWKB(geometry) AS wkb, subtype, class, name FROM read_parquet('{p('overture-base-water.parquet')}') ORDER BY id")
    S['land_use'] = rows(f"SELECT id, ST_AsWKB(geometry) AS wkb, subtype, class, name FROM read_parquet('{p('overture-base-land_use.parquet')}') ORDER BY id")
    for k in ('buildings', 'segments', 'water', 'land_use'):
        for r in S[k]:
            r['geom'] = shapely.from_wkb(bytes(r.pop('wkb')))
    return S


# ------------------------------------------------------------------------------------------------------------- place stage
def place_stage(fetch, S, dem):
    W, Sb, E, N = fetch['bbox']
    lat0, lon0 = round((Sb + N) / 2, 6), round((W + E) / 2, 6)
    F = Frame(lat0, lon0)
    x0, z1 = F.to_world(W, Sb)
    x1, z0 = F.to_world(E, N)
    B = {'x0': float(x0), 'x1': float(x1), 'z0': float(z0), 'z1': float(z1)}
    grid, dlon0, dlat0, res, _ = dem
    # terrain extent: the box and a margin, on the CELL lattice
    tx0 = math.floor((B['x0'] - MARGIN) / CELL) * CELL
    tz0 = math.floor((B['z0'] - MARGIN) / CELL) * CELL
    tw = math.ceil((B['x1'] + MARGIN - tx0) / CELL) + 1
    th = math.ceil((B['z1'] + MARGIN - tz0) / CELL) + 1
    # water: Overture base water polygons (rivers, lakes, reservoirs...) over 2000 m2, in the world
    wpolys = []
    for r in S['water']:
        g = r['geom']
        if g.geom_type not in ('Polygon', 'MultiPolygon'):
            continue
        wg = F.geom(g)
        if wg.area > 2000:
            wpolys.append(wg.buffer(0))
    water = unary_union(wpolys).intersection(sbox(tx0, tz0, tx0 + (tw - 1) * CELL, tz0 + (th - 1) * CELL)) if wpolys else None
    if water is not None and water.is_empty:
        water = None
    # the water's surface: the median DEM height inside it (3DEP is hydro-flattened: a river's pool is near constant)
    level = None
    if water is not None:
        samp = []
        for g in (water.geoms if hasattr(water, 'geoms') else [water]):
            for p in shapely.points(np.array(shapely.get_coordinates(g.buffer(-15) if g.buffer(-15).area > 0 else g))):
                lon, lat = F.from_world(p.x, p.y)
                v = dem_sample(dem, lon, lat)
                if np.isfinite(v):
                    samp.append(float(v))
        if len(samp) > 10:
            level = float(np.median(samp))
    # the engine's water is one level (js/terrain.js waterLevel: every sample at or under it is water): only water that
    # lies in the place's lowest ground (a river in its valley) is taken; a pond or reservoir above dry ground lower
    # down (a dammed lake, a park's pool) is left out in v0 (it would flood that ground)
    if level is not None:
        lon, lat = F.from_world(*np.meshgrid(np.linspace(tx0, tx0 + (tw - 1) * CELL, 120), np.linspace(tz0, tz0 + (th - 1) * CELL, 120)))
        hs = dem_sample(dem, lon.ravel(), lat.ravel())
        xs, zs = F.to_world(lon.ravel(), lat.ravel())
        dry = ~shapely.contains_xy(water.buffer(25), xs, zs) & np.isfinite(hs)
        low = float(np.percentile(hs[dry], 0.5)) if dry.any() else level
        if level > low + 1.0:
            level, water = None, None
    # height datum: the ground of the box near 0 (the engine's lighting, fog and flight were tuned on San Francisco's
    # 0..120 m): the water's surface at 0 where there is water, else the box's lowest ground
    finite = grid[np.isfinite(grid)]
    gmin, gmax = float(finite.min()), float(finite.max())
    y_off = int(math.floor(level)) if level is not None else int(math.floor(gmin))
    F.y_offset = y_off
    water_level = round(level - y_off, 2) if level is not None else -10.0
    minH = math.floor(min(gmin - y_off, water_level)) - 1
    maxH = math.ceil(gmax - y_off) + 1
    # 1 cm steps (the 1/3" source is ~10 m cells: finer steps would only be interpolation, and cost gzip 3x)
    scale = 0.01 if (maxH - minH) / 0.01 <= 65535 else (maxH - minH) / 65535
    return {
        'frame': F, 'box': B, 'terrain': {'x0': tx0, 'z0': tz0, 'w': tw, 'h': th, 'minH': minH, 'maxH': maxH, 'scale': scale},
        'water': water, 'waterLevel': water_level, 'waterNAVD88': level,
    }


def dem_sample(dem, lon, lat):
    grid, lon0, lat0, res, _ = dem
    fc = (np.asarray(lon) - lon0) / res
    fr = (lat0 - np.asarray(lat)) / res
    c = np.clip(np.floor(fc).astype(int), 0, grid.shape[1] - 2)
    r = np.clip(np.floor(fr).astype(int), 0, grid.shape[0] - 2)
    tx, ty = np.clip(fc - c, 0, 1), np.clip(fr - r, 0, 1)
    a = grid[r, c] * (1 - tx) + grid[r, c + 1] * tx
    b = grid[r + 1, c] * (1 - tx) + grid[r + 1, c + 1] * tx
    return a * (1 - ty) + b * ty


# ------------------------------------------------------------------------------------------------------------- network stage
def access_dir(ar):
    """Overture access_restrictions -> 1 (only along the geometry), -1 (only against), 0 both. A denial for one heading
    with no mode/using/vehicle qualifier is a one-way."""
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
    # the engine's display rule (city-config.js prettyName) title-cases; DataSF-style suffixes keep labels short
    if not name:
        return ''
    n = ' ' + name.upper() + ' '
    for a, b in ((' STREET ', ' ST '), (' AVENUE ', ' AVE '), (' BOULEVARD ', ' BLVD '), (' DRIVE ', ' DR '), (' ROAD ', ' RD '),
                 (' PLACE ', ' PL '), (' LANE ', ' LN '), (' COURT ', ' CT '), (' TERRACE ', ' TER '), (' HIGHWAY ', ' HWY '),
                 (' NORTH ', ' N '), (' SOUTH ', ' S '), (' EAST ', ' E '), (' WEST ', ' W '), (' PARKWAY ', ' PKWY '), (' ALLEY ', ' ALY ')):
        n = n.replace(a, b)
    return n.strip()


def network_stage(P, S, place_name):
    F, B = P['frame'], P['box']
    T = P['terrain']
    ext = sbox(T['x0'], T['z0'], T['x0'] + (T['w'] - 1) * CELL, T['z0'] + (T['h'] - 1) * CELL)
    conn = {}
    for r in S['connectors']:
        x, z = F.to_world(r['lon'], r['lat'])
        conn[r['id']] = (float(x), float(z))
    nodes, node_of = [], {}

    def node(key, p):
        if key not in node_of:
            node_of[key] = len(nodes)
            nodes.append(p)
        return node_of[key]
    names, name_of = [], {}

    def name_idx(n):
        if n not in name_of:
            name_of[n] = len(names)
            names.append(n)
        return name_of[n]
    links = []
    stats = {'segments': 0, 'skipped': 0, 'links': 0, 'oneway': 0}
    for s in S['segments']:
        if s['subtype'] != 'road':
            continue
        cls = s['class'] or 'unknown'
        if cls not in ROAD or s['subclass'] in SKIP_SUBCLASS:
            stats['skipped'] += 1
            continue
        g = s['geom']
        if g.geom_type != 'LineString':
            stats['skipped'] += 1
            continue
        stats['segments'] += 1
        wg = F.geom(g)
        L = wg.length
        if L < 0.5:
            continue
        w, lanes, sw, rank = ROAD[cls]
        wr = [r['value'] for r in s['width_rules'] or [] if r.get('value') and not r.get('between')]
        if wr and 3 <= wr[0] <= 40:
            w = float(wr[0])
        d = access_dir(s['access_restrictions'])
        flags = 0
        if s['subclass'] == 'alley' or (cls == 'service' and s['subclass'] == 'alley'):
            flags |= FLAGS['alley']
            w = min(w, 5.0)
        if any((a.get('access_type') == 'allowed' and 'as_private' in ((a.get('when') or {}).get('recognized') or [])) for a in s['access_restrictions'] or []) and cls == 'service':
            flags |= FLAGS['private']
        if flagged(s['road_flags'], 'is_tunnel') and not any(r.get('between') for r in s['road_flags'] or [] if 'is_tunnel' in (r.get('values') or [])):
            flags |= FLAGS['tunnel']
        if d:
            stats['oneway'] += 1
            # a one-way carriageway of a divided road carries half the lanes in less width
            w = max(6.0, w * 0.6) if lanes >= 4 else w
            lanes = max(1, lanes // 2) if lanes >= 4 else max(1, lanes)
        # split at its connectors (linear references `at`)
        cs = sorted([(c['at'], c['connector_id']) for c in s['connectors'] or [] if c['connector_id'] in conn])
        if len(cs) < 2:
            stats['skipped'] += 1
            continue
        nm = name_idx(pretty_raw(s['name']))
        for (a0, c0), (a1, c1) in zip(cs, cs[1:]):
            if a1 - a0 <= 1e-9 or c0 == c1:
                continue
            piece = shapely.ops.substring(wg, a0 * L, a1 * L)
            if piece.length < 0.3:
                continue
            pts = [tuple(p) for p in shapely.get_coordinates(piece.simplify(0.4))]
            na, nb = node(c0, conn[c0]), node(c1, conn[c1])
            if na == nb:
                continue
            links.append({'a': na, 'b': nb, 'ni': nm, 'w': w, 'lanes': lanes, 'dir': d, 'inner': pts[1:-1], 'flags': flags,
                          'sw': sw, 'cls': cls, 'rank': rank, 'seg': s['id']})
    # keep the links that touch the terrain extent (a road leaving it ends in a dead end at its edge)
    keep = []
    for l in links:
        line = LineString([nodes[l['a']], *l['inner'], nodes[l['b']]])
        if line.intersects(ext):
            keep.append(l)
    links = keep
    # renumber the nodes the kept links use, in first-use order (deterministic: segments are read in id order)
    used, remap = [], {}
    for l in links:
        for k in ('a', 'b'):
            if l[k] not in remap:
                remap[l[k]] = len(used)
                used.append(nodes[l[k]])
            l[k] = remap[l[k]]
    nodes = used
    stats['links'] = len(links)

    # --- control per node: signals where two main roads meet, stops for the minor approaches elsewhere
    inc = [[] for _ in nodes]
    for i, l in enumerate(links):
        inc[l['a']].append(i)
        inc[l['b']].append(i)
    control, stop_mask = [0] * len(nodes), [0] * len(nodes)
    for n in range(len(nodes)):
        drive = [i for i in inc[n] if not links[i]['flags'] & (FLAGS['private'] | FLAGS['pedestrian'])]
        if len(set(links[i]['ni'] for i in drive)) < 2 or len(drive) < 3:
            continue
        ranks = sorted((links[i]['rank'] for i in drive), reverse=True)
        top = ranks[0]
        if ranks[1] >= 4 and ranks[2] >= 3:
            control[n] = 1  # two main roads cross: signal
            continue
        if top <= 2:
            control[n] = 2 if len(drive) >= 4 else 3  # residential crossings: all-way stop, a tee stops its stem
        else:
            control[n] = 3
        for slot, i in enumerate(inc[n]):
            l = links[i]
            if control[n] == 2 or l['rank'] < top:
                stop_mask[n] |= 1 << slot
        if control[n] == 3 and not stop_mask[n]:
            control[n] = 0
    # --- spawn & places need the road graph; blocks need the roads' outline
    rg = {
        'nodes': [v for p in nodes for v in (q1(p[0]), q1(p[1]))],
        'names': names,
        'links': [[l['a'], l['b'], l['ni'], q1(l['w']), l['lanes'], l['dir'], flat(l['inner']), l['flags'], q1(l['sw']), q1(l['sw'])] for l in links],
        'control': control,
        'stopMask': stop_mask,
        'nhoods': [place_name],
        'linkNhood': [0] * len(links),
        'decks': [],
    }
    # --- curb islands: the land minus every roadway at its curb-to-curb width (round ends: the corner radius is the
    # road's half width), minus the water; holes (a loop road inside a block) cut open, slivers dropped
    roads = []
    for l in links:
        if l['flags'] & FLAGS['pedestrian']:
            continue
        line = LineString([nodes[l['a']], *l['inner'], nodes[l['b']]])
        roads.append(line.buffer(l['w'] / 2, quad_segs=4))
    roadway = unary_union(roads) if roads else Polygon()
    land = ext.buffer(-2, join_style='mitre')
    if P['water'] is not None:
        land = land.difference(P['water'].buffer(1.5))
    raised = land.difference(roadway)
    parks = park_polys(P, S)
    blocks = []
    for poly in polygons(raised):
        for piece in cut_holes(poly):
            piece = piece.simplify(0.3)
            if piece.is_empty or piece.area < 6:
                continue
            for pp in polygons(piece):
                if pp.area < 6:
                    continue
                pts = neg_ring(list(pp.exterior.coords))
                if len(pts) < 3:
                    continue
                theta = dominant_angle(pts)
                theta = (theta % (math.pi / 2))
                bx0, bz0, bx1, bz1 = pp.bounds
                mrr = pp.minimum_rotated_rectangle
                sides = sorted(LineString(mrr.exterior.coords[i:i + 2]).length for i in range(2)) if mrr.geom_type == 'Polygon' else [0, 0]
                kind = 'island' if (pp.area < 120 or sides[0] < 6) else 'block'
                share, pname = 0.0, ''
                if parks is not None:
                    inter = pp.intersection(parks['union'])
                    share = inter.area / pp.area if pp.area else 0
                    if share > 0.5:
                        pname = parks['name_at'](pp.representative_point())
                rect = pp.area / max(1e-9, (bx1 - bx0) * (bz1 - bz0)) > 0.97
                blocks.append([flat(pts), [], round(share, 2) if share > 0.5 else 0, pname if share > 0.5 else '', 1 if rect else 0,
                               [[round(theta, 4), q1((bx0 + bx1) / 2), q1((bz0 + bz1) / 2), []]], kind])
    return {'roadGraph': rg, 'blocks': blocks, 'roadway': roadway, 'road_parts': roads, 'links': links, 'nodes': nodes, 'stats': stats, 'parks': parks}


def polygons(g):
    if g.is_empty:
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
    """A polygon with holes -> pieces without: split by a north-south line through each hole (the engine's curb islands
    are simple rings)."""
    todo, out = [poly], []
    while todo:
        p = todo.pop()
        if not p.interiors:
            out.append(p)
            continue
        h = p.interiors[0]
        cx = Polygon(h).representative_point().x
        x0, z0, x1, z1 = p.bounds
        left = p.intersection(sbox(x0 - 1, z0 - 1, cx, z1 + 1))
        right = p.intersection(sbox(cx, z0 - 1, x1 + 1, z1 + 1))
        todo += polygons(left) + polygons(right)
    out.sort(key=lambda g: (round(g.bounds[0], 1), round(g.bounds[1], 1)))
    return out


def park_polys(P, S):
    F = P['frame']
    items = []
    for r in S['land_use']:
        if r['subtype'] not in ('park', 'recreation', 'golf', 'grass', 'cemetery') and r['class'] not in ('park', 'playground', 'pitch', 'recreation_ground', 'golf_course', 'grass', 'cemetery', 'village_green'):
            continue
        g = r['geom']
        if g.geom_type not in ('Polygon', 'MultiPolygon'):
            continue
        wg = F.geom(g).buffer(0)
        if wg.area < 200:
            continue
        items.append((wg, r['name'] or '', r['subtype'] or r['class'] or 'park'))
    if not items:
        return None
    u = unary_union([g for g, _, _ in items])

    def name_at(pt):
        for g, n, _ in items:
            if n and g.contains(pt):
                return n
        return ''
    return {'items': items, 'union': u, 'name_at': name_at}


# ------------------------------------------------------------------------------------------------------------- per tile
def tiles_of(P):
    T = P['terrain']
    x0, z0 = T['x0'], T['z0']
    x1, z1 = x0 + (T['w'] - 1) * CELL, z0 + (T['h'] - 1) * CELL
    out = []
    for tz in range(math.floor(z0 / TILE), math.floor(z1 / TILE) + 1):
        for tx in range(math.floor(x0 / TILE), math.floor(x1 / TILE) + 1):
            out.append((tx, tz))
    return out


def terrain_samples(P, dem, i0, i1, j0, j1):
    """Heights (world y) of terrain samples [j0, j1) x [i0, i1) of the place's lattice, water flattened."""
    T, F = P['terrain'], P['frame']
    ii, jj = np.meshgrid(np.arange(i0, i1), np.arange(j0, j1))
    x = T['x0'] + ii * CELL
    z = T['z0'] + jj * CELL
    lon, lat = F.from_world(x, z)
    h = dem_sample(dem, lon, lat).astype(np.float64) - F.y_offset
    h[~np.isfinite(h)] = P['waterLevel']
    if P['water'] is not None:
        inside = shapely.contains_xy(P['water'], x.ravel(), z.ravel()).reshape(x.shape)
        h[inside] = P['waterLevel']
        # the bank never below the water (the DEM's 10 m cells smear the shore)
        h = np.where(~inside, np.maximum(h, P['waterLevel'] + 0.3), h)
    return h


def terrain_tile(P, dem, tile):
    """The terrain samples whose x, z fall in this tile: light Gaussian (sigma 1 cell) over land only, as SF's
    geo-terrain.mjs, computed with a 2-sample halo so tiles join seamlessly; uint16 quantised."""
    T = P['terrain']
    tx, tz = tile
    i0 = max(0, math.ceil((tx * TILE - T['x0']) / CELL))
    i1 = min(T['w'], math.ceil(((tx + 1) * TILE - T['x0']) / CELL))
    j0 = max(0, math.ceil((tz * TILE - T['z0']) / CELL))
    j1 = min(T['h'], math.ceil(((tz + 1) * TILE - T['z0']) / CELL))
    if i1 <= i0 or j1 <= j0:
        return None
    H = 2
    a0, a1, b0, b1 = max(0, i0 - H), min(T['w'], i1 + H), max(0, j0 - H), min(T['h'], j1 + H)
    h = terrain_samples(P, dem, a0, a1, b0, b1)
    wl = P['waterLevel']
    wet = np.abs(h - wl) < 0.005
    K = np.array([0.0545, 0.2442, 0.4026, 0.2442, 0.0545])

    def blur(src, axis):
        num = np.zeros_like(src)
        den = np.zeros_like(src)
        n = src.shape[axis]
        for d in range(-2, 3):
            sl_dst = [slice(None)] * 2
            sl_src = [slice(None)] * 2
            if d < 0:
                sl_dst[axis], sl_src[axis] = slice(-d, n), slice(0, n + d)
            else:
                sl_dst[axis], sl_src[axis] = slice(0, n - d), slice(d, n)
            v = src[tuple(sl_src)]
            ok = ~(np.abs(v - wl) < 0.005)
            num[tuple(sl_dst)] += np.where(ok, v, 0) * K[d + 2]
            den[tuple(sl_dst)] += ok * K[d + 2]
        out = np.where(den > 0, num / np.maximum(den, 1e-9), src)
        return np.where(np.abs(src - wl) < 0.005, src, out)
    h = blur(blur(h, 1), 0)
    h = h[j0 - b0:j1 - b0, i0 - a0:i1 - a0]
    q = np.round((h - T['minH']) / T['scale']).clip(0, 65535).astype('<u2')
    return {'i0': i0, 'j0': j0, 'q': q}


def assemble_terrain(P, tiles_out):
    T = P['terrain']
    q = np.zeros((T['h'], T['w']), dtype='<u2')
    for t in tiles_out:
        if t is None:
            continue
        h, w = t['q'].shape
        q[t['j0']:t['j0'] + h, t['i0']:t['i0'] + w] = t['q']
    return q


class Ground:
    """Terrain heights (world y) from the assembled samples: bilinear, as js/terrain.js heightAt."""
    def __init__(self, P, q):
        T = P['terrain']
        self.T, self.h = T, T['minH'] + q.astype(np.float64) * T['scale']

    def at(self, x, z):
        T = self.T
        fi = np.clip((np.asarray(x) - T['x0']) / CELL, 0, T['w'] - 1.001)
        fj = np.clip((np.asarray(z) - T['z0']) / CELL, 0, T['h'] - 1.001)
        i, j = np.floor(fi).astype(int), np.floor(fj).astype(int)
        tx, tz = fi - i, fj - j
        H = self.h
        a = H[j, i] * (1 - tx) + H[j, i + 1] * tx
        b = H[j + 1, i] * (1 - tx) + H[j + 1, i + 1] * tx
        return a * (1 - tz) + b * tz


BTYPES = ['shed', 'rowhouse', 'flats', 'apartment', 'office-low', 'warehouse', 'midrise', 'tower', 'civic', 'landmark']
PALETTES = ['victorian', 'north-beach', 'chinatown', 'downtown', 'soma']
ERAS = ['unknown', 'victorian-edwardian', 'interwar', 'postwar', 'contemporary']
FACADES = ['unknown', 'glass', 'concrete', 'stone', 'metal', 'terracotta']
BFIELDS = ['base', 'roof', 'peak', 'ringStart', 'ringCount', 'theta', 'massStart', 'massCount', 'shops', 'type', 'palette', 'bays',
           'garage', 'era', 'frontW', 'row', 'storeyH', 'stories', 'facade', 'podium']
CIVIC = {'church', 'cathedral', 'chapel', 'mosque', 'synagogue', 'temple', 'school', 'university', 'college', 'hospital', 'public',
         'civic', 'government', 'post_office', 'library', 'fire_station', 'police', 'train_station', 'museum', 'courthouse', 'townhall'}
SHOPS = {'retail', 'commercial', 'supermarket', 'kiosk', 'shop'}
HOUSES = {'house', 'detached', 'residential', 'semidetached_house', 'bungalow', 'terrace', 'farm', 'cabin', 'static_caravan', 'hut'}
SHEDS = {'garage', 'garages', 'shed', 'carport', 'roof', 'barn', 'farm_auxiliary', 'greenhouse', 'storage_tank', 'silo', 'outbuilding'}
WAREHOUSE = {'industrial', 'warehouse', 'manufacture', 'factory', 'hangar', 'service', 'transportation', 'agricultural'}


def classify(r, area, h, downtown):
    """(type, palette, stories) by Overture class, footprint area, height and whether it stands downtown (among the
    place's commercial core). A rule, not data: Overture has no building type for most ML-traced footprints."""
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


def building_records(P, S, ground, net, downtown_poly):
    F = P['frame']
    roadway = net['roadway']
    recs = []
    for r in S['buildings']:
        if r['is_underground']:
            continue
        g = r['geom']
        if g.geom_type == 'MultiPolygon':
            g = max(g.geoms, key=lambda p: p.area)
        if g.geom_type != 'Polygon':
            continue
        wg = F.geom(g).buffer(0)
        if wg.geom_type == 'MultiPolygon':
            wg = max(wg.geoms, key=lambda p: p.area)
        if wg.is_empty or wg.area < 8:
            continue
        wg = Polygon(wg.exterior).simplify(0.25)
        if wg.is_empty or wg.geom_type != 'Polygon':
            continue
        c = wg.centroid
        recs.append({'r': r, 'g': wg, 'cx': c.x, 'cz': c.y})
    # footprints in the roadway (an ML trace over a street, a stale outline) are dropped; ones the road's estimated width
    # only grazes are kept, pulled back off it
    rparts = net['road_parts']
    rtree = shapely.STRtree(rparts) if rparts else None
    out = []
    dropped = 0
    for o in recs:
        g = o['g']
        hits = [rparts[i] for i in rtree.query(g, predicate='intersects')] if rtree is not None else []
        inter = unary_union(hits).intersection(g).area if hits else 0
        if inter > 0.35 * g.area:
            dropped += 1
            continue
        if inter > 0:
            g2 = g.difference(unary_union(hits).buffer(0.3))
            g2 = max(polygons(g2), key=lambda p: p.area) if not g2.is_empty else None
            if g2 is None or g2.area < 8:
                dropped += 1
                continue
            o['g'] = Polygon(g2.exterior).simplify(0.25)
        out.append(o)
    for o in out:
        r, g = o['r'], o['g']
        pts = neg_ring(list(g.exterior.coords))
        xs, zs = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
        gr = ground.at(np.append(xs, o['cx']), np.append(zs, o['cz']))
        base = float(gr.min())
        area = g.area
        downtown = downtown_poly is not None and downtown_poly.contains(Point(o['cx'], o['cz']))
        h = r['height']
        if h is None and r['num_floors']:
            h = r['num_floors'] * 3.3 + 0.8
        if h is None:
            h = 4.5 if area < 250 else 7.0 if area < 1500 else 9.0
        h = float(h)
        btype, pal = classify(r, area, h, downtown)
        # Overture's ML heights are the eaves of most houses: a one-storey house stands at least 3.4 m, its roof above
        h = max(h, 3.4 if btype in ('rowhouse', 'shed') else 4.0)
        stories = r['num_floors'] or max(1, int(round(h / 3.4)))
        peak = h + (1.6 if btype == 'rowhouse' and area < 300 else 0.6)
        theta = -dominant_angle(pts)
        o['rec'] = [base, base + h, base + peak, 0, len(pts), theta, 0, 0, 1 if (r['class'] or '') in SHOPS or (downtown and btype == 'office-low') else 0,
                    BTYPES.index(btype), pal, 0, 0, 0, 0, 1, 3.4, stories, 0, 0]
        o['pts'] = pts
        o['btype'] = btype
    return out, dropped


def downtown_of(P, S, net):
    """The place's commercial core: round the places of commerce (Overture places) that cluster most, else round the
    junction of its two highest-ranked roads; a 350 m disc."""
    F = P['frame']
    B = P['box']
    pts = []
    for p in S['places']:
        cat = (p['basic_category'] or p['cat'] or '')
        if not cat or (p['confidence'] or 0) < 0.5:
            continue
        x, z = F.to_world(p['lon'], p['lat'])
        if B['x0'] <= x <= B['x1'] and B['z0'] <= z <= B['z1']:
            pts.append((float(x), float(z)))
    if len(pts) >= 5:
        A = np.array(pts)
        best, bi = -1, 0
        for i in range(len(A)):
            n = int((np.hypot(A[:, 0] - A[i, 0], A[:, 1] - A[i, 1]) < 250).sum())
            if n > best:
                best, bi = n, i
        near = A[np.hypot(A[:, 0] - A[bi, 0], A[:, 1] - A[bi, 1]) < 250]
        c = near.mean(axis=0)
        return Point(float(c[0]), float(c[1])).buffer(350, quad_segs=8), (float(c[0]), float(c[1]))
    return None, ((B['x0'] + B['x1']) / 2, (B['z0'] + B['z1']) / 2)


def buildings_tile(P, brecs, tile):
    tx, tz = tile
    return [o for o in brecs if math.floor(o['cx'] / TILE) == tx and math.floor(o['cz'] / TILE) == tz]


def assemble_buildings(P, tile_lists):
    table, verts = [], []
    n = 0
    for lst in tile_lists:
        for o in sorted(lst, key=lambda o: o['r']['id']):
            rec = list(o['rec'])
            rec[3] = len(verts) // 2
            for x, z in o['pts']:
                verts += [x, z]
            table += rec
            n += 1
    header = {'format': 'sf-buildings', 'version': 3, 'box': 'pkg', 'count': n, 'fields': BFIELDS, 'types': BTYPES, 'palettes': PALETTES,
              'eras': ERAS, 'facades': FACADES, 'tableFloats': len(table), 'vertexFloats': len(verts), 'massFields': ['cx', 'cz', 'w', 'd'],
              'massFloats': 0, 'datum': 'NAVD88 m minus frame.yOffset'}
    payload = np.array(table, dtype='<f4').tobytes() + np.array(verts, dtype='<f4').tobytes()
    return header, payload, n


MASK = {'asphalt': 0, 'sidewalk': 1, 'lawn': 2, 'sand': 3, 'rock': 4, 'waterEdge': 5}


def mask_tile(P, net, ground, tile, mx0, mz0, mw, mh):
    """Ground classes of the 1 m cells in this tile: lawn on the curb islands, a sidewalk band along the curb where the
    road has sidewalks, paved downtown and in the islands, asphalt on the roadway, rock on slopes steeper than 0.7 off
    the islands, the water's edge within 3 m of the water."""
    tx, tz = tile
    x0, z0 = max(mx0, tx * TILE), max(mz0, tz * TILE)
    x1, z1 = min(mx0 + mw, (tx + 1) * TILE), min(mz0 + mh, (tz + 1) * TILE)
    if x1 <= x0 or z1 <= z0:
        return None
    w, h = int(x1 - x0), int(z1 - z0)
    img = Image.new('L', (w, h), MASK['asphalt'])
    d = ImageDraw.Draw(img)
    tb = sbox(x0 - 40, z0 - 40, x1 + 40, z1 + 40)

    def poly(ring, v):
        d.polygon([((x - x0), (z - z0)) for x, z in ring], fill=v)
    for b in net['blocks_geom']:
        if not b['g'].intersects(tb):
            continue
        poly(b['ring'], MASK['sidewalk'] if b['kind'] == 'island' else MASK['lawn'])
    # paved lots: round the buildings that are not houses (stores, offices, warehouses, churches: their parking and
    # aprons), wider downtown
    for g in net['paved']:
        if g.intersects(tb):
            for pp in polygons(g.intersection(tb)):
                poly(list(pp.exterior.coords), MASK['sidewalk'])
    # sidewalk bands: each road's buffer to its curb plus its sidewalk width, drawn under the lawn's edge
    band = net['sidewalk_band']
    if band is not None:
        for g in polygons(band.intersection(tb)):
            poly(list(g.exterior.coords), MASK['sidewalk'])
            for hole in g.interiors:
                poly(list(hole.coords), 255)
    a = np.array(img, dtype=np.uint8)
    a[a == 255] = MASK['lawn']
    # the roadway itself stays asphalt (the bands overlap it)
    road = Image.new('L', (w, h), 0)
    rd = ImageDraw.Draw(road)
    for g in polygons(net['roadway'].intersection(tb)):
        rd.polygon([((x - x0), (z - z0)) for x, z in g.exterior.coords], fill=1)
        for hole in g.interiors:
            rd.polygon([((x - x0), (z - z0)) for x, z in hole.coords], fill=0)
    ra = np.array(road, dtype=bool)
    island = np.zeros_like(ra)
    a[ra] = MASK['asphalt']
    # slopes and water
    xs = x0 + np.arange(w) + 0.5
    zs = z0 + np.arange(h) + 0.5
    X, Z = np.meshgrid(xs, zs)
    gx = (ground.at(X + 1, Z) - ground.at(X - 1, Z)) / 2
    gz = (ground.at(X, Z + 1) - ground.at(X, Z - 1)) / 2
    steep = np.hypot(gx, gz) > 0.7
    a[steep & (a == MASK['lawn'])] = MASK['rock']
    if P['water'] is not None:
        hh = ground.at(X, Z)
        near = hh <= P['waterLevel'] + 0.35
        a[near] = MASK['waterEdge']
    del island
    return {'x0': int(x0 - mx0), 'z0': int(z0 - mz0), 'a': a}


def hash01(x, z, k):
    v = math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453
    return v - math.floor(v)


def trees_tile(P, net, bidx, tile, desert):
    """Trees on the curb islands of this tile (a rule: no tree data in v0): a jittered 13 m lattice over the lawns,
    kept where 3 m clear of a building but within 25 m of one (yards, not fields), 2 m in from the curb and off the paved lots; about two in five kept, a third of
    those on the street edge. [x, z, class, trunk cm] as GEO.trees (tree-classes: 0 broadleaf, 1 elm-like, 2 palm,
    4 conifer)."""
    tx, tz = tile
    out = []
    STEP = 13.0
    tb = sbox(tx * TILE, tz * TILE, (tx + 1) * TILE, (tz + 1) * TILE)
    for b in net['blocks_geom']:
        if b['kind'] == 'island' or not b['g'].intersects(tb) or b['g'].area < 250:
            continue
        inner = b['g'].buffer(-2.0)
        if inner.is_empty:
            continue
        x0, z0, x1, z1 = inner.intersection(tb).bounds if inner.intersects(tb) else (0, 0, -1, -1)
        if x1 < x0:
            continue
        i0, i1 = math.floor(x0 / STEP), math.floor(x1 / STEP)
        j0, j1 = math.floor(z0 / STEP), math.floor(z1 / STEP)
        cand = []
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1):
                x = (i + 0.15 + 0.7 * hash01(i, j, 1)) * STEP
                z = (j + 0.15 + 0.7 * hash01(i, j, 2)) * STEP
                if hash01(i, j, 3) > 0.42:
                    continue
                if not (tx * TILE <= x < (tx + 1) * TILE and tz * TILE <= z < (tz + 1) * TILE):
                    continue
                cand.append((x, z, i, j))
        if not cand:
            continue
        pts = shapely.points(np.array([(c[0], c[1]) for c in cand]))
        ok = shapely.contains(inner, pts)
        for k, c in enumerate(cand):
            if not ok[k]:
                continue
            pt = pts[k]
            if len(bidx['tree'].query(pt.buffer(3.0), predicate='intersects')):
                continue
            # (yards and street edges: within 25 m of a building; not out in the fields)
            if not len(bidx['tree'].query(pt.buffer(25.0), predicate='intersects')):
                continue
            if bidx['paved'] is not None and len(bidx['paved'].query(pt, predicate='intersects')):
                continue
            h = hash01(c[2], c[3], 4)
            cls = (2 if h < 0.55 else 0) if desert else (0 if h < 0.5 else 1 if h < 0.85 else 4)
            out.append([q1(c[0]), q1(c[1]), cls, int(12 + 30 * hash01(c[2], c[3], 5))])
    return out


# ------------------------------------------------------------------------------------------------------------- places
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


def build_places(P, S, net, ground, center):
    """Mission places: Overture places in the box, by kind; public institutions keep their own names, businesses are
    called by what they are and the street they stand on (no brand on any screen). Each on its nearest lane."""
    F, B = P['frame'], P['box']
    links, nodes = net['links'], net['nodes']
    rg_names = net['roadGraph']['names']
    lines = []
    for l in links:
        if l['flags'] & (FLAGS['private'] | FLAGS['pedestrian']) or l['cls'] == 'motorway':
            continue
        lines.append((LineString([nodes[l['a']], *l['inner'], nodes[l['b']]]), l))
    tree = shapely.STRtree([g for g, _ in lines])

    def lane(x, z, R=80):
        i = tree.nearest(Point(x, z))
        if i is None:
            return None
        g, l = lines[i]
        d = g.distance(Point(x, z))
        if d > R:
            return None
        s = g.project(Point(x, z))
        s = min(max(s, 4), max(4, g.length - 4))
        p = g.interpolate(s)
        p2 = g.interpolate(min(g.length, s + 1))
        p1 = g.interpolate(max(0, s - 1))
        hd = math.atan2(p2.x - p1.x, p2.y - p1.y)
        return {'x': q1(p.x), 'z': q1(p.y), 'heading': round(hd, 4), 'street': rg_names[l['ni']], 'd': d}
    out, seen = {}, {}
    for p in S['places']:
        cat = p['basic_category'] or p['cat'] or ''
        if not cat or (p['confidence'] or 0) < 0.45 or (p['operating_status'] and p['operating_status'] != 'open'):
            continue
        x, z = F.to_world(p['lon'], p['lat'])
        x, z = float(x), float(z)
        if not (B['x0'] <= x <= B['x1'] and B['z0'] <= z <= B['z1']):
            continue
        kind = cat if cat in GENERIC else None
        if not kind:
            for k in GENERIC:
                if k in cat:
                    kind = k
                    break
        if not kind:
            continue
        ln = lane(x, z)
        if not ln:
            continue
        street = ln['street'].title() if ln['street'] else ''
        if kind in PUBLIC and p['name']:
            name = p['name']
        else:
            name = GENERIC[kind] + (' on ' + street if street else '')
        n = seen.get(kind, 0)
        seen[kind] = n + 1
        key = kind + ('' if n == 0 else str(n + 1))
        out[key] = {'x': ln['x'], 'z': ln['z'], 'heading': ln['heading'], 'name': name, 'kind': kind, 'cx': q1(x), 'cz': q1(z)}
    # arrivals: downtown, and the place's four quarters' main roads
    sp = {}
    c = lane(*center, R=600)
    if c:
        sp['downtown'] = {'x': c['x'], 'z': c['z'], 'heading': c['heading'], 'name': 'Downtown'}
    for key, (fx, fz) in {'north': (0.5, 0.2), 'south': (0.5, 0.8), 'east': (0.8, 0.5), 'west': (0.2, 0.5)}.items():
        x = B['x0'] + (B['x1'] - B['x0']) * fx
        z = B['z0'] + (B['z1'] - B['z0']) * fz
        ln = lane(x, z, R=600)
        if ln:
            sp[key] = {'x': ln['x'], 'z': ln['z'], 'heading': ln['heading'], 'name': (ln['street'].title() or key.title())}
    return out, sp


# ------------------------------------------------------------------------------------------------------------- compile
def compile_place(pid, raw, out_root, name=None):
    t0 = time.time()
    timings = {}

    def mark(k):
        timings[k] = round(time.time() - t0 - sum(timings.values()), 2)
    fetch = json.load(open(os.path.join(raw, 'fetch.json')))
    name = name or fetch.get('place') or pid
    S = load_sources(raw)
    import numpy as _np  # noqa
    from dem import read_dem
    W, Sb, E, N = fetch['readBbox']
    lat = (Sb + N) / 2
    ax, ay = 300 / (111320 * math.cos(math.radians(lat))), 300 / 111132
    dem = read_dem((W - ax, Sb - ay, E + ax, N + ay), raw)  # cached internal tiles: offline
    mark('sources')
    P = place_stage(fetch, S, dem)
    mark('place')
    net = network_stage(P, S, name.split(',')[0])
    mark('network')
    tiles = tiles_of(P)
    terr = [terrain_tile(P, dem, t) for t in tiles]
    q = assemble_terrain(P, terr)
    ground = Ground(P, q)
    mark('terrain')
    downtown_poly, center = downtown_of(P, S, net)
    brecs, dropped = building_records(P, S, ground, net, downtown_poly)
    blists = [buildings_tile(P, brecs, t) for t in tiles]
    bheader, bpayload, bcount = assemble_buildings(P, blists)
    mark('buildings')
    # ground mask inputs: block rings (paved downtown and on the islands), the sidewalk bands
    T = P['terrain']
    bgeoms = []
    for b in net['blocks']:
        ring = [(b[0][i], b[0][i + 1]) for i in range(0, len(b[0]), 2)]
        g = Polygon(ring)
        bgeoms.append({'ring': ring, 'g': g, 'kind': b[6]})
    net['blocks_geom'] = bgeoms
    paved = []
    for o in brecs:
        if o['btype'] in ('rowhouse', 'shed'):
            continue
        dt = downtown_poly is not None and downtown_poly.contains(Point(o['cx'], o['cz']))
        paved.append(o['g'].buffer(12 if dt else 8, quad_segs=2))
    net['paved'] = polygons(unary_union(paved)) if paved else []
    bidx = {'tree': shapely.STRtree([o['g'] for o in brecs]), 'paved': shapely.STRtree(net['paved']) if net['paved'] else None}
    desert = P['frame'].lon0 < -104 and P['frame'].lat0 < 37.5
    trees = []
    for t in tiles:
        trees += trees_tile(P, net, bidx, t, desert)
    mark('trees')
    bands = []
    for l in net['links']:
        if l['sw'] <= 0 or l['flags'] & FLAGS['pedestrian']:
            continue
        line = LineString([net['nodes'][l['a']], *l['inner'], net['nodes'][l['b']]])
        bands.append(line.buffer(l['w'] / 2 + l['sw'], quad_segs=4))
    net['sidewalk_band'] = unary_union(bands) if bands else None
    mx0, mz0 = T['x0'], T['z0']
    mw, mh = int((T['w'] - 1) * CELL), int((T['h'] - 1) * CELL)
    mask = np.zeros((mh, mw), dtype=np.uint8)
    for t in tiles:
        m = mask_tile(P, net, ground, t, mx0, mz0, mw, mh)
        if m is None:
            continue
        hh, ww = m['a'].shape
        mask[m['z0']:m['z0'] + hh, m['x0']:m['x0'] + ww] = m['a']
    mark('groundmask')
    places, spawns = build_places(P, S, net, ground, center)
    mark('places')

    # --- package
    F, B = P['frame'], P['box']
    out = os.path.join(out_root, pid)
    os.makedirs(os.path.join(out, 'data'), exist_ok=True)
    theader = {'format': 'sf-terrain', 'version': 1, 'box': 'pkg', 'cell': CELL, 'originX': T['x0'], 'originZ': T['z0'], 'w': T['w'], 'h': T['h'],
               'minH': T['minH'], 'maxH': T['maxH'], 'scale': T['scale'], 'waterLevel': P['waterLevel'],
               'datum': 'NAVD88 m minus %d' % F.y_offset, 'source': [os.path.basename(s['url']) for s in dem[4]]}
    mheader = {'format': 'sf-groundmask', 'version': 1, 'box': 'pkg', 'cell': MASK_CELL, 'originX': mx0, 'originZ': mz0, 'w': mw, 'h': mh,
               'classes': list(MASK)}
    files = {
        'data/terrain.bin.gz': gz(sfb1(theader, q.tobytes())),
        'data/buildings.bin.gz': gz(sfb1(bheader, bpayload)),
        'data/groundmask.bin.gz': gz(sfb1(mheader, mask.tobytes())),
    }
    spawn = spawns.get('downtown') or next(iter(spawns.values()), None)
    land = [flat(neg_ring([(B['x0'] - MARGIN + 2, B['z0'] - MARGIN + 2), (B['x1'] + MARGIN - 2, B['z0'] - MARGIN + 2),
                           (B['x1'] + MARGIN - 2, B['z1'] + MARGIN - 2), (B['x0'] - MARGIN + 2, B['z1'] + MARGIN - 2)]))]
    parks = []
    if net['parks']:
        for g, n, sub in net['parks']['items']:
            for pp in polygons(g):
                parks.append({'name': n, 'cat': sub, 'acres': round(pp.area / 4046.86, 1), 'rings': [flat(neg_ring(list(pp.exterior.coords)))]})
    water = []
    if P['water'] is not None:
        for pp in polygons(P['water']):
            water.append({'name': '', 'ring': flat(neg_ring(list(pp.simplify(1.0).exterior.coords)))})
    stats = {
        'buildings': bcount, 'buildingsDroppedOnRoads': dropped, 'roadLinks': len(net['roadGraph']['links']), 'roadNodes': len(net['roadGraph']['nodes']) // 2,
        'blocks': len(net['blocks']), 'islands': sum(1 for b in net['blocks'] if b[6] == 'island'), 'places': len(places),
        'heightsFromOverture': sum(1 for o in brecs if o['r']['height'] is not None), 'oneway': net['stats']['oneway'], 'trees': len(trees),
    }
    manifest = {
        'format': 'hometown-package', 'version': 1, 'id': pid, 'name': name,
        'compiler': {'name': 'hometown', 'version': COMPILER_VERSION, 'tile': TILE},
        'sources': {
            'overture': {'release': fetch['overture']['release'], 'layers': fetch['overture']['layers'], 'licenses': LICENSES},
            'dem': fetch['dem'],
            'bbox': fetch['bbox'], 'readBbox': fetch['readBbox'], 'resolvedBy': fetch.get('resolvedBy'),
        },
        'attribution': ATTRIBUTION,
        'frame': {'units': 'm', 'lat0': F.lat0, 'lon0': F.lon0, 'east': '+x', 'north': '-z', 'up': '+y', 'headingZero': '+z',
                  'yOffset': F.y_offset, 'datum': 'NAVD88', 'projection': 'local equirectangular on the WGS84 ellipsoid at lat0 (SF tools/geo-base.mjs)'},
        'box': {k: q1(v) for k, v in B.items()},
        'waterLevel': P['waterLevel'],
        'tiles': [list(t) for t in tiles],
        'stats': stats,
        'files': {},
    }
    GEO = {
        'version': 2, 'city': name, 'pkg': pid,
        'frame': {'lat0': F.lat0, 'lon0': F.lon0, 'units': 'm', 'bearingDeg': 0, 'up': 'NAVD88 m minus %d' % F.y_offset, 'yOffset': F.y_offset},
        'box': {'name': 'pkg', **{k: q1(v) for k, v in B.items()}},
        'data': {'terrain': {'url': 'data/terrain.bin', 'waterLevel': P['waterLevel'], 'minH': T['minH'], 'maxH': T['maxH']},
                 'buildings': {'url': 'data/buildings.bin', 'count': bcount}, 'groundMask': {'url': 'data/groundmask.bin'}},
        'land': land, 'blocks': net['blocks'], 'roadGraph': net['roadGraph'], 'parks': parks, 'piers': [], 'water': water, 'rail': [],
        'trolley': [], 'muniStops': [], 'bikeways': [], 'trees': [v for t in trees for v in t], 'transit': [], 'landmarks': {}, 'bridges': {},
    }
    PLACE_DATA = {'source': 'hometown ' + COMPILER_VERSION, 'neighborhoods': [], 'regional': {}}
    for k, s in spawns.items():
        PLACE_DATA['regional']['pkg_' + k] = {'x': s['x'], 'z': s['z'], 'heading': s['heading'], 'name': s['name']}
    # how busy its streets are (the engine's traffic and the street crowd, 0.15..1): buildings per km2 of the box
    km2 = (B['x1'] - B['x0']) * (B['z1'] - B['z0']) / 1e6
    density = round(min(1.0, max(0.15, 0.15 + bcount / max(km2, 0.1) / 2000)), 2)
    stats['density'] = density
    PKG = {'id': pid, 'name': name, 'compiler': COMPILER_VERSION, 'tileSize': TILE, 'density': density, 'spawn': spawn, 'spawns': spawns, 'places': places,
           'attribution': ATTRIBUTION, 'frame': manifest['frame'], 'box': manifest['box'], 'tiles': manifest['tiles'],
           'downtown': {'x': q1(center[0]), 'z': q1(center[1])}}
    js = ('// geodata.js: GENERATED by tools/hometown/compile.py %s for "%s", do not edit by hand.\n'
          '// Map data: %s.\n(function () {\nwindow.NYC = window.NYC || {};\nwindow.NYC.GEO = %s;\nwindow.NYC.PLACE_DATA = %s;\nwindow.NYC.PKG = %s;\n})();\n') % (
        COMPILER_VERSION, name, '; '.join(ATTRIBUTION), json.dumps(GEO, separators=(',', ':')), json.dumps(PLACE_DATA, separators=(',', ':')),
        json.dumps(PKG, separators=(',', ':')))
    files['geodata.js'] = js.encode()
    for k, b in sorted(files.items()):
        with open(os.path.join(out, k), 'wb') as f:
            f.write(b)
        manifest['files'][k] = {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
    total = sum(v['bytes'] for v in manifest['files'].values())
    manifest['size'] = {'bytes': total, 'bytesPerBuilding': round(total / max(1, bcount), 1),
                        'buildingsBytesPerBuilding': round(manifest['files']['data/buildings.bin.gz']['bytes'] / max(1, bcount), 1)}
    mark('write')
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write('\n')
    print(json.dumps({'id': pid, 'stats': stats, 'size': manifest['size'], 'timings': timings, 'total_s': round(time.time() - t0, 1)}), flush=True)
    return manifest


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--name')
    ap.add_argument('--data', default=os.path.join(HERE, '../../.scratch/hometown-m2/data'))
    ap.add_argument('--out', default=os.path.join(HERE, '../../cities/pkg/packages'))
    a = ap.parse_args()
    compile_place(a.id, os.path.abspath(os.path.join(a.data, a.id)), os.path.abspath(a.out), a.name)
