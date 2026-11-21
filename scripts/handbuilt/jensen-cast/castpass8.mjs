// Jensen Heist's supporting cast, suits round 1 (20 Nov, the owner after playing the RC: "Mr. Board suit needs work, so
// does Director Grey shoulder & Director Navy"). The front passes (flat front 3/5, vertFrontPass) push the jacket's chest
// back by up to 8 cm while the cloth beside it stays put: the shear folds the jacket over itself (the dark shards and
// see-through holes are the cloth's inside), and the forge's padded shoulder crest reads as humps in the call tile.
// A post pass on a built body, run against a reference build of the same garments (the same points and triangles) made
// without the front passes (the facings the cloth should keep):
//   foldCount(...)               garment triangles whose facing turned past 90 degrees against the reference
//   smoothFoldsPass(doc, ref, K) the garment's displacement from the reference (what the front passes did) smoothed over
//     the welded mesh (seam duplicates move as one): the push-back keeps its size but tapers out over the chest instead of
//     stepping, so nothing folds; in the front's middle (|x| < K.xMid) a point never comes forward of where it was (rule 1
//     holds). Then the skin and the under-layer are drawn in under it again by the caller.
//   shoulderPass(doc, K)         the suit's shoulder crest taken down onto the skin's own shoulder line plus an ease, so
//     the shoulder reads as a natural, crisp line from the collar to the sleeve head (no pad dome)
//   node scripts/handbuilt/jensen-cast/castpass8.mjs <ref.glb> <in.glb> <out.glb> [K json]
// Original procedural work, CC0.
import fs from 'node:fs';
import { jointPos } from './castpass2.mjs';
import { body } from '../young-hero/glb.mjs';
const BODY = /^(skin|eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|cornea|beard|glasses.*|lens.*|frame.*)$/;
const NOT = /shoe|sneaker|boot|sole|lace|lining|eyelet/;
export const garments = (doc, re) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => { const n = p.getMaterial()?.getName() || ''; return p.getIndices() && p.getIndices().getCount() > 3 && !BODY.test(n) && !NOT.test(n) && (!re || re.test(n)); });
const nrm = (A, a, b, c) => { const e1 = [A[b * 3] - A[a * 3], A[b * 3 + 1] - A[a * 3 + 1], A[b * 3 + 2] - A[a * 3 + 2]], e2 = [A[c * 3] - A[a * 3], A[c * 3 + 1] - A[a * 3 + 1], A[c * 3 + 2] - A[a * 3 + 2]];
  return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; };
export function foldCount(A, R, I) { let n = 0; for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; const p = nrm(R, I[t], I[t + 1], I[t + 2]), q = nrm(A, I[t], I[t + 1], I[t + 2]), l = Math.hypot(...p) * Math.hypot(...q); if (l > 0 && (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / l < 0) n++; } return n; }
// the reference's garment positions by material name
export function refOf(rdoc) { const m = new Map(); for (const p of garments(rdoc)) m.set(p.getMaterial().getName(), p.getAttribute('POSITION').getArray().slice()); return m; }

