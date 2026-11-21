// What a hit costs the player's car (wagmi/crash/damage-cost.js, used by wagmi/crash/damage.js): the street's light
// things nearly free and its heavy ones still a crash, a glancing tap on another car cheaper than a head-on one, a
// wall head on dearer than a glance, and one contact's grinding blows costed once.
//   node --test tests/damage-cost.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { baseCost, hitCost, createContacts, afterHit, BUSY_FLOOR, COST } from '../wagmi/crash/damage-cost.js';
import { KINDS } from '../wagmi/crash/prop-kinds.js';

const prop = (kind, speed) => ({ kind: 'prop', speed, b: { kind } });

test('the props table is the one the crash knows (every kind has a mass)', () => {
  for (const [k, K] of Object.entries(KINDS)) assert.ok(K.mass > 0 && K.mass <= 1, k);
});

test('a light thing knocked flying is nearly free, a heavy one still hurts', () => {
  for (const k of ['basket', 'barricade', 'paperbox']) {
    const c = hitCost(prop(k, 56), KINDS);
    assert.ok(c < 0.003, `${k} at 56 m/s costs ${c}`);
  }
  // (a hundred litter baskets at 56 m/s are not a wreck)
  assert.ok(hitCost(prop('basket', 56), KINDS) * 100 < 0.1);
  const mast = hitCost(prop('mast', 56), KINDS), hyd = hitCost(prop('hydrant', 56), KINDS);
  assert.ok(mast > 0.03 && mast < 0.08, `mast ${mast}`);
  assert.ok(hyd > 0.012 && hyd < mast, `hydrant ${hyd}`);
  // (a mast is a crash: fifty litter baskets' worth and more)
  assert.ok(mast > 50 * hitCost(prop('basket', 56), KINDS));
  // heavier costs more, kind by kind
  const order = ['basket', 'barricade', 'paperbox', 'bench', 'post', 'mailbox', 'hydrant', 'cart', 'mast'].map((k) => hitCost(prop(k, 40), KINDS));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], `order at ${i}`);
});

test('a wall or a solid thing: head on the whole of the blow, a glance half', () => {
  assert.equal(hitCost({ kind: 'wall', speed: 30, headOn: 1 }), baseCost(30));
  assert.equal(hitCost({ kind: 'prop', solid: true, speed: 30, b: { kind: 'tree' } }, KINDS), baseCost(30));
  assert.ok(Math.abs(hitCost({ kind: 'wall', speed: 30, headOn: 0 }) - baseCost(30) / 2) < 1e-12);
  // (meaningful head on: a 55 m/s wall about 9%, a 40 m/s one 5%; a dozen of those smoke the car, not one)
  const h55 = hitCost({ kind: 'wall', speed: 55, headOn: 1 }), h40 = hitCost({ kind: 'wall', speed: 40, headOn: 1 });
  assert.ok(h55 > 0.07 && h55 < 0.12, `55 m/s ${h55}`);
  assert.ok(h40 > 0.04 && h40 < 0.07, `40 m/s ${h40}`);
  assert.ok(h40 * 12 > 0.6 && h40 * 12 < 0.85, 'a dozen 40 m/s crashes: smoking, not wrecked');
  assert.equal(hitCost({ kind: 'wall', speed: COST.FLOOR }), 0);
});

test('another car: a tap is free, a glancing blow cheaper than nose on, a bus harder', () => {
  assert.equal(hitCost({ kind: 'car', speed: 4, front: -1, mass: 2 }), 0);
  const nose = hitCost({ kind: 'car', speed: 20, front: -1, mass: 2 }), side = hitCost({ kind: 'car', speed: 20, front: 0.05, mass: 2 });
  assert.ok(nose > 0.01, `nose on at 20 m/s ${nose}`);
  assert.ok(side < nose * 0.5, `side on ${side} vs nose ${nose}`);
  const bus = hitCost({ kind: 'car', speed: 20, front: -1, mass: 12 });
  assert.ok(bus > nose && bus <= nose * 1.6 + 1e-9);
  // (a hit without where it struck counts as nose on)
  assert.equal(hitCost({ kind: 'car', speed: 20, mass: 2 }), nose);
});

test('one contact grinding on costs its hardest blow, not the sum', () => {
  const C = createContacts(0.35);
  let sum = 0;
  for (let i = 0; i < 20; i++) sum += C.charge('wall', 0.05 + (i === 5 ? 0.03 : 0), i * 0.016);
  assert.ok(Math.abs(sum - 0.08) < 1e-9, `charged ${sum}`);
  // another thing at the same moment is its own hit; the same one later on is a new one
  assert.equal(C.charge(7, 0.04, 0.1), 0.04);
  assert.equal(C.charge('wall', 0.05, 2), 0.05);
  assert.equal(C.charge(null, 0.02, 2), 0.02);
});

