// No cast name, brand or episode title is left in the game's code outside the story pack (tools/story/README.md):
// every string literal in wagmi/ (comments are not literals; the story runtime and the voice build left out) that
// holds one must be a spoken line's words (the say loops give them to S.line), a copy entry at a place the extractor
// read it from (the chokepoints give it to S.t), or an id: a speaker or cast id ('Jane', 'knox'), an object's name
// ('Suit-Knox', 'wagmi-jane-room', 'jane-feed'), a module or asset path, CSS, a console message. Plus a short reviewed
// allowlist, each with its reason.
//   node --test tests/story-scrub.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CAST } from '../wagmi/story/schema.js';
import { ROOT, literals, copyOf, gameFiles } from '../tools/story/scan.mjs';
import { WORDS } from '../tools/story/extract.mjs';

const ids = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/story/ids.json'), 'utf8'));
const spoken = new Set(Object.values(ids.lines).map((l) => l.text));
const copied = new Set(Object.values(ids.copy).map((c) => c.text));

// the reviewed allowlist: [file (or *), the literal (a RegExp), why]
export const ALLOW = [
  ['wagmi/credits.js', /./, 'licence attributions (legal text): who made which asset, not story'],
  ['wagmi/radio/stations.js', /^Unfinished Business$/, "a music track's title (Mog City's own theme), in the radio's credits"],
  ['wagmi/touch.js', /^DASH( ◀| ▶)?$/, 'the boost control\'s label (DASH the move, not Dash the man)'],
  ['wagmi/mission/pause.js', /^DASH ◀ · ▶$/, 'the controls list: the same boost control'],
  ['wagmi/pursuit/thrusters.js', /^Dash$/, "the thrusters' dash (the move), a button label"],
];
const ID = new Set([...Object.keys(CAST), ...Object.values(CAST)]);
const isId = (L) => ID.has(L.text) || L.speaker
  || /^(Suit|Man)-[A-Z][a-z]+$/.test(L.text) || /^[a-z0-9]+(?:[-.][a-z0-9]+)+$/.test(L.text) || /^[a-z]+$/.test(L.text)
  || /^(\.{1,2}\/|assets\/|wagmi\/)/.test(L.text) || /^console\./.test(L.call || '') || /^\[\w+\]/.test(L.text)
  || /[{};]/.test(L.text) && /:\s*[^;]+;/.test(L.text) && /(^|\n)\s*[#.@\w-][^{]*\{/.test(L.text); // (CSS)

const WORD = new RegExp(`(?<![A-Za-z])(${[...WORDS.map(([w]) => w), 'Unfinished Business', 'UNFINISHED BUSINESS', 'MOG CITY'].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z])`);

export function leaks(root = ROOT) {
  const files = gameFiles(root);
  const placed = new Set(copyOf(files, root, { every: true }).map((c) => `${c.at}|${c.text}`));
  const out = [];
  for (const f of files) for (const L of literals(f, root)) {
    if (!WORD.test(L.text) || isId(L)) continue;
    if (spoken.has(L.text)) continue;
    if (copied.has(L.text) && placed.has(`${L.file}:${L.line}|${L.text}`)) continue;
    if (ALLOW.some(([af, re]) => (af === '*' || af === f) && re.test(L.text))) continue;
    out.push(`${L.file}:${L.line} ${JSON.stringify(L.text).slice(0, 100)}${copied.has(L.text) ? ' (a copy entry, but not read at this place: not routed through S.t here)' : ''}`);
  }
  return out;
}

test('no cast name, brand or title literal outside the story pack in wagmi/', () => {
  const found = leaks();
  assert.deepEqual(found, [], `\n${found.join('\n')}`);
});

test('the scrub sees a leak when there is one (a planted literal)', () => {
  const tmp = fs.mkdtempSync(path.join(ROOT, '.scratch', 'scrub-'));
  try {
    fs.mkdirSync(path.join(tmp, 'wagmi/mission'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'wagmi/mission/x.js'), "// Jane in a comment is fine\nexport const a = 'Call Jane at JPBank';\nexport const b = 'Suit-Knox', c = 'jane';\n");
    const got = leaks(tmp);
    assert.equal(got.length, 1, got.join('\n')); assert.match(got[0], /x\.js:2 "Call Jane at JPBank"/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
