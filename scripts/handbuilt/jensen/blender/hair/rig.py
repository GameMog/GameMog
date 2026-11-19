# shared render rig for the hair previews: lights, cameras, Cycles settings (prep.blend's head)
import bpy, math
from mathutils import Vector

EY, EZ = 1.6254, 0.1253

def body():
    return bpy.data.objects.get('Mesh_0') or max([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: len(o.data.vertices))

def headM():
    b = body(); arm = b.parent
    if arm and arm.type == 'ARMATURE':
        pb = arm.pose.bones['head']
        return arm.matrix_world @ pb.matrix @ arm.data.bones['head'].matrix_local.inverted() @ arm.matrix_world.inverted() @ b.matrix_world
    return b.matrix_world

def gl2w(g, ob=None):
    return headM() @ Vector((g[0], -g[2], g[1]))

def setup(samples=48, threads=4, res=(1280, 720)):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.transparent_max_bounces = 128
    sc.cycles.max_bounces = 8
    sc.render.threads_mode = 'FIXED'; sc.render.threads = threads
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.045, 0.042, 0.04, 1); bg.inputs[1].default_value = 1.0
    # (hide what's not the head: the body below stays, it's dark)
    def area(name, loc, energy, size, col=(1, 1, 1)):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.size = size; L.color = col
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
        d = gl2w((0, EY + 0.03, 0.03)) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return o
    c = gl2w((0, EY + 0.03, 0.03))
    area('key', c + Vector((-0.9, -1.1, 0.8)), 70, 0.9, (1.0, 0.96, 0.9))
    area('fill', c + Vector((1.2, -0.8, 0.1)), 18, 1.2, (0.9, 0.95, 1.0))
    area('rim', c + Vector((0.5, 1.2, 0.9)), 60, 0.6, (0.95, 0.97, 1.0))
    area('top', c + Vector((0, -0.2, 1.4)), 14, 1.0)

def camera(name, dir_gl, dist, target_gl=(0, EY + 0.035, 0.03), lens=85):
    sc = bpy.context.scene
    cam = bpy.data.cameras.new(name); cam.lens = lens; cam.clip_start = 0.01
    o = bpy.data.objects.new(name, cam); sc.collection.objects.link(o)
    t = gl2w(target_gl); d = Vector((dir_gl[0], -dir_gl[2], dir_gl[1])).normalized()
    o.location = t + d * dist
    o.rotation_euler = (t - o.location).to_track_quat('-Z', 'Y').to_euler()
    return o

VIEWS = {
    'front': ((0, 0.04, 1), 1.15),
    '34': ((math.sin(math.radians(38)), 0.08, math.cos(math.radians(38))), 1.15),
    'profile': ((1, 0.03, 0.0), 1.15),
    'back34': ((0.6, 0.15, -0.8), 1.15),
    'top': ((0, 1, 0.45), 1.05),
    'hairline': ((0.12, 0.28, 1), 0.5),
}

def render(path, view, res=None):
    sc = bpy.context.scene
    d, dist = VIEWS[view]
    tgt = (0, EY + 0.055, 0.1) if view == 'hairline' else (0, EY + 0.005, 0.025)
    sc.camera = camera('cam_' + view, d, dist, tgt)
    if res: sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
