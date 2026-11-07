// Mog City: the engine of a car that is not a sports car (a story world's van, truck, SUV or sedan, wagmi/storyrun/ride.js
// vehicleClass), heard from the driver's seat. The owner: "the truck shouldn't make the same noise as the porsche".
// No recordings: the city's own synthesized engines (motors.js, the traffic's: a loop of real four-stroke firing pulses
// per cylinder, its valve and injector clatter, a slow automatic), the kind for the class, brought into the cab:
//   van    the bus's diesel six (motors 'bus': 620 rpm idle, 2900 max, five tall gears), pitched a little up (x1.06),
//          its clatter up, plus a low diesel thrum and a faint turbo whistle that spools with the load
//   truck  the same diesel, lower (x0.9) and harder (more thrum, more clatter)
//   suv    the SUV's petrol six (motors 'suv'), x0.97
//   sedan  the sedan's petrol four (motors 'sedan')
// None has pops, crackle, a limiter or the boost's whine: those are the supercar's (supercar.js). Through the cab: a
// low shelf (+5 dB at 150 Hz, the body's boom) and a low-pass (2.6-5.5 kHz with the load: the bulkhead).
// The motors' sounds are baked in idle time from the first sound on; until they are (seconds, once), only the road.
// createUtility(M, out, cls) -> { update(dt, s) -> state, stop(t), rev(), state, loaded }, the supercar's interface.
const KIND = {
  van: { motor: 'bus', pitch: 1.06, gain: 2.6, thrum: 0.16, whistle: 0.012, diesel: true },
  truck: { motor: 'bus', pitch: 0.9, gain: 2.9, thrum: 0.24, whistle: 0.016, diesel: true },
  suv: { motor: 'suv', pitch: 0.97, gain: 2.5, thrum: 0.05, whistle: 0, diesel: false },
  sedan: { motor: 'sedan', pitch: 1, gain: 2.4, thrum: 0.03, whistle: 0, diesel: false },
};
export const utilityKinds = Object.keys(KIND);

export function createUtility(M, out, cls) {
  const K = KIND[cls] || KIND.sedan;
  const ramp = (p, v, k = 0.05) => p.setTargetAtTime(v, M.now(), k);
  // the cab: the voice -> its level -> boom -> bulkhead -> out
  const level = M.gain(0, out), boom = M.filt('lowshelf', 150, 0.7), wall = M.filt('lowpass', 3000, 0.6);
  boom.gain.value = 5; boom.connect(wall); wall.connect(level);
  const vin = M.gain(K.gain, boom);
  // the diesel's thrum: low rumble under it, following the load
  const S = [];
  const th = M.src(M.brown, { rate: 0.8 }), thl = M.filt('lowpass', 120, 1.2), thg = M.gain(0); th.connect(thl); thl.connect(thg); thg.connect(boom); S.push(th);
  // the turbo: a faint whistle spooling with the load
  const tw = M.osc('sine', 2400), twg = M.gain(0); tw.connect(twg); twg.connect(wall); S.push(tw);
  for (const s of S) s.start();
  let V = null, stopped = false;
  const state = { gear: 1, rpm: 0, load: 0, stuck: 0, kind: cls, motor: K.motor };
  let lastV = null, acc = 0;
  function update(dt, s) {
    if (stopped) return state;
    if (!V && M.motors?.ready(K.motor)) V = M.motors.voice(K.motor, vin);
    const vs = s.speed || 0, v = Math.abs(vs), thr = s.throttle || 0, on = s.on === false ? 0 : 1;
    if (lastV == null) lastV = v;
    acc += (((v - lastV) / Math.max(1e-3, dt)) - acc) * Math.min(1, dt * 6); lastV = v;
    const fwd = vs >= -0.3 ? 1 : -1, gas = thr > 0 ? (fwd > 0 ? thr : 0) : thr < 0 ? (fwd < 0 || v < 0.3 ? -thr : 0) : 0;
    // the load: the throttle as hard as the car is pulling (a heavy car pulls little; a fifth held at a steady speed),
    // a little at a cruise, none off it
    const want = gas > 0 ? gas * Math.min(1, Math.max(0.3, 0.3 + acc / 4)) : Math.min(0.15, v / 200);
    state.load += (want - state.load) * Math.min(1, dt / (want > state.load ? 0.12 : 0.3));
    if (V) { V.update({ speed: v, load: state.load, doppler: K.pitch, seed: 7 }); state.rpm = Math.round(V.rpm || 0); state.gear = vs < -0.3 ? 'R' : (V.gear || 1); }
    ramp(thg.gain, on * (s.mute ? 0 : 1) * K.thrum * (0.35 + 0.65 * state.load) * (V ? 1 : 0));
    ramp(thl.frequency, 90 + (state.rpm || 700) / 40);
    ramp(tw.frequency, 1900 + v * 45 + state.load * 900, 0.2); ramp(twg.gain, on * K.whistle * Math.max(0, state.load - 0.25) * Math.min(1, v / 6), 0.25);
    ramp(wall.frequency, 2600 + 2900 * state.load, 0.08);
    ramp(level.gain, on * (s.mute ? 0.4 : 1), 0.05);
    return state;
  }
  function stop(t = M.now()) {
    stopped = true;
    try { V?.dispose(); } catch {}
    for (const s of S) try { s.stop(t + 0.05); } catch {}
    if (M.live) setTimeout(() => { try { level.disconnect(); } catch {} }, 300);
  }
  return { update, stop, rev() {}, state, get loaded() { return !!V; }, ready: Promise.resolve(true) };
}
