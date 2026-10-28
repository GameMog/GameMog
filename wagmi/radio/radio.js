// Mog City: the car radio, GTA style. Every station keeps playing whether you listen or not (its own clock: tune in
// and you land wherever it is); in Dan's car it plays full; on foot it carries on from the car, muffled and fading
// with distance, and stops at 34 m; a cutscene takes it down to nothing; speech ducks it.
//   R  next station · T  radio off / on (in the car). The station's card shows top centre as you get in or switch.
// Two decks (media elements: nothing decoded whole) crossfade at a track's end and, in step, at a short track's loop.
import { STATIONS } from './stations.js';

const XF = 0.35;          // crossfade (s)
const TARGET = -16;       // every track evened to this loudness (LUFS)
const FAR = 34;           // on foot: the car's radio heard out to here (m)

export function createRadio(W, out) {
  const app = W.app, cm = app.controllerManager, car = W.car, person = W.person;
  const stations = STATIONS.map((s) => ({ ...s, tracks: s.tracks.filter((t) => t.dur > 0) })).filter((s) => s.tracks.length);
  // each station's running order: segments of its tracks (a short one's loop heard again), its length, its clock
  for (const s of stations) {
    s.segs = [];
    for (const t of s.tracks) {
      s.segs.push({ t, from: 0, to: t.loop ? t.loop.end : t.dur });
      for (let i = 1; i < (t.plays || 1); i++) s.segs.push({ t, from: t.loop.start, to: t.loop.end });
    }
    s.len = s.segs.reduce((a, g) => a + g.to - g.from, 0);
    s.epoch = performance.now() / 1000 - Math.random() * s.len;
  }
  const R = {
    stations, on: true, idx: 0, first: true, paused: false,
    get station() { return stations[R.idx] || null; },
    // where a station is now: its segment and the time into it
    where(s, now = performance.now() / 1000) {
      let p = ((now - s.epoch) % s.len + s.len) % s.len;
      for (let i = 0; i < s.segs.length; i++) { const g = s.segs[i], d = g.to - g.from; if (p < d) return { i, off: p }; p -= d; }
      return { i: 0, off: 0 };
    },
  };
  if (!stations.length) return R;

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
  // tune in: the station wherever its clock says
  function tune(secs = 0.25) {
    if (!graph()) return;
    // (the first time ever: MOG FM from the top, the theme)
    if (R.first) { R.first = false; R.idx = 0; stations[0].epoch = performance.now() / 1000 - 0.01; }
    const s = R.station, w = R.where(s);
    const d = g.decks.find((x) => x !== cur) || g.decks[0];
    halt(cur, 0.12); cur = d; start(d, s, w.i, w.off, secs); playing = true;
  }
  // the next segment, crossfaded (ended: the deck ran out, no fade to make). A loop heard again comes in exactly as far
  // before its start as the one going out is before its end, so the two are in step through the fade
  function next(ended = false) {
    const s = cur.st, i = (cur.seg + 1) % s.segs.length, d = g.decks.find((x) => x !== cur), left = s.segs[cur.seg].to - cur.el.currentTime;
    const off = !ended && s.segs[i].from > 0 ? -Math.max(0, Math.min(XF, left)) : 0;
    halt(cur, ended ? 0.01 : XF); cur = d; start(d, s, i, off, ended ? 0.05 : XF);
  }
  function stopAll(secs = 0.4) { if (!g) return; for (const d of g.decks) halt(d, secs); cur = null; playing = false; }

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
  card.innerHTML = '<div class="fq"></div><div class="nm"></div><div class="tr"></div><div class="ky"><kbd>R</kbd> next station · <kbd>T</kbd> radio off</div>';
  document.body.appendChild(card);
  let cardT = null, hints = 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function show() {
    const s = R.station, seg = s && R.on ? s.segs[R.where(s).i] : null;
    card.style.setProperty('--c', R.on ? s.color : 'rgba(255,255,255,.6)');
    card.querySelector('.fq').textContent = R.on ? s.freq + ' FM' : '';
    card.querySelector('.nm').textContent = R.on ? s.name : 'RADIO OFF';
    card.querySelector('.tr').innerHTML = seg ? `<b>${esc(seg.t.title)}</b> · ${esc(seg.t.artist)}` : '';
    card.querySelector('.ky').style.display = hints++ < 3 ? '' : 'none';
    card.classList.add('on'); clearTimeout(cardT); cardT = setTimeout(() => card.classList.remove('on'), 3200);
  }

  /* ----------------------------------------------------------- the keys -- */
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey || cm.activeMode !== 'car' || cut() || W.paused) return;
    if (e.code === 'KeyR') { if (!R.on) R.on = true; else R.idx = (R.idx + 1) % stations.length; if (heard()) tune(0.2); show(); }
    else if (e.code === 'KeyT') { R.on = !R.on; if (!R.on) stopAll(0.3); else if (heard()) tune(0.3); show(); }
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
  let heldAt = 0;
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
    // a segment running out: the next one's file readied on the other deck a few seconds ahead, then on to it
    if (playing && cur && cur.live) {
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
    if (inCar || cut() || now < boom.next || !cars || !cam || !R.on) return;
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
    const st = stations[Math.floor(Math.random() * stations.length)], seg = st.segs[Math.floor(Math.random() * st.segs.length)];
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
  R.next = () => { R.idx = (R.idx + 1) % stations.length; if (heard()) tune(0.2); show(); };
  R.toggle = () => { R.on = !R.on; if (!R.on) stopAll(0.3); else if (heard()) tune(0.3); show(); };
  R.tune = (id) => { const i = stations.findIndex((s) => s.id === id); if (i >= 0) { R.idx = i; R.on = true; if (heard()) tune(0.2); show(); } };
  R.state = () => ({ via: out.via(), on: R.on, paused: R.paused, station: R.station?.id, playing, heard: heard(), deck: cur ? { file: cur.st.segs[cur.seg].t.file, t: +cur.el.currentTime.toFixed(2), paused: cur.el.paused, ready: cur.el.readyState } : null, level: g ? +g.level.gain.value.toFixed(3) : 0, duck: g ? +g.duck.gain.value.toFixed(3) : 1 });
  R.dispose = () => { clearInterval(timer); stopAll(0.1); card.remove(); css.remove(); };
  return R;
}
