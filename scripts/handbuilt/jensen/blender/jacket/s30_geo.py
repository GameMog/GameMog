# Step 3: garment construction on the draped shell: elbow creases and wrist stacking, padded shoulder panels, the
# centre-front opening for the zip (two fronts), turned leather edges (hem, fronts, cuffs), the stand-up band collar
# and its two snap tabs. Saves geo.blend (objects jk, collar, tabs; collar/tab (s,v) params kept as attributes).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh, numpy as np, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
H = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=H + '/sim.blend')
import lib
from common import *
o = bpy.data.objects['jk']; me = o.data
for g in list(o.vertex_groups): o.vertex_groups.remove(g)
bm = bmesh.new(); bm.from_mesh(me); bm.normal_update(); lay = bm.verts.layers.int.new('lip')
rng = np.random.default_rng(7)
# ---- 0. relax the draped shell (keeps its folds, loses facets), harder round the armpits where the fit pinched
def relax(vs, k, its):
    for it in range(its):
        new = {}
        for v in vs:
            if v.is_boundary: continue
            nb = [e.other_vert(v).co for e in v.link_edges]; c = sum(nb, Vector()) / len(nb)
            d = c - v.co; new[v] = v.co + (d - v.normal * d.dot(v.normal) * 0.35) * k
        for v, c in new.items(): v.co = c
        bm.normal_update()
relax(bm.verts[:], 0.35, 3)
pits = [Vector((s_ * 0.155, -0.04, 1.31)) for s_ in (1, -1)]
near = [v for v in bm.verts if min((v.co - p).length for p in pits) < 0.10]
relax(near, 0.5, 12)
# it3 (owner: "smooth front surfaces", AD: no pec bulge, no pillows, no melted-wax side folds, slight taper, no flare):
# the hem edge snapped level, then the whole torso FAIRED as stiff leather: per height its cross-section is made convex
# (the hull of the draped shell, so no rib or waist hollows and no sim lumps), smoothed up and down, and each column
# round the body hung as a STRAIGHT line from the chest to the hem band (tapering slightly in, never flaring), held
# clear of the body, tee and jeans underneath. Then the centre front/back profile is set exactly (flatten_*).
from mathutils import geometry as _geo
bm.verts.ensure_lookup_table()
def _sleeve(P):
    m = np.zeros(len(P), bool)
    for s_, sg in (('L', 1), ('R', -1)):
        pt, nn = armhole(s_); pt = np.array(pt); nn = np.array(nn)
        A_, B_, C_ = [np.array(q_) for q_ in arm(s_)]
        # it3: also near the arm's own axis (the plane alone took the waist sides for sleeve in the A-pose)
        def _segd(P_, a_, b_):
            ab = b_ - a_; t_ = np.clip((P_ - a_) @ ab / (ab @ ab), 0, 1); return np.linalg.norm(P_ - (a_ + t_[:, None] * ab), axis=1)
        dax = np.minimum(_segd(P, A_ - (B_ - A_) * 0.15, B_), _segd(P, B_, C_ + (C_ - B_) * 0.2))
        m |= ((P - pt) @ nn > 0) & (sg * P[:, 0] > 0.08) & ((dax < 0.095) | (sg * P[:, 0] > 0.215))
    return m
# hem edge level at HEM (the sim lifts and waves it): boundary points below the waist, carried 3 rings in
hemb = [v for v in bm.verts if v.is_boundary and v.co.z < HEM + 0.08 and abs(v.co.x) < 0.26 and not _sleeve(np.array([v.co[:]]))[0]]
dz = {v: HEM - v.co.z for v in hemb}; seen = set(hemb); ring = list(hemb)
for k, f_ in enumerate((0.6, 0.3, 0.1)):
    nxt = []
    for v in ring:
        for e in v.link_edges:
            w_ = e.other_vert(v)
            if w_ in seen: continue
            seen.add(w_); dz[w_] = dz[v] * f_; nxt.append(w_)
    ring = nxt
for v, d_ in dz.items(): v.co.z += d_
print('hem edge levelled: %d points, max %.1f mm' % (len(hemb), max(abs(x) for x in dz.values()) * 1000 if dz else 0))
X = np.array([v.co[:] for v in bm.verts]); SL = _sleeve(X)
TM = (~SL) & (X[:, 2] > HEM - 0.03) & (X[:, 2] < 1.43)
th = np.arctan2(X[:, 0], -(X[:, 1] - YC_T)); r = np.hypot(X[:, 0], X[:, 1] - YC_T)
Z0, DZ, NT = HEM - 0.03, 0.01, 120; NZ = int(round((1.44 - Z0) / DZ)) + 1
zgrid = Z0 + DZ * np.arange(NZ); tgrid = -np.pi + (np.arange(NT) + 0.5) * 2 * np.pi / NT
def envelope(P, mask, pad):
    """max radius per (height, angle) bin of points P (Blender), plus pad; 0 where empty"""
    E = np.zeros((NZ, NT)); P = P[mask]
    if not len(P): return E
    zi = np.clip(np.rint((P[:, 2] - Z0) / DZ).astype(int), 0, NZ - 1); ti = ((np.arctan2(P[:, 0], -(P[:, 1] - YC_T)) + np.pi) / (2 * np.pi) * NT).astype(int) % NT
    np.maximum.at(E, (zi, ti), np.hypot(P[:, 0], P[:, 1] - YC_T) + pad)
    return E
def hull_row(E_row):
    ok = E_row > 0
    if ok.sum() < 12: return None
    pts = [(E_row[i] * math.sin(tgrid[i]), -E_row[i] * math.cos(tgrid[i])) for i in np.nonzero(ok)[0]]
    hi = _geo.convex_hull_2d(pts); hp = [pts[i] for i in hi]; out = np.zeros(NT)
    for i, t_ in enumerate(tgrid):
        d = (math.sin(t_), -math.cos(t_)); best = 0.0
        for k in range(len(hp)):
            a, b = hp[k], hp[(k + 1) % len(hp)]; ex, ey = b[0] - a[0], b[1] - a[1]; den = d[0] * (-ey) - d[1] * (-ex)
            if abs(den) < 1e-12: continue
            tt = (a[0] * (-ey) - a[1] * (-ex)) / den; uu = (d[0] * a[1] - d[1] * a[0]) / den
            if tt > 0 and -1e-6 <= uu <= 1 + 1e-6: best = max(best, tt)
        out[i] = best
    return out
