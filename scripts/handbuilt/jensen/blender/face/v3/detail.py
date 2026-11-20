# detail.py SRC_TAG OUT_TAG [detail.json]: the likeness details by eye, on top of the free-form fit's field.
# Soft symmetric deformers placed at MediaPipe landmarks' surface points (the frontal correspondence), in mm, glTF axes
# (+x = his left, +y up, +z forward); 'out' = away from the mid-plane (x sign of the side), mirrored to the other side.
import subprocess
sys_argv = list(__import__('sys').argv); __import__('sys').argv = ['solve.py']
from solve import *
sys.argv = sys_argv
src, out = sys.argv[1], sys.argv[2]; spec = json.load(open(sys.argv[3] if len(sys.argv) > 3 else V + '/scripts/detail.json'))
d = np.load(WK + f'/d-{src}.npy'); A0 = fl.anchors(H.P0, H.skinTris, CT, CB)
free = 1 - MU
add = np.zeros_like(d)
for k in spec['deformers']:
    ids = k['at'] if isinstance(k['at'], list) else [k['at']]
    C = A0[ids].mean(0) + np.array(k.get('off', [0, 0, 0])) / 1000; r = k['r'] / 1000
    for Cs in ([C, C * [-1, 1, 1]] if abs(C[0]) > 0.004 else [C * [0, 1, 1]]):
        sx = np.sign(Cs[0]) if abs(Cs[0]) > 0.004 else 0
        w = np.exp(-0.5 * (np.linalg.norm((X0 - Cs) / np.array(k.get('aniso', [1, 1, 1])), axis=1) / r) ** 2)
        w *= (X0[:, 2] > Cs[2] - k.get('depth', 30) / 1000)
        v = np.array([k.get('out', 0) * sx + k.get('x', 0), k.get('y', 0), k.get('z', 0)]) / 1000
        add += w[:, None] * v[None, :]
# the nose: scale the fit's own vertical drop on the lower nose (an up-tilted 3/4 photo cannot tell down from forward)
if 'noseKeep' in spec:
    nk = spec['noseKeep']; w = NOSE * nk['w']; d = d.copy(); d[:, 1] -= w * np.minimum(d[:, 1], 0) * nk['undo']
# neck: radial thickening in a band under the jaw
if 'neck' in spec:
    nk = spec['neck']; y = X0[:, 1]; yc = A0[152, 1]; band = np.clip((yc - y - 0.02) / 0.02, 0, 1) * np.clip((y - (yc - 0.12)) / 0.03, 0, 1)
    c = np.array([0, 0, X0[band > 0.5, 2].mean() if (band > 0.5).any() else 0]); rad = (X0 - c) * [1, 0, 1]
    add += (band * nk['scale'])[:, None] * rad
add *= free[:, None]
d2 = d + add; d2 = np.where(MIROK[:, None], 0.5 * (d2 + d2[mir] * [-1, 1, 1]), d2)
np.save(WK + f'/d-{out}.npy', d2); model.write(H, glbD(d2), WK + f'/{out}.glb')
print('detail peak add mm', 1000 * np.linalg.norm(add, axis=1).max(), 'total peak', 1000 * np.linalg.norm(d2, axis=1).max())
c = json.load(open(WK + f'/cam-{src}.json')); render(WK + f'/{out}.glb', [c], WK + f'/r-{out}-')
px = detect(WK + f'/r-{out}-ref.jpg', WK + f'/r-{out}-ref.lm.json'); print('TRUE', fl.landmark_loss(px, Q, W))
