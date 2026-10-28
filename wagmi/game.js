// Mog City: the game on top of the city. Waits for the city app (window.__NYC_APP), then
//  - puts Dan (assets/characters/dan.glb, every clip) in place of the procedural walker, his idle, walk, jog, run
//    and sprint blended from his speed and his jump from the air under him;
//  - puts Dan's car (wagmi/roadster.js) in place of the taxi, faster, its rocket package firing on the boost;
//  - lets him get in and out of it, GTA style: F beside the car walks him to its door, which swings up, and in; F in it
//    stops it and gets him out at its door (fast: he dives out). See 'in and out of it'.
import * as THREE from 'three/webgpu';
import { loadGLB } from './glb.js';
import { buildRoadster, createDriver } from './roadster.js';
import { createStand } from './stand.js';
import { createPlant } from './plant.js';
import { drive, installDriveMode } from './audio/drivemode.js';

const app = await new Promise((res) => { const t = setInterval(() => { if (window.__NYC_APP && window.__NYC_APP.controllerManager) { clearInterval(t); res(window.__NYC_APP); } }, 100); });
const cm = app.controllerManager, person = cm.entities.person, car = cm.entities.car;
const WAGMI = (window.WAGMI = { app, person, car });
// (the drive mode, engine or ALL ELECTRIC, on WAGMI from the start: Q and the speed panel's badge, below, use it)
installDriveMode(WAGMI);

