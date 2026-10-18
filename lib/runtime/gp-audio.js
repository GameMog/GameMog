    /* ================================================== Grand Prix: the sound (ARTIFICIAL1 M2, lane D: gp-audio.js) == */
    // The race's sound: no music anywhere; the engines, the gear changes and the race's events are the soundtrack.
    // Pasted into boot() by gp.js at /*@include gp-audio.js*/. ONE binding, gpAudio. A VIEW part (INTERFACES M2-1): it
    // reaches the page only through env (env.win, env.fetch, env.asset), so it loads in Node with no page and names
    // nothing of v1's.
    //
    // THE VOICE is v4, the owner's choice of 15 Oct ("v4", docs/RULES.md 1f): our own 1.6 L 90-degree V6 turbo hybrid,
    // rendered with engine-sim (MIT) into a bank of seamless whole-cycle loops (16 rpm points x 3 loads), played by the
    // v2.1 grain engine (shuffled whole-cycle grains, phase-locked to the engine by emulating the browser's k-rate read
    // position, render quantum by render quantum) with candidate A's layer: rpm x 0.875, A's stem mix, its stem EQ, the
    // exhaust high shelf, the phase rotator and the 0.3 downshift blip. The port changes no sound; it changes three things
    // in the code: (1) the read-position emulation is multiplied by k = the buffer's rate / the context's (32 kHz phone
    // loops in a 44.1 or 48 kHz context); (2) A's rotator runs once on the mixed voice instead of once per stem (every mix
    // is linear and time-invariant: the same output; the blow-off still enters after it); (3) the voice is driven by the
    // sim's own rpm, throttle, brake, gear and shift events (the Drive below: v2.1's gearbox minus its shift decisions).
    //
    // TWENTY CARS: the focus car (the player's while racing, the director's on TV) gets the full voice in the camera's
    // mix: chase is v4's chase mix; the T-cam and the cockpit are v4's onboard mix, the one the owner chose v4 on ("a full
    // lap from the cockpit", engine-v4-onboard-lap.wav); TV is v4's trackside chain, and a TV camera on the car itself
    // hears the onboard mix. The nearest rivals get cheaper voices (lite: the same grain voice, exhaust only; mini: two
    // looped loops, no grains), each heard with its time of flight (Doppler), air absorption, 1/r (never closer than 5 m),
    // the exhaust's directivity and its side; the rest of the field is one pooled bed. One peak limiter on the engines'
    // path keeps the page's output under -1 dBTP. A governor steps down on a device whose audio falls behind.
    //
    // THE GARAGE SET (the owner heard it with v4): the fire-up (its cranking spikes cleaned) fires down the grid in the
    // intro (X07), the garage idle is the focus car's idle layer on the grid, the revs, the pit limiter and the pull-away
    // are positional scenery (desktop). The grid answers your revs (X13) in each persona's style.
    //
    // THE WORLD (D-world): the harbour and the helicopter before any picture (X18), the floodlights' contactors and the
    // stands' swell (X28), the crowd as stands with the start's hush, inhale and cheer (X29), the tunnel's own reverb and
    // the bridge's joints (X23), tyres, kerbs, wind, gantries and near misses (X31), the Flap's clack and the thinner
    // wind (X14), the replay's crowd (X32), the podium's fireworks at their true speed of sound (X33), the radio click.
    // Its WORLD, CROWD and EVENTS buses go into env.master; the engines' bus reaches
    // env.out through the world's W.engIn (the tunnel's dry lift and sends). Nothing of it is a file but the crowd's cues.
    //
    //   gpAudio(env) -> A | null      env: { ac, out, quality, warn, win, asset(id), fetch(id, name), master, cfg, seed, T }
    //                                 (null without env.win, env.asset and env.fetch: gp.js's stand-in voice plays)
    //   A.attach({ ac, out }) / A.ready() / A.progress() / A.frame(view, listener, dt) / A.event(name, data)
    //   A.state() / A.tape(on) / A.offline(tape, o) -> Promise<{ sr, ch, meta }> / A.stop()
    //   gpAudio('core') -> the engine's parts, for the lane's tests (the same code the race runs)
    function gpAudio(env) {
      'use strict';
      var $ = gpAudio.$ || (gpAudio.$ = { K: null, banks: {}, loads: {} });
      if (!$.K) $.K = (function () {
        var TAU = Math.PI * 2, Q = 128;                    // Q: the render quantum (k-rate params take one value per quantum)
        function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
        function lerp(a, b, t) { return a + (b - a) * t; }
        function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
        function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        function gauss(R) { var u = 1 - R(), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
        var fround = Math.fround || function (x) { return x; };

        /* ----------------------------------------------------------------------------------- the voice's constants -- */
        var S = 0.875;                                     // voice rpm per sim rpm (the renders' wrapper, engine3 2.1)
        var IDLE_V = 4283;                                 // the garage idle the owner heard (voice rpm)
        var Z = [13, 15, 17, 19, 21, 23, 25, 27];           // input-shaft teeth per gear (the gear whine's pitch)
        // the overrun pops and the upshift bark (v2.1's, with A's 0.3 downshift blip)
        var POPS = { rate: 8, decay: 0.75, gap: 0.11, downMin: 0.4, brakeLo: 0.3, brakeFull: 0.8, lift: 0.45, liftRpm: 9500, minRpm: 6500, bark: 0.7, blip: 0.3 };
        // v2.1's voice mix with A's whines and block stem
        var MIX = { out: 2.6, int: 0.55, mech: 0.16, gear: 0.010, ers: 0.011, turbo: 0.0028, pop: 1.2, bark: 0.11, crack: 0.42, whoosh: 0.30 };
        var GRAINS = { min: 20, max: 40, xf: 3, jump: 0.2 }; // grain length (cycles), cross-fade (cycles), min jump (share)
        var JK = 65;
        var LOADS = [['off', 0], ['part', 0.35], ['on', 1]];
        function xfade(anchors, x, coh) {
          var n = anchors.length; coh = coh || 0;
          if (x <= anchors[0]) return [[0, 1]];
          if (x >= anchors[n - 1]) return [[n - 1, 1]];
          for (var i = 0; i < n - 1; i++) if (x < anchors[i + 1]) {
            var u = (x - anchors[i]) / (anchors[i + 1] - anchors[i]), a = Math.cos(u * Math.PI / 2), b = Math.sin(u * Math.PI / 2), nrm = Math.sqrt(a * a + b * b + 2 * coh * a * b);
            return [[i, a / nrm], [i + 1, b / nrm]];
          }
          return [[n - 1, 1]];
        }
        // a smooth random process with unit rms at any step: an exact Ornstein-Uhlenbeck step (12 Hz) through a one-pole
        // smoother (18 Hz), renormalised for its variance
        function Jitter(seed) {
          var R = rng(seed), y = gauss(R), z = y;
          return { step: function (dt) {
            var a = Math.exp(-dt * TAU * 12), b = Math.exp(-dt * TAU * 18);
            y = a * y + Math.sqrt(1 - a * a) * gauss(R); z = b * z + (1 - b) * y;
            var v = (1 - b) * (1 - b) / (1 - b * b) * (1 + a * b) / (1 - a * b);
            return z / Math.sqrt(v);
          } };
        }
        // the k-rate value the browser reads at a frame from setValueAtTime(c[0], t0) + setValueCurveAtTime(c, t0 + 1e-4, (n-1)/rate)
        function curveAt(c, t0, rate, t) { var x = (t - t0 - 1e-4) * rate, n = c.length; if (x <= 0) return c[0]; if (x >= n - 1) return c[n - 1]; var i = Math.floor(x), u = x - i; return fround(c[i] + (c[i + 1] - c[i]) * u); }
        // an OfflineAudioContext: work at a render time (one suspend per render quantum, shared by every caller)
        function isOffline(ac) { return !!ac && typeof ac.startRendering === 'function'; }
        var SUSP = new WeakMap();
        function atRender(ac, t, fn) {
          var J = SUSP.get(ac); if (!J) { J = {}; SUSP.set(ac, J); }
          var q = Math.round(t * ac.sampleRate / Q), key = 'q' + q;
          // (a callback that throws never holds the render: the error is kept on the context and the render resumes)
          if (!J[key]) { J[key] = []; ac.suspend(q * Q / ac.sampleRate).then(function () { var L = J[key]; J[key] = null; for (var i = 0; i < L.length; i++) { try { L[i](); } catch (e) { (ac.__errors || (ac.__errors = [])).push(String(e && e.stack || e)); } } ac.resume(); }); }
          J[key].push(fn);
        }
        // just-in-time grain nodes for an offline render (v2.1): created >= 0.1 s ahead at a whole second
        function jitAt(ac, t, fn) { var w = Math.floor(t - 0.1); if (w <= 0 || !isOffline(ac)) { fn(); return; } atRender(ac, w, fn); }
        // the grain cross-fade between two grains of one loop at the same cycle phase (coh: the loop's self-coherence)
        function fadeCurve(coh, up, n) { var c = new Float32Array(n); for (var i = 0; i < n; i++) { var u = i / (n - 1), a = Math.cos(u * Math.PI / 2), b = Math.sin(u * Math.PI / 2), nrm = Math.sqrt(a * a + b * b + 2 * coh * a * b); c[i] = (up ? b : a) / nrm; } return c; }
        var NOISE = new WeakMap();
        function noiseBuf(ac) {
          if (NOISE.has(ac)) return NOISE.get(ac);
          var n = Math.floor(ac.sampleRate * 4), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), R = rng(4242);
          for (var i = 0; i < n; i++) d[i] = R() * 2 - 1;
          NOISE.set(ac, b); return b;
        }
        function gainOf(ac, v) { var g = ac.createGain(); g.gain.value = v == null ? 1 : v; return g; }
        function bqOf(ac, type, f, Qv, gain) { var b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Qv == null ? 0.707 : Qv; if (gain != null) b.gain.value = gain; return b; }
        // a peak limiter that is unity under its ceiling: the browser's compressor (6 ms look-ahead) at a hard knee and ratio
        // 20, with the make-up gain Chrome and WebKit add on their own ((1 / curve(0 dBFS))^0.6, so -0.6 x threshold x
        // (1 - 1/ratio) dB at a hard knee) taken back out. ceilDb: where it starts to hold, in dBFS of its input (a pre-gain
        // puts it at the node's -6 dB, so it can sit above 0 dBFS). -> { in, out, comp, makeupDb }
        function Limiter(ac, ceilDb, o) {
          o = o || {};
          var thr = -6, ratio = 20, mk = -0.6 * thr * (1 - 1 / ratio), pre = gainOf(ac, Math.pow(10, (thr - ceilDb) / 20)), c = ac.createDynamicsCompressor();
          c.threshold.value = thr; c.knee.value = 0; c.ratio.value = ratio; c.attack.value = o.attack != null ? o.attack : 0.001; c.release.value = o.release != null ? o.release : 0.1;
          var post = gainOf(ac, Math.pow(10, (ceilDb - thr - mk) / 20));
          pre.connect(c); c.connect(post);
          return { in: pre, out: post, comp: c, ceilDb: ceilDb, makeupDb: mk };
        }

        /* -------------------------------------------------------------------------------------------- the voice -- */
        // Voice(ac, bank, { seed, lite, mix, grains }) -> { stems: { exh, int, mech, whine }, wout, values(c), curves(cs, t0,
        //   rate), set(t, c, tc), reset(t), pop/bark/whoosh(t, a), start(t), stop(t) }. c = { rpm, load, cut, mesh, ers, boost }
        //   in voice rpm. bank = { rpms, loads, loop: { rpm: { off|part|on: { buf, native, ncyc, coh } } }, bangs, whoosh }.
        function Voice(ac, bank, o) {
          o = o || {};
          var sr = ac.sampleRate, lite = !!o.lite, seed = o.seed || 1, R = rng(seed * 7 + 3), mix = {}, k;
          for (k in MIX) mix[k] = o.mix && o.mix[k] != null ? o.mix[k] : MIX[k];
          var GR = o.grains === false ? null : {}; if (GR) { for (k in GRAINS) GR[k] = GRAINS[k]; if (o.grains) for (k in o.grains) GR[k] = o.grains[k]; }
          var V = { stems: {}, params: {}, nodes: [], srcs: [], mix: mix, grains: GR, stats: { grains: 0 }, lite: lite };
          function G(v) { return gainOf(ac, v); }
          function bq(type, f, Qv, gain) { return bqOf(ac, type, f, Qv, gain); }
          var hasPart = !!(bank.loop[bank.rpms[0]] && bank.loop[bank.rpms[0]].part);
          var loads = lite || !hasPart ? [LOADS[0], LOADS[2]] : LOADS, loadAnch = loads.map(function (l) { return l[1]; }), rpms = bank.rpms, ph = R();
          // the cycle-to-cycle detune lives in the loops' playbackRate values; this noise only drives the gear whine
          var jg = null;
          if (!lite) { var jit = ac.createBufferSource(); jit.buffer = noiseBuf(ac); jit.loop = true; V.nodes.push(jit); var jlp = bq('lowpass', 18, 0.5); jg = G(0); jit.connect(jlp); jlp.connect(jg); V.params.jitter = jg.gain; }
          var core = G(1), gate = G(1), exhOut = G(mix.out); V.params.gate = gate.gain;
          rpms.forEach(function (r, i) {
            loads.forEach(function (L, j) {
              var e = bank.loop[r][L[0]], g = G(0); g.connect(core);
              // k: the buffer's frames read per context frame at rate 1 (a 32 kHz loop in a 48 kHz context: 2/3)
              var Sx = { e: e, g: g, rpm: r, i: i, j: j, native: e.native, M: e.buf.length, spc: e.buf.length / e.ncyc, last: 0, R: rng(seed * 1009 + i * 31 + j * 7 + 1), k: e.buf.sampleRate / sr };
              // every loop starts at the voice's cycle phase (ph) plus whole cycles: phase-locked to its neighbours
              Sx.off0 = Math.round((ph + Math.floor(R() * e.ncyc)) * Sx.spc);
              if (!GR) { var s = ac.createBufferSource(); s.buffer = e.buf; s.loop = true; s.connect(g); Sx.s = s; V.nodes.push(s); }
              else { Sx.lane = [G(0), G(0)]; Sx.lane[0].connect(g); Sx.lane[1].connect(g); }
              V.srcs.push(Sx);
            });
          });
          core.connect(gate); gate.connect(exhOut); V.params.bank = core.gain; // (the loops' sum: the idle layer's cross-fade, never values())
          var shots = G(1); shots.connect(exhOut);
          // the exhaust's high shelf (A: -2.5 dB above 3 kHz; the loops and the bangs)
          var shelf = bq('highshelf', 3000, 0.71, -2.5), exh = G(1); exhOut.connect(shelf); shelf.connect(exh); V.stems.exh = exh;
          V.wout = G(1); // the blow-off (it enters after the rotator: the mixes route it)
          if (!lite) {
            // the intake: v2.1's chain, then A's exact inverses of v2.1's two peaks and A's airbox body (+8 dB at 210 Hz) and
            // trumpet (+1 dB at 1,150). (The inverse pairs stay: the stem's gain moves with the load between them, so leaving
            // them out is not the same sound around a shift: measured -44 dB re the stem in those windows.)
            var intOut = G(mix.int), ihp = bq('highpass', 110, 0.7), ibox = bq('peaking', 230, 1.4, 7), itr = bq('peaking', 780, 1.1, 4), ilp = bq('lowpass', 2600, 0.6), ist = G(1);
            gate.connect(ihp); ihp.connect(ibox); ibox.connect(itr); itr.connect(ilp); ilp.connect(intOut);
            var icur = intOut; [[230, 1.4, -7], [780, 1.1, -4], [210, 1.0, 8], [1150, 1.0, 1]].forEach(function (p) { var f = bq('peaking', p[0], p[1], p[2]); icur.connect(f); icur = f; }); icur.connect(ist);
            V.stems.int = ist; V.params.int = intOut.gain;
            // the block: v2.1's band and rings, then A's inverses and its softened ring (+2 dB at 3 kHz)
            var mechOut = G(mix.mech), mhp = bq('highpass', 1400, 0.7), m1 = bq('peaking', 2900, 1.6, 6), m2 = bq('peaking', 5600, 2.2, 3), mlp = bq('lowpass', 7000, 0.6), mst = G(1);
            core.connect(mhp); mhp.connect(m1); m1.connect(m2); m2.connect(mlp); mlp.connect(mechOut);
            var mcur = mechOut; [[2900, 1.6, -6], [5600, 2.2, -3], [3000, 1.2, 2]].forEach(function (p) { var f = bq('peaking', p[0], p[1], p[2]); mcur.connect(f); mcur = f; }); mcur.connect(mst);
            V.stems.mech = mst; V.params.mech = mechOut.gain;
            var whOut = G(1);
            var tone = function (parts) { var re = new Float32Array(parts.length + 1), im = new Float32Array(parts.length + 1); parts.forEach(function (p, i) { im[i + 1] = p; }); var x = ac.createOscillator(); x.setPeriodicWave(ac.createPeriodicWave(re, im, { disableNormalization: true })); V.nodes.push(x); return x; };
            var gw = tone([1, 0.35, 0.12]), gwg = G(0); gw.connect(gwg); gwg.connect(whOut); jg.connect(gw.detune);
            var ew = tone([1, 0, 0.45, 0, 0.2]), ewg = G(0); ew.connect(ewg); ewg.connect(whOut);
            var tb = tone([1, 0.08]), tbg = G(0); tb.connect(tbg); tbg.connect(whOut);
            V.stems.whine = whOut;
            V.params.gearHz = gw.frequency; V.params.gear = gwg.gain; V.params.ersHz = ew.frequency; V.params.ers = ewg.gain; V.params.turboHz = tb.frequency; V.params.turbo = tbg.gain;
          }
          // ---- control -> values: a pure function, so offline curves and live updates agree (v2.1 with A's two terms)
          V.values = function (c) {
            var rpm = clamp(c.rpm, 1000, 14000), cut = clamp(c.cut || 0, 0, 1), ld = clamp(c.load, 0, 1), load = ld * (1 - cut), out = {};
            var wr = xfade(rpms, rpm, 0.6), wl = xfade(loadAnch, load, 0.7);
            out.src = new Float32Array(V.srcs.length); out.rate = new Float32Array(V.srcs.length);
            var nl = loads.length;
            wr.forEach(function (a) { wl.forEach(function (b) { out.src[a[0] * nl + b[0]] = a[1] * b[1]; }); });
            for (var q = 0; q < V.srcs.length; q++) out.rate[q] = rpm / V.srcs[q].native;
            out.gate = 1 - 0.45 * cut;
            // the jitter depth (cents rms), from the v2-space rpm (A: rpm / S)
            var rv = c.rpm / S;
            out.jcents = 3 + 6 * (1 - ld) + 7 * clamp((6500 - rv) / 2500, 0, 1);
            out.jitter = JK * out.jcents;
            if (!lite) {
              out.int = mix.int * (0.55 + 0.45 * load); out.mech = mix.mech * (0.5 + 0.5 * load);
              out.gearHz = Math.max(20, c.mesh || rpm / 60 * 21); out.gear = mix.gear * (0.3 + 0.7 * Math.abs(load - 0.15)) * clamp(rv / 9000, 0.3, 1.2);
              out.ersHz = rpm / 60 * 16; out.ers = mix.ers * Math.abs(c.ers || 0) * (c.ers < 0 ? 1.25 : 1);
              out.turboHz = 1800 + 5200 * (c.boost || 0); out.turbo = mix.turbo * Math.pow(c.boost || 0, 2) * (0.3 + 0.7 * load);
            }
            return out;
          };
          var SKIP = { src: 1, rate: 1, jcents: 1 };
          // (a setTargetAtTime that repeats the last one, the same target and time constant, is left out: the approach is
          // memoryless, so it changes nothing, and each call costs the main thread; most of a voice's ten stem values are
          // constant on a straight)
          var LP = {};
          function apply(name, v, t, tc) { var p = V.params[name]; if (!p) return; var q = LP[name]; if (q && q.v === v && q.tc === tc) return; p.setTargetAtTime(v, t, tc); if (q) { q.v = v; q.tc = tc; } else LP[name] = { v: v, tc: tc }; }
          function grainLen(Sx) { return GR.min + Math.floor(Sx.R() * (GR.max - GR.min + 1)); }
          function nextShift(Sx, cur) { if (GR.noShift) return cur; var n = Sx.e.ncyc, mn = Math.max(1, Math.round(GR.jump * n)); return (cur + mn + Math.floor(Sx.R() * Math.max(1, n - 2 * mn + 1))) % n; }
          // a grain's start offset: v2.1's whole buffer frame (the browser starts a source on a whole frame: a fractional
          // offset measured the same, G-D3)
          function gOff(Sx, off) { return Math.round(off) % Sx.M; }
          // the next grain's shift. A buffer at the context's rate (k = 1): v2.1's draw, bit for bit (v4's sound). A 32 kHz
          // phone loop in a 44.1 or 48 kHz context: the grain starts on a whole 32 kHz frame, so its rounding (up to half a
          // frame, 67 degrees at 12 kHz) shows as a dip in the cross-fade at high orders (G-D3: -1.3 dB at order 60); of four
          // drawn shifts, the one whose start falls nearest a whole frame
          function shiftNear(Sx, cur, pos) {
            if (Sx.k === 1) return nextShift(Sx, cur);
            var best = 0, bd = 2;
            for (var q = 0; q < 4; q++) { var c = nextShift(Sx, cur), f = pos + c * Sx.spc, d = Math.abs(f - Math.round(f)); if (d < bd) { bd = d; best = c; } }
            return best;
          }
          function grainSrc(Sx, startT, offSamples) { var s = ac.createBufferSource(); s.buffer = Sx.e.buf; s.loop = true; s.connect(Sx.lane[Sx.lanei]); s.start(startT, offSamples / Sx.e.buf.sampleRate); V.stats.grains++; if (V.stats.log) V.stats.log.push(+startT.toFixed(4)); return s; }

          /* ---- offline: whole-render curves; cs = control states at `rate` Hz from t0 (on a render quantum) */
          V.curves = function (cs, t0, rate) {
            var n = cs.length, ns = V.srcs.length, G1 = [], RT = [], acc = {}, J = Jitter(seed * 13 + 5), dur = (n - 1) / rate, q, i;
            for (q = 0; q < ns; q++) { G1.push(new Float32Array(n)); RT.push(new Float32Array(n)); }
            for (i = 0; i < n; i++) {
              var v = V.values(cs[i]), m = Math.pow(2, J.step(1 / rate) * v.jcents / 1200);
              for (q = 0; q < ns; q++) { G1[q][i] = v.src[q]; RT[q][i] = v.rate[q] * m; }
              for (var nm in v) if (!SKIP[nm]) (acc[nm] || (acc[nm] = new Float32Array(n)))[i] = v[nm];
            }
            for (q = 0; q < ns; q++) {
              var Sx = V.srcs[q], any = false; for (i = 0; i < n; i++) if (G1[q][i] > 0) { any = true; break; }
              Sx.used = any;
              if (!any) continue; // a loop never heard is never started
              Sx.g.gain.setValueAtTime(G1[q][0], t0); Sx.g.gain.setValueCurveAtTime(G1[q], t0 + 1e-4, dur);
              if (!GR) { Sx.s.playbackRate.setValueAtTime(RT[q][0], t0); Sx.s.playbackRate.setValueCurveAtTime(RT[q], t0 + 1e-4, dur); continue; }
              planGrains(Sx, G1[q], RT[q], t0, rate, n);
            }
            for (var nm2 in acc) { var p = V.params[nm2]; if (p) { p.setValueAtTime(acc[nm2][0], t0); p.setValueCurveAtTime(acc[nm2], t0 + 1e-4, dur); } }
          };
          // the grain plan of one loop: walk its read position block by block (exactly as the browser advances it), cut a
          // grain every 20-40 cycles, keep the grains that can be heard, and create their nodes just in time
          function planGrains(Sx, Gk, RTk, t0, rate, n) {
            var tEnd = t0 + (n - 1) / rate, b0 = Math.round(t0 * sr / Q), nb = Math.ceil(tEnd * sr / Q), M = Sx.M, spc = Sx.spc, kk = Sx.k, bsr = Sx.e.buf.sampleRate;
            var pos = Sx.off0, shift = 0, cyc = 0, L = grainLen(Sx), gr = [{ b: b0, shift: 0, pos: pos }];
            for (var b = b0; b < nb; b++) {
              var r = curveAt(RTk, t0, rate, b * Q / sr);
              if (cyc >= L) { shift = shiftNear(Sx, shift, pos); gr.push({ b: b, shift: shift, pos: pos, r: r }); cyc = 0; L = grainLen(Sx); }
              pos += Q * r * kk; if (pos >= M) pos -= M * Math.floor(pos / M); cyc += Q * r * kk / spc;
            }
            gr[0].r = curveAt(RTk, t0, rate, b0 * Q / sr);
            var heard = function (ta, tb2) { var i0 = Math.max(0, Math.floor((ta - t0) * rate) - 2), i1 = Math.min(n - 1, Math.ceil((tb2 - t0) * rate) + 2); for (var i = i0; i <= i1; i++) if (Gk[i] > 0) return true; return false; };
            var coh = clamp(Sx.e.coh, 0, 1), prevMade = false;
            for (var j = 0; j < gr.length; j++) {
              var g = gr[j], ts = g.b * Q / sr, X = GR.xf * spc / (g.r * bsr), nx = gr[j + 1], te = nx ? nx.b * Q / sr + GR.xf * spc / (nx.r * bsr) : tEnd + 0.05;
              if (!heard(ts - 0.02, te + 0.02)) { prevMade = false; continue; }
              (function (g, ts, X, te, nx, lane, first) {
                // the hold (ts .. the curve's next point) reads at the value at ts, not the curve's: take that out
                var hold = 0, tc = t0 + 1e-4 + Math.max(0, Math.ceil((ts - t0 - 1e-4) * rate) + 1) / rate, rh = curveAt(RTk, t0, rate, ts);
                for (var bb = g.b; bb * Q / sr < tc; bb++) hold += Q * kk * (rh - curveAt(RTk, t0, rate, bb * Q / sr));
                var off = ((g.pos + g.shift * spc - hold) % M + M) % M;
                jitAt(ac, ts, function () {
                  Sx.lanei = lane; var s = grainSrc(Sx, ts, gOff(Sx, off)), lg = Sx.lane[lane].gain;
                  // a source ignores automation that starts before it does: the value at ts from ts, then the curve from its
                  // next point (the hold until then is compensated in the offset)
                  var i1 = Math.max(0, Math.ceil((ts - t0 - 1e-4) * rate) + 1), i2 = Math.min(n - 1, Math.ceil((te - t0) * rate) + 2);
                  s.playbackRate.setValueAtTime(curveAt(RTk, t0, rate, ts), ts);
                  if (i2 > i1) s.playbackRate.setValueCurveAtTime(RTk.subarray(i1, i2 + 1), t0 + 1e-4 + i1 / rate, (i2 - i1) / rate);
                  if (first) lg.setValueAtTime(1, ts); else lg.setValueCurveAtTime(fadeCurve(coh, true, 24), ts, X);
                  if (nx) { lg.setValueCurveAtTime(fadeCurve(coh, false, 24), nx.b * Q / sr, Math.max(1e-3, te - nx.b * Q / sr)); }
                  s.stop(te + 0.01);
                });
              })(g, ts, X, te, nx, j & 1, !prevMade);
              prevMade = true;
            }
          }

          /* ---- live: set(t, c) with increasing t, a few render quanta ahead of currentTime. Each loop's rate ramps linearly to
           * its value at t, so the automation up to the latest t is final; grains are cut on render-quantum boundaries inside
           * it, at the read position the emulated clock gives. Loops get sources only while heard (and 0.25 s after).
           * tc (optional): the time constant of the gains (the loops' weights, the gate, the stems); v2.1's 8 and 12 ms when
           * not given (a shift's cut and blip pass 2.5 ms, as the offline path's control rate gives them). */
          var LV = null;
          V.set = function (t, c, tc) {
            var v = V.values(c), q;
            for (var nm in v) if (!SKIP[nm]) apply(nm, v[nm], t, nm.indexOf('Hz') > 0 ? 0.004 : tc || 0.012);
            if (!GR) {
              for (q = 0; q < V.srcs.length; q++) { var S0 = V.srcs[q]; if ((v.src[q] > 0 || S0.last > 0) && !(v.src[q] === S0.last && S0.ltc === (tc || 0.008))) { S0.g.gain.setTargetAtTime(v.src[q], t, tc || 0.008); S0.last = v.src[q]; S0.ltc = tc || 0.008; } S0.s.playbackRate.setTargetAtTime(v.rate[q], t, 0.004); }
              return;
            }
            if (!LV) LV = { J: Jitter(seed * 13 + 5), tl: null };
            var m = Math.pow(2, LV.J.step(LV.tl == null ? 1 / 60 : Math.max(1e-3, t - LV.tl)) * v.jcents / 1200), rEff = clamp(c.rpm, 1000, 14000) * m;
            if (LV.tl == null) { LV.tp = t; LV.rp = rEff; LV.tl = t; LV.rl = rEff; LV.b = Math.floor(t * sr / Q); LV.cyc = 0; }
            if (!(t > LV.tl)) return; // (set() needs strictly increasing times)
            // the effective rpm the automation gives at a block's first frame: the previous ramp up to tl, this one after
            var t0p = LV.tp, r0p = LV.rp, t1 = LV.tl, r1 = LV.rl;
            var rAtB = function (b) { var tb = b * Q / sr; if (tb <= t1) return t1 > t0p ? r0p + (r1 - r0p) * clamp((tb - t0p) / (t1 - t0p), 0, 1) : r1; return r1 + (rEff - r1) * Math.min(1, (tb - t1) / (t - t1)); };
            var bNew = Math.max(LV.b, Math.floor(t * sr / Q)), bMin = Math.ceil(ac.currentTime * sr / Q) + 2, b;
            var C = [LV.cyc]; for (b = LV.b; b < bNew; b++) C.push(C[C.length - 1] + Q * rAtB(b) / (120 * sr)); // the voice's cycle count per block
            for (q = 0; q < V.srcs.length; q++) {
              var Sx = V.srcs[q], w = v.src[q], live = Sx.live, nat = Sx.native, kk = Sx.k;
              if ((w > 0 || Sx.last > 0) && !(w === Sx.last && Sx.ltc === (tc || 0.008))) { Sx.g.gain.setTargetAtTime(w, t, tc || 0.008); Sx.last = w; Sx.ltc = tc || 0.008; }
              if (live) {
                // every source still playing (the current grain and any grain still fading out) follows the same ramp
                live.srcs = live.srcs.filter(function (x) { return !(x.__stop <= LV.tl); });
                for (var i = 0; i < live.srcs.length; i++) live.srcs[i].playbackRate.linearRampToValueAtTime(fround(rEff / nat), t);
                for (b = live.b; b < bNew; b++) { var r = fround(rAtB(b) / nat); live.pos += Q * r * kk; if (live.pos >= Sx.M) live.pos -= Sx.M * Math.floor(live.pos / Sx.M); live.cyc += Q * r * kk / Sx.spc; }
                live.b = bNew;
                if (w > 0) live.lastHeard = t;
                if (t - live.lastHeard > 0.25) { live.srcs.forEach(function (x) { try { x.stop(t); } catch (e) { } }); Sx.live = null; continue; }
                if (live.cyc >= live.L && bNew >= bMin) { // cut a grain at block bNew (its time is <= t: its automation is final)
                  var ts = bNew * Q / sr, rb = fround(rAtB(bNew) / nat), X = GR.xf * Sx.spc / (rb * Sx.e.buf.sampleRate), coh = clamp(Sx.e.coh, 0, 1), old = live.lane;
                  live.shift = shiftNear(Sx, live.shift, live.pos); live.L = grainLen(Sx); live.cyc = 0; live.lane = Sx.lanei = 1 - old;
                  var s = grainSrc(Sx, ts, gOff(Sx, (live.pos + live.shift * Sx.spc) % Sx.M));
                  s.playbackRate.setValueAtTime(rb, ts); if (t > ts) s.playbackRate.linearRampToValueAtTime(fround(rEff / nat), t);
                  Sx.lane[old].gain.setValueCurveAtTime(fadeCurve(coh, false, 24), ts, X); Sx.lane[live.lane].gain.setValueCurveAtTime(fadeCurve(coh, true, 24), ts, X); Sx.laneEnd = ts + X;
                  live.srcs.forEach(function (x) { if (!(x.__stop < ts + X + 0.01)) { try { x.stop(ts + X + 0.01); x.__stop = ts + X + 0.01; } catch (e) { } } });
                  live.srcs.push(s);
                }
              } else if (w > 0) { // a loop coming in: its first grain at the earliest schedulable block, in phase with the voice's clock
                var bs = Math.max(bMin, LV.b, Sx.laneEnd ? Math.ceil(Sx.laneEnd * sr / Q) + 1 : 0); // after any lane cross-fade still running
                if (bs <= bNew) {
                  var cyc0 = C[bs - LV.b], n0 = Sx.e.ncyc, sh = Math.floor(Sx.R() * n0), pos0 = (((ph + cyc0) % n0) + n0) % n0 * Sx.spc, ts2 = bs * Q / sr, rb2 = fround(rAtB(bs) / nat);
                  Sx.live = live = { b: bs, pos: pos0, shift: sh, cyc: 0, L: grainLen(Sx), lane: 0, lastHeard: t, srcs: [] };
                  Sx.lanei = 0; Sx.lane[1].gain.setValueAtTime(0, ts2); Sx.lane[0].gain.setValueAtTime(1, ts2);
                  var s2 = grainSrc(Sx, ts2, gOff(Sx, (pos0 + sh * Sx.spc) % Sx.M));
                  s2.playbackRate.setValueAtTime(rb2, ts2); if (t > ts2) s2.playbackRate.linearRampToValueAtTime(fround(rEff / nat), t);
                  live.srcs = [s2];
                  for (b = bs; b < bNew; b++) { var r2 = fround(rAtB(b) / nat); live.pos += Q * r2 * kk; live.cyc += Q * r2 * kk / Sx.spc; }
                  live.pos %= Sx.M; live.b = bNew;
                }
              }
            }
            LV.b = bNew; LV.cyc = C[C.length - 1]; LV.tp = t1; LV.rp = r1; LV.tl = t; LV.rl = rEff;
          };
          // a voice handed to another car (or paused): every live grain stops at t, the clock starts again at the next set()
          V.reset = function (t) {
            V.srcs.forEach(function (Sx) {
              if (Sx.live) Sx.live.srcs.forEach(function (x) { try { x.stop(t); } catch (e) { } });
              // (a lane cross-fade still scheduled past t would refuse the next grain's values: cancel it)
              if (Sx.lane) Sx.lane.forEach(function (lg) { lg.gain.cancelScheduledValues(t); lg.gain.setValueAtTime(0, t); });
              Sx.live = null; Sx.laneEnd = 0;
              if (Sx.last > 0) { Sx.g.gain.cancelScheduledValues(t); Sx.g.gain.setValueAtTime(0, t); Sx.last = 0; Sx.ltc = null; }
            });
            LV = null;
          };
          V.clock = function () { return LV ? LV.tl : null; };

          // ---- the real one-shots: a bang never repeats one of the last three
          var lastB = [];
          function pickBang() { var n = bank.bangs.length, i, tries = 0; do { i = Math.floor(R() * n); tries++; } while (n > 4 && lastB.indexOf(i) >= 0 && tries < 20); lastB.push(i); if (lastB.length > 3) lastB.shift(); return bank.bangs[i]; }
          function shot(t, buf, gain, rate, dest) { var s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; var g = G(gain); s.connect(g); g.connect(dest || shots); s.start(Math.max(0, t)); return { s: s, g: g }; }
          V.pop = function (t, a) { if (!bank.bangs.length) return; shot(t, pickBang(), mix.pop * a, 0.85 + 0.35 * R()); };
          // the upshift bark: the cut's dip (gate + load, in values()) and at most a small, short pop (a bang cut to ~35 ms)
          V.bark = function (t, a) {
            if (!bank.bangs.length || !(a > 0) || !(mix.bark > 0)) return;
            var x = shot(t, pickBang(), mix.bark * a, 1.15 + 0.25 * R()); x.g.gain.setValueAtTime(mix.bark * a, Math.max(0, t) + 0.012); x.g.gain.setTargetAtTime(0, Math.max(0, t) + 0.012, 0.01); x.s.stop(Math.max(0, t) + 0.07);
          };
          V.crack = function (t, a) { if (!bank.bangs.length) return; shot(t, pickBang(), mix.crack * a, 1.25 + 0.2 * R()); };
          V.whoosh = function (t, a) { if (lite || !bank.whoosh) return; shot(t, bank.whoosh, mix.whoosh * a, 0.92 + 0.16 * R(), V.wout); };
          V.start = function (t) {
            t = t || 0;
            V.nodes.forEach(function (x) {
              var Sx = null; for (var q = 0; q < V.srcs.length; q++) if (V.srcs[q].s === x) { Sx = V.srcs[q]; break; }
              if (Sx) { if (Sx.used === false) return; x.start(t, Sx.off0 / Sx.e.buf.sampleRate); } else x.start(t);
            });
          };
          V.stop = function (t) { V.nodes.forEach(function (x) { try { x.stop(t); } catch (e) { } }); V.srcs.forEach(function (Sx) { if (Sx.live) Sx.live.srcs.forEach(function (x) { try { x.stop(t); } catch (e) { } }); }); };
          return V;
        }

        /* ------------------------------------------------------------------------------------ the camera's mixes -- */
        // the focus voice from the player's cameras (v4's own mixes): chase = 7 m behind, the exhaust at the lens; tcam = the
        // airbox camera (v4's onboard: the intake right there, the block under it, the exhaust behind and body-shadowed, the
        // monocoque's boom). The cockpit plays the T-cam's mix unchanged: the owner chose v4 on its onboard lap, which the
        // delivery called "a full lap from the cockpit" (engine-v4-onboard-lap.wav), and RULES 1f's "v4" sets its notes
        // (crank order 2 about 3 dB and order 1 about 6 dB under the firing line). 'helmet' is D-DESIGN 6.3's cockpit (the
        // body, through the seat, at 0.8 instead of 0.22, and the Rig's helmet filter on the whole engine bus), kept only for
        // the owner's A/B (env.helmet: true): it moves order 1 to about -3.6 dB and 2-8 kHz about 5.5 dB down against the
        // approved lap, so it is not the voice he chose. Then one phase rotator on the sum (A's, 2 x all-pass 220 Hz Q 0.7);
        // the blow-off enters after it. -> { out, mode, fade(t, to, dur), lean(t, on), stop() }
        var MIXES = {
          // (trim: the owner heard the chase and onboard laps each at -14 LUFS; the onboard mix sits 1.4-1.8 dB under the
          // chase mix at one gain (measured on v4's laps and on the game's drive), so it is trimmed up by 1.6 dB)
          chase: { exh: [1.0], int: [0.35, 2400], mech: [0.25, 6000], whine: 0.12, body: 0, trim: 1 },
          tcam: { exh: [0.62, 5200], int: [1], mech: [1], whine: 0.55, body: 0.22, trim: 1.202 },
          cockpit: { exh: [0.62, 5200], int: [1], mech: [1], whine: 0.55, body: 0.22, trim: 1.202 },
          helmet: { exh: [0.62, 5200], int: [1], mech: [1], whine: 0.55, body: 0.8, trim: 1.202 },
        };
        function Mixer(ac, V, mode, dest, o) {
          o = o || {};
          var M = MIXES[o.helmet && mode === 'cockpit' ? 'helmet' : mode] || MIXES.chase, s = V.stems, sum = gainOf(ac, 1), out = gainOf(ac, 0), nodes = [sum, out];
          function path(src, spec, Qv) { if (!src || !spec) return null; var g = gainOf(ac, spec[0]); nodes.push(g); if (spec[1]) { var lp = bqOf(ac, 'lowpass', spec[1], Qv || 0.6); nodes.push(lp); src.connect(lp); lp.connect(g); } else src.connect(g); g.connect(sum); return g; }
          var gx = path(s.exh, M.exh), gi = path(s.int, M.int), gm = path(s.mech, M.mech), gw = s.whine ? path(s.whine, [M.whine]) : null;
          if (M.body && s.exh) { var bl = bqOf(ac, 'lowpass', 170, 0.9), bg = gainOf(ac, M.body); s.exh.connect(bl); bl.connect(bg); bg.connect(sum); nodes.push(bl, bg); }
          var cur = sum;
          if (!V.lite && o.rotator !== false) for (var r = 0; r < 2; r++) { var ap = bqOf(ac, 'allpass', 220, 0.7); nodes.push(ap); cur.connect(ap); cur = ap; }
          var post = gainOf(ac, M.trim || 1); nodes.push(post); cur.connect(post);
          var ww = gainOf(ac, M.whine); nodes.push(ww); V.wout.connect(ww); ww.connect(post);
          post.connect(out);
          out.connect(dest);
          var X = { out: out, post: post, mode: mode, nodes: nodes, gains: { exh: gx, int: gi, mech: gm, whine: gw } };
          X.fade = function (t, to, dur) { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(to, t + dur); };
          X.lean = function (t, on) { [gi, gm].forEach(function (g, i) { if (g) g.gain.setTargetAtTime(on ? 0 : (i ? M.mech[0] : M.int[0]), t, 0.05); }); };
          X.stop = function () { nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { } }); [s.exh, s.int, s.mech, s.whine, V.wout].forEach(function (x) { if (x) try { x.disconnect(); } catch (e) { } }); };
          return X;
        }
        // stems are shared between a mix and the next one during a 120 ms cross-fade, then disconnected; disconnect() on a
        // stem would cut both, so a voice's stems feed one splitter gain per mix (made by tap())
        function tapStems(ac, V) { var T = { stems: {}, wout: gainOf(ac, 1), lite: V.lite }; for (var k in V.stems) { T.stems[k] = gainOf(ac, 1); V.stems[k].connect(T.stems[k]); } V.wout.connect(T.wout); T.release = function () { for (var k in V.stems) try { V.stems[k].disconnect(T.stems[k]); } catch (e) { } try { V.wout.disconnect(T.wout); } catch (e) { } }; return T; }

        /* ---------------------------------------------------------------------------------- the trackside chain -- */
        // a voice heard from somewhere else (v4's trackside spatialiser, live): time of flight and Doppler from a variable
        // delay (distance / 343 m/s), air absorption (24,000 x e^(-r/115) Hz, 1.8-20 kHz), 1/r from a 10 m reference with a
        // 2.5 m floor, the ground's reflection (desktop), the exhaust's directivity (bright behind, dull in front: 0.34-1.0)
        // and the side (pan x 0.9). full: every stem (intake 0.25-0.40, block and whines 0.1), with the rotator.
        var C_AIR = 343;
        function Spatial(ac, V, dest, o) {
          o = o || {};
          var s = V.stems, mono = gainOf(ac, 1), exG = gainOf(ac, 0.5), dirLp = bqOf(ac, 'lowpass', 20000, 0.5), nodes = [mono, exG, dirLp], inG = null;
          s.exh.connect(dirLp); dirLp.connect(exG); exG.connect(mono);
          if (o.full && s.int) {
            var inLp = bqOf(ac, 'lowpass', 3200, 0.6); inG = gainOf(ac, 0.3); s.int.connect(inLp); inLp.connect(inG); inG.connect(mono);
            var mm = gainOf(ac, 0.1), wq = gainOf(ac, 0.1), wo = gainOf(ac, 0.1); s.mech.connect(mm); mm.connect(mono); s.whine.connect(wq); wq.connect(mono); nodes.push(inLp, inG, mm, wq, wo);
            var cur = mono; for (var r = 0; r < 2; r++) { var ap = bqOf(ac, 'allpass', 220, 0.7); nodes.push(ap); cur.connect(ap); cur = ap; }
            mono = gainOf(ac, 1); nodes.push(mono); cur.connect(mono); V.wout.connect(wo); wo.connect(mono);
          }
          var dl = ac.createDelay(1.0), lp = bqOf(ac, 'lowpass', 20000, 0.5), dg = gainOf(ac, 0), pan = ac.createStereoPanner(), out = gainOf(ac, 1);
          mono.connect(dl); dl.connect(lp); lp.connect(dg); dg.connect(pan); pan.connect(out); out.connect(dest); nodes.push(dl, lp, dg, pan, out);
          var dl2 = null, lp2 = null, dg2 = null;
          if (o.ground) { dl2 = ac.createDelay(1.0); lp2 = bqOf(ac, 'lowpass', 3800, 0.5); dg2 = gainOf(ac, 0); mono.connect(dl2); dl2.connect(lp2); lp2.connect(dg2); dg2.connect(pan); nodes.push(dl2, lp2, dg2); }
          var P = { t: null, d: 0, r: 0 }, ref = o.ref || 10, rmin = o.rmin || 2.5;
          var X = { out: out, nodes: nodes, P: P };
          function ramp(p, v, t, first) { if (first) { p.cancelScheduledValues(t); p.setValueAtTime(v, t); } else p.linearRampToValueAtTime(v, t); }
          // (car pose { x, y, z, h }, listener { x, y, z, rx, rz } with its right vector; t strictly increasing)
          X.update = function (t, car, L, cut) {
            var dx = car.x - L.x, dy = (car.y || 0) + 0.55 - L.y, dz = car.z - L.z, r = Math.sqrt(dx * dx + dy * dy + dz * dz), horiz = Math.sqrt(dx * dx + dz * dz) || 1e-3;
            var first = P.t == null || cut || Math.abs(r - P.r) > 30; // a camera cut or a hand-over: jump, never chirp
            var d = Math.min(0.99, r / C_AIR), g = ref / Math.max(r, rmin), lpf = clamp(24000 * Math.exp(-r / 115), 1800, 20000);
            var side = clamp((dx * L.rx + dz * L.rz) / horiz, -1, 1);
            // the car's back (the sim drives along (sin h, -cos h)): bright when the listener is behind it
            var bx = -Math.sin(car.h || 0), bz = Math.cos(car.h || 0), cosB = (-dx * bx + -dz * bz) / horiz;
            var e = 0.34 + 0.66 * Math.pow(0.5 + 0.5 * cosB, 1.4), dir = 2200 * Math.pow(9, Math.pow(0.5 + 0.5 * cosB, 1.3));
            if (first && P.t != null) { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(1, t + 0.03); }
            ramp(dl.delayTime, d, t, first); ramp(dg.gain, g, t, first); ramp(lp.frequency, lpf, t, first); ramp(pan.pan, side * 0.9, t, first);
            ramp(exG.gain, e, t, first); ramp(dirLp.frequency, Math.min(20000, dir), t, first);
            if (inG) ramp(inG.gain, 0.25 + 0.15 * (0.5 - 0.5 * cosB), t, first);
            if (dl2) { var r2 = Math.sqrt(horiz * horiz + Math.pow((car.y || 0) + 0.55 + L.y, 2)); ramp(dl2.delayTime, Math.min(0.99, r2 / C_AIR), t, first); ramp(dg2.gain, 0.55 * ref / Math.max(r2, rmin), t, first); }
            P.t = t; P.r = r; P.d = d; P.g = g; P.side = side; P.e = e;
            return r;
          };
          X.fade = function (t, to, dur) { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(to, t + dur); };
          X.stop = function () { nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { } }); };
          return X;
        }

        /* ------------------------------------------------------------------------------------------ mini voice -- */
        // a distant car: two looping on-load loops at the two nearest rpm points, cross-faded by rpm (no grains, no phase
        // lock: only ever heard far off); off the throttle -10 dB through a 1.5 kHz low pass. -> { stems: { exh }, set(t, c) }
        function Mini(ac, bank, o) {
          o = o || {};
          var R = rng((o.seed || 1) * 31 + 7), on = bank.rpms.map(function (r) { return bank.loop[r].on; }), rpms = bank.rpms;
          var sum = gainOf(ac, 0), lp = bqOf(ac, 'lowpass', 20000, 0.6), out = gainOf(ac, MIX.out); sum.connect(lp); lp.connect(out);
          var M = { stems: { exh: out }, wout: gainOf(ac, 0), lite: true, src: {}, nodes: [sum, lp, out], last: null };
          function src(i, t) {
            var e = on[i], s = ac.createBufferSource(), g = gainOf(ac, 0); s.buffer = e.buf; s.loop = true; s.connect(g); g.connect(sum);
            s.start(t, Math.floor(R() * e.ncyc) * e.buf.length / e.ncyc / e.buf.sampleRate); return { s: s, g: g, i: i, native: e.native };
          }
          M.set = function (t, c) {
            var rpm = clamp(c.rpm, 1000, 14000), w = xfade(rpms, rpm, 0.6), want = {}, k;
            w.forEach(function (a) { want[a[0]] = a[1]; });
            for (k in want) if (!M.src[k]) { M.src[k] = src(+k, t); M.src[k].g.gain.setValueAtTime(0, t); M.src[k].g.gain.linearRampToValueAtTime(want[k], t + 0.03); M.src[k].fresh = true; }
            for (k in M.src) {
              var x = M.src[k], wk = want[k] || 0;
              x.s.playbackRate.linearRampToValueAtTime(rpm / x.native, t);
              if (x.fresh) x.fresh = false; else x.g.gain.linearRampToValueAtTime(wk, t);
              if (!wk) { x.s.stop(t + 0.04); delete M.src[k]; }
            }
            var load = clamp(c.load, 0, 1) * (1 - clamp(c.cut || 0, 0, 1));
            if (M.last == null) { sum.gain.setValueAtTime(0.316 + 0.684 * load, t); lp.frequency.setValueAtTime(1500 + 18500 * load * load, t); }
            else { sum.gain.linearRampToValueAtTime(0.316 + 0.684 * load, t); lp.frequency.linearRampToValueAtTime(1500 + 18500 * load * load, t); }
            M.last = t;
          };
          M.reset = function (t) { for (var k in M.src) { try { M.src[k].s.stop(t); } catch (e) { } } M.src = {}; M.last = null; };
          M.pop = M.bark = M.whoosh = function () { };
          M.stop = function (t) { M.reset(t || 0); M.nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { } }); };
          return M;
        }

        /* --------------------------------------------------------------------------------------- the field bed -- */
        // every car without a voice: one looped render of a distant pack (or, without it, a bank loop low-passed), its gain
        // the root-sum-square of their audibility, its pan their energy's centroid, its rate their weighted mean rpm
        function Bed(ac, buf, dest, o) {
          o = o || {};
          var s = ac.createBufferSource(), lp = bqOf(ac, 'lowpass', o.lp || 4000, 0.6), g = gainOf(ac, 0), pan = ac.createStereoPanner();
          s.buffer = buf; s.loop = true; s.connect(lp); lp.connect(g); g.connect(pan); pan.connect(dest); s.start(0, 0);
          var B = { last: null, ref: o.ref || 1, native: o.native || 9625, g: g };
          B.set = function (t, level, side, rpm, rmean) {
            var v = clamp(level, 0, 4), rate = clamp(rpm / B.native, 0.85, 1.15), f = clamp(24000 * Math.exp(-(rmean || 50) / 115), 1200, 12000);
            if (B.last == null) { g.gain.setValueAtTime(v, t); pan.pan.setValueAtTime(side, t); s.playbackRate.setValueAtTime(rate, t); lp.frequency.setValueAtTime(f, t); }
            else { g.gain.linearRampToValueAtTime(v, t); pan.pan.linearRampToValueAtTime(side, t); s.playbackRate.linearRampToValueAtTime(rate, t); lp.frequency.linearRampToValueAtTime(f, t); }
            B.last = t;
          };
          B.stop = function (t) { try { s.stop(t || 0); } catch (e) { } [lp, g, pan].forEach(function (n) { try { n.disconnect(); } catch (e) { } }); };
          return B;
        }

        /* --------------------------------------------------------------------------------------------- the drive -- */
        // one per voiced car: the sim's rpm, throttle, brake, gear and shift events -> the voice's controls, integrated at
        // 1 kHz between frames (v2.1's gearbox minus its shift decisions and its rpm model, which are the sim's): the rpm's
        // own dynamics on a shift (11 ms up, 16 ms on a blip, else 6 ms), the 26 ms upshift cut with its 2.5 ms envelope at
        // the event's own time, the limiter's 12 ms in every 40, A's 0.3 downshift blip for 70 ms, the overrun charge and its
        // pops, the bark, the blow-off, the MGU-K and the boost. Voice rpm = 0.875 x the sim's (the renders'), lifted below
        // 5,000 so the sim's 4,000 idle is the garage idle's 4,283. Every random draw from a stream seeded by (race, car).
        function vmap(r) { var w = clamp((5000 - r) / 1000, 0, 1); return S * r + 783 * w; }
        function Drive(seed, o) {
          var P = POPS, R = rng(seed), H = 0.001, PT = o && o.pt || 0.004, RH = rng(seed * 3 + 17);
          var st = { t: null, rpm: 0, cutT: 0, cutEnv: 0, blipT: 0, over: 0, lastPop: -9, lastShift: -9, thrPrev: 0, ers: 0, boost: 0.2, limT: 0, gear: 1, barkLoad: 0, c: null, hunt: 0 };
          var D = { st: st, log: null };
          D.reset = function () { st.t = null; st.cutT = 0; st.cutEnv = 0; st.blipT = 0; st.limT = 0; st.c = null; };
          // advance to tA. a, b: the sim rows at the last frame and this one ({ rpm, thr, brk, gear, limiter });
          // shifts: [{ t (audio), from, to }] inside (st.t, tA]; ovr(t) -> { rpm, thr, lim } | null (the grid's replies)
          // -> { pts: [[t, c, tc]], shots: [{ type, t, amp }] }
          D.step = function (tA, a, b, shifts, ovr) {
            var out = { pts: [], shots: [] };
            if (st.t == null) { st.t = tA - 1 / 60; st.rpm = vmap(b.rpm || 4000); st.gear = b.gear || 1; st.thrPrev = b.thr || 0; }
            var t0 = st.t, span = Math.max(1e-6, tA - t0), n = Math.max(1, Math.round(span / H)), h = span / n, si = 0, lastPt = t0, fast = false;
            shifts = (shifts || []).slice().sort(function (p, q) { return p.t - q.t; });
            var shiftAt = shifts.length ? shifts[0].t : null, aRpm = a ? a.rpm : b.rpm, aThr = a ? a.thr : b.thr;
            for (var k = 1; k <= n; k++) {
              var t = t0 + k * h, u = k / n;
              // the sim's state between its frames: rpm and throttle linear, except a shift's step in rpm, at the shift
              var rs = shiftAt != null && shifts.length ? (t < shifts[shifts.length - 1].t ? aRpm : b.rpm) : aRpm + (b.rpm - aRpm) * u;
              var thr = clamp(aThr + (b.thr - aThr) * u, 0, 1), brk = clamp(b.brk || 0, 0, 1), lim = !!b.limiter;
              var ov = ovr ? ovr(t) : null; if (ov) { rs = ov.rpm; thr = ov.thr; lim = !!ov.lim; }
              // (the launch control's hunt: a car held on the grid with its revs up (BRAKE armed: the sim holds the launch
              // band at one exact rpm) wanders about 1 % (17 cents rms, a 0.3 s correlation), each car its own stream.
              // Twenty engines held at one exact rpm read as one held note under the lights; X13's replies are left exact)
              else if (b.held && rs > 6000) { st.hunt += -st.hunt * h / 0.3 + Math.sqrt(2 * h / 0.3) * gauss(RH); rs *= 1 + 0.01 * clamp(st.hunt, -3, 3); }
              while (si < shifts.length && shifts[si].t <= t) {
                var e = shifts[si++];
                if (e.to > e.from) { st.cutT = 0.026; st.barkLoad = thr; out.shots.push({ type: 'up', t: e.t, from: e.from, to: e.to }); }
                else { st.blipT = 0.07; st.over = Math.max(st.over, P.downMin + (1 - P.downMin) * clamp((brk - P.brakeLo) / (P.brakeFull - P.brakeLo), 0, 1)); out.shots.push({ type: 'down', t: e.t, from: e.from, to: e.to, brake: brk }); }
                st.lastShift = e.t; st.gear = e.to; fast = true;
              }
              if (b.gear > 0) st.gear = b.gear;
              var target = vmap(rs), tau = st.blipT > 0 ? 0.016 : st.cutT > 0 || (t - st.lastShift < 0.05) ? 0.011 : 0.006;
              st.rpm += (target - st.rpm) * (1 - Math.exp(-h / tau));
              var cut = 0;
              if (st.cutT > 0) { cut = 1; st.cutT -= h; if (st.cutT <= 0) { var bk = R() < P.bark; out.shots.push({ type: 'bark', t: t, amp: bk ? (0.5 + 0.5 * R()) * clamp(st.barkLoad, 0.3, 1) : 0 }); } }
              if (lim && thr > 0.3) { st.limT += h; if ((st.limT % 0.04) < 0.012) cut = 1; fast = true; } else st.limT = 0;
              st.cutEnv += (cut - st.cutEnv) * (1 - Math.exp(-h / 0.0025));
              var load = thr;
              if (st.blipT > 0) { load = Math.max(load, P.blip); st.blipT -= h; }
              if (thr < 0.1 && st.thrPrev >= 0.1 && rs > P.liftRpm) st.over = Math.max(st.over, P.lift);
              if (thr < 0.15 && st.thrPrev >= 0.15 && st.boost > 0.6) out.shots.push({ type: 'whoosh', t: t, amp: st.boost });
              st.thrPrev = thr;
              st.over = Math.max(0, st.over - h / P.decay);
              if (thr < 0.12 && st.blipT <= 0 && st.over > 0 && rs > P.minRpm && t - st.lastPop > P.gap) {
                if (R() < h * P.rate * st.over * st.over) { st.lastPop = t; out.shots.push({ type: 'pop', t: t + R() * h, amp: (0.35 + 0.65 * R()) * (0.5 + 0.5 * st.over) }); }
              }
              var ersT = brk > 0.25 ? -brk : thr > 0.85 && st.gear >= 2 ? 1 : 0;
              st.ers += (ersT - st.ers) * (1 - Math.exp(-h / 0.08));
              var bT = clamp(0.2 + 0.8 * Math.pow(load, 1.4) * clamp((rs - 6000) / 5000, 0, 1), 0, 1);
              st.boost += (bT - st.boost) * (1 - Math.exp(-h / (bT > st.boost ? 0.35 : 0.5)));
              var c = { rpm: st.rpm, load: load, cut: st.cutEnv, mesh: st.rpm / 60 * Z[clamp(st.gear, 1, 8) - 1], ers: st.ers, boost: st.boost };
              if (D.log) D.log(t, c, st.gear, thr);
              // control points: every frame, and every 4 ms while a cut, a blip or the limiter moves things fast
              var moving = st.cutT > 0 || st.blipT > 0 || st.cutEnv > 0.02 && st.cutEnv < 0.98 || (lim && thr > 0.3);
              if (k === n || (moving && t - lastPt >= PT)) { out.pts.push([t, c, moving || fast ? 0.0025 : 0]); lastPt = t; }
              st.c = c;
            }
            st.t = tA;
            return out;
          };
          return D;
        }

        return { Q: Q, S: S, IDLE_V: IDLE_V, Z: Z, POPS: POPS, MIX: MIX, GRAINS: GRAINS, LOADS: LOADS, MIXES: MIXES, clamp: clamp, lerp: lerp, smooth: smooth, rng: rng, gauss: gauss,
          xfade: xfade, Jitter: Jitter, curveAt: curveAt, fadeCurve: fadeCurve, isOffline: isOffline, atRender: atRender, jitAt: jitAt, noiseBuf: noiseBuf, gainOf: gainOf, bqOf: bqOf, Limiter: Limiter,
          Voice: Voice, Mixer: Mixer, tapStems: tapStems, Spatial: Spatial, Mini: Mini, Bed: Bed, Drive: Drive, vmap: vmap, C_AIR: C_AIR };
      })();
      var K = $.K;
      if (env === 'core') return K;
      env = env || {};
      var clamp = K.clamp, ID = 'audio-a1-engine-v4';
      var warn = typeof env.warn === 'function' ? env.warn : function () { };
      var win = env.win || null;
      // without the page (the library and a decoder) the stand-in voice plays: gp.js's own, as before M2. Said out loud when
      // gp.js has made the page's audio and still hands none of it over (its wiring dropped: lane D's three lines in
      // gpAudioMake, m2/D.md section 3), so a test that counts the sound's warnings fails instead of hearing the stand-in
      if (!win || typeof env.asset !== 'function' || typeof env.fetch !== 'function') { if (env.ac) warn('The race sound is not wired: gp.js gives gpAudio no ' + [!win && 'win', typeof env.asset !== 'function' && 'asset', typeof env.fetch !== 'function' && 'fetch'].filter(Boolean).join(', ') + ', so the stand-in engine plays.'); return null; }
      var OAC = win.OfflineAudioContext || win.webkitOfflineAudioContext;
      if (!OAC) { if (env.ac) warn('The race sound needs an OfflineAudioContext to decode its bank: the stand-in engine plays.'); return null; }
      var quality = env.quality === 'low' ? 'low' : 'high', tier = quality === 'low' ? 'lo' : 'hi';
      var perf = win.performance || null, now = function () { return perf ? perf.now() : 0; };

      /* ------------------------------------------------------------------------------------------- the loading -- */
      // the tier's files, decoded off the page's audio (an OfflineAudioContext at the tier's own rate: a loop is never
      // decoded at another rate, which would treat its two ends as silence), two at a time, the race band first
      function loadBank(tr) {
        if ($.banks[tr]) return Promise.resolve($.banks[tr]);
        if ($.loads[tr]) return $.loads[tr].p;
        var a = env.asset(ID);
        if (!a || !a.json || a.json.kind !== 'engine') return Promise.reject(new Error(ID + ' is not in the library'));
        var J = a.json, T = J.tiers[tr], rate = T.sr, dctx = new OAC(1, 1, rate), B = { tier: tr, sr: rate, rpms: J.rpms.slice(), loads: T.loads, loop: {}, bangs: [], whoosh: null, garage: {}, derived: {}, mem: 0, peak: 0, files: 0 };
        var jobs = [], done = 0, total = 0, inflight = 0, bytesIn = 0;
        var L = { p: null, progress: 0, B: B };
        function job(name, fn, pri) { total++; jobs.push({ name: name, fn: fn, pri: pri }); }
        T.loops.forEach(function (lp) { job(lp.file, function (buf) { var d = buf.getChannelData(0); if (lp.gain !== 1) for (var i = 0; i < d.length; i++) d[i] *= lp.gain; (B.loop[lp.rpm] || (B.loop[lp.rpm] = {}))[lp.load] = { buf: buf, native: lp.native, ncyc: lp.ncyc, coh: lp.coh != null ? lp.coh : 0.5 }; }, Math.abs(lp.rpm - 9400) / 10000 + (lp.load === 'on' ? 0 : lp.load === 'off' ? 0.01 : 0.02)); });
        var G = J.garage || {};
        if (G.idle && G.idle[tr]) job(G.idle[tr].file, function (buf) { B.garage.idle = { buf: buf, rpm: G.idle.rpm || 4283, gain: G.idle.gain || 1 }; }, 1);
        if (G.fireup && G.fireup[tr]) job(G.fireup[tr].file, function (buf) { B.garage.fireup = { buf: buf, catchAt: G.fireup.catchAt, settleAt: G.fireup.settleAt }; }, 1.1);
        J.shots.bangs.forEach(function (s, i) { job(s.file, function (buf) { B.bangs[i] = buf; }, 1.2); });
        job(J.shots.whoosh.file, function (buf) { B.whoosh = buf; }, 1.2);
        for (var dk in J.derived || {}) (function (dk) { var d = J.derived[dk]; if (d[tr]) job(d[tr].file, function (buf) { var g = d[tr].gain || 1; if (g !== 1) for (var c = 0; c < buf.numberOfChannels; c++) { var x = buf.getChannelData(c); for (var i = 0; i < x.length; i++) x[i] *= g; } B.derived[dk] = { buf: buf, meta: d }; }, 1.5); })(dk);
        if (tr === 'hi') ['revs', 'limiter', 'pullaway'].forEach(function (k) { if (G[k] && G[k].hi) job(G[k].hi.file, function (buf) { B.garage[k] = { buf: buf, loop: !!G[k].loop }; }, 2); });
        jobs.sort(function (p, q) { return p.pri - q.pri; });
        L.p = new Promise(function (resolve, reject) {
          var failed = false;
          function next() {
            if (failed) return;
            if (!jobs.length && !inflight) { B.bangs = B.bangs.filter(Boolean); B.ready = true; $.banks[tr] = B; resolve(B); return; }
            while (inflight < 2 && jobs.length) {
              var j = jobs.shift(); inflight++;
              (function (j) {
                env.fetch(ID, j.name).then(function (ab) { bytesIn += ab.byteLength; B.peak = Math.max(B.peak, B.mem + bytesIn); return dctx.decodeAudioData(ab); }).then(function (buf) {
                  j.fn(buf); B.mem += buf.length * buf.numberOfChannels * 4; B.files++; inflight--; done++; L.progress = done / total; B.peak = Math.max(B.peak, B.mem + bytesIn); bytesIn = 0; next();
                }).catch(function (e) { failed = true; reject(new Error(j.name + ': ' + (e && e.message || e))); });
              })(j);
            }
          }
          next();
        });
        $.loads[tr] = L;
        L.p.catch(function () { delete $.loads[tr]; });
        return L.p;
      }

      /* ------------------------------------------------------------------------------------------------ the rig -- */
      // the whole engine sound on one context: the focus voice and its mix, the rivals' voices, the bed, the garage's
      // scenery, the X07 ripple and the X13 replies. Live (the page's AudioContext) or offline (A.offline, the tests and
      // the derived renders): the same code. frame(view, listener, dt, now): now = the context's time the frame is
      // computed at (ac.currentTime live; the tape's time offline)
      // the engine bus into audio.engines (0.9) and the master (0.55) and its limiter: with the field (20 cars) the game's
      // drive measured -14.0 LUFS integrated in chase and in T-cam (trimmed +1.6 dB) before the limiter at 1.28, and -13.2
      // after it (the limiter's own make-up gain, +0.85 dB) with a true peak of -0.2 dBTP; 1.16 is -14.0 after it
      // (D-DESIGN 6.2: -14 +- 1 LUFS, true peak <= -1 dBTP)
      var ENGINE_GAIN = 1.16, RIVALS = 0.54;
      // the engines' peak limiter, at the world's engine path (after the tunnel): its ceiling in dBFS of that path, which
      // reaches the page's output through audio.engines (0.9), the master (0.55) and v1's limiter (-1.5 dB, its own +0.85 dB
      // make-up): +2 dB here is -4.2 dBFS into v1's limiter and -3.3 dBFS out of it, under its threshold, so v1's limiter
      // (2 ms attack) never has to catch the engines' peaks and the world's buses keep their headroom
      var ENGINE_CEIL = 2.0, WORLD_CEIL = 0;
      function Rig(ac, dest, o) {
        var B = o.bank, hi = o.quality !== 'low', LEAD = o.lead != null ? o.lead : hi ? 0.03 : 0.05, seed = (o.seed >>> 0) || 1;
        var N0 = o.solo ? { lite: 0, mini: 0, liteGrid: 0 } : { lite: hi ? 3 : 1, mini: hi ? 4 : 3, liteGrid: hi ? 3 : 2 }, N = { lite: N0.lite, mini: N0.mini };
        var bus = K.gainOf(ac, o.gain != null ? o.gain : ENGINE_GAIN), gate = K.gainOf(ac, 1), live = K.gainOf(ac, 1);
        // (the A/B's helmet only, o.helmet: D-DESIGN 6.3's cockpit, -9 dB above 1.6 kHz and a 7 kHz roll-off on every engine
        // voice; a switch cross-fades the two over 120 ms. The game's cockpit hears the bus dry, as the T-cam does)
        var HELM = !!o.helmet, dry = K.gainOf(ac, 1), hel = null;
        live.connect(dry); dry.connect(gate);
        if (HELM) { var hs = K.bqOf(ac, 'highshelf', 1600, 0.71, -9), hl = K.bqOf(ac, 'lowpass', 7000, 0.6); hel = K.gainOf(ac, 0); live.connect(hs); hs.connect(hl); hl.connect(hel); hel.connect(gate); }
        gate.connect(bus); bus.connect(dest);
        function helmet(t, on) { if (!HELM) return; [[dry, on ? 0 : 1], [hel, on ? 1 : 0]].forEach(function (p) { p[0].gain.cancelScheduledValues(t); p[0].gain.setValueAtTime(p[0].gain.value, t); p[0].gain.linearRampToValueAtTime(p[1], t + 0.12); }); }
        var R = K.rng(seed * 977 + 13), log = [], rows = [], prev = {}, lastTA = -1, simT = null, mode = null, focusCar = -1, frames = 0;
        var cfg = o.cfg || {}, specs = cfg.specs || [];
        function L(e) { log.push(e); if (log.length > 200) log.shift(); }
        // ---- the focus: the full voice in its mix, and its idle layer (the garage idle, 4,283 rpm)
        // (phones: a shift's cut, a blip and the limiter drawn with a control point every 8 ms instead of 4: the cut's 26 ms
        // keep their 2.5 ms edges; it halves the automation the main thread schedules while they run)
        var DPT = { pt: hi ? 0.004 : 0.008 };
        var F = { car: -1, V: K.Voice(ac, B, { seed: seed * 7 + 11 }), D: K.Drive(seed * 131 + 1, DPT), out: null, tap: null, g: K.gainOf(ac, 0) };
        F.g.connect(live);
        F.V.start(0);
        if (B.garage.idle) {
          var ib = B.garage.idle; F.idle = { s: ac.createBufferSource(), g: K.gainOf(ac, 0) }; F.idle.s.buffer = ib.buf; F.idle.s.loop = true; F.idle.s.connect(F.idle.g);
          F.idle.g.connect(F.V.stems.exh); F.idle.s.start(0, 0); F.idle.rpm = ib.rpm; F.idle.k = ib.gain || 1;
        }
        // (the TV chain's 1/r stops at 5 m, not v4's 2.5 m: a camera beside a car never plays it more than 6 dB over its 10 m
        // reference; v4's fly-by passed at 14 m and is unchanged)
        function mixFor(md) {
          var T = K.tapStems(ac, F.V);
          var X = md === 'tv' ? K.Spatial(ac, T, F.g, { full: true, ground: hi, rmin: 5 }) : K.Mixer(ac, T, md, F.g, { helmet: HELM });
          X.tap = T; X.mode = md; return X;
        }
        // ---- the rivals' voices (lite: the grain voice, exhaust only; mini: two looped loops) and the bed. Their 1/r stops at
        // 5 m (the live lap-1 pack, side by side from 2.5 m, played rivals 12 dB over their 10 m reference and louder than
        // your own car; X14's close from 40 m to 5 m is still +18 dB)
        // (every rival, voiced or in the bed, through one gain: RIVALS from your own car's cameras, 1 on TV. They are heard
        // from your car (D-world's hearing point for X14), at their 10 m reference, while your own car's mix is the one the
        // owner heard at -14 LUFS: one car 10 m off sounded as loud as yours, and the live lap-1 pack (the first race starts
        // from P20) read 2.8 dB over your car alone, -11.4 LUFS. From the chase camera 7.5 m behind your car a rival 10 m
        // ahead is 17.5 m off; on board your engine is under the lens. TV hears every car, yours too, through the same
        // chain, so nothing is trimmed there. X14's close and X13's replies are measured relative to themselves)
        var RIV = o.rivals != null ? o.rivals : RIVALS, rivG = K.gainOf(ac, RIV); rivG.connect(live);
        var lites = [], minis = [];
        for (var i = 0; i < Math.max(N0.lite, N0.liteGrid); i++) (function (i) {
          var V = K.Voice(ac, B, { seed: seed * 7 + 101 + i * 13, lite: true }), g = K.gainOf(ac, 0); V.start(0);
          lites.push({ k: 'lite', V: V, D: K.Drive(seed * 131 + 50 + i, DPT), sp: K.Spatial(ac, V, g, { ground: hi, rmin: 5 }), g: g, car: -1, next: -1, at: 0 }); g.connect(rivG);
        })(i);
        for (i = 0; i < N0.mini; i++) (function (i) {
          var M = K.Mini(ac, B, { seed: seed + 300 + i }), g = K.gainOf(ac, 0);
          minis.push({ k: 'mini', V: M, D: K.Drive(seed * 131 + 90 + i, DPT), sp: K.Spatial(ac, M, g, { rmin: 5 }), g: g, car: -1, next: -1, at: 0 }); g.connect(rivG);
        })(i);
        var bedBuf = B.derived.field ? B.derived.field.buf : B.loop[9625] && B.loop[9625].on ? B.loop[9625].on.buf : null;
        var bedMeta = B.derived.field ? B.derived.field.meta : { rss: 1 / K.MIX.out, native: 9625 };
        var bed = bedBuf && !o.solo ? K.Bed(ac, bedBuf, rivG, { native: bedMeta.native || 9625, lp: 4000 }) : null;
        if (bed) bed.ref = 1 / (bedMeta.rss || 1);
        // ---- the engine gate: the intro holds the engines until they fire (X07); pause, the demo watchdog
        var G0 = { open: true };
        function gateTo(t, v, dur) { gate.gain.cancelScheduledValues(t); gate.gain.setValueAtTime(gate.gain.value, t); gate.gain.linearRampToValueAtTime(v, t + (dur || 0.08)); }

        function rowOf(c, i) {
          return { n: c.n != null ? c.n : i, rpm: +c.rpm || 0, thr: c.thr != null ? +c.thr : +c.throttle || 0, brk: +c.brk || +c.brake || 0, gear: c.gear | 0, v: c.v != null ? +c.v : +c.speed || 0,
            x: +c.x || 0, y: +c.y || 0, z: +c.z || 0, h: +c.h || 0, limiter: !!c.limiter, shift: c.shift | 0, focus: !!c.focus, d: c.d, held: c.held, spec: c.spec };
        }
        function listenerOf(Lr, F0) {
          var qx = Lr.qx || 0, qy = Lr.qy || 0, qz = Lr.qz || 0, qw = Lr.qw == null ? 1 : Lr.qw;
          var rx = 1 - 2 * (qy * qy + qz * qz), rz = 2 * (qx * qz - qw * qy), rl = Math.sqrt(rx * rx + rz * rz) || 1;
          var Lp = { x: +Lr.x || 0, y: +Lr.y || 0, z: +Lr.z || 0, rx: rx / rl, rz: rz / rl };
          var md = Lr.mode || Lr.cam;
          if (md === 'chase' || md === 'tcam' || md === 'cockpit' || md === 'tv') Lp.mode = md;
          else if (F0) { var dd = Math.sqrt(Math.pow(F0.x - Lp.x, 2) + Math.pow(F0.z - Lp.z, 2)); Lp.mode = dd > 14 ? 'tv' : Lr.onboard && dd < 3 ? 'tcam' : 'chase'; }
          else Lp.mode = 'tv';
          return Lp;
        }
        // audibility: directivity x min(1, 10 m / max(r, 2.5)) x (0.5 + 0.5 x throttle)
        function aud(c, Lp) {
          var dx = c.x - Lp.x, dz = c.z - Lp.z, r = Math.sqrt(dx * dx + dz * dz + Math.pow(c.y - Lp.y, 2)), hz = Math.sqrt(dx * dx + dz * dz) || 1e-3;
          var cosB = (dx * Math.sin(c.h) - dz * Math.cos(c.h)) / hz;  // listener behind the car: +1
          var e = 0.34 + 0.66 * Math.pow(0.5 + 0.5 * cosB, 1.4);
          return { a: e * Math.min(1, 10 / Math.max(r, 2.5)) * (0.5 + 0.5 * clamp(c.thr, 0, 1)), r: r, side: clamp((dx * Lp.rx + dz * Lp.rz) / hz, -1, 1) };
        }

        // ---- events, by car, with their sim time (mapped to audio time at the next frame)
        var pend = {}, phase = 'race', pinned = [], replies = null;
        function event(name, e) {
          e = e || {};
          if (e.t != null && isFinite(+e.t)) simT = simT == null ? +e.t : Math.max(simT, +e.t);
          if (name === 'shift' && e.car != null) { (pend[e.car] || (pend[e.car] = [])).push({ st: +e.t, from: e.from | 0, to: e.to | 0 }); return; }
          L({ e: name, t: e.t, at: +ac.currentTime.toFixed(3) });
          if (name === 'intro') { if (e.variant !== 'race-again' && e.variant !== 'skip') { G0.open = false; G0.intro = true; gateTo(ac.currentTime, 0, 0.02); } }
          // (X07 waits for the frame after its beat, heard from that frame's camera: the director cuts to the crane (shot G0)
          // in the same update as the beat, so the camera of the frame before is the helicopter's, 330-450 m off; a shot
          // that comes a frame late is waited for, up to 6 frames)
          else if (name === 'engines') { phase = 'grid'; G0.intro = false; ripplePending = e; ripF = frames; }
          else if (name === 'shot') shotF = frames;
          // (the race's rev phase starts when the intro builds the race at its dip: while the intro holds the engines it
          // leaves the gate shut, so the grid stays silent until its engines fire, X07)
          else if (name === 'rev' && G0.intro) phase = 'grid';
          else if (name === 'skip' || name === 'handoff' || name === 'again' || name === 'rev') { G0.intro = false; if (!G0.open) { G0.open = true; stopRipple(ac.currentTime); gateTo(ac.currentTime, 1, 0.3); } if (name === 'rev' || name === 'again') phase = 'grid'; }
          else if (name === 'light') phase = 'lights';
          else if (name === 'go') { phase = 'race'; pinned = []; }
          else if (name === 'grid-gas') { if (replies) { var tg = Math.max(ac.currentTime + LEAD, lastTA); replies.call(simT != null && isFinite(+e.t) ? tg - (simT - +e.t) : tg, +e.rpm, tg); } }
          else if (name === 'scenery') scenery(e);
          else if (name === 'podium') { gateTo(ac.currentTime, 0, 1.5); G0.open = false; }
        }

        // ---- X07: the engines fire down the grid, P1 to P20, heard 0.12 s apart (the card's ripple, measured at the camera):
        // each car's fire-up (starter, catch, idle) heard from the camera with its own time of flight, air and 1/r, and
        // started early by that time of flight, so the ripple reaches the lens evenly whichever end of the grid is nearer
        // (from the crane behind P20 the far cars' sound takes up to 0.5 s; started together they were heard 0.097-0.104 s
        // apart). Then the live voices take over at idle
        var RIP = null;
        function X07(e) {
          var t0 = Math.max(ac.currentTime + LEAD, lastTA) + 0.02, fu = B.garage.fireup;
          G0.open = true;
          if (!fu || !rows.length) { gateTo(t0, 1, 0.3); return; }
          var order = rows.slice().sort(function (a, b) { return a.d != null && b.d != null ? b.d - a.d : a.n - b.n; }), Lp = RIP0L || listenerOf({}, null), dur = fu.buf.duration;
          RIP = { nodes: [], t0: t0, onsets: [], at: Lp ? { x: +Lp.x.toFixed(1), y: +Lp.y.toFixed(1), z: +Lp.z.toFixed(1) } : null };
          var mixG = K.gainOf(ac, 1); mixG.connect(bus); RIP.g = mixG;
          var geo = order.map(function (c) { var dx = c.x - Lp.x, dz = c.z - Lp.z, dy = (c.y || 0) + 0.55 - Lp.y; return { c: c, dx: dx, dz: dz, r: Math.sqrt(dx * dx + dy * dy + dz * dz), hz: Math.sqrt(dx * dx + dz * dz) || 1 }; });
          // (the first arrival: as soon as every car can still start at or after t0)
          var base = t0; geo.forEach(function (q, k) { base = Math.max(base, t0 + q.r / K.C_AIR - 0.12 * k); });
          geo.forEach(function (q, k) {
            var c = q.c, r = q.r, arrive = base + 0.12 * k, ts = arrive - r / K.C_AIR;
            var s = ac.createBufferSource(), lp = K.bqOf(ac, 'lowpass', clamp(24000 * Math.exp(-r / 115), 1800, 20000), 0.5), g = K.gainOf(ac, 0), p = ac.createStereoPanner();
            s.buffer = fu.buf; s.connect(lp); lp.connect(g); g.connect(p); p.connect(mixG);
            p.pan.value = clamp((q.dx * Lp.rx + q.dz * Lp.rz) / q.hz, -1, 1) * 0.9;
            var gv = (B.garage.idle ? B.garage.idle.gain : 1) * 10 / Math.max(r, 2.5);
            g.gain.setValueAtTime(gv, arrive); g.gain.setValueAtTime(gv, arrive + dur - 0.8); g.gain.linearRampToValueAtTime(0, arrive + dur);
            s.start(arrive); s.stop(arrive + dur + 0.01);
            RIP.nodes.push(s, lp, g, p); RIP.onsets.push({ car: c.n, fire: +ts.toFixed(4), arrive: +arrive.toFixed(4), r: +r.toFixed(2) });
          });
          // the live engines rise as the fire-ups fade (the first fade starts at P1's end - 0.8 s, the last ends at P20's end)
          var a0 = base + dur - 0.8, a1 = base + 0.12 * (order.length - 1) + dur;
          gateTo(t0, 0, 0.05); gate.gain.setValueAtTime(0, a0); gate.gain.linearRampToValueAtTime(1, a1);
          RIP.end = a1; L({ e: 'ripple', t0: +t0.toFixed(3), first: +base.toFixed(3), cars: order.length, end: +a1.toFixed(3), r0: +geo[0].r.toFixed(1), r1: +geo[geo.length - 1].r.toFixed(1) });
        }
        var RIP0L = null, ripplePending = null, ripF = -1, shotF = -1, RPL = { t: null, s: 1, n: 0 }, SLOW = 1;
        function stopRipple(t) { if (!RIP) return; RIP.g.gain.setTargetAtTime(0, t, 0.1); var R0 = RIP; RIP = null; R0.nodes.forEach(function (n) { if (n.stop) try { n.stop(t + 0.6); } catch (e) { } }); }

        // ---- the garage set as scenery (desktop): a positional loop or one-shot (revs, the pit limiter, the pull-away,
        // the idle) at { x, y, z }, heard like a car (Spatial)
        var scen = [];
        function scenery(e) {
          var gk = B.garage[e.kind]; if (!gk) return;
          var t = Math.max(ac.currentTime + LEAD, lastTA), s = ac.createBufferSource(), g = K.gainOf(ac, (B.garage.idle ? B.garage.idle.gain : 1) * (e.gain != null ? +e.gain : 1));
          s.buffer = gk.buf; s.loop = e.loop != null ? !!e.loop : !!gk.loop; s.connect(g);
          var sp = K.Spatial(ac, { stems: { exh: g }, wout: K.gainOf(ac, 0) }, live, { ground: hi });
          s.start(t); if (!s.loop) s.stop(t + gk.buf.duration);
          scen.push({ s: s, sp: sp, pose: { x: +e.x || 0, y: +e.y || 0, z: +e.z || 0, h: +e.h || 0 }, until: s.loop ? (e.dur ? t + +e.dur : Infinity) : t + gk.buf.duration });
        }

        // ---- X13: the grid answers your revs. A call: your held rpm (sim) crossing up through 7,000 after >= 0.25 s under
        // 6,000, its peak the highest rpm in the next 0.6 s (or A's grid-gas event); the 3 nearest cars (2 on phones) answer
        // 0.2-0.6 s later in their persona's style, an override of their drive for 0.6-1.2 s
        var STYLE = { redteam: 'limiter', tick: 'limiter', glitch: 'limiter', gbot: 'metronome', cron: 'metronome', servo: 'metronome', hedge: 'quiet', blueteam: 'quiet', daemon: 'late' };
        function Replies() {
          var X = { under: 0, armed: false, call: null, list: [], calls: [] }, RR = K.rng(seed * 59 + 3);
          X.styleOf = function (car) { var sp = (rows[car] && rows[car].spec) || specs[car] || {}; return STYLE[sp.row] || 'default'; };
          // (the sim's own rpm for a car at a time, overridden while a reply runs)
          X.ovr = function (car) {
            return function (t) {
              for (var i = X.list.length - 1; i >= 0; i--) {
                var r = X.list[i]; if (r.car !== car || t < r.t0 || t > r.t1) continue;
                var u = t - r.t0, base = r.base;
                if (r.style === 'limiter') return u < 0.12 ? { rpm: base + (12500 - base) * (u / 0.12), thr: 1 } : u < 0.57 ? { rpm: 12500, thr: 1, lim: true } : { rpm: base + (12500 - base) * Math.exp(-(u - 0.57) / 0.12), thr: 0 };
                var pk = r.peak, rise = r.style === 'metronome' ? 0.15 : 0.09, hold = r.style === 'metronome' ? 0.1 : 0;
                return u < rise ? { rpm: base + (pk - base) * (u / rise), thr: 1 } : u < rise + hold ? { rpm: pk, thr: 1 } : { rpm: base + (pk - base) * Math.exp(-(u - rise - hold) / 0.12), thr: 0 };
              }
              return null;
            };
          };
          // (tAudio: the call's own time; tNow: when its peak is known; a reply is never scheduled before tNow)
          X.call = function (tAudio, peakSim, tNow) {
            if (X.calls.length && tAudio - X.calls[X.calls.length - 1].t < 0.8) return;
            X.calls.push({ t: tAudio, peak: peakSim, known: tNow });
            var ans = pinned.slice(0, hi ? 3 : 2), lastOther = tAudio, t1 = (tNow || tAudio) + 0.02;
            var made = ans.map(function (car) { var st = X.styleOf(car); if (st === 'quiet') return null; return { car: car, style: st, t0: Math.max(t1, tAudio + 0.2 + 0.4 * RR()) }; }).filter(Boolean);
            made.forEach(function (r) { if (r.style !== 'late') lastOther = Math.max(lastOther, r.t0); });
            made.forEach(function (r) {
              var base = rows[r.car] ? Math.max(4000, rows[r.car].rpm) : 4000;
              if (r.style === 'late') r.t0 = lastOther + 0.35;
              r.base = base; r.peak = r.style === 'metronome' ? peakSim : base > 9000 ? Math.min(12400, base + 600 / K.S) : Math.max(base + 1000, 0.85 * peakSim);
              r.t1 = r.t0 + (r.style === 'limiter' ? 1.2 : 0.8);
              X.list.push(r); L({ e: 'reply', car: r.car, style: r.style, t0: +r.t0.toFixed(3), peak: Math.round(r.peak) });
            });
            X.list = X.list.filter(function (r) { return r.t1 > tAudio - 2; });
          };
          // (the call derived from your held rpm, until A writes grid-gas: it crosses up through 7,000 after >= 0.25 s under
          // 6,000; its peak is known when the rpm turns down (under 97 % of its highest) or 0.6 s after the crossing)
          X.watch = function (tA, rpmSim, dt) {
            if (rpmSim < 6000) X.under += dt; else if (rpmSim < 7000) { } else { if (!X.armed && X.under >= 0.25) { X.armed = true; X.call0 = { t: tA, peak: rpmSim, until: tA + 0.6 }; } X.under = 0; }
            if (X.call0) { X.call0.peak = Math.max(X.call0.peak, rpmSim); if (tA >= X.call0.until || (rpmSim < 0.97 * X.call0.peak && tA - X.call0.t >= 0.05)) { X.call(X.call0.t, X.call0.peak, tA); X.call0 = null; X.armed = false; } }
          };
          return X;
        }
        replies = Replies();

        // ---- the voice plan: who gets which voice (hysteresis 1.4x for 0.25 s), steals faded over 60 ms
        var want = {};
        function plan(tA, cands) {
          var ids = {}, order = cands.slice().sort(function (p, q) { return q.a - p.a; });
          function fill(slots, n, kind, taken) {
            var hold = {}; slots.forEach(function (s) { if (s.car >= 0) hold[s.car] = s; });
            // pinned cars first (the grid's repliers: lite only)
            var wantSet = [], k;
            if (kind === 'lite') pinned.forEach(function (c) { if (wantSet.length < n && !taken[c] && c !== focusCar) wantSet.push(c); });
            for (k = 0; k < order.length && wantSet.length < n; k++) { var c = order[k].n; if (taken[c] || wantSet.indexOf(c) >= 0) continue; wantSet.push(c); }
            // hysteresis: a holder keeps its slot unless a challenger has beaten it by 1.4x for 0.25 s
            var aOf = {}; cands.forEach(function (q) { aOf[q.n] = q.a; });
            var keep = [], chal = [];
            slots.slice(0, n).forEach(function (s) { if (s.car >= 0 && !taken[s.car] && s.car !== focusCar && aOf[s.car] != null) keep.push(s.car); });
            wantSet.forEach(function (c) { if (keep.indexOf(c) < 0) chal.push(c); });
            chal.forEach(function (c) {
              var free = slots.slice(0, n).filter(function (s) { return (s.car < 0 || keep.indexOf(s.car) < 0) && s.next < 0; })[0];
              if (free) { assign(free, c, tA); keep.push(c); return; }
              var weakest = keep.slice().sort(function (p, q) { return aOf[p] - aOf[q]; })[0];
              var forced = pinned.indexOf(c) >= 0 && pinned.indexOf(weakest) < 0;
              if (weakest != null && (forced || aOf[c] > 1.4 * aOf[weakest])) {
                want[c] = want[c] || tA;
                if (forced || tA - want[c] >= 0.25) { var sl = slots.filter(function (s) { return s.car === weakest; })[0]; if (sl) { assign(sl, c, tA); keep[keep.indexOf(weakest)] = c; delete want[c]; } }
              } else delete want[c];
            });
            slots.forEach(function (s, i) { if (i >= n && s.car >= 0 && s.next < 0) assign(s, -2, tA); });
            keep.forEach(function (c) { taken[c] = kind; });
            return taken;
          }
          var taken = {}; if (focusCar >= 0) taken[focusCar] = 'full';
          fill(lites, N.lite, 'lite', taken); fill(minis, N.mini, 'mini', taken);
          return taken;
        }
        function assign(slot, car, tA) {
          if (slot.car < 0 && slot.next < 0) { if (car >= 0) { slot.car = car; slot.at = tA; slot.g.gain.cancelScheduledValues(tA); slot.g.gain.setValueAtTime(0, tA); slot.g.gain.linearRampToValueAtTime(1, tA + 0.06); slot.fresh = true; } return; }
          if (slot.next >= 0 || slot.car === car) return;
          slot.next = car; slot.switchAt = tA + 0.06;
          slot.g.gain.cancelScheduledValues(tA); slot.g.gain.setValueAtTime(slot.g.gain.value, tA); slot.g.gain.linearRampToValueAtTime(0, tA + 0.06);
        }
        function handOver(slot, tA) {
          if (slot.next === -1 || tA < slot.switchAt) return;
          slot.V.reset(slot.switchAt); slot.D.reset();
          slot.car = slot.next === -2 ? -1 : slot.next; slot.next = -1; slot.fresh = true;
          if (slot.car >= 0) { slot.g.gain.cancelScheduledValues(tA); slot.g.gain.setValueAtTime(0, tA); slot.g.gain.linearRampToValueAtTime(1, tA + 0.06); }
        }

        // ---- drive one voice for a frame: its controls, its one-shots (scaled per perspective), its place
        function shiftsFor(car, tA) {
          var p = pend[car]; if (!p || !p.length) return [];
          var out = [];
          for (var i = 0; i < p.length; i++) { var e = p[i], ta = simT != null && isFinite(e.st) ? tA - (simT - e.st) : tA; out.push({ t: Math.max(ac.currentTime + 0.005, Math.min(tA, ta)), from: e.from, to: e.to }); }
          pend[car] = []; return out;
        }
        function driveVoice(slot, c, tA, k1, isFocus) {
          // (a: the car's row when this voice last drove it: the frame before, or two on a phone's rivals)
          var D = slot.D, V = slot.V, a = (!isFocus && slot.pr && slot.pr.n === c.n ? slot.pr : prev[c.n]) || null, sh = shiftsFor(c.n, tA);
          if (!sh.length && a && a.gear > 0 && c.gear > 0 && c.gear !== a.gear) sh.push({ t: tA - 0.008, from: a.gear, to: c.gear }); // (no shift event: the gear change)
          if (D.st.t != null && tA <= D.st.t) return;
          var ov = replies && replies.list.length ? replies.ovr(c.n) : null;
          var r = D.step(tA, a, c, sh, ov);
          for (var i = 0; i < r.pts.length; i++) {
            var p = r.pts[i]; if (V.clock && V.clock() != null && p[0] <= V.clock()) continue;
            var cv = SLOW === 1 ? p[1] : { rpm: p[1].rpm * SLOW, load: p[1].load, cut: p[1].cut, mesh: p[1].mesh * SLOW, ers: p[1].ers, boost: p[1].boost };
            if (V.set.length >= 3 && p[2]) V.set(p[0], cv, p[2]); else V.set(p[0], cv);
          }
          for (i = 0; i < r.shots.length; i++) {
            var s = r.shots[i];
            if (s.type === 'pop') V.pop(s.t, s.amp * k1); else if (s.type === 'bark') V.bark(s.t, s.amp * k1); else if (s.type === 'whoosh') V.whoosh(s.t, s.amp * k1);
            if (isFocus && rec) rec.ev.push({ t: +s.t.toFixed(4), type: s.type, amp: s.amp != null ? +s.amp.toFixed(3) : undefined, to: s.to });
          }
          slot.lastC = r.pts.length ? r.pts[r.pts.length - 1][1] : slot.lastC; slot.pr = c;
        }

        // ---- the frame
        var rec = null, gov = { step: 0 };
        function frame(view, Lr, dt, tNow) {
          dt = clamp(+dt || 1 / 60, 1e-3, 0.25);
          var list = view && view.cars ? view.cars : view || [];
          rows = list.map(rowOf);
          if (!rows.length) return;
          var fIdx = view && view.focus != null ? +view.focus : -1;
          if (fIdx < 0) for (var i = 0; i < rows.length; i++) if (rows[i].focus) { fIdx = i; break; }
          if (fIdx < 0) fIdx = 0;
          if (view && view.t != null) simT = +view.t; else if (view && view.S && view.S.t != null) simT = +view.S.t; else simT = simT == null ? 0 : simT + dt;
          // X32: a replay (view.replay) is heard at its own speed: the tape's rate (view.replay.rate, else the view's time
          // against the frame's, smoothed), every voice's rpm and gear mesh x s, so the firing line tracks rpm x s; the
          // field bed (one loop for the far cars, its rate held near 1) is let go while it plays slower. No tape-stop
          if (view && view.replay) {
            var rq = +view.replay.rate;
            if (rq > 0) RPL.s = clamp(rq, 0.1, 1);
            else if (RPL.t != null && simT != null) { var r0 = (simT - RPL.t) / dt; if (r0 > 0.02 && r0 <= 1.2) RPL.s += (clamp(r0, 0.1, 1) - RPL.s) * (RPL.n < 2 ? 1 : 0.35); }
            RPL.t = simT; RPL.n++;
          } else { RPL.t = null; RPL.s = 1; RPL.n = 0; }
          SLOW = RPL.s > 0.985 ? 1 : RPL.s;
          var tA = Math.max(tNow + LEAD, lastTA + 1e-3); lastTA = tA; frames++;
          var Fc = rows[fIdx], Lp = listenerOf(Lr || {}, Fc); RIP0L = Lp;
          if (ripplePending && (shotF >= ripF || frames - 1 - ripF >= 6)) { var rp0 = ripplePending; ripplePending = null; lastTA = Math.max(lastTA, tA - 1e-3); X07(rp0); }
          // the focus car and its mix (a new car: the voice handed over; a new camera: a 120 ms cross-fade)
          if (fIdx !== focusCar) {
            if (focusCar >= 0) { F.V.reset(tA); F.D.reset(); }
            focusCar = fIdx; F.g.gain.cancelScheduledValues(tA); F.g.gain.setValueAtTime(0, tA); F.g.gain.linearRampToValueAtTime(1, tA + 0.06);
            lites.concat(minis).forEach(function (s) { if (s.car === fIdx) assign(s, -2, tA); });
          }
          var md = Lp.mode;
          // (a TV camera on the focus car itself, THE MOMENT's third cut (the T-cam turned round, about 1 m from it), hears it
          // as the T-cam does: the onboard mix. The trackside chain played it 18 dB over the replay's other cuts and clipped;
          // in within 3 m, out past 5 m)
          if (md === 'tv' && Fc) { var dOn = Math.sqrt(Math.pow(Fc.x - Lp.x, 2) + Math.pow((Fc.y || 0) - Lp.y, 2) + Math.pow(Fc.z - Lp.z, 2)); if (dOn < (F.onTv ? 5 : 3)) md = 'tcam'; F.onTv = md === 'tcam'; } else F.onTv = false;
          // (the rivals, the bed and the scenery are heard from your car in the chase view, panned from the camera: the camera
          // 7.5 m behind took 6 dB off X14's close from 40 m to 5 m, measured; D-world)
          var Lh = md === 'chase' && Fc ? { x: Fc.x, y: (Fc.y || 0) + 1.0, z: Fc.z, rx: Lp.rx, rz: Lp.rz, mode: md } : Lp;
          if (!F.out || F.out.mode !== md) {
            var old = F.out; F.out = mixFor(md); F.out.fade(tA, 1, 0.12);
            if (old) { old.fade(tA, 0, 0.12); (function (old) { var t1 = tA + 0.15; if (K.isOffline(ac)) K.atRender(ac, t1 + 0.05, function () { old.stop(); old.tap.release(); }); else if (win.setTimeout) win.setTimeout(function () { old.stop(); old.tap.release(); }, (t1 - ac.currentTime) * 1000 + 50); })(old); }
            if ((md === 'cockpit') !== (mode === 'cockpit')) helmet(tA, md === 'cockpit');
            rivG.gain.setTargetAtTime(md === 'tv' ? 1 : RIV, tA, 0.04);
            mode = md; L({ e: 'mode', mode: md, at: +tA.toFixed(3) }); F.lean = false;
          }
          if (F.out.lean && (gov.step >= 3) !== !!F.lean) { F.lean = gov.step >= 3; F.out.lean(tA, F.lean); }
          if (F.out.update) F.out.update(tA, Fc, Lp);
          var k1 = md === 'chase' ? 0.6 : 1;
          driveVoice(F, Fc, tA, k1, true);
          // the idle layer: the garage idle at rate v / 4,283, cross-faded into the bank between 4,300 and 5,500 (equal power)
          if (F.idle && F.lastC) {
            // (each only when its target moved: above 5,500 all three are constant, and a repeated target changes nothing)
            var vr = F.lastC.rpm, u = clamp((vr - 4300) / 1200, 0, 1), wI = u >= 1 ? 0 : Math.cos(u * Math.PI / 2), ir = clamp(vr / F.idle.rpm, 0.5, 2), iw = wI * F.idle.k, bw = u >= 1 ? 1 : Math.sin(u * Math.PI / 2);
            if (ir !== F.idle.lr) { F.idle.s.playbackRate.setTargetAtTime(ir, tA, 0.01); F.idle.lr = ir; }
            if (iw !== F.idle.lg) { F.idle.g.gain.setTargetAtTime(iw, tA, 0.03); F.idle.lg = iw; }
            // the bank under the idle: its weight sin(u) (the voice's own loops come in above 4,300)
            if (bw !== F.idle.lb) { F.V.params.bank.setTargetAtTime(bw, tA, 0.03); F.idle.lb = bw; }
          }
          // the grid: X13's repliers pinned (the nearest cars to yours), and the calls from your revs
          if (phase === 'grid' || phase === 'lights') {
            if (!pinned.length || frames % 30 === 0) pinned = rows.filter(function (c) { return c.n !== fIdx; }).map(function (c) { return { n: c.n, d: Math.hypot(c.x - Fc.x, c.z - Fc.z) }; }).sort(function (p, q) { return p.d - q.d; }).slice(0, N0.liteGrid).map(function (q) { return q.n; });
            N.lite = Math.max(N0.liteGrid, N.lite);
            replies.watch(tA, Fc.rpm, dt);
          } else N.lite = gov.step >= 1 && !hi ? 0 : N0.lite;
          N.mini = gov.step >= 2 ? 1 : gov.step >= 1 && !hi ? N0.mini + 1 : N0.mini;
          if (gov.step >= 4) { N.lite = 0; N.mini = 0; }
          // the rest: plan, drive, place
          var cands = [];
          rows.forEach(function (c) { if (c.n === fIdx) return; var A0 = aud(c, Lh); if (A0.r < 335) cands.push({ n: c.n, a: A0.a, r: A0.r, side: A0.side }); });
          var taken = plan(tA, cands), audOf = {}; cands.forEach(function (q) { audOf[q.n] = q; });
          // (phones: each rival's voice is driven and placed every other frame, half of them on each, so their automation
          // spans two frames; a voice just handed a car is driven at once. The bed likewise. The focus voice every frame)
          var half = !hi;
          lites.concat(minis).forEach(function (s, si) {
            handOver(s, tA);
            if (s.car < 0) return;
            var c = rows[s.car]; if (!c) return;
            if (s.fresh) { s.fresh = false; }
            else if (half && ((frames + si) & 1)) return;
            driveVoice(s, c, tA, s.k === 'lite' ? 0.6 : 0, false);
            s.sp.update(tA, c, Lh, false);
          });
          // the bed: every car without a voice
          if (bed && !(half && (frames & 1))) {
            var e2 = 0, sd = 0, rw = 0, rr = 0, rm = 0;
            rows.forEach(function (c) {
              if (c.n === fIdx || taken[c.n]) return;
              var q = audOf[c.n] || aud(c, Lh), w = q.a * q.a; e2 += w; sd += w * q.side; rw += w * vmapOf(c); rr += w * q.r; rm += w;
            });
            var lvl = SLOW === 1 ? Math.sqrt(e2) * bed.ref : 0;
            bed.set(tA, lvl, rm > 0 ? clamp(sd / rm, -1, 1) * 0.9 : 0, rm > 0 ? rw / rm : 9625, rm > 0 ? rr / rm : 100);
          }
          // scenery
          for (i = scen.length - 1; i >= 0; i--) { var sc = scen[i]; if (tA > sc.until + 0.2) { sc.sp.stop(); scen.splice(i, 1); continue; } sc.sp.update(tA, sc.pose, Lh, false); }
          rows.forEach(function (c) { prev[c.n] = c; });
          // (shift events of cars without a voice are dropped: a voice that takes a car later starts from its state)
          for (var pc in pend) if (pend[pc].length && +pc !== fIdx && !taken[pc]) pend[pc] = [];
        }
        function vmapOf(c) { return K.vmap(c.rpm); }
        // the focus voice's controls, recorded at 100 Hz of audio time from its drive's 1 kHz steps (measure.cjs's format)
        function recording() {
          rec = { rpm: [], load: [], mesh: [], ers: [], boost: [], gear: [], tun: [], thr: [], ev: [], tNext: 0 };
          F.D.log = function (t, c, gear, thr) {
            while (rec.tNext <= t) { rec.rpm.push(+c.rpm.toFixed(1)); rec.load.push(+c.load.toFixed(3)); rec.mesh.push(+c.mesh.toFixed(1)); rec.ers.push(+c.ers.toFixed(3)); rec.boost.push(+c.boost.toFixed(3)); rec.gear.push(gear); rec.thr.push(+thr.toFixed(3)); rec.tun.push(0); rec.tNext += 0.01; }
          };
          // (the rivals' voices too: [t, car, voice rpm, cut] every 10 ms of each lite voice)
          rec.lites = [];
          lites.forEach(function (sl) { sl.tNext = 0; sl.D.log = function (t, c) { if (t >= sl.tNext) { rec.lites.push([+t.toFixed(3), sl.car, Math.round(c.rpm), +c.cut.toFixed(2)]); sl.tNext = t + 0.01; } }; });
          return rec;
        }
        function state() {
          return { tier: B.tier, sr: ac.sampleRate, mode: mode, focus: focusCar, phase: phase, open: G0.open, gov: gov.step, slow: +SLOW.toFixed(3), n: { lite: N.lite, mini: N.mini },
            voices: [{ car: focusCar, tier: 'full', rpm: F.lastC ? Math.round(F.lastC.rpm) : 0 }].concat(lites.map(function (s) { return { car: s.car, tier: 'lite', rpm: s.lastC ? Math.round(s.lastC.rpm) : 0 }; }), minis.map(function (s) { return { car: s.car, tier: 'mini', rpm: s.lastC ? Math.round(s.lastC.rpm) : 0 }; })),
            grains: F.V.stats.grains + lites.reduce(function (a, s) { return a + s.V.stats.grains; }, 0), pinned: pinned.slice(), ripple: RIP ? { t0: RIP.t0, end: RIP.end, onsets: RIP.onsets } : null, calls: replies.calls.slice(-10), replies: replies.list.map(function (r) { return { car: r.car, style: r.style, t0: r.t0, peak: r.peak }; }), log: log.slice(-40) };
        }
        function idleOut(t) { gateTo(t, 0, 0.3); [F].concat(lites, minis).forEach(function (s) { s.V.reset(t + 0.32); s.D.reset(); }); lastTA = Math.max(lastTA, t + 0.33); }
        function pause(t) { gateTo(t, 0, 0.005); [F].concat(lites, minis).forEach(function (s) { s.V.reset(t + 0.01); s.D.reset(); }); lastTA = t + 0.02; }
        function resume(t) { if (G0.open) gateTo(t + 0.02, 1, 0.08); }
        function stop(t) { gateTo(t, 0, 0.06); [F].concat(lites, minis).forEach(function (s) { try { s.V.stop(t + 0.07); } catch (e) { } }); if (bed) bed.stop(t + 0.07); if (F.idle) try { F.idle.s.stop(t + 0.07); } catch (e) { } }
        return { frame: frame, event: event, state: state, pause: pause, resume: resume, stop: stop, gate: gateTo, gov: gov,
          record: recording, bus: bus, ripple: function () { return RIP; }, idleOut: idleOut };
      }

      /* ================================================================ WORLD (D-world): the view, the crowd's cues == */
      // the view, normalised once a frame for the world (both of gp.js's shapes: the sim's cars, or M1's rows), into reused
      // plain rows; d and lat from the lap table when a row lacks them (M1's rows)
      var WROWS = [], WHINT = [];
      function wRow(i) { return WROWS[i] || (WROWS[i] = { n: i, x: 0, y: 0, z: 0, h: 0, v: 0, rpm: 0, thr: 0, brk: 0, gear: 0, d: null, lat: 0, ay: 0, surf: 0, slip: 0, lock: 0, wall: 0, draft: 0, flap: false, lap: 0, fin: false, held: false }); }
      function wNum(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
      function wView(view, T) {
        var cars = Array.isArray(view) ? view : view && Array.isArray(view.cars) ? view.cars : [], out = [], focus = -1;
        for (var i = 0; i < cars.length; i++) {
          var c = cars[i], r = wRow(i);
          r.n = c.n != null ? c.n : i; r.x = wNum(c.x, 0); r.y = wNum(c.y, 0); r.z = wNum(c.z, 0); r.h = wNum(c.h, 0);
          r.v = wNum(c.v != null ? c.v : c.speed, 0); r.rpm = wNum(c.rpm, 0); r.thr = wNum(c.thr != null ? c.thr : c.throttle, 0); r.brk = wNum(c.brk, 0);
          r.gear = wNum(c.gear, 0); r.ay = wNum(c.ay, 0); r.surf = wNum(c.surf, 0); r.slip = wNum(c.slip, 0); r.lock = wNum(c.lock, 0); r.wall = wNum(c.wall, 0);
          r.draft = wNum(c.draft, 0); r.flap = !!(c.flap && (c.flap.open || c.flap === true)); r.lap = wNum(c.lap, 0); r.fin = !!c.fin; r.held = !!c.held; r.lat = wNum(c.lat, 0);
          if (typeof c.d === 'number' && isFinite(c.d)) r.d = c.d;
          else if (T && typeof T.project === 'function') { var P = WHINT[i] || (WHINT[i] = { i: -1 }); T.project(r.x, r.z, P.i, P); r.d = P.d; r.lat = P.lat; }
          else r.d = null;
          if (c.focus === true) focus = i;
          out.push(r);
        }
        if (view && !Array.isArray(view) && view.focus != null) focus = view.focus;
        return { cars: out, focus: focus >= 0 && focus < out.length ? focus : 0, human: view && view.human != null ? view.human : -1, phase: view && view.phase || null,
          replay: view && view.replay || null, simT: view && typeof view.t === 'number' ? view.t : null };
      }
      // the camera: its place, the level right vector (from its quaternion), and its mode (listener.mode; else the Rig's
      // own rule, so the engines and the world always agree: 14 m from the focus car is TV, onboard within 3 m the T-cam)
      function wListener(l, F) {
        l = l || {};
        var qx = wNum(l.qx, 0), qy = wNum(l.qy, 0), qz = wNum(l.qz, 0), qw = wNum(l.qw, 1);
        var rx = 1 - 2 * (qy * qy + qz * qz), rz = 2 * (qx * qz - qw * qy), rl = Math.hypot(rx, rz) || 1, L = { x: wNum(l.x, 0), y: wNum(l.y, 0), z: wNum(l.z, 0), rx: rx / rl, rz: rz / rl, shot: l.shot || null };
        var md = l.mode || l.cam, fc = F.cars[F.focus];
        if (md === 'chase' || md === 'tcam' || md === 'cockpit' || md === 'tv') L.mode = md;
        else if (fc) { var dd = Math.hypot(fc.x - L.x, fc.z - L.z); L.mode = dd > 14 ? 'tv' : l.onboard && dd < 3 ? 'tcam' : 'chase'; }
        else L.mode = 'tv';
        return L;
      }
      function wFrame(view, listener, dt, tA, Tt) { var F = wView(view, Tt !== undefined ? Tt : env.T || null); F.dt = wNum(dt, 1 / 60); F.tA = tA; F.L = wListener(listener, F); return F; }

      // the crowd's recorded cues (the shootout's approved CC0 takes, D6: bedAmbient, bedHush, inhale, the roar's 'cheer',
      // gasp, groan; never 'whistleTaker', never the 'gol' roar), from the library's audio-crowd-a1 when it is there, else
      // audio-crowd-shootout: each sheet decoded at its own rate off the page's audio (one at a time, the mono sheet first:
      // the phone's peak), the cues cut out, the sheets let go (a phone folds them to mono). Once a page, before there is an
      // AudioContext; on a phone the bank waits for it (D-DESIGN 9.2: the two decodes never stack)
      var WANT = { bedAmbient: null, bedHush: null, inhale: null, gasp: null, groan: null, roar: 'cheer' };
      function loadCrowd() {
        var key = 'crowd:' + tier; $.crowd = $.crowd || {};
        if ($.crowd[key]) return $.crowd[key];
        var id = null, a = null;
        ['audio-crowd-a1', 'audio-crowd-shootout'].some(function (k) { var x = env.asset(k); if (x && x.json && x.json.cues && x.json.sheets) { id = k; a = x; return true; } return false; });
        if (!a) { warn('The crowd\'s recordings (audio-crowd-shootout) are not among the world\'s assets: a synthesised crowd plays.'); return ($.crowd[key] = Promise.resolve(false)); }
        var j = a.json, rate = +j.sampleRate || 32000, t0 = now(), dctx = new OAC(1, 1, rate), C = { id: id, cues: {}, bytes: 0, peak: 0, ms: 0 }, low = tier === 'lo';
        function decode(ab) { return new Promise(function (res, rej) { var r = dctx.decodeAudioData(ab, res, rej); if (r && r.then) r.then(res, rej); }); }
        var names = Object.keys(j.sheets).sort(function (x, y) { return (j.sheets[x].channels || 1) - (j.sheets[y].channels || 1); }), chain = Promise.resolve();
        names.forEach(function (nm) {
          chain = chain.then(function () { return env.fetch(id, j.sheets[nm].file); }).then(decode).then(function (b) {
            // (the sheet's marker: where this decoder put its 0.1 s, a decoder that keeps the encoder's priming being late)
            var sh = j.sheets[nm], mk = +sh.marker || 0, d0 = b.getChannelData(0), m = 0, at = 0;
            for (var i = 0, n = Math.min(d0.length, Math.round((mk + 0.25) * b.sampleRate)); i < n; i++) if (Math.abs(d0[i]) > m) { m = Math.abs(d0[i]); at = i; }
            var offs = mk > 0 && m > 0.1 ? at / b.sampleRate - mk : 0; if (Math.abs(offs) > 0.2) offs = 0;
            C.peak = Math.max(C.peak, C.bytes + b.length * b.numberOfChannels * 4);
            for (var cue in WANT) (j.cues[cue] || []).forEach(function (c) {
              if (c.sheet !== nm || !(c.dur > 0)) return;
              if (WANT[cue] && c.tag !== WANT[cue]) return;
              if (!WANT[cue] && c.tag === 'gol') return;
              var ch = low ? 1 : Math.min(2, b.numberOfChannels), a0 = Math.round((c.at + offs) * b.sampleRate), n2 = Math.min(b.length - a0, Math.round(c.dur * b.sampleRate));
              if (!(n2 > 0)) return;
              var cut = dctx.createBuffer(ch, n2, b.sampleRate);
              if (ch === 1 && b.numberOfChannels > 1) { var o0 = cut.getChannelData(0), x0 = b.getChannelData(0), x1 = b.getChannelData(1); for (var q = 0; q < n2; q++) o0[q] = 0.5 * (x0[a0 + q] + x1[a0 + q]); }
              else for (var cc = 0; cc < ch; cc++) cut.getChannelData(cc).set(b.getChannelData(cc).subarray(a0, a0 + n2));
              // (lead: where the take first comes within 12 dB of its loudest 50 ms, less 30 ms)
              var dc = cut.getChannelData(0), win5 = Math.round(0.05 * b.sampleRate), en = [], mx = 0;
              for (var w0 = 0; w0 + win5 <= n2; w0 += win5) { var ss = 0; for (var q2 = w0; q2 < w0 + win5; q2++) ss += dc[q2] * dc[q2]; en.push(ss); if (ss > mx) mx = ss; }
              var li = 0; while (li < en.length && en[li] < mx * 0.063) li++;
              var nm2 = cue === 'roar' ? 'cheer' : cue;
              (C.cues[nm2] || (C.cues[nm2] = [])).push({ buf: cut, gain: +c.gain || 1, loop: !!c.loop, dur: n2 / b.sampleRate, lead: Math.max(0, li * 0.05 - 0.03) });
              C.bytes += n2 * ch * 4;
            });
          });
        });
        return ($.crowd[key] = chain.then(function () { C.ms = Math.round(now() - t0); return C; }).catch(function (e) { warn('The crowd could not load (' + (e && e.message || e) + '): a synthesised crowd plays.'); return null; }));
      }

      /* ===================================== WORLD (lane D: the buses, the perspectives, the world, the crowd, the beats) == */
      // The world around the engines, the crowd, the race's events and the mix (D-world; D-DESIGN 6 and 7). It meets the
      // engine section at ONE node: the Rig's engine bus is made into W.engIn, which carries it, with the tunnel's dry
      // lift and its sends (the tunnel's reverb, the street's slap-back), into env.out (the sheet's engine slider). The
      // rest goes into env.master: the WORLD bus (tyres, kerbs, wind, the joints, the portals, the gantries, near misses,
      // the sea, the harbour, the rotor), the CROWD bus (the stands' beds and the recorded cues), the EVENTS bus
      // (contactors, the hum, the Flap's clack, impacts, fireworks, the cork, cooling ticks), through one helmet (the owner's
      // A/B only, o.helmet; the Rig's own helmet covers the engines), and the radio click, which skips it. Ducking is scheduled
      // automation, never a compressor. Every synthesised layer reads the shared noise; nothing here is a file but the
      // crowd's recorded cues (the shootout's approved CC0 takes: never 'whistleTaker', never the 'gol' roar).
      //   W = World(ac, { out, master, quality, warn, T, cfg, seed, clock, taps, mute })
      //   W.engIn   W.frame(F)   W.event(name, data, t)   W.pause()   W.resume()   W.stop()   W.state()   W.flush()
      //   F = wFrame(view, listener, dt, tA): the view and the camera, normalised once a frame (both of gp.js's shapes)
      function World(ac, o) {
        o = o || {};
        var clamp = K.clamp, lerp = K.lerp, smooth = K.smooth, rng = K.rng, gauss = K.gauss, TAU = Math.PI * 2, C_AIR = K.C_AIR;
        function fromDb(d) { return Math.pow(10, d / 20); }
        function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
        function nowWall() { return now(); }
        var sr = ac.sampleRate, LOW = o.quality === 'low', T = o.T || null, CFG = o.cfg || {};
        var clock = typeof o.clock === 'function' ? o.clock : function () { return ac.currentTime; };
        var R = rng(((o.seed >>> 0) || 7) * 31 + 5), NB = K.noiseBuf(ac), LEADW = LOW ? 0.05 : 0.03;
        var W = { mode: 'chase', log: [], beats: {} };
        // the levels (measured against the targets of D-DESIGN 6.2 and the beat cards; D-world.md has the renders)
        // (tunLift: the engines' dry lift inside the tunnel, X23's "loudest 6 s of the lap". v4's lap had +22 %, and its 6 s
        // in the tunnel were not its loudest (onboard 2.3 dB, chase 0.3 dB under the loudest, measured on the delivered
        // laps); +65 % (+4.3 dB over the open road, 2.6 dB more than v4's) is meant to make them so from every one of your
        // cameras, the peak limiter holding its peaks)
        var KX = { harbour: 3.0, rotor: 3.0, contactor: 0.85, cheerIgnite: 4.4, swellE: 1.0, crowd: 0.16, crowdIntro: 0.7, boom: 1, hushDb: -9.4, gantry: 0.5, tunLift: 0.65 };
        if (o.kx) for (var kx in o.kx) KX[kx] = o.kx[kx]; // (the tests' calibration only)
        function logE(e, x) { var r = { e: e, t: +clock().toFixed(4) }; if (x) for (var k in x) r[k] = x[k]; W.log.push(r); if (W.log.length > 400) W.log.shift(); return r; }

        /* ---- node helpers */
        // (every filter and panner parameter at k-rate: a ramp is then read once a render quantum, not once a sample, so
        // a filter swept every frame computes its coefficients 375 times a second instead of 48,000; measured below)
        function KR(p) { try { p.automationRate = 'k-rate'; } catch (e) {} return p; }
        function G(v, to) { var g = ac.createGain(); g.gain.value = v == null ? 1 : v; if (to) g.connect(to); return g; }
        function GK(v, to) { var g = G(v, to); KR(g.gain); return g; }
        function BQ(type, f, Q, gain, to) { var b = ac.createBiquadFilter(); b.type = type; KR(b.frequency); KR(b.Q); KR(b.gain); KR(b.detune); b.frequency.value = f; b.Q.value = Q == null ? 0.707 : Q; if (gain != null) b.gain.value = gain; if (to) b.connect(to); return b; }
        function PAN(v, to) { var p = ac.createStereoPanner ? ac.createStereoPanner() : null; if (!p) return G(1, to); KR(p.pan); p.pan.value = v || 0; if (to) p.connect(to); return p; }
        function noiseSrc(offset, to, rate) { var s = ac.createBufferSource(); s.buffer = NB; s.loop = true; if (rate) s.playbackRate.value = rate; if (to) s.connect(to); s.start(0, (offset || 0) % 4); return s; }
        // one-shot nodes end themselves: a source's stop() frees its chain once it has played
        function burst(t, dur, to, rate) { var s = ac.createBufferSource(); s.buffer = NB; if (rate) s.playbackRate.value = rate; s.connect(to); s.start(Math.max(0, t), R() * 3.5); s.stop(Math.max(0, t) + dur + 0.02); return s; }
        function osc(type, f, t, dur, to) { var x = ac.createOscillator(); x.type = type || 'sine'; x.frequency.value = f; x.connect(to); x.start(Math.max(0, t)); x.stop(Math.max(0, t) + dur + 0.02); return x; }
        function env(g, t, a, peak, tau, end) { var p = g.gain; t = Math.max(0, t); p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a); p.setTargetAtTime(0, t + a, tau); if (end) p.setValueAtTime(0, end); }
        function ramp(p, v, t) { try { p.linearRampToValueAtTime(v, t); } catch (e) { p.value = v; } }
        function glide(p, v, t, tau) { try { p.setTargetAtTime(v, Math.max(t, clock()), tau); } catch (e) { p.value = v; } }
        // (the frame's own parameters, each written by these alone: a glide to the same target with the same time constant
        // is left out (memoryless); a ramp to the value it already holds is left out, and the next real ramp is anchored at
        // the last frame left out, so it starts where it would have. Each call costs the main thread, most of these hold
        // still for seconds)
        function glideS(p, v, t, tau) { if (p.__gv === v && p.__gt === tau) return; glide(p, v, t, tau); p.__gv = v; p.__gt = tau; }
        function rampS(p, v, t) {
          var lv = p.__v;
          if (lv !== undefined && Math.abs(v - lv) <= 1e-4 * Math.max(1, Math.abs(lv))) { p.__s = t; return; }
          if (p.__s != null) { try { p.setValueAtTime(lv, p.__s); } catch (e) {} p.__s = null; }
          ramp(p, v, t); p.__v = v;
        }

        /* ---- W1. the buses */
        // the engines' path: the Rig's bus in; the tunnel's dry lift (KX.tunLift inside) and a contact's dip; the peak
        // limiter (ENGINE_CEIL); out to env.out. The tunnel's send and the street's taps are taken from it (the whole bus:
        // the focus voice and every voice near enough to be heard, as v4's laps sent theirs)
        var engLim = K.Limiter(ac, o.ceil != null ? o.ceil : ENGINE_CEIL), HELM = !!o.helmet;
        var engIn = G(1), engDry = GK(1), engDuck = G(1), engOut = G(1);
        engIn.connect(engDry); engDry.connect(engDuck); engDuck.connect(engLim.in); engLim.out.connect(engOut); engOut.connect(o.out);
        W.engIn = engIn; W.lim = engLim;
        var worldIn = G(1), crowdIn = G(1), eventsIn = G(1), clickIn = G(1);
        var worldLvl = G(1, null), bedsIn = G(1), crowdDuck = G(1), crowdLp = BQ('lowpass', 20000, 0.5), crowdLvl = G(1), crowdVol = G(1), worldVol = G(1), clickVol = G(1);
        worldIn.connect(worldLvl); worldLvl.connect(worldVol);
        // (the beds through their own duck: the hush, the launch's dip and each boom's dip; the cues are never ducked)
        bedsIn.connect(crowdDuck); crowdDuck.connect(crowdIn);
        var cuesIn = G(1, crowdIn), humTap = G(1), carTap = G(1);
        crowdIn.connect(crowdLp); crowdLp.connect(crowdLvl); crowdLvl.connect(crowdVol);
        var ambSum = G(1), helmA = BQ('highshelf', 1600, 0.7, 0), helmAl = BQ('lowpass', 20000, 0.5), ambMute = G(1);
        worldVol.connect(ambSum); crowdVol.connect(ambSum); eventsIn.connect(ambSum);
        ambSum.connect(helmA); helmA.connect(helmAl); helmAl.connect(ambMute);
        clickIn.connect(clickVol);
        // where they go: the engines into env.out, the rest into env.master; without env.master (an M1 gp.js), into env.out
        // with the engine slider taken back out of them
        // (the world's own peak limiter, WORLD_CEIL, before env.master: the tunnel's portals of two cars at once, an impact
        // under a cheer, a near shell, each kept from taking the page's output over -1 dBTP with the engines under it)
        var ambOut = G(1), deadA = G(1), wLim = K.Limiter(ac, o.wceil != null ? o.wceil : WORLD_CEIL);
        ambMute.connect(deadA); clickVol.connect(deadA); deadA.connect(wLim.in); wLim.out.connect(ambOut);
        ambOut.connect(o.master || o.out); W.wlim = wLim;
        W.noMaster = !o.master;
        // the tunnel's wet return and the street's taps join the engines' path (one reverb for the voices and the world)
        var wetIn = G(1), wetRet = G(0), streetIn = G(0), engTun = GK(0);
        wetRet.connect(engDuck); engIn.connect(engTun); engTun.connect(wetIn); engIn.connect(streetIn);
        // (tests: each bus also to its own pair of channels)
        if (o.taps) { var tp = o.taps; [[engOut, 2], [deadA, -1], [worldVol, 4], [crowdVol, 6], [eventsIn, 8], [wetRet, 10], [cuesIn, 12], [humTap, 14], [carTap, 16]].forEach(function (x) { if (x[1] < 0) return; var up = ac.createGain(); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers'; var sp = ac.createChannelSplitter(2); x[0].connect(up); up.connect(sp); sp.connect(tp, 0, x[1]); sp.connect(tp, 1, x[1] + 1); }); }

        /* ---- W2. the camera's mode. The cockpit hears the world as the T-cam does (v4's onboard lap, the owner's choice);
           o.helmet (the A/B only): the world's helmet in the cockpit (a -9 dB high shelf at 1.6 kHz and a 7 kHz low-pass on
           the world, the crowd and the events, as the Rig's helmet on the engines; the radio click skips it), the seat's +3 dB
           of road and kerb, the wind and the crowd's -10 dB at 1.2 kHz */
        function setMode(m, t) {
          if (m === W.mode && W.modeSet) return;
          var prev = W.mode; W.mode = m; W.modeSet = true;
          var hc = HELM && m === 'cockpit';
          helmA.gain.setTargetAtTime(hc ? -9 : 0, t, 0.04); helmAl.frequency.setTargetAtTime(hc ? 7000 : 20000, t, 0.04);
          logE('mode', { from: prev, to: m });
        }

        /* ---- W4. the tunnel and the street */
        // desktop: v1's tunnel impulse response, computed here from numbers (seed 5, 2.4 s stereo: RT60 about 2.2 s, 14
        // wall-to-wall reflections every 30.5 ms alternating sides, a roof reflection at 17 ms, a tail darkening from 5.2
        // to 1.4 kHz); made a second after the sound starts, never on the tap. Phones: a feedback delay network of 4 lines
        // (29.7, 37.1, 41.1, 43.7 ms; a Householder mix; a 3.5 kHz low-pass in each loop; each line's gain from RT60 2.2 s),
        // plus the 17 ms roof and a 36 ms wall tap. Neither is a file.
        var REV = { kind: LOW ? 'fdn' : 'ir', made: false, conv: null, fdn: null };
        // (made a quarter second of it a frame, so no frame spends more than about a millisecond on it: IRB.step())
        var IRB = null;
        function irStart(rate, seed, secs) {
          var n = Math.floor(rate * secs);
          IRB = { n: n, i: 0, L: new Float32Array(n), Rr: new Float32Array(n), Rn: rng(seed), decay: Math.log(1000) / 2.2, lpL: 0, lpR: 0, rate: rate };
        }
        function irStep(all) {
          var B = IRB; if (!B || B.done) return !!(B && B.done);
          var end = all ? B.n : Math.min(B.n, B.i + Math.floor(B.rate * 0.25));
          for (var i = B.i; i < end; i++) { var t = i / B.rate, en = Math.exp(-B.decay * t) * smooth(0, 0.012, t), cut = 1 - Math.exp(-TAU * lerp(5200, 1400, clamp(t / 1.8, 0, 1)) / B.rate); B.lpL += cut * (gauss(B.Rn) - B.lpL); B.lpR += cut * (gauss(B.Rn) - B.lpR); B.L[i] = B.lpL * en * 0.6; B.Rr[i] = B.lpR * en * 0.6; }
          B.i = end; if (B.i < B.n) return false;
          var L = B.L, Rr = B.Rr, n = B.n, rate = B.rate;
          for (var k = 1; k <= 14; k++) { var at = Math.floor(rate * (0.006 + k * 0.0305)), g = 0.85 * Math.pow(0.78, k); if (at < n) { (k % 2 ? L : Rr)[at] += g; (k % 2 ? Rr : L)[Math.min(n - 1, at + Math.floor(rate * 0.0012))] += g * 0.5; } }
          var roof = Math.floor(rate * 0.017); L[roof] += 0.5; Rr[roof] += 0.5;
          var e = 0; for (i = 0; i < n; i++) e += L[i] * L[i] + Rr[i] * Rr[i]; var g2 = 1 / Math.sqrt(e / 2); for (i = 0; i < n; i++) { L[i] *= g2; Rr[i] *= g2; }
          B.done = true; return true;
        }
        function makeReverb() {
          if (REV.made) return; REV.made = true;
          if (o.mute && o.mute.reverb) return;
          var t0 = nowWall();
          if (REV.kind === 'ir') {
            if (!IRB) irStart(sr, 5, 2.4);
            irStep(true);
            var b = ac.createBuffer(2, IRB.n, sr), cv = ac.createConvolver();
            b.getChannelData(0).set(IRB.L); b.getChannelData(1).set(IRB.Rr); cv.normalize = false; cv.buffer = b;
            wetIn.connect(cv); REV.out = cv; REV.conv = cv; REV.bytes = IRB.n * 8; IRB = { done: true, n: IRB.n };
          } else {
            var D = [0.0297, 0.0371, 0.0411, 0.0437], mixN = G(-0.5), lines = [], fdnOut = G(1), outL = PAN(-0.6, fdnOut), outR = PAN(0.6, fdnOut), pre = G(0.5);
            wetIn.connect(pre);
            D.forEach(function (d, i) {
              // (Web Audio's low-pass Q is a resonance in dB: -6 dB keeps the loop's filter under 1 at every frequency, so the
              // network can never ring up)
              // (each line's gain from RT60 2.8 s at the bottom; the loop's 6 kHz low-pass takes the 1 kHz decay to about
              // 2.2 s and darkens the tail above, as the impulse response does)
              var dl = ac.createDelay(0.1), lp = BQ('lowpass', 6000, -6), fb = G(Math.pow(10, -3 * d / 2.8));
              dl.delayTime.value = d; pre.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); fb.connect(mixN); mixN.connect(dl); dl.connect(i % 2 ? outR : outL);
              lines.push(dl);
            });
            [[0.017, 0.35, 0], [0.036, 0.25, -0.5]].forEach(function (tp) { var d = ac.createDelay(0.1); d.delayTime.value = tp[0]; var g = G(tp[1]), p = PAN(tp[2], fdnOut); wetIn.connect(d); d.connect(g); g.connect(p); });
            REV.fdn = lines; REV.bytes = 0; REV.out = fdnOut;
          }
          REV.ms = Math.round((nowWall() - t0) * 10) / 10; REV.sw = Sw(REV.out, wetRet, 3.0);
        }
        // the street (v4's): three slap-back taps off the walls (23, 41, 67 ms, low-passed at 2.8 kHz), by how close the
        // walls stand; none in the tunnel and none over the open sea
        var SWstreet = null;
        (function () { var lp = BQ('lowpass', 2800, 0.6); SWstreet = Sw(streetIn, lp, 0.3);
          [[0.023, 0.32, -0.6], [0.041, 0.22, 0.7], [0.067, 0.14, -0.2]].forEach(function (tp) { var d = ac.createDelay(0.2); d.delayTime.value = tp[0]; var g = G(tp[1]), p = PAN(tp[2], engDuck); lp.connect(d); d.connect(g); g.connect(p); }); })();
        worldVol.connect(streetIn);

        /* ---- W5. the lap's places: every trigger is a d range or an anchor of the table (or the world's gp keys), so a
           Mog's circuit gets the same life. Port Artificial's tunnel, sea and gold kerb stand in until the world says them */
        var LAP = { L: T ? T.L : 0, tun: [], bridges: [], sea: [], gold: [], gantries: [], stands: [], towers: [] };
        (function () {
          if (!T) return;
          var L = T.L, PA = Math.abs(L - 5361.9) < 1.5, segs = T.segs || [];
          function wrap(d) { return ((d % L) + L) % L; }
          var tl = Array.isArray(CFG.tunnels) ? CFG.tunnels : null;
          // ([from, to], { d0, d1 }, or GpRace.read's { id, from, to }: gp.js hands the module the race's own cfg)
          if (tl) tl.forEach(function (z) { if (Array.isArray(z) && z.length >= 2) LAP.tun.push([+z[0], +z[1]]); else if (z && z.d0 != null) LAP.tun.push([+z.d0, +z.d1]); else if (z && z.from != null && z.to != null) LAP.tun.push([+z.from, +z.to]); });
          else segs.forEach(function (s) { if (/tunnel/i.test(s.id || '')) LAP.tun.push([s.d0, s.d1]); });
          if (!LAP.tun.length && PA) LAP.tun.push([2380.5, 2755.3]);
          segs.forEach(function (s) { if (/bridge/i.test(s.id || '')) LAP.bridges.push(s.d0, s.d1); });
          if (Array.isArray(CFG.sea)) CFG.sea.forEach(function (z) { if (Array.isArray(z)) LAP.sea.push([+z[0], +z[1], z[2] === 'R' || z[2] > 0 ? 1 : -1]); });
          else if (PA) LAP.sea.push([2843.4, 4102.2, -1]);
          if (Array.isArray(CFG.goldKerbs)) CFG.goldKerbs.forEach(function (z) { LAP.gold.push([+z[0], +z[1]]); }); else if (PA) LAP.gold.push([5058.6, 5111.9]);
          // the gantries: the start's light gantry, the timing lines (the sectors' gantries) and the Flap's detection points
          LAP.gantries.push(0);
          (CFG.sectors || []).forEach(function (d) { if (typeof d === 'number') LAP.gantries.push(d); });
          (CFG.flaps || []).forEach(function (f) { if (f && typeof f.det === 'number' && LAP.gantries.every(function (g) { return Math.abs(g - f.det) > 30; })) LAP.gantries.push(f.det); });
          // the stands: the world's (gp.stands: [id, d, lat, size] or { id, d, lat|x, y, r }), else one at the line and one
          // outside every corner tighter than 30 m
          var P0 = {}, st = Array.isArray(CFG.stands) ? CFG.stands : null;
          function stand(id, d, lat, h, size) { T.posAt(wrap(d), lat, h, P0); LAP.stands.push({ id: id, d: wrap(d), lat: lat, x: P0.x, y: P0.y, z: P0.z, size: size || 1 }); }
          if (st) st.forEach(function (s) { if (Array.isArray(s)) stand(String(s[0]), +s[1], +s[2] || 0, 8, +s[3] || 1); else if (s && s.d != null) stand(String(s.id), +s.d, +(s.lat != null ? s.lat : s.x) || 0, +(s.h != null ? s.h : s.y) || 8, +(s.size || 1)); });
          else {
            stand('line', 15, (T.hwAt ? T.hwAt(15) : 7) + 18, 8, 1.5);
            (T.corners || []).forEach(function (c) { if (c.R < 30) stand(c.id, c.apex, -c.dir * ((T.hwAt ? T.hwAt(c.apex) : 7) + 20), 6, 1); });
          }
          // the floodlight towers (X28): the look kit's when it lists them, else one every 32 m from d 8, none in a tunnel
          var tw = Array.isArray(CFG.towers) ? CFG.towers : null;
          if (tw) tw.forEach(function (x) { if (x && x.d != null) LAP.towers.push({ d: +x.d, x: x.x, y: x.y, z: x.z }); });
          else for (var d = 8, k = 0; d < L; d += 32, k++) { if (LAP.tun.some(function (z) { return d > z[0] - 15 && d < z[1] + 15; })) continue; var side = k % 2 ? 1 : -1, w = T.wallsAt ? T.wallsAt(d, {}) : { left: 9, right: 9 }; T.posAt(d, side * ((side > 0 ? w.right : w.left) + 1.4), 18, P0); LAP.towers.push({ d: d, x: P0.x, y: P0.y, z: P0.z }); }
        })();
        function inZone(Z, d) { for (var i = 0; i < Z.length; i++) if (d >= Z[i][0] && d <= Z[i][1]) return Z[i]; return null; }
        function tunAt(d) { if (d == null) return 0; var v = 0; for (var i = 0; i < LAP.tun.length; i++) { var z = LAP.tun[i]; v = Math.max(v, smooth(z[0] - 7.5, z[0] + 7.5, d) * (1 - smooth(z[1] - 7.5, z[1] + 7.5, d))); } return v; }
        function seaAt(d) { if (d == null) return 0; for (var i = 0; i < LAP.sea.length; i++) { var z = LAP.sea[i]; if (d > z[0] - 60 && d < z[1] + 60) return smooth(z[0] - 60, z[0] + 20, d) * (1 - smooth(z[1] - 20, z[1] + 60, d)) * z[2]; } return 0; }
        // how close the walls stand (1 the city's canyon, 0.15 open ground): from the barrier lines, and the sea
        function wallsAt(d) { if (d == null || !T || !T.wallsAt) return 0.6; var w = T.wallsAt(d, {}), m = Math.min(w.left, w.right); return Math.abs(seaAt(d)) > 0.5 ? 0.15 : clamp(1.35 - m / 22, 0.15, 1); }
        W.lap = LAP;

        /* ---- W6. the car's own layers (the focus car; v4's lap world, driven by the sim) */
        var N1 = noiseSrc(1.9, null), N2 = noiseSrc(0.7, null), N3 = noiseSrc(3.1, null);
        var carBus = G(o.mute && o.mute.car ? 0 : 1, worldIn), carMute = G(1); if (o.taps) carBus.connect(carTap);
        // (a subgraph switched in while it can be heard and out a moment after it falls silent)
        function Sw(from, to, hold) { var S = { on: false, off: 0, from: from, to: to, hold: hold || 0.5 }; S.set = function (want, t) { if (want) { S.off = 0; if (!S.on) { try { S.from.connect(S.to); } catch (e) {} S.on = true; } } else if (S.on) { if (!S.off) S.off = t; else if (t - S.off > S.hold) { try { S.from.disconnect(S.to); } catch (e) {} S.on = false; S.off = 0; } } }; return S; }
        var SWcar = Sw(carMute, carBus, 0.5);
        var road = BQ('lowpass', 220, 0.8), roadG = GK(0, carMute); N1.connect(road); road.connect(roadG);
        var scr = BQ('bandpass', 1100, 1.1), scr2 = BQ('peaking', 2400, 3, 8), scrG = GK(0, carMute); N1.connect(scr); scr.connect(scr2); scr2.connect(scrG);
        var lk1 = BQ('bandpass', 1350, 6), lk2 = BQ('bandpass', 2700, 6), lkG = GK(0, carMute), lk2g = G(0.5, lkG); N1.connect(lk1); lk1.connect(lkG); N1.connect(lk2); lk2.connect(lk2g);
        var kre = new Float32Array(9), kim = new Float32Array(9); for (var hh = 1; hh <= 8; hh++) kim[hh] = 1 / hh * Math.exp(-hh * 0.25);
        var kOsc = ac.createOscillator(); kOsc.setPeriodicWave(ac.createPeriodicWave(kre, kim)); kOsc.frequency.value = 40;
        var kLp = BQ('lowpass', 900, 0.7), kG = GK(0, carMute), kSub = BQ('lowpass', 90, 1.2), kSubG = GK(0, carMute); kOsc.connect(kLp); kLp.connect(kG); N1.connect(kSub); kSub.connect(kSubG); kOsc.start(0);
        var w1 = BQ('bandpass', 380, 0.7), w1l = BQ('lowpass', 900, -3), w1G = GK(0, carMute), w2 = BQ('bandpass', 1500, 0.9), w2G = GK(0, carMute); N2.connect(w1); w1.connect(w1l); w1l.connect(w1G); N2.connect(w2); w2.connect(w2G);
        var windHelm = { lo: w1G, hi: w2G };
        // the sea and the harbour: low-passed noise (v4's sea bed), its own panner (the sea on its side)
        var seaLp = BQ('lowpass', 520, 0.6), seaG = G(0), seaPan = PAN(0); N3.connect(seaLp); seaLp.connect(seaG); seaG.connect(seaPan);
        var SWsea = Sw(seaPan, worldIn, 0.6);
        var harb = G(1, worldIn);
        var CAR = { gust: 0, kerbOn: 0, last: null, tunWas: 0, wetOn: false, flapWas: false, towWas: false };
        // the world's view constants (v4's lap world: chase and onboard values)
        var KV = { chase: { road: 0.07, scrub: 0.5, kerb: 0.14, kerbSub: 0.35, wind: 0.035 }, on: { road: 0.12, scrub: 0.32, kerb: 0.25, kerbSub: 0.9, wind: 0.16 } };
        function carLayers(F, t) {
          var c = F.cars[F.focus], L = W.L, m = W.mode, tv = m === 'tv' || !!F.replay;
          if (!c) return;
          var k = m === 'chase' ? KV.chase : KV.on, v = c.v, d = c.d, cdt = CAR.lt != null && t > CAR.lt ? clamp(t - CAR.lt, 1e-3, 0.25) : F.dt; CAR.lt = t;
          // in TV shots and replays the car's own layers stay off (the camera is trackside; v4's fly-by had none)
          glideS(carMute.gain, tv ? 0 : 1, t, 0.08); SWcar.set(!tv, t);
          if (tv) return;
          var latMax = 22 + 0.0035 * v * v, scrub = Math.max(clamp((Math.abs(c.ay) / latMax - 0.78) / 0.22, 0, 1), clamp((c.slip - 0.15) / 0.6, 0, 1));
          // (the cockpit: the seat carries the road's rumble and the kerbs' thump, +3 dB, as the Rig's body path does the
          // engine's)
          var seat = HELM && m === 'cockpit' ? 1.41 : 1;
          ramp(roadG.gain, k.road * clamp(v / 80, 0, 1.2) * seat, t);
          ramp(scrG.gain, k.scrub * scrub, t); ramp(scr.frequency, 900 + 500 * scrub + 3 * v, t);
          ramp(lkG.gain, 0.06 * clamp(c.lock, 0, 1) * clamp(v / 20, 0, 1), t);
          var kerb = c.surf === 1 && v > 3 ? 1 : 0, gold = kerb && d != null && inZone(LAP.gold, d) ? 1 : 0;
          CAR.kerbOn += (kerb - CAR.kerbOn) * (1 - Math.exp(-cdt / 0.03));
          ramp(kOsc.frequency, Math.max(20, v / 0.42), t);
          ramp(kG.gain, k.kerb * CAR.kerbOn * (gold ? 1.41 : 1), t); ramp(kLp.frequency, gold ? 1600 : 900, t);
          ramp(kSubG.gain, k.kerbSub * CAR.kerbOn * seat, t);
          // wind: two bands, level (v / 85)^2.2; the tow takes the low band 3 dB down and its centre 15 % lower; the Flap
          // open takes the high band 4 dB down (X14: the wind thins)
          CAR.gust += (gauss(R) * 0.15 - CAR.gust) * (1 - Math.exp(-cdt * 4));
          var lvl = k.wind * Math.pow(clamp(v / 85, 0, 1.2), 2.2), tow = c.draft > 0.3, flap = !!c.flap, cock = HELM && m === 'cockpit';
          ramp(w1G.gain, lvl * (1 + CAR.gust) * (tow ? 0.708 : 1) * (cock ? 0.5 : 1), t);
          ramp(w1.frequency, (260 + 320 * clamp(v / 90, 0, 1)) * (tow ? 0.85 : 1), t);
          ramp(w2G.gain, lvl * 0.6 * (flap ? 0.631 : 1) * (cock ? 0.5 : 1), t);
          ramp(w2.frequency, cock ? 1200 : 1500, t);
          if (tow !== CAR.towWas) { logE('tow', { car: c.n, state: tow ? 'in' : 'out' }); CAR.towWas = tow; }
        }

        /* ---- W7. the one-shots, synthesised (the EVENTS and WORLD buses) */
        // heard from a place: the time of flight (the listener's motion predicted from its last two frames), 1/r from
        // ref, the air's low-pass and the pan; { t, g, lp, pan, r }
        function heard(t, x, y, z, ref, rmin, noTv) {
          var L = W.Lh || W.L || { x: 0, y: 0, z: 0, rx: 1, rz: 0 }, vx = W.Lv ? W.Lv.x : 0, vy = W.Lv ? W.Lv.y : 0, vz = W.Lv ? W.Lv.z : 0, ta = t, r = 0, dx = 0, dz = 0;
          // (the arrival solved against the listener's motion: a fixed point that gains a factor v / c each pass)
          for (var it = 0; it < 7; it++) { var dt = ta - W.Lt; dx = x - (L.x + vx * dt); var dy = y - (L.y + vy * dt); dz = z - (L.z + vz * dt); r = Math.hypot(dx, dy, dz); ta = t + r / C_AIR; }
          // (a TV shot hears the big sources the way a broadcast does: the time of flight kept, the distance's fall
          // compressed, (ref / r)^0.6)
          var hz = Math.hypot(dx, dz), g0 = (ref || 10) / Math.max(r, rmin || ref || 10);
          return { t: ta, r: r, g: W.mode === 'tv' && ref >= 50 && !noTv ? Math.pow(g0, 0.6) : g0, lp: clamp(24000 * Math.exp(-r / 115), 1800, 20000), pan: clamp((dx * L.rx + dz * L.rz) / Math.max(1, hz), -1, 1) * 0.9 };
        }
        function place(h, to) { var lp = BQ('lowpass', h.lp, 0.5), p = PAN(h.pan, to); lp.connect(p); return lp; }
        // a far sound (a floodlight bank, a stand, a shell): kept until it is due within 0.3 s, then scheduled from the
        // listener as it is then (a moving or cutting camera is never extrapolated more than 0.3 s)
        var FAR = [];
        function far(at, x, y, z, ref, rmin, fn) { FAR.push({ at: at, x: x, y: y, z: z, ref: ref, rmin: rmin, fn: fn }); farDue(clock() + LEADW); }
        function farDue(now, all) {
          if (!FAR.length || !W.L) return;
          FAR = FAR.filter(function (f) { var h = heard(f.at, f.x, f.y, f.z, f.ref, f.rmin); if (!all && h.t > now + 0.3) return true; if (h.t < clock() + 0.002) h.t = clock() + 0.002; f.fn(h); return false; });
        }
        var ONE = { live: [] };
        function pool(kind, max, end) { var n = 0, now = clock(); ONE.live = ONE.live.filter(function (x) { return x.end > now; }); ONE.live.forEach(function (x) { if (x.k === kind) n++; }); if (n >= max) return false; ONE.live.push({ k: kind, end: end }); return true; }
        // the floodlight contactor: a 70 Hz thump (120 ms, 2 ms attack, tau 35 ms) and an 8 ms click (2-4 kHz)
        function contactor(t, k, to, f0) {
          var g = G(0, to); env(g, t, 0.002, 0.9 * k, 0.035, t + 0.14); osc('sine', f0 || 70, t, 0.14, g);
          var cg = G(0, to), hp = BQ('highpass', 2000, 0.7), bp = BQ('bandpass', 3000, 1.2); hp.connect(bp); bp.connect(cg); env(cg, t, 0.0005, 0.5 * k, 0.0025, t + 0.012); burst(t, 0.012, hp);
        }
        // the hum swell: 100, 200 and 300 Hz partials, 0.3 s up and 0.6 s down (0.9 s in all), 12 dB under its contactor
        function hum(t, k, to) {
          var re = new Float32Array(4), im = new Float32Array([0, 1, 0.5, 0.3]), x = ac.createOscillator(), g = G(0, to);
          if (o.taps) g.connect(humTap);
          x.setPeriodicWave(ac.createPeriodicWave(re, im)); x.frequency.value = 100; x.connect(g);
          var p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(0.25 * k, t + 0.3); p.linearRampToValueAtTime(0, t + 0.9);
          x.start(t); x.stop(t + 0.92);
        }
        // the Flap's clack: two transients 30 ms apart (1.2 kHz, and a 300 Hz body)
        function clack(t, k, to) {
          [0, 0.03].forEach(function (dt, i) {
            var b = BQ('bandpass', 1200, 3), g = G(0, to); b.connect(g); env(g, t + dt, 0.0008, (i ? 0.7 : 1) * 0.9 * k, 0.006, t + dt + 0.05); burst(t + dt, 0.05, b);
            var bg = G(0, to); env(bg, t + dt, 0.001, 0.5 * k, 0.012, t + dt + 0.07); osc('triangle', 300, t + dt, 0.07, bg);
          });
        }
        // a bridge joint, one axle: a 4 ms burst band-passed at 2.2 kHz (Q 4) and a 25 ms 180 Hz thump
        // (the click at 3.5, +4 dB on 2.2: the live chase lap's clacks rose only 2 dB over the engines' 2-8 kHz)
        function joint(t, k, to) {
          var b = BQ('bandpass', 2200, 4), g = G(0, to); b.connect(g); env(g, t, 0.0003, 3.5 * k, 0.0015, t + 0.006); burst(t, 0.006, b);
          var tg = G(0, to); env(tg, t, 0.001, 0.8 * k, 0.008, t + 0.03); osc('sine', 180, t, 0.03, tg);
        }
        // a portal: a 40 Hz pressure pulse (120 ms) and an air sweep
        // (the 40 Hz pulse at 0.6, not 1.0: two cars' portals together took the page's output to -0.9 dBFS on lap 1)
        function portal(t, k, to) {
          var g = G(0, to); env(g, t, 0.006, 0.6 * k, 0.04, t + 0.14); osc('sine', 40, t, 0.14, g);
          var b = BQ('bandpass', 500, 1.2), ag = G(0, to); b.connect(ag); b.frequency.setValueAtTime(500, t); b.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
          var p = ag.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(0.25 * k, t + 0.06); p.linearRampToValueAtTime(0, t + 0.28); burst(t, 0.3, b);
        }
        // a gantry passed overhead: a noise swell (v^2) through the roof's 6 ms comb, peaking as the car is under it
        function gantry(t, k, to) {
          var hp = BQ('highpass', 300, 0.7), g = G(0, to), d = ac.createDelay(0.05); d.delayTime.value = 0.006; hp.connect(g); hp.connect(d); d.connect(g);
          var p = g.gain; p.setValueAtTime(0, t - 0.025); p.linearRampToValueAtTime(0.5 * k, t + 0.01); p.setTargetAtTime(0, t + 0.01, 0.07); p.setValueAtTime(0, t + 0.4);
          burst(t - 0.03, 0.45, hp);
        }
        // a near miss: a noise whoosh, panned by the side the car passes
        function whoosh(t, k, side, to) {
          var b = BQ('bandpass', 700, 0.8), g = G(0), p = PAN(side * 0.7, to); b.connect(g); g.connect(p);
          b.frequency.setValueAtTime(1400, t); b.frequency.exponentialRampToValueAtTime(450, t + 0.35);
          var q = g.gain; q.setValueAtTime(0, t - 0.08); q.linearRampToValueAtTime(0.35 * k, t); q.setTargetAtTime(0, t, 0.09); q.setValueAtTime(0, t + 0.5); burst(t - 0.09, 0.6, b);
        }
        // contact and the wall: a thud (80-150 Hz) and a carbon crack by dv; the scrape while a car rides the wall
        function impact(t, dv, to) {
          var k = clamp(dv / 12, 0.15, 1.2), g = G(0, to); env(g, t, 0.002, 0.9 * k, 0.05, t + 0.25); osc('sine', 80 + 70 * R(), t, 0.25, g);
          var b = BQ('bandpass', 2600, 1.4), cg = G(0, to); b.connect(cg); env(cg, t, 0.0008, 0.8 * k, 0.025, t + 0.15); burst(t, 0.15, b);
        }
        var scrape = (function () { var b = BQ('bandpass', 1800, 0.9), g = G(0, carMute); noiseSrc(2.6, b); b.connect(g); return g; })();
        // the radio click (agent lines only): two 2 ms clicks at 1.6 kHz and a 300 ms hiss at 0.4-3.5 kHz, 24 dB under the
        // engines; it alone skips the helmet
        function radioClick(t) {
          [0, 0.31].forEach(function (dt) { var b = BQ('bandpass', 1600, 2), g = G(0, clickIn); b.connect(g); env(g, t + dt, 0.0003, 0.5, 0.0008, t + dt + 0.004); burst(t + dt, 0.004, b); });
          var hp = BQ('highpass', 400, 0.7), lp = BQ('lowpass', 3500, 0.7), hg = G(0, clickIn); hp.connect(lp); lp.connect(hg);
          var p = hg.gain; p.setValueAtTime(0, t + 0.005); p.linearRampToValueAtTime(0.035, t + 0.02); p.setValueAtTime(0.035, t + 0.29); p.linearRampToValueAtTime(0, t + 0.305); burst(t, 0.31, hp);
        }
        // the start tones (the sheet's option, off by default): 1,880 Hz for 170 ms, between the launch band's comb lines
        function tone(t) { var g = G(0, eventsIn); osc('sine', 1880, t, 0.19, g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.004); g.gain.setValueAtTime(0.12, t + 0.17); g.gain.linearRampToValueAtTime(0, t + 0.185); }

        /* ---- W8. the crowd: the stands as emitters; the recorded cues (the shootout's approved CC0 takes: bedAmbient,
           bedHush, inhale, the roar's 'cheer', gasp, groan; never 'whistleTaker' and never the 'gol' roar), decoded at the
           sheets' own rate, cut to the cues the race uses, the sheets let go (phones: folded to mono) */
        var CR = { state: 'loading', cues: {}, last: {}, bytes: 0, slots: [], active: [], lap: 0, base: KX.crowd, hush: false, ladder: 0, boostT: -1 };
        // (the cues come from the module's loader, which runs before there is an AudioContext; W.load() waits for it)
        W.load = function () { return loadCrowd().then(function (C) { if (C) { CR.cues = C.cues; CR.bytes = C.bytes; CR.peakBytes = C.peak; CR.id = C.id; CR.ms = C.ms; CR.state = 'ready'; restartBeds(); } else { CR.state = C === false ? 'none' : 'failed'; } return !!C; }); };
        function cue(name) { var v = CR.cues[name]; if (!v || !v.length) return null; if (v.length === 1) return v[0]; var i, n = 0; do { i = Math.floor(R() * v.length); n++; } while (v[i] === CR.last[name] && n < 8); CR.last[name] = v[i]; return v[i]; }
        // a bed slot: one stand's ambient and hush loops (the recorded beds, or the synthesised bands until they land)
        function bedSlot() {
          var s = { g: G(0), lp: BQ('lowpass', 9000, 0.5), pan: PAN(0), amb: G(1), hu: G(0), src: [], stand: null, live: false };
          s.amb.connect(s.g); s.hu.connect(s.g); s.g.connect(s.lp); s.lp.connect(s.pan);
          s.fill = function () {
            s.src.forEach(function (x) { try { x.stop(); } catch (e) {} }); s.src = [];
            var A = CR.cues.bedAmbient && CR.cues.bedAmbient[0], H = CR.cues.bedHush && CR.cues.bedHush[0];
            if (A && H) [[A, s.amb], [H, s.hu]].forEach(function (p) { var x = ac.createBufferSource(); x.buffer = p[0].buf; x.loop = true; x.connect(p[1]); x.start(0, R() * p[0].dur * 0.9); s.src.push(x); });
            else { // (no recording: v4's synthesised crowd, three breathing bands)
              var n = noiseSrc(R() * 4, null); s.src.push(n);
              [[420, 1.1, 0.5], [1050, 1.3, 0.35], [2300, 1.6, 0.18]].forEach(function (b) { var f = BQ('bandpass', b[0], b[1]), bg = G(b[2]); n.connect(f); f.connect(bg); bg.connect(s.amb); });
              var hf = BQ('bandpass', 3800, 0.9), hg = G(0.5); n.connect(hf); hf.connect(hg); hg.connect(s.hu);
            }
            s.rec = !!(A && H);
          };
          // (a slot with no stand is stopped and disconnected; given one, it is filled and connected)
          s.up = function () { if (s.live) return; s.fill(); try { s.pan.connect(bedsIn); } catch (e) {} s.live = true; if (CR.hush) { s.amb.gain.value = 0; s.hu.gain.value = 1; } };
          s.down = function () { if (!s.live) return; s.src.forEach(function (x) { try { x.stop(); } catch (e) {} }); s.src = []; try { s.pan.disconnect(bedsIn); } catch (e) {} s.live = false; };
          return s;
        }
        function restartBeds() { CR.slots.forEach(function (s) { if (s.live && !s.rec) s.fill(); }); }
        var NS = LOW ? 1 : 2;
        for (var si = 0; si <= NS; si++) CR.slots.push(bedSlot());
        // the stands heard: the nearest NS to the listener (a challenger takes a slot when it is 20 % nearer), each at
        // 1/r from 60 m, the air's low-pass and the pan; a change crossfades over 1.5 s
        function crowdFrame(F, t) {
          var L = W.L; if (!L) return;
          var S = LAP.stands;
          if (!S.length) { var s0 = CR.slots[0]; if (s0.stand !== 'all') { s0.stand = 'all'; s0.up(); glide(s0.g.gain, 0.5, t, 0.5); } return; }
          // (the stands ranked every 8th frame: their order changes slowly; the slots' levels every frame)
          CR.rk = (CR.rk || 0) + 1;
          var rank = CR.rank && CR.rk % 8 ? CR.rank : (CR.rank = S.map(function (s) { return { s: s, r: Math.hypot(s.x - L.x, s.y - L.y, s.z - L.z) / Math.sqrt(s.size || 1) }; }).sort(function (a, b) { return a.r - b.r; }));
          var want = rank.slice(0, NS).map(function (x) { return x.s; });
          CR.slots.forEach(function (sl) {
            if (sl.stand && sl.stand !== 'all' && want.indexOf(sl.stand) < 0 && !sl.out) {
              var mine = rank.filter(function (x) { return x.s === sl.stand; })[0], worst = rank[NS - 1];
              if (mine && worst && mine.r < worst.r * 1.2) { want[want.indexOf(worst.s)] = sl.stand; return; }
              sl.out = t; glide(sl.g.gain, 0, t, 0.45);
            }
          });
          want.forEach(function (st) {
            if (CR.slots.some(function (sl) { return sl.stand === st && !sl.out; })) return;
            var free = CR.slots.filter(function (sl) { return !sl.stand || (sl.out && t - sl.out > 1.6); })[0];
            if (!free) return;
            free.stand = st; free.out = null; free.up(); free.g.gain.cancelScheduledValues(t); free.g.gain.setValueAtTime(0, t); free.inT = t;
          });
          CR.slots.forEach(function (sl) {
            if (!sl.stand || sl.stand === 'all') return;
            if (sl.out) { if (t - sl.out > 1.6) { sl.stand = null; sl.down(); } return; }
            var st = sl.stand, h = heard(t, st.x, st.y, st.z, 60, 60, true), k = Math.sqrt(st.size || 1);
            var gt = h.g * k, rise = t - sl.inT < 1.5;
            if (rise) glide(sl.g.gain, gt, t, 0.45); else ramp(sl.g.gain, gt, t);
            ramp(sl.lp.frequency, Math.min(9000, h.lp), t); if (sl.pan.pan) ramp(sl.pan.pan, h.pan, t);
            sl.h = h;
          });
          CR.active = CR.slots.filter(function (sl) { return sl.stand && !sl.out; }).map(function (sl) { return sl.stand.id; });
        }
        // the level: the race starts 10 dB under the engines and the crowd rises 1.5 dB a lap; the hush at the lights
        function hush(on, t, tau) { CR.hush = on; CR.slots.forEach(function (sl) { glide(sl.amb.gain, on ? 0 : 1, t, tau); glide(sl.hu.gain, on ? 1 : 0, t, tau); }); }
        // a cue at a stand (or the nearest stand): heard from the listener, a take never the same twice running
        function standNear(x, z, maxR) { var b = null, br = maxR || Infinity; LAP.stands.forEach(function (s) { var r = Math.hypot(s.x - x, s.z - z); if (r < br) { br = r; b = s; } }); return b; }
        function standAtD(d, maxD) { var b = null, br = maxD || Infinity; LAP.stands.forEach(function (s) { var r = Math.abs(T ? T.rel(s.d, d) : s.d - d); if (r < br) { br = r; b = s; } }); return b; }
        function playCue(name, t, st, k, o2) {
          o2 = o2 || {};
          var c = cue(name), L = W.L, h = o2.h || (st && L ? heard(t, st.x, st.y, st.z, 60, 60) : { t: t, g: 1, lp: 9000, pan: 0 });
          if (o2.fixed) h.t = t;
          logE('cue', { name: name, stand: st ? st.id : null, at: +h.t.toFixed(4), g: +((k || 1) * h.g).toFixed(3), r: h.r != null ? Math.round(h.r) : null });
          var g = G(0), out = place({ lp: Math.min(9000, h.lp), pan: h.pan }, cuesIn); g.connect(out);
          var lvl = (k || 1) * h.g * Math.sqrt(st && st.size || 1);
          if (c) {
            var s = ac.createBufferSource(); s.buffer = c.buf; s.playbackRate.value = o2.rate || 1; s.connect(g);
            // (onset: the take starts at its first loud moment, so the cue lands at its time, not its fade-in)
            var off = (o2.off || 0) + (o2.onset ? c.lead || 0 : 0), dur = Math.min(o2.dur || c.dur, c.dur - off);
            g.gain.setValueAtTime(0, h.t); g.gain.linearRampToValueAtTime(lvl * c.gain, h.t + 0.03);
            if (o2.dur) { g.gain.setValueAtTime(lvl * c.gain, h.t + dur - 0.4); g.gain.linearRampToValueAtTime(0, h.t + dur); }
            s.start(h.t, off); s.stop(h.t + dur + 0.05);
            return h;
          }
          // (no recording: a synthesised swell for a cheer, a short band of breath for the rest)
          var b = BQ('bandpass', name === 'cheer' ? 900 : name === 'inhale' ? 2600 : 600, 0.8); b.connect(g);
          var len = name === 'cheer' ? 3.5 : name === 'groan' ? 2.2 : 1.1, p = g.gain;
          p.setValueAtTime(0, h.t); p.linearRampToValueAtTime(lvl * 0.5, h.t + len * 0.3); p.linearRampToValueAtTime(0, h.t + len); burst(h.t, len, b);
          return h;
        }

        /* ---- W9. the beats */
        var X = { intro: null, ignite: null, engines: false, lights: 0, goT: -1, podium: null, replay: false, bursts: 0, final: false, lapSeen: -1 };
        // X18: the harbour at night (water on the quay, halyards ticking) and a helicopter arriving, before any picture;
        // at the tap's own audio time + 5 ms, up to the bed in 40 ms. Every layer reads the shared noise: no file, no wait
        function harbourStart(t0, variant) {
          var H = X.intro = { t0: t0, variant: variant, slap: t0 + 0.05, tick: t0 + 0.12, rotor: null, end: Infinity };
          SWsea.set(true, t0); seaG.gain.cancelScheduledValues(t0); seaG.gain.setValueAtTime(0, t0); seaG.gain.linearRampToValueAtTime(0.03 * KX.harbour, t0 + 0.04);
          harb.gain.cancelScheduledValues(t0); harb.gain.setValueAtTime(KX.harbour, t0);
          if (seaPan.pan) seaPan.pan.setValueAtTime(-0.3, t0);
          // the rotor: low-passed noise thumping at the blade rate (6 Hz), its pitch falling 1.04 -> 1.00 over 3 s (the
          // Doppler of its approach), a faint tail-rotor band swelling under 1 s; under the contactors from 1.5 s, gone by
          // the title (5.0 s)
          var src = noiseSrc(R() * 4, null, 1.04), lp = BQ('lowpass', 420, 0.8), am = G(0.3), g = G(0), pan = PAN(0.25, harb);
          src.connect(lp); lp.connect(am); am.connect(g); g.connect(pan);
          src.playbackRate.setValueAtTime(1.04, t0); src.playbackRate.linearRampToValueAtTime(1.0, t0 + 3);
          var rk = 0.32 * KX.rotor / KX.harbour;
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(rk, t0 + 0.04); g.gain.setValueAtTime(rk, t0 + 1.5); g.gain.linearRampToValueAtTime(rk * 0.375, t0 + 3.0); g.gain.linearRampToValueAtTime(0, t0 + 5.0);
          if (pan.pan) { pan.pan.setValueAtTime(0.35, t0); pan.pan.linearRampToValueAtTime(-0.1, t0 + 5); }
          var ph = 0, tb = t0 + 0.01, a = am.gain;
          while (tb < t0 + 5.0) { a.setValueAtTime(0.3, tb); a.linearRampToValueAtTime(1, tb + 0.006); a.setTargetAtTime(0.3, tb + 0.006, 0.035); var rate = 6 * (1.04 - 0.04 * clamp((tb - t0) / 3, 0, 1)); tb += 1 / rate; ph++; }
          src.stop(t0 + 5.2);
          var tl = BQ('bandpass', 1150, 3), tg = G(0, harb); var ts = noiseSrc(R() * 4, tl); tl.connect(tg);
          tg.gain.setValueAtTime(0, t0 + 0.1); tg.gain.linearRampToValueAtTime(0.05, t0 + 0.5); tg.gain.linearRampToValueAtTime(0, t0 + 1.0); ts.stop(t0 + 1.1);
          H.rotor = { src: src, g: g, thumps: ph };
          harbourAhead(t0 + 1.0);
          logE('x18', { t0: +t0.toFixed(4), variant: variant, thumps: ph });
        }
        // the water slaps (band-passed noise bursts every 0.4-1.6 s) and the halyards (2-4 kHz ticks every 0.5-2 s),
        // scheduled a little ahead each frame while the harbour is heard
        function harbourAhead(until) {
          var H = X.intro; if (!H) return; until = Math.min(until, H.end);
          while (H.slap < until) { var b = BQ('bandpass', 300 + 600 * R(), 1.5), g = G(0, harb); b.connect(g); var len = 0.06 + 0.1 * R(); env(g, H.slap, 0.008, 0.05 + 0.07 * R(), len * 0.5, H.slap + len + 0.1); burst(H.slap, len + 0.1, b); H.slap += 0.4 + 1.2 * R(); }
          // (a halyard's shackle on a mast: a short broadband clack, never a ringing ping)
          while (H.tick < until) { var n = R() < 0.3 ? 2 : 1; for (var i = 0; i < n; i++) { var tt = H.tick + i * (0.05 + 0.06 * R()), bt = BQ('bandpass', 2400 + 1200 * R(), 2.5), gt = G(0, harb); bt.connect(gt); env(gt, tt, 0.0004, 0.16, 0.004, tt + 0.03); burst(tt, 0.03, bt); } H.tick += 0.5 + 1.5 * R(); }
        }
        function introEnd(t, tau) {
          if (!X.intro) return;
          X.intro.end = t; glide(seaG.gain, 0, t, tau || 0.1); glide(harb.gain, 0, t, tau || 0.1);
          if (X.intro.rotor) { try { X.intro.rotor.g.gain.cancelScheduledValues(t); X.intro.rotor.g.gain.setTargetAtTime(0, t, tau || 0.1); } catch (e) {} }
          X.intro = null;
        }
        // X28: the 155 towers in banks of five, lit in two fronts from the start gantry round the lap each way, meeting at
        // meet - ignite (3.0 s); each bank's contactor heard from the camera with its own time of flight, 1/r from 50 m and
        // the air; the hum swell on the 8 nearest; each stand's cheer as the light reaches it (the 8 nearest heard)
        function ignite(t0, span) {
          var L = LAP.L || 1, banks = [], tw = LAP.towers;
          for (var i = 0; i < tw.length; i += 5) { var g = tw.slice(i, i + 5), b = { d: 0, x: 0, y: 0, z: 0 }; g.forEach(function (q) { b.d += q.d / g.length; b.x += q.x / g.length; b.y += q.y / g.length; b.z += q.z / g.length; }); banks.push(b); }
          banks.forEach(function (b) { b.fire = t0 + span * Math.min(b.d, L - b.d) / (L / 2); b.h = heard(b.fire, b.x, b.y, b.z, 50, 50); });
          // (the hum on up to 8 of the nearest banks, never two within 1.4 s: each 0.9 s swell is over before the next,
          // so no tone is ever held)
          var near = [], busy = X.humBusy = [];
          banks.slice().sort(function (a, b) { return a.h.r - b.h.r; }).forEach(function (b) { if (near.length >= 8) return; var t1 = b.h.t; if (busy.some(function (u) { return Math.abs(t1 - u) < 1.4; })) return; busy.push(t1); near.push(b); b.hum = true; });
          var rec = [];
          banks.forEach(function (b, i) {
            rec[i] = { d: Math.round(b.d), fire: +b.fire.toFixed(5), at: null, r: null, bx: +b.x.toFixed(2), by: +b.y.toFixed(2), bz: +b.z.toFixed(2), hum: !!b.hum };
            far(b.fire, b.x, b.y, b.z, 50, 50, function (h) { var to = place(h, eventsIn); contactor(h.t, h.g * KX.contactor, to, 66 + 8 * R()); if (b.hum) hum(h.t + 0.01, h.g * KX.contactor, to); rec[i].at = +h.t.toFixed(5); rec[i].r = Math.round(h.r); });
          });
          var st = LAP.stands.map(function (s) { var tf = t0 + span * Math.min(s.d, L - s.d) / (L / 2); return { s: s, tf: tf, h: heard(tf, s.x, s.y, s.z, 60, 60) }; }).sort(function (a, b) { return a.h.r - b.h.r; }).slice(0, 8);
          // (the stands' swell held to one budget: each cheer's power (its gain from the camera, squared, times the stand's
          // size) joins those still sounding, and a cheer that would take the sum over KX.swellE is turned down to fit. The
          // helicopter's real path flies low past the stands, where eight cheers from 60 m stacked to -13.4 LUFS against
          // the card's -16 +- 2; the budget is the reference path's, which measured -16.7)
          var SWL = [];
          st.forEach(function (x) { far(x.tf, x.s.x, x.s.y, x.s.z, 60, 60, function (h) {
            SWL = SWL.filter(function (q) { return q.end > h.t; });
            var p = h.g * h.g * (x.s.size || 1), sum = SWL.reduce(function (a, q) { return a + q.p; }, 0), kk = Math.sqrt(KX.swellE / Math.max(KX.swellE, sum + p));
            SWL.push({ end: h.t + 2.5, p: p * kk * kk });
            playCue('cheer', h.t, x.s, KX.cheerIgnite * kk, { rate: 0.97 + 0.06 * R(), off: 0.3 * R(), h: h });
          }); });
          X.ignite = { t0: t0, span: span, banks: rec, hum: near.length, stands: st.length };
          logE('x28', { banks: banks.length, span: span });
        }
        // X33: the podium. Shells over the harbour, each heard at its flash + distance / 343 (C2's bursts; else a show of 8
        // shells from authored places over the water); the mortar at launch + its own distance; crackle on the big ones;
        // a 3 dB dip of the crowd at each boom; no anthem, no music, no horns
        function shell(b) {
          var k = clamp(num(b.size, 1), 0.5, 1.6);
          var lx = num(b.lx, b.x), lz = num(b.lz, b.z), ly = num(b.ly, 0), tl = num(b.tl, b.t - 2.6), rec = { flash: +b.t.toFixed(4), at: null, r: null, size: k };
          (X.burstLog || (X.burstLog = [])).push(rec);
          var solo = !!(o.mute && o.mute.showExtras);
          if (tl > clock() + 0.005 && !solo) far(tl, lx, ly, lz, 60, 60, function (hm) { var mo = place(hm, eventsIn), mg = G(0, mo); env(mg, hm.t, 0.004, 0.9 * hm.g * k, 0.05, hm.t + 0.25); osc('sine', 60 + 20 * R(), hm.t, 0.25, mg); var mn = BQ('lowpass', 900, 0.7), mng = G(0, mo); mn.connect(mng); env(mng, hm.t, 0.002, 0.5 * hm.g * k, 0.03, hm.t + 0.15); burst(hm.t, 0.15, mn); });
          // (the whistle: a glide under 1.1 s as the shell climbs)
          if (b.whistle && tl > clock() + 0.005 && !solo) far(tl + 0.3, lx, ly + 30, lz, 60, 60, function (hw) { var wo = place(hw, eventsIn), wg = G(0, wo), x = osc('sine', 900, hw.t, 1.1, wg); x.frequency.setValueAtTime(900, hw.t); x.frequency.exponentialRampToValueAtTime(2300, hw.t + 1.05); wg.gain.setValueAtTime(0, hw.t); wg.gain.linearRampToValueAtTime(0.05 * hw.g, hw.t + 0.1); wg.gain.linearRampToValueAtTime(0, hw.t + 1.1); });
          far(b.t, b.x, b.y, b.z, 60, 60, function (h) {
            var to = place(h, eventsIn), sub = G(0, to);
            env(sub, h.t, 0.003, 1.6 * h.g * k * KX.boom, 0.12, h.t + 0.6); osc('sine', 45 + 10 * R(), h.t, 0.6, sub);
            var nl = BQ('lowpass', 1500, 0.7), ng = G(0, to); nl.connect(ng); env(ng, h.t, 0.002, 1.2 * h.g * k * KX.boom, 0.18, h.t + 0.9); burst(h.t, 0.9, nl);
            // the harbour's echo off the city: three later, darker copies
            if (!solo) [[0.42, 0.22], [0.71, 0.14], [1.05, 0.08]].forEach(function (e) { var el = BQ('lowpass', 700, 0.7), eg = G(0, to); el.connect(eg); env(eg, h.t + e[0], 0.01, e[1] * h.g * k * KX.boom, 0.15, h.t + e[0] + 0.6); burst(h.t + e[0], 0.6, el); });
            if (k > 1.1 && !solo) for (var i = 0; i < 26; i++) { var tc = h.t + 0.5 + 1.2 * R(), cb = BQ('highpass', 2000 + 3000 * R(), 0.7), cg = G(0, to); cb.connect(cg); env(cg, tc, 0.0004, 0.25 * h.g * R() * KX.boom, 0.004, tc + 0.02); burst(tc, 0.02, cb); }
            crowdDuck.gain.setTargetAtTime(fromDb(-3), Math.max(clock(), h.t), 0.02); crowdDuck.gain.setTargetAtTime(1, h.t + 0.2, 0.08);
            X.bursts++; rec.at = +h.t.toFixed(5); rec.r = +h.r.toFixed(2);
          });
        }
        function podium(t0) {
          X.podium = { t0: t0, fromC2: false };
          hush(false, t0, 0.3); CR.boostT = t0 + 12;
          playCue('cheer', t0 + 0.2, standAtD(0, 400), 1.2);
          // the show (8 shells, 0.9 s apart, 150-250 m over the water on the line's harbour side) unless C2's bursts arrive
          var P0 = { x: 0, z: 0 };
          var hx = 1, hz = 0;
          if (T) { T.posAt(15, 1, 0, P0); var P1 = {}; T.posAt(15, 0, 0, P1); hx = P0.x - P1.x; hz = P0.z - P1.z; var hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl; P0 = P1; }
          X.show = [];
          for (var i = 0; i < 8; i++) { var dist = 150 + 100 * R(), along = (R() - 0.5) * 160, tb = t0 + 3.2 + i * 0.9 + 0.25 * R(); X.show.push({ t: tb, tl: tb - 2.4, x: P0.x + hx * dist - hz * along, z: P0.z + hz * dist + hx * along, y: 120 + 80 * R(), lx: P0.x + hx * (dist - 20), lz: P0.z + hz * (dist - 20), size: i % 3 === 2 ? 1.4 : 1, whistle: i % 4 === 1 }); }
          X.showAt = t0 + 1.5;
          logE('x33', { t0: +t0.toFixed(4) });
        }
        function cork(t) { var b = BQ('bandpass', 600, 8), g = G(0, eventsIn); b.connect(g); env(g, t, 0.0008, 1.2, 0.012, t + 0.06); burst(t, 0.03, b); var f = BQ('highpass', 3000, 0.7), fg = G(0, eventsIn); f.connect(fg); var p = fg.gain; p.setValueAtTime(0, t + 0.05); p.linearRampToValueAtTime(0.06, t + 0.2); p.linearRampToValueAtTime(0, t + 1.55); burst(t + 0.05, 1.5, f); logE('cork', {}); }
        function cooling(t, dur) { var tt = t; while (tt < t + dur) { var b = BQ('bandpass', 2000 + 4000 * R(), 20), g = G(0, eventsIn); b.connect(g); env(g, tt, 0.0004, 0.35 * (0.4 + 0.6 * R()), 0.012, tt + 0.08); burst(tt, 0.004, b); tt += 0.15 + 0.65 * R(); } logE('ticks', {}); }

        /* ---- per-car crossings (joints, portals, gantries, near misses): found between two frames, scheduled at the
           crossing's own time (the frame is LEAD ahead of the clock, so the crossing is still to come) */
        var PREV = { t: null, d: [], s: [], gant: {} };
        // where a car's one-shot is heard: straight into the world bus for the focus car (onboard 1, chase 0.5), else from
        // the car's place
        function destOf(c, dir) { return function (tc) { if (dir) return { t: tc, to: worldIn, k: W.mode === 'chase' ? 0.5 : 1 }; var h = heard(tc, c.x, c.y, c.z, 10, 2.5); return { t: h.t, to: place(h, worldIn), k: Math.min(1, h.g) }; }; }
        function crossings(F, t) {
          var L = W.L, cars = F.cars, fc = cars[F.focus], LL = LAP.L, tPrev = PREV.t;
          if (tPrev == null || !(t > tPrev) || !LL) { PREV.t = t; for (var i0 = 0; i0 < cars.length; i0++) PREV.d[i0] = cars[i0].d; return; }
          function cross(i, dP) { var a = PREV.d[i], b = cars[i].d; if (a == null || b == null) return -1; var db = b - a; if (db < -LL / 2) db += LL; if (db <= 0 || db > 200) return -1; var x = dP - a; while (x < 0) x += LL; while (x >= LL) x -= LL; if (x > db) return -1; return tPrev + (t - tPrev) * x / db; }
          var tv = W.mode === 'tv' || !!F.replay;
          for (var i = 0; i < cars.length; i++) {
            var c = cars[i], isF = i === F.focus, r = Math.hypot(c.x - L.x, c.z - L.z);
            if (!isF && r > 160) continue;
            var dir = isF && !tv, dest = destOf(c, dir);
            // the bridge joints: each axle at its own crossing (the front axle 1.8 m ahead of the car's centre, the rear 1.8 m
            // behind: the rear 3.6 / v s later); at most 4 at once
            for (var j = 0; j < LAP.bridges.length; j++) [1.8, -1.8].forEach(function (ax) {
              var tc = cross(i, LAP.bridges[j] - ax); if (tc < 0) return;
              if (!pool('joint', 4, tc + 0.05)) return; var D = dest(tc); joint(D.t, D.k, D.to); logE('joint', { car: c.n, d: LAP.bridges[j], axle: ax > 0 ? 'front' : 'rear', at: +D.t.toFixed(4), v: +c.v.toFixed(2) });
            });
            for (var k = 0; k < LAP.tun.length; k++) [0, 1].forEach(function (e) {
              var tc = cross(i, LAP.tun[k][e]); if (tc < 0) return;
              if (!pool('portal', 4, tc + 0.3)) return; var D = dest(tc); portal(D.t, D.k * (isF ? 1 : 0.7), D.to); logE('portal', { car: c.n, d: LAP.tun[k][e], edge: e ? 'out' : 'in', at: +D.t.toFixed(4) });
              if (isF && e === 1) { wetRet.gain.cancelScheduledValues(tc); wetRet.gain.setTargetAtTime(0, Math.max(clock(), tc), 0.12); CAR.wetOn = false; logE('tunnel', { car: c.n, state: 'out', at: +tc.toFixed(4) }); }
              if (isF && e === 0) { if (!REV.made) makeReverb(); wetRet.gain.cancelScheduledValues(tc); wetRet.gain.setTargetAtTime(1, Math.max(clock(), tc - 0.05), 0.05); CAR.wetOn = true; logE('tunnel', { car: c.n, state: 'in', at: +tc.toFixed(4) }); }
            });
          }
          // the gantries, the focus car only: predicted 0.35 s ahead so the swell peaks under the gantry
          if (fc && fc.d != null && fc.v > 8 && !tv) LAP.gantries.forEach(function (gd) {
            var ahead = gd - fc.d; if (ahead < -LL / 2) ahead += LL; if (ahead > LL / 2) ahead -= LL;
            var key = gd + ':' + fc.lap;
            if (ahead > 0 && ahead < fc.v * 0.35 && !PREV.gant[key]) { PREV.gant[key] = 1; var tc = t + ahead / fc.v; gantry(tc, KX.gantry * (W.mode === 'chase' ? 0.6 : 1) * Math.pow(clamp(fc.v / 80, 0, 1.2), 2), worldIn); logE('gantry', { d: gd, at: +tc.toFixed(4), v: +fc.v.toFixed(2) }); }
          });
          // near misses: a car passing within 3 m sideways at 15 km/h or more of closing speed
          if (fc && !tv) for (var n = 0; n < cars.length; n++) {
            if (n === F.focus) continue; var c2 = cars[n], ex = c2.x - fc.x, ez = c2.z - fc.z;
            if (Math.abs(ex) > 15 || Math.abs(ez) > 15) { PREV.s[n] = null; continue; }
            var fx = Math.sin(fc.h), fz = -Math.cos(fc.h), s = ex * fx + ez * fz, lat = ex * Math.cos(fc.h) + ez * Math.sin(fc.h), sp = PREV.s[n];
            if (sp != null && (sp > 0) !== (s > 0) && Math.abs(lat) < 3 && Math.abs(c2.v - fc.v) > 4.17 && pool('miss', 2, t + 0.4)) { var tm = tPrev + (t - tPrev) * Math.abs(sp) / Math.max(1e-3, Math.abs(sp - s)); whoosh(Math.max(clock() + 0.09, tm), clamp(Math.abs(c2.v - fc.v) / 15, 0.4, 1.2) * (W.mode === 'chase' ? 0.6 : 1), lat > 0 ? 1 : -1, worldIn); logE('miss', { car: c2.n, at: +tm.toFixed(4) }); }
            PREV.s[n] = s;
          }
          PREV.t = t; for (var i1 = 0; i1 < cars.length; i1++) PREV.d[i1] = cars[i1].d;
        }

        /* ---- W10. the frame */
        W.L = null; W.Lt = 0; W.Lv = null;
        W.frame = function (F) {
          var t = F.tA, L = F.L;
          // the listener's velocity (for the one-shots' time of flight)
          if (W.L && t > W.Lt) { var dt = t - W.Lt; W.Lv = { x: (L.x - W.L.x) / dt, y: (L.y - W.L.y) / dt, z: (L.z - W.L.z) / dt }; var sp = Math.hypot(W.Lv.x, W.Lv.z); if (sp > 150) W.Lv = null; }
          // (the TV chain hears the focus car from the camera itself)
          W.L = L; W.Lt = t; W.F = F; W.lastTA = t;
          // (where the rivals and their one-shots are heard from: your car in the chase view, panned from the camera; the
          // camera itself in every other view. The chase camera 7.5 m behind would take 7 dB off X14's close, measured)
          var fc0 = F.cars[F.focus];
          W.Lh = L.mode === 'chase' && fc0 && !F.replay ? { x: fc0.x, y: fc0.y + 1.0, z: fc0.z, rx: L.rx, rz: L.rz } : L;
          farDue(t);
          // the dead man's switch: silence 0.25 s after the last frame (the demo, the title, a pause gp.js never told)
          // (the engines' own watchdog is the Rig's)
          // (phones: the switch pushed on every other frame, the car's layers likewise, the stands every 4th: their ramps span
          // two or four frames)
          W.fn = (W.fn || 0) + 1; var odd = LOW && (W.fn & 1);
          if (!odd) { deadA.gain.cancelScheduledValues(t); deadA.gain.setTargetAtTime(1, t, 0.02); deadA.gain.setTargetAtTime(0, t + 0.25, 0.1); }
          var m = F.replay ? 'tv' : L.mode;
          setMode(m, t);
          var fc = F.cars[F.focus];
          // the tunnel's send on the focus voice (0.32 onboard, 0.55 chase) and its dry lift (KX.tunLift), the street
          var tun = fc ? tunAt(fc.d) : 0, onb = m === 'tcam' || m === 'cockpit';
          rampS(engTun.gain, tun * (onb ? 0.32 : 0.55), t); rampS(engDry.gain, 1 + KX.tunLift * tun, t);
          var stl = (1 - tun) * wallsAt(fc ? fc.d : null) * (onb ? 0.35 : 0.6) * (m === 'tv' ? 0.4 : 1);
          rampS(streetIn.gain, stl, t); SWstreet.set(stl > 0.02, t);
          // (the impulse response computed a quarter second a frame from a second after the sound starts; the reverb made
          // once it is whole, or at once if a car reaches a tunnel first)
          if (!REV.made) { if (tun > 0) makeReverb(); else if (REV.kind === 'ir' && W.t0 != null && t - W.t0 > 1.0) { if (!IRB) irStart(sr, 5, 2.4); if (irStep(false)) makeReverb(); } else if (REV.kind !== 'ir' && W.t0 != null && t - W.t0 > 1.0) makeReverb(); }
          // (the reverb switched in from 150 m before a portal, while anyone heard is inside, and 3 s past the last)
          var near = fc && fc.d != null ? LAP.tun.some(function (z) { return fc.d > z[0] - 150 && fc.d < z[1] + 20; }) : false;
          if (REV.sw) REV.sw.set(near || tun > 0, t);
          // (the crossings switch the return; a frame only recovers a missed one: deep inside, or well out)
          if (tun > 0.99 && !CAR.wetOn) { if (!REV.made) makeReverb(); wetRet.gain.cancelScheduledValues(t); wetRet.gain.setTargetAtTime(1, t, 0.05); CAR.wetOn = true; }
          else if (tun < 0.001 && CAR.wetOn && m !== 'tv') { wetRet.gain.cancelScheduledValues(t); wetRet.gain.setTargetAtTime(0, t, 0.12); CAR.wetOn = false; }
          // the crowd behind the tunnel's walls: 12 dB down and low-passed at 1 kHz; in a replay 8 dB down at 2.5 kHz; in the
          // cockpit 10 dB down at 1.2 kHz
          var hm = HELM && m === 'cockpit', cl = Math.min(tun > 0.3 ? 1000 : 20000, F.replay ? 2500 : 20000, hm ? 1200 : 20000), cg = (tun > 0.3 ? fromDb(-12) : 1) * (F.replay ? fromDb(-8) : 1) * (hm ? fromDb(-10) : 1);
          // (the intro has no engines under it: its crowd sits at the intro's own level)
          glideS(crowdLp.frequency, cl, t, 0.12); glideS(crowdLvl.gain, (X.intro ? KX.crowdIntro : CR.base * fromDb(CR.ladder * 1.5 + (CR.boostT > t ? 6 : 0))) * cg, t, CR.hush ? 0.5 : 0.15);
          // the sea, on its side (the Breakwater), and the harbour in the intro
          var sea = fc ? seaAt(fc.d) : 0;
          if (!X.intro) { ramp(seaG.gain, Math.abs(sea) * (m === 'chase' ? 0.012 : 0.008), t); if (seaPan.pan && sea) ramp(seaPan.pan, sea < 0 ? -0.7 : 0.7, t); }
          else harbourAhead(t + 0.25);
          SWsea.set(!!X.intro || Math.abs(sea) > 0.001, t);
          if (fc) { if (!odd) carLayers(F, t); } else SWcar.set(false, t);
          rampS(scrape.gain, fc && fc.wall > 0 && !F.replay && m !== 'tv' ? 0.12 * fc.wall * clamp(fc.v / 30, 0, 1) : 0, t);
          crossings(F, t);
          if (!LOW || !(W.fn & 3)) crowdFrame(F, t);
          // the crowd's ladder: 1.5 dB a lap (the focus car's lap); the final lap when A's event has not come
          // (a new race: the focus car's lap counted back down, or an intro or RACE AGAIN said so)
          // (never in a replay: the director's tape shows earlier laps)
          if (fc && !F.replay && fc.lap < X.lapSeen) newRace(t);
          if (fc && !F.replay && fc.lap !== X.lapSeen) { X.lapSeen = fc.lap; CR.ladder = clamp(fc.lap, 0, 6); var laps = num(CFG.laps, 0); if (laps && fc.lap === laps - 1 && !X.final) finalLap(t, 'laps'); }
          // the podium's show, unless C2's bursts came
          if (X.show && t >= X.showAt) { if (!X.podium.fromC2) X.show.forEach(function (b) { if (b.t > clock() + 0.01) shell(b); }); X.show = null; }
        };
        // (each race's own: the beats that happen once a race, the gantries passed, the lap seen; the beds keep running and
        // nothing is decoded or rebuilt: RACE AGAIN costs nothing here)
        function newRace(t) { X.ignite = null; X.podium = null; X.show = null; X.final = false; X.lapSeen = -1; X.lights = 0; X.goT = -1; X.passEv = false; X.passSeen = {}; X.swellAt = {}; PREV.gant = {}; PREV.t = null; CR.boostT = -1; if (CR.hush) hush(false, t, 0.3); crowdDuck.gain.cancelScheduledValues(t); crowdDuck.gain.setTargetAtTime(1, t, 0.1); logE('newRace', {}); }
        function finalLap(t, why) { X.final = true; CR.boostT = t + 3; logE('finalLap', { why: why }); var st = standAtD(0, 300); if (st) playCue('cheer', t + 0.1, st, 0.8); }

        /* ---- W11. events */
        W.event = function (name, e, t) {
          e = e || {};
          var fc = W.F && W.F.cars[W.F.focus], you = W.F ? W.F.human : -1;
          switch (name) {
            case 'again': newRace(t); break;
            case 'intro':
              newRace(t); X.introT = t;
              if (e.variant === 'long' || e.variant === 'returning' || e.variant === 'dare') harbourStart(t, e.variant);
              break;
            case 'ignite': if (!X.ignite) ignite(t, clamp(num(e.meet, t + 3) - t, 1, 6)); break;
            case 'crown': contactor(t, 1.1 * KX.contactor, eventsIn, 58); if (!(X.humBusy || []).some(function (u) { return Math.abs(u - t) < 1.4; })) hum(t + 0.02, 0.9 * KX.contactor, eventsIn); logE('crown', {}); break;
            case 'title': if (X.intro && X.intro.rotor) { X.intro.rotor.g.gain.cancelScheduledValues(t); X.intro.rotor.g.gain.setTargetAtTime(0, t, 0.25); } break;
            case 'skip': case 'handoff': introEnd(t, name === 'skip' ? 0.1 : 0.4); break;
            case 'light':
              // (light 1: the beds cross into the hush and the crowd falls 10 dB, both over 1.5 s)
              if (e.n === 1) { hush(true, t, 0.35); crowdDuck.gain.cancelScheduledValues(t); crowdDuck.gain.setValueAtTime(1, t); crowdDuck.gain.exponentialRampToValueAtTime(fromDb(KX.hushDb), t + 1.5); logE('hush', {}); }
              if (e.n === 5) playCue('inhale', t, standAtD(0, 400), 1.2, { fixed: true, onset: true });
              if (W.tones) tone(t);
              X.lights = e.n;
              break;
            case 'go':
              X.goT = t; hush(false, t + 0.6, 0.8);
              crowdDuck.gain.cancelScheduledValues(t); crowdDuck.gain.setValueAtTime(fromDb(-16), t); crowdDuck.gain.setTargetAtTime(1, t + 0.6, 0.25);
              playCue('cheer', t + 0.3, standAtD(0, 400), 1.3, { fixed: true, onset: true });
              break;
            case 'flap':
              if (e.state === 'open') { var c = W.F && W.F.cars[e.car]; if (!c) break; var isF = e.car === (W.F && W.F.focus);
                if (isF && W.mode !== 'tv') { clack(t, W.mode === 'chase' ? 0.6 : 1, eventsIn); logE('clack', { car: e.car, at: +t.toFixed(4) }); }
                else { var h = heard(t, c.x, c.y, c.z, 10, 2.5); if (h.r < 40) { clack(h.t, Math.min(1, h.g) * 0.6, place(h, eventsIn)); logE('clack', { car: e.car, at: +h.t.toFixed(4) }); } } }
              break;
            case 'contact': case 'wall': {
              var car = name === 'wall' ? e.car : e.a, c2 = W.F && W.F.cars[car], dv = num(e.dv, 3), mine = car === (W.F && W.F.focus) || e.b === (W.F && W.F.focus);
              if (!c2) break;
              if (mine && W.mode !== 'tv') impact(t, dv, eventsIn); else { var h2 = heard(t, c2.x, c2.y, c2.z, 10, 2.5); if (h2.r < 120) impact(h2.t, dv * Math.min(1, h2.g), place(h2, eventsIn)); }
              if (mine && dv >= 5) { [engDuck, ambMute].forEach(function (g) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(fromDb(-4), t + 0.004); g.gain.setTargetAtTime(1, t + 0.12, 0.04); }); }
              if (dv >= 8) { var sw = standNear(c2.x, c2.z, 150); if (sw) playCue('gasp', t + 0.15, sw, 0.8); }
              break; }
            case 'mistake': { var c3 = W.F && W.F.cars[e.car]; if (!c3) break; var s3 = standNear(c3.x, c3.z, 150); if (s3 && (e.car === you || e.car === (W.F && W.F.focus) || Math.hypot(c3.x - W.L.x, c3.z - W.L.z) < 150)) playCue(e.tier === 'big' || e.tier === 3 ? 'groan' : 'gasp', t + 0.2, s3, 0.9); break; }
            case 'pass': case 'overtake': {
              // (one swell a pass: the race tells a pass twice, raw as 'overtake' and about 1 s later confirmed as 'pass';
              // the second telling of the same pair within 3 s is the same pass. And one cheer at a stand at a time: a pass
              // within 1.5 s of that stand's last swell lifts the crowd's 3 s, it does not stack another take)
              if (name === 'overtake' && X.passEv) break; if (name === 'pass') X.passEv = true;
              if (e.earned === false) break;
              var c4 = W.F && W.F.cars[e.car]; if (!c4 || (e.car !== you && e.car !== (W.F && W.F.focus))) break;
              var pk = e.car + ':' + e.passed, PS = X.passSeen || (X.passSeen = {});
              if (PS[pk] != null && t - PS[pk] < 3) break; PS[pk] = t;
              var s4 = standNear(c4.x, c4.z, 120);
              if (s4) { var SL = X.swellAt || (X.swellAt = {}); CR.boostT = t + 3; if (SL[s4.id] != null && t - SL[s4.id] < 1.5) { logE('passLift', { car: e.car, stand: s4.id }); break; } SL[s4.id] = t; playCue('cheer', t + 0.15, s4, 1.1); logE('passSwell', { car: e.car, stand: s4.id }); }
              break; }
            case 'finalLap': if (!X.final) finalLap(t, 'event'); break;
            case 'finish': if (e.place === 1 || e.car === you) { var s5 = standAtD(0, 300); if (s5) playCue('cheer', t + 0.2, s5, 1.2); } break;
            case 'replay': logE('replay', { kind: e.kind }); break;
            case 'podium': if (!X.podium) podium(t); break;
            // (C2's shells: { x, y, z, size, delay } at the launch, delay the seconds to the burst; gpPage keeps its own t)
            case 'burst': if (X.podium) X.podium.fromC2 = true; shell({ t: t + Math.max(0, num(e.delay, 2.4)), tl: t, x: num(e.x, 0), y: num(e.y, 150), z: num(e.z, 0), size: e.size, lx: e.lx, ly: e.ly, lz: e.lz, whistle: !!e.whistle }); break;
            case 'shot': if (e.id === 'PD-B') cork(t + 1.0); else if (e.id === 'PD-C') cooling(t + 0.3, 6); break;
            case 'radio': if (e.agent) radioClick(t); break;
            case 'settings': {
              var v = e.vol || {}; W.tones = !!e.tones;
              var eng = clamp(num(v.engine, 1), 0, 1), k = W.noMaster ? 1 / Math.max(0.05, 0.9 * eng) * 0.55 * clamp(num(v.master, 1), 0, 1) : 1;
              glide(crowdVol.gain, clamp(num(v.crowd, 1), 0, 1) * k, t, 0.05); glide(worldVol.gain, clamp(num(v.crowd, 1), 0, 1) * k, t, 0.05); glide(clickVol.gain, clamp(num(v.click, 1), 0, 1) * k, t, 0.05);
              if (W.noMaster) glide(eventsIn.gain, k, t, 0.05);
              break; }
          }
        };
        W.pause = function () { var t = clock(); [deadA].forEach(function (g) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); }); PREV.t = null; };
        W.resume = function () { var t = clock(); [deadA].forEach(function (g) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.08); }); };
        W.stop = function () { var t = clock(); [deadA].forEach(function (g) { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.02); } catch (e) {} }); [N1, N2, N3, kOsc].forEach(function (s) { try { s.stop(t + 0.1); } catch (e) {} }); CR.slots.forEach(function (s) { s.src.forEach(function (x) { try { x.stop(t + 0.1); } catch (e) {} }); }); };
        W.ready = function () { return CR.state !== 'loading'; };
        W.flush = function () { farDue(clock(), true); };
        W.state = function () {
          return { mode: W.mode, reverb: { kind: REV.kind, made: REV.made, ms: REV.ms, bytes: REV.bytes }, lap: { tunnels: LAP.tun, bridges: LAP.bridges, gantries: LAP.gantries, stands: LAP.stands.length, towers: LAP.towers.length, sea: LAP.sea },
            crowd: { state: CR.state, id: CR.id, err: CR.err, ms: CR.ms, bytes: CR.bytes, peakBytes: CR.peakBytes, cues: Object.keys(CR.cues), active: CR.active, ladder: CR.ladder, hush: CR.hush },
            beats: { x18: X.intro ? { t0: X.intro.t0 } : null, x28: X.ignite, x33: X.podium ? { t0: X.podium.t0, bursts: X.bursts, log: X.burstLog || [] } : null, lights: X.lights },
            mem: { crowd: CR.bytes, reverb: REV.bytes || 0, noise: NB.length * 4 }, log: W.log.slice(-200) };
        };
        W.t0 = clock(); W.lastTA = 0;
        setMode('chase', clock());
        W.load();
        return W;
      }

      /* ---------------------------------------------------------------------------------------------- the A -- */
      var ac = env.ac || null, out = env.out || null, rig = null, bank = null, err = null, tape = null, stopped = false, W = null, master = env.master || null, LEADW0 = quality === 'low' ? 0.05 : 0.03;
      var stats = { frames: 0, ms: 0, msMax: 0, hist: [] }, lastFrameWall = 0, muted = false, watch = null, govT = { last: null, lagSum: 0, n: 0, clean: 0 };
      // (a phone decodes the crowd's sheets first and the bank after: the two never stack, D-DESIGN 9.2)
      var crowdP = loadCrowd();
      var bankP = (tier === 'lo' ? crowdP.then(function () {}, function () {}) : Promise.resolve()).then(function () { return loadBank(tier); }).then(function (b) { bank = b; return b; }, function (e) { err = e; warn('The race sound could not load (' + (e && e.message || e) + '): the stand-in engine plays.'); return null; });
      // the world (made with the page's AudioContext, never waiting on the bank: X18 sounds at the tap)
      function world() {
        if (W || !ac || !out || stopped) return W;
        try { W = World(ac, { out: out, master: master, quality: quality, warn: warn, T: env.T || null, cfg: env.cfg || {}, seed: env.seed, helmet: !!env.helmet }); }
        catch (e) { warn('The race world sound could not be made (' + (e && e.message || e) + ').'); W = null; }
        return W;
      }
      // a race event at its own sim time against the last frame's; a page event (it carries wall) now
      function wTime(d) {
        var nw = ac.currentTime + 0.005, F = W && W.F;
        if (d && typeof d.t === 'number' && d.wall == null && F && F.simT != null) return Math.max(nw, F.tA + (d.t - F.simT));
        return Math.max(nw, F ? Math.min(F.tA, ac.currentTime + LEADW0) : nw);
      }
      function build() {
        if (rig || !bank || !ac || !out) return rig;
        world();
        rig = Rig(ac, W ? W.engIn : out, { bank: bank, quality: quality, cfg: env.cfg, seed: env.seed, helmet: !!env.helmet });
        if (win.setInterval && !watch) watch = win.setInterval(watchdog, 100);
        // (the gate's events that came while the bank loaded, in order: a fire-up more than 4 s late is not played, the
        // engines simply open)
        var q = pre; pre = [];
        q.forEach(function (p) { rig.event(p.name === 'engines' && now() - p.wall > 4000 ? 'skip' : p.name, p.data); });
        return rig;
      }
      var pre = [], PRE = /^(intro|engines|skip|handoff|again|rev|light|go|podium)$/;
      // the demo is silent whatever the page does: no frame for 250 ms -> the engines fade over 0.3 s
      function watchdog() {
        if (!rig || stopped) return;
        if (!muted && now() - lastFrameWall > 250) { muted = true; rig.idleOut(ac.currentTime); }
        governor();
      }
      // the governor: the audio clock falling behind wall time by > 1 % over 6 s -> one step down; 30 s clean -> one up
      function governor() {
        if (!ac.getOutputTimestamp || ac.state !== 'running') return;
        var ts = ac.getOutputTimestamp(); if (!ts || !(ts.performanceTime > 0)) return;
        if (govT.last && ts.performanceTime - govT.last.p >= 2000) {
          var dw = (ts.performanceTime - govT.last.p) / 1000, da = ts.contextTime - govT.last.c, lag = 1 - da / dw;
          govT.lagSum += lag; govT.n++; govT.lastLag = lag;
          if (govT.n >= 3) { var m = govT.lagSum / govT.n; govT.lagSum = 0; govT.n = 0; if (m > 0.01 && rig.gov.step < 4) { rig.gov.step++; govT.clean = 0; warn('The race sound steps down (step ' + rig.gov.step + '): the audio clock fell ' + (m * 100).toFixed(1) + ' % behind.'); } else if (m < 0.002 && ++govT.clean >= 5 && rig.gov.step > (quality === 'low' && (win.navigator && win.navigator.hardwareConcurrency <= 4) ? 1 : 0)) { rig.gov.step--; govT.clean = 0; } }
          govT.last = { p: ts.performanceTime, c: ts.contextTime };
        } else if (!govT.last) govT.last = { p: ts.performanceTime, c: ts.contextTime };
      }

      var A = {
        attach: function (o) { o = o || {}; if (o.ac) ac = o.ac; if (o.out) out = o.out; if (o.master) master = o.master; world(); build(); return A; },
        ready: function () { return !!bank; },
        progress: function () { return bank ? 1 : $.loads[tier] ? $.loads[tier].progress : 0; },
        frame: function (view, listener, dt) {
          if (stopped) return;
          var t0 = now();
          if (world()) { try { W.frame(wFrame(view, listener, dt, Math.max(ac.currentTime + LEADW0, W.lastTA + 1e-4))); } catch (e) { warn('The race world sound failed (' + (e && e.message || e) + ').'); W = null; } }
          // (the engines' limiter, read once a frame: how often it holds more than 1 and 3 dB)
          if (W && W.lim) { var gr = W.lim.comp.reduction; gr = typeof gr === 'number' ? gr : gr && gr.value || 0; var LS = stats.lim || (stats.lim = { n: 0, o1: 0, o3: 0, max: 0 }); LS.n++; if (gr < -1) LS.o1++; if (gr < -3) LS.o3++; if (gr < LS.max) LS.max = gr; }
          var tw = now() - t0; stats.wms = (stats.wms || 0) + tw; stats.wn = (stats.wn || 0) + 1; (stats.whist || (stats.whist = [])).push(tw); if (stats.whist.length > 600) stats.whist.shift();
          if (!build()) return;
          if (muted) { muted = false; rig.gate(ac.currentTime, 1, 0.08); }
          lastFrameWall = t0;
          if (rig.gov.step === 0 && quality === 'low' && win.navigator && win.navigator.hardwareConcurrency <= 4 && !govT.init) { govT.init = true; rig.gov.step = 1; }
          rig.frame(view, listener, dt, ac.currentTime);
          if (tape) tape.frames.push({ t: +ac.currentTime.toFixed(4), dt: dt, view: view && view.cars ? { cars: view.cars.map(compact), focus: view.focus, t: view.t } : (view || []).map(compact), L: listener });
          var ms = now() - t0; stats.frames++; stats.ms += ms; stats.msMax = Math.max(stats.msMax, ms); stats.hist.push(ms); if (stats.hist.length > 600) stats.hist.shift();
        },
        event: function (name, data) {
          if (name === 'pause') { if (W) W.pause(); if (rig) rig.pause(ac.currentTime); return; }
          if (name === 'resume') { if (W) W.resume(); if (rig) rig.resume(ac.currentTime); return; }
          if (world()) { try { W.event(name, data || {}, wTime(data)); } catch (e) { warn('The race world sound failed (' + (e && e.message || e) + ').'); } }
          if (name === 'settings') return;
          if (tape) tape.events.push({ at: ac ? +ac.currentTime.toFixed(4) : 0, name: name, data: data });
          if (!rig) build();
          if (rig) rig.event(name, data);
          // (the bank still loading: the engines' gate events wait for the rig, so a late bank neither plays the grid's
          // engines before they fire nor loses the fire-up; build() hands them over in order)
          else if (PRE.test(name)) { pre.push({ name: name, data: data, wall: now() }); if (pre.length > 24) pre.shift(); }
        },
        failed: function () { return !!err && !bank; },
        state: function () {
          var B = bank || ($.loads[tier] && $.loads[tier].B) || { mem: 0, peak: 0, files: 0 }, h = stats.hist.slice().sort(function (p, q) { return p - q; });
          return { ready: !!bank, error: err ? String(err.message || err) : null, tier: tier, quality: quality, sr: ac ? ac.sampleRate : null,
            mem: { residentMB: +(B.mem / 1e6).toFixed(2), peakMB: +(B.peak / 1e6).toFixed(2), buffers: B.files, worldMB: W ? +((function (m) { return m.crowd + m.reverb + m.noise; })(W.state().mem) / 1e6).toFixed(2) : 0 },
            load: { frames: stats.frames, mainMs: stats.frames ? +(stats.ms / stats.frames).toFixed(4) : 0, mainP95: h.length ? +h[Math.floor(h.length * 0.95)].toFixed(4) : 0, mainMax: +stats.msMax.toFixed(3), clockLag: govT.lastLag != null ? +govT.lastLag.toFixed(4) : null },
            lim: stats.lim ? { frames: stats.lim.n, over1: stats.lim.n ? +(stats.lim.o1 / stats.lim.n).toFixed(4) : 0, over3: stats.lim.n ? +(stats.lim.o3 / stats.lim.n).toFixed(4) : 0, maxDb: +stats.lim.max.toFixed(2), ceilDb: W && W.lim ? W.lim.ceilDb : null } : null,
            rig: rig ? rig.state() : null, world: W ? W.state() : null, worldLoad: stats.wn ? { frames: stats.wn, mainMs: +(stats.wms / stats.wn).toFixed(4), mainP95: +stats.whist.slice().sort(function (p, q) { return p - q; })[Math.floor(stats.whist.length * 0.95)].toFixed(4) } : null };
        },
        tape: function (on) { if (on === undefined) return tape; tape = on ? { frames: [], events: [] } : null; return tape; },
        offline: function (T, o) { return bankP.then(function () { return offline(T, o || {}); }); },
        stop: function () { stopped = true; if (watch && win.clearInterval) win.clearInterval(watch); if (W) W.stop(); if (rig) rig.stop(ac.currentTime); },
        whenReady: function () { return bankP; },
        // (the tests: the governor's step, read, or set as an overload would set it, 0-4)
        govern: function (s) { if (rig && s != null) rig.gov.step = clamp(s | 0, 0, 4); return rig ? rig.gov.step : null; },
      };
      function compact(c) { return { n: c.n, rpm: Math.round(c.rpm), thr: +(c.thr != null ? c.thr : c.throttle || 0).toFixed(3), brk: +(c.brk || 0).toFixed(3), gear: c.gear, v: +(c.v != null ? c.v : c.speed || 0).toFixed(2), x: +c.x.toFixed(2), y: +(c.y || 0).toFixed(2), z: +c.z.toFixed(2), h: +(c.h || 0).toFixed(4), limiter: !!c.limiter, focus: !!c.focus }; }

      // ---- offline: a tape through the same rig in an OfflineAudioContext. T = { frames: [{ t, dt, view|cars, L, ev }],
      // events: [{ at, name, data }] } (or columns: see tapeFrames); o = { quality, sr, master (v1's 0.55 + limiter),
      // engines (0.9), dur, from }. -> { sr, ch: [L, R], meta: the focus voice's rpm/load/mesh/ers/boost/gear at 100 Hz, ev }
      function tapeFrames(T) {
        if (T.frames) return T.frames;
        // columns: { fps, t0, cars: [{ rpm: [], thr: [], brk: [], gear: [], v: [], x: [], y: [], z: [], h: [], lim: [] }], focus, L: [...] | { mode, follow }, ev: [...] }
        var fr = [], n = T.cars[0].rpm.length, fps = T.fps || 60;
        for (var i = 0; i < n; i++) {
          var cars = T.cars.map(function (c, k) { return { n: k, rpm: c.rpm[i], thr: c.thr[i], brk: c.brk ? c.brk[i] : 0, gear: c.gear[i], v: c.v[i], x: c.x[i], y: c.y ? c.y[i] : 0, z: c.z[i], h: c.h[i], limiter: c.lim ? !!c.lim[i] : false, d: c.d ? c.d[i] : null, spec: T.specs ? T.specs[k] : null }; });
          fr.push({ t: i / fps, dt: 1 / fps, cars: cars, focus: T.focus || 0, simT: T.simT ? T.simT[i] : (T.t0 || 0) + i / fps, L: T.Ls ? T.Ls[i] : null });
        }
        return fr;
      }
      function offline(T, o) {
        return loadBank(o.quality === 'low' ? 'lo' : o.quality === 'high' ? 'hi' : tier).then(function (BB) {
          // (o.taps (the world's tests): 18 channels, the master on the first two and each world bus on its own pair)
          var fr = tapeFrames(T), sr = o.sr || 48000, dur = o.dur || (fr.length ? fr[fr.length - 1].t + 1 : 1), oac = new OAC(o.taps ? 18 : 2, Math.ceil(dur * sr), sr);
          var dest = oac.destination, mg = null, mst = null;
          if (o.taps) { mg = oac.createChannelMerger(18); mg.connect(oac.destination); }
          if (o.master) { var m = oac.createGain(); m.gain.value = 0.55; var lim = oac.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12; m.connect(lim); dest = m; mst = m;
            if (mg) { var up = oac.createGain(); up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers'; var spl = oac.createChannelSplitter(2); lim.connect(up); up.connect(spl); spl.connect(mg, 0, 0); spl.connect(mg, 1, 1); } else lim.connect(oac.destination); }
          if (o.engines !== false && o.master) { var eg = oac.createGain(); eg.gain.value = 0.9; eg.connect(dest); dest = eg; }
          // (o.world: the world as the race runs it, its own buses into the master; off by default, so the engine's own
          // tests hear the engine alone)
          var Wd = o.world ? World(oac, { out: dest, master: mst, quality: o.quality || quality, warn: warn, T: o.T !== undefined ? o.T : env.T || null, cfg: o.cfg || env.cfg || {}, seed: o.seed != null ? o.seed : T.seed || 1, taps: mg, mute: o.mute, helmet: o.helmet != null ? !!o.helmet : !!env.helmet, ceil: o.ceil, wceil: o.wceil, kx: o.kx }) : null;
          var LD = o.lead != null ? o.lead : (o.quality || quality) === 'low' ? 0.05 : 0.03;
          // (o.hook(oac, engineBus, dest): a test routes the engine bus itself, e.g. through v4's world layers)
          var eb = Wd ? Wd.engIn : dest; if (typeof o.hook === 'function') eb = oac.createGain();
          var r = o.noEngine ? null : Rig(oac, eb, { bank: o.bank || BB, quality: o.quality || quality, cfg: o.cfg || env.cfg, seed: o.seed != null ? o.seed : T.seed || 1, gain: o.gain, lead: o.lead, solo: !!o.solo, helmet: o.helmet != null ? !!o.helmet : !!env.helmet, rivals: o.rivals });
          if (typeof o.hook === 'function') o.hook(oac, eb, Wd ? Wd.engIn : dest, fr);
          if (Wd && typeof o.with === 'function') o.with(oac, Wd);
          var rec = r ? r.record() : null, evs = (T.events || []).slice().sort(function (p, q) { return p.at - q.at; }), ei = 0, fi = 0, CH = o.chunk || 0.1;
          function wEv(name, data, at) { if (Wd) Wd.event(name, data || {}, Math.max(at + LD, oac.currentTime + 0.003)); }
          var evByFrame = T.ev || null;
          function run(upTo) {
            while (fi < fr.length && fr[fi].t < upTo) {
              var f = fr[fi];
              while (ei < evs.length && evs[ei].at <= f.t) { if (r) r.event(evs[ei].name, evs[ei].data); wEv(evs[ei].name, evs[ei].data, evs[ei].at); ei++; }
              if (evByFrame && evByFrame[fi]) evByFrame[fi].forEach(function (e) { if (r) r.event(e.e, e); wEv(e.e, e, f.t); });
              var view = f.view || { cars: f.cars, focus: f.focus, t: f.simT };
              var Lr = f.L || listenerFor(o.mode || 'chase', view);
              if (Wd) Wd.frame(wFrame(view, Lr, f.dt || 1 / 60, Math.max(f.t + LD, Wd.lastTA + 1e-4), o.T !== undefined ? o.T : undefined));
              if (r) r.frame(view, Lr, f.dt || 1 / 60, f.t);
              fi++;
            }
            if (fi >= fr.length && Wd) { while (ei < evs.length) { wEv(evs[ei].name, evs[ei].data, evs[ei].at); ei++; } Wd.flush(); }
          }
          run(CH);
          for (var tc = CH; tc < dur - 0.05; tc += CH) (function (tc) { K.atRender(oac, tc - 0.02, function () { run(tc + CH); }); })(tc);
          var t0w = now();
          return oac.startRendering().then(function (buf) {
            var ch = []; for (var c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
            if (oac.__errors) warn('gp-audio offline: ' + oac.__errors.length + ' error(s): ' + oac.__errors[0]);
            rec = rec || {};
            return { sr: buf.sampleRate, ch: ch, ms: now() - t0w, dur: dur, errors: oac.__errors || [], meta: { scene: o.label || 'gp-audio-offline', cyl: 6, rpm: rec.rpm, load: rec.load, mesh: rec.mesh, ers: rec.ers, boost: rec.boost, gear: rec.gear, thr: rec.thr, tun: rec.tun, ev: rec.ev, lites: rec.lites, state: r ? r.state() : null, world: Wd ? Wd.state() : null } };
          });
        });
      }
      // a camera for a tape without one: chase (7.5 m behind, 2 m up), tcam (on the airbox), cockpit, or tv (o.at)
      function listenerFor(md, view) {
        var cars = view.cars || view, c = cars[view.focus || 0] || cars[0], fx = Math.sin(c.h), fz = -Math.cos(c.h);
        var back = md === 'chase' ? 7.5 : 0, up = md === 'chase' ? 2 : 1.0;
        var x = c.x - fx * back, z = c.z - fz * back, y = (c.y || 0) + up;
        // right vector = forward x up: (-fz, 0, fx) -> a quaternion yaw about y giving that right vector
        var yaw = Math.atan2(-fx, -fz);
        return { x: x, y: y, z: z, qx: 0, qy: Math.sin(yaw / 2), qz: 0, qw: Math.cos(yaw / 2), mode: md };
      }
      A.listenerFor = listenerFor;
      if (ac) bankP.then(function () { build(); });
      return A;
    }
