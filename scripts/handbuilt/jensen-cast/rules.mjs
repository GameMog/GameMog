// Jensen Heist's supporting cast, rules round 1 (20 Nov): the owner's hard rules 1 and 2 MEASURED on a built GLB, the
// same numbers for every body (the forged cast, Mr. Board, Jensen).
//   Rule 1, flat front: the side silhouette of the garment front (the farthest-forward point of the clothes, and of the
//     skin where nothing covers it, per 1 cm row over the torso's middle |x| < 13 cm, the arms' and the legs' points
//     left out) from the STERNUM to the BELT, and its largest forward deviation from the straight line between the two.
//     The sternum: the upper chest, min(the shoulder joints + 1 cm, the neck's base - 8 cm) (above the bust or the pecs,
//     so a mound under it is measured; each end the farthest forward of its own 3 rows; round 3's gate put it 5 cm under the shoulder joint, on the bust itself, and passed
//     every bust). The belt: 7 cm over the hip joints (or the file's own extras.rules.beltUp). The line runs between the silhouette's own points at those two
//     rows. Limit 12 mm, standing (the bind) and seated (sitTalk over its whole loop, sit).
//     Seated, the rows stay the body's own (the bind's height) and the line is drawn in the trunk's posed frame
//     (spine03's), so a slump that folds the jacket into a belly is measured as one.
//   Rule 2, seated posture: the ears (the head's most lateral skin points) over the shoulder joints: their horizontal
//     offset along the body's facing, head ahead positive, over the whole sitTalk loop and sit. Limit 3 cm.
//   node scripts/handbuilt/jensen-cast/rules.mjs a.glb [b.glb ...]   (RULES_OUT=<file> also writes the table there;
//   RULES_PROF=1 prints each profile row by row)
// Original procedural work, CC0.
import { THREE } from '../young-hero/glb.mjs';
import { jointPos } from './castpass2.mjs';

export const FRONT_MAX = 0.012, HEAD_MAX = 0.03;
const OUT = /^(eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|cornea|beard|glasses.*|lens.*|frame.*)$/;
const SKIPM = /shoe|sneaker|boot|sole|lace|lining|eyelet|glasses|lens/;
const ARM = /^(shoulder|upperarm|lowerarm|wrist|finger|thumb|metacarpal)/, LEG = /^(upperleg|lowerleg|foot|toe)/;

// the rule's levels on the body's own bind (m): the sternum's and the belt's height
export function trunkLevels(doc) {
  const S = jointPos(doc, 'upperarm01_L'), S2 = jointPos(doc, 'upperarm01_R'), N = jointPos(doc, 'neck01'), H = jointPos(doc, 'upperleg01_L');
  const sh = (S[1] + (S2 ? S2[1] : S[1])) / 2;
  // (a body whose belt sits lower on its hips says so in the file: its root's extras rules.beltUp (Mr. Board: 3 cm))
  const up = doc.getRoot().getExtras()?.rules?.beltUp ?? 0.07;
  return { ys: Math.min(sh + 0.01, N[1] - 0.08), yb: H[1] + up };
}

// every joint's skinning matrix (world x inverse bind) at a clip's time (null: the bind itself, identity)
export function skinMats(doc, anim, t) {
  const R = doc.getRoot(), sk = R.listSkins()[0], J = sk.listJoints();
  if (!anim) return { S: J.map(() => new THREE.Matrix4()), jw: (nm) => new THREE.Vector3(...jointPos(doc, nm)), J };
  const par = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const key = new Map();
  for (const ch of anim.listChannels()) { const s = ch.getSampler(), ti = s.getInput().getArray(), vo = s.getOutput(), es = vo.getElementSize();
    // (linear between the two keys around t; rotations slerped)
    let k = 0; while (k < ti.length - 1 && ti[k + 1] <= t) k++; const k2 = Math.min(ti.length - 1, k + 1), f = ti[k2] > ti[k] ? Math.max(0, Math.min(1, (t - ti[k]) / (ti[k2] - ti[k]))) : 0;
    const a = vo.getElement(k, new Array(es)), b = vo.getElement(k2, new Array(es)); let v;
    if (ch.getTargetPath() === 'rotation') { const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), f); v = [q.x, q.y, q.z, q.w]; } else v = a.map((x, i) => x + (b[i] - x) * f);
    key.set(ch.getTargetNode().getName() + '.' + ch.getTargetPath(), v); }
  const W = new Map(); const world = (n) => { if (!n) return new THREE.Matrix4(); if (W.has(n)) return W.get(n); const nm = n.getName();
    const w = world(par.get(n)).clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...(key.get(nm + '.translation') || n.getTranslation())), new THREE.Quaternion(...(key.get(nm + '.rotation') || n.getRotation())), new THREE.Vector3(...(key.get(nm + '.scale') || n.getScale())))); W.set(n, w); return w; };
  const IB = sk.getInverseBindMatrices(), S = J.map((j, i) => world(j).clone().multiply(new THREE.Matrix4().fromArray(IB.getElement(i, new Array(16)))));
  return { S, J, jw: (nm) => new THREE.Vector3().setFromMatrixPosition(world(J.find((j) => j.getName() === nm))) };
}

