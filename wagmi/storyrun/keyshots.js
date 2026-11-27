// Mog City story runner: the key art's staged compositions beside the stand (index.js keyArt, ?keyart=1). Which one a
// world's key art is shot as is asked for on the address, &keyshot=<name> (GameMog's public/storykit/keyart.js adds it
// for the worlds it names); without it the key art is the stand by the car as it always was (index.js standShot).
//   hood      the hero sat on the hood of his stopped car, leaning back on his hands, a heel up on the bumper, the car
//             from a low three-quarter front, the lens looking up at him; the sun going down the street behind the car
//             (a red rim on its paint, a glowing sky), a warm key on his face (the owner, 18 Nov: Oaktown)
//   rideoff   the hero on his horse (a world with a horse alongside its car: W.rides), riding off into the sunset: out on
//             the open land past the world's ranch (or wherever there is room near him), turned toward the highest
//             skyline (the mountains), walking away from the low lens, the sun setting over the ridge off to his right,
//             long shadows back at the lens, the horizon low for the title (the owner, 18 Nov: Colter Land)
// Each is (W, runner) -> { D, square(), done() } | null, as standShot: null with nothing to do (the stand or the moving
// car's hero shot is then taken instead, so key art never fails). The game after the key art is not played on.
import * as THREE from 'three/webgpu';
import { createDirector } from '../mission/cine.js';

import { skyline } from './keypick.js';
export { KEY_SHOTS, keyShotOf, skyline } from './keypick.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the hood: where he sits (his hips `back` m behind the hood's front edge, `side` m toward the lens), turned `turn` to the
// lens, leaning back `lean` rad (his head up again by `headUp` of it) on his hands (`handBack` m behind his hips,
// `handOut` m out), the heel on the lens's side up on the bumper (`heelX` m across); the lens low (`up`), `dist` m from the
// car's nose at `ang` off its line toward his side, looking up at him (`lookUp` over his hips, `lookFwd` of the way to the
// nose); the sun `sunUp` over the horizon `sunView` round from where the lens looks (behind the car, down the street: a
// rim on the car and a glowing sky) or, with no sunView, `sunAng` off the car's heading; the warm key `lamp` strong,
// `lampUp` over his hips, `lampAng` round from the lens toward his side. `time` another hour's light than golden.
export const HOOD = { back: 0.3, side: 0.22, lean: 0.7, headUp: 0.7, turn: 0.45, handBack: 0.32, handOut: 0.27, heelX: 0.38, ang: 0.5, dist: 3.6, up: 0.3, lookUp: 0.85, lookFwd: 0.3, fov: 44, sqFov: 52, sunView: -0.45, sunAng: 2.5, sunUp: 0.05, lamp: 70, lampUp: 1.5, lampAng: 0.5 };
// the ride off: the horse walking `walk` s before the frame; the lens `dist` m behind the horse, `off` m to the side,
// `up` m high, looking `ahead` m past the rider at `lookUp`; the sun behind him as the lens sees him (turned `sunYaw` more),
// `sunUp` over the skyline there (off to his right: he and his horse lit, not lost in its glare); a warm `fill` from
// behind the lens; his way the open one turned up to `spread` rad toward the highest skyline (rideSite)
export const RIDE = { walk: 3.2, dist: 8.5, off: 1.6, up: 0.6, ahead: 30, lookUp: 5.2, fov: 34, sqFov: 50, sunUp: 0.025, sunYaw: -0.22, fill: 3, run: 40, spread: 1.2 };

