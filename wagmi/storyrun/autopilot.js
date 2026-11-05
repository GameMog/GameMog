// Mog City story runner: the creator's test drive, inside the game (?autopilot=1). It plays the story through Mog City's
// own controllers: the car's and Dan's input (controllerManager.setTouchInput, as the touch controls send it), along
// the GPS's own route (W.gps.route), with the Story Kit work page's nudges moved in here:
//   - a long leg jumped to its last 110 m (the car put on the route there, facing along it), each leg of a stops step
//     its own; braked to stop on the mark (a heavy car sails past it), and put on it after 40 s circling close by;
//   - a wedged car (wagmi/game.js carStuck) put back on the road (W.recoverCar), or 40 m on along the route;
//   - a held-up walk moved 6 m on;
//   - into the car for a drive, out of it for a walk or a search (W.ride, the quick way);
//   - a fight fought: strikes at the nearest man, counters when one swings close, and after 8 s the nearest man put down
//     every 1.5 s, the hero kept on his feet (a test drive checks that the story plays through, not the difficulty);
//   - a chase to lose, the pursuit's own (Mission 3's getaway, a world's pursuit step): the route away, boosting; seen too
//     long, held up or pinned (a heavy car, a tow truck, can't outrun them), the car put 140 m on along that route round
//     its corners, out of their sight: the pursuit's own search and escape bar then lose them ('lost'), never a count;
//   - Mog City's own mission phases (a step's ref): the tail kept 30-50 m behind the van along its own path; the yard
//     walked to the stash; Mack chased and rammed (after 40 s his car counted wrecked); the rigs walked up to and hit
//     with J; Mack's phone walked to and F held;
//   - &skipscenes=<s>: an authored scene skipped after s seconds (W.cineSkip, the held Space's), for a run inside its time;
//   - a mission over its time (opts.missionSecs, 240 s by default) is failed with where it stuck.
// Calls are answered and choices taken by the runner's flags (?autoanswer, ?autochoose=<n>).
//   startAutopilot(W, runner, { missionSecs, onTimeout }) -> { stop(), log }
import * as THREE from 'three/webgpu';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function startAutopilot(W, runner, { missionSecs = 240, onTimeout = null, skipScenes = 0 } = {}) {
  const app = W.app, cm = app.controllerManager, car = W.car, P = W.person, gps = W.gps;
  const log = [];
  let legKey = null, legT = 0;
  let on = true, stepKey = null, stepT = 0, jumped = false, lastProg = { t: 0, d: Infinity, x: 0, z: 0 }, fightT = 0, lastFin = 0, lastStrike = 0, mKey = null, mT = 0;
  const note = (what) => { log.push({ t: +(performance.now() / 1000).toFixed(1), what }); if (log.length > 80) log.shift(); };
  const inCar = () => cm.activeMode === 'car';
  const release = () => { for (const k of ['forward', 'backward', 'left', 'right', 'boost']) cm.setTouchInput(k, 0); };
  const lenOf = (r) => { let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); return L; };
  // the point `back` m before the route's end, and its heading
  function fromEnd(r, back) {
    let left = back;
    for (let i = r.length - 1; i > 0; i--) {
      const [ax, az] = r[i - 1], [bx, bz] = r[i], L = Math.hypot(bx - ax, bz - az);
      if (L >= left) { const k = 1 - left / L; return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, h: Math.atan2(bx - ax, bz - az) }; }
      left -= L;
    }
    return { x: r[0][0], z: r[0][1], h: r.length > 1 ? Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]) : 0 };
  }
  function along(r, x, z, ahead) {
    let bi = 1, bd = Infinity;
    for (let i = 1; i < r.length; i++) { const d = Math.hypot(r[i][0] - x, r[i][1] - z); if (d < bd) { bd = d; bi = i; } }
    let px = x, pz = z, left = ahead;
    for (let i = bi; i < r.length && left > 0; i++) { const L = Math.hypot(r[i][0] - px, r[i][1] - pz); if (L >= left) { px += (r[i][0] - px) / L * left; pz += (r[i][1] - pz) / L * left; left = 0; } else { left -= L; px = r[i][0]; pz = r[i][1]; } }
    return { x: px, z: pz };
  }
  function steerTo(tx, tz, vt) {
    const e = cm.getActiveEntity(), want = Math.atan2(tx - e.position.x, tz - e.position.z), err = wrapA(want - e.heading);
    if (inCar()) {
      const s = clamp(err * 2.2, -1, 1);
      cm.setTouchInput('left', s > 0 ? s : 0); cm.setTouchInput('right', s < 0 ? -s : 0);
      const v = car.speed || 0, slow = Math.abs(err) > 0.9 ? 6 : vt;
      cm.setTouchInput('forward', v < slow ? 0.85 : 0); cm.setTouchInput('backward', v > slow + 1.5 ? (v > slow + 5 ? 1 : 0.6) : 0);
    } else {
      // (on foot the controller walks the way the camera faces, which lags a turn: he is walked along the route
      // himself, at a jog, with the city's collision and his speed set so his gait plays)
      release();
      const dt = Math.min(0.05, frameDt), sp = 3.6;
      P.heading += clamp(err, -6 * dt, 6 * dt);
      P.position.x += Math.sin(P.heading) * sp * dt; P.position.z += Math.cos(P.heading) * sp * dt;
      cm.resolveHorizontalCollision(P.position, 0.48, P.position.y + 1.0);
      P.position.y = cm.getGroundHeight(P.position.x, P.position.z, 'person'); P.speed = sp;
    }
  }
  function putCar(x, z, h) {
    const p = { x, z };
    car.position.set(p.x, cm.getGroundHeight(p.x, p.z, 'car'), p.z); car.heading = h; car.speed = 0; car.vx = car.vz = car.angularVel = 0;
    car.mesh.position.copy(car.position); car.mesh.rotation.y = h;
    if (inCar()) { P.position.copy(car.position); P.heading = h; }
    app.cameraSystem.resetForTeleport?.();
  }
  // (a key pressed as a player would: the game's own listeners read it)
  const key = (code, type = 'keydown') => dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
  let held = null;
  const hold = (code) => { if (held === code) return; if (held) key(held, 'keyup'); held = code; if (code) key(code); };
  let cineT = 0, chaseJumpT = 0, seenT = 0, slowT = 0, tailS = null, lastKey = 0;
  let frameDt = 0.016, lastF = performance.now();
  function tick() {
    if (!on) return;
    requestAnimationFrame(tick);
    { const n = performance.now(); frameDt = (n - lastF) / 1000; lastF = n; }
    const M = runner.M;
    if (!M || W.paused || !M.def) { release(); return; }
    const d = M.def.steps[M.i], key = `${M.def.id}:${M.i}`, t = performance.now() / 1000;
    if (mKey !== M.def.id) { mKey = M.def.id; mT = t; }
    if (t - mT > missionSecs && !M.tok.dead) { note(`timeout ${key} ${d?.type}`); onTimeout?.(M.def, d, M.i); mT = t; }
    if (key !== stepKey) { stepKey = key; stepT = t; jumped = false; lastProg = { t, d: Infinity, x: 0, z: 0 }; fightT = 0; release(); hold(null); tailS = null; seenT = 0; slowT = 0; }
    // (a new leg inside one step, a stops step's next stop: its own jump, its own clock)
    { const dd = gps?.dest, lk = dd ? `${Math.round(dd.x)},${Math.round(dd.z)}` : null; if (lk !== legKey) { legKey = lk; legT = t; jumped = false; lastProg = { t, d: Infinity, x: 0, z: 0 }; } }
    // (an authored scene, skipped after skipScenes s of it)
    if (W.cutscene) { cineT += frameDt; if (skipScenes > 0 && cineT > skipScenes && W.cineSkip?.()) { note(`skip scene ${d?.id || ''}`); cineT = 0; } } else cineT = 0;
    if (!d || W.cutscene || W.directed) { release(); return; }
    const type = d.type;
    if (d.ref && part(d, t)) return;
    // a fight
    if (type === 'fight' || M.crew) {
      const combat = W.combat; if (!combat) return;
      combat.player.hp = combat.player.maxHp;
      const live = (combat.enemies || []).filter((e) => e.alive && !e.out);
      if (!live.length) { release(); return; }
      let n = live[0], nd = Infinity; for (const e of live) { const q = Math.hypot(e.pos.x - P.position.x, e.pos.z - P.position.z); if (q < nd) { nd = q; n = e; } }
      if (inCar()) { W.ride?.getOut?.(true); return; }
      if (nd > 2.2) steerTo(n.pos.x, n.pos.z, 4); else { release(); P.heading = Math.atan2(n.pos.x - P.position.x, n.pos.z - P.position.z); }
      if (t - lastStrike > 0.35 && nd < 3) { lastStrike = t; combat.debug?.press?.(Math.random() < 0.25 ? 'heavy' : 'strike'); }
      if (!fightT) fightT = t;
      if (t - fightT > 8 && t - lastFin > 1.5) { lastFin = t; const dir = new THREE.Vector3(n.pos.x - P.position.x, 0, n.pos.z - P.position.z).normalize(); try { n.hit({ kind: 'finisher', dmg: 9999, dir, w: 0.6, fly: 6, up: 4 }); note('assist ko'); } catch {} }
      return;
    }
    if (!['drive', 'stops', 'walk', 'search', 'pursuit', 'tail', 'place'].includes(type)) { release(); return; }
    // a chase to lose: escape() (the pursuit's own 'lost' ends it)
    if (type === 'pursuit' && d.goal !== 'reach' && escape(t)) return;
    // in or out of the car as the step wants
    const wantsFoot = type === 'search' || (type === 'walk' && !d.enterCar);
    if (wantsFoot && inCar()) { release(); if (Math.abs(car.speed) > 0.5) cm.setTouchInput('backward', 0.8); else if (!W.ride?.phase) { W.ride?.getOut?.(true); note('out'); } return; }
    if (!wantsFoot && !inCar() && type !== 'place') {
      release();
      if (!W.ride?.phase) {
        if (Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z) > 4) { P.position.set(car.position.x + Math.cos(car.heading) * 1.8, P.position.y, car.position.z - Math.sin(car.heading) * 1.8); }
        W.ride?.getIn?.(true); note('in');
      }
      return;
    }
    const r = gps?.route;
    if (!r || r.length < 2) { release(); return; }
    const e = cm.getActiveEntity(), x = e.position.x, z = e.position.z, L = lenOf(r);
    // a long leg: on to its last 110 m
    if (inCar() && !jumped && t - stepT > 1.2 && L > 250 && type !== 'tail' && type !== 'pursuit') { jumped = true; const q = fromEnd(r, 110); putCar(q.x, q.z, q.h); note(`jump ${Math.round(L)} m`); return; }
    if (!inCar() && !jumped && t - stepT > 1.2 && L > 60) { jumped = true; const q = fromEnd(r, 12); P.position.set(q.x, cm.getGroundHeight(q.x, q.z, 'person'), q.z); P.heading = q.h; note(`walk jump ${Math.round(L)} m`); return; }
    // stuck
    if (L < lastProg.d - 2) lastProg = { t, d: L, x, z };
    else if (t - lastProg.t > 5) {
      lastProg = { t, d: L, x, z };
      // (near the end: put down on it; else back on the road, or 40 m on along the route)
      if (inCar() && L < 45) { const q = fromEnd(r, 0.5); putCar(q.x, q.z, q.h); note('unstuck car: on the mark'); }
      else if (inCar()) { const q = along(r, x, z, 40), q2 = along(r, x, z, 46); putCar(q.x, q.z, Math.atan2(q2.x - q.x, q2.z - q.z)); note('unstuck car: 40 m on'); }
      else { const q = along(r, x, z, 6); P.position.set(q.x, cm.getGroundHeight(q.x, q.z, 'person'), q.z); note('unstuck walk'); }
      return;
    }
    // circling the mark (a heavy car overshoots, the route goes round the block, again): on the mark after 40 s close by
    if (inCar() && t - legT > 40 && L < 150 && type !== 'tail' && type !== 'pursuit') { legT = t; const q = fromEnd(r, 0.5); putCar(q.x, q.z, q.h); note('circling: on the mark'); return; }
    const radius = d.radius || 8, near = L < (inCar() ? Math.max(2.5, radius * 0.5) : 1.2);
    const tgt = inCar() && L < 25 ? (() => { const q = fromEnd(r, 0); return { x: q.x, z: q.z }; })() : along(r, x, z, inCar() ? 9 + Math.abs(car.speed || 0) * 0.6 : 3);
    if (near) { release(); if (inCar() && car.speed > 0.5) cm.setTouchInput('backward', 0.7); return; }
    // (the pace to stop on the mark: what a 3 m/s2 brake leaves to the radius, so a heavy car doesn't sail past it)
    steerTo(tgt.x, tgt.z, type === 'tail' ? 11 : Math.min(15, 2.5 + Math.sqrt(2 * 3 * Math.max(0, L - radius * 0.4))));
  }
  // a chase to lose (W.pursuit's: a world's pursuit step, Mission 3's getaway): kept on his feet if they jump out, a
  // route away (the far side of the nearest of the city's spawn points 600 m and more off) at the boost; seen for 7 s
  // running, pinned (stopped with one of them on him) or held up 2.5 s, the car put 140 m on along the route away,
  // round its corners and out of their sight, at most every 6 s: the pursuit then searches where it last saw him and
  // its own escape bar loses them. A heavy car can't outrun them; this way it isn't wrecked or caught either.
  function escape(t) {
    const ch = W.pursuit?.chase;
    if (W.combat?.player) W.combat.player.hp = W.combat.player.maxHp;
    if (!ch || ch.state !== 'on') return false;
    if (!inCar()) return false;
    if (!gps.dest || gps.dest.name !== 'away') {
      const e = cm.getActiveEntity(), T = Object.values(window.NYC?.TELEPORT_LOCATIONS || {});
      const far = T.filter((p) => Math.hypot(p.x - e.position.x, p.z - e.position.z) > 600).sort((a, b) => Math.hypot(a.x - e.position.x, a.z - e.position.z) - Math.hypot(b.x - e.position.x, b.z - e.position.z))[0];
      if (far) { gps.to({ x: far.x, z: far.z, name: 'away' }); note('chase: a route away'); }
      return true;
    }
    const r = gps.route; if (!r || r.length < 2) { release(); return true; }
    const dt = Math.min(0.05, frameDt);
    seenT = ch.seen ? seenT + dt : 0;
    slowT = Math.abs(car.speed || 0) < 4 ? slowT + dt : 0;
    const pinned = (ch.caughtT || 0) > 1.2;
    if ((seenT > 7 || slowT > 2.5 || pinned) && t - chaseJumpT > 6) {
      chaseJumpT = t; seenT = 0; slowT = 0;
      const x = car.position.x, z = car.position.z, q = along(r, x, z, 140), q2 = along(r, x, z, 146);
      putCar(q.x, q.z, Math.atan2(q2.x - q.x, q2.z - q.z)); car.speed = 12;
      note(`chase: out of their sight (${pinned ? 'pinned' : slowT > 2.5 ? 'held up' : 'seen'})`);
      return true;
    }
    const x = car.position.x, z = car.position.z, tg = along(r, x, z, 10 + Math.abs(car.speed || 0) * 0.6);
    steerTo(tg.x, tg.z, 30); cm.setTouchInput('boost', Math.abs(wrapA(Math.atan2(tg.x - x, tg.z - z) - car.heading)) < 0.3 ? 1 : 0);
    return true;
  }
  // Mog City's own mission phases (a step's ref): what a player does in each; true when handled this frame
  function part(d, t) {
    const S2 = W._m2part?.S, S3 = W._m3, combat = W.combat;
    if (combat?.player) combat.player.hp = combat.player.maxHp;
    const getIn = () => { release(); if (!W.ride?.phase) { if (Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z) > 4) P.position.set(car.position.x + Math.cos(car.heading) * 1.8, P.position.y, car.position.z - Math.sin(car.heading) * 1.8); W.ride?.getIn?.(true); note('in'); } };
    const getOut = () => { release(); if (Math.abs(car.speed) > 0.5) cm.setTouchInput('backward', 0.8); else if (!W.ride?.phase) { W.ride?.getOut?.(true); note('out'); } };
    const walkTo = (x, z, r = 1.2) => { const dd = Math.hypot(x - P.position.x, z - P.position.z); if (dd > r) steerTo(x, z, 3); else release(); return dd; };
    switch (d.ref) {
      case 'm2.tail': {
        const vd = S2?.vanD; if (!vd) { release(); return true; }
        if (!inCar()) { getIn(); return true; }
        const dv = Math.hypot(vd.pos.x - car.position.x, vd.pos.z - car.position.z);
        if (tailS == null) tailS = Math.max(0, vd.s - Math.max(20, dv));
        for (let k = 0; k < 40 && tailS < vd.s - 6; k++) { const q = vd.at(tailS); if (Math.hypot(q.x - car.position.x, q.z - car.position.z) > 10) break; tailS += 1.5; }
        const q = vd.at(tailS);
        slowT = Math.abs(car.speed || 0) < 1 && dv > 55 ? slowT + frameDt : 0;
        if (slowT > 4) { slowT = 0; const b = vd.at(Math.max(0, vd.s - 45)), b2 = vd.at(Math.max(0, vd.s - 40)); putCar(b.x, b.z, Math.atan2(b2.x - b.x, b2.z - b.z)); tailS = vd.s - 45; note('tail: back behind the van'); return true; }
        steerTo(q.x, q.z, clamp(vd.v + (dv - 38) * 0.35, 0, 30));
        return true;
      }
      case 'm2.go': {
        // (Times Square reached: 'Find the van', no route: up to it, slowly, to 60 m)
        const vd = S2?.vanD, r = gps.route;
        if (!vd || (r && r.length > 1 && gps.dest)) return false;
        if (!inCar()) { getIn(); return true; }
        const dv = Math.hypot(vd.pos.x - car.position.x, vd.pos.z - car.position.z);
        steerTo(vd.pos.x, vd.pos.z, dv > 65 ? 9 : 0); return true;
      }
      case 'm2.yard': {
        const st = S2?.Y?.stash; if (!st) { release(); return true; }
        if (inCar()) { getOut(); return true; }
        walkTo(st.x, st.z, 3); return true;
      }
      case 'm2.chase': {
        const md = S2?.mackD; if (!md) { release(); return true; }
        if (!inCar()) { getIn(); return true; }
        const x = car.position.x, z = car.position.z, dm = Math.hypot(md.pos.x - x, md.pos.z - z), r = gps.route;
        if (dm < 45 || !r || r.length < 2) { const a = md.at(Math.min(md.length, md.s + 6)); steerTo(a.x, a.z, md.v + 9); cm.setTouchInput('boost', dm > 12 ? 1 : 0); }
        else { const tg = along(r, x, z, 10 + Math.abs(car.speed || 0) * 0.6); steerTo(tg.x, tg.z, 32); cm.setTouchInput('boost', 1); }
        slowT = Math.abs(car.speed || 0) < 2 ? slowT + frameDt : 0;
        if (slowT > 3 && r && r.length > 1) { slowT = 0; const q = along(r, x, z, 40), q2 = along(r, x, z, 46); putCar(q.x, q.z, Math.atan2(q2.x - q.x, q2.z - q.z)); note('chase: unstuck 40 m on'); }
        if (t - stepT > 40 && S2.mackHp > 0) { S2.mackHp = 0; note("chase: Mack's car counted wrecked (assist)"); }
        return true;
      }
      case 'm2.phone': {
        const p = gps.dest; if (!p) { release(); return true; }
        if (inCar()) { getOut(); return true; }
        const dd = walkTo(p.x, p.z, 1.0);
        if (dd < 2.2) hold('KeyF'); return true;
      }
      case 'm3.rigs': {
        const R = S3?.R; if (!R) { release(); return true; }
        if (inCar()) { getOut(); return true; }
        let b = null, bd = Infinity; for (const r of R.rigs) if (!r.down) { const q = Math.hypot(r.x - P.position.x, r.z - P.position.z); if (q < bd) { bd = q; b = r; } }
        if (!b) { release(); return true; }
        if (bd > 1.7) { steerTo(b.x, b.z, 3); if (t - stepT > 3 && t - lastProg.t > 6) { lastProg = { t, d: bd, x: 0, z: 0 }; const k = Math.max(0, (bd - 1.4) / bd); P.position.x += (b.x - P.position.x) * k; P.position.z += (b.z - P.position.z) * k; note('rigs: up to the rig'); } if (bd < lastProg.d - 0.5) lastProg = { t, d: bd, x: 0, z: 0 }; return true; }
        release(); P.heading = Math.atan2(b.x - P.position.x, b.z - P.position.z);
        if (t - lastKey > 0.5) { lastKey = t; key('KeyJ'); setTimeout(() => key('KeyJ', 'keyup'), 80); }
        return true;
      }
      case 'm3.escape': return inCar() ? escape(t) : (getIn(), true);
      default: return false;
    }
  }
  tick();
  return { stop() { on = false; release(); hold(null); }, log };
}
