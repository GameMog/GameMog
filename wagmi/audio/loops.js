// Mog City: the sounds that keep going. Each is fn(M, out) -> { set(o), stop(secs), sources }: it plays into `out`
// (already placed); set() takes what it understands (vol, rate, speed m/s, load 0..1, dop the doppler factor, mode).
//   siren    an NYPD siren through its horn speaker: mode 'wail' (a slow rise and fall), 'yelp' (fast), 'phaser'
//            (faster still) or 'off'
//   carHum   a car's engine (motors.js, after Slop New York: its firing, its gears, its tyres at speed; speed, load,
//            dop, kind 'sedan' | 'suv' | 'bus'), for whoever drives one (the chase's cars); silent until its sound is made
//   busHum   the same, a bus's diesel
//   hum      the old synthesised car hum (a saw at the firing rate and the tyres' hiss), kept for anyone who wants one
//   rumble, wind, hiss, roar, squeal, crowd   plain beds (a deep traffic roar, rushing air, a jet of gas, a rocket,
//            tyres screaming, a crowd's walla: the city's recorded one once it is loaded) for anyone who needs one
const ramp = (M, p, v, k = 0.05) => p.setTargetAtTime(v, M.now(), k);
function finish(M, out, sources) {
  return (secs = 0.3) => {
    const t = M.now();
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + secs);
    for (const s of sources) try { s.stop(t + secs + 0.05); } catch {}
    if (M.live) setTimeout(() => { try { out.disconnect(); } catch {} }, (secs + 0.2) * 1000);
  };
}

export const LOOPS = {
  siren(M, dest) {
    const out = M.gain(0, dest);
    const o1 = M.osc('square', 1000), o2 = M.osc('sawtooth', 1000), lfo = M.osc('sine', 0.21), depth = M.gain(420);
    o2.detune.value = 9; lfo.connect(depth); depth.connect(o1.frequency); depth.connect(o2.frequency);
    const mix = M.gain(0.35), sh = M.shaper(1.6), horn = M.filt('peaking', 1700, 1.1), hp = M.filt('highpass', 480, 0.8), lp = M.filt('lowpass', 4300, 0.7);
    horn.gain.value = 7;
    o1.connect(mix); o2.connect(mix); mix.connect(sh); sh.connect(horn); horn.connect(hp); hp.connect(lp); lp.connect(out);
    const MODES = { wail: ['sine', 0.21, 950, 420], yelp: ['triangle', 3.3, 1000, 380], phaser: ['triangle', 10.5, 1050, 260] };
    let mode = 'wail', dop = 1, vol = 0.5;
    const sources = [o1, o2, lfo]; for (const s of sources) s.start();
    const apply = () => {
      const m = MODES[mode] || MODES.wail;
      if (lfo.type !== m[0]) lfo.type = m[0];
      ramp(M, lfo.frequency, m[1], 0.02); ramp(M, o1.frequency, m[2] * dop, 0.03); ramp(M, o2.frequency, m[2] * dop, 0.03); ramp(M, depth.gain, m[3] * dop, 0.03);
      ramp(M, out.gain, mode === 'off' ? 0 : vol, mode === 'off' ? 0.12 : 0.05);
    };
    apply();
    return { sources, set(o = {}) { if (o.mode) mode = o.mode; if (o.dop) dop = o.dop; if (o.vol != null) vol = o.vol; apply(); }, stop: finish(M, out, sources), get mode() { return mode; } };
  },

  carHum(M, dest) { return motorLoop(M, dest, 'sedan'); },
  busHum(M, dest) { return motorLoop(M, dest, 'bus'); },

  hum(M, dest) {
    const out = M.gain(0, dest);
    // (the engine is what says "a car": its firing and the half-order lope under it, through the exhaust's body; the
    // tyres' band is kept under it, or a street of them passing is surf)
    const e1 = M.osc('sawtooth', 32), e2 = M.osc('square', 16), e2g = M.gain(0.35), body = M.filt('peaking', 220, 1.5), elp = M.filt('lowpass', 260, 1.1), ehp = M.filt('highpass', 45, 0.7), eg = M.gain(0.2);
    body.gain.value = 7;
    e1.connect(body); e2.connect(e2g); e2g.connect(body); body.connect(elp); elp.connect(ehp); ehp.connect(eg); eg.connect(out);
    const rb = M.src(M.brown), rlp = M.filt('lowpass', 150, 0.7), rg = M.gain(0.3); rb.connect(rlp); rlp.connect(rg); rg.connect(out);
    const ty = M.src(M.pink), tbp = M.filt('bandpass', 900, 1.1), tg = M.gain(0); ty.connect(tbp); tbp.connect(tg); tg.connect(out);
    const sources = [e1, e2, rb, ty]; for (const s of sources) s.start(0, M.R() * 1.5);
    return {
      sources,
      set({ speed = 0, load = 0.3, dop = 1, vol } = {}) {
        const v = Math.abs(speed), f = (27 + v * 3.3 + load * 9) * dop;
        ramp(M, e1.frequency, f); ramp(M, e2.frequency, f / 2); ramp(M, body.frequency, 180 + v * 6);
        ramp(M, elp.frequency, 220 + 650 * load + v * 16);
        ramp(M, eg.gain, 0.03 + 0.06 * load);
        ramp(M, rg.gain, 0.03 + 0.06 * Math.min(1, v / 12));
        ramp(M, tbp.frequency, (650 + v * 30) * dop);
        ramp(M, tg.gain, 0.4 * Math.pow(Math.min(1, v / 14), 1.4));
        if (vol != null) ramp(M, out.gain, vol, 0.06);
      },
      stop: finish(M, out, sources),
    };
  },

  // a helicopter: the blades' thud (a low roar chopped ~11 times a second) and the turbine's whine
  heli(M, dest) {
    const out = M.gain(0, dest);
    const n = M.src(M.brown), lp = M.filt('lowpass', 320, 0.8), g = M.gain(0), chop = M.osc('square', 11.5), cg = M.gain(0.5);
    n.connect(lp); lp.connect(g); g.connect(out); chop.connect(cg); cg.connect(g.gain);
    const thud = M.osc('sine', 23), tg = M.gain(0.35); thud.connect(tg); tg.connect(out);
    const tw = M.osc('sine', 3100), twg = M.gain(0.008); tw.connect(twg); twg.connect(out);
    const sources = [n, chop, thud, tw]; for (const s of sources) s.start();
    return { sources, set({ vol } = {}) { if (vol != null) ramp(M, out.gain, vol, 0.1); }, stop: finish(M, out, sources) };
  },

  // (plain beds)
  rumble(M, dest) { return bed(M, dest, M.brown, 'lowpass', 180, 0.7); },
  wind(M, dest) { return bed(M, dest, M.pink, 'bandpass', 900, 0.6); },
  hiss(M, dest) { return bed(M, dest, M.white, 'highpass', 3000, 0.7); },
  roar(M, dest) { return bed(M, dest, M.brown, 'lowpass', 700, 0.9, 2.5); },
  squeal(M, dest) { return bed(M, dest, M.white, 'bandpass', 2400, 12); },
  crowd(M, dest) { return M.babble ? bed(M, dest, M.babble, 'lowpass', 9000, 0.5) : bed(M, dest, M.pink, 'bandpass', 900, 0.5); },
};
LOOPS.engine = LOOPS.carHum; LOOPS.traffic = LOOPS.rumble;

