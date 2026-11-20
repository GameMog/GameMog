// Jensen Heist's supporting cast, rules round 1 (20 Nov): the owner's hard rules 1 and 2 made measurable (rules.mjs) and
// the passes that meet them, shared by every cast body and Mr. Board.
//   seatUprightPass(doc, K)  rule 2: the body's own 'sit' and 'sitTalk' (seatClipsPass's copies of the shared pack) solved
//                            key by key: the chest upright (the shoulder joints over the hip joints, K.lean), the spine's
//                            turn shared over spine04..spine01; then the ears over the shoulder joints (K.ear) by the neck
//                            (neck01, neck02), the head turned back to its own world turn in the key (the gaze and the chin
//                            kept); the clavicles back toward the standing idle's (relaxed shoulders, not rolled in) by K.clav. Measured after by
//                            rules.mjs headRule on the same frames.
//   flatFront5Pass(doc, K)   rule 1: the garment front from the sternum to the belt (rules.mjs trunkLevels) brought to the
//                            straight line between them. Per 1 cm column of the torso's middle, the front's excess over its
//                            line (the column's own sternum and belt points, the middle column's line capping the others)
//                            is taken as an offset field, grown (a max over +-K.grow) and blurred (K.blur), and every point
//                            of the clothes, the skin and the trim in that cell is moved back by it, the whole depth of
//                            the layers (fading to none K.d2 behind the front): the folds, the zip, the buttons and the
//                            seams keep their relief, they move with the front. Eased out above the sternum and below the
//                            belt over K.ease, and to the sides from K.xIn to K.xOut. Iterated until rules.mjs frontRule
//                            reads under K.target. Below the belt, to K.below under it (the fly's columns, |x| < K.xLow),
//                            the lower belly is held to the belt's point (no paunch under a flat stomach), the thighs
//                            (their weight K.legW) left as they are.
// Original procedural work, CC0.
import { THREE, sm } from '../young-hero/glb.mjs';
import { jointPos } from './castpass2.mjs';
import { trunkLevels, frontRule, headRule, seatFrames, lowRule } from './rules.mjs';

const CHAIN = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head', 'clavicle_L', 'clavicle_R', 'shoulder01_L', 'shoulder01_R'];

