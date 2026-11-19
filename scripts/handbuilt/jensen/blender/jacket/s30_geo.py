# Step 3: garment construction on the draped shell: elbow creases and wrist stacking, padded shoulder panels, the
# centre-front opening for the zip (two fronts), turned leather edges (hem, fronts, cuffs), the stand-up band collar
# and its two snap tabs. Saves geo.blend (objects jk, collar, tabs; collar/tab (s,v) params kept as attributes).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/sim.blend')
import lib
from common import *
o = bpy.data.objects['jk']; me = o.data
for g in list(o.vertex_groups): o.vertex_groups.remove(g)
bm = bmesh.new(); bm.from_mesh(me); bm.normal_update(); lay = bm.verts.layers.int.new('lip')
rng = np.random.default_rng(7)
# ---- 0. relax the draped shell (keeps its folds, loses facets), harder round the armpits where the fit pinched
def relax(vs, k, its):
    for it in range(its):
        new = {}
        for v in vs:
            if v.is_boundary: continue
            nb = [e.other_vert(v).co for e in v.link_edges]; c = sum(nb, Vector()) / len(nb)
            d = c - v.co; new[v] = v.co + (d - v.normal * d.dot(v.normal) * 0.35) * k
        for v, c in new.items(): v.co = c
        bm.normal_update()
relax(bm.verts[:], 0.35, 3)
pits = [Vector((s_ * 0.155, -0.04, 1.31)) for s_ in (1, -1)]
near = [v for v in bm.verts if min((v.co - p).length for p in pits) < 0.10]
relax(near, 0.5, 12)
# ---- 1. creases: compression rings at the inner elbow, stacking above the cuff, soft folds across the small of the back
for v in bm.verts:
    p = v.co; d = 0.0
    for s in ('L', 'R'):
        if (p.x > 0) != (s == 'L') or abs(p.x) < 0.2: continue
        t, ph, r, L = arm_frame(s, p); E = (J['lowerarm01_' + s] - J['upperarm01_' + s]).length
        # elbow: rings at ~4.5 cm, strongest on the inner (front) side, a slight twist so they read as folds not rings
        k = math.exp(-((t - E) / 0.065) ** 2); inner = 0.35 + 0.65 * max(0.0, math.cos(ph))
        d += 0.0042 * k * inner * math.sin(2 * math.pi * (t + 0.010 * math.sin(2 * ph + 0.7)) / 0.046)
        # wrist stack: shallow, closer folds just above the cuff band
        kw = math.exp(-((t - (L - 0.10)) / 0.045) ** 2)
        d += 0.0022 * kw * math.sin(2 * math.pi * (t + 0.006 * math.sin(3 * ph)) / 0.034)
        # the sleeve's underside (armpit) gathers a little
        ka = math.exp(-((t - 0.05) / 0.05) ** 2) * max(0.0, -math.cos(ph - 0.0)) if False else 0.0
    if abs(p.x) < 0.2 and p.y > 0.04:  # back: two soft horizontal folds at the waist
        kb = math.exp(-((p.z - 1.06) / 0.07) ** 2) * (1 - abs(p.x) / 0.2)
        d += 0.0018 * kb * math.sin(2 * math.pi * (p.z + 0.02 * math.sin(p.x * 18)) / 0.07)
    v.co = p + v.normal * d
# ---- 2. padded shoulder panels: an oval over each shoulder cap, puffed 3.5 mm, its edge a sewn step
def shoulder_panel(s):
    A, B, C = arm(s); u = (B - A).normalized(); up = (Vector((0, 0, 1)) - u * u.z).normalized(); w = u.cross(up).normalized()
    c = A + u * 0.03 + up * 0.03 + Vector((0, -0.008, 0))
    return c, u, up, w
def panel_metric(s, p):
    c, u, up, w = shoulder_panel(s); dp = p - c
    m = math.sqrt((dp.dot(u) / 0.095) ** 2 + (dp.dot(w) / 0.078) ** 2)
    return m if dp.dot(up) > -0.035 else 9.0
for v in bm.verts:
    for s in ('L', 'R'):
        if (v.co.x > 0) != (s == 'L'): continue
        m = panel_metric(s, v.co)
        if m < 1.08:
            e = min(1.0, max(0.0, (1.08 - m) / 0.16)); e = e * e * (3 - 2 * e)
            v.co += v.normal * 0.0028 * e
