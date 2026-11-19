# Step 1: the jacket's fitted form on Jensen's full bind body: smoothed, eased off the body, the torso bridged to its
# hull (leather hangs straight from the chest), sleeves rounded; voxel-remeshed, quad-remeshed, cut at the hem, cuffs
# and neckline with clean planar edges. Saves form.blend (object 'jk').
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
import lib
J = {j['name']: Vector(lib.g2b(j['bind'])[0]) for j in lib.JOINTS}
Z = np.load(lib.D + 'fullbody.npz'); P = lib.g2b(Z['pos']); T = Z['tri'].astype(np.int64); JJ = Z['j']; WW = Z['w']
nV = len(P); JN = lib.JN
def wsum(pred):
    m = np.array([pred(n) for n in JN]); return (WW * m[JJ]).sum(1)
w_hand = wsum(lambda n: n.startswith('finger') or n.startswith('wrist'))
w_head = wsum(lambda n: n.startswith('neck') or n == 'head')
w_leg = wsum(lambda n: 'leg' in n or 'foot' in n)
w_arm = wsum(lambda n: 'arm' in n)
# adjacency (weld seams by position)
key = np.round(P * 1e5).astype(np.int64); _, wid = np.unique(key, axis=0, return_inverse=True); wid = wid.ravel(); nW = wid.max() + 1
E = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]); E = wid[E]; E = np.unique(np.concatenate([E, E[:, ::-1]]), axis=0); E = E[E[:, 0] != E[:, 1]]
deg = np.bincount(E[:, 0], minlength=nW).astype(float)
PW = np.zeros((nW, 3)); np.add.at(PW, wid, P); PW /= np.bincount(wid, minlength=nW)[:, None]
def lap(X):
    acc = np.zeros_like(X); np.add.at(acc, E[:, 0], X[E[:, 1]]); return acc / np.maximum(deg, 1)[:, None] - X
def wavg(a):
    o = np.zeros(nW); np.add.at(o, wid, a); return o / np.bincount(wid, minlength=nW)
hw, hdw, lgw, amw = wavg(w_hand), wavg(w_head), wavg(w_leg), wavg(w_arm)
# 1. smooth (Taubin) where the jacket goes: torso + arms, not hands/head
mask = np.clip(1 - hw * 2 - hdw * 1.5, 0, 1)[:, None]
X = PW.copy()
for it in range(40):
    X = X + 0.5 * mask * lap(X); X = X - 0.53 * mask * lap(X)
# normals of the smoothed welded surface
def vnormals(X):
    tri = wid[T]; fn = np.cross(X[tri[:, 1]] - X[tri[:, 0]], X[tri[:, 2]] - X[tri[:, 0]]); N = np.zeros_like(X)
    for k in range(3): np.add.at(N, tri[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1), 1e-12)[:, None]
N = vnormals(X)
# 2. ease: back a little more, sleeves, a touch more at the forearm/wrist
zc = X[:, 2]; back = np.clip((X[:, 1] - 0.0) / 0.08, 0, 1)  # blender +Y = his back
ease = 0.013 + 0.006 * back * (1 - amw) + 0.003 * amw
fore = wavg(wsum(lambda n: n.startswith('lowerarm'))); ease += 0.004 * fore
X = X + N * ease[:, None]
# 3. torso bridged to its convex hull between the hem and the chest (leather hangs straight)
zt = (J['spine01'].z + J['shoulder01_L'].z) * 0.5  # ~ chest
torso = (amw < 0.15) & (hdw < 0.2) & (X[:, 2] > 0.86) & (X[:, 2] < J['shoulder01_L'].z + 0.02) & (np.abs(X[:, 0]) < 0.24)
bm = bmesh.new(); vs = [bm.verts.new(p) for p in X[torso]]; bmesh.ops.convex_hull(bm, input=vs); 
for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
bm.normal_update(); hull = BVHTree.FromBMesh(bm)
ft = np.clip((J['shoulder01_L'].z - 0.04 - X[:, 2]) / 0.10, 0, 1) * np.clip((X[:, 2] - 0.80) / 0.05, 0, 1) * np.clip(1 - amw * 3, 0, 1)
for i in np.where(torso & (ft > 0))[0]:
    co, n, fi, d = hull.find_nearest(Vector(X[i]))
    if co is None: continue
    side = 1 - 0.7 * min(1, abs(N[i, 0]) * 1.3)
    X[i] = X[i] + (np.array(co) - X[i]) * 0.9 * ft[i] * side
