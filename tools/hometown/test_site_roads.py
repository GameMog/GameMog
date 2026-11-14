# tools/hometown/test_site_roads.py: a site's own roads and the buildings over them (0.8.1, World.footprint / site_cut,
# README "Site roads"). The cut is pure geometry (clip_cm, cut_piece); with Bal Harbour's regions fetched
# (HOMETOWN_TEST_DATA / HOMETOWN_TEST_STORE, else skipped) the mall keeps its place and its service passage is no road.
#   <venv>/bin/python tools/hometown/test_site_roads.py
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
import compile as C  # noqa: E402
import grid  # noqa: E402

DATA = os.environ.get('HOMETOWN_TEST_DATA', os.path.join(ROOT, '.scratch/hometown-m2/data'))
STORE = os.environ.get('HOMETOWN_TEST_STORE', os.path.join(ROOT, '.scratch/hometown/store'))
# Bal Harbour, FL: the Bal Harbour mall's outline (24,000 m2) and the service passage under it (a tunnel link)
BH_TILE = (9012, 10385)
BH_MALL = '6f5213c1-75e4-4f93-afe1-150f6ea38f13'
BH_PASSAGE = '63947f14-add7-4ca1-9a3b-bc79e0d67590'
T = grid.TILE_CM


def piece(pts, subs):
    """A raw piece of segment 's' (index 3) with the given int-cm points and subs [(pts, na, nb)]."""
    out = {'seg': 's', 'i': 3, 'a': 'A', 'b': 'B', 'pts': pts, 'w': 6.0, 'soft': True, 'f0': 0.0, 'f1': 1.0, 'br': [], 'tun': [], 'lvl': 0}
    out['subs'] = [{'j': j, 'pts': p, 'na': a, 'nb': b, 'own': ((p[0][0] + p[1][0]) // (2 * T), (p[0][1] + p[1][1]) // (2 * T))}
                   for j, (p, a, b) in enumerate(subs)]
    return out


class Clip(unittest.TestCase):
    def test_clip_cm(self):
        pts = [(0, 0), (1000, 0), (1000, 1000)]
        self.assertEqual(C.clip_cm(pts, 0.0, 20.0), pts)
        self.assertEqual(C.clip_cm(pts, 2.5, 15.0), [(250, 0), (1000, 0), (1000, 500)])
        self.assertEqual(C.clip_cm(pts, 0.0, 4.0), [(0, 0), (400, 0)])

    def test_cut_keeps_border_nodes(self):
        # a 30 m drive crossing the grid line E = T at 10 m: cut back to 25 m from its start, the border node stays exact
        x0 = T - 1000
        p = piece([(x0, 500), (x0 + 3000, 500)], [([(x0, 500), (T, 500)], 'c:A', 'b:s:E1:0'), ([(T, 500), (x0 + 3000, 500)], 'b:s:E1:0', 'c:B')])
        q = C.cut_piece(p, 0.0, 25.0)
        self.assertEqual([(s['na'], s['nb']) for s in q['subs']], [('c:A', 'b:s:E1:0'), ('b:s:E1:0', 'x:s:3:b')])
        self.assertEqual(q['subs'][0]['pts'], p['subs'][0]['pts'])
        self.assertEqual(q['subs'][1]['pts'], [(T, 500), (x0 + 2500, 500)])
        self.assertEqual((q['a'], q['b']), ('A', 'x:s:3:b'))
        self.assertEqual(q['pts'], [(x0, 500), (T, 500), (x0 + 2500, 500)])
        self.assertEqual([s['own'] for s in q['subs']], [s['own'] for s in p['subs']])
        self.assertAlmostEqual(q['f1'], 25.0 / 30.0)
        # (from the other end: the first sub goes, the start is the dead end)
        q = C.cut_piece(p, 12.0, 30.0)
        self.assertEqual([(s['na'], s['nb']) for s in q['subs']], [('x:s:3:a', 'c:B')])
        self.assertEqual(q['a'], 'x:s:3:a')
        self.assertNotIn('geom_', q)


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

    def test_mall_keeps_its_place(self):
        W = self.W
        mall = [b for b in W.src.rows['buildings'] if b['id'] == BH_MALL][0]
        f = W.footprint(mall)
        self.assertIsNotNone(f)
        self.assertGreater(f[0].area, 20000)

    def test_passage_is_no_road(self):
        W = self.W
        s = [s for s in W.src.rows['segments'] if s['id'] == BH_PASSAGE][0]
        self.assertTrue(W.raw_pieces(s))
        self.assertTrue(all(p['soft'] for p in W.raw_pieces(s)))
        # (the passage itself is dropped; past its portal a 1.6 m stub outside the wall stays a road)
        gone = [p for p in W.raw_pieces(s) if p not in W.pieces(s)]
        self.assertEqual([p['i'] for p in gone], [0])
        self.assertTrue(gone[0]['flags'] & C.FLAGS['tunnel'])
        self.assertLess(sum(W.pgeom(p)[1] for p in W.pieces(s)), 2.0)

    def test_public_streets_untouched(self):
        # every firm (public) piece round the mall is its own raw piece
        W = self.W
        c, r = BH_TILE
        box = C.sbox(c * 512 - 160, r * 512 - 160, c * 512 + 672, r * 512 + 672)
        for s in W.src.query('segments', box):
            raw = W.raw_pieces(s)
            if raw and not raw[0]['soft']:
                self.assertEqual(W.pieces(s), raw)


if __name__ == '__main__':
    unittest.main()
