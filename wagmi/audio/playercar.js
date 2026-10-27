// Mog City: Dan's car, heard from the driver's seat. A supercar: its engine (supercar.js) is a V8 voice over a
// virtual six-speed gearbox (revs that climb and drop at each shift, pops on the upshifts, crackle on the overrun, blips
// on the downshifts, the limiter, an idle burble). Over and around it, following the speed (v) and the load (the throttle):
//   turbine  a narrow band of rushing air whistling high, spooling up while the boost burns
//   tyres, grain, wind   the road under it (rougher on kerbs, grass and pavement) and the air over it
//   squeal   two narrow wobbling bands when the tyres let go (hard cornering, braking at speed, a launch, wheelspin)
//   boost    the cold-gas thrusters' hiss in bursts, the rocket's saturated roar, its crackle and its low rumble, lit by a
//            whump; the crackle lingers a moment when it cuts
// ALL ELECTRIC (the drive mode, drivemode.js: WAGMI.setDriveMode / toggleDriveMode): the engine gives way to the
// electric drive (electric.js: the motor's whine, a hum, the pedestrian warning) and the tyres and the wind come up a
// little to carry it; the boost sounds the same. (The motor's whine rises with the speed up to about the top speed and
// only a little past it, evSpeed: on the boost it sings higher, it doesn't scream.) A switch crossfades the two over 0.4 s with its cue (driveCue); the
// one faded out is taken down (a switch back makes it again, in the gear for the speed, the engine catching with a blip).
// The graph exists only while Dan is at the wheel (built when he gets in, taken down a few seconds after he gets out).
// The engine's loops are fetched once, when the mixer starts (ready: a promise for them).
import { createSupercar, preloadEngine } from './supercar.js';
import { createElectric, driveCue } from './electric.js';
import { drive } from './drivemode.js';

const XFADE = 0.4;
// the speed the electric drive's voice is given: the road speed up to 30 m/s, then easing off toward ~44 (34 m/s plays
// as 33.5, the boost's 56 as 42: its whine about 1140 Hz there, not 1500)
const evSpeed = (vs) => { const v = Math.abs(vs); return v <= 30 ? vs : Math.sign(vs) * (30 + 14 * (1 - Math.exp(-(v - 30) / 14))); };

