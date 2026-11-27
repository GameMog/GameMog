// Jensen Heist's 10/10 day, batch A (22 Nov), the engine's quick wins: 1.1 a caller kept in their call's tile while a
// later call's office is pooled (sets.js reclaim, pool's keep), 2.2 a cover from the start's click to the opening's
// first frame (index.js opensNow, runner.js opening covered), 3.6 a speaker's colour made readable (mission/contrast.js),
// 2.9 the stuck offer only when the car is going nowhere (mission/gps.js stuckShows), 2.5 FIGHT BASICS in order and off
// with its fight (combat/index.js), 2.11 the pass card's DAMAGE in the HUD's terms (tests/story-medals-credits.test.mjs),
// 3.9 a calm driving HUD for a pack that asks (calm-hud.js, mission/ui.js), and a target's marker never over his car
// (storyrun/guide.js clearCar).
//   node --test tests/jh-day-a-engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readable, contrast, BOX } from '../wagmi/mission/contrast.js';
import { createGetOut, GETOUT_SECS } from '../wagmi/calm-hud.js';
import { clearCar } from '../wagmi/storyrun/guide.js';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');
// (a plain function lifted out of a module that needs a page to import)
const lift = (file, head) => { const s = src(file), i = s.indexOf(head); assert.ok(i >= 0, head); let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };

test('1.1: a set being drawn takes its people back each frame; a pool never gives back a body a live set holds', () => {
  const sets = src('wagmi/storyrun/sets.js');
  const rc = lift('wagmi/storyrun/sets.js', 'function reclaim(S) {');
  assert.match(rc, /if \(!fig \|\| fig\.root\.parent === S\.scene\) continue;/);
  assert.match(rc, /O !== S && !O\.pooled && O\.scene === fig\.root\.parent/);
  assert.match(rc, /if \(holder && \(holder === active \|\| holder\.inGrid\)\) continue;/);
  assert.match(rc, /S\.scene\.add\(fig\.root\); fig\.root\.visible = !P\.hidden;/);
  assert.match(rc, /place\(S, P\); pose\(S, P\);/);
  // (every drawn frame: update() is what the grid's shoot() and the active set's frame call)
  assert.match(lift('wagmi/storyrun/sets.js', 'function update(S) {'), /\n\s*if \(S\.inGrid && active !== S\) reclaim\(S\);/);
  assert.match(src('wagmi/storyrun/vcall-draw.js'), /S\.inGrid = true; S\.fcam = c; S\.update\(\);/);
  const pool = sets.slice(sets.indexOf('async pool(defs'), sets.indexOf('    adopt(key, id) {'));
  assert.match(pool, /O !== S && !O\.pooled && O\.people\.has\(P\.name\) && O\.people\.get\(P\.name\)\.fig === P\.fig/);
  assert.match(pool, /if \(holder\) \{ const H = holder\.people\.get\(P\.name\); holder\.scene\.add\(P\.fig\.root\);[^\n]*continue; \}\n\s*giveBack\(P\.fig\);/);
  // (and the race is real: the mission's first pool is started, not awaited, before its first step, PH-1's call k1)
  assert.match(src('wagmi/storyrun/runner.js'), /if \(!ctx\.flags\.flowFast\) poolFeeds\(M\.i\);\n\s*let i = M\.i;/);
});

