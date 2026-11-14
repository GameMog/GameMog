# tools/hometown/reach_scan.py: can a person reach every mission place of a compiled town? Against the town's OWN
# compiled buildings (the package's data/buildings.bin.gz: every footprint ring and every mass the engine makes a
# collider of) and its ground mask, for each place of its PKG.places:
#   centreIn     the place's centre (cx, cz) inside a building (a ring a person could not stand in)
#   approachIn   its approach (ax, az) within a person's radius (PERSON m) of a building (ring or mass)
#   approachWet  its approach on the water (the engine mask's water edge)
#   approachRoad its approach on the roadway (the mask's asphalt; a sidewalk, a lot, a lawn are fine)
#   laneIn       its lane point (x, z) inside a building (the frame's; the engine snaps a car to its own lanes)
#   notToLane    no straight walk from its approach to its lane point (x, z) (through a building, or that lane point
#                itself inside one)
#   unreachable  nor to the open roadway (the mask's asphalt, in no building) within 25 m: cut off from the roads
#   noApproach   no ax, az at all (the engine stays on the lane point)
#   <venv>/bin/python tools/hometown/reach_scan.py <package dir> [<package dir> ...] [--json out.json]
import gzip
import json
import math
import os
import struct
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

PERSON = 0.48
MASK_ASPHALT, MASK_WATER_EDGE = 0, 5


def sfb1(path):
    raw = open(path, 'rb').read()
    if path.endswith('.gz'):
        raw = gzip.decompress(raw)
    assert raw[:4] == b'SFB1', path
    n = struct.unpack('<I', raw[4:8])[0]
    return json.loads(raw[8:8 + n]), raw[8 + n:]


def pkg_of(d):
    if os.path.exists(os.path.join(d, 'geodata.json')):
        return json.load(open(os.path.join(d, 'geodata.json')))['PKG']
    for line in open(os.path.join(d, 'geodata.js')):
        if line.startswith('window.NYC.PKG = '):
            return json.loads(line[len('window.NYC.PKG = '):].rstrip().rstrip(';'))
    raise SystemExit('no PKG in %s' % d)


def solids(d):
    """[(shapely geometry)] every building ring and every mass rectangle (turned by its building's theta)."""
    h, b = sfb1(os.path.join(d, 'data', 'buildings.bin.gz'))
    F = h['fields']
    nf = len(F)
    a = np.frombuffer(b, dtype='<f4')
    tab = a[:h['tableFloats']].reshape(h['count'], nf)
    verts = a[h['tableFloats']:h['tableFloats'] + h['vertexFloats']]
    mass = a[h['tableFloats'] + h['vertexFloats']:h['tableFloats'] + h['vertexFloats'] + h['massFloats']].reshape(-1, 4)
    I = {k: i for i, k in enumerate(F)}
    out = []
    for rec in tab:
        s, n = int(rec[I['ringStart']]), int(rec[I['ringCount']])
        ring = verts[2 * s:2 * (s + n)].reshape(-1, 2).astype(np.float64)
        if n >= 3:
            g = Polygon(ring)
            out.append(g if g.is_valid else g.buffer(0))
        th = float(rec[I['theta']])
        cs, sn = math.cos(th), math.sin(th)
        for m in mass[int(rec[I['massStart']]):int(rec[I['massStart']]) + int(rec[I['massCount']])]:
            cx, cz, w, dd = [float(v) for v in m]
            # (the engine's obb: local x = dx cs - dz sn, local z = dx sn + dz cs; back to the world)
            pts = []
            for lx, lz in ((-w / 2, -dd / 2), (w / 2, -dd / 2), (w / 2, dd / 2), (-w / 2, dd / 2)):
                pts.append((cx + lx * cs + lz * sn, cz - lx * sn + lz * cs))
            out.append(Polygon(pts))
    return out


