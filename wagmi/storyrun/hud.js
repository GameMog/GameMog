// Mog City story runner: the few HUD pieces a pack needs that Mog City had no use for, in mission/ui.js's own vocabulary
// (Barlow Condensed, panels rgba(8,10,14,.62) with a 10 px radius, yellow #FFC93C, the counter's label-over-value
// type), added to its #wg root:
//   hud.timer(secs, label, late)   a countdown chip under the counter (null: away); LATE in red once a soft one runs out
//   hud.meters(list)               the world's shown meters ([{ label, text }]) as counter-style pills, top right
//   hud.choice({ prompt, who, color, options: [{ text, locked }], secs }) -> Promise<index | -1 (no answer)>
//                                  a timed choice over the objective line: number keys, a pad's D-pad (wagmi/pad.js sends
//                                  arrow keys) and Enter, finger-sized rows; the skip ring's countdown
//   hud.card({ kicker, text, sub }, secs)   a transition card in the title card's type (ui.title's), over a fade
//   hud.bar(label, k, note)        a meter bar (0..1) in Mission 2's tail-meter look, bottom right (a passenger's
//                                  comfort); null: away. While a tail runs and nothing else has the bar, it is the
//                                  tail's way to go: who is followed, to where, the metres he has left, the bar filling
//   hud.meters(list)               (a meter with a goal: { label, text: '$430,000 / $1,000,000', k: 0.43 } is the big
//                                  money pill, its progress under it); hud.delta(label, '+$85,000', good) flashes beside it
//   hud.passed(card, secs)         the story's MISSION PASSED card (rules.js passCard: the title, what was gained, the
//                                  meter's progress filling from before to after, the pass line, NEXT); a sting with it
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
#wg .sr-choice .sep { font-style: normal; } #wg .sr-choice .m { font-weight: inherit; }
#wg .sr-choice kbd { display: inline-block; min-width: 22px; padding: 0 6px; border: 1px solid rgba(255,255,255,.55); border-radius: 5px; background: rgba(255,255,255,.12); font: 700 15px/22px 'Barlow Condensed'; text-align: center; }
/* (a card is a title over the game: above ui.fade's cover (.wg-fade, z 20), so a fade under it dims the city, never the
   words; its own soft vignette behind the words, about 30% in the middle and none at the edges, so with an act's half dim
   (index.js ACT_DIM) the frame is at most about half dark and the words read bright on a sunlit street) */
#wg .sr-card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; z-index: 21; pointer-events: none; opacity: 0; transition: opacity .5s;
  background: radial-gradient(ellipse 60% 45% at 50% 50%, rgba(0,0,0,.3), rgba(0,0,0,.14) 60%, rgba(0,0,0,0)); text-shadow: 0 2px 12px rgba(0,0,0,.6), 0 1px 2px rgba(0,0,0,.85); }
#wg .sr-card.on { opacity: 1; }
#wg .sr-card .k { font: 700 16px/1 'Barlow Condensed'; letter-spacing: 6px; text-transform: uppercase; color: #FFC93C; }
#wg .sr-card .t { font: italic 800 clamp(40px, 7vw, 84px)/.95 'Barlow Condensed'; text-transform: uppercase; margin: 10px 0 8px; }
#wg .sr-card .s { font: 600 20px/1.3 'Barlow Condensed'; color: rgba(255,255,255,.92); max-width: min(720px, calc(100vw - 32px)); }
#wg .sr-card .r { width: 110px; height: 3px; background: #FFC93C; margin: 0 auto 4px; }
#wg .sr-bar { position: absolute; right: 24px; bottom: 228px; width: 250px; padding: 10px 14px 12px; background: rgba(8,10,14,0.62); border-radius: 10px; opacity: 0; transition: opacity .3s; z-index: 4; pointer-events: none; }
#wg .sr-bar.on { opacity: 1; }
#wg .sr-bar .row { display: flex; justify-content: space-between; align-items: baseline; font: 700 14px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.75); }
#wg .sr-bar .row b { font: 800 15px/1 'Barlow Condensed'; letter-spacing: 2px; color: #FFC93C; }
#wg .sr-bar .row b.low { color: #EF4444; }
/* (a danger bar at its safe end: its note green, over the glass theme's amber too) */
#wg .sr-bar .row b.ok, html.ui-glass #wg .sr-bar .row b.ok { color: #4ADE80; }
#wg .sr-bar i { display: block; height: 10px; margin-top: 8px; border-radius: 5px; overflow: hidden; background: rgba(255,255,255,.14); }
#wg .sr-bar i s { display: block; height: 100%; width: 100%; background: #4ADE80; transition: width .15s linear, background .3s; }
#wg:has(.sr-bar.on) .wg-caller { bottom: 296px; }
body:not(.touch-enabled) #wg:has(.sr-bar.on) .wg-count { bottom: 292px; }
body:not(.touch-enabled) #wg:has(.sr-bar.on):has(.wg-count.on) .sr-timer { bottom: 352px; }
body:not(.touch-enabled) #wg:has(.sr-bar.on):has(.wg-count.on) .sr-meters { bottom: 414px; }
body.wg-cine #wg .sr-bar, body.wg-paused #wg .sr-bar { opacity: 0; }
#wg .sr-bar.go { width: auto; min-width: 250px; max-width: min(380px, calc(100vw - 32px)); }
#wg .sr-bar.go .row { gap: 18px; } #wg .sr-bar.go .row b { color: #fff; font-variant-numeric: tabular-nums; }
/* (on a phone the card stays up top (it was stretched from there down to the bar's bottom: a tall dark panel down the
   right), and the tail meter sits low on the left over the stick, clear of the clock and the meters' column) */
