// Mog City story runner: the rules of the play steps, as plain functions (no THREE, no page): what the runner
// (runner.js) and the HUD (hud.js) decide each frame, so they can be tested offline (tests/storyrun-rules.test.mjs).
//   money(v)                     '$430,000' (negative '-$5,000')
//   meterText(m, v)              a HUD meter's value: money with commas, and its goal when it has one
//                                ('$430,000 / $1,000,000'), pips, a count ('3 / 5' with a goal)
//   deltaText(m, d)              what a change of it says ('+$85,000', '-$5,000', '+1')
//   createTimers()               the mission's timers, by name: several may run across steps (start / stop by name);
//                                hard ones fail on expiry, soft ones cost (their set) and run on as LATE
//   seen(w, p, o)                a watcher's sight: inside its cone (range, half angle), or very close
//   band(state, d, dt, o)        a car to stay with (convoy): a meter (1 .. 0) that drains outside [near, far] and
//                                refills inside it
//   speedRule(state, v, dt, o)   a passenger's speed rule: seconds over the limit, a warning, and the fail
//   passCard(o)                  the MISSION PASSED card's data: what was gained, the meter's progress, what is next
//   damageOf(o)                  a mission's DAMAGE (0..): what the car took (100 = one car's worth) and 3 a hit on foot
//   medalOf(medals, r)           the medal a pass earns from its time and damage ('gold' | 'silver' | 'bronze' | null)
//   medalRows(medals, r, best)   the MISSION PASSED card's medal: { medal, label, rows, hint }
//   creditsRoll(def, o)          the story's end credits, as sections to roll: the cast, the voices, the world's own
//                                lines, the map's data, the engine and GameMog Community
//   avoids(list, x, z)           a point inside one of the GPS's held-off circles (a roadblock's street)
//   tailStart(o)                 where a tail's followed car starts: ahead of his car, before the first bend (or far: drive there)
//   tailRule(state, o, dt)       a tail each frame: a fair start, then too close / lost clocks and their warnings
export const PI = Math.PI;
export const angWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ------------------------------------------------------------------ meters -- */
const commas = (n) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function money(v, prefix = '$') { return `${v < 0 ? '-' : ''}${prefix}${commas(v)}`; }
export function meterText(m, v) {
  v = Math.round(+v || 0);
  if (m.kind === 'money') return m.goal != null ? `${money(v, m.prefix ?? '$')} / ${money(m.goal, m.prefix ?? '$')}` : money(v, m.prefix ?? '$');
  if (m.kind === 'pips') { const n = m.pips || 5, k = clamp(v, 0, n); return '●'.repeat(k) + '○'.repeat(n - k); }
  return `${m.prefix ?? ''}${v}${m.goal != null ? ` / ${m.goal}` : ''}`;
}
export function deltaText(m, d) {
  d = Math.round(+d || 0);
  if (!d) return '';
  const sign = d > 0 ? '+' : '-';
  return m.kind === 'money' ? `${sign}${m.prefix ?? '$'}${commas(d)}` : `${sign}${Math.abs(d)}`;
}
// how far along to its goal (0..1), or null (no goal)
export const progress = (m, v) => (m.goal ? clamp((+v || 0) / m.goal, 0, 1) : null);

/* ------------------------------------------------------------------ timers -- */
// A timer: { name, left (s), opts: { label, fail: 'hard' | 'soft', why, flag, set }, late, over, fired }. tick(dt)
// returns the timers that ran out this tick (a hard one is gone, a soft one runs on as LATE). shown(): the one the HUD
// shows, the soonest to run out (a late one only when none is still counting down).
export function createTimers() {
  const list = new Map();
  const T = {
    list,
    get running() { return list.size > 0; },
    start(name, secs, opts = {}) { list.set(name, { name, left: secs, opts, late: false, over: 0, fired: false }); },
    stop(name) { if (name == null) list.clear(); else list.delete(name); },
    // seconds onto one (or every) running timer, never onto a late one (a bonus at a stop; a minus tightens it)
    add(name, s) { if (!s) return; for (const t of name == null ? list.values() : [list.get(name)]) if (t && !t.late) t.left = Math.max(0.5, t.left + s); },
    tick(dt) {
      const out = [];
      for (const t of [...list.values()]) {
        if (t.late) { t.over += dt; continue; }
        t.left -= dt;
        if (t.left <= 0 && !t.fired) { t.fired = true; t.left = 0; out.push(t); if (t.opts.fail === 'soft') t.late = true; else list.delete(t.name); }
      }
      return out;
    },
    shown() { let best = null; for (const t of list.values()) { const k = t.late ? 1e9 - t.over : t.left; if (!best || k < best.k) best = { t, k }; } return best ? best.t : null; },
    snapshot() { return [...list.values()].map((t) => ({ ...t })); },
    restore(arr) { list.clear(); for (const t of arr || []) list.set(t.name, { ...t }); },
  };
  return T;
}

