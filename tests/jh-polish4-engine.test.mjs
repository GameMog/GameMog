// Jensen Heist's polish list, batch 4 (22 Nov), the engine's part: A4 a call's pooled office compiled again for its tile
// as its call takes it (sets.js adopt(): the lights' cache key the office was compiled under is not the one it is drawn
// under by the call), and the GPS's walking graph built under a mission's card, not on its first drive's frame (gps.js
// warm(), runner.js prewarm()). The credits' map section is in tests/story-medals-credits.test.mjs.
//   node --test tests/jh-polish4-engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');

test('A4: a pooled office taken by its call is compiled for its tile again, by prepare(), before its picture comes up', () => {
  const sets = src('wagmi/storyrun/sets.js');
  const adopt = sets.slice(sets.indexOf('    adopt(key, id) {'), sets.indexOf('    pooled: (key) =>'));
  assert.match(adopt, /note\('adopt', key\);[\s\S]*S\.tileWarmed = false;/);
  // (prepare() warms a set whose tileWarmed is off for the tile's targets, not holding the loop for a feed)
  assert.match(sets, /if \(tile && app\.warm && !S\.tileWarmed\) \{ S\.tileWarmed = true; await tileWarm\(S, hold\); \}/);
  // (and vcall.js feed() adopts, then awaits prepare({ tile, hold: false }) before the picture is drawn)
  const vc = src('wagmi/storyrun/vcall.js');
  assert.match(vc, /S\.adopt\?\.\(poolKey\(video, who\), id\); await S\.prepare\(\{ \[id\]: feedDef\(video, who\) \}, \{ tile: true, hold: false \}\);/);
  // (a pool's own warm-up still marks it warmed: a pooled office is not compiled twice under the card)
  assert.match(sets, /S\.tileWarmed = true; await tileWarm\(S, hold\); \} \} catch \(e\) \{ console\.warn\('\[storyrun\] set pool'/);
});

test('A4: the GPS walking graph is built ahead, under the card (gps.warm), once a session', () => {
  const gps = src('wagmi/mission/gps.js');
  assert.match(gps, /warm\(\) \{ return walkGraph\(\)\.ms; \},/);
  // (built once: walkGraph() returns the one it has)
  assert.match(gps, /if \(walkG && !again\) return walkG;/);
  const runner = src('wagmi/storyrun/runner.js');
  const pw = runner.slice(runner.indexOf('  async function prewarm(from) {'), runner.indexOf('  async function poolFeeds(from) {'));
  assert.ok(pw.indexOf('gps.warm?.()') >= 0 && pw.indexOf('gps.warm?.()') < pw.indexOf('warmList('), 'first thing in prewarm, before the cast');
  assert.match(pw, /try \{ gps\.warm\?\.\(\); \} catch \(e\)/);
});
