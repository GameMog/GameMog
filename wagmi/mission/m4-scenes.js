// Mog City: Mission 4's scenes, on the cutscene machinery (cine.js, run by Mission 2's runScene). First-playable cuts:
// each is a few held shots over its lines (the shot changes as a line starts), the actors placed and idling; the
// camera work, the poses and the beauty pass come after the owner's review of the slice. Mr. Big is only ever seen
// on the phone or on video from his office: here his feed on the pavilion's screen, and the caller card on the phone.
// The stolen work is only ever "the High Artwork".
//   benchScene · arrivalScene · unveilScene · flipScene · takeoffScene · landingScene · boardingScene · callScene
// Each returns a runScene def; say is the mission's (subtitles, their voices, a murmur where a line isn't voiced).
import * as THREE from 'three/webgpu';
import { SPOTS, PAV, at, LAND, GATE, FERRY, SY } from './m4-set.js';
import { rig } from './cine.js';
import { S as story } from '../story/index.js';

const PI = Math.PI;
export const WHITE = '#FFFFFF', BLUE = '#6CB8FF', ACID = '#B6FF3B', PINK = '#FF8AD8';
export const R_AT = { x: 933, z: 3561 };            // Rook's bench, Sara D. Roosevelt Park (m3.js R_AT)
const gy = (W, x, z) => W.app.controllerManager.getGroundHeight(x, z, 'person');

// a scene of held shots over its lines: shots [{ line, pos, look, fov }] (the first from the start, each next as its
// line starts); cues [[t, fn]] besides the lines; pose(t, dt, C) each frame; END a beat after the last line
export function talk(W, { say, lines, shots, cues = [], pose = null, setup = null, cleanup = null, onLine = null, lead = 0.5, tail = 1.0, minEnd = 2.5 }) {
  const S = shots.map((s, i) => ({ line: s.line ?? i, t: i === 0 ? 0 : Infinity, cam: typeof s.cam === 'function' ? s.cam : () => ({ pos: s.pos, look: s.look, fov: s.fov ?? 38, shake: s.shake ?? 0.3 }) }));
  const def = {
    END: Infinity, hero: false, shots: S,
    cues: [...cues, [lead, (st) => {
      const done = () => { const now = W.sceneClock?.t; if (now != null) def.END = Math.max(now + tail, minEnd); };
      if (!lines.length) return done();
      say(lines, st, (who, i) => { const now = W.sceneClock?.t ?? 0; for (const sh of S) if (sh.line === i && sh.t === Infinity) sh.t = now; onLine?.(who, i, now); }).finally(done);
    }]],
    pose(t, dt, C) { pose?.(t, dt, C); },
    setup() { setup?.(); }, cleanup(st) { cleanup?.(st); },
  };
  return def;
}
// a cast member (a Suit's body, Fiona) stood at x, z facing h, idling from t
export function stand(W, who, x, z, h, clip = null) {
  if (!who) return;
  const y = gy(W, x, z); who.root.visible = true; who.root.position.set(x, y, z); who.root.rotation.set(0, h, 0);
  who.rig.set([[0, clip || (W.cast?.SUITS?.idle) || 'thugIdle']]);
}
const face = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
// (Fiona's own clips, m3-set.js buildFiona: talking on her riser; not a Suit's stand)
export const fionaTalk = (f) => (f?.clips?.includes('talk') ? 'talk' : 'thugIdle');
const eye = (W, p, h = 1.6) => [p.x, gy(W, p.x, p.z) + h, p.z];

