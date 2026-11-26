// A set's close-up kept on its person's face (wagmi/storyrun/headlock.js), in every story world: the lens worked out at
// the shot's start follows the head as drawn, so a head read wrong (a pose cut that frame) or a body at the wrong height
// never loses its face. And the cut that read it wrong: a clip cut in is evaluated at once (sets.js blend, cast.js play).
// node --test tests/storyrun-headlock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeLock, isClose, CLOSE, DEAD } from '../wagmi/storyrun/headlock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const add = (a, m) => a.map((v, i) => v + m[i]);
// (the angle, in degrees, between where the lens looks and the face it should see)
const offAxis = (pos, look, face) => {
  const a = look.map((v, i) => v - pos[i]), b = face.map((v, i) => v - pos[i]);
  const dot = a.reduce((s, v, i) => s + v * b[i], 0), n = Math.hypot(...a) * Math.hypot(...b);
  return (Math.acos(Math.min(1, dot / n)) * 180) / Math.PI;
};
// Jensen's ST4 close as the pack writes it (close(B4, 'jensen', { off: 8, dist: 1.3 })), the lens worked out on a head
// read at 1.00 m (the stale bind state) while his head is drawn at 1.51 m
const SC = { rel: 'Jensen', right: -0.18, up: 0.04, fwd: 1.29 }, SCL = { rel: 'Jensen' };
const LA = [-0.6, 1.0, -2.2], A = [-0.42, 1.04, -0.92];

test('a close is a lens on someone looking at their own head; a wide, a look past them or at someone else is not', () => {
  assert.equal(isClose(SC, SCL, A, LA), true);
  assert.equal(isClose(SC, { rel: 'Jensen', up: 1.2, fwd: -6 }, A, LA), false, 'a look at a point through them (a wide)');
  assert.equal(isClose(SC, { rel: 'Lola Hart' }, A, LA), false, 'a look at someone else');
  assert.equal(isClose({ rel: 'Jensen', fwd: 5 }, SCL, [-0.6, 1.0, 2.9], LA), false, `a lens more than ${CLOSE} m out`);
  assert.equal(isClose([0, 1, 0], SCL, A, LA), false, 'a lens at a point in the room');
  assert.equal(isClose('player', SCL, A, LA), false);
  assert.equal(isClose(null, null, A, LA), false);
  assert.equal(closeLock(SC, { rel: 'Lola Hart' }, A, LA), null);
});

test('a head drawn anywhere from 0.8 m low to 0.8 m high is in the middle of its close from the first frame', () => {
  for (let dy = -0.8; dy <= 0.8001; dy += 0.1) {
    const lock = closeLock(SC, SCL, A, LA), face = [LA[0], LA[1] + dy, LA[2]];
    const m = lock.step(face, 0);
    const deg = offAxis(add(A, m), add(LA, m), face);
    assert.ok(deg < 0.01, `dy ${dy.toFixed(1)}: ${deg.toFixed(2)} deg off`);
  }
});

test('Jensen\'s ST4 close: read at 1.00 m, drawn at 1.51 m, the face is centred (it was 21 degrees under the lens, off a 33-degree frame)', () => {
  const face = [-0.6, 1.51, -2.2];
  assert.ok(offAxis(A, LA, face) > 16.5, 'without the lock his face is out of the frame');
  const lock = closeLock(SC, SCL, A, LA), m = lock.step(face, 0);
  assert.ok(offAxis(add(A, m), add(LA, m), face) < 0.01);
  // (and it stays there while he talks)
  let mm = m; for (let i = 0; i < 120; i++) mm = lock.step([-0.6, 1.51 + 0.02 * Math.sin(i / 6), -2.2], 1 / 60);
  assert.ok(offAxis(add(A, mm), add(LA, mm), face) < 1.5);
});

test('a head that bobs a little is left in the frame; a move past the dead zone is followed within a second; nothing jumps', () => {
  const lock = closeLock(SC, SCL, A, [-0.6, 1.5, -2.2]);
  assert.deepEqual(lock.step([-0.6, 1.5, -2.2], 0), [0, 0, 0], 'read right: no move');
  for (let i = 0; i < 60; i++) { const m = lock.step([-0.6, 1.5 + DEAD * 0.9 * Math.sin(i / 4), -2.2], 1 / 60); assert.deepEqual(m.map((v) => +v.toFixed(9)), [0, 0, 0], 'a bob inside the dead zone'); }
  // (sits down 0.2 m: followed to within the dead zone in a second, never more than a step a frame)
  let last = 0, m = [0, 0, 0];
  for (let i = 0; i < 60; i++) { m = lock.step([-0.6, 1.3, -2.2], 1 / 60); assert.ok(Math.abs(m[1] - last) < 0.02, 'eased'); last = m[1]; }
  assert.ok(Math.abs(m[1] + 0.2) <= DEAD + 0.01, `followed: ${m[1].toFixed(3)}`);
  // (a frame with no head read keeps the last move)
  assert.deepEqual(lock.step(null, 1 / 60), m);
  assert.deepEqual(lock.step([NaN, 1, 1], 1 / 60), m);
});

test('the runner keeps every set close on its face, and a clip cut in is evaluated before anything reads its bones', () => {
  const run = src('wagmi/storyrun/runner.js');
  assert.match(run, /import \{ closeLock \} from '\.\/headlock\.js';/);
  assert.match(run, /const lock = setRun\?\.active \? closeLock\(sc, scL, A, LA\) : null;/);
  assert.match(run, /lock\.step\(setRun\.point\(\{ rel: lock\.who \}\)/);
  assert.match(run, /p = p\.map\(\(x, i\) => x \+ m\[i\]\); l = l\.map\(\(x, i\) => x \+ m\[i\]\);/);
  // (the lock comes before the camera is set for the frame, and the set's frame takes that look)
  const at = run.indexOf('lock.step('), cam = run.indexOf('D.camera = { pos: [p[0] + hh.x', at), frame = run.indexOf('setRun.frame({ pos: D.camera.pos, look: l', at);
  assert.ok(at > 0 && cam > at && frame > cam);
  const sets = src('wagmi/storyrun/sets.js');
  assert.match(sets, /f\.mixer\.stopAllAction\(\); a\.play\(\); if \(!P\.started\) \{ a\.time = Math\.random\(\) \* cl\.duration; P\.started = true; \} f\.mixer\.update\(0\); \}/);
  // (a cut: everything stopped, the clip played and evaluated at once; a fade > 0 (a walk's start and stop) cross-fades)
  assert.match(src('wagmi/storyrun/cast.js'), /else \{ mixer\.stopAllAction\(\); a\.setLoop\([^\n]*a\.play\(\); mixer\.update\(0\); \}/);
  assert.match(src('wagmi/storyrun/cast.js'), /f\.play = \(n, loop = true, fade = 0\) =>/);
});

test('someone hidden in a set\'s people is not seen until a shot\'s act shows them (ST1: Jensen in the wings before his walk on)', () => {
  const sets = src('wagmi/storyrun/sets.js');
  assert.match(sets, /const P = \{ name: raw, fig, [^\n]*hidden: !!p\.hidden,/);
  assert.match(sets, /f\.root\.visible = !P\.hidden;/);
  assert.match(sets, /if \('hidden' in a\) P\.hidden = !!a\.hidden;/);
});
