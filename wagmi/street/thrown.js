// Mog City: a person knocked flying (or diving out of the way): the body as one rigid piece, its pelvis joint's place,
// its turn, velocity and spin, under gravity, off the walls, onto the street with a bounce or two and a slide; lying
// there, then up again. The limbs fly about in the air, go limp on the ground and draw in to get up
// (PersonRig.tumble in js/pedestrians.js poses them). A dive is the same with less in it.
// Dan's car (carAt) is never ground to them: a body that comes down on it is carried a little with it, popped up and
// shoved out over its nearest side, so it falls past it to the street; one lying (or getting up) where the car comes is
// rolled out of its way, aside. Nobody lies on it, rides on it or stands up on it.
import * as THREE from 'three/webgpu';

const G = 15; // a touch more than real gravity: a hit reads quicker
const PELVIS = 0.96; // the pelvis joint's height standing (m, at full height)
const UP = new THREE.Vector3(0, 1, 0);
// the points of the body (its own frame from the pelvis joint, m at full height) that can touch the ground
const SUPPORT = [[0, -0.92, 0.04], [0, 0.76, 0], [0.34, 0.36, 0], [-0.34, 0.36, 0], [0, 0.04, 0.13], [0, 0.04, -0.12],
  [0, 0.42, 0.13], [0, 0.42, -0.14], [0.16, -0.48, 0], [-0.16, -0.48, 0]].map((p) => new THREE.Vector3(...p));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
