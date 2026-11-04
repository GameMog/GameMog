// Mog City: render sheets of a story pack in real Chrome (tools/story/README.md, test (d)). Shots of the title gate,
// the opening (by its own clock), the park arrival and Jane's first call with the pack, laid out on one sheet per run;
// and what was said: the subtitles shown, the recordings played (W.voice.log) and the lines the browser's voice spoke
// (W.voice.synthLog), and any old name still on screen (a leak).
//   cd ~/Desktop/GameMog && node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts \
//     $PWD/MogCity/tools/story/sheets.mts http://127.0.0.1:4961/ /tools/story/test-packs/sample.json <outDir> title,opening
// (parts: title, opening, arrival, call; one headless Chrome under the shared lock, each run under 5 min)
import { withBrowser } from '../../../lib/browser.ts';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, PACK, OUT, PARTS = 'title,opening,arrival,call'] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const ready = '!!(window.__NYC_APP && window.__NYC_APP.ready && window.WAGMI && window.WAGMI.ready)';
// (the old names: none of them should be on screen with a pack that renames everyone)
const OLD = ['Dan', 'DAN', 'Jane', 'JANE', 'Mr. Big', 'MR. BIG', 'Knox', 'Hooks', 'JPBank', 'JPBANK', 'Gears', 'Fiona', 'Mack', 'Rook', 'Moon', 'Unfinished Business', 'UNFINISHED BUSINESS'];
const HOOK = `window.__said = []; window.__errs = []; window.__leaks = [];
addEventListener('error', (e) => window.__errs.push(String(e.message || e).slice(0, 200)), true);
addEventListener('unhandledrejection', (e) => window.__errs.push('rej ' + String(e.reason).slice(0, 200)));
const OLD = ${JSON.stringify(OLD)}, re = new RegExp('(?<![A-Za-z])(' + OLD.map((w) => w.replace(/[.]/g, '\\\\.')).join('|') + ')(?![A-Za-z])');
const last = {};
setInterval(() => {
  for (const [k, sel] of [['sub', '#wg .wg-sub'], ['obj', '#wg .wg-obj'], ['place', '#wg .wg-place.on'], ['title', '#wg .wg-title.on'], ['cap', '#wg .wg-cap.on'], ['help', '#wg .wg-help.on'], ['dm', '#wg .wg-dm.on'], ['caller', '#wg .wg-caller.on'], ['phone', '#wg .wg-phone.on'], ['gate', '#wg .wg-gtitle.on']]) {
    const e = document.querySelector(sel); if (!e || e.classList.contains('hide')) { last[k] = null; continue; }
    const t = e.textContent.replace(/\\s+/g, ' ').trim(); if (!t || t === last[k]) continue;
    last[k] = t; window.__said.push(k + ' ' + t);
    const m = re.exec(t); if (m) window.__leaks.push(k + ': ' + m[1] + ' in "' + t.slice(0, 120) + '"');
  }
}, 50);`;
const story = `story=${encodeURIComponent(PACK)}`;
const shots: { file: string; label: string }[] = [];
const report: Record<string, any> = {};

