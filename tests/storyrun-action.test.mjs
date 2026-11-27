// The story runner's action layer (r8, wagmi/storyrun/action.js): on by itself in a hometown world only, its shot
// grammar's lens maths, and that it never touches a rule. node --test tests/storyrun-action.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionOn, frameOf, FRAMES, STINGS, CAMS, clearLens, lensOnPerson, MIN_LENS, faceDir, readable, speakerLens, bodyOn, FAR, ASPECT, HEAD, BODY, FACING, FACE_MIN, FACE_H, inFrame, faceAngle, faceFwd, SWUNG } from '../wagmi/storyrun/action.js';

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

// (Colter Land, 18 Nov: RD-2's close-up on Jack framed his shirt, OF-1's line over a two-shot of two people 14 m apart,
// OF-2's speaker in a two-shot seen from behind)
const H = (x, y, z, h, more = {}) => Object.assign([x, y, z], { h }, more);
const looksAt = (fr, P) => { const fx = fr.LB[0] - fr.B[0], fy = fr.LB[1] - fr.B[1], fz = fr.LB[2] - fr.B[2], vx = P[0] - fr.B[0], vy = P[1] - fr.B[1], vz = P[2] - fr.B[2]; return (fx * vx + fy * vy + fz * vz) / (Math.hypot(fx, fy, fz) * Math.hypot(vx, vy, vz)); };

test('a face points the way the body faces, turned toward who it talks to only as far as a neck turns', () => {
  const f = faceDir(H(0, 1.7, 0, 0), [10, 1.7, 0]);
  assert.ok(Math.abs(Math.atan2(f[0], f[1]) - (70 * Math.PI) / 180) < 1e-9, 'turned 70 degrees toward the one on his right, no more');
  assert.deepEqual(faceDir(H(0, 1.7, 0, 0), [0, 1.7, 5]).map((x) => +x.toFixed(6)), [0, 1]);
  assert.deepEqual(faceDir([0, 1.7, 0], [3, 1.7, 0]).map((x) => +x.toFixed(6)), [1, 0], 'with no heading: the line to them');
  // (down on the ground with no face to go by: the way the body lies, not turned toward anyone)
  assert.deepEqual(faceDir(H(0, 0.4, 0, 0, { down: true }), [10, 1.7, 0]).map((x) => +x.toFixed(6)), [0, 1]);
});

test('a close-up is out in front of the face even when the body faces away from who they talk to; a face down low is seen from above', () => {
  // (Mara faces +z, Vale stands behind her: the old lens was at -z, behind her head)
  const heads = { mara: H(0, 1.6, 0, 0), vale: H(0, 1.7, -4, 0) };
  const fr = frameOf({ frame: 'close', on: 'mara', at: 'vale' }, (r) => heads[r]);
  const f = faceDir(heads.mara, heads.vale);
  assert.ok(fr.A[0] * f[0] + fr.A[2] * f[1] > 0.5, 'the lens is on the side her face points');
  const down = frameOf({ frame: 'close', on: 'p' }, () => H(0, 0.5, 0, 0, { down: true })), up = frameOf({ frame: 'close', on: 'p' }, () => H(0, 0.5, 0, 0));
  assert.ok(down.A[1] > up.A[1] + 0.3 && looksAt(down, [0, 0.46, 0]) > 0.999, 'from above, still on the face');
  // (the head where it is: a tall man's close-up looks at his own head, not at a standing height)
  const tall = frameOf({ frame: 'close', on: 'player' }, () => H(0, 1.79, 0, 0));
  assert.ok(Math.abs(tall.LA[1] - 1.75) < 0.02);
});

