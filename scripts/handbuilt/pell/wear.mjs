// Hand-built Pell, what he wears (the forge's base suit worn whole: MakeHuman's elegantsuit01 jacket, shirt, tie and
// trousers in one mesh, CC0):
//  suitPass    the jacket triangles whose uvs fall in the tie's rectangle moved onto a plain patch of the jacket (John's fix:
//              they wore the tie's colour as flecks behind the shoulder); the suit a flat mid grey, the shirt white with
//              a cool cast, the tie a plain pale blue (the base's striped tie's own shading kept)
//  hairPass    the side-parted cut a plain mid brown, matte
//  lanyardPass a navy lanyard round his neck, laid 4 mm over the shirt and jacket, down to a plain white badge (no logo,
//              no words) on his chest; skinned as the suit under it
import { prim, matOf, rgba, setWebp, h3, clamp, body } from '../young-hero/glb.mjs';
import { attrs, grid, surf } from '../agnes/collar.mjs';
const TIE = [350, 60, 446, 206];
export async function suitPass(doc, K = {}) {
  K = { patch: [600 / 1024, 300 / 1024], suit: [1.0, 1.0, 1.03], tie: [158, 188, 220], shirt: [232, 236, 240], ...K };
  const p = prim(doc, 'clothes')[0], a = p.getAttribute('POSITION').getArray(), U = p.getAttribute('TEXCOORD_0'), ua = U.getArray().slice(), I = p.getIndices().getArray();
  const mat = matOf(doc, 'clothes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), k = w / 1024;
  const inTie = (tx, ty) => tx >= TIE[0] * k && tx < TIE[2] * k && ty >= TIE[1] * k && ty < TIE[3] * k;
  const texOf = (v) => [Math.min(w - 1, Math.max(0, Math.floor(ua[v * 2] * w))), Math.min(h - 1, Math.max(0, Math.floor(ua[v * 2 + 1] * h)))];
  const far = (v) => Math.abs(a[v * 3]) > 0.07 || a[v * 3 + 2] < 0.04 || a[v * 3 + 1] < 1.3; const moved = new Set();
  for (let t = 0; t < I.length; t += 3) { const vs = [I[t], I[t + 1], I[t + 2]]; if (vs.every((v) => { const [tx, ty] = texOf(v); return inTie(tx, ty) && far(v); })) for (const v of vs) moved.add(v); }
  for (const v of moved) { ua[v * 2] = K.patch[0]; ua[v * 2 + 1] = K.patch[1]; } U.setArray(ua);
  let nt = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], L = (r + g + b) / 3, sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (inTie(x, y)) { if (L > 175 && sat < 30) { for (let c = 0; c < 3; c++) data[i + c] = clamp(Math.round(K.shirt[c] * (L / 225)), 0, 255); }
      else if (sat > 18 || L < 150) { const s = clamp(L / 120, 0.55, 1.15) * (0.97 + 0.06 * h3(x >> 1, y >> 1, 3)); for (let c = 0; c < 3; c++) data[i + c] = clamp(Math.round(K.tie[c] * s), 0, 255); nt++; } }
    else for (let c = 0; c < 3; c++) data[i + c] = clamp(Math.round(data[i + c] * K.suit[c]), 0, 255); }
  await setWebp(tex, data, w, h, 88); mat.setRoughnessFactor(0.9);
  console.log('suit: jacket points off the tie\'s uvs', moved.size, 'tie texels', nt);
}
export async function hairPass(doc, K = {}) {
  K = { root: [44, 34, 27], hi: [96, 78, 62], grey: [150, 146, 140], ...K };
  const mat = matOf(doc, 'hair'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), Ls = [];
  for (let i = 0; i < w * h; i += 5) if (data[i * 4 + 3] > 80) Ls.push((data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3); Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.04)], hi = Ls[Math.floor(Ls.length * 0.97)];
  for (let i = 0; i < w * h; i++) { const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, x = i % w, t = clamp((L - lo) / Math.max(1, hi - lo) + 0.12 * (h3(Math.floor(x / 3), 5, 11) - 0.5)), grey = false; // (no grey strands: in the sets' over-the-shoulder close-ups they read as white dashes)
    const c = grey ? K.grey : K.root.map((r, k) => r + (K.hi[k] - r) * t); for (let k = 0; k < 3; k++) data[i * 4 + k] = c[k]; }
  await setWebp(tex, data, w, h, 88); mat.setRoughnessFactor(0.7);
}
export function lanyardPass(doc, LM, K = {}) {
  K = { half: 0.006, off: 0.004, col: [0.03, 0.05, 0.13], card: [0.05, 0.075], ...K };
  const cl = prim(doc, 'clothes')[0], C = attrs(cl), near = grid(C, 0.012);
  const P = [], N = [], I = [], J = [], W = [], M = [];
  const onSurf = (q) => { let s = null; for (let it = 0; it < 6; it++) { s = surf(C, near, q); if (!s) break; q = s.p.map((x, c) => x + s.n[c] * K.off); } return [q, s]; };
  const skinOf = (s) => { const v = s ? s.v : 0; return [[0, 1, 2, 3].map((kk) => C.J[v * 4 + kk]), [0, 1, 2, 3].map((kk) => C.W(v, kk))]; };
  const yTop = LM.EY - 0.175, yBot = LM.EY - 0.32; let bottom = null;
  for (const s of [1, -1]) { // each side: from beside the neck, down the chest to the badge's clip
    const n = 18, b0 = P.length / 3;
    for (let k = 0; k <= n; k++) { const t = k / n, g = [s * (0.058 * (1 - t) + 0.008 * t), yTop + (yBot - yTop) * t, 0.06 + 0.12 * Math.min(1, t * 2.5)];
      const [q, sf] = onSurf(g), nn = sf ? sf.n : [0, 0, 1], dirx = s * 0.05, diry = yBot - yTop; const tl = Math.hypot(dirx, diry), side = [-diry / tl * nn[2], 0, dirx / tl * nn[2]]; void side;
      for (const sd of [-1, 1]) { P.push(q[0] + sd * K.half, q[1], q[2]); N.push(...nn); const [jj, ww] = skinOf(sf); J.push(...jj); W.push(...ww); }
      if (k === n) bottom = { q, sf }; }
    for (let k = 0; k < n; k++) { const a0 = b0 + k * 2; I.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2); }
    M.push(...Array(0)); }
  const nStrap = I.length;
  // the badge: a plain white card hanging from the clip, 1 cm off the shirt
  if (bottom) { const [jj, ww] = skinOf(bottom.sf), c = bottom.q, cw = K.card[0] / 2, ch = K.card[1], z = c[2] + 0.004, b0 = P.length / 3;
    for (const [x, y] of [[-cw, -0.006], [cw, -0.006], [cw, -0.006 - ch], [-cw, -0.006 - ch]]) { P.push(c[0] + x, c[1] + y, z); N.push(0, 0, 1); J.push(...jj); W.push(...ww); }
    I.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); }
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf), nv = P.length / 3;
  const Wn = new Float32Array(W); for (let v = 0; v < nv; v++) { let t = 0; for (let kk = 0; kk < 4; kk++) t += Wn[v * 4 + kk]; for (let kk = 0; kk < 4; kk++) Wn[v * 4 + kk] /= t || 1; }
  const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(cl));
  const mk = (name, idx, col, rough) => mesh.addPrimitive(doc.createPrimitive().setMaterial(doc.createMaterial(name).setBaseColorFactor([...col, 1]).setRoughnessFactor(rough).setMetallicFactor(0).setDoubleSided(true))
    .setIndices(acc('SCALAR', Uint32Array.from(idx))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(J))).setAttribute('WEIGHTS_0', acc('VEC4', Wn)));
  mk('lanyard', I.slice(0, nStrap), K.col, 0.8); if (I.length > nStrap) mk('badge', I.slice(nStrap), [0.85, 0.86, 0.86], 0.5);
  console.log('lanyard points', nv, 'badge', !!bottom);
}
