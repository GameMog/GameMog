// Mog City's own story pack reproduces the game exactly (tools/story/README.md): the default pack is current with the
// source, renders every source literal back, holds the voice build's 462 lines by their ids, passes its own schema;
// the story calls over it return what they are given; the validator and the address rule refuse what they must.
//   node --test tests/story-default.test.mjs   (TypeScript's parser from the GameMog checkout's node_modules)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readLines } from '../wagmi/radio/build/lines.mjs';
import { SCHEMA, CAST, render, validatePack, voiceKey } from '../wagmi/story/schema.js';
import { makeStory } from '../wagmi/story/make.js';
import { allowed, hostOf } from '../wagmi/story/allow.js';
import { outputs } from '../tools/story/extract.mjs';
import { ROOT, literals } from '../tools/story/scan.mjs';

const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const base = read('assets/story/default.json'), limits = read('assets/story/limits.json'), ids = read('assets/story/ids.json');
const clone = (o) => JSON.parse(JSON.stringify(o));

test('assets/story is current with the source (extract.mjs --check)', () => {
  const { files, problems } = outputs();
  assert.deepEqual(problems, []);
  const bare = (t) => t.replace(/,? ?"at": "[^"]*",? ?/g, '');
  assert.equal(fs.readFileSync(path.join(ROOT, 'assets/story/default.json'), 'utf8'), files['default.json']);
  assert.equal(fs.readFileSync(path.join(ROOT, 'assets/story/limits.json'), 'utf8'), files['limits.json']);
  assert.equal(bare(fs.readFileSync(path.join(ROOT, 'assets/story/ids.json'), 'utf8')), bare(files['ids.json']));
});

test('tools/story/schema.json is the schema wagmi/story/schema.js embeds', () => {
  assert.deepEqual(read('tools/story/schema.json'), SCHEMA);
});

test('the default pack passes its own schema and rules', () => {
  const v = validatePack(base, base, limits);
  assert.deepEqual(v.errors, []);
  assert.equal(base.pack, 1); assert.equal(base.base, 'mog-city@1');
});

test('its lines are the voice build\'s: the same ids, speakers and words (462)', () => {
  const L = readLines(ROOT);
  assert.equal(L.length, 462);
  assert.equal(Object.keys(base.lines).length, L.length);
  for (const l of L) {
    assert.ok(base.lines[l.id], `line ${l.id} in the pack`);
    assert.equal(CAST[base.lines[l.id][0]], l.speaker, `${l.id} speaker`);
    assert.equal(render(base.lines[l.id][1], base), l.text, `${l.id} words`);
  }
});

test('every entry renders back to the literal at its place in the source', () => {
  const lits = new Map();
  const at = (where) => { const [f, n] = where.split(':'); if (!lits.has(f)) lits.set(f, literals(f)); return lits.get(f).filter((x) => x.line === +n).map((x) => x.text); };
  let n = 0;
  for (const [id, [, t]] of Object.entries(base.lines)) {
    const want = ids.lines[id].text; assert.equal(render(t, base), want, id);
    if (ids.lines[id].at) { assert.ok(at(ids.lines[id].at).includes(want), `${id} at ${ids.lines[id].at}`); n++; }
  }
  for (const [id, t] of Object.entries(base.copy)) {
    const want = ids.copy[id].text; assert.equal(render(t, base), want, id);
    const there = at(ids.copy[id].at);
    // (an objective's coloured noun is a key in the source, { van: 'red' }: an identifier, not a literal)
    if (there.length) { assert.ok(there.includes(want) || /^[A-Za-z]+$/.test(want), `${id} at ${ids.copy[id].at}`); n++; }
  }
  assert.ok(n > 700, `${n} entries placed`);
});

test('the story calls over the default pack return exactly what they are given', () => {
  const S = makeStory(base, base);
  assert.equal(S.isDefault, true);
  for (const id of Object.keys(base.lines)) {
    const { speaker, text } = ids.lines[id];
    assert.equal(S.line(speaker, text), text, id);
    // (the same words in another case or punctuation, as the game has some: 'HEY!' for 'Hey!', the literal stands)
    assert.equal(S.line(speaker, text.toUpperCase()), text.toUpperCase(), id);
    assert.equal(S.changed(speaker, text), false, id);
  }
  for (const id of Object.keys(base.copy)) assert.equal(S.t(ids.copy[id].text), ids.copy[id].text, id);
  for (const [id, s] of Object.entries(CAST)) { assert.equal(S.name(id), s); assert.equal(S.name(s), s); assert.equal(S.lookChanged(id), false); }
  for (const k of ['enemyHp', 'enemyDamage', 'chaseSpeed']) assert.equal(S.knob(k), 1);
  assert.equal(S.knob('heroHp'), 100); assert.equal(S.knob('crewExtra'), 0);
  assert.equal(S.title(), 'MOG CITY: Unfinished Business');
  assert.equal(S.save('wagmi.save.v1'), 'wagmi.save.v1');
  assert.equal(S.paint, null);
  assert.equal(S.name('Unknown number'), 'Unknown number'); assert.equal(S.name('constructor'), 'constructor');
  assert.equal(S.t({ van: 'red' }).van, 'red'); assert.equal(S.t(null), null);
});

