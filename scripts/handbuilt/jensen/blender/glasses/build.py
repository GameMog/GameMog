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
OUTDIR = arg('--out', HERE)

# ---------------------------------------------------------------- parameters (metres)
K = dict(
    # v3: a real-size frame (about 139 mm across the endpieces), slim wide rimless lenses, a straight browline
    W=None, H=0.0265,            # r3: shallower (art director: 28.5 read tall and boxy)
               # r2: 28.5 mm (the reference's lens is a touch deeper than 27)
               # lens box (A x B): W is solved from the frame width target; H 27 mm (slim and wide)
    FW=0.1400,                   # v3: frame width across the hinges' outsides (retail 138-142 mm)
    endpiece=0.0068,             # r3: a touch wider lens (the outer end nearer the hinge)
                # the lens's outer end sits this far inside FW/2 (the endpiece's run to the hinge)
    DBL=0.0180,                  # distance between lenses (bridge)
    rTN=0.0022, rTT=0.0030,      # corner radii: top-nasal, top-temporal (crisp browline corners)
    rBN=0.0090, rBT=0.0105,      # rounded lower corners (a gently rounded lower rim)
    botBow=0.0010,               # the bottom edge bows down a little at its middle
    nasalSlant=0.0018,           # the nasal side leans in toward the top
    topRise=0.0,                 # v3: the top is dead straight (the lens is also levelled in world space, see CORR)
    thick=0.0019, R=0.150,       # lens thickness; front base curve radius (about base 3.5)
    wrap=math.radians(9.0), tilt=math.radians(7.0),
    vertex=None,
    vertexMin=0.0105, lashClear=0.0015, skinClear=0.0025,
    topAboveLid=0.0021,          # r3: lifted 1.5 mm so the bar seats just under the brows (r2: 0.6)
             # the lens top sits just above the eye opening's top (the bar just above the eyes)
    barH0=0.0031, barH1=0.0034, barD0=0.0025, barD1=0.0028, barOverlap=0.0008,   # r2: the browline must read at game scale   # v3: near-uniform, straight
    bridgeH=0.0026, bridgeD=0.0021, bridgeNoseClear=0.0018,   # v3: a fine straight bridge, bowed FORWARD (plan) only
    bevel=0.0007,                # r3: a faint thin dark edge, not a bright outline (was 1.1)
                   # the polished front bevel round each lens (the in-game edge highlight)
    templeW=0.00175, templeH0=0.0032, templeH1=0.0023, tipR=0.00150,   # r2: temples read as the reference's dark arms
    clear=0.0022,                # temple to skin clearance
    padArmR=0.00038,             # v3: fine gunmetal pad arms
)
GUNMETAL = tuple(((c / 255 + 0.055) / 1.055) ** 2.4 for c in (0x40, 0x43, 0x49))   # r3: #404349, metallic 0.8, rough 0.35 (r2's #33363b metal 1 read black in-game)
#   # r2: #33363b   # v3: #3a3d42 (sRGB) as linear: a darker gunmetal (#4b4e52 read as chrome under bright light)

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
# it3: the eye opening (the skin's open boundary round each eye): its outer corner and its top
from collections import Counter
_ec = Counter()
for f in skinF:
    for a_, b_ in zip(f, f[1:] + f[:1]): _ec[(min(a_, b_), max(a_, b_))] += 1
_hole = np.array([co[i] for e, c in _ec.items() if c == 1 for i in e
                  if 0.012 < abs(co[i][0]) < 0.065 and abs(co[i][2] - pupilZ) < 0.02 and co[i][1] < eyeC[1] + 0.01])
