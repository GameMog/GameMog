// The car a story's creator picked (GameMog's Create, the optional Car dropdown; wagmi/fleet-picks.js): every name GameMog
// offers is a player-drivable model of the town fleet, sports cars first; the hero's sheet for a pick is the model's own
// (it drives as that model), wears the model, keeps the story's name and paint; an unknown name is no pick; and the
// hero car block (wagmi/game.js) and the world loader (wagmi/storyrun/pack.js) use it, a story's own car the fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FLEET_PICKS, fleetPickOf, pickedFleetSheet, TOW_CLASSES } from '../wagmi/fleet-picks.js';
import { MODEL_SHEETS } from '../wagmi/jack-sheets.js';
import { checkSheet, TOW_CLASSES as SHEET_TOW } from '../wagmi/storyrun/vehicles/sheet.js';

const NYCD = {}; vm.runInNewContext(readFileSync(new URL('../cities/sf/js/fleet-data.js', import.meta.url), 'utf8'), { window: { NYC: NYCD } });
const FD = NYCD.FLEET_DATA;
// (GameMog storykit/pack/hero-cars.mjs HERO_CARS, in its order: the two lists are one contract)
const GAMEMOG = ['gt-coupe', 'muscle-car', 'roadster', 'sports-car', 'sports-coupe', 'supercar', 'sedan', 'old-sedan', 'hatchback', 'city-car', 'suv', 'minivan', 'pickup', 'van', 'crossover', 'compact-pickup', 'four-by-four'];
const SPORTS = new Set(['gt-coupe', 'muscle-car', 'roadster', 'sports-car', 'sports-coupe', 'supercar']);

test('every name GameMog offers is a player-drivable fleet model, sports cars first, and no two names one model', () => {
  assert.deepEqual(Object.keys(FLEET_PICKS), GAMEMOG);
  const ids = Object.values(FLEET_PICKS);
  assert.equal(new Set(ids).size, ids.length);
  for (const [name, id] of Object.entries(FLEET_PICKS)) {
    const m = FD.models[id];
    assert.ok(m, `${name}: ${id} is in the fleet`);
    assert.ok(MODEL_SHEETS[id], `${name}: ${id} has a sheet`);
    assert.equal(m.livery, null, `${name}: no livery (no cab, no police car)`);
    assert.ok(!['service', 'bus', 'police', 'taxi'].includes(m.group), `${name}: not a service truck, bus, cab or police car`);
    assert.equal(m.group, SPORTS.has(name) ? 'sports' : 'everyday', `${name}: ${m.group}`);
  }
});

test('an unknown or missing name is no pick (today\'s car)', () => {
  for (const v of [undefined, null, '', 'gt83', 'GT-Coupe', 'hypercar', 42, {}, ['van'], '__proto__', 'constructor']) {
    assert.equal(fleetPickOf(v), null, String(v));
    assert.equal(pickedFleetSheet(v, { models: FD.models, sheets: MODEL_SHEETS }), null, String(v));
  }
});

test('a picked car: the model\'s own sheet wearing it, the story\'s name and paint, a valid Story Kit sheet', () => {
  for (const name of GAMEMOG) {
    const id = FLEET_PICKS[name];
    const sh = pickedFleetSheet(name, { models: FD.models, sheets: MODEL_SHEETS, story: null, paint: '#2F63B8', label: 'Your car' });
    assert.equal(sh.fleet, id);
    assert.equal(sh.class, MODEL_SHEETS[id].class);
    assert.deepEqual(sh.handling, MODEL_SHEETS[id].handling);
    assert.equal(sh.label, 'Your car');
    assert.equal(sh.paint.base, '#2F63B8');
    const { fleet, ...plain } = sh;
    const { ok: good, problems } = checkSheet(plain);
    assert.ok(good, `${name}: ${problems.join('; ')}`);
  }
  // (the story's own sheet names the car and paints it; the picked model's body, class and handling win)
  const story = { v: 1, id: 'rides.night-cab', label: 'Ray\'s Coupe', noun: 'coupe', family: 'car4', class: 'taxi', paint: { base: '#E4B21C', finish: 'gloss' }, handling: { pace: -1 } };
  const sh = pickedFleetSheet('gt-coupe', { models: FD.models, sheets: MODEL_SHEETS, story, paint: '#111214' });
  assert.equal(sh.fleet, 'gt83');
  assert.equal(sh.label, 'Ray\'s Coupe');
  assert.deepEqual(sh.paint, { base: '#E4B21C', finish: 'gloss' });
  assert.equal(sh.class, 'coupe');
  assert.deepEqual(sh.handling, MODEL_SHEETS.gt83.handling);
  // (no paint anywhere: the model's own)
  assert.equal(pickedFleetSheet('van', { models: FD.models, sheets: MODEL_SHEETS }).paint.base, FD.models.van92.paint);
  // (the story's abilities ride along: a pickup keeps its tow and ram, a car drops a tow it has no rig for, thrusters never)
  const tow = { ...story, class: 'pickup', abilities: ['tow', 'ram', 'hop'] };
  const towed = pickedFleetSheet('pickup', { models: FD.models, sheets: MODEL_SHEETS, story: tow });
  assert.deepEqual(towed.abilities, ['tow', 'ram']);
  { const { fleet, ...plain } = towed; const r = checkSheet(plain); assert.ok(r.ok, r.problems.join('; ')); }
  assert.deepEqual(pickedFleetSheet('sedan', { models: FD.models, sheets: MODEL_SHEETS, story: tow }).abilities, ['ram']);
  assert.equal(pickedFleetSheet('sedan', { models: FD.models, sheets: MODEL_SHEETS, story: { ...story, abilities: ['tow', 'dash'] } }).abilities, MODEL_SHEETS.sedan10.abilities);
  assert.equal(sh.id, 'fleet-pick-gt83');
  assert.deepEqual([...TOW_CLASSES], [...SHEET_TOW]);
  // (a model missing from the data: no pick)
  assert.equal(pickedFleetSheet('van', { models: {}, sheets: MODEL_SHEETS }), null);
});

