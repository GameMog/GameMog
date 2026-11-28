// The story's props and set pieces (wagmi/storyrun/props.js, flotilla.js, shotcam.js, prewarm.js's live calls): the
// prop words a pack may use, the river the flotilla finds, a shot's moves and paths, a lens kept out of a car's body,
// off a wall and under a deck, and a live call's offices pooled.
//   node --test tests/story-props.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { propKind, PROP_KINDS, PROP_SIZE } = await import('../wagmi/storyrun/props.js');
const { findWater, riverAxis, FLOTILLA_MAX } = await import('../wagmi/storyrun/flotilla.js');
const { shotMove, pathOf, carSight, outOfBoxes, clearRoom, MOVES, ROOM } = await import('../wagmi/storyrun/shotcam.js');
const { feedList } = await import('../wagmi/storyrun/prewarm.js');

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('a prop is named by its kind or another word for it, and nothing else', () => {
  for (const k of PROP_KINDS) { assert.equal(propKind(k), k); assert.ok(PROP_SIZE[k] > 0, k); }
  assert.equal(propKind('Duffle'), 'duffel'); assert.equal(propKind('rubber-duck'), 'duck'); assert.equal(propKind('bag-open'), 'duffel-open');
  assert.equal(propKind('pistol'), null); assert.equal(propKind(''), null); assert.equal(propKind(null), null);
});

// a river 40 m wide running north-east from (0, 0) (its middle the line z = x), dry either side
const river = (x, z) => (Math.abs(z - x) / Math.SQRT2 < 20 ? 0.21 : null);
test('the flotilla finds the nearest water, the river\'s way and its width', () => {
  const c = findWater(river, 100, 0); assert.ok(c && river(c.x, c.z) != null);
  assert.ok(Math.hypot(c.x - 100, c.z) <= 60, 'the nearest water, not any');
  assert.equal(findWater(() => null, 0, 0, 40), null);
  const ax = riverAxis(river, { x: 10, z: 10 });
  near(Math.abs(ax.u[0] * Math.SQRT1_2 + ax.u[1] * Math.SQRT1_2), 1, 0.02); // (along the river)
  assert.ok(ax.width > 34 && ax.width < 46, `width ${ax.width}`);
  assert.ok(Math.abs(ax.mid.z - ax.mid.x) / Math.SQRT2 < 3, 'laid down its middle');
  assert.ok(FLOTILLA_MAX >= 980);
});

test('a shot\'s moves end where they say', () => {
  const A = [0, 1.6, -4], L = [0, 1.6, 0];
  for (const m of MOVES) assert.ok(shotMove(m, A, L), m);
  assert.equal(shotMove('zoom', A, L), null);
  const push = shotMove('push', A, L, 0.25); near(dist(push.B, L), 3); assert.deepEqual(push.LB, L);
  const pull = shotMove('pull', A, L, 0.25); near(dist(pull.B, L), 5);
  // (never closer than 0.6 m, nor more than 1.4 m in one shot)
  near(dist(shotMove('push', [0, 0, -1], [0, 0, 0], 0.9).B, [0, 0, 0]), 0.6);
  near(dist(shotMove('push', [0, 0, -20], [0, 0, 0], 0.5).B, [0, 0, -20]), 1.4);
  const orb = shotMove('orbit', A, L, 90); near(dist(orb.B, L), 4); near(orb.B[1], 1.6);
  const cr = shotMove('crane', A, L, 1); near(cr.B[1], 2.6); assert.ok(cr.LB[1] > L[1]);
  const tr = shotMove('track', A, L, 2); near(dist(tr.B, A), 2); near(dist(tr.LB, L), 2);
});

test('a path runs through its points, at an even pace', () => {
  const pts = [[0, 0, 0], [10, 0, 0], [10, 0, 10]], f = pathOf(pts);
  assert.ok(dist(f(0), pts[0]) < 1e-6 && dist(f(1), pts[2]) < 1e-6);
  assert.ok(dist(f(0.5), pts[1]) < 0.6, 'the middle point near the half way');
  const a = dist(f(0.1), f(0.2)), b = dist(f(0.7), f(0.8)); assert.ok(Math.abs(a - b) / a < 0.15, `even: ${a} ${b}`);
  assert.equal(pathOf([[0, 0, 0]]), null);
});

