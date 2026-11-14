// The story runner's guidance (wagmi/storyrun/guide.js): where the on-screen marker goes, the stuck watch, and an
// objective's words against what is in the world (the owner, 14 Nov: "I couldn't figure out where to go").
import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeOf, createStuck, propOf, reword, NEAR, STUCK_SECS, STUCK_FAR } from '../wagmi/storyrun/guide.js';

test('the marker sits over a spot in view, and at the edge pointing round to one out of it', () => {
  const a = edgeOf(0.2, -0.1, false);
  assert.equal(a.inView, true); assert.equal(a.x, 0.2); assert.equal(a.y, -0.1);
  const r = edgeOf(2.4, 0.3, false);
  assert.equal(r.inView, false); assert.ok(Math.abs(r.x - 0.9) < 1e-9, 'clamped to the right edge'); assert.ok(r.ang > 0 && r.ang < Math.PI, 'pointing right');
  const up = edgeOf(0, 3, false);
  assert.ok(Math.abs(up.y - 0.8) < 1e-9); assert.ok(Math.abs(up.ang) < 1e-9, 'pointing up');
});

test('a spot behind the camera is shown at the bottom edge, on its own side, pointing down (never mirrored to the top)', () => {
  // (the projection of a point straight behind mirrors it: NDC y -0.19 for a spot 60 m behind, as a town's camera has it)
  const b = edgeOf(0, -0.19, true);
  assert.equal(b.inView, false); assert.ok(Math.abs(b.y + 0.8) < 1e-9, 'at the bottom'); assert.ok(Math.abs(Math.abs(b.ang) - Math.PI) < 1e-9, 'pointing down');
  // behind and to the left: NDC x is mirrored to +, the marker goes left
  const l = edgeOf(0.6, 0.1, true);
  assert.ok(l.x < 0, 'on the left'); assert.ok(l.y < 0, 'low'); assert.ok(l.ang < -Math.PI / 2, 'pointing down and left');
});

test('stuck: past 90 s of play on one objective on foot and still over 30 m off; said once; a new objective starts over', () => {
  assert.equal(STUCK_SECS, 90); assert.equal(STUCK_FAR, 30); assert.equal(NEAR, 40);
  const s = createStuck();
  let r;
  for (let i = 0; i < 89; i++) r = s.step(1, 'a', 60, true);
  assert.equal(r.stuck, false);
  r = s.step(2, 'a', 60, true); assert.equal(r.stuck, true); assert.equal(r.fresh, true);
  r = s.step(1, 'a', 60, true); assert.equal(r.stuck, true); assert.equal(r.fresh, false, 'the help line once');
  r = s.step(1, 'a', 20, true); assert.equal(r.stuck, false, 'close enough: no pulse');
  r = s.step(1, 'b', 60, true); assert.equal(r.stuck, false); assert.ok(r.secs <= 1, 'a new objective starts over');
  // (in the car the clock waits: the stuck help is for a man on foot)
  const c = createStuck();
  for (let i = 0; i < 200; i++) r = c.step(1, 'a', 60, false);
  assert.equal(r.stuck, false);
});

test("an objective's words: the thing it names, a vehicle before a thing; the place's own name does not count", () => {
  const lot = { name: 'the boat-trailer lot' };
  assert.equal(propOf({ objective: "Take **Ruben's salvage log** from his truck.", label: 'take the salvage log' }, lot)[0], 'pickup');
  assert.equal(propOf({ objective: 'Grab the cash from **the blue van**{red}.' }, lot)[0], 'van');
  assert.equal(propOf({ objective: 'Search the minivan.' }, lot)[0], 'minivan');
  assert.equal(propOf({ objective: 'Find the duffel bag.' }, lot)[0], 'bag');
  assert.equal(propOf({ objective: 'Open the locker.' }, lot)[0], 'crate');
  assert.equal(propOf({ objective: 'Search **the hospital doors**.', label: 'Search the doors' }, { name: 'the hospital doors' }), null);
  assert.equal(propOf({ objective: 'Look round **the car wash**.' }, { name: 'the car wash' }), null, 'a car wash is no car');
  assert.equal(propOf({ objective: 'Search his truck.', prop: false }, lot), null, 'prop: false');
  assert.equal(propOf({ objective: 'Search it.', prop: 'case' }, lot)[0], 'case', 'prop names one');
});

test('a named thing with no room for it: the objective says the place instead', () => {
  const lot = { name: 'the boat-trailer lot' };
  const d = { objective: "Take **Ruben's salvage log** from his truck.", label: 'take the salvage log' };
  assert.equal(reword(d.objective, d, lot), "Take **Ruben's salvage log** at **the boat-trailer lot**.");
  const v = { objective: 'Grab the cash from **the blue van**{red}.' };
  assert.equal(reword(v.objective, v, { name: 'Pier 9' }), 'Grab the cash at **Pier 9**.');
  const n = { objective: "Check Kip's van for the keys." };
  assert.equal(reword(n.objective, n, lot), "Check Kip's van for the keys at **the boat-trailer lot**.", 'no phrase to swap: the place after it');
});
