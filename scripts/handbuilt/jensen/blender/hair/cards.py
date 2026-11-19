# Groom -> game-ready meshes (glTF space, bind pose, metres), saved as meshes.npz; then optional Cycles renders.
#   hair    strand cards along the groom's guides (3 verts across: a shallow ridge), UVs into the 16-tile atlas
#   hairCap an opaque under-shell over the scalp inside the hairline (no scalp between the cards)
#   brows   two conforming card layers per brow (dense base on the skin, sparse top hairs over it)
# Blender -b prep.blend --python cards.py -- <dir> [render views,...] [samples]
import bpy, sys, math, json, numpy as np
from mathutils import kdtree, Vector
a = sys.argv[sys.argv.index('--') + 1:]
D = a[0]; VIEWS = a[1].split(',') if len(a) > 1 and a[1] else []; SAMP = int(a[2]) if len(a) > 2 else 64
OUTP = a[3] if len(a) > 3 else D + '/wip/c'
sys.path.insert(0, D); import rig
C = json.load(open(D + '/cards.json'))
rng = np.random.default_rng(21)
EY, EZ = 1.6254, 0.1253
HC = np.array([0.0, EY + 0.02, EZ - 0.09])
def sm(a_, b, x):
    t = np.clip((x - a_) / (b - a_), 0, 1); return t * t * (3 - 2 * t)

body = rig.body(); me = body.data
V = np.array([v.co[:] for v in me.vertices]); V = np.stack([V[:, 0], V[:, 2], -V[:, 1]], 1)
NV = np.array([v.normal[:] for v in me.vertices]); NV = np.stack([NV[:, 0], NV[:, 2], -NV[:, 1]], 1)
skin_idx = [i for i, m in enumerate(me.materials) if m and m.name == 'skin']
me.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in me.loop_triangles if t.material_index in skin_idx])
cent = V[tris].mean(1); tris = tris[(cent[:, 1] > EY - 0.085) & (cent[:, 2] < EZ + 0.06)]
hv = np.unique(tris)
kd = kdtree.KDTree(len(hv))
for i, v in enumerate(hv): kd.insert(V[v], i)
kd.balance()
def scalp(p):
    w = 0; q = np.zeros(3); n = np.zeros(3)
    for co, i, d in kd.find_n(p, 6):
        ww = 1.0 / (d + 0.002); w += ww; q += np.array(co) * ww; n += NV[hv[i]] * ww
    return q / w, n / np.linalg.norm(n)

exec(open(D + '/groom_fields.py').read())  # hair_area, region, thick (same as groom.py)

def volnormal(p, n):
    r = p - HC; r[0] *= 1.15; r /= np.linalg.norm(r)
    v = n * (1 - C['volW']) + r * C['volW']; return v / np.linalg.norm(v)

