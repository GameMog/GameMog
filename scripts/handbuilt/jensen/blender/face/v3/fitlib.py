import numpy as np, json, cv2, math
# ---- MediaPipe face-mesh regions (identity-weighted) -------------------------------------------------------------------
OVAL_TOP = [10, 338, 297, 332, 284, 251, 109, 67, 103, 54, 21, 162, 389]
OVAL_SIDE = [356, 454, 323, 127, 234, 93]
JAW = [361, 288, 397, 365, 379, 378, 132, 58, 172, 136, 150, 149]
CHIN = [400, 377, 152, 148, 176]
EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398]
EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173]
BROW_L = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336]
BROW_R = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107]
LIPS_O = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
LIPS_I = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
NOSE = [1, 2, 98, 327, 168, 6, 197, 195, 5, 4, 45, 275, 220, 440, 48, 278, 64, 294, 129, 358, 49, 279, 102, 331, 94, 19, 240, 460, 59, 289, 166, 392]
CHEEK = [50, 280, 205, 425, 187, 411, 123, 352, 116, 345, 117, 346, 118, 347, 101, 330, 36, 266, 206, 426, 207, 427, 147, 376, 213, 433, 192, 416]
IRIS = list(range(468, 478))
REGIONS = {'face outline (sides)': (OVAL_SIDE, 2.0), 'jaw': (JAW, 2.5), 'chin': (CHIN, 2.5), 'forehead top (hairline)': (OVAL_TOP, 0.3),
           'eyes': (EYE_L + EYE_R, 3.0), 'brows': (BROW_L + BROW_R, 2.0), 'lips outer': (LIPS_O, 2.0), 'lips inner': (LIPS_I, 0.6),
           'nose': (NOSE, 2.5), 'cheekbones': (CHEEK, 2.0)}
def weights():
    w = np.full(478, 0.4); w[IRIS] = 0
    for ids, k in REGIONS.values(): w[ids] = k
    return w
W = weights()
# ---- cameras (OpenCV convention, glTF world) ----------------------------------------------------------------------------
def look(C, target, up=(0, 1, 0)):
    C = np.asarray(C, float); z = np.asarray(target, float) - C; z /= np.linalg.norm(z)
    x = np.cross(-np.asarray(up, float), z); x /= np.linalg.norm(x); y = np.cross(z, x)
    R = np.array([x, y, z]); return R, -R @ C
def cam(name, R, t, f, W_, H_, target, cx=None, cy=None):
    return {'name': name, 'R': np.asarray(R).tolist(), 't': np.asarray(t).ravel().tolist(), 'f': float(f), 'W': int(W_), 'H': int(H_),
            'cx': float(W_ / 2 if cx is None else cx), 'cy': float(H_ / 2 if cy is None else cy), 'target': list(map(float, target))}
def project(X, c):
    R, t = np.array(c['R']), np.array(c['t']); Y = X @ R.T + t
    return np.stack([c['f'] * Y[:, 0] / Y[:, 2] + c['cx'], c['f'] * Y[:, 1] / Y[:, 2] + c['cy']], 1), Y[:, 2]
# ---- correspondences: a detected landmark (px) -> the visible skin triangle under it + barycentrics --------------------
def correspond(P, tris, c, px):
    uv, z = project(P, c); A, B, C = uv[tris[:, 0]], uv[tris[:, 1]], uv[tris[:, 2]]
    zt = (z[tris[:, 0]] + z[tris[:, 1]] + z[tris[:, 2]]) / 3
    v0, v1 = B - A, C - A; den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]; good = np.abs(den) > 1e-9
    out_t, out_b = np.full(len(px), -1), np.zeros((len(px), 3))
    for k, p in enumerate(px):
        v2 = p - A; b1 = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / np.where(good, den, 1); b2 = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / np.where(good, den, 1)
        b0 = 1 - b1 - b2; ins = good & (b0 >= -1e-6) & (b1 >= -1e-6) & (b2 >= -1e-6)
        if not ins.any():
            # nearest triangle centroid (silhouette points can fall a pixel off the mesh)
            cen = (A + B + C) / 3; d = np.linalg.norm(cen - p, axis=1) + np.where(good, 0, 1e9); i = int(np.argmin(d))
            out_t[k] = i; out_b[k] = (1 / 3, 1 / 3, 1 / 3); continue
        i = np.where(ins)[0][np.argmin(zt[ins])]; out_t[k] = i; out_b[k] = (b0[i], b1[i], b2[i])
    return out_t, out_b
def anchors(P, tris, ti, bb):
    T = tris[ti]; return (P[T] * bb[..., None]).sum(1)
# ---- the loss -------------------------------------------------------------------------------------------------------------
def similarity(Pp, Q, w):
    """weighted 2D similarity (Umeyama) mapping Pp onto Q"""
    ws = w / w.sum(); mp = (Pp * ws[:, None]).sum(0); mq = (Q * ws[:, None]).sum(0); A = Pp - mp; B = Q - mq
    S = (B * ws[:, None]).T @ A; U, s, Vt = np.linalg.svd(S); d = np.sign(np.linalg.det(U @ Vt)); D = np.diag([1, d])
    R = U @ D @ Vt; sc = (s * np.diag(D)).sum() / (ws * (A ** 2).sum(1)).sum()
    return (sc * (R @ A.T)).T + mq
def iod(Q): return np.linalg.norm(Q[33] - Q[263])
def landmark_loss(Pp, Q, w=W, per_region=False):
    al = similarity(Pp, Q, w); e = np.linalg.norm(al - Q, axis=1) / iod(Q)
    L = float((w * e ** 2).sum() / w.sum()) ** 0.5
    if not per_region: return L
    return L, {k: float(np.sqrt((e[ids] ** 2).mean())) for k, (ids, _) in REGIONS.items()}, e
def pnp(X, Q, f, Wd, Hd, w=W, guess=None):
    K = np.array([[f, 0, Wd / 2], [0, f, Hd / 2], [0, 0, 1]], float); m = w > 0
    if guess is None: ok, r, t = cv2.solvePnP(X[m], Q[m, :2], K, None, flags=cv2.SOLVEPNP_EPNP); ok, r, t = cv2.solvePnP(X[m], Q[m, :2], K, None, r, t, True)
    else: ok, r, t = cv2.solvePnP(X[m], Q[m, :2], K, None, guess[0].copy(), guess[1].copy(), True)
    return r, t
