const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../js/traffic.js'), 'utf8');
// Exercise the production lane query and player snapshot without creating the WebGPU scene.
const laneQuery = source.match(/  function playerInLane\(lane, pl\) \{[\s\S]*?\n  \}/)?.[0];
const boxRun = source.match(/const HWY_BOX_RUN = \d+;/)?.[0];
const nearQuery = source.match(/  function near\(x, z, r, out = \[\]\) \{[\s\S]*?\n  \}/)?.[0];
const playerSnapshot = source.match(/    const pl = entity[\s\S]*?\n    \} : null;/)?.[0];
assert.ok(laneQuery, 'traffic lane query is present');
assert.ok(playerSnapshot, 'traffic player snapshot is present');
assert.ok(boxRun, 'traffic lane bounds run length is present');
assert.ok(nearQuery, 'shore highway near() is present');
const { playerInLane, snapshot, HWY_BOX_RUN } = vm.runInNewContext(`
  ${boxRun}
  ${laneQuery}
  function snapshot(entity, mode) {
    ${playerSnapshot}
    return pl;
  }
  ({ playerInLane, snapshot, HWY_BOX_RUN });
`);
// near() over a given set of lanes, each car placed on its lane's centre line at u
function nearOver(lanes) {
  return vm.runInNewContext(`
    ${boxRun}
    function place(c) {
      const cum = c.lane.cum;
      let i = 0;
      while (i + 2 < cum.length && cum[i + 1] < c.u) i++;
      const t = Math.min(1, Math.max(0, (c.u - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
      const a = c.lane.pts[i], b = c.lane.pts[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, c };
    }
    ${nearQuery}
    near;
  `, { lanes });
}

function lane(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  // Bounds per run of HWY_BOX_RUN segments, as createHighwayTraffic lays them out (and the whole lane's, kept)
  const runs = [];
  for (let s = 0; s + 1 < points.length; s += HWY_BOX_RUN) {
    const run = points.slice(s, Math.min(points.length, s + HWY_BOX_RUN + 1));
    runs.push(Math.min(...run.map((p) => p.x)), Math.max(...run.map((p) => p.x)),
      Math.min(...run.map((p) => p.z)), Math.max(...run.map((p) => p.z)));
  }
  return {
    pts: points,
    cum,
    box: [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)),
      Math.min(...points.map((p) => p.z)), Math.max(...points.map((p) => p.z))],
    runs
  };
}

function player(x, y, z, mode = 'car') {
  return snapshot({ position: { x, y, z }, heading: Math.PI / 2, speed: 10 }, mode);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test('street traffic recognizes players on its own road, including sidewalk height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]);
  for (const y of [0, 0.22]) {
    const result = playerInLane(road, player(50, y, 0));
    close(result.u, 50);
    close(result.v, 10);
  }
  assert.equal(playerInLane(road, player(50, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 0, 2.1)), null);
});

test('viaduct traffic ignores players below it and recognizes players at deck height', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  const result = playerInLane(road, player(50, 7.6, 0));
  close(result.u, 50);
  close(result.v, 10);
});

test('sloped lanes use horizontal projection and compare interpolated road height', () => {
  const road = lane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 7.6, z: 0 }]);
  for (const t of [0, 0.5, 1]) {
    const result = playerInLane(road, player(100 * t, 7.6 * t, 0));
    close(result.u, road.cum[1] * t);
    close(result.v, road.cum[1] / 10);
  }
  assert.equal(playerInLane(road, player(50, 0, 0)), null);
  assert.equal(playerInLane(road, player(100.1, 7.6, 0)), null);
  assert.equal(playerInLane(road, player(50, 3.8, 2.001)), null);
});

