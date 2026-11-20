// Jensen Heist's supporting cast, the finalize (20 Nov): rule 1c, a near-VERTICAL front (rules.mjs AHEAD_MAX).
// Rules round 2 met rule 1's flat-front number by slanting the front (the belt up to 89 mm ahead of the sternum): the
// profiles read as paunches. vertFrontPass pulls the lower front BACK toward a near-vertical line dropped from the
// sternum's own point (rules.mjs trunkLevels and its 3-row median anchors), never forward:
//   the line: the sternum's depth at its row, K.aim ahead of it at the belt's row (a slight forward fall, under the
//     15 mm cap), and straight down from there below the belt (|x| < K.xLow, K.below under it: the lower belly and the
//     fly with it, the thighs (their weight K.legW) left as they are)
//   per 1 cm (column, row) of the torso's middle, the front's excess over that line is an offset field, grown (a max over
//     +-K.grow) and blurred (K.blur), and every point of the clothes, the skin and the trim in that cell moves back by it,
//     the whole depth of the layers to K.d1 behind the front, fading to none at K.d2 (the back of the body is not moved):
//     the jacket, the shirt under it and the skin move together, so the buttons, the zips, the folds and the seams keep
//     their relief and their order. The sternum's rows are pinned (the line holds still pass to pass); eased to the sides
//     from K.xIn to K.xOut; the arms' points (their weight) left. Iterated until rules.mjs frontRule reads the belt within
//     K.target of the line and no bulge over K.bulge. The collar's ring round the neck (K.neck from the neck's axis, over
//     the K.neckY band under the sternum) is left where it is.
//   node scripts/handbuilt/jensen-cast/castpass6.mjs <in.glb> <out.glb> [K json]   (a built body, in place of a rebuild:
//   the mesh only; the clips, the textures and the node order are the file's own)
// Original procedural work, CC0.
import { sm } from '../young-hero/glb.mjs';
import { trunkLevels, frontRule, jointPos } from './rules.mjs';

const OUTER = /^(eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|cornea|beard)$/;
const NOT = /shoe|sneaker|boot|sole|lace|lining|eyelet|glasses|lens/;
const ARM = /^(shoulder|upperarm|lowerarm|wrist|finger|thumb|metacarpal)/, HEADJ = /^(head|jaw|eye|tongue|special|levator|oris|risorius|temporalis|orbicularis|cheek|nose)/, LEGJ = /^(upperleg|lowerleg|foot|toe)/;
function wOn(p, isJ) { const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), n = p.getAttribute('POSITION').getCount(), out = new Float32Array(n); if (!J || !W) return out; const j = [0, 0, 0, 0], w = [0, 0, 0, 0]; for (let i = 0; i < n; i++) { J.getElement(i, j); W.getElement(i, w); for (let k = 0; k < 4; k++) if (isJ[j[k]]) out[i] += w[k]; } return out; }

