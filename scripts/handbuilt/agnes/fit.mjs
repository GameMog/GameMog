// Hand-built Agnes, the fit passes (what the forge's gates found on her forged uniform-jacket base):
//  cull       hidden layers taken out under the layer over them (the cloth gate: skin, the trousers' waist and the shoes'
//             tops came through the jacket and the trousers in the clips): an inner triangle goes when all three of its
//             points lie behind the outer layer's surface (against its nearest point's normal, within 3.5 cm), so what
//             shows at a cuff, the hem or an ankle is kept
//  shoulders  the jacket's shoulder ends 6 mm lower and a little in (the gate: the arm's end sat 6 mm over the line of
//             the shoulder, a pad's corner), a soft field round 21 cm out
//  corners    the mouth's corners lifted 2.2 mm (the talk gate: the corners sank to 0.72 of the opening, a grimace), the
//             lips' middle still so the carried parting holds (the young mother's and Carissa's pass, at her mouth)
//  collar     the blouse collar drawn 2.5 mm in toward the neck's axis (the collar gate: it stood 5-8 mm off the neck)
import { body, prim, sm } from '../young-hero/glb.mjs';

const big = (doc, name) => prim(doc, name).sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
export function cullPass(doc, pairs, K = {}) {
  K = { maxD: 0.035, margin: 0.0015, ...K };
  for (const [innerName, outerNames] of pairs) {
    const inner = big(doc, innerName); if (!inner) continue;
    const outs = outerNames.map((n) => big(doc, n)).filter(Boolean); if (!outs.length) continue;
    const cell = 0.02, G = new Map(), pts = []; const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (const o of outs) { const P = o.getAttribute('POSITION').getArray(), N = o.getAttribute('NORMAL'), Na = N.getArray(), ns = N.getNormalized() ? (Na instanceof Int8Array ? 127 : 32767) : 1;
      for (const v of new Set(o.getIndices().getArray())) { const q = pts.length; pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Na[v * 3] / ns, Na[v * 3 + 1] / ns, Na[v * 3 + 2] / ns]); const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(q); } }
    const P = inner.getAttribute('POSITION').getArray(), I = inner.getIndices().getArray(), behind = new Map();
    const isBehind = (v) => { if (behind.has(v)) return behind.get(v); const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; let best = null, bd = K.maxD;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) { const L = G.get(`${cx + i},${cy + j},${cz + k}`); if (!L) continue; for (const q of L) { const p = pts[q], d = Math.hypot(p[0] - x, p[1] - y, p[2] - z); if (d < bd) { bd = d; best = p; } } }
      const r = !!best && ((x - best[0]) * best[3] + (y - best[1]) * best[4] + (z - best[2]) * best[5]) < -K.margin; behind.set(v, r); return r; };
    const keep = []; let cut = 0;
    for (let t = 0; t < I.length; t += 3) { if (isBehind(I[t]) && isBehind(I[t + 1]) && isBehind(I[t + 2])) { cut++; continue; } keep.push(I[t], I[t + 1], I[t + 2]); }
    const acc = inner.getIndices(); acc.setArray(new (I.constructor)(keep));
    console.log('cull', innerName, 'under', outerNames.join('+'), cut, 'of', I.length / 3, 'triangles');
  }
}
export function shoulderPass(doc, K = {}) {
  K = { drop: 0.006, inward: 0.006, cx: 0.215, wx: 0.045, y0: 1.24, y1: 1.3, mats: ['uniform', 'uniform-hem', 'uniform-buttons'], ...K };
  const done = new Set(); let n = 0;
  for (const m of K.mats) for (const p of prim(doc, m)) { const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const a = P.getArray().slice(), cnt = P.getCount();
    for (let v = 0; v < cnt; v++) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1]; if (y < K.y0 || x < 0.1) continue;
      const w = Math.exp(-(((x - K.cx) / K.wx) ** 2)) * sm(K.y0, K.y1, y); if (w < 1e-3) continue;
      a[v * 3 + 1] -= K.drop * w; a[v * 3] -= Math.sign(a[v * 3]) * K.inward * w * sm(0.15, 0.21, x); n++; }
    P.setArray(a); }
  console.log('shoulders: points moved', n);
}
export function cornerLiftPass(doc, K = {}) {
  K = { lift: 0.0022, out: 0.0003, r: 0.0065, cx: 0.0212, mouthY: 1.4936, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^head$/); let n = 0, mx = 0;
  for (let v = 0; v < a.length / 3; v++) { if (head[v] < 0.5) continue; const x = Math.abs(a[v * 3]), y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z < 0.11) continue;
    const d = Math.hypot(x - K.cx, (y - K.mouthY) * 1.2), w = Math.exp(-((d / K.r) ** 2)) * sm(0.008, 0.014, x); if (w < 0.01) continue;
    a[v * 3 + 1] += K.lift * w; a[v * 3] += Math.sign(a[v * 3]) * K.out * w; n++; mx = Math.max(mx, K.lift * w); }
  P.setArray(a); console.log('mouth corners lifted', n, 'points, max mm', (mx * 1000).toFixed(2));
}
export function collarInPass(doc, K = {}) {
  K = { k: 0.0025, kBack: 0.004, back: 9, ...K };
  const p = prim(doc, 'uniform-collar')[0]; if (!p) return; const P = p.getAttribute('POSITION'), a = P.getArray().slice(), cnt = P.getCount();
  // the neck's axis: the collar's own centre in x and z
  let cx = 0, cz = 0, ylo = 9, yhi = -9; for (let v = 0; v < cnt; v++) { cx += a[v * 3]; cz += a[v * 3 + 2]; ylo = Math.min(ylo, a[v * 3 + 1]); yhi = Math.max(yhi, a[v * 3 + 1]); } cx /= cnt; cz /= cnt; const cy0 = ylo, cy1 = ylo + 0.6 * (yhi - ylo); // (the back's top edge drawn in most)
  for (let v = 0; v < cnt; v++) { const dx = a[v * 3] - cx, dz = a[v * 3 + 2] - cz, r = Math.hypot(dx, dz) || 1, k = K.k + (K.kBack - K.k) * sm(0, -0.03, dz) * sm(cy0, cy1, a[v * 3 + 1]); a[v * 3] -= (dx / r) * k; a[v * 3 + 2] -= (dz / r) * k; }
  P.setArray(a);
  // (its back half taken off: from behind, its inside showed past the jacket's neckline when she talked (the collar gate's
  // flecks, 165 px of lining at 180 deg); a blouse collar under a cardigan shows at the front and the sides)
  const I = p.getIndices().getArray(), keep = []; for (let t = 0; t < I.length; t += 3) { const z = (a[I[t] * 3 + 2] + a[I[t + 1] * 3 + 2] + a[I[t + 2] * 3 + 2]) / 3; if (z < cz - K.back) continue; keep.push(I[t], I[t + 1], I[t + 2]); }
  p.getIndices().setArray(new (I.constructor)(keep)); console.log('collar drawn in', cnt, 'triangles kept', keep.length / 3, 'of', I.length / 3);
}
