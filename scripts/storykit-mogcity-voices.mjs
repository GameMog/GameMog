// Story Kit: bring Mog City's recorded lines into the platform's copy, public/storykit/cast/mogcity/voice/manifest.json
// (storykit/pack/registry.ts reads it: a Story Kit line said by a registry voice in the words of one of these lines is
// played from Mog City's own recording, recordedClip). The copy is Mog City's voice manifest (its
// wagmi/radio/build/voices.mjs writes assets/voice/manifest.json) for the scenes the platform's Mog City story plays,
// each line as { id, who, text, file, dur, fx, model }: who is the registry's `recorded` speaker (Dan -> dan, Knox ->
// suit-knox), file the recording's name, model the TTS model the line was made with.
//
//   node scripts/storykit-mogcity-voices.mjs <Mog City checkout>/assets/voice/manifest.json [--scenes intro,calls,m1,m2,m3] [--check]
//
// The listed scenes' lines become Mog City's, in its order (a line Mog City rewrote is replaced, one it cut is gone, one
// it re-voiced gets its new length); every other scene's lines in the copy stay exactly as they are. The default scenes
// are the ones storykit/packs/mog-city.json plays (MC-1 to MC-3, its calls and the opening). --check writes nothing and
// exits 1 when the copy differs. No audio is made or copied here: the recordings are Mog City's and play from its engine.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPY = path.join(ROOT, 'public/storykit/cast/mogcity/voice/manifest.json');
const REGISTRY = path.join(ROOT, 'public/storykit/cast/registry.json');

/** Mog City's speaker -> the registry's recorded speaker id (its models' voice.recorded: Mr. Big -> mrbig, Knox -> suit-knox). */
export function speakerIds(registry) {
  const ids = new Set(Object.values(registry.models).map((m) => m.voice?.recorded).filter(Boolean));
  return new Proxy({}, { get: (_, sp) => { const k = String(sp).toLowerCase().replace(/[^a-z]/g, ''); return ids.has(k) ? k : ids.has(`suit-${k}`) ? `suit-${k}` : undefined; } });
}
/** The TTS model a Mog City line was made with, from its source ('tts:<model>:<voice>(...)'). */
export const modelOf = (source) => {
  const m = /^tts:([^:]+):/.exec(String(source || ''));
  if (!m) return null;
  return m[1].replace(/^qwen3-tts-12hz-0\.6b-base$/, 'qwen3-tts-0.6b');
};
/** The copy's lines with the listed scenes' lines replaced by Mog City's. */
export function syncLines(copyLines, mcLines, scenes, who) {
  const want = new Set(scenes), sceneOf = (id) => String(id).split('-')[0];
  const fresh = [];
  for (const l of mcLines) {
    if (!want.has(l.scene)) continue;
    const w = who[l.speaker];
    if (!w) throw new Error(`${l.id}: Mog City's speaker "${l.speaker}" has no recorded voice in the registry`);
    const model = modelOf(l.source);
    if (!model) throw new Error(`${l.id}: no TTS model in its source (${l.source}); a placeholder line is not copied`);
    fresh.push({ id: l.id, who: w, text: l.text, file: path.basename(l.file), dur: l.dur, fx: l.fx ?? null, model });
  }
  // (each scene's lines in place: the first listed scene where the copy had it, the others after it)
  const out = [];
  let put = false;
  for (const l of copyLines) {
    if (!want.has(sceneOf(l.id))) { out.push(l); continue; }
    if (!put) { out.push(...fresh); put = true; }
  }
  if (!put) out.push(...fresh);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--scenes');
  if (!src) { console.error('usage: node scripts/storykit-mogcity-voices.mjs <Mog City>/assets/voice/manifest.json [--scenes a,b] [--check]'); process.exit(2); }
  const si = args.indexOf('--scenes'), scenes = si >= 0 ? args[si + 1].split(',') : ['intro', 'calls', 'm1', 'm2', 'm3'];
  const copy = JSON.parse(readFileSync(COPY, 'utf8')), mc = JSON.parse(readFileSync(src, 'utf8'));
  const lines = syncLines(copy.lines, mc.lines, scenes, speakerIds(JSON.parse(readFileSync(REGISTRY, 'utf8'))));
  const before = new Map(copy.lines.map((l) => [l.id, JSON.stringify(l)])), after = new Map(lines.map((l) => [l.id, JSON.stringify(l)]));
  const gone = [...before.keys()].filter((k) => !after.has(k)), added = [...after.keys()].filter((k) => !before.has(k));
  const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
  console.log(`scenes ${scenes.join(', ')}: ${lines.length} lines (was ${copy.lines.length}); ${added.length} new, ${gone.length} gone, ${changed.length} changed`);
  for (const k of added) console.log(`  + ${k}`);
  for (const k of gone) console.log(`  - ${k}`);
  const text = `{${['v', 'set', 'note'].map((k) => `${JSON.stringify(k)}:${JSON.stringify(copy[k])}`).join(',')},"lines":[${lines.map((l) => JSON.stringify(l)).join(',\n')}]}\n`;
  if (args.includes('--check')) process.exit(text === readFileSync(COPY, 'utf8') ? 0 : 1);
  writeFileSync(COPY, text);
}