const _c = { top: 0, over: false, vx: 0, vz: 0, sx: 0, sz: 0, d: 0 };
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export class Thrown {
  // rig: its PersonRig; standing at (x, y, z) facing yaw; ground(x, z) the walking surface; collide(pos, r) keeps a
  // point out of the buildings (moves it); carAt(x, z, r, out): null clear of Dan's car (its box r m out), else out
  // filled: top (its surface's height there), over (over its body, not just beside it), vx vz (its velocity), sx sz
  // (out of its nearest side, unit) and d (m to there)
  constructor(rig, x, y, z, yaw, ground, collide, carAt = null) {
    this.rig = rig; this.s = rig.s; this.ground = ground; this.collide = collide; this.carAt = carAt;
    this.pos = new THREE.Vector3(x, y + PELVIS * this.s, z);
    this.q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.qLie = new THREE.Quaternion(); this.qUp = new THREE.Quaternion();
    this.state = 'fly'; this.t = 0; this.clock = Math.random() * 10; this.flail = 1; this.curl = 0;
    this.lieFor = 3; this.bounces = 0; this.onLand = null;
  }

  // run down at sp m/s by a car going along (fx, fz) (unit), the person `side` (+-1) of its centre line: thrown along
  // its way and off to that side (slow: on ahead of it; fast: up over the bonnet and the roof as it goes on under), the
  // legs swept out from under them (Suits hit by Dan's car fly the same: wagmi/combat/enemy.js runOver)
  hit(fx, fz, sp, side) {
    const fast = sp > 11, along = fast ? Math.min(15, Math.max(6, sp * 0.55)) : Math.min(13, Math.max(3.5, sp + 1.5));
    const up = fast ? Math.min(8.5, Math.max(6, 5.5 + sp * 0.08)) : 3.2;
    _v.set(fx - fz * side * 0.45, 0, fz + fx * side * 0.45).normalize();
    this.v.set(_v.x * along, up, _v.z * along);
    // (spin: the feet go the way the car does, a turn about the up axis and a roll on top)
    _w.crossVectors(_v, UP).multiplyScalar(Math.min(11, 2.5 + sp * 0.42));
    this.w.copy(_w).addScaledVector(UP, (Math.random() - 0.5) * 6).addScaledVector(_v, (Math.random() - 0.5) * 4);
    this.lieFor = 2.6 + Math.random() * 2.2 + Math.min(2, sp * 0.06);
  }

  // out of the way of a car: a dive along (dx, dz) (unit), head first, onto the street, a short lie and up
  dive(dx, dz) {
    _v.set(dx, 0, dz);
    this.v.set(dx * 5.2, 2.6, dz * 5.2);
    this.w.crossVectors(UP, _v).multiplyScalar(4.2 + Math.random());
    this.q.setFromAxisAngle(UP, Math.atan2(dx, dz)); // (facing the way he dives)
    this.lieFor = 0.5 + Math.random() * 0.7;
  }

  // the lowest point of the body below its pelvis joint, as it is turned now
  low() {
    let lo = Infinity;
    for (const p of SUPPORT) { const y = _n.copy(p).multiplyScalar(this.s).applyQuaternion(this.q).y; if (y < lo) lo = y; }
    return lo;
  }

  // lying flat, from how it lands: head the way the body points, on the back or on the front
  lieDown() {
    _y.set(0, 1, 0).applyQuaternion(this.q); _y.y = 0;
    if (_y.lengthSq() < 1e-4) _y.set(0, 0, 1).applyQuaternion(this.q).setY(0);
    if (_y.lengthSq() < 1e-4) _y.set(1, 0, 0);
    _y.normalize();
    const faceUp = _z.set(0, 0, 1).applyQuaternion(this.q).y >= 0;
    _z.set(0, faceUp ? 1 : -1, 0);
    _x.crossVectors(_y, _z);
    this.qLie.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    // getting up: on his feet where his head was, facing away from where his feet were
    this.upYaw = Math.atan2(_y.x, _y.z);
  }

  // dt s on; returns the state ('fly', 'slide', 'lie', 'getup', 'up')
  step(dt) {
    const s = this.s;
    this.t += dt; this.clock += dt;
    if (this.state === 'fly') {
      this.v.y -= G * dt;
      this.pos.addScaledVector(this.v, dt);
      const ang = this.w.length();
      if (ang > 1e-5) { _q.setFromAxisAngle(_w.copy(this.w).divideScalar(ang), ang * dt); this.q.premultiply(_q).normalize(); }
      this.wall(0.35);
      const g = this.ground(this.pos.x, this.pos.z), lo = this.pos.y + this.low();
      if (this.offCar(lo)) {
        // (on the car: off it again, see offCar)
      } else if (lo < g) {
        this.pos.y += g - lo;
        if (this.v.y < 0) {
          const impact = -this.v.y;
          this.v.y = impact > 2.2 && this.bounces < 2 ? impact * 0.28 : 0;
          this.v.x *= 0.7; this.v.z *= 0.7; this.w.multiplyScalar(0.55);
          this.bounces++;
          if (this.onLand && impact > 2.5) this.onLand(this, impact);
        }
        if (this.v.y === 0 || this.v.length() < 1.6) { this.state = 'slide'; this.t = 0; this.lieDown(); }
      }
      if (this.t > 5) { this.state = 'slide'; this.t = 0; this.lieDown(); }
      this.flail = Math.min(1, this.flail + dt * 4);
    } else if (this.state === 'slide') {
      // sliding to a stop, settling flat
      const f = Math.exp(-5.5 * dt);
      this.v.x *= f; this.v.z *= f; this.v.y = 0;
      this.pos.x += this.v.x * dt; this.pos.z += this.v.z * dt;
      this.wall(0.35);
      this.aside();
      this.q.slerp(this.qLie, 1 - Math.exp(-9 * dt));
      const g = this.ground(this.pos.x, this.pos.z);
      this.pos.y += (g + 0.12 * s - this.pos.y) * (1 - Math.exp(-14 * dt));
      this.flail = Math.max(0, this.flail - dt * 3);
      if (this.t > 0.45 && Math.hypot(this.v.x, this.v.z) < 0.35) { this.state = 'lie'; this.t = 0; }
    } else if (this.state === 'lie') {
      // (the car coming over them: rolled aside, sliding)
      if (this.aside() > 1) { this.state = 'slide'; this.t = 0; return this.state; }
      this.q.slerp(this.qLie, 1 - Math.exp(-9 * dt));
      // (on whatever is under them: off a car's bonnet as it goes, they drop)
      const g = this.ground(this.pos.x, this.pos.z) + 0.12 * s;
      if (this.pos.y > g + 0.3) { this.state = 'fly'; this.t = 0; this.v.set(0, 0, 0); this.bounces = 2; }
      else this.pos.y += (g - this.pos.y) * (1 - Math.exp(-14 * dt));
      this.flail = Math.max(0, this.flail - dt * 3);
      if (this.t > this.lieFor) { this.state = 'getup'; this.t = 0; this.qUp.setFromAxisAngle(UP, this.upYaw); }
    } else if (this.state === 'getup') {
      const u = Math.min(1, this.t / 1.15), e = smooth(u);
      this.aside();
      this.q.slerpQuaternions(this.qLie, this.qUp, e);
      this.curl = Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.85;
      const g = this.ground(this.pos.x, this.pos.z);
      this.pos.y = g + (0.12 + (PELVIS - 0.12) * e) * s - this.curl * 0.22 * s * e;
      if (u >= 1) { this.state = 'up'; this.curl = 0; }
    }
    return this.state;
  }

  // in the air, come down on Dan's car (lo: the body's lowest point): put on its surface, carried a little with it,
  // popped up and shoved out over its nearest side, every frame it's on it (so it is off it within a beat); beside it,
  // pushed out of its way. True when it touched it
  offCar(lo) {
    const C = this.carAt && this.carAt(this.pos.x, this.pos.z, 0.3, _c);
    if (!C || lo > C.top) return false;
    const cvs = C.vx * C.sx + C.vz * C.sz, out = 1.6 + 0.06 * Math.hypot(C.vx, C.vz);
    if (C.over) {
      this.pos.y += C.top - lo;
      this.v.x += (C.vx - this.v.x) * 0.5; this.v.z += (C.vz - this.v.z) * 0.5;
      this.v.y = Math.max(this.v.y, 1.4);
      this.w.multiplyScalar(0.8);
    } else { this.pos.x += C.sx * C.d; this.pos.z += C.sz * C.d; }
    const vs = this.v.x * C.sx + this.v.z * C.sz - cvs;
    if (vs < out) { this.v.x += C.sx * (out - vs); this.v.z += C.sz * (out - vs); }
    return true;
  }

  // on the ground where the car comes: rolled out from under it, aside (out of its nearest side), as fast as it pushes;
  // the speed it was pushed with (0: clear of it)
  aside() {
    const C = this.carAt && this.carAt(this.pos.x, this.pos.z, 0.35, _c);
    if (!C || this.pos.y > C.top + 0.3) return 0;
    this.pos.x += C.sx * C.d; this.pos.z += C.sz * C.d;
    const cvs = C.vx * C.sx + C.vz * C.sz, vs = this.v.x * C.sx + this.v.z * C.sz;
    const want = Math.max(0, cvs) + 0.8 + 0.12 * Math.hypot(C.vx, C.vz);
    if (vs < want) { this.v.x += C.sx * (want - vs); this.v.z += C.sz * (want - vs); }
    this.wall(0.35);
    return want;
  }

  // off the walls (the buildings): pushed out, bouncing back off them
  wall(r) {
    _v.copy(this.pos);
    this.collide(_v, r);
    const dx = _v.x - this.pos.x, dz = _v.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const nx = dx / d, nz = dz / d, vn = this.v.x * nx + this.v.z * nz;
    if (vn < 0) { this.v.x -= 1.35 * vn * nx; this.v.z -= 1.35 * vn * nz; this.w.multiplyScalar(0.7); }
    this.pos.x = _v.x; this.pos.z = _v.z;
  }

  // the rig posed as the body is now
  pose() { this.rig.tumble(this.pos, this.q, { flail: this.flail, curl: this.curl, t: this.clock }); }

  // where the feet are (on the ground under the pelvis joint)
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
}
