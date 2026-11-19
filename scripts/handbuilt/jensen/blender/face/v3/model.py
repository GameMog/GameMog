# the hm08 head of jensen.glb in numpy: the MakeHuman vertex map (by uv, as facekit.mjs skinMap), target loading,
# deltas on the skin and everything that rides it, and writing a reshaped copy of the GLB (same points, same order)
import os, json, numpy as np, struct
import glb
from scipy.spatial import cKDTree
JENSEN = os.environ.get('JH_FACE_WORK', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work')) + '/base-plain.glb'
MH_BASE = os.environ['FORGE_MH_BASE']
MH_T = os.environ['FORGE_MH_TARGETS']
SCR = os.environ['JH_SCRATCH']   # scratch tree: assets/hero/makehuman (CC0 downloads), facefit/x_packs, ref/ (measured only; never committed)
FU = SCR + '/assets/hero/makehuman/x_faceunits01/targets/faceunits'
PACKS = SCR + '/facefit/x_packs'
def tpath(name):
    if '/' in name and not name.startswith('pack:'): return os.path.join(MH_T, name + '.target')
    if name.startswith('pack:'): return os.path.join(PACKS, name[5:] + '.target')
    return os.path.join(FU, name + '.target')
def read_target(p):
    idx, d = [], []
    for l in open(p):
        s = l.split()
        if len(s) < 4 or s[0].startswith('#'): continue
        idx.append(int(s[0])); d.append([float(s[1]), float(s[2]), float(s[3])])
    return np.array(idx, int), np.array(d, float)
class Head:
    def __init__(self, path=JENSEN):
        self.path = path; J, acc = glb.read(path); self.J = J; self.acc = acc
        V, VT, uv2v, eyes, g = [], [], {}, {'l': [], 'r': []}, ''
        for l in open(MH_BASE):
            if l.startswith('v '): p = l.split(); V.append([float(p[1]), float(p[2]), float(p[3])])
            elif l.startswith('vt '): p = l.split(); VT.append([float(p[1]), float(p[2])])
            elif l.startswith('g '): g = l[2:].strip()
            elif l.startswith('f ') and g == 'body':
                for c in l.split()[1:]:
                    vi, ti = [int(x) - 1 for x in c.split('/')[:2]]
                    uv2v[(round(VT[ti][0] * 2e4), round(VT[ti][1] * 2e4))] = vi
            elif l.startswith('f ') and g in ('joint-l-eye', 'joint-r-eye'):
                for c in l.split()[1:]: eyes[g[6]].append(int(c.split('/')[0]) - 1)
        self.MV = np.array(V); self.nMH = len(V); self.eyeJ = {k: sorted(set(v)) for k, v in eyes.items()}
        m = J['meshes'][0]; prims = m['primitives']
        self.posAcc = prims[0]['attributes']['POSITION']
        self.P0 = acc(self.posAcc).astype(np.float64).copy(); n = len(self.P0)
        U = acc(prims[0]['attributes']['TEXCOORD_0'])
        self.mat = {}
        for p in prims:
            if p['attributes']['POSITION'] != self.posAcc: continue
            nm = J['materials'][p['material']]['name']; I = acc(p['indices']).astype(np.int64).reshape(-1, 3)
            self.mat.setdefault(nm, []).append(I)
        self.mat = {k: np.concatenate(v) for k, v in self.mat.items()}
        self.skinTris = self.mat['skin']
        used = np.unique(self.skinTris); mp = np.full(n, -1, int)
        for v in used:
            u, w = U[v]; ku, kv = round(u * 2e4), round((1 - w) * 2e4); m_ = uv2v.get((ku, kv))
            if m_ is None:
                for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    m_ = uv2v.get((ku + du, kv + dv))
                    if m_ is not None: break
            if m_ is not None: mp[v] = m_
        self.map = mp; ok = mp >= 0
        ymax = self.P0[ok, 1].max(); sel = ok & (self.P0[:, 1] > ymax - 0.25)
        by = self.MV[mp[sel], 1]; y = self.P0[sel, 1]; A = np.vstack([by, np.ones_like(by)]).T
        self.s, self.c = np.linalg.lstsq(A, y, rcond=None)[0]
        self.ymax = ymax
        # eyeballs: the 'eyes' material's points, split by side (glTF +x = the body's left)
        ev = np.unique(self.mat['eyes']); self.eyeV = {'l': ev[self.P0[ev, 0] > 0], 'r': ev[self.P0[ev, 0] < 0]}
        self.cache = {}
    def mh_delta(self, name):
        if name not in self.cache:
            i, d = read_target(tpath(name)); T = np.zeros((self.nMH, 3)); T[i] = d; self.cache[name] = T
        return self.cache[name]
    def skin_delta(self, T):
        """MakeHuman delta (nMH x 3, dm) -> per-point delta of the skin family (m); eyeballs carried rigidly by their joint"""
        D = np.zeros_like(self.P0); ok = self.map >= 0; D[ok] = self.s * T[self.map[ok]]
        for k in 'lr': D[self.eyeV[k]] = self.s * T[self.eyeJ[k]].mean(0)
        return D
    def combo(self, weights):
        T = np.zeros((self.nMH, 3))
        for n, w in weights.items():
            if w: T += w * self.mh_delta(n)
        return T

# ---- riders and writing ------------------------------------------------------------------------------------------------
def _view(buf, J, ai, nbytes):
    a = J['accessors'][ai]; bv = J['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    st = bv.get('byteStride', nbytes); n = a['count']
    return np.frombuffer(buf, np.uint8, (n - 1) * st + nbytes, off), st, n
def _patch(buf, J, ai, arr):
    a = J['accessors'][ai]; assert a['componentType'] == 5126 and a['type'] == 'VEC3'
    arr = np.ascontiguousarray(arr, np.float32); raw, st, n = _view(buf, J, ai, 12)
    idx = (np.arange(n) * st)[:, None] + np.arange(12); raw[idx.ravel()] = arr.view(np.uint8).ravel()
    a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
def _patch_normals(buf, J, ai, N):
    a = J['accessors'][ai]
    if a['componentType'] == 5126: return _patch(buf, J, ai, N)
    assert a['componentType'] == 5120; raw, st, n = _view(buf, J, ai, 3)
    q = np.clip(np.round(N * 127), -127, 127).astype(np.int8); idx = (np.arange(n) * st)[:, None] + np.arange(3); raw[idx.ravel()] = q.view(np.uint8).ravel()
def smooth_normals(P, tris, weld_from):
    """area-weighted vertex normals, welded across uv seams (points that share a rest position)"""
    fn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]]); N = np.zeros_like(P)
    for k in range(3): np.add.at(N, tris[:, k], fn)
    key = np.round(weld_from * 1e5).astype(np.int64); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    G = np.zeros((inv.max() + 1, 3)); np.add.at(G, inv, N); N = G[inv]
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
def riders(H):
    """every other point that should follow the head's skin: unmapped skin-family points (lashes, lower teeth, brows'
    own mesh, hair, hair cap, glasses). returns [(accessor, point ids or None, nn idx, nn weights)]"""
    if hasattr(H, '_riders'): return H._riders
    J, acc = H.J, H.acc; ok = np.where((H.map >= 0) & (H.P0[:, 1] > H.ymax - 0.32))[0]; tree = cKDTree(H.P0[ok]); out = []
    fam = [p for p in J['meshes'][0]['primitives'] if p['attributes']['POSITION'] == H.posAcc]
    ride = set()
    for p in fam:
        nm = J['materials'][p['material']]['name']
        if nm in ('lashes', 'teethLow', 'tongue'): ride |= set(acc(p['indices']).tolist())
    ride = np.array(sorted(v for v in ride if H.map[v] < 0), int)
    def nn(P):
        d, i = tree.query(P, k=6); w = 1 / (d + 1e-4); w /= w.sum(1, keepdims=True); return ok[i], w
    if len(ride): out.append((H.posAcc, ride) + nn(H.P0[ride]))
    seen = set()
    for mi, m in enumerate(J['meshes'][1:], 1):
        for p in m['primitives']:
            nm = J['materials'][p['material']]['name'] if 'material' in p else ''
            ai = p['attributes']['POSITION']
            if ai in seen or not any(k in nm for k in ('brow', 'hair', 'glasses', 'Cap')): continue
            seen.add(ai); P = acc(ai).astype(np.float64)
            out.append((ai, None) + nn(P))
    H._riders = out; return out
