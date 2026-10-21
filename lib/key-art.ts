import type { Page } from './browser';
import { artBlown, artBadness, artFair, artNote, type Look } from './look';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type WorldKeyArt = { icon: Uint8Array; wide: Uint8Array };

/**
 * Photograph a running Runtime world as designed key art. The world remains
 * unchanged: the camera and title are recording-only and removed afterwards.
 */
export async function captureWorldKeyArt(page: Page, opts: { kart?: boolean } = {}): Promise<WorldKeyArt> {
  // an open world may name its shot: where the player stands and which way the
  // camera looks (open.keyArt: { at: [x, z], look: degrees, tilt }); the fight
  // is brought to him there
  const spot = await page.eval<{ at: number[]; look?: number; tilt?: number } | null>('window.__gmRuntime.debug.art().keyArt').catch(() => null);
  if (spot) {
    const yaw = ((Number(spot.look) || 0) * Math.PI) / 180, tilt = Number(spot.tilt) || 0.15;
    await page.eval(`(() => { const o = window.__gmRuntime.debug.open(); window.__gmRuntime.debug.autopilot(false);
      o.place(${Number(spot.at[0]) || 0}, ${Number(spot.at[1]) || 0}, ${yaw}, ${tilt}); o.spawn('thug'); o.spawn('thug'); o.spawn('biker'); })()`);
    await sleep(1900);
  }
  await page.eval(`window.__gmRuntime.debug.timeScale(1);
    window.__gmRuntime.debug.invincible(true);
    window.__gmRuntime.debug.film({ target: 'player', distance: -9.5, height: 2.35, fov: 46, side: -0.8, look: 1.35 });
    window.__gmRuntime.debug.cinematic(true);`);
  await sleep(700);
  await judged(page, !!opts.kart);

  const { wide, icon } = await titled(page);
  await page.eval(`document.getElementById('gm-key-art-title')?.remove();
    window.__gmRuntime.debug.film(null); window.__gmRuntime.debug.cinematic(false);`);
  return { icon, wide };
}

/**
 * The key art judged before it is shot (20 Oct, Magma Crown's thumbnail: a front-lit hero washed to a cream blob). The
 * frame is measured (debug.look, lib/look.ts artBlown); washed or burnt, a second angle is tried, a higher one that
 * trades bright sky for the road (a kart race's front lens raised to 3.2 m; any other world's chase lens from the other side), and the
 * better of the two kept (artBadness). Still washed, the builder is told once through the runtime's own warnings, which
 * every drive reports with its advisories.
 */
async function judged(page: Page, kart: boolean): Promise<void> {
  const look = () => page.eval<Look | null>('window.__gmRuntime.debug.look ? window.__gmRuntime.debug.look() : null').catch(() => null);
  let m = await look();
  if (!artBlown(m)) return;
  const first = kart ? `window.__gmRuntime.debug.kart().film({ mode: 'front', distance: 7.5, height: 1.5, fov: 46 })`
    : `window.__gmRuntime.debug.film({ target: 'player', distance: -9.5, height: 2.35, fov: 46, side: -0.8, look: 1.35 })`;
  const second = kart ? `window.__gmRuntime.debug.kart().film({ mode: 'front', distance: 8.5, height: 3.2, fov: 44 })`
    : `window.__gmRuntime.debug.film({ target: 'player', distance: -9.5, height: 2.35, fov: 46, side: 0.8, look: 1.35 })`;
  await page.eval(second).catch(() => null); await sleep(700);
  const m2 = await look();
  if (m && m2 && artFair(m, m2) && artBadness(m2) < artBadness(m)) m = m2; else { await page.eval(first).catch(() => null); await sleep(700); }
  if (m && artBlown(m)) {
    const note = artNote(m);
    await page.eval(`(() => { const g = window.__gm; if (g) (g.warnings = g.warnings || []).push(${JSON.stringify(note)}); })()`).catch(() => null);
  }
}

/**
 * Whether the page can be photographed (20 Oct): a lost WebGL context, or the kart guard's "Graphics reset" card over the
 * frame, would be shot as the game's thumbnail. The guard keeps a lost context's textures gone, so there is nothing to
 * wait for: the art is refused, and the callers' "no key art" path applies.
 */
export async function artBlocked(page: Page): Promise<string | null> {
  return page.eval<string | null>(`(() => {
    try { const r = window.__gmRuntime && window.__gmRuntime.debug.internals().renderer; if (r && r.getContext().isContextLost()) return 'the graphics context was lost'; } catch (e) {}
    if (window.KartGuard && window.KartGuard.state && window.KartGuard.state().card) return 'the graphics reset card is up';
    const a = Array.from(document.querySelectorAll('[role=alert]')).find((e) => /Graphics reset/.test(e.textContent || ''));
    return a ? 'the graphics reset card is up' : null;
  })()`).catch(() => null);
}

