// Mog City: touch play, GTA-mobile style. The left thumb keeps the city's stick (js/touch-controls.js: on foot it
// walks him, in the car up is gas, down brake or reverse, sideways steer); the right thumb gets a cluster of buttons that
// changes with what Dan is doing:
//   ON FOOT    JUMP · SPRINT, and one big gold action button when the game wants something: GET IN (F; a second tap
//              while he walks to the door gets him in at once), the hold-F rings as a held button named for the job
//              (SEARCH the van, TAKE PHONE: the ring's progress drawn on it), TAKE DOWN (E, the M2 sneak), PICK UP /
//              THROW (E), STRIKE at a rig (J)
//   FIGHT      (fighting, or a man within 9 m) STRIKE (J) · HEAVY (K, glowing when the takedown or the finisher is up) ·
//              DODGE/COUNTER (L while a yellow cue is up, else C; it flashes with the cue) · GRAB / PICK UP / THROW (E,
//              only when there is something to take)
//   IN THE CAR BOOST · HOP (Space, held; a cooldown ring) · DASH ◀ ▶ (Z · C), once the thrusters have them; RESET CAR (X)
//              when it is stuck; and small pills: EXIT (F: at speed it brakes first), ELECTRIC / ENGINE (Q), RADIO (a tap,
//              R: next station; held 0.6 s, T: off / on). A fresh push of the stick while he is getting out keeps him
//              driving (W or S, as the keys do)
// Every button sends the key the game already knows (a KeyboardEvent marked e.wgPad, as wagmi/pad.js sends them: the
// game's own F takes it as the player's), so nothing in the game needs anything of its own for it. Buttons work with
// the stick at the same time (each its own pointer, captured), and let go on a blur, the page hidden, a turn of the
// phone and any change of context. Hidden in cutscenes, the start gate, the pause menu, the full map, the fail screen.
// While the last thing used was a finger (body.wg-touchlast: a touch sets it, a key or a mouse clears it, a game pad
// too), every key cap on screen reads as the button that does it (CSS only: kbd[data-touch], named by the key, or by the
// cap itself when it says, data-touch-as: mission/ui.js's [F|TAKE PHONE]; the text is never
// changed, so wagmi/pad.js's swap still reads it), a cap with no button is hidden, and the key-only prompts are put away
// (the F prompt, the fight's key lists, the radio card's keys, the end card's key line). In a fight the toolbar stays up, so Pause can be tapped.
// Nothing here runs on a desktop: the buttons and the style are made only once body.touch-enabled is set (the city's
// TouchControls: a coarse pointer, or the first touch). Portrait and landscape both: the cluster and the pills have a
// layout for each, and a turn mid-play just lets go and redraws.
//   window.WAGMI.touch  { root, context() ('off' | 'foot' | 'fight' | 'car'), action() (the action button's job or null) }
const TAG = '[wagmi] touch';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

(async function boot() {
  if (window.__wgTouch) return;
  window.__wgTouch = true;
  while (!(window.WAGMI?.ready && window.__NYC_APP?.ready)) await sleep(100);
  try { install(window.WAGMI, window.__NYC_APP); } catch (err) { console.error(TAG, err); }
})();

