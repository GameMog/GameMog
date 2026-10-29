// Mog City: the city's cars knocked out of their lanes (js/traffic.js v.wreck). Hit hard, a car is taken off its lane
// and moved here as a body on the ground: it slides (its tyres scrubbing sideways far harder than rolling on), spins down,
// rocks on its springs and stops; it bounces off the buildings and the others, shoving and wrecking those it hits hard
// enough (a pile-up), and knocks the street furniture over. Its driver leans on the horn. Stopped a while, square enough
// to its lane and with Dan's car not in its way, it is handed back (traffic.unwreck) and the driver pulls away; turned round or up on the sidewalk, it
// stays until it is out of view.
// With Jolt loaded (wagmi/physics: from the first crash on), a wreck is a rigid body there instead: the blow is a real
// impulse where it landed (a hard one off the side tips it, a huge one rolls it over), it slides and spins on its own
// friction, bounces off the buildings and the other wrecks, rides up the curb, settles on its wheels, its side or its
// roof. Upright and still it is handed back to its lane as before; on its side or its roof it stays a wreck until it
// is out of view. The city's cars still in their lanes, the street furniture and Dan's car meet it as before.
import * as THREE from 'three/webgpu';

const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
// (by the city's body kinds, js/traffic.js CAR_KINDS: the modern fleet, after Slop New York 52f84db, adds minivans,
// pickups and delivery vans, heavier, with the SUV's deeper horn)
const MASS = { sedan: 1.4, taxi: 1.5, suv: 2.1, minivan: 2.0, pickup: 2.4, van: 2.7 };
export const massOf = (v) => (v.bus ? 12 : MASS[v.bodyType] ?? (v.isSUV ? 2.1 : v.isTaxi ? 1.5 : 1.4));
export const dims = (v) => [v.bodyW ?? (v.bus ? 1.3 : v.halfWidth), v.bodyL ?? (v.bus ? 5.72 : v.isSUV ? 2.22 : 2.18)];
const BIG = { suv: 1, minivan: 1, pickup: 1, van: 1 };
export const hornKind = (v) => (v.bus ? 'bus' : v.isTaxi ? 'taxi' : v.isSUV || BIG[v.bodyType] ? 'suv' : 'sedan');

// two boxes on the ground (middle, yaw, half width across, half length along): their least overlap and its axis,
// pointing from b to a (out.nx, out.nz, out.pen), or false
const AX = new Float64Array(8);
export function boxes(ax, az, ay, aw, al, bx, bz, by, bw, bl, out) {
  const ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(by), sb = Math.sin(by);
  AX[0] = ca; AX[1] = -sa; AX[2] = sa; AX[3] = ca; AX[4] = cb; AX[5] = -sb; AX[6] = sb; AX[7] = cb;
  const dx = ax - bx, dz = az - bz;
  let pen = Infinity;
  for (let k = 0; k < 8; k += 2) {
    const nx = AX[k], nz = AX[k + 1];
    const ra = aw * Math.abs(nx * ca - nz * sa) + al * Math.abs(nx * sa + nz * ca);
    const rb = bw * Math.abs(nx * cb - nz * sb) + bl * Math.abs(nx * sb + nz * cb);
    const d = dx * nx + dz * nz, p = ra + rb - Math.abs(d);
    if (p <= 0) return false;
    if (p < pen) { pen = p; out.nx = d >= 0 ? nx : -nx; out.nz = d >= 0 ? nz : -nz; }
  }
  out.pen = pen;
  // (where they touch: halfway between each one's nearest point to the other's middle)
  near(ax, az, bx, bz, by, bw, bl, _p); const px = _p.x, pz = _p.z;
  near(bx, bz, ax, az, ay, aw, al, _p);
  out.x = (px + _p.x) * 0.5; out.z = (pz + _p.z) * 0.5;
  return true;
}
const _p = { x: 0, z: 0 };
// the point of box b nearest (px, pz)
function near(px, pz, bx, bz, by, bw, bl, out) {
  const c = Math.cos(by), s = Math.sin(by), dx = px - bx, dz = pz - bz;
  const lx = Math.max(-bw, Math.min(bw, dx * c - dz * s)), lz = Math.max(-bl, Math.min(bl, dx * s + dz * c));
  out.x = bx + lx * c + lz * s; out.z = bz - lx * s + lz * c;
  return out;
}

