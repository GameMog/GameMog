// Mog City: the game's one-shot sounds, every one made on the spot from noise, oscillators, filters and envelopes.
// Each is fn(M, out, o, t) -> its length in seconds: it plays into `out` (already placed and set to o.vol), starting at
// t; o.rate pitches it (and speeds it) where that makes sense. Names the whole team calls:
//   pedHit       a body hitting a car: a deep thump through the bonnet's metal knock, cloth and a slap (o.speed m/s)
//   scream       a passer-by screaming (o.voice 'f' | 'm', o.kind 'aah' | 'whoa' | 'hey')
//   carHit       a crash: the body's thump, the sheet metal buckling, bits flying off (crunch.js, after Slop New York),
//                glass if hard (vol = how hard: the impact speed / 16)
//   horn         a car horn (o.kind 'taxi' | 'sedan' | 'suv' | 'bus', o.len 'tap' | 'beep' | 'double' | 'long' | 'lean')
//   doorOpen / doorClose / doorThunk   Dan's car's door: latch, seal and servo; a slam; a heavy closing thunk
//   engineStart  the car waking: a power-up swell under a two-note chime
//   footstep     a step (o.surface 'hard' | 'grass', o.run 0..1)       land: a jump landing
//   whoosh, splash, glass, phoneBuzz, blip, missionStart, missionPassed
// and the city's own: airBrake, kerb, boostIgnite, coo, chirps, flutter, clang, jackhammer, beeper, whistle, call, bodyFall
import { crunch } from './crunch.js';
// (the crunch's level under the volume asked for: as loud as the old boom-and-crunch at the same volume)
const CRUNCH = 1.75;

const VOWEL = { a: [850, 1350, 2800, 3600], o: [520, 900, 2500, 3400], e: [520, 1850, 2600, 3500], u: [360, 800, 2400, 3300], i: [320, 2300, 3000, 3700] };

// a voice: a glottal buzz (two saws a hair apart, a little shaken), through four formant bands moving between vowels
function voice(M, out, t, { f0, dur, vowels = ['a'], peak = 0.4, rough = 0.06, breath = 0.12, rise = 1.12, fall = 0.75, vib = 6.5 }) {
  const { ctx } = M, end = t + dur;
  const s1 = M.osc('sawtooth', f0), s2 = M.osc('sawtooth', f0 * 1.007), mix = M.gain(0.5);
  s1.connect(mix); s2.connect(mix);
  // pitch: up into it, a vibrato and a shake, falling away at the end
  for (const p of [s1.frequency, s2.frequency]) {
    p.setValueAtTime(f0 * 0.82, t); p.exponentialRampToValueAtTime(f0 * rise, t + Math.min(0.12, dur * 0.25));
    p.setValueAtTime(f0 * rise, t + dur * 0.6); p.exponentialRampToValueAtTime(f0 * fall, end);
  }
  const lfo = M.osc('sine', vib), lg = M.gain(f0 * 0.025); lfo.connect(lg); lg.connect(s1.frequency); lg.connect(s2.frequency);
  const jit = M.src(M.white, { rate: 0.02 }), jl = M.filt('lowpass', 25), jg = M.gain(f0 * rough * 8); jit.connect(jl); jl.connect(jg); jg.connect(s1.frequency); jg.connect(s2.frequency);
  const sh = M.shaper(2.5); mix.connect(sh);
  const v = M.gain(0); v.connect(out);
  const F = vowels.map((k) => VOWEL[k] || VOWEL.a);
  F[0].forEach((f, i) => {
    const b = M.filt('bandpass', f, [5, 7, 9, 10][i]), bg = M.gain([0.75, 1, 0.75, 0.4][i]);
    F.forEach((V, j) => { const at = t + (dur * j) / Math.max(1, F.length - 1) * 0.7; b.frequency.setTargetAtTime(V[i], at, 0.05); });
    sh.connect(b); b.connect(bg); bg.connect(v);
  });
  const n = M.src(M.white), nb = M.filt('bandpass', 2600, 0.9), ng = M.gain(breath); n.connect(nb); nb.connect(ng); ng.connect(v);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(peak, t + 0.045); v.gain.setValueAtTime(peak, t + dur * 0.62); v.gain.exponentialRampToValueAtTime(0.0001, end);
  for (const s of [s1, s2, lfo, jit, n]) { s.start(t); s.stop(end + 0.05); }
  return dur;
}

