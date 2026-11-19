# the groom as real hair curves (guides + interpolated children), rendered in Cycles on his head
# Blender -b prep.blend --python preview.py -- <dir> <outprefix> <views,...> [children] [samples]
import bpy, sys, numpy as np
sys.path.insert(0, sys.argv[sys.argv.index('--') + 1])
import rig
a = sys.argv[sys.argv.index('--') + 1:]
D, OUT, views = a[0], a[1], a[2].split(',')
NCH = int(a[3]) if len(a) > 3 else 16
SAMP = int(a[4]) if len(a) > 4 else 32
G = np.load(D + '/groom.npz')
pts, ns, w, kind = G['pts'], G['ns'], G['w'], G['kind']
rng = np.random.default_rng(3)
body = rig.body()
curves = []
for i in range(len(pts)):
    P, N = pts[i], ns[i]
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    B = np.cross(N, T); B /= np.linalg.norm(B, axis=1)[:, None]
    n = NCH if kind[i] != 'line' else max(4, NCH // 3)
    s = np.linspace(0, 1, len(P))[:, None]
    for k in range(n):
        o = rng.uniform(-0.5, 0.5) * w[i]; h = rng.uniform(-0.25, 0.6) * w[i] * 0.4
        clump = rng.uniform(0.2, 0.7)
        L = rng.uniform(0.75, 1.0)
        off = (B * o + N * h) * (1 - clump * s ** 1.5)
        C = P + off + rng.normal(0, 0.0004, P.shape) * s
        m = max(3, int(len(P) * L)); curves.append(C[:m])
print('curves', len(curves))
hc = bpy.data.hair_curves.new('groom')
hc.add_curves([len(c) for c in curves])
allp = np.concatenate(curves)
bl = np.stack([allp[:, 0], -allp[:, 2], allp[:, 1]], 1)
hc.position_data.foreach_set('vector', bl.ravel())
rad = np.concatenate([np.linspace(0.00005, 0.000012, len(c)) for c in curves])
hc.attributes.new('radius', 'FLOAT', 'POINT') if 'radius' not in hc.attributes else None
hc.attributes['radius'].data.foreach_set('value', rad)
ob = bpy.data.objects.new('groom', hc); bpy.context.scene.collection.objects.link(ob)
ob.matrix_world = rig.headM()
mat = bpy.data.materials.new('groom'); mat.use_nodes = True; nt = mat.node_tree
for n in list(nt.nodes):
    if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
hb = nt.nodes.new('ShaderNodeBsdfHairPrincipled'); hb.parametrization = 'COLOR'
hi = nt.nodes.new('ShaderNodeHairInfo'); cr = nt.nodes.new('ShaderNodeValToRGB')
cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = (0.07, 0.07, 0.072, 1)
cr.color_ramp.elements[1].position = 0.35; cr.color_ramp.elements[1].color = (0.36, 0.36, 0.37, 1)
e = cr.color_ramp.elements.new(1.0); e.color = (0.5, 0.5, 0.51, 1)
nt.links.new(hi.outputs['Intercept'], cr.inputs[0]); nt.links.new(cr.outputs[0], hb.inputs['Color'])
hb.inputs['Roughness'].default_value = 0.32; hb.inputs['Radial Roughness'].default_value = 0.4
nt.links.new(hb.outputs[0], nt.nodes['Material Output'].inputs[0])
hc.materials.append(mat)
rig.setup(samples=SAMP)
for v in views: rig.render(f'{OUT}-{v}.jpg', v, (960, 540))
