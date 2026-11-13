# tools/hometown/far.py: the FAR FIELD round a Hometown place on the national grid hg1, so the land past the compiled
# tiles reaches the horizon (no sea past the box edge). Far tiles are keyed on the hg1 grid itself, at coarse levels, so
# they are axis-aligned and uniform in any session frame (session metres = grid metres / k0), self-contained and shared
# by neighbouring places:
#
#   tier  level  tile (grid m)  posts   post step  heights from                         extent round the core
#   a     L1     1024           65^2    16 m       the core's own post function (below)  core + FAR_A (1 km)
#   b     L3     4096           65^2    64 m       3DEP 1", 2 x 2 point mean per post   core + FAR_B (10 km)
#   c     L5     16384          65^2    256 m      3DEP 1", 8 x 8 point mean per post   core + FAR_C (30 km)
#
# Tier A is the ring that meets the core: its posts lie on the core's own 2 m post lattice (16 = 8 x 2) and take the
# core's post function there (compile.py posts_cm on land: 3DEP 1/3" bilinear at the 5 x 5 posts round it, the sigma-1-
# post blur, int cm), so at the core's edge (an L0 tile line, a multiple of 16 grid m) far and core heights are the
# same number (to the 0.1 m quantum); between posts only 16 m of linear interpolation differs. Water flattening and bridges (the core's ctx
# and segments) are not in it: the runtime (cities/pkg/js/pkg-far.js) snaps the last 64 m to the core's own edge and
# blends each tier's outer band into the next coarser tier, so Terrain.heightAt is continuous core -> A -> B -> C.
# A tiles wholly inside the core are not listed (never drawn).
#
# Tile (L, C, R) covers posts (64 C + i, 64 R + j), i, j in 0..64, at grid metres (x, s) = (64 C + i, 64 R + j) * step:
# the edge rows and columns are the neighbours' (same global post, same computation: shared edges are byte-identical).
# B / C: a post's height is the mean of its finite point samples on a k x k sub-lattice of its cell (bilinear on the 1"
# lattice, dem.Sampler product '1'); none finite -> no data (q 0). Its class: 1 water when the 3 x 3 block of DEM
# pixels nearest it (1/3" for A, 1" for B / C) is exactly flat (3DEP is hydro-flattened: a water body is one constant
# height; land is never flat to 1 mm over ~30-90 m), 2 arid land (the compiler's desert rule, per post: lon < -104 and
# lat < 37.5), else 0 land. Nothing depends on the place: far tile = f(buildId, key, the DEM snapshot).
#
# File (SFB1, gzip mtime 0): header {format 'hometown-far', version 1, grid, domain, tier, L, C, R, n 65, step,
# minH -100, scale 0.1, classes, water, demSource}, then uint16 heights (NAVD88 m = -100 + 0.1 q; q 0 no data) and uint8
# class per post, row-major (row j southward, column i eastward). (One quantum for every tier, so a shared edge is the
# same bytes: A's posts are the core's to 5 cm.)
#   --far hg1-{d}/{L}/{C}/{R} --out -    one far tile (compile.py)
import json
import math
import struct

import numpy as np

import grid

N = 64                      # post intervals per far tile
TIERS = {'a': {'L': 1, 'sub': 1, 'product': '13'}, 'b': {'L': 3, 'sub': 2, 'product': '1'}, 'c': {'L': 5, 'sub': 8, 'product': '1'}}
FAR_A = 1024                # grid m past the core rect
FAR_B = 10000
FAR_C = 30000
CLASSES = ['land', 'water', 'arid']
MIN_H, SCALE = -100.0, 0.1


def tier_of_level(L):
    for t, v in TIERS.items():
        if v['L'] == L:
            return t
    raise ValueError('no far tier at level %d' % L)


def tile_size(tier):
    return grid.TILE << TIERS[tier]['L']


def post_step(tier):
    return tile_size(tier) // N


def tiles_for(core, tier):
    """core = (gx0, gs0, gx1, gs1) grid metres -> the far tiles (C, R) meeting core + the tier's reach (a rectangle)."""
    reach = {'a': FAR_A, 'b': FAR_B, 'c': FAR_C}[tier]
    T = tile_size(tier)
    gx0, gs0, gx1, gs1 = core
    C0, R0 = math.floor((gx0 - reach) / T), math.floor((gs0 - reach) / T)
    C1, R1 = math.floor((gx1 + reach - 1e-6) / T), math.floor((gs1 + reach - 1e-6) / T)
    out = [(C, R) for R in range(max(0, R0), R1 + 1) for C in range(max(0, C0), C1 + 1)]
    if tier == 'a':  # (the ring only: a tile wholly inside the core is never drawn)
        out = [(C, R) for C, R in out if not (C * T >= gx0 and R * T >= gs0 and (C + 1) * T <= gx1 and (R + 1) * T <= gs1)]
    return out


def parse_far_id(s):
    """'hg1-{d}/{L}/{C}/{R}' (L 3 or 5) -> (domain, tier, C, R)."""
    g, L, c, r = s.split('/')
    gr, _, dom = g.partition('-')
    L, c, r = int(L), int(c), int(r)
    if gr != grid.GRID or dom not in grid.DOMAINS or c < 0 or r < 0:
        raise ValueError('bad far id %r' % s)
    bc, br = grid.BOUNDS[dom]
    if (c << L) > bc or (r << L) > br:
        raise ValueError('far id out of bounds %r' % s)
    return dom, tier_of_level(L), c, r


def far_key(bid, dom, tier, C, R):
    return 'far/%s/%s-%s/%d/%d/%d' % (bid, grid.GRID, dom, TIERS[tier]['L'], C, R)


