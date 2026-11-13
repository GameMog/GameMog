// Chase cars that keep to the road (wagmi/world/lanes.js, wagmi/pursuit/nav.js and steer.js), in node: the real road
// network on a made-up town (always), San Francisco (committed) and the Hometown packages okemah, phoenix and
// pittsburgh when they are built (cities/pkg/packages/ is git-ignored: skipped when absent). One city per child process
// (tests/lib/chase-sim.mjs: the city's classic scripts declare globals). node --test tests/chase-lane.test.mjs
//
// Baselines (hometown-integrate 935944d, the same sim: 20 seeds x 150 s, a lane-following target at 20 m/s, vmax 27):
//   time off the asphalt   okemah 54.9%  phoenix 48.2%  pittsburgh 47.7%  sf 35.6%   (0/20 runs never off)
//   median m to the first time off   okemah 14  phoenix 17  pittsburgh 36  sf 98
// With this change (ht-cars): okemah 3.1%  phoenix 3.2%  pittsburgh 4.8%  sf 4.0%  synthetic 3.0%; median m to the
// first time off 220-570; a target parked on a lawn caught 18-20/20; no straight-line fallback routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasPkg } from './lib/chase-sim.mjs';
import { createLaneIndex } from '../wagmi/world/lanes.js';
import { follow, roadClear, reach, rejoin, directOK } from '../wagmi/pursuit/steer.js';

