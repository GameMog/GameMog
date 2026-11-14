// The story runner's reach check (wagmi/storyrun/reach.js): every spot a mission sends the player to must be outdoors,
// on ground he can stand on, with a way to it on foot from a street. The owner, 14 Nov: "putting rings inside buildings
// does not work especially since you can NOT enter buildings on the platform". Its browser proof (The Courtesy Lane's
// salvage-log search, CL-4, inside a tower before the ring walked back; MogCity d7e6092) is in the branch's report.
//   node --test tests/storyrun-reach.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchFromRoad, createReach, reachReason, REACH_WHY } from '../wagmi/storyrun/reach.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inBox = (b, x, z, r = 0) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r;
// a town in boxes: a road along x >= 40 (its lane at x = 42), and buildings
function town(boxes) {
  const clear = (x, z) => !boxes.some((b) => inBox(b, x, z, 0.3));
  const road = (x, z) => x >= 40;
  return { clear, road };
}

test('open ground: a way from the road to the spot, road end first, the spot last', () => {
  const t = town([]);
  const r = searchFromRoad({ x: 10, z: 0, ...t });
  assert.equal(r.ok, true);
  assert.ok(r.path[0][0] >= 40, 'the path starts on the road');
  assert.deepEqual(r.path[r.path.length - 1], [10, 0]);
  assert.ok(r.len >= 29 && r.len < 36, `about the straight 30 m (${r.len})`);
});

test('a spot inside a building: refused as inside, nothing searched', () => {
  const tower = { minX: 0, maxX: 30, minZ: -20, maxZ: 20 };
  const r = searchFromRoad({ x: 15, z: 0, ...town([tower]) });
  assert.equal(r.ok, false); assert.equal(r.why, 'inside'); assert.equal(r.cells, 0);
});

test('a spot walled in on every side (a courtyard): enclosed', () => {
  const walls = [{ minX: -10, maxX: 10, minZ: -10, maxZ: -9 }, { minX: -10, maxX: 10, minZ: 9, maxZ: 10 }, { minX: -10, maxX: -9, minZ: -10, maxZ: 10 }, { minX: 9, maxX: 10, minZ: -10, maxZ: 10 }];
  const r = searchFromRoad({ x: 0, z: 0, ...town(walls), R: 60 });
  assert.equal(r.ok, false); assert.equal(r.why, 'enclosed'); assert.ok(r.cells > 100);
});

test('a wall between the spot and the road, open at one end: the way goes round it', () => {
  const wall = { minX: 20, maxX: 21, minZ: -30, maxZ: 12 };
  const r = searchFromRoad({ x: 10, z: 0, ...town([wall]) });
  assert.equal(r.ok, true);
  assert.ok(r.len > 33, `round the wall's open end (the straight line is 30 m), not through it (${r.len.toFixed(1)} m)`);
  assert.ok(r.path.some(([, z]) => z > 12), 'past the wall\'s end');
  // every leg of it is clear ground
  const { clear } = town([wall]);
  for (let i = 1; i < r.path.length; i++) {
    const [ax, az] = r.path[i - 1], [bx, bz] = r.path[i];
    for (let k = 0; k <= 10; k++) assert.ok(clear(ax + (bx - ax) * k / 10, az + (bz - az) * k / 10), `leg ${i} crosses the wall`);
  }
});

test('two buildings touching at a corner: no way squeezes through the corner', () => {
  const a = { minX: 15, maxX: 25, minZ: -40, maxZ: 0 }, b = { minX: 25, maxX: 35, minZ: 0, maxZ: 40 };
  // a long wall closes everything else off: the only gap would be the corner where a and b touch
  const c = { minX: 25, maxX: 26, minZ: -60, maxZ: -40 }, d = { minX: 14, maxX: 15, minZ: 0, maxZ: 60 };
  const r = searchFromRoad({ x: 20, z: 10, ...town([a, b, c, d]), R: 30 });
  assert.equal(r.ok, false);
});

// a W and a world the way Mog City's runner hands them to createReach: colliders by bounds, lanes along x = 42
function fake(boxes, { water = () => false } = {}) {
  const cm = { nearColliders: (x, z, r) => boxes.filter((b) => inBox(b, x, z, r)), getGroundHeight: () => 0 };
  const world = { groundY: () => 0, inWater: water, nearestLane: (x, z, mode, R) => { const d = Math.abs(x - 42); return d <= R ? { x: 42, z, d, heading: 0 } : null; } };
  return createReach({ app: { controllerManager: cm } }, world);
}

