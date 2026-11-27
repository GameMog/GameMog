// The engine's side of Jensen Heist's TP-6 fix (the final replay, 20 Nov): a chase to a place that starts with his car
// standing sets its crew out behind him on the road after a calm (it wedged him in on the rose garden's lawn and he was
// caught in 14 s); it starts once he is in the car; and a story's own crew wears plain wheels, not Delgado's acid green
// (it read as the Tensore's lime). Pure parts run, wiring read from the source.
//   node --test tests/jh-tp6-chase.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
globalThis.location ??= new URL('http://127.0.0.1:4981/?pack=x');

test('a chase to a place from a standing car: every car behind him along the way there, after a calm', async () => {
  const { chaseOpening, routeHeading, BEHIND_START } = await import('../wagmi/storyrun/rules.js');
  const reach = { type: 'pursuit', goal: 'reach', to: '@market' };
  const o = chaseOpening(reach, { speed: 0.4, routeH: 1.2, carH: -2 });
  assert.deepEqual(o, { ahead: false, calm: BEHIND_START.calm, behind: { min: BEHIND_START.min, h: 1.2 } });
  assert.ok(BEHIND_START.min >= 70, 'well behind him, not beside him');
  assert.ok(BEHIND_START.calm >= 3 && BEHIND_START.calm <= 8);
  // (no route: the way he faces; neither: behind by the pursuit's own reading of him)
  assert.equal(chaseOpening(reach, { speed: 0, carH: 0.5 }).behind.h, 0.5);
  assert.equal(chaseOpening(reach, { speed: 0 }).behind.h, undefined);
  // (a chase to lose, an escort, or one started at speed keeps the town's own opening: BT-3's and SS-5's tuning)
  assert.equal(chaseOpening({ goal: 'lose' }, { speed: 0 }), null);
  assert.equal(chaseOpening({ goal: 'escort' }, { speed: 0 }), null);
  assert.equal(chaseOpening(reach, { speed: 12 }), null);
  assert.equal(chaseOpening({ goal: 'reach' }, { speed: 0 }), null);
  // (the way there: from the car to the route's first point 30 m off, heading as the car's: +z is 0, +x is pi/2)
  assert.equal(routeHeading([[0, 0], [0, 10], [0, 40]], { x: 0, z: 0 }), 0);
  assert.ok(Math.abs(routeHeading([[5, 0], [50, 0]], { x: 0, z: 0 }) - Math.PI / 2) < 1e-9);
  assert.equal(routeHeading([[0, 5]], { x: 0, z: 0 }), null);
  assert.equal(routeHeading(null, { x: 0, z: 0 }), null);
});

