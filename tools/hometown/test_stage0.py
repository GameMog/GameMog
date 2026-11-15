# tools/hometown/test_stage0.py: stage 0 ("use what we already download"): the buildings' looks from OSM's tags
# (looks.py), the parts' own roofs (compile.part_roof), junction control from OSM's signal / stop nodes
# (World.junction_data), the street props and data trees a tile owns, and the refusal of a region without the building
# extras: python test_stage0.py
import json
import math
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import shapely  # noqa: E402
from shapely.geometry import LineString, Point, Polygon  # noqa: E402

import compile as C  # noqa: E402
import looks  # noqa: E402


class Looks(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(looks.parse_rgb('#CAC3A9'), 0xcac3a9)
        self.assertEqual(looks.parse_rgb('#fff'), 0xffffff)
        self.assertEqual(looks.parse_rgb('Red'), looks.NAMES['red'])
        self.assertIsNone(looks.parse_rgb('#12345'))
        self.assertIsNone(looks.parse_rgb(None))
        self.assertIsNone(looks.parse_rgb('sort of blue'))

    def test_clamp(self):
        # (black is never 0, which reads as "no colour"; nor pure black on screen: lightness 0.18)
        b = looks.wall_rgb('#000000')
        self.assertNotEqual(b, 0)
        self.assertEqual(b, 0x2e2e2e)
        # (white comes down to 0.90 lightness; neon red loses saturation)
        w = looks.wall_rgb('#FFFFFF')
        self.assertEqual(w, 0xe6e6e6)
        import colorsys
        r = looks.wall_rgb('#FF0000')
        h, l, s = colorsys.rgb_to_hls(((r >> 16) & 255) / 255, ((r >> 8) & 255) / 255, (r & 255) / 255)
        self.assertLessEqual(s, looks.S_WALL + 0.01)
        # (a moderate colour passes unchanged)
        self.assertEqual(looks.wall_rgb('#CAC3A9'), 0xcac3a9)
        self.assertEqual(looks.wall_rgb(None), 0)
        # (deterministic, an int under 2^24: exact in the engine's float32 table)
        for v in ('#123456', '#ABCDEF', '#956C66'):
            x = looks.roof_rgb(v)
            self.assertEqual(x, looks.roof_rgb(v))
            self.assertEqual(float(np.float32(x)), float(x))

    def test_materials(self):
        self.assertEqual(looks.wall_name('plaster'), 'stucco')
        self.assertEqual(looks.wall_name('cement_block'), 'concrete')
        self.assertEqual(looks.wall_name('Brick'), 'brick')
        self.assertIsNone(looks.wall_name('unobtainium'))
        for name in looks.WALL_OF.values():
            self.assertIn(name, C.WALLS)
        for name in looks.FACADE_OF.values():
            self.assertIn(name, C.FACADES)
        # (a roof's material colours it where roof:colour is missing; the colour wins where both are tagged)
        self.assertEqual(looks.roof_rgb(None, 'slate'), looks.clamp_rgb(0x4a4f55, looks.S_ROOF))
        self.assertEqual(looks.roof_rgb('#956C66', 'slate'), looks.roof_rgb('#956C66'))
        self.assertEqual(looks.roof_rgb(None, None), 0)

    def test_part_over_parent(self):
        parent = {'facade_color': '#CAC3A9', 'facade_material': 'brick', 'roof_color': '#535C63'}
        own = {'facade_color': '#B4AC95', 'roof_material': 'copper'}
        lk = looks.look_of(own, parent)
        self.assertEqual(lk['wallRGB'], looks.wall_rgb('#B4AC95'))
        self.assertEqual(lk['wall'], 'brick')                     # (the parent's material: the part has none)
        self.assertEqual(lk['roofRGB'], looks.roof_rgb(None, 'copper'))   # (the part's own material over the parent's colour)
        self.assertEqual(looks.look_of({}, parent)['roofRGB'], looks.roof_rgb('#535C63'))
        self.assertEqual(looks.look_of(None), {'wall': None, 'facade': None, 'wallRGB': 0, 'roofRGB': 0})


class PartRoof(unittest.TestCase):
    def test_shapes(self):
        # (flat or untagged: no rise, the height unchanged)
        self.assertEqual(C.part_roof({}, 30.0, 0.0, 6.0, True), (0, 0.0, 30.0))
        self.assertEqual(C.part_roof({'roof_shape': 'flat'}, 30.0, 0.0, 6.0, True), (C.ROOF_SHAPES.index('flat'), 0.0, 30.0))
        # (tagged pitched with roof:height: that rise, the top unchanged (Overture's height is the roof's top))
        s, rise, top = C.part_roof({'roof_shape': 'pyramidal', 'roof_height': 8.0}, 60.0, 40.0, 6.0, True)
        self.assertEqual((C.ROOF_SHAPES[s], rise, top), ('pyramidal', 8.0, 60.0))
        # (no roof:height: 0.38 of the short half-span, at most 60% of the part)
        s, rise, top = C.part_roof({'roof_shape': 'dome'}, 10.0, 0.0, 10.0, True)
        self.assertEqual(C.ROOF_SHAPES[s], 'dome')
        self.assertAlmostEqual(rise, 3.8)
        s, rise, top = C.part_roof({'roof_shape': 'gabled', 'roof_height': 50.0}, 10.0, 0.0, 4.0, True)
        self.assertAlmostEqual(rise, 6.0)
        # (a height from the floors: the roof goes on top)
        s, rise, top = C.part_roof({'roof_shape': 'hipped', 'roof_height': 3.0}, 20.0, 0.0, 6.0, False)
        self.assertEqual((rise, top), (3.0, 23.0))
        # (an unknown tag: 'other', drawn flat)
        self.assertEqual(C.part_roof({'roof_shape': 'onion'}, 20.0, 0.0, 6.0, True)[:2], (C.ROOF_SHAPES.index('other'), 0.0))


class FakeSrc:
    """Sources' query over a list of rows with geometries (furniture, treepts), id order."""

    def __init__(self, rows):
        self.rows = rows

    def query(self, key, geom, predicate='intersects'):
        return sorted((r for r in self.rows.get(key, []) if r['geom'].intersects(geom)), key=lambda r: r['id'])


class FakeWorld:
    def __init__(self, rows):
        self.src = FakeSrc(rows)

        class D:
            index = 0
        self.d = D()

    def pgeom(self, p):
        return C.World.pgeom(self, p)


def piece(seg, i, a, b, rank=2):
    return {'seg': seg, 'i': i, 'pts': [[int(a[0] * 100), int(a[1] * 100)], [int(b[0] * 100), int(b[1] * 100)]], 'rank': rank, 'flags': 0}


def cross(x=0.0, z=0.0, L=60.0):
    """A four-way junction at (x, z): four pieces running out L m."""
    return [piece('s%d' % k, 0, (x, z), (x + L * dx, z + L * dz)) for k, (dx, dz) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1)))]


