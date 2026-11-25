// Mog City story runner: a video call (a pack's `vcall` step). Every conversation in a story world can be one: each
// person sits in an office of their own (offices.js, built by the set kit as Mr. Big's study is), seen head and
// shoulders through their own webcam (sets.js holds the offices, vcall-draw.js draws each into its tile), laid out as a
// call is: the tiles, each person's name on theirs, the one talking lit, the subtitles under them, the call's bar on
// top and its controls at the foot. The lines are said in turn as a cutscene's are (radio/turns.js: the hand-over, the
// overlaps and the cut-ins: people talk over each other on a call), each on its speaker's face (face.js: their
// mouth with their voice; a baked face's lips and grin), the voices of the others through a call's sound (voices.js
// 'video'). Between the lines, the call's own events (vcall-plan.js CALL_EVENTS): a mute and an unmute (a line said on
// mute is not heard: their mouth moves, the subtitle reads "(muted)"), someone joining late or dropping, a frozen
// picture, a screen shared (a slide on the stage), the background blurred, a raised hand, a silence.
// It plays like a cutscene: the city held, the HUD away, hold Space to skip.
//   const V = createVcall(W, deps);  await V.play(step, token)
import * as THREE from 'three/webgpu';
import { planCall, layout, camOf, faceOf, eyesAim, OFFICE_LOOKS } from './vcall-plan.js';
import { closeLock } from './headlock.js';
import { SEAT } from './offices.js';
import { feedKey } from './prewarm.js';
import { playTurns } from '../radio/turns.js';
import { createDirector } from '../mission/cine.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ACCENT = '#B6FF3B', RED = '#EF4444';
const MIC_OFF = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 10V5a3 3 0 0 0-5.7-1.3"/><path d="M19 11a7 7 0 0 1-1.1 3.8M5 11a7 7 0 0 0 11 5.7M12 18v3"/><path d="M3 3l18 18"/></svg>';
const MIC = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const CSS = `
body.wg-vcall #wg .wg-bar { display: none; }
body.wg-vcall #wg .wg-line { bottom: 92px; }
body.wg-vcall #wg .wg-sub.vc-muted .t { opacity: .55; font-style: italic; }
body.wg-vcall #wg .wg-sub.vc-muted .t::before { content: '(muted) '; color: ${RED}; font-style: normal; font-weight: 700; }
#wg .wg-vc.laptop { border: 14px solid #16171a; border-top-width: 22px; border-radius: 18px; box-shadow: inset 0 0 0 1px #2a2c31; }
#wg .wg-vc.laptop::before { content: ''; position: absolute; top: -14px; left: 50%; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: #2c3e2f; box-shadow: 0 0 0 2px #0c0d0f; }
#wg .wg-vc { position: absolute; inset: 0; z-index: 1; pointer-events: none; font-family: 'Barlow Condensed', system-ui, sans-serif; opacity: 0; transition: opacity .35s; }
#wg .wg-vc.on { opacity: 1; }
#wg .wg-vc .cover { position: absolute; inset: 0; z-index: 3; background: #0E1014; transition: opacity .5s; display: flex; align-items: center; justify-content: center; font: 600 20px/1 'Barlow Condensed'; letter-spacing: 3px; color: rgba(255,255,255,.6); }
#wg .wg-vc .cover.off { opacity: 0; }
#wg .wg-vc .top { position: absolute; left: 16px; right: 16px; top: 10px; height: 36px; display: flex; align-items: center; gap: 12px; }
#wg .wg-vc .top .ttl { padding: 6px 12px 7px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 700 18px/1 'Barlow Condensed'; letter-spacing: 1.5px; }
#wg .wg-vc .top .ttl i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${ACCENT}; margin-right: 8px; vertical-align: 2px; box-shadow: 0 0 8px ${ACCENT}; }
#wg .wg-vc .top .clk { font: 600 16px/1 'Barlow Condensed'; letter-spacing: 1px; color: rgba(255,255,255,.7); }
#wg .wg-vc .top .ppl { margin-left: auto; padding: 6px 10px 7px; background: rgba(8,10,14,0.62); border-radius: 10px; font: 600 15px/1 'Barlow Condensed'; color: rgba(255,255,255,.8); }
#wg .wg-vc .tile { position: absolute; border-radius: 10px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); transition: box-shadow .18s; }
#wg .wg-vc .tile.live { box-shadow: inset 0 0 0 3px ${ACCENT}, 0 0 18px rgba(182,255,59,.25); }
#wg .wg-vc .tile .nm { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); padding: 4px 9px 5px; background: rgba(8,10,14,0.66); border-radius: 7px; font: 700 15px/1.05 'Barlow Condensed'; letter-spacing: .4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
#wg .wg-vc .tile .nm small { font-weight: 500; color: rgba(255,255,255,.62); letter-spacing: .3px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#wg .wg-vc .tile .nm > span:not(.mic) { flex: none; }
#wg .wg-vc .tile .nm .mic { color: rgba(255,255,255,.75); display: inline-flex; }
#wg .wg-vc .tile.muted .nm .mic { color: ${RED}; }
#wg .wg-vc .tile .st { position: absolute; inset: 0 0 34px 0; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; font: 600 18px/1 'Barlow Condensed'; letter-spacing: 1.5px; color: rgba(255,255,255,.8); text-shadow: 0 1px 4px rgba(0,0,0,.8); }
#wg .wg-vc .tile.waiting .st, #wg .wg-vc .tile.gone .st, #wg .wg-vc .tile.frozen .st { display: flex; }
#wg .wg-vc .tile .st .ring { width: 34px; height: 34px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; animation: vcspin 0.9s linear infinite; }
#wg .wg-vc .tile.sm .st { gap: 6px; font-size: 14px; letter-spacing: 1px; }
#wg .wg-vc .tile.sm .st .ring { width: 20px; height: 20px; border-width: 2px; }
#wg .wg-vc .tile.frozen .st b { font-weight: 600; font-size: 15px; padding: 3px 8px; border-radius: 6px; background: rgba(8,10,14,0.6); }
#wg .wg-vc .tile .hand { position: absolute; right: 8px; top: 8px; padding: 4px 8px; border-radius: 7px; background: #FFC93C; color: #111; font: 700 14px/1 'Barlow Condensed'; display: none; }
#wg .wg-vc .tile.hand .hand { display: block; }
#wg .wg-vc .tile .pres { position: absolute; right: 8px; top: 8px; padding: 4px 8px; border-radius: 7px; background: rgba(8,10,14,0.66); color: ${ACCENT}; font: 700 13px/1 'Barlow Condensed'; letter-spacing: 1px; display: none; }
#wg .wg-vc .tile.presenting .pres { display: block; }
#wg .wg-vc .share { position: absolute; display: none; border-radius: 10px; background: #F4F2EC; color: #15181D; box-shadow: inset 0 0 0 3px ${ACCENT}; overflow: hidden; }
#wg .wg-vc .share.on { display: block; }
#wg .wg-vc .share .bar { position: absolute; left: 0; right: 0; top: 0; padding: 7px 14px; background: #15181D; color: ${ACCENT}; font: 700 14px/1 'Barlow Condensed'; letter-spacing: 1.5px; }
#wg .wg-vc .share .sl { position: absolute; left: 7%; right: 7%; top: 16%; bottom: 8%; display: flex; flex-direction: column; gap: 2.2vh; }
#wg .wg-vc .share h3 { margin: 0; font: 800 clamp(22px, 3.6vw, 52px)/1.02 'Barlow Condensed'; letter-spacing: .5px; }
#wg .wg-vc .share .big { font: 800 clamp(34px, 7vw, 110px)/1 'Barlow Condensed'; color: #1F6FD0; }
#wg .wg-vc .share ul { margin: 0; padding-left: 1.1em; font: 600 clamp(16px, 2vw, 30px)/1.25 'Barlow Condensed'; }
#wg .wg-vc .tools { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 10px; padding: 8px 12px; background: rgba(8,10,14,0.62); border-radius: 12px; }
#wg .wg-vc .tools span { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px 7px; border-radius: 8px; background: rgba(255,255,255,.08); font: 600 14px/1 'Barlow Condensed'; letter-spacing: .5px; color: rgba(255,255,255,.85); }
#wg .wg-vc .tools span.off { color: ${RED}; }
#wg .wg-vc .tools span.leave { background: ${RED}; color: #fff; }
#wg .wg-vc .toast { position: absolute; left: 50%; top: 56px; transform: translate(-50%, -6px); padding: 7px 14px 8px; background: rgba(8,10,14,0.8); border-radius: 10px; font: 600 16px/1 'Barlow Condensed'; letter-spacing: .5px; opacity: 0; transition: opacity .3s, transform .3s; white-space: nowrap; }
#wg .wg-vc .toast.on { opacity: 1; transform: translate(-50%, 0); }
#wg .wg-vfeed { position: absolute; border-radius: 10px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); opacity: 0; transition: opacity .3s, box-shadow .18s; pointer-events: none; z-index: 2; }
#wg .wg-vfeed.on { opacity: 1; }
#wg .wg-vfeed.live { box-shadow: inset 0 0 0 3px ${ACCENT}; }
#wg .wg-vfeed .nm { position: absolute; left: 7px; bottom: 7px; padding: 3px 8px 4px; background: rgba(8,10,14,0.66); border-radius: 7px; font: 700 14px/1 'Barlow Condensed'; letter-spacing: .4px; display: flex; align-items: center; gap: 6px; }
#wg .wg-vfeed .nm small { font-weight: 500; color: rgba(255,255,255,.62); letter-spacing: .5px; }
body.wg-vfeed-on #wg .wg-caller { opacity: 0 !important; pointer-events: none; }
#wg .wg-vfeed .nm i { width: 7px; height: 7px; border-radius: 50%; background: ${ACCENT}; box-shadow: 0 0 6px ${ACCENT}; }
@keyframes vcspin { to { transform: rotate(360deg); } }
body.touch-enabled.wg-vcall #wg .wg-line { bottom: 78px; }
body.touch-enabled #wg .wg-vc .tools { display: none; }
`;
let styled = false;
// (the car screen's feeds running: a call waiting's caller shows over the held one's, which comes back after it)
let feeds = 0, feedOwner = null;
// (the feeds on screen now: while one is, its name tag says who and the call's status, and the caller card goes)
const feedsOn = new Set();
const feedShown = (id, on) => { if (on) feedsOn.add(id); else feedsOn.delete(id); document.body.classList.toggle('wg-vfeed-on', feedsOn.size > 0); };

