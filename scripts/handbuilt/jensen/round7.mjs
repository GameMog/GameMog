// Jensen, caricature round 7 (the owner: "he looks a bit young, he's 63"; the critic on round 6: at close range about
// 52-58, at tile and game size (the webcam tile at 256 px) still late 40s to mid 50s: the painted creases vanish at that
// size, so the age has to be in the face's SHAPE; the skin a smooth even putty; a one-sided smirk in every lit shot; a
// pale V under the lower lip; the frame floating in front of the face; thin, high, dark painted brows; a bulky yoke).
// Universal adult and age cues only: nothing about the eyes' shape, the skin's tone family or any racialised feature.
//   shape7Pass(doc)   the face's age in its shape, on the head's own points (symmetric by |x|): jowls that break the jaw
//                     line just ahead of its corners (a soft pre-jowl dip beside the chin), the nose-to-mouth fold a real
//                     trough carried down to the mouth's corners with the cheek's mass over it, heavier upper lids over
//                     the outer third (the lid margin and the eye's shape untouched), lower-lid bags set lower with a
//                     crisp tear-trough step under them, slightly sunken temples, less fullness under the cheekbones,
//                     a looser under-chin and two soft neck cords
//   paint7Pass(doc)   the skin's living variation: warmer, redder cheeks and nose tip, a mild darkening under the eyes
//                     and in the lid creases, a crisp shadow line under the bags, the fold's trough shaded down its whole
//                     length, a cooler, more muted jaw and neck, a little pore and roughness detail on the cheeks and
//                     nose; an even AO-style shadow in BOTH mouth corners; the lip tone's pale V under the lower lip's
//                     middle eased into the chin's own skin (a rounded lip border)
//   glasses7Pass(doc) the frame seated on the face: 3.5 mm back, the nose pads out onto the bridge's sides, the temple
//                     arms bent in behind the temples into the hair over the ears; a gunmetal metal with a highlight
//                     (the lower rims thinner: rimPass grows them 0.7 mm, not 1.5)
//   mouthRim7Pass(doc) the open mouth's inside a deep rose behind the lips fading to black (no cut-out black rim)
//   yoke7Pass(doc)    the jacket's shoulder yoke flatter (it read bulky over the shoulders in the A-pose)
// Original procedural work (no photographs, no assets), CC0.
import { matOf, rgba, setWebp, fbm, noise3, sm, clamp, raster, prim } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { skinMap } from '../facekit.mjs';
import { LM } from './landmarks.mjs';

const g2 = (d, r) => Math.exp(-((d / r) ** 2));
const { EY, EZ, EYEX, MOUTHY, CHINY } = LM;
// the nose-to-mouth fold, from the nostril's wing down and out past the mouth's corner, curving in under it
const FOLD7 = [[0.0265, MOUTHY + 0.027], [0.0315, MOUTHY + 0.016], [0.0355, MOUTHY + 0.005], [0.0368, MOUTHY - 0.005], [0.0352, MOUTHY - 0.0145]];
function seg(x, y, P) {
  let best = 1e9, tt = 0, side = 0, acc = 0, tot = 0;
  for (let k = 0; k + 1 < P.length; k++) tot += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
  for (let k = 0; k + 1 < P.length; k++) { const [ax, ay] = P[k], [bx, by] = P[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2), cx = ax + dx * t, cy = ay + dy * t, dd = Math.hypot(x - cx, y - cy);
    let nx = dy, ny = -dx; if (nx < 0) { nx = -nx; ny = -ny; }
    if (dd < best) { best = dd; tt = (acc + t * L) / tot; side = Math.sign((x - cx) * nx + (y - cy) * ny); } acc += L; }
  return { d: best, t: tt, side };
}
function weld(a) { const n = a.length / 3, key = new Map(), rep = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  return rep; }
function notSkin(doc, acc) { const s = new Set();
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (p.getAttribute('POSITION') !== acc || !/^(eyes|lashes|teethUp|teethLow)$/.test(mn)) continue;
    for (const v of p.getIndices().getArray()) s.add(v); }
  return s; }
