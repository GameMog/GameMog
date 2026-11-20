// Jensen Heist's supporting cast, cast round 2 (19 Nov, the critic on round 1): the passes added after castpass.mjs.
//   hairBasePass(doc, K)    rule 5: the forge's own cut kept as the hair (no card groom that is not cleaner than it),
//                           recoloured to a believable value: each texel's light and dark kept as a salt-and-pepper mix
//                           between K.dark and K.light (sRGB), a matte, low sheen (no silver helmet, no skin-like gloss)
//   bodyMaskPass(doc, K)    rule 7/9: the skin under every garment drawn in under it (no skin shards poking through a
//                           collar or a lapel): each covered skin point (a garment met along its normal, in front of it
//                           or up to 2 cm behind it) moved in to K.gap under the garment
//   undershirtPass(doc, C)  the body's torso skin, below the neck's base, painted the undershirt's colour (an open zip or
//                           a lapel's V shows a tee or a shirt, never bare skin)
//   jointPos(doc, name)     a joint's bind position (from its inverse bind matrix)
//   posturePass(doc, C)     rule 2: a rest-pose correction baked under the shared clips ('auto': postureAuto)
//   stubblePaintPass(doc,K) a short beard and buzz cut painted as fine strands (Director Navy)
//   tailorPass(doc, K)      rule 9: a jacket's shoulders taken in
// Original procedural work, CC0.
import { prim, rgba, setWebp, sm, clamp, body, h3, fbm } from '../young-hero/glb.mjs';
import { eyeFit } from '../frames.mjs';
import { texelPos } from '../young-mother/p2.mjs';

const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
const BODY = /^(skin|eyes|brows|lashes|teethUp|teethLow|mouth-inside|hair|hairUnder|hairShell|hairClumps|beard|headset|cornea|tongue)$/;

export function jointPos(doc, name) {
  const sk = doc.getRoot().listSkins()[0], J = sk.listJoints(), i = J.findIndex((j) => j.getName() === name); if (i < 0) return null;
  const m = sk.getInverseBindMatrices().getElement(i, new Array(16));
  // (the inverse of a rigid matrix: the translation is -R^T t)
  const t = [m[12], m[13], m[14]], R = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  return [0, 1, 2].map((c) => -(R[0][c] * t[0] + R[1][c] * t[1] + R[2][c] * t[2]));
}

export async function hairBasePass(doc, K = {}) {
  K = { dark: [44, 42, 41], light: [150, 146, 141], salt: 0.5, contrast: 1.6, rough: 0.78, ...K };
  const ps = prim(doc, 'hair'); if (!ps.length) { console.log('hair base: no hair'); return; }
  const m = ps[0].getMaterial(), tex = m.getBaseColorTexture(); if (!tex) return;
  const { data, w, h } = await rgba(tex), Y = (i) => 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
  const ls = []; for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 200) ls.push(Y(i * 4)); ls.sort((a, b) => a - b); const L0 = ls[ls.length >> 1] || 0.1;
  const D = K.dark.map(lin), L = K.light.map(lin);
  // (the share of light strands: the texel's own value above or below the cut's median, pushed by contrast, centred on salt)
  for (let i = 0; i < w * h; i++) { const t = clamp(K.salt + K.contrast * (Y(i * 4) / L0 - 1) * 0.5), u = t * t * (3 - 2 * t);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = enc(D[c] + (L[c] - D[c]) * u); }
  await setWebp(tex, data, w, h, 90, 4);
  m.setRoughnessFactor(K.rough).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]);
  m.setExtras({ ...(m.getExtras() || {}), hairTone: K.salt > 0.55 ? 'light' : undefined, look: { hair: 'forge-cut', note: 'the forge cut recoloured (cast round 2)' } });
  console.log('hair base: median', enc(L0), '->', K.dark.join(','), '..', K.light.join(','), 'salt', K.salt);
}

