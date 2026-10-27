// Mog City: the cutscene machinery. A cutscene is a clock (t, seconds) and functions of it: the camera's shot, every
// actor's place and pose, the cues (lines, captions, sounds) that fire once as t passes them. Seeking is cheap, so a
// capture can step through it frame by frame.
//   const D = createDirector(W);  D.take();  D.camera = { pos, look, fov, roll };  D.release(blendSecs, { face })
//   D.block(true, { onSkip })     every key and the mouse kept from the game (hold Space or Enter 0.6 s to skip)
//   keys(...) / angleKeys(...)    keyframed values;   rig(mixer, clips)   a seekable pose from clip segments
import * as THREE from 'three/webgpu';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const ease = {
  linear: (x) => clamp(x),
  inOut: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  out: (x) => 1 - Math.pow(1 - clamp(x), 3),
  in: (x) => Math.pow(clamp(x), 3),
  smooth,
};
export const lerp = (a, b, k) => a + (b - a) * k;
export const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; };

// keyframes [[t, value], ...] (value a number or an array), eased between (the ease of the key it leaves: [t, v, 'out'])
export function keys(list, defEase = 'inOut') {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) {
        const [t0, v0, e0] = list[i - 1], [t1, v1] = list[i], k = ease[e0 || defEase]((t - t0) / Math.max(1e-6, t1 - t0));
        return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], k)) : lerp(v0, v1, k);
      }
    }
    return list[list.length - 1][1];
  };
}
export function angleKeys(list, defEase = 'inOut') {
  return (t) => {
    if (t <= list[0][0]) return list[0][1];
    for (let i = 1; i < list.length; i++) if (t <= list[i][0]) { const [t0, v0, e0] = list[i - 1], [t1, v1] = list[i]; return angLerp(v0, v1, ease[e0 || defEase]((t - t0) / Math.max(1e-6, t1 - t0))); }
    return list[list.length - 1][1];
  };
}
// a point along a polyline of [x, z] at distance s, and its heading (forward = (sin h, cos h))
export function polyline(pts) {
  const seg = []; let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  return {
    length: L,
    at(s) {
      s = clamp(s, 0, L);
      for (let i = 0; i < seg.length; i++) { if (s <= seg[i] || i === seg.length - 1) { const k = seg[i] ? s / seg[i] : 0, a = pts[i], b = pts[i + 1]; return { x: lerp(a[0], b[0], k), z: lerp(a[1], b[1], k), h: Math.atan2(b[0] - a[0], b[1] - a[1]) }; } s -= seg[i]; }
      return { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], h: 0 };
    },
  };
}
// a smooth curve through [x, z] points (centripetal Catmull-Rom), sampled by arc length: at(s) -> { x, z, h, k (curvature) }
export function spline(pts) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = c.getLength(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3();
  return {
    length: L,
    at(s) {
      const u = clamp(s / L);
      c.getPointAt(u, _p); c.getTangentAt(u, _t); c.getTangentAt(clamp(u + 0.5 / L), _t2);
      const h = Math.atan2(_t.x, _t.z), h2 = Math.atan2(_t2.x, _t2.z);
      return { x: _p.x, z: _p.z, h, k: angLerp(0, h2 - h, 1) / 0.5 };
    },
  };
}
// distance along a path from a speed profile: [[t, v], ...] (m/s, straight between keys), integrated
export function travel(profile) {
  const acc = [0];
  for (let i = 1; i < profile.length; i++) acc.push(acc[i - 1] + (profile[i][0] - profile[i - 1][0]) * (profile[i][1] + profile[i - 1][1]) / 2);
  const f = (t) => {
    if (t <= profile[0][0]) return 0;
    for (let i = 1; i < profile.length; i++) if (t <= profile[i][0]) { const [t0, v0] = profile[i - 1], [t1, v1] = profile[i], dt = t - t0, a = (v1 - v0) / (t1 - t0); return acc[i - 1] + v0 * dt + 0.5 * a * dt * dt; }
    return acc[acc.length - 1] + (t - profile[profile.length - 1][0]) * profile[profile.length - 1][1];
  };
  f.speed = (t) => { if (t <= profile[0][0]) return profile[0][1]; for (let i = 1; i < profile.length; i++) if (t <= profile[i][0]) { const [t0, v0] = profile[i - 1], [t1, v1] = profile[i]; return lerp(v0, v1, (t - t0) / (t1 - t0)); } return profile[profile.length - 1][1]; };
  f.total = acc[acc.length - 1];
  return f;
}

