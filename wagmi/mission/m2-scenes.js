// Mog City: Mission 2's scenes, on the cutscene machinery (cine.js) the way Mission 1's are: a clock, the shots as
// functions of it, the cast posed from it, cues fired as it passes them; Space held skips.
//   meet     (burnerMeet) Bryant Park at twilight: Jane in person at one of the park's tables with her laptop; Dan hands
//            her the burner, she plugs it in and shows him the one thing she found (evidence(): the carrier's record of
//            its sale, a second SIM on the same sale, both switched on the same minute), then traces that twin to a van
//            idling in Times Square (a cut to it), ~30 s
//   burner   (the old one, kept as a fallback) the same beats as a video call from the library's wifi
//   crash    Greeley Square: Mack's car smoking against the plaza, Mack climbing out, dropping his phone, running off
//   phone    Dan with Mack's phone: the Suits' group chat, a photo of his own front door
// Each returns when it ends (or is skipped); the mission puts everyone where play goes on.
import * as THREE from 'three/webgpu';
import { getCast, upright, UPRIGHT_BONES } from '../intro.js';
import { createDirector, keys, angleKeys, handheld, clamp, lerp, odometer } from './cine.js';
import { buildJane, buildLaptop } from './jane.js';

const PI = Math.PI;
const WHITE = '#FFFFFF', BLUE = '#6CB8FF', ACID = '#B6FF3B';
export const J_AT = { x: -298.8, z: 84.5 }; // (the 6th Ave sidewalk at W 41st St, below the park's terrace)
export const VAN_START = [-591, -447, 0]; // (7th Ave's west curb lane north of W 47th St, facing south)
export const CRASH = { x: -341, z: 604, h: -2.35 };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// the shared runner: def = { END, shots: [{ t, cam(t, t0) -> { pos, look, fov, shake } }], cues: [[t, fn]], pose(t, dt),
// cleanup(), hero: false (Dan left alone), face: where he goes next, for the hand-back (cine.js release) }. END and the
// shots' t may change as it runs (a scene paced by its lines:
// a shot starts with its line, the end comes after the last one)
export async function runScene(W, def) {
  const app = W.app, ui = W.ui, C = await getCast(W), D = createDirector(W), Q = W.dan;
  const grade = app.postFX?.colorGrade, exp0 = grade?.exposure.value ?? 1.04;
  W.cutscene = true; ui.cine(true); ui.objective(null, 7, { track: false }); ui.help(null);
  if (def.hero !== false) for (const a of Q.mixer._actions) if (!C.qRig.owns(a)) a.setEffectiveWeight(0);
  let t = 0, done = false, skip = false;
  const st = { dead: false };
  const shots = def.shots, cues = [...def.cues].sort((a, b) => a[0] - b[0]);
  W.sceneClock = { rate: 1, cam: null, get t() { return t; }, seek(x) { t = clamp(x, 0, def.END); } };
  const shotAt = (x) => { let s = shots[0]; for (const sh of shots) if (sh.t <= x && sh.t >= s.t) s = sh; return s; };
  let ci = 0;
  const frame = (dt) => {
    if (W.paused) dt = 0;
    if (!done) t = Math.min(def.END, t + Math.min(dt, 0.1) * W.sceneClock.rate);
    try { def.pose?.(t, dt, C, D); } catch (e) { console.warn('[m2] pose', e); }
    const sh = shotAt(t), c = W.sceneClock.cam || sh.cam(t, sh.t);
    D.camera.pos = c.pos; D.camera.look = c.look; D.camera.fov = c.fov; D.camera.band = c.band; D.camera.shake = c.shake ? handheld(t, c.shake) : null;
    if (grade && def.exposure) grade.exposure.value = def.exposure;
    while (ci < cues.length && cues[ci][0] <= t) { try { cues[ci][1](st); } catch (e) { console.warn('[m2] cue', e); } ci++; }
  };
  W.directed = (dt) => { D.framed = true; frame(dt); };
  D.onFrame = frame; D.take();
  D.block(true, { onSkip: () => { skip = true; } });
  await new Promise((res) => { const f = () => { D.skipStep(1 / 60, ui); if (t >= def.END || skip) res(); else requestAnimationFrame(f); }; f(); });
  done = true; st.dead = true; st.skipped = skip;
  D.block(false); ui.skip(null); ui.sub(null); if (skip) ui.titleOff?.();
  if (def.hero !== false) { C.qRig.stop(); Q.act('idle').setEffectiveWeight(1); Q.body.rotation.x = 0; }
  try { def.cleanup?.(st); } catch (e) { console.warn('[m2] cleanup', e); }
  delete W.directed; delete W.sceneClock; D.onFrame = null;
  if (grade) grade.exposure.value = exp0;
  const rel = D.release(skip ? 0.4 : def.blend ?? 1.2, { face: def.face });
  ui.cine(false); W.cutscene = false;
  await rel;
  return st;
}

// Dan posed by a scene: his clip segments (C.qRig), then his back upright over his hips (Mission 1's way)
function poser(W, C) {
  const Q = W.dan, P = W.person, cm = W.app.controllerManager;
  const ub = UPRIGHT_BONES.map((n) => Q.bones[n]).filter(Boolean), ub0 = ub.map((b) => b.quaternion.clone());
  return {
    at(x, z, h) { P.position.set(x, cm.getGroundHeight(x, z, 'person'), z); P.heading = h; P.mesh.position.copy(P.position); P.mesh.rotation.y = h; P.mesh.visible = true; },
    pose(t, h, k = 1) { ub.forEach((b, i) => b.quaternion.copy(ub0[i])); C.qRig.pose(t); ub.forEach((b, i) => ub0[i].copy(b.quaternion)); Q.body.position.y = 0; Q.body.rotation.x = 0; upright(W, h, k); },
  };
}
// two-bone reach: his arm (side 'L' | 'R') to a world point, the elbow toward pole, by weight w
const _q = new THREE.Quaternion(), _w = new THREE.Quaternion();
function turnWorld(b, q) { b.getWorldQuaternion(_w); const want = q.clone().multiply(_w); b.parent.getWorldQuaternion(_w); b.quaternion.copy(_w.invert().multiply(want)); b.updateMatrixWorld(true); }
function armTo(W, side, target, pole, w = 1) {
  const B = W.dan.bones, b1 = B['upperarm01_' + side], b2 = B['lowerarm01_' + side], b3 = B['wrist_' + side];
  if (!b1 || !b2 || !b3 || w <= 0) return;
  const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
  const a = b1.getWorldPosition(V()), b = b2.getWorldPosition(V()); let c = b3.getWorldPosition(V());
  const la = a.distanceTo(b), lb = b.distanceTo(c), d = clamp(target.distanceTo(a), 0.05, la + lb - 1e-3);
  const cur = a.clone().sub(b).normalize().angleTo(c.clone().sub(b).normalize());
  const want = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  const n = V().crossVectors(a.clone().sub(b), c.clone().sub(b)); if (n.lengthSq() < 1e-8) n.set(1, 0, 0); n.normalize();
  turnWorld(b2, _q.setFromAxisAngle(n, want - cur));
  c = b3.getWorldPosition(V());
  turnWorld(b1, _q.setFromUnitVectors(c.sub(a).normalize(), target.clone().sub(a).normalize()));
  const ax = target.clone().sub(a).normalize(), e = b2.getWorldPosition(V()).sub(a), p = pole.clone().sub(a);
  e.addScaledVector(ax, -e.dot(ax)); p.addScaledVector(ax, -p.dot(ax));
  if (e.lengthSq() > 1e-6 && p.lengthSq() > 1e-6) { let ang = e.angleTo(p); if (V().crossVectors(e, p).dot(ax) < 0) ang = -ang; turnWorld(b1, _q.setFromAxisAngle(ax, ang)); }
  if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, b1.quaternion.clone(), w); b2.quaternion.slerpQuaternions(q2, b2.quaternion.clone(), w); b1.updateMatrixWorld(true); }
}
const reachQ = (W, side, target, pole, w) => armTo(W, side, target, pole, w);
// his phone held up in front of him in his right hand, its screen to his eyes (k 0..1: down by his side .. up)
function holdPhone(W, phone, h, k) {
  const B = W.dan.bones; if (!B.head || k <= 0.001) { phone.visible = false; return; }
  W.person.mesh.updateMatrixWorld(true);
  const F = V(Math.sin(h), 0, Math.cos(h)), R = V(-Math.cos(h), 0, Math.sin(h));
  const eye = B.head.getWorldPosition(V()).add(V(0, 0.07, 0)).addScaledVector(F, 0.08);
  const P = eye.clone().addScaledVector(F, 0.3).add(V(0, -0.27, 0)).addScaledVector(R, 0.05);
  const z = eye.clone().sub(P).normalize(), y = V(0, 1, 0).addScaledVector(z, -z.y).normalize(), x = V().crossVectors(y, z).normalize();
  const sh = B.upperarm01_R.getWorldPosition(V());
  armTo(W, 'R', P.clone().addScaledVector(z, -0.03).addScaledVector(y, -0.05), sh.clone().add(V(0, -1, 0)).addScaledVector(R, 0.5).addScaledVector(F, -0.3), k);
  phone.visible = k > 0.6;
  phone.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); phone.position.copy(P);
}

