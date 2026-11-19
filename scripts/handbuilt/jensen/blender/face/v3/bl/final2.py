# owner-facing renders: front, 3/4, profile (720x900), webcam (1280x720), close 3/4 (1280x720), neck-side close
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import scene
a = sys.argv[sys.argv.index('--') + 1:]; glb, out = a[0], a[1]
o = scene.load(glb); E = scene.eye_center(o); light = scene.studio(res=(720, 900)); scene.rig(light, E)
sc = bpy.context.scene
for v, d in (('front', 0.62), ('34', 0.62), ('profile', 0.66)):
    scene.camera(E, v, lens=85, dist=d, dz=-0.035); sc.render.filepath = out + '-' + v + '.jpg'; bpy.ops.render.render(write_still=True)
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
scene.camera(E, 'webcam', lens=28, dist=0.62, dz=-0.07); sc.render.filepath = out + '-webcam.jpg'; bpy.ops.render.render(write_still=True)
scene.camera(E, '34', lens=85, dist=0.42, dz=-0.04); sc.render.filepath = out + '-close34.jpg'; bpy.ops.render.render(write_still=True)
scene.camera(E, 'profile', lens=85, dist=0.42, dz=-0.09, side=-1); sc.render.filepath = out + '-neck.jpg'; bpy.ops.render.render(write_still=True)
