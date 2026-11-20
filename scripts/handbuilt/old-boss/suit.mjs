// Hand-built old boss, the suit:
//  tie        Mr. Big's elegantsuit01 red-and-white stripe (copied by the forge) repainted in the sheet's #5A1E24 as a
//             woven silk: a small foulard (lighter burgundy diamonds and navy pin dots on a ~6 px grid) over a twill, the
//             white flecks along its edges taken in; its own roughness (0.42, silk) in a new clothes roughness map
//  collar     the shirt collar a soft white (no blue-white glare), its roughness 0.7
//  lapels     a pressed edge: a lighter 2 px roll painted along the lapels' border edges, the lapel face a shade
//             lighter and a little smoother than the jacket (0.78 vs 0.9), so the notch and the roll read
//  cloth      the jacket's quilted lumps taken out of its normal maps (the low frequencies, blur 18 px, mostly removed;
//             the weave and the small folds kept)
//  shoulders  the square corner at each shoulder (the jacket's top line flat to x 0.2 m, then a step down) rounded:
//             a field dropping it 1 cm and in 1.2 cm about x 0.2 m, so the line slopes from the collar over the deltoid
import { prim, matOf, rgba, setWebp, sharp, sm, h3, clamp, body, THREE } from '../young-hero/glb.mjs';
export async function tiePass(doc, K = {}) {
  K = { base: [90, 30, 36], light: [128, 48, 56], dot: [34, 36, 58], ...K };
  const mat = matOf(doc, 'clothes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex), k = w / 1024;
  const R = [Math.round(350 * k), Math.round(60 * k), Math.round(446 * k), Math.round(206 * k)];
  // the collar: the big white shapes (connected light texels, > 300 px at 1024) stay; small light flecks are the tie's
  const L = (i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, sat = (i) => Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const white = new Uint8Array(w * h); for (let y = 0; y < Math.round(240 * k); y++) for (let x = Math.round(330 * k); x < Math.round(520 * k); x++) { const i = y * w + x; if (L(i) > 120 && sat(i) < 40) white[i] = 1; }
  const comp = new Int32Array(w * h).fill(-1), big = new Set(); let nc = 0;
  for (let i = 0; i < w * h; i++) if (white[i] && comp[i] < 0) { const st = [i], mem = []; comp[i] = nc; while (st.length) { const j = st.pop(); mem.push(j); const x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (white[q] && comp[q] < 0) { comp[q] = nc; st.push(q); } } }
    if (mem.length > 300 * k * k) big.add(nc); nc++; }
  // the collar's white softened (a warm off-white, its shading kept)
  for (let i = 0; i < w * h; i++) if (white[i] && big.has(comp[i])) { data[i * 4] = Math.round(data[i * 4] * 0.95); data[i * 4 + 1] = Math.round(data[i * 4 + 1] * 0.94); data[i * 4 + 2] = Math.round(data[i * 4 + 2] * 0.91); }
  // (the collar's saw edge: its island's texels along the white were dark grey steps; within the clothes' uv islands,
  // every non-white texel within 3 px of the collar's white takes the nearest white texel's colour)
  const cov = new Uint8Array(w * h); { const cp = prim(doc, 'clothes')[0], cu = cp.getAttribute('TEXCOORD_0').getArray(), ci = cp.getIndices().getArray();
    for (let t = 0; t < ci.length; t += 3) { const P3 = [0, 1, 2].map((j) => [cu[ci[t + j] * 2] * w, cu[ci[t + j] * 2 + 1] * h]); const x0 = Math.floor(Math.min(...P3.map((q) => q[0]))), x1 = Math.ceil(Math.max(...P3.map((q) => q[0]))), y0 = Math.floor(Math.min(...P3.map((q) => q[1]))), y1 = Math.ceil(Math.max(...P3.map((q) => q[1])));
      if (x1 < 330 * k || x0 > 520 * k || y0 > 240 * k) continue; const [A, Bq, C] = P3, d = (Bq[1] - C[1]) * (A[0] - C[0]) + (C[0] - Bq[0]) * (A[1] - C[1]); if (Math.abs(d) < 1e-9) continue;
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) { const px = x + 0.5, py = y + 0.5, l1 = ((Bq[1] - C[1]) * (px - C[0]) + (C[0] - Bq[0]) * (py - C[1])) / d, l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / d; if (l1 >= -0.05 && l2 >= -0.05 && 1 - l1 - l2 >= -0.05) cov[y * w + x] = 1; } } }
  let fixed = 0; const snap = Buffer.from(data);
  for (let y = 0; y < Math.round(240 * k); y++) for (let x = Math.round(330 * k); x < Math.round(520 * k); x++) { const i = y * w + x; if (!cov[i] || (white[i] && big.has(comp[i]))) continue; if (x >= R[0] && x < R[2] && y >= R[1] && y < R[3] && !(y < R[1] + 40 * k)) continue;
    let best = 99, bj = -1; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = (y + dy) * w + x + dx; if (j < 0 || j >= w * h || !white[j] || !big.has(comp[j])) continue; const dd = dx * dx + dy * dy; if (dd < best) { best = dd; bj = j; } }
    if (bj >= 0) { for (let c = 0; c < 3; c++) data[i * 4 + c] = snap[bj * 4 + c]; fixed++; } }
  console.log('collar edge texels whitened', fixed);
  let n = 0;
  for (let y = R[1]; y < R[3]; y++) for (let x = R[0]; x < R[2]; x++) { const i = y * w + x; if (white[i] && big.has(comp[i])) continue;
    // keep the tie's own shading: its luminance relative to the stripe's mean, softened
    const l0 = clamp(L(i) / 110, 0.55, 1.35), sh = 0.8 + 0.2 * l0;
    const gx = x / k, gy = y / k, cx = ((gx + gy) / 6) % 1, cy = ((gx - gy + 600) / 6) % 1, dia = Math.abs(cx - 0.5) + Math.abs(cy - 0.5) < 0.22 ? 1 : 0, pin = (Math.round(gx) % 6 === 0 && Math.round(gy) % 6 === 3) ? 1 : 0;
    const tw = ((gx + 2 * gy) % 3) < 1 ? 1.06 : 0.97;
    let c = dia ? K.light : pin ? K.dot : K.base; c = c.map((v) => Math.round(v * sh * tw * (0.97 + 0.06 * h3(x, y, 3))));
    data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; n++; }
  await setWebp(tex, data, w, h, 92);
  // the tie's weave in the normal map (the stripe's ridges flattened) and the clothes' roughness map
  const nt = mat.getNormalTexture(); if (nt) { const { data: nd, w: nw, h: nh } = await rgba(nt), kn = nw / w;
    for (let y = Math.round(R[1] * kn); y < Math.round(R[3] * kn); y++) for (let x = Math.round(R[0] * kn); x < Math.round(R[2] * kn); x++) { const i = y * nw + x, xx = Math.round(x / kn), yy = Math.round(y / kn); if (white[yy * w + xx] && big.has(comp[yy * w + xx])) continue;
      const t = Math.sin((x + 2 * y) * 1.9) * 9; nd[i * 4] = 128 + Math.round(t * 0.6); nd[i * 4 + 1] = 128 - Math.round(t * 0.3); nd[i * 4 + 2] = 252; }
    await setWebp(nt, nd, nw, nh, 92); }
  const RS = 256, rm = Buffer.alloc(RS * RS * 3); for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) { const i = (y * RS + x) * 3, X = Math.round((x + 0.5) * w / RS), Y = Math.round((y + 0.5) * h / RS), j = Y * w + X;
    const inTie = X >= R[0] && X < R[2] && Y >= R[1] && Y < R[3] && !(white[j] && big.has(comp[j])), col = white[j] && big.has(comp[j]); rm[i] = 255; rm[i + 1] = Math.round(255 * (inTie ? 0.42 : col ? 0.7 : 0.92)); rm[i + 2] = 0; }
  const mt = doc.createTexture('clothes-mr'); mt.setImage(await sharp(rm, { raw: { width: RS, height: RS, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp');
  mat.setMetallicRoughnessTexture(mt).setRoughnessFactor(1).setMetallicFactor(0);
  console.log('tie texels', n, 'collar parts', big.size);
}
export async function lapelPass(doc, K = {}) {
  K = { edge: [70, 72, 78], face: 1.12, rough: 0.78, ...K };
  const mat = matOf(doc, 'suit-lapels'), p = prim(doc, 'suit-lapels')[0], tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(data[i * 4 + c] * K.face));
  // border edges (used by one triangle), drawn in uv space 2 px wide with a soft falloff to 5 px
  const I = p.getIndices().getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), cnt = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], kk = a < b ? a + ',' + b : b + ',' + a; cnt.set(kk, (cnt.get(kk) || 0) + 1); }
  const field = new Float32Array(w * h);
  for (const [kk, c] of cnt) { if (c !== 1) continue; const [a, b] = kk.split(',').map(Number), A = [uv[a * 2] * w, uv[a * 2 + 1] * h], Bp = [uv[b * 2] * w, uv[b * 2 + 1] * h], L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
    for (let s = 0; s <= L; s += 0.5) { const t = L ? s / L : 0, X = A[0] + (Bp[0] - A[0]) * t, Y = A[1] + (Bp[1] - A[1]) * t;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = Math.round(X + dx), yy = Math.round(Y + dy); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const d = Math.hypot(xx - X, yy - Y), f = d < 1.2 ? 1 : Math.max(0, 1 - (d - 1.2) / 3.5) * 0.5; field[yy * w + xx] = Math.max(field[yy * w + xx], f); } } }
  for (let i = 0; i < w * h; i++) if (field[i] > 0) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - field[i]) + K.edge[c] * field[i]);
  await setWebp(tex, data, w, h, 92); mat.setRoughnessFactor(K.rough);
  console.log('lapel border edges', [...cnt.values()].filter((c) => c === 1).length);
}
// the normal maps' low frequencies (the quilted lumps) mostly removed
export async function flattenPass(doc, K = {}) {
  K = { blur: 18, keep: 0.25, mats: ['suit', 'suit-hem', 'suit-lapels', 'suit-collar'], ...K };
  for (const m of K.mats) { const nt = matOf(doc, m)?.getNormalTexture(); if (!nt) continue; const { data, w, h } = await rgba(nt);
    const bl = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).blur(K.blur * w / 2048 + 0.4).raw().toBuffer();
    for (let i = 0; i < w * h; i++) { let nx = (data[i * 4] - 128) / 127, ny = (data[i * 4 + 1] - 128) / 127; const bx = (bl[i * 4] - 128) / 127, by = (bl[i * 4 + 1] - 128) / 127;
      nx = nx - (1 - K.keep) * bx; ny = ny - (1 - K.keep) * by; const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny)), l = Math.hypot(nx, ny, nz);
      data[i * 4] = Math.round((nx / l) * 127 + 128); data[i * 4 + 1] = Math.round((ny / l) * 127 + 128); data[i * 4 + 2] = Math.round((nz / l) * 127 + 128); }
    await setWebp(nt, data, w, h, 90); }
}
export function shoulderPass(doc, K = {}) {
  K = { drop: 0.012, inward: 0.012, cx: 0.21, wx: 0.05, y0: 1.42, y1: 1.5, ...K };
  const done = new Set(); let n = 0;
  for (const m of ['suit', 'suit-hem', 'suit-buttons']) for (const p of prim(doc, m)) { const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const a = P.getArray().slice(), cnt = P.getCount();
    for (let v = 0; v < cnt; v++) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1]; if (y < K.y0 || x < 0.1) continue;
      const w = Math.exp(-(((x - K.cx) / K.wx) ** 2)) * sm(K.y0, K.y1, y); if (w < 1e-3) continue;
      a[v * 3 + 1] -= K.drop * w; a[v * 3] -= Math.sign(a[v * 3]) * K.inward * w * sm(0.15, 0.21, x); n++; }
    P.setArray(a); }
  console.log('shoulders: points moved', n);
}
// the upper sleeves slimmed toward the arm's axis (the jacket's sleeve head stood out like a pad): by the points' own
// hold on the upper arm, full from 3 cm over the upper arm's root to 10 cm down it, gone by 20 cm
export function sleevePass(doc, K = {}) {
  K = { slim: 0.12, top: 0.22, ...K };
  const B = body(doc), ibm = B.skin.getInverseBindMatrices().getArray(), jp = (nm) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, B.names.indexOf(nm) * 16).invert());
  let n = 0; const done = new Set();
  for (const m of ['suit', 'suit-hem']) for (const p of prim(doc, m)) { const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const a = P.getArray().slice(), J = p.getAttribute('JOINTS_0').getArray(), W = p.getAttribute('WEIGHTS_0'), Wa = W.getArray(), sc = W.getNormalized() ? (Wa instanceof Uint8Array ? 255 : 65535) : 1;
    const up = new Set(B.names.map((nm, i) => (/^upperarm/.test(nm) ? i : -1)).filter((i) => i >= 0));
    for (const s of ['L', 'R']) { const A = jp('upperarm01_' + s), E = jp('lowerarm01_' + s), ax = E.clone().sub(A).normalize(), v3 = new THREE.Vector3();
      for (let v = 0; v < P.getCount(); v++) { if ((a[v * 3] > 0) !== (s === 'L')) continue; let w = 0; for (let k = 0; k < 4; k++) if (up.has(J[v * 4 + k])) w += Wa[v * 4 + k] / sc; if (w < 0.05) continue;
        v3.set(a[v * 3], a[v * 3 + 1], a[v * 3 + 2]); const t = v3.clone().sub(A).dot(ax), c = A.clone().addScaledVector(ax, t), rd = v3.clone().sub(c), rl = rd.length(), upS = rl > 1e-6 ? Math.max(0, rd.y / rl) : 0;
        // (the sleeve head's top (it becomes the shoulder's outer corner when the arm hangs) pulled in the most)
        const f = (K.slim + K.top * upS * upS) * sm(0.05, 0.5, w) * sm(-0.09, -0.03, t) * sm(0.2, 0.1, t); if (f <= 0) continue;
        a[v * 3] += (c.x - a[v * 3]) * f; a[v * 3 + 1] += (c.y - a[v * 3 + 1]) * f; a[v * 3 + 2] += (c.z - a[v * 3 + 2]) * f; n++; } }
    P.setArray(a); }
  console.log('sleeves slimmed at', n, 'points');
}
// (pass 2) the shirt collar's points pulled in: they spread like wings over the lapels, the highest-contrast shape on
// him. The clothes' points whose texel is the collar's white, below the band (1.555 m), toward the knot: 30% narrower
// at the tips, 22% shorter, a few mm back so the lapels take their edge
export async function collarPass(doc, K = {}) {
  K = { narrow: 0.3, short: 0.22, back: 0.004, top: 1.555, ...K };
  const p = prim(doc, 'clothes')[0], P = p.getAttribute('POSITION'), a = P.getArray().slice(), uv = p.getAttribute('TEXCOORD_0').getArray();
  const { data, w, h } = await rgba(matOf(doc, 'clothes').getBaseColorTexture()); let n = 0;
  for (const v of new Set(p.getIndices().getArray())) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1], z = a[v * 3 + 2]; if (y > K.top || y < 1.4 || z < 0.04 || x < 0.026 || x > 0.14) continue;
    const tx = Math.min(w - 1, Math.max(0, Math.floor(uv[v * 2] * w))), ty = Math.min(h - 1, Math.max(0, Math.floor(uv[v * 2 + 1] * h))), i = (ty * w + tx) * 4, L = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (L < 150) continue; const f = sm(K.top, K.top - 0.07, y);
    a[v * 3] = Math.sign(a[v * 3]) * (0.026 + (x - 0.026) * (1 - K.narrow * f)); a[v * 3 + 1] = y + (K.top - y) * K.short * f; a[v * 3 + 2] = z - K.back * f; n++; }
  P.setArray(a); console.log('collar: points moved', n);
}
// (pass 2) the shoulder's step smoothed: at the sleeve head the jacket's top line dipped (1.42 m at x 0.28-0.30) and the
// sleeve's top stood 4 cm over it (1.457 at 0.31): the square 'pad' corner when the arm hangs. A Taubin smoothing
// (shrink-free) of the suit's points over the shoulder and sleeve head, welded by position, rounds it into one curve
export function shoulderSmoothPass(doc, K = {}) {
  K = { it: 28, lam: 0.6, mu: -0.63, x0: 0.16, x1: 0.38, y0: 1.34, ...K };
  const p = prim(doc, 'suit')[0], P = p.getAttribute('POSITION'), a = P.getArray().slice(), I = p.getIndices().getArray(), cnt = P.getCount();
  const key = (v) => `${a[v * 3].toFixed(5)},${a[v * 3 + 1].toFixed(5)},${a[v * 3 + 2].toFixed(5)}`, rep = new Int32Array(cnt), km = new Map();
  for (let v = 0; v < cnt; v++) { const k = key(v); if (!km.has(k)) km.set(k, v); rep[v] = km.get(k); }
  const nb = new Map(); const add = (u, v) => { if (u === v) return; if (!nb.has(u)) nb.set(u, new Set()); nb.get(u).add(v); };
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]]; add(u, v); add(v, u); }
  // (border points (an edge used once) stay put: the hem, cuffs and the collar line)
  const ec = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]], k = u < v ? u + ',' + v : v + ',' + u; ec.set(k, (ec.get(k) || 0) + 1); }
  const border = new Set(); for (const [k, c] of ec) if (c === 1) for (const v of k.split(',').map(Number)) border.add(v);
  const wt = new Map(); for (const v of nb.keys()) { if (border.has(v)) continue; const x = Math.abs(a[v * 3]), y = a[v * 3 + 1];
    const w = sm(K.x0, K.x0 + 0.05, x) * sm(K.x1, K.x1 - 0.04, x) * sm(K.y0, K.y0 + 0.06, y); if (w > 1e-3) wt.set(v, w); }
  for (let it = 0; it < K.it; it++) { const f = it % 2 ? K.mu : K.lam, upd = [];
    for (const [v, w] of wt) { const s = [0, 0, 0], N = nb.get(v); for (const u of N) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; upd.push([v, s.map((q, c) => (q / N.size - a[v * 3 + c]) * f * w)]); }
    for (const [v, d] of upd) for (let c = 0; c < 3; c++) a[v * 3 + c] += d[c]; }
  for (let v = 0; v < cnt; v++) if (rep[v] !== v) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[rep[v] * 3 + c];
  P.setArray(a); console.log('shoulder smooth: points', wt.size);
}
