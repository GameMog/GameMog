// Hand-built young mother, pass 4 (age): after pass 3 she still read as a girl of 12-14, not a woman of about 30. The
// child cues were the proportions (a short lower face, a round full cheek and jaw, round wide-open eyes, a short soft
// nose), a bare face, a hard cut-out hairline and a cone-tipped bust under the fleece.
//  faceAgePass   vertex fields on the shared body buffer (skin, eyes, brows, lashes and teeth move together), head-
//                weighted, symmetric, smooth; the mouth's 1.2 cm kept still so the carried mouth landmarks hold
//  agePaintPass  adult skin and make-up on the skin texture: soft contour under the cheekbone and along the jaw, faint
//                nasolabial lines, a little under-eye softness, very light pores, a deeper lid shadow and lash line,
//                nude-rose lips with a defined cupid's bow and a liner edge
//  hairSoftPass  the hairline graded: the skin just outside the hair's cut-out (front and temples) darkened toward the
//                hair's tone over ~4 mm, so the cut-out never lies on bare skin
//  bustApexPass  the hoodie's apex at each side rounded (a shrink-smoothing field peaking at the tip, then Taubin), its
//                normals rebuilt and averaged wide, the normal map's pucker there flattened, so the fleece drapes as one soft rounded shape from the front
import { body, prim, matOf, rgba, setWebp, fbm, noise3, h3, sm } from '../young-hero/glb.mjs';
import { texelPos, flattenNormals } from './p2.mjs';

const MY = 1.437, MZ = 0.142;
const g = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));

// the face (her bind frame, metres; profile: chin 1.395, stomion 1.437, subnasale 1.454, nose tip 1.468 z 0.156, nasion
// 1.50): the lower face 4 mm longer (the chin and the jaw's underside down, the chin 1 mm forward), the jaw's angle 2 mm
// lower and a touch out (a defined jawline), the lower cheek's baby fullness 2 mm in, a hollow under the cheekbone
// (1.5 mm), the cheekbone 1 mm out and up, the nose's bridge 0.7 mm higher and its tip 0.9 mm lower (a longer, stronger
// nose), the lower lid 0.6 mm up (a less round eye)
export function faceAgePass(doc, K = {}) {
  K = { chin: 0.0055, chinZ: 0.0012, jaw: 0.0025, full: 0.0035, hollow: 0.0022, bone: 0.0012, bridge: 0.0008, tip: 0.001, lid: 0.0009, hood: 0.0005, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^(head|neck)/), n = a.length / 3;
  let moved = 0, maxd = 0;
  for (let v = 0; v < n; v++) { if (head[v] < 0.2) continue; const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0), sx = Math.sign(x0) || 1;
    if (y > 1.54 || y < 1.33 || z < -0.01) continue;
    const still = sm(0.009, 0.015, Math.hypot(x / 1.5, y - MY, (z - MZ) / 1.4));
    // (the lower face: everything under the mouth's corners, more at the chin's bottom; behind z 0.03 (the neck) fades)
    const low = sm(MY - 0.008, MY - 0.03, y) * sm(0.02, 0.07, z) * (1 - sm(0.06, 0.075, x));
    const chinF = g(x0, y - 1.405, 0, 0.018, 0.012, 1) * sm(0.1, 0.13, z);
    const jaw = g(x - 0.058, y - 1.412, z - 0.05, 0.018, 0.016, 0.03);
    const full = g(x - 0.052, y - 1.432, z - 0.1, 0.014, 0.016, 0.02), hol = g(x - 0.05, y - 1.452, z - 0.1, 0.01, 0.009, 0.014);
    const bone = g(x - 0.054, y - 1.48, z - 0.103, 0.012, 0.008, 0.014);
    const bridge = g(x0, y - 1.493, z - 0.142, 0.007, 0.01, 0.01), tip = g(x0, y - 1.464, z - 0.152, 0.012, 0.009, 0.012) * sm(1.452, 1.458, y);
    const lid = g(x - 0.033, y - 1.494, z - 0.132, 0.012, 0.0035, 0.01), hood = g(x - 0.035, y - 1.507, z - 0.13, 0.013, 0.003, 0.012);
    let dx = sx * (-K.full * full - 0.7 * K.hollow * hol + K.bone * bone * 0.7 + 0.4 * K.jaw * jaw);
    let dy = -K.chin * low - K.jaw * jaw + K.bone * bone * 0.6 - K.tip * tip + K.lid * lid - K.hood * hood;
    let dz = K.chinZ * chinF - 0.5 * K.full * full - 0.7 * K.hollow * hol + K.bridge * bridge + 0.4 * K.lid * lid + 0.5 * K.hood * hood;
    const s = still * Math.min(1, head[v] / 0.6), d = Math.hypot(dx, dy, dz) * s; if (d < 1e-6) continue;
    a[v * 3] += dx * s; a[v * 3 + 1] += dy * s; a[v * 3 + 2] += dz * s; moved++; maxd = Math.max(maxd, d); }
  if (!a.every(Number.isFinite)) throw new Error('face age: a non-finite position');
  P.setArray(a); console.log('face age: moved', moved, 'max mm', (maxd * 1000).toFixed(2));
}

