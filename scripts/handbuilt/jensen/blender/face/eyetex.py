# A new eye texture (original, procedural) in the build's eye-texture layout: two eyeballs, each a sclera disc with an
# iris. Dark warm brown iris with radial fibres, a collarette, a soft dark limbal ring (no red rim), a slightly warm
# sclera with faint vessels toward the edges. Layout (centres, radii) measured from the build's own eye texture.
#   blender -b --python eyetex.py -- src_eye.png out.png [size]
import bpy, sys, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]; src, out = a[0], a[1]; S = int(a[2]) if len(a) > 2 else 1024
im = bpy.data.images.load(src); w, h = im.size; px = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
lum = px[..., :3].mean(2)
# the two pupils: darkest pixels, split by the anti-diagonal
yy, xx = np.mgrid[0:h, 0:w]
cent = []
for side in (xx + yy < w, xx + yy >= w):
    m = (lum < 0.08) & side; cy, cx = yy[m].mean(), xx[m].mean(); pr = np.sqrt(m.sum() / np.pi)
    # iris radius: where the mean luminance along rays first rises to sclera level
    rs = np.arange(2, 120); prof = []
    for r in rs:
        t = np.linspace(0, 2 * np.pi, 90); x = np.clip((cx + r * np.cos(t)).astype(int), 0, w - 1); y = np.clip((cy + r * np.sin(t)).astype(int), 0, h - 1); prof.append(lum[y, x].mean())
    prof = np.array(prof); sl = np.median(lum[side]); ir = rs[np.argmax(prof > 0.5 * (sl + prof[:5].mean()))] if (prof > 0.5 * (sl + prof[:5].mean())).any() else 57
    # the eyeball disc: where the sclera ends (lum drops to the grey ground) roughly
    cent.append((cx / w, cy / h, pr / w, ir / w)); print('EYE centre', cx, cy, 'pupil r', pr, 'iris r', ir)
rng = np.random.default_rng(7)
Y, X = np.mgrid[0:S, 0:S].astype(np.float32) / S
def fbm(n, oct=4, seed=0):
    r = np.random.default_rng(seed); acc = np.zeros((S, S), np.float32); amp = 1
    for o in range(oct):
        g = r.random((n * 2 ** o + 1, n * 2 ** o + 1)).astype(np.float32)
        gi = np.linspace(0, n * 2 ** o, S); i0 = np.floor(gi).astype(int).clip(0, n * 2 ** o - 1); f = gi - i0; f = f * f * (3 - 2 * f)
        a0 = g[i0][:, i0] * (1 - f)[None, :] + g[i0][:, i0 + 1] * f[None, :]; a1 = g[i0 + 1][:, i0] * (1 - f)[None, :] + g[i0 + 1][:, i0 + 1] * f[None, :]
        acc += amp * (a0 * (1 - f)[:, None] + a1 * f[:, None]); amp *= 0.5
    return acc / 1.9
ground = np.array([0.80, 0.78, 0.75], np.float32)
img = np.ones((S, S, 3), np.float32) * ground
n1 = fbm(6, 4, 1); n2 = fbm(40, 3, 2)
for (cx, cy, pr, ir) in cent:
    dx = X - cx; dy = Y - cy; r = np.sqrt(dx * dx + dy * dy); th = np.arctan2(dy, dx)
    R = ir; P = 0.62 * pr
    # sclera (inside a generous ball radius): warm off-white, pinker and greyer toward the rim
    ball = 2.3 * R; sc = np.clip(1 - (r - R) / (ball - R), 0, 1)
    scl = np.stack([0.86 + 0.01 * (1 - sc), 0.845 - 0.02 * (1 - sc), 0.815 - 0.03 * (1 - sc)], -1) * (0.97 + 0.04 * n1[..., None])
    # faint vessels: thin wavy radial lines from the rim inward
    vv = np.abs(np.sin(th * 23 + 3 * n1 * 6.28)) ** 40 * np.clip((r - 1.35 * R) / (0.6 * R), 0, 1) * (n2 > 0.55)
    scl = scl * (1 - 0.12 * vv[..., None] * np.array([0.1, 0.5, 0.5]))
    m = (r < ball)[..., None]; img = np.where(m, scl, img)
    # iris: dark warm brown, radial fibres, lighter collarette ring, darker toward the limbus
    q = np.clip((r - P) / (R - P), 0, 1)
    fib = 0.5 + 0.5 * np.sin(th * 140 + 6 * n2 * 6.28) * 0.6 + 0.4 * (np.sin(th * 57 + 2 * n1) * 0.5)
    base = np.array([0.20, 0.115, 0.06], np.float32)
    col = base[None, None, :] * (0.75 + 0.45 * fib[..., None])
    coll = np.exp(-((q - 0.35) / 0.08) ** 2)[..., None]; col = col * (1 + 0.55 * coll * np.array([1.0, 0.9, 0.6]))
    col = col * (1 - 0.55 * np.clip((q - 0.78) / 0.22, 0, 1) ** 1.5)[..., None]
    # limbal ring: soft dark, blending into the sclera
    lim = np.clip((r - R * 0.98) / (R * 0.09), 0, 1)[..., None]
    irisM = (r < R * 1.1)[..., None]
    mixed = col * (1 - lim) + img * lim
    img = np.where(irisM, mixed, img)
    pup = np.clip((r - P * 0.9) / (P * 0.25), 0, 1)[..., None]
    img = img * pup + np.array([0.012, 0.01, 0.01]) * (1 - pup)
# keep the build's own alpha (the cornea shell's clear region and the corner square), resampled to S
al = px[..., 3]; ii = (np.arange(S) * h / S).astype(int); jj = (np.arange(S) * w / S).astype(int); A = al[ii][:, jj]
print('ALPHA min/max', al.min(), al.max(), 'opaque frac', (al > 0.99).mean())
# where the build's texture is the corner square (not an eyeball) keep its colour too
orig = px[..., :3][ii][:, jj]; corner = (A < 0.99)[..., None]
img = np.where(corner, orig, img)
out_px = np.concatenate([np.clip(img, 0, 1), A[..., None]], -1)
o = bpy.data.images.new('eye', S, S, alpha=True); o.alpha_mode = 'STRAIGHT'; o.pixels[:] = out_px.ravel(); o.filepath_raw = out; o.file_format = 'PNG'; o.save(); print('SAVED', out)
