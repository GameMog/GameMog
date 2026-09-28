/**
 * Film the homepage hero: real gameplay of a published world, recorded from
 * its own canvas in Chrome while the runtime's autopilot races it.
 *
 *   npm run media:hero -- la-olympics-2028
 *   AT=0.93 npm run media:hero -- road-race-2028   # open at 93% of the lap
 *   LAPS=1 NAME=-reel npm run media:hero -- speed-skating-2030   # exactly one lap, line to line
 *   NEAR=3 AHEAD=25 SECONDS=7 NAME=-reel npm run media:hero -- great-wall-shinobi   # rolls when three rivals are within 25 m ahead
 *   HEAT=3 NEAR=3 npm run media:hero -- zombie-beach   # an open world: heat 3 (a boss), three of them on you
 *
 * NAME is added to the file names, so a cut for the homepage reel leaves the
 * world's own film (its game page shows it) as it is.
 *
 * Writes public/media/<slug>-wide.mp4 (8:3, desktop) and <slug>-4x3.mp4
 * (phones), each with a poster taken from its first frame. Needs the dev
 * server. Nothing is edited or composited: what the film shows is what the
 * world renders. The HUD is hidden because the page sets its own title over
 * the film.
 *
 * The race is fast-forwarded to lap 7, where each new rival runs at your pace
 * and the field stays around you, then filmed at real speed from the moment
 * two rivals are within 15 m. debug.film() frames the chase camera closer
 * than play does so the athlete fills the frame.
 */
import { writeFileSync } from 'node:fs';
import { withBrowser } from '../../lib/browser.ts';

const CUTS = {
  // the full-bleed desktop hero (about 2:1 to 2.5:1 on screen): big enough to
  // stay sharp on a wide screen, at a bitrate that holds a crowd of fans; the
  // copy sits bottom left, so the runner is framed right of centre
  // (the camera holds its distance at any speed, so these are the real
  // distances: the runner about 45% of the frame tall, clear of the edges
  // wherever she is across the track)
  wide: { width: 2048, height: 960, bitrate: 4_500_000, film: { distance: 5.2, height: 1.7, fov: 40, side: -1, look: 1.25 } },
  // phones put the title under the film, so the runner is centred
  '4x3': { width: 960, height: 720, bitrate: 1_400_000, film: { distance: 4.6, height: 1.65, fov: 44, side: 0, look: 1.25 } },
} as const;
type Cut = keyof typeof CUTS;
// a world of cars (play.vehicle): the car is four and a half metres long, so
// the camera sits a car's length further back and a little higher, over the
// wing rather than level with it
const CAR_FILM: Record<Cut, { distance: number; height: number; fov: number; side: number; look: number }> = {
  wide: { distance: 7.6, height: 2.05, fov: 44, side: -0.8, look: 1.0 },
  '4x3': { distance: 7.2, height: 2.1, fov: 50, side: 0, look: 1.0 },
};

// an open world (open: {...}): no laps; the street fight is fast-forwarded to
// HEAT, then filmed from the moment NEAR of them (2 unless set) are on you,
// a step wider than a runner so the ones around you are in shot
const OPEN_FILM: Record<Cut, { distance: number; height: number; fov: number; side: number; look: number }> = {
  wide: { distance: 6.2, height: 1.85, fov: 46, side: -1.2, look: 1.2 },
  '4x3': { distance: 5.8, height: 1.85, fov: 52, side: 0, look: 1.2 },
};
const HEAT = Number(process.env.HEAT ?? 3);
// PLACE=x,z,yaw: stand the player there before it rolls, the camera held along yaw
// (radians; +PI/2 looks west): pick the light and the street. SIZE=WxH records the
// cut smaller, same shape, for a scene too heavy to draw at 60 frames a second
const PLACE = process.env.PLACE ? process.env.PLACE.split(',').map(Number) : null;
const SIZE = process.env.SIZE ? process.env.SIZE.split('x').map(Number) : null;

