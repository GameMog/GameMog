# Step 9: pose tests with the game's clips (cast-clips.glb, bound by bone name as the runtime does): poke-through count
# (body points outside the posed jacket, torso/arms only) and quick renders. -- <outprefix> [clip:t,...]
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
H = os.path.dirname(os.path.abspath(__file__))
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=H + '/skin.blend')
import lib
rig = bpy.data.objects['rig']; L = bpy.data.objects['leather']
m = bpy.data.materials.new('sk'); m.diffuse_color = (0.8, 0.55, 0.42, 1)
fb = lib.load_fullbody(rig, mat=m)
Z = np.load(lib.D + 'fullbody.npz'); JJ = Z['j']; WW = Z['w']; JN = lib.JN
covered = np.array([n.startswith(('spine', 'clavicle', 'shoulder', 'upperarm', 'lowerarm', 'armhang')) for n in JN])
cov = (WW * covered[JJ]).sum(1) > 0.85
handw = np.array([n.startswith(('finger', 'wrist')) for n in JN]); cov &= (WW * handw[JJ]).sum(1) < 0.02
P0 = lib.g2b(Z['pos'])
# also not the neck/wrist edges: only points well inside the jacket's coverage at rest
insidez = (P0[:, 2] > 0.98) & (P0[:, 2] < 1.43)
test_all = np.where(cov & insidez)[0]
kept = set(np.concatenate([lib.rd('p0', 'idx', 'Uint16Array'), lib.rd('p6', 'idx', 'Uint16Array')]).tolist())
hid = Z['hisid']; vis = np.array([h in kept for h in hid])
test = np.where(cov & insidez & vis)[0]
print('test points: covered', len(test_all), 'of them still visible skin in the GLB', len(test))
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
sc.render.resolution_x = 640; sc.render.resolution_y = 720
mj = bpy.data.materials.new('j'); mj.diffuse_color = (0.1, 0.1, 0.11, 1); L.data.materials.clear(); L.data.materials.append(mj)
MM = bpy.data.materials.new('mm'); MM.diffuse_color = (0.7, 0.7, 0.72, 1); bpy.data.objects['metal'].data.materials.clear(); bpy.data.objects['metal'].data.materials.append(MM)
cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
poses = [p.split(':') for p in (a[1].split(',') if len(a) > 1 else ['rest:0', 'walk:0.3', 'sitTalk:1.0', 'talk:1.4', 'argue:6.0', 'shrug:1.1'])]
outs = []; rep = []
for clip, t in poses:
    if clip == 'rest':
        for b in rig.pose.bones: b.matrix_basis.identity()
        bpy.context.view_layer.update()
    else: lib.apply_pose(rig, clip, float(t))
    dg = bpy.context.evaluated_depsgraph_get()
    je = L.evaluated_get(dg); bm = bmesh.new(); bm.from_object(je, dg); bm.normal_update(); bvh = BVHTree.FromBMesh(bm)
    be = fb.evaluated_get(dg); bp = np.array([v.co[:] for v in be.data.vertices])
    poke = []
    for i in test:
        hit = bvh.find_nearest(Vector(bp[i]))
        if hit[0] is None: continue
        d = (Vector(bp[i]) - hit[0]).dot(hit[1])
        if d > 0.0015: poke.append(d)
    rep.append((clip, t, len(poke), round(max(poke) * 1000, 1) if poke else 0)); bm.free()
    root = rig.pose.bones['spine03'].matrix.translation if clip != 'rest' else Vector((0, 0, 1.1))
    tgt = rig.matrix_world @ root
    for k, off in enumerate([Vector((0.0, -2.3, 0.15)), Vector((1.6, -1.6, 0.2))]):
        f = a[0] + f'_{clip}{k}.png'; lib.shoot(co, tgt + off, tgt + Vector((0, 0, 0.05)), 45, f); outs.append(f)
print('POKE', rep)
print('OUTS', ' '.join(outs))
