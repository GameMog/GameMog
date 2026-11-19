# Step 4: the hardware, modelled: the full-length centre-front zip (interlocking metal teeth on black tape, closed to
# the collar's top, slider + pull, bottom stop), the chest zip pocket and the two slanted hand-warmer zips (teeth,
# slider, pull), the four snaps on the two tabs. Saves hw.blend (objects: metal, tape).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/geo.blend')
import lib
from common import *
jk = bpy.data.objects['jk']; jb = bmesh.new(); jb.from_mesh(jk.data); jb.normal_update(); lay = jb.verts.layers.int.get('lip')
jbvh = BVHTree.FromBMesh(jb)
co_ = np.array([v.co[:] for v in jb.verts]); no_ = np.array([v.normal[:] for v in jb.verts]); lip = np.array([v[lay] for v in jb.verts])
# ---- the centre-front line on the jacket
zs = np.arange(HEM + 0.002, 1.46, 0.004); path = []; nrm = []
for z in zs:
    sel = (np.abs(co_[:, 2] - z) < 0.007) & (np.abs(co_[:, 0]) < 0.012) & (co_[:, 1] < -0.02) & (lip == 0)
    if sel.sum() < 2: continue
    path.append([0.0, co_[sel, 1].min() * 0.6 + co_[sel, 1].mean() * 0.4, z]); nrm.append(no_[sel].mean(0))
path = np.array(path); nrm = np.array(nrm)
ztop = np.load(H + '/ziptop.npy'); top = ztop.mean(0); top[0] = 0.0
# continue up the collar front (straight to the collar's top), then smooth and resample every 0.5 mm
last = path[-1]
ext = [last + (top - last) * f for f in np.linspace(0.08, 1.0, 12)]
nup = [nrm[-1]] * len(ext)
path = np.vstack([path, ext]); nrm = np.vstack([nrm, nup])
for it in range(30): path[1:-1] = path[1:-1] * 0.5 + (path[:-2] + path[2:]) * 0.25; nrm[1:-1] = nrm[1:-1] * 0.5 + (nrm[:-2] + nrm[2:]) * 0.25
seg = np.linalg.norm(np.diff(path, axis=0), axis=1); S = np.concatenate([[0], np.cumsum(seg)]); LZ = S[-1]
def P(s): return Vector([np.interp(s, S, path[:, k]) for k in range(3)])
def N(s):
    n = Vector([np.interp(s, S, nrm[:, k]) for k in range(3)]); n.x = 0; return n.normalized()
def frame_c(s):
    t = (P(min(s + 0.002, LZ)) - P(max(s - 0.002, 0))).normalized(); n = N(s); n = (n - t * n.dot(t)).normalized(); b = n.cross(t)  # b toward his left? (+x)
    if b.x < 0: b = -b
    return t, b, n
print('zip length', round(LZ, 3))
mb = bmesh.new(); tbm = bmesh.new()
def box(bmx, c, t, b, n, lt, lb, ln, taper=1.0, bshift=0.0):
    """box centred at c: lt along t, lb along b, ln along n; the top face (+n) narrowed by taper"""
    vs = []
    for sn in (-1, 1):
        k = taper if sn > 0 else 1.0
        for sb in (-1, 1):
            for st in (-1, 1):
                vs.append(bmx.verts.new(c + t * (st * lt / 2 * k) + b * (sb * lb / 2 * (k if sb * bshift <= 0 else 1)) + n * (sn * ln / 2)))
    idx = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for f in idx: bmx.faces.new([vs[i] for i in f])
def teeth(bmx, Pf, Ff, L0, L1, pitch=0.0015, w=0.0040, h=0.0019, lt=0.0012, lift=0.0004):
    s = L0; k = 0
    while s < L1:
        t, b, n = Ff(s); side = 1 if k % 2 == 0 else -1
        c = Pf(s) + n * (lift + h / 2) + b * (side * 0.0005)
        # each tooth: a body on its own tape side and a rounded head reaching across the chain
        box(bmx, c, t, b, n, lt, w * 0.9, h, taper=0.78)
        s += pitch; k += 1
    return k
nt = teeth(mb, P, frame_c, 0.006, LZ - 0.012)
# tape: a black band each side under the chain, tucked under the leather edges
def ribbon(bmx, Pf, Ff, L0, L1, b0, b1, depth, step=0.004):
    rows = []; s = L0
    while True:
        t, b, n = Ff(min(s, L1)); p = Pf(min(s, L1)) + n * depth
        rows.append([bmx.verts.new(p + b * b0), bmx.verts.new(p + b * b1)])
        if s >= L1: break
        s += step
    for i in range(len(rows) - 1): bmx.faces.new([rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]])
