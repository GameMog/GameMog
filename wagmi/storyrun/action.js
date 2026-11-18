// Mog City story runner: the action layer (r8, 14 Nov 2026), a story's cinematic punch, all of it data the Story Kit
// builder can ask for, and on by itself in a hometown world (GameMog's base.city 'hometown': actionOn). Mog City's own
// story, Pickup Time, SF 2040 and the repo's test worlds play exactly as before unless their world says cine.action.
// Nothing here changes a rule of a step: it draws, sounds and moves the camera, on Mog City's own parts (juice.js's
// alerts and slow motion, wagmi/crash's jolt, the camera's presets and the car's own lens, mission/audio.js's sounds).
//   createAction(W, juice, def) -> { on, slam({ kicker, title, sub }), sting(name), stepFx(d) -> undo, chase(ch, d) -> stop,
//                                    cliff({ kicker, text, sub }, secs), frame(shot, at) -> { A, B, LA, LB, fov } | null }
//   world.cine:   { action: true | false }   (left out: on in a hometown world, off everywhere else)
//                 { carCam: true }           (a step's own `cam` applies; left out, Mog City's car view throughout)
//   a step's own: sting  'siren' | 'screech' | 'roar' | 'boom' | 'hit' | 'whoosh' | 'crash'  (a sound as the step starts)
//                 shake  0..1      (the camera jolted as it starts)
//                 slowmo 0.2..2    (real seconds of slow motion as it starts: the moment it all goes wrong)
//                 cam    'low' | 'hood'  (the follow camera for the step: the low action angle, or the driver's view;
//                                 only in a world whose build asks for step cameras, cine.carCam: true. The owner,
//                                 15 Nov: "all games should have initial MOG CITY car view unless specified differently
//                                 in the build": without it every step drives in Mog City's own chase view)
//   a pursuit's:  name   (who is on him: the alert's title, 'Ruben's divers'; else 'Police' or 'On your tail')
//   a mission's:  card: 'slam' | false   (the title slammed in with a hit; in an action world every mission's is)
//   an act end's: cliff: { kicker, text, sub }   (after its card: a hard cut to black on the hook into the next act)
//   a cutscene shot's frame: 'ots' | 'close' | 'push' | 'react' | 'two' | 'low' | 'wide', on <who>, at <who>: the shot
//                 grammar (over the shoulder of `on` onto `at`, a close-up, a push-in, a reaction, a two-shot, a low
//                 hero angle, a wide), worked out from where the people stand, so the builder never writes a lens
export const STINGS = { siren: ['siren'], screech: ['squeal', { dur: 0.9, gain: 0.32 }], roar: ['roar'], boom: ['boom', { gain: 0.45 }], hit: ['hit', { gain: 0.35 }], whoosh: ['whoosh', { gain: 0.3 }], crash: ['boom', { gain: 0.5 }, 'squeal', { dur: 0.5, gain: 0.25 }] };
export const CAMS = { low: 'action', hood: 'pov' };
export const FRAMES = ['ots', 'close', 'push', 'react', 'two', 'low', 'wide'];
export const carCamOn = (def) => !!def && !!def.cine && typeof def.cine === 'object' && def.cine.carCam === true;
export const actionOn = (def) => !!def && (def.cine && typeof def.cine === 'object' && typeof def.cine.action === 'boolean' ? def.cine.action : def.city === 'hometown');

