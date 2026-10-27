// Mog City: the game pad. Xbox, PlayStation and the other 'standard' pads, through js/gamepad-controls.js (ported
// from Slop New York by Mr.doob, MIT, commit 9c39d20). This layer takes the pad over from the sandbox's map (no travel
// mode swap on the shoulders, no camera cycle on Y, no sandbox map on Start) and plays the game with it, GTA style:
// the sticks and triggers go straight into the controls (js/controllers.js setGamepadInput, the camera's
// applyGamepadInput), and every button is sent as the key the game already knows for it (a KeyboardEvent marked
// e.wgPad, which the game's own F takes as a real key). So the fight, the car, the missions, the pause menu, the help
// offers and the cutscenes need nothing of their own for it, and the keyboard works as before.
//   ON FOOT    LS move (camera-relative, as the keys and the touch stick: js/controllers.js; in a fight the fight's
//              footwork reads it the same way)   RS look   A jump (Space)
//              X strike (J)   Y get in (F) with the car's prompt or a hold-F ring up, else heavy (K)   B dodge (C)
//              LB counter (L)   RB grab · pick up · throw (E)   LT held, or L3 (on until the stick lets go): sprint
//   IN THE CAR RT drive   LT brake · reverse   LS steer   RS look   A hop (Space)   X boost   LB · RB dash left · right
//              (Z · C)   Y get out (F)   B reset car to road (X)   D-pad up electric · engine (Q)   D-pad right · left
//              radio station next · back (R)   D-pad down radio off · on (T)
//   ALWAYS     Start pause (Esc)   View map (M)   R3 the brief (B)
//   MENUS      the pause menu, the fail screen, the start gate: D-pad or LS choose, A OK, B back (Start resumes play)
//   CUTSCENES  hold A to skip (as Space held); nothing else gets through
//   HELP OFFER 'Need a hand?' (its options 1 · 2 · 3): D-pad up · right · down (the game goes on under it, so not A)
//   FULL MAP   LS pans, RT · LT zoom, B · View · Start close it
// A button does what it meant when it went down: held through a change (into a cutscene, out of the car) it does
// nothing new, and lets go of its key when it comes up.
// While a pad is the last thing used (body.wg-pad) the UI shows its buttons in place of the keys: every key cap (kbd)
// on screen is swapped for the button that does that there (in the car or on foot, in the pause menu, in the help
// offer), drawn as that pad's own (Xbox letters, PlayStation shapes, letters for any other), and swapped back on a key
// or a click. A pad press can't start the page's sound by itself (the browser waits for a key or a click), so until
// one comes: a small 'press any key or click for sound'.
//   WAGMI.pad   { active (a pad the last used), family ('xbox' | 'ps' | 'generic'), glyph(id) -> '<kbd>' html,
//                 ids: the buttons' names (A B X Y LB RB LT RT LS RS L3 R3 Up Down Left Right View Start) }
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 };
const IDS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'LS', 'RS', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'View', 'Start'];

