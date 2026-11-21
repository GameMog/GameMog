// The sedan's pace (the owner, 20 Nov: "vans now top out above regular sedans, 70 mph against 64. Raise sedans to about
// 72 so a van can't outrun them? YES"): a sedan taken off the street (wagmi/jack-sheets.js, tune.js, ride.js weigh), driven
// flat out on the controllers' own drive (js/controllers.js driveSpeed), against the van, the sporty kinds, the Tensore
// (Dan's car's pace, wagmi/game.js) and the chase cars (wagmi/pursuit/index.js RULE.vmax).
//   node --test tests/sedan-speed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sheetFor, SHEETS, MODEL_SHEETS } from '../wagmi/jack-sheets.js';
import { driveTune } from '../wagmi/storyrun/vehicles/tune.js';

const ROOT = new URL('..', import.meta.url).pathname;
const ride = fs.readFileSync(ROOT + 'wagmi/storyrun/ride.js', 'utf8');
const weighSrc = ride.match(/export const ZERO_60[\s\S]*?\n}\n/)[0].replace(/export /g, '');
const { weigh } = vm.runInNewContext(`${weighSrc}\n({ weigh, ZERO_60 });`, { Object, Math });
const ctl = fs.readFileSync(ROOT + 'js/controllers.js', 'utf8');
const driveSpeed = vm.runInNewContext(`${ctl.match(/function driveSpeed\([\s\S]*?\n}\n/)[0]}\ndriveSpeed;`, { Math });
const MPH = 2.237, DIMS = { width: 1.9, height: 1.45, length: 4.8, zR: -2.4, zF: 2.4, wheelbase: 2.8 };
const VCLASS = { sedan: 'sedan', 'compact-hatch': 'sedan', crossover: 'sedan', taxi: 'sedan', coupe: 'sports', sports: 'sports', supercar: 'sports', muscle: 'sports', van: 'van', minivan: 'van', suv: 'suv', pickup: 'truck', wrecker: 'truck' };

function carOf(kind) {
  const sheet = sheetFor(kind, '#888888');
  sheet.handling = { pace: 0, pull: 0, grip: 0, weight: 0, turnIn: 0, brakes: 0, ...sheet.handling };
  const { tune, springs } = driveTune(sheet, DIMS);
  const car = { ...tune };
  weigh(car, sheet, springs, VCLASS[sheet.class] || 'sedan');
  return car;
}
function run(car) {
  const d = { speed: car.topSpeed, boostSpeed: car.topSpeed, reverse: 0.4, accel: car.accel, boostAccel: car.accel, boostLaunch: 0, rolling: car.rolling, drag: car.drag, coast: car.coast, brake: car.brake, boostBrake: car.boostBrake };
  let v = 0, t = 0, t60 = null;
  for (let i = 0; i < 60 * 40; i++) { v = driveSpeed(v, 1, false, 1 / 60, d); t += 1 / 60; if (t60 == null && v * MPH >= 60) t60 = t; }
  return { top: v, mph: v * MPH, t60 };
}

test('a sedan (and the fleet sedan) tops out at about 72 mph, 0-60 still a sedan\'s 5.4 s', () => {
  for (const k of ['sedan', 'sedan10']) {
    const r = run(carOf(k));
    assert.ok(r.mph > 71 && r.mph < 73, `${k}: ${r.mph.toFixed(1)} mph`);
    assert.ok(r.t60 > 5 && r.t60 < 5.8, `${k}: 0-60 ${r.t60.toFixed(2)} s`);
  }
  assert.equal(carOf('sedan').boostLaunch, 0);
});

test('a van (or a mail van) can no longer outrun a sedan', () => {
  const sedan = run(carOf('sedan')).mph;
  for (const k of ['van', 'van92', 'mailvan']) {
    const v = run(carOf(k)).mph;
    assert.ok(sedan > v + 1.5, `sedan ${sedan.toFixed(1)} mph, ${k} ${v.toFixed(1)} mph`);
  }
});

test('the class order holds: every sports car, coupe, roadster and muscle car over the sedan; the Tensore over all of them', () => {
  const sedan = run(carOf('sedan')).mph;
  const sporty = [...Object.keys(SHEETS), ...Object.keys(MODEL_SHEETS)].filter((k) => ['coupe', 'sports', 'supercar', 'muscle'].includes(sheetFor(k, '#888').class));
  assert.ok(sporty.length >= 8, sporty.join());
  for (const k of sporty) { const v = run(carOf(k)).mph; assert.ok(v > sedan + 1.2, `${k} ${v.toFixed(1)} mph vs sedan ${sedan.toFixed(1)}`); }
  // (the Tensore and Dan's car: topSpeed 34 m/s, wagmi/game.js)
  const dan = +fs.readFileSync(ROOT + 'wagmi/game.js', 'utf8').match(/label: story\.t\("Dan's car"\), topSpeed: (\d+(?:\.\d+)?)/)[1];
  for (const k of sporty) assert.ok(dan > run(carOf(k)).top - 0.5, k);
  assert.ok(dan * MPH > sedan + 3);
});

test('the everyday kinds stay under the sedan, the old sedan tired', () => {
  const sedan = run(carOf('sedan')).mph;
  for (const k of ['oldsedan', 'hatch', 'suv', 'minivan', 'pickup', 'taxi', 'taxi75', 'taxi20', 'suv20', 'pickup20', 'offroad20', 'box95', 'firetruck', 'garbage', 'ambulance', 'tow'])
    assert.ok(run(carOf(k)).mph < sedan - 1.5, k);
  assert.ok(run(carOf('oldsedan')).mph < 62);
});

test('the chase cars stay fair against a sedan: heat 1-2 can\'t match it flat out, heat 3 and up can', () => {
  const src = fs.readFileSync(ROOT + 'wagmi/pursuit/index.js', 'utf8');
  const vmax = vm.runInNewContext(`(${src.match(/vmax: (\(h\) => [^,]+),/)[1]})`);
  const sedan = run(carOf('sedan')).top;
  assert.ok(vmax(1) < sedan - 2 && vmax(2) < sedan, `heat 1 ${vmax(1)}, heat 2 ${vmax(2)}, sedan ${sedan.toFixed(1)} m/s`);
  assert.ok(vmax(3) > sedan && vmax(3) - sedan < 2, `heat 3 ${vmax(3)}`);
});
