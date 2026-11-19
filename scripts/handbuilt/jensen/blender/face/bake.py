# Skin maps on the EXISTING skin UVs (MakeHuman hm08 atlas), 4096: albedo (warm graded + procedural mottling/pores),
# roughness (T-zone, lips, pores) and a tangent-space normal = the build's own normal map + a procedural high-frequency
# height (pores, micro-relief, moderate fine lines) baked through Cycles. Everything outside the head keeps the build's
# own maps (upscaled). Original work: no photo input.
#   blender -b --python bake.py -- jensen.glb outdir [res]
import bpy, bmesh, sys, os, math
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__)); import scene, sculpt
a = sys.argv[sys.argv.index('--') + 1:]; glb, out = a[0], a[1]; RES = int(a[2]) if len(a) > 2 else 4096
os.makedirs(out, exist_ok=True)
o = scene.load(glb); E, D, sk = sculpt.apply(o)
mw = o.matrix_world; Ew = mw @ E
mat = bpy.data.materials['skin']; nt0 = mat.node_tree
src_alb = [n for n in nt0.nodes if n.type == 'TEX_IMAGE' and n.image.name == 'Image_0'][0].image
src_mr = [n for n in nt0.nodes if n.type == 'TEX_IMAGE' and n.image.name == 'Image_6'][0].image
src_nrm = [n for n in nt0.nodes if n.type == 'TEX_IMAGE' and n.image.name == 'skin-normal'][0].image
# a skin-only copy: no keys, no armature, the sculpted rest
bpy.ops.object.select_all(action='DESELECT')
c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
c.shape_key_clear() if hasattr(c, 'shape_key_clear') else None
if c.data.shape_keys:
    bpy.context.view_layer.objects.active = c; c.select_set(True); bpy.ops.object.shape_key_remove(all=True, apply_mix=False)
for md in list(c.modifiers): c.modifiers.remove(md)
bm = bmesh.new(); bm.from_mesh(c.data); si = [i for i, s in enumerate(c.data.materials) if s.name == 'skin'][0]
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != si], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS'); bm.to_mesh(c.data); bm.free()
for ob in list(bpy.data.objects):
    if ob is not c and ob.type == 'MESH': ob.hide_render = True
bm2 = bpy.data.materials.new('bake'); bm2.use_nodes = True; c.data.materials.clear(); c.data.materials.append(bm2)
for p in c.data.polygons: p.use_smooth = True
N = bm2.node_tree.nodes; Lk = bm2.node_tree.links; N.clear()
def node(t, **kw):
    n = N.new(t)
    for k, v in kw.items(): setattr(n, k, v)
    return n
def math_(op, a, b=None, clamp=False):
    n = node('ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, v in enumerate([a, b]):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: Lk.new(v, n.inputs[i])
    return n.outputs[0]
def img(im, cs):
    n = node('ShaderNodeTexImage'); n.image = im; im.colorspace_settings.name = cs; n.interpolation = 'Cubic'; return n
uvn = node('ShaderNodeUVMap', uv_map=c.data.uv_layers[0].name)
geo = node('ShaderNodeNewGeometry')
# head-local position (world minus eye midpoint), metres
sub = node('ShaderNodeVectorMath', operation='SUBTRACT'); Lk.new(geo.outputs['Position'], sub.inputs[0]); sub.inputs[1].default_value = Ew
sep = node('ShaderNodeSeparateXYZ'); Lk.new(sub.outputs[0], sep.inputs[0]); X, Y, Z = sep.outputs
ax = math_('ABSOLUTE', X)
def smooth01(v, lo, hi):  # smoothstep via map range
    m = node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); Lk.new(v, m.inputs[0]); m.inputs[1].default_value = lo; m.inputs[2].default_value = hi; m.inputs[3].default_value = 0; m.inputs[4].default_value = 1; return m.outputs[0]
def band(v, a0, a1, b1, b0):  # 0 below a0, 1 a1..b1, 0 above b0
    return math_('MULTIPLY', smooth01(v, a0, a1), math_('SUBTRACT', 1.0, smooth01(v, b1, b0)))
