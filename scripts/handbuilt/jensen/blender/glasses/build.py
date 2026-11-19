# Jensen's glasses: a thin gunmetal browline / semi-rimless frame, built procedurally and fitted to his head.
# Run: Blender -b --python build.py -- [--render front,34,profile,eyes] [--samples N] [--tag NN] [--glb in.glb]
# All geometry is authored in the GLB's bind space (Blender Z-up here; glTF Y-up on export), fitted from the head's
# own eyes, nose and skull side (ray casts), so a rerun on a changed head refits it.
import sys, os, math, json, bpy, bmesh, mathutils, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import scene as S
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None):
    return argv[argv.index(k) + 1] if k in argv else d
RENDER = [v for v in (arg('--render', '') or '').split(',') if v]
SAMPLES = int(arg('--samples', '96')); TAG = arg('--tag', '01'); GLB = arg('--glb', S.GLB)
SHOTS = os.path.join(HERE, '..', '..', 'shots', 'blender')

# ---------------------------------------------------------------- parameters (metres)
K = dict(
    W=0.0550, H=0.0235,          # lens box (A x B): a slim, wide rectangle (it2: 3.5 mm less tall below)
    DBL=0.0190,                  # distance between lenses (bridge)
    rTN=0.0030, rTT=0.0040,      # corner radii: top-nasal, top-temporal
    rBN=0.0085, rBT=0.0095,      # bottom-nasal, bottom-temporal (his lenses soften at the bottom corners)
    botBow=0.0008,               # the bottom edge bows down a little at its middle
    nasalSlant=0.0016,           # the nasal side leans in toward the top (lens narrower at the bottom by the nose)
    topRise=0.0009,              # it2: the top edge (and the bar on it) sweeps up a little toward the temple
    thick=0.0019, R=0.135,       # lens thickness; front base curve radius (about a base-4 curve)
    wrap=math.radians(5.5), tilt=math.radians(8.0),
    vertex=0.0125,               # cornea to lens back at the pupil
    topAbovePupil=0.0074,        # lens top edge above the pupil centre (it2: frame dropped 2.7 mm off the brows)
    barH0=0.0015, barH1=0.0019, barD0=0.0013, barD1=0.0015, barOverlap=0.0005,   # it2: ~30% thinner
    templeW=0.00125, templeH0=0.0024, templeH1=0.0015, tipR=0.00125,
    clear=0.0022,                # temple to skin clearance
)

# ---------------------------------------------------------------- the head
o = S.load_head(GLB); me = o.data; mats = [m.name for m in me.materials]
V = [v.co.copy() for v in me.vertices]
def faces_of(*names):
    ids = {mats.index(n) for n in names if n in mats}
    return [list(p.vertices) for p in me.polygons if p.material_index in ids]
skinF = faces_of('skin'); bvh = BVHTree.FromPolygons(V, skinF)
co = np.array([v[:] for v in V]); ev = np.array(sorted({i for f in faces_of('eyes') for i in f})); E = co[ev]
def sphere(P):
    A = np.c_[2 * P, np.ones(len(P))]; b = (P ** 2).sum(1); c = np.linalg.lstsq(A, b, rcond=None)[0]
    return c[:3], math.sqrt(c[3] + c[:3] @ c[:3])
eyes = {s: sphere(E[E[:, 0] * s > 0]) for s in (1, -1)}
eyeC = (eyes[1][0] + eyes[-1][0]) / 2; eyeR = (eyes[1][1] + eyes[-1][1]) / 2
ipd = eyes[1][0][0] - eyes[-1][0][0]
corneaY = E[:, 1].min()             # the corneas' front (the face looks down -Y)
pupilZ = eyeC[2]
def skullX(y, z, s=1):
    h = bvh.ray_cast(Vector((0, y, z)), Vector((s, 0, 0)))
    return abs(h[0].x) if h[0] else None
def outerX(y, z, s=1):   # the first skin met coming in from outside (the ear, where there is one)
    h = bvh.ray_cast(Vector((s * 0.2, y, z)), Vector((-s, 0, 0)))
    return abs(h[0].x) if h[0] else None
