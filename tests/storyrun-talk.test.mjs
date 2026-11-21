// Mog City: a story world's talk (18 Nov, the talk track). The car phone's engine (wagmi/mission/calls.js) run on a
// fake clock with a world's call as the runner defines it (wagmi/storyrun/talk.js): its react pools are exchanges of
// tuples (the live bug: one line spread over its three strings, 'B' / 'o' on screen), its lines hand over by turns.js
// (a quick reply 0.12 s, an overlap 0.15 s early, a cut-in), a call with a span goes on over the next legs, its
// extras and all. And the beats themselves (turns.js cut, a 4-word overlap), and the runner's hooks that fire the hit
// and spotted pools (static: they need the game).
//   node --test tests/storyrun-talk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { reactPools, callTup } from '../wagmi/storyrun/talk.js';
import { beatOf, gapAfter, canOverlap, cutInto, GAP, playTurns } from '../wagmi/radio/turns.js';

// (calls.js reads the story's words through wagmi/story, which needs the page: a stand-in that returns them as given)
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (/story\\/index\\.js$/.test(s)) return { url: 'data:text/javascript,' + encodeURIComponent('export const S = { line: (w, t) => t, name: (w) => w };'), shortCircuit: true }; return n(s, c); }`));

// ---- a fake game for calls.js: its clock, the subtitle element, the voices (each line's clip a known length)
function game(durs = {}) {
  let T = 0, loop = null; const subs = [], cues = [], clips = [];
  const el = { text: null, get textContent() { return this.text || ''; }, classList: { contains: (k) => k === 'hide' && el.text == null } };
  globalThis.document = { querySelector: () => el };
  globalThis.requestAnimationFrame = (f) => { loop = f; return 1; };
  const W = {
    clock: { now: () => T }, paused: false, ride: { phase: null },
    app: { controllerManager: { activeMode: 'car' } }, car: { speed: 12, position: { x: 0, z: 0 } },
    sfx: { play() {} },
    ui: { stepId: 's1', caller() {}, sub(who, text) { if (!who) { el.text = null; return; } el.text = String(who).toUpperCase() + text; subs.push({ at: T, who, text }); clips.push({ end: T + (durs[text] || 0) * 1000 }); } },
    voice: { dur: (w, t) => durs[t] || 0, speaks: () => true, left: () => Math.max(0, ...clips.map((c) => c.end - T)) / 1000, cue(o) { cues.push({ at: T, ...o }); } },
  };
  const run = (ms) => { for (let k = 0; k < ms; k += 16) { T += 16; loop?.(); } };
  return { W, subs, cues, run, get T() { return T; } };
}
const { createCalls } = await import('../wagmi/mission/calls.js');
const name = (w) => w, colour = () => '#fff';
const tup = (l) => callTup(l, name, colour);
// (rung and talking: in the car and rolling, its delay, then the ring)
const live = (g, C) => { g.run(2000 + 1500 + 400); assert.equal(C.state().state, 'talk'); };
const startOf = (g, text) => g.subs.find((s) => s.text === text)?.at;

test('react pools: each variant a list of tuples; a line is a variant of one, an exchange a variant of its lines', () => {
  const p = reactPools({ hit: [{ who: 'Boone', text: 'Easy on the truck.' }, ['Boone', 'That one cost you.']], spotted: [[{ who: 'Cole', text: 'They see you.' }, { who: 'Jack', text: 'I know.', overlap: true }]], bogus: [{ who: 'X', text: 'no' }] }, tup);
  assert.deepEqual(Object.keys(p), ['hit', 'spotted']);
  assert.equal(p.hit.length, 2);
  for (const v of p.hit) { assert.equal(v.length, 1); assert.equal(typeof v[0][2], 'string'); assert.ok(v[0][2].length > 3, 'the words, not a letter of them'); }
  assert.deepEqual(p.spotted[0].map((x) => [x[0], x[2]]), [['Cole', 'They see you.'], ['Jack', 'I know.']]);
  assert.equal(p.spotted[0][1][3].overlap, true);
  assert.equal(reactPools(null, tup), null);
});

test("a world's react plays its words: the live bug (the variant spread over who, colour and text) is gone", () => {
  const g = game();
  const C = createCalls(g.W);
  C.define('pack:t:1:d:Boone', { who: 'Boone', color: '#f00', main: [tup({ who: 'Boone', text: 'Evening, Mr. Colter. Nice clean truck.' }), tup({ who: 'Jack', text: "It's not a truck." })], react: reactPools({ hit: [{ who: 'Boone', text: 'Easy on the truck.' }, { who: 'Boone', text: 'That one cost you.' }] }, tup), cool: 7, beats: true, finish: true });
  C.start('pack:t:1:d:Boone', { step: 's1' });
  live(g, C);
  assert.equal(C.react('hit'), true);
  g.run(12000);
  const said = g.subs.map((s) => s.text);
  assert.ok(said.includes('Easy on the truck.'), said.join(' | '));
  assert.ok(g.subs.every((s) => s.who.length > 1 && s.text.length > 1), 'no one-letter speaker or line');
});

test("a world's lines hand over as a scene's do: a quick reply 0.12 s after, not a flat 0.25 s plus a reading floor", () => {
  const A = 'So the plan is simple, we go in the front door.', B = 'The front door?';
  const g = game({ [A]: 2.4, [B]: 0.6 });
  const C = createCalls(g.W);
  C.define('pack:t:2', { who: 'Jen', color: '#fff', main: [tup({ who: 'Jen', text: A }), tup({ who: 'Board', text: B })], beats: true, finish: true });
  C.start('pack:t:2', { step: 's1' });
  live(g, C); g.run(6000);
  const a = startOf(g, A), b = startOf(g, B);
  const gap = (b - a) / 1000 - 2.4 - 0.05;
  assert.ok(Math.abs(gap - GAP.quick) < 0.05, `gap ${gap.toFixed(3)}`);
});

test('an overlap (4 words or fewer) starts 0.15 s before the line it answers ends, cued as an overlap', () => {
  const A = 'The more you buy, the more you save, and I mean that.', B = 'Wait, wait, wait.';
  const g = game({ [A]: 3, [B]: 0.8 });
  const C = createCalls(g.W);
  C.define('pack:t:3', { who: 'Jen', color: '#fff', main: [tup({ who: 'Jen', text: A }), tup({ who: 'Board', text: B, overlap: true })], beats: true, finish: true });
  C.start('pack:t:3', { step: 's1' });
  live(g, C); g.run(6000);
  const lead = 3.05 - (startOf(g, B) - startOf(g, A)) / 1000;
  assert.ok(lead > 0.1 && lead < 0.25, `B started ${lead.toFixed(3)} s before A ended`);
  assert.equal(g.cues.find((c) => c.at === startOf(g, B))?.overlap, true);
});

test('a cut: the next speaker cuts in once that share of the line is said, cued as a cut-in', () => {
  const A = 'Ladies and gentlemen, the more you buy, the more you save, the more you...', B = 'Stop.';
  const g = game({ [A]: 4, [B]: 0.5 });
  const C = createCalls(g.W);
  C.define('pack:t:4', { who: 'Jen', color: '#fff', main: [tup({ who: 'Jen', text: A, cut: 0.5 }), tup({ who: 'Board', text: B })], beats: true, finish: true });
  C.start('pack:t:4', { step: 's1' });
  live(g, C); g.run(8000);
  const after = (startOf(g, B) - startOf(g, A)) / 1000;
  assert.ok(after > 1.9 && after < 2.4, `B came in ${after.toFixed(2)} s in (half of 4.05 + a cut's 0.05)`);
  assert.equal(g.cues.find((c) => c.at === startOf(g, B))?.cut, true);
});