test('the pursuit puts a standing start\'s cars behind him, each further back, on the road, with no cue down his road', () => {
  const pu = src('wagmi/pursuit/index.js');
  // (behindRange is pure: min..min+40 m for the first, each one after further back)
  const m = pu.match(/export const behindRange = \(min = 80, i = 0\) => \[min \+ 35 \* i, min \+ 40 \+ 45 \* i\];/);
  assert.ok(m, 'behindRange');
  const behindRange = (min = 80, i = 0) => [min + 35 * i, min + 40 + 45 * i];
  for (let i = 0; i < 5; i++) { const [a, b] = behindRange(80, i); assert.ok(a >= 80 && b > a); if (i) assert.ok(a > behindRange(80, i - 1)[0]); }
  // (behind.h is the way there; behindSpot keeps to the road and to the far side of his level; the cue is off)
  assert.match(pu, /const bh = opts\.behind, TB = bh \? \{ \.\.\.T, h: Number\.isFinite\(bh\.h\) \? bh\.h : T\.h \} : T;/);
  assert.match(pu, /const s = \(bh \? behindStart\(TB, i, bh\.min\) : /);
  // (behindStart can find no spot (nav.spot samples at random): straight back along the way there, never a throw)
  assert.match(pu, /\|\| \(bh \? \{ x: TB\.x - Math\.sin\(TB\.h\) \* behindRange\(bh\.min, i\)\[0\], z: TB\.z - Math\.cos\(TB\.h\) \* behindRange\(bh\.min, i\)\[0\], h: TB\.h \} : \{ x: T\.x/);
  assert.match(pu, /function behindStart\(T, i, min\) \{\s*const \[a, b\] = behindRange\(min, i\);\s*return behindSpot\(T, a, b\)/);
  assert.match(pu, /&& !opts\.behind \? CUE\.at : null/);
  assert.match(pu, /function behindSpot\(T, rMin, rMax\) \{\s*const fx = Math\.sin\(T\.h\), fz = Math\.cos\(T\.h\), back = \(x, z\) => \(x - T\.x\) \* fx \+ \(z - T\.z\) \* fz < -rMin \* 0\.5 && onRoad\(x, z\);/);
});

test('the story runner: the opening asked for a standing reach chase, the car first, an action world\'s crew plain', () => {
  const rn = src('wagmi/storyrun/runner.js');
  const pur = rn.slice(rn.indexOf('STEPS.pursuit = async'), rn.indexOf('STEPS.tail = async'));
  assert.match(pur, /if \(d\.goal === 'reach' && d\.to && !inCar\(\) && M\.def\.vehicle && dist\(me\(\), car\.position\.x, car\.position\.z\) < 80\) \{\s*ui\.objective\(parts\('Get in your \*\*car\*\*\{blue\}\.'\)\);\s*await wait\(\(\) => inCar\(\), t\);/);
  assert.ok(pur.indexOf('await wait(() => inCar(), t)') < pur.indexOf('pu.start('), 'in the car before the chase starts');
  assert.match(pur, /open = chaseOpening\(d, \{ speed: car\.speed \|\| 0, routeH, carH: car\.heading \}\);/);
  // (the way there from three plans, the car's heading, against it and none, the shortest taken: rules.js wayThere)
  assert.match(pur, /const routes = \[h, h \+ PI, null\]\.map\(\(hh\) => \{ try \{ return gps\.plan\(c0, to, hh\); \} catch \{ return null; \} \}\);\s*routeH = wayThere\(routes, c0, to\);/);
  assert.match(pur, /d\.goal === 'reach' \? 'Keep moving\.' : 'Lose them\.'/);
  assert.match(pur, /\.\.\.\(open \|\| \{\}\), \.\.\.\(action\.on \? \{ plain: true \} : \{\}\) \}\);/);
  assert.match(rn, /buildChaseCar\(police \? 'police' : 'suits', i, \{ plain: action\.on \}\)/);
  // (the way there held clear of the traffic further for a standing start's chase: S Market St's buses)
  assert.match(pur, /wayLen = open \? CLEAR_WAY\.open : CLEAR_WAY\.base, waySecs = open \? CLEAR_WAY\.secs : 25;/);
  assert.match(pur, /k < r\.length && L < wayLen;/);
  assert.match(pur, /now\(\) - t0 > waySecs \* 1000/);
});

test('the way there held clear: 180 m for any chase to a place, the whole way to the market for a standing start', async () => {
  const { CLEAR_WAY } = await import('../wagmi/storyrun/rules.js');
  assert.equal(CLEAR_WAY.base, 180);
  assert.ok(CLEAR_WAY.open >= 600 && CLEAR_WAY.open <= 800, 'TP-6: 0.6 km to the market');
  assert.ok(CLEAR_WAY.secs >= 40 && CLEAR_WAY.secs <= 90);
});

test("a story's own crew: gunmetal rims and no acid glow; Delgado's Suits keep theirs", () => {
  const cars = src('wagmi/pursuit/cars.js');
  assert.match(cars, /export function buildChaseCar\(kind = 'suits', i = 0, o = \{\}\)/);
  assert.match(cars, /const plain = !police && !!o\.plain;/);
  assert.match(cars, /police \? C\.chrome : plain \? C\.gunmetal : C\.acid/);
  assert.match(cars, /if \(!police && !plain\) \{\s*const glow/);
  assert.doesNotMatch(cars.match(/gunmetal = new THREE\.MeshStandardNodeMaterial\(\{[^}]*\}/)[0], /B6FF3B|emissive/i);
  const pu = src('wagmi/pursuit/index.js');
  assert.match(pu, /buildChaseCar\(ch\.kind, i, \{ plain: ch\.plain \}\)/);
  assert.match(pu, /plain: !!opts\.plain,/);
});

test("the way there is the shortest route's, 80 m along, not the car's heading's U-turn (the RC review, 20 Nov)", async () => {
  const { wayThere, chaseOpening } = await import('../wagmi/storyrun/rules.js');
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;
  // TP-6: the car on the lawn at the origin facing +z, the market 600 m off down -z. The plan with the car's heading
  // sets off 120 m forward and U-turns (840 m); against it, straight there (620 m)
  const from = { x: 0, z: 0 }, to = { x: 0, z: -600 };
  const uturn = [[0, 0], [8, 0], [8, 120], [-8, 120], [-8, -600], [0, -600]];
  const straight = [[0, 0], [-8, 0], [-8, -600], [0, -600]];
  const h = wayThere([uturn, straight, null], from, to);
  assert.ok(near(h, Math.atan2(-8, -72)), 'along the straight route, 80 m in: ' + h);
  assert.ok(Math.cos(h - Math.PI) > 0.9, 'toward the market');
  // (the crew's behind is opposite it: down the lawn's far side, +z, never on his way)
  const o = chaseOpening({ goal: 'reach', to: '@market' }, { speed: 0, routeH: h, carH: 0 });
  const bx = -Math.sin(o.behind.h), bz = -Math.cos(o.behind.h);
  assert.ok(bz > 0.9 && Math.abs(bx) < 0.2);
  // (no plan: the bearing to the place; nothing at all: null)
  assert.ok(near(wayThere([null, null], from, to), Math.PI));
  assert.ok(near(wayThere([], from, { x: 100, z: 0 }), Math.PI / 2));
  assert.equal(wayThere([], from, null), null);
  assert.equal(wayThere([[[0, 0], [0, 50]]], null, to), null);
  // (a route shorter than 80 m: its end)
  assert.ok(near(wayThere([[[0, 0], [30, 0]]], from, { x: 30, z: 0 }), Math.PI / 2));
});