export function seatUprightPass(doc, K = {}) {
  K = { clips: ['sit', 'sitTalk'], lean: 0.0, ear: 0.005, maxSpine: 18, maxNeck: 30, clav: 0, keep: 1, unflex: { spine03: 0.6, spine02: 0.8, spine01: 0.8 }, spine: { spine04: 0.15, spine03: 0.3, spine02: 0.3, spine01: 0.25 }, neck: { neck01: 0.55, neck02: 0.45 }, ...K };
  const R = doc.getRoot(), sk = R.listSkins()[0], J = sk.listJoints(), byName = new Map(J.map((j) => [j.getName(), j])), par = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const IB = sk.getInverseBindMatrices(), ib = J.map((j, i) => new THREE.Matrix4().fromArray(IB.getElement(i, new Array(16))));
  // (the bind's own turn of each joint (its world rotation in the bind): the clavicles relaxed back toward it)
  const bindRot = new Map(J.map((j, i) => [j.getName(), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(ib[i].clone().invert()))]));
  // (upright: the standing idle's first frame, joint by joint (the body's own idle, else the shared pack's): the clips'
  // turns are in the pack skeleton's frames, not the bind's)
  const idle = R.listAnimations().find((x) => x.getName() === 'idle') || K.pack?.getRoot().listAnimations().find((x) => x.getName() === 'idle'), up = new Map();
  if (idle) for (const c of idle.listChannels()) if (c.getTargetPath() === 'rotation') up.set(c.getTargetNode().getName(), new THREE.Quaternion(...c.getSampler().getOutput().getElement(0, [0, 0, 0, 1])));
  const log = [];
  for (const name of K.clips) { const a = R.listAnimations().find((x) => x.getName() === name); if (!a) continue;
    // every channel's value at any t (linear, slerped)
    const ch = new Map(); for (const c of a.listChannels()) { const s = c.getSampler(), so = s.getOutput(), es = so.getElementSize(), n = so.getCount(), O = new Float32Array(n * es), el = new Array(es); for (let i = 0; i < n; i++) { so.getElement(i, el); for (let q = 0; q < es; q++) O[i * es + q] = el[q]; } ch.set(c.getTargetNode().getName() + '.' + c.getTargetPath(), { c, ti: Float32Array.from(s.getInput().getArray()), O, es }); }
    const val = (key, t, dflt) => { const C = ch.get(key); if (!C) return dflt; const { ti, O, es } = C; let k = 0; while (k < ti.length - 1 && ti[k + 1] <= t) k++; const k2 = Math.min(ti.length - 1, k + 1), f = ti[k2] > ti[k] ? Math.max(0, Math.min(1, (t - ti[k]) / (ti[k2] - ti[k]))) : 0;
      const A = Array.from(O.subarray(k * es, k * es + es)), B = Array.from(O.subarray(k2 * es, k2 * es + es)); if (es === 4) { const q = new THREE.Quaternion(...A).slerp(new THREE.Quaternion(...B), f); return [q.x, q.y, q.z, q.w]; } return A.map((x, i) => x + (B[i] - x) * f); };
    const times = new Set(); for (const nm of CHAIN) { const C = ch.get(nm + '.rotation'); if (C) for (const t of C.ti) times.add(+t.toFixed(4)); }
    const T = [...times].sort((x, y) => x - y), out = new Map(CHAIN.map((nm) => [nm, []]));
    let before = [], after = [], pre = [], mL = 0, mO = 0;
    for (const pass of [0, 1]) { if (pass) { mL = pre.reduce((a, x) => a + x[0], 0) / pre.length; mO = pre.reduce((a, x) => a + x[1], 0) / pre.length; }
    for (const [ti, t] of T.entries()) {
      const loc = new Map(); for (const n of R.listNodes()) { const nm = n.getName(); loc.set(n, { t: val(nm + '.translation', t, n.getTranslation()), r: new THREE.Quaternion(...val(nm + '.rotation', t, n.getRotation())), s: val(nm + '.scale', t, n.getScale()) }); }
      const worldOf = () => { const W = new Map(); const w = (n) => { if (!n) return new THREE.Matrix4(); if (W.has(n)) return W.get(n); const L = loc.get(n); const m = w(par.get(n)).clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...L.t), L.r, new THREE.Vector3(...L.s))); W.set(n, m); return m; }; return w; };
      let w = worldOf(); const pos = (nm) => new THREE.Vector3().setFromMatrixPosition(w(byName.get(nm))), rot = (n) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(w(n)));
      const mid = (a, b) => pos(a).add(pos(b)).multiplyScalar(0.5);
      const side = pos('upperleg01_L').sub(pos('upperleg01_R')); side.y = 0; side.normalize(); let F = new THREE.Vector3(-side.z, 0, side.x); if (F.z < 0) F.negate();
      const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), F).normalize(); // (a positive turn about it tips the top back? measured below)
      // a world turn of angle (deg) about the lateral axis at a joint: its local rotation r' = qpw^-1 Q qpw r
      const turn = (nm, deg) => { const n = byName.get(nm); if (!n || !deg) return; const qpw = rot(par.get(n)), Q = new THREE.Quaternion().setFromAxisAngle(axis, deg * Math.PI / 180); loc.get(n).r = qpw.clone().invert().multiply(Q).multiply(qpw).multiply(loc.get(n).r); };
      const headW0 = rot(byName.get('head')), earPts = earOf(doc), ear = () => { const hi = J.indexOf(byName.get('head')), m = w(byName.get('head')).clone().multiply(ib[hi]); return earPts.clone().applyMatrix4(m); };
      const lean = () => { const v = mid('upperarm01_L', 'upperarm01_R').sub(mid('upperleg01_L', 'upperleg01_R')); return Math.atan2(v.dot(F), v.y) * 180 / Math.PI; };
      const off = () => ear().sub(mid('upperarm01_L', 'upperarm01_R')).dot(F);
      if (!pass) { pre.push([lean(), off()]); continue; }
      before.push(pre[ti]);
      // (the targets keep the clip's own sway around its mean: only the mean is moved, by K.keep of each key's own swing)
      const tL = K.lean + K.keep * (pre[ti][0] - mL), tE = K.ear + K.keep * (pre[ti][1] - mO);
      // (which way the axis tips: a small test turn of the spine)
      const sgn = (() => { const l0 = lean(); turn('spine03', 2); w = worldOf(); const l1 = lean(); turn('spine03', -2); w = worldOf(); if (process.env.SEATDBG && t === T[0]) console.log('sgn test', l0, l1); return l1 < l0 ? 1 : -1; })();
      // the chest upright
      // the clavicles relaxed toward the standing idle's turn (no shrug, no shoulders rolled in over the table)
      for (const nm of ['clavicle_L', 'clavicle_R', 'shoulder01_L', 'shoulder01_R']) { const n = byName.get(nm); if (!n || !K.clav || !up.has(nm)) continue; loc.get(n).r = loc.get(n).r.clone().slerp(up.get(nm), K.clav); w = worldOf(); }
      // the slump's curl taken out: each upper spine joint's turn on its parent eased toward the standing idle's (K.unflex), so the
      // chest is a straight board over the hips, not a curl (a curl folds the front into a belly)
      for (const [nm, k] of Object.entries(K.unflex)) { const n = byName.get(nm); if (!n || !k || !up.has(nm)) continue; loc.get(n).r = loc.get(n).r.clone().slerp(up.get(nm), k); w = worldOf(); }
      // (iterated: a turn low in the spine carries the shoulders further than its angle)
      let spun = 0; for (let k = 0; k < 6; k++) { const dl = lean() - tL; if (Math.abs(dl) < 0.15 || Math.abs(spun) >= K.maxSpine) break; const d = Math.max(-K.maxSpine - spun, Math.min(K.maxSpine - spun, dl)); for (const [nm, f] of Object.entries(K.spine)) { turn(nm, sgn * d * f); w = worldOf(); } spun += d; }

      // the ears over the shoulders: the neck's turn by bisection, the head held to its own world turn
      const holdHead = () => { const n = byName.get('head'), qpw = rot(par.get(n)); loc.get(n).r = qpw.clone().invert().multiply(headW0); w = worldOf(); };
      holdHead();
      const setNeck = (deg) => { for (const [nm, f] of Object.entries(K.neck)) { turn(nm, sgn * deg * f); w = worldOf(); } holdHead(); };
      if (Math.abs(off() - tE) > 0.002) { let lo = -K.maxNeck, hi = K.maxNeck, cur = 0; const snap = new Map([...loc].map(([n, L]) => [n, { ...L, r: L.r.clone() }]));
        const at = (deg) => { for (const [n, L] of snap) loc.set(n, { ...L, r: L.r.clone() }); w = worldOf(); setNeck(deg); return off() - tE; };
        // (more neck turn back: the ear further back; f(deg) falls with deg)
        const flo = at(lo), fhi = at(hi); if (process.env.SEATDBG && ti === 0) console.log('neck', name, 'f(lo)', flo, 'f(hi)', fhi, 'f(0)', at(0)); if (flo * fhi > 0) cur = Math.abs(flo) < Math.abs(fhi) ? lo : hi; else { for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2, fm = at(m); if ((fm > 0) === (flo > 0)) lo = m; else hi = m; } cur = (lo + hi) / 2; }
        at(cur); }
      after.push([lean(), off()]);
      for (const nm of CHAIN) { const n = byName.get(nm); if (n) { const q = loc.get(n).r; out.get(nm).push([t, q.x, q.y, q.z, q.w]); } }
    } }
    // the chain's rotation channels written back at the union of their keys (float)
    const buf = R.listBuffers()[0];
    for (const nm of CHAIN) { const n = byName.get(nm), keys = out.get(nm); if (!n || !keys.length) continue; const C = ch.get(nm + '.rotation');
      const inp = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(keys.map((k) => k[0]))).setBuffer(buf), outp = doc.createAccessor().setType('VEC4').setArray(Float32Array.from(keys.flatMap((k) => k.slice(1)))).setBuffer(buf);
      if (C) { C.c.getSampler().setInput(inp).setOutput(outp).setInterpolation('LINEAR'); }
      else { const smp = doc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation('LINEAR'); a.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath('rotation').setSampler(smp)); } }
    const st = (L, i) => { const v = L.map((x) => x[i]); return `${Math.min(...v).toFixed(i ? 3 : 1)}..${Math.max(...v).toFixed(i ? 3 : 1)}`; };
    log.push(`${name} (${T.length} keys): lean ${st(before, 0)} -> ${st(after, 0)} deg, ear ahead ${st(before, 1)} -> ${st(after, 1)} m`);
  }
  console.log('seat upright:', log.join(' | '));
}

