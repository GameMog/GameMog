// Mog City: play() and loop() over the mixer. A sound with a world position is placed against the camera (and kept
// placed while it lasts: loops are re-placed every frame); one without plays straight into its bus. Each name has a
// voice limit (the oldest of it gives way). Unknown names stay silent.
import { SOUNDS, META } from './sounds.js';
import { LOOPS } from './loops.js';

export function createEngine(M) {
  const live = new Map();   // name -> [{ end, v, spot }]
  const loops = new Set();  // placed loops, re-placed each frame
  const busOf = (o, def) => M.bus[o.bus] || M.bus[def] || M.bus.sfx;

  const count = {};          // (how many of each have played, for tests)
  function play(name, o = {}) {
    const fn = SOUNDS[name]; if (!fn) return null;
    count[name] = (count[name] || 0) + 1;
    const meta = META[name] || {}, t = M.now() + 0.004 + (o.delay || 0);
    // (a far sound is not worth making)
    let spot = null;
    const dest = busOf(o, meta.bus);
    if (o.pos) {
      spot = M.spot(dest, o.pos, { ref: o.ref ?? meta.ref ?? 6, verb: o.verb ?? 0.35 });
      if (spot.d > (meta.far ?? 250)) { spot.off(); return null; }
    } else if (o.pan != null || o.d != null) {
      spot = M.spot(dest, null, { ref: o.ref ?? meta.ref ?? 6, verb: o.verb ?? 0.35 }).fixed(o.pan ?? 0, o.d ?? 0);
    }
    const v = M.gain(o.vol ?? 1, spot ? spot.in : dest);
    // its voice limit: the oldest one still sounding is cut
    const list = live.get(name) || []; live.set(name, list.filter((x) => x.end > t));
    const cur = live.get(name);
    if (cur.length >= (meta.max ?? 6)) { const old = cur.shift(); old.v.gain.setTargetAtTime(0, t, 0.02); }
    let dur = 0.5;
    try { dur = fn(M, v, o, t) || 0.5; } catch (e) { console.warn('[audio]', name, e); }
    const rec = { end: t + dur, v, spot };
    cur.push(rec);
    if (M.live) setTimeout(() => { try { v.disconnect(); } catch {} spot?.off(); }, (dur + 0.6) * 1000);
    return { stop(secs = 0.05) { v.gain.setTargetAtTime(0, M.now(), secs / 3); }, get spot() { return spot; } };
  }

  function loop(name, o = {}) {
    const fn = LOOPS[name];
    if (!fn) return { set() {}, stop() {} };
    const meta = META[name] || {};
    const dest = busOf(o, meta.bus || 'amb');
    // (placed in the world by pos, or at a fixed pan and distance)
    const spot = o.pos ? M.spot(dest, o.pos, { ref: o.ref ?? 8, verb: o.verb ?? 0.3 }) : o.pan != null || o.d != null ? M.spot(dest, null, { ref: o.ref ?? 8, verb: o.verb ?? 0.3 }).fixed(o.pan ?? 0, o.d ?? 0) : null;
    const v = M.gain(1, spot ? spot.in : dest);
    const L = fn(M, v);
    let rate = 1, was = null;
    const h = {
      set(p = {}) {
        if (p.pos && spot) {
          spot.set(p.pos);
          // (a loop that wants it, an engine: its doppler, from how fast its place moves)
          if (L.wantsDop && p.dop == null) {
            const now = M.now(), [x, y, z] = p.pos;
            if (was && now - was.t > 0.004) { const dt = now - was.t, k = Math.min(1, dt * 8); was.vx += ((x - was.x) / dt - was.vx) * k; was.vz += ((z - was.z) / dt - was.vz) * k; }
            if (!was || Math.hypot(x - was.x, z - was.z) > 15) was = { vx: 0, vz: 0 };
            Object.assign(was, { x, z, t: now });
            p = { ...p, dop: M.doppler(x, y ?? 1, z, was.vx, was.vz) };
          }
        }
        else if ((p.pan != null || p.d != null) && spot && !spot.pos) spot.fixed(p.pan ?? 0, p.d ?? 0, 0.05);
        if (p.rate) rate = p.rate;
        L.set({ ...p, vol: p.vol ?? undefined, rate: p.rate ?? rate });
        return h;
      },
      stop(secs = 0.3) { L.stop(secs); loops.delete(h); if (M.live) setTimeout(() => { try { v.disconnect(); } catch {} spot?.off(); }, (secs + 0.3) * 1000); },
      spot,
      get mode() { return L.mode; },
      get engine() { return L.engine ?? null; },
    };
    L.set({ vol: o.vol ?? 1, ...o });
    if (spot && spot.pos) loops.add(h);
    return h;
  }

  // per frame: placed loops follow the listener
  function update() { for (const h of loops) h.spot.set(null); }
  return { play, loop, update, live, loops, count };
}
