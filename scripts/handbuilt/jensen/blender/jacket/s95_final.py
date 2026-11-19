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
    lib.build_prim(p, rig, name=p['mat'] + '_' + p['id'])
bpy.data.objects['leather'].data.materials.clear(); bpy.data.objects['leather'].data.materials.append(mats.leather_mat())
bpy.data.objects['metal'].data.materials.clear(); bpy.data.objects['metal'].data.materials.append(mats.metal_mat())
bpy.data.objects['tape'].data.materials.clear(); bpy.data.objects['tape'].data.materials.append(mats.tape_mat())
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
  'detail':  ('idle', 1.2, lambda: (bone('spine01') + Vector((0.45, -0.8, 0.12)), bone('spine01') + Vector((0.12, 0, 0.0)), 55), (1280, 720)),
}
for name in a[1].split(','):
    clip, t, cam, res = SHOTS[name]
    lib.apply_pose(rig, clip, t)
    sc.render.resolution_x, sc.render.resolution_y = res
    loc, at, lens = cam(); lib.shoot(co, loc, at, lens, a[0] + '/' + name + '.png'); print('SHOT', name, flush=True)
