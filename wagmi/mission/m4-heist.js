// Mog City: Mission 4's heist pieces (docs/MISSIONS.md, Mission 4 · Shredder; the pavilion is m4-pavilion.js). Each
// is made once a session and reset for a retry; the mission (m4.js) drives them from its recon, unveiling, grab and
// flip beats.
//   createGuests(W, pav)  the party: the city's own people (one instanced draw, as Mission 3's rally), chatting in small
//                         groups round the high tables; at the unveiling they gather facing the big screen (their backs
//                         to the case), wave when Fiona asks; at the flip every head turns to the empty case; on the
//                         run they scatter. Where the crowd can't be drawn (WebGL2: js/pedestrians.js PersonCrowd) it is
//                         null and the scenes play on Fiona and Knox alone.
//                         G.mode('chat' | 'watch' | 'turn' | 'scatter') · G.cheer(secs) · G.update(dt, cam) · G.show(on)
//   createRecon(W, pav, { U, knox })  the watch over the pavilion while he looks for the artist's mark: two Suits with
//                         sight cones (Mission 2's lookouts, m2-stealth.js, sized to the pavilion), one walking the art
//                         wall, one by the High Artwork; Knox on the door with a short cone of his own (eyes on his
//                         phone: only right in front of him does he notice anyone). A waiter's tray in hand slows every
//                         one of them filling up. R.step(dt) -> null | 'seen' | 'hit'; R.by; R.dispose()
//   createTray(W, pav)    the waiters' trays on the bar: hold F there to take one; carried at his shoulder, glasses on it
//                         T.step(dt, onFoot) (the pick-up), T.held, T.drop(), T.dispose()
//   createPad(W, order)   the case's keypad once it is open: the artist's three marks to press in the Nocturnes' order
//                         (I, II, III): buttons to click or tap, or the keys 1 2 3. A wrong order flashes red and starts
//                         over (the clock runs on). P.show(on) · P.done · P.wrong · P.dispose()
import * as THREE from 'three/webgpu';
import { createStealth } from './m2-stealth.js';
import { PAV, at } from './m4-set.js';
import { L, glyphCanvas } from './m4-pavilion.js';
import { S as story } from '../story/index.js'; import { fetchRetry } from '../net.js';

const PI = Math.PI;
const wrap = (a) => { a = (a + PI) % (2 * PI); if (a < 0) a += 2 * PI; return a - PI; };
const face = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

