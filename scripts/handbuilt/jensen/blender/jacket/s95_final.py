# Final renders: the jacket on the whole Jensen (his GLB's head, hair, glasses, hands, jeans, shoes), posed with the
# game's clips. -- <outdir> <shot,...>
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, math
from mathutils import Vector
H = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=H + '/skin.blend')
import lib, mats
rig = bpy.data.objects['rig']
for p in lib.BODY['prims']:
    if p['mat'] in ('uniform', 'uniform-hem', 'moto-collar'): continue
    o_ = lib.build_prim(p, rig, name=p['mat'] + '_' + p['id'])
    if p['id'] == 'p13':   # the tee's flared hem lies under the jacket: hidden below 1.05 m (assembler: do the same)
        import bmesh as _bm; b_ = _bm.new(); b_.from_mesh(o_.data); _bm.ops.delete(b_, geom=[f for f in b_.faces if max(v.co.z for v in f.verts) < 1.05], context='FACES'); b_.to_mesh(o_.data); b_.free()
bpy.data.objects['leather'].data.materials.clear(); bpy.data.objects['leather'].data.materials.append(mats.leather_mat())
bpy.data.objects['metal'].data.materials.clear(); bpy.data.objects['metal'].data.materials.append(mats.metal_mat())
bpy.data.objects['tape'].data.materials.clear(); bpy.data.objects['tape'].data.materials.append(mats.tape_mat())
bpy.data.objects['snaps'].data.materials.clear(); bpy.data.objects['snaps'].data.materials.append(mats.snap_mat())
for o in ('leather', 'tape'):
    for p in bpy.data.objects[o].data.polygons: p.use_smooth = True
eng = os.environ.get('ENG', 'CYCLES')
co = lib.studio(engine=eng, bg=(0.035, 0.035, 0.04))
sc = bpy.context.scene
if eng == 'CYCLES':
    sc.cycles.samples = int(os.environ.get('SPP', 64)); sc.cycles.device = 'CPU'; sc.render.threads_mode = 'FIXED'; sc.render.threads = 6; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'
def bone(n): return rig.matrix_world @ rig.pose.bones[n].matrix.translation
SHOTS = {
  'front':   ('idle', 1.2, lambda: (bone('spine01') + Vector((0, -2.5, 0.05)), bone('spine01') + Vector((0, 0, -0.06)), 50), (1280, 720)),
  'q34':     ('idle', 1.2, lambda: (bone('spine01') + Vector((1.5, -1.95, 0.12)), bone('spine01') + Vector((0, 0, -0.06)), 50), (1280, 720)),
  'back':    ('idle', 1.2, lambda: (bone('spine01') + Vector((-0.6, 2.4, 0.15)), bone('spine01') + Vector((0, 0, -0.06)), 50), (1280, 720)),
  'collar':  ('idle', 1.2, lambda: (bone('neck01') + Vector((0.13, -0.50, 0.02)), bone('neck01') + Vector((0.0, -0.05, -0.035)), 55), (1280, 720)),
  'webcam':  ('sitTalk', 1.0, lambda: (bone('neck02') + Vector((0.0, -0.95, 0.06)), bone('neck02') + Vector((0, 0, -0.06)), 38), (1280, 720)),
  'gesture': ('talk', 1.4, lambda: (bone('spine01') + Vector((0.7, -2.0, 0.1)), bone('spine01') + Vector((0, 0, -0.1)), 45), (1280, 720)),
  'side':    ('idle', 1.2, lambda: (bone('spine01') + Vector((2.5, 0.0, 0.0)), bone('spine01') + Vector((0, 0, -0.10)), 50), (1280, 720)),
  'sidefull': ('idle', 1.2, lambda: (Vector((4.6, bone('spine01').y, 0.95)), Vector((0, bone('spine01').y, 0.92)), 50), (720, 1280)),
  'sitside': ('sitTalk', 1.0, lambda: (bone('spine01') + Vector((2.3, 0.0, 0.05)), bone('spine01') + Vector((0, 0, 0.0)), 50), (1280, 720)),
  'hem':     ('idle', 1.2, lambda: (bone('spine03') + Vector((0.35, -0.85, -0.02)), bone('spine03') + Vector((0.03, 0, -0.10)), 55), (1280, 720)),
  'shoulder': ('idle', 1.2, lambda: (bone('upperarm01_L') + Vector((0.45, -0.55, 0.22)), bone('upperarm01_L') + Vector((-0.03, 0, -0.04)), 55), (1280, 720)),
  'detail':  ('idle', 1.2, lambda: (bone('spine01') + Vector((0.45, -0.8, 0.12)), bone('spine01') + Vector((0.12, 0, 0.0)), 55), (1280, 720)),
}
plumb = None
for name in a[1].split(','):
    clip, t, cam, res = SHOTS[name]
    lib.apply_pose(rig, clip, t)
    if plumb: bpy.data.objects.remove(plumb); plumb = None
    if name == 'sidefull':   # a thin plumb line through the ankle (for the posture check)
        ank = (rig.matrix_world @ rig.pose.bones['foot_L'].matrix.translation + rig.matrix_world @ rig.pose.bones['foot_R'].matrix.translation) / 2
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0025, depth=1.9, location=(0.25, ank.y, 0.95)); plumb = bpy.context.object
        pm = bpy.data.materials.new('plumb'); pm.use_nodes = True; pb = pm.node_tree.nodes['Principled BSDF']; pb.inputs['Base Color'].default_value = (0.9, 0.1, 0.05, 1); pb.inputs['Emission Color'].default_value = (0.9, 0.1, 0.05, 1); pb.inputs['Emission Strength'].default_value = 2.0
        plumb.data.materials.append(pm)
    sc.render.resolution_x, sc.render.resolution_y = res
    loc, at, lens = cam(); lib.shoot(co, loc, at, lens, a[0] + '/' + name + '.png'); print('SHOT', name, flush=True)
