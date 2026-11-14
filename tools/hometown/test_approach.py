# tools/hometown/test_approach.py: a mission place's approach point (approach.py), on synthetic blocks: the owner's rule
# of 14 Nov, every place a mission sends the player is outdoors, where a person stands, reachable from the road.
#   <venv>/bin/python tools/hometown/test_approach.py
import os
import sys
import unittest

from shapely.geometry import LineString, Point, box as sbox

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import approach as AP  # noqa: E402

# a street along z = 0 (half width 4 m), its lane point at the origin
STREET = (LineString([(-200, 0), (200, 0)]), 4.0)


def clear_of(ob, x, z):
    q = Point(x, z)
    return (all(g.distance(q) >= AP.MARGIN - 1e-6 for g in ob.buildings + ob.overhead)
            and all(g.distance(q) > 0 for g in ob.water) and all(g.distance(q) >= h for g, h in ob.roads))


class Approach(unittest.TestCase):
    def test_building_centre_goes_to_its_front(self):
        # a garage 20 m deep set 8 m back from the street: its centre inside it, the approach in front of it toward the lane
        b = sbox(-15, 8, 15, 28)
        ob = AP.Obstacles([b], [], [STREET])
        ax, az, how = AP.approach(0, 18, 0, 0, ob)
        self.assertEqual(how, 'front')
        self.assertFalse(b.contains(Point(ax, az)))
        self.assertTrue(clear_of(ob, ax, az))
        self.assertTrue(4.0 + AP.CURB <= az <= 8 - AP.MARGIN + 1e-6, az)
        self.assertAlmostEqual(ax, 0.0)
        self.assertTrue(ob.reachable(ax, az, 0, 0))

    def test_open_lot_is_the_place_itself(self):
        ob = AP.Obstacles([sbox(30, 10, 60, 40)], [], [STREET])
        self.assertEqual(AP.approach(0, 20, 0, 0, ob), (0.0, 20.0, 'centre'))

    def test_front_before_a_side_yard(self):
        # houses side by side 4 m apart: the centre's own house's front, not the gap beside it
        hs = [sbox(-14, 10, -2, 22), sbox(2, 10, 14, 22), sbox(-30, 10, -18, 22)]
        ob = AP.Obstacles(hs, [], [STREET])
        ax, az, how = AP.approach(-8, 16, -8, 0, ob)
        self.assertEqual(how, 'front')
        self.assertTrue(az < 10 and abs(ax + 8) < 1e-6)

    def test_no_straight_walk_through_another_building(self):
        # the place's building behind another that fills the frontage: the approach is round the side, a walk to the lane
        back = sbox(-10, 30, 10, 50)
        front = sbox(-40, 8, 40, 26)
        ob = AP.Obstacles([back, front], [], [STREET])
        ax, az, how = AP.approach(0, 40, 0, 0, ob)
        self.assertTrue(clear_of(ob, ax, az))
        self.assertTrue(ob.reachable(ax, az, 0, 0))
        self.assertFalse(back.contains(Point(ax, az)) or front.contains(Point(ax, az)))

    def test_lane_under_a_porte_cochere(self):
        # the lane point under a canopy (a roof a person walks under): reached by the nearest road point in the open
        canopy = sbox(-6, -6, 6, 6)
        hotel = sbox(-30, 12, 30, 60)
        ob = AP.Obstacles([hotel], [], [STREET], overhead=[canopy])
        r = AP.approach(0, 30, 0, 0, ob)
        self.assertIsNotNone(r)
        ax, az, _ = r
        self.assertTrue(clear_of(ob, ax, az))
        self.assertFalse(canopy.contains(Point(ax, az)))

    def test_lane_inside_a_garage(self):
        # the lane point on a drive inside a garage (a wall over it): the walk goes to the open street beside it instead
        garage = sbox(-8, -6, 8, 30)
        ob = AP.Obstacles([garage], [], [STREET, (LineString([(0, 0), (0, 25)]), 3.0)])
        ax, az, _ = AP.approach(0, 20, 0, 10, ob)
        self.assertTrue(clear_of(ob, ax, az))
        self.assertTrue(ob.reachable(ax, az, 0, 10))

    def test_never_on_the_water(self):
        # a pier bar whose centre is over the water: the approach is on the shore
        water = sbox(-100, 20, 100, 200)
        ob = AP.Obstacles([], [water], [STREET])
        ax, az, _ = AP.approach(0, 40, 0, 0, ob)
        self.assertLess(az, 20 - AP.WATER_MARGIN + 1e-6)
        self.assertTrue(clear_of(ob, ax, az))

    def test_kerb_when_the_walls_stand_at_it(self):
        # a downtown street whose walls stand at its kerb: the road's edge in front of the place, clear of the wall
        ob = AP.Obstacles([sbox(-200, -200, 200, -4), sbox(-200, 4, 200, 200)], [], [STREET])
        ax, az, how = AP.approach(0, 30, 0, 0, ob)
        self.assertEqual(how, 'kerb')
        self.assertAlmostEqual(ax, 0.0)
        self.assertTrue(0 < az <= 4 - AP.KERB + 1e-6, az)

    def test_none_when_nowhere_to_stand(self):
        # everything within reach built over: no approach (the engine keeps the lane point; its guard moves the rest)
        ob = AP.Obstacles([sbox(-200, -200, 200, -0.2), sbox(-200, 0.2, 200, 200)], [], [STREET])
        self.assertIsNone(AP.approach(0, 30, 0, 0, ob))

    def test_deterministic(self):
        hs = [sbox(-15, 8, 15, 28), sbox(20, 8, 40, 30), sbox(-50, 5, -20, 40)]
        a = [AP.approach(0, 18, 0, 0, AP.Obstacles(hs, [], [STREET])) for _ in range(3)]
        b = AP.approach(0, 18, 0, 0, AP.Obstacles(list(reversed(hs)), [], [STREET]))
        self.assertEqual(a[0], a[1])
        self.assertEqual(a[0], a[2])
        self.assertEqual(a[0], b)


if __name__ == '__main__':
    unittest.main(verbosity=2)
