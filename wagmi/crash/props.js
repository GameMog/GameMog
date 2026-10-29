// Mog City: the street furniture a car runs into (js/street-details.js window.NYC.breakables, with the plazas' and
// parks' benches, lampposts and granite from js/city-grid.js). Poles and lamps snap at the foot and fall the way they
// were hit, turning faster as they go, onto the street or onto their own arm, their light out; the small things (and
// the benches) fly, tumbling, bounce off the ground and the buildings and lie flat where they stop; a hydrant goes up in
// a column of water;
// trees, the subway stairs and the plazas' granite are solid, a hard stop. Hit slowly, a pole or a hydrant is solid too.
// Each thing is drawn by instances of the city's own instanced meshes: knocked, its instances are moved as one body (no
// new meshes; those in its hide list, a lamp's light pool, gone), and put back when the camera is far away.
// With Jolt loaded (wagmi/physics), a small thing knocked flying is a rigid box there: it tumbles, bounces off the
// ground, the buildings, the wrecks and the other things knocked about, is shoved along by Dan's car (a kinematic body
// in Jolt) and lies however it comes to rest; it can be knocked again. Poles still fall about their foot.
import * as THREE from 'three/webgpu';

const rnd = (a, b) => a + Math.random() * (b - a);
// per kind: fall (snaps and falls over) or fly; mass (to the car's 2: what knocking it costs the car's speed); snap
// (m/s: slower than that it stands, solid); r of the fallen thing for the ground
const KINDS = {
  mast: { mode: 'fall', mass: 0.5, snap: 7 },
  cobra: { mode: 'fall', mass: 0.35, snap: 6 },
  post: { mode: 'fall', mass: 0.15, snap: 4 },
  hydrant: { mode: 'fly', mass: 0.3, snap: 4, water: true },
  mailbox: { mode: 'fly', mass: 0.2, snap: 1.5 },
  basket: { mode: 'fly', mass: 0.03, snap: 0.4 },
  paperbox: { mode: 'fly', mass: 0.08, snap: 0.8 },
  barricade: { mode: 'fly', mass: 0.04, snap: 0.4 },
  stack: { mode: 'fly', mass: 0.1, snap: 1 },
  cart: { mode: 'fly', mass: 0.35, snap: 1.5 },
  bench: { mode: 'fly', mass: 0.1, snap: 1.2 },
  lamp: { mode: 'fall', mass: 0.3, snap: 5 },
};
const CELL = 12;
const key = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

