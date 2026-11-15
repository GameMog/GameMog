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

// ---- the ready-made cars (cities/sf/js/fleet-data.js, fleet-models.js; assets/vehicles/fleet) ----
import { createHash } from 'node:crypto';
import { MODEL_SHEETS } from '../wagmi/jack-sheets.js';
const dataSrc = readFileSync(new URL('../cities/sf/js/fleet-data.js', import.meta.url), 'utf8');
const NYCD = {}; vm.runInNewContext(dataSrc, { window: { NYC: NYCD } });
const FD = NYCD.FLEET_DATA;
const fleetWith = (PKG) => vm.runInNewContext(`${block}\nFLEET;`, {
  window: { NYC: { PKG, Fleet: { data: FD } } }, BODY_SPECS: Object.fromEntries(KINDS.map((k) => [k, {}])), DENSITY: PKG ? PKG.density ?? 1 : 1,
});
const share = (F, c) => { const n = Object.values(c).reduce((a, b) => a + b, 0); return Object.entries(c).filter(([k]) => FD.models[k] && FD.models[k].group === 'sports').reduce((a, [, v]) => a + v, 0) / n; };

test('the ready-made fleet: every model of the mixes is in the data, its stand-in a body kind', () => {
  assert.ok(FD && Object.keys(FD.models).length >= 16);
  for (const [id, m] of Object.entries(FD.models)) {
    assert.ok(KINDS.includes(m.proc) || m.proc === 'bus', `${id}: its stand-in ${m.proc}`);
    for (const k of ['length', 'width', 'height', 'axle', 'zF', 'zR']) assert.ok(Number.isFinite(m[k]) && Math.abs(m[k]) < 12, `${id}.${k}`);
    assert.ok(m.wheels.front.r > 0.2 && m.wheels.front.r < 0.7 && m.wheels.front.z > 0 && m.wheels.rear.z < 0, `${id} wheels`);
    assert.ok(m.zF > 0 && m.zR < 0 && m.length > 2.5, `${id}: the nose to +z, the origin between the axles`);
  }
});

test('the ready-made fleet is mainly sports cars: over half in a resort, a city or the suburbs, 35% or more in the country', () => {
  const bal = fleetWith(balHarbour), pit = fleetWith(pittsburgh), oke = fleetWith(okemah);
  const sub = fleetWith({ id: 'us-3900000', name: 'Somewhere, OH', density: 0.5, frame: { lat0: 39.9 }, places: {} });
  assert.ok(bal.models && bal.region === 'resort' && pit.region === 'city' && oke.region === 'rural' && sub.region === 'suburbs');
  const s = (F) => share(F, draw(F, 4000));
  const p = (F) => share(F, draw(F, 4000, true));
  for (const [name, F, min] of [['resort', bal, 0.5], ['city', pit, 0.5], ['suburbs', sub, 0.5], ['rural', oke, 0.35]]) {
    assert.ok(s(F) >= min + 0.02 && s(F) < 0.7, `${name} traffic ${s(F)}`);
    assert.ok(p(F) >= min + 0.02 && p(F) < 0.75, `${name} parked ${p(F)}`);
  }
  // (the snow belt and the pickup states too)
  for (const PKG of [{ id: 'us-5600000', name: 'Somewhere, WY', density: 0.5, frame: { lat0: 42.8 }, places: {} }, { id: 'us-4200000', name: 'Somewhere, PA', density: 0.5, frame: { lat0: 41 }, places: {} }]) {
    const F = fleetWith(PKG); assert.ok(s(F) >= 0.5, `${PKG.name} ${s(F)}`);
  }
  // (the snow belt: no open car; parked: no cab, no fire truck, ambulance, garbage or tow truck)
  assert.equal(draw(pit, 2000).roadster00 || 0, 0);
  const parked = draw(bal, 2000, true);
  for (const k of ['taxi75', 'taxi20', 'ambulance', 'firetruck', 'garbage', 'tow']) assert.equal(parked[k] || 0, 0, k);
  // (the same town, the same fleet)
  assert.deepEqual(draw(fleetWith(balHarbour), 300), draw(fleetWith(balHarbour), 300));
});

test('a taken ready-made car: its class sheet (the brand rule), a generic name, the model it wears', () => {
  for (const id of Object.keys(FD.models)) {
    if (/^(police|bus|schoolbus)/.test(id) || FD.models[id].group === 'bus' || FD.models[id].group === 'police') continue;
    assert.ok(MODEL_SHEETS[id], `a sheet for ${id}`);
    const sh = sheetFor(id, '#b3121a');
    assert.equal(sh.fleet, id);
    const { fleet, ...plain } = sh;
    const { ok, problems } = checkSheet(plain);
    assert.ok(ok, `${id}: ${problems.join('; ')}`);
    assert.match(NOUN[id], /^[a-zA-Z ]+$/);
    // (never the model's own name)
    assert.ok(!/saba|hazer|tiara|duke|kiri|ace|negotiator|urban|shvan|conquer|canyon|illinois|lct|jdm/i.test(NOUN[id] + ' ' + sh.label), `${id}: ${NOUN[id]} / ${sh.label}`);
  }
});

test('the fleet files are the ones fleet.json lists (sha256)', () => {
  const man = JSON.parse(readFileSync(new URL('../assets/vehicles/fleet/fleet.json', import.meta.url), 'utf8'));
  for (const [f, { sha256 }] of Object.entries(man.files)) {
    const got = createHash('sha256').update(readFileSync(new URL('../assets/vehicles/fleet/' + f, import.meta.url))).digest('hex');
    assert.equal(got, sha256, f);
  }
  for (const [id, m] of Object.entries(FD.models)) assert.ok(man.files[m.file], `${id}: ${m.file} listed`);
  for (const m of Object.values(man.models)) assert.ok(m.licence === 'CC-BY-4.0' && /^https:\/\/sketchfab\.com\/3d-models\/[0-9a-f]{32}$/.test(m.source) && m.creator && /^[0-9a-f]{64}$/.test(m.sourceSha256), m.file);
});
