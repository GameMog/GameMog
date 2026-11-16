// Mog City: Mission 4's escape (docs/MISSIONS.md, Mission 4 · Shredder, beats 10-11 of the plan's lean cut): after the
// alarm, the run to Mr. Big's helicopter, the take-off, the flight Dan flies himself to the Battery Park City riverfront,
// the landing, the walk to the last ferry, the boarding and the hostage call on its stern deck. m4.js runs the phases;
// this is what they do. Mr. Big is only ever on the phone or on video from his office (his study, mission/mrbig.js:
// full-frame inserts in the call); the ferry and its landing are generic (FERRY only).
//   const E = createEscape(W, K)    K: the mission's helpers (m4.js createMission)
//   E.run · E.takeoff · E.flight · E.landing · E.ferry · E.boarding · E.call   the phases, (fresh) -> Promise
//   E.teardown()                    everything of the escape put away (the helicopter given back to the city)
//   E.reach()                       the escape's places checked as a player could reach them (the owner's rule, 14
//                                   Nov: nothing inside a building, nothing past the shore): [] or the problems
// The test drive (?m4=...&autopilot=1): pilot(W) plays the escape as a player could, through the controls' own touch
// input (cm.setTouchInput): the run on foot and F at the helicopter, the flight (up over the roofs, through the rings,
// down into the landing ring, F), the walk along the esplanade; every scene left to run.
import * as THREE from 'three/webgpu';
import { place, getCast } from '../intro.js';
import { spline } from './cine.js';
import { createHud } from '../storyrun/hud.js';
import { talk, stand, WHITE, BLUE, ACID } from './m4-scenes.js';
import { poser, holdPhone, releasePhone } from './m3-scenes.js';
import { storyHeli } from './m4-heli.js';
import { TAKEOFF, LAND, GATE, DOCK, ESPLANADE, RUNWAY, FERRY, GANGWAY, buildLanding, buildFerry, buildWake, buildRings, buildPad } from './m4-ferry.js';
import { SPOTS, PAV, at as atPav } from './m4-set.js';
import { S as story } from '../story/index.js';

