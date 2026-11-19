# Shared helpers: load Jensen's bind-space body + rig from dump/, pose from cast clips, render setup.
import bpy, json, os, math, numpy as np
from mathutils import Matrix, Vector, Quaternion
D = os.path.dirname(os.path.abspath(__file__)) + '/dump/'
C = Matrix.Rotation(math.radians(90), 4, 'X')  # glTF (Y-up) -> Blender (Z-up)
def g2b(a):  # (N,3) gltf -> blender
    a = np.asarray(a, dtype=np.float64).reshape(-1, 3); return np.stack([a[:, 0], -a[:, 2], a[:, 1]], 1)
def b2g(a):
    a = np.asarray(a, dtype=np.float64).reshape(-1, 3); return np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
BODY = json.load(open(D + 'body.json'))
JOINTS = BODY['joints']; JN = [j['name'] for j in JOINTS]
def rd(pid, name, typ):
    f = D + f'{pid}.{name}.bin'
    if not os.path.exists(f): return None
    return np.fromfile(f, dtype={'Float32Array': np.float32, 'Int8Array': np.int8, 'Uint16Array': np.uint16, 'Uint32Array': np.uint32, 'Uint8Array': np.uint8}[typ])


# v3b: the owner's flat chest/stomach (b10_bodyflat.py): body_flat.npz moves torso-front skin vertices forward/back in
# the bind (glTF z). Applied by exact position match to the skin primitives and the merged full body; BODYFLAT=0 skips.
_BF = None
def bodyflat(pos_b):
    """pos_b: (N,3) Blender-space bind positions; returns them with the flat-torso delta applied where they match"""
    global _BF
    if os.environ.get('BODYFLAT', '1') == '0': return pos_b
    f = os.path.dirname(os.path.abspath(__file__)) + '/body_flat.npz'
    if not os.path.exists(f): return pos_b
    if _BF is None:
        Z = np.load(f); _BF = {tuple(np.round(p, 5)): dz for p, dz in zip(Z['pos'].astype(np.float64), Z['dz'])}
    g = b2g(pos_b); out = pos_b.copy(); n = 0
    for i, p in enumerate(np.round(g, 5)):
        dz = _BF.get(tuple(p))
        if dz is not None: out[i, 1] -= dz; n += 1   # glTF +z forward = Blender -y
    return out

def make_armature():
    ad = bpy.data.armatures.new('rig'); ao = bpy.data.objects.new('rig', ad); bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    for j in JOINTS:
        b = ad.edit_bones.new(j['name']); h = Vector(g2b(j['bind'])[0]); b.head = h; b.tail = h + Vector((0, 0.04, 0)); b.roll = 0
    for j in JOINTS:
        if j['parent']: ad.edit_bones[j['name']].parent = ad.edit_bones[j['parent']]
    bpy.ops.object.mode_set(mode='OBJECT'); return ao

def mat_from(p, name=None):
    m = bpy.data.materials.new(name or p['mat'] or p['id']); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bc = p.get('base') or [1, 1, 1, 1]; bs.inputs['Base Color'].default_value = bc
    if p.get('rough') is not None: bs.inputs['Roughness'].default_value = p['rough']
    if p.get('metal') is not None: bs.inputs['Metallic'].default_value = p['metal']
    t = p['tex']
    if t.get('base'):
        im = nt.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(D + t['base'], check_existing=True)
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
        nt.links.new(im.outputs[0], mul.inputs[6]); mul.inputs[7].default_value = bc; nt.links.new(mul.outputs[2], bs.inputs['Base Color'])
        if p.get('alpha') in ('MASK', 'BLEND'):
            nt.links.new(im.outputs[1], bs.inputs['Alpha']) if p.get('alpha') == 'MASK' else None
            m.blend_method = 'HASHED' if hasattr(m, 'blend_method') else None
    if p.get('alpha') == 'BLEND': bs.inputs['Alpha'].default_value = bc[3]
    if t.get('normal'):
        im = nt.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(D + t['normal'], check_existing=True); im.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(im.outputs[0], nm.inputs[1]); nt.links.new(nm.outputs[0], bs.inputs['Normal'])
    if t.get('mr'):
        im = nt.nodes.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(D + t['mr'], check_existing=True); im.image.colorspace_settings.name = 'Non-Color'
        sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(im.outputs[0], sp.inputs[0]); nt.links.new(sp.outputs[1], bs.inputs['Roughness']); nt.links.new(sp.outputs[2], bs.inputs['Metallic'])
    return m