/* --------------------------------------------------------------- the car -- */
{
  // the taxi's body, decals, plates and tyres put away (its headlamps, suspension and physics kept)
  for (const o of car.chassisPivot.children) if (!o.isLight && !(o.isObject3D && o.children.some((k) => k.isLight))) o.visible = false;
  for (const w of car.wheels) w.tire.visible = false;
  const rs = buildRoadster(THREE);   // (its own default paint)
  rs.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  car.chassisPivot.add(rs.group);
  // its size: built at a sports car's, scaled up whole (S) to a big hypercar's, 4.8 m long, 2.2 m wide and 1.28 m tall;
  // a driver in its seat (rs.anchor) stays his own size, the seat's marks (rs.seat, in the anchor's frame) scaled to
  // match. body: its box in its own frame (x across it, z along it, top), for all that runs into it or round it;
  // axle: its axles' distance either side of its middle (the wheels' ground); chase: the chase camera's framing
  // (js/cameras.js): fov, the pull back per m/s, the lens widening with speed and more on the boost, the shake flat out
  // (kept small: at a cruise the car fills as much of the frame as parked, on the boost a little less)
  const S = 1.1;
  rs.group.scale.setScalar(S); rs.anchor.scale.setScalar(1 / S); rs.scale = S;
  for (const k of Object.keys(rs.seat)) rs.seat[k] = rs.seat[k].map((v) => v * S);
  Object.assign(rs, { length: rs.length * S, width: rs.width * S, height: rs.height * S });
  Object.assign(car, { body: { hx: 1.08, z0: -2.33, z1: 2.47, top: 1.28 }, axle: 1.56, mass: 2.0,
    chaseDistance: 6.7, chaseHeight: 2.0, chase: { fov: 58, pull: 0.002, kick: 1.1, boostKick: 3.0, vmax: 34, shake: 0.03, vtop: 56 } });
  Object.assign(car, { label: "Dan's car", topSpeed: 34, boostSpeed: 56, accel: 16, boostAccel: 32, roadster: rs });
  // how it slows (js/controllers.js driveSpeed, after Slop New York f3132b6): rolling 0.5 m/s² and the air (0.004 v²)
  // always, 3 more lifted off (coast: 60 mph to 10 in about 5 s, 72 m, where it used to stop in 0.6 s), the brakes 16
  // (1.6 g as before: 60 mph to a stop in 20 m), 32 with Shift held (its boostAccel, as the brakes always were on the
  // boost: 60 mph to a stop in 11 m, 125 mph in 41 m; and from 125 with Shift let go, 32 down to 76 mph, then 16). Its
  // pace above is net of them (0-60 mph in 1.7 s, 76 mph, 125 on the boost); the boost let go with W held, it bleeds
  // back from 125 to 76 mph over about 2.6 s, no longer in one frame
  Object.assign(car, { rolling: 0.5, drag: 0.004, coast: 3, brake: 16, boostBrake: 32 });
  // its steering, for a keyboard (js/controllers.js steerHandled): to full lock in 0.11 s at walking pace, 0.17 s from
  // 34 m/s up, back to the middle in 0.08 s; full lock a 4.6 m circle at walking pace, at most 106 degrees a second, and
  // never more than 48 m/s² sideways: a Manhattan corner taken at 45-55 mph on the key alone (a 11-13 m circle), flat
  // out at 76 mph about 81 degrees a second (a 24 m circle, a lane over in well under a second), on the boost wide
  // (a 65 m circle at 125 mph)
  car.handling = { rMin: 4.6, yawMax: 1.85, grip: 48, rampIn: [0.11, 0.17], rampOut: 0.08, vRef: 34 };
  // (the speed panel's name for it, when the city started in the car before this ran)
  if (cm.activeMode === 'car') { const lab = document.getElementById('hud-active-mode'); if (lab) lab.textContent = car.label; }
  car.onUpdate = (dt, keys, throttle, steer) => {
    // (stopping for him to get out: car.halt m/s² of brakes, whatever is pressed)
    if (car.halt) { car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), car.halt * dt); throttle = 0; steer = 0; car.steerAngle *= 0.8; }
    car.boosting = !!keys.boost && throttle > 0;
    rs.setThrust(keys.boost && throttle > 0 ? 1 : 0, keys.boost && throttle > 0 ? 0.85 : 0);
    rs.update(dt, car.speed, -steer * 0.9);
    alongWall(dt, throttle);
    curbAssist(dt, steer);
    unpin(dt, throttle);
    stuckClock(dt, throttle);
  };
  // pinned (a tree ahead and one behind, a wreck against a wall): the throttle or reverse held PIN s with the car hardly
  // moving, it wriggles free, slid over to the nearest spot round it where its box is clear of the buildings and the
  // street's things (a beat, at 3 m/s; again after another PIN s if that wasn't enough)
  const PIN = 1.1, pin = { t: 0, x: 0, z: 0, slide: 0, dx: 0, dz: 0 }, probe = { heading: 0, speed: 0, vx: 0, vz: 0, angularVel: 0, body: null };
  // (its box at (x, z) turned h clear of the buildings and the street's things)
  const boxClear = (x, z, h = car.heading) => {
    const B = car.body, cs = Math.cos(h), sn = Math.sin(h), p = new THREE.Vector3(x, 0, z);
    Object.assign(probe, { heading: h, speed: 0, vx: 0, vz: 0, body: B });
    cm.resolveHorizontalCollision(p, 1.35, 1.0, probe);
    if (Math.hypot(p.x - x, p.z - z) > 0.01) return false;
    for (const b of WAGMI.crash?.props?.around(x, z, 5) || []) {
      if (b.taken) continue;
      const r = (b.w ? Math.max(b.w, b.d) / 2 : b.r || 0.3) + 0.15, dx = b.x - x, dz = b.z - z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) < B.hx + r && lz > B.z0 - r && lz < B.z1 + r) return false;
    }
    return true;
  };
  // against a wall, nosing along it: the throttle (or reverse) held into a building at a slant, up to 12 m/s, turns the
  // car along the wall (the way it was already more facing, up to ~1.6 rad/s at a crawl, 0.9 over 6 m/s) and eases it
  // off it, so it drives on along the wall instead of grinding into it; head on (within ~25 degrees) it is left to
  // reverse
  const _wp = new THREE.Vector3();
  function alongWall(dt, throttle) {
    if (!throttle || car.halt || Math.abs(car.speed) > 12 || cm.activeMode !== 'car') return;
    const dir = throttle > 0 ? 1 : -1, fx = Math.sin(car.heading) * dir, fz = Math.cos(car.heading) * dir;
    // (its box a little further the way it is pushed: where the buildings put it back from, the wall's normal)
    _wp.set(car.position.x + fx * 0.3, 0, car.position.z + fz * 0.3);
    Object.assign(probe, { heading: car.heading, speed: 0, vx: 0, vz: 0, body: car.body });
    const x0 = _wp.x, z0 = _wp.z;
    cm.resolveHorizontalCollision(_wp, 1.35, 1.0, probe);
    let nx = _wp.x - x0, nz = _wp.z - z0;
    const n = Math.hypot(nx, nz);
    if (n < 0.05) return;
    nx /= n; nz /= n;
    const into = -(fx * nx + fz * nz);
    if (into < 0.15 || into > 0.9) return;
    // (the wall's way nearer the way it faces)
    let tx = -nz, tz = nx; if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
    const want = Math.atan2(tx * dir, tz * dir), d = Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading));
    car.heading += Math.sign(d) * Math.min(Math.abs(d), (Math.abs(car.speed) > 6 ? 0.9 : 1.6) * dt);
    car.vx += nx * 0.6 * dt * 10; car.vz += nz * 0.6 * dt * 10;
  }
  // up the curb by mistake: the front wheels up on the sidewalk, the back ones still on the road, the car nosing into
  // the curb at under 30 degrees, at over 3 m/s, not steered that way: eased back off it (slid back toward the road and
  // turned along the street, at up to 0.8 rad/s) for a beat. Steered up onto the sidewalk, or driven along it, it is left
  // alone
  const curb = { t: 0, ax: 0, side: 0, a0: 0 };
  function curbAssist(dt, steer) {
    if (car.halt || cm.activeMode !== 'car' || car.speed <= 3) { curb.t = 0; return; }
    const fx = Math.sin(car.heading) * (car.axle || 1.45), fz = Math.cos(car.heading) * (car.axle || 1.45);
    const up = cm.getGroundHeight(car.position.x + fx, car.position.z + fz, 'car') - cm.getGroundHeight(car.position.x - fx, car.position.z - fz, 'car');
    if (up >= 0.1 && up <= 0.3) {
      // (the street's way: the nearest lane's, either way along it)
      let best = null;
      for (const l of lanesNear(car.position.x, car.position.z, 12)) if (!best || l.d < best.d) best = l;
      if (best) {
        let ax = best.h; if (Math.abs(wrapA(car.heading - ax)) > Math.PI / 2) ax += Math.PI;
        const a = wrapA(car.heading - ax);
        // (steered into it: deliberate)
        const into = steer * a > 0 && Math.abs(steer) > 0.15;
        if (Math.abs(a) > 0.02 && Math.abs(a) < 0.52 && !into) Object.assign(curb, { t: 0.6, ax, side: Math.sign(a), a0: Math.max(curb.t > 0 ? curb.a0 : 0, Math.abs(a)) });
      }
    }
    if (curb.t <= 0) return;
    curb.t -= dt;
    if (steer * curb.side > 0 && Math.abs(steer) > 0.15) { curb.t = 0; return; }
    const a = wrapA(car.heading - curb.ax);
    if (a * curb.side > 0) car.heading -= Math.sign(a) * Math.min(Math.abs(a), 0.8 * dt);
    // (back toward the road: across the street's way, away from the curb's side)
    const nx = -curb.side * Math.cos(curb.ax), nz = curb.side * Math.sin(curb.ax);
    const want = 0.6 * Math.sin(curb.a0) * car.speed, have = car.vx * nx + car.vz * nz;
    if (have < want) { const k = (want - have) * Math.min(1, dt * 10); car.vx += nx * k; car.vz += nz * k; }
  }
  // how long the car has been held going nowhere: the throttle or reverse on all along, and under 2.5 m from where it
  // was 1.5 s ago (a wriggle free that slides it a metre or two and back into the wall counts as nowhere); over 1.2 s,
  // the prompt offers the reset (see the prompt, below)
  const stuck = { t: 0, held: 0, clock: 0, hist: [] };
  function stuckClock(dt, throttle) {
    stuck.clock += dt;
    stuck.held = throttle && !car.halt ? stuck.held + dt : 0;
    stuck.hist.push([stuck.clock, car.position.x, car.position.z]);
    while (stuck.hist.length > 2 && stuck.clock - stuck.hist[1][0] > 1.5) stuck.hist.shift();
    const [, x0, z0] = stuck.hist[0];
    stuck.t = stuck.held > 1.2 && Math.hypot(car.position.x - x0, car.position.z - z0) < 2.5 ? stuck.held : 0;
  }
  WAGMI.carStuck = () => stuck.t;
  function unpin(dt, throttle) {
    if (pin.slide > 0) { pin.slide -= dt; car.vx = pin.dx * 3; car.vz = pin.dz * 3; return; }
    if (!throttle || car.halt || Math.hypot(car.position.x - pin.x, car.position.z - pin.z) > 0.8) { pin.t = 0; pin.x = car.position.x; pin.z = car.position.z; return; }
    if ((pin.t += dt) < PIN) return;
    pin.t = 0;
    // (the nearest clear spot: to either side first, then the corners, then back and ahead; up to 3.5 m off)
    const cs = Math.cos(car.heading), sn = Math.sin(car.heading);
    for (const d of [1.3, 2.2, 3.5]) for (const [ax, az] of [[1, 0], [-1, 0], [0.7, -0.7], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0, -1], [0, 1]]) {
      const wx = (ax * cs + az * sn) * d, wz = (-ax * sn + az * cs) * d;
      if (!boxClear(car.position.x + wx, car.position.z + wz)) continue;
      Object.assign(pin, { dx: wx / d, dz: wz / d, slide: d / 3 });
      car.speed = 0;
      return;
    }
  }
  // WAGMI.recoverCar(): the car put back on the road: on the nearest lane (the city's road graph, js/road-network.js, or
  // a shore highway's), facing the lane's way (of two near ones, the one nearer the way it faces), upright, stopped,
  // where its box is clear of the buildings, the street's things and every other car (slid along the lane to find room);
  // true if it moved it. Also on WAGMI.recoverCar.key (X), any time in the car. On foot it puts the parked car back.
  const TS = app.trafficSystem, HW = app.highwayTraffic;
  // (the highways' cars stand in the follow camera's way too, as the city's do: js/cameras.js highwayBoxes)
  if (HW?.near) app.cameraSystem.highway = HW;
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function lanesNear(x, z, R) {
    const out = [];
    for (const e of TS?.network?.edges || []) {
      if (Math.abs(e.mx - x) > R + e.len / 2 || Math.abs(e.mz - z) > R + e.len / 2) continue;
      for (const l of e.lanes) {
        const ax = e.sx + e.rx * l, az = e.sz + e.rz * l;
        const t = Math.max(3, Math.min(e.len - 3, (x - ax) * e.dx + (z - az) * e.dz));
        if (e.len < 6) continue;
        const px = ax + e.dx * t, pz = az + e.dz * t, d = Math.hypot(px - x, pz - z);
        // (bx, bz: the edge's own line there, the one the GPS route runs along)
        if (d < R) out.push({ x: px, z: pz, h: Math.atan2(e.dx, e.dz), d, ux: e.dx, uz: e.dz, lo: 3 - t, hi: e.len - 3 - t, bx: e.sx + e.dx * t, bz: e.sz + e.dz * t });
      }
    }
    for (const lane of HW?.lanes || []) {
      const [x0, x1, z0, z1] = lane.box;
      if (x < x0 - R || x > x1 + R || z < z0 - R || z > z1 + R) continue;
      const P = lane.pts;
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[i], b = P[i + 1];
        if (a.y < -0.5 || b.y < -0.5) continue;
        const sx = b.x - a.x, sz = b.z - a.z, L = Math.hypot(sx, sz); if (L < 0.5) continue;
        const ux = sx / L, uz = sz / L, t = Math.max(0, Math.min(L, (x - a.x) * ux + (z - a.z) * uz));
        const px = a.x + ux * t, pz = a.z + uz * t, d = Math.hypot(px - x, pz - z);
        if (d < R) out.push({ x: px, z: pz, h: Math.atan2(ux, uz), d, ux, uz, lo: -12, hi: 12 });
      }
    }
    return out;
  }
  // (no other car within a metre of its box there: the city's, the highways', the mission's, the chase's)
  const _o = { nx: 0, nz: 0, pen: 0, x: 0, z: 0 };
  function carsClear(x, z, h) {
    const B = car.body, hl = (B.z1 - B.z0) / 2 + 1, cz = (B.z1 + B.z0) / 2, cx = x + Math.sin(h) * cz, cz2 = z + Math.cos(h) * cz;
    const list = (WAGMI.crash?.bodies?.(cx, cz2, 14) || []).slice();
    for (const P of WAGMI.pursuit?.chase?.cars || []) if (!P.gone) list.push([P.x, P.z, P.h, P.hw, P.hl]);
    for (const [ox, oz, oy, ow, ol] of list) {
      const c1 = Math.cos(h), s1 = Math.sin(h), c2 = Math.cos(oy), s2 = Math.sin(oy), dx = cx - ox, dz = cz2 - oz;
      let apart = false;
      for (const [nx, nz] of [[c1, -s1], [s1, c1], [c2, -s2], [s2, c2]]) {
        const ra = (B.hx + 1) * Math.abs(nx * c1 - nz * s1) + hl * Math.abs(nx * s1 + nz * c1);
        const rb = ow * Math.abs(nx * c2 - nz * s2) + ol * Math.abs(nx * s2 + nz * c2);
        if (Math.abs(dx * nx + dz * nz) >= ra + rb) { apart = true; break; }
      }
      if (!apart) return false;
    }
    return true;
  }
  // (nothing in its lane from 5 m behind it to 15 m ahead of it: the city's cars, the highways', the mission's, the
  // chase's; a car in the next lane over doesn't count)
  function laneClear(x, z, h) {
    const B = car.body, ux = Math.sin(h), uz = Math.cos(h);
    const list = (WAGMI.crash?.bodies?.(x + ux * 5, z + uz * 5, 17) || []).slice();
    for (const P of WAGMI.pursuit?.chase?.cars || []) if (!P.gone) list.push([P.x, P.z, P.h, P.hw, P.hl]);
    for (const [ox, oz, oy, ow, ol] of list) {
      const dx = ox - x, dz = oz - z, a = dx * ux + dz * uz, s = Math.abs(dx * uz - dz * ux);
      const c = Math.abs(Math.cos(oy - h)), sn = Math.abs(Math.sin(oy - h)), rw = ow * c + ol * sn, rl = ow * sn + ol * c;
      if (s < B.hx + rw + 0.5 && a + rl > B.z0 - 5 && a - rl < B.z1 + 15) return false;
    }
    return true;
  }
  // the GPS route (WAGMI.gps.route, [x, z] points; the first is where he was) near (x, z): how far off it that is, d, and
  // its heading, h: on along it `ahead` m from its nearest point (0: the stretch it is on); null with no route
  function routeAt(x, z, ahead = 0) {
    const r = WAGMI.gps?.route;
    if (!r || r.length < 2) return null;
    let bi = -1, bk = 0, bd = Infinity;
    for (let i = r.length > 2 ? 2 : 1; i < r.length; i++) {
      const [ax, az] = r[i - 1], [bx, bz] = r[i], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
      if (L < 0.25) continue;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), d = Math.hypot(ax + dx * k - x, az + dz * k - z);
      if (d < bd) { bd = d; bi = i; bk = k; }
    }
    if (bi < 0) return null;
    const [ax, az] = r[bi - 1], [bx, bz] = r[bi], px = ax + (bx - ax) * bk, pz = az + (bz - az) * bk;
    let qx = px, qz = pz, left = ahead;
    for (let i = bi; i < r.length && left > 0; i++) {
      const L = Math.hypot(r[i][0] - qx, r[i][1] - qz);
      if (L >= left) { qx += (r[i][0] - qx) / L * left; qz += (r[i][1] - qz) / L * left; left = 0; } else { left -= L; qx = r[i][0]; qz = r[i][1]; }
    }
    const h = Math.hypot(qx - px, qz - pz) > 2 ? Math.atan2(qx - px, qz - pz) : Math.atan2(bx - ax, bz - az);
    return { d: bd, h };
  }
  // X: the lane to put it on faces the way the GPS goes (the route's way 15 m on from where it passes the car; no route,
  // or the car 40 m or more off it, the way the car faces), on the route or near it, never in a junction (7 m or more
  // inside its lane's ends), with its lane clear 15 m ahead; none of those within 300 m, the old rule: the nearest lane
  // the car more or less faces along, with room for it. Either way the traffic round it is held back a moment
  function recoverCar() {
    if (WAGMI.cutscene || WAGMI.directed || WAGMI.ride?.phase) return false;
    const x = car.position.x, z = car.position.z;
    const near = routeAt(x, z, 15), routed = !!(near && near.d < 40), ref = routed ? near.h : car.heading;
    for (const R of [45, 120, 300]) {
      const cands = lanesNear(x, z, R);
      // (nearest first; a lane facing away from the way to go counts as further, and one off the route too)
      for (const c of cands) {
        let want = ref, on = false;
        if (routed) {
          const a = routeAt(c.x, c.z), b = c.bx != null ? routeAt(c.bx, c.bz) : null;
          on = !!(a && (a.d < 6 || (b && b.d < 3)));
          if (on) want = (b && b.d < a.d ? b : a).h;
        }
        c.dh = wrapA(c.h - want);
        c.score = c.d + 30 * (c.dh / Math.PI) ** 2 + (routed && !on ? 15 : 0);
      }
      cands.sort((a, b) => a.score - b.score);
      for (const c of cands.slice(0, 24)) {
        if (routed && Math.abs(c.dh) > Math.PI / 3) continue;
        for (const k of [0, 5, -5, 10, -10, 16, -16, 24, -24]) {
          if (k < c.lo + 7 || k > c.hi - 7) continue;
          const px = c.x + c.ux * k, pz = c.z + c.uz * k;
          if (cm.getGroundHeight(px, pz, 'car') > 0.3 || !boxClear(px, pz, c.h) || !carsClear(px, pz, c.h) || !laneClear(px, pz, c.h)) continue;
          place(px, pz, c.h); held(px, pz, c.h);
          return true;
        }
      }
    }
    // (the old rule)
    for (const R of [45, 120, 300]) {
      const cands = lanesNear(x, z, R);
      for (const c of cands) c.score = c.d + 9 * (wrapA(c.h - car.heading) / Math.PI) ** 2;
      cands.sort((a, b) => a.score - b.score);
      for (const c of cands.slice(0, 24)) {
        for (const k of [0, 5, -5, 10, -10, 16, -16, 24, -24]) {
          if (k < c.lo || k > c.hi) continue;
          const px = c.x + c.ux * k, pz = c.z + c.uz * k;
          if (cm.getGroundHeight(px, pz, 'car') > 0.3 || !boxClear(px, pz, c.h) || !carsClear(px, pz, c.h)) continue;
          place(px, pz, c.h); held(px, pz, c.h);
          return true;
        }
      }
    }
    return false;
  }
  // (the city's cars hold back a moment round the car just put down: a blocker of TS.blockers, as the chase's cars are,
  // riding with it for HOLD s; and the route planned afresh from its new way)
  const HOLD = 1.5, hold = { b: null, until: 0 };
  function held(x, z, h) {
    if (cm.activeMode === 'car') WAGMI.gps?.update?.(true);
    if (!Array.isArray(TS?.blockers)) return;
    if (!hold.b) hold.b = { x, z, yaw: h, halfW: car.body.hx + 0.3, halfL: (car.body.z1 - car.body.z0) / 2 + 2, vx: 0, vz: 0 };
    Object.assign(hold.b, { x, z, yaw: h, vx: 0, vz: 0 });
    if (!TS.blockers.includes(hold.b)) TS.blockers.push(hold.b);
    hold.until = performance.now() + HOLD * 1000;
  }
  WAGMI.resetHold = () => {
    const b = hold.b; if (!b || !TS?.blockers) return;
    const k = TS.blockers.indexOf(b);
    if (performance.now() > hold.until) { if (k >= 0) TS.blockers.splice(k, 1); return; }
    const s = Math.sin(car.heading), c = Math.cos(car.heading), v = car.speed || 0;
    Object.assign(b, { x: car.position.x, z: car.position.z, yaw: car.heading, vx: s * v + (car.vx || 0), vz: c * v + (car.vz || 0) });
  };
  function place(x, z, h) {
    const driving = cm.activeMode === 'car';
    // (the camera snapped to its usual place behind it, not glided from where it was: wedged by a wall or a bus, that
    // was low and tight against the car. Its clear-view state goes too, _view: swung round to the side of a car backed
    // into a wall, it would carry the swing over and look across the car for a second while it eased back behind)
    if (driving) { const cs = app.cameraSystem; Object.assign(cs, { orbitYawOffset: 0, orbitPitchOffset: 0.09, userOrbitTimer: 0, initialized: false, _view: null }); }
    car.position.set(x, cm.getGroundHeight(x, z, 'car'), z);
    Object.assign(car, { heading: h, speed: 0, vx: 0, vz: 0, angularVel: 0, steerAngle: 0, steerK: 0, halt: 0, fallVel: 0, pitchVel: 0, rollVel: 0, heaveVel: 0, heaveY: 0 });
    car.chassisPivot.rotation.x = car.chassisPivot.rotation.z = 0; car.chassisPivot.position.y = 0;
    car.mesh.position.copy(car.position); car.mesh.rotation.y = h;
    Object.assign(pin, { t: 0, slide: 0, x, z }); Object.assign(stuck, { t: 0, held: 0, hist: [] });
    if (driving) { person.position.copy(car.position); person.heading = h; }
    WAGMI.audio?.play?.('whoosh', { pos: [x, 0.8, z], vol: 0.6, rate: 0.8 });
    // (the stall help's 'Stuck?' offer, if it is up, has been answered)
    WAGMI.ui?.offer?.(null);
  }
  WAGMI.recoverCar = Object.assign(recoverCar, { key: 'KeyX' });
  // stopped (under 5 m/s) facing more than 120 degrees off the GPS route's way, WRONG s on end: the prompt offers the
  // reset (a phone's RESET CAR, the pad's B). WAGMI.carWrongWay(dt) (the prompt's tick) is how long it has been
  const WRONG = 1.5, wrong = { t: 0 };
  WAGMI.carWrongWay = (dt) => {
    let off = false;
    if (cm.activeMode === 'car' && !car.halt && Math.abs(car.speed) < 5) {
      const r = routeAt(car.position.x, car.position.z, 15);
      off = !!(r && r.d < 40 && Math.abs(wrapA(car.heading - r.h)) > (2 * Math.PI) / 3);
    }
    wrong.t = off ? wrong.t + dt : 0;
    return wrong.t >= WRONG ? wrong.t : 0;
  };
  // (parked, it still settles its thrust; rolling on with nobody in it, its wheels still turn)
  WAGMI.carIdle = (dt) => { if (cm.activeMode !== 'car') { rs.setThrust(0, 0); rs.update(dt, car.speed || 0, 0); } };
  // parked, it is solid to Dan on foot (the city's collision only knows the buildings): its body a box in its own frame
  // (car.body: x across it, z along it, measured off the model), r m round it; he is put out at its nearest side
  const BODY = car.body;
  person.collide = (pos, r) => {
    if (cm.activeMode === 'car' || !car.mesh.visible || pos.y > car.position.y + BODY.top) return false;
    const cs = Math.cos(car.heading), sn = Math.sin(car.heading), dx = pos.x - car.position.x, dz = pos.z - car.position.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const side = BODY.hx + r - Math.abs(lx), back = lz - (BODY.z0 - r), front = BODY.z1 + r - lz;
    if (side <= 0 || back <= 0 || front <= 0) return false;
    let nx = lx, nz = lz;
    if (side < Math.min(back, front)) nx = Math.sign(lx || 1) * (BODY.hx + r); else nz = back < front ? BODY.z0 - r : BODY.z1 + r;
    pos.x = car.position.x + nx * cs + nz * sn; pos.z = car.position.z - nx * sn + nz * cs;
    return true;
  };
}

