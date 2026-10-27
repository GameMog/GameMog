// Mog City: Dan's car ALL ELECTRIC (the quiet mode, drivemode.js): no exhaust, no gearbox, no pops. One motor
// geared straight to the wheels, so everything it says follows the road speed smoothly, up and down:
//   whine     the motor and its reduction gear: three orders of the motor's speed (its poles, twice that, the gear's
//             teeth high and faint), louder with the torque it makes, pulling (on the throttle) or giving back (the
//             regen, lifting and braking); rising from nothing at a walk to a high clean note flat out
//   inverter  a faint high fizz of its switching, under torque at low speed
//   hum       a soft low hum while it is on, a touch up with the load
//   warning   the pedestrian warning, at walking and town pace only: a gentle two-voice tone a fifth apart that rises
//             with the speed and fades out by 9 m/s (and pulses slowly in reverse)
// The tyres and the wind (playercar.js) are what is heard at speed; the boost's thrusters keep their own sound.
// createElectric(M, out) -> { update(dt, s) -> state, stop(t), state } (as createSupercar: s { speed, throttle, on })
// driveCue(M, dest, mode, { moving, t }) -> its length: the switch's cue ('electric' a contactor's click and a soft
// rising chime; 'engine' the starter (at rest), the engine catching; the car's own engine adds the blip)

export function createElectric(M, out) {
  const now = () => M.now();
  const ramp = (p, v, k = 0.03) => p.setTargetAtTime(v, now(), k);
  const level = M.gain(0, out), src = [];
  const add = (s) => (src.push(s), s);
  // the whine: three orders through a gentle top cut (the cabin)
  const wl = M.filt('lowpass', 5200, 0.5, level);
  const w = [['sine', 1], ['sine', 2], ['triangle', 6.2]].map(([type, ord]) => { const g = M.gain(0, wl), o = add(M.osc(type, 40 * ord, g)); return { o, g, ord }; });
  w[1].o.detune.value = 4;
  // the inverter's fizz
  const fz = add(M.src(M.white)), fbp = M.filt('bandpass', 8200, 3.5), fg = M.gain(0, level); fz.connect(fbp); fbp.connect(fg);
  // the hum
  const hl = M.filt('lowpass', 320, 0.7, level), hg = M.gain(0, hl);
  const h1 = add(M.osc('sine', 58, hg)), h2 = add(M.osc('triangle', 116)), h2g = M.gain(0.3, hg); h2.connect(h2g);
  // the pedestrian warning: a fifth, a sub under it, softened and gently swelling
  const ag = M.gain(0, level), swell = M.gain(0.85, ag), ah = M.filt('highpass', 150, 0.7, swell), al = M.filt('lowpass', 1100, 0.6, ah);
  const a1 = add(M.osc('triangle', 260)), a2 = add(M.osc('triangle', 390)), a3 = add(M.osc('sine', 130, al)), am = M.gain(0.4, al);
  a1.connect(am); a2.connect(am); a2.detune.value = 6;
  const lfo = add(M.osc('sine', 0.7)), lfg = M.gain(0.15); lfo.connect(lfg); lfg.connect(swell.gain);
  for (const s of src) s.start(now(), s.buffer ? M.R() * 1.5 : undefined);

  // the motor: its speed (as road speed, m/s), the torque it makes (-1 regen .. 1), the wheels spinning against a wall
  const S = { gear: 'D', rpm: 0, load: 0, torque: 0, motor: 0, acc: 0, lastV: null, stuck: 0, rev: false };
  let stopped = false;

  // s: { speed (m/s, signed), throttle -1..1, on, boost }
  function update(dt, s) {
    const vs = s.speed || 0, v = Math.abs(vs), th = s.throttle || 0, on = s.on === false ? 0 : 1;
    if (S.lastV == null) { S.lastV = v; S.motor = v; }
    const fwd = vs >= -0.3 ? 1 : -1;
    const gas = th > 0 ? (fwd > 0 ? th : 0) : th < 0 ? (fwd < 0 || v < 0.3 ? -th : 0) : 0;
    const braking = th !== 0 && gas === 0 && v > 0.5;
    S.acc += (((v - S.lastV) / Math.max(1e-3, dt)) - S.acc) * Math.min(1, dt * 8); S.lastV = v;
    S.rev = vs < -0.3 || (th < 0 && v < 0.3); S.gear = S.rev ? 'R' : 'D';
    // flat out against something: the wheels spin up a little, the traction control pulling them back
    S.stuck = gas > 0.5 && v < 3 && S.acc < 1 ? S.stuck + dt : 0;
    const spin = S.stuck > 0.4 ? 7 + 3 * Math.sin(S.stuck * 11) : 0;
    S.motor += (Math.max(v, spin) - S.motor) * Math.min(1, dt * (spin ? 4 : 14));
    // the torque: the throttle's pull (harder out of a standstill, easing toward the top), the regen's push back
    // lifting off (light) and braking (strong), nothing at rest
    const want = gas > 0 ? gas * (s.boost ? 1 : 0.55 + 0.45 * Math.max(0, 1 - v / 40)) : braking ? -0.85 : v > 1.5 ? -0.28 * Math.min(1, v / 12) : 0;
    S.torque += (want - S.torque) * Math.min(1, dt / (Math.abs(want) > Math.abs(S.torque) ? 0.06 : 0.12));
    S.load = Math.abs(S.torque);
    S.rpm = S.motor * 520;   // (as a 9:1 reduction on a 0.35 m wheel)
    voice(on);
    return S;
  }

  function voice(on) {
    const m = S.motor, k = S.load, regen = S.torque < 0 ? 1 : 0;
    // the whine: its fundamental 50 Hz + 26 Hz per m/s (about 930 Hz at the top speed, 1500 on the boost)
    const f = 50 + m * 26, rise = Math.min(1, m / 10), top = Math.min(1, m / 34);
    for (const x of w) ramp(x.o.frequency, f * x.ord, 0.02);
    const pull = 0.3 + 0.7 * k;
    ramp(w[0].g.gain, on * rise * pull * (0.075 - 0.02 * top), 0.04);
    ramp(w[1].g.gain, on * rise * pull * (regen ? 0.05 : 0.032), 0.04);
    ramp(w[2].g.gain, on * rise * pull * 0.012 * (0.4 + 0.6 * top), 0.04);
    ramp(wl.frequency, 3200 + 3600 * top, 0.1);
    // the inverter: under torque, fading as it gathers speed
    ramp(fbp.frequency, 7400 + 1600 * top, 0.1); ramp(fg.gain, on * 0.05 * k * Math.max(0.25, 1 - m / 30), 0.05);
    // the hum
    ramp(h1.frequency, 58 + 8 * k, 0.1); ramp(h2.frequency, 116 + 16 * k, 0.1); ramp(hg.gain, on * (0.022 + 0.014 * k), 0.08);
    // the warning: 260 Hz at rest to 420 at 9 m/s; quiet at rest, fading out from 6 m/s
    const av = Math.min(1, m / 9), aw = m < 0.3 ? 0.25 : Math.max(0, Math.min(1, (9 - m) / 3));
    const af = 260 + 160 * av;
    ramp(a1.frequency, af, 0.05); ramp(a2.frequency, af * 1.5, 0.05); ramp(a3.frequency, af / 2, 0.05);
    ramp(lfo.frequency, S.rev ? 1.6 : 0.7, 0.1); ramp(lfg.gain, S.rev ? 0.6 : 0.15, 0.1);
    ramp(ag.gain, on * aw * 0.04, 0.08);
    ramp(level.gain, on, 0.05);
  }

  function stop(t = now()) {
    if (stopped) return; stopped = true;
    for (const s of src) try { s.stop(t + 0.05); } catch {}
    if (M.live) setTimeout(() => { try { level.disconnect(); } catch {} }, 300);
  }
  return { update, stop, state: S };
}