// metres covered along a path of [x, z] (a keys() or spline-at position; [x, y, z] uses x and the last) from t0 to t,
// tabulated at 120 Hz over [t0, t1]: a walk or a run's clip time from the ground it covers (a rig segment's { along,
// mps }), so its planted foot stays put however the path eases in and out (a fixed clip speed slides at every ease)
export function odometer(pos, t0, t1) {
  const N = Math.max(1, Math.ceil((t1 - t0) * 120)), d = new Float32Array(N + 1), xz = (p) => [p[0], p[p.length - 1]];
  let p = xz(pos(t0));
  for (let i = 1; i <= N; i++) { const q = xz(pos(t0 + (i / N) * (t1 - t0))); d[i] = d[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; }
  return (t) => { const u = clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1) * N, i = Math.min(N - 1, Math.floor(u)); return d[i] + (d[i + 1] - d[i]) * (u - i); };
}

// A seekable pose for a mixer: segments [[t, clip, { from = 0, speed = 1, loop = true, fade = 0.25, hold }]...], each a
// clip name or a list of them (masked clips layered: legs from one, the upper body from another), a name in the list
// either a string or [name, { from, speed }] of its own. At t the current segment fades in over the one before.
// { along, mps } instead of speed: the clip's time from the metres covered (along: an odometer) at the speed it was
// captured at (mps, m/s; negative plays it backward), stride x cadence = the ground speed whatever the path does.
// pose(t) sets every action's time and weight and applies them.
export function rig(mixer, clipsByName) {
  const actions = new Map();
  const action = (name) => {
    let a = actions.get(name); if (a) return a;
    const clip = clipsByName[name]; if (!clip) { console.warn('[cine] no clip', name); return null; }
    a = mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; a.setEffectiveWeight(0); a.play(); a.timeScale = 0;
    actions.set(name, a); return a;
  };
  const r = {
    segs: [],
    set(segs) {
      r.segs = segs.map(([t, clip, o = {}]) => ({ t, from: 0, speed: 1, loop: true, fade: 0.25, ...o,
        clips: (Array.isArray(clip) ? clip : [clip]).map((c) => (typeof c === 'string' ? { name: c } : { name: c[0], ...c[1] })) }));
      for (const s of r.segs) for (const c of s.clips) action(c.name);
      return r;
    },
    pose(t) {
      const w = new Map();
      let i = -1; for (let k = 0; k < r.segs.length; k++) if (r.segs[k].t <= t) i = k;
      if (i < 0) i = 0;
      const cur = r.segs[i], prev = r.segs[i - 1];
      const k = prev ? smooth((t - cur.t) / Math.max(1e-3, cur.fade)) : 1;
      const timeOf = (s, c, a) => { const d = a.getClip().duration; let x = (c.from ?? s.from) + (s.along ? (s.along(t) - s.along(s.t)) / s.mps : Math.max(0, t - s.t) * (c.speed ?? s.speed)); if (s.hold != null) x = Math.min(x, s.hold); return s.loop ? ((x % d) + d) % d : clamp(x, 0, d - 1e-4); };
      for (const [s, wt] of [[cur, k], [prev, 1 - k]]) {
        if (!s || wt <= 0) continue;
        for (const c of s.clips) { const a = action(c.name); if (!a) continue; a.time = timeOf(s, c, a); w.set(c.name, (w.get(c.name) || 0) + wt); }
      }
      for (const [name, a] of actions) a.setEffectiveWeight(w.get(name) || 0);
      mixer.update(0);
      return cur;
    },
    stop() { for (const a of actions.values()) { a.setEffectiveWeight(0); a.stop(); } actions.clear(); },
    owns(a) { for (const x of actions.values()) if (x === a) return true; return false; },
    action,
  };
  return r;
}
// a clip cut down to some bones (keep(boneName) -> true)
export function masked(clip, keep, name) {
  return new THREE.AnimationClip(name || clip.name + '/m', clip.duration, clip.tracks.filter((tr) => keep(tr.name.split('.')[0])));
}