# the ear's top: the highest point where the side of the head bulges out past the skull above it
earTop = None
for y in np.arange(-0.065, -0.012, 0.0025):
    ref = outerX(y, 1.665) or 0.08
    for z in np.arange(1.665, 1.59, -0.001):
        x = outerX(y, z)
        if x and x > ref + 0.0045 and x > 0.084:
            if earTop is None or z > earTop[1]: earTop = (y, z, x)
            break
if earTop is None: earTop = (-0.038, 1.632, 0.09)
print('FIT eyes', np.round(eyeC, 4), 'r', round(eyeR, 4), 'ipd', round(ipd * 1000, 1), 'mm cornea y', round(corneaY, 4), 'earTop', np.round(earTop, 4))

# ---------------------------------------------------------------- the lens outline (2D, u outward from nose, v up)
def outline(n=160):
    W, H = K['W'], K['H']; x0, x1, y0, y1 = -W / 2, W / 2, -H / 2, H / 2
    # corners (centre, radius, start angle, end angle), going counter-clockwise from the bottom middle
    pts = []
    def arc(cx, cy, r, a0, a1, m=18):
        for i in range(m + 1):
            a = a0 + (a1 - a0) * i / m; pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    rBT, rTT, rTN, rBN = K['rBT'], K['rTT'], K['rTN'], K['rBN']
    arc(x1 - rBT, y0 + rBT, rBT, -math.pi / 2, 0)
    arc(x1 - rTT, y1 - rTT, rTT, 0, math.pi / 2)
    arc(x0 + rTN, y1 - rTN, rTN, math.pi / 2, math.pi)
    arc(x0 + rBN, y0 + rBN, rBN, math.pi, 1.5 * math.pi)
    P = np.array(pts)
    # resample evenly along the length
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.r_[P, P[:1]], axis=0), axis=1))]
    t = np.linspace(0, seg[-1], n, endpoint=False); Pc = np.r_[P, P[:1]]
    Q = np.c_[np.interp(t, seg, Pc[:, 0]), np.interp(t, seg, Pc[:, 1])]
    # shaping: the bottom bows down, the nasal side leans (lens narrower by the nose at the bottom)
    u, v = Q[:, 0], Q[:, 1]
    bot = np.clip((-v) / (H / 2), 0, 1) ** 3
    v = v - K['botBow'] * bot * np.clip(1 - (u / (W / 2)) ** 2, 0, 1)
    nas = np.clip(-u / (W / 2), 0, 1) ** 2
    u = u + K['nasalSlant'] * nas * (0.5 - (v + H / 2) / H)
    # the browline's upswept outer end: the top rises smoothly toward the temple (fades out to nothing at the bottom)
    g = np.clip((u + W / 2) / W, 0, 1); g = g * g * (3 - 2 * g); g = g ** 1.6
    v = v + K['topRise'] * g * np.clip((v + H / 2) / H, 0, 1) ** 2
    global TOPMASK
    TOPMASK = Q[:, 1] > H / 2 - 0.0026
    return np.c_[u, v]

# lens-local (u: outward, v: up, w: back toward the face from the lens front) -> world, per side s
cx = K['DBL'] / 2 + K['W'] / 2
yF = corneaY - K['vertex'] - K['thick']          # the lens front at its centre
zC = pupilZ + K['topAbovePupil'] - K['H'] / 2      # the lens box's centre height
pivot = Vector((0, yF, zC))
tiltM = Matrix.Rotation(K['tilt'], 4, 'X')
def L2W(s, u, v, w):
    sag = K['R'] - math.sqrt(max(0.0, K['R'] ** 2 - u * u - v * v))
    d = sag + w; c, sn = math.cos(K['wrap']), math.sin(K['wrap'])
    # wrap: the lens turns about its centre's vertical so its temporal side goes back
    x = s * (cx + u * c - d * sn); y = yF + u * sn + d * c
    p = Vector((x, y, zC + v))
    return pivot + tiltM @ (p - pivot)
