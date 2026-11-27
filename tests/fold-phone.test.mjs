// A world's calls on a foldable phone (`calls: { style: 'fold' }`, wagmi/storyrun/fold.js, Mandi's Revenge 25 Nov):
// the pack's option checked, its test world valid, and every world without it on the caller card and the car screen's
// picture exactly as before (the phone made only for 'fold'; vcall.js's own layout and feed rect when it is not).
//   node --test tests/fold-phone.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
globalThis.location ??= new URL('http://127.0.0.1:4981/?pack=x');
const { check } = await import('../wagmi/storyrun/pack.js');

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pack = (f) => JSON.parse(src('tools/storyrun/test-packs/' + f));

test('calls.style: card or fold, anything else refused; the fold test world is valid', () => {
  const fold = pack('fold-phone.json');
  assert.equal(fold.calls.style, 'fold');
  assert.deepEqual(check(fold), []);
  const w = structuredClone(fold);
  w.calls = { style: 'card', ringOut: 'answer' }; assert.deepEqual(check(w), []);
  delete w.calls; assert.deepEqual(check(w), []);
  w.calls = { style: 'zoom' }; assert.ok(check(w).some((e) => /style: 'card' \| 'fold'/.test(e)));
});

test('a world without it: no phone, the feed and the call layout as they were', () => {
  const idx = src('wagmi/storyrun/index.js');
  assert.match(idx, /if \(def\.calls\?\.style === 'fold'\) \{ try \{ fold = \(await importRetry\(\(\) => import\('\.\/fold\.js'\)\)\)\.createFold/);
  assert.match(idx, /if \(fold\) fold\.caller\(/);
  const vc = src('wagmi/storyrun/vcall.js');
  // (the car screen's picture at the top right, its 16:9 rect and its feed call, unchanged without a phone)
  assert.match(vc, /const r = fold \? fr : \[innerWidth - w - \(touch \? 10 : 18\), touch \? 70 : 86, w, h\]/);
  assert.match(vc, /S\.feed\(fold \? \{ id, rect: r, cam, blur: !!o\.blur, radius: fold\.radius\(\) \} : \{ id, rect: r, cam, blur: !!o\.blur \}\)/);
  assert.match(vc, /: layout\(list\.length, w, h, \{ mode, stage, top: 54, bottom: Math\.max\(touch \? 132 : 172, \(touch \? 78 : 92\) \+ subH \+ 10\), side: touch \? 10 : 16 \}\)/);
  assert.match(src('wagmi/storyrun/vcall-draw.js'), /r\.U\.rad\.value = f\.radius \?\? 10;/);
  // (the on-foot call's picture only on the phone)
  assert.match(src('wagmi/storyrun/runner.js'), /if \(ui\.fold && d\.video && who !== heroName\) vcallOf\(\)\.feed\(/);
});

test('the phone: no maker\'s name or system wording on it', () => {
  const f = src('wagmi/storyrun/fold.js').replace(/^\s*\/\/.*$/gm, '');
  for (const w of [/samsung/i, /galaxy/i, /\bzoom\b/i, /\bclaude\b/i, /\bGTA\b/, /\bAI\b/]) assert.doesNotMatch(f, w);
});