test("Mog City's own calls (a number for a pause, no beat) keep their timing", () => {
  const A = 'Okay. Okay.', B = 'Yes.';
  const g = game({ [A]: 1, [B]: 0.5 });
  const C = createCalls(g.W);
  C.define('own:t', { who: 'Jane', color: '#6CB8FF', main: [['Jane', '#6CB8FF', A], ['Dan', '#fff', B]] });
  C.start('own:t', { step: 's1' });
  live(g, C); g.run(6000);
  // (its reading floor, 1.4 s, then the flat 0.25 s)
  const d = (startOf(g, B) - startOf(g, A)) / 1000;
  assert.ok(Math.abs(d - 1.65) < 0.05, `${d}`);
});

test('a span: the call goes on over the next legs (its extras too), then finishes with its wrap', () => {
  const g = game();
  const C = createCalls(g.W);
  const L = (who, text) => tup({ who, text });
  C.define('pack:t:5', { who: 'Board', color: '#fff', main: [L('Board', 'You took the long way.'), L('Jen', 'Scenic route.')], extra: [[L('Board', 'Is that the arena?'), L('Jen', 'That is the arena.')]], wrap: [L('Board', 'Call me after.')], finish: true, span: 1, beats: true });
  C.start('pack:t:5', { step: 's1' });
  live(g, C); g.run(3000);
  // (leg one ends: the call goes on into leg two, spanning)
  g.W.ui.stepId = 's2'; g.run(500);
  assert.equal(C.state().id, 'pack:t:5'); assert.equal(C.state().spanning, true);
  g.run(14000);
  assert.ok(g.subs.some((s) => s.text === 'Is that the arena?'), 'its extra block played on the second leg');
  // (leg two ends: it finishes, wraps, hangs up)
  g.W.ui.stepId = 's3'; g.run(9000);
  assert.ok(g.subs.some((s) => s.text === 'Call me after.'), 'wrapped');
  assert.equal(C.state().id, null);
});