/* ----------------------------------------------------------------- Dan -- */
// His body in layers (one mixer, every weight summing to one):
//  - locomotion: the street's gaits (idle, walk, jog, run, sprint) by his speed, or, in a fight (W.dan.loco.fight), his
//    guard and a boxer's footwork (in, back, left, right) by the way he steps against the way he faces;
//  - actions over it: one-shot moves (W.dan.play), each cross-faded in over whatever was playing (the same clip twice in a
//    row too) and faded back out to the legs; a held one stays on its last frame until stopped;
//  - hands: a reach for each hand (W.dan.reach), two-bone IK over the pose (holding, lifting, grabbing).
// The fight sets W.dan.loco, W.dan.timeScale (hit-stop, slow motion) and the pre / post hooks it runs around the pose.
{
  const gltf = await loadGLB('assets/characters/dan.glb');
  const body = gltf.scene;
  // (the export's armature node, the parent of the bone 'root', carries a fixed turn of 12.8 deg that no clip moves: 11
  // deg forward and 6 deg over to his right. Every clip stood him on it, his hips 24 cm ahead of his feet and 12 cm to
  // the side, his chest and head down. Taken out (its scale kept), he stands over his feet; lifted 2 cm, his soles are
  // on the pavement in the idle and the guard (measured: they were 2-3.5 cm into it))
  const armature = body.getObjectByName('root')?.parent;
  if (armature && armature !== body) { armature.quaternion.identity(); armature.position.y += 0.02; }
  body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  for (const m of person.crowd.meshes) m.visible = false;
  person.mesh.add(body);
  const mixer = new THREE.AnimationMixer(body), clips = gltf.animations.slice(), A = {};
  const clipOf = (n) => THREE.AnimationClip.findByName(clips, n);
  const act = (n) => A[n] || (A[n] = mixer.clipAction(clipOf(n)));
  const bones = {}; body.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // standing still, his knees straightened under him, his feet flat and his hips over them (wagmi/stand.js): eased in
  // over STAND_EASE once he is still on his feet with nothing else on him, and out as soon as anything is
  const stand = createStand(THREE, body, bones), STAND_EASE = 0.25;
  // coming to a stop, his feet stay where they landed and step onto the idle's stance (wagmi/plant.js), not glide there
  const plant = createPlant(THREE, body, bones);
  let standW = 0;
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // the gaits and the speed each clip was captured at, on his legs (m/s: the planted foot goes back at exactly this,
  // locked in the build, so played at speed / sp it stays put on the street). Bandai Namco takes retargeted to his rig
  // (.scratch/bandai/dan/build-clips.mjs, its numbers in clips.json): walk walk_normal, jog run_active, run
  // run_masculinity, sprint dash_masculinity. Each cycle starts on his left foot's strike, so the two blended share one
  // phase (gPhase, below): their feet come down together, the stride the blend's and the pace speed / stride
  // (a clip the model lacks is left out: a re-export with fewer clips still loads)
  const GAITS = [['idle', 0, 1], ['walk', 1.4796, 1.4796], ['jog', 2.9654, 2.9654], ['run', 3.8326, 3.8326], ['sprint', 5.2867, 5.2867]].filter(([n]) => clipOf(n));
  let gPhase = 0;
  // the fight's stance and footwork, and the speed each step was captured at
  const STEPS = [['fight', 0], ['guardF', 0.76], ['guardB', 0.84], ['guardL', 0.46], ['guardR', 0.66]].filter(([n]) => clipOf(n));
  const LOCO = [...GAITS.map((g) => g[0]), ...STEPS.map((s) => s[0])];
  for (const n of LOCO) { const a = act(n); a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0); }
  const W = Object.fromEntries(LOCO.map((n) => [n, n === 'idle' ? 1 : 0]));
  // the fight's footwork in, back, left and right (fwF, fwB, fwL, fwR): Bandai Namco takes retargeted to his rig, in
  // place, their planted feet locked (FW_PACK, assets/anim/bandai/dan-footwork.glb, CC BY-NC 4.0: NOTICE), fetched the
  // first time he squares up (till then, or without it, the guard's own steps). The legs only: the guard ('fight', and
  // under the steps 'fight/upper') keeps his spine, arms and head, so his chest and head stay up in his guard while his
  // feet go. The takes walk with the hips turned the way they go (70-75 deg on a side-step) and a little forward: his
  // root keeps the guard's own set (plus FW_TURN of the take's turn, a bladed lean into a side-step) and each hip carries
  // the rest, so the legs land as captured. In: walk_normal; back: walk-back_masculinity (the normal one is too short to
  // loop); the sides: walk-left / walk-right_normal. Each with the speed its planted foot goes back at, on his legs
  const FW_LEGS = /^(root|pelvis_|upperleg|lowerleg|foot_)/, FW_TURN = 0.3;
  const FW = [['fwFwd', 'fwF', 1.4796], ['fwBack', 'fwB', 1.3199], ['fwLeft', 'fwL', 1.3503], ['fwRight', 'fwR', 1.2319]];
  let fwPack = null, fwOn = false; const FW_PACK = 'assets/anim/bandai/dan-footwork.glb';
  function footwork() {
    fwPack = (FW_PACK ? loadGLB(FW_PACK) : Promise.reject(new Error('no footwork pack'))).then((g) => {
      const guard = clipOf('fight'); if (!guard) return;
      const q0 = new THREE.Quaternion(), qr = new THREE.Quaternion(), qn = new THREE.Quaternion(), qh = new THREE.Quaternion(), f = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
      const r0 = guard.tracks.find((t) => t.name === 'root.quaternion');
      if (r0) q0.fromArray(r0.values, 0); else if (bones.root) q0.copy(bones.root.quaternion);
      const add = [];
      for (const [src, name, sp] of FW) {
        const c = THREE.AnimationClip.findByName(g.animations, src), rt = c?.tracks.find((t) => t.name === 'root.quaternion'); if (!rt) continue;
        const ri = rt.createInterpolant(), times = rt.times, n = times.length, rootV = new Float32Array(n * 4);
        const hips = c.tracks.filter((t) => /^pelvis_[LR]\.quaternion$/.test(t.name)).map((t) => ({ t, i: t.createInterpolant(), v: new Float32Array(n * 4) }));
        for (let k = 0; k < n; k++) {
          qr.fromArray(ri.evaluate(times[k]));
          f.set(0, 0, 1).applyQuaternion(qr);
          qn.setFromAxisAngle(UP, Math.atan2(f.x, f.z) * FW_TURN).multiply(q0).toArray(rootV, k * 4);
          qr.premultiply(qn.invert()); // (the rest of the take's root, for the hips)
          for (const h of hips) qh.fromArray(h.i.evaluate(times[k])).premultiply(qr).toArray(h.v, k * 4);
        }
        const tracks = [new THREE.QuaternionKeyframeTrack('root.quaternion', times.slice(), rootV), ...hips.map((h) => new THREE.QuaternionKeyframeTrack(h.t.name, times.slice(), h.v))];
        for (const t of c.tracks) if (FW_LEGS.test(t.name.split('.')[0]) && t.name !== 'root.quaternion' && !hips.some((h) => h.t === t)) tracks.push(t);
        add.push([new THREE.AnimationClip(name, c.duration, tracks), sp]);
      }
      if (!add.length) return;
      add.push([new THREE.AnimationClip('fight/upper', guard.duration, guard.tracks.filter((t) => !FW_LEGS.test(t.name.split('.')[0]))), 0]);
      for (const [clip, sp] of add) { clips.push(clip); STEPS.push([clip.name, sp]); LOCO.push(clip.name); W[clip.name] = 0; const a = act(clip.name); a.play(); a.setEffectiveWeight(0); }
      fwOn = true;
    }, () => {});
  }
  // one-shot moves: a few copies of each clip, so a move can cross-fade from itself (jab, jab)
  const pool = {};
  function copyOf(name) {
    const list = pool[name] || (pool[name] = []);
    let a = list.find((x) => !x.userData.live);
    if (!a) { const c = clipOf(name); if (!c) return null; a = mixer.clipAction(c.clone(), body); a.userData = {}; a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; list.push(a); }
    a.userData.live = true; a.enabled = true; a.timeScale = 0; a.setEffectiveWeight(0); a.play();
    return a;
  }
  const tracks = [];
  // play a move: from / until in clip seconds, ts its pace, fade its blend in; hold: stay on `until` until stopped;
  // loop: a held loop (a struggle, a carry)
  function play(name, { from = 0, until = null, ts = 1, fade = 0.08, fadeOut = 0.2, hold = false, loop = false } = {}) {
    const a = copyOf(name); if (!a) return null;
    const dur = a.getClip().duration;
    const tr = { name, a, t: from, from, until: until ?? dur, dur, ts, fade, fadeOut, hold, loop, w: fade <= 0 ? 1 : 0, out: 0, env: 0, wt: 0 };
    tracks.push(tr);
    return tr;
  }
  function stop(fadeOut = 0.22) { for (const t of tracks) if (!t.out) { t.out = 1e-6; t.fadeOut = fadeOut; } }
  function release(tr) { tr.a.setEffectiveWeight(0); tr.a.stop(); tr.a.userData.live = false; }
  // hands: world-space targets, eased in and out by weight
  const ARM = { L: ['upperarm01_L', 'lowerarm01_L', 'wrist_L'], R: ['upperarm01_R', 'lowerarm01_R', 'wrist_R'] };
  const LIMB = { fl: 'finger3-1_L', fr: 'finger3-1_R', footL: 'foot_L', footR: 'foot_R', head: 'head' };
  const hands = { L: { to: new THREE.Vector3(), w: 0, want: 0, pole: new THREE.Vector3(0, -1, -1) }, R: { to: new THREE.Vector3(), w: 0, want: 0, pole: new THREE.Vector3(0, -1, -1) } };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qw = new THREE.Quaternion();
  // turn bone b by the world rotation q (applied on top of its world orientation)
  function turnWorld(b, q) {
    b.getWorldQuaternion(_qw); _q2.copy(q).multiply(_qw);
    b.parent.getWorldQuaternion(_qw); b.quaternion.copy(_qw.invert().multiply(_q2));
    b.updateMatrixWorld(true);
  }
  function ik(side, h) {
    const [n1, n2, n3] = ARM[side], b1 = bones[n1], b2 = bones[n2], b3 = bones[n3]; if (!b1 || !b2 || !b3) return;
    const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
    b1.getWorldPosition(_a); b2.getWorldPosition(_b); b3.getWorldPosition(_c);
    const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
    _t.copy(h.to); const d = Math.min(la + lb - 1e-3, Math.max(1e-3, _t.distanceTo(_a)));
    // 1. bend the elbow to the angle that puts the wrist at the target's distance
    const cur = _p.subVectors(_a, _b).normalize().angleTo(_n.subVectors(_c, _b).normalize());
    const want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    _n.crossVectors(_p.subVectors(_a, _b), _n.subVectors(_c, _b)); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize();
    turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    // 2. swing the shoulder so the wrist points at the target
    b3.getWorldPosition(_c);
    turnWorld(b1, _q.setFromUnitVectors(_p.subVectors(_c, _a).normalize(), _n.subVectors(_t, _a).normalize()));
    // 3. roll the arm about shoulder -> target so the elbow points at the pole (down and back, by default)
    b2.getWorldPosition(_b);
    const ax = _p.subVectors(_t, _a).normalize();
    const e = _n.subVectors(_b, _a); e.addScaledVector(ax, -e.dot(ax));
    const pole = _c.copy(h.pole).applyQuaternion(person.mesh.quaternion); pole.addScaledVector(ax, -pole.dot(ax));
    if (e.lengthSq() > 1e-6 && pole.lengthSq() > 1e-6) { let ang = e.angleTo(pole); if (_b.crossVectors(e, pole).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
    // blended with the pose by weight
    if (h.w < 0.999) { b1.quaternion.slerpQuaternions(q1, _q.copy(b1.quaternion), h.w); b2.quaternion.slerpQuaternions(q2, _q2.copy(b2.quaternion), h.w); b1.updateMatrixWorld(true); }
  }
  const Q = WAGMI.dan = {
    body, mixer, clips: clips.map((c) => c.name), act, bones,
    // what the fight asks of the legs: fight (guard and footwork), speed (m/s), dir (the step against the facing: 0
    // ahead, +PI/2 to his left); null: the street's gaits by person.speed
    loco: null,
    timeScale: 1, pre: null, post: null,
    play, stop, tracks,
    top: () => tracks[tracks.length - 1] || null,
    get busy() { return tracks.some((t) => !t.out); },
    dur: (n) => clipOf(n)?.duration ?? 0,
    // a hand's reach for a world point (w: 0 lets go), its elbow pointing at pole (his frame)
    reach(side, to, w = 1, pole) { const h = hands[side]; if (to) h.to.copy(to); h.want = w; if (pole) h.pole.copy(pole); },
    hands, // (read only: the reaches as they stand)
    hand(side, out = new THREE.Vector3()) { const b = bones[side === 'L' ? 'finger3-1_L' : 'finger3-1_R'] || bones[ARM[side][2]]; return b.getWorldPosition(out); },
    // where a striking limb is now: fl / fr the knuckles, footL / footR the ankles (as the blows were measured)
    limb(name, out = new THREE.Vector3()) { const b = bones[LIMB[name]] || bones.root; body.updateMatrixWorld(true); return b.getWorldPosition(out); },
    // the standing correction over the pose as it is now (a still posed from a held clip frame: full on the idle, off on
    // any other), and the clip's own legs given back (before the car or a scene takes him)
    stand: (dt, clip) => stand.apply(clip === 'idle' ? 1 : 0),
    unstand() { plant.release(); stand.release(); standW = 0; },
  };
  // a scene's Dan (the cast's clips, mission/cine.js rig) standing on the idle's legs gets it too, by the idle legs'
  // share of the pose: over the clips, before the scene's own touches (his back upright, a hand to the phone)
  const IDLE_LEGS = /^idle(\/(noArmL|body|legs))?$/;
  function sceneStand(r) {
    if (!r || r.standing) return; r.standing = true;
    const pose = r.pose;
    r.pose = (t) => {
      const cur = pose(t); let k = 0;
      for (const a of mixer._actions) if (IDLE_LEGS.test(a.getClip().name) && r.owns(a)) k += a.getEffectiveWeight();
      // (the scene zeroes these after the clips, then tips him itself)
      body.position.y = 0; body.rotation.x = 0;
      stand.apply(Math.min(1, k));
      return cur;
    };
  }
  let directed = false;
  person.label = 'Dan';
  person.model = {
    update(dt, p, air) {
      // a cutscene (or anything else that directs him) drives the body itself, mixer and all; the moment it takes over
      // the moves and the fight's stance are let go and the gaits left as they were (it finds them as it always did)
      if (WAGMI.directed) {
        if (!directed) { directed = true; for (const t of tracks) release(t); tracks.length = 0; for (const [n] of STEPS) { W[n] = 0; act(n).setEffectiveWeight(0); } for (const h of Object.values(hands)) h.w = h.want = 0; Q.loco = null; Q.unstand(); sceneStand(WAGMI.cast?.qRig); }
        WAGMI.directed(dt, p, air); return;
      }
      // (back from it: the loops playing again, whatever it stopped, from the weights it left)
      if (directed) { directed = false; for (const n of LOCO) { const a = act(n); a.enabled = true; a.play(); W[n] = a.getEffectiveWeight(); } }
      Q.pre?.(dt, p, air);
      const d = dt * Q.timeScale, L = Q.loco;
      if (L && L.fight && !fwPack) footwork();
      const v = L ? L.speed : Math.abs(p.speed);
      // the street's gaits: which, by speed (the two nearest blended), and how fast its clip runs
      let k = 0; while (k < GAITS.length - 1 && v > GAITS[k + 1][1]) k++;
      const a = GAITS[k], b = GAITS[Math.min(GAITS.length - 1, k + 1)], f = b === a ? 0 : Math.min(1, Math.max(0, (v - a[1]) / (b[1] - a[1])));
      const want = {};
      for (const [n] of GAITS) want[n] = n === a[0] ? 1 - f : n === b[0] ? f : 0;
      // (one phase for the moving gaits: it goes round at the speed over the blend's stride (a clip's stride: its speed
      // times its cycle), its pace clamped as each clip's was (0.6-1.6 of its own); each clip shown at that phase)
      { let S = 0, D = 0, wt = 0;
        for (const [g, x] of [[a, 1 - f], [b, f]]) if (g[1] && x > 0) { const cy = act(g[0]).getClip().duration; S += g[2] * cy * x; D += cy * x; wt += x; }
        if (wt > 0) { S /= wt; D /= wt; gPhase = (gPhase + (d * Math.max(0.6, Math.min(1.6, (v * D) / S || 0))) / D) % 1; }
        for (const [n, th] of GAITS) if (th) { const x = act(n); x.timeScale = 0; x.time = gPhase * x.getClip().duration; } }
      // the fight's: the guard standing, the footwork by direction (cosine shares) as he moves; running, the gaits
      const fight = L && L.fight && v < 3.2 ? 1 : 0;
      for (const [n] of STEPS) want[n] = 0;
      if (fight) {
        for (const n in want) want[n] = 0;
        const m = smooth((v - 0.12) / 0.5), c = Math.cos(L.dir || 0), s = Math.sin(L.dir || 0);
        // (back and to the sides: the motion-capture steps once they're in, the legs alone, his guard over them)
        const sh = fwOn ? { fwF: Math.max(0, c), fwB: Math.max(0, -c), fwL: Math.max(0, s), fwR: Math.max(0, -s) }
          : { guardF: Math.max(0, c), guardB: Math.max(0, -c), guardL: Math.max(0, s), guardR: Math.max(0, -s) };
        for (const n in sh) if (!clipOf(n)) sh[n] = 0;
        let tot = 0; for (const n in sh) tot += sh[n]; tot = tot || 1;
        want.fight = 1 - m;
        if (fwOn) want['fight/upper'] = m * (1 - (sh.guardF || 0) / tot);
        for (const [n, sp] of STEPS) if (sp) { want[n] = m * (sh[n] || 0) / tot; act(n).timeScale = Math.max(0.6, Math.min(n.startsWith('fw') ? 2.5 : 2.2, v / sp)); }
      }
      // the moves over them: newest on top, each over what is below by its own blend; the legs get what is left
      for (const t of tracks) {
        t.t = t.loop ? (t.t + d * t.ts) % t.dur : Math.min(t.until, t.t + d * t.ts);
        t.w = Math.min(1, t.w + d / Math.max(1e-3, t.fade));
        if (t.out) t.out += d / Math.max(1e-3, t.fadeOut);
        if (!t.hold && !t.loop && t.t >= t.until && !t.out) t.out = 1e-6;
        t.env = smooth(t.w) * (1 - smooth(t.out));
      }
      let rem = 1;
      for (let i = tracks.length - 1; i >= 0; i--) { const t = tracks[i]; t.wt = t.env * rem; rem -= t.wt; }
      // (a move under one fully blended in is gone for good)
      let covered = false;
      for (let i = tracks.length - 1; i >= 0; i--) {
        const t = tracks[i];
        if (t.out >= 1 || covered) { release(t); tracks.splice(i, 1); continue; }
        t.a.time = t.t; t.a.setEffectiveWeight(t.wt);
        if (t.env >= 0.999) covered = true;
      }
      for (const n of LOCO) { W[n] += (want[n] - W[n]) * Math.min(1, dt * 10); act(n).setEffectiveWeight(W[n] * rem); }
      if (fwOn) act('fight/upper').time = act('fight').time; // (in step with the guard below it)
      mixer.update(d);
      body.position.y = 0;
      plant.restore();
      // standing still: not stepping, not in the fight's guard, no move on him (a blow, a vault, down, a pick-up), on
      // the ground, not getting in or out of the car; by the idle's share of the pose
      if (p.inVehicle || (WAGMI.ride?.phase && WAGMI.ride.phase !== 'walk')) Q.unstand();
      else {
        const still = !(L && L.fight) && v < 0.25 && !air && !tracks.length && !WAGMI.ride?.phase;
        standW = Math.min(1, Math.max(0, standW + (still ? dt : -dt) / STAND_EASE));
        stand.apply(smooth(standW) * Math.min(1, W.idle * rem));
        let mv = 0; for (const [n, sp] of GAITS) if (sp) mv += W[n];
        plant.apply(dt, still, mv * rem);
      }
      // the hands' reach, over the pose
      for (const s of ['L', 'R']) { const h = hands[s]; h.w += (h.want - h.w) * Math.min(1, dt * 14); if (h.w > 0.01) { body.updateMatrixWorld(true); ik(s, h); } }
      Q.post?.(d, p, air);
    },
  };
}

/* ------------------------------------------------------- in and out of it -- */
// GTA style, with the car's doors (roadster.js) and the driver's way in and out of his seat (createDriver):
//  - F beside it walks him to the driver's door the short way round the car, his hand lifts the door, he gets in, the
//    door comes down and the engine starts, the camera easing over to the car's. F again or a drive key: in at once. In
//    a fight, or with that side against a wall: in at once, the door flung up and slammed.
//  - F in it, slow: it brakes to a stop, the door goes up, he climbs out and stands by it, the door comes down (F or a
//    move key: out at once). From BAIL m/s up he dives out and rolls, and the car runs on, its door up, till it stops.
//  - An F the game sends itself (the fight's drag-out, ?fight) works the old way, at once. Whatever else puts him in or
//    out (a scene's place(), the sandbox's mode keys) is followed: in the car means at the wheel, on foot means out.
// WAGMI.ride: phase (null, 'walk', 'in', 'stop', 'out' or 'bail'), getIn(quick), getOut(quick), skip(), door() (0..1),
// driver (createDriver's)
const BAIL = 10, T_IN = 1.15, T_OUT = 1.05, MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const rs = car.roadster, Q = WAGMI.dan, cs = app.cameraSystem, cam = cs.camera, drv = createDriver(THREE, rs, Q);
// (into the seat from his clip's own legs, not the standing correction: the seat's way in measures his idle hips once)
{ const attach = drv.attach; drv.attach = (ease) => { Q.unstand(); attach(ease); }; }
const ride = (WAGMI.ride = { phase: null, mode: null, k: 1, t: 0 });
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _cl = new THREE.Vector3();
// the car's own frame (x across it, +x its left, the driver's side; z along it) to the world's, and back
const toWorld = (lx, lz, out = new THREE.Vector3()) => { const c = Math.cos(car.heading), s = Math.sin(car.heading); return out.set(car.position.x + lx * c + lz * s, car.position.y, car.position.z - lx * s + lz * c); };
const toLocal = (p, out = { x: 0, z: 0 }) => { const c = Math.cos(car.heading), s = Math.sin(car.heading), dx = p.x - car.position.x, dz = p.z - car.position.z; out.x = dx * c - dz * s; out.z = dx * s + dz * c; return out; };
const ground = (p) => cm.getGroundHeight(p.x, p.z, 'person');
const near = () => Math.hypot(person.position.x - car.position.x, person.position.z - car.position.z) < 4.2 * (rs.scale || 1);
// (a spot he can't stand on: in a building)
const walled = (p) => { _v.set(p.x, ground(p), p.z); cm.resolveHorizontalCollision(_v, 0.35, _v.y + 1.0); return hdist(_v, p) > 0.02; };
const sound = (name, vol = 1, at = null) => { const p = at || toWorld(((car.body?.hx ?? 1) + 0.1) * (door.side === 'R' ? -1 : 1), 0.1, _w); WAGMI.audio?.play?.(name, { pos: [p.x, p.y + 0.8, p.z], vol }); };
// (jobs for later, seconds from now; a new move clears them)
let jobs = [];
const later = (secs, fn) => jobs.push({ t: secs, fn });

// the door he uses (side: the driver's, L; the passenger's, R, when he gets out that way): p its way up (0 to 1, eased
// on the hinge) going toward want; shut, it thunks (slam: a slam), and starts the engine if he just got in
const door = { p: 0, want: 0, rate: 2, slam: false, side: 'L' };
function doorTo(want, secs, slam = false) {
  door.rate = 1 / secs; door.slam = slam;
  if (door.want === want) return;
  door.want = want; if (want) sound('doorOpen', 0.9);
}
function doorStep(dt) {
  if (door.p === door.want) return;
  door.p += Math.sign(door.want - door.p) * Math.min(Math.abs(door.want - door.p), dt * door.rate);
  if (door.p === 0) { sound(door.slam ? 'doorClose' : 'doorThunk', 1); if (ride.engine) { ride.engine = false; sound('engineStart', 0.9); } }
  rs.setDoor(door.side, door.p < 0.5 ? 4 * door.p ** 3 : 1 - (-2 * door.p + 2) ** 3 / 2);
}
// (the other door: the one that was up shut at once)
function doorSide(s) {
  if (door.side === s) return;
  rs.setDoor(door.side, 0);
  Object.assign(door, { side: s, p: 0, want: 0 });
}

// the camera: over T s from where it was to wherever the city's camera wants it now (it follows the mode); where it was
// carried along with `with` (a point that moves, as he does diving out of a fast car)
const blend = { on: false, t: 0, T: 1, pos: new THREE.Vector3(), look: new THREE.Vector3(), with: null, at: new THREE.Vector3(), off: new THREE.Vector3() };
function camFrom(T, withPt = null) {
  cam.getWorldDirection(_cl);
  blend.pos.copy(cam.position); blend.look.copy(cam.position).addScaledVector(_cl, Math.max(2, cam.position.distanceTo(cs.currentLookAt)));
  Object.assign(blend, { on: true, t: 0, T, with: withPt }); if (withPt) blend.at.copy(withPt);
}
{
  const base = cs.update.bind(cs);
  cs.update = function (dt, el) {
    base(dt, el);
    if (!blend.on) return;
    blend.t += dt * (ride.slow || 1); const e = smooth(blend.t / blend.T);
    if (e >= 1 || WAGMI.cutscene || WAGMI.directed) { blend.on = false; return; }
    const off = blend.with ? blend.off.subVectors(blend.with, blend.at).setY(0) : blend.off.set(0, 0, 0);
    cam.position.lerpVectors(_v.copy(blend.pos).add(off), cam.position, e); cam.lookAt(_cl.lerpVectors(_w.copy(blend.look).add(off), cs.currentLookAt, e));
  };
}

// his way to the door: straight there, or by the corners round the car (its box, his room round it, kept clear), the
// shortest; as world points
function route(from) {
  const B = car.body, hx = B.hx + 0.45, z0 = B.z0 - 0.45, z1 = B.z1 + 0.45, m = 0.62;
  const S = toLocal(from), D = { x: drv.door[0], z: drv.door[1] };
  // (pressed up against it: from just off its side)
  if (Math.abs(S.x) < hx && S.z > z0 && S.z < z1) { const ex = hx - Math.abs(S.x), e0 = S.z - z0, e1 = z1 - S.z; if (ex <= Math.min(e0, e1)) S.x = Math.sign(S.x || 1) * (hx + 0.01); else S.z = e0 < e1 ? z0 - 0.01 : z1 + 0.01; }
  const crosses = (a, b) => {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[a.x, b.x - a.x, -hx, hx], [a.z, b.z - a.z, z0, z1]]) {
      if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) return false; continue; }
      let u0 = (lo - p) / d, u1 = (hi - p) / d; if (u0 > u1) [u0, u1] = [u1, u0];
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t1 - t0 <= 1e-6) return false;
    }
    return true;
  };
  const N = [S, ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => ({ x: sx * (B.hx + m), z: sz > 0 ? B.z1 + m : B.z0 - m })), D];
  const dist = N.map(() => Infinity), prev = N.map(() => -1), done = N.map(() => false); dist[0] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === N.length - 1) break; done[u] = true;
    for (let v = 0; v < N.length; v++) if (!done[v] && !crosses(N[u], N[v])) { const d = dist[u] + Math.hypot(N[u].x - N[v].x, N[u].z - N[v].z); if (d < dist[v]) { dist[v] = d; prev[v] = u; } }
  }
  const path = []; for (let i = N.length - 1; i > 0; i = prev[i]) { if (i < 0) return [toWorld(D.x, D.z)]; path.unshift(toWorld(N[i].x, N[i].z)); }
  return path;
}

