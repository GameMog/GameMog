# Step 6b: the leather's texture set, computed per texel from the baked position/normal/panel maps: CC0 grain
# (ambientCG Leather026 + Poly Haven leather_white, triplanar in 3D so it runs on across panel seams), every sewn seam
# (groove, seam-allowance ridge, topstitching with real dashes), the quilted shoulder channels, the welted pocket
# lips, the collar and tab stitching, fine elbow creases; then the normal map (tangent space), base colour with edge
# wear and thread, and ORM (AO, roughness with sheen variation).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, numpy as np, math, json, time
H = os.path.dirname(os.path.abspath(__file__))
import lib
from common import *
T0 = time.time()
def log(*a): print('[%5.1fs]' % (time.time() - T0), *a, flush=True)
A = os.environ['JH_MATERIALS'].rstrip('/') + '/'
POS = np.load(H + '/bake/pos.npy'); NRM = np.load(H + '/bake/nrm.npy'); DAT = np.load(H + '/bake/data.npy'); MASK = np.load(H + '/bake/mask.npy')
R = POS.shape[0]
valid = (np.abs(POS).sum(2) > 1e-6)
idx = np.nonzero(valid); P = POS[idx].astype(np.float32); N = NRM[idx].astype(np.float32); N /= np.maximum(np.linalg.norm(N, axis=1), 1e-6)[:, None]
pid = np.rint(DAT[idx][:, 0]).astype(np.int32); aux = DAT[idx][:, 1]; cvx = DAT[idx][:, 2]
x, y, z = P[:, 0], P[:, 1], P[:, 2]; n = len(P); log('texels', n)
def load(path, size=2048, ch=0):
    im = bpy.data.images.load(path); im.scale(size, size); a = np.array(im.pixels[:], np.float32).reshape(size, size, 4); bpy.data.images.remove(im); return a[:, :, ch] if ch is not None else a[:, :, :3]
def bil(img, u, v):
    S = img.shape[0]; fu = (u % 1.0) * S - 0.5; fv = (v % 1.0) * S - 0.5; x0 = np.floor(fu).astype(np.int64); y0 = np.floor(fv).astype(np.int64); dx = fu - x0; dy = fv - y0
    x0 %= S; y0 %= S; x1 = (x0 + 1) % S; y1 = (y0 + 1) % S
    return (img[y0, x0] * (1 - dx) * (1 - dy) + img[y0, x1] * dx * (1 - dy) + img[y1, x0] * (1 - dx) * dy + img[y1, x1] * dx * dy)
def tri(img, tile, off=(0.0, 0.0)):
    w = np.abs(N) ** 4; w /= w.sum(1, keepdims=True)
    return (bil(img, y / tile + off[0], z / tile + off[1]) * w[:, 0] + bil(img, x / tile + 0.37 + off[0], z / tile + 0.11 + off[1]) * w[:, 1] + bil(img, x / tile + 0.71 + off[0], y / tile + 0.53 + off[1]) * w[:, 2])
D26 = load(A + 'ambientcg_Leather026/Leather026_4K-JPG_Displacement.jpg'); D26 -= D26.mean(); D26 /= D26.std() + 1e-6
DW = load(A + 'polyhaven_leather_white/leather_white_disp_4k.jpg'); DW -= DW.mean(); DW /= DW.std() + 1e-6
R26 = load(A + 'ambientcg_Leather026/Leather026_4K-JPG_Roughness.jpg'); RW = load(A + 'polyhaven_leather_white/leather_white_rough_4k.jpg')
C26 = load(A + 'ambientcg_Leather026/Leather026_4K-JPG_Color.jpg'); C26 = C26 / (C26.mean() + 1e-6)
log('sources loaded')
grain = tri(D26, 0.15) * 0.000045 + tri(DW, 0.06) * 0.00002
rough_src = (tri(R26, 0.15) - R26.mean()) * 0.45 + (tri(RW, 0.06) - RW.mean()) * 0.5
mott = tri(C26, 0.15)
patch = tri(DW, 1.6) * 0.5 + tri(D26, 0.9, (0.3, 0.6)) * 0.5   # large soft variation (polish / sheen patches)
log('grain')
h = np.zeros(n, np.float32); thread = np.zeros(n, np.float32); hcr = np.zeros(n, np.float32)
TORSO = np.isin(pid, [0, 1, 2, 3, 4, 5, 6]); SLEEVE = np.isin(pid, [7, 8, 9, 10, 11, 12]); SHP = np.isin(pid, [13, 14]); COL = pid == 16; TAB = pid == 17; FAC = pid == 15
def stitch(doff, a, sel, period=0.0036, duty=0.74, w=0.00065):
    s = sel & (np.abs(doff) < w * 1.6)
    if not s.any(): return
    ph = (a[s] % period) / period; on = ph < duty; dd = doff[s] / w
    prof = np.clip(1 - dd * dd, 0, 1)
    hh = np.where(on, 0.00026 * prof * np.sqrt(np.clip(np.sin(np.pi * ph / duty), 0, 1)), -0.00012 * np.exp(-dd * dd * 2))
    h[s] += hh; thread[s] = np.maximum(thread[s], np.where(on, prof, 0))