/* --------------------------------------------------------------- bench -- */
// a park bench (the Parks kind: wooden slats on cast-iron ends), its front to +z when h is 0; .seat its top's height
function parkBench(W, x, z, h) {
  const g = new THREE.Group(); g.name = 'm4-bench';
  const wood = new THREE.MeshStandardMaterial({ color: '#6E4C30', roughness: 0.78 }), iron = new THREE.MeshStandardMaterial({ color: '#1E2722', roughness: 0.45, metalness: 0.6 });
  const box = (w, hh, d, m, px, py, pz, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(px, py, pz); b.rotation.x = rx; b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
  const L = 1.95, SEAT = 0.45;
  for (let i = 0; i < 4; i++) box(L, 0.035, 0.09, wood, 0, SEAT - 0.018, 0.2 - i * 0.115);
  for (let i = 0; i < 3; i++) box(L, 0.085, 0.032, wood, 0, SEAT + 0.17 + i * 0.12, -0.25 - i * 0.03, -0.24);
  for (const sx of [-L / 2 + 0.06, 0, L / 2 - 0.06]) {
    box(0.05, SEAT, 0.05, iron, sx, SEAT / 2, 0.2);                  // the front leg
    box(0.05, 0.86, 0.05, iron, sx, 0.43, -0.25, -0.12);             // the back leg, up into the back's frame
    box(0.05, 0.04, 0.5, iron, sx, SEAT - 0.05, -0.02);              // under the slats
    if (sx) { box(0.05, 0.045, 0.46, iron, sx, SEAT + 0.22, 0.0); box(0.045, 0.22, 0.045, iron, sx, SEAT + 0.1, 0.2); } // the arms
  }
  const y = W.app.controllerManager.getGroundHeight(x, z, 'person');
  g.position.set(x, y, z); g.rotation.y = h; W.app.scene.add(g);
  return { group: g, seat: y + SEAT, dispose() { W.app.scene.remove(g); g.traverse((o) => { o.geometry?.dispose?.(); }); wood.dispose(); iron.dispose(); } };
}
// a Suit's body (the stand-in's rig: hips, thighL/R, shinL/R, upperArmL/R, forearmL/R) sat on a seat over its idle: the
// thighs out level in front, the shins down, the hands on the thighs, his hips set down on the seat's top
const _tq = new THREE.Quaternion(), _tw = new THREE.Quaternion(), _ax = new THREE.Vector3(), _hp = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3();
function turnQ(b, q) { if (!b) return; b.getWorldQuaternion(_tw); const want = q.clone().multiply(_tw); b.parent.getWorldQuaternion(_tw); b.quaternion.copy(_tw.invert().multiply(want)); b.updateMatrixWorld(true); }
// (a bone turned so the line from it to its child points along dir, whatever the clip had it doing)
function aim(b, child, dir) { if (!b || !child) return; b.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize(); turnQ(b, _tq.setFromUnitVectors(_b, _f.copy(dir).normalize())); }
function seatSuit(who, seatY, h) {
  const B = who.bones; who.root.updateMatrixWorld(true);
  const F = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), R = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)), down = new THREE.Vector3(0, -1, 0);
  // (the look review's round 5, 15 Nov: bolt upright, both hands flat on his knees, a mannequin on a bench. Sat back
  // now, the knees easy apart, the shoulders let down: his inner forearm along his thigh, the hand loose past the knee;
  // the outer hand resting on the seat by his hip; his head a little down and toward Dan)
  // (round 6: the round 5 pose was there but too slight to read in the wide, still a man sat up straight. Each turn
  // is three times as big now: leaned well back, knees wide, his near forearm laid along his thigh, the far hand
  // planted on the slats behind his hip, the head turned a third of the way to Dan)
  // (round 7: that read slumped, a drunk on a bench: the lean back eased, the knees 40% closer, the near forearm laid
  // on the thigh, the far hand on the seat by his hip where the wide shows it, the head up and less turned)
  turnQ(B.spine, _tq.setFromAxisAngle(R, -0.15));
  turnQ(B.spine2, _tq.setFromAxisAngle(R, 0.06));
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    // (round 8: the knees still read wide: closer again, a man at ease, not spread)
    aim(B['thigh' + s], B['shin' + s], F.clone().addScaledVector(down, 0.06).addScaledVector(R, sx * 0.12));
    aim(B['shin' + s], B['foot' + s], down.clone().addScaledVector(F, sx > 0 ? 0.34 : 0.1).addScaledVector(R, sx * 0.12));
  }
  // (his left toward Dan: forearm along the thigh, the hand hanging off the knee; his right on the seat behind him)
  aim(B.upperArmL, B.forearmL, down.clone().addScaledVector(F, 0.42).addScaledVector(R, 0.12));
  aim(B.forearmL, B.handL, F.clone().addScaledVector(down, 0.42).addScaledVector(R, 0.04));
  // (round 8's review: his far hand, planted on the seat behind his hip, sank out of sight behind him in his single,
  // as if he had no far arm. Laid along the bench's arm now, the elbow on it, the hand over its front: in every shot)
  aim(B.upperArmR, B.forearmR, down.clone().addScaledVector(R, -0.95).addScaledVector(F, 0.12));
  aim(B.forearmR, B.handR, F.clone().addScaledVector(down, 0.12).addScaledVector(R, -0.1));
  turnQ(B.handR, _tq.setFromAxisAngle(F, 0.5));
  turnQ(B.head, _tq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3).multiply(_tw.setFromAxisAngle(R, 0.04)));
  B.hips.getWorldPosition(_hp); who.root.position.y += seatY + 0.1 - _hp.y;
}
// (Rook's face for the evening: wet eyes, brows drawn soft rather than cut hard to two black dashes, skin with a little
// sheen and his own colour, his hair less flat: the Mr. Big standard, on the Suit's body standing in for him)
export function rookFace(who, on) {
  if (!who?.root) return;
  if (on && !who._face0) {
    const keep = who._face0 = [];
    who.root.traverse((o) => {
      const m = o.isMesh && o.material; if (!m || Array.isArray(m)) return;
      if (m.name === 'eyes') { const e = new THREE.MeshPhysicalMaterial({ name: 'eyes', map: m.map, alphaTest: m.alphaTest, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }); e.envMapIntensity = 1.4; keep.push([o, m]); o.material = e; }
      else if (m.name === 'brows') { const c = m.clone(); c.alphaTest = 0.26; c.color.setRGB(1.55, 1.38, 1.22); c.roughness = 0.9; keep.push([o, m]); o.material = c; }
      else if (m.name === 'skin') { const c = m.clone(); c.roughness = 0.8; if (c.color) c.color.set('#F2E0D4'); keep.push([o, m]); o.material = c; }
      else if (m.name === 'hair') { const c = m.clone(); c.roughness = 0.62; keep.push([o, m]); o.material = c; }
    });
  } else if (!on && who._face0) { for (const [o, m] of who._face0) { if (o.material !== m) o.material.dispose(); o.material = m; } who._face0 = null; }
}
// beat 1, dusk: Rook on his bench (a Suit's body stands in for his own model until it is signed off). (The look
// review's round 3, 15 Nov: no bench, the two stood on open lawn, the reverse lit lavender by the low sky's light on the
// facade behind Dan and the wide's faces too dark to read. Now a park bench, the two sat side by side on it looking out
// at the park, "Don't look at me. Look at the pigeons.", so a shot and its reverse look the same way, at the same
// trees, under one warm lamp; the low sky's direct light held down for the scene; Rook's shades swapped for clear
// lenses at night)
export function benchScene(W, { say, rook, pav = null }) {
  const H = 0, BX = R_AT.x, BZ = R_AT.z;
  // (round 7's review: Rook perched on the seat's front edge: sat back into it now, a hand's width deeper)
  const D = { x: BX + 0.45, z: BZ + 0.04 }, K = { x: BX - 0.47, z: BZ - 0.05 };
  const LINES = [
    ['Rook', BLUE, 'You came. Alone?'],
    ['Dan', WHITE, 'Alone-ish.'],
    ['Rook', BLUE, "Okay. Okay. Don't look at me. Look at the pigeons."],
    ['Dan', WHITE, "Where's my laptop?"],
    ['Rook', BLUE, "Locked in the shredder truck. Two Suits ride with it. I can't touch it."],
    ['Rook', BLUE, 'But tonight Mr. Big unveils his new trophy. The High Artwork. At the Seaport.'],
    ['Dan', WHITE, 'He bought a painting?'],
    ['Rook', BLUE, 'He bought the High Artwork. Marzo Quillfeather. He loves it more than people.'],
    ['Rook', BLUE, 'To sign it on camera, his signing key unlocks. Ninety seconds.'],
    ['Dan', WHITE, 'And whoever holds the key...'],
    ['Rook', BLUE, 'Owns the High Artwork. Take what he loves. Then trade.'],
    ['Rook', BLUE, "Wristband. Catering pass. You're a waiter tonight."],
    ['Dan', WHITE, 'I was a waiter in college. I was bad at it.'],
    ['Rook', BLUE, 'Be bad at it quietly.'],
    ['Rook', BLUE, 'His chopper waits at the end of the street to fly the key home. I sent the pilot for coffee.'],
    ['Dan', WHITE, 'Why are you doing this?'],
    ['Rook', BLUE, "I was in that crowd today. I'm done."],
    ['Rook', BLUE, 'Go. Before somebody sees us.'],
  ];
  let bench = null, seat = 0, dr = null, ls0 = null, lens0 = null, segs = [[0, 'sit']], poseT = -1;
  const y0 = gy(W, BX, BZ), eyeY = y0 + 1.22;
  // (the shots: the wide from the path in front; each one's single from in front of the other, a little off his line)
  // (round 8's review: square on from the path, their thighs ran straight at the lens and both read as stood in front of
  // the bench, legs straight. Each wide from three quarters now, low: the bent knees, the seat under them, the backrest)
  const wide = (side, up = 0) => ({ pos: [BX + side * 3.4, eyeY - 0.08 + up, BZ + 4.0], look: [BX + side * 0.1, eyeY - 0.63, BZ], fov: 34 });
  // (round 7's review: Rook's single had a purple dusk band of sky over the trees behind him, its wide and its reverse
  // full night. Each single a little higher, looking a little down: the park's lawn and the lit blocks behind them, the
  // low sky out of the frame)
  const onD = { pos: [K.x + 0.1, eyeY + 0.2, BZ + 1.75], look: [D.x, eyeY - 0.08, D.z], fov: 30 };
  const onK = { pos: [D.x - 0.1, eyeY + 0.2, BZ + 1.75], look: [K.x, eyeY - 0.08, K.z], fov: 30 };
  const def = talk(W, {
    say, lines: LINES,
    shots: [
      { line: 0, ...wide(-1) },
      { line: 2, ...onK },
      { line: 3, ...onD },
      { line: 5, ...onK, fov: 27 },
      { line: 9, ...onD, fov: 28 },
      { line: 10, ...wide(0.9, 0.1) },
      { line: 14, ...onK, fov: 27 },
      { line: 16, ...wide(-0.85, 0.15) },
    ],
    cues: [[0.2, () => W.ui.place('Sara D. Roosevelt Park', 'Lower East Side · New York', 3)]],
    // (Dan's hands with his words, sat; still between them)
    onLine(who) { const now = W.sceneClock?.t ?? 0, want = who === 'Dan' ? 'sitTalk' : 'sit'; if (segs[segs.length - 1][1] !== want) { segs = [segs[segs.length - 1], [now, want, { fade: 0.5 }]]; dr?.set(segs); } },
    setup() {
      bench = parkBench(W, BX, BZ, H); seat = bench.seat;
      const P = W.person; P.position.set(D.x, gy(W, D.x, D.z), D.z); P.heading = H; P.mesh.position.copy(P.position); P.mesh.rotation.y = H; P.mesh.visible = true;
      const Q = W.dan; if (Q?.act) { const c = {}; for (const n of ['sit', 'sitTalk']) if (Q.clips.includes(n)) c[n] = Q.act(n).getClip(); if (c.sit) { dr = rig(Q.mixer, c); dr.set(segs); for (const a of Q.mixer._actions) if (!dr.owns(a)) a.setEffectiveWeight(0); } }
      stand(W, rook, K.x, K.z, H);
      // (no glasses for the evening: the look review's round 4, 15 Nov, the Suits' shades made clear were a pale band
      // across his eyes, cut for a Suit's head, not his)
      const sh = rook?.inner?.userData?.shades; if (sh) { lens0 = sh.visible; sh.visible = false; }
      rookFace(rook, true);
      // (the low sky's direct light held down for the scene, so the facades round the park are lit alike whichever way a
      // shot looks; one warm lamp in front of the bench, high, for both faces)
      const ls = W.app.lightingSystem; if (ls) { ls0 = ls.sunLight.intensity; ls.sunLight.intensity = ls0 * 0.25; }
      // (the round 4 review: at 8 and peach it lit his face hot pink, brighter than the park; a neutral, softer lamp)
      // (round 7's review: his face waxy and flat under it, square on. Off to the side now, a three-quarter key that
      // models both faces, cheek and jaw)
      pav?.key({ x: BX + 1.3, y: eyeY + 1.1, z: BZ + 1.9, color: '#F4E6D6', k: 4.6, dist: 7 });
    },
    cleanup() {
      pav?.key(null); bench?.dispose(); bench = null; dr?.stop();
      const ls = W.app.lightingSystem; if (ls && ls0 != null) ls.sunLight.intensity = ls0;
      { const sh = rook?.inner?.userData?.shades; if (sh && lens0 != null) sh.visible = lens0; lens0 = null; }
      rookFace(rook, false);
      W.dan?.act?.('idle')?.setEffectiveWeight(1);
    },
    pose(t) {
      // (paused, the clock held: his clip does not set his bones again, and the seat's turns laid over them a second time
      // folded him over his knees. Posed once per moment of the scene)
      if (t === poseT) return; poseT = t;
      if (rook) { rook.root.position.y = gy(W, K.x, K.z); rook.rig.pose(t); seatSuit(rook, seat, H); }
      // (Dan sat: his clip's hips put on the seat whatever its height, as on the garage's couch, m3-scenes.js)
      const Q = W.dan, P = W.person;
      if (dr && Q?.bones?.upperleg01_L) {
        dr.pose(t); P.position.set(D.x, gy(W, D.x, D.z), D.z); P.heading = H; P.mesh.position.set(D.x, P.position.y, D.z); P.mesh.rotation.y = H; Q.body.position.y = 0; Q.body.rotation.x = 0;
        P.mesh.updateMatrixWorld(true);
        const hip = Q.bones.upperleg01_L.getWorldPosition(new THREE.Vector3()).add(Q.bones.upperleg01_R.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        P.mesh.position.x += D.x - hip.x; P.mesh.position.z += D.z - hip.z; P.mesh.position.y += seat + 0.1 - hip.y;
      }
    },
  });
  def.hero = true; // (his own clips only while he sits: the scene's runner lets the game's go)
  return def;
}

/* ------------------------------------------------------------- arrival -- */
// beat 5, twilight: the waiter's jacket and cap (to come: wear.js), Knox on the door scrolling his phone
export function arrivalScene(W, { say, knox }) {
  const door = SPOTS.door, D = SPOTS.dan0, [dx, dy, dz] = eye(W, D), [kx, ky, kz] = eye(W, door, 1.75);
  const LINES = [
    ['Knox', ACID, 'Staff entrance. Smile less.'],
    ['Dan', WHITE, 'Yes, sir.'],
    ['Knox', ACID, "Don't sir me. I'm on my phone."],
    ['Dan', WHITE, "He didn't even look up."],
  ];
  return talk(W, {
    say, lines: LINES,
    shots: [
      { line: 0, pos: [at(-3, -24).x, dy + 1.4, at(-3, -24).z], look: [kx, ky - 0.4, kz], fov: 44 },
      { line: 1, pos: [kx + 0.8, ky, kz - 1.2], look: [dx, dy, dz], fov: 34 },
      { line: 2, pos: [dx - 0.8, dy, dz - 1.0], look: [kx, ky, kz], fov: 34 },
      { line: 3, pos: [dx + 1.4, dy + 0.2, dz + 1.6], look: [dx, dy, dz], fov: 36 },
    ],
    cues: [[0.2, () => W.ui.place('The Seaport · South St', 'Lower Manhattan · New York', 3)]],
    setup() {
      const P = W.person; P.position.set(D.x, gy(W, D.x, D.z), D.z); P.heading = face(D, door); P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading; P.mesh.visible = true;
      stand(W, knox, door.x, door.z, face(door, D) + 0.6);
    },
    pose(t) { knox?.rig.pose(t); },
  });
}

/* ------------------------------------------------------------- unveil -- */
// beat 7: Fiona on her riser; the guests gathered facing the big screen, their backs to the case (they wave when she
// asks); Mr. Big live on it from his office; the case goes green
export function unveilScene(W, { say, fiona, pav, guests = null }) {
  const F = SPOTS.riser, S = SPOTS.screen, C = SPOTS.case, y = pav.y;
  const LINES = [
    ['Fiona', PINK, 'Good evening, Seaport! JPBank loves art! And art loves JPBank!'],
    ['Fiona', PINK, 'Tonight our CEO unveils his newest treasure. The High Artwork!'],
    ['Fiona', PINK, "He's joining us live from his office. Say hi, everybody!"],
    ['Mr. Big', ACID, 'Good evening. Thank you all for coming to look at my things.'],
    ['Mr. Big', ACID, "Fiona. Open the case. Let's make it official."],
    ['Fiona', PINK, 'Opening the case!'],
  ];
  const back = at(1.6, -7.5), side = at(4.3, 1.6), fi = at(-3.4, 9.4), fl = at(-2.1, 13.4), sc = at(0.4, 5.6), cz = at(1.1, -0.9), fw = at(-4.5, 7.2), fwl = at(-3.0, 11.6), fk = at(-2.5, 10.2);
  let present = -1; const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), scr = new THREE.Vector3(S.x, y + 2.6, S.z);
  return talk(W, {
    say, lines: LINES,
    shots: [
      { line: 0, pos: [back.x, y + 2.5, back.z], look: [S.x, y + 2.4, S.z], fov: 46 },
      // (Fiona from past the art wall's end, in front of her riser's flat, his face on the big screen over her shoulder;
      // the look review, 15 Nov: framed tight on her, his head was cut off and the street ran on behind her)
      // (round 3: pushed in, her face larger and clear of the guest in white at the frame's edge)
      // (round 4: a medium close-up of her, waist up, from her left and in front, held on the frame's left third; the
      // screen's half-cut feed and the mic stand both out of it, the subtitle under her chin, not her small at the
      // frame's foot under the screen)
      // (round 5: back to round 3's frame, his face on the feed over her shoulder telling the story; the mic stand gone)
      // (round 6: that frame's right-centre third was the riser's dead black flat and she sat small at its foot. From in
      // front of the screen's west end now: his feed fills the left two thirds, she stands on the right third waist up
      // with the High Artwork's poster behind her, her near hand open toward his face)
      // (round 7: his feed cut off at the lens's edge read as an open set beside her, and she sat small in a corner over a
      // black void. From in front of her now, close: she stands waist up on the right third in her gala jacket, his feed
      // behind her over her shoulder in its lit bezel with its LIVE bug, her near hand open toward it)
      // (round 8: the poster behind her cut by the frame's edge: a little wider, his feed and the poster both whole, the
      // evening's title on the flat under his feed)
      { line: 1, pos: [fi.x, y + 1.73, fi.z], look: [fl.x, y + 2.2, fl.z], fov: 56 },
      { line: 2, pos: [side.x, y + 2.7, side.z], look: [at(-1.4, 8.5).x, y + 1.3, at(-1.4, 8.5).z], fov: 50 },
      { line: 3, pos: [sc.x, y + 2.0, sc.z], look: [S.x, y + SY, S.z], fov: 34 },
      // (round 7's review: no frame showed her whole, the floor-length skirt and the patent shoes. Her hero shot as he
      // speaks to her: head to toe on her riser, the pavilion's bulbs over her)
      // (round 8's review: his feed cut off at the top, him from the chest down on his own line. From lower and a step
      // back now, tilted up a little: his face whole on the feed, her head to toe on the riser beside it)
      { line: 4, pos: [fw.x, y + 0.93, fw.z], look: [fwl.x, y + 1.48, fwl.z], fov: 54 },
      { line: 5, pos: [cz.x, y + 1.6, cz.z], look: [C.x, y + 1.25, C.z], fov: 32 },
    ],
    // (the guests: a murmur as the High Artwork is named, a wave and a cheer for his feed)
    onLine(who, i) {
      // (a wave for his feed, then talking again)
      // (round 3: her arms hung stiff while she stood to present it; she talks with her hands through it now)
      if (i === 1) present = W.sceneClock?.t ?? 0; else if (i === 2) present = -1;
      if (fiona?.clips?.includes('idle')) { if (i === 2 && fiona.clips.includes('wave')) fiona.rig.set([[0, 'wave']]); else if (i === 5 || i === 3) fiona.rig.set([[0, fionaTalk(fiona)]]); }
      // (round 8's review: her hands floating stiff at her chest in her hero shot; the open presenting gesture again, to
      // his feed, as he speaks to her)
      if (i === 4) present = W.sceneClock?.t ?? 0; else if (i === 5) present = -1;
      if (i === 1 || i === 3) for (let k = 0; k < 5; k++) setTimeout(() => W.sfx?.play('mumble', { f0: 150 + Math.random() * 90, dur: 0.35, gain: 0.12, p: Math.random() * 2 - 1 }), k * 90);
      if (i === 2) { guests?.cheer(3.4); for (let k = 0; k < 7; k++) setTimeout(() => W.sfx?.play('shout', { f0: 180 + Math.random() * 120, vowel: 'a', dur: 0.3, gain: 0.08, p: Math.random() * 2 - 1 }), 700 + k * 110); }
    },
    // (turned a little toward the art wall's end, between the guests and her close-up's camera)
    // (round 7's review: her face flat beside his lit one on the feed. A warm key on her, high and in front, one of the
    // pavilion's own lamps lent off its string for the speech)
    setup() { stand(W, fiona, F.x, F.z, face(F, at(-3.8, 6.0)), fionaTalk(fiona)); if (fiona) fiona.root.position.y = y + 0.35; pav.feed(true); pav.key({ x: fk.x, y: y + 2.75, z: fk.z, color: '#FFD9B8', k: 5, dist: 4.5, on: true }); },
    cleanup() { pav.key(null); },
    pose(t) {
      fiona?.rig.pose(t);
      // (her right hand opened toward his feed as she names the High Artwork, eased in and held: a presenter's gesture,
      // not the talk clip's hands curled at her chest)
      const B = fiona?.bones?.upperarm01_R;
      if (present >= 0 && B && fiona.arm) {
        const k = Math.min(1, (t - present) / 0.5), w = k * k * (3 - 2 * k);
        fiona.root.updateMatrixWorld(true); B.getWorldPosition(_s);
        const h = fiona.root.rotation.y; _t.copy(scr).sub(_s).setY(0).normalize().add(_p.set(Math.sin(h), 0, Math.cos(h)).multiplyScalar(0.9)).normalize();
        const tgt = _s.clone().addScaledVector(_t, 0.46).add(_p.set(0, -0.12, 0));
        fiona.arm('R', tgt, _s.clone().addScaledVector(_t, 0.2).add(_p.set(0, -0.6, 0)), w * 0.9);
      }
    },
  });
}

