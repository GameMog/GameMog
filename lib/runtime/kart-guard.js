/*
 * The kart guard (8 Oct; lib/runtime/kart-guard.js): rides in front of a kart race's runtime only (lib/custom-game.ts
 * runtimeSource), so no other world carries a byte of it. A phone that loses its graphics or a race that throws shows
 * a card ("Graphics reset, tap to reload") in place of a black frame or a dead tab, and the page under the frame is
 * told what happened (type 'kart-report') and how far the boot got (type 'kart-step'): the frame has no network of
 * its own, so the page sends the report on (POST /api/kart-report). Nothing personal goes out: the device's class,
 * screen, memory, GPU name, the step reached and the error's first lines.
 *
 * Its whole API, for the runtime to name the boot's steps (optional; it also works them out itself: the graphics
 * context, downloads, image decodes, ready, racing):  KartGuard.step('crowd')
 *
 * The switches (the owner's phone, 8 Oct: Chrome for Android crashed where Firefox ran): ?kdiag=nomusic,noitems on the
 * game page's address rides into the play frame's, read here, first, into window.KartDiag, and each one takes a part
 * of the race out whole, so a crash that goes away with one names it. nomusic (no score, no OfflineAudioContext),
 * nosfx (no engines, crowd or effects), noaudio (no AudioContext at all), noprep (nothing made ahead on the start
 * screen, no renderer.compile), noitems (no items, no crates), lowlod (the racers' far level only), nopost (no bloom,
 * grade or multisampled target), noshadow, nomorph (no expressions), noguard (none of this file's wrappers; its steps
 * still go to the page) and lowdpr (one pixel a point). And the steps a trail: the last few, with their times and the
 * heap, go with each one to the page, which keeps them for the next load to report.
 */
