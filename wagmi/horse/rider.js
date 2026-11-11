// Mog City: the hero astride Ranger (ranger.js), and on his way up into the saddle and down out of it. The same API as
// the seated driver of Dan's car (wagmi/roadster.js createDriver), which wagmi/game.js picks for a horse, so the way in
// and out, the bail and the scenes work the same:
//   const d = createRider(THREE, rs, WAGMI.dan);
//   d.attach(ease)   into the saddle's frame where he stands, eased over from the pose he is in
//   d.pose(dt, k)    k 0: standing at the horse's left side (d.door, horse-local [x, z]), facing it; 1: in the saddle
//   d.detach(parent) back out, his body put in parent (standing beside it)
// Its own: d.face (his heading at the door against the horse's: facing it, -PI/2), d.strike(side, o) (a swing from the
// saddle: the right arm's overhead blow from Dan's 'smash', its upper body only, the torso turned to that flank),
// d.striking, d.after (run after each pose: what he holds is put in his hand there), d.hand(side, out) (a fist's world
// point), d.lean (a lean of his own over the gaits': { back, fwd }).
// The pose (any hero: every Story Kit person is on the same 66-joint rig with Dan's clips): his 'sit' as the base (the
// back upright, the head up), the hips on the seat, the legs reached down round the barrel to the stirrups (the knees
// forward and out, the feet set absolutely: the ball on the tread, the heel down, the toes a little out), the hands low
// over the withers either side of the horn in loose fists round the reins (thumbs up, set from the forearm), the elbows
// by his sides. The gait moves him: upright at a walk; at a trot he rises out of the saddle and sits once a stride (a
// posting trot); at a gallop he stands in the stirrups, his hips up off the seat and his chest forward over the neck
// (two-point). A buck throws his shoulders back.
// The way up (k 0 to 1, the way down the same backwards): his left foot up into the stirrup, the left hand on the horn
// and the right on the cantle; up beside the saddle, standing in the stirrup; the right leg swung over the croup; down
// into the seat, the right foot into its stirrup, the hands to the reins.

