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
