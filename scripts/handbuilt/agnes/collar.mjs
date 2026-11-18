// Hand-built Agnes, round 2: the blouse collar and the cardigan's shoulders.
//  collarPass  the forge's stand collar (its far ends came through the knit as white shards, its inside showed from
//              behind) taken off and a Peter Pan blouse collar made in its place: a band round the neck, its inner edge
//              standing 8 mm up the neck over the cardigan's jagged neckline (which it hides), laid down over the shoulders,
//              the back and the chest by marching along the cardigan's surface (3 mm off it), 5 cm wide, with two rounded
//              lobes meeting at the front; a turned edge so it never reads paper-thin; skinned as the cardigan under it;
//              a soft cream cotton, matte
//  skinInPass  skin that stood at or in front of the cardigan's surface (the pale wedges at the shoulder tops in the study
//              light) pushed 5 mm behind it, where the cardigan covers it (not at the neckline, the cuffs or the hem)
import { prim, sm } from '../young-hero/glb.mjs';

export const big = (doc, name) => prim(doc, name).sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
export function attrs(p) {
  const P = p.getAttribute('POSITION').getArray(), Na = p.getAttribute('NORMAL'), N = Na.getArray(), ns = Na.getNormalized() ? (N instanceof Int8Array ? 127 : 32767) : 1;
  const Ja = p.getAttribute('JOINTS_0').getArray(), Wa = p.getAttribute('WEIGHTS_0'), W = Wa.getArray(), ws = Wa.getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1;
  return { P, N: (v, c) => N[v * 3 + c] / ns, J: Ja, W: (v, k) => W[v * 4 + k] / ws, verts: [...new Set(p.getIndices().getArray())] };
}
export function grid(A, cell = 0.015) {
  const G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const v of A.verts) { const k = key(A.P[v * 3], A.P[v * 3 + 1], A.P[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); }
  return (x, y, z, n = 6) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell), best = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) { const L = G.get(`${cx + i},${cy + j},${cz + k}`); if (!L) continue; for (const v of L) best.push([Math.hypot(A.P[v * 3] - x, A.P[v * 3 + 1] - y, A.P[v * 3 + 2] - z), v]); }
    best.sort((a, b) => a[0] - b[0]); return best.slice(0, n); };
}
// the surface near p: inverse-distance mean of the n nearest points and their normals
export function surf(A, near, p) {
  const L = near(p[0], p[1], p[2]); if (!L.length) return null; let w = 0; const a = [0, 0, 0], n = [0, 0, 0];
  for (const [d, v] of L) { const q = 1 / (d + 0.003) ** 2; w += q; for (let c = 0; c < 3; c++) { a[c] += A.P[v * 3 + c] * q; n[c] += A.N(v, c) * q; } }
  const nl = Math.hypot(...n) || 1; return { p: a.map((x) => x / w), n: n.map((x) => x / nl), v: L[0][1] };
}
export function collarPass(doc, K = {}) {
  K = { W: 0.05, off: 0.003, stand: 0.008, NT: 120, NS: 10, lobe: 0.5, cut: 0.014, col: [0.86, 0.83, 0.77], ...K };
  for (const p of prim(doc, 'uniform-collar')) p.dispose();
  const shell = big(doc, 'uniform'), S = attrs(shell), near = grid(S);
  const skinP = big(doc, 'skin'), SK = attrs(skinP);
  // the neck: the skin's ring at the neckline's height, its centre and its radius by angle
  // (the skin under the old collar was taken out by the forge: the ring is read just above it, at YR, and widened by K.grow)
  const Y0 = K.y ?? 1.392, YR = K.yRing ?? 1.44; let cx = 0, cz = 0, n = 0; const ring = [];
  // (only the neck's own points: mostly on the neck bone, not the head's (the jaw's underside is at this height too));
  // the centre is the neck joint's
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()), nk = new Set(names.map((x, i) => (/^neck/.test(x) ? i : -1))), hd = names.indexOf('head');
  for (const v of SK.verts) { const y = SK.P[v * 3 + 1]; if (Math.abs(y - YR) > 0.006) continue; let wn = 0, wh = 0; for (let k = 0; k < 4; k++) { if (nk.has(SK.J[v * 4 + k])) wn += SK.W(v, k); if (SK.J[v * 4 + k] === hd) wh += SK.W(v, k); } if (wn < 0.5 || wh > 0.3) continue; ring.push(v); cx += SK.P[v * 3]; cz += SK.P[v * 3 + 2]; n++; }
  cx /= n; cz /= n; const R = new Float32Array(K.NT).fill(0);
  for (const v of ring) { const dx = SK.P[v * 3] - cx, dz = SK.P[v * 3 + 2] - cz, b = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * K.NT) % K.NT; R[b] = Math.max(R[b], Math.hypot(dx, dz) + (K.grow ?? 0.004)); }
  for (let it = 0; it < 4; it++) for (let b = 0; b < K.NT; b++) if (!R[b]) R[b] = Math.max(R[(b + 1) % K.NT], R[(b + K.NT - 1) % K.NT]);
  const Rs = R.map((_, b) => (R[(b + K.NT - 1) % K.NT] + 2 * R[b] + R[(b + 1) % K.NT]) / 4);
  console.log('collar: neck centre', cx.toFixed(4), cz.toFixed(4), 'radius', Math.min(...Rs).toFixed(3), '-', Math.max(...Rs).toFixed(3), 'ring', n);
  // the grid: NT angles round the neck (theta 0 = the front), NS+1 steps out, then the turned edge
  const P = [], WT = [], JT = [], rows = K.NS + 2;
  const width = (th) => { const a = Math.abs(th); return K.W * (a < K.lobe ? Math.sqrt(Math.max(0.02, 1 - (1 - a / K.lobe) ** 2)) : 1); };
  for (let i = 0; i < K.NT; i++) {
    const th = -Math.PI + ((i + 0.5) / K.NT) * 2 * Math.PI, d = [Math.sin(th), 0, Math.cos(th)], b = Math.floor(((th + Math.PI) / (2 * Math.PI)) * K.NT) % K.NT;
    const yIn = Y0 - 0.006 * (1 + Math.cos(th)) / 2 + 0.004; // (lower at the front, as a neckline is)
    let p = [cx + d[0] * (Rs[b] + 0.003), yIn + K.stand, cz + d[2] * (Rs[b] + 0.003)]; const col = [p];
    // first step: down the stand onto the cardigan
    let s0 = surf(S, near, [cx + d[0] * (Rs[b] + 0.012), yIn - 0.004, cz + d[2] * (Rs[b] + 0.012)]); let q = s0.p.map((x, c) => x + s0.n[c] * K.off); col.push(q);
    const step = width(th) / K.NS;
    for (let j = 1; j < K.NS; j++) {
      const sN = surf(S, near, q); const dir = [d[0], -1, d[2]], dn = dir[0] * sN.n[0] + dir[1] * sN.n[1] + dir[2] * sN.n[2], t = dir.map((x, c) => x - sN.n[c] * dn), tl = Math.hypot(...t) || 1;
      const g = q.map((x, c) => x + (t[c] / tl) * step), s2 = surf(S, near, g); q = s2.p.map((x, c) => x + s2.n[c] * K.off); col.push(q); }
    // the turned edge: the last point 2.5 mm down toward the cardigan
    { const sE = surf(S, near, q); col.push(q.map((x, c) => x - sE.n[c] * 0.0025)); }
    for (const pt of col) { P.push(...pt); const s = surf(S, near, pt); const v = s.v; for (let k = 0; k < 4; k++) { JT.push(S.J[v * 4 + k]); WT.push(S.W(v, k)); } }
  }
  // smooth the points round the neck (2 passes) so the marching's steps never show
  for (let it = 0; it < 2; it++) { const Q = P.slice(); for (let i = 0; i < K.NT; i++) for (let j = 1; j < rows; j++) { const a = (i * rows + j) * 3, l = (((i + K.NT - 1) % K.NT) * rows + j) * 3, r = (((i + 1) % K.NT) * rows + j) * 3; for (let c = 0; c < 3; c++) P[a + c] = (Q[l + c] + 2 * Q[a + c] + Q[r + c]) / 4; } }
  const I = []; for (let i = 0; i < K.NT; i++) { const i2 = (i + 1) % K.NT; if (Math.abs(-Math.PI + ((i + 1) / K.NT) * 2 * Math.PI) < 0.03) continue; // (the gap at the front)
    for (let j = 0; j < rows - 1; j++) { const a = i * rows + j, b = i2 * rows + j, c = i2 * rows + j + 1, e = i * rows + j + 1; I.push(a, e, c, a, c, b); } }
  // the cardigan's jagged neckline under the collar taken out (its teeth came up through the collar): every shell
  // triangle whose three points lie within 1.4 cm of the collar's inner rows
  { const cell = 0.014, G = new Set(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const pts = []; for (let i = 0; i < K.NT; i++) for (let j = 0; j < rows - 3; j++) { const a = (i * rows + j) * 3; pts.push([P[a], P[a + 1], P[a + 2]]); }
    const GM = new Map(); for (const q of pts) { const k = key(...q); (GM.get(k) || GM.set(k, []).get(k)).push(q); }
    const under = (v) => { const x = S.P[v * 3], y = S.P[v * 3 + 1], z = S.P[v * 3 + 2], cx2 = Math.floor(x / cell), cy2 = Math.floor(y / cell), cz2 = Math.floor(z / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = GM.get(`${cx2 + a},${cy2 + b},${cz2 + c}`); if (L) for (const q of L) if (Math.hypot(q[0] - x, q[1] - y, q[2] - z) < K.cut) return true; } return false; };
    const SI = shell.getIndices().getArray(), keep = []; let cut = 0; const u = new Map(), U = (v) => (u.has(v) ? u.get(v) : (u.set(v, under(v)), u.get(v)));
    for (let t = 0; t < SI.length; t += 3) { if (U(SI[t]) && U(SI[t + 1]) && U(SI[t + 2])) { cut++; continue; } keep.push(SI[t], SI[t + 1], SI[t + 2]); }
    shell.getIndices().setArray(new (SI.constructor)(keep)); console.log('collar: cardigan neckline triangles under it taken out', cut); }
  const nv = P.length / 3, N = new Float32Array(nv * 3);
  for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]], u = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]), nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[v * 3 + k] += nn[k]; }
  // (facing out: the normals point away from the neck's axis and up)
  let flip = 0; for (let v = 0; v < nv; v++) { const o = [P[v * 3] - cx, 0.3, P[v * 3 + 2] - cz]; flip += Math.sign(o[0] * N[v * 3] + o[1] * N[v * 3 + 1] + o[2] * N[v * 3 + 2]); }
  if (flip < 0) { for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; } for (let i = 0; i < N.length; i++) N[i] = -N[i]; }
  for (let v = 0; v < nv; v++) { const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[v * 3 + k] /= l; }
  const Wn = new Float32Array(WT); for (let v = 0; v < nv; v++) { let s = 0; for (let k = 0; k < 4; k++) s += Wn[v * 4 + k]; for (let k = 0; k < 4; k++) Wn[v * 4 + k] /= s || 1; }
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('blouse-collar').setBaseColorFactor([...K.col, 1]).setRoughnessFactor(0.82).setMetallicFactor(0).setDoubleSided(true);
  const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(shell));
  mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(I))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', N))
    .setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(JT))).setAttribute('WEIGHTS_0', acc('VEC4', Wn)));
  console.log('collar: points', nv, 'triangles', I.length / 3);
}
export function skinInPass(doc, K = {}) {
  K = { yTop: 1.36, yBot: 0.9, maxD: 0.025, back: 0.005, ...K };
  const shell = big(doc, 'uniform'), S = attrs(shell), near = grid(S), skinP = big(doc, 'skin'), Pa = skinP.getAttribute('POSITION'), P = Pa.getArray().slice(), SK = attrs(skinP);
  const wrist = new Set(); const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()); names.forEach((nm, i) => { if (/wrist|finger|neck|head/.test(nm)) wrist.add(i); });
  let n = 0;
  for (const v of SK.verts) { const y = P[v * 3 + 1]; if (y > K.yTop || y < K.yBot) continue; let wh = 0; for (let k = 0; k < 4; k++) if (wrist.has(SK.J[v * 4 + k])) wh += SK.W(v, k); if (wh > 0.1) continue;
    const s = surf(S, near, [P[v * 3], y, P[v * 3 + 2]]); if (!s) continue; const d = [0, 1, 2].map((c) => P[v * 3 + c] - s.p[c]), dist = Math.hypot(...d); if (dist > K.maxD) continue;
    const along = d[0] * s.n[0] + d[1] * s.n[1] + d[2] * s.n[2]; if (along < -K.back) continue;
    for (let c = 0; c < 3; c++) P[v * 3 + c] -= s.n[c] * (along + K.back); n++; }
  Pa.setArray(P); console.log('skin pushed under the cardigan', n);
}

