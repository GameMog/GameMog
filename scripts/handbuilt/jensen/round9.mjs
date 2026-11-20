// Jensen, caricature round 9 (the owner after round 7: "Jensen skin now looks too white"; the critic on round 8: in the
// game's kitchen call the tile still read washed-out pale, about as light as the fair stage manager; the reference a
// deeper light-medium with warm golden undertones; the neck, ears and forehead lighter and pinker than the face, so the
// head read as a mask; the hair a little grey under the kitchen lights with a pale band at the hairline; the browline
// still one thick bar; the rest smile tight-lipped; the brows a flat grey patch).
// Universal cues only: nothing about the eyes' shape or any racialised feature; the skin a realism correction toward the
// reference photos under neutral light (neither orange nor white).
//   skinEvenPass(doc)  the skin's low-frequency tone on the neck, ears, forehead and hands pulled to the face's own cheek
//                      tone (the detail kept as a ratio), the ears a touch warmer, so the head and hands read as one skin
// Original procedural work (no photographs, no assets), CC0.
import { setWebp, sm, sharp } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { LM } from './landmarks.mjs';

const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
const tl = (c) => Math.pow(c / 255, 2.2);

export const R9 = {
  // the graded map's tone: about 8% lower in value than round 8's 196,150,122, the undertone a little golden (more green,
  // less blue relative to red) in place of pink
  skinT: [148, 106, 80],
  // the jaw's and neck's cooling (paint7) mostly off: it left the neck paler and pinker than the face
  paint7: { cool: 0.25 },
  even: { sigma: 28, k: 0.85, ear: [1.035, 0.99, 0.97], fore: 0.9, neck: 0.9 },
  // the rest: a warm presenter smile, both corners lifted more and evenly, the lips just parted (a hint of the upper
  // teeth), the upper lip's shelf flattened by lifting it, no pout
  grin: [['mouthSmileLeft', 0.62], ['mouthSmileRight', 0.62], ['mouthStretchLeft', 0.28], ['mouthStretchRight', 0.28], ['mouthRollLower', 0.18], ['mouthLowerDownLeft', 0.22], ['mouthLowerDownRight', 0.22],
    ['mouthUpperUpLeft', 0.2], ['mouthUpperUpRight', 0.2], ['jawOpen', 0.09], ['cheekSquintLeft', 0.42], ['cheekSquintRight', 0.42], ['browInnerUp', 0.1], ['browOuterUpLeft', 0.22], ['browOuterUpRight', 0.22]],
  // the browline: each upper rim over its own lens and arching visibly, the bar ~30% thinner, a dark gunmetal with a
  // faint purple cast
  glasses: { thick: 0.55, arc: 0.0034, bridgeThin: 0.4, bridgeDrop: 0.0016, rim: [0.17, 0.16, 0.2] },
  // the hair brighter (near white with cool silver lowlights); its hairline edge fading to the new skin tone (the old
  // edge colour was round 2's pale pink-white, which read as a wig cap's band); more lumps and a rougher edge
  hair: { tone: [0.84, 0.85, 0.88], low: [0.2, 0.215, 0.26], skinEdge: [tl(176) * 1.02, tl(136), tl(104)], lump: 0.3, domeLump: 0.18, edgeJit: 0.0095, breakup: 1 },
  // the brows: a darker salt-and-pepper than the hair, an arch, a tapering tail; their soft edge the new skin tone
  brows: { col: [0.03, 0.03, 0.033], tip: [0.075, 0.075, 0.08], salt: [0.17, 0.17, 0.18], streak: 0.35, wOut: 0.0034, up: 0.0004, droop: 0.0016, skin: [tl(176), tl(136), tl(104)] },
};