SNECK = float(S[np.searchsorted(path[:, 2], 1.445)]) if path[:, 2].max() > 1.445 else LZ
for sgn in (1, -1):
    ribbon(tbm, P, frame_c, 0.0, SNECK, sgn * 0.0010, sgn * (GAP + 0.0012), -0.0005)
    ribbon(tbm, P, frame_c, SNECK - 0.004, LZ - 0.002, sgn * 0.0010, sgn * 0.0034, -0.0010)  # narrower between the collar's ends
ribbon(tbm, P, frame_c, 0.0, LZ - 0.002, -0.0011, 0.0011, -0.0002)  # the gap under the teeth
# bottom stop (retainer box) at the hem
t, b, n = frame_c(0.004); box(mb, P(0.004) + n * 0.0015, t, b, n, 0.008, 0.0062, 0.0026, taper=0.8)
box(mb, P(LZ - 0.0025) + frame_c(LZ - 0.0025)[2] * 0.0013, *frame_c(LZ - 0.0025), 0.0025, 0.0048, 0.0020, taper=0.8)  # top stops
# ---- slider + pull
def slider(bmx, c, t, b, n, L=0.012, W=0.0074, Hh=0.0036):
    # a tapered body (wide at the top where the chains enter), rounded crown
    rings = []
    for i, f in enumerate(np.linspace(-0.5, 0.5, 6)):
        w = W * (0.72 + 0.28 * (f + 0.5)); hh = Hh * (0.85 + 0.15 * (f + 0.5))
        prof = [(-w / 2, 0), (w / 2, 0), (w / 2 * 0.92, hh * 0.7), (w / 2 * 0.6, hh * 0.98), (-w / 2 * 0.6, hh * 0.98), (-w / 2 * 0.92, hh * 0.7)]
        rings.append([bmx.verts.new(c + t * (f * L) + b * x + n * y) for (x, y) in prof])
    for i in range(len(rings) - 1):
        for j in range(6): bmx.faces.new([rings[i][j], rings[i][(j + 1) % 6], rings[i + 1][(j + 1) % 6], rings[i + 1][j]])
    bmx.faces.new(rings[0][::-1]); bmx.faces.new(rings[-1])
def plate(bmx, c, ax, ay, n, outline, hole, th):
    """flat metal plate: outline with a hole, th thick, lying in (ax, ay) with normal n"""
    def ring(pts, z): return [bmx.verts.new(c + ax * x + ay * y + n * z) for (x, y) in pts]
    o0, o1 = ring(outline, 0), ring(outline, th); h0, h1 = ring(hole, 0), ring(hole, th)
    m = len(outline)
    for i in range(m):
        j = (i + 1) % m
        bmx.faces.new([o0[i], o0[j], o1[j], o1[i]]); bmx.faces.new([h0[j], h0[i], h1[i], h1[j]])
        bmx.faces.new([o1[i], o1[j], h1[j], h1[i]]); bmx.faces.new([o0[j], o0[i], h0[i], h0[j]])
def rr(w, h, r, nc=4, cy=0.0):
    pts = []
    for cx, cyy, a0 in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for k in range(nc + 1):
            a = math.radians(a0 + 90 * k / nc); pts.append((cx + r * math.cos(a), cy + cyy + r * math.sin(a)))
    return pts
def pull(bmx, anchor, down, n, length=0.021, width=0.0064, th=0.0013):
    across = n.cross(down).normalized()
    out = rr(width, length, 0.0026, cy=-length / 2); hole = rr(width * 0.42, length * 0.36, 0.0012, cy=-length * 0.70)
    # tapered toward the top: squeeze x near y=0
    out = [(x * (0.72 + 0.28 * min(1, -y / (length * 0.45))), y) for (x, y) in out]
    plate(bmx, anchor, across, down, n, [(x, -y) for (x, y) in out][::-1], [(x, -y) for (x, y) in hole][::-1], th)