const blendM = (S, j, w) => { const el = new Array(16).fill(0), s = w[0] + w[1] + w[2] + w[3] || 1; for (let k = 0; k < 4; k++) if (w[k]) { const a = S[j[k]].elements; for (let q = 0; q < 16; q++) el[q] += a[q] * w[k] / s; } return new THREE.Matrix4().fromArray(el); };

// rule 1 at one pose: { dev (m), devY (the bind's height of the worst row), prof: [[y, mm], ...], ys, yb }
export function frontRule(doc, anim = null, t = 0, K = {}) {
  K = { x: 0.13, ...K };
  const R = doc.getRoot(), { S, J } = skinMats(doc, anim, t), names = J.map((j) => j.getName()), isArm = names.map((n) => ARM.test(n)), isLeg = names.map((n) => LEG.test(n));
  const { ys, yb } = trunkLevels(doc), C = 0.01;
  // the trunk's posed frame (spine03's turn from the bind)
  const i3 = names.indexOf('spine03'), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(S[i3]));
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const rows = new Map(), j = [0, 0, 0, 0], w = [0, 0, 0, 0], v = new THREE.Vector3();
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const nm = p.getMaterial()?.getName() || ''; if (OUT.test(nm) || SKIPM.test(nm) || !p.getIndices()) continue;
    const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA || !WA) continue;
    const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), n = A.length / 3, P = new Float32Array(n * 2), ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) { if (Math.abs(A[i * 3]) > K.x + 0.02 || A[i * 3 + 1] < yb - 0.03 || A[i * 3 + 1] > ys + 0.03) continue; JA.getElement(i, j); WA.getElement(i, w);
      let aw = 0, lw = 0; for (let k = 0; k < 4; k++) { if (isArm[j[k]]) aw += w[k]; if (isLeg[j[k]]) lw += w[k]; } if (aw > 0.3 || lw > 0.3) continue;
      v.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]); if (anim) v.applyMatrix4(blendM(S, j, w)); P[i * 2] = v.dot(up); P[i * 2 + 1] = v.dot(fw); ok[i] = 1; }
    // (each triangle sampled every ~4 mm: the rows by the bind's x and y, the values posed)
    for (let t3 = 0; t3 < I.length; t3 += 3) { const a = I[t3], b = I[t3 + 1], c = I[t3 + 2]; if (!ok[a] || !ok[b] || !ok[c]) continue;
      const L = Math.max(Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1]), Math.hypot(A[a * 3] - A[c * 3], A[a * 3 + 1] - A[c * 3 + 1]), Math.hypot(A[b * 3] - A[c * 3], A[b * 3 + 1] - A[c * 3 + 1])), m = Math.min(16, Math.max(1, Math.ceil(L / 0.004)));
      for (let ii = 0; ii <= m; ii++) for (let jj = 0; jj <= m - ii; jj++) { const u = ii / m, vv = jj / m, ww = 1 - u - vv, x = A[a * 3] * ww + A[b * 3] * u + A[c * 3] * vv, y = A[a * 3 + 1] * ww + A[b * 3 + 1] * u + A[c * 3 + 1] * vv;
        if (Math.abs(x) > K.x || y < yb - C / 2 || y > ys + C / 2) continue; const s = P[a * 2] * ww + P[b * 2] * u + P[c * 2] * vv, d = P[a * 2 + 1] * ww + P[b * 2 + 1] * u + P[c * 2 + 1] * vv, r = Math.round(y / C), o = rows.get(r);
        if (!o || d > o[1]) rows.set(r, [s, d]); } } }
  // (each end point the farthest forward of its own 3 rows (the sternum's and the 2 under it; the belt's and the 2 over it):
  // a button or a single sunk row is not the line's anchor)
  const end = (r0, dir) => { let b = null; for (let k = 0; k < 3; k++) { const o = rows.get(r0 + dir * k); if (o && (!b || o[1] > b[1])) b = o; } return b; };
  const rS = end(Math.round(ys / C), -1), rB = end(Math.round(yb / C), 1); if (!rS || !rB) return { dev: NaN, devY: 0, prof: [], ys, yb };
  const dS = rS[1], dB = rB[1]; let dev = -1, devY = ys; const prof = [];
  for (let r = Math.round(ys / C); r >= Math.round(yb / C); r--) { const o = rows.get(r); if (!o) continue; const f = (o[0] - rB[0]) / ((rS[0] - rB[0]) || 1), line = dB + (dS - dB) * f, d = o[1] - line; prof.push([+(r * C).toFixed(2), +(d * 1000).toFixed(1)]); if (d > dev) { dev = d; devY = r * C; } }
  return { dev: Math.max(0, dev), devY, prof, ys, yb };
}

