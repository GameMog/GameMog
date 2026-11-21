// Jensen Heist's supporting cast, polish 1 (21 Nov, A1: Mr. Board's suit). The front passes so far (flatFrontPass,
// flatFront3Pass, flatFront5Pass, vertFrontPass) move each point of each garment on its own: the jacket's front is pulled
// back while the shirt, the skin and the jacket's own sides beside it are eased by other amounts, so the layers cross and
// the cloth folds over itself (the dark see-through patches are its inside). fieldFrontPass flattens the front as ONE
// smooth deformation of the space round the trunk instead, applied to every layer at once (skin, shirt, jacket,
// trousers): a point's move depends only on where it is, never on which layer it belongs to, so layers keep their order
// and nothing tears:
//   E(x, y) how far the trunk's front stands ahead of the target per 1 cm column and row (the trunk's points only: the
//          arms', the head's and, over the belt, the legs' left out; a round belly's sides stand less far forward, so they
//          move less), the target a near-vertical line down from the sternum's anchor (rules.mjs's: rule 1c), a few mm
//          under it over the upper chest (K.dip: seated, the trunk's turn brings the chest forward), on flat under the
//          belt to the crotch (K.below); blurred over x and y (K.blurX, K.blur), eased out under the sternum (K.top)
//   dz = -E(x, y) * wz(z) * (1 - arm weight)   wz ramps linearly from behind the spine (K.back behind spine03: the back
//          never moves) to the column's front (which moves the whole E): the depth between is scaled, never turned
//          (dz'/dz = (target - back) / (front - back) > 0), so no layer passes through another; the arms and the
//          sleeves on them stay
// K.iters passes, each measured again, until the front is within K.target of the line. The beard, the face and the
// collar's ring sit over the sternum and are never moved.
//   fieldFrontPass(doc, K)
// Original procedural work, CC0.
import { trunkLevels, frontRule, jointPos } from './rules.mjs';
const OUT = /^(eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|cornea|beard|glasses.*|lens.*|frame.*)$/;
const SKIPM = /shoe|sneaker|boot|sole|lace|lining|eyelet|glasses|lens/;
const ARM = /^(shoulder|upperarm|lowerarm|wrist|finger|thumb|metacarpal)/, LEG = /^(upperleg|lowerleg|foot|toe)/, HEAD = /^(head|jaw|eye|tongue|special|levator|oris|risorius|temporalis|orbicularis|cheek|nose)/;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function fieldFrontPass(doc, K = {}) {
  K = { xIn: 0.1, xOut: 0.26, lean: -0.004, dip: 0.006, below: 0.15, back: 0.16, blur: 0.03, blurX: 0.03, top: 0.03, top0: 0.005, iters: 30, target: 0.004, aheadMax: 0.01, lap0: 0, keep: null, ...K }; if (typeof K.keep === 'string') K.keep = new RegExp(K.keep);
  const R = doc.getRoot(), names = R.listSkins()[0].listJoints().map((j) => j.getName()), isArm = names.map((n) => ARM.test(n)), isLeg = names.map((n) => LEG.test(n)), isHead = names.map((n) => HEAD.test(n));
  const { ys, yb } = trunkLevels(doc), zHip = jointPos(doc, 'upperleg01_L')[2], zB = jointPos(doc, 'spine03')[2] - K.back, C = 0.01, rTop = Math.round(ys / C), rBel = Math.round(yb / C), rLow = Math.round((yb - K.below) / C);
  // every skinned point of every layer the field moves (the shoes and the eyes' and hair's layers over the trunk only by y)
  const prims = R.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getAttribute('JOINTS_0') && p.getAttribute('WEIGHTS_0'));
  const seenPos = new Set(), layers = [];
  for (const p of prims) { const acc = p.getAttribute('POSITION'); if (seenPos.has(acc)) continue; seenPos.add(acc); const A = acc.getArray(), n = A.length / 3, JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'), aw = new Float32Array(n), lw = new Float32Array(n), hw = new Float32Array(n), j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) { JA.getElement(i, j); WA.getElement(i, w); const s = w[0] + w[1] + w[2] + w[3] || 1; for (let k = 0; k < 4; k++) { if (isArm[j[k]]) aw[i] += w[k] / s; if (isLeg[j[k]]) lw[i] += w[k] / s; if (isHead[j[k]]) hw[i] += w[k] / s; } }
    layers.push({ p, acc, a0: acc.getArray().slice(), nm: p.getMaterial()?.getName() || '', aw, lw, hw }); }
  const log = []; let zS0 = null; // (the sternum's anchor held from the first pass: the rows under it move, the target must not)
  for (let it = 0; it < K.iters; it++) {
    // the silhouette per row (the rules' sampling: triangles every ~4 mm, the trunk's points only)
    const rows = new Map();
    for (const L of layers) { if (OUT.test(L.nm) || SKIPM.test(L.nm) || !L.p.getIndices()) continue; const A = L.acc.getArray(), I = L.p.getIndices().getArray();
      const ok = (i) => Math.abs(A[i * 3]) < 0.15 && L.aw[i] <= 0.3 && L.hw[i] <= 0.3 && (L.lw[i] <= 0.3 || (A[i * 3 + 1] < yb && L.lw[i] <= 0.95));
      for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (!ok(a) || !ok(b) || !ok(c)) continue; const ymx = Math.max(A[a * 3 + 1], A[b * 3 + 1], A[c * 3 + 1]), ymn = Math.min(A[a * 3 + 1], A[b * 3 + 1], A[c * 3 + 1]); if (ymx < (rLow - 1) * C || ymn > (rTop + 1) * C) continue;
        const Ln = Math.max(Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1]), Math.hypot(A[a * 3] - A[c * 3], A[a * 3 + 1] - A[c * 3 + 1]), Math.hypot(A[b * 3] - A[c * 3], A[b * 3 + 1] - A[c * 3 + 1])), m = Math.min(16, Math.max(1, Math.ceil(Ln / 0.004)));
        for (let ii = 0; ii <= m; ii++) for (let jj = 0; jj <= m - ii; jj++) { const u = ii / m, v = jj / m, ww = 1 - u - v, x = A[a * 3] * ww + A[b * 3] * u + A[c * 3] * v; if (Math.abs(x) > (A[a * 3 + 1] < yb ? 0.06 : 0.13)) continue;
          const y = A[a * 3 + 1] * ww + A[b * 3 + 1] * u + A[c * 3 + 1] * v, z = A[a * 3 + 2] * ww + A[b * 3 + 2] * u + A[c * 3 + 2] * v, r = Math.round(y / C); if (!(rows.get(r) >= z)) rows.set(r, z); } } }
    // the sternum's anchor (the median of its row and the 2 under it, as the rules draw it)
    const sv = [0, 1, 2].map((k) => rows.get(rTop - k)).filter((z) => z !== undefined).sort((x, y) => x - y); if (!sv.length) break; if (zS0 === null) zS0 = sv[(sv.length - 1) >> 1]; const zS = zS0;
    // (polish 1 round 2, the critic: the belt held over the hips (K.hipFloor: the belt's front no further back than the hips'
    // joint + hipFloor, but never more than K.aheadMax ahead of the sternum, rule 1c): a flat front, not a sunken belly)
    const zBt = K.hipFloor == null ? zS + K.lean : Math.max(zS + K.lean, Math.min(zHip + K.hipFloor, zS + K.aheadMax));
    const T = (r) => zS + (zBt - zS) * Math.min(1, (rTop - r) / (rTop - rBel)) - K.dip * ss(rTop - 1, rTop - 4, r) * (1 - ss(rTop - 9, rTop - 14, r)); // (the upper chest a few mm under the line: seated, the trunk's turn brings it forward of the sternum)
    let E = new Map(); for (let r = rLow; r < rTop; r++) { const z = rows.get(r); if (z !== undefined) E.set(r, Math.max(0, z - T(r))); }
    const e0 = Math.max(0, ...E.values()); log.push((e0 * 1000).toFixed(1)); if (e0 <= K.target) break;
    // the excess per (1 cm column, 1 cm row) over the trunk's whole width (the arms' points left out): a round belly's
    // sides stand less far forward, so they move less (one shear over the width would turn the belly's sides over)
    const cMax = Math.round(K.xOut / C), F2 = new Map(), key = (c, r) => c * 1000 + r;
    for (const L of layers) { if (OUT.test(L.nm) || SKIPM.test(L.nm) || !L.p.getIndices()) continue; const A = L.acc.getArray(), I = L.p.getIndices().getArray();
      const ok = (i) => Math.abs(A[i * 3]) < K.xOut + 0.02 && L.aw[i] <= 0.3 && L.hw[i] <= 0.3 && (L.lw[i] <= 0.3 || (A[i * 3 + 1] < yb && L.lw[i] <= 0.95));
      for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (!ok(a) || !ok(b) || !ok(c)) continue; const ymx = Math.max(A[a * 3 + 1], A[b * 3 + 1], A[c * 3 + 1]), ymn = Math.min(A[a * 3 + 1], A[b * 3 + 1], A[c * 3 + 1]); if (ymx < (rLow - 4) * C || ymn > rTop * C) continue;
        const Ln = Math.max(Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1]), Math.hypot(A[a * 3] - A[c * 3], A[a * 3 + 1] - A[c * 3 + 1]), Math.hypot(A[b * 3] - A[c * 3], A[b * 3 + 1] - A[c * 3 + 1])), m = Math.min(16, Math.max(1, Math.ceil(Ln / 0.005)));
        for (let ii = 0; ii <= m; ii++) for (let jj = 0; jj <= m - ii; jj++) { const u = ii / m, v = jj / m, ww = 1 - u - v, x = A[a * 3] * ww + A[b * 3] * u + A[c * 3] * v, y = A[a * 3 + 1] * ww + A[b * 3 + 1] * u + A[c * 3 + 1] * v, z = A[a * 3 + 2] * ww + A[b * 3 + 2] * u + A[c * 3 + 2] * v;
          const cc = Math.round(x / C), r = Math.round(y / C); if (Math.abs(cc) > cMax || r < rLow - 3 || r >= rTop) continue; const k = key(cc, r); if (!(F2.get(k) >= z)) F2.set(k, z); } } }
    const bx = Math.round(K.blurX / C), by = Math.round(K.blur / C), r0 = rLow - 3 - 2 * by, r1 = rTop, E2 = new Map();
    for (let c = -cMax - 2 * bx; c <= cMax + 2 * bx; c++) for (let r = r0; r <= r1; r++) { const z = F2.get(key(c, r)); E2.set(key(c, r), z === undefined || r >= rTop ? 0 : Math.max(0, z - T(r))); }
    // blurred (a box, twice): a pass pulls a peak short and its foot a little, the next pass measures again
    let G = new Map(E2); for (let pass = 0; pass < 2; pass++) { const B = new Map(); for (let c = -cMax - 2 * bx; c <= cMax + 2 * bx; c++) for (let r = r0; r <= r1; r++) { let s = 0, m = 0; for (let dc = -bx; dc <= bx; dc++) for (let dr = -by; dr <= by; dr++) { const v = G.get(key(c + dc, r + dr)); if (v !== undefined) { s += v; m++; } } B.set(key(c, r), m ? s / m : 0); } G = B; }
    const Ex = (x, y) => { const fx = x / C, fy = y / C, c = Math.floor(fx), r = Math.floor(fy), tx = fx - c, ty = fy - r, g = (cc, rr) => G.get(key(cc, rr)) || 0;
      return (g(c, r) * (1 - tx) * (1 - ty) + g(c + 1, r) * tx * (1 - ty) + g(c, r + 1) * (1 - tx) * ty + g(c + 1, r + 1) * tx * ty) * (1 - ss(ys - K.top, ys - K.top0, y)); };
    // the move: every layer's point by its place alone
    let mv = 0;
    for (const L of layers) { const A = L.acc.getArray().slice(), n = A.length / 3; let ch = false;
      for (let i = 0; i < n; i++) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; if (y > ys || y < r0 * C) continue; const e = Ex(x, y); if (e < 1e-5) continue;
        const zf = T(y / C) + e, wz = Math.max(0, Math.min(1, (z - zB) / (zf - zB))), d = e * wz * (1 - L.aw[i]); if (d < 1e-6) continue;
        A[i * 3 + 2] = z - d; ch = true; mv = Math.max(mv, d); }
      if (ch) L.acc.setArray(A); }
    if (mv < 1e-4) break; }
  // (round 2, the critic: the field's whole move eased out over the hem and the lap, K.lapFade long from K.lap0 under the
  // belt: seated the thighs turn forward, and a thigh's top pulled back made a hollow into the lap. The move scaled by a
  // factor of place alone, gently (a steep one tore the hem: the cloth's triangles span it), so the layers keep their order.
  // The beard's cards (K.keep) are left out of it and moved after, below)
  for (const L of layers) { const A0 = L.a0, A = L.acc.getArray(), n = A.length / 3; let ch = false;
    for (let i = 0; i < n; i++) { const d = A[i * 3 + 2] - A0[i * 3 + 2]; if (!d) continue; const y = A0[i * 3 + 1]; let f = 1;
      if (K.keep && K.keep.test(L.nm)) f = 0;
      if (K.lapFade) f *= 1 - ss(yb - K.lap0, yb - K.lap0 - K.lapFade, y) * (K.lapKeep ?? 1);
      if (f !== 1) { A[i * 3 + 2] = A0[i * 3 + 2] + d * f; ch = true; } }
    if (ch) L.acc.setArray(A); }
  // (round 2: the beard's cards (K.keep) each moved whole, by the skin's own move under the card's middle: they follow the
  // chin and the throat they grow from without stretching (dragged by the field point by point, they smeared down the throat))
  if (K.keep && K.follow) { const sk = layers.find((L) => L.nm === 'skin'); if (sk) { const S0 = sk.a0, S1 = sk.acc.getArray(), cand = [];
    for (let i = 0; i < S0.length / 3; i++) if (S0[i * 3 + 1] > ys - 0.12 && Math.abs(S0[i * 3]) < 0.14 && S0[i * 3 + 2] > 0) cand.push(i);
    for (const L of layers) { if (!K.keep.test(L.nm) || !L.p.getIndices()) continue; const A = L.acc.getArray(), I = L.p.getIndices().getArray(), n = A.length / 3, par = new Int32Array(n).map((_, i) => i);
      const fd = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }; for (let t = 0; t < I.length; t += 3) { const a = fd(I[t]); par[fd(I[t + 1])] = a; par[fd(I[t + 2])] = a; }
      const grp = new Map(); for (let i = 0; i < n; i++) { const r = fd(i); (grp.get(r) || grp.set(r, []).get(r)).push(i); }
      let moved = 0; for (const g of grp.values()) { let cx = 0, cy = 0, cz = 0; for (const i of g) { cx += A[i * 3]; cy += A[i * 3 + 1]; cz += A[i * 3 + 2]; } cx /= g.length; cy /= g.length; cz /= g.length;
        let best = -1, bd = 1e9; for (const i of cand) { const d = (S0[i * 3] - cx) ** 2 + (S0[i * 3 + 1] - cy) ** 2 + (S0[i * 3 + 2] - cz) ** 2; if (d < bd) { bd = d; best = i; } }
        if (best < 0) continue; const dz = S1[best * 3 + 2] - S0[best * 3 + 2]; if (Math.abs(dz) < 1e-5) continue; for (const i of g) A[i * 3 + 2] += dz; moved++; }
      L.acc.setArray(A); console.log('field front: beard cards following the skin', moved); } } }
  const f = frontRule(doc); console.log(`field front: row excess ${log.join(' -> ')} mm; rule 1 bulge ${(f.dev * 1000).toFixed(1)} sink ${(f.sink * 1000).toFixed(1)}, belt ahead of the sternum ${(f.ahead * 1000).toFixed(1)} mm`);
  return f;
}