t, b, n = frame_c(LZ - 0.0085)
slider(mb, P(LZ - 0.0085) + n * 0.0010, -t, b, n)
# the pull hangs from the slider's crown, lying on the chain
pull(mb, P(LZ - 0.0045) + n * 0.0044, -t, n)
# ---- pocket zips: projected lines on the front
def surf_path(p0, p1, step=0.001):
    pts = []; nn = []
    for f in np.linspace(0, 1, int((Vector(p1) - Vector(p0)).length / step) + 1):
        q = Vector(p0).lerp(Vector(p1), f); hit = jbvh.ray_cast(Vector((q.x, -0.6, q.z)), Vector((0, 1, 0)))
        if hit[0] is None: continue
        pts.append(hit[0][:]); nn.append(hit[1][:])
    pts = np.array(pts); nn = np.array(nn)
    for it in range(8): pts[1:-1] = pts[1:-1] * 0.5 + (pts[:-2] + pts[2:]) * 0.25; nn[1:-1] = nn[1:-1] * 0.5 + (nn[:-2] + nn[2:]) * 0.25
    sg = np.linalg.norm(np.diff(pts, axis=0), axis=1); SS = np.concatenate([[0], np.cumsum(sg)])
    Pf = lambda s: Vector([np.interp(s, SS, pts[:, k]) for k in range(3)])
    def Ff(s):
        t = (Pf(min(s + 0.002, SS[-1])) - Pf(max(s - 0.002, 0))).normalized(); n = Vector([np.interp(s, SS, nn[:, k]) for k in range(3)]).normalized()
        n = (n - t * n.dot(t)).normalized(); return t, n.cross(t), n
    return Pf, Ff, SS[-1]
pk = {}
for name, (p0, p1) in POCKETS.items():
    Pf, Ff, Lp = surf_path(p0, p1); pk[name] = (p0, p1, Lp)
    teeth(mb, Pf, Ff, 0.004, Lp - 0.004, pitch=0.0014, w=0.0034, h=0.0015, lt=0.0011, lift=-0.0003)
    s_sl = Lp - 0.010
    t, b, n = Ff(s_sl); slider(mb, Pf(s_sl) + n * 0.0003, t, b, n, L=0.010, W=0.0064, Hh=0.0032)
    dn = Vector((0, 0, -1)); dn = (dn - n * dn.dot(n)).normalized()
    pull(mb, Pf(s_sl + 0.003) + n * 0.0036, dn, n, length=0.019, width=0.0058)
# ---- snaps: domed caps with a rim (it2: their own object, dull nickel; smaller)
sb = bmesh.new()
for row in np.load(H + '/snaps.npy'):
    c = Vector(row[:3]); n = Vector(row[3:]).normalized(); a1 = n.orthogonal().normalized(); a2 = n.cross(a1)
    k_ = SNAP_R / 0.0058; prof = [(r * k_, h * k_ * 0.9) for (r, h) in [(0.0058, 0.0), (0.0061, 0.0006), (0.0058, 0.0013), (0.0050, 0.0018), (0.0040, 0.0019), (0.0030, 0.0024), (0.0015, 0.0028), (0.0, 0.0029)]]
    seg_ = 16; rings = []
    for (r, h) in prof:
        if r == 0: rings.append([sb.verts.new(c + n * h)]); continue
        rings.append([sb.verts.new(c + (a1 * math.cos(2 * math.pi * k / seg_) + a2 * math.sin(2 * math.pi * k / seg_)) * r + n * h) for k in range(seg_)])
    for i in range(len(rings) - 1):
        A_, B_ = rings[i], rings[i + 1]
        for k in range(seg_):
            if len(B_) == 1: sb.faces.new([A_[k], A_[(k + 1) % seg_], B_[0]])
            else: sb.faces.new([A_[k], A_[(k + 1) % seg_], B_[(k + 1) % seg_], B_[k]])
    sb.faces.new(rings[0][::-1])
def finish(bmx, name):
    bmesh.ops.recalc_face_normals(bmx, faces=bmx.faces[:]); m = bpy.data.meshes.new(name); bmx.to_mesh(m); bmx.free()
    o = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(o); return o
mo = finish(mb, 'metal'); to = finish(tbm, 'tape'); so = finish(sb, 'snaps')
import json; json.dump({'zip_len': LZ, 'pockets': {k: [list(v[0]), list(v[1]), v[2]] for k, v in pk.items()}, 'zip_path': path.tolist()}, open(H + '/hw.json', 'w'))
print('teeth', nt, 'metal tris', sum(len(p.vertices) - 2 for p in mo.data.polygons), 'tape', len(to.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath=H + '/hw.blend')
