# Portions adapted from manhattan-free-roam (https://github.com/huangserva/manhattan-free-roam), Copyright (c) 2026 The manhattan-free-roam authors, MIT License.
#
# tools/hometown/massing.py (compiler 0.15.0): the massing a plain tall outline gets, ported from manhattan-free-roam's
# tools/build-city.mjs massing() / inset() and tuned for Chicago's Loop (the 1920s setback towers: the Board of Trade,
# Carbide & Carbon, LaSalle-Wacker). OpenStreetMap gives most towers an outline and a height and nothing more; a plain
# one (no parts, no min_height, no roof shape, no holes, not a landmark: shape_building decides) is drawn as TIERS:
#   - a masonry tower ('prewar'): one setback high up (a top storey block over a broad shaft), on about half of those
#     60 m and up;
#   - an art-deco tower ('deco'): the wedding cake, a broad base to about half its height and 2-3 setbacks to a slim top,
#     about half of them capped by a copper (verdigris) or bronze pyramid;
#   - a glass tower ('glass', 70 m and up): a podium on a broad lot, a setback high on the tallest, and a plant-floor
#     crown inset at the top.
# Every tier is a part of the building (compile.py emits it as one, minH its base), its masses from rects.rect_cover.
# Tier breaks are whole storeys (STOREY, the package's storey height), so the facades' window rows line up across them.
# Pure function of the outline (grid metres), the height and the building's hash: deterministic in every tile compile.
import math

from shapely.geometry import Polygon

STOREY = 3.4                 # m: the package storey height (assemble.py storeyH), tier breaks snap to it
MIN_H = 45.0                 # m: towers only
MAX_VERTS = 12               # an outline with more corners is left as mapped (curved, ragged: no clean inset)
MIN_AREA = 260.0             # m2
MIN_W = 14.0                 # m: the outline's narrow side
CONVEX = 0.9                 # area / convex hull area at least this (an L or a U is left as mapped)
# the copper and bronze of the caps (0xRRGGBB): verdigris greens, weathered copper, bronze, slate
COPPER = [0x6f9a8a, 0x7f8f78, 0x5f7f72, 0x8a7a52, 0x5f6f6a]


def inset(poly, d):
    """The outline moved inwards by d on every side (inset() of manhattan-free-roam: each side's line offset by d, the
    corners where the offset lines meet; here shapely's mitred negative buffer, the same polygon for the convex-ish
    outlines massing() takes), or None where it does not survive: a different number of pieces, under 12% of the area
    left, or a side turned round or all but vanished (shorter than min(1.5 m, a quarter of its old length))."""
    a0 = poly.area
    q = poly.buffer(-d, join_style='mitre', mitre_limit=4.0)
    if q.is_empty or q.geom_type != 'Polygon':
        return None
    q = Polygon(q.exterior).simplify(0.05)
    if q.is_empty or q.geom_type != 'Polygon' or not q.is_valid:
        return None
    if q.area < a0 * 0.12 or q.area >= a0:
        return None
    pts = list(q.exterior.coords)[:-1]
    if len(pts) < 3:
        return None
    for i in range(len(pts)):
        (x0, z0), (x1, z1) = pts[i], pts[(i + 1) % len(pts)]
        if math.hypot(x1 - x0, z1 - z0) < 1.5:
            return None
    return q


def tight_w(poly):
    """The narrow side of the outline's minimum rotated rectangle."""
    r = poly.minimum_rotated_rectangle
    c = list(r.exterior.coords)
    a = math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])
    b = math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1])
    return min(a, b)


def snap(v, base=0.0):
    """v rounded to whole storeys above base."""
    return base + round((v - base) / STOREY) * STOREY


def style_of(h, facade, k):
    """'deco', 'prewar' or 'glass' for a plain tower h m tall, its tagged facade ('' / 'glass' / 'metal' / 'stone' /
    'concrete' / 'terracotta') and its hash k(i) -> [0, 1). Chicago's Loop: most towers to ~110 m are pre-war masonry
    (limestone, terracotta, brick), the 110-180 m band is mixed, the tallest are post-war glass and steel."""
    if facade in ('glass', 'metal'):
        return 'glass'
    masonry = facade in ('stone', 'concrete', 'terracotta')
    if not masonry:
        p = 0.68 if h < 110 else 0.45 if h < 180 else 0.15
        masonry = k(0) < p
    if not masonry:
        return 'glass'
    return 'deco' if h >= 70 and k(8) < 0.55 else 'prewar'