test('a two-shot is taken from the side of the line their faces are on', () => {
  // (both face -x: the lens on the -x side; the old one was always on the right of the line, +x here)
  const heads = { a: H(0, 1.7, 0, -Math.PI / 2), b: H(0, 1.7, 2, -Math.PI / 2) };
  const fr = frameOf({ frame: 'two', on: 'a', at: 'b' }, (r) => heads[r]);
  assert.ok(fr.A[0] < -1, 'in front of them');
  for (const P of [heads.a, heads.b]) assert.ok(inFrame(fr.B, fr.LB, fr.fov, P) > 0 && faceAngle(fr.B, P, P === heads.a ? heads.b : heads.a) < FACING, 'both faces in the frame, toward the lens');
  // (facing each other: as before, the right of the line)
  const fx = { a: H(0, 1.6, 0, 0), b: H(0, 1.7, 4, Math.PI) };
  assert.ok(frameOf({ frame: 'two', on: 'a', at: 'b' }, (r) => fx[r]).A[0] < 0);
  // (`at` a long way off, another scene: framed alone, not a lens half way between)
  const far = { a: H(0, 1.7, 0, 0), b: H(2000, 1.7, 2500, 0) };
  const lone = frameOf({ frame: 'two', on: 'a', at: 'b' }, (r) => far[r]);
  assert.ok(Math.hypot(lone.A[0], lone.A[2]) < 10, 'near her');
  assert.ok(FAR >= 20 && FAR <= 60);
});

test('who says a line is seen: in the frame, big enough, facing the lens, nothing between', () => {
  const P = H(0, 1.7, 0, 0);
  // (a close-up from in front: seen)
  assert.equal(readable([0, 1.72, 1.2], [0, 1.66, 0], 30, P), true);
  // (the same lens behind the head: the back of it)
  assert.equal(readable([0, 1.72, -1.2], [0, 1.66, 0], 30, P), false);
  // (20 m off in a 40 degree lens: a speck)
  assert.equal(readable([0, 1.7, 20], [0, 1.7, 0], 40, P), false);
  // (out of the frame: the lens looks away from him)
  assert.equal(readable([0, 1.7, 3], [5, 1.7, 3], 40, P), false);
  // (a wall between)
  assert.equal(readable([0, 1.72, 1.2], [0, 1.66, 0], 30, P, null, () => 0.4), false);
  assert.equal(readable([0, 1.72, 1.2], [0, 1.66, 0], 30, P, null, () => 1), true);
  assert.ok(FACE_MIN > 0 && FACE_MIN < 0.2);
});

test('the lens on a speaker the shot does not show: on their face, toward who they talk to, readable', () => {
  const S = H(0, 1.7, 0, Math.PI), O = H(-14, 1.7, 0, 0);
  const L = speakerLens(S, O);
  assert.ok(looksAt(L, S) > 0.99);
  assert.ok(readable(L.B, L.LB, L.fov, S, O) && readable(L.A, L.LA, L.fov, S, O));
  const f = faceDir(S, O); assert.ok(L.B[0] * f[0] + L.B[2] * f[1] > 1, 'out the way the face points');
  // (down on the ground: from above it)
  const D = speakerLens(H(0, 0.4, 0, 0, { down: true }));
  assert.ok(D.B[1] > 0.8 && looksAt(D, [0, 0.4, 0]) > 0.99);
  // (at the wheel: the car's own close-up, a car's length out)
  const C = speakerLens(H(0, 1.2, 0, 0, { car: true }));
  assert.ok(Math.hypot(C.A[0], C.A[2]) > 3);
  assert.equal(speakerLens(null), null);
});

test('a line from a face to the lens through someone else standing between is shut; one past them, or behind the face, is open', () => {
  const face = [0, 1.7, 0], lens = [0, 1.72, 2];
  assert.equal(bodyOn(face, lens, [[0.1, 1.75, 1.2]]), true, 'a man between: the back of his hat');
  assert.equal(bodyOn(face, lens, [[0.8, 1.75, 1.2]]), false, 'beside the line');
  assert.equal(bodyOn(face, lens, [[0, 1.75, -1]]), false, 'behind the face');
  assert.equal(bodyOn(face, lens, [[0, 1.75, 3]]), false, 'behind the lens');
  assert.equal(bodyOn(face, [0, 4.5, 2], [[0, 1.75, 1.6]]), false, 'over his head');
  assert.equal(bodyOn(face, lens, []), false);
});

