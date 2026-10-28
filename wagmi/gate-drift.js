// Mog City: the start gate's camera. While the title is up over the live city (wagmi/mission/ui.js gate()), the frame
// under it drifts: a slow orbit about the Empire State's axis (the tower stays where it is in the frame, the roofs in
// front slide past it), a little rise and a little push in, eased in from the opening's first frame the moment the
// city goes live under the title's still (index.html), so the hand-over has no jump. With a mouse, the pointer leans
// the orbit too (index.html's title measures it: window.__wgTitle.ptr), the lockup and the motes lean the other way.
// A start lets the drift coast to a stop in 1.2 s and the opening's first shot plays on from wherever it has come to (the
// tower still in its place), and the cut to its second shot takes the opening's own cameras back; at once when the
// cold-open trailer's black is about to cover it (?trailer=1).
// It moves only what the gate already holds: the hold camera's frame (intro.js W._holdCam, while the opening is still
// being built) or, once it is, the opening's first shot through its own fixed-camera switch (W.intro.cam): shot 1 at its
// own time, turned by the drift. Nothing of the city, the car or the opening's timing is touched. Less motion: no drift.
//   const d = createGateDrift(); d.live(); ... d.stop(fast)
const AX = -80, AZ = 686; // the Empire State, the opening's shot 1 subject (intro.js)
const DEG = Math.PI / 180;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export function createGateDrift() {
  const W = window.WAGMI;
  const still = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  let liveAt = null, stopAt = null, dead = false, raf = 0, last = 0;
  // the drift's own clock (seconds since the city went live, slowed to a halt after a start) and the pointer's lean,
  // held where it was at the start
  let clock = 0, rate = 1, px = 0, py = 0;
  let hold = null, holdBase = null, api = null;
  // the drift now: orbit (radians), push (fraction of the way to the look point), lift (metres)
  function measure() {
    if (liveAt == null || still) return { th: 0, push: 0, lift: 0 };
    const k = smooth(clock / 6), kp = smooth(clock / 1.5);
    return {
      th: k * 5.2 * DEG * Math.sin((2 * Math.PI * clock) / 64) + kp * 1.1 * DEG * px,
      lift: k * 9 * (1 - Math.cos((2 * Math.PI * clock) / 46)) * 0.5 - kp * 6 * py,
      push: k * 0.045 * (1 - Math.cos((2 * Math.PI * clock) / 80)) * 0.5,
    };
  }
  // a frame { pos, look, fov, band } turned about the tower's axis, pushed and lifted
  function compose(base, o) {
    const c = Math.cos(o.th), s = Math.sin(o.th);
    const rot = (p) => { const dx = p[0] - AX, dz = p[2] - AZ; return [AX + dx * c + dz * s, p[1], AZ - dx * s + dz * c]; };
    const pos = rot(base.pos), look = rot(base.look);
    for (let i = 0; i < 3; i++) pos[i] += (look[i] - pos[i]) * o.push;
    pos[1] += o.lift; look[1] += o.lift * 0.4;
    return { pos, look, fov: base.fov, band: base.band, shake: null };
  }
  // where the opening leaves its first shot (a cut: the drift goes with it)
  const cutAt = () => { const s1 = api?.shots?.[1]; return s1 && Number.isFinite(s1.t) ? s1.t : 6; };
  // the opening's camera at its time, drifted while it is on its first shot: what its director reads in place of the
  // shot (its fixed camera, intro.js api.cam), worked out as it reads it
  let cur = null, curKey = '';
  const frame = () => {
    const t = api?.t ?? 0, key = t + '|' + clock + '|' + px + '|' + py;
    if (cur && key === curKey) return cur;
    curKey = key;
    const shots = api?.shots || [];
    if (t >= cutAt()) { let s = shots[0]; for (const x of shots) if (x.t <= t) s = x; cur = s ? s.cam(t) : cur; return cur; }
    const base = shots[0] ? shots[0].cam(t) : { pos: [260, 140, 250], look: [-80, 172, 686], fov: 50, band: false };
    cur = compose(base, measure());
    return cur;
  };
  const cam = { get pos() { return frame().pos; }, get look() { return frame().look; }, get fov() { return frame().fov; }, get band() { return frame().band; }, get shake() { return frame().shake || null; } };
  // (the hold camera looks straight at the tower; the opening's first shot, and the title's still shot from it, have the
  // tower at the right of the frame (intro.js shot 1: aimAt(pos, tower, 0.52, 50, 0, false)). The hold framed the same
  // way, so a saved game's gate (held on it to the end) and the moments before the opening is built match the still)
  const framed = (b) => {
    const dx = b.look[0] - b.pos[0], dz = b.look[2] - b.pos[2], d = Math.hypot(dx, dz) || 1;
    if (Math.hypot(b.look[0] - AX, b.look[2] - AZ) > 1) return b;
    const asp = W?.app?.cameraSystem?.camera?.aspect || innerWidth / innerHeight;
    const off = -0.52 * d * Math.tan((b.fov * Math.PI) / 360) * asp;
    return { ...b, look: [b.look[0] + (-dz / d) * off, b.look[1], b.look[2] + (dx / d) * off] };
  };
  const onHold = () => { if (!hold || !holdBase) return; const f = compose(framed(holdBase), measure()); hold.camera.pos = f.pos; hold.camera.look = f.look; hold.camera.fov = f.fov; };
  // (let go: the hold, if it is still up, stays on its last frame, the frame the start left)
  function letGo() {
    dead = true; cancelAnimationFrame(raf);
    if (hold && hold.onFrame === onHold) hold.onFrame = null;
    if (api && api.cam === cam) api.cam = null;
    hold = holdBase = api = null;
  }
  function tick(now) {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    // the clock: on from the moment the city is live; after a start, coasting to a halt over 1.2 s
    if (liveAt != null) {
      if (stopAt != null) rate = 1 - smooth((now - stopAt) / 1200);
      clock += dt * rate;
      if (stopAt == null) { const P = window.__wgTitle?.ptr; if (P) { px = P.x; py = P.y; } }
    }
    // the hold camera while the opening is built (the one seen first, as it was set: its frame is the base)
    const h = W?._holdCam || null;
    if (h !== hold) {
      if (hold && hold.onFrame === onHold) hold.onFrame = null;
      hold = h; holdBase = null;
      if (h && !h.onFrame && h.camera) { holdBase = { pos: [...h.camera.pos], look: [...h.camera.look], fov: h.camera.fov, band: h.camera.band }; h.onFrame = onHold; }
    }
    // the opening once it is built, while it is on its first shot; let go at its cut to the second
    const a = W?.intro || null;
    if (a !== api) { if (api && api.cam === cam) api.cam = null; api = a; }
    if (api && Array.isArray(api.shots)) {
      const t = api.t ?? 0, on = liveAt != null && t < cutAt();
      if (on && !api.cam) api.cam = cam;
      else if (!on && api.cam === cam) { api.cam = null; if (stopAt != null) letGo(); }
    }
    // a start before the opening was ever built, or a saved game's Continue: nothing left to drift once halted
    if (stopAt != null && !api && now - stopAt > 1300) letGo();
  }
  // (with less motion it runs too, the drift held at nothing: the hold still framed as the still)
  if (W) raf = requestAnimationFrame(tick);
  return {
    // the city live under the title: the drift eases in from here
    live() { if (liveAt == null) liveAt = performance.now(); },
    // a start: the drift coasts to a halt and the opening plays on from there; fast: let go at once
    stop(fast = false) { if (dead) return; if (fast || liveAt == null || still) { letGo(); return; } if (stopAt == null) stopAt = performance.now(); },
  };
}
