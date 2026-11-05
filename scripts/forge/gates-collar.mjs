// THE CHARACTER FORGE: the collar gate (forge v2.5, NK), with gates.mjs's posing. Two measures at the neck:
//   gap     every collar, neckband, hood lying down and bound neckline hugs what is under it (the neck's skin, the shirt's
//           collar, the hoodie): round the neck in 36 bins, the nearest any of its points comes to the layer under it;
//           the p75 of those bins (p90 reported), at rest and in the talking, standing and walking clips (3 moments
//           each), worst frame (a stiff collar stands off one side when the head turns, as a real one does). A collar that floats
//           as a choker stands 10-15 mm off all round
//   flecks  what must not show round the neck, counted in pixels of a CPU render (orthographic, 2.3 mm a pixel, 6 views
//           round at the study camera's pitch, idle and 3 talking / turning moments; the bind pose is never seen): skin that is under the cloth
//           (its outward ray meets a cloth within 3 cm at rest: the gap under a collar, skin poking through a shoulder)
//           and the back face of any cloth (a garment's inside: a shard, a lining showing at the neckline)
// Node only, no GPU, the CPU skins the meshes as the GPU will (gates.mjs's skinPrim).
export const COLLAR = { gapMm: 7, flecksView: 45, gapClips: ['idle', 'talk', 'sitTalk', 'argue', 'shrug', 'walk', 'walkCool', 'sit', 'leanBar'], items: /^(?!.*(boots|sneakers|shoes|oxford)).*(-collar|neckband|^hood|^neckline)$/ };
const VIEWS = [0, 0.7, -0.7, 1.5, -1.5, Math.PI], POSES = [['idle', 1.2], ['talk', 1.37], ['shift', 1.0], ['sitTalk', 0.5]];

