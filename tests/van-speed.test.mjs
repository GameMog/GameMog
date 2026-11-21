// The delivery van's pace (the owner, 19 Nov: "vans top out at about 56 mph; raise their top speed to about 70 mph (and
// their acceleration to suit) without making them feel like sports cars"): a van taken off the street (wagmi/jack-sheets.js,
// tune.js, ride.js weigh), driven flat out on the controllers' own drive (js/controllers.js driveSpeed).
//   node --test tests/van-speed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sheetFor } from '../wagmi/jack-sheets.js';
import { driveTune } from '../wagmi/storyrun/vehicles/tune.js';

const ROOT = new URL('..', import.meta.url).pathname;
const ride = fs.readFileSync(ROOT + 'wagmi/storyrun/ride.js', 'utf8');
const weighSrc = ride.match(/export const ZERO_60[\s\S]*?\n}\n/)[0].replace(/export /g, '');
const { weigh, ZERO_60 } = vm.runInNewContext(`${weighSrc}\n({ weigh, ZERO_60 });`, { Object, Math });
const ctl = fs.readFileSync(ROOT + 'js/controllers.js', 'utf8');
const driveSpeed = vm.runInNewContext(`${ctl.match(/function driveSpeed\([\s\S]*?\n}\n/)[0]}\ndriveSpeed;`, { Math });
const MPH = 2.237, DIMS = { width: 2, height: 2.4, length: 5.3, zR: -2.6, zF: 2.6, wheelbase: 3.3 };

// the car entity a jacked sheet makes (ride.js fitSheet's numbers: tune, then weigh by class)
function carOf(kind, vclass) {
  const sheet = sheetFor(kind, '#888888');
  sheet.handling = { pace: 0, pull: 0, grip: 0, weight: 0, turnIn: 0, brakes: 0, ...sheet.handling };
  const { tune, springs } = driveTune(sheet, DIMS);
  const car = { ...tune };
  weigh(car, sheet, springs, vclass);
  return car;
}
// flat out from a stop, no boost: its top (m/s) and the seconds to 60 and to 70 mph
function run(car) {
  const d = { speed: car.topSpeed, boostSpeed: car.topSpeed, reverse: 0.4, accel: car.accel, boostAccel: car.accel, boostLaunch: 0, rolling: car.rolling, drag: car.drag, coast: car.coast, brake: car.brake, boostBrake: car.boostBrake };
  let v = 0, t = 0, t60 = null, t70 = null;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 40; i++) { v = driveSpeed(v, 1, false, dt, d); t += dt; if (t60 == null && v * MPH >= 60) t60 = t; if (t70 == null && v * MPH >= 69.5) t70 = t; }
  return { top: v, t60, t70 };
}

test('a delivery van (and a mail van) tops out at about 70 mph, not 56', () => {
  for (const k of ['van', 'van92', 'mailvan']) {
    const r = run(carOf(k, 'van'));
    assert.ok(r.top * MPH > 68.5 && r.top * MPH < 71.5, `${k}: ${(r.top * MPH).toFixed(1)} mph`);
    assert.ok(r.t70 != null && r.t70 < 11, `${k}: 0-70 in ${r.t70}`);
  }
});

test('the van gets there as a van: slower off the line than a sedan or a sports car, no boost', () => {
  const van = run(carOf('van', 'van')), sedan = run(carOf('sedan', 'sedan')), sports = run(carOf('gt95', 'sports'));
  assert.ok(van.t60 > 6.5 && van.t60 < 9, `van 0-60 ${van.t60.toFixed(2)} s`);
  assert.ok(van.t60 > sedan.t60 + 1.5, `van ${van.t60.toFixed(2)} s, sedan ${sedan.t60.toFixed(2)} s`);
  assert.ok(van.t60 > sports.t60 * 1.7, `van ${van.t60.toFixed(2)} s, sports ${sports.t60.toFixed(2)} s`);
  assert.equal(carOf('van', 'van').boostLaunch, 0);
  assert.equal(ZERO_60.van, 7.4);
});

test("the big trucks keep their pace: a box truck, a fire truck and a garbage truck stay slower than the van", () => {
  const van = run(carOf('van', 'van')).top;
  for (const k of ['box95', 'firetruck', 'garbage']) assert.ok(run(carOf(k, 'van')).top < van - 5, k);
});
