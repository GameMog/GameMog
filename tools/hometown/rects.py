# tools/hometown/rects.py: a building footprint as a few oriented rectangles (the masses Mog City's buildings.js turns
# into facade boxes, and the planes its package roofs are laid over). A port of Slop San Francisco's
# tools/rect-cover.mjs (MIT): the footprint turned to its dominant direction, rasterised at RES m (cells whose centre is
# inside), covered greedily by the largest empty rectangle (largest rectangle in a histogram) until COVER of it is
# covered or MAX_RECTS are placed. Pure function of the ring: no libm beyond cos/sin of the given turn, integer cell
# arithmetic, the same result in any process.
import math

import numpy as np
import shapely

RES = 0.5
COVER = 0.97
MAX_RECTS = 10
MIN_SIDE = 2   # cells
MIN_AREA = 8   # cells
MAX_CELLS = 40000   # a larger footprint is rasterised coarser (RES grows by whole halves of a metre)


def _mask_rects(m):
    """Greedy cover of a 0/1 mask (h x w, cleared as it goes): rects [i0, i1, j0, j1] (cells, inclusive)."""
    h, w = m.shape
    total = int(m.sum())
    rects, covered = [], 0
    while len(rects) < MAX_RECTS and covered < total * COVER:
        best, bi0, bi1, bj0, bj1 = 0, 0, 0, 0, 0
        hist = [0] * w
        rows = m.tolist()
        for j in range(h):
            row = rows[j]
            for i in range(w):
                hist[i] = hist[i] + 1 if row[i] else 0
            stack = []
            for i in range(w + 1):
                hh = hist[i] if i < w else 0
                while stack and hist[stack[-1]] >= hh:
                    top = stack.pop()
                    height = hist[top]
                    left = stack[-1] + 1 if stack else 0
                    width = i - left
                    if height >= MIN_SIDE and width >= MIN_SIDE and height * width > best:
                        best = height * width
                        bi0, bi1, bj0, bj1 = left, i - 1, j - height + 1, j
                stack.append(i)
        if best < MIN_AREA:
            break
        rects.append((bi0, bi1, bj0, bj1))
        covered += best
        m[bj0:bj1 + 1, bi0:bi1 + 1] = 0
    return rects, total, covered


def rect_cover(pts, theta):
    """pts: the ring [(x, z)] (grid metres), theta: the building's turn (three.js R_y: world = c + R_y(theta) local).
    -> (coverage, [(cx, cz, w, d)]) in the ring's metres."""
    cs, sn = math.cos(theta), math.sin(theta)
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cz = sum(p[1] for p in pts) / n
    local = [((x - cx) * cs - (z - cz) * sn, (x - cx) * sn + (z - cz) * cs) for x, z in pts]
    x0 = min(p[0] for p in local)
    x1 = max(p[0] for p in local)
    z0 = min(p[1] for p in local)
    z1 = max(p[1] for p in local)
    res = RES
    while math.ceil((x1 - x0) / res) * math.ceil((z1 - z0) / res) > MAX_CELLS:
        res += 0.5
    w = max(1, math.ceil((x1 - x0) / res))
    h = max(1, math.ceil((z1 - z0) / res))
    poly = shapely.Polygon(local)
    if not poly.is_valid:
        poly = poly.buffer(0)
    xs = x0 + (np.arange(w) + 0.5) * res
    zs = z0 + (np.arange(h) + 0.5) * res
    XX, ZZ = np.meshgrid(xs, zs)
    m = shapely.contains_xy(poly, XX.ravel(), ZZ.ravel()).reshape(h, w).astype(np.uint8)
    rects, total, covered = _mask_rects(m)
    out = []
    for i0, i1, j0, j1 in rects:
        lx = x0 + (i0 + i1 + 1) / 2 * res
        lz = z0 + (j0 + j1 + 1) / 2 * res
        out.append((cx + lx * cs + lz * sn, cz - lx * sn + lz * cs, (i1 - i0 + 1) * res, (j1 - j0 + 1) * res))
    return (covered / total if total else 0.0), out
