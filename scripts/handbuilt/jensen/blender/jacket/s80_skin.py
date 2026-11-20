# Step 8: skin the jacket to the forge rig: weights transferred from Jensen's body (nearest face, interpolated),
# smoothed over the leather so it deforms as a garment (not as skin), capped at 4 influences; the zip, snaps and pulls
# take the leather's weights at their nearest point so they ride it rigidly. Saves skin.blend + export/ dumps.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np, json, bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/uv.blend')
import lib
JN = lib.JN
fb = lib.load_fullbody(None)
L = bpy.data.objects['leather']; M = bpy.data.objects['metal']; T = bpy.data.objects['tape']; SN = bpy.data.objects['snaps']
from common import COL_H0, COL_H1, COL_TH
def transfer(dst, src, mode):
    for g in list(dst.vertex_groups): dst.vertex_groups.remove(g)
    for n in JN: dst.vertex_groups.new(name=n)
    md = dst.modifiers.new('dt', 'DATA_TRANSFER'); md.object = src; md.use_vert_data = True; md.data_types_verts = {'VGROUP_WEIGHTS'}
    md.vert_mapping = mode; md.layers_vgroup_select_src = 'ALL'; md.layers_vgroup_select_dst = 'NAME'
    for o in bpy.data.objects: o.select_set(False)
    dst.select_set(True); bpy.context.view_layer.objects.active = dst
    bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
transfer(L, fb, 'POLYINTERP_NEAREST')
def weights(o):
    W = np.zeros((len(o.data.vertices), len(JN)), np.float32); gi = {g.index: JN.index(g.name) for g in o.vertex_groups}
    for v in o.data.vertices:
        for g in v.groups: W[v.index, gi[g.group]] = g.weight
    return W
W = weights(L)
# it3: no thigh weights on the jacket: the hem rides the pelvis. Seated, the thighs turn 90 degrees and their weights
# dragged the back hem out into a lower-back bulge (it2 sitTalk)
for s_ in ('L', 'R'):
    for b_ in ('upperleg01_', 'upperleg02_'):
        W[:, JN.index('pelvis_' + s_)] += W[:, JN.index(b_ + s_)]; W[:, JN.index(b_ + s_)] = 0
print('thigh weight moved to the pelvis')
# v3: the pelvis_L/R joints are the hip sockets (children of root, parents of the thighs) and turn with the thighs
# when seated: their weight on the back and sides dragged the lower back out into the seated bulge. The jacket rides
# root (the hips' own frame) instead.
if not os.environ.get('KEEP_PELVIS'):
    for s_ in ('L', 'R'):
        W[:, JN.index('root')] += W[:, JN.index('pelvis_' + s_)]; W[:, JN.index('pelvis_' + s_)] = 0
    # and above the hem band the lower torso follows the spine (the leather hangs from the shoulder blades), only the
    # band keeps half of the hips: seated, the hips' backward tilt no longer kinks the lower back out
    zz_ = np.array([v.co.z for v in L.data.vertices]); fr_ = np.clip((zz_ - 0.975) / 0.06, 0, 1) * 0.85 + 0.15
    mv_ = W[:, JN.index('root')] * fr_; W[:, JN.index('root')] -= mv_; W[:, JN.index('spine05')] += mv_
# v3: the torso below the armpits and the chest front ride the spine, not the arms. Their shoulder/upper-arm weights
# (taken from the A-pose body) swung the sides out into a box and raised pec bumps when the arms came down in the idle.
from common import armhole
co0 = np.array([v.co[:] for v in L.data.vertices])
for s_ in ('L', 'R'):
    pt_, nn_ = armhole(s_); sg_ = 1 if s_ == 'L' else -1
    tor_ = (((co0 - np.array(pt_)) @ np.array(nn_)) < 0) & (sg_ * co0[:, 0] > -0.01)
    fside = np.clip((1.29 - co0[:, 2]) / 0.08, 0, 1)
    ffront = np.clip((1.37 - co0[:, 2]) / 0.08, 0, 1) * (co0[:, 1] < -0.03) * np.clip((0.15 - np.abs(co0[:, 0])) / 0.04, 0, 1)
    f_ = np.maximum(fside, ffront) * tor_
    for b_ in ('shoulder01_', 'upperarm01_', 'upperarm02_'):
        j_ = JN.index(b_ + s_); m_ = W[:, j_] * f_; W[:, j_] -= m_; W[:, JN.index('spine02')] += m_
    print('v3 arm weight off the torso', s_, int((f_ > 0).sum()), 'points')