(function () {
  if (window.KartGuard) return;
  var W = window, G = W.GameMog || {}, perf = W.performance || { now: Date.now };
  var SWITCHES = ['nomusic', 'nosfx', 'noaudio', 'noprep', 'noitems', 'lowlod', 'nopost', 'noshadow', 'nomorph', 'noguard', 'lowdpr'];
  var diag = { list: [] };
  try {
    var q = /[?&]kdiag=([^&#]*)/.exec(W.location.search || '');
    if (q) decodeURIComponent(q[1]).toLowerCase().split(/[\s,+]+/).forEach(function (k) { if (SWITCHES.indexOf(k) >= 0 && !diag[k]) { diag[k] = true; diag.list.push(k); } });
  } catch (e) {}
  // (no AudioContext at all is no score and no effects as well)
  if (diag.noaudio) { diag.nomusic = diag.nosfx = true; }
  W.KartDiag = Object.freeze(diag);
  var t0 = perf.now(), step = 'runtime', isReady = false, lost = false, card = null, sent = 0, gpu = '', glCanvas = null;
  var lastFrame = 0, downloads = 0, decodes = 0, trail = [];
  function post(m) { m.source = 'gamemog'; m.gameId = G.id; try { parent.postMessage(m, '*'); } catch (e) {} }
  function ms() { return Math.round(perf.now() - t0); }
  function heapMb() { var m = W.performance && W.performance.memory; return m ? Math.round(m.usedJSHeapSize / 1048576) : -1; }
  function setStep(s) {
    s = String(s).replace(/[^\w .:/()+-]/g, '').slice(0, 60);
    if (!s || s === step) return;
    step = s;
    // (the trail: the last 14 steps, each with when it came and the heap then, in MB)
    var h = heapMb();
    trail.push(s + ' @' + ms() + (h >= 0 ? ' ' + h + 'M' : ''));
    if (trail.length > 14) trail.shift();
    // (with what the guard knows, so the page can report a boot that took the whole tab down with it)
    post({ type: 'kart-step', step: s, t: ms(), info: info() });
  }
  var coarse = false; try { coarse = W.matchMedia('(pointer: coarse)').matches; } catch (e) {}
  // (the runtime's own rule for its quality tier, v1.js: a touch screen or a small one is 'low')
  var tier = coarse || Math.min(W.screen.width || 1280, W.screen.height || 720) < 600 ? 'low' : 'high';

  function info() {
    var mem = W.performance && W.performance.memory, nav = W.navigator || {};
    return {
      step: step, t: ms(), ready: isReady, lost: lost, tier: tier,
      mem: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
      screen: (W.screen.width || 0) + 'x' + (W.screen.height || 0), view: (W.innerWidth || 0) + 'x' + (W.innerHeight || 0),
      dpr: Math.round((W.devicePixelRatio || 1) * 100) / 100, gpu: gpu || null,
      heap: mem ? { used: Math.round(mem.usedJSHeapSize / 1048576), limit: Math.round(mem.jsHeapSizeLimit / 1048576) } : null,
      downloads: downloads, decodes: decodes, diag: diag.list.join(',') || null, trail: trail.slice(),
    };
  }
  // (a URL's query and fragment never leave: the fragment carries the player's character)
  function clean(s, n) { return String(s == null ? '' : s).replace(/[?#][^\s)'"]*/g, '').slice(0, n); }
  function report(kind, err) {
    if (sent >= 3) return;
    sent++;
    var r = info();
    r.kind = kind;
    if (err) {
      r.message = clean(err.message || err, 300);
      r.stack = clean(String(err.stack || '').split('\n').slice(0, 6).join('\n'), 600);
    }
    post({ type: 'kart-report', report: r });
  }

  function show(title, body) {
    if (card || !document.body) return;
    card = document.createElement('div');
    card.setAttribute('role', 'alert');
    card.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(6,8,14,.82);font:500 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;cursor:pointer;-webkit-tap-highlight-color:transparent';
    card.innerHTML = '<div style="max-width:320px;margin:16px;padding:22px 22px 18px;border-radius:16px;background:#151a26;box-shadow:0 10px 40px rgba(0,0,0,.5);text-align:center">'
      + '<div style="font-size:20px;font-weight:800;margin-bottom:6px"></div><div style="opacity:.8;margin-bottom:16px"></div>'
      + '<div style="display:inline-block;padding:10px 22px;border-radius:999px;background:#ffd23f;color:#151a26;font-weight:800">Tap to reload</div></div>';
    card.firstChild.childNodes[0].textContent = title;
    card.firstChild.childNodes[1].textContent = body;
    card.addEventListener('click', function () { try { W.location.reload(); } catch (e) {} });
    document.body.appendChild(card);
  }

  W.KartGuard = {
    step: setStep,
    // (for checks: what the guard knows)
    state: function () { var r = info(); r.card = !!card; return r; },
  };
  post({ type: 'kart-step', step: step, t: 0, info: info() });
  // (noguard: the steps only, none of the wrappers below)
  if (diag.noguard) return;

  // the graphics: the first WebGL context made is the race's; its name is read once, while it is alive
  function watch(c, gl) {
    if (glCanvas) return;
    glCanvas = c;
    try {
      var x = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').slice(0, 120);
    } catch (e) {}
    c.addEventListener('webglcontextlost', function (e) {
      // (kept restorable; the card stays all the same: a race's textures do not come back with it)
      try { e.preventDefault(); } catch (er) {}
      if (lost) return;
      lost = true;
      report('context-lost');
      show('Graphics reset', 'Your device paused the race\'s graphics.');
    });
    c.addEventListener('webglcontextrestored', function () { post({ type: 'kart-step', step: step + ' (graphics back)', t: ms(), info: info() }); });
    setStep('graphics');
  }
  var getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) {
    var gl = getContext.apply(this, arguments);
    if (gl && !glCanvas && /^(webgl2?|experimental-webgl)$/.test(type)) watch(this, gl);
    return gl;
  };

  // the boot's progress, as it happens: the library's downloads and image decodes, counted
  if (W.fetch) {
    var f0 = W.fetch;
    W.fetch = function (u) {
      var p = f0.apply(W, arguments);
      if (/\/assets\//.test(String(u && u.url || u))) { downloads++; if (!isReady && downloads % 4 === 1) setStep('downloading (' + downloads + ')'); }
      return p;
    };
  }
  if (W.createImageBitmap) {
    var b0 = W.createImageBitmap;
    W.createImageBitmap = function () {
      decodes++;
      if (!isReady && (decodes === 1 || decodes % 8 === 0)) setStep('decoding images (' + decodes + ')');
      return b0.apply(W, arguments);
    };
  }
  // frames: an error mid-race is fatal only when the frames stop after it
  var raf = W.requestAnimationFrame;
  W.requestAnimationFrame = function (cb) {
    return raf.call(W, function (t) { lastFrame = perf.now(); cb(t); });
  };
  if (G.ready) {
    var ready0 = G.ready;
    G.ready = function () { if (!isReady) { isReady = true; if (card && !lost) { card.remove(); card = null; } setStep('ready'); setTimeout(function () { setStep('racing'); }, 0); } return ready0.apply(this, arguments); };
  }

  function failed(kind, err) {
    var msg = String(err && (err.name || '') + ' ' + (err.message || err) || '');
    // (a sound the browser would not play yet, or a load the race itself cancelled, is not a failure)
    if (/NotAllowedError|AbortError|play\(\) request was interrupted/.test(msg)) return;
    report(kind, err);
    if (lost) return;
    // (mid-race: no frame since; while loading: no step since, and not ready)
    var at = perf.now(), was = step, booting = !isReady;
    setTimeout(function () {
      if (card || lost) return;
      var stopped = booting ? !isReady && step === was : !document.hidden && lastFrame < at + 200;
      if (stopped) show('The race hit a snag', booting ? 'Something went wrong while it loaded.' : 'Something went wrong mid-race.');
    }, booting ? 8000 : 2000);
  }
  W.addEventListener('error', function (e) { if (e && e.message) failed('error', e.error || { message: e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '') }); });
  W.addEventListener('unhandledrejection', function (e) { failed('rejection', e && e.reason); });
})();
