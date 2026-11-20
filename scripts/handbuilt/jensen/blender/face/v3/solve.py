# v3 free-form face fit: a smooth, symmetric displacement field on the hm08 head's MakeHuman vertices (same points, same
# order), solved against the reference's MediaPipe landmarks by analysis-by-synthesis:
#   render the current head at the reference camera -> MediaPipe on the render -> each landmark's surface point (dense
#   semantic correspondence through MediaPipe's own topology) -> linearised 2D reprojection residuals -> a regularised
#   sparse solve (biharmonic + membrane smoothness, symmetry, pins at the eyelid margins / back of head / neck)
#   python solve.py init                 # correspondence from the frontal render, first reference camera
#   python solve.py step K LAM_BI        # one outer step (needs r-it{K-1}-ref.lm.json, the render of the previous state)
import subprocess, time
from common import *
import scipy.sparse as sp, scipy.sparse.linalg as spl
from scipy.spatial import cKDTree
H = model.Head()
ref = json.load(open(WK + '/ref-lm.json')); Q = np.array(ref['px'])[:, :2]; RW, RH = ref['w'], ref['h']; FOCAL = 3000.0
IOD = fl.iod(Q)
# ---- the MakeHuman vertex space -------------------------------------------------------------------------------------------
ymax = H.ymax; ok = H.map >= 0
head_pts = np.where(ok & (H.P0[:, 1] > ymax - 0.32))[0]
mh_ids = np.unique(H.map[head_pts]); N = len(mh_ids); col = {m: i for i, m in enumerate(mh_ids)}
rep = {}
for v in head_pts: rep.setdefault(H.map[v], v)
X0 = np.array([H.P0[rep[m]] for m in mh_ids])
# edges from base.obj body faces
E = set(); g = ''
for l in open(model.MH_BASE):
    if l.startswith('g '): g = l[2:].strip()
    elif l.startswith('f ') and g == 'body':
        f = [int(c.split('/')[0]) - 1 for c in l.split()[1:]]
        for a, b in zip(f, f[1:] + f[:1]):
            if a in col and b in col: E.add((min(col[a], col[b]), max(col[a], col[b])))
E = np.array(sorted(E))
# mirror map (base.obj is symmetric in x)
MVh = H.MV[mh_ids]; tr = cKDTree(MVh); dm, mir = tr.query(MVh * [-1, 1, 1]); mir = np.where(dm < 1e-3, mir, -1)
MIROK = mir >= 0; print('mirror ok', MIROK.sum(), 'of', len(mir)) if __name__ == '__main__' else None
mir = np.where(MIROK, mir, np.arange(len(mir)))
print('MH head verts', N, 'edges', len(E), 'mirror max err (dm)', dm.max().round(5)) if __name__ == '__main__' else None
# eyeballs
EC = {k: H.P0[H.eyeV[k]].mean(0) for k in 'lr'}; ER = {k: np.linalg.norm(H.P0[H.eyeV[k]] - EC[k], axis=1).max() for k in 'lr'}
def pins():
    mu = np.zeros(N)
    for k in 'lr':
        d = np.linalg.norm(X0 - EC[k], axis=1) - ER[k]; mu = np.maximum(mu, np.clip((0.0035 - d) / 0.0015, 0, 1))      # lid margins
    y = X0[:, 1]; mu = np.maximum(mu, np.clip(((ymax - 0.22) - y) / 0.05, 0, 1))                                      # lower neck
    z = X0[:, 2]; zf = EC['l'][2]; mu = np.maximum(mu, np.clip((zf - 0.10 - z) / 0.03, 0, 1))                          # back of head
    return mu
MU = pins()
# ---- landmark weights (identity; the eyelid middles, inner lips, iris and hairline left out: expression / occluded) ------
W = fl.W.copy(); W[fl.IRIS] = 0; W[fl.OVAL_TOP] = 0; W[fl.LIPS_I] = 0; W[fl.NOSE] = 0.3; W[[168, 6, 197]] = 1.0
LIDMID = [159, 145, 158, 153, 160, 144, 386, 374, 385, 380, 387, 373, 157, 154, 161, 163, 384, 381, 388, 390, 246, 7, 466, 249, 173, 155, 398, 382]
W[LIDMID] = 0.15
for c in (33, 133, 362, 263): W[c] = 4.0
W[fl.LIPS_O] = 0; W[[61, 291]] = 0; W[[0, 17]] = 1.5; W[fl.CHEEK] = 0.6
W[fl.BROW_L + fl.BROW_R] = 0.8                                                                                          # glasses bar over his brows
# ---- helpers ----------------------------------------------------------------------------------------------------------------
def glbD(d):
    """MH-vertex displacement (N,3) -> per glb point (skin family) delta"""
    D = np.zeros_like(H.P0); m = H.map >= 0; idx = np.full(H.nMH, -1); idx[mh_ids] = np.arange(N)
    k = idx[H.map[m]]; sel = np.where(m)[0][k >= 0]; D[sel] = d[idx[H.map[sel]]]; return D
