// Mog City: heat and pursuit (cars that chase and ram Dan, a GTA heat meter) and the car's thruster abilities. Installed by game.js.
//   cars.js       the chase cars: the Suits' black SUVs and sedans on acid-green rims, the police's NYPD cruisers
//   nav.js        their way through the streets (the traffic's road graph, A* corner to corner) and their sight
//   hud.js        the HEAT meter (top-right) and the radar's search circle, red blips and pulsing rim
//   thrusters.js  the car's cold-gas hop (SPACE) and side dashes (Q / E), unlocked in Mission 3
//   vapor.js      the cold-gas vapour and a wrecked car's smoke
// The GTA rules (numbers by heat h, 1-5; heat 2 in brackets):
//   - They come for him along the streets (A* over the road graph, re-planned every second or so, one-way streets
//     driven either way), and once close with a clear line, straight at him to ram, aiming a little to one side of his
//     tail (a PIT); after a ram they drop back a beat and come again. Far behind and out of view, they catch up a little.
//   - They see him within 55 + 15h m (85 m) with no building between, and always within 22 m (they hear him). Seen, the
//     search circle (90 + 55h m: 200 m) is centred on him; out of sight, it stays where they last saw him and they
//     search round there.
//   - Out of sight, the escape fills (0..1, view().progress): out of that circle in 4h s (8 s), hiding inside it three
//     times as slowly; the circle shrinks with it and the HEAT pips go out one by one. Seen again, it drains (empty in
//     RULE.drain s), so a glimpse costs a little and a long look all of it. Full: 'lost', and the cars drive off and are
//     gone once out of view. The HUD says which: SEEN (break their line of sight), SEARCHING with the escape's bar (get
//     out of the circle, or stay out of sight), and the radar marks where they last saw him and which car sees him.
//   - Every hit is the crash's (wagmi/crash: boxes that never overlap, impulses by the weights, the city's cars knocked
//     out of their lanes); a car takes damage by how hard it is hit, mostly when he rams it (100 hp: one ram from him at
//     ~20 m/s, or a few smaller; its own rams, the traffic and the walls cost it little, and never below a quarter: only
//     he wrecks them) and is wrecked: smoking, out of
//     the chase ('wrecked'). At heat 3 and up more come to replace the wrecked. One stuck or left far behind out of view,
//     while they still have him, is put back in a lane behind him (GTA does). Held up behind the city's traffic (a queue
//     at a light, a jam) it noses through it as the traffic's own jammed cars do (js/traffic.js v.ghost): a few seconds
//     passing through the city's cars, at a crawl while the camera sees it, so the pressure doesn't drop in a jam.
//   - Dan on foot: with a clear line to him (or close), they pull up in the lane next to him, just past him, so the
//     car stands in his view; the Suits' crew jumps out at the door on his side (W.combat.spawnCrew: 2 men, 3 from heat
//     3; a bat from heat 2, a bottle too from heat 3, a brute once from heat 4; never more than 2 + 2h of them up at once)
//     and the car waits while they're up. Out in the road, one car (or one whose crew is all down) tries to run him
//     down: it stops, revs and leans on the horn (FOOT.wind s: the tell), then floors it along a line it fixes then, so
//     a step aside dodges it; a hit knocks him down (W.combat's takeHit, heavy) and it brakes off ('runover').
//     'caught': the police, stopped within 10 m of him 2.5 s; the Suits, him beaten down (W.combat.player.onDown).
//     In his car: his car stood still 4.5 s with one of them within 11 m (ramming him counts): 'caught' (the mission
//     decides what that means). The traffic brakes for them (trafficSystem.blockers).
// API (window.WAGMI.pursuit):
//   start({ heat = 2, kind = 'suits' | 'police', count, from: { x, z }, target: () => ({ x, z }), lose = true,
//           reinforce, speed, escape, vmax }) -> chase { on(ev, cb), off(ev, cb), stop(), heat (get / set), state, view() }
//     (one chase at a time: a new start ends the last; stop() after 'lost' lets the cars drive off out of view)
//     events: 'lost' (escaped), 'caught' ({ onFoot }), 'wrecked' ({ car, left }), 'spotted' / 'hidden' (sight
//     changes), 'hit' ({ speed }: a chase car hit Dan's car), 'crew' ({ car, crew }: Suits out of a car at him on
//     foot), 'runover' ({ speed, car }: a chase car ran him down on foot)
//     from: where they set out (the nearest lane to it, in a column facing him); else 45-90 m off him, out of view.
//     target: what they chase (default: Dan, in his car or on foot). lose: false, they can't be lost (an escort);
//     reinforce: replace the wrecked (default: heat 3 and up); speed: m/s they set out at; escape: s out of sight to
//     lose them (default RULE.escape(heat)); vmax: their top speed (default RULE.vmax(heat))
//   stop() · heat (0-5) · active · chase (the current one) · RULE (the numbers) · debug
// WAGMI.thrusters: see thrusters.js. URL: ?pursuit=2 (a heat 2 Suits chase where Dan is, put in his car first;
// ?pursuit=2&police for the police), ?thrusters=all (or ?thrusters=hop,dash).
import * as THREE from 'three/webgpu';
import { buildChaseCar } from './cars.js';
import { createNav } from './nav.js';
import { createHud } from './hud.js';
import { createVapor } from './vapor.js';
import { createThrusters } from './thrusters.js';
import { boxes, dims, massOf } from '../crash/wrecks.js';

const Q = new URLSearchParams(location.search);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a, b) => a + Math.random() * (b - a);
// the rules, by heat
const RULE = {
  radius: (h) => 90 + 55 * h,   // m: the search circle
  escape: (h) => 4 * h,         // s out of it and unseen to lose them
  sight: (h) => 55 + 15 * h,    // m they see, with nothing between
  hear: 22,                     // m: this close they know where he is, walls or not
  vmax: (h) => 24 + 3 * h,      // m/s on a straight (Dan's car: 34, 56 on the boost)
  count: (h) => clamp(Math.round(h), 1, 5),
  drain: 3,                     // s seen to empty a full escape bar
  hide: 3,                      // how much slower the escape fills hiding inside the circle
};
// held up behind the city's traffic this long (s), a chase car noses through it for GHOST.t s (at most GHOST.vView m/s
// while the camera sees it)
const GHOST = { after: 1.0, t: 2.6, vView: 9 };
// Dan on foot: the pull-up (m past his level, in the lane next to him; how far off the lane he may be for it), the
// jump-out (stopped within m of him), the run-down (him within m of a lane; the car facing him, dot, from m to m; the
// tell s; its time out s; the next one after s; the blow by speed, at least and at most)
const FOOT = { past: 1.5, offLane: 14, jump: 16, inRoad: 2.6, face: 0.85, near: 10, far: 45, wind: 0.75, run: 2.6, again: 7, dmg: 2.4, dmgMin: 18, dmgMax: 55 };

