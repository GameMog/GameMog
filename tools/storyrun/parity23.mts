// Mog City story runner: Missions 2 and 3, the shipped game and Mog City's own story as a world (packs/mog-city.json) at
// the same moments, for side-by-side shots (under the shared Chrome lock, from the GameMog checkout):
//   node --import ./scripts/ts-resolve.mjs <lock> tools/storyrun/parity23.mts <base url> ship|pack <shots prefix> <moments>
// moments (comma list): m2meet (Jane at Bryant Park, 14 s into the meeting), m2tail (the tail meter behind the van),
// m2yard (the lookouts' cones), m2fight (the yard fight), m2chase (Mack bolting), m2chat (Mack's phone, the group
// chat), m2passed (MISSION PASSED · Burner); m3garage (Gears under the car), m3rigs (the rigs and the Suits), m3escape
// (HEAT 2, the Suits' cars), m3passed (home, then MISSION PASSED · Occupied). The shipped game starts each at its own
// switch (?nointro&m2=... / ?m3=...), the world at its step (&mission=M2&step=...). Prints the page's errors per moment
// and what was on screen.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// (GameMog's headless Chrome driver: run from a GameMog checkout, or set GAMEMOG_DIR)
const { withBrowser } = await import(new URL('lib/browser.ts', pathToFileURL((process.env.GAMEMOG_DIR || process.cwd()) + '/')).href);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, MODE, OUT, LIST = 'm2meet'] = process.argv.slice(2);
const PACK = '?pack=/packs/mog-city.json&nogate&trailer=0';
const url = (ship: string, step: string) => BASE + (MODE === 'ship' ? `?nogate&trailer=0&nointro${ship}` : `${PACK}${step}`);
const ready = `!!(window.__NYC_APP && __NYC_APP.ready && window.WAGMI && WAGMI.ready)`;
const SEEN = `(() => { const q = (s) => { const e = document.querySelector(s); return e && !e.classList.contains('hide') ? e.textContent.trim().slice(0, 120) : null; }; return { obj: q('#wg .wg-obj'), sub: q('#wg .wg-sub'), caller: q('#wg .wg-caller.on'), big: q('#wg .wg-big.on'), counter: q('#wg .wg-counter'), mode: __NYC_APP.controllerManager.activeMode, phase: WAGMI.mission && WAGMI.mission.phase, errs: window.__errs.splice(0) }; })()`;
const M: Record<string, [string, string, (p: any, u: any) => Promise<void>]> = {
  m2meet: ['&m2=start', '&mission=M2&step=start', async (p, u) => { await u(`!!WAGMI.cutscene`, 30); await sleep(14000); }],
  m2tail: ['&m2=tail', '&mission=M2&step=tail', async (p, u) => { await u(`__NYC_APP.controllerManager.activeMode === 'car'`, 30); await sleep(3000); await p.key('KeyW', 'keyDown'); await sleep(1800); await p.key('KeyW', 'keyUp'); await sleep(2500); }],
  m2yard: ['&m2=yard', '&mission=M2&step=yard', async (p, u) => { await u(`!!document.querySelector('#wg .wg-obj') && /stash/.test(document.querySelector('#wg .wg-obj').textContent)`, 30); await sleep(2500); }],
  m2fight: ['&m2=fight', '&mission=M2&step=fight', async (p, u) => { await u(`!!(WAGMI.combat && WAGMI.combat.enemies.filter((e) => e.alive).length >= 3)`, 30); await sleep(4500); }],
  m2chase: ['&m2=chase', '&mission=M2&step=chase', async (p, u) => { await u(`__NYC_APP.controllerManager.activeMode === 'car' && /Mack/.test(document.querySelector('#wg .wg-obj')?.textContent || '')`, 30); await sleep(1500); await p.key('KeyW', 'keyDown'); await sleep(4000); await p.key('KeyW', 'keyUp'); }],
  m2chat: ['&m2=phone', '&mission=M2&step=phone', async (p, u) => { await u(`!!document.querySelector('#wg .wg-obj') && /phone/.test(document.querySelector('#wg .wg-obj').textContent)`, 30); await sleep(1500); await p.eval(`(() => { const S = (WAGMI._m2part && WAGMI._m2part.S) || WAGMI.mission.S, q = S.phone.position, P = WAGMI.person; P.position.x = q.x + 1.1; P.position.z = q.z + 0.4; P.heading = Math.atan2(q.x - P.position.x, q.z - P.position.z); })()`); await sleep(400); await p.key('KeyF', 'keyDown'); await sleep(1600); await p.key('KeyF', 'keyUp'); await u(`!!WAGMI.cutscene`, 10); await sleep(9000); }],
  m2passed: ['&m2=phone', '&mission=M2&step=phone', async (p, u) => { await u(`!!document.querySelector('#wg .wg-obj') && /phone/.test(document.querySelector('#wg .wg-obj').textContent)`, 30); await sleep(1500); await p.eval(`(() => { const S = (WAGMI._m2part && WAGMI._m2part.S) || WAGMI.mission.S, q = S.phone.position, P = WAGMI.person; P.position.x = q.x + 1.1; P.position.z = q.z + 0.4; P.heading = Math.atan2(q.x - P.position.x, q.z - P.position.z); })()`); await sleep(400); await p.key('KeyF', 'keyDown'); await sleep(1600); await p.key('KeyF', 'keyUp'); await u(`!!WAGMI.cutscene`, 10); await sleep(1500); await p.eval(`WAGMI.cineSkip && WAGMI.cineSkip()`); await u(`!!document.querySelector('#wg .wg-big.on')`, 20); await sleep(1600); }],
  m3garage: ['&m3=garage', '&mission=M3&step=garage', async (p, u) => { await u(`!!WAGMI.cutscene`, 30); await sleep(12000); }],
  m3rigs: ['&m3=rigs', '&mission=M3&step=rigs', async (p, u) => { await u(`!!document.querySelector('#wg .wg-obj') && /rigs/.test(document.querySelector('#wg .wg-obj').textContent)`, 40); await sleep(5000); }],
  m3escape: ['&m3=escape', '&mission=M3&step=escape', async (p, u) => { await u(`!!document.querySelector('#wg .wg-obj') && /Suits/.test(document.querySelector('#wg .wg-obj').textContent)`, 40); await p.key('KeyW', 'keyDown'); await sleep(3500); await p.key('KeyW', 'keyUp'); await sleep(1500); }],
  m3passed: ['&m3=return', '&mission=M3&step=ret', async (p, u) => { await u(`__NYC_APP.controllerManager.activeMode === 'car' && !!document.querySelector('#wg .wg-obj') && /garage/.test(document.querySelector('#wg .wg-obj').textContent)`, 40); await sleep(1000); await p.eval(`(() => { const c = WAGMI.car; c.position.set(-1560, c.position.y, 1604.6); c.mesh.position.copy(c.position); c.speed = 0; })()`); await u(`!!WAGMI.cutscene`, 15); await sleep(2500); await p.eval(`WAGMI.cineSkip && WAGMI.cineSkip()`); await u(`!!document.querySelector('#wg .wg-big.on')`, 20); await sleep(1600); }],
};
await withBrowser(async (page) => {
  await page.preload(`window.__errs=[]; addEventListener('error',(e)=>window.__errs.push(String(e.message||e).slice(0,200)),true); addEventListener('unhandledrejection',(e)=>window.__errs.push('rej '+String(e.reason && e.reason.stack || e.reason).slice(0,300))); { const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push('console '+a.map((x)=>x&&x.stack||String(x)).join(' ').slice(0,300)); ce(...a); }; }`);
  await page.emulate({ width: 1280, height: 720 });
  const until = async (expr: string, secs: number) => { for (let i = 0; i < secs * 5; i++) { if (await page.eval<boolean>(expr).catch(() => false)) return true; await sleep(200); } return false; };
  for (const name of LIST.split(',')) {
    const m = M[name]; if (!m) { console.log('no moment', name); continue; }
    const t0 = Date.now(); await page.goto(url(m[0], m[1]));
    const ok = await until(ready, 60);
    await m[2](page, until).catch((e: any) => console.log('moment', name, String(e)));
    writeFileSync(`${OUT}-${name}.jpg`, await page.screenshot(80));
    const s = await page.eval<any>(SEEN).catch((e: any) => ({ evalErr: String(e) }));
    console.log('SHOT', MODE, name, ok, ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(s).slice(0, 600));
  }
}, { width: 1280, height: 720, timeoutMs: 232_000 });
process.exit(0);
