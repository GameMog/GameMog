# tools/hometown/test_r7.py: the warm band's r7 street and shore rules (0.11.0; README "ground", "trees"). With Bal
# Harbour's regions fetched (HOMETOWN_TEST_DATA / HOMETOWN_TEST_STORE, else skipped), on the tile west of its beach
# and Collins Avenue: the avenue's planting strip (grass between the curb and the sidewalk), the dunes behind the beach
# (sand and scrub, no lawn within DUNE_M m of the sand), the trees over its hedge walls, and no hedge across a road or
# path that crosses its line.
#   <venv>/bin/python tools/hometown/test_r7.py
import math
import os
import sys
import unittest

import numpy as np
import shapely
from shapely.geometry import Point

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
import compile as C  # noqa: E402

DATA = os.environ.get('HOMETOWN_TEST_DATA', os.path.join(ROOT, '.scratch/hometown-m2/data'))
STORE = os.environ.get('HOMETOWN_TEST_STORE', os.path.join(ROOT, '.scratch/hometown/store'))
BH_TILE = (9012, 10384)


class Tables(unittest.TestCase):
    def test_strip_only_warm_major(self):
        p = {'cls': 'primary', 'link': False, 'flags': 0}
        self.assertEqual(C.strip_of(p, 'tropical'), C.STRIP_M)
        self.assertEqual(C.strip_of(p, None), 0.0)
        self.assertEqual(C.strip_of(dict(p, cls='residential'), 'tropical'), 0.0)
        self.assertEqual(C.strip_of(dict(p, link=True), 'tropical'), 0.0)
        self.assertEqual(C.strip_of(dict(p, flags=C.FLAGS['freeway']), 'subtropical'), 0.0)

    def test_dedupe_kinds(self):
        self.assertEqual(sorted(C.WARM_DEDUPE), [0, 1, 2, 3, 4, 5])


@unittest.skipUnless(os.path.exists(os.path.join(DATA, 'regions', 'hg1-conus', '4', '563', '648', 'region.json')), 'Bal Harbour regions not fetched')
class BalHarbour(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        osm = os.path.join(DATA, 'osm', 'osm-roads-us.parquet')
        C.set_osm_roads(osm if os.path.exists(osm) else os.path.join(HERE, 'osm', 'osm-roads-us.parquet'))
        store = C.Store(STORE)
        bid, _ = C.register_build(store)
        c, r = BH_TILE
        cls.W = C.World(DATA, 'conus', C.tile_window(c, r, c, r), store, bid, dem_store=store)
        b, _ = C.compile_tile(cls.W, c, r)
        cls.h, cls.s, _ = C.read_htl1(b)
        cls.X0, cls.Z0 = c * C.TILE, r * C.TILE

    def test_collins_strip(self):
        # (across Collins Avenue's outer sides: from the curb, the first cells past it are open ground, the sidewalk
        # after them; on most of the tile's rows that cross the avenue's carriageways)
        a = self.s['mask']
        pieces = [p for p in self.W.pieces_near(shapely.box(self.X0, self.Z0, self.X0 + C.TILE, self.Z0 + C.TILE))
                  if p['name'] == 'COLLINS AVE' and C.strip_of(p, 'tropical')]
        self.assertTrue(pieces)
        ok = bad = 0
        for p in pieces:
            for gl in self.W.ground_lines(p):
                for f in np.linspace(0.2, 0.8, 4):
                    q, q2 = gl.interpolate(f, normalized=True), gl.interpolate(min(1.0, f + 0.01), normalized=True)
                    dx, dz = q2.x - q.x, q2.y - q.y
                    ln = math.hypot(dx, dz)
                    if ln < 1e-6:
                        continue
                    side = 1 if p['swr'] > 0 else -1
                    nx, nz = -dz / ln * side, dx / ln * side
                    cells = []
                    for o in (p['w'] / 2 + 0.6, p['w'] / 2 + C.STRIP_M - 0.6, p['w'] / 2 + C.STRIP_M + 1.0):
                        x, z = q.x + nx * o - self.X0, q.y + nz * o - self.Z0
                        if not (0 <= x < C.TILE and 0 <= z < C.TILE):
                            break
                        cells.append(int(a[int(z), int(x)]))
                    if len(cells) < 3 or C.MASK['asphalt'] in cells:
                        continue
                    if cells[0] in (C.MASK['lawn'], C.MASK['scrub']) and cells[2] == C.MASK['sidewalk']:
                        ok += 1
                    else:
                        bad += 1
        self.assertGreater(ok, 4)
        self.assertGreater(ok, 3 * bad)

    def test_dunes(self):
        # (no lawn within 20 m of the beach's sand, sand and scrub cells behind it instead)
        a = self.s['mask']
        beach = a == C.MASK['beach']
        self.assertTrue(beach.any())
        sands = [shapely.make_valid(r['geom']) for r in self.W.src.query('sand', shapely.box(self.X0, self.Z0, self.X0 + C.TILE, self.Z0 + C.TILE))]
        near = sands[0]
        for g in sands[1:]:
            near = near.union(g)
        band = near.buffer(20.0).difference(near)
        js, iis = np.nonzero(np.ones_like(a, dtype=bool))
        xs, zs = self.X0 + iis + 0.5, self.Z0 + js + 0.5
        inside = shapely.contains_xy(band, xs, zs).reshape(a.shape)
        vals = a[inside]
        self.assertGreater(int((vals == C.MASK['scrub']).sum()), 200)
        self.assertLess(int((vals == C.MASK['lawn']).sum()), 0.05 * vals.size)

    def test_trees_over_walls(self):
        tr = self.s['trees'].reshape(-1, 4).tolist()
        walls = [t for t in tr if t[2] == C.TREE_CLASS['hedge'] and t[3] >= 180]
        self.assertGreater(len(walls), 50)
        wt = shapely.STRtree(shapely.points(np.array([(t[0] / 100, t[1] / 100) for t in walls])))
        over = [t for t in tr if t[2] in (C.TREE_CLASS['ficus'], C.TREE_CLASS['seagrape'])
                and len(wt.query(Point(t[0] / 100, t[1] / 100).buffer(C.HEDGE_TREE_BACK + 0.5), predicate='intersects'))]
        self.assertGreater(len(over), 5)

    def test_gaps(self):
        # (no street hedge block within 2 m of a segment that crosses it)
        tr = self.s['trees'].reshape(-1, 4).tolist()
        hedges = [t for t in tr if t[2] == C.TREE_CLASS['hedge']]
        bad = 0
        for u, v, _, yaw in hedges:
            x, z = self.X0 + u / 100, self.Z0 + v / 100
            th = math.radians(yaw % 180)
            tx, tz = math.cos(th), -math.sin(th)
            pt = Point(x, z)
            for o in self.W.src.query('segments', pt.buffer(2.0)):
                g = o['geom']
                t = g.project(pt)
                A, B = g.interpolate(max(0.0, t - 1.0)), g.interpolate(min(g.length, t + 1.0))
                dx, dz = B.x - A.x, B.y - A.y
                ln = math.hypot(dx, dz)
                if ln > 1e-6 and abs(dx * tx + dz * tz) / ln < 0.5:
                    bad += 1
                    break
        self.assertEqual(bad, 0)


if __name__ == '__main__':
    unittest.main()