// weightSmoothPass(doc, K): the garments' skin weights relaxed toward their neighbours' over the welded mesh (seam
// duplicates as one point) round the armpits and the trunk's sides (K.x0 < |x| < K.x1, K.y0 over the belt to K.y1 under the
// neck, or to K.yHi over the belt), K.iters passes of K.lam: the hand-over from the arms' bones to the spine's becomes a slope across the cloth,
// not a step, so the jacket's side and the back of the armpit stretch instead of folding when the arms come forward
// (seated, the call framing). The hands, the cuffs and the collar are outside the band. Top 4 influences kept.
export function weightSmoothPass(doc, K = {}) {
  K = { x0: 0.08, x1: 0.3, y0: 0.12, y1: -0.02, iters: 12, lam: 0.5, mats: /^clothes$/, ...K };
  const { ys, yb } = trunkLevels(doc); let total = 0;
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { if (!K.mats.test(p.getMaterial()?.getName() || '') || !p.getIndices()) continue;
    const A = p.getAttribute('POSITION').getArray(), JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA || !WA) continue; const I = p.getIndices().getArray(), n = A.length / 3;
    const id = new Int32Array(n), wk = new Map(); for (let v = 0; v < n; v++) { const k = Math.round(A[v * 3] * 2e4) + ',' + Math.round(A[v * 3 + 1] * 2e4) + ',' + Math.round(A[v * 3 + 2] * 2e4); if (!wk.has(k)) wk.set(k, v); id[v] = wk.get(k); }
    const nb = new Map(), add = (a, b) => { a = id[a]; b = id[b]; if (a !== b) (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); };
    for (let t = 0; t < I.length; t += 3) { if (I[t] === I[t + 1]) continue; for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { add(a, b); add(b, a); } }
    const W = new Map(), j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let v = 0; v < n; v++) if (id[v] === v) { JA.getElement(v, j); WA.getElement(v, w); const m = new Map(); for (let k = 0; k < 4; k++) if (w[k] > 0) m.set(j[k], (m.get(j[k]) || 0) + w[k]); W.set(v, m); }
    // (the band's strength: 1 inside, eased to 0 over 3 cm at each edge, so the band's border does not step either)
    const band = (v) => { const x = Math.abs(A[v * 3]), y = A[v * 3 + 1], e = 0.03, f = (a, b, s) => Math.max(0, Math.min(1, (s - a) / (b - a)));
      return Math.min(f(K.x0, K.x0 + e, x), f(K.x1, K.x1 - e, x), f(yb + K.y0, yb + K.y0 + e, y), f(K.yHi != null ? yb + K.yHi : ys + K.y1, (K.yHi != null ? yb + K.yHi : ys + K.y1) - e, y)); };
    const live = [...W.keys()].map((v) => [v, band(v)]).filter(([, b]) => b > 0);
    for (let it = 0; it < K.iters; it++) { const nx = new Map();
      for (const [v, b] of live) { const N = nb.get(v); if (!N || !N.size) continue; const m = new Map(); const lam = K.lam * b;
        for (const [jj, ww] of W.get(v)) m.set(jj, (m.get(jj) || 0) + ww * (1 - lam)); for (const u of N) for (const [jj, ww] of W.get(id[u]) || []) m.set(jj, (m.get(jj) || 0) + ww * lam / N.size); nx.set(v, m); }
      for (const [v, m] of nx) W.set(v, m); }
    for (let v = 0; v < n; v++) { const m = W.get(id[v]); if (!m || band(id[v]) <= 0) continue; const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((q, x) => q + x[1], 0) || 1;
      for (let k = 0; k < 4; k++) { j[k] = top[k] ? top[k][0] : 0; w[k] = top[k] ? top[k][1] / s : 0; } JA.setElement(v, j); WA.setElement(v, w); total++; } }
  console.log('weight smooth: points', total);
}