mesh = {}
# ---------------------------------------------------------------- hair cards
G = np.load(D + '/groom.npz')
pts, ns, W, U, kind = G['pts'], G['ns'], G['w'], G['u'], G['kind']
TILES = C['tiles']
P, N, UV, COL, IX = [], [], [], [], []
SEG = C['segs']
for i in range(len(pts)):
    p0 = pts[i]
    # resample to SEG+1 rings
    seg = np.linalg.norm(np.diff(p0, axis=0), axis=1); t = np.concatenate([[0], np.cumsum(seg)]); t /= t[-1]
    tt = np.linspace(0, 1, SEG + 1)
    pp = np.stack([np.interp(tt, t, p0[:, c]) for c in range(3)], 1)
    nn = np.stack([np.interp(tt, t, ns[i][:, c]) for c in range(3)], 1); nn /= np.linalg.norm(nn, axis=1)[:, None]
    pp[0] -= nn[0] * C['sink']
    T = np.gradient(pp, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    B = np.cross(nn, T); B /= np.linalg.norm(B, axis=1)[:, None]
    k = str(kind[i]); u = U[i]
    pool = TILES['line'] if k == 'line' else TILES['top'] if k == 'top' else TILES['inner'] if u < 0.55 else TILES['mid'] if u < 0.85 else TILES['outer']
    tile = int(rng.choice(pool)); col, row = tile % 8, tile // 8
    u0, u1 = col / 8 + 0.002, (col + 1) / 8 - 0.002
    if rng.random() < 0.5: u0, u1 = u1, u0
    vroot = 0.5 if row == 0 else 1.0
    shade = C['ao'][0] + (C['ao'][1] - C['ao'][0]) * float(np.clip((u - 0.3) / 0.75, 0, 1))
    if k == 'line': shade = C['aoLine']
    if k == 'top': shade = C['ao'][1]
    shade *= C['sideDk'] + (1 - C['sideDk']) * region(pts[i][0])[0]
    base = len(P)
    for r in range(SEG + 1):
        s = tt[r]; w = W[i] * (1 - C['taper'] * s ** 1.2) * (0.8 + 0.2 * sm(0, 0.15, s))
        vn = volnormal(pp[r], nn[r])
        for j, f in enumerate((-0.5, 0.0, 0.5)):
            q = pp[r] + B[r] * f * w + nn[r] * (C['ridge'] * w if f == 0 else 0)
            P.append(q); N.append(vn)
            UV.append((u0 + (u1 - u0) * (f + 0.5), vroot - (0.012 + 0.975 * s) * 0.5))
            COL.append(shade * (0.92 + 0.08 * s))
    for r in range(SEG):
        a0 = base + r * 3
        for j in range(2):
            v00, v01, v10, v11 = a0 + j, a0 + j + 1, a0 + 3 + j, a0 + 3 + j + 1
            IX += [v00, v10, v01, v01, v10, v11]
mesh['hair'] = dict(P=np.array(P), N=np.array(N), UV=np.array(UV), COL=np.array(COL), IX=np.array(IX))
print('hair cards', len(pts), 'verts', len(P), 'tris', len(IX) // 3)

# ---------------------------------------------------------------- the cap
vm = np.array([min(hair_area(*V[v]), hair_area(V[v][0], V[v][1] - C['capBack'], V[v][2])) for v in hv]); mv = dict(zip(hv.tolist(), vm))
keep = [t_ for t_ in tris if min(mv[v] for v in t_) > C['capEdge']]
cv = np.unique(np.array(keep)); remap = {v: i for i, v in enumerate(cv)}
CP, CN, CC = [], [], []
for v in cv:
    p = V[v]; n = NV[v]; m = mv[v]
    q, nq = scalp(p)
    h = min(C['capMax'], max(C['capMin'], C['capK'] * thick(q) * sm(C['capEdge'], 0.85, m)))
    CP.append(p + n * h); CN.append(volnormal(p + n * h, n)); CC.append(C['capCol'])
CIX = [remap[v] for t_ in keep for v in t_]
mesh['hairCap'] = dict(P=np.array(CP), N=np.array(CN), UV=np.zeros((len(CP), 2)), COL=np.array(CC), IX=np.array(CIX))
print('cap verts', len(CP), 'tris', len(CIX) // 3)

# ---------------------------------------------------------------- brows
ob = np.array(json.load(open(D + '/oldbrows.json')))
BP, BN, BUV, BC, BIX = [], [], [], [], []
NS, NA = 16, 4
for side in (1, -1):
    q_ = ob[ob[:, 0] * side > 0]; ax = np.abs(q_[:, 0])
    x0, x1 = np.percentile(ax, 0.5) + C['browIn'], np.percentile(ax, 99.5) + C['browOut']
    bins = np.linspace(x0, x1, NS + 1)
    lo, hi, zz = [], [], []
    for b in range(NS + 1):
        sel = np.abs(ax - bins[b]) < (x1 - x0) / NS * 1.2
        qq = q_[sel] if sel.sum() > 8 else q_[np.argsort(np.abs(ax - bins[b]))[:20]]
        lo.append(np.percentile(qq[:, 1], 8)); hi.append(np.percentile(qq[:, 1], 94)); zz.append(np.median(qq[:, 2]))
    lo = np.convolve(np.pad(lo, 2, mode='edge'), np.ones(5) / 5, 'valid'); hi = np.convolve(np.pad(hi, 2, mode='edge'), np.ones(5) / 5, 'valid')
    for layer, (tv0, off) in enumerate(((0.5, C['browOff'][0]), (1.0, C['browOff'][1]))):
        base = len(BP)
        for b in range(NS + 1):
            s = b / NS
            # (the tile's band 0.18..0.82 of its height laid over the old brow's band, a little fuller)
            y_lo, y_hi = lo[b] - C['browGrow'], hi[b] + C['browGrow']
            for c in range(NA + 1):
                vt = c / NA
                y = y_lo + (y_hi - y_lo) * (vt - 0.18) / 0.64
                g = np.array([side * bins[b], y, zz[b] + 0.01])
                for _ in range(4):
                    q, n = scalp(g); g = g - n * np.dot(g - q, n) + n * off
                BP.append(g); BN.append(n); BUV.append(((0.12 + 3.7 * s) / 4, tv0 - vt * 0.5)); BC.append(1.0)
        for b in range(NS):
            for c in range(NA):
                v00 = base + b * (NA + 1) + c; v01 = v00 + 1; v10 = v00 + NA + 1; v11 = v10 + 1
                BIX += ([v00, v10, v01, v01, v10, v11] if side > 0 else [v00, v01, v10, v01, v11, v10])
mesh['brows'] = dict(P=np.array(BP), N=np.array(BN), UV=np.array(BUV), COL=np.array(BC), IX=np.array(BIX))
print('brow verts', len(BP), 'tris', len(BIX) // 3)
np.savez(D + '/meshes.npz', **{f'{k}_{f}': v for k, d in mesh.items() for f, v in d.items()})
import os; os.makedirs(D + '/meshes', exist_ok=True)
for k, d in mesh.items():
    for f, v in d.items():
        (v.astype(np.uint32) if f == 'IX' else v.astype(np.float32)).tofile(f'{D}/meshes/{k}_{f}.bin')

# ---------------------------------------------------------------- render
if VIEWS:
    def mk(name, d, mat):
        m = bpy.data.meshes.new(name); P_ = d['P']
        m.from_pydata([(p[0], -p[2], p[1]) for p in P_], [], [tuple(d['IX'][i:i + 3]) for i in range(0, len(d['IX']), 3)])
        uv = m.uv_layers.new(name='UV'); li = np.array([l.vertex_index for l in m.loops])
        uvs = d['UV'][li].copy(); uvs[:, 1] = 1 - uvs[:, 1]; uv.data.foreach_set('uv', uvs.ravel())
        ca = m.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); cc = np.repeat(d['COL'][:, None], 4, 1); cc[:, 3] = 1; ca.data.foreach_set('color', cc.ravel())
        m.shade_smooth() if hasattr(m, 'shade_smooth') else None
        nb = d['N']; m.normals_split_custom_set_from_vertices([(n[0], -n[2], n[1]) for n in nb])
        o = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(o); o.matrix_world = rig.headM()
        m.materials.append(mat); return o
    def cardmat(name, img, cut, rough, spec):
        mt = bpy.data.materials.new(name); mt.use_nodes = True; nt = mt.node_tree
        bs = nt.nodes['Principled BSDF']; tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(img); tx.interpolation = 'Cubic'
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
        nt.links.new(tx.outputs['Color'], mul.inputs['A']); nt.links.new(ca.outputs['Color'], mul.inputs['B']); nt.links.new(mul.outputs['Result'], bs.inputs['Base Color'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'; mr.inputs['From Min'].default_value = cut - 0.2; mr.inputs['From Max'].default_value = cut + 0.2
        nt.links.new(tx.outputs['Alpha'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], bs.inputs['Alpha'])
        bs.inputs['Roughness'].default_value = rough; bs.inputs['Specular IOR Level'].default_value = spec
        tg = nt.nodes.new('ShaderNodeTangent'); tg.direction_type = 'UV_MAP'; tg.uv_map = 'UV'
        nt.links.new(tg.outputs[0], bs.inputs['Tangent']); bs.inputs['Anisotropic'].default_value = 0.75; bs.inputs['Anisotropic Rotation'].default_value = 0.25
        return mt
    hm = cardmat('hair', D + '/atlas/hair_basecolor.png', C['cut'], 0.5, 0.35)
    bm = cardmat('brows', D + '/atlas/brows_basecolor.png', 0.3, 0.6, 0.3)
    cm = bpy.data.materials.new('hairCap'); cm.use_nodes = True; nt = cm.node_tree; bs = nt.nodes['Principled BSDF']
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'; nt.links.new(ca.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.85
    for k, mt in (('hair', hm), ('hairCap', cm), ('brows', bm)): mk(k, mesh[k], mt)
    rig.setup(samples=SAMP)
    for v in VIEWS: rig.render(f'{OUTP}-{v}.jpg', v)
    bpy.ops.wm.save_as_mainfile(filepath=D + '/hair-preview.blend')