canthusX = float(np.abs(_hole[:, 0]).max()); lidTopZ = float(_hole[:, 2].max())
lashF = faces_of('lashes'); lashBVH = BVHTree.FromPolygons(V, lashF) if lashF else None
lashTopZ = max((V[i].z for f in lashF for i in f), default=lidTopZ)
print('FIT eye opening: outer corner x %.4f, top z %.4f (pupil +%.1f mm), lashes top +%.1f mm' % (canthusX, lidTopZ, (lidTopZ - pupilZ) * 1000, (lashTopZ - pupilZ) * 1000))
# the hair's cards (where they cover the side of the head, the temple tucks under them)
hairBVH = None
HAIRGLB = arg('--hairglb')
if HAIRGLB:   # r2: the hair part delivered on its own (v3/hair/hair.glb): its cards replace the head GLB's for the fit
    for ob_ in list(bpy.data.objects):
        if ob_.type == 'MESH' and ob_.name.startswith('jensen-hair'): bpy.data.objects.remove(ob_)
    before_ = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=HAIRGLB)
    new_ = [x for x in bpy.data.objects if x not in before_]
    for x in new_:
        if x.type == 'ARMATURE': x.data.pose_position = 'REST'; x.parent = None; x.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    print('FIT hair part', HAIRGLB, [x.name for x in new_ if x.type == 'MESH'])
for ob_ in bpy.data.objects:
    if ob_.type == 'MESH' and ob_.name.startswith('jensen-hair'):
        hn_ = [m.name for m in ob_.data.materials]
        if 'hair' in hn_:
            HV_ = [ob_.matrix_world @ v.co for v in ob_.data.vertices]
            hairBVH = BVHTree.FromPolygons(HV_, [list(p.vertices) for p in ob_.data.polygons if p.material_index == hn_.index('hair')])

# r3: seat the bar just under the brows: find the brows' underside above the lens and lift the lens top so the bar's
# top sits BROWGAP under it (never lower than just above the eye opening)
BROWGAP = float(arg('--browgap', '0.0003'))
browBot = None
_bz = []
for ob_ in bpy.data.objects:
    if ob_.type != 'MESH': continue
    bn_ = [m.name for m in ob_.data.materials]
    if 'brows' not in bn_: continue
    bi_ = bn_.index('brows')
    vs_ = {v for p in ob_.data.polygons if p.material_index == bi_ for v in p.vertices}
    for i in vs_:
        q = ob_.matrix_world @ ob_.data.vertices[i].co
        if 0.016 < abs(q.x) < 0.046 and q.z > pupilZ: _bz.append(q.z)
if _bz: browBot = float(np.percentile(_bz, 4))
barAboveLensTop = K['barH1'] - K['barOverlap']
if browBot is not None and browBot > pupilZ + 0.0115:   # (rest-pose brow cards can sit below their posed place: trust only a plausible underside)
    want = browBot - BROWGAP - barAboveLensTop - lidTopZ
    K['topAboveLid'] = float(np.clip(want, 0.0006, 0.0050))
print('FIT r3 brows underside %s (pupil +%s mm): lens top %.1f mm above the eye opening' % (
    None if browBot is None else round(browBot, 4), None if browBot is None else round((browBot - pupilZ) * 1000, 1), K['topAboveLid'] * 1000))

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
    global TOPFLAT
    TOPFLAT = Q[:, 1] > H / 2 - 0.0004
    return np.c_[u, v]

# lens-local (u: outward, v: up, w: back toward the face from the lens front) -> world, per side s
tiltM = Matrix.Rotation(K['tilt'], 4, 'X')
CORR = None   # v3: a per-u vertical correction so the lens top (and so the bar) is dead level in world space
def place(W, vertex):
    """set the frame's globals for a lens width and a vertex distance (cornea to the lens back at its centre)"""
    global cx, yF, zC, pivot, CORR
    K['W'] = W; K['vertex'] = vertex
    cx = K['DBL'] / 2 + W / 2
    yF = corneaY - vertex - K['thick']                          # the lens front at its centre
    zC = lidTopZ + K['topAboveLid'] - K['H'] / 2                # the lens top just above the eye opening
    pivot = Vector((0, yF, zC))
    CORR = None
    us = np.linspace(-W / 2, W / 2, 21); zs = np.array([L2W(1, u, K['H'] / 2, 0).z for u in us])
    CORR = np.polyfit(us, zs[10] - zs, 4)
