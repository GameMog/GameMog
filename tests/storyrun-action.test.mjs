// The story runner's action layer (r8, wagmi/storyrun/action.js): on by itself in a hometown world only, its shot
// grammar's lens maths, and that it never touches a rule. node --test tests/storyrun-action.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionOn, frameOf, FRAMES, STINGS, CAMS, clearLens, lensOnPerson, MIN_LENS } from '../wagmi/storyrun/action.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the action layer is on in a hometown world, off in Mog City\'s own and the showcases, and a world may say either', () => {
  assert.equal(actionOn({ city: 'hometown' }), true);
  assert.equal(actionOn({ city: 'ny' }), false);
  assert.equal(actionOn({ city: 'sf' }), false);
  assert.equal(actionOn({}), false);
  assert.equal(actionOn({ city: 'ny', cine: { action: true } }), true);
  assert.equal(actionOn({ city: 'hometown', cine: { action: false } }), false);
  // (the repo's own worlds say nothing, so they play as before)
  for (const f of ['packs/mog-city.json', 'packs/sf2040.json']) if (fs.existsSync(path.join(ROOT, f))) assert.equal(actionOn(JSON.parse(src(f))), false, f);
});

test('a shot by its grammar: over the shoulder looks at the other face from behind the first; a close-up looks at its own face from in front', () => {
  const heads = { mara: Object.assign([0, 1.6, 0], { h: 0 }), vale: Object.assign([0, 1.7, 4], { h: Math.PI }) };
  const head = (r) => heads[r] || null;
  const ots = frameOf({ frame: 'ots', on: 'mara', at: 'vale' }, head);
  assert.ok(ots.A[2] < 0, 'the lens is behind Mara (away from Vale)');
  assert.ok(Math.abs(ots.A[0]) > 0.2 && Math.abs(ots.A[0]) < 0.8, 'off her shoulder');
  assert.deepEqual(ots.LA, heads.vale, 'it looks at Vale');
  const close = frameOf({ frame: 'close', on: 'mara', at: 'vale' }, head);
  assert.ok(close.A[2] > 0.8 && close.A[2] < 1.2, 'in front of Mara, toward Vale');
  assert.ok(Math.abs(close.LA[2]) < 0.01, 'looking at Mara');
  const push = frameOf({ frame: 'push', on: 'mara' }, head);
  assert.ok(push.A[2] > push.B[2], 'a push-in moves the lens closer');
  // (alone: the way she faces)
  assert.ok(frameOf({ frame: 'react', on: 'mara' }, head).A[2] > 0.5);
  for (const f of FRAMES) assert.ok(frameOf({ frame: f, on: 'mara', at: 'vale' }, head), f);
  // (at the wheel: the lens a car's length out, never inside the body)
  const wheel = (r) => (r === 'player' ? Object.assign([0, 1.2, 0], { h: 0, car: true }) : null);
  for (const f of ['close', 'react', 'push', 'low', 'ots']) { const fr = frameOf({ frame: f, on: 'player' }, wheel); assert.ok(Math.hypot(fr.A[0], fr.A[2]) > 3, f); }
  assert.equal(frameOf({ frame: 'dutch', on: 'mara' }, head), null);
  assert.equal(frameOf({ frame: 'close', on: 'nobody' }, head), null);
});

