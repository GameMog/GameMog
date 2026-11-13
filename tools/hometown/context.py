# tools/hometown/context.py: hg1 context blocks (ctx, L4: 8192 grid-m, 16 x 16 tiles), the per-REGION inputs that
# replace v0's whole-place ones. A ctx block is f(the sources in the block, buildId) only, compiled on demand and cached
# like a tile (ctx/{buildId}/hg1-{d}/4/{C}/{R}):
#   bcnt  uint16 128 x 128: building centroids per 64 m global cell (cell = (gx // 6400, gs // 6400))
#   pcnt  uint16 128 x 128: places with confidence >= 0.5 and a category, per cell
#   wlev  {waterGersId: level_cm}: every water polygon (> 2000 m2) meeting the block, its level = the median raw DEM
#         height at posts inside (polygon - 15 m) n block (8 m sub-lattice of the 2 m posts; the polygon itself if the
#         inset is empty; >= 10 posts or no level). Long rivers may step at block lines (3DEP is hydro-flattened)
# A tile reads the ctx blocks covering tile + 2600 m (at most 2 x 2) for: the dense blend (bcnt round a building), the
# downtown field (pcnt: scores within 250 m, centres by non-max suppression within 2000 m, downtown = within 350 m of a
# centre) and its water levels.
import gzip
import io
import json
import struct

import numpy as np
import shapely
from shapely.geometry import box as sbox

import grid

N = 128          # cells a side
CELL = grid.CELL64_CM
BLOCK = grid.TILE << grid.CTX_L
WATER_MIN_M2 = 2000


def exact_centroid_cm(ring):
    """Exact centroid (Fraction-free: integer shoelace sums) of an int-cm ring [(gx, gs)...] -> (num_x, num_z, den):
    centroid = num / den, den = 3 * twice-area (0: a degenerate ring, the first vertex is returned with den 1)."""
    x0, z0 = ring[0]
    a2 = sx = sz = 0
    n = len(ring)
    for i in range(n):
        xa, za = ring[i][0] - x0, ring[i][1] - z0
        xb, zb = ring[(i + 1) % n][0] - x0, ring[(i + 1) % n][1] - z0
        cr = xa * zb - xb * za
        a2 += cr
        sx += (xa + xb) * cr
        sz += (za + zb) * cr
    if a2 == 0:
        return x0, z0, 1
    den = 3 * a2
    return sx + x0 * den, sz + z0 * den, den


def floor_div(num, den, q):
    """floor(num / den / q) exactly (ints, den may be negative)."""
    if den < 0:
        num, den = -num, -den
    return num // (den * q)


def ring_cm(poly):
    cs = shapely.get_coordinates(poly.exterior)[:-1]
    return [(int(round(x * 100)), int(round(z * 100))) for x, z in cs]


def largest_polygon(g):
    if g.geom_type == 'MultiPolygon':
        g = max(g.geoms, key=lambda p: (p.area, p.bounds))
    return g if g.geom_type == 'Polygon' else None


def building_owner_cm(r):
    """(cx_num, cz_num, den) of the building's full footprint (its largest polygon, projected int cm), cached on the row."""
    if 'own' not in r:
        p = largest_polygon(r['geom'])
        r['own'] = exact_centroid_cm(ring_cm(p)) if p is not None and len(p.exterior.coords) >= 4 else None
    return r['own']


def poi_ok(p, conf=0.5):
    return bool((p['basic_category'] or p['cat']) and (p['confidence'] or 0) >= conf)


def water_polys(src, window):
    out = []
    for r in src.query('water', window):
        g = r['geom']
        if g.geom_type not in ('Polygon', 'MultiPolygon'):
            continue
        if 'poly' not in r:
            r['poly'] = g.buffer(0)
            shapely.prepare(r['poly'])
        if r['poly'].area > WATER_MIN_M2:
            out.append(r)
    return out