# smooth over the mesh (garment stiffness): leather spans joints more evenly than skin; more on the torso than the sleeves
me = L.data; E = np.array([e.vertices[:] for e in me.edges]); nV = len(me.vertices)
co = np.array([v.co[:] for v in me.vertices])
deg = np.bincount(E.ravel(), minlength=nV).astype(np.float32)
# light everywhere; a little more on the lower torso (spine-led, away from the shoulders) where leather bridges
low = (co[:, 2] < 1.28) & (np.abs(co[:, 0]) < 0.17)
k = np.where(low, 0.5, 0.25).astype(np.float32)[:, None]
for it in range(4):
    acc = np.zeros_like(W); np.add.at(acc, E[:, 0], W[E[:, 1]]); np.add.at(acc, E[:, 1], W[E[:, 0]])
    W = W * (1 - k) + acc / np.maximum(deg, 1)[:, None] * k
# the collar: its upper part follows the neck a little (it hugs it), its foot the jacket
isc = np.zeros(nV, bool)
pa = me.attributes.get('panel')
if pa:
    pv = np.zeros(len(me.polygons), np.int32); pa.data.foreach_get('value', pv)
    for p in me.polygons:
        if pv[p.index] == 16:
            for vi in p.vertices: isc[vi] = True
# the neck: the jacket's neckline and the collar's foot ride the chest (no neck/head), so they never part; the collar's
# top follows the neck a quarter (it hugs it)
NECKJ = [JN.index(n) for n in ('neck01', 'neck02', 'neck03', 'head')]
def strip_neck(Wr):
    Wr = Wr.copy(); m = Wr[..., NECKJ].sum(-1); Wr[..., NECKJ] = 0; Wr[..., JN.index('spine01')] += m; return Wr
fz = np.clip((co[:, 2] - 1.33) / 0.06, 0, 1) * (~isc)   # neck weight on the jacket body: none at all toward the neckline
Wn = W[:, NECKJ].sum(1); W[:, JN.index('spine01')] += Wn * fz; W[:, NECKJ] *= (1 - fz)[:, None]
nz = (~isc) & (co[:, 2] > 1.38) & (np.abs(co[:, 0]) < 0.14)
kf = (np.clip((co[:, 2] - 1.22) / 0.08, 0, 1) * np.clip((0.24 - np.abs(co[:, 0])) / 0.08, 0, 1) * (~isc))[:, None] * 0.6
for it in range(16):
    acc = np.zeros_like(W); np.add.at(acc, E[:, 0], W[E[:, 1]]); np.add.at(acc, E[:, 1], W[E[:, 0]])
    Ws = acc / np.maximum(deg, 1)[:, None]; W = W * (1 - kf) + Ws * kf
# one neck band: the collar and the jacket within 4 cm of the neckline share the same weights, a smooth function of
# the angle round the neck (the neckline's own, averaged in 15-degree bins), so the two never part or cross
if isc.any():
    auxv = np.zeros(nV, np.float32); me.attributes['aux'].data.foreach_get('value', auxv)
    ang = np.arctan2(co[:, 0], -co[:, 1])
    neckline = (~isc) & (co[:, 2] > 1.42) & (np.abs(co[:, 0]) < 0.10) & ((co[:, 0] / 0.095) ** 2 + (co[:, 1] / 0.105) ** 2 < 1.15)
    NB = 24; bins = ((ang + np.pi) / (2 * np.pi) * NB).astype(int) % NB
    Wb = np.zeros((NB, W.shape[1]))
    for k_ in range(NB):
        m_ = neckline & (bins == k_)
        Wb[k_] = W[m_].mean(0) if m_.any() else 0
    for k_ in range(NB):
        if Wb[k_].sum() == 0: Wb[k_] = (Wb[(k_ - 1) % NB] + Wb[(k_ + 1) % NB]) / 2
    for it in range(2): Wb = (np.roll(Wb, 1, 0) + 2 * Wb + np.roll(Wb, -1, 0)) / 4
    fpos = (ang + np.pi) / (2 * np.pi) * NB - 0.5; i0 = np.floor(fpos).astype(int) % NB; fr_ = (fpos - np.floor(fpos))[:, None]
    Wang = Wb[i0] * (1 - fr_) + Wb[(i0 + 1) % NB] * fr_
    # distance to the neckline (in the band, by height above the yoke toward the neck and nearness to the neck ellipse)
    rr_ = np.sqrt((co[:, 0] / 0.085) ** 2 + (co[:, 1] / 0.095) ** 2)
    kb = np.clip(1 - (rr_ - 1.0) / 0.45, 0, 1) * np.clip((co[:, 2] - 1.36) / 0.05, 0, 1) * (~isc)
    kb = kb * kb * (3 - 2 * kb)
    W = W * (1 - kb[:, None]) + Wang * kb[:, None]
    for i in np.where(isc)[0]:
        HM = COL_H0 + COL_H1; hh = auxv[i] if auxv[i] < HM else max(0.0, HM - (auxv[i] - HM - COL_TH * 1.6))
        f = float(os.environ.get('NECKF', 0.25)) * float(np.clip(hh / (HM - 0.002), 0, 1)) ** 1.5
        W[i] = Wang[i] * (1 - f); W[i, JN.index('neck01')] += f