export function smoothFoldsPass(doc, ref, K = {}) {
  K = { mats: /^(suit|suit-hem)$/, yLo: 0.85, yHi: 1.75, iters: 60, lam: 0.5, xMid: 0.13, zMid: 0.0, until: 0, pin: [0.03, 0.02], axes: [0, 1, 2], edges: true, ...K };
  // (the sternum's rows (rule 1's line's top end, neck01 - 4 cm) pinned in the front's middle: the line keeps its anchor)
  const ys = jointPos(doc, 'neck01')[1] - 0.04, yb = jointPos(doc, 'upperleg01_L')[1] + 0.07, band = (y, c, a, b) => y > c - a && y < c + b;
  // (and the belt's rows (hips + 7 cm, the line's bottom end) with K.pinBelt)
  const pinned = (v, R0) => K.pin && Math.abs(R0[v * 3]) < K.xMid && R0[v * 3 + 2] > K.zMid && (band(R0[v * 3 + 1], ys, K.pin[0], K.pin[1]) || (K.pinBelt && band(R0[v * 3 + 1], yb, K.pinBelt[0], K.pinBelt[1])));
  const out = [];
  for (const p of garments(doc, K.mats)) { const nm = p.getMaterial().getName(), R0 = ref.get(nm), acc = p.getAttribute('POSITION'), A = acc.getArray().slice(); if (!R0 || R0.length !== A.length) { console.log('smooth folds: no reference for', nm); continue; }
    const I = p.getIndices().getArray(), n = A.length / 3, id = new Int32Array(n), wk = new Map();
    for (let v = 0; v < n; v++) { const k = Math.round(R0[v * 3] * 2e4) + ',' + Math.round(R0[v * 3 + 1] * 2e4) + ',' + Math.round(R0[v * 3 + 2] * 2e4); if (!wk.has(k)) wk.set(k, v); id[v] = wk.get(k); }
    const nb = new Map(), add = (a, b) => { a = id[a]; b = id[b]; if (a !== b) (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); };
    for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { add(a, b); add(b, a); } }
    // (the cloth's open edges (the V's straight lapel line, the cuffs, the hem) stay where the passes put them with K.edges)
    const ec = new Map(); for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const x = id[a], y = id[b], k = x < y ? x + ',' + y : y + ',' + x; ec.set(k, (ec.get(k) || 0) + 1); } }
    const open = new Set(); for (const [k, c] of ec) if (c === 1) for (const v of k.split(',')) open.add(+v);
    const members = new Map(); for (let v = 0; v < n; v++) (members.get(id[v]) || members.set(id[v], []).get(id[v])).push(v);
    // a point's weight in the smoothing: 1 inside the torso's band, fading to 0 over 6 cm at its ends (the collar, the hem)
    const wt = (v) => { const y = R0[v * 3 + 1]; return Math.max(0, Math.min(1, (y - K.yLo) / 0.06, (K.yHi - y) / 0.06)); };
    const f0 = foldCount(A, R0, I); let it = 0;
    for (; it < K.iters; it++) { const D = new Map();
      for (const [v, N] of nb) { const w = pinned(v, R0) ? 0 : wt(v) * K.lam; if (!w) continue; const d = [0, 0, 0]; for (const u of N) for (let c = 0; c < 3; c++) d[c] += A[u * 3 + c] - R0[u * 3 + c]; D.set(v, d.map((x, c) => (A[v * 3 + c] - R0[v * 3 + c]) * (1 - w) + (x / N.size) * w)); }
      for (const [v, d] of D) { const x = R0[v * 3], z = A[v * 3 + 2];
        // (the front's middle: never forward of where the rule passes left it)
        if (Math.abs(x) < K.xMid && z > K.zMid) d[2] = Math.min(d[2], z - R0[v * 3 + 2]);
        if (K.edges && open.has(v)) continue; for (const m of members.get(v)) for (const c of K.axes) A[m * 3 + c] = R0[m * 3 + c] + d[c]; }
      if (K.until && it % 10 === 9 && foldCount(A, R0, I) <= K.until) { it++; break; } }
    const f1 = foldCount(A, R0, I); acc.setArray(A); out.push([nm, f0, f1]); console.log(`smooth folds: ${nm} folded triangles ${f0} -> ${f1} (${it} passes)`); }
  return out;
}

