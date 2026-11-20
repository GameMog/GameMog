// Hand-built old boss, pass 3 (after the pass-2 review: "the tie has a mottled, blotchy red texture; Mr. Big's is clean
// silk with stripes", and a white fleck on the tie's edge):
//  tie stripe  the tie's texels (tiePass's rectangle, the collar's white kept) repainted as a clean regimental repp, his
//              own and not Mr. Big's red-and-white: a burgundy ground, a navy band and a thin silver line on the bias,
//              a fine twill, no noise and none of the old stripe's shading (which read as blotches); a little rougher
//              (0.42 -> 0.55) so the knot's lumps stop catching the key light in patches
//  fleck       the collar's white spike that runs down into the tie's island (x 405-430, y 116-142 at 1024) painted as tie
import { matOf, rgba, setWebp, sharp } from '../young-hero/glb.mjs';
export async function tieStripePass(doc, K = {}) {
  K = { base: [96, 27, 36], navy: [30, 34, 58], silver: [128, 124, 130], period: 15, rough: 0.55, ...K };
  const mat = matOf(doc, 'clothes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), k = w / 1024;
  const R = [Math.round(350 * k), Math.round(60 * k), Math.round(446 * k), Math.round(206 * k)];
  const L = (i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  const spike = (x, y) => { const gx = x / k, gy = y / k; return gy >= 116 && gy <= 142 && gx >= 405 && gx < (gy <= 122 ? 421 : 430); };
  const sat = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  // (tiePass painted every texel of the rectangle but the collar's white (L > 120, unsaturated): the same split here)
  const isTie = (x, y, i) => spike(x, y) ? L(i) > 70 || sat(i) > 30 : !(L(i) > 120 && sat(i) < 40);
  const mask = new Uint8Array(w * h); let n = 0;
  for (let y = R[1]; y < R[3]; y++) for (let x = R[0]; x < R[2]; x++) { const i = y * w + x; if (!isTie(x, y, i)) continue; mask[i] = 1;
    const gx = x / k, gy = y / k, u = (((gx + gy) % K.period) + K.period) % K.period;
    // (navy band 3.2 px, then 2.2 px of ground, a 1 px silver line, the rest ground; edges anti-aliased)
    const band = (a, b) => Math.max(0, Math.min(1, Math.min(u - a + 0.5, b - u + 0.5)));
    const nv = band(0, 3.2), sv = band(5.4, 6.4) * 0.5, tw = ((gx + 2 * gy) % 3) < 1 ? 1.04 : 0.985;
    for (let c = 0; c < 3; c++) { const v = K.base[c] * (1 - nv - sv) + K.navy[c] * nv + K.silver[c] * sv; data[i * 4 + c] = Math.round(Math.min(255, v * tw)); } n++; }
  await setWebp(tex, data, w, h, 92);
  // (the tie's normal flat, and its roughness in the clothes' metal-rough map)
  const nt = mat.getNormalTexture(); if (nt) { const { data: nd, w: nw, h: nh } = await rgba(nt), kn = nw / w;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { const j = Math.min(h - 1, Math.floor(y / kn)) * w + Math.min(w - 1, Math.floor(x / kn)); if (!mask[j]) continue; const o = (y * nw + x) * 4; nd[o] = 128; nd[o + 1] = 128; nd[o + 2] = 255; }
    await setWebp(nt, nd, nw, nh, 92); }
  const mt = mat.getMetallicRoughnessTexture(); if (mt) { const { data: md, w: mw, h: mh } = await rgba(mt);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const X = Math.min(w - 1, Math.floor((x + 0.5) * w / mw)), Y = Math.min(h - 1, Math.floor((y + 0.5) * h / mh)); if (!mask[Y * w + X]) continue; md[(y * mw + x) * 4 + 1] = Math.round(255 * K.rough); }
    mt.setImage(await sharp(md, { raw: { width: mw, height: mh, channels: 4 } }).removeAlpha().webp({ quality: 90 }).toBuffer()); }
  console.log('tie stripe texels', n);
}
