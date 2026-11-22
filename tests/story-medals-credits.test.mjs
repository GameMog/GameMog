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
  const r = creditsRoll(def, { map: [{ what: 'Map data', who: '© OpenStreetMap contributors', licence: 'ODbL 1.0' }], place: 'San Jose', voiced: true });
  assert.equal(r[0].title, 'A Story');
  assert.deepEqual(r.find((s) => s.head === 'Starring').lines, [['Ann', 'the driver'], ['Bo', 'the boss']]);
  assert.ok(r.some((s) => s.head === 'Voices'));
  assert.deepEqual(r.find((s) => s.head === 'Made with').lines, ['Built from CC0 parts.']);
  assert.deepEqual(r.find((s) => s.head === 'The map: San Jose').lines, [['© OpenStreetMap contributors · ODbL 1.0', 'Map data']]);
  assert.deepEqual(r.at(-1).lines, ['GameMog Community']);
  // (no world, no roll)
  assert.deepEqual(creditsRoll(null), []);
});

test("the credits roll: a hometown's map lists only its own data, the city engine's code goes under Played on", () => {
  const def = { title: 'A Story', cast: {}, credits: { lines: [] } };
  const map = [
    { what: 'Slop San Francisco', who: 'Kamil (@unable0_) and Mr.doob', engine: true, licence: 'MIT' },
    { what: 'Map data', who: '© OpenStreetMap contributors', licence: 'ODbL 1.0' },
    { what: 'Overture Maps Foundation', who: 'Overture Maps', licence: 'ODbL 1.0 / CC BY 4.0 / CDLA Permissive 2.0' },
    { what: 'Elevation', who: 'USGS 3D Elevation Program', licence: 'public domain' },
  ];
  const r = creditsRoll(def, { map, place: 'San Jose' });
  const m = r.find((s) => s.head === 'The map: San Jose').lines.map((l) => l[1]);
  assert.deepEqual(m, ['Map data', 'Overture Maps Foundation', 'Elevation']);
  assert.deepEqual(r.find((s) => s.head === 'Played on').lines, ["Mog City's story engine", ['Kamil (@unable0_) and Mr.doob · MIT', 'Slop San Francisco']]);
  // (credits.js marks the engine's code as engine in every city's list: the hometown's Slop San Francisco, Slop New York)
  const src = fs.readFileSync(path.join(ROOT, 'wagmi/credits.js'), 'utf8');
  const slop = src.split('\n').filter((l) => /what: 'Slop (San Francisco|New York)'/.test(l));
  assert.equal(slop.filter((l) => /engine: true/.test(l)).length, 3);
  assert.ok(/note: 'the city engine this place is played on', engine: true/.test(src));
  // (a roll with only engine lines has no map section)
  assert.ok(!creditsRoll(def, { map: map.slice(0, 1), place: 'San Jose' }).some((s) => /^The map/.test(s.head)));
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
    const c = creditRole(r); assert.ok(c.length <= 34 && c.split(' ').length <= 6, c);
    assert.ok(!c || r.replace(/^hero:\s*/, '').startsWith(c), c);
  }
});