// the suit's shoulders and upper sleeves brought onto the skin plus an ease: every garment point over the shoulder's band
// (from K.drop under the shoulder joint up, |x| past the collar's K.x0) farther than K.ease from the nearest skin point
// is set K.ease off it along that line (K.k of the excess taken), faded in over K.fade at the band's edges; then the moved
// field smoothed K.smooth passes over the welded mesh (no facets). The skin under it and the layer under it are drawn in
// by the caller after.
export function shoulderPass(doc, K = {}) {
  K = { mats: /^(suit|suit-hem)$/, ease: 0.014, k: 1, drop: 0.24, x0: 0.075, fade: 0.04, smooth: 6, lam: 0.5, ...K };
  const B = body(doc), SA = B.pos, wHead = B.wOn(/^(head|neck0[23]|jaw|.*eye.*|.*lid.*|tongue.*|special.*|levator.*|oris.*|temporalis.*|risorius.*|cheek.*|nose.*|ear.*)$/), wHand = B.wOn(/^(wrist|metacarpal|finger|thumb|lowerarm)/);
  const SL = jointPos(doc, 'upperarm01_L'), sy = SL[1], cell = 0.02, G = new Map(), used = new Set(B.idx);
  for (const v of used) { if (wHead[v] > 0.3 || wHand[v] > 0.5 || SA[v * 3 + 1] < sy - K.drop - 0.1) continue; const k = Math.floor(SA[v * 3] / cell) + ',' + Math.floor(SA[v * 3 + 1] / cell) + ',' + Math.floor(SA[v * 3 + 2] / cell); (G.get(k) || G.set(k, []).get(k)).push(v); }
  const near = (x, y, z) => { let best = 9, bv = -1; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const v of G.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)) || []) { const d = Math.hypot(SA[v * 3] - x, SA[v * 3 + 1] - y, SA[v * 3 + 2] - z); if (d < best) { best = d; bv = v; } } return [best, bv]; };
  const wBand = (x, y) => Math.max(0, Math.min(1, (Math.abs(x) - K.x0) / K.fade, (y - (sy - K.drop)) / K.fade));
  for (const p of garments(doc, K.mats)) { const acc = p.getAttribute('POSITION'), A0 = acc.getArray(), A = A0.slice(), n = A.length / 3, I = p.getIndices().getArray(); let moved = 0, mx = 0;
    for (const v of new Set(I)) { const x = A[v * 3], y = A[v * 3 + 1], z = A[v * 3 + 2], w = wBand(x, y); if (!w) continue; const [d, q] = near(x, y, z); if (q < 0 || d <= K.ease) continue;
      const t = (d - (d - K.ease) * K.k * w) / d; for (let c = 0; c < 3; c++) A[v * 3 + c] = SA[q * 3 + c] + (A[v * 3 + c] - SA[q * 3 + c]) * t; moved++; mx = Math.max(mx, (d - K.ease) * K.k * w); }
    // smoothing of the move (welded by position), in the band only
    const id = new Int32Array(n), wk = new Map(); for (let v = 0; v < n; v++) { const k = Math.round(A0[v * 3] * 2e4) + ',' + Math.round(A0[v * 3 + 1] * 2e4) + ',' + Math.round(A0[v * 3 + 2] * 2e4); if (!wk.has(k)) wk.set(k, v); id[v] = wk.get(k); }
    const nb = new Map(), add = (a, b) => { a = id[a]; b = id[b]; if (a !== b) (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); }; for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { add(a, b); add(b, a); } }
    const members = new Map(); for (let v = 0; v < n; v++) (members.get(id[v]) || members.set(id[v], []).get(id[v])).push(v);
    for (let it = 0; it < K.smooth; it++) { const D = new Map(); for (const [v, N] of nb) { const w = wBand(A0[v * 3], A0[v * 3 + 1]) * K.lam; if (!w) continue; const d = [0, 0, 0]; for (const u of N) for (let c = 0; c < 3; c++) d[c] += A[u * 3 + c] - A0[u * 3 + c]; D.set(v, d.map((s, c) => (A[v * 3 + c] - A0[v * 3 + c]) * (1 - w) + s / N.size * w)); }
      for (const [v, d] of D) for (const m of members.get(v)) for (let c = 0; c < 3; c++) A[m * 3 + c] = A0[m * 3 + c] + d[c]; }
    acc.setArray(A); console.log(`shoulder: ${p.getMaterial().getName()} points ${moved} taken in, up to ${(mx * 1000).toFixed(1)} mm (ease ${K.ease * 1000} mm)`); }
}