// (something standing in his way at p: a building, or a post, a hydrant, a bench... the crash's props still up)
function blocked(p) {
  if (walled(p)) return true;
  for (const b of WAGMI.crash?.props?.around(p.x, p.z, 2) || []) if (!b.taken && hdist(b, p) < (b.w ? Math.max(b.w, b.d) / 2 : b.r || 0.3) + 0.3) return true;
  return false;
}
// in: walk round to the door, then climb in (or at once). All of it within IN_MAX s: a way round with anything in it
// (a wall, a post) isn't walked, and a walk that takes longer ends with him in at once
const IN_MAX = 1.5;
function getIn(quick = false) {
  if (ride.phase) return;
  doorSide('L');
  if (quick || walled(toWorld(drv.door[0], drv.door[1]))) return inQuick();
  jobs = [];
  const path = route(person.position);
  let L = 0; for (let i = 0; i < path.length; i++) L += hdist(i ? path[i - 1] : person.position, path[i]);
  for (let i = 0; i < path.length; i++) {
    const a = i ? path[i - 1] : person.position, b = path[i], n = Math.ceil(hdist(a, b) / 0.5);
    for (let k = 1; k <= n; k++) if (blocked(_cl.set(a.x + (b.x - a.x) * k / n, 0, a.z + (b.z - a.z) * k / n))) return inQuick();
  }
  // (coming down the side from ahead, the door swings into his way: it opens once he's there)
  const lastFrom = toLocal(path.length > 1 ? path[path.length - 2] : person.position);
  Object.assign(ride, { phase: 'walk', mode: 'person', path, i: 0, t: 0, v: Math.min(6.4, Math.max(1.8, L * 1.1)), limit: IN_MAX - 0.35, early: lastFrom.z < drv.door[1] + 0.6 });
}
function walkStep(dt) {
  const P = person, path = ride.path;
  // (knocked down on the way: that's the end of it)
  if (WAGMI.combat?.player?.down) return abort();
  ride.t += dt;
  let rem = 0; for (let i = ride.i; i < path.length; i++) rem += hdist(i === ride.i ? P.position : path[i - 1], path[i]);
  // at his pace, easing to a stop at the door (the last few cm stepped)
  if (rem < 0.04 && ride.i < path.length) { const e = path[path.length - 1]; P.position.x = e.x; P.position.z = e.z; ride.i = path.length; rem = 0; }
  P.speed += (Math.min(ride.v, 0.3 + Math.sqrt(10 * rem)) * (rem > 0 ? 1 : 0) - P.speed) * Math.min(1, dt * 8);
  let go = P.speed * dt;
  while (go > 1e-6 && ride.i < path.length) {
    const to = path[ride.i], d = hdist(P.position, to);
    if (d <= go) { P.position.x = to.x; P.position.z = to.z; go -= d; ride.i++; } else { P.position.x += (to.x - P.position.x) / d * go; P.position.z += (to.z - P.position.z) / d * go; go = 0; }
  }
  // facing the way he goes, and the car's way at the door
  const to = path[Math.min(ride.i, path.length - 1)], there = ride.i >= path.length || (ride.i === path.length - 1 && hdist(P.position, to) < 0.3);
  const face = there ? car.heading : Math.atan2(to.x - P.position.x, to.z - P.position.z), a = wrap(face - P.heading);
  P.heading += Math.sign(a) * Math.min(Math.abs(a), dt * 9);
  P.position.y = ground(P.position); P.verticalVel = 0;
  P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading;
  // the door up as he comes to it, his near hand (the right) lifting it by its edge
  if (!door.want && (ride.i >= path.length || rem < (ride.early ? 0.7 : 1.2))) doorTo(1, 0.45);
  const inner = rs.doors?.L?.pivot.children[0];
  if (door.want && door.p < 0.45 && inner) { inner.updateWorldMatrix(true, false); Q.reach('R', inner.localToWorld(_v.set(0.86, 0.86, -0.18)), 1); } else Q.reach('R', null, 0);
  if (ride.i >= path.length && door.p >= 0.5 && Math.abs(wrap(car.heading - P.heading)) < 0.2) startIn();
  // (out of time: at the door, in; still on his way, in at once)
  else if (ride.t > ride.limit) { if (rem < 0.6) startIn(); else inQuick(); }
}
function startIn() {
  Q.reach('R', null, 0);
  camFrom(1.2);
  person.inVehicle = true; person.speed = 0; person.mesh.visible = false;
  app.selectMode('car'); car.speed = 0; cs.orbitYawOffset = 0;
  if (!drv.attached) drv.attach();
  Object.assign(ride, { phase: 'in', mode: 'car', k: 0, t: 0 });
  doorTo(1, 0.4);
}
function inQuick() {
  jobs = []; ride.phase = null; ride.k = 1; doorSide('L');
  Q.reach('R', null, 0);
  person.inVehicle = true; person.speed = 0; person.mesh.visible = false;
  app.selectMode('car'); car.speed = 0;
  if (!drv.attached) drv.attach(0.12);
  door.p = Math.max(door.p, 0.55); doorTo(1, 0.12); later(0.3, () => { doorTo(0, 0.22, true); ride.engine = true; });
}