# the shell's own envelope (bins of the draped torso), its convex hull per height
E = envelope(X, TM, 0.0); Rh = np.full((NZ, NT), np.nan)
for i in range(NZ):
    h_ = hull_row(E[i])
    if h_ is not None: Rh[i] = h_
ok = ~np.isnan(Rh[:, 0])
for j in range(NT): Rh[:, j] = np.interp(zgrid, zgrid[ok], Rh[ok, j])
def gsm(A, sz, st):
    k = np.arange(-4, 5); A = A.copy()
    if sz > 0:
        w = np.exp(-(k / sz) ** 2 / 2); w /= w.sum(); P_ = np.pad(A, ((4, 4), (0, 0)), mode='edge'); A = sum(P_[4 + kk:4 + kk + NZ] * ww for kk, ww in zip(k, w))
    if st > 0:
        w = np.exp(-(k / st) ** 2 / 2); w /= w.sum(); A = sum(np.roll(A, kk, 1) * ww for kk, ww in zip(k, w))
    return A
Rs = gsm(Rh, 1.5, 1.5)
# what lies underneath: the body (bind, the full rebuilt skin), the tee and the jeans; the jacket held clear of them
FB = lib.g2b(np.load(lib.D + 'fullbody.npz')['pos']); FBm = (~_sleeve(FB)) & (FB[:, 2] > Z0) & (FB[:, 2] < 1.44)
UND = envelope(FB, FBm, 0.010)
for pid_, pad in (('p12', 0.0075), ('p13', 0.004), ('p15', 0.004)):
    pp = lib.rd(pid_, 'pos', 'Float32Array'); ii = lib.rd(pid_, 'idx', 'Uint16Array')
    if pp is None: continue
    PP_ = lib.g2b(pp)[np.unique(ii)] if ii is not None else lib.g2b(pp)
    if pid_ == 'p13': PP_ = PP_[PP_[:, 2] > 1.05]   # the tee's flared hem is removed under the jacket (assembler: teeunder)
    UND = np.maximum(UND, envelope(PP_, (~_sleeve(PP_)) & (PP_[:, 2] > Z0) & (PP_[:, 2] < 1.44), pad))
UND = np.maximum(UND, np.maximum(np.roll(UND, 1, 1), np.roll(UND, -1, 1)))
UND[1:] = np.maximum(UND[1:], UND[:-1] * 0.5 + UND[1:] * 0.5)
# straight columns: from the band (zb) up to the chest (zc: 1.22 at the sides, under the armpits; 1.32 at the front and
# back, so the chest does not bulge out of the line); the hem end 1.5% in from the chest (a slight taper)
zb = HEM + BAND; RF = Rs.copy()
side_s = np.clip((np.abs(np.sin(tgrid)) - 0.45) / 0.35, 0, 1)
for j in range(NT):
    zc = 1.32 - 0.10 * side_s[j]
    ib = int(np.argmin(np.abs(zgrid - zb))); ic = int(np.argmin(np.abs(zgrid - zc)))
    top = Rs[ic, j]
    tap = lambda i: 1 - 0.015 * (1 - np.clip((zgrid[i] - zgrid[ib]) / (zgrid[ic] - zgrid[ib]), 0, 1))
    # it3: the column's top is raised so the line clears what is under it all the way down (the hips): the sides
    # hang straight or taper in, never step out at the hem (no flare)
    top = max(top, max(UND[i, j] / tap(i) for i in range(0, ic + 1)))
    for i in range(0, ic + 1): RF[i, j] = top * tap(i)
RF = np.maximum(RF, np.where(UND > 0, UND, 0))
RF = gsm(RF, 1.0, 1.2); RF = np.maximum(RF, np.where(UND > 0, UND, 0))
# weight: full below the chest, fading out toward the armholes (sides) and the yoke/neck (front, back)
def wfun(zz, tt):
    s_ = np.clip((np.abs(np.sin(tt)) - 0.45) / 0.35, 0, 1); ztop = 1.40 * (1 - s_) + 1.31 * s_
    return np.clip((ztop - zz) / 0.07, 0, 1)
def bil(A, zz, tt):
    fi = np.clip((zz - Z0) / DZ, 0, NZ - 1.001); i0 = np.floor(fi).astype(int); a = fi - i0
    fj = (tt + np.pi) / (2 * np.pi) * NT - 0.5; j0 = np.floor(fj).astype(int); b = fj - j0; j0 %= NT; j1 = (j0 + 1) % NT
    return (A[i0, j0] * (1 - a) * (1 - b) + A[i0 + 1, j0] * a * (1 - b) + A[i0, j1] * (1 - a) * b + A[i0 + 1, j1] * a * b)
w_ = wfun(X[:, 2], th) * TM * np.clip((0.215 - np.abs(X[:, 0])) / 0.025, 0, 1)
rn = r + w_ * (bil(RF, X[:, 2], th) - r)
X2 = X.copy(); X2[:, 0] = rn * np.sin(th); X2[:, 1] = YC_T - rn * np.cos(th)
for v, p_ in zip(bm.verts, X2): v.co = Vector(p_)
print('torso faired: %d points, mean move %.1f mm, max %.1f mm' % ((w_ > 0).sum(), np.abs(rn - r)[w_ > 0].mean() * 1000, np.abs(rn - r).max() * 1000))
# the seam between faired and draped (armpits, yoke) relaxed a little so no ridge shows
tz = [v for v, ww in zip(bm.verts, w_) if 0.02 < ww < 0.98 or (ww > 0 and ww < 0.98)]
relax(tz, 0.4, 6)
# it2: the centre profile front and back set exactly to the plane
Xa = np.array([v.co[:] for v in bm.verts]); Xb = flatten_back(flatten_front(Xa))
for v, p in zip(bm.verts, Xb): v.co = Vector(p)
bm.normal_update()

