// Jensen, caricature round 8 (the critic on round 7: the rest mouth a pursed, pouty closed-lip smirk with a pale bump
// under a bulging lower lip and a bunched chin; the open mouth shifting to one side in the keynote; the 'oh' and 'ff'
// visemes a duck-lip pout, no lower lip tucked under the upper teeth; the face puffy and doughy, jowly; the frame one
// straight visor bar; the hair a carved, scalloped helmet tight to the skull with a pale root band at the hairline; the
// skin a little porcelain; the brows a grey fuzzy patch).
// Universal cues only: nothing about the eyes' shape, the skin's tone family or any racialised feature.
//   mouthTargets(FACE, dir)  the visemes rebuilt from the face's own ARKit parts and every one made a mirror twin of
//                            itself (both halves the mean of the two): 'FF' the lower lip rolled in and up under the upper
//                            teeth, 'O' a rounded open O (the jaw down, the lips funnelled, no pout), the rest symmetric
// Original procedural work (no photographs, no assets), CC0.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readTarget } from '../facekit.mjs';
import { twins } from './caricature.mjs';

function sumOf(FACE, parts) { const sum = new Map();
  for (const [n, w] of parts) for (const [v, d] of readTarget(FACE + n + '.target')) { const o = sum.get(v) || [0, 0, 0]; sum.set(v, [o[0] + d[0] * w, o[1] + d[1] * w, o[2] + d[2] * w]); }
  return sum; }
function symOf(m) { const T = twins(), o = new Map();
  for (const k of new Set([...m.keys(), ...[...m.keys()].map((v) => T[v]).filter((t) => t >= 0)])) { const t = T[k], a = m.get(k) || [0, 0, 0], b = t >= 0 ? (m.get(t) || [0, 0, 0]) : a;
    o.set(k, [(a[0] - b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]); }
  return o; }
export function mouthTargets(FACE, dir, K = {}) {
  const R = { ...R8.visemes, ...K }; mkdirSync(dir, { recursive: true }); const out = {};
  for (const [name, parts] of Object.entries(R)) { const m = symOf(sumOf(FACE, parts)), f = `${dir}/${name}-r8.target`;
    writeFileSync(f, [...m].filter(([, d]) => d.some((x) => Math.abs(x) > 1e-6)).map(([v, d]) => `${v} ${d.map((x) => x.toFixed(5)).join(' ')}`).join('\n') + '\n'); out[name] = f; }
  console.log('mouth targets (round 8, symmetric):', Object.keys(out).join(' '));
  return out;
}

export const R8 = {
  // (the rest: a relaxed, warm presenter smile; the corners up and back evenly, the lower lip rolled flat (no pout), the
  // lips just parted, no chin bunching)
  grin: [['mouthSmileLeft', 0.52], ['mouthSmileRight', 0.52], ['mouthStretchLeft', 0.3], ['mouthStretchRight', 0.3], ['mouthRollLower', 0.35], ['mouthLowerDownLeft', 0.15], ['mouthLowerDownRight', 0.15],
    ['mouthUpperUpLeft', 0.08], ['mouthUpperUpRight', 0.08], ['jawOpen', 0.05], ['cheekSquintLeft', 0.4], ['cheekSquintRight', 0.4], ['browInnerUp', 0.1], ['browOuterUpLeft', 0.2], ['browOuterUpRight', 0.2]],
  visemes: {
    viseme_FF: [['viseme_FF', 0.2], ['mouthRollLower', 0.6], ['mouthShrugLower', 0.4], ['mouthUpperUpLeft', 0.9], ['mouthUpperUpRight', 0.9], ['jawOpen', 0.03]],
    viseme_O: [['jawOpen', 0.3], ['mouthFunnel', 0.6], ['mouthPucker', 0.15], ['mouthStretchLeft', -0.25], ['mouthStretchRight', -0.25]],
    viseme_U: [['viseme_U', 1]], viseme_aa: [['viseme_aa', 1]], viseme_E: [['viseme_E', 1]], viseme_I: [['viseme_I', 1]], viseme_PP: [['viseme_PP', 1]], viseme_TH: [['viseme_TH', 1]],
    viseme_DD: [['viseme_DD', 1]], viseme_kk: [['viseme_kk', 1]], viseme_CH: [['viseme_CH', 1]], viseme_SS: [['viseme_SS', 1]], viseme_nn: [['viseme_nn', 1]], viseme_RR: [['viseme_RR', 1]], viseme_sil: [['viseme_sil', 1]],
    jawOpen: [['jawOpen', 1]],
  },
};

// ---- the face's planes (the critic: a puffy, round, doughy face with jowls and a small chin; the references a squarer,
// broader jaw and cheekbones with defined planes): the lower cheek's puff and the jowls drawn in, the cheekbone's plane
// pushed out a little, the jaw's corners set out and down (rounded but firm), the chin a touch fuller and squarer; the age
// left in the lines, not in sagging volume. Symmetric by |x| on the head's own points.
import { skinMap } from '../facekit.mjs';
import { LM } from './landmarks.mjs';
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (d, r) => Math.exp(-((d / r) ** 2));
function weld(a) { const n = a.length / 3, key = new Map(), rep = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  return rep; }
function notSkin(doc, acc) { const s = new Set();
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (p.getAttribute('POSITION') !== acc || !/^(eyes|lashes|teethUp|teethLow)$/.test(mn)) continue;
    for (const v of p.getIndices().getArray()) s.add(v); }
  return s; }
