// Mog City: the car radio. It starts OFF, in every city and every story pack: getting in a car plays nothing until the
// player turns it on, and the choice is remembered on this device (localStorage 'wagmi.radio': { on, station }), so
// once on it stays on. Its one station is MOG MUSIC: the owner's own songs (media/mog-music, all rights reserved),
// shuffled, every song once before any comes round again, streamed one at a time (nothing is fetched, not even the
// song list, until the player turns it on; the next song is readied only in the current one's last 12 s).
// In the car it plays full; on foot it carries on from the car, muffled and fading with distance, and past 34 m (or
// through a cutscene, or with the pause menu up) it stops where it is in the song and picks up from there when he is
// back in range or back in the car. Speech ducks it; the pause menu's Music and Master sliders set its level.
//   In the car:  T  radio on / off   R  on, or skip the song   (pad: D-pad down · right, left a song back;
//                touch: RADIO tapped skips or turns it on, held 0.6 s turns it off)
//   Pause menu:  Sound  Mog Music on / off, skip the song
// The card top centre shows MOG MUSIC and the song's title as you get in, switch, skip and as a new song starts.
// The old stations (wagmi/radio/stations.js, each on its own clock: tune in and you land wherever it is) are only on
// the dial with ?stations=all (a dev switch): the game itself plays no music but the owner's.
// Two decks (media elements: nothing decoded whole) crossfade at a song's end (and, for the old stations, in step at a
// short track's loop).
import { STATIONS } from './stations.js';

// Mog Music: its folder (beside the page wherever the page is: resolved from this module) and its level (the songs are
// mastered hot; this sits them about where the old stations' -16 LUFS did; a song's own `gain` in the manifest, if
// any, on top)
const MOG_DIR = new URL('../../media/mog-music/', import.meta.url).href;
const MOG_GAIN = 0.5;
const STORE = 'wagmi.radio';
const LEGACY = (() => { try { return new URLSearchParams(location.search).get('stations') === 'all'; } catch { return false; } })();
const load = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

const XF = 0.35;          // crossfade (s)
const TARGET = -16;       // every track evened to this loudness (LUFS)
const FAR = 34;           // on foot: the car's radio heard out to here (m)