// an engine from motors.js as a loop: made once its kind's sound is ready, its revs updated ~15 times a second however
// often it is set; (o.kind chooses the engine until it is made)
const MOTOR_LEVEL = 0.65;   // (as loud as the old hum at the same vol)
function motorLoop(M, dest, kind0) {
  const out = M.gain(0, dest);
  let mv = null, kind = kind0, last = -1, speed = 0, load = 0.3, dop = 1, gone = false;
  const seed = M.R();
  return {
    sources: [],
    wantsDop: true,
    get engine() { return mv ? kind : null; },
    set(o = {}) {
      if (gone) return;
      if (o.kind && !mv) kind = o.kind;
      if (o.speed != null) speed = Math.abs(o.speed);
      if (o.load != null) load = o.load;
      if (o.dop) dop = o.dop;
      if (!mv && M.motors?.ready(kind)) mv = M.motors.voice(kind, out);
      const now = M.now();
      if (mv && (last < 0 || now - last >= 0.06)) { last = now; mv.update({ speed, load, doppler: dop, seed }, now); }
      if (o.vol != null) ramp(M, out.gain, o.vol * MOTOR_LEVEL, 0.06);
    },
    stop(secs = 0.3) {
      if (gone) return; gone = true;
      const t = M.now();
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + secs);
      const end = () => { mv?.dispose(); try { out.disconnect(); } catch {} };
      if (M.live) setTimeout(end, (secs + 0.2) * 1000); else end();
    },
  };
}

function bed(M, dest, buf, type, f, q, drive = 0) {
  const out = M.gain(0, dest), s = M.src(buf), fl = M.filt(type, f, q);
  s.connect(fl);
  if (drive) { const sh = M.shaper(drive); fl.connect(sh); sh.connect(out); } else fl.connect(out);
  s.start(0, M.R() * Math.max(0.1, buf.duration - 0.2));
  return {
    sources: [s],
    set({ vol, rate, f: ff } = {}) { if (vol != null) ramp(M, out.gain, vol, 0.06); if (rate) ramp(M, s.playbackRate, rate, 0.06); if (ff) ramp(M, fl.frequency, ff, 0.06); },
    stop: finish(M, out, [s]),
  };
}
