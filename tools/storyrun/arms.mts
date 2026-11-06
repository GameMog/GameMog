// Mog City story runner: the hero's arms where arms should be, after every kind of beat (run under the shared Chrome
// lock, from the GameMog checkout):
//   node --import ./scripts/ts-resolve.mjs <lock> tools/storyrun/arms.mts <base url> [mission, PT-6] [shots prefix]
// Pickup Time from a save (the missions before <mission> done), under the test drive: after each step, once he is on
// foot and out of any cutscene (a call, a walk, a set's cutscene with his double, a fight, a search, a street cutscene,
// in and out of the car), his arms are sampled in his own frame and judged on their middle value: each wrist must hang below its shoulder (0.3 m or
// more) and out at its side, not inside his body (|x| at least 0.75 of the shoulder's: hand-built bodies' armhang bones
// once swung them in, the hands in front of the belly, nothing seen from behind). A fight's guard is let be. Then the
// car in and out three ways (the runner's putPlayer, the quick way out, the climb-out), standing after each.
// Prints each check and FAIL lines; exits 1 on any failure.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { withBrowser } = await import(new URL('lib/browser.ts', pathToFileURL((process.env.GAMEMOG_DIR || process.cwd()) + '/')).href);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE = 'http://127.0.0.1:4987/', MISSION = 'PT-6', SHOTS = ''] = process.argv.slice(2);
const WORLD = '/tools/storyrun/test-packs/pickup-time/world.json';
const ORDER = ['PT-1', 'PT-2', 'PT-3', 'PT-4', 'PT-5', 'PT-6', 'PT-7', 'PT-8', 'PT-9', 'PT-10', 'PT-11', 'PT-12', 'PT-13', 'PT-14', 'PT-15'];
const SEED = JSON.stringify({ v: 1, done: ORDER.slice(0, Math.max(0, ORDER.indexOf(MISSION))), meters: {}, flags: {}, at: Date.now() });
const url = `${BASE}?pack=${encodeURIComponent(WORLD)}&nogate&trailer=0&autopilot=1&autoanswer=1&autochoose=0&autocard=1&autocontinue=1&missionsecs=600`;
const PRE = `window.__errs=[]; addEventListener('error',(e)=>window.__errs.push(String(e.message||e).slice(0,200)),true);
if (!sessionStorage.getItem('__seeded')) { try { localStorage.setItem('mc.pack.pickup-time.v1', ${JSON.stringify(SEED)}); sessionStorage.setItem('__seeded', '1'); } catch (e) {} }`;
// (his arms in his own frame: x across him, y up, z ahead)
const ARMS = `(() => { const W = window.WAGMI, S = W && W.storyrun, M = S && S.runner && S.runner.M, D = W && W.dan; if (!D || !D.bones || !M || !M.def) return null;
  const B = D.bones, V = B.root.position.constructor; D.body.updateMatrixWorld(true); const inv = D.body.matrixWorld.clone().invert();
  const at = (n) => B[n].getWorldPosition(new V()).applyMatrix4(inv);
  const side = (s) => { const sh = at('upperarm01_' + s), wr = at('wrist_' + s); return { drop: +(sh.y - wr.y).toFixed(3), out: +(Math.abs(wr.x) / Math.max(0.05, Math.abs(sh.x))).toFixed(2) }; };
  const d = M.def.steps[M.i] || {};
  return { key: M.def.id + ':' + M.i + ':' + d.type, mid: M.def.id, type: d.type, foot: W.app.controllerManager.activeMode === 'person', cut: !!(W.cutscene || W.directed), ride: W.ride && W.ride.phase,
    speed: +Math.abs(W.person.speed || 0).toFixed(2), fight: !!(D.loco && D.loco.fight), tracks: (D.tracks || []).filter((t) => !t.out).length, L: side('L'), R: side('R'), errs: window.__errs.splice(0) }; })()`;
const ok = (s: any) => ['L', 'R'].every((k) => s[k].drop >= 0.3 && s[k].out >= 0.75);
const fails: string[] = [];
let n = 0;
await withBrowser(async (page: any) => {
  await page.preload(PRE);
  await page.emulate({ width: 1280, height: 720 });
  await page.goto(url);
  const t0 = Date.now();
  let last = '';
  const check = async (tag: string, s: any) => {
    n++; const good = ok(s);
    console.log(good ? 'ok  ' : 'FAIL', tag.padEnd(26), 'L', JSON.stringify(s.L), 'R', JSON.stringify(s.R));
    if (!good) fails.push(tag);
    if (SHOTS && (!good || n <= 2)) writeFileSync(`${SHOTS}-${tag.replace(/[^\w-]+/g, '_')}.jpg`, await page.screenshot(78));
  };
  // 1 every step of the mission: while he is on foot in it, out of cutscenes and the fight's guard, his arms sampled
  // (10 a second); the step judged on the middle of its samples (a stride swings them ahead and behind for a moment)
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  let samples: any[] = [];
  const judge = async (key: string) => {
    if (samples.length < 3) { samples = []; return; }
    const m = (k: string, f: string) => +med(samples.map((x) => x[k][f])).toFixed(3);
    await check('during ' + key, { L: { drop: m('L', 'drop'), out: m('L', 'out') }, R: { drop: m('R', 'drop'), out: m('R', 'out') }, n: samples.length });
    samples = [];
  };
  while (Date.now() - t0 < 12 * 60_000) {
    await sleep(100);
    const s: any = await page.eval(ARMS).catch(() => null);
    if (!s) continue;
    if (s.errs.length) console.log('page error', s.errs.join(' | '));
    if (s.key !== last) { if (last) await judge(last); last = s.key; console.log('  step', s.key, s.foot ? 'on foot' : 'in the car', s.cut ? 'cutscene' : ''); }
    if (s.mid !== MISSION && n) break;
    if (s.mid !== MISSION || !s.foot || s.cut || s.ride || s.fight || s.tracks || s.type === 'fight') continue;
    samples.push(s);
  }
  // 2 in and out of the car, three ways, standing after each
  await page.eval(`WAGMI.storyrun.autopilot && WAGMI.storyrun.autopilot.stop()`);
  const put = (mode: string) => page.eval(`(() => { const c = WAGMI.car; WAGMI.storyrun.runner.putPlayer({ x: c.position.x, z: c.position.z, heading: c.heading }, '${mode}'); return 1; })()`);
  for (const [way, out] of [['putPlayer', () => put('walk')], ['quick', () => page.eval(`WAGMI.ride.getOut(true), 1`)], ['climb', () => page.eval(`WAGMI.ride.getOut(), 1`)]] as const) {
    await put('car'); await sleep(2000); await out(); await sleep(way === 'climb' ? 4000 : 2500);
    const s: any = await page.eval(ARMS).catch(() => null); if (s && s.foot) await check('car out: ' + way, s);
  }
  console.log(`${n} checks, ${fails.length} failed${fails.length ? ': ' + fails.join(', ') : ''}`);
}, { width: 1280, height: 720, timeoutMs: 15 * 60_000 });
process.exit(fails.length || !n ? 1 : 0);
