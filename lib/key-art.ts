import type { Page } from './browser';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type WorldKeyArt = { icon: Uint8Array; wide: Uint8Array };

/**
 * Photograph a running Runtime world as designed key art. The world remains
 * unchanged: the camera and title are recording-only and removed afterwards.
 */
export async function captureWorldKeyArt(page: Page): Promise<WorldKeyArt> {
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
  await page.eval(`document.getElementById('gm-key-art-title')?.remove();
    window.__gmRuntime.debug.film(null); window.__gmRuntime.debug.cinematic(false);`);
  return { icon, wide };
}