const box = { x: 0, z: 0, h: 0, hx: 1, z0: -2.3, z1: 2.4, y0: 0, y1: 1.5 };
test('a lens is never in a car\'s body, nor looks through one, except at a face inside it', () => {
  const s = carSight([box]);
  assert.equal(s([5, 1, 0], [10, 1, 0]), 1, 'clear of it');
  assert.ok(s([-5, 1, 0], [5, 1, 0]) < 0.5, 'through it: stopped at it');
  assert.equal(s([0, 1.1, 0], [5, 1.2, 0]), 1, 'from a face in the car: its glass');
  const P = outOfBoxes([0.3, 1.0, 0.5], [4, 1.1, 0], [box]);
  assert.ok(!(Math.abs(P[0]) < 1 && P[2] > -2.3 && P[2] < 2.4 && P[1] < 1.5), `out: ${P}`);
  assert.deepEqual(outOfBoxes([4, 1, 0], [0, 1, 0], [box]), [4, 1, 0]);
  // (a lens in the car on a face in the same car: an interior shot, kept)
  assert.deepEqual(outOfBoxes([0.3, 1.2, 1.2], [0.3, 1.2, 0.2], [box]), [0.3, 1.2, 1.2]);
  // (but a push that ran into her car's body from outside it is put back out)
  const Q = outOfBoxes([0.3, 1.2, 1.2], [0.3, 1.2, 0.2], [box], { keepSame: false });
  assert.ok(Q[2] > 2.4 || Q[1] > 1.5, `out: ${Q}`);
});

test('a person between the face and the lens blocks it, even one close enough to hug', () => {
  const her = { person: true, x: 0, z: 0.45, h: 0, hx: 0.26, z0: -0.26, z1: 0.26, y0: 0, y1: 1.9 };
  const s = carSight([her]);
  // (his face at z 0.2, inside her box's reach; the lens 2 m behind her)
  assert.ok(s([0, 1.6, 0.2], [0, 1.6, 2.5]) < 1, 'her head in the way');
  assert.equal(s([0, 1.6, 0.2], [2.5, 1.6, -1]), 1, 'from the other side, clear');
});

test('a lens steps off a wall and stays under the deck over its subject', () => {
  // (a wall along x = 1: anything past it is shut)
  const sight = (a, b) => { if ((a[0] - 1) * (b[0] - 1) >= 0) return 1; return Math.abs((1 - a[0]) / (b[0] - a[0])); };
  const P = clearRoom([0.4, 1.6, 0], [-4, 1.6, 0], sight);
  assert.ok(P[0] < 0.4 && 1 - P[0] > 0.9, `off the wall: ${P}`);
  assert.deepEqual(clearRoom([-3, 1.6, 0], [-6, 1.6, 0], sight), [-3, 1.6, 0], 'room already');
  const U = clearRoom([0, 5, 0], [0, 1.6, 3], null, () => 4.2);
  assert.ok(U[1] < 4.2, 'under the deck'); assert.ok(ROOM >= 1.5);
});

test('a live call\'s people are pooled under the card; the hero is not', () => {
  const steps = [{ type: 'transition' }, { type: 'drive', during: [{ type: 'vcall', live: true, time: 'night', people: [{ who: 'kiki', office: 'greenroom' }, { who: 'player', office: 'car' }, { who: 'bernie', office: 'car' }] }] }];
  const f = feedList(steps, 0, { heroName: 'mandi' });
  assert.deepEqual(f.map((x) => x.who), ['kiki', 'bernie']);
  assert.deepEqual(f[0].video, { office: 'greenroom', light: 'night' });
  // (nobody the mission stands on the street: Jay, its npc, talks from the passenger seat)
  const withJay = [{ type: 'npc', who: 'jay' }, { type: 'vcall', live: true, people: [{ who: 'jay', office: 'car' }, { who: 'kiki', office: 'greenroom' }, { who: 'player' }] }];
  assert.deepEqual(feedList(withJay, 0, { heroName: 'mandi' }).map((x) => x.who), ['kiki']);
  // (a call that is not live is a full-screen one: nothing pooled for it here)
  assert.equal(feedList([{ type: 'vcall', people: [{ who: 'kiki' }, { who: 'player' }] }], 0, { heroName: 'mandi' }).length, 0);
});
