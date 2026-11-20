# skinmaps.py SRC_DIR POSMAP OUT_DIR [k=v ...]: v3 skin + eye maps from the iteration-2 maps (procedural only; no photo pixels)
#   albedo: warm light tan (less orange, a touch lighter), low-frequency redness variation (3D noise) + flush on the nose
#           tip, lower cheeks and ears, caruncle pink at the inner eye corners, a faint periorbital shade
#   mr (G=roughness): oilier T-zone (forehead band, nose, chin), drier cheeks, fine variation
#   normal: an extra pore layer (larger pores on the nose and inner cheeks, finer elsewhere) + faint forehead lines
#   eyes: deeper iris (darker outer iris, limbal ring), warmer sclera, a soft upper-lid/lash shadow band
import sys, os, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom
src, pm, out = sys.argv[1:4]; K = dict(a.split('=') for a in sys.argv[4:]); K = {k: float(v) for k, v in K.items()}
os.makedirs(out, exist_ok=True); rng = np.random.default_rng(7)
z = np.load(pm); pos, msk, lm, ec = z['pos'], z['msk'], z['lm'], z['ec']
def load(n):
    p = os.path.join(src, n + '.webp'); p = p if os.path.exists(p) else os.path.join(src, n + '.png')
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
alb, mr, nrm = load('skin-albedo'), load('skin-mr'), load('skin-normal'); R = alb.shape[0]
up = R // pos.shape[0]
def U(a, order=1): return zoom(a, (up, up) + (1,) * (a.ndim - 2), order=order) if up > 1 else a
# region weights on the 2048 position map, then up to the map's size
def near(ids, r, sym=False):
    d = np.full(pos.shape[:2], 9.0)
    for i in ids:
        c = lm[i]; d = np.minimum(d, np.linalg.norm(pos - c, axis=-1))
        if sym: d = np.minimum(d, np.linalg.norm(pos - c * [-1, 1, 1], axis=-1))
    return np.exp(-0.5 * (d / r) ** 2) * msk
def vnoise(scale, seed):
    # smooth 3D value noise sampled at the texel positions (seamless across uv islands)
    g = np.random.default_rng(seed).random((64, 64, 64)).astype(np.float32); q = (pos / scale) % 63
    i = np.floor(q).astype(int); f = q - i; f = f * f * (3 - 2 * f); o = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                o = o + w * g[(i[..., 0] + dx) % 64, (i[..., 1] + dy) % 64, (i[..., 2] + dz) % 64]
    return (o - 0.5) * 2 * msk
head = msk.astype(np.float32)
flush = np.clip(near([4], 0.010) * 0.9 + near([205, 425, 50, 280], 0.016) * 0.8 + near([234, 454], 0.02) * 0.7, 0, 1)
tz = np.clip(near([151, 9, 108, 337], 0.022) + near([6, 197, 195, 5, 4], 0.012) + near([152, 175], 0.014), 0, 1)
dry = near([117, 346, 205, 425], 0.02)
peri = near([145, 374, 159, 386], 0.010) * (1 - near([159, 386], 0.004))
def near_pts(P, r):
    d = np.full(pos.shape[:2], 9.0)
    for c in P: d = np.minimum(d, np.linalg.norm(pos - c, axis=-1))
    return np.exp(-0.5 * (d / r) ** 2) * msk
cc = []
for i in (133, 362):
    e = ec[np.argmin(np.abs(ec[:, 0] - lm[i][0]))]; cc.append(lm[i] + (e - lm[i]) * np.array([0.15, 0.1, 0.0]))