test('the action layer draws, sounds and moves the camera only: no rule, no timer, no fail', () => {
  const a = src('wagmi/storyrun/action.js');
  assert.doesNotMatch(a, /M\.(timer|state|tok)|throw new|\.fail\(/);
  // (its stings are sounds the sound bank has)
  const audio = src('wagmi/mission/audio.js');
  for (const [, list] of Object.entries(STINGS)) for (const x of list) if (typeof x === 'string') assert.match(audio, new RegExp(`\\n    ${x}\\(`), x);
  assert.deepEqual(Object.values(CAMS).sort(), ['action', 'pov']);
  const run = src('wagmi/storyrun/runner.js');
  assert.match(run, /let undoFx = null; try \{ undoFx = action\.stepFx\(d\); \}/);
  assert.match(run, /try \{ undoFx\?\.\(\); \} catch \{\}/);
  assert.match(run, /if \(action\.on \|\| def\.card === 'slam'\) action\.slam/);
  assert.match(run, /const chaseFx = action\.chase\(chase, d\);/);
  assert.match(src('wagmi/storyrun/index.js'), /if \(e\.cliff && W\.action\)/);
});

// a wall along x = 5, from z = -100 to 100, 10 m high, over flat ground: the share of a sight line open before it
const wallAt = (wx) => (a, b) => {
  if ((a[0] - wx) * (b[0] - wx) >= 0) return 1;
  const t = (wx - a[0]) / (b[0] - a[0]), y = a[1] + (b[1] - a[1]) * t;
  return y > 10 ? 1 : t;
};
test('a cutscene lens is never behind a wall: a clear one kept, a near wall pulled in front of, a far one swung round', () => {
  const head = [0, 1.6, 0];
  // (nothing between: as it was)
  const open = { A: [-6, 2, 0], B: [-5, 2, 0], LA: head, LB: head };
  assert.equal(clearLens(open, wallAt(5)).how, 'clear');
  assert.equal(clearLens(open, wallAt(5)).lens, open);
  // (the wall just in front of the lens: pulled in a little, the same angle)
  const near = { A: [6, 1.6, 0], B: [5.5, 1.6, 0], LA: head, LB: head };
  const n = clearLens(near, wallAt(5.6));
  assert.equal(n.how, 'pull');
  assert.ok(n.lens.A[0] < 5.6 && n.lens.A[0] > 4.5 && Math.abs(n.lens.A[2]) < 1e-9);
  // (a wall right by the face: swung to the far side of it, the same distance and height)
  const far = { A: [12, 2, 0], B: [11, 2, 0], LA: head, LB: head };
  const f = clearLens(far, wallAt(1));
  assert.equal(f.how, 'swing');
  assert.ok(f.lens.A[0] < 1, 'on the open side');
  assert.ok(Math.abs(Math.hypot(f.lens.A[0], f.lens.A[2]) - 12) < 1e-6);
  assert.equal(f.lens.A[1], 2);
  // (walled in all round: as close as it must, never nearer than MIN_LENS to the face)
  const boxed = clearLens(far, (a, b) => Math.min(1, 0.3 / Math.hypot(b[0] - a[0], b[2] - a[2])));
  assert.equal(boxed.how, 'tight');
  assert.ok(Math.abs(Math.hypot(boxed.lens.A[0] - head[0], boxed.lens.A[1] - head[1], boxed.lens.A[2] - head[2]) - MIN_LENS) < 1e-6);
});
test('a lens is cleared only when it looks at a person, and never when its line is shut right where it looks', () => {
  // (the line shut within a few cm of the look point: a spot in a wall, kept as written; SF 2040's title shot, 17 Nov)
  const spot = { A: [12, 2, 0], B: [11, 2, 0], LA: [0, 3, 0], LB: [0, 3, 0] };
  const k = clearLens(spot, () => 0.004);
  assert.equal(k.how, 'kept');
  assert.equal(k.lens, spot);
  // (a person beside a wall, the lens behind it: moved, never kept; RD-2's wide on Vance Mercer at Peets Hill, 18 Nov.
  // The head 0.3 m from a wall at x = 0.3, the lens 12 m out past it; sampled every 0.3 m, the line shuts at its first step)
  const coarse = (sight) => (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.3)), t = sight(a, b); return t >= 1 ? 1 : Math.floor(t * n) / n; };
  const beside = { A: [12, 1.6, 0], B: [11, 1.6, 0], LA: [0, 1.6, 0], LB: [0, 1.6, 0] };
  assert.equal(coarse(wallAt(0.3))(beside.LA, beside.A), 0, 'the line shut at its first sample');
  const b = clearLens(beside, coarse(wallAt(0.3)));
  assert.notEqual(b.how, 'kept');
  assert.ok(['swing', 'pull', 'tight'].includes(b.how), b.how);
  assert.ok(b.lens.A[0] < 0.3 || Math.abs(b.lens.A[2]) > 1, 'off the wall\'s far side');
  // (frame shots look at people, a wide too)
  for (const frame of ['two', 'ots', 'close', 'react', 'low', 'push', 'wide']) assert.equal(lensOnPerson({ frame, on: 'player' }), true, frame);
  // (a lens written out on a face: the hero, or rel to someone near their head)
  assert.equal(lensOnPerson({ cam: { rel: 'Hollis', fwd: 2 } }, { rel: 'Hollis', up: -0.05 }), true);
  assert.equal(lensOnPerson({ cam: { rel: 'player', fwd: 9 } }, 'player'), true);
  // (a lens written out with no look: it looks at the hero's head)
  assert.equal(lensOnPerson({ cam: { rel: 'Hollis', fwd: 3 } }, undefined), true);
  assert.equal(lensOnPerson({ text: 'Later' }, undefined), false);
  // (a title, a place's name, a look at a spot in the street or a place: never moved)
  const sf8 = { cam: { rel: 'player', fwd: 14, up: 4, right: 9 }, look: { rel: 'player', fwd: -20, up: 3 }, title: true };
  assert.equal(lensOnPerson(sf8, sf8.look), false);
  assert.equal(lensOnPerson({ ...sf8, title: undefined }, sf8.look), false);
  assert.equal(lensOnPerson({ cam: { rel: 'player', fwd: -26, up: 8 }, where: { name: 'Bozeman, Montana' } }, 'player'), false);
  assert.equal(lensOnPerson({ cam: { rel: 'player', up: 4.5, fwd: -14 }, title: true }, 'player'), false);
  assert.equal(lensOnPerson({ frame: 'wide', title: true }), false);
  assert.equal(lensOnPerson({ cam: { rel: 'player' } }, { rel: '@spur' }), false);
  assert.equal(lensOnPerson({ cam: { rel: 'player' } }, [1, 2, 3]), false);
  assert.equal(lensOnPerson({ cam: { rel: 'player' }, lookTo: { rel: 'player', fwd: 30 } }, 'player'), false);
});