// out: brake to a stop, then climb out; fast, a dive
function getOut(quick = false) {
  if (ride.phase) return;
  if (quick) return outQuick();
  if (Math.abs(car.speed) >= BAIL) return bail();
  jobs = [];
  if (Math.abs(car.speed) > 0.3) { Object.assign(ride, { phase: 'stop', mode: 'car' }); car.halt = 22; return; }
  startOut();
}
function startOut() {
  const d = toWorld(drv.door[0], drv.door[1]);
  car.halt = 0; car.speed = 0;
  if (walled(d)) return outQuick();
  doorSide('L'); camFrom(1.1);
  person.position.set(d.x, ground(d), d.z); person.heading = car.heading; person.speed = 0; person.verticalVel = 0;
  person.inVehicle = false; person.mesh.visible = true;
  app.selectMode('person');
  Object.assign(ride, { phase: 'out', mode: 'person', k: 1, t: 0 });
  doorTo(1, 0.5);
}
function finishOut() { if (drv.attached) drv.detach(person.mesh); ride.phase = null; ride.k = 1; doorTo(0, 0.5); }
// (the old way: out at the driver's door at once, 1.75 m off the car's middle; the door flung up and slammed. With that
// side against a wall or a post: out of the passenger's, the view swung out off the car's flank for a beat, so its body
// doesn't fill the frame)
function outQuick() {
  jobs = []; ride.phase = null; ride.k = 1; car.halt = 0;
  const h = car.heading, side = 1.75, s = blocked(toWorld(side, 0, _w)) && !blocked(toWorld(-side, 0, _w)) ? -1 : 1;
  doorSide(s > 0 ? 'L' : 'R');
  person.position.set(car.position.x + Math.cos(h) * side * s, car.position.y, car.position.z - Math.sin(h) * side * s);
  person.position.y = ground(person.position);
  person.heading = h; person.inVehicle = false; person.mesh.visible = true; person.verticalVel = 0;
  car.speed = 0;
  if (drv.attached) drv.detach(person.mesh);
  app.selectMode('person');
  if (s < 0) { cs.orbitYawOffset = 0.35; cs.userOrbitTimer = 1.2; }
  door.p = Math.max(door.p, 0.4); doorTo(1, 0.15); later(0.9, () => doorTo(0, 0.4, true));
}
// the dive: the door flung up while he braces in his seat (LAUNCH s), then out of it with the car's way on him, a roll
// on the road, up on his feet; the car runs on
const LAUNCH = 0.12;
function bail() {
  jobs = []; doorSide('L');
  const seat = toWorld(rs.seat.hip[0], rs.seat.hip[2], _w); person.position.set(seat.x, ground(seat), seat.z);
  camFrom(0.9, person.position);
  person.inVehicle = false; person.speed = 0; person.verticalVel = 0;
  app.selectMode('person');
  Object.assign(ride, { phase: 'bail', mode: 'person', t: 0, k: 1, h: car.heading, f0: null, out: false, landed: false });
  door.p = Math.max(door.p, 0.2); doorTo(1, 0.14);
  bailStep(0);
}
function bailStep(dt) {
  const P = person, t = (ride.t += dt), h = ride.h;
  if (!ride.out) {
    // (in his seat, the car's)
    const seat = toWorld(rs.seat.hip[0], rs.seat.hip[2], _w);
    P.position.set(seat.x, ground(seat), seat.z); P.heading = car.heading;
    if (t < LAUNCH) return;
    ride.out = true; ride.h = car.heading; ride.f0 = Math.max(-30, Math.min(30, car.speed));
    if (drv.attached) drv.detach(person.mesh);
    P.mesh.visible = true; P.heading = ride.h + 1.1;
    Q.play('roll', { from: 0.12, ts: 1.05, fade: 0.08, fadeOut: 0.25 });
    sound('whoosh', 0.8, P.position);
  }
  // (with the car for the first beat, clearing its side; then the road takes his way off him)
  const u = t - LAUNCH, vf = u < 0.18 ? car.speed : ride.f0 * Math.exp(-3.2 * (u - 0.18)), vs = 6 * (u < 0.15 ? 1 : Math.exp(-6 * (u - 0.15)));
  P.position.x += (Math.sin(ride.h) * vf + Math.cos(ride.h) * vs) * dt; P.position.z += (Math.cos(ride.h) * vf - Math.sin(ride.h) * vs) * dt;
  cm.resolveHorizontalCollision(P.position, 0.42, P.position.y + 1.0);
  P.position.y = ground(P.position); P.verticalVel = 0; P.speed = 0;
  P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading;
  if (!ride.landed && u > 0.45) { ride.landed = true; sound('pedHit', 0.45, P.position); }
  if (u > 1.2) ride.phase = null;
}
// nobody at the wheel: it rolls on, slowing, into whatever is in its way; at rest, its door comes down
function coast(dt) {
  if (cm.activeMode === 'car' || (!car.speed && !car.vx && !car.vz)) return;
  const s = Math.abs(car.speed);
  car.speed -= Math.sign(car.speed) * Math.min(s, (1.2 + 0.3 * s) * dt);
  car.angularVel = (car.angularVel || 0) * Math.exp(-dt * 7.8); car.heading += car.angularVel * dt;
  car.position.x += (Math.sin(car.heading) * car.speed + (car.vx || 0)) * dt; car.position.z += (Math.cos(car.heading) * car.speed + (car.vz || 0)) * dt;
  const g = Math.exp(-dt * 6.8); car.vx = (car.vx || 0) * g; car.vz = (car.vz || 0) * g;
  if (Math.abs(car.vx) + Math.abs(car.vz) < 0.02) car.vx = car.vz = 0;
  cm.resolveHorizontalCollision(car.position, 1.35, 1.0, car);
  car.position.y = cm.getGroundHeight(car.position.x, car.position.z, 'car');
  car.mesh.position.copy(car.position); car.mesh.rotation.y = car.heading;
  if (Math.abs(car.speed) < 0.05) { car.speed = 0; if (!ride.phase && door.want) doorTo(0, 0.6); }
}

