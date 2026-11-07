// Mog City: the car's ALL ELECTRIC (the quiet mode, drivemode.js): no exhaust, no gearbox, no revs, no pops. One motor
// geared straight to the wheels, heard faintly from the cabin (the owner, 6 Nov: "more monotone and quietly ... it
// should have electric motor", not an engine with revs):
//   whine     the motor and its reduction gear: one clean high note (two orders over it, faint) that glides with the road
//             speed over a narrow range, about 520 Hz rolling to 700 at the top speed (half an octave; the boost's
//             speed only a little higher), never stepping: no gears, no launch flare, no wheelspin bounce. Its pitch
//             follows the speed only (not the pedal) and slowly; its level comes up with the speed and only a touch
//             with the torque (pulling or the regen giving back), so a stab of the throttle swells it, never revs it
//   inverter  a soft low hum under it while it is on (a steady 100 Hz and its octave, a faint high switching fizz),
//             a touch up with the torque, never changing pitch
// About 11 dB under the engine mode's engine. The tyres and the wind (playercar.js) carry the speed; the boost's
// thrusters keep their own sound.
// createElectric(M, out) -> { update(dt, s) -> state, stop(t), state } (as createSupercar: s { speed, throttle, on })
//   state.f: the whine's note now (Hz)
// driveCue(M, dest, mode, { moving, t }) -> its length: the switch's cue ('electric' a contactor's click and a soft
// chime; 'engine' the starter (at rest), the engine catching; the car's own engine adds the blip)

// the whine's note (Hz) for the motor's speed (as road speed, m/s): 520 rolling, 700 at the top speed (34), the
// boost's 42 about 715; a smooth curve, flattening as it goes
const F_LO = 520, F_UP = 180, F_K = 20;
export const whineHz = (m) => F_LO + F_UP * (1 - Math.exp(-Math.abs(m) / F_K)) / (1 - Math.exp(-34 / F_K));
// levels (into the drive's bus): the whine at speed, the hum, the fizz under torque
const WHINE = 0.03, HUM = 0.011, FIZZ = 0.004;

export function createElectric(M, out) {
  const now = () => M.now();
  const ramp = (p, v, k = 0.03) => p.setTargetAtTime(v, now(), k);
  const level = M.gain(0, out), src = [];
  const add = (s) => (src.push(s), s);
  // the whine: a pure note and two faint orders over it (the reduction gear), through the cabin's top cut
  const wl = M.filt('lowpass', 2600, 0.5, level), wg = M.gain(0, wl);
  const w = [[1, 1], [2, 0.2], [3, 0.06]].map(([ord, amp]) => ({ ord, o: add(M.osc('sine', whineHz(0) * ord, M.gain(amp, wg))) }));
  // the inverter: its hum (100 Hz and its octave, low-passed) and a faint high fizz of its switching
  const hl = M.filt('lowpass', 420, 0.6, level), hg = M.gain(0, hl);
  add(M.osc('sine', 100, hg)); add(M.osc('sine', 200, M.gain(0.35, hg)));
  const fz = add(M.src(M.white)), fbp = M.filt('bandpass', 7800, 6), fg = M.gain(0, level); fz.connect(fbp); fbp.connect(fg);
  for (const s of src) s.start(now(), s.buffer ? M.R() * 1.5 : undefined);

  // the motor: its speed (as road speed, m/s), the torque it makes (-1 regen .. 1), the whine's note
  const S = { gear: 'D', rpm: 0, load: 0, torque: 0, motor: 0, f: whineHz(0), stuck: 0, rev: false };
  let stopped = false;

  // s: { speed (m/s, signed), throttle -1..1, on, boost }
  function update(dt, s) {
    const vs = s.speed || 0, v = Math.abs(vs), th = s.throttle || 0, on = s.on === false ? 0 : 1;
    const fwd = vs >= -0.3 ? 1 : -1;
    const gas = th > 0 ? (fwd > 0 ? th : 0) : th < 0 ? (fwd < 0 || v < 0.3 ? -th : 0) : 0;
    const braking = th !== 0 && gas === 0 && v > 0.5;
    S.rev = vs < -0.3 || (th < 0 && v < 0.3); S.gear = S.rev ? 'R' : 'D';
    // (against a wall the traction control holds the wheels: the motor stays with the road speed)
    S.stuck = gas > 0.5 && v < 3 ? S.stuck + dt : 0;
    S.motor += (v - S.motor) * Math.min(1, dt * 6);
    // the torque: the throttle's pull, the regen's push back lifting off (light) and braking (stronger)
    const want = gas > 0 ? gas * (s.boost ? 1 : 0.7) : braking ? -0.6 : v > 1.5 ? -0.2 * Math.min(1, v / 12) : 0;
    S.torque += (want - S.torque) * Math.min(1, dt / 0.25);
    S.load = Math.abs(S.torque);
    S.rpm = S.motor * 520;   // (as a 9:1 reduction on a 0.35 m wheel)
    S.f = whineHz(S.motor);
    voice(on);
    return S;
  }

  function voice(on) {
    const m = S.motor, k = S.load;
    // the note glides with the speed (slowly: no step anywhere); the level comes up with the speed, a touch with torque
    for (const x of w) ramp(x.o.frequency, S.f * x.ord, 0.2);
    const r = Math.min(1, m / 7), rise = r * r * (3 - 2 * r), top = Math.min(1, m / 34);
    ramp(wg.gain, on * WHINE * rise * (0.75 + 0.25 * top) * (0.8 + 0.25 * k), 0.25);
    ramp(hg.gain, on * HUM * (0.85 + 0.3 * k), 0.25);
    ramp(fg.gain, on * FIZZ * k * Math.max(0.3, 1 - m / 30), 0.25);
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
    // and the inverter waking under it, a breath of its fizz (no sweep: nothing that revs)
    M.burst(out, { t: t + 0.03, dur: 0.3, type: 'bandpass', f0: 7800, q: 4, peak: 0.012, a: 0.08 });
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
