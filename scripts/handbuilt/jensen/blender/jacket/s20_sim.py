# Step 2: drape the fitted form on the body with a cloth sim (leather: heavy, stiff in bending), pinned softly at the
# shoulders/neck so it hangs from them, the body as the collider. Saves sim.blend ('jk' with the drape applied).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np, time
from mathutils import Vector
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/form.blend')
import lib
J = {j['name']: Vector(lib.g2b(j['bind'])[0]) for j in lib.JOINTS}
o = bpy.data.objects['jk']
fb = lib.load_fullbody(None)
col = fb.modifiers.new('col', 'COLLISION'); fb.collision.thickness_outer = 0.004; fb.collision.thickness_inner = 0.01; fb.collision.cloth_friction = 12; fb.collision.damping = 0.8
# it2: the jeans' waistband collides too (the hem band overlaps it)
from common import HEM
JP = lib.g2b(lib.rd('p12', 'pos', 'Float32Array')); JT = lib.rd('p12', 'idx', 'Uint16Array').reshape(-1, 3).astype(np.int64)
JT = JT[(JP[JT][:, :, 2] > HEM - 0.04).all(1)]
jm = bpy.data.meshes.new('jeans'); jm.from_pydata(JP.tolist(), [], JT.tolist()); jm.validate(); jo = bpy.data.objects.new('jeans', jm); bpy.context.scene.collection.objects.link(jo)
jo.modifiers.new('col', 'COLLISION'); jo.collision.thickness_outer = 0.003; jo.collision.thickness_inner = 0.006; jo.collision.cloth_friction = 12
# pin weights: hangs from the shoulders, neckline and the top of the sleeves; a whisper everywhere so it keeps its cut
vg = o.vertex_groups.new(name='pin')
sh = J['shoulder01_L'].z
for v in o.data.vertices:
    p = v.co; w = 0.04
    if abs(p.x) < 0.2: w = max(w, min(1.0, max(0, (p.z - (sh - 0.10)) / 0.12)) ** 1.5)  # yoke
    if v.co.z > 1.40 and abs(p.x) < 0.11: w = 1.0
    for s in ('L', 'R'):  # sleeve cap
        a = J['upperarm01_' + s]
        if (p - a).length < 0.07: w = max(w, 0.8)
        wr = J['wrist_' + s]
        if (p - wr).length < 0.06: w = max(w, 0.25)
    vg.add([v.index], w, 'REPLACE')
cm = o.modifiers.new('cloth', 'CLOTH'); cs = cm.settings
cs.quality = 6; cs.mass = 0.4; cs.air_damping = 1.5
cs.tension_stiffness = 80; cs.compression_stiffness = 80; cs.shear_stiffness = 80; cs.bending_stiffness = 60
cs.tension_damping = 25; cs.compression_damping = 25; cs.shear_damping = 25; cs.bending_damping = 0.5
cs.vertex_group_mass = 'pin'; cs.pin_stiffness = 2.0
cs.use_internal_springs = False; cs.use_pressure = False
cc = cm.collision_settings; cc.collision_quality = 4; cc.distance_min = 0.004; cc.use_self_collision = False
sc = bpy.context.scene; sc.frame_start = 1; sc.frame_end = 36; cm.point_cache.frame_start = 1; cm.point_cache.frame_end = 36
t0 = time.time()
for f in range(1, 37):
    sc.frame_set(f)
    if f % 6 == 0: print('frame', f, round(time.time() - t0, 1), flush=True)
dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
co = np.array([v.co[:] for v in ev.data.vertices]); co0 = np.array([v.co[:] for v in o.data.vertices])
d = np.linalg.norm(co - co0, axis=1); print('moved: mean %.4f p95 %.4f max %.4f' % (d.mean(), np.percentile(d, 95), d.max()))
o.modifiers.remove(cm); o.data.vertices.foreach_set('co', co.ravel()); o.data.update()
o['sim_moved_mean'] = float(d.mean())
bpy.data.objects.remove(fb); bpy.data.objects.remove(jo)
bpy.ops.wm.save_as_mainfile(filepath=H + '/sim.blend')
