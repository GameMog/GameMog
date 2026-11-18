// A driver's head under his car's roof (16 Nov, the owner: in the newer worlds the main character's crown came out
// through the roof). wagmi/roadster.js createDriver reads his crown off his own skin and seats him under the car's own
// roof (seatFit): a car he fits leaves him be; one he is through lowers him (never under the floor's limit, nor into a
// ready-made model's cushion by more than 2 cm), then eases the seat back, reclines him, and last makes him a little
// smaller. A headrest, a back bench or a deck behind an open car's seats is no roof. The sheet-built car's driver's seat
// (its own mesh, out of the body's merge) goes down and back with him; a car wearing a mission's ride counts that
// body's seat as its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../wagmi/roadster.js', import.meta.url), 'utf8');
const BUILD = readFileSync(new URL('../wagmi/storyrun/vehicles/build-vehicle.js', import.meta.url), 'utf8');
// (seatFit alone, out of the module, which needs three)
const a = SRC.indexOf('export function seatFit'), b = SRC.indexOf('\n}\n', a) + 3;
const seatFit = new Function(SRC.slice(a, b).replace('export ', '') + '\nreturn seatFit;')();

// a crown 0.80 m over the hip mark (the measured seated people: 0.76-0.82), its front half at z >= -0.22
const crown = [[0, 0.8, -0.22], [0.04, 0.79, -0.22], [-0.04, 0.79, -0.22], [0, 0.79, -0.18], [0, 0.785, -0.26]];
const HIP = [0.4, 0.536, 0.2];
// a flat roof: skin at y, lining 4 cm under it
const flat = (y) => () => [y + 0.04, y];

test('a head through a closed roof: the hip goes down till the crown is 3 cm under the lining', () => {
  const f = seatFit(crown, flat(1.257), HIP);
  assert.ok(Math.abs(f.drop - (0.536 + 0.8 + 0.03 - 1.257)) < 1e-9, JSON.stringify(f));
  assert.deepEqual([f.slide, f.recline, f.shrink, f.left], [0, 0, 1, 0]);
});

test('a car he fits is left be: under the skin and into the lining by 3 cm at most, or an open car', () => {
  assert.equal(seatFit(crown, flat(1.6), HIP).drop, 0);
  // (crown 1.336: the skin 1.356 over it, the lining 1.316, 2 cm into it)
  assert.equal(seatFit(crown, () => [1.356, 1.316], HIP).drop, 0);
  assert.equal(seatFit(crown, () => [], HIP).drop, 0);
});

test('a surface under his crown deeper than he could sit under is no roof (an open car\'s deck)', () => {
  // (0.25 m under the crown, the head 0.17 under it, the floor letting him down 2 cm)
  // (a deck doesn't run on forward over him: roofAt(x, z, true) has none)
  const f = seatFit(crown, (x, z, back) => (back ? [] : [0.536 + 0.8 - 0.25]), HIP, { head: 0.17, reach: 0.19 });
  assert.equal(f.drop, 0);
});

test('over the back of his head only a roof over his head bone counts (a headrest under it is none)', () => {
  // (the back point, z -0.26, over a headrest 10 cm under the crown, no roof over the rest of him)
  const roofAt = (x, z, back) => (back ? [] : [1.6]);
  assert.equal(seatFit(crown, roofAt, HIP).drop, 0);
});

test('never under the floor limit; then the seat eased back, him reclined, last a smaller figure', () => {
  // (a roof that falls forward: lower at the front of his head; the floor lets him down 5 cm only)
  const roofAt = (x, z) => [1.3 + (0.0 - z) * 0.5];
  const f = seatFit(crown, roofAt, HIP, { minHip: 0.486 });
  assert.ok(f.drop <= 0.05 + 1e-9, JSON.stringify(f));
  assert.ok(f.slide > 0 || f.recline > 0 || f.shrink < 1, JSON.stringify(f));
  assert.ok(f.left <= 0.01 + 1e-9, JSON.stringify(f));
  assert.ok(f.shrink >= 0.96 - 1e-9 && f.recline <= 0.35 + 1e-9 && f.slide <= 0.12 + 1e-9);
  // (with no seat to slide (a ready-made model's) it reclines or shrinks)
  const g = seatFit(crown, roofAt, HIP, { minHip: 0.486, maxSlide: 0 });
  assert.equal(g.slide, 0); assert.ok(g.recline > 0 || g.shrink < 1);
  // (and his hands must still reach: a reach test that refuses every change leaves only the drop)
  const h = seatFit(crown, roofAt, HIP, { minHip: 0.486, reachOk: () => false });
  assert.deepEqual([h.slide, h.recline, h.shrink], [0, 0, 1]); assert.ok(h.left > 0);
});