test('overlapping road segments select the matching elevation', () => {
  const road = lane([{ x: 0, y: 7.6, z: 0 }, { x: 100, y: 7.6, z: 0 },
    { x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
  const result = playerInLane(road, player(50, 0, 0));
  close(result.u, 157.6);
  close(result.v, 0);
});

test('underground lanes and helicopters remain excluded', () => {
  const road = lane([{ x: 0, y: -4.5, z: 0 }, { x: 100, y: -4.5, z: 0 }]);
  assert.equal(playerInLane(road, player(50, -4.5, 0)), null);
  assert.equal(player(50, 0, 0, 'helicopter'), null);
  assert.equal(snapshot(null, 'car'), null);
});

// (Mog City, after Slop New York a2e4c33)
test('long lanes find the player in any run of segments and ignore players inside their overall bounds', () => {
  // A U-shaped lane (up one shore, back down the other) with many segments: its overall bounds cover the middle
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ x: 0, y: 0, z: i * 10 });
  for (let i = 0; i <= 40; i++) pts.push({ x: 200, y: 0, z: 400 - i * 10 });
  const road = lane(pts);
  assert.ok(road.runs.length > 4, 'the lane is bounded in several runs');
  const late = playerInLane(road, player(200, 0, 55));
  close(late.u, road.cum[75] + 5);
  close(playerInLane(road, player(0, 0, 333)).u, 333);
  assert.equal(playerInLane(road, player(100, 0, 200)), null);
});

test('near() finds the same highway cars by runs as by walking every segment', () => {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push({ x: 0, y: 0, z: i * 10 });
  for (let i = 0; i <= 40; i++) pts.push({ x: 200, y: 0, z: 400 - i * 10 });
  const road = lane(pts);
  road.cars = [];
  for (let u = 3; u < road.cum[road.cum.length - 1]; u += 17) road.cars.push({ lane: road, u });
  const near = nearOver([road]);
  // near() as it was before the runs: the whole lane's segments, then the same distance filter
  function every(x, z, r) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.min(a.x, b.x) > x + r || Math.max(a.x, b.x) < x - r || Math.min(a.z, b.z) > z + r || Math.max(a.z, b.z) < z - r) continue;
      lo = Math.min(lo, road.cum[i]); hi = Math.max(hi, road.cum[i + 1]);
    }
    const out = [];
    for (const c of road.cars) {
      if (c.u < lo || c.u > hi) continue;
      let i = 0;
      while (i + 2 < road.cum.length && road.cum[i + 1] < c.u) i++;
      const t = Math.min(1, Math.max(0, (c.u - road.cum[i]) / ((road.cum[i + 1] - road.cum[i]) || 1)));
      const px = pts[i].x + (pts[i + 1].x - pts[i].x) * t, pz = pts[i].z + (pts[i + 1].z - pts[i].z) * t;
      if (Math.abs(px - x) < r && Math.abs(pz - z) < r) out.push(c.u);
    }
    return out;
  }
  let seed = 7, found = 0;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 400; k++) {
    const x = -40 + rand() * 280, z = -40 + rand() * 480, r = [4, 10, 30, 100][k % 4];
    const got = near(x, z, r, []).map((p) => p.c.u).sort((a, b) => a - b);
    const want = every(x, z, r).sort((a, b) => a - b);
    assert.deepEqual(got, want, `near(${x.toFixed(1)}, ${z.toFixed(1)}, ${r})`);
    found += got.length;
  }
  assert.ok(found > 100, 'the queries found cars');
});

// (Mog City, after Slop New York 17c0973) Drivers dodging Dan's car: late, as people do, and committed to whatever they
// do; only while he drives; never into the curb or another vehicle
function trafficFunction(name, context) {
  const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert.ok(match, `${name} is present`);
  return vm.runInNewContext(`(${match[0].trim()})`, context);
}