def far_file(tier, C, R):
    return 'data/far/%s-%d-%d.bin' % (tier, C, R)


def posts_xy(tier, C, R):
    st = post_step(tier)
    ii, jj = np.meshgrid(np.arange(N + 1), np.arange(N + 1))
    return (C * N + ii) * float(st), (R * N + jj) * float(st)


# the core's blur (compile.py posts_cm): sigma 1 post, 5 taps, x then z
BLUR = np.array([0.0545, 0.2442, 0.4026, 0.2442, 0.0545])


def core_posts(d, X, S, dem):
    """The core's post function on land at grid-metre posts (X, S, multiples of grid.POST): 3DEP 1/3" bilinear at the
    5 x 5 posts round each (no data -> 0, as the core), blurred x then z as posts_cm does, rounded to int cm (half-even).
    -> (cm float array, centre-has-data mask)"""
    o = (np.arange(5) - 2) * float(grid.POST)
    ox, os_ = np.meshgrid(o, o)          # [z tap, x tap]
    px = X.ravel()[:, None] + ox.ravel()[None, :]
    ps = S.ravel()[:, None] + os_.ravel()[None, :]
    lon, lat = d.inverse(px.ravel(), ps.ravel())
    h = dem.sample(lon, lat).reshape(-1, 5, 5)
    ok = np.isfinite(h[:, 2, 2])
    h = np.where(np.isfinite(h), h, 0.0)
    den = BLUR.sum()
    hx = (h * BLUR[None, None, :]).sum(axis=2) / den     # along x, per z tap
    hb = (hx * BLUR[None, :]).sum(axis=1) / den          # then along z
    return np.rint(hb * 100), ok


def compile_far(dom_name, tier, C, R, dem1, bid):
    """One far tile -> SFB1 bytes (not gzipped). dem1: a dem.Sampler on the tier's product (TIERS[tier]['product']:
    1/3" for A, 1" for B / C; snapshot-pinned)."""
    d = grid.domain(dom_name)
    k = TIERS[tier]['sub']
    st = post_step(tier)
    X, S = posts_xy(tier, C, R)
    dem1.used = {}
    if tier == 'a':
        cm, ok = core_posts(d, X, S, dem1)
        mean = np.where(ok, cm / 100.0, np.nan)
    else:
        off = ((np.arange(k) + 0.5) / k - 0.5) * st
        ox, os_ = np.meshgrid(off, off)
        px = (X.ravel()[:, None] + ox.ravel()[None, :])
        ps = (S.ravel()[:, None] + os_.ravel()[None, :])
        lon, lat = d.inverse(px.ravel(), ps.ravel())
        h = dem1.sample(lon, lat).reshape(px.shape)
        fin = np.isfinite(h)
        cnt = fin.sum(axis=1)
        mean = np.where(cnt > 0, np.where(fin, h, 0).sum(axis=1) / np.maximum(cnt, 1), np.nan)
    # (water: the 3 x 3 block of 1" pixels nearest each post exactly flat)
    plon, plat = d.inverse(X.ravel(), S.ravel())
    R1 = dem1.RES
    fc = np.floor(np.asarray(plon) * R1).astype(np.int64)    # (the pixel whose centre (k + 0.5) / RES is nearest)
    fr = np.floor(-np.asarray(plat) * R1).astype(np.int64)
    dc, dr = np.meshgrid([-1, 0, 1], [-1, 0, 1])
    blk = dem1.pixels(fc[:, None] + dc.ravel()[None, :], fr[:, None] + dr.ravel()[None, :])
    flat = np.isfinite(blk).all(axis=1) & (np.ptp(np.where(np.isfinite(blk), blk, 0), axis=1) < 0.001)
    arid = (np.asarray(plon) < -104) & (np.asarray(plat) < 37.5)
    cls = np.where(flat, 1, np.where(arid, 2, 0)).astype(np.uint8)
    q = np.where(np.isfinite(mean), np.clip(np.rint((mean - MIN_H) / SCALE), 1, 65535), 0).astype('<u2')
    header = {'format': 'hometown-far', 'version': 1, 'grid': grid.GRID, 'domain': dom_name, 'tier': tier, 'L': TIERS[tier]['L'], 'C': C, 'R': R,
              'id': '%s-%s/%d/%d/%d' % (grid.GRID, dom_name, TIERS[tier]['L'], C, R), 'n': N + 1, 'step': st, 'sub': k,
              'minH': MIN_H, 'scale': SCALE, 'classes': CLASSES, 'water': bool((cls == 1).any()), 'noData': int((q == 0).sum()),
              'buildId': bid, 'demSource': dem1.sources(), 'vdatum': 'NAVD88 (3DEP), no datum shift'}
    js = json.dumps(header, sort_keys=True, separators=(',', ':')).encode()
    pad = (4 - len(js) % 4) % 4
    return b'SFB1' + struct.pack('<I', len(js) + pad) + js + b' ' * pad + q.tobytes() + cls.tobytes()


def read_far(b):
    n = struct.unpack('<I', b[4:8])[0]
    h = json.loads(b[8:8 + n])
    P = h['n']
    q = np.frombuffer(b, dtype='<u2', count=P * P, offset=8 + n).reshape(P, P)
    cls = np.frombuffer(b, dtype=np.uint8, count=P * P, offset=8 + n + 2 * P * P).reshape(P, P)
    return h, q, cls


def place_far(core, dom_name):
    """The far tiles of a place: {tier: [(C, R)]}, finest first."""
    return {t: tiles_for(core, t) for t in ('a', 'b', 'c')}