/* --------------------------------------------------------------- flip -- */
// beat 9, the turn: OWNER · MR. BIG -> OWNER · DAN; every head turns from the screen to the empty case; Knox knows him;
// the tray goes down
export function flipScene(W, { say, fiona, knox, pav, guests = null, tray = null }) {
  const S = SPOTS.screen, C = SPOTS.case, y = pav.y, cert = SPOTS.cert;
  const LINES = [
    ['Fiona', PINK, 'And the certificate reads... owner, Mr...'],
    ['Fiona', PINK, '...Dan?'],
    ['Mr. Big', ACID, '...that is not my name.'],
    ['Fiona', PINK, 'Wait. The case is... empty?'],
    ['Knox', ACID, 'BANKER BOY.'],
    ['Dan', WHITE, "Tip's included."],
  ];
  const cc = at(3.05, 9.3), sc = at(0.4, 6.4), turn = at(3.6, -2.2), kc = at(1.0, -4.4), dc = at(0.7, 4.3), D = at(0, 2.4), K = at(1.5, -8);
  return talk(W, {
    say, lines: LINES,
    shots: [
      // (the whole certificate, its gilt frame and a margin of the dark wall round it)
      // (the round 2 review: aimed a little under its middle, so it sits clear over the subtitle's plate)
      { line: 0, pos: [cc.x, y + 1.6, cc.z], look: [cert.x, y + 1.5, cert.z], fov: 29 },
      { line: 2, pos: [sc.x, y + 2.0, sc.z], look: [S.x, y + SY, S.z], fov: 34 },
      // (from behind the case over the guests' heads: their backs, then every face turned this way)
      // (a little higher and down onto the case, so its EMPTY tag sits clear over the subtitle)
      // (round 2: further back and higher still, the case in the frame's middle third, its tag well over the plate)
      // (round 6: square on from behind the case, the crowd turning to it read as a line-up facing the lens. From
      // the art wall's side now, high: the empty case in the near corner, the guests round to it each in their own time)
      // (round 8: from the art wall's side the turned faces came straight at the lens over the case, and read as facing
      // the camera, not the case. From the High Artwork's side now: the empty case and its tag in the near right corner,
      // the crowd turned to it in three quarters)
      // (round 8's review: a guest's head over the middle of the evening's title on the flat. A little higher, so the
      // heads sit under it)
      { line: 3, pos: [turn.x, y + 3.25, turn.z], look: [at(0, 5.4).x, y + 1.0, at(0, 5.4).z], fov: 54 },
      { line: 4, pos: [kc.x, y + 1.8, kc.z], look: [K.x, y + 1.7, K.z], fov: 32 },
      { line: 5, pos: [dc.x, y + 1.6, dc.z], look: [D.x, y + 1.5, D.z], fov: 34 },
    ],
    cues: [[0.3, () => { pav.cert(story.t('DAN'), true); W.sfx?.play('glitch', { gain: 0.2 }); }], [0.55, () => pav.cert(story.t('DAN'), true)], [0.8, () => pav.cert(story.t('DAN'), true)], [1.4, () => pav.cert(story.t('DAN'))]],
    onLine(who, i) {
      if (i === 3) { guests?.mode('turn'); for (let k = 0; k < 6; k++) setTimeout(() => W.sfx?.play('mumble', { f0: 160 + Math.random() * 100, dur: 0.3, gain: 0.13, q: true, p: Math.random() * 2 - 1 }), k * 120); }
      if (i === 5) { tray?.drop(); W.sfx?.play('thunk', { gain: 0.25, f: 420, ring: true }); }
    },
    setup() {
      const P = W.person; P.position.set(D.x, gy(W, D.x, D.z), D.z); P.heading = PAV.h; P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading; P.mesh.visible = true;
      pav.caseState('empty');
      if (knox) stand(W, knox, K.x, K.z, PAV.h);
      // (a message still up from the grab, Jane's marks, sat over the certificate's corner: the look review's round 5)
      W.ui?.dm?.(null);
    },
    cleanup() { pav.caseState('alarm'); },
    pose(t) { fiona?.rig.pose(t); knox?.rig.pose(t); },
  });
}

