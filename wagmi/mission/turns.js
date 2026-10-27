// Mog City: the turn-by-turn cue. In the car, with a place to go, the next turn on the GPS route and the street it
// turns onto, at the top of the screen ('Right on W 42nd St · 120 m'); past the last turn, the place itself and how far
// ('Times Square · 80 m'). The streets are named by the city's own roads (window.NYC.nearestRoads). Hidden on foot, in a
// cutscene, paused, on the full map, in the clean view, and for a target on the move (a car he chases: the radar's line
// does that job, a cue would flick with its every turn).
//   const turns = createTurns(W, gps);  turns.step() (the GPS calls it from the radar's draw: 5 times a second at most)
//   turns.cue             { kind: 'turn', dir: 'L' | 'R' | 'U', dist, name, at: [x, z], ux, uz } | { kind: 'arrive', dist }
//                         | null (hidden); at is the corner, (ux, uz) the way out of it (the radar's turn chevron)
//   nextTurn(route, nameAt)   the pure part: the next turn on a route (gps.route), its street named by nameAt(x, z, horiz)
// Where it sits: on a computer, the top middle. On a phone it heads the column beside the radar (sideways) or under it
// (upright): the objective tracker, the help, an offer or a DM, and M2's meters move down a row while it shows
// (body.wg-turnon), so it covers none of them, the toolbar, the car's pills or a call.

// route = gps.route: pts[0] is where he is, pts[1] the lane under him (the snap: never a turn), the last point the
// target itself (the arrival leg: never a turn); x east, z south, so cross > 0 is a RIGHT turn
export function nextTurn(route, nameAt) {
  if (!route || route.length < 3) return null;
  const seg = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, L }; };
  let along = Math.hypot(route[1][0] - route[0][0], route[1][1] - route[0][1]);
  const S = [];
  for (let i = 2; i < route.length - 1; i++) { const s = seg(route[i - 1], route[i]); if (s.L > 2) { s.at = along; S.push(s); } along += s.L || 0; }
  const n = route.length, last = Math.hypot(route[n - 1][0] - route[n - 2][0], route[n - 1][1] - route[n - 2][1]), total = along + last;
  const ang = (p, q) => Math.atan2(p.ux * q.uz - p.uz * q.ux, p.ux * q.ux + p.uz * q.uz);
  const D = Math.PI / 180;
  for (let i = 1; i < S.length; i++) {
    if (Math.abs(ang(S[i - 1], S[i])) < 20 * D) continue;
    // a corner is drawn as 2-3 bends (edge end, a diagonal connector across the junction, the next edge): the bends
    // starting within 30 m are one turn, and its exit is the longest of them (the new street's edge; connectors are short)
    let j = i; while (j + 1 < S.length && S[j + 1].at - S[i].at < 30) j++;
    const out = S.slice(i, j + 1).reduce((m, s) => (s.L > m.L ? s : m)), net = ang(S[i - 1], out);
    if (Math.abs(net) < 35 * D) { i = j; continue; }                            // a jog: not a turn
    const name = nameAt(out.a[0] + out.ux * Math.min(18, out.L * 0.5), out.a[1] + out.uz * Math.min(18, out.L * 0.5), Math.abs(out.ux) > Math.abs(out.uz));
    return { kind: 'turn', dir: Math.abs(net) > 150 * D ? 'U' : net > 0 ? 'R' : 'L', dist: S[i].at, name, at: [S[i].a[0], S[i].a[1]], ux: out.ux, uz: out.uz };
  }
  // (the arrival leg is a turn only when it is a real stretch: a place off the traffic's roads, the yard on 12th Ave
  // reached along W 55th St; a few metres from the lane to the spot is just the arrival)
  if (last > 40 && S.length) {
    const p = S[S.length - 1], q = seg(route[n - 2], route[n - 1]), net = ang(p, q);
    if (Math.abs(net) >= 35 * D) {
      const name = nameAt(q.a[0] + q.ux * 18, q.a[1] + q.uz * 18, Math.abs(q.ux) > Math.abs(q.uz));
      return { kind: 'turn', dir: Math.abs(net) > 150 * D ? 'U' : net > 0 ? 'R' : 'L', dist: along, name, at: [q.a[0], q.a[1]], ux: q.ux, uz: q.uz };
    }
  }
  return { kind: 'arrive', dist: total };
}

// the street at (x, z): of the city's roads within 30 m, the nearest that runs the way the route does
export function nameAt(x, z, horiz) {
  const N = window.NYC; if (!N?.nearestRoads) return null;
  const near = N.nearestRoads(x, z, 30);
  return (near.find((r) => r.horizontal === horiz) || near[0])?.road.name || null;
}