// F again (or a drive key): the rest of it at once
function skip() {
  if (ride.phase === 'walk') inQuick();
  else if (ride.phase === 'in') ride.k = 1;
  else if (ride.phase === 'out') finishOut();
}
// something else took him (a scene, a mode key): what was going stops where it is
function abort() {
  ride.phase = null; ride.k = 1; car.halt = 0; jobs = [];
  Q.reach('R', null, 0);
  if (cm.activeMode !== 'car' && drv.attached) drv.detach(person.mesh);
  if (door.want) doorTo(0, 0.4);
}
// every frame, before his body is posed (person.model.update, below)
function step(dt) {
  if (jobs.length) { for (const j of jobs) j.t -= dt; const due = jobs.filter((j) => j.t <= 0); jobs = jobs.filter((j) => j.t > 0); for (const j of due) j.fn(); }
  const mode = cm.activeMode;
  if (ride.phase && (WAGMI.directed || WAGMI.cutscene || mode !== ride.mode)) abort();
  doorStep(dt); coast(dt);
  switch (ride.phase) {
    case 'walk': walkStep(dt); break;
    case 'in':
      ride.k = Math.min(1, ride.k + dt / T_IN);
      if (cm.keys.forward || cm.keys.backward || cm.keys.left || cm.keys.right) ride.k = 1;
      if (ride.k > 0.84 && door.want) { doorTo(0, ride.k >= 1 ? 0.3 : 0.5); ride.engine = true; }
      if (ride.k >= 1) ride.phase = null;
      break;
    case 'stop': if (Math.abs(car.speed) < 0.3) startOut(); break;
    case 'out':
      ride.t += dt;
      if (door.p > 0.45) ride.k = Math.max(0, ride.k - dt / T_OUT);
      if (ride.k <= 0) finishOut();
      break;
    case 'bail': bailStep(dt); break;
  }
  // in the car means at the wheel (unless a scene has him); on foot, out of it
  if (!ride.phase) {
    if (mode === 'car' && !WAGMI.directed) { if (!drv.attached) { person.inVehicle = true; person.mesh.visible = false; drv.attach(0); } ride.k = 1; }
    else if (drv.attached) drv.detach(person.mesh);
  }
  // (at the wheel, where he is is where the car is)
  if (drv.attached && mode === 'car') { person.position.copy(car.position); person.heading = car.heading; }
}
// his feet are his own on foot, not while a move of this has him: person.control is this; whatever else is set there
// (the fight's footwork) runs under it, the latest first (one that wraps what it found gets the one before)
const unders = [];
let depth = 0;
const control = (dt, keys, mgr) => {
  if (ride.phase) return true;
  const f = unders[unders.length - 1 - depth]; if (!f) return false;
  depth++; try { return f(dt, keys, mgr); } finally { depth--; }
};
if (person.control) unders.push(person.control);
Object.defineProperty(person, 'control', { configurable: true, get: () => control, set: (f) => { if (typeof f === 'function' && f !== control) unders.push(f); } });
{
  const base = person.model.update;
  // (ride.slow, for looking at it: all of this in slow motion)
  person.model.update = (dt, p, air) => {
    dt *= ride.slow || 1;
    step(dt);
    if (drv.attached) { drv.pose(dt, ride.k); return; }
    base(dt, p, air);
  };
}
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyF' || e.repeat) return;
  // (the game's own F: the old way, at once; a game pad's (wagmi/pad.js, e.wgPad) is the player's, as a real key)
  if (!e.isTrusted && !e.wgPad) { if (cm.activeMode === 'person' && near()) inQuick(); else if (cm.activeMode === 'car' && Math.abs(car.speed) < 4) outQuick(); return; }
  if (WAGMI.cutscene || WAGMI.directed) return;
  if (ride.phase) return skip();
  if (cm.activeMode === 'person' && near()) getIn(!!WAGMI.combat?.fighting);
  else if (cm.activeMode === 'car') getOut();
});
addEventListener('keydown', (e) => {
  if (!ride.phase || (!e.isTrusted && !e.wgPad) || e.repeat || !MOVE.has(e.code)) return;
  // (braking to get out: the throttle or reverse keeps him driving)
  if (ride.phase === 'stop') { if (/W|S|Up|Down/.test(e.code)) { ride.phase = null; car.halt = 0; } return; }
  if (ride.phase === 'bail') return;
  skip();
});
Object.assign(ride, { getIn, getOut, skip, door: () => door.p, driver: drv });
// X in the car: the reset (WAGMI.recoverCar), not while a scene, the pause or the map has the keys
addEventListener('keydown', (e) => {
  if (e.code !== WAGMI.recoverCar.key || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
  if (cm.activeMode !== 'car' || WAGMI.paused || app.mapSystem?.isFullMapOpen) return;
  WAGMI.recoverCar();
});
// Q at the wheel: ALL ELECTRIC (the quiet mode) or the engine (WAGMI.toggleDriveMode, audio/drivemode.js: the sound
// follows, the badge in the speed panel shows it, remembered). Only driving: on foot Q is the fight's counter; not while
// a scene, the pause, the map or getting in and out has the keys
const DRIVE_KEY = 'KeyQ';
addEventListener('keydown', (e) => {
  if (e.code !== DRIVE_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
  if (cm.activeMode !== 'car' || WAGMI.paused || WAGMI.cutscene || WAGMI.directed || ride.phase || app.mapSystem?.isFullMapOpen) return;
  if (document.body.classList.contains('wg-gating') || document.body.classList.contains('wg-cine')) return;
  WAGMI.toggleDriveMode();
});
// ...and in the car's controls bar (js/main.js draws it per mode): X, Reset car; Q, Electric / Engine
{
  const bar = document.getElementById('hud-controls-hint');
  const addItem = (cls, key, label) => {
    if (bar.querySelector('.' + cls)) return;
    const item = document.createElement('span'); item.className = 'hint ' + cls;
    const k = document.createElement('kbd'); k.textContent = key;
    const l = document.createElement('span'); l.className = 'hint-label'; l.textContent = label;
    item.append(k, l); bar.appendChild(item);
  };
  const addCarKeys = () => {
    if (!bar || cm.activeMode !== 'car') return;
    addItem('wg-reset', 'X', 'Reset car');
    addItem('wg-drivemode', DRIVE_KEY.replace(/^Key/, ''), 'Electric / Engine');
  };
  if (bar) new MutationObserver(addCarKeys).observe(bar, { childList: true });
  addCarKeys();
}
// the drive mode's badge in the speed panel, right of the speed: ENGINE (warm amber, an engine block) or ELECTRIC (cool
// cyan, a bolt), its key beside it; a pulse on each change. In the car only (the panel's own mode, body[data-mode])
{
  const css = document.createElement('style');
  css.textContent = `
#wg-drive { display: none; align-self: center; margin-left: auto; align-items: center; gap: 5px; padding: 4px 7px 4px 6px; border-radius: 7px;
  font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap;
  color: var(--wgd); background: color-mix(in srgb, var(--wgd) 14%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wgd) 50%, transparent);
  transition: color .25s, background-color .25s, box-shadow .25s; --wgd: #FFB547; }
body[data-mode='car'] #wg-drive { display: inline-flex; }
#wg-drive.ev { --wgd: #45E3FF; }
#wg-drive svg { width: 14px; height: 14px; flex: none; fill: currentColor; }
#wg-drive svg.ev, #wg-drive.ev svg.eng { display: none; }
#wg-drive.ev svg.ev { display: block; }
#wg-drive kbd { margin-left: 2px; padding: 1px 4px; border-radius: 4px; font: inherit; font-size: 10px; letter-spacing: 0; color: rgba(255,255,255,.7); box-shadow: inset 0 0 0 1px rgba(255,255,255,.3); background: none; }
#wg-drive.pulse { animation: wgDrivePulse .7s ease-out; }
@keyframes wgDrivePulse { 0% { transform: scale(1); } 22% { transform: scale(1.16); box-shadow: inset 0 0 0 1px var(--wgd), 0 0 16px 2px color-mix(in srgb, var(--wgd) 70%, transparent); } 100% { transform: scale(1); } }`;
  document.head.appendChild(css);
  const row = document.querySelector('#hud-cluster .gauge-speed');
  if (row) {
    const el = document.createElement('span'); el.id = 'wg-drive';
    el.innerHTML = '<svg class="eng" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h7v2h-2.5v2H15l2 2h2V8h3v9h-3v-2h-2l-2.5 3H8.5L6 15.5V13H4v3H2V8h2v3h2V8h3.5V6H7z"/></svg>'
      + '<svg class="ev" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 1 4 14h6.5L9 23l11-13.5h-6.8z"/></svg><span class="w"></span><kbd></kbd>';
    el.querySelector('kbd').textContent = DRIVE_KEY.replace(/^Key/, '');
    row.appendChild(el);
    const show = (pulse) => {
      const ev = drive.mode === 'electric';
      el.classList.toggle('ev', ev); el.querySelector('.w').textContent = ev ? 'Electric' : 'Engine';
      el.title = `${ev ? 'All electric' : 'Engine'}: ${DRIVE_KEY.replace(/^Key/, '')} switches`;
      if (pulse) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
    };
    el.addEventListener('animationend', () => el.classList.remove('pulse'));
    addEventListener('wagmi:drivemode', () => show(true));
    show(false);
  }
  // (and the car's boost burning cyan rather than orange while it is electric, where the roadster has that: setElectric)
  const tint = () => car.roadster?.setElectric?.(drive.mode === 'electric');
  addEventListener('wagmi:drivemode', tint);
  tint();
}

const hint = document.createElement('div');
hint.id = 'wg-prompt';
Object.assign(hint.style, { position: 'fixed', left: '50%', bottom: '120px', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: '12px',
  background: 'rgba(10,12,18,0.72)', color: '#fff', font: '600 15px system-ui, sans-serif', letterSpacing: '0.04em', zIndex: 20, display: 'none', pointerEvents: 'none',
  transition: 'bottom 0.2s', whiteSpace: 'nowrap' });
document.body.appendChild(hint);
// (never on the mission's objective line or the subtitle under it: over them, 10 px clear, wherever they would meet)
function placeHint() {
  const hr = hint.getBoundingClientRect(), H = innerHeight, cx = innerWidth / 2;
  const lines = [];
  for (const el of document.querySelectorAll('#wg .wg-obj, #wg .wg-sub')) {
    if (el.classList.contains('hide') || !el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.height && r.right > cx - hr.width / 2 - 8 && r.left < cx + hr.width / 2 + 8) lines.push(r);
  }
  let bottom = 120;
  for (const r of lines.sort((a, b) => b.bottom - a.bottom)) if (r.top < H - bottom + 10 && r.bottom > H - bottom - hr.height - 10) bottom = H - r.top + 10;
  if (hint.style.bottom !== bottom + 'px') hint.style.bottom = bottom + 'px';
}
// the prompt, and the car's parked thrust settling
let last = performance.now();
(function tick() {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  WAGMI.carIdle(dt);
  WAGMI.resetHold();
  // (held going nowhere a beat in the car, or stopped facing the wrong way: the reset offered first)
  const wrongWay = WAGMI.carWrongWay(ride.phase || WAGMI.paused || WAGMI.cutscene || WAGMI.directed ? 0 : dt) > 0;
  const pinned = cm.activeMode === 'car' && ((WAGMI.carStuck?.() || 0) > 1.2 || wrongWay);
  const show = ride.phase || WAGMI.paused || WAGMI.cutscene || WAGMI.directed ? '' : cm.activeMode === 'person' && near() ? 'F  ·  Get in'
    : pinned ? 'X  ·  Reset car to road' : cm.activeMode === 'car' && Math.abs(car.speed) < 4 ? 'F  ·  Get out' : '';
  // (the key in a key cap that reads as plain text, so a game pad's button can stand in for it: wagmi/pad.js; what is
  // offered, WAGMI.prompt, for the pad's Y: the car's door, or else the fight's heavy)
  WAGMI.prompt = show;
  if (hint.dataset.s !== show) { hint.dataset.s = show; hint.innerHTML = show ? `<kbd>${show[0]}</kbd>${show.slice(1)}` : ''; }
  hint.style.display = show ? 'block' : 'none';
  if (show) placeHint();
  requestAnimationFrame(tick);
})();
WAGMI.ready = true;
console.log('[wagmi] Dan and the car are in');
// the cold open's music (wagmi/trailer.js) asked for from here, alongside the rest of the game, not once the intro is in:
// on a first visit it is the last thing the trailer waits for. The intro takes it (intro.js: WAGMI.trailerEarly; null
// where there is no trailer: ?trailer=0, ?nointro, ?nogate, a mission switch)
WAGMI.trailerEarly = import('./trailer.js').then((m) => m.createTrailer(WAGMI)).catch((err) => { console.warn('[wagmi] trailer', err); return null; });

// the rest of the game, a module each (one that fails to load leaves the others running)
for (const m of ['./pad.js', './audio/index.js', './combat/index.js', './street/index.js', './crash/index.js', './pursuit/index.js', './radio/index.js', './mission/calls.js', './intro.js', './mission/m2.js', './mission/m3.js']) {
  try { const mod = await import(m); if (mod.install) await mod.install(WAGMI); } catch (err) { console.error('[wagmi]', m, err); }
}