function install(W, app) {
  const cm = app.controllerManager, body = document.body.classList;
  const $ = (s) => document.querySelector(s);

  /* ---------------------------------------------------- the keys it sends -- */
  const NAME = { Space: ' ', Escape: 'Escape' };
  const keyName = (code) => NAME[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code);
  function send(type, code) {
    const e = new KeyboardEvent(type, { code, key: keyName(code), bubbles: true, cancelable: true });
    e.wgPad = true; e.wgTouch = true;
    (document.body || document).dispatchEvent(e);
  }
  const tap = (code) => { send('keydown', code); send('keyup', code); };

  /* ------------------------------------------ who is playing with a finger -- */
  // (set by a finger, cleared by a key or a mouse; never while a game pad is the last used: its glyphs win)
  addEventListener('pointerdown', (e) => {
    if (!e.isTrusted) return;
    if (e.pointerType === 'touch') { if (!body.contains('wg-pad')) body.add('wg-touchlast'); }
    else if (e.pointerType === 'mouse') body.remove('wg-touchlast');
  }, { capture: true, passive: true });
  addEventListener('keydown', (e) => { if (e.isTrusted) body.remove('wg-touchlast'); }, { capture: true, passive: true });

  /* ------------------------------------------------------ where he is at -- */
  const failUp = () => !!$('#wg .wg-big.on .choices');
  let fightT = 0;
  function nearFight(now) {
    const C = W.combat; if (!C) return false;
    let near = false;
    try {
      if (C.fighting) near = true;
      else { const P = W.person.position; near = C.enemies.some((e) => e.targetable && hdist(e.pos, P) < 9); }
    } catch { near = false; }
    if (near) fightT = now + 900; // (a beat of grace either side of 9 m, so the buttons don't flicker)
    return near || now < fightT;
  }
  function context(now = performance.now()) {
    if (!app.ready || !body.contains('touch-enabled')) return 'off';
    if (app.mapSystem?.isFullMapOpen || W.paused || body.contains('wg-paused')) return 'off';
    if (body.contains('wg-gating') || body.contains('wg-cine') || W.cutscene || W.directed || W.cineSkip) return 'off';
    if (failUp() || body.contains('wg-ko')) return 'off';
    if (cm.activeMode === 'car') return 'car';
    if (cm.activeMode !== 'person') return 'off';
    return nearFight(now) ? 'fight' : 'foot';
  }

  // the hold ring's job, as a button: 'Hold F to search the van' -> SEARCH, "take Mack's phone" -> TAKE PHONE (out of
  // reach, 'Walk up to the van, then hold F', by what it is about)
  const verbOf = (s) => { const w = s.split(' ').filter(Boolean), v = (w[0] || 'hold').toUpperCase(); return /^(TAKE|PICK|GRAB|OPEN|USE)$/.test(v) && w.length > 1 ? v + ' ' + w[w.length - 1].replace(/[^\w]/g, '').toUpperCase() : v; };
  function holdName() {
    const t = ($('#wg .wg-hold span')?.textContent || '').replace(/\s+/g, ' ').trim();
    const m = /^hold\b.*?\bto (.+)$/i.exec(t);
    if (m) return verbOf(m[1]);
    if (/\bvan\b/i.test(t)) return 'SEARCH';
    if (/\bphone\b/i.test(t)) return 'TAKE PHONE';
    return 'HOLD';
  }
  const holdK = () => { const c = $('#wg .wg-hold circle.p'); const off = c ? parseFloat(c.getAttribute('stroke-dashoffset')) : 56.5; return Math.max(0, Math.min(1, 1 - (isFinite(off) ? off : 56.5) / 56.5)); };
  const keyIn = (el, ...keys) => !!el && [...el.querySelectorAll('kbd')].some((k) => keys.includes((k.dataset.k ?? k.textContent).trim().toUpperCase()));

  // the gold button's job now: [id, label, kind ('tap' | 'hold'), code]
  function action(c) {
    if (c === 'off') return null;
    const ride = W.ride?.phase || null;
    if (c !== 'car') {
      // (a hold-F ring in reach first: it is the objective; then the car's door)
      const ring = $('#wg .wg-hold');
      if (body.contains('wg-holding') && ring?.classList.contains('on') && !ring.classList.contains('far')) return ['hold', holdName(), 'hold', 'KeyF'];
      if ((ride && ride !== 'bail' && W.ride.mode === 'car') || /^F/.test(W.prompt || '')) return ['getin', 'GET IN', 'tap', 'KeyF'];
      const m2 = $('#wg .m2-prompt.on');
      if (m2 && keyIn(m2, 'E')) return ['takedown', 'TAKE DOWN', 'tap', 'KeyE'];
      if (c === 'foot') {
        if ($('#wf .wf-held.wf-on')) return ['throw', 'THROW', 'tap', 'KeyE'];
        if ($('#wf .wf-offer.wf-on')) return ['pickup', 'PICK UP', 'tap', 'KeyE'];
        const m3 = $('#m3o .prompt.on');
        if (m3 && keyIn(m3, 'J')) return ['strike', 'STRIKE', 'tap', 'KeyJ'];
      }
      return null;
    }
    if (!ride && /^X/.test(W.prompt || '')) return ['reset', 'RESET CAR', 'tap', W.recoverCar?.key || 'KeyX'];
    return null;
  }
  // the fight's cue: 'y' (a yellow one up: counter), 'r' (a red one: dodge) or ''
  function cue() {
    let red = false;
    for (const q of document.querySelectorAll('#wf .wf-cue.wf-on')) { if (!q.classList.contains('wf-dodge')) return 'y'; red = true; }
    return red ? 'r' : '';
  }
  function grabWhat() {
    if ($('#wf .wf-held.wf-on')) return 'THROW';
    if ($('#wf .wf-daze.wf-on')) return 'GRAB';
    if ($('#wf .wf-offer.wf-on')) return 'PICK UP';
    return null;
  }
  const driveLabel = () => { const t = ($('#wg-drive .w')?.textContent || '').trim(); return t ? t.toUpperCase() : ''; };

  /* ------------------------------------------------------------ the style -- */
  const T = 'body.wg-touchlast:not(.wg-pad)';
  const CSS = `
#wg-touch { display: none; }
body.touch-enabled #wg-touch { display: block; position: fixed; z-index: 25; right: max(12px, env(safe-area-inset-right)); bottom: max(10px, env(safe-area-inset-bottom));
  width: 270px; height: 232px; pointer-events: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
body.touch-enabled #wg-touch[hidden], body.wg-cine #wg-touch, body.wg-gating #wg-touch, body.wg-paused #wg-touch { display: none !important; }
body.wg-tc #touch-controls .touch-actions { display: none !important; }
#wg-touch .wgt { position: absolute; right: var(--x, 0); bottom: var(--y, 0); width: var(--s, 64px); height: var(--s, 64px); display: none; box-sizing: border-box;
  flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 0; margin: 0; border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,.34); background: rgba(10,12,18,.58); color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.35);
  font: 700 13px/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .07em; text-transform: uppercase;
  text-shadow: 0 1px 2px rgba(0,0,0,.6); pointer-events: auto; touch-action: none; cursor: pointer; transition: transform .08s, background-color .12s, border-color .12s; }
#wg-touch .wgt.on { display: flex; }
#wg-touch .wgt .g { font-size: 20px; line-height: 1; letter-spacing: 0; }
#wg-touch .wgt .l { white-space: nowrap; }
#wg-touch .wgt.big .l { font-size: 15px; }
#wg-touch .wgt.down { transform: scale(.92); background: rgba(255,201,60,.9); border-color: #FFC93C; color: #0A0C10; text-shadow: none; }
#wg-touch .wgt::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; pointer-events: none; opacity: 0;
  background: conic-gradient(#FFC93C calc(var(--k, 0) * 360deg), rgba(255,255,255,.14) 0);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px)); }
#wg-touch .wgt.ring::before { opacity: 1; }
#wg-touch .wgt.cool { opacity: .55; }
#wg-touch .wgt.gold { background: #FFC93C; border-color: #FFE08A; color: #0A0C10; text-shadow: none; box-shadow: 0 0 0 4px rgba(255,201,60,.22), 0 6px 22px rgba(0,0,0,.4); }
#wg-touch .wgt.gold.down { background: #FFE08A; }
#wg-touch .wgt.gold .l { font-size: 15px; line-height: 1.02; text-align: center; white-space: normal; max-width: 86%; }
#wg-touch .wgt.glow { border-color: #FFC93C; color: #FFC93C; box-shadow: 0 0 0 3px rgba(255,201,60,.3), 0 0 22px rgba(255,201,60,.55); }
#wg-touch .wgt.cue-y { background: #FFC93C; border-color: #FFE08A; color: #15171C; text-shadow: none; box-shadow: 0 0 0 4px rgba(255,201,60,.35), 0 0 24px rgba(255,201,60,.8); animation: wgtCue .16s ease-in-out infinite alternate; }
#wg-touch .wgt.cue-r { background: #EF4444; border-color: #FCA5A5; color: #fff; box-shadow: 0 0 0 4px rgba(239,68,68,.32), 0 0 24px rgba(239,68,68,.8); }
/* (a cue's colours at once: its dark letters never on the dark face while the gold eases in) */
#wg-touch .wgt.cue-y, #wg-touch .wgt.cue-r { transition: none; }
@keyframes wgtCue { to { transform: scale(1.07); } }
#wg-touch .pills { position: fixed; display: none; gap: 8px; right: max(16px, env(safe-area-inset-right)); top: calc(max(12px, env(safe-area-inset-top)) + 64px); pointer-events: none; }
#wg-touch[data-c='car'] .pills { display: flex; }
#wg-touch .pill { display: none; align-items: center; justify-content: center; gap: 6px; min-width: 64px; min-height: 44px; padding: 0 14px; box-sizing: border-box; border-radius: 22px;
  border: 1.5px solid rgba(255,255,255,.3); background: rgba(10,12,18,.62); color: #fff; font: 700 14px/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase;
  pointer-events: auto; touch-action: none; cursor: pointer; white-space: nowrap; }
#wg-touch .pill.on { display: inline-flex; }
#wg-touch .pill.down { background: rgba(255,201,60,.9); border-color: #FFC93C; color: #0A0C10; }
#wg-touch .pill.ev { color: #45E3FF; border-color: rgba(69,227,255,.55); }
#wg-touch .pill.eng { color: #FFB547; border-color: rgba(255,181,71,.5); }
#wg-touch .pill.off { opacity: .6; }
#wg-touch .pill.exit { border-color: rgba(255,255,255,.55); }
/* landscape: the cluster in the bottom-right 270 x 232; the pills in a row under the toolbar */
#wg-touch[data-c='foot'] [data-b='act'] { --x: 40px; --y: 98px; --s: 80px; }
#wg-touch[data-c='foot'] [data-b='sprint'] { --x: 14px; --y: 16px; --s: 64px; }
#wg-touch[data-c='foot'] [data-b='jump'] { --x: 92px; --y: 16px; --s: 64px; }
#wg-touch[data-c='fight'] [data-b='strike'] { --x: 12px; --y: 14px; --s: 84px; }
#wg-touch[data-c='fight'] [data-b='heavy'] { --x: 108px; --y: 12px; --s: 64px; }
#wg-touch[data-c='fight'] [data-b='dodge'] { --x: 22px; --y: 108px; --s: 64px; }
#wg-touch[data-c='fight'] [data-b='grab'] { --x: 104px; --y: 90px; --s: 56px; }
#wg-touch[data-c='fight'] [data-b='act'], #wg-touch[data-c='car'] [data-b='act'] { --x: 180px; --y: 96px; --s: 72px; }
#wg-touch[data-c='car'] [data-b='boost'] { --x: 12px; --y: 14px; --s: 84px; }
#wg-touch[data-c='car'] [data-b='hop'] { --x: 108px; --y: 12px; --s: 64px; }
#wg-touch[data-c='car'] [data-b='dashR'] { --x: 26px; --y: 110px; --s: 56px; }
#wg-touch[data-c='car'] [data-b='dashL'] { --x: 104px; --y: 92px; --s: 56px; }
/* portrait: the same buttons a size down, in the bottom-right 200 x 250 (the stick keeps the bottom-left), the pills a
   column on the right edge, below the help card and above the hold ring (58%) */
@media (orientation: portrait) {
  body.touch-enabled #wg-touch { width: min(200px, calc(100vw - 176px)); height: 250px; right: max(10px, env(safe-area-inset-right)); }
  #wg-touch .wgt { font-size: 12px; }
  #wg-touch .wgt.gold .l, #wg-touch .wgt.big .l { font-size: 14px; }
  #wg-touch .pills { flex-direction: column; align-items: flex-end; top: max(calc(max(12px, env(safe-area-inset-top)) + 200px), 30vh); right: max(12px, env(safe-area-inset-right)); }
  #wg-touch[data-c='foot'] [data-b='act'] { --x: 28px; --y: 90px; --s: 72px; }
  #wg-touch[data-c='foot'] [data-b='sprint'] { --x: 12px; --y: 14px; --s: 60px; }
  #wg-touch[data-c='foot'] [data-b='jump'] { --x: 86px; --y: 14px; --s: 60px; }
  #wg-touch[data-c='fight'] [data-b='strike'] { --x: 10px; --y: 12px; --s: 72px; }
  #wg-touch[data-c='fight'] [data-b='heavy'] { --x: 90px; --y: 10px; --s: 60px; }
  #wg-touch[data-c='fight'] [data-b='dodge'] { --x: 16px; --y: 94px; --s: 60px; }
  #wg-touch[data-c='fight'] [data-b='grab'] { --x: 90px; --y: 84px; --s: 56px; }
  #wg-touch[data-c='fight'] [data-b='act'], #wg-touch[data-c='car'] [data-b='act'] { --x: 58px; --y: 166px; --s: 64px; }
  #wg-touch[data-c='car'] [data-b='boost'] { --x: 10px; --y: 12px; --s: 72px; }
  #wg-touch[data-c='car'] [data-b='hop'] { --x: 90px; --y: 10px; --s: 60px; }
  #wg-touch[data-c='car'] [data-b='dashR'] { --x: 18px; --y: 96px; --s: 52px; }
  #wg-touch[data-c='car'] [data-b='dashL'] { --x: 92px; --y: 84px; --s: 52px; }
}
/* (z 25: over the fight's own layer (24), so a man's edge arrow or name tag that lands in the thumb's corner goes
   under the buttons, not over their names) */
/* in the car (the pills) and in a fight (the hit counter, which css/style.css moves up the right edge) the look hint
   makes room */
body.wg-tc-busy .touch-look-hint { display: none !important; }
/* a fight on touch keeps the toolbar (Pause, Map) up */
body.touch-enabled.wf-fight .hud-top-right { opacity: 1 !important; pointer-events: auto !important; }
/* the key-only prompts, put away for a finger: the buttons stand in for them */
${T} #wg-prompt, ${T} #wf .wf-hint, ${T} #wf .wf-keys, ${T} .wr-card .ky, ${T} #wg .ep-keys { display: none !important; }
/* every key cap reads as the button that does it (the cap's own text kept, unseen) */
${T} kbd[data-touch] { display: inline-block !important; font-size: 0 !important; letter-spacing: 0 !important; min-width: 0 !important; vertical-align: baseline; }
${T} kbd[data-touch]::after { content: attr(data-touch); font: 700 12px/1.25 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
${T} kbd[data-touch=''], ${T} kbd[data-touch-dup], ${T} .wg-skip kbd { display: none !important; }
/* (the hold ring and the M2 sneak prompt are rewritten by the game every frame: their caps are named by the style alone,
   no mark on the cap, or the rewrite would undo it; the ring's job comes in as --wgt-hold on the body) */
${T} #wg .wg-hold kbd, ${T} #wg .m2-prompt kbd { display: inline-block !important; font-size: 0 !important; letter-spacing: 0 !important; min-width: 0 !important; vertical-align: baseline; }
${T} #wg .wg-hold kbd::after, ${T} #wg .m2-prompt kbd::after { font: 700 12px/1.25 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
${T} #wg .wg-hold kbd::after { content: var(--wgt-hold, 'HOLD'); }
${T} #wg .m2-prompt kbd::after { content: 'TAKE DOWN'; }`;

  /* ---------------------------------------------------------- the buttons -- */
  const BTN = [
    // id, label, glyph, class
    ['act', '', '', 'gold'],
    ['jump', 'JUMP', '↑', ''], ['sprint', 'SPRINT', '»', ''],
    ['strike', 'STRIKE', '', 'big'], ['heavy', 'HEAVY', '', ''], ['dodge', 'DODGE', '', ''], ['grab', 'GRAB', '', ''],
    ['boost', 'BOOST', '↟', 'big'], ['hop', 'HOP', '⤒', ''], ['dashL', 'DASH', '◀', ''], ['dashR', 'DASH', '▶', ''],
  ];
  const PILL = [['exit', 'EXIT', 'exit'], ['drive', 'ENGINE', ''], ['radio', 'RADIO', '']];
  let root = null, els = {};
  const held = new Map(); // pointerId -> { id, up() }
  function build() {
    const st = document.createElement('style'); st.id = 'wg-touch-css'; st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'wg-touch'; root.hidden = true; root.setAttribute('aria-label', 'Touch buttons');
    for (const [id, label, glyph, cls] of BTN) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wgt ' + cls; b.dataset.b = id; b.dataset.touchAction = 'wg-' + id;
      b.innerHTML = (glyph ? `<span class="g" aria-hidden="true">${glyph}</span>` : '') + `<span class="l">${label}</span>`;
      root.appendChild(b); els[id] = b; wire(b, id);
    }
    const pills = document.createElement('div'); pills.className = 'pills'; root.appendChild(pills);
    for (const [id, label, cls] of PILL) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pill ' + cls; b.dataset.b = id; b.dataset.touchAction = 'wg-' + id;
      b.innerHTML = `<span class="l">${label}</span>`; pills.appendChild(b); els[id] = b; wire(b, id);
    }
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(root);
    body.add('wg-tc');
    W.touch.root = root;
  }
  const label = (id, text) => { const l = els[id].querySelector('.l'); if (l.textContent !== text) l.textContent = text; };
  const show = (id, on) => { if (els[id].classList.contains('on') !== !!on) els[id].classList.toggle('on', !!on); };
  const cls = (id, c, on) => { if (els[id].classList.contains(c) !== !!on) els[id].classList.toggle(c, !!on); };

  // what a button does when it goes down; returns its let-go (or null)
  let act = null; // the gold button's job, as drawn
  function press(id) {
    switch (id) {
      case 'act': {
        if (!act) return null;
        const [, , kind, code] = act;
        if (kind === 'hold') { send('keydown', code); return () => send('keyup', code); }
        tap(code); return null;
      }
      case 'jump': cm.setTouchInput('up', 1); return () => cm.setTouchInput('up', 0);
      case 'sprint': case 'boost': cm.setTouchInput('boost', 1); return () => cm.setTouchInput('boost', 0);
      case 'strike': tap('KeyJ'); return null;
      case 'heavy': tap('KeyK'); return null;
      case 'dodge': tap(cue() === 'y' ? 'KeyL' : 'KeyC'); return null;
      case 'grab': tap('KeyE'); return null;
      case 'hop': { const k = W.thrusters?.keys?.hop || 'Space'; send('keydown', k); return () => send('keyup', k); }
      case 'dashL': tap(W.thrusters?.keys?.left || 'KeyZ'); return null;
      case 'dashR': tap(W.thrusters?.keys?.right || 'KeyC'); return null;
      case 'exit': tap('KeyF'); return null;
      case 'drive': tap('KeyQ'); return null;
      case 'radio': {
        // (a tap: the next station, R; held 0.6 s: off or on, T)
        let done = false; const t = setTimeout(() => { done = true; tap('KeyT'); }, 600);
        return (cancelled) => { clearTimeout(t); if (!done && !cancelled) tap('KeyR'); };
      }
    }
    return null;
  }
  function wire(b, id) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if ((e.pointerType === 'mouse' && e.button !== 0) || held.has(e.pointerId) || !b.classList.contains('on') || root.hidden) return;
      try { b.setPointerCapture(e.pointerId); } catch { /* (gone already) */ }
      b.classList.add('down');
      const up = press(id);
      held.set(e.pointerId, { id, b, up });
    });
    b.addEventListener('pointerup', (e) => release(e.pointerId));
    for (const t of ['pointercancel', 'lostpointercapture']) b.addEventListener(t, (e) => release(e.pointerId, true));
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  }
  // (cancelled: let go because of a change, not a finger lifted: a key held is let go, nothing new is sent)
  function release(pid, cancelled = false) {
    const h = held.get(pid); if (!h) return;
    held.delete(pid);
    if (![...held.values()].some((x) => x.b === h.b)) h.b.classList.remove('down');
    try { if (h.b.hasPointerCapture?.(pid)) h.b.releasePointerCapture(pid); } catch { /* (fine) */ }
    try { h.up?.(cancelled); } catch (err) { console.warn(TAG, err); }
  }
  function releaseAll(only) { for (const [pid, h] of [...held]) if (!only || only(h)) release(pid, true); }
  addEventListener('blur', () => releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  // (a turn of the phone: the width changes; the iOS bar coming and going only moves the height)
  let wasW = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== wasW) { wasW = innerWidth; releaseAll(); } });

  /* ------------------------------------------------- the key caps' names -- */
  function capName(kbd) {
    // (a cap that names its own button, ui.js's [F|TAKE PHONE]: that name, whatever the key)
    if (kbd.dataset.touchAs) return kbd.dataset.touchAs.trim().toUpperCase();
    const k = (kbd.dataset.k ?? kbd.textContent).trim().replace(/\s+/g, ' ').toUpperCase();
    if (kbd.closest('.wg-skip')) return '';
    const inWf = !!kbd.closest('#wf');
    const car = kbd.closest('#wg-thr, #wg-toast, .wr-card, #wg-drive, .wg-reset, .wg-drivemode') ? true : inWf ? false : cm.activeMode === 'car';
    switch (k) {
      case 'F': if (kbd.closest('.wg-hold')) return holdName(); return car ? 'EXIT' : 'GET IN';
      case 'J': case 'LMB': case 'LEFT CLICK': case 'CLICK': return 'STRIKE';
      case 'K': case 'RMB': case 'RIGHT CLICK': return 'HEAVY';
      case 'L': return 'COUNTER';
      case 'Q': return car ? (driveLabel() || 'ELECTRIC') : 'COUNTER';
      case 'C': return car ? 'DASH ▶' : 'DODGE';
      case 'E':
        if (kbd.closest('.m2-prompt')) return 'TAKE DOWN';
        if (kbd.closest('.wf-offer')) return 'PICK UP';
        if (kbd.closest('.wf-held')) return 'THROW';
        return 'GRAB';
      case 'SPACE': case '␣': return car ? 'HOP' : inWf ? 'DODGE' : 'JUMP';
      case 'Z': return 'DASH ◀';
      case 'X': return 'RESET';
      case 'R': return 'RADIO';
      case 'T': return 'HOLD RADIO';
      case 'SHIFT': return car ? 'BOOST' : 'SPRINT';
      case 'M': return 'MAP';
      case 'ESC': case 'ESCAPE': case 'P': return 'PAUSE';
      case 'W': case 'A': case 'S': case 'D': case 'WASD': case 'W A S D': case 'W/S': case 'A/D': case 'ARROWS': case '↑': case '↓': case '←': case '→': return 'STICK';
      case 'MOUSE': return 'DRAG';
    }
    return '';
  }
  function mark(kbd) {
    if (kbd.dataset.pad || kbd.dataset.native || kbd.closest('#wg-pause, #touch-controls, #wg-touch, .wg-hold, .m2-prompt')) return;
    let n = capName(kbd);
    // (the cap says what the words beside it say already, 'E GRAB': the words alone)
    if (n) { const nx = kbd.nextSibling; const t = (nx ? nx.textContent : '').replace(/\s+/g, ' ').trim().toUpperCase(); if (t && t.startsWith(n)) n = ''; }
    if (kbd.dataset.touch !== n) kbd.dataset.touch = n;
    // (two caps for one button side by side, LMB J or C Space: one)
    const prev = kbd.previousElementSibling;
    let dup = false;
    if (n && prev && prev.tagName === 'KBD' && prev.dataset.touch === n) {
      let between = ''; for (let x = prev.nextSibling; x && x !== kbd; x = x.nextSibling) between += x.textContent;
      dup = !between.trim();
    }
    if (dup !== kbd.hasAttribute('data-touch-dup')) kbd.toggleAttribute('data-touch-dup', dup);
  }
  let scanWant = true, scanT = 0;
  // (the game's own overlays, and the objective tracker the mission puts in the city's HUD column: the city's toolbar
  // and radar keep their look)
  const CAPS = '#wg kbd, #wf kbd, #wg-thr kbd, #wg-toast kbd, .wr-card kbd, #m3o kbd, .wg-track kbd';
  const scan = () => { for (const k of document.querySelectorAll(CAPS)) mark(k); };
  const mo = new MutationObserver(() => { scanWant = true; });
  let observing = false;

  /* ---------------------------------------------------------- each frame -- */
  let ctxWas = 'off', actWas = null, rideWas = null, ridePush = false, holdWas = '';
  function frame(now) {
    requestAnimationFrame(frame);
    try { step(now); } catch (err) { console.warn(TAG, err); }
  }
  function step(now) {
    if (body.contains('wg-pad')) body.remove('wg-touchlast');
    if (!root) { if (body.contains('touch-enabled')) build(); else return; }
    // the key caps (while a finger is the last used)
    const fingers = body.contains('wg-touchlast');
    if (fingers !== observing) {
      observing = fingers;
      if (fingers) { mo.observe(document.body, { childList: true, subtree: true, characterData: true }); scanWant = true; } else mo.disconnect();
    }
    if (fingers && (scanWant || now - scanT > 400)) { scanWant = false; scanT = now; mo.takeRecords(); scan(); }
    // (the hold ring's job, for its cap)
    if (fingers && body.contains('wg-holding')) { const h = JSON.stringify(holdName()); if (h !== holdWas) { holdWas = h; document.body.style.setProperty('--wgt-hold', h); } }

    const c = context(now);
    if (c !== ctxWas) { releaseAll(); ctxWas = c; root.dataset.c = c; root.hidden = c === 'off'; body.toggle('wg-tc-busy', c === 'car' || c === 'fight'); }
    if (c === 'off') { actWas = null; return; }

    // the gold button
    const a = action(c);
    const aKey = a ? a[0] + ':' + a[1] : null;
    if (aKey !== actWas) {
      // (its job changed under a finger: let go of the old one)
      releaseAll((h) => h.id === 'act');
      actWas = aKey; act = a;
      if (a) label('act', a[1]);
    }
    show('act', !!a);
    if (a && a[2] === 'hold') { cls('act', 'ring', true); els.act.style.setProperty('--k', holdK().toFixed(3)); } else cls('act', 'ring', false);

    // getting in or out: a fresh push of the stick past half way, as W or S (keeps him driving, or gets him in at once)
    const ride = W.ride?.phase || null;
    if (ride && ride !== 'bail') {
      const t = cm._touchKeys || {}, f = +t.forward || 0, b = +t.backward || 0, l = +t.left || 0, r = +t.right || 0;
      const push = Math.hypot(f - b, r - l) > 0.5;
      if (ride !== rideWas) ridePush = push;
      else if (push && !ridePush) tap(b > 0.5 ? 'KeyS' : 'KeyW');
      ridePush = push;
    }
    rideWas = ride;

    if (c === 'foot') {
      show('jump', !ride); show('sprint', true);
    } else if (c === 'fight') {
      show('strike', true); show('heavy', true); show('dodge', true);
      cls('heavy', 'glow', !!$('#wf .wf-combo.wf-ready, #wf .wf-fin.wf-on'));
      const q = cue();
      label('dodge', q === 'y' ? 'COUNTER' : 'DODGE');
      cls('dodge', 'cue-y', q === 'y'); cls('dodge', 'cue-r', q === 'r');
      const g = grabWhat(); show('grab', !!g); if (g) label('grab', g);
    } else if (c === 'car') {
      const th = W.thrusters, u = th?.unlocked || {}, rd = th?.ready || { hop: 1, dash: 1 };
      show('boost', true);
      show('hop', !!u.hop && !ride);
      show('dashL', !!u.dash && !ride); show('dashR', !!u.dash && !ride);
      if (u.hop) { const k = Math.max(0, Math.min(1, +rd.hop || 0)); cls('hop', 'ring', k < 1); cls('hop', 'cool', k < 1); els.hop.style.setProperty('--k', k.toFixed(3)); }
      if (u.dash) for (const id of ['dashL', 'dashR']) { const k = Math.max(0, Math.min(1, +rd.dash || 0)); cls(id, 'ring', k < 1); cls(id, 'cool', k < 1); els[id].style.setProperty('--k', k.toFixed(3)); }
      show('exit', ride !== 'bail' && ride !== 'out');
      const dl = driveLabel(); show('drive', !!dl && !ride);
      if (dl) { label('drive', dl === 'ELECTRIC' ? '⚡ ELECTRIC' : 'ENGINE'); cls('drive', 'ev', dl === 'ELECTRIC'); cls('drive', 'eng', dl !== 'ELECTRIC'); }
      show('radio', !!W.radio && !ride); if (W.radio) cls('radio', 'off', !W.radio.on);
    }
    // (only this context's buttons)
    const want = c === 'foot' ? ['act', 'jump', 'sprint'] : c === 'fight' ? ['act', 'strike', 'heavy', 'dodge', 'grab'] : ['act', 'boost', 'hop', 'dashL', 'dashR', 'exit', 'drive', 'radio'];
    for (const id in els) if (!want.includes(id)) show(id, false);
    // (a button hidden under a finger lets go)
    for (const [pid, h] of [...held]) if (!h.b.classList.contains('on')) release(pid, true);
  }

  W.touch = { root: null, context: () => context(), action: () => { const a = action(context()); return a ? a[1] : null; } };
  requestAnimationFrame(frame);
  console.log(TAG + ' layer in');
}