/* --------------------------------------------------------------- guests -- */
// (the dances and waves are Mission 3's: Bandai Namco Research Motion Dataset, CC BY-NC 4.0, see NOTICE)
let CLIPS = null;
// (the look review's round 5, 15 Nov: the round 4 stances were a part-weight blend of a wave's first moments, and a part of
// a raised arm reads as an arm held stiff out at 45 degrees, an A or a T. The hands are posed by hand now, on the rig's
// own arms after its stand: each guest a held pose of their own (a flute at the chest in the right or the left hand,
// the hands loosely together in front, or both down) and, in a group, a hand that talks now and then)
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const _qc = new THREE.Quaternion(), _qu0 = new THREE.Quaternion(), _qf0 = new THREE.Quaternion(), _qu = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qm = new THREE.Quaternion();
const _sh = new THREE.Vector3(), _el = new THREE.Vector3(), _hd = new THREE.Vector3();
// one arm (i 0 left, 1 right) posed from the chest: flex forward, out from the side, the elbow's bend, the forearm turned
// in across the body by twist; k mixes it over the rig's own; hand (a Vector3) gets the hand's middle
function poseArm(rig, i, flex, out, bend, twist, k = 1, hand = null) {
  const a = rig.pose, s = rig.s, j = rig.bind, U = i ? 5 : 3, F = U + 1, side = i ? -1 : 1, o = U * 8, f = F * 8;
  _qc.set(a[8], a[9], a[10], a[11]);
  _qu0.set(a[o], a[o + 1], a[o + 2], a[o + 3]); _qf0.set(a[f], a[f + 1], a[f + 2], a[f + 3]);
  _sh.copy(j[U]).applyQuaternion(_qu0).multiplyScalar(s); _sh.set(a[o + 4] + _sh.x, a[o + 5] + _sh.y, a[o + 6] + _sh.z);
  _qu.copy(_qc).multiply(_qt.setFromAxisAngle(AZ, side * (out - 0.14))).multiply(_qt.setFromAxisAngle(AX, -flex));
  _qf.copy(_qu).multiply(_qt.setFromAxisAngle(AY, -side * twist)).multiply(_qt.setFromAxisAngle(AX, -bend));
  if (k < 1) { _qm.slerpQuaternions(_qu0, _qu, k); _qu.copy(_qm); _qm.slerpQuaternions(_qf0, _qf, k); _qf.copy(_qm); }
  _el.copy(j[F]).sub(j[U]).multiplyScalar(s).applyQuaternion(_qu).add(_sh);
  rig.writeBone(U, _qu, _sh); rig.writeBone(F, _qf, _el);
  // (round 6: the flute stood beside the hand, not in it: its stem at the palm's middle now, past the wrist)
  if (hand) hand.copy(j[F]).sub(j[U]).normalize().multiplyScalar(0.355 * s).applyQuaternion(_qf).add(_el);
}
// the held poses: [flex, out, bend, twist] per arm (null: the rig's own, hanging)
const HOLDS = {
  glassR: [null, [0.22, 0.17, 1.72, 0.42]],
  glassL: [[0.22, 0.17, 1.72, 0.42], null],
  clasp: [[0.2, 0.12, 1.15, 0.72], [0.2, 0.12, 1.15, 0.72]],
  pocket: [[-0.05, 0.2, 0.35, 0.1], null],
};
export function createGuests(W, pav, { n = 30 } = {}) {
  const N = window.NYC, app = W.app, cm = app.controllerManager;
  if (!N?.PersonCrowd || !N?.PersonRig) return null;
  if (!CLIPS) { CLIPS = {}; fetchRetry('assets/anim/bandai/rally-crowd-ped.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.clips) for (const c of j.clips) CLIPS[c.name] = c; }).catch(() => {}); }
  // (the look review's round 9: puffers, knits and a hoodie at a night gala. A formal crowd, js/pedestrians.js: tailored
  // evening wear only, dark trousers, and long hair clean-shaven)
  const C = new N.PersonCrowd(n, { farDistance: 36, name: 'GalaCrowd', formal: true });
  for (const m of C.meshes) { m.visible = false; app.scene.add(m); }
  // the flutes in their hands (one instanced draw): a stem and a tall bowl, the wine a warm gold in it
  const fg = new THREE.LatheGeometry([[0, 0], [0.026, 0.002], [0.004, 0.008], [0.003, 0.085], [0.016, 0.1], [0.022, 0.15], [0.024, 0.2], [0.0235, 0.2]].map(([x, y]) => new THREE.Vector2(x, y - 0.1)), 10);
  const flutes = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: '#E8C97A', emissive: '#3A2A08', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82 }), n);
  flutes.count = 0; flutes.frustumCulled = false; flutes.visible = false; flutes.name = 'GalaFlutes'; app.scene.add(flutes);
  const _fm = new THREE.Matrix4();
  let s = 4711; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // where they stand: in small groups round the tables (chat), and in loose rows facing the screen (watch); never in
  // the art wall's aisle (where he studies the Nocturnes), the case's ring, or on the High Artwork's rope
  const GROUPS = [[2.3, -6.2], [-1.5, -7.6], [3.3, 1.8], [-2.3, 3.0], [0.9, 6.6], [-1.0, 9.2], [2.7, 9.6], [0.4, -2.6]];
  const free = (a, b) => a > -3.3 && a < 4.1 && Math.hypot(a - L.case[0], b - L.case[1]) > 1.8 && Math.hypot(a - L.riser[0], b - L.riser[1]) > 1.5 && b < 12;
  const people = [], chat = [], watch = [];
  for (let gi = 0, k = 0; k < n && gi < 400; gi++) {
    const G = GROUPS[gi % GROUPS.length], ang = rnd() * 2 * PI, r = 0.75 + rnd() * 0.45, a = G[0] + Math.sin(ang) * r, b = G[1] + Math.cos(ang) * r;
    if (!free(a, b) || chat.some((p) => Math.hypot(p[0] - a, p[1] - b) < 0.7)) continue;
    chat.push([a, b, G]); k++;
  }
  // (round 7's review: a guest just past the locked case read as stood inside its glass from the case's own close-up. The
  // chat ring kept 3 m clear of it now, anyone nearer moved straight out from it)
  for (const p of chat) { const da = p[0] - L.case[0], db = p[1] - L.case[1], d = Math.hypot(da, db); if (d < 3) { p[0] = L.case[0] + da / d * 3; p[1] = L.case[1] + db / d * 3; } }
  for (let tries = 0; watch.length < chat.length && tries < 3000; tries++) {
    const a = -3.2 + rnd() * 7.1, b = 3.4 + Math.pow(rnd(), 0.8) * 6.6;
    // (the look review's round 8: a head over the middle of the evening's title on the flat under his feed, from the
    // empty case's shot. Nobody stands right up against the flat)
    if (b > 9 && Math.abs(a) < 2.4) continue;
    if (!free(a, b) || Math.hypot(a - 3.4, b - 1.8) < 0.7 || Math.hypot(a + 2.6, b - 3.0) < 0.7 || watch.some((p) => Math.hypot(p[0] - a, p[1] - b) < 0.62)) continue;
    watch.push([a, b]);
  }
  const ground = (o, x, z) => cm.getGroundHeight(x, z, 'person');
  const scr = at(...L.screen), cs = at(...L.case);
  const o0 = at(0, 0), s1 = at(0, 1), e1 = at(1, 0), SOUTH = { x: s1.x - o0.x, z: s1.z - o0.z }, EAST = { x: e1.x - o0.x, z: e1.z - o0.z }, FLINCH = 0.6;
  chat.forEach(([a, b, G], i) => {
    const female = rnd() < 0.48, p0 = at(a, b), g0 = at(G[0], G[1]), w0 = at(...(watch[i] || [a, b]));
    people.push({
      x: p0.x, z: p0.z, h: face(p0.x, p0.z, g0.x, g0.z),
      chat: { x: p0.x, z: p0.z, h: face(p0.x, p0.z, g0.x, g0.z) }, watch: { x: w0.x, z: w0.z, h: face(w0.x, w0.z, scr.x, scr.z) + (rnd() - 0.5) * 0.3 },
      delay: rnd() * 0.9, t: 0, run: null, gone: false, wave: null, at: rnd() * 10, rate: 0.9 + rnd() * 0.2,
      // (14 Nov, the owner's review: no two alike and no bald mannequins: the men's hair as the city's own (short to
      // medium, a few long), heights and builds spread; each with a slow look of their own: sway)
      rig: new N.PersonRig({ seed: 300 + i * 5.3, female, scale: female ? 0.9 + rnd() * 0.08 : 0.95 + rnd() * 0.1, girth: 0.88 + rnd() * 0.28,
        hair: female ? (rnd() < 0.7 ? 0.75 + rnd() * 0.25 : 0.35 + rnd() * 0.25) : rnd() < 0.1 ? 1 : 0.2 + rnd() * 0.15, armSwing: 0.7 + rnd() * 0.5 }),
      sway: { a: 0.15 + rnd() * 0.3, f: 0.18 + rnd() * 0.22, p: rnd() * 6.28 },
      // (the look review's round 2, 15 Nov: still mannequins, stood arms down. Most of them talk with a hand now and
      // then: a moment of a wave's rise, blended in part over the stand, each at their own pace)
      gest: rnd() < 0.7 ? { f: 0.5 + rnd() * 0.6, p: rnd() * 6.28 } : null,
      // (the look review's round 4, 15 Nov: a wall of the same stance, arms straight down. Each holds one of their own
      // now, a still moment of a clip blended in part: a hand up at the chest as if round a glass, the arms a little
      // out, the weight on one hip from a dance's beat)
      hold: (() => { const r = rnd(); return r < 0.42 ? 'glassR' : r < 0.6 ? 'glassL' : r < 0.78 ? 'clasp' : r < 0.88 ? 'pocket' : null; })(),
      vary: [(rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.12],
      // (round 7's review: at "empty?" they still faced every way, nobody to the case. All round inside the line's first
      // second now, a few only most of the way, quicker)
      turn: { d: 0.05 + Math.pow(rnd(), 0.7) * 0.75, o: (rnd() - 0.5) * 0.3, f: rnd() < 0.15 ? 0.75 + rnd() * 0.15 : 1, k: 4 + rnd() * 3 },
      // (the look review's round 8: a third of them still stood arms down through "empty?", mannequins. A free hand
      // reacts as they turn: to the chest, to the mouth, or out toward the case (from their index, so the crowd's
      // own draw is left as it was)
      react: ['chest', 'point', 'mouth', 'chest', null, 'point', 'mouth'][(i * 5 + 3) % 7],
    });
  });
  let mode = 'chat', shown = false, t = 0, cheerT = 0;
  const G = {
    people,
    get current() { return mode; },
    show(on) { shown = !!on; for (const m of C.meshes) m.visible = shown; flutes.visible = shown; },
    // chat (in groups), watch (gather facing the screen; at once: snap), turn (every head to the case, after a beat
    // each), scatter (run from the case)
    mode(m, { snap = false } = {}) {
      mode = m; if (m === 'scatter') cheerT = FLINCH;
      for (const p of people) {
        p.t = 0; p.wave = null;
        // (scatter: a flinch at the alarm, hands up, then away from the case; the look review's round 6: they stood calm
        // under it, and ran on his line to the helicopter. Anyone headed south, his way out, breaks to the nearer side)
        if (m === 'scatter') {
          let dx = p.x - cs.x, dz = p.z - cs.z; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
          const along = dx * SOUTH.x + dz * SOUTH.z, side = dx * EAST.x + dz * EAST.z;
          if (along > 0.2) { const sg = side >= 0 ? 1 : -1; dx = EAST.x * sg - SOUTH.x * 0.25; dz = EAST.z * sg - SOUTH.z * 0.25; }
          const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.5;
          p.run = { a, v: 3.4 + Math.random() * 1.6, t: -Math.random() * 0.3 };
          // (a few throw their hands up; the rest only start, then go: a whole crowd's hands up read as a cheer)
          p.wave = Math.random() < 0.35 ? { clip: 'raiseBothYouth', t: 0.15 + Math.random() * 0.2 } : null;
          continue;
        }
        p.run = null; p.gone = false;
        if (snap) { const s2 = m === 'chat' ? p.chat : p.watch; p.x = s2.x; p.z = s2.z; p.h = s2.h; p.rig.reset(p.x, p.z, p.h, ground, p); }
      }
    },
    reset() { G.mode('chat', { snap: true }); },
    // the guests wave for secs (Fiona: "Say hi, everybody!")
    cheer(secs = 3) { cheerT = secs; for (const p of people) if (Math.random() < 0.7) p.wave = { clip: ['waveRightYouth', 'waveBothYouth', 'raiseBothYouth'][Math.floor(Math.random() * 3)], t: Math.random() * 0.4 }; },
    update(dt, cam) {
      if (!shown) return;
      t += dt; cheerT = Math.max(0, cheerT - dt);
      // (the crowd's people are the city's: kept out of close shots, none drawn within 3.5 m of a scene's camera, nor
      // 1.8 m of the follow camera's (the owner's review: their faces are not for close-ups))
      // (round 6: still close enough in the art wall's shot to read as mannequins: 4.5 m in a scene)
      const near = W.cutscene ? 4.5 : mode === 'scatter' ? 2.6 : 1.8;
      let nG = 0;
      const add = (p) => {
        const d = cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0;
        if (cam && d < near && cam.y - ground(p, p.x, p.z) < 3.5) return;
        C.add(p.rig, d);
        if (p.hasGlass && p.glass && nG < flutes.instanceMatrix.count) { _fm.makeTranslation(p.glass.x, p.glass.y + 0.035, p.glass.z); flutes.setMatrixAt(nG++, _fm); }
      };
      C.begin();
      for (const p of people) {
        if (p.gone) continue;
        p.t += dt;
        let hx = p.h;
        if (mode === 'scatter' && p.run) {
          p.run.t += dt;
          if (p.run.t > FLINCH) { p.x += Math.sin(p.run.a) * p.run.v * dt; p.z += Math.cos(p.run.a) * p.run.v * dt; hx = p.h = p.run.a; }
          const q = new THREE.Vector3(p.x, 0, p.z); cm.resolveHorizontalCollision?.(q, 0.3, 1.5); p.x = q.x; p.z = q.z;
          if (p.run.t > 8) { p.gone = true; continue; }
        } else {
          const s2 = mode === 'chat' ? p.chat : p.watch;
          const dx = s2.x - p.x, dz = s2.z - p.z, d = Math.hypot(dx, dz);
          if (d > 0.05 && p.t > p.delay * 0.6) { const st = Math.min(d, 1.15 * dt); p.x += dx / d * st; p.z += dz / d * st; hx = Math.atan2(dx, dz); }
          else hx = s2.h + Math.sin(t * p.sway.f + p.sway.p) * p.sway.a * (mode === 'chat' ? 1 : 0.4); // (a look round the group, or about the screen)
          // (round 6: the whole crowd snapped round as one, a line-up facing the lens. Each in their own time now, over
          // a second and a half, some only half round over a shoulder, none squared on the case, at their own pace)
          if (mode === 'turn' && p.t > p.turn.d) { const to = face(p.x, p.z, cs.x, cs.z) + p.turn.o; hx = s2.h + wrap(to - s2.h) * p.turn.f; }
          const k = mode === 'turn' ? p.turn.k : 3;
          p.h += wrap(hx - p.h) * Math.min(1, dt * k); hx = p.h;
        }
        // a wave (their own take, while the cheer lasts)
        if (p.wave && cheerT > 0 && CLIPS[p.wave.clip] && p.rig.playClip) { p.wave.t += dt; p.rig.playClip(CLIPS[p.wave.clip], p.wave.t * p.rate + p.at, p.x, p.z, p.h, ground(p, p.x, p.z)); p.waved = true; p.hasGlass = false; add(p); continue; }
        if (p.waved && p.rig.fadeFrom) { p.waved = false; (p.from ||= new Float32Array(p.rig.pose.length)).set(p.rig.pose); p.fade = 1; }
        p.rig.update(Math.max(1e-4, dt), p.x, p.z, hx, ground, p, 0, true);
        if (p.fade > 0) { p.fade = Math.max(0, p.fade - dt / 0.3); p.rig.fadeFrom(p.from, p.fade * p.fade * (3 - 2 * p.fade)); }
        // (the held pose, and in a group a free hand that talks now and then: the forearm up and down a little)
        if (!p.run) {
          const H = HOLDS[p.hold], v = p.vary, k = 1 - (p.fade || 0);
          const talk = p.gest && mode === 'chat' ? Math.max(0, Math.sin(t * p.gest.f + p.gest.p)) ** 2 : 0;
          const rw = mode === 'turn' && p.react ? Math.min(1, Math.max(0, (p.t - p.turn.d - 0.15) / 0.45)) : 0, re = rw * rw * (3 - 2 * rw);
          // (the reacting hand: the right if it is free, else the left; a glass hand stays with its glass)
          const ri = re > 0 ? (!H?.[1] ? 1 : !H?.[0] ? 0 : -1) : -1;
          for (let i = 0; i < 2; i++) {
            const A = H?.[i];
            if (A) poseArm(p.rig, i, A[0] + v[0], A[1] + v[2], A[2] + v[1], A[3], k, A[2] > 1.5 ? (p.glass ||= new THREE.Vector3()) : null);
            else if (i === ri) {
              if (p.react === 'point') poseArm(p.rig, i, 1.05 + v[0], 0.22, 0.3, 0.15, k * re);
              else if (p.react === 'mouth') poseArm(p.rig, i, 0.45 + v[0], 0.08, 2.15, 0.85, k * re);
              else poseArm(p.rig, i, 0.3 + v[0], 0.06, 1.95, 1.0, k * re);
            }
            else if (i === 1 && talk > 0.02) poseArm(p.rig, 1, 0.18 + talk * 0.2, 0.18, 0.5 + talk * 0.85, 0.25, k * Math.min(1, talk * 1.6));
          }
          p.hasGlass = !!(H && (H[0]?.[2] > 1.5 || H[1]?.[2] > 1.5)) && k > 0.9;
        } else p.hasGlass = false;
        add(p);
      }
      C.end();
      flutes.count = nG; flutes.instanceMatrix.needsUpdate = true;
    },
    dispose() { for (const m of C.meshes) app.scene.remove(m); app.scene.remove(flutes); fg.dispose(); flutes.material.dispose(); },
  };
  G.reset();
  return G;
}