def furn(fid, cls, x, z):
    return {'id': fid, 'class': cls, 'geom': Point(x, z)}


class Junctions(unittest.TestCase):
    def test_signal(self):
        W = FakeWorld({'furniture': [furn('f1', 'traffic_signals', 9.0, 0.5)]})
        self.assertEqual(C.World.junction_data(W, 0.0, 0.0, cross()), (1, 2, None))

    def test_signal_off_the_roads_ignored(self):
        # (a signal node 8 m off every approach: not this junction's)
        W = FakeWorld({'furniture': [furn('f1', 'traffic_signals', 8.0, 8.0)]})
        self.assertIsNone(C.World.junction_data(W, 0.0, 0.0, cross()))

    def test_all_way_and_minor(self):
        drive = cross()
        four = [furn('a', 'stop', 8, 0.5), furn('b', 'stop', -8, -0.5), furn('c', 'stop', 0.5, 8), furn('d', 'stop', -0.5, -8)]
        ctl, top, marked = C.World.junction_data(FakeWorld({'furniture': four}), 0.0, 0.0, drive)
        self.assertEqual(ctl, 2)
        self.assertEqual(len(marked), 4)
        two = [furn('c', 'stop', 0.5, 8), furn('d', 'give_way', -0.5, -8)]
        ctl, top, marked = C.World.junction_data(FakeWorld({'furniture': two}), 0.0, 0.0, drive)
        self.assertEqual(ctl, 3)
        self.assertEqual(marked, frozenset({('s2', 0), ('s3', 0)}))

    def test_far_sign_is_the_far_junctions(self):
        # (a 30 m piece: a sign 20 m out stands nearer its other end)
        drive = [piece('s0', 0, (0, 0), (30, 0)), piece('s1', 0, (0, 0), (-60, 0)), piece('s2', 0, (0, 0), (0, 60))]
        W = FakeWorld({'furniture': [furn('a', 'stop', 20, 0.5)]})
        self.assertIsNone(C.World.junction_data(W, 0.0, 0.0, drive))

    def test_none_mapped(self):
        self.assertIsNone(C.World.junction_data(FakeWorld({'furniture': []}), 0.0, 0.0, cross()))
        # (a lamp or a hydrant is not a control)
        self.assertIsNone(C.World.junction_data(FakeWorld({'furniture': [furn('l', 'street_lamp', 5, 0)]}), 0.0, 0.0, cross()))


