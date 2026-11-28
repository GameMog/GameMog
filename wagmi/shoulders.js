// Mog City: the story cast's shoulders down where they belong (the owner, 28 Nov: Jay's shoulders "look padded"). Dan's
// shared clips, put on a forged body, shrug it: sitting, a hug's base pose, arms folded, arms raised turn the
// collarbones 17-49 degrees and lift the shoulder joints 8-12 cm toward the ears, and any shirt reads as football pads.
// Over the pose, after everything else that poses the arms (a set's hug or hand held: f.post), each side:
//  - where the shoulder joint (upperarm01) sits in the chest's frame (the collarbones' parent), against where it sits in the
//    body's own idle, the two sides evened: its lift (up the spine) and its roll forward;
//  - past CAP up or CAPF forward, the collarbone is turned about its root so the joint comes down (and back) to the cap; and the higher shoulder down to within TOL of the other's lift (Jay's idle: his right
//    shoulder 2.5 cm over his left, from how the clip lands on his rig);
//  - the arm then reaches where the clip had the hand (two-bone IK, thigh-and-shin's solve on upper arm and forearm, the
//    elbow the clip's way, the hand its own turn): the arms do what the clip meant, from shoulders that sit naturally.
// The mixer writes a bone only when its value changed, so restore() runs right after the mixer (as footlock.js does).
//   createShoulders(THREE, root, bones) -> { restore(), apply(), lift() } | null   Off with ?shoulders=0.
export const SHOULDERS = { on: !/[?&]shoulders=0\b/.test(globalThis.location?.search || ''), CAP: 0.012, CAPF: 0.015, TOL: 0.005, LEVEL: 0.006, LEVEL_MAX: 0.03 };

