# tools/hometown/test_frame.py: the frame descriptor (frame.py) and lock v3.
#   unit (always): lock v3's tiles id (a fixed vector, order-free); the frame's post function equals the tiles' own
#     (compile.py World.posts_cm) at every frame post, on a synthetic DEM with a lake (land, water, the shore blur);
#     the datum rule.
#   data (when the Okemah regions are fetched, HOMETOWN_TEST_DATA / HOMETOWN_TEST_STORE, else skipped): the frame is
#     the same bytes whatever tiles the store holds (none: every tiles/ key hidden; some: two compiled; all: whatever
#     the store has, e.g. after compile.py --id), and a store that FAILS on any tiles/ read still gives it (it never
#     reads one); the spawn and its district places lie in the 5 x 5 district; lock v3 names the pinned tiles.
#   <venv>/bin/python tools/hometown/test_frame.py
import hashlib
import json
import os
import sys
import unittest

import numpy as np
from shapely.geometry import box as sbox

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grid  # noqa: E402
import compile as C  # noqa: E402
import frame as FR  # noqa: E402
import context  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '../..'))
DATA = os.environ.get('HOMETOWN_TEST_DATA', os.path.join(ROOT, '.scratch/hometown-m2/data'))
STORE = os.environ.get('HOMETOWN_TEST_STORE', os.path.join(ROOT, '.scratch/hometown/store'))
PLACE = os.environ.get('HOMETOWN_TEST_PLACE', 'okemah')


class FakeDem:
    def sample(self, lon, lat):
        lon, lat = np.asarray(lon, dtype=np.float64), np.asarray(lat, dtype=np.float64)
        return 250 + 30 * np.sin(lon * 400) * np.cos(lat * 350) + 3 * np.sin(lon * 4000 + lat * 3000)


class FakeSrc:
    def __init__(self, water):
        self.rows = {'water': water}

    def query(self, key, geom, predicate='intersects'):
        if key != 'water':
            return []
        return sorted((r for r in self.rows['water'] if r['geom'].intersects(geom)), key=lambda r: r['id'])


class FakeCtx:
    def level(self, wid, C_, R_):
        return {'lake': 24125}.get(wid)


def fake_world(water):
    W = C.World.__new__(C.World)
    W.d = grid.domain('conus')
    W.dem = FakeDem()
    W.src = FakeSrc(water)
    W.bridge_c = {}
    return W


class Unit(unittest.TestCase):
    def test_tiles_id_vector(self):
        bid = 'htc-0.8.0-hg1-b00000000'
        ids = ['hg1-conus/0/2/1', 'hg1-conus/0/1/2', 'hg1-conus/0/10/2']
        want = hashlib.sha256(('%s\nhg1-conus/0/1/2\nhg1-conus/0/10/2\nhg1-conus/0/2/1' % bid).encode()).hexdigest()
        self.assertEqual(FR.tiles_id(bid, ids), want)
        self.assertEqual(FR.tiles_id(bid, list(reversed(ids))), want)
        self.assertNotEqual(FR.tiles_id(bid, ids[:2]), want)
        self.assertNotEqual(FR.tiles_id('htc-0.8.0-hg1-b00000001', ids), want)

    def test_posts_match_tiles_post_function(self):
        # a window of 2 m posts near Okemah's grid position, a lake polygon over part of it
        c, r = 5805, 8582
        gx0, gs0 = c * grid.TILE, r * grid.TILE
        lake = sbox(gx0 + 100, gs0 + 60, gx0 + 300, gs0 + 260)
        water = [{'id': 'lake', 'geom': lake, 'subtype': 'lake', 'class': 'lake', 'name': None}]
        W = fake_world(water)
        ctx = FakeCtx()
        I0, J0 = gx0 // grid.POST, gs0 // grid.POST
        n = 200
        ref, wet_ref, _ = W.posts_cm(I0, J0, I0 + n, J0 + n, ctx)
        cmv, wet, wid, ids, wlv = FR.frame_posts(W, ctx, gx0, gs0, gx0 + (n - 1) * grid.POST, gs0 + (n - 1) * grid.POST)
        sub = ref[::FR.POST_STEP, ::FR.POST_STEP].ravel()
        self.assertEqual(cmv.shape, sub.shape)
        self.assertTrue(np.array_equal(cmv, sub), 'frame posts == the tiles\' posts_cm at every 8th post (max diff %d cm)' % int(np.abs(cmv - sub).max()))
        self.assertTrue(np.array_equal(wet, wet_ref[::FR.POST_STEP, ::FR.POST_STEP].ravel()))
        self.assertTrue(wet.any() and (~wet).any())
        self.assertEqual(ids, ['lake'])
        self.assertTrue((wlv[wet] == 24125).all())

    def test_datum_rule(self):
        cmv = np.array([24100, 24200, 25000, 26000, 24125, 24125])
        wet = np.array([False, False, False, False, True, True])
        wid = np.array([-1, -1, -1, -1, 0, 0])
        wlv = np.array([0, 0, 0, 0, 24125, 24125])
        y, wl, lvl, waters = FR.datum(cmv, wet, wid, ['lake'], wlv)
        self.assertEqual((y, wl, lvl), (241, 0.25, 241.25))
        y, wl, lvl, _ = FR.datum(cmv[:4], wet[:4], wid[:4], [], wlv[:4])
        self.assertEqual((y, wl, lvl), (241, -10.0, None))