// the ears (the head's most lateral skin points) in the bind, their mean
const EARS = new WeakMap();
function earOf(doc) {
  if (EARS.has(doc)) return EARS.get(doc).clone();
  const R = doc.getRoot(), J = R.listSkins()[0].listJoints(), hi = J.findIndex((j) => j.getName() === 'head');
  const skin = R.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'skin' && p.getAttribute('JOINTS_0'));
  const A = skin.getAttribute('POSITION').getArray(), JA = skin.getAttribute('JOINTS_0'), WA = skin.getAttribute('WEIGHTS_0'), j = [0, 0, 0, 0], w = [0, 0, 0, 0], hv = [];
  for (let i = 0; i < A.length / 3; i++) { JA.getElement(i, j); WA.getElement(i, w); let h = 0; for (let k = 0; k < 4; k++) if (j[k] === hi) h += w[k]; if (h > 0.9) hv.push(i); }
  hv.sort((a, b) => Math.abs(A[b * 3]) - Math.abs(A[a * 3])); const top = hv.slice(0, Math.max(4, Math.round(hv.length / 60)));
  const e = new THREE.Vector3(); for (const i of top) e.add(new THREE.Vector3(A[i * 3], A[i * 3 + 1], A[i * 3 + 2])); e.multiplyScalar(1 / top.length); EARS.set(doc, e); return e.clone();
}

