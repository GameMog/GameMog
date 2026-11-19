# Step 8b (v3b, owner 19 Nov: "chest and stomach should NOT protrude, naturally flattened"): the jacket's front panels
# hang FLAT from the chest to the hem band, like stiff leather. In the bind, every front column |x| is made a straight
# vertical line from the chest row (z 1.32) to the band (z 1.00), and the chest row a smooth arc with no pec bumps
# (Ftop below): a ruled panel, not a shrink-wrap. One smooth forward-offset field D(x, z) moves the leather and every
# piece riding on it (zip strip, hardware, snaps) the same, so nothing detaches; weights are unchanged. Held >= 1 cm off
# the flattened body. Then re-dumps export/ for s90. -- in: skin_v3pre.blend  out: skin.blend + export/
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np, json, bmesh
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/' + os.environ.get('SRC', 'skin_v3pre.blend'))
import lib
JN = lib.JN
L = bpy.data.objects['leather']; M = bpy.data.objects['metal']; T = bpy.data.objects['tape']; SN = bpy.data.objects['snaps']
def co(o): return np.array([v.co[:] for v in o.data.vertices])
PL = co(L)
def sm(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
# forward value f = -y (Blender), cm-free metres
XS = np.arange(0.0, 0.185, 0.005); ZS = np.arange(0.96, 1.40, 0.005)
S = np.full((len(XS), len(ZS)), np.nan)
ph = np.arctan2(np.abs(PL[:, 0]), -PL[:, 1])
fr = (PL[:, 1] < 0) & (ph < 1.35)
ax = np.abs(PL[:, 0])
for i, x in enumerate(XS):
    cx = fr & (np.abs(ax - x) < 0.006)
    for k, z in enumerate(ZS):
        s = cx & (np.abs(PL[:, 2] - z) < 0.006)
        if s.any(): S[i, k] = -PL[s, 1].min()
for i in range(len(XS)):   # fill gaps along z
    ok = ~np.isnan(S[i]);
    if ok.sum() > 2: S[i] = np.interp(ZS, ZS[ok], S[i, ok])
# target: chest row arc (no bumps; the old pec points at x 6-9 cm stood 3-4 mm proud) and a straight run to the band
ZT, ZB = 1.32, 1.00
Ftop = np.interp(XS, [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.17, 0.185], [0.1395, 0.1393, 0.1385, 0.1365, 0.1315, 0.118, 0.098, 0.090])
kb = np.argmin(np.abs(ZS - ZB)); Fbot = np.array([np.nanmedian(S[i, max(0, kb - 2):kb + 3]) for i in range(len(XS))])
Fbot = np.convolve(np.pad(Fbot, 2, mode='edge'), np.ones(5) / 5, 'valid')   # smooth across x
t = np.clip((ZT - ZS) / (ZT - ZB), 0, 1)
F = Ftop[:, None] * (1 - t[None]) + Fbot[:, None] * t[None]
D = F - S
D[:, ZS > ZT] = (D[:, np.argmin(np.abs(ZS - ZT))][:, None]) * sm((1.37 - ZS[ZS > ZT]) / 0.05)[None]   # fade to the yoke/collar
D[:, ZS < ZB] = (D[:, kb][:, None]) * sm((ZS[ZS < ZB] - 0.985) / 0.015)[None]                           # band keeps its jeans clearance
D *= sm((0.168 - XS) / 0.04)[:, None]                                                                     # sides/taper untouched
D = np.nan_to_num(D)
D = np.clip(D, -0.012, 0.010)
def blur2(A, r):
    k = np.arange(-3 * r, 3 * r + 1); w = np.exp(-(k / r) ** 2 / 2); w /= w.sum()
    for axn in (0, 1):
        Ap = np.pad(A, [(3 * r, 3 * r) if a_ == axn else (0, 0) for a_ in (0, 1)], mode='reflect' if axn == 0 else 'edge')
        A = sum(np.take(Ap, np.arange(A.shape[axn]) + 3 * r + s, axis=axn) * ww for s, ww in zip(k, w))
    return A
D = blur2(D, 2)
print('field D: min %.1f max %.1f mm' % (D.min() * 1000, D.max() * 1000))
def field(P):
    x = np.clip(np.abs(P[:, 0]), XS[0], XS[-1]); z = np.clip(P[:, 2], ZS[0], ZS[-1])
    fi = (x - XS[0]) / (XS[1] - XS[0]); fk = (z - ZS[0]) / (ZS[1] - ZS[0])
    i0 = np.clip(np.floor(fi).astype(int), 0, len(XS) - 2); k0 = np.clip(np.floor(fk).astype(int), 0, len(ZS) - 2); a = fi - i0; b = fk - k0
    v = D[i0, k0] * (1 - a) * (1 - b) + D[i0 + 1, k0] * a * (1 - b) + D[i0, k0 + 1] * (1 - a) * b + D[i0 + 1, k0 + 1] * a * b
    p_ = np.arctan2(np.abs(P[:, 0]), -P[:, 1])
    w = sm((1.40 - p_) / 0.3) * (P[:, 1] < 0.02) * (P[:, 2] > 0.90) * (P[:, 2] < 1.40) * (np.abs(P[:, 0]) < 0.20)
    return v * w
# clearance against the flattened body (bind): the field may not take the leather closer than 1 cm to it
fb = lib.load_fullbody(None)
from mathutils.bvhtree import BVHTree
from mathutils import Vector
dg = bpy.context.evaluated_depsgraph_get(); bmb = bmesh.new(); bmb.from_object(fb, dg); bmb.normal_update(); bvh = BVHTree.FromBMesh(bmb)
for o in (L, M, T, SN):
    P = co(o); dv = field(P); Q = P.copy(); Q[:, 1] -= dv
    if o is L:
        bad = 0
        for i in np.where(np.abs(dv) > 1e-5)[0]:
            hit = bvh.find_nearest(Vector(Q[i]))
            if hit[0] is None: continue
            d = (Vector(Q[i]) - hit[0]).dot(hit[1])
            if d < 0.010 and dv[i] < 0: Q[i, 1] = P[i, 1] - max(dv[i], dv[i] + (0.010 - d)); bad += 1
        print('leather: moved %d verts, %d held off the body' % ((np.abs(dv) > 1e-5).sum(), bad))
    o.data.vertices.foreach_set('co', Q.ravel()); o.data.update()
bmb.free(); bpy.data.objects.remove(fb)

# ---- chest front weights: the arm chain (clavicle, upper arm) pulled the pec area forward into two mounds whenever
# the arms came forward (sitTalk, gestures). On the front panel below the yoke, that weight goes to the chest (spine02),
# fading out toward the armhole and the yoke, so the chest front rides the (now rigid) trunk.
ARM = [i for i, n in enumerate(JN) if n.startswith(('clavicle', 'upperarm', 'shoulder', 'armhang'))]
SP2 = JN.index('spine02')
def chest_reweight(o):
    P = co(o); gi = {g.name: g for g in o.vertex_groups}
    if 'spine02' not in gi: o.vertex_groups.new(name='spine02'); gi = {g.name: g for g in o.vertex_groups}
    f = sm((0.165 - np.abs(P[:, 0])) / 0.04) * sm((1.35 - P[:, 2]) / 0.045) * (P[:, 1] < 0) * (P[:, 2] > 0.95)
    idx = {g.index: g.name for g in o.vertex_groups}; moved = 0.0; nv = 0
    for v in o.data.vertices:
        if f[v.index] <= 0: continue
        take = 0.0
        for g in v.groups:
            nm = idx[g.group]
            if nm in JN and JN.index(nm) in ARM and g.weight > 0:
                dw = g.weight * f[v.index]; take += dw; gi[nm].add([v.index], g.weight - dw, 'REPLACE')
        if take > 0:
            cur = 0.0
            for g in v.groups:
                if idx[g.group] == 'spine02': cur = g.weight
            gi['spine02'].add([v.index], cur + take, 'REPLACE'); moved += take; nv += 1
    print('chest reweight', o.name, 'verts', nv, 'arm weight moved %.1f' % moved)
for o in (L, M, T, SN): chest_reweight(o)
for o in (L, T):
    for p in o.data.polygons: p.use_smooth = True
bpy.ops.wm.save_as_mainfile(filepath=H + '/skin.blend')
# ---- dump for the GLB writer (same as s80's)
def weights(o):
    W = np.zeros((len(o.data.vertices), len(JN)), np.float32); gi = {g.index: JN.index(g.name) for g in o.vertex_groups if g.name in JN}
    for v in o.data.vertices:
        for g in v.groups:
            if g.group in gi: W[v.index, gi[g.group]] = g.weight
    return W
def cap(W):
    J4 = np.argsort(-W, 1)[:, :4]; W4 = np.take_along_axis(W, J4, 1); W4 = np.clip(W4, 0, None)
    W4[W4 < 0.01] = 0; W4 /= np.maximum(W4.sum(1, keepdims=True), 1e-9); J4 = np.where(W4 > 0, J4, 0); return J4, W4
for o in (L, M, T, SN):
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()
os.makedirs(H + '/export', exist_ok=True)
info = {}
for o, name in ((L, 'leather'), (M, 'hardware'), (T, 'zip-tape'), (SN, 'snaps')):
    m = o.data; m.calc_loop_triangles(); has_uv = len(m.uv_layers) > 0
    if has_uv: m.calc_tangents(uvmap=m.uv_layers[0].name)
    keys = {}; pos = []; nor = []; uv = []; tan = []; jj = []; ww = []; tri = []
    Wv = weights(o); Jv, Wv4 = cap(Wv)
    for lt in m.loop_triangles:
        t_ = []
        for li in lt.loops:
            l = m.loops[li]; vi = l.vertex_index
            u = tuple(np.round(m.uv_layers[0].data[li].uv, 6)) if has_uv else (0.0, 0.0)
            key = (vi, u, tuple(np.round(l.normal, 4)))
            if key not in keys:
                keys[key] = len(pos); pos.append(m.vertices[vi].co[:]); nor.append(l.normal[:]); uv.append((u[0], 1 - u[1]))
                tan.append((*l.tangent[:], l.bitangent_sign) if has_uv else (1, 0, 0, 1)); jj.append(Jv[vi]); ww.append(Wv4[vi])
            t_.append(keys[key])
        tri.append(t_)
    pos = lib.b2g(np.array(pos)).astype(np.float32); nor = lib.b2g(np.array(nor)).astype(np.float32)
    tan = np.array(tan, np.float32); tg = lib.b2g(tan[:, :3]).astype(np.float32); tan = np.concatenate([tg, tan[:, 3:]], 1)
    for arr, nm in ((pos, 'pos'), (nor, 'nor'), (np.array(uv, np.float32), 'uv'), (tan, 'tan'), (np.array(jj, np.uint16), 'j'), (np.array(ww, np.float32), 'w'), (np.array(tri, np.uint32).ravel(), 'idx')):
        arr.tofile(H + f'/export/{name}.{nm}.bin')
    info[name] = {'verts': len(pos), 'tris': len(tri)}
json.dump(info, open(H + '/export/info.json', 'w')); print('dump', info)