// the suit's V a clean straight edge: every open-edge point of the jacket's front between the V's bottom (the top button)
// and the collar (the slits and spikes the forge's dropped lapel overlay left: points up to 4 cm off the line and 4 cm deep)
// set onto the straight line |x| = K.xTop * (y - yB) / (yT - yB) on its own side, its depth the mean of its inner
// neighbours' (no crevice), the edge's depth then eased along the chain. K.xTop/K.yB/K.yT default to the measured V
// (the narrowest open edge per 1 cm row). K.scale narrows (< 1) the V so it falls inside the shirt's own white.
export function vEdgePass(doc, K = {}) {
  K = { mats: /^suit$/, z0: 0.02, xMax: 0.11, scale: 1, ease: 3, ...K };
  for (const p of garments(doc, K.mats)) { const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), I = p.getIndices().getArray(), n = A.length / 3, id = new Int32Array(n), wk = new Map();
    for (let v = 0; v < n; v++) { const k = Math.round(A[v * 3] * 2e4) + ',' + Math.round(A[v * 3 + 1] * 2e4) + ',' + Math.round(A[v * 3 + 2] * 2e4); if (!wk.has(k)) wk.set(k, v); id[v] = wk.get(k); }
    const members = new Map(); for (let v = 0; v < n; v++) (members.get(id[v]) || members.set(id[v], []).get(id[v])).push(v);
    const ec = new Map(), nb = new Map(), side = new Map(); for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; const cx = (A[I[t] * 3] + A[I[t + 1] * 3] + A[I[t + 2] * 3]) / 3;
      for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const x = id[a], y = id[b], k = x < y ? x + ',' + y : y + ',' + x; ec.set(k, (ec.get(k) || 0) + 1); (nb.get(x) || nb.set(x, new Set()).get(x)).add(y); (nb.get(y) || nb.set(y, new Set()).get(y)).add(x); }
      for (let k = 0; k < 3; k++) side.set(id[I[t + k]], (side.get(id[I[t + k]]) || 0) + cx); }
    const open = new Set(), chain = new Map(); for (const [k, c] of ec) if (c === 1) { const [a, b] = k.split(',').map(Number); open.add(a); open.add(b); (chain.get(a) || chain.set(a, []).get(a)).push(b); (chain.get(b) || chain.set(b, []).get(b)).push(a); }
    const front = [...open].filter((v) => A[v * 3 + 2] > K.z0 && Math.abs(A[v * 3]) < K.xMax && A[v * 3 + 1] > 1.0 && A[v * 3 + 1] < 1.65);
    // the V's rows: the narrowest |x| of the front's open points per 1 cm
    const rows = new Map(); for (const v of front) { const r = Math.round(A[v * 3 + 1] * 100); rows.set(r, Math.min(rows.get(r) ?? 9, Math.abs(A[v * 3]))); }
    const rs = [...rows.keys()].sort((a, b) => a - b); if (rs.length < 10) { console.log('v edge: no V'); continue; }
    const yT = K.yT ?? (rs[rs.length - 3] / 100), yB = K.yB ?? (rs.find((r) => rows.get(r) > 0.004) / 100 - 0.01), xT = (K.xTop ?? [rs.length - 3, rs.length - 4, rs.length - 5].map((i) => rows.get(rs[i])).sort((a, b) => a - b)[1]) * K.scale;
    const line = (y) => Math.max(0, xT * (y - yB) / (yT - yB));
    const on = front.filter((v) => A[v * 3 + 1] > yB + 0.005 && A[v * 3 + 1] < yT); let moved = 0, mx = 0;
    for (const v of on) { const s = Math.sign(side.get(v) || A[v * 3]) || 1, x = s * line(A[v * 3 + 1]); const inner = [...(nb.get(v) || [])].filter((u) => !open.has(u)); const z = inner.length ? inner.reduce((q, u) => q + A[u * 3 + 2], 0) / inner.length : A[v * 3 + 2];
      mx = Math.max(mx, Math.hypot(x - A[v * 3], z - A[v * 3 + 2])); for (const m of members.get(v)) { A[m * 3] = x; A[m * 3 + 2] = Math.max(z, A[m * 3 + 2] - 0.0) === z ? z : z; } moved++; }
    const onS = new Set(on); for (let it = 0; it < K.ease; it++) { const Z = new Map(); for (const v of on) { const c = (chain.get(v) || []).filter((u) => onS.has(u)); if (c.length) Z.set(v, 0.5 * A[v * 3 + 2] + 0.5 * c.reduce((q, u) => q + A[u * 3 + 2], 0) / c.length); } for (const [v, z] of Z) for (const m of members.get(v)) A[m * 3 + 2] = z; }
    // (the cloth's triangles that now lie inside the V (between the line and the middle) out)
    const keep = []; let cut = 0; for (let t = 0; t < I.length; t += 3) { const cx = (A[I[t] * 3] + A[I[t + 1] * 3] + A[I[t + 2] * 3]) / 3, cy = (A[I[t] * 3 + 1] + A[I[t + 1] * 3 + 1] + A[I[t + 2] * 3 + 1]) / 3, cz = (A[I[t] * 3 + 2] + A[I[t + 1] * 3 + 2] + A[I[t + 2] * 3 + 2]) / 3;
      if (cz > K.z0 && cy > yB + 0.005 && cy < yT && Math.abs(cx) < line(cy) - 0.002) { cut++; continue; } keep.push(I[t], I[t + 1], I[t + 2]); }
    acc.setArray(A); if (cut) p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new I.constructor(keep)).setBuffer(doc.getRoot().listBuffers()[0]));
    console.log(`v edge: ${p.getMaterial().getName()} V ${(yB).toFixed(2)}..${yT.toFixed(2)} half-width ${(xT * 100).toFixed(1)} cm: ${moved} edge points onto the line (up to ${(mx * 1000).toFixed(0)} mm), ${cut} triangles out`); }
}

