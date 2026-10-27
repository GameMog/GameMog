// Mog City: the chase on screen. The HEAT meter top-right, where GTA keeps its stars: five slots, the heat lit (the
// Suits' skulls in acid green, the police's stars in white); seen, they glow and the radar's rim pulses (acid green,
// or the police's red and blue); out of sight they blink, and out of the search circle they blink fast and go out one
// by one as the escape runs down. Under them, the state in words: SEEN (red, an open eye: they have a line on him,
// 'Break their line of sight') or SEARCHING (amber, the eye shut) with the escape's bar filling while they don't see him
// ('Get out of the circle' inside the search circle, where it fills slowly; 'Stay out of sight' out of it), draining
// while they do. On the radar (over the city's, under the GPS's route and blips): the search circle round where they
// last saw him (shrinking as the escape runs down), a ? where they last saw him, and a red blip for each car after him,
// with a line from it to him while it sees him.
//   const hud = createHud(W);  hud.show(chase) / hud.show(null);  (it reads chase.view() every frame)
const ACID = '#B6FF3B', RED = '#EF4444', BLUE = '#6CB8FF', HALO = 'rgba(8, 11, 15, 0.9)';
const SKULL = `<svg viewBox="0 0 24 24"><path d="M12 2.2c-5 0-8.6 3.4-8.6 8.1 0 2.7 1.2 4.6 2.9 5.8v2.6c0 .9.7 1.6 1.6 1.6h.9v-2.1h1.5v2.1h3.4v-2.1h1.5v2.1h.9c.9 0 1.6-.7 1.6-1.6v-2.6c1.7-1.2 2.9-3.1 2.9-5.8 0-4.7-3.6-8.1-8.6-8.1zM8.3 14.1a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zm7.4 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zM12 15.2l1.1 2h-2.2l1.1-2z"/></svg>`;
const STAR = `<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.4 6.7L12 17.4l-6.1 3.4 1.4-6.7-5-4.6 6.8-.8z"/></svg>`;
const CSS = `
#wg-heat { position: fixed; top: 22px; right: 28px; z-index: 30; pointer-events: none; display: flex; align-items: center; gap: 2px; opacity: 0; transform: translateY(-6px); transition: opacity .35s, transform .35s; font-family: 'Barlow Condensed', system-ui, sans-serif; }
#wg-heat.on { opacity: 1; transform: none; }
#wg-heat .lab { font: 700 12px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.8); margin-right: 8px; text-shadow: 0 1px 2px rgba(0,0,0,.85), 0 2px 10px rgba(0,0,0,.55); }
#wg-heat .p { width: 30px; height: 30px; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.9)) drop-shadow(0 2px 6px rgba(0,0,0,.45)); transition: opacity .2s, transform .2s; }
#wg-heat .p svg { width: 100%; height: 100%; display: block; }
#wg-heat .p svg path { fill: rgba(255,255,255,.14); stroke: rgba(255,255,255,.38); stroke-width: 1.1; }
#wg-heat.suits .p.lit svg path { fill: ${ACID}; stroke: #1A2408; stroke-width: .8; }
#wg-heat.police .p.lit svg path { fill: #FFFFFF; stroke: #20242B; stroke-width: .8; }
#wg-heat.seen.suits .p.lit { filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.9)) drop-shadow(0 0 7px rgba(182,255,59,.75)); }
#wg-heat.seen.police .p.lit { filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.9)) drop-shadow(0 0 7px rgba(255,255,255,.6)); }
#wg-heat.hid .p.lit { animation: wgHeatBlink 1.1s steps(1) infinite; }
#wg-heat.esc .p.lit { animation: wgHeatBlink .42s steps(1) infinite; }
#wg-heat .p.pop { transform: scale(1.35); }
#wg-heat .msg { position: absolute; right: 0; top: 38px; white-space: nowrap; font: italic 800 22px/1 'Barlow Condensed'; letter-spacing: 1px; text-transform: uppercase; color: #fff; opacity: 0; transition: opacity .3s; text-shadow: 0 1px 2px rgba(0,0,0,.85), 0 2px 10px rgba(0,0,0,.55); }
#wg-heat .msg.on { opacity: 1; }
#wg-heat .st { position: absolute; right: 0; top: 38px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; opacity: 0; transition: opacity .25s; }
#wg-heat.on.live .st { opacity: 1; }
#wg-heat .st .row { display: flex; align-items: center; gap: 7px; padding: 4px 9px 4px 7px; border-radius: 8px; background: rgba(8, 11, 15, 0.72); box-shadow: 0 0 0 1.5px rgba(255,201,60,.65); font: italic 800 17px/1 'Barlow Condensed'; letter-spacing: 1.5px; color: #FFC93C; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,.8); transition: background .2s, box-shadow .2s, color .2s; }
#wg-heat .st .eye { width: 20px; height: 20px; flex: none; }
#wg-heat .st .eye path, #wg-heat .st .eye circle { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
#wg-heat .st .eye .o { display: none; } #wg-heat .st .eye .x { display: block; }
#wg-heat .st .bar { position: relative; width: 74px; height: 8px; border-radius: 4px; background: rgba(255,255,255,.16); overflow: hidden; }
#wg-heat .st .bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; transform: scaleX(0); background: linear-gradient(180deg, #8BF7B0, #4ADE80 60%, #22A55A); }
#wg-heat .st .tip { font: 700 14px/1.1 'Barlow Condensed'; letter-spacing: .5px; color: rgba(255,255,255,.88); white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 2px 8px rgba(0,0,0,.6); }
#wg-heat.seen .st .row { background: rgba(196, 30, 30, 0.88); box-shadow: 0 0 0 1.5px #FF8A8A, 0 0 14px rgba(239,68,68,.55); color: #fff; }
#wg-heat.seen .st .eye .o { display: block; } #wg-heat.seen .st .eye .x { display: none; }
#wg-heat.seen .st .bar i { background: rgba(255,255,255,.55); }
#wg-heat .st.empty .bar { display: none; }
#wg-heat .st.flash .row { animation: wgStFlash .45s ease-out; }
@keyframes wgStFlash { 0% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes wgHeatBlink { 0% { opacity: 1; } 50% { opacity: .18; } }
body.wg-cine #wg-heat { opacity: 0 !important; }
@media (max-width: 640px) { #wg-heat { top: 70px; right: 16px; } #wg-heat .p { width: 24px; height: 24px; } #wg-heat .st { top: 32px; } #wg-heat .st .row { font-size: 15px; padding: 3px 8px 3px 6px; } #wg-heat .st .bar { width: 58px; } #wg-heat .st .tip { font-size: 13px; } }`;
const EYE = `<svg class="eye" viewBox="0 0 24 24"><g class="o"><path d="M2 12c2.6-4.6 6-7 10-7s7.4 2.4 10 7c-2.6 4.6-6 7-10 7s-7.4-2.4-10-7z"/><circle cx="12" cy="12" r="3.2"/></g><g class="x"><path d="M2.5 10.5c2.6 3.4 5.8 5 9.5 5s6.9-1.6 9.5-5M6 14.6l-1.8 2.2M12 15.6v2.8M18 14.6l1.8 2.2"/></g></svg>`;

