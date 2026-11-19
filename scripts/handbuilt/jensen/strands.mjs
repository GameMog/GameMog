// Hand-built Jensen, likeness round 2: his hair grown as new strand cards (the forge's swept-back cut, 1050 triangles of
// short cards, read as a flat slicked helmet set far back, its card tiles and wedges came through as shards in profile).
// Modelled by eye on his public look: thick, tousled silver-grey hair that lifts UP and a little FORWARD off a fairly
// low front hairline, a full rounded crown, the temples covered down to just over the ears, short neat sides and nape,
// darker grey at the roots and sides.
//  scalp   the head's skin as a radius field round a point in the skull (azimuth x elevation), smoothed (the ears kept out)
//  volume  the hair's thickness over the scalp: ~2.6 cm over the front top (the lift), ~1.8 cm at the crown, under 1 cm
//          at the sides and nape; the cards lie in layers inside it, so the head of hair has depth
//  cards   from roots scattered over the hair's area (scalp.mjs's hairline, the front lowered), each a strand card marched
//          over the scalp along the comb (up then back off the forehead, back and a little down at the sides, down at the
//          back), rising from its root to its layer's height within a centimetre (so the front stands up off the forehead
//          and, rising along the skull's radius there, a little forward), tousled by a low-frequency noise so neighbours
//          clump, its cross-section a shallow V, its normals the volume's (it shades as one mass, not as card faces)
//  cap     an opaque under-layer at ~55 % of the volume, meeting the scalp at the hairline: no scalp shows between cards
//  texture strands drawn here (no photograph or downloaded texture): a 4-column atlas of wavy silver strands, dark grey
//          at the roots, each tapering to a soft tip, fewer at the card's edges (soft card edges, no hard tile border);
//          the transparent texels carry the strands' colour so mips never pull a dark fringe in
// Rigid on the head bone (as the glasses are); alpha MASK (depth-sorted by the depth buffer: no sorting faults).
import { prim, matOf, sharp, sm, clamp, h3, fbm } from '../young-hero/glb.mjs';
import { LM } from './landmarks.mjs';

// the hair's area on the scalp (scalp.mjs's hairOf with the front hairline at front (m over the eyes))
export function hairArea(x0, y, z, n = 0, front = 0.055) {
  const { EY, EZ } = LM, x = Math.abs(x0);
  const yf = EY + front + 0.008 * sm(0.015, 0.045, x) + n * 0.002, f = sm(yf - 0.003, yf + 0.004, y);
  // (the temples covered: the side's front line well forward at the top, back to the ear's front at its top)
  const zt = EZ - 0.038 - 0.03 * sm(EY + 0.05, EY - 0.005, y) + n * 0.002;
  const ysb = EY - 0.012 - 0.05 * sm(0.03, -0.02, z) + n * 0.002;
  const side = sm(zt + 0.004, zt - 0.004, z) * sm(ysb - 0.003, ysb + 0.004, y) * sm(0.03, 0.05, x + 0.04 * sm(0.0, -0.05, z));
  // (round 2b: the ear's keep-out smaller (it took the temple above the ear: a bare patch between the hair and the ear))
  const ex = (y - (EY - 0.024)) / 0.028, ez = (z - 0.03) / 0.024, ed = Math.hypot(ex, ez), ear = sm(0.058, 0.07, x) * sm(1.1, 0.96, ed);
  return clamp(Math.max(f, side) * (1 - ear));
}