// (RD-2's 'Fine. Fifteen million.', 18 Nov: a two-shot of Jack standing over Mercer down on the ground showed Jack
// belt-down, his head off the top, and Mercer's face at the very bottom under the line's plate; it was passed as seen)
test('a face low in the frame, under the line\'s plate or against a bar, is not seen; one clear of them is', () => {
  // (a face 3 m off, turned to the lens; the lens looks level, the face under or over the middle of the frame)
  const P = H(0, 0.25, 0, -Math.PI / 2);
  const t = Math.tan((40 * Math.PI) / 360), z = 3;
  // (the face 0.67 t under the middle of the frame: the old test took its centre against 0.72 t and passed it)
  const lookLow = [0, 0.25 + 0.67 * t * z, 0];
  assert.equal(readable([-z, lookLow[1], 0], lookLow, 40, P), false, 'under the plate');
  // (the same face a little higher, its chin clear of the plate: seen)
  const ok = 0.25 + 0.3 * t * z;
  assert.equal(readable([-z, ok, 0], [0, ok, 0], 40, P), true);
  // (as low, but out to the side of the plate: still under 0.74 t with its chin, seen; further down, against the bar, not)
  const side = [0, 0.25 + 0.55 * t * z, -t * ASPECT * 0.75 * z];
  assert.equal(readable([-z, side[1], side[2]], [0, side[1], side[2]], 40, P), true, 'beside the plate');
  const bar = [0, 0.25 + 0.72 * t * z, -t * ASPECT * 0.75 * z];
  assert.equal(readable([-z, bar[1], bar[2]], [0, bar[1], bar[2]], 40, P), false, 'against the bottom bar');
  // (a head at the top, the brow under the top bar: not seen)
  const top = 0.25 - 0.72 * t * z;
  assert.equal(readable([-z, top, 0], [0, top, 0], 40, P), false, 'off the top');
});

test('every lens a shot or a cut puts on a face keeps it clear of the bars and the line\'s plate', () => {
  const S = H(0, 1.7, 0, 0), O = H(0, 1.7, 1.6, Math.PI);
  for (const frame of ['close', 'push', 'react', 'low']) {
    const fr = frameOf({ frame, on: 's', at: 'o' }, (r) => (r === 's' ? S : O));
    assert.ok(readable(fr.A, fr.LA, fr.fov, S, O) && readable(fr.B, fr.LB, fr.fov, S, O), frame);
  }
  const D = H(0, 0.3, 0, 0, { down: true });
  for (const frame of ['close', 'push', 'react']) {
    const fr = frameOf({ frame, on: 'd' }, () => D);
    assert.ok(readable(fr.A, fr.LA, fr.fov, D) && readable(fr.B, fr.LB, fr.fov, D), 'down ' + frame);
  }
  const L = speakerLens(D, S);
  assert.ok(readable(L.A, L.LA, L.fov, D, S) && readable(L.B, L.LB, L.fov, D, S), 'the cut to a face on the ground');
});

test('a two-shot of one standing over another down on the ground has both faces in the frame', () => {
  // (Jack standing, Mercer on the ground 1.2 m off, faces 1.4 m apart in height)
  const heads = { jack: H(0, 1.68, 0, Math.PI / 2), mercer: H(1.2, 0.25, 0.2, -Math.PI / 2, { down: true }) };
  const fr = frameOf({ frame: 'two', on: 'jack', at: 'mercer' }, (r) => heads[r]);
  // (in the frame between the bars and over the plate, whichever way the faces point: seen by a lens turned to them)
  const seenIn = (pos, look, P) => inFrame(pos, look, fr.fov, P) > 0;
  for (const P of [heads.jack, heads.mercer]) assert.ok(seenIn(fr.A, fr.LA, P) && seenIn(fr.B, fr.LB, P), 'both faces in the frame');
  // (two standing: the two-shot as before)
  const st = { a: H(0, 1.7, 0, Math.PI / 2), b: H(1.6, 1.65, 0, -Math.PI / 2) };
  const fs = frameOf({ frame: 'two', on: 'a', at: 'b' }, (r) => st[r]);
  assert.ok(Math.hypot(fs.A[0] - 0.8, fs.A[2]) < 4, 'not pulled back');
});

