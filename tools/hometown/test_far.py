# tools/hometown/test_far.py: far tiles (far.py) on a synthetic DEM: shared edges byte-identical between neighbours
# (every tier), determinism, flat (hydro-flattened) ground classed water, the arid rule, the place's tile set, and tier
# A: the core's own post function at its posts (so the core's edge meets it), a ring round the core only.
#   <venv>/bin/python tools/hometown/test_far.py
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import far  # noqa: E402
import grid  # noqa: E402


class FakeDem:
    """A 1" DEM: rolling hills, and a lake (one exact height) where lon in [-96.33, -96.30]."""
    RES = 3600

    def __init__(self):
        self.used = {}

    def _h(self, lon, lat):
        lon, lat = np.asarray(lon, dtype=np.float64), np.asarray(lat, dtype=np.float64)
        h = 250 + 30 * np.sin(lon * 40) * np.cos(lat * 35) + 5 * np.sin(lon * 400 + lat * 300)
        return np.where((lon > -96.33) & (lon < -96.30), 241.25, h)

    def sample(self, lon, lat):
        return self._h(lon, lat)

    def pixels(self, col, row):
        col, row = np.asarray(col), np.asarray(row)
        return self._h((col + 0.5) / self.RES, -(row + 0.5) / self.RES)

    def sources(self):
        return [{'url': 'fake', 'etag': 'e'}]


class FakeDem13(FakeDem):
    RES = 10800


class Far(unittest.TestCase):
    def tiles(self, tier, C, R):
        return far.read_far(far.compile_far('conus', tier, C, R, FakeDem13() if tier == 'a' else FakeDem(), 'bid'))

    def test_shared_edges_identical(self):
        for tier, (C, R) in (('a', (2900, 4288)), ('b', (725, 1072)), ('c', (181, 268))):
            h, q, c = self.tiles(tier, C, R)
            _, qe, ce = self.tiles(tier, C + 1, R)
            _, qs, cs = self.tiles(tier, C, R + 1)
            self.assertEqual(h['n'], 65)
            self.assertTrue(np.array_equal(q[:, -1], qe[:, 0]), tier + ' east edge heights')
            self.assertTrue(np.array_equal(c[:, -1], ce[:, 0]), tier + ' east edge classes')
            self.assertTrue(np.array_equal(q[-1, :], qs[0, :]), tier + ' south edge heights')

    def test_deterministic_and_bytes_only_from_the_key(self):
        a = far.compile_far('conus', 'b', 725, 1072, FakeDem(), 'bid')
        b = far.compile_far('conus', 'b', 725, 1072, FakeDem(), 'bid')
        self.assertEqual(a, b)

    def test_flat_is_water_and_heights_decode(self):
        d = grid.domain('conus')
        found = False
        for C in range(720, 730):
            h, q, c = self.tiles('b', C, 1072)
            H = h['minH'] + q * h['scale']
            if (c == 1).any():
                found = True
                self.assertTrue(np.allclose(H[c == 1], 241.25, atol=0.06), 'a water post keeps its flat 3DEP height')
            X, S = far.posts_xy('b', C, 1072)
            lon, lat = d.inverse(X.ravel(), S.ravel())
            lon = np.asarray(lon).reshape(X.shape)
            self.assertFalse(((c == 1) & ((lon < -96.335) | (lon > -96.295))).any(), 'no water away from the flat lake')
        self.assertTrue(found)

    def test_arid_rule_and_place_tiles(self):
        d = grid.domain('conus')
        gx, gs = grid.project_cm(d, [-112.07], [33.45])
        C, R = int(gx[0] // 100 // 4096), int(gs[0] // 100 // 4096)
        h, q, c = self.tiles('b', C, R)
        self.assertTrue((c == 2).mean() > 0.9, 'Phoenix is arid land')
        core = (5806 * 512, 8582 * 512, 5812 * 512, 8590 * 512)
        P = far.place_far(core, 'conus')
        T = far.tile_size('b')
        bs = P['b']
        self.assertTrue(min(C_ for C_, _ in bs) * T <= core[0] - far.FAR_B and (max(C_ for C_, _ in bs) + 1) * T >= core[2] + far.FAR_B)
        self.assertEqual(len(bs), len(set(bs)))
        self.assertEqual(far.parse_far_id('hg1-conus/5/181/268'), ('conus', 'c', 181, 268))
        with self.assertRaises(ValueError):
            far.parse_far_id('hg1-conus/4/1/1')


    def test_tier_a_is_the_core_post_function(self):
        # posts_cm on land (compile.py): DEM at the 5 x 5 posts 2 m apart round the post, blurred x then z, int cm
        d = grid.domain('conus')
        h, q, c = self.tiles('a', 2900, 4288)
        self.assertEqual(h['step'], 16)
        X, S = far.posts_xy('a', 2900, 4288)
        K = far.BLUR / far.BLUR.sum()
        dem = FakeDem13()
        for j, i in ((0, 0), (10, 33), (64, 64), (40, 7)):
            o = (np.arange(5) - 2) * 2.0
            px, ps = np.meshgrid(X[j, i] + o, S[j, i] + o)
            lon, lat = d.inverse(px.ravel(), ps.ravel())
            ref = np.rint((dem.sample(lon, lat).reshape(5, 5) * K[None, :] * K[:, None]).sum() * 100) / 100
            self.assertAlmostEqual(h['minH'] + q[j, i] * h['scale'], ref, delta=0.0501)

    def test_tier_a_ring_only(self):
        core = (2900 * 1024 + 512, 4288 * 1024, 2904 * 1024, 4292 * 1024 + 512)
        A = far.tiles_for(core, 'a')
        T = far.tile_size('a')
        for C, R in A:
            self.assertFalse(C * T >= core[0] and R * T >= core[1] and (C + 1) * T <= core[2] and (R + 1) * T <= core[3], 'a tile inside the core')
        self.assertNotIn((2902, 4290), A)
        self.assertIn((2899, 4287), A)
        self.assertIn((2904, 4293), A)
        self.assertNotIn((2905, 4293), A)
        self.assertEqual(far.place_far(core, 'conus')['a'], A)
        self.assertEqual(far.parse_far_id('hg1-conus/1/2900/4288'), ('conus', 'a', 2900, 4288))


if __name__ == '__main__':
    unittest.main()
