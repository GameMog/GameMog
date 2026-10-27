// Mog City: the fight's sounds, made on the spot with WebAudio (no files). Nothing plays before the player's first key
// or click (the browser's rule); then every sound is built from noise and oscillators:
//   punch / kick / body   a slap of skin or cloth over a falling low thump (a kick deeper, a body blow deeper still)
//   bat                   the knock of ash: a few wooden partials ringing briefly, over the thump of the body it meets
//   crack                 a bat snapping: a dry burst of splinter clicks
//   glass                 a bottle breaking: a bright crash, then a scatter of tinkles as the shards land
//   clang / lid / rumble  a galvanised can: inharmonic metal partials (a lid's ring higher, its wobble a rattle); rolling
//   whoosh, slam, wall, bodyfall, hurt, counter, grab, grunt, deny, glint, wood, tink; horn (a car stopped by the fight)
// Slow motion muffles the mix (a low-pass on the master); a short slap-back off the street walls under it all.
export function createSfx() {
  let ctx = null, out = null, lp = null, verb = null, noise = null;
  const R = Math.random;
  function ready() {
    if (!ctx) {
      try {
        // (the game's one mixer when it is there: its context, into its sfx bus)
        const A = window.WAGMI?.audio;
        ctx = A?.ctx || new AudioContext();
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
        lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
        const master = ctx.createGain(); master.gain.value = 0.85;
        out = ctx.createGain(); out.connect(comp); comp.connect(lp); lp.connect(master); master.connect(A?.ctx === ctx && A.bus?.sfx ? A.bus.sfx : ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
        // the street's slap-back: a short decaying noise as an impulse response, sent a little of everything
        const len = Math.floor(ctx.sampleRate * 0.55), ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const b = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; b[i] = (R() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.012 ? 0 : 1); } }
        const conv = ctx.createConvolver(); conv.buffer = ir; verb = ctx.createGain(); verb.gain.value = 0.16; verb.connect(conv); conv.connect(comp);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, ready, { passive: true });
  let pitch = 1; // slow motion lowers what starts during it a little
  const dest = (g, wet = 1) => { g.connect(out); if (wet > 0 && verb) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); } };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  // a band of noise, its filter swept from f0 to f1
  function burst({ t = ctx.currentTime, dur, type = 'bandpass', f0, f1 = f0, q = 1, peak = 0.5, a = 0.004, wet = 1, rate = 1 }) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = (0.85 + R() * 0.3) * rate * pitch;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0 * pitch, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + a + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); dest(g, wet); s.start(t, R() * 0.6); s.stop(t + a + dur + 0.05);
  }
  // a tone falling from f0 to f1
  function tone({ t = ctx.currentTime, f0, f1 = f0, dur, peak = 0.6, type = 'sine', a = 0.003, wet = 1 }) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0 * pitch, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1 * pitch), t + a + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    o.connect(g); dest(g, wet); o.start(t); o.stop(t + a + dur + 0.05);
  }
  // struck metal or wood: inharmonic partials, each with its own ring
  function modes({ t = ctx.currentTime, base, ratios, decays, peak = 0.3, wet = 1.2 }) {
    ratios.forEach((r, i) => tone({ t, f0: base * r * (1 + (R() - 0.5) * 0.02), f1: base * r * 0.995, dur: decays[i] ?? decays[decays.length - 1], peak: peak / (1 + i * 0.6), wet, a: 0.0015 }));
  }
  const SOUNDS = {
    whoosh(k = 1) { burst({ dur: 0.14 + 0.07 * k, f0: 450, f1: 2200 + 1000 * k, q: 1.3, peak: 0.2 + 0.2 * Math.min(1.6, k), a: 0.045, wet: 0.3 }); },
    // a fist landing: the slap of knuckles on skin, a dull thump under it
    punch(k = 0) {
      const t = ctx.currentTime;
      tone({ t, f0: 170 - 40 * k, f1: 48, dur: 0.09 + 0.08 * k, peak: 0.75 + 0.25 * k });
      burst({ t, dur: 0.035 + 0.025 * k, f0: 1700 - 400 * k, f1: 700, q: 1.1, peak: 0.6 + 0.2 * k, a: 0.0015 });
      burst({ t, dur: 0.012, type: 'highpass', f0: 3500, q: 0.7, peak: 0.28, a: 0.0008, wet: 0.2 });
    },
    // a foot landing: heavier, the whump of cloth
    kick(k = 0) {
      const t = ctx.currentTime;
      tone({ t, f0: 120 - 25 * k, f1: 40, dur: 0.14 + 0.08 * k, peak: 0.95 });
      burst({ t, dur: 0.08 + 0.03 * k, type: 'lowpass', f0: 1400, f1: 320, q: 0.8, peak: 0.55 + 0.2 * k, a: 0.002 });
      burst({ t, dur: 0.018, f0: 2400, q: 0.8, peak: 0.25, a: 0.001, wet: 0.2 });
    },
    // a big blow to the body (an ender, a heavy, a counter)
    body(k = 0.7) {
      const t = ctx.currentTime;
      tone({ t, f0: 95, f1: 32, dur: 0.24 + 0.1 * k, peak: 1 });
      tone({ t, f0: 210, f1: 70, dur: 0.07, peak: 0.45, type: 'triangle' });
      burst({ t, dur: 0.1 + 0.05 * k, type: 'lowpass', f0: 2400, f1: 300, q: 0.7, peak: 0.7, a: 0.0015 });
    },
    hit(k = 0) { SOUNDS.punch(k); }, // (stage 1's name)
    // ash on a body: a hollow wooden knock, the thump under it
    bat(k = 0.6) {
      const t = ctx.currentTime;
      modes({ t, base: 520 + R() * 60, ratios: [1, 2.32, 3.9, 5.6], decays: [0.11, 0.07, 0.05, 0.035], peak: 0.42 + 0.2 * k, wet: 0.8 });
      burst({ t, dur: 0.03, f0: 2600, f1: 1200, q: 1.2, peak: 0.55, a: 0.001 });
      tone({ t, f0: 130, f1: 42, dur: 0.16 + 0.08 * k, peak: 0.9 });
    },
    // a bat breaking: splinters
    crack() {
      const t = ctx.currentTime;
      burst({ t, dur: 0.06, type: 'highpass', f0: 1800, q: 0.6, peak: 0.8, a: 0.0008 });
      for (let i = 0; i < 9; i++) burst({ t: t + 0.004 + R() * 0.09, dur: 0.008 + R() * 0.012, f0: 1500 + R() * 3500, q: 3, peak: 0.25 + R() * 0.3, a: 0.0005, wet: 0.6 });
      modes({ t, base: 380, ratios: [1, 2.6, 4.1], decays: [0.08, 0.05, 0.03], peak: 0.35 });
    },
    // a bottle breaking: the crash, then the shards coming down
    glass(k = 1) {
      const t = ctx.currentTime;
      burst({ t, dur: 0.12, type: 'highpass', f0: 2800, f1: 4200, q: 0.5, peak: 1.0 * k, a: 0.001, wet: 1.4 });
      burst({ t, dur: 0.05, f0: 900, f1: 500, q: 0.9, peak: 0.6 * k, a: 0.001 });
      for (let i = 0; i < 16; i++) {
        const at = t + 0.01 + Math.pow(R(), 1.6) * 0.42, f = 2600 + R() * 5200;
        tone({ t: at, f0: f, f1: f * 0.985, dur: 0.03 + R() * 0.09, peak: (0.08 + R() * 0.16) * k * (1 - (at - t) * 1.2), wet: 1.5 });
      }
    },
    tink(k = 0.4) { const f = 3000 + R() * 2500; tone({ f0: f, f1: f * 0.99, dur: 0.07, peak: 0.16 + 0.3 * k, wet: 1.2 }); },
    // a galvanised can struck or landing: k how hard
    clang(k = 0.6) {
      const t = ctx.currentTime;
      modes({ t, base: 260 + R() * 50, ratios: [1, 1.59, 2.31, 3.08, 4.17, 5.43], decays: [0.95, 0.8, 0.62, 0.5, 0.38, 0.28].map((d) => d * (0.45 + 0.6 * k)), peak: 0.3 + 0.45 * k, wet: 1.5 });
      burst({ t, dur: 0.05 + 0.04 * k, f0: 1600, f1: 700, q: 0.7, peak: 0.2 + 0.35 * k, a: 0.001 });
      tone({ t, f0: 110, f1: 45, dur: 0.12 + 0.1 * k, peak: 0.4 + 0.4 * k });
    },
    // a lid: brighter, and its wobble a rattle
    lid(k = 0.3) { modes({ base: 640 + R() * 120, ratios: [1, 1.71, 2.62, 3.4], decays: [0.35, 0.25, 0.16, 0.1].map((d) => d * (0.4 + k)), peak: 0.1 + 0.4 * k, wet: 1.3 }); },
    rumble(k = 0.5) { burst({ dur: 0.08, type: 'lowpass', f0: 700, f1: 260, q: 1.4, peak: 0.25 + 0.35 * k, a: 0.01, wet: 0.5 }); if (R() < 0.4) modes({ base: 300 + R() * 60, ratios: [1, 1.59, 2.31], decays: [0.14, 0.1, 0.07], peak: 0.08 + 0.12 * k }); },
    wood(k = 0.4) { modes({ base: 700 + R() * 200, ratios: [1, 2.4, 4.2], decays: [0.07, 0.05, 0.035], peak: 0.2 + 0.4 * k, wet: 0.8 }); },
    hurt(k = 0) { const t = ctx.currentTime; tone({ t, f0: 130, f1: 38, dur: 0.18 + 0.1 * k, peak: 0.9 }); burst({ t, dur: 0.07, f0: 900, f1: 300, q: 0.8, peak: 0.55, a: 0.0015 }); },
    bodyfall(k = 0.7) { const t = ctx.currentTime; tone({ t, f0: 85, f1: 30, dur: 0.3, peak: 0.6 + 0.3 * k }); burst({ t, dur: 0.22, type: 'lowpass', f0: 1100, f1: 180, q: 0.5, peak: 0.4 * k, a: 0.003 }); burst({ t: t + 0.05, dur: 0.15, type: 'lowpass', f0: 600, f1: 150, q: 0.5, peak: 0.2 * k, a: 0.004 }); },
    // a man slammed into the street: the whole body, the air knocked out of him, grit
    slam(k = 1) {
      const t = ctx.currentTime;
      tone({ t, f0: 72, f1: 22, dur: 0.55, peak: 1 });
      tone({ t, f0: 160, f1: 55, dur: 0.12, peak: 0.6, type: 'triangle' });
      burst({ t, dur: 0.4, type: 'lowpass', f0: 1800, f1: 120, q: 0.4, peak: 0.75 * k, a: 0.002, wet: 1.4 });
      burst({ t, dur: 0.05, type: 'highpass', f0: 2000, q: 0.6, peak: 0.45, a: 0.001 });
      for (let i = 0; i < 6; i++) burst({ t: t + 0.03 + R() * 0.2, dur: 0.02, type: 'highpass', f0: 3000 + R() * 3000, q: 1, peak: 0.06, a: 0.001 });
    },
    wall() { const t = ctx.currentTime; tone({ t, f0: 110, f1: 40, dur: 0.2, peak: 0.7 }); burst({ t, dur: 0.12, f0: 500, f1: 250, q: 1.2, peak: 0.35, a: 0.002, wet: 1.4 }); },
    // the counter: a sharp crack and a ring over the blow
    counter() { const t = ctx.currentTime; tone({ t, f0: 1900, f1: 1100, dur: 0.12, peak: 0.22, type: 'triangle', wet: 1.6 }); burst({ t, dur: 0.02, type: 'highpass', f0: 4000, q: 0.7, peak: 0.6, a: 0.0006 }); SOUNDS.body(0.8); },
    grab() { burst({ dur: 0.14, f0: 1600, f1: 700, q: 0.7, peak: 0.5, a: 0.012, wet: 0.3 }); },
    // an effort: a voice-like breath through two formants
    grunt(k = 0.5) {
      const t = ctx.currentTime, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime((105 + R() * 25) * pitch, t); o.frequency.exponentialRampToValueAtTime(72 * pitch, t + 0.22);
      const g = ctx.createGain(); env(g, t, 0.02, 0.25 + 0.3 * k, 0.2);
      for (const [f, q, gk] of [[620, 6, 1], [1150, 8, 0.6]]) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * pitch; b.Q.value = q; const bg = ctx.createGain(); bg.gain.value = gk; o.connect(b); b.connect(bg); bg.connect(g); }
      dest(g, 0.4); o.start(t); o.stop(t + 0.3);
      burst({ t, dur: 0.18, f0: 900, f1: 500, q: 1.5, peak: 0.08 + 0.08 * k, a: 0.02, wet: 0.3 });
    },
    deny() { tone({ f0: 220, f1: 160, dur: 0.09, peak: 0.25, type: 'triangle', wet: 0.2 }); },
    // a car's horn, leaned on (a driver stopping for a fight in the road): two reedy notes a third apart
    horn(k = 0.6) {
      const t = ctx.currentTime, dur = 0.3 + R() * 0.3;
      for (const f of [392, 494]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.98 + R() * 0.04) * pitch;
        const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 1700; lpf.Q.value = 1.5;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.055 * k, t + 0.02); g.gain.setValueAtTime(0.055 * k, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.07);
        o.connect(lpf); lpf.connect(g); dest(g, 1.1); o.start(t); o.stop(t + dur + 0.12);
      }
    },
    // a weapon raised: a bright little shing
    glint() { const t = ctx.currentTime; tone({ t, f0: 3200, f1: 3400, dur: 0.2, peak: 0.16, type: 'triangle', wet: 1.6 }); tone({ t: t + 0.01, f0: 4800, f1: 5000, dur: 0.14, peak: 0.09, wet: 1.6 }); },
  };
  const play = (kind, k) => { try { if (!ready() || ctx.state !== 'running') return; SOUNDS[kind]?.(k); } catch (e) { /* sound is optional */ } };
  // slow motion (0..1): the mix muffled and lowered as the world slows
  play.slow = (k) => { pitch = 1 - 0.18 * k; if (lp && ctx) lp.frequency.setTargetAtTime(20000 * Math.pow(0.07, k), ctx.currentTime, 0.03); };
  play.kinds = Object.keys(SOUNDS);
  return play;
}