export function createProps({ cm, fx, play, car = null, scene = null, physics: PH = null }) {
  const list = (window.NYC.breakables || []).filter((b) => b.solid || (KINDS[b.kind] && b.parts && b.parts.length));
  const cells = new Map();
  for (const b of list) {
    const r = Math.max(b.r, b.w ? Math.hypot(b.w, b.d) / 2 : 0);
    for (let ix = Math.floor((b.x - r) / CELL); ix <= Math.floor((b.x + r) / CELL); ix++) {
      for (let iz = Math.floor((b.z - r) / CELL); iz <= Math.floor((b.z + r) / CELL); iz++) {
        const k = key(ix, iz); let c = cells.get(k); if (!c) cells.set(k, (c = [])); c.push(b);
      }
    }
  }
  const near = [], seen = new Set();
  function around(x, z, r) {
    near.length = 0; seen.clear();
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const c = cells.get(key(ix, iz)); if (!c) continue;
        for (const b of c) if (!seen.has(b)) { seen.add(b); near.push(b); }
      }
    }
    return near;
  }

  // ---------------------------------------------------------------- hits
  // the mover: a box on the ground (x, z its middle, yaw, hw half width, hl half length) going (vx, vz). What it meets:
  // solid things push it out (x, z changed) and are reported (onSolid(nx, nz, pen, b, vi, hit): n from the thing to the
  // mover, hit.x z where they touch on a box); breakable ones hit hard enough are knocked (onBreak(b, vi, loss, nx, nz):
  // how fast it was hit, the speed that cost)
  const hit = { nx: 0, nz: 0, pen: 0, x: 0, z: 0 }, AX = new Float64Array(8);
  function touch(m, b) {
    const c = Math.cos(m.yaw), s = Math.sin(m.yaw), dx = b.x - m.x, dz = b.z - m.z;
    if (b.w) {
      // (a box w across, d along, square to the grid (the subway stairs, the granite) or turned by its yaw (a bench)):
      // the two boxes' least overlap, and where they touch, the point of the thing's box nearest the mover's middle
      const cb = b.yaw ? Math.cos(b.yaw) : 1, sb = b.yaw ? Math.sin(b.yaw) : 0;
      AX[0] = c; AX[1] = -s; AX[2] = s; AX[3] = c; AX[4] = cb; AX[5] = -sb; AX[6] = sb; AX[7] = cb;
      let pen = Infinity;
      for (let k = 0; k < 8; k += 2) {
        const ax = AX[k], az = AX[k + 1];
        const ra = m.hw * Math.abs(ax * c - az * s) + m.hl * Math.abs(ax * s + az * c);
        const rb = b.w / 2 * Math.abs(ax * cb - az * sb) + b.d / 2 * Math.abs(ax * sb + az * cb);
        const d = -(dx * ax + dz * az), p = ra + rb - Math.abs(d);
        if (p <= 0) return false;
        if (p < pen) { pen = p; hit.nx = d >= 0 ? ax : -ax; hit.nz = d >= 0 ? az : -az; }
      }
      const lx = Math.max(-b.w / 2, Math.min(b.w / 2, -dx * cb + dz * sb)), lz = Math.max(-b.d / 2, Math.min(b.d / 2, -dx * sb - dz * cb));
      hit.pen = pen; hit.x = b.x + lx * cb + lz * sb; hit.z = b.z - lx * sb + lz * cb;
      return true;
    }
    // (round: the nearest point of the box to its middle)
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = Math.max(-m.hw, Math.min(m.hw, lx)), qz = Math.max(-m.hl, Math.min(m.hl, lz));
    const ex = qx - lx, ez = qz - lz, d = Math.hypot(ex, ez);
    if (d >= b.r) return false;
    let nlx, nlz, pen;
    if (d > 1e-4) { nlx = ex / d; nlz = ez / d; pen = b.r - d; }
    else {
      // (its middle inside the box: out the nearest side)
      const px = m.hw - Math.abs(lx), pz = m.hl - Math.abs(lz);
      if (px < pz) { nlx = -Math.sign(lx || 1); nlz = 0; pen = px + b.r; } else { nlx = 0; nlz = -Math.sign(lz || 1); pen = pz + b.r; }
    }
    hit.nx = nlx * c + nlz * s; hit.nz = -nlx * s + nlz * c; hit.pen = pen;
    hit.x = b.x; hit.z = b.z;
    return true;
  }
  function collide(m) {
    const r = Math.hypot(m.hw, m.hl) + 3.5;
    for (const b of around(m.x, m.z, r)) {
      if (b.taken || !touch(m, b)) continue;
      const K = KINDS[b.kind];
      const vi = -(m.vx * hit.nx + m.vz * hit.nz);
      if (b.solid || !K || vi < K.snap) {
        m.x += hit.nx * hit.pen; m.z += hit.nz * hit.pen;
        m.onSolid?.(hit.nx, hit.nz, hit.pen, b, vi, hit);
        continue;
      }
      const loss = vi * K.mass / (m.mass + K.mass) * 1.3;
      take(b, m, vi, hit.nx, hit.nz);
      m.onBreak?.(b, vi, loss, hit.nx, hit.nz);
    }
  }

  // ---------------------------------------------------------------- who draws it
  // The city's culling (js/scene-culling.js) draws its big instanced meshes as chunks (the original taken out of the
  // scene) and casts their shadows from stand-ins: an instance is found again in whichever meshes draw it now, by the
  // vertex data they share and its matrix (a coarser shadow stand-in, such as the lamp posts', by the vertex data of what
  // it stands in for: userData.standInOf)
  const drawers = new Map();
  if (scene) scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    for (const k of [o.geometry.attributes.position, o.userData.standInOf]) { if (!k) continue; if (!drawers.has(k)) drawers.set(k, []); drawers.get(k).push(o); }
  });
  function drawnBy(inst, i, m0) {
    const out = inst.parent ? [[inst, i]] : [], e = m0.elements;
    for (const o of drawers.get(inst.geometry.attributes.position) || []) {
      if (o === inst) continue;
      const a = o.instanceMatrix.array;
      for (let j = 0; j < o.count; j++) {
        const q = j * 16;
        if (Math.abs(a[q + 12] - e[12]) < 1e-3 && Math.abs(a[q + 14] - e[14]) < 1e-3 && Math.abs(a[q + 13] - e[13]) < 1e-3 && Math.abs(a[q] - e[0]) < 1e-3 && Math.abs(a[q + 5] - e[5]) < 1e-3 && Math.abs(a[q + 10] - e[10]) < 1e-3) { out.push([o, j]); break; }
      }
    }
    return out.length ? out : [[inst, i]];
  }

  // ---------------------------------------------------------------- bodies
  const bodies = [], _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  const _ax = new THREE.Vector3(), _w = new THREE.Vector3(), _wp = new THREE.Vector3(), NONE = new THREE.Matrix4().makeScale(0, 0, 0);
  let frame = 0;
  function write(inst, i, mat) {
    inst.setMatrixAt(i, mat);
    const a = inst.instanceMatrix;
    if (inst.userData._crashFrame !== frame) { inst.userData._crashFrame = frame; a.clearUpdateRanges(); }
    a.addUpdateRange(i * 16, 16); a.needsUpdate = true;
  }
  // knock b: its parts as one body (the corners of every part's box, round its middle, for the ground)
  function take(b, m, vi, nx, nz) {
    const K = KINDS[b.kind];
    b.taken = true;
    if (b.light) b.light.out = true;
    const parts = b.parts.map(([inst, i]) => { const m0 = new THREE.Matrix4(); inst.getMatrixAt(i, m0); return { inst, i, m0, K: new THREE.Matrix4(), to: drawnBy(inst, i, m0) }; });
    // (what goes with it: a lamp's pool of light on the ground, shrunk to nothing until it is put back)
    const hidden = (b.hide || []).flatMap(([inst, i]) => { const m0 = new THREE.Matrix4(); inst.getMatrixAt(i, m0); return drawnBy(inst, i, m0).map(([o, j]) => [o, j, m0]); });
    for (const [o, j] of hidden) write(o, j, NONE);
    const pts = [], lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
    for (const p of parts) {
      const g = p.inst.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(p.m0); pts.push(v); lo.min(v); hi.max(v); }
    }
    const fall = K.mode === 'fall';
    const c0 = fall ? new THREE.Vector3(b.x, b.y, b.z) : lo.clone().add(hi).multiplyScalar(0.5);
    for (const p of parts) p.K.makeTranslation(-c0.x, -c0.y, -c0.z).multiply(p.m0);
    for (const v of pts) v.sub(c0);
    // the way it goes: the mover's way (or straight off the hit)
    const sp = Math.hypot(m.vx, m.vz) || 1, dx = sp > 0.5 ? m.vx / sp : -nx, dz = sp > 0.5 ? m.vz / sp : -nz;
    let rad = 0.2; for (const v of pts) rad = Math.max(rad, Math.hypot(v.x, v.z));
    const body = { b, parts, hidden, pts, c0, p: c0.clone(), q: new THREE.Quaternion(), t: 0, rest: false, fall, rad: Math.min(0.9, rad), gy: cm.getGroundHeight(b.x, b.z, 'person') };
    if (!fall) {
      // (its own axes, off its first part's turn, and how far it reaches along each: the sides it can lie on)
      const e = parts[0].m0.elements;
      body.axes = [0, 4, 8].map((k) => new THREE.Vector3(e[k], e[k + 1], e[k + 2]).normalize());
      body.ext = body.axes.map((a) => { let lo = Infinity, hi = -Infinity; for (const v of pts) { const d = v.dot(a); lo = Math.min(lo, d); hi = Math.max(hi, d); } return hi - lo; });
    }
    if (fall) {
      // (falling about its foot, over the way it was hit: quick at first from the blow, then gravity; h: its height)
      body.axis = new THREE.Vector3(dz, 0, -dx); body.th = 0; body.h = Math.max(2, hi.y - lo.y);
      body.om = Math.min(1.1, vi * 0.045); body.bounce = 0;
      body.slide = new THREE.Vector3(dx, 0, dz).multiplyScalar(Math.min(1.2, vi * 0.03));
    } else {
      const k = 1 + 0.5 * (1 - K.mass);
      body.v = new THREE.Vector3(m.vx * k + rnd(-1.5, 1.5) - nx * 1.5, Math.min(7, 1.5 + vi * rnd(0.12, 0.25)), m.vz * k + rnd(-1.5, 1.5) - nz * 1.5);
      body.w = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(Math.min(14, vi * rnd(0.35, 0.7)));
    }
    // (in Jolt: a box round its parts on its own axes, set going as above)
    if (!fall && PH && PH.ready && PH.inside(b.x, b.z, 4)) toJolt(body, K);
    bodies.push(body);
    // the sound and the bits: a pole's clang and sparks at its foot, a crunch of whatever it was, a hydrant's water
    const pos = [b.x, b.y + 0.6, b.z], k = Math.min(1.2, vi / 18);
    if (fall) { play('clang', { pos, vol: 0.5 + 0.5 * k }); play('carHit', { pos, vol: 0.35 + 0.4 * k }); fx.spark(b.x, b.y + 0.2, b.z, dx, dz, 14 + Math.round(vi * 0.6), 6); }
    else if (b.kind === 'basket' || b.kind === 'barricade' || b.kind === 'stack' || b.kind === 'paperbox') play('clang', { pos, vol: 0.35 + 0.4 * k, rate: b.kind === 'basket' ? 1.3 : 0.9 });
    else { play('carHit', { pos, vol: 0.3 + 0.5 * k }); play('clang', { pos, vol: 0.4 + 0.4 * k, rate: 0.8 }); }
    if (K.water) { fx.hydrant(b.x, b.y, b.z); play('splash', { pos, vol: 1 }); }
    if (b.kind === 'mailbox' || b.kind === 'cart') fx.bits(b.x, b.y + 0.8, b.z, m.vx, m.vz, 8, 'paint', b.kind === 'mailbox' ? [0.09, 0.24, 0.48] : [0.8, 0.84, 0.88]);
  }
  const _oq = new THREE.Quaternion(), _om = new THREE.Matrix4(), _oc = new THREE.Vector3(), _inv = new THREE.Quaternion();
  function toJolt(B, K) {
    // its box: the extents of its corners along its own axes
    const A = B.axes, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of B.pts) for (let k = 0; k < 3; k++) { const d = v.dot(A[k]); lo[k] = Math.min(lo[k], d); hi[k] = Math.max(hi[k], d); }
    // (the axes as a turn: made square first, the first part's may be a little off)
    const ax = A[0].clone(), ay = A[1].clone().addScaledVector(ax, -A[1].dot(ax)).normalize(), az = new THREE.Vector3().crossVectors(ax, ay);
    _om.makeBasis(ax, ay, az); _oq.setFromRotationMatrix(_om);
    // (its middle, from c0, in the world; and the local corners' box)
    _oc.set(0, 0, 0); for (let k = 0; k < 3; k++) _oc.addScaledVector([ax, ay, az][k], (lo[k] + hi[k]) / 2);
    const h = [0, 1, 2].map((k) => Math.max(0.04, (hi[k] - lo[k]) / 2));
    const p = _oc.clone().add(B.p);
    // (not started inside the ground)
    const g = cm.getGroundHeight(p.x, p.z, 'person'); let low = Infinity;
    for (const v of B.pts) low = Math.min(low, v.y + B.p.y);
    if (low < g + 0.02) p.y += g + 0.02 - low;
    B.jb = PH.addBox(p, _oq, h[0], h[1], h[2], { mass: Math.max(15, K.mass * 1000), friction: 0.55, restitution: 0.25, damp: 0.05, angDamp: 0.12, v: B.v, w: B.w, ccd: true });
    B.jb.kind = 'prop';
    // (its parts' frame: c0 off the box's middle, the box's first turn)
    B.jOff = B.p.clone().sub(p); B.jq0 = _oq.clone().invert();
  }
  // the pose of a thing in Jolt, back into its own (p: where c0 is, q: its turn from as it stood)
  function fromJolt(B) {
    PH.read(B.jb);
    B.q.copy(B.jb.q).multiply(B.jq0);
    B.p.copy(B.jOff).applyQuaternion(_inv.copy(B.jb.q).multiply(B.jq0)).add(B.jb.p);
  }
  function lowest(body, out) {
    // the lowest of its corners now (fallen: only those over a metre from its foot), and the ground under that one
    let min = Infinity, gx = body.p.x, gz = body.p.z;
    for (const v of body.pts) {
      if (body.fall && v.lengthSq() < 1) continue;
      _v.copy(v).applyQuaternion(body.q).add(body.p);
      if (_v.y < min) { min = _v.y; gx = _v.x; gz = _v.z; }
    }
    out.y = min; out.g = body.fall ? cm.getGroundHeight(gx, gz, 'person') : body.gy;
    return out;
  }
  const low = { y: 0, g: 0 };
  // a flying (or fallen small) thing the car drives into is shoved out of its way, not left inside it
  function shove(B) {
    if (!car || !car.body || cm.activeMode !== 'car' || B.p.y > car.position.y + car.body.top + 0.3) return;
    const c = Math.cos(car.heading), s = Math.sin(car.heading), dx = B.p.x - car.position.x, dz = B.p.z - car.position.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c, hx = car.body.hx + B.rad, z0 = car.body.z0 - B.rad, z1 = car.body.z1 + B.rad;
    if (Math.abs(lx) >= hx || lz <= z0 || lz >= z1) return;
    let nx = 0, nz = 0, px = lx, pz = lz;
    const side = hx - Math.abs(lx), back = lz - z0, front = z1 - lz;
    if (side < Math.min(back, front)) { px = Math.sign(lx || 1) * hx; nx = Math.sign(lx || 1); } else if (front < back) { pz = z1; nz = 1; } else { pz = z0; nz = -1; }
    B.p.x = car.position.x + px * c + pz * s; B.p.z = car.position.z - px * s + pz * c;
    const wx = nx * c + nz * s, wz = -nx * s + nz * c, cvx = Math.sin(car.heading) * car.speed + car.vx, cvz = Math.cos(car.heading) * car.speed + car.vz;
    // (only what the car gains on it along the push: one shove, not one a frame)
    const gain = cvx * wx + cvz * wz - (B.v.x * wx + B.v.z * wz);
    if (gain > 0) { B.v.x += wx * gain * 1.2; B.v.z += wz * gain * 1.2; B.v.y = Math.max(B.v.y, Math.min(3, gain * 0.25)); B.w.x += rnd(-3, 3); B.w.z += rnd(-3, 3); }
    B.rest = false; B.to = null; B.t = Math.min(B.t, 8);
  }
  // come to rest: not balanced on a corner or an end, but tipped (over 0.3 s) flat onto one of its six sides: the one
  // nearest facing down, a long thing never on its end, the bigger sides a little preferred
  const _up = new THREE.Vector3(), _sq = new THREE.Quaternion();
  function settle(B) {
    const E = B.ext, top = Math.max(E[0], E[1], E[2]), mid = E[0] + E[1] + E[2] - top - Math.min(E[0], E[1], E[2]);
    let best = Infinity, wx = 0, wy = -1, wz = 0;
    for (let k = 0; k < 3; k++) {
      if (E[k] === top && top > mid * 1.5) continue;
      for (let sg = 1; sg >= -1; sg -= 2) {
        _up.copy(B.axes[k]).multiplyScalar(sg).applyQuaternion(B.q);
        const sc = Math.acos(Math.max(-1, Math.min(1, -_up.y))) + 0.6 * E[k] / top;
        if (sc < best) { best = sc; wx = _up.x; wy = _up.y; wz = _up.z; }
      }
    }
    B.v.set(0, 0, 0); B.w.set(0, 0, 0);
    const th = Math.acos(Math.max(-1, Math.min(1, -wy)));
    if (th < 0.02) { B.rest = true; return; }
    // (turned about the level axis square to that side's way and straight down)
    _ax.set(wz, 0, -wx); if (_ax.lengthSq() < 1e-8) _ax.set(1, 0, 0);
    _sq.setFromAxisAngle(_ax.normalize(), th);
    B.from = B.q.clone(); B.to = _sq.clone().multiply(B.q); B.k = 0;
  }
  function update(dt, cam) {
    frame++;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const B = bodies[i];
      if (B.jb) {
        // (in Jolt: as it lies or flies; frozen once it leaves the local world)
        if (!B.jb.frozen && !PH.inside(B.jb.p.x, B.jb.p.z, 2)) PH.freeze(B.jb);
        if (!B.jb.frozen) fromJolt(B);
        B.rest = B.jb.frozen || !B.jb.active;
        if (B.rest && cam && Math.hypot(B.c0.x - cam.x, B.c0.z - cam.z) > 230) {
          for (const p of B.parts) for (const [o, j] of p.to) write(o, j, p.m0);
          for (const [o, j, m0] of B.hidden) write(o, j, m0);
          B.b.taken = false; if (B.b.light) B.b.light.out = false;
          PH.remove(B.jb); bodies.splice(i, 1); continue;
        }
        // (a landing's clang)
        if (!B.rest) { const vy = PH.vel(B.jb, _wp).y; if ((B.lvy || 0) < -2.5 && vy > (B.lvy || 0) + 2) play('clang', { pos: [B.p.x, B.p.y, B.p.z], vol: Math.min(0.6, -B.lvy * 0.1), rate: 0.9 + Math.random() * 0.3 }); B.lvy = vy; }
        if (!B.rest || !B.drawnRest) { B.drawnRest = B.rest; _b.compose(B.p, B.q, _one); for (const p of B.parts) { _m.multiplyMatrices(_b, p.K); for (const [o, j] of p.to) write(o, j, _m); } }
        continue;
      }
      // (still flying when Jolt came in: handed to it)
      if (!B.fall && !B.rest && !B.to && PH && PH.ready && PH.inside(B.p.x, B.p.z, 4)) { toJolt(B, KINDS[B.b.kind]); continue; }
      if (!B.fall) shove(B);
      if (B.rest) {
        // put back, the camera far away
        if (cam && Math.hypot(B.c0.x - cam.x, B.c0.z - cam.z) > 230) {
          for (const p of B.parts) for (const [o, j] of p.to) write(o, j, p.m0);
          for (const [o, j, m0] of B.hidden) write(o, j, m0);
          B.b.taken = false; if (B.b.light) B.b.light.out = false;
          bodies.splice(i, 1);
        }
        continue;
      }
      B.t += dt;
      if (B.fall) {
        B.om += (3 * 9.8 / (2 * B.h)) * Math.sin(Math.max(0.05, B.th)) * dt;
        B.th += B.om * dt;
        B.p.copy(B.c0).addScaledVector(B.slide, Math.min(1, B.t * 3));
        B.q.setFromAxisAngle(B.axis, B.th);
        lowest(B, low);
        if (low.y < low.g + 0.02 || B.th > Math.PI / 2 + 0.05) {
          // (down: back to where it touched, a bounce or two, then lying there)
          while (B.th > 0.05) { B.th -= 0.01; B.q.setFromAxisAngle(B.axis, B.th); if (lowest(B, low).y >= low.g + 0.02) break; }
          if (B.bounce < 2 && B.om > 0.6) { B.om = -B.om * 0.22; B.bounce++; if (B.bounce === 1) { const top = _v.set(0, B.h, 0).applyQuaternion(B.q).add(B.p); play('clang', { pos: [top.x, top.y, top.z], vol: 0.7, rate: 0.75 }); fx.spark(top.x, top.y + 0.1, top.z, B.axis.z, -B.axis.x, 10, 4); } }
          else { B.om = 0; B.rest = true; }
        }
      } else if (B.to) {
        // (settling: tipped onto its nearest flat way to lie (upright, on its side, upside down), down on the ground)
        B.k = Math.min(1, B.k + dt / 0.3); B.q.slerpQuaternions(B.from, B.to, B.k * B.k * (3 - 2 * B.k));
        lowest(B, low); B.p.y += low.g - low.y;
        if (B.k >= 1) { B.to = null; B.rest = true; }
      } else {
        B.v.y -= 9.8 * dt;
        B.p.addScaledVector(B.v, dt);
        // (the buildings stop it: pushed back out of a facade, bouncing off it and tumbling)
        _wp.set(B.p.x, 0, B.p.z); cm.resolveHorizontalCollision(_wp, Math.max(0.2, B.rad * 0.6), B.p.y);
        const ox = _wp.x - B.p.x, oz = _wp.z - B.p.z, o = Math.hypot(ox, oz);
        if (o > 1e-4) {
          const nx = ox / o, nz = oz / o, vn = B.v.x * nx + B.v.z * nz;
          B.p.x = _wp.x; B.p.z = _wp.z;
          if (vn < 0) { B.v.x -= nx * vn * 1.35; B.v.z -= nz * vn * 1.35; B.w.x += rnd(-4, 4); B.w.z += rnd(-4, 4); if (vn < -4) play('clang', { pos: [B.p.x, B.p.y, B.p.z], vol: Math.min(0.8, -vn * 0.05), rate: 0.8 }); }
        }
        const wl = B.w.length();
        if (wl > 1e-4) { _q.setFromAxisAngle(_ax.copy(B.w).divideScalar(wl), wl * dt); B.q.premultiply(_q); }
        B.gy = cm.getGroundHeight(B.p.x, B.p.z, 'person');
        lowest(B, low);
        if (low.y < low.g) {
          B.p.y += low.g - low.y;
          if (B.v.y < 0) B.v.y = -B.v.y * 0.3;
          B.v.x *= 0.62; B.v.z *= 0.62; B.w.multiplyScalar(0.62);
          if (B.v.y < 0.8 && Math.hypot(B.v.x, B.v.z) < 0.5 && wl < 1.2) settle(B);
          else if (B.v.y > 1.5) play('clang', { pos: [B.p.x, B.p.y, B.p.z], vol: Math.min(0.6, B.v.y * 0.12), rate: 0.9 + Math.random() * 0.3 });
        }
        if (B.t > 12 && !B.to) settle(B);
      }
      _b.compose(B.p, B.q, _one);
      for (const p of B.parts) { _m.multiplyMatrices(_b, p.K); for (const [o, j] of p.to) write(o, j, _m); }
    }
  }
  // (for a test: everything put back now)
  function reset() { for (const B of bodies) { if (B.jb) PH.remove(B.jb); for (const p of B.parts) for (const [o, j] of p.to) write(o, j, p.m0); for (const [o, j, m0] of B.hidden) write(o, j, m0); B.b.taken = false; if (B.b.light) B.b.light.out = false; } bodies.length = 0; }
  return { list, around, collide, update, reset, bodies, KINDS };
}
