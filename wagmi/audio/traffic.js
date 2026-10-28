// Mog City: the traffic's sound, read off the city's own cars and buses (js/traffic.js: x, z, yaw, speed, acc, vx, vz,
// bus, isNYPD, isTaxi, isSUV, pAhead / pRight: where the player is against it) and the shore highways' cars (their
// place(c): x, z, yaw; c.v, c.acc, c.kind), no hooks inside them:
//  - the nearest eight of them (a bus counts as nearer) each get a real engine (motors.js, after Slop New York: a car's,
//    an SUV's or a bus's diesel, revving up through its gears as it pulls away, its tyres at speed), placed and pitched
//    by doppler as they pass; a voice changes hands by fading, never cutting; Dan's own car never gets one (it has its
//    own, playercar.js), nor a wreck, nor the chase's cars (wagmi/pursuit voices its own);
//  - NYPD cruisers go out on calls: each on its own clock, some of the time its siren on (a wail, a yelp when it is stuck
//    or pushing through), the nearest two heard, doppler and all; ram one and it yelps at you;
//  - horns (owner, 28 Oct: less honking unless the driver causes an accident): one he rams honks after the bang (and a
//    wreck's driver: wagmi/crash), one he forces into an emergency stop right in its lane honks; a car he blocks a good
//    while gives one beep; nothing else (no horns at lights, none for the sidewalk, never more than one every 8 s that
//    isn't a crash's);
//  - a bus's air brakes hiss when it comes to a stop.
import { LOOPS } from './loops.js';
import { motorLoad } from './motors.js';

