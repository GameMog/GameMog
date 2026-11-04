// Mog City: the default story pack, made from the game's own source (Node, run by hand; its output is committed).
//   node tools/story/extract.mjs          writes assets/story/default.json (the pack), ids.json (each id's place in the
//                                         source) and limits.json (each entry's longest text); --check: writes nothing,
//                                         fails if any of the three would change
// The lines are the voice build's (wagmi/radio/build/lines.mjs readLines: the 462 recorded lines, by their ids); the
// copy is what tools/story/scan.mjs finds reaching the screen through the story's chokepoints. Names and brands become
// tokens ({jane}, {bank:upper}) where they are whole words, and every entry is checked to render back to its source
// literal before anything is written. Ids are frozen: an id already in ids.json keeps its place (a line whose words
// the owner rewrites keeps its id; see README.md, Versioning).
import fs from 'node:fs';
import path from 'node:path';
import { readLines } from '../../wagmi/radio/build/lines.mjs';
import { CAST, SPEAKER, MEN, render, validatePack, voiceKey } from '../../wagmi/story/schema.js';
import { ROOT, copyOf, gameFiles, literals } from './scan.mjs';

const OUT = path.join(ROOT, 'assets/story');

// ---- the words that become tokens: [literal, token], longest first (case-sensitive, whole words)
const NAME = { bank: 'JPBank', blimp: 'Blimpco', occupy: 'Occupy', college: 'SUNY' };
// (lower-case forms only where the word is never an ordinary one in the game's text: 'camp' and 'tank' stay words;
// 'moon' lower-case is always the dog, in Jane's lower-case DMs and the phone's feed)
const LOWER = new Set(['dan', 'jane', 'mrbig', 'gears', 'fiona', 'knox', 'mack', 'rook', 'moon', 'bank', 'blimp']);
export const WORDS = (() => {
  const out = [];
  const add = (lit, tok) => { if (!out.some(([l]) => l === lit)) out.push([lit, tok]); };
  const forms = (id, v) => { add(v, `{${id}}`); add(v.toUpperCase(), `{${id}:upper}`); if (LOWER.has(id)) add(v.toLowerCase(), `{${id}:lower}`); };
  for (const [id, s] of Object.entries(CAST)) forms(id, s);
  for (const [k, v] of Object.entries(NAME)) forms(k, v);
  return out.sort((a, b) => b[0].length - a[0].length);
})();
export function tokenize(text) {
  let s = text;
  for (const [lit, tok] of WORDS) {
    const re = new RegExp(`(?<![A-Za-z0-9{:])${lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9}])`, 'g');
    s = s.replace(re, tok);
  }
  return s;
}

// ---- the cast as the game has it (looks: null / 1 = as modelled; voices: the browser voice for a changed line)
const v = (pitch, rate, prefer) => ({ pitch, rate, prefer });
const skin = [1, 1, 1];
const person = (name, voice) => ({ name, look: { skin, hair: null, outfit: null, build: 1, height: 1 }, voice });
const suit = (id, voice) => ({ name: CAST[id], body: id, look: { skin, hair: null, suit: null, shirt: null, build: 1, height: 1 }, voice });
const CAST_DEFAULT = {
  dan: { name: 'Dan', look: { skin, hair: null, outfit: null }, voice: v(0.9, 1.05, 'male') },
  jane: person('Jane', v(1.1, 1.05, 'female')),
  mrbig: person('Mr. Big', v(0.7, 0.92, 'male')),
  gears: person('Gears', v(0.75, 0.95, 'male')),
  fiona: person('Fiona', v(1.25, 1.1, 'female')),
  bea: { name: 'Bea', voice: v(1.0, 1.0, 'female') },
  camp: { name: 'Camp', voice: v(1.0, 1.05, 'any') },
  moon: { name: 'Moon', look: { fur: null } },
  knox: suit('knox', v(0.8, 1.0, 'male')),
  hooks: suit('hooks', v(0.85, 1.0, 'male')),
  tank: suit('tank', v(0.7, 0.95, 'male')),
  brick: suit('brick', v(0.85, 1.05, 'male')),
  dash: suit('dash', v(1.0, 1.1, 'male')),
  mack: suit('mack', v(0.8, 1.1, 'male')),
  rook: suit('rook', v(0.95, 1.0, 'male')),
  suits: { name: 'Suits' },
};

// ---- copy ids: <scene>.<kind>.<first words>
const sceneOf = (file) => { const b = path.basename(file, '.js'); return /^m\d/.test(b) ? b.replace(/-.*$/, '') : { roadster: 'car', game: 'game', intro: 'intro' }[b] || b.replace(/[^a-z0-9]/g, ''); };
const KIND = { objective: 'objective', drive: 'objective', help: 'help', failed: 'fail', passed: 'passed', title: 'title', place: 'place', caption: 'caption', dm: 'dm', caller: 'caller', counter: 'counter', offer: 'offer', holdAct: 'hold', call: 'call', show: 'phone', canvas: 'sign', name: 'name', to: 'name', set: 'name', t: 'text' };
// (an entry's length as shown: rendered with Mog City's own names, as the validator measures a Mog's with its own)
const shown = (t) => [...render(t, { cast: CAST_DEFAULT, names: NAME })].length;
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4).join('-') || 'x';

