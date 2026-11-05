// H5 hair close-ups (forge hair and facial hair against the shipped Mr. Big and Jane): per character one row of the
// head in Mr. Big's study light: front, 3/4, profile, back 3/4, back, and the face close at 3/4 mid-word (stubble,
// moustache, beard, brows), then the whole figure at eye height (2 m read). Rows into <P>-hair-sheet.jpg and per
// character <P>-<name>-hair.jpg. G7b: each study view drawn again as a hair mask and the hair-read gate (hairgate.mjs)
// measured on it, as PNG: <P>-hair.json (per name: its verdict and each view's stats). G8b: and the hairline's step
// (hairgate.mjs hairlineStats) in the hairline close at the front and both 3/4s (KEEP=<dir>: those PNGs kept). Run under the shared lock:
//   from a GameMog checkout that has the lock (MogCity/.scratch/integrate/reg): node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env FORGE_OUT, SHOTS, P, NAMES=a,b, BAKED=name,... (shot with their own baked clips), PORT, SHEET (sheet file name)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
import { writeFileSync } from 'node:fs';
import { hairStats, hairVerdict, hairlineStats, hairlineVerdict } from '../hairgate.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, OUT = process.env.FORGE_OUT!, SHOTS = process.env.SHOTS || OUT, P = process.env.P || 'H';
const PORT = +(process.env.PORT || 4981), BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), BAKED = new Set((process.env.BAKED || '').split(',').filter(Boolean));
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env, FORGE_OUT: OUT } });
const dir = mkdtempSync(join(tmpdir(), 'forge-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=600,600', '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
mkdirSync(SHOTS, { recursive: true });
const T = 300, rows: Buffer[] = [], gate: Record<string, any> = {};
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
  const size = async (w: number, h: number) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const snap = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).result.data, 'base64');
  const png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
  const rawOf = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const open = async (name: string, light = '') => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${name}.glb${BAKED.has(name) ? '' : '&clips=/f/cast-clips.glb'}${light ? '&light=' + light : ''}` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(80); await ev(`window.__shot(${JSON.stringify(o)})`); return snap(); };
  for (const name of NAMES) {
    const t0 = Date.now(), tiles: Buffer[] = [];
    await size(600, 600); if (!(await open(name, 'study'))) { console.log(name, 'FAILED', errors.slice(0, 6)); continue; }
    const views: any[] = [];
    for (const ang of [0, 0.7, 1.5, 2.4]) { const o = { mode: 'study', clip: 'idle', t: 1.2, ang }; await shot(o); const lit = await png(); tiles.push(await sharp(lit).jpeg({ quality: 92 }).toBuffer());
      await ev(`window.__shot(${JSON.stringify({ ...o, mask: 'hair' })})`); await sleep(60); const m = await png(); const a = await rawOf(lit), b = await rawOf(m);
      views.push({ ang, stats: hairStats(a.data, b.data, a.info.width, a.info.channels) }); }
    const hm: string[] = (await ev('window.__info.hairMats')) || [];
    // (G8b: the hairline's step (hairgate.mjs hairlineStats): the hairline close at the front and both 3/4s)
    const lines: any[] = [];
    for (const ang of [0, 0.7, -0.7]) { const o = { mode: 'hairline', clip: 'idle', t: 1.2, ang }; await shot(o); const lit = await png();
      await ev(`window.__shot(${JSON.stringify({ ...o, mask: 'hairline' })})`); await sleep(60); const m = await png(); const a = await rawOf(lit), b = await rawOf(m);
      if (process.env.KEEP) { mkdirSync(process.env.KEEP, { recursive: true }); writeFileSync(`${process.env.KEEP}/${name}-hl${ang}-lit.png`, lit); writeFileSync(`${process.env.KEEP}/${name}-hl${ang}-mask.png`, m); }
      lines.push({ ang, stats: hairlineStats(a.data, b.data, a.info.width, a.info.channels) }); }
    const hv = hairVerdict(views, { ropes: hm.length > 0 && hm.every((n) => /^(braids|locs)$/.test(n)) }), hl = hairlineVerdict(lines);
    gate[name] = { ...hv, pass: hv.pass && hl.pass, hairPass: hv.pass, hairline: { ...hl, views: lines }, hairMats: hm, views }; console.log(name, 'hair', JSON.stringify({ pass: gate[name].pass, views: views.map((v) => v.stats), hairline: lines.map((v) => v.stats && v.stats.step) }));
    tiles.push(await shot({ mode: "close", clip: "talk", t: 1.37, jaw: 0.3, ang: 0.45 })); tiles.push(await shot({ mode: "close", clip: "idle", t: 1.2, ang: 1.1 }));
    await size(400, 600); tiles.push(await sharp(await shot({ mode: 'turn', yaw: 0.35, cam: 'eye' })).resize(T, T, { fit: 'cover', position: 'top' }).toBuffer());
    const row = await sharp({ create: { width: T * tiles.length, height: T, channels: 3, background: '#000' } }).composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(T, T, { fit: 'cover' }).toBuffer(), left: i * T, top: 0 })))).jpeg({ quality: 90 }).toBuffer();
    await sharp(row).toFile(`${SHOTS}/${P}-${name}-hair.jpg`); rows.push(row);
    console.log(name, 'shot in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? JSON.stringify(errors.slice(0, 3)) : '');
  }
  writeFileSync(`${SHOTS}/${P}-hair.json`, JSON.stringify(gate, null, 1));
  if (rows.length && process.env.SHEET) await sharp({ create: { width: T * 7, height: T * rows.length, channels: 3, background: '#000' } }).composite(rows.map((r, i) => ({ input: r, left: 0, top: i * T }))).jpeg({ quality: 86 }).toFile(`${SHOTS}/${process.env.SHEET}`);
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
process.exit(0);