// rule 1 on below the belt (standing, the bind): the lower belly and the fly, the band K.below under the belt over |x| <
// K.x (the thighs' points, leg weight over K.leg, left out): how far its front stands forward of the belt's own point (m).
// (round 4's critic: "a flat front to the crotch"; reported beside rule 1, held to the same 12 mm)
export function lowRule(doc, K = {}) {
  K = { below: 0.13, x: 0.06, leg: 0.95, ...K };
  const R = doc.getRoot(), names = R.listSkins()[0].listJoints().map((j) => j.getName()), isLeg = names.map((n) => LEG.test(n)), isArm = names.map((n) => ARM.test(n)), { yb } = trunkLevels(doc), C = 0.01, rows = new Map(), j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const nm = p.getMaterial()?.getName() || ''; if (OUT.test(nm) || SKIPM.test(nm) || !p.getIndices()) continue; const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA) continue;
    const A = p.getAttribute('POSITION').getArray();
    for (const i of new Set(p.getIndices().getArray())) { const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2]; if (Math.abs(x) > K.x || y > yb + 0.025 || y < yb - K.below) continue; JA.getElement(i, j); WA.getElement(i, w); let lw = 0, aw = 0; for (let k = 0; k < 4; k++) { if (isLeg[j[k]]) lw += w[k]; if (isArm[j[k]]) aw += w[k]; } if (lw > K.leg || aw > 0.3) continue;
      const r = Math.round(y / C); rows.set(r, Math.max(rows.get(r) ?? -9, z)); } }
  let zb = -9; for (let k = 0; k < 3; k++) zb = Math.max(zb, rows.get(Math.round(yb / C) + k) ?? -9); let dev = 0, devY = yb;
  for (const [r, z] of rows) if (r < Math.round(yb / C) && z - zb > dev) { dev = z - zb; devY = r * C; }
  return { dev, devY };
}

// rule 2 at one pose: the ears' offset ahead of the shoulder joints along the body's facing (m)
export function headRule(doc, anim, t) {
  const R = doc.getRoot(), { S, J, jw } = skinMats(doc, anim, t), names = J.map((j) => j.getName()), hi = names.indexOf('head');
  const skin = R.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'skin' && p.getAttribute('JOINTS_0'));
  const A = skin.getAttribute('POSITION').getArray(), JA = skin.getAttribute('JOINTS_0'), WA = skin.getAttribute('WEIGHTS_0'), j = [0, 0, 0, 0], w = [0, 0, 0, 0], hv = [];
  for (let i = 0; i < A.length / 3; i++) { JA.getElement(i, j); WA.getElement(i, w); let h = 0; for (let k = 0; k < 4; k++) if (j[k] === hi) h += w[k]; if (h > 0.9) hv.push(i); }
  hv.sort((a, b) => Math.abs(A[b * 3]) - Math.abs(A[a * 3])); const top = hv.slice(0, Math.max(4, Math.round(hv.length / 60)));
  const ear = new THREE.Vector3(); for (const i of top) ear.add(new THREE.Vector3(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]).applyMatrix4(S[hi])); ear.multiplyScalar(1 / top.length);
  const sh = jw('upperarm01_L').add(jw('upperarm01_R')).multiplyScalar(0.5);
  // (the facing: the hips' +z, level)
  const hp = jw('upperleg01_L').sub(jw('upperleg01_R')); const side = new THREE.Vector3(hp.x, 0, hp.z).normalize(), F = new THREE.Vector3(-side.z, 0, side.x);
  if (F.z < 0) F.negate();
  return ear.sub(sh).dot(F);
}

