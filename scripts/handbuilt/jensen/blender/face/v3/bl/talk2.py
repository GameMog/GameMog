# talk/blink strip: render the GLB's own baked morph targets (shape keys) on the head
#   blender -b --python talk.py -- in.glb outprefix sculpt(0|1)
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import scene
a = sys.argv[sys.argv.index('--') + 1:]; glb, out = a[0], a[1]; do = a[2] == '1'
o = scene.load(glb)
pass
if os.environ.get('MAPS'): scene.apply_maps(os.environ['MAPS'])
E = scene.eye_center(o); light = scene.studio(res=(480, 600)); scene.rig(light, E)
scene.camera(E, os.environ.get('VIEW', 'front'), lens=85, dist=0.48, dz=-0.04)
KBS = [ob.data.shape_keys.key_blocks for ob in bpy.data.objects if ob.type=='MESH' and ob.data.shape_keys]; kb = o.data.shape_keys.key_blocks
poses = [('neutral', {}), ('blink', {'eyeBlinkLeft': 1, 'eyeBlinkRight': 1}), ('jawOpen', {'jawOpen': 0.55}),
         ('aa', {'viseme_aa': 1, 'jawOpen': 0.2}), ('O', {'viseme_O': 1}), ('E', {'viseme_E': 1}), ('PP', {'viseme_PP': 1}), ('FF', {'viseme_FF': 1}),
         ('smile', {'mouthSmileLeft': 0.45, 'mouthSmileRight': 0.45, 'cheekSquintLeft': 0.25, 'cheekSquintRight': 0.25, 'eyeSquintLeft': 0.14, 'eyeSquintRight': 0.14}),
         ('question', {'browInnerUp': 0.8, 'browOuterUpLeft': 0.4, 'browOuterUpRight': 0.4, 'viseme_I': 0.6})]
for name, w in poses:
    for K_ in KBS:
        for k in K_[1:]: k.value = 0
    for k, v in w.items():
        if k in kb:
            for K_ in KBS:
                if k in K_: K_[k].value = v
        else: print('MISSING', k)
    bpy.context.scene.render.filepath = out + '-' + name + '.jpg'; bpy.ops.render.render(write_still=True)
print('POSES', ','.join(p[0] for p in poses))