test('createReach: clear, inside, a line through a wall, the nearest clear spot, a car\'s spot', () => {
  const tower = { minX: 0, maxX: 30, minZ: -20, maxZ: 20, maxY: 60 }, kerb = { minX: 32, maxX: 33, minZ: -50, maxZ: 50, maxY: 0.15 };
  const R = fake([tower, kerb]);
  assert.equal(R.clear(15, 0), false); assert.equal(R.inside(15, 0), true);
  assert.equal(R.clear(31, 0), true, 'a kerb is no wall');
  assert.equal(R.line(31, -25, 31, 25), true);
  assert.equal(R.line(-5, 0, 35, 0), false, 'a line through the tower');
  const q = R.nearestClear(29.5, 0, 6); assert.ok(q && q.x >= 30.3, 'moved out of the wall');
  assert.equal(R.fromRoad(15, 0).why, 'inside');
  // (a mark at a facade, within SLACK of open ground, is that ground: a ring there is seen and stood in)
  const door = R.fromRoad(29.6, 5); assert.equal(door.ok, true); assert.deepEqual(door.path[door.path.length - 1], [29.6, 5]);
  assert.equal(R.fromRoad(27, 5).why, 'inside', '3 m inside the wall is inside');
  const ok = R.fromRoad(31, 0); assert.equal(ok.ok, true);
  assert.equal(R.fromRoad(42, 5, 'car').ok, true);
  assert.equal(R.fromRoad(20, 30, 'car').why, 'off-road', 'no lane within 9 m');
  assert.equal(R.free(15, 0), false); assert.equal(R.free(42, 0), true);
  const wet = fake([], { water: (x) => x < -50 });
  assert.equal(wet.fromRoad(-60, 0).why, 'water');
});

test('the reason the builder reads: the step, the place and why, in a player\'s words', () => {
  const r = { mission: 'CL-4', step: 8, type: 'search', label: 'take the salvage log', at: 'boat-lot', place: 'parking', name: 'the boat-trailer lot', why: 'inside' };
  const s = reachReason(r);
  assert.match(s, /^Unreachable: the search "take the salvage log" at the boat-trailer lot \(@boat-lot\) is inside a building/);
  assert.match(s, /Pick another place for it\.$/);
  assert.ok(s.length <= 240, 'it fits the test drive\'s reason');
  for (const k of Object.keys(REACH_WHY)) assert.ok(reachReason({ ...r, why: k }).length <= 240);
  assert.doesNotMatch(s, /Claude|Opus|Anthropic|GTA/);
});

test('the runner holds every spot a step sends him to to it, and the autopilot never moves through a wall', () => {
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  // walk, search, drive and stops (goTo), place, a mission's start, a fight's arena, a collect, a tow
  for (const re of [/mustReach\(hx, hz, 'person', d, p/, /mustReach\(p\.x, p\.z, 'person', d, p\);\n    gps\.objective\(parts\(d\.objective \|\| `Walk to/, /mustReach\(p\.x, p\.z, inCar\(\) \|\| needsCar/,
    /STEPS\.place = [^\n]*mustReach/, /type: 'start' \}, p\)/, /const p = placeOf\(d\.arena\);\n    mustReach/, /placeOf\(r\); mustReach\(/, /mustReach\(cx, cz, 'car'/]) assert.match(run, re);
  assert.match(run, /e\.kind === 'reach'\)\) return \{ how: 'fail'/);
  const ap = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/autopilot.js'), 'utf8');
  // (every direct move of the person is the guarded hop, the landing checked walk jump, or his door when he gets in)
  const moves = ap.split('\n').filter((l) => /P\.position\.(set|x \+=|z \+=)/.test(l) && !/^\s*\/\//.test(l));
  for (const l of moves) assert.match(l, /function hop|P\.position\.set\(x, cm\.getGroundHeight\(x, z|if \(q\) \{ P\.position\.set|car\.position\.x \+ Math\.cos\(car\.heading\) \* 1\.8|P\.position\.x \+= Math\.sin\(P\.heading\) \* sp \* dt/, l.trim().slice(0, 120));
  assert.match(ap, /function putCar\(x, z, h\) \{\n    if \(!carOk\(x, z\)\)/);
});