def L2W(s, u, v, w):
    sag = K['R'] - math.sqrt(max(0.0, K['R'] ** 2 - u * u - v * v))
    d = sag + w; c, sn = math.cos(K['wrap']), math.sin(K['wrap'])
    # wrap: the lens turns about its centre's vertical so its temporal side goes back
    x = s * (cx + u * c - d * sn); y = yF + u * sn + d * c
    p = Vector((x, y, zC + v))
    p = pivot + tiltM @ (p - pivot)
    if CORR is not None: p.z += float(np.polyval(CORR, u))
    return p
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
# v3: solve the lens width so the frame (lens + endpiece) spans FW across, then the vertex distance: as close as the
# lashes and the skin allow
W_ = 0.050
for _ in range(10):
    place(W_, 0.0120); OL = outline(128)
    outer = max(abs(L2W(1, q[0], q[1], 0).x) for q in OL)
    W_ += (K['FW'] / 2 - K['endpiece'] - outer) / math.cos(K['wrap'])
place(W_, 0.0110); OL = outline(128); N = len(OL)
def lensClear(vertex):
    place(K['W'], vertex); lash, skin = 9, 9
    for s in (1, -1):
        for sc in (1.0, 0.8, 0.55, 0.3):
            for q in OL[::2]:
                p = L2W(s, q[0] * sc, q[1] * sc, K['thick'])
                if lashBVH:
                    r = lashBVH.find_nearest(p)
                    if r[0] is not None: lash = min(lash, (p - r[0]).length)
                r = bvh.find_nearest(p)
                if r[0] is not None:
                    d = (p - r[0]).length; skin = min(skin, d if (p - r[0]).dot(r[1]) > 0 else -d)
    return lash, skin
vx = K['vertexMin']
while vx < 0.016:
    la, sk_ = lensClear(vx)
    if la >= K['lashClear'] and sk_ >= K['skinClear']: break
    vx += 0.00025
place(K['W'], vx)
print('FIT v3 lens W %.1f mm, outer end %.1f mm past the eye corner, vertex %.2f mm (lash %.2f, skin %.2f mm)' % (
    K['W'] * 1000, (max(abs(L2W(1, q[0], q[1], 0).x) for q in OL) - canthusX) * 1000, vx * 1000, la * 1000, sk_ * 1000))
def lens(s):
    Vs, Fs = [], []; ctr = OL.mean(0)
    inset, ch = K['bevel'], 0.00028          # it3: the pane starts inside the polished front bevel
    rings = [1.0, 0.92, 0.84, 0.68, 0.44, 0.18]
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
    # the edge (its own material: a polished rimless edge). it3: a rounded front bevel 0.9 mm wide that turns from the
    # lens face to the edge, so at any view angle part of it faces the light: the faint fresnel-like outline that keeps
    # the lens readable in-game with the panes out; then the edge band and a small back chamfer.
    Ve, Fe = [], []
    bv = K['bevel']
    rows = [(0.0, bv), (0.00006, bv * 0.62), (0.00022, bv * 0.32), (0.00048, bv * 0.11), (0.00078, 0.0),
            (K['thick'] - ch, 0.0), (K['thick'], 0.00028)]
    for (w, ins) in rows:
        for q in ringpts(1.0, ins): Ve.append(L2W(s, q[0], q[1], w))
    for r in range(len(rows) - 1):
        for k in range(N):
            a, b = r * N + k, r * N + (k + 1) % N
            f = (a, a + N, b + N, b); Fe.append(f if s > 0 else f[::-1])
    add('glasses-lens-edge', Ve, Fe)
for s in (1, -1): lens(s)