/* --------------------------------------------------- Jane's evidence -- */
// what she found, on screen (23 Oct, the review: she reads capable, not all-knowing, when the one thing she found is
// there to see): the carrier's record of the burner's sale, a second SIM sold with it and switched on the same minute
// ('sale'), then that twin's last ping ('trace'); null hides it. A card over the shot of her screen, the place's styles
// (ui.js); on a phone it keeps to the safe edges, under the top bar.
const EVID_CSS = `
#wg .d-evid { position: absolute; left: 5vw; top: calc(var(--bar) + 3vh); width: 320px; padding: 11px 14px 12px; background: rgba(6,10,18,.86); border: 1px solid rgba(108,184,255,.35); border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,.5); opacity: 0; transform: translateY(8px); transition: opacity .35s, transform .45s cubic-bezier(.2,.7,.2,1); z-index: 4; pointer-events: none; }
#wg .d-evid.on { opacity: 1; transform: none; }
#wg .d-evid .hd { font: 700 12px/1 'Barlow Condensed'; letter-spacing: 2.5px; color: #6CB8FF; }
#wg .d-evid .sale { margin-top: 7px; font: 600 14px/1.2 'Barlow Condensed'; letter-spacing: .5px; color: rgba(255,255,255,.72); }
#wg .d-evid .row { display: flex; gap: 10px; align-items: baseline; margin-top: 7px; font: 600 17px/1.15 'Barlow Condensed'; }
#wg .d-evid .sim { min-width: 78px; font-variant-numeric: tabular-nums; }
#wg .d-evid .t b { margin-left: 3px; padding: 0 4px; border-radius: 3px; font-weight: 800; color: #FFC93C; background: rgba(255,201,60,.14); box-shadow: 0 0 0 1px rgba(255,201,60,.75); }
#wg .d-evid .s { margin-left: auto; font: 700 12px/1 'Barlow Condensed'; letter-spacing: 1.5px; color: rgba(255,255,255,.55); white-space: nowrap; }
#wg .d-evid .tw .s { color: #fff; }
#wg .d-evid.trace .tw .s { color: #EF4444; }
#wg .d-evid .ping { max-height: 0; margin-top: 0; overflow: hidden; opacity: 0; transition: max-height .4s, opacity .3s, margin .3s; font: 700 13px/1.25 'Barlow Condensed'; letter-spacing: 1.5px; color: #EF4444; }
#wg .d-evid.trace .ping { max-height: 44px; margin-top: 8px; opacity: 1; }
#wg .d-evid .ping b { font-size: 16px; letter-spacing: .5px; color: #fff; }
body.touch-enabled #wg .d-evid { left: var(--wg-l); top: calc(var(--bar) + 10px); width: auto; max-width: min(320px, calc(100vw - var(--wg-l) - var(--wg-r))); }
`;
export function evidence(W, mode) {
  const root = W.ui?.root; if (!root) return;
  if (!document.getElementById('d-evid-css')) { const st = document.createElement('style'); st.id = 'd-evid-css'; st.textContent = EVID_CSS; document.head.appendChild(st); }
  let el = root.querySelector('.d-evid');
  if (!mode) { el?.classList.remove('on', 'trace'); return; }
  if (!el) {
    el = document.createElement('div'); el.className = 'd-evid';
    el.innerHTML = `<div class="hd">JANE'S SCREEN · CARRIER LOG</div><div class="sale">ONE PREPAID SALE · CANAL ST KIOSK · PAID CASH</div>
      <div class="row me"><span class="sim">SIM ··4471</span><span class="t">ON<b>WED 9:41</b></span><span class="s">THIS BURNER</span></div>
      <div class="row tw"><span class="sim">SIM ··4472</span><span class="t">ON<b>WED 9:41</b></span><span class="s">THE TWIN</span></div>
      <div class="ping">● LAST PING 20 MIN AGO · <b>7 AV &amp; W 47 ST</b></div>`;
    root.appendChild(el);
  }
  el.querySelector('.tw .s').textContent = mode === 'trace' ? '● STILL ON' : 'THE TWIN';
  el.classList.toggle('trace', mode === 'trace');
  requestAnimationFrame(() => el.classList.add('on'));
}

