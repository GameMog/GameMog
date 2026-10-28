// Mog City: a crash's metal. Ported from Slop New York by Mr.doob (MIT), commit 7772c09 (js/audio-events.js:
// crashBody, crashMetal, crashDebris and the crash in playEvent), with 09ee62d's heavier body and duller metal, three
// takes of each layer baked once:
//   body    the bumper and chassis taking it: band-limited noise, a broad heavy thump and a rebound just after
//   metal   the sheet metal folding: uneven creases in short saturated bursts, the panels' ring only a quiet undertone
//   debris  bits flying off and landing: short ringing grains (only in a hard one)
// crunch(M, out, t, severity 0..1, rate): harder is lower and has more metal in it. (sounds.js carHit plays it, with our
// glass on top when it is hard.) Each buffer bakes the first time it is wanted (a few ms), or before in idle time
// (warmCrunch, one at a time).
const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, finite(value)));

function randomSource(seed) {
  let state = (finite(seed, 1) * 2654435761) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d);
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b);
  state ^= state >>> 16;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeBuffer(ctx, duration, synthesize, peak = 0.6) {
  const buffer = ctx.createBuffer(1, Math.ceil(duration * ctx.sampleRate), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let maximum = 0, mean = 0;
  for (let i = 0; i < samples.length; i++) {
    samples[i] = synthesize(i / ctx.sampleRate, i);
    mean += samples[i];
  }
  mean /= samples.length;
  for (let i = 0; i < samples.length; i++) {
    // A short endpoint fade removes clicks even when a pitched component ends between zero crossings.
    const fade = Math.min(1, i / (ctx.sampleRate * 0.002), (samples.length - 1 - i) / (ctx.sampleRate * 0.012));
    samples[i] = (samples[i] - mean) * fade;
    maximum = Math.max(maximum, Math.abs(samples[i]));
  }
  const scale = maximum > 0 ? peak / maximum : 0;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return buffer;
}

// (the body and the metal as Slop New York 09ee62d has them: lower, longer, a heavier rebound; folds, not a ring)
function crashBody(ctx, seed) {
  const random = randomSource(seed);
  const coefficients = [35, 200 + random() * 60, 800].map((frequency) => 1 - Math.exp(-TAU * frequency / ctx.sampleRate));
  const bands = [0, 0, 0];
  const rebound = 0.022 + random() * 0.028;
  const decay = 0.055 + random() * 0.020;
  return makeBuffer(ctx, 0.42, (t) => {
    const noise = random() * 2 - 1;
    for (let i = 0; i < bands.length; i++) bands[i] += (noise - bands[i]) * coefficients[i];
    const contact = (1 - Math.exp(-t * 1600)) * Math.exp(-t / decay);
    const second = Math.max(0, t - rebound);
    const compression = (1 - Math.exp(-second * 700)) * Math.exp(-second / 0.045);
    // Broad chassis pressure lasts through the initial crunch; the rebound gives the impact weight without a tone.
    return (bands[1] - bands[0]) * (contact * 2.1 + compression * 0.8)
      + (bands[2] - bands[1]) * (contact * 0.75 + compression * 0.28);
  }, 0.7);
}

function crashMetal(ctx, seed) {
  const random = randomSource(seed);
  const creases = Array.from({ length: 10 }, () => ({
    time: 0.008 + random() ** 1.25 * 0.22,
    decay: 0.010 + random() * 0.026,
    level: 0.25 + random() * 0.65,
  }));
  const modes = [180, 350, 650, 1050].map((frequency, i) => {
    const radius = Math.exp(-1 / (ctx.sampleRate * (0.004 + random() * 0.005)));
    const angle = TAU * frequency * (0.85 + random() * 0.3) / ctx.sampleRate;
    // Compensate for frequency so the lower, heavily damped modes do not become a hollow ringing note.
    return { a: 2 * radius * Math.cos(angle), b: radius * radius,
      gain: 2 * (1 - radius) * Math.sin(angle) * [1, 0.85, 0.6, 0.3][i], y1: 0, y2: 0 };
  });
  const lowCoefficient = 1 - Math.exp(-TAU * 140 / ctx.sampleRate);
  const highCoefficient = 1 - Math.exp(-TAU * 2400 / ctx.sampleRate);
  let low = 0, high = 0;
  return makeBuffer(ctx, 0.43, (t) => {
    const noise = random() * 2 - 1;
    low += (noise - low) * lowCoefficient;
    high += (noise - high) * highCoefficient;
    let pressure = (1 - Math.exp(-t * 1800)) * Math.exp(-t / 0.025);
    for (const crease of creases) {
      const local = t - crease.time;
      if (local > 0) pressure += (1 - Math.exp(-local * 2200)) * Math.exp(-local / crease.decay) * crease.level;
    }
    const excitation = noise * pressure;
    let panel = 0;
    for (const mode of modes) {
      const y = excitation + mode.a * mode.y1 - mode.b * mode.y2;
      mode.y2 = mode.y1;
      mode.y1 = y;
      panel += y * mode.gain;
    }
    // Uneven folds and short saturated noise bursts dominate; panel vibration is only a quiet undertone.
    return panel * 0.35 + Math.tanh((high - low) * 2.4) * pressure * 0.75;
  }, 0.65);
}

function crashDebris(ctx, seed) {
  const random = randomSource(seed);
  const grains = Array.from({ length: 14 }, () => {
    const time = 0.015 + random() ** 1.7 * 0.51;
    return { time, frequency: 1400 + random() * 4300, decay: 0.003 + random() * 0.010,
      level: (0.25 + random() * 0.75) * (1 - time * 0.9) };
  });
  const coefficient = 1 - Math.exp(-TAU * 1100 / ctx.sampleRate);
  let low = 0;
  return makeBuffer(ctx, 0.67, (t) => {
    const noise = random() * 2 - 1;
    low += (noise - low) * coefficient;
    let fragments = 0;
    for (const grain of grains) {
      const local = t - grain.time;
      if (local <= 0 || local > grain.decay * 7) continue;
      const envelope = (1 - Math.exp(-local * 3500)) * Math.exp(-local / grain.decay) * grain.level;
      const ring = Math.sin(TAU * grain.frequency * local) + Math.sin(TAU * grain.frequency * 1.71 * local) * 0.3;
      fragments += ((noise - low) * 0.7 + ring * 0.16) * envelope;
    }
    return fragments;
  }, 0.55);
}

// (per context: the nine buffers, each baked the first time it is wanted, or before that in idle time: warmCrunch)
const BANKS = new WeakMap();
const MAKE = { body: [crashBody, 301], metal: [crashMetal, 401], debris: [crashDebris, 501] };
function bank(ctx) {
  let b = BANKS.get(ctx);
  if (!b) BANKS.set(ctx, (b = { body: [], metal: [], debris: [] }));
  return b;
}
const take = (ctx, layer, i) => { const b = bank(ctx)[layer]; return b[i] || (b[i] = MAKE[layer][0](ctx, MAKE[layer][1] + i)); };
export function warmCrunch(M) {
  const todo = [];
  for (const layer of Object.keys(MAKE)) for (let i = 0; i < 3; i++) todo.push([layer, i]);
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(f, 20);
  const ms = (M.crunchMs = []);
  const pump = () => { const j = todo.shift(); if (!j) return; const t0 = performance.now(); take(M.ctx, j[0], j[1]); ms.push(+(performance.now() - t0).toFixed(1)); if (todo.length) idle(pump); };
  if (M.live === false) while (todo.length) pump(); else idle(pump);
}

// one crash into `out` at t: severity 0..1 (how hard), rate a pitch on top (1 = as baked); returns how long it rings
export function crunch(M, out, t, severity, rate = 1) {
  const ctx = M.ctx, sev = clamp(severity);
  const variant = Math.floor(M.R() * 3);
  const r = (1.16 - sev * 0.24) * (0.96 + M.R() * 0.08) * rate;
  let end = t;
  const play = (buffer, when, volume) => {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buffer; s.playbackRate.value = r; g.gain.value = volume;
    s.connect(g); g.connect(out);
    s.start(when); s.stop(when + buffer.duration / r);
    s.onended = () => { try { s.disconnect(); g.disconnect(); } catch {} };
    end = Math.max(end, when + buffer.duration / r);
  };
  // (the body carries it; metal and bits only grow on a hard one: Slop New York 09ee62d's levels)
  play(take(ctx, 'body', variant), t, 0.9 + sev * 0.1);
  play(take(ctx, 'metal', variant), t + 0.003, 0.04 + sev ** 1.4 * 0.56);
  if (sev > 0.6) play(take(ctx, 'debris', variant), t + 0.012, (sev - 0.6) / 0.4 * 0.24);
  return end - t;
}