/* --------------------------------------------------------------- watchers -- */
// p seen from w: within range and half the cone's angle of where w looks, or within `close` m whichever way (heard)
export function seen(w, p, { range = 15, half = 0.72, close = 3.2 } = {}) {
  const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
  if (d < close) return true;
  if (d > range) return false;
  return Math.abs(angWrap(Math.atan2(dx, dz) - w.yaw)) < half;
}

/* --------------------------------------------------------- a car to stay with -- */
// state: { k (1 calm .. 0 lost), out (s outside the band) }; d: metres to the car; near/far: the band; drain per s
// outside it, refill per s inside it. Returns 'close' | 'far' | 'ok'
export function band(state, d, dt, { near = 6, far = 60, drain = 0.12, refill = 0.08 } = {}) {
  const where = d < near ? 'close' : d > far ? 'far' : 'ok';
  if (where === 'ok') { state.out = 0; state.k = Math.min(1, state.k + refill * dt); }
  else { state.out = (state.out || 0) + dt; state.k = Math.max(0, state.k - drain * dt * (where === 'far' ? clamp(d / far, 1, 2.5) : 1)); }
  return where;
}

/* -------------------------------------------------------- a passenger's rule -- */
// v (m/s); max (m/s); grace (s over it before it counts); state: { over (s), warned }. Returns 'ok' | 'warn' | 'over'
export { MPH } from '../speedo.js';
export function speedRule(state, v, dt, { max = 15, grace = 3 } = {}) {
  if (Math.abs(v) > max) state.over = (state.over || 0) + dt; else state.over = Math.max(0, (state.over || 0) - dt * 0.5);
  if (state.over > grace) return 'over';
  return state.over > 0.25 ? 'warn' : 'ok';
}

/* ----------------------------------------------------------- MISSION PASSED -- */
// o: { title, passLine, meters (the HUD's defs), before, after (meters by id), next ({ title, stakes } | null) }
// -> { title, line, gains: [{ label, text, good }], progress: { label, text, k0, k1 } | null, stands: [[label, text]], next }
// (the story's last card, no next: where every other meter with a goal ended, 'CLUES 10 / 10', as stat rows)
export function passCard({ title = '', passLine = '', meters = [], before = {}, after = {}, next = null } = {}) {
  const gains = [], stands = [];
  let prog = null;
  for (const m of meters) {
    if (m.kind === 'hidden') continue;
    const a = +before[m.id] || 0, b = +after[m.id] || 0, d = b - a;
    if (Math.round(d)) gains.push({ label: String(m.label || m.id).toUpperCase(), text: deltaText(m, d), good: d > 0 });
    if (!prog && m.goal) prog = { label: String(m.label || m.id).toUpperCase(), text: meterText(m, b), k0: progress(m, a), k1: progress(m, b) };
    else if (!next && m.goal) stands.push([String(m.label || m.id).toUpperCase(), meterText(m, b)]);
  }
  return { title, line: passLine || '', gains, progress: prog, stands, next: next ? { title: next.title || '', sub: next.stakes || next.objective || '' } : null };
}

