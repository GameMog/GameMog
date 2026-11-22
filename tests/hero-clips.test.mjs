// A forged hero's clips (wagmi/storyrun/pack.js heroClips) and the keynote stage's key on the people (sets.js,
// stage-room.js): a hand-built hero sits on his own seated clips, Dan's fill in the rest; the stage keys skin warm white.
//   node --test tests/hero-clips.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?pack=x');
const { heroClips, HERO_OWN, heroOwnOf } = await import('../wagmi/storyrun/pack.js');
const glbJson = (f) => { const b = fs.readFileSync(f); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()); };
const clip = (name, from) => ({ name, from });
const danNames = glbJson(path.join(ROOT, 'assets/characters/dan.glb')).animations.map((a) => a.name);
const DAN = danNames.map((n) => clip(n, 'dan'));

test("a hero body's own sit and sitTalk win over Dan's; Dan's fill in every clip the body lacks", () => {
  assert.deepEqual([...HERO_OWN].sort(), ['sit', 'sitTalk']);
  assert.ok(danNames.includes('sit') && danNames.includes('sitTalk'));
  // (Jensen's body as built: sit and sitTalk only, its idle, talk, phone and arms taken out)
  const out = heroClips(DAN, [clip('sit', 'body'), clip('sitTalk', 'body')]);
  assert.equal(out.length, DAN.length);
  assert.deepEqual(out.map((c) => c.name), danNames);
  for (const c of out) assert.equal(c.from, HERO_OWN.has(c.name) ? 'body' : 'dan', c.name);
});

test("a hero body's other clips stay under Dan's, as before (only the seated ones are its own); its extras are kept", () => {
  const out = heroClips(DAN, [clip('idle', 'body'), clip('talk', 'body'), clip('sit', 'body'), clip('bow', 'body')]);
  assert.equal(out.find((c) => c.name === 'idle').from, 'dan');
  assert.equal(out.find((c) => c.name === 'talk').from, 'dan');
  assert.equal(out.find((c) => c.name === 'sit').from, 'body');
  assert.equal(out.find((c) => c.name === 'sitTalk').from, 'dan');
  assert.equal(out.at(-1).name, 'bow'); assert.equal(out.length, DAN.length + 1);
  // (a body without clips is Dan's clips, in Dan's order: every forged hero that shipped before)
  assert.deepEqual(heroClips(DAN, []), DAN);
  assert.deepEqual(heroClips(DAN, undefined), DAN);
});

test('heroClips is idempotent: the GLTF is cached (glb.js), so a second call, or the cast double on it, finds the same', () => {
  const once = heroClips(DAN, [clip('sit', 'body'), clip('sitTalk', 'body')]);
  const twice = heroClips(DAN, once);
  assert.deepEqual(twice, once);
  for (let i = 0; i < once.length; i++) assert.equal(twice[i], once[i]);
  // (the cast's path, cast.js build: its own clips first, then Dan's for the names it lacks, gives the same seated clips)
  const own = once.slice(), names = new Set(own.map((a) => a.name));
  for (const a of DAN) if (!names.has(a.name)) own.push(a);
  assert.equal(own.find((c) => c.name === 'sit').from, 'body');
});

test("pack.js heroGLTF uses heroClips; Dan himself (no hero GLB) is Dan's file untouched; cast.js keeps own-first", () => {
  const pack = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/pack.js'), 'utf8');
  const hero = pack.slice(pack.indexOf('W.heroGLTF = async'), pack.indexOf('};', pack.indexOf('W.heroGLTF = async')));
  assert.match(hero, /if \(!W\.heroGlb\) return dan;/);
  assert.match(hero, /g\.animations = heroClips\(dan\.animations, g\.animations, heroOwnOf\(g\)\);/);
  const cast = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/cast.js'), 'utf8');
  assert.match(cast, /const own = g\.animations\.slice\(\), names = new Set\(own\.map\(\(a\) => a\.name\)\)/);
  assert.match(cast, /for \(const a of await clipsOfDan\(\)\) if \(!names\.has\(a\.name\)\) own\.push\(a\);/);
});

test("Jensen's hand-built body carries the seated clips by these names (where GameMog's checkout is beside this one)", (t) => {
  const f = path.join(ROOT, '..', 'GameMog-jh-rc/public/storykit/cast/hand/jh-jensen.glb');
  if (!fs.existsSync(f)) return t.skip('no GameMog checkout beside this one');
  const names = glbJson(f).animations.map((a) => a.name);
  for (const n of HERO_OWN) assert.ok(names.includes(n), n);
});

