// Mog City: Mission 2's scripted vehicles: the JPBank Security van Dan tails and Mack's car he chases. Each drives
// an authored route (a smooth curve through [x, z] points, sampled by distance) at a speed the mission asks for, and
// lives in the city's traffic:
//   - it brakes for what is ahead of it on its way (the traffic's cars and buses, Dan's car), IDM style, unless it
//     plows (Mack: he shoves the cars he hits out of his way, the traffic's own knock physics, and loses a little speed);
//   - the traffic's cars that come up behind it in its lane are held back behind it (they can't see it);
//   - Dan's car and it are solid to each other (a box each): Dan's car is pushed off it and thrown with the impact;
//     onHit(approach speed, contact) tells the mission (a ram).
//   const D = createDriver(W, { obj, path, halfW, halfL, plow, onWheels(dt, v, steer), onHit(sp, at) });
//   D.step(dt, want) (every frame; want: the speed it wants, m/s) · D.place(s) · D.s / D.v / D.pos / D.heading / D.done
import * as THREE from 'three/webgpu';
import { spline, clamp } from './cine.js';

// Dan's car's box, read off car.body (wagmi/game.js, measured off the model) when it is used: its half width, half
// length, and the offset of its middle along it (with a fallback before the body is measured)
const pbox = (car) => { const B = car.body; return B ? { hx: B.hx, hl: (B.z1 - B.z0) / 2, cz: (B.z1 + B.z0) / 2 } : { hx: 1.08, hl: 2.4, cz: 0 }; };