bm.normal_update()
# ---- 3. the centre-front opening: cut at x = 0 on the front, the two fronts drawn apart for the zip chain
front = [f for f in bm.faces if f.calc_center_median().y < -0.02 and abs(f.calc_center_median().x) < 0.05]
fv = set(v for f in front for v in f.verts); fe = set(e for f in front for e in f.edges)
bmesh.ops.bisect_plane(bm, geom=list(fv) + list(fe) + front, plane_co=(0, 0, 0), plane_no=(1, 0, 0), dist=0.0004)
cut = [e for e in bm.edges if all(abs(v.co.x) < 1e-5 and v.co.y < -0.02 for v in e.verts) and len(e.link_faces) == 2]
bmesh.ops.split_edges(bm, edges=cut)
# which side each vertex now belongs to (by its faces), then the fronts moved apart near the edge
for v in bm.verts:
    if abs(v.co.x) < 0.03 and v.co.y < -0.02:
        sx = sum(f.calc_center_median().x for f in v.link_faces)
        sgn = 1 if sx > 0 else -1
        k = max(0.0, 1 - abs(v.co.x) / 0.03); v.co.x += sgn * GAP * (k ** 2 * (3 - 2 * k))
bmesh.ops.dissolve_degenerate(bm, dist=0.0006, edges=bm.edges[:])
bm.normal_update()
# ---- 4. turned edges: the leather's thickness rolled under at the hem, the two fronts and the cuffs (not the neckline,
# the collar is sewn there); each edge a rounded lip then a 1.2 cm facing on the inside
def is_neck(v): return v.co.z > 1.425 and (v.co.x / 0.09) ** 2 + (v.co.y / 0.1) ** 2 < 1.0 and abs(v.co.x) > GAP * 0.6 + 0.0005 or (v.co.z > 1.44 and abs(v.co.x) > 0.0015)
bedges = [e for e in bm.edges if e.is_boundary]
bverts = set(v for e in bedges for v in e.verts)
neckv = set(v for v in bverts if is_neck(v))
lipedges = [e for e in bedges if not (e.verts[0] in neckv and e.verts[1] in neckv)]
lipverts = set(v for e in lipedges for v in e.verts)
LIP = {}
for v in lipverts:
    n = v.normal.copy()
    inner = [e.other_vert(v).co for e in v.link_edges if not e.is_boundary]
    c = sum(inner, Vector()) / max(1, len(inner)) if inner else v.co
    t = v.co - c; t -= n * t.dot(n); t = t.normalized() if t.length > 1e-9 else Vector((0, 0, -1))
    rows = [v.co + t * 0.0010 - n * 0.0012, v.co + t * 0.0010 - n * 0.0030, v.co - n * 0.0040, v.co - n * 0.0042 - t * 0.012]
    LIP[v] = [bm.verts.new(r) for r in rows]
for e in lipedges:
    a, b = e.verts
    if a not in LIP or b not in LIP: continue
    f0 = e.link_faces[0]
    # keep the lip's winding consistent with the face it hangs from
    loop = [l for l in f0.loops if l.edge == e][0]; a, b = (loop.vert, loop.link_loop_next.vert)
    chain_a = [a] + LIP[a]; chain_b = [b] + LIP[b]
    for i in range(len(chain_a) - 1):
        try: bm.faces.new([chain_b[i], chain_a[i], chain_a[i + 1], chain_b[i + 1]])
        except ValueError: pass
lipset = set(x for L in LIP.values() for x in L)
for v in lipset: v[lay] = 1
bm.normal_update()
# the neckline chain, ordered from his left front end round the back to his right front end
nk = [v for v in neckv]
ang = lambda v: math.atan2(v.co.x, -v.co.y)  # 0 centre front, +pi/-pi at back
nk.sort(key=lambda v: (ang(v) if ang(v) > 0 else ang(v) + 2 * math.pi))
chain = [v.co.copy() for v in nk]
bm.to_mesh(me); bm.free(); me.update()
print('jacket', len(me.vertices), 'neck chain', len(chain), 'lip verts', len(lipverts))
# ---- 5. the band collar from the neckline chain: resampled evenly, its front ends square with a rounded top corner
P = np.array([c[:] for c in chain])
seg = np.linalg.norm(np.diff(P, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)]); Ltot = s[-1]
# smooth the chain a little
for it in range(6): P[1:-1] = P[1:-1] * 0.5 + (P[:-2] + P[2:]) * 0.25
def at(sv):
    return np.array([np.interp(sv, s, P[:, k]) for k in range(3)])
