// Jensen's face, caricature round 4 (the owner: "hair and mouth need a bit more work"; the critic: the close-up grin
// read as a one-sided smirk, the rest smile a pursed, puffy pad, the nose-to-mouth folds hard jagged gouges, the brows
// scratchy scribbles, the glasses' lower rims too thin to read at game distance):
//   symFacePass(doc)     the head's rest shape and every face morph made exact mirror twins: the relax pass (which eases
//                        folded triangles one side at a time) and the corner hole-fill points had left the smile pair
//                        2.3 mm and jawOpen 5 mm out of mirror at the mouth's corners: the open grin pulled to his left
//   foldSoftPass(doc)    the normal and colour maps eased round the nose-to-mouth folds, the mouth's corners and the
//                        chin (a wide blur, the relief flattened): one smooth broad crease per side, no gouges, no
//                        parallel lines, no dark wedges at the lower lip's corners
//   lipTonePass(doc)     the lips' front a little darker and toward the skin's own tone (not an applied pink pad)
//   browSoftPass(doc)    the brow cards' scratchy strand texture replaced by a soft, clean, slightly bushy dark-grey
//                        shape (the alpha blurred and re-cut, the colour flat with a gentle root-to-tip shade)
//   rimPass(doc)         the glasses' lens rims 1.5 x thicker (the tube inflated along its own normals) and opaque, a
//                        dark gunmetal, so the lenses read in a wide shot
// Original work (no assets), CC0.
import { matOf, rgba, setWebp, sharp, sm } from '../young-hero/glb.mjs';
import { skinMap } from '../facekit.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { twins } from './caricature.mjs';
import { LM } from './landmarks.mjs';

const primsOf = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());

