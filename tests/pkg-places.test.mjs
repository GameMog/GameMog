// A Hometown package's mission places on the traffic's lanes (wagmi/world/pkg.js buildPlaces): a place whose own street
// the traffic keeps no lane of (Cedar Key's Dock St, out on the water) takes the nearest lane within PLACE_FAR m instead
// of dropping out of the library. node --test tests/pkg-places.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.NYC = { PKG: { id: 'us-1211225', places: {
  dock: { x: 1119.8, z: 1683.4, heading: 2.48, name: 'the bar on Dock St', kind: 'bar', cx: 1133.1, cz: 1693.7 },
  main: { x: 0, z: 0, heading: 0, name: 'the diner on 2nd St', kind: 'restaurant', cx: 5, cz: 5 },
  nowhere: { x: 9000, z: 9000, heading: 0, name: 'the bar out at sea', kind: 'bar', cx: 9000, cz: 9000 },
  // (a tower's garage: its centre inside the tower, its approach at the garage's open edge toward its lane)
  parking: { x: 2, z: 1, heading: 0, name: 'the parking lot', kind: 'parking', cx: 27.4, cz: 4.6, ax: 6.4, az: 4.6, aHow: 'near' },
} } };
const { buildPlaces, PLACE_NEAR, PLACE_FAR } = await import('../wagmi/world/pkg.js');

// lanes: one beside 'main', one 152 m from 'dock' (the shore end of Dock St), none near 'nowhere'
const LANES = [{ x: 3, z: 0, heading: 1 }, { x: 1010, z: 1580, heading: 0.5 }];
const nearestLane = (x, z, R) => {
  let best = null;
  for (const l of LANES) { const d = Math.hypot(l.x - x, l.z - z); if (d <= R && (!best || d < best.d)) best = { ...l, d }; }
  return best;
};

test('a place with no lane within PLACE_NEAR m keeps the nearest lane within PLACE_FAR m; farther, it is missing', () => {
  assert.ok(PLACE_FAR > 173 && PLACE_NEAR === 60);
  const lib = {}, missing = [];
  buildPlaces({ N: globalThis.NYC, lib, missing, nearestLane });
  assert.deepEqual(missing, ['nowhere']);
  assert.equal(lib.main.x, 3);
  assert.equal(lib.dock.x, 1010);
  assert.equal(lib.dock.z, 1580);
  assert.equal(lib.dock.name, 'the bar on Dock St');
  assert.equal(lib.dock.cx, 1133.1);
});

test("a compiled place's approach (ax, az) is where he goes on foot (cx, cz); the place itself stays as ox, oz", () => {
  const lib = {}, missing = [];
  buildPlaces({ N: globalThis.NYC, lib, missing, nearestLane });
  const p = lib.parking;
  assert.deepEqual([p.x, p.z], [3, 0], 'a car still stops on its lane');
  assert.deepEqual([p.cx, p.cz, p.ax, p.az, p.ox, p.oz], [6.4, 4.6, 6.4, 4.6, 27.4, 4.6]);
  // (a package compiled before the approach: its centre as before, no ax; the story runner's guard moves it)
  assert.equal(lib.main.cx, 5);
  assert.equal(lib.main.ax, undefined);
});

test("a town's points of interest for mission sites stand at their approach", async () => {
  const { createPkg } = await import('../wagmi/world/pkg.js');
  const src = (await import('node:fs')).readFileSync(new URL('../wagmi/world/pkg.js', import.meta.url), 'utf8');
  assert.match(src, /Number\.isFinite\(p\.ax\) && Number\.isFinite\(p\.az\) \? \{ id: key, name: p\.name, x: p\.ax, z: p\.az \}/);
  assert.equal(typeof createPkg, 'function');
});
