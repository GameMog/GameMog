// Mog City: a story pack's voice build (Node, macOS). Gives every spoken line of a Story Kit world (a runner pack, as
// tools/storyrun/test-packs/sf2040.json) a synthesised voice clip and writes the pack's voice plan, so the story runner
// plays them as Mog City plays its own lines (wagmi/storyrun/cast.js registerVoices -> W.voice.clip: the subtitle
// starts the clip, the music ducks, the speaker's jaw follows its level: face.js).
//
//   node wagmi/radio/build/pack-voices.mjs tools/storyrun/test-packs/sf2040.json          new and changed lines only
//   node wagmi/radio/build/pack-voices.mjs <pack> --dry      list what it would render, keep and drop (writes nothing)
//   node wagmi/radio/build/pack-voices.mjs <pack> --all      render every line again (the cache still holds)
//   node wagmi/radio/build/pack-voices.mjs <pack> --prune    also delete the clips no line uses any more
//
// The cast: wagmi/radio/build/tts/packs/<pack id>.json { out, speakers: { <cast name>: { voice, fx? } } }, the voice a
// name in tts-voices.mjs (a Qwen design: its reference clip in wagmi/radio/build/tts/<voice>-ref.wav, else the
// auditioned one in $WAGMI_TTS/refs), fx 'radio' (dsp.mjs radioFx, baked in: SF 2040's emergency band). A speaker
// with no voice there is left unvoiced (the runner mumbles under the subtitle) and listed.
// Lines: every [who, text] / { who, text } the runner says (a shot's sub or say, a say step, barks, a boss's wake, a
// call's lines, a voicemail, a choice's reply), who a cast name (any case, as runner.js castName); not DMs or option
// labels. Words run through the runner's tokens ({name}: the hero) so they key as the runner shows them.
// A clip is named by its words and its voice: <sha1(who|words|fx) 8>-<sha1(voice, fx) 8>.m4a in <out>/. Same words and
// voice, same file: a re-run renders only lines that are new or changed (or whose voice changed), deterministically
// (Qwen seeded by the voice's seed and the line's words; renders cached in $WAGMI_TTS/render/pack/).
// Each Qwen take is checked: a take far off its voice's pitch (a clone that drifts), far too slow or too quick for its
// words (babble, hangs) is taken again from 4 more seeds, twice at most; the take nearest the voice is kept, flagged
// when none was good. Then trimmed, pauses held to 0.3 s, evened to -19 LUFS (the radio -20 after its band), AAC.
// Writes: the pack's top-level "voice" (spliced in; the rest of the file is left byte for byte), <out>/*.m4a.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readWav, writeWav, lufs, pitch } from './wav.mjs';
import { trim, squeeze, gainDb, radioFx, paFx } from './dsp.mjs';
import { VOICES, TTS_SAY } from './tts-voices.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const SR = 24000, TARGET = -19, RADIO_TARGET = -20, GAP = 0.3, RETRIES = 2;
const args = process.argv.slice(2), flag = (f) => args.includes(f);
const packArg = args.find((a) => !a.startsWith('--'));
if (!packArg) { console.error('usage: node wagmi/radio/build/pack-voices.mjs <pack.json> [--dry] [--all] [--prune]'); process.exit(2); }
const PACK = path.resolve(packArg), src = fs.readFileSync(PACK, 'utf8'), def = JSON.parse(src);
const CFG_FILE = path.join(ROOT, 'wagmi/radio/build/tts/packs', `${def.id}.json`);
if (!fs.existsSync(CFG_FILE)) { console.error(`no cast for ${def.id}: write ${path.relative(ROOT, CFG_FILE)} { out, speakers }`); process.exit(2); }
const CFG = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
const OUT = path.join(ROOT, CFG.out || `assets/voice/${def.id}`);
const LOCAL = process.env.WAGMI_TTS || path.join(ROOT, '.scratch/tts'), DL = process.env.WAGMI_TTS_MODELS || path.join(ROOT, '.scratch/downloads/voices');
const PY = path.join(LOCAL, 'venv/bin/python'), RENDER = path.join(LOCAL, 'render/pack'), TTSDIR = path.join(ROOT, 'wagmi/radio/build/tts');
const MODELS = { qwenDesign: path.join(DL, 'hf/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'), qwenBase: path.join(DL, 'hf/Qwen3-TTS-12Hz-0.6B-Base-bf16'),
  kokoroModel: path.join(DL, 'kokoro/kokoro-v1.0.onnx'), kokoroVoices: path.join(DL, 'kokoro/voices-v1.0.bin') };
const sha = (s, n = 8) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n);

