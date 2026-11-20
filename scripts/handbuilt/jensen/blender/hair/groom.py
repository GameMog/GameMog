# Jensen hair groom v2: card guides grown over his scalp (prep.blend's skin, bind space) in shells, saved as groom.npz.
# Each guide rises steeply off its root to its shell's height (u x the target standoff H), then lies along that shell in
# the comb direction (up and back at the front: the quiff; straight back over the crown; back and a little up at the
# sides; down at the back), and its tip tucks under the shell above it, so the silhouette is made of card bodies, never tips.
# All maths in glTF space (Y up, +Z forward, metres): gl = (bx, bz, -by) of the body's local Blender coords.
# Run: Blender -b prep.blend --python groom.py -- <dir>
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
exec(open(D + '/groom_fields.py').read())

body = max([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: len(o.data.vertices))
me = body.data
skin_idx = [i for i, m in enumerate(me.materials) if m and m.name == 'skin']
V = np.array([v.co[:] for v in me.vertices]); V = np.stack([V[:, 0], V[:, 2], -V[:, 1]], 1)
NV = np.array([v.normal[:] for v in me.vertices]); NV = np.stack([NV[:, 0], NV[:, 2], -NV[:, 1]], 1)
me.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in me.loop_triangles if t.material_index in skin_idx])
cent = V[tris].mean(1)
tris = tris[(cent[:, 1] > EY - 0.085) & (cent[:, 2] < EZ + 0.05)]
hv = np.unique(tris)
kd = kdtree.KDTree(len(hv))
for i, v in enumerate(hv): kd.insert(V[v], i)
kd.balance()

def scalp(p):
    w = 0; q = np.zeros(3); n = np.zeros(3)
    for co, i, d in kd.find_n(p, 6):
        ww = 1.0 / (d + 0.002); w += ww; q += np.array(co) * ww; n += NV[hv[i]] * ww
    return q / w, n / np.linalg.norm(n)

def comb(q, n, x0):
    top, front, back, low = region(q)
    sx = math.copysign(1, x0) if abs(x0) > 1e-4 else 0
    # (front/top: straight back with a slight outward splay off the middle; sides: back and a little up; back: down)
    ct = np.array([sx * P['splay'] * sm(0.0, 0.05, abs(q[0])), 0, -1.0])
    cs = np.array([0, P['sideUp'], -1.0])
    cb = np.array([sx * 0.15, -1.0, -0.25])
    c = cs * (1 - top) + ct * top
    wb = back * (1 - P['backTop'] * top)
    c = c * (1 - wb) + cb * wb
    c = c - n * np.dot(c, n); L = np.linalg.norm(c)
    return c / L if L > 1e-6 else np.array([0, 0, -1.0])

A = np.linalg.norm(np.cross(V[tris[:, 1]] - V[tris[:, 0]], V[tris[:, 2]] - V[tris[:, 0]]), axis=1) / 2
cdf = np.cumsum(A) / A.sum()
def sample_roots(n, band=None, minsep=0.0):
    out = []
    while len(out) < n:
        k = np.searchsorted(cdf, rng.random(4096)); r1, r2 = rng.random(4096), rng.random(4096); s = np.sqrt(r1)
        pts = V[tris[k, 0]] * (1 - s)[:, None] + V[tris[k, 1]] * (s * (1 - r2))[:, None] + V[tris[k, 2]] * (s * r2)[:, None]
        for p in pts:
            m = hair_area(p[0], p[1], p[2], noise.noise(Vector(p * 90)))
            if band:
                if not (band[0] < m < band[1] and rng.random() < 0.85): continue
            elif rng.random() >= m ** 1.5: continue
            if minsep and out and np.min(np.linalg.norm(np.array(out[-400:]) - p, axis=1)) < minsep: continue
            out.append(p)
            if len(out) >= n: break
    return np.array(out)

def grow(root, u, Lmul, kind):
    q, n0 = scalp(root)
    top, front, back, low = region(q)
    L = length(q) * Lmul
    up = np.array([0, 1.0, 0])
    # (the quiff: the front's roots stand up hard, then roll back)
    lift = P['lift'] * sm(EY + 0.09, EY + 0.05, root[1]) * front * (P['lineLift'] if kind == 'line' else 1)
    c0 = comb(q, n0, root[0])
    d = up * lift + n0 * (P['n0'] + P['n0Front'] * front * top * (kind != 'line')) + c0; d /= np.linalg.norm(d)
    # (a lock's flow: a coherent turn shared by its neighbours, and a little of its own)
    lock = noise.noise(Vector(root * P['lockFreq']) + Vector((5.1, 2.3, 7.7)))
    rot = lock * P['lockTurn'] + rng.normal(0, P['combJit'])
    seed = Vector(root * P['lockFreq'] * 0.7)
    rise = P['rise'] * (1 - P['riseFront'] * front * top)
    st = 0.0015; p = root + n0 * 0.0004; pts = [p.copy()]; s = 0
    while s < L:
        q, n = scalp(p)
        h = np.dot(p - q, n)
        H = thick(q)
        f = s / L
        ht = u * H * sm(0.0, rise, f) * (1 - P['tuck'] * sm(1 - P['tuckLen'], 1.0, f))
        c = comb(q, n, root[0])
        b = np.cross(n, c); c = c * math.cos(rot) + b * math.sin(rot)
        nz = np.array(noise.noise_vector(Vector(p * P['nfreq']) + seed)[:]); nz -= n * np.dot(nz, n)
        err = np.clip((ht - h) / max(H, 0.006), -1, 1)
        d = d * P['inertia'] + c * P['combW'] + n * err * P['hW'] + nz * P['tousle'] * (0.4 + 0.6 * u)
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
for spec in P['classes']:
    roots = sample_roots(spec['n'], spec.get('band'), spec.get('minsep', 0))
    for r in roots:
        u = rng.uniform(*spec['u'])
        pts = resample(grow(r, u, rng.uniform(*spec['L']), spec['kind']), P['segs'] + 1)
        ns = np.array([scalp(p)[1] for p in pts])
        cards.append(dict(kind=spec['kind'], u=u, w=rng.uniform(*spec['w']), pts=pts, ns=ns))
    print(spec['kind'], len(roots))

np.savez(D + '/groom.npz', kind=np.array([c['kind'] for c in cards]), u=np.array([c['u'] for c in cards]), w=np.array([c['w'] for c in cards]),
         pts=np.array([c['pts'] for c in cards]), ns=np.array([c['ns'] for c in cards]))
print('cards', len(cards))
hs = {}
for c in cards:
    for p in c['pts'][::2]:
        q, n = scalp(p); h = float(np.dot(p - q, n)); top, front, back, low = region(q)
        k = 'front' if front > 0.6 and top > 0.5 else 'crown' if top > 0.5 and back < 0.4 else 'backtop' if top > 0.3 else 'side/back'
        hs.setdefault(k, []).append(h)
for k, v in hs.items(): print('height', k, len(v), 'p50 %.1f p90 %.1f p99 %.1f mm' % tuple(np.percentile(v, [50, 90, 99]) * 1000))
