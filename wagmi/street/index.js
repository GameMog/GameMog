// Mog City: the streets: crowds on the sidewalks, people knocked flying by cars, ground under parks. Installed by game.js.
//   crowd.js   the street crowd: several times the city's own walkers on the sidewalks round Dan, corners and crossings
//   thrown.js  a person knocked flying: a rigid tumble, limbs flailing, a bounce and a slide, lying there, up again
// Dan's car (or whatever he drives) against people on foot, the crowd's and the city's own (js/traffic.js, taken over
// while they're down: p.away): fast, they fly (as the Suits do, wagmi/combat/enemy.js runOver); slow, a shove and a
// stumble; seeing it come in time, a dive aside. Driven up on the sidewalk, or on the boost, the people near scatter;
// so do they round a fight. The city's cars and buses brake for the crowd in the road (crossing, or lying in it).
// The ground under the parks, plazas and Bryant Park's terrace: js/city-grid.js, js/landmarks.js groundPatches, read by
// js/controllers.js getGroundHeight.
// API (window.WAGMI.street): crowd, hits (people hit this session), near(r) -> { n, inView }, on('hit', cb)
import { createCrowd } from './crowd.js';

const CAR = { hx: 0.95, z0: -2.12, z1: 2.26 }; // Dan's car's body in its own frame (wagmi/game.js car.body, at install)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function install(W) {
  const app = W.app, cm = app.controllerManager, TS = app.trafficSystem, car = W.car;
  if (car?.body) Object.assign(CAR, car.body);
  if (!TS) return;
  const crowd = createCrowd(W), cost = { ms: 0, n: 0 };
  const listeners = { hit: [] };
  const api = W.street = {
    crowd, hits: 0,
    near: (r = 60) => crowd.near(r),
    // (ms a frame it has cost since the last call)
    cost() { const r = +(cost.ms / Math.max(1, cost.n)).toFixed(3); cost.ms = 0; cost.n = 0; return r; },
    on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
  };
  const emit = (ev, d) => { for (const cb of listeners[ev] || []) { try { cb(d); } catch (e) { console.error('[street]', ev, e); } } };

  // every frame with the city's traffic: the crowd's cars braked for first, the crowd after the traffic has moved
  // (before the frame is drawn); hold zones (a cutscene's set) kept by the crowd as by the traffic
  const inner = TS.update;
  let failed = false;
  TS.update = function (dt, elapsed, focusPos, entity, mode, camera, ...rest) {
    if (!failed) try { brake(dt); } catch (err) { failed = true; console.error('[street] brake', err); }
    const r = inner.call(this, dt, elapsed, focusPos, entity, mode, camera, ...rest);
    const t0 = performance.now();
    if (!failed) try { frame(dt, elapsed, camera); } catch (err) { failed = true; console.error('[street]', err); }
    cost.ms += performance.now() - t0; cost.n++;
    return r;
  };
  const hold0 = TS.hold;
  if (hold0) TS.hold = function (rects = []) { crowd.hold(rects); return hold0.call(this, rects); };

  // ------------------------------------------------------------------ the tick: GTA's little 'hit and run' note
  const tick = document.createElement('div');
  tick.id = 'wg-tick';
  Object.assign(tick.style, { position: 'fixed', right: '28px', top: '96px', zIndex: 21, pointerEvents: 'none', opacity: '0', transition: 'opacity 0.25s',
    font: "600 22px 'Barlow Condensed', system-ui, sans-serif", letterSpacing: '0.08em', color: '#fff', textTransform: 'uppercase',
    textShadow: '0 1px 2px rgba(0,0,0,0.55), 0 0 12px rgba(0,0,0,0.35)', padding: '6px 12px', borderRadius: '10px', background: 'rgba(8,10,14,0.62)' });
  document.body.appendChild(tick);
  let tickT = 0, runN = 0;
  function noteHit() {
    api.hits++; runN = tickT > 0 ? runN + 1 : 1; tickT = 2.6;
    tick.innerHTML = `Hit and run${runN > 1 ? ` <span style="color:#FFC93C">x${runN}</span>` : ''}`;
  }

  // ------------------------------------------------------------------ the car against people on foot
  const _list = [], _city = [], decided = new WeakMap();
  const cityNear = (x, z, r, out) => { out.length = 0; for (const p of TS.peds || []) if (p.placed && !p.away && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p); return out; };
  let clock = 0, lastScream = -1;
  // the city's own walkers run from (x, z) along their way for a while (their pace back after it)
  function cityRun(tp, x, z, secs = 6) {
    if (!tp._run) tp._run = { speed: tp.speed, until: 0 };
    tp._run.until = Math.max(tp._run.until, clock + secs);
    tp.speed = 3.4 + Math.random() * 1.4; tp.pause = 0;
    tp.dir = (tp.x - x) * tp.ux + (tp.z - z) * tp.uz >= 0 ? 1 : -1;
  }
  function cityCalm() {
    for (const tp of TS.peds || []) if (tp._run && clock > tp._run.until) { tp.speed = tp._run.speed; tp._run = null; }
  }

  function carVsPeople() {
    const c = car;
    if (cm.activeMode !== 'car' || c.mesh?.visible === false || W.cutscene) return; // (a cutscene's car: its set is held clear)
    const h = c.heading, cs = Math.cos(h), sn = Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    const vx = fx * c.speed + (c.vx || 0), vz = fz * c.speed + (c.vz || 0), sp = Math.hypot(vx, vz);
    const cx = c.position.x, cz = c.position.z, sg = Math.sign(c.speed) || 1;
    const dx = sp > 0.1 ? vx / sp : fx * sg, dz = sp > 0.1 ? vz / sp : fz * sg;
    const people = crowd.around(cx, cz, 14, _list), city = cityNear(cx, cz, 14, _city);
    const all = people.length + city.length;
    for (let i = 0; i < all; i++) {
      const isCity = i >= people.length, q = isCity ? city[i - people.length] : people[i];
      const x = q.x, z = q.z, ox = x - cx, oz = z - cz;
      const lx = ox * cs - oz * sn, lz = ox * sn + oz * cs, r = 0.3;
      const side = (ox * -dz + oz * dx) >= 0 ? 1 : -1; // (left of the car's way: +1)
      if (!(Math.abs(lx) < CAR.hx + r && lz > CAR.z0 - r && lz < CAR.z1 + r)) {
        // coming at them: a dive out of its way (some), or a run for it
        const ahead = sg > 0 ? lz - CAR.z1 : CAR.z0 - lz;
        if (sp > 6 && ahead > 0 && ahead / sp < 0.5 && Math.abs(lx) < CAR.hx + 0.8 && !(decided.get(q) > clock - 2)) {
          decided.set(q, clock);
          if (Math.random() < 0.45) {
            const p = isCity ? crowd.take(q) : q;
            if (p) { p.hitX = cx; p.hitZ = cz; crowd.knock(p, (b) => b.dive(-dz * side, dx * side)); crowd.scream(x, 0, z, 0.8); }
          } else if (!isCity) crowd.scare(q, cx, cz); else cityRun(q, cx, cz);
        }
        continue;
      }
      if (sp > 2.8) {
        // run down: flying
        const p = isCity ? crowd.take(q) : q;
        if (!p) continue;
        p.hitX = cx; p.hitZ = cz;
        crowd.knock(p, (b) => b.hit(dx, dz, sp, side));
        const y = cm.getGroundHeight(x, z, 'person');
        W.audio?.play?.('pedHit', { pos: [x, y + 1, z], vol: clamp(0.45 + sp / 30, 0.5, 1) });
        if (clock - lastScream > 0.12) { lastScream = clock; W.audio?.play?.('scream', { pos: [x, y + 1.5, z], vol: 0.95, rate: 0.9 + Math.random() * 0.25 }); }
        c.speed *= sp > 12 ? 0.94 : 0.85;
        noteHit();
        emit('hit', { x, z, speed: sp, city: isCity });
        // everyone round it runs
        for (const o of crowd.around(x, z, 18, [])) crowd.scare(o, x, z);
        for (const tp of cityNear(x, z, 18, [])) cityRun(tp, x, z, 8);
      } else {
        // slow: shoved out of its way, stumbling
        const p = isCity ? crowd.take(q) : q;
        if (!p) continue;
        if (isCity) crowd.backOnLane(p, cx, cz);
        // (aside, off the car's line, the way they stood of it; a little on with it)
        const ux = cs * Math.sign(lx || 1), uz = -sn * Math.sign(lx || 1), k = 2.4 + sp * 1.2;
        p.shove = { x: ux * k + dx * sp * 0.5, z: uz * k + dz * sp * 0.5 };
        if (!isCity) { crowd.scare(p, cx, cz, 4); crowd.aside(p, cx, cz); }
        if (sp > 1.2) crowd.scream(x, 0, z, 0.35);
      }
    }
  }

  // ------------------------------------------------------------------ the people near trouble scatter
  let scanT = 0;
  const _o = [];
  function scatter(dt) {
    scanT -= dt;
    if (scanT > 0) return;
    scanT = 0.2;
    // a fight: the crowd round Dan runs (the city's walkers already do, wagmi/combat)
    const P = W.person.position;
    if (W.combat?.fighting) for (const o of crowd.around(P.x, P.z, 18, _o)) crowd.scare(o, P.x, P.z);
    if (cm.activeMode !== 'car' || W.cutscene) return;
    const c = car, sp = Math.abs(c.speed), keys = cm.keys || {};
    if (sp < 4) return;
    const onWalk = c.position.y > 0.12, boost = keys.boost && sp > 10;
    if (!onWalk && !boost) return;
    // up on the sidewalk, or flat out on the boost: those near it (in front, more so) run; some scream
    const r = boost ? 20 : 15, fx = Math.sin(c.heading) * Math.sign(c.speed), fz = Math.cos(c.heading) * Math.sign(c.speed);
    const x0 = c.position.x, z0 = c.position.z;
    for (const o of crowd.around(x0, z0, r, _o)) {
      const ahead = (o.x - x0) * fx + (o.z - z0) * fz;
      if (ahead < -4 || Math.hypot(o.x - x0, o.z - z0) > r) continue;
      if (o.state !== 'flee') crowd.scream(o.x, 0, o.z, onWalk ? 0.25 : 0.12);
      crowd.scare(o, x0 - fx * 6, z0 - fz * 6);
      if (onWalk && ahead > 0 && ahead < 12) crowd.aside(o, x0, z0);
    }
    for (const tp of cityNear(x0, z0, r, _city)) if ((tp.x - x0) * fx + (tp.z - z0) * fz > -4) cityRun(tp, x0, z0);
  }

  // ------------------------------------------------------------------ the traffic brakes for the crowd in the road
  const vehicles = [...(TS.cars || []), ...(TS.buses || [])], obst = [];
  // (a point `ahead` m on and `lat` m to the right of a vehicle: on the arc of curvature k it drives, w m either side)
  const onArc = (ahead, lat, k, w) => Math.abs(k) > 1e-3 && ahead < 1.3 / Math.abs(k) && Math.abs(Math.hypot(ahead, lat - 1 / k) - 1 / Math.abs(k)) <= w;
  function brake(dt) {
    obst.length = 0;
    const f = crowd.focus;
    for (const list of [crowd.people, crowd.taken]) {
      for (const p of list) {
        if (!p.placed && !p.body) continue;
        const inRoad = p.body ? p.body.pos.y < 0.45 : p.state === 'cross' || (p.state === 'free' && cm.getGroundHeight(p.x, p.z, 'person') < 0.1);
        if (inRoad && Math.abs(p.x - f.x) < 100 && Math.abs(p.z - f.z) < 100) obst.push({ x: p.x, z: p.z, r: p.body ? 0.9 : 0.4 });
      }
    }
    if (!obst.length) return;
    for (const v of vehicles) {
      if (!v.edge || !(v.speed > 0.02) || Math.abs(v.x - f.x) > 110 || Math.abs(v.z - f.z) > 110) continue;
      // (where it is going: straight on, round the bend it's in, and at a corner the turn it signals; as the fight's
      // traffic does, wagmi/combat)
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), k1 = -(v.yawRate || 0) / Math.max(1, v.speed);
      const k2 = v.blink && (v.conn || (v.edge.len || 99) - (v.s || 0) < 16) ? v.blink / 9 : 0;
      let gap = Infinity;
      for (const o of obst) {
        const ox = o.x - v.x, oz = o.z - v.z, ahead = ox * fx + oz * fz;
        if (ahead <= 0 || ahead > 40) continue;
        const lat = oz * fx - ox * fz, w = (v.halfWidth || 0.9) + o.r + 0.45;
        if (Math.abs(lat) > w && !onArc(ahead, lat, k1, w) && !onArc(ahead, lat, k2, w)) continue;
        gap = Math.min(gap, ahead - (v.half || 2.3) - o.r - 1.4);
      }
      if (gap === Infinity) continue;
      const cap = Math.sqrt(2 * 6 * Math.max(0, gap));
      if (v.speed > cap) v.speed = Math.max(cap, v.speed - 14 * Math.max(dt, 1 / 120));
    }
  }

  function frame(dt, elapsed, camera) {
    clock = elapsed ?? clock + dt;
    carVsPeople();
    scatter(dt);
    cityCalm();
    crowd.update(dt, elapsed, camera);
    if (tickT > 0) { tickT -= dt; tick.style.opacity = tickT > 0.3 && !W.cutscene ? '1' : '0'; }
  }
  console.log('[wagmi] the streets are in');
  return api;
}