def build_prim(p, arm=None, name=None):
    ty = p['types']; pos = g2b(rd(p['id'], 'pos', ty['pos']))
    if p['mat'] == 'skin': pos = bodyflat(pos)
    idx = rd(p['id'], 'idx', ty['idx']) if ty['idx'] else np.arange(len(pos))
    tri = idx.reshape(-1, 3).astype(np.int64)
    used = np.unique(tri); remap = -np.ones(len(pos), np.int64); remap[used] = np.arange(len(used))
    me = bpy.data.meshes.new(name or p['mat']); me.from_pydata(pos[used].tolist(), [], remap[tri].tolist())
    uv = rd(p['id'], 'uv', ty['uv'])
    if uv is not None:
        uv = uv.reshape(-1, 2)[used]; ul = me.uv_layers.new(name='UV0')
        lv = np.zeros(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
        u = uv[lv].copy(); u[:, 1] = 1 - u[:, 1]; ul.data.foreach_set('uv', u.ravel())
    me.materials.append(mat_from(p)); me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o = bpy.data.objects.new(name or p['mat'], me); bpy.context.scene.collection.objects.link(o)
    o['src_ids'] = used.tolist() if len(used) < 0 else []
    if arm is not None:
        J = rd(p['id'], 'j', ty['j']).reshape(-1, 4)[used]; W = rd(p['id'], 'w', ty['w']).reshape(-1, 4)[used]
        for n in JN: o.vertex_groups.new(name=n)
        for vi in range(len(used)):
            for k in range(4):
                if W[vi, k] > 0: o.vertex_groups[int(J[vi, k])].add([vi], float(W[vi, k]), 'REPLACE')
        o.parent = arm; md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm
    return o

def load_body(skip=('uniform', 'uniform-hem', 'moto-collar'), arm=True):
    a = make_armature() if arm else None; objs = {}
    for p in BODY['prims']:
        if p['mat'] in skip: continue
        o = build_prim(p, a, name=p['mat'] + '_' + p['id']); objs[p['id']] = o
    return a, objs

# ---------- clips ----------
CL = None
def clip_pose(name, t):
    """world rotation (Blender) and position per joint for clip `name` at time t (seconds)."""
    global CL
    if CL is None: CL = json.load(open(D + os.environ.get('CLIPS', 'clips_fixed.json' if os.path.exists(D + 'clips_fixed.json') else 'clips.json')))
    c = CL['clips'][name]
    def samp(key, n):
        ch = c.get(key)
        if not ch: return None
        T = np.array(ch['t']); V = np.array(ch['v']).reshape(len(T), n); tt = min(max(t, T[0]), T[-1])
        i = int(np.searchsorted(T, tt, side='right') - 1); i = min(i, len(T) - 2) if len(T) > 1 else 0
        if len(T) == 1:
            if n == 4: q = Quaternion((V[0, 3], V[0, 0], V[0, 1], V[0, 2])); q.normalize(); return q
            return V[0]
        f = (tt - T[i]) / max(T[i + 1] - T[i], 1e-9)
        if n == 4:
            qa = Quaternion((V[i, 3], V[i, 0], V[i, 1], V[i, 2])); qb = Quaternion((V[i + 1, 3], V[i + 1, 0], V[i + 1, 1], V[i + 1, 2])); qa.normalize(); qb.normalize(); q = qa.slerp(qb, f); q.normalize(); return q
        return V[i] * (1 - f) + V[i + 1] * f
    W = {}
    def trs(t, r, sc=(1, 1, 1)):
        q = Quaternion((r[3], r[0], r[1], r[2])); q.normalize()
        return Matrix.Translation(Vector(t)) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((*sc, 1))
    for j in JOINTS:
        q = samp(j['name'] + '|rotation', 4)
        if not isinstance(q, Quaternion): q = Quaternion((j['rest']['r'][3], *j['rest']['r'][:3]))
        tr = samp(j['name'] + '|translation', 3)
        tl = list(tr) if tr is not None else j['rest']['t']
        M = W[j['parent']] if j['parent'] else Matrix.Identity(4)
        for v in j.get('via', []): M = M @ trs(v['t'], [0, 0, 0, 1] if v['name'].startswith('armhang_') else v['r'], v['s'])  # (the runtime levels armhang: wagmi/storyrun/pack.js)
        W[j['name']] = M @ Matrix.Translation(Vector(tl)) @ q.to_matrix().to_4x4()
    return W

def apply_pose(arm, name, t):
    W = clip_pose(name, t); posed = {}
    for j in JOINTS:
        posed[j['name']] = C @ W[j['name']] @ C.inverted()  # blender armature space (rest rotation identity)
    for j in JOINTS:
        pb = arm.pose.bones[j['name']]; rest = arm.data.bones[j['name']].matrix_local
        if j['parent'] is None: pb.matrix_basis = rest.inverted() @ posed[j['name']]
        else:
            rp = arm.data.bones[j['parent']].matrix_local
            pb.matrix_basis = (rp.inverted() @ rest).inverted() @ posed[j['parent']].inverted() @ posed[j['name']]
    bpy.context.view_layer.update()

# ---------- render ----------
def studio(res=(1280, 720), engine='BLENDER_EEVEE', bg=(0.055, 0.055, 0.06)):
    sc = bpy.context.scene; sc.render.engine = engine; sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [l for l in []] else 'None'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (*bg, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    def area(name, loc, energy, size, color=(1, 1, 1)):
        l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color; o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
        d = Vector((0, 0, 1.2)) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return o
    area('key', (-1.6, -2.2, 2.4), 260, 1.6, (1, 0.96, 0.9)); area('fill', (2.2, -1.6, 1.4), 60, 2.5, (0.85, 0.9, 1)); area('rim', (0.8, 2.2, 2.2), 300, 1.2); area('rim2', (-1.4, 1.8, 1.6), 160, 1.0)
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    if engine == 'CYCLES': sc.cycles.samples = 64; sc.cycles.use_denoising = True
    return co
def shoot(co, loc, at, lens, out):
    co.location = loc; d = Vector(at) - Vector(loc); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); co.data.lens = lens
    bpy.context.scene.render.filepath = out; bpy.ops.render.render(write_still=True)

def load_fullbody(arm, name='fullbody', mat=None):
    Z = np.load(D + 'fullbody.npz'); pos = bodyflat(g2b(Z['pos']))
    me = bpy.data.meshes.new(name); me.from_pydata(pos.tolist(), [], Z['tri'].tolist()); me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if mat: me.materials.append(mat)
    for n in JN: o.vertex_groups.new(name=n)
    J4, W4 = Z['j'], Z['w']
    for vi in range(len(pos)):
        for k in range(4):
            if W4[vi, k] > 0: o.vertex_groups[int(J4[vi, k])].add([vi], float(W4[vi, k]), 'REPLACE')
    if arm is not None:
        o.parent = arm; md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm
    return o