export function install(W) {
  const app = W.app, cm = app.controllerManager, car = W.car, TS = app.trafficSystem, scene = app.scene, cam = app.cameraSystem.camera;
  if (!car || !TS || !TS.network) return;
  const nav = createNav(app);
  const vapor = createVapor(scene);
  const hud = createHud(W);
  const thrusters = (W.thrusters = createThrusters(W, vapor));
  const play = (name, o) => { try { return W.audio?.play?.(name, o); } catch { return null; } };
  const loop = (name, o) => { try { return W.audio?.loop?.(name, o) || null; } catch { return null; } };

  /* ---------------------------------------------------------- the camera's view -- */
  const frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
  const inView = (x, z, r = 3) => { _sph.center.set(x, 1, z); _sph.radius = r; return frustum.intersectsSphere(_sph); };
  const camDist = (x, z) => Math.hypot(x - cam.position.x, z - cam.position.z);

  /* ----------------------------------------------------------- one chase car -- */
  const proxy = { heading: 0, speed: 0, vx: 0, vz: 0, angularVel: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, body: { hx: 1, z0: -2, z1: 2 }, lastCollisionSpark: null };
  const _pos = new THREE.Vector3();
  function makeCar(ch, i, at) {
    const c = buildChaseCar(ch.kind, i);
    scene.add(c.group);
    const P = Object.assign(c, {
      isP: true, i, ch, x: at.x, z: at.z, h: at.h, y: cm.getGroundHeight(at.x, at.z, 'car'), speed: at.speed ?? 10, vx: 0, vz: 0, w: 0, steer: 0, acc: 0,
      pitch: 0, roll: 0, pitchV: 0, rollV: 0, spin: 0, hp: ch.kind === 'police' ? 130 : 100, wrecked: false, gone: false,
      path: null, pi: 0, planT: rnd(0, 0.6), planTo: null, goal: null, search: null, mode: 'chase', sees: true, seeT: rnd(0, 0.25),
      stuck: 0, back: 0, backSteer: 0, stucks: 0, ramCool: 0, hitCool: 0, horn: rnd(3, 7), smoke: 0, t: 0,
      side: i % 2 ? 1 : -1, leaveTo: null, hum: null, siren: null, dmg: {}, prog: { t: 0, want: 0, x: at.x, z: at.z }, farT: 0, blockT: 0,
      los: false, pull: null, pullT: 0, crew: null, crewOut: false, ram: null, ramNext: 0, ghost: 0, ghosts: 0,
      blocker: { x: at.x, z: at.z, yaw: at.h, halfW: c.hw, halfL: c.hl, vx: 0, vz: 0 },
    });
    c.group.position.set(P.x, P.y, P.z); c.group.rotation.y = P.h;
    if (Array.isArray(TS.blockers)) TS.blockers.push(P.blocker);
    return P;
  }
  function removeCar(P) {
    if (P.gone) return; P.gone = true;
    scene.remove(P.group);
    P.hum?.stop(0.4); P.siren?.stop(0.4); P.hum = P.siren = null;
    if (Array.isArray(TS.blockers)) { const k = TS.blockers.indexOf(P.blocker); if (k >= 0) TS.blockers.splice(k, 1); }
  }

  // where it heads, and how fast: straight at him (close, seen), the route to him, to where he was last seen, a search
  // point round there, or away
  function steerFor(P, ch, dt, T) {
    const vmax0 = vmaxOf(ch), dx = T.x - P.x, dz = T.z - P.z, d = Math.hypot(dx, dz);
    let ax, az, vt, direct = false;
    if (P.mode === 'leave') {
      if (!P.leaveTo) P.leaveTo = nav.spot(T.x, T.z, 260, 420, (x, z) => Math.hypot(x - P.x, z - P.z) < Math.hypot(x - T.x, z - T.z)) || { x: P.x + Math.sin(P.h) * 300, z: P.z + Math.cos(P.h) * 300 };
      P.goal = P.leaveTo; vt = 15;
    } else if (ch.seen) {
      P.goal = T; vt = vmax0;
      // (in sight and this close, straight at him: the last corner's queue at a light doesn't hold it up; on foot, with a
      // clear line to him (not just heard through a wall), or close)
      direct = T.onFoot ? (P.los && d < 60) || d < 18 : P.sees && d < 62;
    } else {
      // out of sight: to where he was last seen, then round there
      const L = ch.lastSeen;
      if (!P.search && Math.hypot(L.x - P.x, L.z - P.z) < 22) P.search = nav.spot(L.x, L.z, 20, ch.radius * 0.7);
      if (P.search && Math.hypot(P.search.x - P.x, P.search.z - P.z) < 14) P.search = nav.spot(L.x, L.z, 20, ch.radius * 0.7);
      P.goal = P.search || L; vt = vmax0 * (P.search ? 0.7 : 0.95);
    }
    // far behind and out of view: a little faster (it can always be outrun on the boost)
    if (P.mode === 'chase' && !inView(P.x, P.z, 4) && d > 70) vt += Math.min(12, (d - 70) * 0.08);
    if (direct) {
      if (T.onFoot) {
        // (on foot: the run-down, or the pull-up beside him, see onFoot)
        const g = onFoot(P, ch, dt, T, d, vmax0);
        ax = g.ax; az = g.az; vt = g.vt;
        if (g.raw) return { ax, az, vt, d };
      } else {
        // straight at where he will be by the time it gets there, a little to one side of his tail
        const close = P.speed - (T.vx * dx + T.vz * dz) / (d || 1), lead = clamp(d / Math.max(8, close), 0, 1.1);
        const th = T.h, rx = -Math.cos(th), rz = Math.sin(th);
        ax = T.x + T.vx * lead + rx * P.side * 1.1 - Math.sin(th) * 1.2; az = T.z + T.vz * lead + rz * P.side * 1.1 - Math.cos(th) * 1.2;
        vt = P.ramCool > 0 ? Math.max(6, T.speed - 3) : Math.min(vmax0 + 8, Math.max(vmax0, T.speed + 5)) + (d < 30 ? 3 : 0);
      }
      P.path = null;
    } else {
      // the route: re-planned every second or so, or when the goal has moved off where it was planned to
      P.planT -= dt;
      const G = P.goal;
      if (!P.path || P.planT <= 0 || (P.planTo && Math.hypot(G.x - P.planTo.x, G.z - P.planTo.z) > 25)) {
        P.path = nav.route({ x: P.x, z: P.z, h: P.speed < -1 ? P.h + Math.PI : P.h }, G); P.pi = 0; P.planT = ch.seen ? 1.0 : 1.8; P.planTo = { x: G.x, z: G.z };
      }
      // along it: past each corner on to the next, aiming a lookahead down it
      const path = P.path;
      while (P.pi < path.length - 1) {
        const a = P.pi ? path[P.pi - 1] : null, [bx, bz] = path[P.pi];
        const ex = a ? bx - a[0] : 0, ez = a ? bz - a[1] : 0;
        const past = a ? ((P.x - a[0]) * ex + (P.z - a[1]) * ez) / ((ex * ex + ez * ez) || 1) > 1 : false;
        if (past || Math.hypot(bx - P.x, bz - P.z) < 7) P.pi++; else break;
      }
      // (a sharp corner within the lookahead: aimed at, not cut, until it is close; the narrow streets have buildings
      // right at their corners)
      const L0 = 7 + Math.abs(P.speed) * 0.5, soon = 5 + Math.abs(P.speed) * 0.3;
      let left = L0, fx0 = P.x, fz0 = P.z, k = P.pi, lx = 0, lz = 0;
      ax = path[path.length - 1][0]; az = path[path.length - 1][1];
      while (k < path.length) {
        const [bx, bz] = path[k], sl = Math.hypot(bx - fx0, bz - fz0);
        if (sl > 1e-3) { lx = (bx - fx0) / sl; lz = (bz - fz0) / sl; }
        if (sl >= left) { ax = fx0 + lx * left; az = fz0 + lz * left; break; }
        if (k < path.length - 1 && L0 - left + sl > soon) {
          const [nx2, nz2] = path[k + 1], mx = nx2 - bx, mz = nz2 - bz, ml = Math.hypot(mx, mz) || 1;
          if ((lx * mx + lz * mz) / ml < 0.88) { ax = bx; az = bz; break; }
        }
        left -= sl; fx0 = bx; fz0 = bz; k++;
      }
      // slowing for the next corner: the sharper, the slower, from far enough out to make it
      const c = path[P.pi], nx = path[P.pi + 1];
      if (c && nx) {
        const pv = P.pi > 0 ? path[P.pi - 1] : [P.x, P.z];
        const ux = c[0] - pv[0], uz = c[1] - pv[1], vx = nx[0] - c[0], vz = nx[1] - c[1];
        const turn = Math.acos(clamp((ux * vx + uz * vz) / ((Math.hypot(ux, uz) * Math.hypot(vx, vz)) || 1), -1, 1));
        const vc = 9 + (vmax0 - 9) * (1 - Math.min(1, turn / 1.3)), dc = Math.hypot(c[0] - P.x, c[1] - P.z);
        vt = Math.min(vt, Math.sqrt(vc * vc + 2 * 9 * Math.max(0, dc - 5)));
      }
      if (T.onFoot && P.mode === 'chase' && ch.seen) vt = Math.min(vt, clamp((d - 6) * 1.4, 0, vmax0));
    }
    // something slow in the way (the traffic, another chase car): round it, or brake
    const av = avoid(P, dt);
    if (av) { if (av.pass) { ax = av.x; az = av.z; } vt = Math.min(vt, av.v); }
    return { ax, az, vt, d };
  }
  // Dan on foot, a car with him in reach: where it heads and how fast. Its crew up: it waits. Running him down: the
  // tell (stopped, revving, the horn), then flat out along the line it fixed, past him, for FOOT.run s. Else the pull-up:
  // the lane point nearest him (nav.onRoad), FOOT.past m past his level the way it comes along that lane, straightened
  // along the lane over the last few metres; him too far off any lane (a park, a plaza): stopped 8 m short, as before
  function onFoot(P, ch, dt, T, d, vmax0) {
    const out = { ax: T.x, az: T.z, vt: 0, raw: false };
    if (P.crew && P.crew.alive() > 0) { out.vt = 0; out.ax = P.x + Math.sin(P.h) * 5; out.az = P.z + Math.cos(P.h) * 5; out.raw = true; return out; }
    const R = P.ram;
    if (R) {
      R.t += dt;
      if (R.t < FOOT.wind) {
        // (the tell: stood, nose on him, the engine roaring, the horn)
        out.ax = T.x; out.az = T.z; out.vt = 0; out.raw = true;
        return out;
      }
      if (!R.go) { R.go = true; R.x = P.x + (T.x - P.x) * 3; R.z = P.z + (T.z - P.z) * 3; }
      out.ax = R.x; out.az = R.z; out.vt = vmax0 + 4; out.raw = true;
      // (past him, or its time up: the run is over; he gets a few seconds before the next)
      const past = (T.x - P.x) * Math.sin(P.h) + (T.z - P.z) * Math.cos(P.h) < -4;
      if (R.t > FOOT.wind + FOOT.run || (past && R.t > FOOT.wind + 0.4)) { P.ram = null; ch.ramNext = ch.t + FOOT.again; }
      return out;
    }
    // (the pull-up point, found again twice a second)
    if ((P.pullT -= dt) <= 0 || !P.pull) {
      P.pullT = 0.5;
      const L = nav.onRoad(T.x, T.z);
      if (L && Math.hypot(L.x - T.x, L.z - T.z) < FOOT.offLane) {
        // (the way along the lane it comes from: from behind his level it carries on past him)
        let fx = Math.sin(L.h), fz = Math.cos(L.h);
        if ((L.x - P.x) * fx + (L.z - P.z) * fz < 0) { fx = -fx; fz = -fz; }
        P.pull = { x: L.x + fx * FOOT.past, z: L.z + fz * FOOT.past, fx, fz, dRoad: Math.hypot(L.x - T.x, L.z - T.z) };
      } else P.pull = null;
    }
    const U = P.pull;
    if (!U) { out.vt = clamp((d - 8) * 1.1, 0, vmax0); return out; }
    const dp = Math.hypot(U.x - P.x, U.z - P.z);
    // (the last few metres along the lane, not across it)
    if (dp < 6) { out.ax = U.x + U.fx * 6; out.az = U.z + U.fz * 6; } else { out.ax = U.x; out.az = U.z; }
    const ahead = (U.x - P.x) * U.fx + (U.z - P.z) * U.fz;
    out.vt = ahead < 0.3 ? 0 : clamp(Math.min(dp, ahead + 0.5) * 1.3, 0, vmax0);
    return out;
  }

  // the nearest thing in a corridor ahead of it: a point to pass it by (beside it, on the side with room: not a wall nor
  // another car) and the speed to be at to stop behind it if it can't; held up behind it a second and a half, it
  // shoves its way through for a couple of seconds (the crash's rules knock the city's cars aside)
  const _av = { x: 0, z: 0, v: 99 }, near = [];
  function avoid(P, dt) {
    const fx = Math.sin(P.h), fz = Math.cos(P.h), look = 10 + Math.abs(P.speed) * 0.9;
    let best = null, bd = look;
    near.length = 0;
    const test = (x, z, hw, vx, vz, city) => {
      const dx = x - P.x, dz = z - P.z;
      if (dx * dx + dz * dz < 900) near.push(x, z);
      const ah = dx * fx + dz * fz;
      if (ah < 2 || ah > bd) return;
      const lat = dx * fz - dz * fx;
      if (Math.abs(lat) > hw + P.hw + 0.5) return;
      // (going its way as fast as this one: no matter)
      const along = vx * fx + vz * fz;
      if (along > Math.abs(P.speed) - 2 && along > 3) return;
      bd = ah; best = { x, z, lat, hw, sp: Math.max(0, along), city };
    };
    const wk = W.crash?.wrecks;
    // (nosing through the traffic: the city's cars aren't in its way)
    if (!(P.ghost > 0)) for (const v of wk ? wk.vehicles : TS.cars) {
      if (!v.edge || Math.abs(v.x - P.x) > 40 || Math.abs(v.z - P.z) > 40) continue;
      const vel = wk ? wk.velOf(v) : [v.tx * v.speed, v.tz * v.speed];
      test(v.x, v.z, dims(v)[0], vel[0], vel[1], true);
    }
    for (const O of chase ? chase.cars : []) if (O !== P && !O.gone) test(O.x, O.z, O.hw, Math.sin(O.h) * O.speed, Math.cos(O.h) * O.speed);
    if (!best) { P.blockT = Math.max(0, P.blockT - dt); return null; }
    // (lat > 0: it is to the left, so by on its right first)
    const rx = -fz, rz = fx, room = best.hw + P.hw + 1.1;
    const crowded = (x, z) => { for (let i = 0; i < near.length; i += 2) if ((near[i] - x) ** 2 + (near[i + 1] - z) ** 2 < 5) return true; return false; };
    // (a way by: the road there and its outer edge, and half way to it, clear of buildings, the sidewalk and the others)
    const clear = (x, z) => !nav.solid(x, z) && !cm.isPointOnSidewalk(x, z);
    const free = (s) => {
      const x = best.x + rx * s * room, z = best.z + rz * s * room;
      return clear(x, z) && clear(x + rx * s * P.hw, z + rz * s * P.hw) && clear((x + P.x) / 2, (z + P.z) / 2) && !crowded(x, z);
    };
    let side = best.lat > 0 ? 1 : -1;
    if (!free(side)) side = free(-side) ? -side : 0;
    const cap = Math.sqrt(best.sp * best.sp + 2 * 12 * Math.max(0, bd - 5));
    if (cap < 6 && Math.abs(P.speed) < 5) P.blockT += dt; else P.blockT = Math.max(0, P.blockT - dt * 0.5);
    // (held up behind the city's cars with no way by: it noses on through them, the traffic's way)
    if (best.city && side === 0 && P.blockT > GHOST.after) { P.ghost = GHOST.t; P.ghosts++; P.blockT = 0; return null; }
    if (P.blockT > 3.5) P.blockT = 0;
    _av.v = P.blockT > 1.5 ? 99 : cap;
    // (no way by, or still far off: on along its way, slowing)
    _av.pass = side !== 0 && bd < 30;
    _av.x = best.x + rx * side * room; _av.z = best.z + rz * side * room;
    return _av;
  }

  // the car itself: steering, throttle and brakes; moved in steps of at most a metre against the buildings (the city's
  // own wall test on a stand-in, as the crash's wrecks are)
  function drive(P, ch, dt, T) {
    P.t += dt; P.ramCool -= dt; P.hitCool -= dt; if (P.ghost > 0) P.ghost -= dt;
    let st = 0, vt = 0;
    // (parked: standing where it was put, brakes on: a roadblock, or a test's)
    if (!P.wrecked && P.mode !== 'parked') {
      const g = steerFor(P, ch, dt, T);
      const err = wrap(Math.atan2(g.ax - P.x, g.az - P.z) - P.h);
      st = clamp(err * 1.8, -0.62, 0.62); vt = g.vt;
      // (nosing through the traffic where the camera sees it: at a crawl, as the traffic's own do)
      if (P.ghost > 0 && inView(P.x, P.z, 4)) vt = Math.min(vt, GHOST.vView);
      // (stood waiting for its crew, or in the tell before a run at him: no backing about)
      if (T.onFoot && (P.crew?.alive() > 0 || (P.ram && !P.ram.go))) { P.back = 0; P.stuck = 0; P.prog.want = 0; }
      // turned away from where it must go, and slow: back up turning, so the nose comes round (a J-turn)
      if (P.back <= 0 && Math.abs(err) > 2.0 && Math.abs(P.speed) < 8 && vt > 2) { P.back = 1.0; P.backSteer = -Math.sign(err) * 0.62; }
      // stuck (against a wall, a wreck): back off a little the other way
      if (vt > 3 && Math.abs(P.speed) < 1.2 && P.back <= 0) P.stuck += dt; else P.stuck = Math.max(0, P.stuck - dt * 2);
      if (P.stuck > 1.2) { P.back = 1.1; P.backSteer = -Math.sign(err || 1) * 0.62; P.stuck = 0; }
      if (P.back > 0) { P.back -= dt; vt = -7; st = P.backSteer; }
      // (and over 3 s: wanting to go but hardly further on, wedged or rocking back and forth: back off; twice running,
      // out of view, it is put back in a lane behind him)
      const G = P.prog; G.t += dt; if (g.vt > 4) G.want += dt;
      if (G.t >= 3) {
        if (G.want > 2.4 && Math.hypot(P.x - G.x, P.z - G.z) < 5) { P.stucks++; if (P.back <= 0) { P.back = 1.2; P.backSteer = -Math.sign(err || 1) * 0.62; } } else P.stucks = 0;
        G.t = G.want = 0; G.x = P.x; G.z = P.z;
      }
      if (P.stucks >= 2 && !inView(P.x, P.z, 4)) { P.stucks = 0; respawn(P, T); }
    }
    P.steer += (st - P.steer) * Math.min(1, dt * 8);
    const prevSpeed = P.speed;
    if (P.wrecked) P.speed -= Math.sign(P.speed) * Math.min(Math.abs(P.speed), 7 * dt);
    else P.speed += clamp(vt - P.speed, -18 * dt, (vt < 0 ? 9 : 12) * dt);
    P.acc = (P.speed - prevSpeed) / Math.max(dt, 1e-3);
    const steps = clamp(Math.ceil((Math.abs(P.speed) + Math.hypot(P.vx, P.vz)) * dt / 1.0), 1, 4), h = dt / steps;
    for (let k = 0; k < steps; k++) {
      const sf = Math.min(1, Math.abs(P.speed) / 7) * Math.sign(P.speed);
      P.h += (P.steer * 2.5 * sf + P.w) * h;
      P.x += (Math.sin(P.h) * P.speed + P.vx) * h; P.z += (Math.cos(P.h) * P.speed + P.vz) * h;
      Object.assign(proxy, { heading: P.h, speed: P.speed, vx: P.vx, vz: P.vz, angularVel: P.w, pitchVel: 0, rollVel: 0, heaveVel: 0, lastCollisionSpark: null });
      proxy.body.hx = P.hw; proxy.body.z0 = -P.hl; proxy.body.z1 = P.hl;
      _pos.set(P.x, 0, P.z); cm.resolveHorizontalCollision(_pos, 1.35, 1.0, proxy);
      P.x = _pos.x; P.z = _pos.z; P.speed = proxy.speed; P.vx = proxy.vx; P.vz = proxy.vz; P.w = proxy.angularVel;
      P.pitchV += proxy.pitchVel * 0.6; P.rollV += proxy.rollVel * 0.6;
      const sp = proxy.lastCollisionSpark;
      if (sp && sp.speed > 2.2) wallHit(P, sp);
    }
    P.w *= Math.exp(-dt * 7.8);
    const grip = Math.exp(-dt * 6.8); P.vx *= grip; P.vz *= grip;
    if (Math.abs(P.vx) + Math.abs(P.vz) < 0.02) P.vx = P.vz = 0;
  }
  function wallHit(P, s) {
    damage(P, s.speed * 0.35, 'wall');
    if (P.hitCool <= 0) {
      P.hitCool = 0.25;
      play('carHit', { pos: [s.x, 0.6, s.z], vol: clamp(s.speed / 16, 0.2, 1.1) });
      W.crash?.fx?.spark(s.x, 0.5, s.z, -s.nz, s.nx, Math.round(clamp(s.speed * 1.5, 6, 30)), 6);
    }
  }
  // (only Dan wrecks them: their own rams, the walls, the traffic and each other wear one down to a quarter at most,
  // so a chase can't end by itself while he sits still)
  function damage(P, sp, by = 'other') {
    if (P.wrecked) return;
    const k = Math.max(0, sp - 4) * 5.5;
    const floor = by === 'hero' ? 0 : Math.min(P.hp, 25);
    P.hp = Math.max(floor, P.hp - k); if (k > 0) P.dmg[by] = (P.dmg[by] || 0) + Math.round(k);
    if (P.hp <= 0) wreck(P);
  }
  function wreck(P) {
    const ch = P.ch;
    P.wrecked = true; P.hp = 0; P.w += rnd(-1.5, 1.5);
    P.hum?.stop(0.6); P.hum = null; P.siren?.stop(0.3); P.siren = null;
    play('carHit', { pos: [P.x, 0.8, P.z], vol: 1.1 }); play('glass', { pos: [P.x, 1, P.z], vol: 0.8 });
    W.crash?.fx?.bits(P.x, 0.9, P.z, Math.sin(P.h) * P.speed * 0.3, Math.cos(P.h) * P.speed * 0.3, 18, 'glass');
    for (let k = 0; k < 8; k++) vapor.puff(P.x + rnd(-1, 1), 1.0, P.z + rnd(-1, 1), rnd(-2, 2), rnd(1, 3), rnd(-2, 2), { r: 0.5, grow: 2.5, life: 1.6, k: 0.9, a: 0.6, drag: 2, lift: 1 });
    console.log(`[pursuit] wrecked car ${P.i}`);
    if (ch.state === 'on') ch.emit('wrecked', { car: P, left: ch.cars.filter((c) => !c.wrecked && !c.gone).length });
  }

  // two boxes that touch: pushed apart by their weights, then the blow between them (restitution 0.2, next to nothing
  // at speed; a little friction across it), each turned by its lever arm: the crash's rules (wagmi/crash/index.js meet)
  const hit = { nx: 0, nz: 0, pen: 0, x: 0, z: 0 };
  // (a body: a chase car, or Dan's car as the controllers move it)
  const velAt = (o) => (o.isP ? [Math.sin(o.h) * o.speed + o.vx, Math.cos(o.h) * o.speed + o.vz] : [Math.sin(car.heading) * car.speed + (car.vx || 0), Math.cos(car.heading) * car.speed + (car.vz || 0)]);
  function kick(o, Jx, Jz, m, I) {
    // (the blow along it changes its speed, across it slides it; its lever arm turns it)
    const h = o.isP ? o.h : car.heading, s = Math.sin(h), c = Math.cos(h);
    const dvx = Jx / m, dvz = Jz / m, along = dvx * s + dvz * c;
    const dw = ((hit.z - (o.isP ? o.z : car.position.z)) * Jx - (hit.x - (o.isP ? o.x : car.position.x)) * Jz) / I * 0.8;
    if (o.isP) { o.speed += along; o.vx += dvx - s * along; o.vz += dvz - c * along; o.w = clamp(o.w + dw, -3.5, 3.5); }
    else { car.speed += along; car.vx = (car.vx || 0) + dvx - s * along; car.vz = (car.vz || 0) + dvz - c * along; car.angularVel = clamp((car.angularVel || 0) + dw, -3.5, 3.5); }
  }
  function rock(o, nx, nz, sp) {
    const h = o.isP ? o.h : car.heading, s = Math.sin(h), c = Math.cos(h), k = Math.min(16, sp);
    if (o.isP) { o.pitchV += (s * nx + c * nz) * k * 0.16; o.rollV -= (c * nx - s * nz) * k * 0.22; }
    else { car.pitchVel = (car.pitchVel || 0) + (s * nx + c * nz) * k * 0.16; car.rollVel = (car.rollVel || 0) - (c * nx - s * nz) * k * 0.22; car.heaveVel = (car.heaveVel || 0) + Math.min(1.4, sp * 0.1); }
  }
  // a and b touching (hit: its normal from b to a): apart, then the blow; its speed, or 0 when they part anyway
  function meet(a, ma, b, mb, moveB = true) {
    const share = moveB ? mb / (ma + mb) : 1, { nx, nz, pen } = hit;
    a.x += nx * pen * share; a.z += nz * pen * share;
    if (moveB) { if (b.isP) { b.x -= nx * pen * (1 - share); b.z -= nz * pen * (1 - share); } else { car.position.x -= nx * pen * (1 - share); car.position.z -= nz * pen * (1 - share); } }
    const [avx, avz] = velAt(a), [bvx, bvz] = velAt(b);
    const rvx = avx - bvx, rvz = avz - bvz, vn = rvx * nx + rvz * nz;
    if (vn >= -0.15) return 0;
    const sp = -vn, e = sp > 12 ? 0.05 : 0.2, inv = 1 / ma + (moveB ? 1 / mb : 0);
    const jn = (1 + e) * sp / inv;
    const tx = rvx - nx * vn, tz = rvz - nz * vn, tl = Math.hypot(tx, tz), jt = tl > 1e-3 ? Math.min(0.35 * jn, tl / inv) : 0;
    const Jx = nx * jn - (tl > 1e-3 ? tx / tl * jt : 0), Jz = nz * jn - (tl > 1e-3 ? tz / tl * jt : 0);
    kick(a, Jx, Jz, ma, ma * (a.hl * a.hl + a.hw * a.hw) / 3);
    if (moveB) { const B = car.body, bl = b.isP ? b.hl : (B.z1 - B.z0) / 2, bw = b.isP ? b.hw : B.hx; kick(b, -Jx, -Jz, mb, mb * (bl * bl + bw * bw) / 3); }
    rock(a, nx, nz, sp); if (moveB) rock(b, -nx, -nz, sp);
    return sp;
  }
  // a hit on Dan's car felt the crash's way (n: from the other car to his): a crunch, sparks and bits where they
  // touched, the camera jolted, a beat of slow motion on a huge one
  function feel(sp, nx, nz, paint) {
    play('carHit', { pos: [hit.x, 0.6, hit.z], vol: clamp(sp / 16, 0.25, 1.25) });
    const fx = W.crash?.fx; if (!fx) return;
    const vx = Math.sin(car.heading) * car.speed, vz = Math.cos(car.heading) * car.speed;
    if (sp > 2.5) fx.spark(hit.x, 0.55, hit.z, -nz, nx, Math.round(clamp(sp * 1.8, 8, 48)), 5 + sp * 0.3);
    if (sp > 5) fx.bits(hit.x, 0.65, hit.z, vx * 0.5 - nx * 3, vz * 0.5 - nz * 3, Math.round(clamp(sp * 0.5, 3, 18)), 'plastic');
    if (sp > 9) fx.bits(hit.x, 0.85, hit.z, vx * 0.6, vz * 0.6, Math.round(clamp(sp * 0.7, 4, 26)), 'glass');
    if (paint && sp > 4) fx.bits(hit.x, 0.7, hit.z, -nx * 3, -nz * 3, Math.round(clamp(sp * 0.4, 2, 12)), 'paint', paint);
    W.crash.jolt?.(clamp(sp / 22, 0, 1), -nx, -nz);
    if (sp > 24) { W.crash.hitStop?.(0.06, 0.05); W.crash.slowmo?.(0.6, 0.3); }
  }
  const BLACK = [0.04, 0.045, 0.05], WHITE = [0.9, 0.92, 0.95];
  function collide(ch) {
    const cars = ch.cars.filter((P) => !P.gone);
    const B = car.body, cz = (B.z1 + B.z0) / 2, chl = (B.z1 - B.z0) / 2, inCar = cm.activeMode === 'car';
    // Dan's car (driven; or parked, shoved too, unless he is on his way into it); hopping over them, missed
    const air = thrusters.air || 0;
    let moved = false;
    for (const P of cars) {
      const cx = car.position.x + Math.sin(car.heading) * cz, czz = car.position.z + Math.cos(car.heading) * cz;
      if (!car.mesh.visible || air > P.roof * 0.9 || Math.abs(P.x - cx) > 8 || Math.abs(P.z - czz) > 8) continue;
      if (!boxes(P.x, P.z, P.h, P.hw, P.hl, cx, czz, car.heading, B.hx, chl, hit)) continue;
      const moveCar = inCar || !(W.ride && W.ride.phase);
      // (who rammed whom: the damage is mostly the one hit's; ramming him costs a chase car little, being rammed a lot)
      const [pvx, pvz] = velAt(P), [cvx, cvz] = velAt({ isP: false });
      const pApp = Math.max(0, -(pvx * hit.nx + pvz * hit.nz)), cApp = Math.max(0, cvx * hit.nx + cvz * hit.nz);
      const share = cApp / (pApp + cApp + 1e-3), rammed = 0.12 + 0.95 * share;
      const sp = meet(P, P.mass, { isP: false }, car.mass || 2, moveCar);
      moved = moved || moveCar;
      // (a blow, not every step of a grind against it)
      if (sp > 2.5 && P.hitCool <= 0) {
        P.hitCool = 0.25;
        feel(sp, -hit.nx, -hit.nz, P.kind === 'police' ? WHITE : BLACK);
        if (inCar) { P.ramCool = 1.3; ch.emit('hit', { speed: sp, car: P }); }
      }
      // (his ram is his; its own ram into him, stopped or slower, is its own: that can't wreck it)
      if (sp > 1.5) damage(P, sp * rammed, share > 0.35 ? 'hero' : 'ram');
    }
    if (moved) car.mesh.position.copy(car.position);
    // each other
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7 || !boxes(a.x, a.z, a.h, a.hw, a.hl, b.x, b.z, b.h, b.hw, b.hl, hit)) continue;
      const sp = meet(a, a.mass, b, b.mass);
      if (sp > 2.5) {
        damage(a, sp * 0.5, 'chase'); damage(b, sp * 0.5, 'chase');
        if (a.hitCool <= 0) { a.hitCool = 0.25; play('carHit', { pos: [hit.x, 0.6, hit.z], vol: clamp(sp / 16, 0.2, 1) }); W.crash?.fx?.spark(hit.x, 0.55, hit.z, -hit.nz, hit.nx, Math.round(clamp(sp * 1.4, 6, 30)), 6); }
      }
    }
    // the city's cars and buses: shoved, and knocked out of their lanes when hit hard (the crash's wrecks)
    const wk = W.crash?.wrecks;
    if (wk) for (const P of cars) {
      if (P.ghost > 0) continue;
      for (const v of wk.vehicles) {
        if (!v.edge || Math.abs(v.x - P.x) > 9 || Math.abs(v.z - P.z) > 9) continue;
        const [vw, vl] = dims(v), yaw = v.wreck && v._wreck ? v._wreck.yaw : v.yaw + v.yawOffset;
        if (!boxes(P.x, P.z, P.h, P.hw, P.hl, v.x, v.z, yaw, vw, vl, hit)) continue;
        const mv = v.bus ? 12 : massOf(v), R = v.wreck && v._wreck;
        // (apart: a car still in its lane is moved by its lane, so this one takes all of it)
        const share = R ? mv / (P.mass + mv) : 1;
        P.x += hit.nx * hit.pen * share; P.z += hit.nz * hit.pen * share;
        if (R) { R.x -= hit.nx * hit.pen * (1 - share); R.z -= hit.nz * hit.pen * (1 - share); v.x = R.x; v.z = R.z; }
        const [ovx, ovz] = wk.velOf(v), [pvx, pvz] = velAt(P);
        const vn = (pvx - ovx) * hit.nx + (pvz - ovz) * hit.nz;
        if (vn >= -0.15) continue;
        const sp = -vn, jn = (1 + (sp > 12 ? 0.05 : 0.2)) * sp / (1 / P.mass + 1 / mv);
        const Jx = hit.nx * jn, Jz = hit.nz * jn;
        kick(P, Jx, Jz, P.mass, P.mass * (P.hl * P.hl + P.hw * P.hw) / 3);
        wk.push(v, -Jx, -Jz, hit.x, hit.z, sp > 3);
        rock(P, hit.nx, hit.nz, sp);
        damage(P, sp * 0.35, 'traffic');
        if (sp > 2 && P.hitCool <= 0) {
          P.hitCool = 0.25;
          play('carHit', { pos: [hit.x, 0.6, hit.z], vol: clamp(sp / 16, 0.2, 1.1) });
          W.crash?.fx?.spark(hit.x, 0.55, hit.z, -hit.nz, hit.nx, Math.round(clamp(sp * 1.4, 6, 30)), 6);
          if (sp > 6) W.crash?.fx?.bits(hit.x, 0.7, hit.z, pvx * 0.4, pvz * 0.4, Math.round(sp * 0.5), Math.random() < 0.5 ? 'glass' : 'plastic');
        }
      }
    }
    // the street furniture (the crash's props: poles snap, small things fly)
    const props = W.crash?.props;
    if (props) for (const P of cars) if (Math.abs(P.speed) > 2.5) {
      const [vx, vz] = velAt(P);
      Object.assign(PM, { x: P.x, z: P.z, yaw: P.h, hw: P.hw, hl: P.hl, vx, vz, mass: P.mass, P });
      props.collide(PM);
    }
  }
  const PM = { x: 0, z: 0, yaw: 0, hw: 1, hl: 2, vx: 0, vz: 0, mass: 2, P: null, onSolid: null, onBreak: null };
  PM.onSolid = (nx, nz) => {
    const P = PM.P; P.x = PM.x; P.z = PM.z;
    const [vx, vz] = velAt(P), vn = -(vx * nx + vz * nz);
    if (vn <= 0.5) return;
    P.vx += nx * vn * 0.42; P.vz += nz * vn * 0.42;
    const headOn = Math.abs(Math.sin(P.h) * nx + Math.cos(P.h) * nz);
    if (headOn > 0.72) P.speed = -P.speed * 0.1; else P.speed *= 1 - 0.62 * headOn;
    damage(P, vn * 0.4, 'prop');
  };
  PM.onBreak = (b, vi, loss) => { const P = PM.P; P.speed -= Math.sign(P.speed) * Math.min(Math.abs(P.speed), loss * 0.7); };

  // its pose: on the road (eased up a curb), pitched by its braking and rolled by its turning on springs; its rims
  // turning; its smoke when wrecked; its engine (and siren) heard near the camera; the Suits on the horn
  function pose(P, dt) {
    P.y += (cm.getGroundHeight(P.x, P.z, 'car') - P.y) * Math.min(1, dt * 14);
    const vmax = vmaxOf(P.ch);
    const tp = clamp(-P.acc * 0.006, -0.05, 0.06), tr = clamp(-P.steer * (P.speed / vmax) * 0.11, -0.09, 0.09);
    P.pitchV += ((tp - P.pitch) * 68 - P.pitchV * 10.8) * dt; P.pitch = clamp(P.pitch + P.pitchV * dt, -0.2, 0.2);
    P.rollV += ((tr - P.roll) * 68 - P.rollV * 10.8) * dt; P.roll = clamp(P.roll + P.rollV * dt, -0.24, 0.24);
    P.group.position.set(P.x, P.y, P.z); P.group.rotation.y = P.h;
    P.tilt.rotation.x = P.pitch + (P.wrecked ? 0.03 : 0); P.tilt.rotation.z = P.roll + (P.wrecked ? 0.04 : 0);
    P.spin += P.speed * dt / P.wheelR;
    for (const r of P.rims) r.rotation.x = P.spin;
    Object.assign(P.blocker, { x: P.x, z: P.z, yaw: P.h, vx: Math.sin(P.h) * P.speed + P.vx, vz: Math.cos(P.h) * P.speed + P.vz });
    const d = camDist(P.x, P.z);
    if (P.wrecked) {
      P.smoke -= dt;
      if (P.smoke <= 0 && d < 160) { P.smoke = 0.14; const f = P.hl - 0.6; vapor.puff(P.x + Math.sin(P.h) * f, P.y + 1.0, P.z + Math.cos(P.h) * f, rnd(-0.4, 0.4), 1.6, rnd(-0.4, 0.4), { r: 0.3, grow: 3.5, life: 2.4, k: 0.85, a: 0.5, drag: 1.2, lift: 0.6 }); }
      return;
    }
    const at = [P.x, 0.7, P.z];
    if (d < 140 && W.audio?.ready) {
      if (!P.hum) P.hum = loop('carHum', { pos: at, vol: 0, kind: P.kind !== 'police' && P.i % 2 === 0 ? 'suv' : 'sedan' }); // (the Suits' even cars are SUVs: cars.js)
      const rev = P.ram && !P.ram.go; // (the tell before a run at him: revving where it stands)
      P.hum?.set({ pos: at, speed: rev ? 14 : P.speed, load: rev ? 1 : clamp(0.35 + P.acc * 0.08, 0.2, 1), vol: rev ? 1.1 : 0.9 });
      if (P.kind === 'police') { const sp = [P.x, 1.6, P.z]; if (!P.siren) P.siren = loop('siren', { pos: sp, vol: 0.55, mode: 'wail' }); P.siren?.set({ pos: sp, mode: d < 45 ? 'yelp' : 'wail' }); }
    } else if (d > 170) { P.hum?.stop(0.4); P.hum = null; P.siren?.stop(0.4); P.siren = null; }
    if (P.kind !== 'police' && P.mode === 'chase' && P.ch.seen && (P.horn -= dt) <= 0) {
      P.horn = rnd(4, 9);
      if (Math.hypot(P.x - car.position.x, P.z - car.position.z) < 30) play('horn', { pos: [P.x, 1, P.z], kind: 'suv', len: Math.random() < 0.5 ? 'lean' : 'double', vol: 0.8 });
    }
  }

  /* ---------------------------------------------------------------- placing -- */
  // a lane spot rMin..rMax m from him: behind him and out of view first; then anywhere out of view; then anywhere
  function hiddenSpot(T, rMin, rMax) {
    const fx = Math.sin(T.h), fz = Math.cos(T.h);
    return nav.spot(T.x, T.z, rMin, rMax, (x, z) => !inView(x, z, 4) && (x - T.x) * fx + (z - T.z) * fz < 0, 60)
      || nav.spot(T.x, T.z, rMin, rMax, (x, z) => !inView(x, z, 4), 60)
      || nav.spot(T.x, T.z, rMin, rMax * 1.5);
  }
  // (along its lane, whichever way faces him)
  const facing = (s, T) => (Math.sin(s.h) * (T.x - s.x) + Math.cos(s.h) * (T.z - s.z) >= 0 ? s.h : s.h + Math.PI);
  // (round him while they have him; round where they last saw him while they search)
  function respawn(P, T) {
    const ch = P.ch, at = ch.seen ? T : { x: ch.lastSeen.x, z: ch.lastSeen.z, h: T.h };
    const s = hiddenSpot(at, 70, 120); if (!s) return;
    Object.assign(P, { x: s.x, z: s.z, h: facing(s, T), speed: 12, vx: 0, vz: 0, w: 0, path: null, back: 0, stuck: 0, farT: 0, y: cm.getGroundHeight(s.x, s.z, 'car') });
    Object.assign(P.prog, { t: 0, want: 0, x: s.x, z: s.z });
  }

  /* ------------------------------------------------------------------ a chase -- */
  let chase = null;
  // (a chase's own numbers, when its start() set them: opts.escape s to lose them, opts.vmax their top speed)
  const escOf = (ch) => ch.escN ?? RULE.escape(ch._heat), vmaxOf = (ch) => ch.vmaxN ?? RULE.vmax(ch._heat);
  const tgtState = { x: 0, z: 0, vx: 0, vz: 0, h: 0, speed: 0, onFoot: false, px: null, pz: null };
  function start(opts = {}) {
    if (chase) end(chase, true);
    const { kind = 'suits', from = null, target = null, lose = true } = opts;
    const listeners = {};
    const ch = {
      kind, cars: [], state: 'on', seen: true, lastSeen: { x: 0, z: 0 }, esc: 0, hideT: 0, prog: 0, inCircle: true, hidT: 0, t: 0, lose, target,
      reinforce: opts.reinforce, want: 0, refill: 0, caughtT: 0, caughtSent: false, _heat: clamp(opts.heat ?? 2, 1, 5),
      crews: [], ramNext: 0, brute: false, escN: opts.escape ?? null, vmaxN: opts.vmax ?? null,
      on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); return ch; },
      off(ev, cb) { listeners[ev] = (listeners[ev] || []).filter((x) => x !== cb); return ch; },
      emit(ev, d) { for (const cb of listeners[ev] || []) { try { cb(d); } catch (e) { console.error('[pursuit]', ev, e); } } },
      stop() { end(ch); },
      get heat() { return ch._heat; },
      set heat(v) { ch._heat = clamp(v, 1, 5); ch.want = opts.count ?? RULE.count(ch._heat); },
      get radius() { return RULE.radius(ch._heat); },
      view: () => view(ch),
    };
    ch.want = opts.count ?? RULE.count(ch._heat);
    chase = ch;
    tgtState.px = null; tgtState.vx = tgtState.vz = 0;
    readTarget(ch, 0);
    const T = tgtState;
    ch.lastSeen = { x: T.x, z: T.z };
    ch.grace = 2.5;
    if (from) {
      // a column in the lane nearest `from`, facing him
      const s = nav.onRoad(from.x, from.z) || { x: from.x, z: from.z, h: Math.atan2(T.x - from.x, T.z - from.z) };
      const h = facing(s, T), fx = Math.sin(h), fz = Math.cos(h);
      for (let i = 0; i < ch.want; i++) {
        _pos.set(s.x - fx * i * 9.5, 0, s.z - fz * i * 9.5); cm.resolveHorizontalCollision(_pos, 1.35, 1.0);
        ch.cars.push(makeCar(ch, i, { x: _pos.x, z: _pos.z, h, speed: opts.speed ?? 8 }));
      }
    } else {
      for (let i = 0; i < ch.want; i++) {
        const s = hiddenSpot(T, 45, 90) || { x: T.x - Math.sin(T.h) * (50 + i * 10), z: T.z - Math.cos(T.h) * (50 + i * 10), h: T.h };
        ch.cars.push(makeCar(ch, i, { x: s.x, z: s.z, h: facing(s, T), speed: opts.speed ?? 14 }));
      }
    }
    // (the streets ~1.4 times the straight line, at ~80% of top speed, to within sight of him)
    const d0 = Math.min(...ch.cars.map((P) => Math.hypot(P.x - T.x, P.z - T.z)));
    ch.grace = clamp(2.5 + (1.4 * d0 - RULE.sight(ch._heat)) / (0.8 * vmaxOf(ch)), 2.5, 12);
    hud.show(ch);
    console.log(`[pursuit] ${kind} heat ${ch._heat}: ${ch.cars.length} cars`);
    return ch;
  }
  // the target this frame: where, how fast, which way; on foot or not
  function readTarget(ch, dt) {
    const T = tgtState, p = ch.target ? ch.target() : cm.getActiveEntity().position;
    T.onFoot = cm.activeMode !== 'car' && (!ch.target || Math.hypot(p.x - W.person.position.x, p.z - W.person.position.z) < 3);
    if (T.px != null && dt > 0) {
      // (a jump, a teleport: no speed out of it)
      if (Math.hypot(p.x - T.px, p.z - T.pz) > 30) T.vx = T.vz = 0;
      else { const k = Math.min(1, dt * 6); T.vx += ((p.x - T.px) / dt - T.vx) * k; T.vz += ((p.z - T.pz) / dt - T.vz) * k; }
    }
    T.px = T.x = p.x; T.pz = T.z = p.z;
    T.speed = Math.hypot(T.vx, T.vz);
    T.h = cm.activeMode === 'car' && !ch.target ? car.heading : T.speed > 1 ? Math.atan2(T.vx, T.vz) : cm.getActiveEntity().heading || 0;
  }
  // a frame of the chase
  function step(ch, dt) {
    ch.t += dt;
    readTarget(ch, dt);
    const T = tgtState, live = ch.cars.filter((P) => !P.gone && !P.wrecked);
    if (ch.state === 'on') {
      // who sees him (each a few times a second)
      const sight = RULE.sight(ch._heat);
      for (const P of live) {
        // (left far behind out of view while they still have him: brought back round him, as GTA does)
        const far = ch.seen && Math.hypot(T.x - P.x, T.z - P.z) > 230 && !inView(P.x, P.z, 4);
        P.farT = far ? P.farT + dt : 0;
        if (P.farT > 5) respawn(P, T);
        if ((P.seeT -= dt) > 0) continue;
        P.seeT = 0.25;
        const d = Math.hypot(T.x - P.x, T.z - P.z);
        // (los: a clear line to him; sees: that, or heard through a wall this close)
        P.los = d < sight && nav.sees(P.x, P.z, T.x, T.z);
        P.sees = d < RULE.hear || P.los;
      }
      // (at first they know where he is: long enough to get near him from where they set out)
      const seen = ch.t < ch.grace || live.some((P) => P.sees);
      if (seen !== ch.seen) { ch.seen = seen; if (seen) for (const P of live) P.search = null; ch.emit(seen ? 'spotted' : 'hidden', { x: T.x, z: T.z }); }
      const N = escOf(ch), R = RULE.radius(ch._heat);
      // the escape's bar: draining while they see him; filling while they don't, out of the circle (shrinking as it
      // fills) in N s, hiding inside it RULE.hide times as slowly
      if (seen) { ch.lastSeen.x = T.x; ch.lastSeen.z = T.z; ch.prog = Math.max(0, ch.prog - dt / RULE.drain); ch.inCircle = true; ch.hidT = 0; }
      else if (ch.lose) {
        ch.hidT += dt;
        ch.inCircle = Math.hypot(T.x - ch.lastSeen.x, T.z - ch.lastSeen.z) <= R * (1 - ch.prog);
        ch.prog = Math.min(1, ch.prog + dt / (N * (ch.inCircle ? RULE.hide : 1)));
        if (ch.inCircle) ch.hideT += dt; else ch.esc += dt;
        if (ch.prog >= 1) return lost(ch);
      }
      if (seen) { ch.esc = 0; ch.hideT = 0; }
      // caught: they've stopped by him on foot; or in his car, he's sat stopped with them on him (ramming him or pulled
      // up by him: the time adds up through their back-off-and-ram, and only driving off clears it)
      let held;
      // (the Suits on foot: his being beaten down is 'caught', see W.combat.player.onDown below)
      if (T.onFoot && ch.kind !== 'police' && W.combat) { held = false; ch.caughtT = 0; }
      else if (T.onFoot) { held = live.some((P) => Math.hypot(P.x - T.x, P.z - T.z) < 10 && Math.abs(P.speed) < 2.5); ch.caughtT = held ? ch.caughtT + dt : 0; }
      else {
        held = cm.activeMode === 'car' && Math.abs(car.speed) < 2.5 && live.some((P) => Math.hypot(P.x - T.x, P.z - T.z) < 11);
        ch.caughtT = held ? ch.caughtT + dt : Math.abs(car.speed) > 8 ? 0 : Math.max(0, ch.caughtT - dt);
      }
      if (ch.caughtT > (T.onFoot ? 2.5 : 4.5) && !ch.caughtSent) { ch.caughtSent = true; ch.emit('caught', { x: T.x, z: T.z, onFoot: T.onFoot }); }
      if (!held && T.speed > 6) ch.caughtSent = false;
      // more to replace the wrecked (heat 3 and up), or the heat raised: out of view
      if (live.length < ch.want && ((ch.reinforce ?? ch._heat >= 3) || ch.cars.length < ch.want)) {
        ch.refill += dt;
        if (ch.refill > (ch.cars.length < ch.want ? 0 : 9 - ch._heat)) {
          ch.refill = 0;
          const s = hiddenSpot(T, 70, 130);
          if (s) ch.cars.push(makeCar(ch, ch.cars.length, { x: s.x, z: s.z, h: facing(s, T), speed: 16 }));
        }
      } else ch.refill = 0;
    }
    if (ch.state === 'on' && T.onFoot) afoot(ch, live, T);
    for (const P of ch.cars) if (!P.gone) drive(P, ch, dt, T);
    collide(ch);
    if (ch.state === 'on') runOver(ch);
    for (const P of ch.cars) {
      if (P.gone) continue;
      pose(P, dt);
      // gone once out of view: driven off after a lost chase, or a wreck left behind
      const away = !inView(P.x, P.z, 4) && camDist(P.x, P.z) > 60;
      if ((P.mode === 'leave' && (away || P.t > 30)) || (P.wrecked && away && camDist(P.x, P.z) > 90)) removeCar(P);
    }
    if (ch.state !== 'on' && ch.cars.every((P) => P.gone) && chase === ch) chase = null;
  }
  // Dan on foot, every frame: the Suits out of a car stopped near him (once a car), and one car at a time picked to run
  // him down while he's out in the road
  function afoot(ch, live, T) {
    const h = ch._heat, C = W.combat;
    if (ch.kind !== 'police' && C && C.enabled && !W.cutscene && !W.directed) {
      const up = ch.crews.reduce((n, cr) => n + cr.alive(), 0);
      for (const P of live) {
        if (P.crewOut || P.mode !== 'chase' || Math.abs(P.speed) > 1.5 || Math.hypot(P.x - T.x, P.z - T.z) > FOOT.jump) continue;
        if (up >= 2 + 2 * h) break;
        jumpOut(P, ch, T, Math.min(h >= 3 ? 3 : 2, 2 + 2 * h - up));
        break; // (one car a frame)
      }
    }
    // the run-down: him in the road, no other car at it, the next one's time come; a car with nobody of its own still up
    // (one yet to stop for him, or whose crew is all down), facing him with a clear line, near enough and not too near
    if (live.some((P) => P.ram) || ch.t < ch.ramNext || (W.combat?.player?.down)) return;
    const L = nav.onRoad(T.x, T.z);
    if (!L || Math.hypot(L.x - T.x, L.z - T.z) > FOOT.inRoad) return;
    for (const P of live) {
      if (P.mode !== 'chase' || (P.crew && P.crew.alive() > 0)) continue;
      const dx = T.x - P.x, dz = T.z - P.z, d = Math.hypot(dx, dz);
      if (d < FOOT.near || d > FOOT.far || (dx * Math.sin(P.h) + dz * Math.cos(P.h)) / d < FOOT.face || !P.los) continue;
      P.ram = { t: 0, go: false, x: 0, z: 0 };
      play('horn', { pos: [P.x, 1, P.z], kind: 'suv', len: 'long', vol: 1 });
      break;
    }
  }
  // the crew out of car P at the door on his side: n men (and the brute once, from heat 4), the bat from heat 2, the
  // bottle too from heat 3; a door's sounds, the car rocking as they get out
  function jumpOut(P, ch, T, n) {
    const h = ch._heat, rx = Math.cos(P.h), rz = -Math.sin(P.h), fx = Math.sin(P.h), fz = Math.cos(P.h);
    const side = (T.x - P.x) * rx + (T.z - P.z) * rz >= 0 ? 1 : -1, lat = P.hw + 0.6;
    const brute = h >= 4 && !ch.brute ? 1 : 0; if (brute) ch.brute = true;
    const weapons = h >= 3 ? ['bat', 'bottle'] : h >= 2 ? ['bat'] : [];
    const dx = P.x + rx * side * lat, dz = P.z + rz * side * lat;
    let crew = null;
    try { crew = W.combat.spawnCrew({ x: dx, z: dz, count: n, brute, weapons, props: false }); } catch (err) { console.error('[pursuit] crew', err); }
    P.crewOut = true;
    if (!crew) return;
    // (each at a door spot: along the car's side, either side of its middle, the third behind)
    const along = [0.9, -0.9, -2.2, 2.0];
    crew.enemies.forEach((e, k) => {
      const ax = dx + fx * along[k % along.length], az = dz + fz * along[k % along.length];
      e.pos.x = ax; e.pos.z = az; e.pos.y = cm.getGroundHeight(ax, az, 'person');
    });
    P.crew = crew; ch.crews.push(crew);
    play('doorOpen', { pos: [dx, 1, dz], vol: 0.9 });
    setTimeout(() => play('doorClose', { pos: [dx, 1, dz], vol: 0.9 }), 650);
    P.rollV += side * 1.6;
    console.log(`[pursuit] car ${P.i}: ${crew.enemies.length} out`);
    ch.emit('crew', { car: P, crew });
  }
  // a chase car's box against Dan on foot: going 4.5 m/s or more, it runs him down (once, until he's up again)
  function runOver(ch) {
    const C = W.combat, c = C?.debug?.c;
    if (!c || cm.activeMode !== 'person' || !c.live() || c.me.down() || c.me.invulnUntil > c.time) return;
    const p = W.person.position;
    for (const P of ch.cars) {
      if (P.gone || P.wrecked) continue;
      const sp = Math.hypot(Math.sin(P.h) * P.speed + P.vx, Math.cos(P.h) * P.speed + P.vz);
      if (sp < 4.5) continue;
      const cs = Math.cos(P.h), sn = Math.sin(P.h), dx = p.x - P.x, dz = p.z - P.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) > P.hw + 0.35 || Math.abs(lz) > P.hl + 0.35) continue;
      c.me.takeHit({ pos: { x: P.x, z: P.z }, weapon: null }, clamp(sp * FOOT.dmg, FOOT.dmgMin, FOOT.dmgMax), true);
      play('pedHit', { pos: [p.x, 1, p.z], vol: clamp(0.5 + sp / 30, 0.5, 1), speed: sp });
      W.crash?.jolt?.(clamp(sp / 20, 0.2, 0.9), lx >= 0 ? -cs : cs, lx >= 0 ? sn : -sn);
      P.speed *= 0.35; P.ram = null; ch.ramNext = ch.t + FOOT.again;
      console.log(`[pursuit] car ${P.i} ran him down at ${sp.toFixed(1)} m/s`);
      ch.emit('runover', { speed: sp, car: P });
      return;
    }
  }

  function lost(ch) {
    ch.state = 'lost'; ch.seen = false;
    for (const P of ch.cars) { P.mode = 'leave'; P.t = 0; P.path = null; }
    hud.say(ch.kind === 'police' ? 'Lost the cops' : 'Lost the Suits');
    play('blip', { vol: 0.5 });
    console.log('[pursuit] lost');
    ch.emit('lost', {});
  }
  // stopped by the mission: all of them gone at once
  // stopped by the mission: all of them gone at once; once lost, though, they are left to drive off out of view (no
  // cars vanishing in front of him), unless a new chase starts (hard)
  function end(ch, hard = false) {
    if (ch.state === 'lost' && !hard) return;
    for (const P of ch.cars) removeCar(P);
    ch.state = 'stopped';
    if (chase === ch) { chase = null; hud.show(null); }
  }
  // what the HUD shows: seen or searching (and, searching, inside their circle or out of it), the escape's bar
  // (progress 0..1), the pips, the circle, where they last saw him, and each car (sees: it has him)
  function view(ch) {
    const R = RULE.radius(ch._heat), on = ch.state === 'on', T = tgtState, prog = on ? ch.prog : 0;
    const searching = on && !ch.seen, escaping = searching && !ch.inCircle;
    return {
      on, kind: ch.kind, seen: on && ch.seen, searching, escaping, inCircle: searching && ch.inCircle, heat: ch._heat,
      progress: prog, lose: ch.lose, hidT: searching ? ch.hidT : 0, grace: on && ch.t < ch.grace,
      pips: !on ? 0 : Math.max(1, Math.ceil(ch._heat * (1 - prog) - 1e-6)),
      circle: ch.seen ? { x: T.x, z: T.z, r: R * (1 - prog) } : { x: ch.lastSeen.x, z: ch.lastSeen.z, r: R * (1 - prog) },
      last: searching ? { x: ch.lastSeen.x, z: ch.lastSeen.z } : null,
      seers: on ? ch.cars.filter((P) => !P.gone && !P.wrecked && P.sees).length : 0,
      cars: on ? ch.cars.filter((P) => !P.gone).map((P) => ({ x: P.x, z: P.z, i: P.i, wrecked: P.wrecked, sees: !P.wrecked && ch.seen && P.sees })) : [],
    };
  }

  /* ------------------------------------------------------------- every frame -- */
  // on the controllers' step (cm.poseCharacters runs last in it, on the crash's clock: its slow motion slows this too)
  const pc = cm.poseCharacters.bind(cm);
  const cost = { ms: 0, frames: 0 };
  cm.poseCharacters = function (dt) {
    pc(dt);
    const t0 = performance.now();
    try {
      cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(_pm);
      if (chase) step(chase, dt);
      vapor.update(dt);
      thrusters.frame(dt);
    } catch (err) { console.error('[pursuit]', err); }
    cost.ms += performance.now() - t0; cost.frames++;
  };
  // the HUD on the real clock
  let last = performance.now();
  (function tick() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { hud.frame(dt); } catch (err) { console.error('[pursuit] hud', err); }
    requestAnimationFrame(tick);
  })();
  // Dan on foot can't walk through them
  const prevCollide = W.person.collide;
  W.person.collide = (pos, r) => {
    let any = prevCollide ? prevCollide(pos, r) : false;
    if (!chase) return any;
    for (const P of chase.cars) {
      if (P.gone || pos.y > P.y + P.roof) continue;
      const cs = Math.cos(P.h), sn = Math.sin(P.h), dx = pos.x - P.x, dz = pos.z - P.z;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const side = P.hw + r - Math.abs(lx), back = lz + P.hl + r, front = P.hl + r - lz;
      if (side <= 0 || back <= 0 || front <= 0) continue;
      let nx = lx, nz = lz;
      if (side < Math.min(back, front)) nx = Math.sign(lx || 1) * (P.hw + r); else nz = back < front ? -P.hl - r : P.hl + r;
      pos.x = P.x + nx * cs + nz * sn; pos.z = P.z - nx * sn + nz * cs; any = true;
    }
    return any;
  };
  // ...nor can the Suits on foot (the fight moves them with c.world.collide: kept out of the chase cars' boxes too); and
  // the Suits' chase on foot is caught when he is beaten down
  const hookCombat = () => {
    const c = W.combat?.debug?.c;
    if (!c || !c.world || c.world.__chase) return !!c;
    const base = c.world.collide;
    c.world.collide = (pos, r) => { base(pos, r); if (chase) for (const P of chase.cars) { if (P.gone) continue;
      const cs = Math.cos(P.h), sn = Math.sin(P.h), dx = pos.x - P.x, dz = pos.z - P.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const side = P.hw + r - Math.abs(lx), back = lz + P.hl + r, front = P.hl + r - lz;
      if (side <= 0 || back <= 0 || front <= 0) continue;
      let nx = lx, nz = lz;
      if (side < Math.min(back, front)) nx = Math.sign(lx || 1) * (P.hw + r); else nz = back < front ? -P.hl - r : P.hl + r;
      pos.x = P.x + nx * cs + nz * sn; pos.z = P.z - nx * sn + nz * cs; } };
    c.world.__chase = true;
    W.combat.player.onDown(() => {
      const ch = chase;
      if (!ch || ch.state !== 'on' || ch.kind === 'police' || cm.activeMode === 'car' || ch.caughtSent) return;
      ch.caughtSent = true; ch.emit('caught', { x: W.person.position.x, z: W.person.position.z, onFoot: true });
    });
    return true;
  };
  // (the fight installs after this: hooked on the first chase, or as soon as it's there)
  { const t = setInterval(() => { if (hookCombat()) clearInterval(t); }, 500); }

  // (built once now, out of sight, so the first chase doesn't stall on its shaders)
  try {
    const warm = new THREE.Group(); warm.position.set(0, -60, 0);
    for (const [k, i] of [['suits', 0], ['suits', 1], ['police', 0]]) warm.add(buildChaseCar(k, i).group);
    scene.add(warm);
    const done = () => scene.remove(warm);
    const r = app.renderer?.compileAsync?.(warm, cam, scene);
    if (r && r.then) r.then(done, done); else setTimeout(done, 3000);
  } catch (err) { console.warn('[pursuit] warm-up', err); }

  W.pursuit = {
    start,
    stop() { if (chase) chase.stop(); },
    get heat() { return chase && chase.state === 'on' ? chase.heat : 0; },
    set heat(v) { if (chase && chase.state === 'on') chase.heat = v; },
    get active() { return !!chase && chase.state === 'on'; },
    get chase() { return chase; },
    RULE,
    debug: {
      cost: () => ({ msPerFrame: cost.frames ? +(cost.ms / cost.frames).toFixed(3) : 0, frames: cost.frames, ms: +cost.ms.toFixed(1) }),
      state: () => chase && {
        state: chase.state, seen: chase.seen, esc: +chase.esc.toFixed(2), hide: +chase.hideT.toFixed(2), prog: +chase.prog.toFixed(3), heat: chase._heat, last: chase.lastSeen, view: view(chase),
        cars: chase.cars.map((P) => ({ i: P.i, x: +P.x.toFixed(1), z: +P.z.toFixed(1), h: +P.h.toFixed(2), speed: +P.speed.toFixed(1), hp: Math.round(P.hp), mode: P.mode, sees: P.sees, wrecked: P.wrecked, gone: P.gone, d: +Math.hypot(P.x - tgtState.x, P.z - tgtState.z).toFixed(1), path: P.path ? P.path.length : 0, ghost: +Math.max(0, P.ghost).toFixed(1), ghosts: P.ghosts, dmg: P.dmg })),
      },
      vapor, nav, target: tgtState,
      // (a chase car stood still at x, z facing h: a test's obstacle)
      park(i, x, z, h) { const P = chase && chase.cars[i]; if (!P) return null; Object.assign(P, { mode: 'parked', x, z, h, speed: 0, vx: 0, vz: 0, w: 0 }); return P; },
    },
  };
  console.log('[pursuit] in: heat, chase cars, thrusters');

  // the debug switches
  const qp = Q.get('pursuit'), qt = Q.get('thrusters');
  if (qt != null) thrusters.unlock(qt === 'all' || qt === '' ? 'all' : qt.split(','), { announce: true });
  if (qp != null) {
    // (once the city is up and the rest of the game has placed him: into the car, then the chase)
    const heat = clamp(parseFloat(qp) || 2, 1, 5), t0 = performance.now();
    const booted = () => { const v = document.getElementById('wg-boot'); return !v || v.classList.contains('off'); };
    const go = () => {
      if (!app.ready || !booted() || performance.now() - t0 < 1500) return setTimeout(go, 300);
      if (cm.activeMode !== 'car') { W.ride?.getIn?.(true); return setTimeout(go, 600); }
      start({ heat, kind: Q.has('police') ? 'police' : 'suits' });
    };
    go();
  }
}
