// Story Kit voice studio: the browser voice pass over a world's voice plan (each speaker's block and every spoken line
// with its clip's name), storing each new clip as it is made. window.__studio carries the state and timings for the
// headless probes.
//   studio.html?draft=<id>   a creator's world in the store (lib/storykit-store.ts). The draft's token comes in the
//                            address's fragment (#t=<token>, never sent to a server) or from this tab's sessionStorage
//                            (storykit-draft:<id>); each clip is PUT to /api/storykit/drafts/<id>/files/voice/<name>
//   studio.html?pack=<id>    a committed repo pack (public/storykit/packs/<id>.json), on the local dev server only:
//                            the same address with the id repo-<id>, stored beside the pack
//   &model=local             the model and its runtime from this server (npm run storykit:voice-files) instead of
//                            Hugging Face and jsDelivr, for working offline
import { createVoicePass, LOCAL_FILES } from './browser-voice-pass.js';
import { encodeClip } from './clip-codec.js';

const Q = new URLSearchParams(location.search), draft = Q.get('draft') || '', id = draft || Q.get('pack') || '';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const S = (window.__studio = { pack: id, draft: !!draft, state: 'loading', lines: 0, todo: 0, made: [], failed: [], log: [] });
const log = (x) => { S.log.push(x); if (S.log.length > 200) S.log.shift(); };
const token = (() => {
  if (!draft) return null;
  const key = `storykit-draft:${draft}`, t = new URLSearchParams(location.hash.slice(1)).get('t');
  try { if (t) sessionStorage.setItem(key, t); } catch {}
  if (t) history.replaceState(null, '', location.pathname + location.search);   // (the token leaves the address bar)
  try { return t || sessionStorage.getItem(key); } catch { return t; }
})();
const FILES = `/api/storykit/drafts/${draft || `repo-${id}`}/files/voice/`;
const PACK_URL = draft ? `/api/storykit/drafts/${draft}/pack` : `/storykit/packs/${id}.json`;

async function manifest(pack) {
  if (pack.voice && pack.voice.clips) return { clips: { ...pack.voice.clips } };
  try { const r = await fetch(`/storykit/packs/${id}/voice/manifest.json`, { cache: 'no-store' }); if (r.ok) { const m = await r.json(); if (m && m.clips) return m; } } catch {}
  return { clips: {} };
}
const clipUrl = (plan, c) => c.url || `/storykit/${plan.dir}${c.file}?v=${c.bytes}`;

// What the creator reads when the voices can't be made here. The model comes from Hugging Face, so a failed download
// is said plainly, without the browser's own error text.
function fallbackNote(reason = '') {
  if (/^model failed to load/.test(reason)) return 'The voice model could not be downloaded from Hugging Face just now. Your world still plays: its lines show as subtitles. Try again later to add the voices.';
  return `This computer can't make the voices (${reason}). Your world still plays: its lines show as subtitles.`;
}

function fail(msg) { S.state = 'error'; S.error = msg; $('#st').innerHTML = `<b>${esc(msg)}</b>`; }