test('every recorded line is found by its speaker and words (a pack changing them all changes every one)', () => {
  const man = read('assets/voice/manifest.json').lines;
  const all = clone(base); for (const l of Object.values(all.lines)) l[1] = 'Changed: ' + l[1];
  const S = makeStory(all, base, { id: 'g/all' });
  for (const l of man) {
    const got = S.line(l.speaker, l.text);
    assert.notEqual(got, l.text, `${l.id} reached`);
    assert.equal(S.changed(l.speaker, got), true, `${l.id} changed`);
    assert.equal(S.changed(l.speaker, l.text), false, `${l.id} default words are never changed`);
  }
  assert.equal(S.save('wagmi.save.v1'), 'wagmi.save.v1:g/all');
});

test('the validator refuses what it must', () => {
  const bad = (f, want) => { const p = clone(base); f(p); const v = validatePack(p, base, limits); assert.equal(v.ok, false, want); assert.ok(v.errors.some((e) => e.includes(want)), `${want}: ${v.errors.join(' | ')}`); };
  const first = Object.keys(base.lines)[0], copy0 = Object.keys(base.copy)[0];
  bad((p) => { delete p.lines[first]; }, `/lines/${first}: missing`);
  bad((p) => { p.lines['m9-dan-new-line'] = ['dan', 'A new line.']; }, '/lines/m9-dan-new-line: not in the base pack');
  bad((p) => { p.lines[first][0] = 'jane'; }, 'speaker is dan');
  bad((p) => { p.lines[first][1] = 'x'.repeat(200); }, 'longer than');
  bad((p) => { p.lines[first][1] = 'Hi {nobody}.'; }, 'unknown token {nobody}');
  bad((p) => { p.lines[first][1] = 'Hi <b>there</b>.'; }, 'not allowed');
  bad((p) => { p.copy[copy0] = 'a​b'; }, 'not allowed');
  bad((p) => { p.cast.jane.name = 'Ja\nne'; }, '/cast/jane/name');
  bad((p) => { p.cast.knox.body = 'mack'; }, 'bodies');
  bad((p) => { p.cast.dan.look.height = 1.02; }, '/cast/dan/look/height');
  bad((p) => { p.cast.jane.look.skin = [2, 1, 1]; }, 'above 1.08');
  bad((p) => { p.car.paint = 'red'; }, '/car/paint');
  bad((p) => { p.difficulty.heroHp = 999; }, 'above 200');
  bad((p) => { p.title.episode = ''; }, 'shorter than 1');
  bad((p) => { p.names.bank = 'Bank {x}'; }, '/names/bank');
  bad((p) => { p.pack = 2; }, '/pack');
  bad((p) => { p.extra = 1; }, '/extra: not allowed');
  bad((p) => { p.title.episode = '{dan} Returns'; }, '/title/episode: no tokens');
  // (a limit holds for the words as shown, rendered with the pack's own names: the 12-letter JPBANK sign with a longer bank)
  bad((p) => { p.names.bank = 'Fourteenletter'; p.copy['m3.sign.jpbank'] = '{bank:upper}!'; }, "/copy/m3.sign.jpbank: longer than 12 (as shown, with this pack's names)");
  // (the same bank name with the sign left as the base's words: valid, the sign squeezed at run time)
  const lb = clone(base); lb.names.bank = 'Fourteenletter'; assert.deepEqual(validatePack(lb, base, limits).errors, []);
  bad((p) => { p.lines[first][1] = p.lines[first][1] + ' x'.repeat(40); }, `/lines/${first}: longer than`);
  // (ordinary renames leave the untouched entries valid)
  const renamed = clone(base); for (const [k, n] of Object.entries({ dan: 'Eli', jane: 'Rosa', mrbig: 'Mr. Vance', gears: 'Sprocket', moon: 'Biscuit', suits: 'Blazers' })) renamed.cast[k].name = n; renamed.names.bank = 'Dollarvault';
  assert.deepEqual(validatePack(renamed, base, limits).errors, []);
  const ok = clone(base); ok.consent = { names: ['A Person'], basis: 'self' }; ok.cast.jane.name = 'Ann'; ok.lines[first][1] = 'Hi.';
  assert.deepEqual(validatePack(ok, base, limits).errors, []);
});

