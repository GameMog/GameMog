# tools/hometown/grid.py: Hometown Grid 1 ("hg1"), the national tile grid. THE authority for projection, tile
# ownership, k0 / gamma0 and the integer-centimetre quantisation (wagmi/world/grid.js and server/tiles/src/grid.mjs are
# display / validation twins that must pass grid-vectors.json; they never decide ownership).
#
# Frozen in hg1 (changing ANY of these is hg2: a new key namespace):
#   - per-domain Lambert Conformal Conic on GRS80 (a 6378137, f 1/298.257222101), Snyder's ellipsoidal forms, applied to
#     Overture WGS84 / 3DEP NAD83 lon/lat directly (no datum shift)
#   - grid coordinates E' = E_raw + FE (easting) and S = S0 - N_raw (southing, grows south = the engine's +z), N_raw
#     measured from phi0 with no false northing
#   - Alaska longitudes normalised to (-200, -125]; every other domain to (lon0 - 180, lon0 + 180]
#   - gx = round_half_even(E' * 100), gs = round_half_even(S * 100): integer centimetres, once per source vertex
#   - L0 tile 512 grid-m: c = gx // 51200, r = gs // 51200 (floor, half-open [lo, hi) on both axes)
#   - terrain posts on a global 2 m lattice (257 x 257 a tile, edges shared), ground mask on global 1 m cells
#   - L4 context blocks = 16 x 16 tiles (8192 grid-m); L2 compile blocks = 4 x 4 tiles
import math
from fractions import Fraction

import numpy as np

GRID = 'hg1'
A = 6378137.0
F_ = 1 / 298.257222101
E2 = F_ * (2 - F_)
E = math.sqrt(E2)
TILE = 512            # grid m
TILE_CM = 51200
POST = 2              # grid m
POSTS = TILE // POST + 1   # 257
MASK = 1              # grid m
CTX_L = 4
BLOCK_L = 2
CELL64 = 64           # ctx count cells, grid m
CELL64_CM = 6400

# domain: (phi1, phi2, phi0, lam0, FE, S0, index)
DOMAINS = {
    'conus': (33.0, 45.0, 39.0, -96.0, 3000000.0, 4000000.0, 0),
    'ak': (55.0, 65.0, 50.0, -154.0, 3000000.0, 3000000.0, 1),
    'hi': (19.5, 21.75, 20.5, -157.5, 500000.0, 500000.0, 2),
    'pr': (18.4333333, 18.0333333, 17.8333333, -66.4333333, 500000.0, 500000.0, 3),
    'gu': (14.0, 19.0, 13.0, 145.5, 500000.0, 1500000.0, 4),
    'as': (-14.0, -14.5, -14.25, -170.0, 500000.0, 500000.0, 5),
}
# key bounds (c, r inclusive), the registry grid.mjs repeats
BOUNDS = {'conus': (12000, 12000), 'ak': (12000, 10000), 'hi': (4000, 4000), 'pr': (4000, 4000), 'gu': (4000, 4000), 'as': (4000, 4000)}
STATE_DOMAIN = {'02': 'ak', '15': 'hi', '72': 'pr', '78': 'pr', '66': 'gu', '69': 'gu', '60': 'as'}


def domain_of_geoid(geoid):
    """Census GEOID -> domain, by its first two digits (the state). The client never infers a domain from lon/lat."""
    return STATE_DOMAIN.get(str(geoid)[:2], 'conus')


def _m(p):
    return math.cos(p) / math.sqrt(1 - E2 * math.sin(p) ** 2)


def _t(p):
    s = math.sin(p)
    return math.tan(math.pi / 4 - p / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2)


class Domain:
    def __init__(self, name):
        p1, p2, p0, l0, fe, s0, idx = DOMAINS[name]
        self.name, self.index, self.lam0, self.FE, self.S0 = name, idx, l0, fe, s0
        p1, p2, p0 = math.radians(p1), math.radians(p2), math.radians(p0)
        if abs(p1 - p2) < 1e-12:
            n = math.sin(p1)
        else:
            n = (math.log(_m(p1)) - math.log(_m(p2))) / (math.log(_t(p1)) - math.log(_t(p2)))
        self.n = n
        self.F = _m(p1) / (n * _t(p1) ** n)
        self.rho0 = A * self.F * _t(p0) ** n
        self.sign = 1.0 if n > 0 else -1.0

    def norm_lon(self, lon):
        lon = np.asarray(lon, dtype=np.float64)
        if self.name == 'ak':
            lo, hi = -200.0, -125.0
        else:
            lo, hi = self.lam0 - 180.0, self.lam0 + 180.0
        lon = np.where(lon <= lo, lon + 360.0, lon)
        return np.where(lon > hi, lon - 360.0, lon)

    # ---- forward / inverse (numpy, float64): grid metres E' (easting), S (southing)
    def forward(self, lon, lat):
        lon = self.norm_lon(lon)
        p = np.radians(np.asarray(lat, dtype=np.float64))
        s = np.sin(p)
        t = np.tan(np.pi / 4 - p / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2)
        rho = A * self.F * t ** self.n
        th = self.n * np.radians(lon - self.lam0)
        x = rho * np.sin(th)
        y = self.rho0 - rho * np.cos(th)
        return x + self.FE, self.S0 - y

    def inverse(self, Ep, S):
        x = np.asarray(Ep, dtype=np.float64) - self.FE
        y = self.S0 - np.asarray(S, dtype=np.float64)
        sg = self.sign
        dy = self.rho0 - y
        rho = sg * np.sqrt(x * x + dy * dy)
        th = np.arctan2(sg * x, sg * dy)
        t = (rho / (A * self.F)) ** (1 / self.n)
        lam = np.degrees(th / self.n) + self.lam0
        phi = np.pi / 2 - 2 * np.arctan(t)
        for _ in range(15):
            s = np.sin(phi)
            nphi = np.pi / 2 - 2 * np.arctan(t * ((1 - E * s) / (1 + E * s)) ** (E / 2))
            done = np.all(np.abs(nphi - phi) < 1e-12)
            phi = nphi
            if done:
                break
        lam = np.where(lam > 180.0, lam - 360.0, np.where(lam <= -180.0, lam + 360.0, lam))
        return lam, np.degrees(phi)

    def scale(self, lon, lat):
        """Point scale factor k (grid m per ground m)."""
        p = math.radians(float(lat))
        rho = A * self.F * _t(p) ** self.n
        return rho * self.n / (A * _m(p))

    def gamma(self, lon):
        """Meridian convergence, degrees: the true bearing of grid north (-z)."""
        return self.n * (float(self.norm_lon(lon)) - self.lam0)


