# tools/hometown/compile.py: Hometown compiler 0.4.0 on the national grid hg1 (grid.py). A TILE is compiled from its
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
import grade  # noqa: E402
from sources import Sources, blocks_for, MissingRegion  # noqa: E402
import rects as rects_mod  # noqa: E402
import shapely.ops  # noqa: E402

# bump on ANY change to a tile's bytes (a rule, a constant, an output field). 0.1.0 90bae8c; 0.2.0 water rule, 1 cm
# steps, density, paved lots, yard trees, edge cuts, tunnels, bridges, slopes, integer tree hash; 0.3.0 hg1 national grid:
# per-tile compile from tile + halo sources and ctx blocks (no whole-place inputs), split-at-grid-line roads with border
# nodes, centroid-owned buildings, absolute cm heights + wet mask, per-polygon water levels; 0.4.0 overnight merge: the
# DEM snapshot pin (If-Match reads), far-field tiles, sf-buildings v4 shapes, decks at height and lanes from data
COMPILER_VERSION = '0.4.0'
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
FLAGS = {'freeway': 1, 'tunnel': 2, 'ramp': 4, 'pedestrian': 8, 'private': 16, 'alley': 32, 'crooked': 64, 'deck': 128}
# ---- grade separation and lanes (grade-lanes; tools/hometown/grade.py, README "Decks and lanes")
CULVERT_MAX = 25.0   # m: a bridge span shorter than this with no road and no water under it stays a terrain raise
CLEAR_ROAD = 6.5     # m: a deck over a road (5.1 m clearance + the 1.4 m deck)
CLEAR_RAIL = 8.4     # m: ... over rail (23 ft + the deck)
CLEAR_WATER = 6.0    # m: ... over water (3.0 over a narrow channel, NARROW_WATER m of wet stations or less)
CLEAR_STREAM = 3.0
NARROW_WATER = 20.0
CLEAR_MARGIN = 0.3   # m added to every clearance (the vertical curves round crests off)
DECK_SHRINK = 10.0   # m: the roadway (asphalt, no curb island, no building) runs this far onto a deck from each abutment
DECK_UNDER = 1.4     # m: the deck's thickness (its underside: the profile minus this)
ISLAND_W = 6.0       # m: a curb island narrower than this is a median or a strip (sidewalk), wider ground is a block
TUNNEL_COVER = 6.0   # m: a building over a tunnel's road with less ground than this over it is dropped (a portal's cut)
PORTAL_PAD = 30.0    # m: a tunnel link's roadway runs this far in from a portal (the cut before the bore)
PROMOTE_PAD = 25.0   # m: a mis-tagged crossing's deck runs this far past the road under it, each side
OVERLAP_END = 40.0   # m: a lower road running under a deck counts from this far in from an abutment
CLUSTER_CAP = 6000.0  # m: a grade group's extent; past it the group is cut at its pieces' L3 home cells (clusterSplit)
GROUP_CELL = (819200, 409600)  # cm: a deck piece's home cell (its first point's) at L4 and, for a cut group, L3
GROUP_REACH = 80.0   # m: the deck pieces a deck piece interacts with (crossing, or another level alongside) lie within
ENSURE_PAD = 120.0   # m: the rows loaded round a deck piece before anything is computed from them
URBAN_BLD = 340      # buildings within 300 m (1200 per km2): the urban lane defaults
LANE_W = 3.4
MAINLINE = ('motorway', 'trunk')
OSM_ROADS = {'path': None, 'meta': None}   # the national side table (osm_roads.py): set by set_osm_roads()


def set_osm_roads(path):
    if path and os.path.exists(path):
        OSM_ROADS['path'] = path
        mp = path + '.json'
        OSM_ROADS['meta'] = json.load(open(mp)) if os.path.exists(mp) else {'sha256': hashlib.sha256(open(path, 'rb').read()).hexdigest()}


def osm_int(v):
    """'3' -> 3; '2;3' -> 3 (the larger); junk -> None"""
    if v is None:
        return None
    best = None
    for part in str(v).replace(',', ';').split(';'):
        try:
            n = int(float(part.strip()))
        except ValueError:
            continue
        if 0 < n <= 12:
            best = n if best is None else max(best, n)
    return best


def osm_float(v):
    if v is None:
        return None
    t = str(v).strip().lower().replace('m', '').strip()
    try:
        f = float(t.split(';')[0])
    except ValueError:
        return None
    return f if 2 <= f <= 60 else None


def osm_speed(v):
    if v is None:
        return None
    t = str(v).strip().lower()
    try:
        if 'mph' in t:
            return float(t.replace('mph', '').strip())
        return float(t.split(';')[0]) / 1.609344
    except ValueError:
        return None


def class_lanes(cls, link, oneway, divided, urban, spd, w_rule):
    """(per-direction lanes or (fwd, back), source) from the class defaults (spec B3): one-way -> n, two-way -> per side."""
    if link:
        return (2 if (w_rule or 0) >= 7 else 1), 'class'
    if cls == 'motorway':
        return (3 if urban else 2), 'class'
    if cls == 'trunk':
        return (2 if (divided or oneway) else (2 if urban else 1)), 'class'
    if cls == 'primary':
        if oneway and not divided:
            return (3 if urban else 2), 'class'
        return (2 if urban else 1), 'class'
    if cls == 'secondary':
        if oneway and not divided:
            return (2 if urban and (spd or 0) >= 40 else 1), 'class'
        return (2 if urban and (spd or 0) >= 40 else 1), 'class'
    return 1, 'class'
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
           'garage', 'era', 'frontW', 'row', 'storeyH', 'stories', 'facade', 'podium',
           # v4 (appended): what it is, its roof, walls / colours (Overture's when present, else 0: the engine's region
           # palette), the road side (degrees in the session frame, -1 none) and its distance (0.25 m), the base above
           # the ground (parts, canopies)
           'kind', 'roofShape', 'wall', 'wallRGB', 'roofRGB', 'front', 'frontDist', 'minH']
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


MOTOR = ('motor_vehicle', 'vehicle', 'car')


def access_dirs(ar):
    """The one-way rules of a segment: [(dir, b0, b1)] (dir 1: only forwards along it, -1: only backwards; [b0, b1] its
    stretch). A heading denial counts when its modes are absent or include a motor vehicle; bicycle/foot-only denials,
    `during` rules and `using`/`vehicle` qualifiers (destination, dimensions) are ignored."""
    out = []
    for a in ar or []:
        w = a.get('when') or {}
        if a.get('access_type') != 'denied' or not w.get('heading') or w.get('using') or w.get('vehicle') or w.get('during'):
            continue
        modes = w.get('mode') or []
        if modes and not any(m in MOTOR for m in modes):
            continue
        b0, b1 = tuple(a['between']) if a.get('between') else (0.0, 1.0)
        out.append((1 if w['heading'] == 'backward' else -1, b0, b1))
    return out


def access_dir(ar, a0=0.0, a1=1.0):
    """The one-way direction of the stretch [a0, a1] of a segment (the last rule covering it wins)."""
    d = 0
    for dd, b0, b1 in access_dirs(ar):
        if b0 <= a0 + 1e-9 and a1 <= b1 + 1e-9:
            d = dd
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



# ------------------------------------------------------------------------------------------------- building shapes (v4)
# What a building is (kind), its roof, its front and its masses, from its own row, the places inside it, the land use
# under it, its neighbours within 0.5 m and the roads within 12 m: only Sources queries round the footprint, so the record
# is the same in every tile compile that reads it. Overture's roof_shape / roof_height / building_part win where present;
# the rest are estimates (README "Rules that are estimates").
KINDS = ['unknown', 'house', 'garage', 'shed', 'rowhouse', 'apartment', 'shop', 'office', 'church', 'school', 'civic', 'warehouse', 'canopy', 'tower']
ROOF_SHAPES = ['unknown', 'flat', 'gabled', 'hipped', 'half_hipped', 'gambrel', 'mansard', 'pyramidal', 'skillion', 'saltbox', 'dome', 'round', 'sawtooth',
               'other']
WALLS = ['unknown', 'clapboard', 'brick', 'stucco', 'stone', 'siding', 'wood', 'concrete', 'metal', 'glass']
REGIONS = ['plains-midwest', 'southwest', 'southeast', 'northeast-rust', 'pacific-nw', 'mountain', 'california']
KIND_TYPE = {'house': 'rowhouse', 'garage': 'shed', 'shed': 'shed', 'canopy': 'shed', 'rowhouse': 'rowhouse', 'apartment': 'apartment', 'shop': 'office-low',
             'office': 'office-low', 'church': 'civic', 'school': 'civic', 'civic': 'civic', 'warehouse': 'warehouse', 'tower': 'tower'}
