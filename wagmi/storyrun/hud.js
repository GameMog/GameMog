// Mog City story runner: the few HUD pieces a pack needs that Mog City had no use for, in mission/ui.js's own vocabulary
// (Barlow Condensed, panels rgba(8,10,14,.62) with a 10 px radius, yellow #FFC93C, the counter's label-over-value
// type), added to its #wg root:
//   hud.timer(secs, label, late)   a countdown chip under the counter (null: away); LATE in red once a soft one runs out
//   hud.meters(list)               the world's shown meters ([{ label, text }]) as counter-style pills, top right
//   hud.choice({ prompt, who, color, options: [{ text, locked }], secs }) -> Promise<index | -1 (no answer)>
//                                  a timed choice over the objective line: number keys, a pad's D-pad (wagmi/pad.js sends
//                                  arrow keys) and Enter, finger-sized rows; the skip ring's countdown
//   hud.card({ kicker, text, sub }, secs)   a transition card in the title card's type (ui.title's), over a fade
// All text goes in as textContent.
const CSS = `
#wg .sr-timer { position: absolute; right: 24px; bottom: 296px; text-align: right; opacity: 0; transition: opacity .3s; z-index: 4; }
#wg .sr-timer.on { opacity: 1; }
#wg .sr-timer .l { font: 700 14px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.75); }
#wg .sr-timer .v { font: 800 32px/1 'Barlow Condensed'; margin-top: 2px; font-variant-numeric: tabular-nums; }
#wg .sr-timer.low .v { color: #FFC93C; } #wg .sr-timer.late .v, #wg .sr-timer.late .l { color: #EF4444; }
#wg .sr-meters { position: absolute; right: 24px; bottom: 350px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; z-index: 4; pointer-events: none; }
#wg .sr-meters > div { display: flex; align-items: baseline; gap: 10px; padding: 6px 12px 5px; background: rgba(8,10,14,0.62); border-radius: 10px; }
#wg .sr-meters .l { font: 700 13px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.75); }
#wg .sr-meters .v { font: 800 22px/1 'Barlow Condensed'; color: #FFC93C; }
#wg .sr-choice { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%) translateY(10px); width: min(560px, calc(100vw - 32px)); padding: 14px 16px 12px;
  background: rgba(8,10,14,0.72); border-radius: 10px; backdrop-filter: blur(6px); opacity: 0; transition: opacity .25s, transform .3s; z-index: 6; pointer-events: none; }
#wg .sr-choice.on { opacity: 1; transform: translateX(-50%); pointer-events: auto; }
#wg .sr-choice .h { display: flex; align-items: center; gap: 10px; font: 700 13px/1 'Barlow Condensed'; letter-spacing: 3px; text-transform: uppercase; color: #FFC93C; margin-bottom: 6px; }
#wg .sr-choice .h svg { margin-left: auto; width: 22px; height: 22px; transform: rotate(-90deg); }
#wg .sr-choice .p { font: 600 22px/1.25 'Barlow Condensed'; margin-bottom: 10px; }
#wg .sr-choice button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; text-align: left; font: 700 20px/1.1 'Barlow Condensed'; color: #fff; background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px 12px; margin: 0 0 6px; cursor: pointer; }
#wg .sr-choice button.sel { border-color: #FFC93C; background: rgba(255,201,60,.12); }
#wg .sr-choice button.lock { opacity: .4; cursor: default; }
#wg .sr-choice kbd { display: inline-block; min-width: 22px; padding: 0 6px; border: 1px solid rgba(255,255,255,.55); border-radius: 5px; background: rgba(255,255,255,.12); font: 700 15px/22px 'Barlow Condensed'; text-align: center; }
#wg .sr-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; z-index: 7; pointer-events: none; opacity: 0; transition: opacity .5s; }
#wg .sr-card.on { opacity: 1; }
#wg .sr-card .k { font: 700 16px/1 'Barlow Condensed'; letter-spacing: 6px; text-transform: uppercase; color: #FFC93C; }
#wg .sr-card .t { font: italic 800 clamp(40px, 7vw, 84px)/.95 'Barlow Condensed'; text-transform: uppercase; margin: 10px 0 8px; }
#wg .sr-card .s { font: 600 20px/1.3 'Barlow Condensed'; color: rgba(255,255,255,.75); max-width: min(720px, calc(100vw - 32px)); }
#wg .sr-card .r { width: 110px; height: 3px; background: #FFC93C; margin: 0 auto 4px; }
body.wg-cine #wg .sr-meters, body.wg-cine #wg .sr-timer, body.wg-paused #wg .sr-meters { opacity: 0; }
#wg .sr-meters { transition: opacity .3s; }
body.touch-enabled #wg .sr-timer { right: var(--wg-r); bottom: auto; top: calc(var(--wg-t) + 120px); }
body.touch-enabled #wg .sr-meters { right: var(--wg-r); top: calc(var(--wg-t) + 180px); }
@media (max-width: 700px) { #wg .sr-choice { bottom: 120px; } }
`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHud(ui) {
  if (!document.getElementById('sr-css')) { const st = document.createElement('style'); st.id = 'sr-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = ui.root;
  const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  const timerEl = mk('sr-timer', '<div class="l"></div><div class="v"></div>');
  const metersEl = mk('sr-meters');
  const choiceEl = mk('sr-choice');
  const cardEl = mk('sr-card', '<div><div class="k"></div><div class="r"></div><div class="t"></div><div class="s"></div></div>');
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let choosing = null;
  const hud = {
    timer(secs, label = 'TIME', late = false) {
      if (secs == null) { timerEl.classList.remove('on'); return; }
      timerEl.querySelector('.l').textContent = late ? 'LATE' : String(label).toUpperCase();
      timerEl.querySelector('.v').textContent = (late ? '+' : '') + fmt(secs);
      timerEl.classList.add('on'); timerEl.classList.toggle('low', !late && secs <= 10); timerEl.classList.toggle('late', !!late);
    },
    meters(list) {
      metersEl.replaceChildren();
      for (const m of list || []) {
        const d = document.createElement('div'), l = document.createElement('span'), v = document.createElement('span');
        l.className = 'l'; v.className = 'v'; l.textContent = String(m.label).toUpperCase(); v.textContent = m.text; d.append(l, v); metersEl.appendChild(d);
      }
    },
    get choosing() { return choosing; },
    choice({ prompt = '', who = '', color = '#FFC93C', options = [], secs = 0 } = {}) {
      if (choosing) choosing.cancel();
      choiceEl.replaceChildren();
      const h = document.createElement('div'); h.className = 'h';
      const hw = document.createElement('span'); hw.textContent = who ? String(who).toUpperCase() : 'CHOOSE'; hw.style.color = color; h.appendChild(hw);
      const ring = secs > 0 ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : null;
      if (ring) { ring.setAttribute('viewBox', '0 0 22 22'); ring.innerHTML = '<circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="3"/><circle class="p" cx="11" cy="11" r="9" fill="none" stroke="#FFC93C" stroke-width="3" stroke-dasharray="56.5" stroke-dashoffset="0"/>'; h.appendChild(ring); }
      const p = document.createElement('div'); p.className = 'p'; p.textContent = prompt;
      choiceEl.append(h, p);
      const btns = options.map((o, i) => {
        const b = document.createElement('button'); b.type = 'button'; if (o.locked) b.classList.add('lock');
        const k = document.createElement('kbd'); k.textContent = String(i + 1);
        const t = document.createElement('span'); t.textContent = o.text;
        b.append(k, t); choiceEl.appendChild(b); return b;
      });
      let sel = Math.max(0, options.findIndex((o) => !o.locked));
      const mark = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
      mark(); choiceEl.classList.add('on');
      return new Promise((res) => {
        const t0 = performance.now();
        let timer = 0, done = false;
        const finish = (i) => {
          if (done) return; done = true; choosing = null;
          removeEventListener('keydown', onKey, true); cancelAnimationFrame(timer); choiceEl.classList.remove('on');
          res(i);
        };
        const pick = (i) => { if (i >= 0 && i < options.length && !options[i].locked) finish(i); };
        const onKey = (e) => {
          if (e.metaKey || e.ctrlKey || e.altKey || window.WAGMI?.paused) return;
          const n = /^(Digit|Numpad)([1-9])$/.exec(e.code);
          if (n) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) pick(+n[2] - 1); return; }
          if (['ArrowUp', 'ArrowDown'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); const d = e.code === 'ArrowUp' ? -1 : 1; for (let k = 0; k < options.length; k++) { sel = (sel + d + options.length) % options.length; if (!options[sel].locked) break; } mark(); return; }
          if (e.code === 'Enter' && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
        };
        addEventListener('keydown', onKey, true);
        btns.forEach((b, i) => b.addEventListener('click', () => pick(i)));
        const tick = () => {
          if (done) return;
          if (secs > 0 && !window.WAGMI?.paused) {
            const k = (performance.now() - t0) / 1000 / secs;
            ring?.querySelector('.p')?.setAttribute('stroke-dashoffset', String(56.5 * Math.min(1, k)));
            if (k >= 1) return finish(-1);
          }
          timer = requestAnimationFrame(tick);
        };
        tick();
        choosing = { n: options.length, pick, cancel: () => finish(-1) };
      });
    },
    async card({ kicker = '', text = '', sub = '' } = {}, secs = 2.6) {
      cardEl.querySelector('.k').textContent = kicker; cardEl.querySelector('.t').textContent = text; cardEl.querySelector('.s').textContent = sub;
      cardEl.querySelector('.r').style.display = kicker ? '' : 'none';
      cardEl.classList.add('on'); await sleep(secs * 1000); cardEl.classList.remove('on'); await sleep(450);
    },
    clear() { hud.timer(null); hud.meters([]); choosing?.cancel(); },
  };
  return hud;
}
