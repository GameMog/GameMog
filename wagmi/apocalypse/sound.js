// SF 2040: how the city sounds after Erebus. No music (the owner's rule). The living city's bed (wagmi/audio/city.js:
// the traffic's roar, horns, the crowd's walla, pigeons) is turned right down on its bus; in its place, made here on
// the game's own mixer (W.audio):
//   a bed     wind through the empty streets in slow gusts, a high thin whistle in it now and then; a low rumble felt
//             more than heard; the fires' crackle, louder the nearer the camera is to one (fx.js's fires)
//   events    a siren wailing a long way off, a car alarm somewhere, far booms (the library's sci-fi low explosions,
//             slowed), something collapsing, glass breaking, metal falling, a creak; and now and then, from far across
//             the city, a roar (the T-rex's own layered cue, wagmi/creatures/profiles.js, slowed and quieter)
// Nothing plays before the player's first key or click (the browser's rule): it waits for the mixer to be running.
import { preload } from '../library/sounds.js';
import { PROFILES } from '../creatures/profiles.js';

const PACKS = ['sounds-scifi', 'sounds-impact', 'sounds-rpg'];

export function createSound(W, fx) {
  const A = W.audio;
  if (!A || !A.loop) return null;
  let built = null, t = 0;
  const timers = { boom: 8, siren: 6, alarm: 30, glass: 14, metal: 20, roar: 25, creak: 18, collapse: 45 };
  const R = Math.random;

  function noise(ctx, secs, kind) {
    const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let l = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; }
      else if (kind === 'pink') { b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w; d[i] = (b0 + b1 + b2 + w * 0.1) * 0.6; }
      else if (kind === 'crackle') {
        // (a wood fire's pops: each a few ms of soft noise dying away, never a bare one-sample click, which reads as
        // digital static, owner 12 Nov; the odd bigger snap)
        if (Math.random() < 0.00045) { const big = Math.random() < 0.12, len = Math.floor(ctx.sampleRate * (big ? 0.012 : 0.004 + Math.random() * 0.004)), amp = (big ? 0.5 : 0.12 + Math.random() * 0.18);
          let s1 = 0; for (let k = 0; k < len && i + k < n; k++) { s1 = 0.55 * s1 + 0.45 * (Math.random() * 2 - 1); d[i + k] += s1 * amp * Math.exp(-5 * k / len) * Math.min(1, k / 12); } }
      }
      else d[i] = w;
    }
    // (the loop's ends meet)
    const f = Math.min(2000, n >> 4); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    return b;
  }
  function build() {
    const ctx = A.ctx, bus = A.bus; if (!ctx || !bus) return null;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(bus.master);
    out.gain.setTargetAtTime(0.9, ctx.currentTime, 2.5);
    // the living city's bed down
    try { bus.amb.gain.setTargetAtTime(0.0, ctx.currentTime, 0.8); } catch (e) { /* (no amb bus) */ }
    const src = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; };
    const lfo = (hz, depth, target) => { const o = ctx.createOscillator(); o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); return o; };
    // wind: pink noise through a band that wanders, its level in slow gusts
    const pink = noise(ctx, 6, 'pink'), brown = noise(ctx, 6, 'brown');
    const wind = src(pink), wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0.32; wind.connect(wf); wf.connect(wg); wg.connect(out);
    lfo(0.05, 180, wf.frequency); lfo(0.083, 0.16, wg.gain);
    const whistle = src(pink), hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1700; hf.Q.value = 9;
    const hg = ctx.createGain(); hg.gain.value = 0.05; whistle.connect(hf); hf.connect(hg); hg.connect(out);
    lfo(0.031, 420, hf.frequency); lfo(0.047, 0.05, hg.gain);
    // the rumble
    const rum = src(brown), rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 75;
    const rg = ctx.createGain(); rg.gain.value = 0.55; rum.connect(rf); rf.connect(rg); rg.connect(out); lfo(0.02, 0.2, rg.gain);
    // the fires' crackle (its level from the nearest fire)
    const cr = src(noise(ctx, 5, 'crackle')), cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1800; cf.Q.value = 0.6;
    const cl = ctx.createBiquadFilter(); cl.type = 'lowpass'; cl.frequency.value = 5000;
    const cg = ctx.createGain(); cg.gain.value = 0; cr.connect(cf); cf.connect(cl); cl.connect(cg); cg.connect(out);
    const roast = src(brown), rof = ctx.createBiquadFilter(); rof.type = 'bandpass'; rof.frequency.value = 260; rof.Q.value = 0.8;
    const rog = ctx.createGain(); rog.gain.value = 0; roast.connect(rof); rof.connect(rog); rog.connect(out);
    preload({ ctx }, PACKS);
    return { ctx, out, cg, rog };
  }
  // a siren wailing far off: a wail up and down, muffled by distance, panned, fading in and out
  function siren(B, alarm = false) {
    const { ctx, out } = B, t0 = ctx.currentTime, dur = alarm ? 6 + R() * 6 : 10 + R() * 10;
    const o = ctx.createOscillator(); o.type = alarm ? 'square' : 'sawtooth';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = alarm ? 1300 : 1100;
    const g = ctx.createGain(), pan = ctx.createStereoPanner(); pan.pan.value = R() * 1.6 - 0.8;
    o.connect(lp); lp.connect(g); g.connect(pan); pan.connect(out);
    if (alarm) {
      // a car alarm: two tones chirping
      for (let k = 0, at = t0; at < t0 + dur; k++, at += 0.18) o.frequency.setValueAtTime(k % 2 ? 1180 : 820, at);
    } else {
      o.frequency.value = 700;
      const l = ctx.createOscillator(); l.frequency.value = 0.18 + R() * 0.1; const lg = ctx.createGain(); lg.gain.value = 260; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur);
    }
    const peak = alarm ? 0.012 : 0.022;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.3); g.gain.linearRampToValueAtTime(peak * 0.8, t0 + dur * 0.7); g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }
  const play = (s, o) => { try { return A.play(s, { bus: 'sfx', ...o }); } catch (e) { return null; } };
  // (a far place to put a sound: away from the listener, so it is panned and quiet)
  const far = (c, d) => { const a = R() * Math.PI * 2; return [c.position.x + Math.sin(a) * d, c.position.y + 10, c.position.z + Math.cos(a) * d]; };
  const ROAR = PROFILES['creature-trex']?.voice?.roar || [];
  function update(dt, c) {
    if (!A.ready) return;
    if (!built) { built = build(); if (!built) return; }
    t += dt;
    // the crackle from the nearest fire (fx.js's chosen ones, nearest first)
    let dn = 1e9; for (const f of fx.sources.get('debris') || []) dn = Math.min(dn, Math.hypot(f.x - c.position.x, f.z - c.position.z));
    for (const f of fx.sources.get('camps') || []) dn = Math.min(dn, Math.hypot(f.x - c.position.x, f.z - c.position.z));
    const near = Math.max(0, 1 - dn / 45);
    built.cg.gain.setTargetAtTime(near * near * 0.35, built.ctx.currentTime, 0.3);
    built.rog.gain.setTargetAtTime(near * near * 0.25, built.ctx.currentTime, 0.3);
    for (const k of Object.keys(timers)) timers[k] -= dt;
    if (timers.siren <= 0) { timers.siren = 25 + R() * 40; siren(built); }
    if (timers.alarm <= 0) { timers.alarm = 40 + R() * 60; siren(built, true); }
    if (timers.boom <= 0) { timers.boom = 14 + R() * 26; play('pack:sounds-scifi/lowFrequency_explosion', { vol: 0.35 + R() * 0.3, rate: 0.45 + R() * 0.25 }); }
    if (timers.collapse <= 0) { timers.collapse = 50 + R() * 60; play('pack:sounds-scifi/explosionCrunch', { vol: 0.25, rate: 0.35 + R() * 0.15 }); play('pack:sounds-impact/impactMetal_heavy', { vol: 0.2, rate: 0.5, delay: 0.4 }); }
    if (timers.glass <= 0) { timers.glass = 18 + R() * 30; play(R() < 0.5 ? 'pack:sounds-impact/impactGlass_light' : 'pack:sounds-impact/impactGlass_medium', { pos: far(c, 25 + R() * 30), vol: 0.5, rate: 0.85 + R() * 0.2 }); }
    if (timers.metal <= 0) { timers.metal = 22 + R() * 35; play(R() < 0.5 ? 'pack:sounds-impact/impactMetal_heavy' : 'pack:sounds-impact/impactMetal_medium', { pos: far(c, 30 + R() * 30), vol: 0.45, rate: 0.6 + R() * 0.3 }); }
    if (timers.creak <= 0) { timers.creak = 25 + R() * 35; play('pack:sounds-rpg/creak', { pos: far(c, 15 + R() * 15), vol: 0.35, rate: 0.6 + R() * 0.2 }); }
    if (timers.roar <= 0 && ROAR.length) {
      timers.roar = 55 + R() * 70;
      for (const q of ROAR) play(q.s, { vol: (q.vol ?? 1) * 0.32, rate: (q.rate ?? 1) * 0.78, delay: q.at || 0 });
    }
  }
  return { update, get built() { return !!built; } };
}