/* ------------------------------------------------------------ take-off -- */
// beat 10a: into the helicopter at the closed end of South St, the skids up as Knox reaches the roadblock; Mr. Big on
// the phone from his office. Control is handed over in the air (about 50 m), never from the narrow street
export const CLIMB = 50;
export function takeoffScene(W, { say, heli, knox, y0 }) {
  const T = SPOTS.takeoff, hd = Math.atan2(LAND.x - T.x, LAND.z - T.z);
  const LINES = [
    ['Knox', ACID, "He's going for the chopper!"],
    ['Mr. Big', ACID, 'That is my helicopter.'],
    ['Dan', WHITE, 'Seatbelt.'],
    ['Mr. Big', ACID, 'Rook. Hold the truck.'],
  ];
  const lift = (t) => Math.max(0, Math.min(1, (t - 1.2) / 6.5));
  const heliY = (t) => y0 + 0.7 + (CLIMB - 0.7) * (lift(t) * lift(t) * (3 - 2 * lift(t)));
  const side = at(9, 30);
  return talk(W, {
    say, lines: LINES, minEnd: 8.4,
    shots: [
      { line: 0, cam: (t) => ({ pos: [side.x, y0 + 2.2, side.z], look: [T.x, heliY(t) + 1.5, T.z], fov: 48, shake: 0.6 }) },
      { line: 2, cam: (t) => ({ pos: [T.x + 6, heliY(t) + 4, T.z - 10], look: [T.x, heliY(t) + 1, T.z], fov: 46, shake: 0.4 }) },
    ],
    setup() {
      const P = W.person; P.mesh.visible = false;
      heli.position.set(T.x, y0 + 0.7, T.z); heli.heading = hd; heli.speed = 0; heli.verticalSpeed = 0;
      heli.mesh.position.copy(heli.position); heli.mesh.rotation.y = hd;
      if (knox) stand(W, knox, at(1.5, 27).x, at(1.5, 27).z, PAV.h, W.cast?.SUITS?.run?.[0]);
    },
    pose(t) {
      heli.position.y = heliY(t); heli.mesh.position.copy(heli.position);
      knox?.rig.pose(t);
    },
  });
}

