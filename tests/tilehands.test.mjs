// A call tile's hands (wagmi/storyrun/tilehands.js, applied by sets.js in a call's office): under the chin, in close,
// not out wide; a hand inside the bounds left as the clip has it; and only in a tile, never a full-body cutscene.
//   node --test tests/tilehands.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tileHand, TILE } from '../wagmi/storyrun/tilehands.js';

// a body sat facing +z at the origin, eyes 1.15 m up: its left arm's shoulder (its left is +x facing +z)
const body = (wrist, side = 'L', h = 0) => {
  const fwd = [Math.sin(h), Math.cos(h)], left = [Math.cos(h), -Math.sin(h)], out = side === 'L' ? left : [-left[0], -left[1]];
  const sh = [0.18 * out[0], 0.93, 0.18 * out[1]];
  return { wrist, shoulder: sh, eyesY: 1.15, fwd, out };
};

test('a hand inside the bounds is the clip\'s own', () => {
  assert.equal(tileHand(body([0.2, 0.8, 0.2])), null);
  assert.equal(tileHand(body([-0.2, 0.75, 0.15], 'R')), null);
});

test('a hand thrown up in front of the face comes down under the chin, toward the lens it comes back in', () => {
  const t = tileHand(body([0.12, 1.12, 0.45]));
  assert.ok(t, 'clamped');
  assert.ok(t[1] <= 1.15 - TILE.drop + 1e-9, `height ${t[1]}`);
  // (its chin: about 0.12 m under the eyes; the wrist a hand's length under that at least)
  assert.ok(t[1] < 1.15 - 0.12 - 0.1);
  assert.ok(t[2] - 0 <= TILE.fwd + 1e-9, `ahead ${t[2]}`);
  // (it stays on its side, as far out as it was)
  assert.ok(Math.abs(t[0] - 0.12) < 1e-9);
});

test('a wide-armed gesture is brought in to the tile; a hand across the body no further than a little', () => {
  const t = tileHand(body([0.75, 0.95, 0.15]));
  assert.ok(t && t[0] <= 0.18 + TILE.out + 1e-9, `out ${t && t[0]}`);
  const c = tileHand(body([-0.35, 0.8, 0.2]));
  assert.ok(c && c[0] >= 0.18 - TILE.cross - 1e-9, `across ${c && c[0]}`);
  // (the right arm mirrors the left)
  const r = tileHand(body([-0.75, 0.95, 0.15], 'R'));
  assert.ok(r && Math.abs(r[0] + (0.18 + TILE.out)) < 1e-9);
});

test('bounds turn with the body: the same throw at any heading lands at the same place in its frame', () => {
  for (const h of [0, 0.7, -2.1, Math.PI]) {
    const B = body([0, 1.12, 0], 'L', h), { shoulder: S, fwd, out } = B;
    // (0.45 ahead of the shoulder and 0.1 out, at the face)
    B.wrist = [S[0] + 0.45 * fwd[0] + 0.1 * out[0], 1.12, S[2] + 0.45 * fwd[1] + 0.1 * out[1]];
    const t = tileHand(B); assert.ok(t, `heading ${h}`);
    const d = [t[0] - S[0], t[2] - S[2]];
    assert.ok(Math.abs(d[0] * fwd[0] + d[1] * fwd[1] - TILE.fwd) < 1e-9, `ahead at heading ${h}`);
    assert.ok(Math.abs(d[0] * out[0] + d[1] * out[1] - 0.1) < 1e-9, `out at heading ${h}`);
    assert.ok(Math.abs(t[1] - (1.15 - TILE.drop)) < 1e-9);
  }
});

test('only in a call\'s tile: sets.js clamps when the set is drawn into a tile (inGrid), never otherwise', () => {
  const src = fs.readFileSync(new URL('../wagmi/storyrun/sets.js', import.meta.url), 'utf8');
  assert.match(src, /if \(S\.inGrid && !P\.hand && !P\.hold && !\(P\.hug && !P\.walk\)\) tileArms\(P\);/);
  assert.match(src, /import \{ tileHand \} from '\.\/tilehands\.js';/);
  // (a set is drawn into a tile only by a call or the car's screen)
  const vc = fs.readFileSync(new URL('../wagmi/storyrun/vcall-draw.js', import.meta.url), 'utf8');
  assert.match(vc, /S\.inGrid = true/);
  const n = (src.match(/inGrid = true/g) || []).length;
  assert.equal(n, 0, 'sets.js itself never marks a set as a tile');
});

test('missing pieces are no hand at all', () => {
  assert.equal(tileHand({}), null);
  assert.equal(tileHand({ ...body([0, 1.2, 0.5]), eyesY: NaN }), null);
});