test('a mission or story step never wrecks the car: smoking at worst, WRECKED only free roaming', () => {
  // (the wreck line, where damage.js calls it WRECKED and limps it: 1 - LIMP.at)
  const src = fs.readFileSync(new URL('../wagmi/crash/damage.js', import.meta.url), 'utf8');
  const at = +/const LIMP = \{ at: ([0-9.]+)/.exec(src)[1], smokeAt = +/const SMOKE = \{ at: ([0-9.]+)/.exec(src)[1];
  assert.ok(BUSY_FLOOR > 1 - at && BUSY_FLOOR < 1 - smokeAt, `floor ${BUSY_FLOOR} between the wreck and the smoke`);
  let h = 1;
  for (let i = 0; i < 40; i++) h = afterHit(h, 0.09, true);
  assert.equal(h, BUSY_FLOOR);
  assert.equal(afterHit(h, 0.09, false), BUSY_FLOOR - 0.09);
  assert.equal(afterHit(0.1, 0.05, true), 0.1, 'already under it: kept, not healed');
  assert.equal(afterHit(0.5, -1, false), 0.5);
});

// (the cast critic, 20 Nov: a 15 m/s wall left a big crumple and the meter read "SCRATCHED 99%") The readout reads the car
// as it is seen: the worse of its health and its bent body (damage-cost.js wearOf, addWear, readoutOf)
import { wearOf, addWear, readoutOf, WEAR, WORDS, DENT } from '../wagmi/crash/damage-cost.js';
const wallAt = (sp) => 1 - hitCost({ kind: 'wall', speed: sp, headOn: 1 });

test('the meter: a big visible dent moves it and says so; a ding stays scratched', () => {
  // (a 15 m/s wall: a 20 cm crumple; its health only 99%)
  const big = readoutOf(wallAt(15), wearOf(15));
  assert.equal(big.word, 'DENTED'); assert.ok(big.pc <= 90 && big.pc >= 85, `big hit ${big.pc}%`);
  // (a scrape at 7 m/s: a ding of a few cm)
  const ding = readoutOf(wallAt(7), wearOf(7));
  assert.equal(ding.word, 'SCRATCHED'); assert.ok(ding.pc >= 95);
  // (under the dent's floor nothing wears)
  assert.equal(wearOf(DENT.MIN - 0.1), 0);
  // (harder, more: by the blow's energy, at most WEAR.MAX at once)
  assert.ok(wearOf(24) > wearOf(15) && wearOf(15) > wearOf(10));
  assert.equal(wearOf(80), WEAR.MAX);
});

test('the meter: hits stack to BATTERED; the body alone never reads SMOKING, WRECKED or under the floor', () => {
  let s = {}, t = 0;
  for (const z of ['front', 'left']) ({ sides: s, total: t } = addWear(s, z, wearOf(16)));
  const r2 = readoutOf(0.98, t);
  assert.equal(r2.word, 'DENTED', `two big hits ${r2.pc}%`);
  ({ sides: s, total: t } = addWear(s, 'front', wearOf(16)));
  const r3 = readoutOf(0.97, t);
  assert.equal(r3.word, 'BATTERED', `three big hits ${r3.pc}%`);
  for (const z of ['rear', 'right', 'front', 'left', 'rear']) ({ sides: s, total: t } = addWear(s, z, wearOf(30)));
  const r = readoutOf(0.9, t);
  assert.equal(r.word, 'BATTERED'); assert.ok(r.pc >= Math.round(BUSY_FLOOR * 100), `${r.pc}%`);
  // (a side wears to WEAR.SIDE at most, the body to WEAR.TOTAL: 1 - the 17% floor)
  assert.ok(Object.values(s).every((v) => v <= WEAR.SIDE + 1e-12));
  assert.ok(t <= WEAR.TOTAL + 1e-12 && Math.abs(WEAR.TOTAL - (1 - BUSY_FLOOR)) < 1e-12);
  // (the engine's words are the health's: smoking from SMOKE (40% health), wrecked under 15%, as the smoke and the limp)
  assert.equal(readoutOf(0.39, 0).word, 'SMOKING');
  assert.equal(readoutOf(0.1, 0).word, 'WRECKED');
  assert.equal(readoutOf(0.5, WEAR.TOTAL).word, 'BATTERED');
});

test('the meter: consistent with the health and the 17% a step keeps', () => {
  // (the health is the floor of what it reads: never better than the health)
  for (const h of [1, 0.9, 0.6, 0.41, 0.2]) for (const w of [0, 0.1, 0.4]) assert.ok(readoutOf(h, w).cond <= h + 1e-12);
  // (while a step runs the health never goes under BUSY_FLOOR (afterHit), and the meter reads no lower)
  const h = afterHit(0.2, 0.5, true);
  const r = readoutOf(h, WEAR.TOTAL, true);
  assert.equal(r.pc, Math.round(BUSY_FLOOR * 100)); assert.equal(r.word, 'SMOKING');
  assert.ok(readoutOf(1, WEAR.TOTAL, true).pc >= 17);
  // (the words in order down the scale)
  assert.ok(WORDS.dented > WORDS.battered && WORDS.battered > WORDS.smoking && WORDS.smoking > WORDS.wrecked);
  // (the readout says SCRATCHED only for a car that looks it)
  assert.equal(readoutOf(0.995, 0).word, 'SCRATCHED');
});

test('the readout in damage.js goes by readoutOf, and the wear is kept and repaired with the dents', () => {
  const src = fs.readFileSync(new URL('../wagmi/crash/damage.js', import.meta.url), 'utf8');
  assert.match(src, /const R = readoutOf\(D\.health, D\.wear, busy\(\)\)/);
  assert.match(src, /addWear\(wearSides, zone, wearOf\(dsp\)\)/);
  assert.match(src, /wear: 0 \}\); wearSides = \{\};/);
  assert.doesNotMatch(src, /D\.health < 0\.85 \? 'DENTED'/);
});
