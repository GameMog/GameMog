// Mog City: the voice build (Node, macOS). Reads every spoken line out of the game (lines.mjs), gives each a voice
// file and writes the manifest the game plays them from, and the line sheet for whoever records them for real.
//
//   node wagmi/radio/build/voices.mjs            build every line that has no file yet (or whose words changed)
//   node wagmi/radio/build/voices.mjs --all      rebuild every line
//   node wagmi/radio/build/voices.mjs --only intro-mrbig-dan-big-fan-great,m1-jane-going-there-alone
//   node wagmi/radio/build/voices.mjs --prune    (also removes the files of lines the game no longer has)
//   node wagmi/radio/build/voices.mjs --tts dan-B,jane-C     give Dan and Jane those synthesised voices (tts-voices.mjs)
//                                                for good (tts/picks.json) and rebuild every line of theirs with them
//   node wagmi/radio/build/voices.mjs --tts Jane=say         back to the macOS placeholder for a speaker
//   node wagmi/radio/build/voices.mjs --sheet    only rewrite docs/VOICE-LINES.md from the manifest (builds nothing)
//   node wagmi/radio/build/voices.mjs --dry      only list what a build would make, keep and render (writes nothing)
//
// Where each line's sound comes from, first found wins:
//   1. assets/voice/src/<id>.(wav|aif|aiff|m4a|mp3|caf)   a real recording (an actor, a voice service): dry, any rate
//   2. the speaker's synthesised voice (tts/picks.json)    rendered by tts.py (Qwen3-TTS or Kokoro, Apache-2.0 models)
//                                                          in the local venv .scratch/tts/venv (or $WAGMI_TTS/venv,
//                                                          the models in $WAGMI_TTS_MODELS); shippable
//   3. macOS `say` with the speaker's CAST voice           a PLACEHOLDER: Apple's licence allows these for personal,
//                                                          non-commercial use only. Replace them before going public.
// Then the same treatment for all: silence trimmed, a voice changer where the cast asks for one (CAST.fx), loudness evened (-19 LUFS), AAC
// to assets/voice/<id>.m4a. A cutscene line (it has a window) has until the next line starts: one longer than that is
// said with its pauses tightened, then a little quicker, but never more than MAXK over the speaker's own pace (past
// that a placeholder sounds sped up, a chipmunk); one still too long runs on and the next line waits for it in the game
// (voices.js), so the build counts that wait in the next line's room. A synthesised line is re-taken (qwen) or said a
// little quicker (kokoro) by tts.py, then has its pauses tightened and its tempo stretched (same pitch) by at most
// MAXK_TTS. A recording is never sped up (it is flagged).
// A car call's line has its call's register (lines.mjs): 'fast' (a chase) is said with its pauses tightened and its
// tempo up FAST (the pitch kept); 'whisper' (a tail) is whispered by the speaker on the phone (Jane: whisper() in
// dsp.mjs, her own words and mouth made breath, WHISPER_DB under the others; Dan answers in his own voice). The source
// says ' +fast' / ' +whisper'. A recording is taken as it is, and so is a line already made when only its call's
// register changed (it moved into a call): TWEAK { redo: true } makes it again in the register.
// A line that moved (its id changed, its speaker and words did not: a call took it over from a mission) keeps its file.
// The game adds the call's sound (phone / video band) live.
// Writes: assets/voice/<id>.m4a, assets/voice/manifest.json, docs/VOICE-LINES.md (and with --tts, tts/picks.json and a
// picked qwen voice's reference clip in tts/). Renders are cached in .scratch/tts/render/ (or $WAGMI_TTS/render; local).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readWav, writeWav, lufs, speechSpan } from './wav.mjs';
import { trim, voiceChanger, gainDb, squeeze, stretch, whisper } from './dsp.mjs';
import { readLines, key } from './lines.mjs';
import { CAST, SAY, DIRECTION, TWEAK } from './cast.mjs';
import { VOICES, TTS_SAY, ttsSource } from './tts-voices.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const OUT = path.join(ROOT, 'assets/voice'), SRC = path.join(OUT, 'src');
const SR = 24000, TARGET = -19, MAXK = 1.1, MAXK_TTS = 1.15, FAST = 1.1, WHISPER_DB = -3;
const args = process.argv.slice(2), ALL = args.includes('--all'), ONLY = (args[args.indexOf('--only') + 1] || '').split(',').filter((s) => args.includes('--only') && s);

