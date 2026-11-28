// Mog City: locked footprints for the story cast (Mandi's Revenge, H7). The cast plays clips (Dan's, retargeted onto each
// body: retarget.js) while the story moves their bodies along paths, turns them on the spot and crossfades one clip into
// the next, and nothing tied the clip's feet to the ground: a walk at a pace its clip was not captured at (runner.js and
// sets.js clamp the gait's pace to 0.6-1.6), a start or a stop's crossfade, a turn, a talk pose blending over an idle,
// each slid the feet across the street. The street crowd never slides (js/pedestrians.js PersonRig plants each footstep
// in the world and bends the legs to it by two-bone IK); this does the same over a clip, after the mixer:
//  - a foot is planted when its ankle comes down to its floor (DOWN over the lowest it has been lately): from that
//    frame its ankle is one fixed point in the world, with its turn on the ground, until the clip lifts it (UP: the
//    heel coming off), so a stance can not slide whatever the body does over it;
//  - the leg reaches the planted ankle by two-bone IK (thigh and shin), the knee pointing the way the clip's does, the
//    foot keeping the clip's roll and pitch with its planted turn;
//  - a foot let go goes back to the clip's over OUT s; one the body has moved off (more than REACH from where the
//    clip wants it, or turned TURN away) steps there: a short lift over STEP s, one foot at a time, as a person turning
//    on the spot or settling into a new stance does;
//  - standing (an idle, a talk), the hips shift their weight from foot to foot, slowly and a little (SWAY): with both
//    feet planted the knees take it, so no one stands like a statue on a loop.
// A jump of the body (a cut, a teleport, more than JUMP in a frame), a body carried (in a car, faster than CARRIED m/s),
// a hidden body or a held frame lets go of the feet.
// The idea (a footprint fixed from heel strike to toe-off, the legs solved to it, the slip measured) is the one the
// agent-demos New York walkers describe; nothing of theirs is used here (no licence): the solve is Mog City's own,
// the same as wagmi/plant.js's.
// The mixer writes a bone only when its value changed since its own last write, so restore() runs right after the
// mixer: a bone still holding what this wrote gets back the clip's value under it (else the turns would pile up on a
// held frame). apply(dt, { idle }) runs after everything else that poses the body (a set's arms: f.post).
//   createFootLock(THREE, root, bones) -> { restore(), apply(dt, o), release(), stats } | null (a rig without the legs)
// Off with ?footlock=0. The slip it leaves is measured by wagmi/footslip.js (lab/feet.html, and in play).
const DOWN = 0.03, UP = 0.06, REACH = 0.2, TURN = 0.45, STEP = 0.24, LIFT = 0.045, OUT = 0.12, JUMP = 0.6, CARRIED = 6.5;
// the weight shift standing: the hips' travel to the side (m), how long a shift takes (s, per person), its ease in
const SWAY = { side: 0.016, drop: 0.006, secs: [5.2, 7.8], ease: 1.2 };
export const FOOTLOCK = { on: !/[?&]footlock=0\b/.test(globalThis.location?.search || ''), sway: !/[?&]sway=0\b/.test(globalThis.location?.search || '') };