export function createAction(W, juice, def) {
  const on = actionOn(def), stepCams = on && carCamOn(def), sfx = W.sfx, app = W.app, car = W.car;
  const css = document.createElement('style');
  css.textContent = `
#sr-slam{position:fixed;inset:0;z-index:61;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0}
#sr-slam.on{opacity:1}
#sr-slam .k{font:700 18px/1 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.32em;color:#FFC93C;text-shadow:0 2px 10px rgba(0,0,0,.85);margin-bottom:10px}
#sr-slam .t{font:italic 900 86px/0.95 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.02em;color:#fff;text-transform:uppercase;text-align:center;max-width:92vw;text-shadow:0 6px 30px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.9)}
#sr-slam .s{margin-top:12px;font:600 20px/1.25 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.05em;color:#fff;max-width:70vw;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.85)}
#sr-slam.on .t{animation:srSlam .42s cubic-bezier(.2,1.5,.35,1) both}
#sr-slam.on .k,#sr-slam.on .s{animation:srRise .5s .18s ease-out both}
#sr-slam.out{opacity:0;transition:opacity .45s}
#sr-slam .bar{position:absolute;left:0;right:0;height:0;background:#000}
#sr-slam.cliff{background:#000}
#sr-slam.cliff .t{color:#EF4444}
#sr-flash{position:fixed;inset:0;z-index:62;pointer-events:none;background:#fff;opacity:0}
#sr-speed{position:fixed;inset:-20%;z-index:57;pointer-events:none;opacity:0;
  background:repeating-conic-gradient(from 0deg,rgba(255,255,255,0) 0deg 2.6deg,rgba(255,255,255,.55) 2.6deg 2.9deg,rgba(255,255,255,0) 2.9deg 6.1deg);
  -webkit-mask:radial-gradient(circle at 50% 52%,transparent 34%,#000 74%);mask:radial-gradient(circle at 50% 52%,transparent 34%,#000 74%)}
@keyframes srSlam{0%{transform:scale(2.2) skewX(-8deg);opacity:0;filter:blur(6px)}60%{opacity:1;filter:blur(0)}100%{transform:scale(1) skewX(0);opacity:1}}
@keyframes srRise{0%{transform:translateY(14px);opacity:0}100%{transform:none;opacity:1}}
@media (max-width:700px){#sr-slam .t{font-size:48px}#sr-slam .s{font-size:15px}#sr-slam .k{font-size:13px}}`;
  document.head.appendChild(css);
  const slamEl = document.createElement('div'); slamEl.id = 'sr-slam'; slamEl.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div>';
  const flash = document.createElement('div'); flash.id = 'sr-flash';
  const speed = document.createElement('div'); speed.id = 'sr-speed';
  document.body.append(speed, slamEl, flash);
  const [kEl, tEl, sEl] = slamEl.children;
  const jolt = (a) => { try { W.crash?.jolt?.(a, 0, 0); } catch {} };
  const play = (name) => { const s = STINGS[name]; if (!s || !sfx) return; for (let i = 0; i < s.length; i += 2) sfx.play(s[i], typeof s[i + 1] === 'object' ? s[i + 1] : undefined); };
  const pop = (k = 0.55) => { flash.style.transition = 'none'; flash.style.opacity = String(k); void flash.offsetWidth; flash.style.transition = 'opacity .35s'; flash.style.opacity = '0'; };
  let slamT = 0;
  function show({ kicker = '', title = '', sub = '' }, secs, cliff) {
    kEl.textContent = String(kicker || '').toUpperCase(); tEl.textContent = String(title || ''); sEl.textContent = String(sub || '');
    kEl.style.display = kicker ? '' : 'none'; sEl.style.display = sub ? '' : 'none';
    slamEl.classList.toggle('cliff', !!cliff);
    slamEl.classList.remove('on', 'out'); void slamEl.offsetWidth; slamEl.classList.add('on');
    clearTimeout(slamT); slamT = setTimeout(() => { slamEl.classList.add('out'); slamT = setTimeout(() => slamEl.classList.remove('on', 'out', 'cliff'), 500); }, secs * 1000);
  }
  // (the chase: its lens, its speed lines, its moments)
  let chaseOn = null;
  const speedLoop = () => {
    requestAnimationFrame(speedLoop);
    const cm = app?.controllerManager;
    if (!chaseOn || W.cutscene || W.paused || !cm || cm.activeMode !== 'car') { if (speed.style.opacity !== '0') speed.style.opacity = '0'; return; }
    const v = Math.abs(car?.speed || 0), k = Math.max(0, Math.min(1, (v - 16) / 22)) * (car?.boosting ? 1 : 0.75);
    speed.style.opacity = (k * 0.5).toFixed(3);
    speed.style.transform = `rotate(${(Math.random() * 6).toFixed(2)}deg) scale(${(1 + Math.random() * 0.03).toFixed(3)})`;
  };
  if (on) requestAnimationFrame(speedLoop);

  const api = {
    on, stepCams,
    // the mission's title slammed in: a white pop, a boom under a whoosh, the camera kicked
    slam(o, secs = 2.6) { show(o, secs, false); juice?.hold?.(secs * 1000 + 750); pop(0.35); sfx?.play?.('whoosh', { gain: 0.26, dur: 0.45 }); setTimeout(() => sfx?.play?.('boom', { gain: 0.42 }), 140); setTimeout(() => jolt(0.32), 150); },
    sting: play,
    // a step's own moment as it starts; returns what puts it back (its camera) when the step ends
    stepFx(d) {
      if (!d || typeof d !== 'object') return null;
      if (typeof d.sting === 'string') play(d.sting);
      if (typeof d.shake === 'number' && d.shake > 0) jolt(Math.min(1, d.shake));
      if (typeof d.slowmo === 'number' && d.slowmo > 0) juice.slow(Math.min(2, d.slowmo), 0.32);
      const preset = typeof d.cam === 'string' && CAMS[d.cam];
      const cs = app?.cameraSystem;
      if (!preset || !stepCams || !cs?.setCameraPreset) return null;
      const was = cs.activePresetId; cs.setCameraPreset(preset);
      return () => { try { if (cs.activePresetId === preset) cs.setCameraPreset(was || 'chase'); } catch {} };
    },
    // a chase on: the car's lens pushed (more widening and shake with speed), speed lines, a siren or a roar as it
    // starts, a near miss held in slow motion, a crash and a chaser taken out each a beat of their own
    chase(ch, d = {}) {
      if (!on) return () => {};
      const police = d.kind === 'police';
      play(police ? 'siren' : 'roar'); if (police) setTimeout(() => play('screech'), 500);
      const lens0 = car?.chase || null, lens = lens0 ? { ...lens0, kick: lens0.kick * 2.2 + 1, shake: (lens0.shake || 0.02) * 2.4, fov: lens0.fov + 3, vmax: lens0.vmax * 0.8 } : null;
      if (lens) car.chase = lens;
      chaseOn = { t: performance.now() };
      const missWas = juice.onMiss;
      juice.onMiss = () => { juice.slow(0.42, 0.33); pop(0.12); };
      let lastCrash = 0;
      const offHit = W.crash?.on?.('hit', (h) => {
        const t = performance.now();
        if (!h || (h.speed || 0) < 12 || t - lastCrash < 3500 || W.cutscene) return;
        lastCrash = t; juice.alert('Crash', { tone: 'red', secs: 1.0 }); play('crash'); if ((h.speed || 0) < 30) juice.slow(0.45, 0.35);
      });
      const onWreck = (e) => { juice.alert('Taken out', { sub: e && e.left ? `${e.left} still on you` : 'That was the last of them', tone: 'green', secs: 1.6 }); juice.slow(0.7, 0.28); play('boom'); jolt(0.5); pop(0.2); };
      const onRam = () => { play('hit'); jolt(0.35); };
      ch?.on?.('wrecked', onWreck); ch?.on?.('hit', onRam);
      return () => {
        if (car && car.chase === lens) car.chase = lens0;
        chaseOn = null; speed.style.opacity = '0'; juice.onMiss = missWas;
        try { offHit?.(); } catch {}
        try { ch?.off?.('wrecked', onWreck); ch?.off?.('hit', onRam); } catch {}
      };
    },
    // an act's last word: a hard cut to black, the hook into the next act in red, a boom under it
    async cliff(c, secs = 3.6) {
      if (!c || !c.text) return;
      show({ kicker: c.kicker || 'NEXT', title: c.text, sub: c.sub || '' }, secs, true);
      sfx?.play?.('boom', { gain: 0.5 }); setTimeout(() => sfx?.play?.('stinger', { gain: 0.3, notes: [110, 116.54, 98, 130.81] }), 250);
      await new Promise((r) => setTimeout(r, secs * 1000 + 500));
    },
    // a shot by its grammar (frameOf)
    frame: frameOf,
    clear() { chaseOn = null; speed.style.opacity = '0'; clearTimeout(slamT); slamEl.classList.remove('on', 'out', 'cliff'); },
  };
  return api;
}

