// Hand-built cast, the daylight skin pass (Pickup Time plays almost all in broad midday sun): in the studio's high sun
// and sky every hand-built face read pale cream on its lit side, a little yellow-grey and flat (waxy), the hands paler
// still. Real skin under a noon sun keeps its colour: the red of the blood under it shows most in the mid-tones and the
// lit side does not go to cream. One pass over each person's skin texture, last in the build, the same for everyone:
//  albedo   each texel's linear lightness taken down by `gain` (the lit side no longer blows to cream under ACES)
//  colour   its chroma round its own grey pushed up by `sat` (the yellow-grey cast goes; the hue each texel had is
//           kept, so lips, brows, beard and scalp paint stay what they were), and a faint warm shift `warm` (more red, less
//           blue: the blood under the skin), weighted toward the mid-tones so dark hair paint and black beards are left be
//  sheen    the skin's roughness factor set to `rough` (a soft skin sheen, not a wax one: the map's own variation kept)
// Dark texels (hair, beard, brows painted into the skin, the mouth's inside) are left alone below `dark`.
//  scalp    (Carissa's hairline) the hair paint on the scalp made matte: where the hair cards leave a gap over the painted
//           scalp (her forehead's centre, under the part) the skin's sheen caught the sky and the dark-brown paint read
//           as a pale grey patch in daylight. Every head texel above the brows whose paint is hair-dark gets roughness 1
//           in the skin's roughness map, so it reads as the hair's own colour
import { matOf, rgba, setWebp, sm, sharp } from './young-hero/glb.mjs';
import { texelPos } from './young-mother/p2.mjs';
export async function daylightSkinPass(doc, K = {}) {
  K = { gain: 0.86, sat: 1.18, warm: [1.03, 0.985, 0.97], rough: 0.95, dark: 0.03, q: 90, ...K };
  const mat = matOf(doc, 'skin'), tex = mat.getBaseColorTexture(); if (!tex) return;
  const { data, w, h } = await rgba(tex);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = lin(i);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const r = LUT[data[i * 4]], g = LUT[data[i * 4 + 1]], b = LUT[data[i * 4 + 2]], Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const t = sm(K.dark, K.dark * 3, Y); if (t <= 0) continue; // (the hair paint, the beard, the mouth's inside)
    const mid = 1 - 0.5 * sm(0.35, 0.7, Y), s = 1 + (K.sat - 1) * t, gn = 1 + (K.gain - 1) * t, Y2 = Y * gn;
    const c = [r, g, b].map((x, k) => (Y2 + (x * gn - Y2) * s) * (1 + (K.warm[k] - 1) * t * mid));
    data[i * 4] = enc(c[0]); data[i * 4 + 1] = enc(c[1]); data[i * 4 + 2] = enc(c[2]); n++;
  }
  if (K.scalp !== false) await scalpMatte(doc, data, w, K);
  await setWebp(tex, data, w, h, K.q);
  // (the mr map's G is the roughness; a factor under 1 lowers it all evenly: the sheen a touch softer, its pattern kept)
  mat.setRoughnessFactor(K.rough);
  console.log('daylight skin: texels', n, 'of', w * h, 'gain', K.gain, 'sat', K.sat);
}

async function scalpMatte(doc, data, w, K) {
  const mat = matOf(doc, 'skin'), mr = mat.getMetallicRoughnessTexture(); if (!mr) return;
  const { pos, head, S } = await texelPos(doc); if (S !== w) return;
  // the eyes' height: the head's front-most texels' mean height is near the nose; the brows sit ~4 cm over the eye line.
  // (from the forge's landmarks when the GLB has them)
  const x0 = doc.getRoot().getAsset().extras || {}, lm = x0.landmarks || x0.forge?.landmarks || {}; let ey = lm.ey;
  if (!ey) { let zmax = -9; for (let i = 0; i < S * S; i++) if (head[i] > 0.9 && pos[i * 3 + 2] > zmax) { zmax = pos[i * 3 + 2]; ey = pos[i * 3 + 1] + 0.035; } }
  const m = await rgba(mr), W = m.w, k = W / S; let n = 0;
  for (let i = 0; i < S * S; i++) { const y = pos[i * 3 + 1]; if (Number.isNaN(y) || head[i] < 0.5 || y < ey + 0.035) continue;
    const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3; const t = sm(105, 70, L); if (t <= 0) continue;
    const X = Math.floor((i % S) * k), Y = Math.floor(Math.floor(i / S) * k), j = (Y * W + X) * 4; m.data[j + 1] = Math.max(m.data[j + 1], Math.round(255 * t + m.data[j + 1] * (1 - t))); n++; }
  await setWebp(mr, m.data, W, m.h, 90); console.log('scalp matte: texels', n, 'eye line', ey?.toFixed(4));
}