// the face's front surface: the largest z in each 2 mm (|x|, y) cell of the head's skin; a point's depth under it
function frontMap(a, n, skip) { const F = new Map(), key = (x, y) => `${Math.round(Math.abs(x) / 0.002)},${Math.round(y / 0.002)}`;
  for (let v = 0; v < n; v++) { if (skip.has(v)) continue; const y = a[v * 3 + 1]; if (y < 1.42 || Math.abs(a[v * 3]) > 0.11) continue; const k = key(a[v * 3], y); F.set(k, Math.max(F.get(k) ?? -9, a[v * 3 + 2])); }
  return (x, y) => { let m = -9; const cx = Math.round(Math.abs(x) / 0.002), cy = Math.round(y / 0.002); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) m = Math.max(m, F.get(`${cx + i},${cy + j}`) ?? -9); return m; }; }

export function shape7Pass(doc, K = {}) {
  K = { jowl: 0.004, jowlDown: 0.003, preJowl: 0.002, nl: 0.0036, nlRidge: 0.0032, lid: 0.0016, bag: 0.0012, bagStep: 0.0009, temple: 0.002, underCheek: 0.0016,
    wattle: 0.003, cords: 0.001, ...K };
  const M = skinMap(doc), a = M.P.getArray().slice(), n = M.n, rep = weld(a), skip = notSkin(doc, M.P), front = frontMap(a, n, skip);
  const C = [0, EY - 0.03, EZ - 0.095];
  let peak = 0, moved = 0;
  for (let v = 0; v < n; v++) { if (rep[v] !== v || skip.has(v)) continue; const X = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(X), sg = Math.sign(X) || 1;
    if (y < CHINY - 0.07 || y > EY + 0.06 || x > 0.09 || z < -0.01) continue;
    let ox = X - C[0], oy = y - C[1], oz = z - C[2]; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    const depth = front(X, y) - z, onFace = sm(0.014, 0.005, depth);
    let out = 0, dx = 0, dy = 0, dz = 0;
    // (a) jowls: a soft mass just ahead of the jaw's corners, below the mouth, hanging a little (out and down); a shallow
    // dip between it and the chin, so the chin-to-jaw line is no longer one smooth U
    { const t = g2(Math.hypot((x - 0.047) * 1.0, (y - (CHINY + 0.011)) * 1.15), 0.0125) * sm(0.03, 0.07, z) * sm(CHINY - 0.012, CHINY - 0.002, y);
      out += K.jowl * t; dy -= K.jowlDown * t; }
    { const t = g2(Math.hypot(x - 0.03, (y - (CHINY + 0.007)) * 1.3), 0.0065) * onFace; out -= K.preJowl * t; }
    // (b) the nose-to-mouth fold: a shaped trough down its whole length (deeper at the top), the cheek's mass over it
    { const s = seg(x, y, FOLD7), along = sm(0, 0.05, s.t) * (1 - 0.45 * sm(0.5, 1, s.t)) * (1 - sm(0.97, 1.0, s.t));
      out += onFace * along * (-K.nl * g2(s.d, 0.0033) + K.nlRidge * (s.side > 0 ? 1 : 0) * g2(s.d - 0.006, 0.005)); }
    // (c) the upper lid's skin heavier over the outer third (between the crease and the brow; never the lid's margin)
    { const t = g2((x - (EYEX + 0.012)) / 1.0, 0.0085) * sm(EY + 0.0105, EY + 0.0145, y) * sm(EY + 0.027, EY + 0.019, y) * onFace;
      dy -= K.lid * t; dz += K.lid * 0.35 * t; }
    // (d) the lower-lid bags lower and fuller, with a crisp step (the tear trough) under them
    { const t = g2(Math.hypot((x - (EYEX + 0.003)) / 1.3, y - (EY - 0.021)), 0.0062) * onFace; out += K.bag * t;
      const st = g2(y - (EY - 0.0285 + 0.004 * ((x - EYEX) / 0.02) ** 2), 0.0018) * g2(x - (EYEX + 0.002), 0.013) * onFace; out -= K.bagStep * st; }
    // (e) slightly sunken temples, a little less fullness under the cheekbones
    { const t = g2(Math.hypot(x - 0.066, (y - (EY + 0.018)) * 0.9), 0.012) * sm(0.02, 0.06, z); out -= K.temple * t; }
    { const t = g2(Math.hypot(x - 0.05, (y - (MOUTHY + 0.013)) * 1.1), 0.011) * sm(0.04, 0.075, z); out -= K.underCheek * t; }
    // (f) a looser under-chin (a soft wattle hanging from the chin to the neck) and two soft neck cords
    { const t = g2(x, 0.022) * g2(y - (CHINY - 0.016), 0.012) * sm(0.05, 0.08, z) * sm(CHINY - 0.05, CHINY - 0.03, y); dz += K.wattle * t; dy -= K.wattle * 0.5 * t; }
    { const band = sm(CHINY - 0.012, CHINY - 0.022, y) * sm(1.452, 1.47, y) * sm(0.04, 0.07, z);
      const cord = g2(x - 0.0135, 0.0028) - 0.6 * g2(x - 0.0065, 0.003); dz += K.cords * cord * band; }
    dx += ox * out; dy += oy * out; dz += oz * out;
    const m = Math.hypot(dx, dy, dz); if (m < 1e-7) continue; peak = Math.max(peak, m); moved++;
    a[v * 3] += dx * (X === 0 ? 0 : 1); a[v * 3 + 1] += dy; a[v * 3 + 2] += dz; }
  for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v && !skip.has(v)) for (let k = 0; k < 3; k++) a[v * 3 + k] = a[r * 3 + k]; }
  M.P.setArray(a); console.log('shape7: points', moved, 'peak mm', (peak * 1000).toFixed(2));
}

