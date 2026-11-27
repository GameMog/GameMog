// Mog City story runner: where to go, always (a story world only, under ?pack=). The owner, 14 Nov: "I couldn't figure
// out where to go": a search's ring lay under a hometown's ground (drawn at y 0 on a town 4 m up), beside a tower, and
// nothing on the screen said where it was. The rule now, for every objective with somewhere to go:
//   - a beacon over the spot: a column of light rising 70 m off it (seen over the roofs), and on the screen a marker
//     above it with its name and how far, drawn over everything (never hidden in a building); off the screen it waits
//     at the edge, an arrow pointing round to it;
//   - on foot within 40 m of a hold-F spot (a search's), the marker says so: 'HOLD F · TAKE THE SALVAGE LOG', a green
//     arrow bobbing over the ring, until he is at it (the hold prompt's own ring takes over there);
//   - stuck: on the same objective on foot for 90 s of play and still more than 30 m off, one line of help ('Follow the
//     marker') and the beacon pulses until he is closer.
// It reads the runner's objective as the GPS holds it (gps.dest: the route's own target, a reachable spot) and the hold
// the runner is waiting on (M.holding), each frame; it decides nothing about the story and changes no rule.
//   createGuide(W, THREE, { gps, ui, groundY, createMarker }) -> { source, state(), stop() }
//   guide.source = () => ({ x, z, name, hold: { reach, label } | null, key }) | null   (the runner sets it)
const YELLOW = '#FFC93C', GREEN = '#4ADE80';
// the HUD's cards an edge marker keeps off (mission/ui.js, storyrun/hud.js, pursuit/hud.js, index.html's own)
const HUD_CARDS = '.wg-track:not(.off), #wg .sr-timer, #wg .sr-meters, #wg .wg-caller, #wg .wg-offer, #wg .wg-help, #wg .wg-turn, #wg-heat, .hud-bottom-left, .hud-bottom-right, .hud-top-right';
export const NEAR = 40, STUCK_SECS = 90, STUCK_FAR = 30;
// the subtitles' own room (mission/ui.js .wg-line, the objective line and the subtitle under it): kept for them whether
// a line is up or not, two lines tall over the line's foot, so an edge marker never sits on what someone says (FL-7's
// 'LOLA'S TRUCK · 71 m' on Lola's line, the truck behind him: the RC playtest, P10). r: the line's box; null: none
export const SUB_LINES = 2, SUB_LINE_H = 34;
export function subZone(r) {
  if (!r || !(r.width > 0)) return null;
  const bottom = r.bottom + 6, top = Math.min(r.top, r.bottom - SUB_LINES * SUB_LINE_H) - 6;
  return { left: r.left - 6, right: r.right + 6, top, bottom };
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// where the marker goes on the screen for a point at NDC (x, y) (behind: the camera looks away from it, its projection
// mirrored): in view, over it; else clamped to the screen's edge, its arrow's angle (0 up, clockwise) pointing round
// toward it; behind, at the bottom edge on the side it is on, pointing down. Plain maths, for the tests
export function edgeOf(x, y, behind) {
  if (!behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.86) return { x, y, inView: true, ang: 0 };
  if (behind) { x = -x; y = -Math.abs(y) - 1; }
  const ang = Math.atan2(x, y);
  const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8, 1);
  return { x: x / m, y: y / m, inView: false, ang };
}

// the stuck watch (see the top): play seconds on one objective on foot, far off. step(dt, key, d, onFoot) -> { secs,
// stuck, fresh } (fresh: true the frame it first counts as stuck)
// an edge marker's top (px) moved up or down the edge clear of the HUD's boxes (and the subtitles' room, subZone): the
// marker Lx..Lx+lw wide and hgt tall; up over a box where there is room above it, else under it
export function clearTop(Lx, lw, top, hgt, boxes) {
  for (let k = 0; k < 6; k++) {
    const r = boxes.find((b) => Lx < b.right + 6 && Lx + lw > b.left - 6 && top < b.bottom + 6 && top + hgt > b.top - 6);
    if (!r) break;
    top = r.top - hgt - 8 >= 8 ? r.top - hgt - 8 : r.bottom + 8;
  }
  return top;
}

