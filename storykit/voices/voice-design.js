// Story Kit voice design: a character's voice block -> one Kokoro-82M style + the post-processing that makes it a
// distinct voice. Pure ES module with no dependencies, shared by the browser voice pass and the Node benchmark.
//
// A voice block (what the writer LLM fills in for each character):
//   {
//     id: 'oh-soonja',                      // the voice's id in the world's registry
//     base: 'af_sarah',                     // the main Kokoro voice (decides the English variant: a* = US, b* = UK)
//     blend: { af_sarah: 0.6, zf_xiaoyi: 0.25, af_kore: 0.15 },   // up to 3 Kokoro voices; weights are normalised
//     speed: 0.9,                           // 0.8-1.2, Kokoro's own phoneme timing
//     pitch: -1.5,                          // semitones, -2.5..+2.5, applied after rendering (shifts formants too)
//     description: 'a 68-year-old Korean grandmother, warm and unhurried, a little husky'
//   }
// Voices are invented: a blend of stock style vectors, never a recording of a person. A description that names a real
// person ("sounds like ...", "in the voice of ...") is refused by lintVoiceBlock.

export const SAMPLE_RATE = 24000;
export const STYLE_DIM = 256;      // one style vector
export const STYLE_ROWS = 510;     // one row per input length (tokens); a voice file is 510 x 256 float32

// The stock English voices, with Kokoro's own grades (VOICES.md) and the median pitch measured on this Mac (Node
// bench, 4 Nov 2026, one neutral line each; am_eric, am_santa and am_fenrir sit high for men). Non-English voices may be mixed in at low weight for colour, never as the base.
export const KOKORO_VOICES = {
  af_heart:   { sex: 'f', lang: 'en-us', grade: 'A',  f0: 200 }, af_bella:   { sex: 'f', lang: 'en-us', grade: 'A-', f0: 195 },
  af_nicole:  { sex: 'f', lang: 'en-us', grade: 'B-', f0: 156 }, af_aoede:   { sex: 'f', lang: 'en-us', grade: 'C+', f0: 188 },
  af_kore:    { sex: 'f', lang: 'en-us', grade: 'C+', f0: 157 }, af_sarah:   { sex: 'f', lang: 'en-us', grade: 'C+', f0: 194 },
  af_alloy:   { sex: 'f', lang: 'en-us', grade: 'C',  f0: 142 }, af_nova:    { sex: 'f', lang: 'en-us', grade: 'C',  f0: 164 },
  af_sky:     { sex: 'f', lang: 'en-us', grade: 'C-', f0: 156 }, af_jessica: { sex: 'f', lang: 'en-us', grade: 'D',  f0: 203 },
  af_river:   { sex: 'f', lang: 'en-us', grade: 'D',  f0: 178 },
  am_fenrir:  { sex: 'm', lang: 'en-us', grade: 'C+', f0: 140 }, am_michael: { sex: 'm', lang: 'en-us', grade: 'C+', f0: 111 },
  am_puck:    { sex: 'm', lang: 'en-us', grade: 'C+', f0: 118 }, am_echo:    { sex: 'm', lang: 'en-us', grade: 'D',  f0: 111 },
  am_eric:    { sex: 'm', lang: 'en-us', grade: 'D',  f0: 157 }, am_liam:    { sex: 'm', lang: 'en-us', grade: 'D',  f0: 122 },
  am_onyx:    { sex: 'm', lang: 'en-us', grade: 'D',  f0: 87 }, am_santa:   { sex: 'm', lang: 'en-us', grade: 'D-', f0: 168 },
  am_adam:    { sex: 'm', lang: 'en-us', grade: 'F+', f0: 121 },
  bf_emma:    { sex: 'f', lang: 'en-gb', grade: 'B-', f0: 190 }, bf_isabella: { sex: 'f', lang: 'en-gb', grade: 'C', f0: 209 },
  bf_alice:   { sex: 'f', lang: 'en-gb', grade: 'D',  f0: 222 }, bf_lily:    { sex: 'f', lang: 'en-gb', grade: 'D',  f0: 200 },
  bm_george:  { sex: 'm', lang: 'en-gb', grade: 'C',  f0: 144 }, bm_fable:   { sex: 'm', lang: 'en-gb', grade: 'C',  f0: 145 },
  bm_lewis:   { sex: 'm', lang: 'en-gb', grade: 'D+', f0: 88 },  bm_daniel:  { sex: 'm', lang: 'en-gb', grade: 'D',  f0: 126 },
};
// colour voices (other languages): allowed in a blend at weight <= 0.35, never as the base
export const COLOUR_VOICES = ['ef_dora', 'em_alex', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi', 'if_sara',
  'im_nicola', 'jf_alpha', 'jm_kumo', 'pf_dora', 'pm_alex', 'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi',
  'zm_yunjian', 'zm_yunxi', 'zm_yunyang'];