export async function skinEvenPass(doc, K = {}) {
  K = { ...R9.even, ...K };
  const { EY, EZ, EYEX, CHINY } = LM;
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  // the tone field: a normalised blur (the empty atlas between islands left out), in linear light
  const W8 = Buffer.alloc(N2 * 3), M8 = Buffer.alloc(N2);
  for (let i = 0; i < N2; i++) { if (Number.isNaN(pos[i * 3 + 1])) continue; for (let c = 0; c < 3; c++) W8[i * 3 + c] = d[i * 4 + c]; M8[i] = 255; }
  const bl = await sharp(W8, { raw: { width: S, height: S, channels: 3 } }).blur(K.sigma).raw().toBuffer(), bm = await sharp(M8, { raw: { width: S, height: S, channels: 1 } }).blur(K.sigma).extractChannel(0).raw().toBuffer();
  const lo = (i, c) => { const m = bm[i] / 255; return lin(m > 0.02 ? bl[i * 3 + c] / m : d[i * 4 + c]); };
  // the reference: the cheek under the eye's outer half
  const ref = [0, 0, 0]; let n = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X) || head[i] < 0.8) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x > EYEX + 0.004 && x < EYEX + 0.02 && y > EY - 0.05 && y < EY - 0.028 && z > EZ - 0.04) { for (let c = 0; c < 3; c++) ref[c] += lin(d[i * 4 + c]); n++; } }
  if (!n) { console.log('skin even: no cheek'); return; }
  for (let c = 0; c < 3; c++) ref[c] /= n;
  // (the cheek carries the blush: the reference keeps its value but takes the graded tone's hue, R9.skinT)
  { const T = (K.T || R9.skinT).map(lin), Y = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2], f = Y(ref) / Y(T); for (let c = 0; c < 3; c++) ref[c] = T[c] * f; }
  let moved = 0; const acc = { neck: 0, ear: 0, fore: 0, hand: 0 };
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const hand = x > 0.3 && y < 1.2 ? 1 : 0;
    const neck = (1 - hand) * sm(CHINY + 0.005, CHINY - 0.02, y) * sm(1.33, 1.37, y) * (x < 0.1 ? 1 : 0);
    const L = 0.2126 * lo(i, 0) + 0.7152 * lo(i, 1) + 0.0722 * lo(i, 2), Lr = 0.2126 * ref[0] + 0.7152 * ref[1] + 0.0722 * ref[2];
    const ear = (1 - hand) * sm(0.058, 0.066, x) * sm(EY - 0.075, EY - 0.06, y) * (1 - sm(EY + 0.015, EY + 0.03, y)) * (z < EZ - 0.05 ? 1 : 0) * (z > -0.04 ? 1 : 0) * (y > 1.45 ? 1 : 0) * (1 - sm(1.25, 1.5, L / Lr));
    // the forehead: above the brows, below the hair (texels much lighter than the face are the painted scalp: left alone)
    const fore = (1 - hand) * (head[i] > 0.5 ? 1 : 0) * sm(EY + 0.018, EY + 0.032, y) * (z > EZ - 0.07 ? 1 : 0) * (x < 0.07 ? 1 : 0) * (1 - sm(1.25, 1.5, L / Lr));
    // the front scalp strip left showing between the forehead and the hair's edge (its silver paint read as a pale wig-cap
    // band): the forehead's skin carried up under the hair, a little deeper toward the hair (its shadow)
    const band = (1 - hand) * (head[i] > 0.5 ? 1 : 0) * sm(EY + 0.03, EY + 0.04, y) * (1 - sm(EY + 0.09, EY + 0.1, y)) * sm(EZ - 0.075, EZ - 0.055, z) * (1 - sm(0.062, 0.07, x)) * sm(1.1, 1.2, L / Lr);
    const w = Math.max(Math.min(1, Math.max(hand, neck, ear, fore)) * K.k, band); if (w <= 0.001) continue;
    if (band > 0.5) acc.band = (acc.band || 0) + 1; if (hand) acc.hand++; else if (ear > 0.5) acc.ear++; else if (neck > 0.5) acc.neck++; else if (fore > 0.5) acc.fore++;
    // (the forehead and the neck a touch deeper than the cheek: they catch the top light and read paler in it)
    const dim = hand ? 1 : (1 + (K.fore - 1) * Math.max(fore, band) + (K.neck - 1) * neck * (1 - fore)) * (1 - 0.1 * band * sm(EY + 0.04, EY + 0.07, y));
    const warm = (ear > 0.3 && !hand ? K.ear : [1, 1, 1]).map((v) => v * dim);
    for (let c = 0; c < 3; c++) { const f = (ref[c] * warm[c]) / Math.max(1e-4, lo(i, c)), r = 1 + w * (f - 1); d[i * 4 + c] = enc(lin(d[i * 4 + c]) * r); }
    moved++; }
  await setWebp(tex, d, S, S, 90, 4);
  console.log('skin even: texels', moved, JSON.stringify(acc), 'cheek ref sRGB', ref.map((v) => enc(v)).join(','));
}
