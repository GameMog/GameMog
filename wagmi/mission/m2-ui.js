// Mog City: Mission 2's overlays, in the shared style (ui.js): Jane's video call and her screen share (the burner's
// twin pinging in Times Square) in the phone frame, Mack's phone (the Suits' group chat), the tail meter (how far
// behind the van, how suspicious they are), the lookouts' alert marks over their heads, and Mack's car's damage.
//   const U = createM2UI(W.ui);
//   U.call.show() / .talk(level) / .share(on) / .hide()     Jane's video call (the phone frame on the right): Jane herself,
//                                                           frames of her model in her room (jane.js janePortrait)
//   U.chat(lines, { every }) -> Promise                     Mack's phone: the chat, a message at a time
//   U.tail.set({ d, sus, note }) / .hide()                  the tail meter (bottom right)
//   U.mark(id, { x, y, k, on })  / .unmark(id)              a lookout's '?' filling to '!' at screen x, y
//   U.target(label, k) / U.target(null)                     a target's damage bar (Mack's car)
//   U.prompt(text, { strong, soft }) / U.prompt(null)       a key prompt over the middle ('Press [E] to take him down'):
//                                                           strong (in position: big, a gold key), soft (not yet: no key)
//   U.banner(title, sub, { color, secs }) / U.banner(null)  a big word over the middle for a moment ('SPOTTED!')
import { janePortrait } from './jane.js';
const CSS = `
#wg .m2-tail { position: absolute; right: 24px; bottom: 228px; width: 250px; padding: 10px 14px 12px; background: rgba(8,10,14,0.62); border-radius: 10px; opacity: 0; transition: opacity .3s; z-index: 4; }
#wg .m2-tail.on { opacity: 1; }
/* (a call during the tail: the caller's card, Jane's tile in it, stands above the meter, not over it) */
#wg:has(.m2-tail.on) .wg-caller { bottom: 360px; }
/* (and during the chase, above MACK'S CAR's damage bar) */
#wg:has(.m2-target.on) .wg-caller { bottom: 296px; }
#wg .m2-tail .row { display: flex; justify-content: space-between; align-items: baseline; font: 700 14px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.75); }
#wg .m2-tail .row b { font: 800 24px/1 'Barlow Condensed'; letter-spacing: 0; color: #fff; }
#wg .m2-tail .bar { position: relative; height: 10px; margin-top: 8px; border-radius: 5px; overflow: hidden;
  background: linear-gradient(to right, #EF4444 0 8.5%, #F59E0B 8.5% 14%, #FFC93C 14% 46%, rgba(255,255,255,.28) 46% 71%, #EF4444 71% 100%); opacity: .85; }
#wg .m2-tail .pin { position: absolute; top: -4px; width: 4px; height: 18px; margin-left: -2px; border-radius: 2px; background: #fff; box-shadow: 0 0 0 2px rgba(8,10,14,.9); transition: left .12s linear; }
#wg .m2-tail .note { margin-top: 7px; font: 700 13px/1 'Barlow Condensed'; letter-spacing: 2px; text-transform: uppercase; color: #FFC93C; min-height: 13px; }
#wg .m2-tail .sus { display: flex; align-items: center; gap: 8px; margin-top: 8px; font: 700 12px/1 'Barlow Condensed'; letter-spacing: 2.5px; color: rgba(255,255,255,.7); }
#wg .m2-tail .sus i { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.14); overflow: hidden; }
#wg .m2-tail .sus i s { display: block; height: 100%; width: 0; background: #EF4444; transition: width .1s linear; }
#wg .m2-mark { position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; display: grid; place-items: center; opacity: 0; transition: opacity .2s; z-index: 3;
  background: conic-gradient(var(--c) calc(var(--k) * 360deg), rgba(8,10,14,.62) 0); box-shadow: 0 0 0 2px rgba(8,10,14,.85); }
#wg .m2-mark.on { opacity: 1; }
#wg .m2-mark span { width: 22px; height: 22px; border-radius: 50%; background: rgba(8,10,14,.85); display: grid; place-items: center; font: 800 17px/1 'Barlow Condensed'; color: var(--c); }
#wg .m2-target { position: absolute; right: 24px; bottom: 228px; width: 250px; padding: 10px 14px 12px; background: rgba(8,10,14,0.62); border-radius: 10px; opacity: 0; transition: opacity .3s; z-index: 4; }
#wg .m2-target.on { opacity: 1; }
#wg .m2-target .row { display: flex; justify-content: space-between; font: 700 14px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.75); }
#wg .m2-target .row b { color: #EF4444; letter-spacing: 3px; }
#wg .m2-target i { display: block; height: 8px; margin-top: 8px; border-radius: 4px; background: rgba(255,255,255,.14); overflow: hidden; }
#wg .m2-target i s { display: block; height: 100%; background: #EF4444; transition: width .2s; }
#wg .m2-prompt { position: absolute; left: 50%; top: 58%; transform: translate(-50%, -50%); padding: 8px 14px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 700 17px/1 'Barlow Condensed'; letter-spacing: 1px; opacity: 0; transition: opacity .2s; z-index: 5; white-space: nowrap; }
#wg .m2-prompt.on { opacity: 1; }
/* (in position: it is the thing to do now; not yet: a quieter nudge, no key in it) */
#wg .m2-prompt.strong { font-size: 22px; padding: 10px 18px; border: 2px solid #FFC93C; box-shadow: 0 0 24px rgba(255,201,60,.35); }
#wg .m2-prompt.strong kbd { background: #FFC93C; color: #0A0C10; border-color: #FFC93C; }
#wg .m2-prompt.soft { font-size: 16px; }
/* (on a phone, a size down: clear of the gold TAKE DOWN button beside it) */
body.wg-touchlast:not(.wg-pad) #wg .m2-prompt.strong { font-size: 18px; padding: 8px 14px; }
#wg .m2-prompt.soft.on { opacity: .8; }
/* a big word over the middle for a moment (SPOTTED!), under the mission's own cards (.wg-big) */
#wg .m2-banner { position: absolute; left: 50%; top: 34%; width: max-content; max-width: calc(100vw - 32px); text-align: center; transform: translate(-50%, -50%) scale(1.12); opacity: 0; transition: opacity .2s, transform .35s cubic-bezier(.2,.7,.2,1); z-index: 6; pointer-events: none; }
#wg .m2-banner.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#wg .m2-banner .t { font: italic 800 clamp(48px, 9vw, 92px)/1 'Barlow Condensed'; letter-spacing: 1px; text-shadow: 0 4px 24px rgba(0,0,0,.6); }
#wg .m2-banner .s { margin-top: 8px; font: 700 clamp(18px, 2.4vw, 26px)/1.15 'Barlow Condensed'; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.75); }
/* Jane's video call and her screen share, in the phone frame */
.m2-call { position: absolute; inset: 0; background: #070B14; overflow: hidden; }
.m2-call .feed, .m2-call svg.map { position: absolute; inset: 0; width: 100%; height: 100%; transition: opacity .35s; }
.m2-call svg.map { opacity: 0; }
.m2-call.share svg.map { opacity: 1; }
.m2-call.share .feed { opacity: 0; }
.m2-call .feed:after { content: ''; position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,.45), transparent 22%, transparent 70%, rgba(0,0,0,.5)); }
.m2-call .label { position: absolute; top: 8.5%; left: 0; right: 0; text-align: center; font: 800 18px/1 'Barlow Condensed'; letter-spacing: 3px; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
.m2-call .label small { display: block; font: 600 12px/1 'Barlow Condensed'; color: rgba(255,255,255,.6); letter-spacing: 1px; margin-top: 5px; }
.m2-call .wave { position: absolute; left: 14%; right: 14%; bottom: 17%; height: 30px; display: flex; gap: 3px; align-items: center; justify-content: center; }
.m2-call .wave i { display: block; width: 4px; border-radius: 2px; background: #6CB8FF; height: 3px; transition: height .08s; }
.m2-call .pip { position: absolute; right: 6%; bottom: 26%; width: 25%; aspect-ratio: 3 / 4; border-radius: 10px; background: linear-gradient(#2A2E36, #121419); border: 1px solid rgba(255,255,255,.2); overflow: hidden; transition: opacity .3s; }
.m2-call .pip:after { content: ''; position: absolute; left: 22%; right: 22%; bottom: -10%; height: 70%; border-radius: 50% 50% 0 0; background: #07080A; box-shadow: 0 -38px 0 -14px #07080A; }
.m2-call.share .pip { opacity: 0; }
.m2-call .end { position: absolute; bottom: 5%; left: 50%; transform: translateX(-50%); width: 18%; aspect-ratio: 1; border-radius: 50%; background: #EF4444; }
.m2-call .tag { position: absolute; left: 6%; right: 6%; bottom: 27%; padding: 7px 9px; border-radius: 10px; background: rgba(8,10,14,.78); font: 700 12px/1.25 'Barlow Condensed'; letter-spacing: 1px; color: #FFC93C; opacity: 0; transition: opacity .35s .2s; }
.m2-call.share .tag { opacity: 1; }
.m2-call .tag b { display: block; font: 800 16px/1.1 'Barlow Condensed'; color: #fff; letter-spacing: .5px; }
/* Mack's phone: the group chat */
.m2-chat { position: absolute; inset: 0; padding: 17% 5% 5%; background: linear-gradient(#0D1210, #070908); display: flex; flex-direction: column; }
.m2-chat .hd { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(182,255,59,.2); }
.m2-chat .hd .gi { width: 28px; height: 28px; border-radius: 50%; background: #B6FF3B; color: #0A0C10; display: grid; place-items: center; font: 800 15px/1 'Barlow Condensed'; }
.m2-chat .hd .n { font: 800 17px/1 'Barlow Condensed'; letter-spacing: .5px; }
.m2-chat .hd .s { font: 600 11px/1 'Barlow Condensed'; color: rgba(255,255,255,.5); letter-spacing: 1px; margin-top: 3px; }
.m2-chat .list { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; overflow: hidden; padding-top: 8px; }
.m2-chat .m { display: flex; gap: 6px; align-items: flex-end; opacity: 0; transform: translateY(12px); transition: opacity .3s, transform .4s cubic-bezier(.2,.7,.2,1); }
.m2-chat .m.on { opacity: 1; transform: none; }
.m2-chat .m.me { flex-direction: row-reverse; }
.m2-chat .av { flex: 0 0 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font: 800 12px/1 'Barlow Condensed'; color: #0A0C10; }
.m2-chat .b { max-width: 78%; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.08); font: 600 14px/1.2 'Barlow Condensed'; }
.m2-chat .m.me .b { background: rgba(182,255,59,.16); }
.m2-chat .b .w { font: 700 11px/1 'Barlow Condensed'; letter-spacing: 1px; margin-bottom: 3px; }
.m2-chat .b svg { display: block; width: 100%; border-radius: 6px; margin: 2px 0 4px; }
`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (Jane on her end of the call is herself now: her model's frames in her room, jane.js; the drawing she was is gone)

// her screen share: Midtown's grid, the burner's twin pinging at 7th Ave and W 47th St (Times Square's bowtie), the
// trail of older pings coming up from Chelsea
const MAP_SVG = `<svg class="map" viewBox="0 0 90 192" preserveAspectRatio="xMidYMid slice">
  <rect width="90" height="192" fill="#0A1322"/>
  ${[10, 24, 38, 52, 66, 80].map((x) => `<rect x="${x}" y="0" width="3" height="192" fill="#16243C"/>`).join('')}
  ${[14, 30, 46, 62, 78, 94, 110, 126, 142, 158, 174].map((y) => `<rect x="0" y="${y}" width="90" height="1.6" fill="#132036"/>`).join('')}
  <path d="M62 0 L30 192" stroke="#1D2E4C" stroke-width="2.4"/>
  <path d="M40 62 L48 78 L40 94 Z" fill="#1F3A66" opacity=".8"/>
  <path d="M33 150 L36 132 L40 114 L44 98 L45 84" fill="none" stroke="#FFC93C" stroke-width="1.2" stroke-dasharray="2.2 2.2" opacity=".7"/>
  ${[[33, 150], [36, 132], [40, 114], [44, 98]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#FFC93C" opacity=".6"/>`).join('')}
  <circle cx="45" cy="80" r="3" fill="#EF4444"/>
  <circle cx="45" cy="80" r="3" fill="none" stroke="#EF4444" stroke-width="1"><animate attributeName="r" values="3;16" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite"/></circle>
  <circle cx="45" cy="80" r="3" fill="none" stroke="#EF4444" stroke-width="1"><animate attributeName="r" values="3;16" dur="1.6s" begin=".8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.6s" begin=".8s" repeatCount="indefinite"/></circle>
  <text x="49" y="74" font-family="Barlow Condensed" font-weight="700" font-size="5.5" fill="#fff">7 AV · W 47 ST</text>
  <text x="6" y="186" font-family="Barlow Condensed" font-weight="700" font-size="5" fill="#6CB8FF" letter-spacing=".6">JANE IS SHARING HER SCREEN</text>
