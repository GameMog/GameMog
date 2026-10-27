// Mog City: a small offline synth for the radio's original tracks (Node, not loaded by the game). A song is written
// as notes on a bar / sixteenth grid; every note is synthesised into its bus, the buses mixed (EQ, sidechain to the
// kick, reverb and delay sends), the master glued, limited and set to a loudness. Deterministic (seeded).
export const SR = 44100;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- notes -- */
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); if (!m) throw new Error('note ' + n);
  return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = (n) => 440 * Math.pow(2, (midi(n) - 69) / 12);

// a seeded random (mulberry32)
export function rng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* -------------------------------------------------------------- filters -- */
// a state-variable filter (topology-preserving), cutoff settable per sample
export function svf() {
  let ic1 = 0, ic2 = 0;
  return (x, fc, q = 0.707, mode = 'lp') => {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR), k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    return mode === 'lp' ? v2 : mode === 'bp' ? v1 : mode === 'hp' ? x - k * v1 - v2 : x - k * v1;
  };
}
// a fixed biquad over a buffer (RBJ)
export function biq(buf, type, f, q = 0.707, db = 0) {
  const w = TAU * f / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'ls' || type === 'hs') {
    const s = 2 * Math.sqrt(A) * al, sg = type === 'ls' ? 1 : -1;
    b0 = A * ((A + 1) - sg * (A - 1) * cs + s); b1 = sg * 2 * A * ((A - 1) - sg * (A + 1) * cs); b2 = A * ((A + 1) - sg * (A - 1) * cs - s);
    a0 = (A + 1) + sg * (A - 1) * cs + s; a1 = -sg * 2 * ((A - 1) + sg * (A + 1) * cs); a2 = (A + 1) + sg * (A - 1) * cs - s;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; buf[i] = y; }
  return buf;
}
export const eq = (st, ...bands) => { for (const ch of st) for (const b of bands) biq(ch, ...b); return st; };

/* ---------------------------------------------------------- oscillators -- */
const blep = (t, dt) => { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; };
export function saw() { let p = Math.random(); return (f) => { const dt = f / SR; p += dt; if (p >= 1) p -= 1; return 2 * p - 1 - blep(p, dt); }; }
export function square(pw = 0.5) { let p = Math.random(); return (f) => { const dt = f / SR; p += dt; if (p >= 1) p -= 1; let v = p < pw ? 1 : -1; v += blep(p, dt); let q = p - pw; if (q < 0) q += 1; v -= blep(q, dt); return v; }; }
export function sine(ph = 0) { let p = ph; return (f) => { p += f / SR; if (p >= 1) p -= 1; return Math.sin(TAU * p); }; }

