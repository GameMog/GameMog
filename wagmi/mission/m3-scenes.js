// Mog City: Mission 3's scenes, on the cutscene machinery (cine.js, run by Mission 2's runScene): a clock, the shots
// as functions of it, the cast posed from it, cues fired as it passes them; Space held skips.
//   night   the night after Mission 2, in the garage: Dan on the old couch, Moon's photo on his phone, lights out;
//           NEXT MORNING (a clock runs the night through); the sun low through the door, him asleep sitting up, waking
//   garage  the Static Garage at midday, the next day: the street outside, then the bay: Gears' legs out from under
//           Dan's car ("Cold-gas thrusters..."), Jane's video call: JPBank's community day next to the Occupy camp, and
//           its smear reel on the screens (Dan, ten feet tall: 'the bad apple')
//   rally   Washington Square: the stage under the arch, the reel on the big screen, Fiona on the megaphone, the camp
//           chanting back from its tents; a Suit planted in the crowd spots Dan; then over his shoulder on the lawn, the
//           three screen rigs ahead of him (the job's card up over it)
//   dump    the third rig down: the reel dies mid-sentence (NO SIGNAL), Fiona drops the megaphone and runs for her SUV on
//           5th Ave; Ms. Bea's people's mic over the empty stage, the camp chanting "Free Dan!"; then
//           what the rigs bought him: Mack's phone (still in the Suits' chat) buzzes, Mr. Big changes the plan for the laptop
//           (shredded at dawn) and names the driver: Rook, who DMed Dan last night (Mission 4's lead)
//   home    back at the garage: Gears at the door, the car "in one piece", one line from Dan about Moon, the news of the
//           park's chant
// Each is paced by its lines (a shot starts with its line) or fixed, and returns when it ends (or is skipped).
import * as THREE from 'three/webgpu';
import { upright, UPRIGHT_BONES, place } from '../intro.js';
import { keys, clamp, lerp, spline, travel, rig } from './cine.js';
import { GARAGE, ARCH, STAGE, FIONA_AT, SUV_AT, SCREEN_Z, CROWD_CAM, RIGS, BEA_AT, drawMoon, drawHeart } from './m3-set.js';

const PI = Math.PI;
const WHITE = '#FFFFFF', BLUE = '#6CB8FF', ACID = '#B6FF3B', GOLD = '#FFC93C', PINK = '#FF8AD8', BEA = '#FFB86B', CAMP = '#E8D9B0';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GX = GARAGE.x, GZ = GARAGE.z, GY = 0.22;
export const SPOT = {
  car: [GX + 1.2, GZ + 6.2, PI],             // in the bay, nose to the door
  dan: [GX - 1.6, GZ + 3.9, 0.59],         // by the car's nose, looking at Gears' legs
  gearsLie: [GX - 0.45, GZ + 5.4],           // his feet, out from under the car's left side (his head under it, east)
  gears: [GX - 1.9, GZ + 6.3, 3.02],         // up, facing Dan
  // after: the car at the curb, Dan on the sidewalk facing its door and W 22nd St east beyond it (the way on; facing
  // the street (PI) had the hand-back's view on the facade across it, the route ~70 degrees off)
  out: { car: [GX + 6, 1603.6, PI / 2], dan: [GX - 1.2, 1607.6, Math.atan2(7.2, -4.0)] },
  // the home scene (23 Oct: a metre more between them, across the wide shot's line, which had him right in front of Gears)
  door: { gears: [GX + 0.9, GZ - 1.4], dan: [GX - 1.9, 1607.6] },
};
// where Dan's car waits for the escape: just into Washington Mews off 5th Ave, facing east down it, the open street
// away from the Suits (they come out of W 8th St and down 5th Ave from the north-west). (5th Ave by the arch is a
// dead end at the square, so the car there faced north, straight at them; 23 Oct.) Clear of Fiona's way up 5th Ave
export const ESCAPE_CAR = [9.5, 2745.3, PI / 2];

/* ------------------------------------------------------------ helpers -- */
function poser(W, C) {
  const Q = W.dan, P = W.person, cm = W.app.controllerManager;
  const ub = UPRIGHT_BONES.map((n) => Q.bones[n]).filter(Boolean), ub0 = ub.map((b) => b.quaternion.clone());
  return {
    at(x, z, h) { P.position.set(x, cm.getGroundHeight(x, z, 'person'), z); P.heading = h; P.mesh.position.copy(P.position); P.mesh.rotation.y = h; P.mesh.visible = true; },
    pose(t, h, k = 1) { ub.forEach((b, i) => b.quaternion.copy(ub0[i])); C.qRig.pose(t); ub.forEach((b, i) => ub0[i].copy(b.quaternion)); Q.body.position.y = 0; Q.body.rotation.x = 0; upright(W, h, k); },
  };
}
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
// his phone up in front of him in his right hand (k 0..1)
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
const drift = (a, b, secs) => (t, t0) => keys([[t0, a], [t0 + secs, b]], 'linear')(t);
// a thug rig placed and posed: x, z, heading, the scene clock
function stand(W, P, x, z, h, t, { y = null, lie = false } = {}) {
  const cm = W.app.controllerManager;
  P.root.visible = true;
  P.root.rotation.order = 'YXZ';
  if (lie) { P.root.rotation.set(-PI / 2, h, 0); P.root.position.set(x, y ?? cm.getGroundHeight(x, z, 'person'), z); }
  else { P.root.rotation.set(0, h, 0); P.root.position.set(x, y ?? cm.getGroundHeight(x, z, 'person'), z); }
  P.rig.pose(t);
}

// (Mog City, 27 Oct) a run's legs from the ground covered, not the clock: the run clip's time is the metres run over
// its own speed at 1x (P.runSpeed, measured on the body it was retargeted to), so every stride covers exactly the ground
// it takes, whatever the pace (her start, her sprint): no foot slides. After the rig's pose, before anything posed on it
function runAt(P, dist) {
  const a = P.runSpeed > 0 && P.rig.action('run'); if (!a) return;
  const d = a.getClip().duration; a.time = (((dist / P.runSpeed) % d) + d) % d; P.mixer.update(0);
}

