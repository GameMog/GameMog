// Mog City: how this machine runs the game, first-party, sent to gamemog.com (/api/perf there) for the owner's Machines
// view, so friends testing on many machines can be seen without asking each one what they saw. Anonymous: a random id
// for this browser tab's session only (sessionStorage 'mc.perf.s', never the visit counts' id, gone with the tab), the
// graphics card's name, the browser's family and major version (never the full user-agent), the operating system's
// family, cores, memory, screen; what the game picked (js/gfx-auto.js) and how the frames ran. No cookie is set, no IP
// address is kept, nothing about the player.
// Sent:
//   load    once the city is up (and again when the story is up or start is pressed): the load's timings from the
//           navigation's start (first byte, the page's script, the renderer, each build phase, ready, the gate, the
//           story), the device and graphics, the tier Auto picked and why, the outcome (ready | stuck: no city 90 s on |
//           late: up after that | lost: the graphics device lost | error)
//   frames  a window of play in view (1 minute, then 2, 4, 8 and 16 a window, so a long session stays covered in the
//           sends a load has; and when the tab is hidden or closed): a histogram of the frame times (24 bins, 4 ms to
//           1 s), the long frames, the stalls (frames over 250 ms: their count and seconds), the resolution scale and
//           tier, what the player was doing. A machine running under 4 fps has only stalls: its window is sent too
//   event   a step down or up of the resolution or the tier, a lost graphics device
// At most 12 sends a load. Nothing is sent with Do Not Track or Global Privacy Control on, from automated browsers on
// mc.gamemog.com, or with the developer switches (as wagmi/stats.js). Only from mc.gamemog.com; on a local copy only to
// a local GameMog: ?statsto=<http://localhost:port>, or the ?host= that frames it when that is local.
// The engines call window.mcPerf?.init / frame / quality / mark / event; every call is wrapped: never in the game's way.
(() => {
  const noop = () => {};
  const stub = { on: false, code: '', init: noop, frame: noop, quality: noop, mark: noop, event: noop, flush: noop };
  window.mcPerf = stub;
  try {
    const Q = new URLSearchParams(location.search);
    const localOrigin = (s) => /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(s || '');
    let to = '';
    if (location.hostname === 'mc.gamemog.com') {
      if (navigator.webdriver) return;
      if (['nointro', 'nogate', 'fight', 'fightrules', 'm1', 'm2', 'm3', 'sandbox', 'debug', 'pursuit', 'police', 'thrusters', 'bench', 'capture'].some((k) => Q.has(k)) || Q.get('trailer') === 'only') return;
      to = 'https://gamemog.com';
    } else if (localOrigin(Q.get('statsto'))) to = Q.get('statsto');
    else if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localOrigin(Q.get('host'))) to = Q.get('host');
    else return;
    // (Do Not Track, Global Privacy Control: nothing at all)
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    const url = to + '/api/perf';

    let sid = '', n = 1;
    try { sid = sessionStorage.getItem('mc.perf.s') || ''; } catch (e) { /* blocked */ }
    if (!/^[a-f0-9-]{16,64}$/.test(sid)) {
      try { sid = crypto.randomUUID(); } catch (e) { sid = Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('-'); }
      try { sessionStorage.setItem('mc.perf.s', sid); } catch (e) { /* this load only */ }
    }
    try { n = Math.min(999, (+sessionStorage.getItem('mc.perf.n') || 0) + 1); sessionStorage.setItem('mc.perf.n', String(n)); } catch (e) { /* first */ }
    const code = sid.replace(/[^a-f0-9]/g, '').slice(0, 4).toUpperCase();
    const game = /^[A-Za-z0-9-]{1,64}$/.test(Q.get('game') || '') ? Q.get('game') : null;
    const T = () => Math.round(performance.now());

    // (12 sends a load; the quality steps get at most 5 of them, a phone's three resolution steps, its tier and one more,
    // so the slowest machines still send their frames)
    let sends = 0, events = 0;
    const send = (body) => {
      try {
        if (sends >= 12) return;
        if (body.k === 'event') { if (events >= 5) return; events++; }
        sends++;
        const json = JSON.stringify(Object.assign({ v: 1, s: sid, n, game }, body));
        if (json.length > 4000) return;
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: 'text/plain' }))) return;
        fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, credentials: 'omit', body: json }).catch(noop);
      } catch (e) { /* never in the way */ }
    };

    // ---------------------------------------------------------------- the load
    const load = { marks: {}, phases: {}, errors: 0, rejections: 0, lost: 0, outcome: '' };
    let q = null, probe = null, sentLoad = 0, readyAt = 0, allStalls = 0, allStallSecs = 0;
    const engine = () => { try { return typeof MC_CITY !== 'undefined' ? MC_CITY : 'ny'; } catch (e) { return 'ny'; } };
    addEventListener('error', () => { load.errors++; }, true);
    addEventListener('unhandledrejection', () => { load.rejections++; });
    const mark = (name, t) => { if (!(name in load.marks)) load.marks[name] = Math.round(t ?? performance.now()); };
    document.addEventListener('DOMContentLoaded', () => mark('dcl'));
    const loadBody = () => {
      const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
      const p = probe || {}, g = p.gpu || {};
      return {
        k: 'load', engine: engine(), town: (Q.get('town') || Q.get('pkg') || '').slice(0, 40) || null, pack: Q.has('pack') || Q.has('story'),
        ttfb: nav ? Math.round(nav.responseStart) : null, marks: load.marks, phases: load.phases, outcome: load.outcome,
        errors: load.errors, rejections: load.rejections, lost: load.lost, stalls: allStalls, stallSecs: Math.round(allStallSecs * 10) / 10,
        browser: p.browser, bver: p.bver, os: p.os, phone: !!p.phone, cores: p.cores, mem: p.mem, screen: p.screen, view: p.view, dpr: p.dpr,
        coarse: p.coarse, fine: p.fine, saveData: p.saveData,
        backend: q ? q.backend : null, backendWhy: p.why || null, cls: p.cls, cpuMs: p.cpuMs, probeMs: p.ms, refreshMs: p.frames ? p.frames.refreshMs : null,
        gpu: { vendor: g.vendor, arch: g.arch, device: g.device, desc: g.desc, fallback: g.fallback, renderer: (g.renderer || '').slice(0, 120) },
        limits: p.limits, caveat: !!p.caveat,
        tier: q ? q.tier : null, tierAuto: q ? q.auto : null, tierChoice: q ? q.choice : null, override: q ? q.override : null, why: q ? q.why : null
      };
    };
    const sendLoad = () => { if (sentLoad >= 3) return; sentLoad++; send(loadBody()); };
    // the city up: the load sent 3 s on (the story's ready usually lands in that time); the story or start later: again
    let pendingLoad = 0;
    const loadSoon = (ms) => { clearTimeout(pendingLoad); pendingLoad = setTimeout(sendLoad, ms); };
    setTimeout(async () => {
      if (readyAt || sentLoad) return;
      const err = !!(window.__MC_NO_WEBGPU || document.querySelector('#loading-overlay.boot-error'));
      load.outcome = load.lost ? 'lost' : err ? 'error' : 'stuck';
      // (a city that never got as far as its graphics: the machine probed here, so the report still says what it is)
      if (!probe && window.mcGfx) { try { probe = await Promise.race([window.mcGfx.probe(), new Promise((r) => setTimeout(() => r(null), 3000))]); } catch (e) { /* none */ } }
      if (readyAt || sentLoad) return;
      sendLoad();
    }, 90e3);
    addEventListener('mc:gpu-lost', (e) => {
      load.lost++;
      try { event('lost', { backend: e.detail && e.detail.backend }); } catch (x) { /* none */ }
      if (!readyAt) { load.outcome = 'lost'; sendLoad(); }
      flush();
    });
    // (the story's own messages, wagmi/storyrun/host.js: ready, error)
    addEventListener('mc:tell', (e) => {
      try {
        const d = e.detail || {};
        if (d.type === 'ready' && !('story' in load.marks)) { mark('story'); if (readyAt) loadSoon(500); }
        else if (d.type === 'error') load.errors++;
      } catch (x) { /* none */ }
    });

    // ---------------------------------------------------------------- the frames
    const BINS = 24, LO = 4, SPAN = Math.log(1000 / LO);
    // (a window is sent before any bin passes BIN_MAX, the most a bin the server keeps)
    const BIN_MAX = 65000;
    const hist = new Uint32Array(BINS);
    const whist = new Uint32Array(BINS); // (the frames' own work, the engine's loop: the same bins)
    let secs = 0, frames = 0, long50 = 0, long100 = 0, stalls = 0, stallSecs = 0, windowSecs = 0, sentFrames = 0;
    // (the windows widen as play goes on: 1, 2, 4, 8, then 16 minutes; at most 8 of them, 79 minutes of play)
    const windowLen = () => 60 * Math.min(16, 2 ** sentFrames);
    const bin = (ms) => (ms <= LO ? 0 : Math.min(BINS - 1, Math.floor((Math.log(ms / LO) / SPAN) * (BINS - 1) + 0.5)));
    const scene = () => {
      try {
        const W = window.WAGMI, mode = W && W.app && W.app.controllerManager ? W.app.controllerManager.activeMode : '';
        const M = W && W.missions && W.missions.active ? W.missions.active() : null;
        return `${engine()}:${mode || '-'}${M && M.id ? ':' + String(M.id).slice(0, 24) : ''}${W && W.cutscene && W.cutscene.active ? ':cut' : ''}`;
      } catch (e) { return engine(); }
    };
    const pct = (f, h = hist) => {
      let total = 0;
      for (let i = 0; i < BINS; i++) total += h[i];
      if (!total) return 0;
      let acc = 0;
      const want = total * f;
      for (let i = 0; i < BINS; i++) { acc += h[i]; if (acc >= want) return Math.round(LO * Math.exp((i / (BINS - 1)) * SPAN)); }
      return 1000;
    };
    function flush() {
      // (5 s of frames, or 5 s of stalls: a machine under 4 fps has no frames under 250 ms at all)
      if (!((secs >= 5 && frames) || stallSecs >= 5)) return;
      if (sentFrames >= 8) return;
      sentFrames++;
      send({ k: 'frames', scene: scene(), tier: q ? q.tier : null, scale: q && q.scale ? q.scale : 1, secs: Math.round(secs), frames, hist: Array.from(hist), long50, long100, stalls, stallSecs: Math.round(stallSecs * 10) / 10, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), work50: pct(0.5, whist), work95: pct(0.95, whist) });
      hist.fill(0); whist.fill(0); secs = 0; frames = 0; long50 = 0; long100 = 0; stalls = 0; stallSecs = 0; windowSecs = 0;
    }
    // (the first frame after the tab is hidden or back is skipped: its interval spans the time away, not the machine)
    let skipNext = false;
    document.addEventListener('visibilitychange', () => { skipNext = true; if (document.hidden) { if (!sentLoad && readyAt) sendLoad(); flush(); } });
    addEventListener('pagehide', () => { if (!sentLoad) { if (!load.outcome) load.outcome = readyAt ? 'ready' : 'left'; sendLoad(); } flush(); });

    function event(kind, data) {
      if (!/^(downgrade|upgrade|learn|lost)$/.test(kind)) return;
      send({ k: 'event', kind, data: data || {}, scene: scene(), tier: q ? q.tier : null });
    }

    window.mcPerf = {
      on: true, code,
      mark(name, t) { try { if (/^[a-zA-Z]{1,16}$/.test(name)) mark(name, t); if (name === 'gate' && readyAt) loadSoon(300); } catch (e) { /* none */ } },
      // the engine's [init] phases ("label Nms" each), as the city is up: the load's ready
      init(list) {
        try {
          for (const s of list || []) { const m = /^([a-zA-Z]{1,20}) (\d+)ms$/.exec(String(s)); if (m) load.phases[m[1]] = +m[2]; }
          readyAt = T(); mark('ready', readyAt);
          // (a city up after the 90 s 'stuck' report: late, the same load's row filled in)
          load.outcome = load.outcome === 'stuck' ? 'late' : load.outcome || 'ready';
          loadSoon(3000);
        } catch (e) { /* none */ }
      },
      quality(quality, pr) { try { q = quality; if (pr) probe = pr; } catch (e) { /* none */ } },
      // every frame: its wall time (s); counted only with the tab in view and the city up
      frame(rawDt, workMs) {
        if (!readyAt || document.hidden || skipNext) { skipNext = false; return; }
        const ms = rawDt * 1000;
        if (!(ms > 0)) return;
        if (ms > 250) {
          // (a stall's time up to 2.5 s: past that it is a pause or the tab coming back, not the machine)
          const t = Math.min(rawDt, 2.5);
          stalls++; stallSecs += t; allStalls++; allStallSecs += t; windowSecs += t;
          if (windowSecs >= windowLen()) flush();
          return;
        }
        const b = bin(ms);
        hist[b]++; frames++;
        if (workMs > 0) whist[bin(workMs)]++; secs += rawDt; windowSecs += rawDt;
        if (ms > 50) long50++;
        if (ms > 100) long100++;
        if (windowSecs >= windowLen() || hist[b] >= BIN_MAX) flush();
      },
      event(kind, data) { try { event(kind, data); } catch (e) { /* none */ } },
      flush() { try { flush(); } catch (e) { /* none */ } }
    };
  } catch (e) { window.mcPerf = stub; }
})();
