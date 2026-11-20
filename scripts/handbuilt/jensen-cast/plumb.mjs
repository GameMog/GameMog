// Jensen Heist, cast round 3 (19 Nov; the critic on Mr. Board: "re-bind or rotate the armature so the bind pose is upright
// (ear, shoulder, hip, knee and ankle plumb, knees straight); retarget his clips so the idle does not sweep the legs
// back"): a body's own clips and its rest pose put on the plumb line, frame by frame.
//   plumbClipsPass(doc, K)   for the rest pose and every key of every clip a body carries (the rotation channels; a clip's
//                            keys share their times): the pose's joints in the world (forward = +z), then, in the body's
//                            side plane, each about the world's left-right axis at its joint:
//     legs    (the standing clips only, K.stand: a walk, a jog or a pick-up keeps its own lean) each thigh turned so the ankle sits under the hip, the foot turned back the
//             same so it stays flat on the ground; the knee straightened to K.knee degrees at most (the shin turned)
//     trunk   the lowest spine bone turned so the shoulders' midpoint sits over the hips' (K.sh ahead at most)
//     neck    the neck turned so the head's joint (the ear's height) sits over the shoulders, and the head turned back by the
//             trunk's and the neck's sum (the chin's line as the clip had it)
//   The mesh is not touched: the skinning carries it (the rest pose's mesh comes up straight with its joints).
//   plumbReport(doc, clip?, t?)  the joints forward of the ankle (cm) in a pose, for the sheet
// Original procedural work, CC0.
import { THREE } from '../young-hero/glb.mjs';

const V = (a) => new THREE.Vector3(...a), Q = (a) => new THREE.Quaternion(...a);
// the pose's world matrices: rest TRS, overridden by a clip's sampled channels at t
function sampler(anim) {
  const m = new Map();
  if (anim) for (const ch of anim.listChannels()) { const s = ch.getSampler(), ti = s.getInput().getArray(), out = s.getOutput(), n = out.getElementSize();
    m.set(ch.getTargetNode().getName() + '.' + ch.getTargetPath(), (t) => { let i = 0; while (i < ti.length - 1 && ti[i + 1] <= t) i++; const j = Math.min(ti.length - 1, i + 1), f = ti[j] > ti[i] ? (t - ti[i]) / (ti[j] - ti[i]) : 0;
      const a = out.getElement(i, new Array(n)), b = out.getElement(j, new Array(n)); if (n === 4) return Q(a).slerp(Q(b), Math.max(0, Math.min(1, f))).toArray(); return a.map((x, k) => x + (b[k] - x) * f); }); }
  return m;
}
function fk(doc, smp, t) {
  const R = doc.getRoot(), par = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  const W = new Map(), L = new Map();
  const world = (n) => { if (!n) return new THREE.Matrix4(); if (W.has(n)) return W.get(n); const nm = n.getName();
    const tr = smp.get(nm + '.translation')?.(t) || n.getTranslation(), r = smp.get(nm + '.rotation')?.(t) || n.getRotation(), s = n.getScale();
    const m = new THREE.Matrix4().compose(V(tr), Q(r), V(s)); L.set(n, { tr, r, s }); const w = world(par.get(n)).clone().multiply(m); W.set(n, w); return w; };
  for (const n of R.listNodes()) world(n);
  const byName = new Map(R.listNodes().map((n) => [n.getName(), n]));
  const pos = (nm) => new THREE.Vector3().setFromMatrixPosition(W.get(byName.get(nm)));
  return { W, L, par, byName, pos };
}
// a joint's local rotation after turning it by `deg` about the world's x axis at the joint: q' = Pw^-1 * Rx * Pw * q
function turned(F, nm, deg) {
  const n = F.byName.get(nm), p = F.par.get(n), Pw = new THREE.Quaternion(); if (p) F.W.get(p).decompose(new THREE.Vector3(), Pw, new THREE.Vector3());
  const Rx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deg * Math.PI / 180), q = Q(F.L.get(n).r);
  return Pw.clone().invert().multiply(Rx).multiply(Pw).multiply(q).toArray();
}
const ang = (a, b) => Math.atan2(b.z - a.z, b.y - a.y) * 180 / Math.PI; // the lean of a->b (b over a) forward of vertical, degrees

