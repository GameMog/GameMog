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
// (hair round 2, the critic: the cards read as dry-brush paint strokes, "fewer visible strand lines and more clump-level
// form"): each clump strip (0-9) is filled to a solid clump inside its own outline (the strip's alpha, blurred across, per
// row: its left and right edges), the strands' alpha kept only in a broken fringe at the edges and the tip; its value a
// soft gradient across the width (darker in the middle and at the root, lighter edges) with the strands' streaks kept at a
// quarter of their contrast
const STRIP = [[80, 467, 90], [524, 835, 151], [887, 1198, 139], [1252, 1547, 43], [1612, 1897, 54], [1978, 2257, 122],
  [2336, 2612, 1596], [2697, 2981, 2002], [3068, 3345, 1896], [3425, 3685, 2131]].map(([a, b, t]) => [a / 2, b / 2, t / 2]);
const ROOTY = 3988 / 2, fringe = Float32Array.from({ length: S }, (_, x) => band[(x * 5) % NB]);
for (const [x0, x1, ty] of STRIP) {
  const X0 = Math.floor(x0) - 6, X1 = Math.ceil(x1) + 6;
  for (let y = Math.max(0, Math.floor(ty) - 4); y < Math.min(S, ROOTY + 8); y++) {
    // the row's outline: alpha blurred across (+-6 texels), its first and last texel over 0.25
    let L = -1, Rr = -1; const bl = [];
    for (let x = X0; x <= X1; x++) { let s = 0, w = 0; for (let k = -6; k <= 6; k++) { const j = Math.min(S - 1, Math.max(0, x + k)); s += A[y * S + j]; w++; } bl.push(s / w / 255); }
    bl.forEach((v, i) => { if (v > 0.25) { if (L < 0) L = i; Rr = i; } });
    if (L < 0 || Rr - L < 3) continue;
    const t = (ROOTY - y) / (ROOTY - ty), wid = Rr - L;
    for (let i = L; i <= Rr; i++) { const x = X0 + i, q = y * S + x, u = (i - L) / wid, e = Math.abs(2 * u - 1);
      // (solid inside; the fringe (outer ~30-50% of the width, and the last quarter of the length) keeps the strands' own alpha,
      // broken by a slow noise so the edge is irregular, not a ruler line)
      const edgeK = ss(0.48 + 0.2 * fringe[x], 0.94, e), tipK = ss(0.74, 0.97, t), keep = Math.max(edgeK, tipK);
      const a0 = px[q * 4 + 3] / 255, a = Math.max(a0, (1 - keep) * 1);
      // (the value: the strands' detail at a quarter, over a smooth clump: darker middle and root, lighter edges)
      const v0 = px[q * 4] / 255, smooth = 0.86 * (0.78 + 0.22 * Math.pow(e, 1.4)) * (0.8 + 0.2 * ss(0, 0.2, t)) * (1 + 0.05 * tipK);
      const v = Math.min(1, smooth * (1 + 0.25 * (v0 / 0.86 - 1)));
      px[q * 4] = px[q * 4 + 1] = px[q * 4 + 2] = Math.round(255 * v); px[q * 4 + 3] = Math.round(255 * Math.min(1, a)); }
  }
}
const buf = await sharp(px,{ raw: { width: S, height: S, channels: 4 } }).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toBuffer();
(await import('node:fs')).writeFileSync(out, buf);
console.log('hair atlas', out, S, 'x', S, (buf.length / 1024).toFixed(0), 'KB');
