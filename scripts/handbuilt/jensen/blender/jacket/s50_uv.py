# Step 5: the leather pieces as one mesh ('leather': body shell + turned edges + collar + tabs), lightly decimated to the
# hero budget, cut into the jacket's real pattern panels (fronts, back, yokes, hem band, two-piece sleeves, cuffs,
# shoulder panels, collar, tabs, facings) and unwrapped along those panel seams into one atlas. A face attribute
# 'panel' records each face's panel. Saves uv.blend.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np, math
from mathutils import Vector
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/hw.blend')
import lib
from common import *
jk = bpy.data.objects['jk']; collar = bpy.data.objects['collar']; tabs = bpy.data.objects['tabs']
# decimate the shell (not its turned edges) toward ~17k triangles
lipattr = jk.data.attributes.get('lip')
vg = jk.vertex_groups.new(name='keep')
lipv = [i for i, d in enumerate(lipattr.data) if d.value] if lipattr else []
vg.add(list(range(len(jk.data.vertices))), 0.0, 'REPLACE'); vg.add(lipv, 1.0, 'REPLACE')
ntri = sum(len(p.vertices) - 2 for p in jk.data.polygons)
bpy.context.view_layer.objects.active = jk; jk.select_set(True)
md = jk.modifiers.new('dec', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = min(1.0, 17000 / ntri); md.use_symmetry = True; md.symmetry_axis = 'X'
md.vertex_group = 'keep'; md.invert_vertex_group = True; md.vertex_group_factor = 1.0
bpy.ops.object.modifier_apply(modifier='dec')
print('shell tris', ntri, '->', sum(len(p.vertices) - 2 for p in jk.data.polygons))
# panel ids
PANELS = ['front_L', 'front_R', 'back', 'yoke_front_L', 'yoke_front_R', 'yoke_back', 'band', 'sleeve_top_L', 'sleeve_under_L', 'sleeve_top_R',
          'sleeve_under_R', 'cuff_L', 'cuff_R', 'shoulder_L', 'shoulder_R', 'facing', 'collar', 'tab']
def classify(c, is_lip):
    if is_lip: return PANELS.index('facing')
    for s in ('L', 'R'):
        if (c.x > 0) != (s == 'L') or abs(c.x) < 0.11: continue
        pt, n = armhole(s)
        if (c - pt).dot(n) > 0:
            t, ph, r, L = arm_frame(s, c)
            if t > L - CUFF: return PANELS.index('cuff_' + s)
            # padded shoulder panel (same oval as the puff in s30)
            if shoulder_metric(s, c) < 1.0: return PANELS.index('shoulder_' + s)
            return PANELS.index(('sleeve_top_' if math.cos(ph - math.radians(90)) > 0 else 'sleeve_under_') + s)
    for s in ('L', 'R'):
        if (c.x > 0) == (s == 'L') and abs(c.x) > 0.11 and shoulder_metric(s, c) < 1.0: return PANELS.index('shoulder_' + s)
    if c.z < HEM + BAND: return PANELS.index('band')
    f = abs(phi(c)) < SIDE_PHI
    side = 'L' if c.x > 0 else 'R'
    if f: return PANELS.index(('yoke_front_' if c.z > YOKE_F else 'front_') + side)
    return PANELS.index('yoke_back' if c.z > YOKE_B else 'back')
bm = bmesh.new(); bm.from_mesh(jk.data)
la = bm.verts.layers.int.get('lip')
pid = bm.faces.layers.int.new('panel')
for f in bm.faces:
    is_lip = all(v[la] for v in f.verts) if la else False
    if la and sum(v[la] for v in f.verts) >= 2 and not is_lip: is_lip = True
    f[pid] = classify(f.calc_center_median(), is_lip)
# majority-smooth the labels twice so seams don't zig-zag face by face
for it in range(2):
    new = {}
    for f in bm.faces:
        if f[pid] == PANELS.index('facing'): continue
        nb = [g[pid] for e in f.edges for g in e.link_faces if g is not f]
        if nb:
            vals, cnt = np.unique(nb, return_counts=True)
            if cnt.max() >= 2 and vals[cnt.argmax()] != f[pid] and f[pid] not in nb: new[f] = int(vals[cnt.argmax()])
            elif cnt.max() >= 3 and vals[cnt.argmax()] != f[pid]: new[f] = int(vals[cnt.argmax()])
    for f, v in new.items(): f[pid] = v
for e in bm.edges:
    lf = e.link_faces
    e.seam = len(lf) == 2 and lf[0][pid] != lf[1][pid]
bm.to_mesh(jk.data); bm.free()
for ob, name in ((collar, 'collar'), (tabs, 'tab')):
    a = ob.data.attributes.new('panel', 'INT', 'FACE'); a.data.foreach_set('value', [PANELS.index(name)] * len(ob.data.polygons))
# keep each piece's own sewing coordinate before its UVs are replaced: the collar's height along its profile, a tab's
# distance in from its outline
def rr_sdf(x, y, w, h, r):
    qx, qy = abs(x) - (w / 2 - r), abs(y) - (h / 2 - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
for ob in (jk, collar, tabs):
    a = ob.data.attributes.new('aux', 'FLOAT', 'POINT'); vals = [0.0] * len(ob.data.vertices)
    if ob is not jk:
        uvd = ob.data.uv_layers[0].data
        for l in ob.data.loops:
            u, v = uvd[l.index].uv
            if ob is collar: vals[l.vertex_index] = v
            else:
                if u > 11: vals[l.vertex_index] = -rr_sdf(u - 12, v, TAB_W, TAB_H, 0.0065)
                else: vals[l.vertex_index] = -rr_sdf(u - 10, v, TAB_W, TAB_H, 0.0065)
    a.data.foreach_set('value', vals)
for ob in (collar, tabs):
    for uvl in list(ob.data.uv_layers): ob.data.uv_layers.remove(uvl)
# collar seam: down the centre back so the band unrolls flat
bmc = bmesh.new(); bmc.from_mesh(collar.data)
for e in bmc.edges:
    a, b = e.verts
    if a.co.y > 0.04 and b.co.y > 0.04 and (a.co.x > 0) != (b.co.x > 0): pass
    xs = [v.co.x for v in e.verts]
    if e.verts[0].co.y > 0.04 and abs(xs[0]) < 0.0026 and abs(xs[1]) < 0.0026: e.seam = True
bmc.to_mesh(collar.data); bmc.free()
# tabs: seam round the top's outline (the face and the edge roll unwrap separately) -- it2: actually marked
bmt = bmesh.new(); bmt.from_mesh(tabs.data); bmt.normal_update()
for e in bmt.edges:
    if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(40): e.seam = True
bmt.to_mesh(tabs.data); bmt.free()
# join into 'leather'
for ob in bpy.data.objects: ob.select_set(False)
for ob in (jk, collar, tabs): ob.select_set(True)
bpy.context.view_layer.objects.active = jk; bpy.ops.object.join(); L = jk; L.name = 'leather'; L.data.name = 'leather'
for uvl in list(L.data.uv_layers): L.data.uv_layers.remove(uvl)
L.data.uv_layers.new(name='UV0')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.003)
bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin_method='FRACTION', margin=0.0035, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
# texel density and stretch: metres per UV unit, per face
me = L.data; uv = np.zeros(len(me.loops) * 2); me.uv_layers['UV0'].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
ratios = []
for p in me.polygons:
    li = list(p.loop_indices); vs = [me.vertices[me.loops[i].vertex_index].co for i in li]
    a3 = sum(((vs[0] - vs[k]).cross(vs[0] - vs[k + 1])).length / 2 for k in range(1, len(vs) - 1))
    u = uv[li]; a2 = sum(abs(np.cross(u[0] - u[k], u[0] - u[k + 1])) / 2 for k in range(1, len(u) - 1))
    if a3 > 1e-9 and a2 > 1e-12: ratios.append(math.sqrt(a3 / a2))
ratios = np.array(ratios); print('m per UV unit: median %.4f p5 %.4f p95 %.4f' % (np.median(ratios), np.percentile(ratios, 5), np.percentile(ratios, 95)))
L['m_per_uv'] = float(np.median(ratios))
# convexity per vertex (ridges + / creases -): feeds edge wear and the cavity dark
bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
cv = []
for v in bm.verts:
    nb = [e.other_vert(v).co for e in v.link_edges]
    if not nb: cv.append(0.0); continue
    c = sum(nb, Vector()) / len(nb); el = sum((x - v.co).length for x in nb) / len(nb)
    cv.append(-(c - v.co).dot(v.normal) / max(el * el, 1e-8) * 0.01)
bm.free()
a = me.attributes.new('convex', 'FLOAT', 'POINT'); a.data.foreach_set('value', cv)
print('convexity p5/p50/p95', np.percentile(cv, [5, 50, 95]))
import json; json.dump(PANELS, open(H + '/panels.json', 'w'))
print('leather tris', sum(len(p.vertices) - 2 for p in me.polygons), 'verts', len(me.vertices))
bpy.ops.wm.save_as_mainfile(filepath=H + '/uv.blend')
