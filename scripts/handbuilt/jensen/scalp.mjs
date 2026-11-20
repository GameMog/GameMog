// Hand-built Jensen: John's scalp pass (john/scalp.mjs) unchanged but for its landmarks, which are Jensen's (./landmarks.mjs);
// his settings are in build.mjs. John's notes follow.
// Hand-built John, the scalp and hairline, painted into the skin texture under and around the swept-back cut:
//  The forge left the head's sides (temples, above and behind the ears, the nape) as MakeHuman's light-brown buzz paint,
//  so between the cut's cards and the face a pale band with a hard vertical edge ran down each temple in daylight. Here
//  the whole hair area (a man's hairline: the front at the top of the forehead with a slight recession at the temples,
//  the temple line down to short sideburns in front of the ears, round the ears with a gap, a tapered nape) is painted
//  as short dark hair (root colour, a fine directional grain, a few greys), and its edge is graded over ~6 mm: the hairs
//  thin out by density (dithered by noise, no solid edge, no comb teeth) into skin that keeps its own tone.
//  Outside the hair the old buzz paint is replaced by the forehead's skin tone (detail kept).
import { matOf, setWebp, fbm, h3, sm, clamp, sharp } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { LM } from './landmarks.mjs';
// (likeness round 2: the front hairline's height over the eyes settable, scalpPass K.front: his is lower than John's)
export const HL = { front: 0.071 };
export function hairOf(x0, y, z, n = 0) {
  if (HL.area) return HL.area(x0, y, z, n);
  const { EY, EZ } = LM, x = Math.abs(x0);
  // front hairline: the top of the forehead, a little recession at the temples
  const yf = EY + HL.front + 0.006 * sm(0.012, 0.04, x) + n * 0.002;
  const front = sm(yf - 0.003, yf + 0.004, y);
  // the side: hair behind the temple line (z behind zt), down to the sideburn (in front of the ear) or the nape
  const zt = EZ - 0.068 - 0.012 * sm(EY + 0.06, EY + 0.0, y) + n * 0.002;
  const ysb = EY - 0.03 - 0.06 * sm(0.02, -0.03, z) + n * 0.002;
  const side = sm(zt + 0.004, zt - 0.004, z) * sm(ysb - 0.003, ysb + 0.004, y) * sm(0.03, 0.05, x + 0.04 * sm(0.0, -0.05, z));
  // the ear clear (an ellipse round it, a 5 mm gap)
  const ex = (y - (EY - 0.016)) / 0.036, ez = (z - 0.034) / 0.031, ed = Math.hypot(ex, ez), ear = sm(0.058, 0.07, x) * sm(1.25, 1.05, ed);
  return clamp(Math.max(front, side) * (1 - ear));
}
export async function scalpPass(doc, K = {}) {
  K = { root: [26, 20, 17], tip: [52, 42, 35], grey: [112, 108, 104], band: 0.006, ...K }; if (K.front) HL.front = K.front; if (K.area) HL.area = K.area;
  const { EY, EZ } = LM, { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const blur = await sharp(d, { raw: { width: S, height: S, channels: 4 } }).blur(24).raw().toBuffer();
  // the forehead's tone (clean skin)
  const ft = [0, 0, 0]; let fn = 0;
  for (let i = 0; i < N2; i++) { const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(x) || head[i] < 0.9) continue; if (x < 0.03 && y > EY + 0.03 && y < EY + 0.055 && z > EZ - 0.02) { for (let k = 0; k < 3; k++) ft[k] += lin(blur[i * 4 + k]); fn++; } }
  for (let k = 0; k < 3; k++) ft[k] /= Math.max(1, fn);
  let nh = 0, ns = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(X) || head[i] < 0.5 || y < EY - 0.12) continue; const x = Math.abs(X);
    // (only the cranium: above the eyes' level, or behind the face (the temples, round the ears, the nape))
    const cran = Math.max(sm(EY + 0.035, EY + 0.05, y), sm(EZ - 0.045, EZ - 0.065, z) * sm(0.035, 0.05, x + 0.05 * sm(0, -0.04, z)));
    if (cran <= 0) continue;
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]);
    // outside the hair: the buzz paint to the forehead's skin (its fine detail at half)
    const lb = (lin(blur[i * 4]) + lin(blur[i * 4 + 1]) + lin(blur[i * 4 + 2])) / 3 + 1e-4, hi = Math.pow(clamp((r + g + b) / 3 / lb, 0.3, 3), 0.5);
    const out = cran; r = r * (1 - out) + ft[0] * hi * out; g = g * (1 - out) + ft[1] * hi * out; b = b * (1 - out) + ft[2] * hi * out;
    // the hair: density graded at the edge, a dithered threshold by a fine noise (single hairs at the edge)
    const n = fbm(X, y, z, 60) - 0.5, H = hairOf(X, y, z, n * 2);
    if (H > 0) { // hairs: short strokes along the growth (back and down on the sides, back on top): cell noise stretched along it
      const along = y * 900 + z * 900, across = X * 2400 + (y - z) * 400, st = h3(Math.floor(across), Math.floor(along / 6), 5), fine = h3(Math.floor(X * 3000), Math.floor(y * 3000), Math.floor(z * 3000));
      const dens = H >= 0.999 ? 1 : H, hair = st < dens * 0.9 + 0.1 * dens ? 1 : 0, cover = Math.min(1, dens * (0.55 + 0.45 * hair));
      const t = 0.35 + 0.4 * fine + 0.25 * n, isGrey = h3(Math.floor(across), Math.floor(along / 3), 23) < 0.035 * sm(0.04, 0.065, x);
      const c = isGrey ? K.grey : K.root.map((q, k) => q + (K.tip[k] - q) * t);
      r = r * (1 - cover) + lin(c[0]) * cover; g = g * (1 - cover) + lin(c[1]) * cover; b = b * (1 - cover) + lin(c[2]) * cover; nh++; }
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); ns++; }
  // (the island's border: texels off the head's triangles within 4 px of the painted hair take its colour, so a mip
  // never pulls the old light paint in along the seams at the back)
  let nd = 0; for (let pass = 0; pass < 4; pass++) { const src = Buffer.from(d); for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) { const i = y * S + x; if (!Number.isNaN(pos[i * 3])) continue;
      for (const j of [i - 1, i + 1, i - S, i + S]) { if (Number.isNaN(pos[j * 3]) && pass === 0) continue; if (pass === 0 ? !(head[j] > 0.5 && pos[j * 3 + 1] > EY - 0.12 && hairOf(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]) > 0.5) : !(src[j * 4 + 3] === 254)) continue;
        for (let k = 0; k < 3; k++) d[i * 4 + k] = src[j * 4 + k]; d[i * 4 + 3] = 254; nd++; break; } } }
  for (let i = 0; i < N2; i++) if (d[i * 4 + 3] === 254) d[i * 4 + 3] = 255;
  await setWebp(tex, d, S, S, 90); console.log('scalp texels', ns, 'hair texels', nh, 'seam texels', nd);
}
