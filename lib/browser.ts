import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A real Chrome, driven over the DevTools protocol.
 *
 * Used to playtest generated games the only way that means anything: boot the
 * actual document in an actual browser at an actual frame rate, press the
 * keys a player would press, and watch what happens. A simulator or a static
 * read of the code cannot tell you a game renders black, or throws on the
 * first arrow key.
 *
 * Server-only, and a local-first choice: it spawns the Chrome installed on
 * this machine. A hosted deployment would run this in a worker with its own
 * browser.
 */

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[];

export const chromePath = () => CANDIDATES.find((p) => existsSync(p));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pending = { res: (v: any) => void; rej: (e: Error) => void };

export type Page = {
  /** Run before any of the page's own scripts. */
  preload(source: string): Promise<void>;
  goto(url: string): Promise<void>;
  eval<T = unknown>(expr: string): Promise<T>;
  key(key: string, type?: 'keyDown' | 'keyUp'): Promise<void>;
  click(x: number, y: number): Promise<void>;
  screenshot(quality?: number): Promise<Uint8Array>;
  /** Uncaught exceptions and console errors, in order. */
  errors: string[];
};

const KEYS: Record<string, { code: string; keyCode: number; key: string }> = {
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37, key: 'ArrowLeft' },
  ArrowUp: { code: 'ArrowUp', keyCode: 38, key: 'ArrowUp' },
  ArrowRight: { code: 'ArrowRight', keyCode: 39, key: 'ArrowRight' },
  ArrowDown: { code: 'ArrowDown', keyCode: 40, key: 'ArrowDown' },
  Space: { code: 'Space', keyCode: 32, key: ' ' },
  Enter: { code: 'Enter', keyCode: 13, key: 'Enter' },
  KeyW: { code: 'KeyW', keyCode: 87, key: 'w' },
  KeyA: { code: 'KeyA', keyCode: 65, key: 'a' },
  KeyS: { code: 'KeyS', keyCode: 83, key: 's' },
  KeyD: { code: 'KeyD', keyCode: 68, key: 'd' },
};

export async function withBrowser<T>(
  fn: (page: Page) => Promise<T>,
  opts: { width?: number; height?: number; timeoutMs?: number } = {}
): Promise<T> {
  const exe = chromePath();
  if (!exe) throw new Error('No Chrome found. Set CHROME_PATH to run runtime playtests.');
  const width = opts.width ?? 1280, height = opts.height ?? 720;
  const port = 9300 + Math.floor(Math.random() * 600);
  const dir = mkdtempSync(join(tmpdir(), 'gamemog-chrome-'));
  let proc: ChildProcess | undefined;
  let ws: WebSocket | undefined;

  const run = async () => {
    proc = spawn(exe, [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
      `--window-size=${width},${height}`, '--force-device-scale-factor=1',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check',
      // a real GPU where there is one; three.js on a software rasteriser runs
      // at single-digit frame rates and would fail every game on speed alone
      process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ], { stdio: 'ignore' });

    let version: { webSocketDebuggerUrl: string } | undefined;
    for (let i = 0; i < 80 && !version; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); }
    }
    if (!version) throw new Error('Chrome did not start.');

    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise<void>((res, rej) => { ws!.onopen = () => res(); ws!.onerror = () => rej(new Error('DevTools connection failed.')); });
    let id = 0;
    const pending = new Map<number, Pending>();
    const errors: string[] = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id)!; pending.delete(m.id);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push(String(d.exception?.description ?? d.text).split('\n').slice(0, 3).join(' | '));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push('console.error: ' + m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 300));
      }
    };
    const send = (method: string, params: object = {}, sessionId?: string) =>
      new Promise<any>((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws!.send(JSON.stringify({ id: i, method, params, sessionId })); });

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m: string, p?: object) => send(m, p, sessionId);
    await s('Page.enable'); await s('Runtime.enable');

    const page: Page = {
      errors,
      async preload(source) { await s('Page.addScriptToEvaluateOnNewDocument', { source }); },
      async goto(url) { await s('Page.navigate', { url }); },
      async eval(expr) {
        const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async key(name, type) {
        const k = KEYS[name] ?? { code: name, keyCode: 0, key: name };
        const base = { code: k.code, key: k.key, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
        if (!type || type === 'keyDown') await s('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k.key.length === 1 ? k.key : undefined });
        if (!type || type === 'keyUp') await s('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      },
      async click(x, y) {
        await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      },
      async screenshot(quality = 72) {
        const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality });
        return new Uint8Array(Buffer.from(data, 'base64'));
      },
    };
    return fn(page);
  };

  const limit = opts.timeoutMs ?? 60_000;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Playtest browser timed out after ${limit / 1000}s.`)), limit)),
    ]);
  } finally {
    try { ws?.close(); } catch {}
    try { proc?.kill('SIGKILL'); } catch {}
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}