/* ------------------------------------------------------------------ medals -- */
// A mission's medals (the pack's mission.medals): { gold: { secs, damage }, silver: {...}, bronze: {...} }, each tier
// a time to beat (secs, at most) and a damage to stay under (damage, at most; left out: any). Kept local, on this
// device only (index.js save.medals): no server scoring.
export const MEDALS = ['gold', 'silver', 'bronze'];
export const MEDAL_NAME = { gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE' };
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
export const medalRank = (m) => MEDAL_RANK[m] || 0;
// (the damage: the car's knocks as damage.js counts them (taken, the health they cost, 1 = a car's worth, repairs
// never undo it), as a percentage, and 3 a hit he takes on foot)
export function damageOf({ car = 0, hits = 0 } = {}) {
  return Math.max(0, Math.round((+car || 0) * 100 + (+hits || 0) * 3));
}
const tierOk = (t) => t && typeof t === 'object' && Number.isFinite(+t.secs) && +t.secs > 0;
// r: { secs, damage, whole } (whole: played from its start; a checkpoint retry, a Continue or a skip earns none)
export function medalOf(medals, r = {}) {
  if (!medals || typeof medals !== 'object' || !r.whole) return null;
  for (const m of MEDALS) {
    const t = medals[m];
    if (!tierOk(t)) continue;
    if ((+r.secs || 0) <= +t.secs && (t.damage == null || (+r.damage || 0) <= +t.damage)) return m;
  }
  return null;
}
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// The card's medal: { medal, label ('GOLD', or 'NO MEDAL'), rows ([label, text]: DAMAGE), hint (the next tier's
// targets: 'GOLD: under 4:30, damage 10 or less'), best (the best this device has had, when better than this one) }
export function medalRows(medals, r = {}, best = null) {
  if (!medals || typeof medals !== 'object' || !MEDALS.some((m) => tierOk(medals[m]))) return null;
  const medal = medalOf(medals, r);
  const up = MEDALS.filter((m) => tierOk(medals[m]) && medalRank(m) > medalRank(medal)).pop() || null;
  const t = up ? medals[up] : null;
  const hint = !r.whole ? 'Medals: play the mission through from its start'
    : t ? `${MEDAL_NAME[up]}: under ${mmss(t.secs)}${t.damage != null ? `, damage ${Math.round(t.damage)} or less` : ''}` : '';
  return { medal, label: medal ? MEDAL_NAME[medal] : 'NO MEDAL', rows: [['DAMAGE', String(Math.round(+r.damage || 0))]], hint,
    best: best && medalRank(best) > medalRank(medal) ? MEDAL_NAME[best] : null };
}

/* ----------------------------------------------------------------- credits -- */
// The story's end credits (a pack's `credits`: { lines: [its own lines: what it is, what it is made from] }), rolled
// after STORY COMPLETE and the title (index.js, hud.roll). def: the runner pack (its title, its cast: { name: { role,
// voiceOnly } }); o: { map: [{ what, who, licence }] (the engine's own credits for the city: credits.js), place }.
// -> [{ head, lines: [[a, b]] | [text] }], the title first and GameMog Community last
export function creditsRoll(def, { map = [], place = '' } = {}) {
  if (!def || !def.credits || typeof def.credits !== 'object') return [];
  const S = (x, n = 160) => String(x ?? '').slice(0, n);
  const out = [{ head: '', title: S(def.title, 48), lines: def.kicker ? [S(def.kicker, 24)] : [] }];
  // (a role as a credit: a forged sheet's role reads 'keynote stage manager: <the world's title>' and the hero's
  // 'hero: founder-CEO of ..., in his ...': the title and 'hero:' taken off, a long one cut at its first comma)
  const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const roleOf = (r) => {
    let t = String(r || '').trim().replace(/^hero:\s*/i, '');
    if (def.title) t = t.replace(new RegExp(`\\s*:\\s*${esc(def.title)}\\s*$`, 'i'), '');
    if (t.length > 36 && t.indexOf(',') > 0) t = t.slice(0, t.indexOf(','));
    return S(t, 60);
  };
  const cast = Object.entries(def.cast || {}).filter(([, c]) => c && !c.pet).map(([name, c]) => [S(name, 40), roleOf(c.role)]);
  if (cast.length) out.push({ head: 'Starring', lines: cast.slice(0, 24) });
  const own = (Array.isArray(def.credits.lines) ? def.credits.lines : []).filter((l) => typeof l === 'string' && l.trim()).slice(0, 12).map((l) => S(l));
  out.push({ head: 'Voices', lines: ['Every voice synthesised: invented voices, never a recording or an imitation of anyone (Kokoro-82M, Apache 2.0)'] });
  if (own.length) out.push({ head: 'Made with', lines: own });
  // (a pair is [the credited, what for]: the roll sets what for on the left, the credited on the right)
  const ml = (map || []).filter((l) => l && l.who).slice(0, 8).map((l) => [S(`${l.who}${l.licence ? ` · ${l.licence}` : ''}`, 200), S(l.what, 60)]);
  if (ml.length) out.push({ head: place ? `The map: ${S(place, 60)}` : 'The map', lines: ml });
  out.push({ head: 'Played on', lines: ["Mog City's story engine"] });
  out.push({ head: '', lines: ['GameMog Community'], end: true });
  return out;
}

/* -------------------------------------------------------- the GPS held off -- */
export const avoids = (list, x, z) => !!list && list.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);