// a lens kept clear of what stands between it and its people (Colter Land's RD-2, 17 Nov: Wade's 'Morning, Dad' was
// said behind a house's wall that filled four fifths of the frame). sight(a, b): the share of the line from what it
// looks at (a) out to the lens (b) that is open (1: all of it; reach.js sight). A lens { A, B, LA, LB } (from, to,
// looking from, to) whose line is open both at its start and at its end is kept as it is; else, in turn:
//   - pulled in toward its people along its own line, when that keeps three quarters of its distance or more (the same
//     shot, a little tighter);
//   - swung round them a little (20, 40 degrees), or to the other side of them (the line between two people crossed:
//     the same shot from across the street), the same distance and height;
//   - pulled in, when that keeps two fifths of its distance;
//   - swung farther (60 to 120 degrees: two people side on, one in front of the other, the last resort before);
//   - pulled in as far as it must (never closer than MIN_LENS m to the face it looks at).
// A lens whose look point is itself inside a wall or the ground is kept as written ('kept'). runner.js asks this only
// of a lens on a person (lensOnPerson): never of a title or a place's name (an establishing shot).
// -> { lens, how: 'clear' | 'kept' | 'pull' | 'swing' | 'tight' }
export const MIN_LENS = 0.9, AT_LOOK = 0.02;
const SWINGS = [20, -20, 40, -40, 180, 160, -160, 140, -140], WIDE_SWINGS = [60, -60, 120, -120, 90, -90];
export function clearLens(lens, sight) {
  if (!lens || typeof sight !== 'function') return { lens, how: 'clear' };
  const open = (P, L) => sight(L, P) >= 0.999;
  if (open(lens.A, lens.LA) && open(lens.B, lens.LB)) return { lens, how: 'clear' };
  // (the look point itself in a wall or the ground: not a face in the open, and no lens round it would see more; the
  // shot is kept as it was written. SF 2040's title shot, 17 Nov: pulled to 0.9 m from a spot in the camp's wall. The
  // point is tested on its own, a probe AT_LOOK m long from it toward the lens: the line shut a step out from it is a
  // person beside a wall (sight samples every 0.3 m), and that lens is still moved: RD-2's wide on Vance Mercer at Peets
  // Hill, 18 Nov, kept behind a brick parapet)
  const inWall = (P, L) => {
    const d = Math.hypot(P[0] - L[0], P[1] - L[1], P[2] - L[2]);
    if (!(d > AT_LOOK)) return false;
    const k = AT_LOOK / d;
    return sight(L, [L[0] + (P[0] - L[0]) * k, L[1] + (P[1] - L[1]) * k, L[2] + (P[2] - L[2]) * k]) < 0.999;
  };
  if (inWall(lens.A, lens.LA) || inWall(lens.B, lens.LB)) return { lens, how: 'kept' };
  const pull = (P, L, keep = 0) => {
    const d = Math.hypot(P[0] - L[0], P[1] - L[1], P[2] - L[2]) || 1, t = sight(L, P);
    if (t >= 0.999) return P;
    const to = Math.max(MIN_LENS, t * d - 0.35);
    if (to < d * keep) return null;
    const k = Math.min(1, to / d);
    return [L[0] + (P[0] - L[0]) * k, L[1] + (P[1] - L[1]) * k, L[2] + (P[2] - L[2]) * k];
  };
  // (a little tighter: both ends kept to three quarters of their distance or more)
  { const A = pull(lens.A, lens.LA, 0.75), B = A && pull(lens.B, lens.LB, 0.75); if (A && B) return { lens: { ...lens, A, B }, how: 'pull' }; }
  const swing = (P, L, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), x = P[0] - L[0], z = P[2] - L[2]; return [L[0] + x * c - z * s, P[1], L[2] + x * s + z * c]; };
  const swung = (list) => { for (const deg of list) { const A = swing(lens.A, lens.LA, deg), B = swing(lens.B, lens.LB, deg); if (open(A, lens.LA) && open(B, lens.LB)) return { lens: { ...lens, A, B }, how: 'swing' }; } return null; };
  const near = swung(SWINGS); if (near) return near;
  { const A = pull(lens.A, lens.LA, 0.4), B = A && pull(lens.B, lens.LB, 0.4); if (A && B) return { lens: { ...lens, A, B }, how: 'pull' }; }
  const far = swung(WIDE_SWINGS); if (far) return far;
  return { lens: { ...lens, A: pull(lens.A, lens.LA), B: pull(lens.B, lens.LB) }, how: 'tight' };
}

