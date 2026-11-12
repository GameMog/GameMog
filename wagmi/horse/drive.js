// Mog City: Ranger over the ground, in place of the car's physics (js/controllers.js updateCar) while the car entity is
// a horse (wagmi/game.js swaps it in; nothing in js/ changes). What a horse does that a car doesn't:
//  - its paces from the keys: W a trot (4.5 m/s), Shift with it a gallop (12), Q switches W to a walk (1.8), a pad's
//    trigger or a touch stick under half way a walk too; S slows it, then backs it up at 1 m/s; let go, it eases down
//    through its gaits to a stand. It picks up and slows a horse's way (3 m/s² up to a trot, 4 to a gallop, 2.6 easing
//    off, 7 on the reins, 9 pulling up for him to get down);
//  - its turn: the city's keyboard steering (steerHandled) on a horse's handling (a 1.8 m circle at a walk, at most
//    1.9 rad/s, never more than 11 m/s² sideways: a wide sweep at a gallop); stopped, it turns on the spot;
//  - its body, nose to tail, kept out of the buildings (three points along it, the rider's head clearing an overhang
//    at 2.8 m), off the fences, benches and granite it can't step over (it steps over anything under 0.45 m; in a jump
//    it clears what its tucked hooves pass over), out of the traffic's and the mission's cars, off the poles, the
//    hydrants and the trees; light things (cans, boxes, barriers) it knocks aside at a trot or more;
//  - a horse won't run into a wall: a wall or a car close ahead pulls it up short (no faster than it can stop in the
//    room left); what it hits anyway that takes more than RAM m/s off it in a moment throws the rider (game.js);
//  - the ground under its fore and hind hooves: it pitches up and down a hill; it leans into its turns;
//  - Space jumps: off the ground at 4.6 m/s (more at speed) under 13 m/s² (about 0.8 m up, 0.7 s in the air), the
//    Jump clip's leap played over it, a landing's thud.
//   const D = createDrive(THREE, { cm, car, W })   // D.step(dt) for updateCar, D.coast(dt) with nobody up, D.S its state
const PACE = { walk: 1.8, trot: 4.5, gallop: 12, back: 1.0 };
const ACC = { up: 3.0, gallop: 4.2, ease: 3.2, rein: 7, halt: 9, stop: 9 };
const JUMP = { v: 4.6, perV: 0.06, g: 13, clear: 0.45, tuck: 0.4, lift: 0.05, auto: 9, high: 1.25 };
const RAM = 6;
const PROBES = [0.95, 0.1, -0.85], R = 0.42;

import { world } from '../world/index.js';

