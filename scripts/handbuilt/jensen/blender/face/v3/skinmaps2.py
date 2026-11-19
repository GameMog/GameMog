# skinmaps2.py SRC_DIR POSMAP OUT_DIR [k=v ...] : iteration-2 skin maps on top of maps3 (procedural only; no photo pixels)
#   normal : the fold/wrinkle relief (mid frequencies) taken out of the cheeks, under the eyes and the marionette area;
#            the nasolabial fold kept only as a shallow smile line; pores (high frequencies) kept everywhere
#   albedo : the painted crease darkening lifted in the same areas; a warmer, LESS saturated, lighter East-Asian tone with a
#            soft redness on the cheeks and nose; the jaw-to-neck seam's colour break evened out in 3D (the neck front is
#            its own uv island: each texel's low-frequency colour replaced by the colour of its 3D neighbourhood)
#   mr (G) : roughness about 0.5 (cheeks ~0.58, T-zone ~0.45 after the material's 0.95 factor) with fine micro variation
import sys, os, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom, map_coordinates
src, pm, out = sys.argv[1:4]; K = {k: float(v) for k, v in (a.split('=') for a in sys.argv[4:])}
os.makedirs(out, exist_ok=True)
z = np.load(pm); pos, msk, lm = z['pos'], z['msk'], z['lm']
def load(n): return np.asarray(Image.open(os.path.join(src, n + '.webp')).convert('RGB')).astype(np.float32) / 255
alb, mr, nrm = load('skin-albedo'), load('skin-mr'), load('skin-normal'); R = alb.shape[0]; up = R // pos.shape[0]
def U(a): return zoom(a, (up, up) + (1,) * (a.ndim - 2), order=1)
def near(ids, r, off=(0, 0, 0)):
    d = np.full(pos.shape[:2], 9.0)
    for i in ids:
        for s in (1, -1):
            c = (lm[i] + np.array(off) / 1000) * [s, 1, 1]; d = np.minimum(d, np.linalg.norm(pos - c, axis=-1))
    return np.exp(-0.5 * (d / (r / 1000)) ** 2) * msk
# ---- region masks (2048) -------------------------------------------------------------------------------------------------
cheek = np.clip(near([117, 123, 50, 205, 187, 207, 147], 13) * 1.3, 0, 1)
under = np.clip(near([230, 231, 229, 119, 120, 118], 7, (0, -1, 0)) * 1.4, 0, 1)
nlf = np.clip(near([206, 216, 92, 165, 203], 6) * 1.5, 0, 1)
mar = np.clip(near([57, 43, 204, 202, 210], 8) * 1.3, 0, 1)
crow = np.clip(near([130, 226, 25], 7, (-6, 0, -4)), 0, 1)
fore = np.clip(near([151, 9, 108, 69], 18), 0, 1)
kill = np.clip(np.maximum.reduce([cheek, under * 1.0, mar, crow * 0.6, fore * K.get('fore', 0.35)]), 0, 1)
keepN = 1 - nlf * (1 - K.get('nlf', 0.25))                       # the smile line kept at a quarter
Mn = np.clip(1 - (1 - kill) * keepN, 0, 1) * 0.9                  # 0 = untouched, 0.9 = folds 90% gone
Mn4 = U(Mn)
# ---- normal: split pores (high) from folds (mid/low) ------------------------------------------------------------------------
nxy = nrm[..., :2] * 2 - 1; lf = np.stack([gaussian_filter(nxy[..., k], 3.0) for k in (0, 1)], -1); hf = nxy - lf
nxy2 = hf * (1 - Mn4[..., None] * 0.15) + lf * (1 - Mn4[..., None])
nz = np.sqrt(np.clip(1 - (nxy2 ** 2).sum(-1), 0.05, 1)); n2 = np.concatenate([nxy2, nz[..., None]], -1) * 0.5 + 0.5
bg = (nrm.sum(-1) < 0.05); n2[bg] = nrm[bg]
# ---- albedo: lift the creases, then the tone ----------------------------------------------------------------------------------
lum = alb.mean(-1); base = np.stack([gaussian_filter(alb[..., k], 22) for k in range(3)], -1)
dark = np.clip(base.mean(-1) - lum - 0.004, 0, 1)[..., None]
a = alb + Mn4[..., None] * dark * (base / np.maximum(base.mean(-1, keepdims=True), 1e-3)) * 1.0
g = np.array([K.get('gr', 1.06), K.get('gg', 1.13), K.get('gb', 1.27)], np.float32); a = a * g
l = a.mean(-1, keepdims=True); a = l + (a - l) * K.get('sat', 0.86)
flush = U(np.clip(near([205, 50, 117], 14) * 0.9 + near([4, 5], 8) + near([1, 19], 6) * 0.5, 0, 1))[..., None]
a = a * (1 + flush * np.array([0.035, -0.03, -0.02]) * K.get('flush', 1.0))
# ---- jaw-to-neck seam: low-frequency colour equalised in 3D -------------------------------------------------------------------
A2 = zoom(a, (1 / up, 1 / up, 1), order=1) if up > 1 else a
valid = msk & ((A2[..., 0] - A2[..., 2]) > 0.06) & (A2.mean(-1) > 0.2)
def lf_uv(sig_mm):
    sp = sig_mm / 0.42
    return np.stack([gaussian_filter(A2[..., k] * valid, sp) for k in range(3)], -1) / np.maximum(gaussian_filter(valid.astype(np.float32), sp), 1e-4)[..., None]
