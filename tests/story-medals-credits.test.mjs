// A story's medals and end credits, shared by every story world (wagmi/storyrun/rules.js medalOf, medalRows, damageOf,
// creditsRoll; pack.js check of `credits` and a mission's `medals`; index.js and hud.js wire them in).
//   node --test tests/story-medals-credits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.location = new URL('http://127.0.0.1:4981/?pack=x');
const { medalOf, medalRows, damageOf, creditsRoll, creditRole, medalRank } = await import('../wagmi/storyrun/rules.js');
const { check } = await import('../wagmi/storyrun/pack.js');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const M = { gold: { secs: 240, damage: 10 }, silver: { secs: 330, damage: 30 }, bronze: { secs: 480 } };

test('a pass earns the best tier its time and its damage both meet; none from a checkpoint', () => {
  assert.equal(medalOf(M, { secs: 200, damage: 5, whole: true }), 'gold');
  assert.equal(medalOf(M, { secs: 200, damage: 20, whole: true }), 'silver');
  assert.equal(medalOf(M, { secs: 300, damage: 5, whole: true }), 'silver');
  // (bronze names no damage: any)
  assert.equal(medalOf(M, { secs: 470, damage: 400, whole: true }), 'bronze');
  assert.equal(medalOf(M, { secs: 481, damage: 0, whole: true }), null);
  assert.equal(medalOf(M, { secs: 100, damage: 0, whole: false }), null);
  assert.equal(medalOf(null, { secs: 100, damage: 0, whole: true }), null);
  assert.ok(medalRank('gold') > medalRank('silver') && medalRank('silver') > medalRank('bronze') && medalRank(null) === 0);
});

test("the card's medal says what it got and what the next tier asks", () => {
  const s = medalRows(M, { secs: 300, damage: 12, whole: true });
  assert.equal(s.label, 'SILVER');
  assert.deepEqual(s.rows, [['DAMAGE', '12']]);
  assert.equal(s.hint, 'GOLD: under 4:00, damage 10 or less');
  assert.equal(medalRows(M, { secs: 100, damage: 0, whole: true }).hint, '');
  assert.equal(medalRows(M, { secs: 900, damage: 0, whole: true }).label, 'NO MEDAL');
  assert.match(medalRows(M, { secs: 100, whole: false }).hint, /from its start/);
  assert.equal(medalRows(M, { secs: 300, damage: 0, whole: true }, 'gold').best, 'GOLD');
  assert.equal(medalRows(M, { secs: 100, damage: 0, whole: true }, 'silver').best, null);
  assert.equal(medalRows(null, { secs: 1 }), null);
});

test('damage: the car as a percentage of a car, 3 a hit on foot', () => {
  assert.equal(damageOf({ car: 0.125, hits: 2 }), 19);
  assert.equal(damageOf({}), 0);
  assert.equal(damageOf({ car: -1 }), 0);
});

test('the credits roll: the title, the cast, the voices, its own lines, the map, GameMog Community last', () => {
  const def = { title: 'A Story', kicker: 'SAN JOSE, CA', cast: { Ann: { role: 'hero: the driver, in her red coat and boots' }, Rex: { pet: {} }, Bo: { role: 'the boss: A Story' } }, credits: { lines: ['Built from CC0 parts.'] } };
  const r = creditsRoll(def, { map: [{ what: 'Map data', who: '© OpenStreetMap contributors', licence: 'ODbL 1.0' }], place: 'San Jose' });
  assert.equal(r[0].title, 'A Story');
  assert.deepEqual(r.find((s) => s.head === 'Starring').lines, [['Ann', 'the driver'], ['Bo', 'the boss']]);
  assert.ok(r.some((s) => s.head === 'Voices'));
  assert.deepEqual(r.find((s) => s.head === 'Made with').lines, ['Built from CC0 parts.']);
  assert.deepEqual(r.find((s) => s.head === 'The map: San Jose').lines, [['© OpenStreetMap contributors · ODbL 1.0', 'Map data']]);
  assert.deepEqual(r.at(-1).lines, ['GameMog Community']);
  // (a world without credits has no roll)
  assert.deepEqual(creditsRoll({ title: 'x', cast: {} }), []);
});