# the hem band snug: the lower torso drawn in toward the body's axis (a moto jacket's band hugs the hips; the
# push-out below keeps it off the body)
for i in np.where(torso)[0]:
    k = np.clip((1.10 - X[i, 2]) / 0.13, 0, 1)
    if k <= 0: continue
    c = np.array([0.0, 0.0, X[i, 2]]); d = X[i] - c; d[2] = 0
    X[i] = X[i] - d * 0.10 * k
# 4. sleeves rounded: each point's distance from the arm axis evened toward its ring's mean
for s in ('L', 'R'):
    A, B, Cc = J['upperarm01_' + s], J['lowerarm01_' + s], J['wrist_' + s]
    wa = wavg(wsum(lambda n, s=s: ('arm' in n and n.endswith('_' + s))))
    idx = np.where(wa > 0.5)[0]
    for (a, b) in ((A, B), (B, Cc)):
        ab = np.array(b - a); L = np.linalg.norm(ab); u = ab / L
        rel = X[idx] - np.array(a); t = rel @ u; sel = (t > -0.02) & (t < L + 0.03)
        ii = idx[sel]; tt = t[sel]; radial = rel[sel] - np.outer(tt, u); r = np.linalg.norm(radial, axis=1)
        bins = np.clip((tt / 0.01).astype(int) + 3, 0, 200); mean = np.bincount(bins, weights=r, minlength=201) / np.maximum(np.bincount(bins, minlength=201), 1)
        target = r * 0.45 + mean[bins] * 0.55
        X[ii] = np.array(a) + np.outer(tt, u) + radial / np.maximum(r, 1e-9)[:, None] * target[:, None]
for it in range(10):
    X = X + 0.4 * mask * lap(X); X = X - 0.42 * mask * lap(X)
# build mesh (welded)
tri = wid[T]; tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])]
me = bpy.data.meshes.new('form'); me.from_pydata(X.tolist(), [], tri.tolist()); me.validate()
o = bpy.data.objects.new('form', me); bpy.context.scene.collection.objects.link(o); bpy.context.view_layer.objects.active = o; o.select_set(True)
md = o.modifiers.new('rm', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = 0.006; md.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier='rm')
print('voxel', len(o.data.vertices))
# remesh coarser for the garment's working topology (~1.1 cm quads)
md = o.modifiers.new('rm', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = 0.011; md.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier='rm')
from common import HEM
bm = bmesh.new(); bm.from_mesh(o.data)
def cut(co, no, geom=None):
    g = geom if geom is not None else bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=g, plane_co=co, plane_no=no, clear_outer=False, clear_inner=False, dist=0.0005)
    bm.verts.ensure_lookup_table()
    return [v for v in bm.verts if (v.co - Vector(co)).dot(Vector(no)) > 1e-5]
# hem: everything below goes
out = set(cut((0, 0, HEM), (0, 0, -1)))
# cuffs: a plane square to the forearm, 0.8 cm past the wrist joint
for s in ('L', 'R'):
    w = J['wrist_' + s]; e = J['lowerarm02_' + s]; u = (w - e).normalized(); c = w + u * 0.008
    out |= set(v for v in cut(c, u) if (v.co - w).length < 0.25)