// ---- rule 1
const OUTER = /^(eyes|brows|lashes|teethUp|teethLow|mouth-inside|tongue|hair|hairUnder|headset|cornea|beard)$/;
const NOT = /shoe|sneaker|boot|sole|lace|lining|eyelet|glasses|lens/;
const ARM = /^(shoulder|upperarm|lowerarm|wrist|finger|thumb|metacarpal)/;
export function flatFront5Pass(doc, K = {}) {
  K = { xIn: 0.12, xOut: 0.19, d2: 0.1, d1: 0.03, grow: 0.015, blur: 0.02, ease: 0.04, easeLow: 0.05, target: 0.005, iters: 5, below: 0.14, xLow: 0.09, legW: [0.88, 0.99], slack: 0.002, lean: null, ...K };
  const R = doc.getRoot(), { ys, yb } = trunkLevels(doc), C = 0.01;
  const prims = R.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getIndices() && !OUTER.test(p.getMaterial()?.getName() || '') && !NOT.test(p.getMaterial()?.getName() || '') && p.getAttribute('JOINTS_0'));
  const names = R.listSkins()[0].listJoints().map((j) => j.getName()), isArm = names.map((n) => ARM.test(n)), isLeg = names.map((n) => /^(upperleg|lowerleg|foot|toe)/.test(n));
  let total = 0, nMoved = 0;
  for (let it = 0; it < K.iters; it++) {
    const r0 = frontRule(doc); if (r0.dev <= K.target) break;
    // the front per (column, row): the outermost sampled point
    const front = new Map(), key = (c, r) => c + ',' + r;
    for (const p of prims) { const A = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), aw = armW(p, isArm);
      for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; if (Math.max(aw[a], aw[b], aw[c]) > 0.3) continue;
        const L = Math.max(Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1]), Math.hypot(A[a * 3] - A[c * 3], A[a * 3 + 1] - A[c * 3 + 1])), m = Math.min(12, Math.max(1, Math.ceil(L / 0.004)));
        for (let i = 0; i <= m; i++) for (let j = 0; j <= m - i; j++) { const u = i / m, v = j / m, w = 1 - u - v, x = A[a * 3] * w + A[b * 3] * u + A[c * 3] * v, y = A[a * 3 + 1] * w + A[b * 3 + 1] * u + A[c * 3 + 1] * v, z = A[a * 3 + 2] * w + A[b * 3 + 2] * u + A[c * 3 + 2] * v;
          if (Math.abs(x) > K.xOut + 0.02 || y < yb - K.below - 0.06 || y > ys + 0.04 || z < -0.05) continue; const k = key(Math.round(x / C), Math.round(y / C)); if (!(front.get(k) > z)) front.set(k, z); } } }
    // each column's line: its own sternum and belt points; the middle column's line caps the others (a mound beside the
    // middle is no column of its own)
    const rS = Math.round(ys / C), rB = Math.round(yb / C), cMax = Math.round((K.xOut + 0.02) / C);
    const m3 = (cc, r0, dir) => { let b; for (let k = 0; k < 3; k++) { const z = front.get(key(cc, r0 + dir * k)); if (z !== undefined && !(b >= z)) b = z; } return b; };
    const lineOf = (c) => { let cc = c; let zs, zb; for (; ; cc -= Math.sign(cc)) { zs = m3(cc, rS, -1); zb = m3(cc, rB, 1); if ((zs !== undefined && zb !== undefined) || cc === 0) break; } if (zs === undefined || zb === undefined) return null; if (K.lean != null) zb = Math.min(zb, zs + K.lean); return (r) => zb + (zs - zb) * (r - rB) / (rS - rB); };
    const mid = lineOf(0);
    const over = new Map();
    for (let c = -cMax; c <= cMax; c++) { const L = lineOf(c); if (!L) continue; for (let r = rB - (Math.abs(c) * C <= K.xLow ? Math.round(K.below / C) : 0); r <= rS; r++) { const z = front.get(key(c, r)); if (z === undefined) continue; const rr = Math.max(r, rB), line = Math.min(L(rr), mid ? mid(rr) : L(rr)); const o = z - line + K.slack; if (o > 0) over.set(key(c, r), o); } }
    // grown (a max over +-grow) then blurred (a box over +-blur, twice): one smooth field
    const g = Math.round(K.grow / C), bl = Math.round(K.blur / C), F1 = new Map();
    for (let c = -cMax - bl; c <= cMax + bl; c++) for (let r = rB - Math.round(K.below / C) - bl - 4; r <= rS + bl + 2; r++) { let m = 0; for (let dc = -g; dc <= g; dc++) for (let dr = -g; dr <= g; dr++) m = Math.max(m, over.get(key(c + dc, r + dr)) || 0); if (m) F1.set(key(c, r), m); }
    const box = (Fm) => { const O = new Map(); for (let c = -cMax - 2 * bl; c <= cMax + 2 * bl; c++) for (let r = rB - Math.round(K.below / C) - 2 * bl - 6; r <= rS + 2 * bl + 4; r++) { let s = 0, n = 0; for (let dc = -bl; dc <= bl; dc++) for (let dr = -bl; dr <= bl; dr++) { s += Fm.get(key(c + dc, r + dr)) || 0; n++; } if (s) O.set(key(c, r), s / n); } return O; };
    const F = box(box(F1));
    const fieldAt = (x, y) => { const cx = x / C, cy = y / C, c0 = Math.floor(cx), r0i = Math.floor(cy), fx = cx - c0, fy = cy - r0i, v = (c, r) => F.get(key(c, r)) || 0; return (v(c0, r0i) * (1 - fx) + v(c0 + 1, r0i) * fx) * (1 - fy) + (v(c0, r0i + 1) * (1 - fx) + v(c0 + 1, r0i + 1) * fx) * fy; };
    // every point of the clothes, the skin and the trim moved back by the field (the whole depth of the layers to d1,
    // fading to none at d2 behind the front: the back of the body is not pushed in)
    const all = R.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => !OUTER.test(p.getMaterial()?.getName() || '') && !NOT.test(p.getMaterial()?.getName() || ''));
    const seen = new Set(); let mx = 0;
    for (const p of all) { const acc = p.getAttribute('POSITION'); if (seen.has(acc)) continue; seen.add(acc); const A = acc.getArray().slice(), aw = p.getAttribute('JOINTS_0') ? armW(p, isArm) : new Float32Array(A.length / 3), lw = p.getAttribute('JOINTS_0') ? armW(p, isLeg) : new Float32Array(A.length / 3);
      for (let v = 0; v < A.length / 3; v++) { const x = A[v * 3], y = A[v * 3 + 1], z = A[v * 3 + 2]; if (y < yb - K.below - K.easeLow - 0.02 || y > ys + K.ease + 0.02 || z < -0.02) continue;
        const ax = Math.abs(x), fx = ax <= K.xIn ? 1 : ax >= K.xOut ? 0 : 1 - sm(K.xIn, K.xOut, ax); if (!fx) continue;
        const yl = yb - K.below, fy = y > ys ? 1 - sm(ys, ys + K.ease, y) : y < yl ? 1 - sm(yl, yl - K.easeLow, y) : 1; if (!fy) continue;
        let o = fieldAt(Math.max(-K.xOut, Math.min(K.xOut, x)), Math.max(yb - K.below, Math.min(ys, y))); if (!o) continue;
        if (y < yb) o *= 1 - sm(K.legW[0], K.legW[1], lw[v]);
        const fr = front.get(key(Math.round(x / C), Math.round(Math.max(yb - K.below, Math.min(ys, y)) / C))) ?? z, depth = Math.max(0, fr - z), fd = depth <= K.d1 ? 1 : 1 - sm(K.d1, K.d2, depth); if (!fd) continue;
        const mv = o * fx * fy * fd * (1 - Math.min(1, Math.max(0, (aw[v] - 0.1) / 0.4))); if (mv <= 0) continue; A[v * 3 + 2] = z - mv; mx = Math.max(mx, mv); nMoved++; }
      acc.setArray(A); }
    total = Math.max(total, mx);
    const r1 = frontRule(doc); console.log(`flat front 5: pass ${it + 1}: ${(r0.dev * 1000).toFixed(1)} -> ${(r1.dev * 1000).toFixed(1)} mm (moved up to ${(mx * 1000).toFixed(1)} mm)`);
  }
  return frontRule(doc);
}
function armW(p, isArm) { const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), n = p.getAttribute('POSITION').getCount(), out = new Float32Array(n); if (!J || !W) return out; const j = [0, 0, 0, 0], w = [0, 0, 0, 0]; for (let i = 0; i < n; i++) { J.getElement(i, j); W.getElement(i, w); for (let k = 0; k < 4; k++) if (isArm[j[k]]) out[i] += w[k]; } return out; }

