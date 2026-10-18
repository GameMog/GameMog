    /* ========================================================= Grand Prix: the TV director (ARTIFICIAL1 M2, lane B) == */
    // gp-director.js. Pasted into boot() by gp.js at /*@include gp-director.js*/. ONE top-level binding, GpDirector;
    // every other name lives inside it, so nothing of v1's boot() is shadowed. VIEW: the page only through env (three.js
    // as env.three or env['THREE']), so the file also loads in Node with vm.runInNewContext(src + ';GpDirector', {}).
    //
    // The TV shots (EXPERIENCE.md 6.1, lane B): the demo's (X11), the intro's (X28 H1, X07 G0, X12 W1, X03 G1), the
    // glide into the player's hands (X05), and after the player's flag the flag shot, THE MOMENT and the podium's
    // (X16, X32, X33), with the tape they replay from. The camera rule (RULES 1f, EXPERIENCE 1.1) holds whatever this file
    // does: from the hand-off until the player's finish the camera is chase, T-cam or cockpit; gp-cam.js refuses 'tv'
    // and counts a TV frame drawn while racing (cam.audit()), and this director refuses its own shots then too.
    //
    //   GpDirector.director(env) -> D | null     null: no camera to direct (gp.js keeps M1's chase on the demo's leader)
    //     env = { THREE, three, camera, cam /* the GpCam view */, scene, renderer, root, T, cfg, quality, touch, reduced,
    //             warn, page(e, data) /* writes a director event, INTERFACES 8 M2 */, race() /* -> R, or null */ }
    //   D.frame(camera, focus, info, dt) -> bool   gp.js hands it to cam.director(); true when it framed this frame
    //   D.play(id, o) -> bool                      starts a shot or a sequence; false when it has none or may not (the
    //                                              caller falls back). ids and o:
    //     'demo'      the demo's cycle: a live race of agents, cut like TV, following the closest battle in the top 10
    //     'H1'        the helicopter (X28): o.len (s, 7), then its orbit-hold path for as long as nobody cuts away
    //     'G0'        the crane behind the grid (X07), 3 s       'W1'  the front row, seated (X12), 3.5 s
    //     'G1'        your car (X03), 2 s                        'handoff'  the glide into your hands (X05), 1.5 s;
    //                                                            o.mode: the view it lands in (else the one before TV)
    //     'flag'      your crossing replayed at 0.5x from the line, then the cool-down live from high (X16), 4.4 s
    //     'moment'    THE MOMENT (X32): o.event (the picked event), three cuts from the tape, 9 s
    //     'podium'    the podium's shots (X33): o.len 15 or 8, o.stage (gp-stage.js's St, optional: anchor(), spot(k),
    //                 helmets(on)); a stand-in anchor at the line while C2's stage is not in the tree
    //     every o may carry done(fn): called once at the shot's nominal end (a shot holds its last move after it)
    //   D.busy() -> bool,  D.stop(),  D.event(e),  D.update(dt, state),  D.state(),  D.dispose()
    //   D.project([x, y, z]) -> { x, y (CSS px), on }   for the intro's titles and lower-thirds (E)
    //   D.replaying() -> bool,  D.view() -> an R-shaped view of the tape at the replay's time (gp.js poses the cars
    //                 from it while replaying: REQ to E),  D.tape -> the tape (stats(), keep(), best(), scorer(fn))
    //   D.timeline() -> the shots cut so far ({ t, id, cut, len, replay }), for the beat timings' tests
    //   D.snapshot() / D.restore(s) -> the rig and the running shot's clock, for a page that borrows the lens
    //
    // The cameras: the world's (gp.cameras.tv: { id, kind 'fixed' | 'rail' | 'overhead' | 'heli', d, lat (or x), up (or
    // y), range, rail: [d0, d1], tunnel }) or, without them, auto lenses built from the track (a grandstand camera high
    // at the start, one on the pit wall at the line, the tightest corner from high outside, the biggest crest from low
    // behind it, a rail and a long lens head-on on the longest straight, a kerb camera at every apex, the helicopter):
    // every circuit gets the same shots. Each gets a coverage span along the lap at load (EXPERIENCE X32: by coverage).
    // gp.cameras.look carries the landmarks the shots frame ({ spire: [x, y, z, height], h1: { from, to }, podium:
    // { d, lat, up }, tunnel: [d0, d1] }); without it the shots frame the grid and the lap.
    var GpDirector = (function () {
      var PI = Math.PI, TAU = 2 * PI, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt, sin = Math.sin, cos = Math.cos;
      var tan = Math.tan, atan = Math.atan, atan2 = Math.atan2, floor = Math.floor, exp = Math.exp;
      var DEG = PI / 180;
      var SHOTS = ['demo', 'H1', 'G0', 'W1', 'G1', 'handoff', 'flag', 'moment', 'podium'];
      var GOLD = '#A08C5A';
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function sstep(a, b, x) { var u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
      function lerp(a, b, f) { return a + (b - a) * f; }
      function angDiff(a, b) { var d = (a - b) % TAU; if (d <= -PI) d += TAU; else if (d > PI) d -= TAU; return d; }
      function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
      function v3(a) { return Array.isArray(a) && a.length >= 3 && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]) ? [+a[0], +a[1], +a[2]] : null; }
      function dist3(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return sqrt(x * x + y * y + z * z); }
      function set3(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
      function copy(x) {
        if (x === null || typeof x !== 'object') return x;
        if (Array.isArray(x)) { var a = new Array(x.length); for (var i = 0; i < x.length; i++) a[i] = copy(x[i]); return a; }
        if (ArrayBuffer.isView(x)) return Array.prototype.slice.call(x);
        var o = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = copy(x[k]); return o;
      }
      // a deterministic 0..1 from two numbers (the shot lengths and the handheld drift: no clock, no Math.random)
      function hash01(a, b) { var s = sin(a * 12.9898 + b * 78.233 + 0.5) * 43758.5453; return s - floor(s); }
      function pageOf(env) {
        var doc = env.doc || (env.root && env.root.ownerDocument) || null;
        return { doc: doc, win: env.win || (doc && doc.defaultView) || null };
      }

      /* ------------------------------------------------------------------------------------- the tape (X32) -- */
      // 30 Hz, every car: a 20 s ring (600 rows) and up to 8 kept windows (-8 s .. +3 s round an event that scores 60
      // or more; the lowest score goes first). A row is its time (Float32) and per car 32 bytes: x, y, z, h (Float32);
      // pitch, roll, steer (Int16, 1e-4 rad); v (Uint16, cm/s); rpm (Uint16); throttle, brake (Uint8, /255); gear
      // (Int8); flags (Uint8: 1 a shift, 2 a pop, 4 the limiter, 8 the Flap open, 16 held, 32 against a barrier, 64 a
      // lock-up); the wheel's angle (Uint16, 2 pi / 65536). Playback: cubic Hermite on the plan position with the
      // speed along the heading as the tangent, the rest linear (angles the short way)
      var HZ = 30, RING = 20, KEEP = 8, BEFORE = 8, AFTER = 3, REC = 32, MAXB = 2100000;
      function Tape(N) {
        N = Math.max(1, N | 0);
        var rowB = 4 + N * REC, cap = RING * HZ;
        var ring = new DataView(new ArrayBuffer(rowB * cap)), head = 0, count = 0, nextT = -1, lastT = -1;
        var keeps = [], pend = [], scorer = null;
        function put(dv, r, t, cars) {
          var o = r * rowB; dv.setFloat32(o, t, true);
          for (var k = 0; k < N; k++) {
            var c = cars[k], b = o + 4 + k * REC;
            if (!c) continue;
            dv.setFloat32(b, c.x, true); dv.setFloat32(b + 4, c.y, true); dv.setFloat32(b + 8, c.z, true); dv.setFloat32(b + 12, c.h, true);
            dv.setInt16(b + 16, clamp(Math.round((c.pitch || 0) * 1e4), -32767, 32767), true); dv.setInt16(b + 18, clamp(Math.round((c.roll || 0) * 1e4), -32767, 32767), true);
            dv.setInt16(b + 20, clamp(Math.round((c.steerAngle || 0) * 1e4), -32767, 32767), true);
            dv.setUint16(b + 22, clamp(Math.round((c.v || 0) * 100), 0, 65535), true); dv.setUint16(b + 24, clamp(Math.round(c.rpm || 0), 0, 65535), true);
            dv.setUint8(b + 26, clamp(Math.round((c.thr || 0) * 255), 0, 255)); dv.setUint8(b + 27, clamp(Math.round((c.brk || 0) * 255), 0, 255));
            dv.setInt8(b + 28, clamp(c.gear | 0, -1, 9));
            dv.setUint8(b + 29, (c.shift > 0 ? 1 : 0) | (c.pop ? 2 : 0) | (c.limiter ? 4 : 0) | (c.flap && c.flap.open ? 8 : 0) | (c.held ? 16 : 0) | (c.wall > 0 ? 32 : 0) | (c.lock > 0.3 ? 64 : 0));
            var wa = ((c.wheelAngle || 0) % TAU + TAU) % TAU; dv.setUint16(b + 30, Math.round(wa / TAU * 65535) & 65535, true);
          }
        }
        function ringRow(i) { return (head - count + i + cap * 2) % cap; }            // the i-th oldest row's slot
        function ringT(i) { return ring.getFloat32(ringRow(i) * rowB, true); }
        // a source of rows: { dv, n, rowAt(i), t(i) } (the ring, or a kept window)
        var RS = { dv: ring, n: 0, rowAt: function (i) { return ringRow(i); }, t: function (i) { return ringT(i); } };
        function keepSrc(K) { return { dv: K.dv, n: K.n, rowAt: function (i) { return i; }, t: function (i) { return K.dv.getFloat32(i * rowB, true); } }; }
        // the source that holds [t0, t1] whole (a kept window first, then the ring), or null
        function find(t0, t1) {
          for (var i = 0; i < keeps.length; i++) { var K = keeps[i]; if (K.t0 <= t0 + 1e-3 && K.t1 >= t1 - 1e-3) return keepSrc(K); }
          RS.n = count;
          if (count > 1 && ringT(0) <= t0 + 1e-3 && ringT(count - 1) >= t1 - 1e-3) return RS;
          return null;
        }
        // the rows' index i with t(i) <= t < t(i + 1) (binary search)
        function bracket(S, t) {
          var lo = 0, hi = S.n - 1;
          if (t <= S.t(0)) return 0; if (t >= S.t(hi)) return hi - 1;
          while (hi - lo > 1) { var m = (lo + hi) >> 1; if (S.t(m) <= t) lo = m; else hi = m; }
          return lo;
        }
        function rd(S, i, k, out) {
          var b = S.rowAt(i) * rowB + 4 + k * REC, dv = S.dv;
          out.x = dv.getFloat32(b, true); out.y = dv.getFloat32(b + 4, true); out.z = dv.getFloat32(b + 8, true); out.h = dv.getFloat32(b + 12, true);
          out.pitch = dv.getInt16(b + 16, true) / 1e4; out.roll = dv.getInt16(b + 18, true) / 1e4; out.steerAngle = dv.getInt16(b + 20, true) / 1e4;
          out.v = dv.getUint16(b + 22, true) / 100; out.rpm = dv.getUint16(b + 24, true); out.thr = dv.getUint8(b + 26) / 255; out.brk = dv.getUint8(b + 27) / 255;
          out.gear = dv.getInt8(b + 28); out.flags = dv.getUint8(b + 29); out.wheelAngle = dv.getUint16(b + 30, true) / 65535 * TAU;
          return out;
        }
        var QA = {}, QB = {};
        // car k at time t from source S, into out (Hermite on x, z with the speed along the heading as the tangent)
        function at(S, t, k, out) {
          var i = bracket(S, t), ta = S.t(i), tb = S.t(i + 1), dt = max(1e-4, tb - ta), u = clamp((t - ta) / dt, 0, 1);
          var A = rd(S, i, k, QA), B = rd(S, i + 1, k, QB);
          var h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
          var ax = sin(A.h) * A.v * dt, az = -cos(A.h) * A.v * dt, bx = sin(B.h) * B.v * dt, bz = -cos(B.h) * B.v * dt;
          out.x = h00 * A.x + h10 * ax + h01 * B.x + h11 * bx; out.z = h00 * A.z + h10 * az + h01 * B.z + h11 * bz;
          out.y = lerp(A.y, B.y, u); out.h = A.h + angDiff(B.h, A.h) * u;
          out.pitch = lerp(A.pitch, B.pitch, u); out.roll = lerp(A.roll, B.roll, u); out.steerAngle = lerp(A.steerAngle, B.steerAngle, u);
          out.v = lerp(A.v, B.v, u); out.rpm = lerp(A.rpm, B.rpm, u); out.thr = lerp(A.thr, B.thr, u); out.brk = lerp(A.brk, B.brk, u);
          out.gear = u < 0.5 ? A.gear : B.gear; out.flags = u < 0.5 ? A.flags : B.flags;
          out.wheelAngle = A.wheelAngle + angDiff(B.wheelAngle, A.wheelAngle) * u;
          return out;
        }
        function copyOut(t0, t1) {
          RS.n = count;
          if (count < 2) return null;
          var i0 = -1, i1 = -1;
          for (var i = 0; i < count; i++) { var t = ringT(i); if (t >= t0 - 0.05 && i0 < 0) i0 = i; if (t <= t1 + 0.05) i1 = i; }
          if (i0 < 0 || i1 <= i0) return null;
          var n = i1 - i0 + 1, dv = new DataView(new ArrayBuffer(n * rowB));
          for (var j = 0; j < n; j++) { var src = ringRow(i0 + j) * rowB; for (var q = 0; q < rowB; q += 4) dv.setUint32(j * rowB + q, ring.getUint32(src + q, true), true); }
          return { dv: dv, n: n, t0: dv.getFloat32(0, true), t1: dv.getFloat32((n - 1) * rowB, true) };
        }
        function keepNow(P) {
          var W = copyOut(P.t - BEFORE, P.t + P.after);
          if (!W) return false;
          W.score = P.score; W.e = P.e; W.t = P.t; W.tag = P.tag || null;
          keeps.push(W);
          // (at most KEEP, and the whole tape within its 2.1 MB: the lowest score goes, the older of two equal)
          function bytes() { var b = ring.byteLength; for (var j = 0; j < keeps.length; j++) b += keeps[j].dv.byteLength; return b; }
          while (keeps.length > KEEP || (keeps.length > 1 && bytes() > MAXB)) { var lo = 0; for (var i = 1; i < keeps.length; i++) if (keeps[i].score < keeps[lo].score) lo = i; keeps.splice(lo, 1); }
          return true;
        }
        var T = {
          N: N, rowBytes: rowB, cap: cap,
          // a row, if the race clock has passed the next 1/30 s (the sim's latest state, at its own time)
          record: function (t, cars) {
            if (t < lastT - 1e-6) T.clear();
            if (t + 1e-9 < nextT) return false;
            put(ring, head, t, cars); head = (head + 1) % cap; count = min(cap, count + 1); lastT = t;
            nextT = (floor(t * HZ + 1e-6) + 1) / HZ;
            for (var i = pend.length - 1; i >= 0; i--) if (t >= pend[i].t + pend[i].after) { keepNow(pend[i]); pend.splice(i, 1); }
            return true;
          },
          clear: function () { head = 0; count = 0; nextT = -1; lastT = -1; keeps = []; pend = []; },
          // keep the window round an event at t (score >= 60 by the scorer; a lower score is kept only as a fallback)
          keep: function (t, score, e, tag, after) {
            var P = { t: +t, score: +score || 0, e: e || null, tag: tag || null, after: isFinite(after) ? clamp(+after, 0, 5) : AFTER };
            if (lastT >= P.t + P.after) return keepNow(P);
            pend.push(P); return true;
          },
          drop: function (tag) { keeps = keeps.filter(function (K) { return K.tag !== tag; }); pend = pend.filter(function (P) { return P.tag !== tag; }); },
          scorer: function (fn) { if (fn !== undefined) scorer = typeof fn === 'function' ? fn : null; return scorer; },
          score: function (e, ctx) { return scorer ? +scorer(e, ctx) || 0 : 0; },
          // can [t0, t1] be replayed (one source holds it whole)?
          has: function (t0, t1) { return !!find(t0, t1); },
          // car k at race time t, into out; null when no source holds it
          sample: function (t, k, out, t0, t1) { var S = find(t0 != null ? t0 : t, t1 != null ? t1 : t); return S ? at(S, t, k, out || {}) : null; },
          // the replay's source for [t0, t1] (sample(t, k, out) on it), or null
          source: function (t0, t1) { var S = find(t0, t1); return S ? { sample: function (t, k, out) { return at(S, clamp(t, S.t(0), S.t(S.n - 1)), k, out || {}); }, t0: S.t(0), t1: S.t(S.n - 1) } : null; },
          // the gaps over 2/30 s between rows in [t0, t1] of the source that holds it ("chunks missing at a cut")
          missing: function (t0, t1) {
            var S = find(t0, t1); if (!S) return -1;
            var miss = 0, i = bracket(S, t0);
            for (; i < S.n - 1 && S.t(i) < t1; i++) if (S.t(i + 1) - S.t(i) > 2 / HZ + 1e-3) miss++;
            return miss;
          },
          best: function () { var b = null; keeps.forEach(function (K) { if (K.score >= 60 && (!b || K.score > b.score || (K.score === b.score && K.t > b.t))) b = K; }); return b ? { t: b.t, score: b.score, e: b.e } : null; },
          keeps: function () { return keeps.map(function (K) { return { t: K.t, t0: K.t0, t1: K.t1, score: K.score, tag: K.tag, e: K.e ? K.e.e : null, rows: K.n }; }); },
          stats: function () {
            var kb = 0; keeps.forEach(function (K) { kb += K.dv.byteLength; });
            RS.n = count;
            return { rows: count, ringBytes: ring.byteLength, keepBytes: kb, bytes: ring.byteLength + kb, keeps: keeps.length, pending: pend.length,
              t0: count ? ringT(0) : null, t1: count ? ringT(count - 1) : null };
          },
        };
        return T;
      }

      /* ------------------------------------------------------------------------------------------ director -- */
      function director(env) {
        var X3 = env.three || env['THREE'], K0 = env.camera, T = env.T, cfg = env.cfg || {}, CAMV = env.cam;
        if (!X3 || !K0 || !T || !CAMV || typeof CAMV.tick !== 'function' || typeof T.posAt !== 'function') return null;
        var warn = typeof env.warn === 'function' ? env.warn : function () {};
        var page = typeof env.page === 'function' ? env.page : function () {};
        var raceOf = typeof env.race === 'function' ? env.race : function () { return null; };
        var RM = !!env.reduced, LOW = env.quality === 'low', L = T.L;
        var CA = cfg.cameras || {}, LOOK = CA.look && typeof CA.look === 'object' ? CA.look : {};
        var FAR0 = K0.far || 1800, NEAR0 = K0.near || 0.3;
        var PG = pageOf(env);
        var PP = {}, PR = { i: 0, d: 0, lat: 0, dist: 0 }, WW = {}, PO = {};
        function wrap(d) { return ((d % L) + L) % L; }
        function rel(a, b) { var x = wrap(a - b); return x > L / 2 ? x - L : x; }
        // the track frame: d along the lap, lat metres right of the centre line, up over the road -> [x, y, z]
        function tp(d, lat, up, out) { var p = T.posAt(wrap(d), lat || 0, up || 0, PP); out = out || [0, 0, 0]; out[0] = p.x; out[1] = p.y; out[2] = p.z; return out; }
        function walls(d) { return typeof T.wallsAt === 'function' ? T.wallsAt(wrap(d), WW) : { left: 10, right: 10 }; }
        function headingAt(d) { return typeof T.headingAt === 'function' ? T.headingAt(wrap(d)) : (T.pose(wrap(d), PO), PO.h); }
        var DRIFT = RM ? 0 : 0.004;

        /* ---------------------------------------------------------------------------- the cameras -- */
        // the tunnel (covered road: only a camera inside sees inside, a camera near a portal sees its mouth)
        var TUN = Array.isArray(LOOK.tunnel) && isFinite(LOOK.tunnel[0]) && isFinite(LOOK.tunnel[1]) ? [+LOOK.tunnel[0], +LOOK.tunnel[1]]
          : Array.isArray(cfg.tunnels) && cfg.tunnels[0] && isFinite(cfg.tunnels[0].from) ? [+cfg.tunnels[0].from, +cfg.tunnels[0].to]
          : (Array.isArray(CA.exposure) && CA.exposure[0] && isFinite(CA.exposure[0].from) ? [+CA.exposure[0].from, +CA.exposure[0].to] : null);
        function inTun(d) { if (!TUN) return false; var a = wrap(d - TUN[0]), b = wrap(TUN[1] - TUN[0]); return a <= b; }
        function camOf(c, i) {
          if (!c || typeof c !== 'object') return null;
          var id = typeof c.id === 'string' ? c.id.slice(0, 16) : 'C' + (i + 1), kind = ['fixed', 'rail', 'overhead', 'heli'].indexOf(c.kind) >= 0 ? c.kind : c.heli ? 'heli' : c.rail ? 'rail' : c.overhead || c.overheadCam ? 'overhead' : 'fixed';
          var d = num(c.d, 0), lat = num(c.lat, num(c.x, 0)), up = num(c.up, num(c.y, 3));
          var o = { id: id, kind: kind, d: wrap(d), lat: lat, up: up, range: clamp(num(c.range, kind === 'overhead' ? 260 : 320), 40, 900), tunnel: !!(c.tunnel || c.inTunnel), low: up < 1.5,
            rail: Array.isArray(c.rail) && c.rail.length === 2 ? [wrap(+c.rail[0]), wrap(+c.rail[1])] : null, name: typeof c.name === 'string' ? c.name.slice(0, 60) : id,
            fov: Array.isArray(c.fov) ? [clamp(+c.fov[0] || 6, 3, 60), clamp(+c.fov[1] || 60, 10, 90)] : [kind === 'overhead' ? 18 : 5, c.low || up < 1.5 ? 70 : 55] };
          o.p = tp(o.d, o.lat, o.up);
          return o;
        }
        function autoCams() {
          var out = [], cs = Array.isArray(T.corners) ? T.corners : [], i;
          var w0 = walls(60);
          out.push({ id: 'C2', kind: 'fixed', d: 60, lat: w0.right + 30, up: 30, range: 460, name: 'the start, high (auto)' });
          var w1 = walls(0);
          out.push({ id: 'C19', kind: 'fixed', d: 0, lat: -(w1.left + 0.2), up: 4.5, range: 260, name: 'the line, the pit wall (auto)' });
          // the tightest corner from high outside
          var tight = null; for (i = 0; i < cs.length; i++) if (cs[i] && cs[i].R > 0 && (!tight || cs[i].R < tight.R)) tight = cs[i];
          if (tight) { var wt = walls(tight.apex), outT = -(tight.dir || 1); out.push({ id: 'C6', kind: 'fixed', d: tight.apex, lat: outT * ((outT > 0 ? wt.right : wt.left) + 60), up: 60, range: 520, name: 'the tightest corner, high (auto)' }); }
          // the biggest crest (the most negative vertical curvature), low behind it, looking back up the road
          if (T.kv && T.n) {
            var bi = -1, bk = 0; for (i = 0; i < T.n; i += 4) if (T.kv[i] < bk) { bk = T.kv[i]; bi = i; }
            if (bi >= 0 && bk < -2e-4) { var dc = bi * T.ds, wc = walls(dc + 30); out.push({ id: 'C8', kind: 'fixed', d: dc + 30, lat: -(wc.left - 0.6), up: 1.4, range: 220, name: 'the crest, low behind it (auto)' }); }
          }
          // the tunnel's mouth, from the far side of its exit
          if (TUN) { var wm = walls(TUN[1] + 110); out.push({ id: 'C12', kind: 'fixed', d: TUN[1] + 110, lat: -(wm.left - 0.6), up: 1.4, range: 260, name: 'the tunnel mouth (auto)' }); }
          // the longest straight: a rail on its outside and a long lens head-on at its end
          var segs = Array.isArray(T.segs) ? T.segs : [], ls = null;
          for (i = 0; i < segs.length; i++) { var sg = segs[i]; if (sg && sg.type === 'S' && (!ls || sg.d1 - sg.d0 > ls.d1 - ls.d0)) ls = sg; }
          if (ls && ls.d1 - ls.d0 > 250) {
            var wr = walls((ls.d0 + ls.d1) / 2);
            out.push({ id: 'C14', kind: 'rail', d: (ls.d0 + ls.d1) / 2, lat: -(wr.left + 1), up: 3, rail: [ls.d0 + 60, ls.d1 - 90], range: 240, name: 'the long straight, a rail (auto)' });
            var we = walls(ls.d1 + 20); out.push({ id: 'C15', kind: 'fixed', d: ls.d1 + 25, lat: -(we.left + 14), up: 3, range: 520, fov: [3, 40], name: 'the long straight, head-on (auto)' });
          }
          // a kerb camera at every apex (low, on the inside)
          for (i = 0; i < cs.length; i++) { var c = cs[i]; if (!c) continue; var wa = walls(c.apex), ins = c.dir || 1; out.push({ id: 'K' + (c.id || i + 1), kind: 'fixed', d: c.apex, lat: ins * ((ins > 0 ? wa.right : wa.left) - 0.3), up: 1.4, range: 140, name: 'the apex of ' + (c.id || 'a corner') + ' (auto)' }); }
          out.push({ id: 'H1', kind: 'heli', d: 0, lat: 0, up: 160, name: 'the helicopter' });
          return out;
        }
        var CAMS = (Array.isArray(CA.tv) && CA.tv.length ? CA.tv : autoCams()).slice(0, 48).map(camOf).filter(Boolean);
        var BYID = {}; CAMS.forEach(function (c) { BYID[c.id] = c; });
        // (the authored list may lack the apex cameras the replays want: the auto kerb cameras join it)
        if (Array.isArray(CA.tv) && CA.tv.length) autoCams().filter(function (c) { return c.id.charAt(0) === 'K' && !BYID[c.id]; }).map(camOf).forEach(function (c) { CAMS.push(c); BYID[c.id] = c; });
        // the coverage span of each camera along the lap: the road it sees within its range (the tunnel's roof hides the
        // inside from a camera outside, but for 40 m past a portal it is near), as [d0, d1] round its own d
        // (I, M2 round 2) a camera sees a point only past the barriers: the sightline, walked every 2 m (40 steps at most) and placed on the lap
        // (d, lat), crosses a barrier line (the wall's face, T.wallsAt) above the wall's top (WALLTOP over the road: the
        // greybox's 1.1 m walls; gp.cameras.wallTop for the look kit's). Found by the flow test's pictures: lenses at kerb
        // height inside the walls saw the walls (11-46 % of the road they were meant to cover), so THE MOMENT's slow cut was
        // black. Load-time only (the spans) and at a replay's cut (the stop's camera); never each frame
        var WALLTOP = isFinite(+CA.wallTop) ? +CA.wallTop : 1.1, LQ = { i: -1, d: 0, lat: 0, dist: 0 }, LP = [0, 0, 0];
        function sees(p, q, hint) {
          var dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], len = Math.sqrt(dx * dx + dz * dz), n = Math.max(2, Math.min(40, Math.ceil(len / 2))), was = null;
          LQ.i = hint >= 0 ? hint : -1;
          for (var k = 0; k <= n; k++) {
            var u = k / n, x = p[0] + dx * u, z = p[2] + dz * u, y = p[1] + dy * u;
            var r = T.project(x, z, LQ.i, LQ); if (!r || !(r.dist < 200)) r = T.project(x, z, -1, LQ); if (!r) continue;
            var w = walls(r.d), face = r.lat >= 0 ? w.right : w.left, out = abs(r.lat) > face;
            if (was !== null && out !== was) { tp(r.d, (r.lat >= 0 ? 1 : -1) * face, 0, LP); if (y < LP[1] + WALLTOP) return false; }
            was = out;
          }
          return true;
        }
        var QP = [0, 0, 0];
        CAMS.forEach(function (c) {
          if (c.kind === 'heli') { c.span = [0, L]; c.all = true; return; }
          if (c.kind === 'rail' && c.rail) { c.span = [wrap(c.rail[0] - 80), wrap(c.rail[1] + 80)]; return; }
          var camIn = inTun(c.d) && abs(c.lat) < 12, near = -1, nd = 1e9, ok = [], S = 5, M = Math.ceil(800 / S);
          for (var k = -M; k <= M; k++) {
            var d = wrap(c.d + k * S), q = tp(d, 0, 0.6, QP), dd = dist3(q, c.p), seen = dd <= c.range;
            if (seen && TUN) { var ti = inTun(d); if (ti !== camIn) seen = !camIn && ti && (wrap(d - TUN[0]) < 40 || wrap(TUN[1] - d) < 40) && dd < 200; }
            if (seen && c.kind !== 'overhead' && dd > 6) { if (c.pi == null) c.pi = T.project(c.p[0], c.p[2], -1, LQ).i; seen = sees(c.p, q, c.pi); }
            ok.push(seen); if (dd < nd) { nd = dd; near = ok.length - 1; }
          }
          var a = near, b = near;
          if (!ok[near]) { c.span = null; return; }
          while (a > 0 && ok[a - 1]) a--; while (b < ok.length - 1 && ok[b + 1]) b++;
          c.span = [wrap(c.d + (a - M) * S), wrap(c.d + (b - M) * S)];
        });
        function covers(c, d) { if (!c || !c.span) return false; if (c.all) return true; var a = wrap(d - c.span[0]), b = wrap(c.span[1] - c.span[0]); return a <= b; }
        var DEMO = (Array.isArray(CA.demo) && CA.demo.length ? CA.demo : ['C2', 'C6', 'C8', 'C12', 'C14', 'C15', 'H1']).filter(function (id) { return BYID[id]; });
        if (!DEMO.length) DEMO = CAMS.filter(function (c) { return c.kind !== 'heli'; }).slice(0, 6).map(function (c) { return c.id; });

        /* ------------------------------------------------------------------------------- the state -- */
        var S = { R: null, clock: 0, simT: null, paused: false, shot: null, queue: [], handed: false, finT: null, log: [], cut: true, demo: false, noAuto: null,
          battle: null, demoI: -1, demoK: 0, stopRide: 0, view: null, wipe: null, refused: 0, last: null, stats: { shots: 0 } };
        var tape = null;
        // the rig the TV lens rides on: position and look on springs fed the target's own velocity (a pan head that
        // leads a car at 80 m/s rather than trailing it by 2 v / w metres), the lens on a filter
        var RIG = { p: [0, 0, 0], l: [0, 0, 0], pv: [0, 0, 0], lv: [0, 0, 0], pt: [0, 0, 0], lt: [0, 0, 0], pw: [0, 0, 0], lw: [0, 0, 0], fov: 50, up: [0, 1, 0], init: false };
        var W = { p: [0, 0, 0], l: [0, 0, 0], up: [0, 1, 0], q: null, fov: 50, near: 0.3, far: FAR0, wP: 0, wL: 0, lamF: 0, drift: 0 };
        var TMP = [0, 0, 0], TMP2 = [0, 0, 0], CARP = [0, 0, 0], QC = {}, QD = {};

        function R() { var r = null; try { r = raceOf(); } catch (e) { r = null; } return r && r.S && r.S.cars ? r : null; }
        function alphaOf(r) { var H = r.S.H || 1 / 120; return typeof r.S.acc === 'number' ? clamp(r.S.acc / H, 0, 1) : 1; }
        // a live car's position (interpolated as the car view draws it), [x, y, z]
        function carAt(r, n, out, up) {
          var c = r.S.cars[n]; out = out || [0, 0, 0]; if (!c) return null;
          var a = alphaOf(r), px = c.px != null ? c.px : c.x, py = c.py != null ? c.py : c.y, pz = c.pz != null ? c.pz : c.z;
          out[0] = px + (c.x - px) * a; out[1] = py + (c.y - py) * a + (up || 0); out[2] = pz + (c.z - pz) * a; return out;
        }
        function youOf(r) { return r && r.human >= 0 ? r.human : -1; }
        function finished(r) { var y = youOf(r); return y >= 0 && !!(r.S.cars[y] && r.S.cars[y].fin); }
        function spectating(r) { return !!r && (r.demo || r.human < 0 || finished(r)); }
        // the player races (for this director): his race is live and the camera was handed to him (or the lights went
        // out), until his flag
        function racingNow(r) { return !!r && r.human >= 0 && !finished(r) && S.handed; }
        function newRace(r) {
          S.R = r; S.simT = null; S.still = 0; S.handed = false; S.finT = null; S.battle = null; S.demoI = -1; S.demoK = 0; S.noAuto = null; S.view = null; S.go = false; S.yd = null;
          if (S.shot && S.shot.id !== 'demo' && S.shot.id !== 'H1' && S.shot.id !== 'G0' && S.shot.id !== 'W1' && S.shot.id !== 'G1' && S.shot.id !== 'handoff') end(false);
          if (S.shot && S.shot.id === 'demo') end(false);
          tape = r && !r.demo ? Tape(r.S.cars.length) : null;
          if (tape) tape.scorer(defaultScore);
          D.tape = tape;
        }
        // the stand-in scorer (E's picker replaces it: D.tape.scorer(fn)): finish-and-loop 3.2's table where the events
        // carry what it needs today (M1's overtake; the photo finish once finish carries its gaps)
        function defaultScore(e, r) {
          var y = youOf(r); if (y < 0 || !e) return 0;
          var laps = r.cfg && r.cfg.laps || 3;
          if ((e.e === 'pass' || e.e === 'overtake') && e.car === y) return 100 + (e.lap >= laps ? 60 : 0) + (e.earned ? 0 : 0);
          if (e.e === 'finish' && e.car === y) { var g = min(abs(num(e.gapAhead, 9)), abs(num(e.gapBehind, 9))); return g <= 0.1 ? 300 + (e.place === 1 ? 200 : 0) : 0; }
          if (e.e === 'sideBySide' && (e.a === y || e.b === y)) return 70;
          if (e.e === 'contact' && (e.a === y || e.b === y)) return 30;
          return 0;
        }

        /* -------------------------------------------------------------------------- the lens -- */
        // the vertical lens that fits `need` degrees across (half-angle h) and `needV` up and down on this screen
        function fovFit(K, hHalf, vHalf, minF, maxF) {
          var a = max(0.2, K.aspect), fromH = 2 * atan(tan(hHalf) / a) / DEG, fromV = 2 * vHalf / DEG;
          return clamp(max(fromH, fromV), minF, maxF);
        }
        function look(K, p, l, out) { var dx = l[0] - p[0], dy = l[1] - p[1], dz = l[2] - p[2], dl = sqrt(dx * dx + dy * dy + dz * dz) || 1; out = out || [0, 0, 0]; out[0] = dx / dl; out[1] = dy / dl; out[2] = dz / dl; return out; }
        // the angular box of points seen from p: { yaw0, yaw1, pit0, pit1 } (yaw about +y from -z, pitch up)
        var BOX = { y0: 0, y1: 0, p0: 0, p1: 0 };
        function angBox(p, pts, ref) {
          BOX.y0 = 1e9; BOX.y1 = -1e9; BOX.p0 = 1e9; BOX.p1 = -1e9;
          for (var i = 0; i < pts.length; i++) {
            var q = pts[i], dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], yw = atan2(dx, -dz), hz = sqrt(dx * dx + dz * dz), pt = atan2(dy, max(0.3, hz));
            if (ref != null) yw = ref + angDiff(yw, ref);
            BOX.y0 = min(BOX.y0, yw); BOX.y1 = max(BOX.y1, yw); BOX.p0 = min(BOX.p0, pt); BOX.p1 = max(BOX.p1, pt);
          }
          return BOX;
        }
        // aim and lens to hold every point (a margin of `m` of the frame's half on each side): into W
        function fitPts(K, p, pts, m, minF, maxF, ref) {
          var B = angBox(p, pts, ref), yc = (B.y0 + B.y1) / 2, pc = (B.p0 + B.p1) / 2;
          var hH = (B.y1 - B.y0) / 2 / (1 - m), hV = (B.p1 - B.p0) / 2 / (1 - m);
          W.l[0] = p[0] + sin(yc) * cos(pc) * 50; W.l[1] = p[1] + sin(pc) * 50; W.l[2] = p[2] - cos(yc) * cos(pc) * 50;
          W.fov = fovFit(K, max(hH, 0.004), max(hV, 0.004), minF, maxF);
          return W;
        }
        // a lens on a subject: the aim (with a lead) and the lens that holds `r` metres round it as `fill` of the frame
        function holdOn(K, p, c, r, fill, minF, maxF) {
          var dd = max(1, dist3(p, c)), half = atan(r / dd) / fill;
          W.l[0] = c[0]; W.l[1] = c[1]; W.l[2] = c[2];
          W.fov = fovFit(K, half, half, minF, maxF);
          return W;
        }
        function resetW() { W.up[0] = 0; W.up[1] = 1; W.up[2] = 0; W.q = null; W.near = 0.3; W.far = FAR0; W.wP = 0; W.wL = 0; W.lamF = 0; W.drift = 0; }
        function spring3(pk, vk, target, w, dt, tk, wk) {
          // (the target's velocity, from its last place, smoothed: the spring's feed-forward)
          var T0 = RIG[tk], TW = RIG[wk];
          if (dt > 0) for (var j = 0; j < 3; j++) { var tv0 = (target[j] - T0[j]) / dt; TW[j] += (tv0 - TW[j]) * (1 - exp(-12 * dt)); T0[j] = target[j]; }
          if (!(dt > 0) || !(w > 0)) { RIG[pk][0] = target[0]; RIG[pk][1] = target[1]; RIG[pk][2] = target[2]; RIG[vk][0] = TW[0]; RIG[vk][1] = TW[1]; RIG[vk][2] = TW[2]; return; }
          var nS = Math.max(1, Math.ceil(dt * w / 0.25)), h = dt / nS;
          for (var s = 0; s < nS; s++) for (var i = 0; i < 3; i++) { var g = target[i] - TW[i] * (dt - (s + 1) * h), d = g - RIG[pk][i]; RIG[vk][i] += (w * w * d + 2 * w * (TW[i] - RIG[vk][i])) * h; RIG[pk][i] += RIG[vk][i] * h; }
        }
        var QV = new X3.Vector3();
        function apply(K, dt) {
          if (S.cut || !RIG.init) { RIG.p = W.p.slice(); RIG.l = W.l.slice(); RIG.pv = [0, 0, 0]; RIG.lv = [0, 0, 0]; RIG.pt = W.p.slice(); RIG.lt = W.l.slice(); RIG.pw = [0, 0, 0]; RIG.lw = [0, 0, 0]; RIG.fov = W.fov; RIG.init = true; S.cut = false; RIG.fresh = 2; }
          else {
            // (the first frames after a cut learn the target's velocity before they lean on it)
            if (RIG.fresh > 0) { RIG.fresh--; for (var j = 0; j < 3; j++) { if (dt > 0) { RIG.pw[j] = (W.p[j] - RIG.pt[j]) / dt; RIG.lw[j] = (W.l[j] - RIG.lt[j]) / dt; } RIG.pt[j] = W.p[j]; RIG.lt[j] = W.l[j]; } RIG.p = W.p.slice(); RIG.l = W.l.slice(); RIG.pv = RIG.pw.slice(); RIG.lv = RIG.lw.slice(); }
            else { spring3('p', 'pv', W.p, W.wP, dt, 'pt', 'pw'); spring3('l', 'lv', W.l, W.wL, dt, 'lt', 'lw'); }
            RIG.fov = W.lamF > 0 && dt > 0 ? RIG.fov + (W.fov - RIG.fov) * (1 - exp(-W.lamF * dt)) : W.fov;
          }
          K.position.set(RIG.p[0], RIG.p[1], RIG.p[2]); K.up.set(W.up[0], W.up[1], W.up[2]);
          if (W.q) K.quaternion.set(W.q[0], W.q[1], W.q[2], W.q[3]); else K.lookAt(RIG.l[0], RIG.l[1], RIG.l[2]);
          if (W.drift > 0) {
            // the handheld drift (shootout's): 0.004 rad at about 0.3 Hz, on the director's own clock
            var c0 = S.clock, n1 = W.drift * (sin(TAU * 0.3 * c0 + 0.7) + 0.5 * sin(TAU * 0.71 * c0 + 2.1)) / 1.5, n2 = W.drift * (sin(TAU * 0.27 * c0 + 1.9) + 0.5 * sin(TAU * 0.63 * c0)) / 1.5;
            K.rotateY(n1); K.rotateX(n2 * 0.6);
          }
          var ch = false;
          if (abs(K.fov - RIG.fov) > 1e-3) { K.fov = RIG.fov; ch = true; }
          if (abs(K.near - W.near) > 1e-4) { K.near = W.near; ch = true; }
          if (abs(K.far - W.far) > 1e-2) { K.far = W.far; ch = true; }
          if (ch) K.updateProjectionMatrix();
        }
        function restoreLens(K) { var ch = false; if (abs(K.far - FAR0) > 1e-2) { K.far = FAR0; ch = true; } if (abs(K.near - NEAR0) > 1e-4 && CAMV.mode() !== 'tv') { ch = true; } if (ch) K.updateProjectionMatrix(); }

        /* ------------------------------------------------------------------------------ the wipe -- */
        // THE MOMENT's cuts: a 0.25 s gold line across the picture (original; not a broadcaster's), the cut at its middle
        function wipe(on) {
          var doc = PG.doc; if (!doc || !env.root) return;
          if (!S.wipe) {
            try {
              var w = doc.createElement('div');
              w.style.cssText = 'position:absolute;left:0;top:0;width:3px;height:100%;background:' + GOLD + ';box-shadow:0 0 12px ' + GOLD + ';pointer-events:none;z-index:6;opacity:0;will-change:transform';
              w.setAttribute('aria-hidden', 'true'); w.className = 'gp-wipe';
              env.root.appendChild(w); S.wipe = { el: w, t: -1 };
            } catch (e) { S.wipe = null; return; }
          }
          if (on) S.wipe.t = 0;
        }
        function stepWipe(dt) {
          if (!S.wipe || S.wipe.t < 0) return;
          S.wipe.t += dt;
          var u = S.wipe.t / 0.25, w = PG.win && PG.win.innerWidth || 1280;
          if (u >= 1) { S.wipe.el.style.opacity = '0'; S.wipe.t = -1; return; }
          S.wipe.el.style.opacity = '1'; S.wipe.el.style.transform = 'translateX(' + Math.round(u * (w + 6) - 3) + 'px)';
        }

        /* ------------------------------------------------------------------------------ the shots -- */
        // a shot: { id, cut (the sub-shot's id), t (s into it), len, hold, done, rt (the replay's race time), rate, pose(K, dt) }
        function cutTo(sh, over) {
          over = over > 0 ? over : 0;
          S.shot = sh; S.cut = true; sh.t = over; sh.fired = false; S.stats.shots++;
          if (sh.rt != null) sh.rt = sh.rt0 + over * sh.rate;
          var e = { t: +(S.clock - over).toFixed(4), id: sh.id, cut: sh.cut || sh.id, len: sh.len, replay: sh.rt != null ? +sh.rt.toFixed(3) : null, cam: sh.cam ? sh.cam.id : null };
          S.log.push(e); if (S.log.length > 200) S.log.shift();
          page('shot', { id: sh.cut || sh.id, of: sh.id, cam: e.cam });
          if (sh.rt != null && sh.first) page('replay', { kind: sh.id === 'moment' ? 'moment' : sh.id, event: sh.event ? sh.event.e : null, at: sh.event ? sh.event.t : null });
          if (sh.wipe) wipe(true);
          if (sh.enter) sh.enter();
        }
        function end(untv) {
          var sh = S.shot; S.shot = null; S.queue = []; S.view = null;
          if (sh && sh.exit) sh.exit();
          restoreLens(K0);
          if (untv !== false && CAMV.mode() === 'tv') CAMV.untv();
          return sh;
        }
        // run the next sub-shot of a sequence, or hold the last one
        function next(over) {
          var sh = S.shot;
          if (S.queue.length) { var nx = S.queue.shift(); if (sh && sh.exit) sh.exit(); cutTo(nx, over); return; }
          if (sh) sh.holding = true;
        }
        function want(on) { if (on) return CAMV.mode('tv', racingNow(S.R)) === 'tv'; return true; }
        function seq(list, done) {
          if (!list.length) return false;
          list[list.length - 1].done = done;
          S.queue = list.slice(1);
          cutTo(list[0]);
          return true;
        }

        // ---- the demo (X11): a live race of agents, cut like TV, following the closest battle in the top 10
        function battleOf(r) {
          var st = r.S, cars = st.cars, ord = st.race && st.race.order ? st.race.order : null;
          if (!ord || ord.length < 1) { ord = []; for (var q = 0; q < cars.length; q++) ord.push(q); }
          var best = null;
          for (var i = 0; i + 1 < min(10, ord.length); i++) {
            var a = cars[ord[i]], b = cars[ord[i + 1]];
            if (!a || !b || a.fin || b.fin) continue;
            var gap = wrap(a.d - b.d), g = gap / max(10, b.v);
            if (gap > 400) continue;
            if (!best || g < best.g) best = { a: ord[i], b: ord[i + 1], g: g };
          }
          if (!best) best = { a: ord[0], b: -1, g: 99 };
          // (hysteresis: a new battle must be half a second closer)
          if (S.battle && S.battle.a !== best.a && S.battle.b >= 0 && cars[S.battle.a] && cars[S.battle.b] && !cars[S.battle.a].fin) {
            var oa = cars[S.battle.a], ob = cars[S.battle.b], og = wrap(oa.d - ob.d) / max(10, ob.v);
            if (og < 3 && og - best.g < 0.5) best = { a: S.battle.a, b: S.battle.b, g: og };
          }
          S.battle = best;
          return best;
        }
        // the battle's centre and its radius (the two cars and a car's length round them), live
        var BA = [0, 0, 0], BB = [0, 0, 0], BC = [0, 0, 0];
        function battleBox(r, bt, lead) {
          carAt(r, bt.a, BA, 0.6);
          var ca = r.S.cars[bt.a], lx = sin(ca.h) * ca.v * lead, lz = -cos(ca.h) * ca.v * lead, rad = 4;
          if (bt.b >= 0) { carAt(r, bt.b, BB, 0.6); BC[0] = (BA[0] + BB[0]) / 2 + lx; BC[1] = (BA[1] + BB[1]) / 2; BC[2] = (BA[2] + BB[2]) / 2 + lz; rad = max(4, dist3(BA, BB) / 2 + 3.5); }
          else { BC[0] = BA[0] + lx; BC[1] = BA[1]; BC[2] = BA[2] + lz; }
          return rad;
        }
        // will the battle be inside camera c's span for >= 2.5 s of the next 5 s, beginning within 1.5 s?
        function willCover(c, d, v) {
          var n = 0, first = -1;
          for (var k = 1; k <= 10; k++) { var t = k * 0.5; if (covers(c, d + v * t)) { n++; if (first < 0) first = t; } }
          return n >= 5 && first >= 0 && first <= 1.5;
        }
        function demoShot(r) {
          var bt = battleOf(r), ca = r.S.cars[bt.a], len = 4 + 2 * hash01(S.demoK + 1, r.seed || 1), cam = null;
          for (var j = 1; j <= DEMO.length; j++) {
            var id = DEMO[(S.demoI + j) % DEMO.length], c = BYID[id];
            if (!c) continue;
            if (c.kind === 'heli') { if (S.last && S.last === 'H1') continue; cam = c; S.demoI = (S.demoI + j) % DEMO.length; break; }
            if (willCover(c, ca.d, ca.v)) { cam = c; S.demoI = (S.demoI + j) % DEMO.length; break; }
          }
          // nothing of the cycle sees it soon: an auto lens on a pole beside the road ahead of the battle
          if (!cam || (cam.kind === 'heli' && S.demoK % 3 !== 2)) {
            // (7 m past the barrier line, clear of the trackside furniture the world puts just outside it)
            var dA = wrap(ca.d + ca.v * 2.4 + 20), wA = walls(dA), side = hash01(S.demoK, 7) < 0.5 ? -1 : 1;
            cam = camOf({ id: 'auto', kind: 'fixed', d: dA, lat: side * ((side > 0 ? wA.right : wA.left) + 7), up: 3.5 + 3 * hash01(S.demoK, 3), range: 300 }, 0);
          }
          S.demoK++; S.last = cam.id;
          // the hero (the car view's finest car, the shadow's centre) is the battle's front car
          if (r.demo && typeof r.focus === 'function') { try { r.focus(bt.a); } catch (e) {} }
          return liveShot('demo', cam, len, { battle: true });
        }
        // a live camera on a subject: a fixed pole (panning, zooming), a rail (dollying alongside), an overhead (looking
        // along the road), or the helicopter (an orbit, looking down at it). o.battle: the demo's battle; o.car: one car
        function liveShot(id, cam, len, o) {
          o = o || {};
          var sh = { id: id, cut: cam.id, cam: cam, len: len, o: o, orbit: hash01(S.demoK, 11) * TAU };
          sh.pose = function (K, dt) {
            var r = S.R; if (!r) return false;
            resetW();
            var rad, ctr;
            if (o.battle && S.battle) { rad = battleBox(r, S.battle, 0.15); ctr = BC; }
            else { var n = o.car != null ? o.car : youOf(r) >= 0 ? youOf(r) : (typeof r.focus === 'function' ? r.focus() : 0); carAt(r, n, BC, 0.6); var cn = r.S.cars[n]; if (cn) { BC[0] += sin(cn.h) * cn.v * 0.12; BC[2] += -cos(cn.h) * cn.v * 0.12; } rad = o.rad || 4.5; ctr = BC; }
            if (cam.kind === 'heli') {
              // the helicopter in the demo and the cool-down: 160 m up, 380 m off, circling at about 50 m/s
              sh.orbit += dt * 50 / 380;
              W.p[0] = ctr[0] + sin(sh.orbit) * 380; W.p[1] = ctr[1] + 160; W.p[2] = ctr[2] - cos(sh.orbit) * 380;
              holdOn(K, W.p, ctr, max(rad, 30), 0.5, 6, 50); W.near = 1; W.far = 2500; W.wL = 3; W.lamF = 2;
            } else if (cam.kind === 'rail' && cam.rail) {
              // the dolly runs alongside the subject on its rail, a little behind it
              var r0 = cam.rail[0], r1 = cam.rail[1], span = wrap(r1 - r0), ds = clamp(wrap(nearestD(ctr) - r0) - 6, 0, span);
              if (!sh.rd) sh.rd = ds; sh.rd += clamp(ds - sh.rd, -95 * dt, 95 * dt);
              tp(r0 + sh.rd, cam.lat, cam.up, W.p);
              holdOn(K, W.p, ctr, rad, 0.4, cam.fov[0], cam.fov[1]); W.wP = 4; W.wL = 6; W.lamF = 3;
            } else {
              W.p[0] = cam.p[0]; W.p[1] = cam.p[1]; W.p[2] = cam.p[2];
              holdOn(K, W.p, ctr, rad, cam.low ? 0.5 : 0.42, cam.fov[0], cam.fov[1]); W.wL = 5; W.lamF = 3;
              if (cam.low) W.near = 0.1;
            }
            W.drift = cam.kind === 'heli' ? 0 : DRIFT * 0.5;
            return true;
          };
          return sh;
        }
        // the race time a replay frames: the one the car view posed the cars at this frame (D.view(), called before the
        // camera's update moves the clock on), so the lens and the cars agree; else the shot's own
        function camRT(sh) { return S.viewAt === S.ticks - 1 && S.viewRT != null && sh.src && S.viewRT >= sh.src.t0 && S.viewRT <= sh.src.t1 ? S.viewRT : sh.rt; }
        function nearestD(p) { var r = T.project(p[0], p[2], PR.i, PR); if (!r || !(r.dist < 25)) r = T.project(p[0], p[2], -1, PR); return r ? r.d : 0; }

        // ---- the helicopter (X28): flying low over the harbour toward the grid, the landmark and the grid in one frame,
        // fitted per screen shape; then an orbit-hold for as long as nobody cuts away. The landmark and the path are the
        // world's (gp.cameras.look: spire [x, y, z, height], h1 { from, to }); without them the lap's middle and an
        // approach from beyond the grid
        function gridCentre(out) { var r = S.R, N = r ? r.S.cars.length : 20, slot = cfg.slot || 8; return tp(L - slot * (N + 1) / 2, 0, 0, out); }
        function lapBox() {
          if (lapBox.b) return lapBox.b;
          var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (var d = 0; d < L; d += 25) { tp(d, 0, 0, TMP); x0 = min(x0, TMP[0]); x1 = max(x1, TMP[0]); z0 = min(z0, TMP[2]); z1 = max(z1, TMP[2]); y0 = min(y0, TMP[1]); y1 = max(y1, TMP[1]); }
          return (lapBox.b = { c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], x0: x0, x1: x1, z0: z0, z1: z1, y0: y0, y1: y1, diag: sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0)) });
        }
        var SPIRE0 = v3(LOOK.spire) ? { base: v3(LOOK.spire), h: num(LOOK.spire[3], 300) } : null, SPIRE = SPIRE0;
        // (the intro's landmark, o.landmark, is where its title sits: the crown. The look data's landmark when it is that
        // one (within 30 m of its crown); else a point of its own, framed with room under it)
        function landmarkOf(o) {
          var lm = o && o.landmark, p = lm && isFinite(+lm.x) && isFinite(+lm.z) ? [+lm.x, +lm.y || 0, +lm.z] : v3(lm);
          if (!p) return SPIRE0;
          if (SPIRE0 && dist3(p, [SPIRE0.base[0], SPIRE0.base[1] + SPIRE0.h, SPIRE0.base[2]]) < 30) return SPIRE0;
          var h = max(20, p[1] - (yAtXZ(p) || 0));
          return { base: [p[0], p[1] - h, p[2]], h: h };
        }
        function yAtXZ(p) { var r = T.project(p[0], p[2], -1, PR); return r && typeof T.yAt === 'function' ? T.yAt(r.d) : 0; }
        function h1Path() {
          var g = gridCentre([0, 0, 0]), from = LOOK.h1 && v3(LOOK.h1.from), to = LOOK.h1 && v3(LOOK.h1.to);
          if (!from || !to) {
            var B = lapBox(), dx = g[0] - B.c[0], dz = g[2] - B.c[2], dl = sqrt(dx * dx + dz * dz) || 1, ux = dx / dl, uz = dz / dl;
            // beyond the grid seen from the lap's middle, turned 35 degrees, so the grid and the lap are in one frame
            var ca = cos(0.6), sa = sin(0.6), vx = ux * ca - uz * sa, vz = ux * sa + uz * ca;
            to = [g[0] + vx * 0.32 * B.diag, g[1] + 80, g[2] + vz * 0.32 * B.diag];
            from = [to[0] + vx * 380, g[1] + 105, to[2] + vz * 380];
          }
          return { from: from, to: to, grid: g };
        }
        function h1Shot(o) {
          o = o || {};
          SPIRE = landmarkOf(o);
          var P = h1Path(), len = num(o.len, 7), fx = P.to[0] - P.from[0], fz = P.to[2] - P.from[2], fl = sqrt(fx * fx + fz * fz) || 1;
          var speed = fl / len, Rh = 400, lx = fz / fl, lz = -fx / fl;               // the hold circles to the left of the flight
          var HC = [P.to[0] + lx * Rh, P.to[1], P.to[2] + lz * Rh], a0 = atan2(P.to[0] - HC[0], P.to[2] - HC[2]);
          var pts = [], B = lapBox(), g = P.grid, held = 0;
          var sh = { id: 'H1', cut: 'H1', len: len, holding: false };
          sh.pose = function (K, dt) {
            resetW(); W.near = 1; W.far = 2500;
            var t = sh.t;
            if (t <= len) { var u = t / len; W.p[0] = lerp(P.from[0], P.to[0], u); W.p[1] = lerp(P.from[1], P.to[1], u); W.p[2] = lerp(P.from[2], P.to[2], u); }
            else {
              // the orbit-hold: on round the circle left of the path at the same speed, the frame fitted as before
              var a = a0 - (t - len) * speed / Rh;
              W.p[0] = HC[0] + sin(a) * Rh; W.p[1] = P.to[1]; W.p[2] = HC[2] + cos(a) * Rh;
              if (!sh.holdSaid && t > len + 0.5) { sh.holdSaid = true; page('hold', { shot: 'H1', waited: 0 }); }
              held = t - len;
            }
            pts.length = 0;
            var tall = K.aspect < 1;
            if (SPIRE) {
              var sb = SPIRE.base, top = [sb[0], sb[1] + SPIRE.h * (tall ? 1.3 : 1.12), sb[2]];
              pts.push(sb, top);
              if (!tall) { pts.push(tp(L - 4, -9, 0, [0, 0, 0]), tp(L - 170, 9, 0, [0, 0, 0])); }
              else { pts.push([sb[0], sb[1] - 30, sb[2]]); }
            } else if (!tall) {
              pts.push(tp(L - 4, -9, 0, [0, 0, 0]), tp(L - 170, 9, 0, [0, 0, 0]), [B.x0, B.y0, B.z0], [B.x1, B.y0, B.z1], [B.x0, B.y0, B.z1], [B.x1, B.y0, B.z0]);
            } else {
              pts.push(tp(L - 4, -9, 0, [0, 0, 0]), tp(L - 170, 9, 0, [0, 0, 0]), [B.c[0], B.y0, B.c[2]]);
            }
            var ref = atan2((SPIRE ? SPIRE.base[0] : g[0]) - W.p[0], -((SPIRE ? SPIRE.base[2] : g[2]) - W.p[2]));
            fitPts(K, W.p, pts, 0.1, 14, 82, ref);
            sh.held = held;
            return true;
          };
          sh.exit = function () { if (sh.holdSaid) page('hold', { shot: 'H1', waited: +held.toFixed(2), end: true }); };
          return sh;
        }
        // the crown sphere's centre (for the title's gold stop, X28), or null
        function crown() { return SPIRE ? [SPIRE.base[0], SPIRE.base[1] + SPIRE.h, SPIRE.base[2]] : null; }

        // ---- the grid (X07 G0, X12 W1, X03 G1), auto-placed from the slots, so a Mog's circuit gets them for free
        function slotD(k) { return wrap(L - (cfg.slot || 8) * k); }
        function carBoxPts(r, n, out) {
          var c = r.S.cars[n]; out = out || []; out.length = 0; if (!c) return out;
          var sh = sin(c.h), ch = cos(c.h);
          for (var i = 0; i < 8; i++) { var x = i & 1 ? 1 : -1, y = i & 2 ? 0.95 : 0.02, z = i & 4 ? 3.19 : -2.39; out.push([c.x + ch * x + sh * z, c.y + y, c.z + sh * x - ch * z]); }
          return out;
        }
        function g0Shot(o) {
          o = o || {};
          var len = num(o.len, 3), r = S.R, N = r ? r.S.cars.length : 20;
          var sh = { id: 'G0', cut: 'G0', len: len }, pts = [];
          sh.pose = function (K, dt) {
            resetW(); W.near = 0.5;
            var rise = sstep(0, len + 1, sh.t) * 2.2, tall = K.aspect < 1;
            tp(slotD(N) - (tall ? 10 : 14), 0, 22 + rise, W.p);
            pts.length = 0;
            // every slot's box, and the gantry at the line (8 m up, across the road)
            for (var k = 1; k <= N; k++) { var d = slotD(k), la = k % 2 ? 3.5 : -3.5; pts.push(tp(d + 3.2, la, 0.1, [0, 0, 0]), tp(d - 2.4, la, 0.1, [0, 0, 0])); }
            var wg = walls(0); pts.push(tp(0, -wg.left, 9, [0, 0, 0]), tp(0, wg.right, 9, [0, 0, 0]));
            if (tall) { pts.push(tp(slotD(N), -7, 0, [0, 0, 0]), tp(slotD(N), 7, 0, [0, 0, 0])); }
            fitPts(K, W.p, pts, tall ? 0.04 : 0.08, 20, 80, headingAt(slotD(N)));
            W.drift = DRIFT * 0.3;
            return true;
          };
          return sh;
        }
        // W1: the front row's featured agent: the house machine (row 'gbot') in P1-P4, else the front row's by form
        // (chrome, then plush, then suited), the player's own car never (its shot is G1)
        var FORM = { chrome: 3, 'glossy-robot': 3, 'chrome-endo': 3, plush: 2, 'hooded-plush': 2, suited: 1, 'felt-creature': 1 };
        function featured(r) {
          var specs = r.cfg && r.cfg.specs || [], y = youOf(r), best = -1, bs = -1, house = typeof CA.house === 'string' ? CA.house : 'gbot';
          for (var k = 0; k < min(4, specs.length); k++) if (k !== y && specs[k] && specs[k].row === house) return k;
          for (k = 0; k < min(2, specs.length); k++) {
            if (k === y || !specs[k]) continue;
            var s = specs[k], sc = FORM[s.form] || FORM[s.family] || 0;
            if (sc > bs) { bs = sc; best = k; }
          }
          return best >= 0 ? best : y === 0 ? 1 : 0;
        }
        function w1Shot(o) {
          o = o || {};
          var len = num(o.len, 3.5), r = S.R, k = r ? (isFinite(o.feature) && o.feature >= 0 && o.feature < r.S.cars.length ? o.feature | 0 : featured(r)) : 0;
          var sh = { id: 'W1', cut: 'W1', len: len, car: k };
          sh.enter = function () {
            var s = r && r.cfg && r.cfg.specs ? r.cfg.specs[k] : null;
            if (s) page('agent', { id: s.id, n: k, slot: k + 1, name: s.name, tla: s.tla });
            if (!(o.stage && typeof o.stage.body === 'function')) page('fallback', { what: 'seated', shot: 'W1' });
          };
          sh.pose = function (K, dt) {
            var rr = S.R; if (!rr || !rr.S.cars[k]) return false;
            resetW(); W.near = 0.1;
            var c = rr.S.cars[k], hs = sin(c.h), hc = cos(c.h), u = sstep(0, len, sh.t) * 0.4 + 0.6 * clamp(sh.t / len, 0, 1);
            // walking along the car's pit side (its left), helmet height, from ahead of the nose to its cockpit
            var side = -2.7, zf = lerp(4.6, 0.2, u), y = 1.15;
            W.p[0] = c.x + hc * side + hs * zf; W.p[1] = c.y + y; W.p[2] = c.z + hs * side - hc * zf;
            // the helmet (car frame (0, 0.85, 0.35)), led a little toward the lens's way
            var hz = 0.35 + (zf - 0.35) * 0.08;
            W.l[0] = c.x + hs * hz; W.l[1] = c.y + 0.82; W.l[2] = c.z - hc * hz;
            var tall = K.aspect < 1;
            W.fov = tall ? fovFit(K, 13 * DEG, 18 * DEG, 30, 70) : 36;
            W.drift = DRIFT;
            return true;
          };
          return sh;
        }
        // G1: your car in its box, a slow 1.5 m dolly toward it (upright: a vertical push-in from ahead and above)
        function g1Shot(o) {
          o = o || {};
          var len = num(o.len, 2), r = S.R, y = r ? (isFinite(o.you) && o.you >= 0 && o.you < r.S.cars.length ? o.you | 0 : youOf(r) >= 0 ? youOf(r) : (typeof r.focus === 'function' ? r.focus() : 0)) : 0;
          var sh = { id: 'G1', cut: 'G1', len: len, car: y }, P0 = [0, 0, 0], P1 = [0, 0, 0], L0 = [0, 0, 0], DV = [0, 0, 0], BOXP = [];
          sh.pose = function (K, dt) {
            var rr = S.R; if (!rr || !rr.S.cars[y]) return false;
            resetW(); W.near = 0.1;
            var c = rr.S.cars[y], hs = sin(c.h), hc = cos(c.h), tall = K.aspect < 1;
            var col = c.lat != null ? (c.lat >= 0 ? 1 : -1) : 1;      // the open side: away from the other column
            // a front three-quarter, low (upright: from ahead and above, a vertical push-in)
            var sx = tall ? col * 1.2 : col * 4.2, sy = tall ? 2.4 : 1.15, sz = tall ? 8.2 : 6.6;
            P0[0] = c.x + hc * sx + hs * sz; P0[1] = c.y + sy; P0[2] = c.z + hs * sx - hc * sz;
            var az = tall ? 0.4 : 0.3; L0[0] = c.x + hs * az; L0[1] = c.y + 0.45; L0[2] = c.z - hc * az;
            look(K, P0, L0, DV);
            P1[0] = P0[0] + DV[0] * 1.5; P1[1] = P0[1] + DV[1] * 1.5; P1[2] = P0[2] + DV[2] * 1.5;
            var push = 1.5 * sstep(0, len, sh.t);
            W.p[0] = P0[0] + DV[0] * push; W.p[1] = P0[1] + DV[1] * push; W.p[2] = P0[2] + DV[2] * push;
            carBoxPts(rr, y, BOXP);
            // the lens that holds the whole car from the dolly's end (6 % margins), kept for the whole move
            if (sh.fov == null || sh.aspect !== K.aspect) { fitPts(K, P1, BOXP, 0.08, 18, 80); sh.fov = W.fov; sh.aspect = K.aspect; }
            fitPts(K, W.p, BOXP, 0.08, 18, 80); W.fov = sh.fov;
            W.drift = DRIFT * 0.4;
            return true;
          };
          return sh;
        }
        // X05: the glide from the TV lens into the player's view, no cut: an arc up and round behind the car (a quadratic
        // Bezier lifted 1.6 m, walked at an even pace along its length), eased with a smoothstep over 1.5 s; the look and
        // the lens blend the same way; the view's rest pose is the target every frame (cam.rest), so a car that moves
        // keeps the target true. At the end the player's view takes over at that same pose, the latch goes on (no TV
        // until his flag) and the page hears `handoff`
        function handoffShot(o) {
          o = o || {};
          var len = num(o.len, 1.5), mode = o.mode || null, A0 = null, REST = {}, BZ = [], AL = [], Q0 = new X3.Quaternion(), Q1 = new X3.Quaternion(), QQ = new X3.Quaternion(), QO = [0, 0, 0, 1];
          var sh = { id: 'handoff', cut: 'handoff', len: len };
          sh.enter = function () {
            K0.updateMatrixWorld(); K0.getWorldDirection(QV);
            A0 = { p: [K0.position.x, K0.position.y, K0.position.z], l: [K0.position.x + QV.x * 10, K0.position.y + QV.y * 10, K0.position.z + QV.z * 10], up: [K0.up.x, K0.up.y, K0.up.z], fov: K0.fov, near: K0.near };
            Q0.copy(K0.quaternion);
            if (!mode) { var m0 = CAMV.untv(); mode = m0; CAMV.mode('tv', false); }
          };
          sh.pose = function (K, dt, F) {
            if (!A0 || !F) return false;
            var Rp = CAMV.rest(F, mode, REST); if (!Rp) return false;
            resetW();
            var s = sstep(0, 1, sh.t / len);
            // the path: P0 -> P1 over a control point lifted and set out from the car's axis
            var P0 = A0.p, P1 = Rp.p, mx = (P0[0] + P1[0]) / 2, my = (P0[1] + P1[1]) / 2, mz = (P0[2] + P1[2]) / 2;
            var ox = mx - F.x, oz = mz - F.z, ol = sqrt(ox * ox + oz * oz) || 1, Cx = mx + ox / ol * 1.2, Cy = max(my, P1[1]) + 1.6, Cz = mz + oz / ol * 1.2;
            // its length table, then the point at the eased share of that length (an even pace: no jump)
            BZ.length = 0; AL.length = 0; var tot = 0, px = P0[0], py = P0[1], pz = P0[2];
            for (var i = 0; i <= 32; i++) {
              var u = i / 32, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
              var qx = a * P0[0] + b * Cx + c * P1[0], qy = a * P0[1] + b * Cy + c * P1[1], qz = a * P0[2] + b * Cz + c * P1[2];
              if (i) tot += sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py) + (qz - pz) * (qz - pz));
              BZ.push(qx, qy, qz); AL.push(tot); px = qx; py = qy; pz = qz;
            }
            var goal = s * tot, j = 1; while (j < 32 && AL[j] < goal) j++;
            var f = AL[j] > AL[j - 1] ? (goal - AL[j - 1]) / (AL[j] - AL[j - 1]) : 0;
            W.p[0] = lerp(BZ[(j - 1) * 3], BZ[j * 3], f); W.p[1] = lerp(BZ[(j - 1) * 3 + 1], BZ[j * 3 + 1], f); W.p[2] = lerp(BZ[(j - 1) * 3 + 2], BZ[j * 3 + 2], f);
            if (s >= 1) { W.p[0] = P1[0]; W.p[1] = P1[1]; W.p[2] = P1[2]; }
            // the turn: the TV lens's orientation to the view's, the short way round, at the same eased share
            Q1.set(Rp.q[0], Rp.q[1], Rp.q[2], Rp.q[3]); QQ.copy(Q0).slerp(Q1, s);
            QO[0] = QQ.x; QO[1] = QQ.y; QO[2] = QQ.z; QO[3] = QQ.w; W.q = QO;
            for (var k = 0; k < 3; k++) { W.l[k] = lerp(A0.l[k], Rp.l[k], s); W.up[k] = lerp(A0.up[k], Rp.up[k], s); }
            W.fov = lerp(A0.fov, Rp.fov, s); W.near = lerp(A0.near, Rp.near, s);
            return true;
          };
          sh.finish = function () {
            // the player's view takes the camera at the glide's last pose, and keeps it until his flag
            CAMV.untv(); CAMV.mode(mode, false); CAMV.hand(true); S.handed = true;
            page('handoff', { mode: mode });
          };
          return sh;
        }

        // ---- after the player's flag (X16): his crossing replayed at 0.5x from the line's camera with the flag-waver
        // in the foreground (2.4 s: the race from 0.7 s before the line to 0.5 s after), then the cool-down live from
        // high on the grandstand (2.0 s), following him as he slows
        function replayShot(id, cut, cam, rt0, rt1, rate, src, o) {
          o = o || {};
          var sh = { id: id, cut: cut, cam: cam, len: (rt1 - rt0) / rate, rt: rt0, rt0: rt0, rate: rate, src: src, first: !!o.first, wipe: !!o.wipe, event: o.event || null };
          sh.subject = o.subject != null ? o.subject : youOf(S.R);
          sh.pose = o.pose || function (K, dt) {
            var r = S.R; if (!r) return false;
            resetW();
            src.sample(camRT(sh), sh.subject, QC); set3(CARP, QC.x + sin(QC.h) * QC.v * 0.1, QC.y + 0.6, QC.z - cos(QC.h) * QC.v * 0.1);
            if (o.fg) {
              // the lens on the gantry past the line, looking back up the straight: the flag-waver in the foreground and the
              // car coming at it; once the car is past the lens's side the aim holds and the car leaves the picture
              W.p[0] = o.fg.cam[0]; W.p[1] = o.fg.cam[1]; W.p[2] = o.fg.cam[2];
              var fdx = o.fg.at[0] - W.p[0], fdz = o.fg.at[2] - W.p[2], cdx = CARP[0] - W.p[0], cdz = CARP[2] - W.p[2], fl = sqrt(fdx * fdx + fdz * fdz) || 1, cl = sqrt(cdx * cdx + cdz * cdz) || 1;
              if ((fdx * cdx + fdz * cdz) / (fl * cl) > 0.2 || !sh.aim) {
                sh.aim = sh.aim || [0, 0, 0]; fitPts(K, W.p, [CARP, o.fg.at, [o.fg.at[0], o.fg.at[1] - 1.8, o.fg.at[2]], [CARP[0], CARP[1] + 0.8, CARP[2]]], 0.1, 24, 75);
                sh.aim[0] = W.l[0]; sh.aim[1] = W.l[1]; sh.aim[2] = W.l[2]; sh.fov = W.fov; W.wL = 0; W.lamF = 0;
              } else { W.l[0] = sh.aim[0]; W.l[1] = sh.aim[1]; W.l[2] = sh.aim[2]; W.fov = sh.fov; W.wL = 0; W.lamF = 0; }
            } else { W.p[0] = cam.p[0]; W.p[1] = cam.p[1]; W.p[2] = cam.p[2]; holdOn(K, W.p, CARP, o.rad || 4, 0.42, cam.fov[0], cam.fov[1]); W.wL = 6; W.lamF = 4; if (cam.low) W.near = 0.1; }
            return true;
          };
          return sh;
        }
        function flagSeq(o) {
          var r = S.R, y = youOf(r); if (!r || y < 0) return null;
          var c = r.S.cars[y], tf = S.finT != null ? S.finT : c.fin ? (r.S.race && r.S.race.goT != null && c.raceT ? r.S.race.goT + c.raceT : null) : null;
          var list = [], lineCam = BYID.C19 || camOf({ id: 'C19', kind: 'fixed', d: 0, lat: -(walls(0).left + 0.2), up: 4.5 }, 0), high = BYID.C2 || camOf({ id: 'C2', kind: 'fixed', d: 60, lat: walls(60).right + 30, up: 30, range: 460 }, 0);
          var src = tape && tf != null ? tape.source(tf - 1.0, tf + 0.2) : null;
          if (src) {
            // the flag-waver's place (the stage's, when C2 builds one; a stand-in on the pit wall gantry) and the lens
            // 6 m back along the gantry, behind and over him
            var at = o && o.stage && typeof o.stage.spot === 'function' ? v3(o.stage.spot('flag')) : null;
            if (!at) at = tp(2.5, -(walls(2.5).left - 0.5), 5.6);
            var cp = tp(14, -(walls(14).left + 0.6), 6.4);
            list.push(replayShot('flag', 'flag', lineCam, tf - 1.0, tf + 0.2, 0.5, src, { first: true, fg: { cam: cp, at: at }, event: { e: 'finish', t: tf } }));
          } else page('fallback', { what: 'flag-replay', shot: 'flag' });
          list.push(liveShot('flag', high, 2.0, { car: y, rad: 6 }));
          list[list.length - 1].cut = 'cool-down';
          return list;
        }

        // ---- THE MOMENT (X32): three cuts from the tape round the picked event: the approach on a long lens (3 s at 1x),
        // the stop at 0.35x from low at the corner (1.2 s of the race in 3.43 s), the exit on the player's own T-cam
        // looking back at the agent he passed (2.5 s at 1x); a gold-line wipe at each cut
        function momentSeq(o) {
          var r = S.R, y = youOf(r), e = o && o.event, et = e && isFinite(e.t) ? +e.t : o && isFinite(o.t) ? +o.t : NaN;
          if (!r || y < 0 || !e || !isFinite(et) || !tape) return null;
          var te = et;
          if (e.e === 'lap') {
            // (a lap: its tunnel exit, the window kept as the lap crossed it)
            var kw = tape.keeps().filter(function (K) { return K.tag === 'fallback-' + e.lap; })[0];
            if (!kw) { page('fallback', { what: 'moment-lap', shot: 'moment' }); return null; }
            // (the slow cut straddles the portal: 0.6 s either side of the exit)
            te = kw.t + 0.6;
          } else if (isFinite(e.at)) te = +e.at;
          else if (e.e === 'overtake' || e.e === 'pass') te = swapT(e, et, y);
          var t0 = te - 4.2, t1 = te + 2.5, src = tape.source(t0, t1);
          if (!src || tape.missing(t0, t1) !== 0) { page('fallback', { what: 'moment-tape', shot: 'moment' }); return null; }
          var other = e.e === 'lap' ? -1 : e.passed != null && e.passed >= 0 ? e.passed : e.b != null && e.a === y ? e.b : e.a != null && e.a !== y ? e.a : -1;
          // the car's place at the three cuts' middles, for the cameras by coverage
          src.sample(te - 2.7, y, QC); var d1 = nearestD([QC.x, QC.y, QC.z]);
          src.sample(te - 0.6, y, QC); var d2 = nearestD([QC.x, QC.y, QC.z]);
          // cut 1: the camera that sees the most of the approach, ahead of the car preferred (a long lens head-on)
          var c1 = null, s1 = -1;
          CAMS.forEach(function (c) {
            if (c.kind === 'heli' || c.low) return;
            var n = 0; for (var k = 0; k <= 6; k++) { src.sample(t0 + k * 0.5, y, QD); if (covers(c, nearestD([QD.x, QD.y, QD.z]))) n++; }
            var sc = n / 7 + (rel(c.d, d1) > 0 ? 0.3 : 0) + (c.fov[0] < 6 ? 0.1 : 0);
            if (n >= 4 && sc > s1) { s1 = sc; c1 = c; }
          });
          if (!c1) { var da = wrap(d1 + 110), wa = walls(da); c1 = camOf({ id: 'auto', kind: 'fixed', d: da, lat: -((wa.left) + 4), up: 3, range: 300, fov: [3, 40] }, 0); }
          // cut 2: low at the corner nearest the stop (an apex camera), else a low pole just past it
          var c2 = null, best = 1e9;
          CAMS.forEach(function (c) { if (!c.low) return; var dd = abs(rel(c.d, d2)); if (dd < 130 && dd < best && covers(c, d2)) { best = dd; c2 = c; } });
          // (a tunnel's exit: the camera that looks back into its mouth, when it sees the car there)
          if (e.e === 'lap' && BYID.C12 && covers(BYID.C12, d2)) c2 = BYID.C12;
          if (!c2) {
            // (I, M2 round 2: a low pole that sees the car at the stop, past the walls: 18 m on, either side, kerb height or
            // just over the barrier; the first that sees it, else the last tried)
            src.sample(te - 0.6, y, QD); var cq = [QD.x, QD.y + 0.5, QD.z];
            [[18, 1, 0.7], [18, -1, 0.7], [18, 1, 1.4], [18, -1, 1.4], [-14, 1, 1.4], [-14, -1, 1.4], [30, 1, 2.2], [30, -1, 2.2]].some(function (o3) {
              var db = wrap(d2 + o3[0]), wb = walls(db), cc = camOf({ id: 'auto-low', kind: 'fixed', d: db, lat: o3[1] > 0 ? wb.right - 0.6 : -(wb.left - 0.6), up: o3[2], range: 160 }, 0);
              c2 = cc; return sees(cc.p, cq);
            });
          }
          var list = [];
          list.push(replayShot('moment', 'moment-1', c1, t0, te - 1.2, 1, src, { first: true, wipe: true, event: e }));
          list.push(replayShot('moment', 'moment-2', c2, te - 1.2, te, 0.35, src, { wipe: true, event: e, rad: 3.5 }));
          // cut 3: the T-cam, turned round: from over the airbox, looking back down the car at the one he passed
          var c3 = replayShot('moment', 'moment-3', { id: 'tcam-back', p: [0, 0, 0], fov: [40, 70] }, te, t1, 1, src, { wipe: true, event: e });
          c3.pose = function (K, dt) {
            resetW(); W.near = 0.15;
            var rt3 = camRT(c3); src.sample(rt3, y, QC);
            var hs = sin(QC.h), hc = cos(QC.h);
            W.p[0] = QC.x + hs * 0.05; W.p[1] = QC.y + 1.28; W.p[2] = QC.z - hc * 0.05;
            // (the head turned to the agent passed, alongside or behind; with none, straight back down the road)
            if (other >= 0) { src.sample(rt3, other, QD); W.l[0] = QD.x - hs * 1.5; W.l[1] = QD.y + 0.45; W.l[2] = QD.z + hc * 1.5; }
            else { W.l[0] = QC.x - hs * 30; W.l[1] = QC.y + 0.2; W.l[2] = QC.z + hc * 30; }
            W.fov = fovFit(K, 36 * DEG, 24 * DEG, 46, 80); W.wL = 7;
            return true;
          };
          list.push(c3);
          return list;
        }

        function swapT(e, et, y) {
          var o2 = e.passed, fb = et - (e.e === 'pass' ? 2 : 1);
          if (!(o2 >= 0) || !tape.has(et - 4, et)) return fb;
          var A = {}, Bq = {};
          for (var t = et; t >= et - 4; t -= 1 / 30) {
            tape.sample(t, y, A, et - 4, et); tape.sample(t, o2, Bq, et - 4, et);
            var da = nearestD([A.x, A.y, A.z]), db = nearestD([Bq.x, Bq.y, Bq.z]);
            if (rel(da, db) < 0) return t + 1 / 60;
          }
          return fb;
        }
        // ---- the podium (X33): the five shots round the podium (finish-and-loop 4.2: the track frame at the line, the
        // podium on the pit building's face over the pit lane, facing the grandstand); C2's stage, when it is in the tree,
        // gives the anchor, the three places and the helmets (a cut-swap: on in PD-A, off from PD-C)
        function podiumSeq(o) {
          o = o || {};
          var St = o.stage && typeof o.stage === 'object' ? o.stage : null, long = num(o.len, num(o.length, 15)) > 10;
          var an = St && typeof St.anchor === 'function' ? St.anchor() : null, PD = LOOK.podium || {};
          var ad = an && isFinite(an.d) ? +an.d : num(PD.d, 0), alat = an && isFinite(an.lat) ? +an.lat : num(PD.lat, -17), aup = an && isFinite(an.up) ? +an.up : num(PD.up, 9);
          if (!an && !LOOK.podium) page('fallback', { what: 'podium-stage', shot: 'podium' });
          var A = tp(ad, alat, aup);
          function spot(k) { var s = St && typeof St.spot === 'function' ? v3(St.spot(k)) : null; return s || tp(ad + (k === 1 ? 0 : k === 2 ? -2.4 : 2.4), alat - 4, aup + (k === 1 ? 0.5 : k === 2 ? 0.25 : 0)); }
          function helmets(on) { if (St && typeof St.helmets === 'function') { try { St.helmets(on); } catch (e) {} } }
          function at(id, len, fn, enter) { var sh = { id: 'podium', cut: id, len: len }; sh.pose = function (K, dt) { resetW(); fn(K, dt, sh); return true; }; sh.enter = enter || null; return sh; }
          var list = [];
          // PD-D: the helicopter over the marina, 220 m out and 120 m up, circling, the podium's light in frame
          list.push(at('PD-D', long ? 3 : 2, function (K, dt, sh) {
            var a = 0.9 + sh.t * 0.075 * (RM ? 0.5 : 1); W.p[0] = A[0] + sin(a) * 220; W.p[1] = A[1] + 120; W.p[2] = A[2] + cos(a) * 220;
            holdOn(K, W.p, [A[0], A[1] + 15, A[2]], 70, 0.6, 18, 70); W.near = 1; W.far = 2500;
          }, function () { helmets(true); }));
          // PD-A: the reverse wide from behind the podium, over the agents' backs at the crowd and the grandstand
          list.push(at('PD-A', long ? 4 : 3, function (K, dt, sh) {
            tp(ad, alat - 19, aup + 5, W.p); tp(ad, alat + 30, aup + 2, W.l); W.fov = K.aspect < 1 ? fovFit(K, 30 * DEG, 30 * DEG, 50, 90) : 60; W.drift = DRIFT * 0.5;
          }));
          if (long) {
            // PD-C: P1 close on a long lens; helmets off (the cut-swap)
            list.push(at('PD-C', 3, function (K, dt, sh) {
              var p1 = spot(1); tp(ad + 2, alat + 1, aup + 1.5, W.p); W.l[0] = p1[0]; W.l[1] = p1[1] + 1.6; W.l[2] = p1[2]; W.fov = K.aspect < 1 ? fovFit(K, 9 * DEG, 15 * DEG, 24, 60) : 30; W.drift = DRIFT;
            }, function () { helmets(false); }));
          }
          // PD-B: the front medium, over the crowd, back at the podium (the trophy, the cork, the foam)
          list.push(at('PD-B', long ? 4 : 3, function (K, dt, sh) {
            tp(ad, alat + 27, aup + 1, W.p); var p1 = spot(1); W.l[0] = A[0]; W.l[1] = p1[1] + 1.2; W.l[2] = A[2]; W.fov = K.aspect < 1 ? fovFit(K, 16 * DEG, 20 * DEG, 30, 80) : 34; W.drift = DRIFT * 0.6;
          }, long ? null : function () { helmets(false); }));
          if (long) {
            // PD-E: the postcard from the water, the fireworks mirrored, the pit building and the skyline behind
            list.push(at('PD-E', 1, function (K, dt, sh) {
              tp(ad - 20, alat + 150, 2, W.p); W.l[0] = A[0]; W.l[1] = A[1] + 18; W.l[2] = A[2]; W.fov = K.aspect < 1 ? 70 : 46; W.far = 2500;
            }));
          }
          return list;
        }

        /* ------------------------------------------------------------------------------ the API -- */
        function play(id, o) {
          o = o || {};
          var r = R();
          if (r !== S.R) newRace(r);
          if (SHOTS.indexOf(id) < 0) return false;
          // the rule: no TV shot of any kind while the player races (from the hand-off until his flag)
          if (racingNow(r) && id !== 'flag' && id !== 'moment' && id !== 'podium') { S.refused++; return false; }
          if ((id === 'flag' || id === 'moment' || id === 'podium') && r && r.human >= 0 && !finished(r)) { S.refused++; return false; }
          var list = null;
          if (id === 'demo') { if (!r || !spectating(r)) { S.refused++; return false; } S.demo = true; S.noAuto = null; list = [demoShot(r)]; }
          else if (id === 'H1') list = [h1Shot(o)];
          else if (id === 'G0') list = r ? [g0Shot(o)] : null;
          else if (id === 'W1') list = r ? [w1Shot(o)] : null;
          else if (id === 'G1') list = r ? [g1Shot(o)] : null;
          else if (id === 'handoff') list = [handoffShot(o)];
          else if (id === 'flag') list = flagSeq(o);
          else if (id === 'moment') list = momentSeq(o);
          else if (id === 'podium') list = podiumSeq(o);
          if (!list || !list.length) return false;
          if (id !== 'demo') S.demo = false;
          if (!want(true)) { S.refused++; return false; }
          S.queue = [];
          seq(list, typeof o.done === 'function' ? o.done : null);
          return true;
        }
        function frame(K, F, info, dt) {
          var r = S.R;
          if (!S.shot) {
            // nothing asked for: a spectator (the demo, an all-agent race) gets the demo's cycle
            if (r && spectating(r) && !racingNow(r)) { S.demo = true; cutTo(demoShot(r)); }
            else return false;
          }
          if (racingNow(r) && S.shot.id !== 'handoff') { S.refused++; end(); return false; }
          var ok = false;
          try { ok = S.shot.pose(K, dt, F); } catch (e) { warn('Grand Prix: the TV shot ' + S.shot.cut + ' failed: ' + (e && e.message || e)); ok = false; }
          if (!ok) return false;
          apply(K, dt);
          return true;
        }
        function tick(dt, F, info) {
          var r = R();
          if (r !== S.R) newRace(r);
          // the clock: frozen while the race is paused (the race clock stands still mid-race)
          var simT = r ? r.S.t : null, live = !!(r && typeof r.started === 'function' && r.started() && r.S.phase !== 'done');
          S.still = live && S.simT != null && simT === S.simT ? (S.still || 0) + dt : 0;
          S.paused = !!(S.pausedByPage || S.still > 0.1);
          S.simT = simT;
          var dts = S.paused ? 0 : dt;
          S.clock += dts; S.ticks = (S.ticks || 0) + 1;
          // the tape: every car at 30 Hz from the start of a player's race; the player's tunnel exit kept each lap (the
          // lonely race's fallback moment)
          if (tape && r && typeof r.started === 'function' && r.started()) {
            tape.record(r.S.t, r.S.cars);
            var yc = youOf(r) >= 0 ? r.S.cars[youOf(r)] : null;
            if (TUN && yc && !yc.fin && S.go) {
              var crossed = S.yd != null && rel(yc.d, TUN[1]) >= 0 && rel(S.yd, TUN[1]) < 0 && abs(rel(yc.d, S.yd)) < 50;
              if (crossed) tape.keep(r.S.t, 10, { e: 'tunnel', t: r.S.t, car: youOf(r), lap: (yc.lap | 0) + 1 }, 'fallback-' + ((yc.lap | 0) + 1), AFTER + 1);
              S.yd = yc.d;
            }
          }
          // the demo films itself (E's page flow says when the demo runs, gp.js startDemo)
          if (!S.shot && r && r.demo && S.noAuto !== r && CAMV.mode() !== 'tv' && !(info && info.racing)) { if (CAMV.mode('tv', false) === 'tv') { S.demo = true; cutTo(demoShot(r)); } }
          else if (S.shot && S.shot.id === 'demo' && CAMV.mode() !== 'tv') { S.noAuto = r; end(false); }
          stepWipe(dt);
          var sh = S.shot; if (!sh) return;
          sh.t += dts;
          if (sh.rt != null) sh.rt = min(sh.rt0 + sh.t * sh.rate, sh.rt0 + sh.len * sh.rate);
          if (sh.t >= sh.len && !sh.fired) {
            sh.fired = true;
            if (sh.finish) { var f = sh.finish; sh.finish = null; f(); }
            if (sh.id === 'handoff') { var d0 = sh.done; S.shot = null; S.queue = []; if (d0) try { d0(); } catch (e) {} return; }
            if (sh.id === 'demo') { var rr = S.R; if (rr && spectating(rr)) cutTo(demoShot(rr), sh.t - sh.len); return; }
            if (S.queue.length) { next(sh.t - sh.len); return; }
            sh.holding = true;
            if (sh.done) { var dn = sh.done; sh.done = null; try { dn(); } catch (e) { warn('Grand Prix: a shot\'s done() failed: ' + (e && e.message || e)); } }
          }
        }
        function event(e) {
          if (!e || typeof e.e !== 'string') return;
          var r = S.R; if (!r) return;
          var y = youOf(r);
          if (e.e === 'go') S.go = true;
          if (y >= 0 && e.e === 'go' && !S.handed) { S.handed = true; CAMV.hand(true); }
          if (y >= 0 && e.e === 'finish' && e.car === y) { S.handed = false; S.finT = +e.t; CAMV.hand(false); }
          if (e.e === 'end') { S.handed = false; CAMV.hand(false); }
          if (tape && y >= 0) {
            var sc = tape.score(e, r);
            if (sc >= 60) tape.keep(+e.t, sc, e);
            // the fallback, a lonely race's: the player's tunnel exit (kept as each lap crosses it, in tick()); a lap that
            // is not the best so far drops its own, a new best drops the others
            if (TUN && e.e === 'lap' && e.car === y && e.lap != null) {
              var best = e.best == null || e.time == null || e.time <= e.best + 1e-6;
              if (best) for (var q = 1; q <= 9; q++) { if (q !== e.lap) tape.drop('fallback-' + q); }
              else tape.drop('fallback-' + e.lap);
            }
          }
        }
        function project(p) {
          var v = v3(p); if (!v) return null;
          K0.updateMatrixWorld(); K0.matrixWorldInverse.copy(K0.matrixWorld).invert();
          QV.set(v[0], v[1], v[2]).applyMatrix4(K0.matrixWorldInverse);
          var front = QV.z < 0;
          QV.set(v[0], v[1], v[2]).project(K0);
          var w = PG.win && PG.win.innerWidth || 1280, h = PG.win && PG.win.innerHeight || Math.round(1280 / max(0.2, K0.aspect));
          return { x: (QV.x + 1) / 2 * w, y: (1 - QV.y) / 2 * h, on: front && abs(QV.x) <= 1 && abs(QV.y) <= 1, ndc: [QV.x, QV.y, QV.z] };
        }
        // the replay's view for the car view: R's shape (S.cars, cfg, human, focus()), the cars where the tape had them
        function view() {
          var sh = S.shot, r = S.R; if (!sh || sh.rt == null || !r || !sh.src) return null;
          if (!S.view || S.view.R !== r) {
            var cars = r.S.cars.map(function (c, i) { return { n: i, spec: c.spec, x: c.x, y: c.y, z: c.z, px: c.x, py: c.y, pz: c.z, h: c.h, ph: c.h, pitch: 0, roll: 0, v: 0, steerAngle: 0, wheelAngle: 0, d: 0, lat: 0, rpm: 0, thr: 0, brk: 0, gear: 0, scuff: 0, fin: c.fin, held: false }; });
            S.view = { R: r, v: { S: { cars: cars, t: 0, phase: 'race' }, cfg: r.cfg, human: r.human, seed: r.seed, demo: r.demo, focus: function () { return S.view && S.view.focus != null ? S.view.focus : r.human >= 0 ? r.human : 0; } }, focus: null };
          }
          var V = S.view.v; V.S.t = sh.rt; S.viewRT = sh.rt; S.viewAt = S.ticks; S.viewSh = sh;
          for (var i = 0; i < V.S.cars.length; i++) {
            var c = V.S.cars[i]; sh.src.sample(sh.rt, i, QC);
            c.x = c.px = QC.x; c.y = c.py = QC.y; c.z = c.pz = QC.z; c.h = c.ph = QC.h; c.pitch = QC.pitch; c.roll = QC.roll; c.v = QC.v; c.steerAngle = QC.steerAngle; c.wheelAngle = QC.wheelAngle;
            c.rpm = QC.rpm; c.thr = QC.thr; c.brk = QC.brk; c.gear = QC.gear; c.held = !!(QC.flags & 16);
          }
          S.view.focus = sh.subject != null && sh.subject >= 0 ? sh.subject : null;
          return V;
        }
        var D = {
          frame: frame, play: play, event: event, project: project, view: view, tape: null, crown: crown, cams: function () { return CAMS.map(function (c) { return { id: c.id, kind: c.kind, d: +c.d.toFixed(1), lat: +c.lat.toFixed(1), up: c.up, span: c.span ? [+c.span[0].toFixed(0), +c.span[1].toFixed(0)] : null, name: c.name }; }); },
          busy: function () { return !!S.shot; },
          stop: function () { if (S.shot && S.shot.id === 'demo') S.noAuto = S.R; end(); },
          replaying: function () { return !!(S.shot && S.shot.rt != null && S.shot.src); },
          // (E may drive the clock's pause: { paused: true } freezes the shots; the race clock standing still does too)
          update: function (dt, st) { S.pausedByPage = dt === 0 || !!(st && st.paused); },
          state: function () {
            var sh = S.shot;
            return { shot: sh ? sh.id : null, cut: sh ? sh.cut : null, t: sh ? +sh.t.toFixed(3) : 0, len: sh ? sh.len : 0, holding: !!(sh && sh.holding), queue: S.queue.length, rt: sh && sh.rt != null ? +sh.rt.toFixed(3) : null,
              handed: S.handed, demo: S.demo, battle: S.battle ? { a: S.battle.a, b: S.battle.b, g: +S.battle.g.toFixed(2) } : null, refused: S.refused, clock: +S.clock.toFixed(3), paused: S.paused,
              cams: CAMS.length, auto: !(Array.isArray(CA.tv) && CA.tv.length), tape: tape ? tape.stats() : null };
          },
          timeline: function (clear) { var l = S.log.slice(); if (clear) S.log = []; return l; },
          // the rig and the running shot's clock (shootout-camera's snapshot pattern): a page that borrows the lens and
          // gives it back resumes the shot where it was, with no jump
          snapshot: function () { return { rig: copy(RIG), shot: S.shot ? S.shot.cut : null, t: S.shot ? S.shot.t : 0, rt: S.shot && S.shot.rt != null ? S.shot.rt : null }; },
          restore: function (s) { if (!s || !s.rig) return false; for (var k in s.rig) RIG[k] = copy(s.rig[k]); if (S.shot && S.shot.cut === s.shot) { S.shot.t = s.t; if (s.rt != null && S.shot.rt != null) S.shot.rt = s.rt; } S.cut = false; return true; },
          dispose: function () { end(); try { CAMV.tick(null); } catch (e) {} if (S.wipe && S.wipe.el && S.wipe.el.parentNode) S.wipe.el.parentNode.removeChild(S.wipe.el); S.wipe = null; },
        };
        CAMV.tick(tick);
        if (typeof CAMV.bind === 'function') CAMV.bind({ race: function () { return S.R || R(); } });
        // (a handle for the tests, on the camera itself: the page's internals reach it, nothing else does)
        try { if (K0.userData) K0.userData.gpDirector = D; } catch (e) {}
        return D;
      }

      return { director: director, SHOTS: SHOTS, Tape: Tape };
    })();
