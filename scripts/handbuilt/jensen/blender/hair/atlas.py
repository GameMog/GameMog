# Hair-card atlas baked in Cycles from strand clumps (hair curves), ortho from above: one render per pass.
#   hair: 2048x2048, 16 tiles of 256x1024 (2 rows of 8), root at each tile's bottom, tip toward its top
#   brows: 1024x512, 2 tiles of 1024x256 (dense base layer, sparse top layer), the brow's head (medial) at u=0
# passes (16-bit PNG, Raw view = linear data): cov (alpha), tt (root 0 -> tip 1), id (per-strand random), depth (1 =
# outermost strand), nrm (camera-space normal = the card's tangent space: x along u, y toward the tip, z out of the card)
# Blender -b --factory-startup --python atlas.py -- <outdir> hair|brows
import bpy, sys, math, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
OUT, WHAT = a[0], a[1]
rng = np.random.default_rng(11 if WHAT == 'hair' else 5)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
curves = []  # (points Nx3, radius N)

def strand(x0, y0, L, ang, wave, wfreq, ph, z, r0, r1, clump=None, n=40, bend=0.0):
    t = np.linspace(0, 1, n)
    dx, dy = math.sin(ang), math.cos(ang)
    x = x0 + dx * L * t + bend * L * t * t + wave * np.sin(ph + t * wfreq * 6.283) * t ** 0.7
    y = y0 + dy * L * t
    if clump is not None:
        cx, k = clump; x = x + (cx(y) - x) * k * t ** 1.3 * 0.6
    zz = z + 0.002 * np.sin(ph * 3 + t * 5)
    r = r0 + (r1 - r0) * t ** (2.2 if WHAT == 'hair' else 1.4)
    curves.append((np.stack([x, y, zz], 1), r))