/* ---------------------------------------------------------------- recon -- */
const SUIT_POSTS = () => [
  // one walks the art wall's aisle, end to end, a look about at each end
  { path: [[at(-2.9, -10.4).x, at(-2.9, -10.4).z], [at(-2.9, 5.2).x, at(-2.9, 5.2).z]], speed: 0.95, pause: 3.2, name: 'The Suit on the art wall' },
  // one by the High Artwork, looking up the pavilion toward the entrance and across to the wall
  { at: [at(3.7, 3.0).x, at(3.7, 3.0).z], yaw: PAV.h + PI + 0.55, sweep: 0.75, period: 8, name: 'The Suit by the High Artwork' },
];
export function createRecon(W, pav, { U, knox = null }) {
  const app = W.app, P = W.person, scene = app.scene, cam = app.cameraSystem.camera;
  const stealth = createStealth(W, { posts: SUIT_POSTS(), U, center: { x: PAV.x, z: PAV.z }, range: 9.5, close: 1.7 });
  // Knox on the door, eyes on his phone: a short cone at his feet
  const KR = 3.4, KH = 0.5;
  const kGeo = new THREE.CircleGeometry(KR, 18, -KH, KH * 2); kGeo.rotateX(-PI / 2);
  const kCone = new THREE.Mesh(kGeo, new THREE.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.08, depthWrite: false })); kCone.renderOrder = 4; kCone.frustumCulled = false; scene.add(kCone);
  const K = { sus: 0, name: 'Knox' };
  const _v = new THREE.Vector3();
  // (the sight cones soft, for the pavilion: the look review's rounds 3 and 4, 15 Nov, read the hard-edged yellow pie
  // sectors on the deck, the boardwalk and outside the canopy as a lighting fault. They are the Suits' and Knox's sight,
  // so they stay in play, but faded out toward their reach and their edges, and never in a cutscene's frame)
  const softs = [];
  const soften = (m) => {
    const half = (m.geometry.parameters?.thetaLength || 1) / 2, N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), img = x.createImageData(N, N), D = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N * 2 - 1, v = (j + 0.5) / N * 2 - 1, r = Math.hypot(u, v), a = Math.abs(Math.atan2(v, u)), k = (j * N + i) * 4;
      const rad = Math.max(0, 1 - Math.pow(Math.min(1, r), 1.6)) * Math.min(1, r / 0.08), ang = Math.max(0, Math.min(1, (half - a) / (half * 0.45)));
      const al = Math.round(255 * Math.min(1, rad * ang * ang * 1.5)); D[k] = D[k + 1] = D[k + 2] = al; D[k + 3] = 255;
    }
    x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); softs.push(t);
    const old = m.material; m.material = new THREE.MeshBasicMaterial({ color: old.color.clone(), transparent: true, opacity: old.opacity, depthWrite: false, alphaMap: t }); old.dispose();
  };
  soften(kCone);
  const R = {
    stealth, tray: null,
    get by() { return stealth.by || (K.sus >= 1 ? K : null); },
    async spawn() { await stealth.spawn(); for (const L2 of stealth.lookouts) soften(L2.cone); return R; },
    step(dt) {
      // (a waiter with a tray: nobody looks twice)
      stealth.rate = R.tray?.held ? 0.3 : 1; stealth.closeCatch = !R.tray?.held;
      let r = stealth.step(dt);
      if (W.cutscene) for (const L2 of stealth.lookouts) L2.cone.visible = false;
      if (knox?.root?.visible) {
        const k = knox.root, yaw = k.rotation.y, dx = P.position.x - k.position.x, dz = P.position.z - k.position.z, d = Math.hypot(dx, dz);
        const sees = d < KR && Math.abs(wrap(Math.atan2(dx, dz) - yaw)) < KH;
        K.sus = sees ? Math.min(1, K.sus + dt * (R.tray?.held ? 0.35 : 0.9) * (1 + (KR - d))) : Math.max(0, K.sus - dt * 0.3);
        kCone.visible = !W.cutscene; kCone.position.set(k.position.x, k.position.y + 0.06, k.position.z); kCone.rotation.y = yaw - PI / 2;
        kCone.material.color.set(K.sus > 0.66 ? '#EF4444' : K.sus > 0.05 ? '#F59E0B' : '#FFC93C'); kCone.material.opacity = 0.07 + K.sus * 0.1;
        _v.set(k.position.x, k.position.y + 2.3, k.position.z).project(cam);
        U.mark('m4-knox', { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, k: K.sus, on: _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 && d < 30 && (K.sus > 0.02 || d < 14) });
        if (K.sus >= 1 && !r) r = 'seen';
      } else kCone.visible = false;
      return r;
    },
    alarm() { stealth.alarm(); kCone.visible = false; U.unmark('m4-knox'); },
    get crew() { return stealth.crew; },
    dispose() { stealth.dispose(); scene.remove(kCone); kGeo.dispose(); kCone.material.dispose(); for (const t of softs) t.dispose(); U.unmark('m4-knox'); for (const L2 of stealth.lookouts) L2.e.root.visible = false; },
  };
  return R;
}