/* ------------------------------------------------------------- a car to tail -- */
// Where a tail's followed car starts (STEPS.tail): at(s) -> { x, z, h } samples its route by distance, length its
// metres, car where the hero's car is. More than `far` m from the route's first place: { far: true } (he is driven
// there first, no lost clock). Otherwise { s0, sHero }: `ahead` m (the pack's, 20..200; 45 by default) on from where
// he is along the route (or, short of its start, that much less the metres to it), held before its first bend of over
// `bend` (20 degrees) so it starts in view, and at least `min` (15) m on, so it never starts on top of him.
export function tailStart({ at, length, car, ahead = 45, far = 96, bend = 20 * PI / 180, min = 15 }) {
  const p0 = at(0), d0 = Math.hypot(car.x - p0.x, car.z - p0.z);
  if (d0 > far) return { far: true, d0 };
  // (where he is along it: the nearest of its first 150 m)
  let sHero = 0, best = Infinity;
  for (let s = 0; s <= Math.min(length, 150); s += 1) { const q = at(s), dd = Math.hypot(car.x - q.x, car.z - q.z); if (dd < best) { best = dd; sHero = s; } }
  let s0 = sHero > 0 ? sHero + ahead : ahead - d0;
  // (the first bend on from him, against the way it runs 10 m on: its first metres may jog from the place onto its lane)
  const h0 = at(Math.min(length, sHero + 10)).h;
  for (let s = sHero + 12; s < Math.min(length, sHero + ahead + 2); s += 2) if (Math.abs(angWrap(at(s).h - h0)) > bend) { s0 = Math.min(s0, s - 2); break; }
  s0 = clamp(Math.max(s0, sHero + min), 0, Math.max(0, length - 1));
  return { far: false, s0, sHero, d0 };
}
// A tail's rule each frame. state: { t, go, goT, close, far, opened, warnAt } (start it {}); o: { dd (m from him to the
// followed car), held (it is stopped in traffic, v < 3), rolling (he is in a car above 2.5 m/s), ring, lostDist, speed,
// spotTime, lostTime }. A fair start (Mission 2's, m2.js): it idles, and no clock runs, till he is rolling in a car or
// 10 s have passed. Then: too close (inside half the ring, a car's length when it is held up) for spotTime s and it
// has made him; beyond lostDist for lostTime s and he has lost it; a warning before either, every 3.5 s at most.
// Returns { want (m/s for it), verdict: 'wait' | 'ok' | 'spotted' | 'lost', warn: 'close' | 'far' | null }
export function tailRule(state, o, dt) {
  const ring = o.ring || 25, lostDist = o.lostDist || 160, speed = o.speed || 13, spotTime = o.spotTime || 4, lostTime = o.lostTime || 8;
  state.t = (state.t || 0) + dt; state.close ??= 0; state.far ??= 0;
  if (!state.go && (o.rolling || state.t > 10)) { state.go = true; state.goT = state.t; }
  if (!state.go) return { want: 0, verdict: 'wait', warn: null };
  const dd = o.dd, want = dd < ring ? speed * 1.4 : dd > lostDist * 0.6 ? speed * 0.5 : speed;
  // (being close counts once it has pulled away to half the ring, or 6 s after it set off; MM, 5 Nov: Mission 2's van
  // "spotted" a player parked at its mark. Held up in traffic, one car back at a light is not being made, only on its
  // bumper is; owner's PT-8 run, 6 Nov)
  if (dd >= ring * 0.5 || state.t - state.goT > 6) state.opened = true;
  const tooClose = o.held ? dd < 7 : dd < ring * 0.5;
  state.close = tooClose && state.opened ? state.close + dt : Math.max(0, state.close - dt);
  state.far = dd > lostDist ? state.far + dt : 0;
  let warn = null;
  if (state.t - (state.warnAt ?? -1e9) > 3.5 && (state.close > spotTime * 0.4 || state.far > lostTime * 0.35)) { state.warnAt = state.t; warn = state.close > 0 ? 'close' : 'far'; }
  const verdict = state.close > spotTime ? 'spotted' : state.far > lostTime ? 'lost' : 'ok';
  return { want, verdict, warn };
}

