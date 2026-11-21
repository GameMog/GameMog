// The damage look (the owner, 20 Nov: "should a big front crash give a brief camera look at the damage? BRIEF"):
// wagmi/crash/damage-look.js's rules (the threshold, the stop, the cooldown, input cancelling it, never in a cutscene, a
// call or a chase) and its wiring (wagmi/crash/damage.js offers each hit and steps it; js/cameras.js swings the chase
// lens by it).
//   node --test tests/damage-look.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDamageLook, blockedBy, envelope, lookLength, LOOK } from '../wagmi/crash/damage-look.js';
import { DENT, dentSize } from '../wagmi/crash/damage-cost.js';

const ROOT = new URL('..', import.meta.url).pathname;
const DT = 1 / 60;
const keys0 = () => ({ forward: false, backward: false, left: false, right: false, up: false, down: false, boost: false });
const calm = (o = {}) => ({ speed: 0, keys: keys0(), orbit: false, blocked: null, ...o });
const big = { zone: 'front', dsp: 16, lx: 0 };
// run n frames; the peak |yaw| and how long it was on
function run(L, secs, ctx = calm, each) {
  let peak = 0, on = 0;
  for (let i = 0; i < Math.round(secs / DT); i++) { const c = typeof ctx === 'function' ? ctx(i) : ctx; const o = L.update(DT, c); if (each) each(i, o); peak = Math.max(peak, Math.abs(o.yaw)); if (o.active) on += DT; }
  return { peak, on };
}

test('its threshold is the big dent\'s: 15 m/s of dent speed, the one that leaves the 20 cm crumple', () => {
  assert.equal(LOOK.MIN, DENT.BIG);
  assert.ok(Math.abs(dentSize(LOOK.MIN).depth - 0.2) < 1e-9);
});

test('a big front hit, the car stopped: a look of about 1-1.5 s, eased out and back, a three-quarter swing', () => {
  const L = createDamageLook();
  assert.equal(L.offer(big, calm()), true);
  const ys = [];
  const r = run(L, 2, calm(), (i, o) => ys.push(o.yaw));
  assert.ok(r.on > 1 && r.on < 1.5, `on ${r.on.toFixed(2)} s`);
  assert.ok(lookLength() >= 1 && lookLength() <= 1.5);
  assert.ok(r.peak > 1.9 && r.peak < 2.6, `peak ${r.peak}`);
  // (smooth: no jump of more than a few degrees a frame, starting and ending at nothing)
  for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1]) < 0.15, `frame ${i}: ${ys[i - 1]} -> ${ys[i]}`);
  assert.ok(Math.abs(ys[0]) < 0.05 && ys[ys.length - 1] === 0);
  assert.equal(envelope(0), 0); assert.equal(envelope(LOOK.OUT + 0.1), 1); assert.equal(envelope(lookLength()), 0);
});

test('only big and only the nose: a 14 m/s nose hit, a big hit on the back or a side, nothing', () => {
  for (const h of [{ zone: 'front', dsp: 14 }, { zone: 'rear', dsp: 25 }, { zone: 'left', dsp: 25 }, { zone: 'right', dsp: 25 }, null]) {
    const L = createDamageLook();
    assert.equal(L.offer(h, calm()), false, JSON.stringify(h));
    assert.equal(run(L, 1.5).peak, 0);
  }
});

test('it swings to the side the blow landed: a hit on the left of the nose to the left (negative yaw), the right to the right', () => {
  const left = createDamageLook(); left.offer({ zone: 'front', dsp: 20, lx: 0.6 }, calm());
  const right = createDamageLook(); right.offer({ zone: 'front', dsp: 20, lx: -0.6 }, calm());
  let yl = 0, yr = 0;
  run(left, 0.6, calm(), (i, o) => { yl = o.yaw; }); run(right, 0.6, calm(), (i, o) => { yr = o.yaw; });
  assert.ok(yl < -1 && yr > 1, `${yl} ${yr}`);
});

test('only once the car has stopped: still fast after the blow (driving on through it), never', () => {
  const L = createDamageLook();
  L.offer(big, calm());
  const r = run(L, 1.5, calm({ speed: 20 }));
  assert.equal(r.peak, 0); assert.equal(L.S.last, 'fast');
  // (slowed within the window it starts)
  const L2 = createDamageLook(); L2.offer(big, calm());
  assert.ok(run(L2, 1.2, (i) => calm({ speed: i < 10 ? 14 : 3 })).peak > 1.9);
});

test('rate-limited: a second big hit inside the cooldown is not looked at; after it, it is', () => {
  const L = createDamageLook();
  L.offer(big, calm()); run(L, 2);
  assert.equal(L.offer(big, calm()), false); assert.equal(run(L, 1.5).peak, 0);
  run(L, LOOK.COOL); // (well past it)
  assert.equal(L.offer(big, calm()), true); assert.ok(run(L, 1.5).peak > 1.9);
  // (a hit mid-look neither restarts nor stacks it)
  const M = createDamageLook(); M.offer(big, calm()); run(M, 0.5);
  assert.equal(M.offer(big, calm()), false);
  // (a cancelled one still counts toward the cooldown)
  const C = createDamageLook(); C.offer(big, calm()); run(C, 0.3); run(C, DT * 2, calm({ keys: { ...keys0(), left: true } }));
  assert.equal(C.offer(big, calm()), false);
});