function dodgeHarness({ isRoadClear = (x) => Math.abs(x) <= 6.65, sideFree = null } = {}) {
  const consts = ['AVOID_NOTICE', 'AVOID_HOLD'].map((name) => source.match(new RegExp(`^const ${name} = .*$`, 'm'))?.[0]);
  assert.ok(consts.every(Boolean), 'dodge constants are present');
  const context = {
    dodgeClock: 0,
    threat: { ahead: 0, aside: 0, across: 0 },
    dodgeStats: { brake: 0, floor: 0, swerve: 0, boxed: 0 },
    player: { active: true, car: true, x: 0, z: 0, vx: 0, vz: 0, fx: 0, fz: 1, halfW: 0.86, halfL: 2.18 },
    playerBody: { on: false },
    network: { isRoadClear }
  };
  vm.runInNewContext(consts.join('\n').replace(/^const /gm, 'var '), context);
  for (const name of ['threatTime', 'swerveRoom', 'react']) context[name] = trafficFunction(name, context);
  context.sideFree = sideFree || (() => true);
  // a car heading +z (its right is -x) in the middle of the road
  const car = { x: 0, z: 0, tx: 0, tz: 1, yaw: 0, speed: 12, half: 2.25, bodyL: 2.18, bodyW: 0.86, halfWidth: 0.86, dl: 0,
    vx: 0, vz: 0, wreck: null, ghost: 0, bus: false, conn: null,
    evade: 0, alarm: 0, panicUntil: 0, panicAcc: 0, reaction: 0.8 };
  // Dan at (x, z) heading `heading` at `speed`, the car on at its speed, for `seconds` at 60 Hz
  const step = (x, z, heading, speed, seconds) => {
    for (let k = 0; k < seconds * 60; k++) {
      Object.assign(context.player, { x, z, fx: Math.sin(heading), fz: Math.cos(heading),
        vx: Math.sin(heading) * speed, vz: Math.cos(heading) * speed });
      context.react(car, 1 / 60);
      context.dodgeClock += 1 / 60;
      car.z += car.speed / 60;
      x += Math.sin(heading) * speed / 60;
      z += Math.cos(heading) * speed / 60;
    }
    return { x, z };
  };
  return { context, car, step };
}

test('drivers notice Dan about to hit them only shortly before, and react later still', () => {
  const { context, car, step } = dodgeHarness();
  // head-on at 12 + 14 m/s from 60 m: 2.1 s to impact, noticed 1.8 s before (after 0.3 s), acted on 0.8 s later
  let p = step(0, 60, Math.PI, 14, 0.3);
  assert.equal(car.alarm, 0, 'not noticed yet');
  p = step(p.x, p.z, Math.PI, 14, 0.7);
  assert.ok(car.alarm > 0 && car.panicUntil === 0, 'noticed, not reacting yet');
  step(p.x, p.z, Math.PI, 14, 0.2);
  assert.ok(car.panicUntil > 0, 'reacting, about a second before impact');
  assert.ok(Math.abs(context.threatTime(car) - 0.95) < 0.15);
});

test('a driver about to be hit head-on brakes and swerves; hit from behind, it floors it instead of braking', () => {
  const head = dodgeHarness();
  head.step(0, 40, Math.PI, 14, 1.2);
  assert.equal(head.car.panicAcc, -1);
  assert.equal(head.car.evade, 2.2, 'to the right, Dan coming straight at it');
  const rear = dodgeHarness();
  rear.step(0.5, -25, 0, 26, 1.2);
  assert.equal(rear.car.panicAcc, 1);
  assert.equal(rear.car.evade, 2.2, 'right, away from Dan coming up on its left (+x)');
});

test('drivers swerve behind Dan crossing their way, and to the side with room', () => {
  const cross = dodgeHarness();
  cross.step(25, 25, -Math.PI / 2, 12, 1.2);
  assert.ok(cross.car.evade < 0);
  const curb = dodgeHarness({ isRoadClear: (x) => x >= -2.55 && x <= 8 });
  curb.step(0, 40, Math.PI, 14, 1.2);
  assert.equal(curb.car.evade, -2.2);
});

test('no swerve onto a sidewalk: hemmed in by the curb both sides, a driver only brakes', () => {
  const { car, step } = dodgeHarness({ isRoadClear: (x) => Math.abs(x) <= 1.5 });
  step(0, 40, Math.PI, 14, 1.2);
  assert.equal(car.panicAcc, -1);
  assert.equal(car.evade, 0);
});

