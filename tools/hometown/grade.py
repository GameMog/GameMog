# tools/hometown/grade.py: deck heights for bridges, overpasses and ramps (grade-lanes). Pure: no I/O, no shapely, no
# data access; compile.py builds the inputs (the cluster's deck pieces, their ground, their clearance constraints) and
# calls solve(). The same inputs, in any order, give the same profile to the centimetre.
#
# A DECK PIECE is a piece of road between two connectors with a deck interval [u0, u1] (arc m): its bridge stretch.
# A GRADE CLUSTER is the deck pieces joined through FREE nodes (connectors with no at-grade road). A node with an
# at-grade drivable road (or a dead end) is an ANCHOR at its ground height; so is a deck interval's end inside a piece.
#
# The profile (the spec's "corrected" rule: never the lowest feasible height):
#   - free node heights: the arc-length-weighted harmonic interpolation between the anchors (on a chain: the chord),
#     each at least the TENT of every clearance constraint on its pieces (y_c - G |s - s_c|) and its ground + 0.3;
#   - along a piece: y(s) = max(chord between its ends, tents, ground + 0.3), held to within RELAX of each anchor
#     (y <= y_anchor + RELAX |s - s_anchor|, so a deck never steps up at its abutment; a constraint that cannot be met
#     that way is counted in gradeRelaxed), then rounded over the grade breaks (a box filter about as long as a
#     vertical curve: VC_MAIN m on mainlines, VC_LINK on links and streets), the ends pinned.
#   - crossings on deck pieces of the same cluster use the other piece's current profile: up to SWEEPS sweeps, stopping
#     when nothing moves more than 1 cm.
import math

STEP = 5.0          # m between profile stations
G_MAIN = 0.04       # tent slope on motorway and trunk mainlines
G_LINK = 0.06       # ... on links and streets
RELAX = 0.10        # the steepest climb away from an anchor a constraint may force (beyond: gradeRelaxed)
VC_MAIN = 40.0      # m: vertical curve length on mainlines
VC_LINK = 20.0      # m: ... on links and streets
LIFT = 0.3          # a deck stands at least this over its own ground
SWEEPS = 10


def stations(L, step=STEP):
    n = max(1, int(math.ceil(L / step - 1e-9)))
    return [min(L, k * step) for k in range(n + 1)]