def compile_ctx(src, dem, C, R, build_id):
    """-> (header dict, bcnt uint16 [128, 128], pcnt uint16 [128, 128])."""
    x0, z0 = C * BLOCK, R * BLOCK
    src.require(x0, z0, x0 + BLOCK, z0 + BLOCK, 'ctx %d,%d' % (C, R))
    win = sbox(x0, z0, x0 + BLOCK, z0 + BLOCK)
    bcnt = np.zeros((N, N), dtype=np.int64)
    for r in src.query('buildings', win):
        if r['is_underground']:
            continue
        own = building_owner_cm(r)
        if own is None:
            continue
        i = floor_div(own[0], own[2], CELL) - C * N
        j = floor_div(own[1], own[2], CELL) - R * N
        if 0 <= i < N and 0 <= j < N:
            bcnt[j, i] += 1
    pcnt = np.zeros((N, N), dtype=np.int64)
    for p in src.places_in(win):
        if not poi_ok(p):
            continue
        i, j = p['gx'] // CELL - C * N, p['gs'] // CELL - R * N
        if 0 <= i < N and 0 <= j < N:
            pcnt[j, i] += 1
    wlev = {}
    d = src.dom
    for r in water_polys(src, win):
        lv = water_level(r['poly'], win, d, dem)
        if lv is not None:
            wlev[r['id']] = lv
    header = {'format': 'hometown-ctx', 'version': 1, 'grid': grid.GRID, 'domain': d.name, 'L': grid.CTX_L, 'C': C, 'R': R,
              'buildId': build_id, 'cells': N, 'cell': grid.CELL64, 'wlev': wlev, 'demSource': dem.sources()}
    return header, np.minimum(bcnt, 65535).astype('<u2'), np.minimum(pcnt, 65535).astype('<u2')


def water_level(poly, win, d, dem):
    for inset, step in ((15, 8), (0, 8), (0, 2)):
        g = poly.buffer(-inset) if inset else poly
        g = g.intersection(win)
        if g.is_empty:
            continue
        bx0, bz0, bx1, bz1 = g.bounds
        i0, i1 = int(np.ceil(bx0 / step)), int(np.floor(bx1 / step))
        j0, j1 = int(np.ceil(bz0 / step)), int(np.floor(bz1 / step))
        if i1 < i0 or j1 < j0:
            continue
        X, Z = np.meshgrid(np.arange(i0, i1 + 1) * float(step), np.arange(j0, j1 + 1) * float(step))
        inside = shapely.contains_xy(g, X.ravel(), Z.ravel())
        if inside.sum() < 10:
            continue
        lon, lat = d.inverse(X.ravel()[inside], Z.ravel()[inside])
        h = dem.sample(lon, lat)
        h = h[np.isfinite(h)]
        if h.size < 10:
            continue
        return int(np.rint(float(np.median(h)) * 100))
    return None


# ---- the HTC1 container (gz, mtime 0)
def pack_ctx(header, bcnt, pcnt):
    js = json.dumps(header, sort_keys=True, separators=(',', ':')).encode()
    pad = (4 - len(js) % 4) % 4
    raw = b'HTC1' + struct.pack('<I', len(js) + pad) + js + b' ' * pad + bcnt.tobytes() + pcnt.tobytes()
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode='wb', compresslevel=9, mtime=0, filename='') as g:
        g.write(raw)
    return bio.getvalue()


def unpack_ctx(b):
    raw = gzip.decompress(b)
    assert raw[:4] == b'HTC1'
    n = struct.unpack('<I', raw[4:8])[0]
    h = json.loads(raw[8:8 + n])
    o = 8 + n
    bcnt = np.frombuffer(raw[o:o + N * N * 2], dtype='<u2').reshape(N, N)
    pcnt = np.frombuffer(raw[o + N * N * 2:o + N * N * 4], dtype='<u2').reshape(N, N)
    return h, bcnt, pcnt