/* ------------------------------------------------------------------------------------------ the key's own light -- */
// A preset of the city's own lighting (cities/sf/js/lighting.js LightingSystem.PRESETS, as SF 2040's apocalypse adds its
// own) for the shot: golden hour's, the sun put `up` over the horizon toward world direction `dir` ({ x, z }), warmer and
// lower; and the mission's pinned hour held off it while the shot is up (runner.js holdPin)
function keyLight(W, runner, dir, { up = 0.06, base = 'golden', ...more } = {}) {
  const app = W.app, ls = app.lightingSystem, P = ls?.constructor?.PRESETS;
  if (!P || !P[base] || !app.selectTime) return () => {};
  const id = 'keyart-sun', was = ls.activePresetId, M = runner.M, pin0 = M ? M.pin : undefined;
  const h = Math.hypot(dir.x, dir.z) || 1, c = Math.sqrt(Math.max(0, 1 - up * up));
  P[id] = { ...P[base], id, name: 'Key art', sunDir: new THREE.Vector3((dir.x / h) * c, up, (dir.z / h) * c).normalize(), openSky: 1, ...more };
  const G = W.world?.look?.GRADE_LOOKS; if (G && G[base]) G[id] = { ...G[base], ...(more.grade || {}) };
  if (M) M.pin = id;
  app.selectTime(id);
  return () => { try { if (M && M.pin === id) M.pin = pin0; app.selectTime(was || base); } catch {} };
}
// golden hour, the sun on the horizon: a deep amber sun, a warm sky's foot, a cool sky overhead, haze toward the sun
const SUNSET = { sunColor: 0xff8a44, sunIntensity: 4.6, hemiSky: 0x6f86c0, hemiGround: 0xa86a48, hemiIntensity: 1.0, skyTop: 0x253e7a, skyHorizon: 0xffa65e,
  fogColor: 0xe8a470, fogDensity: 0.00034, turbidity: 6, rayleigh: 3.8, mieCoefficient: 0.005, mieDirectionalG: 0.975, cloudCoverage: 0.3, cloudDensity: 0.34,
  skyExposure: 0.12, skyTint: 0xd8c4ff, nightFactor: 0.0, interiorGlow: 0.9, envIntensity: 0.5,
  grade: { exposure: 1.08, contrast: 1.14, saturation: 1.12, balance: [1.04, 0.99, 0.97], bloom: 0.2, threshold: 1.3 } };

// the mission's marker (wagmi/mission/marker.js: its corona and ring, which the runner shows again each frame) kept off
// the shot: hide() each frame, off() at the end (shown again as they were)
function hideMarks(app) {
  const list = []; app.scene.traverse((m) => { if (m.name === 'wagmi-marker') list.push([m, m.visible]); });
  return { hide() { for (const [m] of list) m.visible = false; }, off() { for (const [m, v] of list) m.visible = v; } };
}

/* ------------------------------------------------------------------------------------------------ the bones -- */
function rigOf(q) {
  const B = q.bones, _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _r = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qw = new THREE.Quaternion();
  function turnWorld(b, r) { b.getWorldQuaternion(_qw); _q2.copy(r).multiply(_qw); b.parent.getWorldQuaternion(_qw); b.quaternion.copy(_qw.invert().multiply(_q2)); b.updateMatrixWorld(true); }
  // two-bone reach (roadster.js createDriver's): n3 to the world point `to`, the middle joint toward `pole`
  function reach(n1, n2, n3, to, pole) {
    const b1 = B[n1], b2 = B[n2], b3 = B[n3]; if (!b1 || !b2 || !b3) return false;
    b1.getWorldPosition(_a); b2.getWorldPosition(_b); b3.getWorldPosition(_c);
    const la = _a.distanceTo(_b), lb = _b.distanceTo(_c), d = Math.min(la + lb - 1e-3, Math.max(1e-3, to.distanceTo(_a)));
    const cur = _p.subVectors(_a, _b).normalize().angleTo(_n.subVectors(_c, _b).normalize());
    const want = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
    _n.crossVectors(_p.subVectors(_a, _b), _n.subVectors(_c, _b)); if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0); _n.normalize();
    turnWorld(b2, _q.setFromAxisAngle(_n, want - cur));
    b3.getWorldPosition(_c);
    turnWorld(b1, _q.setFromUnitVectors(_p.subVectors(_c, _a).normalize(), _n.subVectors(to, _a).normalize()));
    b2.getWorldPosition(_b);
    const ax = _p.subVectors(to, _a).normalize(), e = _n.subVectors(_b, _a); e.addScaledVector(ax, -e.dot(ax));
    const pl = _r.copy(pole); pl.addScaledVector(ax, -pl.dot(ax));
    if (e.lengthSq() > 1e-6 && pl.lengthSq() > 1e-6) { let ang = e.angleTo(pl); if (_c.crossVectors(e, pl).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
    return true;
  }
  // a bone turned about a world axis (its children with it)
  function bend(n, axis, ang) { const b = B[n]; if (!b || !ang) return; turnWorld(b, _q.setFromAxisAngle(axis, ang)); }
  return { B, reach, bend, turnWorld };
}

// the car's top over a point of its own frame (lx across, +x its left; lz along, +z its nose): the highest of its own
// surfaces there (its hood, its bumper), from a ray straight down; null where the ray finds none of it
function topOf(car, lx, lz) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading), x = car.position.x + lx * c + lz * s, z = car.position.z - lx * s + lz * c;
  const ray = new THREE.Raycaster(new THREE.Vector3(x, car.position.y + 4, z), new THREE.Vector3(0, -1, 0), 0, 6);
  car.mesh.updateMatrixWorld(true);
  const hits = ray.intersectObject(car.mesh, true).filter((h) => h.object.visible !== false && h.object.isMesh && !h.object.isSkinnedMesh);
  return hits.length ? hits[0].point.y : null;
}