// the marker (Lx..Lx+lw wide, top..top+hgt) moved off the player's car on the screen (car: its box, px, or null): never
// a target drawn over him. An edge marker is slid along the bottom edge to the side of the car it points to (a spot
// behind him: SS-5's 'AWAY · 826 M' sat on the Tensore's boot, day audit 22 Nov); one in view is lifted over the car's
// roof. -> { dx (px to slide it), top }
export function clearCar(Lx, lw, top, hgt, car, { edge = false, side = 0, W = Infinity } = {}) {
  if (!car || !(car.right > car.left)) return { dx: 0, top };
  const pad = 8, hit = Lx < car.right + pad && Lx + lw > car.left - pad && top < car.bottom + pad && top + hgt > car.top - pad;
  if (!hit) return { dx: 0, top };
  if (!edge) return { dx: 0, top: Math.max(8, car.top - hgt - pad) };
  const mid = (car.left + car.right) / 2, goRight = side > 0 || (side === 0 && Lx + lw / 2 >= mid);
  let dx = goRight ? car.right + pad - Lx : car.left - pad - (Lx + lw);
  // (no room that side: the other)
  if (Lx + dx < 10 || Lx + dx + lw > W - 10) dx = goRight ? car.left - pad - (Lx + lw) : car.right + pad - Lx;
  return { dx, top };
}

export function createStuck({ secs = STUCK_SECS, far = STUCK_FAR } = {}) {
  let key = null, t = 0, said = false;
  return {
    step(dt, k, d, onFoot) {
      if (k !== key) { key = k; t = 0; said = false; }
      if (onFoot) t += dt;
      const stuck = onFoot && t > secs && d > far;
      const fresh = stuck && !said; if (fresh) said = true;
      return { secs: t, stuck, fresh };
    },
    reset() { key = null; t = 0; said = false; },
  };
}