# ---------------------------------------------------------------- it3: ONE browline bar: endpiece, bar, raised bridge, bar, endpiece
# (it2's bars followed each lens's nasal top corner down and met a straight bridge below them: the stepped Z-kink.
#  Now the bar keeps the lens top's level to its nasal end and rises in one smooth arch over the nose.)
H, W = K['H'], K['W']
top = sorted([q for q, t in zip(OL, TOPFLAT) if t], key=lambda q: q[0])   # the flat top + ~30 deg of each top corner
upv = (tiltM @ Vector((0, 0, 1)).to_4d()).to_3d()
dmid = K['thick'] * 0.45
def barV(u, v):   # the bar's centre line height for a lens top point
    f = np.clip((u + W / 2) / W, 0, 1); h = K['barH0'] + (K['barH1'] - K['barH0']) * f
    return v + h / 2 - K['barOverlap']
side = {}; hinge = {}
for s in (1, -1):
    P = [L2W(s, q[0], barV(q[0], q[1]), dmid) for q in (top[::2] if (len(top) - 1) % 2 == 0 else top[::2] + [top[-1]])]
    # v3: the bar's centre line is dead level (the lens top's corner droop stays inside the bar's overlap)
    zLev = L2W(s, 0.0, barV(0.0, K['H'] / 2), dmid).z
    for q_ in P: q_.z = zLev
    # the endpiece: from the lens's outer top end out a little, then round the face's corner back to the hinge,
    # which stands just clear of the skin there
    E = P[-1]; du, dv, dn = sideW(s, top[-1][0], top[-1][1])
    hy = E.y + 0.0115; hz = E.z - 0.0003
    sk = max((outerX(hy, hz + dz, s) or 0) for dz in (-0.002, 0, 0.002))
    hx = max(K['FW'] / 2 - 0.0011, sk + 0.0034)   # v3: the hinge barrel's outside lands on FW/2
    Hn = Vector((s * hx, hy, hz))
    endP = [E + du * 0.0022 + dn * 0.0003,
            Vector((s * (abs(E.x) + (hx - abs(E.x)) * 0.62), E.y + 0.0030, hz + 0.0001)),
            Vector((s * (hx - 0.0004), E.y + 0.0072, hz)), Hn]
    side[s] = (P, endP)
    hinge[s] = (Hn, du, dv, (Hn - endP[-2]).normalized())
# v3: the bridge is a fine STRAIGHT bar at the browline's level (front view: one straight line, endpiece to endpiece).
# It bows forward only (plan view), just enough to clear the nose's bridge.
NL, NR = side[1][0][0], side[-1][0][0]
zBr = (NL.z + NR.z) / 2; NL.z = zBr; NR.z = zBr
xN = abs(NL.x)
BOW = 0.0
def bridgePts(bow):
    out = []
    for f in np.linspace(-1, 1, 17):
        x = xN * f; c_ = math.cos(math.pi / 2 * f) ** 2
        out.append(Vector((x, NL.y - bow * c_, zBr)))
    return out
for _ in range(60):
    worst = 9
    for q in bridgePts(BOW):
        for dz in (-K['bridgeH'] / 2, 0, K['bridgeH'] / 2):
            qq = q + Vector((0, K['bridgeD'] / 2, dz)); r = bvh.find_nearest(qq)
            if r[0] is not None:
                d = (qq - r[0]).length; worst = min(worst, d if (qq - r[0]).dot(r[1]) > 0 else -d)
    if worst >= K['bridgeNoseClear']: break
    BOW += 0.00025
print('FIT v3 bridge forward bow %.2f mm, nose clearance %.2f mm' % (BOW * 1000, worst * 1000))
BR = bridgePts(BOW)
inner = BR[1:-1]   # from x = -xN to +xN, ends excluded (they are the bars' nasal ends)
path0 = (side[-1][1][::-1] + side[-1][0][::-1] + inner + side[1][0] + side[1][1])
path = catmull(path0, 300)
xOut = abs(side[1][0][-1].x)
dimsArr = []
for p in path:
    ax_ = abs(p.x)
    if ax_ <= xN:      # the bridge: a touch slimmer, blending into the bar
        g = (ax_ / xN) ** 3
        h = K['bridgeH'] + (K['barH0'] - K['bridgeH']) * g; d = K['bridgeD'] + (K['barD0'] - K['bridgeD']) * g
    elif ax_ <= xOut and p.y < side[1][0][-1].y + 0.0012:
        f = (ax_ - xN) / (xOut - xN); h = K['barH0'] + (K['barH1'] - K['barH0']) * f; d = K['barD0'] + (K['barD1'] - K['barD0']) * f
    else:              # the endpiece swells a touch into the hinge lug
        h = K['barH1'] + 0.0004; d = K['barD1']
    dimsArr.append((d / 2, h / 2))
