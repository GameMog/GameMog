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