// the corrections for one pose (applied in order: knees, legs, trunk, neck; each measured on the pose the previous made);
// each turn's sign found by trying both (the measure brought nearest to its target wins)
function correct(doc, smp, t, K, stand, set) {
  let F = fk(doc, smp, t); const out = {};
  const solve = (nm, deg, measure) => { if (Math.abs(deg) < 0.3) return 0; const prev = smp.get(nm + '.rotation'); let best = null;
    for (const d of [deg, -deg]) { const q = turned(F, nm, d); smp.set(nm + '.rotation', () => q); const m = Math.abs(measure(fk(doc, smp, t))); if (!best || m < best.m) best = { d, q, m }; }
    const m0 = Math.abs(measure(F)); if (best.m >= m0) { if (prev) smp.set(nm + '.rotation', prev); else smp.delete(nm + '.rotation'); return 0; }
    smp.set(nm + '.rotation', () => best.q); set(nm, best.q); F = fk(doc, smp, t); return best.d; };
  if (stand) for (const s of ['L', 'R']) {
    const bendOf = (G) => ang(G.pos('lowerleg01_' + s), G.pos('upperleg01_' + s)) - ang(G.pos('foot_' + s), G.pos('lowerleg01_' + s));
    const b = bendOf(F); if (Math.abs(b) > K.knee) solve('lowerleg01_' + s, Math.abs(b) - K.knee, (G) => Math.max(0, Math.abs(bendOf(G)) - K.knee));
    const leanOf = (G) => ang(G.pos('foot_' + s), G.pos('upperleg01_' + s)), lean = leanOf(F);
    const d = solve('upperleg01_' + s, Math.abs(lean), leanOf);
    // (the foot turned back by the thigh's turn: flat on the ground as the clip had it)
    if (d) { const q = turned(F, 'foot_' + s, -d); smp.set('foot_' + s + '.rotation', () => q); set('foot_' + s, q); F = fk(doc, smp, t); }
    out['leg' + s] = +lean.toFixed(1); }
  const mid = (G, a, b) => G.pos(a).add(G.pos(b)).multiplyScalar(0.5);
  const trOf = (G) => { const h = mid(G, 'upperleg01_L', 'upperleg01_R'), sh = mid(G, 'upperarm01_L', 'upperarm01_R'); return Math.atan2(sh.z - h.z - K.sh, sh.y - h.y) * 180 / Math.PI; };
  const trunk = solve(K.spine, Math.abs(trOf(F)), trOf);
  const nkOf = (G) => { const sh = mid(G, 'upperarm01_L', 'upperarm01_R'), hd = G.pos('head'), nk = G.pos('neck01'); return Math.atan2(hd.z - sh.z - K.ear, hd.y - nk.y) * 180 / Math.PI; };
  const neck = solve('neck01', Math.min(K.maxNeck, Math.abs(nkOf(F))), nkOf);
  // (the head: K.headUp (the head joint to the crown, in the head's own frame, from the bind mesh) brought to its bind's
  // angle from vertical, the chin level as the body was modelled; without it, turned back by the trunk's and neck's turn)
  if (K.headUp) { const upOf = (G) => { const q = new THREE.Quaternion(); G.W.get(G.byName.get('head')).decompose(new THREE.Vector3(), q, new THREE.Vector3()); const d = K.headUp.clone().applyQuaternion(q); return Math.atan2(d.z, d.y) * 180 / Math.PI - K.headTilt; };
    solve('head', Math.abs(upOf(F)), upOf); }
  else if (trunk || neck) { const q = turned(F, 'head', -(trunk + neck) * K.chin); smp.set('head.rotation', () => q); set('head', q); }
  out.trunk = +trunk.toFixed(1); out.neck = +neck.toFixed(1);
  return out;
}

// the skeleton's carrier nodes (the root bone's ancestors) levelled: their rotation taken out (Mr. Big's armature node is
// pitched ~10 degrees forward and rolled ~7 to his side, so every clip leaned and listed with it), their scale kept
export function levelArmaturePass(doc) {
  const R = doc.getRoot(), par = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) par.set(c, n);
  let n = R.listNodes().find((x) => x.getName() === 'root'), out = [];
  while ((n = par.get(n))) { const r = n.getRotation(); if (Math.abs(r[3]) < 0.99999) { out.push((2 * Math.acos(Math.min(1, Math.abs(r[3]))) * 180 / Math.PI).toFixed(1) + ' deg'); n.setRotation([0, 0, 0, 1]); } }
  console.log('level armature: carrier rotations taken out', out.join(', ') || 'none');
}