car = near_pts(cc, 0.0016) * K.get('car', 0.6)
n1 = vnoise(0.018, 1); n2 = vnoise(0.006, 2)
# ---- albedo ---------------------------------------------------------------------------------------------------------------
gain = np.array([K.get('gr', 1.01), K.get('gg', 1.055), K.get('gb', 1.10)], np.float32)
a = alb * gain
lum = a.mean(-1, keepdims=True); a = lum + (a - lum) * K.get('sat', 0.95)                                  # 8% less saturated
redv = U(np.clip(n1 * 0.5 + 0.5, 0, 1) * head)[..., None]
a = a * (1 + (redv - 0.5) * np.array([0.05, -0.02, -0.03]))                                                 # subtle mottling
a = a * (1 + U(flush)[..., None] * np.array([0.03, -0.035, -0.035]) * K.get('flush', 1.0))                   # warm flush
a = a * (1 - U(peri)[..., None] * np.array([0.06, 0.07, 0.05]))                                               # periorbital
a = a * (1 - U(car)[..., None] * np.array([0.0, 0.22, 0.18])) + U(car)[..., None] * np.array([0.06, 0, 0])  # caruncle pink
a = np.clip(a, 0, 1)
# ---- roughness (G) ----------------------------------------------------------------------------------------------------------
m = mr.copy(); g = m[..., 1]
g = g - U(tz) * K.get('tz', 0.10) + U(dry) * 0.04 + U(n2 * head) * 0.03
m[..., 1] = np.clip(g, 0.25, 1)
# ---- normal: pores ------------------------------------------------------------------------------------------------------------
face = U(near([1, 4, 205, 425, 151, 152, 117, 346], 0.04)); poreBig = U(np.clip(near([4, 5, 48, 278], 0.012) + near([205, 425], 0.016) * 0.6, 0, 1))
h = rng.standard_normal((R, R)).astype(np.float32)
pf = gaussian_filter(h, 1.0); pb = gaussian_filter(h, 2.2) * 2.2
pores = -np.maximum(0, -(pf * (1 - poreBig) + pb * poreBig) - 0.6)                                          # sparse pits
hgt = pores * face * K.get('pore', 0.9)
gy, gx = np.gradient(hgt)
nn = nrm * 2 - 1; nn[..., 0] -= gx * 1.0; nn[..., 1] += gy * 1.0
nn /= np.linalg.norm(nn, axis=-1, keepdims=True) + 1e-8; nrm2 = nn * 0.5 + 0.5
def save(arr, n, q):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, n + '.webp'), quality=q, method=5)
save(a, 'skin-albedo', 90); save(m, 'skin-mr', 92); save(nrm2, 'skin-normal', 94)
# ---- eyes -----------------------------------------------------------------------------------------------------------------------
ep = os.path.join(src, 'eyes-albedo.webp'); E = np.asarray(Image.open(ep).convert('RGBA')).astype(np.float32) / 255
rgb, al = E[..., :3], E[..., 3:]; Hh = E.shape[0]; yy, xx = np.mgrid[0:Hh, 0:Hh].astype(np.float32)
dark = (rgb.mean(-1) < 0.35) & (al[..., 0] > 0.5)
from scipy.ndimage import label
lab, n = label(dark); out_rgb = rgb.copy()
for k in range(1, n + 1):
    sel = lab == k
    if sel.sum() < 2000: continue
    cy, cx = yy[sel].mean(), xx[sel].mean(); rI = np.sqrt(sel.sum() / np.pi)
    r = np.hypot(yy - cy, xx - cx) / rI                                                                        # 1 = iris edge
    irisw = np.clip((1.12 - r) / 0.1, 0, 1)
    out_rgb *= (1 - irisw * np.clip((r - 0.55) / 0.45, 0, 1) * 0.28)[..., None]                               # darker outer iris (depth)
    out_rgb += (irisw * np.exp(-0.5 * ((r - 0.42) / 0.08) ** 2) * 0.06)[..., None] * np.array([1.0, 0.75, 0.45])  # collarette glint
    ring = np.exp(-0.5 * ((r - 1.02) / 0.06) ** 2); out_rgb *= (1 - ring * 0.45)[..., None]                    # limbal ring
    scl = np.clip((r - 1.15) / 0.3, 0, 1) * (np.hypot(yy - cy, xx - cx) < 3.0 * rI)
    out_rgb = out_rgb * (1 - scl[..., None] * 0.06) + scl[..., None] * np.array([0.02, 0.012, 0.0]) * 0       # warmer, less white
    out_rgb *= (1 - scl * 0.05)[..., None] * np.array([1.0, 0.985, 0.95])[None, None] ** scl[..., None]
    # (no lash band in the texture: the eye turns with the gaze; the lid's shadow comes from the lid mesh and the AO)
out = np.concatenate([np.clip(out_rgb, 0, 1), al], -1)
Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(sys.argv[3], 'eyes-albedo.webp'), quality=92, method=5, exact=True)
print('maps written', sys.argv[3])