test('the driver fits his head each time he gets in, his hips, heels, back and size from it, and the seat goes with him', () => {
  assert.match(SRC, /attach\(ease = fade\) \{[\s\S]*?try \{ fitHead\(\); \}/);
  assert.match(SRC, /\[0\.75, hx \+ 0\.04 \* sc, hy, hz - slide\], \[1, hx, hy, hz - slide\]/);
  assert.match(SRC, /\[1, hx - fx, fy, fz\]/);
  assert.match(SRC, /tilt = tilt0 \+ \(recline - hunch\) \* smooth/);
  assert.match(SRC, /body\.scale\.copy\(scale0\)\.multiplyScalar\(1 \+ \(shrink - 1\)/);
  // (his own size back when he gets out)
  assert.match(SRC, /detach\(parent\) \{[\s\S]*?if \(scale0\) body\.scale\.copy\(scale0\)/);
  // (the seat: this car's or the worn body's, down and back with him)
  assert.match(SRC, /\[\.\.\.\(rs\.seatParts \|\| \[\]\), \.\.\.\(worn\?\.seatParts \|\| \[\]\)\]/);
  assert.match(SRC, /p\.position\.y = p\.userData\.at0\.y - drop; p\.position\.z = p\.userData\.at0\.z - slide;/);
  // (a ready-made model's cushion is his seat's floor, read right under where he sits: the up-facing surfaces under the
  // underside of his pelvis, no higher than 10 cm over his hip mark, his flesh into it 2 cm at most, or no deeper than
  // it already was)
  assert.match(SRC, /filter\(\(\[y, , up\]\) => up && y < Math\.min\(h \+ 0\.1, hy0 \+ 0\.02\) && y > h \+ py - 0\.35\)/);
  assert.match(SRC, /if \(k != null && k > Math\.max\(0\.02, k0\)\) break; ok\.push\(y\);/);
  assert.match(SRC, /const h = ok\.find\(\(y\) => y <= hy0 - fit\.drop \+ 1e-6\);/);
  assert.match(SRC, /if \(fleet\) \{ const c = cushionAt\(0\); if \(c != null\) \{ cushion = c - crown\.seat; minHip = Math\.max\(minHip, c\); \} \}/);
  // (still through: further recline, a smaller figure, a model's seat's hips forward, only as the last resort)
  assert.match(SRC, /const opts = \{ skin: fleet \? 0\.02 : 0\.01,/);
  assert.match(SRC, /last: fleet \? \{ maxRecline: 0\.45, minShrink: 0\.88, minSlide: -0\.12 \} : null/);
});

test('a sheet-built car\'s driver\'s seat is its own mesh, out of the body\'s merge', () => {
  assert.match(BUILD, /if \(side === 1\) seatParts\.push\(\.\.\.parts\)/);
  assert.match(BUILD, /if \(own\.has\(m\)\) ownGeos\.push\(geo\)/);
  assert.match(BUILD, /mm\.name = 'driver-seat'/);
  assert.match(BUILD, /seat: SEAT, seatParts,/);
});

test('a thin roof: his crown 2 cm under its skin, or he is lowered', () => {
  // (a roof 2 cm thick, the crown into its lining by 0.5 cm, 1.5 cm under its skin: in the old 3 cm band, lowered now,
  // 3 cm under the lining)
  const top = 0.536 + 0.8, f = seatFit(crown, () => [top + 0.015, top - 0.005], HIP);
  assert.ok(Math.abs(f.drop - 0.035) < 1e-9, JSON.stringify(f));
  // (a thick one, the crown as far into it, 6 cm under its skin: he fits)
  assert.equal(seatFit(crown, () => [top + 0.06, top - 0.005], HIP).drop, 0);
});

test('a lining well over his shoulders is a roof however high the cushion keeps him, if it runs on forward', () => {
  // (the cushion lets him down 1 cm (reach small): the lining 0.5 m over the hip mark, 0.3 m under his crown)
  const lining = 0.536 + 0.5, roofAt = () => [lining + 0.05, lining];
  // (a lone panel that deep, no skin over it, is none)
  assert.equal(seatFit(crown, () => [lining], HIP, { reach: 0.18, minHip: 0.526, maxSlide: 0 }).drop, 0);
  const f = seatFit(crown, roofAt, HIP, { reach: 0.18, minHip: 0.526, maxSlide: 0 });
  assert.ok(f.need > 0.3, JSON.stringify(f));
  // (a deck behind an open car's seats doesn't run on forward: none)
  assert.equal(seatFit(crown, (x, z, back) => (back ? [] : [lining]), HIP, { reach: 0.18, minHip: 0.526 }).drop, 0);
});

test('where the usual remedies leave him through, the last ones: further recline, a smaller figure, hips forward', () => {
  // (a low cabin: lining 0.62 m over the hip mark, the hips can't go down at all)
  const roofAt = (x, z) => [0.536 + 0.62 + 0.04, 0.536 + 0.62];
  const pivot = [0, 0.007, 0.06];
  const a1 = seatFit(crown, roofAt, HIP, { minHip: 0.536, maxSlide: 0, pivot });
  assert.ok(a1.left > 0 && a1.recline <= 0.35 + 1e-9 && a1.shrink >= 0.96 - 1e-9 && !a1.last, JSON.stringify(a1));
  const a2 = seatFit(crown, roofAt, HIP, { minHip: 0.536, maxSlide: 0, pivot, last: { maxRecline: 0.45, minShrink: 0.88, minSlide: -0.12 } });
  assert.ok(a2.last && a2.left < a1.left, JSON.stringify(a2));
  assert.ok(a2.recline <= 0.45 + 1e-9 && a2.shrink >= 0.88 - 1e-9 && a2.slide >= -0.12 - 1e-9, JSON.stringify(a2));
  // (a slide that takes his crown out from under the roof as it reads is no answer: it doesn't know what is there)
  const edge = (x, z) => (z > 0.2 - 0.25 ? [] : [0.536 + 0.62 + 0.04, 0.536 + 0.62]);
  const a3 = seatFit(crown, edge, HIP, { minHip: 0.536, maxSlide: 0, pivot, minSlide: -0.12, last: { maxRecline: 0.45, minShrink: 0.88, minSlide: -0.12 } });
  assert.ok(a3.slide > -0.03, JSON.stringify(a3));
  // (the hips forward onto a lower pan: minHipAt(slide))
  const a4 = seatFit(crown, roofAt, HIP, { minHip: -Infinity, minHipAt: (s) => (s < -0.05 ? 0.4 : 0.536), maxSlide: 0, minSlide: -0.12, pivot });
  assert.ok(a4.slide < -0.05 && a4.drop > 0 && a4.left < 0.01, JSON.stringify(a4));
});

test('the game path fits him as the standalone build does: his crown read again at a new size, the neck turned once', () => {
  // (a hero scaled after he first sat in the car (the worn ride keeps the same driver) is fitted by his new crown)
  assert.match(SRC, /size !== crownSize\) \{[^}]*crown = readCrown\(\); crownSize = size; fitKey = null;/);
  // (the reclined driver's neck: a still clip (three's mixer leaves an unchanged bone alone) isn't bent again each call)
  assert.match(SRC, /mixer\.update\(dt\); keepHands\(\); if \(B\.neck01\) keepNeck\(\);/);
  assert.match(SRC, /keepNeck = \(\) => \{ if \(NK\.wrote && B\.neck01\.quaternion\.equals\(NK\.wrote\)\) B\.neck01\.quaternion\.copy\(NK\.pre\);/);
  // (slid forward on a model's pan, the crease's cushion doesn't hold his hips up: minHip0 with minHipAt(slide))
  assert.match(SRC, /minHip: fleet \? minHip0 : minHip, minHipAt,/);
});

test('the very last resort: a size that leaves part of his crown out from under the roof as read, to the skin only', () => {
  // (a roof that ends over the back of his crown: shrinking moves those points off it)
  const roofAt = (x, z) => (z < 0.2 - 0.235 ? [] : [0.536 + 0.8, 0.536 + 0.75]);
  const o = { minHip: 0.536, maxSlide: 0, maxRecline: 0, minShrink: 1, settle: true, last: { maxRecline: 0, minShrink: 0.85, minSlide: 0 } };
  const g = seatFit(crown, roofAt, HIP, o);
  const f = seatFit(crown, roofAt, HIP, { ...o, guard: false, gap: -1, skin: 0.03 });
  assert.ok(f.shrink < 1 && f.shrink >= 0.85 - 1e-9, JSON.stringify(f));
  // (against the skin only: no smaller than takes the crown 3 cm under it)
  assert.ok(0.8 * f.shrink + 0.03 <= 0.8 + 0.011, JSON.stringify(f));
  assert.ok(g.shrink < 1, JSON.stringify(g));
});

// (17 Nov: in the town fleet's cars his hands were 15 to 21 cm short of the wheel, lowered under the roof with the wheel
// where it was) seated as fitted, a wrist that can't reach its grip's mark brings his hips forward and leans him forward,
// the least of the two, and never takes his crown further out from under the roof; the passenger pack's own wheels
test('his hands on the wheel: hips forward and a lean, as little as reaches, never his head through the roof', () => {
  assert.match(SRC, /const REACH_FWD = 0\.16, REACH_LEAN = 0\.16;/);
  assert.match(SRC, /out\.wrist = Math\.min\(out\.wrist \?\? Infinity, at\(u\)\.distanceTo\(at\(l\)\) \+ at\(l\)\.distanceTo\(at\(w\)\)\)/);
  assert.match(SRC, /const want = crown\.wrist \* k - 0\.05/);
  assert.match(SRC, /if \(h\.left > Math\.max\(left0, fit\.left\) \+ 0\.005\) break;/);
  assert.match(SRC, /hunch = fit\.lean \|\| 0/);
  const FD = readFileSync(new URL('../cities/sf/js/fleet-data.js', import.meta.url), 'utf8');
  for (const id of ['pickup20', 'suv20', 'offroad20', 'minivan20', 'taxi20', 'police20']) {
    const m = FD.match(new RegExp(`"${id}":\\{[^]*?"steer":(\\[[^\\]]*\\]|null)`));
    assert.ok(m && m[1] !== 'null', id + ' has its own steering wheel');
  }
});
