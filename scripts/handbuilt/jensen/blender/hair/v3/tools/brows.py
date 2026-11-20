# the brows: a groomed strand atlas (2 tiles of 1024 x 256: a dense base, a sparse top layer of single hairs; brow head at
# u = 0, its bottom edge at the tile's bottom) and two conforming card layers per brow, carried by the face's 33 targets
import numpy as np, json, sys, os
from PIL import Image
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__)); from scalp import Scalp; from head import load
R = os.path.join(os.path.dirname(__file__), '..'); BJ = json.load(open(f'{R}/brows.json'))
sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
TW, TH, SS = 1024, 256, 2
def shape(u):
    """the brow's bottom and top (0..1 of the card's height) along it: a full head, a straight lower edge, a thin tail"""
    bot = 0.18 + 0.06 * sm(0.6, 1.0, u) + 0.05 * (1 - sm(0.0, 0.12, u))
    top = 0.86 - 0.12 * sm(0.15, 0.5, u) * 0 - 0.42 * sm(0.55, 1.0, u) - 0.06 * (1 - sm(0.0, 0.1, u))
    return bot, top
def tile(dense, seed):
    rng = np.random.default_rng(seed); w, h = TW * SS, TH * SS
    C = np.zeros((h, w)); A = np.zeros((h, w))
    n = BJ['nDense'] if dense else BJ['nTop']
    for i in range(n):
        u = rng.beta(1.1, 1.25) * 0.97 + 0.01
        b, t = shape(u); v = rng.uniform(b, b + (t - b) * (0.72 if dense else 0.6))
        if rng.random() > sm(0.0, 0.05, u) * (1 - sm(0.97, 1.0, u)): continue
        ang = np.radians(np.interp(u, [0, 0.12, 0.3, 0.7, 1.0], [75, 55, 22, 8, -8]) + rng.normal(0, 7))
        L = rng.uniform(*BJ['len']) * (1 - 0.35 * sm(0.6, 1, u))             # px of the 1x tile (~23 px per mm)
        curve = rng.normal(0, 0.15)
        k = 12; s = np.linspace(0, 1, k)
        dx = np.cos(ang + curve * s) * L * s; dy = np.sin(ang + curve * s) * L * s
        xs = (u * TW + dx) * SS; ys = (v * TH + dy) * SS
        tone = BJ['grey'] if rng.random() < BJ['greyFrac'] else BJ['dark'] * rng.uniform(0.7, 1.3)
        wd = rng.uniform(*BJ['wid']) * SS
        x0, x1 = int(max(0, xs.min() - 4)), int(min(w - 1, xs.max() + 4)); y0, y1 = int(max(0, ys.min() - 4)), int(min(h - 1, ys.max() + 4))
        if x1 <= x0 or y1 <= y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = np.full(X.shape, 1e9); tt = np.zeros(X.shape)
        for j in range(k - 1):
            ax, ay, bx, by = xs[j], ys[j], xs[j + 1], ys[j + 1]; vx, vy = bx - ax, by - ay
            q = np.clip(((X - ax) * vx + (Y - ay) * vy) / (vx * vx + vy * vy + 1e-9), 0, 1)
            dd = np.hypot(X - ax - q * vx, Y - ay - q * vy); m = dd < d; d[m] = dd[m]; tt[m] = (j + q[m]) / (k - 1)
        cov = np.clip(wd * (1 - 0.7 * tt) / 2 - d + 0.5, 0, 1) * (dense and 0.95 or 1.0)
        A[y0:y1 + 1, x0:x1 + 1] = cov + A[y0:y1 + 1, x0:x1 + 1] * (1 - cov)
        C[y0:y1 + 1, x0:x1 + 1] = tone * (1 + 0.5 * tt) * cov + C[y0:y1 + 1, x0:x1 + 1] * (1 - cov)
    ds = lambda X: X.reshape(TH, SS, TW, SS).mean((1, 3))
    return ds(C), ds(A)
def atlas():
    Cs, As = zip(tile(True, 7), tile(False, 8))
    C = np.vstack([c[::-1] for c in Cs]); A = np.clip(np.vstack([a[::-1] for a in As]), 0, 1)
    from scipy.ndimage import gaussian_filter
    col = np.where(A > 1e-3, C / np.maximum(A, 1e-3), 0); b = gaussian_filter(C, 8) / np.maximum(gaussian_filter(A, 8), 1e-4)
    col = np.where(A > 0.2, col, np.where(gaussian_filter(A, 8) > 1e-3, b, BJ['dark']))
    srgb = lambda x: np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - 0.055)
    u8 = lambda x: (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)
    g = srgb(np.clip(col, 0, 1)); rgba = np.dstack([u8(g), u8(g), u8(g * 1.02), u8(A)])
    Image.fromarray(rgba, 'RGBA').save(f'{R}/atlas/brows_basecolor.png'); Image.fromarray(rgba, 'RGBA').save(f'{R}/atlas/brows_basecolor.webp', quality=92, alpha_quality=100, method=6)
    Image.fromarray(u8(A)).save(f'{R}/atlas/brows_alpha.png')
    print('brow atlas alpha mean', A.mean().round(3))