// ---- the lines, as the runner says them
const castNames = Object.keys(def.cast || {}), hero = def.hero || null;
const castName = (w) => (typeof w !== 'string' ? null : castNames.includes(w) ? w : castNames.find((n) => n.toUpperCase() === w.toUpperCase()) || null);
const tokens = (s) => String(s ?? '').replace(/\{ride\.name\}|\{ride\}/g, def.car?.label || 'your car').replace(/\{name\}/g, hero || '');
const found = [];
const add = (who, text, where, phone) => {
  const w = castName(who); if (!w || typeof text !== 'string' || !text.trim()) return;
  found.push({ who: w, text: tokens(text), where, phone: !!phone && w !== hero });
};
const PHONE_STEPS = new Set(['call', 'voicemail', 'voicenote']);
function walk(o, where, ctx) {
  if (Array.isArray(o)) {
    if (o.length >= 2 && typeof o[0] === 'string' && typeof o[1] === 'string' && castName(o[0])) add(o[0], o[1], where, ctx.phone);
    o.forEach((x, i) => walk(x, `${where}.${i}`, ctx));
    return;
  }
  if (!o || typeof o !== 'object') return;
  const phone = ctx.phone || PHONE_STEPS.has(o.type);
  if (typeof o.who === 'string' && typeof o.text === 'string') add(o.who, o.text, where, phone);
  // (a voicemail: the caller's words, its `from` or the call's who)
  if (o.voicemail && typeof o.voicemail === 'object' && typeof o.voicemail.text === 'string') add(o.voicemail.from || o.who, o.voicemail.text, `${where}.voicemail`, true);
  for (const [k, v] of Object.entries(o)) {
    if (k === 'dm' || k === 'voice' || k === 'cast' || k === 'places' || k === 'voicemail') continue; // (texts, not speech; the plan itself)
    walk(v, `${where}.${k}`, { phone });
  }
}
if (def.opening) walk(def.opening, 'opening', { phone: false });
for (const m of def.missions || []) walk(m, m.id, { phone: false });
for (const [i, a] of (def.acts || []).entries()) walk(a, `act${i}`, { phone: false });
// (the rest of the world's top level: its closing coda, its idle nudge, anything later, in key order)
for (const [k, v] of Object.entries(def)) if (!['opening', 'missions', 'acts', 'cast', 'places', 'voice', 'hero', 'car'].includes(k)) walk(v, k, { phone: false });
// (the same words from the same speaker are one line: the first place found)
const lines = [], seen = new Map();
for (const L of found) { const k = `${L.who.toLowerCase()}|${L.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`; if (seen.has(k)) { seen.get(k).phone ||= L.phone; continue; } seen.set(k, L); lines.push(L); }

// ---- each line's voice and clip name
const unvoiced = new Set();
const vkey = (name, fx) => sha(JSON.stringify(VOICES[name]) + '|' + (fx || ''));
const SAY_TTS = [...TTS_SAY, [/\b([A-Z][a-z]+) St\b\.?/g, '$1 Street'], [/\b([A-Z][a-z]+) Ave\b\.?/g, '$1 Avenue'], [/\.\.\.\s*/g, '... '], [/\b([A-Z])([A-Z]{2,})\b/g, (m, a, b) => (/^(ER|OK|ICU|EMS)$/.test(m) ? m : a + b.toLowerCase())]];
const spoken = (t) => { for (const [re, s] of SAY_TTS) t = t.replace(re, s); return t.trim(); };
for (const L of lines) {
  const sp = CFG.speakers?.[L.who];
  if (!sp || !VOICES[sp.voice]) { unvoiced.add(L.who); continue; }
  // (fx only where its place matches fxWhere, if given, and never where it matches fxNot: Pike on the radio, but not in
  // person in Mission 1)
  const re = (l) => (l || []).some((x) => new RegExp(x).test(L.where));
  const fxHere = sp.fx && (!sp.fxWhere || re(sp.fxWhere)) && !re(sp.fxNot);
  L.voice = sp.voice; L.fx = fxHere ? sp.fx : null; L.say = spoken(L.text);
  L.hash = sha(`${L.who}|${L.text}|${L.fx || ''}`); L.key = vkey(L.voice, L.fx); L.clip = `${L.hash}-${L.key}`;
  L.file = path.join(OUT, `${L.clip}.m4a`);
  L.id = L.where.replace(/\.(steps|shots)\./g, '.').replace(/\.(sub|say|wake)$/, '').replace(/\.barks\./, '.bark');
}
const voiced = lines.filter((L) => L.voice);
const todo = voiced.filter((L) => flag('--all') || !fs.existsSync(L.file));
const used = new Set(voiced.map((L) => `${L.clip}.m4a`));
const orphans = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith('.m4a') && !used.has(f)) : [];
console.log(`${def.id}: ${lines.length} spoken lines, ${voiced.length} voiced (${voiced.length - todo.length} kept, ${todo.length} to make)${unvoiced.size ? `; no voice for ${[...unvoiced].join(', ')} (tts/packs/${def.id}.json)` : ''}; ${orphans.length} clips unused`);
if (flag('--dry')) { for (const L of todo) console.log('make ', L.clip, L.who.padEnd(8), L.voice.padEnd(9), L.fx || '', JSON.stringify(L.text)); for (const f of orphans) console.log('unused', f); process.exit(0); }

