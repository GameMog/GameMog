// Mog City: turn timing (wagmi/radio/turns.js playTurns), on a fake clock: the last line's written pause is kept, a
// line whose recording is not decoded yet waits for it and is held for its real length, the first line in person
// takes a breath first.
//   node --test tests/turns.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { playTurns, GAP, CLOSE } from '../wagmi/radio/turns.js';

// a scene's clock: sleep() moves it on at once; show() records when each line went up and for how long
function run(W, lines) {
  let t = 0; const shown = [];
  const sleep = async (ms) => { t += ms / 1000; };
  return playTurns(W, lines, { sleep, show: (L, i, secs) => { shown.push({ i, at: +t.toFixed(3), secs }); }, hide: () => shown.push({ hide: +t.toFixed(3) }) }).then(() => ({ shown, end: +t.toFixed(3) }));
}
const voice = (durs, extra = {}) => ({ voice: { has: (w, x) => x in durs, dur: (w, x) => durs[x] || 0, ...extra } });

test("the last line's written pause is kept, the subtitle up through it", async () => {
  const W = voice({ 'One.': 1, 'Two.': 2 });
  const { shown, end } = await run(W, [{ who: 'A', text: 'One.' }, { who: 'B', text: 'Two.', pause: 0.7 }]);
  // one (1 s), the quick reply's gap, two (2 s), then its 0.7 s, and only then the subtitle cleared
  assert.equal(shown[1].at, +(1 + GAP.quick).toFixed(3));
  assert.equal(end, +(1 + GAP.quick + 2 + 0.7).toFixed(3));
  assert.equal(shown.at(-1).hide, end);
});

test("the last line is held CLOSE s at least after its voice (none written)", async () => {
  const W = voice({ 'One.': 1, 'Two.': 2 });
  const { end } = await run(W, [{ who: 'A', text: 'One.' }, { who: 'B', text: 'Two.' }]);
  assert.equal(CLOSE, 0.6);
  assert.equal(end, +(1 + GAP.quick + 2 + CLOSE).toFixed(3));
});

test('a line whose clip is not decoded yet waits for its real length (no reading-time guess, nothing cut)', async () => {
  const durs = { 'A long clip from a world that nobody has decoded yet.': 0, 'Next.': 1 };
  let decodes = 0;
  const W = voice(durs, { decode: async (w, x) => { decodes++; await new Promise((r) => setTimeout(r, 20)); durs[x] = durs[x] || 5.2; return durs[x]; } });
  const { shown } = await run(W, [{ who: 'A', text: 'A long clip from a world that nobody has decoded yet.' }, { who: 'B', text: 'Next.' }]);
  assert.equal(shown[0].secs, 5.2);
  assert.ok(shown[1].at >= 5.2, `the next line waits the clip out (${shown[1].at})`);
  assert.ok(decodes >= 1);
});

test('the first line in person takes a breath first; none after it, none without a recording', async () => {
  let breaths = 0;
  const W = voice({ 'Hi.': 1, 'Hey.': 1 }, { breath: (w, x) => { breaths++; return x === 'Hi.' ? 0.2 : 0; } });
  const { shown } = await run(W, [{ who: 'A', text: 'Hi.' }, { who: 'B', text: 'Hey.' }]);
  assert.equal(shown[0].at, 0.2);
  assert.equal(breaths, 1);
});