def cards():
    P0, IX, _ = load(); sc = Scalp(n=300000, seed=4)
    used = np.unique(IX); TG = np.fromfile(f'{R}/work/head/targets.bin', '<f4').reshape(-1, len(P0), 3)
    names = json.load(open(f'{R}/work/head/meta.json'))['targetNames']
    tree = cKDTree(P0[used])
    fm = sc.S[:, 2] > 0.09; FS, FN = sc.S[fm], sc.N[fm]; ftree = cKDTree(FS[:, :2])
    def onskin(q):
        # straight back along -z onto the front of the face: the frontmost sample within 1.2 mm in x, y
        out, nn = np.zeros_like(q), np.zeros_like(q)
        for k, ii in enumerate(ftree.query_ball_point(q[:, :2], 0.0012)):
            j = ii[int(np.argmax(FS[ii, 2]))]; out[k] = FS[j]; nn[k] = FN[ii].mean(0)
        return out, nn / np.linalg.norm(nn, axis=1, keepdims=True)
    Pl, Nl, UVl, IXl, Tl = [], [], [], [], []; base = 0; NU, NV = 22, 4
    for side in (1, -1):
        for layer, (lift, row) in enumerate(((BJ['lift0'], 0), (BJ['lift1'], 1))):
            u = np.linspace(0, 1, NU); x = BJ['x0'] + (BJ['x1'] - BJ['x0']) * u
            yc = BJ['y'] + BJ['arch'] * np.sin(np.pi * np.clip((u - 0.0) / 0.95, 0, 1)) ** 1.5 - BJ['drop'] * sm(0.6, 1, u)
            Hh = BJ['h']
            V = np.zeros((NU, NV, 3)); Nn = np.zeros((NU, NV, 3)); UV = np.zeros((NU, NV, 2))
            for j in range(NV):
                f = j / (NV - 1); y = yc - 0.25 * Hh + f * Hh
                q = np.stack([x * side, y, np.full(NU, 0.16)], 1)
                # onto the skin: slide in along z to the nearest surface sample at that x, y
                p, n = onskin(q)
                V[:, j] = p + n * lift; Nn[:, j] = n
                UV[:, j, 0] = u * (TW - 2) / TW + 1 / TW
                UV[:, j, 1] = ((row + 1) * TH - 1 - f * (TH - 2)) / (2 * TH)
            Pl.append(V.reshape(-1, 3)); Nl.append(Nn.reshape(-1, 3)); UVl.append(UV.reshape(-1, 2))
            ix = []
            for a in range(NU - 1):
                for b in range(NV - 1):
                    i0 = base + a * NV + b; i1 = i0 + 1; i2 = i0 + NV; i3 = i2 + 1
                    ix += [i0, i2, i3, i0, i3, i1] if side > 0 else [i0, i3, i2, i0, i1, i3]
            IXl.append(np.array(ix)); base += NU * NV
    P = np.concatenate(Pl); r = BJ['carryR']
    d, i = tree.query(P, k=24, distance_upper_bound=r)
    wgt = np.where(np.isfinite(d), (1 - np.minimum(d, r) / r) ** 2, 0); wgt /= np.maximum(wgt.sum(1, keepdims=True), 1e-9)
    idx = used[np.minimum(i, len(used) - 1)]
    T = (TG[:, idx] * wgt[None, :, :, None]).sum(2)                       # 33 x n x 3
    for k, nm in enumerate(names):
        if nm.startswith('eyeBlink') or nm.startswith('eyeSquint') or nm.startswith('eyeWide'): T[k] *= BJ['blinkDamp']
    OUT = f'{R}/work/mesh'
    np.ascontiguousarray(P, '<f4').tofile(f'{OUT}/brows_P.bin'); np.ascontiguousarray(np.concatenate(Nl), '<f4').tofile(f'{OUT}/brows_N.bin')
    np.ascontiguousarray(np.concatenate(UVl), '<f4').tofile(f'{OUT}/brows_UV.bin'); np.ascontiguousarray(np.ones(len(P)), '<f4').tofile(f'{OUT}/brows_COL.bin')
    np.ascontiguousarray(np.concatenate(IXl), '<u4').tofile(f'{OUT}/brows_IX.bin'); np.ascontiguousarray(T, '<f4').tofile(f'{OUT}/brows_TGT.bin')
    print('brows verts', len(P), 'tris', len(np.concatenate(IXl)) // 3, 'max target move mm', (np.linalg.norm(T, axis=2).max(1) * 1000).round(1)[[0, 23]])
if __name__ == '__main__':
    if 'atlas' in sys.argv: atlas()
    cards()
