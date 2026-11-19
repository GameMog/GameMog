# groom -> game cards: each guide a 3-column ribbon lying along the hair's surface (flow along V, root at the tile's
# bottom), plus the hairCap (the scalp, offset 1.2 mm, a dark root grey). Out: work/mesh/<prim>_{P,N,UV,COL,IX}.bin
import numpy as np, json, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from scalp import Scalp, region, sph, vnormals, HC
from head import load
R = os.path.join(os.path.dirname(__file__), '..')
G = np.load(sys.argv[1] if len(sys.argv) > 1 else f'{R}/work/groom.npz'); OUT = sys.argv[2] if len(sys.argv) > 2 else f'{R}/work/mesh'
LAY = json.load(open(f'{R}/atlas/layout.json')); CJ = json.load(open(f'{R}/cards.json'))
os.makedirs(OUT, exist_ok=True)
sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
rng = np.random.default_rng(CJ['seed'])
W, H, COLS, ROWS = LAY['W'], LAY['H'], LAY['COLS'], LAY['ROWS']
pts, nrm, hgt, w, kind, tilek = G['pts'].astype(np.float64), G['nrm'].astype(np.float64), G['hgt'], G['w'], G['kind'], G['tile']
Pl, Nl, UVl, Cl, IXl, KL = [], [], [], [], [], []; base = 0
KC = {'inner': [0.2, 0.2, 0.9], 'mid': [0.2, 0.8, 0.2], 'outer': [0.9, 0.9, 0.9], 'side': [0.9, 0.5, 0.1], 'fly': [0.9, 0.1, 0.9], 'line': [0.9, 0.1, 0.1], 'front': [0.1, 0.9, 0.9]}
_pr = np.random.default_rng(CJ['seed'] + 5); _k = _pr.normal(0, 1, (18, 3)); _k /= np.linalg.norm(_k, axis=1, keepdims=True)
_k *= 2 * np.pi / (CJ.get('pepperWL', 0.02) * _pr.uniform(0.7, 1.4, (18, 1))); _ph = _pr.uniform(0, 6.283, 18); _a = _pr.normal(0, 1, 18) / 3
PEP = lambda p: np.sin(p @ _k.T + _ph) @ _a
for i in range(len(pts)):
    P, N, hg = pts[i], nrm[i], hgt[i]
    st = CJ.get('sub', {}).get(kind[i], 1)
    if st > 1: keep = sorted(set(list(range(0, len(P), st)) + [len(P) - 1])); P, N, hg = P[keep], N[keep], hg[keep]
    K = len(P); s = np.linspace(0, 1, K)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    B = np.cross(T, N); B /= np.linalg.norm(B, axis=1)[:, None]
    tw = np.radians(rng.normal(0, CJ['twist'].get(kind[i], 8)))         # a little twist about the flow
    B = B * np.cos(tw) + np.cross(T, B) * np.sin(tw)
    Nc = np.cross(B, T); Nc *= np.sign((Nc * N).sum(1, keepdims=True) + 1e-9)
    prof = (CJ['rootW'] + (1 - CJ['rootW']) * sm(0, 0.25, s)) * (1 - (1 - CJ['tipW']) * sm(0.7, 1, s))
    half = (w[i] * prof / 2)[:, None]
    cols = [P - B * half, P + Nc * half * CJ['bulge'], P + B * half]
    V = np.stack(cols, 1)                                                  # K x 3 x 3
    # volume normals: the scalp's outward normal, a share of the radial from the skull's centre, the card's own a little
    rad = P - (HC + np.array([0, 0.01, 0])); rad /= np.linalg.norm(rad, axis=1, keepdims=True)
    vn = N * 0.6 + rad * 0.25 + Nc * 0.15; vn /= np.linalg.norm(vn, axis=1, keepdims=True)
    Nn = np.repeat(vn[:, None], 3, 1)
    # the tile
    cl = LAY['kinds'][tilek[i]]; col = cl[rng.integers(len(cl))]; row = rng.integers(ROWS)
    u0, u1 = (col * W + 1) / (COLS * W), ((col + 1) * W - 1) / (COLS * W)
    vroot, vtip = ((row + 1) * H - 2) / (ROWS * H), (row * H + 2) / (ROWS * H)
    if rng.random() < 0.5: u0, u1 = u1, u0
    uu = np.array([u0, (u0 + u1) / 2, u1]); vv = vroot + (vtip - vroot) * s
    UV = np.stack(np.broadcast_arrays(uu[None, :], vv[:, None]), -1)
    # occlusion: by depth in the hair's volume (not along the card: no dark root on every card, the old scales)
    occ = CJ['occ0'] + (1 - CJ['occ0']) * sm(CJ['occA'], CJ['occB'], hg)
    phi, th = sph(P); side = 1 - (1 - CJ['sideTone']) * (1 - sm(10, 40, th)) * sm(40, 80, np.abs(phi))
    if kind[i] == 'line': occ = np.full(K, CJ['lineTone'])
    c = occ * side * rng.uniform(1 - CJ['jit'], 1 + CJ['jit'])
    # (it2: salt and pepper as a coherent field over the head (~1.5-2.5 cm patches, smooth across neighbouring cards, so no
    # card's outline shows), and darker toward the hairline, the temples and the sides above the ears)
    if kind[i] != 'line':
        f = np.clip(PEP(P) * 0.5 + 0.5, 0, 1) ** 1.6
        c = c * (1 - CJ.get('pepper', 0) * f)
        _, th0 = sph(P[:1]); r0 = region(P[:1])[0]
        c = c * (1 - CJ.get('lineDark', 0) * (1 - sm(0, 10, r0)))
    C = np.repeat(c[:, None], 3, 1)
    Pl.append(V.reshape(-1, 3)); Nl.append(Nn.reshape(-1, 3)); UVl.append(UV.reshape(-1, 2)); Cl.append(C.reshape(-1))
    ix = []
    for k in range(K - 1):
        for j in range(2):
            a, b, c2, d = base + k * 3 + j, base + k * 3 + j + 1, base + (k + 1) * 3 + j, base + (k + 1) * 3 + j + 1
            ix += [a, b, d, a, d, c2]
    IXl.append(np.array(ix)); base += K * 3; KL.append(np.tile(KC[kind[i]], (K * 3, 1)))
