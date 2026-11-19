// Jensen's hair, caricature round 3 (the owner, 19 Nov: "hair and mouth need a bit more work"; the critic: the card groom
// read as a spiky brush of paper shreds with a hard grey band at the hairline): the cards and their cap replaced by a
// stylized, opaque sculpt, the way an animated feature builds a silver swept-back cut:
//   one smooth dome shell over the scalp (the mass: lifted at the front hairline, swept up and back over the crown, full
//   at the temples and over the tops of the ears, short neat sides and nape), its edge a soft rounded roll that meets
//   the skin on the hairline (no root band, no scalp gap), and on it a dozen large smooth clump shells with rounded
//   cross-sections and soft rounded tips: the top and side clumps swept from the hairline back over the crown, a lower
//   tier at the back combed down to the nape, the top tier's tips laid over it.
//   Colour by vertex (COLOR_0): bright silver-white on the clumps, cool silver lowlights in the grooves between them and
//   toward their edges; low-frequency only (no per-strand texture), a smooth satin material for a broad highlight.
// Round 4 (the owner: "between the old jagged cards and this helmet"; the critic: a ribbed meringue of ~15 identical,
// evenly spaced, mirror-symmetric ribs, tight to the sides like a bob wig, sitting low on the forehead, flat paper-white):
//   fewer, bigger locks of uneven width (six on top), a slight side part on his left with the main mass swept up, back
//   and across to his right; each lock broken into two to four soft sub-locks and fine strand ridges, their tips
//   fingered (uneven ends), a few thin flyaway wisps; the front edge raised and softly irregular, the quiff lifted, the
//   sides and back trimmed closer (the ears and the line behind them read); cool silver-grey lowlights in the grooves
//   and underside (about a quarter darker than the highlights), a lower white albedo, and a soft anisotropic sheen along
//   the sweep (KHR_materials_anisotropy: UVs and tangents run along each lock).
// Every point rides the head bone (weight 1). Original procedural work (no assets), CC0.
import { prim, sm, clamp } from '../young-hero/glb.mjs';
import { hairArea } from './strands.mjs';
import { require } from '../young-hero/glb.mjs';
const { KHRMaterialsAnisotropy } = require('@gltf-transform/extensions');

const D2R = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// the two direction charts from the skull's centre: Z (polar axis forward, for the swept-back tier: psi round the axis
// from the top, alpha from the front) and Y (polar axis up, for the back tier: beta round from the back, gamma from the top)
const dirZ = (psi, alpha) => [Math.sin(alpha) * Math.sin(psi), Math.sin(alpha) * Math.cos(psi), Math.cos(alpha)];
const dirY = (beta, gamma) => [Math.sin(gamma) * Math.sin(beta), Math.cos(gamma), -Math.sin(gamma) * Math.cos(beta)];
// (a chart whose pole points forward and down, into the face: its meridians leave the front hairline spread out (no
// fan of ribs meeting over the forehead) and meet behind the crown, where the swept tier's tips lie)
const chartT = (axis) => { const e3 = norm(axis), e1 = [1, 0, 0], e2 = norm([e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]]);
  return (psi, alpha) => { const a = Math.sin(alpha) * Math.sin(psi), b = Math.sin(alpha) * Math.cos(psi), c = Math.cos(alpha); return [0, 1, 2].map((k) => a * e1[k] + b * e2[k] + c * e3[k]); }; };