/* ------------------------------------------------------------- landing -- */
// beat 10c: down on the riverfront, out of the helicopter in the waiter's jacket, a pat of the pocket with the key
export function landingScene(W, { say, heli }) {
  const L = LAND, y = gy(W, L.x, L.z), D = { x: L.x + 4.5, z: L.z + 3 };
  const LINES = [['Dan', WHITE, 'Nobody lands in Battery Park City at night. Perfect.']];
  return talk(W, {
    say, lines: LINES,
    shots: [{ line: 0, pos: [L.x + 12, y + 2.4, L.z + 10], look: [L.x, y + 1.6, L.z], fov: 42 }],
    setup() {
      const P = W.person; P.position.set(D.x, gy(W, D.x, D.z), D.z); P.heading = face(D, GATE); P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading; P.mesh.visible = true;
      heli.position.y = Math.max(heli.position.y, y + 0.3); heli.speed = 0; heli.verticalSpeed = 0;
    },
  });
}

/* ------------------------------------------------------------ boarding -- */
// beat 10e: down the gangway, a hop across the widening gap; the ferry pulls away (its motion: m4.js). (The deckhand's
// "Cutting it close." waits on a cast entry for him in the story pack, wagmi/story/schema.js)
export function boardingScene(W, { say, ferry, onDeck }) {
  const LINES = [
    ['Dan', WHITE, 'Last ferry. Made it.'],
    ['Dan', WHITE, 'Story of my week.'],
  ];
  return talk(W, {
    say, lines: LINES, minEnd: 6,
    shots: [{ line: 0, cam: () => { const p = ferry.world(6, 3, -26), l = ferry.world(0, 1.2, -12); return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: 46, shake: 0.4 }; } }],
    pose(t) { onDeck(t); },
  });
}