const COLOUR_MAX = 0.35;

// The character sheet's coarse voice fields (scripts/forge/character-sheet.schema.json) -> block numbers
export const SHEET_PITCH = { low: -2, 'mid-low': -1, mid: 0, 'mid-high': 1, high: 2 };
export const SHEET_RATE = { slow: 0.88, steady: 1, quick: 1.1 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const LIKENESS = /\b(sounds? like|in the (style|voice) of|impersonat|imitat|voice of|as if (he|she|they) (were|was))\b/i;

// Normalise a block: the base must be an English stock voice; at most 3 voices; colour voices capped; numbers bounded.
// Returns { block, problems }. problems is empty for a clean block; the block is always usable (bad parts dropped).
export function lintVoiceBlock(input) {
  const problems = [];
  const b = input || {};
  let base = KOKORO_VOICES[b.base] ? b.base : null;
  if (!base) { problems.push(`base "${b.base}" is not an English stock voice; using af_heart`); base = 'af_heart'; }
  let entries = Object.entries(b.blend || { [base]: 1 }).filter(([id, w]) => {
    const ok = (KOKORO_VOICES[id] || COLOUR_VOICES.includes(id)) && Number.isFinite(w) && w > 0;
    if (!ok) problems.push(`blend entry ${id}:${w} dropped`);
    return ok;
  });
  if (!entries.some(([id]) => id === base)) entries.unshift([base, 1]);
  if (entries.length > 3) { problems.push('more than 3 voices: kept the 3 heaviest'); entries = entries.sort((x, y) => y[1] - x[1]).slice(0, 3); }
  let sum = entries.reduce((s, [, w]) => s + w, 0);
  entries = entries.map(([id, w]) => [id, w / sum]);
  // colour voices: cap their share, give the rest back to the base
  let excess = 0;
  entries = entries.map(([id, w]) => { if (COLOUR_VOICES.includes(id) && w > COLOUR_MAX) { excess += w - COLOUR_MAX; problems.push(`${id} capped at ${COLOUR_MAX}`); return [id, COLOUR_MAX]; } return [id, w]; });
  entries = entries.map(([id, w]) => [id, id === base ? w + excess : w]);
  const speed = clamp(Number.isFinite(b.speed) ? b.speed : 1, 0.8, 1.2);
  const pitch = clamp(Number.isFinite(b.pitch) ? b.pitch : 0, -2.5, 2.5);
  if (b.speed !== undefined && speed !== b.speed) problems.push(`speed clamped to ${speed}`);
  if (b.pitch !== undefined && pitch !== b.pitch) problems.push(`pitch clamped to ${pitch}`);
  const description = String(b.description || '').slice(0, 160);
  if (LIKENESS.test(description)) problems.push('description names a likeness ("sounds like ..."): refused');
  const blend = Object.fromEntries(entries.map(([id, w]) => [id, +w.toFixed(4)]));
  return { block: { id: String(b.id || base), base, blend, speed, pitch, description: LIKENESS.test(description) ? '' : description }, problems };
}

// en-us or en-gb phonemes, from the base voice
export const langOf = (block) => (block.base[0] === 'b' ? 'en-gb' : 'en-us');

// Weighted sum of the voices' style tables. loadVoice(id) -> Promise<Float32Array(510*256)>
export async function blendStyle(block, loadVoice) {
  const out = new Float32Array(STYLE_ROWS * STYLE_DIM);
  for (const [id, w] of Object.entries(block.blend)) {
    const v = await loadVoice(id);
    if (v.length !== out.length) throw new Error(`voice ${id}: ${v.length} floats, expected ${out.length}`);
    for (let i = 0; i < out.length; i++) out[i] += w * v[i];
  }
  return out;
}

// The style row Kokoro expects for a token sequence of length n (kokoro-js: row = min(max(n - 2, 0), 509))
export const styleRow = (table, nTokens) => {
  const r = Math.min(Math.max(nTokens - 2, 0), STYLE_ROWS - 1) * STYLE_DIM;
  return table.slice(r, r + STYLE_DIM);
};

// Pitch: render at speed / r (longer), then resample by r back to the planned length. Pitch and formants move together
// (r > 1 brighter and smaller, r < 1 darker and bigger), which is what makes a stock voice read as a different person.
export const pitchRatio = (semitones) => Math.pow(2, semitones / 12);
export const renderSpeed = (block) => clamp(block.speed / pitchRatio(block.pitch), 0.5, 2);

export function resample(x, ratio) {
  if (Math.abs(ratio - 1) < 1e-4) return x;
  const n = Math.floor((x.length - 1) / ratio);
  const y = new Float32Array(n);
  // pitch up = decimation: a light 3-tap smoothing first keeps the aliasing down
  let src = x;
  if (ratio > 1) { src = new Float32Array(x.length); for (let i = 0; i < x.length; i++) src[i] = 0.25 * (x[i - 1] ?? x[i]) + 0.5 * x[i] + 0.25 * (x[i + 1] ?? x[i]); }
  for (let i = 0; i < n; i++) {
    const t = i * ratio, k = Math.floor(t), f = t - k;
    const p0 = src[k - 1] ?? src[k], p1 = src[k], p2 = src[k + 1] ?? p1, p3 = src[k + 2] ?? p2;   // Catmull-Rom
    y[i] = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }
  return y;
}

// Trim leading/trailing silence (keep 60 ms), even the level (RMS target about -20 dBFS), keep peaks under -1 dBFS.
export function finish(x, { targetDb = -20, padMs = 60 } = {}) {
  const win = 240, thr = 0.01;
  let a = 0, b = x.length;
  const loud = (i) => { let m = 0; for (let j = i; j < Math.min(x.length, i + win); j++) m = Math.max(m, Math.abs(x[j])); return m > thr; };
  while (a < b && !loud(a)) a += win;
  while (b > a && !loud(Math.max(0, b - win))) b -= win;
  const pad = Math.round(SAMPLE_RATE * padMs / 1000);
  const y = x.slice(Math.max(0, a - pad), Math.min(x.length, b + pad));
  let ss = 0; for (let i = 0; i < y.length; i++) ss += y[i] * y[i];
  const rms = Math.sqrt(ss / Math.max(1, y.length)) || 1e-9;
  let g = Math.pow(10, targetDb / 20) / rms, peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  g = Math.min(g, 0.89 / (peak || 1));
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

// Post-processing of one raw Kokoro render (rendered at renderSpeed(block))
export const shape = (raw, block) => finish(resample(raw, pitchRatio(block.pitch)));

// Median F0 (Hz) by autocorrelation over voiced 40 ms frames: used to keep a world's voices apart.
export function medianF0(x, sr = SAMPLE_RATE) {
  const N = Math.round(sr * 0.04), hop = Math.round(sr * 0.02), lo = Math.floor(sr / 400), hi = Math.ceil(sr / 60);
  const f0s = [];
  for (let s = 0; s + N + hi < x.length; s += hop) {
    let e = 0; for (let i = 0; i < N; i++) e += x[s + i] * x[s + i];
    if (e / N < 1e-4) continue;
    let best = 0, bl = 0;
    for (let l = lo; l <= hi; l++) {
      let c = 0, e2 = 0; for (let i = 0; i < N; i++) { c += x[s + i] * x[s + i + l]; e2 += x[s + i + l] * x[s + i + l]; }
      const r = c / Math.sqrt(e * e2 + 1e-12);
      if (r > best) { best = r; bl = l; }
    }
    if (best > 0.55) f0s.push(sr / bl);
  }
  if (!f0s.length) return 0;
  f0s.sort((p, q) => p - q);
  return f0s[f0s.length >> 1];
}

// Two voices in one world must differ: >= 12 % apart in median pitch, or a different sex/variant base, or blends that
// share less than half their weight. Returns the pairs that clash.
export function clashes(blocks, f0ById = {}) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    const shared = Object.keys(a.blend).reduce((s, id) => s + Math.min(a.blend[id], b.blend[id] || 0), 0);
    const fa = f0ById[a.id], fb = f0ById[b.id];
    const apart = fa && fb ? Math.abs(fa - fb) / Math.min(fa, fb) >= 0.12 : Math.abs(a.pitch - b.pitch) >= 2;
    if (shared >= 0.5 && !apart) out.push([a.id, b.id, +shared.toFixed(2)]);
  }
  return out;
}