// how far forward the car's face reaches (its own lz) at height y over its ground, at lx across: a ray from ahead of it
// straight back along it; null where it finds none of it
function frontOf(car, lx, y) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading), lz = (car.body?.z1 ?? 2.4) + 2;
  const o = new THREE.Vector3(car.position.x + lx * c + lz * s, car.position.y + y, car.position.z - lx * s + lz * c);
  const ray = new THREE.Raycaster(o, new THREE.Vector3(-s, 0, -c), 0, 4);
  const hits = ray.intersectObject(car.mesh, true).filter((h) => h.object.visible !== false && h.object.isMesh && !h.object.isSkinnedMesh);
  return hits.length ? lz - hits[0].distance : null;
}
// the bumper's top: the highest point of the car's face that stands as far forward as its face ever does (within 5 cm),
// between 0.25 and 0.72 m up and 0.2 m under the hood's edge: { y, lz } (over its ground, its own lz)
function bumperOf(car, lx, under = 0.82) {
  const rows = [];
  for (let y = 0.2; y <= Math.min(0.72, under); y += 0.02) { const f = frontOf(car, lx, y); if (f != null) rows.push([y, f]); }
  if (!rows.length) return null;
  const far = Math.max(...rows.map((r) => r[1]));
  let top = null; for (const [y, f] of rows) if (f >= far - 0.05 && y >= 0.25) top = { y, lz: f };
  return top;
}

