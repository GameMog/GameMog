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
