// Mog City story runner: a world's calls on a foldable phone (a pack's `calls: { style: 'fold' }`, Mandi's Revenge,
// 25 Nov 2026) in place of the caller card and the car screen's picture. A book-style folding phone of Mog City's own
// (no maker's name, logo or system UI): folded, a tall narrow cover screen with a punch-hole lens; open, a near-square
// inner screen with a faint crease down its middle, thin bezels, a dark call screen. It is driven by the caller card
// (ui.caller, wrapped in index.js): a call ringing (Incoming call, Call waiting) slides it up into the corner folded,
// the caller's photo and name on the cover, answer and decline under them (tapping them presses E / X: the call's own
// keys and rules, runner.js); answered (On call, On hold, a voicemail, any other status) it unfolds on its hinge into
// the inner screen, the call's timer, the caller's name, mute / camera / end; ended (null) it folds and slides away.
// A video call's caller (vcall.js feed) is drawn into its inner screen's picture (rect()), head and shoulders, small:
// a phone-sized picture, on purpose. A `vcall` step (a cutscene) plays on it too, bigger, in the middle of the screen
// (scene()): its tiles laid out inside the inner screen. Held in a hand: a slight sway (a touch of tilt only while
// folded: an open screen's picture is a rect on the canvas).
//   const F = createFold(W, { heads })   F.caller(name, color, status, shown)  F.rect()  F.live(on)  F.scene(title | null)
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const GREEN = '#34C46A', RED = '#EF4444';
const I = {
  ans: '<svg viewBox="0 0 24 24" width="58%" height="58%" fill="currentColor"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="52%" height="52%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="54%" height="54%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5z"/></svg>',
};
const END = I.ans.replace('<path', '<path transform="rotate(135 12 12)"');
const CSS = `
body.wg-fold-style #wg .wg-caller { opacity: 0 !important; pointer-events: none; }
#wg .wg-vfeed-fold { display: none; }
#wg .wg-fold { --fw: 92px; --fh: 221px; position: absolute; right: 18px; top: 86px; width: calc(var(--fw) * 2); height: var(--fh); z-index: 5; pointer-events: none;
  perspective: calc(var(--fw) * 9); opacity: 0; transform: translateY(46px); transition: opacity .3s, transform .45s cubic-bezier(.2,.8,.25,1); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #fff; }
#wg .wg-fold.on { opacity: 1; transform: none; }
#wg .wg-fold.scene { right: auto; left: calc(50% - var(--fw)); top: 28px; z-index: 2; }
body.touch-enabled #wg .wg-fold:not(.scene) { right: calc(var(--wg-r) + var(--wg-toolbar)); top: calc(var(--wg-t) + 4px); }
/* (a phone held upright: the caller card's place under the toolbar, small enough to sit over the meters) */
@media (orientation: portrait) {
  body.touch-enabled #wg .wg-fold:not(.scene) { right: var(--wg-r); top: calc(var(--wg-t) + 58px); }
  body.touch-enabled.wg-fold-style.wg-calling #wg :is(.wg-help, .wg-offer, .wg-dm) { right: calc(var(--wg-r) + 128px); }
}
#wg .wg-fold .dev { position: absolute; inset: 0; transform-style: preserve-3d; }
#wg .wg-fold .half, #wg .wg-fold .flap { position: absolute; top: 0; width: var(--fw); height: var(--fh); transform-style: preserve-3d; }
#wg .wg-fold .half { left: var(--fw); border-radius: 0 calc(var(--fw) * .16) calc(var(--fw) * .16) 0; background: #1B1D22; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
#wg .wg-fold .flap { left: 0; transform-origin: 100% 50%; transform: rotateY(180deg); transition: transform .62s cubic-bezier(.45,.05,.25,1); }
#wg .wg-fold.open .flap { transform: rotateY(0deg); }
#wg .wg-fold .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; background: #1B1D22; }
#wg .wg-fold .face.fr { border-radius: calc(var(--fw) * .16) 0 0 calc(var(--fw) * .16); box-shadow: inset -1px 0 0 rgba(255,255,255,.06); }
#wg .wg-fold .face.bk { transform: rotateY(180deg); border-radius: calc(var(--fw) * .16); box-shadow: 0 12px 34px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.1); }
#wg .wg-fold .glass { position: absolute; inset: calc(var(--fw) * .035); border-radius: calc(var(--fw) * .12); background: #07080A; overflow: hidden; }
#wg .wg-fold .half .glass, #wg .wg-fold .fr .glass { background: linear-gradient(150deg, #191B22 0%, #0B0C10 55%, #07080A 100%); }
#wg .wg-fold .half .glass { left: 0; border-radius: 0 calc(var(--fw) * .12) calc(var(--fw) * .12) 0; }
#wg .wg-fold .fr .glass { right: 0; border-radius: calc(var(--fw) * .12) 0 0 calc(var(--fw) * .12); }
#wg .wg-fold .lens { position: absolute; left: 50%; top: calc(var(--fw) * .07); width: calc(var(--fw) * .075); height: calc(var(--fw) * .075); margin-left: calc(var(--fw) * -.0375); border-radius: 50%; background: #000; box-shadow: 0 0 0 1px rgba(255,255,255,.12); z-index: 3; }
#wg .wg-fold .cover { background: radial-gradient(120% 70% at 50% 0%, #2A2440 0%, #101116 60%, #07080A 100%); display: flex; flex-direction: column; align-items: center; text-align: center; }
#wg .wg-fold .cover .ct { margin-top: calc(var(--fw) * .2); font: 500 max(8px, calc(var(--fw) * .12))/1 system-ui, sans-serif; color: rgba(255,255,255,.6); letter-spacing: .5px; }
#wg .wg-fold .cover .cs { margin-top: calc(var(--fh) * .07); font: 600 max(7px, calc(var(--fw) * .1))/1.1 system-ui, sans-serif; color: rgba(255,255,255,.62); letter-spacing: .3px; padding: 0 6%; }
#wg .wg-fold .av { position: relative; flex: none; border-radius: 50%; display: grid; place-items: center; overflow: hidden; color: #0A0C10; font-weight: 800; font-family: 'Barlow Condensed', system-ui, sans-serif; background-size: cover; background-position: center; }
#wg .wg-fold .cover .av { width: calc(var(--fw) * .56); height: calc(var(--fw) * .56); margin-top: calc(var(--fh) * .05); font-size: calc(var(--fw) * .3); box-shadow: 0 0 0 calc(var(--fw) * .025) rgba(255,255,255,.18); }
#wg .wg-fold.ring .cover .av { animation: wgFoldPulse 1.1s ease-out infinite; }
@keyframes wgFoldPulse { 0% { box-shadow: 0 0 0 calc(var(--fw) * .025) rgba(255,255,255,.3), 0 0 0 0 rgba(255,255,255,.35); } 100% { box-shadow: 0 0 0 calc(var(--fw) * .025) rgba(255,255,255,.18), 0 0 0 calc(var(--fw) * .14) rgba(255,255,255,0); } }
#wg .wg-fold .cover .cn { margin-top: calc(var(--fh) * .04); max-width: 90%; font: 800 max(10px, calc(var(--fw) * .17))/1.02 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .5px; overflow-wrap: anywhere; }
#wg .wg-fold .cover .cb { margin-top: auto; margin-bottom: calc(var(--fh) * .07); width: 100%; display: flex; justify-content: space-around; }
#wg .wg-fold .btn { pointer-events: auto; cursor: pointer; display: grid; place-items: center; width: calc(var(--fw) * .3); height: calc(var(--fw) * .3); border-radius: 50%; color: #fff; position: relative; }
#wg .wg-fold .btn.yes { background: ${GREEN}; } #wg .wg-fold .btn.no, #wg .wg-fold .btn.end { background: ${RED}; }
#wg .wg-fold.ring .btn.yes { animation: wgFoldNudge 1.1s ease-in-out infinite; }
@keyframes wgFoldNudge { 0%, 60%, 100% { transform: none; } 70% { transform: rotate(-14deg); } 80% { transform: rotate(12deg); } 90% { transform: rotate(-6deg); } }
#wg .wg-fold .btn kbd { position: absolute; top: 108%; left: 50%; transform: translateX(-50%); font: 700 calc(var(--fw) * .085)/1 'Barlow Condensed', system-ui, sans-serif; color: rgba(255,255,255,.55); letter-spacing: .5px; }
body.touch-enabled #wg .wg-fold .btn kbd { display: none; }
#wg .wg-fold .scr { position: absolute; inset: 0; border-radius: calc(var(--fw) * .16); box-shadow: 0 14px 40px rgba(0,0,0,.5); overflow: hidden; opacity: 0; visibility: hidden; transition: opacity .2s; }
#wg .wg-fold.done .scr { opacity: 1; visibility: visible; }
#wg .wg-fold.done .half, #wg .wg-fold.done .flap { visibility: hidden; }
#wg .wg-fold .scr .bz { position: absolute; inset: 0; border-radius: inherit; z-index: 3; pointer-events: none; box-shadow: inset 0 0 0 calc(var(--fw) * .035) #1B1D22, inset 0 0 0 calc(var(--fw) * .035 + 1px) rgba(255,255,255,.08); }
#wg .wg-fold .scr .lens { left: 75%; }
#wg .wg-fold .scr .crease { position: absolute; left: 50%; top: calc(var(--fw) * .035); bottom: calc(var(--fw) * .035); width: 2px; margin-left: -1px; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.07), rgba(0,0,0,.18), rgba(255,255,255,0)); z-index: 4; pointer-events: none; }
#wg .wg-fold .scr .bar { position: absolute; left: calc(var(--fw) * .09); right: calc(var(--fw) * .09); top: calc(var(--fw) * .1); height: calc(var(--fh) * .14); display: flex; align-items: center; gap: calc(var(--fw) * .06); z-index: 2; }
#wg .wg-fold .scr .bar .av { width: calc(var(--fh) * .1); height: calc(var(--fh) * .1); font-size: calc(var(--fh) * .055); }
#wg .wg-fold .scr .bar .who { min-width: 0; flex: 1; }
#wg .wg-fold .scr .sn { font: 800 max(11px, calc(var(--fw) * .15))/1.02 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#wg .wg-fold .scr .ss { margin-top: 1px; font: 600 max(8px, calc(var(--fw) * .085))/1.1 system-ui, sans-serif; color: rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#wg .wg-fold .scr .ss b { color: ${GREEN}; font-weight: 600; }
#wg .wg-fold.hold .scr .ss, #wg .wg-fold.hold .scr .ss b { color: #FFC93C; }
#wg .wg-fold .scr .vid { position: absolute; left: calc(var(--fw) * .09); right: calc(var(--fw) * .09); top: calc(var(--fh) * .25); bottom: calc(var(--fh) * .21); border-radius: calc(var(--fw) * .08);
  box-shadow: 0 0 0 calc(var(--fh) * 2) #0C0D11, inset 0 0 0 1px rgba(255,255,255,.12); }
#wg .wg-fold .scr .vid .pv { position: absolute; inset: 0; border-radius: inherit; display: grid; place-items: center; background: radial-gradient(90% 90% at 50% 40%, #23252D, #111216); transition: opacity .25s; }
#wg .wg-fold .scr .vid .pv .av { width: calc(var(--fw) * .62); height: calc(var(--fw) * .62); font-size: calc(var(--fw) * .34); }
#wg .wg-fold.live .scr .vid .pv { opacity: 0; }
#wg .wg-fold.hold .scr .vid { filter: brightness(.5); }
#wg .wg-fold .scr .vid .wt { position: absolute; left: 6px; right: 6px; top: 6px; padding: 4px 8px; border-radius: 8px; background: rgba(20,22,28,.9); font: 600 calc(var(--fw) * .085)/1.1 system-ui, sans-serif; text-align: center; opacity: 0; transform: translateY(-6px); transition: opacity .25s, transform .25s; }
#wg .wg-fold .scr .vid .wt.on { opacity: 1; transform: none; }
#wg .wg-fold .scr .ctl { position: absolute; left: 0; right: 0; bottom: calc(var(--fh) * .05); display: flex; justify-content: center; gap: calc(var(--fw) * .2); z-index: 2; }
#wg .wg-fold .scr .ctl .btn { width: calc(var(--fh) * .105); height: calc(var(--fh) * .105); pointer-events: none; }
#wg .wg-fold .scr .ctl .btn.ic { background: rgba(255,255,255,.14); }
#wg .wg-fold.scene .scr .vid { top: calc(var(--fh) * .17); bottom: calc(var(--fh) * .15); box-shadow: 0 0 0 calc(var(--fh) * 2) #0C0D11; }
#wg .wg-fold.scene .scr { box-shadow: 0 14px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.05); }
#wg .wg-fold.scene .scr .bar { height: calc(var(--fh) * .1); }
#wg .wg-fold.scene .scr .bar .av { width: calc(var(--fh) * .07); height: calc(var(--fh) * .07); font-size: calc(var(--fh) * .04); }
#wg .wg-fold.scene .scr .sn { font-size: calc(var(--fh) * .045); } #wg .wg-fold.scene .scr .ss { font-size: calc(var(--fh) * .028); }
#wg .wg-fold.scene .scr .ctl { bottom: calc(var(--fh) * .03); } #wg .wg-fold.scene .scr .ctl .btn { width: calc(var(--fh) * .075); height: calc(var(--fh) * .075); }
#wg .wg-fold.scene .scr .vid .pv { display: none; }
body.wg-vcall.wg-fold-style #wg .wg-vc .top, body.wg-vcall.wg-fold-style #wg .wg-vc .tools { display: none; }
body.wg-vcall.wg-fold-style #wg .wg-vc .tile .nm { left: 5px; bottom: 5px; padding: 3px 7px 4px; font-size: 13px; }
body.wg-vcall.wg-fold-style #wg .wg-vc .tile { border-radius: 8px; }
body.wg-vcall.wg-fold-style #wg .wg-vc .toast { top: 14px; z-index: 6; }
`;
let styled = false;

