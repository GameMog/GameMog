    /* ========================================== penalty shootout: the camera director (lane K, critique #7) == */
    // Pasted into boot() by shootout.js at /*@include shootout-camera.js*/. ONE top-level binding, shootCamera
    // (critique #2): a factory the director calls once its world is built. It reads the runtime's own names (THREE,
    // camera, renderer, post, sunLight, SUNB, basePixelRatio, root) and declares nothing else at the top level. Worlds
    // cannot move the camera (custom-game.ts WORLD_FORBIDDEN), so every shot of the shootout is made here (design §6).
    //
    //   var cam = shootCamera({ quality, touchTop: fn, cut: 'live' | 'b', goal: GZ, spot: [x, z] });
    //   cam.cut(name, { side, first, wipe, replay })  a hard cut: 'WALK' | 'KEEPER' | 'BALL' | 'HERO' | 'REVERSE' (springs reset)
    //   cam.kick(k)                                   the contact shake (k = 1 at the strike; 0.5 for the woodwork)
    //   cam.update(dt, L)                             every render frame on REAL dt (the shake runs through the hit-stop);
    //                                                 L = the director's LOOK: { phase, t (s in the phase), first, stage,
    //                                                 demo, taker [chest], keeper [head], ball, ballV, runup 0..1 (from
    //                                                 the prefix's c0: X14), heat 0..1, flight, result, replay, side, aim
    //                                                 [x, y, GZ] (the live marker until the lock), portrait, cam (a
    //                                                 recorded [px,py,pz,qx,qy,qz,qw,fov] to replay as it was, or null) }
    //   cam.state()                                   { shot, pos, look, fov, aspect, portrait, fit, shake }
    //   cam.fit()                                     the HERO framing for this screen (re-made on resize/touch-kit change)
    //   cam.project([x,y,z])                          { x, y (CSS px), on (in front, on screen) }: for DOM overlays
    //   cam.hero(out)                                 OW.hero's point (design §6.4): cancels v1's 0.3 E camera-ahead offset
    //   cam.tier()                                    the phone tier (critique #21), idempotent; the director may do it itself
    //   cam.snapshot() / cam.restore(s)               the springs and shot, for a replay that resumes the live camera
    //
    // Shots (design §6.1; vfov for landscape, hfovMin the least across on a portrait screen):
    //   WALK     (3.4, 1.55, -15.2) dollying to (3.0, 1.55, -18.2); the taker's chest led by 0.3 s; 26 / 18; look spring 4
    //   KEEPER   (-1.3, 1.35, -57.3) behind the net, the keeper's head; 24 / 16; a 0.2 m drift
    //   BALL     (0.55, 0.24, -40.0) at (0, 0.14, -41.5); 38 / 30
    //   HERO     desktop (1.15, 1.62, -32.4) at (-0.3, 1.35, -52.5), 36; portrait (9:20) (-0.15, 1.78, -33.4) at
    //            (-0.25, 1.15, -52.5), 60; between them by aspect, then FITTED (tap contract X14): the goal frame (|x| <=
    //            3.9, y <= 2.7) and the taker at his mark (L.taker in the whistle and the set; 4.75 m back) and over the
    //            spot always in, the goal line 8 px over the touch kit (touchTop); the lens slides toward -x and pulls back
    //            before it widens (the goal mouth shown widest wins: desktop about (-1.85, 1.62, -31.9) at 36). The aim's
    //            whole range (+-7 x 4.5) in frame where the lens allows, else the look pans <= 1.5 m toward a marker
    //            outside it (L.aim). A 0.5 m push-in over the run-up (+0.3 m ON FIRE, L.heat), the contact shake (0.012 m,
    //            9 Hz, 0.25 s), the look drifting <= 0.6 m toward the ball in flight, a slow push in the result
    //   REVERSE  (-side 0.9, 1.25, -56.2) at (side 0.4, 1.2, -44): the keeper crosses the frame; 46 / 34; a 0.3 m track
    // Springs: kart's critically damped spring (kart.js:4560), position w 6, look w 8; a cut resets them. A handheld
    // drift of 0.004 rad at 0.3 Hz, off in the replay.
    function shootCamera(o) {
      'use strict';
      o = o || {};
      var PI = Math.PI, GZ = o.goal != null ? +o.goal : -52.5, SPOT = Array.isArray(o.spot) ? o.spot : [0, -41.5];
      var LIVE_CUT = o.cut === 'live';
      var LOWQ = o.quality === 'low';
      var touchTopFn = typeof o.touchTop === 'function' ? o.touchTop : null;
      var SH = {
        WALK: { p: [3.4, 1.55, -15.2], p2: [3.0, 1.55, -18.2], dolly: 5.6, look: 'taker', lead: 0.3, fov: 26, across: 18, lw: 4 },
        KEEPER: { p: [-1.3, 1.35, -57.3], look: 'keeper', fov: 24, across: 16, drift: 0.2, driftT: 1.6 },
        BALL: { p: [0.55, 0.24, -40.0], l: [0, 0.14, -41.5], fov: 38, across: 30 },
        HERO: { p: [1.15, 1.62, -32.4], l: [-0.3, 1.35, -52.5], fov: 36, pp: [-0.15, 1.78, -33.4], pl: [-0.25, 1.15, -52.5], pfov: 60, paspect: 9 / 20 },
        // (REVERSE: the design's pose, then FRAMED on the action: the keeper's head, his reach toward the dive and the ball
        // held inside the frame by aiming and widening; a tall screen pulls back and toward the dive (pp))
        REVERSE: { p: [0.9, 1.25, -56.2], l: [0.4, 1.2, -44], pp: [0.3, 1.35, -57.6], fov: 46, across: 34, track: 0.3, trackT: 3.2, maxFov: 96 }
      };
      var C = {
        shot: 'HERO', side: 1, tc: 0, init: false, replay: false,
        p: [0, 0, 0], pv: [0, 0, 0], l: [0, 0, 0], lv: [0, 0, 0], fov: 36,
        shake: 0, shakeT: 0, shakeK: 0, hand: 0, prevTaker: null, takerV: [0, 0, 0], last: null, mark: null
      };
      var FIT = { key: '', p: null, l: null, fov: 36, nudge: 0, wp: 0, ok: true, checkT: 0, tt: 1 };
      // (the second fit: the run-up's join instead of the mark, the lens the HERO glides to over the run-up; see glide())
      var FITJ = { key: '', p: null, l: null, fov: 36, nudge: 0, wp: 0, ok: true };
      var Q = new THREE.Quaternion(), V = new THREE.Vector3(), V2 = new THREE.Vector3();

      /* --------------------------------------------------------------------------------------------- helpers -- */
      function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }
      function lerpA(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
      function sstep(a, b, x) { var u = clampN((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
      function arr(v, d) { return Array.isArray(v) && v.length >= 3 && isFinite(v[0]) && isFinite(v[1]) && isFinite(v[2]) ? v : d; }
      // kart.js:4560, copied: a critically damped spring, stepped in pieces on a slow frame
      function spring(o3, key, vkey, target, w, dt) {
        var nS = Math.max(1, Math.ceil(dt * w / 0.25)), h = dt / nS;
        for (var s = 0; s < nS; s++) for (var i = 0; i < 3; i++) { var d = target[i] - o3[key][i]; o3[vkey][i] += (w * w * d - 2 * w * o3[vkey][i]) * h; o3[key][i] += o3[vkey][i] * h; }
      }
      // the vertical fov that keeps at least `across` degrees across on this screen (design §6.1)
      function fovFor(vfov, across, aspect) {
        if (!across || aspect >= 1) return vfov;
        return Math.max(vfov, 2 * Math.atan(Math.tan(across * PI / 360) / Math.max(0.2, aspect)) * 180 / PI);
      }
      // a point through a camera at p looking at l (up +y), vertical fov f (deg), aspect a: normalised device coords
      function ndc(pt, p, l, f, a) {
        var fx = l[0] - p[0], fy = l[1] - p[1], fz = l[2] - p[2], fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
        var rx = -fz, rz = fx, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;           // right = f x up
        var ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                            // up = right x f
        var dx = pt[0] - p[0], dy = pt[1] - p[1], dz = pt[2] - p[2];
        var zc = dx * fx + dy * fy + dz * fz, xc = dx * rx + dz * rz, yc = dx * ux + dy * uy + dz * uz, tf = Math.tan(f * PI / 360);
        return { x: xc / (Math.max(1e-6, zc) * tf * a), y: yc / (Math.max(1e-6, zc) * tf), z: zc };
      }
      function aspectNow() { return camera.aspect > 0 ? camera.aspect : (innerWidth / Math.max(1, innerHeight)); }
      function readTouchTop() { var v = 1; if (touchTopFn) try { v = +touchTopFn() || 1; } catch (e) { v = 1; } return clampN(v, 0.3, 1); }

      /* ------------------------------------------------------------------------------- the HERO framing (§6.3) -- */
      // Between the desktop and the portrait camera by the screen's shape, then FITTED (tap contract §7, X14):
      //   - always in: the goal frame and its margin (|x| <= 3.9, y 0..2.7 at the goal line) at the pushed-in camera
      //     (PUSH_FIT: the run-up's 0.5 m and the ON FIRE 0.3 m), across within 94% of the half-width, its top on screen;
      //   - always in: the taker at his mark (a box round it: the tap mechanic's run-up starts 4.75 m back, about 3.7 m to
      //     his left) and at the strike (a box over the spot), at the camera at rest and pushed in;
      //   - the goal line's ends >= 8 px over the touch kit's top (a nudge of the look down raises them).
      // To get there the lens may slide toward the taker's side (-x) and pull back (+z), and widen only last: of the
      // candidates the one that shows the goal mouth widest wins. The aim's whole range (+-7 x 0.12..4.5) is in frame
      // where the lens allows (desktop, landscape); elsewhere the look pans toward a marker outside the frame (<= 1.5 m)
      // before the lock, and the HUD's edge chevron shows the rest.
      var PUSH_FIT = 0.8, FRAME = [3.9, 2.7], RANGE = [7, 0.12, 4.5], MARK0 = [-3.73, -38.59], TAKER_BOX = [0.4, 0.02, 1.95], STRIKE_BOX = [0.6, -0.4, 0.9];
      var SLIDE = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.5], BACK = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5];
      function fitAt(p, l, f0, a, Hpx, tt, mark) {
        var dir = [l[0] - p[0], l[1] - p[1], l[2] - p[2]], dl = Math.hypot(dir[0], dir[1], dir[2]);
        var pIn = [p[0] + dir[0] / dl * PUSH_FIT, p[1] + dir[1] / dl * PUSH_FIT, p[2] + dir[2] / dl * PUSH_FIT];
        var box = [[-FRAME[0], 0, GZ], [FRAME[0], 0, GZ], [-FRAME[0], FRAME[1], GZ], [FRAME[0], FRAME[1], GZ], [0, FRAME[1], GZ]], line = [[-3.66, 0, GZ], [3.66, 0, GZ]];
        var tk = [], ix, iz, iy;
        if (mark) for (ix = -1; ix <= 1; ix += 2) for (iz = -1; iz <= 1; iz += 2) for (iy = 0; iy < 2; iy++) tk.push([mark[0] + ix * TAKER_BOX[0], iy ? TAKER_BOX[2] : TAKER_BOX[1], mark[1] + iz * TAKER_BOX[0]]);
        // and the strike: the ball on the spot and the taker over it (beside it, his plant foot, the follow-through)
        for (ix = -1; ix <= 1; ix += 2) for (iz = 0; iz < 2; iz++) for (iy = 0; iy < 2; iy++) tk.push([SPOT[0] + ix * STRIKE_BOX[0], iy ? TAKER_BOX[2] : TAKER_BOX[1], SPOT[1] + (iz ? STRIKE_BOX[2] : STRIKE_BOX[1])]);
        var margin = 8 / Hpx, nudge = 0, ok = false, f = f0, it, i, q;
        for (it = 0; it < 60; it++) {
          var la = [l[0], l[1] - nudge, l[2]], need = f;
          // across: the frame within 94% at the pushed-in camera; the taker within 96% at rest and pushed in
          for (i = 0; i < box.length; i++) { q = ndc(box[i], pIn, la, f, a); if (Math.abs(q.x) > 0.94) need = Math.max(need, 2 * Math.atan(Math.tan(f * PI / 360) * Math.abs(q.x) / 0.94) * 180 / PI); }
          for (i = 0; i < tk.length; i++) for (var c = 0; c < 2; c++) {
            q = ndc(tk[i], c ? pIn : p, la, f, a);
            if (q.z <= 0.3) { need = 179; continue; }
            if (Math.abs(q.x) > 0.96) need = Math.max(need, 2 * Math.atan(Math.tan(f * PI / 360) * Math.abs(q.x) / 0.96) * 180 / PI);
            if (Math.abs(q.y) > 0.97) need = Math.max(need, 2 * Math.atan(Math.tan(f * PI / 360) * Math.abs(q.y) / 0.97) * 180 / PI);
          }
          if (need > 80) return null;
          f = need;
          // down: the goal line over the touch kit, the frame's top under the screen's top
          var low = -Infinity;
          for (i = 0; i < line.length; i++) { var qd = ndc(line[i], pIn, la, f, a); low = Math.max(low, (1 - qd.y) / 2); }
          var top = (1 - ndc(box[4], pIn, la, f, a).y) / 2, floor = tt - margin;
          if (low <= floor && top >= 0.03) { ok = true; break; }
          if (low > floor && top - 0.04 >= 0.03 && nudge < 1.2) { nudge += 0.04; continue; }
          f = Math.min(80, f + 1.5);
        }
        if (!ok) return null;
        var la2 = [l[0], l[1] - nudge, l[2]], qa = ndc([-3.66, 1.22, GZ], p, la2, f, a), qb = ndc([3.66, 1.22, GZ], p, la2, f, a);
        // the aim's whole range, where the lens allows (not a condition: the chevron shows the rest)
        var all = true;
        for (var rx = -1; rx <= 1; rx += 2) for (var ry = 0; ry < 2; ry++) { var qr = ndc([rx * RANGE[0], ry ? RANGE[2] : RANGE[1], GZ], pIn, la2, f, a); if (Math.abs(qr.x) > 0.98 || Math.abs(qr.y) > 0.98) all = false; }
        return { p: p, l: la2, fov: f, nudge: nudge, goalW: Math.abs(qb.x - qa.x) / 2, range: all };
      }
      function fit(force, mark, into) {
        var T = into || FIT;
        var a = aspectNow(), Hpx = Math.max(1, innerHeight), tt = FIT.tt, mk = mark ? [Math.round(mark[0] * 4) / 4, Math.round(mark[1] * 4) / 4] : null;
        var key = a.toFixed(3) + ':' + Hpx + ':' + tt.toFixed(3) + ':' + (mk ? mk.join(',') : '-');
        if (!force && key === T.key && T.p) return T;
        var s = SH.HERO, wp = clampN((1.45 - a) / (1.45 - s.paspect), 0, 1);
        var p0 = lerpA(s.p, s.pp, wp), l = lerpA(s.l, s.pl, wp), f0 = s.fov + (s.pfov - s.fov) * wp, best = null, bi = 0, bj = 0;
        // the candidates: the lens slid toward -x and pulled back; the goal mouth shown widest wins (a little against
        // moving off the design's pose: 1% of the screen for 2.5 m of slide or 5 m back)
        for (var i = 0; i < SLIDE.length; i++) for (var j = 0; j < BACK.length; j++) {
          var r = fitAt([p0[0] - SLIDE[i], p0[1], p0[2] + BACK[j]], l, f0, a, Hpx, tt, mk);
          if (!r) continue;
          var score = r.goalW - 0.004 * SLIDE[i] - 0.002 * BACK[j] + (r.range ? 0.002 : 0);
          if (!best || score > best.score + 1e-9) { best = r; best.score = score; bi = i; bj = j; }
        }
        // (nothing fits a degenerate screen: the design's pose at its widest)
        if (!best) best = { p: p0, l: l, fov: 80, nudge: 0, goalW: 0, range: false, score: -1 };
        T.key = key; T.p = best.p; T.l = best.l; T.fov = best.fov; T.nudge = best.nudge; T.wp = wp; T.ok = best.score > -1;
        T.slide = SLIDE[bi]; T.back = BACK[bj]; T.range = best.range; T.mark = mk;
        return T;
      }
      // the taker's mark for the fit: where he stands in the whistle and the set (live, so a ?mark= knob or another body is
      // framed), kept through the run-up and after (he runs into the frame); the male fbKick's nominal mark before that
      function markFor(L) {
        var ph = L && L.phase, tk = L && Array.isArray(L.taker) && isFinite(L.taker[0]) && isFinite(L.taker[2]) ? L.taker : null;
        // (0.3 m of hysteresis: the bounce on his toes never re-fits the lens)
        if (tk && (ph === 'whistle' || ph === 'set') && (!C.mark || Math.hypot(tk[0] - C.mark[0], tk[2] - C.mark[1]) > 0.3)) C.mark = [tk[0], tk[2]];
        return C.mark || MARK0;
      }
      // The HERO glide (integration, 11 Oct). Seen from behind, the taker at the strike and in his follow-through stands
      // in front of whichever side of the goal is FAR from the lens: with the lens slid toward -x to hold the mark (the
      // fit), a dive to the picture's right is hidden behind him (integ/occlude-probe2:
      // 17-42% of the keeper covered on average, up to 80%), while a dive to the picture's left stays clear. So when the
      // aim is to the right of the goal (x > 0), the lens glides over the run-up from the mark's fit to the fit of the JOIN
      // (where the last stride starts, 56% of the way from the mark to the spot: Ma's (-1.66, -40.28) for the male mark),
      // which needs far less slide (desktop: back to the design's pose); aimed left it stays. The aim is the player's own
      // choice (live while he steers, locked at the lock), so the lens never tells the keeper's guess. The weight: 0 in the
      // walk, whistle and set; over the tap phase as the clip clock runs (LOOK.runup 0.15 -> 0.70; the lock is at about
      // 0.72); 1 from the strike on; times the aim's side (0.3 m of hysteresis about the middle).
      var JOIN_K = 0.56;
      function joinOf(mark) { return [mark[0] + (SPOT[0] - mark[0]) * JOIN_K, mark[1] + (SPOT[1] - mark[1]) * JOIN_K]; }
      function glide(L) {
        var ph = L && L.phase, ax = L && Array.isArray(L.aim) ? +L.aim[0] : NaN;
        if (ax > 0.3) C.aimSide = 1; else if (ax < -0.3) C.aimSide = 0;
        var side = C.aimSide == null ? 1 : C.aimSide;
        if (!side) return 0;
        if (ph === 'strike' || ph === 'flight' || ph === 'result') return 1;
        if (ph !== 'runup') return 0;
        return L.sub === 'stride' || L.sub === 'hang' ? 1 : sstep(0.15, 0.70, +L.runup || 0);
      }
      // ... and the crane: over the last stride the lens rises CRANE m (all of it by the strike), so it looks
      // over the taker's shoulder at the dive whichever way the keeper goes (integ/occlude-probe3: at desktop a wrong-way
      // dive went from 24% of the keeper hidden on average, 80% at worst, to 4% / 20% with 1.2 m). The look stays on the
      // goal, so the frame stays where the fit put it; the springs make it one smooth move.
      var CRANE = 1.6;
      function crane(L) {
        var ph = L && L.phase;
        if (!L || L.replay) return 0;
        if (ph === 'strike' || ph === 'flight' || ph === 'result') return 1;
        return ph === 'runup' && (L.sub === 'stride' || L.sub === 'hang') ? sstep(0.70, 0.95, +L.runup || 0) : 0;
      }

      // the look panned toward the aim marker when it projects outside the frame: the least pan (<= 1.5 m at the goal
      // line) that brings it within 90% of the screen, never taking the taker at his mark out of it
      function panTo(aim, p, l, f, a, mark) {
        if (!Array.isArray(aim) || !isFinite(aim[0]) || !isFinite(aim[1])) return l;
        var q = ndc([aim[0], aim[1], GZ], p, l, f, a), d = [0, 0];
        if (Math.abs(q.x) > 0.9) d[0] = (aim[0] - l[0]) * (Math.abs(q.x) - 0.9) / Math.abs(q.x);
        if (Math.abs(q.y) > 0.9) d[1] = (aim[1] - l[1]) * (Math.abs(q.y) - 0.9) / Math.abs(q.y);
        var dn = Math.hypot(d[0], d[1]);
        if (dn < 1e-6) return l;
        if (dn > 1.5) { d[0] *= 1.5 / dn; d[1] *= 1.5 / dn; }
        var k = 1;
        for (var it = 0; it < 6; it++) {
          var lk = [l[0] + d[0] * k, l[1] + d[1] * k, l[2]], ok = true;
          for (var ix = -1; ix <= 1 && ok; ix += 2) for (var iy = 0; iy < 2; iy++) { var qt = ndc([mark[0] + ix * TAKER_BOX[0], iy ? TAKER_BOX[2] : TAKER_BOX[1], mark[1]], p, lk, f, a); if (qt.z > 0 && (Math.abs(qt.x) > 0.99 || Math.abs(qt.y) > 0.99)) { ok = false; break; } }
          if (ok) return lk;
          k *= 0.5;
        }
        return l;
      }

      /* ------------------------------------------------------------------------------------- the shots' poses -- */
      // where shot `name` wants the camera now: { p, l, fov, lw (look spring) }
      function want(L, dt) {
        var a = aspectNow(), s = SH[C.shot] || SH.HERO, p, l, f = s.fov, lw = s.lw || 8;
        var taker = arr(L && L.taker, [0, 1.25, -39]), keeper = arr(L && L.keeper, [0, 1.55, GZ + 0.15]), ball = arr(L && L.ball, [SPOT[0], 0.11, SPOT[1]]);
        if (C.shot === 'WALK') {
          p = lerpA(s.p, s.p2, sstep(0, s.dolly, C.tc));
          l = [taker[0] + C.takerV[0] * s.lead, taker[1], taker[2] + C.takerV[2] * s.lead];
          f = fovFor(s.fov, s.across, a);
        } else if (C.shot === 'KEEPER') {
          p = [s.p[0] + s.drift * sstep(0, s.driftT, C.tc), s.p[1], s.p[2]];
          l = keeper.slice(); f = fovFor(s.fov, s.across, a);
        } else if (C.shot === 'BALL') {
          p = s.p.slice(); l = s.l.slice(); f = fovFor(s.fov, s.across, a);
        } else if (C.shot === 'REVERSE') {
          var sd = C.side || 1, tr = s.track * sstep(0, s.trackT, C.tc), wpR = clampN((1.45 - a) / (1.45 - 0.45), 0, 1);
          var base = lerpA(s.p, s.pp, wpR);
          p = [-sd * base[0] + sd * tr, base[1], base[2]];
          // what must be in the frame: his head, his reach toward the dive, his feet behind him, the ball
          // (the ball only while it is in front of the line and not at the lens: a goal ends in the net a metre or two from
          // this camera, and chasing it there would end the replay on a ball filling the frame's foot)
          var subj = [keeper, [keeper[0] + sd * 1.0, keeper[1] - 0.4, keeper[2]], [keeper[0] - sd * 0.5, 0.1, keeper[2]], [sd * 0.4, 1.2, -44]];
          if (ball[2] > GZ - 0.2 && Math.hypot(ball[0] - p[0], ball[2] - p[2]) > 4) subj.push(ball);
          var y0 = Infinity, y1 = -Infinity, v0 = Infinity, v1 = -Infinity;
          for (var si = 0; si < subj.length; si++) {
            var q = subj[si], dx = q[0] - p[0], dz = q[2] - p[2], dy = q[1] - p[1], hz = Math.hypot(dx, dz);
            var yaw = Math.atan2(dx, dz), pit = Math.atan2(dy, Math.max(0.5, hz));
            y0 = Math.min(y0, yaw); y1 = Math.max(y1, yaw); v0 = Math.min(v0, pit); v1 = Math.max(v1, pit);
          }
          var yc = (y0 + y1) / 2, hs = (y1 - y0) / 2 + 6 * PI / 180, pc = clampN((v0 + v1) / 2, -10 * PI / 180, 6 * PI / 180), vs = Math.max(v1 - pc, pc - v0) + 5 * PI / 180;
          l = [p[0] + Math.sin(yc) * Math.cos(pc) * 12, p[1] + Math.sin(pc) * 12, p[2] + Math.cos(yc) * Math.cos(pc) * 12];
          var needH = 2 * Math.atan(Math.tan(hs) / Math.max(0.2, a)) * 180 / PI, needV = 2 * vs * 180 / PI;
          f = Math.min(s.maxFov, Math.max(fovFor(s.fov, s.across, a), needH, needV));
        } else {
          var F = fit(false, markFor(L)), gw = glide(L);
          if (gw > 0) { var FJ = fit(false, joinOf(C.mark || MARK0), FITJ); F = { p: lerpA(F.p, FJ.p, gw), l: lerpA(F.l, FJ.l, gw), fov: F.fov + (FJ.fov - F.fov) * gw }; }
          var dir = [F.l[0] - F.p[0], F.l[1] - F.p[1], F.l[2] - F.p[2]], dl = Math.hypot(dir[0], dir[1], dir[2]);
          dir = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
          // the run-up's push-in (0.5 m; 0.3 m more ON FIRE, from the heat: X14's option); the fit allowed for both
          var push = (0.5 + 0.3 * sstep(0.85, 0.95, L ? +L.heat || 0 : 0)) * sstep(0, 1, L ? +L.runup || 0 : 0);
          // the result: a slow push toward the goal (0.6 m over 1.6 s), after the kick only
          if (L && L.result) push += 0.6 * sstep(0, 1.6, +L.t || 0);
          p = [F.p[0] + dir[0] * push, F.p[1] + dir[1] * push + CRANE * crane(L), F.p[2] + dir[2] * push];
          l = F.l.slice(); f = F.fov;
          // aiming: a marker the lens cannot hold (a tall screen, the aim past a post) pans the look toward it, <= 1.5 m
          if (L && !L.replay && (L.phase === 'whistle' || L.phase === 'set' || L.phase === 'runup' || L.phase === 'strike')) l = panTo(L.aim, p, l, f, a, C.mark || MARK0);
          // in flight the look drifts toward the ball (<= 0.6 m), on the goal-line plane
          if (L && (L.flight || L.result) && !L.replay) {
            var bx = ball[0] - l[0], by = ball[1] - l[1], bl = Math.hypot(bx, by), k = bl > 0.6 / 0.35 ? 0.6 / bl : 0.35;
            l = [l[0] + bx * k, l[1] + by * k, l[2]];
          }
        }
        return { p: p, l: l, fov: f, lw: lw };
      }

      /* --------------------------------------------------------------------------------------------- the API -- */
      function snap(W) { C.p = W.p.slice(); C.l = W.l.slice(); C.pv = [0, 0, 0]; C.lv = [0, 0, 0]; C.fov = W.fov; C.init = true; }
      function cut(name, oo) {
        oo = oo || {};
        if (!SH[name]) return false;
        C.shot = name; C.tc = 0; C.init = false; C.replay = !!oo.replay;
        if (oo.side === 1 || oo.side === -1) C.side = oo.side;
        return true;
      }
      function kick(k) { C.shakeK = Math.max(C.shakeK * Math.exp(-C.shakeT / 0.25), 0.012 * (k == null ? 1 : +k || 0)); C.shakeT = 0; }
      function apply(pos, look, fov, dt, L) {
        camera.up.set(0, 1, 0);
        camera.position.set(pos[0], pos[1], pos[2]);
        // the contact shake (real time, so it keeps going through the hit-stop's freeze)
        if (C.shakeK > 0) {
          C.shakeT += dt;
          var e = C.shakeK * Math.exp(-C.shakeT / 0.25), w = 2 * PI * 9 * C.shakeT;
          camera.position.x += e * Math.sin(w); camera.position.y += 0.7 * e * Math.sin(1.3 * w + 1);
          if (C.shakeT > 1.5) C.shakeK = 0;
        }
        camera.lookAt(look[0], look[1], look[2]);
        // the handheld drift (broadcast feel), never in the replay
        if (!(L && L.replay) && !C.replay) {
          C.hand += dt;
          var n1 = 0.004 * (Math.sin(2 * PI * 0.3 * C.hand + 0.7) + 0.5 * Math.sin(2 * PI * 0.71 * C.hand + 2.1)) / 1.5;
          var n2 = 0.004 * (Math.sin(2 * PI * 0.27 * C.hand + 1.9) + 0.5 * Math.sin(2 * PI * 0.63 * C.hand)) / 1.5;
          camera.rotateY(n1); camera.rotateX(n2 * 0.6);
        }
        if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
      }
      function update(dt, L) {
        dt = Math.max(0, Math.min(+dt || 0, 0.1));
        C.tc += dt;
        // the taker's pace, for the walk shot's lead
        var tk = L && Array.isArray(L.taker) ? L.taker : null;
        if (tk && C.prevTaker && dt > 1e-4) { for (var i = 0; i < 3; i++) C.takerV[i] += ((tk[i] - C.prevTaker[i]) / dt - C.takerV[i]) * Math.min(1, dt * 6); }
        C.prevTaker = tk ? tk.slice() : null;
        // the touch kit can move (portrait / landscape, the pad put away): re-read it now and then
        FIT.checkT -= dt;
        if (FIT.checkT <= 0) { FIT.checkT = 0.5; FIT.tt = readTouchTop(); }
        // a replay of the live camera (?cut=live): the recorded camera as it was, a pure function of the tape
        if (L && L.replay && Array.isArray(L.cam) && L.cam.length >= 8 && C.shot === 'HERO') {
          camera.up.set(0, 1, 0); camera.position.set(L.cam[0], L.cam[1], L.cam[2]); camera.quaternion.set(L.cam[3], L.cam[4], L.cam[5], L.cam[6]);
          if (Math.abs(camera.fov - L.cam[7]) > 0.02) { camera.fov = L.cam[7]; camera.updateProjectionMatrix(); }
          C.last = { p: L.cam.slice(0, 3), l: null, fov: L.cam[7] }; return;
        }
        var W = want(L, dt);
        if (!C.init) snap(W);
        else {
          spring(C, 'p', 'pv', W.p, 6, dt);
          spring(C, 'l', 'lv', W.l, W.lw, dt);
          C.fov += (W.fov - C.fov) * (1 - Math.exp(-6 * dt));
        }
        C.last = W;
        apply(C.p, C.l, C.fov, dt, L);
      }
      function state() {
        var r3 = function (v) { return Math.round(v * 1000) / 1000; };
        return { shot: C.shot, side: C.side, pos: [r3(camera.position.x), r3(camera.position.y), r3(camera.position.z)], look: C.l.map(r3), fov: r3(camera.fov),
          aspect: r3(aspectNow()), portrait: aspectNow() < 1, fit: { ok: FIT.ok, nudge: r3(FIT.nudge), fov: r3(FIT.fov), wp: r3(FIT.wp), touchTop: r3(FIT.tt), slide: FIT.slide || 0, back: FIT.back || 0, range: !!FIT.range, mark: FIT.mark || null,
            join: FITJ.p ? { slide: FITJ.slide || 0, back: FITJ.back || 0, fov: r3(FITJ.fov), mark: FITJ.mark || null } : null },
          shake: r3(C.shakeK * Math.exp(-C.shakeT / 0.25)), replay: C.replay, live: LIVE_CUT };
      }
      function project(pt) {
        V.set(pt[0], pt[1], pt[2]); camera.updateMatrixWorld();
        V2.copy(V).applyMatrix4(camera.matrixWorldInverse);
        V.project(camera);
        var w = innerWidth, h = innerHeight;
        return { x: (V.x + 1) / 2 * w, y: (1 - V.y) / 2 * h, on: V2.z < 0 && Math.abs(V.x) <= 1 && Math.abs(V.y) <= 1 };
      }
      // OW.hero (design §6.4): heroShadowAt adds +0.3 E along the camera's flat view, so this takes it off again and the
      // shadow box stays on the penalty box in every shot
      function hero(out) {
        camera.getWorldDirection(V2); V2.y = 0; if (V2.lengthSq() < 1e-6) V2.set(0, 0, -1); V2.normalize();
        return out.set(0, 0, GZ + 5).addScaledVector(V2, -0.3 * (SUNB ? SUNB.E : 22));
      }
      // the phone tier (critique #21): pixel ratio <= 1.25 (setPixelRatio + setSize + post.resize), no MSAA, a 1024 shadow
      // map with the follow snapping re-measured (SUNB.texel = 2 E / 1024). Idempotent; a no-op on a desktop.
      function tier(force) {
        if (!(force || LOWQ)) return null;
        if (basePixelRatio > 1.25) { basePixelRatio = 1.25; renderer.setPixelRatio(basePixelRatio); renderer.setSize(innerWidth, innerHeight); if (post) post.resize(); }
        if (post && post.msaa) post.setMsaa(false);
        if (sunLight && sunLight.shadow && sunLight.shadow.mapSize.x > 1024) {
          sunLight.shadow.mapSize.set(1024, 1024);
          if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
        }
        if (SUNB && sunLight && sunLight.shadow) SUNB.texel = 2 * SUNB.E / sunLight.shadow.mapSize.x;
        return { pixelRatio: renderer.getPixelRatio(), msaa: !!(post && post.msaa), shadow: sunLight ? sunLight.shadow.mapSize.x : 0 };
      }
      function snapshot() { return JSON.parse(JSON.stringify({ shot: C.shot, side: C.side, tc: C.tc, p: C.p, pv: C.pv, l: C.l, lv: C.lv, fov: C.fov, init: C.init, hand: C.hand })); }
      function restore(s) { if (!s) return; C.shot = s.shot; C.side = s.side; C.tc = s.tc; C.p = s.p.slice(); C.pv = s.pv.slice(); C.l = s.l.slice(); C.lv = s.lv.slice(); C.fov = s.fov; C.init = s.init; C.hand = s.hand; }

      // a first pose, so the frame before the first update is already the HERO shot
      FIT.tt = readTouchTop();
      try { snap(want(null, 0)); apply(C.p, C.l, C.fov, 0, null); } catch (e) {}
      return { cut: cut, kick: kick, update: update, state: state, fit: function () { FIT.tt = readTouchTop(); return fit(true, C.mark || MARK0); }, project: project, hero: hero, tier: tier,
        snapshot: snapshot, restore: restore, shots: SH };
    }