test('without a span a ride-along call finishes at the end of its leg (as before): no extra block on the next', () => {
  const g = game();
  const C = createCalls(g.W);
  const L = (who, text) => tup({ who, text });
  C.define('pack:t:6', { who: 'Board', color: '#fff', main: [L('Board', 'You took the long way.'), L('Jen', 'Scenic route.')], extra: [[L('Board', 'Is that the arena?')]], wrap: [L('Board', 'Call me after.')], finish: true, beats: true });
  C.start('pack:t:6', { step: 's1' });
  live(g, C); g.run(3000);
  g.W.ui.stepId = 's2'; g.run(12000);
  assert.ok(!g.subs.some((s) => s.text === 'Is that the arena?'));
  assert.ok(g.subs.some((s) => s.text === 'Call me after.'));
});

test('turns.js: a cut is a beat, a cut line is cut into; an overlap of up to 4 words is honoured', () => {
  assert.equal(beatOf({ cut: 0.6 }).cut, 0.6);
  assert.equal(beatOf({ cut: 0.1 }).cut, 0.3);
  assert.equal(beatOf({ cut: 'x' }).cut, undefined);
  assert.equal(cutInto({ text: 'The more you buy', cut: 0.5 }), true);
  assert.equal(cutInto({ text: 'The more you...' }), true);
  assert.equal(gapAfter({ text: 'Full sentence here.', cut: 0.6 }, { text: 'Stop right there, please, okay.' }), GAP.cut);
  assert.equal(canOverlap({ text: 'Wait, wait, wait.', overlap: true }), true);
  assert.equal(canOverlap({ text: 'No no no no no.', overlap: true }), false);
});

test('playTurns: a cut line is held for its share, the next line cued cut', async () => {
  let t = 0; const shown = [], cues = [];
  const W = { voice: { has: () => true, dur: (w, x) => ({ 'One two three four.': 2, 'Stop.': 0.5 })[x] || 0, cue: (o) => cues.push(o) } };
  await playTurns(W, [{ who: 'A', text: 'One two three four.', cut: 0.5 }, { who: 'B', text: 'Stop.' }], { sleep: async (ms) => { t += ms / 1000; }, show: (L, i, secs) => { shown.push({ i, at: +t.toFixed(3), secs }); } });
  assert.equal(shown[0].secs, 1);
  assert.equal(shown[1].at, +(1 + GAP.cut).toFixed(3));
  assert.equal(cues[1].cut, true);
});

