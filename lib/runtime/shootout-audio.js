    /* ======================================================================== penalty shootout: the sound ===== */
    // shootout-audio.js (SHOOTOUT M1, lane SW), pasted into boot() at shootout.js's /*@include shootout-audio.js*/
    // marker. ONE top-level binding, shootAudio (design-critique #2): every other name lives inside it, so nothing of
    // v1's boot() is shadowed or replaced. It reads the runtime's names and writes none: audio (the buses
    // ensureAudio() makes on the first gesture), camera (where the two ends of the ground are heard from), and, for the
    // recorded crowd, ASSETS and fetchChecked (the library's hash-checked files).
    //
    // A night final's crowd and the kick's own sounds:
    //  - the crowd, RECORDED when the library's audio-crowd-shootout is there (CC0 takes, the owner's go-ahead 11 Oct
    //    2026; load() below): a murmur, the shushing at the whistle and the whistling at the taker (loops), a group
    //    inhale at the lock, "Gol!" and a wordless cheer, a groan, a let-down, sighs, gasps and coughs. Each plays from
    //    its end of the ground as the camera hears it, through its own gentle low-pass (a recording has its own
    //    spectrum), the pan and the duck, into the runtime's world bus. Under it, the synthesised bed at half its level
    //    gives a stadium's size;
    //  - the crowd, SYNTHESISED (every slot empty, a failed load, or before it lands: the mechanic never waits on it):
    //    kart.js's crowd (one smoothed noise, three bands each breathing on its own) under LA 2028's two-band pink,
    //    through a master low-pass (two in series: the hush is a crowd behind a wall), a pan and a duck; a cheer layer
    //    over it rises with the excitement (Gameplay Football's crowd rule, a fact: e <- 0.98 e + 0.02 target every
    //    10 ms rising, 0.998 / 0.002 falling, here per dt); its voices: a cheer, a groan (a 300 Hz band and a chorus of
    //    falling "oh"s), a gasp, the inhale, finger whistles;
    //  - the heat (the owner's mechanic: TAP is the run-up): the whistling at the taker rises with it, and so does the
    //    excitement over the hush; frozen at the lock;
    //  - the effects, into the runtime's effects bus: the referee's pea whistle, studs and the plant, a tap's tick, the
    //    lock's swell, the strike (with a 50 ms duck of everything else), the ball's whoosh, a clank off the woodwork, a
    //    glove's slap, the net's swish, a bounce, derision; and a heartbeat (55 Hz and 45 Hz thumps, an octave over them
    //    for a phone's speaker).
    // The demo is silent (RULES row 18): the master stays at 0 until the first mood but 'off'.
    //
    //   var snd = shootAudio({ quality, teams, taker, ends?, seed?, audio?, camera?, fetch? });  (audio/camera/fetch: tests)
    //   snd.mood(name, { side, kind })  off|ambient|hush|inhale|gasp|roar|groan|replay; side = the team that is happy
    //   snd.sfx(name, opts)             whistle|studs|plant|tap|lock|thud|whoosh|clank|glove|swish|bounce|derision;
    //                                   opts.gain and opts.pitch (the replay's 0.6 and 0.7), and each one's own
    //                                   (heat, power, speed, part ...)
    //   snd.heat(H, { locked })         each frame from set to the strike (0..1)
    //   snd.load(asset|null)            the recorded crowd (ASSETS['audio-crowd-shootout']); also tried by itself
    //   snd.heartbeat(bpm|0)  snd.duck(ms)  snd.step(dt)  snd.level(spectrum?)  snd.SLOTS  snd.dispose()
    // SLOTS = { bedAmbient, bedHush, whistleTaker, inhale, roar, groan, letdown, sigh, gasp, cough, derision,
    // refWhistle }, each { buffer, gain, loop, at, dur, variants }: an AudioBuffer put in a slot plays instead of its
    // synthesised voice (from `at` for `dur`, or the whole buffer); load() fills them from the library's cue sheet
    // (several takes of a slot are its variants: one is picked each time, never the same twice running); null keeps
    // the synth (derision and refWhistle always do).
    function shootAudio(o) {
      'use strict';
      o = o || {};
      var LOWQ = o.quality === 'low', TAKER = o.taker === 1 ? 1 : 0;
      // where each team's end is (team 0 behind the goal being shot at, as the world seats it): heard from the camera
      var ENDS = Array.isArray(o.ends) && o.ends.length === 2 ? o.ends : [[0, 10, -64], [0, 10, 64]];
      var PI = Math.PI;
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function damp(a, b, lam, dt) { return b + (a - b) * Math.exp(-lam * dt); }
      function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
      // a seeded generator (mulberry32): the noise and the crowd's whims are the same every time, for the analysis
      var seed = (o.seed >>> 0) || 0x5EED5;
      function R() { seed = (seed + 0x6D2B79F5) >>> 0; var t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
      // the runtime's buses (made on the first gesture), and its camera
      function AU() { if (o.audio) return typeof o.audio === 'function' ? o.audio() : o.audio; return typeof audio !== 'undefined' ? audio : null; }
      function CAM() { if (o.camera !== undefined) return o.camera; return typeof camera !== 'undefined' && camera && camera.isCamera ? camera : null; }

      /* ---------------------------------------------------------------------------- the moods' targets -- */
      // bed: the murmur's gain (design §7.2); lp: the master low-pass (Hz); tau: the ramp (s; three of them is 95%);
      // e: the excitement's target; cheer: how much of the excitement is heard as a cheer
      var MOODS = {
        off: { bed: 0, lp: 9000, tau: 0.05, lpTau: 0.05, e: 0, cheer: 0 },
        ambient: { bed: 0.55, lp: 9000, tau: 0.4, lpTau: 0.3, e: 0.28, cheer: 1 },
        hush: { bed: 0.22, lp: 700, tau: 0.4, lpTau: 0.3, e: 0.02, cheer: 0.3 },
        inhale: { bed: 0.35, lp: 1200, tau: 0.45, lpTau: 0.45, e: 0.12, cheer: 0.5 },
        gasp: { bed: 0.7, lp: 5000, tau: 0.1, lpTau: 0.08, e: 0.7, cheer: 1 },
        roar: { bed: 1.0, lp: 12000, tau: 0.083, lpTau: 0.08, e: 1, cheer: 1 },
        groan: { bed: 0.5, lp: 3500, tau: 0.3, lpTau: 0.2, e: 0.3, cheer: 0.6 },
        replay: { bed: 0.5, lp: 3000, tau: 0.2, lpTau: 0.15, e: 0.3, cheer: 0.3 },
      };
      // the recorded crowd's mix, per mood (with the recordings in): the murmur's and the shushing's level (1 = the
      // levels in RK), what is left of the synthesised bed and cheer, and the recordings' own low-pass (Hz)
      var REC = {
        off: { walla: 0, shush: 0, synth: 0, cheer: 0, lp: 9000 },
        ambient: { walla: 1, shush: 0, synth: 0.5, cheer: 0.5, lp: 14000 },
        hush: { walla: 0.13, shush: 1, synth: 0.5, cheer: 0.5, lp: 9000 },
        inhale: { walla: 0.13, shush: 1, synth: 0.5, cheer: 0.5, lp: 9000 },
        gasp: { walla: 1.2, shush: 0, synth: 0.5, cheer: 0.5, lp: 12000 },
        roar: { walla: 1.6, shush: 0, synth: 0.4, cheer: 0.4, lp: 16000 },
        groan: { walla: 0.9, shush: 0, synth: 0.5, cheer: 0.5, lp: 9000 },
        replay: { walla: 0.8, shush: 0, synth: 0.5, cheer: 0.15, lp: 2500 },
      };
      // the loudness of the whole crowd and of the effects against the runtime's buses (measured: m1/SW.md)
      var K = { bed: 0.55, cheer: 0.5, voice: 1, fx: 1 };
      // each crowd voice's own level, so that level 1 is as loud as a bed of 1 (measured: m1/SW.md)
      var VK = { cheer: 1.3, groan: 1.75, gasp: 2, inhale: 2.5 };
      // the recordings' levels: every cue is levelled to -20 dBFS (its loudest half second; a loop's whole) in the
      // library, so each of these is the gain that puts it where the crowd wants it (dBFS RMS on the crowd's bus:
      // walla -26.5 at the walk, the shushing -37.7 as the whistle goes, the whistling -27.5 at full heat, the inhale -33,
      // the roar's "Gol!" -18 over its cheer -21, a groan -24, a let-down -22, a sigh -30, a gasp -24 (-27 at a save),
      // the other end's cheer -26, a cough about -44)
      var RK = { walla: 0.47, shush: 0.13, whistle: 0.42, inhale: 0.22, gol: 1.26, cheer: 0.9, cheerOther: 0.5, groan: 0.63, letdown: 0.8, sigh: 0.32, gasp: 0.63, gaspSave: 0.45, cough: 0.06 };
      var SLOT_NAMES = ['bedAmbient', 'bedHush', 'whistleTaker', 'inhale', 'roar', 'groan', 'letdown', 'sigh', 'gasp', 'cough', 'derision', 'refWhistle'];
      var LOOPED = { bedAmbient: 1, bedHush: 1, whistleTaker: 1 };
      var SLOTS = {};
      SLOT_NAMES.forEach(function (k) { SLOTS[k] = { buffer: null, gain: 1, loop: !!LOOPED[k] }; });
      // what the crowd is doing (kept before the sound exists, applied when it does)
      var S = { mood: 'off', side: TAKER, kind: null, on: 0, e: 0, bed: 0, lp: 9000, cheer: 0, pan: 0, roll: 6, whistleT: 0,
        hbTarget: 0, hbBpm: 0, hbNext: 0, voices: [], rms: { crowd: 0, fx: 0, master: 0 }, moodAt: 0, steps: 0, sfx: 0,
        heat: 0, heatLocked: false, heatAge: 9, hushT: 0, synthK: 1, recLp: 14000, mix: { walla: 0, shush: 0, whistle: 0 },
        coughT: 1.5, sighT: 0, gaspT: 0, last: {}, taps: 0 };
      var LOAD = { state: 'none', p: null, err: null, offset: {}, ms: 0, cues: 0 };
      var G = null;

      /* ------------------------------------------------------------------------------------ the graph -- */
      function build() {
        var A = AU();
        if (!A || !A.ctx) return null;
        if (G && G.ac === A.ctx) return G;
        var ac = A.ctx, sr = ac.sampleRate, i, k;
        G = { ac: ac, A: A };
        // the noise, made once: kart's smoothed mono (2 s), LA's stereo pink (6 s; 3 on a phone), plain white (2 s),
        // and open.js's grains (six buffers, three sparse and three dense: a new buffer for every footstep would churn
        // a phone's memory)
        var sm = ac.createBuffer(1, Math.floor(sr * 2), sr), sd = sm.getChannelData(0), last = 0;
        for (i = 0; i < sd.length; i++) { last = last * 0.6 + (R() * 2 - 1) * 0.4; sd[i] = last * 2.2; }
        var pn = ac.createBuffer(2, Math.floor(sr * (LOWQ ? 3 : 6)), sr);
        for (var ch = 0; ch < 2; ch++) {
          var d = pn.getChannelData(ch), b0 = 0, b1 = 0, b2 = 0;
          for (i = 0; i < d.length; i++) { var w = R() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
        }
        var wh = ac.createBuffer(1, Math.floor(sr * 2), sr), wd = wh.getChannelData(0);
        for (i = 0; i < wd.length; i++) wd[i] = R() * 2 - 1;
        G.smooth = sm; G.pink = pn; G.white = wh; G.grain = [];
        for (k = 0; k < 6; k++) {
          var span = k < 3 ? 0.1 : 0.13, len = Math.max(1, Math.floor(sr * span)), gb = ac.createBuffer(1, len, sr), gd = gb.getChannelData(0), n = k < 3 ? 10 : 16;
          for (var g = 0; g < n; g++) {
            var at = Math.floor(R() * len * 0.85), gl = Math.floor(sr * (0.002 + R() * 0.006)), amp = (0.4 + R() * 0.6) * (1 - at / len);
            for (i = 0; i < gl && at + i < len; i++) gd[at + i] += (R() * 2 - 1) * amp * Math.sin(PI * i / gl);
          }
          G.grain.push(gb);
        }
        function gain(v, to) { var n = ac.createGain(); n.gain.value = v; if (to) n.connect(to); return n; }
        function filt(type, f, q, to) { var n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (to) n.connect(to); return n; }
        function panner(to) { var p = ac.createStereoPanner ? ac.createStereoPanner() : null; if (p) { p.pan.value = 0; if (to) p.connect(to); return p; } return gain(1, to); }
        function analyser() { var a = ac.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0; return a; }
        G.gain = gain; G.filt = filt; G.panner = panner;
        // the crowd: ... -> low-pass x2 -> pan -> duck -> on -> the world bus (and the meter)
        G.crowdOn = gain(0, A.world || A.master); G.anCrowd = analyser(); G.crowdOn.connect(G.anCrowd);
        G.crowdDuck = gain(1, G.crowdOn);
        G.pan = panner(G.crowdDuck);
        G.lp2 = filt('lowpass', 9000, 0.5, G.pan); G.lp = filt('lowpass', 9000, 0.5, G.lp2);
        G.bedG = gain(0, G.lp); G.cheerG = gain(0, G.lp);
        // the recordings: their own gentle low-pass, then the same pan, duck and switch
        G.recLp = filt('lowpass', 14000, 0.6, G.pan); G.recIn = gain(1, G.recLp);
        // the voices (cheers, groans, whistles): each with its own end's filter and pan, through the master low-pass
        G.voices = gain(K.voice, G.lp);
        // (kart's three bands of one smoothed noise, each breathing on its own)
        var src1 = ac.createBufferSource(); src1.buffer = sm; src1.loop = true;
        G.bands = [[420, 1.1], [1050, 1.3], [2300, 1.6]].map(function (b) {
          var f = filt('bandpass', b[0], b[1]), gg = gain(0.3, G.bedG); src1.connect(f); f.connect(gg);
          return { f: f, g: gg, base: b[0], v: 0.3 };
        });
        // (LA 2028's two-band pink: a low roar into the bed, a bright top into the cheer layer)
        var src2 = ac.createBufferSource(); src2.buffer = pn; src2.loop = true;
        G.lo = filt('bandpass', 380, 0.55); G.loG = gain(0.6, G.bedG); src2.connect(G.lo); G.lo.connect(G.loG);
        G.hi = filt('bandpass', 1450, 0.9); G.hiG = gain(0.16, G.bedG); src2.connect(G.hi); G.hi.connect(G.hiG);
        // (the cheer layer: the same top and the brightest band again, the excitement's to raise)
        G.chHi = filt('bandpass', 1650, 0.8, G.cheerG); src2.connect(G.chHi);
        G.chTop = filt('bandpass', 2900, 1.1); var ctg = gain(0.6, G.cheerG); src1.connect(G.chTop); G.chTop.connect(ctg);
        src1.start(); src2.start(ac.currentTime, R() * pn.duration * 0.9);
        G.srcs = [src1, src2];
        // the recorded loops (the murmur, the shushing, the whistling), started once their slots hold a buffer
        G.loops = {};
        // the effects: -> duck -> on -> the effects bus (and the meter); the strike and its whoosh go round the duck
        G.fxOn = gain(0, A.fx || A.master); G.anFx = analyser(); G.fxOn.connect(G.anFx);
        G.fxDuck = gain(1, G.fxOn);
        G.sfx = gain(K.fx, G.fxDuck);
        G.front = gain(K.fx, G.fxOn);
        G.hb = gain(1, G.fxOn);
        // the whole page's output, metered (what the player hears of everything)
        G.anMaster = analyser(); (A.limiter || A.master).connect(G.anMaster);
        G.buf = new Float32Array(G.anCrowd.fftSize); G.spec = new Float32Array(G.anCrowd.frequencyBinCount);
        S.lp = MOODS[S.mood].lp;
        applyOn(true);
        return G;
      }
      function now() { return G.ac.currentTime; }
      // the master: 0 in 'off' (the demo), 1 otherwise (exactly 0 once off has settled: the demo's check reads it)
      function applyOn(snap) {
        if (!G) return;
        var t0 = now(), v = S.on;
        [G.crowdOn, G.fxOn].forEach(function (n) {
          n.gain.cancelScheduledValues(t0);
          if (snap) n.gain.setValueAtTime(v, t0);
          else { n.gain.setValueAtTime(n.gain.value, t0); n.gain.setTargetAtTime(v, t0, v ? 0.12 : 0.05); n.gain.setValueAtTime(v, t0 + (v ? 0.9 : 0.4)); }
        });
      }

      /* ------------------------------------------------------------------------------------ helpers -- */
      // an envelope on a gain: up from silence to peak in att, back down to silence by dur (exponential both ways)
      function env(g, t0, att, peak, dur) {
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.max(0.001, att));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(att + 0.005, dur));
      }
      function tone(f, at, dur, type, peak, f1, dest, att) {
        var ac = G.ac, t0 = ac.currentTime + (at || 0), os = ac.createOscillator(), g = ac.createGain();
        os.type = type || 'sine'; os.frequency.setValueAtTime(f, t0);
        if (f1 && f1 !== f) os.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        env(g, t0, att || Math.min(0.01, dur * 0.2), peak, dur);
        os.connect(g); g.connect(dest || G.sfx); os.start(t0); os.stop(t0 + dur + 0.05);
        return os;
      }
      // a burst of white noise through a filter swept f0 -> f1 (v1's noiseBand, from one cached buffer: no allocation)
      function burst(at, dur, peak, f0, f1, q, dest, type, att) {
        var ac = G.ac, t0 = ac.currentTime + (at || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = G.white;
        f.type = type || 'bandpass'; f.Q.value = q || 1.2; f.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        env(g, t0, att || Math.min(0.006, dur * 0.3), peak, dur);
        s.connect(f); f.connect(g); g.connect(dest || G.sfx);
        s.start(t0, R() * Math.max(0, G.white.duration - dur - 0.1)); s.stop(t0 + dur + 0.05);
        return { s: s, f: f, g: g };
      }
      // open.js's grains: crushed turf under a stud, tuned low
      function grains(n, at, f0, f1, peak, q, dest) {
        var ac = G.ac, t0 = ac.currentTime + (at || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), rate = 0.9 + R() * 0.22;
        s.buffer = G.grain[(n > 12 ? 3 : 0) + Math.floor(R() * 3)]; s.playbackRate.value = rate;
        var span = s.buffer.duration / rate;
        f.type = 'bandpass'; f.Q.value = q || 0.9; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + span);
        g.gain.value = peak; s.connect(f); f.connect(g); g.connect(dest || G.sfx); s.start(t0);
      }

      /* ------------------------------------------------------------------- the slots (recordings) -- */
      // a slot's takes: its variants (load()'s cues), or its own buffer (from `at` for `dur`, else the whole of it)
      function takes(name) {
        var sl = SLOTS[name];
        if (!sl || !sl.buffer) return null;
        if (sl.variants && sl.variants.length && sl.variants[0].buffer === sl.buffer) return sl.variants;
        var b = sl.buffer, at = +sl.at || 0, dur = +sl.dur || 0;
        if (!(at >= 0 && dur > 0 && at + dur <= b.duration + 1e-6)) { at = 0; dur = b.duration; }
        return [{ buffer: b, at: at, dur: dur, gain: 1, loop: !!sl.loop, tag: null }];
      }
      function has(name, tag) { var v = takes(name); return !!(v && (!tag || v.some(function (x) { return x.tag === tag; }))); }
      // one take of a slot: by its tag, else a different one from the last time
      function pick(name, tag) {
        var v = takes(name);
        if (!v) return null;
        if (tag) v = v.filter(function (x) { return x.tag === tag; });
        else if (v.some(function (x) { return x.tag; })) v = [v[0]];
        if (!v.length) return null;
        var i = Math.floor(R() * v.length) % v.length;
        if (v.length > 1 && v[i] === S.last[name]) i = (i + 1) % v.length;
        S.last[name] = v[i];
        return v[i];
      }
      // a recording played once (or, a loop, until stopped): instead of the synthesised voice; into dest (an end's
      // bus, or the recordings' own); returns the voice, or null when the slot is empty
      function playSlot(name, dest, k, opt) {
        opt = opt || {};
        if (!G) return null;
        var v = pick(name, opt.tag);
        if (!v) return null;
        try {
          var ac = G.ac, t0 = now() + (opt.at || 0), s = ac.createBufferSource(), g = ac.createGain(), sl = SLOTS[name];
          var lvl = (+v.gain || 1) * (+sl.gain || 1) * (k == null ? 1 : k);
          s.buffer = v.buffer;
          g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, lvl), t0 + 0.012);
          s.connect(g); g.connect(dest || G.recIn);
          if (v.loop || sl.loop) { s.loop = true; s.loopStart = v.at; s.loopEnd = v.at + v.dur; s.start(t0, v.at); }
          else s.start(t0, v.at, v.dur);
          var end = v.loop || sl.loop ? Infinity : t0 + v.dur + 0.05;
          return voice({ name: name, rec: true, mood: !!opt.mood, side: opt.side, end: end, stop: function (t, tau) {
            g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.setTargetAtTime(0.0001, t, tau || 0.15);
            try { s.stop(t + 5 * (tau || 0.15) + 0.05); } catch (e) {}
          } });
        } catch (e) { return null; }
      }
      // where an end is heard from, from the camera: pan (its right is +), front (+1 ahead, -1 behind), and so the
      // brightness and the level a crowd voice there takes (no camera: the Hero cam's, looking down the pitch at -z)
      function endView(side) {
        var E = ENDS[side ? 1 : 0], c = CAM(), px = 1.15, pz = -32.4, fx = 0, fz = -1, rx = 1, rz = 0;
        if (c && c.matrixWorld) {
          var m = c.matrixWorld.elements;
          px = m[12]; pz = m[14]; rx = m[0]; rz = m[2]; fx = -m[8]; fz = -m[10];
          var fl = Math.hypot(fx, fz) || 1, rl = Math.hypot(rx, rz) || 1; fx /= fl; fz /= fl; rx /= rl; rz /= rl;
        }
        var dx = E[0] - px, dz = E[2] - pz, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        var front = dx * fx + dz * fz, pan = clamp((dx * rx + dz * rz) * 0.85, -0.85, 0.85), u = (front + 1) / 2;
        return { pan: pan, front: front, lp: 2200 * Math.pow(9000 / 2200, u), k: 0.72 + 0.28 * u, dist: dl };
      }
      // a voice of the crowd at one end: its filter, its pan, its level; into the synthesised voices (or the
      // recordings' bus: rec)
      function endBus(side, k, rec) {
        var V = endView(side), lp = G.filt('lowpass', rec ? Math.min(16000, V.lp * 1.6) : V.lp, 0.5), p = G.panner(rec ? G.recIn : G.voices), g = G.gain(V.k * (k == null ? 1 : k), lp);
        lp.connect(p); if (p.pan) p.pan.value = V.pan;
        return { in: g, lp: lp, p: p, side: side };
      }
      // a recording from one end (side), at level k; null when the slot is empty
      function recAt(name, side, k, opt) { return has(name, opt && opt.tag) ? playSlot(name, endBus(side, 1, true).in, k, Object.assign({ side: side }, opt || {})) : null; }
      function voice(v) { S.voices.push(v); return v; }
      function stopVoices(pred, t, tau) { S.voices = S.voices.filter(function (v) { if (!pred || pred(v)) { try { v.stop(t || now(), v.rec ? tau : undefined); } catch (e) {} return false; } return true; }); }

      /* ----------------------------------------------------------------------------- the crowd's voices -- */
      // a cheer from one end: the pink noise, bright, up in a breath, held, then let go
      function cheer(side, level, hold, fall) {
        var ac = G.ac, t0 = now(), B = endBus(side, 1), s = ac.createBufferSource();
        s.buffer = G.pink; s.loop = true;
        var f1 = G.filt('bandpass', 1050, 0.6), f2 = G.filt('bandpass', 2500, 1.0), g1 = G.gain(VK.cheer, null), g2 = G.gain(0.55 * VK.cheer, null), e = G.gain(0.0001, B.in);
        s.connect(f1); f1.connect(g1); g1.connect(e); s.connect(f2); f2.connect(g2); g2.connect(e);
        // ("hey!": the top band swells twice as the cheer takes)
        f1.frequency.setValueAtTime(900, t0); f1.frequency.setTargetAtTime(1250, t0, 0.25);
        e.gain.setValueAtTime(0.0001, t0); e.gain.setTargetAtTime(level, t0, 0.12);
        e.gain.setTargetAtTime(0.0001, t0 + hold, fall / 3);
        s.start(t0, R() * G.pink.duration * 0.9); s.stop(t0 + hold + fall + 0.5);
        return voice({ name: 'cheer', side: side, end: t0 + hold + fall + 0.5, stop: function (t) { e.gain.cancelScheduledValues(t); e.gain.setTargetAtTime(0.0001, t, 0.2); try { s.stop(t + 1); } catch (x) {} } });
      }
      // a groan from one end: a 300 Hz band of the pink swelling to its level and falling over 1.5 s, and a chorus of
      // "oh"s (detuned saws through two vowel formants) sliding down under it
      function groan(side, level) {
        if (recAt('groan', side, level * RK.groan / 0.7)) return null;
        var ac = G.ac, t0 = now(), B = endBus(side, 1), s = ac.createBufferSource(), e = G.gain(0.0001, B.in);
        s.buffer = G.pink; s.loop = true;
        var bg = G.gain(VK.groan, e), bp = G.filt('bandpass', 330, 1.4, bg); s.connect(bp);
        bp.frequency.setValueAtTime(330, t0); bp.frequency.exponentialRampToValueAtTime(235, t0 + 1.6);
        var vf1 = G.filt('bandpass', 520, 2.6), vf2 = G.filt('bandpass', 880, 3.2), vg = G.gain(0.0001, bg), vlp = G.filt('lowpass', 1600, 0.6, vg);
        vf1.connect(vlp); vf2.connect(vlp);
        var N = LOWQ ? 6 : 12, oscs = [];
        for (var i = 0; i < N; i++) {
          var f0 = 118 + 85 * R(), os = ac.createOscillator(); os.type = 'sawtooth';
          os.frequency.setValueAtTime(f0, t0); os.frequency.exponentialRampToValueAtTime(f0 * (0.74 + 0.08 * R()), t0 + 1.7);
          os.detune.value = (R() - 0.5) * 30;
          var og = G.gain(0.5 / N, null); os.connect(og); og.connect(vf1); og.connect(vf2);
          os.start(t0 + R() * 0.12); os.stop(t0 + 2.4); oscs.push(os);
        }
        vg.gain.setValueAtTime(0.0001, t0); vg.gain.setTargetAtTime(2.2, t0, 0.1);
        e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(level, t0 + 0.25);
        e.gain.setTargetAtTime(0.0001, t0 + 0.35, 0.45);
        s.start(t0, R() * G.pink.duration * 0.9); s.stop(t0 + 2.4);
        return voice({ name: 'groan', side: side, end: t0 + 2.5, stop: function (t) { e.gain.cancelScheduledValues(t); e.gain.setTargetAtTime(0.0001, t, 0.1); } });
      }
      // a gasp: a quick breath in (bright noise) and a rising "ah", swelling in 0.3 s, then gone into the roar or groan
      function gasp(side, k) {
        if (recAt('gasp', side, k == null ? RK.gasp : k)) return null;
        var ac = G.ac, t0 = now(), B = endBus(side, 1), e = G.gain(0.0001, B.in), s = ac.createBufferSource();
        s.buffer = G.pink; s.loop = true;
        var gk = G.gain(VK.gasp, e), bp = G.filt('bandpass', 1300, 0.8, gk); s.connect(bp);
        var vf1 = G.filt('bandpass', 780, 2.4), vf2 = G.filt('bandpass', 1250, 3), vg = G.gain(1.6, gk); vf1.connect(vg); vf2.connect(vg);
        var N = LOWQ ? 4 : 8;
        for (var i = 0; i < N; i++) {
          var f0 = 170 + 120 * R(), os = ac.createOscillator(); os.type = 'sawtooth';
          os.frequency.setValueAtTime(f0, t0); os.frequency.exponentialRampToValueAtTime(f0 * 1.18, t0 + 0.3);
          var og = G.gain(0.5 / N, null); os.connect(og); og.connect(vf1); og.connect(vf2); os.start(t0); os.stop(t0 + 1.1);
        }
        e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.75, t0 + 0.3); e.gain.setTargetAtTime(0.0001, t0 + 0.32, 0.22);
        s.start(t0, R() * G.pink.duration * 0.9); s.stop(t0 + 1.2);
        return voice({ name: 'gasp', side: side, end: t0 + 1.2, stop: function (t) { e.gain.cancelScheduledValues(t); e.gain.setTargetAtTime(0.0001, t, 0.08); } });
      }
      // the inhale before a kick: an "ooh" of air rising through the last stride, held until the strike (recorded: a
      // group's breath in, from the taker's end)
      function inhale() {
        if (has('inhale') && playSlot('inhale', endBus(TAKER, 1, true).in, RK.inhale, { mood: true })) return null;
        var ac = G.ac, t0 = now(), s = ac.createBufferSource(), e = G.gain(0.0001, G.voices), ik = G.gain(VK.inhale, e), bp = G.filt('bandpass', 560, 1.1, ik);
        s.buffer = G.pink; s.loop = true; s.connect(bp);
        bp.frequency.setValueAtTime(560, t0); bp.frequency.exponentialRampToValueAtTime(1250, t0 + 2.2);
        e.gain.setValueAtTime(0.0001, t0); e.gain.linearRampToValueAtTime(0.16, t0 + 2.0);
        s.start(t0, R() * G.pink.duration * 0.9);
        return voice({ name: 'inhale', end: Infinity, mood: true, stop: function (t) { e.gain.cancelScheduledValues(t); e.gain.setValueAtTime(e.gain.value, t); e.gain.setTargetAtTime(0.0001, t, 0.06); try { s.stop(t + 0.6); } catch (x) {} } });
      }
      // a finger whistle in the stands (kart's crowd whistle), from one end
      function fanWhistle(side, k, at) {
        var B = endBus(side, 1), wf = 1500 + R() * 1100;
        tone(wf, at || 0, 0.16 + R() * 0.22, 'sine', (0.012 + 0.03 * R()) * k, wf * (R() < 0.5 ? 1.35 : 0.8), B.in);
      }

      /* -------------------------------------------------------------------------------------- moods -- */
      function mood(name, opt) {
        if (!MOODS[name]) return false;
        opt = opt || {};
        var prev = S.mood;
        S.mood = name; S.kind = opt.kind || null; S.moodAt = 0;
        if (opt.side === 0 || opt.side === 1) S.side = opt.side;
        S.on = name === 'off' ? 0 : 1;
        // the hush's clock (the shushing settles from the whistle on, through the lock), and the heat: only between
        // the whistle and the strike
        if (name === 'hush' && prev !== 'hush' && prev !== 'inhale') S.hushT = 0;
        if (name !== 'hush' && name !== 'inhale') { S.heat = 0; S.heatLocked = false; S.heatAge = 9; }
        S.sighT = 0;
        if (name === 'hush') S.coughT = 2.6 + R() * 2;
        if (!build()) return true;
        var t0 = now();
        applyOn(false);
        // what belongs to the last mood goes (the inhale); a cheer or a groan runs its course (the replay: the moment
        // is over, the crowd's own voices let go, a recording over a breath; the bed carries on, muffled)
        stopVoices(function (v) { return v.mood || name === 'off' || name === 'replay'; }, t0, name === 'replay' ? 0.3 : 0.12);
        if (name === 'off') { S.hbTarget = 0; S.hbBpm = 0; return true; }
        var other = 1 - S.side;
        if (name === 'inhale') inhale();
        else if (name === 'gasp') gasp(S.side);
        else if (name === 'roar') {
          // the happy end roars ("Gol!" over a wordless cheer); the other end's groan is lost under it
          var gol = recAt('roar', S.side, RK.gol, { tag: 'gol' }), ch = recAt('roar', S.side, RK.cheer, { tag: 'cheer' });
          if (!gol && !ch && !recAt('roar', S.side, RK.gol)) { cheer(S.side, 0.95, 1.9, 1.8); groan(other, 0.3); }
          S.whistleT = 2.6;
        } else if (name === 'groan') {
          // the unlucky end groans (after a save, the let-down of a crowd that thought it was in), a sigh follows;
          // the other end cheers at 0.6 (design §7.2)
          var saved = S.kind === 'saved' || S.kind === 'save';
          if (!(saved && recAt('letdown', other, RK.letdown))) groan(other, 0.7);
          if (!recAt('roar', S.side, RK.cheerOther, { tag: 'cheer' })) cheer(S.side, 0.6, 1.2, 1.4);
          S.sighT = 0.9;
          S.whistleT = 2.2;
        }
        if (prev === 'off') { S.e = Math.min(S.e, 0.1); }
        return true;
      }
      // the heat (the owner's mechanic: the tap rate, 0..1), each frame from the set to the strike; frozen at the lock
      function heat(H, opt) {
        var locked = !!(opt && opt.locked);
        if (!(locked && S.heatLocked)) S.heat = clamp(+H || 0, 0, 1);
        S.heatLocked = locked; S.heatAge = 0;
        return S.heat;
      }
      // the heat as the crowd hears it: only in the hush and the inhale, only while it is being fed
      function heatNow() { return (S.mood === 'hush' || S.mood === 'inhale') && S.heatAge < 0.5 ? S.heat : 0; }

      /* ------------------------------------------------------------------------------------- effects -- */
      var SFX = {
        // the referee's pea whistle: two detuned sines near 3 kHz, the pea's 30 Hz trill in their level and pitch, and
        // the breath through it; one blast of 0.45 s
        whistle: function (k, p) {
          if (playSlot('refWhistle', G.sfx, k)) return;
          var ac = G.ac, t0 = now(), dur = 0.45 / p, out = G.gain(0.0001, G.sfx), am = G.gain(0.55, out), lfo = ac.createOscillator(), amD = G.gain(0.42, null), fmD = G.gain(55 * p, null);
          lfo.type = 'sine'; lfo.frequency.value = 30 * p; lfo.connect(amD); amD.connect(am.gain); lfo.connect(fmD);
          [2950, 3110].forEach(function (f, i) { var os = ac.createOscillator(); os.type = i ? 'triangle' : 'sine'; os.frequency.value = f * p; fmD.connect(os.frequency); var og = G.gain(i ? 0.5 : 0.7, am); os.connect(og); os.start(t0); os.stop(t0 + dur + 0.08); });
          lfo.start(t0); lfo.stop(t0 + dur + 0.08);
          out.gain.setValueAtTime(0.0001, t0); out.gain.exponentialRampToValueAtTime(0.2 * k, t0 + 0.012); out.gain.setValueAtTime(0.2 * k, t0 + dur - 0.05); out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          burst(0, dur, 0.035 * k, 3200 * p, 2900 * p, 1.2);
        },
        // a stud in the turf: a little crushed grass and a soft press
        studs: function (k, p) { grains(8, 0, 1100 * p, 420 * p, 0.09 * k, 0.9); tone(78 * p, 0, 0.06 / p, 'sine', 0.06 * k, 55 * p); },
        // the plant foot: harder, lower
        plant: function (k, p) { grains(14, 0, 1300 * p, 380 * p, 0.16 * k, 0.9); tone(72 * p, 0, 0.12 / p, 'sine', 0.2 * k, 44 * p); },
        // a tap of KICK (each accepted one; the director sends no ignored or mashed tap): a dry tick, 22 ms, its
        // pitch rising with the heat (x1 cold to x1.5 on fire); never two at once at 17 a second, far under -18 dBFS
        tap: function (k, p, a) {
          var h = clamp(+a.heat || 0, 0, 1), f = 1750 * (1 + 0.5 * h) * p;
          burst(0, 0.02, 0.09 * k, f * 1.2, f * 0.85, 2.4, G.sfx, 'bandpass', 0.0015);
          tone(f * 0.5, 0, 0.022, 'sine', 0.045 * k, f * 0.42, G.sfx, 0.001);
          S.taps++;
        },
        // the lock (the last stride: HOLD, then release on the plant): a short swell, hotter brighter, and a soft
        // low knock on its crest; on fire, a shimmer over it
        lock: function (k, p, a) {
          var h = clamp(+a.heat || 0, 0, 1);
          burst(0, 0.34, (0.07 + 0.07 * h) * k, 450 * p, (1500 + 1300 * h) * p, 1.3, G.sfx, 'bandpass', 0.24);
          tone(98 * p, 0.2, 0.16, 'sine', (0.12 + 0.06 * h) * k, 70 * p, G.sfx, 0.004);
          if (h >= 0.9) tone(2600 * p, 0.05, 0.3, 'triangle', 0.02 * k, 3400 * p, G.sfx, 0.12);
        },
        // the strike (open.js thud), and the ball's own "pock" over it
        thud: function (k, p, a) {
          var pw = clamp(+a.power || 1, 0.3, 1.5);
          if (!a.replay) { stopVoices(function (v) { return v.name === 'inhale'; }); S.heatAge = 9; }
          tone((120 + pw * 30) * p, 0, 0.16 / p, 'sine', (0.5 + pw * 0.25) * k, 45 * p, G.front, 0.006);
          burst(0, 0.09 / p, (0.35 + pw * 0.2) * k, 2400 * p, 500 * p, 1.2, G.front);
          burst(0, 0.045 / p, 0.32 * k * pw, 720 * p, 640 * p, 4, G.front, 'bandpass', 0.002);
        },
        // the ball away through the air: a band of noise falling as it goes
        whoosh: function (k, p, a) { var v = clamp((+a.speed || 22) / 22, 0.5, 1.6); burst(0.02, 0.42 / p, 0.12 * v * k, 1800 * v * p, 650 * p, 1.8, G.front, 'bandpass', 0.05); },
        // the woodwork: a struck tube's out-of-tune partials (a free bar's 1, 2.76, 5.4, 8.93: open.js clank), rung
        // longer and lower than a tank's arm, over the click and the knock of the ball
        clank: function (k, p, a) {
          var sp = clamp((+a.speed || 20) / 25, 0.3, 1.3), f = ((a.part === 'bar' ? 480 : 560) + R() * 70) * p;
          tone(f, 0, 0.95 / p, 'sine', 0.16 * k * sp); tone(f * 2.76, 0, 0.6 / p, 'sine', 0.1 * k * sp); tone(f * 5.4, 0, 0.32 / p, 'sine', 0.06 * k * sp); tone(f * 8.93, 0, 0.14 / p, 'sine', 0.035 * k * sp);
          tone(f * 1.5, 0, 0.05, 'square', 0.04 * k * sp, f);
          burst(0, 0.05 / p, 0.45 * k * sp, 6400 * p, 2600 * p, 1.2); tone(150 * p, 0, 0.11 / p, 'sine', 0.24 * k * sp, 70 * p);
        },
        // a glove on the ball: a slap (2-6 kHz noise, 60 ms) and a 120 Hz thump; held, the second hand closes on it;
        // off the body or a leg, duller. Live (not the replay), the crowd gasps at the save
        glove: function (k, p, a) {
          if (!a.replay && S.gaspT <= 0 && S.mood !== 'roar' && S.mood !== 'groan' && has('gasp')) { recAt('gasp', S.side, RK.gaspSave); S.gaspT = 1.5; }
          if (a.part === 'body' || a.part === 'leg' || a.part === 'head' || a.part === 'arm') { burst(0, 0.08 / p, 0.3 * k, 1100 * p, 600 * p, 1.1); tone(95 * p, 0, 0.12 / p, 'sine', 0.3 * k, 60 * p); return; }
          burst(0, 0.06 / p, 0.55 * k, 4200 * p, 2400 * p, 0.7); burst(0, 0.03 / p, 0.3 * k, 6000 * p, 5000 * p, 1.5, null, 'highpass');
          tone(120 * p, 0, 0.09 / p, 'sine', 0.2 * k, 80 * p);
          if (a.held) { burst(0.045 / p, 0.05 / p, 0.22 * k, 3000 * p, 1800 * p, 0.8); tone(90 * p, 0.05 / p, 0.14 / p, 'sine', 0.2 * k, 60 * p); }
        },
        // the net: a burst of 1.5-5 kHz noise with a flutter in it (the mesh shaking), 0.35 s, and the rope's thump
        swish: function (k, p, a) {
          var ac = G.ac, t0 = now(), d = clamp(+a.depth || 0.3, 0, 0.6), dur = 0.35 / p, out = G.gain(0.0001, G.sfx), fl = G.gain(0.6, out), lfo = ac.createOscillator(), lg = G.gain(0.4, null);
          lfo.frequency.setValueAtTime(23 * p, t0); lfo.frequency.exponentialRampToValueAtTime(12 * p, t0 + dur); lfo.connect(lg); lg.connect(fl.gain);
          var b = burst(0, dur, 1, 2800 * p, 2200 * p, 0.55, fl, 'bandpass', 0.01), hp = G.filt('highpass', 1500 * p, 0.7);
          b.g.disconnect(); b.g.connect(hp); hp.connect(fl);
          out.gain.setValueAtTime(0.0001, t0); out.gain.exponentialRampToValueAtTime((0.22 + 0.35 * d) * k, t0 + 0.015); out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          lfo.start(t0); lfo.stop(t0 + dur + 0.05);
          tone(82 * p, 0, 0.16 / p, 'sine', 0.12 * k, 58 * p);
        },
        // the ball on the turf
        bounce: function (k, p) { tone(92 * p, 0, 0.09 / p, 'sine', 0.16 * k, 60 * p); grains(8, 0, 900 * p, 400 * p, 0.06 * k, 0.9); },
        // a miss, mocked: a dozen finger whistles from the happy end over 1.6 s
        derision: function (k) {
          if (playSlot('derision', G.voices, k)) return;
          for (var i = 0; i < (LOWQ ? 7 : 12); i++) fanWhistle(S.side, 1.6 * k, R() * 1.6);
        },
      };
      function sfx(name, a) {
        var f = SFX[name];
        if (!f) return false;
        a = a || {};
        if (!build()) return false;
        var k = a.gain == null ? 1 : clamp(+a.gain || 0, 0, 2), p = a.pitch == null ? 1 : clamp(+a.pitch || 1, 0.25, 4);
        S.sfx++;
        f(k, p, a);
        return true;
      }

      /* ----------------------------------------------------------------------------------- the heart -- */
      // one beat: a 55 Hz thump and a 45 Hz one after it (90 and 70 ms), each with its octave for a phone's speaker
      function beat(t0, bpm) {
        var ac = G.ac, gap = 0.36 * 60 / bpm;
        [[55, 0.09, 0.35], [45, 0.07, 0.27]].forEach(function (b, i) {
          var t = t0 + (i ? gap : 0);
          [[b[0], 1], [b[0] * 2, 0.22]].forEach(function (h) {
            var os = ac.createOscillator(), g = ac.createGain();
            os.type = 'sine'; os.frequency.setValueAtTime(h[0] * 1.12, t); os.frequency.exponentialRampToValueAtTime(h[0] * 0.9, t + b[1]);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(b[2] * h[1], t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + b[1] + 0.03);
            os.connect(g); g.connect(G.hb); os.start(t); os.stop(t + b[1] + 0.06);
          });
        });
      }
      function heartbeat(bpm) {
        bpm = +bpm || 0;
        S.hbTarget = bpm > 0 ? clamp(bpm, 30, 200) : 0;
        if (!S.hbTarget) S.hbBpm = 0;
        else if (!S.hbBpm) { S.hbBpm = S.hbTarget; S.hbNext = G ? now() + 0.05 : 0; }
        return S.hbTarget;
      }
      function duck(ms) {
        if (!build()) return false;
        var t0 = now(), hold = clamp(+ms || 50, 10, 1000) / 1000;
        [G.crowdDuck, G.fxDuck, G.hb].forEach(function (n) {
          n.gain.cancelScheduledValues(t0); n.gain.setValueAtTime(n.gain.value, t0); n.gain.linearRampToValueAtTime(0.32, t0 + 0.006);
          n.gain.setValueAtTime(0.32, t0 + hold); n.gain.setTargetAtTime(1, t0 + hold, 0.05);
        });
        return true;
      }

      /* -------------------------------------------------------------------------------- every frame -- */
      function rmsOf(an) {
        an.getFloatTimeDomainData(G.buf);
        var s = 0, b = G.buf; for (var i = 0; i < b.length; i++) s += b[i] * b[i];
        return Math.sqrt(s / b.length);
      }
      function step(dt) {
        if (!build()) return;
        dt = clamp(+dt || 0, 0, 0.25);
        var t0 = now(), M = MOODS[S.mood], RM = REC[S.mood] || REC.ambient, i;
        S.steps++; S.moodAt += dt; S.heatAge += dt; S.gaspT -= dt;
        if (S.mood === 'hush' || S.mood === 'inhale') S.hushT += dt;
        var H = heatNow(), hW = smooth(0.25, 1, H);
        // the excitement: Gameplay Football's rule, per 10 ms, as a rate (over the hush, the heat lifts it: 0.25 H)
        var eT = M.e + 0.25 * H;
        S.e = eT + (S.e - eT) * Math.pow(eT > S.e ? 0.98 : (S.mood === 'hush' || S.mood === 'off' ? 0.99 : 0.998), dt / 0.01);
        // the recordings in (the murmur's loop is the sign): the synthesised bed and cheer step back to give them room
        loops();
        var rec = !!G.loops.bedAmbient;
        S.synthK = damp(S.synthK, rec ? RM.synth : 1, 1 / 0.6, dt);
        var cheerK = rec ? RM.cheer : 1;
        // the bed, its brightness, the cheer in it
        var tau = S.mood === 'ambient' && S.bed < 0.05 ? 0.3 : M.tau;
        S.bed = damp(S.bed, M.bed, 1 / tau, dt);
        var lpT = Math.log(clamp(M.lp * (0.85 + 0.3 * S.e), 200, 18000));
        S.lp = Math.exp(damp(Math.log(S.lp), lpT, 1 / M.lpTau, dt));
        S.cheer = damp(S.cheer, M.cheer * S.e * S.e, 1 / Math.max(0.08, tau), dt);
        G.bedG.gain.setTargetAtTime(S.bed * K.bed * S.synthK, t0, 0.03);
        G.cheerG.gain.setTargetAtTime(S.cheer * K.cheer * cheerK, t0, 0.04);
        G.lp.frequency.setTargetAtTime(S.lp, t0, 0.03); G.lp2.frequency.setTargetAtTime(Math.min(18000, S.lp * 1.15), t0, 0.03);
        // the recorded beds: the murmur (lifted by the heat over the hush: x3 on fire), the shushing (loud at the
        // whistle, settling in about 1.6 s to 12%), the whistling at the taker (smoothstep(0.25, 1, H)); each at its own
        // pace
        var hushing = S.mood === 'hush' || S.mood === 'inhale';
        S.mix.walla = damp(S.mix.walla, RM.walla * (hushing ? 1 + 2 * H : 1), 1 / tau, dt);
        S.mix.shush = damp(S.mix.shush, RM.shush * (hushing ? 0.12 + 0.88 * Math.exp(-S.hushT / 1.6) : 0), 1 / (hushing ? 0.12 : 0.35), dt);
        S.mix.whistle = damp(S.mix.whistle, hushing ? hW : 0, 1 / (hushing && S.heatAge < 0.5 ? 0.25 : 0.12), dt);
        S.recLp = Math.exp(damp(Math.log(S.recLp), Math.log(RM.lp), 1 / Math.max(0.08, M.lpTau), dt));
        G.recLp.frequency.setTargetAtTime(S.recLp, t0, 0.03);
        setLoop('bedAmbient', S.mix.walla * RK.walla, t0);
        setLoop('bedHush', S.mix.shush * RK.shush, t0);
        setLoop('whistleTaker', S.mix.whistle * RK.whistle, t0);
        // (kart's three bands, each breathing on its own; the top two lifted and brightened by the excitement; under
        // the recordings, the synthesised bed is their size, low: its top two bands at a third)
        var topK = rec ? 0.35 : 1;
        for (i = 0; i < 3; i++) {
          var B = G.bands[i];
          B.v = clamp(B.v + (R() - 0.5) * dt * 3, 0.15, 0.45);
          B.g.gain.setTargetAtTime(B.v * (i ? (1 + S.e * 0.9) * topK : 1), t0, 0.08);
          B.f.frequency.setTargetAtTime(B.base * (1 + S.e * (i === 2 ? 0.35 : 0.15)), t0, 0.1);
        }
        // (LA's cheer rolling round the stadium now and then, at the walk; the recordings have their own life)
        S.roll -= dt;
        if (S.mood === 'ambient' && S.roll <= 0) { G.hiG.gain.cancelScheduledValues(t0); G.hiG.gain.setTargetAtTime(0.42 * topK, t0, 0.35); G.hiG.gain.setTargetAtTime(0.16 * topK, t0 + 1.4, 1.1); S.roll = 5 + R() * 9; }
        else if (S.mood !== 'ambient' && S.roll < 2) { G.hiG.gain.setTargetAtTime(0.16 * topK, t0, 0.3); S.roll = 2 + R() * 6; }
        // the bed leans to the happy end in a roar or a groan
        var panT = S.mood === 'roar' || S.mood === 'groan' ? 0.5 * endView(S.side).pan : 0;
        S.pan = damp(S.pan, panT, 3, dt);
        if (G.pan.pan) G.pan.pan.setTargetAtTime(S.pan, t0, 0.05);
        // finger whistles: now and then from the keeper's end at the walk; at the taker as the heat rises (fewer over
        // the recorded whistling); a burst from the happy end after a kick
        S.whistleT = Math.max(0, S.whistleT - dt);
        var rate = S.mood === 'ambient' ? 0.35 : S.mood === 'roar' ? 7 * S.e : S.mood === 'groan' && S.whistleT > 0 ? 2.5 : S.mood === 'replay' ? 0.2 : hushing ? 6 * hW * (G.loops.whistleTaker ? 0.35 : 1) : 0;
        if (rate > 0 && R() < rate * dt) fanWhistle(S.mood === 'ambient' || S.mood === 'replay' || hushing ? 1 - TAKER : S.side, S.mood === 'roar' ? 0.8 + 0.6 * S.e : 0.7);
        // a cough in the hush now and then (recorded only), from either end
        if (S.mood === 'hush' && has('cough')) { S.coughT -= dt; if (S.coughT <= 0) { recAt('cough', R() < 0.5 ? 0 : 1, RK.cough * (0.6 + 0.8 * R())); S.coughT = 1.6 + R() * 3.2; } }
        // the sigh after a groan or a let-down (recorded only), from the unlucky end
        if (S.sighT > 0) { S.sighT -= dt; if (S.sighT <= 0 && S.mood === 'groan') recAt('sigh', 1 - S.side, RK.sigh); }
        // the heart: its rate glides to the target (72 at the set, rising with the heat, 80 + 60 H at the lock); each
        // beat scheduled ahead
        if (S.hbTarget > 0) {
          S.hbBpm = damp(S.hbBpm || S.hbTarget, S.hbTarget, 1.1, dt);
          if (S.hbNext < t0) S.hbNext = t0 + 0.02;
          while (S.hbNext < t0 + 0.15) { beat(S.hbNext, S.hbBpm); S.hbNext += 60 / S.hbBpm; }
        }
        // the voices that have run their course
        S.voices = S.voices.filter(function (v) { return v.end > t0; });
        // the meters: RMS after every filter and gain (critique #16), smoothed over a quarter second
        S.rms.crowd = damp(S.rms.crowd, rmsOf(G.anCrowd), 4, dt);
        S.rms.fx = damp(S.rms.fx, rmsOf(G.anFx), 4, dt);
        S.rms.master = damp(S.rms.master, rmsOf(G.anMaster), 4, dt);
      }
      // the recorded loops: one source each, looping its cue from a random point, started once its slot holds a
      // buffer (and made again when the buffer changes); its level set every frame, eased in when new
      function loops() {
        ['bedAmbient', 'bedHush', 'whistleTaker'].forEach(function (nm) {
          var have = G.loops[nm], tk = takes(nm), v = tk && tk[0];
          if (have && v && have.v === v) return;
          if (have && have.v && v && have.v.buffer === v.buffer && have.v.at === v.at) { have.v = v; return; }
          if (have) { try { have.s.stop(); } catch (e) {} try { have.g.disconnect(); } catch (e) {} delete G.loops[nm]; }
          if (!v) return;
          try {
            var s = G.ac.createBufferSource(), g = G.gain(0, G.recIn);
            s.buffer = v.buffer; s.loop = true; s.loopStart = v.at; s.loopEnd = v.at + v.dur; s.connect(g);
            s.start(now(), v.at + R() * v.dur * 0.9);
            G.loops[nm] = { s: s, g: g, v: v, born: now() };
          } catch (e) {}
        });
      }
      function setLoop(nm, lvl, t0) {
        var L = G.loops[nm];
        if (!L) return;
        L.g.gain.setTargetAtTime(lvl * (+L.v.gain || 1) * (+SLOTS[nm].gain || 1), t0, t0 - L.born < 1.5 ? 0.35 : 0.05);
        L.level = lvl;
      }

      /* ------------------------------------------------------------------------ the recorded crowd -- */
      // the library's audio-crowd-shootout: its two sheets (stereo beds and moments, mono one-shots) fetched through
      // the runtime's hash check, decoded off the page's own audio at the sheets' 32 kHz (an AudioBuffer plays in any
      // context: no gesture is needed), each sheet's priming measured from its marker, and the cues put in the SLOTS
      // (a phone keeps the stereo sheet as mono). Anything missing or failing leaves every slot empty: the synth plays
      function findAsset() { try { return typeof ASSETS !== 'undefined' && ASSETS && ASSETS['audio-crowd-shootout'] || null; } catch (e) { return null; } }
      function load(a) {
        if (LOAD.p) return LOAD.p;
        a = a || findAsset();
        var j = a && a.json;
        if (!j || j.kind !== 'sound' || !j.sheets || !j.cues) { LOAD.state = a ? 'unusable' : 'none'; return Promise.resolve(false); }
        var get = typeof o.fetch === 'function' ? o.fetch : typeof fetchChecked === 'function' && a.entry ? function (name) { return fetchChecked(a.id, name, a.entry); } : null;
        if (!get) { LOAD.state = 'no fetch'; return Promise.resolve(false); }
        var OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext), sr = +j.sampleRate || 32000, t0 = Date.now();
        function decode(ab) {
          if (OAC) { var oc = new OAC(1, 1, sr); return new Promise(function (res, rej) { var r = oc.decodeAudioData(ab, res, rej); if (r && r.then) r.then(res, rej); }); }
          var A = AU(); if (A && A.ctx) return A.ctx.decodeAudioData(ab);
          return Promise.reject(new Error('no audio decoder'));
        }
        LOAD.state = 'loading';
        var names = Object.keys(j.sheets);
        LOAD.p = Promise.all(names.map(function (nm) { return get(j.sheets[nm].file).then(decode).then(function (b) { return [nm, b]; }); })).then(function (list) {
          var bufs = {};
          list.forEach(function (x) {
            var nm = x[0], b = x[1], sh = j.sheets[nm], mk = +sh.marker || 0, d0 = b.getChannelData(0), m = 0, at = 0;
            // the marker's crest: where this decoder put the sheet's 0.1 s (a decoder that keeps the priming is late)
            for (var i = 0, n = Math.min(d0.length, Math.round((mk + 0.25) * b.sampleRate)); i < n; i++) if (Math.abs(d0[i]) > m) { m = Math.abs(d0[i]); at = i; }
            var off = mk > 0 && m > 0.1 ? at / b.sampleRate - mk : 0;
            LOAD.offset[nm] = Math.abs(off) < 0.2 ? Math.round(off * 1e5) / 1e5 : 0;
            if (LOWQ && b.numberOfChannels > 1) {
              // (a phone: the stereo sheet folded to one channel, half the memory; kept as it is where that fails)
              try {
                var mono = new (window.AudioBuffer)({ length: b.length, numberOfChannels: 1, sampleRate: b.sampleRate }), md = mono.getChannelData(0), d1 = b.getChannelData(1);
                for (i = 0; i < md.length; i++) md[i] = 0.5 * (d0[i] + d1[i]);
                b = mono;
              } catch (e) {}
            }
            bufs[nm] = b;
          });
          var n = 0;
          Object.keys(j.cues).forEach(function (slot) {
            if (!SLOTS[slot] || !Array.isArray(j.cues[slot])) return;
            var vs = j.cues[slot].filter(function (c) { return bufs[c.sheet] && c.dur > 0; }).map(function (c) {
              return { buffer: bufs[c.sheet], at: Math.max(0, c.at + (LOAD.offset[c.sheet] || 0)), dur: c.dur, gain: +c.gain || 1, loop: !!c.loop, tag: c.tag || null, src: (c.src || []).map(function (s) { return s.id; }) };
            });
            if (!vs.length) return;
            var sl = SLOTS[slot];
            sl.buffer = vs[0].buffer; sl.at = vs[0].at; sl.dur = vs[0].dur; sl.loop = !!LOOPED[slot]; sl.variants = vs; n += vs.length;
          });
          LOAD.state = 'ready'; LOAD.cues = n; LOAD.ms = Date.now() - t0;
          return true;
        }).catch(function (e) {
          LOAD.state = 'failed'; LOAD.err = String(e && e.message || e).slice(0, 200);
          return false;
        });
        return LOAD.p;
      }
      // (tried by itself a moment after the sound is made, in case the director has not asked: the demo, silent,
      // is when it lands)
      try { setTimeout(function () { if (!LOAD.p && findAsset()) load(); }, 700); } catch (e) {}

      /* ---------------------------------------------------------------------------------- the meter -- */
      function db(v) { return v > 1e-6 ? Math.round(200 * Math.log10(v)) / 10 : -120; }
      function level(spec) {
        var A = AU();
        if (A && A.ctx) build();
        var r = 4, rd = function (v) { return Math.round(v * Math.pow(10, r)) / Math.pow(10, r); };
        var out = {
          on: !!G, state: G ? G.ac.state : null, t: G ? rd(now()) : 0, mood: S.mood, side: S.side, kind: S.kind,
          master: G ? rd(G.crowdOn.gain.value) : 0, e: rd(S.e), bed: rd(S.bed), lp: Math.round(S.lp), cheer: rd(S.cheer), pan: rd(S.pan),
          crowd: rd(S.rms.crowd), crowdRms: rd(S.rms.crowd), crowdNow: G ? rd(rmsOf(G.anCrowd)) : 0, fx: rd(S.rms.fx), masterRms: rd(S.rms.master),
          crowdDb: db(S.rms.crowd), fxDb: db(S.rms.fx), masterDb: db(S.rms.master),
          heartbeat: { target: S.hbTarget, bpm: Math.round(S.hbBpm * 10) / 10 }, voices: S.voices.map(function (v) { return v.name; }), steps: S.steps, sfx: S.sfx, taps: S.taps,
          heat: { H: rd(S.heat), locked: S.heatLocked, heard: rd(heatNow()), whistle: rd(S.mix.whistle) },
          slots: Object.keys(SLOTS).filter(function (k) { return !!SLOTS[k].buffer; }),
          rec: { state: LOAD.state, err: LOAD.err, ms: LOAD.ms, cues: LOAD.cues, offset: LOAD.offset, on: !!(G && G.loops.bedAmbient), voices: S.voices.filter(function (v) { return v.rec; }).map(function (v) { return v.name; }), walla: rd(S.mix.walla), shush: rd(S.mix.shush), whistle: rd(S.mix.whistle), synth: rd(S.synthK), lp: Math.round(S.recLp) },
        };
        if (spec && G) {
          // the crowd's spectrum: its centroid, and its energy in octave bands (dB)
          G.anCrowd.getFloatFrequencyData(G.spec);
          var sr = G.ac.sampleRate, n = G.spec.length, hz = sr / 2 / n, bands = [125, 250, 500, 1000, 2000, 4000, 8000], E = bands.map(function () { return 0; }), num = 0, den = 0;
          for (var i = 1; i < n; i++) {
            var f = i * hz, p = Math.pow(10, G.spec[i] / 10); num += f * p; den += p;
            for (var b = 0; b < bands.length; b++) if (f >= bands[b] / Math.SQRT2 && f < bands[b] * Math.SQRT2) E[b] += p;
          }
          out.centroid = den > 0 ? Math.round(num / den) : 0;
          out.octaves = {}; bands.forEach(function (b, i) { out.octaves[b] = db(Math.sqrt(E[i])); });
        }
        return out;
      }
      function dispose() {
        if (!G) return;
        stopVoices(null);
        G.srcs.forEach(function (s) { try { s.stop(); } catch (e) {} });
        for (var nm in G.loops) try { G.loops[nm].s.stop(); } catch (e) {}
        [G.crowdOn, G.fxOn].forEach(function (n) { try { n.disconnect(); } catch (e) {} });
        try { (G.A.limiter || G.A.master).disconnect(G.anMaster); } catch (e) {}
        G = null;
      }

      return { mood: mood, sfx: sfx, heat: heat, load: load, heartbeat: heartbeat, duck: duck, step: step, level: level, SLOTS: SLOTS, dispose: dispose,
        // (tests and the director's debug: the targets the moods use, the recordings' mix, and the graph once made)
        moods: MOODS, rec: REC, recLevels: RK, graph: function () { return G; }, loaded: function () { return LOAD.p || Promise.resolve(false); },
        voice: function (n, side, lv) {
          if (!build()) return false;
          side = side ? 1 : 0; lv = lv == null ? 1 : +lv;
          if (n === 'cheer') cheer(side, lv, 1.2, 1.4); else if (n === 'groan') groan(side, lv); else if (n === 'gasp') gasp(side); else if (n === 'inhale') inhale(); else if (n === 'whistle') fanWhistle(side, lv); else return false;
          return true;
        } };
    }
