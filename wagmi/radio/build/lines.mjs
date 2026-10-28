// Mog City: the game's spoken lines, read out of its own source (Node, for the voice build and the line sheet).
//   wagmi/intro.js        the opening's LINES: ['Speaker', COLOUR, from, to, 'text'] (timed to the cutscene's clock)
//   wagmi/mission/*.js    say([...]) lines: ['Speaker', COLOUR, 'text', pause?], and ui.sub('Speaker', 'text', ...);
//                         a line said from a list, ['Mack', ACID, barks[i]], is each string of that file's
//                         `const barks = ['...', ...]` (Mack's barks in m2.js)
//   wagmi/mission/calls.js  Jane's car calls (CALLS), read after the missions (so a line a call took over from a mission
//                         keeps its id): a line's scene is its call's mission ('m2-tail': m2; the lines every call
//                         shares, PAUSE and RESUME: 'calls'), and it carries its call, its part ('main', 'react.spotted'...)
//                         and its register: the call's mode ('whisper', 'fast'; else 'normal'), 'fast' for a cue's
//                         `fled` line and for a quiet call's 'spotted' pool (where a call with fastFrom turns fast)
// Each line gets an id (scene-speaker-first-words), stable while its text is: change the words and it is a new line
// to record. The same words from the same speaker in two places are one line (the first place found: its register).
import fs from 'node:fs';
import path from 'node:path';

const STR = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'`;
const lit = (s) => Function(`return ${s}`)();
export const key = (speaker, text) => `${speaker.toLowerCase()}|${String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '').trim().split(/\s+/).slice(0, 4).join('-');

export function readLines(root) {
  const out = [], seen = new Map();
  const add = (scene, speaker, text, extra = {}) => {
    const k = key(speaker, text);
    if (seen.has(k)) { seen.get(k).also.push(scene); return; }
    let id = `${scene}-${speaker.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${slug(text) || 'line'}`;
    for (let n = 2; out.some((l) => l.id === id); n++) id = id.replace(/(-\d+)?$/, `-${n}`);
    const L = { id, scene, speaker, text, also: [], ...extra };
    seen.set(k, L); out.push(L);
  };
  // the opening: its LINES block, in order, with their windows
  const intro = fs.readFileSync(path.join(root, 'wagmi/intro.js'), 'utf8');
  const block = intro.match(/const LINES = \[([\s\S]*?)\n\s*\];/);
  if (block) {
    const re = new RegExp(String.raw`\[\s*(${STR})\s*,\s*[A-Z_]+\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*(${STR})\s*\]`, 'g');
    for (const m of block[1].matchAll(re)) add('intro', lit(m[1]), lit(m[4]), { window: [+m[2], +m[3]] });
  }
  // the missions, file by file in name order (m1, m2, ...), each in source order; the car calls last
  const dir = path.join(root, 'wagmi/mission');
  const files = fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).sort((a, b) => (a === 'calls.js') - (b === 'calls.js') || (a < b ? -1 : a > b ? 1 : 0));
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8'), scene = f.replace(/\.js$/, '').replace(/-.*$/, ''); // (m2-scenes.js: m2)
    const calls = f === 'calls.js' ? callBlocks(src) : null;
    const re = new RegExp(String.raw`\[\s*(${STR})\s*,\s*(?:[A-Z_]+|${STR})\s*,\s*(${STR})\s*(?:,\s*[\d.]+\s*)?\]|ui\.sub\(\s*(${STR})\s*,\s*(${STR})`, 'g');
    for (const m of src.matchAll(re)) {
      const speaker = lit(m[1] || m[3]), text = lit(m[2] || m[4]);
      // (speakers are names: 'Dan', 'Jane', 'Mr. Big'; anything else in that shape is not a line)
      if (!/^[A-Z][A-Za-z .']{0,23}$/.test(speaker) || !/[a-z!?]/i.test(text) || text.length < 2) continue;
      if (!calls) { add(scene, speaker, text); continue; }
      const c = calls.find((b) => m.index > b.at && m.index < b.end);
      if (!c) { add('calls', speaker, text, { call: '*', part: 'shared', register: 'normal' }); continue; }
      const part = keysAt(src, c.body, m.index + 1).join('.');
      const register = /(^|\.)fled$/.test(part) || (c.fastFrom && /^react\.spotted$/.test(part)) ? 'fast' : c.mode;
      add(c.id.replace(/-.*$/, ''), speaker, text, { call: c.id, part, register });
    }
    // (lines said from a list of strings: ['Mack', ACID, barks[0]] and const barks = ["...", '...'])
    for (const m of src.matchAll(new RegExp(String.raw`\[\s*(${STR})\s*,\s*[A-Z_]+\s*,\s*([A-Za-z_$][\w$]*)\s*\[`, 'g'))) {
      const speaker = lit(m[1]), list = new RegExp(String.raw`(?:const|let)\s+${m[2]}\s*=\s*\[((?:\s*(?:${STR})\s*,?)+)\]`).exec(src);
      if (!/^[A-Z][A-Za-z .']{0,23}$/.test(speaker) || !list) continue;
      for (const t of list[1].matchAll(new RegExp(STR, 'g'))) add(scene, speaker, lit(t[0]));
    }
  }
  return out;
}

// the calls of calls.js: each `'m2-tail': {` block of CALLS, its mode and whether it has fastFrom
function callBlocks(src) {
  const top = src.indexOf('export const CALLS = {'); if (top < 0) return [];
  const end = src.indexOf('\n};', top), out = [];
  for (const m of src.slice(top, end).matchAll(/^ {2}'([a-z0-9-]+)': \{/gm)) out.push({ id: m[1], at: top + m.index, body: top + m.index + m[0].length });
  out.forEach((b, i) => {
    b.end = i + 1 < out.length ? out[i + 1].at : end;
    const head = src.slice(b.body, b.end).split('\n').slice(0, 3).join('\n');
    b.mode = /\bmode:\s*'(\w+)'/.exec(head)?.[1] || 'normal';
    b.fastFrom = /\bfastFrom:/.test(head);
  });
  return out;
}
// the keys a position in an object literal sits under, strings and comments skipped (['react', 'spotted'], ['cues', 'fled'])
function keysAt(src, from, to) {
  const stack = []; let pending = null;
  for (let i = from; i < to; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < to && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < to && src[i] !== '\n') i++; continue; }
    if (/[A-Za-z_$]/.test(c) && !/[\w$]/.test(src[i - 1] || '')) {
      const k = /^([A-Za-z_$][\w$]*)\s*:\s*(?=[[{])/.exec(src.slice(i, i + 48));
      if (k) { pending = k[1]; i += k[0].length - 1; continue; }
    }
    if (c === '[' || c === '{') { stack.push(pending); pending = null; } else if (c === ']' || c === '}') stack.pop();
  }
  return stack.filter(Boolean);
}

// node wagmi/radio/build/lines.mjs : print them
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  for (const l of readLines(root)) console.log(l.id.padEnd(46), l.window ? l.window.join('-').padEnd(12) : (l.call ? `${l.register}`.padEnd(12) : ''.padEnd(12)), l.text);
}
