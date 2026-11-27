// Signal heads and traffic agree: a junction is a signal (road-network.js step 8) only where street-details.js placed a
// mast (site.masts), and on phone and low a failed first corner falls back to the other one.
//   node --test tests/signal-masts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const road = readFileSync(new URL('../js/road-network.js', import.meta.url), 'utf8');
const details = readFileSync(new URL('../js/street-details.js', import.meta.url), 'utf8');

// road-network.js step 8, run on its own over a few nodes and sites
const step8 = road.match(/  \/\/ 8\. Signalized intersections[\s\S]*?\n  \}\n/)?.[0];

function signals(sites, nodes) {
  vm.runInNewContext(step8, { SIGNAL_SITES: sites, nodes, Map, Math });
  return nodes.map((n) => !!n.signal);
}

test('road-network step 8 is present', () => assert.ok(step8, 'step 8 found'));

test('a junction is a signal only where a mast stands (site.masts), or when no furniture was built', () => {
  const nodes = () => [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }, { x: 300, z: 0 }];
  const sites = [{ x: 0, z: 0, masts: 0 }, { x: 100.5, z: 0.5, masts: 1 }, { x: 200, z: 0, masts: 2 }, { x: 300, z: 0 }];
  assert.deepEqual(signals(sites, nodes()), [false, true, true, true]);
});

// street-details.js's corner loop, run on its own with stubbed checks: which corners take a mast
const loop = details.match(/      const corners = \[[\s\S]*?\n      for \(const c of corners\) \{[\s\S]*?site\.masts\+\+;/)?.[0];

function masts(site, { oneMast, ok }) {
  const placed = [];
  const src = `${loop}\n placed.push(c.sx); }`;
  vm.runInNewContext(`(() => { for (const site of [S]) { ${src} } })()`, {
    S: site, oneMast, placed, placedPoles: [], addFootprint() {},
    ave: { x: site.x, width: 20 }, st: { z: site.z, width: 10 }, cornerOffsetX: 11.25, cornerOffsetZ: 6.25,
    isOnCurbIsland: (x, z) => ok(x > site.x ? 1 : -1, z > site.z ? 1 : -1), inPlaza: () => false, blockAt: () => false, isClearOfPoles: () => true,
  });
  return placed;
}

test('the corner loop is present and keeps no early cut to one corner', () => {
  assert.ok(loop, 'corner loop found');
  assert.ok(!/corners\.length = 1/.test(details), 'no corners.length = 1 before the checks');
});

test('phone/low: one mast, the other corner tried when the first fails', () => {
  const site = () => ({ x: 0, z: 0, core: false, ne: true, sw: true });
  assert.deepEqual(masts(site(), { oneMast: true, ok: () => true }), [1]);
  assert.deepEqual(masts(site(), { oneMast: true, ok: (sx) => sx < 0 }), [-1]);
  const s = site(); masts(s, { oneMast: true, ok: () => false });
  assert.equal(s.masts, 0, 'no corner: no mast, so no signal');
});

test('neither diagonal corner takes a mast: one on the NW or SE corner instead, on every tier', () => {
  const offDiagonal = (sx, sz) => sx === sz; // only NW (-1, -1) and SE (1, 1) pass
  for (const oneMast of [true, false]) {
    const s = { x: 0, z: 0, core: false, ne: true, sw: true };
    assert.deepEqual(masts(s, { oneMast, ok: offDiagonal }), [-1]);
    assert.equal(s.masts, 1);
  }
});

test('high: both corners where both pass; the core keeps its pair on every tier', () => {
  assert.deepEqual(masts({ x: 0, z: 0, core: false, ne: true, sw: true }, { oneMast: false, ok: () => true }), [1, -1]);
  assert.deepEqual(masts({ x: 0, z: 0, core: true }, { oneMast: true, ok: () => true }), [1, -1]);
});
