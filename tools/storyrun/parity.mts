// Mog City story runner: the shipped game and Mog City's own story as a world (packs/mog-city.json) at the same moments,
// for side-by-side shots (run under the shared Chrome lock, from the GameMog checkout):
//   node --import ./scripts/ts-resolve.mjs <lock> tools/storyrun/parity.mts <base url> ship|pack <shots prefix> [moments]
// moments (comma list, default all): opening (the opening at 22 s: the van turning in), mrbig (52 s: Mr. Big in his
// study), call (Jane's car-phone call on the drive), fight (the Suits on the lawn), tracker + passed (the van searched:
// the tracker scene's close-up, then MISSION PASSED). The shipped game starts each at its own switch (?m1=...); the world
// at its step (&step=...). Prints the page's errors per moment and what was on screen (objective, line, caller, counter).
import { withBrowser } from '/Users/sheed/Desktop/GameMog/lib/browser.ts';
import { writeFileSync } from 'node:fs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, MODE, OUT, LIST = 'opening,call,fight,passed'] = process.argv.slice(2);
const PACK = '?pack=/packs/mog-city.json&nogate&trailer=0';
const url = (ship: string, step: string) => BASE + (MODE === 'ship' ? `?nogate&trailer=0${ship}` : `${PACK}${step}`);
const ready = `!!(window.__NYC_APP && __NYC_APP.ready && window.WAGMI && WAGMI.ready)`;
const SEEN = `(() => { const q = (s) => { const e = document.querySelector(s); return e && !e.classList.contains('hide') ? e.textContent.trim().slice(0, 120) : null; }; return { obj: q('#wg .wg-obj'), sub: q('#wg .wg-sub'), caller: q('#wg .wg-caller.on') || q('#wg .wg-caller'), big: q('#wg .wg-big.on'), mode: __NYC_APP.controllerManager.activeMode, phase: WAGMI.mission && WAGMI.mission.phase, errs: window.__errs.splice(0) }; })()`;
await withBrowser(async (page) => {
  await page.preload(`window.__errs=[]; addEventListener('error',(e)=>window.__errs.push(String(e.message||e).slice(0,200)),true); addEventListener('unhandledrejection',(e)=>window.__errs.push('rej '+String(e.reason && e.reason.stack || e.reason).slice(0,300))); { const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push('console '+a.map((x)=>x&&x.stack||String(x)).join(' ').slice(0,300)); ce(...a); }; }`);
  await page.emulate({ width: 1280, height: 720 });
  const until = async (expr: string, secs: number) => { for (let i = 0; i < secs * 5; i++) { if (await page.eval<boolean>(expr).catch(() => false)) return true; await sleep(200); } return false; };
  const shot = async (name: string) => { writeFileSync(`${OUT}-${name}.jpg`, await page.screenshot(80)); const s = await page.eval<any>(SEEN).catch((e: any) => ({ evalErr: String(e) })); console.log('SHOT', MODE, name, JSON.stringify(s).slice(0, 500)); };
  const load = async (q: string) => { const t0 = Date.now(); await page.goto(q); const ok = await until(ready, 60); console.log('LOAD', MODE, q, ok, ((Date.now() - t0) / 1000).toFixed(1) + 's'); return ok; };
  const want = new Set(LIST.split(','));
  if (want.has('opening') || want.has('mrbig')) {
    await load(url('', ''));
    // (the opening playing: held there, one frame at each moment; the same intro.js in both)
    console.log('intro', await until(`!!(WAGMI.intro && WAGMI.intro.playing)`, 40));
    await page.eval(`WAGMI.intro.pause(), WAGMI.intro.seek(22)`); await sleep(2500); await shot('opening');
    await page.eval(`WAGMI.intro.seek(52)`); await sleep(2500); await shot('mrbig');
  }
  if (want.has('call')) {
    await load(url('&m1=drive', '&step=drive'));
    await until(`__NYC_APP.controllerManager.activeMode === 'car' && !(WAGMI.ride && WAGMI.ride.phase)`, 20);
    await sleep(800);
    await page.key('KeyW', 'keyDown'); await sleep(2600); await page.key('KeyW', 'keyUp');
    const ok = await until(`(() => { const e = document.querySelector('#wg .wg-sub'); return !!e && /Fifth Avenue/.test(e.textContent) && !e.classList.contains('hide'); })()`, 25);
    console.log('call line', ok); await sleep(600); await shot('call');
  }
  if (want.has('fight')) {
    await load(url('&m1=fight', '&step=fight'));
    await until(`!!(WAGMI.combat && WAGMI.combat.enemies.filter((e) => e.alive).length >= 4)`, 20);
    await sleep(3500); await shot('fight');
  }
  if (want.has('passed') || want.has('tracker')) {
    await load(url('&m1=search', '&step=search'));
    await until(`(() => { const e = document.querySelector('#wg .wg-obj'); return !!e && /van/.test(e.textContent); })()`, 20);
    await sleep(1500);
    await page.eval(`(() => { const P = WAGMI.person, cm = __NYC_APP.controllerManager; P.position.set(-1240, cm.getGroundHeight(-1240, 1124.9, 'person'), 1124.9); P.heading = Math.PI; })()`);
    await sleep(500);
    await page.key('KeyF', 'keyDown'); await sleep(1800); await page.key('KeyF', 'keyUp');
    console.log('tracker', await until(`!!WAGMI.cutscene`, 10));
    await sleep(11500); await shot('tracker');
    console.log('passed', await until(`!!document.querySelector('#wg .wg-big.on')`, 15));
    await sleep(1400); await shot('passed');
  }
}, { width: 1280, height: 720, timeoutMs: 230_000 });
process.exit(0);