export function extract(root = ROOT) {
  const old = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'ids.json'), 'utf8')); } catch { return { lines: {}, copy: {} }; } })();
  const problems = [];
  // the lines (the voice build's ids; an id already frozen for the same speaker and words is kept)
  const frozen = new Map(Object.entries(old.lines || {}).map(([id, o]) => [voiceKey(o.speaker, o.text), id]));
  const lines = {}, lineIds = {}, lineLimits = {};
  // (a line's place: the first string literal with its words, in the voice build's order of files)
  const firstAt = new Map();
  for (const f of ['wagmi/intro.js', ...gameFiles(root).filter((f) => f.startsWith('wagmi/mission/')).sort((a, b) => (a.endsWith('/calls.js')) - (b.endsWith('/calls.js')) || (a < b ? -1 : 1)), ...gameFiles(root)])
    for (const L of literals(f, root)) if (!firstAt.has(L.text)) firstAt.set(L.text, `${L.file}:${L.line}`);
  const where = (text) => firstAt.get(text) || null;
  const speakers = new Set();
  for (const L of readLines(root)) {
    const who = SPEAKER[L.speaker]; if (!who) { problems.push(`line ${L.id}: speaker ${L.speaker} is not in the cast`); continue; }
    const id = frozen.get(voiceKey(L.speaker, L.text)) || L.id;
    const t = tokenize(L.text);
    lines[id] = [who, t]; speakers.add(who);
    lineIds[id] = { scene: L.scene, speaker: L.speaker, text: L.text, at: where(L.text), ...(L.window ? { window: L.window } : {}) };
    // (an opening line fits its window at 17 characters a second; the rest twice their length, 24 at least, 220 at most)
    lineLimits[id] = L.window ? Math.max(shown(t), Math.floor((L.window[1] - L.window[0]) * 17)) : Math.max(shown(t), Math.min(220, Math.max(24, 2 * shown(t))));
  }
  // the copy (each text once; a spoken line's words are a line, not copy)
  const said = new Set(Object.values(lineIds).map((l) => l.text));
  const frozenCopy = new Map(Object.entries(old.copy || {}).map(([id, o]) => [o.text, id]));
  const copy = {}, copyIds = {}, copyLimits = {};
  for (const c of copyOf(gameFiles(root), root)) {
    if (said.has(c.text)) continue;
    const kind = KIND[c.ctx.split(':')[0]] || 'text';
    let id = frozenCopy.get(c.text) || `${sceneOf(c.at.split(':')[0])}.${kind}.${slug(c.text)}`;
    if (!frozenCopy.has(c.text)) for (let n = 2; id in copy; n++) id = id.replace(/(-\d+)?$/, `-${n}`).replace(/\.(\d+)$/, '.x-$1');
    const t = tokenize(c.text);
    copy[id] = t; copyIds[id] = { text: c.text, at: c.at, ctx: c.ctx };
    // (signs, cards and labels a little longer than they are, refitted on the canvas at run time; the rest twice)
    const tight = /^(sign|title|place|caption|counter|caller|call|name)$/.test(kind);
    copyLimits[id] = tight ? Math.max(shown(t), Math.min(80, Math.ceil(shown(t) * 1.5)), 12) : Math.max(shown(t), Math.min(220, Math.max(24, 2 * shown(t))));
  }
  const pack = {
    pack: 1, base: 'mog-city@1',
    title: { episode: 'Unfinished Business' },
    names: { ...NAME },
    cast: CAST_DEFAULT,
    car: { paint: '#E7E7E3' },
    lines, copy,
    difficulty: { enemyHp: 1, enemyDamage: 1, heroHp: 100, crewExtra: 0, chaseSpeed: 1 },
  };
  // every entry renders back to its source literal
  for (const [id, [, t]] of Object.entries(lines)) if (render(t, pack) !== lineIds[id].text) problems.push(`line ${id}: renders ${JSON.stringify(render(t, pack))}`);
  for (const [id, t] of Object.entries(copy)) if (render(t, pack) !== copyIds[id].text) problems.push(`copy ${id}: renders ${JSON.stringify(render(t, pack))}`);
  if (MEN.some((m) => pack.cast[m].body !== m)) problems.push('a Suit plays another man');
  const limits = { lines: lineLimits, copy: copyLimits };
  const v1 = validatePack(pack, pack, limits);
  if (!v1.ok) problems.push(...v1.errors.map((e) => `schema ${e}`));
  return { pack, ids: { lines: lineIds, copy: copyIds }, limits, problems };
}

// the three files as written (name -> text), and the problems found making them
export function outputs(root = ROOT) {
  const { pack, ids, limits, problems } = extract(root);
  // (one entry a line: arrays of plain values, and small objects of them, kept on their own line)
  const tidy = (o) => JSON.stringify(o, null, 1).replace(/\[\n\s*([^[\]{}]*?)\n\s*\]/g, (m, a) => `[${a.split(/,\n\s*/).join(', ')}]`).replace(/\{\n\s*([^[\]{}]*?)\n\s*\}/g, (m, a) => `{ ${a.split(/,\n\s*/).join(', ')} }`);
  const files = { 'default.json': tidy(pack) + '\n', 'ids.json': tidy(ids) + '\n', 'limits.json': JSON.stringify(limits) + '\n' };
  return { files, pack, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, pack, problems } = outputs();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  if (process.argv.includes('--check')) {
    // (ids.json's source places move with every edit above them: compared without them)
    const bare = (f, t) => (f === 'ids.json' ? t.replace(/,? ?"at": "[^"]*",? ?/g, '') : t);
    const stale = Object.entries(files).filter(([f, s]) => { try { return bare(f, fs.readFileSync(path.join(OUT, f), 'utf8')) !== bare(f, s); } catch { return true; } }).map(([f]) => f);
    if (stale.length) { console.error('assets/story is stale (run node tools/story/extract.mjs):', stale.join(', ')); process.exit(1); }
    console.log('assets/story is current'); process.exit(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), s);
  console.log(`assets/story: ${Object.keys(pack.lines).length} lines, ${Object.keys(pack.copy).length} copy, default.json ${(Buffer.byteLength(JSON.stringify(pack)) / 1024).toFixed(1)} KB minified`);
}
