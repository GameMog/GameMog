// Mog City story runner: the creator's test drive, inside the game (?autopilot=1). It plays the story through Mog City's
// own controllers: the car's and Dan's input (controllerManager.setTouchInput, as the touch controls send it), along
// the GPS's own route (W.gps.route), with the Story Kit work page's nudges moved in here:
//   - a long leg jumped to its last 110 m (the car put on the route there, facing along it), each leg of a stops step
//     its own; braked to stop on the mark (a heavy car sails past it), and put on it after 40 s circling close by;
//   - a wedged car (wagmi/game.js carStuck) put back on the road (W.recoverCar), or 40 m on along the route;
//   - a held-up walk moved 6 m on;
//   - a tow: driven up to the car, put on the spot in front of it (backing up is the player's), F held at the wheel to
//     hook it, then driven to the drop-off with it on the hook;
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
// &realpace=1: a player's pace, to time what is timed to one (a call waiting `at` s into a drive): no leg, tail or convoy
// jumped, the cruise 20 m/s (45 mph) where it is 15.
//   startAutopilot(W, runner, { missionSecs, onTimeout, realPace }) -> { stop(), log }
import * as THREE from 'three/webgpu';
import { world } from '../world/index.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function startAutopilot(W, runner, { missionSecs = 240, onTimeout = null, skipScenes = 0, realPace = false, fair = false } = {}) {
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
      // (on a horse W alone is a trot: a gallop (Shift) wherever the pace wanted is past it, as a rider would)
      if (car.kind === 'horse') cm.setTouchInput('boost', slow > (car.topSpeed || 4.5) + 1 && Math.abs(err) < 0.6 ? 1 : 0);
    } else {
      // (on foot the controller walks the way the camera faces, which lags a turn: he is walked along the route
      // himself, at a jog, with the city's collision and his speed set so his gait plays)
      release();
      const dt = Math.min(0.05, frameDt), sp = footSp;
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
    // (a horse's own way over the ground starts again where it is put: wagmi/horse/drive.js)
    if (car.kind === 'horse' && W.horse?.drive?.S) Object.assign(W.horse.drive.S, { ground: null, air: false, jumpY: 0, jumpV: 0, rammed: 0 });
    if (inCar()) { P.position.copy(car.position); P.heading = h; }
    app.cameraSystem.resetForTeleport?.();
  }
  // (a key pressed as a player would: the game's own listeners read it)
  const key = (code, type = 'keydown') => dispatchEvent(new KeyboardEvent(type, { code, key: code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
  let held = null;
  const hold = (code) => { if (held === code) return; if (held) key(held, 'keyup'); held = code; if (code) key(code); };
  let cineT = 0, chaseJumpT = 0, seenT = 0, slowT = 0, tailS = null, tailJumpT = 0, tailJumped = false, lastKey = 0, tPhase = null, tPhaseT = 0;
  let frameDt = 0.016, lastF = performance.now(), footSp = 3.6, sneakWait = 0, raceKey = null, horseMv = null, parkedFor = null;
  function tick() {
    if (!on) return;
    requestAnimationFrame(tick);
    { const n = performance.now(); frameDt = (n - lastF) / 1000; lastF = n; }
    const M = runner.M;
    if (!M || W.paused || !M.def) { release(); return; }
    const d = M.def.steps[M.i], key = `${M.def.id}:${M.i}`, t = performance.now() / 1000;
    if (mKey !== M.def.id) { mKey = M.def.id; mT = t; }
    if (t - mT > missionSecs && !M.tok.dead) { note(`timeout ${key} ${d?.type}`); onTimeout?.(M.def, d, M.i); mT = t; }
    if (key !== stepKey) { stepKey = key; stepT = t; jumped = false; lastProg = { t, d: Infinity, x: 0, z: 0 }; fightT = 0; release(); hold(null); tailS = null; tailJumped = false; seenT = 0; slowT = 0; }
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
      if (!fair) combat.player.hp = combat.player.maxHp;
      const live = (combat.enemies || []).filter((e) => e.alive && !e.out && e.state !== 'dying');
      if (!live.length) { release(); return; }
      let n = live[0], nd = Infinity; for (const e of live) { const q = Math.hypot(e.pos.x - P.position.x, e.pos.z - P.position.z); if (q < nd) { nd = q; n = e; } }
      // (a fight to have in the saddle (the step's `saddle`): ridden at the nearest one, the bat swung at his side)
      if (inCar() && d.saddle) {
        // (one on its feet, as a rider picks: a man lying in the street is no target from up there)
        { let bd = Infinity; for (const e of live) { if (!(e.standing || e.state === 'getup')) continue; const q = Math.hypot(e.pos.x - P.position.x, e.pos.z - P.position.z); if (q < bd) { bd = q; n = e; nd = q; } } }
        const dx = n.pos.x - car.position.x, dz = n.pos.z - car.position.z, side = (dx * Math.cos(car.heading) - dz * Math.sin(car.heading)) > 0 ? 1 : -1;
        const rr0 = n.creature ? (n.T?.radius || 0.5) : 0;
        // (ridden at, at a gallop from further off, past its flank)
        if (nd > 2.4 + rr0) steerTo(n.pos.x - side * 1.6 * Math.cos(car.heading), n.pos.z + side * 1.6 * Math.sin(car.heading), nd > 12 ? 12 : 4.5); else { release(); }
        if (t - lastStrike > 0.6 && nd < 3.4 + rr0) { lastStrike = t; try { W.horse?.swing?.(side); } catch {} }
        if (!fightT && nd < 6 + rr0) fightT = t;
        if (!fair && fightT && t - fightT > 10 && t - lastFin > 1.5) { lastFin = t; try { n.hit({ kind: 'finisher', dmg: 9999, dir: new THREE.Vector3(dx, 0, dz).normalize(), w: 0.6, fly: 6, up: 4 }); note('assist ko'); } catch {} }
        return;
      }
      if (inCar()) { W.ride?.getOut?.(true); return; }
      // (off his horse to fight on foot: Ranger led a few metres back out of the fight, away from them, so the fight is
      // seen; a player would leave him where he got down)
      if (car.kind === 'horse' && W.horse?.give && parkedFor !== stepKey && !W.ride?.phase) {
        parkedFor = stepKey;
        const dx = P.position.x - n.pos.x, dz = P.position.z - n.pos.z, dn = Math.hypot(dx, dz) || 1;
        if (Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z) < 8) W.horse.give({ x: P.position.x + dx / dn * 9, z: P.position.z + dz / dn * 9, heading: Math.atan2(-dx, -dz) });
      }
      // (a creature's body is bigger than a man's: his reach from its middle grows with it)
      const rr = n.creature ? (n.T?.radius || 0.5) : 0;
      if (nd > 2.2 + rr) steerTo(n.pos.x, n.pos.z, 4); else { release(); P.heading = Math.atan2(n.pos.x - P.position.x, n.pos.z - P.position.z); }
      if (t - lastStrike > 0.35 && nd < 3 + rr) { lastStrike = t; combat.debug?.press?.(Math.random() < 0.25 ? 'heavy' : 'strike'); }
      // (the clock for the assist starts once he is up to them: a lair's boss is walked up to and fought a while first)
      if (!fightT && (!n.creature || nd < 5 + rr || t - stepT > 25)) fightT = t;
      if (!fightT) return;
      if (!fair && t - fightT > 8 && t - lastFin > 1.5) { lastFin = t; const dir = new THREE.Vector3(n.pos.x - P.position.x, 0, n.pos.z - P.position.z).normalize(); try { n.hit({ kind: 'finisher', dmg: 9999, dir, w: 0.6, fly: 6, up: 4 }); note('assist ko'); } catch {} }
      return;
    }
    // a tow: up to the car and on to the drop-off by the route (below); backing up to its nose, put on the spot after 1.5 s
    // and F held at the wheel; the hook-up and the drop play themselves
    if (type === 'tow' && M.tow && M.tow.phase !== 'reach' && M.tow.phase !== 'haul') {
      if (M.tow.phase !== tPhase) { tPhase = M.tow.phase; tPhaseT = t; }
      if (M.tow.phase !== 'hook') { release(); hold(null); return; }
      if (!inCar()) { release(); if (!W.ride?.phase) { W.ride?.getIn?.(true); note('in'); } return; }
      const sp = M.tow.spot;
      if ((M.tow.d > 1.2 || M.tow.al > 0.3) && t - tPhaseT > 1.5) { release(); putCar(sp.x, sp.z, sp.h); note('tow: backed up to it'); return; }
      release(); if (M.tow.d <= 1.6 && M.tow.al <= 0.45) hold('KeyF');
      return;
    }
    if (type === 'tow' && held) hold(null);
    // (a convoy: kept in its band behind the car it follows, convoy())
    if (type === 'convoy' && M.convoy) { convoy(M.convoy, t); return; }
    // (a chase beside a step with nowhere to go, a call taken with the crew on him: kept moving and away from them)
    if (M.chase && ['call', 'wait', 'say', 'voicemail', 'voicenote', 'dm', 'set', 'timer', 'trigger'].includes(type) && escape(t)) return;
    // (a herd to drive into its pen (runner.js drove): ridden round to the far side of it from the pen and pushed on)
    if (type === 'drove') {
      if (!inCar()) { release(); if (!W.ride?.phase) W.ride?.getIn?.(true); return; }
      const w = M.wild?.push; if (!w) { release(); return; }
      const e = cm.getActiveEntity(), dw = Math.hypot(w.x - e.position.x, w.z - e.position.z);
      // (far from the herd: there by the route, as any leg (below); near it: straight in behind them and on)
      if (dw < 40) { steerTo(dw < 4 ? w.cx : w.x, dw < 4 ? w.cz : w.z, dw > 20 ? 8 : 5); if (car.kind === 'horse') cm.setTouchInput('boost', 0); return; }
    }
    // (a flee: the hero kept on his feet in a test drive, a fair one excepted)
    if (type === 'flee' && !fair && W.combat?.player) W.combat.player.hp = W.combat.player.maxHp;
    if (!['drive', 'stops', 'walk', 'search', 'pursuit', 'tail', 'place', 'tow', 'passenger', 'roadblock', 'stealth', 'collect', 'mount', 'sneak', 'flee', 'track', 'drove'].includes(type)) { release(); return; }
    // a chase to lose: escape() (the pursuit's own 'lost' ends it)
    if (type === 'pursuit' && d.goal !== 'reach' && escape(t)) return;
    // in or out of the car as the step wants
    const wantsFoot = type === 'search' || (type === 'walk' && !d.enterCar) || (type === 'stealth' && d.mode !== 'car');
    if (wantsFoot && inCar()) { release(); if (Math.abs(car.speed) > 0.5) cm.setTouchInput('backward', 0.8); else if (!W.ride?.phase) { W.ride?.getOut?.(true); note('out'); } return; }
    // (a collect is done in the saddle or on foot, whichever he is: neither is forced)
    if (!wantsFoot && !inCar() && type !== 'place' && type !== 'collect') {
      release();
      if (!W.ride?.phase) {
        if (Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z) > 4) { P.position.set(car.position.x + Math.cos(car.heading) * 1.8, P.position.y, car.position.z - Math.sin(car.heading) * 1.8); }
        W.ride?.getIn?.(true); note('in');
      }
      return;
    }
    // (a collect: the last 20 m straight at the supply, which may stand off the lane the route ends on)
    if (type === 'collect' && M.dest) {
      const e = cm.getActiveEntity(), sd = Math.hypot(M.dest.x - e.position.x, M.dest.z - e.position.z);
      if (sd < 20) { if (!inCar() || Math.abs(car.speed || 0) < 6 || sd > 8) steerTo(M.dest.x, M.dest.z, inCar() ? 4 : 3.6); else { release(); cm.setTouchInput('backward', 0.6); }
        if (sd < 6 && t - lastProg.t > 6) { lastProg = { t, d: sd, x: 0, z: 0 }; const k = Math.max(0, (sd - 1) / sd); e.position.x += (M.dest.x - e.position.x) * k; e.position.z += (M.dest.z - e.position.z) * k; note('collect: on to it'); }
        else if (sd < lastProg.d - 0.5) lastProg = { t, d: sd, x: 0, z: 0 };
        return; }
    }
    const r = gps?.route;
    if (!r || r.length < 2) { release(); return; }
    const e = cm.getActiveEntity(), x = e.position.x, z = e.position.z, L = lenOf(r);
    footSp = 3.6;
    // (&realpace: a stealth on foot is sneaked as a player sneaks it, not jogged and jumped: at a walk (1.7 m/s), and
    // stopped while a lookout's cone (m2-stealth.js: 15 m, 41 degrees each side) takes in the next steps, 10 s at most
    // for each wait, so it is timed as a player would play it. The runner keeps the test drive unseen whatever it does.)
    if (realPace && type === 'stealth' && !inCar()) {
      footSp = 1.7;
      const S = M.stealth, ah = along(r, x, z, 2.5);
      // (one getting suspicious, his '?' filling: back out of his cone, away from him, as the bar empties)
      const sus = S && S.lookouts.filter((L0) => L0.watching && L0.e.alive && L0.sus > 0.06).sort((a, b) => b.sus - a.sus)[0];
      if (sus) { const dx = x - sus.e.pos.x, dz = z - sus.e.pos.z, dd = Math.hypot(dx, dz) || 1; steerTo(x + dx / dd * 3, z + dz / dd * 3, 3); sneakWait = 0; return; }
      // (one walking his beat toward him, within 22 m: across the street, out of the line he walks, 16 m to the side of
      // it (the cone never reaches past 15 m), and wait there till he has gone by, as the hint says: cross over when one turns)
      const walker = S && S.lookouts.find((L0) => { if (!L0.watching || !L0.e.alive || !L0.post.path) return false; const dx = x - L0.e.pos.x, dz = z - L0.e.pos.z; return Math.hypot(dx, dz) < 22 && Math.abs(wrapA(Math.atan2(dx, dz) - L0.yaw)) < 1.0; });
      if (walker) {
        const nx = Math.cos(walker.yaw), nz = -Math.sin(walker.yaw), lat = (x - walker.e.pos.x) * nx + (z - walker.e.pos.z) * nz;
        // (the side with room: no building 16 m out that way)
        const wall = (k) => { const px = walker.e.pos.x + nx * k * 16, pz = walker.e.pos.z + nz * k * 16; return cm.nearColliders(px, pz, 0.5).some((c) => c.maxY > 1.5 && px >= c.minX && px <= c.maxX && pz >= c.minZ && pz <= c.maxZ); };
        let sd = lat >= 0 ? 1 : -1; if (wall(sd) && !wall(-sd)) sd = -sd;
        if (Math.abs(lat) < 16) { steerTo(x + nx * sd * 4, z + nz * sd * 4, 3); return; }
        release(); P.speed = 0; return;
      }
      // (the next steps in a cone, or close to one stopped at the end of his beat and looking round: wait)
      const watched = S && S.lookouts.some((L0) => { if (!L0.watching || !L0.e.alive) return false; const dx = ah.x - L0.e.pos.x, dz = ah.z - L0.e.pos.z, dd = Math.hypot(dx, dz); return (dd < 15.5 && Math.abs(wrapA(Math.atan2(dx, dz) - L0.yaw)) < 0.85) || (L0.wait > 0 && dd < 13); });
      if (watched && sneakWait < 12) { sneakWait += frameDt; release(); P.speed = 0; return; }
      if (!watched) sneakWait = 0;
    }
    // (straight-line metres to the mark: a heavy car that sails past it gets a route round the block, long by the
    // route but a few metres away; WP, 4 Nov: a tow truck circled Central Park South for 90 s in the framed drive)
    const dd = gps?.dest, straight = dd ? Math.hypot(x - dd.x, z - dd.z) : Infinity;
    // a long leg: on to its last 110 m
    if (!realPace && inCar() && !jumped && t - stepT > 1.2 && L > 250 && type !== 'tail' && type !== 'pursuit') { jumped = true; const q = fromEnd(r, 110); putCar(q.x, q.z, q.h); note(`jump ${Math.round(L)} m`); return; }
    if (!inCar() && !jumped && t - stepT > 1.2 && L > 60 && !(realPace && type === 'stealth')) { jumped = true; const q = fromEnd(r, 12); P.position.set(q.x, cm.getGroundHeight(q.x, q.z, 'person'), q.z); P.heading = q.h; note(`walk jump ${Math.round(L)} m`); return; }
    // a world's tail (no ref): the route ends at the car being followed, so it is kept between the step's ring and its
    // lost distance (MM, 5 Nov: steering on to the van's bumper, the autopilot was spotted in 15 s): off the gas inside
    // 0.8 of the ring (braking, then backing off, inside 0.6), the boost past a third of the lost distance, and put back on the route at
    // 1.4 rings behind it when it is past 0.7 of it (a heavy car falls behind)
    if (type === 'tail' && inCar()) {
      const ring = d.ring || 25, lost = d.lostDist || 160;
      // (a long tail, as a long leg: after 12 s of following, the followed car is put on to its last 240 m and the
      // car 1.4 rings behind it on its way; the city's traffic makes a 2.5 km tail a five-minute drive)
      const T = M.tail;
      if (!realPace && T && !tailJumped && t - stepT > 12 && T.length - T.s > 420) {
        tailJumped = true; T.place(T.length - 240);
        const a = T.at(Math.max(0, T.s - ring * 1.4)), b = T.at(Math.max(0, T.s - ring * 1.4) + 3);
        putCar(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z)); note(`tail jump ${Math.round(T.length)} m`); return;
      }
      // (&realpace: the gap a player keeps, 1.6 rings back by the straight line the tail counts, the car's speed matched
      // and closed on, not driven at it and braked: at 20 m/s up to the ring the autopilot was spotted every time in PT-5)
      if (realPace && T) {
        const dv = Math.hypot(T.pos.x - x, T.pos.z - z), vt = clamp((T.v || 0) + (dv - ring * 1.6) * 0.3, 0, 20);
        // (too close (it stopped, or a corner brought it back): backed off, in reverse if need be, out past the ring)
        if (dv < ring * 0.9) { release(); if (car.speed > -4) cm.setTouchInput('backward', 1); return; }
        if (L > lost * 0.85 && t - tailJumpT > 6) { tailJumpT = t; const q = fromEnd(r, ring * 1.4); putCar(q.x, q.z, q.h); note('tail: back in range'); return; }
        const tg = along(r, x, z, 9 + Math.abs(car.speed || 0) * 0.6);
        steerTo(tg.x, tg.z, vt); return;
      }
      if (L < ring * 0.8) { release(); if (L < ring * 0.6 && car.speed > -5) cm.setTouchInput('backward', 0.8); return; }
      if (L > lost * 0.7 && t - tailJumpT > 6) { tailJumpT = t; const q = fromEnd(r, ring * 1.4); putCar(q.x, q.z, q.h); note('tail: back in range'); return; }
      const tg = along(r, x, z, 9 + Math.abs(car.speed || 0) * 0.6);
      steerTo(tg.x, tg.z, L > lost * 0.33 ? 17 : L > ring * 1.6 ? 13 : 9);
      return;
    }
    // stuck
    if (L < lastProg.d - 2) lastProg = { t, d: L, x, z };
    else if (t - lastProg.t > 5) {
      lastProg = { t, d: L, x, z };
      // (near the end: put down on it; else back on the road, or 40 m on along the route)
      if (inCar() && (L < 45 || straight < 30)) { const q = fromEnd(r, 0.5); putCar(q.x, q.z, q.h); note('unstuck car: on the mark'); }
      else if (inCar()) { const q = along(r, x, z, 40), q2 = along(r, x, z, 46); putCar(q.x, q.z, Math.atan2(q2.x - q.x, q2.z - q.z)); note('unstuck car: 40 m on'); }
      else { const q = along(r, x, z, 6); P.position.set(q.x, cm.getGroundHeight(q.x, q.z, 'person'), q.z); note('unstuck walk'); }
      return;
    }
    // (a horse against a car left in the street, the city's abandoned traffic: the route's length can wobble as it is
    // re-planned, so it is the ground he covers that counts; 6 s without 2.5 m of it, 40 m on along the route)
    if (car.kind === 'horse' && inCar()) {
      if (!horseMv || Math.hypot(x - horseMv.x, z - horseMv.z) > 2.5) horseMv = { t, x, z };
      else if (t - horseMv.t > 6 && L > 12) { horseMv = { t, x, z }; const q = along(r, x, z, 40), q2 = along(r, x, z, 46); putCar(q.x, q.z, Math.atan2(q2.x - q.x, q2.z - q.z)); note('unstuck horse: 40 m on'); return; }
    }
    // circling the mark (a heavy car overshoots, the route goes round the block, again): on the mark after 40 s close by
    if (inCar() && t - legT > 40 && (L < 150 || straight < 60) && type !== 'tail' && type !== 'pursuit') { legT = t; const q = fromEnd(r, 0.5); putCar(q.x, q.z, q.h); note('circling: on the mark'); return; }
    const radius = d.radius || 8, near = L < (inCar() ? Math.max(2.5, radius * 0.5) : 1.2);
    const tgt = inCar() && L < 25 ? (() => { const q = fromEnd(r, 0); return { x: q.x, z: q.z }; })() : along(r, x, z, inCar() ? 9 + Math.abs(car.speed || 0) * 0.6 : 3);
    if (near) { release(); if (inCar() && car.speed > 0.5) cm.setTouchInput('backward', 0.7); return; }
    // (the pace to stop on the mark: what a 3 m/s2 brake leaves to the radius, so a heavy car doesn't sail past it)
    // (a passenger's speed limit kept, under it by a margin)
    const cap = M.ride?.limit ? M.ride.limit / 2.23694 * 0.85 : Infinity;
    // (&realpace, a stops step against a clock that fails the mission (PT-12's yard race: 1:55): a player races it.
    // What is left, this leg by the route and the stops after it by the line between them (x1.3 for the streets), at
    // 20 m/s, longer than the clock has: flat out, up to 34 m/s and the boost on the straights)
    if (realPace && inCar() && type === 'stops' && L > 40) {
      const sh = M.timer?.running && M.timer.timers.shown?.();
      if (sh && !sh.late && sh.opts?.fail !== 'soft') {
        const ps = d.stops.map((q) => { try { return runner.placeOf(q); } catch { return null; } });
        let k = ps.findIndex((p) => p && dd && Math.hypot(p.x - dd.x, p.z - dd.z) < 30), rest = 0;
        for (let j = Math.max(0, k); k >= 0 && j + 1 < ps.length; j++) if (ps[j] && ps[j + 1]) rest += Math.hypot(ps[j + 1].x - ps[j].x, ps[j + 1].z - ps[j].z) * 1.3;
        // (once racing, raced to the end of the step: a player who sees he is late does not ease off)
        if (raceKey === stepKey || (L + rest) / 20 > sh.left) {
          raceKey = stepKey;
          const straightish = Math.abs(wrapA(Math.atan2(tgt.x - x, tgt.z - z) - car.heading)) < 0.25;
          steerTo(tgt.x, tgt.z, Math.min(cap, 34, 2.5 + Math.sqrt(2 * 3 * Math.max(0, L - radius * 0.4)))); cm.setTouchInput('boost', straightish && L > 60 ? 1 : 0);
          return;
        }
      }
    }
    // (a sneak near its sleepers: Ranger at a walk (W held lightly, no gallop); a flee: flat out)
    // (and round the nearest one, as a player would: the point ahead pushed out of its hearing, plus a margin)
    if (type === 'sneak' && M.wild?.walk && inCar()) {
      let ax = tgt.x, az = tgt.z; const n = M.wild.nearAt;
      if (n) {
        // (the line from him to the point ahead passing within its hearing: aimed past its side instead, his side of it)
        const want = n.r + 3, ux = ax - x, uz = az - z, L0 = Math.hypot(ux, uz) || 1, dx = ux / L0, dz = uz / L0;
        const sx = n.x - x, sz = n.z - z, along0 = sx * dx + sz * dz, lat = sx * dz - sz * dx;
        if (along0 > -2 && Math.abs(lat) < want) { const side = lat >= 0 ? -1 : 1; ax = n.x + dz * side * want + dx * 4; az = n.z - dx * side * want + dz * 4; }
      }
      steerTo(ax, az, 3); cm.setTouchInput('forward', Math.abs(car.speed || 0) < 2.2 ? 0.5 : 0); cm.setTouchInput('boost', 0); return; }
    if (type === 'sneak' && M.wild?.trot && inCar()) { steerTo(tgt.x, tgt.z, 4.5); cm.setTouchInput('boost', 0); return; }
    if (type === 'flee' && inCar()) { steerTo(tgt.x, tgt.z, 30); cm.setTouchInput('boost', Math.abs(wrapA(Math.atan2(tgt.x - x, tgt.z - z) - car.heading)) < 0.5 ? 1 : 0); return; }
    steerTo(tgt.x, tgt.z, Math.min(cap, type === 'tail' ? 11 : Math.min(realPace ? 20 : 15, 2.5 + Math.sqrt(2 * 3 * Math.max(0, L - radius * 0.4)))));
  }
  // a convoy (runner.js STEPS.convoy): the route ends at the car to stay with; kept between its band's near end (off the
  // gas inside 1.3 of it, braking inside it) and 0.6 of its far end (put back behind it on its own path past 0.75, at most
  // every 6 s); a long one, after 12 s, the car put on to its last 300 m and he put in the band behind it
  let convoyJumped = null;
  function convoy(C, t) {
    const D = C.A?.D;
    if (!D) { release(); return; }
    if (!inCar()) { release(); if (!W.ride?.phase) { if (Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z) > 4) P.position.set(car.position.x + Math.cos(car.heading) * 1.8, P.position.y, car.position.z - Math.sin(car.heading) * 1.8); W.ride?.getIn?.(true); note('in'); } return; }
    const mid = (C.near + C.far) / 2, behind = (s) => { const a = D.at(Math.max(0, s)), b = D.at(Math.max(0, s) + 3); putCar(a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z)); };
    if (!realPace && convoyJumped !== stepKey && t - stepT > 12 && D.length - D.s > 500) { convoyJumped = stepKey; D.place(D.length - 300); behind(D.s - Math.min(mid, C.near * 2.5)); note(`convoy jump ${Math.round(D.length)} m`); return; }
    const dd = Math.hypot(D.pos.x - car.position.x, D.pos.z - car.position.z);
    if (dd > C.far * 0.75 && t - tailJumpT > 6) { tailJumpT = t; behind(D.s - Math.min(mid, C.near * 2.5)); note('convoy: back in the band'); return; }
    if (dd < C.near * 1.3) { release(); if (dd < C.near && car.speed > -2) cm.setTouchInput('backward', car.speed > 0.5 ? 1 : 0.4); return; }
    const r = gps.route;
    const tg = r && r.length > 1 ? along(r, car.position.x, car.position.z, 8 + Math.abs(car.speed || 0) * 0.6) : { x: D.pos.x, z: D.pos.z };
    steerTo(tg.x, tg.z, Math.max(4, (D.v || 0) + (dd - C.near * 2) * 0.25));
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
      const e = cm.getActiveEntity(), T = world.spawnPoints('all');
      const far = T.filter((p) => Math.hypot(p.x - e.position.x, p.z - e.position.z) > 600).sort((a, b) => Math.hypot(a.x - e.position.x, a.z - e.position.z) - Math.hypot(b.x - e.position.x, b.z - e.position.z))[0];
      if (far) { gps.to({ x: far.x, z: far.z, name: 'away' }); note('chase: a route away'); }
      return true;
    }
    const r = gps.route; if (!r || r.length < 2) { release(); return true; }
    const dt = Math.min(0.05, frameDt);
    seenT = ch.seen ? seenT + dt : 0;
    slowT = Math.abs(car.speed || 0) < 4 ? slowT + dt : 0;
    const pinned = (ch.caughtT || 0) > 1.2;
    // (&realpace: no hop out of their sight just for being seen, so a chase lasts about as long as a player's)
    if (((seenT > 7 && !realPace) || slowT > 2.5 || pinned) && t - chaseJumpT > 6) {
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
