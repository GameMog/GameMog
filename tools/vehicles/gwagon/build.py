# Build the Kastell GLB (Mandi's Revenge: Mandi's car, a boxy black luxury off-roader) from the downloaded low-poly
# model (DemuriaGT, CC BY 4.0): scaled to metres, its one palette-textured body split into the parts the game finishes by
# name, the front doors cut free, a cabin built in (seats, dash, wheel), the texture dropped. The source carries no badge
# (checked: the grille is two plain bars, the wheel centres plain cones, the spare cover plain, the plates blank).
#   Blender -b --factory-startup --python gwagon/build.py -- <download>/gwagon-demuriagt.glb /tmp/gwagon-raw.glb [debug.blend]
import bpy, bmesh, sys, json, math
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--')+1:]
SRC, OUT = args[0], args[1]
DEBUG = len(args) > 2 and args[2]
LENGTH = 4.87   # a real one's length over its spare wheel, metres (1.98 tall, 1.93 wide follow from the model's shape)
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
log = {'removed': [], 'doors': {}, 'faces': {}}

# 1. the parts by the source's names: four wheels (by corner) and the body (the rest). Blender's frame: x across (+x the
#    car's left), -y forward (the nose), z up
wheels = {}
for o in list(sc.objects):
    for c, to in (('FL', 'FL'), ('FR', 'FR'), ('RL', 'BL'), ('RR', 'BR')):
        if o.name.find('Wheel ' + c) >= 0: wheels[to] = o
body = [o for o in sc.objects if o.type == 'MESH' and o not in wheels.values()]
assert len(wheels) == 4 and len(body) == 1, (list(wheels), [o.name for o in body])
body = body[0]
def bb(objs):
    vs = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
# 2. metres: its length to a real one's, its middle between the axles on x = y = 0, its tyres on z = 0
lo, hi = bb([body]); wl, wh = bb(list(wheels.values()))
k = LENGTH / (hi.y - lo.y)
wc = [(sum(bb([w])[0][i] + bb([w])[1][i] for w in wheels.values()) / 8) for i in range(3)]
T = Matrix.Scale(k, 4) @ Matrix.Translation((-wc[0], -wc[1], -wl.z))
for o in sc.objects: o.data.transform(T)
lo, hi = bb([body])
log['size'] = [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z - lo.z, 3)]; log['scale'] = round(k, 5)

# 3. the palette: every face's colour cell in the source's 8 x 8 swatch (glTF's v is flipped on import), and the part
#    it is: the paint (the black), chrome trim and rims, the glass, the tail lamps, the headlamps and plates (the white),
#    the grille's and bumpers' grey, the handles and mirror faces, the side pipes
CELL = {(7, 7): 'Paint', (3, 7): 'Chrome', (1, 6): 'Glass', (2, 5): 'Tail_light', (0, 7): 'Headlight', (5, 7): 'Trim', (6, 7): 'Handle', (4, 7): 'Exhaust'}
NAMES = ['Paint', 'Chrome', 'Glass', 'Windscreen', 'Tail_light', 'Headlight', 'Plate', 'Trim', 'Handle', 'Exhaust', 'Interior', 'Under', 'Tire', 'Rim']
MAT = {}
for n in NAMES: MAT[n] = bpy.data.materials.new(n)
def cell(f, uvl):
    u = sum(l[uvl].uv[0] for l in f.loops) / len(f.loops); v = sum(l[uvl].uv[1] for l in f.loops) / len(f.loops)
    return (min(7, max(0, int(u * 8))), 7 - min(7, max(0, int(v * 8))))
def setmats(o, pick):
    o.data.materials.clear()
    for n in NAMES: o.data.materials.append(MAT[n])
    bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active
    for f in bm.faces: f.material_index = NAMES.index(pick(f, CELL.get(cell(f, uvl), 'Paint')))
    bm.to_mesh(o.data); bm.free()