await withBrowser(async (page) => {
  await page.preload(HOOK);
  await page.emulate({ width: 1280, height: 720 });
  const shot = async (name: string, label: string) => { const f = path.join(OUT, name + '.jpg'); fs.writeFileSync(f, await page.screenshot(80)); shots.push({ file: f, label }); };
  const open = async (q: string) => {
    await page.goto(`${BASE}?${story}&${q}`);
    for (let t = 0; t < 300; t++) { if (await page.eval<boolean>(ready).catch(() => false)) return true; await sleep(200); }
    return false;
  };
  const collect = async (part: string) => {
    report[part] = await page.eval<any>(`({ said: window.__said, leaks: [...new Set(window.__leaks)], voice: (WAGMI.voice?.log || []).map((l) => l.id), synth: WAGMI.voice?.synthLog || [], story: window.__mcStory, errs: window.__errs, title: document.title })`).catch((e: any) => ({ evalErr: String(e) }));
    const r = report[part];
    console.log('PART', part, JSON.stringify({ shown: r.said?.length, voiced: r.voice?.length, synth: r.synth?.length, leaks: r.leaks, errs: r.errs, story: r.story, title: r.title }).slice(0, 600));
  };
  const until = async (expr: string, secs: number) => { for (let i = 0; i < secs * 10; i++) { if (await page.eval<boolean>(expr).catch(() => false)) return true; await sleep(100); } return false; };
  for (const part of PARTS.split(',')) {
    if (part === 'title') {
      // the start gate over the live city: MOG CITY over the pack's episode
      await open(''); await until(`!!document.querySelector('#wg .wg-gtitle.on')`, 20); await sleep(2500);
      await shot('title', 'The title gate'); await collect(part);
    } else if (part === 'opening') {
      // the opening, by its own clock: the place card and Dan's first line, the Suits, Mr. Big's call, the title card
      await open('nogate&trailer=0');
      for (const [t, name, label] of [[14.6, 'opening-1', 'Opening 0:14 · first line, caption'], [27.2, 'opening-2', 'Opening 0:27 · the Suits'], [52.5, 'opening-3', "Opening 0:52 · the boss's call"], [57.8, 'opening-4', 'Opening 0:57 · his caption'], [78.6, 'opening-5', 'Opening 1:18 · the title card']] as const) {
        await until(`(WAGMI.intro?.t ?? 0) >= ${t}`, 100); await shot(name, label);
      }
      await collect(part);
    } else if (part === 'arrival') {
      // Mission 1: the park, the swap scene
      await open('m1=arrival');
      for (const [s, name] of [[6, 'arrival-1'], [12, 'arrival-2'], [18, 'arrival-3']] as const) { await sleep(s === 6 ? 6000 : 6000); await shot(name, `The park arrival · ${s} s`); }
      await sleep(10000); await collect(part);
    } else if (part === 'call') {
      // Mission 1's drive: Jane's first call on the car phone, its card and her lines
      await open('m1=drive');
      await until(`!!document.querySelector('#wg .wg-caller.on') && !!document.querySelector('#wg .wg-sub:not(.hide)')`, 40);
      await sleep(400); await shot('call-1', 'The first call · the card and a line');
      await sleep(5000); await shot('call-2', 'The first call · 5 s on');
      await sleep(12000); await collect(part);
    }
  }
  // the sheet: every shot, labelled, on one page
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111;color:#eee;font:600 15px system-ui"><div style="padding:10px 14px;font-size:18px">Story pack ${PACK} · ${new Date().toISOString().slice(0, 16)}</div>
<div style="display:grid;grid-template-columns:repeat(2,640px);gap:8px;padding:0 8px 8px">${shots.map((s) => `<figure style="margin:0"><img src="${path.basename(s.file)}" style="width:640px;height:360px;display:block"><figcaption style="padding:3px 2px">${s.label}</figcaption></figure>`).join('')}</div></body>`;
  const sheet = path.join(OUT, `sheet-${PARTS.replace(/,/g, '-')}.html`); fs.writeFileSync(sheet, html);
  const rows = Math.ceil(shots.length / 2);
  await page.emulate({ width: 1296, height: 50 + rows * 392 });
  await page.goto('file://' + sheet); await sleep(1200);
  fs.writeFileSync(sheet.replace(/\.html$/, '.jpg'), await page.screenshot(82));
  console.log('SHEET', sheet.replace(/\.html$/, '.jpg'));
}, { width: 1280, height: 720, timeoutMs: 295_000 });
fs.writeFileSync(path.join(OUT, `report-${PARTS.replace(/,/g, '-')}.json`), JSON.stringify(report, null, 1));
process.exit(0);