def mask_of(d):
    h, b = sfb1(os.path.join(d, 'data', 'groundmask.bin.gz'))
    m = np.frombuffer(b, dtype=np.uint8).reshape(h['h'], h['w'])
    cell, ox, oz = h['cell'], h['originX'], h['originZ']

    def at(x, z):
        i, j = int(math.floor((x - ox) / cell)), int(math.floor((z - oz) / cell))
        return int(m[j, i]) if 0 <= j < m.shape[0] and 0 <= i < m.shape[1] else -1
    return at


def scan(d):
    P = pkg_of(d)
    S = solids(d)
    tree = shapely.STRtree(S)
    mask = mask_of(d)

    def hit(x, z, r=0.0):
        q = Point(x, z)
        return any(S[i].distance(q) <= r for i in tree.query(q.buffer(r + 0.01)).tolist())

    def cross(x0, z0, x1, z1):
        if math.hypot(x1 - x0, z1 - z0) < 1.0:
            return False
        # (its last metre left out: a lane point beside a wall, approach.py END_FREE)
        L = math.hypot(x1 - x0, z1 - z0)
        f = (L - 1.0) / L
        ln = LineString([(x0, z0), (x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)])
        return any(S[i].buffer(-0.05).intersects(ln) for i in tree.query(ln, predicate='intersects').tolist())

    def to_road(x0, z0):
        """A straight walk to the open roadway (the mask's asphalt, in no building) within 25 m."""
        road = []
        for i in range(-25, 26):
            for j in range(-25, 26):
                x, z = x0 + i, z0 + j
                if i * i + j * j <= 625 and mask(x, z) == MASK_ASPHALT and not hit(x, z):
                    road.append((i * i + j * j, x, z))
        return any(not cross(x0, z0, x, z) for _, x, z in sorted(road)[:60])
    rows, n = [], {'places': 0, 'centreIn': 0, 'laneIn': 0, 'noApproach': 0, 'approachIn': 0, 'approachWet': 0, 'approachRoad': 0, 'notToLane': 0, 'unreachable': 0}
    box = P.get('window') or None
    for k, p in sorted(P['places'].items()):
        # (a district bundle builds only its window: a place outside it has nothing built round it yet)
        if box and not box.get('full', True):
            b = box['box']
            if not (b['x0'] <= p['x'] <= b['x1'] and b['z0'] <= p['z'] <= b['z1']):
                continue
        n['places'] += 1
        r = {'key': k, 'kind': p.get('kind'), 'name': p.get('name'), 'x': p['x'], 'z': p['z'], 'cx': p.get('cx'), 'cz': p.get('cz'), 'ax': p.get('ax'), 'az': p.get('az'), 'how': p.get('aHow')}
        r['centreIn'] = p.get('cx') is not None and hit(p['cx'], p['cz'])
        r['laneIn'] = hit(p['x'], p['z'])
        if p.get('ax') is None:
            r['noApproach'] = True
        else:
            ax, az = p['ax'], p['az']
            mk = mask(ax, az)
            r['approachIn'] = hit(ax, az, PERSON)
            r['approachWet'] = mk == MASK_WATER_EDGE
            r['approachRoad'] = mk == MASK_ASPHALT
            # (no straight walk to its lane point: notToLane; nor to the open roadway within 25 m: unreachable, cut
            # off from the road network. approach.py's rule on the compiled town)
            r['notToLane'] = hit(p['x'], p['z']) or cross(ax, az, p['x'], p['z'])
            r['unreachable'] = r['notToLane'] and not to_road(ax, az)
            r['mask'] = mk
        for f in n:
            if f != 'places' and r.get(f):
                n[f] += 1
        rows.append(r)
    return {'pkg': P.get('id'), 'name': P.get('name'), 'buildId': P.get('buildId') or P.get('compiler'), 'buildings': len(S), 'counts': n, 'window': box,
            'rows': rows}


if __name__ == '__main__':
    args = sys.argv[1:]
    out = None
    if '--json' in args:
        i = args.index('--json')
        out = args[i + 1]
        del args[i:i + 2]
    res = [scan(d) for d in args]
    for r in res:
        print(json.dumps({'pkg': r['pkg'], 'name': r['name'], 'buildId': r['buildId'], **r['counts']}))
    if out:
        json.dump(res, open(out, 'w'), indent=1)