test('the credits roll: a role as a credit, a few words, never cut mid-word', () => {
  const T = 'Jensen Heist';
  assert.equal(creditRole('keynote stage manager: Jensen Heist', T), 'keynote stage manager');
  assert.equal(creditRole('hero: founder-CEO of Greenlight Silicon, in his black leather jacket', T), 'founder-CEO of Greenlight Silicon');
  assert.equal(creditRole('ex-bank boss from back east, collector of board seats', T), 'ex-bank boss from back east');
  assert.equal(creditRole('rival CEO of Cobalt Circuitry: Jensen Heist', T), 'rival CEO of Cobalt Circuitry');
  assert.equal(creditRole('enemy intern: JENSEN HEIST', T), 'enemy intern');
  assert.equal(creditRole('hero: Jensen Heist, founder-CEO of Greenlight Silicon in his black leather jacket', T), 'founder-CEO of Greenlight Silicon');
  assert.equal(creditRole('the one who keeps the lights on and the doors shut and the coffee hot'), 'the one who keeps');
  assert.equal(creditRole('superintendent of the extraordinarily overcomplicated building'), 'superintendent');
  assert.equal(creditRole(undefined), '');
  for (const r of ['hero: founder-CEO of Greenlight Silicon, in his black leathe', 'a b c d e f g h', 'x'.repeat(10) + ' ' + 'y'.repeat(30)]) {
    const c = creditRole(r); assert.ok(c.length <= 34 && c.split(' ').length <= 5, c);
    assert.ok(!c || r.replace(/^hero:\s*/, '').startsWith(c), c);
  }
});

test('the credits roll: the pack\'s own cast and voices, and a default that names no model', () => {
  const def = { title: 'A Story', cast: { Ann: { role: 'hero: the driver' }, Bo: { role: 'the boss' } }, voice: { model: 'kokoro' }, credits: { lines: [] } };
  const r = creditsRoll(def);
  const st = r.find((s) => s.head === 'Starring');
  assert.equal(st.cast, true);
  assert.deepEqual(r.find((s) => s.head === 'Voices').lines, ['Voices synthesised']);
  assert.doesNotMatch(JSON.stringify(r), /Kokoro|kokoro/);
  const own = creditsRoll({ ...def, credits: { cast: [{ name: 'Ann', role: 'the wheelman' }, { name: 'Bo' }, { role: 'nameless' }], voices: ['Voices: Qwen3-TTS (Apache-2.0).', ''] } });
  assert.deepEqual(own.find((s) => s.head === 'Starring').lines, [['Ann', 'the wheelman'], ['Bo', '']]);
  assert.deepEqual(own.find((s) => s.head === 'Voices').lines, ['Voices: Qwen3-TTS (Apache-2.0).']);
  // (no voices lines: the voice record's own credit)
  const rec = creditsRoll({ ...def, voice: { model: 'kokoro', credit: 'Voices: Qwen3-TTS.' } });
  assert.deepEqual(rec.find((s) => s.head === 'Voices').lines, ['Voices: Qwen3-TTS.']);
});

test('the pack check takes credits and medals, and refuses bad ones', () => {
  const native = JSON.parse(src('tools/storyrun/test-packs/native.json'));
  const bad = (f) => { const w = structuredClone(native); f(w); return check(w); };
  assert.deepEqual(bad((w) => { w.credits = { lines: ['A line.'] }; w.missions[0].medals = M; }), []);
  assert.ok(bad((w) => { w.credits = { lines: ['x'.repeat(200)] }; }).some((e) => /credits/.test(e)));
  assert.ok(bad((w) => { w.credits = ['x']; }).some((e) => /credits/.test(e)));
  assert.deepEqual(bad((w) => { w.credits = { lines: [], cast: [{ name: 'Ann', role: 'the driver' }], voices: ['Voices: X.'] }; w.calls = { ringOut: 'answer' }; }), []);
  assert.ok(bad((w) => { w.credits = { cast: [{ role: 'x' }] }; }).some((e) => /credits\.cast/.test(e)));
  assert.ok(bad((w) => { w.credits = { voices: 'x' }; }).some((e) => /credits\.voices/.test(e)));
  assert.ok(bad((w) => { w.calls = { ringOut: 'later' }; }).some((e) => /calls/.test(e)));
  assert.ok(bad((w) => { w.missions[0].medals = { platinum: { secs: 9 } }; }).some((e) => /medals/.test(e)));
  assert.ok(bad((w) => { w.missions[0].medals = { gold: { secs: -1 } }; }).some((e) => /medals/.test(e)));
});

test('wired in: the runner times a whole run and its damage, the pass card shows the medal, the end rolls the credits', () => {
  const run = src('wagmi/storyrun/runner.js'), idx = src('wagmi/storyrun/index.js'), hud = src('wagmi/storyrun/hud.js'), dmg = src('wagmi/crash/damage.js');
  assert.match(dmg, /D\.taken \+= cost/);
  assert.match(run, /whole: !cp/);
  assert.match(run, /damage: r\.damage, whole: r\.whole/);
  assert.match(idx, /medalRows\(m\.medals, r, best0\)/);
  assert.match(idx, /save\.medals\[m\.id\] = medal/);
  assert.match(idx, /await hud\.roll\(roll/);
  assert.match(hud, /async roll\(sections/);
  assert.match(hud, /if \(c\.medal\)/);
});
