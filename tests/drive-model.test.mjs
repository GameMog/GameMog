// The player's car on its tyres (js/drive-model.js, shared by js/controllers.js and cities/sf/js/controllers.js): the
// steer, the slide and its grip, the handbrake, a wall's knock. Driven here at 60 frames a second on Dan's numbers
// (wagmi/game.js car.handling) the way updateCar drives it: the steer, then the tyres over the heading's turn.
//   node --test tests/drive-model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/drive-model.js'), 'utf8'), { window: win, Math });
const DM = win.NYC.DriveModel;
const DAN = { rMin: 4.6, yawMax: 1.85, grip: 48, rampIn: [0.11, 0.17], rampOut: 0.08, vRef: 34 };
const DEG = 180 / Math.PI;

// drive it for secs: steer(t) -1..1 (+ left), hb(t), the throttle holding v0 unless the handbrake is on or hold is off
function drive({ v0, secs, steer = () => 0, hb = () => false, hold = true, handling = DAN }) {
  const c = { heading: 0, speed: v0, slipV: 0, vx: 0, vz: 0, angularVel: 0, handling, steerK: 0, axle: 1.56 };
  const dt = 1 / 60, rows = [];
  let x = 0, z = 0, prev = null;
  for (let t = 0; t < secs; t += dt) {
    const h0 = c.heading, on = hb(t);
    DM.steer(c, steer(t), dt);
    DM.tyreStep(c, DM.wrap(c.heading - h0), dt, { hb: on, throttle: hold && !on ? 1 : 0, steer: c.steerK });
    if (hold && !on) c.speed = Math.max(c.speed, Math.min(v0, c.speed + 16 * dt));
    const V = DM.velocity(c), dir = Math.atan2(V.x, V.z);
    const latA = prev === null ? 0 : Math.abs(DM.wrap(dir - prev) / dt) * Math.hypot(V.x, V.z);
    prev = dir; x += V.x * dt; z += V.z * dt;
    rows.push({ t, slip: c.slip, heading: c.heading, v: Math.hypot(V.x, V.z), latA });
  }
  return { c, rows, x, z };
}
const after = (rows, t0) => rows.filter((r) => r.t >= t0);
const maxAbs = (rows, k) => Math.max(...rows.map((r) => Math.abs(r[k])));

test('straight ahead: no slide at all, as before', () => {
  const { rows, x } = drive({ v0: 34, secs: 2 });
  assert.equal(maxAbs(rows, 'slip'), 0);
  assert.ok(Math.abs(x) < 1e-9);
});

test('under the grip: a few degrees of slip, the car tracking its nose', () => {
  const { rows } = drive({ v0: 34, secs: 3, steer: () => 0.5 });
  const slip = maxAbs(after(rows, 1.5), 'slip') * DEG;
  assert.ok(slip >= 1.5 && slip <= 6, `half lock at 76 mph: ${slip.toFixed(1)} deg`);
  const low = maxAbs(after(drive({ v0: 8, secs: 3, steer: () => 1 }).rows, 1.5), 'slip') * DEG;
  assert.ok(low < 3, `full lock at walking pace barely slides: ${low.toFixed(1)} deg`);
});

test('full lock at its top speed: past the grip it drifts wide at a held angle, never spins', () => {
  const { rows } = drive({ v0: 34, secs: 4, steer: () => 1 });
  const late = after(rows, 2);
  const slip = maxAbs(late, 'slip') * DEG, latA = late.reduce((a, r) => a + r.latA, 0) / late.length;
  assert.ok(slip >= 8 && slip <= 20, `the drift's angle: ${slip.toFixed(1)} deg`);
  assert.ok(latA < DAN.grip * 0.8 && latA > DAN.grip * 0.5, `the path's sideways pull: ${latA.toFixed(1)} m/s^2 (steered for ${DAN.grip})`);
  assert.ok(Math.min(...late.map((r) => r.v)) > 30, 'held flat out, it keeps its speed');
  // let go: it straightens up within a second
  const rel = drive({ v0: 34, secs: 3, steer: (t) => (t < 1.5 ? 1 : 0) }).rows;
  assert.ok(maxAbs(after(rel, 2.5), 'slip') * DEG < 3, 'caught within a second of letting go');
});

test('the handbrake at 20 m/s: the tail out 25-60 degrees within a third of a second, round 180 inside 2 s', () => {
  const { rows } = drive({ v0: 20, secs: 2.5, steer: () => 1, hb: () => true, hold: false });
  const early = rows.filter((r) => r.t <= 0.33), slip = maxAbs(early, 'slip') * DEG;
  assert.ok(slip >= 25 && slip <= 60, `slip on the handbrake: ${slip.toFixed(1)} deg`);
  const round = rows.find((r) => Math.abs(r.heading) >= Math.PI);
  assert.ok(round && round.t <= 2.0, `a 180 in ${round ? round.t.toFixed(2) : '-'} s`);
  // straight, no steer: it slides on straight and slows, no swing
  const st = drive({ v0: 20, secs: 1.5, hb: () => true, hold: false });
  assert.ok(Math.abs(st.c.heading) < 1e-6 && st.c.speed < 16, 'straight on the handbrake it just slows');
  // a tap into a turn, then the throttle: through the turn and driving off
  const tap = drive({ v0: 20, secs: 2.5, steer: () => 1, hb: (t) => t < 0.5 });
  assert.ok(Math.abs(tap.c.slip) * DEG < 20 && tap.c.speed > 15, 'caught and driving off');
});

