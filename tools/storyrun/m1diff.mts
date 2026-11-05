// Mog City story runner: Mission 1's three small differences (PROOF.md), checked in the shipped game (?m1=drive) and the
// world (&step=drive) alike (under the shared Chrome lock):
//   node --import ./scripts/ts-resolve.mjs <lock> tools/storyrun/m1diff.mts <base url> ship|pack <shots prefix>
// getin: the ride's get-in played (the door, WAGMI.ride.phase) before he is at the wheel; area: the Garment District's
// place card on the drive (the car put on 8th Ave there); van: the Suits' van at the park once 320 m out (not before).
import { withBrowser } from '/Users/sheed/Desktop/GameMog/lib/browser.ts';
import { writeFileSync } from 'node:fs';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE, MODE, OUT] = process.argv.slice(2);
const url = BASE + (MODE === 'ship' ? '?nogate&trailer=0&m1=drive' : '?pack=/packs/mog-city.json&nogate&trailer=0&step=drive');
await withBrowser(async (page) => {
  await page.preload(`window.__errs=[]; window.__ride=[]; addEventListener('error',(e)=>window.__errs.push(String(e.message||e).slice(0,200)),true); addEventListener('unhandledrejection',(e)=>window.__errs.push('rej '+String(e.reason && e.reason.stack || e.reason).slice(0,300)));`);
  await page.emulate({ width: 1280, height: 720 });
  const until = async (expr: string, secs: number) => { for (let i = 0; i < secs * 10; i++) { if (await page.eval<boolean>(expr).catch(() => false)) return true; await sleep(100); } return false; };
  await page.goto(url);
  await until(`!!(window.WAGMI && WAGMI.ready && WAGMI.ride)`, 60);
  const sawRide = await until(`!!WAGMI.ride.phase`, 15);
  if (sawRide) { await sleep(700); writeFileSync(`${OUT}-getin.jpg`, await page.screenshot(80)); }
  await until(`__NYC_APP.controllerManager.activeMode === 'car' && !WAGMI.ride.phase`, 15);
  await sleep(1500);
  const vanAtStart = await page.eval<boolean>(`!!(WAGMI.cast && WAGMI.cast.van.group.visible)`).catch(() => null);
  const put = (x: number, z: number, h: number) => page.eval(`(() => { const c = WAGMI.car, cm = __NYC_APP.controllerManager; c.position.set(${x}, cm.getGroundHeight(${x}, ${z}, 'car'), ${z}); c.heading = ${h}; c.speed = 0; c.vx = c.vz = 0; c.mesh.position.copy(c.position); c.mesh.rotation.y = ${h}; WAGMI.person.position.copy(c.position); __NYC_APP.cameraSystem.resetForTeleport && __NYC_APP.cameraSystem.resetForTeleport(); })()`);
  // (8th Ave by W 36th St: the Garment District)
  await put(-560, 560, Math.PI); await sleep(1200);
  const area = await page.eval<string>(`(() => { const e = document.querySelector('#wg .wg-place'); return e ? e.textContent.trim() : ''; })()`);
  writeFileSync(`${OUT}-area.jpg`, await page.screenshot(80));
  // (9th Ave 380 m from the park: no van yet; then 300 m: the van)
  await put(-1134, 780, Math.PI); await sleep(900);
  const van380 = await page.eval<boolean>(`!!(WAGMI.cast && WAGMI.cast.van.group.visible)`).catch(() => null);
  await put(-1134, 862, Math.PI); for (let i = 0; i < 30 && !(await page.eval<boolean>(`!!(WAGMI.cast && WAGMI.cast.van.group.visible)`).catch(() => false)); i++) await sleep(200);
  const van300 = await page.eval<any>(`[!!WAGMI.cast, !!(WAGMI.cast && WAGMI.cast.van.group.visible)]`).catch(() => null);
  writeFileSync(`${OUT}-van.jpg`, await page.screenshot(80));
  const errs = await page.eval<string[]>(`window.__errs`);
  console.log('M1DIFF', MODE, JSON.stringify({ getIn: sawRide, vanAtStart, area, van380, van300, errs }));
}, { width: 1280, height: 720, timeoutMs: 150_000 });
process.exit(0);
