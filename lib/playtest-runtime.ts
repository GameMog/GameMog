import { withBrowser, chromePath, HostSlept } from './browser';
import { lookScore, lookAdvisories, isLook, type Look } from './look';
import { captureWorldKeyArt } from './key-art';

/**
 * Playtest a game by playing it.
 *
 * Boots the document in real Chrome at a real frame rate, starts it the ways a
 * title screen usually asks (Enter, Space, a click), then plays for several
 * seconds with the arrow keys, WASD and Space, and records:
 *
 *   - whether GameMog.ready() was ever called, and how fast
 *   - every uncaught exception and console error, with the line it came from
 *   - the frame rate while playing
 *   - whether the screen is blank, or frozen while keys are being pressed
 *   - a screenshot mid-play, which becomes the game's cover
 *
 * Each finding is phrased as an instruction, because it is sent straight back
 * to the model that wrote the game.
 */

export type RuntimeReport = {
  ok: boolean;
  ran: boolean;
  readyMs: number | null;
  fps: number | null;
  errors: string[];
  problems: string[];
  cover?: Uint8Array;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a playtest again when the machine slept through it. Sleep freezes the
 * browser mid-run, and the time-out that follows is the host's, not the game's.
 */
async function awake<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (!(e instanceof HostSlept) || i === 2) throw e; }
  }
}

/** A JPEG this small at 1280x720 is a flat colour, not a scene. */
const BLANK_BYTES = 14_000;

export async function runtimePlaytest(url: string): Promise<RuntimeReport> {
  if (!chromePath()) {
    return { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [] };
  }
  try {
    return await awake(() => withBrowser(async (page) => {
      await page.preload(`
        window.__frames = 0;
        (function tick() { window.__frames++; requestAnimationFrame(tick); })();
      `);
      const t0 = Date.now();
      await page.goto(url);

      let readyMs: number | null = null;
      for (let i = 0; i < 100; i++) {
        const ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false);
        if (ready) { readyMs = Date.now() - t0; break; }
        await sleep(200);
      }
      const problems: string[] = [];
      if (readyMs === null) {
        problems.push('GameMog.ready() was never called within 20 seconds of loading. Call it right after the first frame renders, including on the title screen.');
      }

      // start it the ways a title screen asks
      await sleep(600);
      await page.key('Enter'); await sleep(250);
      await page.key('Space'); await sleep(250);
      await page.click(640, 360); await sleep(400);

      // play: steer, hop, go
      const f0 = await page.eval<number>('window.__frames').catch(() => 0);
      const pt0 = Date.now();
      const script: [string, number][] = [
        ['ArrowUp', 500], ['ArrowLeft', 450], ['Space', 120], ['ArrowRight', 500], ['ArrowUp', 300],
        ['Space', 120], ['KeyA', 350], ['KeyD', 350], ['ArrowLeft', 300], ['Space', 120], ['ArrowRight', 400],
        ['ArrowUp', 400], ['KeyW', 300], ['Space', 120], ['ArrowLeft', 350], ['ArrowRight', 350],
      ];
      let midShot: Uint8Array | undefined, earlyShot: Uint8Array | undefined;
      for (let i = 0; i < script.length; i++) {
        const [k, ms] = script[i];
        await page.key(k, 'keyDown'); await sleep(ms); await page.key(k, 'keyUp'); await sleep(60);
        if (i === 3) earlyShot = await page.screenshot(60);
        if (i === 9) midShot = await page.screenshot(78);
      }
      const f1 = await page.eval<number>('window.__frames').catch(() => f0);
      const fps = Math.round((f1 - f0) / ((Date.now() - pt0) / 1000));
      const lateShot = await page.screenshot(60);

      const errors = [...new Set([
        ...page.errors,
        ...(await page.eval<string[]>('(window.__gm && window.__gm.errors) || []').catch(() => [])),
      ])].slice(0, 12);

      for (const e of errors) problems.push(`Runtime error while playing: ${e}`);
      if (fps < 24) problems.push(`The game ran at ${fps} fps on a laptop GPU. Cut draw calls (use InstancedMesh for repeated props), shadow map size and per-frame allocations until it holds 60.`);
      const cover = midShot ?? lateShot;
      if (cover.length < BLANK_BYTES && lateShot.length < BLANK_BYTES) {
        problems.push('The screen is blank or a single flat colour while playing. Check that the renderer is appended to the page, sized to the window, and that the camera is looking at the scene.');
      } else if (earlyShot && Buffer.compare(Buffer.from(earlyShot), Buffer.from(lateShot)) === 0) {
        problems.push('The picture did not change at all over eight seconds of pressing Enter, Space, a click, the arrow keys and WASD. The game should start from one of those and visibly respond.');
      }

      return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, cover };
    }, { timeoutMs: 75_000 }));
  } catch (e) {
    return {
      ok: false, ran: true, readyMs: null, fps: null, errors: [], cover: undefined,
      problems: [`The game could not be playtested: ${(e as Error).message}`],
    };
  }
}