def corr_to_mh(ti, bb):
    T = H.skinTris[ti]; rows = []
    for t, b in zip(T, bb):
        r = {}
        for v, w in zip(t, b):
            m = H.map[v]
            if m in col: r[col[m]] = r.get(col[m], 0) + w
        sw = sum(r.values()); rows.append({j: w / sw for j, w in r.items()} if sw > 0.3 else {})
    return rows
import cv2
def guess0():
    E = (EC['l'] + EC['r']) / 2; a = np.radians(-30); C = E + 1.6 * np.array([np.sin(a), -0.35, np.cos(a)]); R, t = fl.look(C, E)
    return cv2.Rodrigues(R)[0], t.reshape(3, 1)
def ref_cam(Xa, guess=None):
    m = (W > 0.5) & (np.abs(Xa).sum(1) > 0); r, t = fl.pnp(Xa, Q, FOCAL, RW, RH, w=m.astype(float), guess=guess or guess0())
    return fl.cam('ref', cv2.Rodrigues(r)[0], t, FOCAL, RW, RH, Xa.mean(0)), (r, t)
def render(glbpath, cams, prefix):
    cj = prefix + 'cams.json'; json.dump(cams, open(cj, 'w'))
    o = subprocess.run([os.environ['BL'], '-b', '--factory-startup', '--python', V + '/scripts/render.py', '--', glbpath, cj, prefix], capture_output=True, text=True)
    if 'RENDERED' not in o.stdout: print(o.stdout[-2000:], o.stderr[-2000:]); raise SystemExit('render failed')
def detect(img, out):
    o = subprocess.run([sys.executable, V + '/scripts/detect.py', img, out, V + '/dl/model/face_landmarker.task'], capture_output=True, text=True)
    if not o.stdout.strip().startswith('ok'): raise SystemExit('detect failed ' + o.stdout + o.stderr[-500:])
    return np.array(json.load(open(out))['px'])[:, :2]
def lap():
    i, j = E[:, 0], E[:, 1]; A = sp.coo_matrix((np.ones(len(E) * 2), (np.r_[i, j], np.r_[j, i])), shape=(N, N)).tocsr()
    deg = np.asarray(A.sum(1)).ravel(); L = sp.diags(1 / np.maximum(deg, 1)) @ A - sp.eye(N)
    G = sp.coo_matrix((np.r_[np.ones(len(E)), -np.ones(len(E))], (np.r_[np.arange(len(E)), np.arange(len(E))], np.r_[i, j])), shape=(len(E), N)).tocsr()
    return L.tocsr(), G
L, G = lap()
# the mouth moves as one block (its open/raised lips in the photo are expression, and the upper teeth do not move)
_c = json.load(open(WK + '/cam-front.json'))[0]; _px = np.array(json.load(open(WK + '/r-base-front.lm.json'))['px'])[:, :2]
CT, CB = fl.correspond(H.P0, H.skinTris, _c, _px); MC = fl.anchors(H.P0, H.skinTris, CT, CB)[[13, 14, 61, 291]].mean(0)
_dm = np.linalg.norm((X0 - MC) * [0.8, 1.2, 1.0], axis=1); MOUTH = np.clip((0.034 - _dm) / 0.012, 0, 1) * (X0[:, 2] > MC[2] - 0.03)
NC = fl.anchors(H.P0, H.skinTris, CT, CB)[[4, 6, 195]].mean(0); NOSE = np.clip((0.028 - np.linalg.norm(X0 - NC, axis=1)) / 0.01, 0, 1) * (X0[:, 2] > NC[2] - 0.03)
EW = 1 + 40 * np.maximum(MOUTH[E[:, 0]], MOUTH[E[:, 1]]) + 15 * np.maximum(NOSE[E[:, 0]], NOSE[E[:, 1]]); G = sp.diags(np.sqrt(EW)) @ G
def k3(M): return sp.kron(M, sp.eye(3), format='csr')
Mx = sp.diags(np.tile([-1.0, 1, 1], N))
S = sp.coo_matrix((np.ones(N), (np.arange(N), mir)), shape=(N, N)).tocsr()
Mx = sp.diags(np.tile([-1.0, 1, 1], N) * np.repeat(MIROK, 3) + np.repeat(~MIROK, 3) * np.tile([1.0, 1, 1], N))
SYM = k3(sp.eye(N)) - Mx @ k3(S)                       # d_i - mirror(d_mir(i))
def solve(rows, Xa, c, resid, w, lam_bi, lam_m, d_prev):
    """linearised: J_k * sum_j b_kj (d_j + dd_j) ~ resid_k; minimise over dd"""
    R_, t_ = np.array(c['R']), np.array(c['t']); Y = Xa @ R_.T + t_; f = c['f']
    ri, ci, vals, rhs = [], [], [], []; r = 0
    for k, row in enumerate(rows):
        if w[k] <= 0 or not row: continue
        yx, yy, yz = Y[k]; Jp = (f / yz) * np.array([[1, 0, -yx / yz], [0, 1, -yy / yz]]) @ R_ / IOD; s = np.sqrt(w[k])
        for a in range(2):
            for jv, b in row.items():
                for q in range(3): ri.append(r); ci.append(3 * jv + q); vals.append(s * b * Jp[a, q])
            rhs.append(s * resid[k, a] / IOD); r += 1
    A = sp.coo_matrix((vals, (ri, ci)), shape=(r, 3 * N)).tocsr(); b = np.array(rhs)
    LL = k3(L); GG = k3(G); P = sp.diags(np.repeat(1e4 * MU + 20 * MOUTH + 20 * NOSE, 3)); wsum = w[w > 0].sum() / 100
    M = A.T @ A / wsum + lam_bi * (LL.T @ LL) + lam_m * (GG.T @ GG) + P + 50.0 * (SYM.T @ SYM) + 1e-6 * sp.eye(3 * N)
    x0 = d_prev.ravel()
    rhs_ = A.T @ b / wsum - (lam_bi * (LL.T @ LL) + lam_m * (GG.T @ GG) + P + 50.0 * (SYM.T @ SYM)) @ x0
    dd = spl.spsolve(M.tocsc(), rhs_)
    return dd.reshape(N, 3)