# fine columns near the ends (rounded corners), 5 mm elsewhere
cols = list(np.arange(0, 0.012, 0.002)) + list(np.arange(0.012, Ltot - 0.012, 0.005)) + list(Ltot - np.arange(0.012, -0.0001, -0.002))
cols = np.unique(np.clip(cols, 0, Ltot))
RC = 0.009
def height(sv, p):
    fr = np.clip((p[1] + 0.086) / 0.16, 0, 1)   # 0 front, 1 back
    h = 0.040 + 0.007 * fr
    d = min(sv, Ltot - sv)
    if d < RC: h -= RC - math.sqrt(max(0.0, RC * RC - (RC - d) ** 2))
    return h
TH = 0.0034
rows_out = np.linspace(0.0, 1.0, 9)
cv = []; cuv = []; grid = []
def frame(p):
    r = Vector((p[0], p[1] - NECK_EY, 0)).normalized(); up = Vector((0, 0, 1)); tilt = math.radians(14)
    d = (up * math.cos(tilt) - r * math.sin(tilt)).normalized(); return r, d
for ci, sv in enumerate(cols):
    p = Vector(at(sv)); r, d = frame(p); h = height(sv, p); col = []
    base = p + r * 0.0022
    for vv in rows_out:  # outer face, bottom (tucked 2.5 mm under the neckline) to top
        q = base + d * (h * vv) - r * 0.0015 * max(0, vv) ** 2; col.append((q, sv, h * vv))
    top = base + d * h - r * 0.0015
    for k in range(1, 5):  # rolled top edge
        a = math.pi * k / 5; q = top + d * (TH / 2) * math.sin(a) - r * (TH / 2) * (1 - math.cos(a)); col.append((q, sv, h + TH / 2 * a))
    for vv in np.linspace(1.0, -0.12, 7):  # inner face back down
        q = base + d * (h * vv) - r * (TH + 0.0015 * max(0, vv) ** 2); col.append((q, sv, h + TH * math.pi / 2 + h * (1 - vv)))
    grid.append(col)
cm_ = bpy.data.meshes.new('collar'); bmc = bmesh.new()
V = [[bmc.verts.new(q) for (q, _, _) in col] for col in grid]
uvl = bmc.loops.layers.uv.new('UV0')
nR = len(grid[0])
for i in range(len(grid) - 1):
    for j in range(nR - 1):
        f = bmc.faces.new([V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]])
        for l, (ii, jj) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
            l[uvl].uv = (grid[ii][jj][1], grid[ii][jj][2])