// the cloth over the body, not the body: the jacket's own surface Taubin-smoothed (K.lam / K.mu, no shrink) over the chest,
// the shoulders and the upper sleeves (from K.yLo up; the collar's ring over K.yHi left), its open edges (the V's line, the
// cuffs, the hem) held: the muscle relief the forge's cloth copied off the skin (pecs, nipples, deltoid domes, the
// trapezius' crest by the collar) goes; the cloth's broad shape stays.
export function fabricPass(doc, K = {}) {
  K = { mats: /^(suit)$/, iters: 20, lam: 0.5, mu: -0.53, yLo: 1.0, yHi: 1.62, fade: 0.05, xArm: 0.42, ...K };
  for (const p of garments(doc, K.mats)) { const acc = p.getAttribute('POSITION'), A0 = acc.getArray(), A = A0.slice(), I = p.getIndices().getArray(), n = A.length / 3, id = new Int32Array(n), wk = new Map();
    for (let v = 0; v < n; v++) { const k = Math.round(A[v * 3] * 2e4) + ',' + Math.round(A[v * 3 + 1] * 2e4) + ',' + Math.round(A[v * 3 + 2] * 2e4); if (!wk.has(k)) wk.set(k, v); id[v] = wk.get(k); }
    const members = new Map(); for (let v = 0; v < n; v++) (members.get(id[v]) || members.set(id[v], []).get(id[v])).push(v);
    const ec = new Map(), nb = new Map(); for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const x = id[a], y = id[b], k = x < y ? x + ',' + y : y + ',' + x; ec.set(k, (ec.get(k) || 0) + 1); (nb.get(x) || nb.set(x, new Set()).get(x)).add(y); (nb.get(y) || nb.set(y, new Set()).get(y)).add(x); } }
    const open = new Set(); for (const [k, c] of ec) if (c === 1) for (const v of k.split(',')) open.add(+v);
    const wt = (v) => open.has(v) ? 0 : Math.max(0, Math.min(1, (A0[v * 3 + 1] - K.yLo) / K.fade, (K.yHi - A0[v * 3 + 1]) / K.fade, (K.xArm - Math.abs(A0[v * 3])) / K.fade));
    const W = new Map(); for (const v of nb.keys()) { const w = wt(v); if (w) W.set(v, w); }
    const step = (f) => { const D = new Map(); for (const [v, w] of W) { const N = nb.get(v), m = [0, 0, 0]; for (const u of N) for (let c = 0; c < 3; c++) m[c] += A[u * 3 + c]; D.set(v, [0, 1, 2].map((c) => A[v * 3 + c] + f * w * (m[c] / N.size - A[v * 3 + c]))); }
      for (const [v, d] of D) for (const mm of members.get(v)) for (let c = 0; c < 3; c++) A[mm * 3 + c] = d[c]; };
    for (let it = 0; it < K.iters; it++) { step(K.lam); step(K.mu); }
    let mx = 0; for (let v = 0; v < n; v++) mx = Math.max(mx, Math.hypot(A[v * 3] - A0[v * 3], A[v * 3 + 1] - A0[v * 3 + 1], A[v * 3 + 2] - A0[v * 3 + 2]));
    acc.setArray(A); console.log(`fabric: ${p.getMaterial().getName()} ${W.size} points smoothed (${K.iters} Taubin passes), moved up to ${(mx * 1000).toFixed(1)} mm`); }
}

