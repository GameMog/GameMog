// The story runner's action layer (r8, wagmi/storyrun/action.js): on by itself in a hometown world only, its shot
// grammar's lens maths, and that it never touches a rule. node --test tests/storyrun-action.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionOn, frameOf, FRAMES, STINGS, CAMS } from '../wagmi/storyrun/action.js';

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
