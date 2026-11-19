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
  // (the cards' strand contrast softened a little (round 3 blurred it 4 px and pulled it to a middle grey: the strands'
  // flow was lost and the head read as straw; round 4 keeps the combed flow: a 1.5 px blur, a fifth toward the middle)
  { const m = matOf(doc, 'hair'), tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex), b = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).blur(1.5).raw().toBuffer();
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((data[i * 4 + c] * 0.5 + b[i * 4 + c] * 0.5) * 0.8 + 80 * 0.2);
    await setWebp(tex, data, w, h, 92); }
  // (round 4: no scattered dark dashes (they ran across the strands' flow as straw); the silver ramp alone, its darker
  // strands the cards' own shadows)
  return hairTonePass(doc, { root: [66, 65, 64], mid: [150, 148, 145], hi: [214, 212, 207], grey: [58, 57, 56], temple: 0, top: 0, greyMix: 0, rough: 0.45, spec: 0.42, ...K });
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
// (round 4, owner: "the hair should be thicker and swept back, not flat") a second layer of the cut's cards over the
// first: the same cards copied as their own primitive and lifted off the head (most over the front top, where the sweep
// stands up off the forehead, less at the crown, nothing at the sides over the ears or at the nape), drawn back a few
// millimetres (the comb's direction) and a shade lighter, so the head of hair has depth and the light catches its top
// layer instead of one flat sheet of cards on the skull
export async function layerPass(doc, K = {}) {
  K = { front: 0.0075, crown: 0.0045, back: 0.004, ...K };
  const { EY, EZ } = LM, c = [0, EY + 0.02, EZ - 0.085];
  const p = prim(doc, 'hair')[0], mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(p)), buf = doc.getRoot().listBuffers()[0];
  const I = p.getIndices().getArray(), used = [...new Set(I)], map = new Map(used.map((v, k) => [v, k]));
  const np = doc.createPrimitive().setMaterial(p.getMaterial()).setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(I, (v) => map.get(v))).setBuffer(buf));
  for (const sem of p.listSemantics()) { const A = p.getAttribute(sem), src = A.getArray(), e = A.getElementSize(), out = new src.constructor(used.length * e);
    used.forEach((v, k) => { for (let q = 0; q < e; q++) out[k * e + q] = src[v * e + q]; });
    if (sem === 'POSITION') used.forEach((v, k) => { const x = out[k * 3], y = out[k * 3 + 1], z = out[k * 3 + 2], dd = [x - c[0], y - c[1], z - c[2]], L = Math.hypot(...dd) || 1;
      const up = sm(EY + 0.035, EY + 0.1, y), fr = sm(EZ - 0.1, EZ - 0.02, z), side = sm(0.045, 0.072, Math.abs(x)), nape = sm(EZ - 0.13, EZ - 0.17, z) * sm(EY + 0.05, EY - 0.02, y);
      const s = (K.front * fr + K.crown * (1 - fr)) * up * (1 - 0.85 * side) * (1 - nape); for (let q = 0; q < 3; q++) out[k * 3 + q] += (dd[q] / L) * s; out[k * 3 + 2] -= K.back * up * fr; });
    np.setAttribute(sem, doc.createAccessor().setType(A.getType()).setArray(out).setNormalized(A.getNormalized()).setBuffer(buf)); }
  mesh.addPrimitive(np); console.log('hair layer: points', used.length, 'triangles', I.length / 3);
}