// the switch's cue, into dest (the cabin: not placed)
export function driveCue(M, dest, mode, { moving = false, t = M.now() + 0.005 } = {}) {
  const out = M.gain(0.9, dest);
  if (mode === 'electric') {
    // a contactor closing: a small dry click and its thunk
    M.burst(out, { t, dur: 0.012, f0: 2600, q: 1.6, peak: 0.22, a: 0.0005 });
    M.tone(out, { t, f0: 140, f1: 90, dur: 0.05, peak: 0.16, a: 0.001 });
    // the chime: two soft glassy notes up a fifth (a bell's partial over each)
    for (const [at, fr, pk] of [[0.06, 1174.66, 0.12], [0.2, 1760, 0.1]]) {
      M.tone(out, { t: t + at, f0: fr, dur: 0.75, peak: pk, a: 0.006 });
      M.tone(out, { t: t + at, f0: fr * 2.01, dur: 0.22, peak: pk * 0.18, a: 0.003 });
    }
    // and the motor's note sweeping up under it, quietly
    M.tone(out, { t: t + 0.03, f0: 300, f1: 1500, dur: 0.42, peak: 0.035, a: 0.12 });
    M.burst(out, { t: t + 0.03, dur: 0.35, type: 'bandpass', f0: 5000, f1: 9000, q: 3, peak: 0.015, a: 0.1 });
    if (M.live) setTimeout(() => { try { out.disconnect(); } catch {} }, 1600);
    return 1.1;
  }
  // the engine: the starter turning it over (only at rest: rolling, it bump-starts), then it catching
  let at = t;
  if (!moving) {
    const st = M.osc('sawtooth', 290), stl = M.filt('bandpass', 700, 1.2), sg = M.gain(0), crank = M.osc('square', 11), cg = M.gain(0.035);
    st.connect(stl); stl.connect(sg); sg.connect(out); crank.connect(cg); cg.connect(sg.gain);
    st.frequency.setValueAtTime(240, t); st.frequency.linearRampToValueAtTime(330, t + 0.22);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.05, t + 0.02); sg.gain.setValueAtTime(0.05, t + 0.2); sg.gain.linearRampToValueAtTime(0, t + 0.24);
    for (const s of [st, crank]) { s.start(t); s.stop(t + 0.26); }
    for (let i = 0; i < 3; i++) M.burst(out, { t: t + 0.02 + i * 0.085, dur: 0.06, type: 'lowpass', f0: 380, f1: 140, q: 0.9, peak: 0.16, a: 0.006 });
    at = t + 0.24;
  }
  // the catch: a deep thump and a breath of exhaust
  M.tone(out, { t: at, f0: 85, f1: 38, dur: 0.28, peak: 0.5, a: 0.004 });
  M.burst(out, { t: at, dur: 0.16, type: 'lowpass', f0: 900, f1: 160, q: 0.8, peak: 0.28, a: 0.003, buf: M.brown });
  M.burst(out, { t: at + 0.005, dur: 0.02, f0: 1500, q: 1, peak: 0.12, a: 0.001 });
  if (M.live) setTimeout(() => { try { out.disconnect(); } catch {} }, 1400);
  return (at - t) + 0.6;
}