export function createPlayerCar(M, E, dest = M.bus.sfx, opt = {}) {
  const ready = preloadEngine(M.ctx, opt.voice).catch(() => null);
  let G = null, onW = 0, off = 0, burn = 0, tail = 0, gasT = 0, launch = 0, lastBoost = false;
  // the drive mode: the one it plays (mode), how far it is into electric (ev 0..1), the change last seen (seen)
  let mode = drive.mode, ev = mode === 'electric' ? 1 : 0, seen = drive.n, settled = 0;
  const ramp = (p, v, k = 0.04) => p.setTargetAtTime(v, M.now(), k);

  function build() {
    const out = M.gain(0, dest), S = [];
    const add = (s) => (S.push(s), s);
    // the engine and the electric drive each into its own level (the crossfade); only the one heard is made
    const engBus = M.gain(Math.cos(ev * Math.PI / 2), out), evBus = M.gain(Math.sin(ev * Math.PI / 2), out);
    const eng = ev < 1 ? createSupercar(M, engBus, { voice: opt.voice }) : null, elec = ev > 0 ? createElectric(M, evBus) : null;
    const tn = add(M.src(M.white)), tbp = M.filt('bandpass', 2000, 14), tg = M.gain(0); tn.connect(tbp); tbp.connect(tg); tg.connect(out);
    const tw = add(M.osc('sine', 1800)), twg = M.gain(0); tw.connect(twg); twg.connect(out);
    const ty = add(M.src(M.pink)), tlp = M.filt('lowpass', 400, 0.7), tyg = M.gain(0); ty.connect(tlp); tlp.connect(tyg); tyg.connect(out);
    const gr = add(M.src(M.brown)), glp = M.filt('lowpass', 110, 0.8), gg = M.gain(0); gr.connect(glp); glp.connect(gg); gg.connect(out);
    const wn = add(M.src(M.white)), wbp = M.filt('bandpass', 800, 0.5), wng = M.gain(0); wn.connect(wbp); wbp.connect(wng); wng.connect(out);
    const sq = add(M.src(M.white)), sb1 = M.filt('bandpass', 1950, 14), sb2 = M.filt('bandpass', 3300, 11), sqg = M.gain(0), wob = add(M.osc('sine', 6.5)), wobg = M.gain(70);
    sq.connect(sb1); sq.connect(sb2); sb1.connect(sqg); sb2.connect(sqg); sqg.connect(out); wob.connect(wobg); wobg.connect(sb1.frequency); wobg.connect(sb2.frequency);
    const cg = add(M.src(M.white)), chp = M.filt('highpass', 2600, 0.7), cpk = M.filt('peaking', 6000, 1), cgg = M.gain(0); cpk.gain.value = 6; cg.connect(chp); chp.connect(cpk); cpk.connect(cgg); cgg.connect(out);
    const rk = add(M.src(M.brown, { rate: 1.3 })), rlp = M.filt('lowpass', 900, 0.8), rsh = M.shaper(3), rg = M.gain(0); rk.connect(rlp); rlp.connect(rsh); rsh.connect(rg); rg.connect(out);
    const ck = add(M.src(M.crackle)), cbp = M.filt('bandpass', 1600, 0.6), ckg = M.gain(0); ck.connect(cbp); cbp.connect(ckg); ckg.connect(out);
    const rl = add(M.src(M.brown, { rate: 0.6 })), rll = M.filt('lowpass', 70, 0.9), rlg = M.gain(0); rl.connect(rll); rll.connect(rlg); rlg.connect(out);
    for (const s of S) s.start();
    G = { out, S, eng, elec, engBus, evBus, tbp, tg, tw, twg, tlp, tyg, gg, wbp, wng, sb1, sb2, sqg, cgg, rlp, rg, ckg, rlg };
  }
  function teardown() { const t = M.now(); G.eng?.stop(t); G.elec?.stop(t); for (const s of G.S) try { s.stop(t + 0.05); } catch {} const out = G.out; if (M.live) setTimeout(() => { try { out.disconnect(); } catch {} }, 200); G = null; }

  // a switch of the drive mode (seen on the frame after it): its cue, and the crossfade under way
  function follow(s) {
    if (drive.n === seen) return;
    seen = drive.n;
    if (drive.mode === mode) return;
    mode = drive.mode; settled = 0;
    if (!drive.cue) return;
    driveCue(M, dest, mode, { moving: Math.abs(s.speed || 0) > 3 });
    // (going back to the engine: it catches with a blip once the starter has turned it, see below)
    if (mode === 'engine') revAt = Math.abs(s.speed || 0) > 3 ? 0.04 : 0.26;
  }
  let revAt = 0;

  // s: { on, speed m/s (signed), throttle -1..1, boost, latAcc m/s^2, slide 0..1, rough 0..1 (kerb, pavement, grass), jolt (a kerb's bump) }
  function update(dt, s) {
    follow(s);
    if (s.on && !G) { ev = mode === 'electric' ? 1 : 0; build(); }
    if (!G) { ev = mode === 'electric' ? 1 : 0; revAt = 0; return; }
    onW += Math.sign((s.on ? 1 : 0) - onW) * Math.min(Math.abs((s.on ? 1 : 0) - onW), dt / 0.35);
    if (!s.on) { off += dt; if (off > 3 && onW <= 0) { teardown(); return; } } else off = 0;
    const v = Math.abs(s.speed), v01 = Math.min(1, v / 56), th = s.throttle || 0;
    const fwd = s.speed >= -0.5 ? 1 : -1;
    const load = Math.max(0, th * fwd), braking = th * fwd < 0 ? Math.min(1, v / 10) : 0;
    const boost = !!s.boost && th > 0 && s.on;
    // the boost: a whump as it lights, the burn easing up, a crackling tail as it cuts
    if (boost && !lastBoost) { E.play('boostIgnite', { vol: 0.8 }); launch = v < 10 ? 0.6 : 0; }
    if (!boost && lastBoost) tail = 0.6;
    lastBoost = boost;
    burn += ((boost ? 1 : 0) - burn) * Math.min(1, dt / (boost ? 0.12 : 0.3));
    tail = Math.max(0, tail - dt);
    // launches chirp the tyres
    if (s.on && th > 0.5 && v < 4 && !launch) launch = 0.25;
    launch = Math.max(0, launch - dt);
    const on = onW;
    // the drive: the engine (its gearbox reads the speed and the throttle) and/or the electric drive, crossfading; the
    // one not heard is made when the switch starts and taken down once the fade is done
    const evWant = mode === 'electric' ? 1 : 0;
    ev += Math.sign(evWant - ev) * Math.min(Math.abs(evWant - ev), dt / XFADE);
    if (ev < 1 && !G.eng) G.eng = createSupercar(M, G.engBus, { voice: opt.voice });
    if (ev > 0 && !G.elec) G.elec = createElectric(M, G.evBus);
    if (revAt > 0 && G.eng) { G.eng.rev(revAt); revAt = 0; }
    ramp(G.engBus.gain, Math.cos(ev * Math.PI / 2), 0.02); ramp(G.evBus.gain, Math.sin(ev * Math.PI / 2), 0.02);
    const se = G.eng && G.eng.update(dt, { speed: s.speed, throttle: th, on: on > 0.01, mute: evWant === 1 });
    const sv = G.elec && G.elec.update(dt, { speed: evSpeed(s.speed), throttle: th, on: on > 0.01, boost: boost && v < 36 });
    const st = (evWant ? sv : se) || sv || se;
    settled = ev === evWant ? settled + dt : 0;
    if (settled > 0.25) {
      if (ev === 1 && G.eng) { G.eng.stop(M.now()); G.eng = null; }
      if (ev === 0 && G.elec) { G.elec.stop(M.now()); G.elec = null; }
    }
    // the turbine: a whistle spooling up with the burn, over the engine
    ramp(G.tbp.frequency, Math.min(9000, 2200 + v * 70 + burn * 1500)); ramp(G.tg.gain, on * (0.04 * v01 + burn * (0.3 + 0.35 * v01)));
    ramp(G.tw.frequency, 1600 + 2600 * burn + v * 40, 0.25); ramp(G.twg.gain, on * burn * 0.035, 0.2);
    const vr = Math.min(1, v / 30), rough = s.rough || 0;
    // (with no engine over them the road and the air carry it: a little more of each, and of the tyres' top)
    const quiet = 1 + 0.15 * ev;
    ramp(G.tlp.frequency, (260 + v * 20 + rough * 300) * (1 + 0.35 * ev)); ramp(G.tyg.gain, on * (0.32 * Math.pow(vr, 1.3)) * (1 + rough * 0.6) * quiet);
    ramp(G.gg.gain, on * Math.min(1, v / 8) * (0.06 + 0.4 * rough) * (1 + 0.15 * ev));
    ramp(G.wbp.frequency, 600 + v * 26); ramp(G.wng.gain, on * 0.2 * v01 * v01 * quiet);
    const slip = Math.min(1, Math.max(0, ((s.latAcc || 0) - 13) / 14)) + braking * Math.min(1, Math.max(0, (v - 10) / 14)) * 0.7 + (launch > 0 ? 0.55 : 0) + (s.slide || 0) + (st.stuck > 0.5 ? 0.6 : 0);
    ramp(G.sqg.gain, on * 0.55 * Math.min(1, slip), 0.03);
    ramp(G.sb1.frequency, 1800 + 400 * Math.min(1, slip)); ramp(G.sb2.frequency, 3100 + 500 * Math.min(1, slip));
    // the cold gas: bursts while it burns
    gasT -= dt;
    if (gasT <= 0) { gasT = 0.05 + Math.random() * 0.14; ramp(G.cgg.gain, on * burn * (Math.random() < 0.55 ? 0.3 : 0.07), 0.015); }
    ramp(G.rlp.frequency, 650 + 700 * burn);
    ramp(G.rg.gain, on * 0.34 * burn, 0.03);
    ramp(G.ckg.gain, on * (0.4 * burn + 0.5 * tail), 0.03);
    ramp(G.rlg.gain, on * 0.45 * burn, 0.05);
    ramp(G.out.gain, 1, 0.05);
    if (s.jolt > 0.02 && s.on) E.play('kerb', { k: Math.min(1, s.jolt), vol: 0.9 });
  }
  return {
    update, ready, get built() { return !!G; }, get mode() { return mode; },
    get engine() {
      if (!G) return null;
      const x = mode === 'electric' ? G.elec || G.eng : G.eng || G.elec;
      return { mode, ev: +ev.toFixed(2), gear: x.state.gear, rpm: Math.round(x.state.rpm), load: +x.state.load.toFixed(2), loops: G.eng ? G.eng.loaded : null, voices: (G.eng ? 1 : 0) + (G.elec ? 1 : 0) };
    },
  };
}