def seam(d, a, sel, rows=(0.0036,), groove=True, puff=0.00034):
    s = sel & (np.abs(d) < 0.012)
    if not s.any(): return
    ds = d[s]
    if groove: h[s] += -0.0005 * np.exp(-(ds / 0.00065) ** 2) + puff * np.exp(-((np.abs(ds) - 0.0034) / 0.0026) ** 2)
    for r in rows:
        stitch(d - r, a, s & True) if True else None
phi_ = np.arctan2(x, -y); rxy = np.sqrt(x * x + y * y)
# ---- torso seams
seam((np.abs(phi_) - SIDE_PHI) * rxy, z, TORSO, rows=(0.0034, -0.0034))
front = np.abs(phi_) < SIDE_PHI
seam(z - YOKE_F, phi_ * rxy, TORSO & front & (z > YOKE_F - 0.03), rows=(0.0034, -0.0034))
seam(z - YOKE_B, phi_ * rxy, TORSO & ~front & (z > YOKE_B - 0.03), rows=(0.0034, -0.0034))
seam(z - (HEM + BAND), phi_ * rxy, TORSO, rows=(0.0034,))
stitch(z - (HEM + 0.0075), phi_ * rxy, TORSO | FAC)
stitch(np.abs(x) - (GAP + 0.0068), z, (TORSO) & (y < 0) & (np.abs(x) < 0.03))
log('torso seams')
# ---- arm-related: armhole, two-piece sleeve seams, cuff, shoulder panel + quilting, elbow fine creases
for s_ in ('L', 'R'):
    side = (x > 0) if s_ == 'L' else (x < 0)
    Aj, Bj, Cj = [np.array(v, np.float32) for v in arm(s_)]
    u1 = Bj - Aj; L1 = np.linalg.norm(u1); u1 /= L1; u2 = Cj - Bj; L2 = np.linalg.norm(u2); u2 /= L2
    t1 = (P - Aj) @ u1; seg2 = t1 >= L1
    u = np.where(seg2[:, None], u2, u1); base = np.where(seg2[:, None], Bj, Aj); t = np.where(seg2, L1 + (P - Bj) @ u2, t1)
    F = np.array([0, -1, 0], np.float32); f = F - u * (u @ F)[:, None]; f /= np.linalg.norm(f, axis=1, keepdims=True); g = np.cross(u, f)
    rvec = P - base - u * ((P - base) * u).sum(1, keepdims=True); rr = np.linalg.norm(rvec, axis=1)
    ph = np.arctan2((rvec * g).sum(1), (rvec * f).sum(1)) * (1 if s_ == 'L' else -1)
    Lt = L1 + L2
    pt, nn = armhole(s_); pt = np.array(pt, np.float32); nn = np.array(nn, np.float32)
    dah = (P - pt) @ nn
    seam(dah, ph * 0.06, side & (TORSO | SLEEVE | SHP) & (np.abs(x) > 0.1), rows=(0.0034,))
    sl = side & SLEEVE
    seam(rr * np.sin(ph), t, sl & (t < Lt - CUFF + 0.004), rows=(0.0034,))
    seam(t - (Lt - CUFF), ph * rr, side & (SLEEVE), rows=(0.0034, -0.0034))
    stitch(t - (Lt + 0.0005), ph * rr, side & (SLEEVE | FAC) & (t > Lt - 0.03))
    # elbow: fine compression creases on the inner side
    E = L1; kel = np.exp(-((t - E) / 0.06) ** 2) * (0.25 + 0.75 * np.clip(np.cos(ph), 0, 1)) * (side & (SLEEVE | SHP))
    hcr += (0.00034 * kel * np.sin(2 * np.pi * (t + 0.004 * np.sin(5 * ph + 1.3) + 0.002 * np.sin(17 * ph)) / 0.0125)).astype(np.float32)
    kw = np.exp(-((t - (Lt - 0.10)) / 0.05) ** 2) * (side & SLEEVE)
    hcr += (0.00022 * kw * np.sin(2 * np.pi * (t + 0.003 * np.sin(7 * ph)) / 0.011)).astype(np.float32)
    # padded shoulder panel: its outline seam and quilted channels across the arm, every 2.4 cm
    Av = arm(s_)[0]; Bv = arm(s_)[1]
    uu = (Bv - Av).normalized(); up = (Vector((0, 0, 1)) - uu * uu.z).normalized(); ww = uu.cross(up).normalized()
    cc = np.array(Av + uu * 0.03 + up * 0.03 + Vector((0, -0.008, 0)), np.float32); uu, up, ww = [np.array(v, np.float32) for v in (uu, up, ww)]
    dp = P - cc; qa = dp @ uu; qw = dp @ ww
    m = np.sqrt((qa / 0.095) ** 2 + (qw / 0.078) ** 2)
    sp = side & (SHP | SLEEVE | TORSO) & ((dp @ up) > -0.035)
    seam((m - 1) * 0.085, np.arctan2(qw / 0.078, qa / 0.095) * 0.085, sp, rows=(-0.0034,))
    inside = side & SHP & (m < 0.97)
    qq = (qa + 0.012) % 0.024 - 0.012
    h[inside] += (0.0008 * np.cos(np.pi * qq[inside] / 0.024) ** 2 - 0.0003 * np.exp(-(qq[inside] / 0.0008) ** 2)).astype(np.float32)
    stitch(qq, qw, inside)