export function createShoulders(THREE, root, bones, { ref = null } = {}) {
  const B = bones, SIDES = ['L', 'R'];
  const chain = (s) => [B['clavicle_' + s], B['shoulder01_' + s], B['upperarm01_' + s], B['lowerarm01_' + s], B['wrist_' + s]];
  if (!SIDES.every((s) => chain(s).every(Boolean)) || !B.neck01) return null;
  const chest = B['clavicle_L'].parent; if (!chest || chest !== B['clavicle_R'].parent) return null;
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _n = V(), _p = V(), _q = Q(), _q2 = Q(), _w = Q();
  // where each shoulder joint belongs, in the chest's frame (the collarbones' parent): the body's own idle at its first
  // frame (ref, a clip: how it stands relaxed; a forged body's bind pose may be an A-pose with its shoulders up), the two
  // sides evened (their mean height and roll, mirrored across): up the spine and forward in that frame
  const inChest = (b, o) => chest.worldToLocal(b.getWorldPosition(o));
  const saved = []; root.traverse((o) => { if (o.isBone) saved.push([o, o.quaternion.clone(), o.position.clone()]); });
  let m = null; if (ref) { try { m = new THREE.AnimationMixer(root); m.clipAction(ref).play(); m.setTime(0); } catch { m = null; } }
  root.updateMatrixWorld(true);
  const restAt = { L: inChest(chain('L')[2], V()), R: inChest(chain('R')[2], V()) };
  const up = inChest(B.neck01, V()).normalize(), across = V().subVectors(restAt.L, restAt.R), fwd = V().crossVectors(across, up).normalize();
  { const h = B.head ? inChest(B.head, V()) : null; if (h && h.dot(fwd) < 0) fwd.negate(); }
  { const mu = (restAt.L.dot(up) + restAt.R.dot(up)) / 2, mf = (restAt.L.dot(fwd) + restAt.R.dot(fwd)) / 2;
    for (const s of SIDES) { const p = restAt[s]; p.addScaledVector(up, mu - p.dot(up)).addScaledVector(fwd, mf - p.dot(fwd)); } }
  // (the temporary mixer let go before the bones are put back: stopping it puts back what it first bound)
  if (m) { try { m.stopAllAction(); m.uncacheRoot(root); } catch {} }
  for (const [o, q, p] of saved) { o.quaternion.copy(q); o.position.copy(p); }
  root.updateMatrixWorld(true);
  const own = [...chain('L'), ...chain('R')], under = own.map(Q), wrote = own.map(() => new THREE.Quaternion(NaN, NaN, NaN, NaN));
  const clipW = { L: V(), R: V() }, clipE = { L: V(), R: V() }, clipWq = { L: Q(), R: Q() }, pole = V();
  function turnWorld(b, q) { b.getWorldQuaternion(_w); _q2.copy(q).multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  function setWorld(b, q) { b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(q)); b.updateMatrixWorld(true); }
  // the upper arm and forearm to put the wrist at `at`, the elbow toward `el` (the clip's)
  function reach(s, at, el) {
    const [, , b1, b2, b3] = chain(s), A = b1.getWorldPosition(_a), K = b2.getWorldPosition(_b), F = b3.getWorldPosition(_c), la = A.distanceTo(K), lb = K.distanceTo(F);
    const d = Math.min(la + lb - 1e-4, Math.max(1e-3, at.distanceTo(A)));
    const u = _d.subVectors(A, K), w = _e.subVectors(F, K), cur = u.angleTo(w), want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(u, w); if (_n.lengthSq() < 1e-10) _n.set(0, 0, 1); _n.normalize(); turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    b3.getWorldPosition(_c); turnWorld(b1, _q.setFromUnitVectors(_d.subVectors(_c, A).normalize(), _e.subVectors(at, A).normalize()));
    // (the elbow round the shoulder-wrist line to the clip's side)
    const ax = _d.subVectors(at, A).normalize(), e = b2.getWorldPosition(_e).sub(A); e.addScaledVector(ax, -e.dot(ax));
    const p = pole.subVectors(el, A); p.addScaledVector(ax, -p.dot(ax));
    if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) { let ang = e.angleTo(p); if (_n.crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  }
  // each side's lift up the spine and roll forward (m), the clip's pose as it is now
  // (a move in the chest's frame: its height in the world)
  const downW = (m) => { chest.getWorldQuaternion(_w); return _n.copy(m).applyQuaternion(_w).y; };
  const liftOf = (s) => { const p = inChest(chain(s)[2], _p).sub(restAt[s]); return [p.dot(up), p.dot(fwd)]; };
  const api = {
    lift() { root.updateMatrixWorld(true); return { L: liftOf('L'), R: liftOf('R') }; },
    restore() { own.forEach((b, i) => { if (b.quaternion.equals(wrote[i])) b.quaternion.copy(under[i]); wrote[i].set(NaN, NaN, NaN, NaN); }); },
    apply() {
      if (!SHOULDERS.on || !root.visible) return;
      root.updateMatrixWorld(true);
      const L = { L: liftOf('L'), R: liftOf('R') };
      const want = {};
      for (const s of SIDES) { const o = s === 'L' ? 'R' : 'L'; want[s] = [Math.min(L[s][0], SHOULDERS.CAP, Math.max(L[o][0], -0.02) + SHOULDERS.TOL), Math.min(L[s][1], SHOULDERS.CAPF)]; }
      // each side's move, in the chest's frame: down and back by what is over the caps
      const mv = { L: V(), R: V() }; let any = false;
      for (const s of SIDES) { mv[s].addScaledVector(up, -Math.max(0, L[s][0] - want[s][0])).addScaledVector(fwd, -Math.max(0, L[s][1] - want[s][1])); }
      // (and level across the room: the higher shoulder joint down to within LEVEL of the other's height in the world,
      // at most LEVEL_MAX: Jay's idle rolls his chest and carries his right shoulder 2.5 cm over his left)
      { const yL = chain('L')[2].getWorldPosition(_a).y, yR = chain('R')[2].getWorldPosition(_b).y;
        const dW = (yR + downW(mv.R)) - (yL + downW(mv.L)), hi = dW > 0 ? 'R' : 'L', over = Math.min(SHOULDERS.LEVEL_MAX, Math.abs(dW) - SHOULDERS.LEVEL);
        if (over > 0) { chest.getWorldQuaternion(_w); mv[hi].add(_p.set(0, -over, 0).applyQuaternion(_q2.copy(_w).invert())); } }
      for (const s of SIDES) if (mv[s].lengthSq() > 1e-6) any = true;
      if (!any) return;
      own.forEach((b, i) => under[i].copy(b.quaternion));
      for (const s of SIDES) { const c = chain(s); c[4].getWorldPosition(clipW[s]); c[3].getWorldPosition(clipE[s]); c[4].getWorldQuaternion(clipWq[s]); }
      for (const s of SIDES) {
        if (!(mv[s].lengthSq() > 1e-6)) continue;
        const [cl, , ua, , wr] = chain(s);
        // (the collarbone turned about its own root so the shoulder joint goes where it is moved to: the turn between the
        // two directions from that root, in the chest's frame, put into the world's)
        const piv = inChest(cl, _c), cur = inChest(ua, _d), tgt = _e.copy(cur).add(mv[s]);
        const from = cur.sub(piv).normalize(), to = tgt.sub(piv).normalize();
        chest.getWorldQuaternion(_w); from.applyQuaternion(_w); to.applyQuaternion(_w);
        turnWorld(cl, _q.setFromUnitVectors(from, to));
        reach(s, clipW[s], clipE[s]); setWorld(wr, clipWq[s]);
      }
      own.forEach((b, i) => wrote[i].copy(b.quaternion));
    },
  };
  return api;
}