def sideW(s, u, v):  # unit vectors at a lens point: outward-in-plane du, dv, and back (face-ward) normal
    e = 1e-4; p = L2W(s, u, v, 0)
    du = (L2W(s, u + e, v, 0) - p).normalized(); dv = (L2W(s, u, v + e, 0) - p).normalized()
    n = (L2W(s, u, v, 1e-3) - p).normalized(); return du, dv, n

# ---------------------------------------------------------------- mesh helpers
parts = {}   # material -> list of (verts, faces)
def add(mat, Vs, Fs):
    parts.setdefault(mat, []).append((Vs, Fs))
def catmull(P, n):
    P = [Vector(p) for p in P]; P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    seg = [ (P[i + 1] - P[i]).length for i in range(1, len(P) - 2) ]; tot = sum(seg); out = []
    for k in range(n):
        t = k / (n - 1) * tot; i = 0
        while i < len(seg) - 1 and t > seg[i]: t -= seg[i]; i += 1
        f = t / seg[i] if seg[i] else 0; p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        f2, f3 = f * f, f * f * f
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3))
    return out
def sweep(mat, path, dims, hint, m=12, p=2.6, caps=(True, True), hintMode='up', offset=None):
    """path: list of Vector; dims(t)->(a lateral half, b vertical half); a superellipse profile (p) on frames
    built from a hint (an 'up' vector or a 'side' vector, per point if callable)."""
    n = len(path); Vs, Fs = [], []; frames = []
    for i in range(n):
        T = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        h = hint(i / (n - 1)) if callable(hint) else Vector(hint)
        if hintMode == 'up':
            U = (h - h.dot(T) * T).normalized(); Sd = T.cross(U).normalized()
        else:
            Sd = (h - h.dot(T) * T).normalized(); U = Sd.cross(T).normalized()
        frames.append((T, U, Sd))
    for i in range(n):
        T, U, Sd = frames[i]; a, b = dims(i / (n - 1)); c = path[i]
        if offset: c = c + offset(i / (n - 1), T, U, Sd)
        for j in range(m):
            th = 2 * math.pi * j / m; ct, st = math.cos(th), math.sin(th)
            x = a * math.copysign(abs(ct) ** (2 / p), ct); y = b * math.copysign(abs(st) ** (2 / p), st)
            Vs.append(c + Sd * x + U * y)
    for i in range(n - 1):
        for j in range(m):
            a0, a1 = i * m + j, i * m + (j + 1) % m; Fs.append((a0, a1, a1 + m, a0 + m))
    for end, flag in ((0, caps[0]), (n - 1, caps[1])):
        if not flag: continue
        T, U, Sd = frames[end]; a, b = dims(end / (n - 1)); c0 = path[end] + (offset(end / (n - 1), T, U, Sd) if offset else Vector())
        # a domed cap: two rings stepping in, then a centre point
        base = len(Vs); sgn = -1 if end == 0 else 1
        for k, (sc, dz) in enumerate(((0.72, 0.35), (0.32, 0.62))):
            for j in range(m):
                th = 2 * math.pi * j / m; ct, st = math.cos(th), math.sin(th)
                x = a * sc * math.copysign(abs(ct) ** (2 / p), ct); y = b * sc * math.copysign(abs(st) ** (2 / p), st)
                Vs.append(c0 + Sd * x + U * y + T * sgn * dz * min(a, b))
        Vs.append(c0 + T * sgn * 0.75 * min(a, b)); ctr = len(Vs) - 1
        rings = [end * m, base, base + m]
        for r0, r1 in zip(rings[:-1], rings[1:]):
            for j in range(m):
                q = (r0 + j, r0 + (j + 1) % m, r1 + (j + 1) % m, r1 + j); Fs.append(q if end else q[::-1])
        for j in range(m):
            t = (base + m + j, base + m + (j + 1) % m, ctr); Fs.append(t if end else t[::-1])
    add(mat, Vs, Fs)

