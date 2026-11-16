# tools/geo-looks.py: New York's buildings as mapped, for js/buildings.js (writes js/nyc-looks.js)
# What the procedural blocks borrow from the real city: each building's height, its facade's colour and material and
# its roof's colour and shape, from Overture Maps' buildings and building parts (their OSM tags: building:colour,
# building:material, roof:colour, roof:material, roof:shape, roof:height), in the game's world frame (geo-base.mjs).
#
# Licence: only rows whose footprint comes from OpenStreetMap (ODbL, (c) OpenStreetMap contributors); heights from
# OpenStreetMap or USGS 3DEP Lidar (public domain). Rows traced by Microsoft's ML buildings are left out, and so are
# heights taken from them.
#
# Input: Overture's buildings theme for Manhattan as parquet (theme=buildings, type=building and building_part, plus the
# hometown fetch's -extras files with the OSM look tags), e.g. the hg1 region tiles tools/hometown/fetch.py writes:
#   <dir>/**/overture-buildings-building(.parquet|-extras.parquet), overture-buildings-building_part(...)
# usage: python tools/geo-looks.py <overture dir> [out.js]
#
# The frame (THETA, ORIGIN) is the one tools/geo-base.mjs refines from the street centrelines; printed by:
#   GEO_DATA=tools/data node -e "import('./tools/geo-base.mjs').then(m=>console.log(m.geo.THETA,m.geo.ORIGIN))"
import glob
import json
import math
import os
import sys

import duckdb
import shapely
import shapely.prepared

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hometown'))
import looks  # noqa: E402  (tools/hometown/looks.py: parse_rgb, clamp, WALL_OF, ROOF_MAT)

THETA = 0.5065013453048752
ORIGIN = (54.351009602014415, -69.42368861314677)
LAT0, LON0 = 40.75318, -73.98185
A, E2 = 6378137.0, 6.69437999014e-3
PHI0 = math.radians(LAT0)
S0 = math.sin(PHI0)
NRAD = A / math.sqrt(1 - E2 * S0 * S0)
MRAD = A * (1 - E2) / (1 - E2 * S0 * S0) ** 1.5
KX = math.radians(1) * NRAD * math.cos(PHI0)
KY = math.radians(1) * MRAD
C, S = math.cos(THETA), math.sin(THETA)
CUT_Z = -7090 - 300
BBOX = (-74.03, 40.695, -73.90, 40.83)


def world(lon, lat):
    e, n = (lon - LON0) * KX, (lat - LAT0) * KY
    return e * C - n * S - ORIGIN[0], -(e * S + n * C) - ORIGIN[1]


# the engine's roof shapes (cities/pkg/js/pkg-buildings.js roof(); 0 = flat)
SHAPES = ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion', 'round', 'dome', 'gambrel', 'half_hipped', 'mansard', 'saltbox']
SHAPE_TAG = {'onion': 'dome', 'cone': 'pyramidal', 'conical': 'pyramidal', 'barrel': 'round', 'quadruple_saltbox': 'hipped',
             'crosspitched': 'hipped', 'side_hipped': 'half_hipped', 'gabled_height_moved': 'gabled', 'butterfly': 'flat'}
# facade classes: masonry (stone, brick, concrete, stucco...) vs curtain wall (glass, metal)
GLASSY = {'glass', 'metal'}