export function createFootLock(THREE, root, bones, { seed = 0 } = {}) {
  const B = bones, SIDES = ['L', 'R'], leg = (s) => [B['upperleg01_' + s], B['lowerleg01_' + s], B['foot_' + s]];
  if (!B.root || !SIDES.every((s) => leg(s).every(Boolean))) return null;
  const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _n = V(), _p = V(), _t = V(), _q = Q(), _q2 = Q(), _w = Q(), _yq = Q(), _up = new THREE.Vector3(0, 1, 0);
  const hips = B.root;
  const own = [...leg('L'), ...leg('R')], under = own.map(Q), wrote = own.map(() => new THREE.Quaternion(NaN, NaN, NaN, NaN));
  const hipUnder = V(), hipWrote = new THREE.Vector3(NaN, NaN, NaN);
  // each foot: free | pin (planted) | out (going back to the clip: a step when lift)
  const F = Object.fromEntries(SIDES.map((s) => [s, { mode: 'free', floor: null, pin: V(), yaw: 0, from: V(), fromYaw: 0, u: 0, lift: false, clip: V(), clipYaw: 0, clipQ: Q(), pole: V() }]));
  // (the foot's forward, in its own frame: the body's forward the first frame it is seen, through the foot's turn then)
  const fwd = { L: null, R: null };
  const last = V(); let seen = false, t = 0, swayW = 0;
  const stats = { pins: 0, steps: 0, lets: 0 };
  const per = SWAY.secs[0] + (SWAY.secs[1] - SWAY.secs[0]) * ((seed % 1000) / 1000), ph = (seed % 6283) / 1000;

  const wp = (b, o) => b.getWorldPosition(o);
  function turnWorld(b, q) { b.getWorldQuaternion(_w); _q2.copy(q).multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  function setWorld(b, q) { b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(q)); b.updateMatrixWorld(true); }
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // the leg to the ankle at `at`: the knee bent to the distance, the thigh swung onto it, then turned about the hip-ankle
  // line so the knee points where the pose's did (two-bone IK, as plant.js and the crowd's PersonRig solve theirs)
  function reach(s, at) {
    const [b1, b2, b3] = leg(s), A = wp(b1, _a), K = wp(b2, _b), Fp = wp(b3, _c), la = A.distanceTo(K), lb = K.distanceTo(Fp);
    const ax0 = _d.subVectors(Fp, A).normalize(), pole = F[s].pole.subVectors(K, A); pole.addScaledVector(ax0, -pole.dot(ax0));
    const d = Math.min(la + lb - 1e-4, Math.max(1e-3, at.distanceTo(A)));
    const u = _d.subVectors(A, K), w = _e.subVectors(Fp, K), cur = u.angleTo(w), want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(u, w); if (_n.lengthSq() < 1e-10) _n.set(1, 0, 0); _n.normalize(); turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    wp(b3, _c); turnWorld(b1, _q.setFromUnitVectors(_d.subVectors(_c, A).normalize(), _e.subVectors(at, A).normalize()));
    const ax = _d.subVectors(at, A).normalize(), e = wp(b2, _e).sub(A); e.addScaledVector(ax, -e.dot(ax)); const p = _p.copy(pole); p.addScaledVector(ax, -p.dot(ax));
    if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) { let ang = e.angleTo(p); if (_n.crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  }
  // a foot's turn on the ground (its forward, flattened), from its world turn
  const yawOfQ = (s, q) => { const f = _t.copy(fwd[s]).applyQuaternion(q); return Math.atan2(f.x, f.z); };
  function reset() { for (const s of SIDES) { F[s].mode = 'free'; F[s].floor = null; } seen = false; swayW = 0; }

  const api = {
    stats,
    get planted() { return SIDES.filter((s) => F[s].mode === 'pin').length; },
    // (right after the mixer: the clip's values back where the mixer left this frame's own)
    restore() {
      own.forEach((b, i) => { if (b.quaternion.equals(wrote[i])) b.quaternion.copy(under[i]); wrote[i].set(NaN, NaN, NaN, NaN); });
      if (hips.position.equals(hipWrote)) hips.position.copy(hipUnder); hipWrote.set(NaN, NaN, NaN);
    },
    release() { api.restore(); reset(); },
    apply(dt, { idle = false, seated = false } = {}) {
      // (seated, or riding in something (a car's seat: the body parented to its anchor): the feet go with it)
      if (!FOOTLOCK.on || !root.visible || !(dt > 0) || seated || (root.parent && !root.parent.isScene)) { reset(); return; }
      root.updateMatrixWorld(true);
      const rp = _a.setFromMatrixPosition(root.matrixWorld), gy = rp.y;
      const jumped = seen && (Math.hypot(rp.x - last.x, rp.z - last.z) > JUMP || Math.abs(rp.y - last.y) > JUMP || dt > 0.25);
      const speed = seen ? Math.hypot(rp.x - last.x, rp.z - last.z) / dt : 0;
      // (carried: in a car's seat, on a boat, faster than anyone runs: the feet go with the body, nothing to plant)
      const carried = speed > CARRIED;
      last.copy(rp); if (jumped || carried) reset(); seen = true; t += dt;
      if (carried) return;
      own.forEach((b, i) => under[i].copy(b.quaternion)); hipUnder.copy(hips.position);
      // (standing: the weight from foot to foot, eased in once both feet are down and the body is still)
      const stand = idle && speed < 0.05 && SIDES.every((s) => F[s].mode === 'pin');
      swayW = stand && FOOTLOCK.sway ? Math.min(1, swayW + dt / SWAY.ease) : Math.max(0, swayW - dt / 0.3);
      if (swayW > 0) {
        const k = smooth(swayW), a = (2 * Math.PI * t) / per + ph, side = Math.sin(a) * SWAY.side * k, drop = (1 - Math.cos(2 * a)) * 0.5 * SWAY.drop * k;
        const e = root.matrixWorld.elements, rx = e[0], rz = e[2], n = Math.hypot(rx, rz) || 1;
        const hp = wp(hips, _b); hp.x += (rx / n) * side; hp.z += (rz / n) * side; hp.y -= drop;
        hips.parent.worldToLocal(hp); hips.position.copy(hp); hips.updateMatrixWorld(true);
      }
      // where the clip has each ankle and its turn
      for (const s of SIDES) {
        const f = F[s], b = leg(s)[2];
        wp(b, f.clip); b.getWorldQuaternion(f.clipQ);
        if (!fwd[s]) { const e = root.matrixWorld.elements; fwd[s] = new THREE.Vector3(e[8], 0, e[10]).normalize().applyQuaternion(_q.copy(f.clipQ).invert()); }
        f.clipYaw = yawOfQ(s, f.clipQ);
        const h = f.clip.y - gy;
        f.floor = f.floor == null ? h : Math.min(h, f.floor + dt * 0.03);
        f.rel = h - f.floor;
      }
      const stepping = (s) => F[s].mode === 'out' && F[s].lift;
      for (const s of SIDES) {
        const f = F[s], o = s === 'L' ? 'R' : 'L';
        if (f.mode === 'free' && f.rel < DOWN) { f.mode = 'pin'; f.pin.copy(f.clip); f.yaw = f.clipYaw; stats.pins++; }
        else if (f.mode === 'pin') {
          const off = Math.hypot(f.clip.x - f.pin.x, f.clip.z - f.pin.z), turn = Math.abs(wrap(f.clipYaw - f.yaw));
          if (f.rel > UP) { f.mode = 'out'; f.lift = false; f.u = 0; f.from.copy(f.pin); f.fromYaw = f.yaw; stats.lets++; }
          // (a step: one foot at a time, the further first; a foot the body has left far behind goes now whatever)
          else if ((off > REACH || turn > TURN) && (!stepping(o) || off > 2 * REACH)) {
            const oo = F[o]; const oOff = oo.mode === 'pin' ? Math.hypot(oo.clip.x - oo.pin.x, oo.clip.z - oo.pin.z) : 0;
            if (oo.mode !== 'pin' || off >= oOff || off > 2 * REACH) { f.mode = 'out'; f.lift = true; f.u = 0; f.from.copy(f.pin); f.fromYaw = f.yaw; stats.steps++; }
          }
        }
      }
      let any = false;
      for (const s of SIDES) {
        const f = F[s];
        if (f.mode === 'free') continue;
        let yaw;
        if (f.mode === 'pin') { _p.set(f.pin.x, f.clip.y, f.pin.z); yaw = f.yaw; }
        else {
          f.u += dt / (f.lift ? STEP : OUT);
          const k = smooth(f.lift ? (f.u - 0.1) / 0.75 : f.u);
          _p.copy(f.from).lerp(f.clip, k); _p.y = f.clip.y + (f.lift ? Math.sin(Math.PI * Math.min(1, f.u)) * LIFT : 0);
          yaw = f.fromYaw + wrap(f.clipYaw - f.fromYaw) * k;
          if (f.u >= 1) f.mode = 'free';
        }
        any = true;
        reach(s, _t.copy(_p));
        // (the foot: the clip's roll and pitch, turned on the ground to its planted way)
        _yq.setFromAxisAngle(_up, wrap(yaw - f.clipYaw));
        setWorld(leg(s)[2], _q.copy(_yq).multiply(f.clipQ));
      }
      if (any || swayW > 0) { own.forEach((b, i) => wrote[i].copy(b.quaternion)); if (swayW > 0) hipWrote.copy(hips.position); }
    },
  };
  return api;
}