# ---------------------------------------------------------------- lenses
OL = outline(128); N = len(OL)
def lens(s):
    Vs, Fs = [], []; ctr = OL.mean(0)
    inset, ch = 0.00028, 0.00028            # the polished edge's small chamfer
    rings = [1.0, 0.985, 0.95, 0.86, 0.68, 0.44, 0.18]
    def ringpts(scale, inset_):
        out = []
        for k in range(N):
            q = OL[k]; d = q - ctr; L = np.linalg.norm(d); q2 = ctr + d * scale
            if inset_: q2 = q2 - d / L * inset_
            out.append(q2)
        return out
    def surf(w, front):
        start = len(Vs)
        for ri, sc in enumerate(rings):
            for q in ringpts(sc, inset if ri == 0 else 0):
                Vs.append(L2W(s, q[0] * 1, q[1], w))
        Vs.append(L2W(s, ctr[0], ctr[1], w)); c = len(Vs) - 1
        F = []
        for ri in range(len(rings) - 1):
            for k in range(N):
                a, b = start + ri * N + k, start + ri * N + (k + 1) % N
                F.append((a, b, b + N, a + N))
        last = start + (len(rings) - 1) * N
        for k in range(N): F.append((last + k, last + (k + 1) % N, c))
        # winding: the outline runs counter-clockwise seen from the front (u outward): mirror for s<0
        flip = (s < 0) != (not front)
        return [f[::-1] for f in F] if flip else F
    # u in OL is outward-positive for the lens on side s: L2W multiplies by s
    Ff = surf(0.0, True); Fb = surf(K['thick'], False)
    add('glasses-lens', Vs, Ff + Fb)
    # the edge: chamfer front, flat edge band, chamfer back (its own material: a polished rimless edge)
    Ve, Fe = [], []
    rows = [(0.0, inset), (ch, 0.0), (K['thick'] - ch, 0.0), (K['thick'], inset)]
    for (w, ins) in rows:
        for q in ringpts(1.0, ins): Ve.append(L2W(s, q[0], q[1], w))
    for r in range(3):
        for k in range(N):
            a, b = r * N + k, r * N + (k + 1) % N
            f = (a, a + N, b + N, b); Fe.append(f if s > 0 else f[::-1])
    add('glasses-lens-edge', Ve, Fe)
for s in (1, -1): lens(s)

# ---------------------------------------------------------------- top bars, endpieces, hinges
H, W = K['H'], K['W']
top = [q for q, t in zip(OL, TOPMASK) if t]
top.sort(key=lambda q: q[0])
hinge = {}
for s in (1, -1):
    # the bar's path along the lens's top edge, lifted so its underside grips the lens by barOverlap
    pts = []
    for q in top[::2]:
        f = (q[0] + W / 2) / W
        h = K['barH0'] + (K['barH1'] - K['barH0']) * f
        pts.append((q[0], q[1] + h / 2 - K['barOverlap']))
    pts = [(pts[0][0] - 0.0006, pts[0][1] - 0.0003)] + pts
    u_end, v_end = pts[-1]
    dmid = K['thick'] * 0.45
    P = [L2W(s, u, v, dmid) for u, v in pts]
    # the endpiece: out past the lens, then turning straight back to the hinge
    du, dv, dn = sideW(s, u_end, v_end)
    e0 = P[-1]
    hingeP = e0 + du * 0.0067 + dn * 0.0068 - dv * 0.0004
    endP = [e0 + du * 0.0030 + dn * 0.0003, e0 + du * 0.0054 + dn * 0.0020, e0 + du * 0.0065 + dn * 0.0044, hingeP]
    path = catmull(P + endP, 90)
    nb = len(P) / (len(P) + len(endP))
    def dims(t, nb=nb):
        f = min(1, t / nb); h = K['barH0'] + (K['barH1'] - K['barH0']) * f; d = K['barD0'] + (K['barD1'] - K['barD0']) * f
        if t > nb:  # the endpiece swells a touch into the hinge lug
            g = (t - nb) / (1 - nb); h = h + 0.0006 * g; d = d - 0.0002 * g
        return (d / 2, h / 2)
    upv = (tiltM @ Vector((0, 0, 1)).to_4d()).to_3d()
    sweep('glasses-metal', path, dims, upv, m=14, p=3.2)
    hinge[s] = (hingeP, du, dv, dn)
    # the hinge barrel: a short vertical cylinder at the lug's end, with a screw head on top
    bc = hingeP + du * 0.0003 + dn * 0.0004
    axis = dv
    bar = [bc - axis * 0.0019, bc + axis * 0.0019]
    sweep('glasses-metal', catmull(bar, 6), lambda t: (0.00105, 0.00105), du, m=14, p=2.0, hintMode='side')
    sweep('glasses-metal', catmull([bc + axis * 0.0019, bc + axis * 0.00235], 3), lambda t: (0.0008, 0.0008), du, m=12, p=2.0, hintMode='side')
    # the lens screw/mount behind the bar's nasal end (a tiny block holding the lens) and the pad arm's root