def shape_code(v):
    s = (v or '').strip().lower()
    s = SHAPE_TAG.get(s, s)
    return SHAPES.index(s) if s in SHAPES else 0


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'nyc-looks.js')
    files = lambda k: sorted(glob.glob(os.path.join(src, '**', f'overture-buildings-{k}.parquet'), recursive=True))
    c = duckdb.connect()
    box = f'bbox.xmin > {BBOX[0]} and bbox.xmax < {BBOX[2]} and bbox.ymin > {BBOX[1]} and bbox.ymax < {BBOX[3]}'
    bl = c.execute(f"""
      with b as (select distinct on (id) id, geometry, height, roof_shape, roof_height, sources, is_underground
                 from read_parquet({files('building')}) where {box}),
           x as (select distinct on (id) * from read_parquet({files('building-extras')}))
      select b.id, b.geometry::BLOB, b.height, b.roof_shape, b.roof_height,
             list_filter(b.sources, lambda s: coalesce(s.property, '') = '')[1].dataset as gsrc,
             list_filter(b.sources, lambda s: s.property = '/properties/height')[1].dataset as hsrc,
             x.facade_color, x.facade_material, x.roof_color, x.roof_material
      from b left join x using (id) where not coalesce(b.is_underground, false)""").fetchall()
    pl = c.execute(f"""
      with p as (select distinct on (id) id, geometry, height, min_height, building_id from read_parquet({files('building_part')}) where {box}),
           x as (select distinct on (id) * from read_parquet({files('building_part-extras')}))
      select p.building_id, p.geometry::BLOB, p.height, p.min_height, x.roof_shape, x.roof_height, x.roof_direction,
             x.facade_color, x.facade_material, x.roof_color, x.roof_material
      from p left join x using (id)""").fetchall()
    print(f'[looks] {len(bl)} buildings, {len(pl)} parts in the box')

    def rect(geom):
        """world AABB, centroid, area of a footprint (its largest polygon)"""
        g = shapely.from_wkb(geom)
        if g.geom_type == 'MultiPolygon':
            g = max(g.geoms, key=lambda p: p.area)
        if g.geom_type != 'Polygon':
            return None
        pts = [world(x, y) for x, y in g.exterior.coords]
        poly = shapely.Polygon(pts)
        if not poly.is_valid or poly.area < 12:
            return None
        x0, z0, x1, z1 = poly.bounds
        ce = poly.centroid
        # (the turn of the footprint's longest side off the grid, for a pitched roof's ridge)
        mrr = poly.minimum_rotated_rectangle
        cs = list(mrr.exterior.coords)
        ang = 0.0
        if len(cs) >= 4:
            e1 = (cs[1][0] - cs[0][0], cs[1][1] - cs[0][1])
            e2 = (cs[2][0] - cs[1][0], cs[2][1] - cs[1][1])
            e = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
            ang = math.atan2(-e[1], e[0])  # three.js turn about +y that lays local +x along e
            ang = (ang + math.pi / 2) % math.pi - math.pi / 2
            w, d = sorted((math.hypot(*e1), math.hypot(*e2)), reverse=True)
        else:
            w, d = x1 - x0, z1 - z0
        return dict(x0=x0, x1=x1, z0=z0, z1=z1, cx=ce.x, cz=ce.y, area=poly.area, ang=ang, w=w, d=d)

    parts = {}
    for row in pl:
        bid, geom, h, mh, rs, rh, rdir, fc, fm, rc, rm = row
        r = rect(geom)
        if not r or not h:
            continue
        r.update(h=h, mh=mh or 0, rs=shape_code(rs), rh=rh or 0, fc=fc, fm=fm, rc=rc, rm=rm)
        parts.setdefault(bid, []).append(r)

    # Manhattan only (js/nyc-geodata.js's shore, 30 m out for the piers' sheds and the riverside parks)
    gtxt = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'nyc-geodata.js')).read()
    G = json.loads(gtxt[gtxt.index('window.NYC.GEO = ') + 17:gtxt.rindex('};') + 1])
    ring = lambda f: shapely.Polygon(list(zip(f[0::2], f[1::2]))).buffer(0)
    island = shapely.prepared.prep(shapely.union_all([ring(G['manhattan']), ring(G['upperManhattan'])]).buffer(30))
    look_ix = {(0, 0, 0): 0}
    looks_out = [[0, 0, 0]]
    bout, roofs = [], []
    drop = {'ms': 0, 'far': 0, 'geom': 0}
    for row in bl:
        bid, geom, h, rs, rh, gsrc, hsrc, fc, fm, rc, rm = row
        if gsrc != 'OpenStreetMap':
            drop['ms'] += 1
            continue
        r = rect(geom)
        if not r:
            drop['geom'] += 1
            continue
        if r['cz'] < CUT_Z or not island.contains(shapely.Point(r['cx'], r['cz'])):
            drop['far'] += 1
            continue
        if hsrc not in (None, 'OpenStreetMap', 'USGS Lidar'):
            h = None
        ps = parts.get(bid, [])
        if ps:
            h = max(h or 0, max(p['h'] for p in ps))
        # the facade: the material and colour of the biggest walls that carry one (parts first, then the building)
        def pick(key):
            best, wt = None, 0
            for p in ps:
                if p[key]:
                    a = p['area'] * max(1, p['h'] - p['mh'])
                    if a > wt:
                        best, wt = p[key], a
            return best
        mat = (pick('fm') or fm or '').strip().lower()
        wall = looks.WALL_OF.get(mat)
        wcls = 2 if wall in GLASSY else 1 if wall else 0  # 0 untagged, 1 masonry, 2 curtain wall
        wrgb = looks.wall_rgb(pick('fc') or fc)
        top = max(ps, key=lambda p: (p['h'], p['area'])) if ps else None
        rrgb = looks.roof_rgb(top['rc'] if top and top['rc'] else rc, (top['rm'] if top and top['rm'] else rm))
        key = (wcls, wrgb, rrgb)
        if key not in look_ix:
            look_ix[key] = len(looks_out)
            looks_out.append(list(key))
        bout.append((round(r['cz']), round(r['cx']), math.ceil((r['x1'] - r['x0']) * 0.5), math.ceil((r['z1'] - r['z0']) * 0.5),
                     round(h or 0), look_ix[key]))
        # pitched and domed roofs as mapped: the building's own when it has no parts, else each part's
        for p in (ps or [dict(r, h=h or 0, mh=0, rs=shape_code(rs), rh=rh or 0, rc=rc, rm=rm)]):
            if not p['rs'] or not p['h']:
                continue
            rise = p['rh'] or min(p['d'] * 0.35, 6.0)
            rise = min(rise, max(0.0, p['h'] - p['mh']) * 0.8, p['w'] * 1.2)
            if rise < 0.5:
                continue
            prgb = looks.roof_rgb(p['rc'] or rc, p['rm'] or rm)
            roofs += [round(p['cx'] * 10), round(p['cz'] * 10), round(p['w'] * 10), round(p['d'] * 10), round(p['ang'] * 1000),
                      round((p['h'] - rise) * 10), round(rise * 10), p['rs'], prgb]
    # sorted north to south, z written as the step from the one before (the file gzips to about half)
    bout.sort()
    flat, pz = [], 0
    for z, x, hw, hd, h, lk in bout:
        flat += [x, z - pz, hw, hd, h, lk]
        pz = z
    bout = flat
    print(f'[looks] kept {len(bout) // 6} buildings, {len(looks_out)} looks, {len(roofs) // 9} mapped roofs; dropped {drop}')
    data = {'v': 1, 'shapes': SHAPES, 'looks': looks_out, 'b': bout, 'roofs': roofs}
    head = ("// js/nyc-looks.js: GENERATED by tools/geo-looks.py, do not edit by hand.\n"
            "// New York's buildings as mapped, in the world frame of js/nyc-geodata.js: b = [cx, cz step from the building before,\n"
            "// half w, half d, height (m), look] per building north to south, looks = [wall class (0 none, 1 masonry, 2 curtain wall), facade 0xRRGGBB, roof 0xRRGGBB] (0: none),\n"
            "// roofs = [cx, cz, length, width (dm), turn (mrad), eave (dm), rise (dm), shape (shapes index), roof 0xRRGGBB] per\n"
            "// pitched or domed roof. Source: Overture Maps buildings, footprints and tags (c) OpenStreetMap contributors (ODbL),\n"
            "// heights also USGS 3DEP Lidar (public domain).\n")
    with open(out, 'w') as f:
        f.write(head + '(function () {\nwindow.NYC = window.NYC || {};\nwindow.NYC.LOOKS = ' + json.dumps(data, separators=(',', ':')) + ';\n})();\n')
    print(f'[looks] wrote {out}: {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    main()
