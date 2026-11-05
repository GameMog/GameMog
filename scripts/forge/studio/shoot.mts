// Shoot forged characters in the studio (headless Chrome, one page each), with the shared clip pack:
//   <P>-<name>-turn.jpg   8 yaws x eye / low, idle
//   <P>-<name>-move.jpg   the sheet's walk at 4 yaws (two moments) and talk at 2 yaws: the walk check (plan 3.3 #9)
//   <P>-<name>-face.jpg   close-up: talk with the jaw shut / mid / open, then a full blink (the lids on screen)
//   <P>-<name>-light.jpg  front and three-quarter under one warm (2700 K) and one cool (7500 K) light (the colour check)
// Run under the shared lock:
//   from a GameMog checkout that has the lock (MogCity/.scratch/integrate/reg): node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env FORGE_OUT (the forge's out dir: <name>.glb, cast-clips.glb), SHOTS (dir), P (prefix), NAMES=a,b, WALKS=a:walkHeavy,...
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, OUT = process.env.FORGE_OUT!, SHOTS = process.env.SHOTS || OUT, P = process.env.P || 'F';
const PORT = +(process.env.PORT || 4987), BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), WALK = Object.fromEntries((process.env.WALKS || '').split(',').filter(Boolean).map((s) => s.split(':')));
const W = 480, H = 720;
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env, FORGE_OUT: OUT } });
const dir = mkdtempSync(join(tmpdir(), 'forge-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const logF = OUT + '/shots.json', log: any = existsSync(logF) ? JSON.parse(readFileSync(logF, 'utf8')) : {};
mkdirSync(SHOTS, { recursive: true });
try {
  let v: any; for (let i = 0; i < 100 && !v; i++) { try { v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
  const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors: string[] = [];
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)); else if (m.method === 'Log.entryAdded') errors.push('log: ' + m.params.entry.text.slice(0, 200)); };
  const raw = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = (await raw('Target.createTarget', { url: 'about:blank' })).result;
  const { sessionId } = (await raw('Target.attachToTarget', { targetId, flatten: true })).result;
  const send = (m: string, p: any = {}) => raw(m, p, sessionId);
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const snap = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })).result.data, 'base64');
  const open = async (name: string, light = '') => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${name}.glb&clips=/f/cast-clips.glb${light ? '&light=' + light : ''}` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(100); const c = await ev(`window.__shot(${JSON.stringify(o)})`); return { c, img: await snap() }; };
  const sheet = async (tiles: any[], cols: number, w: number, h: number, file: string) => { const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })))).jpeg({ quality: 88 }).toFile(file); };
  for (const name of NAMES) {
    if (!(await open(name))) { log[name] = { error: errors.slice(0, 8) }; console.log(name, 'FAILED', errors.slice(0, 8)); continue; }
    const info = await ev('window.__info'), checks: any[] = [], turn: Buffer[] = [];
    for (const cam of ['eye', 'low']) for (let k = 0; k < 8; k++) { const r = await shot({ mode: 'turn', yaw: (k * Math.PI) / 4, cam }); checks.push(r.c); turn.push(r.img); }
    await sheet(turn, 8, 240, 360, `${SHOTS}/${P}-${name}-turn.jpg`);
    if (process.env.QUICK) { console.log(name, 'quick'); continue; }
    const walk = WALK[name] || 'walk', move: Buffer[] = [];
    for (const t of [0.25, 0.6]) for (let k = 0; k < 4; k++) move.push((await shot({ mode: 'turn', clip: walk, t, yaw: (k * Math.PI) / 2, cam: 'eye' })).img);
    for (const y of [0, Math.PI / 4]) move.push((await shot({ mode: 'turn', clip: 'talk', t: 1.4, yaw: y, cam: 'eye' })).img);
    await sheet(move, 5, 240, 360, `${SHOTS}/${P}-${name}-move.jpg`);
    const face: Buffer[] = [];
    for (const [i, jaw] of [0, 0.35, 0.6].entries()) face.push((await shot({ mode: 'talk', clip: 'talk', t: 1.0 + i * 0.37, jaw })).img);
    face.push((await shot({ mode: 'face', clip: 'idle', t: 1.2, blink: 1 })).img, (await shot({ mode: 'face', clip: 'idle', t: 1.2, jaw: 0.45 })).img);
    await sheet(face, 5, 384, 576, `${SHOTS}/${P}-${name}-face.jpg`);
    const light: Buffer[] = [];
    for (const L of ['warm', 'cool']) { if (!(await open(name, L))) continue; for (const y of [0, Math.PI / 4]) light.push((await shot({ mode: 'turn', yaw: y, cam: 'eye' })).img); }
    if (light.length) await sheet(light, 4, 240, 360, `${SHOTS}/${P}-${name}-light.jpg`);
    log[name] = { info, checks: { floorMin: Math.min(...checks.map((c) => c.floor)), floorMax: Math.max(...checks.map((c) => c.floor)), height: checks[0].height, spineLeanDeg: checks[0].spineLeanDeg }, errors: errors.slice(0, 4) };
    console.log(name, JSON.stringify(log[name]));
  }
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
writeFileSync(logF, JSON.stringify(log, null, 1));
process.exit(0);
