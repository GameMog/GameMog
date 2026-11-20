// Jensen Heist's supporting cast, cast round 1 (the owner's rule 5: real-looking hair, alpha-card strands like Jensen's
// round-3 hair, not helmets): every forged head of hair regroomed as alpha-tested hair CARDS cut from Jensen's strand
// atlas (storykit/handbuilt/jensen/parts/hair-strands.webp, from POLYTRICITY's "Hair Cards_FBX", CC BY 4.0, see
// scripts/handbuilt/jensen/hairatlas.mjs and CREDITS.md), laid over the forge's own cut, which stays as the darker
// under-layer (material 'hairUnder': the scalp's cover and the gaps' depth).
//   groomPass(doc, style, K)
// How: the forge's cut gives the hair's VOLUME. From the skull's centre (from the eyes), rays in every direction (2 degree
// grid, the pole straight down) find the scalp (the skin's first hit) and the hair's outer envelope (the farthest hit on a
// covered hair triangle, its texture's alpha over the cut). Cards root on a Fibonacci spread over the covered directions
// and grow in direction space along the style's flow (away from the crown's whorl for a bob or a crop, away from the part
// for a side part, toward the tie for a ponytail and down its tail), between the scalp and the envelope by layer (the
// outer layer 1-2 mm past the old cut), tapering to free strand tips that run a little past its edge. Each card is a
// window of one atlas strip (dense clumps for the mass, tapered clumps and single strands at the edges and as flyaways),
// tinted by vertex colour: the cut's own colour (the median of its opaque texels), each card its own value, salt and
// pepper by the sheet's greying (a share of the cards grey-white), darker at the root. Every card point takes the
// skinning of the nearest point of the old cut (a ponytail swings with the neck as the forge rigged it).
// Original procedural work (no assets but the CC BY atlas), CC0.
import fs from 'node:fs';
import { prim, sm, clamp, rgba, setWebp } from '../young-hero/glb.mjs';
import { eyeFit } from '../frames.mjs';

const ATLAS = new URL('../../../storykit/handbuilt/jensen/parts/hair-strands.webp', import.meta.url).pathname;
const D2R = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const tang = (v, d) => add(v, d, -dot(v, d));
// the atlas strips (pixels of the 4096 source sheet: x0, x1, the tip's row; roots at ~3990), as haircards.mjs
const STRIPS = [[80, 467, 90], [524, 835, 151], [887, 1198, 139], [1252, 1547, 43], [1612, 1897, 54], [1978, 2257, 122],
  [2336, 2612, 1596], [2697, 2981, 2002], [3068, 3345, 1896], [3425, 3685, 2131], [3756, 3793, 1841], [3830, 3861, 849], [3954, 3978, 1041]];
const ROOT = 3988 / 4096;

// the styles: flow 'crown' (away from a whorl), 'part' (away from a side part), 'tie' (toward a tie, then down the tail);
// len [m] of a top strand, the sides' share of it, curl (degrees of wander per step), card widths, card count
export const STYLES = {
  // (a bob tucked behind the ears: a side part on her right, swept across the crown, falling close to the head to the jaw)
  'bob-tucked': { flow: 'part', part: [-0.36, 0.88, 0.3], len: 0.13, side: 1.0, curl: 3, gravity: 1.2, n: 1700, w: [0.017, 0.025], maxT: 0.017, past: 8 },
  short: { flow: 'crown', whorl: [0.05, 0.75, -0.66], len: 0.05, side: 0.6, curl: 6, gravity: 0.35, n: 1300, w: [0.01, 0.015], back: 0.4 },
  'side-part': { flow: 'part', part: [0.38, 0.86, 0.32], len: 0.065, side: 0.55, curl: 4, gravity: 0.35, n: 1300, w: [0.011, 0.016] },
  'short-curly': { flow: 'crown', whorl: [0, 0.8, -0.6], len: 0.04, side: 0.7, curl: 26, gravity: 0.2, n: 1500, w: [0.01, 0.014], lift: 0.004 },
  ponytail: { flow: 'tie', tie: [0, 0.25, -0.97], len: 0.12, side: 1, curl: 3, gravity: 0.2, n: 1500, w: [0.012, 0.018] },
  'high-ponytail': { flow: 'tie', tie: [0, 0.62, -0.78], len: 0.12, side: 1, curl: 3, gravity: 0.2, n: 1600, w: [0.012, 0.018] },
};

