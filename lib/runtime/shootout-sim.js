    /* ================================================ penalty shootout: the ball, the goal frame and the net (sim) == */
    // SHOOTOUT M1, lane B. PURE: no THREE, no DOM, no clock, no Math.random; only Math and the ES built-ins. Pasted into
    // boot() by shootout.js, and loaded by Node with vm.runInNewContext(src + ';ShootSim', {}), so it declares ONE
    // top-level binding. One kicked ball on a fixed 120 Hz step (x4 sub-steps near the goal or the keeper):
    //  - air: drag (CD 0.25) and Magnus lift (CL = min(0.30, 0.9 S)), spin decaying over 8 s, semi-implicit RK2;
    //  - the ground: restitution 0.62, tangential 0.80 a bounce, then rolling at 0.6 m/s2 to rest;
    //  - the frame: two posts and the bar as capsules of radius 0.06 (restitution 0.60, tangential 0.85), stanchions;
    //  - the net: an ANALYTIC catch volume (planes, no particles, no springs between points, no solver: design 3.5).
    //    Each plane pushes on the ball whenever its centre is closer than R from the inside, past the plane included,
    //    one-sided (it never pulls), critically damped, with the depth clamped (critique #14);
    //  - the keeper: proxy colliders from the brain (spheres and capsules with velocities); held or parried (3.7);
    //  - the outcome, decided once at the deciding step (3.8 with critique #5).
    // Coordinates: metres, Y up, the pitch along z; the goal line at z = -52.5, the penalty spot at (0, -41.5).
    var ShootSim = (function () {
      var PI = Math.PI, sqrt = Math.sqrt, abs = Math.abs, min = Math.min, max = Math.max, exp = Math.exp;
      var sin = Math.sin, cos = Math.cos, atan = Math.atan, atan2 = Math.atan2;
      var DEG = PI / 180, REV = 2 * PI;
      var C = {
        R: 0.11, M: 0.43, RHO: 1.2, G: 9.81, H: 1 / 120,
        CD: 0.25, CL_MAX: 0.30, CL_K: 0.9, SPIN_TAU: 8,
        // the ground (a Gameplay Football constant, the fact, for the bounce; no code copied)
        GROUND_E: 0.62, GROUND_T: 0.80, ROLL: 0.6, ROLL_VY: 0.6, REST_V: 0.03,
        // the woodwork, the keeper
        // (a stanchion met from inside the net is met through the net: cushioned)
        WOOD_E: 0.60, WOOD_T: 0.85, STAN_E: 0.30, STAN_T: 0.60, STAN_IN_E: 0.05, STAN_IN_T: 0.40,
        GLOVE_E: 0.30, BODY_E: 0.45, MU: 0.4,
        // (HOLD_VN: design 3.7 says 12; 14 lets the weakest scuff, 15 m/s off the boot and ~13.4 at the line, be held
        // when it is struck straight at both gloves; a 22 m/s penalty is always a parry)
        HOLD_VN: 14, HOLD_AXIS: 0.08, HOLD_GAP: 0.35,
        // the net: wn 23 rad/s, critically damped; 6/s along it; never deeper than 0.5 m; the outside of it is stiff
        // (the one-sided clamp alone throws a ball back out at ~3.9 m/s from 0.45 m deep: on the way back out the spring
        // keeps only NET_RELEASE of its stiffness, a net's hysteresis, so the ball creeps back and drops inside)
        NET_W: 23, NET_ZETA: 1, NET_RELEASE: 0.1, NET_TDAMP: 6, NET_MAX: 0.5, NET_ON: 0.01, NET_REST: 0.04, NET_OUT_E: 0.15, NET_OUT_T: 0.6,
        // sub-steps (x4 = 480 Hz) within 1.2 m of the goal plane or 0.6 m of a keeper collider
        SUB: 4, NEAR_PLANE: 1.2, NEAR_COLL: 0.6,
        // the outcome: 3 s after contact at most; "moving away" = vz > 2 m/s and 2.5 m out
        TIMEOUT: 3, AWAY_VZ: 2, AWAY_Z: 2.5,
        // the kick (3.6): base 22 m/s, perfect +1.5, a scuff down to 15; spin cosmetic (the solver absorbs it), rev/s
        SPEED: 22, SPEED_PERFECT: 1.5, SPEED_MIN: 15, BACKSPIN: 5, SIDESPIN: 3,
        goal: { GZ: -52.5, half: 3.66, barY: 2.44, postX: 3.72, barC: 2.50, postR: 0.06, roofD: 1.4, backD: 2.3, stanX: 3.7, stanR: 0.025 },
        spot: [0, 0.11, -41.5], keeperZ: -52.35,
      };
      C.A = PI * C.R * C.R;
      var KD = 0.5 * C.RHO * C.CD * C.A / C.M, KL = 0.5 * C.RHO * C.A / C.M;

      /* ---------------------------------------------------------------------------------------------- seeds -- */
      // mulberry32 (exact: the state is kept as a uint32) and a cached Box-Muller pair
      function rng(seed) {
        var s = seed >>> 0, spare = 0, has = false;
        function next() {
          s = (s + 0x6D2B79F5) >>> 0;
          var x = s;
          x = Math.imul(x ^ (x >>> 15), x | 1);
          x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        }
        function gauss() {
          if (has) { has = false; return spare; }
          var u = next(), v = next();
          if (u < 1e-12) u = 1e-12;
          var m = sqrt(-2 * Math.log(u)), a = REV * v;
          spare = m * sin(a); has = true;
          return m * cos(a);
        }
        return { next: next, gauss: gauss, save: function () { return [s, spare, has]; }, load: function (a) { s = a[0] >>> 0; spare = +a[1]; has = !!a[2]; } };
      }
      // FNV-1a over 32-bit integers (4 bytes each)
      function fnv(h, x) {
        for (var k = 0; k < 4; k++) { h ^= (x >>> (k * 8)) & 255; h = Math.imul(h, 16777619); }
        return h >>> 0;
      }
      function hex(h) { return ('00000000' + (h >>> 0).toString(16)).slice(-8); }
      // a kick's seed from the session's and the kick's index (and the three streams: ^0xA1 mind, ^0xB2 keeper, ^0xC3 cone)
      function mix(a, b) {
        var h = fnv(fnv(0x811C9DC5, a | 0), b | 0);
        h ^= h >>> 16; h = Math.imul(h, 0x45D9F3B); h ^= h >>> 16;
        return h >>> 0;
      }
      function stream(seed, tag) { return rng(((seed >>> 0) ^ tag) >>> 0); }

      /* ------------------------------------------------------------------------------------------- geometry -- */
      function assign(a, b) { if (b) for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; return a; }
      // the goal's planes (inward normals) and capsules, shared with the goal mesh so the two never disagree
      function geom(over) {
        var g = assign(assign({}, C.goal), over), GZ = g.GZ, X = g.half, Y = g.barY, D0 = g.roofD, D1 = g.backD;
        var bl = sqrt(Y * Y + (D1 - D0) * (D1 - D0));
        var planes = [
          // the back net falls from the roof's edge (y Y, z GZ-D0) to the turf further out (y 0, z GZ-D1)
          { id: 'back', o: [0, Y, GZ - D0], n: [0, -(D1 - D0) / bl, Y / bl] },
          { id: 'roof', o: [0, Y, GZ], n: [0, -1, 0] },
          { id: 'L', o: [-X, 0, GZ], n: [1, 0, 0] },
          { id: 'R', o: [X, 0, GZ], n: [-1, 0, 0] },
        ];
        var px = g.postX, pr = g.postR, bc = g.barC, sx = g.stanX, sr = g.stanR;
        var caps = [
          { id: 'postL', part: 'post', side: -1, a: [-px, 0, GZ], b: [-px, bc, GZ], r: pr },
          { id: 'postR', part: 'post', side: 1, a: [px, 0, GZ], b: [px, bc, GZ], r: pr },
          { id: 'bar', part: 'bar', side: 0, a: [-px, bc, GZ], b: [px, bc, GZ], r: pr },
          { id: 'stanL', part: 'stanchion', side: -1, a: [-sx, 0, GZ - D0], b: [-sx, Y, GZ - D0], r: sr },
          { id: 'stanR', part: 'stanchion', side: 1, a: [sx, 0, GZ - D0], b: [sx, Y, GZ - D0], r: sr },
        ];
        return { g: g, GZ: GZ, LINE: GZ - pr - C.R, X: X, Y: Y, D0: D0, D1: D1, planes: planes, caps: caps };
      }
      function pdist(P, x, y, z) { return (x - P.o[0]) * P.n[0] + (y - P.o[1]) * P.n[1] + (z - P.o[2]) * P.n[2]; }
      // is (x, y, z) inside the net's volume (behind the line, under the roof, in front of the back, between the sides)?
      function inVolume(GM, x, y, z, slack) {
        var s = slack || 0;
        if (z > GM.GZ + s) return false;
        for (var i = 0; i < GM.planes.length; i++) if (pdist(GM.planes[i], x, y, z) < -s) return false;
        return y > -s;
      }
      // the closest point of a segment (a, b) to p, into out; returns nothing
      function segClosest(px, py, pz, ax, ay, az, bx, by, bz, out) {
        var ux = bx - ax, uy = by - ay, uz = bz - az, uu = ux * ux + uy * uy + uz * uz;
        var t = uu > 1e-12 ? ((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / uu : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        out[0] = ax + ux * t; out[1] = ay + uy * t; out[2] = az + uz * t;
      }
      function dirOf(yaw, pitch) { var cp = cos(pitch); return [sin(yaw) * cp, sin(pitch), -cos(yaw) * cp]; }
      // the cosmetic spin for a target (rad/s): backspin about (dir x up), sidespin -3 rev/s x aimX/3.66 about y
      function spinFor(target, from) {
        from = from || C.spot;
        var dx = target[0] - from[0], dz = C.goal.GZ - from[2], l = sqrt(dx * dx + dz * dz) || 1;
        // dir x up = (-dz, 0, dx)/l for a dir of (dx, ., dz)
        var b = C.BACKSPIN * REV, s = -C.SIDESPIN * REV * (target[0] / C.goal.half);
        return [-dz / l * b, s, dx / l * b];
      }

      /* ------------------------------------------------------------------------------------------ the cone -- */
      // the release error (e, seconds, signed: + late) against the window W -> the deviation, the speed and the grade
      function cone(o, r) {
        o = o || {};
        var e = +o.err || 0, W = o.W > 0 ? +o.W : 0.15, q = abs(e) / (W / 2), qq = min(q, 3);
        var sig = q <= 1 ? 0.5 + 1.0 * q * q : 1.5 + 2.5 * min(1, (q - 1) / 2);
        var bias = 0, sk = 1, grade;
        if (e < 0) { bias = -0.6 * qq; sk = 1 - 0.06 * qq; } else if (e > 0) { bias = 1.0 * qq; sk = 1 - 0.03 * qq; }
        if (q <= 0.35) { grade = 'perfect'; sk = (C.SPEED + C.SPEED_PERFECT) / C.SPEED; }
        else if (q <= 1) grade = 'good';
        else if (q <= 3) grade = e < 0 ? 'early' : 'late';
        else if (e < 0) { grade = 'scuffed'; sk = (1 - 0.18) + ((C.SPEED_MIN / C.SPEED) - (1 - 0.18)) * min(1, (q - 3) / 2); }
        else grade = 'leaned';
        // [tap X13] k: the heat's multiplier on the window-derived sigma (never on an explicit sigma);
        // auto: the strike he made anyway at plant + 0.28 s = scuffed, sigma 4.0 k, the minimum speed, low
        var kk = o.k > 0 && isFinite(+o.k) ? +o.k : 1;
        if (o.auto) { grade = 'scuffed'; sig = 4.0; sk = C.SPEED_MIN / C.SPEED; bias = -1.8; }
        sig *= kk;
        // two draws from the cone's stream, always both and in this order (the stream stays aligned)
        var g1 = r ? r.gauss() : 0, g2 = r ? r.gauss() : 0;
        if (o.sigma != null && isFinite(+o.sigma)) { sig = max(0, +o.sigma); if (sig === 0) { bias = 0; sk = 1; } }
        return { dYaw: sig * g1 * DEG, dPitch: (sig * g2 + bias) * DEG, speedK: sk, sigma: sig, bias: bias, q: q, e: e, W: W, grade: grade, k: kk, auto: !!o.auto, pressure: +o.pressure || 0 };
      }

      /* ------------------------------------------------------------------------------------------ the core -- */
      var A1 = [0, 0, 0], A2 = [0, 0, 0], CP = [0, 0, 0], CQ = [0, 0, 0];
      // the acceleration at (p, v) for a ball B (B.w the spin, B.roll, B.inNet); planes when it is in the net
      function accel(B, px, py, pz, vx, vy, vz, out, planes) {
        var ax = 0, ay = B.roll ? 0 : -C.G, az = 0;
        var sp = sqrt(vx * vx + vy * vy + vz * vz);
        if (sp > 1e-9) {
          var kd = KD * sp; ax -= kd * vx; ay -= kd * vy; az -= kd * vz;
          if (!B.roll) {
            var w = B.w, wm = sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
            if (wm > 1e-9) {
              // |a| = KL CL v^2 sin(w, v) along w x v
              var cl = min(C.CL_MAX, C.CL_K * C.R * wm / sp), kl = KL * cl * sp / wm;
              ax += kl * (w[1] * vz - w[2] * vy); ay += kl * (w[2] * vx - w[0] * vz); az += kl * (w[0] * vy - w[1] * vx);
            }
          } else {
            var hs = sqrt(vx * vx + vz * vz);
            if (hs > 1e-9) { ax -= C.ROLL * vx / hs; az -= C.ROLL * vz / hs; }
          }
        }
        if (B.inNet && planes) {
          var W = C.NET_W, Z2 = 2 * C.NET_ZETA * W;
          for (var i = 0; i < planes.length; i++) {
            var P = planes[i], n = P.n, d = (px - P.o[0]) * n[0] + (py - P.o[1]) * n[1] + (pz - P.o[2]) * n[2];
            if (d >= C.R) continue;
            // whenever the centre is within R of the plane (and past it): one-sided, the depth clamped
            var dl = min(C.R - d, C.NET_MAX), vn = vx * n[0] + vy * n[1] + vz * n[2], an = (vn < 0 ? 1 : C.NET_RELEASE) * W * W * dl - Z2 * vn;
            if (an > 0) { ax += an * n[0]; ay += an * n[1]; az += an * n[2]; }
            var td = C.NET_TDAMP;
            ax -= td * (vx - vn * n[0]); ay -= td * (vy - vn * n[1]); az -= td * (vz - vn * n[2]);
          }
        }
        if (B.roll && ay < 0) ay = 0;
        out[0] = ax; out[1] = ay; out[2] = az;
      }
      // semi-implicit RK2 (the midpoint) on p and v
      function integrate(B, dt, planes) {
        var p = B.p, v = B.v, h2 = dt / 2;
        accel(B, p[0], p[1], p[2], v[0], v[1], v[2], A1, planes);
        var mx = p[0] + v[0] * h2, my = p[1] + v[1] * h2, mz = p[2] + v[2] * h2;
        var ux = v[0] + A1[0] * h2, uy = v[1] + A1[1] * h2, uz = v[2] + A1[2] * h2;
        accel(B, mx, my, mz, ux, uy, uz, A2, planes);
        p[0] += ux * dt; p[1] += uy * dt; p[2] += uz * dt;
        v[0] += A2[0] * dt; v[1] += A2[1] * dt; v[2] += A2[2] * dt;
      }
      // the spin: decays in the air, rolls without slipping on the turf; the render quaternion follows it
      function spin(B, dt) {
        var w = B.w, v = B.v;
        if (B.roll) { w[0] = v[2] / C.R; w[1] = 0; w[2] = -v[0] / C.R; }
        else { var k = exp(-dt / C.SPIN_TAU); w[0] *= k; w[1] *= k; w[2] *= k; }
        if (!B.q) return;
        var wm = sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]), ang = wm * dt;
        if (ang < 1e-12) return;
        var s = sin(ang / 2) / wm, dx = w[0] * s, dy = w[1] * s, dz = w[2] * s, dw = cos(ang / 2), q = B.q;
        var x = dw * q[0] + dx * q[3] + dy * q[2] - dz * q[1];
        var y = dw * q[1] - dx * q[2] + dy * q[3] + dz * q[0];
        var z = dw * q[2] + dx * q[1] - dy * q[0] + dz * q[3];
        var ww = dw * q[3] - dx * q[0] - dy * q[1] - dz * q[2];
        var l = sqrt(x * x + y * y + z * z + ww * ww) || 1;
        q[0] = x / l; q[1] = y / l; q[2] = z / l; q[3] = ww / l;
      }
      // the turf: bounce, or settle into a roll once the bounce is small
      function ground(B, ev, tt) {
        var p = B.p, v = B.v;
        if (p[1] < C.R) {
          if (v[1] < 0) {
            if (!B.roll && -v[1] > C.ROLL_VY) {
              var sp = -v[1];
              v[1] = C.GROUND_E * sp; v[0] *= C.GROUND_T; v[2] *= C.GROUND_T;
              B.w[0] = 0.5 * B.w[0] + 0.5 * v[2] / C.R; B.w[1] *= 0.5; B.w[2] = 0.5 * B.w[2] - 0.5 * v[0] / C.R;
              if (ev) ev.push({ type: 'ground', t: tt, at: [p[0], 0, p[2]], speed: sp });
            } else { v[1] = 0; B.roll = true; }
          }
          p[1] = C.R;
        } else if (B.roll && (p[1] > C.R + 1e-4 || v[1] > 0.05)) B.roll = false;
      }

      // the flight of a free ball (no frame, no net, no keeper) to the plane z = zp: { x, y, t } or null
      function fly(from, v0, w0, zp, maxT) {
        var B = { p: from.slice(), v: v0.slice(), w: w0.slice(), roll: false, inNet: false, q: null };
        var t = 0, T = maxT || 3, H = C.H, bounced = false;
        while (t < T) {
          var n = B.p[2] < zp + C.NEAR_PLANE ? C.SUB : 1, dt = H / n;
          for (var i = 0; i < n; i++) {
            var xa = B.p[0], ya = B.p[1], za = B.p[2];
            integrate(B, dt, null); spin(B, dt);
            if (B.p[1] < C.R) bounced = true;
            ground(B, null, 0);
            if (za >= zp && B.p[2] < zp) {
              var f = (za - zp) / (za - B.p[2]);
              return { x: xa + (B.p[0] - xa) * f, y: ya + (B.p[1] - ya) * f, t: t + (i + f) * dt, bounced: bounced };
            }
          }
          t += H;
          if (B.roll && B.v[0] * B.v[0] + B.v[2] * B.v[2] < 0.01) return null;
          if (B.v[2] >= 0 && B.p[2] > zp) return null;
        }
        return null;
      }

      /* ------------------------------------------------------------------------------------------ the sim -- */
      function clone(o) {
        if (o === null || typeof o !== 'object') return o;
        if (Array.isArray(o)) { var a = new Array(o.length); for (var i = 0; i < o.length; i++) a[i] = clone(o[i]); return a; }
        var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = clone(o[k]);
        return r;
      }
      function create(o) {
        o = o || {};
        var GM = geom(o.goal), GZ = GM.GZ, LINE = GM.LINE, PL = GM.planes, CAPS = GM.caps;
        var colliders = typeof o.colliders === 'function' ? o.colliders : null;
        var cr = stream(o.seed >>> 0, 0xC3);
        var S, TR = [], TRMAX = 120 * 20 * 3;
        function fresh(t0) {
          return {
            t: +t0 || 0, phase: 'idle', p: C.spot.slice(), v: [0, 0, 0], w: [0, 0, 0], q: [0, 0, 0, 1], p0: C.spot.slice(), q0: [0, 0, 0, 1],
            roll: false, inNet: false, tLaunch: null, steps: 0,
            touched: { keeper: false, post: false, bar: false }, wood: null, sideNet: false,
            net: { on: false, at: [0, 0, 0], n: [0, 0, -1], depth: 0, tRel: -1, plane: null, peak: 0, speed: 0, outside: false },
            cross: null, held: null, outcome: null, h: 0x811C9DC5, hashDone: false, contacts: [], touching: {},
          };
        }
        S = fresh(o.t0);

        function closestOn(c, tau, out) {
          var v = c.v, vx = v ? v[0] * tau : 0, vy = v ? v[1] * tau : 0, vz = v ? v[2] * tau : 0, a = c.a;
          if (c.kind === 'capsule' && c.b) { var b = c.b; segClosest(S.p[0], S.p[1], S.p[2], a[0] + vx, a[1] + vy, a[2] + vz, b[0] + vx, b[1] + vy, b[2] + vz, out); }
          else { out[0] = a[0] + vx; out[1] = a[1] + vy; out[2] = a[2] + vz; }
        }
        function near(cols, h) {
          if (S.p[2] < GZ + C.NEAR_PLANE) return true;
          var vs = sqrt(S.v[0] * S.v[0] + S.v[1] * S.v[1] + S.v[2] * S.v[2]);
          for (var i = 0; i < cols.length; i++) {
            var c = cols[i]; closestOn(c, 0, CQ);
            var dx = S.p[0] - CQ[0], dy = S.p[1] - CQ[1], dz = S.p[2] - CQ[2], cv = c.v ? sqrt(c.v[0] * c.v[0] + c.v[1] * c.v[1] + c.v[2] * c.v[2]) : 0;
            if (sqrt(dx * dx + dy * dy + dz * dz) - C.R - c.r < C.NEAR_COLL + (vs + cv) * h) return true;
          }
          return false;
        }
        function contact(e) { S.contacts.push({ type: e.type, t: e.t, part: e.part || null, side: e.side == null ? null : e.side, at: e.at.slice(), speed: e.speed }); }
        function decide(kind, ev, tt, at) {
          if (S.outcome) return;
          S.outcome = {
            kind: kind, t: tt, at: (at || S.p).slice(), woodwork: !!S.wood, part: S.wood, keeperTouched: S.touched.keeper, held: !!S.held,
            miss: kind === 'wide' || kind === 'over' ? kind : kind === 'miss' ? 'short' : null, cross: S.cross ? S.cross.slice() : null,
          };
          ev.push({ type: 'outcome', t: tt, at: S.outcome.at.slice(), kind: kind, outcome: clone(S.outcome) });
        }
        // the frame: posts, bar (woodwork) and stanchions
        function frame(ev, tt) {
          var p = S.p, v = S.v;
          for (var i = 0; i < CAPS.length; i++) {
            var c = CAPS[i], rr = C.R + c.r;
            segClosest(p[0], p[1], p[2], c.a[0], c.a[1], c.a[2], c.b[0], c.b[1], c.b[2], CP);
            var dx = p[0] - CP[0], dy = p[1] - CP[1], dz = p[2] - CP[2], d = sqrt(dx * dx + dy * dy + dz * dz);
            if (d >= rr) { S.touching[c.id] = false; continue; }
            var nx, ny, nz;
            if (d > 1e-9) { nx = dx / d; ny = dy / d; nz = dz / d; }
            else { var vm = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; nx = -v[0] / vm; ny = -v[1] / vm; nz = -v[2] / vm; }
            p[0] = CP[0] + nx * rr; p[1] = CP[1] + ny * rr; p[2] = CP[2] + nz * rr;
            var vn = v[0] * nx + v[1] * ny + v[2] * nz;
            if (vn < 0) {
              var wood = c.part !== 'stanchion', e = wood ? C.WOOD_E : S.inNet ? C.STAN_IN_E : C.STAN_E, kt = wood ? C.WOOD_T : S.inNet ? C.STAN_IN_T : C.STAN_T;
              var tx = v[0] - vn * nx, ty = v[1] - vn * ny, tz = v[2] - vn * nz;
              v[0] = tx * kt - e * vn * nx; v[1] = ty * kt - e * vn * ny; v[2] = tz * kt - e * vn * nz;
              S.w[0] *= 0.7; S.w[1] *= 0.7; S.w[2] *= 0.7;
              if (!S.touching[c.id]) {
                var E = { type: wood ? c.part : 'net', t: tt, at: [CP[0] + nx * c.r, CP[1] + ny * c.r, CP[2] + nz * c.r], speed: -vn, side: c.side, part: c.part };
                ev.push(E);
                if (wood) { S.touched[c.part] = true; S.wood = c.part; contact(E); }
              }
              if (S.roll && v[1] > 0.05) S.roll = false;
            }
            S.touching[c.id] = true;
          }
        }
        // the keeper's colliders (extrapolated by their velocities to this sub-step's end); held or parried
        function keeper(cols, tau, ev, tt) {
          var p = S.p, v = S.v;
          for (var i = 0; i < cols.length; i++) {
            var c = cols[i], key = 'k' + i, rr = C.R + c.r;
            closestOn(c, tau, CP);
            var dx = p[0] - CP[0], dy = p[1] - CP[1], dz = p[2] - CP[2], d = sqrt(dx * dx + dy * dy + dz * dz);
            // (a collider with a non-finite number in it is skipped, never followed into NaN)
            if (!(d < rr) || !(c.r > 0)) { S.touching[key] = false; continue; }
            var cv = c.v || [0, 0, 0], rx = v[0] - cv[0], ry = v[1] - cv[1], rz = v[2] - cv[2], nx, ny, nz;
            if (d > 1e-9) { nx = dx / d; ny = dy / d; nz = dz / d; }
            else { var rm = sqrt(rx * rx + ry * ry + rz * rz) || 1; nx = -rx / rm; ny = -ry / rm; nz = -rz / rm; }
            var vn = rx * nx + ry * ny + rz * nz;
            if (vn < 0) {
              var at = [CP[0] + nx * c.r, CP[1] + ny * c.r, CP[2] + nz * c.r], glove = c.part === 'glove';
              if (glove && holds(c, cols, nx, ny, nz, rx, ry, rz, vn)) {
                S.touched.keeper = true;
                var E0 = { type: 'glove', t: tt, at: at, speed: -vn, part: 'glove', side: c.side == null ? null : c.side };
                ev.push(E0); contact(E0);
                ev.push({ type: 'held', t: tt, at: at.slice(), part: 'glove', side: E0.side });
                follow(cols);
                return true;
              }
              var e = glove ? C.GLOVE_E : C.BODY_E, jn = -(1 + e) * vn;
              var tx = rx - vn * nx, ty = ry - vn * ny, tz = rz - vn * nz, tm = sqrt(tx * tx + ty * ty + tz * tz);
              var fr = tm > 1e-9 ? min(tm, C.MU * jn) / tm : 0;
              rx += jn * nx - fr * tx; ry += jn * ny - fr * ty; rz += jn * nz - fr * tz;
              v[0] = cv[0] + rx; v[1] = cv[1] + ry; v[2] = cv[2] + rz;
              S.w[0] *= 0.5; S.w[1] *= 0.5; S.w[2] *= 0.5;
              S.touched.keeper = true;
              if (S.roll && v[1] > 0.05) S.roll = false;
              if (!S.touching[key]) { var E = { type: glove ? 'glove' : 'body', t: tt, at: at, speed: -vn, part: c.part || 'body', side: c.side == null ? null : c.side }; ev.push(E); contact(E); }
            }
            p[0] = CP[0] + nx * rr; p[1] = CP[1] + ny * rr; p[2] = CP[2] + nz * rr;
            S.touching[key] = true;
          }
          return false;
        }
        // a catch (3.7): both gloves within HOLD_GAP of each other, the ball coming INTO them slower than HOLD_VN
        // (relative; so |v_rel . n| is too), and square: its centre within HOLD_AXIS of the line through the two gloves'
        // midpoint along its approach (a two-handed catch; a ball between the hands always meets each glove off its
        // own axis). A palm on the collider, when the brain gives one, must face the ball. Else it is a parry.
        function holds(c, cols, nx, ny, nz, rx, ry, rz, vn) {
          if (-vn >= C.HOLD_VN) return false;
          var o2 = other(cols, c); if (!o2) return false;
          var gx = c.a[0] - o2.a[0], gy = c.a[1] - o2.a[1], gz = c.a[2] - o2.a[2];
          if (sqrt(gx * gx + gy * gy + gz * gz) >= C.HOLD_GAP) return false;
          var vm = sqrt(rx * rx + ry * ry + rz * rz);
          if (!(vm > 1e-6) || vm >= C.HOLD_VN) return false;
          if (c.palm && rx * c.palm[0] + ry * c.palm[1] + rz * c.palm[2] >= 0) return false;
          var ux = rx / vm, uy = ry / vm, uz = rz / vm;
          var qx = S.p[0] - (c.a[0] + o2.a[0]) / 2, qy = S.p[1] - (c.a[1] + o2.a[1]) / 2, qz = S.p[2] - (c.a[2] + o2.a[2]) / 2;
          var al = qx * ux + qy * uy + qz * uz, px = qx - al * ux, py = qy - al * uy, pz = qz - al * uz;
          if (sqrt(px * px + py * py + pz * pz) > C.HOLD_AXIS) return false;
          // (it stays where the hands met it: its offset from their midpoint, kept short of the far side)
          var ol = sqrt(qx * qx + qy * qy + qz * qz), ok = ol > 0.16 ? 0.16 / ol : 1;
          S.held = { sides: [c.side == null ? null : c.side, o2.side == null ? null : o2.side], off: [qx * ok, qy * ok, qz * ok] };
          return true;
        }
        function other(cols, c) {
          for (var i = 0; i < cols.length; i++) if (cols[i] !== c && cols[i].part === 'glove' && cols[i].side !== c.side) return cols[i];
          return null;
        }
        function gloves(cols) {
          var a = null, b = null, sd = S.held.sides;
          for (var i = 0; i < cols.length; i++) if (cols[i].part === 'glove') { if (cols[i].side === sd[0] && !a) a = cols[i]; else if (cols[i].side === sd[1] && !b) b = cols[i]; }
          return a && b ? [a, b] : null;
        }
        // a held ball sits between the gloves and goes where they go
        function follow(cols) {
          var gl = gloves(cols);
          if (!gl) { S.held = null; return false; }
          var a = gl[0], b = gl[1], av = a.v || [0, 0, 0], bv = b.v || [0, 0, 0];
          var off = S.held.off || [0, 0, 0];
          S.p[0] = (a.a[0] + b.a[0]) / 2 + off[0]; S.p[1] = max(C.R, (a.a[1] + b.a[1]) / 2 + off[1]); S.p[2] = (a.a[2] + b.a[2]) / 2 + off[2];
          S.v[0] = (av[0] + bv[0]) / 2; S.v[1] = (av[1] + bv[1]) / 2; S.v[2] = (av[2] + bv[2]) / 2;
          S.w[0] *= 0.9; S.w[1] *= 0.9; S.w[2] *= 0.9; S.roll = false;
          return true;
        }
        // the net from outside (a wide ball on the side netting, an over on the roof): stiff and damped, never through
        function netOutside(ev, tt) {
          if (S.inNet) return;
          var p = S.p, v = S.v, X = GM.X, Y = GM.Y;
          for (var i = 0; i < PL.length; i++) {
            var P = PL[i], d = pdist(P, p[0], p[1], p[2]), s = -d;   // s > 0: outside this plane
            if (s >= C.R || s <= -C.R) { S.touching['o' + P.id] = false; continue; }
            // on the face of this plane's own piece of net?
            var on;
            if (P.id === 'L' || P.id === 'R') on = p[1] >= 0 && p[1] <= Y && p[2] <= GZ && pdist(PL[0], p[0], p[1], p[2]) >= -C.R;
            else if (P.id === 'roof') on = abs(p[0]) <= X && p[2] <= GZ && p[2] >= GZ - GM.D0 && p[1] >= Y - C.R;
            else on = abs(p[0]) <= X && p[1] >= 0 && p[1] <= Y && p[2] < GZ - GM.D0;
            // (and from the outside only: a ball that is in the volume came in through the mouth and is inNet)
            if (!on || inVolume(GM, p[0], p[1], p[2], -1e-6) && s < 0) { S.touching['o' + P.id] = false; continue; }
            var n = P.n, push = C.R - s;
            p[0] -= n[0] * push; p[1] -= n[1] * push; p[2] -= n[2] * push;
            var vin = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
            if (vin > 0) {
              var tx = v[0] - vin * n[0], ty = v[1] - vin * n[1], tz = v[2] - vin * n[2];
              v[0] = tx * C.NET_OUT_T - C.NET_OUT_E * vin * n[0]; v[1] = ty * C.NET_OUT_T - C.NET_OUT_E * vin * n[1]; v[2] = tz * C.NET_OUT_T - C.NET_OUT_E * vin * n[2];
              if (P.id === 'L' || P.id === 'R') S.sideNet = true;
              if (!S.touching['o' + P.id]) ev.push({ type: 'net', t: tt, at: [p[0] - n[0] * C.R, p[1] - n[1] * C.R, p[2] - n[2] * C.R], speed: vin, part: P.id, outside: true });
            }
            S.touching['o' + P.id] = true;
          }
        }
        // the net from inside: the clamp, the contact for the visuals, a 'net' event as the ball meets each piece
        function netInside(dt, ev, tt) {
          var N = S.net;
          if (!S.inNet) { if (N.plane && !N.on) N.tRel += dt; return; }
          var p = S.p, v = S.v, best = null, bd = 0, bdist = 0;
          for (var i = 0; i < PL.length; i++) {
            var P = PL[i], n = P.n, d = pdist(P, p[0], p[1], p[2]);
            if (d >= C.R) { S.touching[P.id] = false; continue; }
            var dl = C.R - d;
            if (dl > C.NET_MAX) {
              var sh = dl - C.NET_MAX; p[0] += n[0] * sh; p[1] += n[1] * sh; p[2] += n[2] * sh;
              var vn0 = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
              if (vn0 < 0) { v[0] -= vn0 * n[0]; v[1] -= vn0 * n[1]; v[2] -= vn0 * n[2]; }
              dl = C.NET_MAX; d = C.R - dl;
            }
            if (!S.touching[P.id]) {
              var vi = -(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]);
              if (vi > 0.3) { ev.push({ type: 'net', t: tt, at: [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d], speed: vi, part: P.id }); N.speed = vi; }
            }
            S.touching[P.id] = true;
            if (dl > bd) { bd = dl; best = P; bdist = d; }
          }
          if (best && bd > C.NET_ON) {
            var bn = best.n;
            N.on = true; N.plane = best.id; N.depth = bd; N.tRel = 0; N.outside = false; if (bd > N.peak) N.peak = bd;
            N.at[0] = p[0] - bn[0] * bdist; N.at[1] = p[1] - bn[1] * bdist; N.at[2] = p[2] - bn[2] * bdist;
            N.n[0] = -bn[0]; N.n[1] = -bn[1]; N.n[2] = -bn[2];
          } else {
            if (N.on) { N.on = false; N.tRel = 0; }
            if (N.plane) N.tRel += dt;
            N.depth = best ? bd : 0;
          }
        }
        // the plane z = GZ (the first crossing; into the net when it is inside the mouth) and the whole-ball line
        function crossings(x0, y0, z0, ev, tt) {
          var p = S.p, z1 = p[2];
          if (z0 >= GZ && z1 < GZ) {
            var f = (z0 - GZ) / (z0 - z1), x = x0 + (p[0] - x0) * f, y = y0 + (p[1] - y0) * f;
            if (!S.cross) { S.cross = [x, y]; ev.push({ type: 'plane', t: tt, at: [x, y, GZ] }); }
            if (abs(x) < GM.X && y < GM.Y) S.inNet = true;
          } else if (S.inNet && z1 > GZ + 0.2) S.inNet = false;
          if (!S.outcome && z0 >= LINE && z1 < LINE) {
            var g = (z0 - LINE) / (z0 - z1), lx = x0 + (p[0] - x0) * g, ly = y0 + (p[1] - y0) * g, at = [lx, ly, LINE];
            if (S.inNet) { ev.push({ type: 'goal', t: tt, at: at }); decide('goal', ev, tt, at); }
            else {
              ev.push({ type: 'out', t: tt, at: at.slice() });
              decide(S.touched.keeper ? 'saved' : S.wood ? S.wood : ly >= GM.Y ? 'over' : 'wide', ev, tt, at);
            }
          }
        }
        function sub(dt, cols, tau, ev, tt) {
          var x0 = S.p[0], y0 = S.p[1], z0 = S.p[2];
          integrate(S, dt, S.inNet ? PL : null);
          spin(S, dt);
          ground(S, ev, tt);
          frame(ev, tt);
          if (cols.length && keeper(cols, tau, ev, tt)) return true;
          crossings(x0, y0, z0, ev, tt);
          netOutside(ev, tt);
          netInside(dt, ev, tt);
          if (S.roll) {
            var sp = sqrt(S.v[0] * S.v[0] + S.v[1] * S.v[1] + S.v[2] * S.v[2]);
            // (still, on the turf; a ball lying against the net may press it a little, NET_REST deep at most)
            if (sp < C.REST_V && (!S.net.on || S.net.depth < C.NET_REST)) {
              S.v[0] = S.v[1] = S.v[2] = 0; S.w[0] = S.w[1] = S.w[2] = 0; S.phase = 'rest';
              ev.push({ type: 'rest', t: tt, at: S.p.slice() });
              return true;
            }
          }
          return false;
        }
        function classify(ev, tt) {
          if (S.outcome) return;
          if (S.held) { decide('saved', ev, tt); return; }
          var away = S.v[2] > C.AWAY_VZ && S.p[2] > GZ + C.AWAY_Z, rest = S.phase === 'rest', late = S.tLaunch != null && tt - S.tLaunch >= C.TIMEOUT - 1e-9;
          // (fix-i4, review-i3 D10: a ball that dies short of the line outside the posts went wide, not short)
          if (away || rest || late) decide(S.touched.keeper ? 'saved' : S.wood ? S.wood : S.sideNet || (S.p[2] > GZ && abs(S.p[0]) >= GM.X) ? 'wide' : 'miss', ev, tt);
        }
        function record() {
          if (TR.length < TRMAX) TR.push(S.p[0], S.p[1], S.p[2]);
          if (S.hashDone) return;
          for (var k = 0; k < 3; k++) S.h = fnv(S.h, Math.round(S.p[k] * 1e6) | 0);
          if (S.outcome) S.hashDone = true;
        }
        function step(h) {
          h = h > 0 ? h : C.H;
          var ev = [];
          S.p0[0] = S.p[0]; S.p0[1] = S.p[1]; S.p0[2] = S.p[2];
          S.q0[0] = S.q[0]; S.q0[1] = S.q[1]; S.q0[2] = S.q[2]; S.q0[3] = S.q[3];
          if (S.phase === 'idle') { S.t += h; return ev; }
          if (S.phase === 'rest') { S.t += h; classify(ev, S.t); if (!S.hashDone) record(); return ev; }
          var cols = colliders ? (colliders(S.t) || []) : [], t0 = S.t;
          S.steps++;
          if (S.phase === 'held') {
            if (!follow(cols)) S.phase = 'flight';
            S.t = t0 + h; classify(ev, S.t); record();
            return ev;
          }
          var n = near(cols, h) ? C.SUB : 1, dt = h / n;
          for (var i = 0; i < n; i++) {
            var tt = t0 + (i + 1) * dt;
            if (sub(dt, cols, (i + 1) * dt, ev, tt)) {
              if (S.held) S.phase = 'held';
              break;
            }
          }
          S.t = t0 + h;
          if (S.phase !== 'rest' && S.phase !== 'held') S.phase = S.inNet ? 'net' : 'flight';
          classify(ev, S.t);
          record();
          return ev;
        }
        function launch(L) {
          L = L || {};
          var t0 = L.t != null && isFinite(+L.t) ? +L.t : S.t;
          S = fresh(t0);
          if (L.p) S.p = L.p.slice();
          S.p0 = S.p.slice();
          S.v = (L.v || [0, 0, 0]).slice(); S.w = (L.w || [0, 0, 0]).slice();
          S.phase = 'flight'; S.tLaunch = t0; S.roll = false;
          TR = []; TR.push(S.p[0], S.p[1], S.p[2]);
          return api;
        }
        function state() {
          var N = S.net;
          return {
            t: S.t, phase: S.phase, p: S.p.slice(), v: S.v.slice(), w: S.w.slice(), q: S.q.slice(), p0: S.p0.slice(), q0: S.q0.slice(),
            ground: S.roll, inNet: S.inNet, tLaunch: S.tLaunch,
            net: { on: N.on, at: N.at.slice(), n: N.n.slice(), depth: N.depth, tRel: N.tRel, plane: N.plane, peak: N.peak, speed: N.speed, outside: N.outside },
            touched: { keeper: S.touched.keeper, post: S.touched.post, bar: S.touched.bar },
            cross: S.cross ? S.cross.slice() : null, held: S.held ? clone(S.held) : null, outcome: S.outcome ? clone(S.outcome) : null,
          };
        }
        // solve the launch direction that crosses the goal plane at the target: Newton on (yaw, pitch) with a finite-
        // difference Jacobian and Broyden updates, a halved step whenever a step would miss by more (a slow lob is
        // strongly non-linear), 8 iterations at most; every evaluation is one flight of the sim's own integrator
        function solve(s) {
          s = s || {};
          var from = s.from || C.spot, tx = +s.target[0] || 0, ty = max(0.12, +s.target[1] || 0), sp = +s.speed || C.SPEED, w = s.spin || [0, 0, 0];
          var dx = tx - from[0], dz = GZ - from[2], dy = ty - from[1], dist = sqrt(dx * dx + dz * dz), T = dist / sp;
          var y0 = atan2(dx, -dz), p0 = atan2(dy + 0.5 * C.G * T * T, dist), evals = 0;
          function F(yaw, pitch) { evals++; var d = dirOf(yaw, pitch); return fly(from, [d[0] * sp, d[1] * sp, d[2] * sp], w, GZ, 3); }
          var cur = F(y0, p0), k = 0;
          for (k = 0; !cur && k < 6; k++) { p0 += 3 * DEG; cur = F(y0, p0); }
          // (a slow lob's drag-free first guess lands short and bounces: lift it until the flight is clean, as long as
          // the target is above the turf's reach; a bounce is a discontinuity Newton cannot cross)
          for (k = 0; cur && cur.bounced && ty > 0.3 && k < 15; k++) { var c2 = F(y0, p0 + 2 * DEG); if (!c2) break; p0 += 2 * DEG; cur = c2; }
          if (!cur) return { dir: dirOf(y0, p0), yaw: y0, pitch: p0, miss: Infinity, t: null, at: null, iters: 0, evals: evals };
          var yaw = y0, pitch = p0, rx = tx - cur.x, ry = ty - cur.y, miss = sqrt(rx * rx + ry * ry), h = 1e-3;
          var fa = F(yaw + h, pitch), fb = F(yaw, pitch + h);
          var J = [fa ? (fa.x - cur.x) / h : dist, fb ? (fb.x - cur.x) / h : 0, fa ? (fa.y - cur.y) / h : 0, fb ? (fb.y - cur.y) / h : dist];
          var i;
          for (i = 0; i < 8 && miss >= 1e-4; i++) {
            var det = J[0] * J[3] - J[1] * J[2];
            var sy = abs(det) > 1e-9 ? (J[3] * rx - J[1] * ry) / det : atan(rx / dist), spt = abs(det) > 1e-9 ? (-J[2] * rx + J[0] * ry) / det : atan(ry / dist);
            var lam = 1, nx = null, ny = 0, np = 0;
            for (var hh = 0; hh < 5; hh++) {
              ny = yaw + lam * sy; np = pitch + lam * spt; nx = F(ny, np);
              if (nx && !(nx.bounced && !cur.bounced)) { var mx = tx - nx.x, my = ty - nx.y; if (sqrt(mx * mx + my * my) < miss) break; }
              lam *= 0.5; nx = null;
            }
            if (!nx) break;
            // Broyden: J += ((df - J dp) dp^T) / |dp|^2
            var dpy = ny - yaw, dpp = np - pitch, dfx = nx.x - cur.x, dfy = nx.y - cur.y, dd = dpy * dpy + dpp * dpp;
            if (dd > 1e-18) {
              var ex = dfx - (J[0] * dpy + J[1] * dpp), ey = dfy - (J[2] * dpy + J[3] * dpp);
              J[0] += ex * dpy / dd; J[1] += ex * dpp / dd; J[2] += ey * dpy / dd; J[3] += ey * dpp / dd;
            }
            yaw = ny; pitch = np; cur = nx; rx = tx - cur.x; ry = ty - cur.y; miss = sqrt(rx * rx + ry * ry);
          }
          return { dir: dirOf(yaw, pitch), yaw: yaw, pitch: pitch, miss: miss, t: cur.t, at: [cur.x, cur.y], iters: i, evals: evals };
        }
        // a whole kick: the solve at the cone's speed, then the cone's deviation; returns launch() arguments
        function aim(a) {
          a = a || {};
          var k = a.cone || { dYaw: 0, dPitch: 0, speedK: 1 }, from = a.from || C.spot;
          var sp = (+a.speed || C.SPEED) * (k.speedK || 1), w = a.spin || spinFor(a.target, from);
          var s = solve({ from: from, target: a.target, speed: sp, spin: w }), dir = dirOf(s.yaw + (k.dYaw || 0), s.pitch + (k.dPitch || 0));
          return { p: from.slice(), v: [dir[0] * sp, dir[1] * sp, dir[2] * sp], w: w.slice(), t: a.t, dir: dir, speed: sp, solve: s };
        }
        // headless: step until the outcome (and, with rest: true, until the ball is still), or max seconds
        function run(r) {
          r = r || {};
          var max = r.max || 6, h = r.h || C.H, ev = [], t0 = S.t;
          while (S.t - t0 < max) {
            var e = step(h); for (var i = 0; i < e.length; i++) ev.push(e[i]);
            if (S.outcome && (!r.rest || S.phase === 'rest' || S.phase === 'held')) break;
          }
          return ev;
        }
        var api = {
          C: C, geom: GM,
          solve: solve, cone: function (c, r) { return cone(c, r || cr); }, aim: aim, launch: launch, step: step, run: run, state: state,
          snapshot: function () { return { S: clone(S), r: cr.save(), tr: TR.slice() }; },
          restore: function (s) { S = clone(s.S); cr.load(s.r); TR = s.tr.slice(); return api; },
          trace: function () { return Float32Array.from(TR); },
          hash: function () { return hex(S.h); },
          contacts: function () { return clone(S.contacts); },
          colliders: function (fn) { colliders = typeof fn === 'function' ? fn : null; return api; },
          reset: function (r) { S = fresh(r && r.t != null ? r.t : 0); TR = []; if (r && r.seed != null) cr = stream(r.seed >>> 0, 0xC3); return api; },
          inVolume: function (x, y, z, slack) { return inVolume(GM, x, y, z, slack); },
          time: function () { return S.t; },
        };
        return api;
      }

      return { C: C, rng: rng, stream: stream, mix: mix, hash32: fnv, hex: hex, geom: geom, cone: cone, spinFor: spinFor, dirOf: dirOf, create: create };
    })();
