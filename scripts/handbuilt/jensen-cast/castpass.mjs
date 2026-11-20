// Jensen Heist's supporting cast, cast round 1: the owner's standing rules on every forged body, after the forge (forge.mjs).
//   skinTonePass(doc, T)   rule 4/7: a natural tone that fits the person (T, sRGB, their cheek's tone under neutral light),
//                          the detail kept as a ratio to the local tone; the hands and forearms graded to the face's tone
//   flatFrontPass(doc)     rule 1: a flat garment front, sternum to belt: in each 1 cm column of the torso's front, every
//                          point in front of the straight line from the sternum's point to the belt's is drawn back onto
//                          it (the clothes and the skin under them, within 4 cm of the front surface), never pushed out
//   faceRigPass(doc)       rule 6: baked face targets (FACE-CONTRACT.md: blinks, jaw, the 15 visemes made symmetric from
//                          the ARKit parts (Jensen's round-8 mouthTargets), smiles, brows), the mouth's dark cavity
//                          (Jensen's mouth bag), the lower teeth a biting edge over a dark cavity (no grey slab), the lower
//                          teeth swinging as one piece on the jaw's hinge
// Sources: MakeHuman Faceunits 01 / Visemes 02 (CC0) in .scratch/jensen/face (JH_FACE), as Jensen's build. Original work, CC0.
import os from 'node:os';
import { setWebp, sm } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { eyeFit } from '../frames.mjs';
import { addMorphs } from '../facekit.mjs';
import { mouthTargets } from '../jensen/round8.mjs';
import { mouthCavityPass } from '../jensen/round10.mjs';
import { relaxMorphsPass } from '../jensen/mouth.mjs';
import { matOf } from '../young-hero/glb.mjs';
import { mouthBagPass, teethRigidPass } from '../jensen/blender/face-pass.mjs';

const FACE = process.env.JH_FACE || new URL('../../../.scratch/jensen/face/', import.meta.url).pathname;
export const MORPHS = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', ...['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'].map((v) => 'viseme_' + v),
  'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight', 'eyeSquintLeft', 'eyeSquintRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'mouthClose',
  'eyeWideLeft', 'eyeWideRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'mouthFunnel'];
const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));

