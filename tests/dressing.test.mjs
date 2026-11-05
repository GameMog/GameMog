// The story runner's set dressing (wagmi/storyrun/dressing.js): what a world's dressing may say, and that the city is
// dressed only when the world asks (a world without a dressing, or one in the clear, is the city as it is).
//   node --test tests/dressing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?pack=x');
const { check, asksDressing, BLACKOUTS } = await import('../wagmi/storyrun/pack.js');
const world = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs', name), 'utf8'));

test('a world asks for the dressing only by its own words', () => {
  assert.equal(asksDressing(undefined), false);
  assert.equal(asksDressing(null), false);
  assert.equal(asksDressing({ time: 'midnight', season: 'winter', weather: 'clear', holiday: [] }), false);
  assert.equal(asksDressing({ time: 'midnight', season: 'autumn', weather: 'fog', holiday: ['halloween'] }), false);
  assert.equal(asksDressing({ weather: 'overcast' }), false);
  assert.equal(asksDressing({ blackout: 'brooklyn' }), false);
  for (const b of BLACKOUTS) assert.equal(asksDressing({ blackout: b }), true);
  assert.equal(asksDressing({ holiday: ['christmas'] }), true);
  for (const w of ['snow', 'rain', 'storm']) assert.equal(asksDressing({ weather: w }), true);
});

test('the shipped worlds and the plain test worlds ask for none of it', () => {
  for (const f of ['native.json', 'dressing-night.json', 'dressing-day.json', 'dressing-dusk.json']) {
    const w = world(f);
    assert.deepEqual(check(w), [], f);
    assert.equal(asksDressing(w.dressing), false, f);
  }
  const own = JSON.parse(fs.readFileSync(path.join(ROOT, 'packs/mog-city.json'), 'utf8'));
  assert.equal(asksDressing(own.dressing), false);
});

test('the dressing test worlds pass the check and ask for their look', () => {
  for (const [f, want] of [['dressing-blackout.json', 'midtown'], ['dressing-christmas.json', 'christmas'], ['dressing-snow.json', 'snow'], ['dressing-rain.json', 'rain'], ['dressing-xmasday.json', 'christmas']]) {
    const w = world(f);
    assert.deepEqual(check(w), [], f);
    assert.equal(asksDressing(w.dressing), true, f);
    assert.ok(JSON.stringify(w.dressing).includes(want), f);
  }
});

test('a dressing outside its words is refused', () => {
  const base = world('dressing-night.json');
  const bad = (dressing) => check({ ...base, dressing });
  assert.ok(bad({ ...base.dressing, blackout: 'brooklyn' }).some((e) => /dressing.blackout/.test(e)));
  assert.ok(bad({ ...base.dressing, weather: '<b>snow</b>' }).some((e) => /dressing.weather/.test(e)));
  assert.ok(bad({ ...base.dressing, holiday: 'christmas' }).some((e) => /dressing.holiday/.test(e)));
  assert.ok(bad({ ...base.dressing, holiday: [1] }).some((e) => /dressing.holiday/.test(e)));
  assert.ok(bad(['midnight']).some((e) => /dressing/.test(e)));
  assert.deepEqual(bad({ ...base.dressing, blackout: 'manhattan', holiday: ['christmas'], weather: 'snow' }), []);
});

test('the dressing is imported only when a world asks (index.js), never on the default path (game.js)', () => {
  const index = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/index.js'), 'utf8');
  assert.match(index, /if \(asksDressing\(def\.dressing\)\) \{\s*try \{ const D = await import\('\.\/dressing\.js'\)/);
  assert.equal((index.match(/dressing\.js/g) || []).length >= 1, true);
  const game = fs.readFileSync(path.join(ROOT, 'wagmi/game.js'), 'utf8');
  assert.doesNotMatch(game, /dressing/);
  for (const f of ['js/main.js', 'js/lighting.js', 'js/post-processing.js', 'js/street-details.js', 'index.html']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /storyrun\/dressing|createDressing/, f);
  }
});
