# tools/hometown/test_cores.py: the core step of the box rule (0.14.0, cores.py + assemble.downtown_box). No data
# needed: the ctx centres are stubbed (assemble.strongest_centre), so the test is the DECISION:
#   - an uncapped place has no box rule; a capped place with no core, or whose 0.8.0 box holds its core, gets the 0.8.0
#     box and info byte for byte (the towns already built keep their box);
#   - a core outside that box moves the box onto the strongest centre round the core, unless that centre is weaker
#     than the internal point's (or there is none): then the 0.8.0 box, with `coreKept` saying why;
#   - the table: its format, San Jose's downtown row, the matcher's rules (state, folded name, search box, class).
# HOMETOWN_CORES_CENSUS=<GameMog lib/places/us-places.tsv.gz> also re-derives the table and checks it equals cores.json.
#   <venv>/bin/python tools/hometown/test_cores.py
import json
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cores  # noqa: E402
import assemble  # noqa: E402

# San Jose, CA (GEOID 0668000) as GameMog sends it (lib/hometown/box.ts playBox; lib/places/search.ts toPlace)
SJ = {'name': 'San Jose, CA', 'geoid': '0668000', 'anchor': [-121.81455, 37.29601],
      'bbox': [-121.83996, 37.275764, -121.78914, 37.316256], 'searchBbox': [-122.0, 37.15, -121.63, 37.44]}
SJ_CORE = (-121.890591, 37.336166)


def old_rule(pl, centre):
    """0.8.0's downtown_box, verbatim but for the stubbed centre (ci, cj, score, lon, lat)."""
    sb, bb = pl.get('searchBbox'), pl['bbox']
    if not sb or (sb[2] - sb[0] <= bb[2] - bb[0] + 2e-5 and sb[3] - sb[1] <= bb[3] - bb[1] + 2e-5):
        return None, None
    lon, lat = pl['anchor']
    hx, hy = (bb[2] - bb[0]) / 2, (bb[3] - bb[1]) / 2
    win = [max(sb[0], lon - hx), max(sb[1], lat - hy), min(sb[2], lon + hx), min(sb[3], lat + hy)]
    if centre is None:
        return None, {'rule': 'capped: no downtown centre within half the box of the internal point (the internal point\'s box)'}
    ci, cj, sc, clon, clat = centre
    clon, clat = min(max(clon, win[0]), win[2]), min(max(clat, win[1]), win[3])
    r = lambda v: round(v * 1e5) / 1e5  # noqa: E731
    box = [r(clon - hx), r(clat - hy), r(clon + hx), r(clat + hy)]
    kx = 111320 * math.cos(math.radians(lat))
    return box, {'rule': 'capped: centred on the strongest downtown centre within half the box of the internal point', 'cell': [ci, cj], 'score': sc,
                 'movedM': [round((clon - lon) * kx), round((clat - lat) * 111320)], 'internalPointBox': bb}


class Stub:
    """assemble.strongest_centre stand-in: the centre of whichever window holds one of `at` (lon, lat, score)."""
    def __init__(self, *at):
        self.at, self.calls = at, []

    def __call__(self, d, dom, data, store, bid, win):
        self.calls.append(list(win))
        for i, (lon, lat, sc) in enumerate(self.at):
            if win[0] <= lon <= win[2] and win[1] <= lat <= win[3]:
                return (1000 + i, 2000 + i, sc, lon, lat)
        return None


