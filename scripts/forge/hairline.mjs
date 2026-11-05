// THE CHARACTER FORGE (H5, 4 Nov 2026): hair that reads as hair. Jane's hair2 (MogCity .scratch/polish/leftovers/jane,
// our own build) carried into the library for every card cut, and the pieces Mr. Big's head and beard are made of for
// the short ones:
//   strandField     a strand height for a card texture: the source's own strand direction (a structure tensor of its
//                   lightness, so the pack's radial crowns, curls and long falls each keep theirs) and noise smeared along
//                   it (a line integral convolution, two scales: single strands and the clumps they lie in)
//   cardHairTex     the card hair's texture from it: the strands on the hair's ramp over the source's own light and shade,
//                   the cards' cut-out edges broken into strand ends, and the hairline's last 1.4 cm thinned to single
//                   strands, each stopping at its own distance from the forehead (Jane's front edge), and its normal map
//   hairlineDist    each hair point's distance to the bare forehead and temples (skin no hair card lies over within
//                   3 cm along its normal): what the texture thins by and the front edge is laid down by
// Pure JS (the browser forge bundles it).
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 0xffff) / 65535; };

// a box blur (separable, r px, 3 passes ~ gaussian) of a float field, clamped at the edges
function blur(F, W, H, r) {
  let a = Float32Array.from(F), b = new Float32Array(W * H);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) { let s = 0; const row = y * W; for (let x = -r; x <= r; x++) s += a[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) { b[row + x] = s / (2 * r + 1); s += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; } }
  }
  return a;
}

// the strands' direction per texel (unit [dx, dy]) from the lightness L (W x H, 0..1): the structure tensor smoothed over
// ~r px; where it is not coherent (flat paint, the margins) it leans to the texture's v (the pack's falls run down it)
export function strandDirs(L, W, H, r = 10) {
  const gxx = new Float32Array(W * H), gyy = new Float32Array(W * H), gxy = new Float32Array(W * H), at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1), i = y * W + x; gxx[i] = gx * gx; gyy[i] = gy * gy; gxy[i] = gx * gy; }
  const A = blur(gxx, W, H, r), B = blur(gyy, W, H, r), C = blur(gxy, W, H, r), D = new Float32Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    // (the gradient's main axis at th; the strands run across it)
    const th = 0.5 * Math.atan2(2 * C[i], A[i] - B[i]), tr = A[i] + B[i], coh = tr > 1e-9 ? Math.sqrt((A[i] - B[i]) ** 2 + 4 * C[i] * C[i]) / tr : 0;
    let dx = -Math.sin(th), dy = Math.cos(th); if (dy < 0) { dx = -dx; dy = -dy; }
    const k = sm(0.08, 0.35, coh); dx *= k; dy = dy * k + (1 - k); const l = Math.hypot(dx, dy) || 1; D[i * 2] = dx / l; D[i * 2 + 1] = dy / l;
  }
  return D;
}

// noise smeared along the directions D: each texel the mean of the noise N along its streamline, len px either way
// (the direction's sign carried step to step, so a streamline never folds back)
export function lic(N, D, W, H, len) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = N[y * W + x], n = 1;
    for (const sg of [1, -1]) { let px = x + 0.5, py = y + 0.5, pdx = 0, pdy = sg;
      for (let k = 0; k < len; k++) { const ix = Math.floor(px), iy = Math.floor(py); if (ix < 0 || iy < 0 || ix >= W || iy >= H) break; const j = iy * W + ix;
        let dx = D[j * 2], dy = D[j * 2 + 1]; if (dx * pdx + dy * pdy < 0) { dx = -dx; dy = -dy; } pdx = dx; pdy = dy; px += dx; py += dy;
        const jx = Math.floor(px), jy = Math.floor(py); if (jx < 0 || jy < 0 || jx >= W || jy >= H) break; s += N[jy * W + jx]; n++; } }
    out[y * W + x] = s / n; }
  return out;
}