class Context:
    """The ctx blocks round a window, stitched into one cell array (cells (gx // 6400, gs // 6400))."""
    def __init__(self, blocks):
        # blocks: {(C, R): (header, bcnt, pcnt)}
        self.blocks = blocks
        Cs = [k[0] for k in blocks]
        Rs = [k[1] for k in blocks]
        self.C0, self.R0 = min(Cs), min(Rs)
        nc, nr = max(Cs) - self.C0 + 1, max(Rs) - self.R0 + 1
        self.have = np.zeros((nr, nc), bool)
        self.b = np.zeros((nr * N, nc * N), np.int64)
        self.p = np.zeros((nr * N, nc * N), np.int64)
        for (C, R), (h, b, p) in blocks.items():
            jj, ii = (R - self.R0) * N, (C - self.C0) * N
            self.b[jj:jj + N, ii:ii + N] = b
            self.p[jj:jj + N, ii:ii + N] = p
            self.have[R - self.R0, C - self.C0] = True
        self.i0, self.j0 = self.C0 * N, self.R0 * N   # global cell index of array [0, 0]
        self._centres = None

    def level(self, wid, C, R):
        h = self.blocks.get((C, R))
        return None if h is None else h[0]['wlev'].get(wid)

    def check(self, ci0, cj0, ci1, cj1, what):
        for C in range(ci0 // N, ci1 // N + 1):
            for R in range(cj0 // N, cj1 // N + 1):
                if (C, R) not in self.blocks:
                    raise KeyError('%s needs ctx block %d,%d' % (what, C, R))

    def bdensity_sum(self, ci, cj):
        """bcnt summed over cells ci-16..ci+15, cj-16..cj+15 (global cell indices)."""
        self.check(ci - 16, cj - 16, ci + 15, cj + 15, 'dense blend')
        a, b = ci - 16 - self.i0, cj - 16 - self.j0
        return int(self.b[b:b + 32, a:a + 32].sum())

    def centres(self, ci0, cj0, ci1, cj1):
        """Downtown centres (global cell indices) among cells [ci0, ci1] x [cj0, cj1]: score(q) = pcnt over cells whose
        centres lie within 250 m of q's, a centre if score >= 5 and (score, -r64, -c64) is the maximum over the cells
        within 2000 m. Integer maths only."""
        R1, R2 = 4, 32    # cell reach for 250 m and 2000 m (64 m cells)
        self.check(ci0 - R1 - R2, cj0 - R1 - R2, ci1 + R1 + R2, cj1 + R1 + R2, 'downtown')
        # scores over the window + R2
        a0, b0 = ci0 - R2 - self.i0, cj0 - R2 - self.j0
        w, h = ci1 - ci0 + 1 + 2 * R2, cj1 - cj0 + 1 + 2 * R2
        P = self.p
        score = np.zeros((h, w), np.int64)
        for dj in range(-R1, R1 + 1):
            for di in range(-R1, R1 + 1):
                if (64 * di) ** 2 + (64 * dj) ** 2 > 250 ** 2:
                    continue
                score += P[b0 + dj:b0 + dj + h, a0 + di:a0 + di + w]
        gi = np.arange(w)[None, :] + (ci0 - R2)
        gj = np.arange(h)[:, None] + (cj0 - R2)
        key = (score << 40) | (((1 << 20) - 1 - gj) << 20) | ((1 << 20) - 1 - gi)
        # max of key over the 2000 m disc, for the inner cells
        H, Wd = cj1 - cj0 + 1, ci1 - ci0 + 1
        best = np.full((H, Wd), -1, np.int64)
        for dj in range(-R2, R2 + 1):
            for di in range(-R2, R2 + 1):
                if (64 * di) ** 2 + (64 * dj) ** 2 > 2000 ** 2:
                    continue
                best = np.maximum(best, key[R2 + dj:R2 + dj + H, R2 + di:R2 + di + Wd])
        mine = key[R2:R2 + H, R2:R2 + Wd]
        sc = score[R2:R2 + H, R2:R2 + Wd]
        js, is_ = np.nonzero((mine == best) & (sc >= 5))
        return sorted([(int(i + ci0), int(j + cj0), int(sc[j, i])) for j, i in zip(js, is_)], key=lambda t: (-t[2], t[1], t[0]))


def top_cell(ctx, ci0, cj0, ci1, cj1):
    """The highest-scoring cell (250 m POI score; ties: lower r, then lower c) among [ci0, ci1] x [cj0, cj1], or None
    when no cell scores 5: a place's downtown spawn when no NMS centre lies inside its box (a stronger core nearby)."""
    R1 = 4
    ctx.check(ci0 - R1, cj0 - R1, ci1 + R1, cj1 + R1, 'top cell')
    a0, b0 = ci0 - ctx.i0, cj0 - ctx.j0
    w, h = ci1 - ci0 + 1, cj1 - cj0 + 1
    score = np.zeros((h, w), np.int64)
    for dj in range(-R1, R1 + 1):
        for di in range(-R1, R1 + 1):
            if (64 * di) ** 2 + (64 * dj) ** 2 <= 250 ** 2:
                score += ctx.p[b0 + dj:b0 + dj + h, a0 + di:a0 + di + w]
    j, i = np.unravel_index(int(np.argmax(score)), score.shape)   # (row-major: the first max is the lowest r, then c)
    return (int(i + ci0), int(j + cj0), int(score[j, i])) if score[j, i] >= 5 else None


def downtown_at(centres, gx, gs):
    """Within 350 m of any centre's cell centre (exact, int cm)."""
    for ci, cj, _ in centres:
        dx, dz = gx - (ci * CELL + CELL // 2), gs - (cj * CELL + CELL // 2)
        if dx * dx + dz * dz <= 35000 * 35000:
            return True
    return False
