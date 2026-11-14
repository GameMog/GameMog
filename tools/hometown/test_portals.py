# tools/hometown/test_portals.py: a tunnel's portals split its segment into pieces (compile.py World.pieces), synthetic
# segments, no data: python tools/hometown/test_portals.py
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapely.geometry import LineString  # noqa: E402

import compile as C  # noqa: E402


def world():
    """A World with only what pieces() reads (no data, no store)."""
    W = C.World.__new__(C.World)
    W.pieces_c, W.seg_rows, W.moved_c, W.iv_c, W.files_c = {}, {}, {}, {}, {}
    W.dem = type('NoDem', (), {'record': lambda self: __import__('contextlib').nullcontext(set()), 'add': lambda self, fs: None})()
    W.lanes = lambda s, d: {'w': 11.0, 'lf': 2, 'lb': 0, 'spd': None, 'src': 'class'}
    return W


def segment(sid, L, connectors, tunnel, bridge=None):
    """A straight motorway L m long (grid metres, well inside one tile), connectors at fractions, a tunnel over the
    fractions `tunnel` and a bridge over `bridge`."""
    x0, z0 = 1000 * 512 + 40.0, 1000 * 512 + 40.0
    flags = [{'values': ['is_tunnel'], 'between': list(tunnel)}]
    if bridge:
        flags.append({'values': ['is_bridge'], 'between': list(bridge)})
    return {'id': sid, 'subtype': 'road', 'class': 'motorway', 'subclass': None, 'name': 'Test Pkwy',
            'geom': LineString([(x0, z0), (x0 + L * 0.6, z0 + L * 0.8)]), 'access_restrictions': None, 'road_flags': flags,
            'level_rules': [{'value': -1, 'between': list(tunnel)}], 'width_rules': None,
            'connectors': [{'connector_id': 'c%d' % k, 'at': a} for k, a in enumerate(connectors)]}


class Portals(unittest.TestCase):
    def test_both_portals_split(self):
        # (both portals inside the segment's span: the second one, 40 m past a connector, used to be left out (the
        # first, appended last, bounded the test), the tunnel piece then ending at the connector and the bridge's piece
        # running on through the portal)
        L = 400.0
        s = segment('s1', L, [0.0, 0.5, 1.0], (0.1, 0.6), bridge=(0.6, 1.0))
        ps = world().pieces(s)
        ends = [(round(p['f0'], 4), round(p['f1'], 4), bool(p['flags'] & C.FLAGS['tunnel'])) for p in ps]
        self.assertEqual(ends, [(0.0, 0.1, False), (0.1, 0.5, True), (0.5, 0.6, True), (0.6, 1.0, False)])
        self.assertEqual(ps[2]['b'], 'p:s1:%d' % round(0.6 * 1e9))
        # (the deck starts at the portal: its bridge stretch is all of it)
        self.assertEqual(ps[3]['br'], [(0.0, 1.0)])
        self.assertEqual(ps[1]['tspan'], (0.1, 0.6))

    def test_portal_and_bridge_move_onto_a_near_connector(self):
        # (Fort Pitt's northbound portal 12 m past the fork of a crossover: no 12 m link (the engine drops it, and the
        # tunnel with it); the tunnel ends at the connector and the bridge that started at the portal starts there)
        L = 1400.0
        s = segment('s4', L, [0.0, 0.888, 1.0], (0.12, 0.8968), bridge=(0.8968, 1.0))
        W = world()
        ps = W.pieces(s)
        ends = [(round(p['f0'], 4), round(p['f1'], 4), bool(p['flags'] & C.FLAGS['tunnel'])) for p in ps]
        self.assertEqual(ends, [(0.0, 0.12, False), (0.12, 0.888, True), (0.888, 1.0, False)])
        self.assertEqual(ps[1]['tspan'], (0.12, 0.888))
        self.assertEqual(ps[2]['br'], [(0.0, 1.0)])
        self.assertEqual(ps[2]['brs'], [(0.888, 1.0)])
        # (its roadway as before the move: on from the connector to where the data has the portal, 12.3 m, and
        # PORTAL_PAD m on into the tunnel; none at the far portal, where the piece was split as the data has it)
        W.seg_rows['s4'] = s
        gl = W.ground_lines(ps[1])
        L1 = W.pgeom(ps[1])[1]
        self.assertEqual(len(gl), 1)
        self.assertAlmostEqual(gl[0].length, C.PORTAL_PAD + (0.8968 - 0.888) * L, delta=0.05)
        self.assertAlmostEqual(L1 - gl[0].length, L1 - C.PORTAL_PAD - (0.8968 - 0.888) * L, delta=0.05)

    def test_portal_near_a_connector_moves_onto_it(self):
        # (Fort Pitt's southbound portals: 2.2 m past the deck's end (no 2.2 m link) and 18 m short of the next
        # connector (no 18 m link): the tunnel runs from connector to connector)
        L = 2000.0
        s = segment('s2', L, [0.0, 0.0724, 0.619, 1.0], (0.0735, 0.61))
        ps = world().pieces(s)
        ends = [(round(p['f0'], 4), round(p['f1'], 4), bool(p['flags'] & C.FLAGS['tunnel'])) for p in ps]
        self.assertEqual(ends, [(0.0, 0.0724, False), (0.0724, 0.619, True), (0.619, 1.0, False)])
        self.assertEqual(ps[1]['tspan'], (0.0724, 0.619))
        self.assertEqual((ps[1]['a'], ps[1]['b']), ('c1', 'c2'))

    def test_short_tunnel_at_one_connector_stays(self):
        # (both portals within PORTAL_SNAP m of the same connector: not snapped onto it, the tunnel kept as it is)
        L = 1000.0
        s = segment('s5', L, [0.0, 0.5, 1.0], (0.49, 0.51))
        ps = world().pieces(s)
        self.assertEqual([(round(p['f0'], 4), round(p['f1'], 4)) for p in ps], [(0.0, 0.49), (0.49, 0.5), (0.5, 0.51), (0.51, 1.0)])
        self.assertTrue(ps[1]['flags'] & C.FLAGS['tunnel'] and ps[2]['flags'] & C.FLAGS['tunnel'])

    def test_snapped_to_the_whole_segment_is_still_a_tunnel(self):
        L = 300.0
        s = segment('s3', L, [0.0, 1.0], (0.01, 0.99))
        ps = world().pieces(s)
        self.assertEqual(len(ps), 1)
        self.assertTrue(ps[0]['flags'] & C.FLAGS['tunnel'])
        self.assertEqual(ps[0]['tspan'], (0.0, 1.0))


if __name__ == '__main__':
    unittest.main()