/* --------------------------------------------------------- framework worlds -- */
/**
 * Playtest a world on the GameMog Runtime, using the runtime's own test hooks
 * rather than guessing at key presses. The rules are the runtime's and are
 * tested separately (npm run check:runtime); what is tested here is the world:
 * does it build, do its characters and obstacles work, does it hold 60 fps,
 * does a run survive several laps of rivals joining without anything throwing,
 * and does a crash report a result.
 *
 * `problems` block publishing and go back to the model. `advisories` are the
 * runtime's repairs (scenery hidden from the camera, an unfair obstacle row
 * thinned): the world still works, but the model is told once so it can do
 * better.
 */
export type WorldReport = RuntimeReport & { advisories: string[]; levelReached: number; artIcon?: Uint8Array; artWide?: Uint8Array; open?: { kos: number; heat: number; boss: boolean; police: boolean }; look?: Look };

/** The cover: the best of three frames by how they look (lib/look.ts), and how that frame measured. */
async function bestCover(page: Parameters<Parameters<typeof withBrowser>[0]>[0]) {
  let best: { cover: Uint8Array; look: Look | undefined; score: number } | null = null;
  for (let k = 0; k < 3; k++) {
    if (k) await sleep(450);
    const look = await page.eval<unknown>('window.__gmRuntime.debug.look ? window.__gmRuntime.debug.look() : null').catch(() => null);
    const cover = await page.screenshot(80);
    const m = isLook(look) ? look : undefined, score = m ? lookScore(m) : 0;
    if (!best || score > best.score) best = { cover, look: m, score };
  }
  return best!;
}

type RtState = { state: string; level: number; gm: number; alive: boolean; rivals: { ahead: number; x: number }[]; lap: number; obstacles: number; coins: number; crashedInto: string };