# top 4 influences, normalised
def cap(W):
    J4 = np.argsort(-W, 1)[:, :4]; W4 = np.take_along_axis(W, J4, 1); W4 = np.clip(W4, 0, None)
    W4[W4 < 0.01] = 0; W4 /= np.maximum(W4.sum(1, keepdims=True), 1e-9); J4 = np.where(W4 > 0, J4, 0); return J4, W4
J4, W4 = cap(W)
def write(o, J4, W4):
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    for n in JN: o.vertex_groups.new(name=n)
    for vi in range(len(J4)):
        for kk in range(4):
            if W4[vi, kk] > 0: o.vertex_groups[int(J4[vi, kk])].add([vi], float(W4[vi, kk]), 'REPLACE')
write(L, J4, W4)
print('leather weights: max influences used', int((W4 > 0).sum(1).max()), 'neck share on collar %.2f' % W4[isc][np.isin(J4[isc], [JN.index('neck01'), JN.index('neck02')])].sum() if isc.any() else 0)
# hardware: nearest leather vertex
# hardware and the tabs ride the shell itself (not the turned edges, collar or tabs): each point takes the weights of
# the nearest shell point
pv_ = np.zeros(len(me.polygons), np.int32); me.attributes['panel'].data.foreach_get('value', pv_)
shell = np.zeros(nV, bool); tabv = np.zeros(nV, bool)
for p in me.polygons:
    if pv_[p.index] < 15:
        for vi in p.vertices: shell[vi] = True
    if pv_[p.index] == 17:
        for vi in p.vertices: tabv[vi] = True
sid = np.where(shell)[0]; kd = KDTree(len(sid))
for k_, i in enumerate(sid): kd.insert(co[i], k_)
kd.balance()
ktab = KDTree(nV)
for i, c in enumerate(co): ktab.insert(c, i)
ktab.balance()
coll = np.where(isc)[0]; kcol = KDTree(len(coll))
for k_, i in enumerate(coll): kcol.insert(co[i], k_)
kcol.balance()
for i in np.where(tabv)[0]:
    # tab A sits on the collar (its weights), tab B on the chest (the shell's)
    dc = kcol.find(co[i]); ds = kd.find(co[i])
    j = coll[dc[1]] if dc[2] < ds[2] else sid[ds[1]]
    J4[i], W4[i] = J4[j], W4[j]
write(L, J4, W4)
class _KD:
    def find(self, c):
        a = kd.find(c); b = kcol.find(c)
        return (None, coll[b[1]], b[2]) if b[2] < a[2] - 0.002 else (None, sid[a[1]], a[2])
kd_sh = _KD()
# the centre-front chain lifted 0.8 mm so the two fronts never close over it as the chest folds
cf_n = np.array([0.0, -1.0, 0.0])
for o in (M, T, SN):
    for v in o.data.vertices:
        if abs(v.co.x) < 0.012 and v.co.y < 0: v.co = v.co + Vector(cf_n * 0.0008)
    idx = np.array([kd_sh.find(v.co)[1] for v in o.data.vertices]); write(o, J4[idx], W4[idx])
