// Jensen, hair round 1 (19 Nov): the strand atlas his hair cards are cut from (parts/hair-strands.webp), made once from
// "Hair Cards_FBX" by POLYTRICITY (@PolytricityLtd), Sketchfab, CC BY 4.0
// (sketchfab.com/3d-models/hair-cards-fbx-ad1ac6f162ff43a3ae175982bf770c3e), modified: its 4096 strand-alpha sheet
// (thirteen strips: five wide dense clumps, five tapered clumps of falling length, three single wavy strands) and its
// occlusion map, taken down to 2048; the colour is grey (the strand's own occlusion as a soft value range, the tint comes
// from the cards' vertex colours); the sheet's signature text in its top corner cleared.
//   node scripts/handbuilt/jensen/hairatlas.mjs <hair_cards_fbx.glb> [out.webp]
import { read, sharp } from '../young-hero/glb.mjs';
const [src, out = new URL('../../../storykit/handbuilt/jensen/parts/hair-strands.webp', import.meta.url).pathname] = process.argv.slice(2);
if (!src) throw new Error('usage: hairatlas.mjs <hair_cards_fbx.glb> [out.webp]');
const { doc } = await read(src);
const m = doc.getRoot().listMaterials()[0], base = m.getBaseColorTexture(), occ = m.getOcclusionTexture();
const S = 2048;
const A = await sharp(Buffer.from(base.getImage())).extractChannel(1).resize(S, S, { kernel: 'lanczos3' }).raw().toBuffer();
const O = await sharp(Buffer.from(occ.getImage())).extractChannel(0).resize(S, S, { kernel: 'lanczos3' }).raw().toBuffer();
// (strand groups that survive the mip chain: at a game's distance a card's single strands blur into a solid ribbon, so
// the strands are gathered into groups of a few texels with thinner gaps between them (a smooth 1-D noise across the
// strip, drifting slowly along it), the groups' value varied too: streaks along the flow, a broken edge)
let sd = 3; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
const NB = S + 64, raw = Float32Array.from({ length: NB }, rn), band = new Float32Array(NB), band2 = new Float32Array(NB);
for (let x = 0; x < NB; x++) { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const g = Math.exp(-(k * k) / 8), j = Math.min(NB - 1, Math.max(0, x + k)); s += raw[j] * g; w += g; } band[x] = s / w; }
for (let x = 0; x < NB; x++) { let s = 0, w = 0; for (let k = -20; k <= 20; k++) { const g = Math.exp(-(k * k) / 120), j = Math.min(NB - 1, Math.max(0, x + k)); s += raw[(j * 7) % NB] * g; w += g; } band2[x] = s / w; }
const nb = (a) => { let lo = Infinity, hi = -Infinity; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); } for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / (hi - lo); };
nb(band); nb(band2);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = y * S + x, xx = Math.round(x + 24 + 6 * Math.sin(y / 260) + 3 * Math.sin(y / 97 + x / 400)), g = band[Math.min(NB - 1, Math.max(0, xx))], g2 = band2[Math.min(NB - 1, Math.max(0, xx))];
  // (the signature text, top right of the sheet: never used by a card, cleared)
  const a = y < 100 && x > 1100 ? 0 : A[i] * (0.3 + 0.7 * ss(0.22, 0.62, g)) * Math.min(1, 1.25 * (0.75 + 0.5 * g2));
  // (a strand's value: by its occlusion (the clumps' inner strands a little darker) and its group's streak)
  const v = Math.round(255 * Math.min(1, (0.58 + 0.42 * (O[i] / 255)) * (0.72 + 0.28 * g) * (0.85 + 0.15 * g2) * 1.12));
  px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = Math.round(Math.min(255, a));
}
// (hair round 3, the critic: the round-2 atlas "reads like dry-brush paint with smeared streaks"): each clump strip (0-9) is
// redrawn as fine strands inside its own outline (the source strip's alpha, blurred across, per row: its left and right
// edges), the outline kept, the strands new: two depth layers of long thin strands (about 1.1-1.7 texels wide at 2048,
// one every ~1.6 texels), each wandering slowly across the strip and ending at its own length (shorter at the edges: a
// tapered tip of single strands, no streak band); the core under them filled solid (alpha-test coverage, no see-through)
// with the under-layer's darker value, so the strands read as high-frequency lines along the length; a consistent root to
// tip gradient (darker root, lighter tip) and a soft alpha fade at the root (no straight cut edge where a card starts)
const STRIP = [[80, 467, 90], [524, 835, 151], [887, 1198, 139], [1252, 1547, 43], [1612, 1897, 54], [1978, 2257, 122],
  [2336, 2612, 1596], [2697, 2981, 2002], [3068, 3345, 1896], [3425, 3685, 2131]].map(([a, b, t]) => [a / 2, b / 2, t / 2]);