test("the keynote stage keys its people warm white, not the night's amber; every other set keeps the night's key", () => {
  const sets = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/sets.js'), 'utf8');
  assert.match(sets, /new THREE\.SpotLight\(tint\(room\.keyColor\) \|\| \(night \? '#FFD2A0' : golden \? '#FFE0B8' : '#FFF2E2'\)/);
  assert.match(sets, /new THREE\.PointLight\(tint\(room\.fillColor\) \|\| \(night \? '#8EA2D8' : '#FFE9D2'\)/);
  const st = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/stage-room.js'), 'utf8');
  const m = st.match(/keyColor: '(#[0-9A-F]{6})', fillColor: '(#[0-9A-F]{6})'/);
  assert.ok(m, 'stage-room.js gives keyColor and fillColor');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // (warm white: red the top, blue at least 85% of it; the night's amber #FFD2A0 has blue at 63%)
  const [r, g, b] = rgb(m[1]);
  assert.ok(r >= g && g >= b && b / r >= 0.85, m[1]);
  assert.ok(rgb('#FFD2A0')[2] / 255 < 0.65);
  // (the fill still cool, the stage's mood: blue over red)
  const [fr, , fb] = rgb(m[2]); assert.ok(fb > fr, m[2]);
  // (only the stage gives one)
  for (const f of fs.readdirSync(path.join(ROOT, 'wagmi/storyrun'))) {
    if (!f.endsWith('.js') || f === 'stage-room.js' || f === 'sets.js') continue;
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'wagmi/storyrun', f), 'utf8'), /\b(keyColor|fillColor)\s*:/, f);
  }
});

// (jh-polish A7: Jensen's skin still read a little warm on ST-8's stage)
test('A7: the stage keys him nearer natural: a warm white key and presenter pair (not white, not grey), a softer cool fill', () => {
  const st = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/stage-room.js'), 'utf8');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const m = st.match(/keyColor: '(#[0-9A-F]{6})', fillColor: '(#[0-9A-F]{6})'/);
  const warmWhite = (h) => { const [r, g, b] = rgb(h); return r === 255 && r > b && b / r >= 0.9 && b / r <= 0.985 && g >= b; };
  assert.ok(warmWhite(m[1]), 'key ' + m[1]);
  assert.ok(rgb(m[1])[2] / 255 > rgb('#FFF8F2')[2] / 255, 'cooler than the RC key #FFF8F2');
  // the presenter's truss pair (the two front-of-house spots on the podium)
  const pair = [...st.matchAll(/to: \[-?0\.6, 1\.3, -2\.1\], k: \d+, color: '(#[0-9A-F]{6})'/g)].map((x) => x[1]);
  assert.equal(pair.length, 2);
  for (const c of pair) assert.ok(warmWhite(c), 'presenter spot ' + c);
  // the fill still cool (blue over red) but softer than the RC's #B4BFDC
  const [fr, , fb] = rgb(m[2]);
  assert.ok(fb > fr && fb - fr < 0xDC - 0xB4, m[2]);
  // the mood kept: the cool rims from upstage and the warm house spill as they were
  assert.match(st, /color: '#86AEFF'/); assert.match(st, /color: '#9CF0B0'/); assert.match(st, /color: '#FFD9B4'/);
});

test("a body that names clips its own (asset extras heroOwn: Jensen's walk, keynote talk and cheer) plays them over Dan's", () => {
  const body = [clip('sit', 'body'), clip('sitTalk', 'body'), clip('walk', 'body'), clip('talk', 'body'), clip('cheer', 'body'), clip('idle', 'body')];
  const marked = heroOwnOf({ asset: { extras: { heroOwn: ['walk', 'talk', 'cheer'] } } });
  assert.deepEqual(marked, ['walk', 'talk', 'cheer']);
  const out = heroClips(DAN, body, marked);
  assert.deepEqual(out.map((c) => c.name), danNames);
  for (const n of ['sit', 'sitTalk', 'walk', 'talk', 'cheer']) assert.equal(out.find((c) => c.name === n).from, 'body', n);
  // (a clip it has but does not name stays Dan's, as before)
  assert.equal(out.find((c) => c.name === 'idle').from, 'dan');
  // (idempotent, as the cached GLTF needs)
  assert.deepEqual(heroClips(DAN, out, marked), out);
  // (no mark, a bad mark: nothing more is its own)
  for (const g of [{}, { asset: {} }, { asset: { extras: { heroOwn: 'walk' } } }, { asset: { extras: { heroOwn: [3, '../x', ''] } } }, null]) assert.deepEqual(heroOwnOf(g), []);
  assert.equal(heroClips(DAN, body, heroOwnOf({})).find((c) => c.name === 'walk').from, 'dan');
});