// a failed mission's retry: from its last checkpoint (a step marked { checkpoint: true }, or a direct start's step),
// with RESTART from the mission's start beside it; before any checkpoint, RETRY from the start alone (mission/ui.js
// failed). SS-5's one retry replayed about 5 minutes (the call, the drive, the roadblock, the search, the call) to get
// back to its chase: the RC playtest, P3
export function retryChoices(cp) {
  const at = !!(cp && cp.i > 0);
  return at ? { retryLabel: 'Retry: from the checkpoint', restart: true, restartLabel: 'Restart: from the start' } : { retryLabel: 'Retry: from the start', restart: false };
}

// a chase to a place (pursuit goal 'reach') that starts with his car standing: how its crew sets out. Every car
// behind him (along the way there, else the way he faces), BEHIND_START.min m back or more, on the road and out of
// view first, and none ahead of him on his road; a calm of BEHIND_START.calm s (none rams him, none nearer than the
// pursuit's CALM gap unless he is going) so he gets the car rolling. TP-6's chase began with the car standing on the
// rose garden's lawn and the town's opening put one 30-60 m off and the others on his road ahead, coming at him: they
// wedged him in on both sides and he was caught in 14 s (the final replay, 20 Nov). A chase to lose, or one started
// at speed, keeps the town's own opening (BT-3's and SS-5's tuning). Returns the pursuit start()'s extra options, or null
export const BEHIND_START = { min: 80, calm: 5, standing: 4, near: [40, 120] };
// (a story's own pressure: the step's `behind` m (BEHIND_START.near, clamped) for the first car instead of min. Jensen
// Heist's TP-6 chase at heat 2 kept its crew 100 m+ back the whole way, the polish playtest, 21 Nov)
export const behindMin = (d) => (Number.isFinite(+d?.behind) && d.behind != null ? Math.max(BEHIND_START.near[0], Math.min(BEHIND_START.near[1], +d.behind)) : BEHIND_START.min);
// (the traffic held off the way there as a standing chase starts (runner.js STEPS.pursuit): base m of it, 25 s, for
// every chase to a place; open m for up to secs s for one with the behind opening)
export const CLEAR_WAY = { base: 180, open: 650, secs: 60 };
export function chaseOpening(d, o = {}) {
  if (!d || d.goal !== 'reach' || !d.to) return null;
  if (!(Math.abs(o.speed || 0) < BEHIND_START.standing)) return null;
  const h = Number.isFinite(o.routeH) ? o.routeH : Number.isFinite(o.carH) ? o.carH : null;
  return { ahead: false, calm: BEHIND_START.calm, behind: { min: behindMin(d), ...(h != null ? { h } : {}) } };
}
// (the way there as it leaves the car: from the car to the route's first point `ahead` m or more off; null on none)
export function routeHeading(route, from, ahead = 30) {
  if (!Array.isArray(route) || !from) return null;
  for (const q of route) { const dx = q[0] - from.x, dz = q[1] - from.z; if (Math.hypot(dx, dz) >= ahead) return Math.atan2(dx, dz); }
  return null;
}
// (the way there as he will drive it, for a standing start's crew: of the routes planned from the car (runner.js: with
// the car's heading, against it and with none), the shortest, and the way from the car to its point `at` m along; no
// route, the bearing to the place. TP-6's Tensore stood on the rose garden's lawn facing away from the market: the plan
// with its heading set off forward and U-turned, so 'behind along it' put the crew on his real way, ahead of him, and
// they met him head-on 4-5 s in (the RC review, 20 Nov))
const pathLen = (r) => { let L = 0; for (let k = 1; k < r.length; k++) L += Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]); return L; };
export const shortestRoute = (routes) => (Array.isArray(routes) ? routes : []).filter((r) => Array.isArray(r) && r.length > 1).reduce((a, b) => (!a || pathLen(b) < pathLen(a) ? b : a), null);
export function wayThere(routes, from, to, at = 80) {
  if (!from) return null;
  const bearing = to && Math.hypot(to.x - from.x, to.z - from.z) > 1 ? Math.atan2(to.x - from.x, to.z - from.z) : null;
  const best = shortestRoute(routes);
  if (!best) return bearing;
  let L = 0, q = best[best.length - 1];
  for (let k = 1; k < best.length; k++) {
    const [ax, az] = best[k - 1], [bx, bz] = best[k], seg = Math.hypot(bx - ax, bz - az);
    if (L + seg >= at) { const u = (at - L) / (seg || 1); q = [ax + (bx - ax) * u, az + (bz - az) * u]; break; }
    L += seg;
  }
  const dx = q[0] - from.x, dz = q[1] - from.z;
  return Math.hypot(dx, dz) > 5 ? Math.atan2(dx, dz) : bearing;
}