// the synthesised voices: who has one (tts/picks.json), and where the local renderer lives (not in the repo)
const TTSDIR = path.join(ROOT, 'wagmi/radio/build/tts'), PICKS = path.join(TTSDIR, 'picks.json');
const LOCAL = process.env.WAGMI_TTS || path.join(ROOT, '.scratch/tts'), DL = process.env.WAGMI_TTS_MODELS || path.join(ROOT, '.scratch/downloads/voices');
const TTS_LOCAL = {
  python: path.join(LOCAL, 'venv/bin/python'), render: path.join(LOCAL, 'render'), refs: path.join(LOCAL, 'refs'),
  // (the auditioned voices' reference clips: the renderer's own, and the ones the auditions keep in the repo's scratch)
  auditioned: [path.join(LOCAL, 'refs'), path.join(ROOT, '.scratch/voices/refs')],
  models: { qwenDesign: path.join(DL, 'hf/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'), qwenBase: path.join(DL, 'hf/Qwen3-TTS-12Hz-0.6B-Base-bf16'),
    kokoroModel: path.join(DL, 'kokoro/kokoro-v1.0.onnx'), kokoroVoices: path.join(DL, 'kokoro/voices-v1.0.bin') },
};
const picks = fs.existsSync(PICKS) ? JSON.parse(fs.readFileSync(PICKS, 'utf8')) : {};
const pickArg = args.includes('--tts') ? (args[args.indexOf('--tts') + 1] || '').split(',').filter(Boolean) : [];
for (const p of pickArg) {
  const [a, b] = p.split('=');
  if (b === 'say') { delete picks[a]; continue; }
  const v = VOICES[a]; if (!v) throw new Error(`--tts: no voice ${a} in tts-voices.mjs (${Object.keys(VOICES).join(', ')}), or Speaker=say`);
  picks[v.speaker] = a;
  // a qwen voice IS its reference clip: keep the auditioned one (.scratch/tts/refs, .scratch/voices/refs) with the build
  const ref = TTS_LOCAL.auditioned.map((d) => path.join(d, `${a}-ref.wav`)).find((f) => fs.existsSync(f)) || '';
  if (v.engine === 'qwen' && fs.existsSync(ref)) for (const e of ['.wav', '.json']) if (fs.existsSync(ref.replace(/\.wav$/, e))) { fs.mkdirSync(TTSDIR, { recursive: true }); fs.copyFileSync(ref.replace(/\.wav$/, e), path.join(TTSDIR, `${a}-ref${e}`)); }
}
if (pickArg.length) { fs.mkdirSync(TTSDIR, { recursive: true }); fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1) + '\n'); }
const pickOf = (who) => (picks[who] && VOICES[picks[who]] ? picks[who] : null);
fs.mkdirSync(OUT, { recursive: true });

