// Mog City: the graphics tier for this machine, picked at boot (mcGfx.probe + mcGfx.pick), and the frame-time watch that
// keeps it playable as it runs (mcGfx.adapt). Shared by both engines (js/main.js for New York, cities/sf/js/main.js for
// San Francisco and the towns); loaded from index.html's head before either, as a plain script on window.mcGfx.
//
// The owner's rule (friend QA, 15 Nov: "Change default graphics to low if not detecting. Unplayable on high, plays smooth
// on low"): Auto is the low tier on a computer and the phone tier on a phone, and Auto only goes above low when it is
// sure. On a computer it is never sure yet: Auto stays at low whatever the machine (round-3 release judge, the owner's
// QA rule "default low"). A strong machine (a graphics card it knows to be strong, a quick check of the processor
// during the loading screen well inside its budget, frames well inside the budget at low) is only RECORDED as one that
// would earn the next tier (the 'learn' event, why 'would-earn:medium', applied: false), so climbs can be enabled later
// from the reports; a tier above low learned by an older build is ignored on a computer. A slow stretch still steps
// down (the resolution first, live, then the tier, live where the engine can, and always for the next load), and a
// tier stepped down from is not tried again for 14 days. Manual High / Medium in the pause menu and ?tier= / ?gfx=
// still win over Auto.
//
// Remembered per device in localStorage 'mc.gfx.v2' = { choice, learned: { tier, cap, at, key, reason } } (the old
// 'wagmi.gfx' choice is read too, and kept in step for older pages). `key` is a short hash of the graphics card's name,
// the backend and the browser's family and major version: a new card, driver name or browser starts measuring again.
// ?tier=low|phone|medium|high|auto (or the older ?gfx=) picks the tier for this load only.
// Nothing here goes over the network; the probe makes one throwaway WebGL 2 context and asks for the WebGPU adapter once.
(() => {
  const KEY = 'mc.gfx.v2', OLD = 'wagmi.gfx', DAY = 864e5, LEARN_DAYS = 14;
  const ORDER = { low: 0, phone: 1, medium: 2, high: 3 };
  const valid = (v) => Object.prototype.hasOwnProperty.call(ORDER, v);
  const UP = { low: 'medium', medium: 'high' };
  const DOWN = { high: 'medium', medium: 'low', phone: 'low' };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  let Q;
  try { Q = new URLSearchParams(location.search); } catch (e) { Q = new URLSearchParams(''); }

  // ------------------------------------------------------------------ the device, in families only
  function browserOf() {
    const ua = navigator.userAgent || '';
    let m;
    if ((m = ua.match(/\bFirefox\/(\d+)/))) return ['firefox', +m[1]];
    if ((m = ua.match(/\bEdg[A-Z]?\/(\d+)/))) return ['edge', +m[1]];
    if ((m = ua.match(/\bOPR\/(\d+)/))) return ['opera', +m[1]];
    if ((m = ua.match(/\bSamsungBrowser\/(\d+)/))) return ['samsung', +m[1]];
    if ((m = ua.match(/\b(?:HeadlessChrome|Chrome|CriOS)\/(\d+)/))) return ['chrome', +m[1]];
    if ((m = ua.match(/\bVersion\/(\d+).*Safari\//))) return ['safari', +m[1]];
    return ['other', 0];
  }
  function osOf() {
    const ua = navigator.userAgent || '';
    if (/\b(iPhone|iPad|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/\bAndroid\b/.test(ua)) return 'android';
    if (/\bCrOS\b/.test(ua)) return 'chromeos';
    if (/\bWindows\b/.test(ua)) return 'windows';
    if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return 'mac';
    if (/\bLinux\b/.test(ua)) return 'linux';
    return 'other';
  }
  // a phone: a coarse primary pointer and a screen no wider than 500 CSS px either way up, or touch with no mouse at all
  function isPhone() {
    const short = Math.min(screen.width || Infinity, screen.height || Infinity);
    return mm('(pointer: coarse)') && (short <= 500 || !mm('(any-pointer: fine)'));
  }
  const hash = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  };

  // ------------------------------------------------------------------ the store
  const store = {
    read() {
      let s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
      if (!s || typeof s !== 'object') s = {};
      if (!(s.choice === 'auto' || valid(s.choice))) {
        let old = null;
        try { old = localStorage.getItem(OLD); } catch (e) { /* blocked */ }
        s.choice = valid(old) ? old : 'auto';
      }
      if (s.learned && (typeof s.learned !== 'object' || !valid(s.learned.tier))) s.learned = null;
      return s;
    },
    write(s) {
      try { localStorage.setItem(KEY, JSON.stringify({ choice: s.choice || 'auto', learned: s.learned || null })); } catch (e) { /* private mode */ }
      try { if (!s.choice || s.choice === 'auto') localStorage.removeItem(OLD); else localStorage.setItem(OLD, s.choice); } catch (e) { /* private mode */ }
    }
  };

  // ------------------------------------------------------------------ the probe
  // The graphics card, as the browser names it: WebGPU's adapter info, and WebGL's renderer string (unmasked where the
  // browser allows; Firefox gives a cleaned-up name as gl.RENDERER). Then the class it is in, for pick():
  //   software  drawn without a graphics card (SwiftShader, llvmpipe, Microsoft Basic Render, a fallback adapter, or
  //             WebGL that is only there with a "major performance caveat")
  //   strong    a graphics card this list knows plays the city's higher tiers: discrete NVIDIA GeForce GTX 1070 and
  //             up, RTX x060 and up, the RTX A4000 class and up; AMD Radeon RX 5700 / 6600 / 7600 and up; Apple M3 and
  //             later, and every M-series Pro, Max and Ultra
  //   weak      integrated graphics and entry cards (Intel UHD / Iris / Arc iGPU, AMD's "Radeon Graphics" APUs, NVIDIA
  //             MX, T400-T1000, Quadro P400-P1000, Apple M1 / M2 base, Mali, Adreno, PowerVR)
  //   unknown   anything else (named nothing, or a card not on the list): treated as weak
  function classify(p) {
    const r = `${p.gpu.renderer || ''} ${p.gpu.vendor || ''} ${p.gpu.device || ''} ${p.gpu.desc || ''}`.toLowerCase();
    if (p.gpu.fallback || p.caveat || /swiftshader|llvmpipe|softpipe|lavapipe|basic render|software|warp/.test(r)) return 'software';
    let m;
    if ((m = r.match(/\brtx\s*(?:pro\s*)?a?(\d{4,5})\b/))) {
      const n = +m[1];
      if (/\brtx\s*a\d/.test(r)) return n >= 4000 ? 'strong' : 'weak'; // (the RTX A-series workstation cards)
      // (the workstation cards named in round hundreds: Quadro RTX 4000-8000, RTX 4000 / 4500 / 5000 / 6000 Ada, RTX PRO
      // 4000-6000 Blackwell; the 2000 / 3000 ones stay weak)
      if (n % 500 === 0 && n <= 8000) return n >= 4000 ? 'strong' : 'weak';
      return n % 100 >= 60 ? 'strong' : 'weak'; // (RTX 2060, 3060, 4060, 5060 and up; the x050s are not)
    }
    if ((m = r.match(/\bgtx\s*(\d{3,4})\b/))) { const n = +m[1]; return (n >= 1070 && n < 1600) || n >= 1660 ? 'strong' : 'weak'; }
    if ((m = r.match(/\brx\s*(\d{4})\b/))) { const n = +m[1]; return (n >= 9000 ? n % 100 >= 60 : n >= 6000 ? n % 1000 >= 600 : n >= 5700) ? 'strong' : 'weak'; }
    if ((m = r.match(/\bapple\s*m(\d+)\s*(pro|max|ultra)?\b/))) return m[2] || +m[1] >= 3 ? 'strong' : 'weak';
    if (/\bmx\s*\d{3}|\bquadro\b|\bt\d{3,4}\b|\bintel\b|\biris\b|\buhd\b|radeon\(tm\) graphics|radeon graphics|\bvega\s*\d|\bmali\b|\badreno\b|powervr|apple gpu/.test(r)) return 'weak';
    return 'unknown';
  }

  // A small fixed piece of arithmetic, timed: how quick the processor is (the city's traffic, people and culling run on
  // it). The best of three takes about 5 ms on a recent laptop; past CPU_SLOW_MS the machine is treated as slow
  const CPU_SLOW_MS = 24;
  // (adapt: this long of frames over 250 ms back to back is a machine under 4 fps, very slow; not a stall to skip)
  const STALL_RUN_S = 2;
  function cpuCheck() {
    let best = Infinity, a = 0.5, b = 1.5;
    for (let k = 0; k < 3; k++) {
      const t = now();
      for (let i = 0; i < 100000; i++) { a = Math.sin(a + b) * 0.5 + Math.sqrt(i + b); b = a * 0.25 + 1; }
      best = Math.min(best, now() - t);
    }
    if (a === 42.4242) console.log(''); // (keeps the loop from being optimised away)
    return Math.round(best * 10) / 10;
  }
  // The display's frame interval and the main thread's jank while the loading screen is up: ~12 frames, at most 400 ms.
  // Run after the probe's own synchronous work (the WebGL context, the processor check), never across it: that work
  // would land in the intervals and read a strong machine as slow. Its jank is the 90th percentile (p90Ms), not the
  // single worst interval: one late frame on a loading screen says nothing
  function frameSample() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== 'function' || document.hidden) { resolve(null); return; }
      const iv = [];
      let last = 0, done = false;
      const finish = () => {
        if (done) return; done = true;
        if (iv.length < 4) { resolve(null); return; }
        const s = iv.slice().sort((x, y) => x - y);
        resolve({ refreshMs: Math.round(s[s.length >> 1] * 10) / 10, p90Ms: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]), worstMs: Math.round(s[s.length - 1]), n: iv.length });
      };
      const step = (t) => {
        if (done) return;
        if (last) iv.push(t - last);
        last = t;
        if (iv.length >= 12) finish(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      setTimeout(finish, 400);
    });
  }
  function webglInfo(p) {
    let gl = null, canvas = null;
    try {
      canvas = document.createElement('canvas');
      gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
      if (!gl) {
        gl = canvas.getContext('webgl2');
        if (gl) p.caveat = true;
      }
      if (!gl) return;
      p.webgl2 = true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      p.gpu.renderer = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '').slice(0, 160);
      p.gpu.glVendor = String((dbg && gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR) || '').slice(0, 80);
      p.limits.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    } catch (e) { /* no WebGL */ } finally {
      try { gl && gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* gone */ }
    }
  }
  let probed = null;
  // Once a page; under ~0.5 s. The WebGPU adapter is asked for only where the engines would use it (as their own rule:
  // not on Firefox, not after a lost device this tab, not with ?webgpu=0)
  function probe() {
    if (probed) return probed;
    probed = (async () => {
      const t0 = now();
      const [browser, bver] = browserOf();
      const p = {
        browser, bver, os: osOf(), phone: isPhone(),
        cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0,
        screen: `${screen.width || 0}x${screen.height || 0}`, view: `${innerWidth || 0}x${innerHeight || 0}`,
        dpr: Math.round((devicePixelRatio || 1) * 100) / 100, coarse: mm('(pointer: coarse)'), fine: mm('(any-pointer: fine)'),
        saveData: !!(navigator.connection && navigator.connection.saveData),
        webgpu: false, why: '', gpu: {}, limits: {}, caveat: false, webgl2: false
      };
      const param = Q.get('webgpu');
      let lost = false;
      try { lost = sessionStorage.getItem('mc.gpu.lost') === '1'; } catch (e) { /* blocked */ }
      const allowed = !!navigator.gpu && param !== '0' && (param === '1' || (browser !== 'firefox' && !lost));
      p.why = allowed ? '' : !navigator.gpu ? 'no-webgpu' : param === '0' ? 'param' : browser === 'firefox' ? 'firefox' : 'lost-before';
      if (allowed) {
        try {
          const adapter = await Promise.race([navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }), new Promise((r) => setTimeout(() => r('timeout'), 2500))]);
          if (adapter === 'timeout') p.why = 'adapter-timeout';
          else if (!adapter) p.why = 'no-adapter';
          else {
            p.webgpu = true;
            let info = adapter.info;
            if (!info && adapter.requestAdapterInfo) { try { info = await adapter.requestAdapterInfo(); } catch (e) { info = null; } }
            if (info) Object.assign(p.gpu, { vendor: String(info.vendor || '').slice(0, 40), arch: String(info.architecture || '').slice(0, 40), device: String(info.device || '').slice(0, 60), desc: String(info.description || '').slice(0, 120) });
            p.gpu.fallback = !!(adapter.isFallbackAdapter || (info && info.isFallbackAdapter));
            const L = adapter.limits || {};
            Object.assign(p.limits, { maxTexture2D: L.maxTextureDimension2D || 0, maxStorage: L.maxStorageBufferBindingSize || 0, maxBuffer: L.maxBufferSize || 0 });
            try { p.features = ['timestamp-query', 'shader-f16'].filter((f) => adapter.features && adapter.features.has(f)); } catch (e) { /* none */ }
          }
        } catch (e) { p.why = 'adapter-error'; }
      }
      webglInfo(p);
      p.cpuMs = cpuCheck();
      // (the frames sampled only now, the synchronous checks done: see frameSample)
      p.frames = await frameSample();
      p.cls = classify(p);
      p.key = hash(`${p.gpu.renderer || p.gpu.desc || p.gpu.vendor || '?'}|${p.webgpu ? 'webgpu' : 'webgl2'}|${browser}${bver}`);
      p.ms = Math.round(now() - t0);
      return p;
    })().catch((e) => ({ error: String(e && e.message || e), cls: 'unknown', gpu: {}, limits: {}, key: '?', ms: 0 }));
    return probed;
  }

  // ------------------------------------------------------------------ the pick
  // { tier, choice, override, auto, why, learned } for this load; `tiers` the engine's own (New York: all four; San
  // Francisco: no phone tier, so 'phone' becomes 'low' there)
  function pick(p, tiers = ['low', 'phone', 'medium', 'high']) {
    const has = (t) => tiers.includes(t);
    const fit = (t) => (has(t) ? t : 'low');
    let override = Q.get('tier') || Q.get('gfx');
    if (override === 'auto' || !valid(override)) override = null;
    const s = store.read();
    let learned = s.learned;
    if (learned && (learned.key !== p.key || !(Date.now() - (learned.at || 0) < LEARN_DAYS * DAY))) learned = null;
    let auto = 'low', why = 'default';
    if (p.phone) {
      const light = (p.mem && p.mem <= 3) || (p.cores && p.cores <= 4);
      auto = light ? 'low' : 'phone'; why = light ? 'phone-light' : 'phone';
      if (learned && learned.tier === 'low') { auto = 'low'; why = 'slow-before'; }
    } else if (p.cls === 'software') why = 'software';
    else if (!p.webgpu) why = 'webgl2';
    else if (p.cls !== 'strong') why = p.cls; // weak | unknown
    else if (p.cpuMs > CPU_SLOW_MS) why = 'cpu-slow';
    else if (p.frames && (p.frames.refreshMs > 20 || (p.frames.p90Ms ?? p.frames.worstMs) > 60)) why = 'warmup-slow';
    else if (p.mem && p.mem < 8) why = 'memory';
    else if (p.cores && p.cores < 6) why = 'cores';
    // (a computer never climbs above low by itself: a tier above low learned by an older build is ignored, held low)
    else if (learned && ORDER[learned.tier] > ORDER.low) why = 'held-low';
    else if (learned && learned.reason === 'slow') why = 'slow-before';
    else why = 'measuring'; // (a strong machine: low this load, its frames recorded as what it would earn)
    auto = fit(auto);
    const choice = s.choice === 'auto' || valid(s.choice) ? s.choice : 'auto';
    const tier = fit(override || (choice === 'auto' ? auto : choice));
    return { tier, choice, override: override ? fit(override) : null, auto, why, learned, key: p.key };
  }

  // Saves the player's choice for the next load; returns the tier that load will run
  function setChoice(c) {
    const v = c === 'auto' || valid(c) ? c : 'auto';
    const s = store.read();
    s.choice = v;
    store.write(s);
    return v;
  }
  // Forgets what Auto learned on this machine (the pause menu's Reset)
  function resetLearned() {
    const s = store.read();
    s.learned = null;
    store.write(s);
  }
  function learn(rec) {
    const s = store.read();
    s.learned = Object.assign({ at: Date.now() }, rec);
    store.write(s);
    return s.learned;
  }

  // ------------------------------------------------------------------ the watch
  // Every frame of play: the resolution steps down fast when frames run slow (1.0 -> 0.85 -> 0.7 of a CSS pixel, 0.6 on
  // a phone), then the tier (tierDown(next): live where the engine can; always remembered for the next load), and the
  // resolution steps back up, slowly, when frames are well inside the budget (a tier never steps up live: that would
  // recompile the pipelines). The budget is 60 fps, or the display's own rate where that is slower; the lines it draws
  // for "slow" are capped (34 ms slow, 50 ms very slow, 40 ms at the floor) so a janky loading screen read as a slow
  // display can't loosen them. Frames over 250 ms are stalls (a compile, the pause menu), counted apart and never as
  // frame time; but STALL_RUN_S (2 s) of them back to back, at least three, is a machine running under 4 fps, not a
  // hitch: very slow. The resolution goes straight to its floor, and a run after that steps the tier down (remembered
  // as slow for the next load) once the floor has had STALL_RUN_S of real play, or 4 s of unbroken stalls, as the
  // floor's own slow stretch does. On a strong computer playing Auto, a long stretch well inside the budget at full
  // resolution is recorded as the tier it WOULD earn (never applied: Auto stays low on a computer):
  // no dropped frames (the intervals at the display's own rate) and the frame's own work (workMs, the engine's loop from
  // its start to the frame handed to the GPU) under 60% of the budget. (The intervals alone can't say a machine has room
  // to spare: with vsync they are 16.7 ms however light the frame.)
  //   o: { quality, probe, setScale(s), tierDown(next) -> bool, warmup (s, 5) }; update(rawDt, active, workMs)
  function adapt(o) {
    const q = o.quality, p = o.probe || {};
    const phone = q.tier === 'phone';
    let tierNow = q.tier; // (the tier this watch has stepped to: an engine that can't swap its tier live keeps q.tier)
    const STEPS = phone ? [1, 0.85, 0.7, 0.6] : [1, 0.85, 0.7];
    const budget = Math.max(16.7, Math.min(34, (p.frames && p.frames.refreshMs) || 16.7));
    const SLOW = Math.min(34, budget * 1.35), VERY_SLOW = Math.min(50, budget * 2), FLOOR_SLOW = Math.min(40, Math.max(28, budget * 1.6));
    // (the limit for frames "on time": never under the budget, so a 120 / 144 Hz display playing a steady 60 fps can
    // still step back up and earn a tier; its own ~8 ms interval would never be met)
    const refresh = Math.max(budget, Math.min(34, (p.frames && p.frames.refreshMs) || 16.7));
    const N = 32, win = new Float32Array(N), tmp = new Float32Array(N), work = new Float32Array(N);
    let w95 = 0;
    let n = 0, head = 0, step = 0, played = 0, slowT = 0, verySlowT = 0, fastT = 0, floorT = 0, cool = 0, goodT = 0, stalls = 0, tick = 0;
    // (the stalls: their count and seconds; the run of them back to back now, its seconds and frames; all the time in view)
    let stallS = 0, runS = 0, runN = 0, wall = 0;
    let p50 = 0, p95 = 0, learnedUp = false, downs = 0, lastUp = -1e9, upBlock = 0;
    // (the stall path's floor: the play time when it set it, and the stalls since with no frame between; the first
    // frame after the tab comes back into view is skipped, its interval spans the time away)
    let floorAt = -Infinity, floorStallS = 0, skipNext = false;
    try { document.addEventListener('visibilitychange', () => { skipNext = true; runS = 0; runN = 0; }); } catch (e) { /* no document */ }
    const hiddenNow = () => { try { return !!document.hidden; } catch (e) { return false; } };
    const tell = (kind, d) => { try { window.mcPerf && window.mcPerf.event(kind, d); } catch (e) { /* never in the way */ } };
    const setStep = (i, why) => {
      const from = STEPS[step];
      // (a step down soon after a step up: that resolution is too much here; no going up again for a minute)
      if (i > step && played - lastUp < 10) upBlock = 60;
      if (i < step) lastUp = played;
      step = i;
      try { o.setScale(STEPS[step]); } catch (e) { console.warn('[gfx] scale', e); }
      q.scale = STEPS[step];
      n = 0; head = 0; slowT = verySlowT = fastT = floorT = goodT = 0;
      tell(STEPS[step] < from ? 'downgrade' : 'upgrade', { what: 'scale', from, to: STEPS[step], why, p50, p95, at: Math.round(played) });
    };
    // the tier one step down (at the floor and still slow, or stalled): live where the engine can, remembered for the next load
    const tierStep = (why) => {
      const next = DOWN[tierNow];
      if (!next) return false;
      const from = tierNow;
      tierNow = next; // (once per step: never the same step again, nor its event and its write)
      let live = false;
      try { live = !!o.tierDown(next); } catch (e) { console.warn('[gfx] tier', e); }
      if (q.choice === 'auto' && !q.override) learn({ tier: next, cap: next, key: p.key, reason: 'slow', p50, p95 });
      q.learnedSlow = true;
      tell('downgrade', { what: 'tier', from, to: next, live, why, p50, p95, at: Math.round(played) });
      downs++;
      return true;
    };
    q.scale = 1;
    const api = {
      budget,
      get scale() { return STEPS[step]; },
      get p50() { return p50; },
      get p95() { return p95; },
      get work95() { return w95; },
      get stalls() { return stalls; },
      get stallSecs() { return Math.round(stallS * 10) / 10; },
      update(rawDt, active = true, workMs = 0) {
        const ms = rawDt * 1000;
        // (inactive, hidden, or the first frame back in view: not play, and it breaks a run of stalls)
        if (!active || !(ms > 0) || hiddenNow() || skipNext) { skipNext = false; runS = 0; runN = 0; floorStallS = 0; return; }
        // (a stall's time counted up to 2.5 s: a longer one is a pause, the tab coming back, not the machine)
        const dt = Math.min(rawDt, 2.5);
        wall += dt;
        cool = Math.max(0, cool - dt);
        if (ms > 250) {
          stalls++; stallS += dt;
          if (ms > 2500) { runS = 0; runN = 0; floorStallS = 0; return; }
          runS += dt; runN++;
          if (step === STEPS.length - 1) floorStallS += dt;
          // very slow: 2 s of stalls back to back, at least three (one long compile is not a slow machine)
          if (runS >= STALL_RUN_S && runN >= 3 && wall >= (o.warmup ?? 5) && cool <= 0) {
            // (the resolution straight to its floor, one step's event; at the floor, the tier, but only once the floor
            // has been given its chance: STALL_RUN_S of real play at it since the stall path set it, or the stalls
            // going on unbroken for twice that at the floor. One ~4 s burst is a floor, never a floor AND a tier)
            if (step < STEPS.length - 1) {
              runS = 0; runN = 0;
              setStep(STEPS.length - 1, 'stalled'); downs++;
              floorAt = played; floorStallS = 0;
              cool = 1.5;
            } else if (played - floorAt >= STALL_RUN_S || floorStallS >= 2 * STALL_RUN_S) {
              runS = 0; runN = 0;
              tierStep('stalled');
              cool = 1.5;
            }
          }
          return;
        }
        runS = 0; runN = 0; floorStallS = 0;
        played += rawDt;
        win[head] = ms; work[head] = workMs > 0 ? workMs : 0; head = (head + 1) % N; if (n < N) n++;
        if (played < (o.warmup ?? 5) || n < 20) return;
        // (the window's median and 95th percentile, four times a second: a copy sorted in place, nothing allocated)
        if ((tick += rawDt) >= 0.25) {
          tick = 0;
          tmp.set(win); const v = tmp.subarray(0, n); v.sort();
          p50 = Math.round(v[n >> 1] * 10) / 10; p95 = Math.round(v[Math.min(n - 1, Math.floor(n * 0.95))] * 10) / 10;
          tmp.set(work); const w = tmp.subarray(0, n); w.sort();
          w95 = Math.round(w[Math.min(n - 1, Math.floor(n * 0.95))] * 10) / 10;
          q.work95 = w95;
        }
        if (!p50) return;
        slowT = p50 > SLOW ? slowT + rawDt : 0;
        verySlowT = p50 > VERY_SLOW ? verySlowT + rawDt : 0;
        // (back up only with frames on time and the work with room to spare: with vsync the intervals alone never fall
        // under the budget, however light the frame)
        fastT = upBlock <= 0 && p95 <= refresh * 1.15 + 1 && w95 > 0 && w95 < budget * 0.7 ? fastT + rawDt : 0;
        upBlock = Math.max(0, upBlock - rawDt);
        goodT = step === 0 && p95 <= refresh * 1.15 + 1 && w95 > 0 && w95 < budget * 0.6 ? goodT + rawDt : 0;
        if (cool > 0) return;
        // step down, fast: the median of the last 32 frames slow for 0.75 s (very slow: 0.4 s)
        if ((slowT >= 0.75 || verySlowT >= 0.4) && step < STEPS.length - 1) { setStep(step + 1, verySlowT >= 0.4 ? 'very-slow' : 'slow'); cool = 1.5; downs++; return; }
        // at the floor and still slow (over 28 ms, ~35 fps) for 3 s: the tier, live where the engine can
        floorT = step === STEPS.length - 1 && p50 > FLOOR_SLOW ? floorT + rawDt : 0;
        if (floorT >= 3) {
          floorT = 0; cool = 4;
          tierStep('slow');
          return;
        }
        // back up, slowly: 8 s of frames on time with the work under 70% of the budget
        if (fastT >= 8 && step > 0) { setStep(step - 1, 'fast'); cool = 4; return; }
        // earned: 12 s at full resolution with frames well inside the budget, a strong machine on Auto. On a computer
        // (the owner's QA rule: default low) only recorded, never applied: the 'learn' event with what it WOULD have
        // earned, so climbs can be enabled from the data. Only a phone may learn a step (none is above its own tier now)
        if (!learnedUp && goodT >= 12 && downs === 0 && q.choice === 'auto' && !q.override && UP[q.tier] && tierNow === q.tier && q.auto === q.tier && p.cls === 'strong' && p.webgpu && q.why !== 'slow-before') {
          learnedUp = true;
          if (!p.phone) {
            q.wouldEarn = UP[q.tier];
            tell('learn', { what: 'tier', from: q.tier, to: q.tier, earned: UP[q.tier], applied: false, why: `would-earn:${UP[q.tier]}`, p50, p95, work: w95, at: Math.round(played) });
            return;
          }
          const s = store.read(), l = s.learned;
          const prev = l && l.key === p.key && Date.now() - (l.at || 0) < LEARN_DAYS * DAY ? l : null;
          if (prev && prev.cap && ORDER[UP[q.tier]] > ORDER[prev.cap]) return;
          learn({ tier: UP[q.tier], cap: prev && prev.cap ? prev.cap : 'high', key: p.key, reason: 'fast', p50, p95, work: w95 });
          q.learnedUp = UP[q.tier];
          tell('learn', { what: 'tier', from: q.tier, to: UP[q.tier], why: 'fast', p50, p95, work: w95, at: Math.round(played) });
        }
      }
    };
    return api;
  }

  // a short code for this browser tab's session, for a friend to read out ("my code is 7F3K"): wagmi/perf.js's session
  const sessionCode = () => { try { return (window.mcPerf && window.mcPerf.code) || ''; } catch (e) { return ''; } };

  window.mcGfx = { probe, pick, classify, adapt, setChoice, resetLearned, learn, store, sessionCode, ORDER, DOWN, UP, CPU_SLOW_MS, STALL_RUN_S };
})();
