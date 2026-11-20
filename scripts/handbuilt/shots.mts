// Hand-built cast, the study renders (shots.mts: study.mts with the frame's size from env W x H for the SHOTS list,
// e.g. 1280 x 720 progress frames): one character in the hand-built studio (studio-hp.html, the forge studio plus a
// high camera, a head sheet and hand close-ups), the tiles saved one by one so a comparison sheet can be made from them.
//   tiles: <OUT>/<name>/<section>-<k>.jpg   sections: turn (8 yaws x eye/low/high, idle), bust (8 yaws x eye/low/high,
//   study light), talk (study light: the grade's 6 + 3 close), hands (rest, talk, phone, guard), walk (12 frames)
// Run under the shared lock, from the GameMog checkout that has MogCity/.scratch/integrate/reg/locked.mts:
//   node --import ./scripts/ts-resolve.mjs MogCity/.scratch/integrate/reg/locked.mts <this>
// env FORGE_OUT (GLBs + cast-clips.glb), OUT (tiles), NAMES, BAKED (shot with their own clips), WALKS=name:clip, ONLY, PORT
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path';
const HERE = new URL('.', import.meta.url).pathname, OUTDIR = process.env.OUT!, PORT = +(process.env.PORT || 4982), BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NAMES = (process.env.NAMES || '').split(',').filter(Boolean), WALK = Object.fromEntries((process.env.WALKS || '').split(',').filter(Boolean).map((s) => s.split(':')));
const ONLY = new Set((process.env.ONLY || 'turn,bust,talk,hands,walk').split(',')), BAKED = new Set((process.env.BAKED || '').split(',').filter(Boolean));
const srv = spawn(process.execPath, [HERE + 'serve.mjs', String(PORT)], { stdio: 'ignore', env: { ...process.env } });
const dir = mkdtempSync(join(tmpdir(), 'hb-')), port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=480,720', '--force-device-scale-factor=1', '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const t00 = Date.now();
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
  const open = async (name: string, light = '') => { errors.length = 0; await send('Page.navigate', { url: `${BASE}/hb/studio-hp.html?glb=/f/${name}.glb${BAKED.has(name) ? '' : '&clips=/f/cast-clips.glb'}${light ? '&light=' + light : ''}${process.env.Q || ''}` });
    for (let i = 0; i < 240; i++) { await sleep(250); if (await ev('!!window.__ready')) return true; } return false; };
  const shot = async (o: any) => { const r = await ev(`window.__shot(${JSON.stringify(o)})`); await sleep(60); await ev(`window.__shot(${JSON.stringify(o)})`); return { img: await snap(), r }; };
  for (const name of NAMES) {
    const t0 = Date.now(), D = `${OUTDIR}/${name}`; mkdirSync(D, { recursive: true }); const meta: any = {};
    const save = async (sec: string, k: number, o: any) => { const { img, r } = await shot(o); writeFileSync(`${D}/${sec}-${String(k).padStart(2, '0')}.jpg`, img); (meta[sec] ||= []).push({ k, o, r }); };
    if (process.env.SHOTS) { // (HP-ym: an ad-hoc list of shots, env SHOTS = JSON [[section, shotOptions], ...], study light, 720 square)
      await size(+(process.env.W || 720), +(process.env.H || 720)); if (!(await open(name, process.env.LIGHT ?? 'study'))) { console.log(name, 'FAILED', errors.slice(0, 6)); continue; } const kk: any = {};
      for (const [sec, o] of JSON.parse(process.env.SHOTS)) { kk[sec] = (kk[sec] ?? -1) + 1; await save(sec, kk[sec], o); } }
    if (ONLY.has('moves')) { // the rig check: drive (sit, sitTalk), a fight (jab, cross, ffKick, guard), run, phone, argue
      await size(480, 720); if (!(await open(name))) { console.log(name, 'FAILED', errors.slice(0, 6)); continue; } let k = 0;
      for (const [clip, t] of [['sit', 1.0], ['sitTalk', 1.5], ['jab', 0.25], ['cross', 0.3], ['ffKick', 0.35], ['guard', 0.6], ['run', 0.3], ['phone', 1.2], ['argue', 2.0], ['crush', 0.73]] as any[])
        for (const yaw of [0.6, 2.4]) await save('moves', k++, { mode: 'turn', clip, t, yaw, cam: 'eye' }); }
    if (ONLY.has('turn') || ONLY.has('walk')) {
      await size(480, 720); if (!(await open(name))) { console.log(name, 'FAILED', errors.slice(0, 6)); continue; }
      if (ONLY.has('turn')) { let k = 0; for (const cam of ['eye', 'low', 'high']) for (let y = 0; y < 8; y++) await save('turn', k++, { mode: 'turn', yaw: (y * Math.PI) / 4, cam }); }
      if (ONLY.has('walk')) { const walk = WALK[name] || 'walk', dur = +(await ev(`window.__dur(${JSON.stringify(walk)})`)) || 1.1; let k = 0;
        for (let i = 0; i < 8; i++) await save('walk', k++, { mode: 'turn', clip: walk, t: (dur * i) / 8 + 0.001, yaw: Math.PI / 4, cam: 'eye' });
        for (let i = 0; i < 4; i++) await save('walk', k++, { mode: 'turn', clip: walk, t: (dur * i) / 4 + 0.001, yaw: Math.PI / 2, cam: 'eye' }); meta.walkClip = walk; }
    }
    if (ONLY.has('bust') || ONLY.has('talk') || ONLY.has('hands')) {
      await size(720, 720); if (!(await open(name, 'study'))) { console.log(name, 'study FAILED', errors.slice(0, 6)); continue; }
      if (ONLY.has('bust')) { let k = 0; for (const h of [0, -0.38, 0.42]) for (let y = 0; y < 8; y++) await save('bust', k++, { mode: 'bust', clip: 'idle', t: 1.2, ang: (y * Math.PI) / 4, w: h }); }
      if (ONLY.has('talk')) { let k = 0;
        for (const o of [{ t: 1.0, jaw: 0, ang: 0 }, { t: 1.37, jaw: 0.3, ang: 0.45 }, { t: 1.74, jaw: 0.55, ang: 0.45 }, { t: 2.1, jaw: 0.2, ang: -0.6 }, { t: 2.4, jaw: 0.1, ang: 1.45 }]) await save('talk', k++, { mode: 'study', clip: 'talk', ...o });
        await save('talk', k++, { mode: 'study', clip: 'idle', t: 1.2, blink: 1, ang: 0.25 });
        for (const o of [{ t: 1.5, jaw: 0.0, ang: 0.0 }, { t: 1.6, jaw: 0.5, ang: 0.0 }, { t: 1.8, jaw: 0.4, ang: 0.5 }]) await save('talk', k++, { mode: 'close', clip: 'talk', ...o }); }
      if (ONLY.has('hands')) { let k = 0;
        for (const [clip, t, cam, ang] of [['idle', 1.2, 'L', 0], ['idle', 1.2, 'L', -1.4], ['idle', 1.2, 'R', 1.4], ['idle', 1.2, 'R', Math.PI], ['talk', 1.6, 'R', 0.5], ['talk', 2.2, 'L', -0.5], ['phone', 1.2, 'R', 0.4], ['phone', 1.2, 'R', 1.6], ['guard', 0.6, 'R', 0.3], ['guard', 0.6, 'L', -0.6], ['jab', 0.25, 'L', -0.4], ['arms', 1.2, 'R', 0.6]] as any[])
          await save('hands', k++, { mode: 'hand', clip, t, cam, ang }); }
    }
    writeFileSync(`${D}/meta.json`, JSON.stringify(meta));
    console.log(name, 'shot in', ((Date.now() - t0) / 1000).toFixed(1), 's', errors.length ? JSON.stringify(errors.slice(0, 3)) : '');
  }
  ws.close();
} finally { chrome.kill('SIGKILL'); srv.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch {} console.log('total', ((Date.now() - t00) / 1000).toFixed(1), 's'); }
process.exit(0);