export function createRadio(W, out) {
  const app = W.app, cm = app.controllerManager, car = W.car, person = W.person;
  const legacy = LEGACY ? STATIONS.map((s) => ({ ...s, tracks: s.tracks.filter((t) => t.dur > 0) })).filter((s) => s.tracks.length) : [];
  // (Mog Music's songs: from its manifest, once it is first turned on)
  const MOG = { id: 'mog', name: 'MOG MUSIC', freq: '', tag: 'Mog Music', color: '#FFC93C', mog: true, tracks: [] };
  const stations = [MOG, ...legacy];
  // each old station's running order: segments of its tracks (a short one's loop heard again), its length, its clock
  for (const s of legacy) {
    s.segs = [];
    for (const t of s.tracks) {
      s.segs.push({ t, from: 0, to: t.loop ? t.loop.end : t.dur });
      for (let i = 1; i < (t.plays || 1); i++) s.segs.push({ t, from: t.loop.start, to: t.loop.end });
    }
    s.len = s.segs.reduce((a, g) => a + g.to - g.from, 0);
    s.epoch = performance.now() / 1000 - Math.random() * s.len;
  }
  const saved = load();
  const R = {
    stations, on: saved.on === true, idx: Math.max(0, stations.findIndex((s) => s.id === saved.station)), first: LEGACY, paused: false,
    get station() { return stations[R.idx] || null; },
    // where a station is now: its segment and the time into it
    where(s, now = performance.now() / 1000) {
      let p = ((now - s.epoch) % s.len + s.len) % s.len;
      for (let i = 0; i < s.segs.length; i++) { const g = s.segs[i], d = g.to - g.from; if (p < d) return { i, off: p }; p -= d; }
      return { i: 0, off: 0 };
    },
  };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ on: !!R.on, station: R.station?.id || 'mog' })); } catch {} };

  /* ------------------------------------------------------------ sound -- */
  let g = null; // the graph, built on first need: two decks -> sum -> muffle -> pan -> level -> duck -> the music bus
  function graph() {
    if (g) return g;
    const ctx = out.ctx(); if (!ctx) return null;
    const sum = ctx.createGain(), lp = ctx.createBiquadFilter(), pan = ctx.createStereoPanner(), level = ctx.createGain(), duck = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5; level.gain.value = 0;
    sum.connect(lp); lp.connect(pan); pan.connect(level); level.connect(duck); duck.connect(out.bus('music'));
    const deck = () => {
      const el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous';
      const src = ctx.createMediaElementSource(el), gain = ctx.createGain(); gain.gain.value = 0; src.connect(gain); gain.connect(sum);
      const d = { el, gain, seg: null, st: null, live: false };
      el.addEventListener('ended', () => { if (d.live && d === cur) next(true); });
      // (a song that won't load: the next one, a few times at most in a row)
      el.addEventListener('error', () => { if (d.live && d === cur && d.st?.mog && mog.fails++ < 3) setTimeout(() => { if (d.live && d === cur) mogNext(0.05); }, 400); });
      return d;
    };
    g = { ctx, sum, lp, pan, level, duck, decks: [deck(), deck()] };
    return g;
  }
  let cur = null, playing = false;
  const t = () => g.ctx.currentTime;
  const ramp = (p, v, secs) => { p.cancelScheduledValues(t()); p.setValueAtTime(p.value, t()); p.linearRampToValueAtTime(v, t() + Math.max(0.01, secs)); };
  const trackGain = (tr) => Math.pow(10, (TARGET - (tr.lufs ?? TARGET)) / 20);
  // start a deck on a segment of station s, off seconds into it, faded in over secs
  // (each file fetched whole and played from memory: a plain static server, python's among them, can't serve the byte
  // ranges a media element needs to seek, and the radio seeks all the time)
  // (the last KEEP files asked for are kept; an older one is let go once neither deck nor the street's stereo has it
  // loaded, so a long drive round every station doesn't hold every track in memory: 2-4.5 MB each)
  const blobs = new Map(), urls = new Map(), KEEP = 6;
  const blob = (file) => {
    if (blobs.has(file)) { const p = blobs.get(file); blobs.delete(file); blobs.set(file, p); return p; }
    blobs.set(file, fetch(file).then((r) => { if (!r.ok) throw new Error(file); return r.blob(); }).then((b) => { const u = URL.createObjectURL(b); urls.set(file, u); return u; }).catch((e) => { blobs.delete(file); throw e; }));
    if (blobs.size > KEEP) {
      const loaded = new Set([...(g ? g.decks.map((d) => d.el.src) : []), boom.d?.src]);
      for (const f of [...blobs.keys()]) {
        if (blobs.size <= KEEP) break;
        const u = urls.get(f); if (!u || loaded.has(u)) continue; // (still coming, or loaded on a deck)
        blobs.delete(f); urls.delete(f); URL.revokeObjectURL(u);
      }
    }
    return blobs.get(file);
  };
  function start(d, s, i, off, secs) {
    const seg = s.segs[i], asked = performance.now();
    d.seg = i; d.st = s; d.live = true; d.gain.gain.value = 0; d.ready = seg.t.file;
    const tok = (d.tok = {});
    blob(seg.t.file).then((url) => {
      if (d.tok !== tok || !d.live) return;
      // (late by however long the fetch took: the station's clock ran on)
      const go = () => {
        if (d.tok !== tok || !d.live) return; try { d.el.currentTime = seg.from + off + (performance.now() - asked) / 1000; } catch {}
        // (ready while the game is paused: it starts on Resume)
        if (R.paused) d.el.wasOn = true; else { const p = d.el.play(); if (p && p.catch) p.catch(() => {}); }
        ramp(d.gain.gain, trackGain(seg.t), secs);
      };
      if (d.el.src !== url) { d.el.src = url; d.el.addEventListener('loadedmetadata', go, { once: true }); } else go();
    }).catch(() => { if (d.tok === tok) d.live = false; });
  }
  function halt(d, secs) {
    if (!d || !d.live) return; d.live = false; ramp(d.gain.gain, 0, secs);
    setTimeout(() => { if (!d.live) d.el.pause(); }, secs * 1000 + 60);
  }
  // tune in: Mog Music where it was (or its next song); an old station wherever its clock says
  function tune(secs = 0.25) {
    if (!graph()) return;
    if (R.station?.mog) return mogTune(secs);
    // (the first time ever: MOG FM from the top, the theme)
    if (R.first) { R.first = false; R.idx = 0; stations[0].epoch = performance.now() / 1000 - 0.01; }
    const s = R.station, w = R.where(s);
    const d = g.decks.find((x) => x !== cur) || g.decks[0];
    halt(cur, 0.12); cur = d; start(d, s, w.i, w.off, secs); playing = true;
  }
  // the next segment, crossfaded (ended: the deck ran out, no fade to make). A loop heard again comes in exactly as far
  // before its start as the one going out is before its end, so the two are in step through the fade
  function next(ended = false) {
    if (cur?.st?.mog) return mogNext(ended ? 0.05 : XF);
    const s = cur.st, i = (cur.seg + 1) % s.segs.length, d = g.decks.find((x) => x !== cur), left = s.segs[cur.seg].to - cur.el.currentTime;
    const off = !ended && s.segs[i].from > 0 ? -Math.max(0, Math.min(XF, left)) : 0;
    halt(cur, ended ? 0.01 : XF); cur = d; start(d, s, i, off, ended ? 0.05 : XF);
  }
  function stopAll(secs = 0.4) {
    if (!g) return;
    // (Mog Music: where it was, to pick up from there)
    if (cur?.st?.mog && cur.song) { mog.song = cur.song; mog.at = cur.el.currentTime || 0; mog.deck = cur; }
    mog.ask++;
    for (const d of g.decks) halt(d, secs); cur = null; playing = false;
  }

  /* ------------------------------------------------------- Mog Music -- */
  // list: the manifest's songs; order: the shuffle (every song once a round, a new order each round, never the same
  // song twice running across rounds); pos: where in it; song, at, deck: the song stopped mid-way, to pick up again
  const mog = { list: null, p: null, order: [], pos: -1, song: null, at: 0, deck: null, ask: 0, fails: 0 };
  const mogLoad = () => mog.p || (mog.p = fetch(MOG_DIR + 'manifest.json').then((r) => { if (!r.ok) throw new Error('no manifest (' + r.status + ')'); return r.json(); })
    .then((m) => { mog.list = (Array.isArray(m?.songs) ? m.songs : []).filter((x) => x && typeof x.file === 'string' && /^[a-z0-9-]+\.mp3$/.test(x.file)); MOG.tracks = mog.list; return mog.list; })
    // (no list (a fork without the songs, a network blip): nothing to play, asked again in 30 s)
    .catch((e) => { console.warn('[wagmi] Mog Music:', e.message || e); setTimeout(() => { mog.p = null; }, 30000); return []; }));
  function mogAt(k) {
    const n = mog.list.length;
    while (mog.order.length <= k) {
      const a = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (n > 1 && mog.order.length && a[0] === mog.order[mog.order.length - 1]) [a[0], a[n - 1]] = [a[n - 1], a[0]];
      mog.order.push(...a);
    }
    return mog.list[mog.order[k]];
  }
  const mogUrl = (song) => MOG_DIR + song.file;
  // a deck on a song, at seconds into it, faded in over secs (streamed: the element asks for what it needs)
  function mogStart(d, song, at, secs) {
    d.live = true; d.st = MOG; d.song = song; d.seg = null; d.gain.gain.value = 0; d.ready = song.file;
    const tok = (d.tok = {}), url = mogUrl(song);
    const go = () => {
      if (d.tok !== tok || !d.live) return;
      try { if (Math.abs(d.el.currentTime - at) > 0.25) d.el.currentTime = at; } catch {}
      if (R.paused) d.el.wasOn = true; else { const p = d.el.play(); if (p && p.catch) p.catch(() => {}); }
      ramp(d.gain.gain, MOG_GAIN * (song.gain ?? 1), secs);
      d.el.addEventListener('playing', () => { if (d.tok === tok) mog.fails = 0; }, { once: true });
    };
    if (d.el.src !== url) { d.el.preload = 'auto'; d.el.src = url; d.el.addEventListener('loadedmetadata', go, { once: true }); }
    else if (d.el.readyState >= 1) go(); else d.el.addEventListener('loadedmetadata', go, { once: true });
  }
  function mogTune(secs) {
    // (already playing (heard from the car on foot, and now he gets in): it goes on as it is)
    if (cur && cur.live && cur.st?.mog) { playing = true; return; }
    playing = true; const ask = ++mog.ask;
    mogLoad().then((list) => {
      if (ask !== mog.ask || !R.on || !R.station?.mog || !g) return;
      if (!list.length) return; // (nothing to play: 'playing' stays, so it isn't asked again every frame)
      let song = mog.song, at = mog.at;
      if (!song) { mog.pos++; song = mogAt(mog.pos); at = 0; }
      // (the deck it stopped on still has it: no second download)
      const d = mog.deck && mog.deck.song === song && !mog.deck.live ? mog.deck : g.decks.find((x) => x !== cur) || g.decks[0];
      if (cur && cur !== d) halt(cur, 0.12);
      cur = d; mogStart(d, song, at, secs); mog.song = song; mog.at = 0; mog.deck = null;
      if (cm.activeMode === 'car' && !cut()) show();
    });
  }
  // the next song (step 1) or the one before (-1), crossfaded over secs
  function mogNext(secs = XF, step = 1) {
    if (!g || !mog.list?.length) return;
    mog.ask++; mog.pos = Math.max(0, mog.pos + step);
    const song = mogAt(mog.pos), d = g.decks.find((x) => x !== cur) || g.decks[0];
    halt(cur, secs); cur = d; mogStart(d, song, 0, secs); playing = true; mog.song = song; mog.at = 0; mog.deck = null;
    if (cm.activeMode === 'car' && !cut()) show();
  }

  /* --------------------------------------------------------- the card -- */
  const css = document.createElement('style');
  css.textContent = `
.wr-card { position: fixed; left: 50%; top: 22px; transform: translate(-50%, -8px); text-align: center; color: #fff; z-index: 21; pointer-events: none;
  opacity: 0; transition: opacity .35s, transform .45s cubic-bezier(.2,.7,.2,1); font-family: 'Barlow Condensed', system-ui, sans-serif;
  text-shadow: 0 2px 10px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.85); max-width: calc(100vw - 32px); }
.wr-card.on { opacity: 1; transform: translate(-50%, 0); }
.wr-card .fq { font: 700 13px/1 'Barlow Condensed'; letter-spacing: 4px; color: var(--c, #FFC93C); }
.wr-card .nm { margin-top: 4px; font: italic 800 clamp(30px, 4vw, 44px)/1 'Barlow Condensed'; letter-spacing: 1px; white-space: nowrap; }
.wr-card .tr { margin-top: 6px; font: 600 16px/1.2 'Barlow Condensed'; color: rgba(255,255,255,.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wr-card .tr b { color: var(--c, #FFC93C); font-weight: 700; }
.wr-card .ky { display: inline-block; margin-top: 9px; padding: 5px 10px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 600 13px/1 'Barlow Condensed'; letter-spacing: 1px; color: rgba(255,255,255,.75); text-shadow: none; }
.wr-card kbd { display: inline-block; min-width: 18px; padding: 2px 5px; margin: 0 3px; border-radius: 4px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28); font: 700 12px/1 'Barlow Condensed'; color: #fff; }
body.wg-cine .wr-card { display: none; }`;
  document.head.appendChild(css);
  const card = document.createElement('div'); card.className = 'wr-card';
  card.innerHTML = '<div class="fq"></div><div class="nm"></div><div class="tr"></div><div class="ky"></div>';
  document.body.appendChild(card);
  let cardT = null, hints = 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function show() {
    const s = R.station, m = R.on && s?.mog, seg = s && R.on && !m ? s.segs[R.where(s).i] : null;
    card.style.setProperty('--c', R.on ? s.color : 'rgba(255,255,255,.6)');
    card.querySelector('.fq').textContent = m ? 'RADIO' : R.on ? s.freq + ' FM' : '';
    card.querySelector('.nm').textContent = R.on ? s.name : 'RADIO OFF';
    card.querySelector('.tr').innerHTML = m ? (mog.song ? `<b>${esc(mog.song.title)}</b>` : mog.list && !mog.list.length ? 'No songs' : '') : seg ? `<b>${esc(seg.t.title)}</b> · ${esc(seg.t.artist)}` : '';
    card.querySelector('.ky').innerHTML = !R.on ? '<kbd>T</kbd> radio on' : m && stations.length === 1 ? '<kbd>R</kbd> skip song · <kbd>T</kbd> radio off' : '<kbd>R</kbd> next station · <kbd>T</kbd> radio off';
    // (the keys: the first few cards, and always while it is off: how to turn it on)
    card.querySelector('.ky').style.display = !R.on || hints++ < 3 ? '' : 'none';
    card.classList.add('on'); clearTimeout(cardT); cardT = setTimeout(() => card.classList.remove('on'), 3200);
  }

  /* ----------------------------------------------------------- the keys -- */
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey || cm.activeMode !== 'car' || cut() || W.paused) return;
    if (e.code === 'KeyR') R.next();
    else if (e.code === 'KeyT') R.toggle();
  });

  /* ---------------------------------------------------------- the frame -- */
  const cut = () => !!(W.cutscene || document.body.classList.contains('wg-cine') || document.body.classList.contains('wg-gating'));
  const dist = () => Math.hypot(person.position.x - car.position.x, person.position.z - car.position.z);
  // heard at all: in the car, or on foot near it once he has been in it (a car he never got into has no radio on)
  let been = false;
  const heard = () => R.on && !cut() && (cm.activeMode === 'car' || (been && cm.activeMode === 'person' && car.mesh?.visible !== false && dist() < FAR));
  let wasCar = cm.activeMode === 'car', quietSince = 0;
  // (nothing before the player's first key or click: no sound can play before it anyway, and the city's default mode
  // (the car) flickers past on load before the game puts him on foot)
  const active = () => (navigator.userActivation ? navigator.userActivation.hasBeenActive : true);
  // the pause menu (W.paused): the decks and a passing car's stereo stop where they are, the stations' clocks with them
  // (the mixer's context is held too, wagmi/audio), and all of it plays on from there on Resume
  let heldAt = 0, woke = false;
  function hold(on) {
    // (what was playing and still wanted: a deck still live, the stereo while its car is still about)
    const els = [...(g ? g.decks.map((d) => [d.el, () => d.live]) : []), ...(boom.d ? [[boom.d, () => !!boom.v]] : [])];
    if (on) { heldAt = performance.now(); for (const [el, want] of els) { el.wasOn = !el.paused && want(); el.pause(); } return; }
    const gone = performance.now() - heldAt;
    for (const s of stations) s.epoch += gone / 1000;
    boom.until += gone; boom.next += gone;
    for (const [el, want] of els) { if (el.wasOn && want()) el.play().catch(() => {}); el.wasOn = false; }
  }
  function frame() {
    if (!!W.paused !== R.paused) { R.paused = !!W.paused; hold(R.paused); }
    if (R.paused) return;
    const inCar = cm.activeMode === 'car';
    if (!active()) { wasCar = inCar; return; }
    // (a game that starts him at the wheel (a mission's drive): the card once, at the first key or click, so the
    // radio's key is seen there too)
    if (!woke) { woke = true; if (inCar && !cut()) show(); }
    if (inCar && !cut()) been = true;
    // getting in: the card (the first time ever, MOG FM from the top: the theme)
    if (inCar && !wasCar && !cut()) {
      if (R.on && graph()) tune(0.6);
      show();
    }
    wasCar = inCar;
    const h = heard();
    street(inCar);
    // (the sound can only start after a key or a click: until then, nothing to drive)
    if (!g && h) { if (!graph()) return; tune(0.8); if (inCar) show(); }
    if (!g) return;
    if (h && !playing && R.on) tune(0.8);
    if (!h && playing) { if (!quietSince) quietSince = performance.now(); if (performance.now() - quietSince > 1500) stopAll(0.2); } else quietSince = 0;
    // how it sounds from where he is: in the car full; outside muffled through the glass, panned, by distance
    const now = t();
    let lvl = 0, cutoff = 20000, p = 0;
    if (h && inCar) lvl = 1;
    else if (h) {
      const d = dist(), k = Math.max(0, 1 - d / FAR);
      lvl = 0.75 * k * k + 0.05 * k; cutoff = 650 + 900 * k;
      p = bearing(car.position.x, car.position.z);
    }
    g.level.gain.setTargetAtTime(cut() ? 0 : lvl, now, 0.25);
    g.lp.frequency.setTargetAtTime(cutoff, now, 0.15);
    g.pan.pan.setTargetAtTime(p, now, 0.2);
    // Mog Music: the next song readied on the other deck in this one's last 12 s, then crossfaded into
    if (playing && cur && cur.live && cur.st?.mog) {
      const el = cur.el, left = el.duration - el.currentTime;
      if (el.readyState >= 2 && !el.paused && Number.isFinite(left) && el.duration > 1) {
        if (left < 12 && mog.list?.length) {
          const nx = mogAt(mog.pos + 1), other = g.decks.find((x) => x !== cur);
          if (!other.live && other.ready !== nx.file) { other.ready = nx.file; other.el.preload = 'auto'; other.el.src = mogUrl(nx); }
        }
        if (left <= XF) mogNext(XF);
      }
    }
    // a segment running out: the next one's file readied on the other deck a few seconds ahead, then on to it
    else if (playing && cur && cur.live) {
      const seg = cur.st.segs[cur.seg], tt = cur.el.currentTime;
      if (cur.el.readyState >= 2 && !cur.el.paused && tt > seg.from && tt >= seg.to - XF - 4) {
        const nx = cur.st.segs[(cur.seg + 1) % cur.st.segs.length], other = g.decks.find((x) => x !== cur);
        if (!other.live && other.ready !== nx.t.file) { other.ready = nx.t.file; blob(nx.t.file).then((url) => { if (!other.live && other.el.src !== url) other.el.src = url; }).catch(() => {}); }
      }
      if (cur.el.readyState >= 2 && !cur.el.paused && tt > seg.from && tt >= seg.to - XF) next();
    }
  }
  // a pan (-0.8..0.8) for a point, by where it is from the camera's view
  function bearing(x, z) {
    const cam = app.cameraSystem?.camera || app.camera; if (!cam) return 0;
    const yaw = Math.atan2(-(cam.matrixWorld?.elements[8] ?? 0), -(cam.matrixWorld?.elements[10] ?? 1));
    const a = Math.atan2(x - cam.position.x, z - cam.position.z) - yaw;
    return Math.max(-0.8, Math.min(0.8, -Math.sin(a) * 0.8));
  }

  /* -------------------------------------------- the street's car stereos -- */
  // On foot, now and then a passing car has its music up: one of the stations' tracks from somewhere in the middle,
  // mostly its bass through the body, louder and brighter as it nears, gone as it drives off.
  const boom = { d: null, v: null, until: 0, next: performance.now() + 12000 + Math.random() * 10000, nodes: null };
  function street(inCar) {
    const now = performance.now(), cars = app.trafficSystem?.cars;
    const cam = app.cameraSystem?.camera || app.camera;
    if (boom.v) {
      const v = boom.v, d = cam ? Math.hypot(v.x - cam.position.x, v.z - cam.position.z) : 99;
      const k = Math.max(0, 1 - d / 42), n = boom.nodes, ct = n.ctx.currentTime;
      const gone = inCar || cut() || d > 48 || now > boom.until;
      n.level.gain.setTargetAtTime(gone ? 0 : 0.85 * k * k * boom.tg, ct, gone ? 0.5 : 0.15);
      n.lp.frequency.setTargetAtTime(260 + 1100 * k * k, ct, 0.15);
      n.pan.pan.setTargetAtTime(bearing(v.x, v.z), ct, 0.1);
      if (gone && !boom.fading) { boom.fading = true; setTimeout(() => { boom.d.pause(); boom.v = null; boom.fading = false; }, 1600); boom.next = now + 20000 + Math.random() * 25000; }
      return;
    }
    // (only the old stations, ?stations=all: Mog Music is the player's car's radio, never a stranger's)
    if (!legacy.length || inCar || cut() || now < boom.next || !cars || !cam || !R.on) return;
    boom.next = now + 4000;
    // a car coming: near enough, moving, not a cruiser or a bus, closing on the camera
    const cand = cars.filter((v) => !v.bus && !v.isNYPD && Math.abs(v.speed) > 4 && Math.hypot(v.x - cam.position.x, v.z - cam.position.z) < 40 && Math.hypot(v.x - cam.position.x, v.z - cam.position.z) > 14);
    if (!cand.length || Math.random() < 0.4) return;
    if (!graph()) return;
    const v = cand[Math.floor(Math.random() * cand.length)];
    if (!boom.nodes) {
      const ctx = g.ctx, el = new Audio(); el.preload = 'auto';
      const src = ctx.createMediaElementSource(el), lp = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter(), pan = ctx.createStereoPanner(), level = ctx.createGain(), shelf = ctx.createBiquadFilter();
      lp.type = lp2.type = 'lowpass'; lp.Q.value = 0.9; lp2.frequency.value = 2400; shelf.type = 'lowshelf'; shelf.frequency.value = 120; shelf.gain.value = 6; level.gain.value = 0;
      src.connect(shelf); shelf.connect(lp); lp.connect(lp2); lp2.connect(pan); pan.connect(level); level.connect(g.duck);
      boom.nodes = { ctx, el, lp, pan, level }; boom.d = el;
    }
    const st = legacy[Math.floor(Math.random() * legacy.length)], seg = st.segs[Math.floor(Math.random() * st.segs.length)];
    boom.v = v; boom.until = now + 22000; boom.tg = trackGain(seg.t);
    blob(seg.t.file).then((url) => {
      const el = boom.d; if (boom.v !== v) return;
      const go = () => { try { el.currentTime = seg.from + Math.random() * Math.max(1, seg.to - seg.from - 30); } catch {} if (R.paused) el.wasOn = true; else el.play().catch(() => {}); };
      if (el.src !== url) { el.src = url; el.addEventListener('loadedmetadata', go, { once: true }); } else go();
    }).catch(() => { boom.v = null; });
  }
  R.boom = () => ({ on: !!boom.v, car: boom.v ? { x: +boom.v.x.toFixed(1), z: +boom.v.z.toFixed(1) } : null, level: boom.nodes ? +boom.nodes.level.gain.value.toFixed(3) : 0, nextIn: Math.round((boom.next - performance.now()) / 1000) });
  R.boomNow = () => { boom.next = 0; };

  const timer = setInterval(frame, 50);

  // speech ducks it (the voices call this): to amount (a gain) for secs, then back up
  R.duck = (amount = 0.35, secs = 1) => {
    if (!g) return;
    const p = g.duck.gain, n = t();
    p.cancelScheduledValues(n); p.setValueAtTime(p.value, n); p.linearRampToValueAtTime(amount, n + 0.12);
    p.setValueAtTime(amount, n + 0.12 + secs); p.linearRampToValueAtTime(1, n + 0.12 + secs + 0.6);
  };
  // the player's controls (the keys above, the pad, the touch button, the pause menu): each one remembered
  //   next()    off: on · Mog Music alone on the dial: the next song · else the next station
  //   back()    Mog Music: the song again from the top, or (in its first 4 s) the one before · else the station before
  //   toggle()  on / off        set(on)  on or off        skip()  Mog Music's next song (on, if it was off)
  R.set = (on) => { on = !!on; if (R.on === on) return; R.on = on; save(); if (!on) { stopAll(0.3); mog.song = null; mog.deck = null; } else if (heard()) tune(0.3); show(); };
  R.toggle = () => R.set(!R.on);
  R.skip = () => { if (!R.on) return R.set(true); if (!R.station?.mog) { R.idx = 0; save(); } if (heard() && g && cur?.st?.mog && mog.list?.length) mogNext(0.25); else { mog.song = null; mog.deck = null; if (heard()) tune(0.25); show(); } };
  R.next = () => {
    if (!R.on) return R.set(true);
    if (stations.length === 1) return R.skip();
    R.idx = (R.idx + 1) % stations.length; save(); if (heard()) tune(0.2); show();
  };
  R.back = () => {
    if (!R.on) return R.set(true);
    if (stations.length === 1) {
      if (heard() && g && cur?.st?.mog && mog.list?.length) { if (cur.el.currentTime > 4) { try { cur.el.currentTime = 0; } catch {} show(); } else mogNext(0.25, -1); }
      return;
    }
    const n = stations.length; R.tune(stations[(R.idx - 1 + n) % n].id);
  };
  R.tune = (id) => { const i = stations.findIndex((s) => s.id === id); if (i >= 0) { R.idx = i; R.on = true; save(); if (heard()) tune(0.2); show(); } };
  // (for tests: what it is doing; song: Mog Music's, its title, file and time)
  R.state = () => ({ via: out.via(), on: R.on, paused: R.paused, station: R.station?.id, playing, heard: heard(), deck: cur ? (cur.st?.mog ? { file: cur.song?.file, title: cur.song?.title, t: +cur.el.currentTime.toFixed(2), paused: cur.el.paused, ready: cur.el.readyState } : { file: cur.st.segs[cur.seg].t.file, t: +cur.el.currentTime.toFixed(2), paused: cur.el.paused, ready: cur.el.readyState }) : null, song: mog.song ? mog.song.title : null, songs: mog.list ? mog.list.length : null, level: g ? +g.level.gain.value.toFixed(3) : 0, duck: g ? +g.duck.gain.value.toFixed(3) : 1 });
  R.title = () => (R.on && R.station?.mog ? mog.song?.title || null : null);
  R.dispose = () => { clearInterval(timer); stopAll(0.1); card.remove(); css.remove(); };
  return R;
}
