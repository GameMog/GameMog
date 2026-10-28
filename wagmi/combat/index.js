// Mog City: street fighting: Dan against the Suits, freeflow, inside the open city. Fists, kicks, counters, rolls and
// slams; bats, bottles and trash cans off the street (items.js). No guns, no knives. Installed by game.js.
//   enemy.js  a Suit: thug.glb dressed as JP Bank security (a dark suit, dark glasses), his clips, how he fights (circle, step in, swing)
//   hero.js   Dan's moves and his footwork in a fight (through the control hook in js/controllers.js updatePerson)
//   camera.js the fight's camera, over the city's chase camera
//   items.js  bats, bottles, trash cans: their models, in a hand, thrown, breaking, lying about the street
//   fx.js · hud.js · sfx.js · input.js · util.js
// The director hands out the right to attack (tokens: one with up to two men on their feet, two with three or four,
// three with five or more, sooner the bigger the crowd: about a blow a second against six); a follower's blow lands at
// least 0.35 s after the one before, or with it (a gang-up: a double or triple counter), and a man with a bottle hanging
// back throws it outside the tokens. Each swing is telegraphed (his cue over his head and a slowed wind-up); yellow is
// countered, red (a brute's slam, a bat or a bottle swung with everything) must be dodged.
// The rules (c.rules): Mission 1 (Chelsea Park) is the lesson, forgiving: a counter takes the whole cue, a dodge on the
// cue always clears it, nothing punishes a mash, and a lesson card teaches STRIKE, then COUNTER on the yellow cue, then
// DODGE on a red one, one at a time (the men wait their turn for it). Everywhere else the full rules: his cue shows
// white with a ring closing on it while he winds up and only turns yellow for the last 0.42 s (the counter's window);
// a counter thrown outside it (no cue, too early, or at a red one) whiffs and leaves Dan open for 0.42 s; strikes
// mashed ahead of the combo's beat (two or more presses before the blow lands) end in an overswing, open for 0.45 s; a
// roll only clears a blow landing within 0.62 s of it (he re-aims at an early one); and the men mix it up: feints, red
// kicks, the brute's ground slam (a red ring: be outside it), two men at once from either side (the pincer).
// Hit-stop and slow motion run on the fight's own clock (Dan, the Suits, the effects,
// and the street's traffic), real time for the camera and the overlays. The fight lasts while any man of it lives near
// him (on his feet or not) and a beat after the last one.
// The street: Dan's parked car is solid to it all (the men walk round it, nobody attacks across it, his moves don't go
// through it, the camera won't look through it); the traffic's cars and buses are boxes the men are kept out of, and
// brake for the men in the road (and lying in it) along the way they are turning; the people on the sidewalks run from
// a fight. Driving, Dan's car throws the men it hits (or they dive aside); F gets him into it mid-fight unless a blow
// is about to land, and the gang then beats on the car and drags him out at the driver's door.
// API (window.WAGMI.combat):
//   spawnCrew({ x, z, count = 4, brute = 0, weapons = [], aggro = true, props = true }) -> crew { enemies, alive(),
//     onCleared(cb), engage() }: count grunts and `brute` brutes on a loose ring around (x, z); weapons: item kinds
//     ('bat', 'bottle') handed to the first grunts; props: trash cans and bottles set about the sidewalk near them (true:
//     2 cans, 3 bottles; or { cans, bottles, bats }; false: none)
//   props(x, z, { cans, bottles, bats }) -> the items it set down
//   clear() · player: { hp, maxHp, onDown(cb), autoGetUp, downTime, getUpHp, getUp(hp) } · dressSuit(obj, look) · enabled
//   pressure({ max = 2, circle, calm }) / pressure(null): a mission's hold on a big fight (Mission 2's yard): at most
//     `max` men go in at once (a bottle thrown from further out only while fewer swing: so 3 at the most), circle: the
//     rest prowl round him 4.6-5.4 m out, side-stepping one way, then the other, instead of waiting on the ring, calm:
//     no quicker turns for a bigger crowd. Cleared by clear() (a fail, a quit); null: the director's own rules again
//   on(event, cb): 'fight' (started / ended: 1.5 s of fight time after the last man near him went out), 'down' (Dan),
//     'enemyDown', 'cleared' (a crew), 'hit'
//   items: the props themselves (make, place, scatter, give, arm, list)
//   ignores input and freezes the Suits while WAGMI.cutscene is true. URL ?fight: a crew of 4 grunts (a bat, a bottle)
//   and a brute in front of Dan, on foot, cans and bottles about. debug: press(action), fixed(on) / step(n)
//   (deterministic frames), slow(k), spawn(), give(kind), prop(kind, dist, deg), state()
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLB } from '../glb.js';
import { faceMorphs } from '../face.js';
import { Enemy, BLOWS, prepareClips } from './enemy.js';
import { createHero } from './hero.js';
import { createInput } from './input.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createFightCamera } from './camera.js';
import { createSfx } from './sfx.js';
import { createItems } from './items.js';
import { installVault } from '../vault.js';
import { clamp, smooth, angWrap, yawTo, hdist, rnd, fwd } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function install(W) {
  const app = W.app, cm = app.controllerManager, scene = app.scene, P = W.person, Q = W.dan;
  // (the men's motion capture: a standing idle, walks, a run and a sprint, side-steps, a back-step, a gesture and two
  // wave-offs, clips on thug.glb's rig in a pack of their own, assets/anim/bandai/suits.glb (CC BY-NC 4.0, see NOTICE),
  // fetched alongside the body; enemy.js plays them over the rig's brawler idle and walks, which stay for the fight and as
  // the fallback if the pack fails to load)
  const bandai = loadGLB('assets/anim/bandai/suits.glb').catch(() => null);
  const gltf = await loadGLB('assets/characters/thug.glb');
  // the looks (JP Bank security's suits): a (baked into the model: charcoal, white shirt, black tie), b (black, white
  // shirt), c (grey, black shirt), brute (black, white shirt): textures riding in the same file (asset.extras.looks)
  // (28 Oct: the Suits are men, seven of them in the file, asset.extras.men: each his own node 'Man-<name>', his own
  // skin and skeleton (his frame's scale and every bone's rest, set on a copy when it is dressed as him), his eyes for
  // the glasses; the look is his suit's texture alone)
  const MEN = gltf.asset?.extras?.men || null;
  const looks = {};
  gltf.scene.traverse((o) => { if (o.isMesh && !looks.a && (!MEN || o.material?.name === 'clothes')) looks.a = o.material.map; });
  for (const [k, i] of Object.entries(gltf.asset?.extras?.looks || {})) if (k !== 'a') { const t = await gltf.parser.getDependency('texture', i); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; looks[k] = t; }
  // what every man wears over the suit: dark wrap-round glasses on the bridge of his nose; and, on the men in look b and
  // the brutes, an earpiece in his left ear, its clear coiled cord down behind it to his collar. Measured once on the
  // file's own body in its rest pose (the parts placed in the body's frame, kept in the head bone's), shared geometry;
  // each man gets his own materials (an enemy fades and flashes his own)
  const kit = (() => {
    const sc = gltf.scene; sc.updateMatrixWorld(true);
    let head = null; sc.traverse((o) => { if (o.isBone && o.name === 'head' && !head) head = o; });
    if (!head) return null;
    const top = MEN ? 0 : new THREE.Box3().setFromObject(sc).max.y, hp = head.getWorldPosition(new THREE.Vector3()), inv = head.matrixWorld.clone().invert();
    const rel = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z).premultiply(inv);
    const box = (w, h, d, x, y, z, ry = 0) => new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z);
    // the glasses (as the opening's first pair: two lenses toed in, a brow bar, the arms back over his ears)
    // (27 Oct: one smooth piece, the size and place of the five boxes it was: each lens a rounded outline a little narrower
    // at the bottom, its top the brow line, bevelled; a bridge between them; rounded arms)
    const glasses = ((sh, ex) => mergeGeometries([ex(sh(0.056, 0.032, 0.004, 0.0035, 0.009), 0.0075).rotateY(-0.18).translate(-0.034, 0.002, 0), ex(sh(0.056, 0.032, 0.004, 0.0035, 0.009), 0.0075).rotateY(0.18).translate(0.034, 0.002, 0),
      ex(sh(0.016, 0.005, 0, 0.0022, 0.0022), 0.005).translate(0, 0.012, 0.0005), ...[-1, 1].map((sx) => ex(sh(0.004, 0.006, 0, 0.0018, 0.0018), 0.108).translate(sx * 0.066, 0.01, -0.055))]))(
      (w, h, taper, rt, rb) => { const P = [[-w / 2 + taper, -h / 2, rb], [w / 2 - taper, -h / 2, rb], [w / 2, h / 2, rt], [-w / 2, h / 2, rt]], s = new THREE.Shape();
        P.forEach(([x, y, r], i) => { const [px, py] = P[(i + 3) % 4], [nx, ny] = P[(i + 1) % 4], a = Math.hypot(px - x, py - y), b = Math.hypot(nx - x, ny - y), u = [x + (px - x) * r / a, y + (py - y) * r / a], v = [x + (nx - x) * r / b, y + (ny - y) * r / b]; if (i) s.lineTo(...u); else s.moveTo(...u); s.quadraticCurveTo(x, y, ...v); });
        s.closePath(); return s; },
      (s, d) => new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2, curveSegments: 5 }).translate(0, 0, -d / 2));
    // the earpiece: a bud in the ear, the cord coiled round a line from behind the ear down to the collar
    const path = new THREE.CatmullRomCurve3([[0.083, 0, 0.004], [0.088, -0.035, -0.022], [0.082, -0.09, -0.05], [0.07, -0.15, -0.062]].map((p) => new THREE.Vector3(...p)));
    const pts = [], N = 90;
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = path.getPointAt(u), t = path.getTangentAt(u), n = new THREE.Vector3(1, 0, 0).cross(t).normalize(), b = t.clone().cross(n), a = u * 18 * Math.PI * 2, r = u < 0.18 ? 0 : 0.0055;
      pts.push(p.add(n.multiplyScalar(Math.cos(a) * r)).add(b.multiplyScalar(Math.sin(a) * r)));
    }
    const cord = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 0.0019, 5, false);
    const ear = mergeGeometries([cord, new THREE.SphereGeometry(0.0115, 10, 8).scale(0.8, 1, 1).translate(0.081, 0, 0.004)]);
    return { head: head.name, glasses, ear, at: rel(0, top - 0.152, hp.z + 0.11), earAt: rel(0, top - 0.168, hp.z - 0.012) };
    // (for one of the men: the glasses 12 mm in front of his eyes, the earpiece's bud in his left ear; worked out on his
    // own copy, dressed as him, in dressSuit)
  })();
  const kitMats = () => ({
    lens: new THREE.MeshPhysicalMaterial({ color: '#050506', roughness: 0.05, metalness: 0.6, clearcoat: 1 }),
    cord: new THREE.MeshPhysicalMaterial({ color: '#D4D9DF', roughness: 0.22, metalness: 0, clearcoat: 0.6 }),
  });

  const c = {
    W, app, cm, scene, camera: app.cameraSystem.camera, time: 0, rtime: 0, ts: 1, slowK: 0, enabled: true,
    enemies: [], crews: [], threats: [], loose: [], combo: { n: 0 }, tokens: [], globalCd: 0, standingN: 0,
    fixed: false, steps: 0, stepNow: false, debugScale: 1, quiet: false, cost: 0, frames: 0,
    cap: null, // (a mission's pressure on the fight: { max, circle, calm }, see the API)
  };
  c.playerFeet = new THREE.Vector3().copy(P.position);
  // the rules (see the top): Mission 1's lesson, or the full ones; ?fightrules=lesson|full, or debug.rules(), pins them
  const RULES = {
    lesson: { name: 'lesson', window: 9, whiff: false, mash: false, dodgeClear: 9, variety: false, pincer: false },
    full: { name: 'full', window: 0.42, whiff: true, mash: true, dodgeClear: 0.62, variety: true, pincer: true },
  };
  let rulesPin = RULES[new URLSearchParams(location.search).get('fightrules')] || null, rulesT = 0;
  const rulesNow = () => { if (rulesPin) return rulesPin; let m = null; try { m = W.missions?.active?.(); } catch (e) { /* (none) */ } return m && m.id === 'm1' ? RULES.lesson : RULES.full; };
  c.rules = rulesNow();
  c.thug = { gltf, ...prepareClips(gltf) };
  for (const clip of (await bandai)?.animations || []) c.thug.clips.set(clip.name, clip); // (in place: their travel taken out)
  // Dan's car parked in the street is solid to the fight (the city's own collision only knows the buildings): a box
  // (its half width, half length and roof) the men are kept out of and walk round, and the camera won't look through
  const car = W.car, CAR = car?.body ? { hx: car.body.hx, hz: (car.body.z1 - car.body.z0) / 2, h: car.body.top + 0.05 } : { hx: 0.9, hz: 2.25, h: 1.3 };
  const carOn = () => !!car && cm.activeMode !== 'car' && !!car.mesh?.visible;
  const _l1 = { x: 0, z: 0 }, _l2 = { x: 0, z: 0 };
  // a world point in the car's own frame (x across it, z along it), and back
  function carLocal(x, z, out) { const h = car.heading, cs = Math.cos(h), sn = Math.sin(h), dx = x - car.position.x, dz = z - car.position.z; out.x = dx * cs - dz * sn; out.z = dx * sn + dz * cs; return out; }
  function carWorld(lx, lz, out) { const h = car.heading, cs = Math.cos(h), sn = Math.sin(h); out.x = car.position.x + lx * cs + lz * sn; out.z = car.position.z - lx * sn + lz * cs; return out; }
  function carPush(pos, r) {
    if (!carOn()) return false;
    const L = carLocal(pos.x, pos.z, _l1), hx = CAR.hx + r, hz = CAR.hz + r;
    if (Math.abs(L.x) >= hx || Math.abs(L.z) >= hz) return false;
    let nx = L.x, nz = L.z; if (hx - Math.abs(L.x) < hz - Math.abs(L.z)) nx = Math.sign(L.x || 1) * hx; else nz = Math.sign(L.z || 1) * hz;
    carWorld(nx, nz, pos);
    return true;
  }
  // a point inside the car (pad: m round it)
  c.carSolid = (x, y, z, pad = 0) => { if (!carOn() || y > car.position.y + CAR.h || y < car.position.y - 0.3) return false; const L = carLocal(x, z, _l1); return Math.abs(L.x) < CAR.hx + pad && Math.abs(L.z) < CAR.hz + pad; };
  // where the line a -> b (on the ground) first meets the car, r m round it: the fraction of the way, or -1
  function carHit(a, b, r = 0) {
    if (!carOn()) return -1;
    const A = carLocal(a.x, a.z, _l1), B = carLocal(b.x, b.z, _l2), dx = B.x - A.x, dz = B.z - A.z;
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 2; k++) {
      const p = k ? A.z : A.x, d = k ? dz : dx, h = (k ? CAR.hz : CAR.hx) + r;
      if (Math.abs(d) < 1e-9) { if (Math.abs(p) >= h) return -1; continue; }
      let u0 = (-h - p) / d, u1 = (h - p) / d; if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 >= t1) return -1;
    }
    return t0;
  }
  const carCross = (a, b, r = 0) => carHit(a, b, r) >= 0;
  c.carCross = carCross; c.carHit = carHit;
  // the way round it: the corner of the car (r m off it) he can walk straight to that makes the shortest way to `to`,
  // or null when the car isn't in the way
  const _corner = new THREE.Vector3(), _best = new THREE.Vector3();
  // (how far a point stands off the car's sides)
  const carGap = (p) => { const L = carLocal(p.x, p.z, _l1); return Math.max(Math.abs(L.x) - CAR.hx, Math.abs(L.z) - CAR.hz); };
  c.detour = (from, to, r = 0.35, out = new THREE.Vector3()) => {
    if (!carOn()) return null;
    r = Math.max(0, Math.min(r, carGap(from) - 0.02, carGap(to) - 0.02)); // (one of them right up against it: hugging it is fine)
    if (!carCross(from, to, r)) return null;
    let bs = Infinity; const m = r + 0.4;
    for (let i = 0; i < 4; i++) {
      carWorld((i & 1 ? 1 : -1) * (CAR.hx + m), (i & 2 ? 1 : -1) * (CAR.hz + m), _corner); _corner.y = from.y;
      if (carCross(from, _corner, r)) continue;
      const s = hdist(from, _corner) + hdist(_corner, to); if (s < bs) { bs = s; _best.copy(_corner); }
    }
    return bs < Infinity ? out.copy(_best) : null;
  };
  // the traffic near him (refreshed every frame, see c.frame): boxes { x, z, cs, sn, hx (half width), hz (half length),
  // top } the Suits are kept out of and the camera won't look through
  c.vehs = [];
  function vehPush(pos, r) {
    let hit = false;
    for (const o of c.vehs) {
      if (pos.y > o.y + o.top) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z, lx = dx * o.cs - dz * o.sn, lz = dx * o.sn + dz * o.cs, hx = o.hx + r, hz = o.hz + r;
      if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
      let nx = lx, nz = lz; if (hx - Math.abs(lx) < hz - Math.abs(lz)) nx = Math.sign(lx || 1) * hx; else nz = Math.sign(lz || 1) * hz;
      pos.x = o.x + nx * o.cs + nz * o.sn; pos.z = o.z - nx * o.sn + nz * o.cs; hit = true;
    }
    return hit;
  }
  c.world = { ground: (x, z) => cm.getGroundHeight(x, z, 'person'), collide: (pos, r) => { cm.resolveHorizontalCollision(pos, r, pos.y + 1.0); carPush(pos, r); vehPush(pos, r); } };
  c.vehPush = vehPush;
  c.carPush = carPush;
  // dress a thug.glb body as one of JP Bank's security men (the intro's men too): the look's suit on its own material,
  // shadows on, and his glasses (and earpiece) on his head bone (obj.userData.shades: the glasses)
  // (who he is: a Suit of the story by his root's name, 'Suit-Knox'; a brute the widest of them; the fight's other men
  // the crew in turn)
  const CREW = MEN ? Object.keys(MEN).filter((k) => k !== 'knox' && k !== 'mack') : [];
  let crewN = 0;
  c.dressSuit = (obj, look = 'a', own = true) => {
    const map = looks[look] || looks.a;
    let man = null;
    if (MEN && !obj.userData.man) {
      const nm = (obj.parent?.name || '').replace(/^Suit-/, '').toLowerCase();
      man = MEN[nm] ? nm : look === 'brute' && MEN.tank ? 'tank' : CREW[crewN++ % CREW.length];
      for (const [k, m] of Object.entries(MEN)) if (k !== man) obj.getObjectByName(m.node)?.removeFromParent();
      // (his skeleton: the frame's scale and each bone's rest, as his skin was bound)
      const M = MEN[man], rig = obj.getObjectByName('ThugRig');
      if (rig) rig.scale.setScalar(M.rig);
      obj.traverse((b) => { const t = b.isBone && M.rest[b.name]; if (t) b.position.fromArray(t); });
      // (his face's morphs made on the file's own copy of him the first time he is dressed (face.js), so every copy made
      // after has them; this one given them now: a copy drawn from a body whose morphs it doesn't know stops the draw)
      const src = gltf.scene.getObjectByName(M.node);
      if (src && !src.userData.faced) {
        src.userData.faced = true;
        let sk = null; src.traverse((o) => { if (!sk && o.isSkinnedMesh && o.material?.name === 'skin') sk = o; });
        const body = []; if (sk) src.traverse((o) => { if (o.isSkinnedMesh && o.geometry.attributes.position === sk.geometry.attributes.position) body.push(o); });
        try { faceMorphs(body); } catch (e) { console.warn('[combat] face', man, e); }
        src.traverse((o) => { if (o.isMesh && o.geometry.morphAttributes.position?.length) o.updateMorphTargets(); });
      }
      obj.traverse((o) => { if (o.isMesh && o.geometry.morphAttributes.position?.length && !o.morphTargetInfluences) o.updateMorphTargets(); });
      obj.userData.man = man;
    }
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (own) o.material = o.material.clone();
      if (map && (!MEN || o.material.name === 'clothes')) { o.material.map = map; o.material.needsUpdate = true; }
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    });
    let head = null; if (kit && !obj.userData.shades) obj.traverse((o) => { if (o.isBone && o.name === kit.head && !head) head = o; });
    if (head) {
      const M = kitMats(), part = (geo, mat, at) => { const m = new THREE.Mesh(geo, mat); m.applyMatrix4(at); m.castShadow = true; m.frustumCulled = false; head.add(m); return m; };
      let at = kit.at, earAt = kit.earAt;
      const E = man && MEN[man].eyes;
      if (E) {
        // (his own: a point in his body's frame, in the head bone's as he stands now)
        obj.updateMatrixWorld(true);
        const inv = head.matrixWorld.clone().invert(), rel = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z).premultiply(obj.matrixWorld).premultiply(inv);
        at = rel(0, E[1] + 0.001, E[2] + 0.012); earAt = rel(-0.012, E[1] - 0.026, E[2] - 0.1);
      }
      obj.userData.shades = part(kit.glasses, M.lens, at);
      if (look === 'b' || look === 'brute') obj.userData.earpiece = part(kit.ear, M.cord, earAt);
    }
    return obj;
  };
  const listeners = {};
  const emit = (ev, data) => { for (const cb of listeners[ev] || []) { try { cb(data); } catch (e) { console.error('[combat]', ev, e); } } };
  c.items = createItems(c);
  await c.items.load();
  c.fx = createFx(scene);
  c.sfx = createSfx();
  c.hud = createHud(c);
  c.live = () => c.enabled && !W.cutscene && !W.directed && cm.activeMode === 'person' && !P.inVehicle;
  // (the mouse, locked to the view in a fight, turns the camera as a drag would)
  const look = (dx, dy) => { const cs = app.cameraSystem; cs.orbitYawOffset -= dx * 0.0042; cs.orbitPitchOffset = clamp(cs.orbitPitchOffset + dy * 0.0032, -0.32, 0.68); cs.userOrbitTimer = 4; };
  c.input = createInput({ canvas: app.renderer.domElement, live: c.live, fighting: () => c.me.fighting, near: () => c.enemies.some((e) => e.targetable && hdist(e.pos, P.position) < 9), now: () => c.time, look });
  c.me = createHero(c);
  c.player = { autoGetUp: true, downTime: 3.2, getUpHp: 40 };
  const camx = createFightCamera(c);
  c.camYaw = () => camx.yaw();
  c.shake = (a, dir) => camx.shake(a, dir);
  c.solid = camx.solid;
  c.cam = camx;
  c.cine = (target, dur, { slow = true, low = false } = {}) => { camx.cine(target, dur, { low }); if (slow) c.slowmo(dur * 0.75, 0.42, 0.35); };
  // the fight's on while any man of a crew in it lives near him (standing, flying, lying, getting up, in his hands), and
  // for a beat after the last one goes out: the camera stays on the two of them, then hands back
  c.linger = null;
  c.lingering = () => !!c.linger && c.time < c.linger.until;
  c.cameraWants = () => (c.me.fighting || c.lingering()) && c.live();
  c.engaged = () => c.enemies.some((e) => e.alive && e.state !== 'idle');
  // a wall or the car between two men (on the ground, at chest height)
  c.lineBlocked = (a, b) => {
    if (carCross(a, b, 0.15)) return true;
    const L = hdist(a, b), n = Math.ceil(L / 0.5);
    for (let i = 1; i < n; i++) { const u = i / n; if (camx.solid(a.x + (b.x - a.x) * u, Math.max(a.y, b.y) + 1.1, a.z + (b.z - a.z) * u)) return true; }
    return false;
  };
  c.attackable = () => c.live() && !c.me.down() && !c.quiet;
  // the clocks: Dan's moves and pose, the Suits and the effects step on the fight's clock (this frame's scale was set
  // at the end of the last one, so all of them agree); in fixed mode (debug) only on requested steps of 1/60 s
  const realDt = (dt) => (c.fixed ? (c.stepNow ? 1 / 60 : 0) : dt);
  Q.pre = (dt) => { Q.timeScale = dt > 0 ? realDt(dt) * c.ts / dt : 0; c.me.pre(realDt(dt) * c.ts); };
  const ctl = c.me.control;
  P.control = (dt, keys) => { const t0 = performance.now(); const r = ctl(realDt(dt), keys); c.cost += performance.now() - t0; return r; };
  // (over it: the hurdle over the low things on foot, fences, benches, granite, over the fight's hook, ../vault.js)
  installVault(W, c);

  // ------------------------------------------------------------------ hit-stop and slow motion (real time)
  const timeReq = [];
  c.hitStop = (dur, scale = 0.05) => timeReq.push({ until: c.rtime + dur, scale, kind: 'stop' });
  c.slowmo = (dur, scale = 0.3, ease = 0.25) => timeReq.push({ until: c.rtime + dur, scale, ease, kind: 'slow' });
  function nextScale() {
    let sc = 1, slow = 0;
    for (let i = timeReq.length - 1; i >= 0; i--) {
      const r = timeReq[i]; if (c.rtime >= r.until) { timeReq.splice(i, 1); continue; }
      let s = r.scale;
      if (r.kind === 'slow') { const k = smooth((r.until - c.rtime) / r.ease); s = 1 - (1 - r.scale) * k; slow = Math.max(slow, 1 - s); }
      sc = Math.min(sc, s);
    }
    c.slowK = slow;
    return sc * c.debugScale;
  }

  // ------------------------------------------------------------------ threats (the cues)
  // (win: the last part of a yellow one the counter takes; before it the cue shows white, its ring closing)
  c.threat = (e, lead, kind, o = {}) => { const t = { e, at: c.time + lead, lead, kind, win: kind === 'counter' ? Math.min(lead, c.rules.window) : lead, ...o }; c.threats.push(t); if (c.lessonThreat) c.lessonThreat(t); return t; };
  c.cueOpen = (t) => t.kind !== 'counter' || t.at - c.time <= t.win + 0.001;
  c.clearThreats = (e) => { c.threats = c.threats.filter((t) => t.e !== e); };
  // the blow landing soonest (for a perfect dodge: within its last moments)
  c.nearestThreat = () => { let b = null; for (const t of c.threats) { const r = t.at - c.time; if (r < -0.08 || r > 0.8) continue; if (!b || t.at < b.at) b = t; } return b; };
  // a cue showing now (a counter answers it)
  // (and one winding up, its window not open yet: early, a counter whiffs; c.cueOpen tells)
  c.counterable = () => { let b = null; for (const t of c.threats) { const r = t.at - c.time; if (r < -0.1 || r > t.lead + 0.05) continue; if (!b || (c.cueOpen(t) && !c.cueOpen(b)) || (c.cueOpen(t) === c.cueOpen(b) && t.at < b.at)) b = t; } return b; };
  // the right to attack: one man at a time with up to three on their feet; with four or five a second may follow the
  // first in, with six or more a third, and the bigger the crowd the sooner the next goes (about a blow a second at six).
  // A follower's blow lands at least 0.35 s after the one before it, or (a gang-up, now and then) with it: a double or
  // triple counter. (A mission's pressure, c.cap: no more than cap.max in at once, and calm: no quicker for a crowd)
  c.crowdK = () => (c.cap?.calm ? 1 : c.standingN >= 6 ? 0.55 : c.standingN >= 4 ? 0.75 : 1);
  c.ranged = null; // (a bottle thrown from further out goes outside the tokens)
  c.hasToken = (e) => c.tokens.includes(e) || c.ranged === e;
  c.releaseToken = (e) => {
    if (c.ranged === e) { c.ranged = null; return; }
    const i = c.tokens.indexOf(e); if (i < 0) return;
    c.tokens.splice(i, 1); e.gang = false;
    c.globalCd = Math.max(c.globalCd, (i === 0 ? rnd(0.25, 0.6) : rnd(0.15, 0.35)) * c.crowdK());
  };
  c.swingOk = (e, lead) => {
    const at = c.time + lead;
    // (the pincer's second man: his blow 0.3 s after his partner's, once the partner is swinging)
    if (e.pincer) { const p = e.pincer, t = c.threats.find((x) => x.e === p); if (p.alive && (p.state === 'approach' || p.state === 'attack')) { if (!t) return false; const d = at - t.at; if (d > 0.22 && d < 0.4) { e.pincer = null; e.gang = true; return true; } return false; } e.pincer = null; }
    for (const t of c.threats) {
      if (t.e === e || t.item) continue;
      const d = at - t.at;
      if (e.gang && Math.abs(d) < 0.1) continue; // (with him: together)
      if (Math.abs(d) < 0.35 || (e.gang && d < 0)) return false;
    }
    return true;
  };
  c.onEnemyInterrupted = (e) => { c.releaseToken(e); c.clearThreats(e); };

  // ------------------------------------------------------------------ blows Dan lands
  // the feel of a blow, sized to it: how long time holds (the hit-stop: ~40 ms for a jab to ~130 for a slam), how hard
  // the view shakes and which way it jolts, the punch in, and the sound (a fist, a foot, a body blow, a bat, glass, a can)
  c.playerHit = (e, h) => {
    if (!e || !e.alive) return;
    const me = c.me;
    const dir = h.dir && h.dir.y === 0 ? h.dir.clone() : _v.set(e.pos.x - P.position.x, 0, e.pos.z - P.position.z);
    if (dir.lengthSq() < 1e-6) fwd(P.heading, dir); dir.normalize();
    // (a blow that throws him, aimed straight at the lens: he flies off to one side of it instead, the side with room)
    if (h.dir?.y !== -1 && (h.fly || h.kind === 'ender' || h.kind === 'heavy' || h.kind === 'counter' || h.kind === 'takedown')) offLens(dir, e.pos);
    const r = e.hit({ dmg: h.dmg, dir: dir.clone(), kind: h.kind, side: h.side || 0, fly: h.fly, up: h.up, w: h.w, weapon: h.weapon, stun: h.stun });
    if (!r) return;
    wake(e.crew);
    const heavy = r.armored ? 0.12 : h.heavy || 0;
    const cp = h.at ? h.at.clone() : e.chest(_v2).addScaledVector(dir, -0.25);
    c.fx.hit(cp, _v3.copy(dir).negate().lerp(dir, 0.2).normalize(), { heavy, color: r.armored ? [3, 3, 3.4] : undefined });
    if (h.kind === 'counter' || h.counter) { c.fx.counterFlash(cp); c.slowmo(0.34, 0.25, 0.22); camx.punch(0.9); } // the counter: fast, then a beat of slow motion as it lands
    const big = ['slam', 'takedown', 'ground'].includes(h.kind), ko = r.knocked || r.dead;
    if (h.kind === 'slam') c.hitStop(0.13, 0.02);
    else if (big) c.hitStop(0.1, 0.03);
    else if (h.weapon === 'bat' || h.weapon === 'bottle') c.hitStop(ko ? 0.1 : 0.075, 0.03);
    else if (heavy > 0.5) c.hitStop(ko ? 0.085 : 0.07, 0.04);
    else c.hitStop(h.w != null && h.w < 0.2 ? 0.038 : 0.05, 0.06);
    c.shake(0.18 + heavy * 0.55 + (h.weapon ? 0.15 : 0), dir);
    if (heavy > 0.5 || h.weapon) { camx.punch(Math.max(heavy, 0.5) * (big ? 1.3 : 1)); c.fx.smear(cp, dir, heavy); }
    if (r.dead && ko && !big) c.slowmo(0.4, 0.4, 0.3); // the last man of a run, or a man finished: a beat to see him go
    const foot = h.limb === 'footL' || h.limb === 'footR';
    if (h.weapon === 'bat') c.sfx('bat', heavy);
    else if (h.weapon === 'bottle') { c.sfx('glass', 1); c.sfx('punch', 0.5); }
    else if (h.weapon === 'trashcan') { c.sfx('clang', 1); c.sfx('slam', 0.7); }
    else if (big) c.sfx('slam', 1);
    else if (h.kind === 'counter' || h.counter) c.sfx('counter');
    else if (ko || heavy > 0.55) c.sfx('body', heavy);
    else c.sfx(foot ? 'kick' : 'punch', heavy);
    if (ko && Math.random() < 0.6) c.sfx('grunt', 0.6);
    if (!r.armored) { c.combo.n++; me.lastHitT = c.time; me.addMeter(h.kind === 'counter' ? 'counter' : heavy > 0.5 ? 'heavy' : 'light'); }
    if (c.lesson?.step === 0 && ++c.lesson.n >= LESSON[0].need) c.lessonDone('strike');
    if (r.dead) c.hud.flash(['Down he goes', 'He’s done', 'Lights out'][Math.floor(Math.random() * 3)]);
    emit('hit', { enemy: e, kind: h.kind, dmg: h.dmg, weapon: h.weapon || null });
  };
  // a way (unit, on the ground) a man is thrown from p, turned off the camera's line when it would take him at the lens
  const _UP = new THREE.Vector3(0, 1, 0);
  function offLens(d, p) {
    const cy = camx.yaw(), bx = -Math.sin(cy), bz = -Math.cos(cy);
    if (d.x * bx + d.z * bz < 0.45) return d;
    let best = 1, bs = -Infinity;
    for (const sg of [1, -1]) {
      const r = _v3.copy(d).applyAxisAngle(_UP, sg * 1.0), x = p.x + r.x * 3, z = p.z + r.z * 3;
      const sc = -(r.x * bx + r.z * bz) - (camx.solid(x, p.y + 1, z) ? 5 : 0);
      if (sc > bs) { bs = sc; best = sg; }
    }
    return d.applyAxisAngle(_UP, best * 1.0);
  }
  // a thrown thing meets a man: a can bowls him over (a brute is stunned), a bottle breaks on him
  c.itemHit = (e, I, sp, dir) => {
    const can = I.kind === 'trashcan', bottle = I.kind === 'bottle';
    const at = I.obj.position.clone();
    const r = e.hit({ dmg: can ? 34 : bottle ? 22 : I.kind === 'bat' ? 20 : 8, dir: dir.clone(), kind: can || I.kind === 'bat' ? 'thrown' : 'ender', side: 0, fly: can ? 5.5 + sp * 0.15 : 4, up: can ? 3.6 : 3, w: 1, weapon: I.kind, stun: true });
    if (!r) return;
    wake(e.crew);
    c.fx.hit(at, _v3.copy(dir).negate(), { heavy: 0.8, color: can ? [4, 4, 4.4] : undefined });
    if (bottle) c.items.shatter(I, dir);
    if (can) { c.sfx('clang', 1); c.sfx('body', 0.8); c.fx.dust(at.clone().setY(e.pos.y + 0.1), { amount: 0.6 }); if (I.lidOn && Math.random() < 0.7) c.items.popLid(I, _v.copy(dir).multiplyScalar(2).setY(4)); }
    else if (I.kind === 'bat') c.sfx('bat', 0.8);
    c.hitStop(can ? 0.09 : 0.07, 0.03); c.shake(can ? 0.55 : 0.35, dir); camx.punch(0.6);
    c.combo.n++; c.me.lastHitT = c.time; c.me.addMeter('heavy');
    if (r.dead) c.hud.flash(['Strike!', 'Right in the chest', 'Lights out'][Math.floor(Math.random() * 3)]);
    emit('hit', { enemy: e, kind: 'thrown', dmg: 0, weapon: I.kind });
  };
  // a Suit's bottle reaches Dan: it breaks on him, unless he rolled clear
  c.itemHitsHero = (I) => {
    const me = c.me; if (me.invuln() || me.down()) return false;
    const thrower = I.thrower && I.thrower.pos ? I.thrower : { pos: I.obj.position.clone().sub(I.vel) };
    const dmg = (thrower.T ? thrower.T.dmg : 9) * 1.4;
    me.takeHit(thrower, dmg, false);
    const d = _v2.copy(I.vel).setY(0).normalize();
    c.fx.hit(I.obj.position, _v.copy(d).negate(), { heavy: 0.5, color: [5.5, 1.6, 1.2] });
    if (I.kind === 'bottle') c.items.shatter(I, d); else { I.vel.multiplyScalar(-0.2); I.thrower = null; }
    c.hitStop(0.06, 0.06); c.shake(0.4, d); c.hud.hurt(0.15); c.combo.n = 0; c.sfx('hurt', 0.3);
    return true;
  };
  // a fist (or a body) into the street: dust and a shake
  c.groundPound = (p, k = 0.8, sound = 'bodyfall') => { c.fx.dust(p, { amount: 0.9 + k }); c.shake(0.3 + 0.3 * k); if (sound) c.sfx(sound, k); };
  c.onCounter = (e, took, n = 1) => { if (c.lesson?.step === 1) c.lessonDone('counter'); c.hud.banner(n >= 3 ? 'TRIPLE COUNTER' : n === 2 ? 'DOUBLE COUNTER' : took ? 'DISARMED' : 'COUNTER'); c.sfx('counter'); if (took) c.hud.flash(`Took his ${took.def.name.toLowerCase()}`); for (let i = 1; i < n; i++) c.me.addMeter('counter'); };
  // a dodge made while a man's cue shows: that blow misses him, wherever it lands (a dodge on the cue is never punished);
  // a brute's slam dodged in its last 0.6 s (or perfectly) leaves the brute stunned when it hits nothing; a bottle in
  // the air can't touch him until it has passed
  c.onDodge = (t0, perfect) => {
    for (const t of c.threats) {
      const r = t.at - c.time; if (r < -0.08 || r > t.lead + 0.05) continue;
      if (t.item) { c.me.invulnUntil = Math.max(c.me.invulnUntil, t.at + 0.12); continue; }
      // (the full rules: a roll too early is seen coming, he re-aims; the ground slam is only cleared by distance)
      if (t.quake || r > c.rules.dodgeClear) continue;
      t.e.dodged = true; if (c.lesson?.step === 2 && t.lesson) c.lessonDone('dodge');
      if (t.e.type === 'brute' && BLOWS[t.e.atk]?.heavy && (r <= 0.6 || perfect)) t.e.stunOnWhiff = true;
    }
    if (!perfect) return;
    c.slowmo(0.5, 0.3, 0.3); c.hud.banner('PERFECT DODGE');
    c.me.addMeter('perfect');
  };
  c.onEnemyOut = (e) => {
    c.releaseToken(e); c.clearThreats(e);
    // the last of them near him: the camera holds on the two of them a moment longer
    if (!c.enemies.some((x) => x.alive && x.state !== 'idle' && hdist(x.pos, P.position) < 16)) c.linger = { until: c.time + 1.5, at: e.pos.clone() };
    emit('enemyDown', { enemy: e });
    const cr = e.crew;
    if (cr && !cr.cleared && cr.enemies.length && cr.enemies.every((x) => !x.alive)) {
      cr.cleared = true; c.hud.banner(c.crews.some((x) => !x.cleared && x.enemies.length) ? 'CREW DOWN' : 'ALL CLEAR', '#4ADE80'); c.slowmo(0.7, 0.4, 0.4);
      for (const cb of cr._cleared) { try { cb(cr); } catch (err) { console.error('[combat] onCleared', err); } }
      emit('cleared', cr);
    }
  };

  // ------------------------------------------------------------------ blows the Suits land
  c.enemyStrike = (e) => {
    c.clearThreats(e);
    const me = c.me, B = BLOWS[e.atk], w = e.weapon, pf = P.position;
    if (B.quake) {
      // the ground slam: everything inside his ring goes down (a roll doesn't save him there); outside it, he's winded
      const R = B.quake * e.scale, at = _v.copy(e.pos).addScaledVector(fwd(e.yaw, _v2), 0.5 * e.scale);
      c.groundPound(at, 1.3, 'slam'); c.fx.dust(at, { amount: 1.6 }); c.shake(0.8); c.sfx('whoosh', 1.2);
      const inside = hdist(e.pos, pf) <= R + 0.2 && Math.abs(pf.y - e.pos.y) < 1.2 && c.live() && !me.down() && !(me.moveName() === 'slam' && me.invuln());
      if (!inside) { e.stun = 2.6; c.hud.flash('He’s winded: E to slam him'); c.sfx('grunt', 1); return; }
      me.invulnUntil = 0; me.takeHit(e, e.T.dmg * B.dmg, true);
      c.hitStop(0.09, 0.04); camx.punch(0.9); c.hud.hurt(0.4); c.combo.n = 0; c.sfx('hurt', 1);
      if (!c.quakeTold) { c.quakeTold = true; c.hud.flash('Inside the red ring: get out of it, a roll won’t save you', 'danger'); }
      return;
    }
    const range = e.blowRange();
    const d = hdist(e.pos, pf), dy = Math.abs(pf.y - e.pos.y);
    const facing = Math.abs(angWrap(yawTo(e.pos, pf) - e.yaw)) < 1.0;
    const inReach = d <= range + 0.55 && dy < 1.1 && facing && c.live();
    if (!inReach || me.invuln() || e.dodged) {
      c.sfx('whoosh', B.heavy ? 1.2 : 0.7);
      if (B.heavy) c.groundPound(_v.copy(e.pos).addScaledVector(fwd(e.yaw, _v2), 0.9 * e.scale), 0.4, 'slam');
      // a brute's slam dodged: he is left stunned, open
      if (B.heavy && e.type === 'brute' && (e.stunOnWhiff || (inReach && me.moveName() === 'dodge'))) { e.stun = 3.2; e.stunOnWhiff = false; c.hud.flash('Stunned: E to slam him'); c.sfx('grunt', 1); }
      return;
    }
    const dmg = e.T.dmg * B.dmg * (w && !B.weapon ? w.def.dmg : 1);
    me.takeHit(e, dmg, !!(B.heavy || B.down));
    const hd = _v2.set(pf.x - e.pos.x, 0, pf.z - e.pos.z).normalize().clone();
    c.fx.hit(Q.limb('head', _v).lerp(e.headPos(_v3), 0.25), hd, { heavy: B.heavy || w ? 0.7 : 0.25, color: [5.5, 1.6, 1.2] });
    c.hitStop(B.heavy || w ? 0.085 : 0.05, B.heavy ? 0.04 : 0.06); c.shake(B.heavy ? 0.7 : w ? 0.55 : 0.35, hd); if (B.heavy || w) camx.punch(0.8);
    c.hud.hurt(B.heavy ? 0.4 : w ? 0.25 : 0.1); c.combo.n = 0; c.sfx('hurt', B.heavy ? 1 : w ? 0.6 : 0);
    if (w && w.kind === 'bat') c.sfx('bat', 0.7);
    if (w && w.kind === 'bottle') { c.items.holdOn(e, w); c.items.shatter(w, hd, { neck: true }); }
    if (B.heavy) c.groundPound(_v.copy(e.pos).addScaledVector(fwd(e.yaw, _v2), 0.9 * e.scale), 0.5);
  };
  const downCbs = [];
  c.onHeroDown = () => {
    c.hud.banner('DOWN', '#EF4444');
    for (const e of c.enemies) e.cd = Math.max(e.cd, rnd(2.5, 4));
    const info = { hp: c.me.hp, enemies: c.enemies.filter((e) => e.alive).length };
    for (const cb of downCbs) { try { cb(info); } catch (err) { console.error('[combat] onDown', err); } }
    emit('down', info);
  };

  // ------------------------------------------------------------------ crews
  let crewSeq = 0;
  function wake(cr) {
    if (!cr || cr.awake) return; cr.awake = true;
    for (const e of cr.enemies) if (e.alive && e.state === 'idle') { e.set('hold'); e.engagedOnce = true; e.cd = rnd(0.8, 2.2); }
  }
  function spawnCrew({ x, z, count = 4, brute = 0, weapons = [], aggro = true, props = true } = {}) {
    if (!fightOn) c.rules = rulesNow(); // (the rules its men pick their blows by)
    if (x == null || z == null) { const f = fwd(P.heading, _v); x = P.position.x + f.x * 8; z = P.position.z + f.z * 8; }
    const crew = { id: 'crew' + (++crewSeq), enemies: [], aggro, awake: false, cleared: false, _cleared: [],
      alive() { return this.enemies.filter((e) => e.alive).length; },
      onCleared(cb) { if (this.cleared) cb(this); else this._cleared.push(cb); return this; },
      engage() { wake(this); return this; } };
    const types = [...Array(Math.max(0, count | 0)).fill('grunt'), ...Array(Math.max(0, brute | 0)).fill('brute')];
    const n = types.length, placed = [];
    // (near him, nobody is put where the car stands between them)
    const nearMe = hdist(P.position, { x, z }) < 24;
    let wi = 0;
    types.forEach((type, i) => {
      let pos = null;
      for (let k = 0; k < 24 && !pos; k++) {
        const a = (i / n) * Math.PI * 2 + rnd(-0.4, 0.4) + (k > 8 ? rnd(-1.5, 1.5) : 0), r = n <= 1 ? 0 : rnd(1.2, 2.2 + 0.25 * n) + k * 0.15;
        const q = new THREE.Vector3(x + Math.sin(a) * r, 0, z + Math.cos(a) * r);
        c.world.collide(q, 0.4); q.y = c.world.ground(q.x, q.z);
        if (placed.every((o) => hdist(o, q) > 1.1) && !(nearMe && k < 20 && carCross(q, P.position, 0.3))) pos = q;
      }
      if (!pos) { pos = new THREE.Vector3(x + rnd(-2, 2), 0, z + rnd(-2, 2)); c.world.collide(pos, 0.4); pos.y = c.world.ground(pos.x, pos.z); }
      placed.push(pos);
      const look = type === 'brute' ? 'brute' : ['a', 'b', 'c'][i % 3];
      const e = new Enemy(c, type, { pos, yaw: yawTo(pos, P.position), look, weapon: type === 'grunt' ? weapons[wi++] : null });
      e.crew = crew; crew.enemies.push(e); c.enemies.push(e);
    });
    c.crews.push(crew);
    // the street round them: cans by the curb, their empties by a wall
    if (props) { const o = props === true ? { cans: 2, bottles: 3 } : props; try { crew.props = c.items.scatter(x, z, { r0: 2.4, r1: 9, avoid: placed, ...o }); } catch (err) { console.warn('[combat] props', err); } }
    if (aggro && hdist(P.position, { x, z }) < 22) wake(crew);
    return crew;
  }
  function clearAll() {
    for (const e of c.enemies) e.dispose();
    c.enemies.length = 0; c.crews.length = 0; c.threats.length = 0; c.tokens.length = 0; c.ranged = null; c.linger = null; c.cap = null;
    c.items.clear(); c.fx.ring(null);
    c.me.reset(); c.combo.n = 0;
    if (c.lesson && c.lesson.step < LESSON.length) { c.lesson = null; c.hud.lesson(null); }
  }

  // ------------------------------------------------------------------ the director: slots, the token
  const slots = new Map();
  c.slotFor = (e) => slots.get(e) || c.playerFeet;
  function director(dt) {
    const pf = c.playerFeet;
    c.globalCd -= dt;
    for (const cr of c.crews) if (!cr.awake && cr.aggro && c.live() && cr.enemies.some((e) => e.alive && hdist(e.pos, pf) < 22)) wake(cr);
    const standing = c.enemies.filter((e) => e.alive && ['hold', 'approach', 'attack', 'stagger', 'getup', 'dazed'].includes(e.state));
    // surround him at ~3 m (a brute further out), spread round, never a slot inside a wall
    const items = standing.map((e) => { const a = Math.atan2(e.pos.x - pf.x, e.pos.z - pf.z); return { e, a, a0: a }; });
    const cap = c.cap, minSep = Math.min(Math.PI * 2 / Math.max(1, items.length), 1.2);
    for (let it = 0; it < 4; it++) for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const d = angWrap(items[j].a - items[i].a);
      if (Math.abs(d) < minSep) { const push = (minSep - Math.abs(d)) * 0.5 * (d >= 0 ? 1 : -1); items[i].a -= push; items[j].a += push; }
    }
    // (the room round him, in 16 directions, now and then: a slot goes where a wall or the car leaves him space, never
    // behind the car)
    roomT -= dt;
    if (roomT <= 0 || hdist(roomAt, pf) > 0.5) {
      roomT = 0.15; roomAt.copy(pf);
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a); room[k] = 4.8;
        for (let t = 1.0; t <= 4.8; t += 0.4) if (camx.solid(pf.x + sx * t, pf.y + 1, pf.z + sz * t)) { room[k] = t; break; }
        _v2.set(pf.x + sx * 4.8, pf.y, pf.z + sz * 4.8); const h = carHit(pf, _v2, 0.5); if (h >= 0) room[k] = Math.min(room[k], h * 4.8);
      }
    }
    items.forEach((o, i) => {
      let r = o.e.type === 'brute' ? 3.8 : 3.0 + (i % 2) * 0.7;
      if (c.me.down()) r += 1.5;
      // (pressure's circling: a man waiting his turn prowls round him further out, his slot 0.22 rad on round from where
      // he stands and, once he is out there (3.8-7 m), no more than 0.6 m in or out from him: a slot about a metre off, so he
      // side-steps at hold's 1.3 m/s facing Dan (enemy.js); one way for a few seconds, then back the other, and back at
      // once when a wall, the car or the next man along is in his way)
      const e = o.e;
      if (cap?.circle && e.state === 'hold' && !c.hasToken(e)) {
        r = Math.max(r, 4.6 + (i % 2) * 0.8);
        e.tokAt ??= c.time;
        if (!e.orbit) { e.orbit = Math.random() < 0.5 ? 1 : -1; e.orbitAt = c.time - rnd(0, 2); e.orbitFor = rnd(2.5, 5.5); }
        // (the way ahead hemmed in: a wall or the car closer than his round, and closer than where he is now)
        const dirK = (a) => Math.round(((a % TAU) + TAU) % TAU / TAU * 16) % 16, ahead = room[dirK(o.a + e.orbit * 0.5)], here = room[dirK(o.a)];
        const pushed = angWrap(o.a - o.a0) * e.orbit < -0.05, hemmed = ahead < 2.6 || (ahead < r - 1 && ahead < here - 0.3);
        const since = c.time - e.orbitAt;
        if (since > e.orbitFor || (since > 0.8 && (pushed || hemmed))) { e.orbit = -e.orbit; e.orbitAt = c.time; e.orbitFor = rnd(2.5, 5.5); }
        o.a += e.orbit * 0.22;
        const now = hdist(e.pos, pf); if (now > 3.8 && now < 7) r = now + clamp(r - now, -0.6, 0.6); // (further: he comes in at hold's pace)
      }
      let k = Math.round(((o.a % TAU) + TAU) % TAU / TAU * 16) % 16;
      _v2.set(pf.x + Math.sin(o.a) * 3.2, pf.y, pf.z + Math.cos(o.a) * 3.2);
      if (room[k] < Math.min(r, 2.6) || carHit(pf, _v2, 0.5) >= 0) { // boxed in that way (a wall, the car): round to the nearest way with room
        for (let s = 1; s <= 8; s++) { const k1 = (k + s) % 16, k2 = (k - s + 16) % 16; if (room[k1] >= 2.6) { o.a = k1 / 16 * TAU; k = k1; break; } if (room[k2] >= 2.6) { o.a = k2 / 16 * TAU; k = k2; break; } }
      }
      const d = _v.set(Math.sin(o.a), 0, Math.cos(o.a));
      for (let t = 1.2; t <= r; t += 0.4) if (camx.solid(pf.x + d.x * t, pf.y + 1, pf.z + d.z * t)) { r = Math.max(1.6, t - 0.6); break; }
      const s = slots.get(o.e) || new THREE.Vector3(); s.set(pf.x + d.x * r, pf.y, pf.z + d.z * r); slots.set(o.e, s);
    });
    if (cm.activeMode === 'car' && car && !W.cutscene) siege(standing);
    if (!c.attackable()) return;
    if (c.lesson && c.lesson.step < 3) { lessonDirector(dt, standing, pf); return; }
    // the nearest rested man with a clear way to him (with a little chance; a brute counts nearer, so he gets his turns)
    // goes; with five or more up, a second follows once the first is swinging
    const pickNext = () => {
      let best = null, bs = Infinity;
      for (const e of standing) {
        if (e.state !== 'hold' || e.cd > 0 || c.hasToken(e)) continue;
        const d = hdist(e.pos, pf); if (d > 9) continue;
        // (under a mission's pressure the man who has waited longest counts nearer too: up to 3 m after 12 s, so the
        // ones circling furthest out still get their turns)
        const sc = d + Math.random() * 2 - (e.type === 'brute' ? 2.5 : 0) - (cap ? Math.min(3, (c.time - (e.tokAt ?? c.time)) * 0.25) : 0);
        if (sc < bs && !c.lineBlocked(e.pos, pf)) { bs = sc; best = e; }
      }
      if (best) { best.chooseBlow(hdist(best.pos, pf)); best.set('approach'); best.tokAt = c.time; }
      return best;
    };
    c.standingN = standing.length;
    for (let i = c.tokens.length - 1; i >= 0; i--) { const e = c.tokens[i]; if (!e.alive || (e.state !== 'approach' && e.state !== 'attack')) c.releaseToken(e); }
    const max = Math.min(standing.length >= 5 ? 3 : standing.length >= 3 ? 2 : 1, cap ? cap.max : 9), last = c.tokens[c.tokens.length - 1];
    // (a man with a bottle hanging back throws it from where he stands, whoever has the token, one bottle in the air at a
    // time; under a mission's pressure only while fewer than cap.max are in)
    if (c.ranged && (!c.ranged.alive || (c.ranged.state !== 'approach' && c.ranged.state !== 'attack'))) c.ranged = null;
    if (!c.ranged && (!cap || c.tokens.length < cap.max) && !c.threats.some((t) => t.item) && Math.random() < 0.02) {
      const th = standing.find((e) => e.state === 'hold' && e.cd <= 0 && e.weapon?.kind === 'bottle' && !c.hasToken(e) && hdist(e.pos, pf) > 4 && hdist(e.pos, pf) < 13 && !c.lineBlocked(e.pos, pf));
      if (th) { th.atk = 'bottleThrow'; th.set('approach'); c.ranged = th; }
    }
    if (c.globalCd <= 0 && c.tokens.length < max) {
      if (!last && c.rules.pincer && standing.length >= 2 && (!cap || cap.max >= 2) && c.time > pincerT && ((pincerT = c.time + rnd(5, 9)), Math.random() < 0.6) && pincer(standing, pf)) { /* (two at once) */ }
      else if (!last) { const e = pickNext(); if (e) c.tokens.push(e); }
      else {
        // (a gang-up or not: decided once for each man who goes first)
        if (gangFor !== last) { gangFor = last; gangOn = standing.length >= 3 && Math.random() < 0.5; }
        if (gangOn || (last.state === 'attack' && last.st > 0.12)) { const e = pickNext(); if (e) { e.gang = gangOn; c.tokens.push(e); c.globalCd = 0.15; } }
      }
    }
  }
  // the pincer (the full rules): two rested grunts on either side of him (at least ~115 deg apart round him) go in
  // together, the second's blow landing 0.3 s after the first's (two yellow windows that overlap: a counter in both
  // takes both, the double counter)
  function pincer(standing, pf) {
    const ok = standing.filter((e) => e.type === 'grunt' && e.state === 'hold' && e.cd <= 0 && !c.hasToken(e) && !e.weapon && hdist(e.pos, pf) < 8 && !c.lineBlocked(e.pos, pf));
    let a = null, b = null, bs = 2.0;
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
      const d = Math.abs(angWrap(yawTo(pf, ok[i].pos) - yawTo(pf, ok[j].pos))); if (d > bs) { bs = d; a = ok[i]; b = ok[j]; }
    }
    if (!a) return false;
    for (const e of [a, b]) { e.chooseBlow(hdist(e.pos, pf)); if (BLOWS[e.atk].feint || !BLOWS[e.atk].counter) e.atk = 'thugPunch1'; e.set('approach'); e.tokAt = c.time; c.tokens.push(e); }
    b.pincer = a; a.pincer = null; c.globalCd = 0.15;
    return true;
  }
  const TAU = Math.PI * 2, room = new Array(16).fill(4.8), roomAt = new THREE.Vector3(1e9, 0, 0);
  let gangFor = null, gangOn = false, pincerT = 0;
  let roomT = 0;

  // ------------------------------------------------------------------ the lesson (Mission 1): one thing at a time
  // 0 STRIKE: three blows landed (nobody swings at him meanwhile); 1 COUNTER: one man swings a plain punch, a beat of
  // slow motion on its cue, until a counter lands (or three tries); 2 DODGE: one man's red kick, until a roll clears it
  // (or three tries); then a last word and the fight as it is. Once a session: a restart of the checkpoint picks up at
  // the step it reached
  const LESSON = [
    { key: 'strike', need: 3, title: 'STRIKE', line: '<kbd>LMB</kbd><kbd>J</kbd><span>Hit the Suits</span>' },
    { key: 'counter', need: 1, title: 'COUNTER', line: '<span>When his <b class="y">!</b> turns yellow</span><kbd>Q</kbd><kbd>L</kbd><span>Counter</span>' },
    { key: 'dodge', need: 1, title: 'DODGE', line: '<span>A red <b class="r">‼</b> can’t be countered</span><kbd>C</kbd><kbd>Space</kbd><span>Dodge</span>' },
  ];
  let lessonAt = 0, lessonEnd = 0;
  c.lesson = null;
  function lessonShow() { const L = c.lesson; if (!L) return c.hud.lesson(null); const S = LESSON[L.step]; if (S) c.hud.lesson({ step: L.step + 1, of: LESSON.length, title: S.title, line: S.line }); }
  c.lessonDone = (key, skipped = false) => {
    const L = c.lesson; if (!L || LESSON[L.step]?.key !== key) return;
    L.step++; L.n = 0; L.tries = 0; L.t = 0; lessonAt = L.step; c.globalCd = Math.max(c.globalCd, 1.1);
    if (!skipped) c.sfx('counter');
    if (L.step >= LESSON.length) { c.hud.lesson({ step: 0, of: 0, title: 'NOW TAKE THEM DOWN', line: '<span>Strike, counter on yellow, dodge the red</span>' }); lessonEnd = c.rtime + 3; }
    else lessonShow();
  };
  // (the lesson's blow: its cue held a beat in slow motion, to read it)
  c.lessonThreat = (t) => { if (!t.e.lessonBlow) return; t.e.lessonBlow = false; t.lesson = true; c.slowmo(t.lead / 0.45, 0.45, 0.25); }; // (real time: the whole cue slowed)
  function lessonTick() {
    const want = fightOn && c.rules.name === 'lesson' && lessonAt < LESSON.length;
    if (want && !c.lesson) { c.lesson = { step: lessonAt, n: 0, tries: 0, t: 0 }; lessonShow(); }
    else if (!want && c.lesson && c.lesson.step < LESSON.length) { c.lesson = null; c.hud.lesson(null); }
    if (c.lesson && c.lesson.step >= LESSON.length && c.rtime > lessonEnd) { c.lesson = null; c.hud.lesson(null); }
  }
  function lessonDirector(dt, standing, pf) {
    const L = c.lesson; L.t += dt;
    for (let i = c.tokens.length - 1; i >= 0; i--) { const e = c.tokens[i]; if (!e.alive || (e.state !== 'approach' && e.state !== 'attack')) c.releaseToken(e); }
    if (L.step === 0) { if (L.t > 16) c.lessonDone('strike', true); return; } // (nobody swings while he learns to hit)
    if (c.tokens.length || c.globalCd > 0) return;
    if (L.tries >= 3 || L.t > 25) { c.lessonDone(LESSON[L.step].key, true); return; }
    let best = null, bd = 9;
    for (const e of standing) { if (e.type !== 'grunt' || e.state !== 'hold' || e.weapon) continue; const d = hdist(e.pos, pf); if (d < bd && !c.lineBlocked(e.pos, pf)) { bd = d; best = e; } }
    if (!best) return;
    best.atk = L.step === 1 ? 'thugPunch1' : 'thugKickRed'; best.lessonBlow = true; best.set('approach'); c.tokens.push(best); L.tries++;
  }

  // ------------------------------------------------------------------ in his car, stopped, the gang round it
  // they beat on it, one at a time (a fist or a boot into its side: a thud and a shake), and after a few blows the man
  // at the driver's door drags him out onto the street. Driving off ends it (and the men in front dive or go under it)
  const S = { bangs: 0, banger: null };
  function siege(standing) {
    if (Math.abs(car.speed || 0) > 3 || c.quiet) { if (S.banger?.state === 'bang') { S.banger.set('hold'); S.banger.idle(0.25); } S.banger = null; S.bangs = 0; return; }
    if (S.banger && (S.banger.state !== 'bang' || !S.banger.alive)) S.banger = null;
    if (S.banger || c.globalCd > 0) return;
    let best = null, bd = 7;
    for (const e of standing) if (e.state === 'hold' && e.cd <= 0 && e.crew?.awake) { const d = carGap(e.pos); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    // (to the car's side nearest him; the third blow comes from the driver's door: the one who drags him out)
    const L = carLocal(best.pos.x, best.pos.z, _l1), m = 0.55;
    if (S.bangs >= 2) carWorld(CAR.hx + 0.62, 0.25, _l2);
    else if (Math.abs(L.x) / CAR.hx > Math.abs(L.z) / CAR.hz) carWorld(Math.sign(L.x || 1) * (CAR.hx + m), clamp(L.z, -CAR.hz + 0.4, CAR.hz - 0.4), _l2);
    else carWorld(clamp(L.x, -CAR.hx + 0.3, CAR.hx - 0.3), Math.sign(L.z || 1) * (CAR.hz + m), _l2);
    S.banger = best; best.bangCar(_v.set(_l2.x, best.pos.y, _l2.z), car.position);
  }
  c.onCarBang = (e) => {
    S.bangs++; c.globalCd = rnd(0.45, 0.9) * c.crowdK();
    c.sfx('wall'); c.sfx('clang', 0.35); c.shake(0.22); c.fx.dust(_v.copy(e.pos).lerp(car.position, 0.35).setY(car.position.y + 0.9), { amount: 0.25 });
    const L = carLocal(e.pos.x, e.pos.z, _l1);
    if (S.bangs >= 3 && L.x > CAR.hx && Math.abs(L.z) < 1.4 && Math.abs(car.speed || 0) < 4) {
      // dragged out: out at the door (game.js's own F) and thrown down in the street
      S.bangs = 0; S.banger = null;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' }));
      if (cm.activeMode === 'person') { c.me.takeHit(e, 6, true); c.hud.flash('Dragged out', 'danger'); c.sfx('hurt', 1); }
    } else if (S.bangs === 1) c.hud.flash('They’re on the car: drive, or get out and fight', 'danger');
  };

  // ------------------------------------------------------------------ the frame (from the camera's update)
  let fightOn = false;
  c.frame = (rdt0) => {
    const t0 = performance.now();
    const rdt = realDt(rdt0), dt = rdt * c.ts;
    c.rtime += rdt; c.time += dt; c.dt = dt; c.rdt0 = rdt0;
    // where he is: on foot, or (driving off) the car; the men gather round it, but nobody swings at a car
    c.playerFeet.copy(cm.activeMode === 'person' || !W.car ? P.position : W.car.position);
    trafficNear();
    const frozen = !!W.cutscene;
    if (!frozen && c.enemies.length) director(dt);
    for (let i = c.enemies.length - 1; i >= 0; i--) {
      const e = c.enemies[i];
      if (!frozen) e.update(dt);
      // the fallen are cleared away once he has long left them
      if (e.out && hdist(e.pos, P.position) > 90 && e.st > 15) { e.dispose(); c.enemies.splice(i, 1); }
    }
    // standing men keep apart, and off him
    for (let i = 0; i < c.enemies.length; i++) {
      const a = c.enemies[i]; if (!a.standing) continue;
      for (let j = i + 1; j < c.enemies.length; j++) {
        const b = c.enemies[j]; if (!b.standing) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = 0.85 * Math.max(a.scale, b.scale);
        if (d < m && d > 1e-4) { const k = (m - d) * 0.5 / d; a.moveXZ(-dx * k, -dz * k); b.moveXZ(dx * k, dz * k); }
      }
      if (cm.activeMode === 'person' && !P.inVehicle && c.me.moveName() !== 'slam') {
        const dx = a.pos.x - P.position.x, dz = a.pos.z - P.position.z, d = Math.hypot(dx, dz), m = 0.72 * a.scale;
        if (d < m && d > 1e-4 && Math.abs(a.pos.y - P.position.y) < 1) a.moveXZ(dx / d * (m - d), dz / d * (m - d));
      }
    }
    if (!frozen && cm.activeMode === 'car' && car) carContact(dt);
    // (a man lying in the road is shoved along by a car that comes onto him, never driven through)
    if (c.vehs.length) for (const e of c.enemies) if (e.state === 'down' || e.state === 'out' || e.state === 'getup') vehPush(e.pos, 0.85);
    for (const e of c.enemies) e.late(dt);
    c.items.update(dt);
    // (a thrown bottle's cue lasts while it flies, whatever its thrower does)
    c.threats = c.threats.filter((t) => t.at > c.time - 0.15 && (t.item ? t.item.state === 'fly' && t.item.thrower : t.e.alive && t.e.state === 'attack'));
    if (c.fx.ringOn() && !c.threats.some((t) => t.quake)) c.fx.ring(null);
    c.fx.update(dt);
    // the fight starting and ending (for the overlays and the mission team)
    const on = (c.me.fighting || c.lingering()) && c.live();
    if (on !== fightOn) { fightOn = on; if (on) c.hud.fightStarted({ lesson: c.rules.name === 'lesson' && lessonAt < LESSON.length }); else c.input.release(); emit('fight', { on }); }
    // (the rules: Mission 1's lesson or the full ones, looked up now and then, never mid-fight)
    if ((rulesT -= rdt) <= 0 && !fightOn) { rulesT = 0.5; c.rules = rulesNow(); }
    lessonTick();
    // (the street's clock this frame: the fight's in a fight (a hit-stop holds the traffic too) or a debug step)
    c.worldDt = fightOn || c.fixed ? dt : rdt0;
    // the next frame's clock (and the sound's: muffled in slow motion)
    c.ts = nextScale();
    c.sfx.slow(c.slowK);
    c.stepNow = c.fixed && c.steps > 0 ? (c.steps--, true) : false;
    c.cost += performance.now() - t0; c.frames++;
  };
  c.afterCamera = (rdt) => {
    const t0 = performance.now();
    c.hud.update(c.fixed ? 1 / 60 : rdt, { threats: c.threats, fighting: fightOn, onFoot: cm.activeMode === 'person' && !P.inVehicle, cutscene: !!W.cutscene });
    c.cost += performance.now() - t0;
  };

  // ------------------------------------------------------------------ the traffic near him, as boxes
  const TV = [...(app.trafficSystem?.cars || []), ...(app.trafficSystem?.buses || [])], vehPool = [];
  function trafficNear() {
    c.vehs.length = 0;
    if (!c.enemies.length && !c.cameraWants()) return;
    const q = c.playerFeet;
    for (const v of TV) {
      if (!v.edge || Math.abs(v.x - q.x) > 28 || Math.abs(v.z - q.z) > 28) continue;
      const o = vehPool[c.vehs.length] || (vehPool[c.vehs.length] = {});
      o.x = v.x; o.z = v.z; o.y = 0; o.cs = Math.cos(v.yaw); o.sn = Math.sin(v.yaw); o.hx = v.halfWidth || 0.95; o.hz = v.half || 2.3; o.top = v.bus ? 3.2 : Math.max(1.6, (v.roof || 1.45) + 0.1); o.v = v; // (a van stands taller)
      c.vehs.push(o);
    }
  }

  // ------------------------------------------------------------------ Dan's car against the Suits
  // driven into a man on his feet he is thrown (the faster, the further and the harder: a car beats a brute's armour
  // too); one standing in its way with a moment to see it coming dives aside; slow, the car just shoves them (and the
  // men lying in the street) out of its way. Any of it brings his crew in
  function carContact(dt) {
    const sp = Math.abs(car.speed || 0), sg = Math.sign(car.speed || 0) || 1;
    for (const e of c.enemies) {
      if (e.state === 'knock' || e.state === 'grabbed') continue;
      const L = carLocal(e.pos.x, e.pos.z, _l1), r = 0.32 * e.scale, up = e.standing || e.state === 'getup';
      // (coming at him: a dive out of the way, when he sees it in time)
      const ahead = L.z * sg - CAR.hz;
      if (up && sp > 6 && ahead > 0 && ahead / sp < 0.45 && Math.abs(L.x) < CAR.hx + 0.6 && !(e.diveT > c.time - 2)) {
        e.diveT = c.time; wake(e.crew);
        if (e.state !== 'attack' && Math.random() < (Math.abs(L.x) > CAR.hx * 0.5 ? 0.5 : 0.3)) {
          const side = Math.sign(L.x) || (Math.random() < 0.5 ? -1 : 1);
          e.dive(_v.set(Math.cos(car.heading) * side, 0, -Math.sin(car.heading) * side)); // (the car's own side his way)
          continue;
        }
      }
      if (Math.abs(L.x) >= CAR.hx + r || Math.abs(L.z) >= CAR.hz + r) continue;
      if (up && sp > 2.8) {
        // run down: thrown along the way the car goes, off to the side he stood on
        const fx = Math.sin(car.heading) * sg, fz = Math.cos(car.heading) * sg, side = Math.sign(L.x) || 1;
        const rx = Math.cos(car.heading) * side, rz = -Math.sin(car.heading) * side;
        const dir = _v.set(fx + rx * 0.45, 0, fz + rz * 0.45).normalize();
        const dead = e.runOver(dir, sp);
        wake(e.crew);
        c.fx.hit(e.chest(_v2), _v3.copy(dir).negate(), { heavy: 0.9, color: [3.5, 3.5, 3.8] });
        c.sfx('body', 1); c.sfx('wall'); if (Math.random() < 0.7) c.sfx('grunt', 0.8);
        c.shake(clamp(0.25 + sp * 0.02, 0.3, 0.8), dir); c.hitStop(sp > 12 ? 0.07 : 0.04, 0.1);
        car.speed *= e.type === 'brute' ? 0.7 : 0.86;
        c.combo.n++;
        if (dead) c.hud.flash(['Roadkill', 'Hit and run', 'Bumpered'][Math.floor(Math.random() * 3)]);
        emit('hit', { enemy: e, kind: 'car', dmg: 0, weapon: 'car' });
      } else {
        // slow (or a man lying there): shoved out of its way
        const hx = CAR.hx + r, hz = CAR.hz + r;
        let nx = L.x, nz = L.z; if (hx - Math.abs(L.x) < hz - Math.abs(L.z)) nx = Math.sign(L.x || 1) * hx; else nz = Math.sign(L.z || 1) * hz;
        carWorld(nx, nz, _l2); e.pos.x = _l2.x; e.pos.z = _l2.z; c.world.collide(e.pos, r);
        if (up && sp > 0.8) wake(e.crew);
      }
    }
  }

  // ------------------------------------------------------------------ the traffic round a fight
  // (js/traffic.js brakes for the player only: here its cars and buses are made to brake for every man in the fight
  // too, standing or lying in the road, and for a trash can in it; and they run on the fight's clock, so a hit-stop or
  // a slow motion holds the street as well. Wrapped at run time, like the camera)
  const TS = app.trafficSystem;
  if (TS && TS.update && !TS._wagmiFight) {
    TS._wagmiFight = true;
    const orig = TS.update.bind(TS), vehicles = [...(TS.cars || []), ...(TS.buses || [])], obst = [];
    let hornT = 0;
    TS.update = function (dt, ...rest) {
      try { brakeFor(dt); } catch (err) { console.warn('[combat] traffic', err); }
      const w = c.worldDt != null && (fightOn || c.fixed) ? Math.max(1e-4, c.worldDt) : dt; // (never 0: it divides by it)
      return orig(w, ...rest);
    };
    // (a point `ahead` m on and `lat` m to the right of a vehicle: on the arc of curvature k it drives, w m either side)
    const onArc = (ahead, lat, k, w) => Math.abs(k) > 1e-3 && ahead < 1.3 / Math.abs(k) && Math.abs(Math.hypot(ahead, lat - 1 / k) - 1 / Math.abs(k)) <= w;
    // the people on the sidewalks near a fight run from it, along their own way, and come back to a walk after it
    const peds = TS.peds || [];
    function flee() {
      const q = P.position, on = fightOn && cm.activeMode === 'person';
      for (const p of peds) {
        if (!p.placed) { if (p._flee) { p.speed = p._flee; p._flee = 0; } continue; }
        const dx = p.x - q.x, dz = p.z - q.z, d = Math.abs(dx) + Math.abs(dz);
        if (on && d < 20 && Math.hypot(dx, dz) < 16) {
          if (!p._flee) { p._flee = p.speed; p.speed = 3.4 + Math.random() * 1.2; p.pause = 0; }
          p.dir = dx * p.ux + dz * p.uz >= 0 ? 1 : -1;
        } else if (p._flee && (!on || d > 36)) { p.speed = p._flee; p._flee = 0; }
      }
    }
    function brakeFor(dt) {
      hornT -= dt;
      flee();
      obst.length = 0;
      const q = P.position;
      for (const e of c.enemies) if (hdist(e.pos, q) < 70) obst.push({ x: e.pos.x, z: e.pos.z, r: e.state === 'down' || e.state === 'out' || e.state === 'knock' ? 0.9 : 0.4 });
      for (const I of c.items.list) if (I.kind === 'trashcan' && !I.holder && hdist(I.obj.position, q) < 70) obst.push({ x: I.obj.position.x, z: I.obj.position.z, r: 0.45 });
      if (fightOn && cm.activeMode === 'person') obst.push({ x: q.x, z: q.z, r: 0.4 });
      if (!obst.length) return;
      for (const v of vehicles) {
        if (!v.edge || !(v.speed > 0.02) || Math.abs(v.x - q.x) > 80 || Math.abs(v.z - q.z) > 80) continue;
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); let gap = Infinity;
        // where it is going: straight on, round the bend it is already in (its turn rate), and at a corner the turn it
        // signals (curvatures, + to its right)
        const k1 = -(v.yawRate || 0) / Math.max(1, v.speed), k2 = v.blink && (v.conn || (v.edge.len || 99) - (v.s || 0) < 16) ? v.blink / 9 : 0;
        for (const o of obst) {
          const dx = o.x - v.x, dz = o.z - v.z, ahead = dx * fx + dz * fz; if (ahead <= 0 || ahead > 45) continue;
          const lat = dz * fx - dx * fz, w = (v.halfWidth || 0.9) + o.r + 0.45;
          if (Math.abs(lat) > w && !onArc(ahead, lat, k1, w) && !onArc(ahead, lat, k2, w)) continue;
          gap = Math.min(gap, ahead - v.half - o.r - 1.4);
        }
        if (gap === Infinity) continue;
        // stopping short of him, braking hard if it must (a lean on the horn when it's close)
        const cap = Math.sqrt(2 * 6 * Math.max(0, gap));
        if (v.speed > cap) {
          const was = v.speed; v.speed = Math.max(cap, v.speed - 14 * Math.max(dt, 1 / 120));
          // (one horn now and then, from a car that has to stop hard: owner, 28 Oct, less honking)
          if (was > 6 && hornT <= 0 && !(v.honkT > c.rtime) && hdist(v, q) < 30) { hornT = 12; v.honkT = c.rtime + 30; c.sfx('horn', clamp(1 - hdist(v, q) / 40, 0.2, 1)); }
        }
      }
    }
  }
  // (into the car mid-fight, GTA style: F gets him in unless a blow is about to land on him (0.4 s) or he is down; in
  // the car the gang beats on it and drags him out, see bangCar)
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || !c.live()) return;
    const soon = c.threats.some((t) => !t.item && t.at - c.time < 0.4 && t.at - c.time > -0.08 && hdist(t.e.pos, P.position) < t.e.blowRange() + 1.4);
    if (soon || c.me.down() || c.me.moveName() === 'slam') { e.stopImmediatePropagation(); c.hud.flash(c.me.down() ? 'Get up first' : 'Not with him on you', 'danger'); c.sfx('deny'); }
  }, true);

  // ------------------------------------------------------------------ the pipelines compiled up front (no hitch at the first spawn)
  try {
    const probe = new Enemy(c, 'grunt', { pos: P.position.clone().setY(P.position.y - 40), look: 'b' });
    for (const m of c.fx.meshes) m.visible = true;
    await app.renderer.compileAsync(probe.root, c.camera, scene);
    for (const m of c.fx.meshes) await app.renderer.compileAsync(m, c.camera, scene);
    for (const m of c.fx.meshes) m.visible = false;
    probe.dispose();
  } catch (err) { console.warn('[combat] precompile', err); }

  // ------------------------------------------------------------------ the API
  const api = W.combat = {
    spawnCrew, clear: clearAll, dressSuit: (obj, look = 'a') => c.dressSuit(obj, look, true),
    props: (x, z, o = {}) => c.items.scatter(x, z, o),
    get enabled() { return c.enabled; }, set enabled(v) { c.enabled = !!v; if (!v) { c.me.reset(); c.input.clear(); } },
    // a mission's hold on a big fight (see the top); null lets go. Returns what is set
    pressure(o) { c.cap = o ? { max: Math.max(1, o.max ?? 2), circle: !!o.circle, calm: !!o.calm } : null; return c.cap; },
    get fighting() { return c.me.fighting && c.live(); },
    get enemies() { return c.enemies; },
    get crews() { return c.crews; },
    player: {
      get hp() { return c.me.hp; }, set hp(v) { c.me.hp = clamp(+v || 0, 0, c.me.maxHp); },
      get maxHp() { return c.me.maxHp; }, set maxHp(v) { c.me.maxHp = Math.max(1, +v || 100); },
      get down() { return c.me.down(); },
      onDown(cb) { downCbs.push(cb); return () => { const i = downCbs.indexOf(cb); if (i >= 0) downCbs.splice(i, 1); }; },
      get autoGetUp() { return c.player.autoGetUp; }, set autoGetUp(v) { c.player.autoGetUp = !!v; },
      get downTime() { return c.player.downTime; }, set downTime(v) { c.player.downTime = +v; },
      get getUpHp() { return c.player.getUpHp; }, set getUpHp(v) { c.player.getUpHp = +v; },
      getUp(hp) { c.me.getUp(hp); },
    },
    on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
    items: c.items,
    debug: {
      c,
      press(a) { c.input.press(a); },
      fixed(on = true) { c.fixed = !!on; c.steps = 0; c.stepNow = false; },
      step(n = 1) { c.steps += n; },
      slow(k = 1) { c.debugScale = k; },
      quiet(on = true) { c.quiet = !!on; },
      // the rules pinned ('lesson' | 'full'), or null: by the mission again; lesson(step) restarts the lesson there
      rules(name) { rulesPin = RULES[name] || null; c.rules = rulesNow(); return c.rules.name; },
      lesson(step = 0) { lessonAt = step; c.lesson = null; },
      view(o) { camx.debugView(o); },
      spawn(type = 'grunt', dist = 3, deg = 0, o = {}) {
        const a = P.heading + deg * Math.PI / 180, pos = new THREE.Vector3(P.position.x + Math.sin(a) * dist, 0, P.position.z + Math.cos(a) * dist);
        c.world.collide(pos, 0.4); pos.y = c.world.ground(pos.x, pos.z);
        let crew = c.crews.find((x) => x.id === 'debug'); if (!crew) { crew = spawnCrew({ x: pos.x, z: pos.z, count: 0, props: false }); crew.id = 'debug'; }
        const e = new Enemy(c, type, { pos, yaw: yawTo(pos, P.position), look: o.look, weapon: o.weapon });
        e.crew = crew; crew.enemies.push(e); c.enemies.push(e); crew.cleared = false;
        if (o.idle) e.set('idle'); else { e.set('hold'); e.engagedOnce = true; crew.awake = true; }
        return c.enemies.length - 1;
      },
      hp(n = 100) { c.me.hp = n; }, meter(n = 1) { c.me.meter = n; },
      // an item in Dan's hands at once; one set down dist m ahead (deg off his heading)
      give(kind = 'bat', look) { if (c.me.holding) c.items.remove(c.me.holding); const I = c.items.make(kind, look); c.items.give(c.me, I); return I; },
      prop(kind = 'bat', dist = 1.5, deg = 0, o = {}) { const a = P.heading + deg * Math.PI / 180; return c.items.place(kind, P.position.x + Math.sin(a) * dist, P.position.z + Math.cos(a) * dist, o); },
      arm(i, kind = 'bat') { const e = c.enemies[i]; if (!e) return null; if (e.weapon) c.items.remove(e.weapon); return c.items.arm(e, kind); },
      move(name, ...a) { return c.me.debugStart(name, ...a); },
      cost() { const r = { msPerFrame: +(c.cost / Math.max(1, c.frames)).toFixed(3), frames: c.frames }; c.cost = 0; c.frames = 0; return r; },
      state() {
        return { t: +c.time.toFixed(2), ts: +c.ts.toFixed(2), fighting: c.me.fighting, move: c.me.moveName(), hp: Math.round(c.me.hp), meter: +c.me.meter.toFixed(2), combo: c.combo.n,
          holding: c.me.holding ? c.me.holding.kind + ':' + c.me.holding.hits : null, items: c.items.list.length,
          pos: [+P.position.x.toFixed(2), +P.position.y.toFixed(2), +P.position.z.toFixed(2)], heading: +P.heading.toFixed(2), contact: c.me.contact,
          rules: c.rules.name, lesson: c.lesson ? c.lesson.step : null, threats: c.threats.length, enemies: c.enemies.map((e) => `${e.type[0]}:${e.state}:${Math.max(0, Math.round(e.hp))}@${hdist(e.pos, P.position).toFixed(2)}`).join(' ') };
      },
    },
  };
  console.log('[wagmi] combat is in');

  // ------------------------------------------------------------------ ?fight: on foot, a crew in front
  if (new URLSearchParams(location.search).has('fight')) {
    (async () => {
      while (!app.ready) await sleep(100);
      await sleep(300);
      if (cm.activeMode === 'car') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' }));
      await sleep(250);
      const f = fwd(P.heading, new THREE.Vector3());
      spawnCrew({ x: P.position.x + f.x * 7, z: P.position.z + f.z * 7, count: 4, brute: 1, weapons: ['bat', 'bottle'], props: { cans: 2, bottles: 3, bats: 1 } });
      c.items.scatter(P.position.x, P.position.z, { cans: 1, bottles: 2, bats: 1, r0: 1.5, r1: 5 });
    })();
  }
  return api;
}
