// Mog City story runner: a world's moments as stills, for review (run under the shared Chrome lock, from the GameMog checkout):
//   node --import ./scripts/ts-resolve.mjs <lock> tools/storyrun/moments.mts <base url> <world path> <shots prefix> [extra query]
// 1 the start gate (MOG CITY's lettering, the world's title) -> <prefix>-title.jpg
// 2 the first mission under the test drive (&autopilot=1, no short cards): the first call on its caller card
//   (-call), the choice panel (-choice), the car moving at night (-drive), the cutscene's close-up (-cutscene, its second
//   shot), MISSION PASSED (-passed). Prints what was on screen at each and the page's errors.
import { withBrowser } from '/Users/sheed/Desktop/GameMog/lib/browser.ts';
import { writeFileSync } from 'node:fs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, WORLD, OUT, EXTRA = ''] = process.argv.slice(2);
const q = `?pack=${encodeURIComponent(WORLD)}${EXTRA ? '&' + EXTRA : ''}&trailer=0`;
const SEEN = `(() => { const q = (s) => { const e = document.querySelector(s); return e && !e.classList.contains('hide') ? e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 140) : null; }; const S = WAGMI.storyrun, M = S && S.runner.M; return { step: M && M.def.id + ':' + (M.def.steps[M.i] || {}).type, obj: q('#wg .wg-obj'), sub: q('#wg .wg-sub'), caller: q('#wg .wg-caller'), big: q('#wg .wg-big.on'), mode: __NYC_APP.controllerManager.activeMode, mph: Math.round(Math.abs(WAGMI.car.speed || 0) * 2.237), errs: window.__errs.splice(0) }; })()`;
await withBrowser(async (page) => {
  await page.preload(`window.__errs=[]; addEventListener('error',(e)=>window.__errs.push(String(e.message||e).slice(0,200)),true); addEventListener('unhandledrejection',(e)=>window.__errs.push('rej '+String(e.reason && e.reason.stack || e.reason).slice(0,300))); { const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push('console '+a.map((x)=>x&&x.stack||String(x)).join(' ').slice(0,300)); ce(...a); }; }`);
  await page.emulate({ width: 1280, height: 720 });
  const until = async (expr: string, secs: number) => { for (let i = 0; i < secs * 5; i++) { if (await page.eval<boolean>(expr).catch(() => false)) return true; await sleep(200); } return false; };
  const shot = async (name: string) => { writeFileSync(`${OUT}-${name}.jpg`, await page.screenshot(82)); console.log('SHOT', name, JSON.stringify(await page.eval<any>(SEEN).catch((e: any) => ({ evalErr: String(e) }))).slice(0, 600)); };
  // 1 the gate
  await page.goto(BASE + q);
  console.log('gate', await until(`!!document.querySelector('#wg .wg-gate.on') && !!(window.__NYC_APP && __NYC_APP.ready)`, 60));
  await sleep(2500); await shot('title');
  // 2 the first mission, the test drive
  await page.goto(BASE + q + '&nogate&autopilot=1&flowfast=1');
  await until(`!!(window.WAGMI && WAGMI.storyrun && WAGMI.storyrun.runner.M)`, 60);
  const t0 = Date.now(), done = new Set<string>();
  while (Date.now() - t0 < 170_000 && !done.has('passed')) {
    await sleep(250);
    const s = await page.eval<any>(`(() => { const S = WAGMI.storyrun, M = S.runner.M, d = M && M.def.steps[M.i]; const t = (x) => { const e = document.querySelector(x); return e && !e.classList.contains('hide') ? e.textContent : ''; }; return { type: d && d.type, cut: !!WAGMI.cutscene, caller: t('#wg .wg-caller'), sub: t('#wg .wg-sub'), choosing: !!S.hud.choosing, big: !!document.querySelector('#wg .wg-big.on'), car: __NYC_APP.controllerManager.activeMode === 'car', v: Math.abs(WAGMI.car.speed || 0) }; })()`).catch(() => null);
    if (!s) continue;
    if (!done.has('call') && /On call/i.test(s.caller) && s.sub) { done.add('call'); await sleep(500); await shot('call'); }
    if (!done.has('choice') && s.choosing) { done.add('choice'); await sleep(400); await shot('choice'); }
    if (!done.has('drive') && s.type === 'drive' && s.car && s.v > 9 && !s.cut && !s.caller && !s.choosing) { done.add('drive'); await shot('drive'); }
    if (!done.has('cutscene') && s.cut && /Engine|dead|carry|[a-z]{4,}/i.test(s.sub) && s.type === 'cutscene') { done.add('cutscene'); await sleep(1600); await shot('cutscene'); }
    if (!done.has('passed') && s.big) { done.add('passed'); await sleep(1500); await shot('passed'); }
  }
  console.log('DONE', [...done].join(','), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}, { width: 1280, height: 720, timeoutMs: 230_000 });
process.exit(0);
