// Mog City: the street crowd. New Yorkers on every sidewalk round Dan, several times what the city keeps of its own
// (js/traffic.js spreads its 340 walkers over 320 m): they walk round the blocks both ways, keep to their side, step
// round the street furniture, bunch up at the corners waiting for the WALK and cross on it, stand about, and run from
// trouble. One instanced, skinned draw per level of detail (js/pedestrians.js PersonCrowd); only those in view solve
// their bones and are drawn. People knocked down are bodies (thrown.js) until they are up and running again.
//   A person on a lane: block b (a curb island, city-config.js BLOCKS: its outline, Broadway's triangles too), side k
//   (an edge of the outline, in order), `a` m along that edge, `o` m in from the curb, walking dir +1 / -1 along it.
//   The lane at o runs between the corners of the outline set in by o (aStart .. aEnd).
import * as THREE from 'three/webgpu';
import { Thrown } from './thrown.js';

const MAX = 560; // the crowd's own people (and up to EXTRA taken over from the city's when knocked down)
const EXTRA = 48;
const R_IN = 95; // they keep within this of where Dan is headed (more of them nearer)...
const R_OUT = 110; // ...and anyone further (and out of sight) is put back somewhere near him, out of sight:
const R_MIN = 16; // never nearer him than this, out of view or behind a building; in plain view only past POP (far
const POP = 78; // off, GTA's way: the sidewalks ahead of a car filled before it gets there)
const LEAD = 3; // (where he's headed: this many seconds on at his speed, up to 50 m)
const LANE = [2.2, 4.1]; // m in from the curb: clear of the tree pits and the lamp posts, short of the shop fronts
const PARK_LANE = [1.0, 2.2]; // (round a park: its perimeter walk, short of the fence or the terrace)
const COMMERCIAL = new Set(['midtown', 'times_square', 'billionaires_row', 'garment', 'fidi', 'civic_center', 'hudson_yards', 'flatiron', 'nomad',
  'koreatown', 'murray_hill', 'chelsea', 'union_square', 'soho', 'theater_district']);
const rand = (a, b) => a + Math.random() * (b - a);

