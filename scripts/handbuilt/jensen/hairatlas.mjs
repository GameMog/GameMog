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
const buf = await sharp(px, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toBuffer();
(await import('node:fs')).writeFileSync(out, buf);
console.log('hair atlas', out, S, 'x', S, (buf.length / 1024).toFixed(0), 'KB');