/* ------------------------------------------------------------------------------------------------ the hood -- */
/** The hero sat on his car's hood, leaning back on his hands, a heel on the bumper; the director on the two of them. */
export async function hoodShot(W, runner, o = {}) {
  const S = { ...HOOD, ...o };
  const app = W.app, cs = app.cameraSystem, cm = app.controllerManager, car = W.car, P = W.person, q = W.dan;
  if (!car || !P?.mesh || !q?.body || !q.act || cm.activeMode !== 'car' || W.cutscene || W.directed || car.kind === 'horse' || car.wet) return null;
  const B = car.body || { hx: 1.0, z0: -2.3, z1: 2.4 };
  const toW = (lx, lz) => { const c = Math.cos(car.heading), s = Math.sin(car.heading); return { x: car.position.x + lx * c + lz * s, z: car.position.z - lx * s + lz * c }; };
  const V = (p, y) => new THREE.Vector3(p.x, y, p.z);
  // stopped where it is (standShot's way)
  W.storyrun?.autopilot?.stop?.();
  for (const k of ['forward', 'backward', 'left', 'right', 'boost']) try { cm.setTouchInput(k, 0); } catch {}
  const still = () => Object.assign(car, { speed: 0, vx: 0, vz: 0, angularVel: 0, steerAngle: 0, steerK: 0, halt: 0 });
  for (let t0 = performance.now(); performance.now() - t0 < 900;) { still(); await raf(); }
  if (cm.activeMode !== 'car' || W.cutscene || W.directed) return null;
  // the hood, read off the car: its front edge (the furthest forward its top is still the hood's, over the bumper's), its
  // height under his seat, the bumper's top under his heel
  const y0 = car.position.y;
  let edge = null, hoodY = null;
  for (let lz = B.z1 + 0.3; lz > B.z1 - 1.6; lz -= 0.04) {
    const y = topOf(car, 0.3, lz); if (y == null) continue;
    if (y - y0 > 0.62) { edge = lz; hoodY = y; break; }
  }
  if (edge == null) return null;
  const sideOf = (s) => {
    const seat = { lx: s * S.side, lz: edge - S.back };
    const top = topOf(car, seat.lx, seat.lz), bump = bumperOf(car, s * S.heelX, hoodY - y0 - 0.2);
    return { seat, top: top ?? hoodY, bump: bump ? { y: y0 + bump.y, lz: bump.lz } : { y: y0 + 0.5, lz: edge } };
  };
  const shotOf = (s) => {
    const nose = toW(s * 0.35, edge), a = car.heading + s * S.ang;
    return { nose, cam: { x: nose.x + Math.sin(a) * S.dist, z: nose.z + Math.cos(a) * S.dist } };
  };
  // (his side: the lens's open and clear of the street's things, the kerb's side first (the lit shopfronts behind the
  // car, not the far side of the road); side0 asks for one)
  let side = 0, pick = null;
  for (const s of S.side0 ? [S.side0] : [-1, 1]) {
    const c = shotOf(s), eye = V(c.cam, y0 + S.up);
    if (cs.segClear && (cs.segClear(V(c.nose, y0 + 1.2), eye, car) < 0.97 || cs.segClear(V(toW(0, 0), y0 + 1.0), eye, car) < 0.97)) continue;
    side = s; pick = c; break;
  }
  if (!side) return null;
  const H = sideOf(side);
  // the traffic and the pavement's people kept off the car and the lens
  const xs = [pick.cam.x, car.position.x], zs = [pick.cam.z, car.position.z], mg = 12;
  const rect = { minX: Math.min(...xs) - mg, maxX: Math.max(...xs) + mg, minZ: Math.min(...zs) - mg, maxZ: Math.max(...zs) + mg };
  try { app.trafficSystem?.hold?.([rect]); } catch {}
  try { W.street?.crowd?.hold?.([rect]); } catch {}
  // him out of the car, on foot beside it (the person: his body itself is posed on the hood, in a holder of its own)
  still();
  const out = toW(side * (B.hx + 0.9), B.z1 * 0.5);
  P.position.set(out.x, cm.getGroundHeight(out.x, out.z, 'person'), out.z);
  P.speed = 0; P.verticalVel = 0; P.inVehicle = false; P.mesh.visible = true;
  app.selectMode('person');
  for (let i = 0; i < 6; i++) { still(); await raf(); }
  if (cm.activeMode !== 'person' || W.cutscene) { done0(); return null; }
  function done0() { try { app.trafficSystem?.hold?.([]); } catch {} try { W.street?.crowd?.hold?.([]); } catch {} }
  // his body out of the person's mesh into a holder of its own on the hood (its scale and offset kept)
  const body = q.body, parent0 = body.parent, pos0 = body.position.clone(), quat0 = body.quaternion.clone(), sc0 = body.scale.clone();
  const holder = new THREE.Group(); holder.name = 'keyart-hood';
  P.mesh.updateMatrixWorld(true);
  const meshScale = new THREE.Vector3(); P.mesh.getWorldScale(meshScale);
  holder.scale.copy(meshScale);
  app.scene.add(holder); holder.add(body);
  body.position.set(0, 0, 0); body.quaternion.identity();
  const R = rigOf(q), mixer = q.mixer, sit = q.act('sit');
  if (!sit) { putBack(); done0(); return null; }
  function putBack() { try { parent0?.add(body); body.position.copy(pos0); body.quaternion.copy(quat0); body.scale.copy(sc0); app.scene.remove(holder); } catch {} }
  // the sit, alone, on its first frame, read once (the mixer is then left alone: three's mixer writes a bone only when its
  // own value changes, so the bends below would stay and add up frame by frame): every bone put back to it each frame
  for (const a of mixer._actions) a.setEffectiveWeight(0);
  const idle = q.act('idle'); if (idle) { idle.enabled = true; idle.play(); idle.setEffectiveWeight(1); }
  mixer.update(0);
  if (idle) idle.setEffectiveWeight(0);
  sit.enabled = true; sit.play(); sit.setEffectiveWeight(1); sit.timeScale = 0; sit.time = S.sitAt ?? 0;
  mixer.update(0);
  const clean = Object.values(R.B).map((b) => [b, b.quaternion.clone(), b.position.clone()]);
  const pose0 = () => { for (const [b, qq, pp] of clean) { b.quaternion.copy(qq); b.position.copy(pp); } body.position.set(0, 0, 0); };
  // his frame: facing along the car (+z), turned toward the lens; the holder at the seat on the hood
  const seatW = toW(H.seat.lx, H.seat.lz), yawH = car.heading + side * S.turn;
  // the hips' rest over the holder's origin in the sit, and his seat's flesh below them (measured once)
  pose0(); holder.position.set(0, 0, 0); holder.rotation.set(0, 0, 0); holder.updateMatrixWorld(true);
  const root = R.B.root || R.B.pelvis || Object.values(R.B)[0];
  const hip0 = root.getWorldPosition(new THREE.Vector3());
  let flesh = 0.1;
  { const v = new THREE.Vector3(); let lo = Infinity;
    body.traverse((m) => { const p = m.isMesh && m.visible && m.geometry?.attributes?.position; if (!p) return;
      for (let i = 0; i < p.count; i += 3) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (Math.hypot(v.x - hip0.x, v.z - hip0.z) < 0.12 && v.y < lo) lo = v.y; } });
    if (Number.isFinite(lo)) flesh = clamp(hip0.y - lo, 0.04, 0.2); }
  const UP = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
  const local = (lx, y, lz) => { const p = toW(lx, lz); return new THREE.Vector3(p.x, y, p.z); };
  const L = side;   // (+1: he sits on the car's left; his outer hand and leg are the lens's side)
  const pose = () => {
    pose0();
    // the hips on the hood (the holder's origin under them), his body yawed toward the lens and leaning back
    holder.position.set(seatW.x - hip0.x * meshScale.x, H.top + flesh - hip0.y * meshScale.y, seatW.z - hip0.z * meshScale.z);
    holder.rotation.set(0, yawH, 0);
    holder.updateMatrixWorld(true);
    // (lean back from the hips: the spine's first joint turned back about his own left-right axis)
    const across = new THREE.Vector3(Math.cos(yawH), 0, -Math.sin(yawH));
    R.bend('spine05', across, -S.lean * 0.55); R.bend('spine03', across, -S.lean * 0.45);
    R.bend('neck01', across, S.lean * S.headUp);
    body.updateMatrixWorld(true);
    // the hands flat on the hood behind him, a little out from his hips, the elbows straight-ish, pointing back and out
    for (const sd of ['L', 'R']) {
      const sg = sd === 'L' ? 1 : -1;   // (his left is +x in his frame)
      const fwd = new THREE.Vector3(Math.sin(yawH), 0, Math.cos(yawH)), lt = new THREE.Vector3(Math.cos(yawH), 0, -Math.sin(yawH));
      const base = root.getWorldPosition(_t.set(0, 0, 0)).clone();
      const to = base.addScaledVector(fwd, -S.handBack).addScaledVector(lt, sg * S.handOut);
      const lx = (to.x - car.position.x) * Math.cos(car.heading) - (to.z - car.position.z) * Math.sin(car.heading);
      const lz = (to.x - car.position.x) * Math.sin(car.heading) + (to.z - car.position.z) * Math.cos(car.heading);
      to.y = (topOf(car, lx, lz) ?? H.top) + 0.06;
      _pole.copy(fwd).multiplyScalar(-1).addScaledVector(lt, sg * 0.6).addScaledVector(UP, -0.2).normalize();
      R.reach('upperarm01_' + sd, 'lowerarm01_' + sd, 'wrist_' + sd, to, _pole);
    }
    // the lens's side heel up on the bumper (the knee up and out), the other leg hanging easy
    const sd = L > 0 ? 'L' : 'R';
    const heel = local(L * S.heelX, H.bump.y + 0.07, H.bump.lz - 0.04);
    _pole.set(Math.sin(yawH), 0.7, Math.cos(yawH)).normalize();
    R.reach('upperleg01_' + sd, 'lowerleg01_' + sd, 'foot_' + sd, heel, _pole);
    body.updateMatrixWorld(true);
  };
  const prevDirected = W.directed;
  W.directed = () => { pose(); };
  // the sun low behind the car (sunView: that far round from where the lens looks, toward his side: a rim on the car and
  // a glowing sky down the street; else sunAng off the car's heading); the warm key on his face (frame)
  const sa = S.sunView != null ? car.heading + side * S.ang + Math.PI + side * S.sunView : car.heading + Math.PI - side * (Math.PI - S.sunAng);
  const unlight = S.sun === false ? () => {} : keyLight(W, runner, { x: Math.sin(sa), z: Math.cos(sa) }, S.time && S.time !== 'golden' ? { base: S.time, up: S.sunUp, ...(S.light || {}) } : { up: S.sunUp, ...SUNSET, ...(S.light || {}) });
  const marks = hideMarks(app);
  const D = createDirector(W);
  let fov = S.fov, lookAt = null;
  const frame = () => {
    still(); marks.hide();
    const y = car.position.y, hp = root.getWorldPosition(_t);
    const look = lookAt || { x: hp.x * (1 - S.lookFwd) + pick.nose.x * S.lookFwd, z: hp.z * (1 - S.lookFwd) + pick.nose.z * S.lookFwd };
    D.camera = { pos: [pick.cam.x, y + S.up, pick.cam.z], look: [look.x, hp.y + S.lookUp, look.z], fov, roll: 0, shake: null, band: false };
    const a = car.heading + side * (S.ang + (S.lampAng || 0)), k = { x: hp.x + Math.sin(a) * 2.6, z: hp.z + Math.cos(a) * 2.6 };
    runner.lamp?.([k.x, hp.y + S.lampUp, k.z], S.lamp, 8.5);
  };
  for (let t0 = performance.now(); performance.now() - t0 < 1200;) { frame(); await raf(); }
  frame(); D.onFrame = frame; D.take();
  W.storyrun && (W.storyrun.keyShot = { side, shot: 'hood', edge: +edge.toFixed(2), hood: +(H.top - y0).toFixed(2), bump: [+(H.bump.y - y0).toFixed(2), +H.bump.lz.toFixed(2)], flesh: +flesh.toFixed(3) });
  return {
    D,
    square() { fov = S.sqFov; const hp = root.getWorldPosition(new THREE.Vector3()); lookAt = { x: (hp.x + pick.nose.x) / 2, z: (hp.z + pick.nose.z) / 2 }; frame(); },
    done() { W.directed = prevDirected; putBack(); unlight(); done0(); marks.off(); },
  };
}