/* ------------------------------------------------------------ burner -- */
// Bryant Park, twilight, paced by its lines (~45 s). U: the mission's overlays (m2-ui.js), van: the security van (at its
// start for the cutaway), say(lines, st, onLine): the mission's lines (subtitles and voices)
export function burnerScene(W, { U, say, van }) {
  const C = W.cast, ui = W.ui, sfx = W.sfx;
  // (his back to the park, facing 6th Ave: the trees and the terrace behind him, the street's traffic before him)
  const QX = J_AT.x, QZ = J_AT.z, QH = -PI / 2 + 0.3, G = W.app.controllerManager.getGroundHeight(QX, QZ, 'person');
  const T = { ring: 5.0, call: 8.6 };
  let ps = null, upAt = null, downAt = null;
  const Fq = [Math.sin(QH), Math.cos(QH)], Rq = [-Math.cos(QH), Math.sin(QH)]; // his forward, his right
  const at = (f, r, y) => [QX + Fq[0] * f + Rq[0] * r, G + y, QZ + Fq[1] * f + Rq[1] * r];
  const drift = (a, b, secs) => (t, t0) => keys([[t0, a], [t0 + secs, b]], 'linear')(t);
  const LINES = [
    ['Jane', BLUE, "Don't look around. I'm not there."],
    ['Dan', WHITE, 'You said Bryant Park.'],
    ['Jane', BLUE, "I said bring it to Bryant Park. I'm on the library's wifi. It's free and it has a lion."],
    ['Jane', BLUE, 'Hold the burner up. Okay. It has a twin. Same batch, same buyer.'],
    ['Jane', BLUE, "Your face is on four front pages today. Moon's jealous."],
    ['Dan', WHITE, 'Moon can have them. All four.'],
    ['Jane', BLUE, 'The twin pinged twenty minutes ago. A van, idling in Times Square. Seventh and Forty-Seventh.'],
    ['Jane', BLUE, "Don't run up to it. Follow it. It'll take us to the rest of them."],
    ['Dan', WHITE, 'Follow the van. Got it.'],
  ];
  const OTS_R = { cam: (t, t0) => ({ pos: drift(at(-1.75, 0.75, 1.86), at(-1.6, 0.7, 1.84), 5)(t, t0), look: at(1.5, -0.2, 1.36), fov: 42, shake: 0.3 }) };
  const def = {
    END: Infinity,
    shots: [
      // over 6th Ave at twilight: the park's trees and fountain, a slow push (ACT I · BAGS / BURNER)
      { t: 0, cam: (t, t0) => ({ pos: drift([-316, 11, 30], [-314.5, 8.5, 48], 5)(t, t0), look: drift([-262, 7, 96], [-268, 4.5, 94], 5)(t, t0), fov: 46, shake: 0.4 }) },
      // in front of him, the park behind: the phone rings, he looks at it
      { t: T.ring, cam: (t, t0) => ({ pos: drift(at(3.4, 0.9, 1.2), at(3.1, 0.8, 1.25), 3.6)(t, t0), look: at(0, 0, 1.4), fov: 36, shake: 0.35 }) },
      // over his right shoulder onto the phone (the call on the right of the screen)
      { t: T.call, ...OTS_R },
      // (from here each shot comes with its line)
      { line: 1, t: Infinity, cam: (t, t0) => ({ pos: drift(at(1.9, -1.15, 1.66), at(1.75, -1.05, 1.66), 3)(t, t0), look: at(0, 0, 1.6), fov: 30, shake: 0.3 }) },
      { line: 2, t: Infinity, cam: (t, t0) => ({ pos: drift(at(-1.75, -0.75, 1.86), at(-1.6, -0.7, 1.84), 6)(t, t0), look: at(1.5, 0.25, 1.36), fov: 42, shake: 0.3 }) },
      { line: 3, t: Infinity, cam: (t, t0) => ({ pos: drift(at(6.2, 3.2, 2.3), at(5.6, 2.8, 2.1), 5)(t, t0), look: at(0, 0, 1.2), fov: 34, shake: 0.4 }) },
      { line: 4, t: Infinity, cam: (t, t0) => ({ pos: drift(at(1.6, -0.95, 1.7), at(1.45, -0.85, 1.7), 6)(t, t0), look: at(0, 0, 1.64), fov: 27, shake: 0.3 }) },
      { line: 5, t: Infinity, cam: (t, t0) => ({ pos: drift(at(2.5, 1.35, 1.55), at(2.3, 1.25, 1.55), 4)(t, t0), look: at(0, 0, 1.5), fov: 32, shake: 0.35 }) },
      // cut away: Times Square, the van idling at the curb
      { line: 6, t: Infinity, cam: (t, t0) => ({ pos: drift([-579, 3.2, -497], [-580, 2.6, -486], 6)(t, t0), look: [VAN_START[0], 1.5, VAN_START[1]], fov: 34, shake: 0.5 }) },
      { line: 7, t: Infinity, ...OTS_R },
      { line: 8, t: Infinity, cam: (t, t0) => ({ pos: drift(at(2.2, 1.3, 1.6), at(1.9, 1.5, 1.6), 4)(t, t0), look: at(0, 0, 1.52), fov: 32, shake: 0.3 }) },
    ],
    cues: [
      [0.3, () => { ui.title('ACT I · FALL GUY', 'Burner', 2.8); sfx?.play('stinger', { gain: 0.35 }); W.audio?.play?.('missionStart'); }],
      [1.2, () => ui.place('Bryant Park', 'Midtown · New York', 3.4)],
      [T.ring + 0.6, () => { sfx?.play('ring', { gain: 0.16, times: 1 }); W.audio?.play?.('phoneBuzz'); upAt = W.sceneClock?.t ?? T.ring; }],
      [T.call - 0.3, () => { U.call.show(); sfx?.play('ding', { gain: 0.08 }); }],
      [T.call + 0.2, (st) => {
        say(LINES, st, (who, i) => {
          const now = W.sceneClock?.t ?? 0;
          for (const sh of def.shots) if (sh.line === i) sh.t = now;
          if (i === 3) evidence(W, 'sale');
          if (i === 4) { evidence(W, null); U.call.share(true); }
          if (i === 6) { U.call.hide(); ui.place('Times Square', '7th Ave & W 47th St', 3); }
          if (i === 7) { U.call.show(); U.call.share(false); }
        }).finally(() => { const now = W.sceneClock?.t; if (now != null) { def.END = now + 1.6; downAt = now + 0.2; sfx?.play('hangup', { gain: 0.12 }); U.call.hide(); } });
      }],
    ],
    pose(t, dt) {
      ps = ps || poser(W, C);
      ps.at(QX, QZ, QH);
      ps.pose(t, QH);
      // his phone up in front of him for the call, down again after it
      const k = upAt == null ? 0 : clamp((t - upAt) / 0.6) * (downAt == null ? 1 : 1 - clamp((t - downAt) / 0.6));
      holdPhone(W, C.phone, QH, k); if (C.phone.visible) C.phone.show?.('off', t);
      // the van at the curb in Times Square for the cutaway
      if (van) { van.group.visible = true; van.group.position.set(VAN_START[0], 0, VAN_START[1]); van.group.rotation.set(0, VAN_START[2], 0); van.setDoor(0); van.update(dt, 0, 0); }
    },
    setup() {
      // (his left hand talking as he does; the right is held up by holdPhone)
      C.qRig.set([[0, 'idle'], [T.call, ['idle/noArmL', ['talk/armL', { from: 0.6, speed: 0.7 }]], { fade: 0.5 }]]);
    },
    cleanup() { U.call.hide(); C.phone.visible = false; evidence(W, null); },
  };
  return def;
}

