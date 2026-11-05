// The face finder in Node (the forge): Mog City's wagmi/face.js fitEyes + landmarks, copied (read-only on the
// original) and run on the shaped body before any texture work, so the lips' parting and front are found from the
// geometry: no studio pass, no hand-copied mouth.below/front. Pure math on positions.
//   findMouth(P: Float32Array xyz, skinIx: index list, eyeIx: index list, eyeFront: m, ref?: Float32Array) ->
//     { below, front, chin, lids, lidInfo, ..., source: { parting, chin, lids: 'found' | 'carried' | 'none' } }
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
}
const attr = (P) => ({ getX: (i) => P[i * 3], getY: (i) => P[i * 3 + 1], getZ: (i) => P[i * 3 + 2] });

function fitEyes(P, eyeV) {
  return [1, -1].map((side) => {
    const A = Array.from({ length: 4 }, () => new Float64Array(5));
    for (const v of eyeV) { const p = new V3(P.getX(v), P.getY(v), P.getZ(v)); if (p.x * side <= 0) continue; const r = [2 * p.x, 2 * p.y, 2 * p.z, 1], s = p.lengthSq();
      for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) A[i][j] += r[i] * r[j]; A[i][4] += r[i] * s; } }
    for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]];
      for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 5; k++) A[r][k] -= f * A[c][k]; } }
    const c = new V3(A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2]);
    return { side, c, r: Math.sqrt(Math.max(1e-8, c.lengthSq() + A[3][4] / A[3][3])) };
  });
}

function landmarks(P, skinIx, eyes) {
  const e0 = eyes[0], ey = e0.c.y, front = e0.c.z + e0.r;
  const tri = [];
  for (let i = 0; i < skinIx.length; i += 3) { const a = skinIx[i]; if (P.getY(a) > ey - 0.17 && P.getY(a) < ey + 0.03 && P.getZ(a) > front - 0.12) tri.push(skinIx[i], skinIx[i + 1], skinIx[i + 2]); }
  const cut = (x0) => {
    const s = [];
    for (let i = 0; i < tri.length; i += 3) {
      let k = 0; const q = [0, 0, 0, 0];
      for (let e = 0; e < 3; e++) { const a = tri[i + e], c = tri[i + (e + 1) % 3], sa = P.getX(a) - x0, sc = P.getX(c) - x0;
        if (sa * sc < 0 && k < 4) { const u = sa / (sa - sc); q[k++] = P.getY(a) + u * (P.getY(c) - P.getY(a)); q[k++] = P.getZ(a) + u * (P.getZ(c) - P.getZ(a)); } }
      if (k === 4) s.push(...q);
    }
    return s;
  };
  const frontAt = (s, y) => { let f = -Infinity; for (let i = 0; i < s.length; i += 4) { const y1 = s[i], y2 = s[i + 2]; if ((y1 - y) * (y2 - y) < 0) f = Math.max(f, s[i + 1] + (y - y1) / (y2 - y1) * (s[i + 3] - s[i + 1])); } return f; };
  const parting = (s) => {
    let prev = null;
    for (let dy = -0.035; dy >= -0.11; dy -= 0.0002) {
      const y = ey + dy, fz = frontAt(s, y);
      if (prev && fz - prev.fz > 0.0015 && fz > front - 0.03) return { y: (y + prev.y) / 2 + 0.0004, z: fz };
      prev = { y, fz };
    }
    return null;
  };
  const mid = cut(0.0015), m0 = parting(mid);
  if (!m0) return null;
  const part = [[0, m0.y, m0.z]];
  for (const x0 of [0.004, 0.007, 0.01, 0.013, 0.016, 0.019, 0.022]) { const p = parting(cut(x0)); if (p && Math.abs(p.y - m0.y) < 0.003) part.push([x0, p.y, p.z]); }
  let chin = null;
  let chinZ = null;
  for (let y = m0.y - 0.02; y > ey - 0.16; y -= 0.0005) { const fz = frontAt(mid, y); if (fz < m0.z - 0.02) { chin = y; chinZ = fz; break; } }
  const s = cut(e0.c.x), ang = [];
  for (let i = 0; i < s.length; i += 4) for (let u = 0; u <= 1; u += 0.1) {
    const y = s[i] + u * (s[i + 2] - s[i]) - e0.c.y, z = s[i + 1] + u * (s[i + 3] - s[i + 1]) - e0.c.z, r = Math.hypot(y, z);
    if (z > 0 && r < e0.r + 0.005 && r > e0.r - 0.003) ang.push(Math.atan2(y, z));
  }
  ang.sort((a, b) => a - b);
  let lids = null;
  for (let i = 1; i < ang.length; i++) { const g = ang[i] - ang[i - 1]; if (ang[i] > -0.9 && ang[i - 1] < 0.9 && (!lids || g > lids.gap)) lids = { gap: g, lo: ang[i - 1], up: ang[i] }; }
  if (lids && (lids.gap < 0.25 || lids.gap > 0.9)) lids = null;
  return { ey, front, parting: part, lipZ: m0.z, chin, chinZ, lids };
}