# ---- v3: a TAPERED, fitted torso (it3 hung every column straight from the widest point of the hips, so the torso was
# 3.5-5.5 cm per side off the waist: boxy). Target half-widths (Blender |x|, m) per height: snug on the hips at the
# hem band, ~2.4 cm off the body at the waist, opening back to the chest under the arms. Measured it3: 0.191-0.194.
TW_Z = np.array([0.920, 0.935, 0.985, 1.050, 1.100, 1.160, 1.200, 1.240])
TW_W = np.array([0.188, 0.187, 0.184, 0.173, 0.168, 0.171, 0.178, 0.190])
Xc = np.array([v.co[:] for v in bm.verts])
tor = TM & (w_ > 0.3)
zb_ = np.arange(HEM - 0.02, 1.26, 0.01); Wc = np.full(len(zb_), np.nan)
for i_, z_ in enumerate(zb_):
    s_ = tor & (np.abs(Xc[:, 2] - z_) < 0.006)
    if s_.sum() > 5: Wc[i_] = np.abs(Xc[s_, 0]).max()
ok_ = ~np.isnan(Wc); Wc = np.interp(zb_, zb_[ok_], Wc[ok_])
sc_ = np.clip(np.interp(zb_, TW_Z, TW_W) / Wc, 0.82, 1.0)
sc_ = np.where(zb_ > 1.20, sc_ + (1 - sc_) * np.clip((zb_ - 1.20) / 0.05, 0, 1), sc_)
for it in range(2): sc_[1:-1] = sc_[1:-1] * 0.5 + (sc_[:-2] + sc_[2:]) * 0.25
wt_ = np.clip(w_ * 1.4, 0, 1) * TM
f_ = 1 - (1 - np.interp(Xc[:, 2], zb_, sc_)) * wt_
Xc[:, 0] *= f_
# held clear of what is underneath (body + 1 cm, tee, jeans), radially from the torso axis
th2 = np.arctan2(Xc[:, 0], -(Xc[:, 1] - YC_T)); r2 = np.hypot(Xc[:, 0], Xc[:, 1] - YC_T)
need = bil(UND, np.clip(Xc[:, 2], Z0, Z0 + DZ * (NZ - 1.01)), th2) + 0.002
push = (wt_ > 0) & (r2 < need) & (need > 0.05)
r2[push] = need[push]
Xc[:, 0] = np.where(wt_ > 0, r2 * np.sin(th2), Xc[:, 0]); Xc[:, 1] = np.where(wt_ > 0, YC_T - r2 * np.cos(th2), Xc[:, 1])
print('v3 taper: half-width at 0.94/1.10/1.20 was %.3f/%.3f/%.3f, scale %.3f/%.3f/%.3f, %d pushed clear' % (
    np.interp(0.94, zb_, Wc), np.interp(1.10, zb_, Wc), np.interp(1.20, zb_, Wc), np.interp(0.94, zb_, sc_), np.interp(1.10, zb_, sc_), np.interp(1.20, zb_, sc_), push.sum()))
# ---- v3: slimmer sleeves. it3 stood ~17-20 mm off the arm all the way down and belled at the cuff; a fitted leather
# sleeve: ~12 mm on the upper arm, 14 at the elbow (bend room), 10 on the forearm, 9 at the cuff. The sim's own fold
# variation is kept (a shrink per length station, not a re-shape); never closer than 5 mm to the arm.
FB_ = lib.g2b(np.load(lib.D + 'fullbody.npz')['pos'])
for s_, sg_ in (('L', 1), ('R', -1)):
    selJ = np.nonzero(SL & (sg_ * Xc[:, 0] > 0))[0]
    selB = np.nonzero(sg_ * FB_[:, 0] > 0.17)[0]
    fj = np.array([arm_frame(s_, Xc[i]) [:3] for i in selJ]); fb = np.array([arm_frame(s_, FB_[i])[:3] for i in selB])
    Lt_ = arm_frame(s_, Xc[selJ[0]])[3]
    NTB, NPB = 26, 12
    tb_ = np.clip((fb[:, 0] / 0.02).astype(int), 0, NTB - 1); pb_ = ((fb[:, 1] + np.pi) / (2 * np.pi) * NPB).astype(int) % NPB
    keep = (fb[:, 0] > -0.01) & (fb[:, 0] < Lt_ + 0.02) & (fb[:, 2] < 0.10)
    RB = np.zeros((NTB, NPB)); np.maximum.at(RB, (tb_[keep], pb_[keep]), fb[keep, 2])
    for j_ in range(NPB):
        okb = RB[:, j_] > 0
        if okb.sum() > 2: RB[:, j_] = np.interp(np.arange(NTB), np.nonzero(okb)[0], RB[okb, j_])
    RB = np.maximum(RB, (np.roll(RB, 1, 1) + np.roll(RB, -1, 1)) * 0.5)
    tj = np.clip((fj[:, 0] / 0.02).astype(int), 0, NTB - 1); pj = ((fj[:, 1] + np.pi) / (2 * np.pi) * NPB).astype(int) % NPB
    rb = RB[tj, pj]; ease = fj[:, 2] - rb
    TT = np.array([0.0, 0.10, 0.20, 0.25, 0.31, Lt_ - 0.07, Lt_ + 0.02]); TE = np.array([0.013, 0.012, 0.013, 0.014, 0.012, 0.010, 0.009])
    shrink = np.zeros(NTB)
    for k_ in range(NTB):
        m_ = tj == k_
        if m_.sum() > 8: shrink[k_] = max(0.0, np.median(ease[m_]) - np.interp(k_ * 0.02 + 0.01, TT, TE))
    for it in range(2): shrink[1:-1] = shrink[1:-1] * 0.5 + (shrink[:-2] + shrink[2:]) * 0.25
    wcap = np.clip((fj[:, 0] - 0.025) / 0.05, 0, 1)
    sh = np.interp(fj[:, 0], np.arange(NTB) * 0.02 + 0.01, shrink) * wcap
    rnew = np.maximum(fj[:, 2] - sh, np.minimum(fj[:, 2], rb + 0.005))
    A_, B_, C_ = arm(s_)
    for n_, i in enumerate(selJ):
        p = Vector(Xc[i]); t, ph, r, L = arm_frame(s_, p)
        if t < (B_ - A_).length: u = (B_ - A_).normalized(); base = A_
        else: u = (C_ - B_).normalized(); base = B_
        foot = base + u * (p - base).dot(u); rv = p - foot
        if rv.length > 1e-6: Xc[i] = (foot + rv.normalized() * rnew[n_])[:]
    print('v3 sleeve %s: median ease before %.1f mm, shrink max %.1f mm' % (s_, np.median(ease) * 1000, shrink.max() * 1000))
