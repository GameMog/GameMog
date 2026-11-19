# Shared design constants for Jensen's moto jacket (Blender space: Z up, he faces -Y, his left is +X).
import math, numpy as np
from mathutils import Vector
import lib
J = {j['name']: Vector(lib.g2b(j['bind'])[0]) for j in lib.JOINTS}
HEM = 0.935           # it2: 2.7 cm lower, the hem band overlaps the jeans' waistband (it1 0.962 left a band of tee)
GAP = 0.0055   # it3 (was 4 mm): the roll stands back so chain + a line of tape show
GAP_it2 = 0.0040          # half the front opening the zip chain sits in (tape shows ~8 mm in all)
YOKE_F = 1.372        # chest yoke seam height (front)
YOKE_B = 1.385        # back yoke seam
BAND = 0.05           # hem band height
CUFF = 0.065          # cuff band length
SIDE_PHI = math.radians(104)  # side seam: angle round the body from centre front
NECK_EY = 0.0
def phi(p):  # angle round the body's vertical axis, 0 at centre front, + toward his left
    return math.atan2(p[0], -(p[1] - 0.0))
def arm(s):
    A, B, C = J['upperarm01_' + s], J['lowerarm01_' + s], J['wrist_' + s]
    return A, B, C
def armhole(s):
    """plane (point, normal) splitting sleeve from body"""
    A, B, C = arm(s); u = (B - A).normalized(); sh = J['shoulder01_' + s]
    pt = A - u * 0.012
    n = (u + Vector((0, 0, 0.35))).normalized()  # tipped so the armhole runs high on the shoulder, low in the pit
    return pt, n
def arm_frame(s, p):
    """(segment, t along arm from shoulder in m, phi round the arm, radius) of point p"""
    A, B, C = arm(s); p = Vector(p)
    u1 = (B - A); L1 = u1.length; u1 /= L1; u2 = (C - B); L2 = u2.length; u2 /= L2
    t1 = (p - A).dot(u1)
    if t1 < L1: u, base, t = u1, A, t1
    else: u, base, t = u2, B, L1 + (p - B).dot(u2)
    # a reference direction: forward (-Y) made square to the axis
    f = Vector((0, -1, 0)); f = (f - u * f.dot(u)).normalized(); g = u.cross(f)
    r = p - (base + u * ((p - base).dot(u)))
    return t, math.atan2(r.dot(g), r.dot(f)) * (1 if s == 'L' else -1), r.length, L1 + L2

# ---- it2 design constants
COL_H0, COL_H1 = 0.034, 0.006     # band collar height at the front / extra at the back (it1 0.040 / 0.007: 15% lower)
COL_TH = 0.0024                   # collar thickness (it1 0.0034: a thin band)
TAB_W, TAB_H = 0.040, 0.015       # collar snap tabs
SNAP_R = 0.0040                   # snap cap radius (it1 0.0058)
# front plane: the jacket's front, seen from the side, one flat plane from the chest to the hem band, tapering 2 mm
# back toward the hem; the hem band tucked 4 mm more so it hugs the hips (Blender: front = -Y)
FRONT_CHEST, FRONT_HEM, BAND_TUCK, CHEST_Z = 0.140, 0.139, 0.003, 1.30   # glTF z of the jeans' waistband front is 0.137
def front_target(z):
    zb = HEM + BAND
    if z >= zb: return -(FRONT_HEM + (FRONT_CHEST - FRONT_HEM) * min(1.0, (z - zb) / (CHEST_Z - zb)))
    return -(FRONT_HEM - BAND_TUCK * min(1.0, (zb - z) / BAND))
def flatten_front(X, strength=1.0, zmax=CHEST_Z + 0.02):
    """X (N,3) numpy, Blender space. Moves the front of the torso so its centre-line profile is the front plane; the
    move is per height, spread round the front by cos(phi), so the cross-section keeps its shape (no bulge, no dent)."""
    X = X.copy(); ph = np.arctan2(X[:, 0], -X[:, 1]); front = (np.abs(ph) < 1.45) & (X[:, 2] < zmax + 0.06) & (X[:, 2] > HEM - 0.02)
    cen = front & (np.abs(X[:, 0]) < 0.035)
    zs = np.arange(HEM - 0.02, zmax + 0.07, 0.01); prof = np.full(len(zs), np.nan)
    for i, z in enumerate(zs):
        s = cen & (np.abs(X[:, 2] - z) < 0.008)
        if s.sum(): prof[i] = X[s, 1].min()
    ok = ~np.isnan(prof); prof = np.interp(zs, zs[ok], prof[ok])
    tgt = np.array([front_target(z) for z in zs]); d = tgt - prof
    wz = np.clip((zmax + 0.06 - zs) / 0.06, 0, 1); d *= wz
    for it in range(2): d[1:-1] = d[1:-1] * 0.5 + (d[:-2] + d[2:]) * 0.25
    w = np.clip(np.cos(ph), 0, 1) ** 0.6 * front
    X[:, 1] += np.interp(X[:, 2], zs, d) * w * strength
    return X
