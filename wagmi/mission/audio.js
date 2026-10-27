// Mog City: the cutscenes' and missions' sound, synthesised with WebAudio (no audio files): the city's bed, a distant
// siren, a tension pad, title stingers, a van's engine and its bass, tyre squeal, the sliding door, a shove and a fall,
// a phone buzzing and ringing, a small dog's bark, a caller's murmur, voices mumbling the lines, the mission jingles. Browsers keep audio off until
// a gesture: unlock() from one (the start gate's key) and everything after it plays.
//   const sfx = createAudio(); sfx.unlock();  sfx.play('squeal', { dur: 1.2, gain: 0.5 });  const e = sfx.engine(); e.set(rpm, gain)
export function createAudio() {
  let ctx = null, master, comp, verb, verbIn, noiseBuf, brownBuf;
  const live = [];
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    // (the game's one mixer when it is there: its context, into its sfx bus)
    const A = window.WAGMI?.audio;
    ctx = A?.ctx || new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(A?.ctx === ctx && A.bus?.sfx ? A.bus.sfx : ctx.destination);
    // a plate-ish reverb: decaying stereo noise
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.5; verbIn.connect(verb); verb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    brownBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    { const d = brownBuf.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
    return ctx;
  }
  const now = () => ctx.currentTime;
  const gain = (v = 1, to = master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
  const send = (node, wet = 0.3) => { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(verbIn); return g; };
  const noise = (buf = noiseBuf, loop = true) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  const env = (g, t0, a, peak, d, end = 0.0001) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); };
  const pan = (p = 0, to = master) => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(to); return n; };

  const S = {
    // a whoosh into a title
    whoosh({ gain: v = 0.25, dur = 0.7 } = {}) {
      const t = now(), n = noise(), f = filt('bandpass', 300, 1.2), g = gain(0); n.connect(f); f.connect(g); send(g, 0.4);
      f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.7); f.frequency.exponentialRampToValueAtTime(900, t + dur);
      env(g, t, dur * 0.6, v, dur * 0.5); n.start(t); n.stop(t + dur * 1.2);
    },
    // the title's hit: a sub boom, a brassy minor chord opening up, a crash tail
    stinger({ gain: v = 0.5, notes = [146.83, 174.61, 220, 293.66] } = {}) {
      const t = now();
      const b = osc('sine', 110), bg = gain(0); b.connect(bg); b.frequency.setValueAtTime(120, t); b.frequency.exponentialRampToValueAtTime(38, t + 0.9);
      env(bg, t, 0.01, v * 1.2, 1.4); b.start(t); b.stop(t + 1.6);
      const lp = filt('lowpass', 400, 2), cg = gain(0); lp.connect(cg); send(cg, 0.6);
      lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3500, t + 0.18); lp.frequency.exponentialRampToValueAtTime(700, t + 2.2);
      for (const f of notes) for (const d of [-7, 7]) { const o = osc('sawtooth', f); o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + 3); }
      env(cg, t, 0.03, v * 0.35, 2.8);
      const n = noise(), hp = filt('highpass', 4000), ng = gain(0); n.connect(hp); hp.connect(ng); send(ng, 0.5); env(ng, t, 0.005, v * 0.25, 1.6); n.start(t); n.stop(t + 2);
    },
    // the title's glint (a start on it, index.html and mission/ui.js): a bright metal ring of four partials, a breath of
    // high noise sweeping up under it (index.html makes the same before this module is in)
    shing({ gain: v = 0.3 } = {}) {
      const t = now();
      for (const [f, a, d] of [[2637, 1, 0.9], [3951, 0.6, 0.7], [5274, 0.45, 0.5], [6645, 0.3, 0.35]]) { const o = osc('sine', f), g = gain(0); o.connect(g); send(g, 0.45); env(g, t, 0.002, v * a * 0.5, d); o.start(t); o.stop(t + d + 0.1); }
      const n = noise(), hp = filt('highpass', 3500), g = gain(0); n.connect(hp); hp.connect(g); send(g, 0.3);
      hp.frequency.setValueAtTime(3500, t); hp.frequency.exponentialRampToValueAtTime(9000, t + 0.25); env(g, t, 0.008, v * 0.35, 0.28); n.start(t); n.stop(t + 0.4);
    },
    // a deep boom (the title blown out into the trailer's black): a sub falling 95 to 34 Hz, a dark thump of noise on it
    boom({ gain: v = 0.55, at = 0 } = {}) {
      const t = now() + at, o = osc('sine', 95), g = gain(0); o.connect(g); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.7);
      env(g, t, 0.008, v, 0.9); o.start(t); o.stop(t + 1.1);
      const n = noise(brownBuf), lp = filt('lowpass', 260), ng = gain(0); n.connect(lp); lp.connect(ng); send(ng, 0.3); env(ng, t, 0.005, v * 0.9, 0.45); n.start(t); n.stop(t + 0.7);
    },
    // a short hit (a cut, a caption)
    hit({ gain: v = 0.25 } = {}) {
      const t = now(), o = osc('sine', 90), g = gain(0); o.connect(g); o.frequency.exponentialRampToValueAtTime(45, t + 0.25); env(g, t, 0.005, v, 0.35); o.start(t); o.stop(t + 0.5);
      const n = noise(), f = filt('bandpass', 1800, 0.8), ng = gain(0); n.connect(f); f.connect(ng); send(ng, 0.3); env(ng, t, 0.002, v * 0.4, 0.12); n.start(t); n.stop(t + 0.2);
    },
    // tyres: a band of noise screaming, wobbling in pitch
    squeal({ gain: v = 0.35, dur = 1.0, p = 0 } = {}) {
      const t = now(), n = noise(), f1 = filt('bandpass', 2300, 9), f2 = filt('bandpass', 4100, 7), g = gain(0, pan(p)); n.connect(f1); n.connect(f2); f1.connect(g); f2.connect(g); send(g, 0.25);
      const lfo = osc('sine', 9), lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f1.frequency); lfo.start(t); lfo.stop(t + dur + 0.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.06); g.gain.setValueAtTime(v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.start(t); n.stop(t + dur + 0.1);
    },
    // the sliding door: a rolling rattle along the rail, the latch, the thud at the end of travel
    doorSlide({ gain: v = 0.4, dur = 0.55 } = {}) {
      // (the rattle: the envelope, then a gain that a square wave swings between 0.1 and 1, so the level stays the envelope's)
      const t = now(), n = noise(), f = filt('bandpass', 900, 1.4), g = gain(0), rat = ctx.createGain(); rat.gain.value = 0.55; n.connect(f); f.connect(rat); rat.connect(g); send(g, 0.2);
      const am = osc('square', 38), ag = ctx.createGain(); ag.gain.value = 0.45; am.connect(ag); ag.connect(rat.gain);
      env(g, t, 0.04, v * 0.5, dur); n.start(t); n.stop(t + dur + 0.1); am.start(t); am.stop(t + dur + 0.1);
      S.thunk({ gain: v, at: dur * 0.92, f: 75 });
    },
    // a door slam / a heavy thud: a low knock with a metal ring over it
    thunk({ gain: v = 0.5, at = 0, f = 70, ring = true } = {}) {
      const t = now() + at, o = osc('sine', f * 1.8), g = gain(0); o.connect(g); o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      env(g, t, 0.004, v, 0.3); o.start(t); o.stop(t + 0.45);
      const n = noise(), lp = filt('lowpass', 900), ng = gain(0); n.connect(lp); lp.connect(ng); env(ng, t, 0.002, v * 0.7, 0.09); n.start(t); n.stop(t + 0.15);
      if (ring) for (const [fr, a] of [[410, 0.05], [690, 0.035], [1130, 0.02]]) { const r = osc('sine', fr), rg = gain(0); r.connect(rg); send(rg, 0.35); env(rg, t, 0.003, v * a * 4, 0.5); r.start(t); r.stop(t + 0.6); }
    },
    // a body hitting the pavement
    fall({ gain: v = 0.55 } = {}) {
      S.thunk({ gain: v, f: 55, ring: false });
      const t = now(), n = noise(), f = filt('bandpass', 500, 0.6), g = gain(0); n.connect(f); f.connect(g); env(g, t + 0.04, 0.01, v * 0.4, 0.25); n.start(t); n.stop(t + 0.4);
    },
    // a shove: cloth and a grunt of air
    shove({ gain: v = 0.4 } = {}) {
      const t = now(), n = noise(), f = filt('bandpass', 700, 1), g = gain(0); n.connect(f); f.connect(g);
      f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.2); env(g, t, 0.01, v, 0.22); n.start(t); n.stop(t + 0.3);
      S.thunk({ gain: v * 0.6, f: 90, ring: false, at: 0.02 });
    },
    // a phone vibrating on the pavement (times buzzes)
    buzz({ gain: v = 0.25, times = 2 } = {}) {
      const t0 = now();
      for (let i = 0; i < times; i++) {
        const t = t0 + i * 0.62, o = osc('square', 175), lp = filt('lowpass', 520, 2), g = gain(0), rat = ctx.createGain(); rat.gain.value = 0.6; o.connect(lp); lp.connect(rat); rat.connect(g);
        const am = osc('square', 31), ag = ctx.createGain(); ag.gain.value = 0.4; am.connect(ag); ag.connect(rat.gain);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.setValueAtTime(v, t + 0.36); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.start(t); o.stop(t + 0.42); am.start(t); am.stop(t + 0.42);
      }
    },
    // a ringtone: a little marimba figure, twice
    ring({ gain: v = 0.22, times = 2 } = {}) {
      const t0 = now(), notes = [659.25, 830.61, 987.77, 1318.5, 987.77, 830.61];
      for (let r = 0; r < times; r++) notes.forEach((f, i) => {
        const t = t0 + r * 1.5 + i * 0.12, o = osc('sine', f), o2 = osc('triangle', f * 4), g = gain(0, pan(0.1)), g2 = gain(0); o.connect(g); o2.connect(g2); g2.connect(g); send(g, 0.15);
        env(g, t, 0.004, v, 0.26); env(g2, t, 0.002, 0.3, 0.04); o.start(t); o.stop(t + 0.32); o2.start(t); o2.stop(t + 0.1);
      });
    },
    // a notification: two soft notes
    ding({ gain: v = 0.2 } = {}) { const t0 = now(); [[1318.5, 0], [1760, 0.11]].forEach(([f, d]) => { const o = osc('sine', f), g = gain(0); o.connect(g); send(g, 0.2); env(g, t0 + d, 0.004, v, 0.5); o.start(t0 + d); o.stop(t0 + d + 0.6); }); },
    // the call dropping
    hangup({ gain: v = 0.18 } = {}) { const t0 = now(); for (let i = 0; i < 3; i++) { const t = t0 + 0.12 + i * 0.22, o = osc('sine', 480), g = gain(0); o.connect(g); env(g, t, 0.005, v, 0.12); o.start(t); o.stop(t + 0.16); } S.thunk({ gain: 0.15, f: 300, ring: false }); },
    // a small dog: a yip, its pitch falling, through two formants
    bark({ gain: v = 0.4, p = 0, n = 1 } = {}) {
      for (let k = 0; k < n; k++) {
        const t = now() + k * 0.24, o = osc('sawtooth', 820), nz = noise(), f1 = filt('bandpass', 1350, 5), f2 = filt('bandpass', 2900, 6), g = gain(0, pan(p));
        const mix = ctx.createGain(); mix.gain.value = 1; o.connect(mix); const ng = ctx.createGain(); ng.gain.value = 0.35; nz.connect(ng); ng.connect(mix);
        mix.connect(f1); mix.connect(f2); f1.connect(g); f2.connect(g); send(g, 0.25);
        o.frequency.setValueAtTime(760, t); o.frequency.linearRampToValueAtTime(1050, t + 0.03); o.frequency.exponentialRampToValueAtTime(520, t + 0.14);
        f1.frequency.setValueAtTime(1100, t); f1.frequency.linearRampToValueAtTime(1600, t + 0.05); f1.frequency.linearRampToValueAtTime(1000, t + 0.14);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.start(t); o.stop(t + 0.2); nz.start(t); nz.stop(t + 0.2);
      }
    },
    // a small dog yelping as she's snatched up: high, whining, falling
    yelp({ gain: v = 0.4, n = 2, p = 0 } = {}) {
      for (let k = 0; k < n; k++) {
        const t = now() + k * 0.19 + Math.random() * 0.03, o = osc('sawtooth', 1300), f1 = filt('bandpass', 1700, 5), f2 = filt('bandpass', 3300, 6), g = gain(0, pan(p));
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); send(g, 0.25);
        const top = 1250 + Math.random() * 250;
        o.frequency.setValueAtTime(top * 0.8, t); o.frequency.linearRampToValueAtTime(top, t + 0.025); o.frequency.exponentialRampToValueAtTime(top * 0.55, t + 0.16);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
        o.start(t); o.stop(t + 0.2);
      }
    },
    // a voice's effort without words: a shout ('u' as in 'Moon!'), a grunt ('o' / 'u'), through three formants, a breath of
    // noise over it, the pitch rising then falling
    shout({ gain: v = 0.45, f0 = 220, vowel = 'u', dur = 0.55, p = 0 } = {}) { voiced(v, f0, vowel, dur, p, 1.18, 0.06); },
    // a phrase spoken without words: syllables of a voice through moving formants, the pitch falling at the end (rising
    // for a question), a breath of noise in it (lp: muffled, for a crowd's walla)
    mumble({ gain: v = 0.3, f0 = 140, dur = 0.4, p = 0, q = false, lp = 0 } = {}) {
      const t = now(), out = gain(0, pan(p)); send(out, 0.14);
      let dest = out; if (lp) { const f = filt('lowpass', lp, 0.7); f.connect(out); dest = f; }
      const src = osc('sawtooth', f0), src2 = osc('sawtooth', f0 * 1.006), mix = ctx.createGain(); mix.gain.value = 0.5; src.connect(mix); src2.connect(mix);
      const fs = [[6, 1], [8, 0.5], [10, 0.22]].map(([qq, g]) => { const b = filt('bandpass', 600, qq), bg = ctx.createGain(); bg.gain.value = g; mix.connect(b); b.connect(bg); bg.connect(dest); return b; });
      const n = noise(), nf = filt('bandpass', 1800, 0.9), ng = ctx.createGain(); ng.gain.value = 0.12; n.connect(nf); nf.connect(ng); ng.connect(dest);
      for (const fr of [src.frequency, src2.frequency]) { fr.setValueAtTime(f0 * 1.04, t); fr.linearRampToValueAtTime(f0 * (q ? 1.22 : 0.84), t + dur); }
      const syl = Math.max(2, Math.round(dur / 0.085)), sd = dur / syl, names = Object.keys(VOWELS);
      out.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < syl; i++) {
        const a = t + i * sd, F = VOWELS[names[Math.floor(Math.random() * names.length)]];
        fs.forEach((b, j) => b.frequency.setTargetAtTime(F[j] * (0.92 + Math.random() * 0.16), a, 0.012));
        out.gain.linearRampToValueAtTime(v * (0.65 + 0.35 * Math.random()), a + sd * 0.3); out.gain.linearRampToValueAtTime(v * 0.12, a + sd * 0.92);
      }
      out.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
      for (const s of [src, src2, n]) { s.start(t); s.stop(t + dur + 0.1); }
    },
    grunt({ gain: v = 0.4, f0 = 120, vowel = 'o', dur = 0.2, p = 0 } = {}) { voiced(v, f0, vowel, dur, p, 0.9, 0.18); },
    // a video signal tearing (the call's insert in and out)
    glitch({ gain: v = 0.15 } = {}) {
      const t = now(), n = noise(), f = filt('bandpass', 2600, 1.5), g = gain(0); n.connect(f); f.connect(g);
      for (let i = 0; i < 6; i++) { const a = t + i * 0.03; g.gain.setValueAtTime(i % 2 ? v * 0.2 : v, a); }
      g.gain.setValueAtTime(0.0001, t + 0.2); n.start(t); n.stop(t + 0.22);
      const o = osc('square', 60), og = gain(0); o.connect(og); env(og, t, 0.003, v * 0.5, 0.15); o.start(t); o.stop(t + 0.2);
    },
    // the mission jingles
    passed({ gain: v = 0.35 } = {}) {
      const t0 = now(), seq = [[196, 0], [246.94, 0.14], [293.66, 0.28], [392, 0.42]];
      const lp = filt('lowpass', 2200, 1), g = gain(0); lp.connect(g); send(g, 0.5);
      for (const [f, d] of seq) for (const dt of [-6, 6]) { const o = osc('sawtooth', f); o.detune.value = dt; const og = ctx.createGain(); o.connect(og); og.connect(lp); env(og, t0 + d, 0.01, 0.6, d === 0.42 ? 2.4 : 0.35); o.start(t0 + d); o.stop(t0 + d + 2.6); }
      for (const f of [392, 493.88, 587.33, 783.99]) { const o = osc('square', f), og = ctx.createGain(); og.gain.value = 0; o.connect(og); og.connect(lp); env(og, t0 + 0.42, 0.02, 0.18, 2.2); o.start(t0 + 0.42); o.stop(t0 + 2.8); }
      env(g, t0, 0.01, v, 3.2);
      S.thunk({ gain: 0.4, f: 50, ring: false, at: 0.42 });
    },
    failed({ gain: v = 0.35 } = {}) {
      const t = now(), lp = filt('lowpass', 900), g = gain(0); lp.connect(g); send(g, 0.6);
      for (const f of [110, 130.81, 155.56]) { const o = osc('sawtooth', f); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 2); o.connect(lp); o.start(t); o.stop(t + 2.6); }
      env(g, t, 0.05, v, 2.4);
      S.thunk({ gain: 0.5, f: 40, ring: false });
    },
  };

  const VOWELS = { u: [320, 850, 2300], o: [500, 900, 2400], a: [750, 1200, 2600], e: [480, 1800, 2550] };
  function voiced(v, f0, vowel, dur, p, rise, breath) {
    const t = now(), F = VOWELS[vowel] || VOWELS.u, out = gain(0, pan(p)); send(out, 0.18);
    const src = osc('sawtooth', f0), src2 = osc('sawtooth', f0 * 1.005), mix = ctx.createGain(); mix.gain.value = 0.5; src.connect(mix); src2.connect(mix);
    const vib = osc('sine', 5.5), vg = ctx.createGain(); vg.gain.value = f0 * 0.02; vib.connect(vg); vg.connect(src.frequency); vg.connect(src2.frequency);
    for (const fr of [src.frequency, src2.frequency]) { fr.setValueAtTime(f0 * 0.92, t); fr.linearRampToValueAtTime(f0 * rise, t + dur * 0.25); fr.exponentialRampToValueAtTime(f0 * 0.8, t + dur); }
    F.forEach((ff, i) => { const b = filt('bandpass', ff, [6, 8, 10][i]), bg = ctx.createGain(); bg.gain.value = [1, 0.55, 0.25][i]; mix.connect(b); b.connect(bg); bg.connect(out); });
    const n = noise(), nf = filt('bandpass', 1400, 0.8), ng = ctx.createGain(); ng.gain.value = breath; n.connect(nf); nf.connect(ng); ng.connect(out);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(v, t + 0.03); out.gain.setValueAtTime(v, t + dur * 0.55); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const s of [src, src2, vib, n]) { s.start(t); s.stop(t + dur + 0.05); }
  }

  // looping layers, each with set() / stop(fade)
  function layer(build) {
    if (!init()) return { set() {}, stop() {} };
    const out = gain(0); const parts = build(out) || {};
    const L = {
      out, ...parts,
      fadeTo(v, secs = 1) { out.gain.cancelScheduledValues(now()); out.gain.setValueAtTime(out.gain.value, now()); out.gain.linearRampToValueAtTime(v, now() + secs); },
      stop(secs = 1) { L.fadeTo(0, secs); setTimeout(() => { for (const s of parts.sources || []) try { s.stop(); } catch {} out.disconnect(); }, secs * 1000 + 100); const i = live.indexOf(L); if (i >= 0) live.splice(i, 1); },
    };
    live.push(L); return L;
  }
  return {
    get ctx() { return ctx; },
    unlock() { init(); if (ctx && ctx.state !== 'running') ctx.resume(); return ctx; },
    get ready() { return !!ctx && ctx.state === 'running'; },
    play(name, o) { if (!init() || !S[name]) return; try { S[name](o); } catch (e) { console.warn('[audio]', name, e); } },
    // the city: a low roar of traffic, a hiss of tyres, now and then a far horn and a siren
    city() {
      // (the game's mixer plays the city's own bed all the time, wherever the camera is: no second one)
      if (init() && window.WAGMI?.audio?.ctx === ctx) { window.WAGMI.audio.force?.('siren'); return { out: null, fadeTo() {}, stop() {} }; }
      return layer((out) => {
        const a = noise(brownBuf), la = filt('lowpass', 380), ga = ctx.createGain(); ga.gain.value = 0.55; a.connect(la); la.connect(ga); ga.connect(out);
        const b = noise(), fb = filt('bandpass', 1400, 0.4), gb = ctx.createGain(); gb.gain.value = 0.06; b.connect(fb); fb.connect(gb); gb.connect(out);
        const mod = osc('sine', 0.07), mg = ctx.createGain(); mg.gain.value = 0.2; mod.connect(mg); mg.connect(ga.gain);
        const siren = osc('sine', 700), sl = filt('lowpass', 1600), sg = ctx.createGain(); sg.gain.value = 0; siren.connect(sl); sl.connect(sg); sg.connect(out); send(sg, 0.9);
        const sweep = osc('sine', 0.38), sw = ctx.createGain(); sw.gain.value = 260; sweep.connect(sw); sw.connect(siren.frequency);
        const t = now(); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.012, t + 2); sg.gain.linearRampToValueAtTime(0.018, t + 5); sg.gain.linearRampToValueAtTime(0, t + 11);
        for (const s of [a, b, mod, siren, sweep]) s.start();
        return { sources: [a, b, mod, siren, sweep] };
      });
    },
    // a held, uneasy chord under the scene (D minor with a rub), slowly opening and closing
    pad({ notes = [73.42, 110, 146.83, 155.56, 220] } = {}) {
      return layer((out) => {
        const lp = filt('lowpass', 500, 1.2); lp.connect(out); send(lp, 0.6);
        const lfo = osc('sine', 0.09), lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
        const srcs = [lfo];
        for (const f of notes) for (const d of [-9, 9]) { const o = osc('sawtooth', f); o.detune.value = d; const og = ctx.createGain(); og.gain.value = 0.08; o.connect(og); og.connect(lp); srcs.push(o); }
        const sub = osc('sine', 36.71), sg = ctx.createGain(); sg.gain.value = 0.35; sub.connect(sg); sg.connect(out); srcs.push(sub);
        for (const s of srcs) s.start();
        return { sources: srcs };
      });
    },
    // a heartbeat-ish pulse for the stakes (a muffled kick, twice a beat)
    pulse({ bpm = 92 } = {}) {
      let timer = null;
      const L = layer((out) => ({}));
      const beat = () => { if (!ctx) return; const t = now(); for (const d of [0, 0.22]) { const o = osc('sine', 70), g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(L.out); o.frequency.setValueAtTime(90, t + d); o.frequency.exponentialRampToValueAtTime(40, t + d + 0.18); env(g, t + d, 0.004, d ? 0.5 : 0.8, 0.22); o.start(t + d); o.stop(t + d + 0.3); } };
      timer = setInterval(beat, 60000 / bpm); beat();
      const stop = L.stop; L.stop = (s) => { clearInterval(timer); stop(s); };
      return L;
    },
    // a van's diesel: set(rpm 0..1, level 0..1, muffled 0..1 = its stereo through the walls)
    engine() {
      return layer((out) => {
        const o1 = osc('sawtooth', 42), o2 = osc('square', 84), lp = filt('lowpass', 420, 1.5), g1 = ctx.createGain(), g2 = ctx.createGain();
        g1.gain.value = 0.5; g2.gain.value = 0.18; o1.connect(g1); o2.connect(g2); g1.connect(lp); g2.connect(lp); lp.connect(out);
        const rumble = noise(brownBuf), rl = filt('lowpass', 160), rg = ctx.createGain(); rg.gain.value = 0.6; rumble.connect(rl); rl.connect(rg); rg.connect(out);
        for (const s of [o1, o2, rumble]) s.start();
        return { sources: [o1, o2, rumble], set(rpm = 0, level = 0.5) { const t = now(); o1.frequency.setTargetAtTime(38 + rpm * 70, t, 0.08); o2.frequency.setTargetAtTime(76 + rpm * 140, t, 0.08); lp.frequency.setTargetAtTime(300 + rpm * 900, t, 0.1); out.gain.setTargetAtTime(level, t, 0.08); } };
      });
    },
    // the bass from the van's stereo: a four-on-the-floor kick and a sub line, muffled by the walls until the door opens
    bass({ bpm = 128 } = {}) {
      let timer = null, step = 0;
      const lp = { f: null };
      const L = layer((out) => { const f = filt('lowpass', 180, 1); f.connect(out); lp.f = f; return {}; });
      const line = [55, 55, 65.41, 49];
      const tick = () => {
        if (!ctx) return; const t = now(), i = step++;
        const k = osc('sine', 110), kg = ctx.createGain(); kg.gain.value = 0; k.connect(kg); kg.connect(lp.f);
        k.frequency.setValueAtTime(140, t); k.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(kg, t, 0.003, 0.9, 0.22); k.start(t); k.stop(t + 0.3);
        if (i % 2 === 1) { const b = osc('sawtooth', line[(i >> 2) % 4]), bg = ctx.createGain(); bg.gain.value = 0; b.connect(bg); bg.connect(lp.f); env(bg, t, 0.01, 0.35, 0.2); b.start(t); b.stop(t + 0.25); }
      };
      timer = setInterval(tick, 60000 / bpm / 2);
      const stop = L.stop; L.stop = (s) => { clearInterval(timer); stop(s); };
      L.open = (k) => { if (lp.f) lp.f.frequency.setTargetAtTime(180 + k * 2600, now(), 0.05); };
      return L;
    },
    // a caller's murmur on a video call while he talks with no recording of his line (Mr. Big's: on / off)
    voice() {
      return layer((out) => {
        // (a plain voiced murmur through two formants: no ring modulation or crushing, he has no voice changer)
        const src = osc('sawtooth', 92), f1 = filt('bandpass', 700, 6), f2 = filt('bandpass', 1300, 7), lp = filt('lowpass', 3000);
        src.connect(f1); src.connect(f2); f1.connect(lp); f2.connect(lp); lp.connect(out);
        src.start();
        let talking = false, timer = null;
        const syll = () => { if (!talking) return; const t = now(); src.frequency.setTargetAtTime(78 + Math.random() * 30, t, 0.03); f1.frequency.setTargetAtTime(400 + Math.random() * 600, t, 0.03); f2.frequency.setTargetAtTime(1000 + Math.random() * 1200, t, 0.03); out.gain.setTargetAtTime(Math.random() < 0.18 ? 0.02 : 0.32, t, 0.02); };
        return { sources: [src], talk(on) { talking = !!on; clearInterval(timer); if (on) { timer = setInterval(syll, 95); syll(); } else out.gain.setTargetAtTime(0, now(), 0.04); } };
      });
    },
    stopAll(secs = 1) { for (const L of [...live]) L.stop(secs); },
  };
}
