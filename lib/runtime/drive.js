/*
 * The test drive, in the creator's own browser (the owner, 30 Sep: a server
 * with no graphics card cannot drive a world at speed). Served inside a draft
 * at /d/<id>/play?drive=1, in the same sandbox as any game, it does what the
 * server's Chrome did (lib/playtest-runtime.ts, lib/key-art.ts) through the
 * runtime's own test hooks: waits for the world, measures its frame rate, lets
 * the autopilot fight or race at speed, brings the heat or the laps, shoots
 * the key art and the cover, ends the run, and reports what it measured to
 * the page that holds it. The builder judges the report (lib/test-drive.ts).
 */
(function () {
  var W = 1280, H = 720;
  window.__gmDrive = true;
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
    var theme = art.theme || {}, t = String(art.title || '').toUpperCase(), n = t.length;
    theme = { ink: theme.ink || '#000000', accent: theme.accent || '#FFFFFF', font: theme.font || 'Figtree' };
    try { await document.fonts.load('900 100px ' + theme.font); } catch (e) {}
    var wide = await grab(function (g) { title(g, 0, 0, t, theme, { left: 50, bottom: 34, width: 1180, size: n > 24 ? 92 : n > 15 ? 112 : 142, stroke: 7, drop: 8 }); }, null, 0.85);
    var icon = await grab(function (g, ox, oy) { title(g, ox, oy, t, theme, { left: 400, bottom: 122, width: 480, size: n > 24 ? 48 : n > 15 ? 58 : 72, stroke: 5, drop: 6 }); }, [384, 104, 512, 512], 0.85);
    d.film(null); d.cinematic(false);
    return { wide: wide, icon: icon };
  }

  async function run() {
    var readyMs = null;
    for (var i = 0; i < 100; i++) { if (gm().ready) { readyMs = Math.round(performance.now()); break; } await sleep(200); }
    if (readyMs === null) return { ready: false, errors: allErrors() };
    if (!rt()) return { ready: true, runtime: false, readyMs: readyMs, errors: allErrors() };
    var d = rt().debug, st = rt().state(), mobile = false;
    try { mobile = matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent); } catch (e) {}
    var base = { ready: true, runtime: true, readyMs: readyMs, mobile: mobile };
    if (st && st.open) {
      d.start(); await sleep(1500);
      d.invincible(true); d.autopilot(true);
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
      var cover = await grab(null, null, 0.8);
      d.cinematic(false);
      d.invincible(false); d.autopilot(false); d.open().hurt(9999);
      await sleep(3200);
      return Object.assign(base, { open: true, fps: fps, kos: kos, heat: o.heat, boss: sawBoss, police: sawPolice, levelReached: o.heat,
        results: (gm().results || []).length, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), hidden: hidden,
        cover: cover, artIcon: art.icon, artWide: art.wide });
    }
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
    var cover2 = await grab(null, null, 0.8);
    d.cinematic(false);
    // a crash must end the run with a result
    d.invincible(false); d.autopilot(false); d.crashInto();
    await sleep(2400);
    return Object.assign(base, { open: false, fps: fps2, levelReached: level,
      results: (gm().results || []).length, errors: allErrors(), advisories: (gm().warnings || []).slice(0, 12), hidden: hidden,
      cover: cover2, artIcon: art2 && art2.icon, artWide: art2 && art2.wide });
  }

  function send(raw) {
    var images = { cover: raw.cover || null, artIcon: raw.artIcon || null, artWide: raw.artWide || null };
    delete raw.cover; delete raw.artIcon; delete raw.artWide;
    parent.postMessage({ gm: 'drive', type: 'report', raw: raw, cover: images.cover, artIcon: images.artIcon, artWide: images.artWide }, '*');
  }
  function start() {
    run().then(send, function (e) { send({ ready: !!gm().ready, crashed: String(e && e.message || e).slice(0, 300), errors: allErrors() }); });
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