// handheld: a slow, small wander of the aim (radians) and of the camera itself (metres)
export function handheld(t, amt = 1) {
  const n = (f, p) => Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.13 + p * 1.7) * 0.3 + Math.sin(t * f * 4.7 + p * 3.1) * 0.1;
  return { yaw: n(0.9, 1.3) * 0.004 * amt, pitch: n(1.1, 4.2) * 0.003 * amt, roll: n(0.7, 2.2) * 0.004 * amt, x: n(0.8, 0.4) * 0.012 * amt, y: n(1.3, 5.1) * 0.01 * amt };
}

// ---- a phone held upright. The shots are composed for a landscape frame, and three's fov is the height of the view, so
// on a tall screen a shot's subjects would fall off its sides. While the screen is upright (js/cameras.js portK: 0 at
// width / height 1.3 and wider, today's frame exactly; 1 on a phone) a shot is seen through a band across the middle of
// the screen, the cutscene's black bars grown to it (--bar on #wg), its lens opened out so the band sees the width a
// SHOT_ASPECT screen sees: whatever the shot puts in a landscape frame is in it, at the same place (aimAt's thirds too,
// shotAspect). The band is BAND wide to its height: a little taller than the landscape frame, the shot's own framing
// across its middle. The subtitles go under it, in the black. A shot with band: false (the opening's aerial, the title)
// fills the upright screen instead, at its own lens. All of it is worked out again every frame: the phone turned
// mid-scene, the frame follows at once.
const SHOT_ASPECT = 16 / 9, BAND = 1.25;
const portOf = (cs) => (cs.portK ? cs.portK() : 0);
// the width to height a shot is composed for on this screen (aimAt's thirds): the screen's own unless it is upright
export function shotAspect(cs, band = true) {
  const a = cs.camera.aspect || SHOT_ASPECT, k = band ? portOf(cs) : 0;
  return k ? lerp(a, SHOT_ASPECT, k) : a;
}
// the lens for a shot's fov on this screen (the same fov unless it is upright)
export function shotFov(cs, fov, band = true) {
  const a = cs.camera.aspect || SHOT_ASPECT, k = band ? portOf(cs) : 0;
  if (!k) return fov;
  return Math.atan(Math.tan(fov * Math.PI / 360) * shotAspect(cs) / a) * 360 / Math.PI;
}
let bandPx = 0, bandCss = false;
function setBand(px) {
  const root = document.getElementById('wg');
  if (!bandCss && px > 0) {
    bandCss = true;
    const st = document.createElement('style');
    st.id = 'wg-band-css';
    // (the subtitle line under the picture, in the black; a mission's title card over it, in the black, clear of the
    // place and time captions on the picture's lower corners; his phone's close-up (ui.phone) on the picture's right, a
    // little taller than it, not over him on its left third)
    st.textContent = `body.wg-cine.wg-band #wg .wg-line { bottom: auto; top: calc(100% - var(--bar) + 12px); }
body.wg-cine.wg-band #wg .wg-title { top: calc(var(--bar) / 2); }
body.wg-cine.wg-band #wg .wg-phone { height: min(60vh, 600px, calc(100% - 2 * var(--bar) + 48px)); right: 5vw; }`;
    document.head.appendChild(st);
  }
  if (px > 0) {
    if (Math.abs(px - bandPx) > 0.5 && root) { root.style.setProperty('--bar', px.toFixed(1) + 'px'); bandPx = px; }
    document.body.classList.add('wg-band');
  } else if (bandPx) {
    bandPx = 0; root?.style.removeProperty('--bar'); document.body.classList.remove('wg-band');
  }
}
// the bars for a shot (0: the cutscene's own) and the lens it is seen through, for this screen
function frameShot(cs, c) {
  const k = c.band === false ? 0 : portOf(cs);
  if (!k) { setBand(0); return c.fov; }
  const el = cs.domElement, w = el?.clientWidth || innerWidth, h = el?.clientHeight || innerHeight;
  const a = cs.camera.aspect || w / h, b = lerp(a, BAND, k);
  setBand(Math.max(0, (h - w / b) / 2));
  return shotFov(cs, c.fov);
}