export function createHud(W) {
  const app = W.app, ms = app.mapSystem, cm = app.controllerManager;
  if (!document.getElementById('wg-heat-css')) { const st = document.createElement('style'); st.id = 'wg-heat-css'; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div'); el.id = 'wg-heat';
  el.innerHTML = `<span class="lab">HEAT</span>${'<span class="p"></span>'.repeat(5)}<div class="msg"></div><div class="st"><div class="row">${EYE}<span class="w">SEEN</span><span class="bar"><i></i></span></div><div class="tip"></div></div>`;
  document.body.appendChild(el);
  const pips = [...el.querySelectorAll('.p')], msg = el.querySelector('.msg');
  const st = el.querySelector('.st'), stW = st.querySelector('.w'), stBar = st.querySelector('.bar i'), stTip = st.querySelector('.tip');
  let chase = null, kind = '', lit = -1, cls = '', msgT = 0, stKey = '', barK = -1;
  function show(c) {
    chase = c;
    if (!c) { el.classList.remove('on'); return; }
    if (kind !== c.kind) { kind = c.kind; for (const p of pips) p.innerHTML = kind === 'police' ? STAR : SKULL; }
    el.classList.remove('suits', 'police'); el.classList.add(kind === 'police' ? 'police' : 'suits', 'on');
    lit = -1;
  }
  function say(text, secs = 2.5) { msg.textContent = text; msg.classList.add('on'); msgT = secs; }
  // (beside the toolbar top-right while it shows, story mode's Map and Pause: the line under it is the street's 'hit and
  // run' note and the DM card's; under the sandbox's wide one)
  function place() {
    const tb = document.querySelector('.hud-top-right');
    let r = null;
    if (tb) { const s = getComputedStyle(tb), b = tb.getBoundingClientRect(); if (s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && b.height > 0 && b.width > 0) r = b; }
    if (!r) { el.style.top = el.style.right = ''; return; }
    if (r.width < innerWidth * 0.4) { el.style.top = `${Math.round(r.top + (r.height - el.offsetHeight) / 2)}px`; el.style.right = `${Math.round(innerWidth - r.left + 14)}px`; }
    // (under the sandbox's wide one, and under the street's 'hit and run' note there too: it sits at 96-132 px)
    else { el.style.top = `${Math.round(Math.max(r.bottom + 12, 140))}px`; el.style.right = ''; }
  }
  let placeT = 0;
  function frame(dt) {
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) msg.classList.remove('on'); }
    if (!chase) return;
    if ((placeT -= dt) <= 0) { placeT = 1; place(); }
    const v = chase.view();
    // (over: the pips out and the line under them a moment, then away)
    if (!v.on) {
      el.classList.remove('seen', 'hid', 'esc', 'live'); cls = ''; stKey = '';
      if (lit !== 0) { lit = 0; for (const p of pips) p.classList.remove('lit'); }
      if (msgT <= 0) el.classList.remove('on');
      return;
    }
    if (v.pips !== lit) { const was = lit; lit = v.pips; pips.forEach((p, i) => { p.classList.toggle('lit', i < lit); if (was >= 0 && i === lit - 1 && lit > was) { p.classList.add('pop'); setTimeout(() => p.classList.remove('pop'), 220); } }); }
    const c = v.seen ? 'seen' : v.escaping ? 'esc' : 'hid';
    if (c !== cls) { el.classList.remove('seen', 'hid', 'esc'); el.classList.add(c); cls = c; }
    // the state in words, the escape's bar, and what to do about it (a chase that can't be lost: the state alone)
    el.classList.add('live');
    const k = v.seen ? 'seen' : v.inCircle ? 'in' : 'out';
    if (k !== stKey) {
      const was = stKey; stKey = k;
      stW.textContent = v.seen ? 'SEEN' : 'SEARCHING';
      stTip.textContent = !v.lose ? '' : v.seen ? 'Break their line of sight' : v.inCircle ? 'Get out of the circle' : 'Stay out of sight';
      st.querySelector('.bar').style.display = v.lose ? '' : 'none';
      if (was && (was === 'seen') !== (k === 'seen')) { st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash'); }
    }
    // (seen with nothing to lose: no bar; seen with some, it is seen draining)
    const bk = Math.round((v.progress || 0) * 200) / 200;
    if (bk !== barK) { barK = bk; stBar.style.transform = `scaleX(${bk})`; }
    st.classList.toggle('empty', v.seen && bk <= 0);
  }

  /* -------------------------------------------------------------- the radar -- */
  // round the city's radar (whoever wraps it later, the GPS, draws over this)
  const orig = ms.renderMinimap.bind(ms);
  ms.renderMinimap = function () {
    orig();
    if (!chase) return;
    const v = chase.view(); if (!v.on && !v.cars.length) return;
    const cv = ms.miniCanvas, ctx = ms.miniCtx; if (!cv || !ctx || !cv.offsetParent || document.body.classList.contains('hud-minimized')) return;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2), s = ms.miniScale;
    const ent = cm.getActiveEntity(), px = ent.position.x, pz = ent.position.z, t = performance.now();
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, dpr * w * 0.5, dpr * h * 0.5);
    const toX = (x) => (x - px) * s, toY = (z) => (z - pz) * s;
    const police = v.kind === 'police', flip = Math.floor(t / 260) % 2;
    // the search circle
    if (v.on && v.circle) {
      const { x, z, r } = v.circle, cx = toX(x), cy = toY(z), rr = Math.max(0, r * s);
      const col = police ? (flip ? '239, 68, 68' : '108, 184, 255') : '182, 255, 59';
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col}, ${v.seen ? 0.16 : 0.1})`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = `rgba(${col}, ${v.seen ? 0.85 : 0.6})`;
      if (!v.seen) ctx.setLineDash([6, 5]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // (where they last saw him, while they search: a ? in a ring)
    const mx = w * 0.5 - 7, my = h * 0.5 - 7;
    if (v.on && v.last) {
      let x = toX(v.last.x), y = toY(v.last.z);
      if (Math.abs(x) > mx || Math.abs(y) > my) { const k = Math.min(mx / Math.abs(x || 1e-6), my / Math.abs(y || 1e-6)); x *= k; y *= k; }
      ctx.fillStyle = HALO; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.8; ctx.strokeStyle = '#FFC93C'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#FFC93C'; ctx.font = "800 11px 'Barlow Condensed', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y + 0.5);
    }
    // (a car that sees him: a line from it to him)
    for (const c of v.cars) {
      if (!c.sees) continue;
      const x = toX(c.x), y = toY(c.z), L = Math.hypot(x, y); if (L < 8) continue;
      ctx.lineWidth = 2; ctx.strokeStyle = `rgba(239, 68, 68, ${0.55 + 0.3 * flip})`; ctx.setLineDash([4, 3]);
      const k = Math.min(1, Math.min(mx / Math.abs(x || 1e-6), my / Math.abs(y || 1e-6)));
      ctx.beginPath(); ctx.moveTo(x * k, y * k); ctx.lineTo(x / L * 8, y / L * 8); ctx.stroke(); ctx.setLineDash([]);
    }
    // the cars after him: red (the police's flashing red and blue), held at the radar's edge when off it; one that has
    // lost him a little dimmer
    for (const c of v.cars) {
      let x = toX(c.x), y = toY(c.z);
      const out = Math.abs(x) > mx || Math.abs(y) > my;
      if (out) { const k = Math.min(mx / Math.abs(x || 1e-6), my / Math.abs(y || 1e-6)); x *= k; y *= k; }
      const r = out ? 3.4 : 4.6, colr = c.wrecked ? 'rgba(160, 160, 160, 0.9)' : police ? (flip ^ (c.i & 1) ? RED : BLUE) : RED;
      ctx.globalAlpha = c.wrecked || c.sees || !v.searching ? 1 : 0.72;
      ctx.fillStyle = HALO; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (c.sees) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x, y, r + 2.6, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // the rim, pulsing while they see him
    if (v.on && v.seen) {
      const k = 0.5 + 0.5 * Math.sin(t / 1000 * Math.PI * 2 * 1.6);
      const col = police ? (flip ? `rgba(239, 68, 68, ${0.45 + 0.45 * k})` : `rgba(108, 184, 255, ${0.45 + 0.45 * k})`) : `rgba(182, 255, 59, ${0.35 + 0.5 * k})`;
      ctx.lineWidth = 3 + 2 * k; ctx.strokeStyle = col;
      const x0 = -w / 2 + 1.5, y0 = -h / 2 + 1.5, ww = w - 3, hh = h - 3, rad = 16;
      ctx.beginPath(); ctx.moveTo(x0 + rad, y0); ctx.arcTo(x0 + ww, y0, x0 + ww, y0 + hh, rad); ctx.arcTo(x0 + ww, y0 + hh, x0, y0 + hh, rad); ctx.arcTo(x0, y0 + hh, x0, y0, rad); ctx.arcTo(x0, y0, x0 + ww, y0, rad); ctx.closePath(); ctx.stroke();
    }
    // (his arrow again on top, as the city draws it)
    ctx.rotate(-ent.heading + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 7 * 0.45); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.strokeStyle = HALO; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  };
  return { show, frame, say, el };
}