// the paint (linear light; each texel from its bind position, the face's features at their pass-4 places)
export async function agePaintPass(doc, K = {}) {
  K = { contour: 0.14, fold: 0.1, under: 0.07, lid: 0.12, liner: 0.35, lips: 1, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const mix = (c, t, w) => c * (1 - w) + t * w;
  const rose = [lin(150), lin(84), lin(80)], liner = [lin(112), lin(56), lin(54)];
  let n = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(X) || head[i] < 0.5 || z < 0.02 || y < 1.37 || y > 1.53) continue;
    const x = Math.abs(X); let r = lin(d[i * 4]), gg = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]); const r0 = r;
    const nz = 0.8 + 0.4 * fbm(X, y, z, 90);
    // contour: a soft shade in the hollow under the cheekbone, sloping down toward the mouth's corner, and under the jaw's edge
    const t = (y - 1.45) + 0.35 * (x - 0.055), cont = g(t, 0, 0, 0.007, 1, 1) * sm(0.03, 0.045, x) * (1 - sm(0.068, 0.078, x)) * sm(1.43, 1.44, y) * (1 - sm(1.47, 1.476, y)) * sm(0.07, 0.09, z);
    const jawSh = sm(1.425, 1.41, y) * sm(0.035, 0.06, x) * (1 - sm(0.07, 0.08, x)) * sm(0.03, 0.06, z) * 0.7;
    // nasolabial: from the nose's wing (x 0.017, y 1.458) to beside the mouth's corner (x 0.028, y 1.432), a faint soft line
    const u = (y - 1.458) / (1.432 - 1.458), xl = 0.018 + 0.011 * u, fold = u > -0.1 && u < 1.15 ? g(x - xl, 0, 0, 0.0018, 1, 1) * sm(-0.1, 0.15, u) * (1 - sm(0.85, 1.15, u)) * sm(0.11, 0.13, z) : 0;
    // under-eye softness: a faint cool-brown crescent under the lower lid
    const und = g(x - 0.033, y - 1.487, z - 0.13, 0.011, 0.0035, 0.02) * (1 - sm(1.492, 1.494, y));
    // lid shadow up to the crease (soft taupe), and the upper lash line (thin, darker out)
    const lidS = g(x - 0.033, y - 1.507, 0, 0.012, 0.004, 1) * sm(0.11, 0.125, z) * (1 - sm(0.05, 0.056, x));
    const lash = g(x - 0.034, y - 1.5025, 0, 0.011 + 0.003 * sm(0.03, 0.045, x), 0.0011, 1) * sm(0.12, 0.13, z) * (0.6 + 0.4 * sm(0.025, 0.045, x));
    const dark = K.contour * nz * Math.max(cont, jawSh) + K.fold * fold + K.under * und;
    r *= 1 - dark * 0.9; gg *= 1 - dark * 1.05; b *= 1 - dark * 0.95;
    r *= 1 - K.lid * lidS * 0.9; gg *= 1 - K.lid * lidS * 1.2; b *= 1 - K.lid * lidS * 1.0;
    r = mix(r, lin(40), K.liner * lash); gg = mix(gg, lin(28), K.liner * lash); b = mix(b, lin(26), K.liner * lash);
    // lips: a cupid's bow upper border (peaks at x 5.5 mm), the lower lip's border, nude rose inside, a liner at the edge
    if (x < 0.028 && y > 1.422 && y < 1.456 && z > 0.13) {
      const top = 1.4475 + 0.0016 * g(x - 0.0055, 0, 0, 0.004, 1, 1) - 0.0006 * g(x, 0, 0, 0.0018, 1, 1) - 0.009 * sm(0.008, 0.025, x) ** 1.3, bot = 1.4285 + 0.0075 * sm(0.006, 0.024, x) ** 1.4;
      const ins = sm(top + 0.0007, top - 0.0005, y) * sm(bot - 0.0007, bot + 0.0005, y) * (1 - sm(0.022, 0.026, x));
      const edge = ins * (1 - sm(0.0004, 0.0016, Math.min(Math.abs(y - top), Math.abs(y - bot)))), cen = ins * g(x, y - MY, 0, 0.012, 0.004, 1);
      if (ins > 0) { const w = 0.55 * ins * K.lips; r = mix(r, rose[0] * (0.85 + 0.3 * (r0 / (r0 + 0.05))), w); gg = mix(gg, rose[1], w); b = mix(b, rose[2], w);
        r = mix(r, liner[0], 0.45 * edge); gg = mix(gg, liner[1], 0.45 * edge); b = mix(b, liner[2], 0.45 * edge);
        r *= 1 + 0.12 * cen; gg *= 1 + 0.1 * cen; b *= 1 + 0.1 * cen; } }
    // very light pores (cheeks, nose, chin): a fine speckle
    const pz = sm(0.03, 0.05, x) * (1 - sm(0.065, 0.075, x)) * sm(1.44, 1.45, y) * (1 - sm(1.485, 1.49, y)) + g(x, y - 1.466, 0, 0.012, 0.008, 1);
    if (pz > 0) { const pr = h3(Math.floor(X * 6000), Math.floor(y * 6000), Math.floor(z * 6000)); if (pr < 0.08) { const k = 1 - 0.05 * Math.min(1, pz); r *= k; gg *= k; b *= k; } }
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(gg); d[i * 4 + 2] = enc(b); n++; }
  await setWebp(tex, d, S, S, 90);
  // (the height in the normal map: the nasolabial fold and the cheek hollow a little deeper, so the study light finds them)
  console.log('age paint: texels', n);
}