// Kokoro's text clean-up and phoneme fix-ups, adapted from kokoro-js 1.2.1 (Apache-2.0, hexgrad/Xenova).
export function normaliseText(t) {
  return t.replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/\(/g, '«').replace(/\)/g, '»')
    .replace(/[^\S \n]/g, ' ').replace(/  +/g, ' ')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor').replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss').replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc').replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/(?<=\d),(?=\d)/g, '').replace(/(?<=\d)-(?=\d)/g, ' to ').trim();
}
export const PUNCT = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;
export function fixPhonemes(p, lang) {
  let s = p.replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ').replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (lang === 'en-us') s = s.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return s.trim();
}
// text -> phonemes with any g2p(text, lang) -> Promise<string[]>, keeping punctuation as Kokoro was trained
export async function toPhonemes(text, lang, g2p) {
  const t = normaliseText(text), parts = [];
  let last = 0;
  for (const m of t.matchAll(PUNCT)) { if (m.index > last) parts.push([false, t.slice(last, m.index)]); parts.push([true, m[0]]); last = m.index + m[0].length; }
  if (last < t.length) parts.push([false, t.slice(last)]);
  const out = await Promise.all(parts.map(async ([isP, s]) => (isP ? s : (await g2p(s, lang)).join(' '))));
  return fixPhonemes(out.join(''), lang);
}

