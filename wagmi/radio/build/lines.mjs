// Mog City: the game's spoken lines, read out of its own source (Node, for the voice build and the line sheet).
//   wagmi/intro.js        the opening's LINES: ['Speaker', COLOUR, from, to, 'text'] (timed to the cutscene's clock)
//   wagmi/mission/*.js    say([...]) lines: ['Speaker', COLOUR, 'text', pause?], and ui.sub('Speaker', 'text', ...)
// Each line gets an id (scene-speaker-first-words), stable while its text is: change the words and it is a new line
// to record. The same words from the same speaker in two places are one line.
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
  // the missions, file by file in name order (m1, m2, ...), each in source order
  const dir = path.join(root, 'wagmi/mission');
  for (const f of fs.readdirSync(dir).filter((f) => /\.js$/.test(f)).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8'), scene = f.replace(/\.js$/, '').replace(/-.*$/, ''); // (m2-scenes.js: m2)
    const re = new RegExp(String.raw`\[\s*(${STR})\s*,\s*(?:[A-Z_]+|${STR})\s*,\s*(${STR})\s*(?:,\s*[\d.]+\s*)?\]|ui\.sub\(\s*(${STR})\s*,\s*(${STR})`, 'g');
    for (const m of src.matchAll(re)) {
      const speaker = lit(m[1] || m[3]), text = lit(m[2] || m[4]);
      // (speakers are names: 'Dan', 'Jane', 'Mr. Big'; anything else in that shape is not a line)
      if (!/^[A-Z][A-Za-z .']{0,23}$/.test(speaker) || !/[a-z!?]/i.test(text) || text.length < 2) continue;
      add(scene, speaker, text);
    }
  }
  return out;
}

// node wagmi/radio/build/lines.mjs : print them
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  for (const l of readLines(root)) console.log(l.id.padEnd(46), l.window ? l.window.join('-').padEnd(12) : ''.padEnd(12), l.text);
}