export function createDirector(W) {
  const app = W.app, cs = app.cameraSystem, cam = cs.camera, cm = app.controllerManager;
  const _look = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _pv = new THREE.Vector3();
  const D = {
    camera: { pos: [0, 50, 0], look: [0, 0, 100], fov: 50, roll: 0, shake: null },
    active: false, blocking: false, onFrame: null, framed: false,
    // put the camera where D.camera says, every frame, over the city's own (whatever wraps it still runs first: the
    // fight's camera steps its clock there, and stands aside while WAGMI.cutscene is set)
    take() {
      if (D.active) return; D.active = true;
      const prev = D.prev = cs.update;
      cs.update = (dt, el) => {
        prev.call(cs, dt, el);
        if (D.onFrame && !D.framed) D.onFrame(dt); D.framed = false;
        D.apply();
      };
    },
    apply() {
      const c = D.camera, s = c.shake;
      cam.position.set(c.pos[0] + (s ? s.x : 0), c.pos[1] + (s ? s.y : 0), c.pos[2]);
      _look.set(c.look[0], c.look[1], c.look[2]);
      cam.up.set(0, 1, 0); cam.lookAt(_look);
      if (s || c.roll) { _e.set((s ? s.pitch : 0), (s ? s.yaw : 0), (c.roll || 0) + (s ? s.roll : 0), 'YXZ'); _q.setFromEuler(_e); cam.quaternion.multiply(_q); }
      // (upright: through the band, the lens opened out; else the shot's own)
      const fov = frameShot(cs, c);
      if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cs.currentPos.copy(cam.position); cs.currentLookAt.copy(_look);
    },
    // hand the camera back: over secs it eases from the last shot into the city's own (the chase camera behind the
    // player, as fresh as after a teleport), then the city's update runs alone again. It hands back a clear view: on
    // foot with straight behind him blocked (the van he just searched, a wall, the rally's screen), he is turned at once
    // to the nearest way round that is clear (cs.clearTurn) and the view cuts there on the first frame, behind him at
    // its usual height and length, him and the way on in it (a glide from the last shot would have come down through,
    // or pressed against, what was behind him); in the car the view stays behind it, in front of whatever is there
    // (js/cameras.js keepInView, with the street's things: cs.blockers). It glides (in at most 0.6 s) only when nothing
    // stood behind him, the last shot has him in it from a few metres off, and the straight line from it to the view
    // behind him is clear all the way; else it cuts. face ({ x, z }, or a function that gives one when it hands back):
    // where he goes next. On foot he is turned to the clear way nearest it; in the car the view is turned toward it (the
    // orbit, eased back behind the car once he drives on)
    release(secs = 1.2, { face = null } = {}) {
      return new Promise((res) => {
        if (!D.active) return res();
        const from = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov }, prev = D.prev;
        cs.resetForTeleport(); app.selectCamera?.('chase', true);
        const ent = cm.getActiveEntity(), onFoot = cm.activeMode === 'person';
        let fp = null; try { fp = typeof face === 'function' ? face() : face; } catch (e) { console.warn('[cine] face', e); }
        const fy = fp && Number.isFinite(fp.x) && Number.isFinite(fp.z) && Math.hypot(fp.x - ent.position.x, fp.z - ent.position.z) > 1.5 ? Math.atan2(fp.x - ent.position.x, fp.z - ent.position.z) : null;
        const turn = cs.clearTurn ? cs.clearTurn(ent, onFoot ? fy : null) : 0;
        if (turn) { ent.heading += turn; if (ent.mesh && onFoot) ent.mesh.rotation.y = ent.heading; }
        if (fy != null && !onFoot && ent.type === 'car') { cs.orbitYawOffset = Math.atan2(Math.sin(fy - ent.heading), Math.cos(fy - ent.heading)); cs.userOrbitTimer = 1.2; }
        // (the last shot sees him, from a few metres off: a glide from a close-up (his hands in the van, his face) would
        // spend its first half inside him, him out of the frame)
        const pv0 = _p.copy(ent.position); pv0.y += cm.activeMode === 'car' ? 1.15 : 1.45;
        const seen = from.p.distanceTo(pv0) > 2.5 && (cam.updateMatrixWorld(), pv0.project(cam), pv0.z < 1 && Math.abs(pv0.x) < 0.9 && Math.abs(pv0.y) < 0.9);
        W.handback = { turn, seen, face: fy, at: performance.now() }; // (for looking at it)
        cs.update = prev;
        if (secs <= 0) { D.active = false; setBand(0); return res(); }
        // (a glide is short: at most 0.6 s)
        secs = Math.min(secs, 0.6);
        let k = 0, first = true;
        cs.update = (dt, el) => {
          prev.call(cs, dt, el);
          const pv = _pv.copy(ent.position); pv.y += cm.activeMode === 'car' ? 1.15 : 1.45;
          if (first) {
            first = false;
            const clear = !turn && seen && cs.segClear && cs.segClear(pv, from.p, ent) > 0.97 && cs.segClear(from.p, cam.position, ent) > 0.99;
            // (a cut: once more at no time step, so the view behind him is already held clear of what is there, as on
            // every frame after: the first one after a teleport isn't)
            if (!clear) { k = 1; prev.call(cs, 0, el); }
          }
          k = Math.min(1, k + dt / secs); const e = ease.inOut(k);
          const toP = cam.position.clone(), toQ = cam.quaternion.clone(), toF = cs.viewFov ? cs.viewFov() : cs.getActivePreset().fov;
          cam.position.lerpVectors(from.p, toP, e); cam.quaternion.slerpQuaternions(from.q, toQ, e);
          // (and should the line from him to the lens be cut on the way all the same, it cuts to the view behind him
          // there instead of gliding through)
          if (k < 1 && cs.segClear && cs.segClear(pv, cam.position, ent) < 0.97) { k = 1; cam.position.copy(toP); cam.quaternion.copy(toQ); }
          const f = k >= 1 ? toF : lerp(from.fov, toF, e); if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
          if (k >= 1) { cs.update = prev; D.active = false; setBand(0); res(); }
        };
      });
    },
    // keep the keyboard and the mouse from the game; Space / Enter held 0.6 s calls onSkip. While it blocks, W.cineSkip()
    // skips it as the held key would (the pause menu's restart, from inside a cutscene)
    block(on, { onSkip = null, skipAfter = 1 } = {}) {
      D.blocking = !!on;
      if (on) {
        cm.resetInput(); D.skipK = 0; D.skipHeld = false; D.onSkip = onSkip; D.blockT = performance.now() + skipAfter * 1000;
        W.cineSkip = D._skip || (D._skip = () => { const f = D.blocking && D.onSkip; if (!f) return false; D.onSkip = null; D.skipK = 0; f(); return true; });
        if (!D._keys) {
          D._keys = (e) => {
            if (!D.blocking) return;
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') D.skipHeld = e.type === 'keydown';
            e.stopImmediatePropagation(); if (e.type === 'keydown' && !e.metaKey && !e.ctrlKey) e.preventDefault();
          };
          // (a long press anywhere skips too: phones and tablets have no Space; not a click on the pause menu)
          D._mouse = (e) => { if (!D.blocking || W.paused) return; if (e.type !== 'wheel') D.skipHeld = e.type === 'pointerdown'; if (e.target === app.renderer.domElement) e.stopImmediatePropagation(); };
          for (const t of ['keydown', 'keyup']) addEventListener(t, D._keys, true);
          for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'wheel']) addEventListener(t, D._mouse, true);
        }
      } else { D.skipHeld = false; cm.resetInput(); if (W.cineSkip === D._skip) W.cineSkip = null; }
    },
    // the skip ring: call every frame; returns true once it has filled (paused, it waits: the menu has the keys, and a
    // Space held into the pause is let go)
    skipStep(dt, ui) {
      if (W.paused) { D.skipHeld = false; D.skipK = 0; ui?.skip(null); return false; }
      if (!D.blocking || !D.onSkip) return false;
      const can = performance.now() > D.blockT;
      D.skipK = D.skipHeld && can ? D.skipK + dt / 0.6 : Math.max(0, D.skipK - dt * 3);
      if (ui) ui.skip(can ? D.skipK : null);
      if (D.skipK >= 1) { const f = D.onSkip; D.onSkip = null; D.skipK = 0; ui?.skip(null); f(); return true; }
      return false;
    },
  };
  return D;
}