export function symFacePass(doc, K = {}) {
  K = { y0: 1.43, y1: 1.47, tol: 0.002, ...K };
  const M = skinMap(doc), P = M.P.getArray().slice(), n = M.n, T = twins();
  const w = (v) => sm(K.y0, K.y1, P[v * 3 + 1]);
  const byMH = new Map(); for (let v = 0; v < n; v++) { const m = M.map[v]; if (m >= 0) (byMH.get(m) || byMH.set(m, []).get(m)).push(v); }
  const pairs = []; // [vertsA, vertsB] with B the mirror of A (A === B on the midline)
  for (const [m, A] of byMH) { const t = T[m]; if (t < 0 || t < m) continue; const B = byMH.get(t); if (!B) continue; if (w(A[0]) <= 0) continue; pairs.push([A, B]); }
  // (the points with no MakeHuman vertex (the hole fills at the mouth's corners and the neck): paired by position)
  const U = []; for (let v = 0; v < n; v++) if (M.map[v] < 0 && w(v) > 0) U.push(v);
  const usedU = new Set(); let up = 0;
  for (const a of U) { if (usedU.has(a)) continue; let best = K.tol, b = -1; const x = -P[a * 3], y = P[a * 3 + 1], z = P[a * 3 + 2];
    for (const c of U) { const d = Math.hypot(P[c * 3] - x, P[c * 3 + 1] - y, P[c * 3 + 2] - z); if (d < best) { best = d; b = c; } }
    if (b < 0) continue; usedU.add(a); usedU.add(b); pairs.push([[a], [b]]); up++; }
  // the rest shape
  let peak = 0;
  for (const [A, B] of pairs) { const a = A[0], b = B[0], f = w(a);
    const mid = [(P[a * 3] - P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2];
    peak = Math.max(peak, Math.hypot(P[a * 3] - mid[0], P[a * 3 + 1] - mid[1], P[a * 3 + 2] - mid[2]) * f);
    const na = [0, 1, 2].map((k) => P[a * 3 + k] + (mid[k] - P[a * 3 + k]) * f), nb = [-na[0], na[1], na[2]];
    for (const v of A) for (let k = 0; k < 3; k++) P[v * 3 + k] = na[k];
    for (const v of B) for (let k = 0; k < 3; k++) P[v * 3 + k] = nb[k]; }
  M.P.setArray(P);
  // the morphs: centre ones mirrored onto themselves, the Left/Right pairs onto each other
  const seen = new Set(); let nt = 0, before = 0;
  for (const p of primsOf(doc)) { if (p.getAttribute('POSITION') !== M.P) continue;
    const tg = Object.fromEntries(p.listTargets().map((t) => [t.getName(), t.getAttribute('POSITION')]));
    for (const [name, acc] of Object.entries(tg)) { if (!acc || seen.has(acc)) continue;
      const side = /Left$/.test(name) ? 'L' : /Right$/.test(name) ? 'R' : 'C'; if (side === 'R') continue;
      if (side === 'C') { seen.add(acc); const D = acc.getArray().slice();
        for (const [A, B] of pairs) { const a = A[0], b = B[0], f = w(a); const s = [(D[a * 3] - D[b * 3]) / 2, (D[a * 3 + 1] + D[b * 3 + 1]) / 2, (D[a * 3 + 2] + D[b * 3 + 2]) / 2];
          before = Math.max(before, Math.hypot(D[a * 3] + D[b * 3], D[a * 3 + 1] - D[b * 3 + 1], D[a * 3 + 2] - D[b * 3 + 2]));
          const da = [0, 1, 2].map((k) => D[a * 3 + k] + (s[k] - D[a * 3 + k]) * f), db = [-da[0], da[1], da[2]];
          for (const v of A) for (let k = 0; k < 3; k++) D[v * 3 + k] = da[k]; for (const v of B) for (let k = 0; k < 3; k++) D[v * 3 + k] = db[k]; }
        acc.setArray(D); nt++; continue; }
      const rn = name.replace(/Left$/, 'Right'), racc = tg[rn]; if (!racc || seen.has(racc)) continue; seen.add(acc); seen.add(racc);
      const L = acc.getArray().slice(), R = racc.getArray().slice(), L2 = L.slice(), R2 = R.slice();
      for (const [A, B] of pairs) { const a = A[0], b = B[0], f = w(a);
        // the left at a and the mirrored right at b describe the same motion; so do the left at b and the mirrored right at a
        const la = [(L[a * 3] - R[b * 3]) / 2, (L[a * 3 + 1] + R[b * 3 + 1]) / 2, (L[a * 3 + 2] + R[b * 3 + 2]) / 2];
        const lb = [(L[b * 3] - R[a * 3]) / 2, (L[b * 3 + 1] + R[a * 3 + 1]) / 2, (L[b * 3 + 2] + R[a * 3 + 2]) / 2];
        const LA = [0, 1, 2].map((k) => L[a * 3 + k] + (la[k] - L[a * 3 + k]) * f), LB = [0, 1, 2].map((k) => L[b * 3 + k] + (lb[k] - L[b * 3 + k]) * f);
        for (const v of A) for (let k = 0; k < 3; k++) { L2[v * 3 + k] = LA[k]; R2[v * 3 + k] = k ? LB[k] : -LB[k]; }
        for (const v of B) for (let k = 0; k < 3; k++) { L2[v * 3 + k] = LB[k]; R2[v * 3 + k] = k ? LA[k] : -LA[k]; } }
      acc.setArray(L2); racc.setArray(R2); nt += 2; } }
  console.log('face symmetry: pairs', pairs.length, '(by position', up, ') rest peak mm', (peak * 1000).toFixed(2), '; targets', nt, 'centre asym before mm', (before * 1000).toFixed(2));
}

// a blurred copy of an RGBA map (sigma in texels), the empty atlas between the islands left out of the average
async function blurMap(data, w, h, sigma, valid) {
  const C = Buffer.alloc(w * h * 3), V = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) { if (!valid(i)) continue; for (let c = 0; c < 3; c++) C[i * 3 + c] = data[i * 4 + c]; V[i] = 255; }
  const bc = await sharp(C, { raw: { width: w, height: h, channels: 3 } }).blur(sigma).raw().toBuffer(), bv = await sharp(V, { raw: { width: w, height: h, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
  const o = new Float32Array(w * h * 3); for (let i = 0; i < w * h; i++) { const m = bv[i] / 255; for (let c = 0; c < 3; c++) o[i * 3 + c] = m > 0.02 ? bc[i * 3 + c] / m : data[i * 4 + c]; }
  return o;
}

export async function foldSoftPass(doc, K = {}) {
  K = { sigma: 22, flat: 0.55, col: 0.75, crease: 0.07, ...K };
  const { EY, EZ, MOUTHY, CHINY } = LM, { S, pos } = await texelPos(doc), mat = matOf(doc, 'skin');
  // the region: a band round the fold's line (nose wing to past the mouth's corner), the mouth's corners, the chin
  const F = [[0.0175, EY - 0.042], [0.0235, MOUTHY + 0.018], [0.031, MOUTHY + 0.004], [0.037, MOUTHY - 0.01]];
  const segD = (x, y) => { let best = 1e9, tt = 0, acc = 0, tot = 0; for (let k = 0; k + 1 < F.length; k++) tot += Math.hypot(F[k + 1][0] - F[k][0], F[k + 1][1] - F[k][1]);
    for (let k = 0; k + 1 < F.length; k++) { const [ax, ay] = F[k], [bx, by] = F[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2), t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t); if (d < best) { best = d; tt = (acc + t * L) / tot; } acc += L; } return { d: best, t: tt }; };
  const W = new Float32Array(S * S), CR = new Float32Array(S * S); let nw = 0;
  for (let i = 0; i < S * S; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (z < EZ - 0.06 || y < CHINY - 0.02 || y > EY - 0.025) continue;
    const s = segD(x, y), fold = (1 - sm(0.006, 0.012, s.d)) * sm(-0.05, 0.05, s.t) * (1 - sm(1.0, 1.25, s.t));
    const corner = 1 - sm(0.005, 0.011, Math.hypot(x - 0.026, (y - MOUTHY) * 1.3));
    const chin = (1 - sm(0.024, 0.034, x)) * sm(CHINY - 0.004, CHINY + 0.006, y) * (1 - sm(MOUTHY - 0.016, MOUTHY - 0.009, y));
    // (the lips' own front and their seam kept as made)
    const lip = (1 - sm(0.019, 0.024, x)) * (1 - sm(0.006, 0.009, Math.abs(y - MOUTHY)));
    W[i] = Math.max(fold, corner, chin) * (1 - lip); if (W[i] > 0) nw++;
    // one broad soft crease per side, laid back on the eased maps: a wide shallow shade along the fold's line
    CR[i] = Math.exp(-((s.d / 0.0042) ** 2)) * sm(0.02, 0.15, s.t) * (1 - sm(0.75, 1.0, s.t)) * (z > EZ - 0.04 ? 1 : 0); }
  const valid = (i) => !Number.isNaN(pos[i * 3]);
  // the normal map: eased to its own blur, the relief flattened toward straight out
  const nt = mat.getNormalTexture();
  if (nt) { const { data, w, h } = await rgba(nt); if (w !== S || h !== S) throw new Error('foldSoft: normal map size'); const B = await blurMap(data, w, h, K.sigma, valid);
    for (let i = 0; i < S * S; i++) { const f = W[i]; if (f <= 0) continue; const flat = [128, 128, 255];
      for (let c = 0; c < 3; c++) { const t = B[i * 3 + c] + (flat[c] - B[i * 3 + c]) * K.flat; data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - f) + t * f); } }
    await setWebp(nt, data, w, h, 94, 4); }
  // the colour: eased to its blur (the painted gouge lines and the dark corner wedges gone), the broad crease's shade laid on
  const ct = mat.getBaseColorTexture(); { const { data, w, h } = await rgba(ct); const B = await blurMap(data, w, h, K.sigma, valid);
    for (let i = 0; i < S * S; i++) { const f = W[i] * K.col, c0 = CR[i] * K.crease; if (f <= 0 && c0 <= 0) continue;
      for (let c = 0; c < 3; c++) { let v = data[i * 4 + c] * (1 - f) + B[i * 3 + c] * f; v *= 1 - c0 * (c === 0 ? 0.8 : 1); data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v))); } }
    await setWebp(ct, data, w, h, 90, 4); }
  console.log('fold soften: texels', nw, 'sigma', K.sigma);
}

