# Jensen hair groom: guide strands grown over his scalp (prep.blend's skin, bind space), saved as groom.npz.
# All maths in glTF space (Y up, +Z forward, metres): gl = (bx, bz, -by) of the body's local Blender coords.
# Run: Blender -b prep.blend --python groom.py -- <dir> [seed]
import bpy, sys, math, json
import numpy as np
from mathutils import kdtree, Vector, noise

D = sys.argv[sys.argv.index('--') + 1]
P = json.load(open(D + '/params.json'))
rng = np.random.default_rng(P.get('seed', 7))
EY, EZ = 1.6254, 0.1253
HC = np.array([0.0, EY + 0.02, EZ - 0.09])

def sm(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def hair_area(x0, y, z, n=0.0, front=0.047, temple=0.006):
    x = abs(x0)
    yf = EY + front + 0.008 * sm(0.015, 0.045, x) + n * 0.002; f = sm(yf - 0.003, yf + 0.004, y)
    zt = EZ - 0.038 + temple - 0.03 * sm(EY + 0.05, EY - 0.005, y) + n * 0.002
    ysb = EY - 0.012 - 0.05 * sm(0.03, -0.02, z) + n * 0.002
    side = sm(zt + 0.004, zt - 0.004, z) * sm(ysb - 0.003, ysb + 0.004, y) * sm(0.03, 0.05, x + 0.04 * sm(0.0, -0.05, z))
    ex = (y - (EY - 0.024)) / 0.028; ez = (z - 0.03) / 0.024; ed = math.hypot(ex, ez); ear = sm(0.058, 0.07, x) * sm(1.1, 0.96, ed)
    return float(np.clip(max(f, side) * (1 - ear), 0, 1))

body = max([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: len(o.data.vertices))
me = body.data
skin_idx = [i for i, m in enumerate(me.materials) if m and m.name == 'skin']
V = np.array([v.co[:] for v in me.vertices]); V = np.stack([V[:, 0], V[:, 2], -V[:, 1]], 1)
NV = np.array([v.normal[:] for v in me.vertices]); NV = np.stack([NV[:, 0], NV[:, 2], -NV[:, 1]], 1)
tris = []
me.calc_loop_triangles()
for t in me.loop_triangles:
    if t.material_index in skin_idx: tris.append(t.vertices[:])
tris = np.array(tris)
cent = V[tris].mean(1)
keep = (cent[:, 1] > EY - 0.085) & (cent[:, 2] < EZ + 0.05)
tris = tris[keep]
hv = np.unique(tris)
kd = kdtree.KDTree(len(hv))
for i, v in enumerate(hv): kd.insert(V[v], i)
kd.balance()

def scalp(p):
    pts = kd.find_n(p, 6)
    w = 0; q = np.zeros(3); n = np.zeros(3)
    for co, i, d in pts:
        ww = 1.0 / (d + 0.002); w += ww; q += np.array(co) * ww; n += NV[hv[i]] * ww
    q /= w; n /= np.linalg.norm(n)
    return q, n

def region(q):
    top = sm(EY + 0.03, EY + 0.08, q[1])
    front = sm(HC[2] - 0.03, HC[2] + 0.06, q[2])
    back = sm(HC[2] - 0.035, HC[2] - 0.095, q[2])
    low = sm(EY + 0.035, EY - 0.03, q[1])
    return top, front, back, low

def thick(q):
    top, front, back, low = region(q)
    H = (1 - top) * P['Hside'] + top * ((1 - front) * P['Hcrown'] + front * P['Hfront'])
    return H * (1 - back * low) + P['Hnape'] * back * low

def comb(q, n):
    top, front, back, low = region(q)
    cs = np.array([0, P['sideUp'], -1.0]); ct = np.array([0, 0, -1.0]); cb = np.array([0, -1.0, -0.2])
    c = cs * (1 - top) + ct * top
    c = c * (1 - back * (1 - 0.6 * top)) + cb * back * (1 - 0.6 * top)
    c = c - n * np.dot(c, n); L = np.linalg.norm(c)
    return c / L if L > 1e-6 else np.array([0, 0, -1.0])

def length(q):
    top, front, back, low = region(q)
    L = (1 - top) * P['Lside'] + top * ((1 - front) * P['Lcrown'] + front * P['Lfront'])
    return L * (1 - back * low) + P['Lnape'] * back * low

# area-weighted roots over the hair's area
A = np.linalg.norm(np.cross(V[tris[:, 1]] - V[tris[:, 0]], V[tris[:, 2]] - V[tris[:, 0]]), axis=1) / 2
def sample_roots(n, band=None):
    out = []
    cdf = np.cumsum(A) / A.sum()
    while len(out) < n:
        k = np.searchsorted(cdf, rng.random(4096))
        r1, r2 = rng.random(4096), rng.random(4096)
        s = np.sqrt(r1)
        pts = V[tris[k, 0]] * (1 - s)[:, None] + V[tris[k, 1]] * (s * (1 - r2))[:, None] + V[tris[k, 2]] * (s * r2)[:, None]
        for p in pts:
            nz = noise.noise(Vector(p * 90)) if True else 0
            m = hair_area(p[0], p[1], p[2], nz)
            if band:
                if band[0] < m < band[1] and rng.random() < 0.8: out.append(p)
            elif rng.random() < m ** 1.5: out.append(p)
            if len(out) >= n: break
    return np.array(out)

PRM_UP, PRM_N0 = P.get('liftUp', 1.5), P.get('n0', 0.15)
def grow(root, u, Lmul, kind):
    q, n0 = scalp(root)
    top, front, back, low = region(q)
    up = np.array([0, 1.0, 0])
    lift = P['lift'] * sm(EY + 0.085, EY + 0.045, root[1]) * front * (1 if kind != 'line' else 0.6)
    c0 = comb(q, n0)
    d = up * lift * PRM_UP + n0 * PRM_N0 + c0
    d /= np.linalg.norm(d)
    rot = rng.normal(0, P['combJit'])
    seed = rng.random(3) * 100
    L = length(q) * Lmul
    st = 0.0015; p = root + n0 * 0.0004; pts = [p.copy()]; s = 0
    while s < L:
        q, n = scalp(p)
        h = np.dot(p - q, n)
        H = thick(q)
        ht = u * H * (1 - P.get('tuck', 0.35) * sm(0.45, 1.0, s / L))
        # (the front lifts higher near its root: the quiff)
        c = comb(q, n)
        b = np.cross(n, c); c = c * math.cos(rot) + b * math.sin(rot)
        nzv = noise.noise_vector(Vector(p * P['nfreq']) + Vector(seed * P.get('clumpSeed', 0.02)))
        nz = np.array(nzv[:]); nz -= n * np.dot(nz, n)
        err = np.clip((ht - h) / max(H, 0.006), -1, 1)
        d = d * P['inertia'] + c * P['combW'] + n * err * P['hW'] + nz * P['tousle']
        d /= np.linalg.norm(d)
        p = p + d * st
        q2, n2 = scalp(p); h2 = np.dot(p - q2, n2)
        if h2 < 0.0012: p = p + n2 * (0.0012 - h2)
        pts.append(p.copy()); s += st
    return np.array(pts)

def resample(pts, k):
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1); t = np.concatenate([[0], np.cumsum(seg)]); t /= t[-1]
    tt = np.linspace(0, 1, k)
    return np.stack([np.interp(tt, t, pts[:, c]) for c in range(3)], 1)

cards = []
def make(kind, n, uLo, uHi, wLo, wHi, Lm, band=None):
    roots = sample_roots(n, band)
    for r in roots:
        u = rng.uniform(uLo, uHi)
        pts = resample(grow(r, u, rng.uniform(*Lm), kind), P['segs'] + 1)
        ns = np.array([scalp(p)[1] for p in pts])
        cards.append(dict(kind=kind, u=u, w=rng.uniform(wLo, wHi), pts=pts, ns=ns))
    print(kind, len(roots))

for spec in P['classes']:
    make(spec['kind'], spec['n'], spec['u'][0], spec['u'][1], spec['w'][0], spec['w'][1], spec['L'], spec.get('band'))

np.savez(D + '/groom.npz', kind=np.array([c['kind'] for c in cards]), u=np.array([c['u'] for c in cards]), w=np.array([c['w'] for c in cards]),
         pts=np.array([c['pts'] for c in cards]), ns=np.array([c['ns'] for c in cards]))
print('cards', len(cards))

# (debug: how far the hair stands off the scalp, by region)
hs = {}
for c in cards:
    for p in c['pts'][::2]:
        q, n = scalp(p); h = float(np.dot(p - q, n)); top, front, back, low = region(q)
        k = 'front' if front > 0.6 and top > 0.5 else 'crown' if top > 0.5 and back < 0.4 else 'backtop' if top > 0.3 else 'side/back'
        hs.setdefault(k, []).append(h)
for k, v in hs.items(): print('height', k, len(v), 'p50 %.1f p90 %.1f p99 %.1f mm' % tuple(np.percentile(v, [50, 90, 99]) * 1000))