export async function paint7Pass(doc, K = {}) {
  K = { cheek: 1, nose: 1, under: 0.1, crease: 0.08, bagLine: 0.2, nlShade: 0.16, cool: 1, pores: 1, corner: 0.3, notch: 1, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const mat = matOf(doc, 'skin'), mrt = mat.getMetallicRoughnessTexture();
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  // the mouth's corners: the mouth's inside reaches them (its widest points), a millimetre in
  const mi = prim(doc, 'mouth-inside')[0]; let cx = 0.026, cy = MOUTHY + 0.002;
  if (mi) { const P = mi.getAttribute('POSITION').getArray(); let bx = 0, by = 0; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) > bx) { bx = Math.abs(P[i]); by = P[i + 1]; } cx = bx - 0.003; cy = by; }
  // the chin's own skin (its middle, under the lip tone's V), for the V under the lip's middle
  const ch = [0, 0, 0, 0];
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X) || head[i] < 0.8) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < 0.01 && y > MOUTHY - 0.034 && y < MOUTHY - 0.027 && z > EZ - 0.03) { ch[0] += lin(d[i * 4]); ch[1] += lin(d[i * 4 + 1]); ch[2] += lin(d[i * 4 + 2]); ch[3]++; } }
  const chin = ch[3] ? [ch[0] / ch[3], ch[1] / ch[3], ch[2] / ch[3]] : null, rows = { size: ch[3] }, rowCol = () => chin;
  let nn = 0, nv = 0, nc = 0;
  const R = new Float32Array(N2);
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const x = Math.abs(X), y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (head[i] < 0.3 && !(y > 1.42 && x < 0.08 && z > -0.02)) continue;
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]); if (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.02) continue;
    const fz = sm(EZ - 0.07, EZ - 0.04, z);
    // the lip tone's V under the lower lip's middle: below a rounded lip border, the chin's own skin at that height
    if (K.notch) { const border = MOUTHY - (K.border ?? 0.0092) + 0.005 * (x / 0.02) ** 2, w = sm(border + 0.0006, border - 0.0014, y) * (1 - sm(0.014, 0.019, x)) * sm(MOUTHY - 0.03, MOUTHY - 0.024, y) * sm(EZ - 0.03, EZ - 0.015, z);
      if (w > 0) { const c = rowCol(y); if (c) { r += (c[0] - r) * w * K.notch; g += (c[1] - g) * w * K.notch; b += (c[2] - b) * w * K.notch; nv++; } } }
    let dk = 0, red = 0;
    // warmer, redder cheeks (over the cheekbones) and nose tip
    red += K.cheek * 0.07 * g2(Math.hypot(x - 0.047, (y - (EY - 0.034)) * 1.1), 0.015) * fz;
    red += K.nose * 0.06 * (1 - sm(0.012, 0.018, x)) * g2(y - (MOUTHY + 0.022), 0.008) * sm(EZ, EZ + 0.012, z);
    // under the eyes (a little purple-brown), the lid creases
    const und = K.under * g2(Math.hypot((x - (EYEX + 0.002)) / 1.35, y - (EY - 0.019)), 0.0065) * fz; dk += und;
    dk += K.crease * g2((x - (EYEX + 0.006)) / 1.3, 0.011) * g2(y - (EY + 0.0105), 0.0016) * fz;
    // the crisp line under the bags (the tear-trough step)
    dk += K.bagLine * g2(y - (EY - 0.0285 + 0.004 * ((x - EYEX) / 0.02) ** 2), 0.0012) * g2(x - (EYEX + 0.002), 0.012) * fz;
    // the fold's trough shaded down its whole length (a soft line, the cheek over it a touch lighter)
    { const s = seg(x, y, FOLD7), along = sm(0, 0.05, s.t) * (1 - 0.4 * sm(0.5, 1, s.t)) * (1 - sm(0.96, 1, s.t)); dk += K.nlShade * along * g2(s.d, 0.0026) * fz; }
    // both mouth corners: an even, soft AO-style shadow
    const co = g2(Math.hypot(x - cx, (y - cy) * 1.4), 0.0028) * fz; dk += K.corner * co; if (co > 0.05) nc++;
    const kk = 1 - clamp(dk, 0, 0.45);
    r *= kk; g *= kk * (1 - 0.03 * und / Math.max(1e-4, K.under)); b *= kk;
    r *= 1 + red; g *= 1 - red * 0.35; b *= 1 - red * 0.45;
    // a cooler, more muted jaw and neck
    if (K.cool) { const w = sm(MOUTHY - 0.022, MOUTHY - 0.05, y) * (y > 1.43 ? 1 : 0) * K.cool, L = 0.2126 * r + 0.7152 * g + 0.0722 * b, q = 0.14 * w;
      r = r + (L - r) * q; g = g + (L - g) * q; b = b + (L - b) * q; r *= 1 - 0.02 * w; b *= 1 + 0.025 * w; }
    // pores: a fine mottling on the cheeks and nose (albedo); the roughness follows below
    const pz = K.pores * (g2(Math.hypot(x - 0.04, (y - (EY - 0.03)) * 0.8), 0.022) + (1 - sm(0.014, 0.022, x)) * g2(y - (MOUTHY + 0.03), 0.02)) * fz;
    if (pz > 0.02) { const p = noise3(X * 2600, y * 2600, z * 2600) - 0.5, q = fbm(X, y, z, 400) - 0.5, m = 1 + Math.min(1, pz) * (0.05 * p + 0.04 * q); r *= m; g *= m; b *= m; R[i] = Math.min(1, pz) * (0.5 + p); }
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); nn++; }
  await setWebp(tex, d, S, S, 90, 4);
  if (mrt && K.pores) { const { data: mr, w: MW } = await rgba(mrt); const k = MW / S; let np = 0;
    for (let i = 0; i < N2; i++) { if (!R[i]) continue; const xx = i % S, yy = (i / S) | 0, j = (Math.floor(yy * k) * MW + Math.floor(xx * k)) * 4;
      mr[j + 1] = Math.min(255, Math.round(mr[j + 1] * (1 + 0.1 * R[i]))); np++; }
    await setWebp(mrt, mr, MW, MW, 90); console.log('paint7: rough texels', np); }
  console.log('paint7: texels', nn, 'V texels', nv, 'corner texels', nc, 'corner at', cx.toFixed(4), cy.toFixed(4), 'chin rows', rows.size);
}

