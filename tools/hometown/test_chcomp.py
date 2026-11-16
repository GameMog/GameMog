# tools/hometown/test_chcomp.py: compiler 0.13.1 (Cold Harbor's compiler bugs, made general): a divided road's two
# carriageways tied to one grade (grade.py ties, World.paired / abeam / deck_near), and a MultiPolygon building drawn
# as all of its polygons (building_rows, parts_for). Synthetic rows, no data: python test_chcomp.py
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapely.geometry import MultiPolygon, Polygon, box  # noqa: E402

import compile as C  # noqa: E402
import grade as G  # noqa: E402


def piece(seg, pts, d, name='SEASIDE FREEWAY', cls='motorway', link=False, pair=(1, 25.0), i=0):
    """A raw piece as World.raw_pieces makes it (only the fields paired / abeam / tangent read), pts in grid m."""
    return {'seg': seg, 'i': i, 'pts': [(int(round(x * 100)), int(round(z * 100))) for x, z in pts], 'dir': d, 'name': name,
            'cls': cls, 'link': link, 'pair': pair}


def world():
    W = C.World.__new__(C.World)   # (no data: pgeom / at_arc / tangent / abeam / paired read the pieces alone)
    W.pairs_c = {}
    return W


class Ties(unittest.TestCase):
    def test_twins_share_one_grade(self):
        # two 600 m carriageways, 25 m apart, both decks over flat ground at 0 m between ground anchors; only the
        # eastbound one passes over a stacked ramp (a road at 18 m, + 6.8 m clearance) at s = 300
        L = 600
        ss = G.stations(L)
        eb = G.Piece(('eb', 0), 'A', 'B', L, 0, L, True, [0.0] * len(ss), fixed=[(300, 24.8)], ties=[(s, ('wb', 0), L - s) for s in ss])
        wb = G.Piece(('wb', 0), 'C', 'D', L, 0, L, True, [0.0] * len(ss), ties=[(s, ('eb', 0), L - s) for s in ss])
        out, st = G.solve([eb, wb], {'A': 0.0, 'B': 0.0, 'C': 0.0, 'D': 0.0}, set())
        ye, yw = out[('eb', 0)], out[('wb', 0)]
        gap = max(abs(G.interp(ss, ye, s) - G.interp(ss, yw, L - s)) for s in ss)
        self.assertGreaterEqual(G.interp(ss, ye, 300), 24.8 - 0.05, 'the eastbound deck still clears its ramp')
        self.assertLessEqual(gap, G.TIE_TOL + 0.06, 'abeam, the two decks stand at one height (%.2f m apart)' % gap)
        self.assertGreaterEqual(G.interp(ss, yw, 300), 24.7, 'the westbound deck is lifted to the eastbound one, never the reverse')
        self.assertEqual((ye[0], ye[-1], yw[0], yw[-1]), (0.0, 0.0, 0.0, 0.0), 'both land on their own anchors')
        self.assertEqual(st['unmet'], 0)
        self.assertLessEqual(max(ye + yw), 24.8 + 0.6, 'no higher than the ramp asks: a tie never lifts the pair past it')
        self.assertGreater(st['ties'], 0)
        self.assertLessEqual(st['tieGap'], G.TIE_TOL + 0.06)
        # (untied, as before 0.13.1: the westbound deck stays on the ground's chord, 24 m under its twin)
        eb2 = G.Piece(('eb', 0), 'A', 'B', L, 0, L, True, [0.0] * len(ss), fixed=[(300, 24.8)])
        wb2 = G.Piece(('wb', 0), 'C', 'D', L, 0, L, True, [0.0] * len(ss))
        out2, _ = G.solve([eb2, wb2], {'A': 0.0, 'B': 0.0, 'C': 0.0, 'D': 0.0}, set())
        self.assertGreater(G.interp(ss, out2[('eb', 0)], 300) - G.interp(ss, out2[('wb', 0)], 300), 20)

    def test_no_ratchet(self):
        # (Long Beach's twin decks, 1.8 km over the harbour from free nodes held high by an interchange's stack at the
        # east end: tied to each other's current profile, the crest rounding lifted both a little each sweep, up to
        # RELAX off the anchors (135 m). Tied to the untied profiles: the higher of the two, nothing more)
        L = 1800
        ss = G.stations(L)
        stack = [(s, 46.0 - 0.01 * (L - s)) for s in ss if s > 1500]
        eb = G.Piece(('eb', 0), 'A', 'B', L, 0, L, True, [2.0] * len(ss), fixed=stack, ties=[(s, ('wb', 0), L - s) for s in ss])
        wb = G.Piece(('wb', 0), 'C', 'D', L, 0, L, True, [2.0] * len(ss), fixed=[(900, 8.3)], ties=[(s, ('eb', 0), L - s) for s in ss])
        out, st = G.solve([eb, wb], {'A': 2.0, 'B': 46.0, 'C': 46.0, 'D': 2.0}, set())
        self.assertLessEqual(max(out[('eb', 0)] + out[('wb', 0)]), 46.0 + 0.6)
        self.assertLessEqual(st['tieGap'], 0.2, st)

    def test_ties_change_nothing_when_level(self):
        # (twins with the same constraints come out as they did untied, within a few cm (the tie's tents round a crest
        # a little fuller), and the same as each other to 2 cm (the sweep's order))
        L = 400
        ss = G.stations(L)
        mk = lambda k, ties: G.Piece((k, 0), k + 'a', k + 'b', L, 0, L, True, [5.0] * len(ss), fixed=[(200, 12.0)], ties=ties)  # noqa: E731
        a = mk('a', [(s, ('b', 0), L - s) for s in ss])
        b = mk('b', [(s, ('a', 0), L - s) for s in ss])
        out, _ = G.solve([a, b], {'aa': 5.0, 'ab': 5.0, 'ba': 5.0, 'bb': 5.0}, set())
        ref, _ = G.solve([mk('a', [])], {'aa': 5.0, 'ab': 5.0}, set())
        self.assertLessEqual(max(abs(u - v) for u, v in zip(out[('a', 0)], ref[('a', 0)])), 0.1)
        self.assertLessEqual(max(abs(u - v) for u, v in zip(out[('b', 0)][::-1], out[('a', 0)])), 0.02)

    def test_twin_lands_with_the_other(self):
        # (W Ocean Blvd at Pico: the westbound carriageway lands on an at-grade junction (anchor D) while the eastbound
        # one runs on through a free node F on the chord to a high anchor E. Untied, the eastbound deck stood 11 m over
        # its landed twin abeam; tied up only, still 11 m (the anchor holds the westbound one down); the third solve
        # brings the eastbound one, and its free node, down beside it)
        L, L2 = 400, 300
        ss, s2 = G.stations(L), G.stations(L2)

        def run(tied):
            eb = G.Piece(('eb', 0), 'A', 'F', L, 0, L, True, [0.0] * len(ss), ties=[(s, ('wb', 0), L - s) for s in ss] if tied else [])
            wb = G.Piece(('wb', 0), 'C', 'D', L, 0, L, True, [0.0] * len(ss), ties=[(s, ('eb', 0), L - s) for s in ss] if tied else [])
            up = G.Piece(('up', 0), 'F', 'E', L2, 0, L2, True, [0.0] * len(s2))
            return G.solve([eb, wb, up], {'A': 0.0, 'F': 0.0, 'C': 0.0, 'D': 0.0, 'E': 20.0}, {'F'})
        out0, _ = run(False)
        out, st = run(True)
        gap0 = abs(G.interp(ss, out0[('eb', 0)], 380) - G.interp(ss, out0[('wb', 0)], 20))
        gap = max(abs(G.interp(ss, out[('eb', 0)], s) - G.interp(ss, out[('wb', 0)], L - s)) for s in ss)
        self.assertGreater(gap0, 10)
        self.assertLessEqual(gap, 1.0, 'the eastbound deck comes down beside its landed twin (%.2f m apart)' % gap)
        self.assertLessEqual(out[('eb', 0)][-1], 1.0, 'its free node with it')
        up = out[('up', 0)]
        self.assertLessEqual(max(abs(up[k] - up[k - 1]) / (s2[k] - s2[k - 1]) for k in range(1, len(s2))), G.RELAX + 1e-6,
                             'the road beyond climbs to its anchor no steeper than RELAX')
        self.assertLessEqual(st['tieGap'], 1.0)

    def test_down_never_under_a_clearance(self):
        # (the same, but the road beyond the free node must clear a road under it at s = 250 (20 m): the node is held
        # up by that clearance's tent, and the eastbound deck stays over its landed twin there)
        L, L2 = 400, 300
        ss, s2 = G.stations(L), G.stations(L2)
        eb = G.Piece(('eb', 0), 'A', 'F', L, 0, L, True, [0.0] * len(ss), ties=[(s, ('wb', 0), L - s) for s in ss])
        wb = G.Piece(('wb', 0), 'C', 'D', L, 0, L, True, [0.0] * len(ss), ties=[(s, ('eb', 0), L - s) for s in ss])
        up = G.Piece(('up', 0), 'F', 'E', L2, 0, L2, True, [0.0] * len(s2), fixed=[(250, 20.0)])
        out, _ = G.solve([eb, wb, up], {'A': 0.0, 'F': 0.0, 'C': 0.0, 'D': 0.0, 'E': 0.0}, {'F'})
        self.assertGreaterEqual(out[('eb', 0)][-1], 20.0 - G.G_MAIN * 250 - 0.05, 'the free node keeps the clearance tent')

    def test_order_free(self):
        # (the same pieces in any order: the same profiles to the centimetre)
        L = 500
        ss = G.stations(L)

        def run(order):
            ps = {'eb': G.Piece(('eb', 0), 'A', 'B', L, 0, L, True, [1.0] * len(ss), fixed=[(120, 15.0)], ties=[(s, ('wb', 0), s) for s in ss]),
                  'wb': G.Piece(('wb', 0), 'C', 'D', L, 0, L, True, [1.0] * len(ss), fixed=[(380, 9.0)], ties=[(s, ('eb', 0), s) for s in ss])}
            return G.solve([ps[k] for k in order], {'A': 1.0, 'B': 1.0, 'C': 1.0, 'D': 1.0}, set())[0]
        self.assertEqual(run(['eb', 'wb']), run(['wb', 'eb']))