test('a body between: its legs down to the ground, its shoulders across half the face, never an over-the-shoulder\'s own shoulder', () => {
  // (a face on the ground, a man standing over it between it and a lens low across the street: his legs)
  const face = [0, 0.25, 0], lens = [4, 0.9, 0];
  assert.equal(bodyOn(face, lens, [[1.2, 1.68, 0.1, 0]]), true, 'his legs, with his feet on the ground');
  assert.equal(bodyOn(face, lens, [[1.2, 1.68, 0.1]]), true, 'with no ground given: 1.6 m under the head');
  assert.equal(bodyOn(face, lens, [[1.2, 1.68, 0.1, 0.8]]), false, 'standing on something over the line');
  // (a face in a car, a man at its door, a long lens 8 m out: the line 0.33 m off his spine at his shoulders)
  const seat = [0, 1.2, 0], far = [8, 1.55, 0];
  assert.equal(bodyOn(seat, far, [[1, 1.72, 0.33, 0]]), true, 'his back across the face');
  assert.equal(bodyOn(seat, far, [[1, 1.72, 0.6, 0]]), false, 'beside it');
  // (an over-the-shoulder on a speaker 1.6 m off: the line passes the listener's head 0.27 m out; open)
  const heads = { a: H(0, 1.7, 0, 0), b: H(0, 1.7, 1.6, Math.PI) };
  const fr = frameOf({ frame: 'ots', on: 'a', at: 'b' }, (r) => heads[r]);
  assert.equal(bodyOn(heads.b, fr.A, [[...heads.a, 0]]), false, 'past his head');
  assert.equal(bodyOn(heads.b, fr.B, [[...heads.a, 0]]), false, 'past his head, pushed in');
  assert.ok(HEAD < BODY);
});

// (OF-1's 'That was the polite one', 18 Nov: a wall in front of Jack, the cut to him swung round to the back of his head)
test('a cut to a speaker with a wall in front of them is never swung round to the back of their head', () => {
  const S = H(0, 1.7, 0, 0), L = speakerLens(S);
  // (a wall across the way the face points, 1 m out: shut beyond it)
  // (sight(from, to): the open share of the line, from the face's side)
  const wall = (a, b) => (Math.max(a[2], b[2]) > 1 && Math.min(a[2], b[2]) < 1 ? (1 - a[2]) / (b[2] - a[2]) : 1);
  const free = clearLens(L, wall);
  assert.ok(free.how === 'swing' && free.lens.A[2] < 0, 'with nothing to keep: round behind the head');
  const kept = clearLens(L, wall, (P, Lk) => readable(P, Lk, L.fov, S));
  assert.ok(kept.lens.A[2] > 0 && kept.lens.B[2] > 0 && kept.lens.A[2] < 1, 'in front of the face, this side of the wall: ' + kept.how);
  assert.ok(readable(kept.lens.A, L.LA, L.fov, S) && readable(kept.lens.B, L.LB, L.fov, S));
});

// (Colter Land, 18 Nov, round 2: RD-2's tilted two-shot of Jack over Mercer, 4.3 m and more off, kept for both lines,
// Mercer's face 30 px in the grass and Jack's 'Still one ranch.' over the back of his bowed head; OF-1's cut to Jack
// swung past his profile by a wall)
const pitched = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
test('a lens side on at a head bowed down and away from it does not see the face', () => {
  // (Jack faces +z toward Mercer on the ground 1.2 m ahead, his head bowed 50 degrees; a lens out on his right, level)
  const jack = H(0, 1.68, 0, 0, { face: pitched(0, -50 * Math.PI / 180) }), mercer = H(0, 0.25, 1.2, Math.PI, { down: true });
  const side = [2.4, 1.6, 0.3], look = [0, 1.6, 0.3];
  assert.ok(inFrame(side, look, 40, jack) > FACE_MIN, 'in the frame and big enough');
  assert.equal(readable(side, look, 40, jack, mercer), false, 'the side and back of his bowed head');
  // (the flat way toward Mercer alone, no bone: side on is 90 degrees off it, past FACING too)
  assert.equal(readable(side, look, 40, H(0, 1.68, 0, 0), mercer), false);
  // (in front of him and under his bowed face: seen)
  assert.equal(readable([0.2, 1.1, 1.3], [0, 1.6, 0], 40, jack, mercer), true);
  assert.ok(faceFwd(jack)[1] < -0.7, 'the bone\'s pitch kept');
  assert.ok(FACING <= 75 * Math.PI / 180 && FACING >= 60 * Math.PI / 180);
});