const SIM = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib/chase-sim.mjs');
const sim = (city, ...a) => JSON.parse(execFileSync(process.execPath, [SIM, city, ...a.map(String)], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').pop());

// the Phase A gate (cities/sf/docs: the chase-road spec): on the asphalt 92% of the time and more, never a straight
// line across the blocks, and a target parked off the road still caught
for (const city of ['synthetic', 'sf', 'okemah', 'phoenix', 'pittsburgh']) {
  const skip = !['synthetic', 'sf'].includes(city) && !hasPkg(city) ? `cities/pkg/packages/${city} not built` : false;
  test(`${city}: chase cars stay on the road`, { skip }, () => {
    const r = sim(city, 20, 150);
    assert.ok(r.offPct <= 8, `${city}: off the asphalt ${r.offPct}% of the time (gate 8%)`);
    assert.equal(r.straight, 0, 'a route that is one straight line to the target');
    assert.equal(r.nav.fails, 0, 'routes that found no way');
    assert.ok(r.medianFirstOff === 'never' || r.medianFirstOff >= 150, `median metres to the first time off: ${r.medianFirstOff}`);
  });
  test(`${city}: a target parked on a lawn is still caught`, { skip }, () => {
    const r = sim(city, 20, 60, 'lawn');
    assert.ok(r.caughtOf >= 10, 'lawn spots found');
    assert.ok(r.caught >= r.caughtOf - 2, `caught ${r.caught}/${r.caughtOf}`);
  });
}

// a small network by hand: two parallel streets 20 m apart (each one edge per direction), a cross street
function net2() {
  const nodes = [], edges = [];
  const node = (x, z) => { const n = { x, z, id: nodes.length }; nodes.push(n); return n; };
  const edge = (a, b, lanes, half = 4.5) => { const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const e = { from: a, to: b, sx: a.x, sz: a.z, dx: ux, dz: uz, rx: uz, rz: -ux, len, lanes, half, id: edges.length }; edges.push(e); return e; };
  const a = node(0, 0), b = node(0, 200), c = node(20, 0), d = node(20, 200);
  edge(a, b, [1.7]); edge(b, a, [1.7]); edge(c, d, [1.7]); edge(d, c, [1.7]);
  return { nodes, edges };
}

test('lane index: the nearest lane, by heading its own side, by height its own level', () => {
  const N = net2(), L = createLaneIndex(N);
  const p = L.nearest(1, 100);
  assert.ok(p && p.d < 1.5 && Math.abs(p.x) < 2 && p.s > 90 && p.s < 110);
  // (facing +z: the edge running +z, even though the other way's lane is as near)
  const up = L.nearest(0, 100, { h: 0 }), down = L.nearest(0, 100, { h: Math.PI });
  assert.ok(up.edge.dz > 0.9 && down.edge.dz < -0.9);
  // (4 m in from an edge's ends; beyond R: none)
  assert.ok(L.nearest(0, -50, { R: 80 }).s >= 4);
  assert.equal(L.nearest(500, 500, { R: 80 }), null);
  // (a lane 5 m above: skipped with a y)
  N.edges[2].prof = [5, 5]; N.edges[3].prof = [5, 5];
  const L2 = createLaneIndex({ ...N, edgeY: (e) => e.prof[0] });
  assert.ok(Math.abs(L2.nearest(19, 100, { y: 0 }).x) < 3, 'a lane at its own level');
  assert.ok(L2.corridor(2, 100) && L2.corridor(18, 100) && !L2.corridor(10, 100));
});

test('lane index: the same answer as a scan of every edge (San Francisco, no heading)', () => {
  const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { loadCity } from ${JSON.stringify(SIM)};
    import { createLaneIndex } from ${JSON.stringify(path.resolve(path.dirname(SIM), '../../wagmi/world/lanes.js'))};
    const C = loadCity('sf'), L = createLaneIndex(C.net); let s = 7, bad = 0, n = 0;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 400; k++) { const x = -2000 + rnd() * 3200, z = -2400 + rnd() * 4600; let best = null;
      for (const e of C.net.edges) { if (e.len < 8) continue; const t = Math.max(4, Math.min(e.len - 4, (x - e.sx) * e.dx + (z - e.sz) * e.dz));
        for (const l of e.lanes) { const px = e.sx + e.dx * t + e.rx * l, pz = e.sz + e.dz * t + e.rz * l, d = Math.hypot(px - x, pz - z); if (!best || d < best) best = d; } }
      const q = L.nearest(x, z, { R: 80 }); if (best != null && best <= 80) { n++; if (!q || Math.abs(q.d - best) > 1e-6) bad++; } }
    console.log(JSON.stringify({ n, bad })); process.exit(0);`], { encoding: 'utf8' }).trim().split('\n').pop());
  assert.ok(r.n > 100); assert.equal(r.bad, 0);
});

test('follow: projected on the path, slower for a sharp corner ahead than on a straight', () => {
  const P = { x: 1, z: 0, h: 0, speed: 20, seg: 0 };
  const straight = follow({ ...P }, [[0, 0], [0, 100], [0, 200]], 27);
  assert.ok(straight.vt >= 26.9 && Math.abs(straight.ax) < 0.01 && straight.az > 6);
  const corner = follow({ ...P }, [[0, 0], [0, 15], [40, 15]], 27);
  assert.ok(corner.vt < 20, `corner speed ${corner.vt}`);
  // (pointing away from where it must go: slow enough to come round)
  assert.ok(reach({ x: 0, z: 0, h: 0, speed: 20 }, 10, 5) < 10);
  assert.equal(reach({ x: 0, z: 0, h: 0, speed: 20 }, 0, 30), Infinity);
});

test('roadClear, directOK and rejoin', () => {
  const road = (x, z) => Math.abs(x) < 5 || Math.abs(z) < 5; // (a cross of two streets)
  assert.ok(roadClear(road, 0, -50, 0, 50));
  assert.ok(!roadClear(road, -40, -40, 40, 40), 'across the blocks');
  assert.ok(roadClear(road, 0, -20, 6.5, 0), 'a corner cut of under 2 m');
  // (straight at a target across the block: no; at one parked on the lawn within 25 m: yes, on purpose)
  const P = { x: 0, z: -30, h: 0, speed: 10 };
  assert.ok(!directOK(road, P, { x: 30, z: 0 }, 42, 30, 0));
  assert.ok(directOK(road, { x: 0, z: 10, h: 0, speed: 5 }, { x: 15, z: 15 }, 15.8, 15, 15));
  // off the road 0.25 s and more: back to its lane, until on it 0.3 s
  const C = { x: 12, z: -30, h: 0, speed: 8 }, ctx = { onRoadway: road, locate: (x, z) => ({ x: 1.7, z, heading: 0 }) };
  assert.equal(rejoin(C, 0.1, ctx), null);
  let g = null; for (let i = 0; i < 4; i++) g = rejoin(C, 0.1, ctx);
  assert.ok(g && g.ax < 3 && g.az > C.z && g.vt <= 12);
  Object.assign(C, { x: 1 }); for (let i = 0; i < 4; i++) g = rejoin(C, 0.1, ctx);
  assert.equal(g, null); assert.equal(C.rejoin, false);
  assert.equal(rejoin({ x: 12, z: 0, h: 0, speed: 5, offT: 3 }, 0.1, { ...ctx, exempt: true }), null);
});
