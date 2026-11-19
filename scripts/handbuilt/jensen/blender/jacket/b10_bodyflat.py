# v3b BODY FLATTEN (owner 19 Nov: "chest and stomach should NOT protrude. need to be naturally flattened").
# A direct vertex edit of the torso front in bind space (glTF: y up, +z forward), computed on the merged full body
# (dump/fullbody.npz) and written as body_flat.npz: gltf positions + forward (z) deltas, so the assembler can apply it
# to jensen.glb's skin primitive(s) by matching positions (apply_bodyflat.mjs). Only torso-front vertices between the
# belt (y 0.95) and the collarbone (y 1.40) move, only along z; the head/face (and so the talk morphs) are untouched.
# Run with the v3 env python (numpy only):  ../env/bin/python b10_bodyflat.py
import numpy as np, os
H = os.path.dirname(os.path.abspath(__file__))
Z = np.load(H + '/dump/fullbody.npz'); P = Z['pos'].astype(np.float64); tri = Z['tri']
x, y, z = P[:, 0], P[:, 1], P[:, 2]
def sm(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)
# target front: a flat male chest/stomach. Centre line straight from the chest (12.3 cm at y 1.27) down to the belt
# (11.4 cm at y 1.02), so the stomach sits BEHIND the chest line; the cross-section a gentle arc (no pec mounds).
def Tc(yy): return np.interp(yy, [0.90, 1.02, 1.27, 1.45], [0.114, 0.114, 0.123, 0.123])
T = Tc(y) - 0.9 * x ** 2
phi = np.arctan2(x, z)
mask = sm((1.40 - np.abs(phi)) / 0.35) * sm((y - 0.95) / 0.05) * sm((1.40 - y) / 0.05) * sm((0.20 - np.abs(x)) / 0.03) * (z > 0)
E = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]); E = np.concatenate([E, E[:, ::-1]])
deg = np.bincount(E[:, 0], minlength=len(P)).astype(np.float64)
fixed = mask < 1e-4
fz = sm((0.11 - np.abs(x)) / 0.03) * sm((y - 1.15) / 0.04) * sm((1.34 - y) / 0.03)
d = np.zeros(len(P))
for rnd in range(4):   # pull ahead-of-target points back / fill the hollows, then smooth a little; repeat on the result
    zc = z + d; over = zc > T
    dd = np.where(over, -(zc - T) * 0.9, 0.0)   # 10% kept per round: a soft, not dead-flat, surface
    gap = np.clip((T - 0.003) - zc, 0, 0.012)    # the sternum gap and the under-pec fold (what makes pecs read as breasts)
    dd = dd + gap * 0.8 * fz * (~over)
    d = d + dd * mask
    for it in range(4):
        acc = np.zeros(len(P)); np.add.at(acc, E[:, 0], d[E[:, 1]])
        d = d * 0.5 + acc / np.maximum(deg, 1) * 0.5; d[fixed] = 0
mv = np.abs(d) > 1e-5
np.savez(H + '/body_flat.npz', pos=P[mv].astype(np.float32), dz=d[mv].astype(np.float32), ids=np.where(mv)[0])
Q = P.copy(); Q[:, 2] += d
np.save(H + '/body_flat_full.npy', Q.astype(np.float32))
print('moved', mv.sum(), 'verts; dz min %.1f max %.1f mm' % (d.min() * 1000, d.max() * 1000))
XS = [0, 0.03, 0.06, 0.09, 0.12, 0.15]
for nm, PP in (('BEFORE', P), ('AFTER', Q)):
    print(nm, 'front-most z (cm) per height | x =', XS)
    for yy in np.arange(1.40, 0.94, -0.025):
        r = []
        for xx in XS:
            s = (np.abs(np.abs(PP[:, 0]) - xx) < 0.01) & (np.abs(PP[:, 1] - yy) < 0.01) & (PP[:, 2] > 0)
            r.append('%5.1f' % (PP[s, 2].max() * 100) if s.any() else '  -  ')
        print('y %.3f ' % yy, ' '.join(r))
