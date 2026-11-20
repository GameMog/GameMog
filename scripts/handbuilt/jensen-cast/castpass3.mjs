// Jensen Heist's supporting cast, cast round 3 (19 Nov, the critic on round 2): the passes added after castpass2.mjs.
//   frontProfile(doc, K)    rule 1, measured: the torso's side silhouette sternum to belt (the farthest-forward point of the
//                           clothes, and of the skin where nothing covers it, in 1 cm rows over |x| < K.x), the straight line
//                           from its sternum point to its belt point, and the largest forward deviation from that line (m).
//                           The sternum: 5 cm under the shoulder joints; the belt: 7 cm over the hip joints; the belt's point
//                           never in front of the sternum's (a belly at the belt is not a flat front).
//   flatFront3Pass(doc, K)  rule 1, the pass that lands: in each 1 cm column of the torso's front, the column's own line
//                           from its sternum point to its belt point (the belt point never in front of the sternum's: K.lean
//                           behind it), and every point of the clothes and the skin in front of that line drawn back onto it;
//                           the points behind the front moved by the same amount down to K.d1 deep, fading to none at K.d2
//                           (the layers keep their order: a shirt under a jacket stays under it, the ribs are not pushed in)
//   flatGate(doc, id, K)    the build's gate: frontProfile's deviation over K.max (1 cm) fails the build (JC_NOGATE=1 logs it)
// Original procedural work, CC0.
import { sm } from '../young-hero/glb.mjs';
import { jointPos } from './castpass2.mjs';

const OUTER = /^(skin|eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|cornea|beard)$/;
const torsoPrims = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices() && !OUTER.test(p.getMaterial()?.getName() || '') && !/shoe|sneaker|boot|sole|lace|lining|eyelet|button|snap|zip|hardware|glasses/.test(p.getMaterial()?.getName() || ''));
const levels = (doc, K = {}) => { const S = jointPos(doc, 'upperarm01_L'), H = jointPos(doc, 'upperleg01_L'); return { ys: S[1] - (K.sDrop ?? 0.05), yb: H[1] + (K.bUp ?? 0.07) }; };

// a primitive's per-point weight on the arms (a sleeve or a hand held in front of the body is not the body's front)
const ARM = /^(clavicle|shoulder|upperarm|lowerarm|wrist|finger|thumb|metacarpal)/;
export function armW(doc, p) { const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), n = p.getAttribute('POSITION').getCount(), out = new Float32Array(n); if (!J || !W) return out;
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()), arm = names.map((nm) => ARM.test(nm) && !/^clavicle/.test(nm)), j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) { J.getElement(i, j); W.getElement(i, w); for (let k = 0; k < 4; k++) if (arm[j[k]]) out[i] += w[k]; } return out; }
// every garment triangle sampled every ~4 mm (the arms' triangles left out): cb(x, y, z)
function sample(prims, cb, doc) {
  for (const p of prims) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), aw = doc ? armW(doc, p) : null;
    for (let t = 0; t < I.length; t += 3) { if (aw && Math.max(aw[I[t]], aw[I[t + 1]], aw[I[t + 2]]) > 0.3) continue; const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, L = Math.max(Math.hypot(A[a] - A[b], A[a + 1] - A[b + 1], A[a + 2] - A[b + 2]), Math.hypot(A[a] - A[c], A[a + 1] - A[c + 1], A[a + 2] - A[c + 2]), Math.hypot(A[b] - A[c], A[b + 1] - A[c + 1], A[b + 2] - A[c + 2])), m = Math.min(16, Math.ceil(L / 0.004));
      for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) { const u = i / m, v = j / m, w = 1 - u - v; cb(A[a] * w + A[b] * u + A[c] * v, A[a + 1] * w + A[b + 1] * u + A[c + 1] * v, A[a + 2] * w + A[b + 2] * u + A[c + 2] * v); } } }
}