/** The platform's title over the frame as it stands, shot wide and as the icon's square; the title is left on the page. */
async function titled(page: Page): Promise<WorldKeyArt> {
  const blocked = await artBlocked(page);
  if (blocked) throw new Error(`No key art: ${blocked}.`);
  await page.eval(`(() => {
    const art = window.__gmRuntime.debug.art();
    const old = document.getElementById('gm-key-art-title'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'gm-key-art-title';
    el.textContent = art.title.toUpperCase();
    Object.assign(el.style, {
      position: 'fixed', zIndex: '2147483647', left: '50px', bottom: '34px', width: '1180px',
      color: art.theme.accent, fontFamily: art.theme.font + ', Figtree, Arial, sans-serif',
      fontSize: (art.title.length > 24 ? 92 : art.title.length > 15 ? 112 : 142) + 'px',
      fontWeight: '900', lineHeight: '.82', letterSpacing: '-.055em', textAlign: 'center',
      WebkitTextStroke: '7px ' + art.theme.ink, paintOrder: 'stroke fill',
      textShadow: '0 8px 0 ' + art.theme.ink, pointerEvents: 'none', textWrap: 'balance'
    });
    document.body.appendChild(el);
  })()`);
  await sleep(100);
  const wide = await page.screenshot(85, { x: 0, y: 0, width: 1280, height: 720 });

  await page.eval(`(() => {
    const el = document.getElementById('gm-key-art-title');
    Object.assign(el.style, { left: '400px', bottom: '122px', width: '480px',
      fontSize: (el.textContent.length > 24 ? 48 : el.textContent.length > 15 ? 58 : 72) + 'px',
      WebkitTextStrokeWidth: '5px', textShadow: '0 6px 0 ' + window.__gmRuntime.debug.art().theme.ink });
  })()`);
  await sleep(100);
  const icon = await page.screenshot(85, { x: 384, y: 104, width: 512, height: 512 });
  return { icon, wide };
}

/**
 * A penalty shootout's key art (13 Oct), shot in the kick it is called in, at its strike: the runtime's own lens from
 * behind the goal (REVERSE, the replay's), the HUD hidden (debug.shootout().film), the keeper diving as the ball comes,
 * the platform's title over it, as SHOOTOUT's own was made. The director owns the camera, so none of v1's film or
 * cinematic is used (they move v1's chase camera, which a shootout never draws through). The kick runs at a quarter of
 * its speed while it is shot, so the wide and the icon are the same moment of the dive; its outcome is the same at
 * any speed (the ball's flight is the runtime's own steps). Speed and the HUD come back after, whatever happened.
 */
export async function captureShootoutKeyArt(page: Page): Promise<WorldKeyArt> {
  const D = (js: string) => page.eval(`(() => { const D = window.__gmRuntime.debug.shootout(); ${js} })()`);
  try {
    await D(`D.shot('REVERSE'); D.film(true); D.timeScale(0.25); return 1;`);
    // the dive: the ball most of the way from the spot (z -41.5) to the goal line (z -52.5), or the outcome, whichever comes first
    for (let i = 0; i < 80; i++) {
      const at = await page.eval<{ z: number | null; out: boolean }>(`(() => { const s = window.__gmRuntime.state().shootout || {};
        return { z: s.ball && s.ball.p ? s.ball.p[2] : null, out: !!s.outcome }; })()`).catch(() => ({ z: null, out: true }));
      if (at.out || (at.z !== null && at.z <= SHOOT_ART_Z)) break;
      await sleep(50);
    }
    return await titled(page);
  } finally {
    await page.eval(`document.getElementById('gm-key-art-title')?.remove();`).catch(() => undefined);
    await D(`D.timeScale(1); D.film(false); return 1;`).catch(() => undefined);
  }
}
/** Where the ball is (its z, metres) when a shootout's key art is shot: two thirds of the way from the spot to the goal line. */
export const SHOOT_ART_Z = -48.5;

/**
 * A Grand Prix's key art (18 Oct), shot as the player's car comes down the start/finish straight at the end of a lap:
 * the runtime's own chase camera, the HUD off (v1's cinematic), the gantry, the grandstand and the harbour city round
 * the car, the platform's title over it. The caller has a race running at speed (debug.gp().go); this slows it to real
 * time for the last metres, waits for the straight and leaves the frame ready (gpArtSpot), then shoots it (captureGpKeyArt).
 * A race over before the straight is reached leaves the frame as it is.
 */
export const GP_ART_D = 5300, GP_ART_BACK = 62;
export async function gpArtSpot(page: Page): Promise<boolean> {
  const dist = () => page.eval<number | null>(`(() => { const g = window.__gmRuntime.state().gp, c = g && g.cars && g.cars[g.you]; return c ? c.d : null; })()`).catch(() => null);
  // (21 Oct, its Mogs: the spot is the lap's own, GP_ART_BACK before the line, so a Mog's circuit gets its straight too)
  const L = await page.eval<number | null>('(() => { const g = window.__gmRuntime.state().gp; return g && g.L ? +g.L : null; })()').catch(() => null);
  const at = L ? Math.max(0, L - GP_ART_BACK) : GP_ART_D;
  await page.eval('window.__gmRuntime.debug.timeScale(1)');
  let d = await dist();
  for (let i = 0; i < 150 && d !== null && d < at; i++) { await sleep(60); d = await dist(); }
  // (the car in the picture, 21 Oct: the chase camera, whatever view the race starts in)
  await page.eval("window.__gmRuntime.debug.gp().cam('chase')").catch(() => undefined);
  await page.eval('window.__gmRuntime.debug.cinematic(true)');
  await sleep(450);
  return d !== null && d >= at - 40;
}
export async function captureGpKeyArt(page: Page): Promise<WorldKeyArt> {
  try { return await titled(page); }
  finally { await page.eval(`document.getElementById('gm-key-art-title')?.remove(); window.__gmRuntime.debug.cinematic(false);`).catch(() => undefined); }
}