def barNasal(s):
    u, v = top[0][0] - 0.0006, top[0][1] + K['barH0'] / 2 - K['barOverlap'] - 0.0003
    return L2W(s, u, v, K['thick'] * 0.45), (u, v)

# ---------------------------------------------------------------- the bridge: a fine double-curved bar between the bars' nasal ends
bL, _ = barNasal(1); bR, _ = barNasal(-1)
mid = (bL + bR) / 2
upv = (tiltM @ Vector((0, 0, 1)).to_4d()).to_3d()
fwd = (tiltM @ Vector((0, -1, 0)).to_4d()).to_3d()
# it2: a small STRAIGHT bridge bar, the bar's own flattened section a touch slimmer, flaring into the bars' nasal ends
bp = [bR + (bL - bR) * f for f in np.linspace(0, 1, 9)]
sweep('glasses-metal', bp, lambda t: (0.00058 + 0.00012 * abs(2 * t - 1) ** 4, 0.00068 + 0.00012 * abs(2 * t - 1) ** 4), upv, m=12, p=3.0)

# ---------------------------------------------------------------- nose pads on adjustable arms, seated on the nose's sides
padInfo = {}
for s in (1, -1):
    zp = pupilZ - 0.0075
    hit = None
    for xo in np.arange(0.006, 0.016, 0.0005):
        h = bvh.ray_cast(Vector((s * xo, -0.25, zp)), Vector((0, 1, 0)))
        if h[0] is None: continue
        nrm = h[1]
        if abs(nrm.x) > 0.5: hit = (h[0], nrm); break   # the nose's side, where it faces out about 25+ degrees
    if hit is None: h = bvh.ray_cast(Vector((s * 0.009, -0.25, zp)), Vector((0, 1, 0))); hit = (h[0], h[1])
    pc, pn0 = hit; pn0 = pn0.normalized()
    pn = (pn0 + Vector((s * 0.55, 0.05, 0))).normalized()   # pads stand more upright on the nose than this flat bridge's skin
    padC = pc + pn0 * 0.0011
    for _ in range(40):   # push the pad out along the skin normal until its whole rim clears the skin
        ax_ = Vector((0, 0, 1)); ax_ = (ax_ - ax_.dot(pn) * pn).normalized(); bx_ = pn.cross(ax_).normalized(); worst = 1
        for j in range(16):
            th = 2 * math.pi * j / 16; q = padC + ax_ * 0.004 * math.cos(th) + bx_ * 0.0024 * math.sin(th) - pn * 0.0005
            r = bvh.find_nearest(q)
            if r[0] is not None: worst = min(worst, (q - r[0]).dot(r[1]))
        if worst > 0.0002: break
        padC = padC + pn0 * 0.0002
    # the pad: a soft oval 11 x 6.5 mm, 1.5 mm thick, lying on the nose (long axis nearly vertical, leaning in at the top)
    ax = Vector((0, 0, 1)); ax = (ax - ax.dot(pn) * pn).normalized(); ax = (ax + Vector((-s * 0.18, 0, 0))).normalized(); ax = (ax - ax.dot(pn) * pn).normalized()
    bx = pn.cross(ax).normalized()
    Vs, Fs = [], []; m = 24; rings = [(1.0, 0.0), (0.92, 0.55), (0.62, 0.95), (0.0, 1.0)]
    for side in (1, -1):
        base = len(Vs)
        for r, hgt in rings:
            for j in range(m):
                th = 2 * math.pi * j / m
                Vs.append(padC + ax * (0.0040 * r * math.cos(th)) + bx * (0.0024 * r * math.sin(th)) + pn * (side * 0.0006 * hgt))
        for ri in range(len(rings) - 1):
            for j in range(m):
                a, b = base + ri * m + j, base + ri * m + (j + 1) % m
                f = (a, b, b + m, a + m); Fs.append(f if side > 0 else f[::-1])
        if side > 0: ring0 = base
        else: ring1 = base
    # (the two halves share their rim ring position: weld by merging later)
    add('glasses-pads', Vs, Fs)
    # it2: no metal pad arms. The clear pad is held by a short clear stem off the lens's back, just inside its nasal
    # edge, so from the front it sits tucked behind the lens edge (no wire between the eyes)
    du, dv, dn = sideW(s, -K['W'] / 2, 0)
    vP = (padC.z - zC) / math.cos(K['tilt']); uN = -K['W'] / 2 + K['nasalSlant'] * (0.5 - (vP + K['H'] / 2) / K['H']) + 0.0024
    root = L2W(s, uN, vP, K['thick'] - 0.0002)
    padBack = padC + pn * 0.0005
    sweep('glasses-pads', catmull([root, root + (padBack - root) * 0.5 + dn * 0.0004, padBack], 8), lambda t: (0.00065, 0.00055), Vector((s, 0, 0)), m=10, p=2.2, hintMode='side')
    padInfo[s] = dict(center=list(padC), normal=list(pn))