bpy.data.objects.remove(fb)
arm_ = lib.make_armature()
for o in (L, M, T, SN):
    o.parent = arm_; md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm_
# ---- the shoulder cap rounded where it is seen (the forge's posecap, post.mjs): posed as the runner poses the idle
# (1.2 s, armhang levelled), each cap point moved along its posed normal toward its neighbours' middle (at most 3 cm,
# fading to the cap's edge), then carried back to the bind through its own skinning matrix
import bmesh
from mathutils import Matrix, Vector
lib.apply_pose(arm_, 'idle', 1.2)
dg = bpy.context.evaluated_depsgraph_get(); ev = L.evaluated_get(dg)
PP = np.array([v.co[:] for v in ev.data.vertices]); assert len(PP) == nV
bmp = bmesh.new(); bmp.from_mesh(L.data)
for v, p in zip(bmp.verts, PP): v.co = p
bmp.normal_update(); NP = np.array([v.normal[:] for v in bmp.verts]); bmp.free()
capw = np.zeros(nV)
for s_ in ('L', 'R'):
    A = np.array(lib.g2b(lib.JOINTS[JN.index('upperarm01_' + s_)]['bind'])[0])
    d = np.linalg.norm(co - A, axis=1); top = co[:, 2] > A[2] - 0.05
    capw = np.maximum(capw, np.clip(1 - d / 0.17, 0, 1) ** 0.5 * top * np.clip((np.abs(co[:, 0]) - 0.09) / 0.04, 0, 1))
capw[isc] = 0
Q = PP.copy()
for it in range(90):
    acc = np.zeros_like(Q); np.add.at(acc, E[:, 0], Q[E[:, 1]]); np.add.at(acc, E[:, 1], Q[E[:, 0]]); mid = acc / np.maximum(deg, 1)[:, None]
    dn = ((mid - Q) * NP).sum(1); Q = Q + NP * (np.minimum(dn, 0) * 0.85 * capw)[:, None]
mv = Q - PP; ln = np.linalg.norm(mv, axis=1); capmax = 0.04 * capw; sc_ = np.where(ln > capmax, capmax / np.maximum(ln, 1e-9), 1); mv *= sc_[:, None]
# the shoulder line given its natural slope (the idle's raised collarbones leave it level): the top of each shoulder
# let down toward the sleeve, nothing at the collar
slope = np.zeros(nV)
for s_ in ('L', 'R'):
    sg = 1 if s_ == 'L' else -1
    xr = np.clip((sg * PP[:, 0] - 0.10) / 0.10, 0, 1)            # 0 at the neck side, 1 at the shoulder point
    zr = np.clip((PP[:, 2] - (PP[:, 2].max() - 0.20)) / 0.06, 0, 1)
    slope = np.maximum(slope, (xr ** 1.3) * zr * np.clip(NP[:, 2] * 1.5, 0, 1) * (sg * PP[:, 0] > 0))
slope[isc] = 0
for it in range(6):
    acc = np.zeros(nV); np.add.at(acc, E[:, 0], slope[E[:, 1]]); np.add.at(acc, E[:, 1], slope[E[:, 0]]); slope = slope * 0.5 + acc / np.maximum(deg, 1) * 0.5
mv[:, 2] -= 0.026 * slope   # it2: more slope (it1 1.8 cm)
# it2: the shoulder line 4% narrower: each shoulder point drawn in ~9 mm toward the neck, fading down the arm and toward
# the collar, so the silhouette slopes from the collar to a rounded, narrower shoulder
narrow = np.zeros(nV)
for s_ in ('L', 'R'):
    sg = 1 if s_ == 'L' else -1
    A = np.array(lib.g2b(lib.JOINTS[JN.index('upperarm01_' + s_)]['bind'])[0])
    d = np.linalg.norm(co - A, axis=1)
    narrow += (sg * co[:, 0] > 0.06) * np.clip(1 - d / 0.15, 0, 1) ** 1.2 * np.clip((sg * co[:, 0] - 0.06) / 0.08, 0, 1) * np.clip((co[:, 2] - (A[2] - 0.10)) / 0.05, 0, 1) * sg
narrow[isc] = 0
for it in range(4):
    acc = np.zeros(nV); np.add.at(acc, E[:, 0], narrow[E[:, 1]]); np.add.at(acc, E[:, 1], narrow[E[:, 0]]); narrow = narrow * 0.5 + acc / np.maximum(deg, 1) * 0.5
