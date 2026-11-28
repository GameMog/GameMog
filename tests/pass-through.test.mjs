// A Hometown town's street split short of a corner (cities/sf/js/road-network.js joinThrough): the data splits a street
// where a crosswalk or footway meets it, often 8-9 m before the real corner. That node became a shape node, the 8-9 m
// link from it to the corner was squeezed, dropped as in the way of the crossing road, and the whole one-way street went
// with it: Chicago's Wells, LaSalle and Clark from Monroe to Van Buren had no lanes (loop-lanes, 27 Nov). The real road
// network in node on a made-up town: a 5 x 5 grid 90 m apart with a one-way street and a two-way one each split 8.6 m
// short of a corner, as Wells St is at Adams.
//   node --test tests/pass-through.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../cities/sf/js/');
const SPLIT = 8.6; // m short of the corner, as the data has Wells St at Adams

function town() {
  const nodes = [], links = [], P = (x, z) => (nodes.push(x, z), nodes.length / 2 - 1);
  const names = ['', 'ONE WAY ST', 'TWO WAY ST', 'CROSS ST'];
  const g = []; for (let i = 0; i < 5; i++) { g.push([]); for (let j = 0; j < 5; j++) g[i].push(P(i * 90 - 180, j * 90 - 180)); }
  // [a, b, name, w, lanes, dir, inner, flags, swL, swR, lanesFwd, lanesBack]
  const L = (a, b, ni, w, lanes, dir, lf, lb) => links.push([a, b, ni, w, lanes, dir, [], 0, 1.6, 1.6, lf, lb]);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    // (x = 0, the column i = 2: one-way southbound (+z); z = 0, the row j = 2: two-way; the rest two-way but z = 90)
    if (j + 1 < 5) {
      if (i === 2 && j === 2) { const m = P(0, 90 - SPLIT); L(g[i][j], m, 1, 13, 2, 1, 2, 0); L(m, g[i][j + 1], 1, 13, 2, 1, 2, 0); }
      else if (i === 2) L(g[i][j], g[i][j + 1], 1, 13, 2, 1, 2, 0);
      else L(g[i][j], g[i][j + 1], 0, 11, 2, 0, 1, 1);
    }
    if (i + 1 < 5) {
      if (j === 2 && i === 2) { const m = P(90 - SPLIT, 0); L(g[i][j], m, 2, 13, 2, 0, 1, 1); L(m, g[i + 1][j], 2, 13, 2, 0, 1, 1); }
      // (z = 90, the row j = 3, the corner the one-way street is split short of: one-way westbound, three lanes, as
      // Adams St is at Wells)
      else if (j === 3) L(g[i][j], g[i + 1][j], 3, 13, 3, -1, 3, 0);
      else L(g[i][j], g[i + 1][j], j === 2 ? 2 : 0, j === 2 ? 13 : 11, 2, 0, 1, 1);
    }
  }
  const n = nodes.length / 2;
  return { nodes, links, names, nhoods: [''], linkNhood: links.map(() => 0), control: new Array(n).fill(0), stopMask: new Array(n).fill(0) };
}

function network() {
  globalThis.window = globalThis; globalThis.NYC = { DEBUG_ROADS: false };
  Object.assign(globalThis, { Path2D: function () {}, document: globalThis.document || {}, location: new URL('http://127.0.0.1/?city=pkg&pkg=test') });
  const run = (f) => vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f });
  run(path.join(JS, 'sf-geodata.js'));
  NYC.GEO.roadGraph = town();
  NYC.PKG = { id: 'test', name: 'Test Town' };
  run(path.join(JS, 'city-config.js')); run(path.join(JS, 'road-network.js'));
  return NYC.buildRoadNetwork([], []);
}

const net = network();
// metres of lane edges running dir (S: +z, N, E: +x, W) along the line x = fixed (S, N) or z = fixed (E, W), from a to b
function along(dir, fixed, a, b) {
  let m = 0;
  for (const e of net.edges) {
    const ex = e.sx + e.dx * e.len, ez = e.sz + e.dz * e.len;
    const ns = dir === 'S' || dir === 'N', [p0, p1, q0, q1] = ns ? [e.sz, ez, e.sx, ex] : [e.sx, ex, e.sz, ez];
    const d = { S: e.dz, N: -e.dz, E: e.dx, W: -e.dx }[dir];
    if (Math.abs(q0 - fixed) > 2 || Math.abs(q1 - fixed) > 2 || d < 0.99) continue;
    m += Math.max(0, Math.min(Math.max(p0, p1), b) - Math.max(Math.min(p0, p1), a));
  }
  return m;
}

test('a one-way street split 8.6 m short of a corner keeps its lanes, block after block', () => {
  for (let z = -180; z < 180; z += 90) {
    const m = along('S', 0, z + 20, z + 70);
    assert.ok(m >= 45, `one-way southbound, z ${z}..${z + 90}: ${m.toFixed(0)} m of lane edge mid-block`);
  }
  assert.equal(along('N', 0, -180, 180), 0, 'and never the wrong way');
});

test('a two-way street split the same way keeps both directions', () => {
  for (const d of ['E', 'W']) {
    const m = along(d, 0, 20, 70);
    assert.ok(m >= 45, `two-way ${d}, the split block: ${m.toFixed(0)} m`);
  }
});

test('the split node joins no other road: no junction (and no stop) is left there', () => {
  const at = (x, z) => net.nodes.filter((n) => Math.hypot(n.x - x, n.z - z) < 1);
  assert.equal(at(0, 90 - SPLIT).length, 0, 'the one-way street\'s split node');
  assert.equal(at(90 - SPLIT, 0).length, 0, 'the two-way street\'s split node');
});
