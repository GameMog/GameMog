# the groom: guide strands over the scalp (glTF bind space). Each guide is one card's spine (and a clump of curves in the
# Blender preview). Out: work/groom.npz  pts (G,K,3), nrm (G,K,3) outward volume normals, hgt (G,K) height/H, w, u, kind
import numpy as np, json, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from scalp import Scalp, region, sph, hairline, HC
R = os.path.join(os.path.dirname(__file__), '..')
PR = json.load(open(sys.argv[1] if len(sys.argv) > 1 else f'{R}/params.json'))
OUT = sys.argv[2] if len(sys.argv) > 2 else f'{R}/work/groom.npz'
sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))

def envelope(p):
    """the hair's thickness over the scalp at surface points p (metres)"""
    H = PR['H']; phi, th = sph(p); ap = np.abs(phi); r = th - hairline(ap)
    top = sm(5, 45, th)                                  # 0 on the sides, 1 over the top
    back = sm(115, 165, ap)
    low = 1 - sm(0, 14, r)                               # tight toward the lower hairline (over the ears, nape)
    side = H['side'] * (1 - low) + H['low'] * low
    crown = H['top'] * (1 - back) + H['back'] * back
    h = side * (1 - top) + crown * top
    nape = sm(150, 180, ap) * (1 - sm(-40, -15, th))
    h = h * (1 - nape) + H['nape'] * nape
    # the quiff: a soft ridge just behind the front hairline, falling away to the crown and the temples
    q = (1 - sm(0, H['quiffPhi'], ap)) * sm(0, H['quiffTh0'], r) * (1 - sm(H['quiffTh0'], H['quiffTh0'] + H['quiffTh1'], r))
    up = H.get('upper', 0) * sm(2, 22, th) * (1 - sm(35, 62, th)) * sm(35, 75, ap) * (1 - sm(125, 165, ap))
    return h + H['quiff'] * q + up

def length(p):
    L = PR['L']; phi, th = sph(p); ap = np.abs(phi); r = th - hairline(ap)
    front = (1 - sm(20, 60, ap)) * (1 - sm(10, 40, r))
    top = sm(10, 40, th)
    back = sm(110, 160, ap)
    l = L['side'] * (1 - top) + (L['top'] * (1 - back) + L['crown'] * back) * top
    l = l * (1 - back * (1 - top)) + L['back'] * back * (1 - top)
    nape = sm(150, 180, ap) * (1 - sm(-40, -10, th)); l = l * (1 - nape) + L['nape'] * nape
    return l * (1 - front) + L['front'] * front

def flow(p, n):
    phi, th = sph(p); ap = np.abs(phi)
    g = np.zeros_like(p); g[:, 2] = -1
    g[:, 1] += PR['sideUp'] * sm(40, 90, ap) * (1 - sm(110, 150, ap)) * (1 - sm(20, 45, th))
    down = sm(105, 160, ap) * (1 - sm(25, 55, th))
    g = g * (1 - down[:, None]) + np.array([0, -1, -0.35]) * down[:, None]
    # a touch of outward splay at the temples (the sweep follows the head round)
    g[:, 0] += 0.25 * np.sign(p[:, 0]) * sm(15, 60, ap) * (1 - sm(90, 130, ap))
    t = g - n * (g * n).sum(1, keepdims=True)
    return t / (np.linalg.norm(t, axis=1, keepdims=True) + 1e-9)

TS = PR.get('tousle', {})
_nr = np.random.default_rng(PR['seed'] + 77)
def _field(nf, wl, dim):
    k = _nr.normal(0, 1, (nf, 3)); k /= np.linalg.norm(k, axis=1, keepdims=True); k *= 2 * np.pi / (wl * _nr.uniform(0.7, 1.4, (nf, 1)))
    ph = _nr.uniform(0, 6.283, nf); a = _nr.normal(0, 1, (nf, dim)) / np.sqrt(nf / 2)
    return lambda p: np.sin(p @ k.T + ph) @ a
FDIR = _field(24, TS.get('dirWL', 0.045), 3); FHGT = _field(24, TS.get('hgtWL', 0.035), 1); FFINE = _field(24, TS.get('fineWL', 0.014), 3)

