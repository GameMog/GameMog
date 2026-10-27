// Dan coming to a stop: his feet planted, not glided. Stopping, the stride freezes where it is and crossfades to the idle
// over a quarter second while he stands still, so without this both feet slid up to 37 cm across the street into the
// idle's stance (the motion verifier, 27 Oct). Over the pose, after the mixer and stand.js:
//  - at the stop, each ankle is pinned where it is in the world (the leg reaching it: two-bone IK, the knee pointing the
//    way the pose's does, the foot keeping the pose's turn), while the hips and the upper body blend into the idle;
//  - a foot steps (a short lift, STEP_H, over STEP s) once the idle blending in wants it more than SNAP from its pin or
//    TILT off its turn: one foot at a time, one caught in the air (or the further) first; a waiting foot keeps its turn
//    as well as its place: a foot only moves through the air;
//  - when the pose has settled (SETTLE s) and both are on their spots, the pins fade out over OUT (they are where the
//    pose has them by then: nothing moves).
// Anything else (moving again, the air, a move, the fight, a scene, a turn of more than TURN) lets go of the feet at once.
// restore() runs right after the mixer (before stand.js): the mixer only writes a value that changed since its own last
// write, so a bone still holding what this wrote the frame before gets back what it held under it (else the turns would
// pile up, and stand.js would take them for the clip's); apply(dt, still, moving) runs after stand.js: still, he is
// standing with nothing else on him; moving, the gaits' share of the pose (the stop starts while the stride is in it).
const STEP = 0.28, GAP = 0.04, STEP_H = 0.05, SNAP = 0.025, TILT = 0.17, SETTLE = 0.4, OUT = 0.15, TURN = 0.5;
export function createPlant(THREE, body, bones) {
  const B = bones, SIDES = ['L', 'R'], leg = (s) => [B['upperleg01_' + s], B['lowerleg01_' + s], B['foot_' + s]];
  if (!SIDES.every((s) => leg(s).every(Boolean))) return { apply() {}, restore() {}, release() {}, get on() { return false; } };
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _n = V(), _p = V(), _q = Q(), _q2 = Q(), _w = Q();
  const pin = { L: V(), R: V() }, from = { L: V(), R: V() }, to = { L: V(), R: V() }, fq = { L: Q(), R: Q() }, pq = { L: Q(), R: Q() }, hq = Q(), pole = { L: V(), R: V() };
  let st = null; // ({ t, yaw, step: {L, R} (when each foot's step began, -1 waiting), end (when the pins let go) } while it holds the feet)
  let armed = false;
  const own = [...leg('L'), ...leg('R')], under = own.map(Q), wrote = own.map(() => new THREE.Quaternion(NaN, NaN, NaN, NaN));
  const wp = (b, o) => b.getWorldPosition(o);
  function turnWorld(b, q) { b.getWorldQuaternion(_w); _q2.copy(q).multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  function setWorld(b, q) { b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(q)); b.updateMatrixWorld(true); }
  function reach(s, at) {
    const [b1, b2, b3] = leg(s), A = wp(b1, _a), K = wp(b2, _b), F = wp(b3, _c), la = A.distanceTo(K), lb = K.distanceTo(F);
    const ax0 = _d.subVectors(F, A).normalize(); pole[s].subVectors(K, A); pole[s].addScaledVector(ax0, -pole[s].dot(ax0));
    const d = Math.min(la + lb - 1e-4, Math.max(1e-3, at.distanceTo(A)));
    const u = _d.subVectors(A, K), w = _e.subVectors(F, K), cur = u.angleTo(w), want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(u, w); if (_n.lengthSq() < 1e-10) _n.set(1, 0, 0); _n.normalize(); turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    wp(b3, _c); turnWorld(b1, _q.setFromUnitVectors(_d.subVectors(_c, A).normalize(), _e.subVectors(at, A).normalize()));
    const ax = _d.subVectors(at, A).normalize(), e = wp(b2, _e).sub(A); e.addScaledVector(ax, -e.dot(ax)); const p = _p.copy(pole[s]); p.addScaledVector(ax, -p.dot(ax));
    if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) { let ang = e.angleTo(p); if (_n.crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  }
  const yawOf = () => { const e = body.parent.matrixWorld.elements; return Math.atan2(e[8], e[10]); };
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  return {
    get on() { return !!st; },
    restore() { own.forEach((b, i) => { if (b.quaternion.equals(wrote[i])) b.quaternion.copy(under[i]); wrote[i].set(NaN, NaN, NaN, NaN); }); },
    release() { this.restore(); st = null; },
    apply(dt, still, moving) {
      if (!still) { st = null; armed = true; return; }
      body.parent.updateMatrixWorld(true);
      if (!st) {
        if (!armed || moving < 0.15) return;
        armed = false; st = { t: 0, yaw: yawOf(), step: { L: -1, R: -1 }, end: null };
        for (const s of SIDES) { pin[s].copy(wp(leg(s)[2], _a)); leg(s)[2].getWorldQuaternion(pq[s]); }
      }
      if (Math.abs(Math.atan2(Math.sin(yawOf() - st.yaw), Math.cos(yawOf() - st.yaw))) > TURN) { st = null; return; }
      st.t += dt;
      // (where the pose wants each ankle now: the idle, blending in under us)
      for (const s of SIDES) { wp(leg(s)[2], to[s]); leg(s)[2].getWorldQuaternion(fq[s]); }
      const away = (s) => pin[s].distanceTo(to[s]) + (pin[s].y > to[s].y + 0.02 ? 1 : 0);
      const busy = SIDES.some((s) => st.step[s] >= 0 && st.t < st.step[s] + STEP + GAP);
      if (!busy) for (const s of away('L') >= away('R') ? ['L', 'R'] : ['R', 'L']) if (st.step[s] < 0 && (away(s) > SNAP || pq[s].angleTo(fq[s]) > TILT)) { st.step[s] = st.t; break; }
      if (st.end == null && st.t > SETTLE && SIDES.every((s) => (st.step[s] >= 0 ? st.t >= st.step[s] + STEP : away(s) <= SNAP && pq[s].angleTo(fq[s]) <= TILT))) st.end = st.t;
      const k = st.end != null ? 1 - smooth((st.t - st.end) / OUT) : 1;
      if (k <= 0) { st = null; return; }
      own.forEach((b, i) => under[i].copy(b.quaternion));
      for (const s of SIDES) {
        // (a waiting foot keeps its turn as well as its place; a stepping one turns to the idle's in the air)
        // (the step lifts before it travels and is over its spot before it comes down: a foot lands, it does not skate in)
        const t0 = st.step[s], u = t0 < 0 ? 0 : Math.min(1, (st.t - t0) / STEP), su = smooth((u - 0.1) / 0.75);
        const p = _p.copy(pin[s]).lerp(to[s], su); hq.copy(pq[s]).slerp(fq[s], su);
        if (t0 >= 0) p.y += Math.sin(Math.PI * u) * Math.min(STEP_H, 0.015 + 0.25 * pin[s].distanceTo(to[s]));
        from[s].copy(to[s]).lerp(p, k); reach(s, from[s]); setWorld(leg(s)[2], hq.slerp(fq[s], 1 - k));
      }
      own.forEach((b, i) => wrote[i].copy(b.quaternion));
      body.updateMatrixWorld(true);
    },
  };
}
