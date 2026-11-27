// Photo mode (wagmi/mission/photo.js, every world's): O in play or Pause > Photo mode; the pause menu's hold with no menu,
// a free camera round the player and the car, four looks, the HUD hidden, a PNG with the world's corner tag.
//   node --test tests/photo-mode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILTERS, cssFilter, filterMatrix, applyMatrix, tagText, fileName, blockedBy, mapCredit } from '../wagmi/mission/photo.js';

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(ROOT + f, 'utf8');

test('the corner tag: the world title and kicker, then gamemog.com only', () => {
  assert.equal(tagText({ title: 'Jensen Heist', kicker: 'SAN JOSE, CA' }), 'JENSEN HEIST · SAN JOSE, CA · gamemog.com');
  assert.equal(tagText({ title: 'Pickup Time' }), 'PICKUP TIME · gamemog.com');
  assert.equal(tagText(null), 'gamemog.com');
  assert.doesNotMatch(tagText({ title: 'X', kicker: 'Y' }), /https?:|www\./);
  assert.equal(fileName({ title: 'Jensen Heist' }, new Date(2026, 10, 22, 9, 5, 7)), 'jensen-heist-20261122-090507.png');
});

test('four looks: none, warm, noir, vivid; the PNG matrix is the live CSS filter', () => {
  assert.deepEqual(FILTERS.map(([k]) => k), ['none', 'warm', 'noir', 'vivid']);
  assert.equal(cssFilter('none'), 'none');
  assert.equal(cssFilter('noir'), 'grayscale(1) contrast(1.35) brightness(0.96)');
  assert.match(cssFilter('warm'), /hue-rotate\(-6deg\)/);
  // none: identity
  const px = new Uint8ClampedArray([10, 120, 240, 255]);
  assert.deepEqual([...applyMatrix(px.slice(), filterMatrix('none'))], [10, 120, 240, 255]);
  // noir: grey, every channel the same; alpha kept
  const n = applyMatrix(new Uint8ClampedArray([200, 40, 90, 255, 30, 200, 60, 128]), filterMatrix('noir'));
  assert.equal(n[0], n[1]); assert.equal(n[1], n[2]); assert.equal(n[4], n[5]); assert.equal(n[3], 255); assert.equal(n[7], 128);
  // contrast keeps mid grey near mid grey (its offset in 0..1), brightness 0.96 under it
  const g = applyMatrix(new Uint8ClampedArray([128, 128, 128, 255]), filterMatrix('noir'));
  assert.ok(Math.abs(g[0] - 128 * 0.96) < 3, String(g[0]));
  // vivid: a colour pushed further from its grey
  const v = applyMatrix(new Uint8ClampedArray([180, 100, 80, 255]), filterMatrix('vivid'));
  assert.ok(v[0] - v[2] > 100, `${v[0]} ${v[2]}`);
  // warm: red up against blue
  const w = applyMatrix(new Uint8ClampedArray([120, 120, 120, 255]), filterMatrix('warm'));
  assert.ok(w[0] > w[2] + 10, `${w[0]} ${w[2]}`);
});

test('never over a call, a cutscene, a choice, a card, the fail screen, the gate or the map', () => {
  const ok = { ready: true };
  assert.equal(blockedBy(ok), null);
  for (const [k, why] of [['call', 'call'], ['cine', 'cutscene'], ['choice', 'choice'], ['card', 'card'], ['fail', 'fail screen'], ['gate', 'start gate'], ['map', 'map']]) assert.equal(blockedBy({ ...ok, [k]: true }), why);
  assert.equal(blockedBy({ ready: false }), 'loading');
  // the pause menu: only from its own Photo mode item
  assert.equal(blockedBy({ ...ok, paused: true }), 'paused');
  assert.equal(blockedBy({ ...ok, paused: true, fromMenu: true }), null);
  assert.equal(blockedBy({ ...ok, paused: true, fromMenu: true, call: true }), 'call');
  const ph = src('wagmi/mission/photo.js');
  // (what it reads: the call's and the cutscene's markers, the story's choices, the cards and the end credits)
  for (const m of ["'wg-vcall'", 'W.cutscene', "'wg-cine'", 'W.storyrun?.choosing', "'wg-offering'", '.sr-choice.on', '.sr-roll.on', "'wg-failing'", "'wg-gating'", 'isFullMapOpen']) assert.ok(ph.includes(m), m);
  // (and gives way when a call or a cutscene starts under it)
  assert.match(ph, /if \(s\.call \|\| s\.cine\) \{ close\(\); return; \}/);
});