# padded, quilted shoulder panels (it2: bigger, over the shoulder top and down the upper arm)
# it3: the quilting only on the shoulder cap and the top of the sleeve (it2's 12.5 cm ran down the arm like armour)
SHP_ALONG, SHP_AROUND, SHP_OFF = 0.080, 0.086, 0.012
def shoulder_frame(s):
    A, B, C = arm(s); u = (B - A).normalized(); up = (Vector((0, 0, 1)) - u * u.z).normalized(); w = u.cross(up).normalized()
    c = A + u * SHP_OFF + up * 0.03 + Vector((0, -0.006, 0))
    return c, u, up, w
def shoulder_metric(s, p):
    c, u, up, w = shoulder_frame(s); dp = Vector(p) - c
    if dp.dot(up) < -0.03: return 9.0
    return math.sqrt((dp.dot(u) / SHP_ALONG) ** 2 + (dp.dot(w) / SHP_AROUND) ** 2)
# princess seams (front, back): |x| of the seam line as a function of height, from the yoke to the hem band
def princess_x(z, front=True):
    zb = HEM + BAND
    if front: return 0.126 + 0.018 * np.clip((YOKE_F - z) / (YOKE_F - zb), 0, 1)
    return 0.092 + 0.010 * np.clip((YOKE_B - z) / (YOKE_B - zb), 0, 1)
POCKETS = {'chest': ((0.030, 0, 1.300), (0.110, 0, 1.311)), 'handL': ((0.074, 0, 1.020), (0.118, 0, 1.145)), 'handR': ((-0.074, 0, 1.020), (-0.118, 0, 1.145))}
# it2b: the back too hangs as one plane from the shoulder blades to the band (no seat/lumbar bulge, which showed as a
# hump when seated): glTF z -0.131 at y 1.30 to -0.124 above the band, the band 4 mm more (then cleared of the jeans)
BACK_TOP, BACK_HEM, BACK_TUCK = 0.131, 0.113, 0.004   # v3: the back tapers in to the band (it3 0.124: 5.6 cm off the lumbar, boxy in profile)
def back_target(z):
    zb = HEM + BAND
    if z >= zb: return BACK_HEM + (BACK_TOP - BACK_HEM) * min(1.0, (z - zb) / (CHEST_Z - zb))
    return BACK_HEM - BACK_TUCK * min(1.0, (zb - z) / BAND)
def flatten_back(X, strength=1.0, zmax=CHEST_Z):
    X = X.copy(); ph = np.arctan2(X[:, 0], X[:, 1]); back = (np.abs(ph) < 1.45) & (X[:, 2] < zmax + 0.06) & (X[:, 2] > HEM - 0.02)
    cen = back & (np.abs(X[:, 0]) < 0.035)
    zs = np.arange(HEM - 0.02, zmax + 0.07, 0.01); prof = np.full(len(zs), np.nan)
    for i, z in enumerate(zs):
        s = cen & (np.abs(X[:, 2] - z) < 0.008)
        if s.sum(): prof[i] = X[s, 1].max()
    ok = ~np.isnan(prof); prof = np.interp(zs, zs[ok], prof[ok])
    tgt = np.array([back_target(z) for z in zs]); d = tgt - prof
    d *= np.clip((zmax + 0.06 - zs) / 0.06, 0, 1)
    for it in range(2): d[1:-1] = d[1:-1] * 0.5 + (d[:-2] + d[2:]) * 0.25
    w = np.clip(np.cos(ph), 0, 1) ** 0.6 * back
    X[:, 1] += np.interp(X[:, 2], zs, d) * w * strength
    return X

# ---- it3: the rolled hem (1.5 cm turned band, stitched), the torso fairing
HEM_ROLL = 0.015      # the hem turned under 1.5 cm, topstitched ~1 cm above the edge
YC_T = -0.003         # torso axis (Blender y) for the radial fairing
