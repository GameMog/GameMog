// Mog City: a Suit's ragdoll (wagmi/physics, Jolt). Knocked flying (a heavy blow, a finisher, Dan's car), his body is
// eleven rigid parts on the thug rig's skeleton (pelvis, chest, head, upper and lower arms, thighs and shins) held by
// joints with a body's limits: knees and elbows are hinges that only bend the way they bend (0 to 135 degrees, their
// way found from the rig's bind pose), the hips, shoulders, waist and neck cones round their rest pose, a little twist.
// He falls, tumbles and settles under gravity, against the ground, the buildings, the wrecks and the other men; his
// skinned mesh follows the parts (the bones between them held as they were when he was hit). When he gets up, the
// get-up clip takes over from where he lies: turned and moved to line up with him, and blended in from his lying pose
// (0.45 s; longer, a roll, when he landed face down). A man out for good stays as he fell.
//   const R = createRagdolls(physics);  R.start(e, vel, dir) -> rag | null · R.step(e, dt) -> settled · R.apply(e)
//   (in his late(), over the clip) · R.end(e) (the get-up's blend from here) · R.blend(e, dt) · R.drop(e)
import * as THREE from 'three/webgpu';
import { L } from './index.js';

const PARTS = [
  { n: 'pelvis', bone: 'hips', end: 'spine1', box: [0.16, 0.1], m: 0.15 },
  { n: 'chest', bone: 'spine1', end: 'neck', box: [0.18, 0.12], m: 0.27, parent: 'pelvis', cone: [0.3, 0.35], twist: 0.35 },
  { n: 'head', bone: 'head', len: 0.22, r: 0.1, m: 0.08, parent: 'chest', cone: [0.55, 0.6], twist: 0.7 },
  { n: 'uarmL', bone: 'upperArmL', end: 'forearmL', r: 0.055, m: 0.03, parent: 'chest', cone: [1.2, 1.2], twist: 0.8 },
  { n: 'farmL', bone: 'forearmL', end: 'handL', ext: 0.13, r: 0.048, m: 0.025, parent: 'uarmL', hinge: 'elbow' },
  { n: 'uarmR', bone: 'upperArmR', end: 'forearmR', r: 0.055, m: 0.03, parent: 'chest', cone: [1.2, 1.2], twist: 0.8 },
  { n: 'farmR', bone: 'forearmR', end: 'handR', ext: 0.13, r: 0.048, m: 0.025, parent: 'uarmR', hinge: 'elbow' },
  { n: 'thighL', bone: 'thighL', end: 'shinL', r: 0.08, m: 0.1, parent: 'pelvis', cone: [0.5, 0.95], twist: 0.35 },
  { n: 'shinL', bone: 'shinL', end: 'footL', ext: 0.06, r: 0.06, m: 0.05, parent: 'thighL', hinge: 'knee' },
  { n: 'thighR', bone: 'thighR', end: 'shinR', r: 0.08, m: 0.1, parent: 'pelvis', cone: [0.5, 0.95], twist: 0.35 },
  { n: 'shinR', bone: 'shinR', end: 'footR', ext: 0.06, r: 0.06, m: 0.05, parent: 'thighR', hinge: 'knee' },
];
const FLEX = { knee: [0.03, 2.35], elbow: [0.03, 2.4] };
const MASS = 80;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const wpos = (b, out) => out.setFromMatrixPosition(b.matrixWorld);
const wquat = (b, out) => { b.matrixWorld.decompose(_v3, out, _s); return out; };
const axis = (b, k, out) => out.setFromMatrixColumn(b.matrixWorld, k).normalize();
let groupSeq = 1;