# ---- v3: no pec bumps. The front's depth field (forward reach per x column and height) smoothed in height with a
# wide kernel from the waist to the yoke, so the chest flows into the flat front instead of stepping out 8-16 mm
# at 1.26 m; held clear of the body; then the centre profile set to the plane again.
GX = np.arange(-0.20, 0.2001, 0.01); GZ = np.arange(0.96, 1.4401, 0.01)
fr_ = (Xc[:, 1] < -0.02) & (~SL)
Dm = np.full((len(GZ), len(GX)), np.nan)
xi_ = np.rint((Xc[:, 0] - GX[0]) / 0.01).astype(int); zi_ = np.rint((Xc[:, 2] - GZ[0]) / 0.01).astype(int)
okp = fr_ & (xi_ >= 0) & (xi_ < len(GX)) & (zi_ >= 0) & (zi_ < len(GZ))
Dm_ = np.full((len(GZ), len(GX)), -1.0); np.maximum.at(Dm_, (zi_[okp], xi_[okp]), -Xc[okp, 1])
Dm = np.where(Dm_ > 0, Dm_, np.nan)
for j in range(len(GX)):
    o_ = ~np.isnan(Dm[:, j])
    Dm[:, j] = np.interp(GZ, GZ[o_], Dm[o_, j]) if o_.sum() > 3 else 0
# the leather hangs from the chest: below it, each column's forward reach is brought most of the way out to the
# chest's (less a slight taper toward the hem), so the pec no longer steps out of a hollow below it
ch_ = (GZ >= 1.24) & (GZ <= 1.34); Tch = Dm[ch_].max(0)
Tch = np.convolve(np.pad(Tch, 2, mode='edge'), np.ones(5) / 5, mode='valid')
Dt = Dm.copy()
for i, z_ in enumerate(GZ):
    if z_ > 1.34: continue
    tgt = Tch - 0.004 * np.clip((1.30 - z_) / 0.30, 0, 1)
    k_ = 0.8 * np.clip((1.31 - z_) / 0.05, 0, 1) if z_ > 1.26 else 0.8
    Dt[i] = np.maximum(Dm[i], Dm[i] + (tgt - Dm[i]) * k_)
Dd = Dt - Dm
for it in range(3): Dd[1:-1] = Dd[1:-1] * 0.5 + (Dd[:-2] + Dd[2:]) * 0.25
def bil2(A, xx, zz):
    fx = np.clip((xx - GX[0]) / 0.01, 0, len(GX) - 1.001); fz = np.clip((zz - GZ[0]) / 0.01, 0, len(GZ) - 1.001)
    x0 = np.floor(fx).astype(int); z0 = np.floor(fz).astype(int); a = fx - x0; b = fz - z0
    return A[z0, x0] * (1 - a) * (1 - b) + A[z0, x0 + 1] * a * (1 - b) + A[z0 + 1, x0] * (1 - a) * b + A[z0 + 1, x0 + 1] * a * b
phf = np.arctan2(Xc[:, 0], -Xc[:, 1])
wfr = fr_ * np.clip(np.cos(phf), 0, 1) ** 0.7 * np.clip((Xc[:, 2] - (HEM + BAND + 0.005)) / 0.05, 0, 1) * np.clip((1.40 - Xc[:, 2]) / 0.05, 0, 1)
Xc[:, 1] -= bil2(Dd, Xc[:, 0], Xc[:, 2]) * wfr
th3 = np.arctan2(Xc[:, 0], -(Xc[:, 1] - YC_T)); r3 = np.hypot(Xc[:, 0], Xc[:, 1] - YC_T)
need3 = bil(UND, np.clip(Xc[:, 2], Z0, Z0 + DZ * (NZ - 1.01)), th3) + 0.002; p3 = (wfr > 0) & (r3 < need3) & (need3 > 0.05)
r3[p3] = need3[p3]; Xc[:, 0] = np.where(wfr > 0, r3 * np.sin(th3), Xc[:, 0]); Xc[:, 1] = np.where(wfr > 0, YC_T - r3 * np.cos(th3), Xc[:, 1])
Xc = flatten_front(Xc)
print('v3 front hung from the chest: max forward %.1f mm, %d held clear' % (Dd.max() * 1000, p3.sum()))
for v, p in zip(bm.verts, Xc): v.co = Vector(p)
bm.normal_update()
relax([v for v, f in zip(bm.verts, f_) if f < 0.999 and not v.is_boundary], 0.3, 2)
# it2: the hem band clear of the jeans' waistband all round (radially from the hips' axis, 4 mm), so nothing of the
# jeans shows through the band at the back
JP = lib.g2b(lib.rd('p12', 'pos', 'Float32Array')); JI = np.unique(lib.rd('p12', 'idx', 'Uint16Array')); JP = JP[JI]
JP = JP[JP[:, 2] > HEM - 0.03]; YC = -0.02
ja = np.arctan2(JP[:, 0], JP[:, 1] - YC); jr = np.hypot(JP[:, 0], JP[:, 1] - YC)
ZB = np.floor((JP[:, 2] - (HEM - 0.03)) / 0.01).astype(int); AB = np.floor((ja + np.pi) / (2 * np.pi) * 60).astype(int) % 60
RM = np.zeros((20, 60)); np.maximum.at(RM, (np.clip(ZB, 0, 19), AB), jr)
RM = np.maximum(RM, np.maximum(np.roll(RM, 1, 1), np.roll(RM, -1, 1))); RM2 = RM.copy(); RM2[1:] = np.maximum(RM2[1:], RM[:-1]); RM2[:-1] = np.maximum(RM2[:-1], RM[1:])
npush = 0; disp = {}
for v in bm.verts:
    if v.co.z > HEM + 0.17: continue
    zi = int((v.co.z - (HEM - 0.03)) / 0.01)
    if zi < 0 or zi > 19: continue
    a = math.atan2(v.co.x, v.co.y - YC); r = math.hypot(v.co.x, v.co.y - YC); need = RM[zi, int((a + math.pi) / (2 * math.pi) * 60) % 60] + 0.003   # it3: the fairing already clears the jeans; this only catches leftovers
    if RM2[zi].max() > 0 and r < need: disp[v] = need - r
