// Mog City: photo mode, every world's. O in play (P is the pause menu's), or Pause > Photo mode (the way in on a phone):
// the city stops where it is (the pause menu's hold: the frame loop, the missions' clocks, the sound dipped), the HUD
// goes, and a free camera orbits the player (in the car, the car): drag or A D / W S to go round and over, the wheel,
// a pinch or Z X to come in and out, R F to raise and lower it. A look over it (1-4 or C: none, warm, noir, vivid), H
// hides the photo bar too (a tap brings it back), Enter or the Save button saves a PNG of the frame as it looks, with the
// world's tag in its corner: 'JENSEN HEIST · SAN JOSE, CA · gamemog.com' (the world's title and kicker, gamemog.com
// only). Esc (or O, or Done) plays on from where it stopped, the game's own camera back as it was.
// Never over a call, a cutscene, a choice, a card, the fail screen, the start gate or the full map; and if one starts
// while it is up (a call is not held by the hold), photo mode gives way to it.
//   ui.photo = createPhoto(ui)   { open(), close(), can(fromMenu), save(), setLook(k), aim({ yaw, pitch, dist, lift }), hide(on),
//                                 get on }   W.photo the same
//   FILTERS / cssFilter / filterMatrix / applyMatrix / tagText / fileName / blockedBy: the pure parts (tests/photo-mode)
/* ------------------------------------------------------------- the looks -- */
// each one CSS filter functions, in order: the live view draws them as the canvas's CSS filter, the saved PNG as the one
// colour matrix they make (Filter Effects 1's matrices, composed; clamped once at the end)
export const FILTERS = [
  ['none', 'None', []],
  ['warm', 'Warm', [['sepia', 0.22], ['saturate', 1.25], ['hue-rotate', -6], ['brightness', 1.04], ['contrast', 1.04]]],
  ['noir', 'Noir', [['grayscale', 1], ['contrast', 1.35], ['brightness', 0.96]]],
  ['vivid', 'Vivid', [['saturate', 1.55], ['contrast', 1.12], ['brightness', 1.02]]],
];
const ops = (name) => (FILTERS.find(([k]) => k === name) || FILTERS[0])[2];
export function cssFilter(name) {
  const o = ops(name);
  return o.length ? o.map(([f, v]) => `${f}(${f === 'hue-rotate' ? v + 'deg' : v})`).join(' ') : 'none';
}
// a 3x4 matrix (rows r g b: three factors, then an offset in 0..1)
const I = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
const lin = (m) => m.map((r) => [...r, 0]);
function opMatrix(f, v) {
  if (f === 'saturate') { const s = v; return lin([[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]]); }
  if (f === 'grayscale') { const a = 1 - Math.min(1, v); return lin([[0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a], [0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a], [0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a]]); }
  if (f === 'sepia') { const a = 1 - Math.min(1, v); return lin([[0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a], [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a], [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a]]); }
  if (f === 'hue-rotate') {
    const t = (v * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    return lin([[0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928], [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283], [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]]);
  }
  if (f === 'brightness') return [[v, 0, 0, 0], [0, v, 0, 0], [0, 0, v, 0]];
  if (f === 'contrast') { const o = 0.5 - 0.5 * v; return [[v, 0, 0, o], [0, v, 0, o], [0, 0, v, o]]; }
  return I();
}
// (b after a: b·a)
const mul = (b, a) => b.map((r) => [0, 1, 2, 3].map((j) => r[0] * a[0][j] + r[1] * a[1][j] + r[2] * a[2][j] + (j === 3 ? r[3] : 0)));
export function filterMatrix(name) { return ops(name).reduce((m, [f, v]) => mul(opMatrix(f, v), m), I()); }
// RGBA bytes in place (ImageData.data)
export function applyMatrix(d, m) {
  const [r, g, b] = m, o0 = r[3] * 255, o1 = g[3] * 255, o2 = b[3] * 255;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    d[i] = r[0] * R + r[1] * G + r[2] * B + o0; // (a Uint8ClampedArray clamps and rounds)
    d[i + 1] = g[0] * R + g[1] * G + g[2] * B + o1;
    d[i + 2] = b[0] * R + b[1] * G + b[2] * B + o2;
  }
  return d;
}