export function createDriver(W, { obj, path, halfW = 1.0, halfL = 2.8, plow = false, onWheels = null, onHit = null, accel = 3.2, brake = 7, stopAtEnd = true }) {
  const app = W.app, cm = app.controllerManager, car = W.car, TS = app.trafficSystem;
  const S = spline(path);
  const D = {
    s: 0, v: 0, done: false, pos: new THREE.Vector3(), heading: 0, steer: 0, yawRate: 0, lean: 0, pitch: 0,
    get length() { return S.length; },
    // ahead: the gap to what it is braking for (m), and that thing's speed
    gap: Infinity, hits: 0, stuckT: 0, pushT: 0, idleT: 0,
    place(s = 0) { D.s = clamp(s, 0, S.length); D.v = 0; D.done = false; pose(0); },
    at(s) { return S.at(s); },
    step,
  };
  const fwd = () => [Math.sin(D.heading), Math.cos(D.heading)];
  // what is in its way: the nearest thing ahead in a corridor along its heading (lateral within both half widths)
  function obstacle() {
    const [fx, fz] = fwd(), look = 10 + D.v * 2.2;
    let best = Infinity, bv = 0;
    const test = (x, z, hw, hl, vx, vz) => {
      const dx = x - D.pos.x, dz = z - D.pos.z, ahead = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
      if (ahead <= 0 || ahead > look + halfL + hl || lat > halfW + hw + 0.5) return;
      const gap = ahead - halfL - hl;
      if (gap < best) { best = gap; bv = vx * fx + vz * fz; }
    };
    // (pushing through a jam: nothing ahead counts but Dan's car)
    const jam = D.pushT > 0;
    if (!plow && !jam) for (const v of TS.cars || []) if (v.edge) test(v.x, v.z, v.halfWidth || 0.9, v.half || 2.2, (v.tx || 0) * (v.speed || 0), (v.tz || 0) * (v.speed || 0));
    if (!plow && !jam) for (const v of TS.buses || []) if (v.edge) test(v.x, v.z, v.halfWidth || 1.3, v.half || 5.7, (v.tx || 0) * (v.speed || 0), (v.tz || 0) * (v.speed || 0));
    // (Dan's car: braked for unless it plows; on foot he is no obstacle (a van stopping for him would give it away))
    if (!plow && cm.activeMode === 'car') {
      const Q = pbox(car), sh = Math.sin(car.heading), ch = Math.cos(car.heading);
      test(car.position.x + sh * Q.cz, car.position.z + ch * Q.cz, Q.hx, Q.hl, sh * car.speed, ch * car.speed);
    }
    D.gap = best;
    return [best, bv];
  }
  // the traffic behind it in its lane, held back (they follow only each other and the player)
  function holdFollowers() {
    const [fx, fz] = fwd();
    for (const v of TS.cars || []) {
      if (!v.edge) continue;
      const dx = v.x - D.pos.x, dz = v.z - D.pos.z, behind = -(dx * fx + dz * fz), lat = Math.abs(dx * fz - dz * fx);
      if (behind <= 0 || behind > 30 || lat > halfW + 1.2) continue;
      if ((v.tx || 0) * fx + (v.tz || 0) * fz < 0.6) continue; // (going its own way: crossing, or the other way)
      const gap = behind - halfL - (v.half || 2.2);
      if (gap < 4 + D.v * 0.8) v.speed = Math.min(v.speed, Math.max(0, D.v * (gap < 2 ? 0.6 : 0.95)));
      if (gap < 0.3) { v.vx = (v.vx || 0) - fx * 1.5; v.vz = (v.vz || 0) - fz * 1.5; }
    }
  }
  // Mack plowing on: a car of the traffic he runs into is knocked aside (its own knock physics: vx, vz, a spin), mostly
  // sideways out of his way, however slowly he comes on (a queue at a light is shouldered through, not a wall); each
  // car slows him once a contact, not every frame of it
  const hitAt = new WeakMap();
  function shoveTraffic(k0 = 1) {
    const [fx, fz] = fwd(), now = performance.now();
    for (const v of [...(TS.cars || []), ...(TS.buses || [])]) {
      if (!v.edge) continue;
      const dx = v.x - D.pos.x, dz = v.z - D.pos.z;
      if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
      const ahead = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (Math.abs(ahead) > halfL + (v.half || 2.2) * 0.85 || Math.abs(lat) > halfW + (v.halfWidth || 0.9) + 0.2) continue;
      const d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
      const rel = D.v * (fx * nx + fz * nz) - ((v.tx || 0) * nx + (v.tz || 0) * nz) * (v.speed || 0);
      const push = Math.max(rel, 3.5), side = Math.sign(lat || 0.1), k = (v.bus ? 0.35 : 0.75) * k0;
      v.vx = (v.vx || 0) + (nx * push * 0.35 + side * fz * push * 0.8) * k;
      v.vz = (v.vz || 0) + (nz * push * 0.35 - side * fx * push * 0.8) * k;
      v.speed = (v.speed || 0) * 0.5;
      const fresh = now - (hitAt.get(v) || 0) > 700; hitAt.set(v, now);
      if (!fresh) continue;
      if (!v.bus) { v.yawVel = (v.yawVel || 0) + side * Math.min(3, push * 0.25); v.rollVel = (v.rollVel || 0) + side * Math.min(6, push) * 0.2; }
      D.hits++;
      if (k0 < 1) continue;
      D.v *= v.bus ? 0.7 : 0.9;
      if (rel > 2) W.audio?.play?.('carHit', { pos: [v.x, 0.6, v.z], vol: clamp(rel / 14, 0.25, 1) });
      if (rel > 7) W.audio?.play?.('glass', { pos: [v.x, 0.8, v.z], vol: 0.5 });
    }
  }
  // Dan's car against it: two boxes; his pushed out of it along the shallowest axis, and thrown by the closing speed
  const _ax = [[0, 0], [0, 0], [0, 0], [0, 0]];
  function collidePlayer() {
    const driving = cm.activeMode === 'car';
    if (!driving && !car.mesh?.visible) return;
    const Q = pbox(car), px = car.position.x + Math.sin(car.heading) * Q.cz, pz = car.position.z + Math.cos(car.heading) * Q.cz;
    if (Math.abs(px - D.pos.x) > 9 || Math.abs(pz - D.pos.z) > 9) return;
    const ah = D.heading, bh = car.heading;
    const A = { x: D.pos.x, z: D.pos.z, f: [Math.sin(ah), Math.cos(ah)], r: [Math.cos(ah), -Math.sin(ah)], hw: halfW, hl: halfL };
    const B = { x: px, z: pz, f: [Math.sin(bh), Math.cos(bh)], r: [Math.cos(bh), -Math.sin(bh)], hw: Q.hx, hl: Q.hl };
    _ax[0] = A.f; _ax[1] = A.r; _ax[2] = B.f; _ax[3] = B.r;
    const dx = B.x - A.x, dz = B.z - A.z;
    let pen = Infinity, nx = 0, nz = 0;
    for (const [ax, az] of _ax) {
      const ra = A.hw * Math.abs(A.r[0] * ax + A.r[1] * az) + A.hl * Math.abs(A.f[0] * ax + A.f[1] * az);
      const rb = B.hw * Math.abs(B.r[0] * ax + B.r[1] * az) + B.hl * Math.abs(B.f[0] * ax + B.f[1] * az);
      const c = dx * ax + dz * az, o = ra + rb - Math.abs(c);
      if (o <= 0) return;
      if (o < pen) { pen = o; const s = c < 0 ? -1 : 1; nx = ax * s; nz = az * s; }
    }
    // (out along n, from it toward his car; parked, it is just shoved)
    car.position.x += nx * pen; car.position.z += nz * pen; car.mesh.position.copy(car.position);
    if (!driving) { D.v *= 0.97; return; }
    const vbx = Math.sin(bh) * car.speed + (car.vx || 0), vbz = Math.cos(bh) * car.speed + (car.vz || 0);
    const vax = A.f[0] * D.v, vaz = A.f[1] * D.v;
    const approach = (vax - vbx) * nx + (vaz - vbz) * nz;
    if (approach <= 0.3) return;
    const head = Math.abs(B.f[0] * nx + B.f[1] * nz);
    car.speed *= 1 - 0.55 * head;
    car.vx = (car.vx || 0) + nx * approach * 0.75; car.vz = (car.vz || 0) + nz * approach * 0.75;
    // (a spin from where it struck him, his body kicked on its springs)
    const cx = (A.x + B.x) / 2 - B.x, cz = (A.z + B.z) / 2 - B.z, lx = cx * B.r[0] + cz * B.r[1], lz = cx * B.f[0] + cz * B.f[1];
    const nlx = nx * B.r[0] + nz * B.r[1], nlz = nx * B.f[0] + nz * B.f[1];
    car.angularVel = (car.angularVel || 0) + (lz * nlx - lx * nlz) * Math.min(2.5, approach * 0.15);
    car.pitchVel = (car.pitchVel || 0) + nlz * Math.min(12, approach) * 0.18;
    car.rollVel = (car.rollVel || 0) - nlx * Math.min(12, approach) * 0.24;
    car.heaveVel = (car.heaveVel || 0) + Math.min(1.4, approach * 0.11);
    // (it gives a little too: slowed, and a wobble)
    D.v = Math.max(0, D.v - approach * (plow ? 0.12 : 0.05));
    D.lean += Math.sign(-(nx * A.r[0] + nz * A.r[1]) || 1) * Math.min(0.12, approach * 0.008);
    onHit?.(approach, { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 });
  }
  function pose(dt) {
    const p = S.at(D.s), h0 = D.heading;
    D.pos.set(p.x, cm.getGroundHeight(p.x, p.z, 'car'), p.z); D.heading = p.h;
    if (dt > 0) {
      let dh = p.h - h0; dh -= Math.round(dh / (Math.PI * 2)) * Math.PI * 2;
      D.yawRate += (dh / dt - D.yawRate) * Math.min(1, dt * 8);
      D.steer += (clamp(Math.atan(3.4 * D.yawRate / Math.max(D.v, 0.5)), -0.6, 0.6) - D.steer) * Math.min(1, dt * 10);
    }
    // the body: rolled out of a turn, pitched by braking and speeding up
    D.lean += (clamp(-D.yawRate * D.v * 0.012, -0.07, 0.07) - D.lean) * Math.min(1, dt * 5);
    obj.position.copy(D.pos); obj.rotation.set(D.pitch, D.heading, D.lean, 'YXZ');
    onWheels?.(dt, D.v, D.steer);
  }
  let lastV = 0;
  function step(dt, want) {
    if (dt <= 0) return;
    let target = Math.max(0, want);
    // (the end of the route: slowing to a stop on it)
    const left = S.length - D.s; if (stopAtEnd && left < 40) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 3.5 * (left - 0.5))));
    // (the bends: slow enough for them, looking ahead by its stopping distance)
    for (let k = 6; k <= 30 + D.v * 1.5; k += 6) { const c = Math.abs(S.at(Math.min(S.length, D.s + k)).k); if (c > 0.002) target = Math.min(target, Math.sqrt(4.2 / c) + k * 0.12); }
    const [gap, bv] = obstacle();
    let a;
    if (gap < Infinity) {
      // IDM against what is ahead
      const s0 = 3, T = 1.0, dv = D.v - bv, sStar = s0 + Math.max(0, D.v * T + D.v * dv / (2 * Math.sqrt(accel * brake)));
      a = accel * (1 - Math.pow(D.v / Math.max(1, target), 4) - Math.pow(sStar / Math.max(0.1, gap), 2));
    } else a = target > D.v ? accel * (1 - Math.pow(D.v / Math.max(1, target), 4)) : -Math.min(brake, (D.v - target) * 2.5);
    D.v = clamp(D.v + clamp(a, -brake * 1.4, accel * 1.5) * dt, 0, 60);
    if (gap < 0.2 && !plow) D.v = Math.min(D.v, bv);
    D.s = Math.min(S.length, D.s + D.v * dt);
    D.done = D.s >= S.length - 0.5 && (D.v < 0.3 || !stopAtEnd);
    const acc = (D.v - lastV) / dt; lastV = D.v;
    // (rotation.x > 0 dips the nose: braking)
    D.pitch += (clamp(-acc * 0.006, -0.04, 0.05) - D.pitch) * Math.min(1, dt * 6);
    pose(dt);
    // (held up behind the traffic a moment, stopped or crawling at under half its pace: a horn, then it noses through,
    // shoving what is in its way)
    if (!plow) {
      if (want > 2 && gap < 14 && D.v < Math.max(0.6, target * 0.45)) D.stuckT += dt; else D.stuckT = Math.max(0, D.stuckT - dt * 2);
      if (D.stuckT > 1.2 && !D.honked) { D.honked = true; W.audio?.play?.('horn', { pos: [D.pos.x, 1, D.pos.z] }); }
      if (D.stuckT > 2.4) { D.pushT = 3; D.stuckT = 0; D.honked = false; }
      if (D.pushT > 0) { D.pushT -= dt; shoveTraffic(0.35); }
    }
    // (and whatever holds it, it never sits still for long: 5 s without moving while it wants to go, and it goes on
    // through the traffic regardless)
    D.idleT = want > 2 && !D.done && D.v < 0.3 ? D.idleT + dt : 0;
    if (D.idleT > 5) { D.idleT = 0; D.pushT = Math.max(D.pushT, 4); }
    if (plow) shoveTraffic(); else holdFollowers();
    collidePlayer();
  }
  pose(0);
  return D;
}