export async function groomPass(doc, style, K = {}) {
  const ST = STYLES[style]; if (!ST) { console.log('groom: no style', style, '(left as forged)'); return null; }
  K = { greying: 0, atlas: 0.31, seed: 11, cut: 0.42, rough: 0.7, lay: [0.25, 1.0], out: 0.0018, under: 0.55, tone: null, ...ST, ...K };
  const R = doc.getRoot(), hairPs = prim(doc, 'hair'); if (!hairPs.length) { console.log('groom: no hair'); return null; }
  let seed = K.seed; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), rr = (a, b) => a + (b - a) * rnd();
  // ---- the skull's centre: between the eyes, up 2 cm and back 7.5 cm
  const E = eyeFit(doc), C = [0, (E.L.c[1] + E.R.c[1]) / 2 + 0.02, (E.L.c[2] + E.R.c[2]) / 2 - 0.075];
  // ---- triangles: the skin over the eyes' line less 12 cm; the hair's covered triangles (alpha at 4 points over the cut)
  const sk = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const triList = (p, keep) => { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), out = [];
    for (let t = 0; t < I.length; t += 3) if (keep(I[t], I[t + 1], I[t + 2], A)) out.push(...[I[t], I[t + 1], I[t + 2]].flatMap((v) => [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]])); return Float32Array.from(out); };
  const skinT = triList(sk, (a, b, c, A) => [a, b, c].every((v) => A[v * 3 + 1] > C[1] - 0.14));
  const tex = hairPs[0].getMaterial().getBaseColorTexture(), img = tex ? await rgba(tex) : null;
  const alphaAt = (u, v) => { if (!img) return 255; const x = clamp(Math.floor(u * img.w), 0, img.w - 1), y = clamp(Math.floor(v * img.h), 0, img.h - 1); return img.data[(y * img.w + x) * 4 + 3]; };
  const cols = []; const hairT = [];
  for (const p of hairPs) { const U = p.getAttribute('TEXCOORD_0')?.getArray(); const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]]; let al = 0;
      if (U) for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) { const u = U[a * 2] * wa + U[b * 2] * wb + U[c * 2] * wc, v = U[a * 2 + 1] * wa + U[b * 2 + 1] * wb + U[c * 2 + 1] * wc; const q = alphaAt(u, v); al += q / 4;
        if (img && q > 200 && cols.length < 60000) { const x = clamp(Math.floor(u * img.w), 0, img.w - 1), y = clamp(Math.floor(v * img.h), 0, img.h - 1), i = (y * img.w + x) * 4; cols.push([img.data[i], img.data[i + 1], img.data[i + 2]]); } }
      else al = 255;
      if (al < 255 * K.cut) continue; for (const v of [a, b, c]) hairT.push(A[v * 3], A[v * 3 + 1], A[v * 3 + 2]); } }
  const HT = Float32Array.from(hairT);
  // ---- rays from C: the first skin hit, the farthest hair hit
  const hits = (TA, d, far) => { let best = far ? -1 : Infinity;
    for (let i = 0; i < TA.length; i += 9) {
      const e1x = TA[i + 3] - TA[i], e1y = TA[i + 4] - TA[i + 1], e1z = TA[i + 5] - TA[i + 2], e2x = TA[i + 6] - TA[i], e2y = TA[i + 7] - TA[i + 1], e2z = TA[i + 8] - TA[i + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, tx = C[0] - TA[i], ty = C[1] - TA[i + 1], tz = C[2] - TA[i + 2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt <= 0.02) continue; if (far ? tt > best : tt < best) best = tt; }
    return far ? (best > 0 ? best : NaN) : (Number.isFinite(best) ? best : NaN); };
  // grid: azimuth phi (0 = front, + her left) every 2 degrees, polar alpha from straight up every 2 degrees to 160
  const NP = 180, NA = 81, G = NP * NA, dirOf = (i, j) => { const ph = (-180 + i * 2) * D2R, al = j * 2 * D2R; return [Math.sin(al) * Math.sin(ph), Math.cos(al), Math.sin(al) * Math.cos(ph)]; };
  const RS = new Float32Array(G).fill(NaN), RE = new Float32Array(G).fill(NaN);
  for (let j = 0; j < NA; j++) for (let i = 0; i < NP; i++) { const d = dirOf(i, j), g = j * NP + i; RS[g] = hits(skinT, d, false); RE[g] = hits(HT, d, true); }
  // (a direction is hair where the envelope stands clear of the scalp, or where there is no scalp (a tail))
  const HM = new Uint8Array(G); for (let g = 0; g < G; g++) HM[g] = Number.isFinite(RE[g]) && (!Number.isFinite(RS[g]) || RE[g] > RS[g] + 0.0015) ? 1 : 0;
  // (a scalp under a tail's directions: the nearest scalp radius along the meridian, else the envelope less 2 cm)
  for (let i = 0; i < NP; i++) { let last = NaN; for (let j = 0; j < NA; j++) { const g = j * NP + i; if (Number.isFinite(RS[g])) last = RS[g]; else if (HM[g]) RS[g] = Number.isFinite(last) ? Math.min(last, RE[g] - 0.004) : RE[g] - 0.02; } }
  const look = (d) => { const al = Math.acos(clamp(d[1], -1, 1)) / D2R / 2, ph = (Math.atan2(d[0], d[2]) / D2R + 180) / 2; const j0 = Math.floor(al), i0 = Math.floor(ph), fj = al - j0, fi = ph - i0;
    if (j0 < 0 || j0 >= NA - 1) return null; let rs = 0, re = 0, w = 0, m = 0;
    for (const [dj, di, ww] of [[0, 0, (1 - fj) * (1 - fi)], [0, 1, (1 - fj) * fi], [1, 0, fj * (1 - fi)], [1, 1, fj * fi]]) { const g = (j0 + dj) * NP + ((i0 + di) % NP); m += HM[g] * ww; if (!HM[g]) continue; rs += RS[g] * ww; re += RE[g] * ww; w += ww; }
    return w > 0.05 ? { rs: rs / w, re: re / w, m } : { m }; };
  // ---- the flow at a direction d (unit, from C), the strand's step direction on the sphere
  const W = K.whorl ? norm(K.whorl) : null, PT = K.part ? norm(K.part) : null, TI = K.tie ? norm(K.tie) : null, down = [0, -1, 0], back = [0, 0, -1];
  const flow = (d) => { let v;
    if (K.flow === 'crown') { v = tang(add(d, W, -1), d); if (Math.hypot(...v) < 1e-3) v = tang(back, d); v = norm(v); v = norm(add(v, norm(tang(down, d)), K.gravity * sm(0.6, 0.0, d[1]))); if (K.back) v = norm(add(v, norm(tang(back, d)), K.back * sm(0.2, 0.7, d[1]))); }
    else if (K.flow === 'part') { const side = d[0] < PT[0] - 0.05 ? 1 : -1; v = tang(add(d, PT, -1), d); if (Math.hypot(...v) < 1e-3) v = tang([-side, 0, 0], d); v = norm(v); v = norm(add(v, norm(tang(back, d)), 0.6 * sm(0.3, 0.8, d[1]))); v = norm(add(v, norm(tang(down, d)), K.gravity * sm(0.5, 0.0, d[1]))); }
    else { const toT = tang(add(TI, d, -1), d), past = sm(0.92, 0.98, dot(d, TI)); v = Math.hypot(...toT) < 1e-3 ? norm(tang(down, d)) : norm(toT); v = norm(lerp(v, norm(tang(down, d)), past)); }
    return v; };
  // ---- the hair's colour: the cut's median, the sheet's greying as a share of grey-white cards
  const med = (k) => { const a = cols.map((c) => c[k]).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 60; };
  const lin = (c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const base = K.tone || [0, 1, 2].map((k) => lin(med(k)) * 1.25), grey = K.grey || [0.2, 0.2, 0.21];
  // (the atlas's strands are a light grey, ~0.31 linear where opaque: a card's vertex colour is its hair's albedo over that)
  // (salt and pepper: about the sheet's greying of the cards grey (each its own shade), the rest the hair's own colour
  // with a little grey in it; no stark white cards on a dark mass)
  const colourOf = (d, layer) => { const gk = rnd() < K.greying ** 0.8 ? rr(0.55, 1.05) : rr(0, 0.12), jv = rr(0.9, 1.08), c0 = lerp(base, grey, gk).map((x) => x * jv * (0.82 + 0.18 * layer));
    return (t) => { const root = 1 - sm(0, 0.25, t); return c0.map((x) => Math.min(1, (x / K.atlas) * (1 - 0.3 * root) * (1 + 0.06 * sm(0.6, 1, t)))); }; };
  // ---- cards
  const pos = [], nrm = [], col = [], uvs = [], tan = [], idx = []; let ncard = 0;
  const card = (P, D, strip, w0, colour, o = {}) => {
    const m = P.length; if (m < 3) return;
    const [x0, x1, ty] = STRIPS[strip], win = strip >= 10 ? 1 : rr(0.45, 0.75), c0 = x0 + (x1 - x0) * rr(0, 1 - win), u0 = c0 / 4096, u1 = (c0 + (x1 - x0) * win) / 4096, vT = ty / 4096;
    const base0 = pos.length / 3, tw = (o.twist ?? rr(-5, 5)) * D2R, taper = o.taper ?? 0.4;
    const L = [0]; for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2])); const len = L[m - 1] || 1;
    for (let i = 0; i < m; i++) { const t = L[i] / len, a = P[Math.max(0, i - 1)], b = P[Math.min(m - 1, i + 1)], T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      let B = norm(cross(T, D[i])); const tws = tw * (0.4 + 0.6 * t), TB = cross(T, B); B = norm(add(B.map((x) => x * Math.cos(tws)), TB, Math.sin(tws)));
      let N = norm(cross(B, T)); if (dot(N, D[i]) < 0) N = N.map((x) => -x); const Nv = norm(lerp(N, D[i], 0.85)), w = w0 * (1 - taper * t);
      for (const x of [-1, 0, 1]) { pos.push(...add(add(P[i], B, (x * w) / 2), N, (1 - x * x) * w * 0.1)); nrm.push(...Nv); tan.push(...T, 1); uvs.push(u0 + ((u1 - u0) * (x + 1)) / 2, ROOT + (vT - ROOT) * t); col.push(...colour(t), 1); } }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < 2; j++) { const a = base0 + i * 3 + j, b = a + 1, c = a + 3, dd = c + 1; idx.push(a, c, b, b, c, dd); }
    ncard++; };
  const grow = (d0, len, layer, o = {}) => { const P = [], D = []; let d = norm(d0), f0 = null; const ds = 0.003, n = Math.max(4, Math.round(len / ds)); let outside = 0;
    const curl = (o.curl ?? rr(-1, 1) * K.curl) * D2R;
    for (let i = 0; i <= n; i++) { const s = look(d); if (!s || s.rs === undefined) { if (!i) return { P, D }; outside++; if (outside > (K.past ?? 4) || (d[2] > 0.45 && d[1] > -0.2)) break; }
      const S = s && s.rs !== undefined ? s : P.length ? { rs: Math.hypot(...add(P[P.length - 1], C, -1)) - 0.001, re: Math.hypot(...add(P[P.length - 1], C, -1)) } : null; if (!S) break;
      const rise = 1 - Math.exp(-(i * ds) / 0.006), T = clamp(S.re - S.rs, 0.002, K.maxT ?? 1);
      let r = S.rs + Math.max(0.0012, T * (K.lay[0] + (K.lay[1] - K.lay[0]) * layer) * rise) + (layer > 0.7 ? K.out * rise : 0) + (K.lift || 0) * rise * (1 - i / n);
      P.push(add(C, d, r)); D.push(d);
      let f = flow(d); if (f0) f = norm(lerp(f0, f, 0.35)); const sd = norm(cross(d, f)), ca = curl * (K.curl > 15 ? Math.sin(i * 0.9 + o.ph) : 1); f = norm(add(f.map((x) => x * Math.cos(ca)), sd, Math.sin(ca)));
      f0 = f; d = norm(add(d, f, ds / r)); }
    const keep = P.map((_, i) => i).filter((i) => i % 2 === 0 || i === P.length - 1); return { P: keep.map((i) => P[i]), D: keep.map((i) => D[i]) }; };
  const roots = []; const NF = 12000;
  for (let i = 0; i < NF; i++) { const y = 1 - (2 * (i + 0.5)) / NF, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653, d = [r * Math.cos(th), y, r * Math.sin(th)]; const s = look(d); if (s && s.rs !== undefined && s.m > 0.99) roots.push(d); }
  const lenAt = (d) => K.len * (K.side + (1 - K.side) * sm(0.0, 0.6, d[1])) * rr(0.8, 1.2);
  // three layers: the inner mass (wide dense clumps), the mid, the outer (narrower tapered clumps)
  for (const [l0, l1, f, strips, wk] of [[0.0, 0.35, 0.3, [0, 1, 2], 1.2], [0.35, 0.7, 0.35, [0, 1, 2, 3, 4], 1.0], [0.7, 1.0, 0.35, [3, 4, 5, 1, 6, 7], 0.85]])
    for (let k = 0; k < Math.round(K.n * f) && roots.length; k++) { const d = roots[Math.floor(rnd() * roots.length)], layer = rr(l0, l1);
      const { P, D } = grow(d, lenAt(d), layer, { ph: rr(0, 6.3) }); card(P, D, strips[Math.floor(rnd() * strips.length)], rr(K.w[0], K.w[1]) * wk, colourOf(d, layer)); }
  // a few flyaways: single strands off the outer layer
  for (let k = 0; k < 8 && roots.length; k++) { const d = roots[Math.floor(rnd() * roots.length)]; const { P, D } = grow(d, lenAt(d) * 0.8, 1, { ph: rr(0, 6.3), curl: rr(-8, 8) }); card(P, D, 10 + (k % 3), rr(0.003, 0.0045), colourOf(d, 1), { twist: rr(-40, 40), taper: 0.2 }); }
  // ---- the skinning: each card point the nearest old cut point's (a 1 cm grid)
  const src = hairPs[0], SP = src.getAttribute('POSITION').getArray(), SJ = src.getAttribute('JOINTS_0').getArray(), SW = src.getAttribute('WEIGHTS_0').getArray(), used = [...new Set(hairPs.flatMap((p) => [...p.getIndices().getArray()]))];
  const cell = 0.01, Gd = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`; for (const v of used) { const k = key(SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]); (Gd.get(k) || Gd.set(k, []).get(k)).push(v); }
  const n = pos.length / 3, J = new SJ.constructor(n * 4), Wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; let best = -1, bd = 1e9;
    for (let rad = 1; rad <= 4 && best < 0; rad++) { const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) for (let c = -rad; c <= rad; c++) { const L = Gd.get(`${cx + a},${cy + b},${cz + c}`); if (!L) continue; for (const v of L) { const dd = (SP[v * 3] - x) ** 2 + (SP[v * 3 + 1] - y) ** 2 + (SP[v * 3 + 2] - z) ** 2; if (dd < bd) { bd = dd; best = v; } } } }
    if (best < 0) best = used[0]; for (let k = 0; k < 4; k++) { J[i * 4 + k] = SJ[best * 4 + k]; Wt[i * 4 + k] = SW[best * 4 + k]; } }
  // ---- the old cut: the under-layer (darker, matte), the cards beside it in its mesh
  // (its colour the cards' mean, a little darker, flat (only a tenth of its own paint's light and dark kept): the gaps
  // read as depth in the same hair, not as a grey helmet or white streaks under it)
  const old = hairPs[0].getMaterial(), mean = lerp(base, grey, K.greying).map((x) => x * K.under);
  if (img) { const out = Buffer.from(img.data), L0 = 0.2126 * lin(med(0)) + 0.7152 * lin(med(1)) + 0.0722 * lin(med(2));
    for (let i = 0; i < img.w * img.h; i++) { const L = 0.2126 * lin(img.data[i * 4]) + 0.7152 * lin(img.data[i * 4 + 1]) + 0.0722 * lin(img.data[i * 4 + 2]), r = clamp(1 + 0.1 * (L / (L0 || 1) - 1), 0.85, 1.12);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(255 * Math.pow(clamp(mean[c] * r), 1 / 2.2)); }
    const t2 = doc.createTexture('hairUnder'); await setWebp(t2, out, img.w, img.h, 88, 4); old.setBaseColorTexture(t2); }
  old.setName('hairUnder').setRoughnessFactor(0.9).setNormalTexture(null).setBaseColorFactor([1, 1, 1, 1]);
  // (a style whose mass is capped (maxT) has its old cut drawn in under the cards: no helmet standing out past them)
  if (K.maxT) { let nm = 0; const done = new Set();
    for (const p of hairPs) { const acc = p.getAttribute('POSITION'), A = acc.getArray().slice();
      for (const v of new Set(p.getIndices().getArray())) { if (done.has(acc.getName() + v)) continue; done.add(acc.getName() + v); const q = [A[v * 3] - C[0], A[v * 3 + 1] - C[1], A[v * 3 + 2] - C[2]], r = Math.hypot(...q), d = norm(q), s = look(d);
        if (!s || s.rs === undefined) continue; const cap = s.rs + K.maxT * 0.85; if (r <= cap) continue; for (let k = 0; k < 3; k++) A[v * 3 + k] = C[k] + d[k] * cap; nm++; }
      acc.setArray(A); }
    console.log('groom: old cut drawn in under the cards, points', nm); }
  for (const p of hairPs) if (p.getMaterial() !== old) p.setMaterial(old);
  const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const lum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2] + K.greying * 0.2;
  const atlas = doc.createTexture('hair-strands').setImage(fs.readFileSync(ATLAS)).setMimeType('image/webp');
  const mat = doc.createMaterial('hair').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(atlas).setAlphaMode('MASK').setAlphaCutoff(K.cut).setDoubleSided(true).setRoughnessFactor(K.rough).setMetallicFactor(0)
    .setExtras({ ...(lum > 0.3 ? { hairTone: 'light' } : {}), hairNormals: 'volume', look: { hair: 'cards', note: 'alpha-tested hair cards from a strand atlas (POLYTRICITY, CC BY 4.0), tinted by vertex colour' } });
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)))
    .setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm))).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(col)))
    .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uvs))).setAttribute('TANGENT', acc('VEC4', Float32Array.from(tan))).setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', Wt));
  R.listMeshes().find((m) => m.listPrimitives().includes(hairPs[0])).addPrimitive(p);
  console.log('groom:', style, ncard, 'cards, points', n, 'tris', idx.length / 3, '; roots', roots.length, '; colour', base.map((x) => x.toFixed(3)).join(','), 'greying', K.greying, '; centre', C.map((x) => x.toFixed(3)).join(','));
  return { C };
}