export async function lipTonePass(doc, K = {}) {
  K = { toSkin: 0.6, dark: 0.93, rx: 0.031, ry: 0.02, dy: 0.006, ...K };
  const { EZ, MOUTHY } = LM, { S, pos } = await texelPos(doc), ct = matOf(doc, 'skin').getBaseColorTexture(), { data, w, h } = await rgba(ct);
  // the skin's tone just above and below the lips
  const ref = [0, 0, 0]; let nr = 0;
  for (let i = 0; i < S * S; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < 0.02 && z > EZ && (Math.abs(y - MOUTHY - 0.014) < 0.002 || Math.abs(y - MOUTHY + 0.016) < 0.002)) { for (let c = 0; c < 3; c++) ref[c] += data[i * 4 + c]; nr++; } }
  for (let c = 0; c < 3; c++) ref[c] /= Math.max(1, nr);
  // (a soft ellipse round the mouth, not a box: the painted lip patch's hard lower edge blended away; a faint rose kept)
  let n = 0; const rose = [1.06, 0.97, 0.97];
  for (let i = 0; i < S * S; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (z < EZ - 0.02) continue;
    const r = Math.hypot(x / K.rx, (y - MOUTHY + K.dy) / K.ry), a = 1 - sm(0.55, 1.2, r); if (a <= 0) continue;
    for (let c = 0; c < 3; c++) { const v = data[i * 4 + c] + (ref[c] * K.dark * rose[c] - data[i * 4 + c]) * K.toSkin * a; data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v))); } n++; }
  await setWebp(ct, data, w, h, 90, 4); console.log('lip tone: texels', n, 'skin ref', ref.map((v) => v.toFixed(0)).join(','));
}