// the gates the build holds (rules.mjs on the built doc): the standing and the seated front, the seated head
export function rulesGate(doc, id, pack, K = {}) {
  const fr = seatFrames(doc, pack); const st = frontRule(doc); let seat = 0, head = -9, headMin = 9;
  for (const [, a, t] of fr) { seat = Math.max(seat, frontRule(doc, a, t).dev); const o = headRule(doc, a, t); head = Math.max(head, o); headMin = Math.min(headMin, o); }
  const low = lowRule(doc).dev, ok1 = st.dev <= 0.012 && seat <= 0.012 && low <= 0.012, ok2 = Math.max(Math.abs(head), Math.abs(headMin)) <= 0.03;
  console.log(`rules gate: ${id} front standing ${(st.dev * 1000).toFixed(1)} mm (below the belt ${(low * 1000).toFixed(1)}), seated ${(seat * 1000).toFixed(1)} mm (limit 12) ${ok1 ? 'PASS' : 'FAIL'}; seated ears ${(headMin * 100).toFixed(1)}..${(head * 100).toFixed(1)} cm ahead of the shoulders (limit 3) ${ok2 ? 'PASS' : 'FAIL'}`);
  if ((!ok1 || !ok2) && K.hard && !process.env.JC_NOGATE) throw new Error(`rules gate: ${id} failed`);
  return { st: st.dev, low, seat, head, headMin };
}
void jointPos;

