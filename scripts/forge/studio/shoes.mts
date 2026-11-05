// Shoe renders for forged characters (forge v2.3, SH), in Mr. Big's study light (?light=study: the warm lamp key that
// turned v2.2's leather orange), with the shared clip pack:
//   <P>-<name>-shoes.jpg        the shoes at 0.9 m, 8 yaws from 55 cm up, then 8 from 4 cm off the floor (idle)
//   <P>-<name>-shoes-walk.jpg   the walk (6 frames across one cycle) and the run (6), from the side, low: the toe box,
//                               the sole and the collar in motion
// Run under the shared lock:
//   from a GameMog checkout that has the lock (MogCity/.scratch/integrate/reg): node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env FORGE_OUT (the forge's out dir: <name>.glb, cast-clips.glb), SHOTS, P (prefix), NAMES=a,b, BAKED=name,... (shot with
// their own baked clips, e.g. the shipped Mr. Big), PORT (4980-4989)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, OUT = process.env.FORGE_OUT!, SHOTS = process.env.SHOTS || OUT, P = process.env.P || 'SH';
const PORT = +(process.env.PORT || 4985), BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), BAKED = new Set((process.env.BAKED || '').split(',').filter(Boolean));
const W = 600, H = 450;
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env, FORGE_OUT: OUT } });
const dir = mkdtempSync(join(tmpdir(), 'forge-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
mkdirSync(SHOTS, { recursive: true });
try {
  let v: any; for (let i = 0; i < 100 && !v; i++) { try { v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
  const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors: string[] = [];
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(String(m.params.entry.text).slice(0, 300) + ' ' + (m.params.entry.url || ''));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(' ').slice(0, 300)); };
  const raw = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = (await raw('Target.createTarget', { url: 'about:blank' })).result;
  const { sessionId } = (await raw('Target.attachToTarget', { targetId, flatten: true })).result;
  const send = (m: string, p: any = {}) => raw(m, p, sessionId);
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const snap = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).result.data, 'base64');
  const open = async (name: string) => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${name}.glb${BAKED.has(name) ? '' : '&clips=/f/cast-clips.glb'}&light=study` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(80); await ev(`window.__shot(${JSON.stringify(o)})`); return snap(); };
  const sheet = async (tiles: Buffer[], cols: number, w: number, h: number, file: string) => { const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })))).jpeg({ quality: 88 }).toFile(file); };
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/forge/studio/studio.html`)).ok) break; } catch {} await sleep(100); } // (the studio's server up first)
  for (const name of NAMES) {
    const t0 = Date.now(); if (!(await open(name))) { console.log(name, 'FAILED', errors.slice(0, 6)); continue; }
    const turn: Buffer[] = []; for (const cam of ['eye', 'low']) for (let k = 0; k < 8; k++) turn.push(await shot({ mode: 'shoe', yaw: (k * Math.PI) / 4, cam }));
    await sheet(turn, 4, 450, 338, `${SHOTS}/${P}-${name}-shoes.jpg`);
    const fr: Buffer[] = []; for (const clip of ['walk', 'run']) { const dur = +(await ev(`window.__dur(${JSON.stringify(clip)})`)) || 1; for (let k = 0; k < 6; k++) fr.push(await shot({ mode: 'shoe', clip, t: (dur * k) / 6 + 0.001, yaw: Math.PI / 2 + (clip === 'run' ? 0.5 : 0), cam: 'walk' })); }
    await sheet(fr, 6, 300, 225, `${SHOTS}/${P}-${name}-shoes-walk.jpg`);
    console.log(name, 'shot in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? JSON.stringify(errors.slice(0, 3)) : '');
  }
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
process.exit(0);
