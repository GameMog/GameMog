# Blender: render the GLB's bind pose (armature off) from OpenCV cameras given in glTF space
# blender -b --python render.py -- in.glb cams.json outprefix [--glasses]
import bpy, sys, json, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--') + 1:]; GLB, CAMS, OUT = a[:3]; GL = '--glasses' in a
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        for m in list(o.modifiers):
            if m.type == 'ARMATURE': o.modifiers.remove(m)
        o.parent = None if o.parent and o.parent.type == 'ARMATURE' else o.parent
        mats = [s.material.name for s in o.material_slots if s.material]
        if not GL and any('glasses' in n for n in mats): o.hide_render = True
        if any(n in ('clothes', 'shoes', 'leather', 'hardware', 'zip-tape', 'snaps', 'neckline') for n in mats): o.hide_render = True
        o.matrix_world = Matrix.Identity(4)
    elif o.type == 'ARMATURE': o.hide_render = True
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'
sc.view_settings.view_transform = 'AgX'; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 93
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.05, 0.05, 0.055, 1); bg.inputs[1].default_value = 1.0
A = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # glTF -> Blender
cams = json.load(open(CAMS))
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
def light(name, loc, energy, size, col=(1, 1, 1)):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.size = size; L.color = col
    ob = bpy.data.objects.new(name, L); sc.collection.objects.link(ob); return ob
lights = [light('key', 0, 70, 0.8, (1, 0.97, 0.92)), light('fill', 0, 30, 1.2, (0.94, 0.96, 1)), light('top', 0, 30, 0.8)]
for k, c in enumerate(cams):
    R = Matrix(c['R']); t = Vector(c['t']); C = -(R.transposed() @ t)
    rot = Matrix((R[0], -R[1], -R[2])).transposed()  # columns: cam x, y(up), z(back) in glTF
    M = (A @ rot).to_4x4(); M.translation = A @ C; cam.matrix_world = M
    sc.render.resolution_x, sc.render.resolution_y = c['W'], c['H']
    cd.sensor_fit = 'HORIZONTAL' if c['W'] >= c['H'] else 'VERTICAL'; cd.sensor_width = 36; cd.sensor_height = 36
    cd.lens = c['f'] * 36 / max(c['W'], c['H']); cd.clip_start = 0.01; cd.clip_end = 100
    cd.shift_x = (c['W'] / 2 - c.get('cx', c['W'] / 2)) / max(c['W'], c['H']); cd.shift_y = (c.get('cy', c['H'] / 2) - c['H'] / 2) / max(c['W'], c['H'])
    E = Vector(c['target']); Eb = A @ E
    camx, camy, camz = (A @ rot).col[0], (A @ rot).col[1], (A @ rot).col[2]
    for L, off in zip(lights, [camx * -0.6 + camy * 0.55 + camz * 0.9, camx * 0.9 + camy * 0.0 + camz * 0.6, camy * 1.0 + camz * -0.2]):
        L.location = Eb + off; d = Eb - L.location; L.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = OUT + c['name'] + '.jpg'; bpy.ops.render.render(write_still=True); print('RENDERED', sc.render.filepath)