export function plumbClipsPass(doc, K = {}) {
  K = { stand: /^(idle|phone|arms|talk|shrug|wave|shift|sitTalk-no)$/, knee: 4, sh: 0.01, ear: 0.0, maxNeck: 25, chin: 1, spine: 'spine05', ...K };
  const R = doc.getRoot(), rep = [];
  // (the head's up in its own frame and its bind angle: the head-weighted skin's crown (its highest points) less the head joint)
  { const sk = R.listSkins()[0], J = sk.listJoints(), hi = J.findIndex((j) => j.getName() === 'head'), IB = new THREE.Matrix4().fromArray(sk.getInverseBindMatrices().getElement(hi, new Array(16))), B = new THREE.Matrix4().copy(IB).invert(), jp = new THREE.Vector3().setFromMatrixPosition(B);
    const p = R.listMeshes().flatMap((m) => m.listPrimitives()).find((q) => q.getMaterial()?.getName() === 'skin'), A = p.getAttribute('POSITION').getArray(), JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'), j = [0, 0, 0, 0], w = [0, 0, 0, 0], top = [];
    for (let v = 0; v < A.length / 3; v++) { JA.getElement(v, j); WA.getElement(v, w); let h = 0; for (let k = 0; k < 4; k++) if (j[k] === hi) h += w[k]; if (h > 0.9) top.push(v); }
    top.sort((a, b) => A[b * 3 + 1] - A[a * 3 + 1]); const c = top.slice(0, 30).reduce((s, v) => s.add(new THREE.Vector3(A[v * 3], A[v * 3 + 1], A[v * 3 + 2])), new THREE.Vector3()).multiplyScalar(1 / Math.min(30, top.length)).sub(jp);
    if (K.level !== false && top.length) { K.headTilt = K.headTilt ?? Math.atan2(c.z, c.y) * 180 / Math.PI; const q = new THREE.Quaternion(); B.decompose(new THREE.Vector3(), q, new THREE.Vector3()); K.headUp = c.normalize().applyQuaternion(q.invert()); } }
  // the rest pose: its nodes' own rotations
  { const smp = sampler(null); const r = correct(doc, smp, 0, K, true, (nm, q) => R.listNodes().find((n) => n.getName() === nm).setRotation(q)); rep.push('rest ' + JSON.stringify(r)); }
  for (const a of R.listAnimations()) { if (!K.stand.test(a.getName())) { rep.push(a.getName() + ' left as it is'); continue; } const stand = true, byNode = new Map(a.listChannels().filter((c) => c.getTargetPath() === 'rotation').map((c) => [c.getTargetNode().getName(), c]));
    // (the clip's densest key times: a constant channel carries two keys; the turned channels are rewritten on this grid)
    const ch0 = [...byNode.values()].sort((x, y) => y.getSampler().getInput().getCount() - x.getSampler().getInput().getCount())[0]; if (!ch0) continue; const times = Array.from(ch0.getSampler().getInput().getArray());
    const base = sampler(a), news = new Map(); let mx = { leg: 0, trunk: 0, neck: 0 };
    times.forEach((t, k) => { const smp = new Map(base); const r = correct(doc, smp, t, K, stand, (nm, q) => { (news.get(nm) || news.set(nm, new Map()).get(nm)).set(k, q); });
      mx = { leg: Math.max(mx.leg, Math.abs(r.legL || 0), Math.abs(r.legR || 0)), trunk: Math.max(mx.trunk, Math.abs(r.trunk)), neck: Math.max(mx.neck, Math.abs(r.neck)) }; });
    // (written back per key; a channel with other key times than the first channel's left as it was)
    const buf = R.listBuffers()[0], tAcc = ch0.getSampler().getInput();
    for (const [nm, ks] of news) { const ch = byNode.get(nm); if (!ch) continue; const s = ch.getSampler(), fn = base.get(nm + '.rotation'), out = new Float32Array(times.length * 4);
      times.forEach((t, k) => { const q = ks.get(k) || fn(t); for (let c = 0; c < 4; c++) out[k * 4 + c] = q[c]; });
      s.setInput(tAcc).setOutput(doc.createAccessor().setType('VEC4').setArray(out).setBuffer(buf)); }
    rep.push(a.getName() + ' max legs ' + mx.leg.toFixed(1) + ' trunk ' + mx.trunk.toFixed(1) + ' neck ' + mx.neck.toFixed(1)); }
  console.log('plumb:', rep.join('; '));
}

