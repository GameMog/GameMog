// Talking close-ups for forged faces (FC), before and after, in Mr. Big's study light (?light=study), with the face the
// engine gives them (Story Kit's cast face.js: morphs, carried landmarks, the mouth's inside shaded):
//   <P>-<name>-talk.jpg   one row per build dir: 3/4 at rest, 3/4 mid-word, 3/4 open, front open, the other 3/4 mid-word
//   <P>-talk-sheet.jpg    every name's rows stacked (the before/after contact sheet)
//   <P>-mouth.json        G7a's mouth gate per build dir and name: the mouth's inside in each open frame (mouthgate.mjs)
// Run under the shared lock:
//   from a GameMog checkout that has the lock (MogCity/.scratch/integrate/reg): node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env ROOT (served at /f/), DIRS=a,b (build dirs under ROOT, one row each), CLIPS (cast-clips.glb under ROOT), SHOTS, P,
// NAMES=a,b, BAKED=name (a shipped GLB with its own clips), PORT
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
import { mouthStats, mouthVerdict } from '../mouthgate.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, ROOT = process.env.ROOT!, SHOTS = process.env.SHOTS || ROOT, P = process.env.P || 'FC';
const PORT = +(process.env.PORT || 4987), BASE = `http://127.0.0.1:${PORT}`, DIRS = (process.env.DIRS || '.').split(','), CLIPS = process.env.CLIPS || 'cast-clips.glb';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), BAKED = new Set((process.env.BAKED || '').split(',').filter(Boolean));
const FRAMES = [{ ang: 0.5, jaw: 0, t: 1.0 }, { ang: 0.5, jaw: 0.32, t: 1.37 }, { ang: 0.5, jaw: 0.62, t: 1.74 }, { ang: 0, jaw: 0.55, t: 1.74 }, { ang: -0.5, jaw: 0.4, t: 2.1 }];
const TS = 360;
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env, FORGE_OUT: ROOT } });
const dir = mkdtempSync(join(tmpdir(), 'forge-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=720,720', '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 720, deviceScaleFactor: 1, mobile: false });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const snap = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).result.data, 'base64');
  const open = async (glb: string, baked: boolean) => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${glb}${baked ? '' : '&clips=/f/' + CLIPS}&light=study` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(80); await ev(`window.__shot(${JSON.stringify(o)})`); return snap(); };
  // (G7a: each open frame drawn again as flat ids (studio.html mask) and the mouth's inside measured on the lit one, as
  // PNG: the mouth gate (mouthgate.mjs); MASKS=dir keeps the lit/ids pairs)
  const png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
  const rawOf = async (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const MASKS = process.env.MASKS; if (MASKS) mkdirSync(MASKS, { recursive: true });
  const mouth: Record<string, any> = {};
  const rows: Buffer[][] = [];
  for (const name of NAMES) {
    const t0 = Date.now(), mine: Buffer[][] = [];
    for (const d of BAKED.has(name) ? [DIRS[0]] : DIRS) {
      const glb = `${d}/${name}.glb`; if (!existsSync(join(ROOT, glb))) { console.log(name, 'missing in', d); continue; }
      if (!(await open(glb, BAKED.has(name)))) { console.log(name, d, 'FAILED', errors.slice(0, 6)); continue; }
      const row: Buffer[] = [], mf: any[] = [];
      for (const [i, f] of FRAMES.entries()) { row.push(await shot({ mode: 'close', clip: 'talk', ...f }));
        if (!f.jaw) continue;
        const lit = await png(); await ev(`window.__shot(${JSON.stringify({ mode: 'close', clip: 'talk', ...f, mask: true })})`); await sleep(60); const ids = await png();
        const a = await rawOf(lit), b = await rawOf(ids); mf.push({ jaw: f.jaw, ang: f.ang, stats: mouthStats(a.data, b.data, a.info.width, a.info.channels) });
        if (MASKS) { const tag = `${name}-${d.replace(/[^\w-]+/g, '_')}-${i}`; writeFileSync(`${MASKS}/${tag}-lit.png`, lit); writeFileSync(`${MASKS}/${tag}-ids.png`, ids); } }
      mouth[`${d}/${name}`] = { ...mouthVerdict(mf), frames: mf };
      console.log(name, d, 'mouth', JSON.stringify({ pass: mouth[`${d}/${name}`].pass, frames: mf.map((x) => x.stats) }));
      mine.push(row); rows.push(row);
    }
    if (mine.length) await sheet(mine, `${SHOTS}/${P}-${name}-talk.jpg`);
    console.log(name, 'shot in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? JSON.stringify(errors.slice(0, 3)) : '');
  }
  if (rows.length) await sheet(rows, `${SHOTS}/${P}-talk-sheet.jpg`, 220);
  writeFileSync(`${SHOTS}/${P}-mouth.json`, JSON.stringify(mouth, null, 1));
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
async function sheet(rows: Buffer[][], file: string, ts = TS) {
  const cols = Math.max(...rows.map((r) => r.length)), tiles: any[] = [];
  for (const [j, r] of rows.entries()) for (const [i, t] of r.entries()) tiles.push({ input: await sharp(t).resize(ts, ts).toBuffer(), left: i * ts, top: j * ts });
  await sharp({ create: { width: cols * ts, height: rows.length * ts, channels: 3, background: '#000' } }).composite(tiles).jpeg({ quality: 88 }).toFile(file);
}
process.exit(0);