_DOMS = {}


def domain(name):
    if name not in _DOMS:
        if name not in DOMAINS:
            raise ValueError('unknown hg1 domain %r' % name)
        _DOMS[name] = Domain(name)
    return _DOMS[name]


# ---- integer centimetres
def to_cm(v):
    """round_half_even(v * 100) as Python ints (numpy rint is half-even)."""
    return np.rint(np.asarray(v, dtype=np.float64) * 100.0).astype(np.int64)


def project_cm(dom, lon, lat):
    Ep, S = dom.forward(lon, lat)
    return to_cm(Ep), to_cm(S)


def tile_of(gx, gs):
    return int(gx) // TILE_CM, int(gs) // TILE_CM


def tile_id(dom, c, r, L=0):
    return '%s-%s/%d/%d/%d' % (GRID, dom if isinstance(dom, str) else dom.name, L, c, r)


def parse_tile_id(s):
    g, L, c, r = s.split('/')
    gr, _, dom = g.partition('-')
    if gr != GRID or dom not in DOMAINS:
        raise ValueError('bad hg1 id %r' % s)
    L, c, r = int(L), int(c), int(r)
    bc, br = BOUNDS[dom]
    if L not in (0, BLOCK_L, CTX_L) or c < 0 or r < 0 or (c << L) > bc or (r << L) > br:
        raise ValueError('hg1 id out of bounds %r' % s)
    return dom, L, c, r


def tile_box_cm(c, r):
    return c * TILE_CM, r * TILE_CM, (c + 1) * TILE_CM, (r + 1) * TILE_CM


# ---- exact grid-line crossings of a segment between integer-cm points
def round_half_even_frac(q):
    return round(q)   # Fraction.__round__ is half-even


def crossings(p0, p1, step=TILE_CM):
    """Every point where the segment p0 -> p1 (int cm) crosses a grid line E' = step*k or S = step*k, strictly inside
    the segment, ordered along it: [(t: Fraction, axis 'E'|'S', k, (gx, gs) ints)]. The along-line coordinate is the
    exact crossing rounded half-even; the across coordinate is exactly the line."""
    (x0, y0), (x1, y1) = (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1]))
    out = []
    for axis, a0, a1, b0, b1 in (('E', x0, x1, y0, y1), ('S', y0, y1, x0, x1)):
        if a0 == a1:
            continue
        lo, hi = min(a0, a1), max(a0, a1)
        k0 = lo // step + 1
        k1 = (hi - 1) // step
        # (a vertex exactly on a line is not a crossing of this segment: it is a vertex the split keeps)
        for k in range(k0, k1 + 1):
            g = k * step
            t = Fraction(g - a0, a1 - a0)
            b = round_half_even_frac(b0 + t * (b1 - b0))
            pt = (g, b) if axis == 'E' else (b, g)
            out.append((t, axis, k, pt))
    out.sort(key=lambda e: (e[0], e[1]))
    return out


def on_line(gx, gs, step=TILE_CM):
    """Which grid lines an int-cm point lies on: [('E', k)] / [('S', k)]."""
    o = []
    if gx % step == 0:
        o.append(('E', gx // step))
    if gs % step == 0:
        o.append(('S', gs // step))
    return o


# ---- session frame (Python only; the descriptor pins the numbers)
def session_frame(dom_name, lon, lat):
    """Anchor lon/lat -> the session origin: its tile (c0, r0) (NW corner), k0 (1e-9) and gamma0 (1e-6 deg) at the
    origin corner's own lon/lat."""
    d = domain(dom_name)
    gx, gs = project_cm(d, [lon], [lat])
    c0, r0 = tile_of(gx[0], gs[0])
    olon, olat = d.inverse([c0 * TILE], [r0 * TILE])
    olon, olat = float(olon[0]), float(olat[0])
    return {'grid': GRID, 'domain': d.name, 'c0': c0, 'r0': r0, 'k0': round(d.scale(olon, olat), 9),
            'gamma0': round(d.gamma(olon), 6), 'originLon': round(olon, 9), 'originLat': round(olat, 9)}


def to_session(fr, gx, gs):
    """int cm (global) -> session metres (float64), from integers: x = (gx - 51200 c0) / (100 k0)."""
    k0 = fr['k0']
    return (np.asarray(gx, dtype=np.int64) - TILE_CM * fr['c0']) / (100.0 * k0), (np.asarray(gs, dtype=np.int64) - TILE_CM * fr['r0']) / (100.0 * k0)