export function bodyMaskPass(doc, K = {}) {
  K = { gap: 0.006, extra: 0.003, back: 0.02, fwd: 0.05, headW: 0.4, ...K };
  const B = body(doc), sk = B.sk, wHead = B.wOn(/^(head|neck0[23]|jaw|.*eye.*|.*lid.*|tongue.*|special.*|levator.*|oris.*|temporalis.*|risorius.*|cheek.*|nose.*|ear.*)$/), wHand = B.wOn(/^(wrist|metacarpal|finger|thumb)/);
  const R = doc.getRoot(), gar = R.listMeshes().flatMap((mm) => mm.listPrimitives()).filter((p) => p.getIndices() && !BODY.test(p.getMaterial()?.getName() || '') && !/shoe|sneaker|boot|sole|lace|lining/.test(p.getMaterial()?.getName() || ''));
  // garment triangles in a 2 cm grid
  const cell = 0.02, G = new Map(), T = [];
  for (const p of gar) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) { const k = T.length / 9; for (const v of [I[t], I[t + 1], I[t + 2]]) T.push(A[v * 3], A[v * 3 + 1], A[v * 3 + 2]);
      let mn = [9, 9, 9], mx = [-9, -9, -9]; for (let j = 0; j < 3; j++) for (let c = 0; c < 3; c++) { const q = T[k * 9 + j * 3 + c]; mn[c] = Math.min(mn[c], q); mx[c] = Math.max(mx[c], q); }
      for (let x = Math.floor(mn[0] / cell); x <= Math.floor(mx[0] / cell); x++) for (let y = Math.floor(mn[1] / cell); y <= Math.floor(mx[1] / cell); y++) for (let z = Math.floor(mn[2] / cell); z <= Math.floor(mx[2] / cell); z++) { const kk = x + ',' + y + ',' + z; (G.get(kk) || G.set(kk, []).get(kk)).push(k); } } }
  const hit = (o, d, k) => { const i = k * 9, e1 = [T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]], e2 = [T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) return NaN;
    const inv = 1 / det, s = [o[0] - T[i], o[1] - T[i + 1], o[2] - T[i + 2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) return NaN;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) return NaN;
    return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv; };
  const acc = sk.getAttribute('POSITION'), A = acc.getArray().slice(), NA = sk.getAttribute('NORMAL'), nv = [0, 0, 0]; let n = 0, mx = 0;
  // (the normals may be quantized: read through getElement, which denormalizes)
  for (let v = 0; v < A.length / 3; v++) { if (wHead[v] > K.headW || wHand[v] > 0.3) continue;
    NA.getElement(v, nv); const nl = Math.hypot(...nv) || 1, o = [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]], d = nv.map((x) => x / nl); const seen = new Set(); let best = NaN;
    for (let s = -K.back; s <= K.fwd + 1e-6; s += cell / 2) { const kk = Math.floor((o[0] + d[0] * s) / cell) + ',' + Math.floor((o[1] + d[1] * s) / cell) + ',' + Math.floor((o[2] + d[2] * s) / cell), L = G.get(kk); if (!L) continue;
      for (const k of L) { if (seen.has(k)) continue; seen.add(k); const t = hit(o, d, k); if (t >= -K.back && t <= K.fwd && !(Math.abs(t) > Math.abs(best))) best = t; } }
    if (Number.isNaN(best)) continue; const mv = Math.min(0, best - K.gap) - K.extra;
    for (let c = 0; c < 3; c++) A[v * 3 + c] = o[c] + d[c] * mv; n++; mx = Math.min(mx, mv); }
  acc.setArray(A);
  console.log('body mask: skin points drawn in under the garments', n, 'up to', (-mx * 1000).toFixed(1), 'mm');
}