# the cabin (where the black is its inside: its floor, the walls inside the doors, the ceiling, the bulkheads), from the
# body's own shape: inside the side skins by a little, over the floor, under the roof, between the windscreen's foot and
# the tailgate
CAB = dict(x=0.80, y=(-0.80, 2.24), z=(0.25, 1.935))
def body_pick(f, base):
    c = f.calc_center_median(); n = f.normal
    if base == 'Paint':
        inside = abs(c.x) < CAB['x'] and CAB['y'][0] < c.y < CAB['y'][1] and CAB['z'][0] < c.z < CAB['z'][1]
        # (and facing in: the walls toward the middle, the floor up, the ceiling down, the bulkheads toward each other; the
        # greenhouse's own skin, narrower than the body under it, faces out)
        sx = 1 if c.x >= 0 else -1
        facing_in = n.x * sx < -0.5 or (n.z > 0.5 and c.z < 0.6) or (n.z < -0.5 and c.z > 1.6) or (n.y > 0.5 and c.y < 0) or (n.y < -0.5 and c.y > 1.5) or (abs(c.x) < 0.6 and c.z < 1.0)
        if inside and facing_in: return 'Interior'
        if n.z < -0.7 and c.z < 0.45: return 'Under'
    if base == 'Glass' and n.y < -0.5: return 'Windscreen'
    if base == 'Headlight' and abs(c.x) < 0.45: return 'Plate'
    return base
setmats(body, body_pick)
for c, w in wheels.items():
    setmats(w, lambda f, base: 'Rim' if base == 'Chrome' else 'Tire')
    w.name = f'wheel_{c}'

# 4. the front doors cut free: each side's skin, glass, trim, handle and inner panel between the front wheel's arch and
#    the B-pillar (the source's panel seams), from the sill to the roof's edge
def raw(y): return (y - wc[1]) * k
DOOR = dict(y=(raw(8.66), raw(11.53)), z=((1.03 - wl.z) * k, (5.0 - wl.z) * k), x=0.62)
# (over the beltline the door's front edge is the A-pillar's back edge, which leans back with the windscreen: the
# windscreen's foot and head, from the source, and the pillar's depth behind its glass)
WS = ((raw(8.75), (3.56 - wl.z) * k), (raw(9.67), (4.96 - wl.z) * k))
def pillar_y(z): return WS[0][0] + (z - WS[0][1]) / (WS[1][1] - WS[0][1]) * (WS[1][0] - WS[0][0]) + 0.09
log['door_box'] = {kk: [round(v, 3) for v in vv] if isinstance(vv, tuple) else vv for kk, vv in DOOR.items()}
def in_door(f, sd):
    c = f.calc_center_median()
    if NAMES[f.material_index] == 'Windscreen' or (c.z > WS[0][1] - 0.04 and c.y < pillar_y(c.z)): return False
    return c.x * sd > DOOR['x'] and DOOR['y'][0] < c.y < DOOR['y'][1] and DOOR['z'][0] < c.z < DOOR['z'][1] and not (f.normal.z > 0.5 and c.z < 0.5)
for sd, sk in ((1, 'L'), (-1, 'R')):
    bm = bmesh.new(); bm.from_mesh(body.data)
    sel = [f for f in bm.faces if in_door(f, sd)]
    log['doors'][sk] = len(sel)
    dm = bpy.data.meshes.new(f'door_{sk}'); bm2 = bmesh.new()
    # (the door's faces copied into a mesh of their own, then taken out of the body)
    tmp = bm.copy(); keep = set(f.index for f in sel)
    bmesh.ops.delete(tmp, geom=[f for f in tmp.faces if f.index not in keep], context='FACES')
    tmp.to_mesh(dm); tmp.free()
    for n in NAMES: dm.materials.append(MAT[n])
    bmesh.ops.delete(bm, geom=sel, context='FACES'); bm.to_mesh(body.data); bm.free()
    do = bpy.data.objects.new(f'door_{sk}', dm); sc.collection.objects.link(do)
body.name = 'body'