/* ----------------------------------------------------------------- tray -- */
export function createTray(W, pav) {
  const app = W.app, P = W.person, ui = W.ui, cm = app.controllerManager;
  const g = new THREE.Group(); g.name = 'm4-tray'; g.visible = false; app.scene.add(g); g.userData.noCamBlock = true;
  const steel = new THREE.MeshStandardMaterial({ color: '#C9CCD1', metalness: 0.85, roughness: 0.28 });
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), steel); t.castShadow = true; g.add(t);
  const flute = new THREE.MeshStandardMaterial({ color: '#F2E2B0', transparent: true, opacity: 0.65, roughness: 0.1 });
  for (const [x, z] of [[0.07, 0.04], [-0.06, 0.07], [0.0, -0.08]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.018, 0.17, 8), flute); m.position.set(x, 0.09, z); g.add(m); }
  let act = null, held = false;
  const _p = new THREE.Vector3();
  const T = {
    get held() { return held; },
    // the pick-up at the bar: true the moment he takes one
    step(dt, onFoot = true) {
      if (held) return false;
      act ||= ui.holdAct({ label: 'take a tray', verb: 'Walk up to', noun: 'the bar', secs: 0.6, show: 5, reach: 1.7 });
      if (act.step(dt, Math.hypot(P.position.x - pav.tray.x, P.position.z - pav.tray.z), onFoot)) { act.stop(); act = null; T.hold(true); return true; }
      return false;
    },
    hold(on) { held = !!on; g.visible = held; if (!held) W.dan?.reach?.('R', null, 0); },
    // each frame: at his right shoulder, level, his hand under it
    follow() {
      if (!held) return;
      const h = P.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      g.visible = cm.activeMode === 'person' && P.mesh.visible;
      g.position.set(P.position.x + fx * 0.3 + rx * 0.24, P.position.y + 1.36, P.position.z + fz * 0.3 + rz * 0.24); g.rotation.set(0, h, 0);
      W.dan?.reach?.('R', _p.set(g.position.x, g.position.y - 0.05, g.position.z), 1, new THREE.Vector3(0.6, -1, -0.2));
    },
    drop() { T.hold(false); act?.stop(); act = null; },
    stopAct() { act?.stop(); act = null; },
    dispose() { T.drop(); app.scene.remove(g); },
  };
  return T;
}