if WHAT == 'hair':
    W, H = 8.0, 8.0; RES = (2048, 2048)
    # v2 tile kinds: (strands, x spread (beta), length range, clumps, clump pull, wave, root band)
    # wide soft clumps: the strands' lengths spread over the tile's top third, their tips thinned to a fraction of a
    # pixel, so a card's end feathers out over many strands instead of closing to a point
    KIND = {
        'dense':  (680, 1.7, (0.62, 1.0), 4, 0.18, 0.02, 0.18),
        'medium': (480, 1.6, (0.55, 1.0), 3, 0.25, 0.025, 0.2),
        'clump':  (440, 1.5, (0.6, 1.0), 3, 0.32, 0.03, 0.2),
        'wisp':   (140, 1.0, (0.45, 0.95), 2, 0.2, 0.045, 0.25),
        'fringe': (440, 1.4, (0.35, 0.8), 4, 0.2, 0.03, 0.3),
        'soft':   (580, 1.8, (0.5, 1.0), 5, 0.12, 0.025, 0.22),
    }
    LAYOUT = ['dense', 'dense', 'dense', 'medium', 'medium', 'medium', 'clump', 'clump',
              'clump', 'clump', 'fringe', 'fringe', 'soft', 'soft', 'wisp', 'wisp']
    for i, k in enumerate(LAYOUT):
        n, beta, Lr, nc, pull, wave, band = KIND[k]
        X0, Y0 = (i % 8) * 1.0, (1 - i // 8) * 4.0
        cl = []
        for c in range(nc):
            cx0 = 0.15 + 0.7 * (c + 0.5) / nc + rng.normal(0, 0.04); cs = rng.normal(0, 0.025); cp = rng.random() * 6
            cl.append((lambda y, cx0=cx0, cs=cs, cp=cp, X0=X0, Y0=Y0: X0 + cx0 + cs * (y - Y0) + 0.03 * np.sin(cp + (y - Y0) * 1.1)))
        for j in range(n):
            u = rng.beta(beta, beta); x0 = X0 + 0.03 + 0.94 * u
            edge = 1 - min(u, 1 - u) * 2
            L = 4.0 * rng.uniform(*Lr)
            L *= 1 - 0.3 * edge ** 2
            c = cl[int(np.argmin([abs(f(Y0 + 2) - x0) for f in cl]))]
            ang = rng.normal(0, 0.01); z = rng.random() * 0.12
            r0 = rng.uniform(0.0018, 0.0026)
            y0s = 0.02 + band * 4.0 * rng.random() ** (1.4 if k != 'fringe' else 1.0) * (0.6 if k != 'fringe' else 1.0)
            L = min(L, 3.96 - y0s)
            strand(x0, Y0 + y0s, L, ang, wave * rng.uniform(0.5, 1.8), rng.uniform(0.4, 1.4), rng.random() * 6.28, z, r0, 0.00025,
                   clump=(c, pull * rng.uniform(0.5, 1.2)), n=56, bend=rng.normal(0, 0.006))
else:
    W, H = 4.0, 2.0; RES = (1024, 512)
    # a left brow laid flat: u (0..4) from its head (medial) to its tail, v (0..1) bottom to top of the brow
    def brow_tile(Y0, n, sparse):
        for j in range(n):
            s = rng.random() ** 0.9  # along the brow
            # (the brow's band: full at the head and body, tapering at the tail; its top edge an arch)
            lo = 0.2 + 0.17 * s ** 1.6; hi = 0.8 - 0.3 * s ** 1.3 - 0.05 * (s < 0.08)
            v = lo + (hi - lo) * rng.beta(2.2, 2.2)
            x = 0.12 + 3.7 * s
            # (the hairs' direction: up at the head, sweeping laterally along the body, a little down at the tail)
            sm_ = lambda a, b, x: min(1, max(0, (x - a) / (b - a))) ** 2 * (3 - 2 * min(1, max(0, (x - a) / (b - a))))
            ang = math.radians(18 + 52 * sm_(0.0, 0.35, s) + 22 * sm_(0.6, 1.0, s) + rng.normal(0, 8))
            L = rng.uniform(0.28, 0.5) * (1 - 0.4 * s) * (0.7 if sparse else 1)
            sx, sy = math.sin(ang), math.cos(ang)
            y0 = Y0 + v * 1.0 - 0.5 * L * sy
            strand(x - 0.5 * L * sx, y0, L, ang, 0.01, 0.6, rng.random() * 6, rng.random() * 0.05, rng.uniform(0.0045, 0.0065) * (1 - 0.3 * s), 0.0009, n=16, bend=rng.normal(0, 0.03))
    brow_tile(1.0, 1500, False)   # tile 0 (image top): the dense base
    brow_tile(0.0, 300, True)    # tile 1 (image bottom): sparse top hairs

print('curves', len(curves))
hc = bpy.data.hair_curves.new('tile'); hc.add_curves([len(c[0]) for c in curves])
P = np.concatenate([c[0] for c in curves]); R = np.concatenate([c[1] for c in curves])
hc.position_data.foreach_set('vector', P.ravel())
hc.attributes['radius'].data.foreach_set('value', R) if 'radius' in hc.attributes else hc.attributes.new('radius', 'FLOAT', 'POINT').data.foreach_set('value', R)
ob = bpy.data.objects.new('tile', hc); sc.collection.objects.link(ob)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = max(W, H)
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); co.location = (W / 2, H / 2, 5); sc.camera = co
cam.clip_start = 0.1; cam.clip_end = 20
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
sc.cycles.max_bounces = 0
sc.render.threads_mode = 'FIXED'; sc.render.threads = 4
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = RES
sc.view_settings.view_transform = 'Raw' if 'Raw' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '16'
w = bpy.data.worlds.new('w'); sc.world = w
zmin, zmax = P[:, 2].min(), P[:, 2].max() + 0.01
mat = bpy.data.materials.new('m'); hc.materials.append(mat)
mat.use_nodes = True; nt = mat.node_tree
for nd in list(nt.nodes):
    if nd.type != 'OUTPUT_MATERIAL': nt.nodes.remove(nd)
em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs[0])
hi = nt.nodes.new('ShaderNodeHairInfo'); geo = nt.nodes.new('ShaderNodeNewGeometry')
def setcol(sock):
    for l in list(em.inputs[0].links): nt.links.remove(l)
    if sock is None: em.inputs[0].default_value = (1, 1, 1, 1)
    else: nt.links.new(sock, em.inputs[0])
passes = {}
passes['cov'] = lambda: setcol(None)
passes['tt'] = lambda: setcol(hi.outputs['Intercept'])
passes['id'] = lambda: setcol(hi.outputs['Random'])
def depth():
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = zmin; mr.inputs['From Max'].default_value = zmax
    nt.links.new(sep.outputs['Z'], mr.inputs['Value']); setcol(mr.outputs['Result'])
passes['depth'] = depth
def nrm():
    vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'
    vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Normal'], vm.inputs[0]); setcol(vm.outputs[0])
passes['nrm'] = nrm
for k, f in passes.items():
    f(); sc.render.filepath = f'{OUT}/{WHAT}-{k}.png'; bpy.ops.render.render(write_still=True)
print('done', sc.view_settings.view_transform)