// the rig's bind pose, once per skeleton: each part's rest turn relative to its parent part's, and which way the
// hinges bend (their bone's own X axis, signed)
function bindInfo(e) {
  if (e.lib._ragBind) return e.lib._ragBind;
  let sk = null; e.inner.traverse((o) => { if (!sk && o.isSkinnedMesh) sk = o.skeleton; });
  if (!sk) return null;
  const W = new Map();
  sk.bones.forEach((b, i) => { const m = sk.boneInverses[i].clone().invert(); const p = new THREE.Vector3(), q = new THREE.Quaternion(); m.decompose(p, q, _s); W.set(b.name, { p, q }); });
  const g = (n) => W.get(n);
  if (!PARTS.every((P) => g(P.bone)) || !g('toeL') || !g('footL')) return null;
  // (the bind's forward: along the foot to the toe, level; its up: hips to head)
  const up = g('head').p.clone().sub(g('hips').p).normalize();
  const fwd = g('toeL').p.clone().sub(g('footL').p); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const info = { rel: {}, sign: {} };
  for (const P of PARTS) {
    if (P.parent) { const pb = PARTS.find((x) => x.n === P.parent).bone; info.rel[P.n] = g(pb).q.clone().invert().multiply(g(P.bone).q); }
    if (P.hinge) {
      const pb = PARTS.find((x) => x.n === P.parent);
      const t = g(pb.end).p.clone().sub(g(pb.bone).p).normalize();
      // (flexing a knee swings the shin back: the axis forward x thigh; an elbow the forearm forward: upper arm x forward)
      const a = P.hinge === 'knee' ? new THREE.Vector3().crossVectors(fwd, t) : new THREE.Vector3().crossVectors(t, fwd);
      const bx = new THREE.Vector3(1, 0, 0).applyQuaternion(g(P.bone).q);
      info.sign[P.n] = bx.dot(a) >= 0 ? 1 : -1;
    }
  }
  return (e.lib._ragBind = info);
}