/* ------------------------------------------------------------- meet -- */
// Bryant Park, twilight: Jane for real, at one of the park's tables on the 6th Ave side with her laptop, and Moon (their
// dog: she lives with Jane) beside her chair on her lead, up and wagging as Dan walks up. He hands Jane the burner (and
// says hi to Moon: his eyes down to her), she plugs it in; its twin pings in Times Square (a cut to the van idling
// there); she tells him to follow it. Paced by its lines, ~30 s (his walk up, then six lines). Called by m2.js as
// burnerMeet(W, { U, say, van, at }): it loads her and plays itself (a promise); it leaves Dan standing by her table,
// facing his car, and her (Moon with her) at her table until he's gone.
const MEET_LINES = [
  ['Jane', BLUE, "You're late. Sit. Burner, please."],
  ['Dan', WHITE, 'Hi, Jane. Hi, Moon. Great to see you too.'],
  ['Jane', BLUE, 'Plugging it in. Look: two SIMs, one sale, switched on the same minute. Yours, and its twin.'],
  ['Jane', BLUE, 'The twin pinged twenty minutes ago. A van, idling in Times Square. Seventh and Forty-Seventh.'],
  ['Jane', BLUE, "Don't run up to it. Follow it. It'll take us to the rest of them."],
  ['Dan', WHITE, 'Follow the van. Got it.'],
];
export async function burnerMeet(W, { U, say, van, at = J_AT }) {
  const C = await getCast(W), ui = W.ui, sfx = W.sfx, cm = W.app.controllerManager;
  const J = await buildJane(W);
  // her table on the sidewalk below the terrace, its long side along the avenue; she sits on its park side facing the
  // street, Dan comes up on the street side (H: her heading; he faces her)
  const TX = at.x + 1.3, TZ = at.z - 2.2, H = -PI / 2, G = cm.getGroundHeight(TX, TZ, 'person');
  const F = [Math.sin(H), Math.cos(H)], R = [-Math.cos(H), Math.sin(H)];
  const p = (f, r, y) => [TX + F[0] * f + R[0] * r, G + y, TZ + F[1] * f + R[1] * r];
  const set = new THREE.Group(); set.name = 'jane-table';
  const metal = new THREE.MeshStandardMaterial({ color: '#2E4A36', roughness: 0.55, metalness: 0.5 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 28), metal); top.position.y = 0.74; set.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 10), metal); leg.position.y = 0.37; set.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.03, 20), metal); foot.position.y = 0.015; set.add(foot);
  // (the park's green folding chairs: hers, and the one he doesn't take)
  const chair = (f, r, yaw) => { const c = new THREE.Group(); const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.4), metal); seat.position.y = 0.45; c.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.03), metal); back.position.set(0, 0.68, -0.19); back.rotation.x = -0.12; c.add(back);
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), metal); l.position.set(x, 0.225, z); c.add(l); }
    const [x, , z] = p(f, r, 0); c.position.set(x - TX, 0, z - TZ); c.rotation.y = yaw; set.add(c); return c; };
  const herChair = chair(-0.62, 0, H); chair(0.15, 0.75, H + PI / 2 + 0.4);
  const lap = buildLaptop(); lap.rotation.y = H + PI; const lp = p(-0.12, 0, 0.755); lap.position.set(lp[0] - TX, 0.755, lp[2] - TZ); set.add(lap);
  set.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  // the light (23 Oct): at twilight under the terrace her table was in the dark and so was she. One of the park's lamps
  // on the sidewalk behind her, to her left (its globe lit; its warm light over the table, and a rim on her hair and
  // shoulders), a soft key from the street side onto her face and the table, and the laptop's own glow on her face,
  // brighter while its screen is on. (Point lights only: the renderer's clustered lighting takes them without a stall)
  const loc = (f, r, y) => { const q = p(f, r, y); return [q[0] - TX, q[1] - G, q[2] - TZ]; };
  const lampM = new THREE.MeshStandardMaterial({ color: '#1C2620', roughness: 0.45, metalness: 0.6 });
  const lamp = new THREE.Group(); lamp.position.set(...loc(-1.3, 1.6, 0)); set.add(lamp);
  const lampPart = (geo, y, mat = lampM) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = mat === lampM; lamp.add(m); return m; };
  lampPart(new THREE.CylinderGeometry(0.15, 0.18, 0.4, 14), 0.2); lampPart(new THREE.CylinderGeometry(0.045, 0.065, 3.1, 12), 1.95);
  lampPart(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 12), 3.52); lampPart(new THREE.SphereGeometry(0.2, 20, 14), 3.74, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.1, 1.45) }));
  lampPart(new THREE.CylinderGeometry(0.035, 0.09, 0.07, 12), 3.97);
  const lampL = new THREE.PointLight('#FFD2A0', 11, 12, 1.6); lampL.position.set(lamp.position.x, 3.62, lamp.position.z); set.add(lampL);
  const keyL = new THREE.PointLight('#FFE6CC', 2.6, 4.5, 2); keyL.position.set(...loc(0.8, 0.5, 1.9)); set.add(keyL);
  // (at the screen itself, a little in front of it: closer in, it burnt out her chin)
  // (23 Oct, round 2: that put it a hand's breadth from her hands on the keys, and they and her face came out white
  // under it. Now just behind the screen's top edge, higher and further from her hands than her face is from it, and
  // ~60% down on her face: a soft blue on her, not a lamp)
  const glowL = new THREE.PointLight('#8EC2FF', 0.15, 1.4, 2); glowL.position.set(...loc(0.05, 0, 1.0)); set.add(glowL);
  set.position.set(TX, G, TZ); W.app.scene.add(set);
  // Moon (the cast's: wagmi/moon.js) on the paving at Jane's feet, by her chair's front left leg (on her right the
  // empty chair hides her from the wide and the two-shot; further out she is under the subtitles), short of his mark, facing
  // out toward the avenue and him; her red lead from her collar to the chair's nearest leg, slack on the ground
  const moon = C.moon, MOON = p(-0.46, -0.52, 0), MH = H + 0.3;
  const lead = (await import('../moon.js')).buildLeash(THREE, { length: 0.85, radius: 0.0055, color: '#D33A3A' });
  lead.mesh.visible = false; W.app.scene.add(lead.mesh);
  set.updateMatrixWorld(true);
  const tie = [V(-0.19, 0.07, 0.18), V(0.19, 0.07, 0.18), V(-0.19, 0.07, -0.18), V(0.19, 0.07, -0.18)].map((l) => herChair.localToWorld(l)).sort((a, b) => a.distanceTo(V(MOON[0], G, MOON[2])) - b.distanceTo(V(MOON[0], G, MOON[2])))[0];
  const mo = { mode: 'idle', speed: 0, look: V(), wag: 0.4, mouth: 0, calm: 0 };
  let moonT = null; // (when he says hi to her: the line's start, scene time)
  const moonPose = (t, dt) => {
    moon.group.visible = true; moon.group.position.set(MOON[0], G, MOON[2]); moon.group.rotation.set(0, MH, 0);
    lead.mesh.visible = true; moon.group.updateMatrixWorld(true);
    lead.update(dt > 0 ? dt : 1 / 30, tie, moon.collar.getWorldPosition(V()), G);
  };
  const moonOff = () => { moon.group.visible = false; lead.mesh.removeFromParent(); lead.mesh.geometry.dispose(); lead.mesh.material.dispose(); };
  // where they are: her chair, his mark (the street side of the table, a little to her right), his walk in from the curb
  const JX = p(-0.62, 0, 0), QM = p(0.78, -0.45, 0), QS = p(3.6, -2.4, 0), QH = H + PI - 0.35;
  const T = { ring: 0, walk: 1.2, at: 4.6, line0: 5.0 };
  let ps = null, speaking = null, lineText = '', hand = null, plug = null, scrMode = 'off', headQ0 = null;
  // (his eyes down to Moon on 'Hi, Moon' (face.js look), then back to Jane; his head dipped a little with them)
  const hiMoon = (t) => (moonT == null ? 0 : clamp((t - moonT - 0.55) / 0.25) * (1 - clamp((t - moonT - 1.75) / 0.3)));
  const moonHead = () => moon.parts.head.getWorldPosition(V());
  if (W.dan?.face) W.dan.face.look = () => (hiMoon(W.sceneClock?.t ?? 0) > 0.3 ? moonHead() : null);
  const drift = (a, b, secs) => (t, t0) => keys([[t0, a], [t0 + secs, b]], 'linear')(t);
  const juH = () => J.bones.head.getWorldPosition(V());
  const def = {
    // (a touch brighter than the street's twilight grade while it plays: faces at a table, not cars under street lamps)
    END: Infinity, exposure: 1.16,
    // (handed back facing his car: the next step needs it, and it waits at the park's curb, m2.js start)
    face: () => W.car.position,
    shots: [
      // over the avenue at twilight: the park's trees, her at her table under the terrace by its lamp, Dan crossing to
      // her (from her left and a little higher than his head: he walks in from the right of the shot, never between it
      // and her)
      { t: 0, cam: (t, t0) => ({ pos: drift(p(6.8, 2.6, 3.0), p(5.7, 2.1, 2.45), 4.6)(t, t0), look: p(-0.6, 1.25, 1.85), fov: 42, shake: 0.35 }) },
      // two-shot, low over the table: her with the laptop, him standing
      { line: 0, t: Infinity, cam: (t, t0) => ({ pos: drift(p(1.9, 1.7, 1.3), p(1.75, 1.55, 1.27), 5)(t, t0), look: p(0.1, -0.25, 1.05), fov: 40, shake: 0.3 }) },
      // over her shoulder onto him
      { line: 1, t: Infinity, cam: (t, t0) => ({ pos: drift(p(-1.35, 0.42, 1.25), p(-1.3, 0.38, 1.27), 4)(t, t0), look: [QM[0], G + 1.5, QM[2]], fov: 34, shake: 0.3 }) },
      // over her shoulder onto the laptop's screen, the burner going in beside it
      { line: 2, t: Infinity, cam: (t, t0) => ({ pos: drift(p(-1.15, -0.45, 1.42), p(-1.08, -0.42, 1.38), 5)(t, t0), look: p(0.05, 0.1, 0.84), fov: 34, shake: 0.25 }) },
      // the trace on her screen, then the van in Times Square
      { line: 3, t: Infinity, cam: (t, t0) => ({ pos: drift(p(-0.95, -0.32, 1.3), p(-0.85, -0.28, 1.24), 2.6)(t, t0), look: p(0.02, 0.05, 0.86), fov: 28, shake: 0.2 }) },
      { line: 3.5, t: Infinity, cam: (t, t0) => ({ pos: drift([-579, 3.2, -497], [-580, 2.6, -486], 6)(t, t0), look: [VAN_START[0], 1.5, VAN_START[1]], fov: 34, shake: 0.5 }) },
      // her, close, across the table
      { line: 4, t: Infinity, cam: (t, t0) => { const h = juH(); return { pos: drift(p(0.8, 0.35, 0), p(0.72, 0.3, 0), 5)(t, t0).map((x, k) => (k === 1 ? h.y + 0.05 : x)), look: [h.x, h.y + 0.02, h.z], fov: 32, shake: 0.25 }; } },
      { line: 5, t: Infinity, cam: (t, t0) => ({ pos: drift(p(2.4, 1.5, 1.55), p(2.2, 1.3, 1.5), 4)(t, t0), look: p(0.2, -0.2, 1.15), fov: 36, shake: 0.3 }) },
    ],
    cues: [
      [0.3, () => { ui.title('ACT I · FALL GUY', 'Burner', 2.8); sfx?.play('stinger', { gain: 0.35 }); W.audio?.play?.('missionStart'); }],
      [1.2, () => ui.place('Bryant Park', 'Midtown · New York', 3.4)],
      [T.line0, (st) => {
        say(MEET_LINES, st, (who, i) => {
          const now = W.sceneClock?.t ?? 0; speaking = who; lineText = MEET_LINES[i]?.[2] || '';
          for (const sh of def.shots) if (sh.line === i) sh.t = now;
          if (i === 1) { hand = now + 0.4; moonT = now; }       // he hands it over as he answers (and says hi to Moon)
          // (the sale on her screen as she says it, the twin's ping on it as she traces it; gone with the cut to the van)
          if (i === 2) { plug = now + 0.3; scrMode = 'scan'; setTimeout(() => { if (!st.dead) evidence(W, 'sale'); }, 900); }
          if (i === 3) { scrMode = 'trace'; evidence(W, 'trace'); sfx?.play('ding', { gain: 0.08 }); for (const sh of def.shots) if (sh.line === 3.5) sh.t = now + 2.6; setTimeout(() => { evidence(W, null); ui.place('Times Square', '7th Ave & W 47th St', 3); }, 2600); }
        }).finally(() => { const now = W.sceneClock?.t; speaking = null; if (now != null) def.END = now + 1.4; });
      }],
    ],
    pose(t, dt) {
      ps = ps || poser(W, C);
      // Dan: in from the curb, then at the table facing her
      const k = clamp((t - T.walk) / (T.at - T.walk));
      const qx = lerp(QS[0], QM[0], k), qz = lerp(QS[2], QM[2], k), walkH = Math.atan2(QM[0] - QS[0], QM[2] - QS[2]);
      const qh = t < T.at ? walkH : QH;
      const QB = W.dan.bones;
      if (headQ0 && QB.head) QB.head.quaternion.copy(headQ0);
      ps.at(qx, qz, qh); ps.pose(t, qh);
      // (his head dipped toward Moon with his eyes on 'Hi, Moon': over the clip's pose, put back before the next one)
      const hm = hiMoon(t);
      if (QB.head) {
        headQ0 = QB.head.quaternion.clone();
        if (hm > 0.001) {
          // (a world turn about his right, negative: forward and down)
          const hq = new THREE.Quaternion().setFromAxisAngle(V(-Math.cos(qh), 0, Math.sin(qh)), -0.3 * hm), wq = QB.head.getWorldQuaternion(new THREE.Quaternion());
          QB.head.quaternion.copy(QB.head.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hq.multiply(wq))); QB.head.updateMatrixWorld(true);
        }
      }
      // Moon: up and looking at him as he walks up, her tail going harder and her tongue out as he nears; all his on
      // 'Hi, Moon'; then the burner as Jane plugs it in, and settled again by her
      const dq = Math.hypot(qx - MOON[0], qz - MOON[2]), near = 1 - clamp((dq - 1.2) / 3);
      const qh3 = W.dan.bones.head?.getWorldPosition(V()) || V(qx, G + 1.6, qz);
      const plugK = plug != null ? clamp((t - plug) / 0.4) * (1 - clamp((t - plug - 2.6) / 0.6)) : 0;
      mo.look.copy(plugK > 0.5 ? V(...p(-0.05, 0.32, 0.8)) : qh3);
      mo.wag = 0.4 + 0.6 * Math.max(near, hm); mo.mouth = Math.max(0.6 * near, hm) * (plug != null && t > plug + 3 ? 0.5 : 1); mo.calm = plug != null && t > plug + 3 ? 1 : 0;
      moonPose(t, dt); moon.update(dt, mo);
      // the burner: from his hand to hers, then onto the table by the laptop, plugged in
      const ph = C.phone; ph.visible = false;
      if (hand != null) {
        const u = clamp((t - hand) / 1.1), hp = W.dan.bones.wrist_R?.getWorldPosition(V()), jp = J.bones.wrist_R?.getWorldPosition(V());
        const meetP = V(...p(0.2, -0.2, 0.98));
        if (u < 1 && hp) { W.dan.bones && armQ(W, meetP, u); ph.visible = true; ph.position.copy(u < 0.6 ? hp : meetP); ph.rotation.set(-PI / 2, 0, H); }
        else { const on = V(...p(-0.05, 0.32, 0.765)); ph.visible = true; ph.position.copy(on); ph.rotation.set(-PI / 2, 0, H + 0.3); void jp; }
      }
      // Jane: seated, typing on the laptop, her mouth with her lines; she reaches for the burner when he holds it out
      J.root.visible = true; J.root.position.set(JX[0], G, JX[2]); J.root.rotation.y = H;
      J.rig.pose(t); J.root.updateMatrixWorld(true);
      // her typing (28 Oct, the owner: "typing too fast and constant"): bursts of a few keystrokes (3 to 7, four to six a
      // second, each key one hand's short dip of the wrist and back), a pause of 0.8-2.4 s between bursts, her hands
      // drifting a little over the keys. She types only while nobody speaks: within 0.35 s of a line starting her hands
      // settle on the keys and she looks up at Dan through his lines and hers (glancing down at her screen now and then:
      // face.live's alt). (The lines run back to back, so she types while he walks up and once the last one is done)
      const hsh = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
      const burst = (i) => [3 + Math.floor(hsh(i, 1) * 5), 4.2 + hsh(i, 2) * 1.8, 0.8 + hsh(i, 3) * 1.6];
      let bS = 0.4, bi = 0; for (; bi < 400; bi++) { const [n, r, gap] = burst(bi); if (t < bS + n / r + gap) break; bS += n / r + gap; }
      const [bn, br] = burst(bi), bu = (t - bS) * br, inBurst = bu >= 0 && bu < bn, ud = J.root.userData;
      ud.typeK = clamp((ud.typeK ?? 1) + (speaking ? -1 : 1) * (dt || 0) / 0.35);
      const key = Math.floor(bu), press = inBurst ? Math.sin(clamp((bu - key) / 0.4) * PI) * ud.typeK * (0.005 + 0.003 * hsh(bi * 17 + key, 5)) : 0, kL = hsh(bi * 17 + key, 4) < 0.5;
      const kb = V(...p(-0.2, 0, 0.8)), slide = (s) => 0.008 * Math.sin(t * 0.9 + s) + 0.004 * Math.sin(t * 2.3 + 2 * s);
      const reach = hand != null ? clamp((t - hand) / 0.5) * (1 - clamp((t - hand - 1.2) / 0.5)) : 0;
      const sh = J.bones.upperarm01_R.getWorldPosition(V()), shL = J.bones.upperarm01_L.getWorldPosition(V());
      const Rv = V(R[0], 0, R[1]), Fv = V(F[0], 0, F[1]);
      J.arm('L', kb.clone().addScaledVector(Rv, -0.12 + slide(0)).add(V(0, kL ? -press : 0, 0)), shL.clone().addScaledVector(Rv, -0.5).add(V(0, -0.5, 0)), 0.9);
      J.arm('R', kb.clone().addScaledVector(Rv, 0.12 + slide(1.7)).add(V(0, kL ? 0 : -press, 0)).lerp(V(...p(0.2, -0.2, 0.98)), reach), sh.clone().addScaledVector(Rv, 0.5).add(V(0, -0.5, 0)), 0.9);
      // her face (jane.js face.live): her mouth with her voice, her eyes on him through the lines (on her laptop as he
      // walks up and while she types between them), glancing at the other now and then, blinking; her head following
      // her eyes a little
      const qHead = W.dan?.bones?.head?.getWorldPosition(V()) || V(QM[0], G + 1.6, QM[2]), scr = lap.localToWorld(V(0, 0.13, -0.1));
      const onScreen = !speaking && (t < T.at - 0.4 || (inBurst && ud.typeK > 0.5));
      J.face.live(dt, { talking: speaking === 'Jane', text: speaking === 'Jane' ? lineText : '', look: onScreen ? scr : qHead, alt: onScreen ? qHead : scr });
      lap.userData.screen(scrMode, t);
      glowL.intensity = scrMode === 'off' ? 0.15 : 0.3 + 0.02 * Math.sin(t * 7.3);
      void Fv; void plug; void dt;
      // the van at the curb in Times Square for the cutaway
      if (van) { van.group.visible = true; van.group.position.set(VAN_START[0], 0, VAN_START[1]); van.group.rotation.set(0, VAN_START[2], 0); van.setDoor(0); van.update(dt, 0, 0); }
    },
    setup() {
      C.qRig.set([[0, 'idle'], [T.walk, 'walk', { fade: 0.3 }], [T.at, 'idle', { fade: 0.5 }], [T.line0 + 3, ['idle/noArmL', ['talk/armL', { from: 0.6, speed: 0.7 }]], { fade: 0.5 }]]);
      J.rig.set([[0, J.clips.includes('sit') ? 'sit' : 'idle', { speed: 0.6 }]]);
    },
    cleanup(st) {
      C.phone.visible = false; lap.userData.screen('off'); J.jaw(0); J.face.set({ blink: 0, brow: 0 }); evidence(W, null);
      // (where play goes on: Dan at the table, facing the avenue and his car; Jane stays at her table, Moon with her,
      // until he's well away, then they're packed up)
      if (W.dan?.face) W.dan.face.look = null; headQ0 = null;
      ps?.at(QM[0], QM[2], H + PI + PI);
      const keep = setInterval(() => {
        const P = W.person, car = W.car, me = W.app.controllerManager.activeMode === 'car' ? car.position : P.position;
        const ph = W.mission?.phase;
        if (Math.hypot(me.x - TX, me.z - TZ) > 70 || (ph && ph !== 'go' && ph !== 'start')) { clearInterval(keep); set.removeFromParent(); J.root.removeFromParent(); moonOff(); }
        else { J.rig.pose(performance.now() / 1000); mo.look.copy(J.bones.head.getWorldPosition(V())); mo.mouth = 0.2; mo.wag = 0.5; moon.update(0.1, mo); }
      }, 100);
      void st;
    },
  };
  // (his arm out with the burner: his right wrist to the hand-over point by u)
  function armQ(W2, target, u) {
    const B = W2.dan.bones, k = Math.sin(clamp(u) * PI);
    if (!B.upperarm01_R) return;
    const sh = B.upperarm01_R.getWorldPosition(V());
    reachQ(W2, 'R', target, sh.clone().add(V(0, -1, 0)).addScaledVector(V(-R[0], 0, -R[2]), 0.4), k);
  }
  def.setup();
  // (she is across the table from him here, not on a call: her lines without the phone's sound (the manifest gives
  // every Jane line 'phone'), and back to it once the meet is over)
  W.voice?.fx?.('Jane', null);
  try { return await runScene(W, def); } finally { W.voice?.fx?.('Jane'); }
}