export function createTraffic(M, E) {
  const out = M.bus.amb;
  const R = M.R;
  const memo = new WeakMap();
  const mem = (v) => { let m = memo.get(v); if (!m) memo.set(v, (m = { blocked: 0, cool: R() * 3, kick: Math.hypot(v.vx || 0, v.vz || 0), prev: v.speed, light: 0, siren: null, seed: R() })); return m; };
  // a voice: a loop in a placed spot, given to one vehicle at a time
  const voice = (kind, ref) => {
    const spot = M.spot(out, null, { ref, verb: 0.22 });
    const L = LOOPS[kind](M, spot.in);
    return { L, spot, v: null, w: 0, want: 0, kind };
  };
  // an engine's voice: a placed spot and its level; the engine itself (M.motors) made for the vehicle it is handed to
  // (its kind, its own gears from rest) and let go when nobody has it
  const MOTORS = 8, LEVEL = { sedan: 0.72, suv: 0.72, bus: 1.25 };   // (a street of them as loud as the old hums were)
  const engine = () => { const spot = M.spot(out, null, { ref: 6, verb: 0.22 }); return { spot, g: M.gain(0, spot.in), mv: null, v: null, w: 0, want: 0, kind: null, next: 0, x: 0, z: 0 }; };
  let carV = null, sirenV = null;
  const build = () => { carV = Array.from({ length: MOTORS }, engine); sirenV = [voice('siren', 22), voice('siren', 22)]; M.motors?.warm(); };

  const vel = (v) => [v.tx * v.speed + (v.vx || 0), v.tz * v.speed + (v.vz || 0)];
  // what an engine needs of a vehicle, the city's or a highway's (h: its place this frame)
  const hw = new Map();
  // (an engine by the body kind's voice, js/traffic.js CAR_KINDS engine: an SUV's for SUVs, pickups and vans)
  const kindOf = (v) => (v.bus ? 'bus' : v.engine || (v.edge ? (v.isSUV ? 'suv' : 'sedan') : v.kind === 'suv' ? 'suv' : 'sedan'));
  function state(v) {
    if (v.edge) { const [vx, vz] = vel(v); return { x: v.x, z: v.z, vx, vz, speed: Math.abs(v.speed), acc: v.acc || 0 }; }
    const h = hw.get(v); if (!h) return null;
    return { x: h.x, z: h.z, vx: Math.sin(h.yaw) * v.v, vz: Math.cos(h.yaw) * v.v, speed: v.v, acc: v.acc || 0 };
  }
  function engines(dt) {
    const now = M.now();
    for (const x of carV) {
      const s = x.v && state(x.v);
      if (!s) { if (x.mv && x.w <= 0) { x.mv.dispose(); x.mv = null; } if (x.mv) x.g.gain.setTargetAtTime(0, now, 0.05); continue; }
      // (handed a new vehicle: a new engine, its kind's, from its own state)
      if (x.fresh) { x.fresh = false; x.mv?.dispose(); x.kind = kindOf(x.v); x.mv = M.motors?.voice(x.kind, x.g) || null; x.next = 0; x.seed = mem(x.v).seed; }
      x.x = s.x; x.z = s.z;
      x.spot.set([s.x, 0.9, s.z], 0.03);
      x.g.gain.setTargetAtTime(x.w * LEVEL[x.kind], now, 0.06);
      // (its gears and revs need no more than ~15 updates a second)
      if (x.mv && (x.next -= dt) <= 0) { x.next = 0.066; x.mv.update({ speed: s.speed, load: motorLoad(s.speed, s.acc, x.kind), doppler: M.doppler(s.x, 0.9, s.z, s.vx, s.vz), seed: x.seed }, now); }
    }
  }
  // hand the voices to the nearest few (cand sorted near to far): one keeps its vehicle while it is still among them
  function assign(voices, cand, dt) {
    const keep = new Set(cand.slice(0, voices.length + 1));
    for (const x of voices) x.want = x.v && keep.has(x.v) ? 1 : 0;
    const voiced = new Set(voices.filter((x) => x.v && x.want).map((x) => x.v));
    for (const c of cand.slice(0, voices.length)) {
      if (voiced.has(c)) continue;
      const free = voices.find((x) => !x.v || (x.want === 0 && x.w < 0.02));
      if (!free) break;
      free.v = c; free.want = 1; free.w = 0; free.fresh = true; voiced.add(c);
    }
    for (const x of voices) {
      x.w += Math.sign(x.want - x.w) * Math.min(Math.abs(x.want - x.w), dt / 0.35);
      if (x.want === 0 && x.w <= 0) x.v = null;
    }
  }
  function sound(x, set) {
    const v = x.v;
    if (!v) { if (!x.quiet) x.L.set({ vol: 0 }); x.quiet = true; return; }
    x.quiet = false;
    x.spot.set([v.x, 0.9, v.z], 0.03);
    const [vx, vz] = vel(v);
    set(v, M.doppler(v.x, 0.9, v.z, vx, vz));
  }
  const BIG = { suv: 1, minivan: 1, pickup: 1, van: 1 }; // (their horns: an SUV's)
  const honk = (v, len, delay = 0, crash = false) => {
    const kind = v.bus ? 'bus' : v.isNYPD ? 'police' : v.isTaxi ? 'taxi' : v.isSUV || BIG[v.bodyType] ? 'suv' : 'sedan';
    E.play('horn', { pos: [v.x, 1, v.z], kind, len, bus: 'amb', vol: 0.9, delay });
    hornCool = crash ? 0.35 : 8;
  };
  let hornCool = 0;
  const horns = { ram: 0, nearMiss: 0, blocked: 0 }; // (for tests: the horns played here, by why; WAGMI.audio.debug())
  const call = { v: null, t: 8 + R() * 30, mode: 'wail', sw: 3 };

  // per frame. cars / buses: the city's; P: { x, z, inCar, speed, onSidewalk, active (no cutscene), self (Dan's car),
  // highway (the shore highways' traffic, js/traffic.js createHighwayTraffic) }
  const hwList = [], hwCars = [], hwAt = new WeakMap();
  let hwT = 0;
  function update(dt, cars, buses, P) {
    if (!carV) build();
    hornCool -= dt;
    const L = M.listener, R2 = 85 * 85;
    const near = [], nearBus = [], cops = [], heard = [];
    for (const list of [cars, buses]) for (const v of list) {
      if (!v.edge) continue;
      const dx = v.x - L.x, dz = v.z - L.z, d2 = dx * dx + dz * dz;
      if (v.isNYPD) cops.push([v, d2]);
      if (d2 > R2) continue;
      (v.bus ? nearBus : near).push([v, d2]);
      if (v !== P.self && !v.wreck) heard.push([v, v.bus ? d2 * 0.5 : d2]);
      const m = mem(v);
      m.cool -= dt;
      // horns: is the player in its way (standing, parked) ahead in its lane?
      if (P.active) {
        const inWay = v.pAhead > 0 && v.pAhead < 15 && Math.abs(v.pRight) < 2.1;
        if (inWay && v.speed < 1.2) m.blocked += dt; else m.blocked = Math.max(0, m.blocked - dt * 2);
        if (m.blocked > 5 && m.cool <= 0 && hornCool <= 0) { honk(v, R() < 0.6 ? 'beep' : 'double'); m.cool = 25 + R() * 15; horns.blocked++; }
        // a near miss he forces: an emergency stop for his car right ahead in its lane
        if (P.inCar && v.acc < -6 && v.speed > 4 && v.pAhead > 0 && v.pAhead < 12 && Math.abs(v.pRight) < 2.1 && m.cool <= 0 && hornCool <= 0) { honk(v, R() < 0.6 ? 'long' : 'double', 0.15); m.cool = 15; horns.nearMiss++; }
        // rammed: a kick it didn't make itself
        const kick = Math.hypot(v.vx || 0, v.vz || 0);
        if (kick - m.kick > 1.2 && Math.hypot(v.x - P.x, v.z - P.z) < 12) {
          if (v.isNYPD) { m.siren = { mode: 'yelp', t: 2.5 + R() * 2 }; }
          // (a wreck's driver is wagmi/crash's to honk)
          if (!v.wreck && (m.cool <= 0 || kick - m.kick > 3)) { honk(v, R() < 0.5 ? 'lean' : 'long', 0.45 + R() * 0.4, true); m.cool = 3; horns.ram++; }
        }
        m.kick = kick;
      }
      // a bus stopping: its air brakes
      if (v.bus) { if (v.speed > 2) m.moving = true; else if (m.moving && v.speed < 0.2) { m.moving = false; E.play('airBrake', { pos: [v.x, 1.2, v.z], bus: 'amb', vol: 0.8 }); } }
      m.prev = v.speed;
    }
    near.sort((a, b) => a[1] - b[1]); nearBus.sort((a, b) => a[1] - b[1]);
    // the engines: the nearest few of the city's and the highways' (only once their sound is made: M.motors)
    // (the highways' cars within reach looked up a few times a second, where they are now every frame)
    hw.clear();
    const H = P.highway;
    if (H?.near && (hwT -= dt) <= 0) { hwT = 0.2; hwCars.length = 0; for (const h of H.near(L.x, L.z, 100, hwList)) hwCars.push(h.c); }
    if (H?.place) for (const c of hwCars) {
      const h = H.place(c, hwAt.get(c) || {}); if (!h) continue;
      hwAt.set(c, h);
      const d2 = (h.x - L.x) ** 2 + (h.z - L.z) ** 2;
      if (d2 < R2 && Math.abs(h.y - L.y) < 30) { hw.set(c, h); heard.push([c, d2]); }
    }
    if (!M.motors?.ready('sedan')) heard.length = 0;
    else for (let i = heard.length - 1; i >= 0; i--) if (!M.motors.ready(kindOf(heard[i][0]))) heard.splice(i, 1);
    heard.sort((a, b) => a[1] - b[1]);
    assign(carV, heard.map((a) => a[0]), dt);
    engines(dt);

    // the cruisers' calls: one at a time, every minute or so a cruiser 60-300 m off goes out on one for a while (a wail
    // on the move, a yelp or a phaser when it is stuck)
    call.t -= dt;
    if (call.v && (call.t <= 0 || !call.v.edge)) { call.v = null; call.t = 35 + R() * 70; }
    else if (!call.v && call.t <= 0) {
      const pool = cops.filter(([, d2]) => d2 > 60 * 60 && d2 < 300 * 300);
      if (pool.length) { call.v = pool[Math.floor(R() * pool.length)][0]; call.t = 14 + R() * 18; call.mode = 'wail'; call.sw = 3; } else call.t = 5;
    }
    if (call.v) { call.sw -= dt; if (call.sw <= 0) { call.mode = call.v.speed < 4 ? (R() < 0.7 ? 'yelp' : 'phaser') : R() < 0.75 ? 'wail' : 'yelp'; call.sw = 2.5 + R() * 5; } }
    const calling = [];
    for (const [v, d2] of cops) {
      const m = mem(v);
      if (m.siren) { m.siren.t -= dt; if (m.siren.t <= 0) m.siren = null; }
      // (a cruiser can be told: v.siren = 'wail' | 'yelp' | 'phaser' | 'off', null for its own calls)
      const mode = v.siren ? (v.siren === 'off' ? null : v.siren) : m.siren ? m.siren.mode : call.v === v ? call.mode : null;
      if (mode && d2 < 420 * 420) calling.push([v, d2, mode]);
    }
    calling.sort((a, b) => a[1] - b[1]);
    const modeOf = new Map(calling.map((a) => [a[0], a[2]]));
    assign(sirenV, calling.map((a) => a[0]), dt);
    for (const x of sirenV) sound(x, (v, dop) => x.L.set({ mode: modeOf.get(v) || x.L.mode, dop, vol: x.w * 0.55 }));
  }
  return { update, horns, get voices() { return { cars: carV, sirens: sirenV }; } };
}