export async function undershirtPass(doc, col, K = {}) {
  K = { top: 0.035, ...K };
  const { tex, img, N2, pos, head, S } = await texelPos(doc), d = img.data, nk = jointPos(doc, 'neck01'), yTop = nk[1] - K.top, c = col.map(lin); let n = 0;
  // (the torso's skin below the neck's base (neck01 less K.top), off the arms; a soft 1 cm blend at the top; the shirt's own
  // low shading from the skin texel's light and dark)
  // (K.vneck: an open collar's V up the neck's front too: the strip |x| < vx in front of the neck, up to the collar's top
  // (the highest point of the garment's collar near the middle, less 4 mm), so an open zip shows the undershirt's neck)
  let vTop = -9; if (K.vneck) { for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { if (!K.vneck.test(p.getMaterial()?.getName() || '')) continue; const A = p.getAttribute('POSITION').getArray(); for (let v = 0; v < A.length / 3; v++) if (Math.abs(A[v * 3]) < 0.03 && A[v * 3 + 2] > nk[2]) vTop = Math.max(vTop, A[v * 3 + 1]); } vTop -= 0.004; }
  // (cast round 3, K.crew: a crew neck instead: the tee's edge dipping K.crew.dip in front, a ribbed band K.crew.rib wide
  // along it a little darker (K.crew.ribK), the edge sharp (2 mm), no V up the neck)
  const CR = K.crew, topAt = (x, z) => CR ? nk[1] - K.top + 0.012 - CR.dip * sm(nk[2] - 0.02, nk[2] + 0.06, z) * Math.max(0, 1 - (x / 0.075) ** 2) : yTop;
  for (let i = 0; i < N2; i++) { const x = pos[i * 3], y = pos[i * 3 + 1]; if (Number.isNaN(y) || Math.abs(x) > 0.2) continue; const yT = topAt(x, pos[i * 3 + 2]);
    const inV = K.vneck && Math.abs(x) < (K.vx ?? 0.035) && pos[i * 3 + 2] > nk[2] && y < vTop; if (!inV && (head[i] > 0.2 || y > yT + 0.01)) continue;
    const w = inV ? 1 : CR ? 1 - sm(yT - 0.001, yT + 0.001, y) : 1 - sm(yTop - 0.01, yTop + 0.01, y); if (w <= 0) continue; const l = (0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]));
    const k = clamp(0.85 + 0.3 * (l / 0.25 - 1), 0.7, 1.1) * (CR && y > yT - CR.rib ? CR.ribK * (0.92 + 0.08 * Math.sin(x * 2200)) : 1);
    for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = enc(lin(d[i * 4 + ch]) * (1 - w) + c[ch] * k * w); n++; }
  await setWebp(tex, d, S, S, 90, 4);
  console.log('undershirt: texels', n, 'below y', yTop.toFixed(3), 'V to', vTop.toFixed(3), 'colour', col.join(','));
}

// rule 2, a per-body rest-pose correction under the shared clips: the clips set each bone's turn, so a correction baked
// into the bind geometry (each skinned point turned about its bones' joints by C, the head's and neck's points carried
// back with them, the morphs' deltas turned the same) rides on top of every clip. C: [[bone, degrees about the body's
// left-right axis (negative = back), ...]], applied root to leaf, each about its joint's bind position.
export function posturePass(doc, C) {
  if (C === 'auto' || C?.auto) C = postureAuto(doc, C?.auto ? C : {});
  if (!C?.length) return;
  const R = doc.getRoot(), sk = R.listSkins()[0], J = sk.listJoints(), par = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const want = new Map(C.map(([b, a]) => [b, a])), D = new Map();
  // a 3x4 transform as [m00..m22, tx, ty, tz] (row-major rotation)
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const rotX = (deg, p) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), r = [1, 0, 0, 0, c, -s, 0, s, c];
    return [...r, p[0] - (r[0] * p[0] + r[1] * p[1] + r[2] * p[2]), p[1] - (r[3] * p[0] + r[4] * p[1] + r[5] * p[2]), p[2] - (r[6] * p[0] + r[7] * p[1] + r[8] * p[2])]; };
  const mul = (A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]);
    for (let i = 0; i < 3; i++) r.push(A[i * 3] * B[9] + A[i * 3 + 1] * B[10] + A[i * 3 + 2] * B[11] + A[9 + i]); return r; };
  const dOf = (n) => { if (!n) return I3; if (D.has(n)) return D.get(n); const p = dOf(par.get(n)), a = want.get(n.getName()); const d = a ? mul(p, rotX(a, jointPos(doc, n.getName()))) : p; D.set(n, d); return d; };
  const M = J.map(dOf); const done = new Set(); let nv = 0;
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA || !WA) continue;
    const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const n = P.getCount(), j = [0, 0, 0, 0], w = [0, 0, 0, 0], v = [0, 0, 0], blend = new Array(n);
    for (let i = 0; i < n; i++) { JA.getElement(i, j); WA.getElement(i, w); const s = w[0] + w[1] + w[2] + w[3] || 1, m = new Array(12).fill(0); for (let k = 0; k < 4; k++) if (w[k]) for (let q = 0; q < 12; q++) m[q] += M[j[k]][q] * w[k] / s; blend[i] = m; }
    const app = (acc, rotOnly) => { if (!acc || done.has(acc) && acc !== P) return; done.add(acc); const e = new Array(acc.getElementSize()).fill(0);
      for (let i = 0; i < n; i++) { acc.getElement(i, e); const m = blend[i], x = m[0] * e[0] + m[1] * e[1] + m[2] * e[2] + (rotOnly ? 0 : m[9]), y = m[3] * e[0] + m[4] * e[1] + m[5] * e[2] + (rotOnly ? 0 : m[10]), z = m[6] * e[0] + m[7] * e[1] + m[8] * e[2] + (rotOnly ? 0 : m[11]);
        if (rotOnly === 'n') { const l = Math.hypot(x, y, z) || 1; e[0] = x / l; e[1] = y / l; e[2] = z / l; } else { e[0] = x; e[1] = y; e[2] = z; } acc.setElement(i, e); } };
    app(P, false); app(p.getAttribute('NORMAL'), 'n'); app(p.getAttribute('TANGENT'), 'n');
    for (const t of p.listTargets()) { app(t.getAttribute('POSITION'), true); app(t.getAttribute('NORMAL'), true); }
    nv += n; }
  console.log('posture: rest correction', C.map(([b, a]) => b + ' ' + a).join(', '), '; points', nv);
}