async function atlas(K) {
  const S = 1024, CW = 256, acc = new Float32Array(S * S * 2); let s = 9; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let col = 0; col < 4; col++) for (let k = 0; k < K.perCard; k++) {
    const u0 = R(), edge = Math.min(u0, 1 - u0); if (R() > sm(0.0, 0.22, edge) * 0.9 + 0.1) continue; // fewer at the edges
    const x0 = col * CW + 6 + u0 * (CW - 12), len = (0.62 + 0.38 * R()) * S, th = 1.4 + 1.8 * R(), amp = 1 + 4 * R(), fq = 1 + 2.5 * R(), ph = R() * 6.28, lum = 0.62 + 0.38 * R() * R() + (R() < 0.12 ? -0.25 : 0);
    for (let y = 0; y < len; y++) { const t = y / len, x = x0 + amp * Math.sin(ph + (y / S) * fq * 6.28), w = th * (1 - 0.65 * sm(0.6, 1, t)), a0 = 1 - sm(0.82, 1, t);
      for (let X = Math.floor(x - w - 1); X <= Math.ceil(x + w + 1); X++) { if (X < col * CW || X >= (col + 1) * CW) continue; const dd = Math.abs(X - x) / w; if (dd > 1.3) continue; const a = a0 * clamp(1.3 - dd);
        const i = y * S + X, L = lum * (1 - 0.45 * sm(0.32, 0.0, t)); acc[i * 2] += a * L; acc[i * 2 + 1] += a; } } }
  const d = Buffer.alloc(S * S * 4), [r0, g0, b0] = K.tone;
  for (let i = 0; i < S * S; i++) { const sa = acc[i * 2 + 1], y = Math.floor(i / S) / S, L = sa > 0 ? acc[i * 2] / sa : 0.72 * (1 - 0.4 * sm(0.3, 0, y));
    d[i * 4] = Math.round(clamp(r0 * L / 255) * 255); d[i * 4 + 1] = Math.round(clamp(g0 * L / 255) * 255); d[i * 4 + 2] = Math.round(clamp(b0 * L / 255) * 255); d[i * 4 + 3] = Math.round(clamp(sa * 0.9) * 255); }
  return sharp(d, { raw: { width: S, height: S, channels: 4 } }).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toBuffer();
}

