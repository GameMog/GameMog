// The key art's staged compositions (wagmi/storyrun/keyshots.js, keypick.js): only asked for on the address
// (&keyshot=), the stand by the car otherwise as before; the ride off turned to the highest skyline.
//   node --test tests/keyshots.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyShotOf, skyline, KEY_SHOTS } from '../wagmi/storyrun/keypick.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('keyshot: only hood, rideoff or stand from the address; anything else is the stand (null)', () => {
  const q = (s) => new URLSearchParams(s);
  assert.deepEqual(KEY_SHOTS, ['stand', 'hood', 'rideoff']);
  assert.equal(keyShotOf(q('keyart=1&keyshot=hood')), 'hood');
  assert.equal(keyShotOf(q('keyart=1&keyshot=rideoff')), 'rideoff');
  assert.equal(keyShotOf(q('keyart=1&keyshot=stand')), 'stand');
  assert.equal(keyShotOf(q('keyart=1')), null);
  assert.equal(keyShotOf(q('keyart=1&keyshot=HOOD')), null);
  assert.equal(keyShotOf(q('keyart=1&keyshot=poster')), null);
  assert.equal(keyShotOf(null), null);
});

test('keyArt: a staged shot only when the address asks, the stand (then the hero shot) as before otherwise', () => {
  const s = src('wagmi/storyrun/index.js'), k = s.slice(s.indexOf('async function keyArt('), s.indexOf('async function standShot('));
  assert.match(k, /const want = keyShotOf\(Q\), staged = want === 'hood' \? hoodShot : want === 'rideoff' \? rideOffShot : null;/);
  assert.match(k, /if \(staged\) S = await staged\(W, runner\)/);
  assert.match(k, /if \(!S\) S = await standShot\(W, runner\)/);
  assert.match(k, /D = heroShot\(W, runner\);/);
  // (the HUD's guide card is off the frame too)
  assert.match(k, /#sr-guide/);
});

test('skyline: the highest of the land out to 20 km, as an angle over level from 1.5 m up', () => {
  // a ridge 500 m high 9-12 km off due north (+z), flat ground elsewhere
  const T = { heightAt: (x, z) => (z > 9000 && z < 12000 && Math.abs(x) < 3000 ? 500 : 0) };
  const north = skyline({ x: 0, z: 0 }, 0, 0, T), south = skyline({ x: 0, z: 0 }, Math.PI, 0, T);
  assert.ok(Math.abs(north - Math.atan2(498.5, 11000)) < 1e-9, `north ${north}`);
  assert.ok(south < 0, `south ${south}`);
  assert.equal(skyline({ x: 0, z: 0 }, 0, 0, null), 0);
  assert.equal(skyline({ x: 0, z: 0 }, 0, 0, { heightAt: () => NaN }), -1);
});