# neckline: a plane tilted (front lower), applied inside a neck cylinder only
fr, bk = Vector((0, -0.075, 1.452)), Vector((0, 0.07, 1.505)); d = bk - fr; nrm = Vector((0, -d.z, d.y)).normalized()
if nrm.z < 0: nrm = -nrm
ctr = (fr + bk) * 0.5
inneck = lambda p: (p.x / 0.095) ** 2 + ((p.y - 0.0) / 0.12) ** 2 < 1 and p.z > 1.40
geom = [f for f in bm.faces if any(inneck(v.co) for v in f.verts)]
gv = set(v for f in geom for v in f.verts); ge = set(e for f in geom for e in f.edges)
newv = cut(ctr, nrm, list(gv) + list(ge) + geom)
out |= set(v for v in bm.verts if inneck(v.co) and (v.co - ctr).dot(nrm) > 1e-5)
out |= set(v for v in bm.verts if v.co.z > 1.60)
bmesh.ops.delete(bm, geom=list(out), context='VERTS')
bmesh.ops.dissolve_degenerate(bm, dist=0.0015, edges=bm.edges[:])
# drop stray islands
bm.verts.ensure_lookup_table(); seen = set(); comps = []
for v in bm.verts:
    if v.index in seen: continue
    st = [v]; c = []; seen.add(v.index)
    while st:
        x = st.pop(); c.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); st.append(y)
    comps.append(c)
comps.sort(key=len, reverse=True); bmesh.ops.delete(bm, geom=[v for c in comps[1:] for v in c], context='VERTS')
# the neckline: its boundary loop set on a clean ellipse in the tilted plane, the rings inside relaxed onto the surface
bt = BVHTree.FromBMesh(bm)
bnd = [v for v in bm.verts if v.is_boundary and v.co.z > 1.38]
EA, EBF, EBB, EY = 0.078, 0.086, 0.074, 0.0
def plane_z(x, y): return ctr.z - (nrm.x * (x - ctr.x) + nrm.y * (y - ctr.y)) / nrm.z
for v in bnd:
    EB = EBF if v.co.y < EY else EBB
    th = math.atan2((v.co.y - EY) / EB, v.co.x / EA); x, y = EA * math.cos(th), EY + EB * math.sin(th)
    v.co = Vector((x, y, plane_z(x, y)))
ring = set(bnd); fixed = set(bnd); layers = []
for k in range(5):
    nxt = set(e.other_vert(v) for v in ring for e in v.link_edges) - fixed; layers.append(nxt); fixed |= nxt; ring = nxt
for it in range(40):
    for k, L in enumerate(layers):
        for v in L:
            nb = [e.other_vert(v).co for e in v.link_edges]; c = sum(nb, Vector()) / len(nb); v.co = v.co.lerp(c, 0.6)
            if k >= 3:
                co, n, i, d = bt.find_nearest(v.co)
                if co is not None: v.co = v.co.lerp(co, 0.5)
# nothing of the body through it: every point at least 7 mm out from the skin (along the skin's normal)
bb = bmesh.new(); bb.verts.ensure_lookup_table()
for p in P: bb.verts.new(p)
bb.verts.ensure_lookup_table()
for t in T:
    try: bb.faces.new([bb.verts[i] for i in t])
    except ValueError: pass
bb.normal_update(); body = BVHTree.FromBMesh(bb)
moved = 0
for it in range(3):
    for v in bm.verts:
        co, n, i, d = body.find_nearest(v.co)
        if co is None: continue
        s_ = (v.co - co).dot(n)
        if s_ < 0.007: v.co = co + n * 0.007; moved += 1
    for v in bm.verts:
        if v.is_boundary: continue
        nb = [e.other_vert(v).co for e in v.link_edges]; c = sum(nb, Vector()) / len(nb); v.co = v.co.lerp(c, 0.15)
print('pushed out', moved)
bm.to_mesh(o.data); bm.free(); o.name = 'jk'; o.data.name = 'jk'
print('jacket form', len(o.data.vertices), 'faces', len(o.data.polygons), 'islands', len(comps))
bpy.ops.wm.save_as_mainfile(filepath=H + '/form.blend')