test('no swerve into a wreck or another car: the side it stands on is not taken, and a swerve under way gives up', () => {
  // a wreck on the car's right (-x): only offsets to its left (negative) are free
  let free = (v, off) => off < 0;
  const { car, step } = dodgeHarness({ sideFree: (v, off) => free(v, off) });
  const p = step(0, 40, Math.PI, 14, 1.2);
  assert.equal(car.evade, -2.2, 'left, away from the wreck');
  // then something slides into its way on the left too: it comes back to its lane
  free = () => false;
  step(p.x, p.z, Math.PI, 14, 0.1);
  assert.equal(car.evade, 0);
});

test('drivers commit to their manoeuvre whatever Dan does then', () => {
  const { car, step } = dodgeHarness();
  let p = step(0, 40, Math.PI, 14, 1.2);
  const { evade, panicAcc } = car;
  assert.ok(evade !== 0);
  p = step(p.x - 3, p.z, Math.PI, 14, 0.3);
  assert.equal(car.evade, evade);
  assert.equal(car.panicAcc, panicAcc);
});

test('Dan passing in the next lane or going away is no threat', () => {
  const { context, car } = dodgeHarness();
  Object.assign(context.player, { x: -3.6, z: -10, vx: 0, vz: 20, fx: 0, fz: 1 });
  assert.equal(context.threatTime(car), Infinity);
  Object.assign(context.player, { x: 0, z: 10, vx: 0, vz: 20 });
  assert.equal(context.threatTime(car), Infinity);
});

test('on foot, wrecked, knocked about, nosing through a jam or a bus: no swerve (a bus only brakes)', () => {
  for (const [what, set] of [['on foot', (h) => { h.context.player.car = false; }], ['wreck', (h) => { h.car.wreck = () => true; }],
    ['knocked', (h) => { h.car.vx = 3; }], ['ghost', (h) => { h.car.ghost = 2; }]]) {
    const h = dodgeHarness();
    set(h);
    h.step(0, 40, Math.PI, 14, 1.2);
    assert.equal(h.car.panicUntil, 0, what);
    assert.equal(h.car.evade, 0, what);
  }
  const bus = dodgeHarness();
  bus.car.bus = true;
  bus.step(0, 40, Math.PI, 14, 1.2);
  assert.equal(bus.car.panicAcc, -1);
  assert.equal(bus.car.evade, 0);
});

test('the room a swerve needs is checked against the vehicles there: a wreck, another car, the parked car', () => {
  const GRID = 14;
  const grid = new Map();
  const context = { GRID, grid, blockers: [], parked: { active: false }, swept: { yaw: 0, yawOffset: 0, bodyW: 0, bodyL: 0 },
    sweptOther: { yaw: 0, yawOffset: 0, bodyW: 0, bodyL: 0 } };
  for (const name of ['bodyPen', 'sideFree']) context[name] = trafficFunction(name, context);
  const put = (o) => {
    const k = (Math.floor(o.x / GRID) + 2048) * 4096 + Math.floor(o.z / GRID) + 2048;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(o);
  };
  // a car heading +z at (100, 100) (its right is -x), 10 m of reach ahead
  const v = { x: 100, z: 100, tx: 0, tz: 1, yaw: 0, yawOffset: 0, bodyW: 0.86, bodyL: 2.18 };
  put(v);
  assert.ok(context.sideFree(v, 2.2, 10) && context.sideFree(v, -2.2, 10), 'a clear road');
  // a wreck turned across the lane on its right, 6 m ahead
  put({ x: 97.6, z: 106, yaw: 1.2, yawOffset: 0, bodyW: 0.86, bodyL: 2.18, wreck: () => true });
  assert.equal(context.sideFree(v, 2.2, 10), false, 'not into the wreck');
  assert.equal(context.sideFree(v, -2.2, 10), true, 'the other side is free');
  // Dan's parked car on its left
  Object.assign(context.parked, { active: true, x: 102.4, z: 103, yaw: 0, halfW: 0.95, halfL: 2.25 });
  assert.equal(context.sideFree(v, -2.2, 10), false, 'not into the parked car');
  // a chase car further off on the left: no matter
  context.parked.active = false;
  context.blockers.push({ x: 102.4, z: 125, yaw: 0, halfW: 1, halfL: 2.4 });
  assert.equal(context.sideFree(v, -2.2, 10), true);
});
