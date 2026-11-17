// The story runner never idles in silence: a place the map lacks fails its step on screen (Skip offered at once), a
// test drive's stop is shown on the page too, a side step at such a place is left out, and a cutscene shot is never held
// for ever. Colter Land's playtest, 16 Nov (its town on the spawn district: 8 of its 14 places missing).
//   node --test tests/storyrun-loud.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('a missing place: a Fail of kind place, logged once a mission and place', () => {
  const r = src('wagmi/storyrun/runner.js');
  const body = r.slice(r.indexOf('const placeOf = (ref, why) =>'), r.indexOf('const placeOf = (ref, why) =>') + 900);
  assert.match(body, /throw new Fail\(`The story names a place this city doesn't have \(\$\{name\}\)\.`, 'place'\)/);
  assert.match(body, /missingSaid\.has\(k\)/, 'logged once');
  // (every step that names a place reads it through placeOf: no bare places.at() left to return null into a step)
  const bare = [...r.matchAll(/places\.at\(/g)].length;
  assert.ok(bare <= 4, `places.at( outside placeOf: ${bare}`);
});

test('the fail screen offers Skip at once for a missing place; a side step at one is left out', () => {
  const r = src('wagmi/storyrun/runner.js');
  assert.match(r, /skip: fails >= 3 \|\| e\.kind === 'place'/);
  // (a failed start place, before step 0 ran, skips to step 0 itself, never past it)
  assert.match(r, /const next = Math\.min\(def\.steps\.length, at\.live \? \(at\.i \|\| 0\) \+ 1 : \(at\.i \|\| 0\)\)/);
  // (Skip: from where he stands, with the story's state as it was, never the checkpoint's, never a direct start's `from`)
  assert.match(r, /const \{ from: _from, \.\.\.base \} = at\.cp \|\| \{\};/);
  assert.match(r, /cp = \{ \.\.\.base, i: next, state: JSON\.parse\(JSON\.stringify\(at\.state\)\), stats: \{ \.\.\.at\.stats \}, timers: base\.timers \|\| \[\], \.\.\.\(here \? \{ at: here \} : \{\}\) \};/);
  assert.match(r, /place: \['This part of the story is somewhere this map does not reach yet\. '/);
  assert.match(r, /if \(e instanceof Fail && e\.kind === 'place'\) \{ \/\* dropped \*\/ \}/);
});

test("a test drive's stop is shown on the page (MISSION FAILED, Retry, Skip, Quit), not left standing", () => {
  const i = src('wagmi/storyrun/index.js');
  const at = i.indexOf("} else if (r.how === 'fail') {"), seg = i.slice(at, at + 1100);
  assert.ok(at > 0);
  assert.match(seg, /tell\('mission-end', \{ id: m\.id, how: 'fail'/, 'the framing GameMog still hears it first');
  assert.match(seg, /autopilot\?\.stop\(\);/);
  assert.match(seg, /await ui\.failed\(r\.why/);
});

test('a cutscene shot has a ceiling on the game clock, and its lines stop with it', () => {
  const r = src('wagmi/storyrun/runner.js');
  assert.match(r, /const cap = Math\.max\(dur, len\) \+ said\.reduce/);
  assert.match(r, /if \(\(now\(\) - t0\) \/ 1000 > cap\)/);
  assert.match(r, /dead: \(\) => skip \|\| cut \|\| local\.dead/);
});

test("the F prompt is never over the start gate or MISSION FAILED; a pickup's never over a cutscene", () => {
  assert.match(src('wagmi/mission/ui.js'), /body\.wg-failing #wg-prompt, body:has\(#wg \.wg-gate\.on\) #wg-prompt, body:has\(#wg-boot:not\(\.off\)\) #wg-prompt \{ visibility: hidden !important; \}/);
  assert.match(src('wagmi/combat/hud.js'), /body\.wg-cine #wf \.wf-offer\{display:none\}/);
});

test("a story world's fight lesson never says Mog City's Suits", () => {
  assert.match(src('wagmi/combat/index.js'), /Story\.t\(c\.foeLine \|\| 'Hit the Suits'\)/);
  // (the runner sets it on W.combat, the api object: it must reach the inside c the lesson reads)
  assert.match(src('wagmi/combat/index.js'), /get foeLine\(\) \{ return c\.foeLine; \}, set foeLine\(v\) \{ c\.foeLine = v \|\| null; \}/);
  assert.match(src('wagmi/storyrun/runner.js'), /combat\.foeLine = d\.lessonLine \|\| \(def0\.id === 'mog-city' \? null : 'Hit them'\);/);
});

test('a stalled town build puts the edge haze down on every poll, not only on the change', () => {
  assert.match(src('wagmi/world/growing.js'), /if \(stalled\) \{ try \{ const hz = app\(\)\?\.scene\?\.getObjectByName\?\.\('PkgGrowingHaze'\); if \(hz\) hz\.visible = false; \} catch \{\} \}/);
});

test('a small frame with a mouse: the story HUD drawn smaller, as the full frame lays it out', () => {
  const h = src('wagmi/storyrun/hud.js');
  assert.match(h, /@media \(min-width: 560px\) and \(max-height: 439px\) \{ html \{ --sr-hud-z: 0\.6; \} \}/);
  const rule = h.slice(h.indexOf('body.wg-story:not(.touch-enabled) :is(.hud,'));
  assert.match(rule, /^[^\n]*\{ zoom: var\(--sr-hud-z, 1\); \}/);
  // (the meters, clock, DOWN count and fight cards zoom together; the health bar, put by the radar's drawn rect, never)
  for (const k of ['.sr-timer', '.sr-meters', '.wg-count', '.wf-combo', '.wf-lesson', '.wg-line']) assert.ok(rule.split('\n')[0].includes(k), k);
  assert.ok(!rule.split('\n')[0].includes('.wf-hp'));
});