// '120 m' (10 m steps), '1.2 km', 'now' under 25 m (at a place: 'here')
export function distText(d, arrive = false) {
  if (d < 25) return arrive ? 'here' : 'now';
  if (d < 995) return `${Math.round(d / 10) * 10} m`;
  return `${(d / 1000).toFixed(1)} km`;
}

// the arrows (inline: the font may lack ↱ ↰)
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON = {
  R: SVG('M7 21V12.5a4 4 0 0 1 4-4h8.5M15 4.5l4 4-4 4'),
  L: SVG('M17 21V12.5a4 4 0 0 0-4-4H4.5M9 4.5l-4 4 4 4'),
  U: SVG('M16.5 21V9.5a4.5 4.5 0 0 0-9 0V17M4 13.5l3.5 4 3.5-4'),
  arrive: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>`,
};
const WORD = { R: 'Right', L: 'Left', U: 'U-turn' };

const CSS = `
#wg .wg-turn { position: absolute; top: 18px; left: 50%; transform: translate(-50%, -6px); display: flex; gap: 10px; align-items: center; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 8px 16px 8px 12px; background: rgba(8,10,14,.72); border-radius: 10px; font: 700 22px/1 'Barlow Condensed', system-ui, sans-serif; color: #fff; white-space: nowrap;
  opacity: 0; transition: opacity .25s, transform .25s; z-index: 4; pointer-events: none; backdrop-filter: blur(6px); text-shadow: 0 1px 2px rgba(0,0,0,.6); }
#wg .wg-turn.on { opacity: 1; transform: translate(-50%, 0); }
#wg .wg-turn .ar { flex: none; display: grid; place-items: center; width: 1.2em; height: 1.2em; color: #FFC93C; }
#wg .wg-turn .ar svg { width: 100%; height: 100%; display: block; }
#wg .wg-turn .tx { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#wg .wg-turn .w { font-weight: 800; }
#wg .wg-turn .d { flex: none; color: #FFC93C; }
#wg .wg-turn .d::before { content: '·'; color: rgba(255,255,255,.55); margin-right: 8px; }
#wg .wg-turn.new .ar { animation: wgTurnNew .6s ease-out; }
@keyframes wgTurnNew { 0% { transform: scale(1.45); } 100% { transform: none; } }
body.wg-paused #wg .wg-turn, body.wg-cine #wg .wg-turn, body.hud-minimized #wg .wg-turn { opacity: 0 !important; }
/* (a narrow computer screen in story mode: the help is in the top-left corner, a row under the cue) */
@media (max-width: 1160px) {
  body.wg-turnon.wg-story:not(.touch-enabled) #wg .wg-help, body.wg-turnon.wg-story:not(.touch-enabled) #wg .wg-offer { top: 72px; }
}
/* ---- on a phone: the head of the column beside the radar (sideways) or under it (upright), the rest a row down ---- */
body.touch-enabled #wg .wg-turn { left: calc(var(--wg-l) + var(--wg-radar) + 16px); right: auto; top: var(--wg-t); transform: translateY(-6px); gap: 7px; padding: 7px 12px 7px 9px; font-size: 18px;
  max-width: calc(100vw - var(--wg-l) - var(--wg-radar) - 16px - var(--wg-r) - var(--wg-toolbar) - 8px); }
