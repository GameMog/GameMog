/*
 * The test drive, in the creator's own browser (the owner, 30 Sep: a server
 * with no graphics card cannot drive a world at speed). Served inside a draft
 * at /d/<id>/play?drive=1, in the same sandbox as any game, it does what the
 * server's Chrome did (lib/playtest-runtime.ts, lib/key-art.ts) through the
 * runtime's own test hooks: waits for the world, measures its frame rate, lets
 * the autopilot fight or race at speed, brings the heat or the laps, shoots
 * the key art and the cover, ends the run, and reports what it measured to
 * the page that holds it. The builder judges the report (lib/test-drive.ts).
 * A kart race (8 Oct) is driven as the server drives one: three laps on the
 * autopilot to the finish and the results, never the endless lap's levels.
 * A penalty shootout (13 Oct) likewise: three kicks at the spot, each to its
 * result, never laps (shootDrive), the sight lines from the lenses behind the
 * goal checked (lib/runtime/shoot-lens.js); then the page loads it again as a
 * phone (#phone: phoneDrive, on ctx.quality 'low').
 */
(function () {
  var W = 1280, H = 720;
  window.__gmDrive = true;
  // a penalty shootout's phone load (13 Oct, #phone: the creator's page loads the draft a second time for it): the
  // device says it is a touch screen, as a phone's does, before the runtime reads it, so the world is built on
  // ctx.quality 'low' and its phone-only code runs here (no drive before this ever ran it, and a world that threw only
  // there never loaded on a phone); phoneDrive below drives it
  var PHONE = /^#(?:.*&)?phone(?:&|$)/.test(location.hash);
  if (PHONE && window.matchMedia) {
    var mm = window.matchMedia;
    window.matchMedia = function (q) {
      if (/pointer\s*:\s*coarse/.test(String(q))) return { matches: true, media: String(q), onchange: null, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } };
      return mm.call(window, q);
    };
  }
  var frames = 0;
  (function tick() { frames++; requestAnimationFrame(tick); })();
  // a hidden tab stops the clock: what was measured then is not the world's fault
  var hidden = document.hidden;
  document.addEventListener('visibilitychange', function () { if (document.hidden) hidden = true; });
  var errs = [];
  function note(s) { s = String(s).split('\n').slice(0, 3).join(' | ').slice(0, 300); if (errs.indexOf(s) < 0) errs.push(s); }
  window.addEventListener('error', function (e) { note(e && e.message || e); });
  window.addEventListener('unhandledrejection', function (e) { note('Unhandled rejection: ' + (e && e.reason && e.reason.message || e && e.reason)); });
  var ce = console.error;
  console.error = function () {
    try { note('console.error: ' + Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : String(a); }).join(' ')); } catch (x) {}
    return ce.apply(console, arguments);
  };
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rt() { return window.__gmRuntime; }
  function gm() { return window.__gm || {}; }
  function allErrors() { var a = errs.concat(gm().errors || []); return a.filter(function (x, i) { return a.indexOf(x) === i; }).slice(0, 12); }
  function canvas() {
    var cs = Array.prototype.slice.call(document.querySelectorAll('canvas'));
    cs.sort(function (a, b) { return b.width * b.height - a.width * a.height; });
    return cs[0];
  }
  // a frame as the player sees it, after the world drew it (the drawing buffer
  // is kept while driving), cropped from the 1280x720 page; draw adds a title
  function grab(draw, crop, q) {
    return new Promise(function (res) {
      requestAnimationFrame(function () {
        try {
          var c = canvas(); if (!c) return res(null);
          var x0 = crop ? crop[0] : 0, y0 = crop ? crop[1] : 0, cw = crop ? crop[2] : W, ch = crop ? crop[3] : H;
          // the canvas, whatever size the frame is, as a centred 1280x720 picture
          var k = Math.max(W / c.width, H / c.height), ox = (c.width - W / k) / 2, oy = (c.height - H / k) / 2;
          var out = document.createElement('canvas'); out.width = cw; out.height = ch;
          var g = out.getContext('2d');
          g.drawImage(c, ox + x0 / k, oy + y0 / k, cw / k, ch / k, 0, 0, cw, ch);
          if (draw) draw(g, x0, y0);
          res(out.toDataURL('image/jpeg', q || 0.82));
        } catch (e) { res(null); }
      });
    });
  }
  // the key art's title, as lib/key-art.ts sets it in CSS: heavy, outlined in
  // the world's ink, a hard drop under it, balanced over two lines if long
  function wrap(g, t, w) {
    var words = t.split(/\s+/);
    if (g.measureText(t).width <= w || words.length < 2) return [t];
    var best = null;
    for (var k = 1; k < words.length; k++) {
      var a = words.slice(0, k).join(' '), b = words.slice(k).join(' '), m = Math.max(g.measureText(a).width, g.measureText(b).width);
      if (!best || m < best.m) best = { m: m, l: [a, b] };
    }
    return best.l;
  }
  function title(g, ox, oy, t, theme, box) {
    g.save();
    g.font = '900 ' + box.size + 'px ' + (theme.font || 'Figtree') + ', Figtree, Arial, sans-serif';
    try { g.letterSpacing = (-0.055 * box.size).toFixed(1) + 'px'; } catch (e) {}
    g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    var lines = wrap(g, t, box.width), lh = box.size * 0.82, cx = box.left + box.width / 2 - ox, bottom = H - box.bottom - oy - box.size * 0.1;
    for (var i = 0; i < lines.length; i++) {
      var y = bottom - (lines.length - 1 - i) * lh;
      // -webkit-text-stroke is centred on the outline and the fill covers its inner half
      g.strokeStyle = theme.ink; g.lineWidth = box.stroke;
      g.fillStyle = theme.ink; g.strokeText(lines[i], cx, y + box.drop); g.fillText(lines[i], cx, y + box.drop);
      g.strokeText(lines[i], cx, y);
      g.fillStyle = theme.accent; g.fillText(lines[i], cx, y);
    }
    g.restore();
  }
  async function keyArt() {
    var d = rt().debug, art = d.art(), spot = art.keyArt;
    if (spot) {
      var yaw = (Number(spot.look) || 0) * Math.PI / 180, tilt = Number(spot.tilt) || 0.15, o = d.open();
      d.autopilot(false);
      o.place(Number(spot.at[0]) || 0, Number(spot.at[1]) || 0, yaw, tilt); o.spawn('thug'); o.spawn('thug'); o.spawn('biker');
      await sleep(1900);
    }
    d.timeScale(1); d.invincible(true);
    d.film({ target: 'player', distance: -9.5, height: 2.35, fov: 46, side: -0.8, look: 1.35 }); d.cinematic(true);
    await sleep(700);
    var shots = await poster(art);
    d.film(null); d.cinematic(false);
    return shots;
  }
  // the platform's title over the frame as it stands: the wide picture and the icon's square
  async function poster(art) {
    var theme = art.theme || {}, t = String(art.title || '').toUpperCase(), n = t.length;
    theme = { ink: theme.ink || '#000000', accent: theme.accent || '#FFFFFF', font: theme.font || 'Figtree' };
    try { await document.fonts.load('900 100px ' + theme.font); } catch (e) {}
    var wide = await grab(function (g) { title(g, 0, 0, t, theme, { left: 50, bottom: 34, width: 1180, size: n > 24 ? 92 : n > 15 ? 112 : 142, stroke: 7, drop: 8 }); }, null, 0.85);
    var icon = await grab(function (g, ox, oy) { title(g, ox, oy, t, theme, { left: 400, bottom: 122, width: 480, size: n > 24 ? 48 : n > 15 ? 58 : 72, stroke: 5, drop: 6 }); }, [384, 104, 512, 512], 0.85);
    return { wide: wide, icon: icon };
  }

  // the cover: three frames, each measured (debug.look), for the builder to choose from (lib/look.ts)
  async function candidates() {
    var covers = [], looks = [];
    for (var k = 0; k < 3; k++) {
      if (k) await sleep(450);
      var m = null; try { m = rt().debug.look ? rt().debug.look() : null; } catch (e) {}
      covers.push(await grab(null, null, 0.8)); looks.push(m);
    }
    return { covers: covers, looks: looks };
  }

  /*
   * A kart race (8 Oct), driven as lib/playtest-runtime.ts's kart branch drives it on the server, the same steps and
   * the same counts, so the builder's notes are the same either way: eight karts race their laps on the autopilot
   * (K.go() past the count), the frame rate is measured at real speed, the cover is taken mid-drift, the race runs
   * time-scaled to its finish, the key art is shot from in front of your kart, and the podium and the result must come.
   * Before this a kart race was driven as the endless lap: your kart sat on the grid, the levels never came, and every
   * honest kart world failed. Whether you drifted is the race's own count (drift.most), read after the race.
   *
   * The time: the page lets a drive have 200 s it can see (app/create/generation.tsx TestDrive), the load included,
   * and the server's 3x for 104 s is up to 312 s of race. Here the race goes at 3x, and faster (to the runtime's 8x)
   * as soon as this machine's pace says it would not be home inside DEADLINE; a drive that runs out of time before
   * the race does says so (cut) and is judged unverified, never a pass, as is one whose tab went to the background.
   * The race clock decides a race that will not end (a track the karts cannot get round): once it has had the
   * server's 312 s, it is over, and judged.
   *
   * What it reports goes on with the draft (lib/test-drive.ts judge, lib/generate-game.ts), and a published Mog's
   * score is set from it (report.kart): the lap's length L and the track's signature (kart.js SIM.trackSig).
   */
  var DEADLINE = 185000, RESERVE = 15000, RACE = 312;
  async function kartDrive(d, K) {
    function ks() { return rt().state().kart; }
    function drifted(q) { return !!q.drift.most && (q.drift.most.tier >= 1 || q.drift.most.charge >= 0.4); }
    // the share of the race your kart has driven (its progress: laps done times the lap, plus where it is on this one)
    function share(q) { var me = q.karts && q.karts[0], all = q.laps * q.L; return me && all > 0 ? Math.max(0, Math.min(1, me.prog / all)) : 0; }
    d.start(); K.autopilot(true); K.go();
    await sleep(2500);
    var f0 = frames; await sleep(2500); var fps = Math.round((frames - f0) / 2.5);
    // the cover: mid-drift, at real speed (a drift well under way, its first tier reached or near it, looked for ten times a second)
    var k = ks(), drifting = false, i;
    for (i = 0; i < 300 && !drifting; i++) { await sleep(100); k = ks(); drifting = k.drift.tier >= 1 || (k.drift.dir !== 0 && k.drift.charge >= 0.4); }
    d.cinematic(true);
    var picks = await candidates();
    d.cinematic(false);
    // to the finish, at 3x; faster when, at the pace your kart has kept and the race time this machine gives a second,
    // the race would not be home inside the time left
    var scale = 3, cut = false, t0 = k.time, w = performance.now(), sim = k.time;
    K.timeScale(scale);
    while (k.state !== 'finish' && k.state !== 'podium' && k.state !== 'results' && k.time - t0 < RACE) {
      // (a tab sent to the background pauses the race, v1.js, and draws nothing: the drive is unverified whatever
      // comes next, so it says so now rather than wait out its time on a race that will not move)
      if (hidden) break;
      if (performance.now() > DEADLINE - RESERVE) { cut = true; break; }
      await sleep(400); k = ks();
      var now = performance.now(), rate = (k.time - sim) / ((now - w) / 1000), p = share(k);
      if (rate > 0 && p > 0.05 && scale < 8) {
        var need = Math.min(k.time * (1 - p) / p, t0 + RACE - k.time), left = (DEADLINE - RESERVE - now) / 1000;
        if (need / rate > left * 0.85) { scale = Math.min(8, Math.ceil(scale * need / rate / Math.max(1, left * 0.85))); K.timeScale(scale); }
      }
      sim = k.time; w = now;
    }
    var stuck = Math.max.apply(null, k.karts.map(function (q) { return q.stuck; })), lapsDone = k.lapsDone, drifts = drifting || drifted(k);
    // the key art, from in front of your kart (the platform's title over it); then the finish, the podium and the
    // result (not waited for when the drive is out of time)
    var art = { icon: null, wide: null };
    if (!hidden) {
      K.timeScale(1); K.film({ mode: 'front', distance: 7.5, height: 1.5, fov: 46 });
      art = await keyArt();
      K.film(null); K.timeScale(8);
      for (i = 0; i < 60 && k.state !== 'results' && !cut && !hidden && performance.now() < DEADLINE; i++) { await sleep(300); k = ks(); }
    }
    var results = (gm().results || []).length;
    return { open: false, kind: 'kart', fps: fps, levelReached: lapsDone, results: results, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), hidden: hidden,
      looks: picks.looks, covers: picks.covers, artIcon: art.icon, artWide: art.wide,
      kart: { L: k.L, trackSig: typeof k.trackSig === 'string' ? k.trackSig : null, laps: k.laps, lapsDone: lapsDone, place: k.place, finished: !!k.finished, estimated: !!k.est,
        drifted: drifts, stuck: +stuck.toFixed(2), fps: fps, results: results, time: k.time, share: +share(k).toFixed(3), scale: scale, cut: cut } };
  }

  /*
   * A penalty shootout (13 Oct), driven as lib/playtest-runtime.ts's shootPlaytest drives it on the server, the same
   * steps and counts (its SHOOT_KICKS, here as KICKS), so the builder's notes are the same either way. The runtime's
   * director runs the shootout (lib/runtime/shootout.js): the kick, the keeper, the ball, the camera, the HUD, the
   * sound and the board. What is driven is the world round it: the demo's frame rate at real speed, then three kicks
   * at the spot through the director's own scripted tapper (debug.shootout().tap: the press and release a player's
   * keys run), each from its walk and whistle to its result. The cover is taken at the first kick's set (the taker on
   * his mark, the keeper on his line, the ball on the spot), the key art at the second kick's strike from the lens
   * behind the goal (REVERSE, the replay's), the kick slowed to a quarter while it is shot, the platform's title over
   * it; the first kick's result and replay play out, the others are skipped. Never v1's film or cinematic: the director
   * owns the camera. Each kick must end with a result (GameMog.finish, one a kick); where the ball goes is never judged.
   * Out of time (DEADLINE) before a kick, the drive stops there (cut); in a background tab it stops at once.
   */
  var KICKS = [[-2.6, 0.5, 8], [2.9, 1.9, 11], [-0.4, 3.6, 9]], ART_Z = -48.5;
  function shootState() { try { return rt().state().shootout || {}; } catch (e) { return {}; } }
  function kickDone(q) { return q.phase === 'result' || q.phase === 'replay' || q.phase === 'retry'; }
  // the lenses behind the goal (13 Oct: lib/runtime/shoot-lens.js, served ahead of this drive in a shootout's page):
  // what of the world stands between them and the goal mouth, read once it is built (the people are the runtime's)
  function lensCheck(D) {
    try {
      if (typeof window.GameMogShootLens !== 'function') return null;
      var I = rt().debug.internals(), P = D.people ? D.people() : {}, skip = [];
      ['taker', 'keeper', 'ref'].forEach(function (k) { if (P && P[k] && P[k].object) skip.push(P[k].object); });
      return window.GameMogShootLens(I.THREE || window.THREE, I.scene, skip);
    } catch (e) { return { error: String(e && e.message || e).slice(0, 200) }; }
  }
  async function shootDrive(d, D) {
    var ss = shootState, done = kickDone;
    var calls = 0, tris = 0;
    function see(q) { var r = q && q.render; if (r) { calls = Math.max(calls, Math.round(+r.calls) || 0); tris = Math.max(tris, Math.round(+r.tris) || 0); } return q; }
    var s = see(ss()), art0 = d.art();
    // the title's face, ready before the key art
    try { await document.fonts.load('900 100px ' + ((art0.theme && art0.theme.font) || 'Figtree')); } catch (e) {}
    await sleep(2500);
    var f0 = frames; await sleep(2500); var fps = Math.round((frames - f0) / 2.5);
    see(ss());
    var lens = lensCheck(D);
    // the key art: the lens behind the goal, the HUD hidden, the kick at a quarter speed while the ball is most of the way
    // to the line (or its outcome comes), the title over it; speed and the HUD back after
    async function shootArt() {
      var out = { wide: null, icon: null };
      try {
        D.shot('REVERSE'); D.film(true); D.timeScale(0.25);
        for (var j = 0; j < 80; j++) { var q = ss(); if (q.outcome || (q.ball && q.ball.p && q.ball.p[2] <= ART_Z)) break; await sleep(50); }
        out = await poster(d.art());
      } catch (e) {}
      D.timeScale(1); D.film(false);
      return out;
    }
    var outcomes = [], kicks = 0, cut = false, picks = { covers: null, looks: [] }, art = { wide: null, icon: null }, i;
    for (var k = 0; k < KICKS.length; k++) {
      if (hidden) break;
      if (performance.now() > DEADLINE - RESERVE) { cut = true; break; }
      D.start();
      for (i = 0, s = ss(); i < 250 && s.phase !== 'set' && !hidden; i++) { await sleep(100); s = ss(); }
      if (hidden) break;
      kicks++;
      if (s.phase !== 'set') { outcomes.push('none'); break; }
      see(s);
      // the cover: the first kick's set, HUD hidden, three frames measured
      if (k === 0) { D.film(true); await sleep(120); picks = await candidates(); D.film(false); }
      D.aim(KICKS[k][0], KICKS[k][1]); D.tap(KICKS[k][2], 1.6, { releaseMs: 0 });
      var shot = false, ended = false;
      for (i = 0; i < 300 && !hidden; i++) {
        s = see(ss());
        if (k === 1 && !shot && (s.phase === 'strike' || s.phase === 'flight')) { shot = true; art = await shootArt(); s = see(ss()); }
        if (done(s)) { ended = true; break; }
        if (i >= 40 && s.phase === 'set' && !s.outcome) break;
        await sleep(100);
      }
      outcomes.push(s.outcome && typeof s.outcome.kind === 'string' ? s.outcome.kind.slice(0, 12) : 'none');
      if (!ended) break;
      // its result and replay (the first kick's play out, the others are skipped) to Kick again, where the result is posted
      for (i = 0; i < 150 && s.phase !== 'retry' && !hidden; i++) {
        if (k > 0 && (s.phase === 'result' || s.phase === 'replay')) D.skip();
        await sleep(150); s = see(ss());
      }
    }
    await sleep(300);
    s = see(ss());
    var results = (gm().results || []).length, parts = s.parts || {}, failed = Object.keys(s.failed || {});
    return { open: false, kind: 'shootout', fps: fps, levelReached: kicks, results: results, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), hidden: hidden,
      looks: picks.looks, covers: picks.covers, artIcon: art.icon, artWide: art.wide,
      shootout: { kicks: kicks, results: results, goals: s.tally ? s.tally.goals : 0, outcomes: outcomes, parts: parts, failed: failed, calls: calls || null, tris: tris || null, fps: fps, cut: cut, lens: lens } };
  }

  /*
   * A penalty shootout's phone load (13 Oct, #phone): the creator's page loads the draft a second time, as a phone (the
   * shim above), once the drive has reported, and this drives it: the demo for four seconds, then one kick through the
   * director's own tapper to its result. lib/playtest-runtime.ts shootVerdict judges it with the server's phone load:
   * that it loads there and nothing throws, that the taker and the keeper are still the runtime's own, and what a frame
   * costs there (the most draw calls and triangles seen, against the phone's budget). The frame rate is never judged:
   * this is a laptop drawing a phone's world.
   */
  async function phoneDrive(D) {
    var ss = shootState, calls = 0, tris = 0, i, s = ss(), kicked = false, ended = false;
    function see(q) { var r = q && q.render; if (r) { calls = Math.max(calls, Math.round(+r.calls) || 0); tris = Math.max(tris, Math.round(+r.tris) || 0); } return q; }
    for (i = 0; i < 16 && !hidden; i++) { await sleep(250); s = see(ss()); }
    if (!hidden) {
      D.start();
      for (i = 0, s = ss(); i < 250 && s.phase !== 'set' && !hidden; i++) { await sleep(100); s = see(ss()); }
      if (s.phase === 'set' && !hidden) {
        kicked = true;
        await sleep(400); s = see(ss());
        D.aim(KICKS[0][0], KICKS[0][1]); D.tap(KICKS[0][2], 1.6, { releaseMs: 0 });
        for (i = 0; i < 300 && !hidden; i++) { s = see(ss()); if (kickDone(s)) { ended = true; break; } if (i >= 40 && s.phase === 'set' && !s.outcome) break; await sleep(100); }
        // to Kick again, where its result is posted (its result and replay skipped)
        for (i = 0; i < 150 && ended && s.phase !== 'retry' && !hidden; i++) { if (s.phase === 'result' || s.phase === 'replay') D.skip(); await sleep(150); s = see(ss()); }
      }
    }
    await sleep(300); s = see(ss());
    var coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) {}
    return { coarse: coarse, hidden: hidden, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), calls: calls || null, tris: tris || null,
      parts: s.parts || {}, failed: Object.keys(s.failed || {}), kicked: kicked, ended: ended, results: (gm().results || []).length };
  }
  // a shootout's page, known before it is ready (it downloads about 28 MB): the page says so (window.__gmKind), or, on a
  // page that does not, the shootout runtime is in it (its world's maker, which only that runtime carries)
  function shootPage() {
    if (typeof window.__gmKind === 'string') return window.__gmKind === 'shootout';
    var mark = 'shootout' + 'World(', ss = document.scripts;
    for (var i = 0; i < ss.length; i++) if (!ss[i].src && ss[i].text.indexOf(mark) >= 0) return true;
    return false;
  }

  async function run() {
    var readyMs = null, shoot = shootPage();
    // a shootout's phone load: only what a phone runs, then the report (phone: true, so the page knows which it is)
    if (PHONE) {
      // (a world that failed to build never will: said at once, not after the minute)
      for (var pi = 0; pi < 300; pi++) { if (gm().ready) { readyMs = Math.round(performance.now()); break; } if (pi >= 10 && allErrors().some(function (e) { return /failed to build/.test(e); })) break; await sleep(200); }
      if (readyMs === null) return { phone: true, ready: false, errors: allErrors() };
      var pd = rt() && rt().debug, pst = rt() ? rt().state() : null;
      if (!pd || !pst || !pst.shootout || !pd.shootout || !pd.shootout()) return { phone: true, ready: true, runtime: !!rt(), shootout: false, readyMs: readyMs, errors: allErrors() };
      return Object.assign({ phone: true, ready: true, runtime: true, shootout: true, readyMs: readyMs }, await phoneDrive(pd.shootout()));
    }
    // (a kart race, its guard in front of its runtime: kart-guard.js, sends its eight racers before its first frame,
    // tens of megabytes down the creator's own line, not the server's: a minute for it, 20 s for any other world; a
    // penalty shootout, about 28 MB of people, sky and crowd, a minute too)
    var waits = window.KartGuard || shoot ? 300 : 100;
    for (var i = 0; i < waits; i++) { if (gm().ready) { readyMs = Math.round(performance.now()); break; } await sleep(200); }
    // (a kart race says so, for the judge: one that has not loaded with nothing thrown is unverified, not failed; and a shootout)
    if (readyMs === null) return window.KartGuard ? { ready: false, kind: 'kart', errors: allErrors() } : shoot ? { ready: false, kind: 'shootout', errors: allErrors() } : { ready: false, errors: allErrors() };
    if (!rt()) return { ready: true, runtime: false, readyMs: readyMs, errors: allErrors() };
    var d = rt().debug, st = rt().state(), mobile = false;
    try { mobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent); } catch (e) {}
    var base = { ready: true, runtime: true, readyMs: readyMs, mobile: mobile };
    // the world's own soundtrack as the runtime plays it (v1.js state().soundtrack, 9 Oct; null for none): a Mog that
    // kept its original's publishes it only if this drive heard it (lib/world-options.ts publishedSoundtrack)
    if (st && 'soundtrack' in st) base.soundtrack = st.soundtrack;
    if (st && st.open) {
      // a library map (the city) builds after the page is ready: drive the world it makes, not the build
      for (var w = 0; w < 150 && !(rt().state().open || {}).ready; w++) await sleep(200);
      d.start(); d.invincible(true); d.autopilot(true);
      // the frame rate of play once it has settled (the first people built, the resolution found: v1.js adapt)
      await sleep(4000);
      var f0 = frames; await sleep(2500); var fps = Math.round((frames - f0) / 2.5);
      d.timeScale(4);
      var o = rt().state().open;
      for (var k = 0; k < 60 && o.kos < 4; k++) { await sleep(400); o = rt().state().open; }
      var kos = o.kos;
      d.open().heat(3);
      var sawBoss = false, sawPolice = false;
      for (k = 0; k < 40; k++) { await sleep(300); o = rt().state().open; sawBoss = sawBoss || !!o.boss; sawPolice = sawPolice || o.police.length > 0; if (sawBoss && sawPolice) break; }
      d.timeScale(1); await sleep(1500);
      var art = await keyArt();
      d.cinematic(true); d.film(null); await sleep(600);
      var picks = await candidates();
      d.cinematic(false);
      d.invincible(false); d.autopilot(false); d.open().hurt(9999);
      await sleep(3200);
      return Object.assign(base, { open: true, fps: fps, kos: kos, heat: o.heat, boss: sawBoss, police: sawPolice, levelReached: o.heat,
        results: (gm().results || []).length, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), hidden: hidden,
        looks: picks.looks, covers: picks.covers, artIcon: art.icon, artWide: art.wide });
    }
    // a penalty shootout: kicks at the spot, not laps (its own drive, above)
    if (st && st.shootout && d.shootout && d.shootout()) return Object.assign(base, await shootDrive(d, d.shootout()));
    // a kart race: no endless lap and no crash to end it (its own drive, below)
    if (st && st.kart && d.kart && d.kart()) return Object.assign(base, await kartDrive(d, d.kart()));
    d.start(); await sleep(3600);
    // real speed, driven, collisions off: the frame rate a player would get
    d.invincible(true); d.autopilot(true);
    var f1 = frames; await sleep(2500); var fps2 = Math.round((frames - f1) / 2.5);
    // lap 3, quickly: a small field round the player, the moment for the key art
    d.timeScale(6);
    var s = rt().state();
    for (var j = 0; j < 70 && s.level < 3; j++) { await sleep(400); s = rt().state(); }
    var art2 = s.level >= 3 ? await keyArt() : null;
    d.timeScale(6);
    for (j = 0; j < 70 && s.level < 5; j++) { await sleep(400); s = rt().state(); }
    var level = s.level;
    // the cover: real speed, a rival in frame ahead
    d.timeScale(1);
    for (j = 0; j < 40; j++) { s = rt().state(); if (s.rivals.some(function (r) { return r.ahead > 6 && r.ahead < 22; })) break; await sleep(150); }
    d.cinematic(true); await sleep(60);
    var picks2 = await candidates();
    d.cinematic(false);
    // a crash must end the run with a result
    d.invincible(false); d.autopilot(false); d.crashInto();
    await sleep(2400);
    return Object.assign(base, { open: false, fps: fps2, levelReached: level,
      results: (gm().results || []).length, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), hidden: hidden,
      looks: picks2.looks, covers: picks2.covers, artIcon: art2 && art2.icon, artWide: art2 && art2.wide });
  }

  function send(raw) {
    var images = { covers: raw.covers || null, artIcon: raw.artIcon || null, artWide: raw.artWide || null };
    delete raw.covers; delete raw.artIcon; delete raw.artWide;
    parent.postMessage({ gm: 'drive', type: 'report', raw: raw, covers: images.covers, artIcon: images.artIcon, artWide: images.artWide }, '*');
  }
  function start() {
    run().then(send, function (e) { send({ ready: !!gm().ready, crashed: String(e && e.message || e).slice(0, 300), errors: allErrors() }); });
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