nP = len(path)
sweep('glasses-metal', path, lambda t: dimsArr[min(nP - 1, int(round(t * (nP - 1))))], upv, m=16, p=3.4)
for s in (1, -1):
    Hn, du, dv, T = hinge[s]
    # the hinge barrel: a short vertical cylinder at the lug's end, with a screw head on top
    bc = Hn + T * 0.0003
    axis = upv
    # r3: a slim barrel flush with the lug (r2's 1.3 mm barrel + screw head read as a knot in-game)
    sweep('glasses-metal', catmull([bc - axis * 0.0017, bc + axis * 0.0017], 6), lambda t: (0.00105, 0.00105), Vector((s, 0, 0)), m=14, p=2.0, hintMode='side')
bL, bR = NL, NR

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
    for sd_ in (1, -1):
        base = len(Vs)
        for r, hgt in rings:
            for j in range(m):
                th = 2 * math.pi * j / m
                Vs.append(padC + ax * (0.0042 * r * math.cos(th)) + bx * (0.0025 * r * math.sin(th)) + pn * (sd_ * 0.0006 * hgt))
        for ri in range(len(rings) - 1):
            for j in range(m):
                a, b = base + ri * m + j, base + ri * m + (j + 1) % m
                f = (a, b, b + m, a + m); Fs.append(f if sd_ > 0 else f[::-1])
    # (the two halves share their rim ring position: weld by merging later)
    add('glasses-pads', Vs, Fs)
    # v3: a fine gunmetal pad arm. It leaves the bar's underside just behind the lens at its nasal end, runs down
    # behind the lens's nasal edge (so from the front it reads as a hairline beside the edge), then curls in to the
    # pad's back, where a tiny box clip holds the pad.
    du, dv, dn = sideW(s, -K['W'] / 2, 0)
    vP = (padC.z - zC) / math.cos(K['tilt'])
    def nasalU(v): return -K['W'] / 2 + K['nasalSlant'] * (0.5 - (v + K['H'] / 2) / K['H']) + 0.0016
    B0 = Vector((s * (xN + 0.0012), NL.y + K['barD0'] / 2 + 0.0002, zBr - K['barH0'] * 0.30))
    vTop = K['H'] / 2 - 0.0030
    B1 = L2W(s, nasalU(vTop) - 0.0004, vTop, K['thick'] + 0.0006)
    padBack = padC + pn * 0.0011
    vMid = vP + 0.0042
    B2 = L2W(s, nasalU(vMid) - 0.0004, vMid, K['thick'] + 0.0008)
    B3 = B2 + (padBack - B2) * 0.55 + Vector((0, 0, 0.0009))
    arm = catmull([B0, B1, B2, B3, padBack], 30)
    sweep('glasses-metal', arm, lambda t: (K['padArmR'], K['padArmR']), Vector((s, 0, 0)), m=10, p=2.0, hintMode='side')
    # the box clip on the pad's back
    sweep('glasses-metal', catmull([padBack - ax * 0.0011, padBack + ax * 0.0011], 4), lambda t: (0.00055, 0.00045), pn, m=10, p=3.0, hintMode='side')
    padInfo[s] = dict(center=list(padC), normal=list(pn))