/* ------------------------------------ JPBank's broadcast (the call) -- */
// what Jane shares: JPBank's own broadcast of its community day (an original drawing): the arch, JPBANK ♥ NY on the
// banner, LIVE and the viewers on a strip under it (the call's own header has the top), the big screen running the
// reel (a head-and-shoulders silhouette, BAD APPLE), Fiona in white on the
// megaphone, the camp's tents and a cardboard sign either side, the chat going by (the Suits planted in it too)
function streamSVG() {
  const face = document.createElement('canvas'); face.width = face.height = 96; drawHeart(face.getContext('2d'), 48, 50, 34);
  const logo = face.toDataURL();
  return `<svg class="map" viewBox="0 0 90 192" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="m3sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FC3EA"/><stop offset="1" stop-color="#D9ECF7"/></linearGradient></defs>
  <rect width="90" height="192" fill="url(#m3sky)"/>
  <rect x="0" y="40" width="14" height="80" fill="#B9A28A"/><rect x="76" y="34" width="14" height="86" fill="#A88E76"/>
  <path d="M14 120 L14 46 L76 46 L76 120 L58 120 L58 80 Q45 58 32 80 L32 120 Z" fill="#EDE8DE"/>
  <rect x="14" y="46" width="62" height="12" fill="#E3DDD1"/>
  <rect x="17" y="47" width="56" height="10" fill="#0E2A5C" stroke="#E8364F" stroke-width=".8"/>
  <image href="${logo}" x="18" y="46.5" width="11" height="11"/>
  <text x="31" y="55" font-family="Barlow Condensed" font-weight="800" font-style="italic" font-size="7.5" fill="#FFFFFF">JPBANK ♥ NY</text>
  <rect x="24" y="78" width="42" height="26" fill="#0E1B33" stroke="#222" stroke-width="1"/>
  <rect x="26" y="80" width="15" height="22" fill="#9FB3C8"/><circle cx="33.5" cy="87.5" r="3.6" fill="#2A3442"/><path d="M27 102 Q27 94 33.5 93.6 Q40 94 40 102 Z" fill="#2A3442"/>
  <rect x="26" y="96" width="15" height="2.6" fill="#E8364F"><animate attributeName="opacity" values="1;.4;1" dur="1.2s" repeatCount="indefinite"/></rect>
  <text x="43" y="87" font-family="Barlow Condensed" font-weight="800" font-size="5.6" fill="#FFFFFF">BAD APPLE</text><text x="43" y="93" font-family="Barlow Condensed" font-weight="700" font-size="3.4" fill="#E8364F">WE CAUGHT HIM</text>
  <rect x="0" y="118" width="90" height="74" fill="#5D6B4E"/><rect x="10" y="118" width="70" height="7" fill="#2A2D33"/>
  <path d="M-2 140 L6 127 L14 140 Z" fill="#D9792B"/><path d="M6 127 L9 140 L14 140 Z" fill="#9E5520"/><path d="M76 138 L83 126 L92 138 Z" fill="#2E6FB0"/><path d="M83 126 L86 138 L92 138 Z" fill="#1F4F82"/>
  <rect x="64.6" y="121" width=".8" height="12" fill="#6B5034"/><rect x="58" y="114" width="14" height="8" fill="#C9A675" transform="rotate(-4 65 118)"/><text x="59.4" y="119.6" font-family="Barlow Condensed" font-weight="800" font-size="3.4" fill="#1A1A1A" transform="rotate(-4 65 118)">OCCUPY</text>
  <g transform="translate(45 104)">
    <ellipse cx="0" cy="12" rx="6" ry="9" fill="#F1F1F4"/><rect x="-4" y="19" width="3" height="10" fill="#1B1C20"/><rect x="1" y="19" width="3" height="10" fill="#1B1C20"/>
    <circle cx="0" cy="0" r="3.4" fill="#C9906E"/><path d="M-3.6 -0.6 Q0 -6 3.6 -0.6 L3.4 1 Q0 -2 -3.4 1 Z" fill="#EDE3C8"/><path d="M2.8 -1 Q6 4 4 10" stroke="#EDE3C8" stroke-width="1.6" fill="none"/>
    <rect x="-2.9" y="-0.6" width="5.8" height="1.5" rx=".6" fill="#F4F4F6"/>
    <path d="M-5 6 L-10 2 L-11 7 Z" fill="#F2F2F0"/><path d="M5 7 L9 -2" stroke="#F1F1F4" stroke-width="2.2" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 5 7;-18 5 7;0 5 7" dur=".5s" repeatCount="indefinite"/></path>
  </g>
  ${[[10, 140], [22, 146], [70, 142], [80, 150], [58, 152], [32, 156], [46, 160], [16, 166]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${['#3A2E28', '#1C1E22', '#7A5236', '#2B2F36'][i % 4]}"/><rect x="${x - 3.6}" y="${y + 2.6}" width="7.2" height="9" rx="2" fill="${['#2E3440', '#B6FF3B', '#5D2E3A', '#1D2026'][i % 4]}"/>`).join('')}
  <rect x="16" y="60.5" width="58" height="9" rx="2" fill="rgba(8,10,14,.72)"/>
  <rect x="17.5" y="61.8" width="15" height="6.4" rx="1.4" fill="#EF4444"/><text x="20" y="66.8" font-family="Barlow Condensed" font-weight="800" font-size="5" fill="#fff">LIVE</text>
  <text x="35" y="66.8" font-family="Barlow Condensed" font-weight="700" font-size="4.8" fill="#fff">11.2K WATCHING</text>
  <g font-family="Barlow Condensed" font-weight="700" font-size="4.8" fill="#fff">
    <text x="5" y="172"><tspan fill="#B6FF3B">brick</tspan> BOO THE BAD APPLE</text><text x="5" y="178"><tspan fill="#FFC93C">tank</tspan> free hot dogs tho</text><text x="5" y="184"><tspan fill="#B6FF3B">dash</tspan> wait is this the bank one</text>
  </g>