// the hairline: every hair triangle (hair, hair-locks) near the scalp drawn into a map of directions from the head's
// centre (0.4 mm cells at the forehead); each forehead/temple skin texel's distance to the nearest covered cell; the skin
// within K.band of it blended toward the hair's tone (strongest at the edge, broken by a strand noise along the growth)
export async function hairSoftPass(doc, K = {}) {
  K = { band: 0.006, peak: 0.85, pw: 1.8, hair: [30, 22, 19], C: [0, 1.5, 0.02], cell: 0.004, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data, C = K.C;
  const ang = (x, y, z) => { const dx = x - C[0], dy = y - C[1], dz = z - C[2]; return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
  const A0 = -2.2, A1 = 2.2, E0 = -0.2, E1 = 1.3, W = Math.ceil((A1 - A0) / K.cell), H = Math.ceil((E1 - E0) / K.cell), cov = new Uint8Array(W * H);
  const cellOf = (p) => [Math.floor((p[0] - A0) / K.cell), Math.floor((p[1] - E0) / K.cell)];
  for (const name of ['hair', 'hair-locks']) for (const p of prim(doc, name)) {
    const pa = p.getAttribute('POSITION').getArray(), idx = p.getIndices().getArray();
    for (let q = 0; q < idx.length; q += 3) { const V = [idx[q], idx[q + 1], idx[q + 2]].map((v) => [pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]]);
      if (V.every((P) => P[2] < -0.02 || P[1] < 1.42)) continue;
      // (each triangle sampled on a barycentric grid fine enough for the cells)
      const c = V.map((P) => cellOf(ang(...P))), span = Math.max(...c.flatMap((u) => [Math.abs(u[0] - c[0][0]), Math.abs(u[1] - c[0][1])]), 1), st = Math.min(60, span + 1);
      for (let i = 0; i <= st; i++) for (let j = 0; j <= st - i; j++) { const l1 = i / st, l2 = j / st, l3 = 1 - l1 - l2;
        const P = [0, 1, 2].map((k) => l1 * V[0][k] + l2 * V[1][k] + l3 * V[2][k]), [cx, cy] = cellOf(ang(...P)); if (cx >= 0 && cy >= 0 && cx < W && cy < H) cov[cy * W + cx] = 1; } } }
  // (distance in cells, chamfer)
  const dist = new Float32Array(W * H).fill(1e9); for (let k = 0; k < W * H; k++) if (cov[k]) dist[k] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x; let m = dist[k]; if (x) m = Math.min(m, dist[k - 1] + 1); if (y) { m = Math.min(m, dist[k - W] + 1); if (x) m = Math.min(m, dist[k - W - 1] + 1.414); if (x < W - 1) m = Math.min(m, dist[k - W + 1] + 1.414); } dist[k] = m; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const k = y * W + x; let m = dist[k]; if (x < W - 1) m = Math.min(m, dist[k + 1] + 1); if (y < H - 1) { m = Math.min(m, dist[k + W] + 1); if (x < W - 1) m = Math.min(m, dist[k + W + 1] + 1.414); if (x) m = Math.min(m, dist[k + W - 1] + 1.414); } dist[k] = m; }
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2)))), hl = K.hair.map(lin);
  let n = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(X) || head[i] < 0.6 || y < 1.47 || z < -0.01) continue;
    const [cx, cy] = cellOf(ang(X, y, z)); if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    const R = Math.hypot(X - C[0], y - C[1], z - C[2]), mm = dist[cy * W + cx] * K.cell * R; if (mm > K.band) continue;
    const strand = 0.75 + 0.5 * noise3(X * 2500, y * 300, z * 2500), w = K.peak * Math.max(0, 1 - (mm * strand) / K.band) ** K.pw;
    for (let k = 0; k < 3; k++) d[i * 4 + k] = enc(lin(d[i * 4 + k]) * (1 - w) + hl[k] * w); n++; }
  await setWebp(tex, d, S, S, 90); console.log('hair soft: covered cells', cov.reduce((s, v) => s + v, 0), 'texels', n);
}

