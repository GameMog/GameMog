# preview renders of the jacket on Jensen (rest pose): -- <blend> <outprefix> <engine> [views]
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, math
from mathutils import Vector
H = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
import lib, mats
for o in list(bpy.data.objects):
    if o.name not in ('leather', 'metal', 'tape', 'snaps', 'rig') and o.type == 'MESH' and not o.name.startswith(('skin', 'eyes', 'brows', 'lashes', 'teeth', 'hair', 'glasses', 'lens', 'lenses', 'clothes', 'shoes', 'neckline')): bpy.data.objects.remove(o)
if 'rig' not in bpy.data.objects:
    for p in lib.BODY['prims']:
        if p['mat'] in ('uniform', 'uniform-hem', 'moto-collar'): continue
        lib.build_prim(p, None, name=p['mat'] + '_' + p['id'])
L = bpy.data.objects['leather']; L.data.materials.clear(); L.data.materials.append(mats.leather_mat())
bpy.data.objects['metal'].data.materials.clear(); bpy.data.objects['metal'].data.materials.append(mats.metal_mat())
bpy.data.objects['tape'].data.materials.clear(); bpy.data.objects['tape'].data.materials.append(mats.tape_mat())
bpy.data.objects['snaps'].data.materials.clear(); bpy.data.objects['snaps'].data.materials.append(mats.snap_mat())
for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True
eng = a[2] if len(a) > 2 else 'BLENDER_EEVEE'
co = lib.studio(engine=eng)
sc = bpy.context.scene
if eng == 'CYCLES': sc.cycles.samples = int(os.environ.get('SPP', 48)); sc.cycles.device = 'CPU'; sc.render.threads_mode = 'FIXED'; sc.render.threads = 6
V = {'front': ((0, -2.6, 1.30), (0, 0, 1.18), 55), 'q34': ((1.55, -2.05, 1.38), (0.02, 0, 1.2), 55), 'back': ((-0.3, 2.6, 1.35), (0, 0, 1.2), 55),
     'collar': ((0.10, -0.62, 1.50), (0.0, 0, 1.44), 70), 'chest': ((0.35, -0.75, 1.36), (0.07, 0, 1.30), 60), 'shoulder': ((0.75, -0.55, 1.45), (0.2, 0, 1.36), 60),
     'elbow': ((0.95, -0.85, 1.25), (0.3, 0, 1.2), 60), 'hem': ((0.25, -0.9, 1.0), (0.0, 0, 0.98), 55)}
views = a[3].split(',') if len(a) > 3 else ['front', 'q34', 'back', 'collar']
for v in views:
    loc, at, lens = V[v]; lib.shoot(co, loc, at, lens, a[1] + '_' + v + '.png')
print('OUTS', ' '.join(a[1] + '_' + v + '.png' for v in views))
