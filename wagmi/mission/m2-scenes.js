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
    ['Jane', BLUE, 'You got tagged in four hundred posts today. Moon has a bigger following than you.'],
    ['Dan', WHITE, 'Everyone has a bigger following than me. They just hate me.'],
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
      const kb = V(...p(-0.2, 0, 0.8)), type = 0.012 * Math.sin(t * 19), type2 = 0.012 * Math.sin(t * 23 + 1.3);
      const reach = hand != null ? clamp((t - hand) / 0.5) * (1 - clamp((t - hand - 1.2) / 0.5)) : 0;
      const sh = J.bones.upperarm01_R.getWorldPosition(V()), shL = J.bones.upperarm01_L.getWorldPosition(V());
      const Rv = V(R[0], 0, R[2]), Fv = V(F[0], 0, F[2]);
      J.arm('L', kb.clone().addScaledVector(Rv, -0.12).add(V(0, type2, 0)), shL.clone().addScaledVector(Rv, -0.5).add(V(0, -0.5, 0)), 0.9);
      J.arm('R', kb.clone().addScaledVector(Rv, 0.12).add(V(0, type, 0)).lerp(V(...p(0.2, -0.2, 0.98)), reach), sh.clone().addScaledVector(Rv, 0.5).add(V(0, -0.5, 0)), 0.9);
      // her face (jane.js face.live): her mouth with her voice, her eyes on him once he's at the table (on her laptop as
      // he walks up), glancing down at her screen, blinking; her head following her eyes a little
      const qHead = W.dan?.bones?.head?.getWorldPosition(V()) || V(QM[0], G + 1.6, QM[2]), scr = lap.localToWorld(V(0, 0.13, -0.1));
      J.face.live(dt, { talking: speaking === 'Jane', text: speaking === 'Jane' ? lineText : '', look: t < T.at - 0.4 ? scr : qHead, alt: scr });
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
  return runScene(W, def);
}

