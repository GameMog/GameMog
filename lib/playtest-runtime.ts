import { withBrowser, chromePath } from './browser';

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

/** A JPEG this small at 1280x720 is a flat colour, not a scene. */
const BLANK_BYTES = 14_000;

export async function runtimePlaytest(url: string): Promise<RuntimeReport> {
  if (!chromePath()) {
    return { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [] };
  }
  try {
    return await withBrowser(async (page) => {
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
    }, { timeoutMs: 75_000 });
  } catch (e) {
    return {
      ok: false, ran: true, readyMs: null, fps: null, errors: [], cover: undefined,
      problems: [`The game could not be playtested: ${(e as Error).message}`],
    };
  }
}
