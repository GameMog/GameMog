    /* ================================================= Grand Prix: the racing line, the speed profiles, the AI == */
    // ARTIFICIAL1 M1, lane A. Pasted into boot() by gp.js at /*@include gp-ai.js*/. ONE top-level binding (GpAI).
    // PURE: no THREE, no DOM, no clock, no Math.random, no console; only Math and the ES built-ins. Loaded by Node with
    // vm.runInNewContext(src + ';GpAI', {}). It reaches the track (gpTrack's table), the sim's envelope helpers
    // (GpSim.latMax, brakeMax, driveMax, dragAcc, control) and the race (S) only through arguments.
    //  - line(T, o): the minimum-curvature racing line, every node's own half-width less a margin (a port of the
    //    gp5k probe: the kart-style relaxation coarse to fine, then coordinate descent on the summed squared
    //    curvature). Offsets are kept in whole centimetres, so a line computed at load equals a baked one.
    //  - profile(T, line, phys, P, o): the grip-limited speed on the line at every table sample, forward and
    //    backward passes (crest load, bank, grade, drag, the friction circle), through the sim's own envelope.
    //  - driver(T, line, prof, phys, specs, o): the AI drivers. Every per-race value lives on the car (car.ai), so
    //    snapshot, restore and replay see all of it; the factory closes over immutable tables only.
    //  M2 (lane A, the experience: EXPERIENCE.md X01, X08, X09, X14, X15, X24, X27, X29, X30): the agents' minds (the chip,
    //  car.mind, is the state the car drives by: ATTACK decided at least 2 s before the move's braking point and shown at
    //  once, DEFEND one move, TOW, PUSH, SAVE, LEARN; memory of the player within the race), lap-1 mercy at Origin, mistakes
    //  you can see (slips and big ones, as events), the personas by AI row (spec.row: arcs, the shift point, lift and coast,
    //  learners), the final lap's PUSH, a finished car's run-off, and the field's manners (single file into a chicane and
    //  the lap-1 funnel, a safe gap into a braking zone, never into a slower car ahead).
    // Units: metres, seconds, radians, m/s. lat + is right of the centre line; curvature + is a right turn.
    var GpAI = (function () {
      var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt, floor = Math.floor, round = Math.round;

      /* ------------------------------------------------------------------------- tunables (one place) ---- */
      var K = {
        // the line
        nodeStep: 4,              // m between line nodes (M = round(L / 4))
        margin: 1.2,              // m inside the white line for the line: the car's half-width 1.0 plus 0.2
        iterations: 600,          // coordinate-descent sweeps (the gp5k probe: 600 in 196 ms gave 1:28.92)
        coarse: 6000, fine: 3000, // relaxation passes, 16 m nodes then 4 m nodes (the start of the descent)
        // pace and speed
        paceExp: 2,               // a pace class scales grip, brakes and traction by pace^paceExp (power unchanged): lap ~ model / pace
        classes: [1.01, 1, 0.99, 0.98, 0.97, 0.96],   // the pace classes the driver reads between (pace 0.96 to 1.01: M2, a push over 1)
        look: 0.05,               // s: the target speed is read this far ahead (control() gets the profile's slope fed forward)
        ffN: 8,                   // samples over which the profile's slope is taken for that feed-forward
        traction: 0.95,           // share of the tyres' remaining traction the throttle may ask for, off the profile
        lookK: 0.3, lookMin: 6, lookR: 1e9,     // the pursuit point: lookK * v metres ahead, at least lookMin, at most lookR x the line radius
        edge: 1.1,                // m: the car's centre stays this far inside the white line (half-width + 0.1)
        offLine: 2,               // corner speed x sqrt(1 - offLine * |k| * metres off the line)
        wideErr: 0.4, wideLift: 0.2, wideV: 0.9,   // m off its lane to the outside of a corner before it lifts (to v - wideLift: never the
                                  // brakes), and only over wideV of the ceiling
        sMargin: 0.94,            // a chicane's braking zone at this share of the ceiling
        // the field
        sep: 2.8,                 // m: centre to centre beside a car alongside (width 2.0 + 0.8, room for a yawed nose); never steer into less
        along: 6.6,               // m: two cars this close along the road are alongside (length 5.6 + 1)
        behind: 2.5,              // m: a car further back than this is behind, and gives way
        gap0: 7.6, gapV: 0.12,    // m: the gap held behind a car in the same lane, gap0 + gapV * v
        wideLane: 4.5, ttc: 1.5,  // m, s: a car this far across, closed on this fast, counts for the gap in a braking zone
        tightK: 1 / 60,           // 1/m: a corner this tight (line radius under 60 m) is taken nose to tail, never side by side
        tightV: 0,                // m/s: a braking zone whose apex is slower than this is taken single file (as a chicane is); 0 = off
                                  // (measured: 40 took the late-braking passes away; the lap-1 funnel is enough at the start)
        single: 60, singleMin: 8, // m before a chicane's braking point from which it is taken single file; never slower than singleMin m/s for it
        safeB: 0, gapMin: 6.5, safeZone: 150, safeF: 0.85, safeGap: 6.5, kinF: 0.75, kinClo: 8,    // a Gipps safe following speed at safeB of the car's braking, stopping gapMin m behind; 0 = off (measured: 0.75
                                  // halved the contacts but made the race a procession, no change in a lap in 4 of 5 seeds)
        dirty: 0, dirtyLen: 15,   // dirty air: corner speed x (1 - dirty * e^(-gap / dirtyLen)) behind a car in its lane; 0 = off
        laneRate: 3.2, laneBack: 3,      // m/s: lateral moves out, and back to the line
        laneOut: 4.5,             // m/s: out of a tow into the passing lane (the move, once shown)
        // racing (all gaps in seconds unless marked m)
        straightK: 1 / 250,       // 1/m: line curvature under which the road counts as straight (for the next 100 m)
        passFrom: 90,             // m to the next braking point at least, to start a tow or a pass
        attack0: 0.3, attackA: 0.6,   // s: attack the car ahead within attack0 + attackA * aggression (0.6 s at 0.5)
        tow: 1.2, towLane: 2.5,   // s: seek the tow within (as often as the tow knob says); m: only this far off the line
        commitMin: 8, commitV: 1.6, closing: 0.5,   // pull out of the tow within commitMin + commitV * closing speed (m), closing faster
                                  // than `closing` m/s, or within commitMin m
        gapTow: 7, ttcTow: 0.7,   // m centre to centre, s: in the tow it closes freely until this near, or this close to contact
        passLat: 3.0,             // m: the passing lane, beside the car being passed
        doorT: 0.6,               // s the room beside the car being passed may stay shut before the pass is given up
        tuckK: 0.6,               // a pass not alongside is given up this share of the time it needs to regain the line before the braking point
        dive: 5,                  // m: at the braking point, on the inside and no more than this far behind, it may go for the dive
        cool: 2,                  // s before another pass after one is given up
        defend: 0.8,              // s: defend against a car within, closing
        defendFrom: 150, defendTo: 450,  // m before the braking point the one defensive move may start
        defLane: 3,               // m: the defensive move, toward the inside of the line
        // the driver's character (drivers.md 5.2; M2: the mistakes are X09's, below)
        wide: [1.2, 2.4],         // m: running wide at the exit
        brakeSigma: 6, lineSigma: 0.6, paceSigma: 0.0025,   // braking point (m), line (m) and lap pace noise at C = 0 (times 1 - C)
        react: 0.03, reactMin: 0.12,     // s: the start reaction's spread and floor
        lateBoost: 0.006,         // pace added over the last laps for an arc 'late:N' (M2: 0.003 -> 0.006; PUSH on the final lap)
        // held up (fix, 15 Oct: a slower car, the player most of all, led a 20-car train): the seconds this car has lost
        // against its own pace (its full profile, less frSlack) while following a car ahead in its lane within frGap s (from
        // frFrom m into the race: not the standing start), forgotten at lostDecay s a second when free; past frustrate s it
        // races for the place: it hunts within
        // frAttack s, pulls out of the tow within commitFr m, waits doorFr s for a shut door (and tries the other side), and
        // may go down the inside into a braking zone from diveFr m back
        // (a car ahead that is itself held up past frQueue x frustrate is a queue, not the one to race. Held up, it also follows
        // at gapFr m + gapFrV x v out of corners and down straights, until gapFrT s from a braking point (no closer into the
        // braking zone), keeps its own line in the tow, and from up to diveIn m back,
        // diveFrom m before a braking point, goes for the inside of a corner that is not a chicane. Any car following another
        // brakes with brLead of that car's own deceleration fed forward: the full exit traction below brought cars to the
        // braking zones closer, and the speed alone lagged their braking)
        frGap: 1.2, frSlack: 0.01, frFrom: 600, lostDecay: 0.05, frustrate: 0.3, frAttack: 1.2, commitFr: 10, doorFr: 1.4, diveFr: 9,
        gapFr: 6.5, gapFrV: 0.06, gapFrT: 1.2, diveIn: 20, diveFrom: 100, frQueue: 0.5, brLead: 0.5,
        // ---- M2 (lane A): the agents' minds (X30). An ATTACK is decided at a decision point decMin..decMax s (on the pace-1
        // profile) before the next braking point and shown at once (the chip is the state: it cannot lie); the attacker holds
        // the tow at least showMin s before it pulls out (time to cover), and the move's braking point comes at least 2.0 s
        // after the chip (decMin leaves room for a tow's extra speed). The defence: one move, defendFrom m or more before the
        // zone. Memory, the player only, within the race: passed at a corner, the defend chance there next time is
        // min(defendCap, D + defendMem); covered at a corner, the next attack there goes for the other side
        decMin: 2.3, decMax: 12, showMin: 0.8, defendMem: 0.3, defendCap: 0.95, holdTow: 1.4,
        // ...and only when the pass is on: a tow attack into a braking zone with runMin m of straight before it, decided on that
        // straight at least decTow s before the braking point, when the tow can bring it within a dive's reach (dive m, diveFr
        // when held up, + 4) by then; or a held-up car (frDive s lost) diving down the inside of a real stop (diveDrop m/s)
        // from within diveDec m, closing at diveClo m/s, diveTb s or less before it. The door (the room beside the car) is
        // judged doorZone m before the braking point, on where the car is and where it is going in roomT s; out of the tow at
        // pullTtc s to contact, or near the braking point (pullNear s) within reach; the target out of its path once passClear
        // m across; tracTow of the traction in a tow
        tracTow: 0.98, runMin: 250, doorZone: 250, roomT: 1.0, passClear: 2.2, pullTtc: 1.6, pullNear: 2.5, diveDrop: 15, diveTb: 3.5, decTow: 4.5, frDive: 1.0, diveDec: 13, diveClo: 0.5,
        // lap-1 mercy at Origin (X01): until past T2 on lap 1, aggression x mercyAgg, T1's braking mercyEarly m early, the
        // grid column held to T1's braking point (the start's one move), mercySep m kept beside a car alongside
        mercyAgg: 0.3, mercyEarly: 10, mercySep: 3.2, mercyFile: 450, fileKM: 0.7,
        // single file (a chicane, a slow corner; the lap-1 funnel into T1 from mercyFile m before its braking point): the car
        // behind keeps fileGap m to the car ahead in any lane within fileLat m across, closing at fileK m/s per metre short
        fileGap: 10, fileLat: 6.5, fileK: 1.0,
        // mistakes you can see (X09): slips slip x (1 - C) a car a lap, big ones big x (1 - C)^2 (lock-ups, running wide, a
        // kerb, the crest's wobble; an overshoot into an escape road, at escapeV m/s there, or a wall brush in the tunnel)
        slip: 1.5, big: 0.25, lockLate: [3, 8], lockT: [0.25, 0.45], overLate: [25, 40], escapeV: 12.5, wobT: 0.6, brushLane: 6,
        // the persona (X15): a numeric arc x arcScale per lap, centred on the race (drivers.md's arcs re-scaled to 3 laps);
        // (a pace class moves the lap time about half as much: power is the same for all, so the arcs are set at twice the
        // lap-time change they are meant to show: Tick -0.3 % a lap, Ponder -0.5 % on lap 1 and +0.3 % on the last)
        // PUSH on the final lap (late personas, or a car within pushBehind s behind): + lateBoost pace, aggression + pushAgg
        // within pushAhead s of the car ahead (X08); SAVE: lift and coast coastT s before a braking point, alone within saveGap
        // s; LEARN for learnT s after a sector learnGain s better than its best
        arcScale: 10, pushAgg: 0.2, pushBehind: 0.5, pushAhead: 1.0, saveGap: 1.5, coastT: 0.3, learnGain: 0.05, learnT: 3,
        // a car that has taken the flag (X27): finLane m to the side of the line at finPace x the pace-1 profile, non-colliding
        finLane: 4, finPace: 0.6,
        // the personas by AI row (drivers.md 5.3: what the world's agent races as, spec.row; the names and words are the
        // world's data): mem, what memory does (exact: covers the corner it was passed at, every lap; noRepeat: never
        // attacks the same corner twice running; inside: once passed, defends the inside everywhere); up, its shift point
        // (1: on the limiter); towSit: sits in tows short-shifting (upEarly) until the final lap, then PUSH to the limiter;
        // lap1, lap2: pace on laps 1 and 2 (the top is saturated: the sim's car laps no faster above about 0.996, so a late
        // push shows only against slower laps before it); push: PUSH on the final lap; cEnd: consistency by the last lap (a learner, LEARN);
        // coast: lift and coast when alone (SAVE); recalc: pace lost on the lap after being passed; wobble: x the crest wobble
        rows: {
          gbot: { mem: 'exact' }, redteam: { mem: 'noRepeat', up: 1 }, blueteam: { mem: 'inside' },
          glitch: { up: 1, wobble: 4 }, ponder: { lap1: -0.01, lap2: -0.004, save1: 1, push: 1 }, daemon: { towSit: 1, upEarly: 0.93, upLast: 1, push: 1, aggLast: 0.9 },
          epsilon: { cEnd: 0.85, learn: 1 }, grain: { cEnd: 0.85, learn: 1 }, patch: { cEnd: 0.9, learn: 1 },
          hedge: { coast: 1 }, waypoint: { recalc: 0.0033 },
        },
      };

      /* ------------------------------------------------------------------------------ small helpers ---- */
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
      function hex8(h) { var s = (h >>> 0).toString(16); while (s.length < 8) s = '0' + s; return s; }
      // two 32-bit FNV-1a lanes over a string: 16 hex
      function sig16(str) {
        var a = 0x811c9dc5, b = 0x050c5d1f;
        for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ (c + 0x9e), 0x01000193); }
        return hex8(a) + hex8(b);
      }
      // a standard normal from two uniforms (Box-Muller); always draws exactly two numbers
      function gauss(r) { var u = r.next(), v = r.next(); return sqrt(-2 * Math.log(max(1e-12, u))) * Math.cos(2 * Math.PI * v); }

      /* ---------------------------------------------------------------------------- the racing line ---- */
      // the nodes: centre, level right vector and the half-width limit at each node
      function nodesOf(T, M, margin) {
        var step = T.L / M, q = {}, N = { M: M, step: step, x: new Float64Array(M), z: new Float64Array(M), rx: new Float64Array(M), rz: new Float64Array(M), lim: new Float64Array(M) };
        for (var j = 0; j < M; j++) {
          T.pose(j * step, q);
          N.x[j] = q.x; N.z[j] = q.z; N.rx[j] = Math.cos(q.h); N.rz[j] = Math.sin(q.h); N.lim[j] = max(0.5, q.hw - margin);
        }
        return N;
      }
      // the kart kit's relaxation (each node toward a cubic fit of its neighbours), the limit per node
      function relax(N, from, passes) {
        var M = N.M, off = new Float64Array(M), x = N.x, z = N.z, rx = N.rx, rz = N.rz, lim = N.lim, j;
        if (from) for (j = 0; j < M; j++) { var f = j / M * from.length, a0 = floor(f) % from.length, a1 = (a0 + 1) % from.length; off[j] = from[a0] + (from[a1] - from[a0]) * (f - floor(f)); }
        for (var it = 0; it < passes; it++) for (j = 0; j < M; j++) {
          var a = (j + M - 2) % M, b = (j + M - 1) % M, c = (j + 1) % M, e = (j + 2) % M;
          var tx = (-(x[a] + rx[a] * off[a]) + 4 * (x[b] + rx[b] * off[b]) + 4 * (x[c] + rx[c] * off[c]) - (x[e] + rx[e] * off[e])) / 6;
          var tz = (-(z[a] + rz[a] * off[a]) + 4 * (z[b] + rz[b] * off[b]) + 4 * (z[c] + rz[c] * off[c]) - (z[e] + rz[e] * off[e])) / 6;
          var o = off[j] + 1.7 * ((tx - x[j]) * rx[j] + (tz - z[j]) * rz[j] - off[j]);
          off[j] = o < -lim[j] ? -lim[j] : o > lim[j] ? lim[j] : o;
        }
        return off;
      }
      // minimum curvature: coordinate descent on the squared Menger curvature of each node and its two neighbours,
      // with an adaptive step per node (the gp5k probe, reconcile.cjs minCurv), offsets within each node's limit
      function minCurv(N, off, iters) {
        var M = N.M, x = N.x, z = N.z, rx = N.rx, rz = N.rz, lim = N.lim, X = new Float64Array(M), Z = new Float64Array(M), step = new Float64Array(M), j;
        for (j = 0; j < M; j++) { X[j] = x[j] + rx[j] * off[j]; Z[j] = z[j] + rz[j] * off[j]; step[j] = 0.2; }
        function kap(j) {
          var a = (j + M - 1) % M, c = (j + 1) % M, ax = X[a], az = Z[a], bx = X[j], bz = Z[j], cx = X[c], cz = Z[c];
          var cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
          var la = sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)), lb = sqrt((cx - bx) * (cx - bx) + (cz - bz) * (cz - bz)), lc = sqrt((cx - ax) * (cx - ax) + (cz - az) * (cz - az));
          return 2 * cr / (la * lb * lc);
        }
        function loc(j) { var k0 = kap((j + M - 1) % M), k1 = kap(j), k2 = kap((j + 1) % M); return k0 * k0 + k1 * k1 + k2 * k2; }
        function put(j, o) { off[j] = o; X[j] = x[j] + rx[j] * o; Z[j] = z[j] + rz[j] * o; }
        for (var it = 0; it < iters; it++) for (j = 0; j < M; j++) {
          var L = lim[j], e0 = loc(j), o = off[j], s = step[j], up = min(L, o + s), dn = max(-L, o - s);
          put(j, up); var e1 = loc(j); put(j, dn); var e2 = loc(j);
          if (e1 < e0 && e1 <= e2) { put(j, up); step[j] = min(1, s * 1.2); }
          else if (e2 < e0) { put(j, dn); step[j] = min(1, s * 1.2); }
          else { put(j, o); step[j] = max(0.002, s * 0.5); }
        }
        return off;
      }
      // the Line from whole-centimetre offsets: per-sample lateral offset, line curvature and line arc length
      function lineFrom(T, N, cm, iters) {
        var M = N.M, step = N.step, n = T.n, ds = T.ds, j, i;
        var off = new Float64Array(M), qx = new Float64Array(M), qz = new Float64Array(M), kap = new Float64Array(M), ks = new Float64Array(M), dq = new Float64Array(M);
        for (j = 0; j < M; j++) { off[j] = cm[j] / 100; qx[j] = N.x[j] + N.rx[j] * off[j]; qz[j] = N.z[j] + N.rz[j] * off[j]; }
        // signed curvature from the nodes two either side (8 m chords), + right; then a light [1 2 1] smoothing
        for (j = 0; j < M; j++) {
          var a = (j + M - 2) % M, c = (j + 2) % M, ax = qx[a], az = qz[a], bx = qx[j], bz = qz[j], cx = qx[c], cz = qz[c];
          var cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
          var la = sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)), lb = sqrt((cx - bx) * (cx - bx) + (cz - bz) * (cz - bz)), lc = sqrt((cx - ax) * (cx - ax) + (cz - az) * (cz - az));
          kap[j] = 2 * cr / (la * lb * lc);
          var e = (j + 1) % M; dq[j] = sqrt((qx[e] - bx) * (qx[e] - bx) + (qz[e] - bz) * (qz[e] - bz));
        }
        for (j = 0; j < M; j++) ks[j] = (kap[(j + M - 1) % M] + 2 * kap[j] + kap[(j + 1) % M]) / 4;
        var lat = new Float32Array(n), k = new Float32Array(n), dsl = new Float32Array(n);
        for (i = 0; i < n; i++) {
          var f = i * ds / step, j0 = floor(f) % M, j1 = (j0 + 1) % M, u = f - floor(f);
          lat[i] = off[j0] + (off[j1] - off[j0]) * u; k[i] = ks[j0] + (ks[j1] - ks[j0]) * u; dsl[i] = dq[j0] * ds / step;
        }
        var s = T.sig + ':' + M + ':'; for (j = 0; j < M; j++) s += cm[j] + ',';
        return { M: M, step: step, off: off, lat: lat, k: k, ds: dsl, sig: sig16(s), trackSig: T.sig, iterations: iters, ms: 0 };
      }
      function line(T, o) {
        o = o || {};
        if (o.baked) { var B = decode(o.baked, T); if (B) return B; }
        var margin = o.margin != null ? o.margin : K.margin, iters = o.iterations != null ? o.iterations : K.iterations;
        var M = max(16, round(T.L / K.nodeStep)), N = nodesOf(T, M, margin), Mc = max(8, round(M / 4));
        var Nc = nodesOf(T, Mc, margin), coarse = relax(Nc, null, o.coarse != null ? o.coarse : K.coarse);
        var off = relax(N, coarse, o.fine != null ? o.fine : K.fine);
        minCurv(N, off, iters);
        var cm = new Int16Array(M);
        for (var j = 0; j < M; j++) cm[j] = round(clamp(off[j], -N.lim[j], N.lim[j]) * 100);
        return lineFrom(T, N, cm, iters);
      }

      /* -------------------------------------------- baking: Int16 centimetres, base64 written by hand ---- */
      var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      function encode(L) {
        var M = L.M, bytes = [], out = '', i;
        for (i = 0; i < M; i++) { var v = round(L.off[i] * 100) & 0xffff; bytes.push(v & 0xff, v >> 8); }
        for (i = 0; i < bytes.length; i += 3) {
          var b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0, w = (b0 << 16) | (b1 << 8) | b2;
          out += B64[(w >> 18) & 63] + B64[(w >> 12) & 63] + (i + 1 < bytes.length ? B64[(w >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[w & 63] : '=');
        }
        return 'gpl1.' + L.trackSig + '.' + M + '.' + (L.iterations | 0) + '.' + out;
      }
      function decode(str, T) {
        if (typeof str !== 'string') return null;
        var p = str.split('.');
        if (p.length !== 5 || p[0] !== 'gpl1' || p[1] !== T.sig) return null;
        var M = +p[2], it = +p[3], s = p[4], bytes = [], i;
        if (!(M >= 16) || M !== round(T.L / K.nodeStep) || s.length !== 4 * Math.ceil(2 * M / 3)) return null;
        for (i = 0; i < s.length; i += 4) {
          var c0 = B64.indexOf(s[i]), c1 = B64.indexOf(s[i + 1]), c2 = s[i + 2] === '=' ? 0 : B64.indexOf(s[i + 2]), c3 = s[i + 3] === '=' ? 0 : B64.indexOf(s[i + 3]);
          if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return null;
          var w = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
          bytes.push((w >> 16) & 255); if (s[i + 2] !== '=') bytes.push((w >> 8) & 255); if (s[i + 3] !== '=') bytes.push(w & 255);
        }
        if (bytes.length !== 2 * M) return null;
        var cm = new Int16Array(M);
        for (i = 0; i < M; i++) { var v = bytes[2 * i] | (bytes[2 * i + 1] << 8); cm[i] = v & 0x8000 ? v - 0x10000 : v; }
        var N = nodesOf(T, M, K.margin);
        return lineFrom(T, N, cm, it);
      }

      /* ----------------------------------------------------------------------------- speed profiles ---- */
      // a pace class: grip, brakes and traction times pace^paceExp; power (and so the straights' top speed) unchanged
      function paced(P, pace) {
        if (pace === 1) return P;
        var k = Math.pow(pace, K.paceExp), Q = {};
        for (var key in P) Q[key] = P[key];
        Q.lat0 = P.lat0 * k; Q.latK = P.latK * k; Q.brk0 = P.brk0 * k; Q.brkK = P.brkK * k; Q.trac = P.trac * k;
        return Q;
      }
      function zoneMask(T, zones) {
        var n = T.n, m = new Uint8Array(n);
        if (zones === true) { m.fill(1); return m; }
        if (!zones || !zones.length) return m;
        for (var q = 0; q < zones.length; q++) {
          var z = zones[q], len = T.wrap(z.to - z.from);
          for (var i = 0; i < n; i++) if (T.wrap(i * T.ds - z.from) <= len) m[i] = 1;
        }
        return m;
      }
      // o = { pace: 1, flap: false | true | [{ from, to }], ceiling: false }. ceiling: the backward pass only (the
      // corners and their braking curves, no acceleration limit and no top-speed cap): what the driver reads, so a
      // car in a tow or with the flap open is never held back on a straight.
      function profile(T, line, phys, P, o) {
        o = o || {};
        var n = T.n, pace = o.pace != null ? o.pace : 1, Q = paced(P, pace), g = Q.g, ceil = !!o.ceiling, cap = ceil ? 150 : Q.vtop;
        var kk = line.k, dl = line.ds, kv = T.kv, gr = T.g, bk = T.bank, open = zoneMask(T, o.flap), i, it, v, a;
        var vmax = new Float64Array(n), lat = new Float64Array(n);
        for (i = 0; i < n; i++) {
          var R = 1 / max(1e-6, abs(kk[i])), help = -sgn(kk[i]) * bk[i];
          v = cap;
          for (it = 0; it < 40; it++) { var have = phys.latMax(Q, v, kv[i], help); if (v * v / R <= have) break; v = sqrt(max(1, have * R)); }
          vmax[i] = min(cap, v);
        }
        function fc(vv, i) { var ay = vv * vv * abs(kk[i]), am = phys.latMax(Q, vv, kv[i], -sgn(kk[i]) * bk[i]), r = min(1, ay / am); return sqrt(max(0, 1 - r * r)); }
        var V = new Float64Array(n), i0 = 0;
        for (i = 0; i < n; i++) { V[i] = vmax[i]; if (vmax[i] < vmax[i0]) i0 = i; }
        for (var pass = 0; pass < (ceil ? 2 : 4); pass++) {
          var kq, p, q;
          if (!ceil) for (kq = 1; kq <= n; kq++) {
            i = (i0 + kq) % n; p = (i0 + kq - 1) % n; v = V[p];
            var ge = max(0.2, (g + v * v * kv[p]) / g);
            a = min(phys.driveMax(Q, v, kv[p]), Q.trac * ge * fc(v, p)) - phys.dragAcc(Q, v, !!open[p], 0) - g * gr[p];
            V[i] = min(V[i], sqrt(max(1, v * v + 2 * a * dl[p])));
          }
          for (kq = 1; kq <= n; kq++) {
            i = (i0 - kq + 4 * n) % n; q = (i + 1) % n; v = V[q];
            a = phys.brakeMax(Q, v, kv[i]) * fc(v, i) + g * gr[i];
            V[i] = min(V[i], sqrt(v * v + 2 * max(0.5, a) * dl[i]));
          }
        }
        return Float32Array.from(V);
      }
      function lapTime(T, line, prof) {
        var n = T.n, t = 0;
        for (var i = 0; i < n; i++) t += line.ds[i] * 2 / (prof[i] + prof[(i + 1) % n]);
        return t;
      }

      /* ------------------------------------------------------- what the driver precomputes (immutable) ---- */
      // braking zones from the pace-1 profile (the real speeds: the braking point is where the speed starts to fall):
      // each run where it falls by more than 3 m/s. For every sample: the next zone, metres to its braking point, and
      // the side of its corner (+1 right). (M2) Each zone's corner (the T.corners entry whose apex is nearest the zone's
      // slowest point), and for every sample the next braking point strictly ahead (nz) and the time to it on the profile
      // (tbn: a decision point is a time before a braking point, X30), and whether it is past its zone's apex (pa).
      function zonesOf(T, line, c1) {
        var n = T.n, ds = T.ds, Z = [], i, i0 = 0;
        for (i = 1; i < n; i++) if (c1[i] > c1[i0]) i0 = i;     // start the scan at the fastest point
        var k = 0;
        while (k < n) {
          var a = (i0 + k) % n, b = (a + 1) % n;
          if (c1[b] < c1[a] - 1e-4) {
            var s = k; while (k < n && c1[(i0 + k + 1) % n] < c1[(i0 + k) % n] - 1e-4) k++;
            var b0 = (i0 + s) % n, b1 = (i0 + k) % n;
            if (c1[b0] - c1[b1] > 3) {
              var side = 0; for (var q = 0; q < round(40 / ds); q++) side += line.k[(b1 + q) % n];
              // an S-bend: the line turns hard the other way within 70 m of the apex (a chicane)
              var sb = false; for (q = 0; q < round(70 / ds); q++) { var kq2 = line.k[(b1 + q) % n]; if (kq2 * side < 0 && abs(kq2) > 1 / 60) { sb = true; break; } }
              Z.push({ b0: b0, b1: b1, v0: c1[b0], v1: c1[b1], side: side >= 0 ? 1 : -1, exit: (b1 + round(70 / ds)) % n, sbend: sb });
            }
          }
          k++;
        }
        var next = new Int16Array(n), to = new Float32Array(n);
        for (i = 0; i < n; i++) {
          var best = -1, bd = 1e9;
          for (var z = 0; z < Z.length; z++) {
            var dz = T.wrap((Z[z].b0 - i) * ds), din = T.wrap((i - Z[z].b0) * ds), len = T.wrap((Z[z].exit - Z[z].b0) * ds);
            if (din <= len) { best = z; bd = 0; break; }       // inside a zone (braking to its exit)
            if (dz < bd) { bd = dz; best = z; }
          }
          next[i] = best; to[i] = bd;
        }
        var straight = new Uint8Array(n), kn = round(100 / ds);
        for (i = 0; i < n; i++) { var ok = 1; for (q = 0; q < kn; q += 4) if (abs(line.k[(i + q) % n]) > K.straightK) { ok = 0; break; } straight[i] = ok; }
        // inside a zone: the sharpest line curvature from here to the zone's exit (what a car off the line must meet)
        var kz = new Float32Array(n);
        for (z = 0; z < Z.length; z++) {
          var m = 0, cnt = T.wrap((Z[z].exit - Z[z].b0) * ds) / ds | 0;
          for (q = cnt; q >= 0; q--) { var ii = (Z[z].b0 + q) % n; m = max(m, abs(line.k[ii])); kz[ii] = m; }
        }
        var CO = Array.isArray(T.corners) ? T.corners : [];
        for (z = 0; z < Z.length; z++) {
          var bc = null, bcd = 1e9, a0 = Z[z].b0 * ds - 20, span = T.wrap((Z[z].exit - Z[z].b0) * ds) + 20, mid = Z[z].b1 * ds;
          for (var cc = 0; cc < CO.length; cc++) { var co = CO[cc]; if (T.wrap(co.apex - a0) > span) continue; var dd = abs(T.rel(co.apex, mid)); if (dd < bcd) { bcd = dd; bc = co; } }
          Z[z].corner = bc ? String(bc.id) : ''; Z[z].d0 = Z[z].b0 * ds; Z[z].d1 = Z[z].b1 * ds; Z[z].dx = Z[z].exit * ds;
          // the straight run into the braking point (m): where a tow can build into a pass
          var run = 0; for (q = 1; q < n; q++) { if (abs(line.k[(Z[z].b0 - q + n) % n]) > K.straightK) break; run += ds; }
          Z[z].run = run;
        }
        var cum = new Float64Array(n + 1);
        for (i = 0; i < n; i++) cum[i + 1] = cum[i] + line.ds[i] * 2 / max(1, c1[i] + c1[(i + 1) % n]);
        var Lt = cum[n], nz = new Int16Array(n), tbn = new Float32Array(n), pa = new Uint8Array(n);
        for (i = 0; i < n; i++) {
          var bz = -1, bdz = 1e9;
          for (z = 0; z < Z.length; z++) { var dz2 = T.wrap((Z[z].b0 - i) * ds); if (dz2 > 0.01 && dz2 < bdz) { bdz = dz2; bz = z; } }
          nz[i] = bz; tbn[i] = bz >= 0 ? (cum[Z[bz].b0] - cum[i] + Lt) % Lt : 99;
          var zi = next[i]; if (to[i] === 0 && zi >= 0 && T.wrap((i - Z[zi].b1) * ds) <= T.wrap((Z[zi].exit - Z[zi].b1) * ds)) pa[i] = 1;
        }
        return { list: Z, next: next, to: to, straight: straight, kz: kz, nz: nz, tbn: tbn, pa: pa, lapT: Lt };
      }

      /* ------------------------------------------------------------------------------- the driver ---- */
      // Each step, for every car the AI drives: the grid and the reaction; the target speed (the pace class's ceiling, its
      // slope fed forward; the full profile out of corners); the mind (X30: ATTACK decided ahead and shown, DEFEND one move,
      // TOW, PUSH, SAVE, LEARN; memory of the player); lap-1 mercy (X01); visible mistakes (X09); the persona (X15); the field
      // (lanes relative to the racing line, the gap to the car in its path, the room beside a car alongside, single file
      // where the road says so); a finished car's run-off (X27). The chip (car.mind) is written from the same state the car
      // drives by, and every change of it is an `intent` event. Writes inp, ai, intent, mind, and the events intent, memory,
      // mistake and tow ('pull').
      function driver(T, line, prof, phys, specs, o) {
        o = o || {};
        var P = o.car || phys.CAR, n = T.n, ds = T.ds, CL = K.classes;
        // per pace class: the ceiling (corners and braking only: what it may carry) and the full profile (with the drive
        // limit too: how it gets there out of a corner)
        var C = CL.map(function (p) { return profile(T, line, phys, P, { pace: p, ceiling: true }); });
        // (the race's pace-1 profile is the class-1 entry when it was made for this car on this line)
        var F = CL.map(function (p) { return p === 1 && P === phys.CAR && prof && prof.length === n ? prof : profile(T, line, phys, P, { pace: p }); });
        var FP1 = F[CL.indexOf(1)], ZN = zonesOf(T, line, FP1), ZL = ZN.list, NZ = ZL.length, want = { lat: 0, v: 0, look: 6, a: 0 }, cmd = { steer: 0, throttle: 0, brake: 0 }, PO = {};
        var lat = line.lat, lk = line.k, ROWS = K.rows || {}, NOROW = {};
        var CO = Array.isArray(T.corners) ? T.corners : [];
        function cornerD(id, key, dflt) { for (var q = 0; q < CO.length; q++) if (CO[q].id === id) return CO[q][key]; return dflt; }
        var MERCY_END = cornerD('T2', 'd1', 700) + 20, T5D = cornerD('T5', 'apex', -1);
        var CZ = {}; for (var zc = 0; zc < NZ; zc++) if (ZL[zc].corner && CZ[ZL[zc].corner] == null) CZ[ZL[zc].corner] = zc;
        var T1Z = CZ.T1 != null ? CZ.T1 : -1;
        // the zones' mistakes (X09): lock-ups at the heavy stops (T9 the most), running wide at the quicker exits, a kerb at
        // the slow ones; the big ones at the escape roads (an overshoot) and the tunnel's wall (a brush). A second zone of the
        // same corner weighs less; the crest wobble at T5 (no braking zone) has its own share
        var SLIPW = { T1: 1.5, T4: 1.5, T9: 2.6, T12: 1.5, T15: 1.5, T7: 1, T14: 1, T16: 0.7, T17: 0.7, T13: 0.4, T10: 0.6 };
        var SLIPK = { T1: 1, T4: 1, T9: 1, T12: 1, T15: 1, T16: 3, T17: 3, T13: 3, T7: 2, T14: 2, T10: 2 };
        var BIGW = { T1: 1, T9: 1, T12: 1, T10: 1 }, BIGK = { T1: 4, T9: 4, T12: 4, T10: 5 };
        var MNAME = ['', 'lockup', 'wide', 'kerb', 'overshoot', 'brush', 'wobble'];
        var zsw = new Float64Array(NZ), zbw = new Float64Array(NZ), seenC = {}, SW = 0, BW = 0, WOB = T5D >= 0 ? 0.8 : 0;
        for (zc = 0; zc < NZ; zc++) {
          var cid = ZL[zc].corner, w0 = SLIPW[cid] != null ? SLIPW[cid] : 0.3; if (seenC[cid]) w0 *= 0.3;
          zsw[zc] = w0; SW += w0; zbw[zc] = seenC[cid] ? 0 : BIGW[cid] || 0; BW += zbw[zc]; seenC[cid] = 1;
        }
        SW += WOB;
        function ix(d) { var i = floor(T.wrap(d) / ds); return i >= n ? n - 1 : i; }
        // the ceiling at sample i for an effective pace p (between two classes)
        function ceilAt(i, p) {
          var x = (CL[0] - p) / (CL[0] - CL[1]), c = floor(x); if (c < 0) c = 0; if (c > CL.length - 2) c = CL.length - 2;
          var w = clamp(x - c, 0, 1); return C[c][i] * (1 - w) + C[c + 1][i] * w;
        }
        function fullAt(i, p) {
          var x = (CL[0] - p) / (CL[0] - CL[1]), c = floor(x); if (c < 0) c = 0; if (c > CL.length - 2) c = CL.length - 2;
          var w = clamp(x - c, 0, 1); return F[c][i] * (1 - w) + F[c + 1][i] * w;
        }
        function rowOf(car) { var r = car.spec && car.spec.row; return (r && ROWS[r]) || NOROW; }
        function zeros(k) { var a = []; for (var q = 0; q < k; q++) a.push(0); return a; }
        function init(car) {
          var sp = car.spec || {};
          // (plain data only: the sim snapshots and replays it. mode 0 race, 1 attack, 2 defend; the counters are for the tests)
          return {
            go: 0, react: 0, st: -1, lane: 0, mode: 0, side: 0, tgt: -1, modeT: 0, doorT: 0, cool: 0, zone: -1, defZ: -1,
            bn: 0, ln: 0, lapSeen: -1, pn: 0, defRoll: 1, towRoll: 1, sbsRoll: 1, vt: 0, p: 1, hunt: 0,
            agg: sp.aggression != null ? sp.aggression : 0.5, passes: 0, mistakes: 0, slips: 0, bigs: 0, defends: 0, attacks: 0, pOk: 0, pGone: 0, pDoor: 0, pTuck: 0, lost: 0, frs: 0,
            // the attack (X30): its zone, phase (0 shown, 1 out), the absolute side (+1 right) and whether it is the inside, the
            // chip's step and the predicted braking step, the step it reached that braking point; the last zone it attacked
            az: -1, ph: 0, ins: 0, shown: -1, act: -1, actR: -1, lastAz: -1, dsh: -1, sw: 0,
            // the chip as last shown (state, target, corner, side, since)
            cs: '', ct: -1, cc: '', cd: '', cT: -1,
            // mistakes (X09): the kind waiting in this zone (MNAME), its size, its event sent, the lock-up left (the sim reads
            // lk), the last mistake's time (a gift's), this lap's crest roll and lap, the wobble left
            mk: 0, mkz: -1, late: 0, wide: 0, mke: 0, lk: 0, mt: -1, wob: 1, t5: -1, wobT: 0, mu: 0,
            // memory, the player only (X30): passed by the player at zone z (pm), its attack covered at zone z (cov: the side
            // covered), passed by the player anywhere (pa), the last pass seen, a zone to skip once
            pm: zeros(NZ), cov: zeros(NZ), pa: 0, lps: -1, skip: -1,
            // the persona (X15): the shift point (the sim reads up), PUSH, SAVE, LEARN's clock, the sector bests and the last
            // seen, the lap after being passed (waypoint), the grid column (mercy), a finished car's side
            up: 0, push: 0, save: 0, learnT: 0, sb0: 1e9, sb1: 1e9, ssn: -1, wpl: -1, gl: 0, fside: 0, mercy: 0
          };
        }
        function lapsOf(S) { return S.race && S.race.laps ? S.race.laps : o.laps || 3; }
        // consistency this lap: a learner's grows to its cEnd by the last lap (X15)
        function consOf(car, done, S) {
          var sp = car.spec || {}, c0 = clamp(sp.consistency != null ? sp.consistency : 0.85, 0, 1), R = rowOf(car), Lp = lapsOf(S);
          if (R.cEnd != null && Lp > 1) c0 += (R.cEnd - c0) * clamp(done / (Lp - 1), 0, 1);
          return c0;
        }
        function effPace(car, A, S) {
          var sp = car.spec || {}, p = sp.pace != null ? sp.pace : 1, arc = sp.arc, done = max(0, car.lap | 0), Lp = lapsOf(S), R = rowOf(car);
          // (a numeric arc: percent of pace per lap, x arcScale over 3 laps, centred on the race: a learner ragged on lap 1 and
          // sharp on the last, a fader the other way)
          if (typeof arc === 'number' && arc) p *= 1 + clamp(arc, -1, 1) * K.arcScale / 100 * (done - (Lp - 1) / 2);
          if (R.lap1 && done === 0) p *= 1 + R.lap1;
          if (R.lap2 && done === 1 && Lp > 2) p *= 1 + R.lap2;
          if (A.push) p += K.lateBoost;
          if (R.recalc && A.wpl === done) p *= 1 - R.recalc;
          return clamp(p + A.pn, CL[CL.length - 1], CL[0]);
        }
        // per lap: pace noise and the crest's roll; per braking zone: braking-point and line noise, a mistake (X09), the
        // defence, tow and dive rolls. A fixed count of numbers each time, from the AI's own stream
        function rolls(car, A, S, z) {
          var r = S.rng.ai, done = car.lap | 0, Cn = consOf(car, done, S);
          if (done !== A.lapSeen) { A.lapSeen = done; A.pn = -abs(gauss(r)) * K.paceSigma * (1 - Cn); A.wob = r.next(); }
          if (z !== A.zone) {
            // (a new braking zone: its own defence, so the one move is per zone each lap, not per zone each race)
            A.zone = z; A.defZ = -1;
            A.bn = abs(gauss(r)) * K.brakeSigma * (1 - Cn);
            A.ln = gauss(r) * K.lineSigma * (1 - Cn);
            var uS = r.next(), uB = r.next(), uM = r.next();
            A.defRoll = r.next(); A.towRoll = r.next(); A.sbsRoll = r.next();
            A.mk = 0; A.mke = 0; A.mkz = z; A.late = 0; A.wide = 0; A.mu = uM;
            if (S.phase === 'race' && z >= 0 && !car.fin && !A.mercy) {
              var cid = ZL[z].corner, pB = BW > 0 ? K.big * (1 - Cn) * (1 - Cn) * zbw[z] / BW : 0, pS = K.slip * (1 - Cn) * zsw[z] / SW;
              if (uB < pB) { A.mk = BIGK[cid] || 4; if (A.mk === 4) A.late = K.overLate[0] + (K.overLate[1] - K.overLate[0]) * uM; else A.wide = K.brushLane; }
              else if (uS < pS) {
                A.mk = SLIPK[cid] || 2;
                if (A.mk === 1) { A.late = K.lockLate[0] + (K.lockLate[1] - K.lockLate[0]) * uM; A.wide = 0.8; }
                else if (A.mk === 2) A.wide = K.wide[0] + (K.wide[1] - K.wide[0]) * uM;
              }
            }
          }
        }
        function mistakeEv(S, car, A, kind, tier, corner) {
          A.mt = S.t; A.mistakes++; if (tier === 'big') A.bigs++; else A.slips++;
          S.events.push({ e: 'mistake', t: S.t, car: car.n, tier: tier, kind: kind, corner: corner });
        }
        // lanes are offsets from the racing line (m, + right): two cars on the line are in the same lane even where the
        // line crosses the road (a chicane), so "alongside" and "in my lane" are judged on lanes, not on lat
        function laneOf(o2) { return o2.lat - lat[o2.i]; }
        // where a car's lane will be shortly: its sideways speed off the line's own drift (for the path check)
        function laneSoon(o2, t) {
          T.pose(o2.d, PO);
          var psi = angDiff(o2.h, PO.h), vl = o2.v * Math.sin(psi) + (o2.vlat || 0) * Math.cos(psi);
          var i2 = o2.i, sl = (lat[(i2 + 8) % n] - lat[i2]) / (8 * ds) * o2.v;
          return laneOf(o2) + clamp(vl - sl, -6, 6) * t;
        }
        function angDiff(a, b) { var d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d <= -Math.PI) d += 2 * Math.PI; return d; }
        // (a car that has taken the flag and a car still racing never meet: X27)
        function other(car, o2) { return o2 !== car && !!o2.fin === !!car.fin; }
        // the field around a car (read-only): the nearest ahead in its path (any lane from lo to hi, its own lane now or soon
        // within a car's width and a little), the nearest ahead within K.wideLane of the path (a braking zone's hazard), and
        // the nearest behind
        var near = { ah: -1, ahR: 1e9, bh: -1, bhR: 1e9, wd: -1, wdR: 1e9 };
        // (exT: the car this one is pulling out past, which is no longer in its path once they are passClear m apart across)
        function scan(S, car, lo, hi, soon, exT) {
          near.ah = -1; near.ahR = 1e9; near.bh = -1; near.bhR = 1e9; near.wd = -1; near.wdR = 1e9;
          var cars = S.cars, w = K.sep - 0.1;
          for (var q = 0; q < cars.length; q++) {
            var o2 = cars[q]; if (!other(car, o2)) continue;
            var r = T.rel(o2.d, car.d);
            if (r > 0 && r < 160) {
              if (q === exT && r > K.along * 0.5 && abs(o2.lat - car.lat) >= K.passClear) continue;
              var l2 = laneOf(o2), dl = l2 < lo ? lo - l2 : l2 > hi ? l2 - hi : 0;
              if (soon && dl >= w && r < 40) { var l3 = laneSoon(o2, 0.4); dl = min(dl, l3 < lo ? lo - l3 : l3 > hi ? l3 - hi : 0); }
              if (dl < w && r < near.ahR) { near.ah = q; near.ahR = r; }
              if (dl < K.wideLane && r < near.wdR) { near.wd = q; near.wdR = r; }
            }
            if (r < 0 && -r < 160 && -r < near.bhR) { near.bh = q; near.bhR = -r; }
          }
        }
        // never steer into an overlap: keep the lane clear of every car alongside (lo, hi: the lanes left free)
        var room = { lo: -1e9, hi: 1e9 };
        function clear(S, car, lane, sep) {
          var cars = S.cars, lo = -1e9, hi = 1e9, me = laneOf(car);
          for (var q = 0; q < cars.length; q++) {
            var o2 = cars[q]; if (!other(car, o2)) continue;
            // (a car mostly behind, its nose short of this one's middle, is that car's to avoid: the car ahead keeps its line)
            var r = T.rel(o2.d, car.d); if (r > K.along || r < -K.behind) continue;
            var ol = laneOf(o2), dl = ol - me;
            if (abs(dl) < 0.5) continue;                    // nose to tail: the gap rule's job
            if (dl > 0) hi = min(hi, ol - sep); else lo = max(lo, ol + sep);
          }
          room.lo = lo; room.hi = hi;
          if (lo > hi) return me;                            // boxed in on both sides: hold the lane
          return clamp(lane, lo, hi);
        }
        // the chip (X30): the state the car drives by, written to car.mind; a change is an `intent` event
        function chip(S, car, A, st, tgt, corner, side, ins, shown, act) {
          var m = car.mind;
          if (!m || m.state == null) m = car.mind = { state: 'RACE', target: -1, corner: '', side: '', inside: 0, shownStep: -1, actStep: -1, z: -1 };
          if (st !== A.cs || tgt !== A.ct || corner !== A.cc || side !== A.cd) {
            A.cs = st; A.ct = tgt; A.cc = corner; A.cd = side; A.cT = S.steps;
            S.events.push({ e: 'intent', t: S.t, car: car.n, state: st, target: tgt, corner: corner, side: side, shownStep: shown >= 0 ? shown : S.steps, actStep: act });
          }
          m.state = st; m.target = tgt; m.corner = corner; m.side = side; m.inside = ins; m.shownStep = shown >= 0 ? shown : A.cT; m.actStep = act; m.z = st === 'ATTACK' ? A.az : -1;
          car.intent = st === 'RACE' ? '' : st.toLowerCase();
        }
        function drive(S, H) {
          var cars = S.cars, racing = S.phase === 'race' || S.phase === 'cooldown' || S.phase === 'done', Lp = lapsOf(S);
          for (var c = 0; c < cars.length; c++) {
            var car = cars[c]; if (!car.auto) continue;
            var A = car.ai; if (!A || A.go == null || A.pm == null) A = car.ai = init(car);
            var R = rowOf(car), sp = car.spec || {};
            // (back under the AI after a gap, the autopilot switched on again: it starts from where the car is)
            if (A.st !== S.steps - 1 && A.go === 2) { A.lane = car.lat - lat[car.i]; A.mode = 0; }
            A.st = S.steps;
            if (A.lk > 0) A.lk = max(0, A.lk - H);
            var inp = car.inp; inp.flap = false; inp.up = false; inp.down = false;
            // the grid and the lights: BRAKE held (armed: the launch control holds the band) and revving; then the
            // reaction to lights out (the rules launch the car on the first step its BRAKE is let go: X29)
            if (!racing || !S.go || car.held) { inp.steer = 0; inp.throttle = S.phase === 'lights' ? 0.45 : 0.2; inp.brake = 1; A.up = 0; chip(S, car, A, 'RACE', -1, '', '', 0, -1, -1); continue; }
            if (A.go === 0) { A.go = 1; A.react = max(K.reactMin + H * 0.5, (sp.start != null ? sp.start : 230) / 1000 + gauss(S.rng.ai) * K.react) - H * 0.5; A.lane = car.lat - lat[car.i]; A.gl = car.lat; }
            if (A.go === 1) { A.react -= H; if (A.react > 0) { inp.steer = 0; inp.throttle = 0.45; inp.brake = 1; continue; } A.go = 2; }
            var v = max(0, car.v), i = car.i, z = ZN.next[i], Zz = ZN.list[z], toB = ZN.to[i], fin = !!car.fin, done = car.lap | 0;
            var finalLap = Lp > 1 && done === Lp - 1 && !fin;
            // lap-1 mercy at Origin (X01): until past T2 on lap 1
            A.mercy = !fin && done === 0 && car.prog < MERCY_END ? 1 : 0;
            rolls(car, A, S, z);
            // memory (X30): passed by the player at a corner (the rules' lastPass on this car)
            var lp = car.lastPass;
            if (lp && lp.t !== A.lps) {
              A.lps = lp.t;
              if (R.recalc) A.wpl = done + 1;
              if (S.human >= 0 && lp.by === S.human) {
                var zp = CZ[lp.corner]; if (zp != null) A.pm[zp] = 1; A.pa = 1;
                S.events.push({ e: 'memory', t: S.t, car: car.n, corner: lp.corner, change: R.mem === 'inside' ? 'inside' : R.mem === 'exact' ? 'exact' : 'defend' });
              }
            }
            // the shift point (X15): the limiter personas, Daemon's short-shift until its push
            A.up = R.towSit ? (finalLap ? R.upLast : R.upEarly) : R.up || 0;
            // the pursuit point: lookK * v ahead, nearer in a tight bend (a long chord cuts across the inside)
            var kmx = max(abs(lk[i]), abs(lk[ix(car.d + 10)]), abs(lk[ix(car.d + 20)]));
            var look = max(K.lookMin, min(K.lookK * v, kmx > 1e-4 ? K.lookR / kmx : 1e9)), jl = ix(car.d + look);
            // the field: who is ahead and behind (for PUSH and the attack)
            var cur = laneOf(car);
            scan(S, car, min(cur, A.lane), max(cur, A.lane), false);
            var ah = near.ah >= 0 ? cars[near.ah] : null, gapS = ah ? near.ahR / max(v, 10) : 1e9;
            var bh = near.bh >= 0 ? cars[near.bh] : null, gapB = bh ? near.bhR / max(bh.v, 10) : 1e9;
            // PUSH on the final lap (X08): the late personas, and anyone with a car within pushBehind s behind (held for the lap)
            if (finalLap) { if (!A.push && (R.push || (typeof sp.arc === 'string' && /^late:\d+$/.test(sp.arc)) || gapB < K.pushBehind)) A.push = 1; } else A.push = 0;
            var p = fin ? 1 : effPace(car, A, S);
            // the target speed: the pace's ceiling K.look s ahead (earlier by the braking noise and the mercy at T1 on lap 1;
            // later on a late brake: a lock-up or an overshoot waiting in this zone)
            var mkHere = A.mk && A.mkz === z && z >= 0 && !fin;
            var late = mkHere && (A.mk === 1 || A.mk === 4) && toB > 0 ? A.late : 0;
            var early = A.mercy && z === T1Z ? K.mercyEarly : 0;
            var j = ix(car.d + max(2, v * K.look + A.bn + early - late)), cJ = ceilAt(j, p), vt = min(cJ, ceilAt(i, p) + 0.5), ff = 0, onF = false;
            if (vt < v + 1) { var c1 = ceilAt((j + K.ffN) % n, p); if (c1 < cJ) ff = v * (c1 - cJ) / (K.ffN * ds); }   // braking: the ceiling's slope, fed forward
            else {
              // out of a corner, at or under the full profile: follow it with its own acceleration (traction, then power)
              // (not in a tow, an attack or with the Flap open: there the slipstream's and the Flap's extra speed is the point,
              // so the throttle stays open, inside the traction cap below)
              var fa = fullAt(i, p), fb = fullAt((i + K.ffN) % n, p);
              if (v <= fa + 0.5 && fb > fa && !(A.hunt || A.mode === 1 || (car.draft || 0) > 0.05 || (car.flap && car.flap.open))) { vt = min(vt, fb); ff = (fb * fb - fa * fa) / (2 * K.ffN * ds); onF = true; }
            }
            // a finished car (X27): the run-off at finPace of the pace-1 profile
            if (fin) { var vf = K.finPace * FP1[j]; if (vf < vt) { vt = vf; ff = min(ff, 0); onF = false; } }
            // a chicane: a little under the limit, so a slip has room (the AI's; the player's own car on the autopilot drives
            // it at the limit, as the lap model does: fix 15 Oct)
            if (Zz && Zz.sbend && toB === 0 && car.n !== S.human) vt *= K.sMargin;
            if (mkHere && (A.mk === 2 || A.mk === 1) && toB === 0 && Zz && ZN.pa[i]) vt *= 0.96;   // catching it
            // ---- mistakes you can see (X09), when they happen (the event as it shows)
            var inBr = Zz && toB === 0 && !ZN.pa[i];
            if (mkHere && !A.mke) {
              var cn = Zz ? Zz.corner : '';
              if ((A.mk === 1 || A.mk === 4) && toB === 0) { A.mke = 1; A.lk = A.mk === 1 ? K.lockT[0] + (K.lockT[1] - K.lockT[0]) * A.mu : 0.6; mistakeEv(S, car, A, MNAME[A.mk], A.mk === 4 ? 'big' : 'slip', cn); }
              else if (A.mk === 2 && toB === 0 && ZN.pa[i]) { A.mke = 1; mistakeEv(S, car, A, 'wide', 'slip', cn); }
              else if (A.mk === 3 && inBr) { A.mke = 1; mistakeEv(S, car, A, 'kerb', 'slip', cn); }
              else if (A.mk === 5 && toB === 0) { A.mke = 1; mistakeEv(S, car, A, 'brush', 'big', cn); }
            }
            // the crest wobble (T5, no braking zone): its own roll each lap; Glitch's far more often
            if (T5D >= 0 && !fin && !A.mercy && S.phase === 'race' && A.t5 !== done && T.rel(T5D, car.d) < 30 && T.rel(T5D, car.d) > 0) {
              A.t5 = done;
              var pw = K.slip * (1 - consOf(car, done, S)) * WOB / SW * (R.wobble || 1);
              if (A.wob < pw) { A.wobT = K.wobT; mistakeEv(S, car, A, 'wobble', 'slip', 'T5'); }
            }
            if (A.wobT > 0) A.wobT = max(0, A.wobT - H);
            // the escape road (an overshoot): a speed cap there, and the strike is the rules'
            if (mkHere && A.mk === 4 && A.mke && car.surf >= 2) { var ve = K.escapeV; if (ve < vt) { vt = ve; ff = min(ff, 0); onF = false; } }
            // where it wants to be across the road (absolute lat at the look point)
            var aggr = A.agg;
            if (A.mercy) aggr *= K.mercyAgg;
            if (finalLap && (R.aggLast || (typeof sp.arc === 'string' && /^late:\d+$/.test(sp.arc)))) aggr = max(aggr, R.aggLast || 0.9);
            if (finalLap && ah && gapS < K.pushAhead) aggr = min(1, aggr + K.pushAgg);
            var wantLane = A.ln, intent = '';
            // (the start's one move: on lap 1, the grid column until mercyFile m before T1's braking point; then onto the line,
            // single file, below)
            var funnel = A.mercy && z === T1Z && (toB < K.mercyFile && (toB > 0 || !ZN.pa[i]));
            if (A.mercy && !funnel && (z === T1Z ? toB > 0 : car.prog < 0 || T.wrap(car.d) > T.L / 2)) wantLane = A.gl - lat[jl];
            var hw = T.hwAt(car.d + look), lim = max(0.2, hw - K.edge);
            if (fin) { A.mode = 0; if (!A.fside || lat[jl] * A.fside > 1.5) A.fside = lat[jl] > 0 ? -1 : 1; wantLane = A.fside * K.finLane; }
            A.cool = max(0, A.cool - H);
            if (A.lost == null) { A.lost = 0; A.frs = 0; }
            // (held up by that car itself, not by the queue: a car ahead that is held up in its turn is not the one to race)
            var fr = !fin && A.lost > K.frustrate && !(ah && ah.auto && ah.ai && (ah.ai.lost || 0) > K.frustrate * K.frQueue);
            // ---- TOW: on a straight, within the attack window (or the tow window, as often as its tow knob says) of the car
            // ahead in its path: into the slipstream (in while the gap is under the window, kept until holdTow s)
            var towK = sp.tow != null ? sp.tow : 0.5, aWin = K.attack0 + K.attackA * aggr;
            var hc = ah && !ah.held && !ah.fin && ZN.straight[i] && toB > K.passFrom && A.mode === 0 && !fin && !A.mercy;
            var hunt = hc && (gapS < aWin || (fr && gapS < K.frAttack) || (gapS < K.tow && A.towRoll < towK) || (A.hunt && gapS < K.holdTow));
            A.hunt = hunt ? 1 : 0;
            if (hunt) { wantLane = fr ? A.ln : clamp(laneOf(ah), -K.towLane, K.towLane); intent = 'tow'; }
            // ---- ATTACK (X30): decided in the window decMin..decMax s before the next braking point (past the apex of the zone
            // it is in, or before any), on the car ahead in its path within the attack window and closing; the side by the room
            // and the cover (memory: covered there before, the other side); shown at once, the move's braking point after it
            var zA = ZN.nz[i], tbA = ZN.tbn[i];
            if (!fin && !A.mercy && A.mode === 0 && A.cool <= 0 && ah && !ah.held && !ah.fin && zA >= 0 && tbA >= K.decMin && tbA <= K.decMax && (toB > 0 || ZN.pa[i]) &&
                zA !== A.skip && !(R.towSit && !finalLap) && !(R.mem === 'noRepeat' && zA === A.lastAz)) {
              // (the move is on when the tow can bring it alongside by the braking point: the gap it would have there, closing as
              // it is now and gaining the slipstream's share of the drag, within a dive's reach)
              var cl0 = v - ah.v, clos = cl0 > 0.3 || ((car.draft || 0) > 0.3 && cl0 > -1), aT = P.draftCut * max(0.4, car.draft || 0) * P.kd * v * v;
              var tbe = max(0, tbA - 0.3), onIt = near.ahR - max(0, cl0) * tbe - 0.5 * aT * tbe * tbe < (fr ? K.diveFr : K.dive) + 4;
              var Zn = ZL[zA], towOK = Zn.run >= K.runMin && ZN.straight[i] && tbA >= K.decTow && onIt, diveOK = fr && A.lost >= K.frDive && !Zn.sbend && Zn.v0 - Zn.v1 >= K.diveDrop && near.ahR < K.diveDec && tbA <= K.diveTb && cl0 > K.diveClo;
              if (clos && (towOK || diveOK) && (gapS < aWin || (fr && gapS < K.frAttack))) {
                var insd = Zn.side, tlim = max(0.2, T.hwAt(ah.d) - K.edge);
                var roomIn = insd > 0 ? tlim - ah.lat : ah.lat + tlim, roomOut = insd > 0 ? ah.lat + tlim : tlim - ah.lat;
                var pref = ah.n === S.human && A.cov[zA] === insd ? -insd : insd, side = 0;
                if (!towOK) pref = insd;   // (a dive is down the inside or nothing)
                if ((pref === insd ? roomIn : roomOut) >= K.passLat) side = pref; else if (towOK && (pref === insd ? roomOut : roomIn) >= K.passLat) side = -pref;
                if (side) {
                  A.mode = 1; A.ph = 0; A.side = side; A.ins = side === insd ? 1 : 0; A.tgt = near.ah; A.az = zA; A.shown = S.steps; A.act = S.steps + round(tbA / H); A.sw = 0;
                  A.actR = -1; A.modeT = 0; A.doorT = 0; A.attacks++; A.passes++; A.lastAz = zA; A.skip = -1;
                }
              }
            }
            if (A.mode === 1) {
              var tg = cars[A.tgt], rt = T.rel(tg.d, car.d), Za = ZL[A.az], inAz = z === A.az, toBa = inAz ? toB : T.wrap(Za.d0 - car.d);
              A.modeT += H;
              if (A.actR < 0 && inAz && toB === 0) A.actR = S.steps;
              // (the room beside the target on each side, now and where its sideways speed puts it in a second: a car following
              // the line across a straight is not a door shutting)
              T.pose(tg.d, PO);
              var tps = angDiff(tg.h, PO.h), tlat1 = tg.lat + clamp(tg.v * Math.sin(tps) + (tg.vlat || 0) * Math.cos(tps), -8, 8) * K.roomT;
              var tlim2 = max(0.2, T.hwAt(tg.d) - K.edge), tl1 = clamp(tlat1, -tlim2, tlim2);
              var proom = A.side > 0 ? tlim2 - max(tg.lat, tl1) : min(tg.lat, tl1) + tlim2, oroom = A.side > 0 ? min(tg.lat, tl1) + tlim2 : tlim2 - max(tg.lat, tl1);
              if (proom >= K.passLat - 0.3) A.doorT = 0;
              var gone = A.actR >= 0 && !inAz;
              if (rt < -(K.along + 2)) { A.mode = 0; A.pOk++; A.lost = 0; }                                   // clear: done
              else if (A.mercy) { A.mode = 0; A.pGone++; }
              else if (A.ph === 0 && inAz && toBa < 20) { A.mode = 0; A.pTuck++; A.cool = K.cool; }          // still in the tow at the braking point: the move was not on
              else if (gone || rt > 30 || A.modeT > 14 || tg.fin || tg.held) { A.mode = 0; A.pGone++; A.cool = K.cool; }   // the corner went by, or it fell back
              else if (A.ph === 0) {
                // shown, still in the tow: covered before the move (the door shut on that side), the other side or give it up
                // (and remember it, the player only); else out once the chip has shown showMin s and it is close and closing
                wantLane = clamp(laneOf(tg), -K.towLane, K.towLane); intent = 'attack';
                // (far from the braking point, before the cover counts: the side with the room, freely)
                if (toBa >= K.doorZone && proom < K.passLat - 0.3 && oroom >= K.passLat) { A.side = -A.side; A.ins = A.side === Za.side ? 1 : 0; A.doorT = 0; }
                else if (toBa < K.doorZone && proom < K.passLat - 0.3 && (A.doorT += H) > 0.25) {
                  if (tg.n === S.human) { A.cov[A.az] = A.side; S.events.push({ e: 'memory', t: S.t, car: car.n, corner: Za.corner, change: oroom >= K.passLat && R.mem !== 'noRepeat' ? 'side' : 'corner' }); }
                  if (oroom >= K.passLat && R.mem !== 'noRepeat') { A.side = -A.side; A.ins = A.side === Za.side ? 1 : 0; A.doorT = 0; }
                  else { A.mode = 0; A.pDoor++; A.cool = K.cool; if (tg.n === S.human) A.skip = A.az; }
                } else {
                  var clo = v - tg.v, cmt = fr ? K.commitFr : K.commitMin;
                  // (M1's commit: close in the tow and closing; or, held up, the lunge down the inside into the braking zone)
                  // (out of the tow when it is about to reach the car ahead (pullTtc s to its gearbox at this closing speed), or
                  // when the braking point is near and it is within reach)
                  if ((S.steps - A.shown) * H >= K.showMin - 1e-9 && proom >= K.passLat - 0.3 && ((clo > K.closing && (near.ahR - K.gapTow + 1) / clo < K.pullTtc) || near.ahR < cmt ||
                      (toBa < v * K.pullNear && near.ahR < cmt + K.commitV * max(0, clo)) ||
                      (A.ins && fr && !Za.sbend && toBa < K.diveFrom && near.ahR < K.diveIn))) {
                    A.ph = 1; A.doorT = 0; S.events.push({ e: 'tow', t: S.t, a: car.n, b: A.tgt, state: 'pull' });
                  }
                }
              } else {
                // (far down a long straight the door does not matter yet: the attacker holds its side, faster, and the room rule
                // keeps it beside the car; the door is judged from doorZone m before the braking point)
                var doorOn = toBa < K.doorZone;
                if (!doorOn) A.doorT = 0;
                if (doorOn && rt > 4 && proom < K.passLat - 0.3 && oroom >= K.passLat && A.doorT > K.doorT * 0.5 && !A.sw && (fr || v - tg.v > 2)) { A.side = -A.side; A.ins = A.side === Za.side ? 1 : 0; A.doorT = 0; A.sw = 1; }   // the door shut, closing (or held up): the other side, once
                else if (doorOn && rt > 4 && proom < K.passLat - 0.3 && (A.doorT += H) > (fr ? K.doorFr : K.doorT)) { A.mode = 0; A.pDoor++; A.cool = K.cool; if (tg.n === S.human) { A.cov[A.az] = A.side; S.events.push({ e: 'memory', t: S.t, car: car.n, corner: Za.corner, change: 'side' }); } }   // the door shut (and stayed shut)
                else if (inAz && toBa < max(40, abs(A.lane) / K.laneRate * v * K.tuckK) && rt > (Za.sbend ? -K.along : 2) && !(!Za.sbend && A.ins && (fr ? rt < K.diveFr : rt < K.dive && A.sbsRoll < 0.3 + 0.7 * aggr * aggr))) { A.mode = 0; A.pTuck++; A.cool = K.cool; }   // not alongside on the inside in time for the braking point, or not clear before a chicane: tuck in
                else { wantLane = laneOf(tg) + A.side * K.passLat; intent = 'attack'; }
              }
            }
            // ---- DEFEND: one move toward the inside, defendFrom m or more before the braking point; against the player, more
            // likely where it was passed before (memory, the persona's flavour); never on lap 1 before T2 (mercy)
            if (!fin && A.mode !== 1 && Zz && !A.mercy) {
              // (held into the corner: the defence ends at the apex, never by cutting back across in the braking zone)
              // (into a chicane the defence ends at the braking point, so the car brakes from its own line)
              if (A.mode === 2 && (A.defZ !== z || (toB === 0 && (Zz.sbend || T.wrap((i - Zz.b0) * ds) > T.wrap((Zz.b1 - Zz.b0) * ds))))) A.mode = 0;
              else if (A.mode === 0 && bh && A.defZ !== z && near.bhR > K.along && gapB < K.defend && bh.v > v - 0.3 && toB >= K.defendFrom && toB <= K.defendTo) {
                var Dp = sp.defend != null ? sp.defend : 0.5;
                if (bh.n === S.human) { if (A.pm[z]) Dp = R.mem === 'exact' ? 1 : min(K.defendCap, Dp + K.defendMem); if (R.mem === 'inside' && A.pa) Dp = max(Dp, K.defendCap); }
                if (A.defRoll < Dp) { A.mode = 2; A.defZ = z; A.defends++; A.dsh = S.steps; A.tgt = near.bh; }
              }
              if (A.mode === 2) { wantLane = Zz.side * K.defLane; intent = 'defend'; }
            }
            // ---- mistakes on the lane: running wide at the exit, the inside kerb, the tunnel wall
            var brush = mkHere && A.mk === 5 && A.mke && inBr;
            if (mkHere && A.mke && (A.mk === 2 || A.mk === 1) && Zz && toB === 0 && ZN.pa[i]) wantLane += -Zz.side * A.wide;
            if (mkHere && A.mk === 3 && inBr) wantLane += Zz.side * 1.2;
            if (brush) wantLane += -Zz.side * A.wide;
            // ---- SAVE (Hedge alone: lift and coast; Ponder's first lap), LEARN (a learner's better sector)
            A.save = !fin && A.mode === 0 && !hunt && ((R.coast && gapS > K.saveGap && gapB > K.saveGap) || (R.save1 && done === 0)) ? 1 : 0;
            if (R.learn && !fin && car.sectors) {
              var key = done * 2, s0 = car.sectors[0], s1 = car.sectors[1];
              if (s0 != null && A.ssn < key) { A.ssn = key; if (A.sb0 < 1e8 && s0 < A.sb0 - K.learnGain) A.learnT = K.learnT; A.sb0 = min(A.sb0, s0); }
              if (s1 != null && A.ssn < key + 1) { A.ssn = key + 1; if (A.sb1 < 1e8 && s1 < A.sb1 - K.learnGain) A.learnT = K.learnT; A.sb1 = min(A.sb1, s1); }
            }
            if (A.learnT > 0) A.learnT = max(0, A.learnT - H);
            // the lane moves at a limited rate, out quicker than back
            var rate = A.mode === 1 && A.ph === 1 ? K.laneOut : abs(wantLane) > abs(A.lane) ? K.laneRate : A.mode === 0 && toB < 150 ? K.laneRate : K.laneBack;
            A.lane += clamp(wantLane - A.lane, -rate * H, rate * H);
            A.lane = clear(S, car, A.lane, A.mercy ? K.mercySep : K.sep);
            var limL = brush ? max(lim, T.hwAt(car.d + look) + 0.6) : lim, Lx = clamp(lat[jl] + A.lane, -limL, limL);
            A.lane = Lx - lat[jl];
            // off the line costs corner speed (the line is the fastest way through): the inside is a tighter arc, the
            // outside a longer one that meets the next corner out of step; the target lane or where the car is, the worse
            // (a dive down the inside brakes on its own line: the zone's sharpest curvature counts only when not attacking)
            var kl = max(abs(lk[jl]), abs(lk[i]), toB === 0 && A.mode !== 1 ? ZN.kz[i] : 0), dln = max(abs(Lx - lat[jl]), abs(car.lat - lat[i]));
            if (!fin) vt *= sqrt(clamp(1 - K.offLine * kl * dln, 0.3, 1));
            // ---- the gap: never drive into the car ahead in its path (its lane now and where it is going, and where the car
            // ahead is moving to). (A.vb: which rule set the speed last, for the tests: 0 none, 2 tight corner, 3 single file,
            // 4 a car across into a braking zone, 10 + n the gap to car n)
            A.vb = 0;
            var cur2 = laneOf(car);
            scan(S, car, min(cur2, A.lane), max(cur2, A.lane), true, A.mode === 1 && A.ph === 1 ? A.tgt : -1);
            if (near.ah >= 0 && K.dirty > 0 && abs(lk[jl]) > 1 / 150) vt *= 1 - K.dirty * Math.exp(-near.ahR / K.dirtyLen);
            if (near.ah >= 0) {
              var o3 = cars[near.ah], towing = hunt || A.mode === 1, g0 = towing ? K.gapTow : fr && toB > max(40, v * K.gapFrT) ? K.gapFr + K.gapFrV * v : K.gap0 + K.gapV * v, r3 = near.ahR, vg = max(0, o3.v + (r3 - g0) * 0.9);
              // in the tow on a straight it may close at speed, until it is about to touch (time to contact under ttcTow), and
              // never on a car that is braking, or closing faster than it could stop behind it with half its brakes
              var clv = v - o3.v, aNeed = clv > 0 ? clv * clv / (2 * max(0.5, r3 - K.gapMin)) : 0;
              if (towing && r3 > K.gapTow && (clv <= 0 || r3 / clv > K.ttcTow) && (+o3.ax || 0) > -4 && aNeed < 0.5 * phys.brakeMax(P, v, 0)) vg = 1e9;
              if (r3 < K.along) vg = min(vg, max(0, o3.v - 3));
              // a safe following speed (Gipps), off by default (safeB 0): able to stop behind where the car ahead would stop
              if (K.safeB > 0) {
                var bF = K.safeB * phys.brakeMax(P, v, 0), aL = max(bF, -(o3.ax || 0)), gs0 = r3 - K.gapMin;
                var vsafe = sqrt(max(0, 2 * bF * gs0 + o3.v * o3.v * bF / aL));
                if (vsafe < vg) vg = vsafe;
              }
              // into a braking zone (the last safeZone m, and through it to the apex), never closer than it could stop behind the car
              // ahead if that one braked as hard as a car can now (a Gipps safe speed at safeF of its own brakes): the tow ends
              // with a gap, so a later braker behind never runs into an earlier one ahead
              if (!towing && (toB < K.safeZone || (toB === 0 && !ZN.pa[i])) && r3 < 120) {
                var bS = K.safeF * phys.brakeMax(P, v, 0), aLd = phys.brakeMax(P, o3.v, 0), vs2 = sqrt(max(0, 2 * bS * (r3 - K.safeGap) + o3.v * o3.v * bS / aLd));
                if (vs2 < vg) vg = vs2;
              }
              // and never faster than it can still stop behind a slower car ahead in its path at kinF of its brakes, from however far
              // (a queue crawling into a chicane, a car that has stopped): the gap rule's reach grows with the closing speed
              // (a car in a tow closes on purpose: for it, only a big closing speed or a braking car ahead)
              var vk = sqrt(o3.v * o3.v + 2 * K.kinF * phys.brakeMax(P, v, 0) * max(0, r3 - K.gapMin)), kin = v > o3.v && vk < vt && (!towing || v - o3.v > K.kinClo || (+o3.ax || 0) < -4);
              if (kin && vk < vg) vg = vk;
              if ((r3 < g0 + 25 || kin) && vg < vt) { vt = vg; ff = min(ff, 0, (+o3.ax || 0) * K.brLead); onF = false; A.vb = 10 + near.ah; }
            }
            // in a tight corner, a car level or just ahead and too close across has the corner: this one drops in behind it
            if (abs(lk[i]) > K.tightK) {
              for (var q6 = 0; q6 < cars.length; q6++) {
                var o6 = cars[q6]; if (!other(car, o6)) continue;
                var r6 = T.rel(o6.d, car.d);
                if ((r6 > 0.5 || (r6 > -0.5 && q6 < c)) && r6 < K.along + 2 && abs(o6.lat - car.lat) < K.sep + 1) { var v6 = max(K.singleMin, o6.v - 1); if (v6 < vt) { vt = v6; ff = min(ff, 0); onF = false; A.vb = 2; } }
              }
            }
            // a chicane, and any slow corner (its apex under tightV m/s), is single file: into one, a car level with or just
            // ahead of this one (any lane) has it and this one gives way; never the car this one is diving past (the target
            // leaves it a car's width: the room rule)
            if (funnel || (Zz && (Zz.sbend || (K.tightV > 0 && Zz.v1 < K.tightV)) && toB < K.single && (toB > 0 || T.wrap((i - Zz.b0) * ds) < T.wrap((Zz.b1 - Zz.b0) * ds)))) {
              for (var q5 = 0; q5 < cars.length; q5++) {
                var o5 = cars[q5]; if (!other(car, o5)) continue;
                if (A.mode === 1 && A.ph === 1 && A.tgt === q5 && !Zz.sbend) continue;
                var r5 = T.rel(o5.d, car.d);
                // (the one behind gives way, keeping fileGap m; dead level, the higher index does, so two never wait for each other)
                if ((r5 > 0 || (r5 === 0 && q5 < c)) && r5 < K.fileGap + 6 && abs(o5.lat - car.lat) < K.fileLat) {
                  var v5 = max(K.singleMin, min(o5.v - 1.5, o5.v + (r5 - K.fileGap) * (funnel ? K.fileKM : K.fileK)));
                  if (v5 < vt) { vt = v5; ff = min(ff, 0); onF = false; A.vb = 3; }
                }
              }
            }
            // a car ahead a lane or so across, much slower, into a braking zone (it may come across): keep the gap to it too
            // (not the car this one is passing, a car's width and more across: that is the door rule's job)
            if (near.wd >= 0 && near.wd !== near.ah && toB < 200 && !(A.mode === 1 && near.wd === A.tgt && abs(laneOf(cars[near.wd]) - A.lane) >= K.sep - 0.3)) {
              var o4 = cars[near.wd], r4 = near.wdR, cl4 = v - o4.v;
              if (cl4 > 2 && r4 / cl4 < K.ttc) { var vw = max(0, o4.v + (r4 - (K.gap0 + K.gapV * v)) * 0.9); if (vw < vt) { vt = vw; ff = min(ff, 0); onF = false; A.vb = 4; } }
            }
            // GIVE IT BACK (the rules asked this car): lift until the car it passed by cutting is back by
            var gb = S.race && S.race.gb;
            if (gb && gb.length) for (var g7 = 0; g7 < gb.length; g7++) if (gb[g7].a === car.n) { var ob = cars[gb[g7].b]; if (ob && T.rel(car.d, ob.d) > -8 && T.rel(car.d, ob.d) < 60) { var vgb = max(8, ob.v - 4); if (vgb < vt) { vt = vgb; ff = min(ff, 0); onF = false; } } }
            // held up: while it follows the car ahead (in this lane, close), the time it loses against its own pace (its full
            // profile here, less frSlack: the noise of a car of the same pace), gained back in the tow; forgotten when free
            if (!fin && S.phase === 'race' && car.prog > K.frFrom && ah && !ah.fin && gapS < K.frGap) {
              var fo = fullAt(i, p); A.lost = max(0, A.lost + (fo * (1 - K.frSlack) - v) / max(10, fo) * H);
            } else A.lost = max(0, A.lost - K.lostDecay * H);
            if (fr) A.frs += H;
            // off the road: back on, gently
            if (car.surf >= 2) { vt = min(vt, max(12, 0.85 * v)); }
            // running wide of its lane in a corner (outside of the turn): lift until the car comes back (only near the limit:
            // a slow car off its line has grip to spare and drives back onto it)
            var kc = lk[i], wide = (car.lat - lat[i] - A.lane) * (kc > 0 ? -1 : 1);
            if (abs(kc) > 1 / 300 && wide > K.wideErr && vt > v - K.wideLift && v > K.wideV * ceilAt(i, p)) { vt = v - K.wideLift; ff = min(ff, 0); onF = false; }
            // SAVE (Hedge): lift and coast into the braking point
            var coast = A.save && R.coast && toB > 0 && toB < v * K.coastT;
            // traction, off the profile (a tow, a recovery, behind a car): never ask for more drive than the tyres have left
            // beside the cornering they are doing (control() asks (want.v - v) * CTRL.kv m/s2; fix 15 Oct: it divided by 6
            // when the gain was 4, so a car behind another came out of every corner at two thirds of its traction)
            if (vt > v && !onF) {
              T.pose(car.d, PO);
              var hp = car.steerAngle > 0 ? -PO.bank : car.steerAngle < 0 ? PO.bank : 0, ge2 = max(0.2, (P.g + v * v * PO.kv) / P.g);
              var gs = phys.gripScale ? phys.gripScale(car.surf) : 1, AY = max(0.5, phys.latMax(P, v, PO.kv, hp) * gs), ay = min(abs(car.ay || 0), AY);
              var rem = P.trac * ge2 * gs * sqrt(max(0, 1 - (ay / AY) * (ay / AY))), res = phys.dragAcc(P, v, !!(car.flap && car.flap.open), car.draft || 0) + P.g * PO.g;
              vt = min(vt, v + max(0.3, ((A.hunt || A.mode === 1 ? K.tracTow : K.traction) * rem - res)) / (phys.CTRL && phys.CTRL.kv > 0 ? phys.CTRL.kv : 6));
            }
            want.lat = Lx; want.v = vt; want.look = look; want.a = ff;
            A.vt = vt; A.p = p;
            phys.control(car, T, want, H, cmd, P);
            inp.steer = cmd.steer; inp.throttle = cmd.throttle; inp.brake = cmd.brake;
            if (coast && cmd.brake < 0.05) inp.throttle = 0;
            // a lock-up: the brake hard on while it lasts (the sim locks the tyres: the smoke); the crest wobble
            if (A.lk > 0) { inp.brake = 1; inp.throttle = 0; }
            if (A.wobT > 0) inp.steer = clamp(inp.steer + 0.14 * Math.sin(2 * Math.PI * 3 * A.wobT), -1, 1);
            // the flap: asked for whenever it is armed and shut, never while braking
            if (!fin && car.flap && car.flap.armed && !car.flap.open && cmd.brake < 0.05 && toB > 60) inp.flap = true;
            // the chip: the state it drives by
            var stt = fin ? 'RACE' : A.mode === 1 ? 'ATTACK' : A.mode === 2 ? 'DEFEND' : intent === 'tow' ? 'TOW' : A.push ? 'PUSH' : A.learnT > 0 ? 'LEARN' : A.save ? 'SAVE' : 'RACE';
            if (stt === 'ATTACK') chip(S, car, A, stt, A.tgt, ZL[A.az].corner, A.ins ? 'INSIDE' : 'OUTSIDE', A.side, A.shown, A.act);
            else if (stt === 'DEFEND') chip(S, car, A, stt, A.tgt, Zz.corner, 'INSIDE', Zz.side, A.dsh, S.steps + round(toB / max(v, 10) / H));
            else if (stt === 'TOW') chip(S, car, A, stt, near.ah >= 0 ? near.ah : A.ct, '', '', 0, -1, -1);
            else chip(S, car, A, stt, -1, '', '', 0, -1, -1);
          }
        }
        var factory = function (S) { return { drive: drive }; };
        factory.zones = ZN; factory.ceilings = C; factory.classes = CL;
        return factory;
      }

      return { K: K, line: line, encode: encode, decode: decode, profile: profile, lapTime: lapTime, driver: driver, paced: paced, zonesOf: zonesOf };
    })();