export function hairClumpsPass(doc, K = {}) {
  K = { c: [0, 1.645, 0.035], front: 0.052, temple: 0.006, edgeW: 0.014, edgeWSide: 0.008, sinkOut: 0.0035,
    base: 0.008, top: 0.016, quiff: 0.016, quiffDir: [0.1, 0.74, 0.66], crown: 0.002, side: 0, sideTrim: 0.5, backTrim: 0.4, nape: 0.6, widen: 0,
    clumpH: 0.0065, cut: 0.06, skinEdge: [0.62, 0.42, 0.33], fadeW: 0.0035, backH: 0.0035, tone: [0.68, 0.695, 0.73], low: [0.22, 0.25, 0.31], roll: 0.88, rough: 0.42,
    groove: 0.4, fine: 0.0004, edgeJit: 0.0025, aniso: 0.55, flyaways: 1, ...K };
  const C = K.c, R = doc.getRoot();
  // ---- the scalp: rays from the skull's centre to the head's skin (the first hit)
  const sk = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const SP = sk.getAttribute('POSITION').getArray(), SI = sk.getIndices().getArray(), tris = [];
  for (let t = 0; t < SI.length; t += 3) { const a = SI[t], b = SI[t + 1], c = SI[t + 2]; if (SP[a * 3 + 1] < 1.5 || SP[b * 3 + 1] < 1.5 || SP[c * 3 + 1] < 1.5) continue; if (Math.abs(SP[a * 3]) > 0.13) continue; tris.push(a, b, c); }
  const TA = new Float32Array(tris.length * 3); for (let i = 0; i < tris.length; i++) for (let k = 0; k < 3; k++) TA[i * 3 + k] = SP[tris[i] * 3 + k];
  const ray = (d) => { let best = Infinity;
    for (let i = 0; i < TA.length; i += 9) {
      const e1x = TA[i + 3] - TA[i], e1y = TA[i + 4] - TA[i + 1], e1z = TA[i + 5] - TA[i + 2], e2x = TA[i + 6] - TA[i], e2y = TA[i + 7] - TA[i + 1], e2z = TA[i + 8] - TA[i + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, tx = C[0] - TA[i], ty = C[1] - TA[i + 1], tz = C[2] - TA[i + 2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt > 0.02 && tt < best) best = tt; }
    return best; };
  // ---- the dome on a Z-chart grid: scalp radius, hair mask, signed distance to the hairline, the shell's thickness
  const NP = 180, NA = 121, dP = 360 / NP, dA = 180 / (NA - 1), G = NP * NA;
  const Rs = new Float32Array(G).fill(NaN), Mk = new Float32Array(G), Px = new Float32Array(G * 3);
  for (let j = 0; j < NA; j++) for (let i = 0; i < NP; i++) { const g = j * NP + i, d = dirZ((-180 + i * dP) * D2R, j * dA * D2R);
    if (d[1] < -0.75) continue; const r = ray(d); if (!Number.isFinite(r)) continue; Rs[g] = r;
    const p = [C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r]; Px.set(p, g * 3); Mk[g] = hairArea(p[0], p[1], p[2], 0, K.front, K.temple); }
  // (the hairline's signed distance: + inside the hair, metres on the scalp, to the nearest cell across the 0.5 line)
  const E = new Float32Array(G).fill(NaN), W = 14;
  for (let j = 0; j < NA; j++) for (let i = 0; i < NP; i++) { const g = j * NP + i; if (Number.isNaN(Rs[g])) continue; const ins = Mk[g] >= K.cut; let best = 0.03;
    for (let b = -W; b <= W; b++) { const jj = j + b; if (jj < 0 || jj >= NA) continue; for (let a = -W; a <= W; a++) { const h = jj * NP + ((i + a + NP) % NP); if (Number.isNaN(Rs[h]) || (Mk[h] >= K.cut) === ins) continue;
        const dd = Math.hypot(Px[g * 3] - Px[h * 3], Px[g * 3 + 1] - Px[h * 3 + 1], Px[g * 3 + 2] - Px[h * 3 + 2]); if (dd < best) best = dd; } }
    E[g] = ins ? best : -best; }
  const Q = norm(K.quiffDir), gd = (d, a, w) => Math.exp(-((1 - dot(d, a)) / w));
  const thick = (d) => { const ax = Math.abs(d[0]);
    let t = K.base + K.top * sm(0.15, 0.85, d[1]) + K.quiff * gd(d, Q, 0.12) + K.crown * gd(d, norm([0, 0.8, -0.6]), 0.15) + K.side * sm(0.45, 0.85, ax) * sm(-0.35, 0.15, d[1]) * sm(-0.4, 0.3, d[2]);
    // (round 4: the sides and the back closer to the head: the volume in the lifted front and top)
    t *= 1 - K.sideTrim * sm(0.5, 0.9, ax) * sm(0.45, 0.0, d[1]);
    t *= 1 - K.backTrim * sm(-0.2, -0.7, d[2]) * sm(0.7, 0.2, d[1]);
    return t * (1 - K.nape * sm(-0.15, -0.65, d[1])); };
  // the edge's roll: the dome rises off the hairline in a rounded bullnose (wider at the front, where the swoop lifts)
  const edgeW = (d) => K.edgeWSide + (K.edgeW - K.edgeWSide) * sm(0.1, 0.6, d[2]) * sm(0.0, 0.5, d[1]);
  const roll = (e, w) => (e <= 0 ? 0 : e >= w ? 1 : Math.sin((e / w) * Math.PI / 2) ** K.roll);
  // bilinear lookups on the grid by direction
  const look = (A, d) => { const alpha = Math.acos(clamp(d[2], -1, 1)) / D2R, psi = Math.atan2(d[0], d[1]) / D2R; const fj = alpha / dA, fi = (psi + 180) / dP;
    const j0 = Math.max(0, Math.min(NA - 2, Math.floor(fj))), i0 = Math.floor(fi), tj = clamp(fj - j0), ti = fi - i0; let s = 0, w = 0;
    for (const [jj, wj] of [[j0, 1 - tj], [j0 + 1, tj]]) for (const [ii, wi] of [[i0, 1 - ti], [i0 + 1, ti]]) { const v = A[jj * NP + ((ii % NP) + NP) % NP]; if (Number.isNaN(v)) continue; s += v * wj * wi; w += wj * wi; }
    return w > 0.05 ? s / w : NaN; };
  // the dome's outer radius and its local relief scale (0 at and outside the hairline, 1 inside the roll)
  const wob = (d) => { const a = Math.atan2(d[0], d[2]); return K.edgeJit * (0.55 * Math.sin(a * 7 + 0.6) + 0.3 * Math.sin(a * 13 + 2.1) + 0.15 * Math.sin(a * 23 + 4.0)) * sm(-0.2, 0.4, d[2]); };
  const dome = (d) => { const r = look(Rs, d), e0 = look(E, d); if (Number.isNaN(r) || Number.isNaN(e0)) return null; const e = e0 + wob(d);
    const f = roll(e, edgeW(d)); return { r: e > 0 ? r + thick(d) * f : r - K.sinkOut * clamp(-e / 0.003), f, e }; };

  // ---- the geometry, gathered into one primitive
  const pos = [], nrm = [], col = [], idx = [], uvs = [], tan = [];
  // a grid surface (nu x nv) from a point function; normals from the grid, turned outward from the skull's centre;
  // UV u and the tangent run along v (each lock's run: the sweep), for the anisotropic sheen
  const surface = (nu, nv, at, colour) => { const base = pos.length / 3, P = [], ok = [];
    for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) { const q = at(u, v); ok.push(!!q); P.push(q ? q.p : [NaN, NaN, NaN]); }
    for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) { const k = v * nu + u, p = P[k];
      const g = (uu, vv) => P[Math.max(0, Math.min(nv - 1, vv)) * nu + Math.max(0, Math.min(nu - 1, uu))];
      const pu1 = g(u + 1, v), pu0 = g(u - 1, v), pv1 = g(u, v + 1), pv0 = g(u, v - 1);
      const fu = [0, 1, 2].map((c) => (Number.isNaN(pu1[0]) ? p : pu1)[c] - (Number.isNaN(pu0[0]) ? p : pu0)[c]), fv = [0, 1, 2].map((c) => (Number.isNaN(pv1[0]) ? p : pv1)[c] - (Number.isNaN(pv0[0]) ? p : pv0)[c]);
      let n = norm([fu[1] * fv[2] - fu[2] * fv[1], fu[2] * fv[0] - fu[0] * fv[2], fu[0] * fv[1] - fu[1] * fv[0]]); const out = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
      if (!Number.isFinite(n[0]) || Number.isNaN(p[0])) n = norm(out); else if (dot(n, out) < 0) n = n.map((x) => -x);
      // (the tangent: the run's direction, made perpendicular to the normal)
      let tg = norm(fv); const tn = dot(tg, n); tg = norm([tg[0] - n[0] * tn, tg[1] - n[1] * tn, tg[2] - n[2] * tn]); if (!Number.isFinite(tg[0])) tg = norm([n[1], -n[0], 0.0001]);
      pos.push(...(Number.isNaN(p[0]) ? [C[0], C[1], C[2]] : p)); nrm.push(...n); col.push(...(ok[k] ? colour(u, v) : [0, 0, 0]), 1);
      uvs.push(v / Math.max(1, nv - 1), u / Math.max(1, nu - 1)); tan.push(...tg, 1); }
    let nt = 0;
    for (let v = 0; v < nv - 1; v++) for (let u = 0; u < nu - 1; u++) { const a = v * nu + u, b = a + 1, c = a + nu, d = c + 1; if (!ok[a] || !ok[b] || !ok[c] || !ok[d]) continue;
      // (wound so the face's normal points outward)
      const pa = P[a], pb = P[b], pc = P[c], e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]], fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const flip = dot(fn, [pa[0] - C[0], pa[1] - C[1], pa[2] - C[2]]) < 0;
      if (flip) idx.push(base + a, base + c, base + b, base + b, base + c, base + d); else idx.push(base + a, base + b, base + c, base + b, base + d, base + c); nt += 2; }
    return nt; };
  const lin = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
  // (1) the dome shell (the lowlight colour: it shows in the grooves; a little lighter where it rolls onto the hairline)
  // (the outer 3.5 mm of the roll fades to the skin's own tone: the hairline is a soft edge, not a cut line)
  const shellCol = (d, f, e) => lin(K.skinEdge, lin(K.low, K.tone, 0.3 + 0.4 * (1 - f)), sm(0, K.fadeW, e));
  let ntri = surface(NP + 1, NA, (u, v) => { const d = dirZ((-180 + (u % NP) * dP) * D2R, v * dA * D2R), q = dome(d); if (!q || q.e < -0.004) return null; return { p: [C[0] + d[0] * q.r, C[1] + d[1] * q.r, C[2] + d[2] * q.r], d, f: q.f }; },
    (u, v) => { const d = dirZ((-180 + (u % NP) * dP) * D2R, v * dA * D2R), q = dome(d); return shellCol(d, q ? q.f : 0, q ? q.e : 0); });
  // (2) the locks: each a strip across s in [-1, 1] (a rounded cross-section, its edges sunk into the dome) along its run,
  // broken into nsub soft sub-locks (grooves between them that drift a little along the run) with fine strand ridges on
  // top; each sub-lock ends at its own length (fingered, uneven tips); height scaled by the dome's roll (it grows out of the
  // hairline's roll, never off the skin)
  let nclump = 0, seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clump = (chart, cA, cB, w0, a0, a1, H, tipLen, tone, lift = 0, sweep = 0, o = {}) => {
    const nsub = o.nsub ?? 3, NU = 12 * nsub + 5, NV = Math.max(16, Math.round(Math.abs(a1 - a0) / 0.8)), span = a1 - a0;
    const ends = Array.from({ length: nsub }, () => 1 - (o.finger ?? 0.16) * rnd()), ph = Array.from({ length: nsub + 1 }, () => rnd() * 6.28);
    const fph = rnd() * 6.28, fq = 9 + 5 * rnd(), front = o.front ?? 0, hsub = Array.from({ length: nsub }, () => 0.8 + 0.4 * rnd());
    const sub = (s, t) => { const x = ((s + 1) / 2) * nsub + 0.18 * Math.sin(t * 5 + ph[0]); const k = Math.max(0, Math.min(nsub - 1, Math.floor(x))); return { k, f: x - Math.floor(x) }; };
    const at = (u, v) => { const s = -1 + (2 * u) / (NU - 1), t = v / (NV - 1), a = a0 + span * t;
      const { k, f: sf } = sub(s, t), te = ends[k], tl = tipLen * te;
      const tipT = clamp((t - (te - tl)) / tl), wt = Math.sqrt(Math.max(0, 1 - tipT * tipT)), w = w0 * Math.sqrt(Math.max(0, 1 - clamp((t - (1 - tipLen)) / tipLen) ** 2)) * (1 - 0.12 * t);
      const cc = cA + (cB - cA) * t + sweep * Math.pow(t, 1.4), ang = cc + s * w;
      const d = chart(ang * D2R, a * D2R), q = dome(d); if (!q || q.e < -0.003) return null;
      const prof = Math.sqrt(Math.max(0, 1 - s * s)), grooveV = nsub > 1 ? Math.pow(Math.sin(Math.PI * sf), 0.6) : 1;
      const fine = Math.sin(s * fq * Math.PI + fph + 2.2 * Math.sin(t * 3.1 + ph[k + 1])) * 0.5 + 0.5;
      const lf = front * Math.exp(-(((t - 0.12) / 0.14) ** 2));
      let h = (H * hsub[k] * (0.72 + 0.28 * wt) * (1 - K.groove * (1 - grooveV)) + lift * tipT + lf) * prof * q.f + K.fine * fine * prof * wt * q.f;
      h = h * wt - 0.0016 * (1 - prof) - (q.f < 0.05 ? 0.002 : 0) - (t > te ? 0.003 : 0);
      return { p: [C[0] + d[0] * (q.r + h), C[1] + d[1] * (q.r + h), C[2] + d[2] * (q.r + h)] }; };
    const colour = (u, v) => { const s = -1 + (2 * u) / (NU - 1), t = v / (NV - 1), prof = Math.sqrt(Math.max(0, 1 - s * s)), { k, f: sf } = sub(s, t);
      const grooveV = nsub > 1 ? Math.pow(Math.sin(Math.PI * sf), 0.6) : 1, fine = Math.sin(s * fq * Math.PI + fph + 2.2 * Math.sin(t * 3.1 + ph[k + 1])) * 0.5 + 0.5;
      const tipT = clamp((t - (ends[k] - tipLen * ends[k])) / (tipLen * ends[k]));
      // (bright on the lock's crown, cool silver-grey in the grooves, the underside and toward the tips; a light strand streak)
      let c = lin(K.low, tone, clamp(0.1 + 0.9 * Math.pow(prof, 0.9) * (0.45 + 0.55 * grooveV) * (1 - 0.3 * tipT)));
      return c.map((x, i) => Math.min(1, x * (0.93 + 0.12 * fine) * (i === 2 ? 1.01 : 1))); };
    ntri += surface(NU, NV, at, colour); nclump++; };
  const tB = (k) => K.tone.map((x) => x * k);
  // the back tier first (under), combed down from the crown to the nape: five uneven locks
  for (const [b, w, k, sw] of K.back || [[-72, 20, 0.95, -6], [-36, 17, 0.99, -3], [-2, 20, 1.0, 2], [33, 16, 0.96, 4], [68, 21, 0.97, 6]])
    clump(dirY, b, b * 1.08, w, 50, 124 + 6 * rnd(), K.backH, 0.3, tB(k), 0, sw, { nsub: 3, finger: 0.12 });
  // the swept tier: from the hairline up and back over the crown, a slight side part on his left (psi ~ +42): the main mass
  // to the part's right swept across toward his right as it goes back, the narrow side section beyond the part swept
  // back and down toward his left ear; psi from the top (+ his left)
  const dirT = chartT(K.axis || [0, -0.55, 0.83]);
  // [psi, half-width, end alpha, sweep, start alpha, height scale, sub-locks]
  const SW = K.clumps || [
    [-124, 15, 140, -4, 31, 0.75, 3], [-94, 17, 148, -6, 29, 0.85, 3], [-60, 19, 156, -10, 30, 1.0, 4], [-26, 18, 162, -12, 28, 1.1, 4],
    [8, 20, 164, -12, 27, 1.15, 4], [32, 11, 160, -8, 30, 0.95, 2],
    [56, 13, 154, 9, 33, 0.85, 3], [86, 15, 148, 7, 31, 0.85, 3], [120, 15, 140, 5, 32, 0.75, 3]];
  SW.forEach(([p, w, a1, sw, a0, hs, ns]) => clump(dirT, p, p, w, a0, a1, K.clumpH * hs, 0.24, tB(0.97 + 0.04 * rnd()), 0.0012, sw, { nsub: ns, finger: 0.14 }));
  // the front: three big uneven locks lifted off the hairline (the quiff) and laid back over the top, swept toward his right
  const LK = K.locks || [[-30, 15, 118, -14, 0.0035], [-3, 17, 128, -14, 0.0045], [22, 12, 120, -11, 0.003]];
  LK.forEach(([p, w, a1, sw, fr]) => clump(dirT, p, p, w, 29 + 3 * rnd(), a1, K.lockH ?? 0.0075, 0.32, tB(1.0), 0.0015, sw, { nsub: 3, finger: 0.2, front: fr }));
  // (3) a few flyaway wisps: thin tapered tubes leaving the locks' surface and arcing up and back off it
  let nfly = 0;
  const tube = (pts, r0, r1, tone) => { const base = pos.length / 3, ns = 5, m = pts.length;
    for (let i = 0; i < m; i++) { const p = pts[i], q = pts[Math.min(m - 1, i + 1)], o = pts[Math.max(0, i - 1)], tg = norm([q[0] - o[0], q[1] - o[1], q[2] - o[2]]);
      let a = norm([tg[1] * 0 - tg[2] * 1, tg[2] * 0 - tg[0] * 0, tg[0] * 1 - tg[1] * 0]); if (!Number.isFinite(a[0])) a = [1, 0, 0];
      const b = norm([tg[1] * a[2] - tg[2] * a[1], tg[2] * a[0] - tg[0] * a[2], tg[0] * a[1] - tg[1] * a[0]]), r = r0 + (r1 - r0) * (i / (m - 1));
      for (let j = 0; j < ns; j++) { const th = (j / ns) * Math.PI * 2, nn = [0, 1, 2].map((k) => a[k] * Math.cos(th) + b[k] * Math.sin(th));
        pos.push(...p.map((x, k) => x + nn[k] * r)); nrm.push(...nn); col.push(...tone, 1); uvs.push(i / (m - 1), j / ns); tan.push(...tg, 1); } }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < ns; j++) { const a = base + i * ns + j, b = base + i * ns + ((j + 1) % ns), c = a + ns, d = b + ns; idx.push(a, c, b, b, c, d); ntri += 2; }
    nfly++; };
  const wisp = (psi, a0, len, up, side, tone) => { const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, a = a0 + len * t, d = dirT((psi + side * t * t) * D2R, a * D2R), q = dome(d); if (!q) return; const h = K.clumpH * 0.9 + up * t * t;
      pts.push([C[0] + d[0] * (q.r + h), C[1] + d[1] * (q.r + h), C[2] + d[2] * (q.r + h)]); }
    tube(pts, 0.00045, 0.00012, tone); };
  if (K.flyaways) for (const [psi, a0, len, up, side] of K.wisps || [[-8, 70, 30, 0.006, -6], [14, 82, 26, 0.008, 5], [-40, 95, 30, 0.005, -8], [40, 100, 22, 0.006, 6],
    [-18, 120, 26, 0.007, -4], [2, 135, 22, 0.005, 3], [-100, 105, 24, 0.004, -5], [96, 110, 22, 0.0035, 5], [-65, 60, 20, 0.004, -4], [62, 64, 18, 0.0035, 4]])
    wisp(psi, a0, len, up, side, tB(0.98));
  // ---- out with the cards and their cap; the sculpt in the hair mesh, on the head bone
  const hm = R.listMeshes().find((m) => m.listPrimitives().some((p) => /^(hair|hairCap)$/.test(p.getMaterial()?.getName() || '')));
  if (!hm) throw new Error('hairClumps: no hair mesh');
  const tmpl = hm.listPrimitives()[0], J0 = tmpl.getAttribute('JOINTS_0'), skin = R.listSkins()[0], hj = skin.listJoints().findIndex((j) => j.getName() === 'head');
  if (hj < 0) throw new Error('hairClumps: no head joint');
  const tn = tmpl.listTargets().map((t) => t.getName()), nt = tn.length, buf = R.listBuffers()[0], J16 = hj > 255 || J0?.getArray() instanceof Uint16Array;
  for (const p of hm.listPrimitives()) if (/^(hair|hairCap)$/.test(p.getMaterial()?.getName() || '')) { hm.removePrimitive(p); p.dispose(); }
  const n = pos.length / 3, J = new (J16 ? Uint16Array : Uint8Array)(n * 4), Wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { J[i * 4] = hj; Wt[i * 4] = 1; }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('hairClumps').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(K.rough).setMetallicFactor(0).setDoubleSided(false)
    .setExtras({ look: { hair: 'sculpt', note: 'stylized clump locks, colour by vertex, a soft sheen along the sweep' } });
  if (K.aniso > 0) { const ext = doc.createExtension(KHRMaterialsAnisotropy); mat.setExtension('KHR_materials_anisotropy', ext.createAnisotropy().setAnisotropyStrength(K.aniso).setAnisotropyRotation(0)); }
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', n > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)))
    .setAttribute('POSITION', acc('VEC3', Float32Array.from(pos))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm))).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(col)))
    .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(uvs))).setAttribute('TANGENT', acc('VEC4', Float32Array.from(tan)))
    .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', Wt));
  for (let t = 0; t < nt; t++) p.addTarget(doc.createPrimitiveTarget(tn[t] || 't' + t).setAttribute('POSITION', acc('VEC3', new Float32Array(n * 3))));
  hm.addPrimitive(p);
  let ins = 0, cells = 0; for (let g = 0; g < G; g++) if (!Number.isNaN(E[g])) { cells++; if (E[g] > 0) ins++; }
  console.log('hair clumps: scalp rays', cells, 'in the hair', ins, '; locks', nclump, '; wisps', nfly, '; points', n, 'triangles', ntri, '; anisotropy', K.aniso);
}
