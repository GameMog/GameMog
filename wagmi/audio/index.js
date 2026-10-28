// Mog City: the city's sound: one mixer for everything, NYC ambience, car and traffic sound, sirens, hits (WAGMI.audio). Installed by game.js.
//   WAGMI.audio.play(name, { pos: [x, y, z], vol, rate, ...its own })   a one-shot (sounds.js), placed if pos is given
//   WAGMI.audio.loop(name, { pos, vol, rate }) -> { set({ pos, vol, rate, ... }), stop(secs) }   a loop (loops.js)
//   WAGMI.audio.duck(bus, amount, secs)   dip a bus ('music', 'amb', 'sfx', 'voice') by amount for secs
//   WAGMI.audio.bus.master / .sfx / .amb / .music / .voice   GainNodes to connect into; WAGMI.audio.ctx the context
//   WAGMI.audio.unlock()   (any key or click does it)
// Every frame, from the game: the camera is the ears; the city's bed follows where it is (city.js), the nearest traffic
// and any police on a call get voices and horns (traffic.js), Dan's car sings while he drives it (playercar.js), his
// feet make steps (steps.js), and a crash in the car is heard. ?noaudio leaves all of it out (the fight's and the
// cutscenes' sounds then make their own contexts as before).
import { createMixer } from './core.js';
import { createEngine } from './engine.js';
import { createCity } from './city.js';
import { createTraffic } from './traffic.js';
import { createPlayerCar } from './playercar.js';
import { createSteps } from './steps.js';
import { createMotors } from './motors.js';
import { warmCrunch } from './crunch.js';

const NOOP = { set() { return NOOP; }, stop() {} };