</svg>`;

// a photo in the chat: Dan's front door on E 37th St (the dark door under its canopy, 214 in brass)
const DOOR_SVG = `<svg viewBox="0 0 120 80"><rect width="120" height="80" fill="#5A2F22"/>
  <g fill="#6B3828">${Array.from({ length: 10 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 18 + (r % 2) * 9 - 6}" y="${r * 8}" width="16" height="6.4"/>`).join('')).join('')}</g>
  <rect x="44" y="20" width="32" height="60" fill="#121316"/><rect x="47" y="23" width="26" height="57" fill="#1B1D21"/><rect x="57" y="30" width="7" height="30" fill="#0A0C10"/>
  <rect x="66" y="47" width="1.6" height="9" fill="#C9A453"/><rect x="38" y="13" width="44" height="5" fill="#0D0E10"/>
  <text x="60" y="11" font-family="Barlow Condensed" font-weight="700" font-size="8" fill="#C9A453" text-anchor="middle">214</text>
  <rect x="0" y="0" width="120" height="80" fill="url(#m2flash)" opacity=".25"/><defs><radialGradient id="m2flash"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs></svg>`;

export function createM2UI(ui) {
  if (!document.getElementById('m2-css')) { const st = document.createElement('style'); st.id = 'm2-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = ui.root;
  const el = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  const content = () => ui.phone.el.querySelector('.content');

  /* ------------------------------------------------------- Jane's call -- */
  let callEl = null, waveEl = null, clockEl = null, callT = 0, feed = null;
  const call = {
    show() {
      ui.phone.show('ended'); // (the frame, the shade: its content is ours)
      const c = content(); if (!c) return;
      c.innerHTML = `<div class="m2-call"><div class="feed"></div>${MAP_SVG}<div class="label">JANE<small class="clock">VIDEO CALL · 00:00</small></div>
        <div class="tag">BURNER TWIN · LAST PING 20 MIN AGO<b>7th Ave &amp; W 47th St</b></div><div class="pip"></div><div class="wave">${'<i></i>'.repeat(20)}</div><div class="end"></div></div>`;
      callEl = c.querySelector('.m2-call'); waveEl = c.querySelector('.wave'); clockEl = c.querySelector('.clock');
      feed = janePortrait(c.querySelector('.feed'), { crop: 'phone' }); callT = performance.now();
    },
    // level 0..1: her voice (the wave, her mouth)
    talk(level = 0) {
      if (!callEl) return;
      for (const b of waveEl.children) b.style.height = `${3 + Math.random() * 24 * level}px`;
      feed?.talk(level);
      const s = Math.floor((performance.now() - callT) / 1000); clockEl.textContent = `VIDEO CALL · 00:${String(s % 60).padStart(2, '0')}`;
    },
    share(on) { callEl?.classList.toggle('share', !!on); },
    hide() { if (callEl) { ui.phone.hide(); feed?.stop(); feed = null; callEl = null; } },
    get on() { return !!callEl; },
  };

  /* ------------------------------------------------------- Mack's phone -- */
  // lines: [who, colour, text, { photo, me }]
  async function chat(lines, { every = 900, title = 'SECURITY · MIDTOWN', sub = '14 members' } = {}) {
    ui.phone.show('ended');
    const c = content(); if (!c) return;
    c.innerHTML = `<div class="m2-chat"><div class="hd"><div class="gi">S</div><div><div class="n">${esc(title)}</div><div class="s">${esc(sub)}</div></div></div><div class="list"></div></div>`;
    const list = c.querySelector('.list');
    for (const [who, col, text, o = {}] of lines) {
      const m = document.createElement('div'); m.className = 'm' + (o.me ? ' me' : '');
      m.innerHTML = `<div class="av" style="background:${col}">${esc(who[0].toUpperCase())}</div><div class="b"><div class="w" style="color:${col}">${esc(who)}</div>${o.photo ? DOOR_SVG : ''}${esc(text)}</div>`;
      list.appendChild(m);
      // (older ones scroll off the top)
      while (list.children.length > 6) list.removeChild(list.firstChild);
      await sleep(30); m.classList.add('on');
      await sleep(every * (o.hold || 1));
    }
  }

  /* --------------------------------------------------------- the tail -- */
  const tailEl = el('m2-tail', `<div class="row"><span>THE VAN</span><b class="d">0 m</b></div><div class="bar"><div class="pin"></div></div><div class="note"></div><div class="sus"><span>SUSPICION</span><i><s></s></i></div>`);
  const tailD = tailEl.querySelector('.d'), pin = tailEl.querySelector('.pin'), note = tailEl.querySelector('.note'), sus = tailEl.querySelector('.sus s');
  const tail = {
    // d metres behind it, sus 0..1, the note under the bar (and its colour)
    set({ d, sus: s = 0, note: n = '', color = '#FFC93C', max = 140 }) {
      tailEl.classList.add('on');
      tailD.textContent = `${Math.round(d)} m`;
      pin.style.left = `${Math.min(100, Math.max(0, d / max * 100)).toFixed(1)}%`;
      note.textContent = n; note.style.color = color;
      sus.style.width = `${Math.round(Math.min(1, s) * 100)}%`;
    },
    hide() { tailEl.classList.remove('on'); },
  };

  /* ------------------------------------------------- lookouts' marks -- */
  const marks = new Map();
  function mark(id, { x, y, k = 0, on = true }) {
    let m = marks.get(id);
    if (!m) { m = el('m2-mark', '<span>?</span>'); marks.set(id, m); }
    const alert = k >= 1;
    m.style.left = `${x}px`; m.style.top = `${y}px`;
    m.style.setProperty('--k', String(Math.min(1, k))); m.style.setProperty('--c', alert ? '#EF4444' : k > 0.5 ? '#F59E0B' : '#FFC93C');
    m.firstChild.textContent = alert ? '!' : '?';
    m.classList.toggle('on', !!on);
  }
  function unmark(id) { const m = marks.get(id); if (m) { m.remove(); marks.delete(id); } }

  /* ------------------------------------------------- a target's damage -- */
  const tgtEl = el('m2-target', `<div class="row"><b class="n"></b><span>DAMAGE</span></div><i><s></s></i>`);
  function target(label, k = 0) {
    if (!label) { tgtEl.classList.remove('on'); return; }
    tgtEl.querySelector('.n').textContent = label; tgtEl.querySelector('s').style.width = `${Math.round(Math.min(1, Math.max(0, k)) * 100)}%`;
    tgtEl.classList.add('on');
  }

  /* ---------------------------------------------------------- a prompt -- */
  const promptEl = el('m2-prompt');
  const keycaps = (s) => esc(s).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
  // (strong: in position, the thing to do now; soft: not yet, and no key in it: on a phone a key here is its button)
  function prompt(text, { strong = false, soft = false } = {}) {
    if (!text) { promptEl.classList.remove('on'); return; }
    const html = keycaps(text); if (promptEl.innerHTML !== html) promptEl.innerHTML = html;
    promptEl.classList.toggle('strong', !!strong); promptEl.classList.toggle('soft', !!soft && !strong); promptEl.classList.add('on');
  }

  /* ---------------------------------------------------------- a banner -- */
  const bannerEl = el('m2-banner', '<div class="t"></div><div class="s"></div>');
  let bannerT = 0;
  function banner(title, sub = '', { color = '#EF4444', secs = 2.4 } = {}) {
    clearTimeout(bannerT);
    if (!title) { bannerEl.classList.remove('on'); return; }
    bannerEl.querySelector('.t').textContent = title; bannerEl.querySelector('.t').style.color = color;
    bannerEl.querySelector('.s').textContent = sub || '';
    // (in again from its larger size each time)
    bannerEl.classList.remove('on'); void bannerEl.offsetWidth; bannerEl.classList.add('on');
    bannerT = setTimeout(() => bannerEl.classList.remove('on'), secs * 1000);
  }

  return {
    call, chat, tail, mark, unmark, target, prompt, banner,
    clear() { call.hide(); tail.hide(); target(null); prompt(null); banner(null); for (const id of [...marks.keys()]) unmark(id); },
  };
}