export function createRagdolls(PH) {
  const J = PH.J, bi = PH.bi, sys = PH.sys;
  const R = { live: new Set(), stats: { made: 0, ms: 0 } };
  const filter = new J.GroupFilterTable(PARTS.length);
  PARTS.forEach((P, i) => { if (P.parent) filter.DisableCollision(i, PARTS.findIndex((x) => x.n === P.parent)); });
  // (the arms' tops never against the chest, nor the thighs against each other)
  const ix = (n) => PARTS.findIndex((x) => x.n === n);
  filter.DisableCollision(ix('uarmL'), ix('head')); filter.DisableCollision(ix('uarmR'), ix('head'));
  filter.DisableCollision(ix('thighL'), ix('thighR'));
  const rv = (v) => new J.RVec3(v.x, v.y, v.z), jv = (v) => new J.Vec3(v.x, v.y, v.z);

  // ------------------------------------------------------------------ made, as he stands now
  R.start = (e, vel, dir) => {
    if (!PH.ready || e.rag) return null;
    const info = bindInfo(e); if (!info) return null;
    const t0 = performance.now();
    e.root.updateMatrixWorld(true);
    const B = e.bones, sc = e.T.scale, gid = groupSeq++;
    const rag = { parts: [], cons: [], t: 0, settled: 0, pelvis: null, frozen: new Map(), landed: false };
    // (every bone's turn now: those between the parts stay so)
    for (const k in B) rag.frozen.set(B[k], B[k].quaternion.clone());
    rag.hipsPos = B.hips.position.clone();
    const pelvisP = wpos(B.hips, new THREE.Vector3());
    // (thrown back off his feet: a turn about the level axis across the way he goes)
    const w = new THREE.Vector3().crossVectors(Y, dir).multiplyScalar(Math.min(4.5, 1.2 + Math.hypot(vel.x, vel.z) * 0.25));
    for (let i = 0; i < PARTS.length; i++) {
      const P = PARTS[i], b = B[P.bone];
      const a = wpos(b, new THREE.Vector3()), q = wquat(b, new THREE.Quaternion());
      let e2;
      if (P.end) { e2 = wpos(B[P.end], new THREE.Vector3()); if (P.ext) e2.add(_v.copy(e2).sub(a).normalize().multiplyScalar(P.ext * sc)); }
      else e2 = a.clone().add(axis(b, 1, _v).multiplyScalar(P.len * sc));
      const len = a.distanceTo(e2), mid = a.clone().add(e2).multiplyScalar(0.5);
      // (the body turned as the bone, its long axis the bone's Y: the segment's way, near enough)
      let shape;
      if (P.box) shape = new J.BoxShapeSettings(new J.Vec3(P.box[0] * sc, Math.max(0.06, len / 2), P.box[1] * sc), 0.03);
      else shape = new J.CapsuleShapeSettings(Math.max(0.02, len / 2 - P.r * sc * 0.6), P.r * sc);
      const grp = new J.CollisionGroup(filter, gid, i);
      const pv = _v2.copy(mid).sub(pelvisP), lin = _v.crossVectors(w, pv).add(vel);
      const body = PH.make(shape, mid, q, { mass: MASS * P.m * sc * sc * sc, layer: L.RAG, friction: 0.7, restitution: 0.05, damp: 0.08, angDamp: 0.6, v: lin, w, group: grp, ccd: P.n === 'pelvis' || P.n === 'chest' });
      J.destroy(shape);
      body.kind = 'rag';
      // (the bone from the body: its turn the body's, its place (the pelvis) off the body's middle)
      rag.parts.push({ P, b, body, off: a.clone().sub(mid).applyQuaternion(q.clone().invert()) });
    }
    rag.pelvis = rag.parts[0].body;
    // the joints
    for (let i = 0; i < PARTS.length; i++) {
      const P = PARTS[i]; if (!P.parent) continue;
      const me = rag.parts[i], pa = rag.parts[PARTS.findIndex((x) => x.n === P.parent)];
      const at = wpos(me.b, new THREE.Vector3());
      const qc = wquat(me.b, new THREE.Quaternion()), qp = wquat(pa.b, new THREE.Quaternion());
      // (the child's rest turn, as the parent stands now: the joint's limits are round it)
      const qn = qp.clone().multiply(info.rel[P.n]);
      const s = new J.SwingTwistConstraintSettings();
      s.mSpace = J.EConstraintSpace_WorldSpace;
      s.mPosition1 = rv(at); s.mPosition2 = rv(at);
      if (P.hinge) {
        // a hinge: its twist axis the bone's X (signed: the way it bends), swing all but none
        const sg = info.sign[P.n];
        const ax = X.clone().applyQuaternion(qc).multiplyScalar(sg).normalize();
        const p1 = Y.clone().applyQuaternion(qn); p1.addScaledVector(ax, -p1.dot(ax)).normalize();
        const p2 = Y.clone().applyQuaternion(qc); p2.addScaledVector(ax, -p2.dot(ax)).normalize();
        s.mTwistAxis1 = jv(ax); s.mTwistAxis2 = jv(ax); s.mPlaneAxis1 = jv(p1); s.mPlaneAxis2 = jv(p2);
        s.mNormalHalfConeAngle = 0.06; s.mPlaneHalfConeAngle = 0.06;
        const [lo, hi] = FLEX[P.hinge]; s.mTwistMinAngle = lo; s.mTwistMaxAngle = hi;
      } else {
        s.mTwistAxis1 = jv(Y.clone().applyQuaternion(qn)); s.mPlaneAxis1 = jv(X.clone().applyQuaternion(qn));
        s.mTwistAxis2 = jv(Y.clone().applyQuaternion(qc)); s.mPlaneAxis2 = jv(X.clone().applyQuaternion(qc));
        s.mNormalHalfConeAngle = P.cone[0]; s.mPlaneHalfConeAngle = P.cone[1];
        s.mTwistMinAngle = -P.twist; s.mTwistMaxAngle = P.twist;
      }
      s.mMaxFrictionTorque = 6 * sc;
      const c = s.Create(pa.body.body, me.body.body); J.destroy(s);
      sys.AddConstraint(c); rag.cons.push(c);
    }
    e.rag = rag; R.live.add(e); R.stats.made++;
    R.stats.ms = Math.round((performance.now() - t0) * 10) / 10;
    return rag;
  };

  // ------------------------------------------------------------------ every frame (his update): where he is now
  const _lv = new THREE.Vector3();
  R.step = (e, dt) => {
    const rag = e.rag; if (!rag) return false;
    rag.t += dt;
    let fast = 0;
    for (const p of rag.parts) { PH.read(p.body); fast = Math.max(fast, PH.vel(p.body, _lv).length()); }
    const pb = rag.pelvis;
    e.pos.x = pb.p.x; e.pos.z = pb.p.z;
    const gy = e.ground(); e.pos.y = gy;
    // (down on the street the first time: dust and the thud)
    if (!rag.landed && rag.t > 0.12 && pb.p.y < gy + 0.4) { rag.landed = true; e.c.fx.dust(e.pos, { amount: 0.9 }); e.c.sfx('bodyfall', 0.7); e.c.shake(0.08); }
    rag.settled = fast < 0.5 && pb.p.y < gy + 0.6 ? rag.settled + dt : 0;
    return rag.settled > 0.35 || rag.t > 4;
  };
  // his bones from the parts (after the mixer: over the clip)
  const _pw = new THREE.Quaternion(), _bw = new THREE.Quaternion(), _bp = new THREE.Vector3();
  R.apply = (e) => {
    const rag = e.rag; if (!rag) return;
    e.inner.quaternion.identity(); e.inner.position.set(0, 0, 0);
    for (const [b, q] of rag.frozen) b.quaternion.copy(q);
    B_hips(e, rag);
    e.root.updateMatrixWorld(true);
    for (const p of rag.parts) {
      const b = p.b, body = p.body;
      _bw.copy(body.q);
      b.parent.updateWorldMatrix(true, false);
      wquat(b.parent, _pw);
      b.quaternion.copy(_pw.invert().multiply(_bw));
      if (p.P.n === 'pelvis') {
        _bp.copy(p.off).applyQuaternion(body.q).add(body.p);
        b.position.copy(b.parent.worldToLocal(_bp));
      }
      b.updateMatrixWorld(true);
    }
  };
  function B_hips(e, rag) { e.bones.hips.position.copy(rag.hipsPos); }

  // ------------------------------------------------------------------ his last pose; the bodies gone
  function capture(e) {
    const rag = e.rag, locals = new Map();
    for (const k in e.bones) locals.set(e.bones[k], e.bones[k].quaternion.clone());
    const h = e.bones.hips; h.updateWorldMatrix(true, false);
    const hp = wpos(h, new THREE.Vector3()), hq = wquat(h, new THREE.Quaternion());
    return { locals, hp, hq, hipsLocal: h.position.clone() };
  }
  R.drop = (e) => {
    const rag = e.rag; if (!rag) return;
    for (const c of rag.cons) sys.RemoveConstraint(c);
    for (const p of rag.parts) PH.remove(p.body);
    e.rag = null; R.live.delete(e);
  };
  // out for good: held as he lies (his pose, every frame over the clip), the bodies gone once still
  R.hold = (e) => { if (!e.rag) return; e.ragHold = capture(e); R.drop(e); };
  R.applyHold = (e) => {
    const H = e.ragHold; if (!H) return;
    e.inner.quaternion.identity(); e.inner.position.set(0, 0, 0);
    for (const [b, q] of H.locals) b.quaternion.copy(q);
    e.root.updateMatrixWorld(true);
    const h = e.bones.hips; h.parent.updateWorldMatrix(true, false);
    h.position.copy(h.parent.worldToLocal(_bp.copy(H.hp)));
    wquat(h.parent, _pw); h.quaternion.copy(_pw.invert().multiply(H.hq));
    h.updateMatrixWorld(true);
  };
  // getting up: the clip (playing from its start) lined up with him, and blended in from where he lies
  R.end = (e) => {
    if (!e.rag) return;
    const H = capture(e); R.drop(e);
    // (face down, the chest's front toward the street: a longer blend, a roll)
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(H.hq);
    e.ragBlend = { H, t: 0, dur: front.y < -0.3 ? 0.75 : 0.45, aligned: false };
  };
  R.blend = (e, dt) => {
    const G = e.ragBlend; if (!G) return;
    const H = G.H, h = e.bones.hips;
    e.root.updateMatrixWorld(true);
    if (!G.aligned) {
      // turned so the clip's body lies the way his does (hips to head, level), and moved so their hips meet
      G.aligned = true;
      const qc = wquat(h, new THREE.Quaternion());
      const a1 = _v.set(0, 1, 0).applyQuaternion(qc), a0 = _v2.set(0, 1, 0).applyQuaternion(H.hq);
      if (Math.hypot(a1.x, a1.z) > 0.3 && Math.hypot(a0.x, a0.z) > 0.3) {
        const d = Math.atan2(a0.x, a0.z) - Math.atan2(a1.x, a1.z);
        e.yaw += d; e.root.rotation.y = e.yaw; e.faceYaw = null; e.turnRate = 0;
        e.root.updateMatrixWorld(true);
      }
      const hp = wpos(h, new THREE.Vector3());
      e.pos.x += H.hp.x - hp.x; e.pos.z += H.hp.z - hp.z;
      e.root.updateMatrixWorld(true);
    }
    G.t += dt;
    const k = Math.min(1, G.t / G.dur), w = k * k * (3 - 2 * k);
    // (every bone: from his lying pose to the clip's; the hips in the world)
    h.updateWorldMatrix(true, false);
    const cp = wpos(h, new THREE.Vector3()), cq = wquat(h, new THREE.Quaternion());
    for (const [b, q] of H.locals) if (b !== h) b.quaternion.copy(_q.copy(q).slerp(b.quaternion, w));
    const tp = _v3.copy(H.hp).lerp(cp, w), tq = _q2.copy(H.hq).slerp(cq, w);
    h.parent.updateWorldMatrix(true, false);
    h.position.copy(h.parent.worldToLocal(tp.clone()));
    wquat(h.parent, _pw); h.quaternion.copy(_pw.invert().multiply(tq));
    e.root.updateMatrixWorld(true);
    if (k >= 1) e.ragBlend = null;
  };
  return R;
}
