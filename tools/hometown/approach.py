# tools/hometown/approach.py: a mission place's APPROACH point (frame.py places[k].ax, az), where a person on foot is
# sent: the owner's rule of 14 Nov, every place a mission sends the player is outdoors, on ground a person stands on,
# reachable from the road, never a ring inside a building (nobody can enter a building on the platform; The Courtesy
# Lane's salvage-log search held its ring in a tower's garage, Bal Harbour).
#
#   free     outside every building's footprint grown by MARGIN m (the Overture rows, all of them: a footprint the
#            tiles later trim or drop is still kept clear, so the point is clear of whatever the tiles build), off the
#            water (its polygons grown by WATER_MARGIN m) and off the carriageway (every drivable road's line grown by
#            half its width plus CURB m: a sidewalk, a lot, a plaza, a lawn, never the road's middle)
#   reach    a straight walk from it to the place's lane point (where the car stops) passes WALK_CLEAR m clear of every
#            building and the water (its last END_FREE m aside: a lane point beside a wall); where that lane point is
#            itself inside a building (a garage's drive), a straight walk to the nearest point of a road within
#            ROAD_REACH m that is in none. A roof a person walks under (a carport, a shelter, a canopy: compile.py
#            ROOFS, or raised MIN_H m or more) is no wall, over the lane point or on the way, though no one is sent to
#            stand under it
#   choice   the free, reachable point that is cheapest by |P - centre| + LANE_W |P - lane|: the place itself when a
#            person can stand there (a park, an open lot); else its frontage toward its street (the first free point
#            from the centre toward the lane: a building's front, a garage's open edge); else the nearest free point
#            round it (rings every RING_STEP m out to RING_R, RING_N bearings). None of those: the clearance is
#            relaxed once (RELAXED); none still (a downtown street whose walls stand at its kerb): the kerb itself, the
#            nearest point KERB m clear of the walls with the road no bar ('kerb'); none even then: no approach (the
#            engine stays on the lane point)
#
# Pure function of the rows it is given (sorted by id) and the place: no randomness, no index order, the same bytes
# in any process. Session metres in, session metres out (q1).
import math

import numpy as np
import shapely
from shapely.geometry import LineString, Point, box as sbox

MARGIN = 1.5          # m kept clear of a building's footprint
WATER_MARGIN = 1.0
CURB = 0.75           # m past a road's half width: its kerb
LANE_W = 0.8          # the lane distance's weight in the cost (the centre's is 1): the front toward the street before a side yard
RAY_STEP = 0.5
RING_STEP = 1.0
RING_R = 60.0
RING_N = 48
WALK_CLEAR = 0.5     # m: the walk keeps this clear of every wall (a person's half width and the footprints' simplification)
RELAXED = {'margin': 0.8, 'curb': 0.0}
KERB = 0.6
ROAD_REACH = 25.0
END_FREE = 1.0
MIN_H = 3.0
SKIP_SUBCLASS = {'driveway', 'parking_aisle', 'drive_through'}


def road_half(cls, subclass, width_rules, road):
    """Half the carriageway's width (m): the class width (compile.py ROAD), its width rule when wider (not the OSM
    lanes the tiles also read: the frame never pays for those); an alley 5 m at most."""
    w = road[cls][0]
    wr = [r['value'] for r in width_rules or [] if r.get('value') and not r.get('between')]
    if wr and 3 <= wr[0] <= 40:
        w = max(w, float(wr[0]))
    if subclass == 'alley':
        w = min(w, 5.0)
    return w / 2.0