// the bust's apex: on the hoodie's welded surface, round each apex (the welded point with the most z on its side between
// y 1.04 and 1.22): K.shrink rounds of plain Laplacian (it shrinks: the tip comes down) weighted 1 at the tip and 0 by
// K.r, then Taubin rounds to even it out; the normals rebuilt and averaged over the region
export async function bustApexPass(doc, K = {}) {
  K = { r: 0.065, shrink: 100, taubin: 40, nIters: 30, seed: [0.108, 1.135], flat: true, ...K };
  const p = prim(doc, 'hoodie')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), idx = p.getIndices().getArray(), n = a.length / 3;
  const grp = new Map(), gid = new Int32Array(n), gk = (v) => `${Math.round(a[v * 3] * 2e3)},${Math.round(a[v * 3 + 1] * 2e3)},${Math.round(a[v * 3 + 2] * 2e3)}`;
  for (let v = 0; v < n; v++) { const k = gk(v); if (!grp.has(k)) grp.set(k, grp.size); gid[v] = grp.get(k); }
  const G = grp.size, gp = new Float64Array(G * 3), nb = Array.from({ length: G }, () => new Set());
  for (let v = 0; v < n; v++) { const gg = gid[v]; for (let k = 0; k < 3; k++) gp[gg * 3 + k] = a[v * 3 + k]; }
  for (let q = 0; q < idx.length; q += 3) for (let e = 0; e < 3; e++) { const u = gid[idx[q + e]], w = gid[idx[q + (e + 1) % 3]]; if (u !== w) { nb[u].add(w); nb[w].add(u); } }
  const ap = [1, -1].map((s) => { let best = -1, bz = -1; for (let gg = 0; gg < G; gg++) { const x = gp[gg * 3] * s, y = gp[gg * 3 + 1], z = gp[gg * 3 + 2]; if (Math.abs(x - K.seed[0]) < 0.015 && Math.abs(y - K.seed[1]) < 0.02 && z > bz) { bz = z; best = gg; } } return [gp[best * 3], gp[best * 3 + 1], gp[best * 3 + 2]]; });
  console.log('bust apex at', ap.map((c) => c.map((u) => u.toFixed(3)).join(',')));
  const wgt = new Float64Array(G); for (let gg = 0; gg < G; gg++) { if (gp[gg * 3 + 2] < 0.04) continue; let w = 0; for (const c of ap) w = Math.max(w, 1 - sm(0, K.r, Math.hypot(gp[gg * 3] - c[0], gp[gg * 3 + 1] - c[1], (gp[gg * 3 + 2] - c[2]) * 0.6))); wgt[gg] = w; }
  const step = (f, pw) => { const nx = gp.slice(); for (let gg = 0; gg < G; gg++) { if (!wgt[gg] || nb[gg].size < 3) continue; const m = [0, 0, 0]; for (const h of nb[gg]) for (let k = 0; k < 3; k++) m[k] += gp[h * 3 + k] / nb[gg].size;
    const w = f * wgt[gg] ** pw; for (let k = 0; k < 3; k++) nx[gg * 3 + k] = gp[gg * 3 + k] + w * (m[k] - gp[gg * 3 + k]); } gp.set(nx); };
  for (let it = 0; it < K.shrink; it++) step(0.5, 1.5);
  for (let it = 0; it < K.taubin; it++) { step(0.5, 1); step(-0.53, 1); }
  let maxd = 0; for (let v = 0; v < n; v++) { const gg = gid[v]; const dd = Math.hypot(gp[gg * 3] - a[v * 3], gp[gg * 3 + 1] - a[v * 3 + 1], gp[gg * 3 + 2] - a[v * 3 + 2]); maxd = Math.max(maxd, dd); for (let k = 0; k < 3; k++) a[v * 3 + k] = gp[gg * 3 + k]; }
  if (!a.every(Number.isFinite)) throw new Error('bust apex: a non-finite position');
  A.setArray(a); console.log('bust apex: max mm', (maxd * 1000).toFixed(2));
  const NA = p.getAttribute('NORMAL'), na = NA.getArray().slice(), gn = new Float64Array(G * 3);
  for (let q = 0; q < idx.length; q += 3) { const [i0, i1, i2] = [idx[q], idx[q + 1], idx[q + 2]].map((v) => gid[v]);
    const e1 = [0, 1, 2].map((k) => gp[i1 * 3 + k] - gp[i0 * 3 + k]), e2 = [0, 1, 2].map((k) => gp[i2 * 3 + k] - gp[i0 * 3 + k]), c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const gg of [i0, i1, i2]) for (let k = 0; k < 3; k++) gn[gg * 3 + k] += c[k]; }
  for (let gg = 0; gg < G; gg++) { const L = Math.hypot(gn[gg * 3], gn[gg * 3 + 1], gn[gg * 3 + 2]) || 1; for (let k = 0; k < 3; k++) gn[gg * 3 + k] /= L; }
  for (let it = 0; it < K.nIters; it++) { const nx = gn.slice(); for (let gg = 0; gg < G; gg++) { if (!wgt[gg] || !nb[gg].size) continue; const m = [0, 0, 0]; for (const h of nb[gg]) for (let k = 0; k < 3; k++) m[k] += gn[h * 3 + k];
    for (let k = 0; k < 3; k++) nx[gg * 3 + k] = gn[gg * 3 + k] + 0.6 * wgt[gg] * (m[k] / nb[gg].size - gn[gg * 3 + k]); } gn.set(nx); }
  const sc = NA.getNormalized() ? (na instanceof Int8Array ? 127 : 32767) : 1; let rn = 0;
  for (let v = 0; v < n; v++) { const gg = gid[v]; if (wgt[gg] <= 0) continue; const L = Math.hypot(gn[gg * 3], gn[gg * 3 + 1], gn[gg * 3 + 2]); if (!L) continue;
    const nw = [0, 1, 2].map((k) => gn[gg * 3 + k] / L), sgn = a[v * 3] * nw[0] + (a[v * 3 + 2] - 0.02) * nw[2] < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) na[v * 3 + k] = Math.round(sgn * nw[k] * sc); rn++; }
  NA.setArray(na); console.log('bust apex: normals', rn);
  // (and the fleece's normal map at the apex flattened flat out to 4 cm: its baked pucker drew the point too)
  if (K.flat) await flattenNormals(doc, 'hoodie', (x, y, z) => { if (z < 0.05) return 0; let w = 0; for (const c of ap) w = Math.max(w, sm(0.045, 0.02, Math.hypot(x - c[0], y - c[1], (z - c[2]) * 0.5))); return w; }, 40);
}