// ---- render (tts.py: the models load once a run), then check every qwen take; retake the bad ones
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-voice-'));
const SAY_REF = new Map();
const refOf = (name) => { for (const d of [TTSDIR, path.join(LOCAL, 'refs'), path.join(ROOT, '.scratch/voices/refs')]) if (fs.existsSync(path.join(d, `${name}-ref.wav`))) return d; return null; };
const wavOf = (f) => { const w = path.join(tmp, 'r.wav'); execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${SR}`, '-c', '1', f, w]); return trim(readWav(w).ch[0], SR); };
function refF0(name) {
  if (!SAY_REF.has(name)) { const d = refOf(name); SAY_REF.set(name, d ? pitch(SR, wavOf(path.join(d, `${name}-ref.wav`))).f0 : 0); }
  return SAY_REF.get(name);
}
// a take's faults: its pitch against its voice's (a shout or a question rises: more room up), its pace for its words
function faults(L, x) {
  const out = [], words = L.say.split(/\s+/).filter(Boolean).length, secs = x.length / SR, p = pitch(SR, x), r0 = refF0(L.voice);
  const loud = /!|\?/.test(L.text) || /\b[A-Z]{3,}\b/.test(L.text);
  if (r0 && p.voiced > 0.4 && p.f0) { const k = p.f0 / r0; if (k < 0.78 || k > (loud ? 1.75 : 1.4)) out.push(`pitch ${Math.round(p.f0)}/${Math.round(r0)} Hz`); }
  if (words >= 4 && words / secs < 1.25) out.push(`slow ${(words / secs).toFixed(2)} w/s`);
  if (words / secs > 5.2) out.push(`fast ${(words / secs).toFixed(2)} w/s`);
  return { out, dev: r0 && p.f0 ? Math.abs(Math.log(p.f0 / r0)) : 0, f0: Math.round(p.f0 || 0) };
}
const rendered = new Map(); // clip -> { x (raw, trimmed), take0, faults }
function renderAll(list, take0) {
  const job = { models: MODELS, refDir: path.join(tmp, 'refs'), voices: {}, lines: [] };
  fs.mkdirSync(job.refDir, { recursive: true });
  for (const L of list) {
    job.voices[L.voice] = VOICES[L.voice];
    const out = path.join(RENDER, L.voice, `${L.hash}${take0 ? `.t${take0}` : ''}.wav`), meta = out.replace(/\.wav$/, '.json');
    const m = fs.existsSync(meta) && fs.existsSync(out) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : null;
    L.out = out;
    if (!m || m.text !== L.say || m.vkey !== L.key || flag('--again')) job.lines.push({ id: L.hash, voice: L.voice, text: L.say, out, fit: null, vkey: L.key, take0 });
  }
  for (const name of Object.keys(job.voices)) { const d = refOf(name); if (d) for (const e of ['.wav', '.json']) { const f = path.join(d, `${name}-ref${e}`); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(job.refDir, `${name}-ref${e}`)); } else if (VOICES[name].engine === 'qwen') console.warn(`!! ${name} has no reference clip: tts.py designs it again (listen before shipping)`); }
  if (!job.lines.length) return;
  if (!fs.existsSync(PY)) throw new Error(`${PY} missing: set WAGMI_TTS (the venv's parent) and WAGMI_TTS_MODELS (hf/, kokoro/)`);
  const jf = path.join(tmp, `job-${take0}.json`); fs.writeFileSync(jf, JSON.stringify(job));
  console.log(`rendering ${job.lines.length} lines${take0 ? ` (takes ${take0}-${take0 + 3})` : ''} ...`);
  const res = execFileSync(PY, ['-I', path.join(ROOT, 'wagmi/radio/build/tts.py'), jf], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }).toString();
  for (const r of res.split('\n').filter((s) => s.startsWith('{')).map((s) => JSON.parse(s))) if (r.designed) { console.warn(`!! ${r.designed} was designed again: kept in wagmi/radio/build/tts/`); for (const e of ['.wav', '.json']) fs.copyFileSync(r.ref.replace(/\.wav$/, e), path.join(TTSDIR, `${r.designed}-ref${e}`)); }
}
if (todo.length) {
  let pending = todo;
  for (let round = 0; round <= RETRIES && pending.length; round++) {
    const take0 = round * 4; renderAll(pending, take0);
    const again = [];
    for (const L of pending) {
      const x = wavOf(L.out), f = VOICES[L.voice].engine === 'qwen' ? faults(L, x) : { out: [], dev: 0 }, prev = rendered.get(L.clip);
      if (!prev || (f.out.length < prev.faults.length) || (f.out.length === prev.faults.length && f.dev < prev.dev)) rendered.set(L.clip, { x, take0, faults: f.out, dev: f.dev, f0: f.f0 });
      if (f.out.length && round < RETRIES) again.push(L);
    }
    pending = again;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const L of todo) {
    const r = rendered.get(L.clip); let x = squeeze(r.x, SR, GAP);
    if (L.fx === 'radio') x = radioFx(x, SR, { seed: parseInt(L.hash, 16) });
    else if (L.fx === 'pa') x = paFx(x, SR);
    gainDb(x, (L.fx ? RADIO_TARGET : TARGET) - lufs(SR, [x]).lufs);
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); if (pk > 0.89) gainDb(x, 20 * Math.log10(0.89 / pk));
    const w = path.join(tmp, 'o.wav'); writeWav(w, SR, [x]);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', w, L.file]);
    L.made = { secs: +(x.length / SR).toFixed(3), take0: r.take0, faults: r.faults, f0: r.f0 };
  }
}
// ---- the plan, spliced into the pack
const secsOf = (L) => L.made?.secs ?? def.voice?.clips?.[L.clip]?.secs ?? +(wavOfM4a(L.file).length / SR).toFixed(3);
function wavOfM4a(f) { return wavOf(f); }
const rel = path.relative(ROOT, OUT).split(path.sep).join('/');
const plan = {
  model: 'qwen3-tts-12hz (wagmi/radio/build/pack-voices.mjs)', dir: '',
  cast: Object.fromEntries(Object.entries(CFG.speakers || {}).filter(([w, s]) => castNames.includes(w) && VOICES[s.voice]).map(([w, s]) => [w, { id: w.toLowerCase().replace(/[^a-z0-9-]/g, ''), voice: s.voice, key: vkey(s.voice, s.fx), ...(s.fx ? { fx: s.fx } : {}) }])),
  lines: voiced.map((L) => ({ id: L.id, who: L.who, voice: L.voice, text: L.text, hash: L.hash, clip: L.clip, ...(L.phone ? { fx: 'phone' } : {}) })),
  clips: Object.fromEntries(voiced.map((L) => [L.clip, { url: `${rel}/${L.clip}.m4a`, secs: secsOf(L) }])),
};
fs.writeFileSync(PACK, splice(src, 'voice', JSON.stringify(plan, null, 1)));
for (const L of todo) console.log('made ', L.clip, L.who.padEnd(7), `${L.made.secs.toFixed(2)} s`.padStart(7), `${L.made.f0} Hz`.padStart(7), L.made.take0 ? `take ${L.made.take0}` : '      ', L.made.faults.length ? `!! ${L.made.faults.join(', ')} (best of ${RETRIES + 1} rounds: listen)` : '', JSON.stringify(L.text));
if (orphans.length && flag('--prune')) { for (const f of orphans) fs.rmSync(path.join(OUT, f)); console.log('removed', orphans.length, 'unused clips'); }
else if (orphans.length) console.log(`${orphans.length} clips no line uses (--prune removes them)`);
console.log(`wrote ${path.relative(ROOT, PACK)} voice: ${plan.lines.length} lines, ${Object.keys(plan.clips).length} clips in ${rel}/`);
fs.rmSync(tmp, { recursive: true, force: true });

// a top-level key of a JSON text replaced (or added last), the rest of the text kept as it is
function splice(text, key, value) {
  let depth = 0, i = 0, keyAt = -1, valEnd = -1, lastClose = -1, inStr = false;
  const ind = (/\n( +)"/.exec(text) || [, ' '])[1];
  const body = value.split('\n').join('\n' + ind);
  for (; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') {
      if (depth === 1 && keyAt < 0) { const m = /^"((?:[^"\\]|\\.)*)"\s*:/.exec(text.slice(i)); if (m && JSON.parse(`"${m[1]}"`) === key) { keyAt = i; i += m[0].length - 1; continue; } }
      inStr = true; continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) lastClose = i; if (keyAt >= 0 && valEnd < 0 && depth === 1) valEnd = i + 1; }
    else if (c === ',' && depth === 1 && keyAt >= 0 && valEnd < 0) valEnd = i;
  }
  if (keyAt >= 0) { if (valEnd < 0) valEnd = lastClose; return text.slice(0, keyAt) + `"${key}": ${body}` + text.slice(valEnd); }
  const head = text.slice(0, lastClose).replace(/\s*$/, '');
  return `${head},\n${ind}"${key}": ${body}\n${text.slice(lastClose)}`;
}
