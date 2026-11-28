# tools/hometown/features.py: a town's landmark structures, compiled from the map for the engine to dress (Mandi's
# Revenge, Chicago first; any town that has them gets them). Read by assemble.py into the package (GEO.elevated,
# GEO.features, the named anchors in PKG.places); a package without them plays as before.
#
# - elevated: the rapid-transit tracks off the ground: Overture rail segments of class subway / light_rail / monorail
#   (OSM railway=subway|light_rail|monorail) on a level of 1 or more (OSM layer>=1) or flagged is_bridge (bridge=yes),
#   only those stretches (level_rules / road_flags `between`), within the window + REACH. [{id, name, cls, p: [x, z...]}]
#   in session metres. The engine (cities/sf/js/elevated.js) builds the deck, the steel bents and the rails over them.
# - features: [{kind, name, id, ...}]
#   wheel    a building (or a part) named "... Wheel" (OSM attraction=big_wheel, Overture subtype entertainment) at least
#            WHEEL_MIN_H m tall: its centre, height and the bearing of its plane (the footprint's long axis)
#   pier     a land use or infrastructure polygon of class pier, or named "... Pier", of at least PIER_MIN_M2, reaching
#            into the water: its ring
#   stadium  an open stadium: a building of class stadium of at least STADIUM_MIN_M2 and STADIUM_MIN_H with a name (not
#            an arena or a center): its ring, height
# - anchors: stable place keys a story can name (@pier, @wheel, @stadium-lot, @stadium-gate, @jay-lot, @under-l, @riverwalk,
#   @riverwalk-east), each { x, z (beside its nearest drivable road), heading, name, kind 'anchor', cx, cz, ax, az (the
#   spot on foot) }. Each is a pure function of the map: the same town always gives the same spots.
import math
import re

import numpy as np
import shapely
import shapely.ops
from shapely.geometry import LineString, Point, box as sbox
from shapely.ops import substring

RAPID = ('subway', 'light_rail', 'monorail')
REACH = 300.0           # m past the window the tracks are kept (the engine draws what it streams)
WHEEL_MIN_H = 25.0
PIER_MIN_M2 = 20000.0
STADIUM_MIN_M2 = 15000.0
STADIUM_MIN_H = 22.0    # m: an open bowl's stands (an arena under its roof, a low field's stands are left as mapped)
LOT_UNDER_L = 30.0      # m: a car park this near an elevated track is "under the L"


def _flag(rf, name):
    """[(a, b)] fractions of the segment carrying flag `name` (whole: [(0, 1)])."""
    out = []
    for r in rf or []:
        if name in (r.get('values') or []):
            b = r.get('between')
            out.append((float(b[0]), float(b[1])) if b else (0.0, 1.0))
    return out


def _levels(lr):
    out = []
    for r in lr or []:
        if (r.get('value') or 0) >= 1:
            b = r.get('between')
            out.append((float(b[0]), float(b[1])) if b else (0.0, 1.0))
    return out


