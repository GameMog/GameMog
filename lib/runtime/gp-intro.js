    /* ================================================================ Grand Prix: the intro (ARTIFICIAL1 M2, lane E) == */
    // gp-intro.js. Pasted into boot() by gp.js at /*@include gp-intro.js*/. ONE top-level binding, GpIntro; every
    // other name lives inside it, so nothing of v1's boot() is shadowed. VIEW: the page only through env (the root
    // element's document and its window), three.js through env.three or env['THREE'].
    //
    // The first minute (EXPERIENCE.md 2.2, X17 with X18, X28, X07, X12, X03, X05): sound first, the circuit lights up,
    // the grid, your car and your name, the glide into your hands, then HOLD and the lights. Once a session, skippable
    // (any key or tap); the lights are never skipped (D5). RACE AGAIN goes straight to the lights.
    //
    //   GpIntro.intro(env) -> I | null          null: no intro (gp.js goes from Play to the grid at once)
    //     env = { THREE, three, camera, root, cam /* the GpCam view */, director /* D | null */, T, cfg, quality, touch,
    //             reduced, warn, page(e, data) /* writes a page event, INTERFACES 8 M2 */, race() /* -> R */,
    //             kit() /* -> the look kit or null (C1: kit.ignite(u), kit.landmark(), kit.screen(id, canvas)) */ }
    //   I.play(variant, o) -> bool                'long' | 'returning' | 'race-again' | 'dare' | 'skip'; false: none
    //     o = { from, title, sub, tagline, kicker, landmark, slot, aids, device, you: { num, name, tag, team }, feature:
    //           { place, num, name, team, line, n }, dare: { name, place, from }, ready() -> bool,
    //           onHandoff(instant), onSkip(t), onHand(), onSeat() }
    //     onHandoff: the HUD builds (gp.js); onSkip: the race may be swapped for one with the skip's 2.0 s of revs
    //     (gp.js, at the dip's black); onHand: the race starts (R.start(): the rev phase, then the five lights)
    //   I.skip() -> bool,  I.active() -> bool,  I.update(dt, state, focus) -> { framed },  I.event(e),  I.pause(on),
    //   I.seat(text),  I.state() -> { variant, t, beat, ... },  I.dispose()
    //
    // The shots are the director's (gp-director.js, lane B): each beat asks D.play(id, o) and, when it answers true,
    // lets the camera's 'tv' mode ask D.frame. When there is no director, or it has no such shot, a plain stand-in
    // shot of this file's own frames the beat instead (a 'fallback' page event says so), so the timeline, the title,
    // the lower-thirds and the hand-off are real either way. Never OW.introSkip (the kart's tooling flag, which marks
    // the run assisted): the session's "once" is gp.js's own memory.
    var GpIntro = (function () {
      var PI = Math.PI, abs = Math.abs, min = Math.min, max = Math.max, sin = Math.sin, cos = Math.cos, tan = Math.tan, atan = Math.atan;
      var DEG = PI / 180;
      function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
      function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
      function str(s, d) { return typeof s === 'string' && s.trim() ? s.trim() : d; }
      function pageOf(env) {
        var doc = env.doc || (env.root && env.root.ownerDocument) || null;
        return { doc: doc, win: env.win || (doc && doc.defaultView) || null };
      }

      // the variants (EXPERIENCE.md 2.2): the beats [id, from, to] in seconds after the tap, the hand-off's end (the
      // first input), the rev phase before the first red light (the race's grid hold), and the title's moments
      //   long        the first race of a session: first input 17.5 s, lights out 24.7-27.5 s
      //   returning   (M3: the page forwards `seen`) first input 6.5 s, lights out 12.2-15.0 s
      //   race-again  none: chase on the grid with the HUD up, the first red light 1.2 s after the tap
      //   dare        (M2 behind a debug hook, M3 wires it) first input 11.5 s, lights out 17.2-20.0 s
      //   skip        a dip of 0.3 s, then chase with the HUD up, 2.0 s of revs, then the lights
      var VARIANTS = {
        long: { beats: [['dip', 0, 0.5], ['H1', 0.5, 7.5], ['G0', 7.5, 10.5], ['W1', 10.5, 14.0], ['G1', 14.0, 16.0], ['handoff', 16.0, 17.5]], end: 17.5, rev: 3.0,
          ignite: 1.5, meet: 4.5, crown: 5.0, title: [5.0, 7.5], tagline: [7.7, 9.5], engines: 7.5, w1: [10.8, 13.3], g1: [14.2, 15.9], hold: 1.5 },
        returning: { beats: [['dip', 0, 0.5], ['G0', 0.5, 3.5], ['G1', 3.5, 5.0], ['handoff', 5.0, 6.5]], end: 6.5, rev: 1.5,
          tagline: [0.7, 2.5], engines: 0.5, g1: [3.6, 4.9], hold: 0.5 },
        'race-again': { beats: [], end: 0, rev: 1.2 },
        dare: { beats: [['dip', 0, 0.5], ['H1', 0.5, 5.5], ['G0', 5.5, 8.0], ['G1', 8.0, 10.0], ['handoff', 10.0, 11.5]], end: 11.5, rev: 1.5,
          ignite: 0.5, meet: 3.5, crown: 4.0, title: [4.0, 5.5], tagline: [5.6, 7.4], engines: 5.5, g1: [8.1, 9.9], hold: 0.5 },
        skip: { beats: [['dip', 0, 0.3]], end: 0.3, rev: 2.0 },
      };
      var SKIP = { dip: 0.3, rev: 2.0 }, HOLDMAX = 8, HOLDCAP = 4, GOLD = '#E9B949';

      function intro(env) {
        var X3 = env.three || env['THREE'], cam = env.camera, T = env.T, cfg = env.cfg || {}, PG = pageOf(env), doc = PG.doc, win = PG.win, root = env.root;
        if (!X3 || !cam || !T || !doc || !root) return null;
        var warn = typeof env.warn === 'function' ? env.warn : function () {};
        var page = typeof env.page === 'function' ? env.page : function () {};
        var RM = !!env.reduced, FONT = str(env.theme && env.theme.font, 'Oxanium');
        var GLASS = 'background:linear-gradient(150deg,rgba(255,255,255,.15),rgba(255,255,255,.03) 62%) rgba(10,12,18,.34);' +
          '-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);' +
          'border:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 12px 32px rgba(0,0,0,.2)';
        var SAFE = { t: 'env(safe-area-inset-top,0px)', b: 'env(safe-area-inset-bottom,0px)', l: 'env(safe-area-inset-left,0px)', r: 'env(safe-area-inset-right,0px)' };
        var css = doc.createElement('style');
        css.textContent = [
          '#gm .gpi{position:absolute;inset:0;pointer-events:none;font-family:' + FONT + ',system-ui,sans-serif;color:#F4F6FA;display:none}',
          '#gm .gpi.on{display:block}',
          '#gm .gpi .dip{position:absolute;inset:0;background:#000;opacity:0}',
          // the title: its stop (the world's full stop, in gold) sits on the landmark's crown, the word typed in before it
          '#gm .gpi .ttl{position:absolute;left:0;top:0;white-space:nowrap;font-weight:600;letter-spacing:.03em;line-height:1;color:#fff;text-shadow:0 0 26px rgba(0,0,0,.55),0 2px 14px rgba(0,0,0,.5);opacity:0}',
          '#gm .gpi .ttl i{font-style:normal;visibility:hidden}#gm .gpi .ttl i.on{visibility:visible}',
          '#gm .gpi .ttl i.stop{color:' + GOLD + ';text-shadow:0 0 22px rgba(233,185,73,.85),0 0 4px rgba(233,185,73,.9)}',
          '#gm .gpi .sub{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:13px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;opacity:0;text-shadow:0 1px 10px rgba(0,0,0,.7);transition:opacity .5s}',
          '#gm .gpi .tag{position:absolute;left:50%;top:68%;transform:translate(-50%,-50%);width:max-content;max-width:92vw;text-align:center;opacity:0;transition:opacity .35s}',
          '#gm .gpi .tag b{display:block;font-size:46px;line-height:1.05;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-shadow:0 0 24px rgba(0,0,0,.6),0 2px 16px rgba(0,0,0,.5)}',
          '#gm .gpi .tag b em{font-style:normal;color:' + GOLD + '}',
          '#gm .gpi .tag small{display:block;margin-top:8px;font-size:12px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;opacity:.82}',
          // the lower-thirds (W1: the front row's agent; G1: your car), glass, over the bottom left
          '#gm .gpi .l3{position:absolute;left:calc(22px + ' + SAFE.l + ');bottom:calc(30px + ' + SAFE.b + ');' + GLASS + ';border-radius:16px;padding:9px 16px 10px;max-width:min(620px,calc(100vw - 44px));opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s}',
          '#gm .gpi .l3.on{opacity:1;transform:none}',
          '#gm .gpi .l3::before{content:"";position:absolute;left:16px;top:-1px;width:22px;height:2px;border-radius:2px;background:' + GOLD + ';box-shadow:0 0 10px rgba(233,185,73,.9)}',
          '#gm .gpi .l3 b{display:block;font-size:22px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
          '#gm .gpi .l3 b u{text-decoration:none;color:' + GOLD + '}',
          '#gm .gpi .l3 span{display:block;margin-top:4px;font-size:13.5px;line-height:1.35;font-weight:500;letter-spacing:.04em;opacity:.88}',
          // the skip pill, bottom right; the seat chip, top left (both tappable)
          '#gm .gpi .skip{position:absolute;right:calc(16px + ' + SAFE.r + ');bottom:calc(16px + ' + SAFE.b + ');' + GLASS + ';border-radius:999px;padding:7px 15px 8px;font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;opacity:0;transition:opacity .3s,padding .3s;pointer-events:auto}',
          '#gm .gpi .skip.on{opacity:.92}',
          '#gm .gpi .seat{position:absolute;left:calc(14px + ' + SAFE.l + ');top:calc(14px + ' + SAFE.t + ');' + GLASS + ';border-radius:999px;padding:7px 14px 8px;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;pointer-events:auto;cursor:pointer;opacity:0;transition:opacity .3s}',
          '#gm .gpi .seat.on{opacity:.95}#gm .gpi .seat i{font-style:normal;opacity:.7;margin-left:6px}',
          // the hold: after 4 s of waiting, a small caption and a thin gold line
          '#gm .gpi .wait{position:absolute;left:50%;bottom:calc(64px + ' + SAFE.b + ');transform:translateX(-50%);' + GLASS + ';border-radius:12px;padding:7px 16px 9px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:0;transition:opacity .4s}',
          '#gm .gpi .wait.on{opacity:.92}#gm .gpi .wait i{display:block;height:2px;margin-top:6px;border-radius:2px;background:' + GOLD + ';box-shadow:0 0 8px rgba(233,185,73,.8);width:0}',
          // phones: smaller type; the lower-third and the skip pill clear of each other
          '@media (max-width:760px),(max-height:500px){#gm .gpi .tag b{font-size:30px}#gm .gpi .l3 b{font-size:17px}#gm .gpi .l3 span{font-size:12.5px}#gm .gpi .sub{font-size:12px;letter-spacing:.1em}' +
            '#gm .gpi .l3{bottom:calc(64px + ' + SAFE.b + ');left:calc(14px + ' + SAFE.l + ');max-width:calc(100vw - 28px)}}',
          // (during the intro the race's controls and the pause button stay away: the skip and the seat are its only controls)
          '#gm.gpintro .tpad,#gm.gpintro .stick,#gm.gpintro .pause{display:none!important}',
          '@media (prefers-reduced-motion:reduce){#gm .gpi .l3{transform:none}}',
        ].join('\n');
        doc.head.appendChild(css);

        function mk(tag, cls, html, parent) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || root).appendChild(e); return e; }
        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
        var wrap = mk('div', 'gpi'), dip = mk('div', 'dip', '', wrap), ttl = mk('div', 'ttl', '', wrap), sub = mk('div', 'sub', '', wrap), tag = mk('div', 'tag', '<b></b><small></small>', wrap);
        var l3 = mk('div', 'l3', '<b></b><span></span>', wrap), skipEl = mk('div', 'skip', '', wrap), seatEl = mk('div', 'seat', '', wrap), waitEl = mk('div', 'wait', 'Bringing the grid out<i></i>', wrap);
        wrap.setAttribute('aria-live', 'polite'); dip.setAttribute('aria-hidden', 'true');
        var waitBar = waitEl.querySelector('i');
        // the seat chip opens the seat and the settings (gp.js: the sheet); the skip pill is a tap like any other
        seatEl.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (P && !P.done && !P.skipped && typeof P.o.onSeat === 'function') P.o.onSeat(); });

        // the state of a play: the variant, its clock (wall seconds since the tap, paused with the page), the beat
        var P = null;
        function fresh(variant, o) {
          var V = VARIANTS[variant];
          return { variant: variant, V: V, o: o || {}, t: 0, real: 0, beat: -1, shot: null, framed: false, fb: {}, sent: {}, held: 0, holding: false, skipped: null,
            paused: false, done: false, handed: false, glide: null, log: [], ign: 0, title: null, l3: null, tagShown: false, focusN: -1, endAt: V.end };
        }

        /* -------------------------------------------------------------------------------- the geometry -- */
        var V1 = new X3.Vector3(), V2 = new X3.Vector3(), V3 = new X3.Vector3(), Q0 = new X3.Quaternion(), Q1 = new X3.Quaternion(), PA = {}, PB = {};
        var EXT = null;
        // the lap's middle and reach (for the helicopter), once
        function extent() {
          if (EXT) return EXT;
          var sx = 0, sz = 0, sy = 0, n = 0, r = 0, step = max(1, Math.floor((T.n || 1) / 400));
          for (var i = 0; i < T.n; i += step) { sx += T.x[i]; sz += T.z[i]; sy += T.y ? T.y[i] : 0; n++; }
          var cx = sx / max(1, n), cz = sz / max(1, n), cy = sy / max(1, n);
          for (i = 0; i < T.n; i += step) r = max(r, Math.hypot(T.x[i] - cx, T.z[i] - cz));
          return (EXT = { x: cx, y: cy, z: cz, r: r });
        }
        // the landmark the title sits on: the world's gp.intro.landmark ({ x, y, z } or { d, lat, up }), else the
        // director's crown (the world's gp.cameras.look.spire, lane B), else the look kit's, else 140 m over the lap's middle
        function landmark(o) {
          var L = o && o.landmark;
          if (L && typeof L === 'object') {
            if (isFinite(+L.d)) { var p = T.posAt(+L.d, +L.lat || 0, +L.up || 0, {}); return new X3.Vector3(p.x, p.y, p.z); }
            if (isFinite(+L.x) && isFinite(+L.z)) return new X3.Vector3(+L.x, +L.y || 0, +L.z);
          }
          var D = env.director;
          if (D && typeof D.crown === 'function') { try { var c = D.crown(); if (c && isFinite(+c[0])) return new X3.Vector3(+c[0], +c[1], +c[2]); } catch (e) {} }
          var K = typeof env.kit === 'function' ? env.kit() : null;
          if (K && typeof K.landmark === 'function') { try { var k = K.landmark(); if (k && isFinite(+k.x)) return new X3.Vector3(+k.x, +k.y || 0, +k.z); } catch (e) {} }
          var E = extent(); return new X3.Vector3(E.x, E.y + 140, E.z);
        }
        // a lens given across (the horizontal field), as a vertical field for this screen's shape
        function vfov(across, lo, hi) { var a = 2 * atan(tan(across * DEG / 2) / max(0.2, cam.aspect)) / DEG; return clamp(a, lo || 12, hi || 100); }
        function setLens(f, near, far) { var ch = false; if (abs(cam.fov - f) > 0.01) { cam.fov = f; ch = true; } if (near && abs(cam.near - near) > 1e-4) { cam.near = near; ch = true; } if (far && abs(cam.far - far) > 1e-3) { cam.far = far; ch = true; } if (ch) cam.updateProjectionMatrix(); }
        function at(d, lat, up, out) { return T.posAt(T.wrap ? T.wrap(d) : d, lat || 0, up || 0, out || {}); }
        // a car of the race (its state row), by index
        function carRow(st, n) { return st && st.cars && n >= 0 && n < st.cars.length ? st.cars[n] : null; }

        /* ------------------------------------------------- the stand-in shots (no director, or no such shot) -- */
        // plain and honest: a slow helicopter over the lap with the landmark and the grid in one frame; a crane over the
        // back of the grid looking down it; a steadicam at helmet height on the front row's agent; a dolly on your car
        function fbH1(u, s, st) {
          var E = extent(), lm = P.lm, g = at(0, 0, 0, PA), gx = g.x, gz = g.z;
          var dx = gx - lm.x, dz = gz - lm.z, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          var D = 0.55 * dl + 160 + 0.15 * E.r, sw = (RM ? 0.5 : 1) * 50 * s / max(200, D), a0 = Math.atan2(dz, dx) - 0.35;
          var a = a0 + sw, cx = gx + cos(a) * D, cz = gz + sin(a) * D, cy = g.y + 115 - 25 * ease(u);
          cam.position.set(cx, cy, cz); cam.up.set(0, 1, 0);
          V1.set(gx + (lm.x - gx) * 0.55, g.y + 30, gz + (lm.z - gz) * 0.55); cam.lookAt(V1);
          setLens(vfov(64, 30, 95), 1, 6000);
        }
        function gridEnds(st) {
          // the back and the front of the grid as the race placed it (the cars' own d), else slots 8 m apart
          var lo = Infinity, hi = -Infinity, L = T.L;
          if (st && st.cars && st.cars.length) st.cars.forEach(function (c) { var r = c.d > L / 2 ? c.d - L : c.d; lo = min(lo, r); hi = max(hi, r); });
          if (!isFinite(lo)) { lo = -8 * 20; hi = -8; }
          return { back: lo, front: hi };
        }
        function fbG0(u, s, st) {
          var G = gridEnds(st), b = at(G.back - 16, 0, 22 + 2 * ease(u), PA), f = at(G.front + 18, 0, 1.5, PB);
          cam.position.set(b.x, b.y, b.z); cam.up.set(0, 1, 0); cam.lookAt(f.x, f.y, f.z);
          setLens(vfov(cam.aspect < 1 ? 46 : 62, 25, 90), 0.5, 3000);
        }
        function fbW1(u, s, st) {
          var c = carRow(st, P.featN); if (!c) return fbG0(u, s, st);
          var side = c.lat >= 0 ? 1 : -1, slide = (RM ? 0.5 : 1) * 1.6 * ease(u);
          var p = at(c.d + 4.6 - slide, c.lat + side * 2.2, 1.35, PA), q = at(c.d + 0.35, c.lat, 0.78, PB);
          var dr = RM ? 0 : 0.004 * sin(s * 1.7);
          cam.position.set(p.x, p.y + dr * 20, p.z); cam.up.set(0, 1, 0); cam.lookAt(q.x, q.y, q.z);
          setLens(vfov(cam.aspect < 1 ? 30 : 40, 18, 75), 0.2, 3000);
        }
        function fbG1(u, s, st, F) {
          var c = carRow(st, P.youN); if (!c) return fbG0(u, s, st);
          var side = c.lat >= 0 ? -1 : 1, dolly = 1.5 * ease(u);
          var p = at(c.d + 6.2 - dolly, c.lat + side * 3.3, 1.05, PA), q = at(c.d + 0.2, c.lat, 0.5, PB);
          cam.position.set(p.x, p.y, p.z); cam.up.set(0, 1, 0); cam.lookAt(q.x, q.y, q.z);
          setLens(vfov(cam.aspect < 1 ? 36 : 44, 20, 80), 0.2, 3000);
        }
        // the glide into the chase with no cut: the pose the beat ended on, eased into the camera's own chase pose (the
        // camera's springs run every frame of it, so the chase that follows starts from where the glide ends)
        function glide(dt, u, F, st) {
          var g = P.glide;
          if (!g) {
            g = P.glide = { p: cam.position.clone(), q: cam.quaternion.clone(), f: cam.fov, n: cam.near };
            if (env.cam && typeof env.cam.mode === 'function') { env.cam.mode(P.o.camMode || 'chase', false); if (typeof env.cam.reset === 'function') env.cam.reset(); }
          }
          if (env.cam && typeof env.cam.update === 'function' && F) env.cam.update(dt, F, { racing: false, phase: st ? st.phase : 'grid' });
          var k = ease(u);
          V2.copy(cam.position); Q1.copy(cam.quaternion); var fEnd = cam.fov, nEnd = cam.near;
          cam.position.lerpVectors(g.p, V2, k); Q0.copy(g.q).slerp(Q1, k); cam.quaternion.copy(Q0);
          setLens(g.f + (fEnd - g.f) * k, k >= 1 ? nEnd : min(g.n, nEnd));
        }

        /* ------------------------------------------------------------------------------------ the words -- */
        function titleOf(o) {
          var t = str(o.title, 'Grand Prix'), stop = /[.]$/.test(t) ? '.' : '';
          return { word: stop ? t.slice(0, -1) : t, stop: stop };
        }
        function buildTitle() {
          var tt = titleOf(P.o), html = '';
          for (var i = 0; i < tt.word.length; i++) html += '<i>' + esc(tt.word[i]) + '</i>';
          if (tt.stop) html += '<i class="stop">' + esc(tt.stop) + '</i>';
          ttl.innerHTML = html; ttl.style.fontSize = '64px'; ttl.style.opacity = '0';
          P.title = { chars: ttl.querySelectorAll('i'), n: tt.word.length + (tt.stop ? 1 : 0), stopEl: tt.stop ? ttl.querySelector('.stop') : null, fit: 0, x: 0, y: 0, off: false };
          sub.textContent = str(P.o.sub, '');
        }
        // the title's place: the stop's centre on the landmark's point on screen (the word typed in before it); off screen
        // or behind the lens, the title sits centred in the top third (a 'fallback' event says so once)
        function placeTitle() {
          var Tt = P.title; if (!Tt) return;
          var W = win.innerWidth || 1, H = win.innerHeight || 1;
          V3.copy(P.lm).project(cam);
          var on = V3.z < 1 && V3.z > -1 && abs(V3.x) <= 1 && abs(V3.y) <= 1;
          var sx = (V3.x + 1) / 2 * W, sy = (1 - V3.y) / 2 * H;
          // the size: the whole word left of the point, inside the screen (a phone held upright has little room)
          if (!Tt.fit) { var r0 = ttl.getBoundingClientRect(); Tt.fit = r0.width / 64 || 30; }
          var size = clamp(on ? (sx - 18) / Tt.fit : (W - 40) / Tt.fit, 22, W < 761 ? 46 : 72);
          ttl.style.fontSize = size.toFixed(1) + 'px';
          var tr = ttl.getBoundingClientRect(), ref = Tt.stopEl ? Tt.stopEl.getBoundingClientRect() : { left: tr.right - 4, width: 4, top: tr.top, height: tr.height };
          var ox = ref.left - tr.left + ref.width / 2, oy = ref.top - tr.top + ref.height * 0.78;
          if (!on) { if (!Tt.off) { Tt.off = true; page('fallback', { what: 'title off the landmark' }); } sx = W / 2 + (tr.width / 2 - ox); sy = H * 0.3; }
          var x = sx - ox, y = sy - oy;
          ttl.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
          Tt.x = sx; Tt.y = sy; Tt.on = on;
          // (the line under it, centred under the word, kept on the screen)
          var sw = sub.getBoundingClientRect().width;
          sub.style.left = clamp(x + tr.width / 2, sw / 2 + 10, W - sw / 2 - 10).toFixed(1) + 'px';
          sub.style.top = (y + tr.height + 10).toFixed(1) + 'px';
        }
        function lowerThird(kind) {
          var o = P.o, b = l3.querySelector('b'), s = l3.querySelector('span');
          if (kind === 'W1') {
            var f = o.feature || {};
            b.innerHTML = esc('P' + (f.place || 1)) + ' · ' + esc('#' + (f.num || '')) + ' <u>' + esc(String(f.name || '').toUpperCase()) + '</u>' + (f.team ? ' · ' + esc(f.team) : '');
            s.textContent = str(f.line, '');
          } else {
            var y = o.you || {};
            b.innerHTML = esc('#' + (y.num || '')) + ' · <u>' + esc(String(y.name || 'YOU').toUpperCase()) + '</u> · ' + esc(String(y.tag || 'DRIVEN BY YOU').toUpperCase());
            s.textContent = [y.team || '', 'STARTS P' + (o.slot || 20), o.aids === 'pro' ? 'PRO' : 'AIDS ON'].filter(Boolean).join(' · ');
          }
          P.l3 = { kind: kind, text: b.textContent + ' | ' + s.textContent };
        }
        // the name card for the pit roof's Screen 1 (the look kit's hook; nothing when the kit has none)
        var CARD = null;
        function nameCard() {
          var K = typeof env.kit === 'function' ? env.kit() : null;
          if (!K || typeof K.screen !== 'function') return false;
          try {
            if (!CARD) { CARD = doc.createElement('canvas'); CARD.width = 512; CARD.height = 256; }
            var g = CARD.getContext('2d'), y = P.o.you || {};
            g.fillStyle = '#07080B'; g.fillRect(0, 0, 512, 256);
            g.fillStyle = GOLD; g.fillRect(28, 40, 44, 5);
            g.fillStyle = '#ffffff'; g.font = '600 64px ' + FONT + ',sans-serif'; g.textBaseline = 'alphabetic';
            g.fillText('#' + (y.num || '') + ' ' + String(y.name || 'YOU').toUpperCase(), 28, 128);
            g.font = '600 26px ' + FONT + ',sans-serif'; g.fillStyle = 'rgba(255,255,255,.8)';
            g.fillText(String(y.tag || 'DRIVEN BY YOU').toUpperCase() + (y.team ? '  ·  ' + y.team : ''), 28, 182);
            K.screen('S1', CARD); return true;
          } catch (e) { return false; }
        }

        /* ---------------------------------------------------------------------------------- the flow -- */
        function beatAt(t) { var B = P.V.beats; for (var i = 0; i < B.length; i++) if (t >= B[i][1] - 1e-9 && t < B[i][2] - 1e-9) return i; return B.length ? B.length : -1; }
        function once(name, data) { if (P.sent[name]) return; P.sent[name] = true; data = data || {}; data.w = +P.real.toFixed(3); data.at = +P.t.toFixed(3); page(name, data); P.log.push({ e: name, w: data.w, t: data.at }); }
        function shotStart(id, st, F) {
          P.shot = id; P.framed = false;
          var D = env.director;
          if (id === 'dip') return;
          var ok = false;
          if (D && typeof D.play === 'function') {
            var Bt = P.V.beats[P.beat];
            try { ok = !!D.play(id, { variant: P.variant, state: st, focus: F, slot: P.o.slot, landmark: P.lm, feature: P.featN, you: P.youN, beat: Bt, len: Bt ? Bt[2] - Bt[1] : null, mode: P.o.camMode || 'chase', intro: true }); }
            catch (e) { warn('The Grand Prix intro: the director failed on ' + id + ' (' + (e && e.message || e) + ')'); ok = false; }
          }
          P.framed = ok;
          if (ok && env.cam && typeof env.cam.mode === 'function' && id !== 'handoff') env.cam.mode('tv', false);
          if (!ok && !P.fb[id]) { P.fb[id] = true; page('fallback', { what: 'shot ' + id, w: +P.real.toFixed(3) }); }
          // (the hand-off event is the director's when it glides; this file's when its own glide does)
          if (id === 'handoff') { if (!ok) once('handoff'); if (typeof P.o.onHandoff === 'function') P.o.onHandoff(false); }
        }
        function frame(dt, st, F) {
          var B = P.V.beats[P.beat]; if (!B) return false;
          // (s: seconds into the shot; the helicopter keeps flying through a hold)
          var id = B[0], u = (P.t - B[1]) / max(1e-6, B[2] - B[1]), s = P.t - B[1] + (id === 'H1' ? P.held : 0);
          if (id === 'dip') return false;
          if (P.framed) {
            if (id === 'handoff') {
              // (the director's glide: the camera's own update asks it; when it lets go, the chase has the camera)
              if (env.cam && typeof env.cam.update === 'function' && F) env.cam.update(dt, F, { racing: false, phase: st ? st.phase : 'grid', intro: true, shot: id });
              return true;
            }
            if (env.cam && typeof env.cam.update === 'function' && F) env.cam.update(dt, F, { racing: false, phase: 'intro', intro: true, shot: id });
            return true;
          }
          if (id === 'H1') fbH1(u, s, st);
          else if (id === 'G0') fbG0(u, s, st);
          else if (id === 'W1') fbW1(u, s, st);
          else if (id === 'G1') fbG1(u, s, st, F);
          else if (id === 'handoff') glide(dt, u, F, st);
          return true;
        }
        function words(st) {
          var V = P.V, t = P.t, o = P.o, held = RM ? 1 : 0;
          // the circuit lights up: the two fronts leave the gantry at `ignite` and meet at `meet` (the look kit's
          // ignite map reads u; logged every frame so the timing is real before the map exists)
          if (V.ignite != null) {
            var u = clamp((t - V.ignite) / max(0.1, V.meet - V.ignite), 0, 1); P.ign = u;
            if (u >= 1 && !P.met) { P.met = true; P.log.push({ e: 'meet', w: +P.real.toFixed(3), t: +P.t.toFixed(3) }); }
            var K = typeof env.kit === 'function' ? env.kit() : null;
            if (K && typeof K.ignite === 'function') { try { K.ignite(u); } catch (e) {} }
            if (t >= V.ignite) once('ignite');
            if (t >= V.crown) once('crown');
          }
          // the title: typed in from its first letter, its gold stop last, on the landmark
          if (V.title) {
            var t0 = V.title[0], t1 = V.title[1] + held;
            if (t >= t0 && t < t1) {
              if (!P.title) buildTitle();
              once('title');
              var Tt = P.title, k = clamp(Math.ceil((t - t0) / 0.6 * Tt.n), 0, Tt.n);
              for (var i = 0; i < Tt.n; i++) Tt.chars[i].classList.toggle('on', i < k);
              ttl.style.opacity = String(clamp(min((t - t0) / 0.15, (t1 - t) / 0.3), 0, 1));
              sub.style.opacity = t - t0 > 0.6 ? String(clamp((t1 - t) / 0.3, 0, 1)) : '0';
              placeTitle();
            } else { ttl.style.opacity = '0'; sub.style.opacity = '0'; }
          }
          // the tagline under the crane, as the engines fire down the grid
          if (V.engines != null && t >= V.engines) once('engines');
          if (V.tagline) {
            var a0 = V.tagline[0] + (V.title ? held : 0), a1 = V.tagline[1] + (V.title ? held : 0), onT = t >= a0 && t < a1;
            if (onT && !P.tagShown) {
              P.tagShown = true;
              var dare = P.variant === 'dare' && o.dare ? o.dare : null;
              tag.querySelector('b').innerHTML = dare ? esc(String(dare.name || 'A FRIEND').toUpperCase()) + ' DARED YOU · <em>P' + esc(dare.place || '?') + ' FROM P' + esc(dare.from || o.slot || '?') + '</em>'
                : esc(str(o.tagline, ''));
              tag.querySelector('small').textContent = dare ? '' : str(o.kicker, '');
              P.tagText = tag.textContent;
            }
            tag.style.opacity = onT ? '1' : '0';
          }
          // the lower-thirds
          var l3On = null;
          if (V.w1 && t >= V.w1[0] && t < V.w1[1]) l3On = 'W1';
          else if (V.g1 && t >= V.g1[0] && t < V.g1[1]) l3On = 'G1';
          if (l3On && (!P.l3 || P.l3.kind !== l3On)) { lowerThird(l3On); if (l3On === 'G1') P.card = nameCard(); }
          l3.classList.toggle('on', !!l3On);
          // the skip pill: from 1.0 s, "Skip ›" from 3.0 s; the seat chip from the dip's end
          // (not in the glide: the camera is landing in your hands, and a key then is the start's HOLD, not a skip)
          var hs = handoffAt(), sk = t >= 1.0 && t < (hs != null ? hs : V.end) - 0.05 && P.variant !== 'skip';
          if (sk) { var txt = t >= 3 ? 'Skip ›' : (o.device === 'touch' ? 'Tap to skip' : o.device === 'pad' ? 'Any button to skip' : 'Any key to skip'); if (skipEl.textContent !== txt) skipEl.textContent = txt; }
          skipEl.classList.toggle('on', sk);
          seatEl.classList.toggle('on', t >= 0.5 && t < (hs != null ? hs : V.end) - 0.05 && P.variant !== 'skip');
        }
        function dipAt() {
          if (P.skipped) { var s = P.real - P.skipped.w, h = SKIP.dip; return s < h * 0.4 ? clamp(s / (h * 0.4), 0, 1) : s < h * 0.5 ? 1 : clamp(1 - (s - h * 0.5) / (h * 0.5), 0, 1); }
          var B = P.V.beats[0]; if (!B || B[0] !== 'dip') return 0;
          var e = B[2], t = P.t;
          if (P.variant === 'skip') { var hs = e; return t < hs * 0.4 ? clamp(t / (hs * 0.4), 0, 1) : t < hs * 0.5 ? 1 : clamp(1 - (t - hs * 0.5) / (hs * 0.5), 0, 1); }
          return t < 0.25 ? clamp(t / 0.25, 0, 1) : t < e ? 1 : clamp(1 - (t - e) / 0.3, 0, 1);
        }
        function finish() {
          if (P.done) return;
          P.done = true;
          once('end');
          wrap.classList.remove('on'); root.classList.remove('gpintro');
          ttl.style.opacity = '0'; sub.style.opacity = '0'; tag.style.opacity = '0'; l3.classList.remove('on'); skipEl.classList.remove('on'); seatEl.classList.remove('on'); waitEl.classList.remove('on');
          var K = typeof env.kit === 'function' ? env.kit() : null;
          if (K && typeof K.ignite === 'function') { try { K.ignite(1); } catch (e) {} }
          // (the director's glide ends itself, a frame at most after this clock's end: it hands the camera over and says
          // so, the 'handoff' event; any other shot of its is stopped here)
          // (I, M2 round 2: the clock's last frame has already left the glide's beat, P.shot null, while the director's glide may
          // still need a frame to land; ask the director, or this would stop the glide before it says 'handoff' and latches)
          var D = env.director, ds = D && typeof D.state === 'function' ? D.state() : null, gliding = P.framed && (P.shot === 'handoff' || !!(ds && ds.shot === 'handoff'));
          if (!gliding && env.cam && typeof env.cam.mode === 'function') env.cam.mode(P.o.camMode || 'chase', false);
          if (P.framed && !gliding && D && typeof D.stop === 'function') { try { D.stop(); } catch (e) {} }
          // (late: how far past the intro's own end this frame came, so the race can start where the clock says it does)
          var late = P.skipped ? P.real - P.skipped.w - SKIP.dip : P.t - P.endAt;
          if (!P.handed) { P.handed = true; if (typeof P.o.onHand === 'function') P.o.onHand(clamp(late, 0, 0.25)); }
        }

        /* ---------------------------------------------------------------------------------- the API -- */
        // an intro ended from outside (RACE AGAIN, the debug hooks, Quit): the overlay down, no callbacks
        function cancel() {
          if (!P || P.done) return false;
          P.done = true; P.handed = true;
          wrap.classList.remove('on'); root.classList.remove('gpintro'); dip.style.opacity = '0';
          ttl.style.opacity = '0'; sub.style.opacity = '0'; tag.style.opacity = '0'; l3.classList.remove('on'); skipEl.classList.remove('on'); seatEl.classList.remove('on'); waitEl.classList.remove('on');
          var D = env.director; if (P.framed && D && typeof D.stop === 'function') { try { D.stop(); } catch (e) {} }
          page('fallback', { what: 'intro cancelled', w: +P.real.toFixed(3) });
          return true;
        }
        function play(variant, o) {
          if (!VARIANTS[variant]) return false;
          if (P && !P.done) cancel();
          o = o || {};
          P = fresh(variant, o);
          P.lm = landmark(o);
          P.youN = o.youN != null ? o.youN : -1; P.featN = o.feature && o.feature.n != null ? o.feature.n : -1;
          if (P.title) P.title = null;
          ttl.innerHTML = ''; sub.textContent = ''; l3.classList.remove('on'); tag.style.opacity = '0';
          seatEl.innerHTML = esc(str(o.seatText, '')) + '<i>▾</i>';
          page('intro', { variant: variant, from: o.from || 'play', w: 0 });
          P.log.push({ e: 'intro', w: 0, t: 0 });
          if (variant === 'race-again' || !P.V.beats.length) { if (typeof o.onHandoff === 'function') o.onHandoff(true); finish(); return true; }
          wrap.classList.add('on'); root.classList.add('gpintro');
          var K = typeof env.kit === 'function' ? env.kit() : null;
          if (P.V.ignite != null && K && typeof K.ignite === 'function') { try { K.ignite(0); } catch (e) {} }
          dip.style.opacity = '0';
          return true;
        }
        // a skip: from the next frame, a 0.3 s dip; at its black the camera is put on the chase and the HUD comes up; at
        // its end the race starts with 2.0 s of revs before the lights (the lights are never skipped)
        function handoffAt() { var B = P.V.beats; for (var i = 0; i < B.length; i++) if (B[i][0] === 'handoff') return B[i][1]; return null; }
        function skip() {
          if (!P || P.done || P.skipped || P.variant === 'race-again') return false;
          if (P.real < 0.15 || P.shot === 'handoff') return false;
          P.skipped = { w: P.real, t: P.t, shot: P.shot, mid: false };
          page('skip', { t: +P.t.toFixed(3), shot: P.shot || 'dip', w: +P.real.toFixed(3) });
          P.log.push({ e: 'skip', w: P.real, t: P.t });
          skipEl.classList.remove('on'); seatEl.classList.remove('on'); l3.classList.remove('on'); tag.style.opacity = '0'; ttl.style.opacity = '0'; sub.style.opacity = '0'; waitEl.classList.remove('on');
          return true;
        }
        // (wall: the page's clock in seconds, when it gives one: the intro then keeps to the wall clock exactly, as its
        // sound does, however long a frame took to draw; a frame of more than a second, a tab put away, counts a second)
        function update(dt, st, F, wall) {
          if (!P || P.done) return { framed: false };
          if (wall != null && isFinite(wall)) { dt = P.lastWall == null ? 0 : clamp(wall - P.lastWall, 0, 1); P.lastWall = wall; }
          else dt = clamp(+dt || 0, 0, 0.25);
          if (P.paused) return { framed: true };
          P.real += dt;
          var V = P.V;
          // a skip: the dip, the cut to the chase at its black, the race at its end
          if (P.skipped) {
            var s = P.real - P.skipped.w;
            dip.style.opacity = String(dipAt());
            if (!P.skipped.mid && s >= SKIP.dip * 0.45) {
              P.skipped.mid = true;
              if (typeof P.o.onSkip === 'function') P.o.onSkip(P.skipped.t);
              if (env.cam && typeof env.cam.mode === 'function') { env.cam.mode(P.o.camMode || 'chase', false); if (typeof env.cam.reset === 'function') env.cam.reset(); }
              if (typeof P.o.onHandoff === 'function') P.o.onHandoff(true);
            }
            if (P.skipped.mid && env.cam && typeof env.cam.update === 'function' && F) env.cam.update(dt, F, { racing: false, phase: st ? st.phase : 'grid' });
            if (s >= SKIP.dip - 1e-9) { dip.style.opacity = '0'; finish(); }
            return { framed: P.skipped.mid };
          }
          // the hold: the clock waits at the ignition (or the first shot) until the grid is ready, up to 8 s; the
          // helicopter keeps flying; after 4 s a small caption says so
          if (V.hold != null && !P.holdDone && P.t >= V.hold - 1e-9) {
            var ready = typeof P.o.ready !== 'function' || !!P.o.ready();
            if (!ready && P.held < HOLDMAX) {
              if (!P.holding) { P.holding = true; P.holdShot = P.shot; }
              P.held += dt;
              waitEl.classList.toggle('on', P.held >= HOLDCAP); waitBar.style.width = clamp(P.held / HOLDMAX * 100, 0, 100).toFixed(1) + '%';
              dip.style.opacity = String(dipAt());
              return { framed: frame(dt, st, F) };
            }
            P.holdDone = true;
            if (P.holding || P.held > 0) { P.holding = false; waitEl.classList.remove('on'); once('hold', { shot: P.holdShot || P.shot, waited: +P.held.toFixed(3), ready: ready }); if (!ready) page('fallback', { what: 'not ready after ' + HOLDMAX + ' s' }); }
          }
          // (the clock lands on the hold point exactly, so nothing timed after it runs before the grid is ready)
          P.t = V.hold != null && !P.holdDone && P.t < V.hold - 1e-9 && P.t + dt > V.hold ? V.hold : P.t + dt;
          var b = beatAt(P.t);
          if (b !== P.beat) {
            P.beat = b;
            if (b < V.beats.length) shotStart(V.beats[b][0], st, F);
            else P.shot = null;
          }
          dip.style.opacity = String(dipAt());
          words(st);
          var framed = frame(dt, st, F);
          if (P.t >= P.endAt - 1e-9) finish();
          return { framed: framed };
        }
        return {
          play: play, skip: skip, update: update, cancel: cancel,
          // (gp.js, once the player's race is made: your car and the front row's agent, by index, and your slot)
          cast: function (o) { if (!P || !o) return; if (o.youN != null) P.youN = o.youN; if (o.feature) { P.o.feature = o.feature; P.featN = o.feature.n; } if (o.slot != null) P.o.slot = o.slot; },
          active: function () { return !!(P && !P.done); },
          event: function (e) { /* (race events: none needed before the race starts; kept for the director's grammar) */ },
          pause: function (on) { if (P) P.paused = !!on; },
          seat: function (text) { seatEl.innerHTML = esc(str(text, '')) + '<i>▾</i>'; },
          rev: function (variant) { var V = VARIANTS[variant]; return V ? V.rev : SKIP.rev; },
          state: function () {
            if (!P) return { variant: null };
            var Tt = P.title;
            return { variant: P.variant, t: +P.t.toFixed(3), real: +P.real.toFixed(3), beat: P.beat, shot: P.shot, framed: P.framed, done: P.done, held: +P.held.toFixed(3),
              skipped: P.skipped ? { w: +P.skipped.w.toFixed(3), t: +P.skipped.t.toFixed(3), shot: P.skipped.shot } : null, ignite: +P.ign.toFixed(4),
              title: Tt ? { x: +Tt.x.toFixed(1), y: +Tt.y.toFixed(1), on: !!Tt.on, text: ttl.textContent } : null, l3: P.l3, tag: P.tagText || null,
              fallback: Object.keys(P.fb), log: P.log.slice(), card: !!P.card, landmark: P.lm ? [+P.lm.x.toFixed(1), +P.lm.y.toFixed(1), +P.lm.z.toFixed(1)] : null };
          },
          // (for the tests: the title's stop and the landmark's point on screen, in CSS pixels)
          probe: function () {
            if (!P || !P.title || !P.title.stopEl) return null;
            var r = P.title.stopEl.getBoundingClientRect(), W = win.innerWidth, H = win.innerHeight;
            V3.copy(P.lm).project(cam);
            return { stop: [r.left + r.width / 2, r.top + r.height * 0.78], sphere: [(V3.x + 1) / 2 * W, (1 - V3.y) / 2 * H], on: !!P.title.on, size: parseFloat(ttl.style.fontSize) };
          },
          rects: function () {
            function R(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, on: getOn(e) }; }
            function getOn(e) { var cs = win.getComputedStyle(e); return cs.display !== 'none' && +cs.opacity > 0.05 && cs.visibility !== 'hidden'; }
            return { l3: R(l3), skip: R(skipEl), seat: R(seatEl), tag: R(tag), title: R(ttl), wait: R(waitEl) };
          },
          dispose: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); if (css.parentNode) css.parentNode.removeChild(css); root.classList.remove('gpintro'); },
        };
      }
      return { intro: intro, VARIANTS: VARIANTS };
    })();
