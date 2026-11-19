import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]; D, OUT = a[0], a[1]; sys.path.insert(0, D); import rig
bpy.ops.import_scene.gltf(filepath=D + '/hair.glb')
for m in bpy.data.materials:
    if m.name.startswith('hair.') and m.node_tree:
        bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bs.inputs['Roughness'].default_value = 0.5; bs.inputs['Specular IOR Level'].default_value = 0.4
rig.setup(samples=int(a[2]) if len(a) > 2 else 48)
for i, v in enumerate(['front', '34', 'profile', 'top', 'hairline']):
    rig.render(f'{OUT}/hair-{i + 2:02d}-{v}.jpg', v, (1280, 720))
rig.render(f'{OUT}/hair-webcam.jpg', 'webcam', (480, 270))
bpy.ops.wm.save_as_mainfile(filepath=D + '/hair-final.blend')