head = smooth01(Z, -0.19, -0.15)                                     # head + neck top; body untouched
face = math_('MULTIPLY', band(Z, -0.135, -0.11, 0.07, 0.10), smooth01(math_('MULTIPLY', Y, -1.0), -0.075, -0.035))  # front of the head
# ---- height detail -------------------------------------------------------------------------------------------
pos = geo.outputs['Position']
def vor(scale, feat='F1', rnd=1.0):
    v = node('ShaderNodeTexVoronoi', feature=feat); v.voronoi_dimensions = '3D'; Lk.new(pos, v.inputs['Vector']); v.inputs['Scale'].default_value = scale; v.inputs['Randomness'].default_value = rnd; return v
def noise(scale, detail=4.0, rough=0.55, vec=None):
    n = node('ShaderNodeTexNoise'); n.noise_dimensions = '3D'; Lk.new(vec or pos, n.inputs['Vector']); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough; return n
pv = vor(1500.0); pore = math_('SUBTRACT', 1.0, smooth01(pv.outputs['Distance'], 0.0, 0.38))       # 1 in a pore pit
pv2 = vor(2600.0); pore2 = math_('SUBTRACT', 1.0, smooth01(pv2.outputs['Distance'], 0.0, 0.3))
# pore density: nose and inner cheeks most, forehead some, lips/lids none
nosez = math_('MULTIPLY', band(Z, -0.06, -0.045, -0.005, 0.01), band(ax, -1, 0, 0.012, 0.022))
cheek = math_('MULTIPLY', band(Z, -0.07, -0.05, -0.012, 0.0), band(ax, 0.012, 0.025, 0.055, 0.07))
fore = band(Z, 0.015, 0.03, 0.08, 0.10)
lips = math_('MULTIPLY', band(Z, -0.09, -0.083, -0.06, -0.054), band(ax, -1, 0, 0.018, 0.026))
lids = math_('MULTIPLY', band(Z, -0.016, -0.01, 0.01, 0.016), band(ax, 0.012, 0.018, 0.045, 0.052))
dens = math_('ADD', math_('ADD', math_('MULTIPLY', nosez, 1.0), math_('MULTIPLY', cheek, 0.8)), math_('MULTIPLY', fore, 0.55))
dens = math_('MAXIMUM', dens, 0.35)
dens = math_('MULTIPLY', dens, math_('SUBTRACT', 1.0, math_('MAXIMUM', lips, lids)))
poreH = math_('MULTIPLY', math_('ADD', math_('MULTIPLY', pore, 1.0), math_('MULTIPLY', pore2, 0.45)), dens)
micro = noise(5200.0, 2.0, 0.6).outputs['Fac']; micro2 = noise(900.0, 3.0, 0.5).outputs['Fac']
# fine lines: forehead (horizontal, wavy), crow's feet (radial fan from the outer corners), under-eye arcs, and the
# little vertical lines on the upper lip (very faint). Moderate: a fit man about 60.
warp = noise(60.0, 2.0, 0.5).outputs['Fac']
fz = math_('ADD', Z, math_('MULTIPLY', math_('SUBTRACT', warp, 0.5), 0.004))
fl = math_('POWER', math_('ABSOLUTE', math_('SINE', math_('MULTIPLY', fz, 2 * math.pi / 0.0085))), 6.0)  # thin crests every 8.5 mm
foreL = math_('MULTIPLY', math_('SUBTRACT', 1.0, fl), math_('MULTIPLY', band(Z, 0.025, 0.035, 0.065, 0.08), band(ax, -1, 0, 0.04, 0.055)))
# crow's feet about (0.050, z -0.002)
cx = math_('SUBTRACT', ax, 0.049); cz = math_('ADD', Z, 0.002)
ang = math_('ARCTAN2', cz, cx); rad = math_('POWER', math_('ADD', math_('MULTIPLY', cx, cx), math_('MULTIPLY', cz, cz)), 0.5)
cf = math_('POWER', math_('ABSOLUTE', math_('SINE', math_('MULTIPLY', math_('ADD', ang, math_('MULTIPLY', warp, 0.25)), 9.0))), 5.0)
crow = math_('MULTIPLY', math_('SUBTRACT', 1.0, cf), math_('MULTIPLY', band(rad, 0.004, 0.008, 0.016, 0.024), smooth01(cx, -0.002, 0.004)))
# under-eye arcs: rings round each eye centre (0.030, 0), below it
ex = math_('SUBTRACT', ax, 0.030); er = math_('POWER', math_('ADD', math_('MULTIPLY', ex, ex), math_('MULTIPLY', Z, Z)), 0.5)
ua = math_('POWER', math_('ABSOLUTE', math_('SINE', math_('MULTIPLY', math_('ADD', er, math_('MULTIPLY', warp, 0.0015)), 2 * math.pi / 0.0045))), 6.0)
under = math_('MULTIPLY', math_('SUBTRACT', 1.0, ua), math_('MULTIPLY', band(er, 0.013, 0.016, 0.022, 0.027), smooth01(math_('MULTIPLY', Z, -1.0), 0.004, 0.012)))
lines = math_('ADD', math_('ADD', math_('MULTIPLY', foreL, 0.35), math_('MULTIPLY', crow, 0.5)), math_('MULTIPLY', math_('MULTIPLY', under, noise(140.0, 2.0, 0.5).outputs['Fac']), 0.16))
# height (metres) = -pores - lines + micro relief, only on the head
H = math_('ADD', math_('MULTIPLY', poreH, -0.00006), math_('MULTIPLY', lines, -0.00012))
H = math_('ADD', H, math_('MULTIPLY', math_('SUBTRACT', micro, 0.5), 0.00003))
H = math_('ADD', H, math_('MULTIPLY', math_('SUBTRACT', micro2, 0.5), 0.00004))
H = math_('MULTIPLY', H, head)
# ---- base normal from the build, bumped ----
nimg = img(src_nrm, 'Non-Color'); Lk.new(uvn.outputs[0], nimg.inputs[0])
nmap = node('ShaderNodeNormalMap', uv_map=c.data.uv_layers[0].name); Lk.new(nimg.outputs[0], nmap.inputs['Color'])
bump = node('ShaderNodeBump'); bump.inputs['Strength'].default_value = 1.0; bump.inputs['Distance'].default_value = 1.0
Lk.new(H, bump.inputs['Height']); Lk.new(nmap.outputs[0], bump.inputs['Normal'])
# ---- albedo ----
aimg = img(src_alb, 'sRGB'); Lk.new(uvn.outputs[0], aimg.inputs[0])
def rgbmix(blend, fac, A, B):
    m = node('ShaderNodeMix', data_type='RGBA', blend_type=blend); m.clamp_result = True
    (Lk.new(fac, m.inputs[0]) if not isinstance(fac, (int, float)) else setattr(m.inputs[0], 'default_value', fac))
    for s, v in ((6, A), (7, B)):
        if isinstance(v, tuple): m.inputs[s].default_value = v
        else: Lk.new(v, m.inputs[s])
    return m.outputs[2]
