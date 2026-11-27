// Mog City (jh-drive round 2): the player's car takes damage. Every hit the crash module feels (a wall, another car, a
// pole: wagmi/crash/index.js 'hit') lands on one side of the car, by where it struck its box: the front, the back, the
// left or the right. Each costs it health by how hard and by what it hit (wagmi/crash/damage-cost.js: a wall head on at
// 20 m/s 1.5%, at 40 m/s 5%, at 55 m/s 9%; a glancing one half that; a lamp mast snapped at 56 m/s 4%, a litter basket
// or a cone well under 1%; another car by its weight and where it struck, a sideswipe under half a nose-on one; one
// contact grinding on costed once, at its hardest), so a free roam driven hard comes out dented, and only a run of real
// crashes smokes it or wrecks it:
//   - a dent where it struck: the body's own vertices pushed in round the point (a crumple's shading on them), every
//     visible body mesh on the chassis, Dan's roadster or a worn sheet car alike (their geometry copied on the first
//     dent, so nothing shared is bent; put back as built on a repair)
//   - from SMOKE.at damage, smoke from under the bonnet, thicker and darker as it gets worse
//   - from LIMP.at, a limp: car.limp takes LIMP.share off its top speed and its boost (js/controllers.js updateCar),
//     never while a mission or a story step runs (nothing a step needs pace for fails on it); nor, then, does the car
//     get past smoking (its health kept at damage-cost.js BUSY_FLOOR): the readout never says WRECKED of a car that drives on as new
//   - a readout under the speed (the HUD's cluster): the car's condition, the worse of its health and how bent its body is
//     (each dent wears it by its blow's energy: damage-cost.js wearOf, readoutOf), a bar and a word (scratched, dented,
//     battered by the body; smoking, wrecked by the health), shown once it has taken a knock
// Repaired as new when the car is put somewhere far in one frame (over 30 m: a mission's start, a checkpoint, a teleport;
// the reset onto the road beside it keeps its dents) or by repair().
// API (WAGMI.crash.damage): { health 0..1, zones { front, rear, left, right } 0..1, dents, taken (all its knocks cost, never reset), hit(sp, x, z), repair(),
//   update(dt), state() }
import * as THREE from 'three/webgpu';
import { createVapor } from '../pursuit/vapor.js';
import { baseCost, hitCost, createContacts, afterHit, BUSY_FLOOR, DENT, dentSpeed, dentSize, wearOf, addWear, readoutOf } from './damage-cost.js';
import { wheelKeeps, keepRoom, crumple, crease } from './dent-geom.js';
import { createDamageLook, blockedBy, LOOK } from './damage-look.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// a dent: the hardest of a hit's blows over DENT.MIN m/s costing over DENT.COST, its depth and radius by the blow's energy
// (damage-cost.js DENT, dentSpeed, dentSize: a scrape a ding, a big hit a crumple read from the chase camera), stacking
// to DENT.CAP, at most DENT.N kept a side
const SMOKE = { at: 0.6, rate: 9 };
const LIMP = { at: 0.85, share: 0.25 };
// (while a mission or a story step runs the health is kept at BUSY_FLOOR, damage-cost.js afterHit: over the wreck line,
// 1 - LIMP.at)

