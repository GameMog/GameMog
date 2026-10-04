      /* ==================================================== traversal == */
      // Included into openWorld() in open.js at its marker, after climb.js, so it shares the open world's
      // closure. A world turns it on with open.traversal (the owner, 2 Oct): the hero swings on a line, runs
      // and crawls on walls, perches, zips and dives with Spiderbench's traversal and animation, used with
      // its author's permission (lib/runtime/traversal, bundled as window.GameMogTraversal; see its NOTICE).
      // The open world keeps everything else: the fight, the crews (who climb after him, climb.js), the
      // coins, the HUD, the title, the intro and the camera between runs.
      //   open: { traversal: { line: '#1C1E22' } }   the grapple cable's colour
      // Keys in a run: Space jump (held: higher), right mouse held swing, E zip to the marked point (in the
      // air with none: a dash), C dive (on the ground C, or L, dodges), Shift run up and along walls, Q a boost in the
      // air; punches as ever (J, X, F, a click); G picks a weapon up. Touch: JUMP, DODGE, SWING (held), ZIP, PUNCH, RUN, GRAB.
      var TRAVO = O.traversal ? (typeof O.traversal === 'object' ? O.traversal : {}) : null;
      var TRAV = null, travLive = false, travDiveT = 9;
      function travOn() { return !!TRAV && travLive; }
      function travSetup() {
        if (!TRAVO || DERBY || !player) return;
        var GT = window.GameMogTraversal;
        if (!GT || !GT.create) { warn('open.traversal: the traversal did not load; the hero walks instead.'); return; }
        // the world's edges, as walls the traversal can neither pass nor swing from (no taller than the tallest building)
        var top = 40; W.boxes.forEach(function (b) { top = Math.max(top, b.max.y + 20); });
        var edge = [
          { min: { x: W.x0 - 4, y: -5, z: W.z0 - 4 }, max: { x: W.x0, y: top, z: W.z1 + 4 } }, { min: { x: W.x1, y: -5, z: W.z0 - 4 }, max: { x: W.x1 + 4, y: top, z: W.z1 + 4 } },
          { min: { x: W.x0 - 4, y: -5, z: W.z0 - 4 }, max: { x: W.x1 + 4, y: top, z: W.z0 } }, { min: { x: W.x0 - 4, y: -5, z: W.z1 }, max: { x: W.x1 + 4, y: top, z: W.z1 + 4 } }];
        // the body's own motion: its clips, the fight stance under the name the animation layer looks for
        var clips = player.e.clips ? player.e.clips() : [];
        clips.forEach(function (c) { if (c.name === 'fight') { var f = c.clone(); f.name = 'fightIdle'; clips.push(f); } });
        var col = null; try { if (typeof TRAVO.line === 'string') col = new THREE.Color(TRAVO.line).getHex(); } catch (e) { col = null; }
        try {
          TRAV = GT.create({ scene: scene, camera: camera, renderer: renderer, canvas: renderer.domElement, group: player.g, model: player.e.object, clips: clips,
            boxes: W.boxes.concat(edge), circles: W.circles, ground: groundAt, spawn: { x: player.x, y: null, z: player.z }, yaw: player.yaw,
            line: col != null ? { color: col } : null });
          TRAV.freeze(true);
          // the map's cars (the city's traffic) push the body and carry it on their roofs; the street sees where it is
          if (OW.map && OW.map.collide && TRAV.world) TRAV.world.collideDynamic = function (p, r, h) { return OW.map.collide(p, r, h); };
          if (OW.map && OW.map.setPlayer && TRAV.world) TRAV.world.setPlayerState = function (p, v) { OW.map.setPlayer(p, v); };
        } catch (e) { warn('open.traversal could not start: ' + (e && e.message || e)); TRAV = null; }
      }
      // a run begins: the traversal takes the hero where he stands
      function travStart() {
        travLive = true; TRAV.freeze(false);
        TRAV.teleport(player.x, player.y, player.z, player.yaw);
        TRV.mode = 'ground'; TRV.y = player.y; PL.air = 0;
      }
      // the run is over (a knockout, the results, a new run): the hero is the open world's again
      function travStop() {
        travLive = false; CAM.cine = null; if (!TRAV) return;
        try { TRAV.player.cam.extraDist = 0; } catch (e) {}
        tpReset(); TRAV.freeze(true);
        // the line lets go and is gone: a released line fades in the line's own update, which a frozen traversal no
        // longer runs, so two long steps finish it here (the strands, the hook, the splats)
        try { var wb = TRAV.player.web, hp = new THREE.Vector3(player.x, (player.y || 0) + 1.2, player.z); wb.release(); wb.update(5, hp, camera, renderer); wb.update(5, hp, camera, renderer); } catch (e) {}
        try { if (TRAV.rig._animActive) TRAV.rig._releaseAnim(); } catch (e) {}
        player.g.quaternion.identity(); player.g.rotation.y = player.yaw;
      }
      // the box the hero is on the wall of
      function travWallBox(p) {
        var g = cellAt(p.x, p.z); if (!g) return null;
        var best = null, bd = 0.7;
        for (var i = 0; i < g.b.length; i++) {
          var b = g.b[i]; if (p.y < b.min.y - 0.5 || p.y > b.max.y + 0.5) continue;
          var e = Math.hypot(p.x - clamp(p.x, b.min.x, b.max.x), p.z - clamp(p.z, b.min.z, b.max.z));
          if (e < bd) { bd = e; best = b; }
        }
        return best;
      }
      // a dive that lands among them: everyone close is thrown down
      function travTakedown(a) {
        var n = 0;
        actors.forEach(function (o) {
          if (o === a || o.ko || o.kind === 'civ' || o.fade < 1) return;
          var d = dist(a, o); if (d > 3.8 || Math.abs(o.y - a.y) > 2) return;
          hurt(o, 4 + DIR.heat * 0.4, a); var k = (3.8 - d) * 2.2 + 2, ang = yawTo(a, o.x, o.z); o.kx += Math.sin(ang) * k; o.kz += Math.cos(ang) * k; n++;
        });
        try { TRAV.player.cam.impact(0.8); } catch (e) {}
        hitstop = 0.08; thud(2.2); burst({ x: a.x, y: a.y + 0.2, z: a.z }, '#C8B48A', 26);
        if (n) say(n > 1 ? 'Dive takedown x' + n : 'Dive takedown');
      }
      // the attract demo and the films: the hero shows off on his own. He goes where the runtime's pilot
      // would take him, and every few seconds leaves the street on the line: a jump, a swing or two
      // chained with a flip off each release, a dive when there is a crowd below him, a zip now and then
      var TP = { phase: 'run', t: 0, n: 0, len: 1.6, held: {} };
      function tpKey(code, on) { if (!!TP.held[code] === !!on) return; TP.held[code] = !!on; travKey(code, on); }
      function tpReset() { for (var k in TP.held) if (TP.held[k]) travKey(k, false); TP.held = {}; TP.phase = 'run'; TP.t = 0; }
      function travPilot(a, dt) {
        var s = TRAV.state, mv = pilot(dt), cy = CAM.yaw;
        TP.t += dt;
        // the pilot's way, turned into the stick the camera sees (forward up the screen)
        var fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
        var move = mv && mv.len > 0.05 ? { x: mv.x * rx + mv.z * rz, y: mv.x * fx + mv.z * fz } : { x: 0, y: 1 };
        var below = s.mode === 'air' && TRAV.feet().y - floorAt(a.x, a.z, a.y) > 6 ? travDiveTarget(a, s) : null;
        if (TP.phase === 'run') {
          if (s.mode === 'wall') move = { x: 0, y: 1 };
          var near = false; for (var i = 0; i < actors.length; i++) { var o = actors[i]; if (o !== a && o.kind !== 'civ' && !o.ko && dist(a, o) < 7) near = true; }
          if (s.mode === 'ground' && !near && TP.t > 1.6) {
            if (TRAV.player.zipTarget && Math.random() < 0.25) { TP.phase = 'zip'; TP.t = 0; tpKey('KeyE', true); }
            else { TP.phase = 'jump'; TP.t = 0; tpKey('Space', true); }
          }
        } else if (TP.phase === 'zip') {
          if (TP.t > 0.12) tpKey('KeyE', false);
          if (TP.t > 1.4 && s.mode !== 'zip') { TP.phase = 'run'; TP.t = 0; }
        } else if (TP.phase === 'jump') {
          if (TP.t > 0.14) { tpKey('Space', false); tpKey('MouseRight', true); TP.phase = 'swing'; TP.t = 0; TP.n = 0; TP.len = 1.3 + Math.random() * 0.9; }
        } else if (TP.phase === 'swing') {
          move = { x: move.x * 0.4, y: 0.9 };   // pumped along the arc
          if (TP.t > TP.len || s.mode === 'ground') { tpKey('MouseRight', false); TP.phase = 'fly'; TP.t = 0; }
        } else if (TP.phase === 'fly') {
          if (s.mode === 'ground' || s.mode === 'perch' || s.mode === 'wall') { tpKey('KeyC', false); TP.phase = 'run'; TP.t = 0; }
          else if (below) tpKey('KeyC', true);
          else if (TP.t > 0.45 && TP.n < 2 && s.vel.y < -1) { TP.n++; tpKey('MouseRight', true); TP.phase = 'swing'; TP.t = 0; TP.len = 1.1 + Math.random() * 0.8; }
        }
        return move;
      }
      function travStep(a, dt) {
        if (!travLive) travStart();
        var s = TRAV.state;
        // the runtime's touch stick (or the demo's pilot), a punch's slowdown, the fight's stance (on the ground, with trouble near)
        var foe = 99; for (var i = 0; i < actors.length; i++) { var o = actors[i]; if (o !== a && o.kind !== 'civ' && !o.ko && Math.abs(o.y - a.y) < 2) foe = Math.min(foe, dist(a, o)); }
        var stick = demo || autopilot ? travPilot(a, dt) : IN.jOn ? { x: IN.jx, y: -IN.jy } : null;
        TRAV.steer({ move: stick, moveScale: a.stun > 0 || PL.pickT > 0 || PL.dodge || PL.hang || PL.fin ? 0 : PL.punching > 0 ? 0.2 : 1,
          combat: (foe < 7 || DIR.time - PL.fightT < 2.5) && s.mode === 'ground' });
        // squared up to whoever the punch is for; a blow's push carried into the body's own motion
        if (PL.punching > 0 && PL.lock && !PL.lock.ko && s.mode === 'ground') s.facing = yawTo(a, PL.lock.x, PL.lock.z);
        if (a.kx || a.kz) { if (s.mode === 'ground') { s.vel.x += a.kx * 0.7; s.vel.z += a.kz * 0.7; } a.kx = a.kz = 0; }
        if (CAM.shake > 0.05) { try { TRAV.player.cam.shake(CAM.shake * 0.12); } catch (e) {} }
        // one on one (open.js stepDuel): the camera comes in close (a jump in the fight too; a swing away lets it out)
        try { TRAV.player.cam.extraDist = -0.9 * DUEL.k * (s.mode === 'ground' || s.mode === 'air' ? 1 : 0); } catch (e) {}
        CAM.shake = Math.max(0, CAM.shake - dt * 2.8);
        // a dive (C held in the air) comes down on whoever is below and ahead: it steers for him
        if (s.dive) {
          travDiveT = 0;
          var tg = travDiveTarget(a, s);
          if (travDebug.trace) travDebug.trace.push({ y: +a.y.toFixed(1), z: +a.z.toFixed(1), vz: +s.vel.z.toFixed(1), vy: +s.vel.y.toFixed(1), tz: tg ? +tg.z.toFixed(1) : null });
          if (tg) {
            // the time left to fall (the dive falls at 1.55 g, g = 24), and the speed across that lands on him
            var hgt = Math.max(0.3, a.y - tg.y), vd = Math.max(0, -s.vel.y), g = 24 * 1.55, tt = Math.max(0.12, (-vd + Math.sqrt(vd * vd + 2 * g * hgt)) / g), k = 1 - Math.exp(-14 * dt);
            s.vel.x += ((tg.x - a.x) / tt - s.vel.x) * k; s.vel.z += ((tg.z - a.z) / tt - s.vel.z) * k;
          }
        } else travDiveT += dt;
        // in steps of at most 1/20 s, as Spiderbench runs it (a slow frame, or a sped-up test, would hand its line and
        // its swing a step long enough to blow up)
        var tn = Math.min(8, Math.max(1, Math.ceil(dt / 0.05)));
        for (var ti = 0; ti < tn; ti++) TRAV.update(dt / tn);
        // where he is, for everyone else: the feet, the way he faces, how fast
        var f = TRAV.feet(); a.x = f.x; a.z = f.z; a.y = f.y; a.yaw = TRAV.yaw();
        a.speed = Math.hypot(s.vel.x, s.vel.z); a.mdir = a.speed > 0.5 ? Math.atan2(s.vel.x, s.vel.z) : a.yaw;
        CAM.yaw = TRAV.camYaw();
        // the level he is on (climb.js): for the crews who climb after him, the coins and the blows
        TRV.y = f.y; TRV.vx = s.vel.x; TRV.vy = s.vel.y; TRV.vz = s.vel.z;
        TRV.mode = s.mode === 'wall' ? 'climb' : s.mode === 'ground' || s.mode === 'perch' || s.mode === 'rope' ? 'ground' : 'air';
        if (TRV.mode === 'climb') { var wb = travWallBox({ x: f.x, y: f.y + 1, z: f.z }); if (wb) TRV.wall = { b: wb, nx: s.wall.normal.x, nz: s.wall.normal.z }; else TRV.mode = 'air'; }
        PL.air = TRV.mode === 'ground' || TRV.mode === 'climb' ? 0 : Math.max(0.001, f.y - floorAt(a.x, a.z, f.y));
        var ev = TRAV.player.traversal.events;
        // landing out of a dive (or just after letting go of it): a takedown
        for (i = 0; i < ev.length; i++) if (ev[i].type === 'land' && travDiveT < 0.6) { travTakedown(a); travDiveT = 9; }
      }
      // the nearest foe below, ahead, within reach of the fall
      function travDiveTarget(a, s) {
        var hs = Math.hypot(s.vel.x, s.vel.z), fx = hs > 1 ? s.vel.x / hs : Math.sin(a.yaw), fz = hs > 1 ? s.vel.z / hs : Math.cos(a.yaw), best = null, bs = Infinity;
        for (var i = 0; i < actors.length; i++) {
          var o = actors[i]; if (o === a || o.ko || o.kind === 'civ' || o.fade < 1) continue;
          var drop = a.y - o.y; if (drop < 1.5) continue;
          var dx = o.x - a.x, dz = o.z - a.z, h = Math.hypot(dx, dz), ahead = h > 0.1 ? (dx * fx + dz * fz) / h : 1;
          // ahead or to the side within reach of the fall; anyone nearly under him, whichever way
          if (h > 5 + drop * 0.8 || (h > 3 && ahead < -0.2)) continue;
          var sc = h - ahead * 2; if (sc < bs) { bs = sc; best = o; }
        }
        return best;
      }
      // touch: the traversal's held buttons, through its input
      function travTouch() {
        tbtn('SWING', '', function (on) { if (!TRAV) return; if (on) TRAV.press('MouseRight'); else TRAV.release('MouseRight'); });
        tbtn('ZIP', '', function (on) { if (!TRAV) return; if (on) TRAV.press('KeyE'); else TRAV.release('KeyE'); });
      }
      function travKey(code, on) { if (!TRAV) return; if (on) TRAV.press(code); else TRAV.release(code); }
      var travDebug = {
        state: function () { if (!TRAV) return null; var s = TRAV.state; return { live: travLive, mode: s.mode, sub: s.sub, feet: +(s.pos.y - TRAV.H).toFixed(2), speed: +s.vel.length().toFixed(2), level: TRV.mode, anchor: s.mode === 'swing' ? s.swing.anchor.toArray().map(function (v) { return +v.toFixed(1); }) : null, zipTarget: TRAV.player.zipTarget ? TRAV.player.zipTarget.kind : null, zipCandidates: (TRAV.player.zipCandidates || []).length }; },
        press: function (code) { travKey(code, true); return true; },
        release: function (code) { travKey(code, false); return true; },
        tap: function (code, ms) { travKey(code, true); setTimeout(function () { travKey(code, false); }, ms || 120); return true; },
        // the camera turned as a mouse would turn it (pixels; dy < 0 looks up)
        look: function (dx, dy) { if (!TRAV) return false; TRAV.input.mouse.dx += +dx || 0; TRAV.input.mouse.dy += +dy || 0; return true; },
        anim: function () { try { var A = TRAV.rig.animator; return A ? { node: A.debug.node, clip: A.debug.clip, clips: TRAV.rig.allClips.length, run: A.clips.has('run'), shot: A.debug.shot || null } : null; } catch (e) { return null; } },
        clips: function () { return TRAV ? TRAV.rig.allClips.map(function (c) { return c.name; }) : null; },
      };
