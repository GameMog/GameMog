# tools/hometown/test_sides.py: each carriageway's sides (fid-roads; compile.py osm_sidewalk / osm_cycleway / side_band /
# World.pair / World.sides): python test_sides.py
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shapely  # noqa: E402
from shapely.geometry import LineString  # noqa: E402

import compile as C  # noqa: E402


def seg(sid, pts, name='Collins Avenue', d=1, cls='primary'):
    """An Overture road segment row: d 1 one-way forwards (a backward heading denied), -1 backwards, 0 two-way."""
    ar = [] if not d else [{'access_type': 'denied', 'when': {'heading': 'backward' if d > 0 else 'forward'}}]
    return {'id': sid, 'subtype': 'road', 'class': cls, 'subclass': None, 'name': name, 'geom': LineString(pts), 'access_restrictions': ar,
            'width_rules': None, 'road_flags': None, 'level_rules': None, 'connectors': None}


class FakeSrc:
    def __init__(self, rows):
        self.rows, self.extras = rows, None
        self.tree = shapely.STRtree([r['geom'] for r in rows])

    def query(self, key, geom):
        assert key == 'segments'
        return sorted((self.rows[i] for i in self.tree.query(geom, predicate='intersects').tolist()), key=lambda r: r['id'])


def world(rows, osm=None):
    W = C.World.__new__(C.World)
    W.src, W.pair_c, W.side_c = FakeSrc(rows), {}, {}
    W.osm_tags = lambda sid: (osm or {}).get(sid)
    return W


class Tags(unittest.TestCase):
    def test_sidewalk(self):
        f = C.osm_sidewalk
        self.assertEqual((f({'sidewalk': 'right'}, 'left'), f({'sidewalk': 'right'}, 'right')), (False, True))
        self.assertEqual((f({'sidewalk': 'left'}, 'left'), f({'sidewalk': 'left'}, 'right')), (True, False))
        self.assertEqual((f({'sidewalk': 'both'}, 'left'), f({'sidewalk': 'no'}, 'right'), f({'sidewalk': 'none'}, 'left')), (True, False, False))
        self.assertTrue(f({'sidewalk': 'separate'}, 'left'))
        self.assertIsNone(f({}, 'left'))
        self.assertIsNone(f({'sidewalk': 'yes?'}, 'left'))
        # (the side keys win over the plain one)
        self.assertEqual((f({'sidewalk': 'both', 'sidewalk_left': 'no'}, 'left'), f({'sidewalk': 'both', 'sidewalk_left': 'no'}, 'right')), (False, True))
        self.assertTrue(f({'sidewalk_both': 'separate'}, 'right'))

    def test_cycleway(self):
        f = C.osm_cycleway
        self.assertEqual((f({'cycleway_right': 'shared_lane'}, 'right', 1), f({'cycleway_right': 'shared_lane'}, 'left', 1)), (1, 0))
        self.assertEqual((f({'cycleway': 'lane'}, 'left', 0), f({'cycleway': 'lane'}, 'right', 0)), (2, 2))
        # (a one-way's plain tag: the right of travel; travel against the way's direction: its left)
        self.assertEqual((f({'cycleway': 'lane'}, 'right', 1), f({'cycleway': 'lane'}, 'left', 1)), (2, 0))
        self.assertEqual((f({'cycleway': 'lane'}, 'right', -1), f({'cycleway': 'lane'}, 'left', -1)), (0, 2))
        self.assertEqual(f({'cycleway': 'opposite_lane'}, 'left', 1), 2)
        self.assertEqual(f({'cycleway_both': 'track'}, 'left', 1), 3)
        self.assertEqual(f({'cycleway': 'no'}, 'right', 0), 0)


