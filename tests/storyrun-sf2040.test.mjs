// The story runner's SF 2040 steps (wagmi/storyrun): creature fights and bosses, collect, mount / dismount, herds, the
// horse as a world's ride, and the SF 2040 world that uses them, on a San Francisco page (?city=sf).
//   node --test tests/storyrun-sf2040.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?city=sf&pack=x');
const { check, STEP_KINDS, MODEL_CARS, CREATURES, creatureStep } = await import('../wagmi/storyrun/pack.js');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

test('the new step kinds and the horse are known', () => {
  for (const k of ['collect', 'mount', 'dismount', 'herd', 'fight']) assert.ok(STEP_KINDS.has(k), k);
  assert.ok(MODEL_CARS.has('mogcity/horse') && MODEL_CARS.has('mogcity/gt'));
  assert.deepEqual([...CREATURES].sort(), ['creature-ape', 'creature-centaur', 'creature-knight', 'creature-mech', 'creature-ogre', 'creature-scorpion', 'creature-trex']);
});

test('SF 2040 and the San Francisco test worlds pass the checks', () => {
  for (const f of ['tools/storyrun/test-packs/sf2040.json', 'tools/storyrun/test-packs/sf-steps.json', 'tools/storyrun/test-packs/sf-smoke.json', 'tools/storyrun/test-packs/sf-apocalypse.json']) assert.deepEqual(check(read(f)), [], f);
});

test('SF 2040: five missions or more, four bosses, food and medicine, Ranger, the post-impact city', () => {
  const w = read('tools/storyrun/test-packs/sf2040.json');
  assert.equal(w.title, 'SF 2040'); assert.equal(w.city, 'sf'); assert.ok(w.dressing.apocalypse);
  assert.equal(w.car.model, 'mogcity/horse');
  assert.ok(w.missions.length >= 5);
  const steps = w.missions.flatMap((m) => m.steps);
  const bosses = steps.filter((s) => s.type === 'fight' && s.boss).map((s) => s.boss.name);
  assert.deepEqual(bosses, ['The Brood Mother', 'Old Silver', 'WARDEN-7', 'The Matriarch']);
  assert.ok(steps.every((s) => s.type !== 'fight' || !s.boss || s.boss.hold), 'every boss waits in its lair');
  const kinds = new Set(steps.filter((s) => s.type === 'collect').map((s) => s.kind));
  assert.ok(kinds.has('food') && kinds.has('medicine'));
  assert.ok(w.opening && w.opening.shots.length >= 6);
  // (no music: the world names none; the park the asteroid broke open is the Presidio's Bio-Preserve)
  const text = JSON.stringify(w).toLowerCase();
  assert.ok(!/music|soundtrack/.test(text));
  assert.ok(text.includes('bio-preserve'));
});

test('creature fights, collects and herds are refused when they are wrong', () => {
  const w = read('tools/storyrun/test-packs/sf-steps.json');
  const bad = (f) => { const x = structuredClone(w); f(x); return check(x); };
  const fight = (x) => x.missions[0].steps.find((s) => s.type === 'fight' && s.boss);
  const coll = (x) => x.missions[0].steps.find((s) => s.type === 'collect');
  assert.ok(bad((x) => { fight(x).boss.id = 'creature-dragon'; }).some((e) => /no creature creature-dragon/.test(e)));
  assert.ok(bad((x) => { fight(x).foes = [{ id: 'creature-knight', count: 9 }]; }).some((e) => /fight at once/.test(e)));
  assert.ok(bad((x) => { fight(x).boss.hold = { wake: -3 }; }).some((e) => /hold/.test(e)));
  assert.ok(bad((x) => { fight(x).boss.phases = [1.5]; }).some((e) => /phases/.test(e)));
  assert.ok(bad((x) => { coll(x).items = []; }).some((e) => /items/.test(e)));
  assert.ok(bad((x) => { coll(x).items[0] = 'nowhere'; }).some((e) => /items\[0\]/.test(e)));
  assert.ok(bad((x) => { coll(x).need = 99; }).some((e) => /need/.test(e)));
  assert.ok(bad((x) => { coll(x).look = 'barrel'; }).some((e) => /look/.test(e)));
  assert.ok(bad((x) => { coll(x).color = 'red'; }).some((e) => /colour/.test(e)));
  // (New York's fights are men: a creature in a New York world is refused)
  assert.ok(creatureStep({ type: 'fight', arena: '@x', foes: ['creature-ogre'] }, 'ny').some((e) => /San Francisco only/.test(e)));
  assert.ok(creatureStep({ type: 'herd', at: [0, 0] }, 'ny').some((e) => /San Francisco only/.test(e)));
  // (a fight of men is untouched by any of it)
  assert.deepEqual(creatureStep({ type: 'fight', arena: '@x', enemies: ['a', 'b'] }, 'ny'), []);
});