const ROOTY = 3988 / 2;
for (const [x0, x1, ty] of STRIP) {
  const X0 = Math.floor(x0) - 6, X1 = Math.ceil(x1) + 6, Y0 = Math.max(0, Math.floor(ty) - 4), Y1 = Math.min(S, Math.ceil(ROOTY) + 8);
  // the outline per row (as round 2): the blurred alpha's first and last texel over 0.25, then smoothed along the length
  const Lr = new Float32Array(Y1), Rr = new Float32Array(Y1).fill(-1);
  for (let y = Y0; y < Y1; y++) { const bl = [];
    for (let x = X0; x <= X1; x++) { let s = 0; for (let k = -6; k <= 6; k++) s += A[y * S + Math.min(S - 1, Math.max(0, x + k))]; bl.push(s / 13 / 255); }
    let L = -1, R = -1; bl.forEach((v, i) => { if (v > 0.25) { if (L < 0) L = i; R = i; } }); Lr[y] = X0 + L; Rr[y] = L < 0 ? -1 : X0 + R; }
  const sLr = Float32Array.from(Lr), sRr = Float32Array.from(Rr);
  for (let y = Y0; y < Y1; y++) { if (Rr[y] < 0) continue; let sl = 0, sr = 0, w = 0; for (let k = -90; k <= 90; k++) { const j = y + k; if (j < Y0 || j >= Y1 || Rr[j] < 0) continue; sl += Lr[j]; sr += Rr[j]; w++; } sLr[y] = sl / w; sRr[y] = sr / w; }
  // the strands: [u across 0..1, its end along the length 0..1, width (texels), value, wander phase and amplitude, depth]
  const wid0 = (x1 - x0), NS = Math.round(wid0 / 1.6), st = [];
  for (let k = 0; k < NS; k++) { const u = rn(), e = Math.abs(2 * u - 1), back = rn() < 0.45;
    const end = Math.min(1, 1.02 - 0.32 * e * e - 0.22 * rn() * rn() - (back ? 0.06 : 0));
    st.push({ u, end, w: 0.55 + 0.3 * rn(), v: back ? 0.5 + 0.16 * rn() : (rn() < 0.12 ? 0.55 + 0.1 * rn() : 0.78 + 0.22 * rn()), ph: rn() * 6.28, ph2: rn() * 6.28, amp: 0.006 + 0.014 * rn(), back }); }
  st.sort((a, b) => (a.back === b.back ? 0 : a.back ? -1 : 1));
  const accA = new Float32Array(X1 - X0 + 1), accV = new Float32Array(X1 - X0 + 1);
  // (the sheet's own marks above a strip's tip and under its root: cleared)
  for (let y = 0; y < S; y++) if (y < Y0 || y >= Y1) for (let x = X0; x <= X1; x++) px[(y * S + x) * 4 + 3] = 0;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x <= X1; x++) { const q = y * S + x; px[q * 4 + 3] = 0; }
    if (Rr[y] < 0) continue;
    const L = sLr[y], wid = Math.max(3, sRr[y] - L), t = (ROOTY - y) / (ROOTY - ty);
    if (t < -0.01) continue;
    accA.fill(0); accV.fill(0);
    // (the core, under the strands: solid in the middle of the width and the first 70% of the length, the darker under-hair)
    for (let x = X0; x <= X1; x++) { const u = (x - L) / wid, e = Math.abs(2 * u - 1); if (u < 0 || u > 1) continue;
      const a = (1 - ss(0.5, 0.82, e)) * (1 - ss(0.55, 0.86, t)); accA[x - X0] = a; accV[x - X0] = 0.48; }
    for (const s of st) { if (t > s.end) continue;
      const tt = t / s.end, uu = s.u + s.amp * Math.sin(t * 9 + s.ph) + 0.4 * s.amp * Math.sin(t * 23 + s.ph2), cx = L + uu * wid;
      // (a strand thins and fades over its last 12%: the tapered tip)
      const tk = 1 - ss(0.88, 1, tt), w = s.w * (0.45 + 0.55 * tk), a0 = 0.95 * (0.35 + 0.65 * tk);
      for (let x = Math.floor(cx - 3 * w); x <= Math.ceil(cx + 3 * w); x++) { if (x < X0 || x > X1) continue; const dx = (x + 0.5 - cx) / w, a = a0 * Math.exp(-dx * dx);
        const i = x - X0; accV[i] = accV[i] * (1 - a) + s.v * a; accA[i] = 1 - (1 - accA[i]) * (1 - a); } }
    // (the root: alpha fades in over the first ~5% of the length, broken strand by strand; the value darker at the root)
    const grad = 0.8 + 0.2 * ss(0, 0.75, t);
    for (let x = X0; x <= X1; x++) { const i = x - X0, q = y * S + x, rf = ss(0.0, 0.07, t);
      px[q * 4] = px[q * 4 + 1] = px[q * 4 + 2] = Math.round(255 * Math.min(1, accV[i] * grad));
      px[q * 4 + 3] = Math.round(255 * Math.min(1, accA[i] * rf)); }
  }
}
const buf = await sharp(px,{ raw: { width: S, height: S, channels: 4 } }).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toBuffer();
(await import('node:fs')).writeFileSync(out, buf);
console.log('hair atlas', out, S, 'x', S, (buf.length / 1024).toFixed(0), 'KB');
