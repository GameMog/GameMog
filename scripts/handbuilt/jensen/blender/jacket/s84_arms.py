# Step 8c (v3c, art director it2: "the sleeves and shoulders balloon outward in the seated pose"): the sleeves thinned
# ~13% (upper arm) / ~7% (forearm) in circumference and the shoulder cap's volume reduced, by taking each leather point
# toward the body along the body's own normal: its clearance c (m) becomes c - k*(c - CMIN), capped at DMAX. The front
# of the upper arm next to the chest is taken in most (it stood 15-25 mm off the arm and read as an extra mound beside
# the chest). The move field is smoothed over the mesh so nothing crumples; weights unchanged; held >= CMIN off the body.
# -- in: skin.blend (after s82)  out: skin.blend + export/
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np, bmesh
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/' + os.environ.get('SRC', 'skin_v3b.blend'))
import lib, common, dumplib
from mathutils.bvhtree import BVHTree
from mathutils import Vector
L = bpy.data.objects['leather']; M = bpy.data.objects['metal']; T = bpy.data.objects['tape']; SN = bpy.data.objects['snaps']
def co(o): return np.array([v.co[:] for v in o.data.vertices])
def sm(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
PL = co(L); n = len(PL)
fb = lib.load_fullbody(None)
dg = bpy.context.evaluated_depsgraph_get(); bmb = bmesh.new(); bmb.from_object(fb, dg); bmb.normal_update(); bvh = BVHTree.FromBMesh(bmb)
idx = {g.index: g.name for g in L.vertex_groups}
armw = np.zeros(n); shw = np.zeros(n)
for v in L.data.vertices:
    for g in v.groups:
        nm = idx[g.group]
        if nm.startswith(('upperarm', 'lowerarm', 'wrist', 'armhang')): armw[v.index] += g.weight
        if nm.startswith(('clavicle', 'shoulder')): shw[v.index] += g.weight
cl = np.zeros(n); nd = np.zeros((n, 3))
for i, p in enumerate(PL):
    h = bvh.find_nearest(Vector(p)); cl[i] = (Vector(p) - h[0]).dot(h[1]); nd[i] = h[1]
CMIN = float(os.environ.get('CMIN', 0.006)); D = np.zeros((n, 3))
for s in 'LR':
    A, B, C = [np.array(v) for v in common.arm(s)]
    u1 = B - A; L1 = np.linalg.norm(u1); u1 /= L1; u2 = C - B; u2 /= np.linalg.norm(u2)
    t1 = (PL - A) @ u1; t = np.where(t1 >= L1, L1 + (PL - B) @ u2, t1)
    sd = (PL[:, 0] > 0.10) if s == 'L' else (PL[:, 0] < -0.10)
    # how much of the excess clearance goes: upper arm 0.55, elbow 0.45, forearm 0.30; the shoulder cap 0.40
    k = np.interp(t, [-0.06, -0.02, 0.04, 0.20, 0.27, 0.34, 0.50], [0.0, 0.40, 0.60, 0.72, 0.60, 0.40, 0.30])
    front = sm((-nd[:, 1] - 0.2) / 0.5) * sm((0.22 - t) / 0.06) * sm((t + 0.0) / 0.05)   # the upper arm's front, by the chest
    k = k + 0.15 * front
    w = sd * sm((armw + 0.6 * shw - 0.35) / 0.35)
    dmax = 0.013 + 0.004 * front
    c = np.where(cl > CMIN, np.minimum(k * (cl - CMIN), dmax), 0.0) * w
    D[sd] += (-nd * c[:, None])[sd]
# smooth the field over the mesh (edges), 12 passes, so the sleeve shrinks as a whole
E = np.array([e.vertices[:] for e in L.data.edges]); deg = np.bincount(E.ravel(), minlength=n).astype(float)
moving = np.linalg.norm(D, axis=1) > 0
for it in range(8):
    acc = np.zeros_like(D); np.add.at(acc, E[:, 0], D[E[:, 1]]); np.add.at(acc, E[:, 1], D[E[:, 0]])
    D = 0.5 * D + 0.5 * acc / np.maximum(deg, 1)[:, None]
# hold CMIN off the body
Q = PL + D; held = 0
for i in np.where(np.linalg.norm(D, axis=1) > 1e-5)[0]:
    if cl[i] <= CMIN: Q[i] = PL[i]; continue
    h = bvh.find_nearest(Vector(Q[i])); d = (Vector(Q[i]) - h[0]).dot(h[1])
    if d < CMIN:
        f = max(0.0, (cl[i] - CMIN) / max(cl[i] - d, 1e-6)); Q[i] = PL[i] + D[i] * min(1.0, f); held += 1
mv = np.linalg.norm(Q - PL, axis=1)
print('arms: moved %d verts, mean %.1f max %.1f mm, held %d' % ((mv > 1e-4).sum(), mv[mv > 1e-4].mean() * 1000, mv.max() * 1000, held))
L.data.vertices.foreach_set('co', Q.ravel()); L.data.update()
# hardware/tape/snaps riding near the sleeves move with their nearest leather point
DQ = Q - PL; mvI = np.where(np.linalg.norm(DQ, axis=1) > 1e-5)[0]; PM = PL[mvI]
for o in (M, T, SN):
    P = co(o); dv = np.zeros_like(P)
    for a0 in range(0, len(P), 2000):
        dd = ((P[a0:a0 + 2000, None, :] - PM[None]) ** 2).sum(2); j = dd.argmin(1); dist = np.sqrt(dd[np.arange(len(j)), j])
        dv[a0:a0 + 2000] = DQ[mvI[j]] * np.clip((0.02 - dist) / 0.01, 0, 1)[:, None]
    if np.abs(dv).max() > 1e-5:
        o.data.vertices.foreach_set('co', (P + dv).ravel()); o.data.update(); print(o.name, 'moved', int((np.linalg.norm(dv, axis=1) > 1e-5).sum()))
bmb.free(); bpy.data.objects.remove(fb)
np.save(H + '/wk/arms_move.npy', DQ)
for o in (L, T):
    for p in o.data.polygons: p.use_smooth = True
bpy.ops.wm.save_as_mainfile(filepath=H + '/skin.blend')
dumplib.dump(H, L, M, T, SN)
