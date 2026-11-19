# The head sculpt: a smooth, symmetric deformation of the SAME skin vertices (no topology change), authored by eye
# against the owner's reference. Applied to the Basis and every shape key (so each morph's delta is unchanged), carried
# to the riders (brows, lashes, lower teeth by nearness), written out as a MakeHuman .target (facekit.bakeRest format).
import bpy, sys, os, json, math
from mathutils import Vector, kdtree
sys.path.insert(0, os.path.dirname(__file__)); import scene
DEF = json.load(open(os.path.join(os.path.dirname(__file__), 'sculpt.json')))
def ss(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def field(p, K=DEF):
    """displacement (metres, blender data axes: x his-left, -y forward, z up) at head-local point p"""
    x, y, z = p; ax = abs(x); sx = 1 if x >= 0 else -1; d = Vector((0, 0, 0))
    for b in K['blobs']:
        c = b['c']; r = b['r']; q = ((ax - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) / (r * r)
        if q > 9: continue
        w = math.exp(-q); v = b['d']; d += Vector((v[0] * sx * w, v[1] * w, v[2] * w))
    J = K['jaw']  # lower-face taper: x scaled toward the midline below the cheekbones, front of the ears only
    t = ss((J['z0'] - z) / (J['z0'] - J['z1'])) * (1 - ss((J['zn'] - z) / 0.03)) * ss((J['yb'] - y) / J['yf'])
    d.x += -x * J['k'] * t
    C = K['chin']  # shorten the chin's height: below the lower lip lifted, fading into the neck
    t = ss((C['z0'] - z) / C['span']) * (1 - ss((C['zn'] - z) / 0.035)) * ss((C['yb'] - y) / 0.03)
    d.z += C['up'] * t; d.y += C.get('fwd', 0) * t
    return d * K.get('gain', 1.0)
def apply(o, K=DEF, riders=('brows', 'lashes', 'teethLow', 'hairCap', 'hair', 'glasses', 'lens-edges', 'lenses')):
    m = o.data; ey = scene.mat_verts(o, 'eyes')
    L = [m.vertices[i].co for i in ey if m.vertices[i].co.x > 0]; cl = sum(L, Vector()) / len(L); E = Vector((0, cl.y, cl.z))
    sk = scene.mat_verts(o, 'skin'); D = {}
    for i in sk:
        p = m.vertices[i].co - E
        if p.z < -0.22: continue
        d = field(p, K)
        if d.length > 1e-7: D[i] = d
    # riders: the nearest moved skin point's delta, so brows/lashes/teeth/hair/glasses go with the face in the preview
    kd = kdtree.KDTree(len(sk))
    for j, i in enumerate(sk): kd.insert(m.vertices[i].co, i)
    kd.balance()
    for name in riders:
        if name not in [s.name for s in m.materials]: continue
        for i in scene.mat_verts(o, name):
            if i in D: continue
            co, idx, dist = kd.find(m.vertices[i].co)
            if idx in D: D[i] = D[idx]
    keys = m.shape_keys.key_blocks if m.shape_keys else []
    for i, d in D.items():
        m.vertices[i].co += d
        for kb in keys: kb.data[i].co += d
    m.update(); peak = max((d.length for d in D.values()), default=0)
    print('SCULPT moved', len(D), 'peak mm %.2f' % (peak * 1000))
    return E, D, sk
def write_target(o, D, sk, path, base_obj):
    """MakeHuman .target: 'vertex dx dy dz' in MakeHuman units (MH x=x, y=up, z=forward), via facekit's uv map"""
    vt = []; uvto = {}; V = []; g = ''
    for l in open(base_obj):
        if l.startswith('v '): V.append(tuple(map(float, l.split()[1:4])))
        elif l.startswith('vt '): vt.append(tuple(map(float, l.split()[1:3])))
        elif l.startswith('g '): g = l[2:].strip()
        elif l.startswith('f ') and g == 'body':
            for c in l.split()[1:]:
                a = c.split('/'); vi = int(a[0]) - 1; ti = int(a[1]) - 1; u, v = vt[ti]
                uvto[(round(u * 2e4), round(v * 2e4))] = vi
    m = o.data; uv = m.uv_layers[0].data; vmh = {}
    for p in m.polygons:
        if m.materials[p.material_index].name != 'skin': continue
        for li in p.loop_indices:
            vi = m.loops[li].vertex_index
            if vi in vmh: continue
            u, v = uv[li].uv; k = (round(u * 2e4), round(v * 2e4))
            mh = uvto.get(k)
            if mh is None:
                for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    mh = uvto.get((k[0] + du, k[1] + dv))
                    if mh is not None: break
            if mh is not None: vmh[vi] = mh
    # scale: least squares data z (pre-sculpt) vs base y on the head (as facekit.skinMap)
    zs = [(m.vertices[i].co.z - (D[i].z if i in D else 0), V[vmh[i]][1]) for i in vmh]
    zmax = max(a for a, b in zs); zs = [(a, b) for a, b in zs if a > zmax - 0.25]
    n = len(zs); sx = sum(b for a, b in zs); sxx = sum(b * b for a, b in zs); sy = sum(a for a, b in zs); sxy = sum(a * b for a, b in zs)
    s = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    out = {}
    for i, d in D.items():
        if i in vmh: out[vmh[i]] = (d.x / s, d.z / s, -d.y / s)
    with open(path, 'w') as f:
        f.write('# Jensen head sculpt (original work, CC0): MakeHuman base.obj vertex, dx dy dz in MakeHuman units\n')
        f.write('# made by blender/face/src/sculpt.py from sculpt.json; apply with facekit.bakeRest(doc, [[file, 1]])\n')
        for k in sorted(out): f.write('%d %.6f %.6f %.6f\n' % (k, *out[k]))
    print('TARGET', path, len(out), 'verts; scale', round(s, 5), 'mapped', len(vmh))
