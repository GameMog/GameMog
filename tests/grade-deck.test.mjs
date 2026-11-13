// A Hometown package's decks in the engine (grade-lanes): road-network.js deckOf/boreY on link field [12], and the
// link fields [10]/[11] (lanes each way). node --test tests/grade-deck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'cities/sf/js/road-network.js'), 'utf8');

function load(groundAt) {
  const window = { NYC: { Terrain: { loaded: true, groundAt, heightAt: groundAt, waterLevel: -10 } } };
  const ctx = vm.createContext({ window, console, Math, Float32Array, Array, Map, Set, Object, Number, Infinity, JSON });
  vm.runInContext(src, ctx);
  return window.NYC;
}

test('deckOf: the stretch off the ground, the profile everywhere, blended to the terrain at its anchored ends', () => {
  const N = load(() => 100);
  // a 100 m link east, the deck rising to 106.8 m in its middle, its ends on the ground (100)
  const pts = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  const ys = [];
  for (let s = 0; s <= 100; s += 5) ys.push(100 + 6.8 * Math.max(0, 1 - Math.abs(s - 50) / 45));
  const b = N.deckOf({ pts, elev: [5, ...ys] });
  assert.equal(b.kind, 'deck');
  assert.ok(b.p0 > 0 && b.p0 < 15 && b.p1 > 85 && b.p1 < 100, `${b.p0} ${b.p1}`);
  assert.ok(Math.abs(N.boreY(b, 50) - 106.8) < 1e-4);
  assert.ok(N.boreY(b, 0) !== null && Math.abs(N.boreY(b, 0) - 100) < 1e-6, 'never null, on the ground at an anchor');
  // continuous: no step anywhere along it
  let worst = 0;
  for (let u = 0; u < 100; u += 0.25) worst = Math.max(worst, Math.abs(N.boreY(b, u + 0.25) - N.boreY(b, u)));
  assert.ok(worst < 0.1, `largest step ${worst}`);
});

test('deckOf: a profile that never leaves the ground is no deck', () => {
  const N = load(() => 50);
  const b = N.deckOf({ pts: [{ x: 0, z: 0 }, { x: 30, z: 0 }], elev: [5, 50, 50.1, 50.2, 50.1, 50, 50, 50] });
  assert.equal(b, null);
});

test('deckOf: the last station at the link end (not a whole step on)', () => {
  const N = load(() => 0);
  const b = N.deckOf({ pts: [{ x: 0, z: 0 }, { x: 12, z: 0 }], elev: [5, 0, 5, 10, 12] });
  // stations 0, 5, 10 and the end (12): halfway from 10 to 12 is 11
  assert.ok(Math.abs(N.boreY(b, 11) - 11) < 1e-4, String(N.boreY(b, 11)));
});

test('boreY of a tunnel or bridge is unchanged (null outside its span)', () => {
  const N = load(() => 0);
  const b = { kind: 'bridge', p0: 10, p1: 20, y0: 1, y1: 3 };
  assert.equal(N.boreY(b, 5), null);
  assert.equal(N.boreY(b, 15), 2);
});