// FB (robustness): an age, weight or face blend can press the lips together (or move a crease above them) until the
// cut finds no parting, or finds the wrong one; the lids' gap can close the same way. The mesh's topology never changes
// with the shapes, so every landmark is also carried: found once on a reference body the finder reads (the base,
// unshaped), each point pinned to its nearest skin vertex plus its offset there, and read back on the shaped body.
// The finder's own answer is used when it agrees with the carried one (the gate below); otherwise the carried one is.
const GATE = { belowMm: 6, frontMm: 8, chinMm: 12, lidMidMm: 2, gapRad: 0.2 };
const anchorCache = new WeakMap();
function anchorsOf(Pr, skinIx, eyeIx) {
  const hit = anchorCache.get(Pr); if (hit) return hit;
  const P = attr(Pr), eyes = fitEyes(P, new Set(eyeIx)), lm = landmarks(P, skinIx, eyes);
  if (!lm) { anchorCache.set(Pr, null); return null; }
  const e0 = eyes[0], cand = [];
  for (const v of new Set(skinIx)) { const y = P.getY(v), z = P.getZ(v); if (y > lm.ey - 0.17 && y < lm.ey + 0.03 && z > lm.front - 0.12) cand.push(v); }
  const pin = (p) => { let best = -1, bd = Infinity; for (const v of cand) { const d = (P.getX(v) - p[0]) ** 2 + (P.getY(v) - p[1]) ** 2 + (P.getZ(v) - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
    return { v: best, off: [p[0] - P.getX(best), p[1] - P.getY(best), p[2] - P.getZ(best)] }; };
  const lidPt = (a) => [e0.c.x, e0.c.y + e0.r * Math.sin(a), e0.c.z + e0.r * Math.cos(a)];
  const A = { parting: lm.parting.map(pin), chin: lm.chin != null ? pin([0.0015, lm.chin, lm.chinZ]) : null, lids: lm.lids ? [pin(lidPt(lm.lids.lo)), pin(lidPt(lm.lids.up))] : null };
  anchorCache.set(Pr, A); return A;
}
function carried(P, A, eyes) {
  const at = (a) => [P.getX(a.v) + a.off[0], P.getY(a.v) + a.off[1], P.getZ(a.v) + a.off[2]], e0 = eyes[0];
  const part = A.parting.map(at).map(([x, y, z]) => [Math.abs(x), y, z]).sort((a, b) => a[0] - b[0]);
  const ch = A.chin ? at(A.chin) : null;
  let lids = null;
  if (A.lids) { const [lo, up] = A.lids.map(at).map((p) => Math.atan2(p[1] - e0.c.y, p[2] - e0.c.z)); if (up > lo) lids = { gap: up - lo, lo, up }; }
  return { ey: e0.c.y, front: e0.c.z + e0.r, parting: part, lipZ: part[0][2], chin: ch ? ch[1] : null, lids };
}

// ref: optional Float32Array, the reference body (same topology) for the carried landmarks
export function findMouth(Pf, skinIx, eyeIx, eyeFront, ref = null) {
  const P = attr(Pf), eyes = fitEyes(P, new Set(eyeIx));
  let lm = landmarks(P, skinIx, eyes);
  const A = ref ? anchorsOf(ref, skinIx, eyeIx) : null, C = A ? carried(P, A, eyes) : null, source = { parting: 'found', chin: 'found', lids: 'found' };
  let delta = null;
  if (C) {
    const mm = (a, b) => Math.abs(a - b) * 1000;
    if (lm) delta = { belowMm: +mm(lm.parting[0][1], C.parting[0][1]).toFixed(2), frontMm: +mm(lm.lipZ, C.lipZ).toFixed(2), lidMidMm: lm.lids && C.lids ? +mm(eyes[0].r * (Math.sin(lm.lids.up) + Math.sin(lm.lids.lo)) / 2, eyes[0].r * (Math.sin(C.lids.up) + Math.sin(C.lids.lo)) / 2).toFixed(2) : null };
    if (!lm || mm(lm.parting[0][1], C.parting[0][1]) > GATE.belowMm || mm(lm.lipZ, C.lipZ) > GATE.frontMm) { lm = { ...(lm || {}), ey: C.ey, front: C.front, parting: C.parting, lipZ: C.lipZ, chin: lm?.chin ?? null, lids: lm?.lids ?? null }; source.parting = 'carried'; }
    if (lm.chin == null || (C.chin != null && mm(lm.chin, C.chin) > GATE.chinMm)) { lm.chin = C.chin; source.chin = 'carried'; }
    const mid = (L) => eyes[0].r * (Math.sin(L.up) + Math.sin(L.lo)) / 2;
    if (C.lids && (!lm.lids || mm(mid(lm.lids), mid(C.lids)) > GATE.lidMidMm || Math.abs(lm.lids.gap - C.lids.gap) > GATE.gapRad)) { lm.lids = C.lids; source.lids = 'carried'; }
  }
  if (!lm) return null;
  if (!lm.lids) source.lids = 'none'; if (lm.chin == null) source.chin = 'none';
  const eyMid = (eyes[0].c.y + eyes[1].c.y) / 2;
  // (forge v2: the lids as face.js will use them: lidUp the upper lid's turn to close (the opening + 0.21 rad of overlap),
  // lidMid the opening's middle (mm from the eyeball's middle). face.js reports these two, not a 'lids' flag; its
  // defaults (0.74 rad, -0.55 mm) mean nothing was found. v1's studio read a 'lids' key face.js never sets, so every
  // character showed 'lids: false' while the finder had found them)
  const L = lm.lids, r = eyes[0].r;
  const lidInfo = L ? { gapRad: +L.gap.toFixed(3), lo: +L.lo.toFixed(3), up: +L.up.toFixed(3), lidUp: +(L.up - L.lo + 0.21).toFixed(3), lidMidMm: +(r * (Math.sin(L.up) + Math.sin(L.lo)) / 2 * 1000).toFixed(2), openingMm: +(r * (Math.sin(L.up) - Math.sin(L.lo)) * 1000).toFixed(2) } : null;
  return { below: +((eyMid - lm.parting[0][1]) * 1000).toFixed(2), front: +((lm.lipZ - eyeFront) * 1000).toFixed(2), chin: lm.chin != null ? +((eyMid - lm.chin) * 1000).toFixed(1) : null, lids: !!lm.lids, lidInfo, eyeR: +(r * 1000).toFixed(2), corners: lm.parting.length, ey: eyMid, source, delta };
}

// (G8a) the parting across the mouth as face.js finds it on this body, for the forge to read face.js's mouthShade ahead
// of it: { ey, front, parting: [[x, y, z]...], lipZ } (null: no parting found)
export function faceParting(Pf, skinIx, eyeIx) {
  const P = attr(Pf), eyes = fitEyes(P, new Set(eyeIx)), lm = landmarks(P, skinIx, eyes);
  return lm && { ey: lm.ey, front: lm.front, parting: lm.parting, lipZ: lm.lipZ };
}