HOUSE_CLASS = {'house', 'detached', 'semidetached_house', 'residential', 'bungalow', 'cabin', 'farm', 'static_caravan', 'hut'}
CHRISTIAN = {'christian_place_of_worship'}
OTHER_WORSHIP = {'jewish_place_of_worship', 'muslim_place_of_worship', 'buddhist_place_of_worship', 'hindu_place_of_worship', 'place_of_worship'}
SCHOOL_PLACES = {'elementary_school', 'middle_school', 'high_school', 'preschool'}
GAS_PLACES = {'gas_station', 'fueling_station'}
SHOP_WORDS = ('store', 'shop', 'restaurant', 'eatery', 'cafe', 'coffee', 'bar', 'bakery', 'salon', 'barber', 'bank', 'pharmacy', 'grocery', 'supermarket',
              'diner', 'pizza', 'laundromat', 'dealer', 'boutique')
RETAIL_LU = {'retail', 'commercial'}
INDUSTRIAL_LU = {'industrial', 'quarry', 'landfill'}
FRONT_REACH = 12.0


def region_of(lon, lat):
    """A tile's building region from its centre (coarse US regions, an estimate: wall and roof mixes by region)."""
    if lon < -116.5 and lat >= 42:
        return 'pacific-nw'
    if lon < -114.5 and lat < 42:
        return 'california'
    if lon < -103 and lat < 37.5 or (lon < -100 and lat < 32.5):
        return 'southwest'
    if lon < -102:
        return 'mountain'
    if (lon > -91 and lat > 39) or (lon > -81 and lat > 37.6):
        return 'northeast-rust'
    if lon > -94.6 and lat < 36.6:
        return 'southeast'
    return 'plains-midwest'


def _place_set(src, g, reach=0.0):
    out = []
    for p in src.places_in(g.buffer(reach) if reach else g):
        if (p['confidence'] or 0) < 0.45 or (p['operating_status'] and p['operating_status'] != 'open'):
            continue
        out.append(((p['basic_category'] or ''), (p['cat'] or '')))
    return out


def _land_use_at(src, pt):
    for lu in src.query('land_use', pt):
        if lu['geom'].geom_type in ('Polygon', 'MultiPolygon'):
            return (lu['subtype'] or ''), (lu['class'] or '')
    return '', ''


def _short_half(rects):
    if not rects:
        return 3.0
    cx, cz, w, d = max(rects, key=lambda q: (q[2] * q[3], q))
    return min(w, d) / 2