const slug = process.argv[2] ?? 'la-olympics-2028';
const only = (process.argv[3] ?? 'wide,4x3').split(',') as Cut[];
const FROM_LAP = Number(process.env.FROM_LAP ?? 7), SECONDS = Number(process.env.SECONDS ?? 14);
// AT: where on the lap the film opens, as a fraction of it (a loop that isn't an oval has a best side)
// LAPS: film exactly that many laps, from AT (the line, unless AT says otherwise) round to it again
const LAPS = process.env.LAPS === undefined ? null : Number(process.env.LAPS);
const AT = process.env.AT === undefined ? (LAPS ? 0 : null) : Number(process.env.AT);
// NEAR, AHEAD: the field it waits for: NEAR rivals, still racing, within AHEAD metres in front
// (without them: two rivals within 15 m either way)
const NEAR = process.env.NEAR === undefined ? null : Number(process.env.NEAR), AHEAD = Number(process.env.AHEAD ?? 25);
const NAME = process.env.NAME ?? '';
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
  const c = SIZE ? { ...CUTS[cut], width: SIZE[0], height: SIZE[1] } : CUTS[cut];
  await withBrowser(async (page) => {
    await page.goto(`${BASE}/g/${slug}/play?preview=1`);
    for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime)').catch(() => false)); i++) await sleep(200);
    // High profile at a level that allows 2048x960 at 60 fps (4.2 or 5.1) where the encoder offers it
    const mime = await page.eval<string>(`['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1.64002a', 'video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || ''`);
    if (!mime) throw new Error('This Chrome cannot record MP4.');
    await page.eval(`(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; c.id = 'gm-film'; })()`);
    await page.eval('window.__gmRuntime.debug.cinematic(true); window.__gmRuntime.debug.master && window.__gmRuntime.debug.master(true); window.__gmRuntime.debug.start()');
    await sleep(3800);
    const open = await page.eval<boolean>('!!window.__gmRuntime.state().open');
    await page.eval(`window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(${open ? 4 : 6})`);
    if (open) {
      for (let i = 0; i < 900 && (await page.eval<number>('window.__gmRuntime.state().open.heat')) < HEAT; i++) await sleep(100);
      await page.eval(`window.__gmRuntime.debug.timeScale(1); window.__gmRuntime.debug.film(${JSON.stringify(OPEN_FILM[cut])})`);
      if (PLACE) await page.eval(`window.__gmRuntime.debug.open().place(${PLACE[0]}, ${PLACE[1]}, ${PLACE[2] ?? 0}, 0.18)`);
      const on = `window.__gmRuntime.state().open.enemies.filter((e) => !e.ko && e.d < 7).length >= ${NEAR ?? 2}`;
      for (const until = Date.now() + 40_000; !(await page.eval<boolean>(on)) && Date.now() < until; ) await sleep(50);
      log(`${cut}: rolling at heat ${await page.eval<number>('window.__gmRuntime.state().open.heat')}`);
    } else {
      for (let i = 0; i < 900 && (await page.eval<number>('window.__gmRuntime.state().level')) < FROM_LAP; i++) await sleep(100);
      const cars = await page.eval<boolean>('!!(window.__gmRuntime.state().play && window.__gmRuntime.state().play.vehicle)');
      await page.eval(`window.__gmRuntime.debug.timeScale(1); window.__gmRuntime.debug.film(${JSON.stringify(cars ? CAR_FILM[cut] : c.film)})`);
      // two rivals in shot (and, with AT, at that point of the lap: up to four
      // laps of trying, then the point alone)
      const at = AT === null ? 'true' : `(((st.d % st.lap) / st.lap - ${AT} + 1) % 1) < 0.03`;
      const field = NEAR === null ? 'st.rivals.filter((r) => Math.abs(r.ahead) < 15).length >= 2' : `st.rivals.filter((r) => !r.out && r.ahead > 0 && r.ahead < ${AHEAD}).length >= ${NEAR}`;
      const ready = (near: boolean) => page.eval<boolean>(`(() => { const st = window.__gmRuntime.state(); return ${near ? field : 'true'} && ${at}; })()`);
      const until = Date.now() + (AT === null ? 20_000 : 110_000);
      let found = false;
      while (!found && Date.now() < until) { found = await ready(true); if (!found) await sleep(AT === null ? 100 : 25); }
      if (!found && AT !== null) for (const until2 = Date.now() + 60_000; !(await ready(false)) && Date.now() < until2; ) await sleep(25);
      log(`${cut}: rolling on lap ${await page.eval<number>('window.__gmRuntime.state().level')}`);
    }
    // a sixtieth of a second of play per frame drawn, however long it took to
    // draw: the recorder stamps frames at 60 a second, so a heavy scene drawn
    // at 40 would otherwise play half again as fast
    await page.eval('window.__gmRuntime.debug.fixedStep(60)');
    await page.eval(`(() => {
      const rec = new MediaRecorder(document.getElementById('gm-film').captureStream(60), { mimeType: ${JSON.stringify(mime)}, videoBitsPerSecond: ${c.bitrate} });
      window.__rec = { rec, chunks: [], done: false, frames: 0 };
      rec.ondataavailable = (e) => e.data.size && window.__rec.chunks.push(e.data);
      rec.onstop = () => { window.__rec.done = true; };
      rec.start(1000);
      (function f() { if (!window.__rec.done) { window.__rec.frames++; requestAnimationFrame(f); } })();
    })()`);
    const d0 = await page.eval<number>('window.__gmRuntime.state().d'), t1 = Date.now();
    if (LAPS) {
      // round to where it began: stop as the lap closes
      const lap = await page.eval<number>('window.__gmRuntime.state().lap');
      while ((await page.eval<number>('window.__gmRuntime.state().d')) - d0 < LAPS * lap && Date.now() - t1 < 120_000) await sleep(16);
    } else while ((await page.eval<number>('window.__rec.frames')) < SECONDS * 60 && Date.now() - t1 < SECONDS * 4000) await sleep(16);
    const took = (Date.now() - t1) / 1000;
    const frames = await page.eval<number>('window.__rec.rec.stop(), window.__rec.frames');
    while (!(await page.eval<boolean>('window.__rec.done'))) await sleep(100);
    const mp4 = await pull(page, `new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(new Blob(window.__rec.chunks, { type: 'video/mp4' })); })`);
    if (page.errors.length) throw new Error(`The world threw while filming: ${page.errors.join(' | ')}`);
    writeFileSync(`${OUT}${slug}${NAME}-${cut}.mp4`, mp4);
    log(`${cut}: ${slug}${NAME}-${cut}.mp4, ${took.toFixed(1)} s, ${(mp4.length / 1e6).toFixed(1)} MB, ${Math.round(frames / took)} fps rendered`);
  }, { width: c.width, height: c.height + CHROME_H, timeoutMs: 240_000 });
}

// posters: each film's first frame, so nothing jumps when playback starts
await withBrowser(async (page) => {
  await page.goto(`${BASE}/terms`);
  for (const cut of only) {
    const jpg = await pull(page, `(async () => {
      const v = document.createElement('video'); v.muted = true; v.src = '/media/${slug}${NAME}-${cut}.mp4?' + Date.now();
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('cannot load the film')); });
      v.currentTime = 0.02; await new Promise((r) => { v.onseeked = r; });
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    })()`);
    writeFileSync(`${OUT}${slug}${NAME}-${cut}.jpg`, jpg);
    log(`${cut}: poster ${slug}${NAME}-${cut}.jpg, ${Math.round(jpg.length / 1000)} KB`);
  }
}, { width: 1280, height: 800 });
process.exit(0);