# ---------------------------------------------------------------- temples: hinge, back along the head clear of the skin, over the ear, down behind it
tipInfo = {}
for s in (1, -1):
    hp, du, dv, dn = hinge[s]
    hp2 = hp + du * 0.0003
    ey, ez, ex = earTop
    zA = ez + 0.0022
    def clearX(y, z, outer=True):
        best = 0
        for dz in ((-0.0012, 0, 0.002) if outer else (-0.003, 0, 0.003)):
            x = (outerX if outer else skullX)(y, z + dz, s)
            if x: best = max(best, x)
        return best + K['clear'] + K['templeW'] / 2
    pts = [hp2, hp2 + dn * 0.006]
    ys = np.linspace(hp2.y + 0.016, ey - 0.002, 7)
    for i, y in enumerate(ys):
        f = (y - ys[0]) / (ys[-1] - ys[0])
        z = (hp2.z - 0.0005) * (1 - f) + zA * f
        x = max(clearX(y, z), abs(hp2.x) + 0.0035 * f)
        pts.append(Vector((s * x, y, z)))
    # it2: over the ear's root (where the helix joins the head) and straight DOWN behind the pinna, tucked into the
    # crease between ear and skull so the pinna hides the bend and the tip from the side; nothing runs on past the ear.
    def tuckX(z):   # the skull just behind the ear (pure skull there) plus a little clearance
        x = skullX(ey + 0.0165, z, s) or skullX(ey + 0.02, z, s) or 0.078
        return x + 0.0008 + K['templeW'] / 2
    for (dy, dz, w) in ((0.0036, -0.0004, 0.30), (0.0064, -0.0030, 0.80), (0.0080, -0.0080, 1.0), (0.0088, -0.0150, 1.0),
                        (0.0086, -0.0235, 1.0), (0.0074, -0.0315, 1.0)):
        y, z = ey + dy, zA + dz
        x = clearX(y, z) * (1 - w) + tuckX(z) * w
        pts.append(Vector((s * x, y, z)))
    path = catmull(pts, 120)
    # length along, for the tip sleeve
    L = [0];
    for i in range(1, len(path)): L.append(L[-1] + (path[i] - path[i - 1]).length)
    tot = L[-1]; tipStart = tot - 0.030
    k0 = next(i for i, l in enumerate(L) if l >= tipStart)
    def tdims(t, tot=tot):
        l = t * tot; f = min(1, l / 0.03)
        h = K['templeH0'] + (K['templeH1'] - K['templeH0']) * f
        return (K['templeW'] / 2 * (1 - 0.15 * f), h / 2)
    sweep('glasses-metal', path[:k0 + 2], lambda t: tdims(t * L[k0 + 1] / tot), Vector((s, 0, 0)), m=12, p=2.8, hintMode='side', caps=(True, True))
    # the temple tip: a slim dark acetate sleeve over the bend, thicker, rounded at the end
    tip = path[k0 - 2:]
    sweep('glasses-tips', tip, lambda t: (K['tipR'] * (0.9 + 0.2 * math.sin(math.pi * min(1, t * 1.2))), K['tipR'] * (1.0 + 0.25 * math.sin(math.pi * min(1, t * 1.2)))), Vector((s, 0, 0)), m=14, p=2.2, hintMode='side')
    tipInfo[s] = dict(end=list(path[-1]), length_mm=round(tot * 1000, 1))