export async function playtestWorld(url: string): Promise<WorldReport> {
  const empty = { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [], advisories: [], levelReached: 0 };
  if (!chromePath()) return empty;
  try {
    return await awake(() => withBrowser(async (page) => {
      await page.emulate({ width: 1280, height: 720 });
      await page.preload('window.__frames = 0; (function tick() { window.__frames++; requestAnimationFrame(tick); })();');
      const t0 = Date.now();
      await page.goto(url);
      let readyMs: number | null = null;
      for (let i = 0; i < 100; i++) {
        if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) { readyMs = Date.now() - t0; break; }
        await sleep(200);
      }
      const problems: string[] = [];
      const errs = async () => [...new Set([...page.errors, ...(await page.eval<string[]>('(window.__gm && window.__gm.errors) || []').catch(() => []))])].slice(0, 12);
      if (readyMs === null) {
        const e = await errs();
        problems.push('The world never finished loading.' + (e.length ? ' Errors: ' + e.join(' | ') : ' GameMog.world() may never have been called.'));
        return { ok: false, ran: true, readyMs, fps: null, errors: e, problems, advisories: [], levelReached: 0 };
      }
      const hasRuntime = await page.eval<boolean>('!!window.__gmRuntime').catch(() => false);
      if (!hasRuntime) {
        const e = await errs();
        problems.push('The runtime did not start the world. ' + (e.join(' | ') || 'Check that GameMog.world({...}) is called with track, build, player, rival and obstacles.'));
        return { ok: false, ran: true, readyMs, fps: null, errors: e, problems, advisories: [], levelReached: 0 };
      }
      const st = () => page.eval<RtState>('window.__gmRuntime.state()');

      // an open world: no laps. It must run at speed, its people must come and
      // fight and go down, the heat must bring the police and a boss, and a
      // knockout of the player must end the run with a result.
      type OpenState = { heat: number; time: number; kos: number; gm: number; boss: { name: string } | null; player: { hp: number; ko: boolean } | null; enemies: { ko: boolean }[]; civilians: number; police: string[]; ready: boolean };
      const open = await page.eval<OpenState | null>('window.__gmRuntime.state().open').catch(() => null);
      if (open) {
        const os = () => page.eval<OpenState>('window.__gmRuntime.state().open');
        await page.eval('window.__gmRuntime.debug.start()');
        await sleep(1500);
        await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
        const f0 = await page.eval<number>('window.__frames');
        await sleep(2500);
        const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);
        await page.eval('window.__gmRuntime.debug.timeScale(4)');
        let o = await os();
        for (let i = 0; i < 60 && o.kos < 4; i++) { await sleep(400); o = await os(); }
        const kos = o.kos;
        // the heat: police by patrol car, and a boss at level 3
        await page.eval('window.__gmRuntime.debug.open().heat(3)');
        let sawBoss = false, sawPolice = false;
        for (let i = 0; i < 40; i++) { await sleep(300); o = await os(); sawBoss = sawBoss || !!o.boss; sawPolice = sawPolice || o.police.length > 0; if (sawBoss && sawPolice) break; }
        await page.eval('window.__gmRuntime.debug.timeScale(1)');
        await sleep(1500);
        const art = await captureWorldKeyArt(page);
        await page.eval('window.__gmRuntime.debug.cinematic(true); window.__gmRuntime.debug.film(null)');
        await sleep(600);
        const { cover, look } = await bestCover(page);
        await page.eval('window.__gmRuntime.debug.cinematic(false)');
        await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.open().hurt(9999)');
        await sleep(3200);
        const results = await page.eval<unknown[]>('window.__gm.results').catch(() => []);
        const errors = await errs();
        const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
        if (look) advisories.push(...lookAdvisories(look));
        for (const e of errors) problems.push(`Runtime error: ${e}`);
        if (fps < 30) problems.push(`The open world ran at ${fps} fps on a laptop GPU. Instance repeated scenery, cut draw calls and lights, keep the crowd modest, until it holds 60.`);
        if (kos < 2) problems.push(`In the time a few fights should take, only ${kos} people were knocked out. Check that the map leaves open ground to stand and fight on, and that nothing blocks the people from reaching the player.`);
        if (!sawBoss) problems.push('Raising the heat to 3 brought no boss. Check open.crew.boss.');
        if (!results.length) problems.push('A knockout of the player did not end the run with a result.');
        if (cover.length < 14_000) problems.push('The screen is nearly a flat colour in the open world. Check the map or the ground, the lights and the camera.');
        return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached: o.heat, cover, artIcon: art?.icon, artWide: art?.wide, open: { kos, heat: o.heat, boss: sawBoss, police: sawPolice }, look } as WorldReport;
      }

      await page.eval('window.__gmRuntime.debug.start()');
      await sleep(3600);
      // real speed, driven, collisions off: the frame rate a player would get
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
      const f0 = await page.eval<number>('window.__frames');
      await sleep(2500);
      const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);

      // Reach lap 3 quickly. This is the first frame with a small field around
      // the player, and the best moment for the world's permanent key art.
      await page.eval('window.__gmRuntime.debug.timeScale(6)');
      let s = await st();
      for (let i = 0; i < 70 && s.level < 3; i++) { await sleep(400); s = await st(); }
      const art = s.level >= 3 ? await captureWorldKeyArt(page) : undefined;

      // Continue through several laps to exercise rival joins and world code.
      await page.eval('window.__gmRuntime.debug.timeScale(6)');
      for (let i = 0; i < 70 && s.level < 5; i++) { await sleep(400); s = await st(); }
      const levelReached = s.level;

      // the cover: real speed, a rival in frame ahead
      await page.eval('window.__gmRuntime.debug.timeScale(1)');
      let cover: Uint8Array | undefined;
      for (let i = 0; i < 40; i++) {
        s = await st();
        if (s.rivals.some((r) => r.ahead > 6 && r.ahead < 22)) break;
        await sleep(150);
      }
      await page.eval('window.__gmRuntime.debug.cinematic(true)');
      await sleep(60);
      const picked = await bestCover(page);
      cover = picked.cover;
      await page.eval('window.__gmRuntime.debug.cinematic(false)');

      // a crash must end the run and report a result
      await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.crashInto()');
      await sleep(2400);
      const results = await page.eval<{ level: number }[]>('window.__gm.results').catch(() => []);
      const errors = await errs();
      const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
      if (picked.look) advisories.push(...lookAdvisories(picked.look));

      for (const e of errors) problems.push(`Runtime error: ${e}`);
      if (levelReached < 4) problems.push(`A run reached only level ${levelReached} in the time several laps should take. Check that the track loop is sensible and nothing in update() or animate() stalls the game.`);
      if (fps < 30) problems.push(`The world ran at ${fps} fps on a laptop GPU. Instance repeated scenery with ctx.instanced, reduce geometry detail, use at most one shadow-casting light, until it holds 60.`);
      if (!results.length) problems.push('A crash did not end the run with a result. Do not interfere with the runtime; make sure nothing throws in animate().');
      if (cover.length < 14_000) problems.push('The screen is nearly a flat colour while racing. Check that build() adds the ground, the track surface and lights, and that the sky and fog do not swallow everything.');

      return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached, cover, artIcon: art?.icon, artWide: art?.wide, look: picked.look };
    }, { width: 1280, height: 807, timeoutMs: 90_000 }));
  } catch (e) {
    return { ...empty, ok: false, ran: true, problems: [`The world could not be playtested: ${(e as Error).message}`] };
  }
}