// rule 1 seated: the chest's front off the arms. A seated talk reaches the hands to the table, and every point of the
// chest's front that carries some of the shoulder's or the upper arm's weight is pulled forward with them: a mound under
// the arms that no flat rest can stop. The front of the torso (the clothes and the skin, |x| < K.xOut, the sternum's
// height + K.up down to the belt, z > K.z0) has its arm weight eased out toward the middle (none left inside K.xIn, all
// kept from K.xOut), the weight it gives up handed to the spine at its height (spine01 above K.split, spine02 under).
export function chestWeightPass(doc, K = {}) {
  K = { xIn: 0.07, xOut: 0.16, up: 0.03, z0: 0.0, ...K };
  const R = doc.getRoot(), names = R.listSkins()[0].listJoints().map((j) => j.getName()), isArm = names.map((n) => ARM.test(n)), { ys, yb } = trunkLevels(doc);
  const s1 = names.indexOf('spine01'), s2 = names.indexOf('spine02'), split = K.split ?? (ys + yb) / 2 + 0.05; let n = 0, mx = 0;
  const seen = new Set();
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const nm = p.getMaterial()?.getName() || ''; if (OUTER.test(nm) || NOT.test(nm)) continue; const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA || !WA || seen.has(WA)) continue; seen.add(WA);
    const A = p.getAttribute('POSITION').getArray(), j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let i = 0; i < A.length / 3; i++) { const x = Math.abs(A[i * 3]), y = A[i * 3 + 1], z = A[i * 3 + 2]; if (x >= K.xOut || y > ys + K.up || y < yb || z < K.z0) continue; JA.getElement(i, j); WA.getElement(i, w);
      let aw = 0; for (let k = 0; k < 4; k++) if (isArm[j[k]]) aw += w[k]; if (aw < 1e-4) continue;
      const keep = sm(K.xIn, K.xOut, x) * (y > ys ? 1 - sm(ys + K.up, ys, y) * (1 - 1) : 1), give = aw * (1 - keep); if (give < 1e-4) continue;
      for (let k = 0; k < 4; k++) if (isArm[j[k]]) w[k] *= keep;
      const tgt = y > split ? s1 : s2; let slot = j.indexOf(tgt); if (slot < 0 || w[slot] === 0 && j[slot] !== tgt) { slot = -1; for (let k = 0; k < 4; k++) if (j[k] === tgt) slot = k; }
      if (slot < 0) { let lo = 0; for (let k = 1; k < 4; k++) if (w[k] < w[lo]) lo = k; const lost = w[lo]; w[lo] = 0; j[lo] = tgt; slot = lo; w[slot] += lost; }
      w[slot] += give; const s = w[0] + w[1] + w[2] + w[3]; for (let k = 0; k < 4; k++) w[k] /= s;
      JA.setElement(i, j); WA.setElement(i, w); n++; mx = Math.max(mx, give); } }
  console.log('chest weights: the front off the arms,', n, 'points, up to', mx.toFixed(2), 'of the weight to the spine');
}