export function frontProfile(doc, K = {}) {
  K = { x: 0.13, ...K };
  const { ys, yb } = levels(doc, K), C = 0.01, rows = new Map();
  // the clothes, and the skin's front where it is the outermost (a bare torso): the skin is sampled too, the max takes the outer
  const prims = [...torsoPrims(doc), ...doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial()?.getName() === 'skin')];
  sample(prims, (x, y, z) => { if (Math.abs(x) > K.x || y < yb - 0.02 || y > ys + 0.02) return; const k = Math.round(y / C); rows.set(k, Math.max(rows.get(k) ?? -9, z)); }, doc);
  const at = (y) => rows.get(Math.round(y / C));
  // (the sternum's point: the chest's forward-most within 3 cm under the sternum's level: the line runs from the chest's front)
  let zs = -9; for (let y = ys - 0.03; y <= ys + 1e-6; y += C) zs = Math.max(zs, at(y) ?? -9); const zb = Math.min(at(yb), zs); let dev = 0, devY = ys; const prof = [];
  for (let y = yb; y <= ys + 1e-6; y += C) { const z = at(y); if (z === undefined) continue; const line = Math.min(zs, zb + (zs - zb) * (y - yb) / (ys - yb - 0.06)), d = z - line; prof.push([+(y.toFixed(2)), +(d * 1000).toFixed(1)]); if (d > dev) { dev = d; devY = y; } }
  return { ys, yb, zs, zb, dev, devY, prof };
}

export function flatFront3Pass(doc, K = {}) {
  K = { xIn: 0.11, xOut: 0.17, lean: 0.004, slack: 0.001, d1: 0.025, d2: 0.08, below: 0.08, ...K };
  const { ys, yb } = levels(doc, K), C = 0.01, col = (x) => Math.round(x / C), fade = (x) => { const a = Math.abs(x); return a <= K.xIn ? 1 : a >= K.xOut ? 0 : 1 - sm(K.xIn, K.xOut, a); };
  const gar = torsoPrims(doc), skinP = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial()?.getName() === 'skin');
  // the front per column and row: the outermost of the clothes and the skin
  const zf = new Map();
  sample([...gar, ...skinP], (x, y, z) => { if (Math.abs(x) > K.xOut + C || y < yb - K.below - 0.03 || y > ys + 0.03 || z < 0) return; const k = col(x) + ',' + Math.round(y / C); zf.set(k, Math.max(zf.get(k) ?? -9, z)); }, doc);
  const at = (x, y) => zf.get(col(x) + ',' + Math.round(y / C));
  // (each column's line: its sternum point, its belt point no further forward than the sternum's less K.lean; the centre
  // column's line caps every other column's (a full bust or belly beside the middle is not a column of its own)
  // (a column with no sternum or belt point of its own (a shoulder's arm-weighted chest, a hand at the belt) takes the
  // nearest one toward the middle)
  const toward = (x, y) => { for (let c = col(x); ; c -= Math.sign(c)) { const z = zf.get(c + ',' + Math.round(y / C)); if (z !== undefined || c === 0) return z; } };
  const line = (x, y) => { let zs = -9; for (let yy = ys - 0.03; yy <= ys + 1e-6; yy += C) zs = Math.max(zs, toward(x, yy) ?? -9); if (zs < -1) zs = undefined; const zb0 = toward(x, yb); if (zs === undefined || zb0 === undefined) return undefined; const zb = Math.min(zb0, zs - K.lean); return y <= yb ? zb : Math.min(zs, zb + (zs - zb) * (y - yb) / (ys - yb - 0.06)); };
  // (the buttons, snaps and zips ride with the front they sit on: moved, never sampled)
  const trim = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices() && /button|snap|zip|hardware/.test(p.getMaterial()?.getName() || ''));
  let n = 0, mx = 0; const seen = new Set();
  for (const p of [...gar, ...skinP, ...trim]) { const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice(), aw = armW(doc, p);
    for (let v = 0; v < A.length / 3; v++) { if (aw[v] > 0.3) continue; const x = A[v * 3], y = A[v * 3 + 1], z = A[v * 3 + 2]; if (y <= yb - K.below || y >= ys || z < 0) continue; const f = fade(x); if (!f) continue;
      const L = line(x, y), front = at(x, y); if (L === undefined || front === undefined) continue; const over = front - (L + K.slack); if (over <= 0) continue;
      const depth = Math.max(0, front - z); if (depth > K.d2) continue; const k = depth <= K.d1 ? 1 : 1 - sm(K.d1, K.d2, depth);
      // (eased in over 4 cm from the sternum and the belt, so the line meets the chest and the hips without a step)
      // (below the belt, K.below more: the waistband and the lower belly held to the belt's point, eased out toward the hips)
      const w = f * k * (y >= yb ? sm(0, 0.02, ys - y) : sm(yb - K.below, yb - 0.01, y)), mv = over * w; A[v * 3 + 2] = z - mv; mx = Math.max(mx, mv); n++; }
    acc.setArray(A); }
  console.log('flat front 3: sternum', ys.toFixed(3), 'belt', yb.toFixed(3), '; points drawn back', n, 'up to', (mx * 1000).toFixed(1), 'mm');
}