# 5. the cabin built in: two front seats, a back bench, the dash with its screen, the console, the steering wheel
INT = {n: bpy.data.materials.new(n) for n in ('Leather', 'Dash', 'Screen', 'Steering_wheel', 'Metal')}
def obj_from_bm(name, bm, mat):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(INT[mat]); return o
def rounded_box(size, at, r=0.03, seg=3, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=min(r, min(size) * 0.45), segments=seg, profile=0.5, affect='EDGES')
    if rot: bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return bm
def join(bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out
FLOOR = 0.32
SEAT_X, SEAT_Y, CUSH = 0.40, -0.13, 0.60   # (the front seats' middles across and along, the cushion's top)
for sd, sk in ((1, 'L'), (-1, 'R')):
    tilt = Matrix.Rotation(math.radians(-14), 4, 'X')
    parts = [
        rounded_box((0.50, 0.52, 0.13), (sd * SEAT_X, SEAT_Y, CUSH - 0.065), r=0.045),                      # the cushion
        rounded_box((0.30, 0.40, CUSH - 0.13 - FLOOR), (sd * SEAT_X, SEAT_Y, FLOOR + (CUSH - 0.13 - FLOOR) / 2), r=0.02),   # its base
        rounded_box((0.50, 0.12, 0.62), (sd * SEAT_X, SEAT_Y + 0.30, CUSH + 0.30), r=0.045, rot=tilt),          # the back
        rounded_box((0.28, 0.10, 0.17), (sd * SEAT_X, SEAT_Y + 0.40, CUSH + 0.72), r=0.04, rot=tilt),          # the headrest
    ]
    obj_from_bm(f'Seat_{sk}', join(parts), 'Leather')
obj_from_bm('Seat_back', join([
    rounded_box((1.42, 0.50, 0.14), (0, 1.38, CUSH - 0.06), r=0.05),
    rounded_box((1.42, 0.50, CUSH - 0.13 - FLOOR), (0, 1.38, FLOOR + (CUSH - 0.13 - FLOOR) / 2), r=0.02),
    rounded_box((1.42, 0.13, 0.60), (0, 1.66, CUSH + 0.30), r=0.05, rot=Matrix.Rotation(math.radians(-12), 4, 'X')),
]), 'Leather')
obj_from_bm('Dash', join([
    rounded_box((1.56, 0.26, 0.36), (0, -0.70, 1.00), r=0.06),
    rounded_box((0.22, 0.80, 0.40), (0, -0.35, FLOOR + 0.20), r=0.04),                                     # the console
    rounded_box((0.10, 0.10, 0.24), (SEAT_X, -0.555, 0.93), r=0.03, rot=Matrix.Rotation(math.radians(-24), 4, 'X')),   # the column
]), 'Dash')
# the screen: one wide glass panel across the driver's half of the dash, facing him
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
bmesh.ops.scale(bm, vec=Vector((0.86, 0.16, 1)), verts=bm.verts)
bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.radians(-80), 4, 'X'))
bmesh.ops.translate(bm, vec=Vector((0.22, -0.567, 1.10)), verts=bm.verts)
obj_from_bm('Screen', bm, 'Screen')
# the steering wheel: its rim, hub and three spokes, its axis toward the driver and up (as gt.js's yoke: 0.42 rad)
WHEEL_AT = Vector((SEAT_X, -0.47, 1.00)); axis = Vector((0, math.cos(0.42), math.sin(0.42)))
q = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.019, major_segments=40, minor_segments=10)
rim = bpy.context.active_object; rim.name = 'Steering_wheel_rim'
bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.05, vertices=20)
hub = bpy.context.active_object; hub.name = 'Steering_wheel_hub'
bpy.ops.mesh.primitive_cube_add(size=1)
sp = bpy.context.active_object; sp.name = 'Steering_wheel_spokes'
sp.data.transform(Matrix.Diagonal((0.34, 0.03, 0.012, 1)))
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=Vector((0.03, 0.15, 0.012)), verts=bm.verts)
bmesh.ops.translate(bm, vec=Vector((0, -0.09, 0)), verts=bm.verts); me = bpy.data.meshes.new('t'); bm.to_mesh(me); bm.free()
bm = bmesh.new(); bm.from_mesh(sp.data); bm.from_mesh(me); bm.to_mesh(sp.data); bm.free(); bpy.data.meshes.remove(me)
for o in (rim, hub, sp):
    o.data.transform(Matrix.Translation(WHEEL_AT) @ q); o.data.materials.clear(); o.data.materials.append(INT['Steering_wheel' if o is rim else 'Metal'])
    o.location = (0, 0, 0)