def shape_building(W, r, rec, near, downtown):
    """Kind, roof, front, row and masses of a brec (and its parts), in place."""
    src = W.src
    wg, area, h = rec['g'], rec['area'], rec['h']
    cls = (r['class'] or '').lower()
    sub = (r['subtype'] or '').lower()
    pts = neg_ring(list(wg.exterior.coords))
    theta = -dominant_angle(pts)
    rec['theta'] = theta
    # neighbours within 0.5 m (shared walls)
    nb = 0
    gb = wg.buffer(0.5, quad_segs=2)
    for o in src.query('buildings', gb):
        if o['id'] == r['id'] or o['is_underground']:
            continue
        og = largest_polygon(o['geom'])
        if og is not None and og.buffer(0).intersection(gb).area > 0.6:
            nb += 1
    row = nb + 1
    # the roadway edge within FRONT_REACH: the outward direction and the distance
    roads = []
    for p in sorted(near, key=lambda p: (p['seg'], p['i'])):
        if p['flags'] & (FLAGS['pedestrian'] | FLAGS['freeway'] | FLAGS['tunnel']):
            continue
        roads.append(LineString([(x / 100.0, z / 100.0) for x, z in p['pts']]).buffer(p['w'] / 2, quad_segs=4))
    front, front_d = -1, 0
    if roads:
        ru = unary_union(roads)
        dist = wg.distance(ru)
        if dist <= FRONT_REACH:
            a, b = shapely.ops.nearest_points(wg, ru)
            c0 = wg.centroid
            dx, dz = b.x - c0.x, b.y - c0.y
            if dx * dx + dz * dz > 1e-6:
                # (degrees in the tile frame: 0 = +x (east), 90 = +z (south))
                front = int(round(math.degrees(math.atan2(dz, dx)))) % 360
                front_d = int(round(dist * 4))
    rp = wg.representative_point()
    lu_sub, lu_cls = _land_use_at(src, rp)
    places = _place_set(src, wg)
    pcat = {a for a, _ in places} | {b for _, b in places}
    shopish = any(any(w in c for w in SHOP_WORDS) for c in pcat)
    minh = float(r['min_height'] or 0)
    # kind
    if cls in ('church', 'cathedral', 'chapel') or pcat & CHRISTIAN:
        kind = 'church'
    elif cls in ('mosque', 'synagogue', 'temple', 'shrine', 'religious') or pcat & OTHER_WORSHIP:
        kind = 'civic'
    elif cls in ('school', 'kindergarten') or pcat & SCHOOL_PLACES:
        kind = 'school'
    elif cls in CIVIC:
        kind = 'civic' if cls not in ('university', 'college') else 'school'
    elif cls in ('roof', 'carport', 'shelter') or (minh >= 3.5 and h < 9):
        gas = any(a in GAS_PLACES for a, _ in _place_set(src, wg, 20.0))
        kind = 'canopy' if (minh >= 3.5 or gas) and h < 9 else 'shed'
    elif cls in ('garage', 'garages'):
        kind = 'garage'
    elif cls in SHEDS or area < 30:
        kind = 'shed'
    elif h >= 45:
        kind = 'tower'
    elif cls in WAREHOUSE or (lu_sub in INDUSTRIAL_LU and area > 400) or (area > 1500 and h < 12):
        kind = 'warehouse'
    elif cls in SHOPS or shopish or (row >= 2 and (lu_sub in RETAIL_LU or lu_cls in RETAIL_LU) and 0 <= front < 360 and front_d < 24):
        kind = 'shop'
    elif cls in ('office', 'hotel'):
        kind = 'office'
    elif cls in HOUSE_CLASS and h <= 12 and area < 450 and row < 3:
        kind = 'house'
    elif row >= 3 and h <= 15 and area < 450:
        kind = 'rowhouse'
    elif h >= 18:
        kind = 'office' if downtown else 'apartment'
    elif cls in ('apartments', 'dormitory'):
        kind = 'apartment'
    elif downtown and area > 120:
        kind = 'shop' if h < 12 else 'office'
    elif h <= 10 and area < 400 and lu_sub not in RETAIL_LU | INDUSTRIAL_LU and lu_cls not in RETAIL_LU:
        kind = 'house' if row < 3 else 'rowhouse'
    elif h <= 10 and area < 400:
        kind = 'shop'
    elif h < 8:
        # (a large low building off the downtown: a one-storey commercial block)
        kind = 'office'
    else:
        kind = 'apartment'
    btype = KIND_TYPE[kind]
    if btype in ('office-low', 'apartment') and h >= 18:
        btype = 'midrise'
    rec['btype'] = btype
    if kind == 'shop':
        rec['shops'] = 1
    # the masses: rectangles over the footprint in the building's turn
    cov, rects = rects_mod.rect_cover(pts, theta)
    # roof: data first, then the kind's rule (houses: the engine's region table picks the shape, the height is laid here)
    rs = (r['roof_shape'] or '').lower()
    shape = ROOF_SHAPES.index(rs) if rs in ROOF_SHAPES else (ROOF_SHAPES.index('other') if rs else 0)
    rh = r['roof_height']
    half = _short_half(rects)
    pitched_kind = kind in ('house', 'garage', 'church')
    if rh is not None and rh > 0:
        roof_h = min(float(rh), h * 0.6)
    elif shape in (0,) and pitched_kind or shape >= 2 and shape != ROOF_SHAPES.index('other'):
        k = 0.62 if kind == 'church' else 0.38
        roof_h = min(9.0 if kind == 'church' else 3.0, max(0.75, k * half))
        if kind == 'church' and shape == 0:
            shape = ROOF_SHAPES.index('gabled')
    else:
        roof_h = 0.0
    if roof_h > 0:
        # Overture's height is the top of the roof; a defaulted height is the eave
        eave = max(2.7, h - roof_h) if rec['heightFromOverture'] else h
        rec['h'], rec['peakAdd'] = eave, roof_h
    elif kind == 'tower' and shape in (0, 1):
        # towers: a crown (penthouse) on half of them, a podium setback on the broad ones (estimates)
        hz = hash01(rec['gx'] // 100, rec['gs'] // 100, 71)
        rec['peakAdd'] = 7.0 + 4.0 * hash01(rec['gx'] // 100, rec['gs'] // 100, 72) if hz < 0.5 else 0.6
    podium = 0.0
    if kind == 'tower' and area > 1200 and not src.parts_of.get(r['id']):
        podium = round(0.45 + 0.25 * hash01(rec['gx'] // 100, rec['gs'] // 100, 73), 2)
    # front width: the largest mass's side facing the road
    frontw = 0.0
    if front >= 0 and rects:
        cx, cz, w, d = max(rects, key=lambda q: (q[2] * q[3], q))
        fa = math.radians(front)
        # local axes: +x along (cos t, -sin t), +z along (sin t, cos t); the side facing the road is the one across it
        ax = abs(math.cos(fa) * math.cos(theta) - math.sin(fa) * math.sin(theta))
        frontw = d if ax > 0.7071 else w
    rec.update({'kind': kind, 'roofShape': shape, 'front': front, 'frontDist': front_d, 'row': row, 'minH': minh, 'cover': cov,
                'rects': rects if cov >= 0.9 or kind in ('house', 'garage', 'church') else [], 'frontW': frontw, 'podium': podium,
                'bays': min(2, int(frontw // 3.5)) if kind == 'rowhouse' else 0})
    # parts: a building whose parts cover 90% of it is drawn as its parts (each its own heights and masses)
    rec['parts'] = []
    plist = src.parts_of.get(r['id']) or []
    if plist:
        pg = []
        for pr in plist:
            g = largest_polygon(pr['geom'].buffer(0)) if pr['geom'].geom_type in ('Polygon', 'MultiPolygon') else None
            if g is None or g.area < 4:
                continue
            g = Polygon(g.exterior).simplify(0.25)
            if g.is_empty or g.geom_type != 'Polygon' or g.area < 4:
                continue
            ph = float(pr['height']) if pr['height'] is not None else (pr['num_floors'] * 3.3 + 0.8 if pr['num_floors'] else h)
            pmin = float(pr['min_height'] or 0)
            if ph - pmin < 1.0:
                continue
            ppts = neg_ring(list(g.exterior.coords))
            pth = -dominant_angle(ppts)
            pc, prs = rects_mod.rect_cover(ppts, pth)
            pg.append({'id': pr['id'], 'g': g, 'h': ph, 'minH': pmin, 'theta': pth, 'rects': prs if pc >= 0.9 else []})
        if pg and unary_union([q['g'] for q in pg]).intersection(wg).area >= 0.9 * wg.area:
            rec['parts'] = pg


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
                            'policy': 'every 3DEP file at its snapshot ETag; range reads If-Match; bytes mirrored at dem/{product}/{name}/{etag}/'},
            'osmRoads': None if not OSM_ROADS['meta'] else {k: OSM_ROADS['meta'].get(k) for k in ('source', 'sha256', 'ways')}}


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
        self.lanes_c, self.osm_c, self.deck_c, self.prof_c, self.gstats = {}, None, {}, {}, {}
        self.seg_rows, self.iv_c, self.cross_c = {}, {}, {}
        self.files_c, self.grp_c, self.near_c, self.base_c, self.l4_c, self.tline_c = {}, {}, {}, {}, {}, {}
        self.data = data
        self.log = log or (lambda *a: None)

    # ---- the DEM files behind a cached value (demSource): a value computed once is reused with its files
    def memo(self, cache, key, fn):
        fk = (id(cache), key)
        if key in cache:
            self.dem.add(self.files_c.get(fk, ()))
            return cache[key]
        with self.dem.record() as fs:
            v = fn()
        cache[key] = v
        self.files_c[fk] = frozenset(fs)
        return v

    # ---- rows: a grade group reaches past the tile's own window; its rows are loaded wherever it goes, so it is the
    # same group in a tile compiled alone and in any place round it (a region not fetched refuses the tile)
    def ensure(self, x0, z0, x1, z1):
        if self.src.covered(x0, z0, x1, z1):
            return
        need = sorted(set(self.src.blocks) | set(blocks_for(x0, z0, x1, z1)))
        self.log(jdump({'loadRegions': [list(b) for b in need if b not in set(self.src.blocks)]}))
        self.src = Sources(self.data, self.dom_name, need, skip_missing=True)
        self.osm_c = None
        self.src.require(x0, z0, x1, z1, 'grade group')

    def ensure_piece(self, p):
        b = self.pgeom(p)[0].bounds
        self.ensure(b[0] - ENSURE_PAD, b[1] - ENSURE_PAD, b[2] + ENSURE_PAD, b[3] + ENSURE_PAD)

    # ---- ctx
    def ctx_block(self, C, R):
        if (C, R) not in self.ctxs:
            k = ctx_key(self.bid, self.dom_name, C, R)
            b = self.store.get(k) if self.store else None
            if b is None:
                with self.dem.record(isolated=True):
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
        _, _, sw, rank = ROAD[cls]
        d = access_dir(s['access_restrictions'])
        LN = self.lanes(s, d)
        w, lanes = LN['w'], LN['lf'] + LN['lb']
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
        if flagged(s['road_flags'], 'is_under_construction') or flagged(s['road_flags'], 'is_abandoned'):
            return out
        self.seg_rows[sid] = s
        lv = [(r.get('value') or 0, tuple(r['between']) if r.get('between') else (0.0, 1.0)) for r in s['level_rules'] or []]
        cs = sorted([(c['at'], c['connector_id']) for c in s['connectors'] or [] if c.get('connector_id') is not None and c.get('at') is not None])
        if len(cs) < 2:
            return out
        # (a tunnel's portals split the road too (node 'p:{segment}:{portal at, 1e-9}'), so a piece is all tunnel or
        # none of it: the bridge that runs into Fort Pitt's tunnel ends at the portal, the tunnel link starts there)
        for t0, t1 in spans['is_tunnel']:
            for t in (t0, t1):
                if cs[0][0] < t < cs[-1][0] and all(abs(t - a) * L >= 1.0 for a, _ in cs):
                    cs.append((t, 'p:%s:%d' % (sid, round(t * 1e9))))
        cs.sort()
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
            # (a piece more than half underground is a tunnel link: kept, so the road through it connects (Fort Pitt's
            # bridge runs straight into its tunnel); the engine bores it where the hill stands over it, and the ground
            # above its interior is not roadway (ground_lines))
            under = sum(max(0, min(a1, t1) - max(a0, t0)) for t0, t1 in spans['is_tunnel'] if (t0, t1) != (0.0, 1.0))
            pflags = flags | (FLAGS['tunnel'] if under > 0.5 * (a1 - a0) else 0)
            pts = [(cm(x), cm(z)) for x, z in shapely.get_coordinates(piece.simplify(0.4))]
            pts[0], pts[-1] = snap(Point(piece.coords[0])), snap(Point(piece.coords[-1]))
            # (consecutive duplicate cm points dropped)
            q = [pts[0]]
            for p in pts[1:]:
                if p != q[-1]:
                    q.append(p)
            if len(q) < 2:
                continue
            # (per piece: a one-way rule over part of the segment; its level and bridge/tunnel stretches as fractions of it)
            dp = access_dir(s['access_restrictions'], a0, a1)
            lf, lb = (LN['lf'], LN['lb']) if dp == d else ((max(LN['lf'], LN['lb']), 0) if dp > 0 else (0, max(LN['lf'], LN['lb'])) if dp < 0 else (max(1, LN['lf']), max(1, LN['lb'])))
            mid = (a0 + a1) / 2
            lvl = 0
            for v, (t0, t1) in lv:
                if t0 <= mid <= t1:
                    lvl = v

            def frac(iv):
                o = []
                for t0, t1 in iv:
                    f0, f1 = max(0.0, (t0 - a0) / (a1 - a0)), min(1.0, (t1 - a0) / (a1 - a0))
                    if f1 - f0 > 1e-6:
                        o.append((f0, f1))
                return o
            out.append({'seg': sid, 'i': k, 'a': c0, 'b': c1, 'pts': q, 'w': w, 'lanes': lf + lb, 'dir': dp, 'flags': pflags, 'sw': sw,
                        'cls': cls, 'rank': rank, 'name': name, 'lf': lf, 'lb': lb, 'spd': LN['spd'], 'lsrc': LN['src'], 'lvl': lvl,
                        'link': s['subclass'] == 'link', 'br': frac(spans['is_bridge']), 'tun': frac(spans['is_tunnel']), 'f0': a0, 'f1': a1,
                        'tspan': next(((t0, t1) for t0, t1 in spans['is_tunnel'] if t0 <= mid <= t1), None),
                        'brs': [(t0, t1) for t0, t1 in spans['is_bridge'] if min(a1, t1) - max(a0, t0) > 1e-6]})
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

    # ---- lanes, widths (pure per segment): OSM tags (side table) > width_rules > class defaults (spec B)
    def osm_tags(self, sid):
        ex = self.src.extras
        if ex is None or not OSM_ROADS['path']:
            return None
        if self.osm_c is None:
            ways = sorted(set(w for w, _ in ex.values() if w is not None))
            self.osm_c = {}
            if ways:
                c = duckdb.connect()
                c.execute('CREATE TABLE w (way_id BIGINT)')
                c.executemany('INSERT INTO w VALUES (?)', [(v,) for v in ways])
                cur = c.execute("SELECT t.* FROM read_parquet('%s') t SEMI JOIN w ON t.way_id = w.way_id ORDER BY t.way_id" % OSM_ROADS['path'].replace("'", "''"))
                cols = [x[0] for x in cur.description]
                for row in cur.fetchall():
                    r = dict(zip(cols, row))
                    self.osm_c[r['way_id']] = r
        w = ex.get(sid, (None, None))[0]
        return self.osm_c.get(w) if w is not None else None

    def lanes(self, s, d):
        sid = s['id']
        if sid in self.lanes_c:
            return self.lanes_c[sid]
        cls = s['class'] or 'unknown'
        link = s['subclass'] == 'link'
        w0, lanes0, _, _ = ROAD[cls]
        wr = [r['value'] for r in s['width_rules'] or [] if r.get('value') and not r.get('between')]
        w_rule = float(wr[0]) if wr and 3 <= wr[0] <= 40 else None
        ex = self.src.extras
        spd = ex.get(sid, (None, None))[1] if ex else None
        osm = self.osm_tags(sid)
        lf = lb = None
        src = None
        turn = False
        if osm:
            if spd is None:
                spd = osm_speed(osm.get('maxspeed'))
            n, f, b = osm_int(osm.get('lanes')), osm_int(osm.get('lanes_forward')), osm_int(osm.get('lanes_backward'))
            if d:
                k = n or (f if d > 0 else b)
                if k:
                    lf, lb = (k, 0) if d > 0 else (0, k)
            elif f and b:
                lf, lb = f, b
            elif n:
                if f:
                    lf, lb = f, max(1, n - f)
                elif b:
                    lf, lb = max(1, n - b), b
                else:
                    per = max(1, n // 2)
                    lf = lb = per
                    turn = n >= 3 and n % 2 == 1
            if lf is not None:
                src = 'osm'
            if 'left' in str(osm.get('turn_lanes') or '') and not d and n and n % 2 == 1:
                turn = True
            if w_rule is None:
                w_rule = osm_float(osm.get('width'))
        if src is None and w_rule:
            if d:
                k = int((w_rule - 1.0) // 3.3)
                if k >= 1:
                    lf, lb = (k, 0) if d > 0 else (0, k)
                    src = 'width'
            else:
                k = int((w_rule / 2 - 0.5) // 3.3)
                if k >= 1:
                    lf = lb = k
                    src = 'width'
        if src is None:
            g = s['geom']
            mid = g.interpolate(0.5, normalized=True)
            urban = len(self.src.query('buildings', mid.buffer(300))) >= URBAN_BLD
            divided = False
            if d and s['name']:
                t = g.interpolate(min(1.0, 0.5 + 1.0 / max(g.length, 2)), normalized=True)
                tx, tz = (t.x - mid.x) * d, (t.y - mid.y) * d
                for o in self.src.query('segments', mid.buffer(35)):
                    if o['id'] == sid or o['subtype'] != 'road' or o['name'] != s['name'] or o['geom'].geom_type != 'LineString':
                        continue
                    od = access_dir(o['access_restrictions'])
                    if not od:
                        continue
                    og = o['geom']
                    u = og.project(mid)
                    p0, p1 = og.interpolate(max(0, u - 1)), og.interpolate(min(og.length, u + 1))
                    if ((p1.x - p0.x) * tx + (p1.y - p0.y) * tz) * od < 0:
                        divided = True
                        break
            k, src = class_lanes(cls, link, d != 0, divided, urban, spd, w_rule)
            lf, lb = ((k, 0) if d > 0 else (0, k)) if d else (k, k)
        n1 = max(lf, lb)
        if d:
            wl = n1 * LANE_W + (2.2 if link else 4.2 if cls == 'motorway' else 1.0)
            wmin = 3.0 * n1 + 1
        else:
            wl = (lf + lb) * LANE_W + 1.0 + (LANE_W if turn else 0)
            wmin = 2 * (3.0 * max(lf, lb) + 0.5)
        if w_rule and w_rule >= wmin:
            w = w_rule
        elif link or cls in MAINLINE:
            w = wl
        else:
            # (streets keep their class width where it is wider: parking lanes, gutters)
            wc = max(6.0, w0 * 0.6) if (d and lanes0 >= 4) else w0
            w = max(wc, wl)
        if s['subclass'] == 'alley':
            w = min(w, 5.0)
        res = {'lf': int(lf), 'lb': int(lb), 'w': round(w, 2), 'src': src, 'spd': None if spd is None else int(round(spd))}
        self.lanes_c[sid] = res
        return res

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
        # (no signal or stop where only motorways, trunks and their links meet: merges yield by rank; none on a deck)
        free_flow = drive and all(p['cls'] in MAINLINE or p['link'] for p in drive)
        on_deck = drive and all(self.deck_touches(p, 'a' if p['a'] == cid else 'b') for p in drive)
        if free_flow or on_deck:
            res = (0, max(p['rank'] for p in drive))
        elif len(set(p['name'] for p in drive)) >= 2 and len(drive) >= 3:
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
    def bridge_lines(self, s):
        """[(b0, b1, line)]: the segment's bridge stretches long enough to be a culvert (pure per segment, no rows)."""
        ps = self.pieces(s)
        if not ps or s['geom'].geom_type != 'LineString':
            return []
        g, L = s['geom'], s['geom'].length
        out = []
        for rr in s['road_flags'] or []:
            if 'is_bridge' not in (rr.get('values') or []):
                continue
            b0, b1 = tuple(rr['between']) if rr.get('between') else (0.0, 1.0)
            if b1 - b0 <= 1e-6:
                continue
            line = shapely.ops.substring(g, b0 * L, b1 * L)
            if line.length <= 3 or line.length > CULVERT_MAX:
                continue
            out.append((b0, b1, line))
        return out

    def culvert(self, s, b0, b1, line):
        """(line, w, e0, e1, b0, b1) when this bridge stretch is a culvert (no drivable road crossing it, no water within
        w/2 + 10 m: the old terrain raise), else None. Reads the rows round the stretch alone."""
        def f():
            b = line.bounds
            self.ensure(b[0] - ENSURE_PAD, b[1] - ENSURE_PAD, b[2] + ENSURE_PAD, b[3] + ENSURE_PAD)
            w = self.pieces(s)[0]['w']
            crossing = [p for p in self.pieces_near(line) if p['seg'] != s['id'] and LineString([(x / 100.0, z / 100.0) for x, z in p['pts']]).crosses(line)]
            if crossing:
                return None
            if any(r['poly'].intersects(line.buffer(w / 2 + 10)) for r in water_polys(self.src, line.buffer(w / 2 + 10))):
                return None
            (x0, z0), (x1, z1) = line.coords[0], line.coords[-1]
            lon, lat = self.d.inverse([x0, x1], [z0, z1])
            e = self.dem.sample(lon, lat)
            return (line, w, float(e[0]), float(e[1]), b0, b1) if np.isfinite(e).all() else None
        return self.memo(self.bridge_c, (s['id'], b0, b1), f)

    def bridges(self, s, near=None):
        """The segment's culverts (those whose stretch meets `near`, if given)."""
        out = []
        for b0, b1, line in self.bridge_lines(s):
            if near is not None and not line.intersects(near):
                continue
            c = self.culvert(s, b0, b1, line)
            if c is not None:
                out.append(c)
        return out

    # ---- decks (grade-lanes, spec A): which stretches of a piece are decks, and their heights (grade.py)
    @staticmethod
    def pkey(p):
        return (p['seg'], p['i'])

    def pgeom(self, p):
        """(LineString in grid m, its length, cumulative arc per vertex)"""
        if 'geom_' not in p:
            line = LineString([(x / 100.0, z / 100.0) for x, z in p['pts']])
            cum = [0.0]
            for (x0, z0), (x1, z1) in zip(p['pts'], p['pts'][1:]):
                cum.append(cum[-1] + math.hypot(x1 - x0, z1 - z0) / 100.0)
            p['geom_'] = (line, cum[-1], cum)
        return p['geom_']

    def at_arc(self, p, ss):
        """Points (x, z arrays, grid m) at arcs ss along the piece's pts."""
        _, L, cum = self.pgeom(p)
        P = np.array(p['pts'], dtype=float) / 100.0
        ss = np.clip(np.asarray(ss, dtype=float), 0, L)
        k = np.clip(np.searchsorted(cum, ss, side='right') - 1, 0, len(cum) - 2)
        c = np.array(cum)
        t = (ss - c[k]) / np.maximum(c[k + 1] - c[k], 1e-9)
        return P[k, 0] + (P[k + 1, 0] - P[k, 0]) * t, P[k, 1] + (P[k + 1, 1] - P[k, 1]) * t

    def ground_at(self, xs, zs):
        """The final post function (the terrain the engine reads), bilinear, at grid-metre points; and wet flags."""
        xs, zs = np.asarray(xs, dtype=float), np.asarray(zs, dtype=float)
        I0, J0 = int(math.floor(xs.min() / grid.POST)) - 1, int(math.floor(zs.min() / grid.POST)) - 1
        I1, J1 = int(math.floor(xs.max() / grid.POST)) + 3, int(math.floor(zs.max() / grid.POST)) + 3
        ctx = self.context_for(I0 * grid.POST, J0 * grid.POST, I1 * grid.POST, J1 * grid.POST)
        hcm, wet, _ = self.posts_cm(I0, J0, I1, J1, ctx)
        fi, fj = xs / grid.POST - I0, zs / grid.POST - J0
        i, j = np.floor(fi).astype(int), np.floor(fj).astype(int)
        tx, tz = fi - i, fj - j
        Hm = hcm / 100.0
        g = (Hm[j, i] * (1 - tx) + Hm[j, i + 1] * tx) * (1 - tz) + (Hm[j + 1, i] * (1 - tx) + Hm[j + 1, i + 1] * tx) * tz
        w = wet[np.rint(fj).astype(int), np.rint(fi).astype(int)]
        return g, w

    def tunnel_line(self, p):
        """A tunnel link's road (pure per segment): straight from the ground at one portal of its tunnel to the ground at
        the other (the stretch of the segment its piece lies in). -> (t0, y0, t1, y1): segment fractions, m NAVD88."""
        t0, t1 = p['tspan']

        def f():
            g = self.seg_rows[p['seg']]['geom']
            pa, pb = g.interpolate(t0, normalized=True), g.interpolate(t1, normalized=True)
            self.ensure(min(pa.x, pb.x) - 50, min(pa.y, pb.y) - 50, max(pa.x, pb.x) + 50, max(pa.y, pb.y) + 50)
            y, _ = self.ground_at([pa.x, pb.x], [pa.y, pb.y])
            return (t0, float(y[0]), t1, float(y[1]))
        return self.memo(self.tline_c, (p['seg'], t0, t1), f)

    def pground(self, p):
        """(stations, ground, wet) along a piece: the post function at grade.stations(length) (cached per piece)."""
        def f():
            self.ensure_piece(p)
            ss = grade.stations(self.pgeom(p)[1])
            xs, zs = self.at_arc(p, ss)
            g, wet = self.ground_at(xs, zs)
            return (ss, [float(v) for v in g], [bool(v) for v in wet], xs, zs)
        return self.memo(self.prof_c, self.pkey(p), f)

    def crossings(self, p):
        """[(s along p, other piece, s along it)] where another drivable piece crosses p with no connector there."""
        k = self.pkey(p)
        if k in self.cross_c:
            return self.cross_c[k]
        out = []
        self.cross_c[k] = out
        line, L, _ = self.pgeom(p)
        ends = {p['a']: Point(line.coords[0]), p['b']: Point(line.coords[-1])}
        for r in sorted(self.pieces_near(line), key=self.pkey):
            if self.pkey(r) == k or r['flags'] & (FLAGS['private'] | FLAGS['pedestrian']):
                continue
            rl, _, _ = self.pgeom(r)
            if not rl.intersects(line):
                continue
            pts = [g for g in getattr(rl.intersection(line), 'geoms', [rl.intersection(line)]) if g.geom_type == 'Point']
            for pt in sorted(pts, key=lambda g: (round(g.x, 3), round(g.y, 3))):
                shared = [n for n in (r['a'], r['b']) if n in ends and ends[n].distance(pt) < 1.5]
                if shared:
                    continue
                out.append((float(line.project(pt)), r, float(rl.project(pt))))
        return out

    def deck_iv(self, p):
        """The piece's deck interval (u0, u1) in arc m, or None: its bridge stretches that are not culverts (bridges()),
        and a level > 0 stretch over an unconnected lower road the data forgot to tag (bridgeTagMissing)."""
        return self.memo(self.iv_c, self.pkey(p), lambda: self._deck_iv(p))

    def _deck_iv(self, p):
        if p['flags'] & (FLAGS['pedestrian'] | FLAGS['tunnel']) or (not p['br'] and p['lvl'] <= 0):
            return None
        _, L, _ = self.pgeom(p)
        s = self.seg_rows.get(p['seg'])
        if not p['br']:
            self.ensure_piece(p)   # (a level over a road the data did not tag: its crossings along all of it)
        # (the culvert test of its own bridge stretches only: each reads the rows round its stretch)
        own = set((round(t0, 9), round(t1, 9)) for t0, t1 in p['brs'])
        culverts = set()
        if s is not None:
            for b0, b1, line in self.bridge_lines(s):
                if (round(b0, 9), round(b1, 9)) in own and self.culvert(s, b0, b1, line) is not None:
                    culverts.add((round(b0, 9), round(b1, 9)))
        ivs = []
        for (f0, f1), (t0, t1) in zip(p['br'], p['brs']):
            if (round(t0, 9), round(t1, 9)) in culverts:
                continue
            ivs.append((f0 * L, f1 * L))
        promoted = 0
        if not p['br'] and p['lvl'] > 0:
            for sq, r, sr in self.crossings(p):
                _, Lr, _ = self.pgeom(r)
                if r['flags'] & FLAGS['tunnel'] or any(f0 * Lr <= sr <= f1 * Lr for f0, f1 in r['tun']):
                    continue
                if r['lvl'] < p['lvl'] and not any(f0 * Lr <= sr <= f1 * Lr for f0, f1 in r['br']):
                    ivs.append((max(0.0, sq - r['w'] / 2 - PROMOTE_PAD), min(L, sq + r['w'] / 2 + PROMOTE_PAD)))
                    promoted += 1
        if not ivs:
            return None
        u0, u1 = min(a for a, _ in ivs), max(b for _, b in ivs)
        if u0 < 3.0:
            u0 = 0.0
        if u1 > L - 3.0:
            u1 = L
        if u1 - u0 < 2.0:
            return None
        if promoted:
            self.gstats.setdefault('bridgeTagMissing', set()).add(p['seg'])
        return (u0, u1)

    def deck_touches(self, p, end):
        iv = self.deck_iv(p)
        if iv is None:
            return False
        return iv[0] <= 0.0 if end == 'a' else iv[1] >= self.pgeom(p)[1]

    def node_pieces(self, cid, pt):
        x, z = pt[0] / 100.0, pt[1] / 100.0
        return sorted([q for q in self.pieces_near(Point(x, z).buffer(0.05)) if (q['a'] == cid or q['b'] == cid)
                       and not q['flags'] & (FLAGS['private'] | FLAGS['pedestrian'])], key=self.pkey)

    # ---- grade groups: which deck pieces are solved together (a pure function of the global data, whichever tile asks)
    def home(self, q, lv):
        m = GROUP_CELL[lv]
        return (q['pts'][0][0] // m, q['pts'][0][1] // m)

    def deck_near(self, q):
        """The deck pieces q interacts with (symmetric: q is in each one's list): one crossing it with no shared node,
        or one of another level within max(w, w') / 2 + 15 m (a stacked deck, a viaduct alongside)."""
        def f():
            self.ensure_piece(q)
            line, _, _ = self.pgeom(q)
            kq = self.pkey(q)
            xq = set(self.pkey(r) for _, r, _ in self.crossings(q))
            out = []
            for r in sorted(self.pieces_near(line.buffer(GROUP_REACH)), key=self.pkey):
                kr = self.pkey(r)
                if kr == kq or self.deck_iv(r) is None:
                    continue
                rl, _, _ = self.pgeom(r)
                if (r['lvl'] != q['lvl'] and rl.distance(line) <= max(q['w'], r['w']) / 2 + 15) or kr in xq or \
                        kq in set(self.pkey(o) for _, o, _ in self.crossings(r)):
                    out.append(r)
            return out
        return self.memo(self.near_c, self.pkey(q), f)

    def _closure(self, p, lv):
        """(members {key: piece}, free nodes): the deck pieces reached from p through free nodes (every drivable piece
        there is on its deck at that node, all of one home cell) and deck_near(), within p's home cell at level lv."""
        members, free, todo = {}, set(), [p]
        hp = self.home(p, lv)
        while todo:
            q = todo.pop()
            kq = self.pkey(q)
            if kq in members:
                continue
            members[kq] = q
            for end in ('a', 'b'):
                nid = q[end]
                if nid in free or not self.deck_touches(q, end):
                    continue
                inc = self.node_pieces(nid, q['pts'][0] if end == 'a' else q['pts'][-1])
                if len(inc) >= 2 and all(self.home(r, lv) == hp and self.deck_touches(r, 'a' if r['a'] == nid else 'b') for r in inc):
                    free.add(nid)
                    todo += [r for r in inc if self.pkey(r) not in members]
            todo += [r for r in self.deck_near(q) if self.home(r, lv) == hp and self.pkey(r) not in members]
        return members, free

    def deck_group(self, p):
        """The grade group of a deck piece: {members, free, rank, ckey, extent, split}. Canonical: the closure is an
        equivalence class (every relation in it is symmetric), cut only at fixed home cells (L4; L3 when the L4 group is
        wider than CLUSTER_CAP), so every tile that holds any of its pieces solves the same group from the same rows."""
        k = self.pkey(p)
        if k in self.grp_c:
            G = self.grp_c[k]
            self.dem.add(G['files'])
            return G
        with self.dem.record() as fs:
            if k in self.l4_c:
                members, free = self.l4_c[k]
            else:
                members, free = self._closure(p, 0)
            ext = self._extent(members)
            split = ext > CLUSTER_CAP
            if split:
                for kk in members:
                    self.l4_c[kk] = (members, free)
                members, free = self._closure(p, 1)
                ext = self._extent(members)
        h4 = self.home(p, 0)
        rank = (h4[0], h4[1]) + ((1,) + self.home(p, 1) if split else (0, 0, 0))
        G = {'members': members, 'free': free, 'rank': rank, 'ckey': min(members), 'extent': ext, 'split': split, 'files': frozenset(fs)}
        for kk in members:
            self.grp_c[kk] = G
        return G

    def _extent(self, members):
        bb = [math.inf, math.inf, -math.inf, -math.inf]
        for q in members.values():
            b = self.pgeom(q)[0].bounds
            bb = [min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3])]
        return max(bb[2] - bb[0], bb[3] - bb[1])

    def deck_profile(self, p):
        """(stations, heights m NAVD88) of a deck piece along its pts, solved with its grade group; None: no deck."""
        if self.deck_iv(p) is None:
            return None
        G = self.deck_group(p)
        return self.memo(self.deck_c, G['ckey'], lambda: self._group_profiles(G, False))[self.pkey(p)]

    def deck_base(self, p):
        """The deck's profile solved with its group alone (no deck of another group under it): what a deck of a group
        ranked lower reads, so no two groups ever wait on each other."""
        G = self.deck_group(p)
        return self.memo(self.base_c, G['ckey'], lambda: self._group_profiles(G, True))[self.pkey(p)]

    def _group_profiles(self, G, base):
        members, free = G['members'], G['free']
        gp, ext_refs = [], {}
        for kk in sorted(members):
            q = members[kk]
            _, L, _ = self.pgeom(q)
            u0, u1 = self.deck_iv(q)
            ss, g, wet, _, _ = self.pground(q)
            fixed, under = [], []
            # water: wet stations inside the deck (a narrow run: a stream)
            run = []
            for i, s_ in enumerate(ss + [None]):
                if s_ is not None and wet[i] and u0 <= s_ <= u1:
                    run.append(i)
                    continue
                if run:
                    clr = CLEAR_STREAM if (ss[run[-1]] - ss[run[0]]) <= NARROW_WATER else CLEAR_WATER
                    fixed += [(ss[i2], float(g[i2]) + clr + CLEAR_MARGIN) for i2 in run]
                    run = []
            line, _, _ = self.pgeom(q)
            # rail under it
            for rr in self.src.query('segments', line):
                if rr['subtype'] != 'rail' or rr['geom'].geom_type != 'LineString' or flagged(rr['road_flags'], 'is_bridge') or flagged(rr['road_flags'], 'is_tunnel'):
                    continue
                if (rr['class'] or '') in ('abandoned', 'disused'):
                    continue
                ix = rr['geom'].intersection(line)
                for pt in [g2 for g2 in getattr(ix, 'geoms', [ix]) if g2.geom_type == 'Point']:
                    sq = float(line.project(pt))
                    if u0 <= sq <= u1:
                        fixed.append((sq, grade.interp(ss, g, sq) + CLEAR_RAIL + CLEAR_MARGIN))
            # roads under it
            for sq, r, sr in self.crossings(q):
                if not (u0 <= sq <= u1):
                    continue
                _, Lr, _ = self.pgeom(r)
                if r['flags'] & FLAGS['tunnel'] or any(f0 * Lr <= sr <= f1 * Lr for f0, f1 in r['tun']):
                    continue
                riv = self.deck_iv(r)
                if riv is None or not (riv[0] <= sr <= riv[1]):
                    fixed.append((sq, grade.interp(ss, g, sq) + CLEAR_ROAD + CLEAR_MARGIN))
                    continue
                # (both decks: the higher level goes over; on equal levels the lower segment id)
                if (q['lvl'], r['seg'], r['i']) > (r['lvl'], q['seg'], q['i']):
                    under.append((sq, self.pkey(r), sr, CLEAR_ROAD + CLEAR_MARGIN))
                    ext_refs[self.pkey(r)] = r
            # roads of a LOWER level running under it along the way (a stacked deck: Fort Pitt's two; a viaduct over a
            # street): every station within (w + w') / 2 of one, over 20 m of overlap, clear of a node they share
            for r in sorted(self.pieces_near(line.buffer(q['w'] / 2 + 15)), key=self.pkey):
                if r['seg'] == q['seg'] or r['lvl'] >= q['lvl'] or r['flags'] & (FLAGS['private'] | FLAGS['pedestrian'] | FLAGS['tunnel']):
                    continue
                rl, Lr, _ = self.pgeom(r)
                shared = [Point(rl.coords[0]) if n == r['a'] else Point(rl.coords[-1]) for n in (r['a'], r['b']) if n in (q['a'], q['b'])]
                hits = []
                for i2, s_ in enumerate(ss):
                    # (not within OVERLAP_END m of an abutment: there the two run side by side, the deck still low)
                    if not (u0 + (OVERLAP_END if u0 > 0 or q['a'] not in free else 0) <= s_ <= u1 - (OVERLAP_END if u1 < L or q['b'] not in free else 0)):
                        continue
                    pt = Point(*self.at_arc(q, [s_]))
                    if rl.distance(pt) > (q['w'] + r['w']) / 2 or any(sh.distance(pt) < 30 for sh in shared):
                        continue
                    hits.append((s_, float(rl.project(pt))))
                if len(hits) < 5:
                    continue
                riv = self.deck_iv(r)
                for s_, sr in hits:
                    if riv is not None and riv[0] <= sr <= riv[1]:
                        under.append((s_, self.pkey(r), sr, CLEAR_ROAD + CLEAR_MARGIN))
                        ext_refs[self.pkey(r)] = r
                    else:
                        fixed.append((s_, grade.interp(ss, g, s_) + CLEAR_ROAD + CLEAR_MARGIN))
            main = q['cls'] in MAINLINE and not q['link']
            gp.append(grade.Piece(kk, q['a'], q['b'], L, u0, u1, main, g, fixed, under))
        # (a node's ground: its first piece's (in key order) end station; every piece's end there is the same point)
        node_ground = {}
        for gpc in gp:
            node_ground.setdefault(gpc.a, gpc.ground[0])
            node_ground.setdefault(gpc.b, gpc.ground[-1])
        # decks of OTHER groups under this one: a group ranked lower is read solved in full, one ranked higher as its
        # base profile; the base solve reads none (so the reads form no cycle, whatever the order of the compiles)
        others = {}
        if not base:
            for k2 in sorted(ext_refs):
                if k2 in members:
                    continue
                r = ext_refs[k2]
                G2 = self.deck_group(r)
                others[k2] = self.deck_profile(r) if G2['rank'] < G['rank'] else self.deck_base(r)

        def ext(k2, s2):
            if others.get(k2) is None:
                return None
            ss2, ys2 = others[k2]
            return grade.interp(ss2, ys2, s2)
        prof, st = grade.solve(gp, node_ground, free, ext)
        if not base:
            cs = self.gstats.setdefault('clusters', {})
            cs[G['ckey']] = {'pieces': len(gp), 'extent': round(G['extent'], 1), 'split': G['split'], **st}
        return {gpc.key: (gpc.ss, prof[gpc.key]) for gpc in gp}

    def ground_lines(self, p):
        """The piece's centreline where it is on the ground: all of it, less a deck's interior (DECK_SHRINK m in from each
        abutment) and, on a tunnel link, its tunnel stretches' interior (PORTAL_PAD m in from a portal inside the piece).
        The roadway, the sidewalk bands and the buildings-on-roads rule use these."""
        line, L, _ = self.pgeom(p)
        cut = []
        iv = self.deck_iv(p)
        if iv is not None:
            cut.append((iv[0] + (DECK_SHRINK if iv[0] > 0 else 0), iv[1] - (DECK_SHRINK if iv[1] < L else 0)))
        if p['flags'] & FLAGS['tunnel']:
            for f0, f1 in p['tun']:
                cut.append((f0 * L + (PORTAL_PAD if f0 > 0 else 0), f1 * L - (PORTAL_PAD if f1 < 1 else 0)))
        cut = sorted((a, b) for a, b in cut if b - a >= 1.0)
        if not cut:
            return [line]
        out, at = [], 0.0
        for a, b in cut:
            if a > at + 0.3:
                out.append(shapely.ops.substring(line, at, a))
            at = max(at, b)
        if at < L - 0.3:
            out.append(shapely.ops.substring(line, at, L))
        return [g for g in out if g.geom_type == 'LineString' and g.length > 0.2]

    def tunnel_footprint(self, p):
        """[(polygon, road y)] per 5 m of a tunnel link (its road: tunnel_line), half its width + 1 m each side."""
        if not (p['flags'] & FLAGS['tunnel'] and p.get('tspan')):
            return []
        t0, y0, t1, y1 = self.tunnel_line(p)
        _, L, _ = self.pgeom(p)
        ss = grade.stations(L)
        xs, zs = self.at_arc(p, ss)
        out = []
        for i in range(len(ss) - 1):
            seg = LineString([(xs[i], zs[i]), (xs[i + 1], zs[i + 1])])
            if seg.length < 0.05:
                continue
            f = p['f0'] + (p['f1'] - p['f0']) * (ss[i] + ss[i + 1]) / 2 / L
            out.append((seg.buffer(p['w'] / 2 + 1.0, cap_style='flat'), y0 + (y1 - y0) * min(1.0, max(0.0, (f - t0) / ((t1 - t0) or 1.0)))))
        return out

    def deck_footprint(self, p):
        """[(polygon, underside y)] per station step of a deck piece standing over 2 m off its ground."""
        pr = self.deck_profile(p)
        if pr is None:
            return []
        ss, ys = pr
        u0, u1 = self.deck_iv(p)
        _, g, _, xs, zs = self.pground(p)
        out = []
        for i in range(len(ss) - 1):
            if ss[i + 1] < u0 or ss[i] > u1 or min(ys[i] - g[i], ys[i + 1] - g[i + 1]) < 2.0:
                continue
            seg = LineString([(xs[i], zs[i]), (xs[i + 1], zs[i + 1])])
            if seg.length < 0.05:
                continue
            out.append((seg.buffer(p['w'] / 2 + 0.5, cap_style='flat'), min(ys[i], ys[i + 1]) - DECK_UNDER))
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
            for line, w, e0, e1, _, _ in self.bridges(s, win.buffer(30 + CULVERT_MAX)):
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
        elevated = (r['min_height'] or 0) >= 3
        for p in sorted(near, key=lambda p: (p['seg'], p['i'])):
            if p['flags'] & FLAGS['pedestrian']:
                continue
            for gl in self.ground_lines(p):
                pg = gl.buffer(p['w'] / 2 + max(p['sw'], 0.6), quad_segs=4)
                if pg.intersects(wg):
                    parts.append(pg)
        if parts and not elevated:
            # (a footprint in the roadway is dropped or trimmed; an elevated one (canopy, skybridge) spans it)
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
        shape_building(self, r, rec, near, dt)
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
    queries, sorted by id) and round the grade groups of its decks, the ctx blocks within CTX_REACH and the DEM under
    its posts and its decks' groups. demSource: the DEM files those outputs were computed from (dem.Sampler.record),
    the same in any compile that holds the tile."""
    with Wd.dem.record(isolated=True) as files:
        return _compile_tile(Wd, c, r, files)


def _compile_tile(Wd, c, r, dem_files):
    t0 = time.time()
    d, dom = Wd.d, Wd.dom_name
    X0, Z0, X1, Z1 = c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE
    Wd.src.require(X0 - LOAD_REACH, Z0 - LOAD_REACH, X1 + LOAD_REACH, Z1 + LOAD_REACH, 'tile %d,%d' % (c, r))
    ctx = Wd.context_for(X0 - CTX_REACH, Z0 - CTX_REACH, X1 + CTX_REACH, Z1 + CTX_REACH)
    ctx_ids = sorted('%s-%s/4/%d/%d' % (grid.GRID, dom, C, R) for C, R in ctx.blocks)
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
        prof = Wd.deck_profile(p)
        iv = Wd.deck_iv(p) if prof is not None else None
        tl = Wd.tunnel_line(p) if p['flags'] & FLAGS['tunnel'] and p.get('tspan') else None
        off = 0.0
        for sb in p['subs']:
            pts = sb['pts']
            sl = sum(math.hypot(x1 - x0, z1 - z0) for (x0, z0), (x1, z1) in zip(pts, pts[1:])) / 100.0
            o0, off = off, off + sl
            if sb['own'] != (c, r):
                continue
            extra = {}
            if prof is not None:
                # the deck's heights along this sub-piece every grade.STEP m from its start, and at its end (int cm NAVD88)
                at = [o0 + k * grade.STEP for k in range(int(sl // grade.STEP) + 1)]
                if sl - (at[-1] - o0) > 0.05:
                    at.append(o0 + sl)
                extra['elev'] = [int(grade.STEP * 100)] + [cm(grade.interp(prof[0], prof[1], a)) for a in at]
                if iv[1] > o0 and iv[0] < o0 + sl:
                    extra['deck'] = 1
            elif tl is not None:
                # a tunnel link's road (the same encoding as a deck's): the straight line between its portals
                at = [o0 + k * grade.STEP for k in range(int(sl // grade.STEP) + 1)]
                if sl - (at[-1] - o0) > 0.05:
                    at.append(o0 + sl)
                Lp = Wd.pgeom(p)[1]
                f0t, y0t, f1t, y1t = tl   # (not t0: the tile's clock)
                fr = [p['f0'] + (p['f1'] - p['f0']) * a / Lp for a in at]
                extra['elev'] = [int(grade.STEP * 100)] + [cm(y0t + (y1t - y0t) * min(1.0, max(0.0, (f - f0t) / ((f1t - f0t) or 1.0)))) for f in fr]
            stops = []
            for end, nid in (('a', sb['na']), ('b', sb['nb'])):
                stop = 0
                if nid.startswith('c:'):
                    ctl, top = Wd.junction(nid[2:], pts[0] if end == 'a' else pts[-1])
                    stop = 1 if ctl in (2, 3) and (ctl == 2 or p['rank'] < top) else 0
                stops.append(stop)
            links.append({'a': node(sb['na'], pts[0]), 'b': node(sb['nb'], pts[-1]), 'pts': [[x - c * TCM, z - r * TCM] for x, z in pts],
                          'w': p['w'], 'lanes': p['lanes'], 'dir': p['dir'], 'flags': p['flags'], 'sw': p['sw'], 'cls': p['cls'], 'rank': p['rank'],
                          'name': p['name'], 'seg': p['seg'], 'piece': p['i'], 'sub': sb['j'], 'stopA': stops[0], 'stopB': stops[1],
                          'lf': p['lf'], 'lb': p['lb'], 'spd': -1 if p['spd'] is None else p['spd'], 'lsrc': p['lsrc'], 'lvl': p['lvl'], **extra})
            if extra.get('deck'):
                links[-1]['flags'] = p['flags'] | FLAGS['deck']
    links.sort(key=lambda l: (l['seg'], l['piece'], l['sub']))
    # ---- curb islands over the tile + ISLAND_HALO, classified before the clip
    WB = TB.buffer(ISLAND_HALO, join_style='mitre')
    waters = water_polys(Wd.src, WB)
    roads_poly = []
    for p in sorted(pieces, key=lambda p: (p['seg'], p['i'])):
        if p['flags'] & FLAGS['pedestrian']:
            continue
        for gl in Wd.ground_lines(p):
            roads_poly.append(gl.buffer(p['w'] / 2, quad_segs=4))
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
    okey = lambda g: (round(g.bounds[0], 2), round(g.bounds[1], 2), round(g.area, 2))  # noqa: E731
    for pp in sorted(polygons(raised), key=okey):
        if pp.area < 6:
            continue
        if pp.area < 120 and pp.distance(wb_edge) >= 1e-6:
            islands.append((pp, 'island'))   # (a small one: whole, and inside every window that holds any of it)
            continue
        # the rest by local width, the same in every window that holds the place (a polygon cut by the window has the
        # window's extent, not its own): the parts narrower than ISLAND_W m (medians, strips; the morphological opening
        # leaves them out) are islands, the rest block; a narrow bit under 6 m2 stays with the block
        # (the overlays on valid inputs and a 1 cm grid: robust where the opening's edges run along the polygon's own; a
        # polygon GEOS still cannot split is one kind, block if any of it is wide)
        pv = shapely.make_valid(pp)
        op = shapely.make_valid(pv.buffer(-ISLAND_W / 2, join_style='mitre').buffer(ISLAND_W / 2, join_style='mitre'))
        try:
            wide = shapely.intersection(op, pv, grid_size=0.01)
            narrow = [q for q in polygons(shapely.difference(pv, wide, grid_size=0.01)) if q.area >= 6]
            block = polygons(shapely.difference(pv, unary_union(narrow), grid_size=0.01)) if narrow else [pp]
        except shapely.errors.GEOSException:
            narrow, block = ([], [pp]) if op.area > 1.0 else ([pp], [])
        islands += sorted([(q, 'block') for q in block if q.area >= 1.0] + [(q, 'island') for q in narrow], key=lambda t: okey(t[0]))
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

    # ---- the decks overhead (grade-lanes): no building whose roof reaches a deck's underside - 0.5 m, no tree under one
    deck_fp = [fp for p in sorted(pieces, key=lambda p: (p['seg'], p['i'])) for fp in Wd.deck_footprint(p)]
    deck_tree = shapely.STRtree([g for g, _ in deck_fp]) if deck_fp else None
    under_deck = 0
    # ---- tunnels: no building stands on a tunnel's road with less than TUNNEL_COVER m of ground over it (by a portal)
    tun_fp = [fp for p in sorted(pieces, key=lambda p: (p['seg'], p['i'])) for fp in Wd.tunnel_footprint(p)]
    tun_tree = shapely.STRtree([g for g, _ in tun_fp]) if tun_fp else None
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
    kinds, from_data = {}, 0
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
        if tun_tree is not None and any(base < tun_fp[i][1] + TUNNEL_COVER for i in tun_tree.query(g, predicate='intersects').tolist()):
            under_deck += 1
            continue
        if deck_tree is not None:
            roof = base + rise + rec['h']
            if any(roof > deck_fp[i][1] - 0.5 for i in deck_tree.query(g, predicate='intersects').tolist()):
                under_deck += 1
                continue
        kinds[rec['kind']] = kinds.get(rec['kind'], 0) + 1
        from_data += 1 if b['roof_shape'] else 0
        mrec = lambda q: [cm(q[0]) - c * TCM, cm(q[1]) - r * TCM, cm(q[2]), cm(q[3])]  # noqa: E731
        common = {'shops': rec['shops'], 'type': BTYPES.index(rec['btype']), 'palette': rec['pal'], 'fromOverture': 1 if rec['heightFromOverture'] else 0,
                  'downtown': 1 if rec['downtown'] else 0, 'kind': KINDS.index(rec['kind']), 'front': rec['front'], 'frontDist': rec['frontDist'],
                  'row': rec['row'], 'frontW': round(rec['frontW'], 1), 'bays': rec['bays'], 'podium': rec['podium']}
        if rec['parts']:
            # (drawn as its parts, in part id order; the parent's outline is not emitted)
            for q in sorted(rec['parts'], key=lambda q: q['id']):
                qp = neg_ring(list(q['g'].exterior.coords))
                start = len(bverts) // 2
                for x, z in qp:
                    bverts += [cm(x) - c * TCM, cm(z) - r * TCM]
                bout.append(dict(common, id=q['id'], parent=rec['id'], base=cm(base), roof=cm(base + rise + q['h']), peak=cm(base + rise + q['h'] + 0.6),
                                 ringStart=start, ringCount=len(qp), theta=round(q['theta'], 4), stories=max(1, int(round((q['h'] - q['minH']) / 3.4))),
                                 roofShape=0, minH=cm(q['minH']), masses=[mrec(m) for m in q['rects']], podium=0))
            continue
        start = len(bverts) // 2
        for x, z in pts:
            bverts += [cm(x) - c * TCM, cm(z) - r * TCM]
        bout.append(dict(common, id=rec['id'], base=cm(base), roof=cm(base + rise + rec['h']), peak=cm(base + rise + rec['h'] + rec['peakAdd']),
                         ringStart=start, ringCount=len(pts), theta=round(rec['theta'], 4), stories=int(rec['stories']), roofShape=rec['roofShape'],
                         minH=cm(rec['minH']), masses=[mrec(m) for m in rec['rects']]))
    # ---- paved lots (footprints within 25 m, buffered 8 / 12 m) and the sidewalk bands
    paved = [rec['g'].buffer(12 if rec['downtown'] else 8, quad_segs=2) for bid, (b, rec) in sorted(brecs_near.items()) if rec['btype'] not in ('rowhouse', 'shed')]
    paved_u = unary_union(paved) if paved else None
    bands = []
    for p in sorted(pieces, key=lambda p: (p['seg'], p['i'])):
        if p['sw'] <= 0 or p['flags'] & FLAGS['pedestrian']:
            continue
        for gl in Wd.ground_lines(p):
            bands.append(gl.buffer(p['w'] / 2 + p['sw'], quad_segs=4))
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
            if deck_tree is not None and len(deck_tree.query(pt.buffer(2.0), predicate='intersects')):
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
              'buildId': Wd.bid, 'compiler': COMPILER_VERSION, 'demSource': Wd.dem.sources(dem_files), 'vdatum': 'NAVD88 (3DEP), no datum shift',
              'posts': grid.POSTS, 'post': grid.POST, 'mask': {'cell': 1, 'n': TILE, 'classes': list(MASK)}, 'base_cm': base,
              'bcount': len(bout), 'groundAreaM2': round((TILE / k_tile) ** 2, 1), 'k_tile': round(k_tile, 9), 'gamma_tile': round(d.gamma(lon_c), 6),
              'centre': [round(lon_c, 7), round(lat_c, 7)], 'waters': [{'id': w['id'], 'level_cm': w['level_cm'], 'cells': w['cells']} for w in wsec],
              'foreign': sorted(foreign), 'ctx': ctx_ids, 'noDemPosts': nan, 'desert': desert, 'region': region_of(lon_c, lat_c),
              'buildingKinds': dict(sorted(kinds.items())), 'roofShapesFromData': from_data,
              'counts': {'links': len(links), 'nodes': len(nodes_out), 'blocks': len(blocks), 'trees': len(trees), 'places': len(places),
                         'deckLinks': sum(1 for l in links if l.get('deck')), 'underDeckDropped': under_deck}}
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
    Wd = {}  # product -> Sampler (A reads the 1/3" product, B / C the 1")
    out = {}
    for tier, C_, R_ in keys:
        k = farlib.far_key(bid, dom, tier, C_, R_)
        b = store.get(k) if store else None
        if b is None:
            prod = farlib.TIERS[tier]['product']
            if prod not in Wd:
                dsn = dem_snapshot(dem_store or store)[1]
                Wd[prod] = Sampler(os.path.join(data, 'dem'), dem_store or store, dsn, product=prod)
            t0 = time.time()
            b = gz(farlib.compile_far(dom, tier, C_, R_, Wd[prod], bid))
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
    ap.add_argument('--far', help='one far tile hg1-{d}/{1|3|5}/{C}/{R} (far.py)')
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
    ap.add_argument('--osm-roads', default=os.environ.get('HOMETOWN_OSM_ROADS'), help='the OSM lane side table (osm_roads.py); default <data>/osm/osm-roads-us.parquet')
    a = ap.parse_args()
    set_osm_roads(a.osm_roads or os.path.join(a.data, 'osm', 'osm-roads-us.parquet'))
    # (assemble.py imports this file as `compile`, a second module object from __main__: give it the same table)
    import compile as _mod  # noqa: E402
    if _mod is not sys.modules[__name__]:
        _mod.OSM_ROADS.update(OSM_ROADS)
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