export function shape8Pass(doc, K = {}) {
  K = { ...R8.shape, ...K };
  const { EY, EZ, EYEX, MOUTHY, CHINY } = LM;
  const M = skinMap(doc), a = M.P.getArray().slice(), n = M.n, rep = weld(a), skip = notSkin(doc, M.P), C = [0, EY - 0.03, EZ - 0.095];
  let peak = 0, moved = 0;
  for (let v = 0; v < n; v++) { if (rep[v] !== v || skip.has(v)) continue; const X = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(X), sg = Math.sign(X) || 1;
    if (y < CHINY - 0.05 || y > EY + 0.03 || x > 0.095 || z < -0.03) continue;
    let ox = X - C[0], oy = y - C[1], oz = z - C[2]; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;
    let out = 0, dx = 0, dy = 0, dz = 0;
    // (a) the lower cheek's puff (beside the mouth, under the cheekbone) and the jowls drawn in
    out -= K.puff * g2(Math.hypot(x - 0.047, (y - (MOUTHY + 0.004)) * 0.9), 0.017) * sm(0.02, 0.06, z);
    out -= K.jowl * g2(Math.hypot(x - 0.045, (y - (CHINY + 0.012)) * 1.1), 0.013) * sm(0.02, 0.06, z);
    // (b) the cheekbone's plane: out and a little forward, high under the eye's outer half (fading before the lower lid)
    { const t = g2(Math.hypot(x - (EYEX + 0.024), (y - (EY - 0.03)) * 1.3), 0.012) * sm(EY - 0.012, EY - 0.022, y); dx += sg * K.bone * t; dz += K.bone * 0.5 * t; }
    // (c) the jaw's corners set out and down (a firmer angle), the jaw line under the jowl kept clean
    { const t = g2(Math.hypot((x - 0.062) * 1.2, y - (CHINY + 0.024)), 0.016) * sm(-0.02, 0.01, z) * sm(0.07, 0.04, z); dx += sg * K.jaw * t; dy -= K.jaw * 0.6 * t; }
    // (d) the chin a touch fuller and squarer (forward and down, broad)
    { const t = g2(Math.hypot(x * 0.7, y - (CHINY + 0.004)), 0.012) * sm(0.06, 0.09, z); dz += K.chin * t; dy -= K.chin * 0.7 * t; }
    dx += ox * out; dy += oy * out; dz += oz * out;
    const m = Math.hypot(dx, dy, dz); if (m < 1e-7) continue; peak = Math.max(peak, m); moved++;
    a[v * 3] += X === 0 ? 0 : dx; a[v * 3 + 1] += dy; a[v * 3 + 2] += dz; }
  for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v && !skip.has(v)) for (let k = 0; k < 3; k++) a[v * 3 + k] = a[r * 3 + k]; }
  M.P.setArray(a); console.log('shape8: points', moved, 'peak mm', (peak * 1000).toFixed(2));
}
R8.shape = { puff: 0.0028, jowl: 0.0022, bone: 0.0016, jaw: 0.0018, chin: 0.0014 };

