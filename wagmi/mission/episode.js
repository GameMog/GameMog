// Mog City: the end of Episode 1, after Mission 3 (m3.js passed(): MISSION PASSED, the save, Rook's DM, then this).
// A card over the live city: the logo, END OF EPISODE 1, a line of thanks, three choices and the teaser for Mission 4.
//   KEEP EXPLORING     the card away: free roam
//   REPLAY A MISSION   the card away, the pause menu open on its Mission select
//   SHARE THE GAME     the browser's share sheet where there is one, else the link copied ('Link copied'); the card stays
// episodeEnd(W) -> Promise<'explore' | 'replay'>. Keys: arrows (or WASD, Tab) choose, Enter / Space pick, Esc keeps
// exploring. A pad (wagmi/pad.js) sends those keys: it reads the card as a question on screen, as it does the fail
// screen (#wg .wg-big.on .choices), which also keeps the pause menu and the touch buttons away while it is up. Touch:
// the buttons are 48 px tall, stacked on a narrow (portrait) screen.
const URL_ = 'https://mc.gamemog.com';
const SHARE = { title: 'MOG CITY: Unfinished Business', text: 'They framed the wrong guy. Play free in your browser.', url: URL_ };
const ACTS = ['explore', 'replay', 'share'];
let shareDead = false;                                 // (a share API with no sheet behind it, found once: copy from then on)

const CSS = `
.wg-ep { position: fixed; inset: 0; z-index: 9; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: radial-gradient(ellipse at 50% 46%, rgba(4,5,8,.58), rgba(4,5,8,.88) 78%); opacity: 0; pointer-events: none; transition: opacity .7s;
  font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; text-align: center; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
body > .wg-ep { z-index: 40; }
.wg-ep.on { opacity: 1; pointer-events: auto; }
.wg-ep * { box-sizing: border-box; }
.wg-ep .ep-in { margin: auto 0; width: 100%; max-width: 760px; display: flex; flex-direction: column; align-items: center; transform: translateY(10px); transition: transform .8s cubic-bezier(.2,.7,.2,1); }
.wg-ep.on .ep-in { transform: none; }
.wg-ep .ep-logo { font: italic 800 clamp(30px, min(9vw, 9vh), 54px)/.9 'Barlow Condensed', system-ui; letter-spacing: 1px; white-space: nowrap; text-shadow: 0 4px 22px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.4); }
.wg-ep .ep-logo b { color: #FFC93C; font-weight: 800; }
.wg-ep .ep-h { margin-top: clamp(6px, 1.6vh, 14px); font: italic 800 clamp(38px, min(12vw, 13vh), 92px)/.95 'Barlow Condensed', system-ui; letter-spacing: 2px; color: #FFC93C; white-space: nowrap; text-shadow: 0 4px 28px rgba(0,0,0,.6), 0 2px 4px rgba(0,0,0,.45); }
.wg-ep .ep-rule { width: 140px; height: 3px; background: #FFC93C; margin: clamp(10px, 2vh, 18px) auto 0; transform: scaleX(0); transition: transform 1.1s .3s cubic-bezier(.2,.7,.2,1); }
.wg-ep.on .ep-rule { transform: scaleX(1); }
.wg-ep .ep-ty { margin-top: clamp(10px, 2vh, 16px); font: 600 clamp(17px, 2.1vh, 21px)/1.3 'Barlow Condensed'; color: rgba(255,255,255,.9); text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.wg-ep .choices { margin-top: clamp(14px, 3.2vh, 28px); display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; pointer-events: auto; }
.wg-ep .choices button { min-height: 48px; min-width: 44px; padding: 0 22px; border-radius: 10px; border: 1px solid rgba(255,255,255,.28); background: rgba(8,10,14,0.66);
  font: 700 20px/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #fff; cursor: pointer; white-space: nowrap; touch-action: manipulation; transition: background .15s, color .15s, border-color .15s; }
.wg-ep .choices button.sel { background: #FFC93C; color: #0A0C10; border-color: #FFC93C; }
@media (hover: hover) { .wg-ep .choices button:hover { border-color: #FFC93C; } .wg-ep .choices button.sel:hover { border-color: #FFC93C; } }
.wg-ep .choices button:active { transform: scale(.97); }
.wg-ep .ep-msg { height: 20px; margin-top: 8px; font: 700 16px/20px 'Barlow Condensed'; letter-spacing: 1.5px; color: #4ADE80; opacity: 0; transition: opacity .2s; }
.wg-ep .ep-msg.on { opacity: 1; }
.wg-ep .ep-next { margin-top: clamp(4px, 1.2vh, 12px); display: inline-flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 18px 8px; border-radius: 10px; border: 1.5px dashed rgba(255,201,60,.55); background: rgba(8,10,14,0.5); }
.wg-ep .ep-next .k { font: 800 15px/1 'Barlow Condensed'; letter-spacing: 3px; color: #FFC93C; }
.wg-ep .ep-next .s { font: 600 15px/1.2 'Barlow Condensed'; color: rgba(255,255,255,.72); }
.wg-ep .ep-keys { margin-top: 12px; font: 600 13px/1 'Barlow Condensed'; letter-spacing: 1px; color: rgba(255,255,255,.5); }
.wg-ep .ep-keys kbd { display: inline-block; min-width: 1.5em; padding: 2px 5px 1px; margin: 0 2px; border-radius: 4px; border: 1px solid rgba(255,255,255,.5); font: 700 12px/1.2 'Barlow Condensed'; color: rgba(255,255,255,.75); }
/* (the key hint for a keyboard only: not after a finger, not with a pad, not on a phone) */
body.wg-touchlast .wg-ep .ep-keys, body.wg-pad .wg-ep .ep-keys { display: none; }
@media (hover: none) and (pointer: coarse) { .wg-ep .ep-keys { display: none; } }
/* a narrow screen (a phone upright): the choices stacked, full width */
@media (max-width: 560px) {
  .wg-ep .choices { flex-direction: column; align-items: stretch; width: min(320px, 100%); gap: 10px; }
  .wg-ep .choices button { width: 100%; }
}
/* a short screen (a phone on its side): tighter */
@media (max-height: 460px) {
  .wg-ep .ep-ty { font-size: 17px; }
  .wg-ep .choices { gap: 10px; }
  .wg-ep .choices button { font-size: 18px; letter-spacing: 1.5px; padding: 0 16px; }
  .wg-ep .ep-msg { height: 16px; margin-top: 5px; font-size: 14px; line-height: 16px; }
  .wg-ep .ep-next { flex-direction: row; gap: 10px; padding: 7px 14px 6px; }
  .wg-ep .ep-keys { display: none; }
}
`;