# ---------------------------------------------------------------- temples: hinge, back along the head clear of the skin, over the ear, down behind it
tipInfo = {}
for s in (1, -1):
    hp, du, dv, dn = hinge[s]
    hp2 = hp + du * 0.0003
    ey, ez, ex = earTop
    def clearX(y, z, outer=True):
        best = 0
        for dz in ((-0.0012, 0, 0.002) if outer else (-0.003, 0, 0.003)):
            x = (outerX if outer else skullX)(y, z + dz, s)
            if x: best = max(best, x)
        return best + K['clear'] + K['templeW'] / 2
    # it3: the temple runs back from the hinge (falling to just above the ear's top) clear of the skin, and where the
    # hair's cards first cover its line it sinks under them, through the hair cap and into the head, so it reads as
    # tucked into the hair (never drawn across it); the hidden rest runs inside the skull to the ear's root.
    zA = ez + 0.0018
    def lineX(y, z): return max(clearX(y, z), abs(hp2.x) + 0.0)
    def zAt(y):
        f = np.clip((y - hp2.y) / max(1e-6, (ey - hp2.y)), 0, 1)   # v3: a straight line in side view
        return hp2.z * (1 - f) + zA * f
    yHair = None
    if hairBVH and '--hairtuck' in argv:   # v3: off by default (the temple runs visibly to the ear)
        for y in np.arange(hp2.y + 0.008, ey, 0.001):
            z = zAt(y); x = lineX(y, z)
            r = hairBVH.ray_cast(Vector((s * 0.25, y, z)), Vector((-s, 0, 0)))
            if r[0] is not None and abs(r[0].x) > x + 0.0012: yHair = y; break
    pts = [hp2, hp2 + dn * 0.005]
    if yHair is not None:
        yEnd = yHair + 0.004
        for y in np.linspace(hp2.y + 0.012, yEnd, 6):
            if y <= (hp2 + dn * 0.005).y + 0.004: continue
            pts.append(Vector((s * lineX(y, zAt(y)), y, zAt(y))))
        # sink: from the clear line to inside the skin over 12 mm, then on inside the skull to the ear's root
        def inX(y, z): return (skullX(y, z, s) or outerX(y, z, s) or 0.08) - 0.0032
        for f, y in zip((0.35, 0.75, 1.0), (yEnd + 0.004, yEnd + 0.008, yEnd + 0.012)):
            z = zAt(y); pts.append(Vector((s * (lineX(y, z) * (1 - f) + inX(y, z) * f), y, z)))
        for y in np.arange(yEnd + 0.020, ey + 0.006, 0.008):
            z = zAt(y); pts.append(Vector((s * inX(y, z), y, z - 0.0005)))
        TEMPLE_TUCK = dict(hair_y=round(float(yHair), 4))
    else:
        # r3: ONE temple, hinge to the top of the ear: a straight line in side view, one smooth shallow bow in plan
        # (no kink at the hinge or anywhere); the side hair covers its last part at the ear, as in the photo.
        yE, zE = ey - 0.002, zA
        # The head widens behind the hinge (a convex side), so a dead-straight plan line would flare 6 mm off the ear.
        # Instead: straight in side view, and in plan one smooth, shallow outward bow (a real temple's spring curve),
        # no kink anywhere; it ends at skin clearance over the ear.
        x0 = abs(hp2.x)
        F_ = np.linspace(0.12, 0.88, 39); NEED = []
        for f in F_:
            y = hp2.y + (yE - hp2.y) * f; z = hp2.z + (zE - hp2.z) * f
            NEED.append(clearX(y, z))
        NEED = np.array(NEED)
        xE = max(x0, float(NEED[F_ >= 0.74].max()) + 0.0004)
        bowT = float(max(0.0, ((NEED - x0 - (xE - x0) * F_) / (F_ * (1 - F_))).max()))
        def planX(f): return x0 + (xE - x0) * f + bowT * f * (1 - f)
        def lineP(f): return Vector((s * planX(f), hp2.y + (yE - hp2.y) * f, hp2.z + (zE - hp2.z) * f))
        Pe = lineP(1.0)
        for f in np.linspace(0, 1, 13)[1:]: pts.append(lineP(f))
        pts = [pts[0]] + pts[2:]   # (drop r2's hinge-normal stub: it bent the temple at the hinge)
        TEMPLE_BOW = dict(end_x_mm=round(xE * 1000, 1), bow_peak_mm=round(bowT * 250, 2))
        def tuckX(z):
            x = skullX(ey + 0.0165, z, s) or skullX(ey + 0.02, z, s) or 0.078
            return x + 0.0008 + K['templeW'] / 2
        Tdir = (lineP(1.0) - lineP(0.95)).normalized()
        for (dy, dz, w) in ((0.0036, -0.0004, 0.30), (0.0064, -0.0030, 0.80), (0.0080, -0.0080, 1.0), (0.0088, -0.0150, 1.0),
                            (0.0086, -0.0235, 1.0), (0.0074, -0.0315, 1.0)):
            y, z = ey + dy, zA + dz
            xl = xE + (y - yE) * (Tdir.x * s) / max(1e-6, Tdir.y)   # the straight line continued
            pts.append(Vector((s * (xl * (1 - w) + tuckX(z) * w), y, z)))
        TEMPLE_XE = round(xE, 4)
        TEMPLE_TUCK = dict(hair_y=None)
    path = catmull(pts, 120)
    # length along, for the tip sleeve
    L = [0];
    for i in range(1, len(path)): L.append(L[-1] + (path[i] - path[i - 1]).length)
    tot = L[-1]; tipStart = tot - 0.022
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
setp(M['glasses-metal'], GUNMETAL, 0.8, 0.35)   # r2: satin (0.33 read as chrome)   # it3: gunmetal #4b4e52 (sRGB), metallic 1, roughness 0.3
setp(M['glasses-lens'], (0.08, 0.085, 0.09), 0.0, 0.03, 0.10, ar)
setp(M['glasses-lens-edge'], (0.045, 0.048, 0.052), 0.0, 0.32, 0.38)   # r3: dark-tinted, low-spec: a faint thin lower line (r2's pale edge glowed white in-game)   # it3: the polished bevel: a faint fresnel-like edge highlight
setp(M['glasses-pads'], (0.42, 0.44, 0.46), 0.0, 0.25, 0.22)   # (as parts.mjs sets them: faint grey, mostly clear)
setp(M['glasses-tips'], (0.035, 0.036, 0.04), 0.0, 0.38)