test('the player\'s input cancels it at once: a key pressed (not let go), a stick, the camera dragged, the car driven off', () => {
  const cases = [
    calm({ keys: { ...keys0(), backward: true } }),
    calm({ keys: { ...keys0(), left: 1 } }),
    calm({ keys: { ...keys0(), forward: 0.4 } }),
    calm({ keys: { ...keys0(), up: true } }),
    calm({ orbit: true }),
    calm({ speed: 12 }),
  ];
  for (const c of cases) {
    const L = createDamageLook(); L.offer(big, calm()); run(L, 0.5);
    assert.ok(Math.abs(L.out.yaw) > 1, 'looking');
    const o = L.update(DT, c);
    assert.equal(o.yaw, 0, JSON.stringify(c)); assert.equal(o.active, false);
    assert.equal(run(L, 1).peak, 0, 'and it stays off');
  }
  // (a control held through the crash and still held is not input: the look plays on)
  const H = createDamageLook(); const held = calm({ keys: { ...keys0(), forward: true } });
  H.offer(big, held); assert.ok(run(H, 1.5, held).on > 1);
  // (letting go of it is NOT: lifting off the throttle after a crash is the normal reflex, and the look plays on)
  const R = createDamageLook(); R.offer(big, held); run(R, 0.4, held);
  assert.equal(R.update(DT, calm()).active, true);
  assert.ok(run(R, 1).peak > 1.9, 'the look still reaches the nose');
  // (but pressing it again after letting go cancels it)
  const P = createDamageLook(); P.offer(big, held); run(P, 0.3, held); run(P, 0.1, calm());
  assert.equal(P.update(DT, held).active, false);
});

test('never in a cutscene, a call, a chase, a timed or chase step, another camera, on foot or a horse', () => {
  const reasons = [
    [{ mode: 'car', cutscene: true }, 'cutscene'], [{ mode: 'car', directed: true }, 'cutscene'], [{ mode: 'car', cine: true }, 'cutscene'],
    [{ mode: 'car', paused: true }, 'paused'], [{ mode: 'car', callLive: true }, 'call'], [{ mode: 'car', callTalking: true }, 'call'],
    [{ mode: 'car', pursuit: true }, 'pursuit'], [{ mode: 'car', step: 'tail' }, 'mission'], [{ mode: 'car', step: 'pursuit' }, 'mission'],
    [{ mode: 'car', timer: true }, 'mission'], [{ mode: 'car', preset: 'pov' }, 'camera'], [{ mode: 'person' }, 'not-driving'], [{ mode: 'car', horse: true }, 'horse'],
  ];
  for (const [f, why] of reasons) assert.equal(blockedBy(f), why, JSON.stringify(f));
  assert.equal(blockedBy({ mode: 'car', preset: 'chase', step: 'drive' }), null);
  // (offered in one: nothing)
  const L = createDamageLook();
  assert.equal(L.offer(big, calm({ blocked: 'cutscene' })), false); assert.equal(run(L, 1.5).peak, 0);
  // (a cutscene starting while it waits for the car to stop, or mid-look: off at once)
  const P = createDamageLook(); P.offer(big, calm()); assert.equal(run(P, 1.5, calm({ blocked: 'cutscene' })).peak, 0);
  const Q = createDamageLook(); Q.offer(big, calm()); run(Q, 0.5);
  assert.equal(Q.update(DT, calm({ blocked: 'call' })).yaw, 0); assert.equal(Q.S.last, 'blocked:call');
  // (a blocked hit leaves no cooldown: the next big one, free, is looked at)
  const B = createDamageLook(); B.offer(big, calm({ blocked: 'pursuit' })); run(B, 0.2);
  assert.equal(B.offer(big, calm()), true);
});

test('wired: damage.js offers every hit and steps it onto the camera; cameras.js swings the chase lens by it; a repair ends it', () => {
  const dmg = fs.readFileSync(ROOT + 'wagmi/crash/damage.js', 'utf8'), cam = fs.readFileSync(ROOT + 'js/cameras.js', 'utf8');
  assert.match(dmg, /import \{ createDamageLook, blockedBy \} from '\.\/damage-look\.js'/);
  assert.match(dmg, /look\.offer\(\{ zone, dsp, lx \}, lookCtx\(\)\)/);
  assert.match(dmg, /app\.cameraSystem\.damageLook = L\.active \? L : null/);
  assert.match(dmg, /look\.cancel\('repair'\)/);
  for (const k of ['W.cutscene', 'W.calls?.live', 'W.calls?.talking', 'W.pursuit?.active', "'wg-cine'", "'wg-vcall'", 'M?.timer?.running', 'cs.isDragging']) assert.ok(dmg.includes(k), k);
  assert.match(cam, /this\.damageLook && this\.damageLook\.w > 0/);
  assert.match(cam, /if \(dl\) \{ boomYaw \+= dl\.yaw; lookYaw \+= dl\.yaw; \}/);
});