test('the hero car block takes a pick first in a town, before the story\'s own car and the town\'s default; the loader reads fleetCar', () => {
  const game = readFileSync(new URL('../wagmi/game.js', import.meta.url), 'utf8');
  const pick = game.indexOf('const PICK ='), dflt = game.indexOf("if (!heroSheet && !horseRs && window.NYC?.CITY === 'pkg'"), ride = game.indexOf("RIDE.buildSheetCar(THREE, heroSheet || PACK.sheetCar)");
  assert.ok(pick > 0 && dflt > pick && ride > dflt, 'the pick, then the default, then the sheet car built from heroSheet first');
  assert.match(game.slice(pick, dflt), /window\.NYC\?\.CITY === 'pkg'/);
  assert.match(game.slice(pick, dflt), /PACK\.fleetCar/);
  const pack = readFileSync(new URL('../wagmi/storyrun/pack.js', import.meta.url), 'utf8');
  assert.match(pack, /W\.fleetCar = fleetPickOf\(def\.fleetCar\) \? def\.fleetCar : null;/);
});

// (Mog City, Hometown: a story's own pickup or SUV wears the fleet's full-size model of its class, 16 Nov)
import { RIDE_MODELS, rideFleetOf } from '../wagmi/fleet-picks.js';
test('a story\'s own pickup or SUV wears the fleet\'s full-size one; other classes, a picked car or another family keep theirs', () => {
  for (const [cls, id] of Object.entries(RIDE_MODELS)) {
    assert.ok(FD.models[id] && FD.models[id].cls === cls, `${cls}: ${id}`);
    assert.equal(rideFleetOf({ v: 1, id: 'rides.x', class: cls, family: 'car4' }), id);
    assert.equal(rideFleetOf({ v: 1, id: 'rides.x', class: cls }), id);
  }
  assert.equal(FLEET_PICKS.pickup, 'pickup20');
  assert.equal(FLEET_PICKS.suv, 'suv20');
  // (every model a story's car or a creator's pick may wear takes its paint: the full-size SUV too, never forced black)
  for (const id of [...new Set([...Object.values(RIDE_MODELS), 'offroad20'])]) assert.equal(FD.models[id].paintable, true, `${id} paintable`);
  // (the smaller two keep their own names when picked)
  assert.equal(pickedFleetSheet('crossover', { models: FD.models, sheets: MODEL_SHEETS }).label, 'Crossover');
  assert.equal(pickedFleetSheet('compact-pickup', { models: FD.models, sheets: MODEL_SHEETS }).label, 'Compact Pickup');
  for (const s of [null, undefined, 'pickup', {}, { class: 'sedan' }, { class: 'van' }, { class: 'wrecker' }, { class: 'pickup', fleet: 'pickup89' }, { class: 'suv', family: 'moto' }, { class: '__proto__' }]) assert.equal(rideFleetOf(s), null, JSON.stringify(s));
  // (the feed truck of the owner's Colter Land: its own name, paint, sound, handling and tow kept, the body the model's)
  const feed = { v: 1, id: 'rides.feed-truck', label: 'Grandpa\'s Feed Truck', noun: 'truck', family: 'car4', class: 'pickup', era: 1978, paint: { base: '#8E2A22', finish: 'satin' }, abilities: ['ram', 'tow'] };
  assert.equal(rideFleetOf(feed), 'pickup20');
  const RIDE = readFileSync(new URL('../wagmi/storyrun/ride.js', import.meta.url), 'utf8');
  assert.match(RIDE, /const sheet = rideSheet\(sheet0\);/);
  assert.match(RIDE, /if \(fleetModelReady\(id\)\) return \{ \.\.\.sheet, fleet: id \};/);
  // (a sheet car's heel x is the feet's spread either side of the hip, as the roadster's: never the hip's own x again)
  assert.match(RIDE, /rs\.seat\.heel = rs\.seat\.heel \|\| \[0\.11, f\[1\], f\[2\] - 0\.2\];/);
  const GAME = readFileSync(new URL('../wagmi/game.js', import.meta.url), 'utf8');
  assert.match(GAME, /for \(const r of rides\) \{ const id = rideFleetOf\(r\); if \(id && F\.data\.models\[id\]\) F\.load\(id\)\.catch\(\(\) => \{\}\); \}/);
});
