// The story runner's play rules (wagmi/storyrun/rules.js): the money meter, timers across steps, sight cones, a car to
// stay with, a passenger's speed limit, the MISSION PASSED card, the GPS's held-off streets; and the engine-check world
// (tools/storyrun/test-packs/pickup-eng.json) that plays each of them under the autopilot.
//   node --test tests/storyrun-rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?pack=x');
const R = await import('../wagmi/storyrun/rules.js');
const { check, STEP_KINDS } = await import('../wagmi/storyrun/pack.js');
const ENG = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/storyrun/test-packs/pickup-eng.json'), 'utf8'));

test('the money meter: dollars with commas, and its goal', () => {
  const ransom = { id: 'ransom', label: 'RANSOM', kind: 'money', goal: 1_000_000 };
  assert.equal(R.meterText(ransom, 430000), '$430,000 / $1,000,000');
  assert.equal(R.meterText({ kind: 'money' }, 85000), '$85,000');
  assert.equal(R.meterText({ kind: 'money' }, -5000), '-$5,000');
  assert.equal(R.meterText({ kind: 'money' }, 999), '$999');
  assert.equal(R.meterText({ kind: 'count', goal: 5 }, 3), '3 / 5');
  assert.equal(R.meterText({ kind: 'count' }, 3), '3');
  assert.equal(R.meterText({ kind: 'pips', pips: 4 }, 2), '●●○○');
  assert.equal(R.deltaText(ransom, 85000), '+$85,000');
  assert.equal(R.deltaText(ransom, -5000), '-$5,000');
  assert.equal(R.deltaText({ kind: 'count' }, 2), '+2');
  assert.equal(R.deltaText(ransom, 0), '');
  assert.equal(R.progress(ransom, 430000), 0.43);
  assert.equal(R.progress({ kind: 'money' }, 5), null);
});

test('timers run across steps by name; hard ones fail, soft ones cost and run on late; minus tightens', () => {
  const T = R.createTimers();
  T.start('drop', 10, { fail: 'soft', label: 'THE DROP' });
  T.start('school', 30, { fail: 'hard' });
  assert.equal(T.shown().name, 'drop');
  assert.deepEqual(T.tick(4), []);
  T.add('drop', -3); // (tightened: 3 s off)
  assert.equal(T.list.get('drop').left, 3);
  T.add(null, 2); // (a bonus onto every running timer)
  assert.equal(T.list.get('drop').left, 5); assert.equal(T.list.get('school').left, 28);
  const out = T.tick(5);
  assert.equal(out.length, 1); assert.equal(out[0].name, 'drop'); assert.equal(out[0].late, true);
  assert.deepEqual(T.tick(1), []); // (fired once)
  assert.equal(T.list.get('drop').over, 1);
  assert.equal(T.shown().name, 'school'); // (one still counting down is shown before a late one)
  const snap = T.snapshot();
  const hard = T.tick(28); assert.equal(hard[0].name, 'school'); assert.equal(T.list.has('school'), false);
  T.restore(snap); assert.equal(T.list.get('school').left, 22); // (a retry from a checkpoint)
  T.stop('school'); assert.equal(T.list.has('school'), false); assert.equal(T.running, true);
  T.stop(); assert.equal(T.running, false);
  T.start('x', 2); T.add('x', -10); assert.equal(T.list.get('x').left, 0.5); // (never below half a second by a minus)
});

test("a watcher's cone: in front within range, not behind, always very close", () => {
  const w = { x: 0, z: 0, yaw: 0 };
  assert.equal(R.seen(w, { x: 0, z: 10 }), true);
  assert.equal(R.seen(w, { x: 0, z: 20 }), false);
  assert.equal(R.seen(w, { x: 0, z: -10 }), false);
  assert.equal(R.seen(w, { x: 9, z: 9 }), false); // (45 degrees off: outside a 41-degree half cone)
  assert.equal(R.seen(w, { x: 0, z: -2 }), true);
  assert.equal(R.seen({ x: 0, z: 0, yaw: Math.PI / 2 }, { x: 10, z: 0 }), true);
});

test('a car to stay with: the bar drains outside the band (faster the further) and refills in it', () => {
  const s = { k: 1, out: 0 }, o = { near: 6, far: 60, drain: 0.1, refill: 0.08 };
  assert.equal(R.band(s, 30, 1, o), 'ok'); assert.equal(s.k, 1);
  assert.equal(R.band(s, 3, 1, o), 'close'); assert.ok(Math.abs(s.k - 0.9) < 1e-9);
  assert.equal(R.band(s, 120, 1, o), 'far'); assert.ok(Math.abs(s.k - 0.7) < 1e-9); // (twice the far end: twice the drain)
  assert.equal(R.band(s, 30, 1, o), 'ok'); assert.ok(Math.abs(s.k - 0.78) < 1e-9);
  let n = 0; while (s.k > 0 && n < 100) { R.band(s, 400, 1, o); n++; } assert.equal(s.k, 0); assert.ok(n < 5);
});

