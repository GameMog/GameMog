# detail2.py SRC_TAG OUT_TAG spec.json : detail.py's soft symmetric deformers (same keys) plus, for iteration 2:
#   'sx' (per deformer): a lateral scale about the deformer's centre (widens a mid-line feature such as the nose tip)
#   'shorten': {'mm', 'x0', 'x1', 'z0'}: the lower third lifted, 0 at the subnasale, 'mm' at the chin, faded toward the
#              jaw angle (|x| x0..x1 mm) and the back (z < z0 mm), and below the chin into the neck
#   'smooth': [{'at', 'r', 'it', 'a'}]: Laplacian smoothing of the shaped surface inside a soft region (eases creases)
# All in mm, glTF axes (+x his left, +y up, +z forward). Same points, same order; symmetric; the pins (lid margins,
# lower neck, back of head) respected. Writes work/d-OUT.npy and work/OUT.glb (no reference render).
sys_argv = list(__import__('sys').argv); __import__('sys').argv = ['solve.py']
from solve import *
sys.argv = sys_argv
src, out = sys.argv[1], sys.argv[2]; spec = json.load(open(sys.argv[3]))
d = np.load(WK + f'/d-{src}.npy'); A0 = fl.anchors(H.P0, H.skinTris, CT, CB)
free = 1 - MU; add = np.zeros_like(d)
for k in spec.get('deformers', []):
    ids = k['at'] if isinstance(k['at'], list) else [k['at']]
    C = A0[ids].mean(0) + np.array(k.get('off', [0, 0, 0])) / 1000; r = k['r'] / 1000
    for Cs in ([C, C * [-1, 1, 1]] if abs(C[0]) > 0.004 else [C * [0, 1, 1]]):
        sx = np.sign(Cs[0]) if abs(Cs[0]) > 0.004 else 0
        w = np.exp(-0.5 * (np.linalg.norm((X0 - Cs) / np.array(k.get('aniso', [1, 1, 1])), axis=1) / r) ** 2)
        w *= (X0[:, 2] > Cs[2] - k.get('depth', 30) / 1000)
        v = np.array([k.get('out', 0) * sx + k.get('x', 0), k.get('y', 0), k.get('z', 0)]) / 1000
        add += w[:, None] * v[None, :]
        if k.get('sx'): add[:, 0] += w * k['sx'] * (X0[:, 0] - Cs[0]) * (0.5 if sx == 0 else 1)
if 'shorten' in spec:
    s = spec['shorten']; ys, yc = A0[2, 1], A0[152, 1]; y = X0[:, 1]
    t = np.clip((ys - y) / (ys - yc), 0, 1.0)
    if 'knee' in s:   # half the lift reached at the mouth (the lips and chin move more as one block: no compression under the lower lip)
        yl = A0[14, 1]; t = np.where(y > yl, s['knee'] * np.clip((ys - y) / (ys - yl), 0, 1), s['knee'] + (1 - s['knee']) * np.clip((yl - y) / (yl - yc), 0, 1))
    below = np.clip(1 - (yc - y) / (s.get('fade', 18) / 1000), 0, 1); t = np.where(y < yc, below, t)
    ax = np.abs(X0[:, 0]) * 1000; wx = np.clip(1 - (ax - s['x0']) / (s['x1'] - s['x0']), 0, 1); wz = np.clip((X0[:, 2] * 1000 - s['z0']) / 30, 0, 1)
    add[:, 1] += t * wx * wz * s['mm'] / 1000
for c in spec.get('counter', []):   # a face unit's own delta, weighted into the lips only (lips sealed over a slightly open jaw)
    T = H.mh_delta(c['target'])[mh_ids] * H.s; C = A0[[13, 14]].mean(0); r = c['r'] / 1000
    w = np.exp(-0.5 * (np.linalg.norm((X0 - C) / np.array(c.get('aniso', [2.2, 1, 1])), axis=1) / r) ** 2) * (X0[:, 2] > C[2] - 0.025)
    add += c['w'] * w[:, None] * T
add *= free[:, None]
d2 = d + add
for sm in spec.get('smooth', []):
    ids = sm['at'] if isinstance(sm['at'], list) else [sm['at']]; C = A0[ids].mean(0); r = sm['r'] / 1000
    w = np.zeros(N)
    for Cs in ([C, C * [-1, 1, 1]] if abs(C[0]) > 0.004 else [C]): w = np.maximum(w, np.exp(-0.5 * (np.linalg.norm(X0 - Cs, axis=1) / r) ** 2))
    w *= free * sm.get('a', 0.5)
    X = X0 + d2
    for _ in range(sm.get('it', 10)): X = X + w[:, None] * (L @ X)
    d2 = X - X0
d2 = np.where(MIROK[:, None], 0.5 * (d2 + d2[mir] * [-1, 1, 1]), d2)
np.save(WK + f'/d-{out}.npy', d2); model.write(H, glbD(d2), WK + f'/{out}.glb')
dd = d2 - d; print('iter2 peak add mm', round(1000 * np.linalg.norm(dd, axis=1).max(), 2), 'total peak', round(1000 * np.linalg.norm(d2, axis=1).max(), 2))