// rule 3, a mouth that reads painted (Mr. Board's "cartoon-red inner mouth"): every reddish texel of the teeth's and the
// tongue's textures (the gums, the tongue) taken to a muted dark rose by its own light (K.col, linear, x its luminance /
// K.mid), the white of the teeth left alone; the materials' factors kept
export async function mouthTamePass(doc, K = {}) {
  K = { mats: /^(teethUp|teethLow|tongue)$/, col: [0.36, 0.17, 0.16], mid: 0.25, max: 0.7, ...K };
  const { rgba, setWebp } = await import('../young-hero/glb.mjs'); const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const seen = new Set(); let n = 0;
  for (const m of doc.getRoot().listMaterials()) { if (!K.mats.test(m.getName())) continue; const t = m.getBaseColorTexture(); if (!t || seen.has(t)) continue; seen.add(t);
    const { data, w, h } = await rgba(t);
    for (let i = 0; i < w * h; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const red = (r - Math.max(g, b)) / (r + 1); if (red < 0.12) continue; const a = Math.min(1, (red - 0.12) / 0.15);
      const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b), k = Math.min(K.max, Math.max(0.15, L / K.mid * 0.5 + 0.25));
      for (let c = 0; c < 3; c++) data[i * 4 + c] = enc(lin(data[i * 4 + c]) * (1 - a) + K.col[c] * k * a); n++; }
    await setWebp(t, data, w, h, 92); }
  console.log('mouth tamed:', n, 'reddish texels to a muted rose');
}