/* ------------------------------------------------------------- crash -- */
// Greeley Square, or wherever the rams wrecked him. ~9 s. mackCar: the car (smoking), mack: Mack's rig, phone: the phone
// mesh he drops. All of it in the wreck's own frame (f along its nose, l to its left: the driver's side, his door), so it
// reads however the wreck lies. (28 Oct, round 3: its last shot, half the scene, was a lens 0.6 m off the ground in the
// world's axes, and he ran off right behind his car: 'Keep the phone!' over an empty frame; before it, only his back.)
// He is in view all through now: out of his door in a stagger, 'My car!' to its smoking nose, the phone dropped; then he
// turns to Dan, waves him bye on his line and sprints off upright on his side of the wreck. His way off is the way he was
// going, turned as little as runs 15 m clear of the wreck, Dan's car and the buildings; each camera stands on his side at
// eye height, the first of its places that sees him (head and hips) the whole time it is on.
export function crashScene(W, { mackCar, mack, phone, say, at = CRASH }) {
  const cm = W.app.controllerManager, ui = W.ui, sfx = W.sfx, dan = W.car;
  const { x: CX, z: CZ, h: CH } = at;
  const F = [Math.sin(CH), Math.cos(CH)], L = [Math.cos(CH), -Math.sin(CH)];
  const P = (f, l) => [CX + F[0] * f + L[0] * l, CZ + F[1] * f + L[1] * l];
  const G = (x, z) => cm.getGroundHeight(x, z, 'person');
  const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); }, turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  // (out: he is out of the door; free: on his feet again; look: turned to the nose; turn: to Dan; run: off)
  const T = { out: 1.4, free: 2.35, look: 2.7, drop: 3.6, turn: 4.4, line: 4.9, run: 6.7, end: 9.0 };
  // where the phone falls (the next step's mark: m2.js phone) as it was; the door he gets out of, where he stands over
  // the phone for 'My car!' (car frame); the nose he looks at
  const drop = P(0.6, 2.5), DOOR = [0.35, 1.1], STAND = [0.95, 2.1], NOSE = P(2.3, 0.55);
  // the wreck on the ground under its four wheels (half up a curb it sits tilted, not sunk into it), its slight list kept
  const wh = [[1.38, 0.93], [1.38, -0.93], [-1.38, 0.93], [-1.38, -0.93]].map(([f, l]) => cm.getGroundHeight(...P(f, l), 'car'));
  const CY = (wh[0] + wh[1] + wh[2] + wh[3]) / 4, PITCH = -Math.atan2(wh[0] + wh[1] - wh[2] - wh[3], 2 * 2.76), ROLL = 0.04 + Math.atan2(wh[0] + wh[2] - wh[1] - wh[3], 2 * 1.86);
  // what his run and the lines of sight must clear: the wreck (its body 2.1 x 4.6 m to 1 m up, over the bonnet and the
  // boot; its cabin to 1.45 m), Dan's car where it stopped (Dan at its wheel: m2.js), the buildings (a point the city's
  // collision pushes out is inside one)
  const box = (x, z, h, hw, hl, y0, top) => ({ x, z, s: Math.sin(h), c: Math.cos(h), hw, hl, y0, top });
  const cab = P(-0.7, 0), boxes = [box(CX, CZ, CH, 1.05, 2.3, CY, 1.0), box(cab[0], cab[1], CH, 0.85, 1.3, CY, 1.45)];
  if (dan?.position) boxes.push(box(dan.position.x, dan.position.z, dan.heading ?? 0, 1.0, 2.4, G(dan.position.x, dan.position.z), 1.3));
  const inBox = (b, x, z, y, pad) => { const dx = x - b.x, dz = z - b.z; return Math.abs(dx * b.s + dz * b.c) < b.hl + pad && Math.abs(dx * b.c - dz * b.s) < b.hw + pad && (y == null || y < b.y0 + b.top + pad); };
  const _v = V();
  const wall = (x, z, r) => { _v.set(x, CY + 1, z); cm.resolveHorizontalCollision(_v, r, CY + 1); return Math.abs(_v.x - x) + Math.abs(_v.z - z) > 0.01; };
  const clear = (x, z, pad) => !wall(x, z, 0.35) && !boxes.some((b) => inBox(b, x, z, null, pad));
  const sees = (c, p, cars = true) => {
    const n = Math.ceil(Math.hypot(p[0] - c[0], p[2] - c[2]) / 0.2);
    for (let i = 1; i < n; i++) {
      const k = i / n, x = lerp(c[0], p[0], k), y = lerp(c[1], p[1], k), z = lerp(c[2], p[2], k);
      if ((cars && boxes.some((b) => inBox(b, x, z, y, 0.05))) || (i % 5 === 0 && wall(x, z, 0.05))) return false;
    }
    return true;
  };
  // (the first of a list that scores 1, else the best of it)
  const first = (list, score) => { let best = list[0], bs = -1; for (const c of list) { const s = score(c); if (s >= 1) return c; if (s > bs) { bs = s; best = c; } } return best; };
  // the low sun (the time of day's: js/lighting.js) across the ground: a camera with it behind or to the side sees his
  // face lit; one looking into it, a dark shape against the sky
  const sun = W.app.lightingSystem?.sunLight?.position || V(-0.52, 0.36, -0.77), sn = Math.hypot(sun.x, sun.z) || 1, SX = sun.x / sn, SZ = sun.z / sn;
  const lit = (c, m) => { const dx = c[0] - m[0], dz = c[2] - m[2], d = Math.hypot(dx, dz) || 1; return (dx * SX + dz * SZ) / d > -0.3; };
  // his way off and the cameras, worked out once (setup)
  let plan = null;
  function planned() {
    if (plan) return plan;
    // his way off: the way he was going (at.run; at Greeley Square, up Broadway), turned the least that runs 15 m clear
    // (of the wreck by 0.6 m) from a step off where he stands, and away from the low sun if any such way does (the
    // camera behind him sees his face lit for his line)
    const run = at.run || [0.6, -0.8], a0 = Math.atan2(run[0] * L[0] + run[1] * L[1], run[0] * F[0] + run[1] * F[1]);
    const ways = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9, -9, 10, -10, 11, -11, 12].map((k) => [Math.cos(a0 + k * PI / 12), Math.sin(a0 + k * PI / 12)]);
    const away = (e) => (e[0] * F[0] + e[1] * L[0]) * SX + (e[0] * F[1] + e[1] * L[1]) * SZ < 0.25;
    const E = first([...ways.filter(away), ...ways], (e) => { let n = 0; for (let s = 0.5; s <= 15.5; s += 0.75, n++) if (!clear(...P(STAND[0] + e[0] * s, STAND[1] + e[1] * s), 0.6)) break; return n / 21; });
    const T0 = [STAND[0] + E[0] * 0.5, STAND[1] + E[1] * 0.5];
    // where he is at t: three lurching steps out of the door (1.3 m), a step to stand over the phone, a step toward his
    // way off as he turns to Dan, then the run (from a standstill to 6.2 m/s)
    const walk = keys([[T.out, DOOR, 'linear'], [T.out + 0.45, [0.1, 1.75], 'linear'], [T.out + 0.95, [0.55, 2.15], 'out'], [T.look, STAND], [T.turn, STAND], [T.turn + 0.5, T0]]);
    const ran = (u) => (u <= 0 ? 0 : 6.2 * (u - 0.4 * (1 - Math.exp(-u / 0.4))));
    const xz = (t) => (t < T.run ? P(...walk(t)) : P(T0[0] + E[0] * ran(t - T.run), T0[1] + E[1] * ran(t - T.run)));
    const body = (t, y) => { const [x, z] = xz(t); return [x, G(x, z) + y, z]; };
    const lens = (f, l, y) => { const [x, z] = P(f, l); return [x, G(x, z) + y, z]; };
    const ring = (f, l, d, y, angs) => angs.map((a) => lens(f + Math.cos(a * PI / 180) * d, l + Math.sin(a * PI / 180) * d, y));
    // (a place's score: the share of his head (and hips, unless only his head need show) it sees at those times, less
    // with the sun in its eye; 0 inside anything)
    const watch = (c, ts, hips = true) => {
      if (!clear(c[0], c[2], 0.5)) return 0;
      let n = 0; for (const t of ts) n += hips ? (sees(c, body(t, 1.7)) ? 0.5 : 0) + (sees(c, body(t, 0.95)) ? 0.5 : 0) : sees(c, body(t, 1.7)) ? 1 : 0;
      return (n / ts.length) * (lit(c, body(ts[Math.floor(ts.length / 2)], 0)) ? 1 : 0.6);
    };
    // 1: the wreck from 9 m off its nose on his side (the smoke, his door), pushing in a metre
    const A1 = [40, 60, 25, 80, 100, 10, 120, 140, 160], i1 = A1.indexOf(first(A1, (a) => { const c = ring(0, 0, 9, 2.4, [a])[0]; return clear(c[0], c[2], 0.5) && sees(c, lens(0, 1.1, 1.0), false) ? 1 : 0; }));
    const c1 = (t) => ring(0, 0, lerp(9.5, 8.5, clamp(t / T.out)), 2.4, [A1[i1]])[0];
    // 2: him out of the door and his stagger, all of him, 4.2 m off his side of the nose
    const c2 = first(ring(0.6, 1.95, 4.2, 1.6, [18, 32, 5, 48, 62, 78, 95, 115, 135]), (c) => watch(c, [T.out + 0.05, T.out + 0.45, T.out + 0.95, T.look]));
    // 2b: 'My car!', over its smoking bonnet from off the nose: he looks at it, so at us (his head over it; else shot 2 on)
    const c2b = first([[4.4, -0.9], [4.7, 0.2], [4.2, -1.8], [4.9, 1.2], [3.8, -2.6]].map(([f, l]) => lens(f, l, 1.45)), (c) => watch(c, [T.look, 3.1, 3.6, 4.0, T.turn - 0.05], false));
    const c2bOk = watch(c2b, [T.look, 3.1, 3.6, 4.0, T.turn - 0.05], false) >= 1;
    // 3: his line and his run, from Dan's way: back from where he turns (behind his way off), a little to one side, so he
    // faces it for his line and runs away from it
    const back = Math.atan2(-E[1], -E[0]) * 180 / PI;
    const c3 = first([4.6, 3.6].flatMap((d) => ring(T0[0], T0[1], d, 1.5, [18, -18, 35, -35, 55, -55, 75, -75, 0].map((a) => back + a))), (c) => watch(c, [T.turn + 0.1, T.line, 6.0, T.run, 7.2, 7.8, 8.4, T.end]));
    // his facing: along his way through the stagger; round to the nose for 'My car!'; to the camera (Dan's way) for his
    // line; his way off for the run
    const hTo = (t, x, z) => { const m = xz(t); return Math.atan2(x - m[0], z - m[1]); };
    const hWay = (t) => { const a = xz(t - 0.06), b = xz(t + 0.12); return Math.atan2(b[0] - a[0], b[1] - a[1]); };
    const hE = Math.atan2(E[0] * F[0] + E[1] * L[0], E[0] * F[1] + E[1] * L[1]), a2 = T.out + 0.85;
    const face = (t) => (t < a2 ? hWay(Math.max(t, T.out + 0.06))
      : t < T.turn ? turn(hWay(a2), hTo(t, NOSE[0], NOSE[1]), sm((t - a2) / 0.55))
      : t < T.run ? turn(hTo(T.turn, NOSE[0], NOSE[1]), hTo(t, c3[0], c3[2]), sm((t - T.turn) / 0.45))
      : turn(hTo(T.run, c3[0], c3[2]), hE, sm((t - T.run) / 0.4)));
    return (plan = { E, xz, body, face, c1, c2, c2b: c2bOk ? c2b : null, c3 });
  }
  // the stagger over his clip: his back swaying side to side and pitched forward, his head hung, his arms out from his
  // sides for balance; strongest over his first steps out of the door, gone as he finds his feet (T.free). (Each bone put
  // back to the clip's own pose first, every frame: the mixer writes a bone only when its value changes, so a turn would
  // pile up frame on frame)
  const bent = new Map(), _r = new THREE.Quaternion(), _r2 = new THREE.Quaternion(), _fw = V(), _lf = V();
  const unbend = () => { for (const [b, q] of bent) if (b.quaternion.equals(q.after)) b.quaternion.copy(q.before); bent.clear(); };
  function stagger(t) {
    const u = t - T.out, k = u < 0.12 ? clamp(u / 0.12) : 1 - sm((u - 0.5) / (T.free - T.out - 0.5));
    if (k <= 0.001) return;
    const h = mack.root.rotation.y, roll = 0.13 * Math.sin(u * 8.4 + 0.5);
    _fw.set(Math.sin(h), 0, Math.cos(h)); _lf.set(Math.cos(h), 0, -Math.sin(h)); mack.root.updateMatrixWorld(true);
    // (roll: about his forward, + toward his right; pitch: about his left, + forward)
    const tilt = (n, r, p) => { const b = mack.bones[n]; if (!b) return; const before = b.quaternion.clone(); turnWorld(b, _r.setFromAxisAngle(_fw, r * k).multiply(_r2.setFromAxisAngle(_lf, p * k))); bent.set(b, { before, after: b.quaternion.clone() }); };
    tilt('spine', roll * 0.45, 0.08); tilt('spine1', roll * 0.35, 0.07); tilt('spine2', roll * 0.2, 0.05); tilt('head', -roll * 0.3, 0.16);
    tilt('upperArmL', 0.38 + roll * 0.4, 0); tilt('upperArmR', -0.38 + roll * 0.4, 0);
  }
  // his lanyard (m2-set.js buildMack; this is the one scene he is in): there a navy ring 0.3 m across round his neck that
  // stood off his chest and out behind his back as soon as he moved, his pass inside his jacket. Laid on him instead,
  // once: a cord out from under his collar down both sides of his chest to the pass, the pass flat on his chest, both on
  // his chest bone, fitted to his clothes as he stands (the Suits' stand)
  function lanyard(stand) {
    const sp = mack.bones.spine2, nk = mack.bones.neck;
    if (mack.lanyardOn || !sp || !nk) return;
    const ring = sp.children.find((o) => o.isMesh && o.geometry?.type === 'TorusGeometry'), pass = sp.children.find((o) => o.isMesh && o.geometry?.type === 'BoxGeometry');
    if (!ring || !pass) return;
    mack.lanyardOn = true;
    mack.rig.set([[0, stand]]); mack.rig.pose(0); mack.inner.updateMatrixWorld(true);
    // (his clothes and skin as posed, in his own frame: +z his front, +x his left)
    const me = mack.inner.matrixWorld.clone().invert(), pts = [];
    mack.inner.traverse((m) => {
      if (!m.isSkinnedMesh || !/^(clothes|skin)$/.test(m.material?.name || '')) return;
      const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) pts.push(m.getVertexPosition(i, V()).applyMatrix4(m.matrixWorld).applyMatrix4(me));
    });
    const N = nk.getWorldPosition(V()).applyMatrix4(me), z0 = N.z + 0.08;
    // (his front at x, y: the furthest forward of him there)
    const front = (x, y) => { let z = null; for (const q of pts) if (Math.abs(q.x - x) < 0.018 && Math.abs(q.y - y) < 0.018 && q.z > N.z - 0.03 && (z == null || q.z > z)) z = q.z; return z ?? z0; };
    const yC = N.y - 0.22, path = [];
    for (const sx of [1, -1]) {
      const side = [];
      for (let i = 0; i <= 6; i++) { const s = i / 6, x = sx * lerp(0.062, 0.02, s), y = lerp(N.y - 0.02, yC + 0.05, s); side.push(V(x, y, front(x, y) + (i ? 0.005 : -0.008))); }
      path.push(...(sx > 0 ? side : side.reverse()));
    }
    const toSp = sp.matrixWorld.clone().invert().multiply(mack.inner.matrixWorld);
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 40, 0.0042, 5, false); geo.applyMatrix4(toSp);
    const cord = new THREE.Mesh(geo, ring.material); cord.name = 'mack-lanyard'; cord.castShadow = true; cord.frustumCulled = false;
    sp.remove(ring); ring.geometry.dispose(); sp.add(cord);
    // (the pass at the cord's foot, tilted to the slope of his chest there)
    const zU = front(0, yC + 0.04), zD = front(0, yC - 0.04), zc = front(0, yC);
    const card = new THREE.Matrix4().compose(V(0, yC, Math.max(zc, (zU + zD) / 2) + 0.007), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.atan2(zU - zD, 0.08)), V(1, 1, 1));
    toSp.clone().multiply(card).decompose(pass.position, pass.quaternion, pass.scale);
  }
  return {
    END: T.end, hero: false, drop,
    // (handed back looking at where Mack's phone fell: the next step)
    face: { x: drop[0], z: drop[1] },
    shots: [
      { t: 0, cam: (t) => ({ pos: planned().c1(t), look: [CX, CY + 0.85, CZ], fov: 38, shake: 1.2 }) },
      { t: T.out, cam: (t) => ({ pos: planned().c2, look: planned().body(clamp(t, T.out + 0.25, T.turn), 1.25), fov: 38, shake: 0.7 }) },
      { t: 2.65, cam: (t) => { const p = planned(); return p.c2b ? { pos: p.c2b, look: p.body(t, 1.5), fov: 30, shake: 0.6 } : { pos: p.c2, look: p.body(clamp(t, T.out + 0.25, T.turn), 1.25), fov: 38, shake: 0.7 }; } },
      { t: T.turn, cam: (t) => ({ pos: planned().c3, look: planned().body(t, 1.35), fov: lerp(32, 26, sm((t - T.run) / 2)), shake: 0.6 }) },
    ],
    cues: [
      [0.1, () => { if (Math.hypot(at.x - CRASH.x, at.z - CRASH.z) < 2) ui.place('Greeley Square', 'Herald Square · New York', 3); }],
      [T.out - 0.2, () => { const [x, z] = P(...DOOR); W.audio?.play?.('doorOpen', { pos: [x, 1, z] }); }],
      [T.out + 0.6, (st) => say([['Mack', ACID, 'My car! My beautiful leveraged car!']], st)],
      [T.drop, () => sfx?.play('thunk', { gain: 0.2, f: 300, ring: false })],
      [T.line, (st) => say([['Mack', ACID, 'Keep the phone! Call it severance!']], st)],
    ],
    pose(t, dt) {
      mackCar.group.visible = true; mackCar.group.position.set(CX, CY, CZ); mackCar.group.rotation.set(PITCH, CH, ROLL, 'YXZ'); mackCar.update(dt);
      const out = t >= T.out;
      mack.root.visible = out && t < T.end - 0.1;
      if (out) {
        const p = planned(), [x, z] = p.xz(t);
        mack.root.position.set(x, G(x, z), z); mack.root.rotation.y = p.face(t);
        unbend(); mack.rig.pose(t); stagger(t);
      }
      phone.visible = t >= T.drop; if (t >= T.drop) { phone.position.set(drop[0], G(drop[0], drop[1]) + 0.012, drop[1]); phone.rotation.set(-PI / 2, 0, 0.6); }
    },
    setup() {
      const p = planned(), has = (n) => mack.clips.includes(n), pick = (...n) => n.find(has);
      const stand = pick('suitIdle', 'thugIdle');
      lanyard(stand);
      // (each gait timed by the ground his path covers over the speed its feet carry it at its own rate (combat/enemy.js
      // LOCO), so his feet stay planted: the Suits' upright walks and dash, the motion capture (assets/anim/bandai))
      const MPS = { suitWalk: 1.358, suitWalk2: 1.488, walk: 0.82, suitDash: 4.852, run: 4.69 }, odo = (a, b) => odometer(p.xz, a, b);
      const lurch = pick('suitWalk2', 'suitWalk', 'walk'), step = pick('suitWalk', 'walk'), dash = pick('suitDash', 'run');
      // ('My car!': a hand out to it (the Suits' guiding gesture); his line: the Suits' wave goodbye)
      const gesture = pick('suitIdleGuide') || stand, bye = pick('suitTauntBye') || stand;
      mack.rig.set([[0, stand],
        [T.out, lurch, { along: odo(T.out, T.out + 0.95), mps: MPS[lurch], fade: 0.12 }],
        [T.out + 0.95, step, { along: odo(T.out + 0.95, T.look), mps: MPS[step], fade: 0.3 }],
        [T.look - 0.05, gesture, { from: 0.4, fade: 0.4 }],
        [T.turn, step, { along: odo(T.turn, T.turn + 0.5), mps: MPS[step], fade: 0.25 }],
        [T.turn + 0.4, bye, { fade: 0.35 }],
        [T.run, dash, { along: odo(T.run, T.end), mps: MPS[dash], fade: 0.3 }]]);
    },
    cleanup() { unbend(); mack.root.visible = false; },
  };
}

