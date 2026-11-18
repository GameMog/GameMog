// Hand-built old boss, the beard: the forge's copy of Mr. Big's beard (the skin pushed out 2.4 mm under it, then 4 shells
// to 5.9 mm, alpha 1/.86/.74/.62: a 16.8 x 12.1 cm steel-wool ball, his footprint) regroomed as a close-trimmed silver
// boxed beard of his own:
//  geometry  the skin under it taken back in 1.8 of the 2.4 mm (not on the neck under the jaw, by the collar); 2 shells at 2.2 / 3.8 mm (the outer two dropped), each
//            layer's own depth kept in proportion (thinner over the lip and at its edges); its outline trimmed (the cheek
//            line 6-9 mm lower and flatter, 1 cm further from the ear, a clean neck line ~1.5 cm under the jaw's edge):
//            shell points past the line sink to the skin and triangles wholly past it are dropped
//  texture   the shells' 1 x 3 px strokes recoloured salt-and-pepper (silver 170-215, a quarter of the strands dark grey
//            90-120, never pure white), darker at the roots' layer; a cool sheen
// The shells share the body's vertex set (points 9442.. in 4 layers); each shell point's source is the skin point with
// its uv (the forge's SX is 1: no cards).
import { body, prim, matOf, rgba, setWebp, h3, fbm, sm, raster } from '../young-hero/glb.mjs';
import { trimOf, CHINY, MOUTHY, MH, EZ } from './landmarks.mjs';
export async function beardPass(doc, K = {}) {
  K = { pushBack: 0.0018, d0: 0.0022, d1: 0.0038, maxD: 0.00588, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), uv = B.uv.getArray(), bd = prim(doc, 'beard')[0], I = bd.getIndices().getArray();
  const used = [...new Set(I)].sort((x, y) => x - y), v0 = used[0], nS = used.length / 4;
  if (!Number.isInteger(nS)) throw new Error('beard: shell points not in 4 equal layers');
  // sources by uv among the skin's points
  const key = (v) => Math.round(uv[v * 2] * 4e5) + ',' + Math.round(uv[v * 2 + 1] * 4e5), byUV = new Map();
  for (const q of prim(doc, 'skin')) for (const v of q.getIndices().getArray()) if (v < v0) byUV.set(key(v), v);
  const src = new Int32Array(nS).fill(-1); let miss = 0;
  for (let k = 0; k < nS; k++) { const s = byUV.get(key(v0 + k)); if (s === undefined) miss++; else src[k] = s; }
  console.log('beard: shell points', nS, 'x 4, sources found', nS - miss);
  // per source: the outer layer's offset (direction and the forge's taper), the trim, the skin pushed back in
  const posKey = (v) => `${a[v * 3].toFixed(5)},${a[v * 3 + 1].toFixed(5)},${a[v * 3 + 2].toFixed(5)}`, same = new Map();
  for (const q of prim(doc, 'skin')) for (const v of q.getIndices().getArray()) if (v < v0) { const kk = posKey(v); if (!same.has(kk)) same.set(kk, new Set()); same.get(kk).add(v); }
  const dir = new Float32Array(nS * 3), tp = new Float32Array(nS), trim = new Float32Array(nS), moved = new Set();
  for (let k = 0; k < nS; k++) { const s = src[k]; if (s < 0) continue; const o = [0, 1, 2].map((c) => a[(v0 + 3 * nS + k) * 3 + c] - a[s * 3 + c]), L = Math.hypot(...o);
    tp[k] = Math.min(1, L / K.maxD); if (L > 1e-6) for (let c = 0; c < 3; c++) dir[k * 3 + c] = o[c] / L;
    const n = fbm(a[s * 3], a[s * 3 + 1], a[s * 3 + 2], 90) - 0.5; trim[k] = trimOf(a[s * 3], a[s * 3 + 1], a[s * 3 + 2], n); }
  // (the skin back in: by the forge's own share (its push was 2.4 mm x min(1, 1.4 x beard)), every copy of the point at a seam alike)
  let nPush = 0;
  for (let k = 0; k < nS; k++) { const s = src[k]; if (s < 0 || moved.has(s) || tp[k] <= 0) continue; const d = K.pushBack * Math.min(1, tp[k] * 1.4) * sm(CHINY - 0.03, CHINY - 0.012, a[s * 3 + 1]);
    const grp = same.get(posKey(s)) || new Set([s]); const base = [a[s * 3], a[s * 3 + 1], a[s * 3 + 2]];
    for (const v of grp) { if (moved.has(v)) continue; for (let c = 0; c < 3; c++) a[v * 3 + c] = base[c] - dir[k * 3 + c] * d; moved.add(v); } nPush++; }
  // the two shells kept, at their new depths over the moved skin
  for (let k = 0; k < nS; k++) { const s = src[k]; if (s < 0) continue; const f = tp[k] * (0.15 + 0.85 * trim[k]) * (trim[k] > 0.02 ? 1 : 0);
    for (const [L, D] of [[0, K.d0], [1, K.d1]]) for (let c = 0; c < 3; c++) a[(v0 + L * nS + k) * 3 + c] = a[s * 3 + c] + dir[k * 3 + c] * D * f;
    for (const L of [2, 3]) for (let c = 0; c < 3; c++) a[(v0 + L * nS + k) * 3 + c] = a[s * 3 + c]; }
  P.setArray(a);
  // triangles: layers 0 and 1, and none wholly past the trimmed outline
  const keep = []; let cut = 0;
  for (let t = 0; t < I.length; t += 3) { const L = Math.floor((I[t] - v0) / nS); if (L > 1) continue;
    const tr = [0, 1, 2].map((j) => trim[(I[t + j] - v0) % nS]); if (Math.max(...tr) < 0.05) { cut++; continue; } keep.push(I[t], I[t + 1], I[t + 2]); }
  const idx = bd.getIndices(); bd.setIndices(doc.createAccessor().setType('SCALAR').setArray(new (I.constructor)(keep)).setBuffer(idx.getBuffer()));
  // the layers' shade and alpha (COLOR_0: rgb a shade, a the alpha)
  const C = bd.getAttribute('COLOR_0'), ca = C.getArray().slice(), look = [[0.55, 1], [0.8, 0.72]];
  for (let k = 0; k < nS; k++) for (const L of [0, 1]) { const i = (v0 + L * nS + k) * 4; ca[i] = ca[i + 1] = ca[i + 2] = look[L][0]; ca[i + 3] = look[L][1]; }
  C.setArray(ca);
  console.log('beard: skin pushed back at', nPush, 'points; triangles', I.length / 3, '->', keep.length / 3, '(past the trim', cut, ')');
  // (pass 2) the strokes redrawn as combed strands: the forge's 1 x 3 px strokes read as sponge-like grain at portrait
  // distance. Every texel's place on the face (the body's own triangles rastered into the beard's uv), then strands
  // ~0.7 mm wide and 3-6 mm long along the growth (down on the chin, down and back on the jaw, down and out on the
  // moustache), about 50% cover (the gaps under the cutoff, so the shells read as hair over skin), salt-and-pepper, lighter tips
  const mat = matOf(doc, 'beard'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), S = w;
  const own = []; for (const q of prim(doc, 'skin')) { const J = q.getIndices().getArray(); for (let t = 0; t < J.length; t += 3) if (J[t] < v0) own.push(J[t], J[t + 1], J[t + 2]); }
  const pos = new Float32Array(S * S * 3).fill(NaN), sk = B.pos;
  raster(own, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, A, Bv, Cv) => { const i = y * S + x; for (let c = 0; c < 3; c++) pos[i * 3 + c] = l1 * sk[A * 3 + c] + l2 * sk[Bv * 3 + c] + l3 * sk[Cv * 3 + c]; }, 0.05);
  let nStr = 0;
  for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3])) { data[i * 4 + 3] = 0; continue; }
    const x0 = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = Math.abs(x0), sg = Math.sign(x0) || 1;
    if (y > MOUTHY + 0.03 || y < CHINY - 0.06) { data[i * 4 + 3] = 0; continue; }
    // the face's own 2D frame: across (round the jaw: x on the front, z on the sides) and up
    const side = sm(0.03, 0.06, x), acr = sg * (x * (1 - side) + (0.03 + (EZ + 0.02 - z)) * side), mou = y > MOUTHY - 0.004 && x < MH + 0.014 ? 1 : 0;
    const ang = mou ? -sg * 0.55 : sg * 0.18 * side, u = acr * Math.cos(ang) - y * Math.sin(ang), vv = acr * Math.sin(ang) + y * Math.cos(ang);
    const q = 1400, cu = Math.floor(u * q), len = 0.003 + 0.003 * h3(cu, 7, 3), cv = Math.floor((vv + h3(cu, 9, 1) * 0.01) / len), r = h3(cu, cv, 21), frac = (vv + h3(cu, 9, 1) * 0.01) / len - cv;
    const across = u * q - cu, core = Math.abs(across - 0.5) < 0.38, on = r < 0.66 && core;
    // (the gaps alpha 120: cut at full size, but a mip's average stays over the 0.5 cutoff, so the beard holds at distance)
    if (!on) { data[i * 4] = 146; data[i * 4 + 1] = 143; data[i * 4 + 2] = 141; data[i * 4 + 3] = 120; continue; }
    const dark = h3(cu, cv, 77) < 0.28, tip = sm(0.4, 1, frac), base = dark ? 112 + 20 * h3(cu, cv, 5) : 182 + 34 * h3(cu, cv, 9);
    const v = Math.min(222, base * (0.82 + 0.22 * tip) * (0.94 + 0.06 * (fbm(x0, y, z, 60) - 0.5) * 2));
    data[i * 4] = Math.round(v * 0.98); data[i * 4 + 1] = Math.round(v * 0.985); data[i * 4 + 2] = Math.round(v); data[i * 4 + 3] = 255; nStr++; }
  console.log('beard: strand texels', nStr);
  await setWebp(tex, data, w, h, 88);
  mat.setRoughnessFactor(0.6);
  const spec = mat.getExtension('KHR_materials_specular'); if (spec) spec.setSpecularFactor(0.45);
}