body.touch-enabled #wg:has(.sr-bar.on) .wg-caller { bottom: auto; }
body.touch-enabled #wg .sr-bar.go { left: var(--wg-l); right: auto; top: auto; bottom: 200px; min-width: 0; max-width: calc(100vw - 32px); }
body.touch-enabled #wg .sr-bar { right: var(--wg-r); bottom: auto; top: calc(var(--wg-t) + 240px); }
body.wg-cine #wg .sr-meters, body.wg-cine #wg .sr-timer, body.wg-paused #wg .sr-meters { opacity: 0; }
#wg .sr-meters { transition: opacity .3s; }
body.touch-enabled #wg .sr-timer { right: var(--wg-r); bottom: auto; top: calc(var(--wg-t) + 120px); }
body.touch-enabled #wg .sr-meters { right: var(--wg-r); top: calc(var(--wg-t) + 180px); }
@media (max-width: 700px) { #wg .sr-choice { bottom: 120px; } }
#wg .sr-meters > div.goal { flex-direction: column; align-items: flex-end; gap: 4px; padding: 8px 14px 9px; min-width: 230px; }
#wg .sr-meters > div.goal .v { font-size: 30px; color: #4ADE80; letter-spacing: .5px; font-variant-numeric: tabular-nums; }
#wg .sr-meters > div.goal i { display: block; width: 100%; height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,.14); }
#wg .sr-meters > div.goal i s { display: block; height: 100%; background: #4ADE80; transition: width .6s cubic-bezier(.2,.7,.2,1); }
#wg .sr-meters .d { position: absolute; right: calc(100% + 10px); top: 6px; font: 800 26px/1 'Barlow Condensed'; color: #4ADE80; white-space: nowrap; opacity: 0; transform: translateX(8px); transition: opacity .25s, transform .4s; text-shadow: 0 2px 8px rgba(0,0,0,.7); }
#wg .sr-meters .d.bad { color: #EF4444; }
#wg .sr-meters .d.on { opacity: 1; transform: none; }
#wg .sr-meters > div { position: relative; }
#wg .sr-timer .v { font-size: 40px; }
#wg .sr-timer.low .v { color: #EF4444; animation: sr-pulse 1s steps(2, start) infinite; }
@keyframes sr-pulse { 50% { opacity: .45; } }
#wg .sr-pass { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 8; opacity: 0; transition: opacity .5s; pointer-events: none; text-align: center;
  background: radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, rgba(0,0,0,.25) 55%, rgba(0,0,0,0) 80%); }