export async function strandsPass(doc, K = {}) {
  K = { front: 0.054, cards: 2300, perCard: 60, Tfront: 0.026, Tcrown: 0.018, Tside: 0.006, Tnape: 0.004, lenFront: 0.07, lenTop: 0.06, lenSide: 0.032, lenBack: 0.04,
    width: 0.0085, tone: [184, 182, 180], side: 0.72, cutoff: 0.4, rough: 0.55, tousle: 0.45, capK: 0.62, fwd: 0.011, upN: 0, ...K };
  const { EY, EZ } = LM, R = doc.getRoot(), skin = R.listSkins()[0], HEADI = skin.listJoints().findIndex((j) => j.getName() === 'head');
  // the old cut out (both its primitives)
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) if (p.getMaterial()?.getName() === 'hair') m.removePrimitive(p);
  { const old = matOf(doc, 'hair'); if (old) { for (const t of [old.getBaseColorTexture(), old.getNormalTexture(), old.getMetallicRoughnessTexture()]) if (t && t.listParents().length <= 2) t.dispose(); old.dispose(); } }
  const sk = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0], PA = sk.getAttribute('POSITION').getArray();
  const C = [0, EY + 0.02, EZ - 0.09];
  // the scalp: radius by (azimuth, elevation), the outermost skin point in each cell
  const NT = 160, NP = 90, P0 = -0.75, P1 = Math.PI / 2, rad = new Float32Array(NT * NP).fill(0);
  const cell = (dx, dy, dz) => { const L = Math.hypot(dx, dy, dz), th = Math.atan2(dx, dz), ph = Math.asin(clamp(dy / L, -1, 1)); return [Math.min(NT - 1, Math.floor(((th + Math.PI) / (2 * Math.PI)) * NT)), Math.floor(((ph - P0) / (P1 - P0)) * NP), L]; };
  for (const v of new Set(sk.getIndices().getArray())) { const x = PA[v * 3], y = PA[v * 3 + 1], z = PA[v * 3 + 2]; if (y < EY - 0.09 || Math.abs(x) > 0.1 || z < -0.09) continue;
    // (the ears out: they stand off the skull)
    if (Math.abs(x) > 0.066 && y < EY + 0.03 && y > EY - 0.06 && z < EZ - 0.055 && z > EZ - 0.13) continue;
    const [i, j, L] = cell(x - C[0], y - C[1], z - C[2]); if (j < 0 || j >= NP) continue; rad[j * NT + i] = Math.max(rad[j * NT + i], L); }
  for (let it = 0; it < 60; it++) { const src = rad.slice(); let miss = 0; for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) { if (src[j * NT + i]) continue; let s = 0, n = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = src[Math.min(NP - 1, Math.max(0, j + b)) * NT + ((i + a + NT) % NT)]; if (q) { s += q; n++; } } if (n) rad[j * NT + i] = s / n; else miss++; } if (!miss) break; }
  { for (let it = 0; it < 2; it++) { const src = rad.slice(); for (let j = 1; j < NP - 1; j++) for (let i = 0; i < NT; i++) { let s = 0; for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) s += src[(j + b) * NT + ((i + a + NT) % NT)]; rad[j * NT + i] = s / 5; } } }
  const scalpR = (d) => { const th = Math.atan2(d[0], d[2]), ph = Math.asin(clamp(d[1], -1, 1)), fi = ((th + Math.PI) / (2 * Math.PI)) * NT - 0.5, fj = clamp(((ph - P0) / (P1 - P0)) * NP - 0.5, 0, NP - 1.001);
    const i0 = Math.floor(fi), j0 = Math.floor(fj), a = fi - i0, b = fj - j0, g = (i, j) => rad[j * NT + ((i % NT) + NT) % NT];
    return (g(i0, j0) * (1 - a) + g(i0 + 1, j0) * a) * (1 - b) + (g(i0, j0 + 1) * (1 - a) + g(i0 + 1, j0 + 1) * a) * b; };
  const norm = (v) => { const L = Math.hypot(...v) || 1; return v.map((q) => q / L); }, onScalp = (d, h = 0) => { const r = scalpR(d) + h; return [C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // the volume's thickness at a scalp point
  const zc = EZ - 0.125;
  const T = (p) => { const [x0, y, z] = p, x = Math.abs(x0), up = sm(EY + 0.0, EY + 0.08, y), fr = sm(zc, EZ - 0.04, z), side = sm(0.05, 0.078, x) * (1 - sm(EY + 0.06, EY + 0.1, y)), nape = sm(EY + 0.02, EY - 0.05, y) * sm(zc + 0.02, zc - 0.03, z);
    let t = K.Tcrown + (K.Tfront - K.Tcrown) * fr; t = t * up + K.Tside * (1 - up); t = t * (1 - 0.6 * side) + K.Tside * 0.6 * side; return t * (1 - nape) + K.Tnape * nape; };
  // the comb's direction at a scalp point
  const flow = (p) => { const [x, y, z] = p, ax = Math.abs(x), back = sm(zc + 0.015, zc - 0.03, z), side = sm(0.045, 0.075, ax) * (1 - sm(EY + 0.07, EY + 0.1, y));
    const fF = [x * 1.2, 0.0, -1], fS = [0, -0.4, -1], fB = [x * 0.6, -1, -0.12]; let f = fF.map((q, k) => q * (1 - side) + fS[k] * side); f = f.map((q, k) => q * (1 - back) + fB[k] * back); return norm(f); };
  // the roots: rejection-sampled over the hair's area, by solid angle, more toward the front
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const roots = []; for (let tries = 0; roots.length < K.cards && tries < K.cards * 60; tries++) {
    const th = (rnd() * 2 - 1) * Math.PI, ph = Math.asin(rnd() * (Math.sin(P1) - Math.sin(-0.55)) + Math.sin(-0.55)), d = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)], p = onScalp(d);
    const a = hairArea(p[0], p[1], p[2], 0, K.front); if (a < 0.5 || rnd() > a) continue; if (p[1] < EY - 0.075) continue; roots.push({ d, p }); }
  const Pv = [], Nv = [], UV = [], CO = [], IX = [];
  for (const [ri, r] of roots.entries()) {
    const [x, y, z] = r.p, ax = Math.abs(x), up = sm(EY + 0.02, EY + 0.08, y), fr = sm(zc, EZ - 0.03, z), side = sm(0.05, 0.075, ax) * (1 - up), back = sm(zc + 0.01, zc - 0.04, z);
    const frontEdge = sm(EZ - 0.05, EZ - 0.02, z) * up; // the front's roots, at the hairline
    let L = ((K.lenFront * fr + K.lenTop * (1 - fr)) * (1 - side) + K.lenSide * side) * (1 - back) + K.lenBack * back; L *= 0.75 + 0.45 * rnd();
    const layer = frontEdge > 0.5 ? 0.7 + 0.3 * rnd() : 0.3 + 0.7 * Math.sqrt(rnd()), rise = 0.006 + 0.012 * frontEdge, step = 0.004, n = Math.max(4, Math.round(L / step));
    const col = Math.floor(rnd() * 4), tint = (1 - (1 - K.side) * Math.max(side, back * 0.6 * (1 - up))) * (0.9 + 0.18 * rnd()) * (1 - 0.4 * sm(EY + 0.03, EY - 0.04, y)); // (round 2b: the nape a darker grey)
    const wid = K.width * (0.8 + 0.5 * rnd()) * (1 - 0.4 * side);
    let d = r.d.slice(), ang0 = (fbm(x, y, z, 25) - 0.5) * 2 * K.tousle + (rnd() - 0.5) * 0.25; const pts = [];
    for (let k = 0; k <= n; k++) { const s = k * step, b = onScalp(d), h = T(b) * layer * sm(0, rise, s) * (1 - 0.25 * sm(0.75 * L, L, s)) + 0.0006;
      pts.push(onScalp(d, h)); const nn = norm(b.map((q, c) => q - C[c])); let f = flow(b); f = norm(f.map((q, c) => q - nn[c] * dot(f, nn)));
      // (round 2b: the front's strands first stand up and lean a little FORWARD over the hairline, then turn back: the
      // lifted front overhangs its roots, so no bare band shows between the forehead and the hair)
      { const fw = frontEdge * sm(K.fwd, 0, s); if (fw > 0) f = f.map((q) => q * (1 - 1.6 * fw)); }
      const ang = ang0 + 0.35 * Math.sin(s * 60 + ri) * K.tousle, bi = cross(nn, f), t = f.map((q, c) => q * Math.cos(ang) + bi[c] * Math.sin(ang));
      const nb = b.map((q, c) => q + t[c] * step); if (nb[1] < EY - 0.085) break; d = norm(nb.map((q, c) => q - C[c])); }
    if (pts.length < 3) continue; const base = Pv.length / 3, m = pts.length;
    for (let k = 0; k < m; k++) { const p = pts[k], tg = norm(pts[Math.min(m - 1, k + 1)].map((q, c) => q - pts[Math.max(0, k - 1)][c])), nn = norm(p.map((q, c) => q - C[c])); let wv = cross(tg, nn); if (Math.hypot(...wv) < 1e-4) wv = [1, 0, 0]; wv = norm(wv);
      const s = k / (m - 1), w = wid * (1 - 0.55 * s) / 2, curl = 0.0012 * (1 - s);
      for (const [q, u] of [[-1, 0], [0, 0.5], [1, 1]]) { const lift = q === 0 ? curl : 0; Pv.push(p[0] + wv[0] * w * q + nn[0] * lift, p[1] + wv[1] * w * q + nn[1] * lift, p[2] + wv[2] * w * q + nn[2] * lift);
        const nq = norm([nn[0] + wv[0] * q * 0.25, nn[1] + wv[1] * q * 0.25 + K.upN * Math.max(0, -nn[1]), nn[2] + wv[2] * q * 0.25]); Nv.push(...nq); UV.push((col + 0.02 + u * 0.96) / 4, s * (L / (K.lenFront * 1.2)) * 0.98 + 0.01);
        // (round 2b, K.upN above: the under-hair at the nape shaded as the mass over it, not lit white by the floor)
        const rootDk = 1 - 0.25 * sm(0.3, 0, s); CO.push(tint * rootDk, tint * rootDk, tint * rootDk * 1.01, 1); }
      // (round 2b: wound to face out, along the normals: wound inward, every card was seen from its back, the renderer
      // turned its normal in, and the hair was lit from inside the head: dark on top, the nape glaring white)
      if (k < m - 1) { const a = base + k * 3; IX.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); } }
  }
  // the cap: the hair's area as a grid over (azimuth, elevation), at capK of the volume, down to the scalp at the edge
  const CP = [], CN = [], CU = [], CC = [], CI = [], GI = 120, GJ = 70, id = new Int32Array((GI + 1) * (GJ + 1)).fill(-1);
  for (let j = 0; j <= GJ; j++) for (let i = 0; i <= GI; i++) { const th = (i / GI) * 2 * Math.PI - Math.PI, ph = -0.6 + (j / GJ) * (P1 - -0.6), d = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)], b = onScalp(d);
    const a = hairArea(b[0], b[1], b[2], 0, K.front + 0.004); if (a <= 0.02 || b[1] < EY - 0.08) continue; const h = T(b) * K.capK * sm(0.0, 1.0, a) - 0.0015 * (1 - a), p = onScalp(d, h);
    id[j * (GI + 1) + i] = CP.length / 3; CP.push(...p); CN.push(...d); CU.push(th * 2, ph * 2); const sd = sm(0.05, 0.075, Math.abs(b[0])) * (1 - sm(EY + 0.06, EY + 0.1, b[1])); const g = 0.46 - 0.12 * sd; CC.push(g, g, g * 1.01, 1); }
  for (let j = 0; j < GJ; j++) for (let i = 0; i < GI; i++) { const a = id[j * (GI + 1) + i], b = id[j * (GI + 1) + i + 1], c = id[(j + 1) * (GI + 1) + i], e = id[(j + 1) * (GI + 1) + i + 1]; if (a < 0 || b < 0 || c < 0 || e < 0) continue; CI.push(a, b, c, b, e, c); }
  // the materials and primitives (rigid on the head)
  const buf = R.listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf), mesh = R.listMeshes().find((m) => m.listPrimitives().includes(sk));
  const add = (P, N, U, Co, I, mat) => { const n = P.length / 3, JJ = new Uint16Array(n * 4), WW = new Float32Array(n * 4); for (let v = 0; v < n; v++) { JJ[v * 4] = HEADI; WW[v * 4] = 1; }
    mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N))).setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(U)))
      .setAttribute('COLOR_0', acc('VEC4', Float32Array.from(Co))).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW)).setIndices(acc('SCALAR', Uint32Array.from(I)))); };
  const tex = doc.createTexture('hair-strands').setImage(await atlas(K)).setMimeType('image/webp');
  const hm = doc.createMaterial('hair').setBaseColorTexture(tex).setBaseColorFactor([1, 1, 1, 1]).setAlphaMode('MASK').setAlphaCutoff(K.cutoff).setDoubleSided(true).setRoughnessFactor(K.rough).setMetallicFactor(0);
  const cm = doc.createMaterial('hairCap').setBaseColorTexture(tex).setBaseColorFactor([0.95, 0.95, 0.95, 1]).setAlphaMode('OPAQUE').setDoubleSided(false).setRoughnessFactor(0.7).setMetallicFactor(0);
  add(CP, CN, CU, CC, CI, cm); add(Pv, Nv, UV, CO, IX, hm);
  console.log('strands: roots', roots.length, 'card points', Pv.length / 3, 'triangles', IX.length / 3, '; cap points', CP.length / 3, 'triangles', CI.length / 3);
}
