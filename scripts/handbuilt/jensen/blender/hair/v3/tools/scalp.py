# the scalp: dense samples on the head skin (bind space, glTF axes, metres), their smooth normals, a KD tree;
# the head frame and the hairline (spherical angles round the skull's centre HC)
import numpy as np, sys, os, json
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__)); from head import load
HC = np.array([0.0, 1.645, 0.039])
deg = np.radians

def sph(p):
    d = p - HC
    phi = np.degrees(np.arctan2(d[..., 0], d[..., 2]))
    th = np.degrees(np.arctan2(d[..., 1], np.hypot(d[..., 0], d[..., 2])))
    return phi, th

# hairline: elevation (deg) of the hair's lower edge per |azimuth| (0 front, 90 side, 180 back)
HL = json.load(open(os.path.join(os.path.dirname(__file__), '../hairline.json')))
def hairline(aphi):
    t = np.array(HL['phi']); v = np.array(HL['th'])
    # an irregular edge (+-1.3 deg over ~8-25 deg of azimuth), not a drawn line
    w = 0.8 * np.sin(np.radians(aphi) * 13 + 0.7) + 0.5 * np.sin(np.radians(aphi) * 29 + 2.1) + 0.35 * np.sin(np.radians(aphi) * 47 + 4.0)
    return np.interp(aphi, t, v) + w

def vnormals(P, IX):
    N = np.zeros_like(P); a, b, c = P[IX[:, 0]], P[IX[:, 1]], P[IX[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3): np.add.at(N, IX[:, k], fn)
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)

class Scalp:
    def __init__(self, n=400000, seed=1):
        P, IX, E = load(); self.P, self.IX = P, IX
        # the head only (above the jaw, behind the face is fine: the region test cuts it)
        keep = (P[IX][:, :, 1].min(1) > 1.47)
        IX = IX[keep]; self.HIX = IX
        N = vnormals(P, IX)
        a, b, c = P[IX[:, 0]], P[IX[:, 1]], P[IX[:, 2]]
        area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
        rng = np.random.default_rng(seed)
        t = rng.choice(len(IX), n, p=area / area.sum())
        u, v = rng.random(n), rng.random(n); f = u + v > 1; u[f], v[f] = 1 - u[f], 1 - v[f]
        w = 1 - u - v
        self.S = a[t] * w[:, None] + b[t] * u[:, None] + c[t] * v[:, None]
        nn = N[IX[t, 0]] * w[:, None] + N[IX[t, 1]] * u[:, None] + N[IX[t, 2]] * v[:, None]
        self.N = nn / np.linalg.norm(nn, axis=1, keepdims=True)
        self.tree = cKDTree(self.S)
        self.area = area.sum()
    def project(self, q, k=8):
        d, i = self.tree.query(q, k=k)
        w = 1 / (d + 1e-4) ** 2; w /= w.sum(-1, keepdims=True)
        p = (self.S[i] * w[..., None]).sum(-2); n = (self.N[i] * w[..., None]).sum(-2)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        return p, n

def ear_mask(p):
    # the ears' boxes (measured: |x| > 0.072, y 1.555-1.645, z -0.01-0.075)
    return (np.abs(p[..., 0]) > 0.0835) & (p[..., 1] > 1.562) & (p[..., 1] < 1.637) & (p[..., 2] > 0.01) & (p[..., 2] < 0.064)

def region(p, margin=0.0):
    """signed: > 0 inside the hair (degrees above the hairline)"""
    phi, th = sph(p)
    r = th - hairline(np.abs(phi)) - margin
    # nothing in front of the face below the brows' line; the ears out
    r = np.where(ear_mask(p), -10, r)
    return r
