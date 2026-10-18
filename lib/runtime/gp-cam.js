    /* ============================================= Grand Prix: the player's cameras (ARTIFICIAL1 M2, lane B) == */
    // gp-cam.js. Pasted into boot() by gp.js at /*@include gp-cam.js*/. ONE top-level binding, GpCam; every other name
    // lives inside it, so nothing of v1's boot() is shadowed. The camera moved here from gp-race.js (M1, lane R) in M2
    // (INTERFACES.md 8, the M2 amendment; EXPERIENCE.md 6.1) and lane B owns it and the TV director (gp-director.js),
    // which plugs into it through cam.director(fn) and cam.tick(fn).
    //
    // VIEW: the page is reached only through env (the root element's document and that document's window) and three.js
    // through env.three or env['THREE'], so the file also loads in Node with vm.runInNewContext(src + ';GpCam', {}) and
    // runs there with a real three.js and no page.
    //   GpCam.camera(env) -> cam      the chase, the T-cam and the cockpit; 'tv' only when the player is not racing
    //   GpCam.MODES                   ['chase', 'tcam', 'cockpit']
    //   GpCam.CHASE, GpCam.EYES       the chase's table (EXPERIENCE X20) and the onboard eyes' defaults, as data
    //
    // M2 (lane B, 15 Oct):
    //  - X20, the chase's feel: EXPERIENCE X20's table (the-race.md 6) is the chase's data, CHASE below: 7.5 m back and
    //    1.85 m up (a phone held upright 9.0 and 2.4), the lens 52 -> 60 deg from 120 to 330 km/h (upright 64 -> 70), +1.5
    //    with the Flap open, -4 under 4 g of braking (in fast, out slow), the braking push (0.7 m toward the car at 4.5 g)
    //    and the pull back under full throttle at low speed, the height on a 2.2 Hz spring (damping 0.8), the yaw 0.12 s
    //    behind (stiffer below 100 km/h), a quarter of the car's roll, the road's pitch 0.3 s behind, the shake set
    //    (kerbs, landings, buffeting over 300 km/h, contact), and the lens sliding in along the car's axis rather than
    //    coming within 0.5 m of a barrier. Reduced motion: no shake, the lens's range halved.
    //  - The onboard eyes are data (EYES; the world's gp.cameras.eyes or cam.eye() override them): the cockpit's stays
    //    where M1's fix put it (over the halo, which at the helmet's own eye height covers the horizon; the glass
    //    cockpit's design sets it), the T-cam's tilt holds the halo's top in the lowest 12 % of the picture as the lens
    //    widens with speed (58 -> 64 deg).
    //  - X23, the exposure: zones along the lap (gp.cameras.exposure, cam.zones()) set a target in stops; the exposure
    //    eases to it in 0.55 s (monotonic: never an oscillation) and reaches the page through env.exposure(k).
    //  - The camera rule (RULES 1f, EXPERIENCE 1.1), asserted: from the hand-off (cam.hand(true)) or whenever the page
    //    says the player races, a TV frame is refused; a TV frame drawn while racing is counted (it can not happen) and
    //    warned about. cam.audit() is the log the tests read.
    //  - cam.tick(fn): the director's clock, every frame but the start screen's; cam.rest(F, mode): the pose a mode
    //    settles to, the hand-off's target (X05); cam.bind({ race }): the sim's car, for the chase's feel.
    var GpCam = (function () {
      var PI = Math.PI, TAU = 2 * PI, abs = Math.abs, min = Math.min, max = Math.max;
      var sqrt = Math.sqrt, sin = Math.sin, cos = Math.cos, atan = Math.atan, atan2 = Math.atan2, tan = Math.tan, exp = Math.exp;
      var DEG = PI / 180, G0 = 9.81;
      var MODES = ['chase', 'tcam', 'cockpit'];
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function angDiff(a, b) { var d = (a - b) % TAU; if (d <= -PI) d += TAU; else if (d > PI) d -= TAU; return d; }
      function sstep(a, b, x) { var u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
      function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
      // a deep copy of plain data
      function copy(x) {
        if (x === null || typeof x !== 'object') return x;
        if (Array.isArray(x)) { var a = new Array(x.length); for (var i = 0; i < x.length; i++) a[i] = copy(x[i]); return a; }
        if (ArrayBuffer.isView(x)) return Array.prototype.slice.call(x);
        var o = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = copy(x[k]); return o;
      }

      // the page, reached through env alone (its root element's document and that document's window)
      function pageOf(env) {
        var doc = env.doc || (env.root && env.root.ownerDocument) || null;
        return { doc: doc, win: env.win || (doc && doc.defaultView) || null };
      }

      // X20's table (EXPERIENCE.md X20, adopted from the-race.md 6 as the starting values; the owner's eye and players
      // tune it). land: a landscape screen (16:10 and wider); tall: a phone held upright (9:19.5); a screen between them
      // gets a mix by its shape. back/up: the lens behind and over the car's origin (m); ahead/aim: the look point ahead
      // of the car and over it (m); fov0/fov1: the vertical lens (deg) up to kmh[0] and at kmh[1], smoothstep between
      var CHASE = {
        land: { back: 7.5, up: 1.85, ahead: 6, aim: 0.9, fov0: 52, fov1: 60 },
        tall: { back: 9.0, up: 2.4, ahead: 10, aim: 0.9, fov0: 64, fov1: 70 },
        landAspect: 1.6, tallAspect: 0.5,
        kmh: [120, 330],
        flap: 1.5, flapRate: 4,                               // deg with the Flap open
        brake: -4, brakeG: 4, fovIn: 8, fovOut: 2.5,          // deg at brakeG of braking; lambda in, out
        push: 0.7, pushG: 4.5, pull: 0.9, pullG: 1.2, pullV: [25, 55], pushW: 5,  // m toward the car at pushG; back under throttle
        hz: 2.2, zeta: 0.8,                                   // the height's spring
        lag: 0.12, lagSlow: 0.05, slowKmh: [50, 100],         // the yaw behind a steady turn (s), stiffer when slow
        roll: 0.25, rollMax: 1.5,                             // a share of the car's roll, at most (deg)
        pitchLag: 0.3,                                        // the road's pitch, behind by (s)
        kerb: [0.008, 14], landing: [0.015, 0.3], buffet: [0.0015, 300, 330], contact: 0.01,   // rad; Hz; s; km/h
        wall: 0.5, floor: 1.2, near: 0.3,
      };
      // the onboard eyes (car frame: +Y up, +Z forward, the origin the wheelbase's middle on the ground; tilt: the look's
      // slope, down when negative; vfov deg, at least `across` deg across; Tall: a screen held upright). The T-cam's
      // halo: the halo's top in the car's frame [y, z] (model-why-v07 lod0: 0.897 m at z 0.95, m2/B.md) held at `line`
      // of the picture's height from the top, so the tilt follows the lens (the-race 6: the halo's top bar in the lowest
      // 12 %). The cockpit: M1's fix (the eye just over the helmet's crown and the halo's top: at the helmet's own eye
      // height, 0.78-0.84 m, the halo's top bar sits on the horizon); the glass cockpit's design sets it (gp.cameras.eyes)
      var EYES = {
        tcam: { x: 0, y: 1.25, z: 0.30, near: 0.2, vfov: 58, widen: 6, across: 76, tilt: -0.10, halo: [0.897, 0.95], line: 0.88,
          yTall: 1.25, zTall: 0.30, vfovTall: 78, widenTall: 3, tiltTall: -0.14 },
        cockpit: { x: 0, y: 0.98, z: 0.38, near: 0.12, vfov: 56, widen: 0, across: 84, tilt: -0.10, yTall: 0.98, zTall: 0.40, tiltTall: -0.16, vfovTall: 78, widenTall: 0 },
      };
      var XT = 0.55;     // the exposure's ease to a new zone (s): settled 0.55 s after the car crosses a portal (X23)

      /* ================================================================== VIEW: the cameras (lane B) ===== */
      // GpCam.camera(env): the player's three views while racing (the chase, the default; the T-cam; the cockpit,
      // at the helmet), and the hooks the TV director plugs into. The rule (RULES 1f, the owner's written OK):
      // while the player is racing the camera is one of those three and never cuts away; 'tv' is refused then.
      //   cam.mode(name, racing) -> the mode set     cam.cycle(racing)     cam.look(back)  (C held, chase only)
      //   cam.update(dt, focus, info)                focus = { n, x, y, z, h, pitch, roll, v, steerAngle, d? }
      //                                              info = { racing, phase, title?, cars? }
      //   cam.state() -> { mode, pos, fov, near, far, back, hand, exposure }
      //   cam.director(fn | null)                    fn(camera, focus, info, dt) -> true when it framed the shot ('tv')
      //   cam.tick(fn | null)                        fn(dt, focus, info), every frame but the start screen's
      //   cam.bind({ race })                         race() -> R: the sim's car for the chase (braking, Flap, kerbs)
      //   cam.hand(on?) -> bool                      the player has the camera (X05) until his flag: no TV at all
      //   cam.rest(focus, mode, out?) -> pose        { mode, p, q, l, up, fov, near }: where `mode` settles for this focus
      //   cam.zones(list?) -> list                   the exposure zones [{ from, to, ev }] (d along the lap, ev stops)
      //   cam.exposure() -> { ev, target, k }        cam.audit(clear?) -> the rule's log
      //   cam.event(e)                               a contact of the focus car: a small shake (none for reduced motion)
      //   cam.untv() -> mode                         back from a TV shot to the view the player had before it
      //   cam.snapshot() / cam.restore(s)            the views' springs and the mode, to put back after a borrow
      //   cam.reset()                                the springs start again (a cut, a recovery, a new race); the
      //                                              hand-off's latch is released
      function camera(env) {
        // (the page only through env: three.js from env (env.three, or env's key as INTERFACES 2.10 spells it, read by
        // key so the purity check, which bans the bare global, still holds for this file), the window as the root's
        // own document's view)
        var X3 = env.three || env['THREE'], cam = env.camera, T = env.T, cfg = env.cfg || {}, win = pageOf(env).win;
        var warn = typeof env.warn === 'function' ? env.warn : function () {};
        var CA = cfg.cameras || {};
        var allow = (CA.allow || MODES).filter(function (m) { return MODES.indexOf(m) >= 0; });
        if (!allow.length) allow = ['chase'];
        var RM = false;
        if (env.reduced != null) RM = !!env.reduced;
        else { try { RM = !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { RM = false; } }
        var CH = CHASE;
        // the onboard eyes: the defaults, then the world's (gp.cameras.eyes) and the page's (env.eyes)
        var EYE = copy(EYES);
        [CA.eyes, env.eyes].forEach(function (src) {
          if (!src || typeof src !== 'object') return;
          for (var m in EYE) if (src[m] && typeof src[m] === 'object') for (var k in src[m]) {
            var v = src[m][k];
            if (typeof v === 'number' && isFinite(v)) EYE[m][k] = v;
            else if (k === 'halo' && (v === null || (Array.isArray(v) && v.length === 2 && isFinite(v[0]) && isFinite(v[1])))) EYE[m][k] = v ? [+v[0], +v[1]] : null;
          }
        });
        var C = { mode: allow.indexOf(CA.start) >= 0 ? CA.start : allow[0], prev: null, back: false, hint: -1, orbit: 0, dir: null, tick: null,
          race: null, hand: false, warned: false, warnedTv: false, clock: 0, pos: [0, 0, 0] };
        C.prev = C.mode;
        // the springs and filters the views run on (one plain object, so cam.rest() can try a pose and put it back)
        var Z = { init: false, focusN: -1, ph: null, rate: 0, yaw: 0, yv: 0, cy: 0, cyv: 0, lo: 0, lov: 0, pitch: 0, ax: 0, lastV: null, lastY: null,
          slide: 1, fovF: 0, fovB: 0, shT: 0, kerb: 0, light: 0, landK: 0, landT: 0, shake: 0, shK: 0, vib: 0 };
        var A = { frames: 0, racing: 0, tv: 0, tvRacing: 0, handAt: null, freeAt: null, modes: [] };
        var XP = { zones: [], ev: 0, from: 0, target: 0, t: 0, k: 1, sent: false };
        var PR = { i: 0, d: 0, lat: 0, dist: 0 }, PP = { x: 0, y: 0, z: 0 }, POSE = {}, PO = {}, WW = {};
        var V1 = new X3.Vector3(), V2 = new X3.Vector3(), V3 = new X3.Vector3(), V4 = new X3.Vector3();
        var SC = new X3.PerspectiveCamera(60, 1, 0.3, 1800);     // cam.rest()'s scratch lens
        function setNear(K, nv) { if (abs(K.near - nv) > 1e-4) { K.near = nv; K.updateProjectionMatrix(); } }
        function vfovFor(K, base, across) { var a = 2 * atan(tan(across * DEG / 2) / max(0.2, K.aspect)) / DEG; return clamp(max(base, a), base, 100); }
        function setFov(K, f, lam, dt) { var nf = lam && dt > 0 ? K.fov + (f - K.fov) * (1 - exp(-lam * dt)) : f; if (abs(K.fov - nf) > 0.02) { K.fov = nf; K.updateProjectionMatrix(); } }
        // a spring stepped in pieces on a slow frame (the kart's), damping ratio z (1: critical), with the target's rate
        function spring(key, vkey, target, w, dt, angle, z, tv) {
          if (!(dt > 0)) return;
          var nS = Math.max(1, Math.ceil(dt * w / 0.25)), h = dt / nS; tv = tv || 0; z = z == null ? 1 : z;
          for (var s = 0; s < nS; s++) { var d = angle ? angDiff(target, Z[key]) : target - Z[key]; Z[vkey] += (w * w * d + 2 * z * w * (tv - Z[vkey])) * h; Z[key] += Z[vkey] * h; target += tv * h; }
        }
        // where along the lap a point is (a local search from the last answer; a full one when that was far)
        function where(x, z) {
          if (typeof T.project !== 'function') return null;
          var r = T.project(x, z, C.hint, PR);
          if (!r || !(r.dist < 30)) r = T.project(x, z, -1, PR);
          if (r) C.hint = r.i;
          return r;
        }
        function yAt(d) { return typeof T.yAt === 'function' ? T.yAt(d) : 0; }
        function legal(name) { return allow.indexOf(name) >= 0; }
        function logMode(from, to, racing) { if (from === to) return; A.modes.push({ t: +C.clock.toFixed(3), from: from, to: to, racing: !!racing }); if (A.modes.length > 60) A.modes.shift(); }
        function setMode(name, racing) {
          var was = C.mode;
          if (name === 'tv') {
            if (racing || C.hand) { if (!C.warned) { C.warned = true; warn('Grand Prix: a TV shot was asked for while the player races: refused (the chase-camera rule)'); } return C.mode; }
            if (C.mode !== 'tv') C.prev = C.mode;
            C.mode = 'tv'; logMode(was, 'tv', racing); return C.mode;
          }
          if (!legal(name)) return C.mode;
          if (name !== C.mode) { C.mode = name; Z.init = false; }
          C.prev = name; logMode(was, name, racing); return C.mode;
        }
        // the sim's car under the focus (cam.bind), for its acceleration, its Flap and the kerb under it
        function carOf(F) {
          if (!C.race) return null;
          var R = null; try { R = C.race(); } catch (e) { R = null; }
          var c = R && R.S && R.S.cars ? R.S.cars[F.n] : null;
          return c && typeof c === 'object' ? c : null;
        }
        // a screen's shape as a mix of the two columns of X20's table: 0 landscape, 1 a phone held upright
        function tallness(a) { return clamp((CH.landAspect - a) / (CH.landAspect - CH.tallAspect), 0, 1); }
        var MIX = {};
        function mixed(w) { for (var k in CH.land) MIX[k] = CH.land[k] + (CH.tall[k] - CH.land[k]) * w; return MIX; }
        // the chase's lens for a speed (km/h): the speed's curve; the Flap and the braking are added by chase()
        function chaseFov(w, kmh) { var M = mixed(w), kR = RM ? 0.5 : 1; return M.fov0 + (M.fov1 - M.fov0) * kR * sstep(CH.kmh[0], CH.kmh[1], kmh); }
        // how far along the car's axis the lens may stay: 1 when it is CH.wall inside both barrier faces, else the largest
        // share of its offset from the car that is (the slide in, X20); -1 when even the car is that close to a barrier
        function inside(x, z) {
          var r = where(x, z); if (!r || typeof T.wallsAt !== 'function') return true;
          var w = T.wallsAt(r.d, WW); return r.lat < w.right - CH.wall && r.lat > -(w.left - CH.wall);
        }
        function slideNeed(F, ox, oz) {
          if (inside(F.x + ox, F.z + oz)) return 1;
          if (!inside(F.x, F.z)) return -1;
          var lo = 0, hi = 1;
          for (var i = 0; i < 9; i++) { var s = (lo + hi) / 2; if (inside(F.x + ox * s, F.z + oz * s)) lo = s; else hi = s; }
          return lo;
        }
        function chase(dt, F, info, K) {
          var w = tallness(K.aspect), M = mixed(w), car = carOf(F);
          var v = abs(F.v || 0), kmh = v * 3.6, h = F.h;
          var d = F.d != null ? F.d : null;
          if (d == null) { var w0 = where(F.x, F.z); d = w0 ? w0.d : 0; }
          if (typeof T.pose === 'function') T.pose(d, PO); else { PO.g = 0; PO.kv = 0; }
          var first = !Z.init || Z.focusN !== F.n;
          if (first) {
            Z.yaw = h; Z.yv = 0; Z.cy = F.y; Z.cyv = 0; Z.lo = 0; Z.lov = 0; Z.pitch = atan(PO.g || 0); Z.ax = 0; Z.lastV = v; Z.lastY = F.y;
            Z.slide = 1; Z.fovF = 0; Z.fovB = 0; Z.focusN = F.n; Z.ph = h; Z.init = true; Z.light = 0; Z.landK = 0; Z.kerb = 0;
          }
          // the car's acceleration along (m/s2): the sim's own, else the speed's change; smoothed
          var ax = car && !car.held && isFinite(car.ax) ? car.ax : dt > 0 && Z.lastV != null ? (v - Z.lastV) / dt : 0;
          Z.lastV = v;
          if (dt > 0) Z.ax += (clamp(ax, -60, 40) - Z.ax) * (1 - exp(-12 * dt));
          var dec = max(0, -Z.ax) / G0, acc = max(0, Z.ax) / G0;
          // the yaw: a critically damped spring w = 2 / lag (its lag behind a steady turn), stiffer below 100 km/h, so a
          // hairpin never swings the view and at speed the car's slip shows
          var lag = CH.lagSlow + (CH.lag - CH.lagSlow) * sstep(CH.slowKmh[0], CH.slowKmh[1], kmh);
          spring('yaw', 'yv', h, 2 / lag, dt, true, 1, 0);
          // the height: the car's, on a spring at CH.hz, damping CH.zeta, fed the climb rate (a steady climb has no lag;
          // over a crest the car rises into the picture before the lens follows)
          var vy = dt > 0 && Z.lastY != null ? (F.y - Z.lastY) / dt : 0; Z.lastY = F.y;
          spring('cy', 'cyv', F.y, TAU * CH.hz, dt, false, CH.zeta, clamp(vy, -20, 20));
          // along: the braking push (the car comes to you) and the pull back under full throttle at low speed
          var loT = -CH.push * min(1.15, dec / CH.pushG) + CH.pull * min(1, acc / CH.pullG) * (1 - sstep(CH.pullV[0], CH.pullV[1], v));
          spring('lo', 'lov', loT, CH.pushW, dt, false, 1, 0);
          // the road's pitch, CH.pitchLag behind
          if (dt > 0) Z.pitch += (atan(PO.g || 0) - Z.pitch) * (1 - exp(-dt / CH.pitchLag));
          var cx = sin(Z.yaw), cz = -cos(Z.yaw), rx = cos(Z.yaw), rz = sin(Z.yaw);
          var fx = sin(h), fz = -cos(h);
          if (C.back) {
            // looking back: ahead of the nose and a little up, down the road behind the car
            var bx = F.x + fx * 6.2, bz = F.z + fz * 6.2;
            K.position.set(bx, F.y + 1.5, bz); K.up.set(0, 1, 0); K.lookAt(F.x - fx * 22, F.y + 0.6, F.z - fz * 22);
            setNear(K, CH.near); setFov(K, vfovFor(K, M.fov0, 64), 0, dt); return;
          }
          var back = M.back + Z.lo, ox = -cx * back, oz = -cz * back;
          // the barriers: the lens slides in along the car's axis rather than come within CH.wall of one (fast in, 1.5 /s
          // back out); with the car itself against a barrier, the lens is held inside the faces across instead
          var need = slideNeed(F, ox, oz), clampAcross = need < 0;
          if (clampAcross) need = 1;
          Z.slide = first ? need : need < Z.slide ? need : min(need, Z.slide + (dt > 0 ? dt * 1.5 : 0));
          var px = F.x + ox * Z.slide, pz = F.z + oz * Z.slide, py = Z.cy + M.up;
          var r = where(px, pz);
          if (r) {
            py = max(py, yAt(r.d) + CH.floor);
            if (clampAcross && typeof T.wallsAt === 'function' && typeof T.posAt === 'function') {
              var ww = T.wallsAt(r.d, WW), lo = -(ww.left - CH.wall), hi = ww.right - CH.wall;
              if (hi > lo && (r.lat < lo || r.lat > hi)) { var P = T.posAt(r.d, clamp(r.lat, lo, hi), 0, PP); px = P.x; pz = P.z; }
            }
          }
          py = clamp(py, F.y + 0.8, F.y + M.up + 3);
          // the look: ahead of the car on the lens's own heading, over it, tipped by the road's pitch (lagged)
          var lx = F.x + cx * M.ahead, lz = F.z + cz * M.ahead, ly = F.y + M.aim + M.ahead * tan(Z.pitch);
          // the shake set (angles), none for reduced motion
          var sy = 0, sp = 0;
          if (!RM && dt > 0) {
            Z.shT += dt;
            var t0 = Z.shT;
            // a flat kerb under the car: 0.008 rad at 14 Hz while on it
            var onK = car ? car.surf === 1 : false;
            Z.kerb += ((onK && v > 8 ? 1 : 0) - Z.kerb) * (1 - exp(-25 * dt));
            if (Z.kerb > 0.01) { sp += CH.kerb[0] * Z.kerb * sin(TAU * CH.kerb[1] * t0); sy += 0.5 * CH.kerb[0] * Z.kerb * sin(TAU * CH.kerb[1] * 1.13 * t0 + 1.3); }
            // a landing: the end of a light phase over a crest (the road's own lift, v^2 kv, under -0.3 g, then back
            // over -0.05 g): 0.015 rad decaying in 0.3 s, scaled by how light it went
            var av = v * v * (PO.kv || 0) / G0;
            if (av < -0.3) Z.light = max(Z.light, -av);
            else if (Z.light > 0 && av > -0.05) { Z.landK = CH.landing[0] * min(1.5, Z.light / 0.6); Z.landT = 0; Z.light = 0; }
            if (Z.landK > 0) { Z.landT += dt; var le = Z.landK * exp(-Z.landT / CH.landing[1]); sp += le * sin(TAU * 7 * Z.landT); sy += 0.3 * le * sin(TAU * 5 * Z.landT + 0.8); if (Z.landT > 4 * CH.landing[1]) Z.landK = 0; }
            // buffeting over 300 km/h: 0.0015 rad at 6-11 Hz
            var bf = CH.buffet[0] * sstep(CH.buffet[1], CH.buffet[2], kmh);
            if (bf > 0) { sp += bf * (0.6 * sin(TAU * 6.3 * t0) + 0.4 * sin(TAU * 10.7 * t0 + 1.1)); sy += bf * 0.7 * (0.6 * sin(TAU * 8.1 * t0 + 0.4) + 0.4 * sin(TAU * 11 * t0 + 2.2)); }
            // a contact or a barrier (cam.event): up to CH.contact rad, 0.3 s
            if (Z.shake > 0) { var ce = Z.shK * min(1, Z.shake / 0.3); sp += ce * (sin(TAU * 10.7 * t0 + 0.6) * 0.7 + sin(TAU * 15.9 * t0 + 2.9) * 0.3); sy += ce * (sin(TAU * 8.3 * t0) * 0.7 + sin(TAU * 13.1 * t0 + 1.7) * 0.3); Z.shake = max(0, Z.shake - dt); }
          }
          if (sy || sp) { var dl = sqrt((lx - px) * (lx - px) + (ly - py) * (ly - py) + (lz - pz) * (lz - pz)); lx += rx * sy * dl; lz += rz * sy * dl; ly += sp * dl; }
          // a quarter of the car's roll (road and body), at most CH.rollMax
          var rc = clamp(CH.roll * (+F.roll || 0), -CH.rollMax * DEG, CH.rollMax * DEG), crc = cos(rc), src = sin(rc);
          K.position.set(px, py, pz); K.up.set(-rx * src, crc, -rz * src); K.lookAt(lx, ly, lz);
          setNear(K, CH.near);
          // the lens: the speed's curve, + the Flap, - the braking (in fast, out slow); reduced motion halves the range
          var kR = RM ? 0.5 : 1, base = chaseFov(w, kmh);
          var flapT = car && car.flap && car.flap.open ? CH.flap * kR : 0, brkT = CH.brake * kR * min(1, dec / CH.brakeG);
          if (first) { Z.fovF = flapT; Z.fovB = brkT; }
          else if (dt > 0) {
            Z.fovF += (flapT - Z.fovF) * (1 - exp(-CH.flapRate * dt));
            Z.fovB += (brkT - Z.fovB) * (1 - exp(-(abs(brkT) > abs(Z.fovB) ? CH.fovIn : CH.fovOut) * dt));
          }
          setFov(K, clamp(base + Z.fovF + Z.fovB, 20, 110), 0, dt);
        }
        // an onboard eye for this screen: { x, y, z, tilt, vfov, near } (the T-cam's lens widens with speed, its tilt
        // follows the lens so the halo's top stays on its line)
        var EO = {};
        function eyeOf(mode, K, v) {
          var E = EYE[mode], tall = K.aspect < 1;
          EO.x = E.x || 0; EO.y = tall && E.yTall != null ? E.yTall : E.y; EO.z = tall && E.zTall != null ? E.zTall : E.z; EO.near = E.near;
          var base = tall && E.vfovTall ? E.vfovTall : vfovFor(K, E.vfov, E.across || 0);
          var vf = base + ((tall && E.widenTall != null ? E.widenTall : E.widen) || 0) * (RM ? 0.5 : 1) * sstep(CH.kmh[0], CH.kmh[1], abs(v || 0) * 3.6);
          EO.vfov = clamp(vf, 20, 110);
          var tl = tall && E.tiltTall != null ? E.tiltTall : E.tilt || 0;
          if (E.halo && E.line > 0.5 && E.line < 1) {
            var el = atan2(E.halo[0] - EO.y, E.halo[1] - EO.z), th = atan((E.line * 2 - 1) * tan(EO.vfov * DEG / 2));
            tl = clamp(tan(el + th), -0.2, 0.08);
          }
          EO.tilt = tl;
          return EO;
        }
        // the T-cam and the cockpit: fixed to the car, on the road's grade and bank plus the body's pitch and roll
        function onboard(dt, F, mode, K) {
          var head = mode === 'cockpit', E = eyeOf(mode, K, F.v);
          var d = F.d;
          if (d == null) { var w0 = where(F.x, F.z); d = w0 ? w0.d : 0; }
          // (the car's pitch and roll as gp-sim.js writes them: the road's grade and bank plus the body's; without
          // them, the road's alone)
          var pose = F.pitch == null || F.roll == null ? (typeof T.pose === 'function' ? T.pose(d, POSE) : null) : null;
          var pitch = F.pitch != null ? clamp(+F.pitch || 0, -0.2, 0.2) : pose ? atan(pose.g || 0) : 0;
          var roll = F.roll != null ? clamp(+F.roll || 0, -0.2, 0.2) : pose ? pose.bank || 0 : 0;
          var h = F.h;
          if (Z.ph == null || Z.focusN !== F.n) { Z.ph = h; Z.focusN = F.n; }
          var rate = dt > 0 ? angDiff(h, Z.ph) / dt : 0; Z.ph = h;
          if (dt > 0) Z.rate += (clamp(rate, -3, 3) - Z.rate) * (1 - exp(-8 * dt));
          var yawH = 0, rollH = 0, vib = 0;
          if (head) {
            // the head: into the turn (a tenth of a second of it, at most 7 degrees), pushed out by the corner
            yawH = clamp(0.1 * Z.rate, -0.12, 0.12);
            rollH = clamp(-0.004 * (F.v || 0) * Z.rate, -0.05, 0.05);
          }
          if (!RM) { Z.vib += dt * (20 + abs(F.v || 0) * 0.35); vib = (head ? 0.0016 : 0.0009) * min(1, abs(F.v || 0) / 60) * (sin(Z.vib * 2.1) * 0.6 + sin(Z.vib * 3.7 + 1.3) * 0.4); }
          // the body's frame: forward on the grade, right and up rolled with the bank (+ raises the right-hand edge)
          var cp = cos(pitch), fb = V1.set(sin(h) * cp, sin(pitch), -cos(h) * cp);
          var r0 = V2.set(cos(h), 0, sin(h));
          var ub = V3.crossVectors(r0, fb).normalize();
          var cr = cos(roll), sr = sin(roll);
          var rb = V4.copy(r0).multiplyScalar(cr).addScaledVector(ub, sr);
          ub.multiplyScalar(cr).addScaledVector(r0, -sr);
          // the eye on the body (not on the turned head), then the head's yaw, roll and the chassis' buzz
          var ex = F.x + rb.x * E.x + ub.x * E.y + fb.x * E.z, ey = F.y + rb.y * E.x + ub.y * E.y + fb.y * E.z, ez = F.z + rb.z * E.x + ub.z * E.y + fb.z * E.z;
          var tl = vib + E.tilt, cy = cos(yawH), sy = sin(yawH), lx = fb.x * cy + rb.x * sy + ub.x * tl, ly = fb.y * cy + rb.y * sy + ub.y * tl, lz = fb.z * cy + rb.z * sy + ub.z * tl;
          var ch = cos(rollH), sh = sin(rollH);
          K.position.set(ex, ey, ez); K.up.set(ub.x * ch - rb.x * sh, ub.y * ch - rb.y * sh, ub.z * ch - rb.z * sh);
          K.lookAt(ex + lx * 10, ey + ly * 10, ez + lz * 10);
          setNear(K, E.near); setFov(K, E.vfov, 0, dt);
        }
        // the start screen: round your car on the grid, slowly, aimed low so the card has the bottom of the screen
        function orbit(dt, F, K) {
          C.orbit += dt * 0.3; Z.init = false;
          // (a front three-quarter on the outside of the car's own column (the other column's cars are on the inside),
          // far enough for the whole 5.6 m car, inside the barriers; aimed under it so the car sits in the top third
          // and the start card has the rest)
          var w0 = where(F.x, F.z), side = w0 && w0.lat < 0 ? -1 : 1;
          var tall = K.aspect < 1, a = F.h + side * (0.55 + sin(C.orbit) * 0.25), dd = tall ? 12.5 : 10.5;
          var px = F.x + sin(a) * dd, pz = F.z - cos(a) * dd, r = where(px, pz);
          if (r && typeof T.wallsAt === 'function' && typeof T.posAt === 'function') {
            var w = T.wallsAt(r.d, WW), lo = -(w.left - 0.8), hi = w.right - 0.8;
            if (hi > lo && (r.lat < lo || r.lat > hi)) { var P = T.posAt(r.d, clamp(r.lat, lo, hi), 0, PP); px = P.x; pz = P.z; }
          }
          K.position.set(px, F.y + (tall ? 2.0 : 1.6), pz); K.up.set(0, 1, 0);
          K.lookAt(F.x, F.y - (tall ? 3.5 : 1.7), F.z);
          setNear(K, CH.near); setFov(K, tall ? 54 : 40, 4, dt);
        }
        // X23: the exposure. A zone's target (stops) for the eye: the focus car's place along the lap for the player's
        // views, the lens's own for a TV shot; a new target is eased to in XT s (smootherstep: one monotonic move, so
        // the exposure can never oscillate); the page applies it (env.exposure(k), k = 2^ev)
        function inZone(z, d) { var L = T.L || 0; if (!(L > 0)) return d >= z.from && d <= z.to; var a = ((d - z.from) % L + L) % L, b = ((z.to - z.from) % L + L) % L; return a <= b; }
        function exposure(dt, F) {
          var tgt = 0;
          if (XP.zones.length) {
            var d = null;
            if (C.mode === 'tv') { var r = where(cam.position.x, cam.position.z); if (r && r.dist < 12) d = r.d; }
            else d = F.d != null ? F.d : (function () { var w0 = where(F.x, F.z); return w0 ? w0.d : null; })();
            if (d != null) for (var i = 0; i < XP.zones.length; i++) if (inZone(XP.zones[i], d)) { tgt = XP.zones[i].ev; break; }
          }
          if (tgt !== XP.target) { XP.from = XP.ev; XP.target = tgt; XP.t = 0; }
          XP.t += dt;
          var u = clamp(XP.t / XT, 0, 1), s = u * u * u * (u * (u * 6 - 15) + 10);
          XP.ev = XP.from + (XP.target - XP.from) * s;
          var k = Math.pow(2, XP.ev);
          if (!XP.sent || abs(k - XP.k) > 1e-4) { XP.k = k; XP.sent = true; if (typeof env.exposure === 'function') { try { env.exposure(k); } catch (e) { warn('Grand Prix: the exposure could not be set (' + (e && e.message || e) + ')'); env.exposure = null; } } }
        }
        function setZones(list) {
          XP.zones = (Array.isArray(list) ? list : []).filter(function (z) { return z && isFinite(z.from) && isFinite(z.to) && isFinite(z.ev); }).slice(0, 8)
            .map(function (z) { return { from: +z.from, to: +z.to, ev: clamp(+z.ev, -3, 3) }; });
          return copy(XP.zones);
        }
        // (the world's zones; else the race's covered stretches, lane A's gp.tunnels, at the stops the look sets for a lit
        // tunnel, gp.cameras.tunnelEv; none until it does: the greybox has no tunnel to adapt to)
        setZones(CA.exposure || env.zones || (Array.isArray(cfg.tunnels) && isFinite(CA.tunnelEv) ? cfg.tunnels.map(function (u) { return { from: u.from, to: u.to, ev: +CA.tunnelEv }; }) : null));
        function update(dt, F, info) {
          info = info || {};
          dt = clamp(+dt || 0, 0, 0.25);
          C.clock += dt;
          if (!F) return;
          if (info.title) { orbit(dt, F, cam); exposure(dt, F); remember(); return; }
          // the director's clock (and its tape): every frame, whatever the mode
          if (C.tick) { try { C.tick(dt, F, info); } catch (e) { warn('Grand Prix: the TV director failed (tick): ' + (e && e.message)); C.tick = null; } }
          // the rule: never a TV shot while the player is racing (the page says so, or the hand-off's latch is on)
          var racing = !!info.racing || C.hand;
          if (racing && C.mode === 'tv') { var was = C.mode; C.mode = legal(C.prev) ? C.prev : allow[0]; Z.init = false; logMode(was, C.mode, true); }
          var tv = false;
          if (C.mode === 'tv') {
            if (C.dir) { try { tv = !!C.dir(cam, F, info, dt); } catch (e) { warn('Grand Prix: the TV director failed: ' + (e && e.message)); C.dir = null; tv = false; } }
            if (tv) Z.init = false; else chase(dt, F, info, cam);
          }
          else if (C.mode === 'tcam' || C.mode === 'cockpit') onboard(dt, F, C.mode, cam);
          else chase(dt, F, info, cam);
          exposure(dt, F);
          // the rule's log: a TV frame drawn while the player races can not happen; if it ever does, it is counted
          A.frames++;
          if (racing) A.racing++;
          if (tv) { A.tv++; if (racing) { A.tvRacing++; if (!C.warnedTv) { C.warnedTv = true; warn('Grand Prix: a TV frame was drawn while the player raced (the chase-camera rule)'); } } }
          remember();
        }
        function remember() { C.pos[0] = cam.position.x; C.pos[1] = cam.position.y; C.pos[2] = cam.position.z; }
        // where a mode settles for this focus: the views run once on a scratch lens of this screen's shape, as their
        // first frame (their springs at rest), and the springs are put back as they were
        function rest(F, mode, out) {
          out = out || {};
          mode = legal(mode) ? mode : allow[0];
          if (!F) return null;
          var save = {}; for (var k in Z) save[k] = Z[k];
          var hint = C.hint, back = C.back;
          SC.aspect = cam.aspect; SC.fov = cam.fov; SC.near = cam.near; SC.far = cam.far; SC.updateProjectionMatrix();
          Z.init = false; Z.ph = null; Z.focusN = -1; Z.rate = 0; Z.shake = 0; C.back = false;
          if (mode === 'chase') chase(0, F, {}, SC); else onboard(0, F, mode, SC);
          for (k in save) Z[k] = save[k];
          C.hint = hint; C.back = back;
          SC.updateMatrixWorld(); SC.getWorldDirection(V1);
          out.mode = mode; out.p = [SC.position.x, SC.position.y, SC.position.z]; out.q = [SC.quaternion.x, SC.quaternion.y, SC.quaternion.z, SC.quaternion.w];
          out.up = [SC.up.x, SC.up.y, SC.up.z]; out.l = [SC.position.x + V1.x * 10, SC.position.y + V1.y * 10, SC.position.z + V1.z * 10]; out.fov = SC.fov; out.near = SC.near;
          return out;
        }
        var api = {
          mode: function (name, racing) { return name == null ? C.mode : setMode(String(name), !!racing); },
          cycle: function (racing) { var i = allow.indexOf(C.mode); return setMode(allow[(i + 1) % allow.length], !!racing); },
          look: function (back) { C.back = !!back && C.mode === 'chase'; return C.back; },
          update: update,
          state: function () { return { mode: C.mode, pos: C.pos.slice(), fov: cam.fov, near: cam.near, far: cam.far, back: C.back, hand: C.hand, exposure: { ev: +XP.ev.toFixed(4), target: XP.target, k: +XP.k.toFixed(4) } }; },
          director: function (fn) { C.dir = typeof fn === 'function' ? fn : null; },
          tick: function (fn) { C.tick = typeof fn === 'function' ? fn : null; },
          bind: function (o) { if (o && typeof o.race === 'function') C.race = o.race; return !!C.race; },
          hand: function (on) {
            if (on != null) {
              var was = C.hand; C.hand = !!on;
              if (C.hand && !was) { A.handAt = +C.clock.toFixed(3); if (C.mode === 'tv') { var m = C.mode; C.mode = legal(C.prev) ? C.prev : allow[0]; Z.init = false; logMode(m, C.mode, true); } }
              if (!C.hand && was) A.freeAt = +C.clock.toFixed(3);
            }
            return C.hand;
          },
          rest: rest,
          zones: function (list) { return list === undefined ? copy(XP.zones) : setZones(list); },
          exposure: function () { return { ev: XP.ev, target: XP.target, k: XP.k }; },
          audit: function (clear) { var o = copy(A); if (clear) { A.frames = A.racing = A.tv = A.tvRacing = 0; A.handAt = A.freeAt = null; A.modes = []; } return o; },
          // (the tests' and the look-dev's: read or set an onboard eye, { x, y, z, tilt, vfov, widen, across, halo, line,
          // yTall, zTall, tiltTall, vfovTall }; halo: null drops the T-cam's halo line and its tilt rules again)
          eye: function (mode, o) {
            var E = EYE[mode]; if (!E) return null;
            if (o) for (var k in o) { if (typeof o[k] === 'number' && isFinite(o[k])) E[k] = o[k]; else if (k === 'halo' && (o[k] === null || Array.isArray(o[k]))) E[k] = o[k] ? [+o[k][0], +o[k][1]] : null; }
            return copy(E);
          },
          event: function (e) { if (e && (e.e === 'contact' || e.e === 'wall') && !RM) { var live = Z.shake > 0; Z.shake = 0.3; Z.shK = max(live ? Z.shK : 0, CH.contact * clamp((+e.dv || 1) / 12, 0.3, 1)); } },
          // (the director's: back from a TV shot to the player's own view, the one he had before it)
          untv: function () { if (C.mode === 'tv') { var m = C.mode; C.mode = legal(C.prev) ? C.prev : allow[0]; Z.init = false; logMode(m, C.mode, false); } return C.mode; },
          reset: function () { Z.init = false; Z.ph = null; C.hint = -1; Z.shake = 0; Z.landK = 0; Z.light = 0; if (C.hand) { C.hand = false; A.freeAt = +C.clock.toFixed(3); } },
          allow: function () { return allow.slice(); },
          // the views' springs and the mode, to put back after something borrowed the lens (shootout-camera's pattern)
          snapshot: function () { var z = {}; for (var k in Z) z[k] = Z[k]; return { Z: z, mode: C.mode, prev: C.prev, back: C.back }; },
          restore: function (s) { if (!s || !s.Z) return false; for (var k in s.Z) if (k in Z) Z[k] = s.Z[k]; C.mode = s.mode; C.prev = s.prev; C.back = !!s.back; return true; },
        };
        // (a handle for the tests, on the camera itself: the page's internals reach it, nothing else does)
        try { if (cam.userData) cam.userData.gpCam = api; } catch (e) {}
        return api;
      }

      return { camera: camera, MODES: MODES, CHASE: CHASE, EYES: EYES };
    })();
