    /* ================================================== Grand Prix: the car, the clock and the log (sim) == */
    // ARTIFICIAL1 M1, lane S. PURE: no THREE, no DOM, no clock, no Math.random; only Math and the ES built-ins. Pasted
    // into boot() by gp.js at /*@include gp-sim.js*/, and loaded by Node with vm.runInNewContext(src + ';GpSim', {}),
    // so it declares ONE top-level binding. It never reaches another gp module: the track table (T), the driver and
    // the rules come in as arguments.
    //
    // The car: the WHY. V-07, one make for all twenty. A point mass with yaw on the track table, 120 Hz, deterministic:
    //  - grip that grows with speed (downforce): lateral lat0 * ge + latK * v^2 + g sin(bank help), braking
    //    brk0 * ge + brkK * v^2, traction trac * ge, power pm / v, where ge = (g + v^2 kv) / g is the load factor that
    //    falls over a crest (floored at 0.2). This is the design lap model's envelope (build5k.cjs GP), shared with the
    //    AI's speed profile through latMax / brakeMax / driveMax / dragAcc, so the profile never asks for more than the
    //    car has. A friction ellipse trades lateral against longitudinal grip.
    //  - drag kd v^2 (329 km/h flat out), kdFlap with the Flap open (about 338-340), both cut by the slipstream:
    //    drag x (1 - draftCut * draft), draft = e^(-gap / draftLen) over the gap to the car ahead, lined up.
    //  - eight gears (ASSUMED ratios: the speed at the redline in each), a 28 ms upshift cut (70 % of the drive kept: a
    //    seamless-shift box; the cut is the sound's), downshift blips at least 0.16 s apart, the limiter, a clutch-slip
    //    launch; automatic or manual (over-revving refused).
    //  - steering: the road wheels follow the input at a finite rate, with a lock that narrows with speed; the yaw
    //    rate follows the wheels with a short lag and is capped by the grip (understeer); wheelspin out of a slow
    //    corner kicks the tail out (a slide, which the tyres then pull back).
    //  - contact is cosmetic: cars bump and rub (a chain of three circles each), walls push back and scrub; scuffs and
    //    counts are kept; nothing ever stops a car for good or ends its race (the rules recover a stuck car).
    //  - the driver aid control() (the AI, the autopilot, the assists) and the player's assists (braking, steering,
    //    counter-steer); the devices' mapping mapInput(). Tests and measurements: scripts/.scratch/gp/m1/sim/.
    //  M2 (lane A): the launch control's band on the grid and the jump start's creep (X29); assists that never feel like
    //  rails (X21: a capped pull toward the player's own lane, lane memory, let go when overruled, touch g-steering, what the
    //  assists added on the car); contact from behind costs the car behind (X24); a car that has taken the flag never
    //  touches one still racing (X27); a lock-up the AI asks for (X09); the slipstream felt from 0.8 s back (X14).
    // Frame (INTERFACES 2.1): metres, x east, z south, y up; heading h clockwise from north (-z): forward
    // (sin h, -cos h), right (cos h, sin h). d is plan metres along the lap; lat is metres right of the centre line.
    var GpSim = (function () {
      var PI = Math.PI, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt, exp = Math.exp;
      var sin = Math.sin, cos = Math.cos, tan = Math.tan, atan = Math.atan, atan2 = Math.atan2, floor = Math.floor, round = Math.round;
      var REV = 2 * PI;

      /* -------------------------------------------------------------------------------------- the car -- */
      // INTERFACES 2.3 defaults, plus lane S's own tuning (each one explained; S.md keeps the record).
      var CAR = {
        g: 9.81, mass: 800, vtop: 94.44,                                  // 340 km/h (the AI profile's cap)
        lat0: 22, latK: 0.0035, brk0: 25, brkK: 0.0025, trac: 13, pm: 937,   // m/s2, 1/m, W/kg (build5k.cjs GP)
        kd: 0.00122, kdFlap: 0.00111, draftCut: 0.35, draftLen: 32,          // drag 1/m; slipstream (M2, lane A: draftLen 25 -> 32, the
                                                                         // tow felt from 0.8 s back: X14's 0.15-0.25 s on the Breakwater)
        length: 5.574, width: 2.0, height: 0.983, wheelbase: 3.6, front: 1.8, rear: -1.8, nose: 3.188, tail: -2.386,
        trackF: 1.644, trackR: 1.544, tyreR: 0.3608,
        gears: [102, 136, 166, 196, 226, 258, 296, 372],                  // km/h at the redline in each gear: ASSUMED (8th: a tow and
                                                                        // the Flap together stay under the limiter; fix 15 Oct)
        idle: 4000, redline: 12500, shiftUp: 11900, shiftCut: 0.028, blipMin: 0.16,
        steerMax: 0.45,                                                   // road-wheel rad at walking pace
        circles: [[2.2, 1.0], [0.4, 1.0], [-1.4, 1.0]],                   // contact chain: [x along the car, radius]
        // lane S:
        cutDrive: 0.7,      // the share of drive kept through the 28 ms upshift cut (a seamless-shift box; the cut is the sound)
        down: 0.8,          // auto downshift when the lower gear would turn at 80% of its redline (the lap model's trace)
        launch: 9500,       // clutch-slip launch rpm at full throttle (PLAN 5b: about 9-10k)
        band: 7000,         // full power from here to the redline; 55% at idle, linear between
        engBrake: 1.0,      // m/s2 of engine braking off the throttle at the redline (scaled by rpm)
        steerRate: 2.5,     // road-wheel rad/s: how fast the wheels follow the input
        lock: 1.2,          // full lock asks 1.2 x the curvature the grip allows at this speed (speed-sensitive lock)
        yawTau: 0.05,       // s: the yaw rate's lag behind the wheels
        spin: 0.6,          // rad/s of extra yaw per unit of wheelspin (power oversteer)
        slideMax: 0.3,      // rad: wheelspin stops swinging the tail out past this slide angle
        scrub: 0.15,        // understeer: the front tyres scrub this share of the lateral grip as drag
        draftW: [0.8, 2.4], // m across: full tow when lined up within 0.8 m, none beyond 2.4 m
        draftV: [25, 45],   // m/s: no tow below 25, full from 45
        wallE: 0.1, wallMu: 0.35, hitE: 0.25, hitMu: 0.1, hitYaw: 0.04,
        // (fix, 15 Oct) a barrier costs speed: an impact takes wallHit x its speed into the wall off the speed along it,
        // and a car scraping a barrier slows at wallScrape m/s2 (a wall is never a guide rail); auto upshifts wait when the
        // pace-1 profile falls under the car's speed within holdUp s (no up-blip right before a braking point)
        wallHit: 0.45, wallScrape: 14, holdUp: 0.6,
        // (M2, lane A) a lock-up the driver asked for (car.ai.lk: an AI's visible mistake): the locked tyres brake at lockBrake
        // of their grip and hold lockLat of it sideways (the car runs wide, the smoke is the sim's lock). Contact from behind
        // (X24, ramming never pays): the car behind takes rearEnd of the impulse's change, the car ahead the rest, and the car
        // behind scrubs rearScrub of the closing speed besides
        lockBrake: 0.85, lockLat: 0.6, rearEnd: 0.7, rearScrub: 0.6
      };
      // over: full brake at 8 % over the profile; look: metres of profile read ahead; k: the steering pull toward the
      // line; dec: the share of the braking capacity the braking assist plans with; ease: the throttle eases from 3 %
      // under; slide: counter-steer from this slip angle (rad); ahead, margin: the pull grows to 1 when the heading would
      // put the car within `margin` m of the road's edge (past the kerb) in `ahead` s
      // tc: with the braking assist, traction control: the throttle asks for at most this share of the drive the friction
      // ellipse leaves beside the cornering (fix, 15 Oct: a naive full-throttle player spun the rear out of every slow corner)
      // (M2, lane A, X21: assists that never feel like rails) pull: the steering pull is at most this share of full lock;
      // fade: it fades from this share of the stick to none at full stick; light: and while the car is light (load under
      // this, none at half of it); adopt: s of steering against the pull before it adopts your offset from the line (lane
      // memory; a car alongside adopts it at once; held against it, it lets go); counter: counter-steer on a slide, at most
      // this share of the lock; g: on touch the stick asks for lateral acceleration, full stick this share of the grip
      // (g-steering); vFull: the steering pull comes in with speed, all of it from this m/s; opp: an assist under this
      // share of the lock is not counted as pushing against the stick
      var ASSIST = { over: 1.08, look: 120, k: 0.35, dec: 0.9, ease: 0.03, slide: 0.04, ahead: 0.5, margin: 1.5, tc: 0.97,
        pull: 0.3, fade: 0.6, light: 0.6, adopt: 0.25, counter: 0.4, g: 0.95, vFull: 15, opp: 0.02, pathW: 2.4, gapMin: 7, edgePull: 0.5 };
      var MAX_STEPS = 16, H = 1 / 120;

      /* ------------------------------------------------------------------------------------ helpers -- */
      function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
      function angDiff(a, b) { var d = (a - b) % REV; if (d > PI) d -= REV; else if (d <= -PI) d += REV; return d; }
      function sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }
      // the load factor: 1 on the flat, below 1 over a crest (kv < 0), never below 0.2
      function loadOf(P, v, kv) { return max(0.2, (P.g + v * v * (kv || 0)) / P.g); }
      // lateral grip, m/s2; help: the bank angle (rad), signed + when it helps this turn
      function latMax(P, v, kv, help) { return P.lat0 * loadOf(P, v, kv) + P.latK * v * v + P.g * sin(help || 0); }
      function brakeMax(P, v, kv) { return P.brk0 * loadOf(P, v, kv) + P.brkK * v * v; }
      function driveMax(P, v, kv) { return min(P.trac * loadOf(P, v, kv), P.pm / max(5, v)); }
      function dragAcc(P, v, open, draft) { return (open ? P.kdFlap : P.kd) * v * v * (1 - P.draftCut * (draft || 0)); }
      // road 1, kerb 0.95, verge and run-off 0.85, at or past the barrier 0.7
      function gripScale(surf) { return surf === 1 ? 0.95 : surf === 2 ? 0.85 : surf >= 3 ? 0.7 : 1; }
      // full lock (road-wheel rad) at speed v: walking pace steerMax, then whatever asks `lock` x the grip
      function steerLock(P, v) { var vv = max(1, v * v); return min(P.steerMax, atan(P.wheelbase * P.lock * latMax(P, v, 0, 0) / vv)); }
      // the share of full power at this rpm
      function band(P, rpm) { return rpm >= P.band ? 1 : 0.55 + 0.45 * clamp((rpm - P.idle) / max(1, P.band - P.idle), 0, 1); }

      /* -------------------------------------------------------------------------------------- input -- */
      function newInput() { return { steer: 0, throttle: 0, brake: 0, up: false, down: false, flap: false, manual: false, abrake: false, asteer: false, analog: false, touch: false, auto: false }; }
      function copyInput(a, b) {
        b.steer = a.steer; b.throttle = a.throttle; b.brake = a.brake; b.up = !!a.up; b.down = !!a.down; b.flap = !!a.flap;
        b.manual = !!a.manual; b.abrake = !!a.abrake; b.asteer = !!a.asteer; b.analog = !!a.analog; b.touch = !!a.touch; b.auto = !!a.auto;
        return b;
      }
      // one Uint32 a step (INTERFACES 2.4): bits 0-6 steer, 7-10 throttle, 11-14 brake, 15 up, 16 down, 17 flap,
      // 18 manual, 19 abrake, 20 asteer, 21 analog, 22 touch, 31 auto (the AI drives; the other bits are ignored)
      function encode(I) {
        if (I.auto) return 0x80000000;
        var s = round(clamp(+I.steer || 0, -1, 1) * 63) + 63, t = round(clamp(+I.throttle || 0, 0, 1) * 15), b = round(clamp(+I.brake || 0, 0, 1) * 15);
        return (s | (t << 7) | (b << 11) | (I.up ? 1 << 15 : 0) | (I.down ? 1 << 16 : 0) | (I.flap ? 1 << 17 : 0) | (I.manual ? 1 << 18 : 0) |
          (I.abrake ? 1 << 19 : 0) | (I.asteer ? 1 << 20 : 0) | (I.analog ? 1 << 21 : 0) | (I.touch ? 1 << 22 : 0)) >>> 0;
      }
      function decode(u, out) {
        out = out || newInput(); u = u >>> 0;
        out.auto = (u & 0x80000000) !== 0;
        if (out.auto) { out.steer = 0; out.throttle = 0; out.brake = 0; out.up = out.down = out.flap = out.manual = out.abrake = out.asteer = out.analog = out.touch = false; return out; }
        out.steer = ((u & 127) - 63) / 63; out.throttle = ((u >>> 7) & 15) / 15; out.brake = ((u >>> 11) & 15) / 15;
        out.up = !!(u & (1 << 15)); out.down = !!(u & (1 << 16)); out.flap = !!(u & (1 << 17)); out.manual = !!(u & (1 << 18));
        out.abrake = !!(u & (1 << 19)); out.asteer = !!(u & (1 << 20)); out.analog = !!(u & (1 << 21)); out.touch = !!(u & (1 << 22));
        return out;
      }
      // The devices, mapped to an Input (pure; gp.js reads the keys, the pad and the touch kit and calls this every
      // frame). The kart's controls: keys steer with a ramp (3/s out, 5/s back), a pad's stick with a deadzone of 0.12
      // and the kart's 1.5 curve, the touch stick with 0.08 and x1.15; touch has an automatic throttle (1 unless BRAKE).
      // raw = { left, right, up, down (keys), pad: { x, thr, brk } | null, touch: { x, brake, hold } | null, last: 'key'|'pad'|'touch',
      //         flap, gearUp, gearDown (EDGES this frame), manual, assists: { brake, steer }, auto }
      // st = { steer } the key ramp's state, kept by the caller. Returns out (an Input).
      function mapInput(raw, st, dt, out) {
        out = out || newInput(); st = st || { steer: 0 };
        var k = (raw.right ? 1 : 0) - (raw.left ? 1 : 0), c = +st.steer || 0, steer, analog = false;
        if (k !== 0 && (c === 0 || sgn(c) === k)) c = c + clamp(k - c, -3 * dt, 3 * dt);
        else c = c > 0 ? max(0, c - 5 * dt) : min(0, c + 5 * dt);
        st.steer = c; steer = c;
        var pad = raw.pad, tch = raw.touch, last = raw.last || 'key';
        if (pad && pad.x) { var ax = +pad.x || 0; ax = abs(ax) < 0.12 ? 0 : sgn(ax) * Math.pow((abs(ax) - 0.12) / 0.88, 1.5); if (ax) { steer = ax; analog = true; } }
        if (tch && last === 'touch') { var tx = +tch.x || 0; tx = abs(tx) < 0.08 ? 0 : sgn(tx) * (abs(tx) - 0.08) / 0.92; steer = clamp(tx * 1.15, -1, 1); analog = true; }
        var isTouch = last === 'touch' && !!tch;
        out.steer = clamp(steer, -1, 1);
        // (touch: automatic, unless BRAKE is held or the page holds it for the getaway, tch.hold: a tap after lights out)
        out.throttle = max(raw.up ? 1 : 0, pad ? clamp(+pad.thr || 0, 0, 1) : 0, isTouch && !tch.brake && !tch.hold ? 1 : 0);
        out.brake = max(raw.down ? 1 : 0, pad ? clamp(+pad.brk || 0, 0, 1) : 0, isTouch && tch.brake ? 1 : 0);
        out.up = !!raw.gearUp; out.down = !!raw.gearDown; out.flap = !!raw.flap; out.manual = !!raw.manual;
        out.abrake = !!(raw.assists && raw.assists.brake); out.asteer = !!(raw.assists && raw.assists.steer);
        out.analog = analog; out.touch = isTouch; out.auto = !!raw.auto;
        return out;
      }

      /* ---------------------------------------------------------------------------------- the seeds -- */
      // mulberry32 (the state kept as a uint32) and a cached Box-Muller pair; three streams mixed from the seed and a
      // tag (race 0x52, ai 0x41, sim 0x53), the shootout's method
      function fnv(h, x) { for (var k = 0; k < 4; k++) { h ^= (x >>> (k * 8)) & 255; h = Math.imul(h, 16777619); } return h >>> 0; }
      function mix(a, b) { var h = fnv(fnv(0x811C9DC5, a | 0), b | 0); h ^= h >>> 16; h = Math.imul(h, 0x45D9F3B); h ^= h >>> 16; return h >>> 0; }
      function stream(seed, tag) {
        var s = mix(seed >>> 0, tag >>> 0), spare = 0, has = false;
        function next() {
          s = (s + 0x6D2B79F5) >>> 0;
          var x = s;
          x = Math.imul(x ^ (x >>> 15), x | 1);
          x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        }
        function gauss() {
          if (has) { has = false; return spare; }
          var u = next(), v = next(); if (u < 1e-12) u = 1e-12;
          var m = sqrt(-2 * Math.log(u)), a = REV * v; spare = m * sin(a); has = true; return m * cos(a);
        }
        return { next: next, gauss: gauss, get: function () { return [s, spare, has]; }, set: function (a) { s = a[0] >>> 0; spare = +a[1]; has = !!a[2]; } };
      }

      /* ------------------------------------------------------------- plain copies (for snapshots) -- */
      function copy(o) {
        if (o === null || typeof o !== 'object') return o;
        if (ArrayBuffer.isView(o)) return o.slice();
        if (Array.isArray(o)) { var a = new Array(o.length); for (var i = 0; i < o.length; i++) a[i] = copy(o[i]); return a; }
        var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = k === 'spec' ? o[k] : copy(o[k]);
        return r;
      }

      /* --------------------------------------------------------------- the driver aid: control() -- */
      // Pure pursuit to T.posAt(car.d + look, want.lat) and a speed controller to want.v (+ want.a, a feed-forward
      // acceleration, optional). want = { lat, v, look, a }; look defaults to max(6, 0.45 v) m. Deterministic. Used by
      // the AI, the autopilot and both assists. P: the car's parameters (S.P), CAR if left out.
      var CP = { x: 0, y: 0, z: 0 }, CO = {};
      // over: the most of the grip the steering asks for; ease: the speed that makes the curve at this share of the
      // grip when it is asked for more; kv: 1/s, how hard the speed error is chased (4 = 1 / 0.25 s: a target read 0.25 s
      // ahead, as the AI reads its profile, then acts as the exact feed-forward of the profile's own acceleration)
      // trac: the share of the traction the ellipse leaves that the throttle uses
      // lat: on the power or the brakes, the least share of the grip the steering keeps; res: the grip the throttle's
      // ellipse is measured against (1: the grip itself; above 1 spun the wheels and lost time, measured)
      // room: metres of road and kerb left on the outside under which the speed eases
      var CTRL = { over: 1.02, ease: 0.97, kv: 4, trac: 0.98, res: 1, lat: 0.95, room: 1.5 };
      function control(car, T, want, Hs, out, P) {
        P = P || CAR; out = out || newInput();
        var v = car.v, look = want.look != null ? want.look : max(6, 0.45 * v);
        T.posAt(car.d + look, +want.lat || 0, 0, CP);
        var dx = CP.x - car.x, dz = CP.z - car.z, sh = sin(car.h), ch = cos(car.h);
        var fw = dx * sh - dz * ch, rt = dx * ch + dz * sh, d2 = fw * fw + rt * rt;
        var kap = d2 > 1e-6 ? 2 * rt / d2 : 0;
        if (fw < 0.5) kap = sgn(rt) * 1;                 // the point is behind or beside: full lock toward it
        T.pose(car.d, CO);
        // A driver never asks the tyres for more than they have. The lateral budget: on the power, what leaves the
        // traction the speed wants (never under CTRL.lat of the grip: the car runs a few decimetres wide rather than
        // sitting on the limit with no drive); off it, the grip (a touch over, CTRL.over, to keep pushing). Past the
        // budget the steering is held at it (more lock only scrubs); the speed comes down only when the car is running
        // out of road on the outside (CTRL.room metres of road and kerb left).
        var vt = want.v != null ? +want.v : v, grip = latMax(P, v, CO.kv, kap > 0 ? -(CO.bank || 0) : CO.bank || 0) * gripScale(car.surf);
        var aReq = (+want.a || 0) + (vt - v) * CTRL.kv;
        var open = !!(car.flap && car.flap.open), resist = dragAcc(P, v, open, car.draft) + P.g * (CO.g || 0);
        var need = aReq + resist, gs = gripScale(car.surf), ge = loadOf(P, v, CO.kv), uMax = CTRL.over;
        var ebk = P.engBrake * (car.rpm || 0) / P.redline, BXc = max(1, brakeMax(P, v, CO.kv) * gs);
        var lon = need > 0 ? need / max(0.5, P.trac * ge * gs * CTRL.trac) : max(0, -need - ebk) / BXc;   // share of the ellipse wanted along
        if (lon > 0.02) uMax = max(CTRL.lat, sqrt(1 - min(1, lon) * min(1, lon)));
        if (v > 3 && abs(kap) * v * v > grip * uMax) {
          var kpp = abs(kap), room = (CO.hw || 7) + (T.kerb != null ? T.kerb : 0.8) - (kap > 0 ? -car.lat : car.lat);
          kap = sgn(kap) * grip * uMax / (v * v);
          if (room < CTRL.room) {
            vt = min(vt, sqrt(grip * CTRL.ease / kpp));
            aReq = (+want.a || 0) + (vt - v) * CTRL.kv; need = aReq + resist;
            if (need < 0) { lon = max(0, -need - ebk) / BXc; kap = sgn(kap) * min(abs(kap), grip * max(CTRL.lat, sqrt(1 - min(1, lon) * min(1, lon))) / (v * v)); }
          }
        }
        out.steer = clamp(atan(kap * P.wheelbase) / steerLock(P, v), -1, 1);
        // the pedals that give it on this road, inside the friction ellipse (what the cornering leaves: a driver's
        // foot never spins the wheels or locks them mid-corner)
        var ayNow = v * v * max(abs(kap), abs(tan(car.steerAngle || 0)) / P.wheelbase), u = min(1, ayNow / max(0.5, grip * CTRL.res));
        var fc = sqrt(max(0, 1 - u * u));
        if (need >= 0) {
          var TX = P.trac * ge * gs, full = max(0.5, min(TX, P.pm * band(P, car.rpm || P.redline) / max(5, v)));
          out.throttle = clamp(min(need, TX * fc * CTRL.trac) / full, 0, 1); out.brake = 0;
        } else {
          out.throttle = 0; out.brake = clamp(min((-need - ebk) / BXc, fc), 0, 1);
        }
        out.up = out.down = false; out.manual = false; out.analog = true; out.touch = false; out.auto = true;
        return out;
      }

      /* ---------------------------------------------------------------------------------- assists -- */
      // Applies only the bits that are on (the rules tag the run aids 'on' from those bits, never 'assisted': D3, 15 Oct).
      // Every assist only trims what the player is doing, and the player can always overrule it (X21, the-race 9):
      //  - braking: the speed this car may carry now so that every point of the next ASSIST.look metres is reached at
      //    no more than the profile, braking at ASSIST.dec of the car's capacity. From ASSIST.ease under it the
      //    throttle eases off; over it the throttle is cut and the brake comes in, fully at ASSIST.over (8 %) over. The
      //    player's own brake wins when it is harder. It also plans to the speed of the car ahead in the player's path (within
      //    ASSIST.pathW m across), ASSIST.gapMin m behind it: it never drives the player into a car. With it, traction control
      //    and the launch control after a release.
      //  - steering: a pull toward the player's lane (the racing line plus the offset the player holds), at most
      //    ASSIST.pull of the lock, fading past ASSIST.fade of the stick and while the car is light; steer against it for
      //    ASSIST.adopt s, or have a car alongside, and it adopts the offset (lane memory). Counter-steer on a slide, at
      //    most ASSIST.counter of the lock. Never a rail: with the stick centred the car cannot make a slow corner.
      //  - touch's g-steering (with the steering aid): the stick asks for lateral acceleration, full stick ASSIST.g of the
      //    grip, which the sim turns into a wheel angle (the-race 10); the braking plan then reads the corners that much slower.
      //    Pro is the stick as it is (no help at all).
      // What the assists added is on the car (car.aid, this step: the HUD's amber share) and summed for the lap (car.as).
      // aid = { lat: Float32Array(T.n), v: Float32Array(T.n), ceil? }: the line and the pace-1 profile (and its ceiling), per sample.
      var AO = newInput(), AP = {}, AQ = {};
      function aidAt(arr, T, d) { var u = T.wrap(d) / T.ds, i = floor(u), f = u - i, n = T.n; i = i % n; return arr[i] + (arr[(i + 1) % n] - arr[i]) * f; }
      // the touch stick as lateral acceleration: s of ASSIST.g x the grip here, as a share of the lock at this speed
      function gsteer(car, s, T, P) {
        var v = max(1, car.v); T.pose(car.d, AQ);
        var grip = latMax(P, v, AQ.kv || 0, 0) * gripScale(car.surf) * ASSIST.g, ang = atan(clamp(+s || 0, -1, 1) * grip / (v * v) * P.wheelbase);
        return clamp(ang / steerLock(P, v), -1, 1);
      }
      function aidState(car) { var a = car.as; if (!a || a.off == null) a = car.as = { off: 0, ag: 0, la: 0, ls: 0, lb: 0, lba: 0, op: 0 }; return a; }
      function assist(car, inp, T, aid, out, P, cars) {
        P = P || CAR; out = copyInput(inp, out || newInput());
        var gst = !!(inp.touch && inp.asteer);
        if (gst) out.steer = gsteer(car, inp.steer, T, P);
        var stick = out.steer, a = aidState(car), ad = car.aid || (car.aid = { brake: 0, steer: 0, throttle: 0 });
        ad.brake = 0; ad.steer = 0; ad.throttle = 0;
        if (!aid || car.held) return out;
        var v = car.v;
        if (inp.abrake && aid.v) {
          // (the plan reads the ceiling, the corners' and braking curves' limit, when the race gives it: a straight's top
          // speed is no limit, so a tow or the Flap is never braked away)
          var n = T.n, ds = T.ds, steps = Math.ceil(ASSIST.look / ds), i0 = T.idx(car.d), req = 1e9, AV = aid.ceil || aid.v;
          for (var s = 0; s <= steps; s += 2) {
            // (with g-steering the stick reaches ASSIST.g of the grip, so the plan is that much slower through corners)
            var vp = AV[(i0 + s) % n] * (gst ? sqrt(ASSIST.g) : 1), dist = s * ds;
            var q = vp * vp + 2 * ASSIST.dec * (brakeMax(P, vp, 0) + dragAcc(P, vp, false, 0)) * dist;
            if (q < req) req = q;
          }
          // (and the car ahead in the player's path: the brake assist never drives the player into it. The plan to its speed
          // over the gap less ASSIST.gapMin, at the same share of the brakes)
          if (cars) for (var q = 0; q < cars.length; q++) {
            var o = cars[q]; if (o === car || o.fin !== car.fin) continue;
            var gq = T.rel(o.d, car.d); if (gq <= 0 || gq > 90 || abs(o.lat - car.lat) > ASSIST.pathW) continue;
            // (when that car is braking, as if it might brake as hard as a car can: a safe following speed; else to its speed)
            var bq = ASSIST.dec * brakeMax(P, v, 0), qq = o.v * o.v * ((+o.ax || 0) < -3 ? bq / max(1, brakeMax(P, o.v, 0)) : 1) + 2 * bq * max(0, gq - ASSIST.gapMin);
            if (qq < req) req = qq;
          }
          req = sqrt(req);
          var ratio = v / max(1, req);
          if (ratio > 1) { out.throttle = 0; out.brake = max(inp.brake, clamp((ratio - 1) / (ASSIST.over - 1), 0, 1)); }
          else if (ratio > 1 - ASSIST.ease) out.throttle = min(inp.throttle, (1 - ratio) / ASSIST.ease);
          // launch control (X29): after a release on the lights, the throttle held open for car.lc s (BRAKE cancels it)
          if (car.lc > 0) { if ((+inp.brake || 0) >= 0.5) car.lc = 0; else if (!(out.brake > 0.001)) out.throttle = 1; }
        }
        if (inp.asteer && aid.lat) {
          var look = max(6, 0.45 * v), here = aidAt(aid.lat, T, car.d), myOff = car.lat - here;
          // (the lane starts where the car stands on the grid; a car alongside: the lane is where the player is, so the
          // pull never leads into it)
          if (car.held || v < 2 || (car.ahead >= 0 && car.gapAheadM < 6.6) || (car.behind >= 0 && car.gapBehindM < 6.6)) { a.off = myOff; a.ag = 0; }
          var hwL = max(0.2, T.hwAt(car.d + look) - P.width * 0.5 - 0.1);
          AP.lat = clamp(aidAt(aid.lat, T, car.d + look) + a.off, -hwL, hwL); AP.v = v; AP.look = look; AP.a = 0;
          control(car, T, AP, H, AO, P);
          var wantS = AO.steer - stick;
          var fs = clamp((abs(stick) - ASSIST.fade) / (1 - ASSIST.fade), 0, 1), ld = car.load == null ? 1 : car.load, fl = clamp((ld - ASSIST.light * 0.5) / (ASSIST.light * 0.5), 0, 1);
          // (and it comes in with speed: none at a standstill, all of it from ASSIST.vFull m/s)
          var fv = clamp(v / ASSIST.vFull, 0, 1);
          // counter-steer on a slide (the wheels toward where the car is going), at most ASSIST.counter of the lock; while the car
          // slides, the lane's pull gives way to it
          var beta = atan2(car.vlat, max(1, v)), w = clamp((abs(beta) - ASSIST.slide) / 0.1, 0, 1), cs = 0;
          // (the edge guard: when the heading would put the car past the kerb within ASSIST.ahead s, the pull may grow to
          // ASSIST.edgePull of the lock, toward the road; still never enough to take a slow corner by itself)
          var psiA = angDiff(car.h, T.headingAt(car.d)), latA = car.lat + v * ASSIST.ahead * sin(psiA), edgeA = T.hwAt(car.d) + (T.kerb != null ? T.kerb : 0.8) - P.width * 0.5;
          var eg = clamp((abs(latA) - (edgeA - ASSIST.margin)) / ASSIST.margin, 0, 1) * (latA * wantS < 0 ? 1 : 0);
          var cap = ASSIST.pull + (ASSIST.edgePull - ASSIST.pull) * eg, kk = ASSIST.k + (1 - ASSIST.k) * eg;
          var pull = clamp(kk * wantS, -cap, cap) * (1 - fs * (1 - eg)) * fl * fv * (1 - w);
          if (w > 0) cs = clamp(w * (clamp(beta / steerLock(P, v), -1, 1) - (stick + pull)), -ASSIST.counter, ASSIST.counter);
          // overruled: the stick held against the assist for ASSIST.adopt s, the assist lets go and the player's offset is the
          // lane (lane memory); it stays let go while the stick stays against it
          var add = pull + cs;
          if (abs(stick) > 0.05 && stick * add < 0 && abs(add) > ASSIST.opp) { a.ag += H; if (a.ag >= ASSIST.adopt - 1e-9) { a.off = myOff; add = 0; } } else a.ag = 0;
          out.steer = clamp(stick + add, -1, 1);
        }
        // traction control (with the braking assist): the drive the throttle asks for never passes what the friction
        // ellipse leaves beside the cornering the wheels will do this step (physics() below, the same sums: the wheels'
        // next angle, the grip on this surface, crest and bank), so the rear never spins and the tail never kicks out.
        // (an upper bound on the drive: full power at this speed, whatever the rpm and the shift cut)
        if (inp.abrake && out.throttle > 0 && !(out.brake > 0.001) && v > 0.5) {
          T.pose(car.d, AQ);
          var lk = steerLock(P, v), rate = P.steerRate * H, sa = car.steerAngle || 0;
          sa += clamp(clamp(+out.steer || 0, -1, 1) * lk - sa, -rate, rate);
          var kc = tan(sa) / P.wheelbase, kv = AQ.kv || 0, bank = AQ.bank || 0, gs = gripScale(car.surf);
          var AY = max(0.5, latMax(P, v, kv, kc > 0 ? -bank : kc < 0 ? bank : 0) * gs), TX = max(0.5, P.trac * loadOf(P, v, kv) * gs);
          var ayA = min(abs(v * v * kc), AY), rem = TX * sqrt(max(0, 1 - (ayA / AY) * (ayA / AY))), full = min(TX, P.pm / max(5, v));
          out.throttle = min(out.throttle, clamp(ASSIST.tc * rem / max(1e-6, full), 0, 1));
        }
        // what the assists added this step, and the lap's sums (steering: the assist's share of the steering; braking: the
        // share of the brake the assist added). The opposite-sign streak (op) is the "never against you for long" check
        ad.steer = out.steer - stick; ad.brake = max(0, out.brake - (+inp.brake || 0)); ad.throttle = out.throttle - (+inp.throttle || 0);
        if (v > 5 && !car.fin) {
          a.la += abs(ad.steer); a.ls += abs(stick); a.lb += out.brake; a.lba += ad.brake;
          a.op = abs(stick) > 0.05 && stick * ad.steer < 0 && abs(ad.steer) > ASSIST.opp ? a.op + H : 0;
        }
        return out;
      }

      /* ------------------------------------------------------------------------------- the clock -- */
      // cfg = { seed, specs: CarSpec[N] (grid order), human: index | -1, car: CAR (or a tuned copy), grid: [{ d, lat }],
      //         aid: { lat, v } | null, driver: (S) => ({ drive(S, H) }) | null, rules: (S) => ({ pre(S, H), post(S, H) }) | null }
      // With no rules the cars are released at once (phase 'race', go): the solo tests.
      function create(T, cfg) {
        cfg = cfg || {};
        var P = cfg.car || CAR, specs = cfg.specs && cfg.specs.length ? cfg.specs : [{}], N = specs.length, L = T.L;
        var S = {
          T: T, cfg: cfg, P: P, H: H, N: N, cars: [], human: cfg.human == null ? -1 : cfg.human | 0, seed: (cfg.seed >>> 0) || 0,
          t: 0, steps: 0, go: false, phase: 'grid', race: {}, assisted: false, aided: false,
          rng: { race: stream(cfg.seed >>> 0, 0x52), ai: stream(cfg.seed >>> 0, 0x41), sim: stream(cfg.seed >>> 0, 0x53) },
          events: [], byD: new Int16Array(N), log: new Uint32Array(4096), logN: 0, replaying: false, acc: 0,
          pend: newInput(), marks: [], pairT: new Float64Array(N * N)
        };
        if (S.human >= N) S.human = -1;
        for (var k = 0; k < N; k++) {
          var gs = cfg.grid && cfg.grid[k] ? cfg.grid[k] : { d: T.wrap(-8 * (k + 1)), lat: k % 2 ? 3.5 : -3.5 };
          S.cars.push(makeCar(S, k, specs[k], gs));
        }
        for (k = 0; k < N; k++) S.byD[k] = k;
        if (!cfg.rules) { S.phase = 'race'; S.go = true; for (k = 0; k < N; k++) S.cars[k].held = false; }
        var driver = cfg.driver ? cfg.driver(S) : null, rules = cfg.rules ? cfg.rules(S) : null;
        sortByD(S); neighbours(S);

        var PO = {}, PR = { i: 0, d: 0, lat: 0, dist: 0 }, PS = { x: 0, y: 0, z: 0 }, EFF = newInput(), YAW = 1 - exp(-H / P.yawTau);

        function push(ev) { ev.t = S.t; S.events.push(ev); if (S.events.length > 8192) S.events.splice(0, 4096); }

        /* the gearbox and the engine: auto (the driver's own upshift point) or manual (edges; over-revs refused) */
        function gearbox(c, I) {
          var G = P.gears, kmh = c.v * 3.6, from = c.gear;
          c.shift = 0; c.pop = false;
          if (c.cut > 0) c.cut = max(0, c.cut - H);
          if (c.gear === 0) { if (!c.held && S.go) c.gear = 1; }
          else if (I.manual && S.human === c.n && !c.auto) {
            if (I.up && c.gear < 8) c.gear++;
            else if (I.down && c.gear > 1 && kmh <= G[c.gear - 2] && S.t - c.shiftT >= P.blipMin) c.gear--;
          } else {
            // (the shift point: the driver's own this lap when its persona sets one, car.ai.up (X15: the short-shift, the
            // limiter), else the spec's)
            var up = c.ai && c.ai.up > 0 ? +c.ai.up : c.spec && c.spec.shift && c.spec.shift.up ? +c.spec.shift.up : P.shiftUp / P.redline;
            if (c.gear < 8 && kmh > G[c.gear - 1] * up && c.cut <= 0 && !brakesAhead(c)) c.gear++;
            else if (c.gear > 1 && kmh < G[c.gear - 2] * P.down && S.t - c.shiftT >= P.blipMin) c.gear--;
          }
          if (c.gear !== from && from > 0) {
            c.shift = c.gear > from ? 1 : -1; c.shiftT = S.t;
            if (c.shift > 0) c.cut = P.shiftCut; else c.pop = true;     // a cut on the way up, a blip (and a pop) down
            push({ e: 'shift', car: c.n, from: from, to: c.gear, blip: c.shift < 0 ? (c.spec && c.spec.shift && c.spec.shift.blip != null ? +c.spec.shift.blip : 1) : 0 });
          }
          var thr = I.throttle;
          if (c.gear === 0 || c.held) {                                    // free revs on the grid
            var want = P.idle + clamp(thr, 0, 1) * (P.launch * 1.05 - P.idle);
            // (armed, BRAKE held on the grid: the launch control holds the launch band, X29; the throttle still revs over it)
            if ((+I.brake || 0) >= 0.5 && c.gear === 0) want = max(want, P.launch);
            c.rpm += (want - c.rpm) * (1 - exp(-H / 0.12)); c.limiter = false;
          } else {
            var rpm = P.redline * kmh / G[c.gear - 1];
            if (c.gear === 1) rpm = max(rpm, P.idle + clamp(thr, 0, 1) * (P.launch - P.idle));   // the clutch slips off the line
            c.limiter = rpm >= P.redline;
            c.rpm = clamp(rpm, P.idle, P.redline);
          }
          if (c.thr >= 0.5 && thr < 0.05 && c.rpm > 9000) c.pop = true;    // an overrun pop off the throttle
        }

        // the brakes are coming: the pace-1 profile falls under this car's speed less than holdUp s ahead (an auto upshift
        // waits for the braking point, so no up-then-down pair is wasted on it)
        function brakesAhead(c) {
          var av = cfg.aid && cfg.aid.v; if (!av || !(P.holdUp > 0)) return false;
          var n = T.n, i0 = T.idx(c.d), m = Math.ceil(c.v * P.holdUp / T.ds);
          for (var s = 0; s <= m; s += 4) if (av[(i0 + s) % n] < c.v - 2) return true;
          return false;
        }

        /* forces and integration for one car */
        function physics(c) {
          var I = c.eff, v = c.v;
          T.pose(c.d, PO);
          var kv = PO.kv || 0, grade = PO.g || 0, bank = PO.bank || 0, gsc = gripScale(c.surf);
          gearbox(c, I);
          c.thr = clamp(+I.throttle || 0, 0, 1); c.brk = clamp(+I.brake || 0, 0, 1);
          if (c.held) {
            // (a jump start in Pro: the clutch slips and the car creeps forward at car.creep m/s until lights out)
            if (c.creep > 0) { c.v = c.creep; c.x += sin(c.h) * c.creep * H; c.z -= cos(c.h) * c.creep * H; } else c.v = 0;
            c.vlat = 0; c.r = 0; c.ax = 0; c.ay = 0; c.slip = 0; c.lock = 0; return;
          }
          // the wheels follow the input at steerRate; the lock narrows with speed
          var tgt = clamp(+I.steer || 0, -1, 1) * steerLock(P, v), rate = P.steerRate * H;
          c.steerAngle += clamp(tgt - c.steerAngle, -rate, rate);
          var kc = tan(c.steerAngle) / P.wheelbase;
          var ge = loadOf(P, v, kv), help = kc > 0 ? -bank : kc < 0 ? bank : 0;
          var AY = max(0.5, latMax(P, v, kv, help) * gsc), BX = max(0.5, brakeMax(P, v, kv) * gsc), TX = max(0.5, P.trac * ge * gsc);
          // (a lock-up the AI driver asked for, car.ai.lk: less grip both ways, the smoke)
          var lkd = c.brk > 0.5 && !!(c.ai && c.ai.lk > 0);
          if (lkd) AY = max(0.5, AY * P.lockLat);
          var pw = c.gear > 0 && !c.limiter ? P.pm * band(P, c.rpm) / max(5, v) * (c.cut > 0 ? P.cutDrive : 1) : 0;
          var ayD = v * v * kc, ay, ax, X, spin = 0, lock = 0;
          if (c.brk > 0.001) {
            var bD = c.brk * BX, e = (bD / BX) * (bD / BX) + (ayD / AY) * (ayD / AY);
            ay = ayD;
            if (e > 1) { var sc = 1 / sqrt(e); bD *= sc; ay = ayD * sc; lock = clamp((sqrt(e) - 1) * 2, 0, 1) * c.brk; }
            if (lkd) { bD *= P.lockBrake; lock = 1; }
            ax = -bD; X = BX;
          } else {
            var dD = c.thr * min(TX, pw), ayA = min(abs(ayD), AY);
            ay = sgn(ayD) * ayA;
            var rem = TX * sqrt(max(0, 1 - (ayA / AY) * (ayA / AY)));
            ax = min(dD, rem); X = TX;
            if (dD > rem) spin = (dD - rem) / TX;
          }
          var under = abs(ayD) > abs(ay) + 1e-9 ? abs(ayD) / max(1e-6, abs(ay)) - 1 : 0;
          // the yaw rate: what the tyres can hold, plus a wheelspin kick (power oversteer), after a short lag
          var rt = v > 0.5 ? ay / v : v * kc;
          // (the kick swings the tail further out of the slide it is in (the nose further from the velocity), or the way the
          // car is turning when it is not sliding; never the way the wheels point: counter-steer under power holds the slide,
          // it does not throw the car the other way; fix 15 Oct)
          var bt = atan2(c.vlat, max(1, v));
          if (spin > 0 && abs(bt) < P.slideMax) rt += (abs(bt) > 0.005 ? -sgn(bt) : c.r !== 0 ? sgn(c.r) : sgn(kc)) * spin * P.spin;
          c.r += (rt - c.r) * YAW;
          var h0 = c.h; c.h += c.r * H;
          // along: the tyres, drag (Flap, tow), engine braking off the throttle, the grade, understeer scrub
          var eb = c.thr < 0.05 && c.gear > 0 ? P.engBrake * c.rpm / P.redline : 0;
          var along = ax - dragAcc(P, v, c.flap.open, c.draft) - eb - P.g * grade - P.scrub * min(1, under) * AY;
          // across: whatever is left of the ellipse pulls the velocity back onto the heading (a slide decays)
          var AYx = AY * sqrt(max(0, 1 - (ax / X) * (ax / X))), vl = c.vlat;
          var aLat = clamp(v * c.r - vl / H, -max(AYx, abs(ay)), max(AYx, abs(ay)));
          var vN = v + (along + vl * c.r) * H, vlN = vl + (aLat - v * c.r) * H;
          if (vN < 0) vN = 0;
          var hm = h0 + c.r * H * 0.5, sh = sin(hm), ch = cos(hm), cg = 1 / sqrt(1 + grade * grade);
          var vm = (v + vN) * 0.5, vlm = (vl + vlN) * 0.5;
          c.x += (vm * sh * cg + vlm * ch) * H;
          c.z += (-vm * ch * cg + vlm * sh) * H;
          c.v = vN; c.vlat = vlN;
          c.ax = (vN - v) / H; c.ay = v * c.r; c.load = ge;
          var beta = abs(atan2(vlN, max(1, vN)));
          c.slip = max(min(1, under), min(1, beta / 0.15), min(1, spin * 2), lock);
          c.lock = lock;
          c.wheelAngle = (c.wheelAngle + v / P.tyreR * H) % REV;
        }

        /* the tow: from the last step's road order, the best of the three cars ahead within 120 m */
        function drafts() {
          var A = S.cars, BY = S.byD;
          for (var p = 0; p < N; p++) {
            var c = A[BY[p]], best = 0;
            if (N > 1 && !c.held) {
              var ramp = clamp((c.v - P.draftV[0]) / (P.draftV[1] - P.draftV[0]), 0, 1);
              for (var q = 1; q <= 3 && q < N && ramp > 0; q++) {
                var o = A[BY[(p + q) % N]], gap = T.wrap(o.d - c.d);
                if (gap > 120) break;
                if (!!o.fin !== !!c.fin) continue;
                var lat = abs(o.lat - c.lat), lf = clamp(1 - (lat - P.draftW[0]) / (P.draftW[1] - P.draftW[0]), 0, 1);
                var f = exp(-max(0, gap - P.length) / P.draftLen) * lf * ramp;
                if (f > best) best = f;
              }
            }
            c.draft = best;
          }
        }

        /* car against car: three circles each; pairs in index order; impulses with restitution and a little rub */
        var CA = [0, 0, 0, 0, 0, 0], CB = [0, 0, 0, 0, 0, 0];
        function circles(c, out) { var sh = sin(c.h), ch = cos(c.h), C = P.circles; for (var k = 0; k < 3; k++) { out[2 * k] = c.x + sh * C[k][0]; out[2 * k + 1] = c.z - ch * C[k][0]; } }
        function contacts() {
          var A = S.cars, C = P.circles;
          for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) {
            var p = A[a], q = A[b];
            if (abs(p.x - q.x) > 7.5 || abs(p.z - q.z) > 7.5 || (p.held && q.held)) continue;
            // (X27: a car that has taken the flag drives off non-colliding: it never touches a car still racing)
            if (!!p.fin !== !!q.fin) continue;
            circles(p, CA); circles(q, CB);
            var best = 0, bi = 0, bj = 0, nx = 0, nz = 0;
            for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
              var dx = CB[2 * j] - CA[2 * i], dz = CB[2 * j + 1] - CA[2 * i + 1], dd = sqrt(dx * dx + dz * dz), pen = C[i][1] + C[j][1] - dd;
              if (pen > best) { best = pen; bi = i; bj = j; if (dd > 1e-6) { nx = dx / dd; nz = dz / dd; } else { nx = cos(p.h); nz = sin(p.h); } }
            }
            if (best <= 0) continue;
            // push apart (half each; a held car does not move). From behind (X24, ramming never pays): the two lined up and
            // the push along them, the car behind takes P.rearEnd of the change and the car ahead the rest
            var wp = p.held ? 0 : q.held ? 1 : 0.5, rear = 0;
            if (!p.held && !q.held && abs(angDiff(p.h, q.h)) < 0.6) {
              var fpx = sin(p.h), fpz = -cos(p.h), al = nx * fpx + nz * fpz;
              if (abs(al) > 0.75) { wp = al > 0 ? P.rearEnd : 1 - P.rearEnd; rear = al > 0 ? 1 : -1; }   // (n points from p to q: q ahead of p, p hit it from behind)
            }
            var wq = 1 - wp;
            p.x -= nx * best * wp; p.z -= nz * best * wp; q.x += nx * best * wq; q.z += nz * best * wq;
            // the velocities in the world
            var sp = sin(p.h), cp = cos(p.h), sq = sin(q.h), cq = cos(q.h);
            var pvx = p.v * sp + p.vlat * cp, pvz = -p.v * cp + p.vlat * sp, qvx = q.v * sq + q.vlat * cq, qvz = -q.v * cq + q.vlat * sq;
            var vn = (qvx - pvx) * nx + (qvz - pvz) * nz;
            if (vn >= 0) continue;
            var jn = -(1 + P.hitE) * vn * 0.5, tx = -nz, tz = nx, vt = (qvx - pvx) * tx + (qvz - pvz) * tz, jt = clamp(-vt * 0.5, -P.hitMu * jn, P.hitMu * jn);
            // (ix, iz) pushes q, -(ix, iz) pushes p; the yaw kick is the lever (the circle's offset along the car)
            // crossed with the push, in plan (x toward z is clockwise from above: the sense h grows in)
            var ix = (jn * nx + jt * tx) * 2, iz = (jn * nz + jt * tz) * 2;
            if (!p.held) { pvx -= ix * wp; pvz -= iz * wp; p.v = max(0, pvx * sp - pvz * cp); p.vlat = pvx * cp + pvz * sp; p.r -= P.hitYaw * C[bi][0] * (sp * iz + cp * ix) * wp; }
            if (!q.held) { qvx += ix * wq; qvz += iz * wq; q.v = max(0, qvx * sq - qvz * cq); q.vlat = qvx * cq + qvz * sq; q.r += P.hitYaw * C[bj][0] * (sq * iz + cq * ix) * wq; }
            // (and the car that hit from behind scrubs P.rearScrub of the closing speed besides: its nose and wing take it)
            if (rear > 0 && !p.held) p.v = max(0, p.v - P.rearScrub * -vn); else if (rear < 0 && !q.held) q.v = max(0, q.v - P.rearScrub * -vn);
            var dv = -vn, key = a * N + b;
            if (dv >= 1 && S.pairT[key] <= S.t) {
              S.pairT[key] = S.t + 0.5;
              p.contacts++; q.contacts++; p.scuff = min(1, p.scuff + min(0.15, dv * 0.01)); q.scuff = min(1, q.scuff + min(0.15, dv * 0.01));
              push({ e: 'contact', a: a, b: b, dv: dv });
            }
          }
        }

        /* onto the table: d and lat, then the barriers (with the impact's response) */
        function settle(c) {
          T.project(c.x, c.z, c.i, PR);
          c.i = PR.i; c.d = PR.d; c.lat = PR.lat;
          T.pose(c.d, PO);
          var hd = PO.h, rx = cos(hd), rz = sin(hd), psi = angDiff(c.h, hd), sp = sin(psi), cp = abs(cos(psi));
          var nose = P.nose * sp, tail = P.tail * sp, half = P.width * 0.5 * cp;
          var extR = max(nose, tail) + half, extL = min(nose, tail) - half, side = 0, pen = 0;
          if (c.lat + extR > PO.wr) { side = 1; pen = c.lat + extR - PO.wr; }
          else if (c.lat + extL < -PO.wl) { side = -1; pen = -PO.wl - (c.lat + extL); }
          c.wall = 0;
          if (side) {
            c.x -= rx * pen * side; c.z -= rz * pen * side; c.lat -= pen * side;
            var sh = sin(c.h), ch = cos(c.h), vx = c.v * sh + c.vlat * ch, vz = -c.v * ch + c.vlat * sh;
            var vn = (vx * rx + vz * rz) * side;                            // into the wall, m/s
            if (vn > 0) {
              var tx = rz, tz = -rx, vt = vx * tx + vz * tz, loss = min(abs(vt), (P.wallMu * (1 + P.wallE) + (P.wallHit || 0)) * vn);
              vx -= rx * side * vn * (1 + P.wallE); vz -= rz * side * vn * (1 + P.wallE);
              vx -= tx * sgn(vt) * loss; vz -= tz * sgn(vt) * loss;
              c.v = max(0, vx * sh - vz * ch); c.vlat = vx * ch + vz * sh;
              // (and scraping along it: the barrier's friction while the car is pressed into it, full from 2 m/s into the face;
              // a car resting against the barrier is not held there)
              if (P.wallScrape > 0 && c.v > 0) { var k0 = max(0, 1 - P.wallScrape * min(1, vn / 2) * H / max(0.5, c.v)); c.v *= k0; c.vlat *= k0; }
              if (psi * side > 0) c.h -= psi * 0.3;                          // a glancing blow turns the car along the wall
              c.r *= 0.5;
              if (vn >= 1 && c.wallT <= S.t) { c.wallT = S.t + 0.3; push({ e: 'wall', car: c.n, side: side > 0 ? 'R' : 'L', dv: vn }); c.scuff = min(1, c.scuff + min(0.1, vn * 0.006)); }
            }
            c.wall = clamp(0.2 + max(0, vn) / 10, 0, 1);
            clampWalls(c);                       // (the turn along the wall swings the nose or the tail: out again)
          }
        }
        // position only: the car's corners back inside both barrier faces at its d
        function clampWalls(c) {
          T.pose(c.d, PO);
          var hd = PO.h, rx = cos(hd), rz = sin(hd), psi = angDiff(c.h, hd), sp = sin(psi), half = P.width * 0.5 * abs(cos(psi));
          var eR = c.lat + max(P.nose * sp, P.tail * sp) + half - PO.wr, eL = -PO.wl - (c.lat + min(P.nose * sp, P.tail * sp) - half);
          if (eR > 0) { c.x -= rx * eR; c.z -= rz * eR; c.lat -= eR; }
          else if (eL > 0) { c.x += rx * eL; c.z += rz * eL; c.lat += eL; }
        }
        // position only, after the barriers: two cars still inside each other are parted, a car against a barrier
        // staying where it is (so a car is never pushed through one); the cars moved are put back on the table
        var MOVED = new Uint8Array(N);
        function separate() {
          var A = S.cars, C = P.circles;
          for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) {
            var p = A[a], q = A[b];
            if (abs(p.x - q.x) > 7.5 || abs(p.z - q.z) > 7.5 || !!p.fin !== !!q.fin) continue;
            circles(p, CA); circles(q, CB);
            var best = 0, nx = 0, nz = 0;
            for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
              var dx = CB[2 * j] - CA[2 * i], dz = CB[2 * j + 1] - CA[2 * i + 1], dd = sqrt(dx * dx + dz * dz), pen = C[i][1] + C[j][1] - dd;
              if (pen > best && dd > 1e-6) { best = pen; nx = dx / dd; nz = dz / dd; }
            }
            if (best <= 0.02) continue;
            var fp = p.held || p.wall > 0, fq = q.held || q.wall > 0, wp = fp && !fq ? 0 : fq && !fp ? 1 : 0.5;
            p.x -= nx * best * wp; p.z -= nz * best * wp; q.x += nx * best * (1 - wp); q.z += nz * best * (1 - wp);
            MOVED[a] = 1; MOVED[b] = 1;
          }
        }
        /* the rest from where the car ended: the surface, y, pitch and roll, prog */
        function finish(c) {
          if (MOVED[c.n]) { MOVED[c.n] = 0; T.project(c.x, c.z, c.i, PR); c.i = PR.i; c.d = PR.d; c.lat = PR.lat; clampWalls(c); }
          T.pose(c.d, PO);
          var psi = angDiff(c.h, PO.h);
          c.surf = T.surfaceAt(c.d, c.lat);
          T.posAt(c.d, c.lat, 0, PS); c.y = PS.y;
          // pitch (nose up) and roll (right side up): the road's, plus the body's, capped at the V-07's clearances
          var bp = clamp(c.ax * 0.00015, -0.006, 0.012), br = clamp(c.ay * 0.0006, -0.02, 0.02), f = 1 - exp(-H / 0.08);
          c.bodyPitch += (bp - c.bodyPitch) * f; c.bodyRoll += (br - c.bodyRoll) * f;
          c.pitch = atan(PO.g || 0) + c.bodyPitch; c.roll = (PO.bank || 0) * cos(psi) + c.bodyRoll;
          c.prog += T.rel(c.d, c.dPrev); c.dPrev = c.d;
        }

        /* the clock: INTERFACES 2.5's step order */
        S.step = function () {
          var A = S.cars, n, c;
          // 1. the human's input: live, quantised and logged; in a replay, read back from the log
          if (S.human >= 0) {
            c = A[S.human];
            var code;
            if (S.replaying) code = S.steps < S.logN ? S.log[S.steps] >>> 0 : 0x80000000;
            else {
              code = encode(S.pend);
              if (S.logN >= S.log.length) { var nl = new Uint32Array(S.log.length * 2); nl.set(S.log); S.log = nl; }
              S.log[S.steps] = code; S.logN = S.steps + 1;
              S.pend.up = S.pend.down = S.pend.flap = false;                 // latched edges are consumed here
            }
            decode(code, c.inp); c.auto = c.inp.auto;
            // (the autopilot is an assisted run; the driving aids are an aided one, which counts: D3, 15 Oct. The AI's hands
            // on the car once it is home are neither)
            if (!c.fin) { if (c.auto) S.assisted = true; else if (c.inp.abrake || c.inp.asteer) S.aided = true; }
          }
          if (S.replaying) for (n = 0; n < S.marks.length; n++) if (S.marks[n][0] === S.steps) applyMark(S.marks[n]);   // (live: applied when made)
          for (n = 0; n < N; n++) { c = A[n]; c.px = c.x; c.pz = c.z; c.py = c.y; c.ph = c.h; if (n !== S.human) c.auto = true; }
          // 2. the AI (and the autopilot)
          if (driver) driver.drive(S, H);
          // 3. the rules: lights, held, the Flap opening and closing
          if (rules) rules.pre(S, H);
          // 4. physics, each car in index order, then the field
          for (n = 0; n < N; n++) {
            c = A[n];
            if (n === S.human && !c.auto && (c.inp.abrake || c.inp.asteer)) assist(c, c.inp, T, cfg.aid, EFF, P, A);
            else {
              copyInput(c.inp, EFF);
              if (c.aid) { c.aid.brake = 0; c.aid.steer = 0; c.aid.throttle = 0; }
            }
            if (c.lc > 0) c.lc = max(0, c.lc - H);
            copyInput(EFF, c.eff);
            physics(c);
          }
          drafts();
          contacts();
          for (n = 0; n < N; n++) settle(A[n]);
          separate();
          for (n = 0; n < N; n++) finish(A[n]);
          sortByD(S); neighbours(S);
          // 5. the rules: gates, laps, places, limits, finishes, recoveries
          if (rules) rules.post(S, H);
          S.t += H; S.steps++;
        };
        // a frame's worth of time: whole steps, at most MAX_STEPS (a slow frame plays slower, never skips)
        S.advance = function (dt) {
          S.acc += dt; var m = 0;
          while (S.acc >= H && m < MAX_STEPS) { S.step(); S.acc -= H; m++; }
          if (m === MAX_STEPS && S.acc > H) S.acc = H * 0.999;
          return S.acc / H;
        };
        // the human's command: levels kept, the edges (up, down, flap) OR-latched until the next step consumes them
        S.setInput = function (inp) {
          var e = S.pend, up = e.up || !!inp.up, dn = e.down || !!inp.down, fl = e.flap || !!inp.flap;
          copyInput(inp, e); e.up = up; e.down = dn; e.flap = fl;
        };
        // a fingerprint: every car's x, z, v, h, prog, lap and finish to 6 places, and the step (two FNV-1a, 16 hex)
        S.hash = function () {
          var h1 = 2166136261, h2 = 0x9747B28C;
          function eat(st) { for (var k = 0; k < st.length; k++) { var ch = st.charCodeAt(k); h1 ^= ch; h1 = Math.imul(h1, 16777619); h2 ^= ch; h2 = Math.imul(h2, 16777619) ^ (h2 >>> 13); } }
          for (var n = 0; n < N; n++) { var q = A0(n); eat(q.x.toFixed(6)); eat(q.z.toFixed(6)); eat(q.v.toFixed(6)); eat(q.h.toFixed(6)); eat(q.prog.toFixed(6)); eat(String(q.lap | 0)); eat((q.fin ? +q.finT : -1).toFixed(6)); }
          eat(String(S.steps));
          return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
        };
        function A0(n) { return S.cars[n]; }
        // the same race again from its seed, the log and the marks, in a sim of its own (fresh driver and rules)
        S.replay = function () {
          var S2 = create(T, cfg);
          S2.log = S.log.slice(0, max(S.logN, 1)); S2.logN = S.logN; S2.marks = copy(S.marks); S2.replaying = true;
          while (S2.steps < S.steps) { S2.step(); S2.events.length = 0; }
          S2.replaying = false;
          // (a mark made after the last step ran was applied live at once; in the replay it would wait for a step that
          // has not run yet, so it is applied here, at the same step, through the replay's own mark)
          var tail = S2.marks.filter(function (m) { return m[0] === S2.steps; });
          if (tail.length) { S2.marks = S2.marks.filter(function (m) { return m[0] !== S2.steps; }); tail.forEach(function (m) { S2.mark(m[1], m[2]); }); }
          return S2;
        };
        // every live field as plain data, and back
        S.snapshot = function () {
          return { t: S.t, steps: S.steps, go: S.go, phase: S.phase, race: copy(S.race), assisted: S.assisted, aided: S.aided, cars: copy(S.cars),
            rng: { race: S.rng.race.get(), ai: S.rng.ai.get(), sim: S.rng.sim.get() }, byD: S.byD.slice(), logN: S.logN,
            pend: copy(S.pend), marks: S.marks.length, acc: S.acc, pairT: S.pairT.slice() };
        };
        S.restore = function (s) {
          S.t = s.t; S.steps = s.steps; S.go = s.go; S.phase = s.phase; S.race = copy(s.race); S.assisted = s.assisted; S.aided = !!s.aided; S.cars = copy(s.cars);
          S.rng.race.set(s.rng.race); S.rng.ai.set(s.rng.ai); S.rng.sim.set(s.rng.sim); S.byD = s.byD.slice(); S.logN = s.logN;
          S.pend = copy(s.pend); S.marks.length = min(S.marks.length, s.marks); S.acc = s.acc; S.pairT = s.pairT.slice();
          S.events.length = 0;
        };
        S.drain = function () { var e = S.events; S.events = []; return e; };
        // edits from outside the race (debug): applied now and logged, so a replay applies them at the same step
        S.mark = function (kind, a) { var m = [S.steps, kind, copy(a)]; S.marks.push(m); applyMark(m); };
        function applyMark(m) {
          var a = m[2], c = S.cars[a.n | 0];
          if (!c) return;
          if (m[1] === 'place') putOn(c, a.d != null ? +a.d : c.d, a.lat != null ? +a.lat : c.lat, a.v != null ? +a.v : c.v);
          else if (m[1] === 'speed') { c.v = max(0, +a.v || 0); c.vlat = 0; }
        }
        // a car put on the road at (d, lat), pointing along it at v (the rules' recovery uses it inside a step)
        function putOn(c, d, lat, v) {
          var dOld = c.d;
          T.posAt(d, lat, 0, PS); c.x = PS.x; c.z = PS.z; c.y = PS.y;
          T.pose(d, PO); c.h = c.h + angDiff(PO.h, c.h);
          c.v = max(0, v); c.vlat = 0; c.r = 0; c.steerAngle = 0;
          T.project(c.x, c.z, -1, PR); c.i = PR.i; c.d = PR.d; c.lat = PR.lat; c.surf = T.surfaceAt(c.d, c.lat);
          c.prog += T.rel(c.d, dOld); c.dPrev = c.d;
          c.px = c.x; c.pz = c.z; c.py = c.y; c.ph = c.h;
        }
        S.putOn = function (n, d, lat, v) { putOn(S.cars[n], d, lat, v); };
        return S;
      }

      // one live car (INTERFACES 2.3): plain data only, so it can be snapshotted
      function makeCar(S, k, spec, gs) {
        var T = S.T, PR = { i: 0, d: 0, lat: 0, dist: 0 }, PS = { x: 0, y: 0, z: 0 }, PO = {};
        T.posAt(gs.d, gs.lat || 0, 0, PS); T.pose(gs.d, PO);
        var c = {
          n: k, spec: spec || {}, human: k === S.human, auto: k !== S.human,
          x: PS.x, z: PS.z, y: PS.y, px: PS.x, pz: PS.z, py: PS.y, h: PO.h, ph: PO.h, pitch: 0, roll: 0, bodyPitch: 0, bodyRoll: 0,
          v: 0, vlat: 0, r: 0, i: 0, d: 0, lat: 0, prog: 0, dPrev: 0,
          gear: 0, rpm: S.P.idle, thr: 0, brk: 0, steerAngle: 0, wheelAngle: 0, shift: 0, cut: 0, limiter: false, pop: false, shiftT: -1,
          ax: 0, ay: 0, load: 1, surf: 0, wall: 0, wallT: 0, slip: 0, lock: 0, draft: 0,
          ahead: -1, gapAheadM: 0, gapAheadS: 0, behind: -1, gapBehindM: 0, gapBehindS: 0,
          scuff: 0, contacts: 0, held: true, flap: { armed: false, open: false, zone: -1 },
          lap: 0, gate: 0, missed: false, lapT0: 0, last: 0, best: 0, sectors: [0, 0, 0], deleted: false,
          strikes: 0, penalty: 0, place: k + 1, fin: false, finT: 0, raceT: 0, stuck: 0, off: 0, recovers: 0,
          inp: newInput(), eff: newInput(), ai: {}, intent: '',
          // (M2, lane A) the jump start's creep and the launch control's timer (written by the rules), what the assists added
          // (this step, and the lap's sums: the sim's), the last pass on this car (the rules'), the agent's mind (the AI's)
          creep: 0, lc: 0, aid: { brake: 0, steer: 0, throttle: 0 }, as: { off: 0, ag: 0, la: 0, ls: 0, lb: 0, lba: 0, op: 0 }, lastPass: null, mind: null
        };
        T.project(c.x, c.z, -1, PR); c.i = PR.i; c.d = PR.d; c.lat = PR.lat; c.dPrev = c.d; c.prog = T.rel(c.d, 0);
        c.surf = T.surfaceAt(c.d, c.lat);
        return c;
      }

      // road order (any lap): car indices sorted by d, ties by index (insertion sort: the order barely changes a step)
      function sortByD(S) {
        var B = S.byD, A = S.cars, N = S.N, i, j, x;
        for (i = 1; i < N; i++) {
          x = B[i]; j = i - 1;
          while (j >= 0 && (A[B[j]].d > A[x].d || (A[B[j]].d === A[x].d && B[j] > x))) { B[j + 1] = B[j]; j--; }
          B[j + 1] = x;
        }
      }
      // the road neighbours within 300 m (any lap); gaps in metres and in seconds (m / max(v, 10) of the car behind)
      function neighbours(S) {
        var B = S.byD, A = S.cars, N = S.N, T = S.T;
        for (var p = 0; p < N; p++) {
          var c = A[B[p]];
          c.ahead = -1; c.behind = -1; c.gapAheadM = 0; c.gapAheadS = 0; c.gapBehindM = 0; c.gapBehindS = 0;
          if (N < 2) continue;
          var a = A[B[(p + 1) % N]], b = A[B[(p - 1 + N) % N]], ga = T.wrap(a.d - c.d), gb = T.wrap(c.d - b.d);
          if (ga <= 300) { c.ahead = a.n; c.gapAheadM = ga; c.gapAheadS = ga / max(c.v, 10); }
          if (gb <= 300) { c.behind = b.n; c.gapBehindM = gb; c.gapBehindS = gb / max(b.v, 10); }
        }
      }

      return {
        CAR: CAR, ASSIST: ASSIST, CTRL: CTRL, MAX_STEPS: MAX_STEPS, H: H,
        create: create, latMax: latMax, brakeMax: brakeMax, driveMax: driveMax, dragAcc: dragAcc, gripScale: gripScale, loadOf: loadOf,
        steerLock: steerLock, band: band, control: control, assist: assist,
        encode: encode, decode: decode, newInput: newInput, copyInput: copyInput, mapInput: mapInput,
        stream: stream, mix: mix, angDiff: angDiff, copy: copy
      };
    })();