test('a lens swung 110 degrees round from the way the face points is not kept', () => {
  const S = H(0, 1.7, 0, 0), look = [0, 1.62, 0];
  const at = (deg) => { const a = (deg * Math.PI) / 180; return [Math.sin(a) * 1.75, 1.72, Math.cos(a) * 1.75]; };
  assert.equal(readable(at(0), look, 32, S), true);
  assert.equal(readable(at(60), look, 32, S), true);
  assert.equal(readable(at(110), look, 32, S), false, 'past profile: the side and back of the head');
  assert.equal(readable(at(-110), look, 32, S), false);
  // (a wall a metre in front of the face: clearLens with readable to keep never takes a swing past FACING)
  const L = speakerLens(S), wall = (a, b) => (Math.max(a[2], b[2]) > 1 && Math.min(a[2], b[2]) < 1 ? (1 - a[2]) / (b[2] - a[2]) : 1);
  const kept = clearLens(L, wall, (P, Lk) => readable(P, Lk, L.fov, S));
  for (const P of [kept.lens.A, kept.lens.B]) assert.ok(faceAngle(P, S) <= FACING, kept.how);
  // (the cut's own swing keeps nearer the front: SWUNG)
  const near = clearLens(L, wall, (P, Lk) => readable(P, Lk, L.fov, S, null, null, SWUNG));
  for (const P of [near.lens.A, near.lens.B]) assert.ok(faceAngle(P, S) <= SWUNG + 1e-9, near.how);
  assert.equal(readable(at(60), look, 32, S, null, null, SWUNG), false);
  assert.ok(SWUNG < FACING);
});

test('a face 30 px high in a 720p frame is too small to say a line over; one 55 px high is not', () => {
  const P = H(0, 1.7, 0, Math.PI / 2), t = Math.tan((40 * Math.PI) / 360);
  // (the distance that puts the face (chin to brow) at n px of a 720 px frame, a 40 degree lens)
  const at = (px) => FACE_H / (2 * t * (px / 720));
  const z30 = at(30), z55 = at(55);
  assert.equal(readable([z30, 1.72, 0], [0, 1.66, 0], 40, P), false, '30 px at ' + z30.toFixed(1) + ' m');
  assert.equal(readable([z55, 1.72, 0], [0, 1.66, 0], 40, P), true, '55 px at ' + z55.toFixed(1) + ' m');
  assert.ok(Math.abs(FACE_MIN * 720 - 52) < 1, '52 px of 720');
  // (RD-2's tilted two-shot of one standing over another on the ground: too far for either face to say a line over)
  const heads = { jack: H(0, 1.68, 0, Math.PI / 2), mercer: H(1.2, 0.25, 0.2, -Math.PI / 2, { down: true }) };
  const fr = frameOf({ frame: 'two', on: 'jack', at: 'mercer' }, (r) => heads[r]);
  assert.ok(Math.hypot(fr.A[0] - 0.6, fr.A[2] - 0.1) > 4.2);
  assert.equal(readable(fr.A, fr.LA, fr.fov, heads.mercer, heads.jack), false, 'Mercer, a speck in the grass');
});