// the strand height (0..1) of a W x H card texture with lightness L: fine single strands (white noise smeared 14 px),
// the clumps they lie in (a coarser noise smeared 30 px), both normalised to their own spread
export function strandField(L, W, H, seed = 1) {
  const D = strandDirs(L, W, H, Math.max(4, Math.round(W / 100)));
  const n1 = new Float32Array(W * H), n2 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { n1[y * W + x] = hash(x, y, seed); n2[y * W + x] = hash(x >> 2, y >> 2, seed + 7); }
  const norm = (F) => { let m = 0, v = 0; for (const f of F) m += f; m /= F.length; for (const f of F) v += (f - m) ** 2; const s = Math.sqrt(v / F.length) || 1; return F.map((f) => 0.5 + (f - m) / s * 0.22); };
  const fine = norm(lic(n1, D, W, H, Math.round(W / 70))), clump = norm(lic(n2, D, W, H, Math.round(W / 34)));
  const h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = Math.min(1, Math.max(0, 0.55 * fine[i] + 0.45 * clump[i]));
  return { h, D };
}

// the card hair's texture (RGBA W x H, the source's layout): src RGBA (Uint8), ramp [root, middle, light] sRGB, dmap
// (per texel, the distance to the bare forehead in m; NaN off any card) or null; o { fw (m: the thinned front edge's
// depth), d0 (m: a front point's distance that counts as the edge itself), hl (lighter strands' share), normal (k) }
// returns { rgba, nrm (RGB) }
export function cardHairTex(src, W, H, ramp, dmap, o = {}) {
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const R = ramp.map((c) => c.map(lin)), rampAt = (t) => { t = Math.min(1, Math.max(0, t)) * 2; const k = Math.min(1, Math.floor(t)), f = t - k; return [0, 1, 2].map((c) => R[k][c] + (R[k + 1][c] - R[k][c]) * f); };
  const L = new Float32Array(W * H), A0 = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { L[i] = (0.3 * src[i * 4] + 0.59 * src[i * 4 + 1] + 0.11 * src[i * 4 + 2]) / 255; A0[i] = src[i * 4 + 3] / 255; }
  const Lb = blur(L, W, H, Math.max(2, Math.round(W / 170)));
  const Ls = []; for (let i = 0; i < W * H; i += 5) if (A0[i] > 0.8) Ls.push(Lb[i]); Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.05)] ?? 0, hi = Ls[Math.floor(Ls.length * 0.95)] ?? 1;
  const { h } = strandField(L, W, H, o.seed ?? 3);
  const fw = o.fw ?? 0.014, d0 = o.d0 ?? 0.002, hlK = o.hl ?? 0.35, rgba = new Uint8Array(W * H * 4); let edge = 0;
  for (let i = 0; i < W * H; i++) {
    const Ln = Math.min(1, Math.max(0, (Lb[i] - lo) / Math.max(1e-3, hi - lo))), hh = h[i];
    // (the tone: the source's light and shade (its broad paint) under the strands, the strands' own height over it; a
    // few lighter strands (their clump high) toward the ramp's light)
    const hl = sm(0.68, 0.86, hh) * hlK;
    const t = 0.1 + 0.42 * Ln + 0.62 * (hh - 0.5) + hl * 0.35;
    const c = rampAt(t);
    // (the cut-out: the cards' own soft borders broken into strand ends (a strand passes as far as its height carries it))
    let a = A0[i]; if (a > 0.02 && a < 0.98) a = sm(0.15, 0.85, a + (hh - 0.5) * 0.9);
    // (the front edge thinned to single strands: a strand stays as near the bare forehead as its own height lets it)
    const d = dmap ? dmap[i] : NaN;
    if (!isNaN(d) && d - d0 < fw) { const ff = sm(0, fw, d - d0), th = 0.82 * Math.pow(1 - ff, 0.8); a *= sm(th - 0.06, th + 0.06, hh); edge++; }
    for (let k = 0; k < 3; k++) rgba[i * 4 + k] = enc(c[k]); rgba[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, a)));
  }
  // (the clear texels take the nearest strand's colour along the row, so the mips don't bleed the background in)
  for (let y = 0; y < H; y++) { let last = null; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (rgba[i + 3] > 8) last = i; else if (last != null) { rgba[i] = rgba[last]; rgba[i + 1] = rgba[last + 1]; rgba[i + 2] = rgba[last + 2]; } } }
  // (the normal map: the strands raised, the gaps between them sunk (Jane's: k 2.2))
  const nk = o.normal ?? 2.2, nrm = new Uint8Array(W * H * 3), at = (x, y) => h[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (at(x + 1, y) - at(x - 1, y)) * nk, dy = (at(x, y + 1) - at(x, y - 1)) * nk, l = Math.hypot(dx, dy, 1), i = (y * W + x) * 3;
    nrm[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); nrm[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); nrm[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return { rgba, nrm, edge };
}

// each hair point's distance (m) to the bare forehead and temples. skin { P, N (int8 x3), V (head points in the band:
// the forehead and temples, in front of the ears, from the brows up) }; hair { P, T (triangles) }; returns
// { dE (Float32Array per hair point, 9 where far), bare (count) }. A skin point is bare when no hair triangle lies over
// it within 3 cm along its normal (Jane's scalp2 test)
export function hairlineDist(skin, hair, hv) {
  const { P: SP, N: SN, V } = skin, { P: HP, T } = hair, nT = T.length / 3;
  const TC = new Float32Array(nT * 3); for (let q = 0; q < nT; q++) for (let c = 0; c < 3; c++) TC[q * 3 + c] = (HP[T[q * 3] * 3 + c] + HP[T[q * 3 + 1] * 3 + c] + HP[T[q * 3 + 2] * 3 + c]) / 3;
  const hit = (p, n, R) => { for (let q = 0; q < nT; q++) { const dx = TC[q * 3] - p[0], dy = TC[q * 3 + 1] - p[1], dz = TC[q * 3 + 2] - p[2]; if (dx * dx + dy * dy + dz * dz > 0.0016) continue;
    const a0 = T[q * 3] * 3, b0 = T[q * 3 + 1] * 3, c0 = T[q * 3 + 2] * 3, e1 = [HP[b0] - HP[a0], HP[b0 + 1] - HP[a0 + 1], HP[b0 + 2] - HP[a0 + 2]], e2 = [HP[c0] - HP[a0], HP[c0 + 1] - HP[a0 + 1], HP[c0 + 2] - HP[a0 + 2]];
    const h = [n[1] * e2[2] - n[2] * e2[1], n[2] * e2[0] - n[0] * e2[2], n[0] * e2[1] - n[1] * e2[0]], a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(a) < 1e-12) continue;
    const f = 1 / a, s = [p[0] - HP[a0], p[1] - HP[a0 + 1], p[2] - HP[a0 + 2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) continue;
    const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = f * (n[0] * qv[0] + n[1] * qv[1] + n[2] * qv[2]); if (v < 0 || u + v > 1) continue;
    const t = f * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]); if (t > -0.003 && t < R) return true; } return false; };
  const bare = []; for (const v of V) { const p = [SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]], n = [SN[v * 3] / 127, SN[v * 3 + 1] / 127, SN[v * 3 + 2] / 127], l = Math.hypot(...n) || 1; if (!hit(p, n.map((c) => c / l), 0.03)) bare.push(p); }
  // (a 1 cm grid of the bare points)
  const G = new Map(), cell = 0.01, key = (x, y, z) => x + ',' + y + ',' + z; for (const p of bare) { const k = key(...p.map((c) => Math.floor(c / cell))); (G.get(k) || G.set(k, []).get(k)).push(p); }
  const dE = new Float32Array(HP.length / 3).fill(9);
  for (const v of hv) { const p = [HP[v * 3], HP[v * 3 + 1], HP[v * 3 + 2]], c = p.map((x) => Math.floor(x / cell)); let m = 9;
    for (let r = 0; r <= 3 && m > r * cell; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) { if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue; const L = G.get(key(c[0] + i, c[1] + j, c[2] + k)); if (!L) continue;
      for (const q of L) { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < m) m = d; } }
    dE[v] = m; }
  return { dE, bare: bare.length };
}