export function vertFrontPass(doc, K = {}) {
  K = { aim: 0.006, xIn: 0.11, xOut: 0.19, d1: 0.07, d2: 0.15, grow: 0.015, blur: 0.02, ease: 0.04, easeLow: 0.05, pin: 2, iters: 12, below: 0.14, xLow: 0.09, legW: [0.88, 0.99], target: 0.004, bulge: 0.006, neck: [0.07, 0.12], neckY: [0.08, 0.02], ...K };
  const R = doc.getRoot(), { ys, yb } = trunkLevels(doc), C = 0.01;
  const names = R.listSkins()[0].listJoints().map((j) => j.getName()), isArm = names.map((n) => ARM.test(n)), isLeg = names.map((n) => LEGJ.test(n)), isHead = names.map((n) => HEADJ.test(n));
  const skinned = R.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices() && p.getAttribute('JOINTS_0') && !OUTER.test(p.getMaterial()?.getName() || '') && !NOT.test(p.getMaterial()?.getName() || ''));
  const W = new Map(skinned.map((p) => [p, { aw: wOn(p, isArm), hw: wOn(p, isHead), lw: wOn(p, isLeg) }]));
  // (the collar: nothing within K.neck of the neck's axis near the sternum's height moves (a collar moved back while the
  // neck it rings stays is a torn collar with the neck through it, the critic's white shards on Mr. Board))
  const NK = jointPos(doc, 'neck01'), neckW = (x, y, z) => { const dn = Math.hypot(x - NK[0], z - NK[2]); return 1 - (1 - sm(K.neck[0], K.neck[1], dn)) * sm(ys - K.neckY[0], ys - K.neckY[1], y); };
  const key = (c, r) => c + ',' + r; let r0 = frontRule(doc);
  for (let it = 0; it < K.iters; it++) {
    r0 = frontRule(doc); if (r0.ahead <= K.aim + K.target && r0.dev <= K.bulge) break;
    // the front per (column, row): the outermost sampled point (the arms' and the head's triangles left out)
    const front = new Map();
    for (const p of skinned) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), { aw, hw } = W.get(p);
      for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (Math.max(aw[a], aw[b], aw[c]) > 0.3 || Math.max(hw[a], hw[b], hw[c]) > 0.3) continue;
        const L = Math.max(Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1]), Math.hypot(A[a * 3] - A[c * 3], A[a * 3 + 1] - A[c * 3 + 1])), m = Math.min(12, Math.max(1, Math.ceil(L / 0.004)));
        for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) { const u = i / m, v = j / m, w = 1 - u - v, x = A[a * 3] * w + A[b * 3] * u + A[c * 3] * v, y = A[a * 3 + 1] * w + A[b * 3 + 1] * u + A[c * 3 + 1] * v, z = A[a * 3 + 2] * w + A[b * 3 + 2] * u + A[c * 3 + 2] * v;
          if (Math.abs(x) > K.xOut + 0.02 || y < yb - K.below - 0.06 || y > ys + 0.04 || z < -0.05) continue; const k = key(Math.round(x / C), Math.round(y / C)); if (!(front.get(k) > z)) front.set(k, z); } } }
    // the line: from the sternum's anchor (rules.mjs's: its row's median of 3) down to K.aim ahead of it at the belt's row
    const rTop = Math.round(r0.yTop / C), rBot = Math.round(r0.yBot / C), zS = r0.dS, line = (r) => zS + K.aim * Math.min(1, Math.max(0, (rTop - r) / ((rTop - rBot) || 1)));
    const cMax = Math.round((K.xOut + 0.02) / C), over = new Map();
    for (let c = -cMax; c <= cMax; c++) for (let r = rBot - (Math.abs(c) * C <= K.xLow ? Math.round(K.below / C) : 0); r < rTop; r++) { const z = front.get(key(c, r)); if (z === undefined) continue; const o = z - line(r); if (o > 0) over.set(key(c, r), o); }
    const g = Math.round(K.grow / C), bl = Math.round(K.blur / C), F1 = new Map(), rLo = rBot - Math.round(K.below / C);
    for (let c = -cMax - bl; c <= cMax + bl; c++) for (let r = rLo - bl - 4; r <= rTop + bl + 2; r++) { let m = 0; for (let dc = -g; dc <= g; dc++) for (let dr = -g; dr <= g; dr++) m = Math.max(m, over.get(key(c + dc, r + dr)) || 0); if (m) F1.set(key(c, r), m); }
    const box = (Fm) => { const O = new Map(); for (let c = -cMax - 2 * bl; c <= cMax + 2 * bl; c++) for (let r = rLo - 2 * bl - 6; r <= rTop + 2 * bl + 4; r++) { let s = 0, n = 0; for (let dc = -bl; dc <= bl; dc++) for (let dr = -bl; dr <= bl; dr++) { s += Fm.get(key(c + dc, r + dr)) || 0; n++; } if (s) O.set(key(c, r), s / n); } return O; };
    const F = box(box(F1));
    const fieldAt = (x, y) => { const cx = x / C, cy = y / C, c0 = Math.floor(cx), q0 = Math.floor(cy), fx = cx - c0, fy = cy - q0, v = (c, r) => F.get(key(c, r)) || 0; return (v(c0, q0) * (1 - fx) + v(c0 + 1, q0) * fx) * (1 - fy) + (v(c0, q0 + 1) * (1 - fx) + v(c0 + 1, q0 + 1) * fx) * fy; };
    // (the sternum's rows pinned: none at its row, all K.pin rows under it)
    const pinW = (y) => Math.min(1, Math.max(0, (rTop - y / C - 0.5) / K.pin));
    const all = R.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => !OUTER.test(p.getMaterial()?.getName() || '') && !NOT.test(p.getMaterial()?.getName() || ''));
    const seen = new Set(); let mx = 0;
    for (const p of all) { const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice(), n = A.length / 3, ws = W.get(p) || (p.getAttribute('JOINTS_0') ? { aw: wOn(p, isArm), hw: wOn(p, isHead), lw: wOn(p, isLeg) } : null);
      for (let v = 0; v < n; v++) { const x = A[v * 3], y = A[v * 3 + 1], z = A[v * 3 + 2]; if (y < yb - K.below - K.easeLow - 0.02 || y > ys + 0.02 || z < -0.04) continue;
        const ax = Math.abs(x), fx = ax <= K.xIn ? 1 : ax >= K.xOut ? 0 : 1 - sm(K.xIn, K.xOut, ax); if (!fx) continue;
        const yl = yb - K.below, fy = y < yl ? 1 - sm(yl, yl - K.easeLow, y) : 1; if (!fy) continue;
        let o = fieldAt(Math.max(-K.xOut, Math.min(K.xOut, x)), Math.max(yl, Math.min(ys, y))); if (!o) continue;
        if (ws && ws.hw[v] > 0.3) continue; o *= pinW(y) * neckW(x, y, z); if (!o) continue;
        if (ws && y < yb) o *= 1 - sm(K.legW[0], K.legW[1], ws.lw[v]);
        const fr = front.get(key(Math.round(x / C), Math.round(Math.max(yl, Math.min(ys, y)) / C))) ?? z, depth = Math.max(0, fr - z), fd = depth <= K.d1 ? 1 : 1 - sm(K.d1, K.d2, depth); if (!fd) continue;
        const mv = o * fx * fy * fd * (ws ? 1 - Math.min(1, Math.max(0, (ws.aw[v] - 0.1) / 0.4)) : 1); if (!mv) continue; A[v * 3 + 2] = z - mv; mx = Math.max(mx, mv); }
      acc.setArray(A); }
    const r1 = frontRule(doc); console.log(`vertical front: pass ${it + 1}: belt ahead ${(r0.ahead * 1000).toFixed(1)} -> ${(r1.ahead * 1000).toFixed(1)} mm, bulge ${(r0.dev * 1000).toFixed(1)} -> ${(r1.dev * 1000).toFixed(1)}, sink ${(r0.sink * 1000).toFixed(1)} -> ${(r1.sink * 1000).toFixed(1)} (moved up to ${(mx * 1000).toFixed(1)} mm)`);
    if (mx < 0.0005) break;
  }
  return frontRule(doc);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const fs = await import('node:fs'), { read, write } = await import('../young-hero/glb.mjs'), { bodyMaskPass } = await import('./castpass2.mjs');
  const [inp, out, kj] = process.argv.slice(2), { doc, src } = await read(inp), K = kj ? JSON.parse(kj) : {};
  vertFrontPass(doc, K); if (!K.noMask) bodyMaskPass(doc);
  const glb = await write(doc, src); fs.writeFileSync(out, glb); console.log(out, glb.length, 'bytes');
}