const lines = readLines(ROOT);
const old = fs.existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : { lines: [] };
const oldById = new Map(old.lines.map((l) => [l.id, l]));
// (a line whose id changed but not its speaker and words: its old entry, if no line of the game has that id now)
const oldByKey = new Map(old.lines.map((l) => [key(l.speaker, l.text), l])), liveIds = new Set(lines.map((L) => L.id));
const prevOf = (L) => { if (oldById.has(L.id)) return oldById.get(L.id); const o = oldByKey.get(key(L.speaker, L.text)); return o && !liveIds.has(o.id) && fs.existsSync(path.join(ROOT, o.file)) ? o : null; };
// a line's register: 'whisper' only for the speaker on the phone (CAST call 'phone'), 'fast' for anyone
const regOf = (L) => (L.register === 'fast' ? 'fast' : L.register === 'whisper' && (CAST[L.speaker] || {}).call === 'phone' ? 'whisper' : 'normal');
const regTag = (r) => (r === 'normal' ? '' : ` +${r}`), regIn = (source) => / \+(whisper|fast)\b/.exec(source)?.[1] || 'normal';
const seedOf = (id) => parseInt(crypto.createHash('sha1').update(id).digest('hex').slice(0, 8), 16);
if (args.includes('--sheet')) { fs.writeFileSync(path.join(ROOT, 'docs/VOICE-LINES.md'), sheet(old.lines)); console.log('wrote docs/VOICE-LINES.md'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wagmi-voice-'));

function speak(text, who, rate, gap = 0.22, tw = {}) {
  const c = { ...(CAST[who] || CAST.default), ...tw }, f = path.join(tmp, 'say.wav');
  let t = text; for (const [re, s] of SAY) t = t.replace(re, s);
  execFileSync('say', ['-v', c.voice, '-r', String(Math.round(rate)), '-o', f, `--data-format=LEI16@${SR}`, (c.pbas ? `[[pbas ${c.pbas}]] ` : '') + t]);
  return squeeze(trim(readWav(f).ch[0], SR), SR, gap);
}
function recording(id) {
  for (const ext of ['wav', 'aif', 'aiff', 'm4a', 'mp3', 'caf']) {
    const f = path.join(SRC, `${id}.${ext}`); if (!fs.existsSync(f)) continue;
    const w = path.join(tmp, 'rec.wav');
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${SR}`, '-c', '1', f, w]);
    return { x: trim(readWav(w).ch[0], SR), file: path.relative(ROOT, f) };
  }
  return null;
}

const manifest = { note: 'Generated by wagmi/radio/build/voices.mjs from the game\'s lines. Placeholder lines (source say:...) must be replaced before release; synthesised lines (source tts:...) are made with Apache-2.0 models (see NOTICE).', generated: new Date().toISOString(), lines: [] };
const report = [];
// a cutscene's lines as the game will play them: each starts at its window, or when the one before it is done if that
// runs on (voices.js holds it), and has until the next one's window opens
let ends = 0;
const timed = (L) => L.window && lines.some((o) => o !== L && o.scene === L.scene && o.window);
const nextOf = (L) => lines.slice(lines.indexOf(L) + 1).find((o) => o.scene === L.scene && o.window);
const spoken = (text, extra = []) => { let t = text; for (const [re, s] of [...SAY, ...extra]) t = t.replace(re, s); return t; };
// a line is kept when its words and its kind of source are what the build would make now
function isFresh(L) {
  const prev = prevOf(L), c = CAST[L.speaker] || CAST.default;
  const pace = (TWEAK[L.id] || {}).rate || c.rate, pick = pickOf(L.speaker);
  if (ALL || (ONLY.length && ONLY.includes(L.id)) || !prev || prev.text !== L.text || !fs.existsSync(path.join(ROOT, prev.file))) return false;
  // (a placeholder said faster than a speaker can, by an older build, is made again)
  if (prev.source.startsWith('say:') && +(prev.source.match(/@(\d+)/)?.[1] || 0) > Math.round(pace * MAXK) + 1) return false;
  if (prev.source.startsWith('recording:')) return true;
  if (recording(L.id)) return false;
  // (a recorded line whose call's register changed keeps its file, as recorded: re-made in it only when TWEAK says redo)
  if (regIn(prev.source) !== regOf(L) && (TWEAK[L.id] || {}).redo) return false;
  // (a speaker given a synthesised voice, a different one, or none again: every line of theirs is made again)
  // (and one whose take (TWEAK take) is not the one it was made with)
  return pick ? prev.source.startsWith(ttsSource(pick)) && takeOf(prev.source) === (VOICES[pick].engine === 'qwen' ? (TWEAK[L.id] || {}).take || 0 : 0) : !prev.source.startsWith('tts:');
}
const takeOf = (source) => +(/ take (\d+)/.exec(source)?.[1] || 0);
const fresh = new Map(lines.map((L) => [L.id, isFresh(L)]));

// the synthesised lines to make: rendered by tts.py in one go (the models load once), cached by voice and words
const tts = new Map(), ttsJob = [];
const vkey = (name) => crypto.createHash('sha1').update(JSON.stringify(VOICES[name])).digest('hex').slice(0, 10);
for (const L of lines) {
  const pick = pickOf(L.speaker);
  if (fresh.get(L.id) || !pick || recording(L.id)) continue;
  const text = spoken(L.text, TTS_SAY), out = path.join(TTS_LOCAL.render, pick, `${L.id}.wav`), meta = out.replace(/\.wav$/, '.json'), take0 = (TWEAK[L.id] || {}).take || 0;
  const nx = timed(L) ? nextOf(L) : null, fit = L.window ? +((nx ? nx.window[0] - 0.06 : L.window[1] + 0.4) - L.window[0]).toFixed(3) : null;
  tts.set(L.id, { pick, out });
  const m = fs.existsSync(meta) && fs.existsSync(out) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : null;
  if (!m || m.text !== text || m.vkey !== vkey(pick) || m.fit !== fit || (m.take0 || 0) !== take0) ttsJob.push({ id: L.id, voice: pick, text, out, fit, vkey: vkey(pick), take0 });
}
if (args.includes('--dry')) {
  const made = lines.filter((L) => !fresh.get(L.id)), moved = lines.filter((L) => fresh.get(L.id) && prevOf(L).id !== L.id);
  for (const L of made) console.log('make  ', L.id.padEnd(46), L.speaker.padEnd(8), regOf(L).padEnd(8), ttsJob.some((j) => j.id === L.id) ? 'render' : tts.has(L.id) ? 'cached' : 'say', oldById.has(L.id) ? '(was made)' : '');
  for (const L of moved) console.log('moved ', L.id.padEnd(46), 'kept from', prevOf(L).id);
  const live = new Set(lines.map((L) => `${L.id}.m4a`)), orphans = fs.readdirSync(OUT).filter((f) => f.endsWith('.m4a') && !live.has(f));
  console.log(`${lines.length} lines: ${lines.length - made.length} kept (${moved.length} moved), ${made.length} to make, ${ttsJob.length} to render; ${orphans.length} files no line uses: ${orphans.join(', ')}`);
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
}
if (ttsJob.length) {
  if (!fs.existsSync(TTS_LOCAL.python)) {
    console.warn(`!! ${ttsJob.length} lines need a synthesised voice but ${TTS_LOCAL.python} is missing (see docs/VOICE-LINES.md): they get macOS placeholders this time`);
    for (const j of ttsJob) tts.delete(j.id);
  } else {
    // a picked qwen voice's reference clip: the one kept with the build, else the auditioned one, else designed again
    const refDir = path.join(tmp, 'refs'); fs.mkdirSync(refDir, { recursive: true });
    for (const name of new Set(ttsJob.map((j) => j.voice))) for (const d of [TTSDIR, ...TTS_LOCAL.auditioned]) for (const e of ['.wav', '.json']) {
      const f = path.join(d, `${name}-ref${e}`), to = path.join(refDir, `${name}-ref${e}`);
      if (fs.existsSync(f) && !fs.existsSync(to)) fs.copyFileSync(f, to);
    }
    const job = path.join(tmp, 'tts-job.json'), used = [...new Set(ttsJob.map((j) => j.voice))];
    fs.writeFileSync(job, JSON.stringify({ models: TTS_LOCAL.models, refDir, voices: Object.fromEntries(used.map((n) => [n, VOICES[n]])), lines: ttsJob }));
    console.log(`rendering ${ttsJob.length} synthesised lines (${used.join(', ')}) ...`);
    const res = execFileSync(TTS_LOCAL.python, ['-I', path.join(ROOT, 'wagmi/radio/build/tts.py'), job], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }).toString();
    // (tts.py leaves <id>.json beside each render: the cache key above)
    for (const r of res.split('\n').filter((s) => s.startsWith('{')).map((s) => JSON.parse(s))) if (r.bad) console.warn(`!! ${r.id} (${r.voice}): every take came out bad (${r.takes.join(', ')} s), the best kept: listen to it`); else if (r.designed) {
      console.warn(`!! ${r.designed} had no reference clip, so its voice was designed again (kept in wagmi/radio/build/tts/): listen before shipping`);
      fs.mkdirSync(TTSDIR, { recursive: true }); for (const e of ['.wav', '.json']) fs.copyFileSync(r.ref.replace(/\.wav$/, e), path.join(TTSDIR, `${r.designed}-ref${e}`));
    }
  }
}
// a synthesised line, fitted to its room: first the pauses tightened, then the tempo (the pitch kept), as far as MAXK_TTS
function synthesised(L, room) {
  const t = tts.get(L.id), w = path.join(tmp, 'tts.wav'), reg = regOf(L);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${SR}`, '-c', '1', t.out, w]);
  const raw = trim(readWav(w).ch[0], SR);
  let x = squeeze(raw, SR, reg === 'fast' ? 0.12 : 0.3), k = reg === 'fast' ? FAST : 1;
  for (const g of [0.12, 0.06]) if (x.length / SR / k > room) x = squeeze(raw, SR, g);
  if (x.length / SR / k > room) k = Math.max(k, Math.min(MAXK_TTS, x.length / SR / room));
  if (k > 1.005) x = stretch(x, 1 / k, SR);
  if (reg === 'whisper') x = whisper(x, SR, { seed: seedOf(L.id) });
  const take0 = VOICES[t.pick].engine === 'qwen' ? (TWEAK[L.id] || {}).take || 0 : 0;
  return { x, source: ttsSource(t.pick) + (take0 ? ` take ${take0}` : '') + regTag(reg) + (k > 1.005 ? ` x${k.toFixed(2)}` : '') };
}

const callOf = (L) => ({ ...(L.call ? { call: L.call } : {}), ...(regOf(L) !== 'normal' ? { register: regOf(L) } : {}) });
for (const L of lines) {
  const file = `assets/voice/${L.id}.m4a`, prev = prevOf(L), c = CAST[L.speaker] || CAST.default;
  const tw = TWEAK[L.id] || {}, pace = (tw.rate || c.rate) * (regOf(L) === 'fast' ? FAST : 1);
  const start = timed(L) ? Math.max(L.window[0], ends + 0.04) : 0, nx = timed(L) ? nextOf(L) : null;
  if (fresh.get(L.id)) {
    // (a moved line: its file under its new id)
    if (prev.file !== file) fs.copyFileSync(path.join(ROOT, prev.file), path.join(ROOT, file));
    const { call, register, ...was } = prev, reg = regIn(prev.source);
    manifest.lines.push({ ...was, id: L.id, file, scene: L.scene, also: L.also, window: L.window, ...(L.call ? { call: L.call } : {}), ...(reg !== 'normal' ? { register: reg } : {}) }); report.push([L.id, prev.id === L.id ? 'kept' : `kept (was ${prev.id})`, prev.dur]); if (timed(L)) ends = start + prev.dur; continue;
  }
  const rec = recording(L.id);
  let x, source, rate = pace;
  if (rec) { x = rec.x; source = 'recording:' + rec.file; }
  else if (tts.has(L.id)) ({ x, source } = synthesised(L, !L.window ? Infinity : (nx ? nx.window[0] - 0.06 : L.window[1] + 0.4) - start));
  else {
    x = speak(L.text, L.speaker, rate, 0.22, tw);
    // a cutscene line's room: from when it starts until the next line's window opens (a breath short of it)
    const room = !L.window ? Infinity : (nx ? nx.window[0] - 0.06 : L.window[1] + 0.4) - start;
    // (first the pauses tightened, then the words a little quicker, as far as MAXK)
    for (const gap of [0.1, 0.05]) if (x.length / SR > room) x = speak(L.text, L.speaker, rate, gap, tw);
    for (let i = 0; i < 4 && x.length / SR > room && rate < pace * MAXK; i++) { rate = Math.min(pace * MAXK, rate * (x.length / SR / room) * 1.03); x = speak(L.text, L.speaker, rate, 0.05, tw); }
    if (regOf(L) === 'whisper') x = whisper(x, SR, { seed: seedOf(L.id) });
    source = `say:${c.voice}@${Math.round(rate)}${tw.pbas || c.pbas ? `/pbas${tw.pbas || c.pbas}` : ''}${regTag(regOf(L))}`;
  }
  if (c.fx === 'changer') x = voiceChanger(x, SR, c.changer);
  // loudness evened, the peak kept under -1 dBFS (a whisper WHISPER_DB under)
  const m = lufs(SR, [x]); gainDb(x, TARGET - m.lufs + (rec ? 0 : (tw.gain || 0) + (regOf(L) === 'whisper' ? WHISPER_DB : 0)));
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); if (pk > 0.89) gainDb(x, 20 * Math.log10(0.89 / pk));
  const wav = path.join(tmp, `${L.id}.wav`); writeWav(wav, SR, [x]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', wav, path.join(ROOT, file)]);
  const dur = +(x.length / SR).toFixed(3);
  manifest.lines.push({ id: L.id, scene: L.scene, speaker: L.speaker, text: L.text, file, dur, fx: c.call || null, ...(L.window ? { window: L.window } : {}), also: L.also, ...callOf(L), source });
  const over = nx ? start + dur + 0.04 - nx.window[0] : 0;
  report.push([L.id, source, dur, over > 0 ? `RUNS ${over.toFixed(2)} s INTO THE NEXT LINE (it waits)` : L.window && dur > L.window[1] - L.window[0] ? 'past its subtitle' : '']);
  if (timed(L)) ends = start + dur;
}
// files of lines the game no longer has: left in place, listed
const live = new Set(manifest.lines.map((l) => `${l.id}.m4a`));
const orphans = fs.readdirSync(OUT).filter((f) => f.endsWith('.m4a') && !live.has(f));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'docs/VOICE-LINES.md'), sheet(manifest.lines));
for (const r of report) console.log(r.map(String).join('  '));
if (orphans.length && args.includes('--prune')) { for (const f of orphans) fs.rmSync(path.join(OUT, f)); console.log('removed (no longer in the game):', orphans.join(', ')); }
else if (orphans.length) console.log('no longer in the game (kept; --prune removes them):', orphans.join(', '));
fs.rmSync(tmp, { recursive: true, force: true });

