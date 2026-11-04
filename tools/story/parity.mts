// Mog City: the story pack's parity check in real Chrome (tools/story/README.md, test (c)). Each entry point is played
// twice, with ?story=off (no pack: every story call returns its input) and with the default pack, and what was said is
// compared: the subtitles in order (speaker label and words, as drawn), the voice files played (W.voice.log ids), the
// place, title and caption cards, the objective line. Equal, or the change does not ship.
//   cd ~/Desktop/GameMog && node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts \
//     $PWD/MogCity/tools/story/parity.mts http://127.0.0.1:4961/ 'nogate&trailer=0:90,m1=drive:45' out.json
// (entry:seconds, comma separated; one headless Chrome, under the shared lock; a run must stay under 5 min)
import { withBrowser } from '../../../lib/browser.ts';
import fs from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, LIST, OUT] = process.argv.slice(2);
const ready = '!!(window.__NYC_APP && window.__NYC_APP.ready && window.WAGMI && window.WAGMI.ready)';
// (what is on screen, logged as it changes: each overlay's text when it shows)
const HOOK = `window.__said = []; window.__errs = [];
addEventListener('error', (e) => window.__errs.push(String(e.message || e).slice(0, 200)), true);
addEventListener('unhandledrejection', (e) => window.__errs.push('rej ' + String(e.reason).slice(0, 200)));
{ const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push('console ' + a.map(String).join(' ').slice(0, 200)); ce(...a); }; }
const last = {};
setInterval(() => {
  for (const [k, sel] of [['sub', '#wg .wg-sub'], ['obj', '#wg .wg-obj'], ['place', '#wg .wg-place.on'], ['title', '#wg .wg-title.on'], ['cap', '#wg .wg-cap.on'], ['help', '#wg .wg-help.on'], ['dm', '#wg .wg-dm.on'], ['caller', '#wg .wg-caller.on']]) {
    const e = document.querySelector(sel); if (!e) { last[k] = null; continue; }
    if (e.classList.contains('hide')) { last[k] = null; continue; }
    const t = e.textContent.replace(/\\s+/g, ' ').trim(); if (!t || t === last[k]) continue;
    last[k] = t; window.__said.push(k + ' ' + t);
  }
}, 50);`;

const out: Record<string, any> = {};
await withBrowser(async (page) => {
  await page.preload(HOOK);
  await page.emulate({ width: 1280, height: 720 });
  for (const item of LIST.split(',')) {
    const [entry, secs = '40'] = item.split(':');
    for (const v of ['story=off', 'story=']) {
      const q = v === 'story=' ? entry : `${v}&${entry}`;
      await page.goto(`${BASE}?${q}`);
      let ok = false;
      for (let t = 0; t < 300; t++) { if ((ok = await page.eval<boolean>(ready).catch(() => false))) break; await sleep(200); }
      // (no key or click: the browser runs with autoplay allowed, so the voices play from the subtitles as they come)
      await sleep(+secs * 1000);
      const got = await page.eval<any>(`({ said: window.__said, voice: (WAGMI.voice?.log || []).map((l) => l.id), synth: WAGMI.voice?.synthLog || [], story: window.__mcStory, errs: window.__errs, audio: WAGMI.audio?.ctx?.state || null })`).catch((e: any) => ({ evalErr: String(e) }));
      (out[entry] ||= {})[v === 'story=' ? 'pack' : 'off'] = { ok, ...got };
      console.log('RUN', entry, v, JSON.stringify({ ok, lines: got.said?.length, voice: got.voice?.length, synth: got.synth?.length, story: got.story, audio: got.audio, errs: got.errs }).slice(0, 300));
    }
    const a = out[entry].off, b = out[entry].pack;
    // (the voice log keeps the last 60; the overlays' log all of it)
    // (each overlay's own sequence: two that change in the same 50 ms poll can log in either order)
    const chans = (l: string[] = []) => { const m: Record<string, string[]> = {}; for (const x of l) (m[x.split(' ')[0]] ||= []).push(x); return JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k]])); };
    const same = chans(a.said) === chans(b.said) && JSON.stringify(a.voice) === JSON.stringify(b.voice);
    out[entry].same = same;
    console.log('PARITY', entry, same ? 'IDENTICAL' : 'DIFFERENT', `${a.said?.length} shown, ${a.voice?.length} voiced`);
    if (!same) for (let i = 0; i < Math.max(a.said.length, b.said.length); i++) if (a.said[i] !== b.said[i]) { console.log('  first difference at', i, '\n   off:', a.said[i], '\n  pack:', b.said[i]); break; }
  }
}, { width: 1280, height: 720, timeoutMs: 295_000 });
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
process.exit(0);
