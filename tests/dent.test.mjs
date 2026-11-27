// The dents (the owner, 19 Nov: "make dents VERY visible for big collisions"): a dent's depth and radius by the blow's
// energy (wagmi/crash/damage-cost.js dentSpeed, dentSize), stacking to a cap, the metal kept clear of the wheels
// (wagmi/crash/dent-geom.js), and the health a hit costs unchanged.
//   node --test tests/dent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DENT, dentSpeed, dentSize, hitCost, baseCost, BUSY_FLOOR } from '../wagmi/crash/damage-cost.js';
import { keepClear, keepRoom, keepDist, crumple, wheelKeeps, KEEP } from '../wagmi/crash/dent-geom.js';
import { KINDS } from '../wagmi/crash/prop-kinds.js';

const ROOT = new URL('..', import.meta.url).pathname;
const wall = (speed, headOn = 1) => ({ kind: 'wall', speed, headOn });
const car = (speed, front = 1, mass = 2) => ({ kind: 'car', speed, front, mass });
const prop = (kind, speed) => ({ kind: 'prop', speed, b: { kind } });

test('a dent grows with the blow: a scrape a ding, a big hit (15 m/s) a crumple, harder deeper and wider', () => {
  const at = (sp) => dentSize(sp);
  // (a bump or a scrape stays subtle: a few centimetres)
  assert.ok(at(6).depth < 0.04, `6 m/s ${at(6).depth}`);
  assert.ok(at(9).depth < 0.075, `9 m/s ${at(9).depth}`);
  // (a big hit: a fifth of a metre in, three quarters of one across)
  assert.ok(at(15).depth >= 0.19 && at(15).r >= 0.7, JSON.stringify(at(15)));
  // (20 m/s, 45 mph: the hit that used to leave 6.6 cm) now nearly four times that
  assert.ok(at(20).depth > 0.23, `20 m/s ${at(20).depth}`);
  // monotonic, and bounded (never past the most a single blow may push)
  let prev = 0, prevR = 0;
  for (let sp = 0; sp <= 80; sp += 0.5) {
    const s = at(sp);
    assert.ok(s.depth >= prev - 1e-9 && s.r >= prevR - 1e-9, `${sp}`);
    assert.ok(s.depth <= DENT.DEPTH[2] + 1e-9 && s.r <= DENT.RADIUS[2] + 1e-9, `${sp}`);
    // (a bowl no steeper than its radius allows: its wall never folds a face over)
    assert.ok(s.depth / s.r < 0.4, `${sp}: ${s.depth}/${s.r}`);
    prev = s.depth; prevR = s.r;
  }
  // (the energy: the depth's rise below a big hit goes as the speed squared, near enough)
  assert.ok(at(15).depth / at(7.5).depth > 3, `${at(15).depth} / ${at(7.5).depth}`);
});

test('the dent speed is by what was hit: a wall, a car nose on and a lamp mast big; a sideswipe less; a cone nothing', () => {
  assert.equal(dentSpeed(wall(15)), 15);
  assert.ok(dentSpeed(car(15, 1)) >= 14.9, 'nose on, two cars alike');
  assert.ok(dentSpeed(car(15, 0)) < 10, 'a sideswipe');
  assert.ok(dentSpeed(car(15, 1, 6)) > 15, 'a bus');
  assert.ok(dentSpeed(prop('mast', 15), KINDS) >= 14.9, 'a lamp mast');
  assert.ok(dentSpeed(prop('hydrant', 15), KINDS) > 10, 'a hydrant');
  // (a litter basket or a barricade knocked flying at 30 m/s: no dent at all (under the cost a dent needs), or a ding)
  for (const k of ['basket', 'barricade', 'paperbox']) {
    const e = prop(k, 30), dents = hitCost(e, KINDS) >= DENT.COST && dentSpeed(e, KINDS) >= DENT.MIN;
    assert.ok(!dents || dentSize(dentSpeed(e, KINDS)).depth < 0.05, k);
  }
  // (a big hit of each kind dents as a crumple)
  for (const e of [wall(16), car(16, 1), prop('mast', 16)]) assert.ok(dentSize(dentSpeed(e, KINDS)).depth > 0.19, JSON.stringify(e));
});

test('the health a hit costs is as it was (the dents alone grew)', () => {
  assert.ok(Math.abs(baseCost(20) - 0.0155) < 0.001);
  assert.ok(Math.abs(hitCost(wall(40)) - 0.05) < 0.005);
  assert.equal(BUSY_FLOOR, 0.17);
});