// a body's face, chin to crown (m), for its webcam's framing (vcall-plan.js camOf): from its height as built (the
// bind-pose bounds of its skinned meshes, the tallest of their sizes, times their scale in the world: a cast scale or a
// tall export; the skin alone was not always the tallest piece, a head-and-hands skin read a 1.3 m man), once per body;
// Mog City's own and anything without a skin as an average grown-up's
function faceH(fig) {
  if (fig.faceH) return fig.faceH;
  let h = 0;
  try {
    fig.root.updateMatrixWorld(true);
    const sc = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
    fig.root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox; o.matrixWorld.decompose(_p, _q, sc);
      h = Math.max(h, (b.max.x - b.min.x) * Math.abs(sc.x), (b.max.y - b.min.y) * Math.abs(sc.y), (b.max.z - b.min.z) * Math.abs(sc.z));
    });
  } catch {}
  return (fig.faceH = faceOf(h));
}
// a webcam held on someone's head as it is drawn (headlock.js closeLock, the set closes' lock from polish 3b): framed on
// their eyes once (camOf), then each frame the lens and its look moved by how far the head has gone from there, eased,
// a bob in a laugh left in the frame, a sit or a lean followed: a body whose head settles after its first frames (the
// sitting hips put on the seat, the head come up to the lens) is never framed from where it was a moment before
//   const L = webcam(eyes, kind, face)   L.at(eyes, dt) -> { pos, look, fov }
function webcam(eyes, kind, face) {
  const base = camOf(eyes, kind, { face }), lock = closeLock({ rel: 'cam' }, { rel: 'cam' }, base.pos, eyes);
  return { base, at(e, dt) { const m = lock ? lock.step(e, dt) : [0, 0, 0]; return { pos: base.pos.map((v, i) => v + m[i]), look: base.look.map((v, i) => v + m[i]), fov: base.fov }; } };
}
// (their eyes as their face found them, or their head bone's where those are not plausible: vcall-plan.js eyesAim)
const _hv = new THREE.Vector3();
const eyesOf = (fig, v) => { const h = fig.head(_hv), e = fig.face?.eyes ? fig.face.eyes(v) : null; return eyesAim(e ? [e.x, e.y, e.z] : null, [h.x, h.y, h.z]); };