/* ------------------------------------------------------------- the glyphs -- */
// (Xbox: its letters in their colours; PlayStation: its shapes; any other pad: the letters, which the standard layout
// follows)
const SHAPE = {
  A: '<path d="M5.6 5.6l8.8 8.8M14.4 5.6l-8.8 8.8"/>',
  B: '<circle cx="10" cy="10" r="5"/>',
  X: '<rect x="5.4" y="5.4" width="9.2" height="9.2" rx=".6"/>',
  Y: '<path d="M10 4.4l5.6 9.8H4.4z"/>',
};
const DPAD = { Up: 'M7.6 2.6h4.8v5h-4.8z', Down: 'M7.6 12.4h4.8v5h-4.8z', Left: 'M2.6 7.6h5v4.8h-5z', Right: 'M12.4 7.6h5v4.8h-5z' };
const ICON = {
  View: '<rect x="4" y="5" width="8" height="6.5" rx="1.2"/><rect x="8" y="8.5" width="8" height="6.5" rx="1.2"/>',
  Start: '<path d="M5.2 6.4h9.6M5.2 10h9.6M5.2 13.6h9.6"/>',
};
const svg = (inner, cls = '') => `<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
export function glyphParts(id, fam, psNew) {
  const ps = fam === 'ps';
  if (id in SHAPE) return ps ? { cls: `wgp-face wgp-ps wgp-${id.toLowerCase()}`, html: svg(SHAPE[id]), name: { A: 'Cross', B: 'Circle', X: 'Square', Y: 'Triangle' }[id] }
    : { cls: `wgp-face wgp-${id.toLowerCase()}`, html: `<span>${id}</span>`, name: id };
  if (id === 'LB' || id === 'RB') { const t = ps ? id[0] + '1' : id; return { cls: 'wgp-sh', html: `<span>${t}</span>`, name: t }; }
  if (id === 'LT' || id === 'RT') { const t = ps ? id[0] + '2' : id; return { cls: 'wgp-sh wgp-tr', html: `<span>${t}</span>`, name: t }; }
  if (id === 'LS' || id === 'RS' || id === 'L3' || id === 'R3') return { cls: `wgp-st${id[1] === '3' ? ' wgp-click' : ''}`, html: `<span>${id}</span>`, name: id };
  if (id in DPAD) return { cls: 'wgp-dp', html: svg(`<path class="b" d="M7.6 2.6h4.8v5h5v4.8h-5v5H7.6v-5h-5V7.6h5z"/><path class="o" d="${DPAD[id]}"/>`), name: 'D-pad ' + id.toLowerCase() };
  if (id === 'View' || id === 'Start') {
    if (ps) { const t = id === 'Start' ? 'OPTIONS' : psNew ? 'CREATE' : 'SHARE'; return { cls: 'wgp-sh wgp-word', html: `<span>${t}</span>`, name: t }; }
    if (fam === 'generic') { const t = id === 'Start' ? 'START' : 'BACK'; return { cls: 'wgp-sh wgp-word', html: `<span>${t}</span>`, name: t }; }
    return { cls: 'wgp-face wgp-sys', html: svg(ICON[id]), name: id === 'Start' ? 'Menu' : 'View' };
  }
  return null;
}

export function install(W) {
  const app = W.app, gp = app.gamepadControls, cm = app.controllerManager, cs = app.cameraSystem;
  // (on foot the walk is the city's, camera-relative for the keys, the touch stick and this pad alike: js/controllers.js
  // walkToward. While a camera of the game's own holds the view (the fight's, round a fight and for a beat after it; a
  // cutscene's), the walk leaves its orbit alone: that camera keeps the view where it is itself)
  W.person.viewHeld = () => !!(W.cutscene || W.directed || (W.combat?.debug?.c?.cam?.weight ?? 0) > 0.003);
  if (!gp || typeof gp.attach !== 'function') return;
  const body = document.body.classList;

  /* --------------------------------------------------- the keys it sends -- */
  const NAME = { Space: ' ', Enter: 'Enter', Escape: 'Escape', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  const keyName = (code) => NAME[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
  // (on the page's body, as a real key comes: through every listener the keyboard's goes through, in the same order)
  function send(type, code, repeat = false) {
    const e = new KeyboardEvent(type, { code, key: keyName(code), bubbles: true, cancelable: true, repeat });
    e.wgPad = true;
    (document.body || document).dispatchEvent(e);
  }
  const tap = (code, repeat = false) => { send('keydown', code, repeat); send('keyup', code, repeat); };
  // the keys held down for buttons held down (button -> code), let go with them
  const down = new Map();
  const hold = (i, code) => { if (down.has(i)) return; down.set(i, code); send('keydown', code); };
  const letGo = (i) => { const code = down.get(i); if (code == null) return; down.delete(i); send('keyup', code); };
  // (from inside a reset, which can come in the middle of another key's handling: let go just after it)
  function letAllGo() { const codes = [...down.values()]; down.clear(); if (codes.length) queueMicrotask(() => { for (const c of codes) send('keyup', c); }); }

  /* ------------------------------------------------- where the game is at -- */
  const failUp = () => !!document.querySelector('#wg .wg-big.on .choices');
  function where() {
    if (!app.ready) return 'off';
    if (app.mapSystem?.isFullMapOpen) return 'map';
    if (W.paused) return 'pause';
    if (failUp()) return 'fail';
    if (body.contains('wg-gating')) return 'gate';
    if (W.cutscene || W.directed || W.cineSkip || body.contains('wg-cine')) return 'cine';
    return cm.activeMode === 'car' ? 'car' : 'foot';
  }

  /* ------------------------------------------------- the sticks and pedals -- */
  let analog = false;
  const set = (a, v) => { cm.setGamepadInput(a, v); };
  function still() { if (!analog) return; analog = false; cm.clearGamepadInput(); }
  function drive(s, L, sprint, inCar) {
    analog = true;
    set('up', 0); set('down', 0);
    if (inCar) {
      // (the pedals are the triggers; the stick only steers)
      set('forward', s.value(BTN.RT)); set('backward', s.value(BTN.LT));
      set('left', Math.max(0, -L.x)); set('right', Math.max(0, L.x));
      set('boost', s.held[BTN.X] ? 1 : 0);
      return;
    }
    set('boost', sprint ? 1 : 0);
    // the stick as W A S D (up W): the walk turns him to the way it points from the camera and takes him that way, the
    // view held where it looks (js/controllers.js walkToward); the fight's footwork reads it the same way
    set('forward', Math.max(0, -L.y)); set('backward', Math.max(0, L.y)); set('left', Math.max(0, -L.x)); set('right', Math.max(0, L.x));
  }
  function look(s, R, inCar) {
    if (!R.x && !R.y) return;
    cs.applyGamepadInput(R.x, R.y, 0, s.dt);
    // (in the car the view goes back behind it soon after the stick lets go, GTA's way)
    if (inCar) cs.userOrbitTimer = Math.min(cs.userOrbitTimer, 0.7);
  }

  /* ----------------------------------------------------------- the menus -- */
  // a direction from the D-pad or the left stick (past half way), as an arrow key: once when pushed, and (held, where
  // the menu takes it) again after 0.4 s and every 0.12 s
  const nav = { dir: null, t: 0 };
  function dirOf(s, L) {
    if (s.held[BTN.Up]) return 'Up'; if (s.held[BTN.Down]) return 'Down'; if (s.held[BTN.Left]) return 'Left'; if (s.held[BTN.Right]) return 'Right';
    if (Math.max(Math.abs(L.x), Math.abs(L.y)) < 0.5) return null;
    return Math.abs(L.y) >= Math.abs(L.x) ? (L.y < 0 ? 'Up' : 'Down') : (L.x < 0 ? 'Left' : 'Right');
  }
  function navStep(s, L, repeat) {
    const d = dirOf(s, L);
    if (d !== nav.dir) { nav.dir = d; nav.t = 0.4; return d ? { d, rep: false } : null; }
    if (!d || !repeat) return null;
    if ((nav.t -= s.dt) > 0) return null;
    nav.t = 0.12; return { d, rep: true };
  }

  /* ------------------------------------------------------------ the radio -- */
  function stationBack() {
    const R = W.radio; if (!R?.stations?.length) return;
    if (!R.on) return tap('KeyR'); // (off: R puts it back on)
    const n = R.stations.length; R.tune?.(R.stations[(R.idx - 1 + n) % n].id);
  }

  /* -------------------------------------------------------- each frame -- */
  let was = null, sprintLatch = false, latchIdle = 0, rideWas = null, ridePush = false;
  const layer = {
    reset() { letAllGo(); sprintLatch = false; analog = false; },
    idle() { letAllGo(); still(); },
    read(s) {
      const L = s.stick(0), R = s.stick(2), E = s.edges;
      fam(s.pad.id);
      if (E.some(Boolean) || Math.hypot(L.x, L.y) > 0.35 || Math.hypot(R.x, R.y) > 0.35 || s.value(BTN.LT) > 0.3 || s.value(BTN.RT) > 0.3) usePad();
      // (a button let go lets go of its key)
      for (const [i] of down) if (!s.held[i]) letGo(i);
      const at = where();
      // (a direction already held as a menu comes up doesn't count as a push in it)
      if (at !== was) { nav.dir = dirOf(s, L); was = at; }
      if (at === 'off') return still();
      if (at === 'map') {
        still();
        if (E[BTN.B] || E[BTN.View] || E[BTN.Start]) return tap('Escape'); // (the map's own Esc closes it)
        const ms = app.mapSystem, z = s.value(BTN.RT) - s.value(BTN.LT);
        let moved = false;
        if (L.x || L.y) { const k = 650 * s.dt / ms.viewZoom; ms.viewCenterX += L.x * k; ms.viewCenterZ += L.y * k; moved = true; }
        if (Math.abs(z) > 0.05) { ms.viewZoom = Math.max(0.015, Math.min(3, ms.viewZoom * Math.exp(z * 1.8 * s.dt))); moved = true; }
        if (moved) ms.renderFullMap?.();
        return;
      }
      if (at === 'pause') {
        still();
        const n = navStep(s, L, true); if (n) tap('Arrow' + n.d, n.rep);
        if (E[BTN.A]) tap('Enter');
        else if (E[BTN.B]) tap('Escape');
        else if (E[BTN.Start]) W.ui?.pause?.close?.();
        return;
      }
      if (at === 'fail') {
        still();
        const n = navStep(s, L, false); if (n && (n.d === 'Left' || n.d === 'Right')) tap('Arrow' + n.d);
        if (E[BTN.A]) tap('Enter');
        return;
      }
      if (at === 'gate') {
        still();
        // (the arrows choose only on the save's gate, CONTINUE or NEW GAME: on the plain one any key starts)
        const n = navStep(s, L, false); if (n && (n.d === 'Up' || n.d === 'Down') && document.querySelector('#wg .m3save')) tap('Arrow' + n.d);
        if (E[BTN.A] || E[BTN.Start]) tap('Enter');
        return;
      }
      if (at === 'cine') {
        still();
        if (E[BTN.A]) hold(BTN.A, 'Space'); // (held: the skip's ring fills, as with Space)
        if (E[BTN.Start]) tap('Escape');
        return;
      }
      // ---- play: on foot or in the car
      const inCar = at === 'car';
      if (E[BTN.Start]) tap('Escape');
      if (E[BTN.View]) tap('KeyM');
      if (E[BTN.R3]) tap('KeyB');
      // (the help offer's options on the D-pad while it is up)
      const offering = body.contains('wg-offering');
      if (offering) { const o = E[BTN.Up] ? '1' : E[BTN.Right] ? '2' : E[BTN.Down] ? '3' : null; if (o) tap('Digit' + o); }
      // getting in or out: Y skips it (as F), and a fresh push on the pedals or the stick, as W or S, keeps him driving
      // (braking to get out) or skips the walk
      const ride = W.ride?.phase || null;
      if (ride) {
        const push = s.value(BTN.RT) > 0.5 || s.value(BTN.LT) > 0.5 || Math.hypot(L.x, L.y) > 0.5;
        if (ride !== rideWas) ridePush = push;
        else if (push && !ridePush) tap(s.value(BTN.LT) > 0.5 || L.y > 0.5 ? 'KeyS' : 'KeyW');
        ridePush = push;
        if (E[BTN.Y]) tap('KeyF');
      }
      rideWas = ride;
      if (inCar) {
        if (!ride) {
          if (E[BTN.Y]) tap('KeyF');
          if (E[BTN.B]) tap(W.recoverCar?.key || 'KeyX');
          if (E[BTN.A]) hold(BTN.A, W.thrusters?.keys?.hop || 'Space');
          if (E[BTN.LB]) tap(W.thrusters?.keys?.left || 'KeyZ');
          if (E[BTN.RB]) tap(W.thrusters?.keys?.right || 'KeyC');
          if (!offering) {
            if (E[BTN.Up]) tap('KeyQ');
            if (E[BTN.Right]) tap('KeyR');
            if (E[BTN.Left]) stationBack();
            if (E[BTN.Down]) tap('KeyT');
          }
        }
        drive(s, L, false, true);
        look(s, R, true);
        return;
      }
      // on foot
      if (!ride) {
        if (E[BTN.A]) hold(BTN.A, 'Space');
        if (E[BTN.X]) tap('KeyJ');
        // (Y: the car's door when it is offered, or a hold-F ring is up (held as long as Y is), else the heavy)
        if (E[BTN.Y]) { if (/^F/.test(W.prompt || '') || body.contains('wg-holding')) hold(BTN.Y, 'KeyF'); else tap('KeyK'); }
        if (E[BTN.B]) tap('KeyC');
        if (E[BTN.LB]) tap('KeyL');
        if (E[BTN.RB]) tap('KeyE');
      }
      // sprint: LT held, or L3 clicked (on until the stick comes back to the middle a moment)
      if (E[BTN.L3]) sprintLatch = !sprintLatch;
      if (Math.hypot(L.x, L.y) < 0.2) { if ((latchIdle += s.dt) > 0.3) sprintLatch = false; } else latchIdle = 0;
      drive(s, L, sprintLatch || s.held[BTN.LT], false);
      look(s, R, false);
    },
  };

  /* ------------------------------------------------- what the UI shows -- */
  let family = 'xbox', psNew = false, padId = '';
  function fam(id = '') {
    if (id === padId) return;
    padId = id;
    const t = id.toLowerCase();
    const f = /045e|xbox|xinput/.test(t) ? 'xbox' : /054c|playstation|dualshock|dualsense|wireless controller/.test(t) ? 'ps' : 'generic';
    psNew = /dualsense|0ce6|0df2/.test(t);
    if (f !== family) { family = f; W.pad.family = f; if (active) swapAll(true); }
  }
  // (a button drawn for good, the pause menu's Controller column: data-native, kept in either mode, redrawn for a new pad)
  const glyphHTML = (id) => { const g = glyphParts(id, family, psNew); return g ? `<kbd class="wgp ${g.cls}" data-pad="${id}" data-native="1" data-fam="${family}" aria-label="${g.name}">${g.html}</kbd>` : `<kbd>${id}</kbd>`; };
  // the button that does what a key cap names, there
  function padFor(kbd) {
    if (kbd.dataset.pad) return IDS.includes(kbd.dataset.pad) ? kbd.dataset.pad : null;
    const k = (kbd.dataset.k ?? kbd.textContent).trim().replace(/\s+/g, ' ').toUpperCase();
    const inPause = !!kbd.closest('#wg-pause'), inOffer = !!kbd.closest('.wg-offer');
    const car = kbd.closest('#wg-thr, #wg-toast, .wr-card, #wg-drive, .wg-reset, .wg-drivemode') ? true : kbd.closest('#wf') ? false : cm.activeMode === 'car';
    switch (k) {
      case 'F': return 'Y';
      case 'J': case 'LMB': case 'LEFT CLICK': return 'X';
      case 'K': case 'RMB': case 'RIGHT CLICK': return 'Y';
      case 'L': return 'LB';
      case 'Q': return car ? 'Up' : 'LB';
      case 'C': return car ? 'RB' : 'B';
      case 'Z': return 'LB';
      case 'E': return 'RB';
      case 'X': return 'B';
      case 'R': return 'Right';
      case 'T': return 'Down';
      case 'M': return 'View';
      case 'B': return 'R3';
      case 'ESC': case 'ESCAPE': return inPause ? 'B' : 'Start';
      case 'P': return 'Start';
      case 'ENTER': case 'SPACE': return 'A';
      case 'SHIFT': return car ? 'X' : 'L3';
      case 'WASD': case 'W A S D': case 'W': case 'A': case 'S': case 'D': return 'LS';
      case 'MOUSE': return 'RS';
      case '↑': return 'Up'; case '↓': return 'Down'; case '←': return 'Left'; case '→': return 'Right';
      case '1': return inOffer ? 'Up' : null;
      case '2': return inOffer ? 'Right' : null;
      case '3': return inOffer ? 'Down' : null;
    }
    return null;
  }
  const WGP = ['wgp', 'wgp-face', 'wgp-ps', 'wgp-a', 'wgp-b', 'wgp-x', 'wgp-y', 'wgp-sh', 'wgp-tr', 'wgp-st', 'wgp-click', 'wgp-dp', 'wgp-word', 'wgp-sys', 'wgp-dup'];
  function restore(kbd) {
    if (kbd.dataset.k == null) return;
    kbd.classList.remove(...WGP); kbd.textContent = kbd.dataset.k;
    delete kbd.dataset.k; delete kbd.dataset.g; kbd.removeAttribute('aria-label'); kbd._wgp = null;
  }
  function paint(kbd, id) {
    const g = glyphParts(id, family, psNew);
    kbd.classList.remove(...WGP); kbd.classList.add('wgp', ...g.cls.split(' '));
    kbd.dataset.g = id; kbd.setAttribute('aria-label', g.name);
    kbd.innerHTML = g.html; kbd._wgp = kbd.innerHTML;
  }
  function swap(kbd, force) {
    if (kbd.dataset.native) { if (kbd.dataset.fam !== family) { kbd.dataset.fam = family; paint(kbd, kbd.dataset.pad); } return; }
    if (!force && kbd._wgp != null && kbd._wgp === kbd.innerHTML) return; // (as it was left: nothing changed)
    // (its text changed under it since: that is the key now)
    if (kbd._wgp != null && kbd._wgp !== kbd.innerHTML) { delete kbd.dataset.k; kbd.classList.remove(...WGP); }
    const id = padFor(kbd);
    if (!id) { restore(kbd); return; }
    if (kbd.dataset.k == null) kbd.dataset.k = kbd.textContent;
    paint(kbd, id);
    // (two keys for one thing side by side, LMB J or Q L: one button)
    const prev = kbd.previousElementSibling;
    const between = prev ? (() => { let t = ''; for (let n = prev.nextSibling; n && n !== kbd; n = n.nextSibling) t += n.textContent; return t.trim(); })() : '';
    kbd.classList.toggle('wgp-dup', !!prev && prev.tagName === 'KBD' && prev.dataset.g === id && !between);
  }
  function swapAll(force = false, list = document.querySelectorAll('kbd')) {
    mo.disconnect();
    for (const k of list) if (k.isConnected) swap(k, force);
    mo.takeRecords();
    if (active) mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  const mo = new MutationObserver((recs) => {
    const todo = new Set();
    for (const r of recs) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const k = t?.closest?.('kbd'); if (k) { todo.add(k); continue; }
      for (const n of r.addedNodes) if (n.nodeType === 1) { if (n.tagName === 'KBD') todo.add(n); else for (const q of n.querySelectorAll('kbd')) todo.add(q); }
    }
    if (todo.size) swapAll(false, todo);
  });
  let active = false, modeWas = cm.activeMode;
  function usePad() {
    if (active) return;
    active = true; W.pad.active = true; body.add('wg-pad');
    app.setHintInput?.(true);
    swapAll(true);
    sound();
  }
  function useKeys() {
    if (!active) return;
    active = false; W.pad.active = false; body.remove('wg-pad');
    mo.disconnect();
    for (const k of document.querySelectorAll('kbd[data-k]')) restore(k);
    app.setHintInput?.(false);
    sound();
  }
  for (const ev of ['keydown', 'pointerdown', 'wheel']) addEventListener(ev, (e) => { if (e.isTrusted) useKeys(); }, { capture: true, passive: true });

  /* ------------------------------------------- the sound hint (no gesture) -- */
  const css = document.createElement('style');
  css.textContent = `
