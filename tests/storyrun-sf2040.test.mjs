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
  for (const k of ['collect', 'mount', 'dismount', 'herd', 'fight', 'sneak', 'flee', 'drove', 'track']) assert.ok(STEP_KINDS.has(k), k);
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
  // (a boss either waits in its lair, or has been woken on purpose: the Brood Mother by the shop bell after the sneak,
  // the Matriarch by the chase that a flee hands to her fight)
  assert.ok(steps.every((s) => s.type !== 'fight' || !s.boss || s.boss.hold || s.boss.at || s.boss.from), 'every boss is placed');
  // (the last fight is waves, Deacon Vale's the last)
  const defend = steps.find((s) => s.id === 'defend');
  assert.equal(defend.waves.length, 3); assert.equal(defend.waves[2].boss.name, 'Deacon Vale');
  // (held from the saddle, a camp bar to keep, every wave from a place of its own)
  assert.ok(defend.saddle && defend.guard && defend.guard.hp > 0);
  assert.equal(new Set(defend.waves.map((x) => x.from)).size, 3);
  // (the Matriarch comes down the hill on his heels and is fought where the chase ends: the same creature)
  const run = steps.find((s) => s.type === 'flee'), mat = steps.find((s) => s.id === 'matriarch');
  assert.ok(run.keep && mat.boss.from === run.id);
  const kinds = new Set(steps.filter((s) => s.type === 'collect').map((s) => s.kind));
  assert.ok(kinds.has('food') && kinds.has('medicine'));
  assert.ok(w.opening && w.opening.shots.length >= 6);
  // (June's own body file is beside the world, and the cast's scale is checked)
  assert.ok(fs.existsSync(path.join(ROOT, w.cast.June.glb)));
  const x = structuredClone(w); x.cast.June.scale = 3; assert.ok(check(x).some((e) => /scale/.test(e)));
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

test('SF 2040: every mission has its own verb, a checkpoint, objectives, and the glue between them', () => {
  const w = read('tools/storyrun/test-packs/sf2040.json');
  const kinds = (m) => new Set(m.steps.map((s) => s.type));
  const by = Object.fromEntries(w.missions.map((m) => [m.id, m]));
  assert.ok(kinds(by.M2).has('sneak'), 'M2 sneaks');
  assert.ok(kinds(by.M3).has('drove'), 'M3 drives a herd');
  assert.ok(kinds(by.M4).has('timer') && kinds(by.M4).has('choice'), 'M4 a clock and the choice');
  assert.ok(kinds(by.M5).has('track') && kinds(by.M5).has('flee'), 'M5 tracks and flees');
  assert.ok(by.M6.steps.some((s) => s.waves), 'M6 holds the camp');
  for (const m of w.missions) {
    assert.ok(m.steps.some((s) => s.checkpoint), `${m.id} checkpoint`);
    for (const s of m.steps) if (['drive', 'collect', 'fight', 'sneak', 'flee', 'drove', 'track', 'search', 'walk'].includes(s.type)) assert.ok(s.objective, `${m.id} ${s.id || s.type} objective`);
  }
  // (the radio on the rides, and between the missions)
  assert.ok(w.missions.filter((m) => m.steps.some((s) => (s.during || []).some((x) => x.type === 'call'))).length >= 4);
  assert.ok(w.missions.slice(1).every((m) => m.between?.radio?.length), 'radio between missions');
  // (every speaker is in the cast, so the voice lane can find them)
  const speakers = new Set();
  const walk = (v) => { if (Array.isArray(v)) { if (v.length >= 2 && typeof v[0] === 'string' && typeof v[1] === 'string' && w.cast[v[0]]) speakers.add(v[0]); v.forEach(walk); } else if (v && typeof v === 'object') { if (v.who && v.text) speakers.add(v.who); Object.values(v).forEach(walk); } };
  walk(w.missions); walk(w.opening); walk(w.coda);
  for (const s of speakers) assert.ok(w.cast[s], `speaker ${s} in the cast`);
  assert.ok(w.coda && w.coda.shots.length >= 2, 'a post-credits coda');
});

test('the wild steps are refused when they are wrong', () => {
  const ok = { type: 'sneak', to: '@x', sleepers: [{ id: 'creature-scorpion', at: [0, 0] }] };
  assert.deepEqual(creatureStep(ok, 'sf'), []);
  assert.ok(creatureStep(ok, 'ny').some((e) => /San Francisco only/.test(e)));
  assert.ok(creatureStep({ ...ok, sleepers: [] }, 'sf').some((e) => /sleepers/.test(e)));
  assert.ok(creatureStep({ ...ok, sleepers: [{ id: 'creature-dragon' }] }, 'sf').some((e) => /no creature/.test(e)));
  assert.deepEqual(creatureStep({ type: 'flee', id: 'run', to: '@x', creature: { id: 'creature-trex' }, keep: true }, 'sf'), []);
  assert.ok(creatureStep({ type: 'flee', to: '@x', creature: { id: 'creature-trex' }, keep: true }, 'sf').some((e) => /keep/.test(e)));
  assert.ok(creatureStep({ type: 'flee', to: '@x', creature: 'creature-horse' }, 'sf').some((e) => /no creature/.test(e)));
  assert.ok(creatureStep({ type: 'drove', to: '@x' }, 'sf').some((e) => /herd/.test(e)));
  assert.ok(creatureStep({ type: 'track', at: 'nowhere' }, 'sf').some((e) => /at/.test(e)));
  const waves = { type: 'fight', arena: '@x', waves: [{ foes: ['creature-knight'] }, { boss: { id: 'creature-ogre' }, from: '@y' }] };
  assert.deepEqual(creatureStep(waves, 'sf'), []);
  assert.ok(creatureStep({ ...waves, waves: [{ foes: [{ id: 'creature-knight', count: 9 }] }] }, 'sf').some((e) => /fight at once/.test(e)));
  assert.ok(creatureStep({ ...waves, waves: [{}] }, 'sf').some((e) => /waves\[0\]/.test(e)));
  // (a coda is an opening's shape)
  const w = read('tools/storyrun/test-packs/sf2040.json');
  const x = structuredClone(w); x.coda = { shots: [] }; assert.ok(check(x).includes('coda'));
});

test('SF 2040 ships as one of the game\'s own worlds (packs/sf2040.json, the same world as the test pack, files under assets/)', () => {
  const a = fs.readFileSync(path.join(ROOT, 'packs/sf2040.json'), 'utf8'), b = fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/sf2040.json'), 'utf8');
  assert.equal(a, b);
  const w = JSON.parse(a);
  for (const c of Object.values(w.cast)) if (c.glb) { assert.ok(/^assets\//.test(c.glb), c.glb); assert.ok(fs.existsSync(path.join(ROOT, c.glb)), c.glb); }
});