// the correction measured on the bind pose (glTF: +z forward): the shoulder joint over the hip joint (+K.sh), the ear (the
// head's most lateral skin points) over the shoulder (+K.ear); the spine turned at spine03, the neck at neck01/02, the head
// turned back the other way by their sum (the chin kept level)
export function postureAuto(doc, K = {}) {
  K = { sh: 0.004, ear: -0.012, maxSpine: 6, maxNeck: 16, ...K };
  const B = body(doc), wh = B.wOn(/^head$/), P = B.pos, e = []; for (let v = 0; v < wh.length; v++) if (wh[v] > 0.9) e.push(v);
  e.sort((a, b) => Math.abs(P[b * 3]) - Math.abs(P[a * 3])); const top = e.slice(0, Math.max(4, Math.round(e.length / 60))), ear = [0, 1, 2].map((c) => top.reduce((s, v) => s + P[v * 3 + c], 0) / top.length);
  const S = jointPos(doc, 'upperarm01_L'), Hp = jointPos(doc, 'upperleg01_L'), sp = jointPos(doc, 'spine03'), nk = jointPos(doc, 'neck01');
  const ds = S[2] - Hp[2] - K.sh, aS = Math.max(-K.maxSpine, Math.min(0, -Math.atan2(ds, S[1] - sp[1]) * 180 / Math.PI));
  const shift = (y) => (y - sp[1]) * Math.tan(-aS * Math.PI / 180), de = (ear[2] - shift(ear[1])) - (S[2] - shift(S[1])) - K.ear;
  const aN = Math.max(-K.maxNeck, Math.min(0, -Math.atan2(de, ear[1] - nk[1]) * 180 / Math.PI)), r = (x) => Math.round(x * 10) / 10;
  console.log('posture auto: ear', (ear[2] * 100).toFixed(1), 'shoulder', (S[2] * 100).toFixed(1), 'hip', (Hp[2] * 100).toFixed(1), 'cm fwd; spine', r(aS), 'neck', r(aN));
  return [['spine03', r(aS)], ['neck01', r(aN * 0.55)], ['neck02', r(aN * 0.45)], ['head', r(-(aS + aN))]].filter(([, a]) => a);
}