#wg .sr-pass.on { opacity: 1; }
#wg .sr-pass .h { font: italic 800 clamp(56px, 10vw, 120px)/.9 'Barlow Condensed'; color: #FFC93C; letter-spacing: 1px; text-shadow: 0 4px 28px rgba(0,0,0,.7); transform: scale(1.25); transition: transform .7s cubic-bezier(.2,.7,.2,1); }
#wg .sr-pass.on .h { transform: none; }
#wg .sr-pass .t { font: 700 clamp(26px, 4vw, 40px)/1.05 'Barlow Condensed'; text-transform: uppercase; margin-top: 8px; text-shadow: 0 2px 10px rgba(0,0,0,.7); }
#wg .sr-pass .box { margin-top: 20px; min-width: min(420px, calc(100vw - 32px)); max-width: calc(100vw - 32px); padding: 14px 22px 16px; background: rgba(8,10,14,0.7); border-radius: 10px; }
#wg .sr-pass .g { display: flex; justify-content: space-between; align-items: baseline; gap: 40px; font: 700 18px/1.2 'Barlow Condensed'; letter-spacing: 2px; color: rgba(255,255,255,.7); margin: 2px 0 6px; }
#wg .sr-pass .g b { font: 800 40px/1 'Barlow Condensed'; letter-spacing: .5px; color: #4ADE80; font-variant-numeric: tabular-nums; }
#wg .sr-pass .g b.bad { color: #EF4444; }
#wg .sr-pass .st { display: flex; justify-content: space-between; font: 700 16px/1.6 'Barlow Condensed'; letter-spacing: 2px; color: rgba(255,255,255,.6); }
#wg .sr-pass .p { margin-top: 8px; text-align: left; }
#wg .sr-pass .p .row { display: flex; justify-content: space-between; font: 700 15px/1 'Barlow Condensed'; letter-spacing: 2.5px; color: rgba(255,255,255,.7); }
#wg .sr-pass .p .row span:last-child { font: 800 22px/1 'Barlow Condensed'; letter-spacing: .5px; color: #fff; }
#wg .sr-pass .p i { display: block; position: relative; height: 12px; margin-top: 8px; border-radius: 6px; overflow: hidden; background: rgba(255,255,255,.14); }
#wg .sr-pass .p i s, #wg .sr-pass .p i u { position: absolute; left: 0; top: 0; bottom: 0; display: block; }
#wg .sr-pass .p i s { background: rgba(74,222,128,.45); } #wg .sr-pass .p i u { background: #4ADE80; transition: width 1.4s cubic-bezier(.2,.7,.2,1) .5s; }
#wg .sr-pass .ln { margin-top: 12px; font: 600 19px/1.3 'Barlow Condensed'; color: rgba(255,255,255,.85); }
#wg .sr-pass .nx { margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.14); text-align: left; }
#wg .sr-pass .nx .k { font: 700 13px/1 'Barlow Condensed'; letter-spacing: 4px; color: #FFC93C; }
#wg .sr-pass .nx .n { font: 800 24px/1.1 'Barlow Condensed'; text-transform: uppercase; margin-top: 4px; }
#wg .sr-pass .nx .s { font: 600 16px/1.3 'Barlow Condensed'; color: rgba(255,255,255,.75); margin-top: 2px; }
/* (on a phone the meters are pills a size down, so the right edge's column fits beside the objective) */
body.touch-enabled #wg .sr-meters > div.goal { min-width: 0; padding: 5px 10px 6px; }
body.touch-enabled #wg .sr-meters > div.goal .v { font-size: 20px; }
body.touch-enabled #wg .sr-meters .l { font-size: 11px; letter-spacing: 2px; }
body.touch-enabled #wg .sr-pass .box { padding: 10px 16px 12px; } body.touch-enabled #wg .sr-pass .g b { font-size: 30px; }
`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHud(ui) {
  if (!document.getElementById('sr-css')) { const st = document.createElement('style'); st.id = 'sr-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = ui.root;
  const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  const timerEl = mk('sr-timer', '<div class="l"></div><div class="v"></div>');
  const metersEl = mk('sr-meters');
  const choiceEl = mk('sr-choice');
  const barEl = mk('sr-bar', '<div class="row"><span class="l"></span><b></b></div><i><s></s></i>');
  const cardEl = mk('sr-card', '<div><div class="k"></div><div class="r"></div><div class="t"></div><div class="s"></div></div>');
  const passEl = mk('sr-pass');
  const tx = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const deltas = new Map();
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let choosing = null, cardN = 0;
  // a clock or a meter never under a call's card: Mog City's count (STOPS 0/3), the clock, then the meters, each moved
  // clear of the caller card (and of what was moved before it), up where the column stacks up from the bottom (a desk),
  // down where it hangs from the top (a phone, body.touch-enabled, where the car's pills down the right edge are in the
  // way too). Mog City's card moves with what else is up (a tail meter, a damage bar), so this looks at where it is, five
  // times a second. (PT-3's van: the BANK SWEEP clock sat half under Carissa's card)
  const shown = (e) => e.classList.contains('on') || (e === metersEl && e.children.length > 0);
  const unstack = () => {
    const down = document.body.classList.contains('touch-enabled');
    const C = root.querySelector('.wg-caller'), count = root.querySelector('.wg-count');
    const obst = C && C.classList.contains('on') && !document.body.classList.contains('wg-cine') ? [C.getBoundingClientRect()] : [];
    const pills = down ? document.querySelector('.pills') : null, pr = pills && pills.getBoundingClientRect();
    if (pr && pr.height && getComputedStyle(pills).display !== 'none' && getComputedStyle(pills).visibility !== 'hidden') obst.push(pr);
    for (const e of [count, timerEl, metersEl]) {
      if (!e) continue;
      const was = e.style.translate;
      if (!obst.length || !shown(e)) { if (was) e.style.translate = ''; continue; }
      e.style.translate = '';
      const R = e.getBoundingClientRect();
      if (!R.height) continue;
      let dy = 0;
      for (let n = 0; n < 3; n++) {
        let moved = false;
        for (const O of obst) {
          const top = R.top + dy, bot = R.bottom + dy;
          if (R.left >= O.right || O.left >= R.right || top >= O.bottom + 6 || O.top - 6 >= bot) continue;
          dy = down ? dy + (O.bottom + 8 - top) : dy - (bot - O.top + 8); moved = true;
        }
        if (!moved) break;
      }
      const v = dy ? `0 ${Math.round(dy)}px` : '';
      if (v !== was) e.style.translate = v;
      obst.push({ left: R.left, right: R.right, top: R.top + dy, bottom: R.bottom + dy });
    }
  };
  setInterval(unstack, 200);
  // a tail's way to go, in the bar (Mog City's tail-meter slot, so the caller card and the clock already clear it):
  // 'DASH -> WASHINGTON MEWS 420 m', the bar filling as the followed car gets there (the owner, PT-7: "I followed for 5
  // minutes but nothing happened": a tail said nothing of how far it had to go). Read off the runner's followed car
  // (runner.js STEPS.tail: M.tail, the step's route and name); away when the tail ends, never over a bar of the runner's
  let barOwn = false, tailOn = false;
  const who = (n) => { const m = /^(.+?)'s\b/.exec(String(n || '')); return (m ? m[1] : String(n || 'them')).replace(/^the /i, ''); };
  setInterval(() => {
    let R = null, M = null, D = null, d = null;
    try { R = window.WAGMI?.storyrun?.runner; M = R?.M; D = M?.tail; d = M?.def?.steps?.[M.i]; } catch {}
    if (barOwn || !D || !d || d.type !== 'tail' || !(D.length > 0)) { if (tailOn) { tailOn = false; if (!barOwn) barEl.classList.remove('on', 'go'); } return; }
    let to = '';
    try { const r = Array.isArray(d.route) ? d.route[d.route.length - 1] : null; to = (r && R.placeOf?.(r)?.name) || ''; } catch {}
    const left = Math.max(0, Math.round(D.length - D.s)), k = Math.max(0, Math.min(1, D.s / D.length));
    barEl.querySelector('.l').textContent = (to ? `${who(d.name)} \u2192 ${to}` : `${who(d.name)}: to go`).toUpperCase();
    const b = barEl.querySelector('b'); b.textContent = left >= 1000 ? `${(left / 1000).toFixed(1)} km` : `${left} m`; b.classList.remove('low');
    const f = barEl.querySelector('s'); f.style.width = `${(k * 100).toFixed(1)}%`; f.style.background = '#60A5FA';
    barEl.classList.add('on', 'go'); tailOn = true;
  }, 250);
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
        // (a meter with a goal: the big pill, its progress under it)
        if (m.k != null) { d.classList.add('goal'); const i = document.createElement('i'), f = document.createElement('s'); f.style.width = `${(Math.max(0, Math.min(1, m.k)) * 100).toFixed(1)}%`; i.appendChild(f); d.appendChild(i); }
        const dl = deltas.get(String(m.label).toUpperCase());
        if (dl && performance.now() < dl.until) { const e = tx('span', `d on${dl.good ? '' : ' bad'}`, dl.text); d.appendChild(e); }
      }
    },
    // a meter's change, flashed beside it for a few seconds ('+$85,000'); the next meters() call draws it
    delta(label, text, good = true) {
      if (!text) return;
      const k = String(label).toUpperCase(); deltas.set(k, { text, good, until: performance.now() + 3200 });
      for (const d of metersEl.children) if (d.querySelector('.l')?.textContent === k) { d.querySelector('.d')?.remove(); d.appendChild(tx('span', `d on${good ? '' : ' bad'}`, text)); }
      setTimeout(() => { for (const e of metersEl.querySelectorAll('.d')) if (deltas.get(k)?.until <= performance.now()) e.classList.remove('on'); }, 3300);
    },
    // the story's MISSION PASSED card (rules.js passCard), held secs; its meter's bar fills from before to after
    async passed(c, secs = 6) {
      passEl.replaceChildren();
      // (head: the big word, MISSION PASSED unless the card says otherwise: an act's end card names the act or the story)
      passEl.append(tx('div', 'h', c.head || 'MISSION PASSED'), tx('div', 't', c.title || ''));
      const box = tx('div', 'box');
      for (const g of c.gains || []) { const r = tx('div', 'g'); r.append(tx('span', '', g.label)); const b = tx('b', g.good ? '' : 'bad', g.text); r.appendChild(b); box.appendChild(r); }
      for (const [a, b] of c.stats || []) { const r = tx('div', 'st'); r.append(tx('span', '', a), tx('span', '', b)); box.appendChild(r); }
      let fill = null;
      if (c.progress) {
        const p = tx('div', 'p'), row = tx('div', 'row'); row.append(tx('span', '', c.progress.label), tx('span', '', c.progress.text));
        const i = tx('i'), s0 = tx('s'), u = tx('u'); s0.style.width = `${((c.progress.k1 ?? 0) * 100).toFixed(1)}%`; u.style.width = `${((c.progress.k0 ?? 0) * 100).toFixed(1)}%`;
        i.append(s0, u); p.append(row, i); box.appendChild(p); fill = () => { u.style.width = `${((c.progress.k1 ?? 0) * 100).toFixed(1)}%`; };
      }
      if (c.line) box.appendChild(tx('div', 'ln', c.line));
      if (c.next && c.next.title) { const n = tx('div', 'nx'); n.append(tx('div', 'k', 'NEXT'), tx('div', 'n', c.next.title)); if (c.next.sub) n.appendChild(tx('div', 's', c.next.sub)); box.appendChild(n); }
      if (box.childNodes.length) passEl.appendChild(box);
      passEl.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => fill?.()));
      await sleep(secs * 1000); passEl.classList.remove('on'); await sleep(500);
    },
    // ({ danger: true }: a bar where full is bad (a NOISE bar, how close a chaser is): green low, red high)
    bar(label, k = 1, note = '', { danger = false } = {}) {
      barOwn = label != null;
      if (label == null) { barEl.classList.remove('on'); return; }
      barEl.classList.remove('go');
      k = Math.max(0, Math.min(1, +k || 0));
      barEl.querySelector('.l').textContent = String(label).toUpperCase();
      const bad = danger ? k > 0.7 : k < 0.3, warn = danger ? k > 0.4 : k < 0.6;
      const b = barEl.querySelector('b'); b.textContent = String(note || ''); b.classList.toggle('low', bad); b.classList.toggle('ok', danger && !warn);
      const f = barEl.querySelector('s'); f.style.width = `${(k * 100).toFixed(1)}%`; f.style.background = bad ? '#EF4444' : warn ? '#FFC93C' : '#4ADE80';
      barEl.classList.add('on');
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
      // (an option 'SMASH THE CORE: what it does' as its name and what it does, the ': ' kept between them so it reads
      // as one line as before; a theme can set them apart)
      const opts = document.createElement('div'); opts.className = 'opts'; choiceEl.appendChild(opts);
      choiceEl.classList.toggle('n2', options.length === 2);
      const btns = options.map((o, i) => {
        const b = document.createElement('button'); b.type = 'button'; if (o.locked) b.classList.add('lock');
        const k = document.createElement('kbd'); k.textContent = String(i + 1);
        const t = document.createElement('span'), s = String(o.text ?? ''), at = s.indexOf(': ');
        if (at > 0 && at < 48) t.append(tx('b', 'm', s.slice(0, at)), tx('i', 'sep', ': '), tx('span', 'c', s.slice(at + 2))); else t.append(tx('span', 'm', s));
        b.append(k, t); opts.appendChild(b); return b;
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
      // (only the last card shown takes it down: a second card while one is up is not cut short by the first's end)
      const my = ++cardN;
      cardEl.classList.add('on'); await sleep(secs * 1000); if (my === cardN) cardEl.classList.remove('on'); await sleep(450);
    },
    clear() { hud.timer(null); hud.meters([]); hud.bar(null); choosing?.cancel(); passEl.classList.remove('on'); },
  };
  return hud;
}