def write(H, D, path):
    """write a copy of H's glb with the skin family moved by D (per point, m) and the riders carried"""
    raw = open(H.path, 'rb').read(); n = struct.unpack('<I', raw[12:16])[0]
    J = json.loads(raw[20:20 + n]); o = 20 + n; bl = struct.unpack('<I', raw[o:o + 4])[0]; buf = bytearray(raw[o + 8:o + 8 + bl])
    P = H.P0 + D
    for ai, ids, i, w in riders(H):
        dd = (D[i] * w[..., None]).sum(1)
        if ids is None: _patch(buf, J, ai, H.acc(ai).astype(np.float64) + dd)
        else: P[ids] = H.P0[ids] + dd
    _patch(buf, J, H.posAcc, P)
    nai = J['meshes'][0]['primitives'][0]['attributes']['NORMAL']; N0 = H.acc(nai).astype(np.float64) / 127.0
    used = np.unique(np.concatenate([H.mat['skin']])); N = N0.copy(); Ns = smooth_normals(P, H.mat['skin'], H.P0); Nb = smooth_normals(H.P0, H.mat['skin'], H.P0)
    # keep the build's own normals, rotated by how much the new shape turned each one (only where the shape changed)
    moved = np.linalg.norm(D, axis=1) > 1e-6; sel = np.intersect1d(used, np.where(moved)[0]); N[sel] = N0[sel] + (Ns[sel] - Nb[sel])
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12); _patch_normals(buf, J, nai, N)
    js = json.dumps(J).encode(); js += b' ' * ((4 - len(js) % 4) % 4); buf += b'\0' * ((4 - len(buf) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(buf), 0x004E4942) + bytes(buf)
    open(path, 'wb').write(out)