// a short beard and a buzz cut painted into the skin as fine strands (no popcorn shells): per texel of the head, a coverage
// from two layers of short streaks (a hash on a grid stretched along the hair's fall), darker at the root (the skin side
// of each streak), salt and pepper (a share of the strands grey); feathered edges with a little noise.
//   K: { col: dark sRGB, grey: light sRGB, salt: share grey, beard: coverage 0..1, scalp: coverage 0..1 }
export async function stubblePaintPass(doc, K = {}) {
  K = { col: [34, 30, 28], grey: [150, 146, 140], salt: 0.4, beard: 0.85, scalp: 0.75, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data, E = eyeFit(doc), ey = (E.L.c[1] + E.R.c[1]) / 2, ez = (E.L.c[2] + E.R.c[2]) / 2;
  const D = K.col.map(lin), G = K.grey.map(lin); let nb = 0, ns = 0;
  const strand = (x, y, z, sx, sy) => { const gx = Math.floor(x * sx), gy = Math.floor(y * sy + h3(gx, 7, 3) * 3), gz = Math.floor(z * sx); const h = h3(gx, gy, gz), fy = (y * sy + h3(gx, 7, 3) * 3) % 1;
    return { on: h > 0.35 ? 1 : 0, root: fy, grey: h3(gx + 11, gy, gz) < K.salt }; };
  for (let i = 0; i < N2; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(y) || head[i] < 0.5) continue; const ax = Math.abs(x);
    // the beard: under the cheek line, in front of the ears, off the lips; the scalp: over the hairline
    const cheekTop = ey - 0.04 - 0.18 * Math.max(0, ax - 0.02), mouthY = ey - 0.083, lipR = K.lips || [0.026, 0.0105], lipE = (x / lipR[0]) ** 2 + ((y - mouthY) / lipR[1]) ** 2, lips = lipE < 1;
    const jn = 0.006 * (fbm(x, y, z, 60) - 0.5);
    let wb = (1 - sm(cheekTop - 0.008, cheekTop + 0.002, y + jn)) * sm(ez - 0.085, ez - 0.06, z) * sm(ey - 0.2, ey - 0.16, y) * (K.lips ? sm(1, K.lipFade ?? 1.35, lipE) * (K.lipThin ? 1 - K.lipThin * (1 - sm(1, 3.2, lipE)) : 1) : lips ? 0 : 1);
    const t = sm(ez - 0.095, ez - 0.02, z), hl = (z < ez - 0.095 ? ey - 0.075 + 0.1 * sm(ez - 0.17, ez - 0.095, z) : ey + 0.025 + 0.042 * t);
    let ws = sm(hl - 0.004, hl + 0.006, y + jn) * (ax > 0.065 && y < ey + 0.035 && z > ez - 0.12 ? 0 : 1);
    if (wb <= 0 && ws <= 0) continue;
    const s1 = strand(x, y, z, 1400, 260), s2 = strand(x + 0.37, y + 0.11, z, 1700, 330), on = Math.max(s1.on, s2.on * 0.8), s = s1.on ? s1 : s2;
    const cov = Math.min(1, (wb * K.beard + ws * K.scalp)) * ((K.soft ?? 0.55) + (1 - (K.soft ?? 0.55)) * on), col = s.grey ? G : D, rootK = 0.75 + 0.25 * s.root;
    for (let c = 0; c < 3; c++) { const sk = lin(d[i * 4 + c]); d[i * 4 + c] = enc(sk * (1 - cov) + col[c] * rootK * cov); }
    if (wb > 0) nb++; else ns++; }
  await setWebp(tex, d, S, S, 92, 4);
  console.log('stubble paint: beard texels', nb, 'scalp texels', ns);
}