def anchors_mh(rows, Xmh):
    return np.array([sum(b * Xmh[j] for j, b in r.items()) if r else np.zeros(3) for r in rows])

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'init':
        c = json.load(open(WK + '/cam-front.json'))[0]; px = np.array(json.load(open(WK + '/r-base-front.lm.json'))['px'])[:, :2]
        ti, bb = fl.correspond(H.P0, H.skinTris, c, px); rows = corr_to_mh(ti, bb)
        Xa = anchors_mh(rows, X0); cam, _ = ref_cam(Xa)
        np.save(WK + '/d-it0.npy', np.zeros((N, 3)))
        model.write(H, glbD(np.zeros((N, 3))), WK + '/it0.glb'); render(WK + '/it0.glb', [cam], WK + '/r-it0-')
        px = detect(WK + '/r-it0-ref.jpg', WK + '/r-it0-ref.lm.json'); json.dump(cam, open(WK + '/cam-it0.json', 'w'))
        print('it0 loss', fl.landmark_loss(px, Q, W))
    elif cmd == 'step':
        K = int(sys.argv[2]); lam = float(sys.argv[3]); lam_m = float(sys.argv[4]) if len(sys.argv) > 4 else lam * 0.1
        d = np.load(WK + f'/d-it{K - 1}.npy'); c = json.load(open(WK + f'/cam-it{K - 1}.json'))
        px = np.array(json.load(open(WK + f'/r-it{K - 1}-ref.lm.json'))['px'])[:, :2]
        Pc = H.P0 + glbD(d); ti, bb = fl.correspond(Pc, H.skinTris, c, px); rows = corr_to_mh(ti, bb)
        Xmh = X0 + d; Xa = anchors_mh(rows, Xmh)
        gprev = (cv2.Rodrigues(np.array(c['R']))[0], np.array(c['t']).reshape(3, 1))
        cam, _ = ref_cam(Xa, gprev); pp, _ = fl.project(Xa, cam); resid = Q - pp
        Wv = W * (np.abs(Xa).sum(1) > 0); L0 = fl.landmark_loss(pp, Q, Wv)
        dd = solve(rows, Xa, cam, resid, Wv, lam, lam_m, d); d2 = d + dd
        d2 = np.where(MIROK[:, None], 0.5 * (d2 + (d2[mir] * [-1, 1, 1])), d2)          # exact symmetry
        pk = 1000 * np.linalg.norm(d2, axis=1).max(); np.save(WK + f'/d-it{K}.npy', d2)
        Xa2 = anchors_mh(rows, X0 + d2); cam2, _ = ref_cam(Xa2, gprev); pp2, _ = fl.project(Xa2, cam2)
        json.dump(cam2, open(WK + f'/cam-it{K}.json', 'w'))
        model.write(H, glbD(d2), WK + f'/it{K}.glb'); render(WK + f'/it{K}.glb', [cam2], WK + f'/r-it{K}-')
        px2 = detect(WK + f'/r-it{K}-ref.jpg', WK + f'/r-it{K}-ref.lm.json')
        Lt, reg, _ = fl.landmark_loss(px2, Q, W, per_region=True)
        print(f'it{K} lam {lam}: proxy {L0:.4f} -> {fl.landmark_loss(pp2, Q, Wv):.4f}; TRUE (MediaPipe on render) {Lt:.4f}; peak {pk:.1f} mm')
        print('  regions', {k: round(v, 4) for k, v in reg.items()})