export function createDrive(THREE, { cm, car, W }) {
  const S = { air: false, jumpY: 0, jumpV: 0, jumpHeld: false, walk: false, yawRate: 0, rammed: 0, ground: null, landT: 0, pitchJ: 0, busy: null, lookT: 0, room: Infinity };
  const _p = new THREE.Vector3(), _o = { nx: 0, nz: 0 };
  const rs = () => car.roadster;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const hoofY = () => car.position.y - S.jumpY;

  // the buildings: three points down its body, each pushed out of them, the body moved with each push. Returns how
  // much of its way the pushes took (0 none .. 1 head on)
  function walls(y0) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let into = 0;
    for (const off of PROBES) {
      _p.set(car.position.x + fx * off, 0, car.position.z + fz * off);
      const x0 = _p.x, z0 = _p.z;
      // (in a jump, what its tucked hooves pass over is cleared: a rubble heap, a barrier, a wreck at a gallop)
      cm.resolveHorizontalCollision(_p, R, (S.air ? car.position.y + JUMP.lift : y0) + 1.9);
      // (and the low things: fences, benches, granite, planters; over them in a jump, its hooves tucked under it)
      _p.y = y0 + (S.air ? JUMP.tuck : 0) + JUMP.clear;
      cm.resolveLowCollision(_p, R);
      const dx = _p.x - x0, dz = _p.z - z0, d = Math.hypot(dx, dz);
      if (d < 1e-5) continue;
      car.position.x += dx; car.position.z += dz;
      const head = -(dx * fx + dz * fz) / d * Math.sign(car.speed || 1);
      if (head > 0) into = Math.max(into, head);
    }
    return into;
  }
  // the city's cars, the highways', the mission's standing ones: its box out of theirs (they keep their lanes)
  function bodies() {
    const B = car.body, hl = (B.z1 - B.z0) / 2, cz = (B.z1 + B.z0) / 2, h = car.heading;
    const cx = car.position.x + Math.sin(h) * cz, czw = car.position.z + Math.cos(h) * cz;
    let into = 0;
    const list = (W.crash?.bodies?.(cx, czw, 9, hoofY()) || []);
    for (const [ox, oz, oy, ow, ol] of list) {
      if (!overlap(cx, czw, h, B.hx, hl, ox, oz, oy, ow, ol)) continue;
      car.position.x += _o.nx * _o.pen; car.position.z += _o.nz * _o.pen;
      const head = -(Math.sin(h) * _o.nx + Math.cos(h) * _o.nz) * Math.sign(car.speed || 1);
      if (head > 0) into = Math.max(into, head);
    }
    return into;
  }
  // two turned boxes: apart along the axis they overlap least on (n points from the other to this one)
  function overlap(ax, az, ah, aw, al, bx, bz, bh, bw, bl) {
    const ca = Math.cos(ah), sa = Math.sin(ah), cb = Math.cos(bh), sb = Math.sin(bh), dx = ax - bx, dz = az - bz;
    let pen = Infinity;
    for (const [nx, nz] of [[ca, -sa], [sa, ca], [cb, -sb], [sb, cb]]) {
      const ra = aw * Math.abs(nx * ca - nz * sa) + al * Math.abs(nx * sa + nz * ca);
      const rb = bw * Math.abs(nx * cb - nz * sb) + bl * Math.abs(nx * sb + nz * cb);
      const d = dx * nx + dz * nz, p = ra + rb - Math.abs(d);
      if (p <= 0) return false;
      if (p < pen) { pen = p; _o.nx = d >= 0 ? nx : -nx; _o.nz = d >= 0 ? nz : -nz; }
    }
    _o.pen = pen;
    return true;
  }
  // the street's things (wagmi/crash/props.js): the poles, hydrants, trees and stairs solid; a can, a box, a barrier
  // knocked aside (its velocity there a third of its own: a pole never snaps under a horse)
  const PM = { x: 0, z: 0, yaw: 0, hw: 0.45, hl: 1.27, vx: 0, vz: 0, mass: 0.6, onSolid: null, onBreak: null };
  let propInto = 0;
  PM.onSolid = (nx, nz) => { const h = -(Math.sin(car.heading) * nx + Math.cos(car.heading) * nz) * Math.sign(car.speed || 1); if (h > 0) propInto = Math.max(propInto, h); };
  PM.onBreak = (b, vi, loss) => { car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), loss * 0.6); W.audio?.play?.('pack:sounds-impact/impactPlank_medium', { pos: [b.x, 0.6, b.z], vol: 0.5, rate: 0.8 }); };
  function props() {
    const P = W.crash?.props; if (!P?.collide) return 0;
    const B = car.body, cz = (B.z1 + B.z0) / 2, h = car.heading, s = Math.sin(h), c = Math.cos(h);
    Object.assign(PM, { x: car.position.x + s * cz, z: car.position.z + c * cz, yaw: h, hw: B.hx, hl: (B.z1 - B.z0) / 2, vx: (s * car.speed + (car.vx || 0)) * 0.33, vz: (c * car.speed + (car.vz || 0)) * 0.33 });
    propInto = 0;
    P.collide(PM);
    car.position.x = PM.x - s * cz; car.position.z = PM.z - c * cz;
    return propInto;
  }
  // the room ahead before a wall or a car: m from its nose (to `far`), along its middle and either side of it (its
  // width), sampled every 0.6 m
  // (yH: the height the walls are read at: a jump's (yH above ground + JUMP.high + 1.5) counts only what it can't clear;
  // h: a heading to look along other than its own)
  function roomAhead(far, h = car.heading, yH = 1.9) {
    const sg = Math.sign(car.speed || 1), fx = Math.sin(h) * sg, fz = Math.cos(h) * sg, rx = Math.cos(h), rz = -Math.sin(h);
    const nose = car.speed >= 0 ? car.body.z1 : -car.body.z0;
    const y0 = hoofY(), list = W.crash?.bodies?.(car.position.x + fx * (nose + far / 2), car.position.z + fz * (nose + far / 2), far / 2 + 4, y0) || [];
    for (let d = 0.6; d <= far; d += 0.6) for (const s of [0, 0.38, -0.38]) {
      const x = car.position.x + fx * (nose + d) + rx * s, z = car.position.z + fz * (nose + d) + rz * s;
      _p.set(x, 0, z); cm.resolveHorizontalCollision(_p, 0.2, y0 + yH);
      if (Math.hypot(_p.x - x, _p.z - z) > 0.02) return d;
      for (const [ox, oz, oy, ow, ol] of list) {
        const dx = x - ox, dz = z - oz, lx = dx * Math.cos(oy) - dz * Math.sin(oy), lz = dx * Math.sin(oy) + dz * Math.cos(oy);
        if (Math.abs(lx) < ow + 0.25 && Math.abs(lz) < ol + 0.25) return d;
      }
    }
    return Infinity;
  }
  // its feet on the ground: the fore and hind hooves' ground, the body pitched between them; in the air on its arc
  function ground(dt) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), a = car.axle || 0.64;
    const gF = cm.getGroundHeight(car.position.x + fx * a, car.position.z + fz * a, 'person');
    const gB = cm.getGroundHeight(car.position.x - fx * a, car.position.z - fz * a, 'person');
    const g = (gF + gB) / 2;
    // (a curb's step taken in a stride, not a snap; a big change (a teleport) at once)
    if (S.ground == null || Math.abs(g - S.ground) > 1.2) S.ground = g; else S.ground += (g - S.ground) * Math.min(1, dt * 16);
    if (S.air) {
      S.jumpV -= JUMP.g * dt; S.jumpY += S.jumpV * dt;
      if (S.jumpY <= 0) {
        S.air = false; S.jumpY = 0; S.landT = 0.35;
        const p = car.position;
        W.audio?.play?.('pack:sounds-impact/impactSoft_heavy', { pos: [p.x, p.y + 0.2, p.z], vol: 0.9, rate: 0.7 });
        W.audio?.play?.('pack:sounds-impact/footstep_concrete', { pos: [p.x, p.y + 0.1, p.z], vol: 0.9, rate: 0.55 });
        W.crash?.jolt?.(0.25, 0, 0);
      }
    }
    car.position.y = S.ground + S.jumpY;
    // (pitched to the slope; in a jump nose up off the ground and down onto it; leaning into the turn)
    // (jt: 0 at take-off, 1 at the top, 2 at landing)
    const jt = S.air ? 1 - S.jumpV / (JUMP.v + JUMP.perV * Math.abs(car.speed)) : 0;
    S.pitchJ = S.air ? -0.16 * Math.cos(Math.PI * Math.min(1, jt / 2)) : S.pitchJ * Math.exp(-dt * 8);
    const slope = -Math.atan2(gF - gB, 2 * a), CP = car.chassisPivot;
    CP.rotation.x += (slope + S.pitchJ - CP.rotation.x) * Math.min(1, dt * 10);
    const roll = -Math.max(-0.14, Math.min(0.14, S.yawRate * car.speed * 0.013));
    CP.rotation.z += (roll - CP.rotation.z) * Math.min(1, dt * 6);
    CP.position.y = 0;
  }
  // along its way in steps of at most 0.4 m, kept out of everything after each; how much of its speed that took off
  function move(dt) {
    const prevX = car.position.x, prevZ = car.position.z, v0 = car.speed;
    const steps = Math.min(10, Math.max(1, Math.ceil((Math.abs(car.speed) + Math.hypot(car.vx || 0, car.vz || 0)) * dt / 0.4)));
    let into = 0;
    for (let k = 0; k < steps; k++) {
      car.position.x += (Math.sin(car.heading) * car.speed + (car.vx || 0)) * dt / steps;
      car.position.z += (Math.cos(car.heading) * car.speed + (car.vz || 0)) * dt / steps;
      into = Math.max(into, walls(hoofY()), bodies(), props());
    }
    // (Central Park's water: stopped at its edge)
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    if (world.inWater(car.position.x + fx * 1.2, car.position.z + fz * 1.2)) { car.position.x = prevX; car.position.z = prevZ; into = 1; }
    // (what it ran into takes the speed into it: head on, all of it; a glancing touch it slides along, a little slowed)
    if (into > 0.05) car.speed *= into > 0.72 ? 1 - Math.min(1, into * 1.1) : 1 - into * 0.45;
    const vx = car.vx || 0, vz = car.vz || 0, g = Math.exp(-dt * 6);
    car.vx = Math.abs(vx * g) < 0.01 ? 0 : vx * g; car.vz = Math.abs(vz * g) < 0.01 ? 0 : vz * g;
    // (how much a square hit took off it: a ram)
    return into > 0.72 ? Math.abs(v0) - Math.abs(car.speed) : 0;
  }

  // (in a fight (a foe of the fight's within 30 m) he reins harder: a tighter turn at speed, to come round for the next
  // pass in a second or two rather than a wide sweep)
  const BASE = car.handling, FIGHT = BASE && { ...BASE, yawMax: BASE.yawMax * 1.35, grip: BASE.grip * 1.6 };
  let fightLook = 0;
  function step(dt) {
    if (!(dt > 0)) return;
    if (BASE && (fightLook -= dt) <= 0) {
      fightLook = 0.25;
      const en = W.combat?.enemies, p = car.position;
      car.handling = en && en.some((e) => e.alive && !e.out && Math.abs(e.pos.x - p.x) < 30 && Math.abs(e.pos.z - p.z) < 30) ? FIGHT : BASE;
    }
    const keys = cm.keys;
    const thr = keys.forward ? +keys.forward : keys.backward ? -keys.backward : 0;
    const steer = keys.left ? +keys.left : keys.right ? -keys.right : 0;
    // the pace he asks for
    let want = 0;
    if (car.halt || S.busy) want = 0;
    else if (thr > 0) want = keys.boost ? PACE.gallop : S.walk || thr < 0.55 ? PACE.walk : PACE.trot;
    else if (thr < 0) want = car.speed > 0.3 ? 0 : -PACE.back;
    const v = car.speed;
    const acc = want > v ? (want > PACE.trot && v > PACE.trot - 0.3 ? ACC.gallop : ACC.up) : car.halt ? ACC.halt : S.busy ? ACC.stop : thr < 0 ? ACC.rein : ACC.ease;
    car.speed = v + Math.sign(want - v) * Math.min(Math.abs(want - v), acc * dt);
    // (a wall or a car close ahead: pulled up short of it, no faster than it can stop in the room left; looked for every
    // 60 ms, the room since taken off what it travels)
    if (Math.abs(car.speed) > 2.5 && !S.air) {
      S.lookT -= dt; S.room -= Math.abs(car.speed) * dt;
      if (S.lookT <= 0) {
        S.lookT = 0.06; const far = Math.min(9, 1 + Math.abs(car.speed) * 0.75);
        S.room = roomAhead(far);
        // (SF 2040's broken streets: a heap or a barrier across his way at a canter or more is jumped, as a horse
        // jumps it, at the stride before it; what it can't clear (a wall, a bus) it still pulls up for. And with the
        // reins loose (no turn asked) it picks its own way round what blocks it, the clearer side, a little at a time)
        S.hop = 0; S.dodge = 0;
        if (S.room < Infinity && car.speed > 0) {
          const tall = roomAhead(far, car.heading, JUMP.high + 1.5);
          if (car.speed > JUMP.auto && tall > S.room + 1.2) { S.hop = S.room; S.room = tall; }
          else if (Math.abs(steer) < 0.2 && S.room < 7) {
            const L = roomAhead(far, car.heading + 0.45), Rr = roomAhead(far, car.heading - 0.45);
            if (Math.max(L, Rr) > S.room + 0.6) S.dodge = L >= Rr ? 1 : -1;
          }
        }
      }
      else if (S.hop) S.hop -= Math.abs(car.speed) * dt;
      if (S.hop && !S.air && !car.halt && !S.busy && S.landT <= 0 && S.hop < 1 + Math.abs(car.speed) * 0.16) { S.hop = 0; jump(); }
      if (S.room < Infinity) { const cap = Math.sqrt(2 * ACC.stop * Math.max(0, S.room - 0.4)); if (Math.abs(car.speed) > cap) car.speed = Math.sign(car.speed) * Math.max(cap, Math.abs(car.speed) - 16 * dt); }
    } else {
      S.lookT = 0; S.room = Infinity; S.hop = 0;
      // (pulled up against something with the reins loose and W held: he turns his own head to the clearer side and
      // walks round it, as a horse does, rather than leaning on it)
      if (thr > 0 && Math.abs(steer) < 0.2 && !S.busy && !car.halt) {
        if ((S.stuckLook = (S.stuckLook || 0) - dt) <= 0) {
          S.stuckLook = 0.25; S.dodge = 0;
          const f = roomAhead(3.5);
          if (f < 2.5) { const L = roomAhead(3.5, car.heading + 0.6), Rr = roomAhead(3.5, car.heading - 0.6); if (Math.max(L, Rr) > f + 0.5) S.dodge = L >= Rr ? 1 : -1; }
        }
      } else S.dodge = 0;
    }
    // the turn: the city's keyboard steering on its handling; stopped, round on the spot
    const h0 = car.heading;
    const turn = S.dodge ? S.dodge * 0.75 : steer;
    if (Math.abs(car.speed) > 0.3) cm.steerHandled(car, turn, dt);
    else { car.steerK = (car.steerK || 0) + (turn - (car.steerK || 0)) * Math.min(1, dt * 8); car.heading += car.steerK * 1.3 * dt; }
    car.heading += (car.angularVel || 0) * dt; car.angularVel = (car.angularVel || 0) * Math.exp(-dt * 8);
    S.yawRate += (wrap(car.heading - h0) / dt - S.yawRate) * Math.min(1, dt * 12);
    // the jump: Space, on the ground, not in a buck
    if (!keys.up) S.jumpHeld = false;
    if (keys.up && !S.jumpHeld && !S.air && !car.halt && !S.busy && S.landT <= 0) jump();
    S.landT = Math.max(0, S.landT - dt);
    const lost = move(dt);
    // (a ram: hit hard enough to throw him; game.js reads it)
    S.rammed = lost > RAM ? lost : Math.max(0, S.rammed - dt * 20);
    car.rammed = S.rammed;
    ground(dt);
    if (car.onUpdate) car.onUpdate(dt, keys, thr, car.steerK || 0);
  }
  function jump() {
    if (S.air) return false;
    S.jumpHeld = true; S.air = true; S.jumpY = 0.001; S.jumpV = JUMP.v + JUMP.perV * Math.abs(car.speed);
    rs()?.play?.('jump', { ts: 1.43 / ((2 * S.jumpV / JUMP.g) + 0.3) });
    const p = car.position;
    W.audio?.play?.('pack:sounds-impact/footstep_concrete', { pos: [p.x, p.y + 0.1, p.z], vol: 0.8, rate: 0.6 });
    W.audio?.play?.('pack:sounds-rpg/creak', { pos: [p.x, p.y + 1.6, p.z], vol: 0.35, rate: 0.9 });
    return true;
  }
  // nobody up: it eases down through its gaits to a stand where it is, kept out of things as ever
  function coast(dt) {
    if (!(dt > 0)) return;
    if (Math.abs(car.speed) > 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt);
    S.yawRate *= Math.exp(-dt * 6); car.steerK = 0;
    if (car.speed || car.vx || car.vz || S.air) move(dt);
    ground(dt);
  }
  return { step, coast, jump, S, PACE, roomAhead };
}