def interp(ss, ys, s):
    if s <= ss[0]:
        return ys[0]
    if s >= ss[-1]:
        return ys[-1]
    k = min(len(ss) - 2, int(s // (ss[1] - ss[0])) if len(ss) > 1 and ss[1] > ss[0] else 0)
    while k > 0 and ss[k] > s:
        k -= 1
    while k + 2 < len(ss) and ss[k + 1] < s:
        k += 1
    t = (s - ss[k]) / ((ss[k + 1] - ss[k]) or 1.0)
    return ys[k] + (ys[k + 1] - ys[k]) * t


class Piece:
    """One deck piece. key: a sortable id (segment id, piece index); a, b: its end node ids; L: its length (m);
    u0, u1: its deck interval (arc m); main: a motorway or trunk mainline; ground: ground heights at stations(L);
    fixed: static constraints [(s, y_min)] (rail, water, at-grade roads under it); under: dynamic ones
    [(s, other_key, other_s, clearance)] (a deck piece under it)."""
    __slots__ = ('key', 'a', 'b', 'L', 'u0', 'u1', 'main', 'ss', 'ground', 'fixed', 'under', 'ys')

    def __init__(self, key, a, b, L, u0, u1, main, ground, fixed=(), under=()):
        self.key, self.a, self.b, self.L, self.u0, self.u1 = key, a, b, float(L), float(u0), float(u1)
        self.main = bool(main)
        self.ss = stations(self.L)
        assert len(ground) == len(self.ss), 'ground must be sampled at stations(L)'
        self.ground = [float(g) for g in ground]
        self.fixed = sorted((float(s), float(y)) for s, y in fixed)
        self.under = sorted(under)
        self.ys = None

    def g(self, s):
        return interp(self.ss, self.ground, s)


def solve(pieces, node_ground, free, ext=None):
    """pieces: [Piece]; node_ground: {node: ground y} for every end node; free: the set of free nodes (the rest are
    anchors at their ground); ext(key, s): the profile height of a deck piece of ANOTHER cluster (for `under`
    constraints naming it), None if unknown. -> ({key: [y per station]}, stats)"""
    ps = sorted(pieces, key=lambda p: p.key)
    by = {p.key: p for p in ps}
    stats = {'gradeRelaxed': 0, 'sweeps': 0, 'maxGrade': 0.0, 'constraints': 0, 'unmet': 0, 'grades': []}
    nodes = sorted(set([p.a for p in ps] + [p.b for p in ps]))
    inc = {n: [] for n in nodes}
    for p in ps:
        inc[p.a].append((p, 'a'))
        inc[p.b].append((p, 'b'))
    y = {n: node_ground[n] for n in nodes}
    fr = [n for n in nodes if n in free]
    for p in ps:
        p.ys = None

    def end_s(p, end):
        """(arc of the deck end next to `end`, is it the node itself)"""
        if end == 'a':
            return (p.u0, p.u0 <= 0.5)
        return (p.u1, p.u1 >= p.L - 0.5)

    def end_y(p, end):
        s, at_node = end_s(p, end)
        return y[p.a if end == 'a' else p.b] if at_node else p.g(s)

    def constraints(p):
        out = list(p.fixed)
        for s, k2, s2, clr in p.under:
            q = by.get(k2)
            if q is not None:
                yu = interp(q.ss, q.ys, s2) if q.ys is not None else q.g(s2)
            else:
                yu = ext(k2, s2) if ext else None
            if yu is not None:
                out.append((s, yu + clr))
        return [(s, yc) for s, yc in out if p.u0 - 1e-6 <= s <= p.u1 + 1e-6]

    def G(p):
        return G_MAIN if p.main else G_LINK

    def profile(p, cons):
        s0, n0 = end_s(p, 'a')
        s1, n1 = end_s(p, 'b')
        y0, y1 = end_y(p, 'a'), end_y(p, 'b')
        # (both ends hold the climb: a free node's height is itself held to RELAX off its neighbours, solve() below)
        fix0 = fix1 = True
        g = G(p)
        ys = []
        relaxed = 0
        for k, s in enumerate(p.ss):
            gr = p.ground[k]
            if s < s0 - 1e-6 or s > s1 + 1e-6:
                ys.append(gr)
                continue
            if abs(s - s0) < 1e-6 or abs(s - s1) < 1e-6:
                ys.append(y0 if abs(s - s0) < 1e-6 else y1)   # (the ends: the node's or the anchor's height)
                continue
            t = (s - s0) / ((s1 - s0) or 1.0)
            v = y0 + (y1 - y0) * t
            for sc, yc in cons:
                v = max(v, yc - g * abs(s - sc))
            v = max(v, gr + LIFT) if s0 + 1e-6 < s < s1 - 1e-6 else v
            cap = math.inf
            if fix0:
                cap = min(cap, y0 + RELAX * (s - s0))
            if fix1:
                cap = min(cap, y1 + RELAX * (s1 - s))
            if v > cap + 1e-9:
                v = cap
                relaxed = 1
            ys.append(v)
        # vertical curves: a box filter over the deck interval (ends pinned), twice
        h = max(1, int(round((VC_MAIN if p.main else VC_LINK) / 2 / STEP)))
        idx = [k for k, s in enumerate(p.ss) if s0 - 1e-6 <= s <= s1 + 1e-6]
        if len(idx) > 2:
            for _ in range(2):
                src = ys[:]
                for j in range(1, len(idx) - 1):
                    lo, hi = max(0, j - h), min(len(idx) - 1, j + h)
                    w = min(j - lo, hi - j)   # (symmetric: the window shrinks towards the pinned ends)
                    vals = [src[idx[i]] for i in range(j - w, j + w + 1)]
                    ys[idx[j]] = sum(vals) / len(vals)
        for k, s in enumerate(p.ss):
            if s0 + 1e-6 < s < s1 - 1e-6:
                ys[k] = max(ys[k], p.ground[k] + 0.05)
        return [round(v, 2) for v in ys], relaxed

    def rounded(p, cons):
        # the box filter lowers a crest: raise each constraint by its shortfall and profile again (3 rounds at most)
        cc = list(cons)
        for _ in range(4):
            ys, relaxed = profile(p, cc)
            short = [yc0 - interp(p.ss, ys, sc) for (sc, yc0) in cons]
            if not short or max(short) <= 0.01:
                break
            cc = [(sc, yc + max(0.0, d)) for (sc, yc), d in zip(cc, short)]
        return ys, relaxed

    prev = None
    for sweep in range(SWEEPS):
        stats['sweeps'] = sweep + 1
        cons = {p.key: constraints(p) for p in ps}
        # node lower bounds: the tents at the node, its ground + LIFT
        lb = {}
        for n in fr:
            v = node_ground[n] + LIFT
            for p, end in inc[n]:
                sn = 0.0 if end == 'a' else p.L
                for sc, yc in cons[p.key]:
                    v = max(v, yc - G(p) * abs(sn - sc))
            lb[n] = v
        for _ in range(200):
            moved = 0.0
            for n in fr:
                num = den = 0.0
                for p, end in inc[n]:
                    other = 'b' if end == 'a' else 'a'
                    s_here = 0.0 if end == 'a' else p.L
                    s_there, _ = end_s(p, other)
                    w = 1.0 / max(1.0, abs(s_there - s_here))
                    num += w * end_y(p, other)
                    den += w
                v = max(lb[n], num / den) if den else lb[n]
                cap = min((end_y(p, 'b' if end == 'a' else 'a') + RELAX * max(1.0, abs((end_s(p, 'b' if end == 'a' else 'a')[0]) - (0.0 if end == 'a' else p.L))))
                          for p, end in inc[n]) if inc[n] else v
                v = min(v, max(cap, node_ground[n]))
                moved = max(moved, abs(v - y[n]))
                y[n] = v
            if moved < 1e-4:
                break
        relaxed = 0
        for p in ps:
            p.ys, r = rounded(p, constraints(p))
            relaxed += r
        cur = [v for p in ps for v in p.ys]
        stats['gradeRelaxed'] = relaxed
        if prev is not None and max(abs(a - b) for a, b in zip(cur, prev)) <= 0.01:
            break
        prev = cur
    # stats: the steepest grade, constraints met
    for p in ps:
        for k in range(1, len(p.ss)):
            ds = p.ss[k] - p.ss[k - 1]
            if ds > 1 and p.u0 - 1e-6 <= p.ss[k - 1] and p.ss[k] <= p.u1 + 1e-6 and min(p.ys[k] - p.ground[k], p.ys[k - 1] - p.ground[k - 1]) > 0.6:
                gr = abs(p.ys[k] - p.ys[k - 1]) / ds
                stats['maxGrade'] = max(stats['maxGrade'], gr)
                stats['grades'].append((round(gr, 4), 'main' if p.main else 'link'))
        for sc, yc in constraints(p):
            stats['constraints'] += 1
            if interp(p.ss, p.ys, sc) < yc - 0.5:
                stats['unmet'] += 1
    stats['maxGrade'] = round(stats['maxGrade'], 4)
    return {p.key: p.ys for p in ps}, stats