mv[:, 0] -= 0.009 * narrow
# it2: the whole shoulder move field smoothed over the mesh so the cap rounds without crumpling (no ridges at the point)
fixed_ = isc | tabv
for it in range(int(os.environ.get('MVSMOOTH', 14))):
    acc = np.zeros_like(mv); np.add.at(acc, E[:, 0], mv[E[:, 1]]); np.add.at(acc, E[:, 1], mv[E[:, 0]])
    mv = mv * 0.5 + acc / np.maximum(deg, 1)[:, None] * 0.5; mv[fixed_] = 0
print('posecap: points moved', int((ln > 0.001).sum()), 'max %.1f mm' % (np.linalg.norm(mv, axis=1).max() * 1000))
# back to the bind: x_bind = (sum_j w_j S_j)^-1 x_posed, S_j = posed_j * rest_j^-1
S = [rig_pb.matrix @ rig_pb.bone.matrix_local.inverted() for rig_pb in (arm_.pose.bones[n] for n in JN)]
S = np.array([np.array(m) for m in S])
Jv, Wv = cap(W)
newco = co.copy()
for i in np.where(np.linalg.norm(mv, axis=1) > 1e-5)[0]:
    Mx = sum(Wv[i, k] * S[Jv[i, k]] for k in range(4))
    newco[i] = (np.linalg.inv(Mx) @ np.append(PP[i] + mv[i], 1.0))[:3]

# ---- posed fit (the forge's posecap, carried over the whole torso): in the idle the runner plays (arms down), the
# linear skinning leaves the armpits and sides pushed out into a box; there the shell is relaxed (Taubin, so it keeps
# its volume) and held at least 8 mm off the posed body, then carried back to the bind like the cap
PP2 = PP + mv
fbp = lib.load_fullbody(arm_); dg = bpy.context.evaluated_depsgraph_get(); bev = fbp.evaluated_get(dg)
bmb = bmesh.new(); bmb.from_object(fbp, dg); bmb.normal_update()
from mathutils.bvhtree import BVHTree
bbvh = BVHTree.FromBMesh(bmb)
hwj = json.load(open(H + '/hw.json'))
rw = np.ones(nV) * 0.35
for s_ in ('L', 'R'):
    A = np.array(lib.g2b(lib.JOINTS[JN.index('upperarm01_' + s_)]['bind'])[0])
    pit = A + np.array([-0.02 if s_ == 'L' else 0.02, 0, -0.10])
    rw = np.maximum(rw, np.clip(1 - np.linalg.norm(co - pit, axis=1) / 0.16, 0, 1))
side = np.clip((np.abs(co[:, 0]) - 0.10) / 0.06, 0, 1) * (co[:, 2] < 1.36) * (np.abs(co[:, 0]) < 0.26)
rw = np.maximum(rw, side)
rw[isc] = 0; rw[np.abs(co[:, 0]) < 0.035] = 0
rw *= 1 - np.clip((co[:, 2] - 1.30) / 0.06, 0, 1) * np.clip((0.17 - np.abs(co[:, 0])) / 0.05, 0, 1)   # nothing near the collar
lipa = me.attributes.get('lip')
for name, (p0, p1, Lp) in hwj['pockets'].items():
    p0 = np.array(p0); p1 = np.array(p1); dv = p1 - p0; ln_ = np.linalg.norm(dv); dv /= ln_
    q = co[:, [0, 2]] - p0[[0, 2]]; t_ = np.clip(q @ dv[[0, 2]] / (np.linalg.norm(dv[[0, 2]]) ** 2) , 0, ln_)
    dd = np.linalg.norm(q - np.outer(t_, dv[[0, 2]]), axis=1)
    rw[(dd < 0.03) & (co[:, 1] < 0)] = 0
for row in np.load(H + '/snaps.npy'): rw[np.linalg.norm(co - row[:3], axis=1) < 0.04] = 0
bnd = np.zeros(nV, bool)
for e in me.edges:
    pass
# keep turned edges where they are (their own shape)
bm_ = bmesh.new(); bm_.from_mesh(me)
for v in bm_.verts:
    if v.is_boundary: bnd[v.index] = True