def lf_3d(sig_mm, vox=0.003):
    P = pos[valid]; lo = P.min(0) - 0.02; idx = ((P - lo) / vox).astype(int); dims = idx.max(0) + 8
    S = np.zeros(tuple(dims) + (3,), np.float32); C = np.zeros(tuple(dims), np.float32)
    np.add.at(S, (idx[:, 0], idx[:, 1], idx[:, 2]), A2[valid]); np.add.at(C, (idx[:, 0], idx[:, 1], idx[:, 2]), 1)
    sg = (sig_mm / 1000) / vox; S = np.stack([gaussian_filter(S[..., k], sg) for k in range(3)], -1); C = gaussian_filter(C, sg)
    q = ((pos - lo) / vox).reshape(-1, 3).T
    o = np.stack([map_coordinates(S[..., k], q, order=1, mode='nearest') for k in range(3)], -1) / np.maximum(map_coordinates(C, q, order=1, mode='nearest'), 1e-4)[:, None]
    return o.reshape(A2.shape)
yc = lm[152][1]; y = pos[..., 1]; ax = np.abs(pos[..., 0])
# the seam band: under the jaw and the neck front, and up the jaw's side behind the cheek to the ear lobe: every hard
# colour step there (island seams, the bake's darker jaw-side patch and its edge) replaced by a smooth 3D colour; the
# fine detail kept at half
front = np.clip((yc + 0.022 - y) / 0.012, 0, 1)
side = np.clip((yc + 0.09 - y) / 0.015, 0, 1) * np.clip((ax - 0.03) / 0.012, 0, 1) * np.clip((abs(lm[234][2]) + 0.03 - pos[..., 2]) / 0.02, 0, 1) * np.clip((ax - 0.02) / 0.01, 0, 1)
band = np.maximum(front, side) * np.clip((y - (yc - 0.10)) / 0.02, 0, 1) * valid
lo_uv = lf_uv(2.5); big = lf_3d(9.0)
delta = (big + (A2 - lo_uv) * 0.5 - A2) * band[..., None]
a = a + U(delta)
# and the relief there: the neck's/jaw-side folds and the seam's stamped lines out of the normal map (pores kept)
Bn = U(np.clip(band * 1.2, 0, 1))[..., None] * 0.85
nxy3 = (n2[..., :2] * 2 - 1); lf3n = np.stack([gaussian_filter(nxy3[..., k], 3.0) for k in (0, 1)], -1); nxy3 = nxy3 - lf3n * Bn
nz3 = np.sqrt(np.clip(1 - (nxy3 ** 2).sum(-1), 0.05, 1)); n3 = np.concatenate([nxy3, nz3[..., None]], -1) * 0.5 + 0.5; n2 = np.where(bg[..., None], n2, n3)
save = lambda arr, n, q: Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, n + '.webp'), quality=q, method=5)
# ---- roughness -----------------------------------------------------------------------------------------------------------------------
G = mr[..., 1]; mid = K.get('rmid', 0.53); rng = np.random.default_rng(11)
micro = gaussian_filter(rng.standard_normal(G.shape).astype(np.float32), 1.2); micro /= micro.std() + 1e-6
G2 = mid + (G - mid) * K.get('rk', 0.45) + micro * 0.018 * U(msk.astype(np.float32))
m2 = mr.copy(); m2[..., 1] = np.where(bg, G, np.clip(G2, 0.3, 1))
save(a, 'skin-albedo', 90); save(m2, 'skin-mr', 92); save(n2, 'skin-normal', 94)
import shutil; shutil.copy(os.path.join(src, 'eyes-albedo.webp'), os.path.join(out, 'eyes-albedo.webp'))
print('seam band texels', int((band > 0.5).sum()), 'max seam shift', float(np.abs(delta).max()), 'maps written', out)
