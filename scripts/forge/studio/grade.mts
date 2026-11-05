// Grade renders for forged characters (forge v2.1), the three sheets a grade is made from, with the shared clip pack:
//   <P>-<name>-turn.jpg    8 yaws x eye / low, idle (the 'all angles' rule)
//   <P>-<name>-study.jpg   talking close-up in Mr. Big's study light (?light=study): front, 3/4 mid-word, 3/4 open,
//                          the other 3/4, profile, and a blink
//   <P>-<name>-walk.jpg    the sheet's walk, 8 frames across one cycle at 3/4, then 4 at the side (the cloth in motion)
// Run under the shared lock:
//   from a GameMog checkout that has the lock (MogCity/.scratch/integrate/reg): node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env FORGE_OUT (the forge's out dir: <name>.glb, cast-clips.glb), SHOTS, P (prefix), NAMES=a,b, WALKS=a:walkHeavy,...,
// ONLY=turn,study,walk, BAKED=name,... (characters shot with their own baked clips, e.g. a shipped Mog City GLB)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { createRequire } from 'node:module';
import { TOOLBOX } from '../paths.mjs';
const sharp = createRequire(TOOLBOX)('sharp');
const HERE = new URL('.', import.meta.url).pathname, OUT = process.env.FORGE_OUT!, SHOTS = process.env.SHOTS || OUT, P = process.env.P || 'G';
const PORT = +(process.env.PORT || 4987), BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), WALK = Object.fromEntries((process.env.WALKS || '').split(',').filter(Boolean).map((s) => s.split(':')));
const ONLY = new Set((process.env.ONLY || 'turn,study,walk').split(',')), BAKED = new Set((process.env.BAKED || '').split(',').filter(Boolean));
const W = 480, H = 720;
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env, FORGE_OUT: OUT } });
const dir = mkdtempSync(join(tmpdir(), 'forge-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const size = async (w: number, h: number) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const ev = async (x: string) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const snap = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })).result.data, 'base64');
  const open = async (name: string, light = '') => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/forge/studio/studio.html?glb=/f/${name}.glb${BAKED.has(name) ? '' : '&clips=/f/cast-clips.glb'}${light ? '&light=' + light : ''}` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(80); await ev(`window.__shot(${JSON.stringify(o)})`); return snap(); };
  const sheet = async (tiles: Buffer[], cols: number, w: number, h: number, file: string) => { const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: '#000' } }).composite(await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(w, h).toBuffer(), left: (i % cols) * w, top: Math.floor(i / cols) * h })))).jpeg({ quality: 88 }).toFile(file); };
  for (const name of NAMES) {
    const t0 = Date.now();
    if (ONLY.has('turn') || ONLY.has('walk')) {
      await size(W, H); if (!(await open(name))) { console.log(name, 'FAILED', errors.slice(0, 6)); continue; }
      if (ONLY.has('turn')) { const turn: Buffer[] = []; for (const cam of ['eye', 'low']) for (let k = 0; k < 8; k++) turn.push(await shot({ mode: 'turn', yaw: (k * Math.PI) / 4, cam }));
        await sheet(turn, 8, 240, 360, `${SHOTS}/${P}-${name}-turn.jpg`); }
      if (ONLY.has('walk')) { const walk = WALK[name] || 'walk', dur = +(await ev(`window.__dur(${JSON.stringify(walk)})`)) || 1.1, fr: Buffer[] = [];
        for (let k = 0; k < 8; k++) fr.push(await shot({ mode: 'turn', clip: walk, t: (dur * k) / 8 + 0.001, yaw: Math.PI / 4, cam: 'eye' }));
        for (let k = 0; k < 4; k++) fr.push(await shot({ mode: 'turn', clip: walk, t: (dur * k) / 4 + 0.001, yaw: Math.PI / 2, cam: 'eye' }));
        await sheet(fr, 6, 240, 360, `${SHOTS}/${P}-${name}-walk.jpg`); }
    }
    if (ONLY.has('study')) {
      await size(720, 720); if (!(await open(name, 'study'))) { console.log(name, 'study FAILED', errors.slice(0, 6)); continue; }
      const st: Buffer[] = [];
      st.push(await shot({ mode: 'study', clip: 'talk', t: 1.0, jaw: 0.0, ang: 0.0 }));
      st.push(await shot({ mode: 'study', clip: 'talk', t: 1.37, jaw: 0.3, ang: 0.45 }));
      st.push(await shot({ mode: 'study', clip: 'talk', t: 1.74, jaw: 0.55, ang: 0.45 }));
      st.push(await shot({ mode: 'study', clip: 'talk', t: 2.1, jaw: 0.2, ang: -0.6 }));
      st.push(await shot({ mode: 'study', clip: 'talk', t: 2.4, jaw: 0.1, ang: 1.45 }));
      st.push(await shot({ mode: 'study', clip: 'idle', t: 1.2, blink: 1, ang: 0.25 }));
      await sheet(st, 3, 520, 520, `${SHOTS}/${P}-${name}-study.jpg`);
    }
    console.log(name, 'shot in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? JSON.stringify(errors.slice(0, 3)) : '');
  }
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
process.exit(0);
