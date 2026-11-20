import bpy, bmesh, sys
B = sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=B+'/jensen-plain.glb')
for o in bpy.data.objects: print('OBJ', o.name, o.type, o.parent.name if o.parent else None, [m.name for m in o.data.materials] if o.type=='MESH' else '', len(o.data.vertices) if o.type=='MESH' else '')
body = max([o for o in bpy.data.objects if o.type=='MESH'], key=lambda o: len(o.data.vertices))
drop = {i for i,m in enumerate(body.data.materials) if m and m.name in ('hair','hairCap','brows')}
bm = bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in drop], context='FACES')
loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
bm.to_mesh(body.data); bm.free()
print('body', body.name, len(body.data.vertices), 'shapekeys', len(body.data.shape_keys.key_blocks) if body.data.shape_keys else 0)
arm = [o for o in bpy.data.objects if o.type=='ARMATURE'][0]
hb = arm.data.bones['head']; print('head bone', arm.matrix_world @ hb.head_local, arm.matrix_world @ hb.tail_local, arm.matrix_world)
bpy.ops.wm.save_as_mainfile(filepath=B+'/prep.blend')
