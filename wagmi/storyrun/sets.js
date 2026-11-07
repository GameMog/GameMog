// Mog City story runner: a cutscene staged in a set, the way Mog City's opening stages Mr. Big in his study
// (wagmi/mission/mrbig.js): the set is a little scene of its own (a room, or a closed exterior), built from the set kit
// (setkit.js), lit by its own lights, and drawn in place of the city's frame while a shot is in it, so nobody in it is
// ever on a street with the traffic. The people in it are the world's cast: each one's body is lifted out of the city
// into the set for the cutscene (and put back after, where it was), the hero as a double (his own body, the cast's
// copy: Dan's own stays with the car). The cutscene's cameras work as they do on the street ({ rel: <who> } on someone's
// head, 'player' the hero), in the set's own room.
//   const S = createSets(W, { cast, castName, heroName });
//   await S.prepare({ id: def, ... })   build the rooms, stand the people up, compile it all (before the first shot)
//   S.use(id | null)                     the set the next frames are drawn in (null: the city)
//   S.act(list)                          a shot's changes: [{ who, at, face, pose, walk, hug, hold }]
//   S.frame({ pos, look, fov, roll })    this frame's camera in the set;   S.point(ref) the hero's or someone's head
//   await S.release()                    everyone back where they were; the sets let go
// A set (pack: a cutscene's `set`, the opening's `sets`):
//   { room: 'bank-office' | 'school' | 'hideout' | 'pizzeria' | 'apartment' | 'garage' | 'steps' | 'park' | 'lobby'
//            | 'plaza' | 'alley', light: 'day' | 'golden' | 'night' (else the city's time),
//     people: [{ who, at: [x, z], face: <who> | degrees, pose: <clip>, walk: { to: [x, z], secs, after }, hug: <who>,
//                hold: { who, side } (a hand in theirs), y }] }
import * as THREE from 'three/webgpu';
import { kit, blobTexture } from './setkit.js';
import { ROOMS } from './rooms.js';
import { armTo } from '../mission/m3-set.js';
import { subLine } from '../face.js';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';

const PI = Math.PI;
const MH_ARM = ['upperarm01_', 'lowerarm01_', 'wrist_'];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const now = () => performance.now() / 1000;
// a pose's clip (Dan's names; the cast's bodies carry Dan's clips: cast.js); kneel and crouch are made here (arms():
// idle's upper body over legs bent by the two-bone reach); the sitting ones put the hips on the seat's mark
const SIT = new Set(['sit', 'sitTalk']);