export function createDamage(W, crash) {
  const app = W.app, cm = app.controllerManager, car = W.car, scene = app.scene;
  // (wear: how bent the body is, 0..1, from its dents: the readout's condition is the worse of it and the health,
  // damage-cost.js readoutOf)
  const D = { health: 1, zones: { front: 0, rear: 0, left: 0, right: 0 }, dents: 0, hits: 0, limping: false, smoking: false, wear: 0, taken: 0 };
  let wearSides = {};
  const bent = new Map(); // mesh -> { orig geometry, pos copy } : the meshes dented, and what they were built as
  let cool = 0;
  const contacts = createContacts();
  const smoke = createVapor(scene);
  let smokeAcc = 0;
  // (a big front crash: the chase camera's brief look round at the crumpled nose, damage-look.js; js/cameras.js reads
  // cameraSystem.damageLook)
  const look = createDamageLook();
  let orbitT = 0;
  function lookCtx() {
    const cs = app.cameraSystem, b = typeof document !== 'undefined' ? document.body.classList : null, M = W.storyrun?.runner?.M;
    const step = M && M.def && M.def.steps ? M.def.steps[M.i]?.type : null;
    const blocked = blockedBy({ mode: cm.activeMode, horse: car.kind === 'horse', preset: cs ? cs.activePresetId : 'chase',
      cutscene: !!W.cutscene, directed: !!(W.directed || W.cineSkip), cine: !!(b && (b.contains('wg-cine') || b.contains('wg-vcall') || b.contains('wg-gating'))),
      paused: !!(W.paused || (b && b.contains('wg-paused'))), callLive: !!W.calls?.live, callTalking: !!W.calls?.talking,
      pursuit: !!W.pursuit?.active, step, timer: !!M?.timer?.running });
    // (the player moved the camera: a drag, a look stick, a flick; the camera's own orbit timer goes back up to 4 s)
    const ot = cs ? cs.userOrbitTimer || 0 : 0, orbit = !!(cs && (cs.isDragging || ot > orbitT + 1e-3)); orbitT = ot;
    // (the way round with the nose in sight, probed when a look begins: js/cameras.js probeLook, damage-look.js pickView)
    const probe = cs && typeof cs.probeLook === 'function' ? (yaw, pitch) => cs.probeLook(car, yaw, pitch, LOOK.PULL) : null;
    return { speed: Math.hypot(car.speed || 0, car.slipV || 0), keys: cm.keys, orbit, blocked, probe };
  }

  // the side a point (world x, z) struck, by the car's box; and the point on that side of the box
  function zoneAt(x, z) {
    const B = car.body || { hx: 1, z0: -2.3, z1: 2.4 }, h = car.heading, s = Math.sin(h), c = Math.cos(h);
    const dx = x - car.position.x, dz = z - car.position.z;
    const lz = dx * s + dz * c, lx = dx * c - dz * s; // (along its nose; to its left)
    const cz = (B.z0 + B.z1) / 2, hl = (B.z1 - B.z0) / 2;
    const u = (lz - cz) / hl, w = lx / B.hx;
    const zone = Math.abs(u) > Math.abs(w) ? (u > 0 ? 'front' : 'rear') : (w > 0 ? 'left' : 'right');
    // (on the box's face, a little in)
    let px = clamp(lx, -B.hx, B.hx), pz = clamp(lz, B.z0, B.z1);
    if (zone === 'front') pz = B.z1 - 0.08; else if (zone === 'rear') pz = B.z0 + 0.08; else px = Math.sign(w) * (B.hx - 0.06);
    return { zone, lx: px, lz: pz };
  }

  // (a ride worn over the hero car (wagmi/storyrun/ride.js wearRide: a mission's van, a car taken off the street): its rig,
  // the hero car's own body hidden under it)
  const wornRig = () => { const st = car.roadster && car.roadster.__worn; return st && st.id ? st.rigs[st.id] || null : null; };
  // the body's meshes on the chassis: not the driver, not the wheels, nothing instanced or skinned
  function bodyMeshes() {
    const skip = new Set(), rs = car.roadster, worn = wornRig();
    const add = (o) => { if (o && o.isObject3D) o.traverse((k) => skip.add(k)); };
    if (rs) { add(rs.anchor); for (const wh of rs.wheels || []) for (const v of Object.values(wh)) add(v); }
    if (worn) for (const wh of worn.wheels || []) for (const v of Object.values(wh)) add(v);
    for (const wh of car.wheels || []) { add(wh.tire); add(wh.steerPivot); }
    const out = [];
    car.chassisPivot.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || skip.has(o) || !o.geometry?.attributes?.position) return;
      if (o.geometry.attributes.position.count > 250000) return;
      out.push(o);
    });
    return out;
  }

  // (a position or normal attribute moved in place: plain floats, three to a vertex, its own buffer)
  const isPlain = (a) => !!a && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array && a.itemSize === 3 && !a.normalized;
  function floated(geo) {
    for (const k of ['position', 'normal']) {
      const a = geo.getAttribute(k); if (!a || isPlain(a)) continue;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      geo.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
    return geo;
  }
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _v = new THREE.Vector3(), _toC = new THREE.Matrix4(), _cInv = new THREE.Matrix4();
  // the wheels' keep-out drums in the chassis's frame (dent-geom.js keepRoom): the metal pushed in never reaches a tyre
  function keeps() {
    const objs = [], rs = car.roadster;
    const worn = wornRig();
    for (const wh of (worn ? worn.wheels : rs && rs.wheels) || []) objs.push(wh.W || wh.spin || Object.values(wh).find((v) => v && v.isObject3D));
    for (const wh of car.wheels || []) if (wh.tire && wh.tire.visible !== false) objs.push(wh.tire);
    _cInv.copy(car.chassisPivot.matrixWorld).invert();
    const seen = objs.filter((o) => { if (!o) return false; for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; });
    return wheelKeeps(seen, (m) => _toC.multiplyMatrices(_cInv, m.matrixWorld));
  }
  // push the body in round the struck point (car frame lx, lz, at y up its side), depth m, radius r; each vertex no further
  // in than cap m in all, however often it is hit there
  function dent(lx, lz, zone, depth, r, cap = DENT.CAP.side) {
    // (the car's meshes where the car is now: a hit comes mid-update, between the controllers' steps, before they put the
    // car's mesh on it (js/controllers.js update: e.mesh.position.copy(e.position)); a long frame's slide is metres)
    if (car.mesh && car.mesh.position && car.position) { car.mesh.position.copy(car.position); car.mesh.rotation.y = car.heading; car.mesh.updateMatrixWorld(true); }
    else car.chassisPivot.updateMatrixWorld(true);
    // (a car with dents of its own (the Tensore, wagmi/storyrun/wedge.js dent: its own body, never its wheels)
    // takes the blow there, at the same point (in the world) and the same depth and radius)
    const own = car.kind !== 'horse' && car.roadster && typeof car.roadster.dent === 'function' && !wornRig() ? car.roadster : null;
    if (own) {
      const B0 = car.body || { top: 1.3 }; car.chassisPivot.localToWorld(_p.set(lx, (B0.top || 1.3) * 0.42, lz));
      return own.dent(_p.x, _p.z, 20, { depth, r, cap }) || 0;
    }
    // (the point on the car, in the world; and the way in: toward the car's middle, level)
    const B = car.body || { hx: 1, z0: -2.3, z1: 2.4 }, top = B.top || 1.3;
    const ys = [top * 0.42, top * 0.66];
    const inx = zone === 'left' ? -1 : zone === 'right' ? 1 : 0, inz = zone === 'front' ? -1 : zone === 'rear' ? 1 : 0;
    const K = keeps(), cdir = { x: inx, y: -0.12, z: inz };
    { const L = Math.hypot(cdir.x, cdir.y, cdir.z); cdir.x /= L; cdir.y /= L; cdir.z /= L; }
    let moved = 0;
    for (const m of bodyMeshes()) {
      const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
      const sc = m.matrixWorld.getMaxScaleOnAxis() || 1, rl = r / sc, rl2 = rl * rl;
      let geo = m.geometry, rec = bent.get(m);
      const pos0 = geo.attributes.position;
      // (a quick test: is the point anywhere near this mesh's bounds)
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      let near = false;
      const pts = ys.map((y) => { car.chassisPivot.localToWorld(_p.set(lx, y, lz)); const L = _p.clone().applyMatrix4(inv); if (L.distanceTo(geo.boundingSphere.center) < geo.boundingSphere.radius + rl) near = true; return L; });
      if (!near) continue;
      // (the way in, in the mesh's own frame: toward the middle and a touch down, as a crumple sags)
      car.chassisPivot.localToWorld(_p.set(lx, ys[0], lz)); car.chassisPivot.localToWorld(_q.set(lx + cdir.x, ys[0] + cdir.y, lz + cdir.z));
      const a = _p.clone().applyMatrix4(inv), b = _q.clone().applyMatrix4(inv), dir = b.sub(a).normalize();
      // (a plain float array read as it is; a quantized or interleaved one (a town fleet's ready-made model, glTF
      // KHR_mesh_quantization) through its accessors)
      const plain = isPlain(pos0), P = pos0.array, n = pos0.count;
      const hits = [];
      for (let i = 0; i < n; i++) {
        const x = plain ? P[i * 3] : pos0.getX(i), y = plain ? P[i * 3 + 1] : pos0.getY(i), z = plain ? P[i * 3 + 2] : pos0.getZ(i);
        let best = Infinity;
        for (const c of pts) { const d2 = (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2; if (d2 < best) best = d2; }
        if (best < rl2) hits.push(i, best);
      }
      if (!hits.length) continue;
      // (first touch: its own copy of the geometry, the built one kept for the repair; how far in each vertex has gone)
      if (!rec) { rec = { orig: geo }; geo = m.geometry = floated(geo.clone()); bent.set(m, rec); }
      if (!rec.done || rec.done.length !== n) rec.done = new Float32Array(n);
      const pos = geo.attributes.position, A = pos.array, N0 = geo.attributes.normal ? geo.attributes.normal.array : null;
      // (the mesh's frame to the chassis's: the wheels' drums are there)
      _toC.multiplyMatrices(_cInv.copy(car.chassisPivot.matrixWorld).invert(), m.matrixWorld);
      const e = _toC.elements;
      const cd = { x: e[0] * dir.x + e[4] * dir.y + e[8] * dir.z, y: e[1] * dir.x + e[5] * dir.y + e[9] * dir.z, z: e[2] * dir.x + e[6] * dir.y + e[10] * dir.z };
      { const L = Math.hypot(cd.x, cd.y, cd.z) || 1; cd.x /= L; cd.y /= L; cd.z /= L; }
      // (the dent's centre in the mesh: the depth wavering over it by place (dent-geom.js crumple, in metres, so the
      // seams (vertices shared by two faces) bend alike), its normals bowed round it and broken up finer, so it reads as
      // crumpled metal, not a smooth spoon, and never folds a face over)
      const c0 = pts[0];
      let touched = false;
      for (let j = 0; j < hits.length; j += 2) {
        const i = hits[j], f = 1 - hits[j + 1] / rl2, w = f * f;
        const x = A[i * 3], y = A[i * 3 + 1], z = A[i * 3 + 2];
        const xs = x * sc, ys2 = y * sc, zs = z * sc;
        const want = depth * w * (1 + 0.05 * crumple(xs, ys2, zs));
        const room = cap - rec.done[i]; if (room <= 0) continue;
        const cp = { x: e[0] * x + e[4] * y + e[8] * z + e[12], y: e[1] * x + e[5] * y + e[9] * z + e[13], z: e[2] * x + e[6] * y + e[10] * z + e[14] };
        const d = Math.min(room, want, keepRoom(cp, K));
        if (!(d > 1e-5)) continue;
        rec.done[i] += d;
        const dd = d / sc;
        A[i * 3] += dir.x * dd; A[i * 3 + 1] += dir.y * dd; A[i * 3 + 2] += dir.z * dd;
        if (N0) {
          const rx = (x - c0.x) / rl, ry = (y - c0.y) / rl, rz = (z - c0.z) / rl;
          const k = w * Math.min(1.4, 0.6 + 3 * depth), cr = crease(xs, ys2, zs) * w * Math.min(0.45, 2 * depth);
          const nx = N0[i * 3] - rx * k + cr, ny = N0[i * 3 + 1] - ry * k + 0.6 * cr, nz = N0[i * 3 + 2] - rz * k - cr;
          const L = Math.hypot(nx, ny, nz) || 1; N0[i * 3] = nx / L; N0[i * 3 + 1] = ny / L; N0[i * 3 + 2] = nz / L;
        }
        touched = true; moved++;
      }
      if (touched) { pos.needsUpdate = true; if (geo.attributes.normal) geo.attributes.normal.needsUpdate = true; geo.boundingSphere = null; geo.boundingBox = null; }
    }
    return moved;
  }

  const perZone = { front: 0, rear: 0, left: 0, right: 0 }, lastDent = { zone: null, lx: 0, lz: 0 };
  // a hit at sp m/s at (x, z) costing cost (by default a solid thing's, head on: damage-cost.js baseCost)
  // (dsp: its dent speed, damage-cost.js dentSpeed: how hard the metal was met, by what; by default its speed)
  function hit(sp, x, z, cost = baseCost(sp), dsp = sp) {
    if (!(cost > 0) || car.kind === 'horse' || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const { zone, lx, lz } = zoneAt(x, z);
    D.zones[zone] = clamp(D.zones[zone] + cost * 6, 0, 1);
    // (a step running: never past smoking)
    D.health = afterHit(D.health, cost, busy());
    D.hits++;
    // (what the car has taken in all, the health its knocks cost before any floor: a story mission's DAMAGE, its
    // medals (storyrun/rules.js damageOf); a repair never undoes it)
    D.taken += cost;
    // (a dent a hit, but the same contact grinding on (the same side, the same spot, a moment later) only the first)
    const again = cool > 0 && lastDent.zone === zone && Math.hypot(lastDent.lx - lx, lastDent.lz - lz) < 0.6;
    // (a big one on the nose: the camera's look at it, damage-look.js, once the car has stopped)
    try { look.offer({ zone, dsp, lx }, lookCtx()); } catch (err) { console.warn('[damage] look', err); }
    if (dsp >= DENT.MIN && cost >= DENT.COST && !again && perZone[zone] < DENT.N) {
      cool = DENT.COOL; Object.assign(lastDent, { zone, lx, lz });
      // (its depth and radius by the blow's energy: a scrape a ding, a big hit a crumple, damage-cost.js dentSize)
      const S = dentSize(dsp);
      D.lastDent = { zone, depth: +S.depth.toFixed(3), r: +S.r.toFixed(3), dsp: +dsp.toFixed(1) };
      try {
        const moved = dent(lx, lz, zone, S.depth, S.r, zone === 'front' || zone === 'rear' ? DENT.CAP.end : DENT.CAP.side);
        if (moved) { D.dents++; perZone[zone]++; const W2 = addWear(wearSides, zone, wearOf(dsp)); wearSides = W2.sides; D.wear = W2.total; }
      } catch (err) { console.warn('[damage] dent', err); }
    }
    return cost;
  }

  function repair() {
    for (const [m, rec] of bent) { try { m.geometry.dispose(); } catch {} m.geometry = rec.orig; }
    bent.clear();
    try { if (car.roadster && typeof car.roadster.repair === 'function') car.roadster.repair(); } catch (err) { console.warn('[damage] repair', err); }
    Object.assign(D, { health: 1, dents: 0, hits: 0, limping: false, smoking: false, wear: 0 }); wearSides = {};
    for (const k of Object.keys(D.zones)) { D.zones[k] = 0; perZone[k] = 0; }
    contacts.clear();
    look.cancel('repair');
    car.limp = 0;
  }

  // (a mission or a story step on: no limp)
  const busy = () => !!(W.storyrun?.runner?.M || (W.mission && W.mission.phase && !/pass|fail|done|over|end/i.test(String(W.mission.phase))));

  /* -------------------------------------------------------------- the readout -- */
  let el = null;
  function mount() {
    if (el || typeof document === 'undefined') return el;
    // (in the speed cluster, under the speed's meter (index.html #hud-cluster); else in a corner of its own)
    const host = document.querySelector('#hud-cluster .gauge');
    if (!document.getElementById('wg-dmg-css')) {
      const st = document.createElement('style'); st.id = 'wg-dmg-css';
      st.textContent = `.wg-dmg { display: none; align-items: center; gap: 8px; margin-top: 8px; font: 700 11px/1 system-ui, sans-serif; letter-spacing: .08em; color: rgba(255,255,255,.72); pointer-events: none; }
.wg-dmg.on { display: flex; }
.wg-dmg.solo { position: fixed; right: 22px; bottom: 190px; width: 200px; z-index: 4; text-shadow: 0 1px 2px rgba(0,0,0,.7); }
.wg-dmg .w { flex: none; }
.wg-dmg .bar { flex: 1; height: 5px; border-radius: 3px; background: rgba(255,255,255,.14); overflow: hidden; }
.wg-dmg .bar i { display: block; height: 100%; width: 100%; background: #7BD88F; transition: width .25s, background .25s; }
.wg-dmg .p { flex: none; min-width: 7.5em; text-align: right; color: #fff; }
.wg-dmg.hurt .p { color: #FFC93C; } .wg-dmg.bad .p { color: #FF6B4D; }
body.wg-cine .wg-dmg, body.wg-paused .wg-dmg, body.hud-minimized .wg-dmg { display: none !important; }`;
      document.head.appendChild(st);
    }
    el = document.createElement('div'); el.className = 'wg-dmg' + (host ? '' : ' solo');
    el.innerHTML = '<span class="w">DAMAGE</span><span class="bar"><i></i></span><span class="p">100%</span>';
    (host || document.body).appendChild(el);
    return el;
  }
  let shown = '', showT = 0;
  function readout(dt) {
    const driving = cm.activeMode === 'car' && car.kind !== 'horse';
    // (shown in the car once it has taken a knock, and for a few seconds after each new one)
    showT = Math.max(0, showT - dt);
    const on = driving && (D.health < 0.995 || D.wear > 0.005) && !W.cutscene;
    if (!mount()) return;
    el.classList.toggle('on', on);
    if (!on) return;
    // (the car's condition as seen: the worse of its health and its bent body; SMOKING and WRECKED by the health alone,
    // damage-cost.js readoutOf)
    const R = readoutOf(D.health, D.wear, busy()), pc = R.pc, word = R.word, c = R.cond;
    const k = `${pc}|${word}`;
    if (k === shown) return; shown = k;
    el.querySelector('.p').textContent = `${word} ${pc}%`;
    el.classList.toggle('hurt', c <= 0.6); el.classList.toggle('bad', D.health <= 1 - LIMP.at + 0.05);
    const bar = el.querySelector('.bar i'); bar.style.width = `${pc}%`;
    bar.style.background = c > 0.6 ? '#7BD88F' : c > 0.4 ? '#FFC93C' : c > 0.15 ? '#FF8A3D' : '#FF4D4D';
  }

  // (repaired when the car is put somewhere far away in a frame: a mission's start, a checkpoint, a teleport)
  let lastX = null, lastZ = null;
  function update(dt) {
    if (!(dt > 0)) return;
    const jx = car.position.x, jz = car.position.z;
    if (lastX !== null && Math.hypot(jx - lastX, jz - lastZ) > 30 && D.health < 1) repair();
    lastX = jx; lastZ = jz;
    cool = Math.max(0, cool - dt);
    try { const L = look.update(dt, lookCtx()); if (app.cameraSystem) app.cameraSystem.damageLook = L.active ? L : null; } catch (err) { console.warn('[damage] look', err); }
    smoke.update(dt);
    const dmg = 1 - D.health;
    // the limp, only free roaming
    D.limping = dmg >= LIMP.at && !busy();
    car.limp = D.limping ? LIMP.share : 0;
    // the smoke, from under the bonnet
    D.smoking = dmg >= SMOKE.at && car.kind !== 'horse';
    if (D.smoking && car.mesh?.visible !== false) {
      const k = clamp((dmg - SMOKE.at) / (1 - SMOKE.at), 0, 1);
      smokeAcc += Math.min(dt, 0.1) * SMOKE.rate * (0.5 + k);
      const n = Math.floor(smokeAcc); smokeAcc -= n;
      const B = car.body || { z1: 2.4, top: 1.3 }, h = car.heading, s = Math.sin(h), c = Math.cos(h);
      const fz = B.z1 - 0.9, x = car.position.x + s * fz, z = car.position.z + c * fz, y = car.position.y + (B.top || 1.3) * 0.72;
      const vx = s * car.speed, vz = c * car.speed;
      for (let j = 0; j < n; j++) {
        smoke.puff(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, vx * 0.4 + (Math.random() - 0.5), 0.9 + Math.random() * 0.8, vz * 0.4 + (Math.random() - 0.5),
          { r: 0.22, grow: 3.4, life: 1.1 + Math.random() * 0.9, a: 0.28 + 0.25 * k, k: 0.55 + 0.4 * k, drag: 2.2, lift: 0.9 });
      }
    }
    readout(dt);
  }

  const api = Object.assign(D, { hit, repair, update, DENT, SMOKE, LIMP, BUSY_FLOOR, look,
    state: () => ({ health: +D.health.toFixed(3), wear: +D.wear.toFixed(3), zones: Object.fromEntries(Object.entries(D.zones).map(([k, v]) => [k, +v.toFixed(3)])), dents: D.dents, hits: D.hits, smoking: D.smoking, limping: D.limping, limp: car.limp || 0 }) });
  crash.on('hit', (e) => {
    if (cm.activeMode !== 'car' || !e) return;
    // (where it struck: the other car's or the wall's contact; a prop's place; else ahead of the nose)
    let x = e.x, z = e.z;
    if (!Number.isFinite(x) && e.b) { x = e.b.x; z = e.b.z; }
    if (!Number.isFinite(x)) { const B = car.body || { z1: 2.4 }; x = car.position.x + Math.sin(car.heading) * B.z1; z = car.position.z + Math.cos(car.heading) * B.z1; }
    // (what it costs by what it hit (a cone, a bin that flies off: a scuff; a lamp mast: a crash), the same contact's
    // grinding blows once (its key: the car, the thing, the wall))
    const cost = contacts.charge(e.kind === 'wall' ? 'wall' : (e.v || e.b || e.key || null), hitCost(e, crash.props && crash.props.KINDS, car.mass || 2), performance.now() / 1000);
    if (cost > 0) hit(e.speed, x, z, cost, dentSpeed(e, crash.props && crash.props.KINDS, car.mass || 2));
  });
  return api;
}
