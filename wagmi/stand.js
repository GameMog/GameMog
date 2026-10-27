// Dan standing still: his idle now stands on the Bandai Namco neutral stand (knees at 2.5 and 4.7 deg, soles flat, hips
// over his feet: .scratch/bandai/dan/build-clips.mjs), so this is the safety net that keeps it so whatever is blended
// under him (a scene's held frame, the end of a step). Over the pose, after the mixer:
//  - his feet turned flat (each sole's 'up' in the model's bind pose turned back to the sky, his toes still where the
//    clip points them), each ankle left where the clip put it across the ground, at the height that rests its sole on
//    the ground under him;
//  - his hips moved over his feet (HIP_FWD ahead of the ankles' middle) and raised until the straighter leg's knee is at
//    KNEE (5 deg: a relaxed stand, not locked legs; the other leg within a few degrees of it, both 8 or under);
//  - each leg reaching its ankle by two-bone IK (thigh and shin), its knee pointing the way the clip's did.
// apply(w) blends it over the pose by w (0..1). The mixer only writes a value that changed since its own last write, so
// a bone still holding what this wrote the frame before is put back to the clip's value first (else the turns would
// pile up on a held frame); release() puts the clip's values back for whatever takes the body next (a scene, the car).
const KNEE = 175 * Math.PI / 180, HIP_FWD = 0.025, LIFT = 0.002, SOLE_TOL = 0.006, STRAIGHT = 7 * Math.PI / 180, BENT = 14 * Math.PI / 180;
export function createStand(THREE, body, bones) {
  const B = bones, SIDES = ['L', 'R'], root = B.root;
  const leg = (s) => [B['upperleg01_' + s], B['lowerleg01_' + s], B['foot_' + s]];
  if (!root || !SIDES.every((s) => leg(s).every(Boolean))) return { apply() {}, release() {} };
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const own = [...leg('L'), ...leg('R')], orig = own.map(Q), wrote = own.map(Q), origRoot = V(), wroteRoot = V();
  let held = false;
  // each foot: its sole's up (in the foot bone's frame) and its ankle's height over the sole, from the bind pose
  const sole = {};
  body.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const sk = o.skeleton, g = o.geometry, pa = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    for (const s of SIDES) {
      const i = sk.bones.indexOf(B['foot_' + s]); if (i < 0) continue;
      const ibm = sk.boneInverses[i], f = sole[s] || (sole[s] = { up: new THREE.Vector3(0, 1, 0).transformDirection(ibm), ibm, ankY: new THREE.Matrix4().copy(ibm).invert().elements[13], minY: Infinity });
      if (!si || !sw) continue;
      for (let v = 0; v < pa.count; v++) for (let j = 0; j < 4; j++) if (si.getComponent(v, j) === i && sw.getComponent(v, j) >= 0.5) { f.minY = Math.min(f.minY, pa.getY(v)); break; }
    }
  });
  if (!SIDES.every((s) => sole[s] && isFinite(sole[s].minY))) return { apply() {}, release() {} };
  const UP = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _w = Q(), _q = Q(), _q2 = Q();
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _n = V();
  const H = { L: V(), R: V() }, T = { L: V(), R: V() }, pole = { L: V(), R: V() }, foot = { L: Q(), R: Q() }, rw = V();
  const wp = (b, out) => b.getWorldPosition(out);
  function turnWorld(b, q) { b.getWorldQuaternion(_w); _q2.copy(q).multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  function setWorld(b, q) { b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(q)); b.updateMatrixWorld(true); }
  // the clip's own values back on the bones still holding what was written over them
  function restore() {
    own.forEach((b, i) => { if (b.quaternion.equals(wrote[i])) b.quaternion.copy(orig[i]); });
    if (root.position.equals(wroteRoot)) root.position.copy(origRoot);
  }
  function reach(s, to, pl) {
    const [b1, b2, b3] = leg(s);
    const A = wp(b1, _a), K = wp(b2, _b), F = wp(b3, _c), la = A.distanceTo(K), lb = K.distanceTo(F);
    const d = Math.min(la + lb - 1e-4, Math.max(1e-3, to.distanceTo(A)));
    const u = _d.subVectors(A, K), w = _e.subVectors(F, K), cur = u.angleTo(w);
    const want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(u, w); if (_n.lengthSq() < 1e-10) _n.crossVectors(u, pl); _n.normalize();
    turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    wp(b3, _c); turnWorld(b1, _q.setFromUnitVectors(_d.subVectors(_c, A).normalize(), _e.subVectors(to, A).normalize()));
    // (the knee turned about hip-to-ankle to point where the clip's did)
    const ax = _d.subVectors(to, A).normalize(), e = wp(b2, _e).sub(A); e.addScaledVector(ax, -e.dot(ax));
    const p = _f.copy(pl); p.addScaledVector(ax, -p.dot(ax));
    if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) { let ang = e.angleTo(p); if (_n.crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  }
  return {
    get on() { return held; },
    apply(w) {
      restore();
      own.forEach((b, i) => orig[i].copy(b.quaternion)); origRoot.copy(root.position);
      held = w > 0.001;
      // (a pose already standing straight, both knees within STRAIGHT, is left as it is (his idle: its hips over one
      // foot as captured; moved over the middle, a near-straight leg folds by degrees); one bent past BENT gets it in
      // full, eased between)
      if (held) {
        body.parent.updateMatrixWorld(true); let kmax = 0;
        for (const s of SIDES) { const [b1, b2, b3] = leg(s); wp(b1, _a); wp(b2, _b); wp(b3, _c); kmax = Math.max(kmax, Math.PI - _d.subVectors(_a, _b).angleTo(_e.subVectors(_c, _b))); }
        const x = Math.min(1, Math.max(0, (kmax - STRAIGHT) / (BENT - STRAIGHT))); w *= x * x * (3 - 2 * x); held = w > 0.001;
      }
      if (held) {
        const mesh = body.parent; mesh.updateMatrixWorld(true);
        const e = mesh.matrixWorld.elements, g = e[13], fwd = _f.set(e[8], 0, e[10]).normalize(), fx = fwd.x, fz = fwd.z;
        for (const s of SIDES) {
          const [b1, b2, b3] = leg(s), so = sole[s];
          wp(b1, H[s]); const K = wp(b2, _b), A = wp(b3, _c);
          // the knee's way, off the hip-to-ankle line
          const ax = _d.subVectors(A, H[s]).normalize(); pole[s].subVectors(K, H[s]); pole[s].addScaledVector(ax, -pole[s].dot(ax));
          // the sole flat: its up turned to the sky
          b3.getWorldQuaternion(foot[s]); _m.multiplyMatrices(b3.matrixWorld, so.ibm);
          const up = _e.copy(so.up).transformDirection(b3.matrixWorld);
          foot[s].premultiply(_q.setFromUnitVectors(up, UP));
          // the ankle where it is across the ground, its sole on it (a clip's own within SOLE_TOL of that is left as it
          // is: a straight leg folds by degrees for a few millimetres, so a clean stand's feet are not nudged)
          T[s].copy(A); const sy = g + (so.ankY - so.minY) * _n.setFromMatrixColumn(_m, 1).length() + LIFT;
          if (Math.abs(A.y - sy) > SOLE_TOL) T[s].y = sy;
        }
        // the hips over the feet, raised until the straighter leg's knee is at KNEE
        const dx = (T.L.x + T.R.x) / 2 + fx * HIP_FWD - (H.L.x + H.R.x) / 2, dz = (T.L.z + T.R.z) / 2 + fz * HIP_FWD - (H.L.z + H.R.z) / 2;
        // (raised, never lowered for it: a clip already straighter than KNEE keeps its own height (lowered, its other leg
        // would fold); lowered only as far as the legs need to reach the ground at all)
        let dy = Infinity, dyS = Infinity;
        for (const s of SIDES) {
          const [b1, b2, b3] = leg(s), la = H[s].distanceTo(wp(b2, _b)), lb = _b.distanceTo(wp(b3, _c));
          const dmax = Math.sqrt(la * la + lb * lb - 2 * la * lb * Math.cos(KNEE)), hz = Math.hypot(H[s].x + dx - T[s].x, H[s].z + dz - T[s].z);
          dy = Math.min(dy, T[s].y + Math.sqrt(Math.max(0, dmax * dmax - hz * hz)) - H[s].y);
          dyS = Math.min(dyS, T[s].y + Math.sqrt(Math.max(0, (la + lb) * (la + lb) - hz * hz)) - H[s].y);
        }
        dy = Math.min(Math.max(dy, 0), dyS);
        // (bounded: a pose far from a stand is moved no further than a stand's own correction)
        const cl = (x, a) => Math.min(a, Math.max(-a, x));
        wp(root, rw).add(_a.set(cl(dx, 0.15), Math.min(0.1, Math.max(-0.05, dy)), cl(dz, 0.15))); root.position.copy(root.parent.worldToLocal(rw)); root.updateMatrixWorld(true);
        for (const s of SIDES) { reach(s, T[s], pole[s]); setWorld(B['foot_' + s], foot[s]); }
        if (w < 0.999) {
          own.forEach((b, i) => { _q.copy(b.quaternion); b.quaternion.slerpQuaternions(orig[i], _q, w); });
          root.position.lerpVectors(origRoot, _a.copy(root.position), w);
        }
        body.updateMatrixWorld(true);
      }
      own.forEach((b, i) => wrote[i].copy(b.quaternion)); wroteRoot.copy(root.position);
    },
    // (the clip's values back, nothing held over them: whatever poses him next starts from the clip, and finds its own
    // touches left alone)
    release() { restore(); own.forEach((b, i) => { orig[i].copy(b.quaternion); wrote[i].copy(b.quaternion); }); origRoot.copy(root.position); wroteRoot.copy(root.position); held = false; },
  };
}
