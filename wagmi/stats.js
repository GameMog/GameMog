// Mog City: its own visit counts, first-party, sent to gamemog.com (/api/mc there), where they are kept apart from
// GameMog's own numbers. So the owner can see whether people come, press start, and how far the story takes them.
// Sent, against a random id this browser makes for itself (localStorage 'mc.visitor'; nothing else about the player):
//   land      the page loaded, with the site that linked here (its host only) and ?utm_source= or ?ref=
//   start     the start gate pressed (intro.js, the gate's onStart)
//   mission   a mission's title card, its name (mission/ui.js title)
//   pass      a mission passed, its name (mission/ui.js passed)
//   fail      '<mission>: <reason>' (mission/ui.js failed; the mission is the last title card's)
//   time      ms played since the last one, from the start on: only with the tab in view, and not past five minutes
//             without a key, a click, a touch or the pad. Sent when the tab is hidden or closed, and every 3 minutes
// No cookie is set and no IP address is kept. Only from mc.gamemog.com, and not from automated browsers or the
// developer starts (?nointro, ?nogate, ?fight, ?m1= ?m2= ?m3=, ?trailer=only). Anywhere else nothing is sent, unless
// ?statsto=<origin> names a local GameMog (http://localhost:<port> or http://127.0.0.1:<port>), for testing.
// The hooks call window.mcStat?.(kind, detail). Every step is wrapped: the counts never break or slow the game.
(() => {
  try {
    const Q = new URLSearchParams(location.search);
    let to = '';
    if (location.hostname === 'mc.gamemog.com') {
      if (navigator.webdriver) return;
      if (['nointro', 'nogate', 'fight', 'm1', 'm2', 'm3'].some((k) => Q.has(k)) || Q.get('trailer') === 'only') return;
      to = 'https://gamemog.com';
    } else {
      const s = Q.get('statsto') || '';
      if (!/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(s)) return;
      to = s;
    }
    const url = to + '/api/mc';

    let id = '';
    try { id = localStorage.getItem('mc.visitor') || ''; } catch (e) {}
    if (!/^[a-z0-9-]{16,64}$/i.test(id)) {
      try { id = crypto.randomUUID(); } catch (e) { id = [0, 0, 0, 0].map(() => Math.random().toString(36).slice(2, 10).padEnd(8, '0')).join('-'); }
      try { localStorage.setItem('mc.visitor', id); } catch (e) {}
    }

    // (a beacon, text/plain so another origin takes it without asking first; a fetch if the beacon is refused)
    const send = (body) => {
      try {
        body.v = id;
        const json = JSON.stringify(body);
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: 'text/plain' }))) return;
        fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, credentials: 'include', body: json }).catch(() => {});
      } catch (e) {}
    };

    const land = { k: 'land' };
    const src = Q.get('utm_source') || Q.get('ref');
    if (src) land.s = src.slice(0, 60);
    try { const r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) land.r = r.host; } catch (e) {}
    send(land);

    // play time: banked from `since` up to now, or to five minutes after the last control touched, whichever is first
    const IDLE = 5 * 60e3, EVERY = 3 * 60e3, now = () => performance.now();
    let playing = false, since = 0, last = now(), banked = 0, flushed = now(), mission = '';
    const tick = (t = now()) => {
      if (since) banked += Math.max(0, Math.min(t, last + IDLE) - since);
      since = playing && !document.hidden ? t : 0;
    };
    const flush = () => {
      tick(); flushed = now();
      if (banked >= 1000) { send({ k: 'time', ms: Math.round(banked) }); banked = 0; }
    };
    const poke = () => { const t = now(); if (t - last > IDLE) tick(t); last = t; };
    for (const t of ['keydown', 'pointerdown', 'mousemove', 'touchstart', 'wheel']) addEventListener(t, poke, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { try { if (document.hidden) flush(); else tick(); } catch (e) {} });
    addEventListener('pagehide', () => { try { flush(); } catch (e) {} });
    setInterval(() => {
      try {
        if (!playing || document.hidden) return;
        // (the pad's sticks and triggers drive the game without a key event: a held one counts as a touch)
        for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) {
          if (g && (g.buttons.some((b) => b.pressed) || g.axes.some((a) => Math.abs(a) > 0.3))) { poke(); break; }
        }
        if (now() - flushed >= EVERY) flush();
      } catch (e) {}
    }, 10e3);

    window.mcStat = (kind, detail) => {
      try {
        if (kind === 'start') { playing = true; last = now(); tick(); send({ k: 'start' }); return; }
        const d = String(detail == null ? '' : detail).replace(/\s+/g, ' ').trim().slice(0, 120);
        if (kind === 'mission' && d) { mission = d; send({ k: 'mission', d }); }
        else if (kind === 'pass' && d) send({ k: 'pass', d });
        else if (kind === 'fail') send({ k: 'fail', d: ((mission ? mission + ': ' : '') + (d || 'failed')).slice(0, 160) });
      } catch (e) {}
    };
  } catch (e) {}
})();