// the layer under the jacket (the shirt-and-inner-jacket 'clothes': its buttons and its inner lapel poked through the
// jacket's front as dark hexagons and wedges) set K.gap behind the jacket's front wherever the jacket covers it (outside
// the V's line + K.margin), by a 1 cm grid of the jacket's front depth
export function underPass(doc, K = {}) {
  K = { outer: /^(suit|suit-hem)$/, inner: /^clothes$/, gap: 0.005, z0: 0.0, yLo: 0.85, yHi: 1.6, margin: 0.006, xMax: 0.2, yV: 1.17, reach: 0.025, ...K };
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices() && p.getIndices().getCount() > 3), cell = 0.01, sz = new Map(), kk = (x, y) => Math.round(x / cell) + ',' + Math.round(y / cell);
  for (const p of prims.filter((p) => K.outer.test(p.getMaterial()?.getName() || ''))) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; // the triangle's points and its centroid
      const pts = [I[t], I[t + 1], I[t + 2]].map((v) => [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]]); pts.push([0, 1, 2].map((c) => (pts[0][c] + pts[1][c] + pts[2][c]) / 3));
      for (const [x, y, z] of pts) { if (z < K.z0) continue; const k = kk(x, y); if (!(sz.get(k) >= z)) sz.set(k, z); } } }
  // the V's open middle: per 1 cm row the narrowest |x| with no jacket in front
  let pushed = 0, mx = 0;
  for (const q of prims.filter((p) => K.inner.test(p.getMaterial()?.getName() || ''))) { const acc = q.getAttribute('POSITION'), B = acc.getArray().slice();
    for (const v of new Set(q.getIndices().getArray())) { const x = B[v * 3], y = B[v * 3 + 1], z = B[v * 3 + 2]; if (z < K.z0 || y < K.yLo || y > K.yHi || Math.abs(x) > K.xMax) continue;
      // covered: the jacket in this cell and the cells K.margin to either side
      // covered: the jacket within K.reach to the left AND to the right on the rows round it (the jacket's points are ~2 cm
      // apart), outside the V (K.margin past the V's open middle); under the V's bottom (K.yV) the closure counts as covered
      let L = -9, Rr = -9; for (let dy = -K.reach; dy <= K.reach + 1e-9; dy += cell) for (let dx = cell; dx <= K.reach + 1e-9; dx += cell) { const l = sz.get(kk(x - dx, y + dy)), r = sz.get(kk(x + dx, y + dy)); if (l !== undefined) L = Math.max(L, l); if (r !== undefined) Rr = Math.max(Rr, r); }
      if (L < -1 || Rr < -1) continue; const c0 = sz.get(kk(x, y)); if (y >= K.yV && (c0 === undefined || sz.get(kk(x - K.margin, y)) === undefined || sz.get(kk(x + K.margin, y)) === undefined)) continue;
      const f = Math.min(L, Rr); if (z > f - K.gap) { mx = Math.max(mx, z - (f - K.gap)); B[v * 3 + 2] = f - K.gap; pushed++; } }
    acc.setArray(B); }
  console.log(`under: ${pushed} points of the layer under the jacket set ${K.gap * 1000} mm behind its front (up to ${(mx * 1000).toFixed(1)} mm)`);
}

// one depth field for every layer of the front (the jacket, the shirt and the trousers' waist under it, the pocket flaps,
// the buttons): each layer's own push-back made it slide through the next (the dark hip patches: the jacket's skirt behind
// the trousers' band; the hexagon: a shirt button ahead of the jacket). The push-back the front passes gave the OUTERMOST
// point of each 1 cm cell of the front (x, y in the reference) is blurred over K.blur cm (a Gaussian, empty cells filled
// from their neighbours) and every garment point of the front set to its reference depth plus that field: the layers keep
// the reference's order and spacing, the push-back is smooth (no fold), its size where the cloth is is kept.
export function layerFieldPass(doc, ref, K = {}) {
  K = { mats: null, yLo: 0.8, yHi: 1.62, z0: 0.0, blur: 3, fade: 0.05, xMax: 0.3, depth: 0.035, ...K };
  const cell = 0.01, ps = garments(doc, K.mats).filter((p) => ref.get(p.getMaterial().getName())?.length === p.getAttribute('POSITION').getArray().length);
  const top = new Map(), kk = (i, j) => i + ',' + j;
  for (const p of ps) { const A = p.getAttribute('POSITION').getArray(), R0 = ref.get(p.getMaterial().getName()); for (const v of new Set(p.getIndices().getArray())) { const x = R0[v * 3], y = R0[v * 3 + 1], z = R0[v * 3 + 2]; if (z < K.z0 || y < K.yLo - 0.05 || y > K.yHi + 0.05 || Math.abs(x) > K.xMax) continue;
    const k = kk(Math.round(x / cell), Math.round(y / cell)), o = top.get(k); if (!o || z > o[0]) top.set(k, [z, A[v * 3 + 2] - z]); } }
  const r = Math.ceil(K.blur * 2), g = (d) => Math.exp(-(d * d) / (2 * K.blur * K.blur)), field = new Map();
  const get = (i, j) => { const k = kk(i, j); if (field.has(k)) return field.get(k); let s = 0, w = 0; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const o = top.get(kk(i + a, j + b)); if (!o) continue; const ww = g(Math.hypot(a, b)); s += ww * o[1]; w += ww; } const f = w > 1e-3 ? s / w : 0; field.set(k, f); return f; };
  let n = 0, mx = 0;
  for (const p of ps) { const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), R0 = ref.get(p.getMaterial().getName());
    for (let v = 0; v < A.length / 3; v++) { const x = R0[v * 3], y = R0[v * 3 + 1], z = R0[v * 3 + 2]; if (z < K.z0 || Math.abs(x) > K.xMax) continue; const o = top.get(kk(Math.round(x / cell), Math.round(y / cell))); if (!o) continue;
      // (the front's layers only: within K.depth of the cell's outermost point, faded over 1 cm past it)
      const w = Math.max(0, Math.min(1, (y - K.yLo) / K.fade, (K.yHi - y) / K.fade, (z - K.z0) / 0.02, (z - (o[0] - K.depth - 0.01)) / 0.01)); if (!w) continue;
      // bilinear in the field
      const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, f = get(i, j) * (1 - tx) * (1 - ty) + get(i + 1, j) * tx * (1 - ty) + get(i, j + 1) * (1 - tx) * ty + get(i + 1, j + 1) * tx * ty;
      const nz = z + f, z1 = A[v * 3 + 2] * (1 - w) + nz * w; mx = Math.max(mx, Math.abs(z1 - A[v * 3 + 2])); A[v * 3 + 2] = z1; n++; }
    acc.setArray(A); }
  console.log(`layer field: ${n} front points of ${ps.map((p) => p.getMaterial().getName()).join(', ')} on one push-back field (blur ${K.blur} cm), moved up to ${(mx * 1000).toFixed(1)} mm`);
}