# ---------------------------------------------------------------- report the fit
dep = bpy.context.evaluated_depsgraph_get()
gv = np.array([ (gl.matrix_world @ v.co)[:] for v in gl.data.vertices])
w = gv[:, 0].max() - gv[:, 0].min()
mv = np.array([(gl.matrix_world @ gl.data.vertices[i].co)[:] for i in {v for p in gl.data.polygons if p.material_index == 0 for v in p.vertices}])
front = [q for q in mv if q[1] < yF + 0.016]
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
    v3=dict(hinge_to_hinge_mm=round((abs(hinge[1][0].x) + abs(hinge[-1][0].x)) * 1000, 1), bridge_bow_mm=round(BOW * 1000, 2),
             bar_z_spread_mm=round((max(q.z for q in side[1][0] + side[-1][0]) - min(q.z for q in side[1][0] + side[-1][0])) * 1000, 3)),
    it3=dict(eye_outer_corner_x_mm=round(canthusX * 1000, 1), lens_outer_x_mm=round(max(abs(L2W(1, q[0], q[1], 0).x) for q in OL) * 1000, 1),
             eye_opening_top_above_pupil_mm=round((lidTopZ - pupilZ) * 1000, 1),
             lens_top_above_pupil_mm=round((max(L2W(1, q[0], q[1], 0).z for q in OL) - pupilZ) * 1000, 1),
             bar_top_above_pupil_mm=round((mv[:, 2].max() - pupilZ) * 1000, 1) if len(mv) else None,
             lens_W_mm=round(K['W'] * 1000, 1), lens_H_mm=round(K['H'] * 1000, 1), vertex_mm=round(K['vertex'] * 1000, 2),
             lens_lash_clear_mm=round(la * 1000, 2), temple_tuck=TEMPLE_TUCK, temple_bow=TEMPLE_BOW if 'TEMPLE_BOW' in globals() else None, gunmetal_linear=[round(c, 4) for c in GUNMETAL]),
)
print('FIT', json.dumps(fit, default=str))
json.dump(fit, open(os.path.join(OUTDIR, 'fit.json'), 'w'), indent=1, default=str)

