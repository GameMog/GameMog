# blender -b --python views.py -- in.glb outprefix [sculpt:0|1] [views]
import bpy, sys, os
sys.path.insert(0, os.path.dirname(__file__)); import scene, sculpt
a = sys.argv[sys.argv.index('--') + 1:]; glb, out = a[0], a[1]; do = a[2] == '1' if len(a) > 2 else True
views = a[3].split(',') if len(a) > 3 else ['front', '34', 'profile']
o = scene.load(glb)
if do:
    E, D, sk = sculpt.apply(o)
    if len(a) > 4: sculpt.write_target(o, D, sk, a[4], os.environ['FORGE_MH_BASE'])
import os
if os.environ.get('MAPS'): scene.apply_maps(os.environ['MAPS'])
E = scene.eye_center(o); light = scene.studio(res=(720, 900)); scene.rig(light, E)
for v in views:
    scene.camera(E, v, lens=85, dist=float(os.environ.get('DIST','0.75')), dz=-0.035)
    bpy.context.scene.render.filepath = out + '-' + v + '.jpg'; bpy.ops.render.render(write_still=True)