// the garment's skin weights eased between the chest and the arm (the band |x| K.x, y K.y, faded over K.fade): the chest's
// front taken off the arms (chestWeightPass) next to the sleeve's full arm weight is a step, and a step tears the cloth
// open at the armpit and folds it at the shoulder when the arm comes forward (the seated call). K.iters Laplacian passes
// of the weights over the welded mesh (each point toward its neighbours' mean by K.lam), the top 4 joints kept.
export function weightEasePass(doc, K = {}) {
  K = { mats: /^(clothes|suit|suit-hem)$/, x: [0.1, 0.26], y: [1.0, 1.55], fade: 0.03, iters: 8, lam: 0.5, skin: 0, ...K };
  for (const p of garments(doc, K.mats)) { const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA || !WA) continue; const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), n = A.length / 3, J4 = JA.getArray().slice(), W0 = WA.getArray(), k0 = W0 instanceof Uint8Array ? 255 : W0 instanceof Uint16Array ? 65535 : 1;
    const id = new Int32Array(n), wk = new Map(); for (let v = 0; v < n; v++) { const k = Math.round(A[v * 3] * 2e4) + ',' + Math.round(A[v * 3 + 1] * 2e4) + ',' + Math.round(A[v * 3 + 2] * 2e4); if (!wk.has(k)) wk.set(k, v); id[v] = wk.get(k); }
    const members = new Map(); for (let v = 0; v < n; v++) (members.get(id[v]) || members.set(id[v], []).get(id[v])).push(v);
    const nb = new Map(), add = (a, b) => { a = id[a]; b = id[b]; if (a !== b) (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); }; for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { add(a, b); add(b, a); } }
    // weights as maps per welded point
    let M = new Map(); for (const v of members.keys()) { const m = new Map(); for (let k = 0; k < 4; k++) { const w = W0[v * 4 + k] / k0; if (w) m.set(J4[v * 4 + k], (m.get(J4[v * 4 + k]) || 0) + w); } M.set(v, m); }
    const wt = (v) => { const x = Math.abs(A[v * 3]), y = A[v * 3 + 1]; return Math.max(0, Math.min(1, (x - K.x[0]) / K.fade, (K.x[1] - x) / K.fade, (y - K.y[0]) / K.fade, (K.y[1] - y) / K.fade)); };
    const band = [...members.keys()].filter((v) => wt(v) > 0); let changed = 0;
    // (K.skin: first the nearest skin point's own weights blended in by K.skin (the skin never tears: the cloth follows it))
    if (K.skin) { const B = body(doc), SA = B.pos, SJ = B.sk.getAttribute('JOINTS_0').getArray(), SWa = B.sk.getAttribute('WEIGHTS_0').getArray(), sk0 = SWa instanceof Uint8Array ? 255 : SWa instanceof Uint16Array ? 65535 : 1, cell = 0.02, G = new Map();
      for (const v of new Set(B.idx)) { const k = Math.floor(SA[v * 3] / cell) + ',' + Math.floor(SA[v * 3 + 1] / cell) + ',' + Math.floor(SA[v * 3 + 2] / cell); (G.get(k) || G.set(k, []).get(k)).push(v); }
      for (const v of band) { const x = A[v * 3], y = A[v * 3 + 1], z = A[v * 3 + 2]; let best = 9, q = -1; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) for (const u of G.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)) || []) { const d = Math.hypot(SA[u * 3] - x, SA[u * 3 + 1] - y, SA[u * 3 + 2] - z); if (d < best) { best = d; q = u; } }
        if (q < 0) continue; const f = K.skin * wt(v), m = new Map(); for (const [j, w] of M.get(v)) m.set(j, w * (1 - f)); for (let k = 0; k < 4; k++) { const w = SWa[q * 4 + k] / sk0; if (w) m.set(SJ[q * 4 + k], (m.get(SJ[q * 4 + k]) || 0) + w * f); } M.set(v, m); } }
    for (let it = 0; it < K.iters; it++) { const NM = new Map(); for (const v of band) { const N = nb.get(v); if (!N?.size) continue; const f = wt(v) * K.lam, m = new Map(); for (const [j, w] of M.get(v)) m.set(j, w * (1 - f)); for (const u of N) for (const [j, w] of M.get(u)) m.set(j, (m.get(j) || 0) + w * f / N.size); NM.set(v, m); } for (const [v, m] of NM) M.set(v, m); }
    const W4 = new W0.constructor(W0.length); W4.set(W0);
    for (const v of band) { const top = [...M.get(v)].sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((q, x) => q + x[1], 0) || 1; const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0]; top.forEach(([j, w], k) => { jj[k] = j; ww[k] = w / s * k0; });
      if (k0 > 1) { for (let k = 0; k < 4; k++) ww[k] = Math.round(ww[k]); ww[0] += k0 - ww.reduce((q, x) => q + x, 0); }
      for (const m of members.get(v)) for (let k = 0; k < 4; k++) { J4[m * 4 + k] = jj[k]; W4[m * 4 + k] = ww[k]; } changed++; }
    JA.setArray(J4); WA.setArray(W4); console.log(`weight ease: ${p.getMaterial().getName()} ${changed} points' weights eased (${K.iters} passes)`); }
}