export function install(W) {
  if (/[?&]noaudio\b/.test(location.search)) {
    W.audio = { ctx: null, bus: null, play() { return null; }, loop() { return NOOP; }, duck() {}, force() {}, unlock() {}, volume() {}, ready: false };
    return;
  }
  let M = null, E = null, city = null, traffic = null, car = null, steps = null, unlocked = false;
  function ensure() {
    if (M) return M;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try {
      // (touch-first devices get a bigger output buffer: on a busy phone a small one runs dry and crackles)
      let touchFirst = false;
      try { touchFirst = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; } catch (e) { /* old browsers */ }
      M = createMixer(new AC({ latencyHint: touchFirst ? 'playback' : 'interactive' }));
      // (the traffic's engines and the crash's metal: their sound baked a slice at a time in idle moments from now)
      M.motors = createMotors(M); M.motors.warm();
      warmCrunch(M);
      E = createEngine(M);
      city = createCity(M, E); traffic = createTraffic(M, E); car = createPlayerCar(M, E); steps = createSteps(E);
    } catch (e) { console.warn('[audio] no sound:', e); M = null; }
    return M;
  }
  function unlock() {
    const m = ensure(); if (!m) return null;
    unlocked = true;
    if (m.ctx.state !== 'running' && document.visibilityState !== 'hidden' && !paused) m.ctx.resume().catch(() => {});
    return m.ctx;
  }
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, unlock, { capture: true, passive: true });
  // (a hidden tab goes quiet and stops costing anything)
  document.addEventListener('visibilitychange', () => { if (!M) return; if (document.hidden) M.ctx.suspend().catch(() => {}); else if (unlocked && !paused) M.ctx.resume().catch(() => {}); });
  // the pause menu (W.paused, wagmi/mission/pause.js): every sound stops where it is (the context held: the radio's
  // decks, a line half said, the engine, the city) and goes on from there on Resume. (The menu's own dip of the buses is
  // not wanted on top: it would still be pulling them down after Resume.)
  let paused = false;
  function pauseCheck() {
    const p = !!W.paused; if (!M || p === paused) return;
    paused = p; M.hold(p);
    if (!p && unlocked && !document.hidden) M.ctx.resume().catch(() => {});
  }

  const running = () => !!M && M.ctx.state === 'running';
  const A = (W.audio = {
    get ctx() { return ensure()?.ctx ?? null; },
    get bus() { return ensure()?.bus ?? null; },
    get ready() { return running(); },
    play(name, o) {
      if (!running()) return null;
      // (the jingles push the radio down while they play)
      if (name === 'missionPassed' || name === 'missionStart') M.duck('music', 0.75, name === 'missionPassed' ? 3.6 : 2.4);
      return E.play(name, o || {});
    },
    loop(name, o) { if (!ensure()) return NOOP; return E.loop(name, o || {}); },
    duck(bus, amount, secs) { pauseCheck(); if (!paused) M?.duck(bus, amount, secs); },
    // a city event now: 'siren' (one far off), 'subway', 'build', 'whistle', 'heli', 'honk', 'coo', 'flutter'
    force(name) { ensure(); city?.force(name); },
    unlock,
    volume(v) { if (ensure()) M.bus.master.gain.setTargetAtTime(Math.max(0, v), M.now(), 0.05); },
    // (for tests: what is sounding)
    debug() {
      if (!M) return null;
      const vs = traffic.voices || {};
      const who = (list) => (list || []).map((x) => (x.v ? { w: +x.w.toFixed(2), d: +Math.hypot((x.v.edge ? x.v.x : x.x) - M.listener.x, (x.v.edge ? x.v.z : x.z) - M.listener.z).toFixed(1), mode: x.L?.mode, kind: x.kind, highway: !x.v.edge, engine: !!x.mv } : null));
      return { state: M.ctx.state, paused, where: city.where, cars: who(vs.cars), sirens: who(vs.sirens), blocks: city.engines, car: car.built, engine: car.engine, babble: !!M.babble, motors: M.motors.bake, crunchMs: M.crunchMs, played: { ...E.count }, horns: { ...traffic.horns }, msPerFrame: cost.n ? +(cost.ms / cost.n).toFixed(3) : 0, latency: +(M.ctx.baseLatency || 0).toFixed(4) };
    },
  });

  /* ---------------------------------------------------- the game, per frame -- */
  const app = W.app, cm = app.controllerManager, NYC = window.NYC || {};
  // where the avenues run: 20 m cells their lanes pass through
  let aveCells = null;
  const CELL = 20, key = (x, z) => Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
  function avenueNear(x, z) {
    if (!aveCells) {
      aveCells = new Set();
      for (const e of app.trafficSystem?.network?.edges || []) {
        if (e.axis !== 'ave') continue;
        const sx = e.sx ?? e.x0, sz = e.sz ?? e.z0, len = e.len ?? e.span ?? 0;
        for (let s = 0; s <= len; s += 8) aveCells.add(key(sx + e.dx * s, sz + e.dz * s));
      }
    }
    let n = 0;
    for (const [ox, oz] of [[0, 0], [CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) if (aveCells.has(key(x + ox, z + oz))) n++;
    return Math.min(1, n / 2);
  }
  const CP = NYC.CENTRAL_PARK_BOUNDS;
  function parkAt(x, z) {
    if (CP && x > CP.minX && x < CP.maxX && z > CP.minZ && z < CP.maxZ) return 1;
    const b = NYC.blockAt?.(x, z);
    return b && b.park > 0.5 && !b.median ? 1 : 0;
  }
  const where = { traffic: 0.5, crowd: 0.3, park: 0, avenue: 0.5 };
  let surface = 'hard', placeT = 0;
  function place() {
    const L = M.listener, tr = app.trafficSystem;
    let tw = 0, cw = 0;
    for (const list of [tr?.cars || [], tr?.buses || []]) for (const v of list) {
      if (!v.edge) continue;
      const d = Math.hypot(v.x - L.x, v.z - L.z); if (d > 90) continue;
      tw += (v.bus ? 1.6 : 1) * (0.4 + 0.6 * Math.min(1, Math.abs(v.speed) / 8)) / (1 + d / 22);
    }
    for (const p of tr?.peds || []) { if (!p.placed) continue; const d = Math.hypot(p.x - L.x, p.z - L.z); if (d < 40) cw += 1 / (1 + d / 10); }
    // (the street crowd: near() gives { n, inView })
    try { const n = W.street?.near?.(35), k = typeof n === 'number' ? n : n?.n; if (k > 0) cw += k * 0.35; } catch {}
    let pk = 0; for (const [ox, oz] of [[0, 0], [28, 0], [-28, 0], [0, 28], [0, -28]]) pk += parkAt(L.x + ox, L.z + oz);
    Object.assign(where, { traffic: Math.min(1, tw / 3.5), crowd: Math.min(1, cw / 7), park: pk / 5, avenue: avenueNear(L.x, L.z) });
    const p = W.person.position; surface = parkAt(p.x, p.z) ? 'grass' : 'hard';
  }

  // the car: what it did since the last frame
  const C = { h: null, y: 0, vx: 0, vz: 0, lat: 0, hitCool: 0 };
  function carState(dt, on) {
    const c = W.car, k = cm.keys;
    const h = c.heading, vx = Math.sin(h) * c.speed + (c.vx || 0), vz = Math.cos(h) * c.speed + (c.vz || 0);
    let dh = C.h == null ? 0 : h - C.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    C.lat += (Math.abs(c.speed * dh / Math.max(1e-3, dt)) - C.lat) * Math.min(1, dt * 12);
    // a crash: the velocity changed faster than any driving could change it
    const dv = Math.hypot(vx - C.vx, vz - C.vz);
    C.hitCool -= dt;
    // (wagmi/crash plays its own crunches when it is in)
    if (!W.crash && on && C.h != null && dv > 3.2 + 34 * dt && C.hitCool <= 0) { E.play('carHit', { pos: [c.position.x, c.position.y + 0.7, c.position.z], k: Math.min(1.3, dv / 12), ref: 10 }); C.hitCool = 0.3; }
    const dy = C.h == null ? 0 : c.position.y - C.y;
    C.h = h; C.y = c.position.y; C.vx = vx; C.vz = vz;
    const throttle = (+k.forward || 0) - (+k.backward || 0);
    const side = cm.isPointOnSidewalk?.(c.position.x, c.position.z);
    // (sliding: a handbrake or drift if the car has one, or the sideways slip a knock leaves)
    const slide = Math.max(c.handbrake || c.drifting ? Math.min(1, Math.abs(c.speed) / 8) : 0, Math.min(1, Math.max(0, (Math.hypot(c.vx || 0, c.vz || 0) - 2) / 6)));
    return { on, speed: c.speed, throttle, boost: !!k.boost, latAcc: C.lat, slide, rough: parkAt(c.position.x, c.position.z) ? 0.8 : side ? 0.5 : 0, jolt: on && Math.abs(dy) > 0.05 ? Math.min(1, Math.abs(dy) * 4) : 0 };
  }

  let last = performance.now(), inside = -1;
  const cost = { ms: 0, n: 0 };
  const cam = { x: 0, z: 0, init: false };
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    pauseCheck();
    if (!running() || !dt || paused) return;
    const t0 = performance.now();
    try {
      const camera = app.cameraSystem?.camera; if (!camera) return;
      const e = camera.matrixWorld.elements, L = M.listener;
      L.x = e[12]; L.y = e[13]; L.z = e[14];
      L.rx = e[0]; L.ry = e[1]; L.rz = e[2]; L.fx = -e[8]; L.fy = -e[9]; L.fz = -e[10];
      // the ears' speed (for doppler), forgotten across a cut
      const jx = L.x - cam.x, jz = L.z - cam.z;
      if (!cam.init || Math.hypot(jx, jz) > 12) { L.vx = L.vz = 0; cam.init = true; }
      else { L.vx += (jx / dt - L.vx) * 0.3; L.vz += (jz / dt - L.vz) * 0.3; }
      cam.x = L.x; cam.z = L.z;
      placeT -= dt; if (placeT <= 0) { place(); placeT = 0.25; }
      const P = W.person, c = W.car, inCar = cm.activeMode === 'car';
      if (+inCar !== inside) { M.inside(+inCar); inside = +inCar; }
      city.update(dt, where);
      const tr = app.trafficSystem, pe = inCar ? c : P;
      traffic.update(dt, tr?.cars || [], tr?.buses || [], {
        active: !W.cutscene, x: pe.position.x, z: pe.position.z, inCar, speed: Math.abs(pe.speed || 0),
        onSidewalk: inCar && !!cm.isPointOnSidewalk?.(c.position.x, c.position.z), self: c, highway: app.highwayTraffic,
      });
      car.update(dt, carState(dt, inCar));
      // his feet (the bones' heights over where he stands)
      const B = W.dan?.bones, onFoot = cm.activeMode === 'person' && P.mesh.visible;
      const fy = (b) => (b ? b.matrixWorld.elements[13] - P.position.y : null);
      steps.update(dt, { on: onFoot && !!B, feet: [fy(B?.foot_L), fy(B?.foot_R)], speed: W.directed ? 1.5 : Math.abs(P.speed || 0) || (W.dan?.loco?.speed ?? 0), surface, inAir: Math.abs(P.verticalVel || 0) > 0.5 });
      E.update();
    } catch (err) { if (!tick.warned) { tick.warned = true; console.warn('[audio] frame:', err); } }
    cost.ms += performance.now() - t0; cost.n++;
  }
  requestAnimationFrame(tick);
  return A;
}