export function createRider(THREE, rs, q, { fade = 0.22 } = {}) {
  const { body, bones: B, mixer } = q, anchor = rs.anchor, M = rs.marks;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const track = (keys) => (k) => {
    if (k <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) if (k <= keys[i][0]) { const a = keys[i - 1], b = keys[i], t = smooth((k - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * t); }
    return keys[keys.length - 1].slice(1);
  };
  // the marks (the saddle's frame: the horse's at rest; x its left, y up, z ahead)
  const SEAT = [0, rs.seat.hip[1], rs.seat.hip[2]];
  const ST = { L: M.stirrup.L, R: M.stirrup.R }, HORN = M.horn;
  const DOOR = [0.98, -0.18];   // (where he stands to mount: by the left stirrup, an arm's length out)
  // the foot on the stirrup: the ankle over the tread, back from it so the ball of the foot is on it, the heel down
  const ankleOn = (side) => { const s = ST[side]; return [s.x + (side === 'L' ? -0.01 : 0.01), s.y + 0.085, s.z - 0.08]; };
  const FL = ankleOn('L'), FR = ankleOn('R');
  let R0 = null;   // (his hips over his feet in the idle, measured the first time)
  const hip = (k) => track([[0, DOOR[0] + R0.x, R0.y, DOOR[1] + R0.z], [0.12, DOOR[0] + R0.x - 0.04, R0.y + 0.02, DOOR[1] + R0.z], [0.3, 0.74, 1.42, -0.16],
    [0.5, 0.48, SEAT[1] + 0.24, -0.16], [0.68, 0.24, SEAT[1] + 0.26, -0.15], [0.86, 0.04, SEAT[1] + 0.07, -0.15], [1, SEAT[0], SEAT[1], SEAT[2]]])(k);
  // his heading against the horse's: facing it at the door, turning ahead as he rises
  const yaw = track([[0, -Math.PI / 2], [0.25, -1.45], [0.45, -1.05], [0.65, -0.45], [0.85, -0.08], [1, 0]]);
  // the lean of his back (hips to neck): [weight, tilt from upright, which way (0 ahead, PI/2 to his left... in the
  // saddle's frame: from +z toward +x)]
  const lean = track([[0, 0, 0, 0], [0.18, 1, 0.12, -Math.PI / 2], [0.4, 1, 0.42, -Math.PI / 2], [0.6, 1, 0.38, 0.4], [0.78, 1, 0.3, 0.1], [0.92, 1, 0.08, 0], [1, 0, 0, 0]]);
  // the feet: the left up into its stirrup first and staying there; the right on the street till he rises, then up
  // behind and over the croup, down the right side into its stirrup
  const footL = track([[0.06, DOOR[0] + 0.09, 0.1, DOOR[1] - 0.02], [0.22, FL[0] + 0.12, FL[1] + 0.08, FL[2]], [0.3, ...FL], [1, ...FL]]);
  const footR = track([[0.06, DOOR[0] - 0.02, 0.1, DOOR[1] - 0.3], [0.36, DOOR[0] - 0.22, 0.12, DOOR[1] - 0.28], [0.5, 0.62, 1.15, -0.62], [0.62, 0.3, 2.05, -0.88],
    [0.72, -0.2, 2.02, -0.75], [0.84, -0.48, 1.35, -0.3], [0.95, ...FR], [1, ...FR]]);
  const wFoot = track([[0.03, 0, 0], [0.12, 1, 1]]);
  // the hands: the left to the horn, the right to the cantle, while he climbs; then both to the reins
  const handL = track([[0.08, HORN.x + 0.05, HORN.y + 0.02, HORN.z - 0.02], [0.8, HORN.x + 0.05, HORN.y + 0.02, HORN.z - 0.02], [1, M.rein.L.x, M.rein.L.y, M.rein.L.z]]);
  const handR = track([[0.1, 0.16, SEAT[1] + 0.08, -0.47], [0.58, 0.16, SEAT[1] + 0.08, -0.47], [0.78, 0.0, SEAT[1] + 0.25, -0.2], [1, M.rein.R.x, M.rein.R.y, M.rein.R.z]]);
  const wHandL = track([[0.04, 0], [0.16, 1]]), wHandR = track([[0.08, 0], [0.2, 1], [0.58, 1], [0.66, 0.4], [0.86, 1]]);
  const sitW = track([[0.45, 0], [0.9, 1]]);

  // the actions: his 'sit' (its legs and its upper body as two layers) and 'idle' as the base; the blow's upper body
  // over the sit's, so at its height it is all the blow's above the hips while the legs stay the saddle's
  const UPPER = (n) => !/^(root|pelvis_|upperleg|lowerleg|foot_)/.test(n);
  const part = (name, keepUpper) => {
    const src = q.clips.includes(name) ? q.act(name).getClip() : null; if (!src) return null;
    const a = mixer.clipAction(new THREE.AnimationClip(`${name}/${keepUpper ? 'upper' : 'legs'}`, src.duration, src.tracks.filter((t) => UPPER(t.name.split('.')[0]) === keepUpper)), body);
    return a;
  };
  const idle = q.act('idle'), sitLegs = part('sit', false), sitUpper = part('sit', true);
  const blowAct = part('smash', true);
  if (blowAct) { blowAct.setLoop(THREE.LoopOnce, 1); blowAct.clampWhenFinished = true; }
  const BASE = [sitLegs, sitUpper, idle].filter(Boolean);

  const _a = V(), _b = V(), _c = V(), _t = V(), _n = V(), _p = V(), _r = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qw = new THREE.Quaternion();
  const up = V(0, 1, 0);
  function turnWorld(b, r) { b.getWorldQuaternion(_qw); _q2.copy(r).multiply(_qw); b.parent.getWorldQuaternion(_qw); b.quaternion.copy(_qw.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  // two-bone reach (wagmi/roadster.js createDriver's): b1 b2 b3 so b3 is at `to`, the middle joint toward `pole`; w blends
  function reach(n1, n2, n3, to, pole, w) {
    const b1 = B[n1], b2 = B[n2], b3 = B[n3]; if (!b1 || !b2 || !b3 || w < 0.01) return;
    const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
    b1.getWorldPosition(_a); b2.getWorldPosition(_b); b3.getWorldPosition(_c);
    const la = _a.distanceTo(_b), lb = _b.distanceTo(_c), d = Math.min(la + lb - 1e-3, Math.max(1e-3, to.distanceTo(_a)));
    const cur = _p.subVectors(_a, _b).normalize().angleTo(_n.subVectors(_c, _b).normalize());
    const want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(_p.subVectors(_a, _b), _n.subVectors(_c, _b)); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize();
    turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    b3.getWorldPosition(_c);
    turnWorld(b1, _q.setFromUnitVectors(_p.subVectors(_c, _a).normalize(), _n.subVectors(to, _a).normalize()));
    b2.getWorldPosition(_b);
    const ax = _p.subVectors(to, _a).normalize(), e = _n.subVectors(_b, _a); e.addScaledVector(ax, -e.dot(ax));
    const pl = _r.copy(pole); pl.addScaledVector(ax, -pl.dot(ax));
    if (e.lengthSq() > 1e-6 && pl.lengthSq() > 1e-6) { let ang = e.angleTo(pl); if (_c.crossVectors(e, pl).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
    if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, _q.copy(b1.quaternion), w); b2.quaternion.slerpQuaternions(q2, _q2.copy(b2.quaternion), w); b1.updateMatrixWorld(true); }
  }
  const world = (a, out) => anchor.localToWorld(out.set(a[0], a[1], a[2]));
  const dirOf = (a, b, out) => out.subVectors(B[b].getWorldPosition(_t), B[a].getWorldPosition(out)).normalize();
  const bodyQ = new THREE.Quaternion(), _pole = V(), _to = V(), _d = V(), _w = V();
  // in the saddle's frame, turned by his yaw now, as a world direction
  const his = (x, y, z, out) => out.set(x, y, z).applyQuaternion(bodyQ).applyQuaternion(anchor.getWorldQuaternion(_qw)).normalize();
  const sad = (x, y, z, out) => out.set(x, y, z).applyQuaternion(anchor.getWorldQuaternion(_qw)).normalize();

  /* ---------------------------------------------------------- the hands -- */
  // loose fists round the reins: the fingers curled about their own hinges (the opening's, read off his fight clip's
  // fist: wagmi/roadster.js WHEEL.hinge; the left hand's mirrored), the thumb laid along the top; the hand set from the
  // forearm, thumb side up, palm toward the horse's middle. The hands' bones are put back to the clips' own each frame
  // and when he gets down (as the driver's: a clip only writes a bone when its value changes)
  const HINGE = { 1: [0.92, -0.1, -0.38], 2: [0.45, 0.66, 0.6], 3: [0.43, 0.56, 0.71], 4: [0.39, 0.46, 0.8], 5: [0.35, 0.35, 0.87], len: [-0.42, -0.48, 0.77] };
  const CURL = [[0.85, 1.1, 0.7], [0.92, 1.2, 0.75], [0.98, 1.2, 0.75], [1.02, 1.15, 0.7]], THUMB = [0.15, 0.25, 0.15, 0.5];
  const hingeOf = (n, sd) => { const [x, y, z] = HINGE[n]; return (sd === 'R' ? V(x, y, z) : V(x, -y, -z)).normalize(); };
  const HK = ['L', 'R'].flatMap((sd) => [`lowerarm02_${sd}`, `wrist_${sd}`, ...[1, 2, 3, 4, 5].flatMap((f) => [1, 2, 3].map((j) => `finger${f}-${j}_${sd}`))])
    .map((n) => B[n]).filter(Boolean).map((b) => ({ b, clean: b.quaternion.clone(), wrote: null }));
  const keepHands = () => { for (const s of HK) { if (s.wrote && s.b.quaternion.equals(s.wrote)) s.b.quaternion.copy(s.clean); else s.clean.copy(s.b.quaternion); } };
  const wroteHands = () => { for (const s of HK) (s.wrote ||= new THREE.Quaternion()).copy(s.b.quaternion); };
  const freeHands = () => { for (const s of HK) { if (s.wrote && s.b.quaternion.equals(s.wrote)) s.b.quaternion.copy(s.clean); s.wrote = null; } };
  function handFrame(sd) {
    const w = B['wrist_' + sd].getWorldPosition(V()), m = B[`finger3-1_${sd}`].getWorldPosition(V()), f = m.clone().sub(w).normalize();
    const a = B[`finger2-1_${sd}`].getWorldPosition(V()).sub(B[`finger5-1_${sd}`].getWorldPosition(V())); a.addScaledVector(f, -a.dot(f)).normalize();
    return { f, a };
  }
  // the hand along its forearm (a little down at the knuckles), its index side up, then the fingers closed
  function fist(sd, w, grip = 1) {
    if (w < 0.01 || !B['wrist_' + sd] || !B['finger3-1_' + sd] || !B['finger2-1_' + sd] || !B['finger5-1_' + sd]) return;
    const fa = B['wrist_' + sd].getWorldPosition(V()).sub(B['lowerarm01_' + sd].getWorldPosition(V())).normalize();
    const f = fa.clone().addScaledVector(sad(0, 1, 0, V()), -0.25).normalize();
    const a = sad(0, 1, 0, V()); a.addScaledVector(f, -a.dot(f)).normalize();
    const H = handFrame(sd);
    const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(H.f, H.a, V().crossVectors(H.f, H.a)));
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, a, V().crossVectors(f, a)));
    const turn = q1.multiply(q0.invert()); if (w < 0.999) turn.slerpQuaternions(new THREE.Quaternion(), turn.clone(), w);
    const wr = B['wrist_' + sd], tw = B['lowerarm02_' + sd];
    turnWorld(wr, turn);
    // (most of the hand's twist to the forearm's twist bone: no wrung wrist)
    if (tw && wr.parent === tw) { const dd = wr.position.clone().normalize(), qq = wr.quaternion, s = dd.x * qq.x + dd.y * qq.y + dd.z * qq.z;
      const part = new THREE.Quaternion().slerp(new THREE.Quaternion(dd.x * s, dd.y * s, dd.z * s, qq.w).normalize(), 0.85 * w); tw.quaternion.multiply(part); wr.quaternion.premultiply(part.invert()); tw.updateMatrixWorld(true); }
    const gq = new THREE.Quaternion(), gq2 = new THREE.Quaternion();
    CURL.forEach((c, i) => { const ax = hingeOf(i + 2, sd); c.forEach((ang, j) => B[`finger${i + 2}-${j + 1}_${sd}`]?.quaternion.slerp(gq.setFromAxisAngle(ax, ang * grip), w)); });
    const [t1, t2, t3, sw] = THUMB, ax = hingeOf(1, sd);
    B['finger1-1_' + sd]?.quaternion.slerp(gq.setFromAxisAngle(hingeOf('len', sd), sw).multiply(gq2.setFromAxisAngle(ax, t1)), w);
    B['finger1-2_' + sd]?.quaternion.slerp(gq.setFromAxisAngle(ax, t2), w); B['finger1-3_' + sd]?.quaternion.slerp(gq.setFromAxisAngle(ax, t3), w);
    wr.updateMatrixWorld(true);
  }
  // a foot set absolutely: its turn in his idle (against his body's) carried onto the saddle, the toes out a little and
  // the heel down
  const footRel = {};
  function setFoot(sd, w) {
    const f = B['foot_' + sd]; if (!f || !footRel[sd] || w < 0.01) return;
    const out = (sd === 'L' ? 1 : -1) * 0.2;
    _q.copy(anchor.getWorldQuaternion(_qw)).multiply(_q2.setFromAxisAngle(up, out)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.16)).multiply(footRel[sd]);
    f.parent.getWorldQuaternion(_qw);
    const want = _qw.invert().multiply(_q);
    f.quaternion.slerp(want, w); f.updateMatrixWorld(true);
  }

  /* -------------------------------------------------------------- blows -- */
  // a swing from the saddle: the blow's upper body, the torso turned to that flank (side +1 his left, -1 his right)
  const blow = { on: false, t: 0, from: 0.2, until: 0.5, hit: 0.386, ts: 1.0, side: -1, env: 0, onHit: null, hitDone: false };
  function strike(side = -1, o = {}) {
    if (!blowAct || blow.on) return false;
    Object.assign(blow, { on: true, t: o.from ?? 0.2, from: o.from ?? 0.2, until: o.until ?? 0.5, hit: o.hit ?? 0.386, ts: o.ts ?? 1.0, side: side >= 0 ? 1 : -1, env: 0, onHit: o.onHit || null, hitDone: false });
    blowAct.reset(); blowAct.timeScale = 0; blowAct.play();
    return true;
  }
  const twist = { now: 0 };

  // (the clips' weights: every other action of his off; the sit's two layers held on its first frame)
  function weights(sw, bw) {
    for (const a of mixer._actions) if (!BASE.includes(a) && a !== blowAct) a.setEffectiveWeight(0);
    for (const a of BASE) { a.enabled = true; if (!a.isRunning()) a.play(); }
    if (sitLegs) { sitLegs.time = 0; sitLegs.setEffectiveWeight(sw); }
    if (sitUpper) { sitUpper.time = 0; sitUpper.setEffectiveWeight(sw * (1 - bw)); }
    idle.setEffectiveWeight(1 - sw);
    if (blowAct) blowAct.setEffectiveWeight(bw);
  }
  const snap = { on: false, t: 0, q: new Map(), root: V(), pos: V(), quat: new THREE.Quaternion() };
  const all = Object.values(B);
  // (his right hand with something in it: resting on his right thigh, what he holds down by the horse's shoulder)
  const REST_R = [-0.25, SEAT[1] + 0.02, -0.02];
  let wpn = 0;
  const d = {
    door: DOOR, face: -Math.PI / 2, attached: false, kind: 'rider', after: null, onAttach: null, onDetach: null, weapon: null, lean: { back: 0, fwd: 0 },
    get striking() { return blow.on; },
    strike,
    hand(sd, out = V()) { const b = B[`finger3-1_${sd}`] || B['wrist_' + sd]; return b.getWorldPosition(out); },
    attach(ease = fade) {
      anchor.updateWorldMatrix(true, false); body.updateWorldMatrix(true, false);
      for (const b of all) { let s = snap.q.get(b); if (!s) snap.q.set(b, (s = new THREE.Quaternion())); s.copy(b.quaternion); }
      snap.root.copy(B.root.position);
      anchor.attach(body); snap.pos.copy(body.position); snap.quat.copy(body.quaternion);
      snap.on = ease > 0; snap.t = 0; snap.dur = ease;
      if (!R0) {
        // (his idle: the hips over his feet, and each foot's turn against his body's)
        const p0 = body.position.clone(), q0 = body.quaternion.clone();
        weights(0, 0); mixer.update(0); body.position.set(0, 0, 0); body.quaternion.identity(); body.updateMatrixWorld(true);
        R0 = anchor.worldToLocal(B.root.getWorldPosition(V()));
        const bq = body.getWorldQuaternion(new THREE.Quaternion()).invert();
        for (const sd of ['L', 'R']) if (B['foot_' + sd]) footRel[sd] = bq.clone().multiply(B['foot_' + sd].getWorldQuaternion(new THREE.Quaternion()));
        body.position.copy(p0); body.quaternion.copy(q0);
      }
      d.attached = true;
      try { d.onAttach?.(); } catch (e) { console.error('[horse] attach', e); }
    },
    detach(parent) {
      try { d.onDetach?.(); } catch (e) { console.error('[horse] detach', e); }
      parent.add(body); body.position.set(0, 0, 0); body.quaternion.identity();
      for (const a of [sitLegs, sitUpper, blowAct]) if (a) { a.setEffectiveWeight(0); a.stop(); } blow.on = false;
      freeHands();
      d.attached = false;
      rs.reins?.(null, null);
    },
    pose(dt, k) {
      k = Math.min(1, Math.max(0, k));
      rs.group.updateWorldMatrix(true, true);
      // the blow over the seat: in fast, out after its end
      let bw = 0;
      if (blow.on) {
        blow.t += dt * blow.ts;
        blow.env = Math.min(1, blow.env + dt / 0.06);
        const out = Math.max(0, (blow.t - blow.until) / 0.18);
        bw = blow.env * (1 - Math.min(1, out));
        if (!blow.hitDone && blow.t >= blow.hit) { blow.hitDone = true; try { blow.onHit?.(blow); } catch (e) { console.error('[horse] blow', e); } }
        if (out >= 1) { blow.on = false; bw = 0; blowAct?.stop(); }
        else if (blowAct) blowAct.time = Math.min(blow.t, blow.until);
      }
      bw *= smooth((k - 0.9) / 0.1);
      weights(smooth(sitW(k)[0]), bw); mixer.update(dt); keepHands();
      // the gait's seat: rising at the trot, up in the stirrups at the gallop, thrown back by a buck
      const tw = rs.weight?.('trot') || 0, gw = rs.weight?.('gallop') || 0, one = rs.oneShot;
      const post = tw * 0.075 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * (rs.phase?.('trot') || 0)));
      const buckK = one && one.name === 'buck' ? Math.sin(Math.PI * Math.min(1, Math.max(0, (one.t - 0.25) / 1.6))) : 0;
      const jumpK = one && one.name === 'jump' ? Math.sin(Math.PI * Math.min(1, Math.max(0, (one.t - 0.62) / 1.3))) : 0;
      const seatK = smooth((k - 0.86) / 0.14);
      const lift = seatK * (post + gw * 0.08 + jumpK * 0.08);
      // where he is: turned by his yaw, the hips put on their mark
      bodyQ.setFromAxisAngle(up, yaw(k)[0]);
      body.quaternion.copy(bodyQ); body.position.set(0, 0, 0); body.updateMatrixWorld(true);
      const h = hip(k), r = anchor.worldToLocal(B.root.getWorldPosition(_p));
      body.position.set(h[0] - r.x, h[1] - r.y + lift, h[2] - r.z - seatK * (gw * 0.05)); body.updateMatrixWorld(true);
      // his back: the way up's lean, and in the saddle the gait's (forward at the trot, well forward at the gallop,
      // back against a buck), his head kept nearer level
      const [wl0, tilt0, az0] = lean(k);
      const fwd = seatK * (tw * 0.12 + gw * 0.62 + jumpK * 0.3 + d.lean.fwd) - seatK * (buckK * 0.45 + d.lean.back);
      const wl = Math.max(wl0, Math.min(1, Math.abs(fwd) * 4)), tilt = wl0 > 0.01 ? tilt0 : Math.abs(fwd), az = wl0 > 0.01 ? az0 : fwd >= 0 ? 0 : Math.PI;
      if (wl > 0.01 && B.spine05 && B.neck01) {
        const cur = dirOf('spine05', 'neck01', _d), want = _to.set(Math.sin(tilt) * Math.sin(az), Math.cos(tilt), Math.sin(tilt) * Math.cos(az)).transformDirection(anchor.matrixWorld);
        _q.setFromUnitVectors(cur, _w.copy(cur).lerp(want, wl).normalize()); turnWorld(B.spine05, _q);
        if (B.neck01) { const nd = dirOf('neck01', 'head', _d), lv = _w.copy(sad(0, 1, 0.35, V())).lerp(nd, 0.45).normalize(); _q.setFromUnitVectors(nd, nd.clone().lerp(lv, 0.6 * wl).normalize()); turnWorld(B.neck01, _q); }
      }
      // (a blow: the torso turned to its flank, more of it low in the back)
      twist.now += ((blow.on ? blow.side * 1.05 * bw : 0) - twist.now) * Math.min(1, dt * 14);
      if (Math.abs(twist.now) > 0.01) for (const [n, s] of [['spine04', 0.4], ['spine02', 0.35], ['neck01', -0.25]]) if (B[n]) turnWorld(B[n], _q.setFromAxisAngle(sad(0, 1, 0, V()), twist.now * s));
      // the legs to the stirrups, the knees forward and out round the barrel; the feet set on the treads
      const wf = wFoot(k)[0];
      reach('upperleg01_L', 'lowerleg01_L', 'foot_L', world(footL(k), _to), sad(0.75, 0.05, 1, _pole), wf);
      reach('upperleg01_R', 'lowerleg01_R', 'foot_R', world(footR(k), _to), sad(-0.75, 0.05, 1, _pole), wf);
      setFoot('L', wf * smooth((k - 0.2) / 0.1)); setFoot('R', wf * smooth((k - 0.88) / 0.1));
      // the hands: the left to the horn then the reins; the right to the cantle then the reins (let go in a blow)
      const wl2 = wHandL(k)[0], wr2 = wHandR(k)[0] * (1 - bw);
      wpn += ((d.weapon ? 1 : 0) - wpn) * Math.min(1, dt * 8);
      reach('upperarm01_L', 'lowerarm01_L', 'wrist_L', world(handL(k), _to), sad(0.6, -1, -0.5, _pole), wl2);
      if (wr2 > 0.01) { const hr = handR(k), t = wpn * seatK; reach('upperarm01_R', 'lowerarm01_R', 'wrist_R', world(hr.map((v, i) => v + (REST_R[i] - v) * t), _to), sad(-0.6, -1, -0.5, _pole), wr2); }
      fist('L', wl2); fist('R', wr2 * (1 - 0.15 * wpn));
      // (eased over from the pose he came in with)
      if (snap.on) {
        snap.t += dt; const f = smooth(snap.t / snap.dur);
        if (f >= 1) snap.on = false;
        else {
          for (const b of all) { _q.copy(b.quaternion); b.quaternion.copy(snap.q.get(b)).slerp(_q, f); }
          B.root.position.lerpVectors(snap.root, _p.copy(B.root.position), f);
          body.position.lerpVectors(snap.pos, _p.copy(body.position), f); _q.copy(body.quaternion); body.quaternion.copy(snap.quat).slerp(_q, f);
          body.updateMatrixWorld(true);
        }
      }
      wroteHands();
      // the reins to his fists once he holds them (on the horn and the cantle, they lie on the neck)
      const held = smooth((k - 0.85) / 0.15);
      // (with something in his right hand, or in a blow, both reins in his left, neck-reining)
      if (held > 0.5) rs.reins?.(d.hand('L', _a), wr2 > 0.5 && wpn < 0.5 ? d.hand('R', _b) : d.hand('L', _b).addScaledVector(sad(-1, 0, 0, _c), 0.035));
      else rs.reins?.(null, null);
      try { d.after?.(dt, k); } catch (e) { console.error('[horse] after', e); }
    },
  };
  return d;
}
