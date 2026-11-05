// Story Kit browser voice pass: turns a pack's lines + its characters' voice blocks into voice clips on the creator's
// own computer with Kokoro-82M (WebGPU, WASM fallback). No server GPU, no paid API. If the model cannot run here, the
// pass says so and the game falls back to subtitles + speechSynthesis.
//
//   import { createVoicePass } from '/storykit/voices/browser-voice-pass.js';
//   const pass = createVoicePass({ onProgress: (p) => console.log(p) });   // model from Hugging Face, see below
//   const plan = await pass.plan();                       // what would run here, and how big the download is
//   const out = await pass.run({ lines: [{ id, speaker, text }], voices: { [speaker]: voiceBlock } }, { signal });
//   out.mode  -> 'kokoro' | 'speech'; out.clips -> Map(lineId -> { blob (audio/wav), seconds, key, cached })
//
// Where the files come from. GameMog serves none of the model or its runtime (no CDN or bucket of ours):
//   modelBase  = MODEL_HUB: the model's own hub, https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX at the
//                pinned revision KOKORO_REVISION (Apache-2.0). config.json, tokenizer.json, tokenizer_config.json,
//                onnx/model.onnx (WebGPU, fp32) or onnx/model_quantized.onnx (WASM, q8), voices/<id>.bin. The hub
//                answers with CORS and redirects the big files to its own CDN (*.hf.co).
//   vendorBase = RUNTIME_CDN: transformers.js 3.8.1 from jsDelivr (npm @huggingface/transformers@3.8.1/dist:
//                transformers.min.js + ort-wasm-simd-threaded.jsep.{mjs,wasm}), Apache-2.0, ORT MIT
//   gplBase    = '/storykit/vendor/': GameMog's own server, for gpl/phonemizer.js only (1.3 MB): eSpeak NG compiled
//                to JS, GPL-3.0-or-later, unmodified, with its licence (gpl/COPYING) and source links (gpl/SOURCE.md)
//                beside it. Loaded as its own file with a dynamic import, never bundled, and only for a line that
//                has no `phonemes` when no other `g2p` is given (see storykit/voices/LICENSING.md).
//   LOCAL_FILES ({ modelBase, vendorBase }) = the same files from the local dev server (npm run storykit:voice-files),
//   for working offline. If the download fails the pass falls back to subtitles + speech with reason 'model failed
//   to load: ...' and the studio says so in its own words (studio.js).
// Clips in a pack: opts.encode(float32) -> { bytes, ext, type, codec } (clip-codec.js encodeClip: Ogg Opus where the
// browser can encode it, else WAV) and opts.onClip(line, clip) for each clip made or found (the studio stores them).
// Caching: transformers.js keeps the model in the Cache API ('transformers-cache'); voice tables go in
// 'storykit-voices'; finished clips in 'storykit-voice-clips', keyed by text + blend + speed + pitch, so a Mog that
// changes three lines renders three clips.

import { lintVoiceBlock, blendStyle, styleRow, renderSpeed, shape, toPhonemes, langOf, clipKey, wavBytes,
  SAMPLE_RATE, KOKORO_VOICES } from './voice-design.js';