# ---------------------------------------------------------------- export the GLB (glasses only)
for ob in bpy.context.scene.objects: ob.select_set(False)
gl.select_set(True); bpy.context.view_layer.objects.active = gl
bpy.ops.export_scene.gltf(filepath=os.path.join(OUTDIR, 'glasses.glb'), use_selection=True, export_format='GLB',
                          export_apply=True, export_yup=True, export_materials='EXPORT', export_normals=True,
                          export_texcoords=False, export_tangents=False, export_skins=False, export_morph=False, export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTDIR, 'glasses-on-head.blend'))

# ---------------------------------------------------------------- renders (Cycles, physically based glass for the preview)
if RENDER:
    lm = bpy.data.materials.new('render-lens'); lm.use_nodes = True; nt = lm.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1, 1, 1, 1); b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.0; b.inputs['IOR'].default_value = 1.12   # it2: no thin film in the preview (its sheen hid the outer eye corner)
    out = nt.nodes['Material Output']; lp = nt.nodes.new('ShaderNodeLightPath'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mx.inputs['Fac']); nt.links.new(b.outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    em = bpy.data.materials.new('render-edge'); em.use_nodes = True; be = em.node_tree.nodes['Principled BSDF']
    be.inputs['Base Color'].default_value = (0.06, 0.065, 0.07, 1); be.inputs['Transmission Weight'].default_value = 0.45; be.inputs['Roughness'].default_value = 0.3; be.inputs['IOR'].default_value = 1.5
    pm = bpy.data.materials.new('render-pads'); pm.use_nodes = True; bp_ = pm.node_tree.nodes['Principled BSDF']
    bp_.inputs['Base Color'].default_value = (0.95, 0.95, 0.9, 1); bp_.inputs['Transmission Weight'].default_value = 1.0; bp_.inputs['Roughness'].default_value = 0.18; bp_.inputs['IOR'].default_value = 1.4
    if '--gamemats' not in argv:   # r3: --gamemats renders the EXPORTED (engine) materials, as the game shows them
        gl.data.materials[1] = lm; gl.data.materials[2] = em; gl.data.materials[3] = pm
    if '--hide' in argv: gl.hide_render = True   # (debug: the head alone)
    if '--nopanes' in argv:   # (as in-game: the assembler takes the clear panes out; only the polished edges stay)
        nm = bpy.data.materials.new('render-none'); nm.use_nodes = True; nn = nm.node_tree
        for n_ in list(nn.nodes):
            if n_.type == 'BSDF_PRINCIPLED': nn.nodes.remove(n_)
        tr_ = nn.nodes.new('ShaderNodeBsdfTransparent'); nn.links.new(tr_.outputs[0], nn.nodes['Material Output'].inputs['Surface'])
        gl.data.materials[1] = nm
    S.world(0.45); S.lights(); S.render_setup('CYCLES', SAMPLES)
    Vw = S.views()
    for k in RENDER:
        loc, t, lens_ = Vw[k]; c = S.camera(k, loc, t, lens_); bpy.context.scene.camera = c
        if k in ('eyes', 'bridge'): bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 1280, 720
        elif k == 'game': bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 640, 360
        else: bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 720, 720
        bpy.context.scene.render.filepath = os.path.join(OUTDIR, 'r-%s-%s.jpg' % (TAG, k))
        bpy.ops.render.render(write_still=True)
