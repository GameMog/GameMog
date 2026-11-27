// Mog City (jh-tune2, the owner 20 Nov: "a big front crash should give a brief camera look at the damage"): the chase
// camera sits behind the car, so a crumpled nose only shows if the player swings the camera round. After a BIG front hit
// (its dent speed at least DENT.BIG, damage-cost.js: the 15 m/s blow that leaves the 20 cm crumple) the camera swings
// round beside the nose and over it (on the side the blow landed), aimed at it, holds a beat and comes back behind:
// about 1.4 s, eased out and back. No three.js here (tests/damage-look.test.mjs reads it in node); damage.js offers it each hit and
// steps it each frame, js/cameras.js reads the offset it leaves on the camera (cameraSystem.damageLook).
// The rules:
//   - only the front, only at LOOK.MIN m/s of dent speed and over; the car slowed to LOOK.SLOW m/s or under within
//     LOOK.WINDOW s of the blow (a hit it drives on through, still fast, is never looked at: the road ahead matters more)
//   - never while blocked (blockedBy: a cutscene, a directed shot, a call ringing or talking, a video call, the pause
//     menu, a chase on, a timed or chase step of a mission, another camera than the chase one, on foot or on a horse)
//   - the player's input ends it at once: any control newly pressed since it began (letting go does not count) (by over LOOK.INPUT), the camera
//     dragged or looked round, the car back over LOOK.ABORT m/s; and anything that blocks it ends it too
//   - at most one every LOOK.COOL s (from when one began, ended early or not), so a run of hits never spams it
// (YAW rad round the car: 132 degrees, beside the nose and over it, as a nose against a wall leaves no room in front of
// it; PITCH up, over a low wall onto the bonnet; AIM: how far the lens's aim moves off the road ahead onto the nose,
// js/cameras.js)
export const LOOK = Object.freeze({ MIN: 15, SLOW: 7, ABORT: 9, WINDOW: 0.35, OUT: 0.42, HOLD: 0.5, BACK: 0.48, COOL: 8, YAW: 2.3, PITCH: 0.3, PULL: 0.12, AIM: 0.85, INPUT: 0.15 });

// the steps of a mission where looking away from the road could cost the player: a chase, a tail, a convoy, getting
// away, a roadblock, a timer, a tow
export const CRITICAL_STEPS = new Set(['pursuit', 'tail', 'convoy', 'flee', 'roadblock', 'timer', 'tow', 'ambush', 'track', 'sneak', 'stealth', 'cutscene', 'scene', 'vcall', 'call']);

// (jh-polish A6, the owner's RC: a head-on wall hit swung the lens to a side where the crumpled nose was in the wall)
// The ways the look may go, best first: the side the blow landed, then the other, each at the full swing and then a
// narrower one; last, behind and high over the roof, looking down onto the bonnet (the nose always shows from there).
// pickView tries them with probe(yaw, pitch) -> { clear 0..1 (how much of the boom out to that lens is free of the
// buildings), sees (the nose in sight from that lens) } (js/cameras.js probeLook) and takes the first that is clear and
// sees the nose (the high one only needs to be clear: from over the roof the bonnet always shows); with none, the one
// that sees and is clearest; with no probe at all, the side the blow landed on.
export const VIEWS = Object.freeze([{ k: 1, pitch: 1 }, { k: 0.78, pitch: 1 }, { k: 0.55, pitch: 1.6 }]);
export const HIGH = Object.freeze({ yaw: 0.35, pitch: 0.75 }); // (rad: just off straight behind, well up)
export const CLEAR_OK = 0.9;
export function pickView(side, probe, L = LOOK) {
  const tries = [];
  for (const v of VIEWS) for (const s of [side, -side]) tries.push({ side: s, yaw: v.k * L.YAW, pitch: v.pitch * L.PITCH });
  tries.push({ side, yaw: HIGH.yaw, pitch: HIGH.pitch, high: true });
  if (typeof probe !== 'function') return { ...tries[0], why: 'no-probe' };
  let best = null, bs = -Infinity;
  for (const t of tries) {
    let r = null;
    try { r = probe(t.side * t.yaw, t.pitch); } catch { r = null; }
    if (!r) continue;
    const clear = Math.max(0, Math.min(1, +r.clear || 0));
    if (clear >= CLEAR_OK && (r.sees || t.high)) return { ...t, clear, why: t.high ? 'high' : 'clear' };
    const score = clear + (r.sees ? 1 : 0);
    if (score > bs + 1e-6) { bs = score; best = { ...t, clear, why: 'best' }; }
  }
  return best || { ...tries[0], why: 'no-probe' };
}

const smooth = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