# ---------------------------------------------------------------- build the object
gl = bpy.data.objects.new('glasses', bpy.data.meshes.new('glasses')); bpy.context.collection.objects.link(gl)
bm = bmesh.new(); matIndex = {}
order = ['glasses-metal', 'glasses-lens', 'glasses-lens-edge', 'glasses-pads', 'glasses-tips']
for mi, name in enumerate(order):
    for Vs, Fs in parts.get(name, []):
        vv = [bm.verts.new(v) for v in Vs]
        for f in Fs:
            try: bm.faces.new([vv[i] for i in f]).material_index = mi
            except ValueError: pass
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.normal_update()
bm.to_mesh(gl.data); bm.free()
for name in order:
    m = bpy.data.materials.new(name); gl.data.materials.append(m)
for p in gl.data.polygons: p.use_smooth = True
# sharp edges: crease the lens rim from the edge band and the metal's cap rims
bpy.context.view_layer.objects.active = gl; gl.select_set(True)
try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
except Exception as ex: print('smooth', ex)

# the origin: the frame's centre (between the bars' nasal ends, at the lens front) so the node is easy to nudge
origin = Vector(((bL + bR) / 2))
gl.data.transform(Matrix.Translation(-origin)); gl.location = origin

# ---------------------------------------------------------------- export materials (engine-friendly: no transmission)
def principled(m):
    m.use_nodes = True; return m.node_tree.nodes['Principled BSDF']
def setp(m, base, metal, rough, alpha=1.0, extra=None):
    b = principled(m); b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough; b.inputs['Alpha'].default_value = alpha
    if extra: extra(b)
    m.use_backface_culling = True   # every piece is a closed solid: single-sided in glTF
    if alpha < 1:
        try: m.surface_render_method = 'BLENDED'
        except Exception: m.blend_method = 'BLEND'
M = {n: bpy.data.materials[n] for n in order}
def ar(b):  # anti-reflection coating: a faint thin-film sheen (exports as KHR_materials_iridescence)
    try:
        b.inputs['Thin Film Thickness'].default_value = 280; b.inputs['Thin Film IOR'].default_value = 1.38
    except Exception as ex: print('thin film', ex)
setp(M['glasses-metal'], (0.15, 0.155, 0.165), 1.0, 0.30)   # it2: gunmetal, not black
setp(M['glasses-lens'], (0.08, 0.085, 0.09), 0.0, 0.03, 0.10, ar)
setp(M['glasses-lens-edge'], (0.80, 0.84, 0.84), 0.0, 0.08, 0.42)   # it2: a faint polished edge highlight
setp(M['glasses-pads'], (0.42, 0.44, 0.46), 0.0, 0.25, 0.22)   # (as parts.mjs sets them: faint grey, mostly clear)
setp(M['glasses-tips'], (0.035, 0.036, 0.04), 0.0, 0.38)

