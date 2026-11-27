// Mog City: a face with its morphs baked in (wagmi/face-baked.js; docs/FACE-CONTRACT.md): found by the Faceunits /
// Visemes names, blinks, a jaw with the voice, the lips' shapes with the words, a warm line's grin; a body without
// them is left alone (face.js makes its own, as before).
//   node --test tests/face-baked.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bakedMeshes, createBakedFace, visemeAt, visemeSeq, VISEMES, SMILE_HOW, REST_SMILE } from '../wagmi/face-baked.js';

const mesh = (names, extra = {}) => ({ morphTargetDictionary: Object.fromEntries(names.map((n, i) => [n, i])), morphTargetInfluences: names.map(() => 0), children: [], ...extra });
const val = (m, k) => m.morphTargetInfluences[m.morphTargetDictionary[k]];
const FULL = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight', 'browInnerUp', 'eyeLookOutLeft', 'eyeLookInRight', ...VISEMES.map((v) => 'viseme_' + v)];

test('a baked face is found by jawOpen or eyeBlinkLeft, on every mesh of the model that has the names', () => {
  const skin = mesh(FULL, { material: { name: 'skin' } }), lashes = mesh(['eyeBlinkLeft', 'eyeBlinkRight']), shoes = { children: [] };
  const root = { children: [{ children: [skin, lashes] }, shoes] };
  assert.deepEqual(bakedMeshes(root), [skin, lashes]);
  // (only spare names, no key one: not a baked face)
  assert.equal(bakedMeshes({ children: [mesh(['mouthSmileLeft'])] }), null);
  // (a body with face.js's own morphs or none: null, face.js goes on as before)
  assert.equal(bakedMeshes({ children: [mesh(['jaw', 'lip', 'blink']), { children: [] }] }), null);
  assert.equal(bakedMeshes({ children: [] }), null);
});

test('blink, jaw, brow and the eyes drive the morphs by name, on each mesh that has them', () => {
  const skin = mesh(FULL), lashes = mesh(['eyeBlinkLeft', 'eyeBlinkRight']);
  const F = createBakedFace([skin, lashes], { open: 0.45 });
  F.blink(1);
  for (const m of [skin, lashes]) { assert.equal(val(m, 'eyeBlinkLeft'), 1); assert.equal(val(m, 'eyeBlinkRight'), 1); }
  F.jaw(0.45);
  // (with visemes the jaw is halved, its cap 0.6)
  assert.ok(val(skin, 'jawOpen') > 0.2 && val(skin, 'jawOpen') <= 0.6, `${val(skin, 'jawOpen')}`);
  F.brow(1); assert.ok(val(skin, 'browInnerUp') > 0.5);
  F.look(0.5, 0); assert.equal(val(skin, 'eyeLookOutLeft'), 0.5); assert.equal(val(skin, 'eyeLookInRight'), 0.5);
  // (a name the body doesn't have is skipped, no error)
  F.look(-1, -1);
});

test('the lips shape the words: the viseme at the point of the line, weighted by the voice', () => {
  assert.deepEqual(visemeSeq('Thanks, Mom'), ['TH', 'aa', 'nn', 'kk', 'SS', 'sil', 'PP', 'O', 'PP']);
  assert.equal(visemeAt('Buy', 0), 'PP');
  assert.equal(visemeAt('Buy', 0.99), 'I');
  const skin = mesh(FULL), F = createBakedFace([skin]);
  for (let i = 0; i < 20; i++) F.frame({ dt: 0.016, mouth: 0.8, talking: true, text: 'Oh', t: 0.05, dur: 1 });
  assert.ok(val(skin, 'viseme_O') > 0.6, `O ${val(skin, 'viseme_O')}`);
  assert.ok(val(skin, 'viseme_aa') < 0.05);
  // (quiet: back to rest)
  for (let i = 0; i < 40; i++) F.frame({ dt: 0.016, mouth: 0, talking: false });
  assert.ok(val(skin, 'viseme_O') < 0.05);
});

test("a warm line's grin, eased in; the resting smile otherwise; the smile reaches the eyes", () => {
  const skin = mesh(FULL), F = createBakedFace([skin], { smile: 0.18 });
  for (let i = 0; i < 90; i++) F.frame({ dt: 0.016, mouth: 0.3, talking: true, how: 'warm', text: 'Thank you.', t: 0.2, dur: 1 });
  assert.ok(Math.abs(val(skin, 'mouthSmileLeft') - SMILE_HOW.warm) < 0.05, `${val(skin, 'mouthSmileLeft')}`);
  assert.ok(val(skin, 'cheekSquintLeft') > 0.2);
  for (let i = 0; i < 120; i++) F.frame({ dt: 0.016, mouth: 0, talking: false });
  assert.ok(Math.abs(val(skin, 'mouthSmileLeft') - REST_SMILE) < 0.03, 'back to the resting smile (raised to the floor)');
});

test('every baked face rests on at least REST_SMILE (a warm grin, not a thin line); stern opts out; the lips still shape the words', () => {
  for (const [opt, want] of [[{}, REST_SMILE], [{ smile: 0.35 }, 0.35], [{ smile: 0.1, stern: true }, 0.1], [{ stern: true }, 0]]) {
    const skin = mesh(FULL), F = createBakedFace([skin], opt);
    for (let i = 0; i < 60; i++) F.frame({ dt: 0.016, mouth: 0, talking: false });
    assert.ok(Math.abs(val(skin, 'mouthSmileLeft') - want) < 0.02, `${JSON.stringify(opt)} ${val(skin, 'mouthSmileLeft')}`);
    for (let i = 0; i < 20; i++) F.frame({ dt: 0.016, mouth: 0.8, talking: true, text: 'Oh.', t: 0.1, dur: 1 });
    assert.ok(val(skin, 'viseme_O') > 0.6, `O ${val(skin, 'viseme_O')}`);
  }
});

test('face.js uses a baked face when the body has one, and hands the line its delivery (voices.js how)', () => {
  const face = fs.readFileSync(new URL('../wagmi/face.js', import.meta.url), 'utf8'), voices = fs.readFileSync(new URL('../wagmi/radio/voices.js', import.meta.url), 'utf8');
  assert.match(face, /const baked = bakedMeshes\(inner\)/);
  assert.match(face, /baked \? \{ body: baked, fm: null, morphed: \[\] \} : morphMeshes\(inner/, "a baked face's GLB morphs are kept, not replaced by face.js's own");
  assert.match(face, /how: e\.how \|\| null/);
  assert.match(voices, /how: cue\?\.how \|\| null/);
  assert.ok(fs.existsSync(new URL('../docs/FACE-CONTRACT.md', import.meta.url)), 'the contract is written down');
});