test('?story= is read only from gamemog.com story routes (and local test addresses on a local server)', () => {
  const prod = new URL('https://mc.gamemog.com/?story=x'), dev = new URL('http://127.0.0.1:4961/?story=x');
  for (const u of ['https://gamemog.com/g/my-mog/story.json', 'https://gamemog.com/g/my-mog/story.json?v=abc123', 'https://gamemog.com/d/AbC_12-x/story.json']) assert.equal(allowed(u, prod), u, u);
  for (const u of ['https://evil.com/g/x/story.json', 'http://gamemog.com/g/x/story.json', 'https://gamemog.com.evil.com/g/x/story.json', 'https://gamemog.com/g/x/story.json?v=1&x=2',
    'https://gamemog.com/g/x/other.json', 'https://gamemog.com/g/x/story.json#h', 'https://user@gamemog.com/g/x/story.json', 'https://gamemog.com/g/../story.json', 'javascript:alert(1)',
    'http://localhost:3939/g/x/story.json', '/tools/story/test-packs/sample.json', 'https://mc.gamemog.com/tools/story/test-packs/sample.json', 'data:application/json,{}']) assert.equal(allowed(u, prod), null, u);
  assert.equal(allowed('/tools/story/test-packs/sample.json', dev), 'http://127.0.0.1:4961/tools/story/test-packs/sample.json');
  assert.equal(allowed('http://localhost:3939/d/abc/story.json', dev), 'http://localhost:3939/d/abc/story.json');
  assert.equal(allowed('/tools/story/../../index.json', dev), null);
  // (?host=: a dev parent's own story routes, only on a local mc; the parent's origin from a fixed list)
  assert.equal(allowed('http://localhost:3961/g/x/story.json', dev, 'http://localhost:3961'), 'http://localhost:3961/g/x/story.json');
  assert.equal(allowed('http://localhost:3961/g/x/story.json', dev), null);
  assert.equal(allowed('http://localhost:3961/g/x/story.json', prod, 'http://localhost:3961'), null);
  assert.equal(allowed('http://localhost:3962/g/x/story.json', dev, 'http://localhost:3961'), null);
  for (const [h, want] of [['https://gamemog.com', 'https://gamemog.com'], ['https://www.gamemog.com/x', 'https://www.gamemog.com'], ['http://localhost:3961', 'http://localhost:3961'], ['http://127.0.0.1:4000', 'http://127.0.0.1:4000'],
    ['https://evil.com', null], ['http://gamemog.com', null], ['https://localhost:3961', null], ['', null], ['*', null]]) assert.equal(hostOf(h), want, h);
});

test('a changed pack: renames flow through tokens, unchanged words keep their literal', () => {
  const p = clone(base); p.cast.jane.name = 'Ann'; p.names.bank = 'MegaBank';
  const S = makeStory(p, base);
  const said = Object.entries(base.lines).find(([, [, t]]) => t.includes('{jane}'));
  assert.ok(said); const { speaker, text } = ids.lines[said[0]];
  assert.ok(S.line(speaker, text).includes('Ann')); assert.equal(S.changed(speaker, S.line(speaker, text)), true);
  const plain = Object.entries(base.lines).find(([, [, t]]) => !t.includes('{'));
  assert.equal(S.line(ids.lines[plain[0]].speaker, ids.lines[plain[0]].text), ids.lines[plain[0]].text);
  assert.equal(S.t('OCCUPY JPBANK'), 'OCCUPY MEGABANK');
  assert.equal(S.name('Jane'), 'Ann'); assert.equal(S.t('Jane'), 'Ann');
  assert.equal(S.title(), 'MOG CITY: Unfinished Business');
  assert.equal(voiceKey('Jane', 'Hi, there!'), 'jane|hi there');
});

test('keys inherited from Object.prototype are never cast, names or tokens (constructor, toString, __proto__)', () => {
  const first = Object.keys(base.lines)[0], copy0 = Object.keys(base.copy)[0];
  const evil = '<img src=x onerror=alert(1)>';
  for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    // (as GameMog would receive it: JSON text, where "__proto__" is an own key)
    const text = JSON.stringify(base).replace('"cast":{', `"cast":{"${key}":{"name":${JSON.stringify(evil)}},`);
    const p = JSON.parse(text);
    p.copy[copy0] = `{${key}}`; p.lines[first] = [p.lines[first][0], `Hi {${key}}`];
    const v = validatePack(p, base, limits);
    assert.equal(v.ok, false, key);
    // (and render never reads an inherited key, whatever got past)
    assert.equal(render(`{${key}}`, { cast: {}, names: {} }), `{${key}}`, key);
    const S = makeStory(base, base); assert.equal(S.name(key), key);
  }
  // the reviewer's case exactly: a pack with only the constructor entry and token added
  const p = clone(base); Object.defineProperty(p.cast, 'constructor', { value: { name: evil }, enumerable: true, configurable: true, writable: true });
  p.copy[copy0] = '{constructor}';
  assert.equal(validatePack(p, base, limits).ok, false);
  const t = clone(base); t.title.toString = 'x'; t.title.constructor = '<x>';
  assert.equal(validatePack(t, base, limits).ok, false);
});

