// Mog City: wildlife: a herd of a library creature (horses) that grazes, drifts, lifts its heads at a man coming, and
// runs from him (on foot and running, or near; in a car or on a horse, from further) until it is well clear, then
// slows and grazes again. Grazing is the neck and head brought down by the code (the library has no grazing clip:
// profiles.js graze names the bones and how far); the rest is the creature's own idle, walk and run, its stride matched
// to its pace (in flight, faster than a running man, its run is sped up to 3.6x: the horse's library run is a trot,
// so a full flight slides a little until a gallop is given to it, wagmi/horse). Every animal is its kind's shared skin
// and clips; far from the view its clips are stepped less often.
//   createHerd(c, kit, P, { at, count, radius, height }) -> { animals, update(dt), dispose(), center }
import * as THREE from 'three/webgpu';
import { clamp, damp, angWrap, hdist, rnd } from '../combat/util.js';
import { cue, stepsAt, warm } from './voice.js';
import { world } from '../world/index.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _r = new THREE.Vector3();
const turnTo = (cur, goal, rate, dt) => { const d = angWrap(goal - cur); return angWrap(cur + clamp(d * (1 - Math.exp(-6 * dt)), -rate * dt, rate * dt)); };
function bend(bone, axis, angle) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
  bone.parent.getWorldQuaternion(_pq);
  _ax.copy(axis).applyQuaternion(_pq.invert());
  bone.quaternion.premultiply(_q.setFromAxisAngle(_ax, angle));
}