class Props(unittest.TestCase):
    def test_owned_kinds_caps(self):
        T = C.TILE
        rows = [furn('l1', 'street_lamp', 10.0, 10.0), furn('h1', 'fire_hydrant', 20.0, 11.0), furn('b1', 'bench', 30.0, 12.0),
                furn('out', 'street_lamp', T + 5.0, 10.0),            # (the next tile's)
                furn('inb', 'bench', 101.0, 101.0),                   # (inside a footprint)
                furn('x1', 'crossing', 50.0, 0.3),                    # (mid-block: 50 m along a 100 m piece)
                furn('x2', 'crossing', 5.0, 0.2)]                     # (at the junction end)
        W = FakeWorld({'furniture': rows})
        btree = shapely.STRtree([Polygon([(100, 100), (105, 100), (105, 105), (100, 105)])])
        pieces = [piece('r', 0, (0, 0), (100, 0))]
        tb = shapely.geometry.box(0, 0, T, T)
        out = C.street_props(W, 0, 0, tb, btree, pieces)
        kinds = sorted(k for _, _, k, _ in out)
        self.assertEqual(kinds, [1, 2, 3, C.PROP_CROSSING])
        for u, v, k, _ in out:
            self.assertTrue(0 <= u < C.TCM and 0 <= v < C.TCM)
        many = [furn('l%04d' % k, 'street_lamp', 1.0 + (k % 400), 1.0 + k // 400) for k in range(C.PROPS_CAP + 50)]
        self.assertEqual(len(C.street_props(FakeWorld({'furniture': many}), 0, 0, tb, None, [])), C.PROPS_CAP)


class DataTrees(unittest.TestCase):
    def test_points_rows_and_ground(self):
        T = C.TILE
        a = np.full((T, T), C.MASK['lawn'], np.uint8)
        a[0:20, :] = C.MASK['asphalt']
        rows = [{'id': 't1', 'class': 'tree', 'geom': Point(50.5, 60.5)},
                {'id': 't2', 'class': 'tree', 'geom': Point(50.5, 5.5)},          # (on the roadway: left out)
                {'id': 't3', 'class': 'tree', 'geom': Point(102.0, 102.0)},       # (in a footprint: left out)
                {'id': 'r1', 'class': 'tree_row', 'geom': LineString([(200, 200), (240, 200)])}]
        W = FakeWorld({'treepts': rows})
        btree = shapely.STRtree([Polygon([(100, 100), (105, 100), (105, 105), (100, 105)])])
        out = C.data_trees(W, 0, 0, shapely.geometry.box(0, 0, T, T), a, btree, None, None, False)
        self.assertEqual(len(out), 1 + 6)   # (t1, and the 40 m row every 8 m: 6 trees)
        self.assertIn((5050, 6050), [(u, v) for u, v, _, _ in out])
        for u, v, cls, trunk in out:
            self.assertIn(cls, (0, 1, 4))
            self.assertTrue(12 <= trunk <= 42)
        # (deterministic)
        self.assertEqual(out, C.data_trees(W, 0, 0, shapely.geometry.box(0, 0, T, T), a, btree, None, None, False))


class Extras(unittest.TestCase):
    def test_region_without_building_extras_refused(self):
        import fetch
        import sources
        with tempfile.TemporaryDirectory() as d:
            out = fetch.region_dir(d, 'conus', 5, 7)
            os.makedirs(out)
            for theme, typ, _ in fetch.LAYERS:
                open(fetch.layer_file(out, theme, typ), 'wb').close()
            open(os.path.join(out, fetch.EXTRAS_FILE), 'wb').close()
            json.dump({'overture': {'release': fetch.RELEASE, 'layers': {}}}, open(os.path.join(out, 'region.json'), 'w'))
            with self.assertRaises(sources.MissingRegion) as e:
                sources.Sources(d, 'conus', [(5, 7)])
            self.assertIn('building extras', str(e.exception))
            self.assertIn('part extras', str(e.exception))
            import prewarm
            self.assertEqual(prewarm.REGIONS.search(str(e.exception)).group(1), 'conus:5,7')

    def test_specs_match(self):
        import fetch
        import sources
        self.assertEqual({f for _, f in sources.BUILDING_EXTRAS} | {sources.EXTRAS_FILE}, set(fetch.EXTRAS_FILES))
        for theme, typ, cols, f in fetch.EXTRAS_SPECS:
            self.assertTrue(cols.startswith('id, '))
            self.assertTrue(f.startswith('overture-%s-%s-extras' % (theme, typ)))


if __name__ == '__main__':
    unittest.main()