export function createCrowd(W) {
  const NYC = window.NYC, app = W.app, cm = app.controllerManager;
  const { PersonCrowd, PersonRig, blockAt, blocksInRect, walkSignal } = NYC;
  const drawn = new PersonCrowd(MAX + EXTRA, { farShadow: false, name: 'StreetPeople' });
  for (const m of drawn.meshes) app.scene.add(m);
  const ground = (owner, x, z) => cm.getGroundHeight(x, z, 'person');
  const groundXZ = (x, z) => cm.getGroundHeight(x, z, 'person');
  const collide = (pos, r) => cm.resolveHorizontalCollision(pos, r, pos.y + 1.0);
  // (under a body thrown about: the street, the sidewalk, a park's raised lawn; never Dan's car, see carAt)
  const bodyGround = groundXZ;
  // Dan's car to a body thrown about (thrown.js carAt): null clear of its box (r m out), else its surface's height
  // there (the bonnet and the deck lower than the roof), over (over its body or its nose, not beside it), its velocity,
  // and the way out of it: over its body, out of its nearest side; beside it, the nearest way out
  const carAt = (x, z, r, out) => {
    const c = W.car, B = c.body || { hx: 0.95, z0: -2.12, z1: 2.26 };
    if (!c.mesh?.visible) return null;
    const cs = Math.cos(c.heading), sn = Math.sin(c.heading), dx = x - c.position.x, dz = z - c.position.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const side = B.hx + r - Math.abs(lx), back = lz - (B.z0 - r), front = B.z1 + r - lz;
    if (side <= 0 || back <= 0 || front <= 0) return null;
    const top = B.top ?? 1.2, sx = Math.sign(lx || 1);
    out.top = c.position.y + (lz > B.z1 - 1.4 ? top - 0.45 : lz < B.z0 + 0.9 ? top - 0.3 : top);
    out.over = Math.abs(lx) < B.hx && lz > B.z0;
    const sp = c.speed || 0;
    out.vx = Math.sin(c.heading) * sp + (c.vx || 0); out.vz = Math.cos(c.heading) * sp + (c.vz || 0);
    // (the way out, in its frame, then the world's)
    let nx = sx, nz = 0, d = side;
    if (!out.over && Math.min(back, front) < side) { nx = 0; nz = back < front ? -1 : 1; d = Math.min(back, front); }
    out.sx = nx * cs + nz * sn; out.sz = -nx * sn + nz * cs; out.d = d;
    return out;
  };
  const hash = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

  // ------------------------------------------------------------------ the blocks' sidewalks
  // Each edge of a block's curb outline: start (ox, oz), along it (ux, uz), in from it (nx, nz), its length, and how far
  // the set-in corners move along it per metre in (ms at its start, me at its end: a lane at o runs from o * ms to
  // len + o * me; a right-angled corner gives 1 and -1)
  const sides = new Map();
  const usable = (b) => !!b && !b.median && b.area > 500 && b.area < 80000 && b.poly && b.poly.length >= 3 && b.poly.length < 40;
  const band = (b) => (b.park > 0.6 ? PARK_LANE : LANE);
  function sidesOf(b) {
    let S = sides.get(b);
    if (S) return S;
    const P = b.poly, n = P.length;
    let A = 0;
    for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; A += p.x * q.z - q.x * p.z; }
    S = [];
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n], len = Math.hypot(q.x - p.x, q.z - p.z) || 1e-6;
      const ux = (q.x - p.x) / len, uz = (q.z - p.z) / len;
      S.push({ ox: p.x, oz: p.z, ux, uz, nx: A > 0 ? -uz : uz, nz: A > 0 ? ux : -ux, len, ms: 0, me: 0 });
    }
    // (the corner's mitre: in by o from both edges at o (n1 + n2) / (1 + n1 . n2), cut short at sharp corners)
    for (let i = 0; i < n; i++) {
      const s0 = S[(i - 1 + n) % n], s1 = S[i], d = Math.max(0.25, 1 + s0.nx * s1.nx + s0.nz * s1.nz);
      const mx = (s0.nx + s1.nx) / d, mz = (s0.nz + s1.nz) / d;
      s1.ms = mx * s1.ux + mz * s1.uz;
      s0.me = mx * s0.ux + mz * s0.uz;
    }
    sides.set(b, S);
    return S;
  }
  const aStart = (S, o) => o * S.ms, aEnd = (S, o) => S.len + o * S.me;
  const walkable = (S, o) => aEnd(S, o) - aStart(S, o) > 2;
  // street furniture (js/street-details.js footprints: poles, subway stairs, barricades) in 8 m cells
  const FP = new Map(), FCELL = 8, fkey = (ix, iz) => (ix + 8192) * 16384 + (iz + 8192);
  for (const f of NYC.streetFootprints || []) {
    for (let ix = Math.floor(f.minX / FCELL); ix <= Math.floor(f.maxX / FCELL); ix++) {
      for (let iz = Math.floor(f.minZ / FCELL); iz <= Math.floor(f.maxZ / FCELL); iz++) {
        const k = fkey(ix, iz); let l = FP.get(k); if (!l) FP.set(k, (l = [])); l.push(f);
      }
    }
  }
  function furnitureAt(x, z, m) {
    const l = FP.get(fkey(Math.floor(x / FCELL), Math.floor(z / FCELL)));
    if (l) for (const f of l) if (x > f.minX - m && x < f.maxX + m && z > f.minZ - m && z < f.maxZ + m) return f;
    return null;
  }
  // (a building's wall: the city's colliders)
  const _w = new THREE.Vector3();
  const inWall = (x, z) => { _w.set(x, 0.2, z); collide(_w, 0.3); return Math.abs(_w.x - x) + Math.abs(_w.z - z) > 0.01; };

  // hold zones (a cutscene's set, a mission's spot): the city's traffic keeps out of them, so do they
  let holds = [];
  const held = (x, z, m = 0) => { for (const r of holds) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true; return false; };

  // ------------------------------------------------------------------ the people
  const people = [];
  for (let i = 0; i < MAX; i++) {
    const female = hash(i, 1) < 0.5, hr = hash(i, 2);
    people.push({
      i, rig: new PersonRig({
        seed: 1000 + i * 1.6180339, female, scale: (female ? 0.91 : 0.97) + hash(i, 4) * 0.1, girth: 0.9 + hash(i, 5) * 0.24,
        hair: female ? (hr < 0.68 ? 1 : 0.3 + hr * 0.25) : hr < 0.08 ? 1 : hr * 0.35, armSwing: 0.75 + hash(i, 6) * 0.5, stride: 0.94 + hash(i, 7) * 0.12,
      }),
      walk: 1.12 + hash(i, 8) * 0.5, // their own pace (m/s)
      placed: false, fresh: true, state: 'walk', b: null, k: 0, a: 0, o: 3, home: 3, oT: 3, dir: 1, v: 0, t: 0, x: 0, z: 0, yaw: 0, vis: false,
    });
  }
  // the city's own people taken over while they are down (js/traffic.js p.away)
  const taken = [];

  const P = W.person;
  const focus = { x: 0, z: 0 }, lead = { x: 0, z: 0, vx: 0, vz: 0 }, cam = { x: 0, y: 0, z: 0 };
  const focusOf = () => { const e = cm.activeMode === 'car' ? W.car : P; focus.x = e.position.x; focus.z = e.position.z; };
  // where he'll be in a few seconds (his speed smoothed; forgotten across a jump)
  function leadOf(dt, jump) {
    if (jump || !(dt > 0)) { lead.vx = lead.vz = 0; }
    else {
      const k = Math.min(1, dt * 2);
      lead.vx += ((focus.x - lead.fx) / dt - lead.vx) * k; lead.vz += ((focus.z - lead.fz) / dt - lead.vz) * k;
    }
    lead.fx = focus.x; lead.fz = focus.z;
    const s = Math.min(50, Math.hypot(lead.vx, lead.vz) * LEAD), v = Math.hypot(lead.vx, lead.vz) || 1;
    lead.x = focus.x + (lead.vx / v) * s; lead.z = focus.z + (lead.vz / v) * s;
  }

  // where a person on a lane stands, facing the way they walk
  function laneXZ(p) {
    const S = sidesOf(p.b)[p.k];
    p.x = S.ox + S.ux * p.a + S.nx * p.o; p.z = S.oz + S.uz * p.a + S.nz * p.o;
    p.yaw = Math.atan2(S.ux * p.dir, S.uz * p.dir);
  }
  // a lane in from the curb, mostly keeping to the right of the way they walk (two flows that pass each other)
  function laneFor(p) {
    const [lo, hi] = band(p.b), mid = (lo + hi) * 0.5;
    const S = sidesOf(p.b)[p.k], curbRight = (S.ux * S.nz - S.uz * S.nx) * p.dir > 0;
    return (curbRight === (Math.random() < 0.85)) ? rand(lo, mid) : rand(mid, hi);
  }

  // blocks round where he's headed (refreshed as it moves), weighted by their curb length (busier in the commercial districts)
  let near = [], nearW = 0, nearAt = { x: 1e9, z: 1e9 }, active = MAX;
  function refreshNear() {
    if (Math.hypot(lead.x - nearAt.x, lead.z - nearAt.z) < 15) return;
    nearAt = { x: lead.x, z: lead.z };
    // (weighted by curb length, busier in the commercial districts and nearer him)
    near = blocksInRect(lead.x - R_IN, lead.x + R_IN, lead.z - R_IN, lead.z + R_IN).filter(usable).map((b) => {
      const len = sidesOf(b).reduce((s, S) => s + S.len, 0), d = Math.hypot(b.cx - lead.x, b.cz - lead.z);
      return { b, len, w: len * (COMMERCIAL.has(b.district) ? 1 : 0.6) * (b.park > 0.6 ? 0.5 : 1) / (1 + d / 55) };
    });
    nearW = near.reduce((s, n) => s + n.w, 0);
    // (how many of them are out: all of them in the commercial districts, under half on the quieter streets)
    const cw = near.reduce((s, n) => s + (COMMERCIAL.has(n.b.district) ? n.w : 0), 0);
    active = Math.round(MAX * (0.45 + 0.55 * (nearW ? cw / nearW : 1)));
  }

  // the view (with a margin for the people's own height and shadows)
  const frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(new THREE.Vector3(), 1.6);
  function seen(x, y, z, r = 1.6) { _sph.center.set(x, y + 0.9, z); _sph.radius = r; return frustum.intersectsSphere(_sph); }
  let camOK = false;
  // behind a building from the camera: a point on the way from (x, z) to it inside one taller than the line of sight
  function behindWall(x, z) {
    const dx = cam.x - x, dz = cam.z - z, L = Math.hypot(dx, dz);
    for (const s of [3, 6, 10, 15, 22, 32, 45]) {
      if (s > L - 2) break;
      const k = s / L, qx = x + dx * k, qz = z + dz * k, y = 1.7 + (cam.y - 1.7) * k;
      for (const c of cm.nearColliders(qx, qz, 0)) {
        if (c.carOnly || c.maxY < y || qx < c.minX || qx > c.maxX || qz < c.minZ || qz > c.maxZ) continue;
        if (c.obb) { const o = c.obb, ox = qx - o.cx, oz = qz - o.cz; if (Math.abs(ox * o.cs - oz * o.sn) > o.hx || Math.abs(ox * o.sn + oz * o.cs) > o.hz) continue; }
        return true;
      }
    }
    return false;
  }
  // out of sight: out of the view, behind a building, or far enough off not to be noticed arriving
  const unseen = (x, z) => !camOK || !seen(x, 0.2, z, 2.5) || Math.hypot(x - cam.x, z - cam.z) > POP || behindWall(x, z);

  // put p on a random sidewalk rMin m or more from him and up to rMax from where he's headed (out of sight if hidden);
  // some near a corner, some standing
  function spawn(p, rMin, rMax, hidden) {
    if (!near.length) return false;
    for (let tries = 0; tries < 10; tries++) {
      let r = Math.random() * nearW, n = near[0];
      for (const c of near) { r -= c.w; if (r <= 0) { n = c; break; } }
      const S = sidesOf(n.b);
      let l = Math.random() * n.len, k = 0;
      while (k < S.length - 1 && l > S[k].len) { l -= S[k].len; k++; }
      p.b = n.b; p.k = k; p.dir = Math.random() < 0.5 ? 1 : -1;
      p.home = p.oT = p.o = laneFor(p);
      const a0 = aStart(S[k], p.o) + 0.5, a1 = aEnd(S[k], p.o) - 0.5;
      if (a1 - a0 < 2) continue;
      p.a = rand(a0, a1);
      if (Math.random() < 0.22) p.a = p.dir > 0 ? a1 - rand(0, 6) : a0 + rand(0, 6); // (near a corner)
      p.a = Math.min(a1, Math.max(a0, p.a));
      laneXZ(p);
      if (Math.hypot(p.x - focus.x, p.z - focus.z) < rMin || Math.hypot(p.x - lead.x, p.z - lead.z) > rMax || held(p.x, p.z, 2) || furnitureAt(p.x, p.z, 0.45) || inWall(p.x, p.z) || (hidden && !unseen(p.x, p.z))) continue;
      p.placed = true; p.fresh = false; p.rig.placed = false; p.state = 'walk'; p.v = p.walk; p.t = 0; p.flee = 0; p.cross = null; p.shove = null;
      if (Math.random() < 0.1) {
        // standing about: by the shop fronts or at the curb, facing anywhere
        p.state = 'idle'; p.t = rand(4, 25); p.o = p.oT = Math.random() < 0.6 ? band(p.b)[1] : band(p.b)[0] - 0.3;
        if (inWall(S[k].ox + S[k].ux * p.a + S[k].nx * p.o, S[k].oz + S[k].uz * p.a + S[k].nz * p.o)) p.o = p.oT = band(p.b)[0];
        laneXZ(p); p.yaw = Math.random() * Math.PI * 2;
      }
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ the corners: waiting, crossing, turning
  const corners = new Map(); // `${block id}:${side}:${dir}` -> those waiting there
  // the lane across the street straight ahead of p (on the line o m in from its curb): where they step off, the lane
  // over there (block, side, along, in, which way) and where it starts; or null
  function across(p, o) {
    const S = sidesOf(p.b)[p.k], dx = S.ux * p.dir, dz = S.uz * p.dir;
    let x = S.ox + S.ux * p.a + S.nx * o, z = S.oz + S.uz * p.a + S.nz * o, s = 0;
    // (to the curb...)
    while (s < 14 && blockAt(x, z) === p.b) { x += dx * 0.5; z += dz * 0.5; s += 0.5; }
    if (s >= 14) return null;
    const cx = x, cz = z;
    // (...and over the street to the next block)
    for (let t = 2; t < 46; t += 1) {
      const qx = cx + dx * t, qz = cz + dz * t, b2 = blockAt(qx, qz);
      if (!b2) continue;
      if (!usable(b2)) return null;
      const S2 = sidesOf(b2);
      for (let k2 = 0; k2 < S2.length; k2++) {
        const T = S2[k2];
        if (T.nx * S.nx + T.nz * S.nz < 0.94) continue;
        const o2 = (qx - T.ox) * T.nx + (qz - T.oz) * T.nz, al = (qx - T.ox) * T.ux + (qz - T.oz) * T.uz;
        if (o2 < 0.5 || o2 > band(b2)[1] + 0.4 || al < -8 || al > T.len + 8 || !walkable(T, o2)) continue;
        const dir2 = T.ux * dx + T.uz * dz > 0 ? 1 : -1, a2 = dir2 > 0 ? aStart(T, o2) : aEnd(T, o2);
        return { b: b2, k: k2, a: a2, o: o2, dir: dir2, sx: cx - dx * 0.45, sz: cz - dz * 0.45,
          ex: T.ox + T.ux * a2 + T.nx * o2, ez: T.oz + T.uz * a2 + T.nz * o2, dx, dz };
      }
      return null;
    }
    return null;
  }
  // at the end of their side: over the street ahead (waiting for the WALK) or round the corner
  function atCorner(p) {
    if (p.state !== 'flee' && Math.random() < 0.62) {
      const key = `${p.b.id}:${p.k}:${p.dir}`;
      let q = corners.get(key); if (!q) corners.set(key, (q = []));
      const slot = q.length;
      if (slot < 16) {
        // (in rows of four along the crosswalk's stripes, 0.7 to 2.4 m in from the line of the curb they walked)
        const line = 0.75 + (slot % 4) * 0.5 + rand(-0.08, 0.08), back = Math.floor(slot / 4) * 0.62 + rand(0, 0.15);
        const c = across(p, line);
        if (c) { c.key = key; c.back = back; p.cross = c; p.state = 'wait'; p.t = 0; q.push(p); return; }
      }
    }
    // round the corner: onto the next side (past any too short to walk at this o)
    const S = sidesOf(p.b);
    let k2 = p.k;
    for (let n = 0; n < S.length; n++) { k2 = (k2 + p.dir + S.length) % S.length; if (walkable(S[k2], p.o)) break; }
    p.k = k2; p.a = p.dir > 0 ? aStart(S[k2], p.o) : aEnd(S[k2], p.o);
    p.home = p.oT = laneFor(p);
  }
  function leaveCorner(p) {
    const q = p.cross && p.cross.key && corners.get(p.cross.key);
    if (q) { const i = q.indexOf(p); if (i >= 0) q.splice(i, 1); }
  }

  // ------------------------------------------------------------------ trouble: running away, diving, thrown
  let screamT = 0;
  const scream = (x, y, z, k = 1) => { if (screamT > 0 || Math.random() > k) return; screamT = 0.35 + Math.random() * 0.5; W.audio?.play?.('scream', { pos: [x, y + 1.5, z], vol: 0.85 }); };
  // run from (tx, tz): along their lane, the way away from it (on a crossing: on over it, quicker)
  function scare(p, tx, tz, secs = rand(5, 9)) {
    if (!p.placed || p.body || p.state === 'free') return;
    if (p.state === 'wait') { leaveCorner(p); p.state = 'walk'; p.cross = null; }
    if (p.state === 'cross') { p.panic = Math.max(p.panic || 0, secs); if (!p.run) p.run = rand(3.6, 5.3); return; }
    const S = sidesOf(p.b)[p.k], along = (p.x - tx) * S.ux + (p.z - tz) * S.uz;
    if (p.state !== 'flee') { p.dir = along === 0 ? (Math.random() < 0.5 ? 1 : -1) : Math.sign(along); p.run = rand(3.6, 5.3); }
    p.state = 'flee'; p.flee = Math.max(p.flee || 0, secs);
  }
  // out of the line of something on their sidewalk at (tx, tz): over to the far side of their walk from it
  function aside(p, tx, tz) {
    if (!p.b || p.body || (p.state !== 'flee' && p.state !== 'walk' && p.state !== 'idle')) return;
    const S = sidesOf(p.b)[p.k], [lo, hi] = band(p.b), at = (tx - S.ox) * S.nx + (tz - S.oz) * S.nz;
    p.home = p.oT = at > p.o ? Math.max(0.6, lo - 1.2) : hi + 0.3;
    p.clearT = 3;
  }

  // knocked down (or diving): the body takes over until they're up
  function knock(p, how) {
    if (p.body) return null;
    if (p.state === 'wait' || p.state === 'cross') leaveCorner(p);
    const body = new Thrown(p.rig, p.x, groundXZ(p.x, p.z), p.z, p.rig.yaw ?? p.yaw, bodyGround, collide, carAt);
    body.onLand = (bd, impact) => { if (impact > 4) W.audio?.play?.('pedHit', { pos: [bd.pos.x, bd.pos.y, bd.pos.z], vol: Math.min(0.6, impact / 14) }); };
    p.body = body; p.state = 'down'; p.cross = null; p.shove = null;
    how(body);
    return body;
  }

  // up off the street (or shoved off their way): to the nearest sidewalk lane, then running from (fromX, fromZ)
  function backOnLane(p, fromX, fromZ) {
    const x = p.body ? p.body.pos.x : p.x, z = p.body ? p.body.pos.z : p.z;
    if (p.body) { p.body = null; p.rig.placed = false; }
    p.x = x; p.z = z;
    let best = null, bd = Infinity;
    for (const b of blocksInRect(x - 30, x + 30, z - 30, z + 30)) {
      if (!usable(b)) continue;
      const S = sidesOf(b);
      for (let k = 0; k < S.length; k++) {
        const T = S[k], o = Math.min(band(b)[1], Math.max(band(b)[0], (x - T.ox) * T.nx + (z - T.oz) * T.nz));
        if (!walkable(T, o)) continue;
        const a = Math.min(aEnd(T, o), Math.max(aStart(T, o), (x - T.ox) * T.ux + (z - T.oz) * T.uz));
        const lx = T.ox + T.ux * a + T.nx * o, lz = T.oz + T.uz * a + T.nz * o, d = Math.hypot(lx - x, lz - z);
        if (d < bd) { bd = d; best = { b, k, a, o, lx, lz }; }
      }
    }
    p.run = rand(3.8, 5.4); p.state = 'free';
    if (!best) { p.goal = null; p.t = 8; return; }
    Object.assign(p, { b: best.b, k: best.k, a: best.a, o: best.o, home: best.o, oT: best.o });
    const S = sidesOf(p.b)[p.k], along = (best.lx - fromX) * S.ux + (best.lz - fromZ) * S.uz;
    p.dir = along >= 0 ? 1 : -1;
    p.goal = { x: best.lx, z: best.lz };
    p.flee = rand(6, 10);
  }

  // ------------------------------------------------------------------ a frame
  let clock = 0, jumpAt = null, enabled = true;
  const dyn = []; // (Dan and his parked car: they step round them)
  function update(dt, elapsed, camera) {
    clock = elapsed ?? clock + dt;
    screamT -= dt;
    focusOf();
    const jump = !jumpAt || Math.hypot(focus.x - jumpAt.x, focus.z - jumpAt.z) > 120;
    leadOf(dt, !jumpAt || Math.hypot(focus.x - jumpAt.x, focus.z - jumpAt.z) > 30);
    jumpAt = { x: focus.x, z: focus.z };
    refreshNear();
    dyn.length = 0;
    if (cm.activeMode === 'person' && P.mesh.visible) dyn.push({ x: P.position.x, z: P.position.z, r: 0.55 });
    if (cm.activeMode !== 'car' && W.car.mesh.visible) dyn.push({ x: W.car.position.x, z: W.car.position.z, r: 2.3 });
    camOK = !!camera;
    if (camera) { camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(_pm); const e = camera.matrixWorld.elements; cam.x = e[12]; cam.y = e[13]; cam.z = e[14]; }
    let budget = jump ? Infinity : 10;
    drawn.begin();
    for (const p of enabled ? people : []) {
      // placed somewhere near, kept near where he's headed (those left behind out of sight put back ahead), kept out
      // of the hold zones
      if (!p.body && p.state !== 'free') {
        // (those over the number for these streets put away once out of sight)
        if (p.i >= active) {
          if (p.placed && !p.vis) { if (p.state === 'wait' || p.state === 'cross') leaveCorner(p); p.placed = false; }
          if (!p.placed) { p.fresh = false; continue; } // (out again later out of sight, or anywhere on a jump)
        }
        const d = p.placed ? Math.hypot(p.x - lead.x, p.z - lead.z) : Infinity;
        // (anywhere at the start or after a jump; else out of sight: one left behind, or one more for busier streets)
        const out = p.fresh || (jump && d > R_IN) ? 'any'
          : budget > 0 && (!p.placed || (d > R_OUT && (!p.vis || (Math.random() < 0.1 && budget-- > 0 && behindWall(p.x, p.z))))) ? 'hidden'
          : p.placed && holds.length && held(p.x, p.z, 0.5) ? 'held' : null;
        if (out) {
          if (p.state === 'wait' || p.state === 'cross') leaveCorner(p);
          p.placed = false;
          if (out === 'any') spawn(p, 0, R_IN, false);
          else if (out === 'hidden') { budget--; spawn(p, R_MIN, R_IN, true); }
          else if (!spawn(p, R_MIN, R_IN, true)) spawn(p, 40, R_IN * 1.4, false);
        }
        if (!p.placed) continue;
      }
      step(p, dt);
      draw(p, dt);
    }
    // the city's people while they're down and running; handed back once out of view (the city puts them back
    // somewhere out of view: js/traffic.js p.away)
    for (let i = taken.length - 1; i >= 0; i--) {
      const p = taken[i];
      if (p.placed) step(p, dt);
      if (!p.body && !p.vis && (Math.hypot(p.x - focus.x, p.z - focus.z) > 30 || p.state === 'walk' || !p.placed)) { p.release = true; taken.splice(i, 1); continue; }
      draw(p, dt);
    }
    drawn.end();
  }

  function step(p, dt) {
    if (p.body) {
      const st = p.body.step(dt);
      p.x = p.body.pos.x; p.z = p.body.pos.z;
      if (st === 'up') backOnLane(p, p.hitX ?? p.x, p.hitZ ?? p.z);
      return;
    }
    if (p.shove) {
      // shoved by a slow car: stumbling a few steps aside
      const k = Math.exp(-5 * dt);
      p.shove.x *= k; p.shove.z *= k;
      if (p.state === 'free' || p.state === 'cross' || p.state === 'wait') { p.x += p.shove.x * dt; p.z += p.shove.z * dt; }
      else { const S = sidesOf(p.b)[p.k]; p.a += (p.shove.x * S.ux + p.shove.z * S.uz) * dt; p.o = Math.min(4.6, Math.max(0.35, p.o + (p.shove.x * S.nx + p.shove.z * S.nz) * dt)); }
      if (Math.hypot(p.shove.x, p.shove.z) < 0.15) p.shove = null;
    }
    if (p.state === 'free') {
      // up again (in the road, as like as not): to the sidewalk, running
      const g = p.goal;
      if (!g) { p.t -= dt; if (p.t <= 0) { p.placed = false; p.state = 'walk'; } return; }
      const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz), sp = Math.min(p.run, 0.6 + d * 3);
      if (d < 0.3) { p.state = 'flee'; p.goal = null; laneXZ(p); return; }
      p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt; p.yaw = Math.atan2(dx, dz);
      return;
    }
    if (p.state === 'wait') {
      // to the curb, then standing there until the WALK (across the avenue with the cross street's lights)
      const c = p.cross, wx = c.sx - c.dx * c.back, wz = c.sz - c.dz * c.back;
      const dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const sp = Math.min(p.walk, d * 2.5); p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt; }
      p.yaw = d > 0.4 ? Math.atan2(dx, dz) : Math.atan2(c.dx, c.dz);
      p.t += dt;
      if (d < 0.5 && walkSignal(clock, Math.abs(c.dz) > Math.abs(c.dx)) && p.t > 0.4 + c.back * 0.6) { p.state = 'cross'; p.t = 0; }
      else if (p.t > 75) { leaveCorner(p); p.state = 'walk'; p.dir = -p.dir; p.cross = null; laneXZ(p); }
      return;
    }
    if (p.state === 'cross') {
      // over the crosswalk to the lane across the street
      const c = p.cross, dx = c.ex - p.x, dz = c.ez - p.z, d = Math.hypot(dx, dz), sp = p.panic > 0 ? p.run || 4.2 : p.walk * 1.06;
      if (p.panic > 0) p.panic -= dt;
      if (d < 0.25) {
        leaveCorner(p);
        Object.assign(p, { b: c.b, k: c.k, a: c.a, o: c.o, dir: c.dir, cross: null, state: p.panic > 0 ? 'flee' : 'walk' });
        p.home = p.oT = laneFor(p); // (back over to their side of the walk)
        if (p.state === 'flee') p.flee = Math.max(2, p.panic);
        laneXZ(p);
        return;
      }
      const v = Math.min(sp, d * 4);
      p.x += (dx / d) * v * dt; p.z += (dz / d) * v * dt; p.yaw = Math.atan2(dx, dz);
      return;
    }
    if (!p.b) return;
    const S = sidesOf(p.b)[p.k];
    if (p.state === 'idle') {
      p.t -= dt;
      const yaw = p.yaw; laneXZ(p); p.yaw = yaw;
      if (p.t <= 0) { p.state = 'walk'; p.oT = p.home = laneFor(p); }
      return;
    }
    // walking (or running from something) along the lane
    let sp = p.walk;
    if (p.state === 'flee') { sp = p.run; p.flee -= dt; if (p.flee <= 0) p.state = 'walk'; }
    p.v += (sp - p.v) * Math.min(1, dt * (p.state === 'flee' ? 4 : 1.5));
    p.a += p.dir * p.v * dt;
    // round the street furniture ahead: over to whichever side of it has room
    const ax = S.ox + S.ux * (p.a + p.dir * 1.8) + S.nx * p.o, az = S.oz + S.uz * (p.a + p.dir * 1.8) + S.nz * p.o;
    const f = furnitureAt(ax, az, 0.4);
    if (f) {
      let l0 = Infinity, l1 = -Infinity;
      for (const [fx, fz] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]]) { const l = (fx - S.ox) * S.nx + (fz - S.oz) * S.nz; l0 = Math.min(l0, l); l1 = Math.max(l1, l); }
      const out = l1 + 0.45, inn = l0 - 0.45;
      const [lo, hi] = band(p.b);
      p.oT = out < hi + 0.4 && (inn < lo - 1.3 || Math.abs(out - p.o) < Math.abs(inn - p.o)) ? out : Math.max(0.6, inn);
      p.clearT = 1.2;
    } else if ((p.clearT = (p.clearT || 0) - dt) <= 0) p.oT = p.home;
    // round Dan on foot, and his car parked in their way
    for (const ob of dyn) {
      if (Math.abs(ax - ob.x) > ob.r + 0.5 || Math.abs(az - ob.z) > ob.r + 0.5 || Math.hypot(ax - ob.x, az - ob.z) > ob.r + 0.45) continue;
      const lc = (ob.x - S.ox) * S.nx + (ob.z - S.oz) * S.nz;
      p.oT = Math.min(4.6, Math.max(0.5, p.o >= lc ? lc + ob.r + 0.4 : lc - ob.r - 0.4));
      p.clearT = 1;
    }
    if (Math.abs(p.oT - p.o) > 0.01) p.o += Math.sign(p.oT - p.o) * Math.min(Math.abs(p.oT - p.o), dt * (p.state === 'flee' ? 2.5 : 1.1));
    // at a corner: over the street or round it
    if (p.dir > 0 ? p.a >= aEnd(S, p.o) : p.a <= aStart(S, p.o)) {
      p.a = p.dir > 0 ? aEnd(S, p.o) : aStart(S, p.o);
      atCorner(p);
      if (p.state === 'wait') return;
    }
    laneXZ(p);
    // a hold zone ahead: back the way they came
    if (holds.length && held(p.x + Math.sin(p.yaw) * 2, p.z + Math.cos(p.yaw) * 2, 0.3)) { p.dir = -p.dir; laneXZ(p); }
    if (p.state === 'walk' && Math.random() < dt * 0.006) { p.state = 'idle'; p.t = rand(3, 14); }
  }

  function draw(p, dt) {
    const x = p.x, z = p.z;
    if (p.body) {
      p.vis = !camOK || seen(x, p.body.pos.y - 0.9, z, 1.8);
      if (p.vis) { p.body.pose(); drawn.add(p.rig, Math.hypot(x - focus.x, z - focus.z)); }
      return;
    }
    p.vis = !camOK || seen(x, 0.2, z);
    p.rig.update(dt, x, z, p.yaw, ground, p, 0, p.vis);
    if (p.vis) drawn.add(p.rig, Math.hypot(x - focus.x, z - focus.z));
  }

  // ------------------------------------------------------------------ the city's own walkers, taken over when knocked down
  function take(tp) {
    if (tp.away || taken.length >= EXTRA) return null;
    const p = { city: tp, rig: tp.rig, walk: Math.min(1.7, tp._run ? tp._run.speed : tp.speed || 1.3), placed: true, state: 'walk', b: null, k: 0, a: 0,
      o: 3, home: 3, oT: 3, dir: 1, v: 0, t: 0, x: tp.x, z: tp.z, yaw: tp.rig.yaw, vis: true };
    tp.node = null; tp.waiting = false;
    tp.away = () => !p.release;
    taken.push(p);
    return p;
  }

  return {
    people, taken, drawn, knock, scare, aside, scream, take, backOnLane,
    update,
    hold(rects) { holds = (rects || []).slice(); },
    // (off: none of the crowd's own drawn or moved, those taken over from the city still are; on again, placed afresh)
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; if (!enabled) for (const p of people) { if (p.state === 'wait' || p.state === 'cross') leaveCorner(p); p.placed = false; p.fresh = true; p.body = null; p.state = 'walk'; } },
    // how many of them stand within r m of Dan (and how many of those are in view)
    near(r = 60) { focusOf(); let n = 0, v = 0; for (const p of [...people, ...taken]) if (p.placed && Math.hypot(p.x - focus.x, p.z - focus.z) < r) { n++; if (p.vis) v++; } return { n, inView: v }; },
    get focus() { return focus; },
    // the crowd on its feet near (x, z), within r (a box)
    around(x, z, r, out = []) {
      out.length = 0;
      for (const p of people) if (p.placed && !p.body && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p);
      for (const p of taken) if (!p.body && p.placed && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p);
      return out;
    },
  };
}