class HiddenTiles(C.Store):
    """The store with every tiles/ key absent (none stored), or failing (the frame must never read one)."""
    def __init__(self, root, fail=False):
        super().__init__(root)
        self.fail, self.reads = fail, []

    def get(self, key):
        if key.startswith('tiles/'):
            self.reads.append(key)
            if self.fail:
                raise AssertionError('the frame read a tile: %s' % key)
            return None
        return super().get(key)

    def put_if_absent(self, key, body):
        assert not key.startswith('tiles/'), key
        return super().put_if_absent(key, body)


def have_data():
    places = json.load(open(os.path.join(HERE, 'places.json')))['places']
    if PLACE not in places or not os.path.isdir(os.path.join(DATA, 'regions')) or not os.path.isdir(STORE):
        return None
    return places


@unittest.skipUnless(have_data(), 'no fetched regions / store (HOMETOWN_TEST_DATA, HOMETOWN_TEST_STORE)')
class WithData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.places = have_data()
        C.set_osm_roads(os.path.join(DATA, 'osm', 'osm-roads-us.parquet'))
        cls.store = C.Store(STORE)
        cls.bid, _ = C.register_build(cls.store)
        cls.F_all, _ = FR.compute(PLACE, cls.places, DATA, cls.store, cls.bid, log=lambda *a: None)

    def body(self, F):
        return FR.body(F)

    def test_none_and_never_reads_tiles(self):
        st = HiddenTiles(STORE, fail=True)
        F, _ = FR.compute(PLACE, self.places, DATA, st, self.bid, log=lambda *a: None)
        self.assertEqual(st.reads, [])
        self.assertEqual(self.body(F), self.body(self.F_all))

    def test_some(self):
        # two of the district's tiles compiled into the store (ifAbsent), then the frame again
        F0 = self.F_all
        d = F0['district']['tileRange']
        W = C.World(DATA, F0['domain'], C.tile_window(d[0], d[1], d[0] + 1, d[1]), self.store, self.bid)
        C.compile_tiles(W, self.store, [(d[0], d[1]), (d[0] + 1, d[1])], log=lambda *a: None)
        for c, r in [(d[0], d[1]), (d[0] + 1, d[1])]:
            self.assertIsNotNone(self.store.get(C.tile_key(self.bid, F0['domain'], c, r)))
        F, _ = FR.compute(PLACE, self.places, DATA, self.store, self.bid, log=lambda *a: None)
        self.assertEqual(self.body(F), self.body(F0))

    def test_shape(self):
        F = self.F_all
        self.assertEqual(F['format'], 'hometown-frame')
        self.assertEqual(F['lock']['formatVersion'], 3)
        self.assertEqual(F['lock']['tiles'], FR.tiles_id(self.bid, F['tiles']))
        self.assertEqual(F['lock']['yOffset'], F['yOffset'])
        c0, r0, c1, r1 = F['district']['tileRange']
        self.assertEqual((c1 - c0 + 1, r1 - r0 + 1), (5, 5))
        self.assertTrue(F['spawn'] and F['spawn'].get('district'), 'the spawn lies in its own district')
        b = F['district']['box']
        m = F['district']['marginM']
        for k, p in F['places'].items():
            inside = b['x0'] + m <= p['x'] <= b['x1'] - m and b['z0'] + m <= p['z'] <= b['z1'] - m
            self.assertEqual(bool(p.get('district')), inside, k)
        self.assertTrue(F['district']['places'], 'Okemah has places in its spawn district')


if __name__ == '__main__':
    unittest.main(verbosity=2)