class Obstacles:
    """The geometry round a place in session metres: buildings (walls), overhead (roofs a person walks under), water,
    carriageways [(line, half width)]."""

    def __init__(self, buildings, water, roads, overhead=(), clip=None):
        """clip (x0, z0, x1, z1): only what lies in it counts (the place's own box: a long road or a sea polygon cut
        to it before it is grown, by far the costliest part otherwise)."""
        cut = (lambda g: g) if clip is None else (lambda g, B=sbox(*clip): g if B.contains(g) else g.intersection(B))
        ok = lambda g: g is not None and not g.is_empty  # noqa: E731
        self.buildings = [g for g in (cut(g) for g in buildings if ok(g)) if ok(g)]
        self.overhead = [g for g in (cut(g) for g in overhead if ok(g)) if ok(g)]
        self.water = [g for g in (cut(g) for g in water if ok(g)) if ok(g)]
        self.roads = [(g, h) for g, h in ((cut(g), h) for g, h in roads if ok(g)) if ok(g)]
        self.atree = shapely.STRtree(self.buildings) if self.buildings else None
        self.rtree = shapely.STRtree([g for g, _ in self.roads]) if self.roads else None
        self._blocked = {}
        self._lane_ok = {}
        self._walls = False

    def blocked(self, margin, curb):
        """Everything a person may not stand on at this clearance, grown and indexed (cached): an STRtree or None."""
        k = (margin, curb)
        if k not in self._blocked:
            parts = [g.buffer(margin, quad_segs=4) for g in self.buildings + self.overhead]
            parts += [g.buffer(WATER_MARGIN, quad_segs=4) for g in self.water]
            if curb is not None:
                parts += [g.buffer(h + curb, quad_segs=4) for g, h in self.roads]
            self._blocked[k] = shapely.STRtree(parts) if parts else None
        return self._blocked[k]

    def bad(self, pts, margin, curb):
        """Which of the points (a shapely array) a person may not stand on: a bool array."""
        t = self.blocked(margin, curb)
        out = np.zeros(len(pts), bool)
        if t is not None:
            out[np.unique(t.query(pts, predicate='intersects')[0])] = True
        return out

    def reachable(self, x, z, lx, lz):
        """A straight walk from (x, z) to the lane point (lx, lz), or, the lane point inside a building (a garage's
        drive), to the nearest road point within ROAD_REACH m that is in none (a roof over it is no wall)."""
        k = (lx, lz)
        if k not in self._lane_ok:
            self._lane_ok[k] = not self.under(lx, lz)
        if self._lane_ok[k]:
            return self.clear(x, z, lx, lz)
        if self.rtree is None:
            return False
        q = Point(x, z)
        for i in sorted(self.rtree.query(q.buffer(ROAD_REACH)).tolist(), key=lambda i: (round(self.roads[i][0].distance(q), 3), i)):
            g = self.roads[i][0]
            if g.distance(q) > ROAD_REACH:
                break
            r = g.interpolate(g.project(q))
            if not self.under(r.x, r.y) and self.clear(x, z, r.x, r.y):
                return True
        return False

    def under(self, x, z):
        if self.atree is None:
            return False
        return bool(len(self.atree.query(Point(x, z), predicate='intersects')))

    def clear(self, x, z, lx, lz):
        """A straight walk (x, z) -> (lx, lz) through no wall and no water (its last END_FREE m left out: a lane point
        on a narrow downtown street stands within a person's clearance of the wall beside it, and he stops short)."""
        L = math.hypot(lx - x, lz - z)
        if L <= END_FREE:
            return True
        f = (L - END_FREE) / L
        t = self.walls()
        return t is None or not len(t.query(LineString([(x, z), (x + (lx - x) * f, z + (lz - z) * f)]), predicate='intersects'))

    def walls(self):
        """Every wall and the water grown by WALK_CLEAR m, indexed once."""
        if self._walls is False:
            w = [g.buffer(WALK_CLEAR, quad_segs=2) for g in self.buildings + self.water]
            self._walls = shapely.STRtree(w) if w else None
        return self._walls


def candidates(cx, cz, lx, lz):
    """(x, z, order) the centre, the ray to the lane, then the rings round the centre."""
    out = [(cx, cz, 0)]
    L = math.hypot(lx - cx, lz - cz)
    n = int(L // RAY_STEP)
    for k in range(1, n + 1):
        t = k * RAY_STEP / L
        out.append((cx + (lx - cx) * t, cz + (lz - cz) * t, 1))
    for i in range(1, int(RING_R / RING_STEP) + 1):
        r = i * RING_STEP
        for j in range(RING_N):
            a = 2 * math.pi * j / RING_N
            out.append((cx + r * math.sin(a), cz + r * math.cos(a), 2))
    return out


def approach(cx, cz, lx, lz, ob):
    """-> (ax, az, how) or None. how: 'centre' (the place itself), 'front' (on the ray to its lane), 'near' (round it);
    with '+relaxed' when only the relaxed clearance found one; 'kerb' when only the road's edge did."""
    cand = candidates(cx, cz, lx, lz)
    pts = shapely.points(np.array([(x, z) for x, z, _ in cand]))
    for tag, (margin, curb) in (('', (MARGIN, CURB)), ('+relaxed', (RELAXED['margin'], RELAXED['curb'])), ('kerb', (KERB, None))):
        bad = ob.bad(pts, margin, curb)
        free = [(math.hypot(x - cx, z - cz) + LANE_W * math.hypot(x - lx, z - lz), o, round(x, 3), round(z, 3), x, z)
                for (x, z, o), b in zip(cand, bad.tolist()) if not b]
        # (the place itself first when free; the front before a ring point of the same cost; then by cost)
        free.sort(key=lambda q: (q[1] != 0, round(q[0], 3), q[1], q[2], q[3]))
        for _, o, _, _, x, z in free:
            if ob.reachable(x, z, lx, lz):
                how = 'kerb' if tag == 'kerb' else ('centre', 'front', 'near')[o] + tag
                return round(x * 10) / 10, round(z * 10) / 10, how
    return None