# 6. every part by material, one object each, named <part>_<material> (the doors door_<side>_<material>, the wheels
#    wheel_<corner>_rim / _tire), welded where the source's faces were split, smooth within 35 degrees
def split(o, base):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
    out = []
    for p in bpy.context.selected_objects:
        used = {f.material_index for f in p.data.polygons}
        if not used: bpy.data.objects.remove(p, do_unlink=True); continue
        mn = p.data.materials[next(iter(used))].name
        bm = bmesh.new(); bm.from_mesh(p.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004); bm.to_mesh(p.data); bm.free()
        # (only its own material kept)
        idx = next(iter(used)); m = p.data.materials[idx]
        p.data.materials.clear(); p.data.materials.append(m)
        for f in p.data.polygons: f.material_index = 0
        p.name = f'{base}_{mn}' if base != 'wheel' else p.name
        out.append((p, mn))
    return out
for p, mn in split(body, 'body'): log['faces'][mn] = len(p.data.polygons)
for sk in 'LR': split(sc.objects[f'door_{sk}'], f'door_{sk}')
for c in list(wheels):
    for p, mn in split(sc.objects[f'wheel_{c}'], 'wheel'): p.name = f'wheel_{c}_{"rim" if mn == "Rim" else "tire"}'
for o in sc.objects:
    if o.type != 'MESH': continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35), keep_sharp_edges=True)

# 7. the texture dropped (the palette swatch: its colours are the material names now)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for n in list(m.node_tree.nodes):
        if n.type == 'TEX_IMAGE': m.node_tree.nodes.remove(n)
for im in list(bpy.data.images): bpy.data.images.remove(im)
for m in list(bpy.data.materials):
    if m.users == 0: bpy.data.materials.remove(m)
# (each its own plain colour, the source's swatch's for its part, so the pack's dedup keeps them apart by name; the game
# finishes every one by its name, wagmi/storyrun/gwagon.js)
SWATCH = {'Paint': '1f1f1f', 'Chrome': 'b1b1b1', 'Glass': '8ec6e2', 'Windscreen': '8ec6e3', 'Tail_light': 'ab3a1d', 'Headlight': 'f5f5f5', 'Plate': 'f5f5f4',
          'Trim': '666666', 'Handle': '3e3e3e', 'Exhaust': '8e8e8e', 'Interior': '1f1f20', 'Under': '1f1f21', 'Tire': '1f1f22', 'Rim': 'b1b1b2',
          'Leather': '2a201a', 'Dash': '161616', 'Screen': '050505', 'Steering_wheel': '141414', 'Metal': '909090'}
for m in bpy.data.materials:
    h = SWATCH.get(m.name, '808080'); rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    m.diffuse_color = (*rgb, 1)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf: bsdf.inputs['Base Color'].default_value = (*rgb, 1)
# (every mesh named as its object: the source's mesh names carry its real maker's and model's names)
for o in sc.objects:
    if o.type == 'MESH': o.data.name = o.name
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in sc.objects if o.type == 'MESH')
log['tris'] = tris; log['objects'] = sorted(o.name for o in sc.objects)
print('BUILDLOG', json.dumps(log))
if DEBUG:
    bpy.ops.wm.save_as_mainfile(filepath=DEBUG)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='NONE', export_apply=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False, export_animations=False)
