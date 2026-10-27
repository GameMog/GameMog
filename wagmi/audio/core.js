// Mog City: the mixer under every sound in the game. One context, four buses into a master and a limiter:
//   sfx    hits, horns, doors, footsteps, jingles (and the fight's and the cutscenes' own synths, routed in)
//   amb    the city: its bed, the traffic, the sirens; muffled while Dan is inside his car
//   music  the radio;  voice  the cast's lines
// each bus a gain (its level) then a duck (duck(bus, amount, secs) dips it and lets it back up). A street-canyon reverb
// (slap-back off the walls, then a short diffuse tail) takes sends from anything far away.
// Sound in the world is placed relative to the camera, cheaply: a gain by distance (inverse, from `ref` metres), a stereo
// pan by bearing, a low-pass for the air (and a little more behind the camera), and doppler on what moves.
// Nothing here knows the game: createMixer(ctx) works on an OfflineAudioContext too (the montages are rendered that way).
export const C_SOUND = 343;

export function createMixer(ctx) {
  const M = { ctx, sr: ctx.sampleRate, live: !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) };
  M.now = () => ctx.currentTime;

  /* ------------------------------------------------------------ the buses -- */
  const master = ctx.createGain(); master.gain.value = 0.9;
  // glue, then a fast limiter: nothing past the ceiling however much piles up (a crash in a siren in a horn jam)
  const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -14; glue.knee.value = 8; glue.ratio.value = 3; glue.attack.value = 0.006; glue.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  const trim = ctx.createGain(); trim.gain.value = 0.94;
  // (hold: the whole mix faded out for a pause, see M.hold; apart from master so a volume setting never meets it)
  const hold = ctx.createGain();
  master.connect(hold); hold.connect(glue); glue.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
  const LEVEL = { sfx: 0.9, amb: 0.62, music: 0.7, voice: 1 };
  const bus = {}, duckNode = {};
  // the amb bus's muffle (inside the car): a low-pass and a dip
  const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
  const muffleGain = ctx.createGain();
  for (const k of Object.keys(LEVEL)) {
    const g = ctx.createGain(); g.gain.value = LEVEL[k];
    const d = ctx.createGain(); d.gain.value = 1;
    if (k === 'amb') { g.connect(muffle); muffle.connect(muffleGain); muffleGain.connect(d); } else g.connect(d);
    d.connect(master);
    bus[k] = g; duckNode[k] = d;
  }
  bus.master = master;
  M.bus = bus;

  // the street's reverb: early slaps off the facades, then a tail whose highs die first
  const verb = ctx.createConvolver();
  {
    const sr = M.sr, len = Math.floor(sr * 1.7), ir = ctx.createBuffer(2, len, sr);
    const taps = [[0.019, 0.5], [0.033, 0.38], [0.051, 0.32], [0.074, 0.24], [0.103, 0.2], [0.141, 0.14], [0.19, 0.1]];
    for (let c = 0; c < 2; c++) {
      const b = ir.getChannelData(c); let lp = 0, seed = 1234 + c * 77;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      for (let i = 0; i < len; i++) {
        const t = i / sr, k = Math.min(0.92, 0.25 + t * 0.9);   // the tail darkens as it goes
        lp = lp * k + rnd() * (1 - k);
        b[i] = t < 0.012 ? 0 : lp * 2.2 * Math.exp(-t * 4.4) * Math.min(1, (t - 0.012) / 0.03);
      }
      for (const [t, a] of taps) { const i = Math.floor((t + (c ? 0.0037 : 0)) * sr); b[i] += a * (c ? 0.9 : 1); b[i + 1] -= a * 0.4; }
    }
    verb.buffer = ir;
  }
  const verbIn = ctx.createGain(); verbIn.gain.value = 0.55;
  const verbHp = ctx.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 160;
  verbIn.connect(verbHp); verbHp.connect(verb); verb.connect(muffle);
  M.verbIn = verbIn;

  // duck a bus by `amount` (0..1) for `secs`, back up after; amount 0 lets it straight back up
  const ducks = {};
  M.duck = (name, amount = 0.5, secs = 1) => {
    const d = duckNode[name]; if (!d) return;
    const t = ctx.currentTime, until = amount > 0 ? t + secs : t;
    const cur = ducks[name];
    // a deeper or longer duck wins over the one in hand
    const depth = cur && cur.until > t ? Math.max(cur.depth, amount) : amount;
    ducks[name] = { depth, until: Math.max(until, cur && cur.until > t ? cur.until : 0) };
    d.gain.cancelScheduledValues(t); d.gain.setValueAtTime(d.gain.value, t);
    d.gain.setTargetAtTime(1 - depth, t, 0.06);
    d.gain.setTargetAtTime(1, ducks[name].until, 0.35);
  };
  // inside the car (k 0..1): the city's highs and level go
  M.inside = (k) => {
    const t = ctx.currentTime;
    muffle.frequency.setTargetAtTime(20000 * Math.pow(1500 / 20000, k), t, 0.12);
    muffleGain.gain.setTargetAtTime(1 - 0.42 * k, t, 0.12);
  };
  M.setLevel = (name, v) => { const g = bus[name]; if (g) g.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
  // a pause: hold(true) fades everything out in a few ms and then stops the context where it is (a line half said, a
  // loop, a fade: each goes on from that point after); hold(false) puts the ducks back as they were and fades it all in
  // (the caller resumes the context: it knows whether the page may make sound yet)
  let held = null;
  M.hold = (on) => {
    if (!M.live || !!on === !!held) return;
    const t = ctx.currentTime, p = hold.gain;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
    if (on) {
      held = { ducks: JSON.parse(JSON.stringify(ducks)) };
      p.linearRampToValueAtTime(0, t + 0.06);
      held.timer = setTimeout(() => { if (held) ctx.suspend().catch(() => {}); }, 90);
      return;
    }
    clearTimeout(held.timer);
    for (const name of Object.keys(duckNode)) {
      const d = duckNode[name].gain, s = held.ducks[name];
      d.cancelScheduledValues(t);
      if (s && s.until > t) { d.setValueAtTime(1 - s.depth, t); d.setTargetAtTime(1, s.until, 0.35); ducks[name] = s; }
      else { d.setValueAtTime(1, t); delete ducks[name]; }
    }
    held = null;
    p.linearRampToValueAtTime(1, t + 0.2);
  };
  M.held = () => !!held;

  /* ---------------------------------------------------------- the buffers -- */
  const sr = M.sr;
  let seed = 9001;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const mono = (secs, fill) => { const b = ctx.createBuffer(1, Math.floor(sr * secs), sr); fill(b.getChannelData(0)); return b; };
  M.white = mono(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = rnd(); });
  M.pink = mono(4, (d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  });
  M.brown = mono(4, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * rnd()) / 1.02; d[i] = l * 3.5; } });
  // a rocket's crackle: sparse sharp pops of random size over a faint fizz
  M.crackle = mono(2, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 0.04;
    for (let n = 0; n < 420; n++) {
      const at = Math.floor((rnd() * 0.5 + 0.5) * (d.length - 400)), a = Math.pow(rnd() * 0.5 + 0.5, 3) * 0.95, len = 30 + Math.floor((rnd() * 0.5 + 0.5) * 220);
      for (let j = 0; j < len; j++) d[at + j] += a * rnd() * Math.exp(-j / (len * 0.25));
    }
  });
  // (the crowd's walla, the recorded crowd bed: M.babble once it is fetched and decoded, see city.js)
  M.babble = null;

  /* ------------------------------------------------------------- the parts -- */
  const R = Math.random;
  M.R = R;
  M.rr = (a, b) => a + (b - a) * R();
  M.pick = (a) => a[Math.floor(R() * a.length)];
  M.gain = (v = 1, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  M.filt = (type, f, q = 0.7, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; };
  M.osc = (type, f, to) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); return o; };
  M.pan = (p, to) => { const n = ctx.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); if (to) n.connect(to); return n; };
  M.src = (buf = M.white, { loop = true, rate = 1, to } = {}) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rate; if (to) s.connect(to); return s; };
  // an envelope: silence, up to peak in a, down to nothing over d (exponential both ways)
  M.env = (p, t, a, peak, d, hold = 0) => {
    p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
    if (hold) p.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + Math.max(0.005, d)); p.setValueAtTime(0, t + a + hold + d + 0.01);
  };
  // a band of noise, its filter swept f0 -> f1
  M.burst = (to, { t = ctx.currentTime, dur = 0.1, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, peak = 0.5, a = 0.003, hold = 0, buf = M.white, rate = 1 }) => {
    const s = M.src(buf, { rate: rate * (0.9 + R() * 0.2) }), f = M.filt(type, f0, q), g = M.gain(0);
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + hold + dur);
    M.env(g.gain, t, a, peak, dur, hold); s.connect(f); f.connect(g); g.connect(to);
    s.start(t, R() * (buf.duration - 0.5)); s.stop(t + a + hold + dur + 0.05);
    return g;
  };
  // a tone, its pitch swept f0 -> f1
  M.tone = (to, { t = ctx.currentTime, f0 = 440, f1 = f0, dur = 0.2, type = 'sine', a = 0.003, peak = 0.5, hold = 0, detune = 0 }) => {
    const o = M.osc(type, f0), g = M.gain(0); o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + a + hold + dur);
    M.env(g.gain, t, a, peak, dur, hold); o.connect(g); g.connect(to); o.start(t); o.stop(t + a + hold + dur + 0.05);
    return o;
  };
  // ringing modes (metal, wood, glass): base x ratios, each decaying on its own
  M.modes = (to, { t = ctx.currentTime, base, ratios, decays, gains, peak = 0.3 }) => {
    ratios.forEach((r, i) => M.tone(to, { t, f0: base * r * (1 + (R() - 0.5) * 0.01), dur: decays[i] ?? decays[decays.length - 1], peak: peak * (gains ? gains[i] : 1 / (1 + i * 0.6)), a: 0.0015 }));
  };
  // a soft clipper
  M.shaper = (amt = 2, to) => {
    const s = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amt) / Math.tanh(amt); }
    s.curve = c; s.oversample = '2x'; if (to) s.connect(to); return s;
  };

  /* ------------------------------------------------------- the listener -- */
  // where the camera is (ears), its right and forward, and how fast it moves (for doppler)
  const L = (M.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, fx: 0, fy: 0, fz: -1, vx: 0, vy: 0, vz: 0 });
  // a point's place in the mix
  M.where = (x, y, z, ref = 6) => {
    const dx = x - L.x, dy = y - L.y, dz = z - L.z, d = Math.max(0.5, Math.hypot(dx, dy, dz));
    const side = (dx * L.rx + dy * L.ry + dz * L.rz) / d, front = (dx * L.fx + dy * L.fy + dz * L.fz) / d;
    const g = ref / Math.max(ref, d);
    const lp = Math.min(19000, 19000 / (1 + d / 32)) * (front < 0 ? 0.55 + 0.45 * (1 + front) : 1);
    return { d, g, pan: side * 0.82, lp, front };
  };
  // the doppler factor of a source at (x, z) moving (vx, vz), heard by the listener
  M.doppler = (x, y, z, vx = 0, vz = 0) => {
    const dx = L.x - x, dy = L.y - y, dz = L.z - z, d = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / d, uz = dz / d, vs = vx * ux + vz * uz, vl = -(L.vx * ux + L.vz * uz);
    return Math.max(0.75, Math.min(1.3, (C_SOUND + vl) / Math.max(200, C_SOUND - vs)));
  };
  // a placed source: in -> air -> pan -> dest, and a send to the reverb that grows with distance
  M.spot = (dest, pos, { ref = 6, verb: wet = 0.3 } = {}) => {
    const inp = ctx.createGain(), air = M.filt('lowpass', 18000, 0.5), pn = ctx.createStereoPanner(), dist = ctx.createGain(), send = ctx.createGain();
    inp.connect(air); air.connect(dist); dist.connect(pn); pn.connect(dest); dist.connect(send); send.connect(verbIn);
    const S = {
      in: inp, ref, pos: pos ? [...pos] : null, d: 0,
      set(p, k = 0.04) {
        if (p) S.pos = p;
        if (!S.pos) return S;
        const w = M.where(S.pos[0], S.pos[1] ?? 1, S.pos[2], S.ref), t = ctx.currentTime;
        S.d = w.d;
        if (k <= 0) { dist.gain.value = w.g; pn.pan.value = w.pan; air.frequency.value = w.lp; send.gain.value = wet * Math.min(1, 0.25 + w.d / 70); }
        else { dist.gain.setTargetAtTime(w.g, t, k); pn.pan.setTargetAtTime(w.pan, t, k); air.frequency.setTargetAtTime(w.lp, t, k); send.gain.setTargetAtTime(wet * Math.min(1, 0.25 + w.d / 70), t, k); }
        return S;
      },
      // (a spot without a world position: a fixed pan and distance)
      fixed(pan, d, k = 0) {
        const g = S.ref / Math.max(S.ref, d), lp = Math.min(19000, 19000 / (1 + d / 32)), sv = wet * Math.min(1, 0.25 + d / 70), t = ctx.currentTime;
        if (k <= 0) { dist.gain.value = g; pn.pan.value = pan; air.frequency.value = lp; send.gain.value = sv; }
        else { dist.gain.setTargetAtTime(g, t, k); pn.pan.setTargetAtTime(pan, t, k); air.frequency.setTargetAtTime(lp, t, k); send.gain.setTargetAtTime(sv, t, k); }
        S.d = d; return S;
      },
      off() { for (const n of [inp, air, dist, pn, send]) try { n.disconnect(); } catch {} },
    };
    return pos ? S.set(pos, 0) : S;
  };
  return M;
}