/* ---------------------------------------------------------------- call -- */
// beat 11, midnight on the open stern deck, the lit skyline behind him: Mr. Big on the phone from his office, as
// always (the caller card, never in person); Rook patched in; the shredder winds down over the phone. (The tone pick,
// two lines that end the same, is still to come.)
export function callScene(W, { say, ferry, onDeck, shred }) {
  const LINES = [
    ['Dan', WHITE, 'You have my laptop. I have your key.'],
    ['Mr. Big', ACID, "Daniel. You're on a boat."],
    ['Dan', WHITE, 'One thing goes in the shredder at dawn. Wonder which.'],
    ['Mr. Big', ACID, 'That key signs everything I own.'],
    ['Dan', WHITE, "Then you'd better be nice to it."],
    ['Mr. Big', ACID, 'Rook. Turn it around.'],
    ['Rook', BLUE, '...Turning around, sir.'],
    ['Dan', WHITE, 'I heard that.'],
    ['Mr. Big', ACID, "We'll trade. Somewhere public."],
    ['Mr. Big', ACID, 'Enjoy the ferry, Daniel.'],
    ['Dan', WHITE, "It's Dan."],
  ];
  // (from up the deck toward the stern: Dan at the rail facing us, the skyline and the wake behind him)
  const camAt = (lx, ly, lz, tx = 0, ty = 1.55, tz = FERRY.stern + 0.6, fov = 34) => () => { const p = ferry.world(lx, ly, lz), l = ferry.world(tx, ty, tz); return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov, shake: 0.35 }; };
  return talk(W, {
    say, lines: LINES, tail: 1.5,
    shots: [
      { line: 0, cam: camAt(1.2, 1.65, FERRY.stern + 4.2) },
      { line: 2, cam: camAt(-1.0, 1.7, FERRY.stern + 2.6, 0, 1.6, FERRY.stern + 0.6, 30) },
      { line: 5, cam: camAt(2.8, 2.6, FERRY.stern + 6.5, 0, 1.4, FERRY.stern - 4, 44) },
      { line: 7, cam: camAt(1.2, 1.65, FERRY.stern + 3.4, 0, 1.6, FERRY.stern + 0.6, 28) },
    ],
    pose(t) { onDeck(t); },
    // (the shredder's grind under Mr. Big's order, and its power-down as Rook answers)
    onLine(who, i) { if (i === 5) shred?.('grind'); if (i === 6) shred?.('down'); },
  });
}
