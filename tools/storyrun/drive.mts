// Mog City story runner: a world's test drive in headless Chrome, for development (run under the shared Chrome lock):
//   node --import ./scripts/ts-resolve.mjs <lock> tools/storyrun/drive.mts <base url> <world path> <shots prefix> [secs] [extra query]
// Loads <base>?pack=<world>&nogate&trailer=0&autopilot=1&autocard=1&flowfast=1, plays up to secs (default 200), and
// prints every host message (ready, progress, mission-start/-end/-fail, story-end), the page's errors and a JPEG every
// 20 s (and at each mission's first travel step) to <shots prefix>-<n>.jpg.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// (GameMog's headless Chrome driver: run from a GameMog checkout, or set GAMEMOG_DIR)
const { withBrowser } = await import(new URL('lib/browser.ts', pathToFileURL((process.env.GAMEMOG_DIR || process.cwd()) + '/')).href);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, WORLD, SHOTS, SECS = '200', EXTRA = ''] = process.argv.slice(2);
// (extra 'flowfast=0': the free roam between missions played too, the test drive driving into the next one's corona)
const FF = /(^|&)flowfast=0(&|$)/.test(EXTRA) ? '' : '&flowfast=1';
const url = `${BASE}?pack=${encodeURIComponent(WORLD)}&nogate&trailer=0&autopilot=1&autocard=1${FF}${EXTRA ? '&' + EXTRA.replace(/(^|&)flowfast=0(?=&|$)/, '') : ''}`;
await withBrowser(async (page) => {
  await page.preload(`window.__errs=[]; addEventListener('error',(e)=>window.__errs.push(String(e.message||e).slice(0,240)),true); addEventListener('unhandledrejection',(e)=>window.__errs.push('rej '+String(e.reason && e.reason.stack || e.reason).slice(0,300))); { const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push('console '+a.map((x)=>x&&x.stack||String(x)).join(' ').slice(0,300)); ce(...a); }; const cw = console.warn.bind(console); console.warn = (...a) => { (window.__warns=window.__warns||[]).push(a.map(String).join(' ').slice(0,200)); cw(...a); }; const ci = console.info.bind(console); console.info = (...a) => { (window.__warns=window.__warns||[]).push('info '+a.map(String).join(' ').slice(0,200)); ci(...a); }; }`);
  await page.emulate({ width: 1280, height: 720 });
  const t0 = Date.now();
  await page.goto(url);
  let seen = 0, shot = 0, lastShot = 0, lastPhase = '';
  const shoot = async (tag: string) => { const b = await page.screenshot(70); writeFileSync(`${SHOTS}-${String(++shot).padStart(2, '0')}-${tag}.jpg`, b); };
  while (Date.now() - t0 < +SECS * 1000) {
    await sleep(1000);
    const st = await page.eval<any>(`(() => { const S = window.WAGMI && WAGMI.storyrun; return { ready: !!(window.WAGMI && WAGMI.ready), log: S ? S.host.slice(${seen}) : [], phase: WAGMI && WAGMI.mission && WAGMI.mission.phase, mid: WAGMI && WAGMI.mission && WAGMI.mission.id, mode: window.__NYC_APP && __NYC_APP.controllerManager.activeMode, errs: window.__errs.splice(0), warns: (window.__warns||[]).splice(0), ap: S && S.autopilot ? S.autopilot.log.splice(0) : [] }; })()`).catch((e: any) => ({ evalErr: String(e) }));
    if (st.evalErr) continue;
    for (const m of st.log) {
      console.log('MSG', JSON.stringify(m).slice(0, 300)); seen++;
      if (m.type === 'keyart' && m.wide) {
        const b64 = await page.eval<string>(`(() => { const a = new Uint8Array(WAGMI.storyrun.keyart.wide); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); })()`).catch(() => '');
        if (b64) { writeFileSync(`${SHOTS}-keyart-wide.jpg`, Buffer.from(b64, 'base64')); console.log('KEYART', `${SHOTS}-keyart-wide.jpg`); }
      }
    }
    for (const e of st.errs) console.log('ERR', e);
    for (const w of st.warns) if (/storyrun|missions|calls|cast/.test(w)) console.log('WARN', w);
    for (const a of st.ap) console.log('AP', JSON.stringify(a));
    const ph = `${st.mid}:${st.phase}`;
    if (ph !== lastPhase) { console.log('PHASE', ((Date.now() - t0) / 1000).toFixed(0) + 's', ph, st.mode); lastPhase = ph; }
    if (st.ready && Date.now() - lastShot > 20000) { lastShot = Date.now(); await shoot(String(st.phase || 'x').replace(/[^a-z0-9-]+/gi, '_')); }
    if (st.log.some((m: any) => m.type === 'story-end' || (m.type === 'mission-end' && m.how === 'fail'))) { await sleep(2500); await shoot('end'); break; }
  }
  console.log('DONE', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}, { width: 1280, height: 720, timeoutMs: 235_000 });
process.exit(0);