// the Directors' suits round 1 recipe (castpass8.mjs CLI's default): the folds smoothed out of the front's push-back (its
// depth only), the rule passes run again on the smooth front, the folds the rule passes left smoothed, the V's straight
// edge inside the shirt's white, the cloth over the muscle, the shoulder crest down to the skin, the shirt's buttons and
// inner lapel behind the jacket, then the layer and the skin drawn in under it
export const DIRECTORS = [['smooth', { axes: [2] }], ['flat5', { iters: 8 }], ['vert', {}], ['smooth', { iters: 10, axes: [2] }], ['vedge', { scale: 0.72 }], ['fabric', {}],
  ['shoulder', { ease: 0.007, drop: 0.14, x0: 0.09 }], ['under', {}], ['layer', {}], ['mask', {}]];

// node castpass8.mjs <ref.glb> <in.glb> <out.glb> [steps json]: the reference is the same body built without the front
// passes (the Directors: JC_NOGATE=1 JC_SKIP=flat,flat3,rules,vcut,tailor,armslim,seat,mask,layer forge.mjs <id>); a step's
// K takes a string for a material regexp ("mats": "^clothes$")
if (import.meta.url === 'file://' + process.argv[1]) {
  const { read, write } = await import('../young-hero/glb.mjs');
  const { flatFront5Pass } = await import('./castpass5.mjs'), { vertFrontPass } = await import('./castpass6.mjs'), { bodyMaskPass } = await import('./castpass2.mjs'), { layerMaskPass } = await import('./castpass3.mjs');
  const [refF, inF, outF, sj] = process.argv.slice(2), { doc: rdoc } = await read(refF), { doc, src } = await read(inF), ref = refOf(rdoc);
  const steps = (sj ? JSON.parse(sj) : DIRECTORS).map(([k, K]) => [k, Object.fromEntries(Object.entries(K).map(([a, b]) => [a, typeof b === 'string' ? new RegExp(b) : b]))]);
  const run = { smooth: (K) => smoothFoldsPass(doc, ref, K), flat5: (K) => flatFront5Pass(doc, K), vert: (K) => vertFrontPass(doc, K), vedge: (K) => vEdgePass(doc, K), fabric: (K) => fabricPass(doc, K),
    shoulder: (K) => shoulderPass(doc, K), under: (K) => underPass(doc, K), layer: (K) => layerMaskPass(doc, K), mask: (K) => bodyMaskPass(doc, K), wease: (K) => weightEasePass(doc, K), field: (K) => layerFieldPass(doc, ref, K) };
  for (const [k, K] of steps) run[k](K);
  const glb = await write(doc, src); fs.writeFileSync(outF, glb); console.log(outF, glb.length, 'bytes');
}