export function glasses7Pass(doc, K = {}) {
  K = { back: 0.0035, padOut: 0.0022, templeIn: 0.004, zT0: 0.12, zT1: 0.06, col: [0.17, 0.175, 0.188], metal: 1, rough: 0.3, rim: [0.12, 0.124, 0.132], rimMetal: 0.9, rimRough: 0.3, ...K };
  const seen = new Set(), all = [];
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (!/^glasses-/.test(mn)) continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); all.push([mn, acc, p]); }
  let n = 0;
  for (const [mn, acc] of all) { const A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { const X = A[i], x = Math.abs(X), z = A[i + 2], sg = Math.sign(X) || 1;
      // the frame back onto the face
      let nz = z - K.back, nx = X;
      // the nose pads out onto the bridge's sides
      if (mn === 'glasses-pads') nx = X + sg * K.padOut;
      // the temple arms in behind the temples, so they run into the hair over the ears
      const t = sm(K.zT0, K.zT1, z) * sm(0.06, 0.075, x); nx -= sg * K.templeIn * t;
      A[i] = nx; A[i + 2] = nz; n++; }
    acc.setArray(A); }
  for (const [mn, , p] of all) { const m = p.getMaterial();
    if (mn === 'glasses-metal') m.setBaseColorFactor([...K.col, 1]).setMetallicFactor(K.metal).setRoughnessFactor(K.rough);
    if (mn === 'glasses-lens-edge') m.setBaseColorFactor([...K.rim, 1]).setMetallicFactor(K.rimMetal).setRoughnessFactor(K.rimRough); }
  console.log('glasses7: points', n, 'back mm', K.back * 1000, 'pads out mm', K.padOut * 1000, 'temples in mm', K.templeIn * 1000);
}