// A stable key for a clip: the same line in the same voice is never rendered twice (a Mog re-voices only changes).
export async function clipKey(text, block, model = 'kokoro-82m-v1.0') {
  const s = JSON.stringify([model, text, block.blend, block.speed, block.pitch]);
  if (globalThis.crypto?.subtle) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(h)].slice(0, 12).map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

// 16-bit PCM WAV bytes
export function wavBytes(x, sr = SAMPLE_RATE) {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(clamp(x[i], -1, 1) * 32767), true);
  return new Uint8Array(buf);
}

// ── clips in a pack (the voice manifest) ──
// FNV-1a (32-bit) of a line's text: the line hash the pack gate lists for every spoken line (storykit/pack/gate.ts).
export function lineHash(text) {
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(String(text))) { h ^= c; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const VOICE_MODEL = 'kokoro-82m-v1.0';
// The same hash of what makes a voice sound as it does (a linted block's blend, speed and pitch, and the model): a
// clip is for one text in one voice, so a changed voice block re-renders its person's lines and nobody else's.
export const voiceKey = (block, model = VOICE_MODEL) => lineHash(JSON.stringify([model, Object.entries(block.blend).sort(([a], [b]) => (a < b ? -1 : 1)), block.speed, block.pitch]));
// A clip's file name in the pack's voice folder (packs/<id>/voice/): <line hash>-<voice key>.<ogg | wav>
export const clipBase = (text, block) => `${lineHash(text)}-${voiceKey(block)}`;
export const CLIP_FILE = /^[0-9a-f]{8}-[0-9a-f]{8}\.(ogg|wav)$/;

// A clip's loudness for the jaw: RMS in frames of 1/fps s, scaled so the loud syllables reach 1 (the 90th percentile
// of the voiced frames), with a fast attack and a slower release so the mouth closes between words, not between samples.
export function loudness(x, sr = SAMPLE_RATE, fps = 100) {
  const n = Math.max(1, Math.round(sr / fps)), frames = Math.ceil(x.length / n), env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; const a = f * n, b = Math.min(x.length, a + n); for (let i = a; i < b; i++) s += x[i] * x[i]; env[f] = Math.sqrt(s / Math.max(1, b - a)); }
  const voiced = [...env].filter((v) => v > 0.004).sort((p, q) => p - q), ref = voiced[Math.floor(voiced.length * 0.9)] || 1;
  let y = 0;
  for (let f = 0; f < frames; f++) {
    const v = Math.min(1, Math.max(0, (env[f] - 0.006) / (ref - 0.006 || 1)));
    y += (v - y) * (v > y ? 0.7 : 0.3);
    env[f] = y;
  }
  return { fps, env };
}
