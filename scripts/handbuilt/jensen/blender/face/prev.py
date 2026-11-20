import os
# blender -b --python prev.py -- in.glb sculpt.json outprefix views [target_out]
import bpy, sys, os, json
H = os.path.dirname(__file__); sys.path.insert(0, os.path.join(H, '..', 'src')); import scene, sculpt
a = sys.argv[sys.argv.index('--') + 1:]; glb, K, out, views = a[0], json.load(open(a[1])), a[2], a[3].split(',')
o = scene.load(glb)
if K.get('gain', 1) > 0:
    E, D, sk = sculpt.apply(o, K)
    if len(a) > 4: sculpt.write_target(o, D, sk, a[4], os.environ['FORGE_MH_BASE'])
if os.environ.get('NORENDER'): sys.exit(0)
E = scene.eye_center(o); light = scene.studio(res=(720, 900)); scene.rig(light, E)
for v in views:
    scene.camera(E, v, lens=85, dist=0.62, dz=-0.035)
    bpy.context.scene.render.filepath = out + '-' + v + '.jpg'; bpy.ops.render.render(write_still=True)