def save(name, P, N, UV, C, IX):
    for k, X, dt in (('P', P, '<f4'), ('N', N, '<f4'), ('UV', UV, '<f4'), ('COL', C, '<f4'), ('IX', IX, '<u4')):
        if X is not None: np.ascontiguousarray(X, dtype=dt).tofile(f'{OUT}/{name}_{k}.bin')
    print(name, 'verts', len(P), 'tris', len(IX) // 3)
save('hair', np.concatenate(Pl), np.concatenate(Nl), np.concatenate(UVl), np.concatenate(Cl), np.concatenate(IXl))
# the cap: the scalp's own faces where all three corners lie inside the hair by > capIn degrees, lifted 1.2 mm
P, IX, _ = load(); keep = (P[IX][:, :, 1].min(1) > 1.47); IX = IX[keep]
r = region(P); f = IX[(r[IX] > CJ['capIn']).all(1)]
used, inv = np.unique(f, return_inverse=True); N = vnormals(P, IX)[used]
CP = P[used] + N * CJ['capLift']
save('hairCap', CP, N, None, np.full(len(CP), CJ['capTone']), inv.reshape(-1))
np.savez(f'{R}/work/cards-preview.npz', P=np.concatenate(Pl).astype(np.float32), IX=np.concatenate(IXl).astype(np.int32), UV=np.concatenate(UVl).astype(np.float32), COL=np.concatenate(KL).astype(np.float32))