export function yoke7Pass(doc, K = {}) {
  K = { down: 0.004, x0: 0.09, x1: 0.13, x2: 0.2, x3: 0.24, y0: 1.36, y1: 1.42, ...K };
  const seen = new Set(); let n = 0, peak = 0;
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const mn = p.getMaterial()?.getName() || ''; if (!/^(leather|hardware|zip-tape|snaps)$/.test(mn)) continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc);
    const A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { const x = Math.abs(A[i]), w = sm(K.x0, K.x1, x) * sm(K.x3, K.x2, x) * sm(K.y0, K.y1, A[i + 1]); if (w <= 0) continue; A[i + 1] -= K.down * w; peak = Math.max(peak, K.down * w); n++; }
    acc.setArray(A); }
  console.log('yoke7: points', n, 'down mm', (peak * 1000).toFixed(1));
}

export function mouthRim7Pass(doc, K = {}) {
  K = { lo: [0.014, 0.005, 0.005], hi: [0.36, 0.11, 0.1], pow: 1.1, ...K };
  // (the critic: the open mouth's inside edges flat black, cut-out polygons: the inside a deep rose just behind the lips,
  // fading to near black at the back over a longer run, so the lips' inner rim reads soft)
  const mi = prim(doc, 'mouth-inside')[0]; if (!mi) { console.log('mouthRim7: no mouth inside'); return; }
  const P = mi.getAttribute('POSITION').getArray(), np = P.length / 3; let zmax = -9, zmin = 9; for (let v = 0; v < np; v++) { zmax = Math.max(zmax, P[v * 3 + 2]); zmin = Math.min(zmin, P[v * 3 + 2]); }
  const col = new Float32Array(np * 4);
  for (let v = 0; v < np; v++) { const t = Math.pow(clamp((P[v * 3 + 2] - zmin) / Math.max(1e-4, zmax - zmin)), K.pow) * (P[v * 3 + 1] < MOUTHY ? 1 : 0.75); for (let k = 0; k < 3; k++) col[v * 4 + k] = K.lo[k] + (K.hi[k] - K.lo[k]) * t; col[v * 4 + 3] = 1; }
  mi.getAttribute('COLOR_0').setArray(col); console.log('mouthRim7: points', np, 'pow', K.pow);
}