// a shot whose lens is on a person, the only kind clearLens moves: one by its grammar (a 'wide' too: it looks at its
// person), or a lens written out whose look is the hero ('player') or rel to the hero or one of the cast at about head
// height (fwd and right within 1.5 m, up within 0.6 m of their head), or no look at all (camPt: the hero's head). A
// title or a place's name (where) is never moved, nor a look at a spot in the street.
export function lensOnPerson(s, look) {
  if (!s || s.title || s.where) return false;
  if (!s.cam && s.frame) return true;
  if (look == null && s.cam) look = 'player';
  const near = (q) => q === 'player' || (q && typeof q === 'object' && !Array.isArray(q) && typeof q.rel === 'string' && !q.rel.startsWith('@')
    && Math.abs(q.fwd || 0) <= 1.5 && Math.abs(q.right || 0) <= 1.5 && Math.abs(q.up || 0) <= 0.6);
  return !!near(look) && (!s.lookTo || !!near(s.lookTo));
}

// a shot by its grammar: the lens worked out from where `on` and `at` stand (their heads, `head(ref)`: [x, y, z] and its
// heading h), or null: { A, B (the lens from, to), LA, LB (where it looks, from, to), fov }
export function frameOf(s, head) {
  if (!s || !FRAMES.includes(s.frame)) return null;
  const A = head(s.on || 'player'), B = s.at ? head(s.at) : null;
  if (!A) return null;
  // (the line between them, flat; one person alone faces the way they face: dir from `face`)
  let dx, dz;
  if (B) { dx = B[0] - A[0]; dz = B[2] - A[2]; } else { dx = Math.sin(A.h || 0); dz = Math.cos(A.h || 0); }
  const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
  const rx = -dz, rz = dx; // (to the right of looking from A to B)
  const at = (p, f, r, u) => [p[0] + dx * f + rx * r, p[1] + u, p[2] + dz * f + rz * r];
  // (the hero at the wheel: their head is inside the car, so the shot frames the car and the face through its glass, a
  // car's length out, never a lens inside the body; the line is the way the car faces unless another stands with them)
  if (A.car) {
    const look = [A[0], A[1] - 0.1, A[2]];
    switch (s.frame) {
            // (the head is the car's middle: a long lens from clear of its bonnet, eye high, framed tight by the focal length)
      case 'close': case 'react': return { A: at(A, 8, s.frame === 'react' ? -2.2 : 2.2, 0.35), B: at(A, 7.4, s.frame === 'react' ? -2 : 2, 0.3), LA: look, LB: look, fov: 24 };
      case 'push': return { A: at(A, 14, 3, 1.2), B: at(A, 8, 2, 0.4), LA: look, LB: look, fov: 26 };
      case 'low': return { A: at(A, 6, 1.8, -0.9), B: at(A, 5.4, 1.6, -0.9), LA: [A[0], A[1] + 0.2, A[2]], LB: [A[0], A[1] + 0.2, A[2]], fov: 50 };
      case 'ots': { const T = B || at(A, 12, 0, 0); return { A: at(A, -6, 1.4, 1.3), B: at(A, -5.2, 1.2, 1.2), LA: T, LB: T, fov: 40 }; }
      case 'two': if (!B) return { A: at(A, 4.5, 3.2, 0.6), B: at(A, 4.2, 3, 0.6), LA: look, LB: look, fov: 42 }; break;
    }
  }
  // (the shot looks at a face: toward the camera means back along the line from the one we look at)
  switch (s.frame) {
    case 'ots': { const T = B || at(A, 3, 0, 0); return { A: at(A, -0.85, 0.42, 0.12), B: at(A, -0.7, 0.36, 0.1), LA: T, LB: T, fov: 34 }; }
    case 'two': { const T = B || at(A, 1.6, 0, 0), mx = (A[0] + T[0]) / 2, my = (A[1] + T[1]) / 2 - 0.15, mz = (A[2] + T[2]) / 2, L = Math.max(2.6, Math.hypot(T[0] - A[0], T[2] - A[2]) * 1.5 + 1.4);
      return { A: [mx + rx * L, my + 0.15, mz + rz * L], B: [mx + rx * (L - 0.5), my + 0.12, mz + rz * (L - 0.5)], LA: [mx, my, mz], LB: [mx, my, mz], fov: 40 }; }
    // (the face we see is A's: the lens out in front of A, toward B or the way A faces)
    case 'close': return { A: at(A, 1.05, 0.2, 0.02), B: at(A, 0.98, 0.19, 0.02), LA: [A[0], A[1] - 0.04, A[2]], LB: [A[0], A[1] - 0.04, A[2]], fov: 30 };
    case 'push': return { A: at(A, 2.9, 0.35, 0.05), B: at(A, 1.05, 0.18, 0.02), LA: [A[0], A[1] - 0.06, A[2]], LB: [A[0], A[1] - 0.03, A[2]], fov: 30 };
    case 'react': return { A: at(A, 0.95, -0.24, 0.0), B: at(A, 0.85, -0.22, 0.0), LA: [A[0], A[1] - 0.03, A[2]], LB: [A[0], A[1] - 0.03, A[2]], fov: 26 };
    case 'low': return { A: at(A, 2.4, 0.6, -1.25), B: at(A, 2.1, 0.5, -1.2), LA: [A[0], A[1] + 0.1, A[2]], LB: [A[0], A[1] + 0.1, A[2]], fov: 44 };
    case 'wide': return { A: at(A, -16, 7, 7), B: at(A, -13, 5.5, 5.2), LA: A, LB: A, fov: 46 };
  }
  return null;
}
