// Mog City: Unfinished Business. The cold open: a 40 s trailer, live in the engine, between "Tap to start" and the opening: cut
// on the beat of the game's own "Fall Guy" (140 BPM, assets/music/fall-guy.m4a, MIT), letterboxed and graded,
// then the opening (wagmi/intro.js) from its first frame exactly as before. Hold to skip it at any moment (the
// cutscenes' own skip: Space or Enter held, a long press anywhere, the pad's A). Its cut is gamemog.com's hero too.
//   off by default (?trailer=1 puts it back)        ?trailer=only  it alone, held on the title at the end (for looking at it;
//   &trat=<s> starts it s seconds in)        ?nointro, ?nogate and every ?m.. switch leave it out with the opening.
// The shots (v4: the mechanic, the park fight and the rail vault out, the owner, 24 Oct; v5 the story's, 27 Oct):
//   1 black, a phone buzzing: FIRST YEAR AT JPBANK.     2 an aerial over Midtown at dusk to the Empire State
//   3-6 the opening's own set and cast (its frame at a time, its cameras): Dan out of his door with his laptop bag,
//     THEY GOT RICH. over the climb (BLIMPCO), HE GOT FRAMED. over the cliff (HIS NAME), the van swinging in
//   7-11 Hooks rips the bag off him, Mr. Big in his study ('You sign the confession.', his recorded voice), Knox's
//   shove, the van tearing off        12-21 the drop: the five nozzles lighting on the boom, the launch past a lens on
//   the asphalt, the burn alongside, a drift into 28th St, a drift close up (the wheels counter-steered, the smoke), the
//   hop, his face, the city's sightseeing chopper down Fifth Ave toward the Empire State (on the hook's new phrase),
//   Jane looking up from her laptop, and straight down on the avenue: the car lighting its five and rocketing up the
//   grid        22 WRONG GUY TO FRAME.        23 the logo slam over the car at rest: MOG CITY / UNFINISHED BUSINESS
// The drifts are puppets (the car has no drift of its own): a path (a straight, a quarter circle, a straight), its
// heading the path's plus a slip angle, the fronts counter-steered, the body rolled out, tyre smoke (the cold-gas vapour's
// puffs, grey) at the rear wheels. The booster's speed kick: the lens punched wider, a buzz, streaks round the frame.
// The chopper is a clone of the city's own (js/controllers.js: its meshes, their geometry and materials shared), flown by
// hand, its rotors spinning; the player's is never moved. Jane is the missions' own (her builders: buildJane +
// createJaneRoom), her file fetched at low priority when the trailer installs, built on the start's tap; her shot not
// ready when its bar comes is left out (the shot before it runs on).
// Everything in it is a function of its clock (the music's: the context's time), so every cut lands on its beat however
// slow the frame. Only what the game already has: the music file and one voice line (both the game's own), the
// opening's cast, Jane, the car, the city's chopper; the avenue and 28th St are the city's; the car's own boost sound
// (its whump, a rocket's roar under the burns), the city's chopper loop and the cutscenes' tyre squeal. Everything it
// adds to the city is taken out again at its end or on a skip.
//   const tr = createTrailer(W)  (installed by intro.js; null when it is left out);  tr.cover();  await tr.play(borrow)
import * as THREE from 'three/webgpu';
import { createVapor } from './pursuit/vapor.js';
import { keys, clamp, smooth, lerp, ease, handheld, shotFov } from './mission/cine.js';
import { dropFace } from './face.js';

const Q = new URLSearchParams(location.search);
const PI = Math.PI;
const BPM = 140, BEAT = 60 / BPM, BAR = 4 * BEAT;
const B = (b) => b * BAR;
const MUSIC = 'assets/music/fall-guy.m4a', BOSSV = 'assets/voice/intro-mrbig-you-sign-the-confession.m4a';
// the music's edit, on its bar lines (the chord loop kept): [trailer bar, the track's bar, bars]
// (v2: the drop two bars longer, the hook running on to its bar 58; the silent card after it. v3: one bar more, to 59.
// v4: three bars out with the mechanic, the fight and the rail: the loop once (48-51, Em Am C B), then from 55, its B
// again (bar 55 is bar 51 over, measured: no riser in either, the same hat stutter closing both), into the new phrase
// on 56 under the chopper, on to 59)
const EDIT = [[0, 0, 8], [8, 24, 2], [10, 46, 2], [12, 48, 4], [16, 55, 4], [21, 64, 2.5]];
// (IGN: the bird's-eye's ignition; END_BAR: the logo's fade out)
const DROP = 12, IGN = 19, CARD = 20, LOGO = 21, END_BAR = 23.5, END = B(END_BAR);
// Mr. Big's line: its first sentence only, over the build ('You sign the confession.': its length measured from his
// file, bossFirst; BOSS_LEN when it can't be, or there is no file)
const BOSS_AT = B(10) + 0.1, BOSS_LEN = 1.55;
// (the first sentence's end: the first pause of 0.18 s or more after 0.5 s of his voice, plus a breath; 0.9-2.4 s)
function bossFirst(buf) {
  const sr = buf.sampleRate, d = buf.getChannelData(0), win = Math.round(0.02 * sr), n = Math.floor(d.length / win), rms = new Float32Array(n);
  let top = 0; for (let i = 0; i < n; i++) { let a = 0; for (let j = i * win; j < (i + 1) * win; j++) a += d[j] * d[j]; rms[i] = Math.sqrt(a / win); top = Math.max(top, rms[i]); }
  if (!(top > 0)) return BOSS_LEN;
  let on = -1, quiet = 0;
  for (let i = 0; i < n; i++) {
    const loud = rms[i] > top * 0.08; if (on < 0) { if (loud) on = i; continue; }
    if (loud) quiet = 0; else if (++quiet * 0.02 >= 0.18 && (i - quiet - on) * 0.02 >= 0.5) return clamp((i - quiet + 1) * 0.02 + 0.06, 0.9, 2.4);
  }
  return clamp(Math.min(BOSS_LEN, n * 0.02), 0.9, 2.4);
}
const WHITE = '#FFFFFF', ACID = '#B6FF3B', GOLD = '#FFC93C';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// who it plays for: nobody by default (the owner, 28 Oct: the game opens straight on the opening cutscene); ?trailer=1
// puts it back before the opening, 'only' for ?trailer=only; never with ?nointro, ?nogate or a mission switch
export function trailerMode() {
  const v = (Q.get('trailer') || '').toLowerCase();
  if (v !== 'only' && v !== '1' && v !== 'on') return null;
  if (Q.has('nointro') || Q.has('nogate') || [...Q.keys()].some((k) => /^m\d/.test(k))) return null;
  return v === 'only' ? 'only' : 'on';
}