test('the credits roll: the pack\'s own cast and voices, and a default that names no model', () => {
  const def = { title: 'A Story', cast: { Ann: { role: 'hero: the driver' }, Bo: { role: 'the boss' } }, voice: { model: 'kokoro' }, credits: { lines: [] } };
  const r = creditsRoll(def, { voiced: true });
  const st = r.find((s) => s.head === 'Starring');
  assert.equal(st.cast, true);
  assert.deepEqual(r.find((s) => s.head === 'Voices').lines, ['Voices synthesised']);
  // (no lines heard: no Voices section at all)
  assert.ok(!creditsRoll(def).some((s) => s.head === 'Voices'));
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
  assert.match(idx, /await rollCredits\(roll, /);
  assert.match(idx, /ui\.cine\(true\); document\.body\.classList\.add\('sr-rolling'\);\s*try \{ await hud\.roll\(roll/);
  assert.match(src('wagmi/storyrun/guide.js'), /classList\.contains\('sr-rolling'\)/);
  assert.match(hud, /async roll\(sections/);
  assert.match(hud, /if \(c\.medal\)/);
});

/* ------------------------------------------------ the standard roll -- */
// (every story world rolls credits from what it has, the owner's 21 Nov standard: a world with no `credits` of its own,
// shaped as the live ones are: Pickup Time (New York), Colter Land (a hometown), SF 2040 (San Francisco, voices on the air))
const MAPNY = [
  { what: 'Slop New York', who: 'Mr.doob', engine: true, licence: 'MIT' },
  { what: 'Map data', who: '© OpenStreetMap contributors', licence: 'ODbL 1.0' },
  { what: 'City data', who: 'NYC Open Data', licence: null },
];
const MOVES = [
  { what: 'Motion capture', roll: 'moves', who: 'CMU Graphics Lab Motion Capture Database', licence: null },
  { what: 'Motion capture', roll: 'moves', who: 'Bandai Namco Research Motion Dataset, © 2022 Bandai Namco Research Inc.', licence: 'CC BY-NC 4.0' },
];

test('the standard roll: a world with no credits of its own still has its title, cast, voices, map, engine and GameMog Community', () => {
  const def = {
    title: 'Pickup Time', kicker: 'NEW YORK',
    cast: { 'John Marin': { role: 'owns Slice Marin pizza, used to plan heists', glb: '/x.glb' }, 'Agnes Teodoro': { role: 'the Nanny: white hair, very polite, not theirs' },
      'Lou Varga': { role: 'a bail bondsman who once owed John his life' }, Rex: { role: 'the dog', pet: { follows: true } }, '  ': { role: 'nobody' } },
    voice: { model: 'kokoro-82m-v1.0', lines: [{ who: 'John Marin', text: 'Hi.', clip: 'a-b' }] },
  };
  const r = creditsRoll(def, { map: MAPNY, place: 'New York', voiced: true, assets: MOVES });
  assert.deepEqual(r.map((s) => s.head), ['', 'Starring', 'Voices', 'Made with', 'The map: New York', 'Played on', '']);
  assert.equal(r[0].title, 'Pickup Time'); assert.deepEqual(r[0].lines, ['NEW YORK']);
  assert.deepEqual(r[1].lines, [['John Marin', 'owns Slice Marin pizza'], ['Agnes Teodoro', 'the Nanny'], ['Lou Varga', 'a bail bondsman']]);
  assert.deepEqual(r[2].lines, ['Voices synthesised']);
  assert.deepEqual(r[3].lines, [['CMU Graphics Lab Motion Capture Database', 'Motion capture'], ['Bandai Namco Research Motion Dataset, © 2022 Bandai Namco Research Inc. · CC BY-NC 4.0', 'Motion capture']]);
  assert.deepEqual(r[4].lines.map((l) => l[1]), ['Map data', 'City data']);
  assert.deepEqual(r[5].lines, ["Mog City's story engine", ['Mr.doob · MIT', 'Slop New York']]);
  assert.deepEqual(r.at(-1), { head: '', lines: ['GameMog Community'], end: true });
  // (never a model the world did not use, never a raw note's colon)
  const txt = JSON.stringify(r);
  assert.doesNotMatch(txt, /kokoro|Kokoro|qwen|Qwen/);
  for (const [, role] of r[1].lines) assert.doesNotMatch(role, /:/);
  // (its voice plan has clips: voiced when the runner does not say)
  assert.deepEqual(creditsRoll(def).find((s) => s.head === 'Voices').lines, ['Voices synthesised']);
  // (no clips, nothing recorded: no Voices section)
  assert.ok(!creditsRoll({ ...def, voice: { model: 'qwen3-tts', lines: [{ who: 'x', text: 'y' }] } }).some((s) => s.head === 'Voices'));
  assert.ok(!creditsRoll({ title: 'T', cast: {} }).some((s) => s.head === 'Voices' || s.head === 'Starring' || s.head === 'Made with'));
});

test("the standard roll: a sheet's name before its role, the world's own voice credit, its title alone", () => {
  const def = { title: 'SF 2040', kicker: 'SAN FRANCISCO', voice: { model: 'qwen3-tts-12hz (wagmi/radio/build/pack-voices.mjs)', lines: [] },
    cast: { Cal: { role: 'Cal Mercer, an ex-park ranger looking for his family' }, Nina: { role: 'Dr. Nina Mercer, his wife, an ER doctor' },
      Warden: { role: "WARDEN-7, the Preserve's security unit", voiceOnly: true }, Vale: { role: 'Deacon Vale, who leads the Iron Saints', voiceOnly: true } } };
  const r = creditsRoll(def, { map: [{ what: 'Slop San Francisco', who: 'Kamil (@unable0_) and Mr.doob', licence: 'MIT' }, { what: 'Slop New York', who: 'Mr.doob', engine: true, licence: 'MIT' }], place: 'San Francisco', voiced: true });
  assert.deepEqual(r.find((s) => s.head === 'Starring').lines, [['Cal', 'an ex-park ranger'], ['Nina', 'his wife'], ['Warden', "the Preserve's security unit"], ['Vale', 'leads the Iron Saints']]);
  assert.deepEqual(r.find((s) => s.head === 'Voices').lines, ['Voices synthesised']);
  assert.doesNotMatch(JSON.stringify(r), /qwen|pack-voices/i);
  assert.deepEqual(r.find((s) => s.head === 'The map: San Francisco').lines, [['Kamil (@unable0_) and Mr.doob · MIT', 'Slop San Francisco']]);
  // (its own voice credit, said as the world says it)
  assert.deepEqual(creditsRoll({ ...def, voice: { credit: 'Voices: made for SF 2040.' } }, { voiced: true }).find((s) => s.head === 'Voices').lines, ['Voices: made for SF 2040.']);
  // (no title: still a title card)
  assert.equal(creditsRoll({ cast: {} })[0].title, 'Untitled');
});

test("the standard roll: made with its own lines, then what it carries, one line per author, the ones it names left out", () => {
  const fleet = ['Daniel Zhabotinsky', 'Daniel Zhabotinsky', 'Comrade1280'].map((who, i) => ({ what: `"Car ${i}"`, who, group: "The town's cars", licence: 'CC BY 4.0' }));
  const vantor = { what: 'The car\'s body', who: 'Black Snow', licence: 'CC BY 4.0' };
  const type = { what: 'Geist', who: 'The Geist Project Authors', licence: 'SIL OFL 1.1' };
  const def = { title: 'A Story', cast: {}, credits: { lines: ["The town's cars: models by Daniel Zhabotinsky and Comrade1280 (Sketchfab), CC BY 4.0."] } };
  const r = creditsRoll(def, { assets: [...fleet, vantor, type] });
  assert.deepEqual(r.find((s) => s.head === 'Made with').lines, [def.credits.lines[0], ['Black Snow · CC BY 4.0', "The car's body"], ['The Geist Project Authors · SIL OFL 1.1', 'Geist']]);
  // (no own lines: the fleet as one line, its authors once each)
  const r2 = creditsRoll({ title: 'A Story', cast: {} }, { assets: fleet });
  assert.deepEqual(r2.find((s) => s.head === 'Made with').lines, [['Daniel Zhabotinsky, Comrade1280 · CC BY 4.0', "The town's cars"]]);
});

test('the standard roll: credits.js tags what a story carries, the end wires it for every world but Mog City\'s own', () => {
  const cr = src('wagmi/credits.js'), idx = src('wagmi/storyrun/index.js');
  assert.equal((cr.match(/group: FLEET_GROUP/g) || []).length, 18);
  assert.equal((cr.match(/roll: 'moves'/g) || []).length, 2);
  assert.equal((cr.match(/roll: 'bodies'/g) || []).length, 3);
  assert.match(idx, /if \(!isOwn\(world\)\) \{\s*try \{\s*const roll = endRoll\(\);/);
  assert.doesNotMatch(idx, /if \(def\.credits\) \{/);
  assert.match(idx, /voiced = nClips > 0/);
  assert.match(idx, /endRoll, rollCredits, get choosing/);
});

// (the runtime's Vehicles and horse credits, read as written: their modules load three.js's WebGPU build, so the literal
// is taken from the source rather than imported)
const literal = (f, name) => {
  const m = src(f).match(new RegExp(`export const ${name} = (\\{.*?\\});\\s*$`, 'm'));
  assert.ok(m, `${name} in ${f}`);
  return Function(`return (${m[1]});`)();
};

test("the standard roll: a Made with label is a whole name, never a raw note's colon or a mid-word cut", () => {
  const cars = [literal('wagmi/storyrun/vantor.js', 'VANTOR_CREDIT'), literal('wagmi/storyrun/wedge.js', 'WEDGE_CREDIT'), literal('wagmi/horse/index.js', 'HORSE_CREDIT')];
  assert.equal(cars[0].group, "The Vantor GT's body");
  assert.equal(cars[1].group, "The Tensore's body");
  const r = creditsRoll({ title: 'A Story', cast: {} }, { assets: cars });
  const labels = r.find((s) => s.head === 'Made with').lines.map((l) => l[1]);
  assert.deepEqual(labels, ["The Vantor GT's body", "The Tensore's body", 'Ranger, the horse']);
  for (const [i, l] of labels.entries()) {
    assert.doesNotMatch(l, /:/, l);
    // (not cut: the label is the credit's whole group, or its whole what)
    assert.equal(l, cars[i].group || cars[i].what, l);
    assert.doesNotMatch(l, /porsche|gt3/i, l);
  }
});