export function createFold(W, { heads = {} } = {}) {
  if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
  document.body.classList.add('wg-fold-style');
  const root = document.createElement('div'); root.className = 'wg-fold';
  root.innerHTML = `<div class="dev">
    <div class="half"><div class="glass"></div></div>
    <div class="flap"><div class="face fr"><div class="glass"></div></div>
      <div class="face bk"><div class="glass cover"><i class="lens"></i><div class="ct"></div><div class="cs"></div><div class="av"></div><div class="cn"></div>
        <div class="cb"><b class="btn no" data-k="KeyX">${END}<kbd>X</kbd></b><b class="btn yes" data-k="KeyE">${I.ans}<kbd>E</kbd></b></div></div></div></div>
    <div class="scr"><i class="bz"></i><i class="lens"></i><i class="crease"></i>
      <div class="bar"><div class="av"></div><div class="who"><div class="sn"></div><div class="ss"></div></div></div>
      <div class="vid"><div class="pv"><div class="av"></div></div><div class="wt"></div></div>
      <div class="ctl"><b class="btn ic">${I.mic}</b><b class="btn ic">${I.cam}</b><b class="btn end">${END}</b></div></div></div>`;
  (document.getElementById('wg') || document.body).appendChild(root);
  const $ = (s) => root.querySelector(s), dev = $('.dev'), vid = $('.vid');
  // (the cover's answer and decline: the keys the call listens for, as if pressed)
  for (const b of root.querySelectorAll('.cover .btn')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dispatchEvent(new KeyboardEvent('keydown', { code: b.dataset.k, key: b.dataset.k.slice(3).toLowerCase(), bubbles: true })); });
  const now = () => performance.now() / 1000;
  let state = 'off', who = null, t0 = 0, raf = 0, openT = 0, closing = 0, scene = null, big = false, pip = false, shownS = null, sway0 = Math.random() * 9;
  const face = (el, name, color) => {
    const u = name && Object.prototype.hasOwnProperty.call(heads, name) ? heads[name] : null;
    if (u) { el.textContent = ''; el.style.background = `${color || '#6CB8FF'} url("${u}") center / cover no-repeat`; }
    else { el.textContent = String(name || '?').trim()[0]?.toUpperCase() || '?'; el.style.background = color || '#6CB8FF'; }
  };
  const clock = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // (its size for where it is: at the wheel the smallest, on foot a little bigger, a video call in the middle, big;
  // the cover a tall narrow screen (w x 2.4 w), the inner one near-square (2 w x 2.4 w))
  const size = () => {
    const touch = document.body.classList.contains('touch-enabled'), iw = innerWidth, ih = innerHeight;
    let w;
    if (scene || big) { const h = Math.max(220, ih - 28 - (touch ? 150 : 190)); w = Math.min(h / 2.4, (iw - 32) / 2, 300); }
    // (a live video call (vcall.js playLive) in the corner: bigger than a phone call's, its picture a face you can read
    // at the wheel, still out of the road's way)
    else if (pip) w = touch ? (ih > iw ? 62 : Math.min(84, iw * 0.2)) : Math.min(136, iw * 0.115);
    else { const car = W.app?.controllerManager?.activeMode === 'car'; w = touch ? (ih > iw ? 48 : Math.min(car ? 60 : 70, iw * 0.17)) : Math.min(car ? 92 : 104, iw * 0.09); }
    w = Math.round(w); const h = Math.round(w * 2.4);
    if (root.style.getPropertyValue('--fw') !== w + 'px') { root.style.setProperty('--fw', w + 'px'); root.style.setProperty('--fh', h + 'px'); }
  };
  const frame = () => {
    raf = requestAnimationFrame(frame);
    size();
    const t = now();
    // (held in a hand: a slow drift and a breath; a touch of tilt only while folded)
    const k = scene ? 0.5 : 1, x = (Math.sin(t * 0.9 + sway0) * 2.2 + Math.sin(t * 2.3) * 0.6) * k, y = (Math.sin(t * 1.3 + sway0 * 0.7) * 1.8 + Math.sin(t * 3.1) * 0.4) * k;
    const r = state === 'ring' ? Math.sin(t * 1.1 + sway0) * 1.2 : 0;
    dev.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    if (state === 'open' && !root.classList.contains('done') && t - openT > 0.6) root.classList.add('done');
    if (state === 'open' || state === 'hold') { const tm = root.querySelector('.ss b'); if (tm) tm.textContent = mmss(Math.max(0, t - t0)); }
    $('.ct').textContent = clock();
    if (closing && t > closing) { closing = 0; cancelAnimationFrame(raf); raf = 0; }
  };
  const run = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const status = (s) => { if (s === shownS) return; shownS = s; const ss = $('.ss'); ss.innerHTML = /^on call$/i.test(s) || !s ? `<b>00:00</b>` : `${esc(s)} · <b>00:00</b>`; };
  // (a call after a video call's phone has gone: back in the corner, its own size)
  const corner = () => { if (!scene && big) { big = false; root.classList.remove('scene'); } };
  function ring(name, nm, color, s) {
    corner();
    root.classList.remove('open', 'done', 'live', 'hold'); root.classList.add('on', 'ring');
    face($('.cover .av'), name, color); $('.cn').textContent = nm; $('.cs').textContent = s; state = 'ring'; closing = 0; run();
  }
  function open(name, nm, color, s) {
    corner();
    const fresh = state !== 'open' && state !== 'hold';
    if (state === 'off') { face($('.cover .av'), name || nm, color); $('.cn').textContent = nm; $('.cs').textContent = s; root.classList.add('on'); }
    root.classList.remove('ring');
    if (fresh || who !== nm) t0 = now();
    if (who !== nm) root.classList.remove('live');
    face($('.bar .av'), name || nm, color); face($('.pv .av'), name || nm, color); $('.sn').textContent = nm;
    const hold = /^on hold/i.test(s); root.classList.toggle('hold', hold); status(hold ? 'On hold' : s);
    $('.wt').classList.remove('on');
    if (fresh) { openT = now(); requestAnimationFrame(() => root.classList.add('open')); }
    state = 'open'; closing = 0; run();
  }
  function close() {
    if (state === 'off') return;
    state = 'off'; who = null;
    root.classList.remove('done', 'live', 'ring', 'hold', 'open');
    // (folded on its hinge, then slid away)
    setTimeout(() => { if (state === 'off') root.classList.remove('on'); }, 560);
    closing = now() + 1.2;
  }
  return {
    el: root,
    // the caller card's call: (name, colour, status, the name as shown) or null
    caller(name, color, s = 'On call', shown = name) {
      if (scene) return;
      if (!name) { close(); return; }
      const nm = String(shown || name).toUpperCase();
      if (/^(incoming|call waiting)/i.test(s) && (state === 'off' || state === 'ring')) ring(name, nm, color, s);
      else if (/^call waiting/i.test(s)) { const wt = $('.wt'); wt.textContent = `${s} · ${nm}`; wt.classList.add('on'); }
      else open(name, nm, color, s);
      who = nm;
    },
    // the inner screen's picture, where a call's video is drawn (css px of the canvas), once it is open; else null
    rect() {
      if (state !== 'open' || !root.classList.contains('done')) return null;
      const b = vid.getBoundingClientRect(); return b.width > 4 ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : null;
    },
    radius() { return Math.max(4, parseFloat(getComputedStyle(vid).borderTopLeftRadius) || 8); },
    live(on) { root.classList.toggle('live', !!on); },
    // a video call (vcall.js play) on the phone: open, big, in the middle (title, its people's count) or put away (null)
    scene(title, sub = '', color = '#6CB8FF') {
      // (folded and slid away where it is, then back to the corner's size)
      if (title == null) { if (!scene) return; scene = null; big = true; close(); setTimeout(() => { if (state === 'off') corner(); }, 650); return; }
      if (!scene) { scene = { title }; big = false; root.classList.remove('open', 'done', 'live', 'ring', 'hold'); root.classList.add('scene'); state = 'off'; }
      size();
      open(null, String(title), color, sub); scene.title = title;
    },
    // (the inner screen's picture area for a video call's tiles, or null until it is open)
    screen() { if (!scene || !root.classList.contains('done')) return null; const b = vid.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; },
    subtitle(s) { status(s); },
    // (a live video call: the corner phone at its bigger size while it is on)
    pip(on) { pip = !!on; size(); },
    dispose() { cancelAnimationFrame(raf); root.remove(); document.body.classList.remove('wg-fold-style'); },
  };
}