test('the cut to a speaker passes its own test: standing, bowed, on the ground on their back or side, the right way up', () => {
  const ok = (L, S, O = null) => readable(L.A, L.LA, L.fov, S, O) && readable(L.B, L.LB, L.fov, S, O);
  // (standing, the bone level; bowed 50 degrees to someone on the ground: from below, in front)
  const st = H(0, 1.7, 0, 0, { face: pitched(0.3, 0), up: [0, 1, 0] });
  assert.ok(ok(speakerLens(st), st));
  const bow = H(0, 1.68, 0, 0, { face: pitched(0, -50 * Math.PI / 180), up: pitched(0, 40 * Math.PI / 180) }), mer = H(0, 0.25, 1.2, Math.PI, { down: true });
  const Lb = speakerLens(bow, mer);
  assert.ok(ok(Lb, bow, mer), 'bowed');
  assert.ok(Lb.B[1] < bow[1] - 0.3 && Lb.B[2] > 1, 'under his face, in front of it');
  // (no bone: as before, toward who they talk to)
  const S = H(0, 1.7, 0, Math.PI), O = H(-14, 1.7, 0, 0);
  assert.ok(ok(speakerLens(S, O), S, O));
  // (on his back, face up, crown toward -x: over the face and toward his chin (+x), so the face is upright)
  const back = H(0, 0.25, 0, 0, { down: true, face: [0, 1, 0], up: [-1, 0, 0] }), Lk = speakerLens(back);
  assert.ok(ok(Lk, back), 'on his back');
  assert.ok(Lk.B[1] > 1 && Lk.B[0] > 0.3, 'over him, from his chin\'s side: ' + Lk.B.map((x) => x.toFixed(2)));
  // (on his side in the grass, face toward +z, crown toward +x)
  const side = H(0, 0.22, 0, 0, { down: true, face: [0, 0, 1], up: [1, 0, 0] }), Ls = speakerLens(side);
  assert.ok(ok(Ls, side), 'on his side');
  assert.ok(Ls.B[2] > 0.8 && Ls.B[1] > side[1] + 0.3, 'in front of his face and over it');
  // (down, the head turned up to look at someone standing (the cutscene's gaze, the world's up): from 35 degrees over
  // it, clear of the grass, never level with it)
  const look = H(0, 0.3, 0, 0, { down: true, face: [0, 0.2, 0.98], up: [0, 0.98, -0.2] }), Ll = speakerLens(look);
  assert.ok(ok(Ll, look));
  const el = Math.atan2(Ll.B[1] - look[1], Math.hypot(Ll.B[0], Ll.B[2]));
  assert.ok(el > 30 * Math.PI / 180 && el < 45 * Math.PI / 180, 'elevation ' + (el * 180 / Math.PI).toFixed(0));
  // (face down into the ground: still a lens, from above)
  const prone = H(0, 0.2, 0, 0, { down: true, face: [0, -1, 0], up: [0, 0, 1] }), Lp = speakerLens(prone);
  assert.ok(Lp && Lp.B[1] > 0.8);
});

// (OF-1's 'That was the polite one', 18 Nov, round 3: a hired man a metre in front of Jack, the cut pulled in to 0.9 m
// and looked out through the man's head)
test('a cut with someone standing between is never pulled in inside them; raised over their head it is open', () => {
  const S = H(0, 1.7, 0, 0), L = speakerLens(S), man = [[0.25, 1.75, 0.95, 0]];
  const see = (a, b) => (bodyOn(a, b, man) ? 0 : 1);
  const cl = clearLens(L, see, (P, Lk) => readable(P, Lk, L.fov, S, null, null, SWUNG));
  if (cl.how !== 'tight') for (const P of [cl.lens.A, cl.lens.B]) assert.equal(bodyOn(S, P, man), false, cl.how + ' ' + P.map((x) => x.toFixed(2)));
  assert.ok(!(cl.how === 'pull' && Math.hypot(cl.lens.A[0], cl.lens.A[2]) < 1.1), 'not pulled in to the man');
  const up = { ...L, A: [L.A[0], L.A[1] + 0.8, L.A[2]], B: [L.B[0], L.B[1] + 0.72, L.B[2]] };
  assert.equal(bodyOn(S, up.A, man) || bodyOn(S, up.B, man), false, 'over his head');
  assert.ok(readable(up.A, up.LA, up.fov, S, null, see) && readable(up.B, up.LB, up.fov, S, null, see));
});