/* ------------------------------------------------------------------ pad -- */
const PAD_CSS = `
#wg .m4-pad { position: absolute; left: 50%; bottom: 17%; transform: translateX(-50%); padding: 12px 16px 14px; background: rgba(8,10,14,0.78); border-radius: 14px; border: 2px solid #4ADE80; text-align: center; opacity: 0; pointer-events: none; transition: opacity .2s, border-color .15s; z-index: 6; }
#wg .m4-pad.on { opacity: 1; pointer-events: auto; }
#wg .m4-pad.bad { border-color: #EF4444; box-shadow: 0 0 28px rgba(239,68,68,.55); }
#wg .m4-pad .h { font: 800 15px/1 'Barlow Condensed', sans-serif; letter-spacing: 2px; color: #4ADE80; margin-bottom: 8px; }
#wg .m4-pad.bad .h { color: #EF4444; }
#wg .m4-pad .slots { display: flex; gap: 8px; justify-content: center; margin-bottom: 10px; }
#wg .m4-pad .slot { width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; font: 700 13px 'Barlow Condensed'; color: #9AA3AE; }
#wg .m4-pad .slot img { width: 30px; height: 30px; }
#wg .m4-pad .keys { display: flex; gap: 10px; justify-content: center; }
#wg .m4-pad button { width: 64px; height: 64px; border-radius: 12px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.06); position: relative; cursor: pointer; touch-action: manipulation; }
#wg .m4-pad button:active, #wg .m4-pad button.hit { background: rgba(74,222,128,.3); }
#wg .m4-pad button img { width: 40px; height: 40px; }
#wg .m4-pad button kbd { position: absolute; left: 4px; top: 3px; font: 700 11px 'Barlow Condensed'; color: #FFC93C; }
body.wg-touchlast:not(.wg-pad) #wg .m4-pad button kbd { display: none; }
/* (the look review's round 9: in the pavilion the stealth's prompt, over the middle, sat on the big screen's card at the
   far end of the deck, the frame's middle. Lower through the marks, under the crowd's heads, over the subtitles) */
body.m4-recon #wg .m2-prompt { top: 71%; }
`;
export function createPad(W, glyphs) {
  const root = document.querySelector('#wg') || document.body;
  if (!document.getElementById('m4-pad-css')) { const st = document.createElement('style'); st.id = 'm4-pad-css'; st.textContent = PAD_CSS; document.head.appendChild(st); }
  const img = (k) => glyphCanvas(k, 96).toDataURL();
  const NUM = 'I|II|III'.split('|');
  const el = document.createElement('div'); el.className = 'm4-pad';
  el.innerHTML = `<div class="h">${story.t('ENTER THE MARKS · I · II · III')}</div><div class="slots">${NUM.map((n) => `<div class="slot">${n}</div>`).join('')}</div>
    <div class="keys">${glyphs.map((k, i) => `<button type="button" data-k="${k}"><kbd>${i + 1}</kbd><img alt="${k}" src="${img(k)}"></button>`).join('')}</div>`;
  root.appendChild(el);
  const slots = [...el.querySelectorAll('.slot')], btns = [...el.querySelectorAll('button')];
  let entered = [], on = false, wrong = 0, done = false, order = glyphs.slice(), badT = null;
  const clear = () => { entered = []; slots.forEach((s, i) => { s.innerHTML = NUM[i]; }); };
  function press(k) {
    if (!on || done) return;
    W.sfx?.play('ding', { gain: 0.09 });
    const i = entered.length; entered.push(k); slots[i].innerHTML = `<img alt="" src="${img(k)}">`;
    if (entered[i] !== order[i]) {
      // wrong: red, a buzz, start over (the window keeps closing)
      wrong++; el.classList.add('bad'); W.sfx?.play('buzz', { gain: 0.2, times: 1 });
      clearTimeout(badT); badT = setTimeout(() => { el.classList.remove('bad'); clear(); }, 650);
      entered = [k, k, k]; // (no more presses count till it clears)
      return;
    }
    if (entered.length === order.length) { done = true; }
  }
  btns.forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (entered.length < 3) press(b.dataset.k); }));
  const onKey = (e) => {
    if (!on || e.repeat || W.paused) return;
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code); if (!m) return;
    // (its keys are its own while it is up: the city's mode keys don't hear them)
    e.stopImmediatePropagation(); e.preventDefault();
    const b = btns[+m[1] - 1]; b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 120);
    if (entered.length < 3) press(b.dataset.k);
  };
  addEventListener('keydown', onKey, true);
  return {
    // the order to enter (the Nocturnes', I, II, III: the pavilion's deal)
    set order(o) { order = o.slice(); },
    // (up, its number keys are its own: the story's guard on 1-4 stands aside for it as for an offer, ui.js)
    show(v) { v = !!v; if (v === on) return; on = v; el.classList.toggle('on', on); document.body.classList.toggle('wg-offering', on); if (!on) { el.classList.remove('bad'); clear(); } },
    reset() { done = false; wrong = 0; clear(); el.classList.remove('bad'); },
    get done() { return done; },
    get wrong() { return wrong; },
    press, // (for the test drive)
    dispose() { removeEventListener('keydown', onKey, true); el.remove(); },
  };
}