for it in range(3):   # spread the push so the band stays smooth
    nd = {}
    for v in bm.verts:
        if v.co.z > HEM + 0.20: continue
        nb = [disp.get(e.other_vert(v), 0.0) for e in v.link_edges]
        nd[v] = max(disp.get(v, 0.0), sum(nb) / max(1, len(nb)) * 0.8)
    disp = {k: x for k, x in nd.items() if x > 1e-5}
for v, dd in disp.items():
    r_ = Vector((v.co.x, v.co.y - YC, 0)); 
    if r_.length > 1e-6: v.co += r_.normalized() * dd; npush += 1
print('hem band pushed clear of the jeans', npush, 'max %.1f mm' % (max(disp.values()) * 1000 if disp else 0))
bm.normal_update()
# it3: the push blended out so it leaves no dent or lump on the band
relax([v for v in bm.verts if v.co.z < HEM + 0.14 and not v.is_boundary and abs(v.co.x) < 0.24], 0.5, 6)
# v3: the hem's bottom edge smoothed in plan along its own loop (the push left it wavy), the rings above follow
hb_ = [v for v in bm.verts if v.is_boundary and v.co.z < HEM + 0.02 and abs(v.co.x) < 0.26]
hbs = set(hb_)
for it in range(25):
    new_ = {}
    for v in hb_:
        nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary and e.other_vert(v) in hbs]
        if len(nb) == 2:
            c_ = (nb[0].co + nb[1].co) * 0.5; new_[v] = Vector((v.co.x * 0.5 + c_.x * 0.5, v.co.y * 0.5 + c_.y * 0.5, v.co.z))
    for v, c_ in new_.items(): v.co = c_
bm.normal_update()
relax([v for v in bm.verts if v.co.z < HEM + 0.06 and not v.is_boundary and abs(v.co.x) < 0.24], 0.5, 6)
# ---- 1. creases (it3): the torso keeps ONLY 2-3 long shallow folds per front panel (stiff leather hanging from the
# chest; no folds at the waist, ribs or under the arms). The sleeves: a few irregular compression folds at the INNER
# elbow only (plain leather, the outer elbow smooth), a light stack above the cuff.
def hat(d, w):  # a soft fold: a rounded ridge with shallow hollows either side
    q = (d / w) ** 2; return (1 - 2 * q) * math.exp(-q)
def seg_dist(px, pz, a, b):
    ax, az = a; bx, bz = b; vx, vz = bx - ax, bz - az; L2 = vx * vx + vz * vz
    t = max(0.0, min(1.0, ((px - ax) * vx + (pz - az) * vz) / L2)); return math.hypot(px - (ax + t * vx), pz - (az + t * vz)), t
FOLDS_F = [((0.138, 1.255), (0.112, 0.995), 0.0011, 0.016), ((0.074, 1.20), (0.066, 1.000), 0.0007, 0.014)]
FOLDS_B = [((0.105, 1.25), (0.094, 1.000), 0.0008, 0.018)]
for v in bm.verts:
    p = v.co; d = 0.0
    for s in ('L', 'R'):
        if (p.x > 0) != (s == 'L') or abs(p.x) < 0.2: continue
        t, ph, r, L = arm_frame(s, p); E = (J['lowerarm01_' + s] - J['upperarm01_' + s]).length
        inner = max(0.0, math.cos(ph)) ** 1.5
        k = math.exp(-((t - E) / 0.055) ** 2)
        # 3 folds, slanted and of uneven depth, fading round to the outer elbow
        # v3: discrete, irregular crescent folds at the inner elbow (it3's sine train read as corrugation), each
        # slanted and fading round the arm; two soft drag folds stacked above the cuff
        sgn_ = 1 if s == 'L' else -1
        for (dt_, amp_, wd_, sl_) in ((-0.040, 0.0018, 0.0065, 0.010), (-0.008, 0.0032, 0.0080, -0.012), (0.026, 0.0026, 0.0070, 0.016), (0.060, 0.0013, 0.0060, -0.006)):
            tc_ = E + dt_ + sl_ * math.sin(ph + 0.4 * sgn_)
            d += amp_ * hat(t - tc_, wd_) * inner
        for (dt_, amp_, wd_, sl_) in ((-0.088, 0.0013, 0.0075, 0.009), (-0.122, 0.0009, 0.0065, -0.007)):
            tc_ = L + dt_ + sl_ * math.sin(2 * ph + 1.0)
            d += amp_ * hat(t - tc_, wd_) * (0.45 + 0.55 * inner)
    if p.z < 1.30 and p.z > HEM + BAND - 0.01 and not _sleeve(np.array([p[:]]))[0]:
        fz = min(1.0, (p.z - (HEM + BAND - 0.01)) / 0.04) * min(1.0, (1.30 - p.z) / 0.05)
        sg = 1 if p.x > 0 else -1
        for (a, b, amp, w) in (FOLDS_F if p.y < -0.02 else FOLDS_B if p.y > 0.02 else []):
            dd, tt = seg_dist(abs(p.x), p.z, a, b)
            if dd < 3 * w: d += amp * hat(dd, w) * math.sin(math.pi * min(1.0, tt * 1.15)) ** 0.7 * fz
    v.co = p + v.normal * d