test('reversing, the steer turns it the other way, as before', () => {
  const c = { heading: 0, speed: -5, slipV: 0, handling: DAN, steerK: 0 };
  for (let i = 0; i < 30; i++) DM.steer(c, 1, 1 / 60);
  assert.ok(c.heading < -0.1);
});

test('a tail-happy car steps out under power in a turn; a planted one does not', () => {
  const tail = { yaw: 2.8, slide: 19, steerMin: 0.3, vMin: 4, vPeak: 12, vSpan: 20 };
  const happy = drive({ v0: 14, secs: 2, steer: () => 1, handling: { ...DAN, grip: 30, tail } });
  const planted = drive({ v0: 14, secs: 2, steer: () => 1, handling: { ...DAN, grip: 30 } });
  assert.ok(maxAbs(happy.rows, 'slip') > maxAbs(planted.rows, 'slip') + 0.05);
});

// a car going 30 m/s at an angle a (rad) into a wall whose normal is +x (the wall at x = 0, the car coming from -x)
function into(a, v = 30) {
  const h = a; // (heading 0 is +z, along the wall; a the angle off it, toward it)
  return { heading: h, speed: v, slipV: 0, vx: 0, vz: 0, angularVel: 0, handling: DAN };
}

test('a glancing wall: off it at 25 m/s or more, nose turned along it; once a contact', () => {
  const c = into(15 / DEG), k = DM.wallKnock(c, -1, 0);
  assert.ok(k && k.knock, 'a knock');
  const V = DM.velocity(c);
  assert.ok(Math.hypot(V.x, V.z) >= 25, `out at ${Math.hypot(V.x, V.z).toFixed(1)} m/s`);
  assert.ok(V.x <= 0, 'away from the wall or along it');
  assert.ok(c.angularVel < 0, 'its nose turned back along the wall');
  // pressed there the next frames: no more knocks, the speed along it kept
  c.heading += 0.02; const v1 = Math.hypot(DM.velocity(c).x, DM.velocity(c).z);
  const k2 = DM.wallKnock(c, -1, 0);
  assert.ok(!k2 || !k2.knock, 'the same contact is no second knock');
  assert.ok(Math.hypot(DM.velocity(c).x, DM.velocity(c).z) > v1 - 1.5, 'a graze keeps its speed');
});

test('a square-on wall: a hard stop, barely bouncing back', () => {
  const c = into(85 / DEG), k = DM.wallKnock(c, -1, 0);
  assert.ok(k.knock && k.headOn > 0.72);
  const V = DM.velocity(c);
  assert.ok(Math.hypot(V.x, V.z) < 6, `left at ${Math.hypot(V.x, V.z).toFixed(1)} m/s`);
  assert.ok(V.x < 0, 'bounced back off it');
});

test('the old knock lost most of a glance per half-metre step; the new one keeps it', () => {
  // (js/controllers.js before jh-drive: speed *= 1 - 0.62 headOn on every step that touched; a 15 degree glance at 30 m/s
  // touching for 4 steps)
  let old = 30; for (let i = 0; i < 4; i++) old *= 1 - 0.62 * Math.sin(15 / DEG);
  const c = into(15 / DEG);
  for (let i = 0; i < 4; i++) { DM.wallKnock(c, -1, 0); c.vx = 0; }
  const V = DM.velocity(c);
  assert.ok(Math.hypot(V.x, V.z) > old + 6, `new ${Math.hypot(V.x, V.z).toFixed(1)} vs old ${old.toFixed(1)} m/s`);
});

// (jh-drive round 2)
// the game's boost turn: the boost let go at 124 mph and full lock held, the car coasting down (W above its top speed)
function boostTurn(skill) {
  const c = { heading: 0, speed: 56, slipV: 0, vx: 0, vz: 0, angularVel: 0, handling: DAN, steerK: 0, axle: 1.56 };
  const dt = 1 / 60; let x = 0, z = 0, slip = 0;
  for (let t = 0; t < 1.5; t += dt) {
    const h0 = c.heading, braking = skill && t < 0.7;
    DM.steer(c, 1, dt);
    DM.tyreStep(c, DM.wrap(c.heading - h0), dt, { throttle: braking ? 0 : 1, steer: c.steerK });
    c.speed = Math.max(0, c.speed - (braking ? 40 : 14) * dt);
    const V = DM.velocity(c); x += V.x * dt; z += V.z * dt; slip = Math.max(slip, Math.abs(c.slip));
  }
  const V = DM.velocity(c);
  return { turned: Math.atan2(V.x, V.z) * DEG, x, z, slip: slip * DEG };
}