export function flatGate(doc, id, K = {}) {
  const r = frontProfile(doc, K), mm = (r.dev * 1000).toFixed(1), ok = r.dev <= (K.max ?? 0.01);
  console.log(`flat gate: ${id} standing, the garment's front sternum (${r.ys.toFixed(2)}) to belt (${r.yb.toFixed(2)}): max forward of the line ${mm} mm at y ${r.devY.toFixed(2)} ${ok ? 'PASS' : 'FAIL'} (limit ${((K.max ?? 0.01) * 1000).toFixed(0)} mm)`);
  if (!ok && !process.env.JC_NOGATE) throw new Error(`flat gate: ${id} front ${mm} mm past the sternum-belt line`);
  return r;
}

// rule 9, a layer drawn in under the one over it (the Directors' shirt and tie in shards through the suit's lapels and
// collar): every point of the inner garment (K.inner) that meets the outer one (K.outer) along its normal, in front of it
// or up to K.back behind it, moved in to K.gap under it. The open V (the shirt where no suit is over it) is never touched.
export function layerMaskPass(doc, K = {}) {
  K = { inner: /^clothes$/, outer: /^suit(-collar|-lapels|-hem)?$/, gap: 0.004, back: 0.012, fwd: 0.04, ...K };
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices()), outer = prims.filter((p) => K.outer.test(p.getMaterial()?.getName() || '')), inner = prims.filter((p) => K.inner.test(p.getMaterial()?.getName() || ''));
  const cell = 0.02, G = new Map(), T = [];
  for (const p of outer) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(); if (I.length < 6) continue;
    for (let t = 0; t < I.length; t += 3) { const k = T.length / 9; for (const v of [I[t], I[t + 1], I[t + 2]]) T.push(A[v * 3], A[v * 3 + 1], A[v * 3 + 2]);
      const mn = [0, 1, 2].map((c) => Math.min(T[k * 9 + c], T[k * 9 + 3 + c], T[k * 9 + 6 + c])), mx = [0, 1, 2].map((c) => Math.max(T[k * 9 + c], T[k * 9 + 3 + c], T[k * 9 + 6 + c]));
      for (let x = Math.floor(mn[0] / cell); x <= Math.floor(mx[0] / cell); x++) for (let y = Math.floor(mn[1] / cell); y <= Math.floor(mx[1] / cell); y++) for (let z = Math.floor(mn[2] / cell); z <= Math.floor(mx[2] / cell); z++) { const kk = x + ',' + y + ',' + z; (G.get(kk) || G.set(kk, []).get(kk)).push(k); } } }
  const hit = (o, d, k) => { const i = k * 9, e1 = [T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]], e2 = [T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) return NaN;
    const inv = 1 / det, s = [o[0] - T[i], o[1] - T[i + 1], o[2] - T[i + 2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) return NaN;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) return NaN;
    return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv; };
  let n = 0, mxv = 0; const seen = new Set(), nv = [0, 0, 0];
  for (const p of inner) { const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice(), N = p.getAttribute('NORMAL'), used = new Set(p.getIndices().getArray());
    for (const v of used) { N.getElement(v, nv); const l = Math.hypot(...nv) || 1, o = [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]], d = nv.map((x) => x / l); const tried = new Set(); let best = NaN;
      for (let s = -K.back; s <= K.fwd + 1e-6; s += cell / 2) { const L = G.get(Math.floor((o[0] + d[0] * s) / cell) + ',' + Math.floor((o[1] + d[1] * s) / cell) + ',' + Math.floor((o[2] + d[2] * s) / cell)); if (!L) continue;
        for (const k of L) { if (tried.has(k)) continue; tried.add(k); const t = hit(o, d, k); if (t >= -K.back && t <= K.fwd && !(Math.abs(t) > Math.abs(best))) best = t; } }
      if (Number.isNaN(best)) continue; const mv = Math.min(0, best - K.gap); if (!mv) continue;
      for (let c = 0; c < 3; c++) A[v * 3 + c] = o[c] + d[c] * mv; n++; mxv = Math.min(mxv, mv); }
    acc.setArray(A); }
  console.log('layer mask:', String(K.inner), 'drawn in under', String(K.outer), n, 'points, up to', (-mxv * 1000).toFixed(1), 'mm');
}

