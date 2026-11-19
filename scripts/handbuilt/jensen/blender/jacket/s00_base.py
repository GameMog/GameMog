import os
import bpy, bmesh, sys
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ.get('JH_GLB', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../../storykit/handbuilt/jensen/jensen.glb')))
arm=bpy.data.objects['Armature']
print('ARM mw', arm.matrix_world, arm.parent)
for n in ['Icosphere']:
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o)
body=bpy.data.objects['Mesh_0']
print('BODY mw', body.matrix_world)
# material vertex counts
me=body.data
from collections import Counter
c=Counter(p.material_index for p in me.polygons)
for i,m in enumerate(me.materials): print('MAT',i,m.name,c[i])
# bounds of skin in world
sk=[i for i,m in enumerate(me.materials) if m.name=='skin'][0]
vs=set(v for p in me.polygons if p.material_index==sk for v in p.vertices)
co=[body.matrix_world@me.vertices[v].co for v in vs]
print('SKIN verts',len(vs),'min',[round(min(c[i] for c in co),3) for i in range(3)],'max',[round(max(c[i] for c in co),3) for i in range(3)])
for b in ['spine05','spine01','neck01','head','upperarm01_L','lowerarm01_L','wrist_L','shoulder01_L','clavicle_L','root','pelvis_L']:
    pb=arm.data.bones[b]; print('BONE',b,[round(x,3) for x in arm.matrix_world@pb.head_local],[round(x,3) for x in arm.matrix_world@pb.tail_local])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'base_import.blend'))
