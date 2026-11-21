// The 'Hit and run' note (wagmi/street/index.js) and a video call's tile on the car's screen (wagmi/storyrun/vcall.js)
// share the top right corner: the note goes under the tile when both are up, never on it (the owner, 19 Nov).
//   node --test tests/street-tick.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tickTop, TICK } from '../wagmi/street/tick-place.js';

const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const note = (w = 170, h = 38, W = 1280) => ({ left: W - 28 - w, right: W - 28, top: TICK.TOP, bottom: TICK.TOP + h });
// (the tile's own place, as vcall.js feed() lays it: 30% of the width up to 320 px, 16:9, 18 px in, 86 down; on a touch
// screen 200 px, 10 in, 70 down)
const tile = (W, touch = false) => { const w = Math.round(Math.min(touch ? 200 : 320, W * 0.3)), h = Math.round(w * 9 / 16), left = W - w - (touch ? 10 : 18), top = touch ? 70 : 86; return { left, right: left + w, top, bottom: top + h }; };

test('alone, the note sits where it always did', () => {
  assert.equal(tickTop(note(), []), TICK.TOP);
});

test('with the call tile up, the note sits under it, clear of it, at every screen size', () => {
  for (const W of [1280, 1440, 1920, 900, 640]) for (const touch of [false, true]) {
    const t = tile(W, touch), n = note(170, 38, W), y = tickTop(n, [t]);
    const placed = { ...n, top: y, bottom: y + (n.bottom - n.top) };
    assert.ok(!overlap(placed, t), `${W}${touch ? ' touch' : ''}: note ${y}, tile ${t.top}-${t.bottom}`);
    assert.ok(y >= t.bottom + TICK.GAP && y < t.bottom + 40, `${W}: ${y}`);
  }
});

test('the street module places it on the tiles that are up', () => {
  const src = fs.readFileSync(new URL('../wagmi/street/index.js', import.meta.url), 'utf8');
  assert.match(src, /document\.querySelectorAll\('\.wg-vfeed\.on'\)/);
  assert.match(src, /tickTop\(/);
  const vc = fs.readFileSync(new URL('../wagmi/storyrun/vcall.js', import.meta.url), 'utf8');
  assert.match(vc, /el\.className = 'wg-vfeed'/);
  assert.match(vc, /el\.classList\.toggle\('on', on\)/);
});
