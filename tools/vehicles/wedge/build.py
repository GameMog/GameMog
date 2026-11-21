# Build the Tensore GLB from the downloaded source (ALIEEEN, CC BY 4.0): badges out, textures out, doors cut free, wheels grouped.
import bpy, bmesh, sys, json, os
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:]
SRC, OUT = args[0], args[1]
DEBUG = len(args) > 2 and args[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
# flatten: every mesh to world space, no parents, transforms applied
meshes = [o for o in sc.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(sc.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
log = {'removed': [], 'doors': {}}
# 1. every badge: the crest meshes on the nose, the wheel centres and the steering wheel (Logo material)
for o in list(sc.objects):
    if '_Logo_' in o.name or o.name.startswith('Logo_'):
        log['removed'].append(o.name); bpy.data.objects.remove(o, do_unlink=True)
# 2. split helpers
def loose_parts(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    return [x for x in bpy.context.selected_objects]
def bb(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
def inside(o, lo, hi, tol=0.004):
    a, b = bb(o); return all(a[i] >= lo[i]-tol and b[i] <= hi[i]+tol for i in range(3))
# the door region (Blender frame: x across, -y forward, z up), mirrored per side
DOOR = dict(x=(0.70, 1.02), y=(-0.96, 0.42), z=(0.13, 0.875))
DOOR_EXTRA = json.loads(os.environ.get('DOOR_EXTRA', '{}'))
cands = ['Hood.075_Body_0', 'Interior_doors_Interior_black_0', 'Interior_doors_Interior_color_0', 'Right&Left_windows_Windows_0', 'Mirrors_Body_0', 'Mirrors_mirror_0', 'Mirrors_Carbon_0']
door = {'L': [], 'R': []}
keep = []
for nm in cands:
    o = sc.objects.get(nm)
    if not o: continue
    base = nm
    ps = loose_parts(o)
    rest = []
    for p in ps:
        a, b = bb(p); cx = (a.x + b.x) / 2; sd = 'L' if cx > 0 else 'R'; s = 1 if cx > 0 else -1
        lo = Vector((DOOR['x'][0], DOOR['y'][0], DOOR['z'][0])); hi = Vector((DOOR['x'][1], DOOR['y'][1], DOOR['z'][1]))
        if s < 0: lo.x, hi.x = -DOOR['x'][1], -DOOR['x'][0]
        # the glass and the inner panel reach further in than the skin
        if 'window' in nm or 'Interior_doors' in nm: lo.x = min(lo.x, 0.55) if s > 0 else lo.x; hi.x = max(hi.x, -0.55) if s < 0 else hi.x; hi.z = 1.06
        if 'Mirrors' in nm: lo.y = -0.80; hi.z = 0.86
        if inside(p, lo, hi): door[sd].append(p)
        else: rest.append(p)
    # the rest of the mesh joined back under its own name
    if rest:
        bpy.ops.object.select_all(action='DESELECT')
        for r in rest: r.select_set(True)
        bpy.context.view_layer.objects.active = rest[0]
        if len(rest) > 1: bpy.ops.object.join()
        rest[0].name = base
for sd in 'LR':
    parts = door[sd]
    log['doors'][sd] = [(p.name, len(p.data.polygons)) for p in parts]
    # one object per material group, named door_<side>_<material>, so the game can finish each
    bymat = {}
    for p in parts:
        mn = p.data.materials[0].name if p.data.materials else 'none'
        bymat.setdefault(mn, []).append(p)
    for mn, ps in bymat.items():
        bpy.ops.object.select_all(action='DESELECT')
        for p in ps: p.select_set(True)
        bpy.context.view_layer.objects.active = ps[0]
        if len(ps) > 1: bpy.ops.object.join()
        ps[0].name = f'door_{sd}_{mn}'
# 3. names the game reads: wheels by corner (Blender -y is the nose; the source's _FL is the car's left, +x)
for o in list(sc.objects):
    for c in ('FR', 'FL', 'BR', 'BL'):
        if o.name.startswith(f'Wheel_{c}_'):
            part = o.name[len(f'Wheel_{c}_'):].rsplit('_', 1)[0]
            o.name = f'wheel_{c}_{part.lower()}'
# 3b. the fixed parts joined, one object per material (fewer draws); the parts the game finds by name kept apart
import re
KEEP = re.compile(r'^(wheel_|door_|Steering_wheel_Steering_wheel|Exhaust_1_Exhaust|Daylight_Light|Tail_light_Tail_light|Seat_)')
bymat = {}
for o in list(sc.objects):
    if o.type != 'MESH' or KEEP.match(o.name): continue
    mn = o.data.materials[0].name if o.data.materials else 'none'
    bymat.setdefault(mn, []).append(o)
for mn, ps in bymat.items():
    bpy.ops.object.select_all(action='DESELECT')
    for p in ps: p.select_set(True)
    bpy.context.view_layer.objects.active = ps[0]
    if len(ps) > 1: bpy.ops.object.join()
    ps[0].name = f'body_{mn}'
# 4. every image dropped from every material (the source's textures are not shipped: photos of the real car's parts and
#    its maker's marks); the material names stay for the game to finish by
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for n in list(m.node_tree.nodes):
        if n.type == 'TEX_IMAGE': m.node_tree.nodes.remove(n)
for im in list(bpy.data.images): bpy.data.images.remove(im)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in sc.objects if o.type == 'MESH')
log['tris'] = tris; log['objects'] = len(sc.objects)
print('BUILDLOG', json.dumps(log))
if DEBUG:
    bpy.ops.wm.save_as_mainfile(filepath=DEBUG)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='NONE', export_apply=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False, export_animations=False)