test("the runner fires a world call's hit and spotted pools (until 18 Nov nothing did)", () => {
  const src = fs.readFileSync(new URL('../wagmi/storyrun/runner.js', import.meta.url), 'utf8');
  assert.match(src, /W\.crash\.on\('hit'[\s\S]{0,400}W\.calls\.react\?\.\('hit'\)/, 'a crash while a pack call talks: its hit pool');
  assert.match(src, /chase\?\.on\?\.\('hidden'[\s\S]{0,160}react\?\.\('spotted'\)/, "a chase that sees him again: its spotted pool");
  assert.match(src, /reactPools\(d\.react, toTup\)/, 'pools through talk.js');
  assert.match(src, /span, beats: true/, "a world's call: span and beats");
});

test('the duck under a line is a number: a beat tuple (a world call) and a plain tuple (Mog City own), both mixers', () => {
  for (const mixer of ['bus', 'radio']) {
    const g = game(); const ducks = [];
    if (mixer === 'bus') g.W.audio = { bus: { music: {}, voice: {} }, duck(bus, lvl, secs) { ducks.push(secs); } };
    else g.W.radio = { duck(lvl, secs) { ducks.push(secs); } };
    const C = createCalls(g.W);
    C.define('pack:t:duck:' + mixer, { who: 'Jen', color: '#fff', main: [tup({ who: 'Jen', text: 'The more you buy, the more you save.' }), tup({ who: 'Board', text: 'Stop.', overlap: true }), ['Jane', '#6CB8FF', 'Plain line, plain pause.'], ['Dan', '#fff', 'Yes.', 0.4]], beats: true, finish: true });
    C.start('pack:t:duck:' + mixer, { step: 's1' });
    live(g, C); g.run(12000);
    assert.equal(ducks.length, 4, `${mixer}: ${ducks.join(', ')}`);
    for (const d of ducks) assert.ok(typeof d === 'number' && Number.isFinite(d) && d > 0, `${mixer}: duck ${String(d)}`);
    // (the plain tuple's own pause in it: 'Yes.' is 1.4 s, its 0.4 s pause, 0.6 s)
    assert.ok(Math.abs(ducks[3] - 2.4) < 1e-9, `${mixer}: ${ducks[3]}`);
  }
});

test("a react exchange's 3rd and 4th lines are not dropped as stale: counted from its first line said", () => {
  const L = (who, text) => tup({ who, text });
  const lines = ['One, and that took a while to say.', 'Two, and that took a while to say.', 'Three, and that took a while.', 'Four, and that took a while.'];
  const g = game(Object.fromEntries(lines.map((l) => [l, 4])));
  const C = createCalls(g.W);
  C.define('pack:t:stale', { who: 'Jen', color: '#fff', main: [L('Jen', 'Hello.')], react: { hit: [lines.map((l, i) => L(i % 2 ? 'Board' : 'Jen', l))] }, beats: true, finish: true });
  C.start('pack:t:stale', { step: 's1' });
  live(g, C); g.run(2500);
  assert.equal(C.react('hit'), true);
  g.run(24000);
  const said = g.subs.map((s) => s.text);
  for (const l of lines) assert.ok(said.includes(l), `${l} | ${said.join(' | ')}`);
});

test('wrapNow: a spanning call drops the extra block under way and wraps (a scene is coming); its resume line first', () => {
  const g = game();
  const C = createCalls(g.W);
  const L = (who, text) => tup({ who, text });
  C.define('pack:t:7', { who: 'Marge', color: '#fff', main: [L('Marge', 'Four. Copy.')], extra: [[L('Marge', 'Run of show one.'), L('Jen', 'Run of show two.'), L('Marge', 'Run of show three.'), L('Jen', 'Run of show four.')]],
    wrap: [L('Marge', "Four o'clock. Then I call it. Copy?"), L('Jen', 'Copy. Mostly.')], resume: [L('Marge', 'Where were we? Panic.')], finish: true, span: 2, beats: true });
  C.start('pack:t:7', { step: 's1' });
  live(g, C); g.W.ui.stepId = 's2'; g.run(500);
  // (on hold for a call waiting, then back: a resume owed)
  C.hold(true); g.run(4000); C.hold(false);
  g.run(9000);
  assert.ok(g.subs.some((s) => s.text === 'Run of show one.'), 'the extra block began');
  C.wrapNow(); g.run(16000);
  const said = g.subs.map((s) => s.text);
  assert.ok(said.includes("Four o'clock. Then I call it. Copy?") && said.includes('Copy. Mostly.'), said.join(' | '));
  assert.ok(!said.includes('Run of show four.'), 'the block under way dropped');
  assert.ok(said.indexOf('Where were we? Panic.') < said.indexOf("Four o'clock. Then I call it. Copy?"), 'the resume line before the wrap');
  assert.equal(C.state().id, null);
});

test('hush: no new call line begun for its seconds (a beat and its lines are one exchange)', () => {
  const g = game();
  const C = createCalls(g.W);
  const L = (who, text) => tup({ who, text });
  C.define('pack:t:8', { who: 'Marge', color: '#fff', main: [L('Marge', 'One.'), L('Marge', 'Two.'), L('Marge', 'Three.')], finish: true, beats: true });
  C.start('pack:t:8', { step: 's1' });
  live(g, C); g.run(1700);
  // (the beat's own line up for 3 s of it: the call's wait for a mission line does not end the hush)
  const t0 = g.T; C.hush(6); g.W.ui.sub('Jen', 'The beat line.'); g.run(3000); g.W.ui.sub(null); g.run(6000);
  const after = g.subs.filter((s) => s.at > t0 + 100 && s.text !== 'The beat line.');
  assert.ok(after.length && after[0].at >= t0 + 6000, `the next line waited out the hush: ${after.map((s) => s.at - t0).join(',')}`);
});