def grow(sc, roots, u, Lmul, rng, kind):
    K = PR['segs'] + 1; G = len(roots)
    q, n = sc.project(roots)
    L = length(q) * Lmul; H0 = envelope(q)
    phi, th = sph(q); r0 = th - hairline(np.abs(phi))
    # front strands lift off the forehead over a longer run
    fr = (1 - sm(25, 60, np.abs(phi))) * (1 - sm(4, 14, r0))
    Lr = PR['rise']['base'] * (1 - fr) + PR['rise']['front'] * fr
    pts = np.zeros((G, K, 3)); nr = np.zeros((G, K, 3)); hg = np.zeros((G, K))
    jit = rng.normal(0, PR['jit'], (G, 3))
    arc = np.zeros(G); fl = rng.uniform(0, 1, G) ** 2
    for k in range(K):
        H = envelope(q)
        s = k / (K - 1)
        rise = sm(0, 1, arc / Lr)
        tuck = 1 - PR['tuck'] * sm(1 - PR['tuckLen'], 1, s)
        h = np.maximum(0.0016, u * H * rise * tuck) if kind != 'line' else np.clip(u * H * sm(0, 1, arc / 0.01) * (0.5 + 0.5 * s), 0.0005, 0.0022)
        if kind != 'line':
            bump = 1 + TS.get('hgt', 0) * FHGT(roots)[:, 0]
            flick = TS.get('flick', {}).get(kind, 0) * fl * sm(0.55, 1.0, s) * H
            h = np.maximum(0.0016, h * bump + flick)
        pts[:, k] = q + n * h[:, None]; nr[:, k] = n; hg[:, k] = h / np.maximum(H, 1e-4)
        if k == K - 1: break
        tz = 0.0 if kind == 'line' else 1.0
        d = flow(q, n) + jit + tz * (TS.get('dir', 0) * FDIR(roots) * (0.4 + s) + TS.get('fine', 0) * FFINE(q) * s)
        d -= n * (d * n).sum(1, keepdims=True); d /= np.linalg.norm(d, axis=1, keepdims=True)
        # (a strand slows to a stop at the lower hairline: the back and the nape taper onto the scalp, no fringe over the neck)
        st = np.ones(len(q))
        if kind != 'line':
            p0, t0 = sph(q); st = np.where(((t0 - hairline(np.abs(p0))) > PR.get('stopAt', 1.0)) | (np.abs(p0) < 60), 1.0, 0.1)
        q, n = sc.project(q + d * (L / (K - 1) * st)[:, None])
        arc += L / (K - 1)
    return pts, nr, hg, L

def main():
    rng = np.random.default_rng(PR['seed'])
    sc = Scalp()
    r = region(sc.S)
    out = {k: [] for k in ('pts', 'nrm', 'hgt', 'w', 'u', 'kind', 'L', 'tile')}
    for c in PR['classes']:
        if c['kind'] == 'line':
            cand = np.where((r > c['band'][0]) & (r < c['band'][1]))[0]
            phc, _ = sph(sc.S[cand]); cand = cand[(np.abs(phc) > 45) | (rng.random(len(cand)) > c.get('frontThin', 0))]
        elif c.get('frontOnly'):
            phh, _ = sph(sc.S); cand = np.where((r > 0.3) & (r < 9) & (np.abs(phh) < 58))[0]
        elif c.get('sideOnly'):
            _, thh = sph(sc.S); cand = np.where((r > 1.0) & (thh < 28))[0]
        else:
            cand = np.where(r > 0.4)[0]
        idx = rng.choice(cand, c['n'], replace=False)
        roots = sc.S[idx]
        u = rng.uniform(*c['u'], c['n'])
        if c['kind'] == 'line':
            q, _ = sc.project(roots); base = length(q); Lmul = rng.uniform(*c['Labs'], c['n']) / base
        else:
            Lmul = rng.uniform(*c['L'], c['n'])
        P, N, Hh, L = grow(sc, roots, u, Lmul, rng, c['kind'])
        out['pts'].append(P); out['nrm'].append(N); out['hgt'].append(Hh); out['L'].append(L)
        out['w'].append(rng.uniform(*c['w'], c['n'])); out['u'].append(u); out['kind'] += [c['kind']] * c['n']; out['tile'] += [c['tiles']] * c['n']
        print(c['kind'], c['n'], 'L mean %.3f' % L.mean(), 'max h %.4f' % (np.linalg.norm(P - sc.project(P.reshape(-1, 3))[0].reshape(P.shape), axis=2).max()))
    np.savez(OUT, pts=np.concatenate(out['pts']).astype(np.float32), nrm=np.concatenate(out['nrm']).astype(np.float32),
             hgt=np.concatenate(out['hgt']).astype(np.float32), w=np.concatenate(out['w']).astype(np.float32),
             u=np.concatenate(out['u']).astype(np.float32), L=np.concatenate(out['L']).astype(np.float32),
             kind=np.array(out['kind']), tile=np.array(out['tile']))
    # the envelope's peak for the record
    S = sc.S[r > 0]; H = envelope(S); i = np.argmax(H); print('envelope max %.4f at' % H.max(), S[i], 'region area cm2 %.0f' % (sc.area * (r > 0).mean() * 1e4))

if __name__ == '__main__': main()