def _merge(iv):
    iv = sorted(iv)
    out = []
    for a, b in iv:
        if out and a <= out[-1][1] + 1e-6:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def extract(W, fr, window_gm, rl, log=print):
    """W: the assembler's World; fr: {c0, r0, k0}; window_gm: (x0, z0, x1, z1) grid metres; rl: the package's road links
    (session metres, assemble.py). -> (elevated, features, anchors)"""
    k0, ox, oz = fr['k0'], 512.0 * fr['c0'], 512.0 * fr['r0']

    def sess(g):
        return shapely.transform(g, lambda a: (a - np.array([ox, oz])) / k0)

    def q1(v):
        return round(float(v) * 10) / 10
    x0, z0, x1, z1 = window_gm
    reach = sbox(x0 - REACH, z0 - REACH, x1 + REACH, z1 + REACH)
    inner = sbox(x0, z0, x1, z1)

    # ---- the elevated tracks
    elevated = []
    for s in W.src.query('segments', reach):
        if s['subtype'] != 'rail' or (s['class'] or '') not in RAPID or s['geom'].geom_type != 'LineString':
            continue
        if _flag(s['road_flags'], 'is_tunnel') == [(0.0, 1.0)]:
            continue
        iv = _merge(_levels(s['level_rules']) + _flag(s['road_flags'], 'is_bridge'))
        if not iv:
            continue
        g = s['geom']
        for a, b in iv:
            if b - a < 1e-4:
                continue
            piece = substring(g, a, b, normalized=True) if (a > 0 or b < 1) else g
            if piece.geom_type != 'LineString' or piece.length < 2:
                continue
            piece = piece.intersection(reach)
            for ln in ([piece] if piece.geom_type == 'LineString' else list(getattr(piece, 'geoms', []))):
                if ln.geom_type != 'LineString' or ln.length < 2:
                    continue
                ls = sess(ln.simplify(0.3))
                elevated.append({'id': s['id'], 'name': s['name'] or '', 'cls': s['class'],
                                 'p': [v for p in ls.coords for v in (q1(p[0]), q1(p[1]))]})
    elevated.sort(key=lambda e: (e['id'], e['p'][:2]))

    # ---- the landmark structures
    features = []
    water = [r['geom'] for r in W.src.query('water', inner) if r['geom'].geom_type in ('Polygon', 'MultiPolygon')]
    wet = shapely.union_all([w.buffer(0) for w in water]) if water else None
    for r in W.src.query('buildings', inner):
        nm = r['name'] or ''
        h = r['height'] or 0
        if 'wheel' in nm.lower().split() or nm.lower().endswith(' wheel'):
            if h < WHEEL_MIN_H:
                continue
            g = r['geom'] if r['geom'].is_valid else r['geom'].buffer(0)
            mrr = g.minimum_rotated_rectangle
            cs = list(mrr.exterior.coords)[:4]
            e1 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1])
            e2 = (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
            ax = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
            L = math.hypot(*ax) or 1
            c = sess(g.centroid)
            features.append({'kind': 'wheel', 'name': nm, 'id': r['id'], 'x': q1(c.x), 'z': q1(c.y), 'h': q1(h),
                             'ax': round(ax[0] / L, 4), 'az': round(ax[1] / L, 4), 'span': q1(L / k0)})
        elif (r['class'] or '') == 'stadium' and nm and r['geom'].area >= STADIUM_MIN_M2 and h >= STADIUM_MIN_H and not re.search(r'\b(center|centre|arena|dome)\b', nm, re.I):
            g = r['geom'] if r['geom'].is_valid else r['geom'].buffer(0)
            g = max(getattr(g, 'geoms', [g]), key=lambda p: p.area)
            c = sess(g.centroid)
            ring = sess(g.exterior.simplify(1.0))
            features.append({'kind': 'stadium', 'name': nm, 'id': r['id'], 'x': q1(c.x), 'z': q1(c.y), 'h': q1(h or 25),
                             'ring': [v for p in list(ring.coords)[:-1] for v in (q1(p[0]), q1(p[1]))]})
    seen = set()
    for key in ('land_use',):
        for r in W.src.query(key, inner):
            nm = r['name'] or ''
            g = r['geom']
            if g.geom_type not in ('Polygon', 'MultiPolygon') or g.area < PIER_MIN_M2:
                continue
            if not ((r['class'] or '') == 'pier' or ' pier' in (' ' + nm.lower())) or nm.lower().startswith(('north pier', 'south pier')):
                continue
            if wet is None or g.buffer(30).intersection(wet).area < 0.2 * g.area:
                continue
            g = g if g.is_valid else g.buffer(0)
            g = max(getattr(g, 'geoms', [g]), key=lambda p: p.area)
            if nm in seen:
                continue
            seen.add(nm)
            ring = sess(g.exterior.simplify(1.0))
            c = sess(g.centroid)
            features.append({'kind': 'pier', 'name': nm, 'id': r['id'], 'x': q1(c.x), 'z': q1(c.y),
                             'ring': [v for p in list(ring.coords)[:-1] for v in (q1(p[0]), q1(p[1]))]})
    features.sort(key=lambda f: (f['kind'], f['id']))

    # ---- the anchors
    drive = []
    for l in rl:
        if l['flags'] & (2 | 128) or l['cls'] in ('motorway', 'trunk') or l['lanes'] < 1:
            continue
        pts = [l['pa']] + l['inner'] + [l['pb']]
        if len(pts) >= 2:
            drive.append((LineString(pts), l))
    tree = shapely.STRtree([d[0] for d in drive]) if drive else None

    wet_s = sess(wet) if wet is not None else None

    def lane_by(px, pz, avoid=None):
        # (the nearest drivable road on the same shore: the walk to it crosses no water)
        if tree is None:
            return None
        p = Point(px, pz)
        best = None
        for i in tree.query(p.buffer(250)).tolist():
            ln, l = drive[i]
            if avoid and any(a in (l.get('name') or '').upper() for a in avoid):
                continue
            d = ln.distance(p)
            if best is not None and d >= best[0]:
                continue
            if wet_s is not None and LineString([(px, pz), shapely.ops.nearest_points(ln, p)[0].coords[0]]).intersection(wet_s).length > 2:
                continue
            best = (d, ln)
        if best is None:
            return None
        ln = best[1]
        s = ln.project(p)
        a, b = ln.interpolate(max(0, s - 1)), ln.interpolate(min(ln.length, s + 1))
        q = ln.interpolate(s)
        return q.x, q.y, math.atan2(b.x - a.x, b.y - a.y)

    anchors = {}

    def put(key, name, fx, fz, avoid=None, near=None):
        ln = lane_by(*(near or (fx, fz)), avoid=avoid)
        if not ln:
            return
        anchors[key] = {'x': q1(ln[0]), 'z': q1(ln[1]), 'heading': round(ln[2], 4), 'name': name, 'kind': 'anchor',
                        'cx': q1(fx), 'cz': q1(fz), 'ax': q1(fx), 'az': q1(fz), 'aHow': 'anchor'}
    wheel = next((f for f in features if f['kind'] == 'wheel'), None)
    pier = next((f for f in features if f['kind'] == 'pier'), None)
    stadium = next((f for f in features if f['kind'] == 'stadium'), None)
    if pier:
        # (the pier's shore end: of the two ends of its long axis, the one with less water round it; on foot, 40 m out
        # from that end along the axis. The car stops at the road nearest it)
        poly = shapely.Polygon([(pier['ring'][i], pier['ring'][i + 1]) for i in range(0, len(pier['ring']), 2)])
        cs = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
        e1, e2 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]), (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
        ax_ = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
        L = math.hypot(*ax_) or 1
        ux, uz = ax_[0] / L, ax_[1] / L
        c = poly.centroid
        ends = [(c.x + ux * L / 2, c.y + uz * L / 2, -1), (c.x - ux * L / 2, c.y - uz * L / 2, 1)]
        wetness = lambda e: Point(e[0], e[1]).buffer(120).intersection(wet_s).area if wet_s is not None else 0
        ex, ez, sg = min(ends, key=wetness)
        fx, fz = ex + sg * ux * 40, ez + sg * uz * 40
        if not poly.contains(Point(fx, fz)):
            f = shapely.ops.nearest_points(poly.buffer(-3), Point(fx, fz))[0]
            fx, fz = f.x, f.y
        put('pier', 'the pier', fx, fz, avoid=('LAKE SHORE',))
    if wheel:
        # (at the wheel's foot, on the pier's walk beside it: 18 m off its plane, on the pier)
        nx, nz = -wheel['az'], wheel['ax']
        fx, fz = wheel['x'] + nx * 18, wheel['z'] + nz * 18
        if pier:
            poly = shapely.Polygon([(pier['ring'][i], pier['ring'][i + 1]) for i in range(0, len(pier['ring']), 2)])
            if not poly.contains(Point(fx, fz)):
                fx, fz = wheel['x'] - nx * 18, wheel['z'] - nz * 18
        put('wheel', 'the wheel', fx, fz, avoid=('LAKE SHORE',))
    # (car parks: session polygons)
    lots = []
    for r in W.src.query('parking', inner):
        g = r['geom'] if r['geom'].is_valid else r['geom'].buffer(0)
        g = max(getattr(g, 'geoms', [g]), key=lambda p: p.area)
        if g.area >= 300:
            lots.append((r['id'], sess(g)))
    lots.sort(key=lambda t: t[0])
    # (GEO.lots: every car park in the window, its ring and the bearing of its long side, for the engine's stalls and
    # parked cars: lots.js)
    lot_out = []
    # (a car park under a park or inside a building is underground or a garage (Grant Park's, under the lawns): no
    # stalls on top. The park and building polygons in session metres, for the overlap test)
    cover = [sess(r['geom'] if r['geom'].is_valid else r['geom'].buffer(0)) for r in W.src.query('land_use', inner)
             if (r['subtype'] or '') in ('park', 'recreation') or (r['class'] or '') in ('park', 'garden', 'grass', 'playground')]
    cover += [sess(r['geom'] if r['geom'].is_valid else r['geom'].buffer(0)) for r in W.src.query('buildings', inner) if not r['is_underground']]
    ctree = shapely.STRtree(cover) if cover else None
    for lid, g in lots:
        if not inner_s(g, fr, window_gm):
            continue
        if ctree is not None:
            hit = sum(cover[i].intersection(g).area for i in ctree.query(g, predicate='intersects').tolist())
            if hit > 0.3 * g.area:
                continue
        gs = g.simplify(0.5)
        if gs.is_empty or gs.geom_type != 'Polygon':
            continue
        cs = list(gs.minimum_rotated_rectangle.exterior.coords)[:4]
        e1, e2 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]), (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
        ax_ = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
        lot_out.append({'ring': [v for p in list(gs.exterior.coords)[:-1] for v in (q1(p[0]), q1(p[1]))], 'ang': round(math.atan2(ax_[0], ax_[1]), 4),
                        'area': round(gs.area)})
    if stadium and lots:
        sp = Point(stadium['x'], stadium['z'])
        sring = shapely.Polygon([(stadium['ring'][i], stadium['ring'][i + 1]) for i in range(0, len(stadium['ring']), 2)])
        cand = [(lid, g) for lid, g in lots if g.distance(sring) < 350 and g.area >= 3000]
        if cand:
            lid, g = max(cand, key=lambda t: (t[1].area, t[0]))
            c = g.representative_point()
            put('stadium-lot', "the stadium's lot", c.x, c.y, avoid=('LAKE SHORE',))
        put('stadium-gate', stadium['name'], *_edge_toward(sring, sp), avoid=('LAKE SHORE',))
    if elevated and lots:
        tracks = shapely.union_all([LineString([(e['p'][i], e['p'][i + 1]) for i in range(0, len(e['p']), 2)]) for e in elevated])
        cand = [(lid, g, g.distance(tracks)) for lid, g in lots if g.distance(tracks) < LOT_UNDER_L and inner_s(g, fr, window_gm)]
        if cand:
            # (the largest lot beside the tracks in the town's busiest quarter: nearest its downtown, then the biggest)
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            dt = sess(Point(cx, cz))
            lid, g, d = min(cand, key=lambda t: (round(t[1].distance(dt) / 400), -t[1].area, t[0]))
            # (the spot: the lot's point nearest the tracks, 3 m in from its edge)
            pa, pb = shapely.ops.nearest_points(g, tracks)
            ins = g.buffer(-3)
            f = shapely.ops.nearest_points(ins, pa)[0] if not ins.is_empty else g.representative_point()
            put('jay-lot', 'the lot under the tracks', f.x, f.y)
    if elevated:
        # (on the street under the L: the elevated stretch over a drivable road nearest downtown, at its middle)
        best = None
        dt = sess(Point((x0 + x1) / 2, (z0 + z1) / 2))
        for e in elevated:
            ln = LineString([(e['p'][i], e['p'][i + 1]) for i in range(0, len(e['p']), 2)])
            if ln.length < 60:
                continue
            m = ln.interpolate(0.5, normalized=True)
            lp = lane_by(m.x, m.y)
            if lp and math.hypot(lp[0] - m.x, lp[1] - m.y) < 6:
                d = m.distance(dt)
                if best is None or d < best[0]:
                    best = (d, m)
        if best:
            put('under-l', 'under the tracks', best[1].x, best[1].y)
    # (the riverwalk: the parks named so, along the water; its west and east ends)
    rw = [r for r in W.src.query('land_use', inner) if 'riverwalk' in (r['name'] or '').lower() and r['geom'].geom_type in ('Polygon', 'MultiPolygon')]
    if rw and wet is not None:
        g = sess(shapely.union_all([r['geom'].buffer(0) for r in rw]))
        wt = sess(wet)
        parts = sorted(getattr(g, 'geoms', [g]), key=lambda p: p.bounds[0])
        edge = [p for p in parts if p.distance(wt) < 3 and p.area > 400]
        if edge:
            for key, name, part in (('riverwalk', 'the riverwalk', edge[0]), ('riverwalk-east', 'the riverwalk, by the lake', edge[-1])):
                # (the spot: on the walk, 3 m in from the river wall, at the part's middle)
                c = part.representative_point()
                pa = shapely.ops.nearest_points(wt, c)[0]
                ins = part.buffer(-2)
                f = shapely.ops.nearest_points(ins if not ins.is_empty else part, pa)[0]
                put(key, name, f.x, f.y)
    lot_out = lot_out if lots else []
    log('{"lots": %d, "features": %d, "elevatedTracks": %d, "elevatedKm": %.1f, "anchors": "%s"}' % (
        len(lot_out), len(features), len(elevated), sum(LineString([(e['p'][i], e['p'][i + 1]) for i in range(0, len(e['p']), 2)]).length for e in elevated) / 1000,
        ','.join(sorted(anchors))))
    return elevated, features, anchors, lot_out


def inner_s(g, fr, window_gm):
    k0, ox, oz = fr['k0'], 512.0 * fr['c0'], 512.0 * fr['r0']
    x0, z0, x1, z1 = window_gm
    return sbox((x0 - ox) / k0, (z0 - oz) / k0, (x1 - ox) / k0, (z1 - oz) / k0).contains(g.centroid)


def _edge_toward(poly, p):
    """The point of poly's ring nearest the outside, toward p's nearest road: the ring point nearest p (p inside: its
    centroid's nearest ring point)."""
    q = shapely.ops.nearest_points(poly.exterior, p)[0]
    return q.x, q.y
