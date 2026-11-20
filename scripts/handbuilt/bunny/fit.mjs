// Hand-built cast, the uniform jacket's fit fixes (Bunny's track jacket; Agnes's cardigan is the same forge garment):
//  flapPass   the forge uniform's breast-pocket flaps are folds in the shell itself: in daylight their folded edges read
//             as torn dark notches and pale slivers on the chest. The shell is ironed flat there: its points (welded at
//             the uv seams) smoothed toward their neighbours (Taubin, so it does not shrink) in a soft window over the
//             chest, then kept at least `clear` off the body's skin
//  edgePass   a garment's open edges (the stand collar's top and bottom, the shell's neckline) smoothed along themselves
//             (Taubin along each border loop, the next ring eased after it): the zigzag "teeth" that read as specks and
//             shards round the collar become one clean line
import { prim } from '../young-hero/glb.mjs';
import { attrs, grid, surf, big } from '../agnes/collar.mjs';

function weld(a, cnt, tol = 1e-5) {
  const key = (v) => `${Math.round(a[v * 3] / tol)},${Math.round(a[v * 3 + 1] / tol)},${Math.round(a[v * 3 + 2] / tol)}`, rep = new Int32Array(cnt), km = new Map();
  for (let v = 0; v < cnt; v++) { const k = key(v); if (!km.has(k)) km.set(k, v); rep[v] = km.get(k); } return rep;
}
export function flapPass(doc, K = {}) {
  K = { mat: 'uniform', y0: 1.1, y1: 1.36, x1: 0.15, it: 40, lam: 0.6, mu: -0.63, clear: 0.004, ...K };
  const shell = big(doc, K.mat); if (!shell) return; const Pa = shell.getAttribute('POSITION'), a = Pa.getArray().slice(), cnt = Pa.getCount(), I = shell.getIndices().getArray(), rep = weld(a, cnt, 5e-4);
  const nb = new Map(); const add = (u, v) => { if (!nb.has(u)) nb.set(u, new Set()); nb.get(u).add(v); };
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]]; if (u !== v) { add(u, v); add(v, u); } }
  const sm = (a0, b0, x) => { const t = Math.max(0, Math.min(1, (x - a0) / (b0 - a0))); return t * t * (3 - 2 * t); };
  // (K.weight(x, y, z, sm): another window, e.g. Milo's hoodie shoulders; the default is the chest's front)
  const wf = K.weight || ((x, y, z) => z < 0 ? 0 : sm(K.y0, K.y0 + 0.04, y) * sm(K.y1, K.y1 - 0.04, y) * sm(K.x1, K.x1 - 0.03, x));
  const W = new Map(); for (const v of nb.keys()) { const w = wf(Math.abs(a[v * 3]), a[v * 3 + 1], a[v * 3 + 2], sm); if (w > 0.01) W.set(v, w); }
  const V = [...W.keys()];
  for (let it = 0; it < K.it; it++) { const f = it % 2 ? K.mu : K.lam, upd = V.map((v) => { const L = nb.get(v), s = [0, 0, 0]; for (const u of L) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; return s.map((x, c) => (x / L.size - a[v * 3 + c]) * f * W.get(v)); });
    V.forEach((v, i) => { for (let c = 0; c < 3; c++) a[v * 3 + c] += upd[i][c]; }); }
  // keep it off the body: a point that came within `clear` of the skin (or behind it) moved out along the skin's normal
  const skin = big(doc, 'skin'), S = attrs(skin), near = grid(S); let pushed = 0;
  for (const v of V) { const p = [a[v * 3], a[v * 3 + 1], a[v * 3 + 2]], s = surf(S, near, p); if (!s) continue; const d = (p[0] - s.p[0]) * s.n[0] + (p[1] - s.p[1]) * s.n[1] + (p[2] - s.p[2]) * s.n[2];
    if (d < K.clear) { for (let c = 0; c < 3; c++) a[v * 3 + c] += s.n[c] * (K.clear - d); pushed++; } }
  for (let v = 0; v < cnt; v++) if (rep[v] !== v && W.has(rep[v])) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[rep[v] * 3 + c];
  Pa.setArray(a);
  // the normals of the ironed region recomputed from the new surface (welded, area-weighted) and then eased with their
  // neighbours a few rounds: the old normals kept the folds' shading (dark notches at the bust) after the folds were gone
  const NA = shell.getAttribute('NORMAL'), na = NA.getArray().slice(), sc = NA.getNormalized() ? (na instanceof Int8Array ? 127 : 32767) : 1, gn = new Map();
  for (let t = 0; t < I.length; t += 3) { const [i0, i1, i2] = [I[t], I[t + 1], I[t + 2]].map((v) => rep[v]); if (!W.has(i0) && !W.has(i1) && !W.has(i2)) continue;
    const e1 = [0, 1, 2].map((k) => a[i1 * 3 + k] - a[i0 * 3 + k]), e2 = [0, 1, 2].map((k) => a[i2 * 3 + k] - a[i0 * 3 + k]), c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const g of [i0, i1, i2]) { const q = gn.get(g) || gn.set(g, [0, 0, 0]).get(g); for (let k = 0; k < 3; k++) q[k] += c[k]; } }
  for (const q of gn.values()) { const L = Math.hypot(...q) || 1; for (let k = 0; k < 3; k++) q[k] /= L; }
  for (let it = 0; it < (K.nIt ?? 4); it++) { const nx = new Map(); for (const [g, q] of gn) { if (!W.has(g)) { nx.set(g, q); continue; } const m = [0, 0, 0]; let c = 0; for (const u of nb.get(g) || []) { const r = gn.get(u); if (r) { for (let k = 0; k < 3; k++) m[k] += r[k]; c++; } }
      nx.set(g, c ? q.map((x, k) => x + 0.6 * W.get(g) * (m[k] / c - x)) : q); } for (const [g, q] of nx) gn.set(g, q); }
  let rn = 0; for (let v = 0; v < cnt; v++) { const g = rep[v]; if (!W.has(g)) continue; const q = gn.get(g); if (!q) continue; const L = Math.hypot(...q) || 1, nw = q.map((x) => x / L);
    const old = [na[v * 3] / sc, na[v * 3 + 1] / sc, na[v * 3 + 2] / sc], sg = old[0] * nw[0] + old[1] * nw[1] + old[2] * nw[2] < 0 ? -1 : 1; // (each copy keeps its side)
    for (let k = 0; k < 3; k++) na[v * 3 + k] = sc === 1 ? sg * nw[k] : Math.round(sg * nw[k] * sc); rn++; }
  NA.setArray(na); console.log('flaps ironed:', K.mat, V.length, 'points, pushed off the skin', pushed, 'normals', rn);
}
export function edgePass(doc, K = {}) {
  K = { mats: ['uniform-collar'], yMin: 1.3, it: 30, lam: 0.55, mu: -0.58, ring: 4, ...K };
  for (const name of K.mats) for (const p of prim(doc, name)) {
    const Pa = p.getAttribute('POSITION'), a = Pa.getArray().slice(), cnt = Pa.getCount(), I = p.getIndices().getArray(), rep = weld(a, cnt);
    const ec = new Map(), nb = new Map(); const add = (u, v) => { if (!nb.has(u)) nb.set(u, new Set()); nb.get(u).add(v); };
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]]; if (u === v) continue; add(u, v); add(v, u); const k = u < v ? u + ',' + v : v + ',' + u; ec.set(k, (ec.get(k) || 0) + 1); }
    const bn = new Map(); for (const [k, c] of ec) { if (c !== 1) continue; const [u, v] = k.split(',').map(Number); if (a[u * 3 + 1] < K.yMin || a[v * 3 + 1] < K.yMin) continue; (bn.get(u) || bn.set(u, []).get(u)).push(v); (bn.get(v) || bn.set(v, []).get(v)).push(u); }
    const B = [...bn.keys()].filter((v) => bn.get(v).length === 2); // (a corner where loops meet is held)
    for (let it = 0; it < K.it; it++) { const f = it % 2 ? K.mu : K.lam, upd = B.map((v) => { const L = bn.get(v), s = [0, 0, 0]; for (const u of L) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; return s.map((x, c) => (x / L.length - a[v * 3 + c]) * f); });
      B.forEach((v, i) => { for (let c = 0; c < 3; c++) a[v * 3 + c] += upd[i][c]; }); }
    const bset = new Set(bn.keys()), ring = new Set(); for (const v of B) for (const u of nb.get(v) || []) if (!bset.has(u)) ring.add(u);
    for (let it = 0; it < K.ring; it++) { const upd = [...ring].map((v) => { const L = [...nb.get(v)], s = [0, 0, 0]; for (const u of L) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; return [v, s.map((x, c) => (x / L.length - a[v * 3 + c]) * 0.5)]; }); for (const [v, d] of upd) for (let c = 0; c < 3; c++) a[v * 3 + c] += d[c]; }
    for (let v = 0; v < cnt; v++) if (rep[v] !== v) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[rep[v] * 3 + c];
    Pa.setArray(a); console.log('edges smoothed:', name, 'border points', B.length, 'ring', ring.size);
  }
}
//  bandPass   the stand collar rebuilt as one clean band (its jagged top and its ends' shards were the forge's own geometry,
//             not paint, so smoothing its border could not reach them): round the neck's axis in 72 bins, each bin's
//             bottom and top heights and radii read from the forge collar (a median, then smoothed round the ring, the
//             teeth gone), and a new band made from them: the outside, a rounded top edge 2.5 mm thick, the inside; its
//             front opening kept where the forge's was; each point skinned as the forge collar's nearest point; uvs
//             (round the ring, up the profile) so a collar paint that works from the bind pose (texPos) paints it as before
export function bandPass(doc, K = {}) {
  K = { mat: 'uniform-collar', B: 72, thick: 0.0025, sink: 0.008, flare: 0.002, minGap: 4, smooth: 4, over: null, overGap: 0.002, footUp: 0.004, neckR: 0.105, ...K };
  const p = big(doc, K.mat); if (!p) return; const A = attrs(p), P = A.P, V = A.verts;
  let cx = 0, cz = 0; for (const v of V) { cx += P[v * 3]; cz += P[v * 3 + 2]; } cx /= V.length; cz /= V.length;
  const bins = Array.from({ length: K.B }, () => []);
  for (const v of V) { const th = Math.atan2(P[v * 3] - cx, P[v * 3 + 2] - cz), b = ((Math.floor(((th + Math.PI) / (2 * Math.PI)) * K.B) % K.B) + K.B) % K.B; bins[b].push(v); }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  const prof = bins.map((L) => { if (L.length < 3) return null; const ys = L.map((v) => P[v * 3 + 1]), lo = Math.min(...ys), hi = Math.max(...ys), q = (hi - lo) * 0.25;
    const r = (v) => Math.hypot(P[v * 3] - cx, P[v * 3 + 2] - cz), bot = L.filter((v) => P[v * 3 + 1] < lo + q), top = L.filter((v) => P[v * 3 + 1] > hi - q);
    return { lo, hi: med(top.map((v) => P[v * 3 + 1])), rLo: Math.max(...bot.map(r)), rHi: Math.max(...top.map(r)) }; });
  // the opening: the longest run of empty bins (none: a closed ring)
  let gs = -1, gl = 0; for (let s = 0; s < K.B; s++) { if (prof[s] || !prof[(s - 1 + K.B) % K.B]) continue; let n = 0; while (n < K.B && !prof[(s + n) % K.B]) n++; if (n > gl) { gl = n; gs = s; } }
  if (gl < K.minGap) gl = 0; // (a gap of a bin or three is a hole in the forge's ring, not an opening)
  const order = gl ? Array.from({ length: K.B - gl }, (_, i) => (gs + gl + i) % K.B) : [...Array(K.B).keys()], closed = !gl;
  // (holes inside the run filled from their neighbours; then a median of 5 and a few box passes round the ring)
  let R = order.map((b) => prof[b]); for (let i = 0; i < R.length; i++) if (!R[i]) { const a = R.slice(0, i).reverse().find(Boolean), c = R.slice(i + 1).find(Boolean); R[i] = a && c ? Object.fromEntries(Object.keys(a).map((k) => [k, (a[k] + c[k]) / 2])) : a || c; }
  const keys = ['lo', 'hi', 'rLo', 'rHi'], n = R.length, at = (i) => R[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  R = R.map((_, i) => Object.fromEntries(keys.map((k) => [k, med([-2, -1, 0, 1, 2].map((d) => at(i + d)[k]))])));
  for (let it = 0; it < K.smooth; it++) R = R.map((_, i) => Object.fromEntries(keys.map((k) => [k, (at(i - 1)[k] + 2 * at(i)[k] + at(i + 1)[k]) / 4])));
  // (K.over: the jacket's own shell under the band. Its neckline's teeth stood up outside the band's foot (the "wings" at
  // the shoulders, the zigzag at the back). Each shell point near the neck above the band's foot is brought down to the
  // foot's height (the teeth fold flat under the band, no hole), and the band's foot flares out over the shell's
  // smoothed radius there, so it sits on the jacket like a rib collar sewn on)
  let rFoot = null;
  if (K.over) { const sh = big(doc, K.over), Pa = sh.getAttribute('POSITION'), a = Pa.getArray().slice(), cnt = Pa.getCount(), binOf = (x, z) => ((Math.floor(((Math.atan2(x - cx, z - cz) + Math.PI) / (2 * Math.PI)) * K.B) % K.B) + K.B) % K.B;
    const lo = new Array(K.B).fill(null); order.forEach((b, i) => { lo[b] = R[i].lo; }); for (let b = 0; b < K.B; b++) if (lo[b] === null) lo[b] = R[0].lo;
    const foot = (b) => lo[b] - K.sink + K.footUp; let nC = 0; const rf = new Array(K.B).fill(0);
    for (let v = 0; v < cnt; v++) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], r = Math.hypot(x - cx, z - cz); if (r > K.neckR) continue; const b = binOf(x, z), f = foot(b);
      if (y > f) { a[v * 3 + 1] = f; nC++; } if (Math.abs(a[v * 3 + 1] - f) < 0.006) rf[b] = Math.max(rf[b], r); }
    Pa.setArray(a);
    const at2 = (i) => rf[((i % K.B) + K.B) % K.B]; let rr = rf.map((_, i) => med([-2, -1, 0, 1, 2].map((d) => at2(i + d)))); for (let it = 0; it < 6; it++) rr = rr.map((_, i) => (rr[(i + K.B - 1) % K.B] + 2 * rr[i] + rr[(i + 1) % K.B]) / 4);
    rFoot = rr; console.log('band over', K.over, ': shell points folded under the foot', nC); }
  // the profile: outside bottom to top, the rounded top edge, the inside back down
  const PR = [[0, 0], [0.33, 0], [0.66, 0], [0.92, 0], [1, -0.0004], [1.015, -K.thick * 0.5], [1, -K.thick + 0.0004], [0.92, -K.thick], [0.5, -K.thick], [0, -K.thick]];
  const pos = [], nrm = [], uv = [], J = [], W = [], idx = [], near = grid(A, 0.01);
  const thOf = (b) => ((order[b] + 0.5) / K.B) * 2 * Math.PI - Math.PI;
  for (let i = 0; i < n; i++) { const th = thOf(i), s = Math.sin(th), c = Math.cos(th), r0 = R[i];
    for (let j = 0; j < PR.length; j++) { const [t, dr] = PR[j], y = r0.lo - K.sink + (r0.hi - r0.lo + K.sink) * Math.min(1, t) + (t > 1 ? 0.0012 : 0), r = r0.rLo + K.flare * (1 - Math.min(1, t)) ** 2 + (r0.rHi - r0.rLo) * Math.min(1, t) + dr;
      const fl = rFoot ? Math.max(0, rFoot[order[i]] + K.overGap - (r0.rLo + K.flare)) * (1 - Math.min(1, t)) ** 1.5 : 0, rr = r + fl;
      const x = cx + s * rr, z = cz + c * rr; pos.push(x, y, z);
      const out = j < 4 ? 1 : j > 6 ? -1 : 0; nrm.push(...(out ? [s * out, 0, c * out] : [s * 0.7 * (j === 4 ? 1 : -1), 0.7, c * 0.7 * (j === 4 ? 1 : -1)]));
      uv.push(0.01 + 0.98 * (i / Math.max(1, n - (closed ? 0 : 1))), 0.02 + 0.96 * (j / (PR.length - 1)));
      const nb = near(x, y, z, 1)[0]; const v = nb ? nb[1] : V[0]; for (let k = 0; k < 4; k++) { J.push(A.J[v * 4 + k]); W.push(A.W(v, k)); } } }
  const m = PR.length; for (let i = 0; i < (closed ? n : n - 1); i++) { const i2 = (i + 1) % n; for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = i2 * m + j, c2 = i2 * m + j + 1, d = i * m + j + 1; idx.push(a, d, c2, a, c2, b); } }
  // (winding to the normals, checked on the first triangle)
  { const g = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]], [a, b, c] = [idx[0], idx[1], idx[2]].map(g), u = b.map((x, k) => x - a[k]), w = c.map((x, k) => x - a[k]), fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (fn[0] * nrm[idx[0] * 3] + fn[1] * nrm[idx[0] * 3 + 1] + fn[2] * nrm[idx[0] * 3 + 2] < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } }
  const nv = pos.length / 3, Wn = new Float32Array(W); for (let v = 0; v < nv; v++) { let t = 0; for (let k = 0; k < 4; k++) t += Wn[v * 4 + k]; for (let k = 0; k < 4; k++) Wn[v * 4 + k] /= t || 1; }
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf), old = [p.getIndices(), ...p.listAttributes()];
  p.setIndices(acc('SCALAR', Uint32Array.from(idx))).setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm))).setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uv)))
    .setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(J))).setAttribute('WEIGHTS_0', acc('VEC4', Wn));
  for (const a of old) if (a && !a.listParents().some((x) => x.propertyType !== 'Root')) a.dispose();
  console.log('collar band:', closed ? 'closed' : `open ${gl} bins`, 'bins', n, 'points', nv, 'height mm', ((R[n >> 1].hi - R[n >> 1].lo) * 1000).toFixed(1));
}
//  slitPass   the pocket welts' slits: after the flaps are ironed, each pocket's opening is still a slit in the shell (a
//             boundary loop on the chest), and through it the jacket's dark inside showed as a small dark tick at each
//             side of the chest in daylight. Every boundary loop inside the chest window is closed (a fan over the loop's
//             own points, wound to the surface's normals)
export function slitPass(doc, K = {}) {
  K = { mat: 'uniform', y0: 1.08, y1: 1.36, x1: 0.16, ...K };
  const p = big(doc, K.mat); if (!p) return; const a = p.getAttribute('POSITION').getArray(), cnt = p.getAttribute('POSITION').getCount(), I = p.getIndices().getArray(), rep = weld(a, cnt, 5e-4);
  const NA = p.getAttribute('NORMAL'), na = NA.getArray(), sc = NA.getNormalized() ? (na instanceof Int8Array ? 127 : 32767) : 1;
  const ec = new Map(), dir = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]]; if (u === v) continue; const k = u < v ? u + ',' + v : v + ',' + u; ec.set(k, (ec.get(k) || 0) + 1); dir.set(k, [I[t + e], I[t + (e + 1) % 3]]); }
  const inWin = (v) => { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1], z = a[v * 3 + 2]; return y > K.y0 && y < K.y1 && x < K.x1 && z > 0.03; };
  const nb = new Map(); for (const [k, c] of ec) { if (c !== 1) continue; const [u, v] = k.split(',').map(Number); if (!inWin(u) || !inWin(v)) continue; (nb.get(u) || nb.set(u, []).get(u)).push(v); (nb.get(v) || nb.set(v, []).get(v)).push(u); }
  const seen = new Set(), add = []; let loops = 0;
  for (const s0 of nb.keys()) { if (seen.has(s0)) continue; const L = [s0]; seen.add(s0); let prev = -1, cur = s0;
    for (;;) { const nx = (nb.get(cur) || []).find((u) => u !== prev && !seen.has(u)); if (nx === undefined) break; L.push(nx); seen.add(nx); prev = cur; cur = nx; }
    if (L.length < 3 || !(nb.get(cur) || []).includes(s0)) continue; loops++;
    const nrm = [0, 0, 0]; for (const v of L) for (let k = 0; k < 3; k++) nrm[k] += na[v * 3 + k] / sc;
    for (let i = 1; i < L.length - 1; i++) { let tri = [L[0], L[i], L[i + 1]]; const e1 = [0, 1, 2].map((k) => a[tri[1] * 3 + k] - a[tri[0] * 3 + k]), e2 = [0, 1, 2].map((k) => a[tri[2] * 3 + k] - a[tri[0] * 3 + k]), c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (c[0] * nrm[0] + c[1] * nrm[1] + c[2] * nrm[2] < 0) tri = [tri[0], tri[2], tri[1]]; add.push(...tri); } }
  if (add.length) { const acc = p.getIndices(); acc.setArray(new (I.constructor)([...I, ...add])); }
  console.log('slits closed:', K.mat, 'loops', loops, 'triangles', add.length / 3);
}