# ---- 2. padded shoulder panels: an oval over each shoulder cap, puffed 3.5 mm, its edge a sewn step
def shoulder_panel(s):
    A, B, C = arm(s); u = (B - A).normalized(); up = (Vector((0, 0, 1)) - u * u.z).normalized(); w = u.cross(up).normalized()
    c = A + u * 0.03 + up * 0.03 + Vector((0, -0.008, 0))
    return c, u, up, w
def panel_metric(s, p):
    c, u, up, w = shoulder_panel(s); dp = p - c
    m = math.sqrt((dp.dot(u) / 0.095) ** 2 + (dp.dot(w) / 0.078) ** 2)
    return m if dp.dot(up) > -0.035 else 9.0
for v in bm.verts:
    for s in ('L', 'R'):
        if (v.co.x > 0) != (s == 'L'): continue
        m = shoulder_metric(s, v.co)
        if m < 1.08:
            e = min(1.0, max(0.0, (1.08 - m) / 0.16)); e = e * e * (3 - 2 * e)
            v.co += v.normal * 0.0030 * e
bm.normal_update()
# it3: the shell decimated to the hero budget HERE, before the zip opening and the turned edges are built (it2
# decimated in s50, after the edges: collapses along the hem twisted the rolled lip into a torn-looking edge)
bm.to_mesh(me); bm.free(); me.update()
_nt = sum(len(p_.vertices) - 2 for p_ in me.polygons)
for ob_ in bpy.data.objects: ob_.select_set(False)
o.select_set(True); bpy.context.view_layer.objects.active = o
# the open edges (neckline, hem, cuffs) and the ring next to them are kept as they are: a collapse there left a
# jagged neckline peeking out under the collar
_bv = set()
for e_ in me.edges:
    pass
_bmk = bmesh.new(); _bmk.from_mesh(me)
for v_ in _bmk.verts:
    if v_.is_boundary:
        _bv.add(v_.index); _bv.update(e_.other_vert(v_).index for e_ in v_.link_edges)
_bmk.free()
_vg = o.vertex_groups.new(name='keep'); _vg.add(list(range(len(me.vertices))), 0.0, 'REPLACE'); _vg.add(sorted(_bv), 1.0, 'REPLACE')
_md = o.modifiers.new('dec', 'DECIMATE'); _md.decimate_type = 'COLLAPSE'; _md.ratio = min(1.0, 16500 / _nt); _md.use_symmetry = True; _md.symmetry_axis = 'X'
_md.vertex_group = 'keep'; _md.invert_vertex_group = True; _md.vertex_group_factor = 1000.0
bpy.ops.object.modifier_apply(modifier='dec')
o.vertex_groups.remove(o.vertex_groups['keep'])
print('shell decimated (edges kept: %d points)' % len(_bv), _nt, '->', sum(len(p_.vertices) - 2 for p_ in me.polygons))
bm = bmesh.new(); bm.from_mesh(me); bm.normal_update(); lay = bm.verts.layers.int.get('lip') or bm.verts.layers.int.new('lip')
# a light relax after the collapse (keeps the boundary): no faceting on the flat front
relax([v for v in bm.verts if not v.is_boundary], 0.25, 2)
# ---- 3. the centre-front opening: cut at x = 0 on the front, the two fronts drawn apart for the zip chain
front = [f for f in bm.faces if f.calc_center_median().y < -0.02 and abs(f.calc_center_median().x) < 0.05]
fv = set(v for f in front for v in f.verts); fe = set(e for f in front for e in f.edges)
bmesh.ops.bisect_plane(bm, geom=list(fv) + list(fe) + front, plane_co=(0, 0, 0), plane_no=(1, 0, 0), dist=0.0004)
cut = [e for e in bm.edges if all(abs(v.co.x) < 1e-5 and v.co.y < -0.02 for v in e.verts) and len(e.link_faces) == 2]
bmesh.ops.split_edges(bm, edges=cut)
# which side each vertex now belongs to (by its faces), then the fronts moved apart near the edge
for v in bm.verts:
    if abs(v.co.x) < 0.03 and v.co.y < -0.02:
        sx = sum(f.calc_center_median().x for f in v.link_faces)
        sgn = 1 if sx > 0 else -1
        k = max(0.0, 1 - abs(v.co.x) / 0.03); v.co.x += sgn * GAP * (k ** 2 * (3 - 2 * k))
