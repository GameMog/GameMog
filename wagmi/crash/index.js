// Mog City: the car's weight in the world: its size on screen, and crashes into cars, street furniture and walls. Installed by game.js.
//   fx.js      sparks, debris (glass, plastic, paint) and a burst hydrant's water
//   props.js   the street furniture (js/street-details.js breakables): poles snap and fall, small things fly, trees stand
//   wrecks.js  the city's cars knocked out of their lanes (js/traffic.js v.wreck): sliding, spinning, a pile-up, honking
// Dan's car (wagmi/game.js: car.body its box, car.mass 2, a sedan 1.4, an SUV 2.1, a bus 12) runs into them in the
// controllers' half-metre steps (js/controllers.js updateCar calls car.crash.step after each, car.crash.wall on a
// building): a car it hits is shoved by the weights (spinning off the blow's lever arm), its own car bounces, slows by
// how square the hit was and turns; head on at speed it stops hard. Every hit is felt by its size: a crunch
// (WAGMI.audio 'carHit', its volume how hard), sparks and bits where they touched, the car rocking on its springs, the
// camera jolted along the blow and shaken, and on a huge one a beat of slow motion.
// API (window.WAGMI.crash): fx, props, wrecks, jolt(a, dx, dz), slowmo(secs, scale), hitStop(secs), hits (this session),
// heard (performance.now() of the last crunch it played), on('hit', cb) ({ kind: 'car' | 'wall' | 'prop', speed, ... })
import * as THREE from 'three/webgpu';
import { createFx } from './fx.js';
import { createProps } from './props.js';
import { createWrecks, boxes, dims, massOf } from './wrecks.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function install(W) {
  const app = W.app, cm = app.controllerManager, car = W.car, TS = app.trafficSystem, cs = app.cameraSystem, cam = cs.camera;
  if (!car || !car.body) return;
  const listeners = { hit: [] };
  const api = W.crash = {
    hits: 0, heard: 0, cost: { ms: 0, frames: 0 }, // (cost: ms spent here, over frames: for a test)
    on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
  };
  const emit = (ev, d) => { api.hits++; for (const cb of listeners[ev] || []) { try { cb(d); } catch (e) { console.error('[crash]', ev, e); } } };
  const play = (name, o) => { if (name === 'carHit') api.heard = performance.now(); try { return W.audio?.play?.(name, o); } catch { return null; } };
  const fx = api.fx = createFx(app.scene, (x, z) => cm.getGroundHeight(x, z, 'person'));
  const props = api.props = createProps({ cm, fx, play, car, scene: app.scene });
  const wrecks = api.wrecks = TS ? createWrecks({ TS, cm, fx, play, props, camera: cam }) : null;

  /* ---------------------------------------------------------- the feel -- */
  // the camera jolted (a sprung push, a: 0..1, along dx dz) and shaken; time slowed (real seconds)
  const J = { off: new THREE.Vector3(), vel: new THREE.Vector3(), shake: 0, t: 0 };
  api.jolt = (a, dx = 0, dz = 0) => {
    a = clamp(a, 0, 1.2);
    J.vel.x += dx * a * 3.2; J.vel.z += dz * a * 3.2; J.vel.y += a * 1.4;
    J.shake = Math.max(J.shake, a);
  };
  const timeReq = [];
  api.slowmo = (secs, scale = 0.3) => timeReq.push({ until: performance.now() + secs * 1000, secs, scale, kind: 'slow' });
  api.hitStop = (secs, scale = 0.05) => timeReq.push({ until: performance.now() + secs * 1000, secs, scale, kind: 'stop' });
  function timeScale() {
    if (!timeReq.length) return 1;
    const now = performance.now(); let sc = 1;
    for (let i = timeReq.length - 1; i >= 0; i--) {
      const r = timeReq[i]; if (now >= r.until) { timeReq.splice(i, 1); continue; }
      // (slow motion eases back up over its last half)
      const left = (r.until - now) / 1000, k = r.kind === 'slow' ? Math.min(1, left / (r.secs * 0.5)) : 1;
      sc = Math.min(sc, 1 - (1 - r.scale) * k);
    }
    return sc;
  }
  api.timeScale = timeScale; // (how fast the game's clock runs now: 1, less in slow motion)
  // the car on its springs (as js/controllers.js rocks it off a wall): nose down into what it hit, rolled off a side blow
  function rock(nx, nz, sp) {
    const s = Math.sin(car.heading), c = Math.cos(car.heading), k = Math.min(16, sp);
    car.pitchVel = (car.pitchVel || 0) + (s * nx + c * nz) * k * 0.16;
    car.rollVel = (car.rollVel || 0) - (c * nx - s * nz) * k * 0.22;
    car.heaveVel = (car.heaveVel || 0) + Math.min(1.4, sp * 0.1);
  }
  // how big a hit is to the player: the crunch, the bits and sparks, the jolt, and slow motion on a huge one
  const cool = { sound: 0, last: 0, slow: 0, fence: 0 };
  function feel(sp, x, y, z, nx, nz, { glass = sp > 9, paint = null, heavy = 1 } = {}) {
    if (sp > 2.2 && (sp > cool.last * 1.4 || cool.sound <= 0)) { play('carHit', { pos: [x, y, z], vol: clamp(sp / 16, 0.25, 1.25) }); cool.sound = 0.2; cool.last = sp; }
    const tx = -nz, tz = nx, sd = Math.random() < 0.5 ? 1 : -1;
    if (sp > 2.5) fx.spark(x, y, z, tx * sd, tz * sd, Math.round(clamp(sp * 1.8, 8, 48)), 5 + sp * 0.3);
    const vx = Math.sin(car.heading) * car.speed, vz = Math.cos(car.heading) * car.speed;
    if (sp > 5) fx.bits(x, y + 0.1, z, vx * 0.5 - nx * 3, vz * 0.5 - nz * 3, Math.round(clamp(sp * 0.5, 3, 18)), 'plastic');
    if (glass) fx.bits(x, y + 0.3, z, vx * 0.6, vz * 0.6, Math.round(clamp(sp * 0.7, 4, 26)), 'glass');
    if (paint && sp > 4) fx.bits(x, y + 0.2, z, -nx * 3, -nz * 3, Math.round(clamp(sp * 0.4, 2, 12)), 'paint', paint);
    api.jolt(clamp(sp / 22, 0, 1) * heavy, -nx, -nz);
    // (the beat of slow motion only on the big ones, and not again for a couple of seconds: a pile-up is one beat)
    const now = performance.now();
    if (heavy > 0.7 && sp > 22 && now - cool.slow > 2000) {
      cool.slow = now;
      if (sp > 30) { api.hitStop(0.07, 0.05); api.slowmo(0.7, 0.28); } else api.slowmo(0.45, 0.4);
    }
  }

  /* ------------------------------------------------- what the car meets -- */
  const hit = { nx: 0, nz: 0, pen: 0, x: 0, z: 0 };
  const box = () => { const B = car.body; return { hl: (B.z1 - B.z0) / 2, cz: (B.z1 + B.z0) / 2 }; };
  // a building (js/controllers.js has already pushed it out and bounced it): head on, a hard stop, barely bouncing back;
  // the feel once a frame, for the hardest
  const wallHit = { vn: 0, nx: 0, nz: 0, x: 0, z: 0, headOn: 0, fence: false };
  function wall(vn, nx, nz, headOn, x, z, c = null) {
    // (and less of the shove back off it the controllers gave: head on, it stays at the wall)
    const back = headOn > 0.72 ? 0.32 : 0.12;
    car.vx -= nx * vn * back; car.vz -= nz * vn * back;
    if (headOn > 0.72) car.speed *= 0.4;
    if (vn > wallHit.vn) Object.assign(wallHit, { vn, nx, nz, x, z, headOn, fence: !!(c && c.fence) });
  }
  // a solid thing (a tree, the subway stairs, a pole hit too slowly): as a wall
  function bounce(nx, nz) {
    const s = Math.sin(car.heading), c = Math.cos(car.heading);
    const vn = -((s * car.speed + car.vx) * nx + (c * car.speed + car.vz) * nz);
    if (vn <= 0.5) return 0;
    const headOn = Math.abs(s * nx + c * nz), side = c * nx - s * nz;
    car.vx += nx * vn * 0.42; car.vz += nz * vn * 0.42;
    if (headOn > 0.72) car.speed = -car.speed * 0.1;
    else { car.speed *= 1 - 0.62 * headOn; car.angularVel = (car.angularVel || 0) + side * (s * nx + c * nz >= 0 ? -1 : 1) * Math.min(3.2, vn * 0.22); }
    rock(nx, nz, vn);
    return vn;
  }
  // the blow between this car and another going (ovx, ovz) of mass mv, along hit's normal (restitution 0.2, nearly none
  // at speed; a little friction across it): this car's share of it (slowed or backed along it, slid across it, turned
  // by its lever arm; head on at speed, crumpled to a stop); the blow J on this car, or null when they part anyway.
  // The turn is by how hard it hit: a nudge or a scrape barely turns it (3 m/s, a degree or so), a real crash (20 m/s and
  // up) spins it as hard as ever. A heavy one (a bus) shoves it with all its weight but turns it as an SUV's would, and
  // a scrape's blows (key: the one it grinds along) add up to no more than GRIND rad/s of spin each half second
  const GRIND = 1.2, grind = new WeakMap();
  function blow(ovx, ovz, mv, key = null) {
    const s = Math.sin(car.heading), c = Math.cos(car.heading), mp = car.mass || 2, { nx, nz } = hit;
    const pvx = s * car.speed + car.vx, pvz = c * car.speed + car.vz;
    const rvx = pvx - ovx, rvz = pvz - ovz, vn = rvx * nx + rvz * nz;
    if (vn >= -0.15) return null;
    const sp = -vn, e = sp > 12 ? 0.05 : 0.2;
    // (along the blow, and the friction across it: the sideswipe's scrub; m the other's weight)
    const tx = rvx - nx * vn, tz = rvz - nz * vn, tl = Math.hypot(tx, tz);
    const impulse = (m) => {
      const inv = 1 / mp + 1 / m, jn = (1 + e) * sp / inv, jt = tl > 1e-3 ? Math.min(0.35 * jn, tl / inv) : 0;
      return [nx * jn - (tl > 1e-3 ? tx / tl * jt : 0), nz * jn - (tl > 1e-3 ? tz / tl * jt : 0)];
    };
    const [Jx, Jz] = impulse(mv);
    // this car: the blow along it slows it (or backs it), across it slides it; its lever arm turns it
    const dvx = Jx / mp, dvz = Jz / mp, along = dvx * s + dvz * c;
    car.speed += along; car.vx += dvx - s * along; car.vz += dvz - c * along;
    const front = s * nx + c * nz; // (-1: hit with its nose, +1: hit from behind)
    // (head on at speed: crumpled to a stop, the harder the faster (14 m/s keeps 45%, 50 a tenth), and held there a
    // moment whatever is pressed)
    if (front < -0.6 && sp > 14) { car.speed *= clamp(6.3 / sp, 0.12, 0.45); if (sp > 20) hold(sp); }
    const { hl } = box(), B = car.body, I = mp * (hl * hl + B.hx * B.hx) / 3;
    const [Rx, Rz] = mv > 4 ? impulse(4) : [Jx, Jz];
    const k = 0.8 * clamp((sp - 2) / 12, 0.15, 1), cap = 2.0 + 1.5 * clamp((sp - 12) / 8, 0, 1);
    let dw = clamp(((hit.z - car.position.z) * Rx - (hit.x - car.position.x) * Rz) / I * k, -cap, cap);
    if (sp < 8 && key) {
      const now = performance.now();
      let g = grind.get(key);
      if (!g || now - g.t > 500) grind.set(key, (g = { t: now, used: 0 }));
      const room = Math.max(0, GRIND - g.used);
      dw = clamp(dw, -room, room); g.used += Math.abs(dw);
    }
    car.angularVel = clamp((car.angularVel || 0) + dw, -3.5, 3.5);
    return { sp, Jx, Jz };
  }
  // another car: apart by the weights, then the blow, each turned by its lever arm; the other knocked off its lane when
  // it was really hit (over 6 m/s: a tap leaves it in its lane)
  const contactCool = new WeakMap();
  function meet(v) {
    const mp = car.mass || 2, mv = v.bus ? 12 : massOf(v);
    const { nx, nz, pen } = hit;
    const R = v.wreck && v._wreck;
    // (apart: a car still in its lane is moved by its lane, so this car takes all of it)
    const share = R ? mv / (mp + mv) : 1;
    car.position.x += nx * pen * share; car.position.z += nz * pen * share;
    if (R) { R.x -= nx * pen * (1 - share); R.z -= nz * pen * (1 - share); v.x = R.x; v.z = R.z; }
    const [ovx, ovz] = wrecks.velOf(v);
    const b = blow(ovx, ovz, mv, v);
    if (!b) return;
    const { sp, Jx, Jz } = b;
    wrecks.push(v, -Jx, -Jz, hit.x, hit.z, sp > 6);
    rock(nx, nz, sp);
    // the feel, once a blow (not every step of a grind): sparks and bits where they touched, a bus's horn and brakes
    const now = performance.now(), last = contactCool.get(v) || 0;
    if (now - last > 250 || sp > 4) {
      contactCool.set(v, now);
      if (sp > 1.5) {
        feel(sp, hit.x, 0.55, hit.z, nx, nz, { paint: v.paint, heavy: Math.min(1, mv / (mp + mv) * 1.8) });
        emit('hit', { kind: 'car', speed: sp, v, x: hit.x, z: hit.z });
      }
      if (v.bus && sp > 3) { play('horn', { pos: [v.x, 1.5, v.z], kind: 'bus', len: 'long', vol: 0.9 }); play('airBrake', { pos: [v.x, 1, v.z], vol: 0.6 }); }
    }
  }
  // a body that isn't one of the city's cars (b: { x, z, vx, vz, mass, paint, key, knock(Jx, Jz) }): this car takes all
  // of the apart (it keeps to its lane, or the mission moves it), then the blow; knock: the other's share of it
  function meetBody(b) {
    const { nx, nz, pen } = hit;
    car.position.x += nx * pen; car.position.z += nz * pen;
    const r = blow(b.vx, b.vz, b.mass, b.key && typeof b.key === 'object' ? b.key : null);
    if (!r) return;
    b.knock?.(-r.Jx, -r.Jz);
    rock(nx, nz, r.sp);
    const now = performance.now(), last = contactCool.get(b.key) || 0;
    if ((now - last > 250 || r.sp > 4) && r.sp > 1.5) {
      contactCool.set(b.key, now);
      feel(r.sp, hit.x, 0.55, hit.z, nx, nz, { paint: b.paint, heavy: Math.min(1, b.mass / ((car.mass || 2) + b.mass) * 1.8) });
      emit('hit', { kind: 'car', speed: r.sp, x: hit.x, z: hit.z, other: b.kind });
    }
  }
  // the shore highways' cars (js/traffic.js createHighwayTraffic): they keep to their lanes; a blow along the lane
  // slows (or shoves on) the one hit
  const HW = app.highwayTraffic && app.highwayTraffic.near ? app.highwayTraffic : null;
  const hwList = [];
  const HB = { x: 0, z: 0, vx: 0, vz: 0, mass: 1.5, paint: null, key: null, kind: 'highway', c: null, knock: null };
  HB.knock = (Jx, Jz) => { const c = HB.c, s = Math.sin(HB.yaw), co = Math.cos(HB.yaw); HW.knock(c, (Jx * s + Jz * co) / HB.mass); };
  // the mission's own vehicles standing in the street (a van at the curb, a wreck, the getaway SUV, the scene's parked
  // cars: wagmi/mission, wagmi/intro.js, found by their names): solid while they stand still a moment and are shown
  // (one the mission drives, moving, is its own: wagmi/mission/m2-drive.js); their box from their meshes, once
  const SOLID = /^wagmi-(suv|van|mack-car|m3-suv|parked)$/;
  const solids = new Map(); // object -> { hw, hl, cx, cz, x, z, still, t }
  let solidScan = 0;
  const _bb = new THREE.Box3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
  function localBox(o) {
    o.updateWorldMatrix(true, true); _inv.copy(o.matrixWorld).invert();
    const bb = new THREE.Box3();
    o.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      bb.union(_bb.copy(m.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(_inv, m.matrixWorld)));
    });
    if (bb.isEmpty()) return null;
    const sc = o.getWorldScale(new THREE.Vector3());
    return { hw: (bb.max.x - bb.min.x) / 2 * sc.x, hl: (bb.max.z - bb.min.z) / 2 * sc.z, cx: (bb.max.x + bb.min.x) / 2 * sc.x, cz: (bb.max.z + bb.min.z) / 2 * sc.z };
  }
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function scanSolids(dt) {
    if ((solidScan -= dt) <= 0) {
      solidScan = 1;
      const look = (o, depth) => { for (const k of o.children) { if (SOLID.test(k.name) && !solids.has(k)) solids.set(k, null); else if (depth < 2 && k.children.length && !k.isMesh) look(k, depth + 1); } };
      look(app.scene, 0);
    }
    for (const [o, s0] of solids) {
      if (!o.parent) { solids.delete(o); continue; }
      let s = s0;
      if (!s) { const b = localBox(o); if (!b) continue; s = { ...b, x: 0, z: 0, yaw: 0, still: 0, on: false }; solids.set(o, s); }
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements, yaw = Math.atan2(e[8], e[10]), cs = Math.cos(yaw), sn = Math.sin(yaw);
      const x = e[12] + s.cx * cs + s.cz * sn, z = e[14] - s.cx * sn + s.cz * cs;
      const moved = Math.hypot(x - s.x, z - s.z);
      s.still = moved < Math.max(0.02, dt * 0.4) ? s.still + dt : 0;
      Object.assign(s, { x, z, yaw, on: shown(o) && s.still > 1.5 });
    }
  }
  // every body near (x, z) a car may run into, but this one (for wagmi/game.js recoverCar: a clear spot): the city's
  // cars and buses, the highways', the mission's standing vehicles; [x, z, yaw, half width, half length]
  api.bodies = (x, z, r = 12) => {
    const out = [];
    if (wrecks) for (const v of wrecks.vehicles) {
      if (!v.edge || Math.abs(v.x - x) > r || Math.abs(v.z - z) > r) continue;
      const [hw, vl] = dims(v); out.push([v.x, v.z, v.wreck && v._wreck ? v._wreck.yaw : v.yaw + v.yawOffset, hw, vl]);
    }
    if (HW) for (const p of HW.near(x, z, r, [])) out.push([p.x, p.z, p.yaw, p.hw, p.hl]);
    for (const s of solids.values()) if (s && s.on && Math.abs(s.x - x) < r && Math.abs(s.z - z) < r) out.push([s.x, s.z, s.yaw, s.hw, s.hl]);
    return out;
  };
  // the street furniture: the car as a mover (props.js)
  const PM = { x: 0, z: 0, yaw: 0, hw: 1, hl: 2, vx: 0, vz: 0, mass: 2, onSolid: null, onBreak: null };
  PM.onSolid = (nx, nz, pen, b, vi, h) => {
    const s = Math.sin(car.heading), c = Math.cos(car.heading), cz = box().cz;
    car.position.x = PM.x - s * cz; car.position.z = PM.z - c * cz;
    const vn = bounce(nx, nz);
    if (vn > 1.5) {
      // (where they touched: a box's nearest point (the stairs, the granite), a round thing's side facing the car)
      const hx = b.w ? h.x : b.x + nx * b.r, hz = b.w ? h.z : b.z + nz * b.r;
      feel(vn, hx, b.kind === 'tree' ? 0.9 : b.w ? 0.45 : 0.6, hz, nx, nz, { glass: vn > 11 });
      if (/^(mast|cobra|post|lamp|hydrant)$/.test(b.kind)) play('clang', { pos: [b.x, 1, b.z], vol: clamp(vn / 10, 0.3, 1), rate: 0.7 });
      emit('hit', { kind: 'prop', solid: true, speed: vn, b });
    }
  };
  PM.onBreak = (b, vi, loss, nx, nz) => {
    const s = Math.sin(car.heading), c = Math.cos(car.heading);
    const k = Math.abs(s * nx + c * nz);
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), loss * (0.5 + 0.5 * k));
    car.angularVel = (car.angularVel || 0) + (c * nx - s * nz) * Math.min(1.2, loss * 0.12) * (Math.random() < 0.5 ? 1 : -1);
    const big = props.KINDS[b.kind].mass;
    rock(nx, nz, Math.min(8, vi * big * 2));
    api.jolt(clamp(vi / 30, 0.05, 0.5) * Math.min(1, big * 3), -nx, -nz);
    if (big >= 0.2 && vi > 8) fx.bits(b.x, 0.7, b.z, s * car.speed * 0.4, c * car.speed * 0.4, Math.round(vi * 0.3), 'plastic');
    emit('hit', { kind: 'prop', speed: vi, b });
  };
  // stopped dead: for a moment (longer the harder) the car can't pick its speed back up past what the hit left it
  const held = { until: 0, cap: 0 };
  function hold(sp) { held.until = performance.now() + clamp(sp * 11, 250, 650); held.cap = Math.abs(car.speed); }
  // after each of the controllers' half-metre steps: the city's cars and buses, then the street furniture
  function step() {
    if (cm.activeMode !== 'car' || car.mesh?.visible === false) return;
    if (held.until && performance.now() < held.until && Math.abs(car.speed) > held.cap) car.speed = Math.sign(car.speed) * held.cap;
    const B = car.body, { hl, cz } = box();
    const s = Math.sin(car.heading), c = Math.cos(car.heading);
    if (wrecks) for (const v of wrecks.vehicles) {
      if (!v.edge) continue;
      const x = car.position.x + s * cz, z = car.position.z + c * cz;
      if (Math.abs(v.x - x) > 10 || Math.abs(v.z - z) > 10) continue;
      const [hw, vl] = dims(v), yaw = v.wreck && v._wreck ? v._wreck.yaw : v.yaw + v.yawOffset;
      if (boxes(x, z, car.heading, B.hx, hl, v.x, v.z, yaw, hw, vl, hit)) meet(v);
    }
    // the highways' cars (above the gap under it when it hops, as the thrusters' hop filters the city's)
    const air = W.thrusters?.air || 0;
    if (HW) {
      const x = car.position.x + s * cz, z = car.position.z + c * cz;
      for (const p of HW.near(x, z, 10, hwList)) {
        if (air > (p.c.kind === 'suv' ? 1.76 : 1.45) * 0.9) continue;
        if (!boxes(x, z, car.heading, B.hx, hl, p.x, p.z, p.yaw, p.hw, p.hl, hit)) continue;
        Object.assign(HB, { x: p.x, z: p.z, yaw: p.yaw, vx: Math.sin(p.yaw) * p.c.v, vz: Math.cos(p.yaw) * p.c.v, c: p.c, key: p.c, paint: p.c.col });
        meetBody(HB);
      }
    }
    // the mission's vehicles standing in the street
    for (const [o, sd] of solids) {
      if (!sd || !sd.on || air > 1.4) continue;
      const x = car.position.x + s * cz, z = car.position.z + c * cz;
      if (Math.abs(sd.x - x) > 10 || Math.abs(sd.z - z) > 10) continue;
      if (boxes(x, z, car.heading, B.hx, hl, sd.x, sd.z, sd.yaw, sd.hw, sd.hl, hit)) meetBody({ vx: 0, vz: 0, mass: 1e4, key: o, kind: o.name, paint: null });
    }
    Object.assign(PM, { x: car.position.x + s * cz, z: car.position.z + c * cz, yaw: car.heading, hw: B.hx, hl, vx: s * car.speed + car.vx, vz: c * car.speed + car.vz, mass: car.mass || 2 });
    props.collide(PM);
  }
  car.crash = { step: (d) => { const t0 = performance.now(); step(d); api.cost.ms += performance.now() - t0; }, wall };

  /* -------------------------------------------------------- every frame -- */
  // the controllers and the traffic on the crash's clock (slow motion), the camera on the real one; the bits, the
  // furniture and the wrecks with the traffic
  const cmUpdate = cm.update.bind(cm);
  cm.update = function (dt, el) { return cmUpdate(dt * timeScale(), el); };
  if (TS) {
    const tsUpdate = TS.update;
    TS.update = function (dt, ...rest) {
      const d = dt * timeScale(), t0 = performance.now();
      try { wrecks.frame(d); } catch (err) { console.error('[crash] wrecks', err); }
      api.cost.ms += performance.now() - t0;
      const r = tsUpdate.call(this, d, ...rest);
      const t1 = performance.now();
      try { frame(d); } catch (err) { console.error('[crash]', err); }
      api.cost.ms += performance.now() - t1; api.cost.frames++;
      return r;
    };
  }
  let trail = 0;
  function frame(dt) {
    cool.sound -= dt; cool.fence -= dt;
    scanSolids(dt);
    // the hardest wall hit this frame, felt; scraping along one at speed, a trail of sparks
    if (wallHit.vn > 0) {
      const w = wallHit;
      if (w.vn > 1.5) {
        feel(w.vn, w.x, 0.6, w.z, w.nx, w.nz, { glass: w.vn > 12 && w.headOn > 0.5 });
        // (a park's iron fence: the railings ring under the crunch, and spark even on a soft bump)
        if (w.fence) {
          if (w.vn > 1.5 && cool.fence <= 0) { play('clang', { pos: [w.x, 0.8, w.z], vol: clamp(w.vn / 9, 0.3, 1), rate: 1.6 + Math.random() * 0.3 }); cool.fence = 0.12; }
          fx.spark(w.x, 0.7, w.z, -w.nz, w.nx, Math.round(clamp(w.vn * 1.5, 6, 30)), 4 + w.vn * 0.3);
        }
        emit('hit', { kind: 'wall', speed: w.vn, headOn: w.headOn, fence: w.fence });
      }
      if (Math.abs(car.speed) > (w.fence ? 3 : 7)) {
        trail += dt * Math.abs(car.speed) * 3; const n = Math.floor(trail); trail -= n;
        if (n) fx.spark(w.x, w.fence ? 0.7 : 0.45, w.z, -Math.sin(car.heading), -Math.cos(car.heading), n, 6);
        // (scraping along the railings: their rattle, now and then)
        if (w.fence && cool.fence <= 0) { play('clang', { pos: [w.x, 0.8, w.z], vol: clamp(Math.abs(car.speed) / 20, 0.15, 0.5), rate: 1.9 + Math.random() * 0.4 }); cool.fence = 0.16; }
      }
      w.vn = 0;
    }
    props.update(dt, cam.position);
    fx.update(dt);
  }
  const csUpdate = cs.update;
  cs.update = function (dt, el) {
    const r = csUpdate.call(this, dt, el);
    // the jolt: a spring back from the push, and a shake dying away
    const k = Math.min(dt, 1 / 30);
    J.vel.addScaledVector(J.off, -170 * k).multiplyScalar(Math.exp(-13 * k)); J.off.addScaledVector(J.vel, k);
    J.shake = Math.max(0, J.shake - dt * 2.6); J.t += dt;
    if (J.off.lengthSq() > 1e-7) cam.position.add(J.off);
    if (J.shake > 0.003) {
      const a = J.shake * J.shake * 0.22, t = J.t * 57;
      cam.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.9)) * 0.5 * a; cam.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.3)) * 0.5 * a;
      cam.rotateZ((Math.sin(t * 1.9 + 2) + Math.sin(t * 0.7)) * 0.5 * a * 0.12);
    }
    return r;
  };
  console.log(`[crash] in: ${props.list.length} things in the street, ${wrecks ? wrecks.vehicles.length : 0} vehicles`);
}
