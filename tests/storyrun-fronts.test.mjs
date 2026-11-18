// A story's diner dressed as one (wagmi/storyrun/fronts.js, 17 Nov: Colter Land's Copper Spur was a plain office block's
// ground floor): the sign's words from the place's own name, and the runner building the front only for a world that
// has a diner among its places.
//   node --test tests/storyrun-fronts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../wagmi/storyrun/fronts.js', import.meta.url), 'utf8');
const IDX = readFileSync(new URL('../wagmi/storyrun/index.js', import.meta.url), 'utf8');
const a = SRC.indexOf('export function dinerSign'), b = SRC.indexOf('\n}\n', a) + 3;
const dinerSign = new Function(SRC.slice(a, b).replace('export ', '') + '\nreturn dinerSign;')();

test('the sign says the place\'s own name, the trade on a line of its own', () => {
  assert.deepEqual(dinerSign('the Copper Spur diner'), ['COPPER SPUR', 'DINER']);
  assert.deepEqual(dinerSign('Diner on Fifth'), ['ON FIFTH', 'DINER']);
  assert.deepEqual(dinerSign('the diner'), ['DINER', '']);
  assert.deepEqual(dinerSign(''), ['DINER', '']);
  assert.ok(dinerSign('the Very Long Name Of A Roadside Place diner')[0].length <= 22);
});

test('only a world with a diner among its places gets a front; it is built where the building stands, never failing the story', () => {
  assert.match(IDX, /some\(\(a\) => \/\\bdiner\\b\/i\.test\(String\(a\?\.name \|\| ''\)\)\)/);
  assert.match(IDX, /W\.storyrun\.fronts = FR\.createFronts\(W, def, places\)/);
  assert.match(IDX, /catch \(e\) \{ console\.warn\('\[storyrun\] fronts', e\); W\.storyrun\.fronts = null; \}/);
  // (its parts: the stainless skirt, the windows with the room behind, the door, the awning, the neon with its name)
  for (const part of ['the stainless skirt', 'the windows: the room behind', 'the door:', 'the awning over the windows', 'the neon over the fascia']) assert.ok(SRC.includes(part), part);
  // (nothing it adds collides or is a brand: no colliders pushed, the words the world's own)
  assert.doesNotMatch(SRC, /colliders\.push|addCollider/);
});