const PI = Math.PI;
const Q = new URLSearchParams(location.search);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
// a landing mark: a target that keeps its size on screen (a ring, its four ticks and a small dot in the middle), drawn
// over the night haze and the roofs between, a waypoint. (The look review's round 9: the warm glow, a halo with a hot
// core, read as a sun or a lens flare sitting on the subtitle; a ring reads as where to go)
function landingBeacon() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.lineCap = 'round';
  // (a dark under-stroke so it reads over the lit shore as well as the black river)
  for (const [col, lw] of [['rgba(0,0,0,0.55)', 9], ['rgba(255,214,110,1)', 5]]) {
    x.strokeStyle = col; x.lineWidth = lw;
    x.beginPath(); x.arc(64, 64, 40, 0, Math.PI * 2); x.stroke();
    x.beginPath(); for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { x.moveTo(64 + ax * 46, 64 + ay * 46); x.lineTo(64 + ax * 58, 64 + ay * 58); } x.stroke();
  }
  x.fillStyle = 'rgba(255,236,170,1)'; x.beginPath(); x.arc(64, 64, 6, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, fog: false }));
  s.scale.set(0.075, 0.075, 1); s.renderOrder = 6; s.name = 'm4-landing-beacon';
  return s;
}
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const RUN_SECS = 30, FERRY_SECS = 150, CLIMB = 60;
// how near the ring's middle a set-down counts (the owner's play, 15 Nov: 14 m out, nothing happened but one line): the
// ring painted at LAND.r, a set-down anywhere on its lit edge and a little past it taken
const LAND_OK = LAND.r + 6;
// the way to a place in words, from him (x east, z south): 'north-east'
const compass = (dx, dz) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(Math.atan2(dx, -dz) / (PI / 4)) % 8) + 8) % 8];
const far = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 5) * 5} m`);
// the way from the pavilion's street out to the helicopter, and the way it faces (west, to the riverfront)
const HEAD = Math.atan2(LAND.x - TAKEOFF.x, LAND.z - TAKEOFF.z);
const RUN_CHAT = [['Suits', 'HE TOOK THE THING'], ['Mr. Big', "Nobody calls the police. It's embarrassing."]];

export function createEscape(W, K) {
  const app = W.app, cm = app.controllerManager, P = W.person, ui = W.ui, sfx = W.sfx;
  const H = storyHeli(W), heli = H.entity;
  // (the mission's own wrappers by their plain names: the story pack's scanner reads their words, tools/story/scan.mjs)
  const { fail, objective } = K;
  const gy = (x, z) => cm.getGroundHeight(x, z, 'person');
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const flying = () => cm.activeMode === 'helicopter';
  // a way of points for the route (the radar's line, the test drive's way): the next point not yet passed, from the
  // one nearest him on (so a player who cuts a corner is not sent back)
  const along = (pts) => { let i = 0; return () => { const p = P.position; let best = i, bd = Infinity; for (let k = i; k < pts.length; k++) { const d = dist(p, pts[k][0], pts[k][1]); if (d < bd) { bd = d; best = k; } } i = best; while (i < pts.length - 1 && dist(p, pts[i][0], pts[i][1]) < 5) i++; return { x: pts[i][0], z: pts[i][1] }; }; };
  // (my own frame clock: the mission's frameDt is the heist's)
  let lastT = K.now();
  const dtNow = () => { const t = K.now(), d = Math.min(0.05, (t - lastT) / 1000); lastT = t; return d; };
  // (out of the helicopter on the riverfront: 10 m on from its door toward the esplanade's next point, facing along it,
  // so the follow camera behind him is not inside the helicopter)
  const clear = (p) => { const e = ESPLANADE[1], h = Math.atan2(e[0] - p.x, e[1] - p.z); let x = p.x + Math.sin(h) * 10, z = p.z + Math.cos(h) * 10; const q = { x, y: gy(x, z), z }; cm.resolveHorizontalCollision(q, 0.48, q.y + 1); return { x: q.x, z: q.z, h }; };

  // the riverfront kept to itself from the landing to the ferry: River Terrace's stretch by the ring and the esplanade
  // to the gate, no traffic placed or turned onto it, no city walkers on it (the look review's round 4, 15 Nov: a
  // sedan stopped for him on his way off the landing, and he ran through its hood). Jane's line: nobody's there at night
  // (and the shore highway, West St, which the walk crosses between the ring and the river: closed from 130 m south
  // of the ring to 130 m north of the gate, its cars stopped at the closures out of the shots)
  const RIVER_HOLD = [{ minX: -715, maxX: -628, minZ: 4925, maxZ: 5130 }, { minX: -662, maxX: -590, minZ: 5130, maxZ: 5252 }];
  const HWY_HOLD = [{ minX: -780, maxX: -540, minZ: 4820, maxZ: 5370 }];
  const riverQuiet = (on = true) => { app.trafficSystem?.hold?.(on ? RIVER_HOLD : []); app.highwayTraffic?.hold?.(on ? HWY_HOLD : []); farDim(on); };
  // (the far shore's block of towers across from the esplanade, BoroughBuildings:-2,5, a stepped pyramid glowing through
  // the riverfront trees as a bright triangle: the look review's round 5, 15 Nov. Its lit windows dimmed while the
  // escape is on the riverfront and the river, its own material for the while, put back after)
  let far0 = null;
  function farDim(on) {
    const m = app.scene.getObjectByName('BoroughBuildings:-2,5'); if (!m) return;
    if (on && !far0 && m.material?.emissiveNode) {
      far0 = m.material; const d = far0.clone(); d.emissiveNode = far0.emissiveNode.mul(0.25); if (far0.colorNode) d.colorNode = far0.colorNode.mul(0.6); m.material = d;
    } else if (!on && far0) { m.material.dispose(); m.material = far0; far0 = null; }
  }

  /* ------------------------------------------------------------ the sets -- */
  const E = W._m4esc || (W._m4esc = { landing: null, ferry: null, wake: null, rings: null, hud: null, pad: null });
  function sets() {
    if (!E.landing) E.landing = buildLanding(W);
    if (!E.ferry) { E.ferry = buildFerry(W); E.wake = buildWake(W, E.ferry); }
    if (!E.hud) E.hud = createHud(ui);
    if (!E.pad) E.pad = buildPad(W, gy(LAND.x, LAND.z));
    return E;
  }
  // the helicopter's sound and its rotors, every frame of the escape (off with it)
  let heliHook = null;
  const heliOn = (on) => { heliHook?.(); heliHook = on ? K.hook(() => H.step(dtNow())) : null; };

  /* ----------------------------------------------------- the ferry's way -- */
  // its berth: alongside the landing's float, on its north side, the bow out to the river; then out into the Hudson and
  // round toward the far shore (backdrop only)
  const F = [Math.sin(DOCK.h), Math.cos(DOCK.h)], R = [Math.cos(DOCK.h), -Math.sin(DOCK.h)];
  const atDock = (a, b) => [GATE.x + R[0] * a + F[0] * b, GATE.z + R[1] * a + F[1] * b];
  const way = spline([atDock(-10.2, 36), atDock(-10.2, 72), atDock(-18, 160), [-1000, 5090], [-1320, 4860], [-1700, 4560], [-2100, 4260]]);
  let ferryHook = null, fs = 0, fv = 0, fgo = false, ft = 0;
  function ferryRun(on, { from = 0, go = false, v = 0 } = {}) {
    ferryHook?.(); ferryHook = null; const f = E.ferry; if (!f) return;
    f.show(on); E.wake.reset(); if (!on) return;
    fs = from; fv = go ? Math.max(v, 1) : 0; fgo = go; ft = 0;
    const put = (dt) => { const p = way.at(fs); ft += dt; f.put(p.x, p.z, p.h, ft, fv); f.group.updateMatrixWorld(true); };
    put(0);
    let last = K.now();
    ferryHook = K.hook(() => {
      const t = K.now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (fgo) { fv = Math.min(7.5, fv + dt * 0.7); fs = Math.min(way.length, fs + fv * dt); }
      put(dt); E.wake.step();
    });
  }
  // Dan on the ferry's deck: the city's controls kept off him (the car's mode, his body out of it: no shore clamp on
  // him there), placed in the ferry's frame each frame, as Mission 1's moving SUV does
  const _v = new THREE.Vector3();
  let aboard = false;
  function onFerry(on) {
    aboard = !!on;
    if (on) { if (cm.activeMode !== 'car') cm.setMode('car'); P.inVehicle = true; P.mesh.visible = true; P.speed = 0; return; }
    P.inVehicle = false;
  }
  // (at lz along the deck, lx across; face: his heading from the ferry's, 0 its bow)
  function danOnDeck(lx = 0.4, lz = -15.6, face = 0) {
    const p = E.ferry.world(lx, 0, lz, _v), h = E.ferry.group.rotation.y + face;
    P.position.copy(p); P.heading = h; P.mesh.position.copy(p); P.mesh.rotation.y = h; P.mesh.visible = true;
    return h;
  }

  /* -------------------------------------------------------- the reach -- */
  // the escape's places as a player could reach them: the helicopter's spot and the landing ring with nothing standing
  // in its 6.2 m (the rotor), inside the shore; the gate and every point of the esplanade where a man can stand, inside
  // the shore clamp (8 m)
  function standing(x, z, r) {
    const y = gy(x, z);
    return cm.nearColliders(x, z, r + 1).filter((c) => !c.carOnly && (c.maxY ?? 99) > y + 0.4 && !((c.minY ?? -99) > y + 6) && x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ).length;
  }
  function inside(x, z, m = 8) { const b = window.NYC?.getIslandBoundsAtZ?.(z); return !b || (x > b.westX + m && x < b.eastX - m); }
  function reach() {
    const bad = [];
    for (const [what, p, r] of [['the take-off', TAKEOFF, 6.2], ['the landing ring', LAND, 6.2]]) {
      if (standing(p.x, p.z, r)) bad.push(`${what}: something stands within ${r} m`);
      if (!inside(p.x, p.z, r)) bad.push(`${what}: past the shore`);
    }
    const out = H.entity ? { x: LAND.x + Math.cos(HEAD) * 2.4, z: LAND.z - Math.sin(HEAD) * 2.4 } : LAND;
    if (!inside(out.x, out.z)) bad.push('the way out of the helicopter: past the shore clamp');
    for (const [x, z] of [...RUNWAY.slice(0, -1), ...ESPLANADE]) {
      const p = { x, y: gy(x, z), z }; cm.resolveHorizontalCollision(p, 0.48, p.y + 1);
      if (Math.hypot(p.x - x, p.z - z) > 0.05) bad.push(`the way at ${x}, ${z}: inside a wall`);
      if (!inside(x, z)) bad.push(`the way at ${x}, ${z}: past the shore clamp`);
    }
    return bad;
  }

  // the landing ring's marker on screen (a DOM tag over the frame; the HUD's own yellow)
  let lmEl = null; const _lm = new THREE.Vector3(), _lc = new THREE.Vector3();
  // a point in the camera's own space (in front of it is z < 0, on WebGPU's reversed depth and WebGL2's alike)
  const camSpace = (p, cam) => { cam.updateMatrixWorld(); return _lc.copy(p).applyMatrix4(cam.matrixWorldInverse); };
  function landMark(on, dl = 0, bc = null) {
    if (!on) { if (lmEl) lmEl.style.display = 'none'; return; }
    if (!lmEl) {
      lmEl = document.createElement('div'); lmEl.className = 'wg-landmark';
      lmEl.style.cssText = 'position:fixed;left:0;top:0;z-index:3;pointer-events:none;display:none;transform:translate(-50%,-50%);text-align:center;font:700 15px/1 "Barlow Condensed",sans-serif;letter-spacing:.08em;color:#FFC93C;text-shadow:0 1px 3px rgba(0,0,0,.9)';
      lmEl.innerHTML = '<div class="a" style="width:0;height:0;margin:0 auto 4px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:18px solid #FFC93C;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))"></div><span></span>';
      document.body.appendChild(lmEl);
    }
    // (the look review's round 9: held at the frame's foot it sat on the subtitle; its bottom edge is the subtitles' top)
    const cam = app.cameraSystem.camera, w = innerWidth, h = innerHeight, m = 56, mb = Math.max(m, h * 0.25);
    // (the owner's play, 15 Nov: the tag, on the ring 1 m up, and the beacon, raised over it, sat on each other from
    // overhead and both on the helicopter near in. The tag now hangs under the beacon, its name and distance a
    // caption to the ring mark, the arrow only when it is held at the frame's edge)
    if (bc?.visible) _lm.copy(bc.position); else _lm.set(LAND.x, gy(LAND.x, LAND.z) + 1, LAND.z);
    // (behind the camera is decided in its own space, before the projection: the WebGPU renderer's reversed depth
    // gives a point behind it a z near 0, not past 1, and a projected point behind is mirrored through the centre.
    // Behind, the tag goes to the frame's edge on the side the ring lies, its arrow pointing round toward it)
    const behind = camSpace(_lm, cam).z > -0.1;
    let x, y;
    if (behind) {
      const x0 = w / 2, y0 = (m + h - mb) / 2; let dx = _lc.x, dy = -_lc.y; const n = Math.hypot(dx, dy);
      if (n < 1e-6) { dx = 0; dy = 1; } else { dx /= n; dy /= n; }
      // (out along that way past the frame: the edge clamp below sets the tag, and the arrow points along it)
      x = x0 + dx * 1e5; y = y0 + dy * 1e5;
    } else { _lm.project(cam); x = (_lm.x + 1) / 2 * w; y = (1 - _lm.y) / 2 * h; }
    const inside = !behind && x > m && x < w - m && y > m && y < h - mb;
    // (close in, the ring, its lights and the prompt say it: the tag is only for finding it, off the frame's edge)
    if (inside && dl < 50) { lmEl.style.display = 'none'; return; }
    // (held to the frame's edge along the line from its centre, so the tag sits on the side the arrow points)
    let cx = x, cy = y;
    if (!inside) { const x0 = w / 2, y0 = (m + h - mb) / 2, dx = x - x0, dy = y - y0;
      const t = Math.min(1, Math.abs(dx) > 1e-6 ? (w / 2 - m) / Math.abs(dx) : 1, Math.abs(dy) > 1e-6 ? ((h - mb - m) / 2) / Math.abs(dy) : 1);
      cx = x0 + dx * t; cy = y0 + dy * t;
      // (kept off the frame's lower-left column, the Radar and the objective over it: along the foot it slides right
      // of the Radar, up the left edge it stops over the objective)
      const r = document.getElementById('minimap-card')?.getBoundingClientRect();
      if (r && r.width > 0 && cx < r.right + 70 && cy > r.top - 160) {
        if (cy >= h - mb - 1) cx = r.right + 70; else cy = r.top - 160;
      } }
    // (on the frame, under the beacon's ring: its half-height on screen, a sprite of a fixed size, plus a gap)
    const half = bc?.visible ? bc.scale.y / Math.tan((cam.fov || 60) * PI / 360) * h / 4 : 0;
    // (a narrow arrow, longer than wide, so the way it points reads at any angle: the first, wider than long, read as
    // pointing up when it was turned to point down and left)
    lmEl.style.display = 'block'; lmEl.style.left = cx + 'px'; lmEl.style.top = (inside ? cy + half + 12 : cy) + 'px';
    lmEl.querySelector('span').textContent = `${story.t('LAND')} · ${far(dl)}`;
    const a = lmEl.querySelector('.a'); a.style.display = inside ? 'none' : 'block';
    a.style.transform = inside ? 'none' : `rotate(${Math.atan2(y - cy, x - cx) * 180 / PI - 90}deg)`;
  }

  /* ----------------------------------------------------- the phases -- */
  const R0 = {
    // beat 10: the run to the helicopter, the Suits after him on foot; F to climb in
    async run(fresh) {
      await K.sets(); sets(); K.light('midnight'); K.showPav(true);
      // (the certificate stays his: showPav's reset redraws MR. BIG, and a retry or a skip to the run undid the flip; the
      // look review's round 6)
      if (fresh) { K.S.pav?.caseState?.('alarm'); K.S.pav?.cert?.(story.t('DAN')); K.S.guests?.mode('watch', { snap: true }); K.S.guests?.mode('scatter'); const d = K.runFrom(); place(W, { dan: [d.x, d.z, d.h] }); }
      // (Mr. Big's helicopter on the plaza at the street's south end, rotors idling, waiting to fly the key home)
      H.park(TAKEOFF.x, TAKEOFF.z, HEAD, 0.45); heliOn(true); H.rotorTo(0.55, 2);
      const mk = K.marker(TAKEOFF.x, TAKEOFF.z, { radius: 7.2 }), t0 = K.now();
      objective(['Run to the ', { helicopter: 'yellow' }, '.'], { follow: along(RUNWAY), name: "Mr. Big's helicopter" });
      W.gps.blip('heli', { x: TAKEOFF.x, z: TAKEOFF.z, kind: 'dest', edge: true, name: "Mr. Big's helicopter" });
      // two Suits from the staff entrance, after him (a fight if they catch him); out of it a beat after the alarm, so
      // he has his first strides before they are in a fight's reach (the look review, 15 Nov: stood still at the start
      // he squared up to them, the fight's panel up)
      const combat = W.combat;
      let offDown = null, gone = false;
      if (combat?.spawnCrew) K.delay(1.4).then(() => {
        if (gone) return;
        const e0 = K.suitsFrom();
        K.crew(combat.spawnCrew({ x: e0.x, z: e0.z, count: 2, aggro: true, props: false }));
        if (combat.player) { combat.player.hp = combat.player.maxHp; offDown = combat.player.onDown?.(() => fail('Dan got knocked out.', true)); }
      }).catch(() => {});
      RUN_CHAT.forEach(([from, text], i) => K.delay(1.5 + i * 4.5).then(() => ui.dm?.(from, text, 5)).catch(() => {}));
      let boarded = false;
      H.prompt(() => (cm.activeMode === 'person' && dist(P.position, heli.position.x, heli.position.z) < 8.5 ? [story.t('F  ·  Climb in'), () => { boarded = true; }] : null));
      // (the climb-in help once he is near it, not at the alarm: it faded in over the run's opening frame with the
      // pavilion behind it, a ghost with no plate; the look review's round 6)
      let hinted = false;
      const off = K.hook(() => {
        K.S.pav?.flash?.(K.now() / 1000);
        if (!hinted && !boarded && cm.activeMode === 'person' && dist(P.position, heli.position.x, heli.position.z) < 24) { hinted = true; ui.help(['At the ', { helicopter: 'yellow' }, ', press [F] to climb in.'], 6); }
        const left = RUN_SECS - (K.now() - t0) / 1000;
        ui.counter('SUITS', String(Math.max(0, Math.ceil(left))));
        if (left <= 0) fail('The Suits caught you.');
      });
      try { await K.wait(() => boarded); }
      finally { gone = true; off(); mk.off(); offDown?.(); ui.counter(null); H.prompt(null); W.gps.unblip('heli'); }
      K.downed();
      W.combat?.clear?.();
    },
    // beat 10a: the take-off, as the Suits close in on the ground; control handed over in the air
    async takeoff() {
      // (the pavilion up behind him, its flood on the plaza: as the run leaves it, and for a start here)
      await K.sets(); sets(); K.light('midnight'); K.showPav(true);
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      H.take(); heliOn(true); H.board();
      try { await K.scene(takeoffScene(W, { say: K.say, H, knox: K.knox(), sfx, ui, pav: K.S.pav })); }
      finally { ui.caller(null); }
      if (K.knox()) K.knox().root.visible = false;
    },
    // beat 10b: Dan flies, west across downtown, through the guide rings, down into the landing ring
    async flight(fresh) {
      // (the riverfront's traffic held from the take-off on, not from the landing: cars drove past the ring under him as
      // he came in, the shore highway's lanes 11.5 m from its middle)
      await K.sets(); sets(); K.light('midnight'); riverQuiet(); E.pad.show(true);
      if (fresh || !flying()) { H.park(TAKEOFF.x, TAKEOFF.z, HEAD, 1); heli.position.y = gy(TAKEOFF.x, TAKEOFF.z) + CLIMB; H.board(); }
      heliOn(true); H.rotorTo(1, 0.5);
      const gps = W.gps;
      // the guide rings over the roofs on the straight line, and the landing ring on the riverfront
      const path = ringPath(cm);
      E.rings?.dispose(); E.rings = buildRings(W, path); let ri = 0; E.rings.on(0);
      const gL = gy(LAND.x, LAND.z), mk = K.marker(LAND.x, LAND.z, { radius: LAND.r, height: 60, y: gL, alpha: 0.2 });
      // (the look review's round 6: round 5's faint column never showed in a frame from the approach. A landing light
      // now, a warm point blinking slowly over the ring's middle, the same size on screen at any range, so the eye finds
      // the riverfront from the first ring on; it goes as he closes in, where the ring itself reads)
      const bc = landingBeacon(); bc.position.set(LAND.x, gL + 6, LAND.z); app.scene.add(bc);
      const target = () => (ri < path.length ? { x: path[ri].x, z: path[ri].z, name: story.t('The next ring') } : { x: LAND.x, z: LAND.z, name: LAND.name });
      const aim = () => { const t = target(); gps.to(t); gps.blip('dest', { x: t.x, z: t.z, kind: 'dest', edge: true, name: t.name }); };
      // (the owner's play, 15 Nov: "I think it is supposed to be on a seaport but I couldn't find it". He takes off on
      // the East River waterfront, so 'the riverfront' named where he already was, and the landing was on no map until
      // the rings were done. Now the place and the way are in the objective, and the landing is blipped, an H, on the
      // radar and the map, and tagged on the screen with its distance, from the first frame of the flight)
      ui.objective(['Fly west to ', { 'Battery Park City': 'yellow' }, ', by the Hudson. Land in the ring.']); aim();
      gps.blip('land', { x: LAND.x, z: LAND.z, kind: 'letter', letter: 'H', edge: true, label: true, name: LAND.name });
      ui.help(['Fly: [W] [S] nose down and up · [A] [D] turn · [SPACE] climb · [Q] down · [SHIFT] faster. Climb over the roofs.'], 11);
      // Jane, one short call at the controls (the car phone's rule, the owner's: Jane calls while he drives; at the
      // controls of the helicopter counts)
      K.delay(7).then(async () => {
        ui.caller('Jane', BLUE, 'On the phone');
        await K.say([
          ['Jane', BLUE, 'Dan. Are you in a helicopter?'],
          ['Dan', WHITE, "Mr. Big's helicopter."],
          ['Jane', BLUE, 'Since when can you fly?'],
          ['Dan', WHITE, 'Since forty seconds ago.'],
          ['Jane', BLUE, "Head west. Battery Park City, by the river. Nobody's there at night."],
          ['Jane', BLUE, 'Land it gently. Gently, babe.'],
          ['Dan', WHITE, 'Define gently.'],
        ]);
        ui.caller(null);
        if (!out) ui.help(['Land in the ', { 'yellow ring': 'yellow' }, ' at Battery Park City: west, on the Hudson riverfront. Follow the ', { 'LAND': 'yellow' }, ' marker.'], 8);
      }).catch(() => ui.caller(null));
      let out = false, landedIn = 0, toldRing = false, showingPav = !!K.S.pav?.shown, zoomed = false;
      // (the wrong way: the nearest he has been, and how long he has been flying away from it since)
      let nearest = Infinity, away = 0, toldWay = false;
      H.prompt(() => (flying() && H.landed && dist(heli.position, LAND.x, LAND.z) < LAND_OK ? [story.t('F  ·  Get out'), () => { out = true; }] : null));
      // (its own frame clock: dtNow is the helicopter's, stepped first each frame by heliOn's hook, so read again here it
      // gave ~0, and the 5 s set-down, the camera's ease on the approach and the wrong-way timer never ran)
      let fT = K.now();
      const off = K.hook(() => {
        const t1 = K.now(), dt = Math.min(0.05, (t1 - fT) / 1000); fT = t1;
        if (showingPav && dist(heli.position, K.PAV.x, K.PAV.z) > 600) { showingPav = false; K.showPav(false); }
        E.rings.spin(K.now() / 1000);
        // a ring passed (or flown past toward the riverfront): the next
        if (ri < path.length) {
          const r = path[ri], dh = dist(heli.position, r.x, r.z), dy = Math.abs(heli.position.y - r.y);
          const past = dist(heli.position, LAND.x, LAND.z) < dist(r, LAND.x, LAND.z) - 40;
          if ((dh < 16 && dy < 18) || past) { if (!past) sfx?.play('ding', { gain: 0.14 }); ri++; E.rings.on(ri); aim(); }
        }
        const dl = dist(heli.position, LAND.x, LAND.z);
        // (the landing ring's column of light: a guide from far off, gone as he closes on it, so the approach isn't
        // flown through a yellow wall; the ring on the ground stays. The look review's round 4, 15 Nov: still a yellow
        // beam at the bottom of the frame 140 m out; gone from 160 m now, faint from 400)
        // (round 5: from 160 m in, nothing on screen showed where to land, only the minimap: a faint beacon is kept,
        // a third of the column, down to 60 m, gone by 30 m where the ring on the ground reads on its own)
        mk.m.fade(Math.max((dl - 160) / 240, 0.5 * Math.max(0, Math.min(1, (dl - 30) / 30))));
        { const blink = 0.55 + 0.45 * Math.max(0, Math.sin(K.now() / 1000 * 3.4)) ** 2, near = Math.max(0, Math.min(1, (dl - 40) / 30)); bc.material.opacity = blink * near; bc.visible = near > 0.01;
          // (round 8's review: 136 m out, high, the ring and its beacon lay under the frame's foot behind the riverfront's
          // roofs. The beacon rides up over the ring with his height while he is still far, so it is in the frame from
          // the approach, and comes down onto the ring as he closes in)
          // (15 Nov: gone by 40 m, not 25: held over the subtitles it rose onto his own fuselage there; the pad's ring and
          // its lights read on their own that close)
          bc.position.y = gL + Math.max(6, Math.min(70, (heli.position.y - gL) * 0.55 * Math.max(0, Math.min(1, (dl - 40) / 80))));
          // (the look review's round 9: low in the frame it sat on the subtitle. Kept over the subtitles' band (the frame's
          // lower quarter): raised over the ring until it is, as far as his own height)
          const cam = app.cameraSystem?.camera;
          if (cam) for (let i = 0; i < 12; i++) { if (camSpace(bc.position, cam).z > -0.1) break; _lm.copy(bc.position).project(cam); if (_lm.y > -0.5 || bc.position.y > heli.position.y) break; bc.position.y += 8; } }
        // (the owner, 16 Nov: forgiving. Over Midtown (5.4 km out) is a wrong way, said in words and on the marker, not a
        // fail; off course only well past it)
        if (dl > 7000) fail('You flew off course.');
        // (flown away from it for 8 s, or 2 km out: once, the way back in words; again only after he has turned back)
        if (dl < nearest) nearest = dl;
        if (dl > nearest + 60 || dl > 2000) away += dt; else if (dl < nearest + 20) { away = 0; toldWay = false; }
        if (!toldWay && away > 8) { toldWay = true; ui.help(['Wrong way. ', { 'Battery Park City': 'yellow' }, ' is west, by the Hudson. Follow the ', { 'LAND': 'yellow' }, ' marker.'], 6); nearest = dl; }
        // (the look review's round 6: in the last 150 m the chase camera looks out level over the river and the ring sits
        // under the frame's foot, the objective naming a ring no frame shows. A marker on the ring through the approach:
        // on it where it is in the frame, held to the frame's edge with an arrow where it is not)
        // (15 Nov: from the first frame of the flight, not only past the rings and inside 900 m)
        landMark(!H.landed || dl > LAND_OK, dl, bc);
        // (the look review's round 8: 136 m out the chase camera looked out level over the dark river and the landing
        // ring sat under the frame's foot, only the HUD saying where. On the last approach the camera rises over him a
        // little, looking down past him to the riverfront, the ring and its beacon in the frame; his own look kept if
        // it is already higher)
        // (as steep as the ring lies under him: high over it, the camera looks well down)
        { const cs = app.cameraSystem, want = Math.min(0.68, Math.max(0.3, Math.atan2(heli.position.y - gL, Math.max(dl, 1)) - 0.12));
          const k = Math.min(1, dt * 1.4), on = cs && ri >= path.length && dl < 340 && dl > 18 && !H.landed;
          if (on && cs.orbitPitchOffset < want) cs.orbitPitchOffset += (want - cs.orbitPitchOffset) * k;
          // (and pulled back a little the higher he comes in, so the ground ahead of him is in the frame's lower half)
          const zw = on ? 1 + 0.45 * Math.min(1, Math.max(0, (want - 0.3) / 0.38)) : 1;
          if (cs && (on || zoomed) && Math.abs(cs.zoomMultiplier - zw) > 0.005 && !(cs.userOrbitTimer > 0)) { cs.zoomMultiplier += (zw - cs.zoomMultiplier) * k; zoomed = on; } }
        if (flying() && H.landed) {
          if (dl < LAND_OK) { landedIn += dt; if (landedIn > 5) out = true; }
          else if (!toldRing) {
            toldRing = true;
            // (where it is from him, near: 'The ring is 40 m north-east'; far, the place)
            if (dl < 400) ui.help([`The ring is ${far(dl)} ${compass(LAND.x - heli.position.x, LAND.z - heli.position.z)}. `, 'Lift off and set it down inside the ', { 'yellow ring': 'yellow' }, '.'], 7);
            else ui.help(['Set it down inside the ', { 'yellow ring': 'yellow' }, ' at ', { 'Battery Park City': 'yellow' }, ', west by the Hudson.'], 7);
          }
        } else { landedIn = 0; if (!H.landed) toldRing = false; }
      });
      try { await K.wait(() => out); }
      finally { off(); if (zoomed && app.cameraSystem) app.cameraSystem.zoomMultiplier = 1; landMark(false); mk.off(); app.scene.remove(bc); bc.material.map.dispose(); bc.material.dispose(); gps.unblip('dest'); gps.unblip('land'); gps.to(null); H.prompt(null); E.rings?.dispose(); E.rings = null; }
      heli.speed = 0; heli.verticalSpeed = 0; cm.resetInput?.();
    },
    // beat 10c: out on the riverfront, the rotors winding down; LATER · 11:40 PM, the light to midnight
    async landing() {
      // (started here, ?m4=landing, the light was the city's day: night already, as the flight leaves it)
      await K.sets(); sets(); K.light('midnight'); riverQuiet(); E.pad.show(true);
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      ui.caller(null); ui.sub(null);
      // (started here, ?m4=landing, the helicopter is still wherever the city had it: set down in the ring first, so
      // he steps out on the riverfront and not in Midtown)
      if (dist(heli.position, LAND.x, LAND.z) > LAND.r * 3) H.park(LAND.x, LAND.z, PI * 0.55, 1);
      if (!H.landed) heli.position.y = gy(heli.position.x, heli.position.z);
      heliOn(true); H.rotorTo(0, 7);
      const p = H.out(1);
      await K.scene(landingScene(W, { say: K.say, H, from: p, pav: K.S.pav }));
      W.cutscene = true; ui.cine(true);
      await ui.fade(1, 0.6);
      H.rotorTo(0, 0.01); H.quiet(); E.pad.show(false);
      K.light('midnight');
      K.showPav(false); riverQuiet();
      ui.caption('LATER · 11:40 PM', 'Battery Park City', '#FFC93C', 2.6);
      // (a few steps on toward the esplanade, so the follow camera behind him starts clear of the helicopter)
      { const q = clear(p); place(W, { dan: [q.x, q.z, q.h] }); }
      E.landing.show(true); ferryRun(true);
      await K.gsleep(1800);
      ui.fade(0, 0.8); ui.cine(false); W.cutscene = false;
    },
    // beat 10d: the esplanade walk to the last ferry, against its clock
    async ferry(fresh) {
      await K.sets(); sets(); K.light('midnight');
      if (fresh) { H.park(LAND.x, LAND.z, HEAD, 0); const q = clear(H.out(1)); place(W, { dan: [q.x, q.z, q.h] }); }
      K.showPav(false); riverQuiet();
      E.landing.show(true); ferryRun(true);
      const gps = W.gps, mk = K.marker(GATE.x, GATE.z, { radius: 2.4 }), t0 = K.now();
      // (the route along the river, point to point: the walking route through the streets would take him inland)
      objective(['Catch the ', { 'last ferry': 'yellow' }, '.'], { follow: along(ESPLANADE.slice(1)), name: GATE.name });
      gps.blip('gate', { x: GATE.x, z: GATE.z, kind: 'dest', edge: true, name: GATE.name });
      ui.help(['The ', { 'last ferry': 'yellow' }, ' leaves at 11:45. Walk the esplanade along the river to the landing at Vesey St. Hold [SHIFT] to run.'], 8);
      const off = K.hook(() => {
        const left = FERRY_SECS - (K.now() - t0) / 1000;
        ui.counter('FERRY', `${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, Math.ceil(left)) % 60).padStart(2, '0')}`);
        if (left <= 0) fail('You missed the last ferry.');
      });
      try { await K.wait(() => cm.activeMode === 'person' && dist(P.position, GATE.x, GATE.z) < 2.8); }
      finally { off(); mk.off(); ui.counter(null); gps.unblip('gate'); gps.clear(); }
    },
    // beat 10e: down the gangway and aboard; the ferry pulls away from Manhattan
    async boarding() {
      await K.sets(); sets(); K.light('midnight'); riverQuiet();
      E.landing.show(true); if (!E.ferry.group.visible) ferryRun(true);
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      await ui.fade(1, 0.35);
      const def = boardingScene(W, { say: K.say, ferry: E.ferry, landing: E.landing, onFerry, danOnDeck, go: () => { fgo = true; }, sfx, C: await getCast(W), pav: K.S.pav });
      // (into the call under a black: the camera's release would go back to the car, at the Seaport)
      const clean = def.cleanup; def.cleanup = (st) => { clean?.(st); ui.fade(1, 0.05); };
      await K.scene(def, { fadeIn: true });
      fgo = true;
    },
    // beat 11: the hostage call on the stern deck at midnight, the skyline behind him
    async call(fresh) {
      await K.sets(); sets(); K.light('midnight');
      K.showPav(false); E.landing.show(true);
      if (fresh || !E.ferry.group.visible) ferryRun(true, { from: 260, go: true, v: 7 }); else { fgo = true; if (fs < 200) { fs = 260; fv = 7; } }
      onFerry(true); danOnDeck();
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      const C = await getCast(W);
      const def = callScene(W, { say: K.say, ferry: E.ferry, danOnDeck, C, hud: E.hud, ui, sfx, stats: K.stats, pav: K.S.pav });
      // (the scene ends under a black, the end card in it: the camera's release would go back to the car at the Seaport)
      const clean = def.cleanup; def.cleanup = (st) => { clean?.(st); ui.fade(1, 0.05); };
      try { await K.scene(def, { fadeIn: true }); }
      finally { ui.caller(null); C.boss?.full(null); C.boss?.phone(false); }
      ui.cine(false); W.cutscene = false;
    },
  };

  function teardown() {
    app.highwayTraffic?.hold?.([]); farDim(false);
    ferryHook?.(); ferryHook = null; heliOn(false);
    app.trafficSystem?.hold?.([]);
    E.landing?.show(false); E.ferry?.show(false); E.pad?.show(false); E.wake?.reset(); E.rings?.dispose(); E.rings = null;
    // (quit off the ferry: on foot at the landing, not standing in the river)
    if (aboard) { onFerry(false); place(W, { dan: [GATE.x + 2, GATE.z - 2, PI] }); }
    H.give();
  }
  return { ...R0, teardown, reach, onFerry, sets, get aboard() { return aboard; } };
}

/* ------------------------------------------------------------ the rings -- */
// the guide rings on the straight line from the take-off to the riverfront, each 35 m over the tallest roof within 45 m
// of it (90..175 m: under the flight's ceiling, 190), facing along the way
export function ringPath(cm) {
  const top = (x, z, r) => { let m = 0; for (const c of cm.nearColliders(x, z, r + 1)) if (x + r >= c.minX && x - r <= c.maxX && z + r >= c.minZ && z - r <= c.maxZ) m = Math.max(m, c.maxY || 0); return m; };
  return [0.24, 0.5, 0.76].map((k) => {
    const x = TAKEOFF.x + (LAND.x - TAKEOFF.x) * k, z = TAKEOFF.z + (LAND.z - TAKEOFF.z) * k;
    return { x, z, y: clamp(top(x, z, 45) + 35, 90, 175), h: HEAD };
  });
}

/* ---------------------------------------------------------- the scenes -- */
// beat 10a: Dan in at the controls; Knox reaches the plaza as the skids lift, his Suits behind him; Mr. Big on the
// phone from his office: "That is my helicopter." The climb to CLIMB m, turning west, then the controls are his
function takeoffScene(W, { say, H, knox, sfx, ui, pav = null }) {
  const heli = H.entity, cm = W.app.controllerManager, T = TAKEOFF, y0 = cm.getGroundHeight(T.x, T.z, 'person');
  const LINES = [
    ['Knox', ACID, "He's going for the chopper!"],
    ['Dan', WHITE, 'Okay. Up is up. Probably.'],
    ['Mr. Big', ACID, 'That is my helicopter.'],
    ['Dan', WHITE, 'Seatbelt.'],
    ['Mr. Big', ACID, 'Rook. Hold the truck.'],
  ];
  const lift = (t) => smooth((t - 1.6) / 7.5);
  const y = (t) => y0 + CLIMB * lift(t) * (0.4 + 0.6 * lift(t));
  // (the street's mouth, where Knox comes running out of it, and the plaza's far side for the wide)
  const K0 = { x: 905, z: 5524 }, K1 = { x: 914, z: 5536 };
  // (the look review's rounds 6-8: the plaza's tree, near the wide's lens, a lime-green crown filling the frame's left
  // third under the night. From further along the plaza now, the tree a small dark crown at mid-distance, the
  // helicopter larger)
  const wide = { x: T.x - 4, z: T.z + 15 };
  const turn = (t) => HEAD + 0.5 * (1 - smooth((t - 3) / 6));
  return talk(W, {
    say, lines: LINES, minEnd: 10.5, tail: 0.4,
    shots: [
      { line: 0, cam: (t) => ({ pos: [wide.x, y0 + 1.5, wide.z], look: [T.x - 1, y(t) + 1.9, T.z - 1], fov: 46, shake: 0.5 }) },
      { line: 2, cam: (t) => ({ pos: [K1.x + 2, y0 + 1.6, K1.z - 3], look: [T.x, y(t) + 1.2, T.z], fov: 40, shake: 0.6 }) },
      // (round 3, 15 Nov: from over it, it sat on a flat wall with no sky. From under it now, looking up past it: the rotor
      // against the evening sky)
      { line: 3, cam: (t) => { const s = Math.sin(turn(t)), c = Math.cos(turn(t)); return { pos: [T.x - s * 12 + c * 5, y(t) - 4.5, T.z - c * 12 - s * 5], look: [T.x, y(t) + 2.6, T.z], fov: 50, shake: 0.4 }; } },
    ],
    cues: [
      [0.1, () => { ui.place('The Seaport · South St', 'Lower Manhattan · New York', 3); H.rotorTo(1, 2.2); }],
      // (Mr. Big on the phone from his office, the caller card; his calls Rook in, never the police)
      [3.0, () => ui.caller('Mr. Big', ACID, 'On the phone · his office')],
    ],
    setup() {
      const P = W.person; P.mesh.visible = false;
      heli.position.set(T.x, y0, T.z); heli.heading = turn(0); heli.speed = 0; heli.verticalSpeed = 0;
      heli.mesh.position.copy(heli.position); heli.mesh.rotation.y = heli.heading;
      if (knox) stand(W, knox, K0.x, K0.z, Math.atan2(T.x - K0.x, T.z - K0.z), W.cast?.SUITS?.run?.[0]);
    },
    pose(t, dt) {
      heli.position.set(T.x, y(t), T.z); heli.heading = turn(t); heli.speed = 0; heli.verticalSpeed = 0;
      heli.mesh.position.copy(heli.position); heli.mesh.rotation.y = heli.heading;
      heli.tiltPivot.rotation.set(0.05 * lift(t), 0, 0.06 * Math.sin(t * 0.8) * lift(t));
      H.step(dt);
      // (the look review's round 8: from under it, against the sky, it was a black cut-out, its gunmetal unseen. Its
      // landing light on under the belly, a pavilion lamp lent: the belly and the skids lit warm, a pool on the plaza)
      pav?.key({ x: T.x, y: y(t) - 2.6, z: T.z, color: '#FFE4C4', k: 34, dist: 18, on: true });
      H.belly(0.9 * smooth(t / 1.5));
      // (Knox runs out of the street to the plaza's edge and stops short of the downwash)
      if (knox) { const k = smooth((t - 0.2) / 2.4); knox.root.position.set(K0.x + (K1.x - K0.x) * k, cm.getGroundHeight(K1.x, K1.z, 'person'), K0.z + (K1.z - K0.z) * k); knox.rig.pose(t); }
    },
    cleanup() {
      pav?.key(null); H.belly(0);
      // (in the air at CLIMB m, facing west, a little way on: the controls are his)
      heli.position.set(T.x, y0 + CLIMB, T.z); heli.heading = HEAD; heli.speed = 6; heli.verticalSpeed = 0;
      heli.mesh.position.copy(heli.position); heli.mesh.rotation.y = HEAD; heli.tiltPivot.rotation.set(0, 0, 0);
      sfx?.play?.('whoosh', { gain: 0.1 });
    },
  });
}

// beat 10c: down on the riverfront, out of the helicopter in the waiter's jacket, a pat of the pocket with the key
function landingScene(W, { say, H, from, pav = null }) {
  const heli = H.entity, cm = W.app.controllerManager, L = heli.position.clone(), y = cm.getGroundHeight(L.x, L.z, 'person');
  const LINES = [
    ['Dan', WHITE, 'Nobody lands in Battery Park City at night. Perfect.'],
    ['Dan', WHITE, 'Key. Still here. Good.'],
  ];
  const h = heli.heading, s = Math.sin(h), c = Math.cos(h);
  let ps = null, keyT = -1, fob = null;
  // (the look review's round 6: "Key. Still here." and no key. The signing key's fob out of his pocket for the line,
  // held up in his right hand at his chest: a black slab with a gilt edge and a small lit face)
  const makeFob = () => {
    const g = new THREE.Group(); g.name = 'm4-signing-key';
    // (round 7: a black slab on his black shirt did not read. A polished gilt body now, a little larger, its lit face
    // brighter and wider, and a glow round it)
    // (round 8: still a small dark brown card in the riverfront's dark, its lit face unseen. Larger again, the gilt lit
    // from within so it reads gold with no lamp on it, and its lit face wider)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.122, 0.017), new THREE.MeshStandardMaterial({ color: '#E2BC66', roughness: 0.2, metalness: 0.75, emissive: new THREE.Color('#8A6420'), emissiveIntensity: 1 }));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.127, 0.009), new THREE.MeshStandardMaterial({ color: '#15171C', roughness: 0.3, metalness: 0.5 }));
    // (its lit face both sides: he looks at it, the lens sees its back)
    const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.2, 1.8), side: THREE.DoubleSide });
    for (const z of [0.0088, -0.0088]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.054, 0.042), lit); f.position.set(0, 0.02, z); g.add(f); }
    g.add(edge, body); W.app.scene.add(g); return g;
  };
  // (the look review's round 3, 15 Nov: his close-up underlit, his arms hanging stiff. A warm key from the riverfront's
  // lamps on the camera's side, high, a lamp of the pavilion's lent; his hands with his words)
  const def = talk(W, {
    say, lines: LINES, minEnd: 6.5,
    shots: [
      { line: 0, pos: [L.x + s * 15 + c * 9, y + 2.2, L.z + c * 15 - s * 9], look: [L.x, y + 1.5, L.z], fov: 40 },
      // (round 7: pushed in on him and the key, waist up)
      // (round 8: his head under the letterbox's top bar: back a step and lower, headroom over him, the key at his chest)
      { line: 1, pos: [from.x + c * 2.3 + s * 1.25, y + 1.45, from.z - s * 2.3 + c * 1.25], look: [from.x, y + 1.42, from.z], fov: 34 },
    ],
    // (round 7: the talk clip's arms over the hold folded his arm across his chest and left the other hand in mid-air;
    // he stands easy for it now, the key held out at chest height to his right)
    onLine(who, i) { const now = W.sceneClock?.t ?? 0; if (i === 1) keyT = now; },
    setup() {
      fob = makeFob(); fob.visible = false;
      const P = W.person; P.position.set(from.x, cm.getGroundHeight(from.x, from.z, 'person'), from.z); P.heading = h + PI / 2; P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading; P.mesh.visible = true;
      W.cast?.qRig.set([[0, 'idle']]);
      pav?.key({ x: from.x + c * 1.9 + s * 1.6, y: y + 2.6, z: from.z - s * 1.9 + c * 1.6, color: '#FFD8B0', k: 7, dist: 7 });
    },
    cleanup() { pav?.key(null); if (fob) { W.app.scene.remove(fob); fob.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); fob = null; } releasePhone(W); },
    pose(t, dt, C) {
      H.step(dt); if (C) { ps = ps || poser(W, C); ps.pose(t, W.person.heading); }
      if (fob && keyT >= 0) { const k = smooth((t - keyT - 0.15) / 0.55); holdPhone(W, fob, W.person.heading, k, { fwd: 0.36, down: 0.34, side: 0.12 }); }
    },
  });
  def.hero = true;
  return def;
}

// beat 10e: down the gangway, across the gap, aboard; the ferry pulls away from Manhattan (its motion: the escape's
// ferryRun). (The deckhand's "Cutting it close." waits on a cast entry for him in the story pack: no speaker yet)
function boardingScene(W, { say, ferry, landing, onFerry, danOnDeck, go, sfx, C, pav = null }) {
  const LINES = [
    ['Dan', WHITE, 'Last ferry. Made it.'],
    ['Dan', WHITE, 'Story of my week.'],
  ];
  // his way aboard, in the landing's frame (x along the shore, y the world's, z out over the water): down the covered
  // gangway, along the float to the ferry's side, the hop across; then up its deck to the stern rail
  const WAY = [[0, GANGWAY.y1, 1.5], [0, GANGWAY.y1, GANGWAY.z1], [0, GANGWAY.y2 + 0.03, GANGWAY.z2], [-2.4, -0.92, 21.5], [-4.6, -0.92, 23]];
  const SEG = WAY.slice(1).map((q, i) => Math.hypot(q[0] - WAY[i][0], q[2] - WAY[i][2])), LEN = SEG.reduce((a, b) => a + b, 0), WALK = 1.45;
  const T_HOP = LEN / WALK, T_DECK = T_HOP + 0.5, T_RAIL = T_DECK + 2.6;
  const onWay = (d) => { for (let i = 0; i < SEG.length; i++) { if (d <= SEG[i] || i === SEG.length - 1) { const k = Math.min(1, d / SEG[i]), a = WAY[i], b = WAY[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, Math.atan2(b[0] - a[0], b[2] - a[2])]; } d -= SEG[i]; } return WAY[WAY.length - 1]; };
  let ps = null;
  const put = (p, h) => { const P = W.person; P.position.copy(p); P.heading = h; P.mesh.position.copy(p); P.mesh.rotation.y = h; P.mesh.visible = true; return h; };
  const _p = new THREE.Vector3(), _d = new THREE.Vector3();
  const def = talk(W, {
    say, lines: LINES, minEnd: T_RAIL + 5, lead: T_DECK + 0.6,
    shots: [
      // (beside the gangway over the esplanade, keeping pace with him under its lit canopy, the float's lamps, the river
      // and the ferry's lit side ahead. The look review's round 2, 15 Nov: over his shoulder, the gate's posts and the
      // canopy's underside blacked out a third of the frame)
      { line: -1, cam: () => {
        const d = landing.group.worldToLocal(_d.copy(W.person.position));
        // (round 3: from 2.75 m out and 2.2 m over the boards, so the near rail runs under his hands, not through them)
        const p = landing.world(2.75, GANGWAY.y1 + 2.2, Math.min(d.z - 3.0, 11.5)), l = landing.world(-1.4, d.y + 0.95, d.z + 3.4);
        return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: 48, shake: 0.3 };
      } },
      // (pulling away: from the float's end, the stern going, Dan at its rail)
      // (round 6: from the float's very end a gangway post filled the frame's left edge and the stern rail ran through
      // the lens: from further back up the float now, the whole stern square on, Dan at its rail, the skyline past it)
      { line: 0, cam: (t) => { const p = landing.world(-5.4, 0.9, 18.5), l = ferry.world(0, 1.4, -13); return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: 38, shake: 0.3 }; } },
    ],
    cues: [
      [T_HOP, () => sfx?.play?.('thunk', { gain: 0.12, f: 260, ring: false })],
      [T_DECK + 0.4, () => go()],
    ],
    setup() {
      onFerry(true);
      C?.qRig.set([[0, 'walk', { speed: 0.85 }], [T_HOP, 'idle', { fade: 0.2 }], [T_DECK, 'walk', { speed: 0.8, fade: 0.2 }], [T_RAIL, 'idle', { fade: 0.4 }]]);
    },
    pose(t) {
      let h;
      if (t < T_HOP) { const [x, y, z, a] = onWay(t * WALK); h = put(landing.world(x, y, z, _p), landing.group.rotation.y + a); }
      else if (t < T_DECK) { const k = (t - T_HOP) / (T_DECK - T_HOP), a = landing.world(-4.6, -0.92, 23, _p).clone(), b = ferry.world(3.6, 0, -10.5); a.lerp(b, k); a.y += Math.sin(k * PI) * 0.35; h = put(a, ferry.group.rotation.y - PI / 2); }
      else if (t < T_RAIL) { const k = (t - T_DECK) / (T_RAIL - T_DECK); h = danOnDeck(3.6 - 3.1 * k, -10.5 - 4.9 * k, PI - 0.6 * (1 - k)); }
      else h = danOnDeck(0.5, -15.4, PI);
      if (C) { ps = ps || poser(W, C); ps.pose(t, h); }
      // (aboard, the stern lamp's warm light on him and its deck, as in the call: the round 3 review saw the deck a
      // flat daylight lavender)
      if (pav && t >= T_HOP) { const k = ferry.world(-0.6, 2.2, -12.9, _kp); pav.key({ x: k.x, y: k.y, z: k.z, color: '#FFD3A0', k: 4.2, dist: 7 }); }
    },
    cleanup() { pav?.key(null); },
  });
  def.exposure = 1.3; // (midnight on the river: the float's lamps are paint, not lights; the night's own lift under it)
  return def;
}

// beat 11, midnight on the open stern deck, the lit downtown skyline and the wake behind him: Mr. Big on video from his
// office (full-frame inserts of his study, never in person); a tone pick (both end the same); Rook patched in; the
// shredder winds down over the phone
const PHONE_UP = { fwd: 0.4, down: 0.13, side: 0.15 }, _kp = new THREE.Vector3();
function callScene(W, { say, ferry, danOnDeck, C, hud, ui, sfx, stats, pav = null }) {
  const boss = C.boss, zr = (dx, dy, dz) => (boss ? [boss.eye.x + dx, boss.eye.y + dy, boss.eye.z + dz] : [0, 0, 0]);
  const OPEN = [
    ['Dan', WHITE, 'You have my laptop. I have your key.'],
    ['Mr. Big', ACID, "Daniel. You're on a boat."],
    ['Dan', WHITE, 'One thing goes in the shredder at dawn. Wonder which.'],
    ['Mr. Big', ACID, 'That key signs everything I own.'],
  ];
  // (the tone pick: two ways to say it, the same end)
  const TONE = [
    [['Dan', WHITE, "Then you'd better be nice to it."], ['Mr. Big', ACID, 'I am always nice. Ask my lawyers.']],
    [['Dan', WHITE, 'Then say please.'], ['Mr. Big', ACID, 'I have never said please in my life.']],
  ];
  const CLOSE = [
    ['Dan', WHITE, 'Then the truck turns around. Now.'],
    ['Mr. Big', ACID, 'Rook. Turn it around.'],
    ['Rook', BLUE, '...Turning around, sir.'],
    ['Dan', WHITE, 'I heard that.'],
    ['Mr. Big', ACID, "We'll trade. Somewhere public."],
    ['Mr. Big', ACID, 'Enjoy the ferry, Daniel.'],
    ['Dan', WHITE, "It's Dan."],
  ];
  // the shots: on the deck (Dan at the rail, the skyline behind), and his study (full frame) on his lines
  const deck = (lx, ly, lz, tx = 0.4, ty = 1.5, tz = -15.6, fov = 34) => () => { const p = ferry.world(lx, ly, lz), l = ferry.world(tx, ty, tz); return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov, shake: 0.3 }; };
  const SHOT = {
    deckWide: deck(1.6, 1.8, -10.6, 0.4, 1.45, -16.8, 40),
    // (round 3: from his left, the phone held out on his right in view beside his face, not over it)
    deckClose: deck(1.5, 1.68, -13.0, 0.35, 1.58, -15.6, 30),
    // (round 3, 15 Nov: from ahead of it the wake was hidden behind it. Now from the water astern, held where it was as
    // the call ended: the ferry going, its wake drawn out toward us, the far shore's lights ahead of it)
    // (round 4: from astern it sailed toward the far shore's towers, so it read as heading into a city, not leaving one.
    // Now from off its port bow and above (the ferry on the frame's right, clear of the card), carried with it, looking back down its length: the ferry in the near
    // third, its wake's V drawn out behind it on the water, and Manhattan's lights behind that, falling away as it goes)
    away: (t) => { const p = ferry.world(-23, 10, 40 + Math.min(6, (t - (awayAt || t)) * 0.6)), l = ferry.world(3, 3.5, -30); if (awayAt == null) awayAt = t; return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: 40, shake: 0.12 }; },
    outside: (t) => { const p = ferry.world(15 + t * 0.12, 7, 26), l = ferry.world(0, 1.2, -16); return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: 40, shake: 0.3 }; },
  };
  const BOSS = [
    { pos: zr(0.3, -0.04, 1.9), look: zr(0, -0.17, -0.05), fov: 34 },
    { pos: zr(-0.28, 0.0, 1.55), look: zr(0, -0.19, 0), fov: 34 },
    { pos: zr(0.16, -0.02, 1.3), look: zr(0, -0.17, 0), fov: 36 },
  ];
  let awayAt = null, cam = SHOT.deckWide, bossShot = null, bossN = 0, phoneK = 0, ps = null, picking = false, phoneDown = false;
  // (a wait on the scene's own clock: held by the pause, cut short by a skip)
  const sceneWait = (st, secs) => new Promise((r) => { const t0 = W.sceneClock?.t ?? 0; const f = () => { if (st.dead || !W.sceneClock || W.sceneClock.t - t0 >= secs) r(); else requestAnimationFrame(f); }; f(); });
  const def = {
    END: Infinity, hero: true, exposure: 1.3,
    shots: [{ t: 0, cam: (t) => cam(t) }],
    cues: [
      [0.2, () => { ui.caller('Mr. Big', ACID, 'Video call · his office'); sfx?.play?.('ring', { gain: 0.16 }); }],
      [0.9, async (st) => {
        const line = (who, i, list) => {
          // (his lines in his study, full frame; Dan's on the deck, close; Rook's over the line: the deck, wide)
          if (who === 'Mr. Big') { bossShot = BOSS[bossN++ % BOSS.length]; }
          else { bossShot = null; cam = who === 'Rook' ? SHOT.deckWide : (list === CLOSE && i >= 5 ? SHOT.outside : SHOT.deckClose); }
          if (who === 'Mr. Big' && list === CLOSE && i === 1) sfx?.play?.('shred', { dur: 3.2 });
          if (who === 'Rook') sfx?.play?.('shred', { dur: 3.4, down: true, gain: 0.24 });
        };
        try {
          await say(OPEN, st, (who, i) => line(who, i, OPEN));
          if (st.dead) return;
          // the tone pick (8 s; no answer: the first)
          bossShot = null; cam = SHOT.deckClose; picking = true;
          const pick = await hud.choice({ prompt: story.t('Say it how?'), who: 'Dan', color: '#FFFFFF', options: [{ text: story.t("Cool: be nice to it.") }, { text: story.t('Cocky: say please.') }], secs: 8 });
          picking = false; stats.tone = pick === 1 ? 'cocky' : 'cool';
          if (st.dead) return;
          const tone = TONE[pick === 1 ? 1 : 0];
          await say(tone, st, (who, i) => line(who, i, tone));
          if (st.dead) return;
          await say(CLOSE, st, (who, i) => line(who, i, CLOSE));
          if (st.dead) return;
          // the call ends; the end card over the water, the ferry going, the Suits' chat; then black
          sfx?.play?.('hangup', { gain: 0.12 }); ui.caller(null); bossShot = null; cam = SHOT.away; phoneDown = true;
          await sceneWait(st, 1.2);
          ui.caption(story.t('HE HEARD IT STOP.'), story.t("The laptop's still out there."), '#FFFFFF', 4.2);
          await sceneWait(st, 2.8);
          ui.dm?.('Suits', "Laptop comes off Rook's truck. Vault truck. Stock exchange.", 6);
          await sceneWait(st, 3.0);
          ui.fade(1, 0.8); await sceneWait(st, 0.9);
        } finally {
          bossShot = null; cam = SHOT.away;
          const now = W.sceneClock?.t; if (now != null) def.END = now + 0.05;
        }
      }],
    ],
    pose(t, dt) {
      const h = danOnDeck(0.4, -15.6, 0);
      ps = ps || poser(W, C); ps.pose(t, h);
      // (his phone up to his face for the video call)
      phoneK = phoneDown ? Math.max(0, phoneK - (dt || 0) * 1.6) : Math.min(1, phoneK + (dt || 0) * 1.6);
      // (held up and out at his chin for the video call, not low at his chest: the round 3 review read that as a fist to
      // his collarbone)
      holdPhone(W, C.phone, h, phoneK, PHONE_UP); if (C.phone.visible) C.phone.show?.(phoneDown ? 'off' : 'video', t);
      // (the stern lamp's warm light on him and the deck, carried with the ferry: a lamp of the pavilion's lent)
      if (pav) { const k = ferry.world(-0.6, 2.2, -12.9, _kp); pav.key({ x: k.x, y: k.y, z: k.z, color: '#FFD3A0', k: 4.2, dist: 7 }); }
      if (boss) {
        boss.full(bossShot ? { ...bossShot, fov: W.app.cameraSystem.portK?.() ? bossShot.fov * 1.5 : bossShot.fov } : null);
        boss.phone(!bossShot && phoneK > 0.6);
        boss.pose(t, { lean: 0.15 * Math.sin(t * 0.4), tilt: 0.05 * Math.sin(t * 0.7), point: bossShot === BOSS[1] ? 1 : 0, puff: 0 });
      }
    },
    // (his free left arm stays down by his side: the talk clip's gesture read, in the close-up, as a hand clawed open
    // by the phone; the look review's round 2, 15 Nov)
    setup() { C.qRig.set([[0, 'idle']]); },
    cleanup(st) {
      // (skipped while he was choosing: the first, as no answer is)
      if (picking) document.querySelector('#wg .sr-choice.on button')?.click();
      C.phone.visible = false; releasePhone(W); boss?.full(null); boss?.phone(false); ui.caller(null); pav?.key(null);
      if (st?.skipped) stats.tone = stats.tone || 'cool';
    },
  };
  return def;
}

/* ------------------------------------------------------------ the pilot -- */
// the escape's test drive (?m4=...&autopilot=1): what a player does in each phase, through the controls' touch input
export function pilot(W) {
  const app = W.app, cm = app.controllerManager, P = W.person, heli = cm.entities.helicopter, log = [];
  const note = (what) => { log.push({ t: +(performance.now() / 1000).toFixed(1), phase: W.mission?.phase, what }); console.info('[m4 pilot]', what); };
  const set = (k, v) => cm.setTouchInput(k, v);
  const release = () => { for (const k of ['forward', 'backward', 'left', 'right', 'up', 'down', 'boost']) set(k, 0); };
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const press = (code) => { const e = new KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), bubbles: true }); e.wgPad = true; dispatchEvent(e); dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); };
  const top = (x, z, r) => { let m = 0; for (const c of cm.nearColliders(x, z, r + 1)) if (x + r >= c.minX && x - r <= c.maxX && z + r >= c.minZ && z - r <= c.maxZ) m = Math.max(m, c.maxY || 0); return m; };
  let last = performance.now(), on = true, pressT = 0, phaseWas = null, phaseT = 0;
  // (a straight walk tried ahead of time: how close it gets, past the colliders, the way the walk below would)
  const tryLine = (x0, z0, x1, z1) => { const p = { x: x0, y: P.position.y, z: z0 }; for (let i = 0; i < 160; i++) { const dx = x1 - p.x, dz = z1 - p.z, d = Math.hypot(dx, dz); if (d < 0.06) break; p.x += dx / d * 0.06; p.z += dz / d * 0.06; cm.resolveHorizontalCollision(p, 0.48, p.y + 1.0); } return Math.hypot(x1 - p.x, z1 - p.z); };
  // (round a rope post or a table to a spot: a waypoint on a ring round it that he can walk to, and on from)
  let via = null, viaFor = null;
  function approach(g, dt, sp) {
    if (viaFor !== g) { via = null; viaFor = g; }
    if (!via && tryLine(P.position.x, P.position.z, g.x, g.z) > 0.5) {
      let best = null;
      for (let r = 1.6; r <= 4 && !best; r += 1.2) for (let a = 0; a < 24; a++) {
        const t = a / 24 * 2 * PI, x = g.x + Math.sin(t) * r, z = g.z + Math.cos(t) * r;
        if (tryLine(x, z, g.x, g.z) > 0.3 || tryLine(P.position.x, P.position.z, x, z) > 0.4) continue;
        const c = Math.hypot(x - P.position.x, z - P.position.z); if (!best || c < best.c) best = { x, z, c };
      }
      via = best || null; if (via) note('round to the spot');
    }
    if (via && Math.hypot(via.x - P.position.x, via.z - P.position.z) < 0.4) via = { done: true };
    if (via && !via.done) walk(via.x, via.z, dt, sp); else walk(g.x, g.z, dt, sp);
  }
  let stuckT = 0, side = 1;
  function walk(x, z, dt, sp = 7) {
    const want = Math.atan2(x - P.position.x, z - P.position.z), err = wrapA(want - P.heading);
    P.heading += clamp(err, -6 * dt, 6 * dt);
    const x0 = P.position.x, z0 = P.position.z;
    P.position.x += Math.sin(P.heading) * sp * dt; P.position.z += Math.cos(P.heading) * sp * dt;
    cm.resolveHorizontalCollision(P.position, 0.48, P.position.y + 1.0);
    // (held against something, a bench, a planter: a step to the side, as a player would)
    if (Math.hypot(P.position.x - x0, P.position.z - z0) < sp * dt * 0.2) stuckT += dt; else stuckT = 0;
    if (stuckT > 1.2) {
      // (in small steps, each pushed out of what it meets, so a step aside never passes through a thin wall)
      stuckT = 0; side = -side; const sx = Math.cos(P.heading) * side, sz = -Math.sin(P.heading) * side;
      for (let i = 0; i < 20; i++) { P.position.x += sx * 0.06; P.position.z += sz * 0.06; cm.resolveHorizontalCollision(P.position, 0.48, P.position.y + 1.0); }
      note('stuck: a step aside'); via = null; viaFor = null;
    }
    P.position.y = cm.getGroundHeight(P.position.x, P.position.z, 'person'); P.speed = sp;
  }
  function fly(dt) {
    const tgt = W.gps?.dest ? (W.gps.dest.follow ? W.gps.dest.follow() : W.gps.dest) : null; if (!tgt) { release(); return; }
    const x = heli.position.x, z = heli.position.z, d = Math.hypot(tgt.x - x, tgt.z - z), landing = Math.hypot(tgt.x - LAND.x, tgt.z - LAND.z) < 1;
    const want = Math.atan2(tgt.x - x, tgt.z - z), err = d < 3.5 ? 0 : wrapA(want - heli.heading);
    set('left', err > 0.05 ? clamp(err * 2) : 0); set('right', err < -0.05 ? clamp(-err * 2) : 0);
    // (the height to hold: over the roofs ahead, or the ring's; at the landing ring, down)
    const ahead = Math.max(top(x + Math.sin(heli.heading) * 30, z + Math.cos(heli.heading) * 30, 14), top(x, z, 12));
    let hy = Math.max(ahead + 18, 60);
    const ring = (W._m4esc?.rings && ringPath(cm)) || null;
    if (!landing && ring) { const r = ring.find((q) => Math.hypot(q.x - tgt.x, q.z - tgt.z) < 1); if (r) hy = Math.max(hy, r.y); }
    let vmax = 30;
    // (at the ring: only what stands under the rotor counts, not the roofs past it)
    if (landing) { vmax = d > 220 ? 30 : d > 60 ? 14 : d > 12 ? 6 : d > 3.5 ? 2.5 : 0; if (d < 70) hy = d < 3.5 ? -5 : d < 12 ? top(x, z, 7) + 3 : Math.max(top(x, z, 7) + 6, 8 + d * 0.2); }
    const ahead2 = landing && d < 70 ? top(x, z, 7) : ahead;
    const dy = hy - heli.position.y;
    set('up', dy > 1 ? clamp(dy / 8) : 0); set('down', dy < -1 ? clamp(-dy / 8) : 0);
    const v = heli.speed || 0, climbFirst = ahead2 > heli.position.y - 6;
    set('forward', !climbFirst && Math.abs(err) < 0.6 && v < vmax ? 0.9 : 0); set('backward', v > vmax + 2 || climbFirst && v > 2 ? 0.8 : 0);
    set('boost', 0);
  }
  // (the heist's half, so ?m4=bench&autopilot=1 plays the whole mission: the drive, the marks, the case)
  const car = W.car;
  let fDown = false;
  const holdF = (v) => { if (v === fDown) return; fDown = v; dispatchEvent(new KeyboardEvent(v ? 'keydown' : 'keyup', { code: 'KeyF', key: 'f', bubbles: true })); };
  let driveAt = null, driveStuck = 0;
  function drive(dt) {
    const r = W.gps?.route; if (!r || r.length < 2) return;
    // (the route's own line followed: the nearest point on it, then 4 m on along it, so corners are taken as drawn;
    // moved toward at 22 m/s, the car turned to it)
    const cx = car.position.x, cz = car.position.z; let bi = 0, bt = 0, bd = Infinity;
    for (let i = 0; i < r.length - 1; i++) {
      const ax = r[i][0], az = r[i][1], ex = r[i + 1][0] - ax, ez = r[i + 1][1] - az, L2 = ex * ex + ez * ez || 1;
      const t = clamp(((cx - ax) * ex + (cz - az) * ez) / L2), d = Math.hypot(ax + ex * t - cx, az + ez * t - cz);
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    const ahead = (left) => {
      for (let i = bi; i < r.length - 1; i++) {
        const ax = r[i][0], az = r[i][1], ex = r[i + 1][0] - ax, ez = r[i + 1][1] - az, L = Math.hypot(ex, ez) || 1, from = i === bi ? bt * L : 0;
        if (L - from >= left) { const k = (from + left) / L; return [ax + ex * k, az + ez * k]; }
        left -= L - from;
      }
      return r[r.length - 1];
    };
    let tgt = ahead(4);
    // (a corner cut into the sidewalk's railing held him there, pushed back each frame, minutes at a time: held for a
    // second, the car is put on along the route's own line, 10 m on, as a driver would back off and take it wide)
    if (driveAt && Math.hypot(cx - driveAt[0], cz - driveAt[1]) < 22 * dt * 0.2) driveStuck += dt; else driveStuck = 0;
    driveAt = [cx, cz];
    if (driveStuck > 1.0) {
      driveStuck = 0; const q = ahead(10); car.position.x = q[0]; car.position.z = q[1]; note('drive: on past a corner'); tgt = ahead(14);
    }
    const dx = tgt[0] - car.position.x, dz = tgt[1] - car.position.z, d = Math.hypot(dx, dz); if (d < 0.5) { car.speed = 0; return; }
    const step = Math.min(d, 22 * dt);
    car.position.x += dx / d * step; car.position.z += dz / d * step;
    car.position.y = cm.getGroundHeight(car.position.x, car.position.z, 'car');
    car.heading = Math.atan2(dx, dz); car.speed = 0; if ('vx' in car) car.vx = car.vz = 0; car.angularVel = 0;
  }
  let reconT = 0, hotTo = null;
  // (as a player would: the Suits' sight read off their cones (m2-stealth.js), a spot moved to only out of it, held there
  // only while nobody's looking, backed off when one of them starts to wonder)
  const looks = () => W._m4?.recon?.stealth?.lookouts || [];
  const seenBy = (L, x, z, pad = 0.35) => {
    const e = L.e; if (!e?.alive || !L.watching) return false;
    const d = Math.hypot(x - e.pos.x, z - e.pos.z); if (d > 10.5) return false;
    return Math.abs(wrapA(Math.atan2(x - e.pos.x, z - e.pos.z) - L.yaw)) < 0.72 + pad || d < 2.0;
  };
  const seen = (x, z, pad = 0.35) => looks().some((L) => seenBy(L, x, z, pad));
  function recon(dt, now) {
    const S = W._m4; if (!S?.pav) return;
    // (the tray first, then each Nocturne still to find, nearest first)
    let goal = null, reach = 1.2;
    if (S.tray && !S.tray.held) { goal = S.pav.tray; reach = 1.4; }
    else { const left = S.pav.panels.filter((p) => !p.found); left.sort((a, b) => Math.hypot(a.x - P.position.x, a.z - P.position.z) - Math.hypot(b.x - P.position.x, b.z - P.position.z)); goal = left[0]; }
    if (!goal) { holdF(false); return; }
    // (the art wall stands on the deck with room behind it (m4-pavilion.js: at a -5.35, b -11.2..7.2): pushed round its
    // end, he would study its back for ever. Back round the nearer end, then on)
    { const dx = P.position.x - PAV.x, dz = P.position.z - PAV.z, fa = Math.cos(PAV.h) * dx - Math.sin(PAV.h) * dz, fb = Math.sin(PAV.h) * dx + Math.cos(PAV.h) * dz;
      if (fa < -5.0 && fb > -11.6 && fb < 7.6) {
        holdF(false); const be = fb < -2 ? -12.4 : 8.4, w = Math.abs(fb - be) > 0.6 ? atPav(-6.0, be) : atPav(-3.8, be);
        walk(w.x, w.z, dt, 2.4); return;
      } }
    // (behind the big screen's backdrop (m4-pavilion.js: L.screen b 13.4, closed from the art wall's side to a 2.75):
    // pushed out past the deck's south end, he would walk into its back for ever. Round its open east end, then on)
    { const dx = P.position.x - PAV.x, dz = P.position.z - PAV.z, fa = Math.cos(PAV.h) * dx - Math.sin(PAV.h) * dz, fb = Math.sin(PAV.h) * dx + Math.cos(PAV.h) * dz;
      if (fb > 13.3) { holdF(false); const w = fa < 3.6 ? atPav(4.2, 14.6) : atPav(4.2, 11.6); walk(w.x, w.z, dt, 2.4); return; }
      // (and out past the north end, off the deck: back in by its entrance, the carpet)
      if (fb < -15.2) { holdF(false); const w = Math.abs(fa) > 1.0 ? atPav(0, -17.2) : atPav(0, -12.5); walk(w.x, w.z, dt, 2.4); return; } }
    // (one starting to wonder, or standing in a cone at all: out of it before it fills)
    const hot = looks().find((L) => L.sus > 0.1 || seenBy(L, P.position.x, P.position.z, 0));
    if (hot) {
      holdF(false);
      if (!hotTo || now - hotTo.t > 1200) {
        // (a spot on the deck out of every cone by the widest margin, near him and a straight walk away: the deck's
        // own frame, a 1 m grid. Straight away from one of them stays in his cone to its reach)
        let best = null;
        for (let a = -4.2; a <= 4.6; a += 1.1) for (let b = -11.4; b <= 11.6; b += 1.15) {
          const q = atPav(a, b), dd = Math.hypot(q.x - P.position.x, q.z - P.position.z); if (dd > 9) continue;
          let m = 3;
          for (const L of looks()) {
            const e = L.e; if (!e?.alive || !L.watching) continue;
            const d = Math.hypot(q.x - e.pos.x, q.z - e.pos.z); if (d > 11) continue;
            m = Math.min(m, Math.abs(wrapA(Math.atan2(q.x - e.pos.x, q.z - e.pos.z) - L.yaw)) - 0.72 + Math.max(0, d - 10) * 0.5, d < 2.4 ? -1 : 3);
          }
          if (m < 0.25) continue;
          const sc = Math.min(m, 1.2) - dd * 0.12;
          if (!best || sc > best.sc) { if (tryLine(P.position.x, P.position.z, q.x, q.z) > 0.6) continue; best = { x: q.x, z: q.z, sc }; }
        }
        hotTo = best ? { x: best.x, z: best.z, t: now } : (() => { const q = atPav(-1.5, 0); return { x: q.x, z: q.z, t: now }; })();
      }
      walk(hotTo.x, hotTo.z, dt, 3.2); return;
    }
    hotTo = null;
    const d = Math.hypot(goal.x - P.position.x, goal.z - P.position.z);
    if (d > reach) {
      holdF(false); reconT = now;
      // (the way there out of sight, or wait where he is, a waiter by a table)
      const sx = P.position.x + (goal.x - P.position.x) / d * Math.min(d, 2.5), sz = P.position.z + (goal.z - P.position.z) / d * Math.min(d, 2.5);
      if (S.tray?.held && seen(sx, sz, 0.1)) { P.speed = 0; return; }
      approach(goal, dt, 3.2);
    } else { P.speed = 0; holdF(now - reconT > 250 && !seen(P.position.x, P.position.z, 0.4)); }
  }
  let padAt = 0;
  function grab(dt, now) {
    const S = W._m4; if (!S?.pad) return;
    const G = SPOTS.case, d = Math.hypot(G.x - P.position.x, G.z - P.position.z);
    if (d > 1.6) { holdF(false); approach(G, dt, 3); return; }
    P.speed = 0;
    if (!document.querySelector('#wg .m4-pad.on')) { holdF(true); return; }
    holdF(false);
    if (now - padAt > 450 && !S.pad.done) { padAt = now; const o = S.pav.order, n = document.querySelectorAll('#wg .m4-pad .slot img').length; if (n < o.length) { note(`pad ${o[n]}`); S.pad.press(o[n]); } }
  }
  (function tick() {
    if (!on) return; requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (W.paused) return;
    const M = W.mission, ph = M?.phase;
    if (ph !== phaseWas) { phaseWas = ph; phaseT = now; release(); holdF(false); note(`phase ${ph}`); }
    // (the fail screen: retry)
    if (document.querySelector('#wg .wg-big.on .choices') && !/END OF EPISODE/.test(document.querySelector('#wg .wg-big.on')?.innerText || '')) { release(); if (now - pressT > 1500) { pressT = now; note('failed: retry (' + (document.querySelector('#wg .wg-big.on')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60) + ') ' + (document.querySelector('#wg .m2-banner .s')?.textContent || '')); dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true })); } return; }
    if (W.cutscene || W.directed) { release(); return; }
    if (W.combat?.player) W.combat.player.hp = W.combat.player.maxHp;
    if (ph === 'seaport' && cm.activeMode === 'car') {
      // (the drive to the Seaport: along the GPS's own route at a driver's pace, the car kept on it)
      if (now - phaseT > 1500) drive(dt);
    } else if (ph === 'seaport' && cm.activeMode === 'person') {
      // (out of the car by Rook's bench: back to it, F)
      const d = Math.hypot(car.position.x - P.position.x, car.position.z - P.position.z);
      if (d > 2.6) walk(car.position.x, car.position.z, dt, 5); else if (now - pressT > 900) { pressT = now; note('F: into the car'); press('KeyF'); }
    } else if (ph === 'recon' && cm.activeMode === 'person') {
      recon(dt, now);
    } else if (ph === 'grab' && cm.activeMode === 'person') {
      grab(dt, now);
    } else if (ph === 'run') {
      const d = Math.hypot(heli.position.x - P.position.x, heli.position.z - P.position.z), t = W.gps?.dest?.follow?.();
      if (d > 7.5) { if (t) walk(t.x, t.z, dt, 7.5); else walk(heli.position.x, heli.position.z, dt, 7.5); } else if (now - pressT > 600) { pressT = now; note('F: climb in'); press('KeyF'); }
    } else if (ph === 'flight' && cm.activeMode === 'helicopter') {
      fly(dt);
      if (/^F/.test(W.prompt || '') && now - pressT > 800) { pressT = now; release(); note('F: out'); press('KeyF'); }
    } else if (ph === 'ferry' && cm.activeMode === 'person') {
      const t = W.gps?.dest ? (W.gps.dest.follow ? W.gps.dest.follow() : W.gps.dest) : null;
      if (t) { const d2 = Math.hypot(GATE.x - P.position.x, GATE.z - P.position.z); walk(d2 < 30 ? GATE.x : t.x, d2 < 30 ? GATE.z : t.z, dt, 6.5); }
    } else release();
    if (now - phaseT > 240000) { note(`stuck in ${ph}`); phaseT = now; }
  })();
  return { log, stop() { on = false; release(); holdF(false); } };
}
