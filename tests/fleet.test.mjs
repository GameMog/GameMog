// A town's fleet (cities/sf/js/traffic.js FLEET) and the cars the player can take from it (wagmi/jack-sheets.js):
// the region by the town's state, climate, density and places; its mix; the same town always the same fleet; and every
// kind a sheet the Story Kit builds (wagmi/storyrun/vehicles/sheet.js checkSheet: the schema and the brand rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { SHEETS, NOUN, sheetFor } from '../wagmi/jack-sheets.js';
import { checkSheet } from '../wagmi/storyrun/vehicles/sheet.js';

const src = readFileSync(new URL('../cities/sf/js/traffic.js', import.meta.url), 'utf8');
const block = src.match(/const FLEETS = \{[\s\S]*?\n\}\)\(\);/)?.[0];
assert.ok(block, 'the FLEET block is in traffic.js');
const KINDS = ['sedan', 'suv', 'van', 'taxi', 'hatch', 'oldsedan', 'minivan', 'pickup', 'coupe', 'muscle', 'convertible'];
const fleetFor = (PKG) => vm.runInNewContext(`${block}\nFLEET;`, {
  window: { NYC: { PKG } }, BODY_SPECS: Object.fromEntries(KINDS.map((k) => [k, {}])), DENSITY: PKG ? PKG.density ?? 1 : 1,
});
const places = (n, kinds) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['p' + i, { kind: kinds[i % kinds.length] }]));
const okemah = { id: 'us-4054200', name: 'Okemah, OK', density: 0.2, climateZone: 'humid', frame: { lat0: 35.43 }, places: places(83, ['restaurant', 'church', 'gas_station', 'school']) };
const balHarbour = { id: 'us-1203275', name: 'Bal Harbour, FL', density: 0.33, climateZone: 'tropical', frame: { lat0: 25.9 }, places: places(147, ['hotel', 'restaurant', 'restaurant', 'restaurant', 'restaurant', 'restaurant', 'bank', 'park', 'bar', 'cafe']) };
const pittsburgh = { id: 'pittsburgh', name: 'Pittsburgh, PA', density: 1, frame: { lat0: 40.42 }, places: {} };
const draw = (F, n, parked = false) => { const r = F.random('t'), c = {}; for (let i = 0; i < n; i++) { const k = F.pick(r, parked); c[k] = (c[k] || 0) + 1; } return c; };

test('no package (San Francisco, New York): no town fleet', () => {
  assert.equal(fleetFor(undefined), null);
});

test('a small inland town is rural: pickups lead, older sedans, no cabs, no convertibles', () => {
  const F = fleetFor(okemah), c = draw(F, 2000);
  assert.equal(F.region, 'rural');
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(top, 'pickup');
  assert.ok((c.oldsedan || 0) > 150);
  assert.equal(c.taxi || 0, 0);
  assert.equal(c.convertible || 0, 0);
});

test('a warm resort strip (hotels thick among its places) drives SUVs, convertibles and coupes', () => {
  const F = fleetFor(balHarbour), c = draw(F, 2000);
  assert.equal(F.region, 'resort');
  assert.ok(c.convertible > 150 && c.coupe > 100 && c.suv > 300, JSON.stringify(c));
  assert.ok((c.pickup || 0) < 150);
});

test('a dense snow-belt city: sedans and hatchbacks, cabs, never a convertible', () => {
  const F = fleetFor(pittsburgh), c = draw(F, 2000);
  assert.equal(F.region, 'city');
  assert.ok(c.hatch > 200 && c.sedan > 300 && c.taxi > 50, JSON.stringify(c));
  assert.equal(c.convertible || 0, 0);
});

test('a mid-density town is suburbs: SUVs, sedans, minivans and pickups', () => {
  const F = fleetFor({ id: 'us-3900000', name: 'Somewhere, OH', density: 0.5, frame: { lat0: 39.9 }, places: {} }), c = draw(F, 2000);
  assert.equal(F.region, 'suburbs');
  assert.ok(c.suv > 300 && c.sedan > 250 && c.minivan > 100 && c.pickup > 120, JSON.stringify(c));
});

test('the same town always draws the same fleet; parked cars are never cabs', () => {
  const a = fleetFor(pittsburgh), b = fleetFor(pittsburgh);
  assert.deepEqual(draw(a, 200), draw(b, 200));
  const ra = a.random('paint'), rb = b.random('paint');
  for (let i = 0; i < 50; i++) assert.equal(a.paint('van', ra), b.paint('van', rb));
  assert.equal(draw(a, 1000, true).taxi || 0, 0);
  assert.ok(a.parked > 0 && a.parked <= 26);
});

test('every kind of the fleet is a sheet the Story Kit builds, no real maker named', () => {
  for (const k of KINDS) {
    assert.ok(SHEETS[k], `a sheet for ${k}`);
    assert.ok(NOUN[k], `a prompt noun for ${k}`);
    const { ok, problems } = checkSheet(sheetFor(k, '#3a4a5c'));
    assert.ok(ok, `${k}: ${problems.join('; ')}`);
  }
  assert.equal(sheetFor('nonsense', '#ffffff').id, 'jack-sedan');
});
