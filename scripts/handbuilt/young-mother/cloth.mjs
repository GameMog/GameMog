// Hand-built young mother, cloth: the sheet's colours back on her clothes.
//  hoodie  heather mauve-grey (#6A6470 on the sheet) rendered pale beige-pink under a warm key, close to her skin, so
//          she read undressed at a glance: the fleece darker and cooler (K.hoodie), with a two-tone fibre heather and a
//          soft mottle; every hoodie part the same dye so the hem, neckband and hood match
//  jeans   the light acid-wash re-dyed to the sheet's dark indigo #2F3E55 (the young hero's luminance split: the wash's
//          big light patches flattened, the folds and seams kept), then flattened 45% toward the local mean and the
//          denim's grazing specular cut (his denimPass)
import { matOf, rgba, setWebp, sharp, fbm, h3, sm } from '../young-hero/glb.mjs';
import { denimPass } from '../young-hero/p2.mjs';
export async function clothPass(doc, K = {}) {
  K = { hoodie: [78, 72, 90], jeans: [34, 44, 62], ...K };
  for (const name of ['hoodie', 'hoodie-hem', 'hood', 'hoodie-neckband']) {
    const mat = matOf(doc, name), tex = mat?.getBaseColorTexture(); if (!tex) continue; const { data, w, h } = await rgba(tex);
    let m0 = [0, 0, 0]; for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) m0[c] += data[i * 4 + c] / (w * h);
    const s = 1024 / w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, fib = h3(x, y, 11) - 0.5, fib2 = h3(x >> 1, (y * 3) >> 2, 5) - 0.5, mot = fbm((x * s) / 1024, (y * s) / 1024, 0.3, 9) - 0.5;
      const m = 1 + 0.14 * fib + 0.08 * fib2 + 0.1 * mot, cool = 1 + 0.05 * (h3(x, y, 23) - 0.5);
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((data[i * 4 + c] / m0[c]) * K.hoodie[c] * m * (c === 2 ? cool : 1)))); }
    await setWebp(tex, data, w, h, 86);
  }
  // jeans
  const mat = matOf(doc, 'clothes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  const lo = await sharp(Buffer.from(L.map((x) => Math.round(x * 255))), { raw: { width: w, height: h, channels: 1 } }).blur(18).extractChannel(0).raw().toBuffer();
  const base = [54, 66, 90], mask = new Uint8Array(w * h);
  for (let y = Math.floor(h * 0.44); y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const blue = sm(4, 18, b - r), notBg = (r + g + b) / 3 < 205 || b - r > 14 ? 1 : 0, t = blue * notBg; if (t <= 0) continue; if (t > 0.5) mask[i] = 1;
    const l0 = Math.max(0.04, lo[i] / 255), hi = Math.min(2.2, L[i] / l0), v = Math.pow(l0 / 0.55, 0.35) * Math.pow(hi, 1.15), k = 0.78 + 0.22 * (h3(x, y, 3) - 0.5) * 0.4;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - t) + Math.min(255, base[c] * v * k * (c === 2 ? 1.05 : 1)) * t); }
  const acc = [0, 0, 0]; let m = 0; for (let i = 0; i < w * h; i++) if (mask[i]) { for (let c = 0; c < 3; c++) acc[c] += (data[i * 4 + c] / 255) ** 2.2; m++; }
  const gain = K.jeans.map((t, c) => (t / 255) ** 2.2 / (acc[c] / m)); for (let i = 0; i < w * h; i++) if (mask[i]) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(255 * ((data[i * 4 + c] / 255) ** 2.2 * gain[c]) ** (1 / 2.2)));
  await setWebp(tex, data, w, h, 88); console.log('jeans gain', gain.map((g) => g.toFixed(2)));
  await denimPass(doc, { flat: 0.55, dark: 0.85 });
}
// the fit (the hoodie's front, all on its own points; the body under it is not drawn there):
//  bust   the bust's projection over the chest plane (z 11.5 cm) cut 15% (it read conical and large for a slim 152 cm
//         woman: apex 16.7 cm), rounded by the smooth falloff
//  front  below the bust the fleece fell forward into a belly (15.5 cm at the navel, as far out as the bust): eased in
//         up to 9 mm at y 1.03, so the fleece falls from the bust back toward the hip
//  waist  the sides taken in up to 12 mm at the natural waist (y 1.04); all three fade out before the hem's seam
import { prim } from '../young-hero/glb.mjs';
export function fitPass(doc, K = {}) {
  K = { bust: 0.24, zc: 0.115, belly: 0.009, waist: 0.012, ...K };
  const g = (d, s) => Math.exp(-((d / s) ** 2)); let n = 0;
  for (const p of prim(doc, 'hoodie')) { const A = p.getAttribute('POSITION'), a = A.getArray().slice(), used = new Set(p.getIndices().getArray());
    for (const v of used) { const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0); if (y < 0.9 || y > 1.3 || x > 0.2) continue;
      let dz = 0, dx = 0;
      if (z > K.zc && x < 0.14) dz -= K.bust * (z - K.zc) * g(y - 1.14, 0.065) * g(x - 0.075, 0.055);
      if (z > 0.08 && x < 0.13) dz -= K.belly * g(y - 1.03, 0.055) * sm(0.08, 0.12, z) * (1 - sm(0.09, 0.13, x));
      if (x > 0.07) dx -= Math.sign(x0) * K.waist * g(y - 1.04, 0.06) * sm(0.07, 0.11, x) * sm(-0.02, 0.03, z + 0.04) ;
      if (!dz && !dx) continue; a[v * 3] += dx; a[v * 3 + 2] += dz; n++; }
    A.setArray(a); }
  console.log('fit: hoodie points moved', n);
}
// the hood's drawcords: they read as two light stripes down her front (a pale warm grey); dyed a darker shade of the
// fleece, matte. The teeth a further 8% down (her lower row read large and bright in the open-mouth close-ups).
export async function cordsTeethPass(doc) {
  const c = matOf(doc, 'hood-cords'); if (c) { c.setBaseColorFactor([0.41, 0.385, 0.43, 1]); c.setRoughnessFactor(0.9); }
  for (const n of ['teethUp', 'teethLow']) { const m = matOf(doc, n); if (m) m.setBaseColorFactor([0.92, 0.91, 0.89, 1]); }
}

