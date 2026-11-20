// Hand-built John, the hair's tone: the forge's short04 (Mr. Big's cut, the body's own CC0 mesh) ramped from its warm mid
// brown to a cooler dark brown, a few early grey hairs (most at the temples and above the ears, a scatter on top), and a
// little less gloss (it read as plastic in the sun).
import { prim, matOf, rgba, setWebp, raster, h3, sm, clamp, require } from '../young-hero/glb.mjs';
const { KHRMaterialsSpecular } = require('@gltf-transform/extensions');
export async function hairTonePass(doc, K = {}) {
  K = { root: [16, 13, 12], mid: [40, 32, 27], hi: [82, 68, 58], grey: [150, 146, 142], temple: 0.13, top: 0.035, rough: 0.62, spec: 0.3, nape: 0.025, greyMix: 0.75, ...K };
  const p = prim(doc, 'hair')[0], m = matOf(doc, 'hair'), tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  const a = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), pos = new Float32Array(w * h * 3).fill(NaN);
  raster(p.getIndices().getArray(), (v) => [uv[v * 2] * w, uv[v * 2 + 1] * h], w, (x, y, l1, l2, l3, A, B, C) => { const i = y * w + x; for (let c = 0; c < 3; c++) pos[i * 3 + c] = l1 * a[A * 3 + c] + l2 * a[B * 3 + c] + l3 * a[C * 3 + c]; }, 0.05);
  // (the nape: the cut's lowest cards at the back ended in a hard line (a helmet's rim from behind): their last 2.5 cm
  // thinned out by a dithered alpha, so the cut tapers into the short hair painted on the scalp under it)
  let yLow = 9; for (const v of new Set(p.getIndices().getArray())) if (a[v * 3 + 2] < -0.02) yLow = Math.min(yLow, a[v * 3 + 1]);
  let n = 0, ng = 0, nt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (data[i * 4 + 3] < 4) continue;
    const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, t = clamp(L / 120);
    let c = t < 0.5 ? K.root.map((r, j) => r + (K.mid[j] - r) * (t / 0.5)) : K.mid.map((q, j) => q + (K.hi[j] - q) * ((t - 0.5) / 0.5));
    const X = pos[i * 3], Z = pos[i * 3 + 2]; let pg = K.top;
    if (!Number.isNaN(X)) pg += K.temple * sm(0.045, 0.07, Math.abs(X)) * sm(-0.06, 0.02, Z);
    // (a grey hair: a streak ~1 px wide, ~10 px along the strand (v), lit by the strand's own light)
    if (h3(x, y >> 3, 17) < pg) { const g = 0.55 + 0.45 * t; c = c.map((q, j) => q * (1 - K.greyMix) + K.grey[j] * g * K.greyMix); ng++; }
    if (!Number.isNaN(X) && Z < 0.02) { const Y = pos[i * 3 + 1], s0 = sm(yLow + 0.002, yLow + K.nape, Y), keep = s0 + 0.25 * (h3(x, y >> 2, 31) - 0.5) * (1 - s0) * 4 * s0; if (s0 < 1 && keep < 1) { data[i * 4 + 3] = Math.round(data[i * 4 + 3] * clamp(keep)); nt++; } }
    for (let j = 0; j < 3; j++) data[i * 4 + j] = Math.round(c[j]); n++; }
  await setWebp(tex, data, w, h, 90);
  m.setRoughnessFactor(K.rough); const sp = m.getExtension('KHR_materials_specular'); if (sp) sp.setSpecularFactor(K.spec); else m.setExtension('KHR_materials_specular', doc.createExtension(KHRMaterialsSpecular).createSpecular().setSpecularFactor(K.spec));
  console.log('hair texels', n, 'grey', ng, 'nape texels thinned', nt, 'nape y', yLow.toFixed(3));
}