// the thing an objective's words name (a step's objective, label and noun; the words of its place's own name don't
// count: a car wash is no car): [kind, its pattern] or null. A vehicle (pickup for a truck, van, minivan, suv, taxi,
// sedan for a car) before a thing (bag, case, crate for a box, a locker, a safe...). d.prop false: none; a kind: that one
export const PROP_RIDES = [['pickup', /\b(pick-?up|truck|lorry)s?\b/i], ['minivan', /\bminivans?\b/i], ['van', /\bvans?\b/i], ['suv', /\b(suv|jeep)s?\b/i], ['taxi', /\b(taxi|cab)s?\b/i], ['sedan', /\b(car|sedan|coupe|hatchback|wagon)s?\b/i]];
export const PROP_THINGS = [['bag', /\b(bag|backpack|duffel|duffle|satchel|sack|holdall|purse)s?\b/i], ['case', /\b(case|briefcase|suitcase|lockbox|cash ?box|kit)s?\b/i], ['crate', /\b(crate|box|chest|locker|cooler|toolbox|footlocker|package|parcel|safe|cabinet|bin)s?\b/i]];
const unbold = (t) => String(t ?? '').replace(/\*\*|\{(yellow|red|blue|green)\}/g, '');
export function propOf(d, p = {}) {
  if (!d || d.prop === false) return null;
  if (typeof d.prop === 'string') return [...PROP_RIDES, ...PROP_THINGS].find(([k]) => k === d.prop) || null;
  const own = String(p.name || '').toLowerCase();
  let words = unbold(`${d.objective || ''} ${d.label || ''} ${d.noun || ''}`).toLowerCase();
  if (own) words = words.split(own).join(' ');
  return PROP_RIDES.find(([, re]) => re.test(words)) || PROP_THINGS.find(([, re]) => re.test(words)) || null;
}
// the objective with a named thing that isn't there said as the place: 'Take Ruben's salvage log from his truck.' ->
// 'Take Ruben's salvage log at **the boat-trailer lot**.' (its phrase 'from / in / out of / on ... his truck'); with
// no such phrase, ' at **the place**' after it
export function reword(text, d, p = {}) {
  const want = propOf(d, p), name = p.name || 'there', t = String(text ?? '');
  const m = want && unbold(t).match(want[1]);
  if (m) {
    const noun = m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s*\\b(?:from|in|inside|into|out of|under|behind|on|at|by|beside|near)\\s+(?:\\*\\*)?(?:the|a|an|his|her|their|its|our|my|your|[\\w'’-]+'s)\\s+(?:[\\w-]+\\s+){0,2}?(?:\\*\\*)?${noun}(?:\\*\\*(?:\\{\\w+\\})?)?`, 'i');
    if (re.test(t)) return t.replace(re, ` at **${name}**`);
  }
  return `${t.replace(/[.!]\s*$/, '')} at **${name}**.`;
}

export function createGuide(W, THREE, { gps, ui, groundY, createMarker }) {
  const app = W.app, cm = app.controllerManager;
  const css = document.createElement('style');
  css.textContent = `
#sr-guide{position:fixed;left:0;top:0;z-index:57;pointer-events:none;opacity:0;transition:opacity .3s;will-change:transform;width:180px;text-align:center;--c:${YELLOW}}
#sr-guide.on{opacity:1}
#sr-guide .pin{position:relative;width:26px;height:26px;margin:0 auto;}
#sr-guide .pin i{position:absolute;inset:3px;background:var(--c);transform:rotate(45deg);border-radius:4px 4px 4px 0;box-shadow:0 0 0 2px rgba(8,10,14,.85),0 3px 10px rgba(0,0,0,.6)}
#sr-guide .pin b{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(8,10,14,.85)}
#sr-guide .ar{display:none;width:0;height:0;margin:0 auto 2px;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:24px solid var(--c);filter:drop-shadow(0 2px 5px rgba(0,0,0,.75))}
#sr-guide.edge .ar{display:block}
#sr-guide.edge .pin{display:none}
#sr-guide .l{margin-top:5px;display:inline-block;padding:3px 8px 2px;border-radius:6px;background:rgba(8,10,14,.62);font:700 14px/1.15 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.07em;color:#fff;text-transform:uppercase;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.8)}
#sr-guide .l em{font-style:normal;color:var(--c)}
#sr-guide .l kbd{display:inline-block;min-width:17px;padding:1px 4px 0;margin:0 2px;border-radius:4px;background:#fff;color:#0b0d12;font:800 12px/1.2 'Barlow Condensed',system-ui,sans-serif}
#sr-guide.hold .pin{animation:srgBob .9s ease-in-out infinite}
#sr-guide.hold .pin i{border-radius:4px 0 4px 4px;transform:rotate(45deg) scale(.9)}
#sr-guide.at .l{display:none}
#sr-guide.pulse .pin,#sr-guide.pulse .ar{animation:srgPulse 1.1s ease-in-out infinite}
#sr-guide.pulse .l{box-shadow:0 0 0 2px var(--c)}
@keyframes srgBob{0%,100%{transform:translateY(0)}50%{transform:translateY(7px)}}
@keyframes srgPulse{0%,100%{transform:scale(1);filter:none}50%{transform:scale(1.45);filter:drop-shadow(0 0 10px var(--c))}}
@media (max-width:700px){#sr-guide .l{font-size:12px}}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'sr-guide';
  el.innerHTML = '<div class="ar"></div><div class="pin"><i></i><b></b></div><div class="l"></div>';
  const arEl = el.querySelector('.ar'), lEl = el.querySelector('.l');
  document.body.appendChild(el);
  // the column of light over the spot: thin, tall, fading upward (marker.js's corona, stretched): over the roofs
  const beam = createMarker(THREE, app.scene, { color: YELLOW, radius: 0.45, height: 70, alpha: 0.42 });
  beam.group.name = 'wagmi-marker-guide';
  const v = new THREE.Vector3(), vc = new THREE.Vector3();
  const stuck = createStuck();
  let live = true, last = performance.now(), st = { on: false }, html = '', colour = YELLOW, lw = 0, hud = [], hudAt = 0;
  // (sr-rolling: the end credits are up, storyrun/index.js rollCredits: a cutscene ending under them clears wg-cine)
  const hidden = () => W.cutscene || W.paused || document.body.classList.contains('wg-cine') || document.body.classList.contains('sr-rolling') || app.mapSystem?.isFullMapOpen;
  const api = {
    source: null,
    state: () => ({ ...st }),
    // (his car's box on the screen as the marker last kept off it, px: clearCar)
    get carBox() { return carBox; },
    stop() { live = false; el.remove(); css.remove(); beam.hide(); app.scene.remove(beam.group); },
  };
  const off = () => { el.classList.remove('on'); beam.hide(); st = { on: false, stuck: false }; };
  function frame() {
    if (!live) return;
    requestAnimationFrame(frame);
    const t = performance.now(), dt = Math.min(0.1, (t - last) / 1000); last = t;
    let s = null; try { s = api.source && api.source(); } catch { s = null; }
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) { off(); stuck.reset(); return; }
    const cam = app.cameraSystem?.camera, e = cm.getActiveEntity?.();
    if (!cam || !e) return;
    const onFoot = cm.activeMode !== 'car', d = Math.hypot(s.x - e.position.x, s.z - e.position.z);
    const paused = W.paused || W.cutscene;
    const sk = stuck.step(paused ? 0 : dt, s.key ?? `${Math.round(s.x / 4)},${Math.round(s.z / 4)}`, d, onFoot);
    if (sk.fresh) {
      ui?.help?.(['Lost? Follow the ', { marker: s.hold ? 'green' : 'yellow' }, ': it hangs over the spot, seen through the buildings. The ', { 'line on the radar': 'yellow' }, ' walks you there.'], 9, { mode: 'foot' });
    }
    const hold = !!s.hold && onFoot && d <= NEAR;
    const at = hold && d <= (s.hold.reach || 3.2) + 6;
    const c = hold ? GREEN : (s.color || YELLOW);
    if (c !== colour) { colour = c; el.style.setProperty('--c', c); beam.color(c); }
    const gy = groundY ? groundY(s.x, s.z) : 0;
    st = { on: !hidden(), x: s.x, z: s.z, d: Math.round(d), hold, at, stuck: sk.stuck, secs: Math.round(sk.secs), name: s.name || '' };
    if (hidden()) { el.classList.remove('on'); beam.hide(); return; }
    // (the column: off once he is close, where the ring on the ground, the marker and the hold prompt say the rest)
    if (d > (onFoot ? 18 : 30)) beam.at(s.x, gy, s.z); else beam.hide();
    v.set(s.x, gy + (at ? 1.6 : d < 60 ? 3.2 : 6), s.z);
    // (behind the camera: its own frame says so, z > 0 looking down -z; the projection of a point behind it is mirrored)
    vc.copy(v).applyMatrix4(cam.matrixWorldInverse);
    v.project(cam);
    const q = edgeOf(v.x, v.y, vc.z > 0);
    const W0 = innerWidth, H0 = innerHeight, sx = (q.x + 1) / 2 * W0, sy = (1 - q.y) / 2 * H0;
    el.classList.toggle('edge', !q.inView);
    el.classList.toggle('hold', hold);
    el.classList.toggle('at', at && q.inView);
    el.classList.toggle('pulse', sk.stuck);
    if (!q.inView) arEl.style.transform = `rotate(${q.ang}rad)`;
    const name = esc(String(s.hold && hold ? s.hold.label || s.name : s.name || '').toUpperCase());
    const h = hold ? `Hold <kbd>F</kbd> · <em>${name}</em> · ${Math.round(d)} m` : `${name ? `<em>${name}</em> · ` : ''}${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`;
    if (h !== html) { html = h; lEl.innerHTML = h; lw = 0; }
    if (!lw) lw = lEl.offsetWidth || 0;
    // (the marker's middle over the spot: in view, its pin's point on it; at the edge, its arrow)
    let top = sy - (q.inView ? 26 : 14);
    // (its name whole on the screen: slid along its line to stay inside the edges, 10 px in. Colter Land, 17 Nov: 'THE
    // COPPER SPUR DINER · 184 M' cut off at the left edge over the objective; 'SIXTY MILE SAVINGS · 1.6' at the right)
    const natural = sx - 90 + Math.max(0, (180 - lw) / 2), Lx = Math.max(10, Math.min(W0 - 10 - lw, sx - lw / 2));
    lEl.style.transform = Math.abs(Lx - natural) > 0.5 ? `translateX(${Math.round(Lx - natural)}px)` : '';
    // (at the screen's edge, never over the HUD's own cards, the objective, the timer, a call, the radar: moved up or down
    // the edge clear of them; in view its pin stays on the spot)
    if (!q.inView) {
      if (t - hudAt > 300) { hudAt = t; hud = hudRects(); }
      top = clearTop(Lx, lw, top, 24 + 2 + 5 + 22, hud);
    }
    // (never over his own car: slid off it along the edge, or lifted over its roof, clearCar)
    let dx = 0;
    if (!onFoot) {
      if (t - carAt > 200) { carAt = t; carBox = carRect(cam); }
      // (the side it goes to held until the spot is clearly the other side: a spot dead behind does not swap it frame by frame)
      if (Math.abs(q.x) > 0.15) carSide = Math.sign(q.x);
      const cc = clearCar(Lx, lw, top, 24 + 2 + 5 + 22, carBox, { edge: !q.inView, side: carSide, W: W0 });
      dx = cc.dx; top = cc.top;
    }
    el.style.transform = `translate(${Math.round(sx - 90 + dx)}px, ${Math.round(top)}px)`;
    el.classList.add('on');
  }
  // (the player's car on the screen: a car-sized box round him (CAR_BOX: half width, half length, height, m), turned
  // with his heading, its corners projected, px; null on foot or with a corner behind the lens. Not the mesh's own
  // bounds: a world's car is a model under the entity, its lights and shadow cards with it)
  const CAR_BOX = [0.95, 2.2, 1.3], cv = new THREE.Vector3(), cz = new THREE.Vector3();
  let carAt = 0, carBox = null, carSide = 1;
  function carRect(cam) {
    const e = cm.getActiveEntity?.(); if (!e || cm.activeMode !== 'car') return null;
    const h = e.heading || 0, fx = Math.sin(h), fz = Math.cos(h), [hw, hl, ht] = CAR_BOX, y0 = e.position.y || 0;
    let l = Infinity, r = -Infinity, tp = Infinity, b = -Infinity;
    for (let i = 0; i < 8; i++) {
      const sx = i & 1 ? hw : -hw, sz = i & 2 ? hl : -hl;
      cv.set(e.position.x + fz * sx + fx * sz, y0 + (i & 4 ? ht : 0), e.position.z - fx * sx + fz * sz);
      if (cz.copy(cv).applyMatrix4(cam.matrixWorldInverse).z > -0.2) return null;
      cv.project(cam);
      const x = (cv.x + 1) / 2 * innerWidth, y = (1 - cv.y) / 2 * innerHeight;
      l = Math.min(l, x); r = Math.max(r, x); tp = Math.min(tp, y); b = Math.max(b, y);
    }
    return { left: l, right: r, top: tp, bottom: b };
  }
  // (the HUD's cards on the screen now, their boxes)
  function hudRects() {
    const out = [];
    { const ln = document.querySelector('#wg .wg-line'), z = ln && ln.getClientRects().length ? subZone(ln.getBoundingClientRect()) : null; if (z) out.push(z); }
    for (const e of document.querySelectorAll(HUD_CARDS)) {
      if (!e.isConnected || !e.getClientRects().length) continue;
      const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
      if (+getComputedStyle(e).opacity < 0.05) continue;
      out.push(r);
    }
    return out;
  }
  requestAnimationFrame(frame);
  return api;
}