// the round's tuned settings (each still overridable by its JH_* env)
export const R7 = {
  // (a broader, warmer closed smile: the corners up and out ~2-3 mm more, the cheeks pushed up evenly)
  grin: [['jawOpen', 0.0], ['mouthSmileLeft', 0.62], ['mouthSmileRight', 0.62], ['mouthStretchLeft', 0.3], ['mouthStretchRight', 0.3],
    ['mouthUpperUpLeft', 0.1], ['mouthUpperUpRight', 0.1], ['cheekSquintLeft', 0.4], ['cheekSquintRight', 0.4], ['browInnerUp', 0.05], ['browOuterUpLeft', 0.2], ['browOuterUpRight', 0.2], ['eyeWideLeft', 0.05], ['eyeWideRight', 0.05]],
  // (fuller, salt-and-pepper brows, lower, the outer thirds dropped a little)
  brows: { wIn: 0.0098, wOut: 0.0052, bulge: 0.0008, NU: 48, NV: 13, col: [0.11, 0.108, 0.112], tip: [0.2, 0.198, 0.205], salt: [0.42, 0.42, 0.44], streak: 0.6, edge: 0.3, skin: [0.56, 0.43, 0.36], up: -0.0006, droop: 0.0022 },
};
// (the hair, the critic: still a sculpted helmet with regular parallel grooves and a diamond of crossing grooves in
// profile; the reference's mass is soft and airy with a lifted, separated front quiff falling a little to his right,
// darker grey lowlights underneath and at the temples, bright white on top): the sweeps run one way (no crossings), the
// grooves and strand ridges shallower and more broken, low-frequency lumps along each lock and over the mass (an
// irregular silhouette), four bigger front locks lifted apart with gaps dark inside, near-white on top, cool mid-grey
// lowlights in the grooves, at the nape and temples; three flyaways big enough to read against a dark background
R7.hair = { groove: 0.6, fine: 0.0016, breakup: 0.85, lump: 0.22, domeLump: 0.12, top: 0.0095, quiff: 0.004, crown: 0.0095, sideTrim: 0.03, side: 0.0105, backTrim: 0.12,
  tone: [0.74, 0.752, 0.785], low: [0.14, 0.155, 0.19], topHi: 0.16, sideLow: 0.38, depthLow: 0.5, quiffDark: 0.35, edgeJit: 0.0075, fadeW: 0.0065, lockH: 0.012,
  clumps: [[-124, 13, 140, -8, 31, 0.75, 2], [-98, 22, 148, -8, 29, 1.0, 3], [-68, 11, 156, -9, 30, 0.85, 2], [-46, 20, 150, -10, 46, 1.1, 3], [-22, 10, 160, -10, 48, 0.9, 2], [4, 25, 164, -10, 46, 1.2, 4],
    [27, 11, 152, -9, 50, 0.85, 2], [44, 18, 160, -6, 44, 1.05, 3], [63, 10, 154, -2, 33, 0.8, 2], [80, 19, 150, 2, 38, 0.95, 3], [101, 12, 148, 5, 31, 0.85, 2], [122, 21, 140, 6, 32, 0.8, 3]],
  locks: [[-36, 9, 114, -18, 0.02, 27, 0.009, 3], [-12, 10, 124, -16, 0.024, 26, 0.01, 3], [12, 10, 120, -18, 0.022, 27, 0.009, 3], [35, 8, 108, -14, 0.015, 29, 0.007, 3]], lockFinger: 0.26, fillHoles: 1,
  wisps: [[-20, 95, 24, 0.016, -8], [30, 110, 22, 0.018, 7], [-75, 85, 20, 0.014, -6], [60, 80, 14, 0.006, 4], [100, 92, 14, 0.005, 3], [-110, 100, 14, 0.005, -3], [5, 75, 14, 0.008, 3]],
  wispR0: 0.0016, wispR1: 0.0003, wispRoot: 0.5 };
