// Hand-built old boss, the irises: the forge's were near-black ((35, 13, 8): OKLab L 0.16, the 'black holes' Rosa's eyes
// had in Mog City's close-ups; the forge's eyes gate floor is 0.25, the sheet's dark brown about 0.30). Each iris (found
// as the gate finds it: the darkest 40-texel disk near the eyeball's front) repainted a dark brown with radial fibres,
// a darker limbal ring and a warmer collarette round the pupil; the pupil and the white kept. Clearcoat stays (eyesPass).
import { prim, matOf, rgba, setWebp, h3 } from '../young-hero/glb.mjs';
export async function irisPass(doc, K = {}) {
  K = { base: [92, 60, 40], ...K };
  const e = prim(doc, 'eyes')[0], mat = matOf(doc, 'eyes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), k = w / 512;
  const P = e.getAttribute('POSITION').getArray(), UV = e.getAttribute('TEXCOORD_0').getArray(), V = [...new Set(e.getIndices().getArray())];
  const lum = (x, y) => { x = Math.max(0, Math.min(w - 1, Math.round(x))); y = Math.max(0, Math.min(h - 1, Math.round(y))); const i = (y * w + x) * 4; return data[i] + data[i + 1] + data[i + 2]; };
  for (const s of [1, -1]) {
    const vs = V.filter((v) => P[v * 3] * s > 0 && !(UV[v * 2] > 0.8 && UV[v * 2 + 1] > 0.8)); if (!vs.length) continue;
    let fv = vs[0]; for (const v of vs) if (P[v * 3 + 2] > P[fv * 3 + 2]) fv = v;
    let cx = UV[fv * 2] * w, cy = UV[fv * 2 + 1] * h, best = Infinity; const x0 = cx, y0 = cy;
    for (let y = y0 - 80 * k; y <= y0 + 80 * k; y += 2 * k) for (let x = x0 - 80 * k; x <= x0 + 80 * k; x += 2 * k) { let sum = 0; for (let a = 0; a < 12; a++) for (const r of [0, 10, 20, 30, 40]) sum += lum(x + r * k * Math.cos(a * 0.5236), y + r * k * Math.sin(a * 0.5236)); if (sum < best) { best = sum; cx = x; cy = y; } }
    let n = 0;
    for (let y = Math.floor(cy - 56 * k); y <= cy + 56 * k; y++) for (let x = Math.floor(cx - 56 * k); x <= cx + 56 * k; x++) { if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const d = Math.hypot(x - cx, y - cy) / k, i = (y * w + x) * 4, L0 = data[i] + data[i + 1] + data[i + 2]; if (d < 15 || d > 54 || L0 > 330) continue;
      const ang = Math.atan2(y - cy, x - cx), fib = 0.82 + 0.3 * h3(Math.floor(ang * 60), 1, 2) + 0.1 * Math.sin(ang * 23 + d * 0.4), coll = Math.exp(-(((d - 20) / 5) ** 2)), limb = Math.min(1, Math.max(0, (d - 42) / 8));
      const c = K.base.map((v, j) => v * fib * (1 + 0.25 * coll * [1, 0.7, 0.3][j]) * (1 - 0.55 * limb));
      const t = d > 50 ? (54 - d) / 4 : 1; for (let j = 0; j < 3; j++) data[i + j] = Math.round(data[i + j] * (1 - t) + Math.min(255, c[j]) * t); n++; }
    console.log('iris', s > 0 ? 'L' : 'R', 'at', (cx / w).toFixed(3), (cy / h).toFixed(3), 'texels', n);
  }
  await setWebp(tex, data, w, h, 92);
}