# warm light tan toward olive: a multiply grade, slightly less saturated, only on the head
hsv = node('ShaderNodeHueSaturation'); Lk.new(aimg.outputs[0], hsv.inputs['Color']); hsv.inputs['Saturation'].default_value = 0.95; hsv.inputs['Hue'].default_value = 0.508; hsv.inputs['Value'].default_value = 0.93
graded = rgbmix('MULTIPLY', 1.0, hsv.outputs[0], (0.95, 0.84, 0.69, 1))
mott = noise(180.0, 4.0, 0.6).outputs['Fac']; mott2 = noise(35.0, 3.0, 0.5).outputs['Fac']
graded = rgbmix('OVERLAY', math_('MULTIPLY', math_('SUBTRACT', mott, 0.5), 0.35), graded, (0.62, 0.42, 0.33, 1))
graded = rgbmix('MULTIPLY', math_('MULTIPLY', math_('SUBTRACT', mott2, 0.35), 0.12), graded, (0.86, 0.7, 0.62, 1))
# a little blood colour on the nose tip, the cheeks' apples, the ears' rims (subtle)
red = math_('ADD', math_('MULTIPLY', nosez, 0.12), math_('MULTIPLY', math_('MULTIPLY', band(Z, -0.06, -0.045, -0.02, -0.008), band(ax, 0.02, 0.03, 0.05, 0.06)), 0.10))
graded = rgbmix('MULTIPLY', red, graded, (0.95, 0.72, 0.68, 1))
sock = math_('MULTIPLY', band(er, 0.008, 0.013, 0.02, 0.026), 0.10)
graded = rgbmix('MULTIPLY', sock, graded, (0.78, 0.66, 0.6, 1))
beard = math_('MULTIPLY', math_('MULTIPLY', band(Z, -0.135, -0.115, -0.062, -0.05), smooth01(math_('MULTIPLY', Y, -1.0), -0.06, -0.02)), math_('SUBTRACT', 1.0, lips))
graded = rgbmix('MULTIPLY', math_('MULTIPLY', beard, 0.10), graded, (0.82, 0.8, 0.76, 1))
# lips: muted rose-brown
graded = rgbmix('MULTIPLY', math_('MULTIPLY', lips, 0.35), graded, (0.86, 0.66, 0.62, 1))
# cavities darker (pores, lines)
cav = math_('ADD', math_('MULTIPLY', poreH, 0.06), math_('MULTIPLY', lines, 0.07))
graded = rgbmix('MULTIPLY', cav, graded, (0.62, 0.48, 0.42, 1))
alb = rgbmix('MIX', head, aimg.outputs[0], graded)
# ---- roughness (glTF G channel); the build's own map's G as the ground ----
mimg = img(src_mr, 'Non-Color'); Lk.new(uvn.outputs[0], mimg.inputs[0]); msep = node('ShaderNodeSeparateColor'); Lk.new(mimg.outputs[0], msep.inputs[0])
tz = math_('MAXIMUM', math_('MULTIPLY', fore, 0.9), math_('MULTIPLY', nosez, smooth01(Z, -0.05, -0.04)))
rh = math_('ADD', 0.64, math_('MULTIPLY', tz, -0.12))
rh = math_('ADD', rh, math_('MULTIPLY', lips, -0.17))
rh = math_('ADD', rh, math_('MULTIPLY', poreH, 0.12))
rh = math_('ADD', rh, math_('MULTIPLY', math_('SUBTRACT', micro2, 0.5), 0.08))
rough = math_('ADD', math_('MULTIPLY', msep.outputs[1], math_('SUBTRACT', 1.0, head)), math_('MULTIPLY', rh, head), clamp=True)
# ---- outputs ----
emit = node('ShaderNodeEmission'); outn = node('ShaderNodeOutputMaterial')
bsdf = node('ShaderNodeBsdfPrincipled'); Lk.new(bump.outputs[0], bsdf.inputs['Normal'])
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8; sc.render.threads_mode = 'FIXED'; sc.render.threads = 6
sc.render.bake.margin = 8; sc.render.bake.use_selected_to_active = False
bpy.ops.object.select_all(action='DESELECT'); c.select_set(True); bpy.context.view_layer.objects.active = c
def target(name, src, cs):
    im = bpy.data.images.new(name, RES, RES, alpha=False, float_buffer=False); im.colorspace_settings.name = cs
    # pre-filled with the build's map, upscaled, so texels no face covers keep it
    s2 = src.copy(); s2.scale(RES, RES); im.pixels[:] = s2.pixels[:]; bpy.data.images.remove(s2)
    t = node('ShaderNodeTexImage'); t.image = im; N.active = t; t.select = True
    return im
def save(im, path):
    im.filepath_raw = path; im.file_format = 'PNG'; im.save(); print('SAVED', path)
# albedo
Lk.new(alb, emit.inputs['Color']); Lk.new(emit.outputs[0], outn.inputs['Surface'])
im = target('skin-albedo', src_alb, 'sRGB'); bpy.ops.object.bake(type='EMIT'); save(im, out + '/skin-albedo.png')
# roughness -> glTF metallicRoughness (R 0, G rough, B metallic 0)
cmb = node('ShaderNodeCombineColor'); Lk.new(rough, cmb.inputs[1]); cmb.inputs[0].default_value = 0; cmb.inputs[2].default_value = 0
Lk.new(cmb.outputs[0], emit.inputs['Color'])
im = target('skin-mr', src_mr, 'Non-Color'); bpy.ops.object.bake(type='EMIT'); save(im, out + '/skin-mr.png')
# normal
Lk.new(bsdf.outputs[0], outn.inputs['Surface'])
sc.render.bake.normal_space = 'TANGENT'
im = target('skin-normal', src_nrm, 'Non-Color'); bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', uv_layer=c.data.uv_layers[0].name); save(im, out + '/skin-normal.png')