/* ------------------------------------------------------------ the music -- */
// fetched and decoded while the city loads (an offline context: no sound before the tap), then cut to the trailer's
// own soundtrack in one buffer: the edit, short fades at each join, the voice laid in with the music dipped under it
function loadSound() {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC || /[?&]noaudio\b/.test(location.search)) return Promise.resolve(null);
  const get = (url) => fetch(url, { priority: 'low' }).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); });
  const dec = (ab) => new Promise((res, rej) => { const c = new AC(2, 1, 44100); const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  return Promise.all([get(MUSIC).then(dec), get(BOSSV).then(dec).catch(() => null)]).then(([mus, boss]) => {
    const sr = mus.sampleRate, n = Math.ceil(END * sr), ch = Math.min(2, mus.numberOfChannels);
    const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
    const L = out.getChannelData(0), R = out.getChannelData(1);
    const fadeN = Math.round(0.006 * sr);
    for (const [at, from, bars] of EDIT) {
      const o = Math.round(B(at) * sr), s = Math.round(B(from) * sr), len = Math.min(Math.round(B(bars) * sr), n - o);
      for (let c = 0; c < 2; c++) {
        const src = mus.getChannelData(Math.min(c, ch - 1)), dst = c ? R : L;
        for (let i = 0; i < len; i++) {
          let g = 1; if (i < fadeN) g = i / fadeN; else if (len - i < fadeN) g = (len - i) / fadeN;
          dst[o + i] = src[s + i] * g;
        }
      }
    }
    // the logo's bar faded out over its last 1.4 s
    const f0 = Math.round((END - 1.4) * sr);
    for (let i = f0; i < n; i++) { const g = Math.pow(1 - (i - f0) / (n - f0), 1.6); L[i] *= g; R[i] *= g; }
    if (boss) {
      // the music dipped under him, his line over it
      const zl = bossFirst(boss), a = Math.round(BOSS_AT * sr), len = Math.round(zl * sr), zc = boss.numberOfChannels;
      const duck = (i) => { const k = (i - a) / sr; return 1 - 0.42 * clamp(Math.min((k + 0.08) / 0.08, (zl + 0.15 - k) / 0.15)); };
      for (let i = a - Math.round(0.1 * sr); i < a + len + Math.round(0.2 * sr); i++) { if (i < 0 || i >= n) continue; const d = duck(i); L[i] *= d; R[i] *= d; }
      for (let c = 0; c < 2; c++) {
        const src = boss.getChannelData(Math.min(c, zc - 1)), dst = c ? R : L;
        for (let i = 0; i < len && a + i < n; i++) { const g = i > len - 0.08 * sr ? (len - i) / (0.08 * sr) : 1; dst[a + i] += src[i] * 1.15 * g; }
      }
    }
    return out;
  }).catch((e) => { console.warn('[trailer] no music', e); return null; });
}

/* ------------------------------------------------------------ the page -- */
const CSS = `
#wg-tr { position: absolute; inset: 0; z-index: 4; pointer-events: none; overflow: hidden; font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; }
#wg-tr .vig { position: absolute; inset: 0; background: radial-gradient(130% 100% at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,.5) 100%); opacity: 0; transition: opacity .6s; }
#wg-tr.on .vig { opacity: 1; }
#wg-tr .blk { position: absolute; inset: -2px; background: #000; opacity: 0; }
#wg-tr .flash { position: absolute; inset: 0; background: #fff; opacity: 0; mix-blend-mode: normal; }
#wg-tr .shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(3,6,12,.78) 0%, rgba(3,6,12,.35) 40%, rgba(3,6,12,0) 66%); opacity: 0; }
#wg-tr .card { position: absolute; left: 0; right: 0; top: 50%; text-align: center; opacity: 0; transform: translateY(-50%); }
/* (the floors shrink on the narrowest screens, a Fold's cover screen: a card, the logo kept inside 280 px) */
#wg-tr .card .t { font: 700 clamp(min(26px, 6.6vw), 4.4vw, 60px)/1 'Barlow Condensed'; letter-spacing: .26em; padding-left: .26em; white-space: nowrap; text-shadow: 0 2px 18px rgba(0,0,0,.6); }
#wg-tr .card .r { width: clamp(56px, 7vw, 96px); height: 3px; background: ${GOLD}; margin: clamp(12px, 1.8vw, 22px) auto 0; transform: scaleX(0); }
#wg-tr .chart { position: absolute; left: 8%; right: 8%; top: calc(var(--bar) + 6%); bottom: calc(var(--bar) + 8%); opacity: 0; }
#wg-tr .chart svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#wg-tr .chart .tick { position: absolute; right: 0; top: 0; font: 700 clamp(15px, 2vw, 26px)/1 'Barlow Condensed'; letter-spacing: .08em; padding: .3em .55em .25em; border-radius: 4px; background: rgba(8,10,14,.62); }
#wg-tr .big { position: absolute; left: 0; right: 0; bottom: calc(var(--bar) + 7%); text-align: center; font: italic 800 clamp(44px, 9.5vw, 132px)/.9 'Barlow Condensed'; letter-spacing: .01em; white-space: nowrap; opacity: 0; text-shadow: 0 6px 30px rgba(0,0,0,.6), 0 2px 3px rgba(0,0,0,.5); }
#wg-tr .logo { position: absolute; left: 0; right: 0; top: 50%; text-align: center; opacity: 0; transform: translateY(-58%); }
#wg-tr .logo .l { font: italic 800 clamp(min(58px, 19vw), 12.5vw, 190px)/.86 'Barlow Condensed'; letter-spacing: .01em; white-space: nowrap; text-shadow: 0 8px 40px rgba(0,0,0,.7), 0 3px 0 rgba(0,0,0,.35); }
#wg-tr .logo .l b { color: ${GOLD}; font-weight: 800; }
#wg-tr .logo .r { width: clamp(90px, 13vw, 180px); height: 4px; background: ${GOLD}; margin: clamp(14px, 2vw, 26px) auto 0; transform: scaleX(0); }
#wg-tr .logo .g { margin-top: clamp(12px, 1.7vw, 22px); font: 700 clamp(15px, 2.3vw, 32px)/1 'Barlow Condensed'; letter-spacing: .34em; padding-left: .34em; white-space: nowrap; opacity: 0; text-shadow: 0 2px 10px rgba(0,0,0,.85); }
#wg-tr .spd { position: absolute; left: 0; right: 0; top: var(--bar, 0px); bottom: var(--bar, 0px); overflow: hidden; }
#wg-tr .spd i { position: absolute; inset: 0; opacity: 0; -webkit-mask-image: radial-gradient(closest-side, transparent 58%, rgba(0,0,0,.5) 82%, #000 112%); mask-image: radial-gradient(closest-side, transparent 58%, rgba(0,0,0,.5) 82%, #000 112%); }
body.wg-trailer #wg .wg-bar { transition: none; }
`;
// the speed streaks: thin white lines out from the middle of the frame, irregular (seeded), two sets flickered between
const STREAKS = [3, 11].map((seed) => {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const st = []; let a = 0;
  while (a < 356) { const w = 0.12 + rnd() * 0.32, al = (0.25 + rnd() * 0.6).toFixed(2); a += 2.2 + rnd() * 6.5; if (a + w > 359) break;
    st.push(`rgba(255,255,255,0) ${a.toFixed(2)}deg`, `rgba(255,255,255,${al}) ${(a + w * 0.5).toFixed(2)}deg`, `rgba(255,255,255,0) ${(a + w).toFixed(2)}deg`); }
  return `conic-gradient(from ${(seed * 7) % 360}deg, rgba(255,255,255,0) 0deg, ${st.join(', ')}, rgba(255,255,255,0) 360deg)`;
});
function buildPage() {
  if (!document.getElementById('wg-tr-css')) { const st = document.createElement('style'); st.id = 'wg-tr-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'wg-tr';
  root.innerHTML = `<div class="vig"></div><div class="shade"></div><div class="blk"></div>
<div class="chart"><svg viewBox="0 0 1000 420" preserveAspectRatio="none"><defs><linearGradient id="wgTrUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ADE80" stop-opacity=".38"/><stop offset="1" stop-color="#4ADE80" stop-opacity="0"/></linearGradient></defs>
<path class="area" fill="url(#wgTrUp)" d=""/><path class="up" fill="none" stroke="#4ADE80" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" d=""/><path class="down" fill="none" stroke="#EF4444" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" d=""/></svg><div class="tick"></div></div>
<div class="spd"><i></i><i></i></div>
<div class="big"></div>
<div class="card"><div class="t"></div><div class="r"></div></div>
<div class="logo"><div class="l">MOG <b>CITY</b></div><div class="r"></div><div class="g">UNFINISHED BUSINESS</div></div>
<div class="flash"></div>`;
  (document.getElementById('wg') || document.body).appendChild(root);
  root.querySelectorAll('.spd i').forEach((el, i) => { el.style.background = STREAKS[i]; });
  const $ = (s) => root.querySelector(s);
  return { root, vig: $('.vig'), shade: $('.shade'), chart: $('.chart'), area: $('.chart .area'), up: $('.chart .up'), down: $('.chart .down'), tick: $('.chart .tick'), big: $('.big'), card: $('.card'), cardT: $('.card .t'), cardR: $('.card .r'), logo: $('.logo'), logoL: $('.logo .l'), logoR: $('.logo .r'), logoG: $('.logo .g'), flash: $('.flash'), blk: $('.blk'), spd: [...root.querySelectorAll('.spd i')] };
}
// the chart: a jagged climb (seeded: Blimpco, the stock the insiders bought), then the cliff (his name)
const CHART = (() => {
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = []; let y = 360;
  for (let i = 0; i <= 40; i++) { const x = i * 18; const k = i / 40; y = 380 - 330 * Math.pow(k, 2.2) + (rnd() - 0.5) * 34 * (0.4 + k); pts.push([x, Math.min(400, Math.max(18, y))]); }
  pts[pts.length - 1][1] = 22;
  const down = [[720, 22], [744, 120], [760, 96], [790, 300], [806, 268], [840, 392], [1000, 404]];
  const d = (p) => 'M' + p.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join(' L');
  return { up: d(pts), area: d(pts) + ' L720 420 L0 420 Z', down: d(down), upLen: 1400, downLen: 700 };
})();

/* ------------------------------------------------------------- the cast -- */
// Jane for her shot: her file fetched at low priority once the trailer's music is in (on a slow first visit the trailer
// waits for its sound, not for her), one request, the bytes parsed once by the game's own loader (wagmi/glb.js:
// loadGLB(url, bytes), the load the missions get later); built on the start's tap, in the first card's black, by the
// missions' own builders (Jane and her room), warmed (its shaders built) before she is first seen. K: what is ready
// ({ jane, room, okJane }); K.drop() puts all of it away (a build still under way is put away the moment it finishes)
const CAST_GLB = 'assets/characters/jane.glb';
// (nothing parsed or built while the city still loads and builds its shaders: the title can be up, and tapped, before)
const cityUp = (W) => new Promise((res) => { const f = () => (W.app?.ready ? res() : setTimeout(f, 150)); f(); });
function prefetchCast(W, soundP) {
  if (/[?&]nocast\b/.test(location.search)) return { jane: Promise.resolve() };
  const get = (url) => fetch(url, { priority: 'low' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  const glb = import('./glb.js').catch(() => null);
  // (the bytes handed to the loader, not fetched a second time; a failed fetch (null) leaves the loader to fetch it)
  const parse = (url, bytes) => cityUp(W).then(() => glb).then((m) => m?.loadGLB?.(url, bytes)).catch(() => null);
  // (after the music; parsed as soon as its bytes are in)
  const jb = Promise.resolve(soundP).catch(() => null).then(() => get(CAST_GLB));
  return { jane: jb.then((b) => parse(CAST_GLB, b)) };
}
function buildCast(W, fetched) {
  const app = W.app, K = { gone: false, okJane: false };
  const warm = async (obj, cam, scene) => {
    const r = app.renderer; if (!r?.compileAsync) return;
    const culled = []; obj.traverse((o) => { if (o.frustumCulled && (o.isMesh || o.isPoints)) { culled.push(o); o.frustumCulled = false; } });
    const v = obj.visible; obj.visible = true;
    const p = r.compileAsync(obj, cam, scene).catch((e) => console.warn('[trailer] warm', e));
    K.warming = p; await p; if (K.warming === p) K.warming = null;
    obj.visible = v; for (const o of culled) o.frustumCulled = true;
  };
  // (disposed once a compile still under way is over)
  const kill = (o) => (K.warming ? K.warming.then(() => kill0(o)) : kill0(o));
  const kill0 = (o) => o?.traverse?.((m) => { if (m.isMesh || m.isPoints) { m.geometry?.dispose(); for (const mt of [].concat(m.material || [])) { for (const k of ['map', 'emissiveMap']) mt[k]?.dispose?.(); mt.dispose?.(); } } });
  K.drop = () => {
    K.gone = true; K.okJane = false;
    if (K.room) { try { K.room.full(null); K.room.dispose(); } catch {} K.room.scene.remove(K.jane.root); for (const o of [...K.room.scene.children]) { K.room.scene.remove(o); kill(o); } K.room = null; }
    if (K.jane) { K.jane.root.removeFromParent(); if (K.jane.face) dropFace(W, K.jane.face); K.jane.mixer?.stopAllAction(); K.jane = null; }
  };
  K.ready = (async () => {
    if (/[?&]nocast\b/.test(location.search)) return;
    await cityUp(W);
    if (K.gone) return;
    // Jane at her laptop in her room (a scene of its own: jane.js createJaneRoom), a desk and the laptop before her
    try {
      const jm = await import('./mission/jane.js');
      if (K.gone) return;
      await fetched.jane;
      if (K.gone) return;
      K.jane = await jm.buildJane(W, { auto: false });
      if (K.gone) return K.drop();
      K.room = jm.createJaneRoom(W, K.jane);
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.62), new THREE.MeshStandardMaterial({ color: '#221D19', roughness: 0.65 }));
      desk.position.set(0, 0.72, 0.62); desk.receiveShadow = true; K.room.scene.add(desk);
      K.lap = jm.buildLaptop(); K.lap.position.set(0, 0.74, 0.5); K.lap.rotation.y = PI; K.room.scene.add(K.lap);
      K.lap.userData.screen('trace', 0);
      K.jane.rig.set([[0, K.jane.clips.includes('sit') ? 'sit' : 'idle', { fade: 0.01, speed: 0.6 }]]);
      await warm(K.room.scene, K.room.cam, K.room.scene);
      if (K.gone) return K.drop();
      K.okJane = true;
    } catch (e) { console.warn('[trailer] jane', e); }
  })();
  return K;
}

export function createTrailer(W) {
  const mode = trailerMode();
  if (!mode) return null;
  const soundP = loadSound();
  let page = null;
  const T = { mode, sound: null, soundP, cast: null };
  soundP.then((b) => { T.sound = b; });
  // (Jane's file, behind the music)
  const fetched = prefetchCast(W, soundP);
  // black at once on the start's tap (the opening's first frame and the gate's logo under it until the trailer plays);
  // the cast built from now
  T.cover = () => {
    if (!page) page = buildPage();
    page.blk.style.opacity = '1'; page.root.classList.add('on'); document.body.classList.add('wg-trailer');
    W.ui?.gameTitle(false, true);
    if (!T.cast) T.cast = buildCast(W, fetched);
  };
  T.play = (borrow) => play(W, T, borrow, () => page || (page = buildPage()));
  return T;
}

/* ------------------------------------------------------------- the film -- */
async function play(W, T, borrow, getPage) {
  const app = W.app, cm = app.controllerManager, cs = app.cameraSystem, ui = W.ui, sfx = W.sfx, D = borrow.D;
  const P = W.person, Qn = W.dan, car = W.car, rs = car.roadster;
  const pg = getPage();
  T.cover();
  ui.gameTitle(false, true); ui.sub(null);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the music: up to 8 s more for it after the tap (the first card holds on black meanwhile); without it the clock is
  // the page's own
  const actx = W.audio?.ctx || null;
  if (!T.sound && actx) await Promise.race([T.soundP, sleep(8000)]);
  // (?trailer=only&trat=s: from s seconds in, the cast given time to be built first)
  const AT0 = T.mode === 'only' ? clamp(+(Q.get('trat') || 0) || 0, 0, END - 1) : 0;
  if (AT0 && T.cast) await Promise.race([T.cast.ready, sleep(20000)]);
  const N = window.NYC;
  const X5 = N?.avenueX ? N.avenueX('5') : 0.4;
  const grade = app.postFX?.colorGrade;
  // Jane (buildCast: ready or not when her shot comes)
  const KC = T.cast || { okJane: false, drop() {} };
  // the city's sightseeing chopper, a clone (its meshes, their geometry and materials shared), flown by hand in its shot;
  // the player's own (hovering over 37th St) hidden meanwhile, never moved
  const H0 = cm.entities?.helicopter, h0Vis = H0?.mesh ? H0.mesh.visible : null;
  let heli = null;
  if (H0?.mesh) {
    try {
      const path = (o) => { const p = []; while (o && o !== H0.mesh) { p.unshift(o.parent.children.indexOf(o)); o = o.parent; } return p; };
      const root = H0.mesh.clone(true), at = (p) => p.reduce((o, i) => o?.children[i], root);
      heli = { root, tilt: at(path(H0.tiltPivot)), main: at(path(H0.mainRotorPivot)), tail: at(path(H0.tailRotorPivot)) };
      if (!heli.tilt || !heli.main || !heli.tail) throw new Error('no rotors');
      // (the main rotor's blur disc left out of the clone: against the dusk sky it read as a pale plate over the blades)
      for (const o of heli.main.children) if (o.isMesh && o.geometry?.type === 'CylinderGeometry') o.visible = false;
      root.name = 'wagmi-trailer-heli'; root.visible = false; app.scene.add(root);
    } catch (e) { console.warn('[trailer] chopper', e); heli = null; }
  }

  // (every bone of Dan's as the opening left them, put back after: the mixer writes a bone only when its value changes,
  // so a pose from the opening's later frames the trailer borrows could otherwise outlive it in a bone its start never
  // moves. v4: his own fight clips and the Suits' rigs gone with the park fight, the owner, 24 Oct)
  const snap = (root) => { const L = []; root?.traverse((o) => { if (o.isBone) L.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); }); return () => { for (const [o, p, q, sc] of L) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); } }; };
  const unsnap = snap(Qn.body);
  const vapor = createVapor(app.scene);
  // (the drifts' tyre smoke: puffs of its own, so a drift's never take the hop's)
  const smoke = createVapor(app.scene);
  // (the car's own idle step put aside: its thrust and wheels are the trailer's while it plays. kick: the burn lit at
  // once on an ignition, not eased in. The glow the burn throws on the road and the tail reaches further meanwhile)
  const carIdle0 = W.carIdle;
  let carState = { speed: 0, cold: 0, burn: 0, steer: 0 }, kick = false, glowK = 2.2;
  let glowL = null; rs.group?.traverse((o) => { if (o.isPointLight && o.position.z < -2) glowL = o; });
  const glowD0 = glowL ? glowL.distance : 0; if (glowL) glowL.distance = 11;
  W.carIdle = (dt) => {
    rs.setThrust(carState.cold, carState.burn);
    if (kick) { kick = false; rs.update(1, 0, carState.steer); }
    rs.update(dt, carState.speed, carState.steer);
    if (glowL) glowL.intensity *= glowK;
  };
  // Dan at the wheel in the car's shots (the owner, 28 Oct: the seat was empty): the game's own driver (WAGMI.ride.driver,
  // roadster.js createDriver), in his seat with his hands on the yoke as when he drives, the yoke turned by the shot's
  // steer (the drifts' counter-steer: his hands go with it). The game seats him only while no scene directs him and lets
  // him go every frame one does (game.js: in the car means at the wheel unless a scene has him), so each of these shots'
  // frames puts him back in at once. On a cut to the opening's set, Jane, the chopper or the black, and at the end, he is
  // put back exactly as the opening had him as he got in: his body under the same parent at the same place, turn and
  // size, every clip as it was (weight, on, time, rate, playing) and every bone (the mixer writes only a bone whose value
  // changes, so the seat's bends could outlive it in his legs)
  const CAR_SHOTS = new Set(['ignite', 'launch', 'burn', 'driftA', 'driftB', 'hop', 'birdseye', 'logo']);
  const drv = W.ride?.driver;
  let seat0 = null;
  function seat(dt) {
    if (!drv) return;
    const body = Qn.body;
    if (!seat0) seat0 = { parent: body.parent, pos: body.position.clone(), quat: body.quaternion.clone(), scale: body.scale.clone(), bones: snap(body),
      acts: Qn.mixer._actions.map((a) => [a, a.weight, a.enabled, a.isScheduled(), a.time, a.timeScale]) };
    // (let go since the last frame: in again from his own size, not one carried over from the seat)
    if (!drv.attached) { body.scale.copy(seat0.scale); drv.attach(0); }
    drv.pose(dt, 1, { steer: carState.steer });
  }
  function unseat() {
    if (!seat0) return;
    const s = seat0, body = Qn.body; seat0 = null;
    if (drv.attached) drv.detach(s.parent);
    if (body.parent !== s.parent) s.parent.add(body);
    body.position.copy(s.pos); body.quaternion.copy(s.quat); body.scale.copy(s.scale);
    for (const [a, w, on, run, time, rate] of s.acts) {
      if (run && !a.isScheduled()) a.play(); else if (!run && a.isScheduled()) a.stop();
      a.enabled = on; a.time = time; a.timeScale = rate; a.setEffectiveWeight(w);
    }
    s.bones();
    body.updateMatrixWorld(true);
  }

  /* ---- where */
  const ground = (x, z, k = 'person') => cm.getGroundHeight(x, z, k);
  const LANE = X5 - 3.4;                       // 5th Ave, northbound (heading PI: -z)
  // the drifts: 5th Ave north into 28th St west (a left)
  const Z28 = N?.streetZ ? N.streetZ(28) : 1117.1;
  // the bird's-eye: straight down on 5th Ave by Madison Square, the car rolling north from ZB
  const ZB = 1336;

  /* ---- the shots: [from bar, to bar, kind, params] */
  const S = [
    { a: 0, b: 2, kind: 'black' },
    { a: 2, b: 4, kind: 'aerial' },
    // (v5: from 12.6, not 11.4: the door's leaf hides him until ~13.1, and nothing comes out ahead of him now)
    { a: 4, b: 5, kind: 'open', t0: 12.6 },
    { a: 5, b: 6, kind: 'open', t0: 15.0, chart: 'up' },
    { a: 6, b: 7, kind: 'open', t0: 19.0, chart: 'down' },
    { a: 7, b: 8, kind: 'open', t0: 21.55 },
    { a: 8, b: 9, kind: 'open', t0: 25.0 },
    // (the grab: on the opening's frames with a camera of its own and the strap hung: grabFrame)
    { a: 9, b: 10, kind: 'open', t0: 33.45, grab: true },
    { a: 10, b: 11, kind: 'open', t0: 65.0, rate: 0.9 },
    { a: 11, b: 11.5, kind: 'open', t0: 36.0 },
    { a: 11.5, b: 11.875, kind: 'open', t0: 39.25 },
    // (the stop: the tail in the dark; the drop: the five light)
    { a: 11.875, b: 12.5, kind: 'ignite' },
    { a: 12.5, b: 13, kind: 'launch' },
    { a: 13, b: 14, kind: 'burn' },
    { a: 14, b: 15, kind: 'driftA' },
    { a: 15, b: 15.5, kind: 'driftB' },
    // (v4: Gears, the park fight, the takedown and the rail out, the owner, 24 Oct; the music's join on bar 16 in the
    // hop's air, the loop's B played again)
    { a: 15.5, b: 16.5, kind: 'hop' },
    { a: 16.5, b: 17, kind: 'open', t0: 60.0 },
    // (the hook's new phrase: the chopper; Jane (left out when she is not built in time, decided at her first frame: the
    // chopper runs on); straight down on the avenue, the five lit on bar 19)
    { a: 17, b: 18, kind: 'heli' },
    { a: 18, b: 18.5, kind: 'jane', need: () => KC.okJane },
    { a: 18.5, b: CARD, kind: 'birdseye' },
    { a: CARD, b: LOGO, kind: 'black' },
    { a: LOGO, b: END_BAR, kind: 'logo' },
  ];
  for (const s of S) { s.A = B(s.a); s.Bt = B(s.b); }
  const shotAt = (t) => { let s = S[0]; for (const x of S) { if (x.A > t) break; if (x.need && x.ok == null) x.ok = !!x.need(); if (x.need && !x.ok) continue; s = x; } return s; };
  const dusk = (s) => !(s.kind === 'open' || s.kind === 'black');

  /* ---- the cues: once each as the clock passes them */
  const play1 = (name, o) => { try { sfx.play(name, o); } catch {} };
  const CUES = [
    [0.35, () => play1('buzz', { gain: 0.22, times: 2 })],
    [B(7) + 0.05, () => play1('squeal', { gain: 0.32, dur: 1.5, p: 0.3 })],
    [B(8) + 0.12, () => play1('doorSlide', { gain: 0.7 })],
    [B(10) + 0.05, () => ui.sub('Mr. Big', 'You sign the confession.', ACID)],
    [B(11) - 0.05, () => ui.sub(null)],
    [B(11) + 0.06, () => { play1('shove', { gain: 0.8 }); play1('hit', { gain: 0.45 }); play1('grunt', { gain: 0.5, f0: 165, vowel: 'o' }); }],
    [B(11.5) + 0.02, () => play1('squeal', { gain: 0.4, dur: 1.0, p: -0.2 })],
    // the drop: the car's own whump as the five light; the launch past the lens; the drifts' squeal; the bird's-eye's
    // ignition on bar 19
    [B(DROP), () => W.audio?.play?.('boostIgnite', { vol: 1 })],
    [B(12.5) + 0.27, () => W.audio?.play?.('whoosh', { vol: 1, rate: 1.35 })],
    [B(14) + 0.3, () => play1('squeal', { gain: 0.36, dur: 1.4, p: -0.25 })],
    [B(15) + 0.02, () => play1('squeal', { gain: 0.3, dur: 0.85, p: 0.2 })],
    // (the hop's whoosh and landing are the hop's own, with its puffs; Jane's laptop pinging as she looks up; the boost
    // from above)
    [B(18) + 0.12, () => { if (cur?.kind === 'jane') play1('ding', { gain: 0.1 }); }],
    [B(IGN), () => W.audio?.play?.('boostIgnite', { vol: 1 })],
    [B(IGN) + 0.45, () => W.audio?.play?.('whoosh', { vol: 0.6, rate: 0.9 })],
    [B(CARD) + 0.02, () => play1('thunk', { gain: 0.55, f: 52 })],
    [B(LOGO), () => play1('thunk', { gain: 0.6, f: 70 })],
    // (the name's second line on beat 2 of the slam's bar)
    [B(LOGO) + 2 * BEAT, () => play1('thunk', { gain: 0.4, f: 58 })],
  ].sort((a, b) => a[0] - b[0]);
  let cueAt = 0;
  while (cueAt < CUES.length && CUES[cueAt][0] < AT0) cueAt++;

  /* ---- the clock: the music's, smoothed onto the page's (the context's time moves in steps) */
  let t0Audio = 0, src = null, clockP = 0, perf0 = 0, ran = false;
  const lat = () => (actx ? (actx.outputLatency || 0) + (actx.baseLatency || 0) : 0);
  function startClock() {
    perf0 = performance.now();
    if (T.sound && actx) {
      try {
        src = actx.createBufferSource(); src.buffer = T.sound;
        const g = actx.createGain(); g.gain.value = 0.92; src.connect(g); g.connect(W.audio.bus?.master || actx.destination);
        src._g = g;
        t0Audio = actx.currentTime + 0.06 - AT0; src.start(t0Audio + AT0, AT0);
      } catch (e) { console.warn('[trailer] music', e); src = null; }
    }
  }
  function clock() {
    const tp = (performance.now() - perf0) / 1000 - 0.06 + AT0;
    if (src && actx.state !== 'running') {
      // (held while the sound is: a hidden tab. A context that never got going (no unlock) is let go after 0.8 s and the
      // page's clock carries the pictures on alone, rather than black for ever)
      if (ran || tp - AT0 < 0.8) return clockP;
      try { src.stop(); } catch {} src = null;
    }
    if (!src) { clockP = tp; return clockP; }
    ran = true;
    const ta = actx.currentTime - t0Audio - lat();
    // (between the context's steps the page's time carries it; held to the music's)
    clockP = Math.abs(ta - clockP) > 0.12 ? ta : clockP + (ta - clockP) * 0.2;
    return clockP;
  }
  let lastP = performance.now();

  /* ---- the frame */
  const cam = D.camera;
  const setCam = (pos, look, fov, o = {}) => { cam.pos = pos; cam.look = look; cam.fov = fov; cam.roll = o.roll || 0; cam.band = o.band !== false; cam.shake = o.shake ? handheld(clockP * (o.rate || 1.3), o.shake) : null; };
  let cur = null, last = -1, timeOf = null;
  const lookOf = { golden: { bal: [1.06, 1.0, 0.92], sat: 1.12, con: 1.16 }, dusk: { bal: [0.93, 1.0, 1.1], sat: 1.12, con: 1.14 } };
  function look(kind, exp) {
    if (!grade) return;
    const L = lookOf[kind];
    if (exp != null) grade.exposure.value = exp;
    grade.balance.value.set(...L.bal); grade.saturation.value = L.sat; grade.contrast.value = L.con;
  }
  function setTime(id) { if (timeOf === id) return; timeOf = id; app.selectTime?.(id); }
  // (the opening's set and cast away for a shot of the trailer's own; Dan's bones back to the opening's clean pose)
  let borrowed = false;
  function own() { if (borrowed) { borrowed = false; borrow.off(); } }
  function carPose(x, z, h, o = {}) {
    car.position.set(x, ground(x, z, 'car') + (o.y || 0), z); car.heading = h; car.speed = 0; car.vx = car.vz = 0;
    car.mesh.position.copy(car.position); car.mesh.rotation.set(0, h, o.roll || 0); car.mesh.visible = true;
    carState = { speed: o.speed || 0, cold: o.cold || 0, burn: o.burn || 0, steer: o.steer || 0 };
  }
  const carAt = (x, z, h, y = 0, speed = 0, cold = 0, burn = 0, steer = 0) => carPose(x, z, h, { y, speed, cold, burn, steer });
  // a point in the car's frame: f forward, r right, u up (relP: in the frame of a pose at x, ground y0, z, heading h)
  const relP = (x, y0, z, h, f, r, u) => { const fx = Math.sin(h), fz = Math.cos(h); return [x + fx * f - fz * r, y0 + u, z + fz * f + fx * r]; };
  const rel = (f, r, u) => relP(car.position.x, car.position.y, car.position.z, car.heading, f, r, u);
  // the speed kick: the lens punched wider at `at`, settling back part way
  const punch = (u, at, amt) => amt * (smooth((u - at) / 0.06) - 0.5 * smooth((u - at - 0.06) / 0.55));
  const fx = { spd: 0 };
  // a drift (sp): a straight up to the arc's start (x0, z0, heading h0), a quarter circle of radius R turning dir (1 left,
  // -1 right), a straight on; v m/s (and acc from ign: the boost out of the corner); s at t = 0 is pre. Its heading the
  // path's plus a slip angle (slip, built over on, let go over off), the fronts turned in, then counter-steered against
  // the slide, the body rolled to the outside
  function drift(sp, t) {
    const dI = Math.max(0, t - (sp.ign ?? Infinity)), acc = sp.acc || 0;
    const s = sp.pre + sp.v * t + 0.5 * acc * dI * dI, v = sp.v + acc * dI;
    const L = sp.R * PI / 2, d = sp.dir;
    const left = (h) => [Math.cos(h), -Math.sin(h)];
    let x, z, hv;
    if (s < 0) { x = sp.x0 + Math.sin(sp.h0) * s; z = sp.z0 + Math.cos(sp.h0) * s; hv = sp.h0; }
    else {
      const l0 = left(sp.h0), cx = sp.x0 + d * sp.R * l0[0], cz = sp.z0 + d * sp.R * l0[1];
      hv = sp.h0 + d * Math.min(s, L) / sp.R;
      const l = left(hv); x = cx - d * sp.R * l[0]; z = cz - d * sp.R * l[1];
      if (s > L) { x += Math.sin(hv) * (s - L); z += Math.cos(hv) * (s - L); }
    }
    const env = smooth((t - sp.on[0]) / (sp.on[1] - sp.on[0])) * (1 - smooth((t - sp.off[0]) / (sp.off[1] - sp.off[0])));
    const turnIn = smooth((t - (sp.on[0] - 0.22)) / 0.16);
    return { x, z, hv, dir: d, h: hv + d * sp.slip * env, v, env, steer: lerp(d * 0.55 * turnIn, -d * 0.95, env), roll: d * 0.045 * env };
  }
  const DR = 9.5;
  const DRIFT_A = { x0: LANE, z0: Z28 + DR, h0: PI, dir: 1, R: DR, v: 17, pre: -6.2, on: [0.2, 0.52], off: [1.22, 1.62], slip: 0.62 };
  // tyre smoke: grey puffs at the rear wheels (a few at the fronts) while it slides, left behind on the road, rising
  let smokeAcc = 0;
  const _w = new THREE.Vector3();
  function tyreSmoke(d, dt, rate = 1) {
    if (!(dt > 0) || d.env < 0.15) return;
    smokeAcc += Math.min(dt, 0.1) * 30 * d.env * rate;
    const n = Math.floor(smokeAcc); if (!n) return; smokeAcc -= n;
    car.mesh.updateMatrixWorld(true);
    // (left on the road as the car slides on, and thrown out to the outside of the turn)
    const vx = Math.sin(d.hv) * d.v, vz = Math.cos(d.hv) * d.v, g = car.position.y, ox = -Math.cos(d.hv) * d.dir, oz = Math.sin(d.hv) * d.dir;
    for (const w of rs.wheels || []) {
      if (w.front && Math.random() < 0.7) continue;
      w.W.getWorldPosition(_w);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * PI * 2, sp = 0.5 + Math.random() * 1.8;
        smoke.puff(_w.x + (Math.random() - 0.5) * 0.35, g + 0.2 + Math.random() * 0.15, _w.z + (Math.random() - 0.5) * 0.35,
          vx * 0.14 + Math.sin(a) * sp + ox * (2 + Math.random() * 3), 0.4 + Math.random() * 0.9, vz * 0.14 + Math.cos(a) * sp + oz * (2 + Math.random() * 3),
          { r: 0.34, grow: 3.4, life: 0.9 + Math.random() * 0.6, a: 0.34, k: 0.42, drag: 1.8, lift: 0.8 });
      }
    }
  }
  const puffs = { last: -1 }, pre = { j: 0 };
  function hopPuffs(kind) {
    const b = car.body || { hx: 1.05, z0: -2.3, z1: 2.4 }, h = car.heading, fx = Math.sin(h), fz = Math.cos(h), v = carState.speed;
    if (kind === 'up') for (const [lx, lz] of [[b.hx - 0.25, b.z1 - 0.5], [-(b.hx - 0.25), b.z1 - 0.5], [b.hx - 0.25, b.z0 + 0.45], [-(b.hx - 0.25), b.z0 + 0.45]]) {
      const x = car.position.x + lx * Math.cos(h) + lz * fx, z = car.position.z - lx * Math.sin(h) + lz * fz;
      for (let i = 0; i < 6; i++) { const a = Math.random() * PI * 2, sp = 3 + Math.random() * 5; vapor.puff(x, car.position.y + 0.25, z, fx * v * 0.35 + Math.sin(a) * sp, -1 + Math.random() * 1.5, fz * v * 0.35 + Math.cos(a) * sp, { r: 0.22, grow: 3.2, life: 0.9 + Math.random() * 0.5, a: 0.5, drag: 3.2 }); }
    }
    if (kind === 'side') { // the left flank's ports, out to the right... the car shoved left: the jets out of its right side
      for (const lz of [b.z1 - 0.9, b.z0 + 0.8]) {
        const lx = -(b.hx + 0.05), x = car.position.x + lx * Math.cos(h) + lz * fx, z = car.position.z - lx * Math.sin(h) + lz * fz, rx = -Math.cos(h), rz = Math.sin(h);
        for (let i = 0; i < 12; i++) { const k = i / 11, out = 0.15 + k * 1.6, sp = 4 + Math.random() * 5; vapor.puff(x + rx * out, car.position.y + 0.45, z + rz * out, fx * v * 0.85 + rx * sp, (Math.random() - 0.3) * 1.6, fz * v * 0.85 + rz * sp, { r: 0.2 + k * 0.22, grow: 2.6, life: 0.55 + Math.random() * 0.45, a: 0.62 * (1 - k * 0.45), drag: 3.5 }); }
      }
    }
  }

  // each kind's frame at its own time u (s since the cut)
  const K = {
    black(u, s) {
      // (in the first card's black, once she is ready: a frame in Jane's room, so the cut to her costs nothing: the
      // pipelines the frame asks for (its shadows' too) and the textures' uploads, made here where nothing shows)
      if (s.a !== 0 || u > B(2) - 0.35) return;
      if (pre.j === 1) { pre.j = 2; KC.room?.full(null); return; }
      if (!pre.j && KC.okJane) { pre.j = 1; K.jane(0.5, {}, 1 / 60); }
    },
    aerial(u, s) {
      // dusk over Midtown: from over Murray Hill, a long climbing sweep west and round to the Empire State, lit
      const k = ease.inOut(u / (s.Bt - s.A));
      const pos = [lerp(230, 70, k), lerp(95, 150, k), lerp(330, 470, k)];
      const look = [lerp(-40, -80, k), lerp(150, 250, k), lerp(640, 686, k)];
      setCam(pos, look, lerp(46, 40, k), { band: false, roll: lerp(0.05, -0.02, k) });
      P.mesh.visible = false;
    },
    ignite(u, s) {
      // the stop: the tail in the dark, the lens low at its quarter; the boom: the five light at once, the street goes
      // orange, and the car leaps away from the lens
      const tB = B(DROP) - s.A, lit = u >= tB, go = Math.max(0, u - tB - 0.28);
      if (lit && !s.lit) { s.lit = true; kick = true; }
      const ZI = 1398, g = ground(LANE, ZI, 'car');
      carPose(LANE, ZI - 15 * go * go, PI, { speed: 30 * go, cold: lit && u < tB + 0.18 ? 0.6 : 0, burn: lit ? 1 : 0 });
      setCam(relP(LANE, g, ZI, PI, -4.3 - 0.3 * smooth(u / 1.07), 1.6, 0.42), rel(-2.3, 0.05, 0.5), 30 + punch(u, tB, 9), { shake: lit ? 4 : 0.6, rate: lit ? 9 : 1.3 });
      P.mesh.visible = false;
    },
    launch(u) {
      // a lens on the asphalt by the lane: the car comes at it on the burn and blows past, the lens whipping round after it
      const ZL = 1340, z = ZL + 13 - (26 * u + 20 * u * u), tp = 0.41;
      carPose(LANE, z, PI, { speed: 26 + 40 * u, burn: 1 });
      const g = ground(LANE + 2.1, ZL);
      setCam([LANE + 2.1, g + 0.26, ZL], [LANE + 0.2, g + 0.62, z - 3.2], 34 + punch(u, tp - 0.05, 16), { shake: 2 + 5 * smooth((u - tp + 0.1) / 0.1), rate: 8 });
      fx.spd = 0.85 * smooth((u - tp + 0.12) / 0.12);
      P.mesh.visible = false;
    },
    burn(u) {
      // alongside it on the burn at 55 m/s, low, side on: the plumes streaming off the tail, the road lit under them
      const v = 55, z = 1300 - v * u, k = smooth(u / 1.714);
      carPose(LANE, z, PI, { speed: v, burn: 1 });
      setCam(rel(lerp(0.2, -1.1, k), lerp(5.8, 5.2, k), 0.55), rel(-2.0, 0, 0.6), 42, { shake: 3, rate: 9 });
      fx.spd = 0.55;
      P.mesh.visible = false;
    },
    driftA(u, s, dt) {
      // the lens low in the middle of 5th & 28th, outside the turn: up the avenue, the turn-in, sideways into 28th, the
      // tail swinging out at the lens, the smoke rolling
      const d = drift(DRIFT_A, u);
      carPose(d.x, d.z, d.h, { speed: d.v, steer: d.steer, roll: d.roll });
      tyreSmoke(d, dt);
      const cx = X5 - 1.2, cz = Z28 - 2.1, g = ground(cx, cz);
      setCam([cx, g + 0.42, cz], [car.position.x + 0.3, g + 0.72, car.position.z + 0.4], 36, { shake: 1.6 });
      P.mesh.visible = false;
    },
    driftB(u, s, dt) {
      // riding with it mid-slide, low off its front quarter on the outside: the fronts turned against the slide, the side
      // sweeping back to the rears pouring smoke (the smoke of the turn-in laid down first)
      if (!s.warm) { s.warm = true; for (let t = 0.2; t < 0.5; t += 1 / 30) { const w = drift(DRIFT_A, t); carPose(w.x, w.z, w.h); tyreSmoke(w, 1 / 30); smoke.update(1 / 30); } }
      const d = drift(DRIFT_A, u + 0.5);
      carPose(d.x, d.z, d.h, { speed: d.v, steer: d.steer, roll: d.roll });
      tyreSmoke(d, dt);
      const o = DRIFT_A.dir, fX = Math.sin(d.hv), fZ = Math.cos(d.hv), rX = -fZ * o, rZ = fX * o, g = ground(d.x, d.z);
      setCam([d.x + fX * 4.2 + rX * 2.5, g + 0.95, d.z + fZ * 4.2 + rZ * 2.5], [d.x - fX * 0.9, g + 0.45, d.z - fZ * 0.9], 46, { shake: 2.4, rate: 6 });
      P.mesh.visible = false;
    },
    hop(u) {
      const z0 = 1125, v = 30, z = z0 - v * u, H0 = 0.32;
      const ht = u - H0, y = ht > 0 && ht < 1.112 ? Math.max(0, 8.9 * ht - 8 * ht * ht) : 0;
      const gas = ht > 0 && ht < 0.4 ? 1 : 0;
      carAt(LANE, z, PI, y, v, gas, 0);
      if (ht > 0 && puffs.last < 1) { puffs.last = 1; hopPuffs('up'); if (ht < 0.15) W.audio?.play?.('whoosh', { vol: 0.7, rate: 0.75 }); }
      if (ht > 1.112 && puffs.last < 2) { puffs.last = 2; W.audio?.play?.('kerb', { vol: 0.8 }); }
      setCam([LANE + 7.4, 1.05, z0 - v * u + 4.6 - 0.6 * u], [car.position.x, 1.0 + y * 0.6, car.position.z - 1.2], 44, { shake: 1 });
      P.mesh.visible = false;
    },
    heli(u, s, dt) {
      // dusk, on the hook's new phrase: the city's sightseeing chopper sweeping down 5th Ave toward the Empire State, nose
      // down, banking toward it, the rotors a blur; the lens behind it, off its left and below, tracking, the tower lit
      // beyond it
      P.mesh.visible = false;
      if (!heli) { K.aerial(u + 1.2, { A: 0, Bt: B(2) }); return; }
      // (south, from over 40th St: the tower lit against the deep blue, as the aerial sees it; north it was into the sun)
      const v = 36, k = smooth(u / 2.2), z = 405 + v * u, x = X5 - 8 - 7 * k * k, y = 172 + 3 * u, h = -0.26 * k;
      heli.root.position.set(x, y, z); heli.root.rotation.set(0, h, 0);
      heli.tilt.rotation.set(0.2, 0, 0.24 * k); heli.tilt.position.y = 0.15 * Math.sin(u * 2.6);
      if (dt > 0) { heli.main.rotation.y += Math.min(dt, 0.05) * 24; heli.tail.rotation.x += Math.min(dt, 0.05) * 32; }
      setCam(relP(x, y, z, h, -lerp(17, 13.5, k), -lerp(7.5, 5.2, k), -lerp(5, 3.6, k)), relP(x, y, z, h, 9, 1.5, 2.6), lerp(42, 38, k), { shake: 0.7, rate: 1.6, roll: lerp(-0.05, 0.04, k) });
    },
    jane(u, s, dt) {
      // her room at night (jane.js createJaneRoom: a scene of its own, drawn in place of the city's frame): at her laptop,
      // its glow on her face, typing; a ping, a blink, and she looks up from the screen to just past the lens
      const J = KC.jane, lap = KC.lap, k = smooth(u / 0.857), up = smooth((u - 0.2) / 0.24);
      J.root.visible = true; J.root.position.set(0, 0, 0); J.root.rotation.set(0, 0, 0);
      J.rig.pose(2 + u); J.root.updateMatrixWorld(true);
      const shR = J.bones.upperarm01_R?.getWorldPosition(V()), shL = J.bones.upperarm01_L?.getWorldPosition(V()), ty = 0.012 * (1 - up);
      if (shR && shL) {
        J.arm('L', V(0.12, 0.8 + ty * Math.sin(u * 23 + 1.3), 0.42), shL.add(V(0.5, -0.5, 0)), 0.9);
        J.arm('R', V(-0.12, 0.8 + ty * Math.sin(u * 19), 0.42), shR.add(V(-0.5, -0.5, 0)), 0.9);
      }
      const cp = [lerp(0.3, 0.25, k), lerp(1.22, 1.19, k), lerp(1.78, 1.6, k)], scr = lap.localToWorld(V(0, 0.13, -0.1));
      // (her face, 28 Oct round 3 repair: the shot opened on a glare and a sulky mouth. Reading, her head is bowed most of
      // the way to the screen (her eyes need little more, her lids follow them: jane.js), her brows a touch up from rest and
      // her lips just apart; on the ping she blinks, then her head leads the look up (the eyes no further than it) and her
      // brows lift a little and settle)
      const upH = smooth((u - 0.17) / 0.24), upE = smooth((u - 0.25) / 0.22), lift = Math.sin(PI * upE), cam0 = V(cp[0] + 0.12, cp[1] + 0.04, cp[2]);
      J.face.set({ blink: u > 0.12 && u < 0.24 ? 1 - Math.abs(u - 0.18) / 0.06 : 0, brow: 0.12 + 0.2 * lift });
      J.jaw(0.05 * (1 - upE));
      J.face.aim(scr.clone().lerp(cam0, upH), { k: 0.75, eyes: scr.clone().lerp(cam0, upE) });
      lap.userData.screen('trace', u);
      KC.room.full({ pos: cp, look: [0.0, 1.05, 0.15], fov: shotFov(cs, 34) });
      // (the city's lens left where it was: only the band's bars from it)
      cam.band = true; cam.shake = null;
      P.mesh.visible = false;
    },
    birdseye(u, s) {
      // straight down over 5th Ave by Madison Square: the car rolling up the avenue; on bar 19 the five light (the plumes
      // seen from above, the road orange under them) and it rockets up the grid; the lens climbing after it, lagging, the
      // frame turning (a high orbit)
      const tI = B(IGN) - s.A, lit = u >= tI, dI = Math.max(0, u - tI), v0 = 12, acc = 26;
      if (lit && !s.lit) { s.lit = true; kick = true; }
      const z = ZB - (v0 * u + 0.5 * acc * dI * dI);
      carPose(LANE, z, PI, { speed: v0 + acc * dI, cold: lit && dI < 0.15 ? 0.6 : 0, burn: lit ? 1 : 0 });
      // (lower than v3's 28-54 m, the lens keeping closer after it, and on a phone held upright the whole tall screen (no
      // band: straight down, the avenue runs up it), so the car and its five read on a phone; brighter too, EXP)
      const k = smooth(u / (s.Bt - s.A)), H = lerp(20, 38, k), g = ground(LANE, ZB, 'car');
      const zc = ZB - 3 - (v0 * u + 0.42 * acc * dI * dI);
      setCam([LANE + 0.6, g + H, zc], [LANE + 0.6, g, zc - 0.02 * H], lerp(42, 48, k) + punch(u, tI, 6), { roll: lerp(-0.35, 0.25, k), shake: lit ? 1.2 : 0.4, rate: 3, band: false });
      fx.spd = lit ? 0.35 * smooth(dI / 0.08) * (1 - smooth((dI - 0.35) / 0.4)) : 0;
      P.mesh.visible = false;
    },
    logo(u) {
      // the car at rest in the avenue, its rockets glowing; the lens low behind it, pushing in
      const z = 1180; carAt(LANE, z, PI, 0, 0, 0.35, 0.3);
      const k = smooth(u / (B(2.5)));
      setCam(rel(lerp(-6.2, -5.2, k), lerp(2.6, 2.2, k), lerp(0.75, 0.68, k)), rel(10, -0.4, 1.4 + 0.3 * k), 44);
      P.mesh.visible = false;
    },
  };

  /* ---- the type over it */
  const set = (el, o) => { if (el.style.opacity !== String(o)) el.style.opacity = String(o); };
  function overlay(t, s, u) {
    // the black: the cards, the stop before the drop, the fade at the end
    let blk = 0;
    if (s.kind === 'black') blk = 1;
    if (t >= B(11.875) && t < B(DROP)) blk = 0.4;
    if (t < B(2)) blk = 1 - smooth((t - (B(2) - 0.08)) / 0.08);
    if (t > END - 0.5) blk = smooth((t - (END - 0.5)) / 0.45);
    set(pg.blk, blk.toFixed(3));
    // the flash: the ignition on the drop (light: the five are the flash), the bird's-eye's ignition on bar 19, the slam
    const flashAt = (at, peak, len) => (t >= at ? Math.max(0, 1 - (t - at) / len) * peak : 0);
    const fl = flashAt(B(DROP), 0.38, 0.12) + (t < B(CARD) ? flashAt(B(IGN), 0.28, 0.1) : 0) + flashAt(B(LOGO), 0.9, 0.3);
    set(pg.flash, fl.toFixed(3));
    // the cards
    const card = t < B(2) ? { text: 'FIRST YEAR AT JPBANK.', a: 0.45, b: B(2) - 0.12, rule: true } : t >= B(CARD) && t < B(LOGO) ? { text: 'WRONG GUY TO FRAME.', a: B(CARD) + 0.1, b: B(LOGO) - 0.04, rule: false } : null;
    if (card) {
      const ca = smooth((t - card.a) / 0.35) * (1 - smooth((t - (card.b - 0.18)) / 0.18));
      if (pg.cardT.textContent !== card.text) pg.cardT.textContent = card.text;
      set(pg.card, ca.toFixed(3));
      pg.card.style.transform = `translateY(-50%) scale(${(1.035 - 0.035 * ease.out((t - card.a) / 1.6)).toFixed(4)})`;
      pg.cardR.style.transform = `scaleX(${card.rule ? ease.out((t - card.a - 0.4) / 0.8).toFixed(3) : 0})`;
    } else set(pg.card, 0);
    // the chart and the big words
    let ch = 0, upK = 0, dnK = 0, big = '', bigA = 0, tick = '', tickC = '#4ADE80';
    if (s.chart) {
      ch = s.chart === 'up' ? smooth(u / 0.18) : 1 - smooth((u - (s.Bt - s.A - 0.15)) / 0.15);
      upK = s.chart === 'up' ? ease.out(u / 1.1) : 1;
      dnK = s.chart === 'down' ? ease.in(clamp(u / 0.75)) : 0;
      big = s.chart === 'up' ? 'THEY GOT RICH.' : 'HE GOT FRAMED.';
      bigA = smooth((u - 0.1) / 0.12) * (1 - smooth((u - (s.Bt - s.A - 0.14)) / 0.14));
      if (s.chart === 'up') { tick = 'BLIMPCO  +' + Math.round(340 * upK).toLocaleString('en-US') + '%'; }
      else { tick = 'HIS NAME  −' + (99.7 * Math.min(1, dnK * 1.15)).toFixed(1) + '%'; tickC = '#EF4444'; }
    }
    set(pg.chart, ch.toFixed(3));
    if (ch > 0) {
      if (pg.up.getAttribute('d') !== CHART.up) { pg.up.setAttribute('d', CHART.up); pg.area.setAttribute('d', CHART.area); pg.down.setAttribute('d', CHART.down); }
      pg.up.style.strokeDasharray = CHART.upLen; pg.up.style.strokeDashoffset = (CHART.upLen * (1 - upK)).toFixed(1);
      pg.area.style.opacity = (upK * (1 - dnK)).toFixed(3);
      pg.down.style.strokeDasharray = CHART.downLen; pg.down.style.strokeDashoffset = (CHART.downLen * (1 - dnK)).toFixed(1);
      if (pg.tick.textContent !== tick) pg.tick.textContent = tick; pg.tick.style.color = tickC;
    }
    if (pg.big.textContent !== big && big) { pg.big.textContent = big; pg.big.style.color = s.chart === 'up' ? '#fff' : '#fff'; }
    set(pg.big, bigA.toFixed(3));
    pg.big.style.transform = `scale(${(1.06 - 0.06 * ease.out(u / 0.25)).toFixed(4)})`;
    // the logo: slammed in on the crash, the rule drawn, the line after it
    if (t >= B(LOGO)) {
      const k = t - B(LOGO);
      set(pg.logo, Math.min(1, k / 0.06).toFixed(3));
      pg.logo.style.transform = `translateY(-58%) scale(${(1 + 0.32 * Math.pow(1 - clamp(k / 0.16), 2.4) + 0.035 * clamp(k / 4.3)).toFixed(4)})`;
      pg.logoR.style.transform = `scaleX(${ease.out((k - 0.25) / 0.6).toFixed(3)})`;
      // (the second line, UNFINISHED BUSINESS, on beat 2 of the bar: in fast, settling from a touch larger)
      const g0 = 2 * BEAT - 0.03;
      set(pg.logoG, smooth((k - g0) / 0.12).toFixed(3));
      pg.logoG.style.transform = `scale(${(1.1 - 0.1 * ease.out(clamp((k - g0) / 0.35))).toFixed(4)})`;
      set(pg.shade, smooth(k / 0.3).toFixed(3));
    } else { set(pg.logo, 0); set(pg.shade, 0); }
    // the booster's speed streaks round the frame, flickered between their two sets
    const sp = fx.spd;
    if (sp > 0.01) {
      const f = (++flick & 1) ? 1 : 0.3;
      set(pg.spd[0], (sp * f).toFixed(2)); set(pg.spd[1], (sp * (1.3 - f)).toFixed(2));
      for (const el of pg.spd) el.style.transform = `scale(${(1 + Math.random() * 0.07).toFixed(3)})`;
    } else { set(pg.spd[0], 0); set(pg.spd[1], 0); }
  }
  let flick = 0;

  /* ---- the run */
  // (the exposure: the car's shots up, v1's burns read too dark; the bird's-eye most, the avenue's asphalt from above)
  const EXP = { aerial: 1.0, hop: 1.3, logo: 1.1, ignite: 1.1, heli: 1.1, birdseye: 1.75 };
  // the rocket's roar under the burns (the city's sound: a bed of its own, made at the first burn, let go at the end)
  const BURNS = new Set(['ignite', 'launch', 'burn', 'birdseye']);
  let roar = null, roarV = -1;
  function roarAt(s) {
    const want = BURNS.has(s.kind) ? 0.3 * carState.burn : 0;
    if (!roar && want > 0) { try { roar = W.audio?.loop?.('roar', { bus: 'sfx', vol: 0 }) || null; } catch { roar = null; } }
    if (roar && Math.abs(want - roarV) > 0.01) { roarV = want; try { roar.set({ vol: want }); } catch {} }
  }
  // the chopper's blades (the city's own loop) for its shot
  let heliSnd = null;
  function heliSound(on) {
    if (on && !heliSnd) { try { heliSnd = W.audio?.loop?.('heli', { bus: 'sfx', vol: 0 }) || null; heliSnd?.set({ vol: 0.6 }); } catch { heliSnd = null; } }
    else if (!on && heliSnd) { try { heliSnd.stop(0.12); } catch {} heliSnd = null; }
  }
  // the grab (bars 9-10, the hero film's 'grab' too): Hooks rips the bag off Dan on the opening's own frames (x: its
  // time), with a camera of its own (28 Oct, round 3: the opening's, 1.05 m up and 2.2 m off them, had Hooks cut at the
  // chin and both heads out of the hero film's crops): against the shop fronts behind them at eye height, both men from
  // the waist up with room over their heads in the trailer's band, the hero film's 2560x1120 and its 1440x1080 middle,
  // drifting a little with the bag. And the strap: the opening lays its rope out as a line between the bag's rings that
  // springs out stiff to its full length, then swings on undamped; here it hangs from the rings at rest as the bag comes
  // off him and moves as a damped rope (its points written into the opening's rope at rest each frame, so the opening's
  // own step adds nothing)
  const SLING = 0.95, FLOOR = 0.23; // (intro.js: BAG.sling, the rope's length; the sidewalk under it)
  const GRAB = { pts: null, old: null }, _d = new THREE.Vector3();
  function grabFrame(x, dt) {
    const k = smooth((x - 33.45) / 1.7);
    setCam([lerp(109.45, 109.25, k), 1.7, 388.42], [lerp(109.42, 109.28, k), 1.45, 390.5], 48, { shake: 1.2 });
    const bag = W.cast?.bag, sl = bag?.sling;
    if (!sl || !sl.mesh.visible) { GRAB.pts = null; return; }
    const [a, b] = bag.rings(), P = sl.points, N = P.length, seg = SLING / (N - 1);
    if (!GRAB.pts) { GRAB.pts = hang(a, b, N); GRAB.old = GRAB.pts.map((p) => p.clone()); }
    else if (dt > 0) {
      const h = Math.min(dt, 1 / 30), keep = Math.exp(-4.5 * h), R = GRAB.pts;
      for (let i = 1; i < N - 1; i++) { const p = R[i], o = GRAB.old[i]; _d.subVectors(p, o).multiplyScalar(keep); o.copy(p); p.add(_d); p.y -= 9.8 * h * h; }
      // (its length held, both ends on the rings, above the sidewalk)
      for (let it = 0; it < 14; it++) {
        R[0].copy(a); R[N - 1].copy(b);
        for (let i = 0; i < N - 1; i++) {
          const p = R[i], q = R[i + 1], len = _d.subVectors(q, p).length() || 1e-6, e = (len - seg) / len;
          const wp = i === 0 ? 0 : i + 1 === N - 1 ? 1 : 0.5, wq = i + 1 === N - 1 ? 0 : i === 0 ? 1 : 0.5;
          p.addScaledVector(_d, e * wp); q.addScaledVector(_d, -e * wq);
        }
        for (const p of R) if (p.y < FLOOR + 0.01) p.y = FLOOR + 0.01;
      }
    }
    // (into the opening's rope twice: its speed is how far its points moved since its last step, so after the second it
    // has none; its tube built from them)
    for (let n = 0; n < 2; n++) { P.forEach((p, i) => p.copy(GRAB.pts[i])); sl.update(0, a, b, FLOOR); }
  }
  // (a rope SLING long hanging at rest from a and b: a U under the line between them, its N points evenly spaced along it)
  function hang(a, b, N) {
    const M = 64, chord = b.clone().sub(a);
    const curve = (d) => Array.from({ length: M + 1 }, (_, i) => a.clone().addScaledVector(chord, i / M).add(new THREE.Vector3(0, -d * Math.sin(PI * i / M), 0)));
    const length = (c) => c.reduce((s, p, i) => (i ? s + p.distanceTo(c[i - 1]) : 0), 0);
    let lo = 0, hi = SLING; for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (length(curve(mid)) < SLING) lo = mid; else hi = mid; }
    const c = curve(lo), step = length(c) / (N - 1), out = [a.clone()];
    let acc = 0, j = 1;
    for (let i = 1; i < N - 1; i++) {
      const want = i * step;
      while (j < M && acc + c[j].distanceTo(c[j - 1]) < want) { acc += c[j].distanceTo(c[j - 1]); j++; }
      out.push(c[j - 1].clone().lerp(c[j], (want - acc) / (c[j].distanceTo(c[j - 1]) || 1)));
    }
    out.push(b.clone());
    return out;
  }
  function frameAt(t, dt) {
    const s = shotAt(t), u = t - s.A;
    if (s !== cur) {
      // a cut: the time of day for it, the opening's set in or out; the last shot's vapour and smoke gone with it; the
      // chopper and Jane's room only in their own shots (the player's chopper out of sight in the chopper's)
      cur = s; puffs.last = -1; smokeAcc = 0; vapor.update(99); smoke.update(99);
      // (out of the car's shots: Dan out of his seat, as the opening had him, before its set is borrowed or put away)
      if (!CAR_SHOTS.has(s.kind)) unseat();
      if (s.kind === 'open') { setTime('golden'); borrowed = true; } else { own(); if (dusk(s)) setTime('twilight'); }
      if (heli) heli.root.visible = s.kind === 'heli';
      if (H0?.mesh && h0Vis) H0.mesh.visible = s.kind !== 'heli';
      heliSound(s.kind === 'heli');
      if (s.kind !== 'jane') KC.room?.full(null);
      // (seen from above, the burn's glow on the road brighter and wider)
      glowK = s.kind === 'birdseye' ? 5 : 2.2; if (glowL) glowL.distance = s.kind === 'birdseye' ? 18 : 11;
    }
    fx.spd = 0;
    if (s.kind === 'open') {
      borrow.at(s.t0 + u * (s.rate || 1), dt);
      if (s.grab) grabFrame(s.t0 + u * (s.rate || 1), dt);
      look('golden', null);
    } else {
      K[s.kind](u, s, dt);
      // (the car where the shot put it: Dan in its seat, his hands on the yoke)
      if (CAR_SHOTS.has(s.kind)) seat(dt);
      if (dusk(s)) look('dusk', EXP[s.kind] ?? 1.45);
    }
    roarAt(s);
    vapor.update(dt); smoke.update(dt);
    overlay(t, s, u);
    while (cueAt < CUES.length && CUES[cueAt][0] <= t) { try { CUES[cueAt][1](); } catch (e) { console.warn('[trailer] cue', e); } cueAt++; }
  }

  // wait for the music (the first card's black holds), then the clock and the frames
  borrow.quiet = true;
  // (the opening's frames are the trailer's from now: its director's camera, its quiet set)
  W.directed = (dt) => { D.framed = true; tick(dt); };
  D.onFrame = (dt) => tick(dt);
  let done = null, skipped = false, sawLogo = false, held = false, ended = false;
  W.audio?.duck?.('amb', 0.45, END + 2);
  // (the avenue, and the street the drift turns into, kept clear)
  app.trafficSystem?.hold?.([...(borrow.hold || []), { minX: X5 - 16, maxX: X5 + 16, minZ: 880, maxZ: 1420 },
    { minX: X5 - 48, maxX: X5 + 16, minZ: Z28 - 12, maxZ: Z28 + 14 }]);
  startClock();
  function tick(dt) {
    if (ended) return;
    let t = clock();
    if (T.mode === 'only' && t >= END - 0.55) t = END - 0.55;
    t = clamp(t, 0, END);
    if (t >= END) { finish(false); return; }
    frameAt(t, dt);
  }
  D.block(true, { onSkip: () => finish(true), skipAfter: 0.8 });
  const skipLoop = () => { if (ended) { ui.skip(null); return; } D.skipStep(1 / 60, ui); requestAnimationFrame(skipLoop); };
  requestAnimationFrame(skipLoop);
  W.trailerT = () => clockP; // (for looking at it)

  async function finish(skip) {
    if (ended) return; ended = true; skipped = skip;
    // (did the player see the logo slam? then the opening leaves its own title out: the owner's call, 23 Oct)
    sawLogo = !skip || clockP >= (S.find((x) => x.kind === 'logo')?.A ?? Infinity);
    D.block(false); ui.skip(null); ui.sub(null);
    // to black (at once on a skip, the music let go)
    pg.blk.style.transition = 'opacity .22s'; pg.blk.style.opacity = '1';
    if (src) { try { const g = src._g.gain; g.cancelScheduledValues(actx.currentTime); g.setValueAtTime(g.value, actx.currentTime); g.linearRampToValueAtTime(0, actx.currentTime + (skip ? 0.35 : 0.1)); src.stop(actx.currentTime + 0.5); } catch {} }
    if (skip) { try { sfx.stopAll?.(0.25); } catch {} }
    heliSound(false);
    await sleep(skip ? 240 : 60);
    // everything the trailer moved, back (Dan out of his seat first, as the opening had him; then its set off and his
    // bones as they were when the trailer began)
    unseat();
    borrow.off();
    unsnap();
    W.carIdle = carIdle0; car.mesh.rotation.set(0, car.heading, 0); carState = { speed: 0, cold: 0, burn: 0, steer: 0 }; kick = false;
    try { rs.setThrust(0, 0); } catch {}
    if (glowL) glowL.distance = glowD0;
    if (roar) { try { roar.stop(skip ? 0.2 : 0.3); } catch {} roar = null; }
    for (const v of [vapor, smoke]) if (v.mesh) { app.scene.remove(v.mesh); v.mesh.geometry?.dispose(); v.mesh.material?.dispose(); }
    // (the chopper's clone out (its geometry and materials are the city's: kept), the player's back as it was; Jane and
    // her room put away, or as soon as a build still under way finishes)
    if (heli) { app.scene.remove(heli.root); heli = null; }
    if (H0?.mesh && h0Vis != null) H0.mesh.visible = h0Vis;
    try { KC.drop(); } catch (e) { console.warn('[trailer] cast', e); }
    W.audio?.duck?.('amb', 0, 0);
    borrow.quiet = false;
    delete W.trailerT;
    document.body.classList.remove('wg-trailer');
    pg.chart.style.opacity = '0'; pg.big.style.opacity = '0'; pg.card.style.opacity = '0'; pg.logo.style.opacity = '0'; pg.flash.style.opacity = '0'; pg.shade.style.opacity = '0'; pg.vig.style.opacity = '0'; for (const el of pg.spd) el.style.opacity = '0';
    // the opening takes its own frame back (intro.js: its start again, then it plays); the black lifts off it
    done?.();
    setTimeout(() => { pg.blk.style.transition = 'opacity .7s'; pg.blk.style.opacity = '0'; }, 80);
    setTimeout(() => pg.root.remove(), 1200);
  }
  if (T.mode === 'only') W.trailerEnd = () => finish(true);
  await new Promise((res) => { done = res; });
  return { skipped, sawLogo };
}