// the frames a seated rule is held on: sitTalk over its whole loop (every 0.25 s) and sit (its loop, every 0.5 s)
export function seatFrames(doc, pack) {
  const out = [];
  for (const [nm, step] of [['sitTalk', 0.25], ['sit', 0.5]]) { const a = doc.getRoot().listAnimations().find((x) => x.getName() === nm) || pack?.getRoot().listAnimations().find((x) => x.getName() === nm); if (!a) continue;
    let T = 0; for (const ch of a.listChannels()) { const ti = ch.getSampler().getInput().getArray(); T = Math.max(T, ti[ti.length - 1]); }
    for (let t = 0; t <= T + 1e-6; t += step) out.push([nm, a, +t.toFixed(2)]); }
  return out;
}

export function measureBody(doc, pack) {
  const st = frontRule(doc), low = lowRule(doc), fr = seatFrames(doc, pack); let seat = { dev: 0 }, head = { o: 0 }, headMin = { o: 9 };
  for (const [nm, a, t] of fr) { const r = frontRule(doc, a, t); if (r.dev > seat.dev) seat = { ...r, clip: nm, t }; const o = headRule(doc, a, t); if (o > head.o || head.clip === undefined) head = { o, clip: nm, t }; if (o < headMin.o) headMin = { o, clip: nm, t }; }
  return { st, low, seat, head, headMin, frames: fr.length };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const fs = await import('node:fs'), { read, io } = await import('../young-hero/glb.mjs');
  const pack = await io.read(new URL('../../../public/storykit/cast/cast-clips.glb', import.meta.url).pathname);
  const L = [`Jensen Heist cast, the owner's hard rules measured (scripts/handbuilt/jensen-cast/rules.mjs, ${new Date().toISOString().slice(0, 16)}Z)`,
    `rule 1 flat front: max forward deviation of the garment front from the straight sternum-belt line, limit ${FRONT_MAX * 1000} mm (standing = bind; seated = worst of sitTalk's loop and sit)`,
    `rule 2 seated posture: ears ahead of the shoulder joints (+ = head forward), limit ${HEAD_MAX * 100} cm (worst over sitTalk's loop and sit)`, '',
    'body              size MB | standing front mm (at y) | seated front mm (clip@t)   | seated head cm (max fwd .. min)  | verdict | below belt mm (y)'];
  for (const f of process.argv.slice(2)) { const { doc } = await read(f), m = measureBody(doc, pack), mb = fs.statSync(f).size / 1048576;
    const ok1 = m.st.dev <= FRONT_MAX && m.seat.dev <= FRONT_MAX && m.low.dev <= FRONT_MAX, ok2 = Math.max(Math.abs(m.head.o), Math.abs(m.headMin.o)) <= HEAD_MAX, ok3 = mb <= 6;
    L.push(`${f.split('/').pop().replace('.glb', '').padEnd(17)} ${mb.toFixed(2).padStart(6)} | ${(m.st.dev * 1000).toFixed(1).padStart(6)} (${m.st.devY.toFixed(2)})          | ${(m.seat.dev * 1000).toFixed(1).padStart(6)} (${m.seat.clip}@${m.seat.t})`.padEnd(77) + `| ${(m.head.o * 100).toFixed(1).padStart(5)} (${m.head.clip}@${m.head.t}) .. ${(m.headMin.o * 100).toFixed(1)}`.padEnd(35) + `| ${ok1 ? 'R1 PASS' : 'R1 FAIL'} ${ok2 ? 'R2 PASS' : 'R2 FAIL'}${ok3 ? '' : ' SIZE FAIL'} | ${(m.low.dev * 1000).toFixed(1)} (${m.low.devY.toFixed(2)})`);
    if (process.env.RULES_PROF) { L.push('   standing ' + m.st.prof.map(([y, d]) => y + ':' + d).join(' ')); if (m.seat.prof) L.push('   seated   ' + m.seat.prof.map(([y, d]) => y + ':' + d).join(' ')); } }
  console.log(L.join('\n')); if (process.env.RULES_OUT) fs.writeFileSync(process.env.RULES_OUT, L.join('\n') + '\n');
}