test('the boost turn: full lock at 124 mph is a wide arc the tyres hold (a slide, no snap); braking into it makes the corner', () => {
  const careless = boostTurn(false), skilled = boostTurn(true);
  assert.ok(careless.slip > 3 && careless.slip < 16, `a slide, not on rails, not a spin: ${careless.slip.toFixed(1)} deg`);
  assert.ok(careless.turned > 45 && careless.turned < 85, `travel turned ${careless.turned.toFixed(0)} deg in 1.5 s`);
  assert.ok(skilled.turned > careless.turned + 20 && Math.abs(skilled.x) < Math.abs(careless.x), `braked first: ${skilled.turned.toFixed(0)} deg, ${Math.abs(skilled.x).toFixed(0)} m across (lifting: ${Math.abs(careless.x).toFixed(0)} m)`);
  // (under 58 mph the steer and the tyres as they were; at 125 mph the steer's bite 0.7, the grip 1/0.66 of a slow corner's)
  assert.equal(DM.steerFade(20), 1); assert.equal(DM.downforce(20), 1); assert.equal(DM.downforce(26), 1);
  assert.ok(Math.abs(DM.steerFade(56) - 0.7) < 1e-9 && DM.steerFade(70) === DM.steerFade(56));
  assert.ok(DM.downforce(56) > 1.45 && DM.downforce(70) === DM.downforce(56));
  assert.ok(DM.gripOf({ handling: DAN }, 55).lat > DM.gripOf({ handling: DAN }, 20).lat * 1.4);
  assert.ok(DM.gripOf({ handling: DAN }, 55).cornering > DM.gripOf({ handling: DAN }, 20).cornering * 2);
});

test('a wall met at a slant: what is kept falls smoothly from a glance to head on (no step at 46 degrees)', () => {
  const kept = (deg) => { const a = deg / DEG, c = { heading: a, speed: 30, slipV: 0, vx: 0, vz: 0 }; DM.wallKnock(c, -1, 0); const V = DM.velocity(c); return Math.hypot(V.x, V.z); };
  const k = [20, 30, 40, 44, 48, 55, 70, 85].map(kept);
  for (let i = 1; i < k.length; i++) assert.ok(k[i] <= k[i - 1] + 0.5 && k[i - 1] - k[i] < 5.5, `kept ${k.map((v) => v.toFixed(1)).join(' ')} m/s`);
  assert.ok(kept(30) > 18 && kept(47) > 8 && kept(85) < 4.5);
});

test('on foot, his weight: going in ~0.3 s, stopping in ~0.25 s, a 180 at a walk in under half a second', () => {
  const dt = 1 / 60;
  let v = 0, t = 0; while (v < 4.4 * 0.98 && t < 2) { v = DM.footSpeed(v, 4.4, dt); t += dt; }
  assert.ok(t >= 0.25 && t <= 0.36, `0 to a jog in ${t.toFixed(2)} s (was 0.1 s, weightless)`);
  v = 8.2; t = 0; while (v > 0.05 && t < 2) { v = DM.footSpeed(v, 0, dt); t += dt; }
  assert.ok(t >= 0.2 && t <= 0.3, `a run to a stop in ${t.toFixed(2)} s`);
  v = 0; t = 0; while (v < 8.2 * 0.98 && t < 3) { v = DM.footSpeed(v, 8.2, dt); t += dt; }
  assert.ok(t > 0.7 && t < 1.2, `0 to a run in ${t.toFixed(2)} s: a jog, then the run builds`);
  assert.ok(Math.PI / DM.footTurn(1.5) >= 0.42 && Math.PI / DM.footTurn(1.5) <= 0.5, '180 at a walk');
  assert.ok(DM.footTurn(8.2) < DM.footTurn(4.4) * 0.7, 'wider turns at a run');
  // the stick's tilt: a walk, a jog, a run on Shift
  assert.ok(DM.gait(0.3, 4.4) < 1.2 && Math.abs(DM.gait(1, 4.4) - 4.4) < 1e-9 && Math.abs(DM.gait(1, 8.2) - 8.2) < 1e-9);
});

test('the radar: 1x parked and in town, out to 1.8x the range by 76 mph', () => {
  assert.equal(DM.radarZoom(0), 1); assert.equal(DM.radarZoom(5), 1);
  assert.ok(Math.abs(DM.radarZoom(34) - 1.8) < 1e-9 && DM.radarZoom(56) === DM.radarZoom(34));
  assert.ok(DM.radarZoom(20) > 1.2 && DM.radarZoom(20) < 1.6);
});