// copy the link: the async clipboard, else a selected textarea and execCommand (older iOS)
async function copyLink(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return !!ok;
  } catch { return false; }
}

export function episodeEnd(W = window.WAGMI) {
  if (W._episodeUp) return W._episodeUp;
  if (!document.getElementById('wg-ep-css')) { const st = document.createElement('style'); st.id = 'wg-ep-css'; st.textContent = CSS; document.head.appendChild(st); }
  const host = document.getElementById('wg') || document.body;
  const el = document.createElement('div');
  // (wg-big: the game's own "a question is on screen", read by the pause menu and the pad; its look is all ours)
  el.className = 'wg-big wg-ep';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'wg-ep-h');
  el.innerHTML = `<div class="ep-in">
    <div class="ep-logo">MOG <b>CITY</b></div>
    <div class="ep-h" id="wg-ep-h">END OF EPISODE 1</div>
    <div class="ep-rule"></div>
    <div class="ep-ty">Thanks for playing. Dan isn't done yet.</div>
    <div class="choices">
      <button type="button" class="sel" data-a="explore">Keep exploring</button>
      <button type="button" data-a="replay">Replay a mission</button>
      <button type="button" data-a="share">Share the game</button>
    </div>
    <div class="ep-msg" aria-live="polite"></div>
    <div class="ep-next"><span class="k">MISSION 4 · COMING SOON</span><span class="s">Rook knows where your laptop is going.</span></div>
    <div class="ep-keys"><kbd>←</kbd><kbd>→</kbd> choose · <kbd>Enter</kbd> OK · <kbd>Esc</kbd> keep exploring</div>
  </div>`;
  host.appendChild(el);
  const btns = [...el.querySelectorAll('.choices button')], msg = el.querySelector('.ep-msg');
  const app = W?.app, cm = app?.controllerManager;
  let sel = 0, t0 = performance.now(), msgT = 0, sharing = false, done = null;
  const draw = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
  const say = (text, secs = 2.6) => { msg.textContent = text; msg.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => msg.classList.remove('on'), secs * 1000); };

  // the share sheet where the browser has one; else (no API, a refusal, or an API with no sheet behind it: a share
  // still pending 1.5 s on with the page never losing focus to a sheet, as in a headless browser) the link copied
  async function share() {
    if (sharing) return; sharing = true;
    try {
      if (!shareDead && typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(SHARE))) {
        let left = false; const away = () => { left = true; };
        addEventListener('blur', away); addEventListener('pagehide', away); document.addEventListener('visibilitychange', away);
        let r;
        try {
          r = await Promise.race([
            navigator.share(SHARE).then(() => 'ok', (e) => (e && e.name === 'AbortError' ? 'cancel' : 'fail')),
            new Promise((res) => setTimeout(() => res(left ? 'open' : 'none'), 1500)),
          ]);
        } catch { r = 'fail'; }
        removeEventListener('blur', away); removeEventListener('pagehide', away); document.removeEventListener('visibilitychange', away);
        if (r === 'ok' || r === 'cancel' || r === 'open') return;
        if (r === 'none') shareDead = true;
      }
      if (await copyLink(SHARE.url)) say('Link copied');
      else say('mc.gamemog.com', 6);
    } finally { sharing = false; }
  }

  function close(choice) {
    if (!el.isConnected || !el.classList.contains('on')) return;
    removeEventListener('keydown', onKey, true);
    el.classList.remove('on'); el.style.pointerEvents = 'none';
    clearTimeout(msgT);
    setTimeout(() => el.remove(), 800);
    cm?.resetInput?.();
    W._episodeUp = null;
    done?.(choice);
  }
  function pick(a) {
    if (a === 'share') { sel = 2; draw(); share(); return; }
    close(a);
  }
  // (the keys are the card's while it is up: none reach the city; fresh presses only, none in its first moment)
  function onKey(e) {
    if (!el.classList.contains('on') || W?.paused) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.repeat || performance.now() - t0 < 600) return;
    const c = e.code;
    if (/^(ArrowLeft|ArrowUp|KeyA|KeyW)$/.test(c) || (c === 'Tab' && e.shiftKey)) { sel = (sel + btns.length - 1) % btns.length; draw(); }
    else if (/^(ArrowRight|ArrowDown|KeyD|KeyS|Tab)$/.test(c)) { sel = (sel + 1) % btns.length; draw(); }
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') pick(ACTS[sel]);
    else if (c === 'Escape') pick('explore');
  }
  btns.forEach((b, i) => b.addEventListener('click', (e) => { e.stopPropagation(); if (performance.now() - t0 < 400) return; sel = i; draw(); pick(b.dataset.a); }));
  // (a finger or the mouse on the card is the card's: not the stick's, not the view's)
  for (const t of ['pointerdown', 'touchstart', 'wheel']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });

  const P = new Promise((res) => { done = res; });
  W._episodeUp = P;
  addEventListener('keydown', onKey, true);
  // (the mouse given back for the buttons: the game's own letting go, so the pause menu doesn't take it for an Esc)
  if (document.pointerLockElement) { try { document.exitPointerLock(); } catch {} }
  cm?.resetInput?.();
  void el.offsetWidth; el.classList.add('on'); t0 = performance.now();
  return P;
}

// the pause menu opened on its Mission select (mission/pause.js), the choices in focus
export function openMissionSelect(W = window.WAGMI) {
  const pause = W?.ui?.pause; if (!pause) return false;
  if (typeof pause.openTo === 'function') { pause.openTo('select'); return true; }
  pause.open();
  const item = [...document.querySelectorAll('#wg-pause .menu .mi')].find((b) => /mission select/i.test(b.textContent || ''));
  if (!item) return true;
  item.click();
  // (into its list, as Enter there would: the arrows then choose a mission)
  const e = new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true, cancelable: true });
  (document.body || document).dispatchEvent(e);
  return true;
}

export const EPISODE_SHARE = SHARE;