/* -------------------------------------------------------------- session -- */
// createSong({ bpm, bars, swing, seed }): the grid, the buses, the instruments; .render() -> { L, R } at SR
export function createSong({ bpm, bars, swing = 0, seed = 7, tail = 5, beatsPerBar = 4 }) {
  const step = 60 / bpm / 4, barLen = step * 16 * beatsPerBar / 4;
  const len = Math.ceil((bars * barLen + tail) * SR), songLen = Math.round(bars * barLen * SR);
  const rnd = rng(seed);
  const busNames = ['kick', 'sub', 'drums', 'hats', 'keys', 'pad', 'lead', 'bell', 'fx', 'verb', 'delay'];
  const bus = Object.fromEntries(busNames.map((n) => [n, [new Float32Array(len), new Float32Array(len)]]));
  const kicks = [];
  // the time of bar b (0-based), sixteenth s (fractional ok), swung, a hair of human
  const T = (b, s = 0, human = 0.003) => {
    const si = Math.floor(s), sw = si % 2 === 1 ? swing * step : 0;
    return b * barLen + s * step + sw + (human ? (rnd() - 0.5) * 2 * human : 0);
  };
  // add a mono sound into a bus at time t, panned (-1..1), with sends
  function put(name, t, mono, { pan = 0, gain = 1, verb = 0, delay = 0 } = {}) {
    const o = Math.round(t * SR); if (o >= len) return;
    const a = (pan + 1) * Math.PI / 4, gl = Math.cos(a) * gain * Math.SQRT2, gr = Math.sin(a) * gain * Math.SQRT2;
    const [L, R] = bus[name], [VL, VR] = bus.verb, [DL, DR] = bus.delay;
    for (let i = 0, n = Math.min(mono.length, len - o); i < n; i++) {
      const v = mono[i]; if (o + i < 0) continue;
      L[o + i] += v * gl; R[o + i] += v * gr;
      if (verb) { VL[o + i] += v * gl * verb; VR[o + i] += v * gr * verb; }
      if (delay) { DL[o + i] += v * gl * delay; DR[o + i] += v * gr * delay; }
    }
  }
  // stereo: a pair (already panned) into a bus
  function putSt(name, t, L, R, { gain = 1, verb = 0, delay = 0 } = {}) {
    const o = Math.round(t * SR); const [BL, BR] = bus[name], [VL, VR] = bus.verb, [DL, DR] = bus.delay;
    for (let i = 0, n = Math.min(L.length, len - o); i < n; i++) {
      if (o + i < 0) continue;
      BL[o + i] += L[i] * gain; BR[o + i] += R[i] * gain;
      if (verb) { VL[o + i] += L[i] * gain * verb; VR[o + i] += R[i] * gain * verb; }
      if (delay) { DL[o + i] += L[i] * gain * delay; DR[o + i] += R[i] * gain * delay; }
    }
  }
  const N = (secs) => new Float32Array(Math.max(1, Math.round(secs * SR)));
  const noise = () => rnd() * 2 - 1;

  /* ---------------------------------------------------- instruments -- */
  const I = {
    // a punchy kick: a sine swept down, a click on the front, a little drive
    kick(t, { vel = 1, decay = 0.2, top = 165, low = 49, tone = 0.4 } = {}) {
      kicks.push({ t, vel });
      const x = N(0.6), o = sine(0.25), hp = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR, f = low + (top - low) * Math.exp(-s / 0.03);
        const env = Math.min(1, s / 0.0015) * (Math.exp(-s / decay) * 0.85 + 0.15 * Math.exp(-s / 0.05));
        let v = o(f) * env;
        if (s < 0.008) v += hp(noise(), 2800, 0.7, 'hp') * (1 - s / 0.008) * tone;
        x[i] = Math.tanh(v * 1.6) * vel * 0.92;
      }
      put('kick', t, x, { gain: 1 });
    },
    // the 808: a sine at the note, a punch of pitch at the start, a long tail, glide from the last note, drive for the
    // harmonics a phone speaker can play
    sub(t, note, secs, { vel = 1, from = null, glide = 0.07, drive = 2.2, decay = 1.1 } = {}) {
      const f1 = hz(note), f0 = from != null ? hz(from) : f1, x = N(secs + 0.06), o = sine(0.25);
      for (let i = 0; i < x.length; i++) {
        const s = i / SR;
        let f = from != null ? f1 + (f0 - f1) * Math.exp(-s / (glide / 3)) : f1;
        f *= 1 + 0.35 * Math.exp(-s / 0.012);
        const rel = s > secs ? Math.max(0, 1 - (s - secs) / 0.05) : 1;
        const env = Math.min(1, s / 0.003) * (0.25 + 0.75 * Math.exp(-s / decay)) * rel;
        x[i] = Math.tanh(o(f) * env * drive) / Math.tanh(drive) * vel * 0.8;
      }
      put('sub', t, x);
    },
    // a snare: two tones and a burst of filtered noise
    snare(t, { vel = 1, pan = 0, tone = 0.5, verb = 0.18, decay = 0.13 } = {}) {
      const x = N(0.45), a = sine(), b = sine(), bp = svf(), hp = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR, at = Math.min(1, s / 0.001);
        const body = (a(190 * (1 + 0.4 * Math.exp(-s / 0.01))) * 0.6 + b(335) * 0.4) * Math.exp(-s / 0.045) * tone;
        const nz = hp(bp(noise(), 4200, 0.6, 'bp'), 1400, 0.7, 'hp') * Math.exp(-s / decay) * 1.3;
        x[i] = Math.tanh((body + nz) * at * 1.4) * vel * 0.55;
      }
      put('drums', t, x, { pan, verb });
    },
    // a clap: four quick bursts and a tail, band-passed
    clap(t, { vel = 1, pan = 0, verb = 0.3 } = {}) {
      const x = N(0.5), bp = svf(), hp = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR;
        let env = 0; for (let k = 0; k < 4; k++) { const d = s - k * 0.0095; if (d >= 0) env = Math.max(env, Math.exp(-d / (k === 3 ? 0.11 : 0.0045))); }
        x[i] = hp(bp(noise(), 1250, 0.9, 'bp'), 700, 0.7, 'hp') * env * vel * 1.2;
      }
      put('drums', t, x, { pan, verb });
    },
    // a hat: six detuned squares (the metal) and noise, high-passed; open: a longer tail
    hat(t, { vel = 1, open = false, pan = 0.25, decay = null } = {}) {
      const dec = decay ?? (open ? 0.22 : 0.032), x = N(dec * 5 + 0.01), sq = [205.3, 304.4, 369.6, 522.7, 540, 800].map(() => square(0.5));
      const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.72), bp = svf(), hp = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR; let m = 0; for (let k = 0; k < 6; k++) m += sq[k](fr[k]);
        const v = hp(bp(m * 0.14 + noise() * 0.5, 8600, 0.9, 'bp'), 6500, 0.7, 'hp');
        x[i] = v * Math.min(1, s / 0.0007) * Math.exp(-s / dec) * vel * 0.5;
      }
      put('hats', t, x, { pan, verb: open ? 0.06 : 0.02 });
    },
    // a shaker: soft noise, shaped
    shaker(t, { vel = 1, pan = -0.35 } = {}) {
      const x = N(0.12), bp = svf();
      for (let i = 0; i < x.length; i++) { const s = i / SR; x[i] = bp(noise(), 6500, 1.2, 'bp') * Math.min(1, s / 0.012) * Math.exp(-s / 0.04) * vel * 0.4; }
      put('hats', t, x, { pan });
    },
    // a crash: noise and metal, long, high-passed
    crash(t, { vel = 1, pan = -0.2, decay = 1.4 } = {}) {
      const x = N(decay * 4), sq = [1, 1.37, 1.79, 2.21, 2.6].map(() => square(0.5)), hp = svf(), hp2 = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR; let m = 0; for (let k = 0; k < 5; k++) m += sq[k](430 * [1, 1.37, 1.79, 2.21, 2.6][k]);
        x[i] = hp2(hp(noise() * 0.8 + m * 0.08, 5200, 0.7, 'hp'), 5200, 0.7, 'hp') * Math.min(1, s / 0.002) * Math.exp(-s / decay) * vel * 0.32;
      }
      put('hats', t, x, { pan, verb: 0.25 });
    },
    // warm chords: five detuned saws a note, spread across the stereo, through a low-pass (cut: Hz, or a function of
    // the time into the song), a soft attack and release
    pad(t, notes, secs, { vel = 1, cut = 1500, q = 0.8, atk = 0.04, rel = 0.35, spread = 0.7, voices = 5, det = 14 } = {}) {
      const n = Math.round((secs + rel) * SR), L = new Float32Array(n), R = new Float32Array(n);
      for (const note of notes) {
        const f = hz(note);
        for (let v = 0; v < voices; v++) {
          const d = voices > 1 ? (v / (voices - 1) - 0.5) * 2 : 0, o = saw(), lp = svf(), fr = f * Math.pow(2, (d * det) / 1200);
          const pan = d * spread, a = (pan + 1) * Math.PI / 4, gl = Math.cos(a), gr = Math.sin(a);
          for (let i = 0; i < n; i++) {
            const s = i / SR, c = typeof cut === 'function' ? cut(t + s) : cut;
            const env = Math.min(1, s / atk) * (s > secs ? Math.max(0, 1 - (s - secs) / rel) : 1);
            const y = lp(o(fr), c * (0.85 + 0.3 * env), q) * env * vel * 0.055;
            L[i] += y * gl; R[i] += y * gr;
          }
        }
      }
      putSt('pad', t, L, R, { verb: 0.25 });
    },
    // an electric piano (two-operator FM, a tine on the front), a slow tremolo across the stereo
    ep(t, notes, secs, { vel = 1, bright = 1, verb = 0.22, trem = 0.25 } = {}) {
      const n = Math.round((secs + 0.6) * SR), L = new Float32Array(n), R = new Float32Array(n);
      for (const note of notes) {
        const f = hz(note); let pc = 0, pm = 0, pt = 0;
        for (let i = 0; i < n; i++) {
          const s = i / SR, rel = s > secs ? Math.max(0, 1 - (s - secs) / 0.5) : 1;
          const idx = (0.4 + 2.2 * Math.exp(-s / 0.35)) * bright, tine = 0.9 * Math.exp(-s / 0.03) * bright;
          pm += f / SR; pt += f * 14 / SR; pc += f / SR;
          const y = Math.sin(TAU * pc + idx * Math.sin(TAU * pm) + tine * Math.sin(TAU * pt));
          const env = Math.min(1, s / 0.002) * (0.35 * Math.exp(-s / 2.2) + 0.65 * Math.exp(-s / 0.9)) * rel * vel * 0.13;
          const tr = 1 + trem * Math.sin(TAU * 4.2 * (t + s));
          L[i] += y * env * (2 - tr) * 0.5 * 1.4; R[i] += y * env * tr * 0.5 * 1.4;
        }
      }
      putSt('keys', t, L, R, { verb });
    },
    // the hook's pluck: two saws and a square, a filter snapping shut, a sub-octave sine under it
    pluck(t, note, secs, { vel = 1, pan = 0, bright = 1, verb = 0.18, delay = 0.22, sub = 0.25, bus: bn = 'lead' } = {}) {
      const f = hz(note), x = N(secs + 0.25), a = saw(), b = saw(), c = square(0.35), s0 = sine(), lp = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR, rel = s > secs ? Math.max(0, 1 - (s - secs) / 0.12) : 1;
        const cut = 700 + 6500 * bright * Math.exp(-s / 0.11) + 500 * bright;
        const env = Math.min(1, s / 0.002) * (0.5 + 0.5 * Math.exp(-s / 0.16)) * rel;
        const y = lp(a(f * 1.004) * 0.5 + b(f * 0.996) * 0.5 + c(f) * 0.35, cut, 1.3);
        x[i] = (y * 0.9 + s0(f / 2) * sub) * env * vel * 0.26;
      }
      put(bn, t, x, { pan, verb, delay });
    },
    // a trap bell: FM, a bright strike falling to a pure tone
    bell(t, note, secs, { vel = 1, pan = 0, verb = 0.3, delay = 0.25 } = {}) {
      const f = hz(note), x = N(secs + 1.2); let pc = 0, pm = 0;
      for (let i = 0; i < x.length; i++) {
        const s = i / SR; pc += f / SR; pm += f * 3.5 / SR;
        const idx = 3.2 * Math.exp(-s / 0.18);
        x[i] = Math.sin(TAU * pc + idx * Math.sin(TAU * pm)) * Math.min(1, s / 0.001) * Math.exp(-s / 0.7) * vel * 0.16;
      }
      put('bell', t, x, { pan, verb, delay });
    },
    // a whistle: a sine with breath, vibrato after the attack, a little scoop into the note
    whistle(t, note, secs, { vel = 1, pan = 0.1, verb = 0.3, delay = 0.18, scoop = 0.6 } = {}) {
      const f = hz(note), x = N(secs + 0.1), o = sine(), bp = svf();
      for (let i = 0; i < x.length; i++) {
        const s = i / SR, rel = s > secs ? Math.max(0, 1 - (s - secs) / 0.08) : 1;
        const vib = 1 + 0.009 * Math.sin(TAU * 5.6 * s) * Math.min(1, Math.max(0, (s - 0.12) / 0.2));
        const fr = f * vib * Math.pow(2, (-scoop * Math.exp(-s / 0.025)) / 12);
        const env = Math.min(1, s / 0.03) * rel;
        x[i] = (o(fr) + bp(noise(), fr, 6, 'bp') * 0.18) * env * vel * 0.2;
      }
      put('lead', t, x, { pan, verb, delay });
    },
    // a riser: noise swept up over secs, getting louder
    riser(t, secs, { vel = 1, from = 300, to = 9000 } = {}) {
      const x = N(secs), bp = svf();
      for (let i = 0; i < x.length; i++) { const k = i / x.length, f = from * Math.pow(to / from, k); x[i] = bp(noise(), f, 2.2, 'bp') * k * k * vel * 0.45; }
      put('fx', t, x, { verb: 0.4 });
    },
    // a reversed cymbal: a crash's tail, backwards, into the downbeat at t + secs
    swell(t, secs, { vel = 1 } = {}) {
      const x = N(secs), hp = svf();
      for (let i = 0; i < x.length; i++) { const k = i / x.length; x[i] = hp(noise(), 4500, 0.7, 'hp') * Math.pow(k, 3) * vel * 0.35; }
      put('fx', t, x, { verb: 0.2, pan: 0 });
    },
    // an impact: a sub boom under a downbeat
    boom(t, { vel = 1 } = {}) {
      const x = N(1.6), o = sine(0.25);
      for (let i = 0; i < x.length; i++) { const s = i / SR; x[i] = Math.tanh(o(30 + 60 * Math.exp(-s / 0.12)) * Math.exp(-s / 0.6) * 1.5) * vel * 0.5; }
      put('fx', t, x, { verb: 0.15 });
    },
    // a vinyl-ish crackle bed (lo-fi): sparse clicks, filtered
    crackle(t, secs, { vel = 1 } = {}) {
      const x = N(secs), lp = svf();
      for (let i = 0; i < x.length; i++) { const c = rnd() < 0.0009 ? (rnd() - 0.5) * 2 : 0; x[i] = lp(c + noise() * 0.02, 5000, 0.7) * vel * 0.25; }
      put('fx', t, x, { pan: 0 });
    },
  };

  /* -------------------------------------------------------------- mix -- */
  // the kick's ducking: a gain curve (depth, recovery seconds) every other bus can be multiplied by
  function sidechain(depth, rec) {
    const g = new Float32Array(len).fill(1);
    for (const k of kicks) {
      const o = Math.round(k.t * SR), n = Math.round(rec * 4 * SR), d = depth * Math.min(1, k.vel);
      for (let i = 0; i < n && o + i < len; i++) {
        if (o + i < 0) continue; const s = i / SR;
        const v = 1 - d * Math.min(1, s / 0.004 + 0.4) * Math.exp(-s / rec);
        if (v < g[o + i]) g[o + i] = v;
      }
    }
    return g;
  }
  const apply = (st, g) => { for (const ch of st) for (let i = 0; i < ch.length; i++) ch[i] *= g[i]; };
  // Freeverb (8 combs, 4 allpasses a side)
  function reverb([L, R], { room = 0.84, damp = 0.25, pre = 0.02, width = 1 } = {}) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], alls = [556, 441, 341, 225];
    const out = [new Float32Array(len), new Float32Array(len)], pd = Math.round(pre * SR);
    [L, R].forEach((x, c) => {
      const sp = c ? 23 : 0;
      const cb = combs.map((d) => ({ b: new Float32Array(d + sp), i: 0, s: 0 })), ab = alls.map((d) => ({ b: new Float32Array(d + sp), i: 0 }));
      const y = out[c];
      for (let n = 0; n < len; n++) {
        const inp = (n >= pd ? x[n - pd] : 0) * 0.015;
        let s = 0;
        for (const k of cb) { const o = k.b[k.i]; k.s = o * (1 - damp) + k.s * damp; k.b[k.i] = inp + k.s * room; if (++k.i >= k.b.length) k.i = 0; s += o; }
        for (const k of ab) { const o = k.b[k.i]; k.b[k.i] = s + o * 0.5; s = o - s; if (++k.i >= k.b.length) k.i = 0; }
        y[n] = s;
      }
    });
    if (width < 1) for (let n = 0; n < len; n++) { const m = (out[0][n] + out[1][n]) / 2; out[0][n] = m + (out[0][n] - m) * width; out[1][n] = m + (out[1][n] - m) * width; }
    return out;
  }
  // a ping-pong delay (feedback through a low-pass)
  function pingpong([L, R], { time, fb = 0.32, cut = 3200 } = {}) {
    const d = Math.round(time * SR), bl = new Float32Array(d), br = new Float32Array(d), out = [new Float32Array(len), new Float32Array(len)];
    let i = 0, zl = 0, zr = 0; const a = Math.exp(-TAU * cut / SR);
    for (let n = 0; n < len; n++) {
      const ol = bl[i], or = br[i];
      zl = (1 - a) * ol + a * zl; zr = (1 - a) * or + a * zr;
      bl[i] = (L[n] + R[n]) * 0.5 + zr * fb; br[i] = zl * fb;
      out[0][n] = ol; out[1][n] = or; if (++i >= d) i = 0;
    }
    return out;
  }
  // a compressor (feed-forward, peak-ish detector, soft knee), in place over a stereo pair
  function comp(st, { thr = -18, ratio = 3, atk = 0.01, rel = 0.15, makeup = 0, knee = 6 } = {}) {
    const [L, R] = st, aa = Math.exp(-1 / (atk * SR)), ar = Math.exp(-1 / (rel * SR)); let env = 0;
    const mk = Math.pow(10, makeup / 20);
    for (let n = 0; n < L.length; n++) {
      const x = Math.max(Math.abs(L[n]), Math.abs(R[n]));
      env = x > env ? aa * env + (1 - aa) * x : ar * env + (1 - ar) * x;
      const db = 20 * Math.log10(env + 1e-9), over = db - thr;
      let red = 0;
      if (over > knee / 2) red = over * (1 - 1 / ratio); else if (over > -knee / 2) red = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
      const g = Math.pow(10, -red / 20) * mk; L[n] *= g; R[n] *= g;
    }
    return st;
  }
  // a look-ahead brick-wall limiter to ceiling (linear), 4x-oversampled peaks between samples taken into account roughly
  function limit(st, ceiling = 0.89, { look = 0.005, rel = 0.08 } = {}) {
    const [L, R] = st, la = Math.round(look * SR), n = L.length, need = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (i > 0) { const mL = Math.abs(L[i] + L[i - 1]) * 0.56, mR = Math.abs(R[i] + R[i - 1]) * 0.56; p = Math.max(p, mL, mR); }
      need[i] = p > ceiling ? ceiling / p : 1;
    }
    // the gain: the lowest need within the look-ahead, released slowly
    const g = new Float32Array(n), ar = Math.exp(-1 / (rel * SR)); let cur = 1;
    const dq = []; // a monotonic deque of indices for the window minimum
    for (let i = 0; i < n + la; i++) {
      if (i < n) { while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop(); dq.push(i); }
      const j = i - la; if (j < 0) continue;
      while (dq.length && dq[0] < j - la) dq.shift();
      const want = dq.length ? need[dq[0]] : 1;
      cur = want < cur ? want : ar * cur + (1 - ar) * want;
      g[j] = cur;
    }
    let mn = 1, sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) { L[i] *= g[i]; R[i] *= g[i]; if (g[i] < mn) mn = g[i]; if (g[i] < 0.999) { sum += -20 * Math.log10(g[i]); cnt++; } }
    st.gr = { max: -20 * Math.log10(mn), mean: cnt ? sum / cnt : 0, share: cnt / n };
    return st;
  }
  const add = (dst, src, k = 1) => { for (let c = 0; c < 2; c++) for (let i = 0; i < len; i++) dst[c][i] += src[c][i] * k; };
  const peak = (st) => { let p = 0; for (const ch of st) for (const v of ch) p = Math.max(p, Math.abs(v)); return p; };

  return {
    bpm, bars, step, barLen, len, songLen, bus, T, I, rnd, put, putSt,
    // mix it all down: levels per bus (dB), the kick's sidechain, the sends, the master. Returns [L, R], song length,
    // the tail folded onto the start (a seamless loop)
    mix({ levels = {}, duck = {}, verb = {}, delayTime = step * 3, delayFb = 0.3, master = {}, probe = null } = {}) {
      const sc = {}; for (const [b, [d, r]] of Object.entries(duck)) sc[b] = sidechain(d, r);
      const out = [new Float32Array(len), new Float32Array(len)];
      // bus EQ: everything but the kick and the 808 out of the lows
      eq(bus.drums, ['hp', 110, 0.7]); eq(bus.hats, ['hp', 400, 0.7]); eq(bus.pad, ['hp', 160, 0.7], ['peak', 320, 1, -2]); eq(bus.keys, ['hp', 120, 0.7], ['peak', 300, 1, -1.5]);
      eq(bus.lead, ['hp', 180, 0.7], ['peak', 2800, 1, 1.5]); eq(bus.bell, ['hp', 300, 0.7]); eq(bus.fx, ['hp', 40, 0.7]);
      eq(bus.sub, ['lp', 3200, 0.7], ['hp', 28, 0.7]); eq(bus.kick, ['hp', 30, 0.7], ['peak', 3500, 1, 2]);
      const fxv = reverb(bus.verb, verb), dly = pingpong(bus.delay, { time: delayTime, fb: delayFb });
      eq(fxv, ['hp', 250, 0.7], ['lp', 9000, 0.7]); eq(dly, ['hp', 300, 0.7]);
      const sends = { verb: fxv, delay: dly };
      const rep = [];
      const rms = (st, k) => { if (!probe) return; const a = Math.round(probe[0] * SR), z = Math.round(probe[1] * SR); let e = 0; for (const ch of st) for (let i = a; i < z; i++) e += ch[i] * ch[i]; return (10 * Math.log10(e / (2 * (z - a)) + 1e-12) + 20 * Math.log10(k)).toFixed(1); };
      for (const name of ['kick', 'sub', 'drums', 'hats', 'keys', 'pad', 'lead', 'bell', 'fx']) {
        const st = bus[name]; if (sc[name]) apply(st, sc[name]);
        const k = Math.pow(10, (levels[name] ?? 0) / 20);
        add(out, st, k); if (probe) rep.push(`${name} ${rms(st, k)}`);
      }
      if (probe) rep.push(`verb ${rms(sends.verb, Math.pow(10, (levels.verb ?? 0) / 20))}`, `delay ${rms(sends.delay, Math.pow(10, (levels.delay ?? -6) / 20))}`);
      if (probe) console.log('  bus RMS (dB) in', probe.map((x) => x.toFixed(1)).join('-'), 's:', rep.join('  '));
      add(out, sends.verb, Math.pow(10, (levels.verb ?? 0) / 20));
      add(out, sends.delay, Math.pow(10, (levels.delay ?? -6) / 20));
      // the master: a gentle glue, a touch of air and weight, then the limiter (loudness is set after, by the caller)
      eq(out, ['ls', 90, 0.7, master.low ?? 0.5], ['hs', 9000, 0.7, master.air ?? 1]);
      comp(out, { thr: master.thr ?? -14, ratio: 2, atk: 0.02, rel: 0.2, knee: 8 });
      // fold the tail onto the start, then cut to the song
      for (let c = 0; c < 2; c++) for (let i = songLen; i < len; i++) out[c][i - songLen] += out[c][i];
      return { L: out[0].slice(0, songLen), R: out[1].slice(0, songLen), limit, peak };
    },
  };
}
