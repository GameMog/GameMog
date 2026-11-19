# the strand atlas: synthetic strand clumps rasterised (2x supersampled) into 32 tiles of 128 x 1024 (16 columns x 2 rows)
# Each tile: root at its bottom (v = 1 in glTF UV terms of the tile's lower edge), tip at its top.
# Maps: basecolor (sRGB RGBA), alpha, depth (1 = outermost strand), roottip (0 root .. 1 tip), id, normal (tangent space,
# x across the card, y toward the tip), and data (roottip, id, depth, alpha packed as RGBA).
import numpy as np, json, sys, os
from PIL import Image
R = os.path.join(os.path.dirname(__file__), '..'); OUT = sys.argv[1] if len(sys.argv) > 1 else f'{R}/atlas'
TONE = json.load(open(f'{R}/tone.json'))
W, H, SS = 128, 1024, 2; COLS, ROWS = 16, 2
KINDS = {'dense': [0, 1, 2, 3], 'body': [4, 5, 6, 7], 'outer': [8, 9, 10, 11], 'wisp': [12, 13], 'line': [14, 15]}
sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))

def strands(kind, rng):
    w, h = W * SS, H * SS
    if kind == 'dense': n, Lr, wid, clumps, xs = 170, (0.45, 1.0), (2.0, 2.8), 0, (1.15, 1.15)
    elif kind == 'body': n, Lr, wid, clumps, xs = 130, (0.4, 1.0), (1.8, 2.6), 5, (1.35, 1.35)
    elif kind == 'outer': n, Lr, wid, clumps, xs = 100, (0.35, 1.0), (1.6, 2.4), 6, (1.5, 1.5)
    elif kind == 'wisp': n, Lr, wid, clumps, xs = 26, (0.4, 1.0), (1.3, 1.9), 3, (1.8, 1.8)
    else: n, Lr, wid, clumps, xs = 80, (0.5, 1.0), (1.4, 2.0), 0, (1.3, 1.3)
    out = []
    cc = rng.uniform(0.2, 0.8, max(clumps, 1))
    for i in range(n):
        x0 = rng.beta(*xs)
        y0 = 0.0 if kind != 'line' else rng.uniform(0, 0.45) ** 1.3
        y0 += rng.uniform(0, 0.04) if kind == 'line' else rng.uniform(0, 0.16) ** 1.2   # roots staggered (no hard card edge)
        L = rng.uniform(*Lr)
        y1 = min(0.985, y0 + (1 - y0) * L * (1 - 0.35 * abs(x0 - 0.5) * 2) ** 1) if kind != 'line' else min(1.0, y0 + rng.uniform(0.4, 1.0) * (1 - y0))
        pull = rng.uniform(0.05, 0.3) if clumps else 0; c = cc[rng.integers(len(cc))]
        drift = rng.normal(0, 0.03); amp = rng.uniform(0, 0.006); fq = rng.uniform(1, 3); ph = rng.uniform(0, 6.3)
        r = rng.random()
        tone = TONE['dark'] * rng.uniform(0.7, 1.3) if r < TONE['darkFrac'] else (TONE['white'] if r > 1 - TONE['whiteFrac'] else TONE['silver'] * rng.uniform(0.85, 1.18))
        out.append(dict(x0=x0, y0=y0, y1=y1, pull=pull, c=c, drift=drift, amp=amp, fq=fq, ph=ph, w=rng.uniform(*wid),
                        depth=rng.random(), tone=tone, id=rng.random()))
    out.sort(key=lambda s: s['depth'])                        # back to front
    return out