// the inside of the lips and the mouth's own skin (a body whose skin mesh runs on into the mouth, Mr. Board's Mr. Big
// base): every skin triangle inside the lips (behind their front, facing in, on the mouth's line), painted a muted dark rose in the
// skin's texture (its own shading kept as a ratio), so an open viseme shows a dark mouth, not a lit red plate
export async function innerMouthPass(doc, K = {}) {
  K = { rx: 0.03, ry: 0.014, back: 0.004, depth: 0.035, nz: 0.55, teeth: 0, col: [0.09, 0.04, 0.036], keep: 0.35, ...K };
  const { rgba, setWebp, raster } = await import('../young-hero/glb.mjs'); const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()), skin = prims.find((p) => p.getMaterial()?.getName() === 'skin' && p.getIndices()), bag = prims.find((p) => p.getMaterial()?.getName() === 'mouth-inside');
  if (!skin || !bag) return; const B = bag.getAttribute('POSITION').getArray(); let cx = 0, cy = 0, cz = 0; for (let i = 0; i < B.length; i += 3) { cx += B[i]; cy += B[i + 1]; cz += B[i + 2]; } const nb = B.length / 3; cx /= nb; cy /= nb; cz /= nb;
  const P = skin.getAttribute('POSITION').getArray(), U = skin.getAttribute('TEXCOORD_0').getArray(), I = skin.getIndices().getArray();
  let lip = -9; for (let i = 0; i < P.length / 3; i++) if (Math.abs(P[i * 3] - cx) < 0.02 && Math.abs(P[i * 3 + 1] - cy) < 0.015) lip = Math.max(lip, P[i * 3 + 2]);
  // (the mouth's line: the upper teeth's biting edge on the midline; the
  // inside: within K.rx of the midline and K.ry of that line, K.back behind the lips' front there and no deeper than K.depth,
  // its surface facing in (normal z < K.nz))
  const N = skin.getAttribute('NORMAL').getArray(), tu = prims.find((p) => p.getMaterial()?.getName() === 'teethUp'); let ym = cy;
  if (tu) { const T = tu.getAttribute('POSITION').getArray(); let lo = 9; for (const k of new Set(tu.getIndices().getArray())) lo = Math.min(lo, T[k * 3 + 1]); if (lo < 9) ym = lo; }
  let lf = -9; for (let v = 0; v < P.length / 3; v++) if (Math.abs(P[v * 3] - cx) < 0.012 && Math.abs(P[v * 3 + 1] - ym) < 0.012) lf = Math.max(lf, P[v * 3 + 2]); lip = lf;
  // (or near the teeth: within K.teeth of any point the teeth draw, behind the lips' front: the inner lips over them)
  const TP = []; for (const tp of prims.filter((p) => /^teeth(Up|Low)$/.test(p.getMaterial()?.getName() || ''))) { const T = tp.getAttribute('POSITION').getArray(); for (const k of new Set(tp.getIndices().getArray())) TP.push(T[k * 3], T[k * 3 + 1], T[k * 3 + 2]); }
  const nearT = (v) => { for (let k = 0; k < TP.length; k += 3) if ((P[v * 3] - TP[k]) ** 2 + (P[v * 3 + 1] - TP[k + 1]) ** 2 + (P[v * 3 + 2] - TP[k + 2]) ** 2 < K.teeth * K.teeth) return true; return false; };
  const inn = (v) => P[v * 3 + 2] < lip - K.back && ((Math.abs(P[v * 3] - cx) < K.rx && Math.abs(P[v * 3 + 1] - ym) < K.ry && P[v * 3 + 2] > lip - K.depth && N[v * 3 + 2] < K.nz) || (K.teeth > 0 && nearT(v)));
  const tri = []; for (let t = 0; t < I.length; t += 3) if (inn(I[t]) && inn(I[t + 1]) && inn(I[t + 2])) tri.push(I[t], I[t + 1], I[t + 2]);
  const tex = skin.getMaterial().getBaseColorTexture(), { data, w, h } = await rgba(tex); let n = 0; const done = new Uint8Array(w * h);
  raster(tri, (v) => [((U[v * 2] % 1) + 1) % 1 * w, ((U[v * 2 + 1] % 1) + 1) % 1 * h], w, (x, y) => { const i = y * w + x; if (done[i]) return; done[i] = 1;
    const L = (lin(data[i * 4]) + lin(data[i * 4 + 1]) + lin(data[i * 4 + 2])) / 3, k = K.keep + (1 - K.keep) * Math.min(1.4, L / 0.25); for (let c = 0; c < 3; c++) data[i * 4 + c] = enc(K.col[c] * k); n++; }, 0.3);
  await setWebp(tex, data, w, h, 92); console.log('inner mouth: skin triangles', tri.length / 3, 'texels', n, 'mouth line y', ym.toFixed(3), 'lip z', lip.toFixed(3));
}

// rule 3, a suit that reads knitted (Director Grey: "a knitted cardigan with jagged lapels"): the cloth's normal map's
// strength down to K.n (the knit's ridges gone, the folds kept in the geometry), its colour texture softened by K.blur px
// (no stitch pattern) and its roughness up (a matte worsted), for every material K.re matches
export async function worstedPass(doc, re, K = {}) {
  K = { n: 0.18, blur: 1.6, rough: 0.78, ...K };
  const { rgba, setWebp, sharp } = await import('../young-hero/glb.mjs'); const seen = new Set(); let n = 0;
  for (const m of doc.getRoot().listMaterials()) { if (!re.test(m.getName())) continue; if (m.getNormalTexture()) m.setNormalScale(K.n); m.setRoughnessFactor(K.rough); n++;
    const t = m.getBaseColorTexture(); if (!t || seen.has(t) || !K.blur) continue; seen.add(t); const { data, w, h } = await rgba(t);
    const out = await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } }).blur(K.blur).raw().toBuffer(); await setWebp(t, out, w, h, 90); }
  console.log('worsted:', String(re), n, 'materials, normal x', K.n, 'blur', K.blur);
}