// the brows: the scratchy strand cards (fanned, criss-crossing quads: even a clean texture on them read blocky and torn)
// replaced by one clean sculpted shape per side: a tapered, softly rounded ribbon laid 1.2 mm off the forehead along the
// cards' own centre line (fuller and a little bushy at the inner end, tapering to the tail, a gentle arch), dark grey
// with a soft inner-to-tail shade; its skin weights and its 33 face morphs taken from the nearest card points, so the
// brows still lift, frown and talk exactly as before
export function browSoftPass(doc, K = {}) {
  K = { off: 0.0012, wIn: 0.0095, wOut: 0.0042, lift: 0.0008, bulge: 0.0009, col: [0.032, 0.031, 0.033], tip: [0.075, 0.074, 0.077], inner: 0.010, outer: 0.056, NU: 28, NV: 9, up: 0.001, ...K };
  const old = primsOf(doc).find((p) => p.getMaterial()?.getName() === 'brows'); if (!old) { console.log('brow shapes: no brows'); return; }
  const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(old)), mat = old.getMaterial();
  const P = old.getAttribute('POSITION').getArray(), J = old.getAttribute('JOINTS_0'), Wt = old.getAttribute('WEIGHTS_0'), n0 = P.length / 3;
  const TG = old.listTargets().map((t) => ({ name: t.getName(), D: t.getAttribute('POSITION').getArray() }));
  const c0 = [0, 1.645, 0.035], buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const pos = [], nrm = [], col = [], jn = [], wn = [], idx = [], near = [];
  for (const sg of [1, -1]) {
    // the centre line: per x station, the cards' points near it (this side), their median height and front-most depth
    const C = [];
    for (let i = 0; i < K.NU; i++) { const x = K.inner + (K.outer - K.inner) * (i / (K.NU - 1)); const ys = [], zs = [];
      for (let v = 0; v < n0; v++) { const px = P[v * 3] * sg; if (Math.abs(px - x) < 0.004) { ys.push(P[v * 3 + 1]); zs.push(P[v * 3 + 2]); } }
      ys.sort((a, b) => a - b); zs.sort((a, b) => a - b); C.push(ys.length ? [x * sg, ys[ys.length >> 1], zs[Math.floor(zs.length * 0.75)]] : null); }
    for (let i = 0; i < C.length; i++) if (!C[i]) C[i] = C[i - 1] || C.find(Boolean);
    // (one clean arch: height and depth each a least-squares quadratic in x along the line)
    const fit = (k) => { const S = Array(5).fill(0), T = [0, 0, 0]; for (const c of C) { const x = c[0]; for (let e = 0; e < 5; e++) S[e] += x ** e; for (let e = 0; e < 3; e++) T[e] += c[k] * x ** e; }
      const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const d = det(M); return [0, 1, 2].map((col) => det(M.map((row, r) => row.map((v, cc) => (cc === col ? T[r] : v)))) / d); };
    const fy = fit(1), fz = fit(2), Cs = C.map((c) => [c[0], fy[0] + fy[1] * c[0] + fy[2] * c[0] ** 2, fz[0] + fz[1] * c[0] + fz[2] * c[0] ** 2]);
    const base = pos.length / 3;
    for (let i = 0; i < K.NU; i++) { const t = i / (K.NU - 1), c = Cs[i], ip = Cs[Math.min(K.NU - 1, i + 1)], im = Cs[Math.max(0, i - 1)];
      const tg = [ip[0] - im[0], ip[1] - im[1], ip[2] - im[2]], tl = Math.hypot(...tg); for (let k = 0; k < 3; k++) tg[k] /= tl;
      const out = [c[0] - c0[0], c[1] - c0[1], c[2] - c0[2]], ol = Math.hypot(...out); for (let k = 0; k < 3; k++) out[k] /= ol;
      // the across direction: on the forehead, perpendicular to the line (up the face)
      let up = [out[1] * tg[2] - out[2] * tg[1], out[2] * tg[0] - out[0] * tg[2], out[0] * tg[1] - out[1] * tg[0]]; if (up[1] < 0) up = up.map((x) => -x); const ul = Math.hypot(...up); up = up.map((x) => x / ul);
      // (the width: full and rounded at the inner end, tapering to a soft point at the tail; the top edge a little arched)
      const w = (K.wOut + (K.wIn - K.wOut) * Math.pow(1 - t, 1.3)) * Math.sqrt(Math.min(1, t * 9 + 0.35)) * (1 - 0.75 * Math.pow(t, 6));
      for (let j = 0; j < K.NV; j++) { const s = -1 + (2 * j) / (K.NV - 1), prof = Math.sqrt(Math.max(0, 1 - s * s));
        const h = K.off + K.bulge * prof, a = s * w * 0.5 + K.lift * Math.sin(Math.PI * t) + K.up - (K.droop || 0) * sm(0.5, 1, t); // (round 7: droop lowers the outer third)
        const p = [0, 1, 2].map((k) => c[k] + out[k] * h + up[k] * a); pos.push(...p);
        const nn = [0, 1, 2].map((k) => out[k] * (0.6 + 0.4 * prof) + up[k] * s * 0.5), nl = Math.hypot(...nn); nrm.push(...nn.map((x) => x / nl));
        const sh = sm(0.05, 0.95, t) * 0.8 + 0.2 * Math.abs(s); let cc = K.col.map((x, k) => x + (K.tip[k] - x) * sh);
        // (round 5, the critic: "flat uniform dark-grey slabs like stickers": salt-and-pepper hair strokes that lean along
        // the brow's growth (up and out at the inner end, flat toward the tail), and the edges eased into the skin's tone)
        if (K.streak) { const lean = 1.6 * (1 - t) + 0.35, ph = (t * K.NU * 0.9 + s * lean) * Math.PI, st = Math.pow(0.5 + 0.5 * Math.sin(ph * 1.7 + 2.3 * Math.sin(t * 9 + sg)), 3), salt = ((Math.sin(ph * 0.83 + 1.1) * 43758.5453) % 1 + 1) % 1 > 0.62 ? 1 : 0;
          cc = cc.map((x, k) => x * (1 - K.streak * 0.35 * st) + (K.salt?.[k] ?? x) * salt * K.streak * 0.55); }
        if (K.edge) { const e = sm(0.45, 1, Math.abs(s)) * K.edge + sm(0.75, 1, t) * K.edge * 0.6; cc = cc.map((x, k) => x + (K.skin[k] - x) * Math.min(1, e)); }
        col.push(...cc, 1);
        // the nearest three card points (inverse distance) for the weights and the morphs
        const best = []; for (let v = 0; v < n0; v++) { if (P[v * 3] * sg < 0) continue; const d = Math.hypot(P[v * 3] - p[0], P[v * 3 + 1] - p[1], P[v * 3 + 2] - p[2]); if (best.length < 3 || d < best[2][1]) { best.push([v, d]); best.sort((a, b) => a[1] - b[1]); if (best.length > 3) best.pop(); } }
        near.push(best); } }
    for (let i = 0; i < K.NU - 1; i++) for (let j = 0; j < K.NV - 1; j++) { const a = base + i * K.NV + j, b = a + 1, c = a + K.NV, d = c + 1;
      // (wound to face out of the head)
      const pa = pos.slice(a * 3, a * 3 + 3), pb = pos.slice(b * 3, b * 3 + 3), pc = pos.slice(c * 3, c * 3 + 3), e1 = pb.map((x, k) => x - pa[k]), e2 = pc.map((x, k) => x - pa[k]);
      const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], o = [pa[0] - c0[0], pa[1] - c0[1], pa[2] - c0[2]];
      if (fn[0] * o[0] + fn[1] * o[1] + fn[2] * o[2] > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); } }
  const n = pos.length / 3, JA = new (J.getArray().constructor)(n * 4), WA = new Float32Array(n * 4), jv = [0, 0, 0, 0], wv = [0, 0, 0, 0];
  for (let v = 0; v < n; v++) { const [b] = near[v]; J.getElement(b[0], jv); Wt.getElement(b[0], wv); for (let k = 0; k < 4; k++) { JA[v * 4 + k] = jv[k]; WA[v * 4 + k] = wv[k]; } }
  const prim = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint16Array.from(idx))).setAttribute('POSITION', acc('VEC3', Float32Array.from(pos)))
    .setAttribute('NORMAL', acc('VEC3', Float32Array.from(nrm))).setAttribute('COLOR_0', acc('VEC4', Float32Array.from(col))).setAttribute('JOINTS_0', acc('VEC4', JA)).setAttribute('WEIGHTS_0', acc('VEC4', WA));
  for (const { name, D } of TG) { const O = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) { let ws = 0; const s = [0, 0, 0]; for (const [b, d] of near[v]) { const w = 1 / Math.max(1e-4, d); ws += w; for (let k = 0; k < 3; k++) s[k] += D[b * 3 + k] * w; } for (let k = 0; k < 3; k++) O[v * 3 + k] = s[k] / ws; }
    prim.addTarget(doc.createPrimitiveTarget(name).setAttribute('POSITION', acc('VEC3', O))); }
  mesh.removePrimitive(old); old.dispose(); mesh.addPrimitive(prim);
  const t = mat.getBaseColorTexture(); mat.setBaseColorTexture(null).setAlphaMode('OPAQUE').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.75).setMetallicFactor(0).setDoubleSided(true);
  if (t && t.listParents().length <= 1) t.dispose();
  console.log('brow shapes: points', n, 'triangles', idx.length / 3, 'morphs', TG.length);
}

export function rimPass(doc, K = {}) {
  K = { grow: 0.0008, col: [0.06, 0.062, 0.068], rough: 0.35, metal: 0.6, ...K };
  const seen = new Set(); let n = 0;
  for (const p of primsOf(doc)) { if (p.getMaterial()?.getName() !== 'glasses-lens-edge') continue; const acc = p.getAttribute('POSITION'), na = p.getAttribute('NORMAL'); if (!na || seen.has(acc)) continue; seen.add(acc);
    // (the normals are stored quantized: read them through the accessor (denormalized) and made unit length)
    const A = acc.getArray().slice(), e = [0, 0, 0];
    for (const v of new Set(p.getIndices().getArray())) { na.getElement(v, e); const l = Math.hypot(e[0], e[1], e[2]) || 1; for (let k = 0; k < 3; k++) A[v * 3 + k] += (e[k] / l) * K.grow; n++; }
    acc.setArray(A); }
  const m = matOf(doc, 'glasses-lens-edge'); if (m) m.setAlphaMode('OPAQUE').setBaseColorFactor([...K.col, 1]).setRoughnessFactor(K.rough).setMetallicFactor(K.metal);
  console.log('glasses rims: points', n, 'grown mm', K.grow * 1000);
}