# ---------------------------------------------------------------- report the fit
dep = bpy.context.evaluated_depsgraph_get()
gv = np.array([ (gl.matrix_world @ v.co)[:] for v in gl.data.vertices])
w = gv[:, 0].max() - gv[:, 0].min()
mv = np.array([(gl.matrix_world @ gl.data.vertices[i].co)[:] for i in {v for p in gl.data.polygons if p.material_index == 0 for v in p.vertices}])
front = [q for q in mv if q[1] < yF + 0.0105]
fw = (max(q[0] for q in front) - min(q[0] for q in front)) if front else 0
# minimum skin distance per material
def mind(mi):
    vs = {v for p in gl.data.polygons if p.material_index == mi for v in p.vertices}; best = (9, None)
    for i in vs:
        p = gl.matrix_world @ gl.data.vertices[i].co; r = bvh.find_nearest(p)
        if r[0] is not None:
            d = (p - r[0]).length; inside = (p - r[0]).dot(r[1]) < 0
            if inside: d = -d
            if d < best[0]: best = (d, tuple(round(c, 4) for c in p))
    return best
fit = dict(
    frame_width_mm=round(fw * 1000, 1), overall_width_mm=round(w * 1000, 1), tris=sum(len(p.vertices) - 2 for p in gl.data.polygons),
    lens_mm=[round(K['W'] * 1000, 1), round(K['H'] * 1000, 1)], dbl_mm=K['DBL'] * 1000, ipd_mm=round(ipd * 1000, 1),
    origin_bind_blender=[round(c, 6) for c in origin], ear_top=[round(c, 4) for c in earTop], pads=padInfo, tips=tipInfo,
    min_skin_mm={n: (round(mind(i)[0] * 1000, 2), mind(i)[1]) for i, n in enumerate(order)},
    lens_top_z=round(max(q[2] for q in gv if True), 4), pupilZ=round(pupilZ, 4),
)
print('FIT', json.dumps(fit, default=str))
json.dump(fit, open(os.path.join(HERE, 'fit.json'), 'w'), indent=1, default=str)

# ---------------------------------------------------------------- export the GLB (glasses only)
for ob in bpy.context.scene.objects: ob.select_set(False)
gl.select_set(True); bpy.context.view_layer.objects.active = gl
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, 'glasses.glb'), use_selection=True, export_format='GLB',
                          export_apply=True, export_yup=True, export_materials='EXPORT', export_normals=True,
                          export_texcoords=False, export_tangents=False, export_skins=False, export_morph=False, export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'glasses-on-head.blend'))

# ---------------------------------------------------------------- renders (Cycles, physically based glass for the preview)
if RENDER:
    lm = bpy.data.materials.new('render-lens'); lm.use_nodes = True; nt = lm.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1, 1, 1, 1); b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.0; b.inputs['IOR'].default_value = 1.12   # it2: no thin film in the preview (its sheen hid the outer eye corner)
    out = nt.nodes['Material Output']; lp = nt.nodes.new('ShaderNodeLightPath'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mx.inputs['Fac']); nt.links.new(b.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    em = bpy.data.materials.new('render-edge'); em.use_nodes = True; be = em.node_tree.nodes['Principled BSDF']
    be.inputs['Base Color'].default_value = (0.9, 0.94, 0.93, 1); be.inputs['Transmission Weight'].default_value = 0.8; be.inputs['Roughness'].default_value = 0.05; be.inputs['IOR'].default_value = 1.5
    pm = bpy.data.materials.new('render-pads'); pm.use_nodes = True; bp_ = pm.node_tree.nodes['Principled BSDF']
    bp_.inputs['Base Color'].default_value = (0.95, 0.95, 0.9, 1); bp_.inputs['Transmission Weight'].default_value = 1.0; bp_.inputs['Roughness'].default_value = 0.18; bp_.inputs['IOR'].default_value = 1.4
    gl.data.materials[1] = lm; gl.data.materials[2] = em; gl.data.materials[3] = pm
    if '--hide' in argv: gl.hide_render = True   # (debug: the head alone)
    S.world(0.45); S.lights(); S.render_setup('CYCLES', SAMPLES)
    Vw = S.views()
    for k in RENDER:
        loc, t, lens_ = Vw[k]; c = S.camera(k, loc, t, lens_); bpy.context.scene.camera = c
        if k == 'eyes': bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 1280, 720
        else: bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 720, 720
        bpy.context.scene.render.filepath = os.path.join(HERE, 'r-%s-%s.jpg' % (TAG, k))
        bpy.ops.render.render(write_still=True)
