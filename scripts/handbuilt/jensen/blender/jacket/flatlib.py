# v3b flatness helpers (owner 19 Nov: "chest and stomach should NOT protrude, naturally flattened").
# Blender space: Z up, he faces -Y (front = min y), his left +X.
import numpy as np, bpy
import lib
JN = lib.JN
def vweights(o):
    W = np.zeros((len(o.data.vertices), len(JN)), np.float64); gi = {g.index: JN.index(g.name) for g in o.vertex_groups if g.name in JN}
    for v in o.data.vertices:
        for g in v.groups:
            if g.group in gi: W[v.index, gi[g.group]] = g.weight
    s = W.sum(1, keepdims=True); return W / np.maximum(s, 1e-9)
def skin_mats(rig):
    return np.array([np.array(pb.matrix @ pb.bone.matrix_local.inverted()) for pb in (rig.pose.bones[n] for n in JN)])
def skin(P, W, S):
    """linear blend skinning in numpy: P (N,3) bind, W (N,J) weights, S (J,4,4)"""
    Ph = np.c_[P, np.ones(len(P))]
    out = np.zeros((len(P), 3))
    for j in np.where(W.sum(0) > 0)[0]:
        w = W[:, j]; m = w > 0
        out[m] += w[m, None] * (Ph[m] @ S[j].T)[:, :3]
    return out
def rest(rig):
    for b in rig.pose.bones: b.matrix_basis.identity()
    bpy.context.view_layer.update()
def pose(rig, clip, t):
    if clip == 'rest': rest(rig)
    else: lib.apply_pose(rig, clip, float(t))
    return skin_mats(rig)
def smooth01(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

# ---- the front weight scheme: the torso front (sternum to the hem band) rides ONE rigid chest frame, handing over to
# the hips only across the hem band, so the front stays a straight line in every clip (the clips kink the spine 20-38
# degrees between spine02 and spine01, which bowed the linear-skinned belly out)
def front_mask(P, zlo=0.90, zhi=1.40, phmax=1.25, phfade=0.35):
    ph = np.abs(np.arctan2(P[:, 0], -P[:, 1]))
    wph = smooth01((phmax + phfade - ph) / phfade)   # 1 across the front, fading out toward the side seams
    wz = smooth01((zhi - P[:, 2]) / 0.06) * (P[:, 2] > zlo)
    return wph * wz
def front_weights(P, chest='spine01', z_hand=(0.985, 1.06), mix=None):
    """weights (N,J) for the scheme: above z_hand[1] all `chest` (or `mix` dict), below z_hand[0] all root, smooth between"""
    W = np.zeros((len(P), len(JN)))
    r = smooth01((z_hand[1] - P[:, 2]) / (z_hand[1] - z_hand[0]))
    top = mix or {chest: 1.0}
    for n, f in top.items(): W[:, JN.index(n)] += (1 - r) * f
    W[:, JN.index('root')] += r
    return W