#wg-padsound { position: fixed; left: 50%; top: 14px; transform: translate(-50%, -8px); z-index: 70; display: flex; align-items: center; gap: 8px; padding: 7px 14px 7px 11px;
  border-radius: 10px; background: rgba(8,10,14,0.72); color: #fff; font: 600 15px/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: 1px; text-transform: uppercase;
  text-shadow: 0 1px 2px rgba(0,0,0,.8); pointer-events: none; opacity: 0; transition: opacity .3s, transform .3s; }
#wg-padsound.on { opacity: 1; transform: translate(-50%, 0); }
#wg-padsound svg { width: 17px; height: 17px; flex: none; fill: none; stroke: #FFC93C; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }`;
  document.head.appendChild(css);
  const tip = document.createElement('div'); tip.id = 'wg-padsound';
  tip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg><span>Press any key or click for sound</span>';
  document.body.appendChild(tip);
  const noSound = /[?&]noaudio\b/.test(location.search);
  const heard = () => noSound || (navigator.userActivation ? navigator.userActivation.hasBeenActive : true);
  let tipOn = false;
  function sound() { const on = active && !heard(); if (on !== tipOn) { tipOn = on; tip.classList.toggle('on', on); } }

  W.pad = { active: false, family, ids: IDS, glyph: glyphHTML };
  gp.attach(layer);
  // (polled on a frame of its own: the pause menu holds the city's)
  let last = performance.now(), soundT = 0;
  (function poll(now) {
    requestAnimationFrame(poll);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    try { gp.poll(dt); } catch (e) { console.warn('[pad]', e); }
    // (the key caps that depend on it: in the car or on foot)
    if (active && cm.activeMode !== modeWas) swapAll(true);
    modeWas = cm.activeMode;
    if (tipOn && (soundT += dt) > 0.25) { soundT = 0; sound(); }
  })(performance.now());
  console.log('[wagmi] game pad layer in');
}