log('arms')
# ---- welted zip pockets: two rounded lips with the chain between, a topstitched box round them
hw = json.load(open(H + '/hw.json'))
for name, (p0, p1, Lp) in hw['pockets'].items():
    p0 = np.array([p0[0], p0[2]], np.float32); p1 = np.array([p1[0], p1[2]], np.float32); dv = p1 - p0; Lxz = np.linalg.norm(dv); dv /= Lxz; pv = np.array([-dv[1], dv[0]], np.float32)
    q = np.stack([x, z], 1) - p0; a = q @ dv * (Lp / Lxz); c = q @ pv
    sel = (TORSO) & (y < 0) & (a > -0.012) & (a < Lp + 0.012) & (np.abs(c) < 0.014)
    inn = sel & (a > -0.002) & (a < Lp + 0.002)
    ac = np.abs(c)
    h[inn] += (0.0011 * np.exp(-((ac[inn] - 0.0042) / 0.0020) ** 2) - 0.0014 * np.exp(-(c[inn] / 0.0013) ** 2)).astype(np.float32)
    stitch(ac - 0.0098, a, sel & (a > -0.006) & (a < Lp + 0.006))
    stitch(np.minimum(np.abs(a + 0.006), np.abs(a - Lp - 0.006)), c, sel & (ac < 0.0098))
log('pockets')
# ---- collar: stitched 4.5 mm under its top and 5 mm over its seam; tabs edge-stitched 2.8 mm in
fr = np.clip((y + 0.086) / 0.16, 0, 1); hcol = 0.040 + 0.007 * fr
stitch(aux - (hcol - 0.0045), phi_ * rxy, COL & (aux < hcol))
stitch(aux - 0.005, phi_ * rxy, COL & (aux < hcol))
snaps = np.load(H + '/snaps.npy')
for k in range(2):
    c0 = snaps[2 * k:2 * k + 2, :3].mean(0); nz = snaps[2 * k, 3:]; e1 = snaps[2 * k + 1, :3] - snaps[2 * k, :3]; e1 /= np.linalg.norm(e1); e2 = np.cross(nz, e1)
    near = TAB & (np.linalg.norm(P - c0, axis=1) < 0.04)
    dpp = P - c0; aa = np.arctan2(dpp @ e2, dpp @ e1) * 0.02
    stitch(aux - 0.0028, aa, near & (aux > 0.0005))