(async () => {
  if (draft ? !/^[0-9a-f-]{36}$/.test(draft) : !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) return fail('Open this page with ?draft=<draft id> or ?pack=<pack id>.');
  if (draft && !token) return fail('This page needs the draft\'s token: open it from the world you are making.');
  let pack;
  try { const r = await fetch(PACK_URL, { cache: 'no-store' }); if (!r.ok) throw 0; pack = await r.json(); } catch { return fail(draft ? `No draft ${draft}.` : `No built pack called ${id} (npm run storykit:pack -- ${id}).`); }
  const plan = pack.voice;
  if (!plan || !plan.lines) return fail(`${id} has no voice plan: build it again (npm run storykit:pack -- ${id}).`);
  document.title = `${pack.title} voices`;
  $('#title').textContent = `${pack.title}: voices`;
  $('#cast').innerHTML = Object.entries(plan.cast).map(([name, c]) => `<div class="who"><b>${esc(name)}</b>${esc(c.block.description || '')}<br><code>${esc(Object.entries(c.block.blend).map(([v, w]) => `${v} ${Math.round(w * 100)}%`).join(' + '))} · speed ${c.block.speed} · pitch ${c.block.pitch > 0 ? '+' : ''}${c.block.pitch}</code></div>`).join('');

  let man = await manifest(pack);
  const row = new Map();
  $('#lines').innerHTML = plan.lines.map((l, i) => `<tr data-i="${i}"><td class="sp">${esc(l.who)}</td><td class="tx">${esc(l.text)}<small>${esc(l.id)}</small></td><td class="s"></td><td class="pl"></td></tr>`).join('');
  plan.lines.forEach((l, i) => row.set(l.clip, document.querySelector(`tr[data-i="${i}"]`)));
  const show = (l, status, note = '') => {
    const tr = row.get(l.clip); if (!tr) return;
    const s = tr.querySelector('.s'); s.className = `s ${status}`; s.innerHTML = `${status}${note ? `<small>${esc(note)}</small>` : ''}`;
    const c = man.clips[l.clip];
    tr.querySelector('.pl').innerHTML = c ? '<button>Play</button>' : '';
    if (c) tr.querySelector('.pl button').onclick = () => new Audio(clipUrl(plan, c)).play();
  };
  // (a line a shipped person recorded with these words plays that recording: never rendered, storykit/pack/registry.ts)
  const isReady = (l) => !!l.rec || !!man.clips[l.clip];
  for (const l of plan.lines) show(l, isReady(l) ? 'ready' : 'pending', isReady(l) ? (l.rec ? `recorded, ${(l.secs || 0).toFixed(1)} s` : `${man.clips[l.clip].secs?.toFixed(1)} s`) : '');

  const pass = createVoicePass({
    ...(Q.get('model') === 'local' ? LOCAL_FILES : {}),
    encode: (y) => encodeClip(y),
    onProgress: (p) => {
      log(p);
      if (p.stage === 'download' && p.total) { $('#st').innerHTML = `Loading the voice model: <b>${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB</b>`; $('#pg').style.width = `${(100 * p.loaded / p.total).toFixed(1)}%`; }
      if (p.stage === 'loaded') { S.device = p.device; S.dtype = p.dtype; S.loadS = p.seconds; }
      if (p.stage === 'phonemizer') S.phonemizer = true;
      if (p.stage === 'render') { $('#st').innerHTML = `Rendering <b>${p.done} / ${p.total}</b> · ${p.xRealtime.toFixed(1)}x real time · about ${Math.ceil(p.etaS)} s left`; $('#pg').style.width = `${(100 * p.done / p.total).toFixed(1)}%`; }
      if (p.stage === 'fallback') { S.fallback = p.reason; S.note = fallbackNote(p.reason); $('#sub').textContent = S.note; }
    },
    async onClip(line, clip) {
      const l = plan.lines.find((x) => x.id === line.id); if (!l) return;
      const file = `${l.clip}.${clip.ext}`;
      const r = await fetch(FILES + file, { method: 'PUT', body: clip.blob, headers: { 'content-type': clip.blob.type, ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-voice-secs': String(clip.seconds), 'x-voice-render-ms': String(Math.round(clip.renderMs || 0)), 'x-voice-encode-ms': String(Math.round(clip.encodeMs || 0)),
        'x-voice-device': String(pass.device || S.device || ''), 'x-voice-dtype': String(S.dtype || '') } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`store ${file}: ${r.status} ${e.error || ''}`); }
      const out = await r.json(), entry = out.entry || { file, url: out.file.url, bytes: out.file.bytes, ...(out.file.meta || {}) };
      man.clips[l.clip] = entry;
      S.made.push({ line: l.id, file, secs: clip.seconds, bytes: entry.bytes, codec: entry.codec, renderMs: clip.renderMs ?? null, encodeMs: clip.encodeMs ?? null, cached: clip.cached });
      show(l, 'ready', `${clip.seconds.toFixed(1)} s · ${(entry.bytes / 1024).toFixed(1)} KB${clip.cached ? ' · from this browser' : ''}`);
    }
  });

  const todo = () => plan.lines.filter((l) => !isReady(l));
  const idle = () => {
    const n = todo().length; S.lines = plan.lines.length; S.todo = n;
    $('#go').disabled = n === 0;
    $('#st').innerHTML = n ? `<b>${n}</b> of ${plan.lines.length} lines have no voice yet` : `All <b>${plan.lines.length}</b> lines are voiced`;
    $('#pg').style.width = `${(100 * (plan.lines.length - n) / plan.lines.length).toFixed(1)}%`;
  };
  const p0 = await pass.plan();
  S.plan = p0; idle();
  if (p0.mode !== 'kokoro') $('#sub').textContent = S.note = fallbackNote(p0.reason);
  else $('#sub').textContent = `Renders on this computer with ${p0.device === 'webgpu' ? 'the GPU (WebGPU)' : 'the CPU (WebAssembly)'}${p0.downloadBytes ? `, after a ${(p0.downloadBytes / 1e6).toFixed(0)} MB one-time download from Hugging Face` : ''}. Lines without a clip play as subtitles.`;
  S.state = 'idle';

  async function render() {
    const list = todo(); if (!list.length) return;
    $('#go').disabled = true; S.state = 'rendering';
    for (const l of list) show(l, 'rendering');
    const voices = Object.fromEntries(Object.entries(plan.cast).map(([, c]) => [c.voice, c.block]));
    const t0 = performance.now();
    const out = await pass.run({ lines: list.map((l) => ({ id: l.id, speaker: l.voice, text: l.text })), voices });
    S.seconds = (performance.now() - t0) / 1000; S.audioSeconds = out.audioSeconds; S.mode = out.mode; S.failed = out.failed;
    S.phonemizerFetched = performance.getEntriesByType('resource').some((e) => /gpl\/phonemizer\.js/.test(e.name));
    for (const f of out.failed) { const l = plan.lines.find((x) => x.id === f.id); if (l) show(l, 'failed', f.error); }
    for (const l of todo()) if (!out.failed.some((f) => f.id === l.id)) show(l, 'pending', out.reason || '');
    idle(); S.state = 'done';
  }
  $('#go').onclick = render;
  if (Q.get('auto') === '1' && p0.mode === 'kokoro') render();
  else if (Q.get('auto') === '1') S.state = 'done';
})().catch((e) => fail(String(e && e.message || e)));