// ---- the frame (the critic: one thick straight bar like a visor or a VR band, wider than the face): the browline's top
// bar split into two shaped brows, each arching a little over its lens, thinner and lower over the bridge between them;
// the whole front narrowed to the face (the temples' hinge points in), the bar a little slimmer; the rims (grown in
// rimPass) a visible gunmetal so the frame reads at tile size
export function glasses8Pass(doc, K = {}) {
  K = { ...R8.glasses, ...K };
  const seen = new Set(), all = [];
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const mn = p.getMaterial()?.getName() || ''; if (!/^glasses-/.test(mn)) continue; const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); all.push([mn, acc, p]); }
  // the bar: the metal's points above the lens tops, at the front; its centre line per 0.5 mm of x
  const metal = all.find(([mn]) => mn === 'glasses-metal'); if (!metal) { console.log('glasses8: no metal'); return; }
  const MA = metal[1].getArray(), lo = new Map(), hi = new Map(), bin = (x) => Math.round(x / 0.0005);
  const isBar = (x, y, z) => z > K.zBar && y > K.yBar0;
  for (let i = 0; i < MA.length; i += 3) { const [x, y, z] = [MA[i], MA[i + 1], MA[i + 2]]; if (!isBar(x, y, z)) continue; const b = bin(x); lo.set(b, Math.min(lo.get(b) ?? 9, y)); hi.set(b, Math.max(hi.get(b) ?? -9, y)); }
  const centre = (x) => { for (let d = 0; d < 8; d++) for (const b of [bin(x) + d, bin(x) - d]) if (lo.has(b)) return (lo.get(b) + hi.get(b)) / 2; return K.yBarC; };
  let nb = 0, nn = 0;
  for (const [mn, acc] of all) { const A = acc.getArray().slice();
    for (let i = 0; i < A.length; i += 3) { let X = A[i], y = A[i + 1]; const z = A[i + 2], x = Math.abs(X), sg = Math.sign(X) || 1;
      if (mn === 'glasses-metal' && isBar(X, y, z)) { const c = centre(X);
        // thickness: thin over the bridge, full over the lenses, tapering a little at the end pieces
        const th = K.thick * (1 - (1 - K.bridgeThin) * (1 - sm(K.bridgeW * 0.6, K.bridgeW, x))) * (1 - 0.18 * sm(K.lensX + 0.022, K.lensX + 0.034, x));
        // each brow arching over its lens; the bridge set lower
        const u = (x - K.lensX) / K.arcW, arc = K.arc * Math.max(0, 1 - u * u) - K.bridgeDrop * (1 - sm(K.bridgeW * 0.5, K.bridgeW * 1.2, x));
        y = c + (y - c) * th + arc; nb++; }
      // the front narrowed to the face (the temples beyond follow the hinge's move)
      const w = sm(K.zN0, K.zN1, z); X = X * (1 - (1 - K.narrow) * w) - sg * (1 - w) * (1 - K.narrow) * K.hingeX * sm(0.05, 0.075, x);
      A[i] = X; A[i + 1] = y; nn++; }
    acc.setArray(A); }
  for (const [mn, , p] of all) { const m = p.getMaterial();
    if (mn === 'glasses-lens-edge') m.setBaseColorFactor([...K.rim, 1]).setMetallicFactor(0.85).setRoughnessFactor(0.32); }
  console.log('glasses8: bar points', nb, 'points', nn, 'narrow', K.narrow);
}
R8.glasses = { zBar: 0.128, yBar0: 1.6262, yBarC: 1.6305, thick: 0.78, bridgeThin: 0.5, bridgeW: 0.014, lensX: 0.042, arcW: 0.03, arc: 0.0012, bridgeDrop: 0.0012, narrow: 0.94, zN0: 0.09, zN1: 0.125, hingeX: 0.084, rim: [0.2, 0.205, 0.22] };
R8.rimGrow = 0.0011;

// ---- the skin (the owner after round 7: "Jensen skin now looks too white": chalky, pinkish-white): the graded map's tone
// a natural light-medium with warm undertones, measured against the references under neutral light (the studio render's
// cheek ~[200,160,135] sRGB, up from ~[226,206,195]); the same tone family, only less washed out; the T-zone sheen halved
R8.skinT = [196, 150, 122];
R8.sheen = 0.07;