test('its keys: O in (P stays the pause menu), Esc out; the pause menu has the item (the touch way in)', () => {
  const ph = src('wagmi/mission/photo.js'), pz = src('wagmi/mission/pause.js'), ui = src('wagmi/mission/ui.js');
  assert.match(ph, /if \(e\.code !== 'KeyO' \|\| e\.repeat/);
  assert.match(ph, /if \(c === 'Escape' \|\| c === 'KeyO' \|\| c === 'Backspace'\) \{ if \(!e\.repeat\) close\(\); return; \}/);
  assert.ok(pz.includes("e.code === 'Escape' || e.code === 'KeyP'"), 'P is still pause');
  // (O is nobody else's key)
  for (const f of ['wagmi/game.js', 'js/main.js', 'js/controllers.js', 'wagmi/pad.js', 'wagmi/touch.js']) assert.doesNotMatch(src(f), /'KeyO'/, f);
  assert.match(pz, /\['photo', 'Photo mode'\]/);
  assert.match(pz, /\(id !== 'photo' \|\| !!W\.photo\?\.can\?\.\(true\)\)/);
  assert.match(pz, /else if \(id === 'photo'\) \{ W\.photo\?\.open\?\.\(\); \}/);
  assert.match(pz, /\['Photo mode', 'O', '', 'Pause › Photo mode'\]/);
  // (the menu's Esc and P left to photo mode while it is up)
  assert.match(pz, /if \(W\.photo\?\.on\) return; \/\/ \(photo mode's own keys/);
  assert.match(ui, /ui\.photo = createPhoto\(ui\);/);
});

test('the hold: the menu and photo mode share one clock and frame loop; the camera put before each held frame', () => {
  const pz = src('wagmi/mission/pause.js'), ph = src('wagmi/mission/photo.js');
  assert.match(pz, /try \{ heldPre\?\.\(\); app\.renderPipeline\?\.render\(\); \} catch \{\}/);
  assert.match(pz, /function hold\(on, pre = null\) \{/);
  assert.match(pz, /return \{ open, openTo, close, hold,/);
  assert.match(ph, /pause\.hold\(true, frame\);/);
  assert.match(ph, /pause\.hold\(false\);/);
  // (the game's camera put back as it was, the canvas's filter with it)
  assert.match(ph, /cam\.position\.copy\(saved\.pos\); cam\.quaternion\.copy\(saved\.q\)/);
  // (the HUD hidden: everything but the canvas and photo mode's own layer)
  assert.ok(ph.includes('body.wg-photo > *:not(#canvas-container):not(#wg-photo)'));
  // (the PNG: drawn and read in one task, the look's matrix, the tag)
  assert.match(ph, /frame\(\); app\.renderPipeline\?\.render\(\);[\s\S]{0,200}x\.drawImage\(canvas, 0, 0\);/);
  assert.match(ph, /c\.toBlob\(r, 'image\/png'\)/);
});

test('a picture of a town built from open map data carries OpenStreetMap\'s credit; New York\'s and San Francisco\'s none', () => {
  assert.equal(mapCredit({ PKG: { id: 'us-1714000' } }), '© OpenStreetMap contributors');
  assert.equal(mapCredit({}), '');
  assert.equal(mapCredit(undefined), '');
});