/* ------------------------------------------------------------- crash -- */
// Greeley Square. ~9 s. mackCar: the car (smoking), mack: Mack's rig, phone: the phone mesh he drops
export function crashScene(W, { mackCar, mack, phone, say, at = CRASH }) {
  const cm = W.app.controllerManager, ui = W.ui, sfx = W.sfx;
  const { x: CX, z: CZ, h: CH } = at;
  // the driver's door (his left): out of it, a stumble, the phone dropped, then off north-east at a run
  const L = [Math.cos(CH), -Math.sin(CH)];
  const door = [CX + L[0] * 1.45, CZ + L[1] * 1.45];
  // (off up the road: the way he was going, or at Greeley Square up Broadway)
  const run = at.run || [0.6, -0.8];
  const away = [CX + run[0] * 42, CZ + run[1] * 42];
  const drop = [CX + L[0] * 2.5 + Math.sin(CH) * 0.6, CZ + L[1] * 2.5 + Math.cos(CH) * 0.6];
  const T = { out: 1.4, drop: 3.6, run: 4.6, end: 9.0 };
  // (27 Oct: he holds by the door through his stumble (0.15 m of it), then walks the rest to where the phone falls, eased
  // in and out, upright (the Suits' walk timed by the ground it covers): he used to slide the whole way through the stumble
  // and shuffle, crouched, at 0.4 m/s; where he gets out, where he drops it and the dash are as they were)
  const st = [lerp(door[0], drop[0] + 0.4, 0.12), lerp(door[1], drop[1] - 0.3, 0.12)];
  const lx = keys([[T.out, door[0]], [T.out + 1.5, st[0]], [T.run, drop[0] + 0.4], [T.end, away[0]]], 'linear'), lz = keys([[T.out, door[1]], [T.out + 1.5, st[1]], [T.run, drop[1] - 0.3], [T.end, away[1]]], 'linear');
  const wx = keys([[T.out + 1.5, st[0]], [T.run, drop[0] + 0.4]]), wz = keys([[T.out + 1.5, st[1]], [T.run, drop[1] - 0.3]]);
  const lxw = (t) => (t > T.out + 1.5 && t < T.run ? wx(t) : lx(t)), lzw = (t) => (t > T.out + 1.5 && t < T.run ? wz(t) : lz(t));
  return {
    END: T.end, hero: false, drop,
    // (handed back looking at where Mack's phone fell: the next step)
    face: { x: drop[0], z: drop[1] },
    shots: [
      { t: 0, cam: (t) => ({ pos: keys([[0, [CX + 14, 2.4, CZ - 9]], [T.out, [CX + 12.5, 2.1, CZ - 8]]], 'linear')(t), look: [CX, 1.0, CZ], fov: 40, shake: 1.2 }) },
      { t: T.out, cam: () => ({ pos: [door[0] + 4.2, 1.5, door[1] + 2.4], look: [lx(T.out + 1), 1.2, lz(T.out + 1)], fov: 36, shake: 0.7 }) },
      { t: T.run, cam: (t) => ({ pos: [drop[0] - 2.2, 0.6, drop[1] + 2.4], look: [lerp(drop[0], lx(t), 0.7), lerp(0.3, 1.2, clamp((t - T.run) / 1.5)), lerp(drop[1], lz(t), 0.7)], fov: 42, shake: 0.6 }) },
    ],
    cues: [
      [0.1, () => { if (Math.hypot(at.x - CRASH.x, at.z - CRASH.z) < 2) ui.place('Greeley Square', 'Herald Square · New York', 3); }],
      [T.out - 0.2, () => W.audio?.play?.('doorOpen', { pos: [door[0], 1, door[1]] })],
      [T.out + 0.6, (st) => say([['Mack', ACID, 'My car! My beautiful leveraged car!']], st)],
      [T.drop, () => sfx?.play('thunk', { gain: 0.2, f: 300, ring: false })],
      [T.run + 0.3, (st) => say([['Mack', ACID, "Not financial advice! None of it! Ever!"]], st)],
    ],
    pose(t, dt) {
      mackCar.group.visible = true; mackCar.group.position.set(CX, 0, CZ); mackCar.group.rotation.set(0, CH, 0.04); mackCar.update(dt);
      const out = t >= T.out;
      mack.root.visible = out && t < T.end - 0.1;
      if (out) {
        const x = lxw(t), z = lzw(t), nx = lx(t + 0.1), nz = lz(t + 0.1);
        mack.root.position.set(x, cm.getGroundHeight(x, z, 'person'), z);
        // (facing the phone through the stumble, then turned (over 0.3 s) the way he walks, so the walk goes where he faces)
        const h0 = Math.atan2(drop[0] - door[0], drop[1] - door[1]), hw = Math.atan2(drop[0] + 0.4 - st[0], drop[1] - 0.3 - st[1]), dh = Math.atan2(Math.sin(hw - h0), Math.cos(hw - h0));
        mack.root.rotation.y = t < T.run ? h0 + dh * clamp((t - T.out - 1.5) / 0.3) : Math.atan2(nx - x, nz - z);
        mack.rig.pose(t);
      }
      phone.visible = t >= T.drop; if (t >= T.drop) { phone.position.set(drop[0], cm.getGroundHeight(drop[0], drop[1], 'person') + 0.012, drop[1]); phone.rotation.set(-PI / 2, 0, 0.6); }
    },
    setup() {
      const has = (n) => mack.clips.includes(n);
      // (27 Oct: each gait played at his path's own speed over the speed its feet carry it on this rig, measured (the
      // motion audit: thug.glb walk 0.82, run 4.69, sprint 8.1 m/s at its own rate), so his feet stay planted: the shuffle
      // from the door to where the phone falls (~0.4 m/s) at half the walk's rate, not 0.8 (its feet slid 0.25 m/s); the
      // dash up the road (42 m in 4.4 s, 9.5 m/s) on the sprint at 1.17, not the run at 1 (its feet slid 5 m/s))
      // (27 Oct: upright. Standing, the Suits' stand; the walk to the phone, the Suits' walk with its clip time from the
      // metres his path covers (captured at 1.358 m/s), so its planted feet stay put through the ease in and out)
      const sp = (a, b, s) => Math.hypot(lx(b) - lx(a), lz(b) - lz(a)) / (b - a) / s, dash = has('sprint') ? ['sprint', 8.1] : has('run') ? ['run', 4.69] : ['jog', 2.57];
      const stand = has('suitIdle') ? 'suitIdle' : 'thugIdle', walk = has('suitWalk') ? { clip: 'suitWalk', along: odometer((t) => [lxw(t), lzw(t)], T.out + 1.5, T.run), mps: 1.358 } : { clip: 'walk', speed: clamp(sp(T.out + 1.5, T.run, 0.82), 0.35, 1.4) };
      mack.rig.set([[0, stand], [T.out, has('thugStumbleBack') ? 'thugStumbleBack' : stand, { fade: 0.1, loop: false, speed: 0.7 }], [T.out + 1.5, walk.clip, { ...walk, clip: undefined, fade: 0.3 }],
        [T.run, dash[0], { fade: 0.25, speed: clamp(sp(T.run, T.end, dash[1]), 0.6, 2) }]]);
    },
    cleanup() { mack.root.visible = false; },
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
