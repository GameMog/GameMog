// Neck close-ups for forged characters (forge NK, necklines and collars): the collar, neckband, hood lip and neckline at
// 1 m in Mr. Big's study light, front / 3/4 / profile / back on the talk clip and a head turn ('shift'), then the same
// four with every part in its own flat colour and back faces magenta (?ids=1: which part a shard is).
//   <P>-<name>-neck.jpg
// Run under the shared lock:
//   from a GameMog checkout that has the lock (MogCity/.scratch/integrate/reg): node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env FORGE_OUT (<name>.glb, cast-clips.glb), SHOTS, P, NAMES=a,b, IDS=0 (no id row), PORT
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, OUT = process.env.FORGE_OUT!, SHOTS = process.env.SHOTS || OUT, P = process.env.P || 'NK';
const PORT = +(process.env.PORT || 4987), BASE = `http://127.0.0.1:${PORT}`, IDS = process.env.IDS !== '0';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean);
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env, FORGE_OUT: OUT } });
const dir = mkdtempSync(join(tmpdir(), 'forge-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=600,600', '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
mkdirSync(SHOTS, { recursive: true });
try {
  let v: any; for (let i = 0; i < 100 && !v; i++) { try { v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
  const ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors: string[] = [];
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)); };
  const raw = (method: string, params: any = {}, sessionId?: string) => new Promise<any>((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = (await raw('Target.createTarget', { url: 'about:blank' })).result;
  const { sessionId } = (await raw('Target.attachToTarget', { targetId, flatten: true })).result;
  const send = (m: string, p: any = {}) => raw(m, p, sessionId);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 600, deviceScaleFactor: 1, mobile: false });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const snap = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).result.data, 'base64');
  const open = async (name: string, extra: string) => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${name}.glb&clips=/f/cast-clips.glb${extra}` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(80); await ev(`window.__shot(${JSON.stringify(o)})`); return snap(); };
  const VIEWS = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [{ clip: 'talk', t: 1.37, jaw: 0.3, yaw: 0 }, { clip: 'talk', t: 1.74, jaw: 0.5, yaw: -0.6 }, { clip: 'shift', t: 1.0, jaw: 0, yaw: 0.7 }, { clip: 'talk', t: 2.4, jaw: 0.1, yaw: -1.5 }, { clip: 'idle', t: 1.2, jaw: 0, yaw: Math.PI }];
  for (const name of NAMES) {
    const t0 = Date.now(), tiles: Buffer[] = [];
    for (const extra of IDS ? ['&light=study', '&light=study&ids=1'] : ['&light=study']) {
      if (!(await open(name, extra))) { console.log(name, 'FAILED', errors.slice(0, 4)); break; }
      for (const vw of VIEWS) tiles.push(await shot({ mode: 'head', cam: process.env.CAM || 'neck', ...vw }));
    }
    if (!tiles.length) continue;
    const cols = VIEWS.length, rows = Math.ceil(tiles.length / cols), w = 360, h = 360;
    await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })))).jpeg({ quality: 88 }).toFile(`${SHOTS}/${P}-${name}-neck.jpg`);
    console.log(name, 'neck in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? JSON.stringify(errors.slice(0, 3)) : '', IDS ? await ev('JSON.stringify(window.__legend||[])') : '');
  }
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
process.exit(0);
