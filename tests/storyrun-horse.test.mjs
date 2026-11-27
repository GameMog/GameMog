// A horse alongside the car (wagmi/game.js the two rides, wagmi/storyrun runner.js rideFor, STEPS.ride / mount): which
// worlds get one, the ride step's check, which ride each step wants, the ride's words, and the hometown test world.
//   node --test tests/storyrun-horse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?city=sf&pack=x');
const { check, STEP_KINDS, HORSE_STEPS, horseAlongOf } = await import('../wagmi/storyrun/pack.js');
const { rideWanted, yours, HORSE_WANT, CAR_WANT } = await import('../wagmi/storyrun/rides.js');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

// a San Francisco world with a car (the roadster) and a ride on the horse alongside it
function carWorld() {
  const w = read('tools/storyrun/test-packs/sf-steps.json');
  w.car = 'roadster';
  w.missions[0].vehicle = 'roadster';
  w.missions[0].steps = [
    { type: 'drive', to: '@steuart', objective: 'Drive to **Market & Spear**.' },
    { type: 'mount', at: '@steuart', objective: 'Get up on **Ranger**{blue}.' },
    { type: 'ride', to: '@arena', objective: 'Ride to **Market & Main**.' },
    { type: 'dismount' },
    { type: 'drive', to: '@camp' },
  ];
  return w;
}

test('the ride step is a kind, and mount and ride are the horse steps', () => {
  assert.ok(STEP_KINDS.has('ride') && STEP_KINDS.has('mount') && STEP_KINDS.has('dismount'));
  assert.deepEqual([...HORSE_STEPS].sort(), ['mount', 'ride']);
});

test('a car world with a mount or a ride gets a horse alongside; a horse world or a world without them does not', () => {
  assert.deepEqual(horseAlongOf(carWorld()), { label: 'Ranger' });
  const named = carWorld(); named.horse = { name: 'Dusty' };
  assert.deepEqual(horseAlongOf(named), { label: 'Dusty' });
  // (a name that is not a plain name falls back to Ranger: it is shown on the HUD)
  const odd = carWorld(); odd.horse = { name: '<b>x</b>' };
  assert.deepEqual(horseAlongOf(odd), { label: 'Ranger' });
  // (SF 2040's own: the car IS the horse)
  assert.equal(horseAlongOf(read('tools/storyrun/test-packs/sf2040.json')), null);
  assert.equal(horseAlongOf(read('tools/storyrun/test-packs/sf-steps.json')), null);
  // (Mog City's own test worlds: no horse at all)
  assert.equal(horseAlongOf(read('tools/storyrun/test-packs/native.json')), null);
  assert.equal(horseAlongOf(read('tools/storyrun/test-packs/tow.json')), null);
  // (a ride inside a step's `during` counts too; a world that names its horse but never rides one still gets him)
  const inner = carWorld(); inner.missions[0].steps = [{ type: 'drive', to: '@camp', during: [{ type: 'ride', to: '@arena' }] }];
  assert.deepEqual(horseAlongOf(inner), { label: 'Ranger' });
  const only = read('tools/storyrun/test-packs/native.json'); only.horse = { name: 'Biscuit' };
  assert.deepEqual(horseAlongOf(only), { label: 'Biscuit' });
});

test('a world with a ride passes the checks; a ride to nowhere or a bad horse is refused', () => {
  assert.deepEqual(check(carWorld()), []);
  const many = carWorld(); many.missions[0].steps[2].to = ['@arena', '@camp'];
  assert.deepEqual(check(many), []);
  const none = carWorld(); delete none.missions[0].steps[2].to;
  assert.ok(check(none).some((e) => /\bto\b/.test(e)), 'a ride needs a place');
  const bad = carWorld(); bad.missions[0].steps[2].to = 'arena';
  assert.ok(check(bad).some((e) => /\bto\b/.test(e)));
  const long = carWorld(); long.horse = { name: 'x'.repeat(30) };
  assert.ok(check(long).some((e) => /horse/.test(e)));
  const arr = carWorld(); arr.horse = ['Dusty'];
  assert.ok(check(arr).some((e) => /horse/.test(e)));
});

test('which ride each step wants', () => {
  for (const t of ['mount', 'ride']) assert.equal(rideWanted({ type: t }), 'horse', t);
  for (const t of ['drive', 'stops', 'tail', 'pursuit', 'tow', 'convoy', 'passenger']) assert.equal(rideWanted({ type: t }), 'car', t);
  for (const t of ['say', 'walk', 'fight', 'search', 'cutscene', 'dismount', 'collect', 'call', 'wait']) assert.equal(rideWanted({ type: t }), null, t);
  assert.equal(rideWanted(null), null);
  for (const k of HORSE_WANT) assert.ok(!CAR_WANT.has(k));
});

test("a ride's name starts a line: Your truck, The Ranch Truck, Dusty", () => {
  assert.deepEqual(yours('truck'), ['Your ', { truck: 'blue' }]);
  assert.deepEqual(yours('The Ranch Truck'), [{ 'The Ranch Truck': 'blue' }]);
  assert.deepEqual(yours('the old pickup'), [{ 'The old pickup': 'blue' }]);
  assert.deepEqual(yours('Dusty'), [{ Dusty: 'blue' }]);
  assert.deepEqual(yours('Old Black'), ['Your ', { 'Old Black': 'blue' }]);
  assert.deepEqual(yours(''), ['Your ', { ride: 'blue' }]);
});

test('the hometown test world: drive, mount, ride (down Main Street), dismount, drive, on Dusty alongside the ranch truck', () => {
  const w = read('tools/storyrun/test-packs/horse-town.json');
  assert.equal(w.city, 'hometown');
  assert.ok(w.car.sheet && w.car.sheet.family === 'car4');
  assert.deepEqual(horseAlongOf(w), { label: 'Dusty' });
  const kinds = w.missions[0].steps.map((s) => s.type).filter((k) => k !== 'say');
  assert.deepEqual(kinds, ['drive', 'mount', 'ride', 'ride', 'dismount', 'drive']);
  assert.equal(w.missions[0].steps.find((s) => s.type === 'mount').at, '@bogert');
  // (no brand, no person's likeness: Mog City's own Dan as the rider)
  assert.equal(w.cast[w.hero].model, 'mogcity/dan');
});
