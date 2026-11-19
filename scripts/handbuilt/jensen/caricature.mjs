// Jensen, the stylized parody caricature (the owner, 19 Nov 2026: after four realistic likeness rounds stalled, an
// affectionate SNL / Spitting Image style caricature of the public keynote persona). Only the signature, non-ethnic
// features are pushed: the big silver swoop of hair, the oversized gunmetal browline glasses, the warm presenter grin
// with lively brows (build.mjs `grin`), the head a little large for the body (build.mjs `headsize`, kept by writeKept).
// The eyes, nose and skin are left exactly as the realistic build made them: no eye shape, skin tone or other
// racialised feature is touched by anything here.
//   hairSwoopPass(doc, K)   the groom's volume pushed out from the scalp (the roots stay put, each card's height above
//                           the scalp grows with a saturating curve), most at the front-top quiff, lifted up and back
//   glassesBigPass(doc, K)  the frame's front a little oversized about the bridge (the temples blend back to the ears),
//                           the browline bar thicker, the gunmetal lighter so it reads at a distance
// Original work (no new assets); see storykit/handbuilt/jensen/CREDITS.md.
const sm = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const primsOf = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());

// the scalp: the body's skin points above the brow line (used by its triangles), on a 1 cm grid
function scalp(doc, y0) {
  const sk = primsOf(doc).filter((p) => p.getMaterial()?.getName() === 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const S = sk.getAttribute('POSITION').getArray(), used = new Uint8Array(S.length / 3); for (const i of sk.getIndices().getArray()) used[i] = 1;
  const G = new Map(), cell = 0.01, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`; let n = 0;
  for (let v = 0; v < used.length; v++) if (used[v] && S[v * 3 + 1] > y0) { const k = key(S[v * 3], S[v * 3 + 1], S[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); n++; }
  const near = (x, y, z) => { let best = 1e9, q = -1; for (let r = 1; r <= 6 && q < 0; r++) { const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) for (const v of G.get(`${cx + i},${cy + j},${cz + k}`) || []) { const d = (S[v * 3] - x) ** 2 + (S[v * 3 + 1] - y) ** 2 + (S[v * 3 + 2] - z) ** 2; if (d < best) { best = d; q = v; } } }
    return q < 0 ? null : [S[q * 3], S[q * 3 + 1], S[q * 3 + 2]]; };
  return { near, n };
}

// The hair: each point p of the groom (and its cap) finds the scalp point q under it; n is the scalp's outward
// direction there (from the skull's centre c). Its height t above the scalp becomes t + A(n) * (1 - exp(-t / tau)):
// the roots (t ~ 0) stay on the scalp, every layer above them is lifted, the outer ones most, so the cards keep their
// order and the groom stays one continuous mass. A(n) is the region's lift: largest over the front-top (the quiff),
// generous over the crown, less behind, little over the ears and none at the nape. The front-top is also carried a
// little back (the swoop's flow), the crown a little up.
export function hairSwoopPass(doc, K = {}) {
  K = { c: [0, 1.645, 0.035], tau: 0.007, quiff: 0.04, top: 0.022, back: 0.01, side: 0.003, flowBack: 0.01, quiffDir: [0, 0.62, 0.78], quiffCos: 0.55, y0: 1.575, ...K };
  const { near, n: ns } = scalp(doc, K.y0), qd = K.quiffDir, ql = Math.hypot(...qd), Q = qd.map((v) => v / ql);
  let moved = 0, peak = 0;
  for (const p of primsOf(doc)) { const mat = p.getMaterial()?.getName(); if (mat !== 'hair' && mat !== 'hairCap') continue;
    const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), N = A.length / 3;
    for (let i = 0; i < N; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2], q = near(x, y, z); if (!q) continue;
      let nx = q[0] - K.c[0], ny = q[1] - K.c[1], nz = q[2] - K.c[2]; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      const t = Math.max(0, (x - q[0]) * nx + (y - q[1]) * ny + (z - q[2]) * nz);
      const wQ = sm(K.quiffCos, 0.97, nx * Q[0] + ny * Q[1] + nz * Q[2]), wTop = sm(0.35, 0.9, ny), wBack = sm(0.15, 0.7, -nz) * sm(-0.45, 0.1, ny), wSide = sm(0.45, 0.9, Math.abs(nx)) * sm(-0.5, 0.2, ny);
      const lift = Math.max(K.quiff * wQ, K.top * wTop, K.back * wBack, K.side * wSide), g = 1 - Math.exp(-t / K.tau), d = lift * g;
      const fb = K.flowBack * Math.max(wQ, wTop * 0.6) * g; // (carried back along -z, the swoop's flow)
      A[i * 3] = x + nx * d + (K.flowSide || 0) * Math.max(wQ, wTop) * g; A[i * 3 + 1] = y + ny * d - (K.flatFront || 0) * wQ * g; A[i * 3 + 2] = z + nz * d - fb;
      if (d > 1e-4) moved++; peak = Math.max(peak, d); }
    acc.setArray(A); }
  console.log('hair swoop: scalp points', ns, 'points lifted', moved, 'peak mm', (peak * 1000).toFixed(1));
}

// The glasses: the front (z >= zFront) scaled by `big` in x and y about the bridge, blending to 1 at zBack (the
// temples run back to the ears as before); the browline bar (metal above yBar) thickened by `bar` about its own
// centre line; the gunmetal colour lifted so the frame reads in a webcam tile.
export function glassesBigPass(doc, K = {}) {
  K = { big: 1.1, zFront: 0.125, zBack: 0.07, bridge: [0, 1.62, 0.15], bar: 1.6, yBar: 1.6305, yBarC: 1.6335, col: [0.13, 0.135, 0.145], metal: 0.65, rough: 0.32, ...K };
  let n = 0; const seen = new Set();
  for (const p of primsOf(doc)) { const mat = p.getMaterial()?.getName() || ''; if (!/^glasses-/.test(mat)) continue;
    const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice();
    for (let i = 0; i < A.length / 3; i++) { let x = A[i * 3], y = A[i * 3 + 1]; const z = A[i * 3 + 2], w = sm(K.zBack, K.zFront, z);
      if (mat === 'glasses-metal' && w > 0.5 && y > K.yBar) y = K.yBarC + (y - K.yBarC) * (1 + (K.bar - 1) * w);
      const s = 1 + (K.big - 1) * w; x = K.bridge[0] + (x - K.bridge[0]) * s; y = K.bridge[1] + (y - K.bridge[1]) * s;
      A[i * 3] = x; A[i * 3 + 1] = y; n++; }
    acc.setArray(A);
    if (mat === 'glasses-metal' && K.col) p.getMaterial().setBaseColorFactor([...K.col, 1]).setMetallicFactor(K.metal).setRoughnessFactor(K.rough); }
  console.log('glasses big: points', n, 'front x', K.big, 'bar x', K.bar);
}

// ---------------------------------------------------------------------------------------------------------------------
// Round 2 (the owner and the critic, 19 Nov): a designed caricature surface instead of passes stacked on a realistic face.
//   stylizeFacePass(doc, K)  the head made one clean, symmetric form on the same hm08 points (so every ARKit / viseme
//                            target still lands): mirrored about x = 0 (the lopsided smirk was the landmark fit's own
//                            asymmetry), its small lumps ironed by a long Taubin smooth (the nose only smoothed, never
//                            widened; the eyes and lids untouched), soft rounded apple cheeks
//   skinGradePass(doc, K)    the owner: "skin too orange: lighter, natural, neutral". The skin map's low frequencies set to
//                            one light neutral tone (face, neck and hands alike: the hands no longer a paler patch), its
//                            fine detail kept; a soft blush on the cheeks and nose
//   hairWhitePass(doc, K)    the owner: "much whiter: bright silver-white, near white with cool silver lowlights"
//   proportionPass(doc, K)   ADULT proportions (the owner, round 2: "he looks like a midget": the 1.2-1.3 x head made him
//                            5-6 heads tall): the head 1.02 x (7.3 heads, ~1.75 m to the top of the hair), the hands as
//                            made, the head set a few mm back on the neck so it does not jut forward in profile
//   outfitPass(doc, K)       black trousers and tee, glossier leather with bright silver hardware
// Original work (no new assets).
import { readFileSync } from 'node:fs';
import { skinMap } from '../facekit.mjs';
import { MH_BASE } from '../../forge/paths.mjs';
import { LM } from './landmarks.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { matOf, rgba, setWebp, sharp } from '../young-hero/glb.mjs';

function weld(a) { const n = a.length / 3, key = new Map(), rep = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); } return rep; }
const gauss = (d, r) => Math.exp(-(d * d) / (2 * r * r));
// each MakeHuman base vertex's mirror twin at (-x, y, z) (-1: none within 1 mm); the base mesh is mirror-symmetric
let TW = null;
function twins() { if (TW) return TW;
  const V = []; for (const l of readFileSync(MH_BASE, 'utf8').split('\n')) if (l.startsWith('v ')) { const p = l.split(/\s+/); V.push(+p[1], +p[2], +p[3]); }
  const G = new Map(), key = (x, y, z) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
  for (let i = 0; i < V.length / 3; i++) { const k = key(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(i); }
  TW = new Int32Array(V.length / 3).fill(-1);
  for (let i = 0; i < V.length / 3; i++) { const x = -V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2]; let best = 1e-3; const cx = Math.round(x * 200), cy = Math.round(y * 200), cz = Math.round(z * 200);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of G.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) { const d = Math.hypot(V[j * 3] - x, V[j * 3 + 1] - y, V[j * 3 + 2] - z); if (d < best) { best = d; TW[i] = j; } } }
  return TW; }

export function stylizeFacePass(doc, K = {}) {
  K = { y0: 1.46, iters: 24, lam: 0.5, mu: -0.52, nose: 0.55, mouth: 0.35, cheek: 0.0028, cheekR: 0.016, sym: true, sink: 0.0004, ...K };
  const { EY, EZ, EYEX, MOUTHY, CHINY } = LM;
  const M = skinMap(doc), a = M.P.getArray().slice(), n = M.n, rep = weld(a);
  // (1) symmetric: MakeHuman's base mesh is exactly mirror-symmetric, so each base vertex has a twin at (-x, y, z)
  if (K.sym) {
    const V = []; for (const l of readFileSync(MH_BASE, 'utf8').split('\n')) if (l.startsWith('v ')) { const p = l.split(/\s+/); V.push(+p[1], +p[2], +p[3]); }
    const G = new Map(), key = (x, y, z) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
    for (let i = 0; i < V.length / 3; i++) { const k = key(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(i); }
    const twin = (i) => { const x = -V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2]; let best = 1e-3, q = -1; const cx = Math.round(x * 200), cy = Math.round(y * 200), cz = Math.round(z * 200);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of G.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) { const d = Math.hypot(V[j * 3] - x, V[j * 3 + 1] - y, V[j * 3 + 2] - z); if (d < best) { best = d; q = j; } }
      return q; };
    const ofMH = new Map(); for (let v = 0; v < n; v++) if (M.map[v] >= 0 && rep[v] === v && !ofMH.has(M.map[v])) ofMH.set(M.map[v], v);
    const o = a.slice(); let k = 0;
    for (const [m, v] of ofMH) { const y = o[v * 3 + 1]; if (y < K.y0) continue; const t = twin(m); const w = ofMH.get(t); if (w === undefined) continue;
      const f = Math.min(1, (y - K.y0) / 0.03);
      const sx = (o[v * 3] - o[w * 3]) / 2, sy = (o[v * 3 + 1] + o[w * 3 + 1]) / 2, sz = (o[v * 3 + 2] + o[w * 3 + 2]) / 2;
      a[v * 3] += f * (sx - o[v * 3]); a[v * 3 + 1] += f * (sy - o[v * 3 + 1]); a[v * 3 + 2] += f * (sz - o[v * 3 + 2]); k++; }
    console.log('stylize: mirrored points', k);
  }
  // (2) the face's planes: a long Taubin smooth over the face mask (the eyes and lids out, the nose and the lips at less)
  const mask = new Float32Array(n);
  for (let v = 0; v < n; v++) { if (rep[v] !== v || M.map[v] < 0) continue; const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], ax = Math.abs(x);
    if (y < CHINY - 0.05 || y > EY + 0.075 || z < EZ - 0.15) continue;
    let m = sm(CHINY - 0.05, CHINY - 0.025, y) * sm(EY + 0.075, EY + 0.05, y) * sm(EZ - 0.15, EZ - 0.105, z) * sm(0.08, 0.068, ax);
    const de = Math.hypot(ax - EYEX, (y - EY) * 1.25, (z - EZ) * 0.7); m *= sm(0.017, 0.028, de);
    const nose = (1 - sm(0.017, 0.027, ax)) * sm(MOUTHY + 0.004, MOUTHY + 0.012, y) * sm(EY + 0.005, EY - 0.008, y); m *= 1 - nose * (1 - K.nose);
    const mouth = (1 - sm(0.028, 0.038, ax)) * (1 - sm(0.011, 0.02, Math.abs(y - MOUTHY))); m *= 1 - mouth * (1 - K.mouth);
    mask[v] = m; }
  const nb = new Map(); for (const p of doc.getRoot().listMeshes().flatMap((mm) => mm.listPrimitives())) { if (p.getAttribute('POSITION') !== M.P || p.getMaterial()?.getName() !== 'skin') continue; const I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const A = rep[I[t + e]], B = rep[I[t + (e + 1) % 3]]; if (!mask[A] && !mask[B]) continue; for (const [u, w] of [[A, B], [B, A]]) (nb.get(u) || nb.set(u, new Set()).get(u)).add(w); } }
  const step = (f) => { const o = a.slice(); for (const [v, s] of nb) { const m = mask[v]; if (!m) continue; let cx = 0, cy = 0, cz = 0; for (const w of s) { cx += o[w * 3]; cy += o[w * 3 + 1]; cz += o[w * 3 + 2]; } const k = s.size;
      a[v * 3] = o[v * 3] + f * m * (cx / k - o[v * 3]); a[v * 3 + 1] = o[v * 3 + 1] + f * m * (cy / k - o[v * 3 + 1]); a[v * 3 + 2] = o[v * 3 + 2] + f * m * (cz / k - o[v * 3 + 2]); } };
  const a0 = a.slice(); for (let i = 0; i < K.iters; i++) { step(K.lam); step(K.mu); }
  // (no point sinks more than K.sink into the head: the smooth's inward drift let the lower teeth and the mouth's dark
  // inside show through the chin; the outward direction is from the skull's centre)
  for (const v of nb.keys()) { const dx = a[v * 3] - a0[v * 3], dy = a[v * 3 + 1] - a0[v * 3 + 1], dz = a[v * 3 + 2] - a0[v * 3 + 2];
    let nx = a0[v * 3], ny = a0[v * 3 + 1] - (EY - 0.02), nz = a0[v * 3 + 2] - (EZ - 0.09); const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    const dn = dx * nx + dy * ny + dz * nz; if (dn < -K.sink) { const f = -K.sink - dn; a[v * 3] += nx * f; a[v * 3 + 1] += ny * f; a[v * 3 + 2] += nz * f; } }
  // (3) apple cheeks: a soft round mass forward and out under each eye, beside the nose (no lid touched: it fades out
  // 12 mm under the eye's centre)
  let peak = 0;
  for (let v = 0; v < n; v++) { if (rep[v] !== v || M.map[v] < 0) continue; const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], ax = Math.abs(x); if (z < EZ - 0.06) continue;
    const g = gauss(Math.hypot(ax - (EYEX + 0.006), (y - (EY - 0.034)) * 1.15), K.cheekR) * sm(EY - 0.008, EY - 0.02, y);
    if (g < 0.01) continue; const d = K.cheek * g; a[v * 3] += Math.sign(x) * d * 0.45; a[v * 3 + 2] += d * 0.9; a[v * 3 + 1] += d * 0.25; peak = Math.max(peak, d); }
  for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v) { a[v * 3] = a[r * 3]; a[v * 3 + 1] = a[r * 3 + 1]; a[v * 3 + 2] = a[r * 3 + 2]; } }
  M.P.setArray(a); console.log('stylize: smoothed', nb.size, 'points; cheek peak mm', (peak * 1000).toFixed(2));
}

// The skin's tone: lo = the map blurred (its tone field), out = texel * T / lo (per channel, the detail kept as a ratio
// to the local tone), T the target tone (sRGB 0..255); a blush on the cheeks and the nose's tip, from each texel's bind
// position. Run after skintone and before scalp2 (which paints the scalp's grey on the result).
export async function skinGradePass(doc, K = {}) {
  K = { T: [212, 176, 156], hand: 0.97, sigma: 40, k: 0.85, blush: 0.06, lip: 1, q: 90, ...K };
  const { EY, EZ, EYEX, MOUTHY } = LM;
  const { tex, img, S, pos } = await texelPos(doc), d = img.data;
  // (round 2b, the critic: "the grin pulls to one side": the face's shape and its smile are mirror twins now, but the
  // painted map was not (the lip's rose and the upper lip's line sat off-centre and read as a smirk as the mouth opened):
  // the face's right half repainted from its left, texel by texel at the mirrored bind position, feathered over 6 mm at
  // the midline)
  if (K.mirror !== false) { const c = 2000, G = new Map(), key = (x, y, z) => `${Math.round(x * c)},${Math.round(y * c)},${Math.round(z * c)}`, R = (i) => pos[i * 3 + 1] > 1.44 && pos[i * 3 + 2] > -0.02 && Math.abs(pos[i * 3]) < 0.1;
    for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3 + 1]) || !R(i) || pos[i * 3] < 0) continue; const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); if (!G.has(k)) G.set(k, i); }
    const src = Buffer.from(d); let m = 0;
    for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3 + 1]) || !R(i) || pos[i * 3] >= 0) continue; const x = -pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let q = -1, best = 1e9; const cx = Math.round(x * c), cy = Math.round(y * c), cz = Math.round(z * c);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const j = G.get(`${cx + a},${cy + b},${cz + e}`); if (j === undefined) continue; const dd = Math.hypot(pos[j * 3] - x, pos[j * 3 + 1] - y, pos[j * 3 + 2] - z); if (dd < best) { best = dd; q = j; } }
      if (q < 0) continue; const f = sm(0, 0.006, x); for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.round(src[i * 4 + k] * (1 - f) + src[q * 4 + k] * f); m++; }
    console.log('skin grade: face texels mirrored', m); }
  // (round 2b: a normalised blur, the empty atlas between the islands left out: the plain blur pulled the small islands'
  // tone (the fingers, the hands) toward black, so the ratio texel / tone lifted them: the hands rendered near white)
  const W8 = Buffer.alloc(S * S * 3), M8 = Buffer.alloc(S * S); for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3 + 1])) continue; for (let c = 0; c < 3; c++) W8[i * 3 + c] = d[i * 4 + c]; M8[i] = 255; }
  const bl = await sharp(W8, { raw: { width: S, height: S, channels: 3 } }).blur(K.sigma).raw().toBuffer(), bm = await sharp(M8, { raw: { width: S, height: S, channels: 1 } }).blur(K.sigma).extractChannel(0).raw().toBuffer(), lo = new Float32Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { const m = bm[i] / 255; for (let c = 0; c < 3; c++) lo[i * 4 + c] = m > 0.02 ? bl[i * 3 + c] / m : d[i * 4 + c]; }
  let n = 0;
  for (let i = 0; i < S * S; i++) { const y = pos[i * 3 + 1]; if (Number.isNaN(y)) continue; const x = pos[i * 3], z = pos[i * 3 + 2];
    const hand = Math.abs(x) > 0.3 && y < 1.2 ? K.hand : 1;
    const bl = K.blush * (gauss(Math.hypot(Math.abs(x) - (EYEX + 0.01), y - (EY - 0.035)), 0.016) * (z > EZ - 0.05 ? 1 : 0) + 0.6 * gauss(Math.hypot(x, y - (MOUTHY + 0.032), (z - (EZ + 0.04)) * 0.5), 0.01));
    // (the lips a soft natural rose, so the mouth reads as lips and not a cut)
    const lip = K.lip * (1 - sm(0.02, 0.028, Math.abs(x))) * (1 - sm(0.006, 0.011, Math.abs(y - MOUTHY))) * (z > EZ - 0.02 ? 1 : 0);
    const tint = [(1 + bl) * (1 - lip * 0.08), (1 - bl * 0.45) * (1 - lip * 0.3), (1 - bl * 0.5) * (1 - lip * 0.26)];
    for (let c = 0; c < 3; c++) { const l = Math.max(8, lo[i * 4 + c]), r = d[i * 4 + c] / l; d[i * 4 + c] = Math.max(0, Math.min(255, K.T[c] * hand * tint[c] * (1 + (r - 1) * K.k))); }
    n++; }
  await setWebp(tex, d, S, S, K.q, 4);
  console.log('skin grade: texels', n, 'tone', K.T.join(','));
}

export async function hairWhitePass(doc, K = {}) {
  K = { lo: 40, hi: 160, out0: 176, out1: 250, g: 0.7, tint: [0.975, 0.985, 1.0], cap: [0.74, 0.76, 0.79], ...K };
  const m = matOf(doc, 'hair'), t = m.getBaseColorTexture(), { data, w, h } = await rgba(t);
  for (let i = 0; i < w * h; i++) { const l = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, u = Math.max(0, Math.min(1, (l - K.lo) / (K.hi - K.lo))) ** K.g, v = K.out0 + (K.out1 - K.out0) * u;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, v * K.tint[c]); }
  await setWebp(t, data, w, h, 90, 4); m.setBaseColorFactor([1, 1, 1, 1]);
  matOf(doc, 'hairCap')?.setBaseColorFactor([...K.cap, 1]);
  console.log('hair white: atlas', w, 'x', h, 'out', K.out0, '-', K.out1);
}

export function proportionPass(doc, K = {}) {
  K = { head: 1.02, hand: 1.0, neckDown: 0.0, neckBack: 0.004, ...K };
  const N = (nm) => doc.getRoot().listNodes().find((n) => n.getName() === nm);
  const h = N('head'), t = h.getTranslation(); h.setScale([K.head, K.head, K.head]).setTranslation([t[0], t[1] - K.neckDown, t[2] - K.neckBack]);
  for (const w of ['wrist_L', 'wrist_R']) { const n = N(w), s = n.getScale()[0] * K.hand; n.setScale([s, s, s]); }
  console.log('proportions: head', K.head, 'hands x', K.hand, 'neck down mm', K.neckDown * 1000, 'back mm', K.neckBack * 1000);
}

export async function outfitPass(doc, K = {}) {
  K = { pants: 0.12, leatherRough: 0.55, coat: 0.7, coatRough: 0.18, silver: [0.78, 0.79, 0.81], silverRough: 0.22, ...K };
  for (const m of doc.getRoot().listMaterials()) {
    const nm = m.getName(), ex = m.getExtras() || {};
    if (nm === 'clothes') { const t = m.getBaseColorTexture(); if (t) { const { data, w, h } = await rgba(t); let s = 0; for (let i = 0; i < w * h; i++) s += data[i * 4]; if (s / (w * h) > 40) m.setBaseColorFactor([K.pants, K.pants, K.pants * 1.04, 1]); } }
    if (nm === 'leather') { m.setRoughnessFactor(K.leatherRough); const cc = m.getExtension('KHR_materials_clearcoat'); if (cc) cc.setClearcoatFactor(K.coat).setClearcoatRoughnessFactor(K.coatRough);
      m.setExtras({ ...ex, look: { ...(ex.look || {}), leather: 'gloss', roughMin: 0.3, roughMax: 0.5, coat: K.coat, coatRough: K.coatRough } }); }
    if (nm === 'hardware' || nm === 'snaps') m.setBaseColorFactor([...K.silver, 1]).setMetallicFactor(1).setRoughnessFactor(K.silverRough);
    if (nm === 'zip-tape') m.setBaseColorFactor([1.6, 1.6, 1.65, 1].map((v) => Math.min(1, v)));
  }
  console.log('outfit: black trousers, glossy leather coat', K.coat, 'silver hardware');
}

// The glasses, round 2 (the critic: the bar lay on the brows and read as a visor): the front lowered and brought a touch
// forward, the bar its own thickness with a gentle arch over each lens, a dark fine rim round the lens (the rectangle
// reads in a tile), a darker satin gunmetal without the hinge's hot spot.
export function glassesFitPass(doc, K = {}) {
  K = { down: 0.005, fwd: 0.0012, arch: 0.0007, zFront: 0.125, zBack: 0.07, yBar: 1.627, col: [0.075, 0.078, 0.085], metal: 0.75, rough: 0.42, rim: [0.06, 0.06, 0.065, 0.9], ...K };
  const seen = new Set(); let n = 0;
  for (const p of primsOf(doc)) { const mat = p.getMaterial()?.getName() || ''; if (!/^glasses-/.test(mat)) continue;
    const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice();
    for (let i = 0; i < A.length / 3; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2], w = sm(K.zBack, K.zFront, z);
      const ar = mat === 'glasses-metal' && y > K.yBar ? K.arch * Math.max(0, 1 - ((Math.abs(x) - 0.035) / 0.032) ** 2) : 0;
      A[i * 3 + 1] = y - K.down * w + ar * w; A[i * 3 + 2] = z + K.fwd * w; n++; }
    acc.setArray(A); }
  for (const m of doc.getRoot().listMaterials()) { const nm = m.getName();
    if (nm === 'glasses-metal') m.setBaseColorFactor([...K.col, 1]).setMetallicFactor(K.metal).setRoughnessFactor(K.rough);
    if (nm === 'glasses-tips') m.setRoughnessFactor(0.5);
    if (nm === 'glasses-lens-edge') m.setBaseColorFactor(K.rim).setRoughnessFactor(0.4); }
  console.log('glasses fit: points', n, 'down mm', K.down * 1000);
}

// The hair, round 2 (the critic: "a 1950s greaser pompadour, a vertical wall"): each strand's lift above its scalp root
// bent BACK about the root (the front and top most), so the front wall folds into a broad dome swept up and back; the mass
// above the crown line compressed toward it (lower, rounder) and widened a little at the temples and over the ears.
export function hairDomePass(doc, K = {}) {
  K = { c: [0, 1.645, 0.035], bend: 32, y0: 1.575, yTop: 1.705, squash: 0.72, widen: 1.07, side: -0.004, ...K };
  const { near } = scalp(doc, K.y0); let n = 0; const th = (K.bend * Math.PI) / 180;
  for (const p of primsOf(doc)) { const mat = p.getMaterial()?.getName(); if (mat !== 'hair' && mat !== 'hairCap') continue;
    const acc = p.getAttribute('POSITION'), A = acc.getArray().slice();
    for (let i = 0; i < A.length / 3; i++) { let x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; const q = near(x, y, z); if (!q) continue;
      const ny = (q[1] - K.c[1]), nz = (q[2] - K.c[2]), L = Math.hypot(q[0] - K.c[0], ny, nz) || 1;
      const w = sm(-0.1, 0.6, nz / L) * sm(0.0, 0.5, ny / L); // the front and the top
      const tt = Math.hypot(x - q[0], y - q[1], z - q[2]), a = th * w * sm(0.004, 0.022, tt), oy = y - q[1], oz = z - q[2], ca = Math.cos(a), sa = Math.sin(a);
      y = q[1] + oy * ca + oz * sa; z = q[2] - oy * sa + oz * ca;
      if (y > K.yTop) y = K.yTop + (y - K.yTop) * K.squash;
      const ws = sm(1.6, 1.66, y) * (1 - sm(1.74, 1.78, y)); x = x * (1 + (K.widen - 1) * ws);
      A[i * 3] = x + K.side * sm(1.62, 1.7, y); A[i * 3 + 1] = y; A[i * 3 + 2] = z; n++; }
    acc.setArray(A); }
  console.log('hair dome: points', n, 'bend', K.bend);
}

// The open presenter grin as the smile morph (the critic: "a strong morph that dialogue can drive"): each side's smile
// target composed from MakeHuman's (CC0) smile, the upper lip lifted off the teeth, half a jaw drop and a dimple, so the
// engine's warm 0.45 opens a symmetric grin with an even arc of upper teeth. Written as .target files (decimetres, base
// vertex) to dir; returns their paths by name.
import { readTarget } from '../facekit.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
export function grinTargets(FACE, dir, K = {}) {
  K = { up: 0.9, jaw: 0.16, dimple: 0.2, ...K }; mkdirSync(dir, { recursive: true }); const out = {};
  const S = {};
  for (const s of ['Left', 'Right']) { const parts = [['mouthSmile' + s, 1], ['mouthUpperUp' + s, K.up], ['jawOpen', K.jaw], ['mouthDimple' + s, K.dimple]], sum = new Map();
    for (const [n, w] of parts) for (const [v, d] of readTarget(FACE + n + '.target')) { const o = sum.get(v) || [0, 0, 0]; sum.set(v, [o[0] + d[0] * w, o[1] + d[1] * w, o[2] + d[2] * w]); }
    S[s] = sum; }
  // (round 2, the critic and the owner: "the grin pulls to one side": the two halves made mirror twins of their mean, so
  // both together open one symmetric grin; each half stays one-sided)
  const T = twins(); const mir = (m) => { const o = new Map(); for (const [v, d] of m) { const t = T[v]; if (t >= 0) o.set(t, [-d[0], d[1], d[2]]); } return o; };
  const avg = (a, b) => { const o = new Map(); for (const k of new Set([...a.keys(), ...b.keys()])) { const x = a.get(k) || [0, 0, 0], y = b.get(k) || [0, 0, 0]; o.set(k, [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2]); } return o; };
  const L = avg(S.Left, mir(S.Right)), R = mir(L);
  for (const [s, sum] of [['Left', L], ['Right', R]]) {
    const f = `${dir}/mouthSmile${s}-grin.target`; writeFileSync(f, [...sum].map(([v, d]) => `${v} ${d.map((x) => x.toFixed(5)).join(' ')}`).join('\n') + '\n'); out['mouthSmile' + s] = f; }
  return out;
}
// the chin keeps still under the smile (no crease pulled into it) and its rest form is ironed (the mentolabial notch)
export function chinPass(doc, K = {}) {
  K = { iters: 30, keep: 0.012, ...K }; const { MOUTHY, CHINY } = LM;
  const M = skinMap(doc), a = M.P.getArray(), n = M.n, rep = weld(a);
  const mask = new Float32Array(n); for (let v = 0; v < n; v++) { if (rep[v] !== v || M.map[v] < 0) continue; const y = a[v * 3 + 1], ax = Math.abs(a[v * 3]), z = a[v * 3 + 2];
    if (z < 0.06) continue; mask[v] = sm(MOUTHY - 0.008, MOUTHY - 0.016, y) * sm(CHINY - 0.02, CHINY - 0.002, y) * sm(0.032, 0.02, ax); }
  const nb = new Map(); for (const p of doc.getRoot().listMeshes().flatMap((mm) => mm.listPrimitives())) { if (p.getAttribute('POSITION') !== M.P || p.getMaterial()?.getName() !== 'skin') continue; const I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const A = rep[I[t + e]], B = rep[I[t + (e + 1) % 3]]; if (!mask[A] && !mask[B]) continue; for (const [u, w] of [[A, B], [B, A]]) (nb.get(u) || nb.set(u, new Set()).get(u)).add(w); } }
  const b = a.slice(); const step = (f) => { const o = b.slice(); for (const [v, s] of nb) { const m = mask[v]; if (!m) continue; const c = [0, 0, 0]; for (const w of s) for (let k = 0; k < 3; k++) c[k] += o[w * 3 + k]; for (let k = 0; k < 3; k++) b[v * 3 + k] = o[v * 3 + k] + f * m * (c[k] / s.size - o[v * 3 + k]); } };
  for (let i = 0; i < K.iters; i++) { step(0.5); step(-0.52); }
  for (let v = 0; v < n; v++) { const r = rep[v]; for (let k = 0; k < 3; k++) b[v * 3 + k] = b[r * 3 + k]; }
  M.P.setArray(b); console.log('chin: ironed', nb.size, 'points');
}
// after 'morphs': the smile targets' deltas faded out below the lower lip (the chin stays put as the grin opens; the jaw
// part of the grin still carries the chin by the jawOpen share)
export function smileChinPass(doc, K = {}) {
  K = { y1: LM.MOUTHY - 0.022, y0: LM.MOUTHY - 0.01, keep: 0.7, ...K }; let n = 0;
  const M = skinMap(doc); const a = M.P.getArray();
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { if (p.getAttribute('POSITION') !== M.P) continue;
    for (const t of p.listTargets()) { if (!/^mouthSmile/.test(t.getName())) continue; const acc = t.getAttribute('POSITION'); if (acc.__chin) continue; acc.__chin = 1; const D = acc.getArray().slice();
      for (let v = 0; v < D.length / 3; v++) { const y = a[v * 3 + 1]; if (y > K.y0 || Math.abs(a[v * 3]) > 0.04) continue; const f = K.keep + (1 - K.keep) * sm(K.y1, K.y0, y); for (let k = 0; k < 3; k++) D[v * 3 + k] *= f; n++; }
      acc.setArray(D); } }
  console.log('smile chin: points faded', n);
}