export function createWrecks({ TS, cm, fx, play, props, camera, physics: PH = null }) {
  const vehicles = [...(TS.cars || []), ...(TS.buses || [])];
  const live = new Set();
  const stats = { taken: 0, square: 0, backed: 0, away: 0, backing: 0, waiting: 0, inWay: 0 }; // (handed back how, for a test)
  const frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _s = new THREE.Sphere();
  let clock = 0;
  const seen = (x, z) => { _s.center.set(x, 0.8, z); _s.radius = 3; return frustum.intersectsSphere(_s); };
  const hit = { nx: 0, nz: 0, pen: 0, x: 0, z: 0 };
  // (for the city's own wall test: a stand-in car entity, its body this vehicle's)
  const proxy = { heading: 0, speed: 0, vx: 0, vz: 0, angularVel: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, body: { hx: 1, z0: -2, z1: 2 } };
  const _pos = new THREE.Vector3();

  // take v off its lane, going (vx, vz) and turning w (rad/s, + to the left); pitch / roll kicks for its springs
  function take(v, vx, vz, w, kick = 0) {
    if (v.bus) return null;
    PH?.want();
    let R = v._wreck;
    if (!R || !v.wreck) {
      R = v._wreck = { v, x: v.x, z: v.z, yaw: v.yaw + v.yawOffset, laneYaw: v.yaw, vx: 0, vz: 0, w: 0, still: 0, t: 0, honk: rnd(0.35, 0.8), honks: 0 };
      // (rolling on as it was going when hit)
      R.vx = v.tx * v.speed + (v.vx || 0); R.vz = v.tz * v.speed + (v.vz || 0);
      v.vx = v.vz = 0; v.speed = 0; v.yawOffset = 0; v.yawVel = 0;
      v.wreck = step;
      live.add(R); stats.taken++;
    }
    R.vx = vx; R.vz = vz; R.w = Math.max(-6, Math.min(6, w)); R.still = 0;
    v.pitchVel += kick * rnd(-0.6, 0.2); v.rollVel += kick * rnd(-1, 1);
    return R;
  }
  // a push on a vehicle (impulse jx, jz at the point px, pz): on a wreck, into its slide and spin; on one still in its
  // lane, a wreck when hard enough (ok: allowed to), else the lane's own knock
  function push(v, jx, jz, px, pz, wreckIt) {
    const m = massOf(v), [hw, hl] = dims(v), I = m * (hl * hl + hw * hw) / 3;
    // (a tap or a car leaning on it mostly shoves it; a big blow spins it: the turn scaled by the speed it gave, full at 12 m/s)
    const dv = Math.hypot(jx, jz) / m, tq = ((pz - v.z) * jx - (px - v.x) * jz) / I * (0.3 + 0.7 * Math.min(1, dv / 12));
    if (v.wreck && v._wreck) {
      const R = v._wreck; R.still = 0;
      if (R.jb && !R.jb.frozen) { blowJ(R, v, jx, jz, px, pz, m, dv); return R; }
      R.vx += jx / m; R.vz += jz / m; R.w += tq; return R;
    }
    // (the speed the blow gives it along its lane, + ahead, and across it)
    const al = (jx * v.tx + jz * v.tz) / m, ac = Math.abs(jx * v.tz - jz * v.tx) / m;
    // (a bump from behind only shoves it on: a wreck from there takes a real rear-ending, 4.5 m/s given, ~7 closing; a
    // brush along its side or a nudge on its nose leaves it in its lane too: a wreck takes 2.5 m/s across it, or 1.5 back)
    if (wreckIt && !v.bus && (ac > 2.5 || al < -1.5 || al > 4.5)) {
      const R = take(v, v.tx * v.speed + v.vx + jx / m, v.tz * v.speed + v.vz + jz / m, tq * 1.2, dv);
      // (in Jolt: the body made now, the blow its impulse where it landed)
      if (R && PH && PH.ready && PH.inside(R.x, R.z, 6)) { R.vx -= jx / m; R.vz -= jz / m; R.w -= tq * 1.2; promote(R, v); blowJ(R, v, jx, jz, px, pz, m, dv); }
      return R;
    }
    // (along its lane the blow is its speed: shoved from behind it is carried on, up to its own pace, never slowed; hit
    // from ahead it loses what the blow took; across, the lane's knock, and its driver brakes only on a real side blow)
    v.vx += jx / m - v.tx * al; v.vz += jz / m - v.tz * al;
    v.speed = al > 0 ? Math.max(v.speed, Math.min(v.speed + al, v.v0)) : Math.max(0, v.speed + al);
    if (ac > 1.5) v.speed *= v.bus ? 0.6 : 0.4;
    v.yawVel += tq * 0.5;
    return null;
  }
  function velOf(v) { const R = v.wreck && v._wreck; return R ? [R.vx, R.vz] : [v.tx * v.speed + (v.vx || 0), v.tz * v.speed + (v.vz || 0)]; }

  // ------------------------------------------------------------------ in Jolt
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _lv = new THREE.Vector3(), _av = new THREE.Vector3(), _up = new THREE.Vector3();
  const roofOf = (v) => (v.bus ? 3 : v.isSUV || BIG[v.bodyType] ? 1.78 : 1.46);
  function promote(R, v) {
    const [hw, hl] = dims(v), m = massOf(v);
    _q.setFromEuler(_e.set(v.pitch || 0, R.yaw, v.roll || 0, 'YXZ'));
    const y = Math.max(cm.getGroundHeight(R.x, R.z, 'person'), v.py || 0);
    R.jb = PH.addCar(_lv.set(R.x, y, R.z), _q, hw, hl, roofOf(v), { mass: m * 1000, friction: 0.62, restitution: 0.15, damp: 0.08, angDamp: 0.25, v: { x: R.vx, y: 0, z: R.vz }, w: { x: 0, y: R.w, z: 0 }, ccd: true });
    R.jb.kind = 'wreck'; R.jb.v = v;
    v.posed = true; stats.jolt = (stats.jolt || 0) + 1;
  }
  // a blow (tonne m/s, the crash's units) on a wreck in Jolt: an impulse where it landed, at bumper height; a hard one
  // across it tips it (the tyres hold its feet, the top goes on), a huge one rolls it
  function blowJ(R, v, jx, jz, px, pz, m, dv) {
    const B = R.jb, y = B.p.y || 0;
    PH.impulse(B, jx * 1000, 0, jz * 1000, px, y + 0.55, pz);
    const yaw = R.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw), dl = Math.hypot(jx, jz) || 1;
    const lat = (jx * rx + jz * rz) / dl;
    if (dv > 7 && Math.abs(lat) > 0.35) {
      const k = Math.min(1, (dv - 7) / 14) * Math.abs(lat), sg = Math.sign(lat);
      PH.vel(B, _lv); PH.angVel(B, _av);
      // (the roll's axis: up crossed with the way it is shoved across; the lift that goes with it)
      const ux = rx * sg, uz = rz * sg, spin = k * (dv > 16 ? 5.5 : 2.6) * (0.8 + Math.random() * 0.4);
      _av.x += uz * spin; _av.z += -ux * spin; _lv.y += k * (dv > 16 ? 3.2 : 1.4);
      PH.setVel(B, _lv, _av);
    }
  }
  // its pose from Jolt into the wreck and the traffic's car (pose: c.py, pitch, roll)
  function readJ(R, v) {
    const B = R.jb;
    if (!B.frozen) PH.read(B);
    _e.setFromQuaternion(B.q, 'YXZ');
    R.x = B.p.x; R.z = B.p.z; R.yaw = _e.y;
    if (!B.frozen) { PH.vel(B, _lv); PH.angVel(B, _av); R.vx = _lv.x; R.vz = _lv.z; R.vy = _lv.y; R.w = _av.y; R.wl = _av.length(); }
    else { R.vx = R.vz = R.vy = R.w = R.wl = 0; }
    _up.set(0, 1, 0).applyQuaternion(B.q); R.upY = _up.y;
    v.x = R.x; v.z = R.z; v.yaw = R.yaw; v.yawOffset = 0; v.pitch = _e.x; v.roll = _e.z; v.py = B.p.y; v.posed = true;
    v.tx = Math.sin(R.yaw); v.tz = Math.cos(R.yaw);
  }
  function stepJ(v, dt, R) {
    if (!R.jb) promote(R, v);
    const B = R.jb;
    // (out of the local world: frozen where it is)
    if (!B.frozen && !PH.inside(B.p.x, B.p.z, 3)) PH.freeze(B);
    readJ(R, v);
    R.t += dt;
    const sp = Math.hypot(R.vx, R.vz), [hw, hl] = dims(v), m = massOf(v);
    if (!B.frozen && (sp > 0.05 || R.wl > 0.05) && R.upY > -2) {
      // the city's cars still in their lanes (and any wreck not in Jolt): shoved, and wrecked too when hit hard
      for (const o2 of vehicles) {
        if (o2 === v || !o2.edge || (o2._wreck && o2._wreck.jb) || Math.abs(o2.x - R.x) > 9 || Math.abs(o2.z - R.z) > 9) continue;
        if (B.p.y > 1.6) continue; // (flying over it)
        const [ow, ol] = dims(o2), oy = o2.wreck && o2._wreck ? o2._wreck.yaw : o2.yaw + o2.yawOffset;
        if (!boxes(R.x, R.z, R.yaw, hw, hl, o2.x, o2.z, oy, ow, ol, hit)) continue;
        const om = o2.bus ? 30 : massOf(o2), [ovx, ovz] = velOf(o2);
        const vn = (R.vx - ovx) * hit.nx + (R.vz - ovz) * hit.nz;
        // (apart: this one out of the other a little at a time, by the weights; the other moved by its lane)
        if (vn >= 0) { if (hit.pen > 0.05) PH.impulse(B, hit.nx * hit.pen * m * 1000 * 2, 0, hit.nz * hit.pen * m * 1000 * 2, R.x, B.p.y + 0.5, R.z); continue; }
        const J = -(1.2) * vn / (1 / m + 1 / om);
        PH.impulse(B, hit.nx * J * 1000, 0, hit.nz * J * 1000, hit.x, B.p.y + 0.55, hit.z);
        push(o2, -hit.nx * J, -hit.nz * J, hit.x, hit.z, -vn > 2.5);
        if (-vn > 2) {
          play('carHit', { pos: [hit.x, 0.6, hit.z], vol: Math.min(1.1, -vn / 14) });
          fx.spark(hit.x, 0.55, hit.z, -hit.nz, hit.nx, Math.round(Math.min(24, -vn * 1.4)), 7);
          if (-vn > 6) fx.bits(hit.x, 0.7, hit.z, R.vx, R.vz, Math.round(-vn * 0.6), Math.random() < 0.5 ? 'glass' : 'plastic');
        }
      }
      // the street furniture in its way
      if (sp > 2 && B.p.y < 1.2) props.collide(mover(R, v, hw, hl, m));
      // landing hard (off its roll, off a fall): a crunch and sparks where it came down
      if ((R.lastVy || 0) < -3 && R.vy > (R.lastVy || 0) + 2.5) { play('carHit', { pos: [R.x, 0.4, R.z], vol: Math.min(1, -R.lastVy / 8) }); fx.spark(R.x, 0.2, R.z, 1, 0, 18, 6); if (R.upY < 0.5) fx.bits(R.x, 0.5, R.z, R.vx, R.vz, 10, 'glass'); }
    }
    R.lastVy = R.vy;
    v.speed = 0; v.acc = -1; v.steer *= 0.9; v.blink = 0;
    R.honk -= dt;
    if (R.honk <= 0 && R.honks < 2 && R.upY > 0.5) {
      play('horn', { pos: [R.x, 1, R.z], kind: hornKind(v), len: R.honks === 0 ? 'lean' : Math.random() < 0.5 ? 'long' : 'double', vol: 0.9 });
      R.honks++; R.honk = rnd(2.5, 5);
    }
    // still (asleep in Jolt, or barely moving): upright, handed back to its lane as before; on its side or its roof, it
    // stays a wreck until it is out of view
    R.still = (B.frozen || !B.active || (sp < 0.3 && R.wl < 0.15)) ? R.still + dt : 0;
    if (R.still > 5) {
      const upright = R.upY > 0.93 && B.p.y < cm.getGroundHeight(R.x, R.z, 'person') + 0.35;
      const away = !seen(R.x, R.z) && Math.hypot(R.x - camera.position.x, R.z - camera.position.z) > 40;
      if (!upright && !away) return true;
      const L = TS.laneSpot ? TS.laneSpot(v, R.x, R.z) : null;
      const gap = L ? Math.hypot(L.x - R.x, L.z - R.z) : 0, dy = wrap((L ? L.yaw : R.laneYaw) - R.yaw);
      const square = upright && Math.abs(dy) < 0.6 && gap < 2.4;
      if (square && !away && inWay(R, L ? L.yaw : R.laneYaw, hw, hl)) { stats.inWay++; R.retry = R.t + 0.25; }
      if ((square && !(R.retry > R.t)) || away) {
        unpose(v, R.yaw);
        const close = TS.unwreck ? TS.unwreck(v, R.x, R.z, R.yaw) : false;
        if (close || away) { stats[close ? (R.moved ? 'backed' : 'square') : 'away']++; return drop(R); }
        readJ(R, v); R.retry = R.t + 1;
      }
      if (upright && R.still > 8 && L && !square && gap < 12) { backOut(R, v, L, dy, gap, hw, hl, dt); if (!B.frozen) PH.place(B, _lv.set(R.x, B.p.y, R.z), _q.setFromAxisAngle(_up.set(0, 1, 0), R.yaw)); }
    }
    return true;
  }
  // (back on its wheels for the traffic: flat on the road, square)
  function unpose(v, yaw) { v.pitch = v.roll = v.pitchVel = v.rollVel = 0; v.py = 0; v.posed = false; v.yaw = yaw; v.yawOffset = 0; }

  // the wreck, every frame of the traffic's (js/traffic.js calls it in place of driving it): false hands it back
  function step(v, dt) {
    const R = v._wreck;
    if (!R) return false;
    // (the traffic placed it somewhere else meanwhile: not ours any more)
    if (Math.abs(v.x - R.x) > 0.01 || Math.abs(v.z - R.z) > 0.01) return drop(R);
    if (R.jb || (PH && PH.ready && PH.inside(R.x, R.z, 6))) return stepJ(v, dt, R);
    R.t += dt;
    // the tyres: rolling on, they slow it a little (its driver braking); scrubbing sideways, a lot
    const c = Math.sin(R.yaw), s = Math.cos(R.yaw);
    let fwd = R.vx * c + R.vz * s, lat = R.vx * s - R.vz * c;
    fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - 6.5 * dt);
    lat = Math.sign(lat) * Math.max(0, Math.abs(lat) - 9 * dt);
    R.vx = fwd * c + lat * s; R.vz = fwd * s - lat * c;
    R.w = Math.sign(R.w) * Math.max(0, Math.abs(R.w) - (2.2 + Math.abs(R.w) * 1.2) * dt);
    R.x += R.vx * dt; R.z += R.vz * dt; R.yaw += R.w * dt;
    const sp = Math.hypot(R.vx, R.vz);
    const [hw, hl] = dims(v), m = massOf(v);
    if (sp > 0.05 || Math.abs(R.w) > 0.05) {
      // the buildings: the city's wall test on a stand-in, and the speed into the wall taken off (a small bounce)
      proxy.heading = R.yaw; proxy.body.hx = hw; proxy.body.z0 = -hl; proxy.body.z1 = hl; proxy.vx = proxy.vz = 0; proxy.speed = 0;
      _pos.set(R.x, 0, R.z);
      cm.resolveHorizontalCollision(_pos, 1.35, 1.0, proxy);
      const ox = _pos.x - R.x, oz = _pos.z - R.z, o = Math.hypot(ox, oz);
      if (o > 1e-4) {
        const nx = ox / o, nz = oz / o, vn = R.vx * nx + R.vz * nz;
        R.x = _pos.x; R.z = _pos.z;
        if (vn < 0) {
          R.vx -= nx * vn * 1.25; R.vz -= nz * vn * 1.25; R.w *= 0.6;
          if (-vn > 3) { play('carHit', { pos: [R.x - nx * hw, 0.6, R.z - nz * hw], vol: Math.min(1, -vn / 16) }); fx.spark(R.x - nx * hw, 0.5, R.z - nz * hw, -nz, nx, Math.round(-vn), 6); }
        }
      }
      // the others: shoved, and wrecked too when hit hard
      for (const o2 of vehicles) {
        if (o2 === v || !o2.edge || Math.abs(o2.x - R.x) > 9 || Math.abs(o2.z - R.z) > 9) continue;
        const [ow, ol] = dims(o2), oy = o2.wreck && o2._wreck ? o2._wreck.yaw : o2.yaw + o2.yawOffset;
        if (!boxes(R.x, R.z, R.yaw, hw, hl, o2.x, o2.z, oy, ow, ol, hit)) continue;
        const om = o2.bus ? 30 : massOf(o2), [ovx, ovz] = velOf(o2);
        // (apart, by their weights; a car in its lane is moved by its lane)
        const share = o2.wreck ? om / (m + om) : 1;
        R.x += hit.nx * hit.pen * share; R.z += hit.nz * hit.pen * share;
        if (o2.wreck && o2._wreck) { o2._wreck.x -= hit.nx * hit.pen * (1 - share); o2._wreck.z -= hit.nz * hit.pen * (1 - share); o2.x = o2._wreck.x; o2.z = o2._wreck.z; }
        const vn = (R.vx - ovx) * hit.nx + (R.vz - ovz) * hit.nz;
        if (vn >= 0) continue;
        const J = -(1.2) * vn / (1 / m + 1 / om);
        R.vx += hit.nx * J / m; R.vz += hit.nz * J / m;
        R.w += ((hit.z - R.z) * hit.nx - (hit.x - R.x) * hit.nz) * J / (m * (hl * hl + hw * hw) / 3);
        push(o2, -hit.nx * J, -hit.nz * J, hit.x, hit.z, -vn > 2.5);
        if (-vn > 2) {
          play('carHit', { pos: [hit.x, 0.6, hit.z], vol: Math.min(1.1, -vn / 14) });
          fx.spark(hit.x, 0.55, hit.z, -hit.nz, hit.nx, Math.round(Math.min(24, -vn * 1.4)), 7);
          if (-vn > 6) fx.bits(hit.x, 0.7, hit.z, R.vx, R.vz, Math.round(-vn * 0.6), Math.random() < 0.5 ? 'glass' : 'plastic');
        }
      }
      // Dan's car (driven or parked): it has had its turn (wagmi/crash meets the wrecks in its own steps, by the
      // weights), so a wreck that has slid into it since is put back out of it, its speed into it taken off
      const Q = cm.entities.car, QB = Q && Q.body;
      if (QB && Q.mesh && Q.mesh.visible && (cm.activeMode === 'car' || Q.position.y < 2.6)) {
        const qh = Q.heading, qcz = (QB.z1 + QB.z0) / 2, qx = Q.position.x + Math.sin(qh) * qcz, qz = Q.position.z + Math.cos(qh) * qcz;
        if (Math.abs(qx - R.x) < 9 && Math.abs(qz - R.z) < 9 && boxes(R.x, R.z, R.yaw, hw, hl, qx, qz, qh, QB.hx, (QB.z1 - QB.z0) / 2, hit)) {
          R.x += hit.nx * hit.pen; R.z += hit.nz * hit.pen;
          const vn = R.vx * hit.nx + R.vz * hit.nz;
          if (vn < 0) { R.vx -= hit.nx * vn * 1.2; R.vz -= hit.nz * vn * 1.2; }
        }
      }
      // the street furniture in its way
      if (sp > 2) props.collide(mover(R, v, hw, hl, m));
    }
    // its springs (as the lane's pose does), the brake lights on, standing in the road for the others to see
    v.pitchVel += (-v.pitch * 68 - v.pitchVel * 10.8) * dt; v.pitch = Math.max(-0.22, Math.min(0.22, v.pitch + v.pitchVel * dt));
    v.rollVel += (-v.roll * 68 - v.rollVel * 10.8) * dt; v.roll = Math.max(-0.26, Math.min(0.26, v.roll + v.rollVel * dt));
    v.x = R.x; v.z = R.z; v.yaw = R.yaw; v.yawOffset = 0; v.speed = 0; v.acc = -1; v.steer *= 0.9; v.blink = 0;
    v.tx = Math.sin(R.yaw); v.tz = Math.cos(R.yaw);
    // its driver on the horn: once soon after, now and then after that while it stands there
    R.honk -= dt;
    if (R.honk <= 0 && R.honks < 2) {
      play('horn', { pos: [R.x, 1, R.z], kind: hornKind(v), len: R.honks === 0 ? 'lean' : Math.random() < 0.5 ? 'long' : 'double', vol: 0.9 });
      R.honks++; R.honk = rnd(2.5, 5);
    }
    // stopped a while: handed back to its lane if near enough to it, or once out of view. (Where its lane has it, and
    // which way: the lane's spot nearest it now, or as it was hit)
    R.still = sp < 0.3 && Math.abs(R.w) < 0.1 ? R.still + dt : 0;
    if (R.still > 5) {
      const L = TS.laneSpot ? TS.laneSpot(v, R.x, R.z) : null;
      const gap = L ? Math.hypot(L.x - R.x, L.z - R.z) : 0, dy = wrap((L ? L.yaw : R.laneYaw) - R.yaw);
      const square = Math.abs(dy) < 0.6 && gap < 2.4;
      const away = !seen(R.x, R.z) && Math.hypot(R.x - camera.position.x, R.z - camera.position.z) > 40;
      // (not while Dan's car stands in its way: handed back nose to nose with him, it could never pull away (the lanes
      // never drive into his car) nor could he shove it (a car in its lane is moved by its lane): the two stood there
      // for good. It stays a wreck, his to push, until he has backed off)
      if (square && !away && inWay(R, L ? L.yaw : R.laneYaw, hw, hl)) { stats.inWay++; R.retry = R.t + 0.25; }
      if ((square && !(R.retry > R.t)) || away) {
        const close = TS.unwreck ? TS.unwreck(v, R.x, R.z, R.yaw) : false;
        if (close || away) { stats[close ? (R.moved ? 'backed' : 'square') : 'away']++; return drop(R); }
        // (not close after all: put back where it stood, and try again in a second)
        v.x = R.x; v.z = R.z; v.yaw = R.yaw; v.yawOffset = 0; v.tx = Math.sin(R.yaw); v.tz = Math.cos(R.yaw); R.retry = R.t + 1;
      }
      // (stood 8 s, in sight, turned across its lane or off it: its driver backs out, straightening up at 0.6 rad/s and
      // over onto the lane at 1.2 m/s, waiting while that would take it into another vehicle; not one slid 12 m or more
      // from its lane, which is left until it is out of view)
      if (R.still > 8 && L && !square && gap < 12) backOut(R, v, L, dy, gap, hw, hl, dt);
    }
    return true;
  }
  function backOut(R, v, L, dy, gap, hw, hl, dt) {
    const yaw = R.yaw + Math.sign(dy) * Math.min(Math.abs(dy), 0.6 * dt);
    const k = gap > 0.8 ? Math.min(1, (1.2 * dt) / gap) : 0;
    let x = R.x + (L.x - R.x) * k, z = R.z + (L.z - R.z) * k;
    // (kept out of the buildings, as it slides)
    proxy.heading = yaw; proxy.body.hx = hw; proxy.body.z0 = -hl; proxy.body.z1 = hl; proxy.vx = proxy.vz = 0; proxy.speed = 0;
    _pos.set(x, 0, z); cm.resolveHorizontalCollision(_pos, 1.35, 1.0, proxy); x = _pos.x; z = _pos.z;
    // (not into another vehicle, nor Dan's car: no deeper into one than it already is)
    const deeper = (ox, oz, oy, ow, ol) => {
      if (Math.abs(ox - x) > 9 || Math.abs(oz - z) > 9 || !boxes(x, z, yaw, hw, hl, ox, oz, oy, ow, ol, hit)) return false;
      const pen = hit.pen;
      return pen > 0.03 && (!boxes(R.x, R.z, R.yaw, hw, hl, ox, oz, oy, ow, ol, hit) || pen > hit.pen + 1e-3);
    };
    for (const o of vehicles) {
      if (o === v || !o.edge) continue;
      const [ow, ol] = dims(o);
      if (deeper(o.x, o.z, o.wreck && o._wreck ? o._wreck.yaw : o.yaw + o.yawOffset, ow, ol)) { stats.waiting++; return; }
    }
    const Q = cm.entities.car, QB = Q && Q.body;
    if (QB && Q.mesh && Q.mesh.visible) {
      const qh = Q.heading, qcz = (QB.z1 + QB.z0) / 2;
      if (deeper(Q.position.x + Math.sin(qh) * qcz, Q.position.z + Math.cos(qh) * qcz, qh, QB.hx, (QB.z1 - QB.z0) / 2)) { stats.waiting++; return; }
    }
    R.x = x; R.z = z; R.yaw = yaw; R.moved = true; stats.backing++;
    v.x = x; v.z = z; v.yaw = yaw; v.tx = Math.sin(yaw); v.tz = Math.cos(yaw);
  }
  // Dan's car (driven or parked, on the ground) where a wreck handed back would drive: alongside its front half or up
  // to 3 m on past its nose, on its lane's way (yaw)
  function inWay(R, yaw, hw, hl) {
    const Q = cm.entities.car, QB = Q && Q.body;
    if (!QB || !Q.mesh || !Q.mesh.visible || Q.position.y > 2.6) return false;
    const qh = Q.heading, qcz = (QB.z1 + QB.z0) / 2, qx = Q.position.x + Math.sin(qh) * qcz, qz = Q.position.z + Math.cos(qh) * qcz;
    if (Math.abs(qx - R.x) > 14 || Math.abs(qz - R.z) > 14) return false;
    const k = (hl + 3) / 2;
    return boxes(R.x + Math.sin(yaw) * k, R.z + Math.cos(yaw) * k, yaw, hw + 0.3, k, qx, qz, qh, QB.hx, (QB.z1 - QB.z0) / 2, hit);
  }
  function drop(R) { live.delete(R); if (R.jb) { PH.remove(R.jb); R.jb = null; unpose(R.v, R.v.yaw); } R.v._wreck = null; return false; }
  // the wreck as a mover for the furniture
  const M = { x: 0, z: 0, yaw: 0, hw: 1, hl: 2, vx: 0, vz: 0, mass: 1.4, R: null, onSolid: null, onBreak: null };
  M.onSolid = (nx, nz, pen, b, vi) => {
    const R = M.R, vn = R.vx * nx + R.vz * nz;
    // (in Jolt: the speed into it taken off as an impulse, pushed back out of it)
    if (R.jb) { if (vn < 0) PH.impulse(R.jb, -nx * vn * 1.3 * M.mass * 1000, 0, -nz * vn * 1.3 * M.mass * 1000, b.x, R.jb.p.y + 0.5, b.z); PH.place(R.jb, _lv.set(M.x, R.jb.p.y, M.z), R.jb.q); if (vn < 0 && vi > 3) play('carHit', { pos: [b.x, 0.7, b.z], vol: Math.min(1, vi / 15) }); return; }
    R.x = M.x; R.z = M.z; if (vn < 0) { R.vx -= nx * vn * 1.3; R.vz -= nz * vn * 1.3; R.w *= 0.5; if (vi > 3) play('carHit', { pos: [b.x, 0.7, b.z], vol: Math.min(1, vi / 15) }); }
  };
  M.onBreak = (b, vi, loss) => {
    const R = M.R, sp = Math.hypot(R.vx, R.vz) || 1, k = Math.max(0, 1 - loss / sp);
    if (R.jb) { PH.impulse(R.jb, -R.vx * (1 - k) * M.mass * 1000, 0, -R.vz * (1 - k) * M.mass * 1000, R.x, R.jb.p.y + 0.5, R.z); return; }
    R.vx *= k; R.vz *= k;
  };
  function mover(R, v, hw, hl, m) { Object.assign(M, { x: R.x, z: R.z, yaw: R.yaw, hw, hl, vx: R.vx, vz: R.vz, mass: m, R }); return M; }

  function frame(dt) {
    clock += dt;
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(_pm);
  }
  return { take, push, velOf, live, frame, vehicles, stats };
}