export function createSets(W, { cast, castName, heroName, idleOf = () => null }) {
  const app = W.app, renderer = app.renderer;
  const sets = new Map(); // id -> { scene, K, room, people: Map(name -> P), lights, cam, shown }
  const moved = new Map(); // figure -> { parent, pos, rot, vis, hold }
  let active = null, hero = null, frameCam = null, warmFrames = 0;

  /* ------------------------------------------------------------ the draw -- */
  // (in place of the city's frame, as Mr. Big's study: the set's frame replaces it while a shot is in a set). Drawn
  // through the city's own frame (its scene pass given the set's scene and lens for the frame): the same exposure,
  // grade, filmic tone and bloom as the street, so a bright window blooms and a lamp glows. Its screen-space
  // reflections are off for it (they follow the city's lens). Without the city's passes (a tier with none), straight.
  const rp = app.renderPipeline, render0 = rp.render.bind(rp);
  rp.render = function (...a) {
    try {
      if (active && frameCam) {
        const S = active, c = frameCam;
        S.cam.position.set(c.pos[0], c.pos[1], c.pos[2]); S.cam.up.set(0, 1, 0); S.cam.lookAt(c.look[0], c.look[1], c.look[2]); if (c.roll) S.cam.rotateZ(c.roll);
        const asp = app.cameraSystem.camera.aspect || 16 / 9;
        if (S.cam.fov !== c.fov || S.cam.aspect !== asp) { S.cam.fov = c.fov; S.cam.aspect = asp; S.cam.updateProjectionMatrix(); }
        S.update();
        const sp = app.postFX?.scenePass;
        if (sp && !direct) {
          const ssr = app.postFX.ssrPass, s0 = sp.scene, c0 = sp.camera, i0 = ssr ? ssr.intensity.value : 0;
          sp.scene = S.scene; sp.camera = S.cam; if (ssr) ssr.intensity.value = 0;
          try { return render0(...a); } finally { sp.scene = s0; sp.camera = c0; if (ssr) ssr.intensity.value = i0; }
        }
        renderer.setRenderTarget(null); renderer.render(S.scene, S.cam);
        return;
      }
    } catch (e) { console.warn('[storyrun] set draw', e); if (!direct) { direct = true; return; } active = null; }
    return render0(...a);
  };
  let direct = false;

  function moodOf(def) {
    if (def.light) return def.light;
    const id = app.lightingSystem?.activePresetId || 'midday';
    return /midnight|night|twilight|blackout/.test(id) ? 'night' : /golden|sunset|dusk/.test(id) ? 'golden' : 'day';
  }

  /* ---------------------------------------------------------- a set built -- */
  // (the area lights' tables, once: a window's daylight is one)
  let ltc = false;
  function build(id, def) {
    const builder = ROOMS[def.room];
    if (!builder) { console.warn('[storyrun] no set room', def.room); return null; }
    const mood = moodOf(def), night = mood === 'night', golden = mood === 'golden';
    const scene = new THREE.Scene(); scene.name = 'storyrun-set-' + id;
    const K = kit(scene, { night, golden });
    const room = builder(K, def) || {};
    scene.background = new THREE.Color(room.sky || (night ? '#070A14' : golden ? '#E9C9A0' : '#BFD6EE'));
    scene.environment = app.scene.environment || null; scene.environmentIntensity = night ? 0.16 : (room.env ?? 0.5);
    // the light, as Mr. Big's study is lit and a film's interior is: low sky fill (the corners go dark), the sun
    // through the windows with its shadows (the blinds' stripes, the people's own), each window's daylight an area
    // light into the room (soft, wide, cool), the room's practicals warm and blooming, and on the people a key, a fill
    // and a rim that follow the lens (update): the key from the side the daylight comes from, soft-shadowed, the rim
    // from behind them on the far side, the fill low on the other
    const L = room.light || {};
    const hemi = new THREE.HemisphereLight(L.sky || (night ? '#3A4A78' : golden ? '#FFE2BC' : '#DCE8FF'), L.ground || (night ? '#1A1410' : '#7A6A58'), (L.hemi ?? (night ? 0.5 : golden ? 0.8 : 0.85)) * (L.hemiK ?? 0.5));
    scene.add(hemi);
    if (L.ambient) scene.add(new THREE.AmbientLight(L.ambientColor || '#FFFFFF', L.ambient));
    let sun = null;
    if (L.sun !== false) {
      const s = L.sun || {};
      sun = new THREE.DirectionalLight(s.color || (night ? '#9DB4FF' : golden ? '#FFC98A' : '#FFEFD6'), s.k ?? (night ? 0.5 : golden ? 2.6 : 3.0));
      sun.position.set(...(s.from || [2, 6, -8])); sun.target.position.set(...(s.to || [0, 0, 0])); scene.add(sun, sun.target);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
      const ext = s.ext || 8; Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 40 }); sun.shadow.camera.updateProjectionMatrix();
    }
    // (each window's daylight: two at most, the largest)
    const rects = (K.rects || []).filter((r) => r.k > 0).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, L.rects ?? 2);
    if (rects.length) {
      try { if (!ltc) { THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init()); ltc = true; } } catch (e) { console.warn('[storyrun] set area lights', e); }
      for (const r of rects) {
        const rl = new THREE.RectAreaLight(L.window || (night ? '#7F95D0' : golden ? '#FFD9A8' : '#E4EEFF'), (night ? 0.6 : golden ? 3.4 : 4.2) * (L.windowK ?? 1) * r.k, r.w, r.h);
        rl.position.set(...r.at); rl.lookAt(...r.to); scene.add(rl);
      }
    }
    for (const p of L.points || []) {
      const pl = new THREE.PointLight(p.color || '#FFE2B8', p.k ?? 6, p.dist ?? 0, 2); pl.position.set(...p.at);
      if (p.shadow) { pl.castShadow = true; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.002; }
      scene.add(pl);
    }
    for (const p of L.spots || []) {
      const sl = new THREE.SpotLight(p.color || '#FFE2B8', p.k ?? 20, p.dist ?? 0, p.angle ?? 0.7, p.pen ?? 0.6, 2); sl.position.set(...p.at); sl.target.position.set(...(p.to || [0, 0, 0]));
      if (p.shadow) { sl.castShadow = true; sl.shadow.mapSize.set(1024, 1024); sl.shadow.bias = -0.001; sl.shadow.radius = 4; }
      scene.add(sl, sl.target);
    }
    // the people's key (soft shadows on the face and the body), fill and rim: placed every frame with the lens (update)
    const key = new THREE.SpotLight(night ? '#FFD2A0' : golden ? '#FFE0B8' : '#FFF2E2', 0, 4.5, 0.42, 0.95, 2);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.015; key.shadow.radius = 6; key.shadow.camera.near = 0.2; key.shadow.camera.far = 7;
    const fill = new THREE.PointLight(night ? '#8EA2D8' : '#FFE9D2', 0, 5, 2);
    const rim = new THREE.SpotLight(night ? '#A9C0FF' : golden ? '#FFC98A' : '#F2F6FF', 0, 7, 0.6, 0.9, 2);
    scene.add(key, key.target, fill, rim, rim.target);
    // (the side the daylight comes from, in the room: the key's side)
    const sunDir = sun ? sun.position.clone().sub(sun.target.position).setY(0).normalize() : V(0, 0, -1);
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 600);
    const S = { id, def, scene, K, room, mood, people: new Map(), key, fill, rim, sunDir, cam, t0: 0, shown: false, update: () => update(S) };
    return S;
  }

  /* ----------------------------------------------------- people in a set -- */
  const _v = V(), _w = V(), _q = new THREE.Quaternion();
  function heading(S, P) {
    const f = P.face;
    if (typeof f === 'number') return (f * PI) / 180;
    if (typeof f === 'string') { const o = S.people.get(castName(f) || f) || (f === 'player' || castName(f) === heroName ? S.people.get(heroName) : null); if (o) return Math.atan2(o.x - P.x, o.z - P.z); }
    return P.h ?? 0;
  }
  function place(S, P) {
    const f = P.fig; if (!f) return;
    f.root.position.set(P.x, P.y || 0, P.z); f.heading = P.h = heading(S, P); f.root.rotation.set(0, P.h, 0); f.root.visible = !P.hidden;
    if (P.blob) { P.blob.position.set(P.x, 0.012, P.z); P.blob.visible = !P.hidden; }
    // (where their eyes go: the lens (a look straight down it), the thing in their hand, or someone in the set)
    if (f.face) {
      const O = typeof P.look === 'string' && P.look !== 'lens' && P.look !== 'prop' ? S.people.get(P.look === 'player' ? heroName : castName(P.look) || P.look) : null;
      f.face.look = P.look === 'lens' ? S.cam : P.look === 'prop' ? (P.prop || null) : O ? () => O.fig.face?.eyes?.(V()) || O.fig.head(V()) : null;
    }
  }
  // a clip crossfaded in (fade s), the first one from a random point of its loop (people standing together are not in
  // step); a body with no clips by name (Mog City's own built ones) plays it outright
  function blend(P, name, fade = 0.4) {
    const f = P.fig, cl = f.clip?.(name);
    if (!cl || !f.mixer) { P.action = null; return f.play ? f.play(name) : false; }
    const a = f.mixer.clipAction(cl);
    if (P.action === a && a.isRunning()) return true;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.enabled = true; a.setEffectiveTimeScale(1); a.setEffectiveWeight(1);
    if (!P.action || fade <= 0) { f.mixer.stopAllAction(); a.play(); if (!P.started) { a.time = Math.random() * cl.duration; P.started = true; } }
    else { a.play(); P.action.crossFadeTo(a, fade, false); }
    P.action = a; P.clipName = name; return true;
  }
  // (on the phone, reading it: the hand with it up in front of the chest, the screen to the eyes, the other arm easy at
  // the side as idle has it. Dan's 'phone' clip is a call held to the ear with the free hand talking, which in a set's
  // close shot read as a hand thrown up and the other one waving)
  function phoneOf(P) {
    if (P.pose === 'phone') { if (!P.hand) { P.hand = { side: 'R', at: [0.04, 1.44, 0.27], k: 1 }; P.autoHand = true; } if (!P.look || P.autoLook) { P.look = 'prop'; P.autoLook = true; } }
    else if (P.autoHand) { P.hand = null; P.autoHand = false; if (P.autoLook) { P.look = null; P.autoLook = false; } }
  }
  // the clip a pose plays: kneel and crouch are idle's upper body over legs bent here (arms()); a talking pose is the
  // person's idle while someone else talks and their talk while they do (talkPoses); sitting puts the hips on the seat
  const clipOf = (P) => (P.kneel || P.pose === 'phone' ? 'idle' : !P.pose || P.pose === 'idle' || P.pose === 'talk' ? (P.talking ? 'talk' : P.idle || 'idle') : SIT.has(P.pose) ? (P.talking ? 'sitTalk' : 'sit') : P.pose);
  function pose(S, P, fade = 0) {
    const f = P.fig; if (!f) return;
    // (down on one knee, or crouched: idle's upper body over legs bent here, arms())
    P.kneel = P.pose === 'kneel' || P.pose === 'crouch' ? P.pose : null;
    phoneOf(P);
    let ok = blend(P, clipOf(P), fade);
    if (!ok) ok = blend(P, 'idle', fade);
    // (sitting: his hips on the seat's mark, y the seat's height)
    if (SIT.has(P.pose) && P.seat != null && f.mixer) {
      f.root.position.set(P.x, 0, P.z); f.mixer.update(0.016); f.root.updateMatrixWorld(true);
      const hip = f.bones?.root || f.bones?.pelvis;
      if (hip) { hip.getWorldPosition(_v); P.y = P.seat - (_v.y - 0) + (P.y0 || 0); f.root.position.y = P.y; }
    }
  }
  // (each frame: whoever's line is up talks, with their hands, the others listen in their idle; a pose of their own
  // (arms folded, a wave, sitting forward) is kept. Not while walking, held on a name card, or in a hug)
  function talkPoses(S) {
    const sub = subLine(), who = sub ? String(sub.who || '').toLowerCase() : '';
    for (const P of S.people.values()) {
      if (P.walk?.going || P.fig.hold || P.hug || !P.fig.clip) continue;
      const talking = !!who && P.name.toLowerCase() === who;
      if (talking === !!P.talking) continue;
      P.talking = talking;
      const name = clipOf(P);
      // (a body without a talk of its own (a Suit's pack has none) keeps its idle)
      if (name !== P.clipName && P.fig.clip(name)) blend(P, name, 0.5);
    }
  }
  async function stand(S, p) {
    const raw = p.who === 'player' ? heroName : castName(p.who) || p.who, isHero = raw === heroName;
    let fig = null;
    try { fig = isHero ? (hero || (hero = await cast.double(heroName))) : await cast.spawn(raw, null); } catch (e) { console.warn('[storyrun] set: cast', raw, e); }
    if (!fig) { console.warn('[storyrun] set: no body for', raw); return; }
    if (!moved.has(fig)) moved.set(fig, { parent: fig.root.parent, pos: fig.root.position.clone(), rot: fig.root.rotation.y, h: fig.heading, vis: fig.root.visible });
    S.scene.add(fig.root);
    const P = { name: raw, fig, x: p.at?.[0] ?? 0, z: p.at?.[1] ?? 0, y: p.y || 0, y0: p.y || 0, face: p.face, pose: p.pose, seat: p.seat, walk: p.walk || null, hug: p.hug || null, hold: p.hold || null, hand: p.hand || null, look: p.look || (p.pose === 'phone' ? 'prop' : null), autoLook: !p.look && p.pose === 'phone', k: p.k, idle: p.idle || idleOf(raw) || null };
    if (p.prop) P.prop = propOf(S, p.prop);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(isHero || !/milo/i.test(raw) ? 0.9 : 0.6, isHero || !/milo/i.test(raw) ? 0.9 : 0.6), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    blob.rotation.x = -PI / 2; blob.renderOrder = 1; S.scene.add(blob); P.blob = blob;
    P.isHero = isHero; S.people.set(raw, P);
    // (their arms after their clip, every frame: a hug, a hand held)
    fig.post = () => { if (active === S) arms(S, P); };
  }
  function act(S, list) {
    for (const a of list || []) {
      const P = S.people.get(a.who === 'player' ? heroName : castName(a.who) || a.who); if (!P) continue;
      if (a.at) { P.x = a.at[0]; P.z = a.at[1]; }
      if (a.y != null) P.y = P.y0 = a.y;
      if ('face' in a) P.face = a.face;
      if ('hug' in a) P.hug = a.hug; if ('hold' in a) P.hold = a.hold; if ('hand' in a) P.hand = a.hand;
      if ('prop' in a) { if (P.prop) { P.prop.removeFromParent(); P.prop = null; } if (a.prop) P.prop = propOf(S, a.prop); }
      if ('hidden' in a) P.hidden = !!a.hidden; if ('look' in a) { P.look = a.look; P.autoLook = false; }
      if (a.pose === 'phone' && !('look' in a)) { P.look = 'prop'; P.autoLook = true; }
      if ('hug' in a && a.hug) P.hugT0 = null;
      if (a.walk) { P.walk = { ...a.walk }; P.walk.t0 = null; }
      place(S, P);
      if ('pose' in a || 'seat' in a) { P.pose = a.pose ?? P.pose; P.seat = a.seat ?? P.seat; pose(S, P); }
    }
    // (everyone's heading again: who faces whom may have moved)
    for (const P of S.people.values()) if (typeof P.face === 'string') { P.h = heading(S, P); P.fig.root.rotation.y = P.h; P.fig.heading = P.h; }
  }
  // a hug: both hands to the other's back, round them (their upper back, a hand either side of the spine), the elbows
  // out and down; a held hand: one hand to the other's (theirs to a point by them at hand height)
  const _a = V(), _b = V(), _f = V(), _r = V();
  // down on one knee (the left foot planted ahead, the right knee on the ground) or crouched (both feet planted): the
  // hips lowered, each leg's foot put where it goes and its knee bent toward its pole (the arms' two-bone reach)
  const LEG = ['upperleg01_', 'lowerleg01_', 'foot_'];
  function kneel(P) {
    const B = P.fig.bones, o = P.fig.root, h = P.h || 0, crouch = P.kneel === 'crouch';
    o.position.y = (P.y || 0) - (crouch ? 0.4 : 0.44); o.updateMatrixWorld(true);
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h), X = o.position.x, Z = o.position.z, Y = P.y || 0;
    const pt = (l, f, y) => V(X + lx * l + fx * f, Y + y, Z + lz * l + fz * f);
    // (crouched beside someone: down on the other knee, the right foot ahead, so two people down together are not one
    // pose twice; the old both-feet crouch read as a squat with the knees up at the chest)
    const m = crouch ? -1 : 1, A = crouch ? 'R' : 'L', K = crouch ? 'L' : 'R';
    if (crouch) o.position.y = (P.y || 0) - 0.44, o.updateMatrixWorld(true);
    try { armTo(B, A, pt(m * 0.13, 0.36, 0.09), pt(m * 0.15, 1.2, 0.7), 1, LEG); } catch {}
    try { armTo(B, K, pt(-m * 0.13, -0.4, 0.07), pt(-m * 0.13, 0.9, -0.3), 1, LEG); } catch {}
  }
  function arms(S, P) {
    const B = P.fig.bones; if (!B) return;
    if (P.kneel) kneel(P);
    // (a hug once they are there, not while walking into it; the arms come round over half a second). Round the other's
    // upper back, a hand either side of the spine; or, reaching up to someone whose neck is at their shoulders (a child to
    // a father down on one knee), round the neck, the hands crossed behind it, the elbows out over the shoulders
    if (P.hug && !P.walk) {
      const O = S.people.get(castName(P.hug) || P.hug) || (P.hug === 'player' ? S.people.get(heroName) : null); if (!O) return;
      const ob = O.fig.bones, sp = ob?.spine03 || ob?.spine02 || ob?.neck01; if (!sp) return;
      if (P.hugT0 == null) {
        P.hugT0 = S.clock || 0;
        // (in a hug the eyes go past the other's shoulder, not into their face: the head stays easy, cheek by cheek)
        if (P.fig.face) { const f = P.fig, far = V(); f.face.look = () => { f.head(far); return far.set(far.x + Math.sin(f.heading) * 3, far.y - 0.1, far.z + Math.cos(f.heading) * 3); }; }
      }
      // (into their arms: someone standing who hugs someone down on a knee is brought in chest to chest, whatever their
      // marks left between them: their upper backs 0.2 m apart on the line between them; once, as the hug begins)
      if (!P.snapped && !P.kneel && O.kneel) {
        P.snapped = true; const mb = B.spine03 || B.spine02;
        if (mb) { mb.getWorldPosition(_b); sp.getWorldPosition(_a); const dx = _a.x - _b.x, dz = _a.z - _b.z, n = Math.hypot(dx, dz) || 1, mv = n - (P.hugGap ?? 0.2);
          // (and a little to one side, so the heads go cheek by cheek over a shoulder: P.hugSide, + their right)
          const sd = P.hugSide ?? 0.5, lx = -dz / n, lz = dx / n;
          if (mv > 0) { P.x += (dx / n) * mv - lx * 0.12 * sd; P.z += (dz / n) * mv - lz * 0.12 * sd; P.fig.root.position.x = P.x; P.fig.root.position.z = P.z; if (P.blob) P.blob.position.set(P.x, 0.012, P.z); P.h = Math.atan2(dx, dz); P.fig.root.rotation.y = P.h; P.fig.heading = P.h; P.fig.root.updateMatrixWorld(true); } }
      }
      const u = Math.min(1, Math.max(0, ((S.clock || 0) - P.hugT0) / 0.55)), ease = u * u * (3 - 2 * u);
      // (round their upper back: the hands on it, either side of the spine, as far out and back as their own torso is wide,
      // so the arms go round them, not into them; a child to a father on one knee the same, under his shoulders: the
      // neck-hug before put a forearm through his face from the side the child's head was on)
      const nk = ob.neck01 || ob.neck02, neck = !!nk && P.hugAt === 'neck';
      // (someone standing who hugs someone down on one knee: round the shoulders, the forearms over them and the hands on
      // the upper back either side of the neck's base, wider than the head, so from behind him they are seen holding on)
      const over = !!nk && !neck && !!O.kneel && !P.kneel;
      let hw = 0.17; if (ob.upperarm01_L && ob.upperarm01_R) { ob.upperarm01_L.getWorldPosition(_a); ob.upperarm01_R.getWorldPosition(_b); hw = Math.min(0.24, Math.max(0.1, _a.distanceTo(_b) / 2)); }
      sp.getWorldPosition(_a); const small = _a.y - O.fig.root.position.y < 1.15 && !O.kneel; (neck || over ? nk : sp).getWorldPosition(_a); if (over) _a.y -= 0.07;
      // (round them from where we stand: our side of them, then behind)
      const dx = _a.x - P.fig.root.position.x, dz = _a.z - P.fig.root.position.z, n = Math.hypot(dx, dz) || 1;
      _f.set(dx / n, 0, dz / n); _r.set(_f.z, 0, -_f.x);
      const k = (P.hugK ?? 0.95) * ease, lift = P.hugUp ?? (neck ? 0.03 : 0.0);
      // (a grown man's spine bone sits in the middle of his chest, a child's near his back: the hands go to the back's
      // surface either way)
      const back = neck ? 0.1 : over ? 0.09 : small ? hw * 0.12 : hw * 0.62, lat = neck ? 0.03 : over ? Math.max(0.12, hw * 0.65) : hw * 0.6;
      for (const [side, s] of [['L', 1], ['R', -1]]) {
        const t = _b.copy(_a).addScaledVector(_f, back).addScaledVector(_r, s * lat); t.y += lift + (side === 'L' ? 0.035 : -0.045);
        // (the elbows out wide round their sides, a little below the hands)
        const pole = V().copy(_a).addScaledVector(_f, -0.15).addScaledVector(_r, s * (hw + 0.55)); pole.y = t.y + (neck || over ? 0.15 : -0.25);
        try { armTo(B, side, t.clone(), pole, k, MH_ARM); } catch {}
      }
    }
    // (a hand to a point of their own: [right, up, fwd] from their feet, the elbow down and out; a phone held to look at)
    if (P.hand && !(P.hug && !P.walk)) {
      const side = P.hand.side || 'R', [hr, hu, hf] = P.hand.at || [0.12, 1.12, 0.32], h = P.h || 0, sx = side === 'R' ? -1 : 1;
      const o = P.fig.root.position, t = V(o.x + Math.sin(h) * hf + Math.cos(h) * hr * -1, o.y + hu, o.z + Math.cos(h) * hf - Math.sin(h) * hr * -1);
      const pole = V(o.x + Math.cos(h) * 0.6 * sx * -1 * -1, o.y + 0.6, o.z - Math.sin(h) * 0.6 * sx);
      try { armTo(B, side, t, pole, P.hand.k ?? 1, MH_ARM); } catch {}
    }
    rest(S, P);
    if (P.prop) holdProp(P);
    if (P.hold) {
      const O = S.people.get(castName(P.hold.who) || P.hold.who); if (!O) return;
      const side = P.hold.side || 'R', ob = O.fig.bones, h = ob?.[`wrist_${P.hold.their || (side === 'R' ? 'L' : 'R')}`];
      if (!h) return;
      h.getWorldPosition(_a); const pole = V().copy(_a).add(V(0, -0.3, 0)); pole.addScaledVector(_r.set(Math.cos(P.h), 0, -Math.sin(P.h)), side === 'R' ? -0.5 : 0.5);
      try { armTo(B, side, _a.clone(), pole, P.hold.k ?? 0.9, MH_ARM); } catch {}
    }
  }
  // (waiting their turn: someone standing in their plain idle, not talking, with nothing in their hands, does not stand
  // to attention with the arms hanging dead straight (Pell, owner: "stiff arms"): the hands come together in front, one
  // over the other's wrist, low, the elbows easy and a little out, drifting with the breath; it eases out as they start
  // to talk (their talk clip's hands) and back in after. The hero's double is left to his clip (the arms check)
  const _c = V(), _d = V();
  function rest(S, P) {
    const B = P.fig.bones, t = S.clock || 0, dt = Math.min(0.1, Math.max(0, t - (P.restT ?? t))); P.restT = t;
    const want = !P.isHero && !P.talking && !P.walk && !P.hug && !P.hand && !P.hold && !P.prop && !P.kneel && (!P.pose || P.pose === 'idle') && (!P.idle || P.idle === 'idle') && !!P.fig.clip && !!B?.wrist_L && !!B?.upperarm01_L && !P.fig.native && !P.fig.clip('suitIdle');
    P.restW = (P.restW || 0) + ((want ? 1 : 0) - (P.restW || 0)) * Math.min(1, dt * 2.5);
    if (P.restW < 0.01) return;
    const h = P.fig.heading ?? P.h ?? 0, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    // (where the clip has the hands now: the clasp a little above that, in front of the body's middle)
    B.wrist_L.getWorldPosition(_c); B.wrist_R.getWorldPosition(_d);
    const o = P.fig.root.position, y = (_c.y + _d.y) / 2 + 0.05 + 0.006 * Math.sin(t * 1.7 + (P.name.length || 0));
    B.upperarm01_L.getWorldPosition(_a); B.upperarm01_R.getWorldPosition(_b); const sw = _a.distanceTo(_b) / 2;
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      // (low and close to the body, the elbows back by the sides: reached further out, the upper arms swung forward
      // and the shoulders read rounded)
      const fw = 0.1 + sw * 0.12;
      const tg = V(o.x + fx * fw + lx * s * 0.045, y + (side === 'L' ? 0.012 : -0.012), o.z + fz * fw + lz * s * 0.045);
      const pole = V(o.x + lx * s * (sw + 0.3) - fx * 0.45, y + 0.15, o.z + lz * s * (sw + 0.3) - fz * 0.45);
      try { armTo(B, side, tg, pole, P.restW * 0.8, MH_ARM); } catch {}
    }
  }
  // a thing in a hand (made here, small): a phone lit with a call, Milo's dinosaur walkie-talkie
  function propOf(S, kind) {
    const g = new THREE.Group(), std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.4, ...o });
    if (kind === 'phone') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.008, 0.15), std({ color: '#111214', metalness: 0.5 })));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.138), new THREE.MeshBasicMaterial({ color: '#BFE3FF' })); scr.rotation.x = -PI / 2; scr.position.y = 0.0045; g.add(scr);
      g.userData.len = 0.075;
    } else if (kind === 'walkie') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.12), std({ color: '#43A047', roughness: 0.6 })); g.add(body);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8), std({ color: '#2B2B2B' })); ant.rotation.x = PI / 2; ant.position.set(0.018, 0, 0.09); g.add(ant);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: '#FF4040' })); led.position.set(-0.015, 0.019, 0.04); g.add(led);
      g.userData.len = 0.06;
    } else return null;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); S.scene.add(g); return g;
  }
  // (the prop in the right hand: along the fingers, its face turned up to the eyes)
  function holdProp(P) {
    const B = P.fig.bones, w = B?.wrist_R, f = B?.['finger3-1_R'], hd = B?.head; if (!w || !f || !hd) return;
    w.getWorldPosition(_a); f.getWorldPosition(_b); hd.getWorldPosition(_f);
    const ax = V().subVectors(_b, _a).normalize(), at = V().copy(_a).addScaledVector(ax, P.prop.userData.len || 0.07);
    const up = V().subVectors(_f, at); up.addScaledVector(ax, -up.dot(ax)).normalize();
    const side = V().crossVectors(up, ax).normalize();
    P.prop.matrix.makeBasis(side, up, ax); P.prop.quaternion.setFromRotationMatrix(P.prop.matrix); P.prop.position.copy(at);
  }
  function update(S) {
    // (the set's own clock: it stops while a name card holds someone's frame, and the whole frame holds with them)
    const t1 = now(), dt = Math.min(0.1, t1 - (S.last || t1)); S.last = t1;
    const held = [...S.people.values()].some((P) => P.fig.hold && !P.heldBySet);
    for (const P of S.people.values()) { if (held && !P.fig.hold) { P.fig.hold = true; P.heldBySet = true; } else if (!held && P.heldBySet) { P.fig.hold = false; P.heldBySet = false; } }
    if (!held) S.clock = (S.clock || 0) + dt;
    const t = S.clock || 0;
    for (const P of S.people.values()) {
      const w = P.walk; if (!w || !w.to) continue;
      if (w.t0 == null) { w.t0 = t + (w.after || 0); w.from = [P.x, P.z]; w.going = false; }
      const k = Math.min(1, Math.max(0, (t - w.t0) / (w.secs || 3)));
      if (k > 0 && !w.going && k < 1) { w.going = true; blend(P, w.clip || 'walk', 0.25); }
      const x = w.from[0] + (w.to[0] - w.from[0]) * k, z = w.from[1] + (w.to[1] - w.from[1]) * k;
      P.fig.root.position.x = x; P.fig.root.position.z = z; if (P.blob) { P.blob.position.x = x; P.blob.position.z = z; }
      if (w.going) { const h = Math.atan2(w.to[0] - w.from[0], w.to[1] - w.from[1]); P.fig.root.rotation.y = h; P.fig.heading = h; }
      if (k >= 1 && w.going) { w.going = false; P.x = w.to[0]; P.z = w.to[1]; P.walk = null; P.hugT0 = t; if (w.then) { P.pose = w.then; } pose(S, P, 0.35); for (const Q of S.people.values()) if (typeof Q.face === 'string' && !Q.walk) { Q.h = heading(S, Q); Q.fig.root.rotation.y = Q.h; Q.fig.heading = Q.h; } }
    }
    // (who is talking: their talk, the others' idle, crossfaded)
    talkPoses(S);
    // (the people's key, fill and rim with the lens: round the point it looks at, the key 40 degrees off the lens's
    // axis on the daylight's side and above the eyes, the fill low on the other side, the rim behind them, high, on
    // the far side; strong on a close shot, gentle on a wide one, where the room's own light does the work)
    if (frameCam) {
      const p = frameCam.pos, l = frameCam.look, dx = p[0] - l[0], dz = p[2] - l[2], dy = p[1] - l[1], n = Math.hypot(dx, dy, dz) || 1, h = Math.hypot(dx, dz) || 1;
      const fx = dx / h, fz = dz / h, rx = fz, rz = -fx;
      // (the key's side: the side of the lens the daylight comes from; a set may fix it)
      const side = S.room.keySide ?? (rx * S.sunDir.x + rz * S.sunDir.z >= 0 ? 1 : -1);
      const close = Math.max(0, Math.min(1, (7 - n) / 4)), night = S.mood === 'night', base = S.room.key ?? (night ? 2.4 : 1.6);
      const kc = Math.cos(0.75), ks = Math.sin(0.75), kd = 1.9;
      S.key.position.set(l[0] + (fx * kc + rx * side * ks) * kd, l[1] + 0.55, l[2] + (fz * kc + rz * side * ks) * kd);
      S.key.target.position.set(l[0], l[1] - 0.15, l[2]); S.key.target.updateMatrixWorld();
      S.key.intensity = (2.2 + 4.2 * close) * base;
      S.fill.position.set(l[0] + (fx * 0.6 - rx * side * 0.8) * 2.0, l[1] - 0.1, l[2] + (fz * 0.6 - rz * side * 0.8) * 2.0);
      S.fill.intensity = (0.5 + 1.0 * close) * base * (S.room.fill ?? 1);
      S.rim.position.set(l[0] - fx * 1.7 - rx * side * 0.9, l[1] + 0.9, l[2] - fz * 1.7 - rz * side * 0.9);
      S.rim.target.position.set(l[0], l[1] - 0.2, l[2]); S.rim.target.updateMatrixWorld();
      S.rim.intensity = (3 + 6 * close) * base * (S.room.rim ?? 1);
    }
  }

  /* ------------------------------------------------------------- the API -- */
  const api = {
    get active() { return active; },
    // (for a look at it: the drawn set's people)
    get people() { return active ? active.people : null; },
    has: (id) => sets.has(id),
    async prepare(defs) {
      for (const [id, def] of Object.entries(defs || {})) {
        if (!def || sets.has(id)) continue;
        const S = build(id, def); if (!S) continue;
        sets.set(id, S);
        // (its scans in before anything is compiled: a prop does not pop in on the first frame)
        try { await Promise.race([S.K.ready(), new Promise((r) => setTimeout(r, 12000))]); } catch {}
        try { S.baked = S.K.bake(); } catch (e) { console.warn('[storyrun] set bake', e); }
        for (const p of def.people || []) await stand(S, p);
        for (const P of S.people.values()) place(S, P);
        for (const P of S.people.values()) { place(S, P); pose(S, P); }
      }
      // (the pipelines built now, not on the set's first frame: each set's materials under its own lights)
      for (const S of sets.values()) { S.cam.position.set(0, 1.6, 3); S.cam.lookAt(0, 1.2, 0); try { await renderer.compileAsync(S.scene, S.cam); } catch (e) { console.warn('[storyrun] set compile', e); } }
    },
    use(id) {
      const S = id ? sets.get(id) : null;
      if (S && !S.shown) { S.shown = true; S.clock = 0; S.last = now(); for (const P of S.people.values()) if (P.walk) P.walk.t0 = null; }
      if (S && active !== S) S.last = now();
      // (a person in two sets stands in the one being drawn)
      if (S && active !== S) for (const P of S.people.values()) if (P.fig.root.parent !== S.scene) { S.scene.add(P.fig.root); place(S, P); pose(S, P); }
      active = S; if (!S) frameCam = null;
      for (const P of S ? S.people.values() : []) if (P.fig) P.fig.root.visible = !P.hidden;
    },
    act(list) { if (active) act(active, list); },
    // who stands in the drawn set by that name (the hero's double for the hero)
    figure(name) { const P = active?.people.get(name === 'player' ? heroName : castName(name) || name); return P ? P.fig : null; },
    frame(c) { frameCam = c; },
    // a camera point in the set: 'player' (the hero's double's head) or { rel: <who>, right, up, fwd } (runner.js camPt's)
    point(ref, fallbackUp = 1.5) {
      const S = active; if (!S) return null;
      const who = !ref || ref === 'player' || ref.rel === 'player' ? heroName : (typeof ref === 'object' ? castName(ref.rel) || ref.rel : null);
      if (typeof ref === 'string' && ref !== 'player') { const m = S.room.marks?.[ref.replace(/^@/, '')]; return m ? [m[0], m[1] ?? fallbackUp, m[2]] : [0, fallbackUp, 0]; }
      const P = who && S.people.get(who), f = P?.fig;
      const base = f ? f.head(_w) : _w.set(0, fallbackUp, 0), h = f ? f.heading : 0;
      if (!ref || typeof ref !== 'object') return [base.x, base.y, base.z];
      const fw = ref.fwd || 0, r = ref.right || 0;
      return [base.x + Math.sin(h) * fw - Math.cos(h) * r, base.y + (ref.up || 0), base.z + Math.cos(h) * fw + Math.sin(h) * r];
    },
    async release() {
      active = null; frameCam = null;
      for (const [fig, m] of moved) { fig.post = null; fig.hold = false; if (fig.face) fig.face.look = null; m.parent ? m.parent.add(fig.root) : app.scene.add(fig.root); fig.root.position.copy(m.pos); fig.root.rotation.set(0, m.rot, 0); fig.heading = m.h; fig.root.visible = m.vis; try { fig.play?.('idle'); } catch {} }
      if (hero) { hero.root.visible = false; }
      moved.clear();
      // (the set's own geometry, materials and drawn textures let go; the library's scans and the shared city layers
      // are kept for the next set)
      const mats = new Set();
      for (const S of sets.values()) S.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.parent && !o.userData.keep) { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) mats.add(m); } });
      for (const m of mats) { for (const k of Object.keys(m)) { const t = m[k]; if (t?.isTexture && !t.userData?.keep) t.dispose(); } m.dispose?.(); }
      sets.clear();
    },
  };
  return api;
}
