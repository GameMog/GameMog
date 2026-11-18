// Hand-built Pedro Delgado (Pickup Time's villain, a Miami underboss in his fifties): Mog City's Mr. Big (the cast's A
// bar, public/storykit/cast/mogcity/mrbig.glb, never changed) with a black beard, and the mouth and eyes his GLB lacks
// (Mog City's study scene adds them to Mr. Big at runtime, wagmi/mission/mrbig.js; a story's cutscene draws the GLB as it
// is). Face, silver hair, suit, rig, his own ten clips, texture sizes, normal and roughness maps: Mr. Big's.
//   node scripts/handbuilt/pedro/build.mjs [out.glb] [--only=beard,...] [--skip=...]
//  beard  the 4 hair shells' strokes and the beard painted into the skin re-dyed from silver to a natural black: each
//         texel's own light and dark kept (the strokes' roots, mids and tips), mapped onto a dark warm brown-black (tips
//         ~0.37 of the silver's range, so the strands catch light), clump-sized variation and a few glossy strands, the
//         shells glossier (roughness 0.42: black hair reads by its sheen). Shaped as a groomed full beard (round 2, the
//         daylight cutscene read a flat black blob with a ragged fringe on the cheeks): the strokes thinned out over the
//         last 16 texels of the outline and 44 along the cheek line (a trimmed line, not a fringe), the moustache kept
//         (the mouth's hole filled for the fades); under them a deep brown base graded into the skin, the old feathered
//         silver dots outside turned back to the local skin with a faint edge shadow (bulk: the shells pulled in to 0.72
//         of their offset)
//  warm   the whole skin texture a little warmer and deeper (it read washed out beside the black beard in daylight);
//         the skin-tone gate passes on the warm skin alone (the beard under the jaw falls in its neck band and fails it)
//  brows  silver -> a salt-and-pepper charcoal between the silver hair and the black beard (the silver brows read as
//         mismatched over a black beard)
//  eyes   wet (KHR_materials_clearcoat 1 / 0.03, as Mr. Big's study gives his at runtime); the irises (Mr. Big's read a
//         dark red, (67, 16, 7), and as red eyes in daylight) repainted a dark brown with fibres, a limbal ring and a
//         warmer collarette (the old boss's irisPass), which also clears the forge's eyes gate (OKLab L 0.245 -> over 0.25)
//  teeth  two rows and a tongue (the forge's construction, scripts/forge/core.mjs, at his lips as face.js finds them:
//         parting 75.7 mm under the eyes' middle, lips' front 8.25 mm ahead of the eyes' front), aged ivory, on the head
//         bone, appended to the body's points: 'teethUp', and 'teethLow' (the lower row and the tongue) that face.js's jaw
//         morph turns down with his chin
import { daylightSkinPass } from '../daylight.mjs';
import fs from 'node:fs';
import { read, write, prim, matOf, rgba, setWebp, h3, fbm, sm, clamp, require } from '../young-hero/glb.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
const { KHRMaterialsSpecular } = require('@gltf-transform/extensions');

const ROOT = new URL('../../../', import.meta.url).pathname;
const SRC = ROOT + 'public/storykit/cast/mogcity/mrbig.glb', DIR = ROOT + 'storykit/handbuilt/pedro/';