h[TAB] += (0.0004 * np.clip(aux[TAB] / 0.003, 0, 1)).astype(np.float32)
log('collar/tabs')
# ---- height -> image, normal map
Hm = np.zeros((R, R), np.float32); Hm[idx] = h + hcr + grain
Hstruct = np.zeros((R, R), np.float32); Hstruct[idx] = h
def grad(img):
    gx = np.zeros_like(img); gy = np.zeros_like(img)
    gx[:, 1:-1] = (img[:, 2:] - img[:, :-2]) * 0.5; gy[1:-1, :] = (img[2:, :] - img[:-2, :]) * 0.5
    return gx, gy
V3 = valid
gxh, gyh = grad(Hm)
Pu = np.zeros((R, R, 3), np.float32); Pv = np.zeros((R, R, 3), np.float32)
Pu[:, 1:-1] = (POS[:, 2:] - POS[:, :-2]) * 0.5; Pv[1:-1, :] = (POS[2:, :] - POS[:-2, :]) * 0.5
# where a neighbour is outside the atlas, the derivative is not trusted: zero the height slope there
okx = np.zeros((R, R), bool); okx[:, 1:-1] = valid[:, 2:] & valid[:, :-2]; oky = np.zeros((R, R), bool); oky[1:-1, :] = valid[2:, :] & valid[:-2, :]
jump = (np.linalg.norm(Pu, axis=2) > 0.004) | (np.linalg.norm(Pv, axis=2) > 0.004)  # island borders inside the margin
gxh[~okx | jump] = 0; gyh[~oky | jump] = 0
Tu = Pu[idx]; Tv = Pv[idx]
# fall back to an orthonormal frame where the derivative is missing
bad = (np.linalg.norm(Tu, axis=1) < 1e-7) | (np.linalg.norm(Tv, axis=1) < 1e-7) | jump[idx]
Nn = N
cu = np.cross(Tv, Nn); cv_ = np.cross(Nn, Tu); den = (Tu * cu).sum(1)
den = np.where(np.abs(den) < 1e-12, 1e-12, den)
dhu = gxh[idx]; dhv = gyh[idx]
nb_ = Nn - (dhu[:, None] * cu + dhv[:, None] * cv_) / den[:, None]
nb_ /= np.linalg.norm(nb_, axis=1, keepdims=True)
# tangent frame as a renderer derives it from the UVs: T along +u, B along +v, made square to N
Tt = Tu - Nn * (Tu * Nn).sum(1, keepdims=True); Tt /= np.maximum(np.linalg.norm(Tt, axis=1, keepdims=True), 1e-9)
Bt = np.cross(Nn, Tt); sgn = np.sign((Bt * Tv).sum(1)); sgn[sgn == 0] = 1; Bt *= sgn[:, None]
tn = np.stack([(nb_ * Tt).sum(1), (nb_ * Bt).sum(1), (nb_ * Nn).sum(1)], 1)
tn[bad] = [0, 0, 1]
inner = (MASK > 0.5)[idx]
tn[~inner] = [0, 0, 1]
NM = np.zeros((R, R, 3), np.float32); NM[:] = [0.5, 0.5, 1.0]; NM[idx] = tn * 0.5 + 0.5
FILLED = MASK > 0.5
def dilate(I, it=16):
    I = I.copy(); f = FILLED.copy()
    for k in range(it):
        acc = np.zeros_like(I); cnt = np.zeros(f.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sf = np.roll(np.roll(f, dy, 0), dx, 1); si = np.roll(np.roll(I, dy, 0), dx, 1)
            acc += si * (sf[..., None] if I.ndim == 3 else sf); cnt += sf
        new = (~f) & (cnt > 0)
        I[new] = (acc[new] / (cnt[new][:, None] if I.ndim == 3 else cnt[new]))
        f = f | new
    return I
NM = dilate(NM); NM[..., :] /= 1.0
log('normal map; slope p99', np.percentile(np.linalg.norm(tn[:, :2], axis=1), 99))
# ---- wear, colour, roughness
# ridges of the sewn structure (curvature of the smoothed structural height) + the mesh's convex edges
from numpy.fft import rfft2, irfft2
def blur(img, r):
    k = np.arange(-3 * r, 3 * r + 1); w = np.exp(-(k / r) ** 2 / 2); w /= w.sum(); o = img.copy()
    for ax in (0, 1): o = sum(np.roll(o, int(s), axis=ax) * ww for s, ww in zip(k, w))
    return o
Hb = blur(Hstruct, 3); lap = np.zeros_like(Hb); lap[1:-1, 1:-1] = Hb[2:, 1:-1] + Hb[:-2, 1:-1] + Hb[1:-1, 2:] + Hb[1:-1, :-2] - 4 * Hb[1:-1, 1:-1]
ridge = np.clip(-lap[idx] / 2.5e-6, 0, 1)
edge = np.clip((cvx - 0.12) / 0.5, 0, 1)
wear = np.clip(ridge * 0.45 + edge * 0.45 + (FAC * 0.1), 0, 1) * np.clip(0.55 + patch * 0.5, 0, 1.2)
wear = np.clip(wear, 0, 1)
base = np.array([0.0082, 0.0077, 0.0074], np.float32)           # warm near-black (linear)
worn = np.array([0.026, 0.023, 0.021], np.float32)
col = base[None] * np.clip(mott, 0.85, 1.18)[:, None] * (1 + 0.05 * patch)[:, None]
col = col * (1 - wear[:, None]) + worn[None] * wear[:, None]
thr = np.array([0.020, 0.020, 0.021], np.float32); tm = np.clip(thread, 0, 1)[:, None] * 0.85
col = col * (1 - tm) + thr[None] * tm
rough = 0.46 + rough_src * 0.40 + patch * 0.045 - wear * 0.08 + thread * 0.22
rough = np.clip(rough, 0.22, 0.85)
AO = np.load(H + '/bake/ao.npy'); AO = np.repeat(np.repeat(AO, 2, 0), 2, 1)[:R, :R]
ao = np.clip(AO[idx], 0, 1) ** 0.8
col = col * (0.75 + 0.25 * ao[:, None])
def to_img(vals, ch, fill):
    I = np.zeros((R, R, ch), np.float32); I[:] = fill; I[idx] = vals.reshape(n, ch); return I
BC = dilate(to_img(col, 3, base)); RG = dilate(to_img(rough, 1, 0.45)[:, :, 0]); AOm = dilate(to_img(ao, 1, 1.0)[:, :, 0])
def down2(I): return (I[0::2, 0::2] + I[1::2, 0::2] + I[0::2, 1::2] + I[1::2, 1::2]) * 0.25
def save(arr, name, fmt='PNG', srgb=False, quality=92):
    hh, ww = arr.shape[:2]; img = bpy.data.images.new(name, ww, hh, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    a4 = np.ones((hh, ww, 4), np.float32); a4[:, :, :arr.shape[2] if arr.ndim == 3 else 1] = arr if arr.ndim == 3 else arr[:, :, None]
    if arr.ndim == 2: a4[:, :, 1] = arr; a4[:, :, 2] = arr
    img.pixels = a4.ravel(); ext = 'jpg' if fmt == 'JPEG' else 'png'
    img.filepath_raw = H + f'/tex/{name}.{ext}'; img.file_format = fmt
    sc = bpy.context.scene; sc.render.image_settings.quality = quality
    img.save(filepath=H + f'/tex/{name}.{ext}', quality=quality) if fmt == 'JPEG' else img.save(filepath=H + f'/tex/{name}.{ext}')
    bpy.data.images.remove(img)
os.makedirs(H + '/tex', exist_ok=True)
lin2s = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)
save(NM, 'leather_normal')
save(lin2s(down2(BC)), 'leather_basecolor', srgb=True)
ORM = np.stack([down2(AOm), down2(RG), np.zeros((R // 2, R // 2), np.float32)], 2)
save(ORM, 'leather_orm')
log('saved')