class Pairs(unittest.TestCase):
    def test_twin_carriageways_pair(self):
        W = world()
        eb = piece('e', [(0, 0), (800, 0)], 1)
        wb = piece('w', [(800, 25), (0, 25)], 1, pair=(-1, 25.0))
        self.assertTrue(W.paired(eb, wb))
        self.assertTrue(W.paired(wb, eb), 'symmetric')
        ab = W.abeam(eb, wb)
        self.assertGreater(len(ab), 100)
        s, sr = ab[len(ab) // 2]
        self.assertAlmostEqual(s + sr, 800, delta=0.6, msg='abeam: the westbound station square across')
        # (a one-way piece drawn against its travel: dir -1, the same road travelling west)
        wb_rev = piece('w', [(0, 25), (800, 25)], -1, pair=(-1, 25.0))
        self.assertTrue(W.paired(eb, wb_rev))

    def test_not_a_pair(self):
        W = world()
        eb = piece('e', [(0, 0), (800, 0)], 1)
        self.assertFalse(W.paired(eb, piece('w', [(0, 25), (800, 25)], 1)), 'both eastbound: two lanes of one way, not twins')
        self.assertFalse(W.paired(eb, piece('w', [(800, 25), (0, 25)], 1, name='PICO AVE')), 'another road')
        self.assertFalse(W.paired(eb, piece('w', [(800, 25), (0, 25)], 1, link=True)), 'a ramp alongside')
        self.assertFalse(W.paired(eb, piece('w', [(800, 70), (0, 70)], 1)), 'past PAIR_REACH')
        self.assertFalse(W.paired(eb, piece('w', [(800, 25), (0, 25)], 1, pair=None)), 'no other carriageway found for it')
        self.assertFalse(W.paired(eb, piece('w', [(820, 25), (2000, 25)], 1)), 'end to end, never abeam')
        self.assertFalse(W.paired(eb, piece('w', [(400, 400), (400, -400)], 1)), 'a crossing road')


def row(bid, geom, **kw):
    r = {'id': bid, 'geom': geom, 'height': 50.1, 'num_floors': None, 'min_height': None, 'class': 'commercial', 'subtype': 'commercial',
         'roof_shape': None, 'roof_height': None, 'is_underground': False, 'name': 'Convention Center'}
    r.update(kw)
    return r


class FakeSrc:
    def __init__(self, parts):
        self.parts_of = parts


class Multi(unittest.TestCase):
    def test_every_polygon_is_drawn(self):
        arena = box(1000, 1000, 1110, 1110)            # 12,100 m2 (the largest: the row itself, as before)
        hall = box(800, 1000, 900, 1110)               # 11,000 m2
        annex = box(700, 1000, 750, 1100)              # 5,000 m2
        kiosk = box(690, 990, 698, 998)                # 64 m2: under MULTI_MIN, left out as before
        core = box(1200, 1000, 1217, 1017)             # 289 m2: over MULTI_MIN but 2.4% of the arena (Long Beach's stair cores)
        r = row('cc', MultiPolygon([hall, kiosk, arena, core, annex]))
        rows = C.building_rows(r)
        self.assertIs(rows[0], r, 'the row itself first, its id and its largest polygon unchanged')
        self.assertEqual([q['id'] for q in rows], ['cc', 'cc~1', 'cc~2'])
        self.assertEqual([round(q['geom'].area) for q in rows[1:]], [11000, 5000])
        self.assertEqual(round(C.largest_polygon(rows[0]['geom']).area), 12100)
        self.assertTrue(all(q['parent'] == 'cc' and q['height'] == 50.1 and q['name'] == 'Convention Center' for q in rows[1:]))
        # (each owned by the tile of its own centroid)
        own = [C.building_owner_cm(q) for q in rows]
        self.assertEqual([(o[0] // o[2] // 100, o[1] // o[2] // 100) for o in own], [(1055, 1055), (850, 1055), (725, 1050)])
        self.assertIs(C.building_rows(r), rows, 'cached on the row')

    def test_single_polygon_unchanged(self):
        r = row('h', box(0, 0, 50, 40))
        self.assertEqual(C.building_rows(r), [r])

    def test_parts_go_with_their_polygon(self):
        arena, hall = box(1000, 1000, 1110, 1110), box(800, 1000, 900, 1110)
        r = row('cc', MultiPolygon([hall, arena]))
        parts = [{'id': 'p1', 'geom': box(1000, 1000, 1110, 1110)}, {'id': 'p2', 'geom': box(810, 1010, 890, 1090)},
                 {'id': 'p3', 'geom': box(890, 1050, 1005, 1060)}]   # (p3 straddles the gap, mostly over neither: 10 + 5 of 115 m)
        src = FakeSrc({'cc': parts})
        rows = C.building_rows(r)
        self.assertEqual([p['id'] for p in C.parts_for(src, rows[0])], ['p1'])
        self.assertEqual([p['id'] for p in C.parts_for(src, rows[1])], ['p2'])
        # (a plain building keeps all its parts, as before)
        one = row('b', box(0, 0, 10, 10))
        self.assertEqual(C.parts_for(FakeSrc({'b': parts}), one), parts)


class AtGradeTunnel(unittest.TestCase):
    def test_passage_trims_a_portal_cut_does_not(self):
        # (E Seaside Way under the Convention Center's hall: its road at 2.4-2.6 m, the ground over it 2.4 m: a passage.
        # A bored tunnel's road 8 m under the ground: none of it trims the building, the tunnel-cover rule still applies)
        W = world()
        hall = box(0, 0, 100, 100)
        strip = [(box(40, -10, 52, 0), 2.4), (box(40, 0, 52, 50), 2.45), (box(40, 50, 52, 110), 2.6)]
        W.tunnel_footprint = lambda p: p['fp']
        W.ground_at = lambda xs, zs: ([2.41 for _ in xs], None)
        got = W.at_grade_tunnel({'fp': strip}, hall)
        self.assertEqual(len(got), 3)
        bored = [(box(40, 0, 52, 100), 2.41 - 8.0)]
        self.assertEqual(W.at_grade_tunnel({'fp': bored}, hall), [])
        self.assertEqual(W.at_grade_tunnel({'fp': [(box(200, 0, 210, 10), 2.4)]}, hall), [], 'not under it')


if __name__ == '__main__':
    unittest.main(verbosity=2)
