// C5 cloth close-ups for forged characters beside the shipped Mr. Big (and Jane), in Mr. Big's study light: per
// character one row: chest 3/4 (idle), chest front (talk), the elbow bent ('arms'), hips to knees 3/4 (walk), the
// chest from behind. G7c: then the cloth gate (clothgate.mjs) in three study views (front, 3/4, the other 3/4), each drawn
// lit, without the cloth's specular (nospec) and as a cloth mask, as PNG: <P>-cloth.json (per name its verdict and each
// view's stats). Run under the shared lock (see grade.mts). env FORGE_OUT, SHOTS, P, NAMES, BAKED, PORT,
// ONLY=photos,gate (default both), KEEP=<dir> (the gate's PNGs kept there, <name>-<view>-lit|nospec|mask.png)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
import { writeFileSync } from 'node:fs';
import { clothStats, clothVerdict } from '../clothgate.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, OUT = process.env.FORGE_OUT!, SHOTS = process.env.SHOTS || OUT, P = process.env.P || 'C5';
const PORT = +(process.env.PORT || 4981), BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), BAKED = new Set((process.env.BAKED || '').split(',').filter(Boolean));
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
  const open = async (name: string) => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${name}.glb${BAKED.has(name) ? '' : '&clips=/f/cast-clips.glb'}&light=study` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(80); await ev(`window.__shot(${JSON.stringify(o)})`); return snap(); };
  const rows: Buffer[][] = [], gate: Record<string, any> = {}, ONLY = new Set((process.env.ONLY || 'photos,gate').split(',')), KEEP = process.env.KEEP;
  const png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
  const rawOf = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (KEEP) mkdirSync(KEEP, { recursive: true });
  for (const name of NAMES) { if (!(await open(name))) { console.log(name, 'FAILED', errors.slice(0, 4)); continue; }
    if (ONLY.has('gate')) { const views: any[] = [];
      for (const [vi, o] of [{ t: 1.0, jaw: 0, ang: 0 }, { t: 1.37, jaw: 0.3, ang: 0.45 }, { t: 2.1, jaw: 0.2, ang: -0.6 }].entries()) { const f = { mode: 'study', clip: 'talk', ...o };
        await shot(f); const lit = await png(); await ev(`window.__shot(${JSON.stringify({ ...f, nospec: true })})`); await sleep(60); const ns = await png(); await ev(`window.__shot(${JSON.stringify({ ...f, mask: 'cloth' })})`); await sleep(60); const mk = await png();
        if (KEEP) { writeFileSync(`${KEEP}/${name}-${vi}-lit.png`, lit); writeFileSync(`${KEEP}/${name}-${vi}-nospec.png`, ns); writeFileSync(`${KEEP}/${name}-${vi}-mask.png`, mk); }
        const a = await rawOf(lit), b = await rawOf(ns), c = await rawOf(mk); views.push({ ang: o.ang, stats: clothStats(a.data, b.data, c.data, a.info.width, a.info.channels) }); }
      gate[name] = { ...clothVerdict(views), pieces: await ev('window.__clothIds()'), views }; console.log(name, 'cloth gate', JSON.stringify({ pass: gate[name].pass, views: views.map((v) => v.stats) })); }
    if (!ONLY.has('photos')) continue;
    const r: Buffer[] = [];
    r.push(await shot({ mode: 'cloth', cam: 'chest', clip: 'idle', t: 1.2, ang: 0.6 }));
    r.push(await shot({ mode: 'cloth', cam: 'chest', clip: 'talk', t: 1.4, ang: 0 }));
    r.push(await shot({ mode: 'cloth', cam: 'arm', clip: 'arms', t: 1.5, ang: 1.0 }));
    r.push(await shot({ mode: 'cloth', cam: 'legs', clip: 'walk', t: 0.3, ang: 0.6 }));
    r.push(await shot({ mode: 'cloth', cam: 'chest', clip: 'idle', t: 1.2, ang: Math.PI * 0.85 }));
    rows.push(r); await sharp({ create: { width: 5 * 360, height: 360, channels: 3, background: '#000' } }).composite(await Promise.all(r.map(async (t, i) => ({ input: await sharp(t).resize(360, 360).toBuffer(), left: i * 360, top: 0 })))).jpeg({ quality: 88 }).toFile(`${SHOTS}/${P}-${name}-cloth.jpg`);
    console.log(name, 'cloth shot', errors.length ? JSON.stringify(errors.slice(0, 3)) : ''); }
  if (ONLY.has('gate')) writeFileSync(`${SHOTS}/${P}-cloth.json`, JSON.stringify(gate, null, 1));
  if (rows.length > 1) await sharp({ create: { width: 5 * 300, height: rows.length * 300, channels: 3, background: '#000' } }).composite((await Promise.all(rows.flatMap((r, j) => r.map(async (t, i) => ({ input: await sharp(t).resize(300, 300).toBuffer(), left: i * 300, top: j * 300 })))))).jpeg({ quality: 86 }).toFile(`${SHOTS}/${P}-${process.env.SHEET || 'cloth-sheet'}.jpg`);
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
process.exit(0);
