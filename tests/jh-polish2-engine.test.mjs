// Jensen Heist's polish list, batch 2 (21 Nov), the engine's part: A4 a call coming up on the car's screen mid-drive no
// longer builds its office's draw objects on that frame (sets.js pool() primes it, vcall-draw.js prime()); A7 a story
// set's own grade for its frame (the keynote stage takes the street's warm-highlight split down); B5 a phone's ring is
// RING_SECS at most and running out answers it, never declines it; B6 a Hometown story town's blocks near the story's
// places walk busier (wagmi/street/crowd.js STORY). A6 is in tests/damage-look.test.mjs.
//   node --test tests/jh-polish2-engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');

test('B5: a ring is RING_SECS at most, a pack\'s shorter ring kept, never under RING_MIN; running out answers it', () => {
  const r = src('wagmi/storyrun/runner.js');
  const m = /export const RING_SECS = ([\d.]+), RING_MIN = ([\d.]+);/.exec(r);
  assert.ok(m); const RING_SECS = +m[1], RING_MIN = +m[2];
  assert.ok(RING_SECS <= 4 && RING_MIN >= 1);
  const line = r.split('\n').find((l) => /^\s+function ringSecs\(d\)/.test(l));
  const ringSecs = new Function('RING_SECS', 'RING_MIN', line.trim() + '\nreturn ringSecs;')(RING_SECS, RING_MIN);
  assert.equal(ringSecs({}), RING_SECS);
  assert.equal(ringSecs({ ring: 8 }), RING_SECS);
  assert.equal(ringSecs({ ring: 6 }), RING_SECS);
  assert.equal(ringSecs({ ring: 3 }), 3);
  assert.equal(ringSecs({ ring: 0.2 }), RING_MIN);
  assert.equal(ringSecs({ ring: 'x' }), RING_SECS);
  // (both rings: a phone's and a call waiting's. No ring runs out into a decline: only a key's `answer = false`)
  const call = r.slice(r.indexOf('  STEPS.call = async'), r.indexOf('  async function voicemail('));
  assert.equal((call.match(/const rs = ringSecs\(d\);/g) || []).length, 2);
  assert.equal((call.match(/if \(answer == null\) answer = true;/g) || []).length, 2);
  assert.doesNotMatch(call, /d\.ring \|\| 8/);
  assert.doesNotMatch(call, /answer == null && ctx\.flags\.autoAnswer/);
  // (the declined count only after a pressed X or N)
  assert.equal((call.match(/answer = false;/g) || []).length, 2);
});

test('B6: a Hometown story town\'s blocks near the story\'s places walk as busy blocks, STORY.K times over', async () => {
  const c = src('wagmi/street/crowd.js');
  const m = /export const STORY = Object\.freeze\(\{ R: (\d+), K: ([\d.]+) \}\);/.exec(c);
  assert.ok(m); const R = +m[1], K = +m[2];
  assert.ok(R >= 100 && R <= 250 && K > 1 && K <= 2);
  assert.match(c, /const perM = \(b\) => \(busy\(b\) \|\| story\(b\) > 1 \? PER_M\.busy : PER_M\.quiet\) \* story\(b\) \* \(world\.crowd \?\? 1\)/);
  assert.match(c, /const cw = near\.reduce\(\(s, n\) => s \+ \(busy\(n\.b\) \|\| story\(n\.b\) > 1 \? n\.w : 0\), 0\);/);
  // (story() itself, run over two places: a block 100 m from one is K, one 400 m off 1; New York's or SF's always 1)
  const a = c.indexOf('  let spots = null;'), b = c.indexOf('  // (a metre of this block');
  const mk = (TOWN, places) => new Function('W', 'STORY', 'TOWN', c.slice(a, b) + '\nreturn story;')({ storyrun: { places } }, { R, K }, TOWN);
  const P = { aliases: { arena: {}, market: {} }, at: (r) => (r === '@arena' ? { x: 0, z: 0 } : { x: 1000, z: 0 }) };
  const story = mk(true, P);
  assert.equal(story({ cx: 100, cz: 0 }), K);
  assert.equal(story({ cx: 400, cz: 0 }), 1);
  assert.equal(story({ cx: 1050, cz: 30 }), K);
  assert.equal(mk(false, P)({ cx: 0, cz: 0 }), 1);
  // (no story yet: 1, and asked again once it has its places)
  const late = { aliases: {}, at: P.at }, s2 = mk(true, late);
  assert.equal(s2({ cx: 0, cz: 0 }), 1);
  late.aliases = P.aliases;
  assert.equal(s2({ cx: 10, cz: 0 }), K);
});