// a horn's voice: two reeds a third or so apart, buzzing through the horn's bell
const HORNS = { taxi: [466, 587], sedan: [415, 523], suv: [370, 466], bus: [220, 277], police: [330, 392] };
function horn(M, out, t, kind, segs) {
  const [fa, fb] = HORNS[kind] || HORNS.sedan, j = 1 + (M.R() - 0.5) * 0.06;
  const pre = M.gain(0.5), sh = M.shaper(kind === 'bus' ? 3.5 : 2.6), bell = M.filt('peaking', kind === 'bus' ? 900 : 2100, 1.4), hp = M.filt('highpass', kind === 'bus' ? 140 : 260, 0.7), lp = M.filt('lowpass', kind === 'bus' ? 3200 : 5200, 0.7);
  bell.gain.value = 9;
  pre.connect(sh); sh.connect(bell); bell.connect(hp); hp.connect(lp);
  const g = M.gain(0); lp.connect(g); g.connect(out);
  const oscs = [];
  for (const f of [fa * j, fb * j]) for (const [type, k] of [['sawtooth', 0.6], ['square', 0.35]]) { const o = M.osc(type, f), og = M.gain(k); o.connect(og); og.connect(pre); oscs.push(o); }
  let end = t;
  for (const [at, len] of segs) {
    const a = t + at;
    g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime(0.5, a + 0.012); g.gain.setValueAtTime(0.5, a + len); g.gain.exponentialRampToValueAtTime(0.0001, a + len + 0.05);
    // (the reed catching: a hair flat for its first instant)
    for (const o of oscs) { o.detune.setValueAtTime(-40, a); o.detune.linearRampToValueAtTime(0, a + 0.04); }
    end = a + len + 0.06;
  }
  for (const o of oscs) { o.start(t); o.stop(end + 0.05); }
  return end - t;
}
const HORN_LEN = {
  tap: () => [[0, 0.09]], beep: () => [[0, 0.28]], double: () => [[0, 0.13], [0.21, 0.32]],
  triple: () => [[0, 0.1], [0.17, 0.1], [0.34, 0.4]], long: () => [[0, 0.9 + Math.random() * 0.6]], lean: () => [[0, 1.8 + Math.random() * 1.2]],
};

