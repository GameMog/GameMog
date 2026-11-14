# tools/hometown/test_ground.py: the ground classes' rules (climate.py, compile.py lu_ground / MASK): python test_ground.py
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402

import climate  # noqa: E402
import compile as C  # noqa: E402


class Climate(unittest.TestCase):
    def test_zones(self):
        # (points, not places: the rule is lon / lat only)
        cases = {(-112.07, 33.45): 'arid', (-115.14, 36.17): 'arid', (-106.44, 31.76): 'arid', (-116.2, 39.5): 'arid',
                 (-80.0, 40.44): 'humid', (-96.31, 35.43): 'humid', (-84.39, 33.75): 'humid', (-122.33, 47.61): 'humid', (-124.1, 40.8): 'humid',
                 (-104.99, 39.74): 'dry', (-101.85, 33.58): 'dry', (-118.24, 34.05): 'dry', (-121.49, 38.58): 'dry'}
        for (lon, lat), want in cases.items():
            self.assertEqual(climate.zone(lon, lat), want, (lon, lat))

    def test_vectorised_matches_scalar(self):
        lon = np.linspace(-125, -67, 59)
        lat = np.linspace(25, 49, 59)
        LO, LA = np.meshgrid(lon, lat)
        v = climate.zone_code(LO.ravel(), LA.ravel())
        for k in range(0, v.size, 97):
            self.assertEqual(int(v[k]), climate.zone_code(float(LO.ravel()[k]), float(LA.ravel()[k])))
        self.assertTrue(set(np.unique(v).tolist()) <= {climate.HUMID, climate.ARID, climate.DRY})


class Warmth(unittest.TestCase):
    def test_bands(self):
        # (points, not places)
        cases = {(-80.124, 25.893): 'tropical', (-81.78, 24.55): 'tropical', (-81.8, 26.14): 'tropical', (-80.05, 26.7): 'tropical',
                 (-82.46, 27.95): 'subtropical', (-81.38, 28.54): 'subtropical', (-97.5, 25.9): 'subtropical', (-97.4, 27.8): 'subtropical',
                 (-157.86, 21.31): 'tropical', (-66.1, 18.47): 'tropical', (144.79, 13.44): 'tropical', (-170.7, -14.28): 'tropical',
                 (-82.32, 29.65): None, (-87.2, 30.42): None, (-81.66, 30.33): None, (-95.37, 29.76): None, (-98.49, 29.42): None,
                 (-112.07, 33.45): None, (-96.31, 35.43): None, (-80.0, 40.44): None, (-118.24, 34.05): None, (-117.16, 32.72): None}
        for (lon, lat), want in cases.items():
            self.assertEqual(climate.warmth(lon, lat), want, (lon, lat))
            # (the ground zone is never changed by it: the far field and the open ground stay as they were)
            self.assertEqual(climate.zone_name(lon, lat), want or climate.zone(lon, lat), (lon, lat))

    def test_region(self):
        self.assertEqual(C.region_of(-80.124, 25.893), 'south-florida')
        self.assertEqual(C.region_of(-82.46, 27.95), 'south-florida')
        self.assertEqual(C.region_of(-66.1, 18.47), 'south-florida')
        # (everywhere else as before 0.8.1)
        for (lon, lat), want in {(-96.31, 35.43): 'plains-midwest', (-80.0, 40.44): 'northeast-rust', (-112.07, 33.45): 'southwest',
                                 (-84.39, 33.75): 'southeast', (-82.32, 29.65): 'southeast', (-97.5, 25.9): 'plains-midwest',
                                 (-157.86, 21.31): 'california', (-118.24, 34.05): 'california'}.items():
            self.assertEqual(C.region_of(lon, lat), want, (lon, lat))
        self.assertIn('south-florida', C.REGIONS)

    def test_tree_classes(self):
        # San Francisco's tree-classes.json keep their numbers; the warm band's follow
        self.assertEqual([C.TREE_CLASS[k] for k in ('plane', 'ficus', 'palm', 'elm', 'conifer', 'locust')], list(range(6)))
        for band in ('tropical', 'subtropical'):
            for table in (C.WARM_YARD[band], C.WARM_STREET[band]):
                self.assertAlmostEqual(sum(w for _, w in table), 1.0)
                got = {C.pick_w(table, (k + 0.5) / 200) for k in range(200)}
                self.assertEqual(got, {C.TREE_CLASS[n] for n, _ in table})


class LandUse(unittest.TestCase):
    def test_classes(self):
        g = C.lu_ground
        self.assertEqual(g('park', 'park', 'arid'), 'lawn')
        self.assertEqual(g('golf', 'fairway', 'arid'), 'lawn')
        self.assertEqual(g('golf', 'bunker', 'humid'), 'sand')
        self.assertEqual(g('managed', 'grass', 'dry'), 'lawn')
        self.assertEqual(g('developed', 'brownfield', 'humid'), 'scrub')
        self.assertEqual(g('developed', 'brownfield', 'arid'), 'sand')
        self.assertEqual(g('agriculture', 'farmland', 'humid'), 'lawn')
        self.assertEqual(g('agriculture', 'farmland', 'dry'), 'scrub')
        self.assertEqual(g('protected', 'nature_reserve', 'humid'), 'woods')
        self.assertEqual(g('resource_extraction', 'quarry', 'humid'), 'rock')
        # (yards, shops, offices: the climate's open land, the paved lots come from the buildings and car parks)
        for sub, cls in (('residential', 'residential'), ('developed', 'commercial'), ('developed', 'retail'), ('education', 'school')):
            self.assertIsNone(g(sub, cls, 'humid'), (sub, cls))

    def test_mask_classes(self):
        # San Francisco's classes keep their numbers; the new ones follow water (6)
        self.assertEqual([C.MASK[k] for k in ('asphalt', 'sidewalk', 'lawn', 'sand', 'rock', 'waterEdge', 'water')], list(range(7)))
        self.assertEqual((C.MASK['lot'], C.MASK['scrub'], C.MASK['woods']), (7, 8, 9))
        for k in C.CLIMATE_GROUND.values():
            self.assertIn(k, C.MASK)


if __name__ == '__main__':
    unittest.main()
