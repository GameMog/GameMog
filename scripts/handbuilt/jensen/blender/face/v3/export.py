# export.py TAG OUTDIR : head-sculpt.target = iteration-2 sculpt (parts0) + the v3 field (MakeHuman dm), and v3-only
import sys as _s; _a = list(_s.argv); _s.argv = ['solve.py']
from solve import *
tag, outdir = _a[1], _a[2]; d = np.load(WK + f'/d-{tag}.npy'); T = d / H.s
old = model.read_target(V + '/parts0/face/head-sculpt.target'); acc = {int(i): np.array(v) for i, v in zip(*old)}
for m, t in zip(mh_ids, T):
    if np.abs(t).max() > 1e-7: acc[int(m)] = acc.get(int(m), np.zeros(3)) + t
os.makedirs(outdir, exist_ok=True)
with open(outdir + '/head-sculpt.target', 'w') as f:
    f.write('# Jensen head sculpt: Blender iteration 2 + v3 free-form fit (%s). base.obj vertex, dx dy dz (dm). Original work, CC0.\n' % tag)
    for i in sorted(acc): f.write('%d %.6f %.6f %.6f\n' % (i, *acc[i]))
with open(outdir + '/face-v3-only.target', 'w') as f:
    f.write('# Jensen v3 free-form fit only (%s), additive on top of the iteration-2 head-sculpt.target. CC0.\n' % tag)
    for m, t in zip(mh_ids, T):
        if np.abs(t).max() > 1e-7: f.write('%d %.6f %.6f %.6f\n' % (m, *t))
print('verts', len(acc), 'v3 peak mm', 1000 * np.linalg.norm(d, axis=1).max())