export function collarGate(G) {
  const { M, pack, poseWorld, skinPrim, vNormals, layerOf, skinP, EVERYDAY, isCloth } = G;
  const neckI = M.names.indexOf('neck01'), spineI = M.names.indexOf('spine01') >= 0 ? M.names.indexOf('spine01') : M.names.indexOf('spine02');
  const items = M.prims.filter((p) => p.skinned && isCloth(p) && COLLAR.items.test(p.name));
  const solid = M.prims.filter((p) => p.skinned && !/^(eyes|lashes|brows|teethUp|teethLow)$/.test(p.name));
  const neckAt = (W) => { const e = W[neckI].elements; return [e[12], e[13], e[14]]; };
  const res = { items: items.map((p) => p.name) };

  /* gap */
  // (at rest and while talking, standing and walking: a stiff collar may stand off the neck on one side when the head
  // turns hard (a start, a run), as a real one does; a choker stands off all round, all the time)
  { const frames = [[null, 0]]; for (const n of COLLAR.gapClips) { const c = pack.get(n); if (c) for (const u of [0.2, 0.5, 0.8]) frames.push([n, c.dur * u]); }
    let worst = { mm: 0 }; const perItem = {};
    for (const [clip, t] of frames) { const W = poseWorld(M, clip ? pack.get(clip) : null, t), c = neckAt(W), cache = new Map(), posed = (p) => cache.get(p) || cache.set(p, skinPrim(M, p, W)).get(p);
      for (const it of items) { const L = layerOf(it), under = M.prims.filter((p) => p !== it && p.skinned && (p === skinP || (isCloth(p) && layerOf(p) < L)));
        const Pi = posed(it), near = gridOf(under.map((p) => [posed(p), p.V]), c, 0.2), bins = new Float32Array(36).fill(9);
        for (const v of it.V) { const x = Pi[v * 3], y = Pi[v * 3 + 1], z = Pi[v * 3 + 2]; if (Math.hypot(x - c[0], z - c[2]) > 0.2 || Math.abs(y - c[1]) > 0.2) continue; const d = near(x, y, z); if (d == null) continue;
          const b = Math.floor(((Math.atan2(x - c[0], z - c[2]) + Math.PI) / (2 * Math.PI)) * 36) % 36; if (d < bins[b]) bins[b] = d; }
        const got = [...bins].filter((d) => d < 9).sort((a, b) => a - b); if (!got.length) continue; const q = (f) => got[Math.min(got.length - 1, Math.floor(f * got.length))] * 1000, p50 = q(0.75), p90 = q(0.9);
        if (!perItem[it.name] || p50 > perItem[it.name].mm) perItem[it.name] = { mm: +p50.toFixed(1), p90: +p90.toFixed(1), clip: clip || 'rest', t: +t.toFixed(2) };
        if (p50 > worst.mm) worst = { mm: +p50.toFixed(1), p90: +p90.toFixed(1), item: it.name, clip: clip || 'rest', t: +t.toFixed(2) }; } }
    res.gap = { worst, perItem }; }

  /* flecks */
  { const rest = poseWorld(M, null, 0), c0 = neckAt(rest), restP = new Map(solid.map((p) => [p, skinPrim(M, p, rest)]));
    // (skin under the cloth: a skin triangle near the neck whose outward ray from its middle meets a cloth triangle within 3 cm,
    // not below it (the neck's skin just over a collar's top edge looks out and down onto it: that skin shows by design))
    const cloths = solid.filter((p) => isCloth(p) && p !== skinP), ct = [];
    for (const p of cloths) { const P = restP.get(p); for (let q = 0; q < p.idx.length; q += 3) { const a = p.idx[q], b = p.idx[q + 1], d = p.idx[q + 2]; if (Math.hypot(P[a * 3] - c0[0], P[a * 3 + 2] - c0[2]) > 0.26 || Math.abs(P[a * 3 + 1] - c0[1]) > 0.24) continue; ct.push([P, a, b, d]); } }
    const ctG = new Map(), cs = 0.03, key = (x, y, z) => Math.floor(x / cs) + ',' + Math.floor(y / cs) + ',' + Math.floor(z / cs);
    for (const T of ct) { const [P, a, b, d] = T, mn = [0, 1, 2].map((k) => Math.min(P[a * 3 + k], P[b * 3 + k], P[d * 3 + k])), mx = [0, 1, 2].map((k) => Math.max(P[a * 3 + k], P[b * 3 + k], P[d * 3 + k]));
      for (let i = Math.floor(mn[0] / cs); i <= Math.floor(mx[0] / cs); i++) for (let j = Math.floor(mn[1] / cs); j <= Math.floor(mx[1] / cs); j++) for (let k = Math.floor(mn[2] / cs); k <= Math.floor(mx[2] / cs); k++) { const kk = i + ',' + j + ',' + k; (ctG.get(kk) || ctG.set(kk, []).get(kk)).push(T); } }
    // (by point, along its normal: a triangle is under the cloth when all three of its points are, so one that only
    // reaches under a collar's top edge, its most part showing over it, is not counted)
    // (and never over the top of a collar, neckband, hood or binding at its angle: the neck's skin over a collar shows by design)
    const topA = new Float32Array(72).fill(-9); for (const it of items) { const P = restP.get(it) || skinPrim(M, it, rest); for (const v of it.V) { const b = Math.floor(((Math.atan2(P[v * 3] - c0[0], P[v * 3 + 2] - c0[2]) + Math.PI) / (2 * Math.PI)) * 72) % 72; topA[b] = Math.max(topA[b], P[v * 3 + 1]); } }
    const SP = restP.get(skinP), SN = vNormals(SP, skinP.idx), covV = new Int8Array(SP.length / 3).fill(-1), covered = new Uint8Array(skinP.idx.length / 3);
    const isCov = (v) => { if (covV[v] >= 0) return covV[v]; const m = [SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]], n = [SN[v * 3], SN[v * 3 + 1], SN[v * 3 + 2]]; let hit = 0;
      const tb = topA[Math.floor(((Math.atan2(m[0] - c0[0], m[2] - c0[2]) + Math.PI) / (2 * Math.PI)) * 72) % 72];
      if (Math.hypot(m[0] - c0[0], m[2] - c0[2]) <= 0.24 && m[1] - c0[1] <= 0.05 && m[1] - c0[1] >= -0.22 && !(m[1] > tb - 0.002)) { const seen = new Set();
        for (let s = 0; s <= 0.03 && !hit; s += 0.01) { const p = m.map((x, k) => x + n[k] * s); for (const T of ctG.get(key(...p)) || []) { if (seen.has(T)) continue; seen.add(T); const h = rayTri(m, n, T); if (h > -0.002 && h < 0.03 && m[1] + n[1] * h > m[1] - 0.003) { hit = 1; break; } } } }
      covV[v] = hit; return hit; };
    for (let q = 0; q < skinP.idx.length; q += 3) covered[q / 3] = isCov(skinP.idx[q]) && isCov(skinP.idx[q + 1]) && isCov(skinP.idx[q + 2]) ? 1 : 0;
    const S = 128, scale = 0.3 / S, phi = 0.12, out = []; let worst = { px: 0 };
    for (const [clip, t] of POSES) { const W = poseWorld(M, clip ? pack.get(clip) : null, clip ? Math.min(t, pack.get(clip)?.dur ?? t) : 0), c = neckAt(W), tgt = [c[0], c[1] - 0.03, c[2]], posed = new Map(solid.map((p) => [p, skinPrim(M, p, W)]));
      for (const yaw of VIEWS) { const vd = [Math.sin(yaw) * Math.cos(phi), Math.sin(phi), Math.cos(yaw) * Math.cos(phi)], rg = [vd[2], 0, -vd[0]], lr = Math.hypot(...rg); for (let k = 0; k < 3; k++) rg[k] /= lr; const up = [vd[1] * rg[2] - vd[2] * rg[1], vd[2] * rg[0] - vd[0] * rg[2], vd[0] * rg[1] - vd[1] * rg[0]];
        const Z = new Float32Array(S * S).fill(-9), ID = new Int32Array(S * S).fill(-1), BACK = new Uint8Array(S * S), TRI = new Int32Array(S * S), RR = new Float32Array(S * S), YY = new Float32Array(S * S);
        solid.forEach((p, pi) => { const P = posed.get(p), proj = new Map(); const pr = (v) => { if (proj.has(v)) return proj.get(v); const d = [P[v * 3] - tgt[0], P[v * 3 + 1] - tgt[1], P[v * 3 + 2] - tgt[2]], r = [d[0] * rg[0] + d[1] * rg[1] + d[2] * rg[2], d[0] * up[0] + d[1] * up[1] + d[2] * up[2], d[0] * vd[0] + d[1] * vd[1] + d[2] * vd[2]], o = [S / 2 + r[0] / scale, S / 2 - r[1] / scale, r[2]]; proj.set(v, o); return o; };
          for (let q = 0; q < p.idx.length; q += 3) { const A = pr(p.idx[q]), B = pr(p.idx[q + 1]), C = pr(p.idx[q + 2]); if (Math.max(A[0], B[0], C[0]) < 0 || Math.min(A[0], B[0], C[0]) >= S || Math.max(A[1], B[1], C[1]) < 0 || Math.min(A[1], B[1], C[1]) >= S) continue;
            const det = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]); if (Math.abs(det) < 1e-9) continue; const back = det > 0 ? 1 : 0; // (screen y down: a counter-clockwise triangle on screen has det < 0)
            const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(S - 1, Math.ceil(Math.max(A[0], B[0], C[0]))), y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(S - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = x + 0.5, py = y + 0.5, l1 = ((B[0] - px) * (C[1] - py) - (C[0] - px) * (B[1] - py)) / det, l2 = ((C[0] - px) * (A[1] - py) - (A[0] - px) * (C[1] - py)) / det, l3 = 1 - l1 - l2;
              if (l1 < 0 || l2 < 0 || l3 < 0) continue; const z = l1 * A[2] + l2 * B[2] + l3 * C[2], i = y * S + x; if (z > Z[i]) { Z[i] = z; ID[i] = pi; BACK[i] = back; TRI[i] = q / 3; const v0 = p.idx[q] * 3, v1 = p.idx[q + 1] * 3, v2 = p.idx[q + 2] * 3, wx = l1 * P[v0] + l2 * P[v1] + l3 * P[v2], wz = l1 * P[v0 + 2] + l2 * P[v1 + 2] + l3 * P[v2 + 2]; RR[i] = Math.hypot(wx - c[0], wz - c[2]); YY[i] = l1 * P[v0 + 1] + l2 * P[v1 + 1] + l3 * P[v2 + 1] - c[1]; } } } });
        let skin = 0, lining = 0;
        // (counted on the neckline only: the surface seen within 11 cm of the neck's axis, from 6 cm under its base to 6 cm
        // over it: a sleeve's inside raised in a gesture, or a jacket's own folds on the chest, are not the neckline's)
        for (let i = 0; i < S * S; i++) { const pi = ID[i]; if (pi < 0) continue; const p = solid[pi]; if (RR[i] > 0.11 || YY[i] < -0.06 || YY[i] > 0.06) continue;
          if (p === skinP) { if (!BACK[i] && covered[TRI[i]]) skin++; }
          else if (isCloth(p) && BACK[i] && !/^(hair|braids|locs|beard)/.test(p.name)) lining++; }
        if (G.debug) { const img = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { const pi = ID[i], p = pi >= 0 ? solid[pi] : null; const c = !p ? [0, 0, 0] : p === skinP ? (covered[TRI[i]] && !BACK[i] ? [255, 0, 0] : [220, 190, 160]) : BACK[i] ? (COLLAR.items.test(p.name) ? [255, 140, 0] : [255, 0, 255]) : isCloth(p) ? (COLLAR.items.test(p.name) ? [240, 220, 60] : [60, 90, 200]) : [120, 120, 120]; img.set(c, i * 3); }
          const reds = []; for (let i = 0; i < S * S; i++) if (ID[i] >= 0 && solid[ID[i]] === skinP && covered[TRI[i]] && !BACK[i] && RR[i] <= 0.11 && YY[i] >= -0.06 && YY[i] <= 0.06) reds.push([+(RR[i] * 100).toFixed(1), +(YY[i] * 100).toFixed(1), TRI[i]]);
          G.debug(`${clip || 'rest'}-${Math.round(yaw * 57.3)}`, img, S, reds); }
        const rec = { view: `${clip || 'rest'}@${(yaw * 57.3).toFixed(0)}`, skin, lining, px: skin + lining }; out.push(rec); if (rec.px > worst.px) worst = rec; } }
    res.flecks = { worst, total: out.reduce((a, r) => a + r.px, 0), views: out.length, coveredSkinTris: covered.reduce((a, x) => a + x, 0) }; }
  const gapOk = !items.length || res.gap.worst.mm <= COLLAR.gapMm, fleckOk = res.flecks.worst.px <= COLLAR.flecksView;
  return { pass: gapOk && fleckOk, ...res, limit: `every collar, neckband, hood lying down and bound neckline within ${COLLAR.gapMm} mm of what is under it (p75 round the neck, worst of rest + talk, stand and walk clips); <= ${COLLAR.flecksView} px (2.3 mm) of covered skin or a cloth's back face round the neck in any of ${VIEWS.length * POSES.length} views` };
}
// the nearest distance from a point to any of several posed point sets, near c (a 1.5 cm grid, searched 2 cells round)
function gridOf(sets, c, R) {
  const cs = 0.015, G = new Map(), key = (i, j, k) => i + ',' + j + ',' + k;
  for (const [P, V] of sets) for (const v of V) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (Math.hypot(x - c[0], z - c[2]) > R + 0.05 || Math.abs(y - c[1]) > R + 0.05) continue; const k = key(Math.floor(x / cs), Math.floor(y / cs), Math.floor(z / cs)); (G.get(k) || G.set(k, []).get(k)).push(x, y, z); }
  return (x, y, z) => { const i0 = Math.floor(x / cs), j0 = Math.floor(y / cs), k0 = Math.floor(z / cs); let bd = Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) { const L = G.get(key(i0 + i, j0 + j, k0 + k)); if (!L) continue; for (let q = 0; q < L.length; q += 3) { const d = (L[q] - x) ** 2 + (L[q + 1] - y) ** 2 + (L[q + 2] - z) ** 2; if (d < bd) bd = d; } }
    return bd === Infinity ? null : Math.sqrt(bd); };
}
// a ray (o + t d) against a triangle [P, a, b, c]: t, or NaN (Moller-Trumbore)
function rayTri(o, d, [P, a, b, c]) {
  const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], e1 = [P[b * 3] - A[0], P[b * 3 + 1] - A[1], P[b * 3 + 2] - A[2]], e2 = [P[c * 3] - A[0], P[c * 3 + 1] - A[1], P[c * 3 + 2] - A[2]];
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(det) < 1e-12) return NaN;
  const f = 1 / det, s = [o[0] - A[0], o[1] - A[1], o[2] - A[2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < 0 || u > 1) return NaN;
  const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = f * (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]); if (v < 0 || u + v > 1) return NaN;
  return f * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]);
}