test('2.2: the opening rule, and a cover from the click to its first frame with the HUD away', () => {
  const opensNow = new Function(`return (${lift('wagmi/storyrun/index.js', 'function opensNow(').replace(/^function opensNow/, 'function')})`)();
  const Q = (s) => new URLSearchParams(s), def = { opening: { shots: [{}] } }, fresh = { done: {} };
  assert.equal(opensNow(def, Q(''), 0, fresh), true);
  assert.equal(opensNow(def, Q('opening=0'), 0, fresh), false);
  assert.equal(opensNow(def, Q('mission=PH-1'), 0, fresh), false);
  assert.equal(opensNow(def, Q('mission=PH-1&opening=1'), 0, fresh), true);
  assert.equal(opensNow(def, Q(''), 0, { done: { 'PH-1': true } }), false);
  assert.equal(opensNow(def, Q(''), 0, fresh, { i: 3 }), false, 'a Continue');
  assert.equal(opensNow(def, Q(''), 2, fresh), false);
  assert.equal(opensNow({ opening: { shots: [] } }, Q('opening=1'), 0, fresh), false);
  assert.equal(opensNow({}, Q(''), 0, fresh), false);
  const idx = src('wagmi/storyrun/index.js');
  // (straight after the gate, before the ranch, the test drive and the opening's own making)
  const at = idx.indexOf('if (gate) await gate;'), cover = idx.indexOf('if (opens) { W.cutscene = true; ui.cine(true); ui.fade(1, gate ? 0.35 : 0); }');
  assert.ok(at > 0 && cover > at && cover < idx.indexOf("if (Q.has('freedrive'))") && cover < idx.indexOf('W.storyrun.ranch.ready'), 'the cover is up first');
  assert.match(idx, /await runner\.opening\(def\.opening, \{ time: firstTime, covered: true \}\); \} catch \(e\) \{[^\n]*W\.cutscene = false; ui\.cine\(false\); ui\.fade\(0, 0\.6\);/);
  const run = src('wagmi/storyrun/runner.js'), op = run.slice(run.indexOf('  async function opening(o, { time = null, covered = false } = {}) {'), run.indexOf('  // a video call (vcall.js)'));
  assert.match(op, /if \(covered\) requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => \{ ui\.fade\(0, 0\.6\);/);
  assert.ok(op.indexOf('if (covered)') < op.indexOf('await shotList(o.shots'), 'taken down as the first shot starts');
  assert.ok(run.length > 0);
});

test('3.6: a dark cast colour lightened to 4.5:1 on the subtitle box, its hue kept; a readable one left alone', () => {
  for (const c of ['#6B3A2A', '#4B4F58', '#2C3442', '#000000', '#123']) {
    const r = readable(c);
    assert.ok(contrast(r, BOX) >= 4.5, `${c} -> ${r}`);
    assert.ok(contrast(r, BOX) < 6.2, `${c} -> ${r}: no lighter than it needs`);
  }
  // (Mr. Board's brown stays warm: red over blue)
  const b = readable('#6B3A2A'), rgb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  assert.ok(rgb[0] > rgb[2] + 20, b);
  for (const c of ['#FFC93C', '#B6FF3B', '#6CB8FF', '#FFFFFF', '#4ADE80']) assert.equal(readable(c), c);
  for (const c of ['', null, 'var(--x)', 'red']) assert.equal(readable(c), c);
  assert.ok(Math.abs(contrast('#FFFFFF', '#000000') - 21) < 1e-9);
  const ui = src('wagmi/mission/ui.js');
  assert.match(ui, /<b style="color:\$\{readable\(color\)\}">/);
  assert.match(ui, /capEl\.style\.setProperty\('--c', readable\(color\)\);/);
});

test('2.9: the stuck offer only under about 5 mph with no headway, and down the moment he is moving', () => {
  const gps = src('wagmi/mission/gps.js');
  const consts = gps.slice(gps.indexOf('export const STUCK_MPS'), gps.indexOf('\n', gps.indexOf('export const stuckShows')));
  const { STUCK_MPS, stuckShows } = new Function(`${consts.replace(/export /g, '')}; return { STUCK_MPS, stuckShows };`)();
  assert.ok(STUCK_MPS * 2.23694 > 4.5 && STUCK_MPS * 2.23694 < 5.5, 'about 5 mph');
  assert.equal(stuckShows(0, 0), true);
  assert.equal(stuckShows(1, 1), true);
  assert.equal(stuckShows(16 / 2.23694, 0), false, "FL-7's 16 mph");
  assert.equal(stuckShows(-3, 0), false, 'reversing out');
  assert.equal(stuckShows(0.5, 12), false, 'the route getting shorter');
  assert.equal(stuckShows(0.5, -40), true, 'a replan that made it longer is no headway');
  assert.match(gps, /else if \(stuckT > 4 && W\.recoverCar && stuckShows\(spd, gain\)\) S\.offer\('stuck'\);/);
  assert.match(gps, /const going = mineWhy === 'stuck' \? !inCar \|\| spd > STUCK_MPS : L < mineL - 25;/);
  assert.match(gps, /if \(goingT > \(mineWhy === 'stuck' \? 0\.3 : 0\)\)/);
  assert.match(gps, /if \(!mine && up && up\.title === 'Stuck\?'\) \{ mine = up; mineWhy = 'stuck'; \}/);
});

test('2.5: FIGHT BASICS opens on 1/3, each card up long enough to read, and goes with its fight', () => {
  const cb = src('wagmi/combat/index.js');
  assert.match(cb, /if \(!skipped && L\.shownAt != null && c\.rtime - L\.shownAt < LESSON_MIN\) \{ L\.due = key; return; \}/);
  assert.match(cb, /if \(c\.lesson\?\.due && c\.rtime - \(c\.lesson\.shownAt \?\? 0\) >= LESSON_MIN\) c\.lessonDone\(c\.lesson\.due\);/);
  assert.match(cb, /if \(S\) \{ L\.shownAt = c\.rtime; c\.hud\.lesson\(\{ step: L\.step \+ 1, of: LESSON\.length/);
  assert.match(cb, /c\.lessonOff = \(\) => \{ lessonAt = LESSON\.length; lessonEnd = 0; if \(c\.lesson\) \{ c\.lesson = null; c\.hud\.lesson\(null\); \} \};/);
  // (a minimal model of the cards: three blows in 0.4 s still show STRIKE 1/3 for LESSON_MIN s, then COUNTER 2/3)
  const LESSON_MIN = +/const LESSON_MIN = ([\d.]+);/.exec(cb)[1];
  assert.ok(LESSON_MIN >= 2 && LESSON_MIN <= 3);
  const shown = [], c = { rtime: 0, lesson: { step: 0, n: 0 } }, KEYS = ['strike', 'counter', 'dodge'];
  const show = () => { c.lesson.shownAt = c.rtime; shown.push([c.rtime, c.lesson.step + 1]); };
  const done = (key) => { const L = c.lesson; if (KEYS[L.step] !== key) return; if (c.rtime - L.shownAt < LESSON_MIN) { L.due = key; return; } L.due = null; L.step++; show(); };
  const tick = () => { if (c.lesson.due && c.rtime - c.lesson.shownAt >= LESSON_MIN) done(c.lesson.due); };
  show(); for (const t of [0.1, 0.25, 0.4]) { c.rtime = t; if (++c.lesson.n >= 3) done('strike'); tick(); }
  for (let t = 0.5; t < 4; t += 0.1) { c.rtime = t; tick(); }
  assert.deepEqual(shown.map((x) => x[1]), [1, 2]);
  assert.ok(shown[1][0] >= LESSON_MIN - 1e-9);
  // (the story's fight step ends the lesson once it is won)
  assert.match(src('wagmi/storyrun/runner.js'), /if \(d\.win === 'survive'\) combat\.clear\?\.\(\);\n[^\n]*\n\s*combat\.lessonOff\?\.\(\);/);
});

test("3.9: a calm HUD for a pack that asks: 'F · Get out' faded after 3 s of driving, back when parked; the objective said once a step", () => {
  const g = createGetOut();
  assert.equal(g.step(0.1, false, 0), false);
  let on = true; for (let t = 0; t < GETOUT_SECS - 0.2; t += 0.1) on = g.step(0.1, true, 1);
  assert.equal(on, true, 'offered as he gets in');
  for (let t = 0; t < 1; t += 0.1) on = g.step(0.1, true, 1);
  assert.equal(on, false, 'gone while he drives, slow traffic too');
  for (let t = 0; t < 1; t += 0.1) on = g.step(0.1, true, 0);
  assert.equal(on, false, 'a moment at a light is not parked');
  for (let t = 0; t < 1; t += 0.1) on = g.step(0.1, true, 0);
  assert.equal(on, true, 'parked: offered again');
  assert.equal(g.step(0.1, true, 5), false);
  assert.equal(g.step(0.1, false, 0), false); assert.equal(g.step(0.1, true, 3), true, 'in again: offered again');
  const game = src('wagmi/game.js');
  assert.match(game, /quiet = !!WAGMI\.calmHud && \/Get out\|Dismount\/\.test\(show\) && !g/);
  // (only the offer: the key and WAGMI.prompt, the pad's Y, are as they were)
  assert.match(game, /WAGMI\.prompt = show;\n/);
  const ui = src('wagmi/mission/ui.js');
  assert.match(ui, /if \(window\.WAGMI\?\.calmHud && keep && said1 && said1\[0\] === stepId && said1\[1\] === html\) return;/);
  // (off unless the pack asks: hud.calm, or ?calmhud=1 to try it)
  assert.match(src('wagmi/storyrun/index.js'), /W\.calmHud = Q\.has\('calmhud'\) \? Q\.get\('calmhud'\) !== '0' : def\.hud\?\.calm === true;/);
});

test("a target's marker is never drawn over his car: slid along the edge to its side, or lifted over the roof", () => {
  const car = { left: 490, right: 800, top: 430, bottom: 640 };
  // (SS-5's 'AWAY · 826 M': at the bottom edge, middle, a spot behind him a little to the right)
  const a = clearCar(560, 120, 540, 53, car, { edge: true, side: 1, W: 1280 });
  assert.ok(560 + a.dx >= car.right, 'to the right of the car'); assert.equal(a.top, 540);
  const b = clearCar(560, 120, 540, 53, car, { edge: true, side: -1, W: 1280 });
  assert.ok(560 + b.dx + 120 <= car.left, 'to its left');
  // (no room on that side: the other)
  const c = clearCar(560, 120, 540, 53, { left: 300, right: 1240, top: 430, bottom: 640 }, { edge: true, side: 1, W: 1280 });
  assert.ok(560 + c.dx + 120 <= 300);
  // (in view behind the car on the screen: lifted over its roof, its pin's x kept)
  const d = clearCar(600, 120, 500, 53, car, { edge: false });
  assert.equal(d.dx, 0); assert.ok(d.top + 53 <= car.top);
  // (clear of it already, or no car: as it was)
  assert.deepEqual(clearCar(100, 120, 100, 53, car, { edge: true, side: 1, W: 1280 }), { dx: 0, top: 100 });
  assert.deepEqual(clearCar(560, 120, 540, 53, null), { dx: 0, top: 540 });
  const gd = src('wagmi/storyrun/guide.js');
  assert.match(gd, /const cc = clearCar\(Lx, lw, top, 24 \+ 2 \+ 5 \+ 22, carBox, \{ edge: !q\.inView/);
  assert.match(gd, /el\.style\.transform = `translate\(\$\{Math\.round\(sx - 90 \+ dx\)\}px, \$\{Math\.round\(top\)\}px\)`;/);
});