body.touch-enabled #wg .wg-turn.on { transform: none; }
body.touch-enabled #wg .wg-turn .d::before { margin-right: 6px; }
body.touch-enabled.wg-calling #wg .wg-turn { max-width: calc(100vw - var(--wg-l) - var(--wg-radar) - 16px - var(--wg-r) - var(--wg-toolbar) - 196px); }
@media (orientation: landscape) {
  body.touch-enabled.wg-turnon #wg .wg-help, body.touch-enabled.wg-turnon #wg .wg-offer, body.touch-enabled.wg-turnon #wg .wg-dm { top: calc(var(--wg-t) + 48px); }
  body.touch-enabled.wg-turnon #wg .wg-offer { max-height: calc(100% - var(--wg-t) - var(--wg-stick) - 24px); }
  body.touch-enabled.wg-story.wg-turnon .wg-track { margin-top: 48px; max-height: calc(100vh - var(--wg-t) - 260px); max-height: calc(100dvh - var(--wg-t) - 260px); }
  body.touch-enabled.wg-turnon:not(.wg-cine) #wg .wg-place { top: calc(var(--wg-t) + 148px); }
  body.touch-enabled.wg-turnon #wg .m2-tail, body.touch-enabled.wg-turnon #wg .m2-target { top: calc(var(--wg-t) + 128px); }
}
@media (orientation: portrait) {
  body.touch-enabled #wg .wg-turn, body.touch-enabled.wg-calling #wg .wg-turn { left: var(--wg-l); top: calc(var(--wg-t) + var(--wg-radar) + 24px); max-width: calc(100vw - var(--wg-l) - var(--wg-r)); font-size: 17px; }
  body.touch-enabled.wg-turnon #wg .wg-help, body.touch-enabled.wg-turnon #wg .wg-offer, body.touch-enabled.wg-turnon #wg .wg-dm,
  body.touch-enabled.wg-turnon.wg-calling #wg .wg-help, body.touch-enabled.wg-turnon.wg-calling #wg .wg-offer, body.touch-enabled.wg-turnon.wg-calling #wg .wg-dm { top: calc(var(--wg-t) + var(--wg-radar) + 72px); }
  body.touch-enabled.wg-turnon #wg .wg-offer { max-height: calc(100% - var(--wg-t) - var(--wg-radar) - 72px - var(--wg-b) - var(--wg-thumbs) - 120px); }
  body.touch-enabled.wg-story.wg-turnon .wg-track { margin-top: 48px; max-height: calc(100dvh - var(--wg-t) - var(--wg-radar) - var(--wg-thumbs) - 198px); }
}
`;

export function createTurns(W, gps) {
  const app = W.app, cm = app.controllerManager, ms = app.mapSystem, body = document.body;
  let el = null, last = 0, on = false, cue = null, html = '', head = '';
  const mount = () => {
    if (el) return el;
    const root = W.ui?.root; if (!root) return null;
    if (!document.getElementById('wg-turn-css')) { const st = document.createElement('style'); st.id = 'wg-turn-css'; st.textContent = CSS; document.head.appendChild(st); }
    el = document.createElement('div'); el.className = 'wg-turn'; el.setAttribute('aria-live', 'polite'); root.appendChild(el);
    return el;
  };
  const hide = () => { cue = null; if (on) { on = false; el?.classList.remove('on'); body.classList.remove('wg-turnon'); } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const T = {
    step(force = false) {
      const t = performance.now(); if (!force && t - last < 200) return; last = t;
      const d = gps.dest, cls = body.classList;
      // (a place to go: his own waypoint, or the objective's, a place that stays put; never a car on the move)
      const place = gps.user || (d && (!d.follow || d.still));
      if (cm.activeMode !== 'car' || !gps.route || !place || W.cutscene || W.paused || ms.isFullMapOpen || cls.contains('wg-cine') || cls.contains('wg-paused') || cls.contains('wg-failing') || cls.contains('hud-minimized')) return hide();
      let c = nextTurn(gps.route, nameAt);
      // (close to it in a straight line with the roads going the long way round, a place off the street like the yard's
      // stash from its gate: not a turn 260 m off, just the place and how far it is; he gets out and walks)
      const tg = gps.user || d, me = cm.getActiveEntity?.()?.position;
      if (c && tg && me && Number.isFinite(tg.x) && Number.isFinite(tg.z)) {
        const sl = Math.hypot(tg.x - me.x, tg.z - me.z);
        let rl = 0; for (let i = 1; i < gps.route.length; i++) rl += Math.hypot(gps.route[i][0] - gps.route[i - 1][0], gps.route[i][1] - gps.route[i - 1][1]);
        if (sl < 160 && rl > sl * 1.8 + 30) c = { kind: 'arrive', dist: sl };
      }
      if (!c || !mount()) return hide();
      cue = c;
      let h, k;
      if (c.kind === 'turn') {
        k = c.dir + '|' + (c.name || '');
        h = `<i class="ar">${ICON[c.dir]}</i><span class="tx"><span class="w">${WORD[c.dir]}</span> on ${esc(c.name || 'the next street')}</span><span class="d">${distText(c.dist)}</span>`;
      } else {
        const name = String((gps.user || d).name || 'Destination').split(' · ')[0];
        k = 'arrive|' + name;
        h = `<i class="ar">${ICON.arrive}</i><span class="tx">${esc(name)}</span><span class="d">${distText(c.dist, true)}</span>`;
      }
      if (h !== html) {
        html = h; el.innerHTML = h;
        // (a new turn: the arrow pops once)
        if (k !== head) { head = k; el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); }
      }
      if (!on) { on = true; el.classList.add('on'); cls.add('wg-turnon'); }
    },
    hide,
    get cue() { return cue; },
    get el() { return el; },
  };
  return T;
}
