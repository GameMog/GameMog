// Hand-built Jensen, the hair: the forge's swept-back cut (its CC0 short cards) made a full, white-silver swept-back head
// of hair, combed straight back off the forehead with lift at the front:
//  tone    John's tone ramp (john/hair.mjs) with a silver ramp: grey roots, a light silver body, near-white tips, a few
//          darker pewter strands (more at the nape and above the ears, as white hair keeps there), a soft sheen
//  volume  the cards pushed out from the skull's middle: up to 6 mm over the front top (the lift off the forehead),
//          4 mm over the crown, ~2 mm at the sides (it lies flat over the ears), nothing at the hairline's edge so the
//          roots still meet the scalp
import { prim, matOf, rgba, setWebp, sharp, raster, h3, sm, clamp } from '../young-hero/glb.mjs';
import { hairTonePass } from '../john/hair.mjs';
import { LM } from './landmarks.mjs';
export async function silverPass(doc, K = {}) {
  // (the cards' strand contrast softened first: each texel halfway to its 3 px neighbourhood and a third of the way to
  // the middle tone, so the white reads as combed hair, not straw)
  { const m = matOf(doc, 'hair'), tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex), b = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).blur(4).raw().toBuffer();
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((data[i * 4 + c] * 0.4 + b[i * 4 + c] * 0.6) * 0.65 + 78 * 0.35);
    await setWebp(tex, data, w, h, 92); }
  return hairTonePass(doc, { root: [54, 53, 52], mid: [128, 126, 123], hi: [196, 194, 190], grey: [58, 57, 56], temple: 0.14, top: 0.06, greyMix: 0.55, rough: 0.5, spec: 0.38, ...K });
}
// the cut's front edge feathered: the cap's last 12 mm at the forehead thinned out by a dithered alpha (its hard rim read
// as a helmet's edge in the close-ups), so the hairline grades into the silver painted on the scalp under it
export async function hairlinePass(doc, K = {}) {
  K = { band: 0.012, ...K };
  const { EZ } = LM, m = matOf(doc, 'hair'), tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex); let n = 0;
  for (const p of prim(doc, 'hair')) { const a = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), I = p.getIndices().getArray();
    // the front edge's height across the forehead (the cut's lowest points in front, by 1 cm of x)
    const yf = new Map(); for (const v of new Set(I)) { if (a[v * 3 + 2] < EZ - 0.045) continue; const k = Math.round(a[v * 3] * 100); yf.set(k, Math.min(yf.get(k) ?? 9, a[v * 3 + 1])); }
    raster(I, (v) => [uv[v * 2] * w, uv[v * 2 + 1] * h], w, (x, y, l1, l2, l3, A, B, C) => { const i = y * w + x; if (data[i * 4 + 3] < 4) return;
      const X = l1 * a[A * 3] + l2 * a[B * 3] + l3 * a[C * 3], Y = l1 * a[A * 3 + 1] + l2 * a[B * 3 + 1] + l3 * a[C * 3 + 1], Z = l1 * a[A * 3 + 2] + l2 * a[B * 3 + 2] + l3 * a[C * 3 + 2];
      if (Z < EZ - 0.045) return; const f = yf.get(Math.round(X * 100)); if (f === undefined) return; const t = sm(f, f + K.band, Y); if (t >= 1) return;
      const keep = t + 0.35 * (h3(x, y >> 2, 41) - 0.5) * (1 - t) * 2 * t; data[i * 4 + 3] = Math.round(data[i * 4 + 3] * clamp(keep)); n++; }, 0.02); }
  await setWebp(tex, data, w, h, 92); console.log('hairline feathered texels', n);
}
export function volumePass(doc, K = {}) {
  K = { front: 0.004, crown: 0.0015, side: 0.0012, back: 0.004, ...K };
  const { EY, EZ } = LM, c = [0, EY + 0.02, EZ - 0.085];
  for (const p of prim(doc, 'hair')) { const P = p.getAttribute('POSITION'), a = P.getArray().slice(); let n = 0;
    for (const v of new Set(p.getIndices().getArray())) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], d = [x - c[0], y - c[1], z - c[2]], L = Math.hypot(...d) || 1;
      const up = sm(EY + 0.03, EY + 0.1, y), fr = sm(EZ - 0.09, EZ - 0.01, z), side = sm(0.04, 0.07, Math.abs(x));
      const k = (K.front * fr + K.crown * (1 - fr)) * up * (1 - 0.6 * side) + K.side * side * sm(EY - 0.01, EY + 0.04, y);
      // (the very edge of the cut at the forehead held: the lift starts 1 cm back)
      const edge = sm(EZ - 0.0, EZ - 0.02, z) + (1 - fr);
      // (the back of the head: the cut's crown and nape cards drawn in by up to 4 mm, so his profile ends in a short taper,
      // not a tail standing off the head)
      const back = K.back * sm(EZ - 0.11, EZ - 0.16, z) * sm(EY - 0.05, EY + 0.02, y);
      const s = k * clamp(edge) - back; if (!s) continue; for (let q = 0; q < 3; q++) a[v * 3 + q] += (d[q] / L) * s; n++; }
    P.setArray(a); console.log('hair volume points', n); }
}