// rule 9, a tailored shoulder: a jacket's points over the shoulders and the upper arms (|x| past K.x0, above the armpit
// less K.drop) that stand more than K.ease off the skin (met along the point's inward normal) drawn in to K.ease, faded in
// over 2 cm in x and in height; every garment layer of the jacket (K.mats) moved alike (no shards between them)
export function tailorPass(doc, K = {}) {
  K = { mats: /^(uniform|suit|puffer)(-hem|-collar|-lapels)?$/, ease: 0.012, x0: 0.12, drop: 0.12, far: 0.08, ...K };
  const B = body(doc), sk = B.sk, SA = sk.getAttribute('POSITION').getArray(), SI = sk.getIndices().getArray(), S = jointPos(doc, 'upperarm01_L'), yTop = S[1] + 0.12, yLo = S[1] - K.drop;
  const cell = 0.02, G = new Map(), T = [];
  for (let t = 0; t < SI.length; t += 3) { const k = T.length / 9; for (const v of [SI[t], SI[t + 1], SI[t + 2]]) T.push(SA[v * 3], SA[v * 3 + 1], SA[v * 3 + 2]);
    if (Math.max(T[k * 9 + 1], T[k * 9 + 4], T[k * 9 + 7]) < yLo - 0.05) continue;
    const mn = [0, 1, 2].map((c) => Math.min(T[k * 9 + c], T[k * 9 + 3 + c], T[k * 9 + 6 + c])), mx = [0, 1, 2].map((c) => Math.max(T[k * 9 + c], T[k * 9 + 3 + c], T[k * 9 + 6 + c]));
    for (let x = Math.floor(mn[0] / cell); x <= Math.floor(mx[0] / cell); x++) for (let y = Math.floor(mn[1] / cell); y <= Math.floor(mx[1] / cell); y++) for (let z = Math.floor(mn[2] / cell); z <= Math.floor(mx[2] / cell); z++) { const kk = x + ',' + y + ',' + z; (G.get(kk) || G.set(kk, []).get(kk)).push(k); } }
  const hit = (o, d, k) => { const i = k * 9, e1 = [T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]], e2 = [T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) return NaN;
    const inv = 1 / det, s = [o[0] - T[i], o[1] - T[i + 1], o[2] - T[i + 2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) return NaN;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) return NaN;
    return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv; };
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => K.mats.test(p.getMaterial()?.getName() || ''));
  let n = 0, mx = 0; const done = new Set(), nv = [0, 0, 0];
  for (const p of prims) { const acc = p.getAttribute('POSITION'); if (done.has(acc)) continue; done.add(acc); const A = acc.getArray().slice(), N = p.getAttribute('NORMAL');
    for (let v = 0; v < A.length / 3; v++) { const o = [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]], ax = Math.abs(o[0]); if (ax < K.x0 || o[1] < yLo || o[1] > yTop) continue;
      N.getElement(v, nv); const l = Math.hypot(...nv) || 1, d = nv.map((x) => -x / l); const seen = new Set(); let best = NaN;
      for (let s = 0; s <= K.far + 1e-6; s += cell / 2) { const L = G.get(Math.floor((o[0] + d[0] * s) / cell) + ',' + Math.floor((o[1] + d[1] * s) / cell) + ',' + Math.floor((o[2] + d[2] * s) / cell)); if (!L) continue;
        for (const k of L) { if (seen.has(k)) continue; seen.add(k); const t = hit(o, d, k); if (t > 0 && t <= K.far && !(t > best)) best = t; } }
      if (!(best > K.ease)) { if (!K.k) continue;
        // (no skin under the jacket there (the forge drops covered skin): the point drawn toward the arm's axis, the
        // shoulder joint to the elbow, by K.k of its distance from it)
        const sd = o[0] < 0 ? 'R' : 'L', a = jointPos(doc, 'upperarm01_' + sd), b = jointPos(doc, 'lowerarm01_' + sd), ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
        let t = ((o[0] - a[0]) * ab[0] + (o[1] - a[1]) * ab[1] + (o[2] - a[2]) * ab[2]) / L2; t = Math.max(-0.15, Math.min(1, t)); const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
        const w = sm(K.x0, K.x0 + 0.03, ax) * sm(yLo, yLo + 0.04, o[1]) * (1 - sm(0.4, 0.8, t)), kk = K.k * w; for (let q = 0; q < 3; q++) A[v * 3 + q] = o[q] + (c[q] - o[q]) * kk; n++; mx = Math.max(mx, kk * Math.hypot(c[0] - o[0], c[1] - o[1], c[2] - o[2])); continue; } const w = sm(K.x0, K.x0 + 0.02, ax) * sm(yLo, yLo + 0.02, o[1]), mv = (best - K.ease) * w;
      for (let c = 0; c < 3; c++) A[v * 3 + c] = o[c] + d[c] * mv; n++; mx = Math.max(mx, mv); }
    acc.setArray(A); }
  console.log('tailor: jacket points drawn in at the shoulders', n, 'up to', (mx * 1000).toFixed(1), 'mm');
}
