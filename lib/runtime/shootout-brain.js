    /* ============================================ penalty shootout: the brain (lane K; PURE: no THREE, no DOM) == */
    // Pasted into boot() by shootout.js at its /*@include shootout-brain.js*/ marker. ONE top-level binding,
    // ShootBrain (critique #2); everything else lives inside the factory, which reads nothing but Math, so Node tests
    // load it with vm.runInNewContext(src + ';ShootBrain', {}).
    //
    //   ShootBrain.taker(meta, opts) -> TK   the taker's timing controller (TAP · AIM · RELEASE, the tap contract §2): KICK's
    //                                        edges as integer sim steps (critique #3) drive the heat, the tap-driven run-up
    //                                        clock (a jog prefix in negative clip time, then fbKick), the lock at the last
    //                                        stride, the strike's release graded against the plant, the hurried stride on
    //                                        an early one, the hang on a late one (critique #23), the auto-strike, the
    //                                        locked heat's power (one window: B1), the contact the keeper reads, the tells
    //   ShootBrain.pre(meta, preT)           the run-up's prefix timeline (the jog's footfalls, its distance and speed)
    //   ShootBrain.pilot(spec)               a scripted player (the demo, debug.kick, Node): KICK's edges, step by step
    //   ShootBrain.kick(Sim, rec)            one headless kick in the director's order (v2 records; v1 ones mapped)
    //   ShootBrain.keeper(opts) -> KP        the keeper: set-phase mind games, the decision (side, read, commit offset),
    //                                        the one dive (a ballistic root, solved on MEASURED limbs: critique #1),
    //                                        re-solved from the true contact until push-off (critique #11), the forward
    //                                        attack (critique #30), reactive hands, landing and get-up, and the 14
    //                                        proxy colliders the ball sim collides with
    //   ShootBrain.dims(skeleton, height)    the measured limb lengths from asset.json's skeleton (ASSETS[id].json.skeleton)
    //   ShootBrain.rng(seed)                 mulberry32 + cached Box-Muller, { next(), gauss() }
    //
    // Frames: metres, Y up, the pitch along z. The keeper faces +z; his left is +x. The taker faces -z; his left is -x.
    // Times are sim seconds (step n is at n * H, H = 1/120).
    var ShootBrain = (function () {
      'use strict';
      var PI = Math.PI, H = 1 / 120, GRAV = 9.81;
      var C = {
        H: H, G: GRAV, GZ: -52.5, BALL: [0, 0.11, -41.5], R: 0.11, MOUTH: 3.66, BAR: 2.44, LINE: -52.35,
        // the keeper's decision (design §4.1)
        // (NOISE: the correct read's spread, x and y; 0.8/0.40 rather than the design's 0.6/0.35, tuned with HAND_REACT on
        // ShootSim to a 70-73% goal rate on good aims, the real 70-75%: lane K notes)
        REACT: 0.12, DELTA: [0.06, 0.22], STAY: 0.08, SKILL: 0.8, NOISE: [0.8, 0.40], WRONG_X: [1.5, 3.2], WRONG_Y: [0.3, 1.6],
        // the dive (§4.2): split-step, load, the ballistic root and its clamps, the forward attack (critique #30)
        // (LOAD 0.15 and ROLL_T 0.35: a take-off of ~0.3 s from the power step, not one frame (Mb-to-K ask 5, punch-list
        // N4); measured neutral on the tuned tables: 67.3% against 67.0% goals, late 150-290 ms 53.9% against 53.7%)
        SPLIT: 0.15, HOP: 0.05, LOAD: 0.15, LOAD_MAX: 0.55, SHIFT: 0.15, STEP_OUT: 0.25, READY_DROP: 0.20, LOAD_DROP: 0.28,
        // (VMAX: the take-off's total speed in the dive's plane, sqrt(vx^2 + vy^2): one pair of legs gives either the far
        // reach or the height, not both at full; it is what keeps the top corners about unsaveable)
        VX: 5.0, VY: [0.5, 3.2], VMAX: 4.6, VZ: [0.6, 1.2], RI_Y: 0.20,
        // (MIN_X: a keeper who goes, goes to a side (the action bias, Bar-Eli et al. 2007): a believed point nearer the
        // middle than this is pushed out to it; only the 'stay' draw holds the centre)
        MIN_X: 1.2, PHI: [12, 50], MIN_SHIFT: 0.30, PHI_MAX: 80,
        // (LIE_Y 0.20 k: the drawn body lying on its side has the near hip clear of the turf (Mb-to-K ask 2, punch-list B5))
        ROLL_T: 0.35, ROLL_PHI: 0.14, LAND_Y: 0.22, LIE_Y: 0.20, SLIDE: 6, LAND_T: 0.30, DOWN: 0.9, DOWN_GOAL: 0.6, GETUP: 1.5, GETUP_FADE: 0.35,
        // hands: the plan's swing, the reaction (contact + REACT), the reach margin, the two hands' spacing
        // (HAND_REACT 2.5 m/s relative to the shoulder, not 3.5: see NOISE. HAND_FWD: the gloves meet the ball this far ahead
        // of the shoulders' plane, so a stretched dive's arms are in front of the face)
        HAND_PLAN: 6, HAND_REACT: 2.5, HAND_READY: 3, HAND_LAND: 2, SEP: 0.10, REACH_K: 0.98, REACH_CLAMP: 0.995, HAND_FWD: 0.15,
        BLOCK_REACH: 1.1, BLOCK_HOP: 0.12, BLOCK_T: 0.30, BLOCK_RATE: 5, BLOCK_JUMP: 0.35, BLOCK_DROP: 0.38,
        // what the keeper believes about the ball: its speed, and a drag allowance on the flight time
        // (DRAG_EST: the sim's flight to the keeper's plane over d / v, re-measured 11 Oct (tap contract §2.8) on ShootSim
        // over 17-38 m/s (k3/drag-probe.mjs): a + b y + (c + d y) (22 / v)^2, within 6 ms of the sim at every speed and 2 ms
        // at 32-38 m/s; the old flat 1.073 + 0.012 y was 16-28 ms early at 17 m/s, the cold kick)
        BALL_SPEED: 22, DRAG_EST: [1.0649, -0.0021, 0.0099, 0.0151], HANG_DELTA: 0.10,
        // the strike's power as he reads it from the swing: design §3.6's speed rule (ShootSim.cone's speedK), mirrored
        // here for when the director does not tell him (KP.strike); the ratios are to the sim's 22 m/s, the base is the
        // heat's launch speed (tap contract X9); the auto-strike is the scuff floor and a dip (X13)
        SPEED_RULE: { base: 22, perfect: 1.5, early: 0.06, late: 0.03, scuff: 15 }, AUTO_BIAS: -1.8,
        // the run-up's rhythm (the plant, a hang, the swing starting) is read as it happens (READ_LAT 0): the ball itself
        // only REACT late. A late release must not beat him (critique #11): he holds the load through a hang, and an early
        // one shortens the load (down to LOAD_MIN) by as much as the contact came early
        READ_LAT: 0, LOAD_MIN: 0.06,
        // (FLY_MAX: a slower shot is set for later (tap contract T9): the push-off waits until the ball's believed arrival
        // at his glove plane is at most FLY_MAX away, holding the load (within LOAD_MAX). Without it a cold 17 m/s kick
        // gave him a 0.69 s flight he cannot hold up (VY's clamp): he came down before the ball and cold kicks out-scored
        // warm ones. 0.53 s is his flight at 22 m/s, where he was tuned (k3/band-probe.mjs)
        FLY_MAX: 0.53,
        // (fix-i4, review-i3 D1/D2) the ball he can see. LOAD_MAX holds only while the strike is unseen (a hang): once the
        // swing is read he waits for the ball, however slow (a scuffed 42 km/h ball took a second; he had gone and come
        // down before it). From contact + REACT he reads its line (LINE_*: the sim's drag and the spin's lift, mirrored
        // as DRAG_EST is) and dives for that, not his guess, while still on the turf; on the other side only with
        // SWITCH_T to go before it reaches him, and SWITCH_LOAD to load again. Holding for a slow ball he side-steps
        // toward the point (SHUF_V, up to SHUF_MAX past the SHIFT, stopping SHUF_LEAD before the push, never nearer it
        // than SHUF_NEAR). CENTRE_X: a correct read of an aim this near the middle stays (the read, not a dice roll)
        SWITCH_T: 0.62, SWITCH_LOAD: 0.12, STAY_DIVE_T: 0.40, STAY_WAIT: 0.10, SHUF_V: 3.0, SHUF_MAX: 1.1, SHUF_LEAD: 0.08, SHUF_FROM: 0.04, SHUF_NEAR: 1.0, CENTRE_X: 0.55,
        TRACK_X: 3.75, TRACK_Y: [0.15, 2.45], LET_GO: [0.30, 0.35], WAIT_GAP: 0.05, WAIT_T: 0.25, STEP_DT: 0.05, READ_EARLY: 0.25, READ_V: 32, TELL_K: 0.6, LINE_KD: 0.013261, LINE_KL: 0.053040, LINE_CL: [0.30, 0.9], LINE_E: [0.62, 0.80, 0.6, 0.6, 8],
        // the taker after the lock (§4.6, critique #22/#23; tap contract §2.6): an early release hurries the stride at
        // RHO x s_L, the strike after a hang plays 1 -> AFTER over AFTER_RAMP, the hang is capped; the grades (§3.6)
        RHO: 1.8, AFTER: 1.15, AFTER_RAMP: 0.075, HANG_CAP: 0.28, PERFECT: 0.35,
        // TAP · AIM · RELEASE (owner 13:45 + 14:10; the tap contract §2.1). The heat: a press closer than TAP_FLOOR to the
        // previous press (accepted or not) is ignored (D4); the tap rate a leaky integrator (tau RATE_TAU, D5); the target
        // H* = 1 - exp(-(r / HEAT_K)^HEAT_P); H rises toward it with RISE, cools at most COOL a second (never while KICK is
        // held in the HOLD_LEAD before the lock: fix-i4 D5); the bands.
        // (fix-i4, review-i3 D4: TAP_FLOOR 55 -> 30 ms. 55 ms cut a two-finger roll in half (45/80 ms at 16/s locked WARM
        // 61) and let any clicker under 18 Hz through. 30 ms keeps out switch chatter and a 34 Hz+ clicker (every press
        // after its first ignored) and admits a Tetris pro's roll. No floor can tell a human-rate clicker from a human; a
        // steadiness test on the 120 Hz stamps flags a steady human (5-8 ms sd) in 25-80% of run-ups: not done, owner's
        // call (fix-i4.md))
        TAP_FLOOR: 0.030, RATE_TAU: 0.40, HEAT_K: 8, HEAT_P: 2.2, RISE: 0.25, COOL: 0.35, BANDS: [0.35, 0.65, 0.90], HOLD_LEAD: 0.35,
        // the run-up's clock rate S_MIN + (S_MAX - S_MIN) H, frozen at the lock (D6); the prefix (D1): a jog of PRE_T
        // clip-seconds before the last stride's touchdown, ramping up over PRE_ACC, footfalls every PRE_STEP from cJ back
        // to PRE_FIRST after its start; the mark MARK_D behind the ball; the swing at least real speed (D7)
        S_MIN: 0.55, S_MAX: 1.35, PRE_T: 1.70, PRE_ACC: 0.50, PRE_STEP: 0.47, PRE_FIRST: 0.20, MARK_D: 4.75, SWING_MIN: 1.0,
        // what the locked heat does: the window (cold -> hot, touch x TOUCH_K, never under W_FLOOR: ONE window, B1), the
        // base launch speed (+ V_FIRE on fire), the cone x (1 + CONE_K H^3), the marker's figure of eight
        W_COLD: 0.160, W_HOT: 0.080, W_FLOOR: 0.070, TOUCH_K: 1.5, V0: 17, VH: 15, V_FIRE: 3, CONE_K: 1.2,
        WOB_A: 0.10, WOB_K: [0.6, 1.4], WOB_T: 1.6,
        // the aim's range at the goal line (owner #4: not the goal; 0.12 the ball on the turf, sim.solve's floor), the
        // release grace (D9: 0, the owner's literal rule), the frame for aimInfo (post and bar centre lines, ball + post R)
        AIM_X: [-7, 7], AIM_Y: [0.12, 4.5], REL_GRACE: 0, POST_C: 3.72, BAR_C: 2.50, WOOD: 0.17,
        // a v1 record (the hold-to-run-up mechanic) keeps its own numbers when it names none: ShootBrain.kick's mapping
        LEGACY: { W_DESK: 0.150, W_TOUCH: 0.225, SPEED: 22, HOLD: 600 },
        // mind games (§4.1; critique #24: M1 = the bob and the stare only, antics off unless asked)
        BOB: 0.03, BOB_HZ: 2.1, XK: [0.03, 0.06]
      };

      /* ---------------------------------------------------------------------------------------------- small math -- */
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function lerp(a, b, f) { return a + (b - a) * f; }
      function sstep(a, b, x) { if (b === a) return x >= b ? 1 : 0; var u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
      function v3(x, y, z) { return [x, y, z]; }
      function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
      function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
      function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
      function madd(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
      function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
      function len(a) { return Math.sqrt(dot(a, a)); }
      function dist(a, b) { return len(sub(a, b)); }
      function norm(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; }
      function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
      function vlerp(a, b, f) { return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)]; }
      function clampLen(a, m) { var l = len(a); return l > m && l > 1e-12 ? mul(a, m / l) : a.slice(); }
      // move a toward b by at most step (a vector)
      function toward(a, b, step) { var d = sub(b, a), l = len(d); return l <= step || l < 1e-12 ? b.slice() : madd(a, d, step / l); }
      function r4(v) { return Math.round(v * 1e4) / 1e4; }
      function r4v(a) { return [r4(a[0]), r4(a[1]), r4(a[2])]; }
      function r6(v) { return Math.round(v * 1e6) / 1e6; }

      /* --------------------------------------------------------------------------------------------------- rng -- */
      // mulberry32, with a cached Box-Muller pair (the same algorithm as ShootSim.rng, so a stream is the same either way)
      function rng(seed) {
        var a = seed >>> 0, spare = null;
        function next() {
          a = (a + 0x6D2B79F5) | 0;
          var t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        function gauss() {
          if (spare !== null) { var s = spare; spare = null; return s; }
          var u = next(); while (u <= 1e-12) u = next();
          var v = next(), r = Math.sqrt(-2 * Math.log(u)), th = 2 * PI * v;
          spare = r * Math.sin(th); return r * Math.cos(th);
        }
        return { next: next, gauss: gauss };
      }

      /* -------------------------------------------------------------------------------------- measured limbs (#1) -- */
      // From the body's own skeleton (asset.json: [{ name, parent, head, tail }], rest pose, model space, metres): the
      // arm and leg lengths, the shoulder and hip offsets from the root bone's head, the head, and the palm. Nothing
      // here scales a constant by k: the female arms are not the male arms times 0.907.
      function dims(skel, height) {
        var B = {};
        (skel || []).forEach(function (b) { if (b && b.name) B[String(b.name).replace('.', '_')] = b; });
        function hd(n) { var b = B[n]; if (!b) throw new Error('ShootBrain.dims: no bone ' + n); return b.head; }
        var root = hd('root'), sh = hd('upperarm01_L'), el = hd('lowerarm01_L'), wr = hd('wrist_L'), kn = hd('finger3-1_L');
        var hip = hd('upperleg01_L'), knee = hd('lowerleg01_L'), ank = hd('foot_L'), neck = hd('neck01');
        var head = B.head, headC = head ? vlerp(head.head, head.tail, 0.45) : add(neck, [0, 0.17, 0]);
        var upper = dist(sh, el), fore = dist(el, wr), knuckle = dist(wr, kn), glove = 0.68 * knuckle;
        var hgt = Number(height) || (headC[1] + 0.12);
        var D = {
          measured: true, height: hgt, k: hgt / 1.869,
          rootH: root[1], rootZ: root[2],
          shUp: sh[1] - root[1], shAcross: Math.abs(sh[0]), shFwd: sh[2] - root[2],
          upper: upper, fore: fore, knuckle: knuckle, glove: glove,
          arm: upper + fore, reach: upper + fore + glove,
          neckUp: neck[1] - root[1], headUp: headC[1] - root[1], headFwd: headC[2] - root[2],
          headR: head ? 0.75 * dist(head.head, head.tail) : 0.12,
          hipAcross: Math.abs(hip[0]), hipUp: hip[1] - root[1], hipFwd: hip[2] - root[2],
          thigh: dist(hip, knee), shin: dist(knee, ank), ankleH: ank[1], ankleFwd: ank[2] - root[2]
        };
        D.leg = D.thigh + D.shin;
        D.torsoR = 1.4 * D.hipAcross;
        // root to the glove centre at full stretch along the body line, the two hands SEP apart across it (§4.2's L,
        // from the measured arm: the top hand's shoulder sits shAcross off the line, its hand SEP off it)
        var off = Math.max(0, D.shAcross - C.SEP), rr = C.REACH_K * D.reach;
        D.L = D.shUp + Math.sqrt(Math.max(0, rr * rr - off * off - C.HAND_FWD * C.HAND_FWD));
        return D;
      }
      // the fallback when no skeleton is passed: human-athlete-male's own bones (asset.json, read 11 Oct 2026), run
      // through the same dims() so the numbers are the measured ones, never k-scaled
      var MALE = dims([
        { name: 'root', head: [0, 0.99626, -0.06358], tail: [0, 1.00385, 0.00346] },
        { name: 'upperarm01.L', head: [0.21103, 1.47503, 0.01861] }, { name: 'lowerarm01.L', head: [0.39511, 1.27, 0.01849] },
        { name: 'wrist.L', head: [0.53668, 1.13401, 0.2212] }, { name: 'finger3-1.L', head: [0.58677, 1.07751, 0.31198] },
        { name: 'neck01', head: [0, 1.58178, 0.01203] }, { name: 'head', head: [0, 1.68303, 0.0481], tail: [0, 1.84465, 0.0415] },
        { name: 'upperleg01.L', head: [0.1132, 0.99787, -0.0075] }, { name: 'lowerleg01.L', head: [0.15296, 0.54714, 0.02824] },
        { name: 'foot.L', head: [0.20636, 0.07617, 0.01282] }
      ], 1.869);
      MALE.measured = 'fallback: human-athlete-male';

      /* ------------------------------------------------------------------------------------------- body frame -- */
      // R = Ry(yaw) . Rz(-roll) . Rx(pitch): pitch > 0 leans the trunk toward +z (forward), roll > 0 tips +y toward +x
      // (the keeper's left), yaw about +y. u = R.(0,1,0) (up the trunk), a = R.(1,0,0) (the keeper's left), f = R.(0,0,1).
      // q is the same rotation as a quaternion [x, y, z, w] (THREE: new Euler(pitch, yaw, -roll, 'YZX')).
      function basis(yaw, roll, pitch) {
        var cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
        var u = [cp * sr * cy + sp * sy, cp * cr, -cp * sr * sy + sp * cy];
        var a = [cr * cy, -sr, -cr * sy];
        var f = [-sp * sr * cy + cp * sy, -sp * cr, sp * sr * sy + cp * cy];
        // q = qy * qz(-roll) * qx(pitch)
        var hx = pitch / 2, hz = -roll / 2, hy = yaw / 2;
        var qx = [Math.sin(hx), 0, 0, Math.cos(hx)], qz = [0, 0, Math.sin(hz), Math.cos(hz)], qy = [0, Math.sin(hy), 0, Math.cos(hy)];
        return { u: u, a: a, f: f, q: qmul(qmul(qy, qz), qx) };
      }
      function qmul(p, q) {
        return [p[3] * q[0] + p[0] * q[3] + p[1] * q[2] - p[2] * q[1], p[3] * q[1] - p[0] * q[2] + p[1] * q[3] + p[2] * q[0],
          p[3] * q[2] + p[0] * q[1] - p[1] * q[0] + p[2] * q[3], p[3] * q[3] - p[0] * q[0] - p[1] * q[1] - p[2] * q[2]];
      }
      // a point given in the body frame (across, up, forward) from origin o
      function bodyPt(o, B, x, y, z) { return [o[0] + B.a[0] * x + B.u[0] * y + B.f[0] * z, o[1] + B.a[1] * x + B.u[1] * y + B.f[1] * z, o[2] + B.a[2] * x + B.u[2] * y + B.f[2] * z]; }
      // two bones from A to the target T (lengths la, lb), the joint bent toward the pole point P
      function twoBone(A, T, la, lb, P) {
        var d0 = dist(A, T), d = clamp(d0, Math.abs(la - lb) + 1e-3, la + lb - 1e-3), dir = norm(sub(T, A));
        if (len(dir) < 0.5) dir = [0, -1, 0];
        var x = (la * la - lb * lb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, la * la - x * x));
        var pd = sub(P, A); pd = sub(pd, mul(dir, dot(pd, dir))); pd = len(pd) > 1e-9 ? norm(pd) : norm(cross(dir, [0, 0, 1]));
        return { joint: add(add(A, mul(dir, x)), mul(pd, hh)), end: add(A, mul(dir, d)), short: d0 > la + lb - 1e-3 };
      }

      /* ======================================================================================== the taker (K1) == */
      // 11_01 as lane A built it (kick-meta.json, 12:44): the stand-in only until the pack's clip meta is read
      var KICK_STUB = {
        stub: true, foot: 'R', start: 0, run: 0.15, plant: 1.725, contact: 1.85, lift: 2.025, end: 2.9333,
        stance: [['L', 0, 0.1583], ['R', 0, 0.6833], ['L', 0.4167, 1.2833], ['R', 1.175, 1.5167], ['L', 1.725, 2.025], ['L', 2.2083, 2.9417], ['R', 2.475, 2.9417]],
        steps: [['L', 0.4167, 2.182, -1.484], ['R', 1.175, 1.446, -1.126], ['L', 1.725, 0.316, 0.182]], lastStride: 1.729
      };
      // accept the clip-list entry ({ kick: {...} }), the kick meta itself, or nothing
      function normKick(m) {
        var k = m && m.kick && typeof m.kick === 'object' ? m.kick : m;
        if (!k || !(k.plant > 0) || !(k.contact > k.plant)) return KICK_STUB;
        return k;
      }
      // design §3.6's launch speed for a grade as a share of the base (ShootSim.cone's speedK, mirrored: the keeper's read
      // of the strike's power); the auto-strike is the scuff floor (tap contract X13)
      function speedK(g) {
        var R = C.SPEED_RULE, q = g.q, qq = Math.min(q, 3), e = g.err;
        if (g.auto) return R.scuff / R.base;
        if (q <= C.PERFECT) return (R.base + R.perfect) / R.base;
        if (q > 3 && e < 0) return (1 - 0.18) + ((R.scuff / R.base) - (1 - 0.18)) * Math.min(1, (q - 3) / 2);
        return 1 - (e < 0 ? R.early : R.late) * qq;
      }
      // the launch speed (m/s) for a grade from a base launch speed (the heat's; 22, the sim's own, when none is given)
      function speedOf(g, base) { return (base > 0 ? base : C.SPEED_RULE.base) * speedK(g); }
      // design §3.6's systematic pitch bias for a grade, degrees (early dips, late rises; the auto-strike dips)
      function biasOf(g) { if (g.auto) return C.AUTO_BIAS; var qq = Math.min(g.q, 3); return g.err < 0 ? -0.6 * qq : g.err > 0 ? 1.0 * qq : 0; }
      // the grade of a strike released e seconds off the plant (+ late) in a window W; the auto-strike is scuffed (D8, X7)
      function gradeOf(e, W, auto) {
        var q = Math.abs(e) / (W / 2);
        var g = auto ? 'scuffed' : q <= C.PERFECT ? 'perfect' : q <= 1 ? 'good' : q <= 3 ? (e < 0 ? 'early' : 'late') : (e < 0 ? 'scuffed' : 'leaned');
        return { err: e, errMs: Math.round(e * 1000), W: W, q: q, grade: g, auto: !!auto };
      }

      /* ----------------------------------------------------------------------------- the heat (tap contract §2.2) -- */
      function hstar(r) { return 1 - Math.exp(-Math.pow(Math.max(0, r) / C.HEAT_K, C.HEAT_P)); }
      function band(h) { var B = C.BANDS; h = +h || 0; return h < B[0] ? 'COLD' : h < B[1] ? 'WARM' : h < B[2] ? 'HOT' : 'ON FIRE'; }
      // the gauge's degrees: floor(100 H), never past its band's own (0.898 reads 89 HOT, never "90 HOT")
      function deg(h) {
        h = clamp(+h || 0, 0, 1);
        var d = Math.floor(100 * h + 1e-9), B = C.BANDS, lo = 0, hi = 100;
        for (var i = 0; i < B.length; i++) { if (h < B[i]) { hi = Math.ceil(100 * B[i] - 1e-9) - 1; break; } lo = Math.ceil(100 * B[i] - 1e-9); }
        return clamp(d, lo, hi);
      }
      function sOf(h) { return C.S_MIN + (C.S_MAX - C.S_MIN) * h; }
      function wobA(h) { return C.WOB_A * (C.WOB_K[0] + C.WOB_K[1] * clamp(+h || 0, 0, 1)); }
      // the marker's figure of eight at sim time ts and heat H (replaces the director's wobbleAt(ts, pressure))
      function wobble(ts, h) { var A = wobA(h), w = 2 * PI * (+ts || 0) / C.WOB_T; return [A * Math.sin(w), 0.5 * A * Math.sin(2 * w)]; }
      function clampAim(x, y) { return [clamp(+x || 0, C.AIM_X[0], C.AIM_X[1]), clamp(y == null ? 1 : +y || 0, C.AIM_Y[0], C.AIM_Y[1])]; }
      // where an aim at the goal line stands against the frame: in the mouth (the ball's centre, the sim's GOAL rule),
      // near the wood (within ball + post R of a post's or the bar's centre line), over, wide
      function aimInfo(x, y) {
        x = +x || 0; y = +y || 0;
        var ax = Math.abs(x), dPost = Math.hypot(ax - C.POST_C, Math.max(0, y - C.BAR_C)), dBar = Math.hypot(Math.max(0, ax - C.POST_C), y - C.BAR_C);
        return { inFrame: ax < C.MOUTH && y < C.BAR, nearWood: Math.min(dPost, dBar) < C.WOOD, over: y >= C.BAR, wide: ax >= C.MOUTH };
      }

      /* ------------------------------------------------------------------- the run-up's prefix (tap contract §2.3) -- */
      // The jog joins fbKick at the touchdown that starts the last stride (D1: cJ = steps[len - 2], fbKick's R at 1.175);
      // ?join=run (opts.join 'run') joins at the clip's literal run start, for comparison
      function joinOf(K, o) {
        var st = K.steps || [];
        if (o && o.join === 'run') {
          var cr = K.run != null ? +K.run : +(K.start || 0), nx = null;
          for (var i = 0; i < st.length; i++) if (st[i][1] > cr + 1e-6) { nx = st[i]; break; }
          return { c: cr, foot: nx ? (nx[0] === 'L' ? 'R' : 'L') : (K.foot === 'L' ? 'L' : 'R') };
        }
        if (st.length >= 2) return { c: +st[st.length - 2][1], foot: st[st.length - 2][0] === 'L' ? 'L' : 'R' };
        return { c: Math.max(+(K.start || 0), K.plant - 0.55), foot: K.foot === 'L' ? 'L' : 'R' };
      }
      // the prefix as a pure timeline in clip time c (c0 = cJ - preT <= c < cJ, negative on the male fbKick): a linear
      // speed ramp over the first TACC c-seconds, then cruising at the clip's own speed at cJ (so the join is C1); its
      // footfalls back from cJ every STEP, feet alternating away from cJ's
      function pre(meta, preT, o) {
        var K = normKick(meta), J = joinOf(K, o), cJ = J.c, T = preT > 0 ? +preT : C.PRE_T, c0 = cJ - T;
        var TACC = Math.min(C.PRE_ACC, T), Dp = T - TACC / 2, STEP = C.PRE_STEP, steps = [], f = J.foot;
        for (var k = 1; k <= 64 && cJ - k * STEP >= c0 + C.PRE_FIRST - 1e-9; k++) { f = f === 'L' ? 'R' : 'L'; steps.unshift([f, r6(cJ - k * STEP)]); }
        function tau(c) { return clamp((+c || 0) - c0, 0, T); }
        return {
          c0: c0, cJ: cJ, T: T, TACC: TACC, STEP: STEP, footJ: J.foot, steps: steps,
          // 0..1: the share of the prefix's distance covered at c (rate-independent)
          frac: function (c) { var t = tau(c); return Dp > 0 ? (t < TACC ? t * t / (2 * TACC) : t - TACC / 2) / Dp : 1; },
          // 0..1: the root's speed over the clip's own at cJ
          speedK: function (c) { return TACC > 0 ? Math.min(1, tau(c) / TACC) : 1; }
        };
      }

      /* ------------------------------------------------------------------------------------ TK (tap contract §2.9) -- */
      // Every input is an edge of KICK stamped as an integer sim step (critique #3): tk.input('press' | 'release', stamp)
      // queues it for the next tk.step(n), which runs, in order: the tap rate's decay, the presses (the 30 ms floor on the
      // stamps, D4), the heat, the clock (c += H s(H)) and the lock at cJ, the strike's release (the first release stamped
      // at or after the lock), the auto-strike, then the clip time and what it crossed. Before the lock the clock is
      // integrated (it depends on the tap history, and the record holds every edge with the step it was applied at); from
      // the lock it is analytic in (lock, release, n), so a late-applied release lands exactly.
      //   opts: { touch (bool, or a function; read at the lock: the director may set it at the first press), preT, Wfix (a
      //           FINAL window, s), speedFix (a base launch speed, m/s), relGrace (s, D9), join ('run'), rho, after,
      //           hangCap, yawBase }
      function taker(meta, opts) {
        var o = opts || {}, K = normKick(meta);
        var rho0 = o.rho || C.RHO, after = o.after || C.AFTER, cap = Math.min(o.hangCap != null ? o.hangCap : C.HANG_CAP, 0.295);
        var PR = pre(K, o.preT, o), c0 = PR.c0, cJ = PR.cJ, plant = K.plant, contact = K.contact, PC = contact - plant;
        var DEC = Math.exp(-H / C.RATE_TAU), RISEK = 1 - Math.exp(-H / C.RISE), touchSet = null, base = o.yawBase || 0, dYaw = 0;
        // the footfalls: the prefix's (pre), then the clip's stance touchdowns from cJ to the plant
        var FEET = PR.steps.map(function (s) { return [s[0], s[1], true]; });
        (K.stance || []).forEach(function (s) { if (s[1] >= cJ - 1e-6 && s[1] <= plant + 1e-6) FEET.push([s[0], +s[1], false]); });
        var S;
        function fresh() {
          S = { q: [], started: false, nS: null, lastRaw: null, r: 0, H: 0, Hs: 0, c: c0, rate: 0, lastN: null, lastC: c0, last: null, hist: {},
            L: null, cL: null, HL: 0, sL: null, PW: null, tP: null, w: null, rho: null, nA: null,
            rel: null, auto: false, contactDone: false, down: false, downFrom: null, presses: 0, accepted: 0, ignored: 0, mashed: 0 };
        }
        fresh();
        function grace() { var g = o.relGrace != null ? +o.relGrace : C.REL_GRACE; return g > 0 ? g : 0; }
        function isTouch() { if (touchSet != null) return touchSet; var t = o.touch; return typeof t === 'function' ? !!t() : !!t; }
        // the window at heat h (B1: ONE source; an explicit Wfix is final, never rescaled)
        function Wat(h) { return o.Wfix > 0 ? +o.Wfix : Math.max(C.W_FLOOR, (C.W_COLD - (C.W_COLD - C.W_HOT) * h) * (isTouch() ? C.TOUCH_K : 1)); }
        function vAt(h) { return o.speedFix > 0 ? +o.speedFix : C.V0 + C.VH * h + (h >= C.BANDS[2] ? C.V_FIRE : 0); }
        // after a hang the strike plays a little quick (1 -> AFTER over the first AFTER_RAMP of hang, so it is continuous)
        function aOf(hang) { return 1 + (after - 1) * Math.min(1, Math.max(0, hang) / C.AFTER_RAMP); }
        function cLin(n) { return S.cL + (n - S.L) * H * S.sL; }
        // the contact's continuous time for the strike released at step rr, then the step that crosses it (the launch)
        function contactTime(rr) {
          var cr = Math.min(cLin(rr), plant);
          if (cr < plant) return rr * H + (plant - cr) / S.rho + PC / S.w;
          return rr * H + PC / (S.w * aOf(rr * H - S.tP));
        }
        function contactStep(rr) { return Math.ceil(contactTime(rr) / H - 1e-7); }
        // the release in force at step n: the strike's, or the auto's once its step is reached
        function relAt(n) { if (S.L == null) return null; if (S.rel != null) return S.rel <= n ? S.rel : null; return n >= S.nA ? S.nA : null; }
        // the clip after the lock (tap contract §2.6), analytic: { c, rate (dc/dt), hang, phase }
        function post(n) {
          var rr = relAt(n);
          if (rr == null) {
            var cl = cLin(n);
            return cl < plant ? { c: cl, rate: S.sL, hang: 0, phase: 'stride' } : { c: plant, rate: 0, hang: n * H - S.tP, phase: 'hang' };
          }
          var nC = contactStep(rr);
          if (n >= nC) return { c: contact + (n - nC) * H * S.w, rate: S.w, hang: 0, phase: n === nC ? 'contact' : 'after' };
          var cr = Math.min(cLin(rr), plant), t = n * H;
          if (cr < plant) {
            var tP2 = rr * H + (plant - cr) / S.rho;
            return t <= tP2 ? { c: cr + (t - rr * H) * S.rho, rate: S.rho, hang: 0, phase: 'stride' } : { c: Math.min(contact, plant + (t - tP2) * S.w), rate: S.w, hang: 0, phase: 'strike' };
          }
          var a = aOf(rr * H - S.tP);
          return { c: Math.min(contact, plant + (n - rr) * H * S.w * a), rate: S.w * a, hang: 0, held: rr * H - S.tP, phase: 'strike' };
        }
        // the clip time at step n (before the start: the mark; before the lock: the integrated clock, as it was)
        function clip(n) {
          if (!S.started || n <= S.nS) return { c: c0, rate: S.started ? sOf(S.H) : 0, hang: 0, phase: S.started ? 'tap' : 'set' };
          if (S.L == null || n < S.L) { var hh = S.hist[n]; return hh ? { c: hh[0], rate: hh[1], hang: 0, phase: 'tap' } : { c: S.c, rate: S.rate, hang: 0, phase: 'tap' }; }
          return post(n);
        }
        function heatNow() { return { H: S.H, Hs: S.Hs, r: S.r, band: band(S.H), deg: deg(S.H), locked: S.L != null, lockStep: S.L, Hlock: S.L != null ? S.HL : null }; }
        function lock(n, ev) {
          S.L = n; S.cL = S.c; S.HL = S.H; S.sL = sOf(S.HL); S.rho = rho0 * S.sL; S.w = Math.max(C.SWING_MIN, S.sL);
          S.tP = n * H + Math.max(0, plant - S.cL) / S.sL; S.nA = Math.ceil((S.tP + cap) / H - 1e-9);
          var W = Wat(S.HL), v = vAt(S.HL);
          S.PW = { H: S.HL, band: band(S.HL), deg: deg(S.HL), s: S.sL, W: W, speed: v, kmh: Math.round(v * 3.6), coneK: 1 + C.CONE_K * Math.pow(S.HL, 3), wobA: wobA(S.HL), touch: isTouch() };
          ev.push({ type: 'lock', n: n });
        }
        // one sim step: the queued edges Q (record order), the heat, the clock, the lock, the strike, then the clip
        function advance(n, Q) {
          var ev = [], rels = [], i, e;
          if (S.started && S.L == null) S.r *= DEC;
          for (i = 0; i < Q.length; i++) {
            e = Q[i];
            if (e[0] === 1) {
              S.presses++;
              if (!S.down) { S.down = true; S.downFrom = e[1]; }
              if (S.L != null) { S.mashed++; ev.push({ type: 'mash', n: e[1] }); continue; }
              if (S.lastRaw != null && (e[1] - S.lastRaw) * H < C.TAP_FLOOR - 1e-9) { S.lastRaw = e[1]; S.ignored++; ev.push({ type: 'ignored', n: e[1] }); continue; }
              S.lastRaw = e[1]; S.r += 1 / C.RATE_TAU; S.accepted++;
              if (!S.started) { S.started = true; S.nS = n; S.c = c0; ev.push({ type: 'start', n: n }); }
              ev.push({ type: 'tap', n: e[1], ok: true });
            } else { rels.push([e[1], S.down ? S.downFrom : null]); S.down = false; S.downFrom = null; }
          }
          if (S.started && S.L == null) {
            S.Hs = hstar(S.r);
            // (fix-i4, D5) KICK held inside the HOLD lead-in (HOLD_LEAD before the lock at the live pace, where the HUD's
            // HOLD glow lights) keeps the heat it has: obeying HOLD costs nothing; letting go, or holding earlier, cools
            var holdIn = S.down && (cJ - S.c) / Math.max(1e-6, sOf(S.H)) <= C.HOLD_LEAD + 1e-9;
            S.H = S.Hs > S.H ? S.H + (S.Hs - S.H) * RISEK : holdIn ? S.H : Math.max(S.Hs, S.H - C.COOL * H);
            S.rate = sOf(S.H);
            if (n > S.nS) { S.c += H * S.rate; if (S.c >= cJ - 1e-12) lock(n, ev); }
          }
          // the strike's release: the first stamped at or after the lock (a release stamped before it is a tap's, even
          // applied after it); with a grace, not one ending a hold begun before the lock inside the grace (D9); at or past
          // the auto's step the auto stands
          if (S.L != null && S.rel == null) {
            for (i = 0; i < rels.length; i++) {
              var st = rels[i][0], df = rels[i][1], gr = grace();
              if (st < S.L) continue;
              if (gr > 0 && st < S.L + gr / H - 1e-9 && df != null && df < S.L) continue;
              if (st >= S.nA) break;
              S.rel = st; S.auto = false; ev.push({ type: 'release', n: st }); break;
            }
            if (S.rel == null && n >= S.nA) { S.rel = S.nA; S.auto = true; ev.push({ type: 'auto', n: S.nA }); }
          }
          var cl = !S.started ? { c: c0, rate: 0, hang: 0, phase: 'set' } : S.L == null ? { c: S.c, rate: S.rate, hang: 0, phase: 'tap' } : post(n);
          if (S.started && S.L == null) S.hist[n] = [S.c, S.rate];
          var prev = S.lastC;
          for (i = 0; i < FEET.length; i++) if (FEET[i][1] > prev + 1e-9 && FEET[i][1] <= cl.c + 1e-9) ev.push({ type: 'step', i: i, foot: FEET[i][0], pre: FEET[i][2], plant: Math.abs(FEET[i][1] - plant) < 1e-6 });
          if (plant > prev + 1e-9 && plant <= cl.c + 1e-9) ev.push({ type: 'plant' });
          if (S.rel != null && !S.contactDone) { var nC = contactStep(S.rel); if (nC <= n) { S.contactDone = true; ev.push({ type: 'contact', n: nC, late: n - nC }); } }
          S.lastN = n; S.lastC = cl.c;
          var out = { c: cl.c, rate: cl.rate, hang: cl.hang, phase: cl.phase, heat: heatNow(), events: ev };
          if (cl.held != null) out.held = cl.held;
          S.last = out;
          return out;
        }
        // the contact the keeper sees at sim time ts (READ_LAT late): exact once the strike is released by then; in the
        // stride, the nominal one; in the hang, a release now; before the lock, the live prediction (he has no plan then)
        function seen(ts) {
          var m = Math.floor((+ts || 0) / H + 1e-6);
          if (S.L == null || m < S.L) return { contact: predictC(m), hang: false, released: false, locked: false };
          var rr = relAt(m);
          if (rr != null) return { contact: contactStep(rr) * H, hang: false, released: true };
          if (cLin(m) < plant) return { contact: S.tP + PC / S.w, hang: false, released: false };
          return { contact: m * H + PC / (S.w * aOf(m * H - S.tP)), hang: true, released: false };
        }
        // before the lock: n H + (plant - c) / s + (contact - plant) / max(1, s), at the live clock and rate
        function predictC(n) {
          var s1 = S.started ? sOf(S.H) : C.S_MIN, c = S.started ? S.c : c0, nn = n != null ? n : (S.lastN || 0);
          if (S.started && S.lastN != null && nn > S.lastN) c = Math.min(plant, c + (nn - S.lastN) * H * s1);
          return nn * H + Math.max(0, plant - c) / s1 + PC / Math.max(C.SWING_MIN, s1);
        }
        var TK = {
          meta: K, c0: c0, cJ: cJ, pre: PR, feet: FEET, plant: plant, contact: contact, stub: !!K.stub,
          // queue one of KICK's edges for the next step (call before tk.step(n), in the record's order)
          input: function (kind, stamp) {
            var k = kind === 'press' || kind === 1 || kind === true ? 1 : 0;
            S.q.push([k, stamp != null && isFinite(+stamp) ? Math.round(+stamp) : (S.lastN != null ? S.lastN + 1 : 0)]);
            return TK;
          },
          // advance to step n. A step already run returns its state again (no events; edges queued since wait for the
          // next one); a skipped step is run with no edges, so the clock never depends on how often this is called
          step: function (n) {
            n = Math.round(+n || 0);
            if (S.lastN != null && n <= S.lastN) { var l = S.last || clip(n); return { c: l.c, rate: l.rate, hang: l.hang, phase: l.phase, heat: heatNow(), events: [] }; }
            var pre0 = [];
            if (S.started && S.lastN != null) for (var m = S.lastN + 1; m < n; m++) pre0 = pre0.concat(advance(m, []).events);
            var Q = S.q; S.q = [];
            var out = advance(n, Q);
            if (pre0.length) out.events = pre0.concat(out.events);
            return out;
          },
          setTouch: function (v) { touchSet = v == null ? null : !!v; },
          started: function () { return S.started; },
          locked: function () { return S.L != null; },
          released: function () { return S.rel != null; },
          abort: function () { fresh(); },
          heat: heatNow,
          // the locked heat's power (tap contract §2.5): null before the lock
          power: function () { return S.PW ? Object.assign({}, S.PW) : null; },
          // the window now: at the live heat before the lock (the HUD's narrowing sweet spot), the locked one after
          windowNow: function () { return S.PW ? S.PW.W : Wat(S.H); },
          grade: function () {
            if (S.rel == null) return null;
            var g = gradeOf(S.rel * H - S.tP, S.PW.W, S.auto); g.H = S.HL; g.band = S.PW.band; return g;
          },
          predictContact: function (n) {
            if (S.L != null) { var s = seen((n != null ? n : S.lastN) * H); return s.contact; }
            return predictC(n);
          },
          // the steps from n to the lock at the live rate (0 once locked, or when it comes at n)
          predictLock: function (n) {
            if (S.L != null) return 0;
            var s1 = S.started ? sOf(S.H) : C.S_MIN, c = S.started ? S.c : c0, last = S.started && S.lastN != null ? S.lastN : (n != null ? n - 1 : 0);
            var mL = last + Math.max(1, Math.ceil((cJ - c) / (s1 * H) - 1e-9));
            return Math.max(0, mL - (n != null ? n : last + 1));
          },
          nominal: function () {
            if (S.L == null) return null;
            return { lockStep: S.L, lockT: S.L * H, plantT: S.tP, contactT: S.tP + PC / S.w, s: S.sL, W: S.PW.W, plant: plant, contact: contact, cJ: cJ, c0: c0, autoStep: S.nA };
          },
          steps: function () {
            return { start: S.nS, lock: S.L, release: S.rel, auto: S.auto, contact: S.rel != null ? contactStep(S.rel) : null,
              presses: S.presses, accepted: S.accepted, ignored: S.ignored, mashed: S.mashed };
          },
          contactStep: function () { return S.rel != null ? contactStep(S.rel) : null; },
          clip: clip, seen: seen,
          // the aim yaw the carrier turns through over the last stride (design §4.6; Ma may compute its own)
          aim: function (dy) { dYaw = dy || 0; },
          yawAt: function (c) { return base + dYaw * sstep(cJ, plant, c); },
          // the tell layer (critique #25): from the locked aim. Signs: positive turns toward world +x. aimSide in [-1, 1]
          // is aim x over the half-mouth. A right-footer's natural side is his left (world -x): a shot there lengthens the
          // last stride by up to 8%, the open side shortens it (an assumption the owner can flip: stride sign).
          tells: function (aimX) {
            var s = clamp((aimX || 0) / C.MOUTH, -1, 1), natural = K.foot === 'L' ? 1 : -1, last = null, st = K.stance || [];
            for (var i = st.length - 1; i >= 0; i--) if (st[i][1] < plant - 1e-6 && st[i][1] >= cJ - 1e-6) { last = st[i][1]; break; }
            return { aimSide: s, plantYaw: 0.8 * s * 20 * PI / 180, hipYaw: s * 10 * PI / 180, shoulderYaw: s * 10 * PI / 180,
              stride: 1 + 0.08 * s * natural,
              lastStride: K.lastStride || null, from: last != null ? last : cJ, to: plant };
          }
        };
        return TK;
      }

      /* ------------------------------------------------------------------------- a scripted player (tap contract §2.10) -- */
      // spec: { start (the first press's step), rate (taps/s, or [[secondsFromStart, rate], ...] piecewise; a plain 0 is
      // one press, held), duty 0.45 (the share of each interval held), stopBefore 0 (s before the predicted lock: that
      // press is held), mash false (keep tapping through the stride: the first release is the strike), releaseMs 0 | null
      // (against the nominal plant; null: never, the auto), jitter 0 (ms, seeded by seed) }. edges(n, tk), called before
      // tk.step(n), returns [[kind (1 press, 0 release), stamp = n], ...] due at n. Pure: a function of the spec and the
      // taker's own state. Without mash a press down at the lock is held (no release falls on the lock's own step)
      function pilot(spec) {
        var s = spec || {}, start = Math.round(s.start != null ? +s.start : 24), duty = s.duty != null ? clamp(+s.duty, 0.05, 0.95) : 0.45;
        var stopBefore = Math.max(0, +s.stopBefore || 0), mash = !!s.mash, relMs = s.releaseMs === null ? null : +s.releaseMs || 0;
        var jit = Math.max(0, +s.jitter || 0), R = rng(((s.seed >>> 0) || 0x7A9) >>> 0), PW = Array.isArray(s.rate);
        function rateAt(t) {
          if (!PW) return Math.max(0, +s.rate || 0);
          var v = 0; for (var i = 0; i < s.rate.length; i++) if (t >= +s.rate[i][0] - 1e-9) v = Math.max(0, +s.rate[i][1] || 0);
          return v;
        }
        // the first time >= t whose rate is > 0 (piecewise), else null
        function onAt(t) {
          if (rateAt(t) > 0) return t;
          if (!PW) return null;
          var best = null; for (var i = 0; i < s.rate.length; i++) { var t1 = +s.rate[i][0]; if (t1 > t && (+s.rate[i][1] || 0) > 0 && (best == null || t1 < best)) best = t1; }
          return best;
        }
        var P = { nextT: 0, nextStep: start, relAt: null, down: false, stop: false, post: false, pressedPost: false, target: null, log: [] };
        function stepOf(t) { return start + Math.round(t / H) + (jit > 0 ? Math.round(R.gauss() * jit / 1000 / H) : 0); }
        // after the press at step n: its release and the next press
        function plan(n) {
          var t = P.nextT, f = rateAt(t);
          if (!PW && !(f > 0)) { P.relAt = null; P.nextStep = null; return; }        // a plain rate 0: one press, held
          var iv = f > 0 ? 1 / f : 0.1, tn = onAt(t + iv);
          P.nextT = tn; P.nextStep = tn == null ? null : Math.max(n + 1, stepOf(tn));
          var rs = Math.max(n + 1, start + Math.round((t + duty * iv) / H));
          if (P.nextStep != null && rs > P.nextStep) rs = P.nextStep;
          P.relAt = rs;
        }
        function edges(n, tk) {
          var out = [];
          function emit(k) { out.push([k, n]); if (P.log.length < 4000) P.log.push([n, n, k]); }
          if (tk && tk.released && tk.released()) return out;
          var locked = !!(tk && tk.locked && tk.locked());
          if (!locked || mash) {
            var near = !mash && !locked && tk && tk.predictLock ? tk.predictLock(n) <= 1 : false;
            if (P.down && P.relAt != null && n >= P.relAt && !near) { emit(0); P.down = false; P.relAt = null; }
            if (!P.down && !P.stop && P.nextStep != null && n >= P.nextStep && !near) {
              emit(1); P.down = true;
              if (!locked && stopBefore > 0 && tk && tk.predictLock && tk.predictLock(n) * H <= stopBefore + 1e-9) { P.stop = true; P.relAt = null; P.nextStep = null; }
              else plan(n);
            }
            return out;
          }
          // after the lock: a press down stays down (held); else one press; the release at the nominal plant + releaseMs
          if (!P.post) {
            P.post = true; P.stop = true; P.relAt = null; P.nextStep = null;
            var nom = tk.nominal ? tk.nominal() : null;
            P.target = relMs == null || !nom ? null : Math.round(nom.plantT / H + relMs / 1000 / H);
          }
          if (!P.down && !P.pressedPost) { emit(1); P.down = true; P.pressedPost = true; }
          if (P.down && P.target != null && n >= P.target) { emit(0); P.down = false; }
          return out;
        }
        return { spec: s, start: start, edges: edges, log: function () { return P.log.slice(); }, down: function () { return P.down; } };
      }

      /* ======================================================================================= the keeper (K2) == */
      // the keeper body's leg table (shootout-keeper.js TABLE, Mb-to-K ask 1), copied so the leg colliders are where the
      // legs are drawn (punch-list B5): body frame (+x his left, +y up the trunk, +z ahead), offsets from the root bone's
      // head on the reference male (x rootH / 0.99626), written diving to his LEFT: [near leg, far leg]. foot: the ankle;
      // knee: the knee's pole; air: 1 the leg follows the table, 0 the foot stays planted
      var LEGS = {
        load: { foot: [[0.55, -0.70, 0.10], [-0.30, -0.72, 0.02]], knee: [[0.75, -0.30, 1.0], [-0.45, -0.40, 1.0]], air: [0, 0] },
        push: { foot: [[0.16, -0.93, -0.06], [0.04, -0.58, 0.34]], knee: [[0.30, -0.45, 1.0], [0.25, -0.05, 1.0]], air: [0, 1] },
        lo: { foot: [[0.08, -0.94, -0.10], [-0.04, -0.90, -0.02]], knee: [[0.15, -0.45, 1.0], [0.05, -0.45, 1.0]], air: [1, 1] },
        hi: { foot: [[0.12, -0.94, -0.10], [-0.02, -0.62, 0.22]], knee: [[0.22, -0.45, 1.0], [0.08, -0.25, 1.0]], air: [1, 1] },
        land: { foot: [[0.06, -0.80, 0.14], [-0.08, -0.76, 0.26]], knee: [[0.0, -0.32, 1.0], [-0.1, -0.30, 1.0]], air: [1, 1] }
      };
      //   opts: { dims (ShootBrain.dims(...)), seed (the kick seed: mind games on seed ^ 0xA1), skill (0..1), x (x_k),
      //           antics (M1: false), ballSpeed (what he believes), stare: [x,y,z] }
      function keeper(opts) {
        var o = opts || {}, D = o.dims && o.dims.reach ? o.dims : MALE, skill = o.skill != null ? clamp(o.skill, 0, 1) : C.SKILL;
        var seed = (o.seed >>> 0) || 1, mindR = rng((seed ^ 0xA1) >>> 0);
        var xk = o.x != null ? o.x : (mindR.next() < 0.5 ? -1 : 1) * lerp(C.XK[0], C.XK[1], mindR.next());
        var bobPhase = mindR.next() * 2 * PI, antics = [], tA = 2 + 2 * mindR.next();
        for (var ai = 0; ai < 16; ai++) {
          var kind = ['wide', 'clap', 'shuffle'][Math.min(2, Math.floor(mindR.next() * 3))], dur = kind === 'wide' ? 1.4 : kind === 'clap' ? 0.3 : 0.96;
          antics.push({ kind: kind, t0: tA, dur: dur, dir: mindR.next() < 0.5 ? -1 : 1 }); tA += dur + 2 + 2 * mindR.next();
        }
        var READY_Y = D.rootH - C.READY_DROP * D.k, LOAD_Y = D.rootH - C.LOAD_DROP * D.k, LIE_Y = C.LIE_Y * D.rootH / 0.99626;
        var HOME = [xk, READY_Y, C.LINE], stare = o.stare || [0, 1.6, -38.9], mind0 = null, outcome = null;
        var P = null, S = null, track = null, prevCol = null, prevColT = null, seenContact = null;

        function fresh() {
          return { t: null, phase: 'ready', committed: false, split: false, loadT: null, pushT: null, dive: null, landT: null, landP: null, landV: null,
            downT: null, getT: null, hands: null, react: false, lastKS: null, rootPush: null, feet0: null,
            ex: 0, shufLift: 0, line: null, linePl: null, reloadT: null, prevSd: null, stepT: null };
        }
        S = fresh();

        function mind(t) {
          if (mind0 == null) mind0 = t;
          var ts = t - mind0, bob = -C.BOB * (0.5 - 0.5 * Math.cos(2 * PI * C.BOB_HZ * ts + bobPhase)), an = null, au = 0, ad = 0, w = 0, x = 0;
          if (o.antics) for (var i = 0; i < antics.length; i++) {
            var A = antics[i];
            if (ts >= A.t0 && ts < A.t0 + A.dur) {
              var u = (ts - A.t0) / A.dur; an = A.kind; au = u; ad = A.dir; w = Math.min(sstep(0, 0.15, u), 1 - sstep(0.85, 1, u));
              if (A.kind === 'shuffle') x = A.dir * 0.25 * sstep(0, 1, u);
            }
          }
          // (antic: null or 'wide' | 'clap' | 'shuffle'; anticU its progress 0..1; w its weight; x a shuffle's offset)
          return { bob: bob, antic: an, anticU: au, anticDir: ad, w: w, x: x, look: stare.slice() };
        }

        // the believed flight from the spot to the keeper's plane at z, toward the believed point I
        function flightTo(I, z, speed) {
          var d = Math.sqrt(Math.pow(z - C.BALL[2], 2) + I[0] * I[0] + Math.pow(I[1] - C.BALL[1], 2));
          var v = Math.max(5, speed || C.BALL_SPEED), y = clamp(I[1], 0, 2.4), u = (22 / v) * (22 / v), E = C.DRAG_EST;
          return d / v * (E[0] + E[1] * y + (E[2] + E[3] * y) * u);
        }
        // the strike as he reads it from the swing (power, and the lean that lifts or drops the ball): told by the director
        // (KP.strike, the sim's own cone), else read from the taker's grade with §3.6's rule, else what he believed
        function strikeNow() {
          if (P && P.strikeSet) return { speed: P.speed, bias: P.bias };
          var g = track && track.grade ? track.grade() : null, pw = track && track.power ? track.power() : null;
          var base = pw && pw.speed > 0 ? pw.speed : P ? P.speed : C.BALL_SPEED;
          return g ? { speed: speedOf(g, base), bias: biasOf(g) } : { speed: P ? P.speed : C.BALL_SPEED, bias: 0 };
        }

        // the decision, made at the lock (tap contract §2.8: the last stride begins; design §4.1). The draws are made in a
        // fixed order whatever the branch, so neither the tap rate nor the release ever changes the keeper's choice: only
        // the aim and the timing. q.ballSpeed is what he believes from the run-up's pace (the heat's base launch speed).
        //   q: { aim: [x, y], contactT, tell (M1: 1), force: { side, delta, read: 'correct'|'wrong'|'exact', stay, point, vz } }
        function decide(q, r0) {
          var R = r0 || rng((seed ^ 0xB2) >>> 0), F = q.force || {};
          var u1 = R.next(), u2 = R.next(), u3 = R.next(), g1 = R.gauss(), g2 = R.gauss(), u4 = R.next(), u5 = R.next(), u6 = R.next();
          var aim = [Number(q.aim[0]) || 0, Number(q.aim[1]) || 0], tell = q.tell != null ? q.tell : 1;
          // (fix-i4, D3: power factors into his guessing, the owner's words) a hotter run-up tells him less: the read's
          // edge shrinks by TELL_K H^2 at the locked heat (q.heat; none told, none taken)
          var hq = q.heat != null ? clamp(+q.heat || 0, 0, 1) : null;
          if (hq != null) tell *= 1 - C.TELL_K * hq * hq;
          var delta = F.delta != null ? clamp(F.delta, 0, 0.4) : lerp(C.DELTA[0], C.DELTA[1], u1);
          // (fix-i4, D2/D3: power factors into his guessing, the owner's words) a slow run-up is read early: below READ_V
          // his commit comes up to READ_EARLY sooner (the same draw; a forced delta is kept), time he spends stepping across
          var bsp = q.ballSpeed || o.ballSpeed || C.BALL_SPEED, early0 = F.delta != null ? 0 : C.READ_EARLY * clamp((C.READ_V - bsp) / (C.READ_V - C.V0), 0, 1);
          var pC = 0.5 + 0.3 * (1 - (clamp(delta, C.DELTA[0], C.DELTA[1]) - C.DELTA[0]) / (C.DELTA[1] - C.DELTA[0])) * tell * skill;
          var correct = F.read === 'correct' || F.read === 'exact' ? true : F.read === 'wrong' ? false : u3 < pC;
          // (fix-i4, D2: a correct read of a shot down the middle is a read of the middle: he stays, never pushed out to a
          // side by MIN_X; a forced side or point is obeyed)
          var centre = correct && !F.point && !F.side && Math.abs(aim[0]) < C.CENTRE_X;
          var stay = F.stay != null ? !!F.stay : (u2 < C.STAY || centre);
          var sTrue = aim[0] >= 0 ? 1 : -1, I;
          if (F.point) I = [Number(F.point[0]) || 0, Number(F.point[1]) || 1];
          else if (F.read === 'exact') I = [clamp(aim[0], -3.45, 3.45), clamp(aim[1], 0.15, 2.3)];
          else if (correct) I = [clamp(aim[0] + C.NOISE[0] * g1, -3.45, 3.45), clamp(aim[1] + C.NOISE[1] * g2, 0.15, 2.3)];
          else I = [-sTrue * lerp(C.WRONG_X[0], C.WRONG_X[1], u4), lerp(C.WRONG_Y[0], C.WRONG_Y[1], u5)];
          // a forced side the believed point does not lie on: the dive goes there all the same (a guess that way)
          if (F.side && !F.point && (I[0] >= 0 ? 1 : -1) !== F.side) I = [F.side * lerp(C.WRONG_X[0], C.WRONG_X[1], u4), lerp(C.WRONG_Y[0], C.WRONG_Y[1], u5)];
          var side = stay ? 0 : (I[0] >= 0 ? 1 : -1);
          if (!stay && !F.point && Math.abs(I[0]) < C.MIN_X) I = [side * C.MIN_X, I[1]];
          var vz = F.vz != null ? F.vz : lerp(C.VZ[0], C.VZ[1], u6);
          var cT = q.contactT != null ? q.contactT : 0;
          P = { side: side, stay: stay, I: I, aim: aim, delta: delta + early0, delta0: delta, early: early0, correct: correct, pCorrect: pC, vz: stay ? 0 : vz, contactT: cT, commitT: cT - delta - early0,
            speed: q.ballSpeed || o.ballSpeed || C.BALL_SPEED, forced: !!q.force };
          S = fresh(); seenContact = null; outcome = null;
          return P;
        }

        // the dive's arc (§4.2, measured dims, critique #1/#17/#30). Pure: from the root at push-off, the push time and the
        // believed arrival, the clamped ballistic root, and whether the hands can get to I. In the keeper's own plane:
        //   the body line at elevation phi from the side, the root target Ri = I - L (side cos phi, sin phi)
        function plan(Pl, q) {
          var s = Pl.side || 1, I = Pl.I, P0 = q.P0 || [xk + s * C.SHIFT, LOAD_Y, C.LINE], vz = Pl.vz || 0;
          var pushT = q.pushT != null ? q.pushT : (Pl.commitT != null ? Pl.commitT : (q.contactT || 0) - (Pl.delta || 0)) + C.LOAD;
          var contactT = q.contactT != null ? q.contactT : (Pl.contactT || 0), speed = q.ballSpeed || Pl.speed;
          // the arrival: the believed ball at the plane he will have moved forward to (two passes), his shoulders' plane
          var arriveT = q.arriveT, T = 0, zP = P0[2];
          for (var it = 0; it < 2; it++) {
            var at = arriveT != null ? arriveT : contactT + flightTo(I, zP + D.shFwd + C.HAND_FWD, speed);
            T = Math.max(0.2, at - pushT); zP = P0[2] + vz * T;
          }
          if (arriveT == null) arriveT = contactT + flightTo(I, zP + D.shFwd + C.HAND_FWD, speed);
          T = Math.max(0.2, arriveT - pushT);
          // the believed point I is on the goal line; he meets the ball earlier on its way: the crossing of his plane
          // (straight in x, and in y with the flight's sag: + g Tf^2 s (1 - s) / 2)
          var zPlane = zP + D.shFwd + C.HAND_FWD, sF = clamp((zPlane - C.BALL[2]) / (C.GZ - C.BALL[2]), 0, 1), Tf = flightTo(I, C.GZ, speed);
          var Ip = q.Ip ? [q.Ip[0], q.Ip[1]] : [I[0] * sF, C.BALL[1] + (I[1] - C.BALL[1]) * sF + 0.5 * GRAV * Tf * Tf * sF * (1 - sF)];
          var hgt = clamp((Ip[1] - 0.25) / 1.85, 0, 1), phi = lerp(C.PHI[0], C.PHI[1], hgt) * PI / 180, L = D.L;
          var Ri = [Ip[0] - s * L * Math.cos(phi), Ip[1] - L * Math.sin(phi)];
          // (a low ball: the root no lower than RI_Y, the body line flattened so the gloves still end at the point)
          if (Ri[1] < C.RI_Y) { phi = Math.asin(clamp((Ip[1] - C.RI_Y) / L, -0.17, 1)); Ri = [Ip[0] - s * L * Math.cos(phi), C.RI_Y]; }
          // a point near the body: the root still goes MIN_SHIFT toward it, and the line points from there to the point
          if (s * (Ri[0] - P0[0]) < C.MIN_SHIFT) {
            Ri[0] = P0[0] + s * C.MIN_SHIFT;
            var dx = s * (Ip[0] - Ri[0]), cp = clamp(dx / L, -1, 1);
            phi = dx <= 0 ? C.PHI_MAX * PI / 180 : Math.min(C.PHI_MAX * PI / 180, Math.acos(cp));
            Ri[1] = Math.max(C.RI_Y, Ip[1] - L * Math.sin(phi));
            if (Ip[1] - L * Math.sin(phi) < C.RI_Y) phi = Math.asin(clamp((Ip[1] - C.RI_Y) / L, -0.17, 1));
          }
          var want = [(Ri[0] - P0[0]) / T, (Ri[1] - P0[1] + 0.5 * GRAV * T * T) / T];
          var v0 = [clamp(want[0], -C.VX, C.VX), clamp(want[1], C.VY[0], C.VY[1]), vz];
          var vt = Math.hypot(v0[0], v0[1]);
          if (vt > C.VMAX) { var kv = C.VMAX / vt; v0[0] *= kv; v0[1] = Math.max(C.VY[0], v0[1] * kv); }
          var clamped = { x: Math.abs(v0[0] - want[0]) > 1e-9, y: Math.abs(v0[1] - want[1]) > 1e-9, total: vt > C.VMAX };
          // where that arc has the root at arrival, and the shoulders there (rolled pi/2 - phi to side s): can the gloves,
          // SEP either side of the point, get there?
          var RT = [P0[0] + v0[0] * T, P0[1] + v0[1] * T - 0.5 * GRAV * T * T, P0[2] + vz * T];
          var B = basis(0, s * (PI / 2 - phi), 0), top = s > 0 ? -1 : 1, nUp = norm(sub([0, 1, 0], mul(B.u, B.u[1])));
          var Iw = [Ip[0], Ip[1], RT[2] + D.shFwd + C.HAND_FWD], gap = -Infinity, gapI = Infinity;
          [-1, 1].forEach(function (k) {
            var Sh = bodyPt(RT, B, k * D.shAcross, D.shUp, D.shFwd), Hk = add(Iw, mul(nUp, (k === top ? 1 : -1) * C.SEP));
            gap = Math.max(gap, dist(Hk, Sh) - C.REACH_CLAMP * D.reach);
            gapI = Math.min(gapI, dist(Iw, Sh) - C.REACH_CLAMP * D.reach);
          });
          // the verdict (critique #17): reachable = a glove can touch the believed ball where it crosses his plane (the
          // nearer glove centre within ball + glove radius of it); full = both gloves get to their places SEP either side
          // (fix-i4: never rolled past side-on, chest to the turf, for a line below the root's floor: the drawn arm went
          // under the turf on a read ball that dipped)
          return { side: s, I: I.slice(), Ip: Ip, Iw: Iw, P0: P0.slice(), pushT: pushT, arriveT: arriveT, T: T, phi: phi, roll: s * (PI / 2 - Math.max(C.ROLL_PHI, phi)), L: L, Ri: Ri,
            v0: v0, want: want, clamped: clamped, rootAt: RT, gap: gap, gapI: gapI, full: gap <= 1e-6, reachable: gapI <= C.R + 0.10, touchable: gapI <= C.R + 0.10 };
        }

        // the leg table's blended value of one field for leg i (0 = his left), mirrored for the side as the body does it
        // (side -1: leg i reads the other leg's entry, x negated); body-frame metres on the reference male
        function legTable(field, i, W, sd) {
          var x = 0, y = 0, z = 0, sum = 0;
          for (var nm in LEGS) {
            var w = W && W[nm] > 1e-4 ? W[nm] : 0; if (!w) continue;
            var e = LEGS[nm][field][sd > 0 ? i : 1 - i];
            if (field === 'air') { x += e * w; sum += w; continue; }
            x += e[0] * w; y += e[1] * w; z += e[2] * w; sum += w;
          }
          if (!(sum > 0)) return field === 'air' ? 1 : [0, -0.9, 0];
          return field === 'air' ? x / sum : [sd * x / sum, y / sum, z / sum];
        }

        // the contact as he sees it (REACT late): the taker's own prediction, or the true one once seen
        function contactEst(t) {
          if (seenContact != null && t >= seenContact + C.REACT) return { contact: seenContact, hang: false, released: true, seen: true };
          if (track && track.seen) { var s = track.seen(t - C.READ_LAT); if (s) return s; }
          return { contact: P ? P.contactT : t, hang: false, released: false };
        }

        // the ball's crossing of the keeper's plane at z, predicted from its state (straight line plus gravity)
        function crossing(ball, z) {
          if (!ball || !ball.p || !ball.v) return null;
          var p = ball.p, v = ball.v;
          if (v[2] > -0.5) return null;
          var tau = Math.max(0, (z - p[2]) / v[2]);
          return [p[0] + v[0] * tau, Math.max(C.R, p[1] + v[1] * tau - 0.5 * GRAV * tau * tau), z];
        }
        // (fix-i4) the ball's line as he reads it: its free flight from its state to the plane z, [x, y, t] where it crosses
        // (or null): ShootSim's own free flight mirrored (its fly(): the midpoint step at 120 Hz, the drag, the spin's lift
        // and its decay, the bounce that turns the spin into a roll's, the roll) as DRAG_EST mirrors its timing, since the
        // brain reads no sim. What a keeper watching it would judge; never the sim's flight, and no frame, net or keeper
        function lineOf(ball, z) {
          if (!ball || !ball.p || !ball.v || ball.v[2] > -0.5) return null;
          // (no spin given: a kick's own backspin, 5 rev/s about v x up, as ShootSim.spinFor gives it)
          var w0 = ball.w, hv = Math.hypot(ball.v[0], ball.v[2]) || 1;
          if (!w0) w0 = [-ball.v[2] / hv * 10 * PI, 0, ball.v[0] / hv * 10 * PI];
          var B = { p: ball.p.slice(), v: ball.v.slice(), w: w0.slice(), roll: false }, t = +ball.t || 0, A = [0, 0, 0], E = C.LINE_E;
          function acc(px, py, pz, vx, vy, vz) {
            var ax = 0, ay = B.roll ? 0 : -GRAV, az = 0, sp = Math.sqrt(vx * vx + vy * vy + vz * vz), w = B.w;
            if (sp > 1e-9) {
              var kd = C.LINE_KD * sp; ax -= kd * vx; ay -= kd * vy; az -= kd * vz;
              if (!B.roll) {
                var wm = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
                if (wm > 1e-9) { var cl = Math.min(C.LINE_CL[0], C.LINE_CL[1] * C.R * wm / sp), kl = C.LINE_KL * cl * sp / wm; ax += kl * (w[1] * vz - w[2] * vy); ay += kl * (w[2] * vx - w[0] * vz); az += kl * (w[0] * vy - w[1] * vx); }
              } else { var hs = Math.sqrt(vx * vx + vz * vz); if (hs > 1e-9) { ax -= E[3] * vx / hs; az -= E[3] * vz / hs; } }
            }
            A[0] = ax; A[1] = B.roll && ay < 0 ? 0 : ay; A[2] = az; return A;
          }
          for (var i = 0; i < 480; i++) {
            var p = B.p, v = B.v, h2 = H / 2, xa = p[0], ya = p[1], za = p[2];
            var a1 = acc(p[0], p[1], p[2], v[0], v[1], v[2]).slice(), ux = v[0] + a1[0] * h2, uy = v[1] + a1[1] * h2, uz = v[2] + a1[2] * h2;
            var a2 = acc(p[0] + v[0] * h2, p[1] + v[1] * h2, p[2] + v[2] * h2, ux, uy, uz);
            p[0] += ux * H; p[1] += uy * H; p[2] += uz * H; v[0] += a2[0] * H; v[1] += a2[1] * H; v[2] += a2[2] * H;
            if (B.roll) { B.w = [v[2] / C.R, 0, -v[0] / C.R]; } else { var k = Math.exp(-H / E[4]); B.w = [B.w[0] * k, B.w[1] * k, B.w[2] * k]; }
            if (p[1] < C.R) {
              if (v[1] < 0) {
                if (!B.roll && -v[1] > E[2]) { var sp = -v[1]; v[1] = E[0] * sp; v[0] *= E[1]; v[2] *= E[1]; B.w = [0.5 * B.w[0] + 0.5 * v[2] / C.R, 0.5 * B.w[1], 0.5 * B.w[2] - 0.5 * v[0] / C.R]; }
                else { v[1] = 0; B.roll = true; }
              }
              p[1] = C.R;
            } else if (B.roll && (p[1] > C.R + 1e-4 || v[1] > 0.05)) B.roll = false;
            t += H;
            if (za >= z && p[2] < z) { var f = (za - z) / (za - p[2]); return [xa + (p[0] - xa) * f, ya + (p[1] - ya) * f, t - H + f * H]; }
            if (B.roll && v[0] * v[0] + v[2] * v[2] < 0.01) return null;
            if (v[2] >= 0 && p[2] > z) return null;
          }
          return null;
        }

        // ------------------------------------------------------------------------------------- the state, per step --
        function state(t, ball) {
          var dt = S.t == null ? H : Math.max(0, t - S.t); S.t = t;
          if (ball && ball.contactT != null && seenContact == null) seenContact = ball.contactT;
          var KS = { t: t, phase: 'ready', root: null, roll: 0, pitch: 0.30, yaw: 0, w: { ready: 1, load: 0, push: 0, lo: 0, hi: 0, land: 0, block: 0 },
            side: P ? P.side : 0, getupT: 0, look: null, mind: null };
          var root, roll = 0, pitch = 0.30, ph = 'ready', s = P ? (P.side || 0) : 0, sd = s || 1;
          var M = mind(t);
          if (!P) {
            root = [HOME[0] + M.x, READY_Y, HOME[2]]; KS.mind = M;
          } else {
            // before the commit: retime from what he sees, and freeze it once the split-step starts
            if (!S.split && !S.committed) {
              var ce = contactEst(t); P.commitT = ce.contact - P.delta;
              if (t >= P.commitT - C.SPLIT) S.split = true;
            }
            if (!S.committed && t >= P.commitT) { S.committed = true; S.loadT = t; }
            // (fix-i4) the ball he sees: from contact + REACT he reads its line once (a block's jump reads it too); while he
            // is on the turf he dives for it, not his guess; the other side only with SWITCH_T to go, and SWITCH_LOAD to
            // load again (D1: no slow ball beats a keeper who is still standing)
            if (ball && seenContact != null && t >= seenContact + C.REACT && !S.line && S.landT == null) {
              S.line = lineOf(ball, C.LINE) || 'none'; S.lineT = t;
              S.linePl = lineOf(ball, C.LINE + D.shFwd + C.HAND_FWD + (P.stay ? C.VZ[0] : P.vz) * C.FLY_MAX);
              // (a ball plainly going wide or over he lets go: no dive for it, no change of side)
              if (S.line !== 'none' && (Math.abs(S.line[0]) > C.MOUTH + C.LET_GO[0] || S.line[1] > C.BAR + C.LET_GO[1])) S.line = 'none';
              if (S.line !== 'none' && S.committed && S.pushT == null) {
                var LX = clamp(S.line[0], -C.TRACK_X, C.TRACK_X), LY = clamp(S.line[1], C.TRACK_Y[0], C.TRACK_Y[1]), ls = LX >= 0 ? 1 : -1;
                var togo = (S.linePl || S.line)[2] - t;
                if (P.stay) {
                  // (a keeper who stayed and sees a slow ball going past his block dives for it, when there is time)
                  if (Math.hypot(LX - HOME[0], LY - (LOAD_Y + D.shUp)) > C.BLOCK_REACH && togo >= C.STAY_DIVE_T) {
                    P.stay = false; P.side = ls; P.vz = C.VZ[0]; P.I = [LX, LY]; P.tracked = true; P.switched = true; S.reloadT = t; S.stepT = t;
                  }
                } else if (ls === P.side || Math.abs(LX - HOME[0]) < C.MIN_SHIFT) { P.I = [LX, LY]; P.tracked = true; }
                else if (togo >= C.SWITCH_T) {
                  S.ex += 2 * P.side * C.SHIFT * sstep(0, 0.08, t - S.loadT);
                  P.side = ls; P.I = [LX, LY]; P.tracked = true; P.switched = true; S.reloadT = t; S.prevSd = -ls; S.stepT = t;
                }
                s = P.side; sd = s || 1;
              }
            }
            if (S.committed && S.pushT == null) {
              // the push-off: no sooner than LOAD after the commit; re-solved from the contact he sees until then (critique
              // #11): a taker frozen at the plant (the hang) holds him in the load
              var ce2 = contactEst(t), dEff = ce2.hang ? Math.min(P.delta, C.HANG_DELTA) : P.delta;
              var want = ce2.contact - dEff + C.LOAD, early = Math.max(0, (S.loadT + P.delta) - ce2.contact);
              // (a ball he has read arrives when its line says; else when he believes)
              var arrive = P.tracked && S.linePl ? S.linePl[2] : ce2.contact + flightTo(P.I, C.LINE + D.shFwd + C.HAND_FWD + P.vz * C.FLY_MAX, strikeNow().speed);
              if (!P.stay && C.FLY_MAX > 0) want = Math.max(want, arrive - C.FLY_MAX);
              // (fix-i4: a keeper who stays holds his ground until he has seen the line of a ball slow enough to dive for)
              if (P.stay && arrive - (ce2.contact + C.REACT) >= C.STAY_DIVE_T + C.STAY_WAIT) want = Math.max(want, ce2.contact + C.REACT);
              // (fix-i4, D1/D3: the time a slower ball gives him) he waits to see the ball's line before he goes when a dive
              // from contact + REACT, from where his side-step will have taken him by then, still reaches the point he
              // believes (the gloves' centres within reach of it): a cold kick to his side is read and reached; a hot
              // one leaves no time to wait and his guess, and his reach, decide
              if (!P.stay && !S.line && C.WAIT_GAP != null) {
                var tW = ce2.contact + C.REACT;
                if (tW > want && arrive - tW >= C.WAIT_T) {
                  var st1 = strikeNow(), from = Math.max(t, S.loadT + C.SHUF_FROM), tgtW = clamp(Math.abs(P.I[0] - HOME[0]) - C.SHIFT - C.SHUF_NEAR, 0, C.SHUF_MAX);
                  var exW = sd * Math.min(tgtW, Math.max(sd * S.ex, sd * S.ex + C.SHUF_V * Math.max(0, tW - C.SHUF_LEAD - from)));
                  var Pw = plan(P, { P0: [xk + sd * C.SHIFT + exW, LOAD_Y, C.LINE], pushT: tW, contactT: ce2.contact, ballSpeed: st1.speed });
                  if (Pw.full || Pw.gapI <= C.WAIT_GAP) want = tW;
                }
              }
              if (S.reloadT != null) want = Math.max(want, S.reloadT + C.SWITCH_LOAD);
              var loadMin = Math.max(C.LOAD_MIN, C.LOAD - early);
              // (fix-i4: LOAD_MAX caps the load only while the strike is unseen, a hang; once he has read the swing he
              // waits for the ball)
              var capped = !ce2.released && t >= S.loadT + C.LOAD_MAX + (P.early || 0);
              // (fix-i4, D2: the step across) a point he cannot fully reach from where he stands (a top corner), with time
              // before the ball: he side-steps on toward it while that brings it nearer his reach, and goes when it no
              // longer does (time spent is height lost)
              S.stepping = false;
              if (!P.stay && C.STEP_DT > 0 && !S.stepDone && t >= S.loadT + loadMin && (t >= want || capped) && !capped) {
                var st2 = strikeNow(), trk = P.tracked && S.linePl, q0 = { P0: [xk + sd * C.SHIFT + S.ex, LOAD_Y, C.LINE], pushT: t, contactT: ce2.contact, ballSpeed: st2.speed, arriveT: trk ? S.linePl[2] : null, Ip: trk ? [S.linePl[0], S.linePl[1]] : null };
                var Pn = plan(P, q0);
                var exA = sd * Math.min(C.SHUF_MAX, Math.max(0, Math.abs(P.I[0] - HOME[0]) - C.SHIFT - C.SHUF_NEAR), sd * S.ex + C.SHUF_V * C.STEP_DT);
                if (!Pn.full && sd * exA > sd * S.ex + 1e-6) {
                  var Pa = plan(P, Object.assign({}, q0, { P0: [xk + sd * C.SHIFT + exA, LOAD_Y, C.LINE], pushT: t + C.STEP_DT }));
                  if (Pa.gap < Pn.gap - 0.004) { want = t + H; S.stepping = true; } else S.stepDone = true;
                } else S.stepDone = true;
              }
              // (fix-i4) holding for a slow ball, the side-step toward the point (never nearer it than SHUF_NEAR, at most
              // SHUF_MAX past the SHIFT), stopped SHUF_LEAD before the push
              if (!P.stay) {
                var exT = S.ex;
                if ((t < want - C.SHUF_LEAD || S.stepping) && t >= S.loadT + C.SHUF_FROM) exT = sd * clamp(Math.abs(P.I[0] - HOME[0]) - C.SHIFT - C.SHUF_NEAR, 0, C.SHUF_MAX);
                if (sd * exT < sd * S.ex && !P.switched && !P.tracked) exT = S.ex;
                var dex = exT - S.ex, mx = C.SHUF_V * dt;
                S.ex += Math.abs(dex) <= mx ? dex : (dex > 0 ? mx : -mx);
                S.shufLift = clamp(S.shufLift + (Math.abs(dex) > 1e-6 ? 10 : -10) * dt, 0, 1);
              }
              if (t >= S.loadT + loadMin && (t >= want || capped)) {
                S.pushT = t; S.rootPush = [xk + (P.stay ? 0 : sd * C.SHIFT) + S.ex, LOAD_Y, C.LINE];
                if (!P.stay) {
                  // a correct read follows the lean: a late strike rises, an early one dips (the cone's systematic part only;
                  // a ball he has read needs none)
                  var st = strikeNow(), Pl = P;
                  if (P.correct && st.bias && !P.tracked) { var dz = C.BALL[2] - C.LINE; Pl = Object.assign({}, P, { I: [P.I[0], clamp(P.I[1] + Math.abs(dz) * Math.tan(st.bias * PI / 180), 0.15, 2.6)] }); P.Ilean = Pl.I.slice(); }
                  S.dive = plan(Pl, { P0: S.rootPush, pushT: t, contactT: ce2.contact, ballSpeed: st.speed, arriveT: P.tracked && S.linePl ? S.linePl[2] : null, Ip: P.tracked && S.linePl ? [S.linePl[0], S.linePl[1]] : null });
                }
              }
            }
            if (!S.committed) {
              var sp = 0;
              if (S.split || t >= P.commitT - C.SPLIT) { var us = clamp((t - (P.commitT - C.SPLIT)) / C.SPLIT, 0, 1); sp = C.HOP * Math.sin(PI * us); ph = 'split'; }
              var fade = clamp(1 - (t - (P.commitT - C.SPLIT - 0.5)) / 0.5, 0, 1);
              root = [HOME[0], READY_Y + sp, HOME[2]];
              KS.mind = { bob: M.bob * fade, antic: null, anticU: 0, anticDir: 0, w: 0, x: 0, look: M.look };
            } else if (S.pushT == null) {
              ph = 'load';
              var ul = sstep(0, 0.08, t - S.loadT), shift = P.stay ? 0 : sd * C.SHIFT;
              root = [HOME[0] + shift * ul + S.ex, lerp(READY_Y, LOAD_Y, ul), HOME[2]];
              pitch = lerp(0.30, 0.25, ul); KS.w = { ready: 1 - ul, load: ul, push: 0, lo: 0, hi: 0, land: 0, block: 0 };
            } else if (P.stay) {
              ph = 'block';
              var ub = t - S.pushT, hop = ub < C.BLOCK_T ? C.BLOCK_HOP * Math.sin(PI * ub / C.BLOCK_T) : 0, wb = sstep(0, 0.10, ub);
              // (fix-i4: a high ball at him he jumps for, as high as its line asks, up to BLOCK_JUMP)
              // (timed to the ball: up from when he sees it, or 0.25 s before it reaches him, to its arrival, then down)
              var jl = S.line && S.line !== 'none' && S.linePl ? clamp((S.line[1] - 1.5) * 0.6, 0, C.BLOCK_JUMP) : 0;
              if (jl > 0) {
                var tA = S.linePl[2], tS = Math.min(tA - 0.05, Math.max(S.lineT, tA - 0.25));
                hop = Math.max(hop, jl * (t <= tA ? sstep(tS, tA, t) : 1 - sstep(tA, tA + 0.3, t)));
              }
              // (and a low one he gets down to, knees together, up to BLOCK_DROP: a ball at his feet went through them)
              var dl = S.line && S.line !== 'none' && S.linePl ? clamp((0.9 - S.line[1]) * 0.7, 0, C.BLOCK_DROP) : 0, dk = 0;
              if (dl > 0) { var tA2 = S.linePl[2], tS2 = Math.min(tA2 - 0.05, Math.max(S.lineT, tA2 - 0.25)); dk = sstep(tS2, tA2, t); hop -= dl * dk; }
              S.blockDrop = dk * (dl > 0 ? 1 : 0);
              root = [S.rootPush[0], LOAD_Y + hop + (READY_Y - LOAD_Y) * wb * 0.5, S.rootPush[2]];
              pitch = 0.2; KS.w = { ready: 0, load: 1 - wb, push: 0, lo: 0, hi: 0, land: 0, block: wb };
            } else {
              var Dv = S.dive, tau = t - S.pushT;
              if (S.landT == null) {
                var y = Dv.P0[1] + Dv.v0[1] * tau - 0.5 * GRAV * tau * tau, vy = Dv.v0[1] - GRAV * tau;
                root = [Dv.P0[0] + Dv.v0[0] * tau, y, Dv.P0[2] + Dv.v0[2] * tau];
                if (y <= C.LAND_Y && vy < 0) { S.landT = t; S.landP = root.slice(); S.landV = [Dv.v0[0], 0, Dv.v0[2]]; S.landRoll = Dv.roll * sstep(0, Math.min(C.ROLL_T, 0.6 * Dv.T), tau); }
              }
              if (S.landT == null) {
                ph = 'flight';
                roll = Dv.roll * sstep(0, Math.min(C.ROLL_T, 0.6 * Dv.T), tau);
                pitch = lerp(0.25, 0.10, sstep(0, 0.15, tau));
                // the load gives way to the push-off (the body's 'push' table) over 0.06 s, the push to the stretch by 0.22 s
                var wp = sstep(0, 0.06, tau), fw = sstep(0.06, 0.22, tau), hh = clamp((P.I[1] - 0.25) / 1.85, 0, 1);
                KS.w = { ready: 0, load: 1 - wp, push: wp * (1 - fw), lo: fw * (1 - hh), hi: fw * hh, land: 0, block: 0 };
              } else {
                var tl = t - S.landT, decay = (1 - Math.exp(-C.SLIDE * tl)) / C.SLIDE;
                root = [S.landP[0] + S.landV[0] * decay, lerp(S.landP[1], LIE_Y, sstep(0, 0.15, tl)), S.landP[2] + S.landV[2] * decay];
                roll = lerp(S.landRoll, sd * PI / 2, sstep(0, 0.25, tl)); pitch = lerp(0.10, 0, sstep(0, 0.25, tl));
                var downFor = outcome === 'goal' ? C.DOWN_GOAL : C.DOWN;
                if (S.getT == null && tl >= C.LAND_T + downFor) S.getT = t;
                if (S.getT == null) {
                  ph = tl < C.LAND_T ? 'land' : 'down';
                  var wl = sstep(0, 0.2, tl), hh2 = clamp((P.I[1] - 0.25) / 1.85, 0, 1);
                  KS.w = { ready: 0, load: 0, push: 0, lo: (1 - wl) * (1 - hh2), hi: (1 - wl) * hh2, land: wl, block: 0 };
                } else {
                  ph = 'getup';
                  var gu = t - S.getT, ug = sstep(0, C.GETUP, gu); KS.getupT = gu;
                  root = [root[0], lerp(LIE_Y, D.rootH, ug), root[2]]; roll = lerp(sd * PI / 2, 0, ug); pitch = 0;
                  KS.w = { ready: 0, load: 0, push: 0, lo: 0, hi: 0, land: 1 - sstep(0, C.GETUP_FADE, gu), block: 0 };
                }
              }
            }
          }
          var B = basis(0, roll, pitch);
          // KS.roll is the roll's size TOWARD KS.side (side 0 rolls toward +x): the body turns by -side * roll about +z (§4.4);
          // KS.q / u / a / f are the same frame, signed, for anyone who prefers it
          KS.phase = ph; KS.root = root; KS.roll = roll * sd; KS.pitch = pitch; KS.yaw = 0; KS.q = B.q; KS.u = B.u; KS.a = B.a; KS.f = B.f;
          // ------------------------------------------------------------------------------------------- the joints --
          var sh = [bodyPt(root, B, D.shAcross, D.shUp, D.shFwd), bodyPt(root, B, -D.shAcross, D.shUp, D.shFwd)];
          var hips = [bodyPt(root, B, D.hipAcross, D.hipUp, D.hipFwd), bodyPt(root, B, -D.hipAcross, D.hipUp, D.hipFwd)];
          KS.head = bodyPt(root, B, 0, D.headUp, D.headFwd); KS.neck = bodyPt(root, B, 0, D.neckUp, D.shFwd * 0.5);
          // hand goals (glove centres), per phase, then rate-limited relative to the shoulders and clamped to reach
          var goals, rate = C.HAND_READY, nUp = norm(sub([0, 1, 0], mul(B.u, B.u[1]))), top = sd > 0 ? 1 : 0;
          if (len(nUp) < 0.5) nUp = mul(B.a, -sd);
          // (once the outcome is decided the hands stop chasing the ball: Mb-to-K ask 7, no arms up after a parry)
          var reactNow = P && seenContact != null && t >= seenContact + C.REACT && S.pushT != null && !outcome;
          var X = null;
          if (reactNow) {
            var zH = (sh[0][2] + sh[1][2]) / 2 + C.HAND_FWD;
            // (fix-i4: a ball he has read (a slow one) is followed along its line; else the straight line and gravity)
            if (P.tracked) { var Lh = lineOf(ball, zH); X = Lh ? [Lh[0], Lh[1], zH] : crossing(ball, zH); }
            else X = crossing(ball, zH);
          }
          if (ph === 'ready' || ph === 'split') {
            goals = [bodyPt(sh[0], B, 0.56 * D.reach, -0.60 * D.reach, 0.50 * D.reach), bodyPt(sh[1], B, -0.56 * D.reach, -0.60 * D.reach, 0.50 * D.reach)];
          } else if (ph === 'load') {
            var lg = [xk + sd * 0.6 + S.ex, 1.3 * D.k, C.LINE + 0.3];
            goals = [add(lg, [0.12, 0, 0]), add(lg, [-0.12, 0, 0])];
            if (P.stay) goals = [bodyPt(sh[0], B, 0.55 * D.reach, -0.55 * D.reach, 0.45 * D.reach), bodyPt(sh[1], B, -0.55 * D.reach, -0.55 * D.reach, 0.45 * D.reach)];
            rate = C.HAND_PLAN;
          } else if (ph === 'block') {
            goals = [bodyPt(sh[0], B, 0.62 * D.reach, -0.55 * D.reach, 0.45 * D.reach), bodyPt(sh[1], B, -0.62 * D.reach, -0.55 * D.reach, 0.45 * D.reach)];
            rate = C.HAND_PLAN;
            var chest = vlerp(sh[0], sh[1], 0.5);
            // (fix-i4, D2: a keeper standing up gets his hands to a ball at him quicker than one stretched in a dive: BLOCK_RATE)
            // (and only once the block has set, 0.1 s on: the drawn body's arms are its own until then)
            if (X && t - S.pushT >= 0.10 && dist(X, chest) < C.BLOCK_REACH) { goals = [add(X, [0.08, 0, 0]), add(X, [-0.08, 0, 0])]; rate = C.BLOCK_RATE; S.react = true; }
          } else if (ph === 'flight' || ph === 'land' || ph === 'down') {
            var aimPt = X || S.dive.Iw;
            if (X) { rate = C.HAND_REACT; S.react = true; } else rate = C.HAND_PLAN;
            if (ph !== 'flight' && !X) { rate = C.HAND_LAND; aimPt = S.lastAim || aimPt; }
            if (ph === 'down' && !X) aimPt = [aimPt[0], 0.10, aimPt[2]];   // the hands down on the turf
            S.lastAim = aimPt;
            goals = [null, null];
            goals[top] = add(aimPt, mul(nUp, C.SEP)); goals[1 - top] = add(aimPt, mul(nUp, -C.SEP));
          } else {
            goals = S.hands ? S.hands.map(function (hnd, i) { return add(sh[i], hnd); }) : [bodyPt(sh[0], B, 0.3, -0.5, 0.1), bodyPt(sh[1], B, -0.3, -0.5, 0.1)];
            rate = C.HAND_LAND;
          }
          if (ph === 'ready' && P == null) KS.look = M.look; else KS.look = X || (S.dive ? S.dive.Iw : null) || (ball && ball.p ? ball.p.slice() : stare.slice());
          var maxR = C.REACH_CLAMP * D.reach, minR = D.glove + 0.08, hands = [], wrists = [], elbows = [], reach = [];
          if (!S.hands) S.hands = [sub(goals[0], sh[0]), sub(goals[1], sh[1])].map(function (v) { return clampLen(v, maxR); });
          for (var i = 0; i < 2; i++) {
            var want0 = sub(goals[i], sh[i]), within = len(want0) <= maxR + 1e-9, wantC = clampLen(want0, maxR);
            var off = toward(S.hands[i], wantC, rate * Math.max(dt, 1e-6));
            off = clampLen(off, maxR); if (len(off) < minR) off = mul(norm(len(off) > 1e-6 ? off : mul(B.u, -1)), minR);
            S.hands[i] = off; reach.push(within);
            var Hn = add(sh[i], off), dir = norm(off), Wr = sub(Hn, mul(dir, D.glove));
            var out = i === 0 ? 1 : -1, pole = add(add(sh[i], mul(B.a, out * 0.6)), add(mul(B.f, -0.5), mul(B.u, -0.2)));
            var tb = twoBone(sh[i], Wr, D.upper, D.fore, pole);
            hands.push(Hn); wrists.push(tb.end); elbows.push(tb.joint);
          }
          // feet (ankles) and knees
          var ank, kp = [bodyPt(hips[0], B, 0.25, -0.3, 0.9), bodyPt(hips[1], B, -0.25, -0.3, 0.9)], aH = D.ankleH, fz = C.LINE + (D.ankleFwd);
          if (ph === 'ready' || ph === 'split') {
            var lift = Math.max(0, root[1] - READY_Y);
            ank = [[HOME[0] + 0.30 * D.k, aH + lift, fz], [HOME[0] - 0.30 * D.k, aH + lift, fz]];
          } else if (ph === 'load' || ph === 'block') {
            var us2 = sstep(0, 0.08, t - S.loadT), nearI = sd > 0 ? 0 : 1, hopL = ph === 'block' ? Math.max(0, root[1] - LOAD_Y - (READY_Y - LOAD_Y) * 0.5 * sstep(0, 0.10, t - S.pushT)) : 0;
            ank = [[HOME[0] + 0.30 * D.k, aH + hopL, fz], [HOME[0] - 0.30 * D.k, aH + hopL, fz]];
            if (P && !P.stay) {
              // (fix-i4) a side change steps the other foot out (the first one back in, over the same 0.08 s); the
              // side-step carries both feet, each lifted in turn while it moves
              var us3 = S.stepT != null ? sstep(0, 0.08, t - S.stepT) : us2;
              ank[nearI][0] += sd * C.STEP_OUT * us3;
              if (S.prevSd != null) ank[S.prevSd > 0 ? 0 : 1][0] += S.prevSd * C.STEP_OUT * (1 - us3);
              for (var fi = 0; fi < 2; fi++) { ank[fi][0] += S.ex; ank[fi][1] += 0.05 * S.shufLift * Math.max(0, Math.sin(PI * Math.abs(S.ex) / 0.22 + (fi === nearI ? 0 : PI))); }
            }
            if (ph === 'block') { var bw = lerp(0.40, 0.14, S.blockDrop || 0); ank[0][0] = HOME[0] + bw * D.k; ank[1][0] = HOME[0] - bw * D.k; }
            S.feet0 = ank.map(function (p) { return p.slice(); });
          } else if (ph === 'flight' || ph === 'land' || ph === 'down') {
            // the drawn body's own leg table (Mb-to-K ask 1, punch-list B5), blended by the same weights: the near (push)
            // leg planted on its load spot until it is straight (up on the toes first), then long down the body; the far
            // knee driven up and through; the legs trailing together at the stretch. The colliders sit where it draws them
            if (!S.feet0) S.feet0 = [[HOME[0] + 0.30 * D.k, aH, fz], [HOME[0] - 0.30 * D.k, aH, fz]];
            var kL = D.rootH / 0.99626, reachL = 0.995 * D.leg;
            ank = []; kp = [];
            for (var li = 0; li < 2; li++) {
              var tf = legTable('foot', li, KS.w, sd), tq = legTable('knee', li, KS.w, sd), air = ph === 'flight' ? legTable('air', li, KS.w, sd) : 1;
              var footT = bodyPt(root, B, tf[0] * kL, tf[1] * kL, tf[2] * kL), Pp = S.feet0[li].slice();
              if (air < 1) {
                var dd = dist(Pp, hips[li]);
                if (dd > reachL) {
                  Pp[1] += Math.min(0.13 * kL, dd - reachL); dd = dist(Pp, hips[li]);
                  if (dd > reachL) { var over = dd - reachL; Pp = add(hips[li], mul(sub(Pp, hips[li]), reachL / dd)); air = Math.max(air, sstep(0, 0.25, over)); }
                }
              }
              ank.push(air >= 1 ? footT : vlerp(Pp, footT, air));
              kp.push(bodyPt(root, B, tq[0] * kL, tq[1] * kL, tq[2] * kL));
            }
          } else {
            ank = [bodyPt(hips[0], B, 0, -0.80 * D.leg, 0.30), bodyPt(hips[1], B, 0, -0.80 * D.leg, 0.30)];
            kp = [bodyPt(hips[0], B, 0, 0, 1.0), bodyPt(hips[1], B, 0, 0, 1.0)];
            if (ph === 'getup') { var ug2 = sstep(0, C.GETUP, KS.getupT); ank = ank.map(function (p, i) { return vlerp(p, [root[0] + (i ? -1 : 1) * 0.15, aH, root[2] + D.ankleFwd], ug2); }); }
          }
          // (no ankle under the turf: the drawn body's own floor, 0.065 m, shootout-keeper.js GROUND.ankle)
          ank = ank.map(function (p) { return [p[0], Math.max(p[1], Math.min(0.065, aH)), p[2]]; });
          var knees = [], feet = [];
          // (a knee that would go under the turf bends the other way: the pole raised 1.5 m, as the drawn body does it)
          for (var j = 0; j < 2; j++) {
            var lb2 = twoBone(hips[j], ank[j], D.thigh, D.shin, kp[j]);
            if (lb2.joint[1] < 0.07) lb2 = twoBone(hips[j], ank[j], D.thigh, D.shin, [kp[j][0], kp[j][1] + 1.5, kp[j][2]]);
            knees.push(lb2.joint); feet.push(lb2.end);
          }
          KS.side = P ? P.side : 0; KS.hands = hands; KS.reach = reach; KS.wrists = wrists; KS.elbows = elbows; KS.shoulders = sh;
          KS.hips = hips; KS.knees = knees; KS.feet = feet; KS.react = !!S.react; KS.glove = D.glove;
          KS.plan = P ? { side: P.side, stay: P.stay, I: P.I, delta: P.delta, correct: P.correct, commitT: P.commitT, pushT: S.pushT,
            arriveT: S.dive ? S.dive.arriveT : null, T: S.dive ? S.dive.T : null, v0: S.dive ? S.dive.v0 : null, clamped: S.dive ? S.dive.clamped : null,
            reachable: S.dive ? S.dive.reachable : null, full: S.dive ? S.dive.full : null, gap: S.dive ? S.dive.gap : null, gapI: S.dive ? S.dive.gapI : null, touchable: S.dive ? S.dive.touchable : null,
            Ip: S.dive ? S.dive.Ip : null, lean: P.Ilean || null } : null;
          S.lastKS = KS;
          return KS;
        }

        // the 14 proxy colliders (§4.3) from a KS; velocities from the previous call (finite differences)
        function colliders(KS) {
          var u = KS.u, list = [
            { kind: 'capsule', a: KS.root, b: madd(KS.root, u, Math.max(0.05, D.neckUp - 0.10)), r: D.torsoR, part: 'body' },
            { kind: 'sphere', a: KS.head, r: D.headR, part: 'head' }
          ];
          for (var i = 0; i < 2; i++) {
            var sd = i === 0 ? 'L' : 'R';
            list.push({ kind: 'capsule', a: KS.shoulders[i], b: KS.elbows[i], r: 0.06, part: 'arm', side: sd });
            list.push({ kind: 'capsule', a: KS.elbows[i], b: KS.wrists[i], r: 0.055, part: 'arm', side: sd });
            list.push({ kind: 'sphere', a: KS.hands[i], r: 0.10, part: 'glove', side: sd });
            list.push({ kind: 'capsule', a: KS.hips[i], b: KS.knees[i], r: 0.09, part: 'leg', side: sd });
            list.push({ kind: 'capsule', a: KS.knees[i], b: KS.feet[i], r: 0.07, part: 'leg', side: sd });
            list.push({ kind: 'sphere', a: KS.feet[i], r: 0.07, part: 'leg', side: sd });
          }
          var dt = prevColT != null ? KS.t - prevColT : 0;
          list.forEach(function (c, k) {
            var pc = prevCol && prevCol[k], mid = c.b ? vlerp(c.a, c.b, 0.5) : c.a;
            c.v = pc && dt > 1e-6 ? mul(sub(mid, pc), 1 / dt) : [0, 0, 0];
            c.a = c.a.slice(); if (c.b) c.b = c.b.slice();
          });
          prevCol = list.map(function (c) { return c.b ? vlerp(c.a, c.b, 0.5) : c.a.slice(); }); prevColT = KS.t;
          return list;
        }

        var KP = {
          dims: D, x: xk, C: C, antics: antics,
          mind: mind, decide: decide, plan: plan, state: state, colliders: colliders,
          // the taker to read (REACT late): anything with seen(tSim) -> { contact, hang } (a TK)
          track: function (tk) { track = tk || null; },
          // the old contract: a contact time from outside, honoured only before the split-step
          retime: function (cT) { if (P && !S.split && !S.committed && cT != null) { P.contactT = cT; P.commitT = cT - P.delta; } },
          // the launch speed (m/s) as the director knows it (ShootSim.cone's speedK x the base speed): call it at the release
          speed: function (v) { if (P && v > 0 && S.pushT == null) { P.speed = v; P.bias = P.bias || 0; P.strikeSet = true; } },
          // the strike at the release: { speed (m/s), bias (degrees of pitch: ShootSim.cone's systematic bias, not its draw) }
          strike: function (k) { if (P && k && S.pushT == null) { if (k.speed > 0) P.speed = k.speed; P.bias = +k.bias || 0; P.strikeSet = true; } },
          // the true contact (also read from state()'s ball.contactT)
          contact: function (tC) { if (seenContact == null) seenContact = tC; },
          lookAt: function (p) { if (p) stare = [p[0], p[1], p[2]]; },
          result: function (kind) { outcome = kind; },
          plan0: function () { return P; },
          reset: function () { P = null; S = fresh(); seenContact = null; outcome = null; prevCol = null; prevColT = null; },
          // plain rounded numbers for state().shootout.keeper
          round: function (KS) {
            if (!KS) return null;
            return { phase: KS.phase, root: r4v(KS.root), roll: r4(KS.roll), pitch: r4(KS.pitch), side: KS.side, react: KS.react,
              hands: KS.hands.map(r4v), reach: KS.reach.slice(), feet: KS.feet.map(r4v), getupT: r4(KS.getupT),
              w: { ready: r4(KS.w.ready), load: r4(KS.w.load), push: r4(KS.w.push), lo: r4(KS.w.lo), hi: r4(KS.w.hi), land: r4(KS.w.land), block: r4(KS.w.block) } };
          }
        };
        return KP;
      }

      /* ===================================================================== one headless kick (lane P's request) == */
      // The director's order (tap contract §1.4) on pure modules, so Node (sim-check) and the browser (debug.sim) run ONE
      // loop. Sim is ShootSim, passed in (the brain has no free variables). Per 120 Hz step n:
      //   1. the inputs due at n: the record's edges applied at n, in order (or the pilot's, stamped n): tk.input;
      //   2. tk.step(n), its events in order: at the lock the keeper decides (the locked aim, the predicted contact, the
      //      heat's speed); at the strike's release or the auto the cone is drawn once (the locked window, the heat's
      //      widening, the auto flag) and the keeper told the strike; at the contact the ball is launched at the contact
      //      step's time (a contact read late is caught up to n, as the director does);
      //   3. the keeper: KP.state(n H, ball), then KP.colliders(KS);
      //   4. sim.step(H) once launched.
      // rec v2: { v: 2, seed, aim [x, y] (the LOCKED target; default [0, 1]), edges [[stamp, at, kind], ...] | pilot
      //           (ShootBrain.pilot's spec), touch, preT, Wfix, speedFix, grace (s), join, keeper: force object | 'auto' |
      //           null (an empty goal), cone (sigma override, degrees; 0 = exact), dims, meta, skill, x (x_k), n0, max }
      // rec v1 (no v: 2: { holdStep, releaseMs | releaseStep, W, speed, pressure, touch, ... }) maps to a pilot of one
      //   press at holdStep (600), held (H 0), released releaseMs off the nominal plant; W -> Wfix and speed -> speedFix,
      //   and when it names none the old mechanic's own (150 / 225 ms, 22 m/s), so its tables stay comparable
      // -> { outcome, events: [{ n, t, type, ... }], contacts, hash, grade, cone, plan, dive, power, kmh, heat,
      //      steps: { start, lock, release, auto, contact, presses, accepted, ignored, mashed }, closest (the nearest a
      //      glove centre came to the ball, m), rec (the v2 record run), warn, decision (the keeper's at the lock: side,
      //      stay, delta (delta0, his draw, + early, the slow run-up's earlier read: fix-i4), correct, I; null with no keeper) }
      function v2rec(rec) {
        rec = rec || {};
        var o = {}, k;
        for (k in rec) o[k] = rec[k];
        if (rec.v === 2) return { rec: o, warn: null };
        var warn = rec.releaseMs == null && rec.releaseStep != null ? 'v1 record: releaseStep read as releaseMs 0' : null;
        o.v = 2; o.edges = null;
        o.pilot = { start: rec.holdStep != null ? Math.round(+rec.holdStep) : C.LEGACY.HOLD, rate: 0, releaseMs: rec.releaseMs != null ? +rec.releaseMs : 0 };
        o.Wfix = rec.W > 0 ? +rec.W : (rec.touch ? C.LEGACY.W_TOUCH : C.LEGACY.W_DESK);
        o.speedFix = rec.speed > 0 ? +rec.speed : C.LEGACY.SPEED;
        return { rec: o, warn: warn };
      }
      function kick(Sim, rec0) {
        var V = v2rec(rec0), rec = V.rec;
        var seed = rec.seed >>> 0, D = rec.dims && rec.dims.reach ? rec.dims : MALE;
        var sim = Sim.create({ seed: seed });
        var tk = taker(rec.meta, { touch: !!rec.touch, preT: rec.preT, Wfix: rec.Wfix, speedFix: rec.speedFix, relGrace: rec.grace != null ? rec.grace : rec.relGrace, join: rec.join });
        var kp = rec.keeper === null || rec.keeper === false ? null : keeper({ dims: D, seed: seed, skill: rec.skill, x: rec.x });
        if (kp) kp.track(tk);
        var aim = Array.isArray(rec.aim) ? [+rec.aim[0] || 0, rec.aim[1] == null ? 1 : +rec.aim[1] || 0] : [0, 1];
        var force = rec.keeper && typeof rec.keeper === 'object' ? rec.keeper : null;
        var pl = rec.pilot ? pilot(rec.pilot) : null, E = [];
        if (!pl) (rec.edges || []).forEach(function (e, i) { E.push([Math.round(+e[0]), Math.round(+e[1]), e[2] ? 1 : 0, i]); });
        E.sort(function (a, b) { return a[1] - b[1] || a[3] - b[3]; });
        var first = pl ? pl.start : (E.length ? Math.min(E[0][0], E[0][1]) : 0);
        var nB = rec.n0 != null && isFinite(+rec.n0) ? Math.min(Math.round(+rec.n0), first) : first;
        var cols = [], ev = [], cone = null, contactT = null, cN = null, out = null, plan = null, closest = Infinity, maxN = Math.round((+rec.max || 4) / H), ei = 0, pw = null, decision = null;
        sim.colliders(function () { return cols; });
        sim.reset({ t: nB * H });
        function simEvents(n) { var se = sim.step(H); for (var k2 = 0; k2 < se.length; k2++) ev.push(Object.assign({ n: n, src: 'sim' }, se[k2])); }
        // (a run-up never stalls: the lock within preT / S_MIN of the first tap, the contact within 1.5 s of it)
        var lim = first + Math.ceil((tk.pre.T / C.S_MIN + 1.6) / H) + 60 + maxN;
        for (var n = nB; n < lim; n++) {
          var t = n * H, i;
          if (pl) { var pe = pl.edges(n, tk); for (i = 0; i < pe.length; i++) tk.input(pe[i][0] ? 'press' : 'release', pe[i][1]); }
          else while (ei < E.length && E[ei][1] <= n) { tk.input(E[ei][2] ? 'press' : 'release', E[ei][0]); ei++; }
          var st = tk.step(n), nCe = null;
          for (i = 0; i < st.events.length; i++) {
            var e = st.events[i];
            ev.push(Object.assign({ n: n, t: t }, e));
            if (e.type === 'lock') {
              pw = tk.power();
              if (kp) { var dz = kp.decide({ aim: aim, contactT: tk.predictContact(n), ballSpeed: pw.speed, heat: pw.H, tell: 1, force: force }, rng((seed ^ 0xB2) >>> 0));
                if (dz) decision = { side: dz.side, stay: !!dz.stay, delta: dz.delta, delta0: dz.delta0, early: dz.early, correct: !!dz.correct, I: dz.I ? dz.I.slice() : null }; }
            } else if ((e.type === 'release' || e.type === 'auto') && !cone) {
              var g = tk.grade(); pw = tk.power();
              cone = sim.cone({ err: g.err, W: g.W, k: pw.coneK, auto: g.auto, sigma: rec.cone });
              if (kp) kp.strike({ speed: pw.speed * cone.speedK, bias: cone.bias });
            } else if (e.type === 'contact' && cN == null) nCe = e.n != null ? Math.min(n, e.n) : n;
          }
          if (nCe != null) {
            if (!cone) { var g2 = tk.grade(); pw = tk.power(); cone = sim.cone({ err: g2.err, W: g2.W, k: pw.coneK, auto: g2.auto, sigma: rec.cone }); }
            cN = nCe; contactT = cN * H;
            sim.launch(sim.aim({ target: aim, speed: pw.speed, cone: cone, t: contactT }));
            if (kp) kp.contact(contactT);
            while (sim.state().t < t - 1e-9) simEvents(n);
          }
          var S0 = sim.state(), ball = contactT != null && S0.phase !== 'idle' ? { p: S0.p, v: S0.v, w: S0.w, t: t, contactT: contactT } : null;
          if (kp) {
            var KS = kp.state(t, ball);
            if (KS.plan && KS.plan.pushT != null) plan = KS.plan;
            cols = kp.colliders(KS);
            if (ball) for (var j = 0; j < cols.length; j++) if (cols[j].part === 'glove') closest = Math.min(closest, dist(cols[j].a, S0.p));
          }
          if (cN != null) simEvents(n);
          var S1 = sim.state();
          if (S1.outcome && !out) { out = S1.outcome; if (kp) kp.result(out.kind); }
          if (out && cN != null && n > cN + 60) break;
          if (cN != null && n > cN + maxN) break;
        }
        var stp = tk.steps(), ht = tk.heat(), sp = pw ? pw.speed * (cone ? cone.speedK : 1) : null;
        stp.contact = cN;
        return { outcome: out, events: ev, contacts: sim.contacts(), hash: sim.hash(), grade: tk.grade(), cone: cone, plan: plan, dive: plan,
          power: pw, kmh: sp != null ? Math.round(sp * 3.6) : null, heat: { H: ht.Hlock != null ? ht.Hlock : ht.H, band: band(ht.Hlock != null ? ht.Hlock : ht.H), deg: deg(ht.Hlock != null ? ht.Hlock : ht.H) },
          steps: stp, closest: closest, rec: rec, warn: V.warn, nominal: tk.nominal(), decision: decision };
      }

      return { C: C, rng: rng, dims: dims, MALE: MALE, basis: basis, twoBone: twoBone, KICK_STUB: KICK_STUB, normKick: normKick, gradeOf: gradeOf, speedOf: speedOf,
        speedK: speedK, biasOf: biasOf, hstar: hstar, band: band, deg: deg, wobble: wobble, clampAim: clampAim, aimInfo: aimInfo, pre: pre, pilot: pilot,
        taker: taker, keeper: keeper, kick: kick, v2rec: v2rec, LEGS: LEGS };
    })();