test('the metal stops short of a tyre, and moves freely clear of one', () => {
  const keeps = [{ cy: 0.34, cz: 1.4, R: 0.34, x0: 0.7, x1: 0.95 }];
  // (a bumper corner in front of the front wheel, pushed straight back: it stops before the tyre's drum)
  const p = { x: 0.85, y: 0.34, z: 2.0 }, back = { x: 0, y: 0, z: -1 };
  const d = keepClear(p, back, 0.4, keeps);
  assert.ok(d < 0.4 && d > 0.15, `${d}`);
  assert.ok(p.z - d > 1.4 + 0.34 + 0.03, `stops at ${p.z - d}`);
  // (a door, nowhere near a wheel: all the way)
  assert.equal(keepClear({ x: 0.95, y: 0.6, z: 0 }, { x: -1, y: 0, z: 0 }, 0.3, keeps), 0.3);
  // (the wheel well's own lining, already in the drum: left as it is)
  assert.equal(keepClear({ x: 0.8, y: 0.34, z: 1.5 }, { x: -1, y: 0, z: 0 }, 0.3, keeps), 0);
  // (a wheel's drum from its meshes: the largest half extent its radius, the smallest half its width)
  const I = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
  const tyre = { isMesh: true, geometry: { boundingBox: { min: { x: 0.72, y: 0, z: 1.06 }, max: { x: 0.96, y: 0.68, z: 1.74 } } } };
  const W = { traverse: (f) => f(tyre) };
  const [k] = wheelKeeps([W], () => I);
  assert.ok(Math.abs(k.R - 0.34) < 1e-6 && Math.abs(k.cz - 1.4) < 1e-6 && Math.abs(k.x0 - 0.72) < 1e-6 && Math.abs(k.x1 - 0.96) < 1e-6, JSON.stringify(k));
});

test('by a wheel the push gives way smoothly to nothing: never into the tyre, never folding', () => {
  const keeps = [{ cy: 0.34, cz: 1.4, R: 0.34, x0: 0.7, x1: 0.95 }];
  // (on the drum nothing; clear of every wheel no limit; between, under its distance to the drum)
  assert.ok(keepRoom({ x: 0.85, y: 0.34, z: 1.4 + 0.34 + KEEP.M }, keeps) < 1e-6);
  assert.equal(keepRoom({ x: 0, y: 0.6, z: 0 }, []), Infinity);
  for (let z = 1.0; z <= 2.6; z += 0.02) for (let y = 0; y <= 1.2; y += 0.02) {
    const p = { x: 0.85, y, z }, dist = keepDist(p, keeps);
    if (dist === 0) continue;
    // (however deep the dent wants, a point never travels as far as the drum)
    assert.ok(Math.min(DENT.CAP.end, keepRoom(p, keeps)) < dist, `${y},${z}`);
  }
  // (its slope under 1: the least of it and the bowl folds nothing)
  const h = 1e-3;
  let worst = 0;
  for (let z = 1.0; z <= 2.6; z += 0.01) { const a = keepRoom({ x: 0.85, y: 0.5, z: z - h }, keeps), b = keepRoom({ x: 0.85, y: 0.5, z: z + h }, keeps); worst = Math.max(worst, Math.abs(b - a) / (2 * h)); }
  assert.ok(worst <= KEEP.K + 1e-6 && KEEP.K < 1, `${worst}`);
  // (a front corner a third of a metre off the tyre still takes a big hit's full dent)
  assert.ok(keepRoom({ x: 0.85, y: 0.5, z: 2.15 }, keeps) > dentSize(15).depth);
});

test("the crumple's waver is gentle: with the bowl's own slope it never folds a face over", () => {
  // (the push along its way in, at a big hit's dent: depth * falloff * (1 + 0.05 crumple); its slope along the way in under 1)
  const { depth, r } = dentSize(40), h = 1e-3;
  let worst = 0;
  for (let x = -r; x <= r; x += 0.013) for (let y = -0.4; y <= 0.4; y += 0.05) {
    const push = (xx) => { const q = Math.min(1, Math.hypot(xx, y) / r); return depth * (1 - q * q) ** 2 * (1 + 0.05 * crumple(xx, y, 0.3)); };
    worst = Math.max(worst, Math.abs((push(x + h) - push(x - h)) / (2 * h)));
  }
  assert.ok(worst < 0.8, `steepest ${worst}`);
});

test('every car that dents takes the energy-scaled dent: the damage model hands the size, cap and its own to the Tensore', () => {
  const dm = fs.readFileSync(ROOT + 'wagmi/crash/damage.js', 'utf8'), wd = fs.readFileSync(ROOT + 'wagmi/storyrun/wedge.js', 'utf8');
  assert.match(dm, /const S = dentSize\(dsp\)/);
  assert.match(dm, /dentSpeed\(e, crash\.props && crash\.props\.KINDS, car\.mass \|\| 2\)/);
  assert.match(dm, /Math\.min\(room, want, keepRoom\(cp, K\)\)/);
  assert.match(wd, /Math\.min\(room, want, keepRoom\(_p, K\)\)/);
  assert.match(wd, /Rb = o2\?\.r \?\?/);
  // (repair puts every mesh back, its own copy's positions and normals as built)
  assert.match(wd, /pos\.array\.set\(s\.pos0\)/);
  assert.match(dm, /m\.geometry = rec\.orig/);
});