</svg>`;
}
export function streamCall(W, U) {
  U.call.show();
  const c = W.ui.phone.el.querySelector('.content .m2-call'); if (!c) return;
  const old = c.querySelector('svg.map'); if (old) old.outerHTML = streamSVG();
  const tag = c.querySelector('.tag'); if (tag) tag.innerHTML = 'JPBANK LOVES NEW YORK · LIVE · 11.2K WATCHING<b>Washington Square Arch</b>';
}

/* ------------------------------------------------------------- garage -- */
// U: Mission 2's overlays (the call), say(lines, st, onLine), cast { car: W.car, gears, garage }
export function garageScene(W, { U, say, gears, garage }) {
  const C = W.cast, ui = W.ui, sfx = W.sfx;
  const [QX, QZ, QH] = SPOT.dan, G = W.app.controllerManager.getGroundHeight(QX, QZ, 'person');
  const F = [Math.sin(QH), Math.cos(QH)], Rr = [-Math.cos(QH), Math.sin(QH)];
  const at = (f, r, y) => [QX + F[0] * f + Rr[0] * r, G + y, QZ + F[1] * f + Rr[1] * r];
  const T = { inside: 3.6, ring: Infinity, up: null, down: null };
  let ps = null, talkUntil = 0, gearsUp = false;
  const LINES = [
    ['Gears', GOLD, 'Cold-gas thrusters. Little puffs of nitrogen. Very safe. Mostly.'],
    ['Dan', WHITE, 'Define mostly.'],
    ['Gears', GOLD, "I tested them on my van. Van's fine. It's on the roof now."],
    ['Jane', BLUE, "Dan. Are you watching this? JPBank's throwing a party in Washington Square."],
    ['Fiona', PINK, 'JPBank loves New York! Free hot dogs! Free tote bags!'],
    ['Jane', BLUE, 'Right next to the Occupy camp. Now look at their screens.'],
    ['Jane', BLUE, "It's you. Ten feet tall, three times. 'The bad apple.'"],
    ['Dan', WHITE, "I'm going to go unplug it."],
    ['Gears', GOLD, 'Go get your name back, kid.'],
  ];
  const OTS = { cam: (t, t0) => ({ pos: drift(at(-1.7, 0.72, 1.86), at(-1.55, 0.68, 1.84), 5)(t, t0), look: at(1.5, 0.22, 1.36), fov: 42, shake: 0.3 }) };
  const def = {
    END: Infinity, exposure: null,
    shots: [
      // W 22nd St at midday: the garage's sign, its door half up
      { t: 0, cam: (t, t0) => ({ pos: drift([GX - 12.5, 1.9, GZ - 14.5], [GX - 11, 2.1, GZ - 13.2], 4)(t, t0), look: drift([GX + 0.4, 3.3, GZ], [GX, 3.0, GZ], 4)(t, t0), fov: 46, shake: 0.4 }) },
      // the bay: his legs out from under the car, Dan at its nose
      { t: T.inside, cam: (t, t0) => ({ pos: drift([GX - 4.3, GY + 1.05, GZ + 9.2], [GX - 4.0, GY + 1.0, GZ + 8.8], 6)(t, t0), look: [GX - 1.0, GY + 0.45, GZ + 5.0], fov: 44, shake: 0.35 }) },
      { line: 1, t: Infinity, cam: (t, t0) => ({ pos: drift([GX - 0.85, GY + 1.25, GZ + 5.7], [GX - 0.9, GY + 1.3, GZ + 5.55], 3)(t, t0), look: [QX, GY + 1.55, QZ], fov: 34, shake: 0.3 }) },
      { line: 2, t: Infinity, cam: (t, t0) => ({ pos: drift([GX - 1.05, GY + 1.5, GZ + 4.0], [GX - 1.1, GY + 1.48, GZ + 4.15], 4)(t, t0), look: [SPOT.gears[0], GY + 1.38, SPOT.gears[1]], fov: 40, shake: 0.3 }) },
      { line: 3, t: Infinity, ...OTS },
      { line: 4, t: Infinity, cam: (t, t0) => ({ pos: drift(at(-1.2, 0.55, 1.8), at(-1.05, 0.5, 1.78), 4)(t, t0), look: at(1.5, 0.22, 1.36), fov: 34, shake: 0.3 }) },
      // (Jane's two: over his shoulder onto the phone, the shared broadcast in view: the camp, then the reel close)
      { line: 5, t: Infinity, cam: (t, t0) => ({ pos: drift(at(-1.62, 0.7, 1.85), at(-1.4, 0.64, 1.83), 4)(t, t0), look: at(1.5, 0.22, 1.36), fov: 38, shake: 0.3 }) },
      { line: 6, t: Infinity, cam: (t, t0) => ({ pos: drift(at(-1.05, 0.5, 1.79), at(-0.92, 0.46, 1.77), 4)(t, t0), look: at(1.5, 0.22, 1.36), fov: 30, shake: 0.3 }) },
      { line: 7, t: Infinity, cam: (t, t0) => ({ pos: drift(at(2.9, -1.7, 1.7), at(2.6, -1.6, 1.68), 4)(t, t0), look: at(0, 0, 1.45), fov: 38, shake: 0.3 }) },
      { line: 8, t: Infinity, cam: (t, t0) => ({ pos: drift([GX - 1.0, GY + 1.5, GZ + 4.3], [GX - 1.05, GY + 1.5, GZ + 4.45], 3)(t, t0), look: [SPOT.gears[0], GY + 1.42, SPOT.gears[1]], fov: 34, shake: 0.3 }) },
    ],
    cues: [
      [0.3, () => { ui.title('ACT II · INSIDERS', 'Occupied', 2.8); sfx?.play('stinger', { gain: 0.35 }); W.audio?.play?.('missionStart'); }],
      [1.0, () => ui.place('Static Garage', 'West Chelsea · New York', 3.2)],
      [T.inside - 0.1, () => { garage.inside(true); }],
      [1.3, (st) => {
        say(LINES, st, (who, i) => {
          const now = W.sceneClock?.t ?? 0;
          for (const sh of def.shots) if (sh.line === i) sh.t = now;
          if (i === 2) gearsUp = true;
          if (i === 3) { sfx?.play('ring', { gain: 0.16, times: 1 }); W.audio?.play?.('phoneBuzz'); T.up = now; streamCall(W, U); }
          if (i === 4) { U.call.share(true); W.voice?.fx?.('Fiona', 'video'); }
          if (i === 7) { U.call.share(false); T.down = now + 0.3; U.call.hide(); sfx?.play('hangup', { gain: 0.12 }); }
          if (who === 'Jane') talkUntil = performance.now() + 400;
          // (Gears talks with his hands on his own lines, once he's up)
          if (who === 'Gears' && gearsUp) gears.rig.set([[0, 'idle'], [now, 'talk', { fade: 0.4, speed: 0.8 }], [now + 3.2, 'idle', { fade: 0.6 }]]);
        }).finally(() => { const now = W.sceneClock?.t; if (now != null) def.END = now + 1.2; U.call.hide(); });
      }],
      // (an impact wrench under the car)
      [2.2, () => sfx?.play('thunk', { gain: 0.18, f: 420, ring: false })],
      [4.4, () => sfx?.play('thunk', { gain: 0.14, f: 520, ring: false })],
    ],
    pose(t, dt) {
      ps = ps || poser(W, C);
      ps.at(QX, QZ, QH); ps.pose(t, QH);
      const k = T.up == null ? 0 : clamp((t - T.up) / 0.6) * (T.down == null ? 1 : 1 - clamp((t - T.down) / 0.6));
      holdPhone(W, C.phone, QH, k); if (C.phone.visible) C.phone.show?.('off', t);
      if (U.call.on) U.call.talk(performance.now() < talkUntil ? 0.6 + Math.random() * 0.4 : 0);
      // Gears: under the car on his creeper, then up (the cut hides the getting up)
      if (!gearsUp) {
        const [fx, fz] = SPOT.gearsLie;
        stand(W, gears, fx, fz, -PI / 2, t, { y: GY + 0.27, lie: true });
        garage.creeper.position.set(fx + 0.85, GY, fz); garage.creeper.rotation.y = PI / 2;
      } else {
        stand(W, gears, SPOT.gears[0], SPOT.gears[1], SPOT.gears[2], t); gears.relax(SPOT.gears[2], 1, 'LR', t);
        garage.creeper.position.set(SPOT.gearsLie[0] - 0.2, GY, SPOT.gearsLie[1] + 0.6); garage.creeper.rotation.y = 0.4;
      }
    },
    setup() {
      const car = W.car; car.position.set(SPOT.car[0], GY, SPOT.car[1]); car.heading = SPOT.car[2]; car.speed = 0; car.mesh.position.copy(car.position); car.mesh.rotation.y = car.heading;
      garage.show(true); garage.inside(false);
      C.qRig.set([[0, 'idle'], [6, ['idle/noArmL', ['talk/armL', { from: 0.6, speed: 0.7 }]], { fade: 0.5 }]]);
      gears.rig.set([[0, 'idle']]);
    },
    cleanup() {
      U.call.hide(); C.phone.visible = false; gears.root.visible = false; garage.inside(false);
      W.voice?.fx?.('Fiona', null);
      // (out on the sidewalk by his car at the curb before the hand-back, where play goes on (m3.js puts them there
      // too), so the view comes down behind him there, facing the car and the way on)
      place(W, { car: SPOT.out.car, dan: SPOT.out.dan });
    },
    face: { x: SPOT.out.car[0], z: SPOT.out.car[1] },
  };
  return def;
}

/* -------------------------------------------------------------- night -- */
// Moon on his phone's lock screen (the one thing on it he looks at tonight): the time, Moon's face, tracker gone quiet
function lockScreen(W) {
  if (W._m3lock) return W._m3lock;
  const c = document.createElement('canvas'); c.width = 144; c.height = 304; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 304); g.addColorStop(0, '#1C2A44'); g.addColorStop(1, '#090C14'); x.fillStyle = g; x.fillRect(0, 0, 144, 304);
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '800 44px "Barlow Condensed", sans-serif'; x.fillText('11:52', 72, 62);
  x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '600 11px "Barlow Condensed", sans-serif'; x.fillText('THURSDAY', 72, 78);
  x.save(); x.beginPath(); x.arc(72, 148, 46, 0, PI * 2); x.fillStyle = '#FFC93C'; x.fill(); x.beginPath(); x.arc(72, 148, 42, 0, PI * 2); x.clip(); x.fillStyle = '#3B4A63'; x.fillRect(20, 100, 104, 100); drawMoon(x, 72, 152, 36, { tongue: true }); x.restore();
  x.fillStyle = '#fff'; x.font = '800 16px "Barlow Condensed", sans-serif'; x.fillText('MOON', 72, 214);
  x.fillStyle = 'rgba(30,34,44,.92)'; x.beginPath(); x.roundRect(10, 236, 124, 34, 8); x.fill();
  x.fillStyle = '#2F7FD8'; x.beginPath(); x.roundRect(16, 243, 20, 20, 5); x.fill();
  x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '700 8px "Barlow Condensed", sans-serif'; x.fillText('TRACKER', 42, 252);
  x.fillStyle = '#fff'; x.font = '700 10px "Barlow Condensed", sans-serif'; x.fillText('No signal since 6:14 PM', 42, 264);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (W._m3lock = t);
}

// ~10.5 s, the night after Mission 2 in the garage. garage: the set (its couch, its moods); card(on): the NEXT MORNING
// card over the black; onDark(): under the black (the mission puts the morning's light in); ui.fade does the blacks
export function nightScene(W, { garage, card, onDark }) {
  const C = W.cast, Q = W.dan, P = W.person, ui = W.ui, sfx = W.sfx, cm = W.app.controllerManager;
  const { x: cx, z: cz, seat } = garage.couch;
  // (on the couch's east half, facing into the bay)
  const QX = cx + 0.42, QZ = cz + 0.06, QH = 0;
  const T = { insert: 1.5, wide: 3.5, down: 3.3, out: 4.2, dark: 4.6, card: 4.9, light: 7.4, wake: 8.7, end: 10.9 };
  const r = rig(Q.mixer, { sitTalk: Q.act('sitTalk').getClip() });
  const head = () => Q.bones.head.getWorldPosition(V());
  let lock0 = null, slump = 0;
  const F = V(Math.sin(QH), 0, Math.cos(QH)), R = V(-Math.cos(QH), 0, Math.sin(QH));
  const wide = (t, t0, a, b) => ({ pos: drift([cx + 2.9, GY + 1.2, cz + 3.6], [cx + 2.55, GY + 1.12, cz + 3.25], 3.4)(t, t0), look: [cx + 0.75 + a, GY + 0.82 + b, cz + 0.2], fov: 36, shake: 0.25 });
  const bone = (n) => Q.bones[n].getWorldPosition(V());
  const def = {
    END: T.end, blend: 0,
    shots: [
      // the bay at night: the couch by the door, him on it in his phone's light, the street dark through the door
      { t: 0, cam: (t, t0) => ({ pos: drift([QX + 1.45, GY + 1.3, QZ + 3.3], [QX + 1.3, GY + 1.22, QZ + 3.0], 1.5)(t, t0), look: [QX - 0.1, GY + 0.95, QZ + 0.2], fov: 38, shake: 0.25 }) },
      // over his shoulder: Moon on the lock screen
      { t: T.insert, cam: () => { const h = head(), ph = C.phone.position; return { pos: [h.x + R.x * 0.3 - F.x * 0.4, h.y + 0.15, h.z + R.z * 0.3 - F.z * 0.4], look: [ph.x, ph.y - 0.02, ph.z], fov: 30, shake: 0.2 }; } },
      { t: T.wide, cam: (t, t0) => wide(t, t0, 0.3, -0.05) },
      // the morning: the same bay, the sun in through the door, him asleep sitting up; then closer as he wakes
      { t: T.light, cam: (t, t0) => ({ pos: drift([cx + 3.4, GY + 1.35, cz + 3.9], [cx + 3.0, GY + 1.25, cz + 3.5], 2.5)(t, t0), look: [cx + 1.1, GY + 0.95, cz + 0.4], fov: 44, shake: 0.2 }) },
      { t: T.wake, cam: (t, t0) => ({ pos: drift([QX + 1.2, GY + 1.05, QZ + 1.65], [QX + 1.05, GY + 1.05, QZ + 1.5], 2)(t, t0), look: [QX, GY + 0.95, QZ], fov: 36, shake: 0.2 }) },
    ],
    cues: [
      [0.05, () => { ui.fade(0, 0.8); ui.place('Static Garage', 'West Chelsea · that night', 3); }],
      [T.down, () => sfx?.play('thunk', { gain: 0.08, f: 900, ring: false })],
      // (the work lamp clicked off)
      [T.out, () => { garage.mood('dark'); sfx?.play('thunk', { gain: 0.12, f: 220, ring: false }); }],
      [T.dark, () => { ui.fade(1, 0.35); }],
      [T.card, () => { card?.(true); try { onDark?.(); } catch (e) { console.warn('[m3] night', e); } garage.mood('morning'); }],
      [T.light - 0.5, () => { card?.(false); }],
      [T.light, () => { ui.fade(0, 0.9); }],
      [T.wake, () => sfx?.play('thunk', { gain: 0.14, f: 420, ring: false })],
      [T.end - 0.55, () => { ui.fade(1, 0.5); }],
    ],
    pose(t) {
      // sat on the couch, his hips on its seat (the clip's own hips put there whatever its height)
      P.position.set(QX, cm.getGroundHeight(QX, QZ, 'person'), QZ); P.heading = QH; P.mesh.visible = true;
      P.mesh.position.set(QX, GY, QZ); P.mesh.rotation.y = QH; Q.body.position.y = 0; Q.body.rotation.x = 0;
      r.pose(t);
      P.mesh.updateMatrixWorld(true);
      const hip = Q.bones.upperleg01_L.getWorldPosition(V()).add(Q.bones.upperleg01_R.getWorldPosition(V())).multiplyScalar(0.5);
      P.mesh.position.x += QX - hip.x; P.mesh.position.z += QZ - hip.z; P.mesh.position.y += seat + 0.1 - hip.y;
      P.mesh.updateMatrixWorld(true);
      // asleep in the morning (his head down on his chest, to one side), then waking
      slump = t < T.down ? 0 : t < T.light ? clamp((t - T.down) / 1.2) * 0.6 : t < T.wake + 0.2 ? 1 : 1 - clamp((t - T.wake - 0.2) / 0.8);
      if (slump > 0.001) {
        const nk = Q.bones.neck01 || Q.bones.neck02, hd = Q.bones.head;
        for (const [b, a, rl] of [[nk, 0.32, 0.1], [hd, 0.3, 0.16]]) if (b) b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a * slump, 0, rl * slump)));
        P.mesh.updateMatrixWorld(true);
      }
      // his hands in his lap (the clip talks with them); the phone up in his right till he puts it down, its light on
      // his face; awake, a long stretch, both arms up
      for (const [sd, out] of [['L', R.clone().negate()], ['R', R]]) {
        const lap = bone('upperleg01_' + sd).lerp(bone('lowerleg01_' + sd), 0.55).add(V(0, 0.09, 0)).addScaledVector(out, -0.04);
        const sh = bone('upperarm01_' + sd);
        armTo(W, sd, lap, sh.clone().addScaledVector(out, 0.45).add(V(0, -0.5, 0)).addScaledVector(F, -0.25), 1);
      }
      const k = t < T.down ? clamp((t - 0.1) / 0.5) : 1 - clamp((t - T.down) / 0.5);
      holdPhone(W, C.phone, QH, t < T.dark ? k : 0);
      if (C.phone.visible && t < T.out) garage.glow(head().addScaledVector(F, 0.16).add(V(0, -0.04, 0)), 0.32 * k); else if (t < T.out) garage.glow(null);
      const u = (t - T.wake - 0.45) / 1.5, s = u > 0 && u < 1 ? Math.sin(PI * u) : 0;
      if (s > 0.001) for (const [sd, out] of [['L', R.clone().negate()], ['R', R]]) {
        const sh = bone('upperarm01_' + sd);
        armTo(W, sd, sh.clone().add(V(0, 0.52, 0)).addScaledVector(F, 0.1).addScaledVector(out, 0.14), sh.clone().addScaledVector(out, 0.6).addScaledVector(F, -0.25), Math.min(1, s * 1.4));
      }
    },
    setup() {
      const car = W.car; car.position.set(SPOT.car[0], GY, SPOT.car[1]); car.heading = SPOT.car[2]; car.speed = 0; car.mesh.position.copy(car.position); car.mesh.rotation.y = car.heading;
      garage.show(true); garage.inside(true); garage.mood('night');
      for (const a of Q.mixer._actions) if (!r.owns(a)) a.setEffectiveWeight(0);
      r.set([[0, ['sitTalk', { from: 0.35, speed: 0.12 }]]]);
      lock0 = C.phone.screen.material.map; C.phone.screen.material.map = lockScreen(W); C.phone.screen.material.needsUpdate = true;
      if (C.phone.vid) C.phone.vid.visible = false; C.phone.screen.visible = true;
    },
    cleanup() {
      r.stop(); Q.act('idle').setEffectiveWeight(1); card?.(false);
      if (lock0) { C.phone.screen.material.map = lock0; C.phone.screen.material.needsUpdate = true; }
      C.phone.visible = false; garage.mood(null);
    },
  };
  return def;
}

/* -------------------------------------------------------------- rally -- */
// ~14 s. fiona: her rig (hype), rally: the set, crew: the Suit who spots Dan ({ e } an enemy of the crew, or null);
// lawn: [x, z] where the fight starts him (behind the crowd, the rigs ahead): the last shot is over his shoulder there,
// the three rigs in it, their marks up, onRigs() as it cuts in (the job's card)
export function rallyScene(W, { say, fiona, rally, spotter, lawn = null, onRigs = null }) {
  const ui = W.ui, [FX, FZ] = FIONA_AT, top = STAGE.top;
  const sp = spotter ? { x: spotter.pos.x, z: spotter.pos.z } : { x: -8, z: 2856 };
  const T = { rigs: 11.0, end: lawn ? 14.4 : 11.0 };
  // (the lawn shot: him facing the nearest rig, the camera up behind him, looking between it and the far two)
  const near = lawn ? RIGS.map(([x, z]) => [x, z, Math.hypot(x - lawn[0], z - lawn[1])]).sort((a, b) => a[2] - b[2])[0] : null;
  const QH = near ? Math.atan2(near[0] - lawn[0], near[1] - lawn[1]) : 0;
  const mid = RIGS.reduce((a, [x, z]) => [a[0] + x / 3, a[1] + z / 3], [0, 0]);
  const aim = near ? [lerp(near[0], mid[0], 0.45), 3.4, lerp(near[1], mid[1], 0.45)] : [0, 3.4, 2870];
  const back = (d, h, s = 0) => (lawn ? [lawn[0] - Math.sin(QH) * d + Math.cos(QH) * s, h, lawn[1] - Math.cos(QH) * d - Math.sin(QH) * s] : [0, h, 2830]);
  return {
    END: T.end, hero: false,
    // (handed back facing the nearest rig: the job)
    face: near ? { x: near[0], z: near[1] } : null,
    shots: [
      // from 5th Ave: the arch, JPBank's banner, the reel through the opening
      { t: 0, cam: (t) => ({ pos: keys([[0, [7.5, 2.0, 2748]], [3.2, [6.5, 2.3, 2758]]], 'linear')(t), look: keys([[0, [0, 11, 2801]], [3.2, [0, 10, 2801]]], 'linear')(t), fov: 54, shake: 0.4 }) },
      // in the crowd, the stage
      // (in the crowd, over their heads: a spot the park's trees leave clear to the stage)
      { t: 3.2, cam: (t) => ({ pos: keys([[3.2, [CROWD_CAM[0], 2.75, CROWD_CAM[1]]], [5.8, [CROWD_CAM[0] - 0.3, 2.7, CROWD_CAM[1] - 0.5]]], 'linear')(t), look: [0, 3.7, 2808.5], fov: 50, shake: 0.5 }) },
      // (her, close, from her left: the megaphone is in her right hand, so from here it points off past her and her face
      // and her shades read; a frontal shot puts its bell over her face)
      { t: 5.8, cam: (t) => ({ pos: keys([[5.8, [2.65, top + 1.42, FZ + 1.95]], [8.4, [2.35, top + 1.46, FZ + 1.75]]], 'linear')(t), look: [FX + 0.05, top + 1.5, FZ + 0.1], fov: 30, shake: 0.5 }) },
      { t: 8.4, cam: (t) => ({ pos: [sp.x - 1.6, 1.75, sp.z + 2.6], look: keys([[8.4, [sp.x + 0.2, 1.5, sp.z - 0.4]], [11, [sp.x + 0.4, 1.4, sp.z - 2]]])(t), fov: 40, shake: 0.6 }) },
      // the job: over his shoulder on the lawn, high, the three rigs ahead with their marks, easing in on the nearest
      ...(lawn ? [{ t: T.rigs, cam: (t) => ({ pos: keys([[T.rigs, back(5.4, 3.3, 1.2)], [T.end, back(4.2, 2.7, 0.9)]], 'out')(t), look: keys([[T.rigs, aim], [T.end, [lerp(aim[0], near[0], 0.5), 2.6, lerp(aim[2], near[1], 0.5)]]], 'inOut')(t), fov: 52, shake: 0.35 }) }] : []),
    ],
    cues: [
      [0.2, () => ui.place('Washington Square', 'Greenwich Village · New York', 3.2)],
      [0.6, (st) => { W.voice?.fx?.('Fiona', 'phone'); say([['Fiona', PINK, 'Hiii, New York! JPBank loves you!']], st); }],
      // (the camp, across the park, answering her as her line ends: 0.6 + her 3.29 s recording; each line here ends
      // before the next starts, by their recordings: the camp's 1.9 s, hers 2.7 s, Brick's 3.0 s)
      [3.9, (st) => { rally.cheer?.(); say([['Camp', CAMP, 'We are the ninety-nine percent!']], st); }],
      [6.1, (st) => say([['Fiona', PINK, 'Boo the bad apple, everybody! Booo!']], st)],
      [9.0, (st) => say([['Brick', ACID, "Yo. That's banker boy. Protect the screens!"]], st)],
      // (him on the lawn behind the crowd, facing the nearest rig: where the fight starts him)
      ...(lawn ? [[T.rigs - 0.02, () => {
        const P = W.person, cm = W.app.controllerManager;
        P.position.set(lawn[0], cm.getGroundHeight(lawn[0], lawn[1], 'person'), lawn[1]); P.heading = QH; P.speed = 0;
        P.mesh.position.copy(P.position); P.mesh.rotation.y = QH; P.mesh.visible = true;
        onRigs?.();
      }]] : []),
    ],
    pose(t, dt) {
      stand(W, fiona, FX, FZ, 0, t, { y: top });
      fiona.hype(0, 1, 1, t);
      rally.update(dt, W.app.cameraSystem.camera.position);
      if (spotter && t > 8.8) { const e = spotter; const want = Math.atan2(W.person.position.x - e.pos.x, W.person.position.z - e.pos.z); e.yaw = want; e.root.rotation.y = want; }
    },
    setup() { fiona.rig.set([[0, 'thugIdle']]); },
    cleanup() {},
  };
}

/* --------------------------------------------------------------- dump -- */
// ~33 s: the reel dead (frozen mid-sentence, then NO SIGNAL), Fiona off the stage and away in her SUV; the stage left
// empty, and Ms. Bea's people's mic from the camp (she says a phrase, the camp says it back so the back can hear: "Free
// Dan!"); then the dead screen over the empty stage, as
// Mack's phone (Dan took it in Mission 2, and nobody kicked it from their chat) shows Mr. Big's new plan for the laptop:
// shredded at dawn, Rook driving (23 Oct, the review: smashing the rigs gains him something concrete toward the laptop; Rook's
// DM at the end of the mission and Mission 4 start from it). Back on his car for his read of it
export const DUMP_CHAT = [
  ['brick', '#B6FF3B', 'SCREENS ARE DEAD. banker boy smashed all 3'],
  ['mack.2', '#B6FF3B', 'new phone. boss the camp is chanting his NAME'],
  ['mr.big', '#E9EEF5', 'Then no more PR. The laptop gets shredded at dawn.'],
  ['mr.big', '#E9EEF5', 'Rook drives.'],
  ['rook', '#6CB8FF', 'ok'],
];
export function dumpScene(W, { say, fiona, rally, suv }) {
  const sfx = W.sfx, cm = W.app.controllerManager, [FX, FZ] = FIONA_AT, top = STAGE.top;
  // (gone: the SUV out of sight by 11.4, as before the chat was added)
  const T = { drop: 3.0, run: 3.6, cut: 6.0, inCar: 8.4, go: 8.7, gone: 11.4, car: 9.8, stage: 11.6, mic: 11.8, camp: 13.3, chant: 22.6, chat: 25.2, back: 30.9, end: 33.5 };
  const [SX, SZ, SH] = SUV_AT;
  // her run: along the stage to its east end, down, round the arch's east pier (cut), then the last steps to the SUV
  // (the second leg at the pace that gets her to its door as it opens)
  const run1 = spline([[FX, FZ], [5, FZ + 0.6], [STAGE.x1 - 0.3, STAGE.z1 - 0.4], [STAGE.x1 + 1.6, STAGE.z1 - 0.2], [11.6, 2808], [12, 2800]]);
  const doorAt = [SX + 1.35, SZ + 0.4];
  const run2 = spline([[10.7, 2797], [10.2, 2792], [doorAt[0] + 0.4, doorAt[1] + 2.5], [doorAt[0], doorAt[1]]]);
  const v2 = run2.length / (T.inCar - T.cut);
  const r1 = travel([[T.run, 0], [T.run + 0.5, 5.4], [T.cut, 5.4]]), r2 = travel([[T.cut, v2], [T.inCar, v2]]);
  const way = spline([[SX, SZ], [SX - 0.5, SZ - 22], [SX - 2, SZ - 70], [SX - 3, SZ - 160]]), go = travel([[T.go, 0], [T.go + 1.4, 12], [T.gone, 18]]);
  const onStage = (p) => p.x < STAGE.x1 && p.z < STAGE.z1;
  let megaT = null;
  return {
    END: T.end, hero: false,
    // (the cameras stand where nothing of the park's trees comes between them and her: see the set's tree list)
    shots: [
      // from the stage's front, west of her: Fiona under the screen as the reel dies
      { t: 0, cam: (t) => ({ pos: keys([[0, [-4.4, 2.0, 2814.0]], [2.6, [-4.0, 2.1, 2813.4]]], 'linear')(t), look: keys([[0, [0.6, 4.6, SCREEN_Z]], [2.6, [0.4, 4.2, SCREEN_Z + 1]]], 'linear')(t), fov: 50, shake: 0.4 }) },
      // east of her, low by the stage's edge: the megaphone dropped, and her run past the camera to the steps
      { t: 2.6, cam: (t) => ({ pos: keys([[2.6, [4.2, 1.85, 2813.2]], [T.cut, [4.7, 1.8, 2813.0]]], 'linear')(t), look: (() => { const p = t < T.run ? { x: FX, z: FZ } : run1.at(Math.min(run1.length, r1(t))); return [p.x, onStage(p) ? top + 1.0 : 1.3, p.z]; })(), fov: 46, shake: 0.7 }) },
      { t: T.cut, cam: (t) => ({ pos: [16.8, 1.8, 2789.5], look: keys([[T.cut, [10, 1.2, 2794]], [T.go + 0.4, [SX + 0.5, 1.1, SZ]], [T.gone, [SX - 1, 1.2, SZ - 30]]])(t), fov: 44, shake: 0.6 }) },
      { t: T.car, cam: () => { const [cx, cz, ch] = ESCAPE_CAR; return { pos: [cx - Math.sin(ch) * 7.5, 2.3, cz - Math.cos(ch) * 7.5], look: [cx + Math.sin(ch) * 6, 1.1, cz + Math.cos(ch) * 6], fov: 52, shake: 0.4 }; } },
      // the stage left empty under the dead screen, the megaphone where she dropped it
      { t: T.stage, cam: (t) => ({ pos: keys([[T.stage, [-3.2, 1.65, 2817.2]], [T.camp, [-2.9, 1.7, 2816.5]]], 'linear')(t), look: keys([[T.stage, [0.6, 3.6, SCREEN_Z]], [T.camp, [0.5, 3.45, SCREEN_Z]]], 'linear')(t), fov: 46, shake: 0.35 }) },
      // the people's mic, from just in front of Ms. Bea on her crate (BEA_AT, behind the camera): the camp facing her
      // (and us), the dead screens far behind them up the lawn
      { t: T.camp, cam: (t) => ({ pos: keys([[T.camp, [1.6, 2.35, 2918.8]], [T.chant, [1.4, 2.25, 2917.4]]], 'linear')(t), look: keys([[T.camp, [0.2, 1.45, 2906]], [T.chant, [0.0, 1.5, 2906]]], 'linear')(t), fov: 50, shake: 0.35 }) },
      // "Free Dan!": the camp turned back to the bank's dead screens, arms up; from in front of them, Dan's sign among
      // them (GREEDY struck out: FALL)
      { t: T.chant, cam: (t) => ({ pos: keys([[T.chant, [0.9, 1.55, 2899.6]], [T.chat, [0.6, 1.5, 2900.4]]], 'linear')(t), look: [-0.6, 1.5, 2905.4], fov: 44, shake: 0.45 }) },
      // the dead screen over the empty stage again, as the chat comes in
      { t: T.chat, cam: (t) => ({ pos: keys([[T.chat, [3.4, 1.6, 2817.6]], [T.back, [2.8, 1.7, 2816.2]]], 'linear')(t), look: keys([[T.chat, [-0.4, 3.5, SCREEN_Z]], [T.back, [-0.3, 3.3, SCREEN_Z]]], 'linear')(t), fov: 46, shake: 0.35 }) },
      // back on his car, from its other side, for his read of it
      { t: T.back, cam: (t) => { const [cx, cz, ch] = ESCAPE_CAR, f = [Math.sin(ch), Math.cos(ch)], r = [-Math.cos(ch), Math.sin(ch)]; const p = keys([[T.back, [cx - f[0] * 6.2 - r[0] * 3.2, 1.9, cz - f[1] * 6.2 - r[1] * 3.2]], [T.end, [cx - f[0] * 5.4 - r[0] * 2.8, 1.8, cz - f[1] * 5.4 - r[1] * 2.8]]], 'linear')(t); return { pos: p, look: [cx + f[0] * 3, 1.0, cz + f[1] * 3], fov: 48, shake: 0.4 }; } },
    ],
    cues: [
      [0.1, () => { rally.screen.mode('dead'); sfx?.play('squeal', { gain: 0.2, dur: 0.6 }); }],
      [0.5, (st) => { W.voice?.fx?.('Fiona', 'phone'); say([['Fiona', PINK, 'Wait. Why is it black? Who unplugged it?']], st); }],
      [T.drop, () => { megaT = T.drop; W.voice?.fx?.('Fiona', null); }],
      [T.run - 0.2, (st) => say([['Fiona', PINK, "We'll be right back! JPBank loves you! Bye!"]], st)],
      [T.inCar - 0.1, () => W.audio?.play?.('doorOpen', { pos: [doorAt[0], 1, doorAt[1]] })],
      [T.go, () => { sfx?.play('squeal', { gain: 0.45, dur: 1.2 }); W.audio?.play?.('engineStart', { pos: [SX, 0.8, SZ] }); }],
      [T.car + 0.2, (st) => say([['Dan', WHITE, 'Take your time.']], st)],
      // the people's mic: Ms. Bea says it, the camp says it back so the back can hear (arms up on each answer)
      [T.mic, (st) => {
        rally.camp?.mic(true);
        say([
          ['Bea', BEA, 'Mic check!'], ['Camp', CAMP, 'Mic check!'],
          ['Bea', BEA, 'Anybody the bank hates this much...'], ['Camp', CAMP, 'Anybody the bank hates this much!'],
          ['Bea', BEA, '...is somebody we should hear out!'], ['Camp', CAMP, 'Free Dan! Free Dan! Free Dan!'],
        ], st, (who, i) => {
          // ("Free Dan!": back to face the screens, all of them)
          if (i === 5) rally.camp?.mic(false);
          if (who === 'Camp') rally.cheer?.(i === 5 ? 4.5 : 1.8);
        });
      }],
      // (Ms. Bea's pen: GREEDY struck out on Dan's sign, FALL over it)
      [T.chant - 0.05, () => rally.camp?.fallMan()],
      // Mack's phone: the Suits' chat, Mr. Big's new plan
      [T.chat, (st) => {
        if (st.dead || !W.m2ui) return;
        sfx?.play('buzz', { gain: 0.16, times: 2 }); sfx?.play('ding', { gain: 0.1 }); W.audio?.play?.('phoneBuzz');
        W.m2ui.chat(DUMP_CHAT, { every: 1150, sub: "Mack's phone · 14 members" }).catch(() => {});
      }],
      [T.back + 0.3, (st) => say([['Dan', WHITE, 'Rook. The guy who wants out.']], st)],
    ],
    pose(t, dt) {
      rally.update(dt, W.app.cameraSystem.camera.position);
      // Fiona
      if (t < T.run) { stand(W, fiona, FX, FZ, 0, t, { y: top }); fiona.hype(0, t < T.drop ? 1 : 0, 0, t); }
      else if (t < T.cut) {
        const s = Math.min(run1.length, r1(t)), p = run1.at(s);
        stand(W, fiona, p.x, p.z, p.h, t, { y: onStage(p) ? top : cm.getGroundHeight(p.x, p.z, 'person') }); runAt(fiona, r1(t)); fiona.hype(p.h, 0, 0, t);
      } else if (t < T.inCar) { const p = run2.at(Math.min(run2.length, r2(t))); stand(W, fiona, p.x, p.z, p.h, t); runAt(fiona, r1(T.cut) + r2(t)); fiona.hype(p.h, 0, 0, t); }
      else { fiona.root.visible = false; }
      // the megaphone dropped on the stage
      if (megaT != null) {
        const k = clamp((t - megaT) / 0.5), m = fiona.mega;
        m.visible = true; m.position.set(FX + 0.35, lerp(top + 1.5, top + 0.12, k * k), FZ + 0.25); m.rotation.set(PI / 2 * k, 0.6, 0);
      }
      // the SUV, parked, then away up 5th Ave
      suv.group.visible = t < T.go || go(t) < way.length - 2;
      const p = t < T.go ? way.at(0) : way.at(Math.min(way.length, go(t)));
      suv.group.position.set(p.x, 0, p.z); suv.group.rotation.set(0, t < T.go ? SH : p.h, 0);
      if (t > T.go) suv.spin(dt * go.speed(t) / 0.4);
    },
    setup() {
      fiona.rig.set([[0, 'thugIdle'], [T.run, fiona.clips.includes('run') ? 'run' : 'jog', { fade: 0.2, speed: 1.1 }]]);
      suv.group.visible = true;
    },
    cleanup() { fiona.root.visible = false; fiona.mega.visible = false; suv.group.visible = false; W.ui?.phone?.hide?.(); rally.camp?.mic(false); rally.camp?.fallMan(); },
  };
}

/* --------------------------------------------------------------- home -- */
// ~16 s: Gears at the bay door, Dan back, the car at the curb. (23 Oct, the review: one line from Dan about Moon
// before the joke, the cool cracking; "in one piece" / "Mostly." is him as much as the car)
export function homeScene(W, { say, gears, garage }) {
  const C = W.cast;
  const [gx, gz] = SPOT.door.gears, [qx, qz] = SPOT.door.dan;
  const QH = Math.atan2(gx - qx, gz - qz), GH = QH + PI;
  const G = W.app.controllerManager.getGroundHeight(qx, qz, 'person');
  let ps = null;
  const LINES = [
    ['Gears', GOLD, "You're back. And the car's in one piece."],
    ['Dan', WHITE, 'Mostly.'],
    ['Gears', GOLD, 'Mostly?'],
    ['Dan', WHITE, "Moon sleeps on Jane's feet tonight. I get a garage.", 0.6],
    ['Dan', WHITE, 'The thrusters work great. Very safe. Mostly.'],
    ['Gears', GOLD, 'Saw the park on the news. Whole camp chanting your name.'],
    ['Dan', WHITE, 'Good chanting or bad chanting?'],
    ['Gears', GOLD, "Ha. Room's upstairs, kid. Get some sleep."],
  ];
  const def = {
    END: Infinity,
    shots: [
      { t: 0, cam: (t, t0) => ({ pos: drift([GX - 10, 2.3, 1596.5], [GX - 9, 2.2, 1597.5], 5)(t, t0), look: [GX - 0.2, 1.5, 1608.5], fov: 40, shake: 0.4 }) },
      { line: 1, t: Infinity, cam: () => ({ pos: [gx - 0.5, G + 1.65, gz - 0.9], look: [qx, G + 1.55, qz], fov: 34, shake: 0.3 }) },
      // (his whole cap in, with room over it)
      { line: 2, t: Infinity, cam: () => ({ pos: [qx + 0.35, G + 1.62, qz + 0.8], look: [gx, G + 1.72, gz], fov: 36, shake: 0.3 }) },
      // (Moon: in on him, slowly; then wide for the joke, Gears' laugh in it too)
      { line: 3, t: Infinity, cam: (t, t0) => ({ pos: drift([gx - 0.6, G + 1.6, gz - 1.0], [gx - 0.5, G + 1.58, gz - 0.86], 4)(t, t0), look: [qx, G + 1.5, qz], fov: 28, shake: 0.25 }) },
      { line: 4, t: Infinity, cam: (t, t0) => ({ pos: drift([GX - 6, 1.8, 1599], [GX - 6.5, 2.4, 1597.5], 4)(t, t0), look: [GX - 0.2, 1.6, 1609], fov: 38, shake: 0.4 }) },
      // (the news of the park: Gears' line on him, Dan's on Dan, then wide again for the laugh)
      { line: 5, t: Infinity, cam: () => ({ pos: [qx + 0.35, G + 1.62, qz + 0.8], look: [gx, G + 1.72, gz], fov: 34, shake: 0.3 }) },
      { line: 6, t: Infinity, cam: () => ({ pos: [gx - 0.5, G + 1.65, gz - 0.9], look: [qx, G + 1.55, qz], fov: 32, shake: 0.3 }) },
      { line: 7, t: Infinity, cam: (t, t0) => ({ pos: drift([GX - 6.2, 2.0, 1598.5], [GX - 6.6, 2.4, 1597.4], 4)(t, t0), look: [GX - 0.2, 1.6, 1609], fov: 38, shake: 0.4 }) },
    ],
    cues: [
      [0.2, () => W.ui.place('Static Garage', 'West Chelsea · New York', 3)],
      [0.6, (st) => {
        say(LINES, st, (who, i) => {
          const now = W.sceneClock?.t ?? 0; for (const sh of def.shots) if (sh.line === i) sh.t = now;
          if (who === 'Gears') gears.rig.set([[0, 'idle'], [now, 'talk', { fade: 0.4, speed: 0.8 }], [now + 3.2, 'idle', { fade: 0.6 }]]);
        })
          .finally(() => { const now = W.sceneClock?.t; if (now != null) def.END = now + 1.0; });
      }],
    ],
    pose(t) {
      ps = ps || poser(W, C);
      ps.at(qx, qz, QH); ps.pose(t, QH);
      stand(W, gears, gx, gz, GH, t); gears.relax(GH, 1, 'LR', t);
    },
    setup() {
      const [cx, cz, ch] = SPOT.out.car, car = W.car;
      car.position.set(cx, 0, cz); car.heading = ch; car.speed = 0; car.mesh.position.copy(car.position); car.mesh.rotation.y = ch;
      garage.show(true);
      C.qRig.set([[0, 'idle'], [3, ['idle/noArmL', ['talk/armL', { from: 0.6, speed: 0.7 }]], { fade: 0.5 }]]);
      gears.rig.set([[0, 'idle']]);
    },
    cleanup() { gears.root.visible = false; },
  };
  return def;
}
