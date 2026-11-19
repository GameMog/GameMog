# Step 4b (it3): the centre zip's tiling texture set (original, procedural): interlocking gunmetal teeth on black tape.
# u across the strip (13.2 mm), v along it, one period = 6 mm (a tooth from each side). 256 x 128, supersampled 4x.
# Writes tex/zip_basecolor.png (sRGB), tex/zip_orm.png (R AO, G rough, B metal), tex/zip_normal.png (OpenGL / glTF).
import bpy, numpy as np, os
H = os.path.dirname(os.path.abspath(__file__))
W_, P_ = 13.2, 4.0; NU, NV, SS = 256, 128, 4   # v3: finer chain (a tooth every 2 mm, it3 3 mm), bevelled teeth
u = (np.arange(NU * SS) + 0.5) / (NU * SS); v = (np.arange(NV * SS) + 0.5) / (NV * SS)
X, Y = np.meshgrid((u - 0.5) * W_, v * P_)   # mm; rows = v
def rr_sdf(x, y, hw, hh, r):
    qx, qy = np.abs(x) - (hw - r), np.abs(y) - (hh - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
h = np.zeros_like(X); tooth = np.zeros_like(X)
for sg, yc in ((-1, 1.0), (1, 3.0)):
    xc = sg * (-0.35); hw = 2.25
    for yy in (yc - P_, yc, yc + P_):   # wrap
        d = rr_sdf(X - xc, Y - yy, hw, 0.78, 0.30)
        m = np.clip(-d / 0.10, 0, 1); m = m * m * (3 - 2 * m)
        bev = np.clip(-d / 0.28, 0, 1); bev = np.sin(bev * np.pi / 2)          # a rounded bevel all round: edge highlights
        scoop = -0.09 * np.exp(-(((X - sg * 1.05) / 0.42) ** 2 + ((Y - yy) / 0.40) ** 2))   # the head's cup
        ridge = 0.05 * np.exp(-(((X - xc + sg * 0.9) / 0.5) ** 2)) * bev        # the shank's crown
        hh = (0.30 + 0.30 * bev + scoop + ridge) * m
        h = np.maximum(h, hh); tooth = np.maximum(tooth, m)
tape = np.abs(X) > 2.7
weave = 0.012 * np.sin(Y / 0.35 * 2 * np.pi) * np.sin(X / 0.4 * 2 * np.pi) * tape
h = h + weave
def down(a): return a.reshape(NV, SS, NU, SS).mean((1, 3)) if a.ndim == 2 else a.reshape(NV, SS, NU, SS, a.shape[-1]).mean((1, 3))
# normal (mm units) with wrap in v
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * W_ / (NU * SS)); gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * P_ / (NV * SS))
gx[:, 0] = gx[:, -1] = 0
N = np.stack([-gx, -gy, np.ones_like(h)], -1); N /= np.linalg.norm(N, axis=-1, keepdims=True)
N = down(N); N /= np.linalg.norm(N, axis=-1, keepdims=True)
ao = np.clip(0.35 + h / 0.45, 0.35, 1.0) * np.where(tape, 1, 1)
gun = np.array([0.12, 0.122, 0.13]); tp = np.array([0.011, 0.011, 0.012])
col = tooth[..., None] * gun * (0.85 + 0.25 * np.clip(h / 0.6, 0, 1))[..., None] + (1 - tooth[..., None]) * tp * ao[..., None]
rough = tooth * (0.36 + 0.08 * (1 - np.clip(h / 0.6, 0, 1))) + (1 - tooth) * 0.85
metal = tooth
BC, R_, M_, A_ = down(col), down(rough), down(metal), down(ao)
lin2s = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)
def save(arr, name, srgb):
    img = bpy.data.images.new(name, NU, NV, alpha=False); img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    a4 = np.ones((NV, NU, 4), np.float32); a4[..., :3] = arr; img.pixels = a4.ravel()
    img.filepath_raw = H + f'/tex/{name}.png'; img.file_format = 'PNG'; img.save(); bpy.data.images.remove(img)
save(lin2s(BC), 'zip_basecolor', True)
save(np.stack([A_, R_, M_], -1), 'zip_orm', False)
save(N * 0.5 + 0.5, 'zip_normal', False)
print('zip textures written', NU, NV)
