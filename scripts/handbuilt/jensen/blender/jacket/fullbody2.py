# Jensen's full body (the GLB has the covered skin cut away): the forge base body (MakeHuman hm08) carried to his
# bind by (1) each joint's move base->his bind, through the base's skin weights, then (2) the remaining difference at
# the ~8.4k vertices that still exist in his GLB (matched by UV) spread harmonically over the hidden ones.
import sys, os, json, zlib, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import kdtree
import lib
A = os.path.dirname(os.path.abspath(__file__)) + '/../../../../../public/assets/human-athlete-male/'
J = json.load(open(A + 'asset.json')); buf = zlib.decompress(open(A + 'body.bin.z', 'rb').read())
def get(k):
    L = J['layout'][k]; T = {'Float32Array': np.float32, 'Int8Array': np.int8, 'Uint8Array': np.uint8, 'Uint16Array': np.uint16, 'Int16Array': np.int16}[L['type']]
    return np.frombuffer(buf, dtype=T, count=L['length'], offset=L['offset'])
bp = get('position').reshape(-1, 3).astype(np.float64); buv = get('uv').reshape(-1, 2).astype(np.float64) / 65535.0; buv[:, 1] = 1 - buv[:, 1]
bsi = get('skinIndex').reshape(-1, 4).astype(int); bsw = get('skinWeight').reshape(-1, 4).astype(np.float64) / 255.0
g = [x for x in J['groups'] if x['name'] == 'body'][0]; bidx = get('index')[g['start']:g['start'] + g['count']].reshape(-1, 3).astype(np.int64)
SK = J['skeleton']; JN = lib.JN; jmap = [JN.index(s['name'].replace('.', '_')) for s in SK]
off = np.array([np.array(lib.JOINTS[jmap[i]]['bind']) - np.array(s['head']) for i, s in enumerate(SK)])
bodyv = np.unique(bidx); nb = len(bp)
v1 = bp + (bsw[:, :, None] * off[bsi]).sum(1) / np.maximum(bsw.sum(1), 1e-6)[:, None]
jp = lib.rd('p0', 'pos', 'Float32Array').reshape(-1, 3).astype(np.float64); juv = lib.rd('p0', 'uv', 'Float32Array').reshape(-1, 2).astype(np.float64)
jj = lib.rd('p0', 'j', 'Uint16Array').reshape(-1, 4).astype(int); jw = lib.rd('p0', 'w', 'Float32Array').reshape(-1, 4)
kd = kdtree.KDTree(len(juv))
for i, u in enumerate(juv): kd.insert((u[0], u[1], 0), i)
kd.balance()
m = -np.ones(nb, np.int64)
for v in bodyv:
    best = None
    for co, i, d in kd.find_n((buv[v, 0], buv[v, 1], 0), 6):
        if d > 2e-4: continue
        dp = np.linalg.norm(jp[i] - v1[v])
        if best is None or dp < best[0]: best = (dp, i)
    if best and best[0] < 0.06: m[v] = best[1]
known = m >= 0; print('matched', known.sum(), 'of', len(bodyv))
r = np.zeros((nb, 3)); r[known] = jp[m[known]] - v1[known]
print('residual at matched: median', np.median(np.linalg.norm(r[known], axis=1)), 'max', np.linalg.norm(r[known], axis=1).max())
# adjacency (by position-welded verts: hm08 UV seams split vertices)
E = np.concatenate([bidx[:, [0, 1]], bidx[:, [1, 2]], bidx[:, [2, 0]]]); E = np.concatenate([E, E[:, ::-1]])
# weld: same base position -> same id
_, wid = np.unique(np.round(bp * 1e5).astype(np.int64), axis=0, return_inverse=True); wid = wid.ravel()
nw = wid.max() + 1; We = np.unique(wid[E], axis=0); We = We[We[:, 0] != We[:, 1]]
deg = np.bincount(We[:, 0], minlength=nw).astype(np.float64)
kw = np.zeros(nw, bool); rw = np.zeros((nw, 3)); cnt = np.zeros(nw)
np.add.at(rw, wid[known], r[known]); np.add.at(cnt, wid[known], 1); kw = cnt > 0; rw[kw] /= cnt[kw][:, None]
fixed = rw.copy()
for it in range(3000):
    acc = np.zeros((nw, 3)); np.add.at(acc, We[:, 0], rw[We[:, 1]]); nr = acc / np.maximum(deg, 1)[:, None]
    rw = np.where(kw[:, None], fixed, nr)
final = v1 + rw[wid]
final[known] = jp[m[known]]
# weights: his where matched, else the base's (mapped to his joint ids)
J4 = np.zeros((nb, 4), int); W4 = np.zeros((nb, 4))
J4[:] = np.array(jmap)[bsi]; W4[:] = bsw / np.maximum(bsw.sum(1), 1e-6)[:, None]
J4[known] = jj[m[known]]; W4[known] = jw[m[known]]
keep = bodyv; remap = -np.ones(nb, np.int64); remap[keep] = np.arange(len(keep))
np.savez(lib.D + 'fullbody.npz', pos=final[keep], tri=remap[bidx], j=J4[keep], w=W4[keep], uv=buv[keep], matched=known[keep], hisid=m[keep])
print('saved', len(keep), 'verts', len(bidx), 'tris; y range', final[keep][:, 1].min(), final[keep][:, 1].max())