/* ------------------------------------------------------------------------------------------- the ride off -- */
// a stretch of open ground from p along heading h for `len` m: each 4 m on ground near level, no building or prop on it
function openRun(W, p, h, len, wide = 3) {
  const cm = W.app.controllerManager, g0 = cm.getGroundHeight(p.x, p.z, 'person');
  if (!Number.isFinite(g0)) return false;
  const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  for (let d = 0; d <= len; d += 4) for (const w of [-wide, 0, wide]) {
    const x = p.x + fx * d + rx * w, z = p.z + fz * d + rz * w, g = cm.getGroundHeight(x, z, 'person');
    if (!Number.isFinite(g) || Math.abs(g - g0) > 0.8 + d * 0.05) return false;
    const v = new THREE.Vector3(x, g, z); cm.resolveHorizontalCollision(v, 0.9, g + 1.8); if (Math.hypot(v.x - x, v.z - z) > 0.05) return false;
  }
  return true;
}
/** Where he rides off: { x, z, y, heading } at the world's ranch (out past its pasture's back fence), or near him, his
 *  way turned (within `spread` rad of the open way) toward the highest skyline there: the sun sets over the mountains. */
export function rideSite(W, o = {}) {
  const S = { ...RIDE, ...o };
  const R = W.storyrun?.ranch?.list?.[0], C = W.car, cm = W.app.controllerManager;
  const tries = [];
  const site = R && (R.site || R.plot);
  if (site && Number.isFinite(site.x)) {
    const at = (u, v) => ({ x: site.x + site.ux * u + site.vx * v, z: site.z + site.uz * u + site.vz * v });
    const hv = Math.atan2(site.vx, site.vz);
    // (past the plot's back fence, then the pasture; then along the road's verge either way)
    for (const v of [site.d + 6, site.d + 20, site.d * 0.84]) for (const du of [0, -12, 12]) tries.push({ ...at(du, v), heading: hv });
    for (const hh of [hv + Math.PI / 2, hv - Math.PI / 2]) tries.push({ ...at(0, -2), heading: hh });
  }
  if (C) for (let k = 0; k < 8; k++) tries.push({ x: C.position.x, z: C.position.z, heading: C.heading + (k * Math.PI) / 4 });
  for (const t of tries) {
    if (!openRun(W, t, t.heading, S.run)) continue;
    const y = cm.getGroundHeight(t.x, t.z, 'person');
    // (the way with the highest skyline, open for the run; the open way itself when nothing stands higher)
    let best = { h: t.heading, a: skyline(t, t.heading, y) };
    if (S.spread > 0) for (let k = -12; k <= 12; k++) {
      const h = t.heading + (k / 12) * S.spread, a = skyline(t, h, y);
      if (a > best.a + 0.004 && openRun(W, t, h, S.run)) best = { h, a };
    }
    return { x: t.x, z: t.z, y, heading: best.h, sky: best.a, ranch: !!site };
  }
  return null;
}
/** The hero on his horse walking away into a low sun on the open land; the director behind the two of them. */
export async function rideOffShot(W, runner, o = {}) {
  const S = { ...RIDE, ...o };
  const app = W.app, cm = app.controllerManager, car = W.car, P = W.person, rides = W.rides, horse = W.horse;
  if (!car || !P?.mesh || W.cutscene || W.directed || !horse) return null;
  // stopped, then the horse the ride (the car stood where it is), him in the saddle
  W.storyrun?.autopilot?.stop?.();
  for (const k of ['forward', 'backward', 'left', 'right', 'boost']) try { cm.setTouchInput(k, 0); } catch {}
  const still = () => Object.assign(car, { speed: 0, vx: 0, vz: 0, angularVel: 0, steerAngle: 0, steerK: 0, halt: 0 });
  for (let t0 = performance.now(); performance.now() - t0 < 700;) { still(); await raf(); }
  // (the step's ride lock let go of: on foot with the car locked, the game swaps him straight back to it, game.js)
  if (rides) rides.lock = null;
  if (car.kind !== 'horse') { if (!rides?.swap?.('horse', { hard: true })) return null; }
  const site0 = o.site || rideSite(W, S);
  if (!site0) return null;
  const site = { ...site0, heading: site0.heading + (S.turn || 0) };
  const xs = [site.x - 40, site.x + 40], zs = [site.z - 40, site.z + 40];
  const rect = { minX: Math.min(...xs) - 40, maxX: Math.max(...xs) + 40, minZ: Math.min(...zs) - 40, maxZ: Math.max(...zs) + 40 };
  try { app.trafficSystem?.hold?.([rect]); } catch {}
  try { W.street?.crowd?.hold?.([rect]); } catch {}
  const off = () => { try { app.trafficSystem?.hold?.([]); } catch {} try { W.street?.crowd?.hold?.([]); } catch {} };
  runner.putPlayer({ x: site.x, z: site.z, heading: site.heading }, 'car');
  for (let i = 0; i < 80 && !(horse.mounted && horse.rider?.attached); i++) { if (i === 10 && !horse.mounted) try { horse.mount(true); } catch {} await sleep(100); }
  if (!horse.mounted) { off(); return null; }
  // the sun down his way, on the horizon
  // (the sun behind him from the lens: his way turned by the lens's offset, just over the skyline that way)
  const sunH = site.heading - Math.atan2(S.off, S.dist) * Math.cos(S.camYaw || 0) + (S.sunYaw || 0);
  const sunUp = S.sunAt != null ? S.sunAt : Math.max(0.035, skyline(site, sunH, site.y) + S.sunUp);
  const unlight = S.sun === false ? () => {} : keyLight(W, runner, { x: Math.sin(sunH), z: Math.cos(sunH) }, { up: sunUp, ...SUNSET, ...(S.light || {}) });
  // walking on, away from the lens (the walk, W held: the game's own drive, in his own saddle)
  try { horse.walk(S.gait !== 'trot'); } catch {}
  let steer = 0;
  const hold = () => {
    try { cm.setTouchInput('forward', 1); } catch {}
    // (kept on his line: the heading eased back to the site's)
    const d = Math.atan2(Math.sin(site.heading - car.heading), Math.cos(site.heading - car.heading));
    steer = clamp(d * 3, -1, 1);
    try { cm.setTouchInput(steer > 0 ? 'left' : 'right', Math.abs(steer) > 0.05 ? Math.abs(steer) : 0); cm.setTouchInput(steer > 0 ? 'right' : 'left', 0); } catch {}
  };
  const D = createDirector(W);
  let fov = S.fov;
  const _hp = new THREE.Vector3();
  const marks = hideMarks(app);
  const frame = () => {
    hold(); marks.hide();
    // (the lens `dist` m back from him along his line turned by camYaw (0 straight behind, PI/2 off his left), `off` m
    // across that, looking `ahead` m down his way)
    const h = site.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h), p = car.position;
    const ch = h + (S.camYaw || 0), cx = p.x - Math.sin(ch) * S.dist + Math.cos(ch) * S.off, cz = p.z - Math.cos(ch) * S.dist - Math.sin(ch) * S.off;
    const g = cm.getGroundHeight(cx, cz, 'person');
    const cy = (Number.isFinite(g) ? g : p.y) + S.up;
    D.camera = { pos: [cx, cy, cz], look: [p.x + fx * S.ahead, p.y + S.lookUp, p.z + fz * S.ahead], fov, roll: 0, shake: null, band: false };
    // (a soft warm fill from behind the lens, so his back and the horse's quarters keep their colour in the backlight)
    runner.lamp?.([p.x - fx * 3.5 + rx * 1.2, p.y + 2.6, p.z - fz * 3.5 + rz * 1.2], S.fill ?? 5, 8);
  };
  frame(); D.onFrame = frame; D.take();
  for (let t0 = performance.now(); performance.now() - t0 < S.walk * 1000;) await raf();
  W.storyrun && (W.storyrun.keyShot = { shot: 'rideoff', ranch: site.ranch, at: [Math.round(site.x), Math.round(site.z)], heading: +site.heading.toFixed(2), sky: +(site.sky ?? 0).toFixed(3), sun: +sunUp.toFixed(3), gait: horse.gait });
  return {
    D,
    square() { fov = S.sqFov; frame(); },
    done() { try { cm.setTouchInput('forward', 0); cm.setTouchInput('left', 0); cm.setTouchInput('right', 0); } catch {} unlight(); off(); marks.off(); },
  };
}