/* ---------------------------------------------------------- the corner tag -- */
// the world's title and kicker ('Jensen Heist', 'SAN JOSE, CA'), then gamemog.com, nothing else
export function tagText(def) {
  const t = String(def?.title || '').trim().toUpperCase(), k = String(def?.kicker || '').trim().toUpperCase();
  return [t, k, 'gamemog.com'].filter(Boolean).join(' · ');
}
export function fileName(def, d = new Date()) {
  const slug = String(def?.title || 'gamemog').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gamemog';
  const p = (n) => String(n).padStart(2, '0');
  return `${slug}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

/* ------------------------------------------------------------ when it may -- */
// what stops it, by name (null: it may). s: the game's state, read by can() below
export function blockedBy(s) {
  if (!s.ready) return 'loading';
  if (s.paused && !s.fromMenu) return 'paused';
  if (s.gate) return 'start gate';
  if (s.call) return 'call';
  if (s.cine) return 'cutscene';
  if (s.choice) return 'choice';
  if (s.card) return 'card';
  if (s.fail) return 'fail screen';
  if (s.map) return 'map';
  return null;
}
// (the cards, the choice panels and the end credits over the play: game.js CARDS_UP and the rest)
const UP = '#sr-slam.on, #wg .sr-card.on, #wg .sr-pass.on, #wg .wg-big.on, #wg .wg-title.on, #wg .sr-choice.on, #wg .sr-roll.on, .wg-phone.on';

const CSS = `
body.wg-photo > *:not(#canvas-container):not(#wg-photo), body.wg-photo #canvas-container > :not(canvas) { visibility: hidden !important; }
#wg-photo { position: fixed; inset: 0; z-index: 70; display: none; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; font-family: 'Barlow Condensed', system-ui, sans-serif; color: #fff; }
#wg-photo.on { display: block; }
#wg-photo.drag { cursor: grabbing; }
#wg-photo .hd { position: absolute; left: max(16px, env(safe-area-inset-left)); top: max(14px, env(safe-area-inset-top)); font: italic 800 30px/1 'Barlow Condensed'; letter-spacing: 1px; text-transform: uppercase; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
#wg-photo .hd b { color: #FFC93C; font-weight: 800; }
#wg-photo .ks { margin-top: 6px; font: 600 14px/1.5 'Barlow Condensed'; letter-spacing: 1px; font-style: normal; text-transform: none; color: rgba(255,255,255,.75); text-shadow: 0 1px 3px rgba(0,0,0,.8); }
#wg-photo kbd { display: inline-block; min-width: 20px; padding: 0 5px; margin: 0 1px; border: 1px solid rgba(255,255,255,.55); border-radius: 5px; background: rgba(255,255,255,.12); font: 700 13px/18px 'Barlow Condensed'; text-align: center; color: #fff; }
#wg-photo .bar { position: absolute; left: 50%; bottom: max(calc(var(--tp) * 2 + var(--tf)), env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; padding: 6px; width: max-content; max-width: calc(100vw - 32px);
  background: rgba(8,10,14,.62); border-radius: 12px; cursor: default; }
#wg-photo .bar button { min-height: 40px; min-width: 40px; padding: 0 10px; font: 700 16px/1 'Barlow Condensed'; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.85); background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12); border-radius: 9px; cursor: pointer; }
#wg-photo .bar button.sel { color: #FFC93C; border-color: #FFC93C; background: rgba(255,201,60,.12); }
#wg-photo .bar button.save { color: #0B0D12; background: #FFC93C; border-color: #FFC93C; }
#wg-photo .bar .sep { width: 1px; align-self: stretch; background: rgba(255,255,255,.14); margin: 0 2px; }
#wg-photo .tag { position: absolute; right: var(--tp); bottom: var(--tp); font: 600 var(--tf)/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: 1px; color: rgba(255,255,255,.86); text-shadow: 0 1px 4px rgba(0,0,0,.6); pointer-events: none; white-space: nowrap; }
#wg-photo .toast { position: absolute; left: 50%; top: max(16px, env(safe-area-inset-top)); transform: translateX(-50%); padding: 8px 14px; border-radius: 9px; background: rgba(8,10,14,.7); font: 600 16px/1.2 'Barlow Condensed'; opacity: 0; transition: opacity .3s; pointer-events: none; }
#wg-photo .toast.on { opacity: 1; }
#wg-photo.clean .hd, #wg-photo.clean .bar { display: none; }
body.touch-enabled #wg-photo .ks { display: none; }
@media (max-width: 700px) { #wg-photo .bar button { min-height: 44px; padding: 0 10px; font-size: 16px; } #wg-photo .hd { font-size: 24px; } }
`;

// the orbit's limits: metres from the pivot, the pitch (radians over the level), the pivot's lift
const LIM = { dMin: 2, dMax: 40, pMin: -0.12, pMax: 1.45, hMin: -0.6, hMax: 8 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPhoto(ui) {
  const W = window.WAGMI; if (!W || !W.app) return null;
  const app = W.app, cm = app.controllerManager, pause = ui.pause;
  if (!pause?.hold) return null;
  if (!document.getElementById('wg-photo-css')) { const st = document.createElement('style'); st.id = 'wg-photo-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'wg-photo';
  root.innerHTML = `<div class="hd">Photo <b>mode</b><div class="ks"><kbd>Drag</kbd> <kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><kbd>S</kbd> orbit · <kbd>Wheel</kbd> <kbd>Z</kbd><kbd>X</kbd> zoom · <kbd>R</kbd><kbd>F</kbd> height · <kbd>1</kbd>-<kbd>4</kbd> look · <kbd>H</kbd> hide · <kbd>Enter</kbd> save · <kbd>Esc</kbd> done</div></div>
    <div class="bar">${FILTERS.map(([k, label]) => `<button type="button" data-f="${k}">${label}</button>`).join('')}<span class="sep"></span>
    <button type="button" data-h="-1" title="Lower [F]">Lower</button><button type="button" data-h="1" title="Raise [R]">Raise</button><button type="button" data-z="1" title="Zoom out [X]">−</button><button type="button" data-z="-1" title="Zoom in [Z]">+</button><span class="sep"></span>
    <button type="button" data-hide="1" title="Hide [H]">Hide HUD</button><button type="button" class="save" data-save="1" title="Save PNG [Enter]">Save PNG</button><button type="button" data-done="1" title="Done [Esc]">Done</button></div>
    <div class="tag"></div><div class="toast"></div>`;
  document.body.appendChild(root);
  const tagEl = root.querySelector('.tag'), toastEl = root.querySelector('.toast'), bar = root.querySelector('.bar');
  const def = () => W.storyrun?.world?.def || W.photoDef || { title: String(document.title || '').split(/\s+[·|—-]\s+/)[0] || 'Mog City' };

  let on = false, look = 'none', canvas = null, saved = null, lastT = 0, toastT = 0;
  // the orbit (o: where it is; g: where it goes, eased)
  const o = { yaw: 0, pitch: 0.3, dist: 7, lift: 1 }, g = { ...o };
  const keys = new Set();

  function state(fromMenu) {
    const b = document.body.classList;
    return {
      ready: !!(app.ready && W.ready), paused: !!W.paused, fromMenu: !!fromMenu, gate: b.contains('wg-gating') || b.contains('wg-trailer') || (W.titleDue || 0) > performance.now(),
      call: b.contains('wg-vcall') || b.contains('wg-vfeed-on'), cine: !!(W.cutscene || W.directed || W.cineSkip) || b.contains('wg-cine'),
      choice: !!W.storyrun?.choosing || b.contains('wg-offering'), card: !!document.querySelector(UP) || b.contains('wg-cardup'),
      fail: b.contains('wg-failing') || b.contains('wg-ko'), map: !!app.mapSystem?.isFullMapOpen,
    };
  }
  const can = (fromMenu) => !on && !blockedBy(state(fromMenu));

  const subject = () => cm.getActiveEntity();
  const pivot = (e) => ({ x: e.position.x, y: e.position.y + o.lift, z: e.position.z });
  function ground(x, z, e) {
    try { const y = cm.getGroundHeight?.(x, z, 'person'); if (Number.isFinite(y)) return y; } catch { /* none */ }
    return e.position.y - (cm.activeMode === 'person' ? 1 : 0);
  }
  function place() {
    const e = subject(), cam = app.cameraSystem.camera; if (!e || !cam) return;
    const p = pivot(e), cp = Math.cos(o.pitch);
    let x = p.x + o.dist * Math.sin(o.yaw) * cp, y = p.y + o.dist * Math.sin(o.pitch), z = p.z + o.dist * Math.cos(o.yaw) * cp;
    y = Math.max(y, ground(x, z, e) + 0.25);
    cam.position.set(x, y, z); cam.up.set(0, 1, 0); cam.lookAt(p.x, p.y, p.z); cam.updateMatrixWorld();
  }
  // every held frame, before it is drawn: the keys held, the ease, the camera put
  function frame() {
    if (!on) return;
    const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000 || 0); lastT = t;
    // (a call or a cutscene started under it: it gives way)
    const s = state(true); if (s.call || s.cine) { close(); return; }
    const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
    g.yaw += (k('KeyA', 'ArrowLeft') - k('KeyD', 'ArrowRight')) * 1.6 * dt;
    g.pitch = clamp(g.pitch + (k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown')) * 0.9 * dt, LIM.pMin, LIM.pMax);
    g.dist = clamp(g.dist * Math.exp((k('KeyX', 'Minus') - k('KeyZ', 'Equal')) * 1.1 * dt), LIM.dMin, LIM.dMax);
    g.lift = clamp(g.lift + (k('KeyR', 'PageUp') - k('KeyF', 'PageDown')) * 2.2 * dt, LIM.hMin, LIM.hMax);
    const a = 1 - Math.exp(-dt * 12);
    for (const n of ['yaw', 'pitch', 'dist', 'lift']) o[n] += (g[n] - o[n]) * a;
    place();
  }

  function setLook(k) {
    look = FILTERS.some(([f]) => f === k) ? k : 'none';
    if (canvas) canvas.style.filter = look === 'none' ? '' : cssFilter(look);
    for (const b of bar.querySelectorAll('[data-f]')) b.classList.toggle('sel', b.dataset.f === look);
  }
  function drawTag() {
    const h = canvas?.clientHeight || innerHeight;
    root.style.setProperty('--tf', `${Math.max(11, Math.round(h * 0.022))}px`); root.style.setProperty('--tp', `${Math.max(8, Math.round(h * 0.022))}px`);
    tagEl.textContent = tagText(def());
  }
  function toast(s) { toastEl.textContent = s; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2200); }

  function open() {
    if (!can(W.paused && pause.isOpen)) return false;
    if (pause.isOpen) pause.close();
    const e = subject(), cam = app.cameraSystem?.camera; if (!e || !cam) return false;
    canvas = app.renderer?.domElement || null;
    saved = { pos: cam.position.clone(), q: cam.quaternion.clone(), up: cam.up.clone(), fov: cam.fov, filter: canvas?.style.filter || '' };
    // (from the game's own view: the orbit starts where its camera is)
    o.lift = cm.activeMode === 'person' ? 0.6 : 0.9;
    const p = pivot(e), dx = cam.position.x - p.x, dy = cam.position.y - p.y, dz = cam.position.z - p.z, d = Math.hypot(dx, dy, dz) || 7;
    o.dist = clamp(d, LIM.dMin, LIM.dMax); o.pitch = clamp(Math.asin(clamp(dy / d, -1, 1)), LIM.pMin, LIM.pMax); o.yaw = Math.atan2(dx, dz);
    Object.assign(g, o);
    on = true; keys.clear(); lastT = performance.now();
    pause.hold(true, frame);
    root.classList.remove('clean'); root.classList.add('on'); document.body.classList.add('wg-photo');
    setLook(look); drawTag();
    return true;
  }
  function close() {
    if (!on) return;
    on = false; keys.clear(); drag.clear();
    root.classList.remove('on', 'drag'); document.body.classList.remove('wg-photo');
    if (canvas) canvas.style.filter = saved?.filter || '';
    const cam = app.cameraSystem?.camera;
    if (cam && saved) { cam.position.copy(saved.pos); cam.quaternion.copy(saved.q); cam.up.copy(saved.up); cam.fov = saved.fov; cam.updateProjectionMatrix?.(); cam.updateMatrixWorld(); }
    pause.hold(false);
  }

  // the PNG: this frame drawn now, read in the same task (the canvas is the frame just drawn), the look's matrix over
  // it, the tag in its corner
  async function save() {
    if (!on || !canvas) return null;
    let c;
    try {
      frame(); app.renderPipeline?.render();
      c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
      const x = c.getContext('2d');
      x.drawImage(canvas, 0, 0);
      if (look !== 'none') { const im = x.getImageData(0, 0, c.width, c.height); applyMatrix(im.data, filterMatrix(look)); x.putImageData(im, 0, 0); }
      const fs = Math.max(11, Math.round(c.height * 0.022)), pad = fs;
      x.font = `600 ${fs}px 'Barlow Condensed', system-ui, sans-serif`;
      if ('letterSpacing' in x) x.letterSpacing = '1px';
      x.textAlign = 'right'; x.textBaseline = 'bottom';
      x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = Math.max(2, fs * 0.2); x.shadowOffsetY = 1;
      x.fillStyle = 'rgba(255,255,255,0.86)';
      x.fillText(tagText(def()), c.width - pad, c.height - pad);
    } catch (e) { console.warn('[photo] save', e); toast('Could not save the photo'); return null; }
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) { toast('Could not save the photo'); return null; }
    const name = fileName(def());
    W.photoLast = { name, blob, w: c.width, h: c.height, look };
    try {
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { console.warn('[photo] download', e); }
    toast(`Saved ${name}`);
    return W.photoLast;
  }

  /* ---------------------------------------------------------- the inputs -- */
  const FKEYS = { Digit1: 'none', Digit2: 'warm', Digit3: 'noir', Digit4: 'vivid' };
  addEventListener('keydown', (e) => {
    if (!on) {
      if (e.code !== 'KeyO' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
      if (open()) { e.stopImmediatePropagation(); e.preventDefault(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const c = e.code;
    if (c === 'Escape' || c === 'KeyO' || c === 'Backspace') { if (!e.repeat) close(); return; }
    if (e.repeat) return;
    if (FKEYS[c]) setLook(FKEYS[c]);
    else if (c === 'KeyC') setLook(FILTERS[(FILTERS.findIndex(([k]) => k === look) + 1) % FILTERS.length][0]);
    else if (c === 'KeyH') root.classList.toggle('clean');
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') save();
    else keys.add(c);
  }, true);
  addEventListener('keyup', (e) => { if (!on) return; keys.delete(e.code); e.stopImmediatePropagation(); }, true);
  addEventListener('blur', () => keys.clear());

  // one finger or the mouse: orbit; two: pinch to zoom; a tap with the bar hidden brings it back
  const drag = new Map();
  let pinch = 0, moved = 0;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.bar')) return;
    drag.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
    try { root.setPointerCapture(e.pointerId); } catch { /* none */ }
    root.classList.add('drag');
    if (drag.size === 2) { const [a, b] = [...drag.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  root.addEventListener('pointermove', (e) => {
    const p = drag.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (drag.size >= 2) {
      const [a, b] = [...drag.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) g.dist = clamp(g.dist * (pinch / d), LIM.dMin, LIM.dMax);
      pinch = d; return;
    }
    g.yaw -= dx * 0.006; g.pitch = clamp(g.pitch + dy * 0.005, LIM.pMin, LIM.pMax);
  });
  const up = (e) => {
    if (!drag.has(e.pointerId)) return;
    drag.delete(e.pointerId); if (drag.size < 2) pinch = 0;
    if (!drag.size) { root.classList.remove('drag'); if (moved < 6 && root.classList.contains('clean')) root.classList.remove('clean'); }
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  root.addEventListener('wheel', (e) => { e.preventDefault(); g.dist = clamp(g.dist * Math.exp(e.deltaY * 0.0012), LIM.dMin, LIM.dMax); }, { passive: false });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f) setLook(b.dataset.f);
    else if (b.dataset.h) g.lift = clamp(g.lift + 0.75 * +b.dataset.h, LIM.hMin, LIM.hMax);
    else if (b.dataset.z) g.dist = clamp(g.dist * (+b.dataset.z > 0 ? 1.3 : 1 / 1.3), LIM.dMin, LIM.dMax);
    else if (b.dataset.hide) root.classList.add('clean');
    else if (b.dataset.save) save();
    else if (b.dataset.done) close();
  });
  addEventListener('resize', () => { if (on) drawTag(); });

  const api = { open, close, save, can, get on() { return on; }, get look() { return look; }, setLook, get orbit() { return { ...g }; },
    // (set the orbit outright: yaw, pitch, dist, lift; a test's or a trailer's)
    aim(v = {}) { if (Number.isFinite(v.yaw)) g.yaw = v.yaw; if (Number.isFinite(v.pitch)) g.pitch = clamp(v.pitch, LIM.pMin, LIM.pMax); if (Number.isFinite(v.dist)) g.dist = clamp(v.dist, LIM.dMin, LIM.dMax); if (Number.isFinite(v.lift)) g.lift = clamp(v.lift, LIM.hMin, LIM.hMax); return { ...g }; },
    hide(v = true) { root.classList.toggle('clean', !!v); }, state: () => blockedBy(state(false)) };
  W.photo = api;
  return api;
}