test("a passenger's speed limit: a moment over is a warning, past the grace it counts", () => {
  const s = { over: 0 }, max = 40 / R.MPH;
  assert.equal(R.speedRule(s, max * 0.9, 1, { max, grace: 3 }), 'ok');
  assert.equal(R.speedRule(s, max * 1.2, 1, { max, grace: 3 }), 'warn');
  assert.equal(R.speedRule(s, max * 1.2, 1.5, { max, grace: 3 }), 'warn');
  assert.equal(R.speedRule(s, max * 1.2, 1, { max, grace: 3 }), 'over');
  assert.equal(R.speedRule({ over: 0 }, -max * 1.5, 4, { max, grace: 3 }), 'over'); // (backwards counts too)
});

test('the MISSION PASSED card: what was gained, the meter toward its goal, the line, what is next', () => {
  const meters = [{ id: 'ransom', label: 'Ransom', kind: 'money', goal: 1_000_000 }, { id: 'heat', kind: 'hidden' }, { id: 'trust', label: 'TRUST', kind: 'count' }];
  const c = R.passCard({ title: 'The Loan', passLine: 'The bank said yes.', meters, before: { ransom: 345000, trust: 1 }, after: { ransom: 430000, trust: 1, heat: 4 }, next: { title: 'Ms. Okafor', stakes: 'The school knows something.' } });
  assert.deepEqual(c.gains, [{ label: 'RANSOM', text: '+$85,000', good: true }]);
  assert.deepEqual(c.progress, { label: 'RANSOM', text: '$430,000 / $1,000,000', k0: 0.345, k1: 0.43 });
  assert.equal(c.line, 'The bank said yes.');
  assert.deepEqual(c.next, { title: 'Ms. Okafor', sub: 'The school knows something.' });
  const lost = R.passCard({ meters, before: { ransom: 10000 }, after: { ransom: 5000 } });
  assert.deepEqual(lost.gains, [{ label: 'RANSOM', text: '-$5,000', good: false }]);
  assert.equal(lost.next, null);
});

test("the GPS's held-off streets (a roadblock's circle)", () => {
  assert.equal(R.avoids([{ x: 0, z: 0, r: 10 }], 3, 4), true);
  assert.equal(R.avoids([{ x: 0, z: 0, r: 10 }], 30, 4), false);
  assert.equal(R.avoids([], 0, 0), false);
});

test('the engine-check world passes the checks; each new step kind is played (no longer a stub)', () => {
  assert.deepEqual(check(ENG), []);
  for (const k of ['stealth', 'convoy', 'roadblock', 'passenger', 'ally', 'car']) assert.ok(STEP_KINDS.has(k), k);
  const kinds = new Set(ENG.missions.flatMap((m) => m.steps.map((s) => s.type)));
  for (const k of ['stealth', 'convoy', 'roadblock', 'passenger', 'ally', 'timer', 'car']) assert.ok(kinds.has(k), `the world plays ${k}`);
  // (call waiting, a walkie cue, a sub-place)
  const all = ENG.missions.flatMap((m) => m.steps.flatMap((s) => [s, ...(s.during || [])]));
  assert.ok(all.some((s) => s.type === 'call' && s.interrupts) && all.some((s) => s.cue === 'walkie2') && ENG.places.sidedoor.offset.right === 24);
  // (the runner's own list of stubs, read from its source: it imports the engine, so not loaded here)
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  const stub = /export const KINDS_STUB = new Set\(\[([^\]]*)\]\)/.exec(src)[1];
  for (const k of ['stealth', 'convoy', 'roadblock', 'passenger']) assert.ok(!stub.includes(`'${k}'`), `${k} is played`);
  for (const k of ['stealth', 'convoy', 'roadblock', 'ally', 'car']) assert.ok(new RegExp(`STEPS\\.${k} = async`).test(src), `STEPS.${k}`);
  // (the money meter has its goal; every mission is pinned to daylight)
  assert.equal(ENG.hud.meters[0].goal, 1_000_000);
  assert.ok(ENG.missions.every((m) => m.time === 'midday'));
  assert.ok(/hold\(on\)/.test(fs.readFileSync(path.join(ROOT, 'wagmi/mission/calls.js'), 'utf8')), "calls.js holds a live call for a call waiting");
});

test('bad shapes of the play steps are refused', () => {
  const bad = (f) => { const w = structuredClone(ENG); f(w); return check(w); };
  assert.ok(bad((w) => { w.missions[1].steps[0].units = []; }).some((e) => /stealth units/.test(e)));
  assert.ok(bad((w) => { w.missions[2].steps[2].route = ['@school']; }).some((e) => /convoy route/.test(e)));
  assert.ok(bad((w) => { w.missions[2].steps[2].band = [60, 6]; }).some((e) => /convoy band/.test(e)));
  assert.ok(bad((w) => { delete w.missions[2].steps[0].to; }).some((e) => /ally to/.test(e)));
  assert.ok(bad((w) => { w.hud.meters[0].goal = 'lots'; }).some((e) => /goal/.test(e)));
});