// what keeps the look off (a string, the first reason), else null. f: { mode, horse, preset, cutscene, directed, cine,
// paused, callLive, callTalking, pursuit, step, timer }
export function blockedBy(f = {}) {
  if (f.mode !== 'car') return 'not-driving';
  if (f.horse) return 'horse';
  if (f.preset && f.preset !== 'chase') return 'camera';
  if (f.cutscene || f.directed || f.cine) return 'cutscene';
  if (f.paused) return 'paused';
  if (f.callLive || f.callTalking) return 'call';
  if (f.pursuit) return 'pursuit';
  if (f.step && CRITICAL_STEPS.has(f.step)) return 'mission';
  if (f.timer) return 'mission';
  return null;
}

// the look's weight 0..1 at t s into it: eased out over OUT, held over HOLD, eased back over BACK
export function envelope(t, L = LOOK) {
  if (!(t > 0)) return 0;
  if (t < L.OUT) return smooth(t / L.OUT);
  if (t < L.OUT + L.HOLD) return 1;
  return 1 - smooth((t - L.OUT - L.HOLD) / L.BACK);
}
export const lookLength = (L = LOOK) => L.OUT + L.HOLD + L.BACK;

// ctx each call: { speed m/s, keys (the controls: action -> 0..1 or a boolean), orbit (the player moved the camera this
// frame), blocked (blockedBy's reason or null), probe (optional: see pickView) }
export function createDamageLook(L = LOOK) {
  const S = { phase: 'idle', t: 0, cool: 0, side: 1, yaw: L.YAW, pitch: L.PITCH, view: null, snap: null, pending: null, last: null, n: 0 };
  const out = { yaw: 0, pitch: 0, pull: 0, aim: 0, w: 0, active: false };
  const val = (v) => (v === true ? 1 : +v || 0);
  const snapKeys = (keys) => Object.fromEntries(Object.entries(keys || {}).map(([k, v]) => [k, val(v)]));
  const changed = (keys) => {
    if (!S.snap) return false;
    const all = new Set([...Object.keys(S.snap), ...Object.keys(keys || {})]);
    // Only a NEW press cancels the look. Letting go of a key (lifting off the
    // throttle after the hit is the normal reflex) lowers the baseline instead,
    // so pressing that key again later still cancels.
    for (const k of all) {
      const v = val(keys && keys[k]), s = S.snap[k] || 0;
      if (v - s > L.INPUT) return true;
      if (v < s) S.snap[k] = v;
    }
    return false;
  };
  const end = (why) => { S.phase = 'idle'; S.t = 0; S.snap = null; S.last = why; Object.assign(out, { yaw: 0, pitch: 0, pull: 0, aim: 0, w: 0, active: false }); };
  const api = {
    S, out,
    // a hit: { zone, dsp (its dent speed), lx (where on the nose: + its left) }; true when it will be looked at
    offer(hit, ctx = {}) {
      if (!hit || hit.zone !== 'front' || !(hit.dsp >= L.MIN)) return false;
      if (ctx.blocked) { S.last = 'blocked:' + ctx.blocked; return false; }
      if (S.phase !== 'idle' || S.cool > 0 || S.pending) { S.last = 'cool'; return false; }
      // (a positive yaw swings the lens round to the car's right: so to the side the blow landed on)
      S.pending = { t: 0, side: hit.lx > 0 ? -1 : 1 };
      return true;
    },
    // one frame: the camera's offset (out: yaw rad round the car, pitch rad up, pull: the boom shorter by this share)
    update(dt, ctx = {}) {
      if (!(dt > 0)) return out;
      S.cool = Math.max(0, S.cool - dt);
      const sp = Math.abs(+ctx.speed || 0);
      if (S.pending) {
        S.pending.t += dt;
        if (ctx.blocked) { S.pending = null; S.last = 'blocked:' + ctx.blocked; }
        else if (sp <= L.SLOW) {
          // (the way round with the nose in sight: ctx.probe, js/cameras.js probeLook; see pickView)
          const v = pickView(S.pending.side, ctx.probe, L);
          S.phase = 'look'; S.t = 0; S.side = v.side; S.yaw = v.yaw; S.pitch = v.pitch; S.view = v; S.snap = snapKeys(ctx.keys); S.cool = L.COOL; S.pending = null; S.n++; S.last = 'start';
        } else if (S.pending.t > L.WINDOW) { S.pending = null; S.last = 'fast'; }
      }
      if (S.phase !== 'look') return out;
      // (the player's say ends it at once)
      if (ctx.blocked) { end('blocked:' + ctx.blocked); return out; }
      if (ctx.orbit) { end('orbit'); return out; }
      if (changed(ctx.keys)) { end('input'); return out; }
      if (sp > L.ABORT) { end('speed'); return out; }
      S.t += dt;
      if (S.t >= lookLength(L)) { end('done'); return out; }
      const w = envelope(S.t, L);
      Object.assign(out, { yaw: S.side * S.yaw * w, pitch: S.pitch * w, pull: L.PULL * w, aim: L.AIM * w, w, active: true });
      return out;
    },
    cancel(why = 'cancel') { S.pending = null; if (S.phase === 'look') end(why); },
    reset() { S.pending = null; S.cool = 0; end('reset'); },
  };
  return api;
}
