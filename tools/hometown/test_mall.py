# tools/hometown/test_mall.py: the mall kind and the warm band's hedge walls (0.8.2, fid2-mall; README "kind", "trees").
# With Bal Harbour's regions fetched (HOMETOWN_TEST_DATA / HOMETOWN_TEST_STORE, else skipped): its shopping centre (a
# 23,000 m2, 11 m outline Overture gives no class) is a mall, not a warehouse, and its tile's hedges along Collins Avenue
# and round the car parks are walls (the fourth field's yaw + 180), each on lawn, scrub or a lot.
#   <venv>/bin/python tools/hometown/test_mall.py
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
import compile as C  # noqa: E402

DATA = os.environ.get('HOMETOWN_TEST_DATA', os.path.join(ROOT, '.scratch/hometown-m2/data'))
STORE = os.environ.get('HOMETOWN_TEST_STORE', os.path.join(ROOT, '.scratch/hometown/store'))
BH_TILE = (9012, 10385)
BH_MALL = '6f5213c1-75e4-4f93-afe1-150f6ea38f13'


class Tables(unittest.TestCase):
    def test_kind_appended(self):
        # (an older engine reads the kinds from the header by name: 'mall' is appended, every earlier index stays)
        self.assertEqual(C.KINDS[:14], ['unknown', 'house', 'garage', 'shed', 'rowhouse', 'apartment', 'shop', 'office', 'church', 'school',
                                        'civic', 'warehouse', 'canopy', 'tower'])
        self.assertEqual(C.KINDS[14], 'mall')
        self.assertEqual(C.KIND_TYPE['mall'], 'office-low')
        self.assertIn('mall', C.LOT_KINDS)

    def test_wall_shares(self):
        # (a wall side is any side that had a hedge before: the same hash, a larger share)
        for warm in ('tropical', 'subtropical'):
            self.assertGreaterEqual(C.WARM_WALL_P[warm], C.WARM_HEDGE_P[warm])


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

    def test_mall_is_a_mall(self):
        recs = [b for b in self.s['buildings'] if b.get('id') == BH_MALL]
        self.assertEqual(len(recs), 1)
        self.assertEqual(C.KINDS[recs[0]['kind']], 'mall')
        self.assertEqual(recs[0]['shops'], 1)

    def test_hedge_walls(self):
        tr = self.s['trees'].reshape(-1, 4).tolist()
        hedges = [t for t in tr if t[2] == C.TREE_CLASS['hedge']]
        walls = [t for t in hedges if t[3] >= 180]
        self.assertGreater(len(walls), 50)
        self.assertTrue(all(0 <= t[3] < 360 for t in hedges))
        a = self.s['mask']
        ok = (C.MASK['lawn'], C.MASK['scrub'], C.MASK['lot'])
        for u, v, _, _ in walls:
            self.assertIn(int(a[v // 100, u // 100]), ok)


if __name__ == '__main__':
    unittest.main()