export async function skinTonePass(doc, T, K = {}) {
  K = { arm: 1, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data, E = eyeFit(doc), ey = (E.L.c[1] + E.R.c[1]) / 2, ez = (E.L.c[2] + E.R.c[2]) / 2;
  // a region's tone: the per-channel median (linear) of its texels (the forge's blush, brows and lips don't move it)
  const median = (sel) => { const ch = [[], [], []]; for (let i = 0; i < N2; i++) { if (Number.isNaN(pos[i * 3 + 1]) || !sel(i)) continue; for (let c = 0; c < 3; c++) ch[c].push(d[i * 4 + c]); }
    return ch[0].length ? ch.map((a) => { a.sort((x, y) => x - y); return lin(a[a.length >> 1]); }) : null; };
  // the face: its front from the cheekbones to the forehead (over any beard or stubble)
  const face = (i) => head[i] > 0.9 && pos[i * 3 + 2] > ez - 0.04 && pos[i * 3 + 1] > ey - 0.035 && pos[i * 3 + 1] < ey + 0.06 && Math.abs(pos[i * 3]) < 0.06;
  // (the forge paints the face's blush a strong red: a per-channel gain fitted to the median turned the rest green. So the
  // tone is set by luminance: each texel the target's colour at its own luminance relative to the face's, with a share
  // (K.keep) of its own hue kept, so lips, blush and stubble still read, softened)
  const Y = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b, c0 = median(face), Y0 = Y(...c0), tg = T.map(lin), Yt = Y(...tg), keep = K.keep ?? 0.3;
  for (let i = 0; i < N2; i++) { if (Number.isNaN(pos[i * 3 + 1])) continue; const c = [0, 1, 2].map((k) => lin(d[i * 4 + k])), y = Y(...c) / Y0;
    for (let k = 0; k < 3; k++) d[i * 4 + k] = enc(tg[k] * y * (1 - keep) + c[k] * (Yt / Y0) * keep); }
  // the hands and forearms (in the bind's A-pose: far out from the body's axis, under the shoulders) to the face's tone
  const shoulderY = ey - 0.2, armW = (i) => sm(0.26, 0.32, Math.abs(pos[i * 3])) * sm(shoulderY - 0.02, shoulderY - 0.2, pos[i * 3 + 1]) * K.arm;
  const h0 = median((i) => armW(i) > 0.9), f1 = median(face);
  if (h0) { const r = f1.map((x, c) => x / h0[c]); for (let i = 0; i < N2; i++) { if (Number.isNaN(pos[i * 3 + 1])) continue; const w = armW(i); if (!w) continue; for (let c = 0; c < 3; c++) d[i * 4 + c] = enc(lin(d[i * 4 + c]) * (1 + (r[c] - 1) * w)); } }
  await setWebp(tex, d, S, S, 90, 4);
  console.log('skin tone: face', c0.map(enc).join(','), 'keep', keep, '->', T.join(','), '; hands', h0 ? h0.map(enc).join(',') : '-', '-> the face\'s');
}

export function flatFrontPass(doc, K = {}) {
  const E = eyeFit(doc), ey = (E.L.c[1] + E.R.c[1]) / 2, H = doc.getRoot().getAsset().extras?.forge?.landmarks?.height || 1.7;
  // (the sternum: 25% of the height under the eyes' line ~ the armpits' level; the belt: the hip's top, 0.58 of the height)
  K = { ys: ey - 0.2 * H / 1.75, yb: 0.585 * H, xIn: 0.12, xOut: 0.17, depth: 0.04, slack: 0.002, ...K };
  const C = 0.01, col = (x) => Math.round(x / C), fade = (x) => { const a = Math.abs(x); return a <= K.xIn ? 1 : a >= K.xOut ? 0 : 1 - (a - K.xIn) / (K.xOut - K.xIn); };
  const R = doc.getRoot(), prims = R.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => /^(clothes|skin|neckline)$/.test(p.getMaterial()?.getName() || '') || p.getMaterial()?.getExtras()?.kind === 'cloth');
  // the front surface per column and 1 cm row (the outermost of every garment and the skin)
  const zf = new Map(); const seen = new Set();
  for (const p of prims) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
    // (round 2: sampled over each triangle every ~4 mm, not only at its corners: a coarse jacket left the sternum's and the
    // belt's cells empty and the pass did nothing)
    const put = (x, y, z) => { if (Math.abs(x) > K.xOut + C || y < K.yb - 0.03 || y > K.ys + 0.03 || z < 0) return; const k = col(x) + ',' + Math.round(y / C); zf.set(k, Math.max(zf.get(k) ?? -9, z)); };
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, L = Math.max(Math.hypot(A[a] - A[b], A[a + 1] - A[b + 1]), Math.hypot(A[a] - A[c], A[a + 1] - A[c + 1]), Math.hypot(A[b] - A[c], A[b + 1] - A[c + 1])), m = Math.min(12, Math.ceil(L / 0.004));
      for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) { const u = i / m, v = j / m, w = 1 - u - v; put(A[a] * w + A[b] * u + A[c] * v, A[a + 1] * w + A[b + 1] * u + A[c + 1] * v, A[a + 2] * w + A[b + 2] * u + A[c + 2] * v); } } }
  const at = (x, y) => zf.get(col(x) + ',' + Math.round(y / C));
  let n = 0, mx = 0;
  for (const p of prims) { const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice();
    for (let v = 0; v < A.length / 3; v++) { const x = A[v * 3], y = A[v * 3 + 1], z = A[v * 3 + 2]; if (y <= K.yb || y >= K.ys || z < 0) continue; const f = fade(x); if (!f) continue;
      const zs = at(x, K.ys); let zb = at(x, K.yb);
      // (round 2, K.waist: the belt's point the narrowest front between the belt and K.waist above it, so a flared hem doesn't carry the line out past the bust)
      if (K.waist && zb !== undefined) for (let yy = K.yb; yy <= K.yb + K.waist; yy += C) { const q = at(x, yy); if (q !== undefined && q > 0.04) zb = Math.min(zb, q); }
      // (K.beltMax: the belt's point no more than this in front of the sternum's (a heavy body's belly not carried into the line))
      if (K.beltMax != null && zb !== undefined && zs !== undefined) zb = Math.min(zb, zs + K.beltMax); if (zs === undefined || zb === undefined || zs < 0.04 || zb < 0.04) continue; const t = (y - K.yb) / (K.ys - K.yb), line = zb + (zs - zb) * t + K.slack;
      const front = at(x, y); if (front === undefined || front <= line) continue; if (front - z > K.depth) continue;
      const over = Math.min(K.max ?? 0.02, front - line), w = f * sm(0, 0.04, Math.min(y - K.yb, K.ys - y)); A[v * 3 + 2] = z - over * w; mx = Math.max(mx, over * w); n++; }
    acc.setArray(A); }
  console.log('flat front: sternum', K.ys.toFixed(3), 'belt', K.yb.toFixed(3), '; points drawn back', n, 'up to', (mx * 1000).toFixed(1), 'mm');
}

export async function faceRigPass(doc, K = {}) {
  mouthBagPass(doc, { rx: 0.027, ...K.bag });
  const G = mouthTargets(FACE, os.tmpdir() + '/jh-cast-mouth8');
  addMorphs(doc, MORPHS.map((n) => [n, G[n] || FACE + n + '.target']));
  // (the lips' points with no MakeHuman vertex stayed put while the lip moved: a dark wedge in the lower lip; the mouth's
  // folded and unmapped points eased, Jensen's relax, at this face's own mouth (Jensen's window round his eye line))
  const E = eyeFit(doc), ey = (E.L.c[1] + E.R.c[1]) / 2, ez = (E.L.c[2] + E.R.c[2]) / 2;
  relaxMorphsPass(doc, { y: [ey - 0.11, ey - 0.04], zMin: ez - 0.035, ...K.relax });
  // (the upper teeth a softer ivory: a bright white slab in the open visemes)
  matOf(doc, 'teethUp')?.setBaseColorFactor([0.68, 0.65, 0.6, 1]).setRoughnessFactor(0.6);
  await mouthCavityPass(doc, { edge: [0.474, 0.494], dark: [0.5, 0.52], tooth: [150, 140, 128], cave: [40, 16, 14], ...K.cavity });
  if (!/teethrigid/.test(process.env.JC_SKIP || '')) teethRigidPass(doc, K.teeth || {});
}
