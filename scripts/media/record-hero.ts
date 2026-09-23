/**
 * Film the homepage hero: real gameplay of a published world, recorded from
 * its own canvas in Chrome while the runtime's autopilot races it.
 *
 *   npm run media:hero -- la-olympics-2028
 *
 * Writes public/media/<slug>-wide.mp4 (8:3, desktop) and <slug>-4x3.mp4
 * (phones), each with a poster taken from its first frame. Needs the dev
 * server. Nothing is edited or composited: what the film shows is what the
 * world renders. The HUD is hidden because the page sets its own title over
 * the film.
 *
 * The race is fast-forwarded to lap 7, where each new rival runs at your pace
 * and the field stays around you, then filmed at real speed from the moment
 * two rivals are within 15 m. debug.film() moves the chase camera closer
 * than play does so the athlete fills the frame.
 */
import { writeFileSync } from 'node:fs';
import { withBrowser } from '../../lib/browser.ts';

const CUTS = {
  // the title panel sits bottom left, so the runner is framed right of centre
  wide: { width: 1680, height: 630, bitrate: 1_500_000, film: { distance: 3.8, height: 1.6, fov: 38, side: -1.8, look: 1.25 } },
  // phones put the title under the film, so the runner is centred
  '4x3': { width: 960, height: 720, bitrate: 900_000, film: { distance: 3.6, height: 1.55, fov: 44, side: -0.4, look: 1.25 } },
} as const;
type Cut = keyof typeof CUTS;

const slug = process.argv[2] ?? 'la-olympics-2028';
const only = (process.argv[3] ?? 'wide,4x3').split(',') as Cut[];
const FROM_LAP = Number(process.env.FROM_LAP ?? 7), SECONDS = Number(process.env.SECONDS ?? 14);
const BASE = process.env.BASE ?? 'http://localhost:3939';
const OUT = new URL('../../public/media/', import.meta.url).pathname;
// headless Chrome's window includes 87px of browser chrome above the page
const CHROME_H = 87;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

type Page = Parameters<Parameters<typeof withBrowser>[0]>[0];
/** A large string out of the page, one DevTools message per megabyte: one 20 MB reply stalls the socket. */
async function pull(page: Page, expr: string): Promise<Buffer> {
  const n = await page.eval<number>(`(async () => { window.__out = await (${expr}); return window.__out.length; })()`);
  let b64 = '';
  for (let i = 0; i < n; i += 1 << 20) b64 += await page.eval<string>(`window.__out.slice(${i}, ${i + (1 << 20)})`);
  return Buffer.from(b64, 'base64');
}

for (const cut of only) {
  const c = CUTS[cut];
  await withBrowser(async (page) => {
    await page.goto(`${BASE}/g/${slug}/play`);
    for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime)').catch(() => false)); i++) await sleep(200);
    const mime = await page.eval<string>(`['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || ''`);
    if (!mime) throw new Error('This Chrome cannot record MP4.');
    await page.eval(`(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; c.id = 'gm-film'; })()`);
    await page.eval('window.__gmRuntime.debug.cinematic(true); window.__gmRuntime.debug.start()');
    await sleep(3800);
    await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(6)');
    for (let i = 0; i < 900 && (await page.eval<number>('window.__gmRuntime.state().level')) < FROM_LAP; i++) await sleep(100);
    await page.eval(`window.__gmRuntime.debug.timeScale(1); window.__gmRuntime.debug.film(${JSON.stringify(c.film)})`);
    for (let i = 0; i < 200 && (await page.eval<number>('window.__gmRuntime.state().rivals.filter((r) => Math.abs(r.ahead) < 15).length')) < 2; i++) await sleep(100);
    log(`${cut}: rolling on lap ${await page.eval<number>('window.__gmRuntime.state().level')}`);
    await page.eval(`(() => {
      const rec = new MediaRecorder(document.getElementById('gm-film').captureStream(60), { mimeType: ${JSON.stringify(mime)}, videoBitsPerSecond: ${c.bitrate} });
      window.__rec = { rec, chunks: [], done: false, frames: 0 };
      rec.ondataavailable = (e) => e.data.size && window.__rec.chunks.push(e.data);
      rec.onstop = () => { window.__rec.done = true; };
      rec.start(1000);
      (function f() { if (!window.__rec.done) { window.__rec.frames++; requestAnimationFrame(f); } })();
    })()`);
    await sleep(SECONDS * 1000);
    const frames = await page.eval<number>('window.__rec.rec.stop(), window.__rec.frames');
    while (!(await page.eval<boolean>('window.__rec.done'))) await sleep(100);
    const mp4 = await pull(page, `new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(new Blob(window.__rec.chunks, { type: 'video/mp4' })); })`);
    if (page.errors.length) throw new Error(`The world threw while filming: ${page.errors.join(' | ')}`);
    writeFileSync(`${OUT}${slug}-${cut}.mp4`, mp4);
    log(`${cut}: ${slug}-${cut}.mp4, ${(mp4.length / 1e6).toFixed(1)} MB, ${Math.round(frames / SECONDS)} fps rendered`);
  }, { width: c.width, height: c.height + CHROME_H, timeoutMs: 240_000 });
}

// posters: each film's first frame, so nothing jumps when playback starts
await withBrowser(async (page) => {
  await page.goto(`${BASE}/terms`);
  for (const cut of only) {
    const jpg = await pull(page, `(async () => {
      const v = document.createElement('video'); v.muted = true; v.src = '/media/${slug}-${cut}.mp4?' + Date.now();
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot load the film')); });
      v.currentTime = 0.02; await new Promise((r) => { v.onseeked = r; });
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    })()`);
    writeFileSync(`${OUT}${slug}-${cut}.jpg`, jpg);
    log(`${cut}: poster ${slug}-${cut}.jpg, ${Math.round(jpg.length / 1000)} KB`);
  }
}, { width: 1280, height: 800 });
process.exit(0);