bmesh.ops.dissolve_degenerate(bm, dist=0.0006, edges=bm.edges[:])
bm.normal_update()
# ---- 4. turned edges (it3): the leather rolled under at the hem, the two fronts and the cuffs (not the neckline, the
# collar is sewn there): a round 1.8 mm roll, then a facing on the inside: 1.5 cm at the hem (the stitched hem band),
# 1.2 cm elsewhere. The out-direction t of each edge point is taken square to the edge chain itself (both its edge
# neighbours), so a corner gets the bisector and the roll never twists.
def is_neck(v): return v.co.z > 1.425 and (v.co.x / 0.09) ** 2 + (v.co.y / 0.1) ** 2 < 1.0 and abs(v.co.x) > GAP * 0.6 + 0.0005 or (v.co.z > 1.44 and abs(v.co.x) > 0.0015)
bm.normal_update()
bedges = [e for e in bm.edges if e.is_boundary]
bverts = set(v for e in bedges for v in e.verts)
neckv = set(v for v in bverts if is_neck(v))
lipedges = [e for e in bedges if not (e.verts[0] in neckv and e.verts[1] in neckv)]
lipverts = set(v for e in lipedges for v in e.verts)
RO = 0.0018
LIP = {}
for v in lipverts:
    n = v.normal.copy()
    be = [e for e in v.link_edges if e.is_boundary]
    # tangent along the edge chain, then out = in the surface, square to it, pointing away from the faces
    if len(be) >= 2:
        a_ = be[0].other_vert(v).co; b_ = be[1].other_vert(v).co; tang = (b_ - a_)
    else: tang = be[0].other_vert(v).co - v.co
    tang = (tang - n * tang.dot(n)).normalized()
    t = n.cross(tang).normalized()
    fc = sum((f.calc_center_median() for f in v.link_faces), Vector()) / max(1, len(v.link_faces))
    if (fc - v.co).dot(t) > 0: t = -t
    is_hem = v.co.z < HEM + 0.03 and abs(v.co.x) < 0.26 and not _sleeve(np.array([v.co[:]]))[0]
    depth = HEM_ROLL if is_hem else 0.012
    ro = 0.0027 if is_hem else RO   # v3: the hem's turn is heavier (two layers of leather + the band's stitching): weight in the hem
    rows = [v.co + t * ro * math.sin(a) - n * ro * (1 - math.cos(a)) for a in (math.pi / 4, math.pi / 2, 3 * math.pi / 4, math.pi)]
    rows += [v.co - n * (2 * ro + 0.0002) - t * depth * 0.5, v.co - n * (2 * ro + 0.0004) - t * depth]
    LIP[v] = [bm.verts.new(r_) for r_ in rows]
for e in lipedges:
    a, b = e.verts
    if a not in LIP or b not in LIP: continue
    f0 = e.link_faces[0]
    loop = [l for l in f0.loops if l.edge == e][0]; a, b = (loop.vert, loop.link_loop_next.vert)
    chain_a = [a] + LIP[a]; chain_b = [b] + LIP[b]
    for i in range(len(chain_a) - 1):
        try: bm.faces.new([chain_b[i], chain_a[i], chain_a[i + 1], chain_b[i + 1]])
        except ValueError: pass
lipset = set(x for L in LIP.values() for x in L)
for v in lipset: v[lay] = 1
bm.normal_update()
# the neckline chain, ordered from his left front end round the back to his right front end
nk = [v for v in neckv]
ang = lambda v: math.atan2(v.co.x, -v.co.y)  # 0 centre front, +pi/-pi at back
nk.sort(key=lambda v: (ang(v) if ang(v) > 0 else ang(v) + 2 * math.pi))
chain = [v.co.copy() for v in nk]
bm.to_mesh(me); bm.free(); me.update()
print('jacket', len(me.vertices), 'neck chain', len(chain), 'lip verts', len(lipverts))
# ---- 5. the band collar from the neckline chain: resampled evenly, its front ends square with a rounded top corner
P = np.array([c[:] for c in chain])
seg = np.linalg.norm(np.diff(P, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)]); Ltot = s[-1]
# smooth the chain a little
for it in range(6): P[1:-1] = P[1:-1] * 0.5 + (P[:-2] + P[2:]) * 0.25
def at(sv):
    return np.array([np.interp(sv, s, P[:, k]) for k in range(3)])
# fine columns near the ends (rounded corners), 5 mm elsewhere
cols = list(np.arange(0, 0.012, 0.002)) + list(np.arange(0.012, Ltot - 0.012, 0.005)) + list(Ltot - np.arange(0.012, -0.0001, -0.002))
cols = np.unique(np.clip(cols, 0, Ltot))
RC = 0.008
def height(sv, p):
    fr = np.clip((p[1] + 0.086) / 0.16, 0, 1)   # 0 front, 1 back
    h = COL_H0 + COL_H1 * fr
    d = min(sv, Ltot - sv)
    if d < RC: h -= RC - math.sqrt(max(0.0, RC * RC - (RC - d) ** 2))
    return h
TH = COL_TH
rows_out = np.linspace(0.0, 1.0, 9)
cv = []; cuv = []; grid = []
def frame(p):
    r = Vector((p[0], p[1] - NECK_EY, 0)).normalized(); up = Vector((0, 0, 1)); tilt = math.radians(14)
    d = (up * math.cos(tilt) - r * math.sin(tilt)).normalized(); return r, d
for ci, sv in enumerate(cols):
    p = Vector(at(sv)); r, d = frame(p); h = height(sv, p); col = []
    base = p + r * 0.0022
    for vv in rows_out:  # outer face, bottom (tucked 2.5 mm under the neckline) to top
        q = base + d * (h * vv) - r * 0.0015 * max(0, vv) ** 2; col.append((q, sv, h * vv))
    top = base + d * h - r * 0.0015
    for k in range(1, 5):  # rolled top edge
        a = math.pi * k / 5; q = top + d * (TH / 2) * math.sin(a) - r * (TH / 2) * (1 - math.cos(a)); col.append((q, sv, h + TH / 2 * a))
    for vv in np.linspace(1.0, -0.12, 7):  # inner face back down
        q = base + d * (h * vv) - r * (TH + 0.0015 * max(0, vv) ** 2); col.append((q, sv, h + TH * math.pi / 2 + h * (1 - vv)))
    grid.append(col)
cm_ = bpy.data.meshes.new('collar'); bmc = bmesh.new()
V = [[bmc.verts.new(q) for (q, _, _) in col] for col in grid]
uvl = bmc.loops.layers.uv.new('UV0')
nR = len(grid[0])
for i in range(len(grid) - 1):
    for j in range(nR - 1):
        f = bmc.faces.new([V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]])
        for l, (ii, jj) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
            l[uvl].uv = (grid[ii][jj][1], grid[ii][jj][2])