// the line sheet: for the voice service or the actors
function sheet(list) {
  const who = [...new Set(list.map((l) => l.speaker))];
  const scenes = { intro: 'The opening cutscene (wagmi/intro.js): E 37th St, 5:45 PM; the Suits take Dan\'s laptop bag, then Mr. Big, JPBank\'s CEO, calls on video from his study.', m1: 'Mission 1 "Bagged" (wagmi/mission/m1.js): the Suits at Chelsea Park; searching their van.' };
  const callsOf = (sc) => [...new Set(list.filter((l) => l.scene === sc && l.call && l.call !== '*').map((l) => l.call))];
  for (const sc of new Set(list.map((l) => l.scene))) if (!scenes[sc] && /^m\d+$/.test(sc)) scenes[sc] = fs.existsSync(path.join(ROOT, `wagmi/mission/${sc}.js`)) ? `Mission ${sc.slice(1)} (wagmi/mission/${sc}*.js).` : `Mission ${sc.slice(1)}'s teaser, on the last drive of Mission ${+sc.slice(1) - 1}.`;
  for (const [sc, d] of Object.entries(scenes)) { const cs = callsOf(sc); if (cs.length) scenes[sc] = `${d} Jane's car call${cs.length > 1 ? 's' : ''} (wagmi/mission/calls.js, only while Dan drives): ${cs.map((c) => `\`${c}\``).join(', ')}.`; }
  if (list.some((l) => l.scene === 'calls')) scenes.calls = 'Every car call (wagmi/mission/calls.js): the lines when Dan gets out of the car (on hold) and back in.';
  let s = `# Mog City: voice lines\n\nEvery spoken line in the game, for a voice service or actors. Generated from the game's own source by\n\`node wagmi/radio/build/voices.mjs\` (do not edit by hand: change the words in the game, then rebuild).\n\n`;
  const synth = Object.entries(picks).filter(([, n]) => VOICES[n]);
  // (a speaker with no synthesised voice and no recordings is a macOS placeholder: Apple's licence forbids public use)
  const placeholders = who.filter((w) => !pickOf(w) && list.some((l) => l.speaker === w && l.source.startsWith('say:')));
  if (placeholders.length) s += `**${placeholders.join(', ')} ${placeholders.length > 1 ? 'are' : 'is'} still a placeholder** made with the macOS speech voices (Apple's licence allows those for\npersonal, non-commercial use only), meant to be replaced by recordings or a synthesised voice before going public.`;
  else s += `**Every voice in the build is synthesised** with open models (no macOS placeholder is left), until real recordings replace them.`;
  s += synth.length ? ` Synthesised: ${synth.map(([w, n]) => `${w} (\`${n}\`)`).join(', ')}; see below.\n\n` : `\n\n`;
  s += `## How to deliver\n\n- One file per line, named by its **id**: \`<id>.wav\` (mono or stereo, 44.1 or 48 kHz, 24-bit preferred), dry: no music,\n  no reverb, no phone effect (the game adds the phone/video-call sound itself). 0.2 s of room tone either side is fine; it is trimmed.\n- Cutscene lines (scene \`intro\`) must fit their **window** (the time the shot gives them). Mission lines can run long.\n- Put the files in \`assets/voice/src/\` and run \`node wagmi/radio/build/voices.mjs\`. Each recording then replaces its\n  placeholder (trimmed, evened to the same loudness) as \`assets/voice/<id>.m4a\`;\n  the manifest records which lines are real. Nothing in the game's code changes.\n- New or changed lines in the game get their speaker's voice (synthesised, else a placeholder) the next time the build\n  runs (\`--all\` rebuilds every line, e.g. after changing a placeholder voice in \`wagmi/radio/build/cast.mjs\`).\n\n`;
  // (the candidates in tts-voices.mjs, by speaker: Dan `dan-A` .. `dan-C`)
  const by = {}; for (const n of Object.keys(VOICES)) (by[VOICES[n].speaker] ||= []).push(n);
  const cands = Object.entries(by).map(([w, ns]) => `${w} ${ns.length > 2 ? `\`${ns[0]}\` .. \`${ns.at(-1)}\`` : ns.map((n) => `\`${n}\``).join(', ')}`).join('; ');
  s += `## Synthesised voices\n\nA speaker can be voiced by an open text-to-speech model instead of the macOS placeholders: Qwen3-TTS 12Hz (a voice\ndesigned from words, then cloned for every line) or Kokoro-82M, both Apache-2.0, run locally. The candidates the\nowner auditioned are in \`wagmi/radio/build/tts-voices.mjs\`: ${cands} (the audition files and the designs nobody\npicked are in \`.scratch/voices/\`). To give each pick to every line of that\nspeaker, in one command (today's picks):\n\n\`\`\`sh\nnode wagmi/radio/build/voices.mjs --tts ${synth.length ? synth.map(([, n]) => n).join(',') : 'dan-A,jane-A'}     # the picked names\n\`\`\`\n\n- It records the pick in \`wagmi/radio/build/tts/picks.json\` (later builds keep using it: a changed line is synthesised\n  in the same voice), keeps a picked Qwen voice's reference clip there too (that clip IS the voice), renders the\n  speakers' lines with \`wagmi/radio/build/tts.py\` and rebuilds them like any other line (trim, -19 LUFS, AAC). It also\n  builds any other line that is new or changed, as a plain build does; Mr. Big and the rest keep their voices.\n- Cutscene lines still fit their windows: Qwen takes a line again (up to 4 seeded takes) and Kokoro says it a little\n  quicker when it is long; then the build tightens its pauses and stretches its tempo (the pitch kept, never a\n  chipmunk) by at most 1.15x. The manifest's \`source\` says \`tts:...\` with the voice, and \` x1.08\` when stretched.\n- A Qwen clone can drift (a line pitched well off its speaker's voice): \`take: 4\` for that line in \`cast.mjs\` TWEAK\n  makes it again from its 5th to 8th takes (the source says \` take 4\`); \`--only <id>\` is not needed.\n- A car call's register (its \`mode\` in \`wagmi/mission/calls.js\`): a \`fast\` call's lines (a chase) have their pauses\n  tightened and their tempo up 1.1x, the pitch kept (the source says \` +fast\`); on a \`whisper\` call (the tail) the\n  speaker on the phone (Jane) is whispered by the build, her own take turned to breath, 3 dB under (\`whisper()\` in\n  \`dsp.mjs\`; \` +whisper\`), and Dan answers in his own voice. A real recording is used as it is: record those whispered\n  or fast.\n- A crowd (the Camp: engine \`crowd\` in \`tts-voices.mjs\`) is several Kokoro voices saying the line together, each a\n  little late and at its own pace, mixed down to one file.\n- Back to the placeholder for one speaker: \`--tts Jane=say\`. A real recording in \`assets/voice/src/\` still wins.\n- It needs the local renderer, not in the repo: the venv \`.scratch/tts/venv\` (Homebrew python3.11 with\n  mlx-audio==0.5.8, kokoro-onnx==0.6.1, soundfile) and the weights in \`.scratch/downloads/voices/\` (\`hf/\` the two\n  mlx-community Qwen3-TTS repos, \`kokoro/\` kokoro-v1.0.onnx and voices-v1.0.bin); \`WAGMI_TTS\` and \`WAGMI_TTS_MODELS\`\n  point the build at them elsewhere. Without it those lines fall back to the placeholders, with a warning. Renders\n  are cached in \`.scratch/tts/render/\` (\`$WAGMI_TTS/render\`).\n- Credit (NOTICE): Qwen3-TTS by the Qwen team, Alibaba Cloud (Apache-2.0) or Kokoro-82M by hexgrad (Apache-2.0).\n\n`;
  s += `## The cast\n\n| Speaker | Who | Direction | Voice in the build |\n|---|---|---|---|\n`;
  const engine = (p) => ({ qwen: 'Qwen3-TTS', kokoro: 'Kokoro', crowd: 'a crowd of Kokoro voices' })[VOICES[p].engine];
  for (const w of who) { const c = CAST[w] || CAST.default, p = pickOf(w); s += `| ${w} | ${c.who || ''} | ${c.direction || ''} | ${p ? `${p}: ${engine(p)} (${VOICES[p].desc})` : `${c.voice} (placeholder)`}${c.fx === 'changer' ? ' + voice changer' : ''} |\n`; }
  // (the direction column: the line's own note, else its call's part and register)
  const REG = { whisper: 'whispered', fast: 'fast and clipped' };
  const dir = (l) => DIRECTION[l.id] || (l.call ? `${l.call === '*' ? 'Any call' : `Call \`${l.call}\``}${l.register ? `, ${REG[l.register]}` : ''}.` : '');
  for (const [sc, d] of Object.entries(scenes)) {
    const ls = list.filter((l) => l.scene === sc); if (!ls.length) continue;
    s += `\n## ${sc === 'intro' ? 'Opening cutscene' : sc === 'calls' ? 'Every car call' : 'Mission ' + sc.slice(1)}\n\n${d}\n\n| # | id | Speaker | Line | Window | Direction |\n|---|---|---|---|---|---|\n`;
    ls.forEach((l, i) => { s += `| ${i + 1} | \`${l.id}\` | ${l.speaker} | ${l.text.replace(/\|/g, '\\|')} | ${l.window ? `${(l.window[1] - l.window[0]).toFixed(1)} s` : ''} | ${dir(l)} |\n`; });
  }
  const rest = list.filter((l) => !scenes[l.scene]);
  if (rest.length) {
    s += `\n## Other scenes\n\n| # | id | Speaker | Line | Window | Direction |\n|---|---|---|---|---|---|\n`;
    rest.forEach((l, i) => { s += `| ${i + 1} | \`${l.id}\` | ${l.speaker} | ${l.text.replace(/\|/g, '\\|')} | ${l.window ? `${(l.window[1] - l.window[0]).toFixed(1)} s` : ''} | ${dir(l)} |\n`; });
  }
  return s;
}
