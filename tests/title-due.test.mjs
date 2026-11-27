// (jh-polish A8) A mission's title card due but not on yet keeps the car's prompt off: 'F · Get out' stood one frame as
// ST-8's Showtime slammed (the mission's ride module awaited between the last mission's tidy-up and the slam).
// wagmi/storyrun/runner.js sets W.titleDue (a deadline) as attempt() starts and clears it once the card is on (and in
// tidy()); wagmi/game.js cardUp counts it as a card up.
//   node --test tests/title-due.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const game = fs.readFileSync(ROOT + 'wagmi/game.js', 'utf8');
const runner = fs.readFileSync(ROOT + 'wagmi/storyrun/runner.js', 'utf8');

// game.js's cardUp, run with a page that has no card up
function makeCardUp(W, clock) {
  const src = game.match(/const CARD_TAIL = (\d+);\nlet cardAt = -1e9;\nconst cardUp = \(\) => \{[\s\S]*?\n\};/);
  assert.ok(src, 'cardUp in game.js');
  const document = { querySelector: () => null, body: { classList: { contains: () => false } } };
  const performance = { now: () => clock.t };
  return new Function('WAGMI', 'document', 'performance', "const CARDS_UP = '#x';\n" + src[0] + '\nreturn cardUp;')(W, document, performance);
}

test('A8: a title card due counts as a card up, and only until its deadline', () => {
  const W = {}, clock = { t: 10000 }, cardUp = makeCardUp(W, clock);
  assert.equal(cardUp(), false);
  W.titleDue = clock.t + 5000;
  clock.t += 16; assert.equal(cardUp(), true);
  // (the card lands: titleDue cleared; the tail keeps the prompt off a beat, then it may come back)
  W.titleDue = 0; clock.t += 16; assert.equal(cardUp(), true);
  clock.t += 700; assert.equal(cardUp(), false);
  // (a deadline passed, nothing landed: the prompts come back)
  W.titleDue = clock.t - 1; assert.equal(cardUp(), false);
});

test('A8: the runner sets titleDue before its first await and clears it once the card is up, and in tidy()', () => {
  const a = runner.indexOf('async function attempt(def, cp, act) {');
  assert.ok(a > 0);
  const body = runner.slice(a, runner.indexOf('host.tell(\'mission-start\'', a));
  const set = body.indexOf('W.titleDue = def.card !== false && !(cp && cp.from) ? performance.now() + TITLE_DUE : 0;');
  assert.ok(set > 0, 'set in attempt()');
  assert.ok(set < body.indexOf('await '), 'set before the first await (the ride module, the hour fade)');
  const slam = body.indexOf('action.slam({ kicker: kick, title: def.title }');
  const clear = body.indexOf('W.titleDue = 0;');
  assert.ok(slam > 0 && clear > slam, 'cleared after the card is shown');
  const tidy = runner.slice(runner.indexOf('function tidy() {'), runner.indexOf('async function attempt('));
  assert.match(tidy, /W\.titleDue = 0;/);
  assert.match(runner, /const TITLE_DUE = 5000;/);
  assert.match(game, /WAGMI\.titleDue > t\) cardAt = t;/);
});
