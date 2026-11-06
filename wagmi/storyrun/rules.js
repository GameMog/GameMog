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
//   avoids(list, x, z)           a point inside one of the GPS's held-off circles (a roadblock's street)
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
export const MPH = 2.23694;
export function speedRule(state, v, dt, { max = 15, grace = 3 } = {}) {
  if (Math.abs(v) > max) state.over = (state.over || 0) + dt; else state.over = Math.max(0, (state.over || 0) - dt * 0.5);
  if (state.over > grace) return 'over';
  return state.over > 0.25 ? 'warn' : 'ok';
}

/* ----------------------------------------------------------- MISSION PASSED -- */
// o: { title, passLine, meters (the HUD's defs), before, after (meters by id), next ({ title, stakes } | null) }
// -> { title, line, gains: [{ label, text, good }], progress: { label, text, k0, k1 } | null, next }
export function passCard({ title = '', passLine = '', meters = [], before = {}, after = {}, next = null } = {}) {
  const gains = [];
  let prog = null;
  for (const m of meters) {
    if (m.kind === 'hidden') continue;
    const a = +before[m.id] || 0, b = +after[m.id] || 0, d = b - a;
    if (Math.round(d)) gains.push({ label: String(m.label || m.id).toUpperCase(), text: deltaText(m, d), good: d > 0 });
    if (!prog && m.goal) prog = { label: String(m.label || m.id).toUpperCase(), text: meterText(m, b), k0: progress(m, a), k1: progress(m, b) };
  }
  return { title, line: passLine || '', gains, progress: prog, next: next ? { title: next.title || '', sub: next.stakes || next.objective || '' } : null };
}

/* -------------------------------------------------------- the GPS held off -- */
export const avoids = (list, x, z) => !!list && list.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