# end caps (the band's thickness at each front end)
for i in (0, len(grid) - 1):
    for j in range(nR // 2):
        a, b = V[i][j], V[i][nR - 1 - j]; a2, b2 = V[i][j + 1], V[i][nR - 2 - j]
        if a2 == b2 or a2 == b: continue
        try:
            f = bmc.faces.new([a, a2, b2, b] if i == 0 else [b, b2, a2, a])
            for l in f.loops: l[uvl].uv = (-0.02 if i == 0 else Ltot + 0.02, 0.0)
        except ValueError: pass
bmesh.ops.recalc_face_normals(bmc, faces=bmc.faces[:])
bmc.to_mesh(cm_); bmc.free()
col_o = bpy.data.objects.new('collar', cm_); bpy.context.scene.collection.objects.link(col_o)
cm_.polygons.foreach_set('use_smooth', [True] * len(cm_.polygons))
col_o['Ltot'] = float(Ltot)
np.save(H + '/collar_chain.npy', np.stack([np.array([at(sv) for sv in cols]).T[k] for k in range(3)], 1))
np.save(H + '/collar_cols.npy', cols)
print('collar', len(cm_.vertices), 'L', Ltot)
# collar outer surface as a function (s, height) -> point, normal (for the tabs, snaps, zip top)
def collar_pt(sv, hh, off=0.0):
    p = Vector(at(np.clip(sv, 0, Ltot))); r, d = frame(p); base = p + r * 0.0022
    hmax = height(sv, p); vv = hh / hmax if hmax > 0 else 0
    q = base + d * hh - r * 0.0015 * max(0, vv) ** 2
    return q + r * off, r
# ---- 6. snap tabs. A: on his right side of the band, near the front; B: on his left, at the collar's foot on the chest
jb = bmesh.new(); jb.from_mesh(me); jb.normal_update(); jbvh = BVHTree.FromBMesh(jb)
def rrect(w, h, rad, n_c=5):
    pts = []
    for cx, cy, a0 in [(w / 2 - rad, h / 2 - rad, 0), (-w / 2 + rad, h / 2 - rad, 90), (-w / 2 + rad, -h / 2 + rad, 180), (w / 2 - rad, -h / 2 + rad, 270)]:
        for k in range(n_c + 1):
            a = math.radians(a0 + 90 * k / n_c); pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts
tb = bmesh.new(); tuv = tb.loops.layers.uv.new('UV0'); snaps = []
def slab(place, w, h, rad, th, uvoff):
    """place(x, y, off) -> (point, normal); builds a rounded-rect leather tab 'th' thick with rounded edge"""
    outline = rrect(w, h, rad)
    rings = []
    prof = [(0.0, 0.0), (0.0006, th * 0.25), (0.0009, th * 0.6), (0.0005, th * 0.95), (0.0, th)]  # inset, height
    for (ins, z) in prof:
        sc_x = (w / 2 - ins) / (w / 2); sc_y = (h / 2 - ins) / (h / 2)
        rings.append([tb.verts.new(place(x * sc_x, y * sc_y, z)[0]) for (x, y) in outline])
    for k in range(len(rings) - 1):
        A_, B_ = rings[k], rings[k + 1]; n = len(A_)
        for i in range(n):
            f = tb.faces.new([A_[i], A_[(i + 1) % n], B_[(i + 1) % n], B_[i]])
            for l, (xx, yy) in zip(f.loops, [outline[i], outline[(i + 1) % n], outline[(i + 1) % n], outline[i]]):
                l[tuv].uv = (uvoff[0] + xx, uvoff[1] + yy)
    ctr = tb.verts.new(place(0, 0, th)[0]); n = len(rings[-1])
    for i in range(n):
        f = tb.faces.new([rings[-1][i], rings[-1][(i + 1) % n], ctr])
        for l, (xx, yy) in zip(f.loops, [outline[i], outline[(i + 1) % n], (0, 0)]): l[tuv].uv = (uvoff[0] + xx, uvoff[1] + yy)
# tab A on the band, his right side (the chain's far end is his right front)
sA0 = Ltot - 0.040
def placeA(x, y, z):
    q, r = collar_pt(sA0 - x, 0.021 + y, 0.0006 + z); return q, r
slab(placeA, 0.046, 0.019, 0.008, 0.0026, (10.0, 0.0))
for x in (-0.009, 0.009):
    q, r = placeA(x - 0.004, 0, 0.0026); snaps.append((q, r))
# tab B: on his left, from the collar's foot down onto the chest, tipped 25 degrees outward
cB = Vector((0.050, -0.095, 1.415))
co, nB, _, _ = jbvh.find_nearest(cB); cB = co
upB = Vector((0, 0, 1)); upB = (upB - nB * upB.dot(nB)).normalized(); rtB = upB.cross(nB).normalized()
ang = math.radians(-28); ax = (rtB * math.cos(ang) + upB * math.sin(ang)); ay = nB.cross(ax)
def placeB(x, y, z):
    q = cB + ax * x + ay * y
    hit, n, _, _ = jbvh.find_nearest(q)
    return hit + n * (0.0012 + z), n
slab(placeB, 0.044, 0.018, 0.008, 0.0026, (12.0, 0.0))
for x in (-0.009, 0.009):
    q, n = placeB(x + 0.004, 0, 0.0026); snaps.append((q, n))
tbm = bpy.data.meshes.new('tabs'); bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:]); tb.to_mesh(tbm); tb.free()
tabs = bpy.data.objects.new('tabs', tbm); bpy.context.scene.collection.objects.link(tabs); tbm.polygons.foreach_set('use_smooth', [True] * len(tbm.polygons))
np.save(H + '/snaps.npy', np.array([list(q) + list(n) for q, n in snaps]))
# zip top: where the chain meets the collar top at centre front
zt = [collar_pt(0.0, height(0.0, Vector(at(0.0))) - 0.002)[0], collar_pt(Ltot, height(Ltot, Vector(at(Ltot))) - 0.002)[0]]
np.save(H + '/ziptop.npy', np.array([list(z) for z in zt]))
jb.free()
bpy.ops.wm.save_as_mainfile(filepath=H + '/geo.blend')
print('done')