export function createVcall(W, { setsOf, castName, heroName, ui, colorOf, tokens = (x) => x, mumble = () => {}, delay, wait, tokOf, kill, log = () => {}, sfx = W.sfx, fold: FOLD = null }) {
  const now = () => performance.now() / 1000;
  function dom(laptop = false) {
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    const root = document.createElement('div'); root.className = laptop ? 'wg-vc laptop' : 'wg-vc';
    root.innerHTML = `<div class="cover">CONNECTING…</div><div class="top"><span class="ttl"><i></i><span class="tt"></span></span><span class="clk">00:00</span><span class="ppl"></span></div>
      <div class="tiles"></div><div class="share"><div class="bar"></div><div class="sl"></div></div>
      <div class="tools"><span class="mic">${MIC} Mute</span><span>Video</span><span>Share</span><span>Participants</span><span class="leave">Leave</span></div><div class="toast"></div>`;
    (document.getElementById('wg') || document.body).appendChild(root);
    return root;
  }

  async function play(d, t) {
    // (a world's foldable phone (calls.style 'fold') holds its vcalls, except one on the hero's laptop (device
    // 'laptop': Mandi's audition): that one is the full-screen call as before, in a laptop's frame)
    const fold = d.device === 'laptop' ? null : FOLD;
    const plan = planCall(d, { name: (w) => castName(w) || w, hero: heroName });
    for (const w of plan.warn || []) console.warn('[storyrun] vcall:', w);
    if (plan.error) { console.warn('[storyrun] vcall:', plan.error); return; }
    const local = tokOf(t);
    const S = setsOf();
    // (each person in an office of their own, sat at its desk, their eyes to the lens)
    const defs = {}, ids = plan.people.map((p, i) => `vc${i}`);
    plan.people.forEach((p, i) => { defs[ids[i]] = { room: 'office-' + p.office, light: p.light || plan.time || null, people: [{ who: p.isHero ? 'player' : p.who, at: [0, 0], face: 0, pose: 'sit', seat: SEAT.y, look: 'lens' }] }; });
    const root = dom(d.device === 'laptop'), tilesEl = root.querySelector('.tiles'), shareEl = root.querySelector('.share'), toastEl = root.querySelector('.toast');
    root.querySelector('.tt').textContent = plan.title;
    // (a world's calls on its foldable phone (fold.js): the call open on it, big, in the middle; its tiles inside its screen)
    if (fold) fold.scene(plan.title, `${plan.people.length} on call`);
    requestAnimationFrame(() => root.classList.add('on'));
    W.cutscene = true; ui.cine(true); ui.objective?.(null); document.body.classList.add('wg-vcall');
    const D = createDirector(W); let skip = false;
    D.block(true, { onSkip: () => { skip = true; kill(local); } }); D.take();
    // (the others heard through the call; the hero in his own room)
    // (each one's call sound before the call, put back after it: undefined is the manifest's own)
    const fx0 = new Map();
    for (const p of plan.people) if (!p.isHero) { fx0.set(p.who, W.voice?.fxOf?.(p.who)); W.voice?.fx?.(p.who, 'video'); }
    const people = plan.people.map((p, i) => ({ ...p, id: ids[i], i, el: null, state: { in: !p.late, gone: false, muted: p.muted, frozen: false, blur: p.blur, hand: false, leaving: 0 }, cam: null, camK: p.cam }));
    let gazed = [], active = null, last = null, sharing = null, raf = 0, t0 = now(), toastT = 0, lastF = now(), follow = null;
    const toast = (text) => { toastEl.textContent = text; toastEl.classList.add('on'); toastT = now() + 2.2; };
    for (const p of people) {
      const el = document.createElement('div'); el.className = 'tile'; el.style.display = 'none';
      el.innerHTML = `<div class="st"><div class="ring"></div><b></b></div><div class="hand">✋</div><div class="pres">PRESENTING</div><div class="nm"><span class="mic"></span><span>${esc(p.label)}</span>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</div>`;
      tilesEl.appendChild(el); p.el = el;
    }
    const paint = (p) => {
      const s = p.state, el = p.el;
      el.classList.toggle('muted', s.muted); el.querySelector('.mic').innerHTML = s.muted ? MIC_OFF : MIC;
      el.classList.toggle('waiting', !s.in && !s.gone && !s.leaving); el.classList.toggle('gone', !!s.leaving); el.classList.toggle('frozen', s.frozen && s.in);
      el.classList.toggle('hand', s.hand); el.classList.toggle('presenting', sharing === p);
      el.querySelector('.st b').textContent = s.leaving ? 'Reconnecting…' : !s.in ? 'Waiting to join…' : s.frozen ? 'Poor connection' : '';
      el.querySelector('.ring').style.display = s.frozen || s.leaving || !s.in ? '' : 'none';
      if (p.isHero) { const m = root.querySelector('.tools .mic'); m.classList.toggle('off', s.muted); m.innerHTML = (s.muted ? MIC_OFF + ' Unmute' : MIC + ' Mute'); }
    };
    people.forEach(paint);
    const shown = () => people.filter((p) => !p.state.gone);
    // the frame's work: the layout for this screen, each tile's rect, its webcam and its state, to the draw and the DOM
    const frame = () => {
      raf = requestAnimationFrame(frame);
      { const tt = now(), dt = Math.min(0.05, Math.max(0, tt - lastF)); D.skipStep(dt, ui); lastF = tt; if (follow) follow(dt); }
      const list = shown(), w = innerWidth, h = innerHeight, touch = document.body.classList.contains('touch-enabled');
      const speaking = active || last;
      const mode = sharing ? 'speaker' : plan.layout;
      const stage = sharing ? 'share' : mode === 'speaker' ? Math.max(0, list.findIndex((p) => p.who === speaking)) : null;
      // (the tiles end above the subtitle: two lines of it, or the tallest seen this call, over its own gap at the foot)
      { const e = document.querySelector('#wg .wg-sub:not(.hide)'); const sh = e ? e.getBoundingClientRect().height : 0; if (sh > subH) subH = sh; }
      // (on the phone: laid out in its screen, where it is this frame (it sways in the hand); none until it has opened)
      const fs = fold ? fold.screen() : null;
      if (fold && !fs) { for (const p of people) p.el.style.display = 'none'; if (S.gridOn) S.grid(null); return; }
      const L = fs ? layout(list.length, fs[2], fs[3], { mode, stage, top: 5, bottom: 5, side: 5, gap: 6 }) : layout(list.length, w, h, { mode, stage, top: 54, bottom: Math.max(touch ? 132 : 172, (touch ? 78 : 92) + subH + 10), side: touch ? 10 : 16 });
      if (fs) { const o = (r) => r && [Math.round(r[0] + fs[0]), Math.round(r[1] + fs[1]), r[2], r[3]]; L.tiles = L.tiles.map(o); L.stage = o(L.stage); toastEl.style.top = Math.round(fs[1] + 10) + 'px'; }
      const tiles = [];
      list.forEach((p, k) => {
        const r = L.tiles[k];
        Object.assign(p.el.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px', display: '' });
        p.el.classList.toggle('sm', r[3] < 170);
        p.el.classList.toggle('live', p.who === active && p.state.in && !p.state.muted);
        if (p.cam) tiles.push({ id: p.id, rect: r, cam: p.cam, frozen: p.state.frozen, blur: p.state.blur, dim: !p.state.in || !!p.state.leaving, live: p.who === active, slot: k, ...(fs ? { radius: 8 } : {}) });
      });
      for (const p of people) if (p.state.gone) p.el.style.display = 'none';
      if (sharing && L.stage) Object.assign(shareEl.style, { left: L.stage[0] + 'px', top: L.stage[1] + 'px', width: L.stage[2] + 'px', height: L.stage[3] + 'px' });
      root.querySelector('.ppl').textContent = `${list.filter((p) => p.state.in).length} in call`;
      if (fold) fold.subtitle(`${list.filter((p) => p.state.in).length} on call`);
      const el = Math.max(0, now() - t0); root.querySelector('.clk').textContent = `${String(Math.floor(el / 60)).padStart(2, '0')}:${String(Math.floor(el % 60)).padStart(2, '0')}`;
      if (toastT && now() > toastT) { toastEl.classList.remove('on'); toastT = 0; }
      if (S.gridOn || tiles.length) S.grid(tiles.length ? tiles : null, { bg: '#0E1014' });
    };
    // (the subtitle's own look for a line said on mute)
    const subEl = () => document.querySelector('#wg .wg-sub');
    // (two lines of the subtitle at the call's size: its line height, its box's padding)
    let subH = 0;
    try { const e = subEl(); if (e) { const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 24) * 1.25; subH = 2 * lh + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0); } } catch {}
    try {
      root.querySelector('.ppl').textContent = `${people.length} in call`;
      try { await S.prepare(defs, { tile: true }); } catch (err) { console.warn('[storyrun] vcall: offices', err); }
      // (each webcam framed on its person as they sit: their head after the first frames of their pose)
      const V = new THREE.Vector3();
      // (each one's webcam on their eyes, framed for their own face; then held on their head each frame: follow())
      const aim = () => { for (const p of people) { const st = S.set(p.id), P = st && [...st.people.values()][0]; if (!P?.fig) continue; st.scene.updateMatrixWorld(true); p.fig = P.fig; p.wc = webcam(eyesOf(P.fig, V), p.camK, faceH(P.fig)); p.cam = p.wc.base; } };
      follow = (dt) => { for (const p of people) if (p.wc && p.fig && !p.state.frozen) p.cam = p.wc.at(eyesOf(p.fig, V), dt); };
      // (their faces up to the lens: an idle that hangs the head is turned over the clip to look into the webcam, as a
      // cutscene turns a head to whoever is talked to, cast.js gazeStep)
      const figs = [];
      for (const p of people) { const st = S.set(p.id), P = st && [...st.people.values()][0]; if (!P?.fig) continue; figs.push(P.fig); P.fig.gaze = () => (p.cam ? { x: p.cam.pos[0], y: p.cam.pos[1], z: p.cam.pos[2] } : null); }
      gazed = figs;
      aim();
      raf = requestAnimationFrame(frame);
      // (the webcams framed again once the heads have come up)
      await delay(0.45, local).catch(() => {}); aim();
      await delay(0.45, local).catch(() => {}); aim();
      root.querySelector('.cover').classList.add('off'); t0 = now();
      sfx?.play?.('ding', { gain: 0.16 });
      await delay(0.4, local);
      log(['vcall', plan.title, people.map((p) => p.who)]);
      const byWho = new Map(people.map((p) => [p.who, p]));
      // the call, in order: runs of lines said in turn, the events between them
      const items = plan.items;
      for (let i = 0; i < items.length && !skip; ) {
        if (items[i].ev) {
          const e = items[i].ev, p = e.who ? byWho.get(e.who) : null; i++;
          if (e.do === 'wait') { await delay(e.secs, local); continue; }
          if (!p) continue;
          const s = p.state;
          if (e.do === 'mute' || e.do === 'unmute') { s.muted = e.do === 'mute'; sfx?.play?.('thunk', { gain: 0.1, f: 520, ring: false }); }
          else if (e.do === 'join') { s.in = true; s.gone = false; s.leaving = 0; toast(`${p.label} joined`); sfx?.play?.('ding', { gain: 0.18 }); }
          else if (e.do === 'drop') {
            s.leaving = 1; paint(p); toast(`${p.label} left`); sfx?.play?.('hangup', { gain: 0.16 });
            if (sharing === p) { sharing = null; shareEl.classList.remove('on'); }
            await delay(1.1, local); s.in = false; s.gone = true; s.leaving = 0;
          }
          else if (e.do === 'freeze') { s.frozen = true; sfx?.play?.('glitch', { gain: 0.08 }); }
          else if (e.do === 'unfreeze') s.frozen = false;
          else if (e.do === 'blur') s.blur = true; else if (e.do === 'unblur') s.blur = false;
          else if (e.do === 'hand') s.hand = true;
          else if (e.do === 'share') {
            sharing = p; const sl = e.slide || {};
            shareEl.querySelector('.bar').textContent = `${p.label.toUpperCase()}'S SCREEN`;
            shareEl.querySelector('.sl').innerHTML = `${sl.title ? `<h3>${esc(tokens(sl.title))}</h3>` : ''}${sl.big ? `<div class="big">${esc(tokens(sl.big))}</div>` : ''}${sl.lines?.length ? `<ul>${sl.lines.map((l) => `<li>${esc(tokens(l))}</li>`).join('')}</ul>` : ''}`;
            shareEl.classList.add('on'); toast(`${p.label} is sharing their screen`); sfx?.play?.('whoosh', { gain: 0.1, dur: 0.3 });
          } else if (e.do === 'unshare') { if (sharing === p) { sharing = null; shareEl.classList.remove('on'); toast(`${p.label} stopped sharing`); } }
          for (const q of people) paint(q);
          await delay(e.do === 'join' || e.do === 'share' ? 0.7 : 0.35, local);
          continue;
        }
        const run = []; while (i < items.length && items[i].line) run.push(items[i++].line);
        await playTurns(W, run.map((L) => ({ ...L, text: tokens(L.text) })), {
          dead: () => skip || local.dead, sleep: (ms) => delay(ms / 1000, local).catch(() => {}),
          show: (L, k, secs) => {
            const p = byWho.get(L.who); active = L.who; last = L.who;
            if (p && p.state.hand) { p.state.hand = false; paint(p); }
            ui.sub(L.who, L.text, colorOf(L.who), false);
            subEl()?.classList.toggle('vc-muted', !!L.muted);
            if (!L.muted) mumble(L.who, L.text, secs);
            log(['say', L.who, L.text]);
            return () => { if (active === L.who) active = null; };
          },
          hide: () => { ui.sub(null); subEl()?.classList.remove('vc-muted'); active = null; },
        });
      }
      if (!skip) {
        // (the end: you leave, or the call drops)
        toast(plan.end === 'drop' ? 'Connection lost' : 'You left the meeting');
        sfx?.play?.('hangup', { gain: 0.2 });
        await delay(0.9, local).catch(() => {});
      }
    } catch (e) { if (!skip) throw e; }
    finally {
      cancelAnimationFrame(raf);
      for (const f of gazed) f.gaze = null;
      ui.sub(null); ui.skip?.(null); subEl()?.classList.remove('vc-muted');
      try { await ui.fade?.(1, 0.3); } catch {}
      S.grid(null);
      for (const [w, k] of fx0) W.voice?.fx?.(w, k);
      root.remove(); fold?.scene(null);
      document.body.classList.remove('wg-vcall');
      try { await S.release(); } catch (err) { console.warn('[storyrun] vcall: release', err); }
      D.block(false); await D.release(0);
      W.cutscene = false; ui.cine(false);
      setTimeout(() => ui.fade?.(0, 0.5), 120);
    }
  }
  // a call on the car's screen while he drives (a call step's `video`: { office, blur, light }): the caller's office
  // through their webcam in a small picture at the top right, over the street, their name on it, their face moving
  // with their lines; up while live() is true and no cutscene is on, then let go. A call waiting's caller (id 'vfeed2')
  // takes the screen while the live call holds (its shown() false meanwhile), and gives it back when it hangs up
  // (the office a feed is drawn from: its set, by the feed's id)
  const feedDef = (video, who) => { const o = video && typeof video === 'object' ? video : {}; const office = OFFICE_LOOKS.includes(o.office) ? o.office : 'exec'; return { room: 'office-' + office, light: o.light || null, people: [{ who, at: [0, 0], face: 0, pose: 'sit', seat: SEAT.y, look: 'lens' }] }; };
  // a feed's office built and compiled ahead (a call waiting's, while it rings): the switch to it is then a cut, with no
  // frames held for its pipelines while the caller card fades (W1's two seconds of card and feed both up, 18 Nov)
  // (the mission's calls' offices pooled under its opening card (runner.js prewarm(), sets.js pool()), by their key; a
  // feed takes its own from there, else builds it there and then, without holding the loop (hold: false): the street
  // goes on and the picture comes up once it is ready, not a 180-400 ms frozen frame at 9 m/s, the RC review)
  const poolKey = (video, who) => feedKey(feedDef(video, who));
  async function prefetch(video, who, id = 'vfeed2') { try { const S = setsOf(); S.adopt?.(poolKey(video, who), id); await S.prepare({ [id]: feedDef(video, who) }, { tile: true, hold: false }); } catch (err) { console.warn('[storyrun] vcall prefetch', err); } }
  async function feed(video, who, live, t, id = 'vfeed', shown = () => true, { cardOff = false } = {}) {
    const S = setsOf(), o = video && typeof video === 'object' ? video : {};
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    const el = document.createElement('div'); el.className = 'wg-vfeed';
    // (on a world's foldable phone the phone is the picture: this one kept out of sight, and out of the street's way)
    if (FOLD) el.className = 'wg-vfeed-fold';
    el.innerHTML = `<div class="nm"><i></i><span>${esc(who)}</span><small></small></div>`;
    const stEl = el.querySelector('small'), norm = (x) => String(x || '').trim().toLowerCase();
    (document.getElementById('wg') || document.body).appendChild(el);
    let raf = 0, fig = null, was = false;
    feeds++;
    // (cardOff: the feed is the call's one card from the start: the caller card goes now, not once the picture is up)
    if (cardOff) feedShown(id, true);
    try {
      try { S.adopt?.(poolKey(video, who), id); await S.prepare({ [id]: feedDef(video, who) }, { tile: true, hold: false }); } catch (err) { console.warn('[storyrun] vcall feed', err); }
      const st = S.set(id), P = st && [...st.people.values()][0]; if (!P?.fig) return;
      fig = P.fig; let cam = null, wc = null;
      const V = new THREE.Vector3();
      const aim = () => { st.scene.updateMatrixWorld(true); wc = webcam(eyesOf(fig, V), 'close', faceH(fig)); cam = wc.base; };
      aim(); fig.gaze = () => (cam ? { x: cam.pos[0], y: cam.pos[1], z: cam.pos[2] } : null); st.inGrid = true;
      let t0 = now(), aimed = 0, lastF = now();
      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (aimed < 2 && now() - t0 > 0.45 * (aimed + 1)) { aimed++; aim(); }
        { const tt = now(), dt = Math.min(0.05, Math.max(0, tt - lastF)); lastF = tt; if (wc) cam = wc.at(eyesOf(fig, V), dt); }
        const touch = document.body.classList.contains('touch-enabled'), w = Math.round(Math.min(touch ? 200 : 320, innerWidth * 0.3)), h = Math.round((w * 9) / 16);
        // (on a world's foldable phone (fold.js): drawn into its inner screen's picture, once it has opened)
        const fr = FOLD ? FOLD.rect() : null;
        const r = FOLD ? fr : [innerWidth - w - (touch ? 10 : 18), touch ? 70 : 86, w, h], on = !W.cutscene && live() && shown() && !!S.set(id) && !!r;
        if (!FOLD) Object.assign(el.style, { left: r[0] + 'px', top: r[1] + 'px', width: w + 'px', height: h + 'px' });
        el.classList.toggle('on', on);
        el.classList.toggle('live', on && document.querySelector('#wg .wg-sub:not(.hide)')?.dataset.who === who);
        if (on) { S.feed(FOLD ? { id, rect: r, cam, blur: !!o.blur, radius: FOLD.radius() } : { id, rect: r, cam, blur: !!o.blur }); feedOwner = id; } else if (was && feedOwner === id) { S.feed(null); feedOwner = null; }
        if (FOLD && on !== was) FOLD.live(on);
        if (on !== was && !(cardOff && !on)) feedShown(id, on);
        // (the call's status from the caller card, when the card is this caller's: Incoming call, On call, Call waiting)
        // (another caller's card while this one is up: a call waiting, said on this one's name tag, the card being hidden)
        if (on) { const c = document.querySelector('#wg .wg-caller'), cn = c && c.classList.contains('on') ? c.querySelector('.n')?.textContent || '' : '', cs = c?.querySelector('.s')?.textContent || '';
          const st = !cn ? '' : norm(cn) === norm(who) ? cs : /waiting/i.test(cs) ? `${cs} · ${cn}` : ''; if (stEl.textContent !== st) stEl.textContent = st; }
        was = on;
      };
      raf = requestAnimationFrame(frame);
      await wait(() => !live(), t).catch(() => {});
    } finally {
      feeds--; feedShown(id, false); if (FOLD && was) FOLD.live(false);
      cancelAnimationFrame(raf); if (feedOwner === id || !feeds) { S.feed(null); feedOwner = null; } el.remove();
      if (fig) fig.gaze = null;
      // (its office let go, unless a scene has the sets now or another feed still runs: the held call's)
      if (!feeds && !W.cutscene && !S.active && !S.gridOn) { try { await S.release(); } catch {} }
    }
  }
  return { play, feed, prefetch, feedDef, poolKey };
}