// (round 3: the made collar's marched edge came out jagged, and the cardigan's own neckline teeth showed through it. The
// neckline itself is now made clean and the blouse collar is painted on the cardigan with a rolled cream edge)
//  neckPass    the cardigan's neckline border (its edges used once, above the chest) smoothed along itself (40 Taubin
//              passes, the next ring of points eased after it), so the jagged teeth become one smooth curve; the smoothed
//              border points are kept (NECK) for the paint and the roll
//  rollPass    a 3.5 mm cream roll (a tube) along the smoothed neckline, 1.5 mm over it, skinned as the cardigan's border:
//              the blouse's rolled collar edge; it closes the neck's gap
export const NECK = { pts: [] };
export function neckPass(doc, K = {}) {
  K = { yMin: 1.33, it: 40, lam: 0.55, mu: -0.58, ...K };
  for (const p of prim(doc, 'uniform-collar')) p.dispose(); // (the forge's stand collar: its ends came through the knit as shards)
  const shell = big(doc, 'uniform'), Pa = shell.getAttribute('POSITION'), a = Pa.getArray().slice(), I = shell.getIndices().getArray(), cnt = Pa.getCount();
  const key = (v) => `${a[v * 3].toFixed(5)},${a[v * 3 + 1].toFixed(5)},${a[v * 3 + 2].toFixed(5)}`, rep = new Int32Array(cnt), km = new Map();
  for (let v = 0; v < cnt; v++) { const k = key(v); if (!km.has(k)) km.set(k, v); rep[v] = km.get(k); }
  const ec = new Map(), nb = new Map(); const add = (u, v) => { if (!nb.has(u)) nb.set(u, new Set()); nb.get(u).add(v); };
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]]; if (u === v) continue; add(u, v); add(v, u); const k = u < v ? u + ',' + v : v + ',' + u; ec.set(k, (ec.get(k) || 0) + 1); }
  const bn = new Map(); for (const [k, c] of ec) { if (c !== 1) continue; const [u, v] = k.split(',').map(Number); if (a[u * 3 + 1] < K.yMin || a[v * 3 + 1] < K.yMin) continue; if (!bn.has(u)) bn.set(u, []); if (!bn.has(v)) bn.set(v, []); bn.get(u).push(v); bn.get(v).push(u); }
  const B = [...bn.keys()];
  for (let it = 0; it < K.it; it++) { const f = it % 2 ? K.mu : K.lam, upd = B.map((v) => { const L = bn.get(v), s = [0, 0, 0]; for (const u of L) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; return s.map((x, c) => (x / L.length - a[v * 3 + c]) * f); });
    B.forEach((v, i) => { for (let c = 0; c < 3; c++) a[v * 3 + c] += upd[i][c]; }); }
  // the next ring in, eased toward its neighbours' mean (the teeth's long sides)
  const bset = new Set(B), ring = new Set(); for (const v of B) for (const u of nb.get(v) || []) if (!bset.has(u)) ring.add(u);
  for (let it = 0; it < 6; it++) { const upd = [...ring].map((v) => { const L = [...nb.get(v)], s = [0, 0, 0]; for (const u of L) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; return [v, s.map((x, c) => (x / L.length - a[v * 3 + c]) * 0.5)]; }); for (const [v, d] of upd) for (let c = 0; c < 3; c++) a[v * 3 + c] += d[c]; }
  for (let v = 0; v < cnt; v++) if (rep[v] !== v) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[rep[v] * 3 + c];
  Pa.setArray(a); NECK.pts = B.map((v) => [a[v * 3], a[v * 3 + 1], a[v * 3 + 2], v]); NECK.adj = bn;
  console.log('neckline border points smoothed', B.length, 'next ring', ring.size);
}
export function rollPass(doc, K = {}) {
  K = { r: 0.0035, lift: 0.0015, seg: 10, col: [0.88, 0.85, 0.79], ...K };
  const shell = big(doc, 'uniform'), S = attrs(shell), bn = NECK.adj; if (!bn || !NECK.pts.length) return;
  // walk the border loop(s) in order
  const seen = new Set(), loops = [];
  for (const [v0] of NECK.pts.map((p) => [p[3]])) { if (seen.has(v0)) continue; const L = [v0]; seen.add(v0); let prev = -1, cur = v0;
    for (;;) { const nx = (bn.get(cur) || []).find((u) => u !== prev && !seen.has(u)); if (nx === undefined) break; L.push(nx); seen.add(nx); prev = cur; cur = nx; } if (L.length > 8) loops.push(L); }
  const P = [], N = [], I = [], JT = [], WT = [];
  for (const L0 of loops) {
    // resample: smooth the loop's points again (3 passes) for the tube's spine
    let L = L0.map((v) => [S.P[v * 3], S.P[v * 3 + 1], S.P[v * 3 + 2], v]); const closed = (bn.get(L0[0]) || []).includes(L0[L0.length - 1]) && L0.length > 3;
    for (let it = 0; it < 3; it++) L = L.map((p, i) => { const a = L[closed ? (i - 1 + L.length) % L.length : Math.max(0, i - 1)], b = L[closed ? (i + 1) % L.length : Math.min(L.length - 1, i + 1)]; return [0, 1, 2].map((c) => (a[c] + 2 * p[c] + b[c]) / 4).concat(p[3]); });
    const base = P.length / 3, n = L.length;
    for (let i = 0; i < n; i++) { const p = L[i], q = L[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], o = L[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], v = p[3];
      const T = [0, 1, 2].map((c) => q[c] - o[c]), tl = Math.hypot(...T) || 1; const t = T.map((x) => x / tl), nn = [0, 1, 2].map((c) => S.N(v, c)), b = [t[1] * nn[2] - t[2] * nn[1], t[2] * nn[0] - t[0] * nn[2], t[0] * nn[1] - t[1] * nn[0]];
      const c0 = [0, 1, 2].map((c) => p[c] + nn[c] * (K.r * 0.6 + K.lift));
      for (let j = 0; j < K.seg; j++) { const ang = (j / K.seg) * 2 * Math.PI, d = [0, 1, 2].map((c) => Math.cos(ang) * nn[c] + Math.sin(ang) * b[c]); P.push(...c0.map((x, c) => x + d[c] * K.r)); N.push(...d); for (let k = 0; k < 4; k++) { JT.push(S.J[v * 4 + k]); WT.push(S.W(v, k)); } } }
    for (let i = 0; i < (closed ? n : n - 1); i++) { const i2 = (i + 1) % n; for (let j = 0; j < K.seg; j++) { const j2 = (j + 1) % K.seg, A = base + i * K.seg + j, Bq = base + i2 * K.seg + j, C = base + i2 * K.seg + j2, D = base + i * K.seg + j2; I.push(A, Bq, C, A, C, D); } }
  }
  if (!I.length) return;
  // (winding to the normals: checked on the first triangle)
  { const [a0, b0, c0] = [I[0], I[1], I[2]], u = [0, 1, 2].map((k) => P[b0 * 3 + k] - P[a0 * 3 + k]), w = [0, 1, 2].map((k) => P[c0 * 3 + k] - P[a0 * 3 + k]), fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (fn[0] * N[a0 * 3] + fn[1] * N[a0 * 3 + 1] + fn[2] * N[a0 * 3 + 2] < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; } }
  const nv = P.length / 3, Wn = new Float32Array(WT); for (let v = 0; v < nv; v++) { let s = 0; for (let k = 0; k < 4; k++) s += Wn[v * 4 + k]; for (let k = 0; k < 4; k++) Wn[v * 4 + k] /= s || 1; }
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('blouse-roll').setBaseColorFactor([...K.col, 1]).setRoughnessFactor(0.8).setMetallicFactor(0);
  doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(shell)).addPrimitive(doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(I))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(JT))).setAttribute('WEIGHTS_0', acc('VEC4', Wn)));
  console.log('roll: loops', loops.map((l) => l.length).join('+'), 'points', nv);
}