bm_.free()
rw[bnd] = 0
for it in range(3): 
    acc = np.zeros(nV); np.add.at(acc, E[:, 0], rw[E[:, 1]]); np.add.at(acc, E[:, 1], rw[E[:, 0]]); rw = np.minimum(rw, rw * 0.5 + acc / np.maximum(deg, 1) * 0.5)
Q = PP2.copy()
for it in range(30):
    for lam in (0.5, -0.52):
        acc = np.zeros_like(Q); np.add.at(acc, E[:, 0], Q[E[:, 1]]); np.add.at(acc, E[:, 1], Q[E[:, 0]])
        Q = Q + (acc / np.maximum(deg, 1)[:, None] - Q) * (lam * rw)[:, None]
    for i in np.where(rw > 0)[0]:
        hit = bbvh.find_nearest(Vector(Q[i]))
        if hit[0] is None: continue
        d = (Vector(Q[i]) - hit[0]).dot(hit[1])
        if d < 0.008: Q[i] = np.array(hit[0] + hit[1] * 0.008)
mv2 = Q - PP2; print('posed fit: moved %d points, mean %.1f mm, max %.1f mm' % ((np.linalg.norm(mv2, axis=1) > 0.001).sum(), np.linalg.norm(mv2, axis=1).mean() * 1000, np.linalg.norm(mv2, axis=1).max() * 1000))
mv = mv + mv2 * float(os.environ.get('POSEFIT', 0))
bmb.free(); bpy.data.objects.remove(fbp)
for i in np.where(np.linalg.norm(mv, axis=1) > 1e-5)[0]:
    Mx = sum(Wv[i, k] * S[Jv[i, k]] for k in range(4))
    newco[i] = (np.linalg.inv(Mx) @ np.append(PP[i] + mv[i], 1.0))[:3]
L.data.vertices.foreach_set('co', newco.ravel()); L.data.update()
for b in arm_.pose.bones: b.matrix_basis.identity()
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=H + '/skin.blend')
# ---- dump for the GLB writer (glTF space)
import bmesh
for o in (L, M, T, SN):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()
os.makedirs(H + '/export', exist_ok=True)
info = {}
for o, name in ((L, 'leather'), (M, 'hardware'), (T, 'zip-tape'), (SN, 'snaps')):
    m = o.data; m.calc_loop_triangles()
    has_uv = len(m.uv_layers) > 0
    if has_uv:
        m.calc_tangents(uvmap=m.uv_layers[0].name)
    # split per loop (UV seams, sharp normals): vertex = (vert, uv) unique
    keys = {}; pos = []; nor = []; uv = []; tan = []; jj = []; ww = []; tri = []
    Wv = weights(o); Jv, Wv4 = cap(Wv)
    for lt in m.loop_triangles:
        t = []
        for li in lt.loops:
            l = m.loops[li]; vi = l.vertex_index
            u = tuple(np.round(m.uv_layers[0].data[li].uv, 6)) if has_uv else (0.0, 0.0)
            nrm = tuple(np.round(l.normal, 4))
            key = (vi, u, nrm)
            if key not in keys:
                keys[key] = len(pos); pos.append(m.vertices[vi].co[:]); nor.append(l.normal[:]); uv.append((u[0], 1 - u[1]))
                tan.append((*l.tangent[:], l.bitangent_sign) if has_uv else (1, 0, 0, 1)); jj.append(Jv[vi]); ww.append(Wv4[vi])
            t.append(keys[key])
        tri.append(t)
    pos = lib.b2g(np.array(pos)).astype(np.float32); nor = lib.b2g(np.array(nor)).astype(np.float32)
    tan = np.array(tan, np.float32); tg = lib.b2g(tan[:, :3]).astype(np.float32); tan = np.concatenate([tg, tan[:, 3:]], 1)
    for arr, nm in ((pos, 'pos'), (nor, 'nor'), (np.array(uv, np.float32), 'uv'), (tan, 'tan'), (np.array(jj, np.uint16), 'j'), (np.array(ww, np.float32), 'w'), (np.array(tri, np.uint32).ravel(), 'idx')):
        arr.tofile(H + f'/export/{name}.{nm}.bin')
    info[name] = {'verts': len(pos), 'tris': len(tri)}
json.dump(info, open(H + '/export/info.json', 'w')); print('dump', info)