/* ------------------------------------------------------------- phone -- */
// Dan reading Mack's phone where it fell: the chat on the screen, his face. ~15 s.
export function phoneScene(W, { U, say, at }) {
  const C = W.cast, ui = W.ui, sfx = W.sfx;
  const [QX, QZ, QH] = at, G = W.app.controllerManager.getGroundHeight(QX, QZ, 'person');
  const F = [Math.sin(QH), Math.cos(QH)], R = [-Math.cos(QH), Math.sin(QH)];
  const p = (f, r, y) => [QX + F[0] * f + R[0] * r, y, QZ + F[1] * f + R[1] * r];
  let ps = null;
  return {
    END: 15.5,
    shots: [
      { t: 0, cam: (t) => ({ pos: keys([[0, p(-1.9, 0.8, G + 1.9)], [9.5, p(-1.7, 0.7, G + 1.85)]], 'linear')(t), look: p(1.4, -0.3, G + 1.3), fov: 42, shake: 0.3 }) },
      { t: 9.5, cam: (t) => ({ pos: keys([[9.5, p(1.9, -1.1, G + 1.66)], [15.5, p(1.7, -1.0, G + 1.66)]], 'linear')(t), look: p(0, 0, G + 1.6), fov: 30, shake: 0.3 }) },
    ],
    cues: [
      [0.4, () => { sfx?.play('buzz', { gain: 0.14, times: 1 }); U.chat([
        ['knox', ACID, 'laptop secured. Mr. Big says hold'],
        ['dash', '#F59E0B', 'wait what laptop'],
        ['mack', ACID, 'banker boy is FOLLOWING MY VAN lmao'],
        ['tank', ACID, "found banker boy's crib. E 37th", { photo: true, hold: 1.8 }],
        ['mr.big', '#E9EEF5', 'Nobody opens the laptop. It gets shredded Friday.'],
        ['rook', '#6CB8FF', "guys he's a first-year. this is getting weird"],
      ], { every: 1250 }); }],
      [10.0, (st) => say([['Dan', WHITE, 'That is my door.'], ['Dan', WHITE, 'They know where I live.']], st)],
    ],
    pose(t) {
      ps = ps || poser(W, C);
      ps.at(QX, QZ, QH); ps.pose(t, QH);
      holdPhone(W, C.phone, QH, clamp(t / 0.6) * (1 - clamp((t - 13.6) / 0.6))); if (C.phone.visible) C.phone.show?.('off', t);
    },
    setup() { C.qRig.set([[0, 'idle'], [10.0, ['idle/noArmL', ['talk/armL', { from: 1.3, speed: 0.6 }]], { fade: 0.4 }], [14.0, 'idle', { fade: 0.6 }]]); },
    cleanup() { C.phone.visible = false; ui.phone.hide(); },
  };
}