const MODEL_FILES = { fp32: ['onnx/model.onnx', 326e6], fp16: ['onnx/model_fp16.onnx', 163e6], q8: ['onnx/model_quantized.onnx', 92e6] };
const VOICE_BYTES = 522240;                                  // one 510 x 256 float32 table
const CLIP_CACHE = 'storykit-voice-clips', VOICE_CACHE = 'storykit-voices';
export const KOKORO_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
export const MODEL_HUB = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${KOKORO_REVISION}/`;
export const RUNTIME_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
export const LOCAL_FILES = { modelBase: '/storykit/kokoro/kokoro-82m-onnx', vendorBase: '/storykit/vendor/' };

const safe = async (fn, dflt) => { try { return await fn(); } catch { return dflt; } };
const abs = (u) => new URL(u, location.href).href;

export function createVoicePass(opts = {}) {
  const o = {
    modelBase: MODEL_HUB, vendorBase: RUNTIME_CDN, gplBase: '/storykit/vendor/',
    device: 'auto',              // 'auto' | 'webgpu' | 'wasm'
    dtype: null,                 // null = fp32 on WebGPU, q8 on WASM (the measured best of each); or 'fp16'
    g2p: null,                   // (text, 'en-us'|'en-gb') -> Promise<string[]>; null loads gplBase/gpl/phonemizer.js
    loadPhonemizer: true,        // false: never load the GPL phonemizer; lines must carry `phonemes` (made on the server)
    maxMinutes: 20,              // give up and fall back when the estimate for the whole pack is longer than this
    minDeviceMemoryGB: 4,        // below this (navigator.deviceMemory) don't try: phones fall back to speech
    phonemizerUrl: null,         // null = gplBase + 'gpl/phonemizer.js'
    encode: null,                // (Float32Array at 24 kHz) -> Promise<{ bytes, ext, type, codec }>; null = WAV
    onClip: null,                // async (line, clip) => {}: called for every clip, made or from the cache
    onProgress: () => {},
    ...opts,
  };
  const slash = (u) => abs(u.replace(/\/$/, '') + '/');
  const modelBase = slash(o.modelBase), vendorBase = slash(o.vendorBase), gplBase = slash(o.gplBase);
  let T = null, model = null, tok = null, g2p = o.g2p, device = null, dtype = null;
  const tables = new Map(), raw = new Map();
  const progress = (p) => { try { o.onProgress(p); } catch {} };

  async function hasWebGPU() {
    if (!globalThis.navigator?.gpu) return false;
    return !!(await safe(() => navigator.gpu.requestAdapter(), null));
  }

  // What would run on this computer, before anything is downloaded
  async function plan() {
    const mem = navigator.deviceMemory;   // Chrome only; rounded down, max 8
    if (mem && mem < o.minDeviceMemoryGB) return { mode: 'speech', reason: `device memory ${mem} GB < ${o.minDeviceMemoryGB} GB` };
    if (typeof WebAssembly !== 'object') return { mode: 'speech', reason: 'no WebAssembly' };
    const gpu = o.device !== 'wasm' && (await hasWebGPU());
    const dev = o.device === 'webgpu' || (o.device === 'auto' && gpu) ? 'webgpu' : 'wasm';
    const dt = o.dtype || (dev === 'webgpu' ? 'fp32' : 'q8'), [file, bytes] = MODEL_FILES[dt] || MODEL_FILES.q8;
    const cached = await safe(async () => !!(await (await caches.open('transformers-cache')).match(modelBase + file)), false);
    return { mode: 'kokoro', device: dev, dtype: dt, downloadBytes: cached ? 0 : bytes + 3 * VOICE_BYTES, cached,
      threads: globalThis.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1 };
  }

  async function load(p) {
    if (model) return;
    const t0 = performance.now();
    T = await import(vendorBase + 'transformers.min.js');
    T.env.allowLocalModels = false; T.env.allowRemoteModels = true; T.env.useBrowserCache = true;
    // transformers.js fetches (and caches under) <remoteHost><remotePathTemplate><file>, so the cache key is
    // modelBase + file either way (plan() looks it up). A hub address <host>/<org>/<id>/resolve/<revision>/ keeps its
    // revision; any other base is <host>/<dir>/<id>/.
    const hub = modelBase.match(/^(https?:\/\/[^/]+\/)([^/]+\/[^/]+)\/resolve\/([^/]+)\/$/);
    let id, revision = 'main';
    if (hub) { T.env.remoteHost = hub[1]; T.env.remotePathTemplate = '{model}/resolve/{revision}/'; id = hub[2]; revision = decodeURIComponent(hub[3]); }
    else {
      const parts = new URL(modelBase), segs = parts.pathname.replace(/\/$/, '').split('/'); id = segs.pop();
      T.env.remoteHost = parts.origin + segs.join('/') + '/'; T.env.remotePathTemplate = '{model}/';
    }
    T.env.backends.onnx.wasm.wasmPaths = vendorBase;
    // ONNX Runtime's own notes (which nodes run on the CPU) are warnings printed as console errors: only real errors
    T.env.backends.onnx.logLevel = 'error';
    if (globalThis.crossOriginIsolated) T.env.backends.onnx.wasm.numThreads = Math.min(8, navigator.hardwareConcurrency || 4);
    const files = {};
    const cb = (e) => {
      if (e.status === 'progress' && e.total) { files[e.file] = [e.loaded, e.total]; const v = Object.values(files);
        progress({ stage: 'download', loaded: v.reduce((s, x) => s + x[0], 0), total: v.reduce((s, x) => s + x[1], 0), file: e.file }); }
    };
    device = p.device; dtype = p.dtype;
    try {
      [model, tok] = await Promise.all([T.StyleTextToSpeech2Model.from_pretrained(id, { revision, dtype, device, progress_callback: cb, session_options: { logSeverityLevel: 3 } }), T.AutoTokenizer.from_pretrained(id, { revision })]);
    } catch (e) {
      if (device !== 'webgpu') throw e;
      progress({ stage: 'webgpu-failed', error: String(e).slice(0, 200) });   // some GPUs refuse: try WASM q8
      device = 'wasm'; dtype = 'q8';
      [model, tok] = await Promise.all([T.StyleTextToSpeech2Model.from_pretrained(id, { revision, dtype, device, progress_callback: cb, session_options: { logSeverityLevel: 3 } }), T.AutoTokenizer.from_pretrained(id, { revision })]);
    }
    progress({ stage: 'loaded', device, dtype, seconds: (performance.now() - t0) / 1000 });
  }

  async function voiceTable(id) {
    if (raw.has(id)) return raw.get(id);
    const url = modelBase + 'voices/' + id + '.bin';
    let buf = await safe(async () => { const r = await (await caches.open(VOICE_CACHE)).match(url); return r && r.arrayBuffer(); }, null);
    if (!buf) {
      const r = await fetch(url); if (!r.ok) throw new Error(`voice ${id}: HTTP ${r.status}`);
      buf = await r.arrayBuffer();
      await safe(async () => (await caches.open(VOICE_CACHE)).put(url, new Response(buf.slice(0))));
    }
    const t = new Float32Array(buf); raw.set(id, t); return t;
  }
  async function styleFor(block) {
    const k = JSON.stringify(block.blend);
    if (!tables.has(k)) tables.set(k, await blendStyle(block, voiceTable));
    return tables.get(k);
  }

  // text-to-phoneme, loaded only when a line comes without phonemes
  async function getG2p() {
    if (g2p) return g2p;
    if (!o.loadPhonemizer) throw new Error('line has no phonemes and loadPhonemizer is off');
    progress({ stage: 'phonemizer' });
    g2p = (await import(o.phonemizerUrl ? abs(o.phonemizerUrl) : gplBase + 'gpl/phonemizer.js')).phonemize;
    return g2p;
  }

  // One line -> Float32Array at 24 kHz, shaped (pitch, trim, level). phonemes: Kokoro IPA made elsewhere (optional)
  async function render(text, block, phonemes) {
    const ph = phonemes || (await toPhonemes(text, langOf(block), await getG2p()));
    const { input_ids } = tok(ph, { truncation: true });
    const style = new T.Tensor('float32', styleRow(await styleFor(block), input_ids.dims.at(-1)), [1, 256]);
    const { waveform } = await model({ input_ids, style, speed: new T.Tensor('float32', [renderSpeed(block)], [1]) });
    return shape(waveform.data, block);
  }

  // The whole pass. lines: [{ id, speaker, text, phonemes? }]; voices: { speaker: block }
  async function run({ lines, voices }, { signal } = {}) {
    const blocks = {}, problems = {};
    for (const [sp, b] of Object.entries(voices || {})) { const r = lintVoiceBlock(b); blocks[sp] = r.block; if (r.problems.length) problems[sp] = r.problems; }
    const blockOf = (l) => blocks[l.speaker] || lintVoiceBlock({ base: 'af_heart' }).block;
    const clips = new Map(), failed = [];
    const cache = await safe(() => caches.open(CLIP_CACHE), null);
    const keyUrl = (k) => abs('/__storykit-voice-clip/' + k + '.wav');
    // 1. clips already made (this pack before, or the Mog's parent)
    const todo = [];
    for (const l of lines) {
      const key = await clipKey(l.text, blockOf(l));
      const hit = cache && (await safe(() => cache.match(keyUrl(key)), null));
      if (hit) {
        const blob = await hit.blob(), secs = +hit.headers.get('x-seconds');
        const clip = { blob, seconds: secs || (blob.size - 44) / 2 / SAMPLE_RATE, key, cached: true, ext: /ogg/.test(blob.type) ? 'ogg' : 'wav', codec: hit.headers.get('x-codec') || 'pcm16' };
        clips.set(l.id, clip); if (o.onClip) await safe(() => o.onClip(l, clip));
      } else todo.push({ l, key });
    }
    progress({ stage: 'plan', lines: lines.length, cached: clips.size, toRender: todo.length });
    if (!todo.length) return { mode: 'kokoro', device, clips, failed, problems };
    const p = await plan();
    if (p.mode !== 'kokoro') return fallback(p.reason, clips);
    try { await load(p); } catch (e) { return fallback('model failed to load: ' + String(e).slice(0, 200), clips); }
    const t0 = performance.now(); let audio = 0;
    for (let i = 0; i < todo.length; i++) {
      if (signal?.aborted) { progress({ stage: 'aborted', done: i }); break; }
      const { l, key } = todo[i];
      try {
        const r0 = performance.now();
        const y = await render(l.text, blockOf(l), l.phonemes), renderMs = performance.now() - r0;
        const enc = o.encode ? await o.encode(y) : { bytes: wavBytes(y), ext: 'wav', type: 'audio/wav', codec: 'pcm16' };
        const blob = new Blob([enc.bytes], { type: enc.type });
        const clip = { blob, seconds: y.length / SAMPLE_RATE, key, cached: false, ext: enc.ext, codec: enc.codec, renderMs, encodeMs: performance.now() - r0 - renderMs };
        clips.set(l.id, clip);
        audio += y.length / SAMPLE_RATE;
        if (cache) await safe(() => cache.put(keyUrl(key), new Response(blob, { headers: { 'content-type': enc.type, 'x-seconds': String(clip.seconds), 'x-codec': enc.codec } })));
        if (o.onClip) await o.onClip(l, clip);
      } catch (e) { failed.push({ id: l.id, error: String(e).slice(0, 200) }); }
      const spent = (performance.now() - t0) / 1000, perLine = spent / (i + 1), etaS = perLine * (todo.length - i - 1);
      progress({ stage: 'render', done: i + 1, total: todo.length, line: l.id, xRealtime: audio / spent, etaS });
      // after a few lines, a pack that would take too long here is handed to the speech fallback (clips so far kept)
      if (i === 2 && etaS > o.maxMinutes * 60) return fallback(`estimated ${Math.round(etaS / 60)} min on this computer`, clips);
    }
    return { mode: 'kokoro', device, dtype, clips, failed, problems, seconds: (performance.now() - t0) / 1000, audioSeconds: audio };
  }

  // lines without a clip are spoken with speak() (subtitles + speechSynthesis); clips already made are still used
  function fallback(reason, clips) {
    progress({ stage: 'fallback', reason });
    return { mode: 'speech', reason, clips, failed: [], problems: {} };
  }

  return { plan, run, render: async (text, block) => { const p = await plan(); if (p.mode !== 'kokoro') throw new Error(p.reason); await load(p); return render(text, lintVoiceBlock(block).block); }, speak, get device() { return device; } };
}

// Fallback: speak a line with the browser's own voice and show it as a subtitle. Placeholder quality only: it sounds
// different on every device and does not go through WebAudio (no phone band, no jaw from the level), so the subtitle
// always shows. onSubtitle(text | null) shows and clears it. Resolves when the line ends (or after a reading-time
// estimate when speechSynthesis is missing or blocked).
export function speak(line, block = {}, { onSubtitle = () => {}, volume = 1 } = {}) {
  const b = lintVoiceBlock(block).block, text = line.text || String(line);
  onSubtitle(text);
  const readMs = 600 + text.split(/\s+/).length * 330 / b.speed;
  const t0 = Date.now();
  // the subtitle stays up at least the reading time, also when the browser has no voice or refuses to speak
  const done = (res) => () => setTimeout(() => { onSubtitle(null); res(); }, Math.max(0, readMs - (Date.now() - t0)));
  return new Promise((res) => {
    const ss = globalThis.speechSynthesis;
    if (!ss || typeof SpeechSynthesisUtterance !== 'function') { done(res)(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const lang = langOf(b) === 'en-gb' ? 'en-GB' : 'en-US', female = (KOKORO_VOICES[b.base]?.sex || 'f') === 'f';
    const vs = ss.getVoices().filter((v) => v.lang?.replace('_', '-').startsWith(lang));
    // voice names don't say sex reliably; prefer a local voice and spread speakers over the list by base voice
    const pool = vs.length ? vs : ss.getVoices().filter((v) => v.lang?.startsWith('en'));
    if (pool.length) { let h = 0; for (const ch of b.base + (female ? 'f' : 'm')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; u.voice = pool[h % pool.length]; }
    u.lang = lang; u.rate = Math.min(1.3, Math.max(0.7, b.speed)); u.pitch = Math.min(2, Math.max(0, 1 + b.pitch * 0.1)); u.volume = volume;
    let over = false; const end = () => { if (!over) { over = true; clearTimeout(guard); done(res)(); } };
    const guard = setTimeout(end, readMs * 2 + 2000);   // iOS without a user gesture never fires onend
    u.onend = u.onerror = end;
    ss.speak(u);
  });
}
