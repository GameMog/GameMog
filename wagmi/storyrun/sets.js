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

const PI = Math.PI;
const MH_ARM = ['upperarm01_', 'lowerarm01_', 'wrist_'];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const now = () => performance.now() / 1000;
// a pose's clip (Dan's names; the cast's bodies carry Dan's clips: cast.js); kneel and crouch are made here (arms():
// idle's upper body over legs bent by the two-bone reach); the sitting ones put the hips on the seat's mark
const SIT = new Set(['sit', 'sitTalk']);

export function createSets(W, { cast, castName, heroName }) {
  const app = W.app, renderer = app.renderer;
  const sets = new Map(); // id -> { scene, K, room, people: Map(name -> P), lights, cam, shown }
  const moved = new Map(); // figure -> { parent, pos, rot, vis, hold }
  let active = null, hero = null, frameCam = null, warmFrames = 0;

  /* ------------------------------------------------------------ the draw -- */
  // (in front of the city's frame, as Mr. Big's study: the set's frame replaces it while a shot is in a set)
  const rp = app.renderPipeline, render0 = rp.render.bind(rp);
  rp.render = function (...a) {
    try {
      if (active && frameCam) {
        const S = active, c = frameCam;
        S.cam.position.set(c.pos[0], c.pos[1], c.pos[2]); S.cam.up.set(0, 1, 0); S.cam.lookAt(c.look[0], c.look[1], c.look[2]); if (c.roll) S.cam.rotateZ(c.roll);
        const asp = app.cameraSystem.camera.aspect || 16 / 9;
        if (S.cam.fov !== c.fov || S.cam.aspect !== asp) { S.cam.fov = c.fov; S.cam.aspect = asp; S.cam.updateProjectionMatrix(); }
        S.update();
        renderer.setRenderTarget(null); renderer.render(S.scene, S.cam);
        return;
      }
    } catch (e) { console.warn('[storyrun] set draw', e); active = null; }
    return render0(...a);
  };

  function moodOf(def) {
    if (def.light) return def.light;
    const id = app.lightingSystem?.activePresetId || 'midday';
    return /midnight|night|twilight|blackout/.test(id) ? 'night' : /golden|sunset|dusk/.test(id) ? 'golden' : 'day';
  }

  /* ---------------------------------------------------------- a set built -- */
  function build(id, def) {
    const builder = ROOMS[def.room];
    if (!builder) { console.warn('[storyrun] no set room', def.room); return null; }
    const mood = moodOf(def), night = mood === 'night', golden = mood === 'golden';
    const scene = new THREE.Scene(); scene.name = 'storyrun-set-' + id;
    const K = kit(scene, { night, golden });
    const room = builder(K, def) || {};
    scene.background = new THREE.Color(room.sky || (night ? '#070A14' : golden ? '#E9C9A0' : '#BFD6EE'));
    scene.environment = app.scene.environment || null; scene.environmentIntensity = night ? 0.18 : (room.env ?? 0.4);
    // the light: the sky's fill and the ground's bounce, the sun (or the moon, the street) through the windows with its
    // shadows (the blinds' stripes, the people's own), the room's practicals, and the face's key, placed as the city's
    // cutscene key is (runner.js keyLight): off the lens's axis, from its side
    const L = room.light || {};
    const hemi = new THREE.HemisphereLight(L.sky || (night ? '#3A4A78' : golden ? '#FFE2BC' : '#DCE8FF'), L.ground || (night ? '#1A1410' : '#8C7A64'), L.hemi ?? (night ? 0.5 : golden ? 0.8 : 0.85));
    scene.add(hemi);
    if (L.ambient) scene.add(new THREE.AmbientLight(L.ambientColor || '#FFFFFF', L.ambient));
    let sun = null;
    if (L.sun !== false) {
      const s = L.sun || {};
      sun = new THREE.DirectionalLight(s.color || (night ? '#9DB4FF' : golden ? '#FFC98A' : '#FFF1DC'), s.k ?? (night ? 0.5 : golden ? 2.6 : 3.0));
      sun.position.set(...(s.from || [2, 6, -8])); sun.target.position.set(...(s.to || [0, 0, 0])); scene.add(sun, sun.target);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
      const ext = s.ext || 8; Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 40 }); sun.shadow.camera.updateProjectionMatrix();
    }
    for (const p of L.points || []) {
      const pl = new THREE.PointLight(p.color || '#FFE2B8', p.k ?? 6, p.dist ?? 0, 2); pl.position.set(...p.at);
      if (p.shadow) { pl.castShadow = true; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.002; }
      scene.add(pl);
    }
    for (const p of L.spots || []) {
      const sl = new THREE.SpotLight(p.color || '#FFE2B8', p.k ?? 20, p.dist ?? 0, p.angle ?? 0.7, p.pen ?? 0.6, 2); sl.position.set(...p.at); sl.target.position.set(...(p.to || [0, 0, 0]));
      if (p.shadow) { sl.castShadow = true; sl.shadow.mapSize.set(1024, 1024); sl.shadow.bias = -0.001; }
      scene.add(sl, sl.target);
    }
    const key = new THREE.PointLight(night ? '#FFD9AE' : '#FFF0DE', 0, 4.5, 2); scene.add(key);
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
    const S = { id, def, scene, K, room, mood, people: new Map(), key, cam, t0: 0, shown: false, update: () => update(S) };
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
  function pose(S, P) {
    const f = P.fig; if (!f) return;
    // (down on one knee, or crouched: idle's upper body over legs bent here, arms())
    P.kneel = P.pose === 'kneel' || P.pose === 'crouch' ? P.pose : null;
    const name = P.kneel ? 'idle' : P.pose || 'idle';
    let ok = f.play ? f.play(name) : false;
    if (!ok && f.play) ok = f.play('idle');
    // (sitting: his hips on the seat's mark, y the seat's height)
    if (SIT.has(P.pose) && P.seat != null && f.mixer) {
      f.root.position.set(P.x, 0, P.z); f.mixer.update(0.016); f.root.updateMatrixWorld(true);
      const hip = f.bones?.root || f.bones?.pelvis;
      if (hip) { hip.getWorldPosition(_v); P.y = P.seat - (_v.y - 0) + (P.y0 || 0); f.root.position.y = P.y; }
    }
  }
  async function stand(S, p) {
    const raw = p.who === 'player' ? heroName : castName(p.who) || p.who, isHero = raw === heroName;
    let fig = null;
    try { fig = isHero ? (hero || (hero = await cast.double(heroName))) : await cast.spawn(raw, null); } catch (e) { console.warn('[storyrun] set: cast', raw, e); }
    if (!fig) { console.warn('[storyrun] set: no body for', raw); return; }
    if (!moved.has(fig)) moved.set(fig, { parent: fig.root.parent, pos: fig.root.position.clone(), rot: fig.root.rotation.y, h: fig.heading, vis: fig.root.visible });
    S.scene.add(fig.root);
    const P = { name: raw, fig, x: p.at?.[0] ?? 0, z: p.at?.[1] ?? 0, y: p.y || 0, y0: p.y || 0, face: p.face, pose: p.pose, seat: p.seat, walk: p.walk || null, hug: p.hug || null, hold: p.hold || null, hand: p.hand || null, look: p.look || null, k: p.k };
    if (p.prop) P.prop = propOf(S, p.prop);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(isHero || !/milo/i.test(raw) ? 0.9 : 0.6, isHero || !/milo/i.test(raw) ? 0.9 : 0.6), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    blob.rotation.x = -PI / 2; blob.renderOrder = 1; S.scene.add(blob); P.blob = blob;
    S.people.set(raw, P);
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
      if ('hidden' in a) P.hidden = !!a.hidden; if ('look' in a) P.look = a.look;
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
    if (crouch) { for (const [side, sl] of [['L', 1], ['R', -1]]) try { armTo(B, side, pt(sl * 0.16, 0.2, 0.09), pt(sl * 0.25, 1.2, 0.7), 1, LEG); } catch {} return; }
    try { armTo(B, 'L', pt(0.13, 0.36, 0.09), pt(0.15, 1.2, 0.7), 1, LEG); } catch {}
    try { armTo(B, 'R', pt(-0.13, -0.4, 0.07), pt(-0.13, 0.9, -0.3), 1, LEG); } catch {}
  }
  function arms(S, P) {
    const B = P.fig.bones; if (!B) return;
    if (P.kneel) kneel(P);
    // (a hug once they are there: not while walking into it)
    if (P.hug && !P.walk) {
      const O = S.people.get(castName(P.hug) || P.hug) || (P.hug === 'player' ? S.people.get(heroName) : null); if (!O) return;
      const ob = O.fig.bones, sp = ob?.spine03 || ob?.spine02 || ob?.neck01; if (!sp) return;
      sp.getWorldPosition(_a);
      // (round them from where we stand: our side of them, then behind)
      const dx = _a.x - P.fig.root.position.x, dz = _a.z - P.fig.root.position.z, n = Math.hypot(dx, dz) || 1;
      _f.set(dx / n, 0, dz / n); _r.set(_f.z, 0, -_f.x);
      const k = P.hugK ?? 1, lift = P.hugUp ?? 0.02;
      for (const [side, s] of [['L', 1], ['R', -1]]) {
        const t = _b.copy(_a).addScaledVector(_f, 0.1).addScaledVector(_r, s * 0.13); t.y += lift + (side === 'L' ? 0.04 : -0.04);
        const pole = V().copy(P.fig.root.position).addScaledVector(_r, s * 0.9); pole.y = t.y - 0.4;
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
    if (P.prop) holdProp(P);
    if (P.hold) {
      const O = S.people.get(castName(P.hold.who) || P.hold.who); if (!O) return;
      const side = P.hold.side || 'R', ob = O.fig.bones, h = ob?.[`wrist_${P.hold.their || (side === 'R' ? 'L' : 'R')}`];
      if (!h) return;
      h.getWorldPosition(_a); const pole = V().copy(_a).add(V(0, -0.3, 0)); pole.addScaledVector(_r.set(Math.cos(P.h), 0, -Math.sin(P.h)), side === 'R' ? -0.5 : 0.5);
      try { armTo(B, side, _a.clone(), pole, P.hold.k ?? 0.9, MH_ARM); } catch {}
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
      if (k > 0 && !w.going && k < 1) { w.going = true; P.fig.play?.(w.clip || 'walk'); }
      const x = w.from[0] + (w.to[0] - w.from[0]) * k, z = w.from[1] + (w.to[1] - w.from[1]) * k;
      P.fig.root.position.x = x; P.fig.root.position.z = z; if (P.blob) { P.blob.position.x = x; P.blob.position.z = z; }
      if (w.going) { const h = Math.atan2(w.to[0] - w.from[0], w.to[1] - w.from[1]); P.fig.root.rotation.y = h; P.fig.heading = h; }
      if (k >= 1 && w.going) { w.going = false; P.x = w.to[0]; P.z = w.to[1]; P.walk = null; P.fig.play?.(w.then || P.pose || 'idle'); }
    }
    // (the face's key with the lens)
    if (frameCam) {
      const p = frameCam.pos, l = frameCam.look, dx = p[0] - l[0], dz = p[2] - l[2], dy = p[1] - l[1], n = Math.hypot(dx, dy, dz) || 1, h = Math.hypot(dx, dz) || 1;
      const fx = dx / h, fz = dz / h, out = Math.min(1.9, n * 0.9);
      S.key.position.set(l[0] + fx * out - fz * 0.8, l[1] + 0.5, l[2] + fz * out + fx * 0.8);
      S.key.intensity = n < 6 ? (S.room.key ?? (S.mood === 'night' ? 3.2 : 1.6)) : 0;
    }
  }

  /* ------------------------------------------------------------- the API -- */
  const api = {
    get active() { return active; },
    has: (id) => sets.has(id),
    async prepare(defs) {
      for (const [id, def] of Object.entries(defs || {})) {
        if (!def || sets.has(id)) continue;
        const S = build(id, def); if (!S) continue;
        sets.set(id, S);
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
      for (const S of sets.values()) S.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.parent && !o.userData.keep) { o.geometry?.dispose?.(); } });
      sets.clear();
    },
  };
  return api;
}
