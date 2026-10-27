// Mog City on a phone: the shell around the game (index.html loads it after game.js; the parts that need the game
// wait for it). With a mouse and keyboard it does nothing. The phone is played upright and sideways alike: nothing
// here locks the orientation, and turning the phone mid-play is only a resize.
//   full screen    Android: the first tap that is the player's own (the start screen's) asks for the whole screen,
//                  the browser's bars hidden. iPhone has no such call in a browser tab; there "Add to Home Screen" runs
//                  it full screen (site.webmanifest)
//   auto-pause     a touch player who switches apps, takes a call or locks the phone comes back to the pause menu
//                  (W.ui.pause, mission/pause.js), not to a fight that went on without him
//   the viewport   when the browser's own bars come and go (iPhone's address bar), the page's size changes without a
//                  resize the city always hears: one is sent, so the renderer takes the real height (main.js sizes
//                  from innerWidth / innerHeight); again a moment after the phone turns
const coarse = matchMedia('(pointer: coarse)');
// (a touch player: a phone or tablet, or a touchscreen laptop while its last input was a finger: wagmi/touch.js)
const touchPlayer = () => coarse.matches || document.body.classList.contains('wg-touchlast');

/* ------------------------------------------------------------ full screen -- */
(() => {
  if (!/Android/i.test(navigator.userAgent)) return;
  const el = document.documentElement;
  const ask = (e) => {
    if (!e.isTrusted || !coarse.matches) return;
    removeEventListener('touchend', ask, true); removeEventListener('click', ask, true);
    if (document.fullscreenElement || !document.fullscreenEnabled || typeof el.requestFullscreen !== 'function') return;
    try { const p = el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch {}
  };
  addEventListener('touchend', ask, true); addEventListener('click', ask, true);
})();

/* ----------------------------------------------------------- the viewport -- */
(() => {
  let w = innerWidth, h = innerHeight;
  // (the browser's own resize already said this size: nothing more to send)
  addEventListener('resize', (e) => { if (e.isTrusted) { w = innerWidth; h = innerHeight; } });
  const check = () => {
    if (innerWidth === w && innerHeight === h) return;
    w = innerWidth; h = innerHeight;
    dispatchEvent(new Event('resize'));
  };
  let raf = 0;
  const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(check); };
  window.visualViewport?.addEventListener('resize', soon);
  const turned = () => { soon(); setTimeout(check, 250); setTimeout(check, 700); };
  addEventListener('orientationchange', turned);
  screen.orientation?.addEventListener?.('change', turned);
})();

/* ------------------------------------------------------------- auto-pause -- */
(function wait() {
  const W = window.WAGMI;
  if (!(W && W.ready && window.__NYC_APP && window.__NYC_APP.ready)) { setTimeout(wait, 100); return; }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !touchPlayer()) return;
    const pause = window.WAGMI?.ui?.pause;
    if (!pause || pause.isOpen) return;
    try { if (pause.pausable()) pause.open(); } catch (e) { console.warn('[phone] pause', e); }
  });
})();