class Rule(unittest.TestCase):
    def setUp(self):
        self.real = assemble.strongest_centre

    def tearDown(self):
        assemble.strongest_centre = self.real

    def run_rule(self, pl, stub):
        assemble.strongest_centre = stub
        return assemble.downtown_box(pl, 'conus', None, None, 'test')

    def test_uncapped(self):
        pl = dict(SJ, searchBbox=list(SJ['bbox']))
        self.assertEqual(self.run_rule(pl, Stub()), (None, None))
        self.assertEqual(self.run_rule(dict(SJ, searchBbox=None), Stub()), (None, None))

    def test_no_core_is_the_old_rule(self):
        # (no `core`, a GEOID the table does not list: Bozeman's, Colter Land's town)
        pl = dict(SJ, geoid='3008950')
        for at in [(), ((-121.82, 37.30, 40),), ((-121.95, 37.30, 40),)]:
            st = Stub(*at)
            self.assertEqual(self.run_rule(pl, st), old_rule(pl, self.real_like(pl, st)))
            self.assertEqual(len(st.calls), 1)

    def real_like(self, pl, st):
        """What the old rule saw: the stub over the internal point's window."""
        return Stub(*st.at)(None, None, None, None, None, cores.window(pl['anchor'], pl['bbox'], pl['searchBbox']))

    def test_core_inside_old_box_is_the_old_rule(self):
        # (Pittsburgh's shape: the core 2.3 km off the internal point, past the window, but the 0.8.0 box, moved onto a
        # centre at the window's edge, holds it)
        a = SJ['anchor']
        hx = (SJ['bbox'][2] - SJ['bbox'][0]) / 2
        core = [a[0] - 1.05 * hx, a[1]]
        pl = dict(SJ, core=core)
        st = Stub((a[0] - 0.9 * hx, a[1], 60))
        box, info = self.run_rule(pl, st)
        self.assertEqual((box, info), old_rule(pl, (1000, 2000, 60, a[0] - 0.9 * hx, a[1])))
        self.assertTrue(cores.inside(core, box))
        self.assertEqual(len(st.calls), 1)

    def test_core_moves_the_box(self):
        st = Stub((-121.83, 37.30, 30), (SJ_CORE[0] + 0.002, SJ_CORE[1] - 0.001, 210))
        box, info = self.run_rule(dict(SJ, core=list(SJ_CORE)), st)
        self.assertEqual(len(st.calls), 2)
        self.assertTrue(info['rule'].startswith('capped, core:'))
        self.assertEqual(info['score'], 210)
        self.assertEqual(info['internalPointCentre'], {'cell': [1000, 2000], 'score': 30})
        self.assertTrue(cores.inside(SJ_CORE, box))
        self.assertFalse(cores.inside(SJ['anchor'], box))
        # the same size of box (to the 1e-5 rounding)
        self.assertAlmostEqual(box[2] - box[0], SJ['bbox'][2] - SJ['bbox'][0], places=4)
        self.assertAlmostEqual(box[3] - box[1], SJ['bbox'][3] - SJ['bbox'][1], places=4)
        # centred on the core's centre
        self.assertAlmostEqual((box[0] + box[2]) / 2, SJ_CORE[0] + 0.002, places=4)
        # no centre round the internal point at all: still moves
        box2, info2 = self.run_rule(dict(SJ, core=list(SJ_CORE)), Stub((SJ_CORE[0], SJ_CORE[1], 6)))
        self.assertIsNone(info2['internalPointCentre'])
        self.assertTrue(cores.inside(SJ_CORE, box2))

    def test_core_from_the_table(self):
        # (the real table's San Jose row: no `core` in the entry)
        st = Stub((SJ_CORE[0], SJ_CORE[1], 200))
        box, info = self.run_rule(dict(SJ), st)
        self.assertIn('cores.json', info['coreSource'])
        self.assertTrue(cores.inside(SJ_CORE, box))

    def test_weaker_or_no_core_centre_keeps_the_old_box(self):
        pl = dict(SJ, core=list(SJ_CORE))
        st = Stub((-121.83, 37.30, 90), (SJ_CORE[0], SJ_CORE[1], 40))
        box, info = self.run_rule(pl, st)
        old = old_rule(pl, (1000, 2000, 90, -121.83, 37.30))
        self.assertEqual(box, old[0])
        self.assertIn('under the internal point', info['coreKept']['why'])
        self.assertEqual({k: v for k, v in info.items() if k != 'coreKept'}, old[1])
        box, info = self.run_rule(pl, Stub((-121.83, 37.30, 90)))
        self.assertEqual(box, old[0])
        self.assertIn('no downtown centre', info['coreKept']['why'])

    def test_core_outside_the_search_box_is_ignored(self):
        pl = dict(SJ, core=[-123.5, 37.3])
        st = Stub((-121.83, 37.30, 90))
        self.assertEqual(self.run_rule(pl, st), old_rule(pl, (1000, 2000, 90, -121.83, 37.30)))


class Table(unittest.TestCase):
    def test_table(self):
        t = json.load(open(cores.CORES_FILE))
        self.assertEqual((t['format'], t['version']), ('hometown-cores', 1))
        rows = cores.load()
        self.assertEqual(len(rows), len(t['cores']))
        self.assertEqual(cores.meta()['n'], len(rows))
        sj = rows['0668000']
        self.assertAlmostEqual(sj[0], SJ_CORE[0], places=4)
        self.assertAlmostEqual(sj[1], SJ_CORE[1], places=4)
        self.assertNotIn('3008950', rows)    # Bozeman (Colter Land): its core is inside its own window
        for g, (lon, lat, did) in rows.items():
            self.assertRegex(g, r'^[0-9]{7}$')
            self.assertTrue(-180 < lon < 180 and -15 < lat < 72, g)

    def test_match(self):
        row = {'geoid': '0668000', 'name': 'San Jose', 'state': 'CA', 'aliases': [], 'anchor': SJ['anchor'], 'bbox': SJ['bbox'], 'searchBbox': SJ['searchBbox'], 'pop': 1}
        loc = [('h', 'San Jose', 'US-TX', 'hamlet', None, -98.3, 27.6),                 # another state
               ('n', 'San Jose', 'US-CA', 'hamlet', None, -121.85, 37.30),               # a hamlet of the name
               ('c', 'San José', 'US-CA', 'city', 1035317, SJ_CORE[0], SJ_CORE[1]),     # the city (accents fold)
               ('f', 'San Jose', 'US-CA', 'city', 2000000, -120.5, 37.3)]                # outside the search box
        got, n = cores.match([row], loc)
        self.assertEqual(got, {'0668000': [SJ_CORE[0], SJ_CORE[1], 'c']})
        self.assertEqual(n, {'capped': 1, 'matched': 1, 'outsideWindow': 1})
        # a core inside the internal point's window is not listed (the 0.8.0 rule already reaches it)
        got, n = cores.match([row], [('c', 'San Jose', 'US-CA', 'city', 1, -121.82, 37.30)])
        self.assertEqual((got, n['matched']), ({}, 1))
        self.assertEqual(cores.fold('St. Louis'), 'saint louis')
        self.assertEqual(cores.fold('Nashville-Davidson'), 'nashville davidson')

    @unittest.skipUnless(os.environ.get('HOMETOWN_CORES_CENSUS'), 'HOMETOWN_CORES_CENSUS not set (and the divisions read needs the network)')
    def test_rebuild_equals_table(self):
        import tempfile
        out = os.path.join(tempfile.mkdtemp(prefix='ht-cores-'), 'cores.json')
        cores.build(os.environ['HOMETOWN_CORES_CENSUS'], out)
        self.assertEqual(open(out, 'rb').read(), open(cores.CORES_FILE, 'rb').read())


if __name__ == '__main__':
    unittest.main()