// a silver texel's luminance (60..225) -> a black beard's (dark warm brown-black, tips up to ~110 so the strands catch
// light), with clump variation and a few glossy strands
function dye(L, u, v, K) {
  const clump = fbm(u * 90, v * 90, 3.1, 1, 3), streak = h3(Math.floor(u * 2048), Math.floor(v * 512), 7);
  let x = K.lo + Math.max(0, L - 60) * K.gain;
  x *= 0.8 + 0.4 * clump;
  if (streak > 1 - K.glintShare) x += K.glint * (streak - (1 - K.glintShare)) / K.glintShare;
  const warm = 0.5 + 0.5 * clump;
  return [x * (1.05 + 0.05 * warm), x * (0.99 + 0.01 * warm), x * (0.9 - 0.04 * warm)];
}
// box blur of a float field (radius r), separable, edges clamped
function blur(F, W, H, r) {
  const T = new Float32Array(W * H), O = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += F[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) { T[y * W + x] = s / n; s += F[y * W + Math.min(W - 1, x + r + 1)] - F[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += T[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) { O[y * W + x] = s / n; s += T[Math.min(H - 1, y + r + 1) * W + x] - T[Math.max(0, y - r) * W + x]; } }
  return O;
}
// chamfer distance (texels) from every texel of M (1) to the nearest texel of not-M
function dist(M, W, H) {
  const D = new Float32Array(W * H), INF = 1e9, a = 1, d2 = 1.4142;
  for (let i = 0; i < W * H; i++) D[i] = M[i] ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!D[i]) continue; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + a); if (y > 0) { v = Math.min(v, D[i - W] + a); if (x > 0) v = Math.min(v, D[i - W - 1] + d2); if (x < W - 1) v = Math.min(v, D[i - W + 1] + d2); } D[i] = v; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!D[i]) continue; let v = D[i];
    if (x < W - 1) v = Math.min(v, D[i + 1] + a); if (y < H - 1) { v = Math.min(v, D[i + W] + a); if (x < W - 1) v = Math.min(v, D[i + W + 1] + d2); if (x > 0) v = Math.min(v, D[i + W - 1] + d2); } D[i] = v; }
  return D;
}
export async function beardPass(doc, K = {}) {
  K = { warm: WARM, lo: 11, gain: 0.37, glint: 50, glintShare: 0.05, skinLo: 22, skinGain: 0.26, skinC: 70, rough: 0.42, edge: 16, cheek: 44, ...K };
  const bm = matOf(doc, 'beard'), bt = bm.getBaseColorTexture(), B = await rgba(bt);
  const st = matOf(doc, 'skin').getBaseColorTexture(), S = await rgba(st);
  if (S.w !== B.w) throw new Error('beard and skin textures differ in size');
  const W = S.w, H = S.h;
  // the beard's area in the skin's uv: the shells' strokes closed into one shape (a 7-texel blur over 0.3), and each
  // texel's signed distance to its outline (inside +, outside -). The cheek line (the face island's beard's side toward
  // the eyes: its leftmost texel per row) gets a longer fade, so it reads as a trimmed line, not a fringe
  const M = new Float32Array(W * H); for (let i = 0; i < W * H; i++) M[i] = B.data[i * 4 + 3] > 0 ? 1 : 0;
  const Mb = blur(M, W, H, 7); for (let i = 0; i < W * H; i++) M[i] = Mb[i] > 0.3 ? 1 : 0;
  // (the mouth's hole in it filled for the fades, so the moustache and the lip line keep their hair; the paint itself
  // stops at the lips (sd0))
  const F = Float32Array.from(M); { const seen = new Uint8Array(W * H), st = []; for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) { const i = st.pop(); if (seen[i] || M[i]) continue; seen[i] = 1; const x = i % W, y = (i - x) / W; if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W); }
    for (let i = 0; i < W * H; i++) if (!M[i] && !seen[i]) F[i] = 1; }
  const sdOf = (Mk) => { const Di = dist(Mk, W, H), Mo = new Float32Array(W * H); for (let i = 0; i < W * H; i++) Mo[i] = Mk[i] ? 0 : 1; const Do = dist(Mo, W, H); return (i) => (Mk[i] ? Di[i] : -Do[i]); };
  const sd = sdOf(F), sd0 = sdOf(M);
  // (the mouth's rows (the hole's height and 40 texels round it) keep the plain edge: there the beard's left side is the
  // moustache's top under the nose, not the cheek line)
  let hy0 = H, hy1 = -1; for (let i = 0; i < W * H; i++) if (F[i] && !M[i]) { const y = (i / W) | 0; hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y); }
  const left = new Int32Array(H).fill(-1); for (let y = 0; y < H; y++) for (let x = Math.floor(W * 0.62); x < W; x++) if (F[y * W + x]) { left[y] = x; break; }
  const fade = (x, y) => { const i = y * W + x, d = sd(i); let f = sm(0, K.edge, d); if (x > W * 0.62 && left[y] >= 0) f *= sm(0, K.cheek * sm(hy0 - 40, hy0 - 90, y) + K.cheek * sm(hy1 + 40, hy1 + 90, y) + 1e-3, x - left[y]); return f; };
  // (a) the shells' strokes: dyed, and thinned out toward the outline (no ragged fringe standing off the cheeks)
  let ns = 0;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const i = (y * B.w + x) * 4; if (B.data[i + 3] === 0) continue;
    const L = (B.data[i] + B.data[i + 1] + B.data[i + 2]) / 3, c = dye(L, x / B.w, y / B.h, K), f = fade(x, y);
    for (let j = 0; j < 3; j++) B.data[i + j] = Math.round(clamp(c[j], 0, 255));
    // (a stroke at the edge is cut out, not made see-through: alpha-tested, so it drops below the 0.5 cutoff by its fade and a random)
    if (f < 1 && h3(x, y, 11) > f) B.data[i + 3] = 0; ns++; }
  await setWebp(bt, B.data, B.w, B.h, 95);
  bm.setRoughnessFactor(K.rough);
  // (b) the paint on the skin: the local skin colour (a 24-texel blur of the texels that are clearly skin) under the
  // silver paint's grain; inside the outline a deep brown-black base (the shells make the strands), graded into the skin
  // over the fade; outside it the old feathered silver dots become skin again, with a faint shadow for the trimmed edge
  const isSkin = new Float32Array(W * H), ch = [0, 1, 2].map(() => new Float32Array(W * H));
  for (let i = 0; i < W * H; i++) { const r = S.data[i * 4], g = S.data[i * 4 + 1], b = S.data[i * 4 + 2], C = Math.max(r, g, b) - Math.min(r, g, b); if (C >= 55) { isSkin[i] = 1; ch[0][i] = r; ch[1][i] = g; ch[2][i] = b; } }
  const wS = blur(isSkin, W, H, 24), sk = ch.map((c) => blur(c, W, H, 24));
  let np = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x, d = sd(q); if (d < -36) continue; const i = q * 4;
    const r = S.data[i], g = S.data[i + 1], b = S.data[i + 2], C = Math.max(r, g, b) - Math.min(r, g, b);
    const grey = sm(0, 1, (K.skinC - C) / (K.skinC - 12)), f = fade(x, y) * sm(-3, 2, sd0(q));
    if (grey <= 0.01 && f <= 0.01) continue;
    const ws = wS[q] > 0.02 ? wS[q] : 1, base = wS[q] > 0.02 ? [sk[0][q] / ws, sk[1][q] / ws, sk[2][q] / ws] : [r, g, b];
    // (the skin under it: the grey texels back to the local skin, the rest as they were)
    const s0 = [r + (base[0] - r) * grey, g + (base[1] - g) * grey, b + (base[2] - b) * grey];
    // (the beard's base: its own grain kept, soft)
    const L = (r + g + b) / 3, c = dye(L, x / W, y / H, { ...K, lo: K.skinLo, gain: K.skinGain, glint: 0 });
    // (the edge's shadow: the skin a little darker for 3 mm outside the trimmed line)
    const sh = 1 - 0.1 * sm(-12, 0, d) * (1 - f);
    for (let j = 0; j < 3; j++) S.data[i + j] = Math.round(clamp(s0[j] * sh + (c[j] - s0[j] * sh) * f, 0, 255)); np++; }
  if (K.warm) warmTexels(S.data, W * H, K.warm);
  await setWebp(st, S.data, W, H, 95);
  console.log('beard: shell texels', ns, 'skin texels', np);
}
// the shells pulled in toward the skin (k of their offset kept): a groomed full beard, not a mass. Each shell point
// (a beard point the skin never uses) set back along its own normal by the share of its height over the nearest skin
// point it lost
export function beardBulkPass(doc, k = 0.72) {
  const skinP = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0], beard = prim(doc, 'beard')[0];
  const P = skinP.getAttribute('POSITION'), N = skinP.getAttribute('NORMAL'), pa = P.getArray(), na = N.getArray(), ns = N.getNormalized() ? 127 : 1;
  const used = new Set(); for (const p of prim(doc, 'skin')) for (const v of p.getIndices().getArray()) used.add(v);
  const shell = [...new Set(beard.getIndices().getArray())].filter((v) => !used.has(v));
  const cell = 0.01, key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`, grid = new Map();
  for (const v of used) { if (pa[v * 3 + 1] < 1.35) continue; const kk = key(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]); (grid.get(kk) || grid.set(kk, []).get(kk)).push(v); }
  let moved = 0;
  for (const v of shell) { const x = pa[v * 3], y = pa[v * 3 + 1], z = pa[v * 3 + 2]; let best = -1, bd = 1e9;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) for (const u of grid.get(`${cx + i},${cy + j},${cz + l}`) || []) { const d = (pa[u * 3] - x) ** 2 + (pa[u * 3 + 1] - y) ** 2 + (pa[u * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = u; } }
    if (best < 0) continue;
    const n = [na[v * 3] / ns, na[v * 3 + 1] / ns, na[v * 3 + 2] / ns], L = Math.hypot(...n) || 1, h = ((x - pa[best * 3]) * n[0] + (y - pa[best * 3 + 1]) * n[1] + (z - pa[best * 3 + 2]) * n[2]) / L;
    if (h <= 0) continue; const s = (h * (1 - k)) / L;
    pa[v * 3] -= n[0] * s; pa[v * 3 + 1] -= n[1] * s; pa[v * 3 + 2] -= n[2] * s; moved++; }
  P.setArray(pa); console.log('beard bulk: shell points', shell.length, 'moved', moved);
}
// the skin a little warmer and deeper (it read washed out beside the black beard in daylight): the whole skin texture,
// so face, neck and hands stay one tone (applied in beardPass, one encode of the texture)
export const WARM = { r: 1.0, g: 0.965, b: 0.9, L: 0.96 };
export function warmTexels(data, n, K) { for (let i = 0; i < n; i++) { data[i * 4] = Math.round(data[i * 4] * K.r * K.L); data[i * 4 + 1] = Math.round(data[i * 4 + 1] * K.g * K.L); data[i * 4 + 2] = Math.round(data[i * 4 + 2] * K.b * K.L); } }
// the brows: the silver cards' own light and dark kept, lifted down to a charcoal salt-and-pepper (60-120, a third darker)
export async function browsPass(doc, K = {}) {
  K = { lo: 34, gain: 0.42, dark: 0.3, ...K };
  const t = matOf(doc, 'brows').getBaseColorTexture(), { data, w, h } = await rgba(t);
  for (let i = 0; i < w * h; i++) { if (data[i * 4 + 3] < 4) continue; const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, dark = ((i * 2654435761) >>> 0) % 100 < K.dark * 100;
    const v = (K.lo + K.gain * L) * (dark ? 0.62 : 1); data[i * 4] = Math.round(v * 1.04); data[i * 4 + 1] = Math.round(v); data[i * 4 + 2] = Math.round(v * 0.95); }
  await setWebp(t, data, w, h, 90);
}
// the teeth: scripts/forge/core.mjs's rows and tongue (centrals 8.4 mm, laterals, canines, a premolar; the lower row
// 3.3 mm behind), their light baked into one 1024x512 texture (rows: upper, lower, tongue), cut out by its alpha
const TONGUE_OUT = [0, -0.37, 0.93];
function teethGeometry({ part, lipZ, ts = 1, tone = [226, 214, 186], SOFT = 1 }) {
  const ROWS = { up: { z: -6.3, c: 0.03 / ts, y0: 4.5, y1: -4.5, S: 26 * ts, r: [0, 200], teeth: [[8.4, -2.6, 0.6, 1.1], [6.4, -2.0, 1.0, 1.6], [7.4, -2.35, 'cusp'], [6.8, -1.7, 1.5, 1.5]] },
    lo: { z: -9.6, c: 0.036 / ts, y0: 0, y1: -8, S: 21 * ts, r: [216, 400], teeth: [[5.3, -1.1, 0.35, 0.6], [5.8, -1.15, 0.6, 0.9], [6.6, -1.45, 'cusp'], [6.8, -0.9, 1.4, 1.4]] } };
  for (const R of Object.values(ROWS)) R.teeth = R.teeth.map((t) => [t[0] * ts, t[1], typeof t[2] === 'number' ? t[2] * (1 - 0.45 * SOFT) : t[2], typeof t[3] === 'number' ? t[3] * (1 - 0.45 * SOFT) : t[3]]);
  const toothVar = (k) => { let h = (k * 2654435761) >>> 0; h ^= h >>> 15; return ((h & 0xffff) / 65535 - 0.5); };
  const TW = 1024, TH = 512, img = new Uint8Array(TW * TH * 4);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cr = (q, r) => (q < r ? r - Math.sqrt(Math.max(0, r * r - (r - q) ** 2)) : 0);
  for (const [key, T] of Object.entries(ROWS)) {
    const lower = key === 'lo', sg = lower ? -1 : 1, spans = []; let s0 = 0; for (const t of T.teeth) { spans.push([s0, s0 + t[0], t]); s0 += t[0]; }
    for (let i = 0; i < TW; i++) {
      const s = -T.S + (2 * T.S * (i + 0.5)) / TW, a = Math.abs(s), sp = spans.find((q) => a < q[1]) || spans[spans.length - 1];
      const w = sp[1] - sp[0], u = Math.min(w, a - sp[0]), t = sp[2];
      let e; if (t[2] === 'cusp') { const d = Math.abs(u - w / 2) / (w / 2); e = t[1] + sg * (0.75 * (Math.sqrt(d * d + 0.04) - 0.2) + cr(u, 0.9) + cr(w - u, 0.9)); } else e = t[1] + sg * (cr(u, t[2]) + cr(w - u, t[3]));
      const x = (u / w) * 2 - 1, tk = spans.indexOf(sp) * Math.sign(s || 1) + (lower ? 40 : 0), tv = 1 + 0.06 * SOFT * toothVar(tk + 7);
      const across = (1 - 0.22 * x * x) * (0.84 + 0.16 * ss(0, 0.35, Math.min(u, w - u))) * tv;
      const side = 1 - (lower ? 0.7 * ss(4 * ts, 16 * ts, a) : 0.5 * ss(9 * ts, 24 * ts, a));
      for (let j = T.r[0]; j < T.r[1]; j++) {
        const y = T.y0 + ((T.y1 - T.y0) * (j - T.r[0] + 0.5)) / (T.r[1] - T.r[0]), inn = sg * (y - e), al = Math.min(1, Math.max(0, inn / 0.09 + 0.5));
        // (aged: the last 0.8 mm of the biting edge greyer, warmer toward the gum)
        const g = ss(2.5, 7, inn), edge = 1 - ss(0.15, 0.9, inn), k = across * (0.88 + 0.12 * ss(0, 0.6, inn)) * side * (lower ? 0.62 * (0.55 + 0.45 * ss(-4, -0.8, y)) : 0.5 + 0.5 * ss(4, -1, y)) * 0.95, o = (j * TW + i) * 4;
        img[o] = Math.round((tone[0] - 16 * g - 22 * edge) * k); img[o + 1] = Math.round((tone[1] - 26 * g - 20 * edge) * k); img[o + 2] = Math.round((tone[2] - 40 * g - 8 * edge) * k); img[o + 3] = Math.round(al * 255);
      }
    }
  }
  for (let j = 416; j < TH; j++) for (let i = 0; i < TW; i++) { const o = (j * TW + i) * 4, v = (j - 416) / (TH - 416), f = 0.42 + 0.33 * v, ph = 2 * Math.PI * (i + 0.5) / TW, fr = 0.5 + 0.5 * Math.sin(ph);
    const groove = 1 - 0.22 * Math.exp(-(((i + 0.5) / TW - 0.25) ** 2) / 0.0012) * ss(0.3, 0.9, v), rim = 0.72 + 0.28 * ss(0.5, 0.85, v), k = f * (0.55 + 0.45 * fr) * groove * rim;
    img[o] = Math.round(Math.min(255, 150 * k)); img[o + 1] = Math.round(62 * k); img[o + 2] = Math.round(54 * k); img[o + 3] = 255; }
  const pts = [], uvs = [], nrm = [], up = [], lo = [];
  const add = (p, uv, n) => { pts.push(...p); uvs.push(uv[0], uv[1]); const l = Math.hypot(...n) || 1; nrm.push(...n.map((c) => c / l)); return pts.length / 3 - 1; };
  for (const [key, T] of Object.entries(ROWS)) {
    const lower = key === 'lo', tab = [[0, 0]]; for (let x = 0, s = 0; s < T.S + 1; ) { const d = 0.02, sl = 2 * T.c * x; s += d * Math.sqrt(1 + sl * sl); x += d; tab.push([s, x]); }
    const xAt = (s) => { const a = Math.abs(s); let i = 1; while (i < tab.length - 1 && tab[i][0] < a) i++; const [s1, x1] = tab[i - 1], [s2, x2] = tab[i]; return Math.sign(s) * (x1 + ((x2 - x1) * (a - s1)) / Math.max(1e-9, s2 - s1)); };
    const N = Math.round((2 * T.S) / 0.9), YS = lower ? [T.y0, -0.8, -2, (T.y0 + 2 * T.y1) / 3, T.y1] : [T.y0, (T.y0 * 2 + T.y1) / 3, 1.5, -1, T.y1];
    const base = pts.length / 3, list = lower ? lo : up;
    for (let i = 0; i <= N; i++) {
      const s = -T.S + (2 * T.S * i) / N, x = xAt(s), n = [2 * T.c * x, lower ? 0.15 : 0.06, 1];
      for (const y of YS) add([x / 1000, part + y / 1000, lipZ + (T.z - T.c * x * x) / 1000], [(s + T.S) / (2 * T.S), (T.r[0] + ((T.y0 - y) / (T.y0 - T.y1)) * (T.r[1] - T.r[0])) / TH], n);
    }
    const RN = YS.length; for (let i = 0; i < N; i++) for (let r = 0; r < RN - 1; r++) { const a = base + i * RN + r, b = a + RN; list.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  { const base = pts.length / 3, SEG = 20, RNG = 10, TX = 0.013 * ts, TY = 0.0044, TZ = 0.0145;
    for (let r = 0; r <= RNG; r++) for (let k = 0; k <= SEG; k++) { const th = (r / RNG) * Math.PI, ph = (k / SEG) * 2 * Math.PI, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      const nl = Math.hypot(x / TX, y / TY, z / TZ), nn = [0.3 * x / TX / nl + TONGUE_OUT[0], 0.3 * y / TY / nl + TONGUE_OUT[1], 0.3 * z / TZ / nl + TONGUE_OUT[2]];
      add([x * TX, part - 0.0112 + y * TY, lipZ - 0.028 + z * TZ], [k / SEG, (416 + (0.5 + 0.5 * y) * 95) / TH], nn); }
    for (let r = 0; r < RNG; r++) for (let k = 0; k < SEG; k++) { const a = base + r * (SEG + 1) + k, b = a + SEG + 1; lo.push(a, b, a + 1, a + 1, b, b + 1); } }
  return { P: Float32Array.from(pts), UV: uvs, N: nrm, n: pts.length / 3, up, lo, img, TW, TH };
}
export async function teethPass(doc, K = {}) {
  K = { parting: 0.0757, lipZ: 0.00825, ts: 1.04, tone: [226, 214, 186], ...K };
  const R = doc.getRoot(), skinP = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const P0 = skinP.getAttribute('POSITION'), mesh = R.listMeshes().find((m) => m.listPrimitives().includes(skinP));
  const fam = mesh.listPrimitives().filter((p) => p.getAttribute('POSITION') === P0);
  // (the eyes as face.js fits them: a sphere per side, its centre's height, and its front)
  const eV = [...new Set(prim(doc, 'eyes')[0].getIndices().getArray())], PA = P0.getArray();
  const fit = (side) => { const A = Array.from({ length: 4 }, () => new Float64Array(5));
    for (const v of eV) { const x = PA[v * 3], y = PA[v * 3 + 1], z = PA[v * 3 + 2]; if (x * side <= 0) continue; const r = [2 * x, 2 * y, 2 * z, 1], s = x * x + y * y + z * z;
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; A[i][4] += r[i] * s; } }
    for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]];
      for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; } }
    const c = [A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2]]; return { c, r: Math.sqrt(Math.max(1e-8, c[0] ** 2 + c[1] ** 2 + c[2] ** 2 + A[3][4] / A[3][3])) }; };
  const eye = fit(1), ey = eye.c[1], front = eye.c[2] + eye.r, part = ey - K.parting, lipZ = front + K.lipZ;
  const T = teethGeometry({ part, lipZ, ts: K.ts, tone: K.tone });
  const skin = R.listSkins()[0], HEADI = skin.listJoints().findIndex((j) => j.getName() === 'head'); if (HEADI < 0) throw new Error('no head bone');
  const n0 = P0.getCount(), n = n0 + T.n;
  // (every attribute the body's primitives draw from, extended by the teeth's points; an attribute only some of them
  // have (the beard's colours) padded with white)
  const done = new Map();
  const grow = (acc, sem) => { if (done.has(acc)) return done.get(acc);
    const a = acc.getArray(), w = acc.getElementSize(), o = new a.constructor(n * w); o.set(a.subarray(0, n0 * w));
    const norm = acc.getNormalized(), one = norm ? (a instanceof Uint8Array ? 255 : a instanceof Uint16Array ? 65535 : a instanceof Int8Array ? 127 : a instanceof Int16Array ? 32767 : 1) : 1;
    for (let i = 0; i < T.n; i++) { const q = (n0 + i) * w;
      if (sem === 'POSITION') for (let c = 0; c < 3; c++) o[q + c] = T.P[i * 3 + c];
      else if (sem === 'NORMAL') for (let c = 0; c < 3; c++) o[q + c] = one === 1 ? T.N[i * 3 + c] : Math.round(T.N[i * 3 + c] * one);
      else if (sem.startsWith('TEXCOORD')) { o[q] = one === 1 ? T.UV[i * 2] : Math.round(T.UV[i * 2] * one); o[q + 1] = one === 1 ? T.UV[i * 2 + 1] : Math.round(T.UV[i * 2 + 1] * one); }
      else if (sem.startsWith('JOINTS')) { o[q] = HEADI; for (let c = 1; c < w; c++) o[q + c] = 0; }
      else if (sem.startsWith('WEIGHTS')) { o[q] = one; for (let c = 1; c < w; c++) o[q + c] = 0; }
      else for (let c = 0; c < w; c++) o[q + c] = one; }
    const b = doc.createAccessor().setType(acc.getType()).setArray(o).setNormalized(norm).setBuffer(acc.getBuffer());
    done.set(acc, b); return b; };
  for (const p of fam) for (const sem of p.listSemantics()) { const acc = p.getAttribute(sem); if (acc.getCount() !== n0) throw new Error('attribute count ' + sem); p.setAttribute(sem, grow(acc, sem)); }
  for (const acc of done.keys()) if (!acc.listParents().some((x) => x.propertyType === 'Primitive')) acc.dispose();
  // the materials: the texture once (the rows and the tongue), shared
  const sharpLib = require('sharp');
  const tex = doc.createTexture('teeth').setImage(await sharpLib(Buffer.from(T.img), { raw: { width: T.TW, height: T.TH, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toBuffer()).setMimeType('image/webp');
  const spec = doc.createExtension(KHRMaterialsSpecular);
  const mat = (name, rough) => doc.createMaterial(name).setBaseColorTexture(tex).setRoughnessFactor(rough).setMetallicFactor(0).setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true)
    .setExtension('KHR_materials_specular', spec.createSpecular().setSpecularFactor(0.5));
  const mUp = mat('teethUp', 0.5), mLo = mat('teethLow', 0.56);
  const ref = fam[0], idx = (list) => doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(list.map((i) => n0 + i))).setBuffer(ref.getIndices().getBuffer());
  for (const [list, m] of [[T.up, mUp], [T.lo, mLo]]) { const p = doc.createPrimitive().setIndices(idx(list)).setMaterial(m).setMode(ref.getMode());
    for (const sem of ref.listSemantics()) p.setAttribute(sem, ref.getAttribute(sem)); mesh.addPrimitive(p); }
  console.log('teeth', T.n, 'points; up', T.up.length / 3, 'lo+tongue', T.lo.length / 3, 'tris; eyes', ey.toFixed(4), 'front', front.toFixed(4), 'parting', part.toFixed(4), 'lipZ', lipZ.toFixed(4));
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2), OUT = args.find((a) => !a.startsWith('--')) || DIR + 'pedro.glb';
  const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(','), skip = new Set(args.find((a) => a.startsWith('--skip='))?.slice(7).split(',') || []);
  const on = (k) => (!only || only.includes(k)) && !skip.has(k);
  const { doc, src } = await read(SRC);
  const steps = [['beard', () => beardPass(doc)], ['bulk', () => beardBulkPass(doc)], ['brows', () => browsPass(doc)], ['eyes', () => eyesPass(doc)], ['iris', () => irisPass(doc, { base: [86, 56, 36] })], ['teeth', () => teethPass(doc)],
    // (the daylight skin pass, last: Pickup Time plays in midday sun; scripts/handbuilt/daylight.mjs; Pedro's base was
    // already warmed in round 2, so a lighter touch)
    ['daylight', () => daylightSkinPass(doc, { gain: 0.92, sat: 1.06, q: 95 })]];
  for (const [k, f] of steps) if (on(k)) { const t = Date.now(); await f(); console.log('step', k, ((Date.now() - t) / 1000).toFixed(1), 's'); }
  fs.mkdirSync(DIR, { recursive: true });
  const glb = await write(doc, src); fs.writeFileSync(OUT, glb); console.log(OUT, glb.length, 'bytes', (glb.length / 1048576).toFixed(2), 'MB');
}
