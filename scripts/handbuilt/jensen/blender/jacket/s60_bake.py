# Step 6a: bake the leather atlas's per-texel data maps (object position, normal, panel/aux/convexity) and AO.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np, time
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/uv.blend')
import lib
RES = int(os.environ.get('RES', 4096))
L = bpy.data.objects['leather']
for o in list(bpy.data.objects):
    if o is not L and o.name not in ('metal', 'tape'): bpy.data.objects.remove(o)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
sc.render.bake.margin = 12; sc.render.bake.margin_type = 'EXTEND'; sc.render.threads_mode = 'FIXED'; sc.render.threads = 6
m = bpy.data.materials.new('bake'); m.use_nodes = True; nt = m.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(em.outputs[0], out.inputs[0])
img_node = nt.nodes.new('ShaderNodeTexImage'); nt.nodes.active = img_node
L.data.materials.clear(); L.data.materials.append(m)
for o in bpy.data.objects: o.select_set(False)
L.select_set(True); bpy.context.view_layer.objects.active = L
def bake(name, build, res=RES, kind='EMIT', samples=1):
    img = bpy.data.images.new(name, res, res, float_buffer=True, alpha=False); img.colorspace_settings.name = 'Non-Color'
    img_node.image = img
    for l in list(nt.links):
        if l.to_node == em: nt.links.remove(l)
    for n in [n for n in nt.nodes if n.name.startswith('tmp')]: nt.nodes.remove(n)
    build()
    sc.cycles.samples = samples; t0 = time.time()
    bpy.ops.object.bake(type=kind, use_clear=True, margin=12)
    a = np.array(img.pixels[:], np.float32).reshape(res, res, 4)[:, :, :3]
    np.save(H + f'/bake/{name}.npy', a); print('baked', name, round(time.time() - t0, 1), flush=True)
def geo(socket):
    def b():
        g = nt.nodes.new('ShaderNodeNewGeometry'); g.name = 'tmp_g'; nt.links.new(g.outputs[socket], em.inputs[0])
    return b
bake('pos', geo('Position'))
bake('nrm', geo('Normal'))
def data():
    cmb = nt.nodes.new('ShaderNodeCombineXYZ'); cmb.name = 'tmp_c'
    for i, an in enumerate(['panel', 'aux', 'convex']):
        at = nt.nodes.new('ShaderNodeAttribute'); at.name = 'tmp_' + an; at.attribute_name = an; at.attribute_type = 'GEOMETRY'
        nt.links.new(at.outputs['Fac'], cmb.inputs[i])
    nt.links.new(cmb.outputs[0], em.inputs[0])
bake('data', data)
# a coverage mask: 1 inside islands (no margin)
sc.render.bake.margin = 0
def ones():
    v = nt.nodes.new('ShaderNodeValue'); v.name = 'tmp_v'; v.outputs[0].default_value = 1.0; nt.links.new(v.outputs[0], em.inputs[0])
img = None
bpy.context.scene.render.bake.margin = 0
def bake0(name, build):
    im = bpy.data.images.new(name, RES, RES, float_buffer=True, alpha=False); img_node.image = im
    for l in list(nt.links):
        if l.to_node == em: nt.links.remove(l)
    build(); bpy.ops.object.bake(type='EMIT', use_clear=True, margin=0)
    np.save(H + f'/bake/{name}.npy', np.array(im.pixels[:], np.float32).reshape(RES, RES, 4)[:, :, 0]); print('baked', name)
bake0('mask', ones)
# ambient occlusion (the hardware casts too), at half res
sc.render.bake.margin = 12
for nm in ('metal', 'tape'):
    if nm in bpy.data.objects: bpy.data.objects[nm].hide_render = False
fb = lib.load_fullbody(None); fb.hide_render = False
sc.world = bpy.data.worlds.new('w') if sc.world is None else sc.world
for o in bpy.data.objects: o.select_set(False)
L.select_set(True); bpy.context.view_layer.objects.active = L
sc.cycles.samples = 64
im = bpy.data.images.new('ao', RES // 2, RES // 2, float_buffer=True, alpha=False); img_node.image = im
t0 = time.time(); bpy.ops.object.bake(type='AO', use_clear=True, margin=12)
np.save(H + '/bake/ao.npy', np.array(im.pixels[:], np.float32).reshape(RES // 2, RES // 2, 4)[:, :, 0]); print('baked ao', round(time.time() - t0, 1))