export function createHerd(c, kit, P, { at, count = 4, radius = 10, height } = {}) {
  const W = c.W, cm = c.cm, scene = c.scene;
  const center = new THREE.Vector3(at.x, 0, at.z);
  const animals = [];
  for (let i = 0; i < count; i++) {
    const made = kit.make({ height: height > 0 ? height * rnd(0.94, 1.05) : kit.json.height * rnd(0.92, 1.04), name: P.name });
    const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * radius * 0.6;
    const pos = made.object.position.set(at.x + Math.sin(a) * r, 0, at.z + Math.cos(a) * r);
    c.world.collide(pos, 0.7); pos.y = c.world.ground(pos.x, pos.z);
    const yaw = rnd(-Math.PI, Math.PI); made.object.rotation.y = yaw;
    scene.add(made.object);
    const bones = {}; for (const b of made.skeleton.bones) bones[b.name] = b;
    const A = made.actions, MV = made.moves;
    const gaits = [MV.idle, MV.walk, MV.run].filter((n, j, arr) => n && A[n] && arr.indexOf(n) === j);
    for (const n of Object.keys(A)) { A[n].stop(); A[n].setEffectiveWeight(0); }
    const gw = {}; for (const n of gaits) { A[n].reset(); A[n].setLoop(THREE.LoopRepeat, Infinity); A[n].play(); A[n].time = Math.random() * A[n].getClip().duration; gw[n] = n === MV.idle ? 1 : 0; }
    animals.push({ made, pos, yaw, bones, gaits, gw, state: 'graze', t: rnd(0, 6), next: rnd(4, 10), spd: 0, want: 0, goal: null, graze: Math.random() < 0.7 ? 1 : 0, look: 0, flee: null, acc: 0, n: 0, feet: footsOf(made), k: made.scale });
  }
  function footsOf(made) {
    const out = [];
    for (const nm of ['fpaw_L', 'fpaw_R', 'hpaw_L', 'hpaw_R']) { const b = made.skeleton.bones.find((x) => x.name === nm); if (b) out.push({ bone: b, floor: Infinity, up: false }); }
    return out;
  }
  // the threat: Dan on foot (running, or close), the car he drives (or the horse he rides: the same entity), from where
  function threat() {
    const P0 = W.person, car = W.car;
    if (cm.activeMode === 'car' && car) { const sp = Math.abs(car.speed || 0); return { at: car.position, reach: sp > 2 ? 34 : 14, run: sp > 2 ? 26 : 9, sp }; }
    const sp = Math.max(Math.abs(P0.speed || 0), c.me?.vel?.length?.() || 0);
    return { at: P0.position, reach: sp > 3.2 ? 22 : 11, run: sp > 3.2 ? 16 : 6.5, sp };
  }
  let frame = 0;
  // its voice (P.voice: call, near, alarm): now and then one of them calls across the herd (every 14-35 s, heard far),
  // or snorts when he is close; one cry as they bolt. voiced: how many, for tests
  let callT = rnd(4, 12), fled = false;
  warm(W, P);
  const voiced = { call: 0, near: 0, alarm: 0 };
  function speak(dt, T) {
    if (animals.every((h) => h.state !== 'flee')) fled = false;
    callT -= dt; if (callT > 0 || !P.voice) return;
    callT = rnd(14, 35);
    const calm = animals.filter((h) => h.state !== 'flee'); if (!calm.length) return;
    const h = calm[Math.floor(Math.random() * calm.length)], d = hdist(h.pos, T.at);
    const q = d < 18 && P.voice.near ? 'near' : 'call';
    if (q === 'call' && d > 220) return;
    cue(W, P.voice[q], [h.pos.x, h.pos.y + 1.7 * h.k, h.pos.z], { rate: rnd(0.93, 1.07) }); voiced[q]++;
  }
  function update(dt) {
    if (dt <= 0) return;
    frame++;
    const T = threat(), cam = c.camera.position;
    speak(dt, T);
    // (the herd's middle: where they are, to keep together)
    center.set(0, 0, 0); for (const h of animals) { center.x += h.pos.x / animals.length; center.z += h.pos.z / animals.length; }
    for (let i = 0; i < animals.length; i++) {
      const h = animals[i], k = h.k;
      h.t += dt;
      const dT = hdist(h.pos, T.at);
      // ---- what it does
      if (h.state !== 'flee' && dT < T.run) {
        h.state = 'flee'; h.t = 0; h.flee = { from: T.at.clone() };
        if (i === 0) cue(W, stepsAt(P, h.pos.x, h.pos.z), [h.pos.x, h.pos.y, h.pos.z], { vol: 1.2 });
        // (the first to bolt cries out, once a flight)
        if (!fled && P.voice?.alarm) { fled = true; cue(W, P.voice.alarm, [h.pos.x, h.pos.y + 1.7 * k, h.pos.z], { rate: rnd(0.95, 1.08), at: rnd(0.05, 0.3) }); voiced.alarm++; }
      }
      else if ((h.state === 'graze' || h.state === 'wander') && dT < T.reach) { h.state = 'alert'; h.t = 0; }
      switch (h.state) {
        case 'graze': {
          h.want = 0; h.graze = damp(h.graze, h.look > 0 ? 0 : 1, 1.6, dt); h.look -= dt;
          if (h.look <= 0 && Math.random() < dt * 0.06) h.look = rnd(1.5, 3); // (a look up now and then)
          if (h.t > h.next) { h.state = 'wander'; h.t = 0; const a = rnd(-Math.PI, Math.PI), r = rnd(2, 5) * k; h.goal = new THREE.Vector3(h.pos.x + Math.sin(a) * r, 0, h.pos.z + Math.cos(a) * r); if (hdist(h.goal, center) > radius) h.goal.lerp(center, 0.6); }
          break;
        }
        case 'wander': {
          h.graze = damp(h.graze, 0.25, 2, dt);
          const d = h.goal ? hdist(h.pos, h.goal) : 0;
          h.want = d > 0.4 ? 1.0 * k : 0;
          if (h.goal && d > 0.4) h.yaw = turnTo(h.yaw, Math.atan2(h.goal.x - h.pos.x, h.goal.z - h.pos.z), 1.6, dt);
          if (d <= 0.4 || h.t > 9) { h.state = 'graze'; h.t = 0; h.next = rnd(5, 12); }
          break;
        }
        case 'alert': { // heads up, turned to him; off if he keeps coming, back to grazing if not
          h.want = 0; h.graze = damp(h.graze, 0, 5, dt);
          h.yaw = turnTo(h.yaw, Math.atan2(T.at.x - h.pos.x, T.at.z - h.pos.z), 2.2, dt);
          if (dT > T.reach * 1.25 && h.t > 2.5) { h.state = 'graze'; h.t = 0; h.next = rnd(3, 8); }
          break;
        }
        case 'flee': { // away from him, together, round the water and the walls, until well clear
          h.graze = damp(h.graze, 0, 8, dt);
          const ax = h.pos.x - T.at.x, az = h.pos.z - T.at.z, L = Math.hypot(ax, az) || 1;
          let dx = ax / L + (center.x - h.pos.x) * 0.02 + Math.sin(i * 1.7) * 0.25, dz = az / L + (center.z - h.pos.z) * 0.02 + Math.cos(i * 1.7) * 0.25;
          // (the park's water ahead: round it)
          const look = 6 * k;
          if (world.inWater(h.pos.x + Math.sin(h.yaw) * look, h.pos.z + Math.cos(h.yaw) * look)) { const s = (i % 2 ? 1 : -1); const nx = dx * Math.cos(s * 1.4) - dz * Math.sin(s * 1.4), nz = dx * Math.sin(s * 1.4) + dz * Math.cos(s * 1.4); dx = nx; dz = nz; }
          h.yaw = turnTo(h.yaw, Math.atan2(dx, dz), 3.2, dt);
          h.want = (P.speed || 5) * k * clamp(1.2 - h.t * 0.02, 0.75, 1);
          if (dT > Math.max(40, T.reach * 1.6) && h.t > 3) { h.state = 'wander'; h.t = 0; h.goal = h.pos.clone().addScaledVector(_v.set(Math.sin(h.yaw), 0, Math.cos(h.yaw)), 5 * k); }
          break;
        }
      }
      // ---- moving: along its heading (a big body turns to walk), kept off the others and out of the walls
      h.spd = damp(h.spd, h.want, h.want > h.spd ? 2.2 : 3.5, dt);
      if (h.spd > 0.02) {
        const step = h.spd * dt, x = h.pos.x + Math.sin(h.yaw) * step, z = h.pos.z + Math.cos(h.yaw) * step;
        if (!world.inWater(x, z)) { h.pos.x = x; h.pos.z = z; }
        else h.yaw += (i % 2 ? 1 : -1) * 2 * dt;
      }
      for (let j = 0; j < animals.length; j++) {
        if (j === i) continue; const o = animals[j], dx = h.pos.x - o.pos.x, dz = h.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = (P.spacing || 1.6) * k;
        if (d < m && d > 1e-4) { h.pos.x += dx / d * (m - d) * 0.5; h.pos.z += dz / d * (m - d) * 0.5; }
      }
      c.world.collide(h.pos, 0.7 * k);
      h.pos.y = damp(h.pos.y, c.world.ground(h.pos.x, h.pos.z), 14, dt);
      h.made.object.rotation.y = h.yaw;
      // ---- its clips (stepped less often far from the view)
      const far = h.pos.distanceTo(cam), every = far > 140 ? 6 : far > 60 ? 3 : 1;
      h.acc += dt;
      if (++h.n % every === 0 || h.state === 'flee') { animate(h, h.acc); h.acc = 0; }
    }
  }
  function animate(h, dt) {
    const M = h.made, A = M.actions, MV = M.moves, SP = M.speeds, k = h.k, v = h.spd;
    const ws = SP.walk || 1.2 * k, rs = SP.run || 0;
    let g = MV.idle; if (v > 0.2 * k && MV.walk) g = MV.run && rs && v > (ws + rs) / 2 ? MV.run : MV.walk;
    for (const n of h.gaits) {
      h.gw[n] += ((n === g ? 1 : 0) - h.gw[n]) * (1 - Math.exp(-7 * dt));
      A[n].setEffectiveWeight(h.gw[n]);
      // (in flight its run is sped up as far as 3.6x: the library's run is a trot, and legs that blur read as speed where
      // feet sliding over the grass would not)
      A[n].timeScale = n === MV.walk ? clamp(v / ws, 0.5, 2.2) : n === MV.run ? clamp(v / rs, 0.6, 3.6) : 1;
    }
    M.mixer.update(dt);
    M.object.updateMatrixWorld(true);
    // grazing: its neck and head down to the grass (each bone of the profile's graze, eased in and out)
    if (h.graze > 0.01 && P.graze) {
      const right = _r.set(Math.cos(h.yaw), 0, -Math.sin(h.yaw));
      const nod = 1 + 0.05 * Math.sin(performance.now() / 700 + h.k * 9); // (cropping the grass)
      for (const [name, ang] of P.graze) bend(h.bones[name], right, ang * h.graze * nod);
      M.object.updateMatrixWorld(true);
    }
    // hooves on the ground, near the view only
    const cam = c.camera.position;
    if (h.spd > 0.4 && h.pos.distanceTo(cam) < 40) for (const f of h.feet) {
      f.bone.getWorldPosition(_v); const y = _v.y - h.pos.y;
      f.floor = Math.min(f.floor + 0.04 * dt, y); const above = y - f.floor;
      if (above > 0.1 * k) f.up = true; else if (f.up && above < 0.035 * k) { f.up = false; cue(W, stepsAt(P, _v.x, _v.z), [_v.x, _v.y, _v.z], { vol: h.state === 'flee' ? 0.9 : 0.5, rate: rnd(0.92, 1.08) }); }
    }
  }
  function dispose() { for (const h of animals) { scene.remove(h.made.object); h.made.dispose(); } animals.length = 0; }
  return { animals, update, dispose, center, voiced };
}