# end caps (the band's thickness at each front end)
for i in (0, len(grid) - 1):
    for j in range(nR // 2):
        a, b = V[i][j], V[i][nR - 1 - j]; a2, b2 = V[i][j + 1], V[i][nR - 2 - j]
        if a2 == b2 or a2 == b: continue
        try:
            f = bmc.faces.new([a, a2, b2, b] if i == 0 else [b, b2, a2, a])
            for l in f.loops: l[uvl].uv = (-0.02 if i == 0 else Ltot + 0.02, 0.0)
        except ValueError: pass
bmesh.ops.recalc_face_normals(bmc, faces=bmc.faces[:])
bmc.to_mesh(cm_); bmc.free()
col_o = bpy.data.objects.new('collar', cm_); bpy.context.scene.collection.objects.link(col_o)
cm_.polygons.foreach_set('use_smooth', [True] * len(cm_.polygons))
col_o['Ltot'] = float(Ltot)
np.save(H + '/collar_chain.npy', np.stack([np.array([at(sv) for sv in cols]).T[k] for k in range(3)], 1))
np.save(H + '/collar_cols.npy', cols)
print('collar', len(cm_.vertices), 'L', Ltot)
# collar outer surface as a function (s, height) -> point, normal (for the tabs, snaps, zip top)
def collar_pt(sv, hh, off=0.0):
    p = Vector(at(np.clip(sv, 0, Ltot))); r, d = frame(p); base = p + r * 0.0022
    hmax = height(sv, p); vv = hh / hmax if hmax > 0 else 0
    q = base + d * hh - r * 0.0015 * max(0, vv) ** 2
    return q + r * off, r
# ---- 6. snap tabs. A: on his right side of the band, near the front; B: on his left, at the collar's foot on the chest
jb = bmesh.new(); jb.from_mesh(me); jb.normal_update(); jbvh = BVHTree.FromBMesh(jb)
def rrect(w, h, rad, n_c=5):
    pts = []
    for cx, cy, a0 in [(w / 2 - rad, h / 2 - rad, 0), (-w / 2 + rad, h / 2 - rad, 90), (-w / 2 + rad, -h / 2 + rad, 180), (w / 2 - rad, -h / 2 + rad, 270)]:
        for k in range(n_c + 1):
            a = math.radians(a0 + 90 * k / n_c); pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    return pts
tb = bmesh.new(); tuv = tb.loops.layers.uv.new('UV0'); snaps = []
def slab(place, w, h, rad, th, uvoff):
    """place(x, y, off) -> (point, normal); builds a rounded-rect leather tab 'th' thick with rounded edge"""
    outline = rrect(w, h, rad)
    rings = []
    prof = [(0.0, 0.0), (0.0006, th * 0.25), (0.0009, th * 0.6), (0.0005, th * 0.95), (0.0, th)]  # inset, height
    for (ins, z) in prof:
        sc_x = (w / 2 - ins) / (w / 2); sc_y = (h / 2 - ins) / (h / 2)
        rings.append([tb.verts.new(place(x * sc_x, y * sc_y, z)[0]) for (x, y) in outline])
    for k in range(len(rings) - 1):
        A_, B_ = rings[k], rings[k + 1]; n = len(A_)
        for i in range(n):
            f = tb.faces.new([A_[i], A_[(i + 1) % n], B_[(i + 1) % n], B_[i]])
            for l, (xx, yy) in zip(f.loops, [outline[i], outline[(i + 1) % n], outline[(i + 1) % n], outline[i]]):
                l[tuv].uv = (uvoff[0] + xx, uvoff[1] + yy)
    ctr = tb.verts.new(place(0, 0, th)[0]); n = len(rings[-1])
    for i in range(n):
        f = tb.faces.new([rings[-1][i], rings[-1][(i + 1) % n], ctr])
        for l, (xx, yy) in zip(f.loops, [outline[i], outline[(i + 1) % n], (0, 0)]): l[tuv].uv = (uvoff[0] + xx, uvoff[1] + yy)
# tab A on the band, his right side (the chain's far end is his right front)
sA0 = Ltot - 0.041;   # v3: 5 mm further back, clear of the collar's rounded front corner (it3 crumpled there)
TABY = COL_H0 * 0.5 + 0.001
def placeA(x, y, z):
    q, r = collar_pt(sA0 - x, TABY + y, 0.0005 + z); return q, r
slab(placeA, TAB_W, TAB_H, 0.0065, 0.0022, (10.0, 0.0))
for x in (-0.0085, 0.0085):
    q, r = placeA(x, 0, 0.0022); snaps.append((q, r))
# it2: tab B mirrors tab A on his left side of the band (it1 had it floating on the chest)
sB0 = 0.041
def placeB(x, y, z):
    q, r = collar_pt(sB0 + x, TABY + y, 0.0005 + z); return q, r
slab(placeB, TAB_W, TAB_H, 0.0065, 0.0022, (12.0, 0.0))
for x in (-0.0085, 0.0085):
    q, r = placeB(x, 0, 0.0022); snaps.append((q, r))
tbm = bpy.data.meshes.new('tabs'); bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:]); tb.to_mesh(tbm); tb.free()
tabs = bpy.data.objects.new('tabs', tbm); bpy.context.scene.collection.objects.link(tabs); tbm.polygons.foreach_set('use_smooth', [True] * len(tbm.polygons))
np.save(H + '/snaps.npy', np.array([list(q) + list(n) for q, n in snaps]))
# zip top: where the chain meets the collar top at centre front
zt = [collar_pt(0.0, height(0.0, Vector(at(0.0))) - 0.002)[0], collar_pt(Ltot, height(Ltot, Vector(at(Ltot))) - 0.002)[0]]
np.save(H + '/ziptop.npy', np.array([list(z) for z in zt]))
jb.free()
bpy.ops.wm.save_as_mainfile(filepath=H + '/geo.blend')
print('done')