class Band(unittest.TestCase):
    def test_right_is_plus_z(self):
        # (the grid frame: x east, z south; eastbound, the right is +z)
        b = LineString([(0, 0), (100, 0)]).buffer(C.RIGHT * 2, single_sided=True)
        self.assertGreater(b.centroid.y, 0)

    def test_one_side(self):
        gl = LineString([(0, 0), (100, 0)])
        both = C.side_band(gl, 10, 2.4, 2.4)
        self.assertTrue(both.equals(gl.buffer(7.4, quad_segs=4)))
        right = C.side_band(gl, 10, 0.0, 2.4)
        self.assertTrue(right.contains(shapely.Point(50, 6.5)))       # the right sidewalk (z 5..7.4)
        self.assertFalse(right.intersects(shapely.Point(50, -6.5)))   # none on the left
        left = C.side_band(gl, 10, 2.4, 0.0)
        self.assertTrue(left.contains(shapely.Point(50, -6.5)) and not left.intersects(shapely.Point(50, 6.5)))
        narrow = C.side_band(gl, 10, 1.0, 2.4)
        self.assertTrue(narrow.contains(shapely.Point(50, -5.5)) and not narrow.intersects(shapely.Point(50, -6.5)))


class Pair(unittest.TestCase):
    # a divided road running north (-z): its northbound carriageway on the east (x 10), the southbound on the west (x -10)
    NB = seg('nb', [(10, 400), (10, 0)], d=1)
    SB = seg('sb', [(-10, 0), (-10, 400)], d=1)

    def test_divided(self):
        W = world([self.NB, self.SB])
        # (northbound, its own direction -z: the right is +x, the other carriageway is on its left)
        self.assertEqual(W.pair(self.NB, 1), (-1, 20.0))
        self.assertEqual(W.pair(self.SB, 1), (-1, 20.0))
        s = W.sides(self.NB, 1)
        self.assertEqual((s['swl'], s['swr']), (0.0, 2.4))

    def test_digitised_against_travel(self):
        # (the southbound way drawn northwards, oneway=-1: still the other carriageway, now on its right)
        sb = seg('sb2', [(-10, 400), (-10, 0)], d=-1)
        W = world([self.NB, sb])
        self.assertEqual(W.pair(sb, -1), (1, 20.0))
        self.assertEqual((W.sides(sb, -1)['swl'], W.sides(sb, -1)['swr']), (2.4, 0.0))

    def test_not_pairs(self):
        same_way = seg('nb2', [(-10, 400), (-10, 0)], d=1)              # a parallel one-way the same way
        other_name = seg('x', [(-10, 0), (-10, 400)], name='Harding Avenue')
        two_way = seg('tw', [(-10, 0), (-10, 400)], d=0)
        far = seg('far', [(-60, 0), (-60, 400)])
        end_to_end = seg('ee', [(10, 900), (10, 420)], d=1)
        for o in (same_way, other_name, two_way, far, end_to_end):
            self.assertIsNone(world([self.NB, o]).pair(self.NB, 1), o['id'])
        self.assertIsNone(world([self.NB, self.SB]).pair(two_way, 0))
        s = world([self.NB, other_name]).sides(self.NB, 1)
        self.assertEqual((s['swl'], s['swr']), (2.4, 2.4))

    def test_osm_wins(self):
        W = world([self.NB, self.SB], osm={'nb': {'sidewalk': 'both', 'cycleway_right': 'lane'}, 'sb': {'sidewalk': 'no'}})
        self.assertEqual(W.sides(self.NB, 1), {'swl': 2.4, 'swr': 2.4, 'cyl': 0, 'cyr': 2})
        self.assertEqual(W.sides(self.SB, 1), {'swl': 0.0, 'swr': 0.0, 'cyl': 0, 'cyr': 0})
        # (a class with no sidewalk by default gets SW_TAGGED where the tags say so)
        tr = seg('tr', [(100, 0), (100, 400)], d=0, cls='trunk')
        self.assertEqual(world([tr], osm={'tr': {'sidewalk': 'right'}}).sides(tr, 0)['swr'], C.SW_TAGGED)


if __name__ == '__main__':
    unittest.main()