export function plumbReport(doc, clip, t = 0) {
  const a = clip ? doc.getRoot().listAnimations().find((x) => x.getName() === clip) : null, F = fk(doc, sampler(a), t), an = F.pos('foot_L');
  const f = (nm) => ((F.pos(nm).z - an.z) * 100).toFixed(1);
  return `${clip || 'rest'}: ear(head) ${f('head')} shoulder ${f('upperarm01_L')} hip ${f('upperleg01_L')} knee ${f('lowerleg01_L')} ankle 0 cm fwd`;
}

// the rest pose (the nodes' own TRS, as plumbClipsPass left it; or a clip's frame, made the rest) baked in as the bind: every skinned point (and its normal,
// and its morphs' deltas, turned only) moved by its joints' rest-world x inverse-bind blend, the inverse bind matrices
// rewritten from the rest pose. A clip plays exactly as before (world x newIBM x newMesh = world x oldIBM x oldMesh); the
// bind itself (what a review renderer or a T-pose shows) now stands up straight.
export function bakeRestPass(doc, clip = null, t = 0) {
  const R = doc.getRoot(), sk = R.listSkins()[0], J = sk.listJoints(), A = clip ? R.listAnimations().find((a) => a.getName() === clip) : null, F = fk(doc, sampler(A), t);
  // (a clip's frame as the rest: the nodes take its TRS too (the root's height kept, its x and z centred))
  // (and the root's heading taken out: the bind faces straight down +z, as a review or a line-up expects)
  if (A) for (const [n, l] of F.L) { let r = l.r; if (n.getName() === 'root') { const q = Q(r), f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), yaw = Math.atan2(f.x, f.z); r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw).multiply(q).toArray(); }
    n.setRotation(r); n.setTranslation(n.getName() === 'root' ? [0, l.tr[1], 0] : l.tr); }
  if (A) { F.W.clear(); const G = fk(doc, new Map(), 0); for (const [k, v] of G.W) F.W.set(k, v); }
  const IB = sk.getInverseBindMatrices(), S = J.map((j, i) => F.W.get(j).clone().multiply(new THREE.Matrix4().fromArray(IB.getElement(i, new Array(16)))));
  const done = new Set(); let nv = 0;
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const JA = p.getAttribute('JOINTS_0'), WA = p.getAttribute('WEIGHTS_0'); if (!JA || !WA) continue; const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const n = P.getCount(), j = [0, 0, 0, 0], w = [0, 0, 0, 0], M = new Array(n);
    for (let i = 0; i < n; i++) { JA.getElement(i, j); WA.getElement(i, w); const s = w[0] + w[1] + w[2] + w[3] || 1, el = new Array(16).fill(0); for (let k = 0; k < 4; k++) if (w[k]) { const a = S[j[k]].elements; for (let q = 0; q < 16; q++) el[q] += a[q] * w[k] / s; } M[i] = new THREE.Matrix4().fromArray(el); }
    const v = new THREE.Vector3();
    const app = (acc, mode) => { if (!acc || (done.has(acc) && acc !== P)) return; done.add(acc); const sz = acc.getElementSize(), x = new Array(sz);
      for (let i = 0; i < n; i++) { acc.getElement(i, x); v.set(x[0], x[1], x[2]); if (mode === 'p') v.applyMatrix4(M[i]); else if (mode === 'n') v.transformDirection(M[i]); else { const m3 = new THREE.Matrix3().setFromMatrix4(M[i]); v.applyMatrix3(m3); } x[0] = v.x; x[1] = v.y; x[2] = v.z; acc.setElement(i, x); } };
    app(P, 'p'); app(p.getAttribute('NORMAL'), 'n'); app(p.getAttribute('TANGENT'), 'n');
    for (const t of p.listTargets()) { app(t.getAttribute('POSITION'), 'd'); app(t.getAttribute('NORMAL'), 'd'); }
    nv += n; }
  IB.setArray(Float32Array.from(J.flatMap((jn) => F.W.get(jn).clone().invert().toArray())));
  console.log('bake rest:', clip ? clip + ' at ' + t + ' s' : 'the rest pose', 'baked in as the bind, points', nv);
}