const S = {
  /* --------------------------------------------------------- people, hits -- */
  pedHit(M, out, o, t) {
    const k = Math.max(0.3, Math.min(1.4, (o.speed ?? 12) / 14)), r = o.rate || 1;
    M.tone(out, { t, f0: 120 * r, f1: 42, dur: 0.22, peak: 0.95 * k });                                   // the body
    M.burst(out, { t, dur: 0.07, type: 'lowpass', f0: 2400, f1: 300, q: 0.6, peak: 0.6 * k, a: 0.001 });   // the slap
    M.modes(out, { t: t + 0.004, base: 172 * r, ratios: [1, 1.47, 2.09, 2.71, 3.6], decays: [0.22, 0.17, 0.12, 0.09, 0.06], peak: 0.32 * k }); // the bonnet
    M.burst(out, { t: t + 0.01, dur: 0.16, f0: 900, f1: 380, q: 0.9, peak: 0.25 * k });                    // cloth
    if (k > 0.85) { M.burst(out, { t: t + 0.02, dur: 0.05, type: 'highpass', f0: 5200, q: 0.7, peak: 0.25 * k, a: 0.0008 }); M.modes(out, { t: t + 0.025, base: 2400, ratios: [1, 1.6, 2.3], decays: [0.18, 0.12, 0.08], peak: 0.05 }); } // the windscreen
    return 0.4;
  },
  bodyFall(M, out, o, t) {
    const k = o.k ?? 0.8;
    M.tone(out, { t, f0: 85, f1: 34, dur: 0.28, peak: 0.7 * k });
    M.burst(out, { t, dur: 0.18, type: 'lowpass', f0: 1200, f1: 200, q: 0.5, peak: 0.45 * k });
    M.burst(out, { t: t + 0.07, dur: 0.14, type: 'lowpass', f0: 700, f1: 160, q: 0.5, peak: 0.22 * k });
    return 0.4;
  },
  scream(M, out, o, t) {
    const fem = o.voice ? o.voice === 'f' : M.R() < 0.55, kind = o.kind || M.pick(['aah', 'aah', 'whoa', 'hey']), r = o.rate || 1;
    const f0 = (fem ? M.rr(470, 640) : M.rr(250, 360)) * r;
    if (kind === 'hey') return voice(M, out, t, { f0: f0 * 0.85, dur: M.rr(0.28, 0.4), vowels: ['e', 'i'], peak: 0.42, rise: 1.18, fall: 0.8, breath: 0.08 });
    if (kind === 'whoa') return voice(M, out, t, { f0: f0 * 0.9, dur: M.rr(0.55, 0.8), vowels: ['u', 'o', 'a'], peak: 0.4, rise: 1.2, fall: 0.7 });
    return voice(M, out, t, { f0, dur: M.rr(0.7, 1.25), vowels: ['a', 'a', 'e'], peak: 0.3, rise: 1.1, fall: 0.68, rough: 0.09, breath: 0.16 });
  },
  carHit(M, out, o, t) {
    // (how hard: o.k, or read off the volume asked for: the callers give vol = impact speed / 16)
    const k = Math.max(0.2, Math.min(1.3, o.k ?? 0.5 + 0.5 * Math.min(1.3, o.vol ?? 1)));
    const hard = o.k != null ? (o.k - 0.5) * 2 : Math.min(1.3, o.vol ?? 1), sev = Math.max(0, Math.min(1, (hard * 16 - 0.8) / 22));
    // the metal (louder the harder, on top of the volume asked for, as before), then our glass if it was hard
    const dur = crunch(M, M.gain(CRUNCH * k, out), t, sev, o.rate || 1);
    if (k > 0.85) S.glass(M, out, { k: 0.5 * k }, t + 0.01);
    return Math.max(0.8, dur);
  },
  kerb(M, out, o, t) {
    const k = o.k ?? 0.6;
    M.tone(out, { t, f0: 64, f1: 38, dur: 0.12, peak: 0.6 * k });
    M.burst(out, { t, dur: 0.05, type: 'lowpass', f0: 900, f1: 200, q: 0.8, peak: 0.35 * k, a: 0.001 });
    M.burst(out, { t: t + 0.02, dur: 0.08, f0: 2400, q: 3, peak: 0.05 * k, buf: M.crackle }); // a rattle in the trim
    return 0.2;
  },
  glass(M, out, o, t) {
    const k = o.k ?? 1;
    M.burst(out, { t, dur: 0.22, type: 'highpass', f0: 3200, f1: 5200, q: 0.6, peak: 0.55 * k, a: 0.0008 });
    M.burst(out, { t, dur: 0.06, f0: 1500, q: 1, peak: 0.3 * k, a: 0.001 });
    const n = 10 + Math.floor(M.R() * 8);
    for (let i = 0; i < n; i++) { const at = t + 0.03 + Math.pow(M.R(), 1.6) * 0.65, f = M.rr(2600, 7800); M.tone(out, { t: at, f0: f, f1: f * 0.98, dur: M.rr(0.04, 0.14), peak: 0.07 * k * M.rr(0.4, 1), a: 0.0005 }); }
    return 0.8;
  },
  whoosh(M, out, o, t) {
    const d = (o.dur ?? 0.38) / (o.rate || 1), s = M.src(M.white), f = M.filt('bandpass', 300, 1.3), g = M.gain(0);
    s.connect(f); f.connect(g); g.connect(out);
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(2600 * (o.rate || 1), t + d * 0.6); f.frequency.exponentialRampToValueAtTime(700, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + d * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.start(t, M.R()); s.stop(t + d + 0.05);
    return d;
  },
  splash(M, out, o, t) {
    const k = o.k ?? 1;
    M.burst(out, { t, dur: 0.3, type: 'lowpass', f0: 2600, f1: 500, q: 0.6, peak: 0.6 * k, a: 0.004 });
    M.burst(out, { t: t + 0.02, dur: 0.5, type: 'highpass', f0: 2500, f1: 4000, q: 0.6, peak: 0.2 * k, a: 0.02 });
    for (let i = 0; i < 9; i++) { const at = t + 0.05 + M.R() * 0.6, f = M.rr(600, 1700); M.tone(out, { t: at, f0: f, f1: f * 1.9, dur: M.rr(0.02, 0.06), peak: 0.08 * k, a: 0.002 }); } // bubbles
    return 0.9;
  },
  footstep(M, out, o, t) {
    const run = o.run ?? 0, k = 0.5 + 0.5 * run;
    if (o.surface === 'grass') {
      M.burst(out, { t, dur: 0.09 + 0.04 * run, f0: 3200, f1: 1800, q: 0.8, peak: 0.4 * k, a: 0.012, buf: M.crackle });
      M.tone(out, { t, f0: 70, f1: 45, dur: 0.06, peak: 0.3 * k });
      return 0.2;
    }
    // a sneaker on concrete: a soft heel thud, the rubber's scuff
    M.tone(out, { t, f0: 105 * M.rr(0.9, 1.1), f1: 52, dur: 0.055, peak: 0.8 * k });
    M.burst(out, { t, dur: 0.03, f0: M.rr(1500, 2300), f1: 900, q: 1.4, peak: 0.33 * k, a: 0.0012 });
    M.burst(out, { t: t + 0.028, dur: 0.04 + 0.03 * run, f0: 4200, f1: 2600, q: 0.9, peak: 0.12 * k, a: 0.004 });
    return 0.15;
  },
  land(M, out, o, t) {
    M.tone(out, { t, f0: 90, f1: 40, dur: 0.12, peak: 0.6 });
    M.burst(out, { t, dur: 0.06, f0: 1500, f1: 700, q: 1, peak: 0.2 });
    M.burst(out, { t: t + 0.05, dur: 0.07, f0: 3500, q: 1, peak: 0.07 });
    return 0.2;
  },

  /* ------------------------------------------------------------- the cars -- */
  horn(M, out, o, t) { return horn(M, out, t, o.kind || M.pick(['taxi', 'sedan', 'sedan', 'suv']), (HORN_LEN[o.len] || HORN_LEN[M.pick(['tap', 'beep', 'double'])])()); },
  // a bus's brakes letting go: a hard hiss of air, falling
  airBrake(M, out, o, t) {
    M.burst(out, { t, dur: 0.75, type: 'highpass', f0: 3600, f1: 2200, q: 0.7, peak: 0.42, a: 0.006, hold: 0.12 });
    M.burst(out, { t, dur: 0.5, f0: 6500, f1: 4200, q: 1.5, peak: 0.18, a: 0.004 });
    M.tone(out, { t, f0: 95, f1: 60, dur: 0.08, peak: 0.2 });
    return 1;
  },
  doorOpen(M, out, o, t) {
    const r = o.rate || 1;
    M.burst(out, { t, dur: 0.012, f0: 3000 * r, q: 2, peak: 0.7, a: 0.0006 });                    // the handle
    M.burst(out, { t: t + 0.045, dur: 0.018, f0: 1900 * r, q: 2.5, peak: 0.9, a: 0.0006 });       // the latch letting go
    M.tone(out, { t: t + 0.045, f0: 210, f1: 120, dur: 0.06, peak: 0.45 });
    M.burst(out, { t: t + 0.06, dur: 0.16, type: 'lowpass', f0: 700, f1: 220, q: 0.7, peak: 0.5, a: 0.01 });  // the seal parting
    // a soft servo easing it out
    const o1 = M.osc('sawtooth', 240 * r), lp = M.filt('lowpass', 900, 1.2), g = M.gain(0); o1.connect(lp); lp.connect(g); g.connect(out);
    o1.frequency.setValueAtTime(240 * r, t + 0.08); o1.frequency.linearRampToValueAtTime(330 * r, t + 0.5); o1.frequency.linearRampToValueAtTime(260 * r, t + 0.62);
    g.gain.setValueAtTime(0.0001, t + 0.08); g.gain.exponentialRampToValueAtTime(0.09, t + 0.16); g.gain.setValueAtTime(0.09, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
    o1.start(t + 0.08); o1.stop(t + 0.7);
    return 0.72;
  },
  doorClose(M, out, o, t) {
    M.burst(out, { t, dur: 0.1, type: 'lowpass', f0: 500, f1: 1400, q: 0.6, peak: 0.16, a: 0.04 });   // air pushed out ahead of it
    const at = t + 0.12;
    M.tone(out, { t: at, f0: 120, f1: 52, dur: 0.14, peak: 0.85 });
    M.burst(out, { t: at, dur: 0.07, f0: 420, f1: 260, q: 1.6, peak: 0.45, a: 0.001 });
    M.burst(out, { t: at + 0.004, dur: 0.012, f0: 2800, q: 2.5, peak: 0.3, a: 0.0005 });              // the latch catching
    M.modes(out, { t: at, base: 310, ratios: [1, 1.9, 2.6], decays: [0.1, 0.07, 0.05], peak: 0.06 });
    return 0.45;
  },
  doorThunk(M, out, o, t) {
    M.tone(out, { t, f0: 95, f1: 42, dur: 0.2, peak: 0.95 });
    M.burst(out, { t, dur: 0.1, f0: 300, f1: 180, q: 1.3, peak: 0.5, a: 0.001 });
    M.burst(out, { t, dur: 0.01, f0: 2200, q: 2, peak: 0.25, a: 0.0005 });
    M.burst(out, { t: t + 0.03, dur: 0.12, type: 'lowpass', f0: 600, f1: 150, q: 0.6, peak: 0.12 });
    return 0.35;
  },
  // the car waking: a swell of current rising from nothing, a two-note chime over it, a settling thrum
  engineStart(M, out, o, t) {
    const sw = M.osc('sine', 55), sw2 = M.osc('sawtooth', 110), lp = M.filt('lowpass', 300, 2), g = M.gain(0);
    sw.connect(g); sw2.connect(lp); lp.connect(g); g.connect(out);
    for (const [p, a, b] of [[sw.frequency, 55, 220], [sw2.frequency, 110, 440], [lp.frequency, 300, 2400]]) { p.setValueAtTime(a, t); p.exponentialRampToValueAtTime(b, t + 0.55); p.exponentialRampToValueAtTime(b * 0.5, t + 1.1); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.5); g.gain.exponentialRampToValueAtTime(0.06, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    sw.start(t); sw2.start(t); sw.stop(t + 1.5); sw2.stop(t + 1.5);
    // the chime: two soft bells, a fifth then up to the octave
    for (const [at, f] of [[0.32, 659.25], [0.5, 987.77], [0.66, 1318.5]]) {
      M.tone(out, { t: t + at, f0: f, dur: 0.9, peak: 0.16, a: 0.004 });
      M.tone(out, { t: t + at, f0: f * 2.76, dur: 0.3, peak: 0.03, a: 0.002 });
    }
    M.burst(out, { t: t + 0.02, dur: 0.5, type: 'highpass', f0: 7000, f1: 9000, q: 0.5, peak: 0.02, a: 0.2 }); // a breath of the inverter
    return 1.6;
  },
  boostIgnite(M, out, o, t) {
    M.tone(out, { t, f0: 70, f1: 30, dur: 0.45, peak: 0.9 });
    M.burst(out, { t, dur: 0.4, type: 'lowpass', f0: 3000, f1: 400, q: 0.6, peak: 0.6, a: 0.004, buf: M.crackle });
    M.burst(out, { t, dur: 0.3, f0: 600, f1: 3000, q: 0.8, peak: 0.3, a: 0.02 });
    return 0.6;
  },

  /* ---------------------------------------------------------- the phone, UI -- */
  phoneBuzz(M, out, o, t) {
    const times = o.times ?? 2;
    for (let i = 0; i < times; i++) {
      const a = t + i * 0.55, b = M.osc('square', 168), lp = M.filt('lowpass', 520, 1), g = M.gain(0), am = M.osc('sine', 31), ag = M.gain(0.3);
      b.connect(lp); lp.connect(g); g.connect(out); am.connect(ag); ag.connect(g.gain);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.16, a + 0.02); g.gain.setValueAtTime(0.16, a + 0.36); g.gain.linearRampToValueAtTime(0, a + 0.4);
      for (const s of [b, am]) { s.start(a); s.stop(a + 0.42); }
      M.burst(out, { t: a, dur: 0.38, f0: 900, q: 6, peak: 0.03, a: 0.01, hold: 0 }); // (the table rattling)
    }
    return times * 0.55;
  },
  blip(M, out, o, t) {
    const r = o.rate || 1;
    M.tone(out, { t, f0: 1318.5 * r, dur: 0.09, peak: 0.36, type: 'triangle', a: 0.002 });
    M.tone(out, { t: t + 0.075, f0: 1760 * r, dur: 0.16, peak: 0.32, type: 'triangle', a: 0.002 });
    return 0.3;
  },
  missionStart(M, out, o, t) {
    M.tone(out, { t: t + 0.55, f0: 62, f1: 28, dur: 1.4, peak: 0.9 });                           // the drop
    M.burst(out, { t, dur: 0.06, type: 'highpass', f0: 2000, f1: 9000, q: 0.5, peak: 0.25, a: 0.55 }); // a reverse swell into it
    const lp = M.filt('lowpass', 400, 1.5), g = M.gain(0); lp.connect(g); g.connect(out);
    lp.frequency.setValueAtTime(300, t + 0.55); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.7); lp.frequency.exponentialRampToValueAtTime(500, t + 2.4);
    for (const f of [87.31, 130.81, 174.61, 207.65, 261.63]) for (const d of [-8, 8]) { const o1 = M.osc('sawtooth', f); o1.detune.value = d; o1.connect(lp); o1.start(t + 0.55); o1.stop(t + 2.6); }
    M.env(g.gain, t + 0.55, 0.02, 0.18, 1.9);
    M.burst(out, { t: t + 0.55, dur: 1.4, type: 'highpass', f0: 5000, q: 0.5, peak: 0.12, a: 0.003 });
    // a ticking clock under the tail
    for (let i = 0; i < 4; i++) M.burst(out, { t: t + 1.05 + i * 0.3, dur: 0.015, f0: i % 2 ? 2600 : 3300, q: 6, peak: 0.12, a: 0.0006 });
    return 2.6;
  },
  // mission passed: a kick and a clap under a brass line climbing F minor -> Db -> Eb -> F major, a pluck running up
  missionPassed(M, out, o, t) {
    const B = 0.3;
    const brass = (at, notes, len, peak = 0.11) => {
      const lp = M.filt('lowpass', 500, 2.5), g = M.gain(0); lp.connect(g); g.connect(out);
      lp.frequency.setValueAtTime(500, at); lp.frequency.exponentialRampToValueAtTime(3800, at + 0.05); lp.frequency.exponentialRampToValueAtTime(1100, at + len);
      for (const f of notes) for (const d of [-9, 0, 9]) { const o1 = M.osc('sawtooth', f); o1.detune.value = d; o1.connect(lp); o1.start(at); o1.stop(at + len + 0.1); }
      M.env(g.gain, at, 0.012, peak, len, 0);
    };
    const kick = (at, k = 1) => M.tone(out, { t: at, f0: 150, f1: 42, dur: 0.32, peak: 0.85 * k });
    const clap = (at) => { for (const d of [0, 0.011, 0.024]) M.burst(out, { t: at + d, dur: 0.09, f0: 1300, q: 1.1, peak: 0.28, a: 0.0008 }); };
    const pluck = (at, f, peak = 0.09) => { M.tone(out, { t: at, f0: f, dur: 0.3, peak, type: 'triangle', a: 0.002 }); M.tone(out, { t: at, f0: f * 2, dur: 0.12, peak: peak * 0.3, a: 0.002 }); };
    kick(t); brass(t, [174.61, 207.65, 261.63, 311.13, 392], 0.24);
    clap(t + B); brass(t + B * 1.5, [174.61, 207.65, 261.63, 311.13], 0.12, 0.08);
    kick(t + B * 2); brass(t + B * 2, [138.59, 174.61, 207.65, 261.63], 0.26);
    clap(t + B * 3); kick(t + B * 3.5, 0.6); brass(t + B * 3, [155.56, 196, 233.08, 311.13], 0.26);
    [311.13, 392, 466.16, 523.25].forEach((f, i) => pluck(t + B * 3 + i * B * 0.25, f));
    const fin = t + B * 4;
    kick(fin, 1.1); brass(fin, [174.61, 220, 261.63, 349.23, 392, 523.25], 1.9, 0.13);
    [349.23, 440, 523.25, 698.46, 880].forEach((f, i) => pluck(fin + 0.05 + i * 0.07, f, 0.08));
    M.burst(out, { t: fin, dur: 1.8, type: 'highpass', f0: 6000, f1: 8000, q: 0.5, peak: 0.12, a: 0.003 }); // the crash
    M.tone(out, { t: fin, f0: 43.65, dur: 1.6, peak: 0.45, a: 0.01 });                                  // the 808 under it
    return B * 4 + 2.1;
  },

  /* ------------------------------------------------------------- the city -- */
  // a pigeon: hoo, hoo, hrrroooo (a low wobbling coo)
  coo(M, out, o, t) {
    const f = M.rr(270, 330);
    const syl = [[0, 0.16, 1.05], [0.26, 0.14, 1.1], [0.52, 0.55, 1]];
    for (const [at, len, p] of syl) {
      const o1 = M.osc('sine', f * p), am = M.osc('sine', M.rr(22, 30)), ag = M.gain(0.45), g = M.gain(0), lp = M.filt('lowpass', 900, 0.7);
      o1.connect(g); am.connect(ag); ag.connect(g.gain); g.connect(lp); lp.connect(out);
      o1.frequency.setValueAtTime(f * p * 0.92, t + at); o1.frequency.linearRampToValueAtTime(f * p * 1.06, t + at + len * 0.4); o1.frequency.linearRampToValueAtTime(f * p * 0.88, t + at + len);
      g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(0.15, t + at + 0.04); g.gain.setValueAtTime(0.15, t + at + len * 0.7); g.gain.linearRampToValueAtTime(0, t + at + len);
      for (const s of [o1, am]) { s.start(t + at); s.stop(t + at + len + 0.02); }
    }
    return 1.1;
  },
  // sparrows: quick bright sweeps in a little run
  chirps(M, out, o, t) {
    const n = 3 + Math.floor(M.R() * 6), base = M.rr(3800, 5600);
    let at = t;
    for (let i = 0; i < n; i++) { const f = base * M.rr(0.85, 1.2); M.tone(out, { t: at, f0: f, f1: f * M.rr(0.6, 1.4), dur: M.rr(0.03, 0.07), peak: 0.3, a: 0.004 }); at += M.rr(0.07, 0.16); }
    return at - t + 0.1;
  },
  flutter(M, out, o, t) {
    const s = M.src(M.white), f = M.filt('bandpass', 1300, 0.8), g = M.gain(0), am = M.osc('square', M.rr(14, 19)), ag = M.gain(0.5);
    s.connect(f); f.connect(g); g.connect(out); am.connect(ag); ag.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.7);
    for (const x of [s, am]) { x.start(t); x.stop(t + 0.75); }
    return 0.8;
  },
  // a hammer on steel (one strike)
  clang(M, out, o, t) {
    const b = (o.f ?? M.rr(380, 460)) * (o.rate || 1);
    M.modes(out, { t, base: b, ratios: [1, 2.32, 4.25, 6.63, 9.1], decays: [1.1, 0.7, 0.45, 0.3, 0.2], peak: 0.22 });
    M.burst(out, { t, dur: 0.02, type: 'highpass', f0: 3500, q: 0.7, peak: 0.3, a: 0.0006 });
    return 1.2;
  },
  jackhammer(M, out, o, t) {
    const d = o.dur ?? M.rr(1.2, 2.6), s = M.src(M.white), f = M.filt('bandpass', 1100, 0.9), g = M.gain(0), am = M.osc('square', M.rr(22, 27)), ag = M.gain(0.5);
    s.connect(f); f.connect(g); g.connect(out); am.connect(ag); ag.connect(g.gain);
    const th = M.osc('sawtooth', 24), tl = M.filt('lowpass', 120), tg = M.gain(0); th.connect(tl); tl.connect(tg); tg.connect(out);
    for (const [p, v] of [[g.gain, 0.5], [tg.gain, 0.4]]) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + 0.04); p.setValueAtTime(v, t + d); p.linearRampToValueAtTime(0, t + d + 0.05); }
    for (const x of [s, am, th]) { x.start(t); x.stop(t + d + 0.08); }
    return d + 0.1;
  },
  // a truck backing up
  beeper(M, out, o, t) {
    const n = o.n ?? 5;
    for (let i = 0; i < n; i++) M.tone(out, { t: t + i * 1.0, f0: 1040, dur: 0.02, hold: 0.48, peak: 0.25, a: 0.008, type: 'triangle' });
    return n;
  },
  // a doorman's whistle for a cab: two blasts with a pea's trill
  whistle(M, out, o, t) {
    for (const [at, len] of [[0, 0.32], [0.45, 0.85]]) {
      const o1 = M.osc('sine', 2900), tr = M.osc('sine', M.rr(26, 34)), tg = M.gain(160), g = M.gain(0);
      tr.connect(tg); tg.connect(o1.frequency); o1.connect(g); g.connect(out);
      o1.frequency.setValueAtTime(2700, t + at); o1.frequency.linearRampToValueAtTime(3100, t + at + 0.06);
      g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(0.22, t + at + 0.03); g.gain.setValueAtTime(0.22, t + at + len - 0.05); g.gain.linearRampToValueAtTime(0, t + at + len);
      for (const s of [o1, tr]) { s.start(t + at); s.stop(t + at + len + 0.02); }
      M.burst(out, { t: t + at, dur: len, f0: 3000, q: 2, peak: 0.04, a: 0.02 });
    }
    return 1.4;
  },
  // someone calling out down the block: a word or two shouted ("hey!", "yo!", "taxi!"), o.voice 'f' | 'm'
  call(M, out, o, t) {
    const fem = o.voice ? o.voice === 'f' : M.R() < 0.45, f0 = fem ? M.rr(250, 330) : M.rr(150, 215);
    const words = M.pick([[['e', 'i']], [['o', 'u']], [['a'], ['i']], [['a', 'e'], ['i']], [['e', 'i'], ['o']]]);
    let at = 0;
    for (const v of words) { const d = M.rr(0.2, 0.36); voice(M, out, t + at, { f0: f0 * M.rr(0.95, 1.1), dur: d, vowels: v, peak: 0.3, rise: 1.15, fall: 0.85, breath: 0.1, rough: 0.05 }); at += d + M.rr(0.04, 0.1); }
    return at + 0.1;
  },
};
// (aliases)
S.honk = S.horn; S.thud = S.bodyFall; S.crash = S.carHit; S.crowdStep = S.footstep;

// the length a name plays for, roughly (for voice limits); the default bus and how far it carries
export const META = {
  footstep: { max: 4, ref: 3, far: 60 }, crowdStep: { max: 4, ref: 3, far: 60 }, land: { max: 2, ref: 3, far: 60 }, horn: { max: 4, ref: 9, far: 400 }, honk: { max: 4, ref: 9, far: 400 },
  scream: { max: 3, ref: 7, far: 160 }, pedHit: { max: 4, ref: 8, far: 200 }, carHit: { max: 4, ref: 15, far: 300 }, crash: { max: 4, ref: 15, far: 300 },
  airBrake: { max: 2, ref: 8, far: 160 }, clang: { max: 4, ref: 10, far: 400 }, jackhammer: { max: 2, ref: 10, far: 400 },
  missionPassed: { max: 1 }, missionStart: { max: 1 }, engineStart: { max: 1 }, phoneBuzz: { max: 1 }, call: { max: 2, ref: 7, far: 200 },
};
export { S as SOUNDS, voice, horn };