def massing(poly, h, style, k):
    """The tiers of a plain outline poly (shapely Polygon, grid metres) h m tall in style ('deco' / 'prewar' / 'glass'),
    k(i) -> [0, 1) its hash: [{'g': Polygon, 'm': base m, 'h': top m, 'roofH': cap rise m, 'roofRGB': cap colour,
    'crown': 1 the plant floor}], or None (left as mapped). manhattan-free-roam's massing() with Chicago's numbers."""
    a = poly.area
    if h < MIN_H or len(poly.exterior.coords) - 1 > MAX_VERTS or a < MIN_AREA or a / poly.convex_hull.area < CONVEX:
        return None
    W = tight_w(poly)
    if W < MIN_W:
        return None
    tiers = []
    if style in ('deco', 'prewar'):
        if style == 'deco':
            # (Chicago's 1920s setback towers: a shaft to about half the height, then 2 setbacks (3 on the tallest) to a
            # slim top; LaSalle-Wacker breaks at ~0.55, Carbide & Carbon at ~0.75)
            steps = (3 if h > 150 else 2) + (1 if k(1) < 0.25 and h > 110 else 0)
            at = h * (0.5 + 0.22 * k(2))
        else:
            steps = 1 if h >= 60 and k(1) < 0.55 else 0
            at = h * (0.7 + 0.14 * k(2))
        if not steps:
            return None
        cur, base = poly, 0.0
        each = min(W * (0.07 + 0.05 * k(3)), 6.5)
        for i in range(steps):
            nxt = inset(cur, each * (1 + 0.25 * i))
            if nxt is None:
                break
            top = snap(at)
            if top - base < 2 * STOREY or h - top < 2 * STOREY:
                break
            tiers.append({'g': cur, 'm': base, 'h': top})
            base, cur = top, nxt
            # (the next break part way up what is left; the original's last-but-one step jumped to the top, leaving a
            # zero-height top tier)
            at += (h - at) * (0.42 + 0.2 * k(4 + i))
        if not tiers:
            return None
        last = {'g': cur, 'm': base, 'h': h}
        if style == 'deco' and k(9) < 0.5:
            # a copper or bronze pyramid (the Board of Trade's, LaSalle-Wacker's lantern roofs): within the height,
            # never over a third of the top tier
            r = min(tight_w(cur) * (0.3 + 0.3 * k(10)), (h - base) * 0.34, 16.0)
            if r >= 2.5:
                last['roofH'] = round(r, 2)
                last['roofRGB'] = COPPER[int(k(11) * len(COPPER)) % len(COPPER)]
        tiers.append(last)
        return tiers
    if h < 70:
        return None
    cur, base = poly, 0.0
    if a > 1100 and k(1) < 0.6:
        nxt = inset(cur, min(W * (0.08 + 0.1 * k(3)), 9.0))
        if nxt is not None:
            top = snap(16 + 14 * k(2))
            tiers.append({'g': cur, 'm': 0.0, 'h': top})
            base, cur = top, nxt
    if h > 150 and k(4) < 0.5:
        nxt = inset(cur, min(W * 0.07, 5.0))
        if nxt is not None:
            top = snap(h * (0.62 + 0.18 * k(5)))
            tiers.append({'g': cur, 'm': base, 'h': top})
            base, cur = top, nxt
    crown = 6 + 6 * k(6)
    screen = inset(cur, 1.2 + 1.5 * k(7))
    if screen is not None and h - base > crown * 3:
        top = snap(h - crown)
        tiers.append({'g': cur, 'm': base, 'h': top})
        tiers.append({'g': screen, 'm': top, 'h': h, 'crown': 1})
    else:
        tiers.append({'g': cur, 'm': base, 'h': h})
    return tiers if len(tiers) > 1 else None