def tile(kind, seed):
    rng = np.random.default_rng(seed); w, h = W * SS, H * SS
    C = np.zeros((h, w)); A = np.zeros((h, w)); D = np.zeros((h, w)); RT = np.zeros((h, w)); ID = np.zeros((h, w)); NX = np.zeros((h, w))
    for s in strands(kind, rng):
        ya, yb = int(s['y0'] * (h - 1)), int(s['y1'] * (h - 1))
        if yb - ya < 4: continue
        yy = np.arange(ya, yb + 1); t = (yy - ya) / (yb - ya); v = yy / (h - 1)
        x = s['x0'] + s['drift'] * v + s['amp'] * np.sin(s['fq'] * 6.28 * v + s['ph'])
        x = x + (s['c'] - x) * s['pull'] * sm(0.3, 1.0, t)       # clumps gather toward their tips
        x = np.clip(x, 0.02, 0.98) * (w - 1)
        wd = s['w'] * SS * (1 - 0.75 * t ** 1.5)                 # thins to a point
        # the card's sides feather: strands near the edge fainter
        edge = sm(0.0, 0.12, s['x0']) * sm(0.0, 0.12, 1 - s['x0'])
        col = s['tone'] * (TONE['root'] + (1 - TONE['root']) * sm(0, TONE['rootLen'], v)) * (1 + TONE['tipLift'] * sm(0.55, 1, v))
        col = col * (TONE['deep'] + (1 - TONE['deep']) * s['depth'])
        for dx in range(-4, 5):
            cx = np.round(x).astype(int) + dx; ok = (cx >= 0) & (cx < w)
            dist = np.abs(cx - x)
            cov = np.clip(wd / 2 - dist + 0.5, 0, 1) * (0.75 + 0.25 * edge) * (1 - 0.8 * sm(0.6, 1, t)) * sm(0.0, 0.07, t)
            yv, xv, cv = yy[ok], cx[ok], cov[ok]
            if not len(cv): continue
            a0 = A[yv, xv]
            C[yv, xv] = col[ok] * cv + C[yv, xv] * (1 - cv)
            A[yv, xv] = cv + a0 * (1 - cv)
            top = cv > 0.5
            D[yv[top], xv[top]] = s['depth']; RT[yv[top], xv[top]] = t[ok][top]; ID[yv[top], xv[top]] = s['id']
            NX[yv[top], xv[top]] = np.clip((cx[ok][top] - x[ok][top]) / (wd[ok][top] / 2 + 0.5), -1, 1)
    # C is premultiplied: down-sample
    ds = lambda X: X.reshape(H, SS, W, SS).mean((1, 3))
    return ds(C), ds(A), ds(D), ds(RT), ds(ID), ds(NX)

def dilate(Cp, A):
    """unpremultiplied colour, filled out under the transparent texels from blurred averages (no dark fringes in mips)"""
    from scipy.ndimage import gaussian_filter
    col = np.where(A > 1e-3, Cp / np.maximum(A, 1e-3), 0); out = col.copy(); have = A > 0.05
    for sg in (2, 6, 16, 48):
        b = gaussian_filter(Cp, sg); ba = gaussian_filter(A, sg)
        fill = ~have & (ba > 1e-4); out[fill] = (b / np.maximum(ba, 1e-6))[fill]; have = have | fill
    out[~have] = TONE['silver'] * 0.6
    return np.where(A > 0.05, col * np.clip(A / 0.3, 0, 1) + out * (1 - np.clip(A / 0.3, 0, 1)), out)

def main():
    os.makedirs(OUT, exist_ok=True)
    big = {k: np.zeros((ROWS * H, COLS * W)) for k in ('C', 'A', 'D', 'RT', 'ID', 'NX')}
    for kind, cols in KINDS.items():
        for col in cols:
            for row in range(ROWS):
                res = tile(kind, 1000 + row * 100 + col)
                for k, X in zip(('C', 'A', 'D', 'RT', 'ID', 'NX'), res):
                    # image rows run top-down: flip so the root sits at the tile's bottom
                    big[k][row * H:(row + 1) * H, col * W:(col + 1) * W] = X[::-1]
    A = np.clip(big['A'], 0, 1); C = dilate(big['C'], A)
    srgb = lambda x: np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - 0.055)
    g = srgb(np.clip(C, 0, 1)); cool = np.array(TONE['tint'])
    rgb = np.clip(g[..., None] * cool, 0, 1)
    u8 = lambda x: (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)
    rgba = np.dstack([u8(rgb), u8(A)])
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/hair_basecolor.png')
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/hair_basecolor.webp', quality=92, alpha_quality=100, method=6)
    Image.fromarray(u8(A)).save(f'{OUT}/hair_alpha.png'); Image.fromarray(u8(big['D'])).save(f'{OUT}/hair_depth.png')
    Image.fromarray(u8(big['RT'])).save(f'{OUT}/hair_roottip.png'); Image.fromarray(u8(big['ID'])).save(f'{OUT}/hair_id.png')
    nx = np.clip(big['NX'], -1, 1); nz = np.sqrt(np.clip(1 - nx ** 2, 0, 1)); nz[A < 0.05] = 1
    Image.fromarray(np.dstack([u8(nx * 0.5 + 0.5), u8(np.full_like(nx, 0.5)), u8(nz * 0.5 + 0.5)])).save(f'{OUT}/hair_normal.png')
    Image.fromarray(np.dstack([u8(big['RT']), u8(big['ID']), u8(big['D']), u8(A)]), 'RGBA').save(f'{OUT}/hair_data_rt-id-depth-alpha.png')
    json.dump({'W': W, 'H': H, 'COLS': COLS, 'ROWS': ROWS, 'kinds': KINDS}, open(f'{OUT}/layout.json', 'w'))
    print('atlas', rgba.shape, 'mean alpha per kind', {k: round(float(A[:, c[0] * W:(c[-1] + 1) * W].mean()), 3) for k, c in KINDS.items()})

if __name__ == '__main__': main()
