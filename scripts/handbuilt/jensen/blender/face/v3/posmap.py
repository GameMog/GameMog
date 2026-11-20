# posmap.py GLB OUT.npz RES : the skin's bind-space position (and a face-region id) rasterised into its uv atlas
import sys, numpy as np
ARGS = sys.argv[1:]; sys.argv = ["solve.py"]
from solve import *
B = model.Head(ARGS[0]); res = int(ARGS[2]); J, acc = B.J, B.acc
U = acc(J['meshes'][0]['primitives'][0]['attributes']['TEXCOORD_0']).astype(np.float64)
T = B.skinTris; P = B.P0
sel = T[(P[T, 1].min(1) > B.ymax - 0.34)]          # head + neck
pos = np.zeros((res, res, 3), np.float32); msk = np.zeros((res, res), bool)
uv = U * res - 0.5
for t in sel:
    A, Bq, C = uv[t]; x0, y0 = np.floor(np.minimum(np.minimum(A, Bq), C)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(A, Bq), C)).astype(int) + 1
    x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0); x1, y1 = min(x1 + 1, res), min(y1 + 1, res)
    if x1 <= x0 or y1 <= y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1)); p = np.stack([xs, ys], -1).astype(np.float64)
    v0, v1, v2 = Bq - A, C - A, p - A; den = v0[0] * v1[1] - v1[0] * v0[1]
    if abs(den) < 1e-12: continue
    b1 = (v2[..., 0] * v1[1] - v1[0] * v2[..., 1]) / den; b2 = (v0[0] * v2[..., 1] - v2[..., 0] * v0[1]) / den; b0 = 1 - b1 - b2
    m = (b0 >= -0.02) & (b1 >= -0.02) & (b2 >= -0.02)
    if not m.any(): continue
    X = b0[..., None] * P[t[0]] + b1[..., None] * P[t[1]] + b2[..., None] * P[t[2]]
    pos[ys[m], xs[m]] = X[m]; msk[ys[m], xs[m]] = True
A0 = fl.anchors(H.P0, H.skinTris, CT, CB)          # landmark surface points (pre-fit; the fit moves them < 1 cm)
D = np.load(WK + '/d-dt5.npy'); rows = corr_to_mh(CT, CB); A0 = A0 + anchors_mh(rows, D)
np.savez_compressed(ARGS[1], pos=pos, msk=msk, lm=A0, ec=np.array([EC['l'], EC['r']]))
print('texels', msk.sum())
