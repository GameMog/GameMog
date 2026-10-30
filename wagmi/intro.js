// Mog City: the opening cutscene and the first mission's start. Installed by game.js.
// ?nointro: no cutscene, no mission: the game as it starts today, but on foot beside the car.
// ?m1=car|drive|fight|search: Mission 1 from that checkpoint (no cutscene).   ?nogate: no start gate (captures).
//
// The opening, E 37th St at golden hour (docs/STORY.md; Mr. Big's call in it), 81 s:
//   1 aerial over Murray Hill to the Empire State: Murray Hill      2 E 37th St from the Madison end
//   3 the door: Dan comes out on his phone, his laptop bag on him  4 the comments; low on the bag at his hip, him over it
//   5 the van turns in from Madison, tyres screaming                 6 behind Dan: the door rips open, the Suits come on
//   7 over Knox's shoulder: 'Sign my form?'                          8 Hooks rips the bag off Dan and runs it to the van
//   9 Dan lunges; Knox shoves him down                               10 the van tears off toward 5th Ave
//  11 on the pavement, the phone buzzing; up; a video call: Mr. Big in his study (a medium, a lonely wide, him full frame, over the
//     shoulder onto the phone); the tracker: his laptop is moving; 'Okay. You framed the wrong guy.'
//  12 he turns to his car: ACT I · FALL GUY / BAGGED; the chase camera, the bars out, control.
// Hold Space or Enter to skip. Set pieces: the door (kept), Dan's laptop bag (buildBag: the evidence, the tracker in its
// lining), the van (wagmi/van.js), Knox and Hooks (thug.glb, dressed by the fight's dressSuit: JPBank security's dark
// suits and glasses), Dan's phone (its screen drawn live), the street's extras and parked cars. (Moon, wagmi/moon.js, is
// built with the cast for the missions: their dog lives with Jane and is never in the opening.)
import * as THREE from 'three/webgpu';
import { loadGLB } from './glb.js';
import { relaxArms } from './combat/suitarms.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildMoon, buildLeash } from './moon.js';
import { buildVan } from './van.js';
import { createUI } from './mission/ui.js';
import { createAudio } from './mission/audio.js';
import { createMrBig } from './mission/mrbig.js';
import { createDirector, keys, angleKeys, spline, travel, rig, odometer, masked, handheld, clamp, smooth, lerp, ease, shotAspect, shotFov } from './mission/cine.js';
import { createFace } from './face.js';
import { createTrailer } from './trailer.js';

const Q = new URLSearchParams(location.search);
const PI = Math.PI;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// the marks (docs/STORY.md: his door on E 37th St, his car at the curb)
export const MARK = {
  door: [112, 0.22, 387.5], car: [88, 0, 394.4, -PI / 2], dan: [109, 0.22, 390.8, -PI / 2], vanStop: [116, 0, 394.6, -PI / 2],
};
// the speakers' colours
const WHITE = '#FFFFFF', ACID = '#B6FF3B', BLUE = '#6CB8FF', YELLOW = '#FFC93C';

export async function install(W) {
  // Dan's face (wagmi/face.js, 23 Oct round 3): his mouth with his own lines, blinks, his eyes on whom he talks to
  // (W.dan.face), from the first frame of the opening through every mission
  if (W.dan && !W.dan.face) W.dan.face = createFace(W, { speaker: 'Dan', inner: W.dan.body, bones: W.dan.bones, hair: true, open: 0.42 });
  // (the sandbox's mode keys 1-4 are for the developers: F gets in and out of the car)
  // (not while the stall help is up: its options are on the number keys, and it keeps the city's from them itself)
  addEventListener('keydown', (e) => { if (/^Digit[1-4]$/.test(e.code) && !Q.has('sandbox') && !document.body.classList.contains('wg-offering')) e.stopImmediatePropagation(); }, true);
  // (?m2= and ?m3= start their missions straight in, as ?nointro: mission/m2.js, m3.js)
  if (Q.has('nointro') || Q.get('m2') || Q.get('m3')) {
    document.getElementById('wg-boot')?.remove(); outBesideCar(W);
    // (the city can still pick its own start, in the car, after this: out beside it again once the city is up)
    if (Q.has('nointro') && !Q.get('m2') && !Q.get('m3')) (async () => { for (let i = 0; i < 600 && !W.app.ready; i++) await new Promise((r) => setTimeout(r, 100)); if (W.app.controllerManager.activeMode !== 'person') outBesideCar(W); })();
    return;
  }
  const ui = (W.ui = createUI()), sfx = (W.sfx = createAudio());
  // (the sandbox's HUD out at once, before any frame of it shows under the gate; the boot veil, index.html, holds the
  // key art over the city until the gate is up)
  if (!Q.get('m1') && !Q.has('nogate')) document.body.classList.add('wg-gating'); else ui.bootOff();
  // story mode from the first frame: the sandbox's toolbar, telemetry and default route put away (not after the blend)
  ui.story(true); document.body.classList.add('wg-onfoot'); W.app.mapSystem.waypoint = null; W.app.mapSystem.onTeleport = null;
  W.set = dressSet(W);
  const m1 = await import('./mission/m1.js');
  // (on foot by his door from the start, out of sight: the game's 'F · Get out' prompt has no business over the gate)
  if (!Q.get('m1')) { place(W, { dan: [112, 386.7, 0] }); W.person.mesh.visible = false; }
  if (Q.get('m1')) { await m1.start(W, { at: Q.get('m1') }); return; }
  // (the trailer game.js made as soon as Dan was in, its music coming down since: WAGMI.trailerEarly, let go here so
  // its sound goes with W.trailer once played)
  const early = W.trailerEarly ? await W.trailerEarly : undefined; W.trailerEarly = null;
  // the start gate: up the moment the city is on screen, whatever else is still loading (the key also unlocks the sound)
  // (with a saved game: CONTINUE or NEW GAME on it, mission/m3-save.js). On the instant title (index.html) it is up at
  // once, while the city still loads: a start made before it is ready waits for it, and the trailer follows by itself
  // (onStart in the tap, or at once for a start the title kept: the mixer's context, made then or handed the one the
  // title's tap woke, index.html, and the opening's)
  const save = Q.has('nogate') ? null : await import('./mission/m3-save.js').then((m) => (m.readSave() ? m : null)).catch(() => null);
  // (a first visit's start: 'Starting…' stays on the gate until the cold open can run at once, rather than a black
  // screen while its music still comes down: hold, set below once the opening's cast is under way)
  let roll = null;
  const gateOpts = { when: () => W.app.ready, onStart: () => { window.mcStat?.('start'); W.audio?.unlock?.(); sfx.unlock(); }, hold: () => roll?.() ?? null, fine: 'Community entertainment project. Have fun!' };
  const gate = Q.has('nogate') ? null : save ? save.saveGate(ui, gateOpts) : ui.gate(gateOpts);
  // the cold open (wagmi/trailer.js; ?trailer=0 leaves it out): its music fetched from when Dan is in (game.js), black
  // on the tap once it can play, played on this set before the opening
  W.trailer = gate ? (early !== undefined ? early : createTrailer(W)) : null;
  if (W.trailer) gate.then((r) => { if (r !== 'continue') W.trailer.cover(); });
  // the first shot's camera and the bars from now on, while the cast is built behind the loading screen
  const hold = createDirector(W); hold.camera = { pos: [260, 140, 250], look: [-80, 172, 686], fov: 50, band: false }; hold.take(); ui.cine(true);
  W._holdCam = hold;
  const castP = castOpening(W);
  // (the gate's hold, ui.js: the opening's cast built and the trailer's music in, or 15 s on (the trailer then waits up to
  // 8 s more for it on black, and plays without it after that); nothing to hold for once both are in, with ?trailer=0
  // or on a saved game's gate)
  if (W.trailer && !save) {
    const tr = W.trailer; let castIn = false, soundIn = false;
    castP.then(() => { castIn = true; }, () => { castIn = true; }); tr.soundP.then(() => { soundIn = true; });
    roll = () => (castIn && soundIn ? null : Promise.all([castP, Promise.race([tr.soundP, sleep(15000)])]).catch(() => null));
  }
  // (Continue: free roam on foot by the next mission's blip, no opening; the cast still builds, for the missions)
  if (save && (await gate) === 'continue') { castP.catch(() => {}); await save.resume(W, hold); return; }
  const cast = await castP;
  W.intro = cast.api;
  await cast.run(gate);
  await m1.start(W, { at: 'car', fromIntro: true });
}

// out of the car at its driver's door (its left), facing the way it does, on foot
export function outBesideCar(W) {
  const app = W.app, cm = app.controllerManager, car = W.car, p = W.person, h = car.heading, side = 1.75;
  p.position.set(car.position.x + Math.cos(h) * side, 0, car.position.z - Math.sin(h) * side);
  p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');
  p.heading = h; p.inVehicle = false; p.mesh.visible = true; p.verticalVel = 0; p.speed = 0;
  car.speed = 0;
  app.selectMode('person');
}

// park the car (x, z, heading) and put Dan on foot at (x, z, heading)
export function place(W, { car, dan }) {
  const cm = W.app.controllerManager, c = W.car, p = W.person;
  if (car) {
    c.position.set(car[0], 0, car[1]); c.heading = car[2]; c.speed = 0; c.vx = c.vz = c.angularVel = c.steerAngle = 0;
    c.mesh.position.copy(c.position); c.mesh.rotation.y = c.heading;
  }
  if (dan) {
    if (cm.activeMode !== 'person') W.app.selectMode('person');
    p.position.set(dan[0], cm.getGroundHeight(dan[0], dan[1], 'person'), dan[1]); p.heading = dan[2];
    p.inVehicle = false; p.mesh.visible = true; p.speed = 0; p.verticalVel = 0;
    p.mesh.position.copy(p.position); p.mesh.rotation.y = p.heading;
  }
}

/* ------------------------------------------------------------- the set -- */
// Dan's front door: the ground floor is shop glazing, so a dark door set in a frame, a black canopy over it, a step,
// a warm lobby behind. The door swings out (set.door(0..1)).
function dressSet(W) {
  const scene = W.app.scene, [x, y, z] = MARK.door;
  const g = new THREE.Group(); g.name = 'wagmi-dan-door'; g.position.set(x, y, z); scene.add(g);
  const black = new THREE.MeshStandardMaterial({ color: '#16171A', roughness: 0.55, metalness: 0.4 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#1B1D21', roughness: 0.4, metalness: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: '#C9A453', roughness: 0.3, metalness: 0.9 });
  const lobby = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const t = c.getContext('2d');
    const gr = t.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#5A4128'); gr.addColorStop(0.45, '#2C2016'); gr.addColorStop(1, '#0D0A08');
    t.fillStyle = gr; t.fillRect(0, 0, 64, 128); t.fillStyle = 'rgba(255,214,150,0.55)'; t.fillRect(20, 8, 24, 3);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  })();
  const box = (w, h, d, m, px, py, pz, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b; };
  // the frame round the opening, the lobby in it
  box(0.14, 2.62, 0.16, black, -0.72, 1.31, 0.06); box(0.14, 2.62, 0.16, black, 0.72, 1.31, 0.06); box(1.58, 0.16, 0.16, black, 0, 2.58, 0.06);
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 2.52), new THREE.MeshStandardMaterial({ map: lobby, emissive: '#FFFFFF', emissiveMap: lobby, emissiveIntensity: 0.5, roughness: 1 }));
  inside.position.set(0, 1.26, 0.03); g.add(inside);
  // the door: a leaf hinged on the west side, a tall narrow window, a brass pull
  const hinge = new THREE.Group(); hinge.position.set(-0.65, 0, 0.07); g.add(hinge);
  box(1.3, 2.5, 0.05, leafMat, 0.65, 1.25, 0, hinge);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#0C0E12', roughness: 0.08, metalness: 0.2, clearcoat: 1 });
  box(0.34, 1.5, 0.012, glass, 0.65, 1.45, 0.03, hinge);
  box(0.03, 0.42, 0.03, brass, 1.12, 1.05, 0.06, hinge);
  // a step, the canopy on two rods, the number
  box(1.9, 0.07, 0.42, new THREE.MeshStandardMaterial({ color: '#8A8580', roughness: 0.85 }), 0, 0.035, 0.21);
  box(2.0, 0.09, 1.15, black, 0, 2.86, 0.58);
  for (const sx of [-0.85, 0.85]) { const r = box(0.025, 0.025, 1.25, black, sx, 3.18, 0.6); r.rotation.x = 0.46; }
  const num = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const t = c.getContext('2d'); t.fillStyle = '#C9A453'; t.font = '700 44px "Barlow Condensed", sans-serif'; t.textAlign = 'center'; t.fillText('214', 64, 48); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex; })();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshStandardMaterial({ map: num, transparent: true, roughness: 0.4, metalness: 0.6 }));
  plate.position.set(0, 2.96, 1.16); plate.rotation.x = 0; g.add(plate);
  return { group: g, door(k) { hinge.rotation.y = -1.45 * clamp(k); } };
}

// The street's life while the traffic is held off it: cars parked along the south curb east of the action (out of the
// chase camera's view when play starts, so they can go), and a few people on the far sidewalk, two of whom stop and
// back away from the grab. People are the city's own (PersonCrowd / PersonRig), walked by the scene.
function dressStreet(W) {
  const scene = W.app.scene, N = window.NYC;
  const cars = [];
  if (N.buildCarGeometry && N.BODY_SPECS && N.createLoftedCarMaterial) {
    for (const [kind, x, col] of [['sedan', 133.6, 0x1c2026], ['suv', 140.3, 0xbec6cf]]) {
      const spec = N.BODY_SPECS[kind]; if (!spec) continue;
      const m = new THREE.Mesh(N.buildCarGeometry(spec, true), N.createLoftedCarMaterial(spec, col));
      m.position.set(x, 0, 402.75); m.rotation.y = -PI / 2; m.castShadow = true; m.receiveShadow = true; m.visible = false; m.name = 'wagmi-parked';
      scene.add(m); cars.push(m);
    }
  }
  // the extras: [x0, z, speed (+ east), start, female, seed] walking the far sidewalk; the first two are a couple
  // who stop at the grab, turn to it and back off a step
  const people = [];
  let crowd = null;
  if (N.PersonCrowd && N.PersonRig) {
    crowd = new N.PersonCrowd(8, { farDistance: 40 });
    for (const m of crowd.meshes) { m.visible = false; scene.add(m); }
    const spec = [
      { x0: 74, z: 406.6, v: 1.22, female: true, seed: 3.1, watch: true },
      { x0: 73.1, z: 407.3, v: 1.22, female: false, seed: 5.7, watch: true },
      { x0: 152, z: 406.9, v: -1.05, female: false, seed: 8.2, watch: true, at: 121.5 },
      { x0: 48, z: 407.1, v: -1.15, female: true, seed: 11.9 },
      { x0: 119, z: 389.3, v: 1.3, female: false, seed: 17.3, until: 24 },     // under the crane in shot 2, away to Madison
      { x0: 152.5, z: 406.0, v: -1.2, female: true, seed: 21.4, watch: true, at: 114.5 },
      { x0: 94.5, z: 388.5, v: 1.35, female: true, seed: 26.6, from: 52, until: 61.3 }, // behind him in the lonely wide
    ];
    for (const s of spec) people.push({ ...s, rig: new N.PersonRig({ seed: s.seed, female: s.female, scale: s.female ? 0.93 : 1.0, girth: 0.95 + (s.seed % 1) * 0.2, hair: s.female ? 1 : 0.2 }) });
  }
  const ground = () => 0.22;
  let shown = false;
  return {
    meshes: [...cars, ...(crowd ? crowd.meshes : [])],
    show(on) { shown = on; for (const m of cars) m.visible = on; if (crowd) for (const m of crowd.meshes) m.visible = on; },
    // the extras at scene time t (dt: the frame's step; seek: placed, not walked)
    update(t, dt, seek, cam) {
      if (!crowd || !shown) return;
      crowd.begin();
      for (const p of people) {
        // walking from t = 5; the watchers stopped by the grab (or where they meant to stop), turned to it (north),
        // backing off a step; on their way again at 52
        if ((p.from && t < p.from) || (p.until && t > p.until)) continue;
        const walkX = (tt) => p.x0 + p.v * Math.max(0, tt - (p.from || 5));
        let x = walkX(t), z = p.z, h = p.v > 0 ? PI / 2 : -PI / 2;
        if (p.watch) {
          const tStop = p.at != null ? Math.min(33.9, (p.from || 5) + (p.at - p.x0) / p.v) : 33.9;
          if (t > tStop) {
            x = walkX(tStop);
            const k = smooth((t - 34.3) / 0.6) * (1 - smooth((t - 52) / 1.2)), back = smooth((t - 35.0) / 1.4) * 0.8;
            h = h + ((p.v > 0 ? PI : -PI) - h) * k; z = p.z + back;
            if (t > 52.6) x += p.v * (t - 52.6);
          }
        }
        if (x < -20 || x > 175) continue;
        p.rig.update(seek ? 0.0001 : Math.max(1e-4, dt), x, z, h, ground, p, 0, true);
        crowd.add(p.rig, cam ? Math.hypot(x - cam[0], z - cam[2]) : 0);
      }
      crowd.end();
    },
  };
}

/* ------------------------------------------------------------ the cast -- */
// Everyone the mission's scenes need, built once (W.cast): Dan's laptop bag, the van, Dan's phone, the Suits (Knox,
// Hooks, Tank, Brick: cast keys knox, hooks, tank and brick), the street's extras, Dan's clips for scenes (qRig), and Moon
// and her lead (never in the opening: Mission 2's meet has them with Jane).
export function getCast(W) { return W._castP || (W._castP = buildCast(W)); }

// Dan's phone: a dark slab with a screen drawn live (the feed, a call coming in, the tracker's map); on the video call
// Mr. Big's study itself, drawn into a texture (feed: mission/mrbig.js)
function buildPhone(feed) {
  const phone = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.152, 0.009), new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.35, metalness: 0.6 }));
  const c = document.createElement('canvas'); c.width = 144; c.height = 304; const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.35, 1.35, 1.35) });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.144), scrMat);
  scr.position.z = 0.0048; phone.add(body, scr);
  // (a render target's texture is upside down to a plane's uvs: the plane's v flipped)
  const vidGeo = new THREE.PlaneGeometry(0.066, 0.144); { const uv = vidGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
  const vid = feed ? new THREE.Mesh(vidGeo, new THREE.MeshBasicMaterial({ map: feed, color: new THREE.Color(1.3, 1.3, 1.3) })) : null;
  if (vid) { vid.position.z = 0.0049; vid.visible = false; phone.add(vid); }
  phone.vid = vid;
  const W0 = c.width, H0 = c.height;
  const rr = (px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); x.fill(); };
  const DRAW = {
    off() { x.fillStyle = '#040506'; x.fillRect(0, 0, W0, H0); },
    feed() {
      x.fillStyle = '#0E1118'; x.fillRect(0, 0, W0, H0);
      x.fillStyle = '#fff'; x.font = '800 17px "Barlow Condensed", sans-serif'; x.fillText('@dan', 12, 40);
      x.fillStyle = 'rgba(255,255,255,.45)'; x.font = '600 10px "Barlow Condensed", sans-serif'; x.fillText('COMMENTS · 18.4K', 12, 54);
      ['#EF4444', '#FFC93C', '#B6FF3B', '#EF4444', '#6CB8FF', '#EF4444'].forEach((col, i) => {
        const y = 68 + i * 38; x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(10, y - 4, W0 - 20, 1);
        x.fillStyle = col; x.beginPath(); x.arc(22, y + 13, 9, 0, PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,.5)'; rr(38, y + 3, 44 + (i * 17) % 30, 6, 3);
        x.fillStyle = i % 2 ? '#fff' : '#FF8A8A'; rr(38, y + 15, 60 + (i * 29) % 40, 8, 4);
      });
    },
    incoming() {
      const g = x.createLinearGradient(0, 0, 0, H0); g.addColorStop(0, '#3C8E66'); g.addColorStop(0.55, '#1A4A36'); g.addColorStop(1, '#0B1F17');
      x.fillStyle = g; x.fillRect(0, 0, W0, H0);
      x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.arc(W0 / 2, 86, 26, 0, PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '800 30px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('?', W0 / 2, 97);
      x.fillStyle = '#fff'; x.font = '800 20px "Barlow Condensed", sans-serif'; x.fillText('UNKNOWN', W0 / 2, 140);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '600 11px "Barlow Condensed", sans-serif'; x.fillText('Video call…', W0 / 2, 156);
      x.fillStyle = '#EF4444'; x.beginPath(); x.arc(38, 252, 16, 0, PI * 2); x.fill();
      x.fillStyle = '#22C55E'; x.beginPath(); x.arc(W0 - 38, 252, 16, 0, PI * 2); x.fill();
      x.textAlign = 'left';
    },
    video(t) {
      // (drawn only with no live feed: Mr. Big in his study, as the feed shows him; mission/mrbig.js)
      const g = x.createRadialGradient(W0 / 2, H0 * 0.4, 6, W0 / 2, H0 * 0.4, H0 * 0.75); g.addColorStop(0, '#3A2214'); g.addColorStop(0.6, '#170C06'); g.addColorStop(1, '#050302');
      x.fillStyle = g; x.fillRect(0, 0, W0, H0);
      // the window behind him: the city at night, a few lit windows
      const n = x.createLinearGradient(0, 40, 0, 160); n.addColorStop(0, '#050914'); n.addColorStop(1, '#1E2440'); x.fillStyle = n; x.fillRect(42, 40, 60, 120);
      x.fillStyle = 'rgba(255,213,138,.75)'; for (const [wx, wy] of [[48, 112], [55, 101], [88, 118], [93, 106], [50, 128], [91, 132]]) x.fillRect(wx, wy, 2, 3);
      x.strokeStyle = '#1E1009'; x.lineWidth = 3; x.strokeRect(42, 40, 60, 120); x.beginPath(); x.moveTo(W0 / 2, 40); x.lineTo(W0 / 2, 160); x.moveTo(42, 96); x.lineTo(102, 96); x.stroke();
      // the navy suit, the white shirt, the burgundy tie
      x.fillStyle = '#1B2440'; x.beginPath(); x.moveTo(8, H0); x.lineTo(14, 236); x.quadraticCurveTo(22, 200, 56, 192); x.lineTo(88, 192); x.quadraticCurveTo(122, 200, 130, 236); x.lineTo(136, H0); x.fill();
      x.fillStyle = '#EDEBE6'; x.beginPath(); x.moveTo(60, 190); x.lineTo(W0 / 2, 222); x.lineTo(84, 190); x.fill();
      x.fillStyle = '#6E1426'; x.beginPath(); x.moveTo(69, 198); x.lineTo(W0 / 2, 238); x.lineTo(75, 198); x.lineTo(W0 / 2, 194); x.fill();
      // the head: skin, the silver hair swept back, the full silver beard, the dark glasses
      x.fillStyle = '#C99A80'; x.fillRect(60, 160, 24, 30);
      x.fillStyle = '#D3A488'; x.beginPath(); x.ellipse(W0 / 2, 134, 25, 31, 0, 0, PI * 2); x.fill();
      x.fillStyle = '#B9B9BE'; x.beginPath(); x.moveTo(47, 136); x.quadraticCurveTo(49, 166, W0 / 2, 172); x.quadraticCurveTo(95, 166, 97, 136); x.quadraticCurveTo(92, 155, 82, 157); x.quadraticCurveTo(W0 / 2, 152, 62, 157); x.quadraticCurveTo(52, 155, 47, 136); x.fill();
      x.fillStyle = '#CFCFD4'; x.beginPath(); x.moveTo(46, 128); x.quadraticCurveTo(45, 96, W0 / 2, 94); x.quadraticCurveTo(99, 96, 98, 128); x.quadraticCurveTo(94, 108, W0 / 2, 107); x.quadraticCurveTo(50, 108, 46, 128); x.fill();
      x.strokeStyle = '#2A160C'; x.lineWidth = 2.5; x.beginPath(); x.roundRect(52, 124, 17, 11, 2); x.roundRect(75, 124, 17, 11, 2); x.moveTo(69, 128); x.lineTo(75, 128); x.stroke();
      x.fillStyle = 'rgba(255,226,184,.7)'; x.fillRect(55, 126, 4, 1.2); x.fillRect(78, 126, 4, 1.2);
      // the cigar, its tip glowing, a thread of smoke
      x.strokeStyle = '#5B3920'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(26, 214); x.lineTo(46, 192); x.stroke(); x.lineCap = 'butt';
      x.fillStyle = `rgba(255,${110 + 30 * Math.sin(t * 7) | 0},40,1)`; x.beginPath(); x.arc(47, 191, 2.2, 0, PI * 2); x.fill();
      x.strokeStyle = 'rgba(190,190,195,.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(48, 188); x.bezierCurveTo(44 + 4 * Math.sin(t), 170, 52, 160, 47 + 3 * Math.sin(t * 0.7), 140); x.stroke();
      // the call's level
      x.fillStyle = '#B6FF3B'; for (let i = 0; i < 18; i++) { const h = 3 + Math.abs(Math.sin(t * 13 + i * 1.7) * Math.sin(t * 5.3 + i)) * 22; x.fillRect(18 + i * 6, 262 - h / 2, 3, h); }
      x.fillStyle = 'rgba(182,255,59,.8)'; x.font = '700 9px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('PRIVATE LINE', W0 / 2, 244);
      x.fillStyle = '#fff'; x.font = '800 13px "Barlow Condensed", sans-serif'; x.fillText('UNKNOWN', W0 / 2, 34); x.textAlign = 'left';
      // scan lines
      x.fillStyle = 'rgba(255,255,255,.035)'; for (let y = 0; y < H0; y += 3) x.fillRect(0, y, W0, 1);
    },
    ended() { x.fillStyle = '#07080A'; x.fillRect(0, 0, W0, H0); x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '700 16px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('CALL ENDED', W0 / 2, H0 / 2); x.textAlign = 'left'; },
    tracker(t) {
      x.fillStyle = '#0E1626'; x.fillRect(0, 0, W0, H0);
      x.fillStyle = '#1D2A40'; for (const px of [30, 70, 110]) x.fillRect(px, 0, 9, H0); for (const py of [50, 100, 150, 200, 250]) x.fillRect(0, py, W0, 6);
      x.strokeStyle = '#2F7FD8'; x.setLineDash([4, 4]); x.lineWidth = 2; x.beginPath(); x.moveTo(74, 70); x.lineTo(74, 280); x.stroke(); x.setLineDash([]);
      const y = 90 + Math.min(1, t / 4) * 150; x.fillStyle = '#2F7FD8'; x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc(74, y, 8, 0, PI * 2); x.fill(); x.stroke();
      x.fillStyle = 'rgba(30,34,44,.95)'; rr(8, 16, W0 - 16, 40, 10);
      x.fillStyle = '#2F7FD8'; rr(14, 22, 26, 26, 7);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '700 9px "Barlow Condensed", sans-serif'; x.fillText('TRACKER · NOW', 46, 32);
      x.fillStyle = '#fff'; x.font = '700 12px "Barlow Condensed", sans-serif'; x.fillText('Laptop moving · 5th Ave', 46, 47);
    },
  };
  let mode = null, at = -1, t0 = 0;
  phone.screen = scr;
  // show(mode, t): t is the scene clock (the live screens animate on it)
  phone.show = (m, t = 0) => {
    if (m !== mode) { mode = m; t0 = t; at = -1; if (vid) { vid.visible = m === 'video'; scr.visible = !vid.visible; } }
    const live = m === 'video' || m === 'tracker';
    if (at >= 0 && (!live || Math.abs(t - at) < 0.066)) return;
    at = t; (DRAW[m] || DRAW.off)(t - t0); tex.needsUpdate = true;
  };
  phone.show('off');
  return phone;
}

async function buildCast(W) {
  const app = W.app, scene = app.scene, Qn = W.dan;
  // Moon and her lead (for the missions: she lives with Jane, and is not in the opening)
  const moon = buildMoon(THREE); moon.group.visible = false; scene.add(moon.group);
  const leash = buildLeash(THREE, { length: 1.5, radius: 0.0075 }); leash.mesh.visible = false; scene.add(leash.mesh);
  // the van
  const van = buildVan(THREE); van.group.visible = false; scene.add(van.group);
  const street = dressStreet(W);
  // the Suits: thug.glb, dressed as the fight dresses them (JPBank security: dark suits, dark glasses)
  // (the fight's own copy, wagmi/glb.js: fetched and parsed once; everything made from it is a SkeletonUtils clone)
  const gltf = await loadGLB('assets/characters/thug.glb');
  // Mr. Big in his study on the call (his own scene and model: mission/mrbig.js), and Dan's phone with his feed on it
  const boss = await createMrBig(W);
  const phone = buildPhone(boss.texture); phone.visible = false; scene.add(phone);
  // (their motion capture: the fight's pack, assets/anim/bandai/suits.glb (CC BY-NC 4.0: NOTICE): an upright stand,
  // walks, a run, a sprint and a back-step on thug.glb's rig, over the rig's own clips (its guard kept for squaring up,
  // its brawler idle and walks the fallback); SUITS: the clip for each and the speed it was captured at (m/s), for a rig
  // segment's { along, mps }: the clip's time from the ground the path covers, so their feet stay planted)
  const suitPack = await loadGLB('assets/anim/suits-dan.glb').catch(() => null); // (29 Oct: Dan's clips retargeted onto the rig, combat/index.js)
  const thugClips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const c of suitPack?.animations || []) thugClips[c.name] = c;
  relaxArms(thugClips, gltf.scene); // (the standing and walking arms in at the sides: combat/suitarms.js)
  const SUITS = thugClips.suitIdle ? { idle: 'suitIdle', walk: ['suitWalk', 1.392], run: ['suitRun', 3.855], dash: ['suitDash', 4.924], back: ['suitBack', 1.537] }
    : { idle: 'thugIdle', walk: ['walk', 0.82], run: ['jog', 2.6], dash: ['run', 4.7], back: ['walk', -0.82] };
  function suit(look, name) {
    const root = new THREE.Group(); root.name = name;
    const inner = skClone(gltf.scene); root.add(inner);
    if (W.combat?.dressSuit) W.combat.dressSuit(inner, look);
    else inner.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.35); } });
    inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const mixer = new THREE.AnimationMixer(inner);
    root.visible = false; scene.add(root);
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    return { root, inner, bones, mixer, rig: rig(mixer, thugClips), top: box.max.y };
  }
  const knox = suit('c', 'Suit-Knox'), hooks = suit('b', 'Suit-Hooks'), tank = suit('a', 'Suit-Tank'), brick = suit('b', 'Suit-Brick');
  // (Knox's glasses: built at the origin in the rest pose, then fixed to his head where they sit)
  {
    const head = knox.bones.head;
    const hp = head.getWorldPosition(V());
    // the shades: the dressing's (every one of JP Bank's men wears dark glasses), else a pair of his own: wrap-round
    // lenses on the bridge of his nose, arms back over his ears
    const shades = knox.inner.userData.shades || new THREE.Group();
    if (!knox.inner.userData.shades) {
      const lensMat = new THREE.MeshPhysicalMaterial({ color: '#050506', roughness: 0.05, metalness: 0.6, clearcoat: 1 });
      // (27 Oct: smooth, as the dressing's pair: rounded lenses narrower at the bottom, a bridge, rounded arms; bevelled)
      const sh = (w, h, taper, rt, rb) => { const P = [[-w / 2 + taper, -h / 2, rb], [w / 2 - taper, -h / 2, rb], [w / 2, h / 2, rt], [-w / 2, h / 2, rt]], s = new THREE.Shape();
        P.forEach(([x, y, r], i) => { const [px, py] = P[(i + 3) % 4], [nx, ny] = P[(i + 1) % 4], a = Math.hypot(px - x, py - y), b = Math.hypot(nx - x, ny - y), u = [x + (px - x) * r / a, y + (py - y) * r / a], v = [x + (nx - x) * r / b, y + (ny - y) * r / b]; if (i) s.lineTo(...u); else s.moveTo(...u); s.quadraticCurveTo(x, y, ...v); });
        s.closePath(); return s; };
      const ex = (s, d) => new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2, curveSegments: 5 }).translate(0, 0, -d / 2);
      for (const sx of [-1, 1]) { const l = new THREE.Mesh(ex(sh(0.056, 0.032, 0.004, 0.0035, 0.009), 0.0075), lensMat); l.position.set(sx * 0.034, 0.002, 0); l.rotation.y = sx * 0.18; shades.add(l); }
      const bridge = new THREE.Mesh(ex(sh(0.016, 0.005, 0, 0.0022, 0.0022), 0.005), lensMat); bridge.position.set(0, 0.012, 0.0005); shades.add(bridge);
      for (const sx of [-1, 1]) { const t = new THREE.Mesh(ex(sh(0.004, 0.006, 0, 0.0018, 0.0018), 0.108), lensMat); t.position.set(sx * 0.066, 0.01, -0.055); shades.add(t); }
      shades.position.set(0, knox.top - SHADES.down, hp.z + SHADES.fwd); knox.inner.add(shades); head.attach(shades);
    }
    for (const o of [shades]) o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    knox.shades = shades;
  }
  // (the other three wear the suit and the glasses alone; Hooks and Brick, in look b, the earpiece's coiled cord too)

  // Dan's clips for the scene: whole, and in parts. 'body' is the legs and the spine (he stands up straight in it),
  // 'arms' the arms, neck and head (a gesture over the body), 'armL' the left arm alone (a hand moving as he talks while
  // the right holds the phone). (The clips' own spines lean 22-30 degrees: they are never used whole for standing.)
  const qClip = (n) => Qn.act(n).getClip();
  const LEGS = /^(root|pelvis|upperleg|lowerleg|foot)/, ARMS = /^(clavicle|shoulder|upperarm|lowerarm|wrist|finger)/, HEAD = /^(neck|head)/;
  const qClips = {};
  for (const n of ['idle', 'walk', 'jog', 'run', 'phone', 'talk', 'death', 'getup', 'pickup', 'dash', 'shrug', 'leanBar', 'hit', 'hitChest']) if (Qn.clips.includes(n)) qClips[n] = qClip(n).clone();
  for (const n of ['walk', 'idle']) qClips[n + '/legs'] = masked(qClip(n), (b) => LEGS.test(b), n + '/legs');
  for (const n of ['phone', 'talk', 'idle', 'walk', 'leanBar']) qClips[n + '/upper'] = masked(qClip(n), (b) => !LEGS.test(b), n + '/upper');
  for (const n of ['idle', 'walk']) qClips[n + '/body'] = masked(qClip(n), (b) => !ARMS.test(b) && !HEAD.test(b), n + '/body');
  for (const n of ['idle', 'talk', 'phone', 'shrug']) qClips[n + '/arms'] = masked(qClip(n), (b) => ARMS.test(b) || HEAD.test(b), n + '/arms');
  qClips['talk/armL'] = masked(qClip('talk'), (b) => ARMS.test(b) && b.endsWith('_L'), 'talk/armL');
  qClips['idle/noArmL'] = masked(qClip('idle'), (b) => !(ARMS.test(b) && b.endsWith('_L')), 'idle/noArmL');
  // (and with the head left to a layer of its own: the tracker scene's 'He's got my laptop', his face kept to us)
  qClips['idle/noArmLHead'] = masked(qClip('idle'), (b) => !(ARMS.test(b) && b.endsWith('_L')) && !HEAD.test(b), 'idle/noArmLHead');
  qClips['talk/head'] = masked(qClip('talk'), (b) => HEAD.test(b), 'talk/head');
  const qRig = rig(Qn.mixer, qClips);
  // his head's forward, in the head bone's own frame (from the rest of his idle, facing +z), for looking at things; and
  // his laptop bag fitted to him in that same pose (buildBag)
  let bag = null;
  {
    const P = W.person, h0 = P.mesh.rotation.y; P.mesh.rotation.y = 0; P.mesh.updateMatrixWorld(true);
    qRig.set([[0, 'idle']]); qRig.pose(0); P.mesh.updateMatrixWorld(true);
    Qn.bones.head.getWorldQuaternion(_q); qRig.headFwd = V(0, 0, 1).applyQuaternion(_q.invert()).normalize();
    // (fitted standing as the scenes stand him, upright over his hips: then put back)
    const ub = UPRIGHT_BONES.map((n) => Qn.bones[n]).filter(Boolean), uq = ub.map((b) => b.quaternion.clone()), rx = Qn.body.rotation.x;
    bag = buildBag(W);
    try { upright(W, 0, 1); P.mesh.updateMatrixWorld(true); bag.fit(); } catch (e) { console.warn('[intro] bag fit', e); }
    ub.forEach((b, i) => b.quaternion.copy(uq[i])); Qn.body.rotation.x = rx; P.mesh.updateMatrixWorld(true);
    P.mesh.rotation.y = h0; qRig.stop();
  }

  // their pipelines compile now, behind the loading screen or the gate, not on the first frame each is seen: drawn
  // for a few frames out of sight under the street (unculled, so the real render passes build them, shadows too)
  const cast = [moon.group, van.group, knox.root, hooks.root, tank.root, brick.root, leash.mesh, phone, bag.group, bag.strap, bag.sling.mesh, ...street.meshes];
  const culled = [];
  const saved = cast.map((o) => o.position.clone());
  for (const o of cast) { o.visible = true; o.position.set(110, -40, 395); o.traverse((m) => { if (m.isMesh && m.frustumCulled) { culled.push(m); m.frustumCulled = false; } }); }
  if (phone.vid) phone.vid.visible = true;
  await boss.warm();
  for (let i = 0; i < 40 && !app.ready; i++) await sleep(100);
  await new Promise((r) => { let n = 0; const f = () => (++n >= 8 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  for (const m of culled) m.frustumCulled = true;
  // (and back where they were: the leash, the sling and the street's people draw in world space from the origin)
  cast.forEach((o, i) => { o.visible = false; o.position.copy(saved[i]); });
  if (phone.vid) phone.vid.visible = false;

  W.cast = { moon, leash, bag, van, phone, knox, hooks, tank, brick, street, qRig, thugClips, SUITS, boss, all: cast };
  return W.cast;
}
// Knox's own shades on his face (when the dressing has none): how far below the top of his head, how far forward of the
// head bone (rest pose)
const SHADES = { down: 0.152, fwd: 0.11 };

/* ------------------------------------------------------- the laptop bag -- */
// Dan's laptop bag (the evidence: his laptop in it; the tracker sewn into its lining): a slim messenger in tan-brown
// leather (it reads against his black clothes) at his left hip, its strap up over his chest and his right shoulder and
// down his back to it again. Fitted to him (bag.fit(), with him posed in his idle's rest, upright, facing +z: his left
// +x): the strap laid on his clothes where they are (his own skinned vertices, so any build of him fits), the bag and
// the strap then held to his lower spine. Ripped off him, the strap is the sling: a rope (moon.js buildLeash) hanging
// from the bag's two rings.
//   bag.fit(): fitted to him as he is posed now (buildCast; again at the opening's start, startState, if he was not
//   dressed yet: bag.fitted is how many of his vertices it was laid on)
//   bag.onHim(p, q): where it sits on him as he is posed now (and the strap put there)     bag.at(p, q): anywhere
//   bag.corners(left): its two top corners, [the one toward `left` (a direction), the other]     bag.rings(): its rings
// BAG: its size; out: off his hip; fwd: its middle ahead of his hip joint (back: -); drop: its middle under it; strap:
// the strap's radius and its lift off his clothes; sling: the strap's length (both ends on the rings)
const BAG = { w: 0.36, h: 0.27, d: 0.07, out: 0.012, fwd: -0.05, drop: 0.1, strap: 0.0095, lift: 0.011, sling: 0.95 };
function buildBag(W) {
  const P = W.person, B = W.dan.bones, bone = B.spine04 || B.spine05 || B.spine03 || W.dan.body;
  // (matte leather: Lambert, no specular, or the low sun glares off it)
  const leather = new THREE.MeshLambertMaterial({ color: '#6B4428' }), edge = new THREE.MeshLambertMaterial({ color: '#4E301B' });
  const brass = new THREE.MeshStandardMaterial({ color: '#B39255', roughness: 0.35, metalness: 0.85 });
  const group = new THREE.Group(); group.name = 'wagmi-laptop-bag';
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); group.add(m); return m; };
  // the case (its front +z, its top +y, its length x), the flap over two thirds of its front with a buckle, the zip
  // along its top, a ring at each top corner for the strap
  part(new RoundedBoxGeometry(BAG.w, BAG.h, BAG.d, 3, 0.022), leather, 0, 0, 0);
  part(new RoundedBoxGeometry(BAG.w + 0.004, BAG.h * 0.66, 0.012, 2, 0.005), edge, 0, BAG.h * 0.17, BAG.d / 2 + 0.003);
  part(new THREE.BoxGeometry(0.05, 0.03, 0.008), brass, 0, BAG.h * 0.17 - BAG.h * 0.33 + 0.028, BAG.d / 2 + 0.012);
  part(new THREE.BoxGeometry(BAG.w * 0.84, 0.007, 0.012), brass, 0, BAG.h / 2 + 0.001, 0);
  const rings = [-1, 1].map((sx) => { const r = part(new THREE.TorusGeometry(0.015, 0.0035, 6, 14), brass, sx * (BAG.w / 2 + 0.006), BAG.h / 2 - 0.012, 0); r.rotation.y = PI / 2; return r; });
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  group.visible = false; W.app.scene.add(group);
  const strap = new THREE.Mesh(new THREE.BufferGeometry(), edge); strap.name = 'wagmi-laptop-bag-strap'; strap.castShadow = true; strap.frustumCulled = false; strap.visible = false; W.app.scene.add(strap);
  const sling = buildLeash(THREE, { length: BAG.sling, color: '#4E301B', radius: BAG.strap });
  sling.mesh.visible = false; W.app.scene.add(sling.mesh);
  const ONE = V(1, 1, 1), _p = V(), _s = V(), _bq = new THREE.Quaternion(), off = new THREE.Matrix4(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const api = {
    group, strap, sling, fitted: -1,
    fit() {
      // ---- where it sits on him: about his feet, facing +z (his left +x)
      const o = P.mesh.getWorldPosition(V()), at = (b) => (b ? b.getWorldPosition(V()).sub(o) : null);
      const hipL = at(B.upperleg01_L) || V(0.1, 0.95, 0), hipR = at(B.upperleg01_R) || V(-0.1, 0.95, 0), shR = at(B.upperarm01_R) || V(-0.19, 1.45, 0), nk = at(B.neck01) || V(0, 1.5, 0);
      // (every vertex of his, once: his primitives share their vertices)
      const pts = [], seen = new Set();
      P.mesh.traverse((m) => {
        const pa = m.isMesh && m.geometry?.attributes?.position; if (!pa || !m.visible || seen.has(pa)) return; seen.add(pa);
        m.updateMatrixWorld(true);
        for (let i = 0; i < pa.count; i++) { const v = m.getVertexPosition(i, V()); m.localToWorld(v); pts.push(v.sub(o)); }
      });
      // (his surface near a point: the furthest out of his vertices within a window; null with none there)
      const most = (inWin, val) => { let b = null; for (const p of pts) if (inWin(p)) { const s = val(p); if (b == null || s > b) b = s; } return b; };
      // (within his torso's depth of his spine: a stray vertex of his clothes or hands a metre off is not his chest)
      const win = 0.03, cz = (at(B.spine03) || hipL).z, tz = (z) => z > cz - 0.3 && z < cz + 0.3;
      const front = (x, y) => most((p) => Math.abs(p.x - x) < win && Math.abs(p.y - y) < win && tz(p.z), (p) => p.z);
      const back = (x, y) => { const r = most((p) => Math.abs(p.x - x) < win && Math.abs(p.y - y) < win && tz(p.z), (p) => -p.z); return r == null ? null : -r; };
      const hipY = (hipL.y + hipR.y) / 2, by = hipY - BAG.drop, bz = hipL.z + BAG.fwd;
      // his left hip's outside where the bag lies (his own arm kept out of it: nothing further out than a thigh's width)
      const hx = most((p) => Math.abs(p.y - by) < win && Math.abs(p.z - bz) < 0.05 && p.x > 0 && p.x < hipL.x + 0.13 && tz(p.z), (p) => p.x);
      const side = Math.min(hipL.x + 0.13, Math.max(hipL.x + 0.06, hx ?? hipL.x + 0.095));
      const C = V(side + BAG.out + BAG.d / 2, by, bz), Qb = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), PI / 2);
      // (its rings: the one at its front end and the one at its back, as it sits)
      const ringAt = (sx) => V(sx * (BAG.w / 2 + 0.006), BAG.h / 2 - 0.012, 0).applyQuaternion(Qb).add(C);
      const rF = ringAt(-1), rB = ringAt(1);
      // ---- the strap: up his front from the front ring to his right shoulder, over it, down his back to the back ring
      // (over the top of his shoulder, 60% of the way out from his neck: not over his head)
      const sx1 = nk.x + (shR.x - nk.x) * 0.6, sy1 = shR.y + 0.02, gap = BAG.strap + BAG.lift;
      const topAt = (x, z) => most((p) => Math.abs(p.x - x) < 0.025 && Math.abs(p.z - z) < 0.06 && p.y > sy1 - 0.12 && p.y < sy1 + 0.14, (p) => p.y);
      const zf0 = front(sx1, sy1), zb0 = back(sx1, sy1), zMid = zf0 != null && zb0 != null ? (zf0 + zb0) / 2 : nk.z;
      const run = (zOf, sgn, fb) => {
        const out = []; let last = fb;
        for (let i = 0; i <= 6; i++) {
          const k = i / 6, x = lerp(side - 0.035, sx1, k), y = lerp(rF.y + 0.07, sy1 - 0.03, k), z = zOf(x, y);
          last = z != null ? z + sgn * gap : last; out.push(V(x, y, last));
        }
        return out;
      };
      const fr = run(front, 1, hipL.z + 0.12), bk = run(back, -1, hipL.z - 0.12);
      const crown = topAt(sx1, zMid), top = V(sx1, (crown ?? sy1 + 0.06) + gap, zMid);
      const path = [rF, ...fr, top, ...bk.reverse(), rB];
      // (in the bone's frame, unscaled: the bone's place and turn now)
      bone.updateMatrixWorld(true); bone.matrixWorld.decompose(_p, _bq, _s); _m.compose(_p, _bq, ONE).invert();
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map((p) => p.clone().add(o))), 72, BAG.strap, 5, false);
      geo.applyMatrix4(_m); strap.geometry.dispose(); strap.geometry = geo;
      off.copy(_m).multiply(_m2.compose(C.clone().add(o), Qb, ONE));
      api.fitted = pts.length;
      return api;
    },
    onHim(p, q) {
      bone.matrixWorld.decompose(_p, _bq, _s); _m.compose(_p, _bq, ONE);
      strap.position.copy(_p); strap.quaternion.copy(_bq);
      _m2.multiplyMatrices(_m, off).decompose(p, q, _s);
    },
    at(p, q) { group.position.copy(p); group.quaternion.copy(q); group.updateMatrixWorld(true); },
    corners(left) {
      const a = group.localToWorld(V(BAG.w / 2 - 0.05, BAG.h / 2, 0)), b = group.localToWorld(V(-(BAG.w / 2 - 0.05), BAG.h / 2, 0));
      return a.clone().sub(b).dot(left) > 0 ? [a, b] : [b, a];
    },
    rings() { return rings.map((r) => r.getWorldPosition(V())); },
    hide() { group.visible = false; strap.visible = false; sling.mesh.visible = false; },
  };
  return api;
}

async function castOpening(W) {
  const c = await getCast(W);
  return buildScript({ W, D: createDirector(W), ui: W.ui, sfx: W.sfx, set: W.set, ...c, P: W.person, car: W.car });
}

/* ---------------------------------------------------------- the script -- */
function buildScript(ctx) {
  const { W, D, ui, sfx, set, bag, van, phone, knox, hooks, street, qRig, boss, P, car } = ctx;
  const app = W.app, cm = app.controllerManager, Qn = W.dan;
  const B = Qn.bones, SUITS = ctx.SUITS; // (the Suits' gaits: buildCast)

  // ---- times (s)
  // (the call cut as shot and reverse: Dan, Mr. Big in his study, Dan, the lonely wide, Mr. Big, Dan's face, Mr. Big, him close,
  // over Dan's shoulder onto the phone, Dan's face)
  const T = {
    s1: 0, s2: 6, s3: 11, s4: 14.8, s4b: 18.9, s5: 21, s6: 24.5, s7: 27.5, s8: 32.5, s9: 35.5, s9b: 36.0, s9c: 36.55, s10: 38.5,
    s11a: 41.3, s11b: 45, call: 48.5, bossA: 50.55, call2: 54.25, wide: 55.85, bossB: 57.1, close1: 59.8, bossC: 61.35, bossD: 65.0,
    ots: 66.6, close: 69.2, s12: 77, end: 81,
  };
  const END = T.end;

  // ---- Dan: where he is, which way he faces
  const qWalk = spline([[112, 386.8], [111.95, 388.3], [110.8, 389.6], [109.5, 390.5], [109.0, 390.8]]);
  const qWalkS = travel([[11.8, 0.6], [12.3, 1.25], [15.3, 1.25], [16.0, 0.2]]);
  // (his lunge ends short of Knox: the push shows between them, the two never run into one another)
  const LUNGE = [109.75, 390.92], STEP = [109.18, 390.82];
  const GETUP0 = [LUNGE[0] - 0.45, LUNGE[1]];         // the get-up starts where the fall left his hips
  const STAND = [GETUP0[0] + 0.31, GETUP0[1] + 0.11];  // and ends a step on (the clip's own travel)
  const T_UP = 45.2, UP_FADE = 0.2;                     // (the get-up: from, and its fade in)
  const qHeading = angleKeys([[16.0, -PI / 2], [24.0, -PI / 2], [24.35, 0], [24.75, PI / 2], [76.95, PI / 2], [77.35, 0], [77.8, -1.41]]);
  function danAt(t) {
    if (t < 11.8) return { x: 112, z: 386.8, h: 0, vis: t > 11.45 };
    if (t < 16.0) { const p = qWalk.at(qWalkS(t)); return { x: p.x, z: p.z, h: p.h, vis: true }; }
    // (a step after the bag as Hooks rips it away, then the lunge)
    if (t < 34.3) return { x: 109, z: 390.8, h: qHeading(t), vis: true };
    if (t < 35.45) { const k = ease.inOut((t - 34.3) / 0.45); return { x: lerp(109, STEP[0], k), z: lerp(390.8, STEP[1], k), h: qHeading(t), vis: true }; }
    if (t < 36.12) { const k = ease.inOut((t - 35.45) / 0.67); return { x: lerp(STEP[0], LUNGE[0], k), z: lerp(STEP[1], LUNGE[1], k), h: PI / 2, vis: true }; }
    if (t < T_UP) return { x: LUNGE[0], z: LUNGE[1], h: PI / 2, vis: true };
    // (over the get-up's fade in his place goes over with it, or his body would jump the 0.45 m and slide back)
    const k = smooth((t - T_UP) / UP_FADE);
    return { x: lerp(LUNGE[0], GETUP0[0], k), z: lerp(LUNGE[1], GETUP0[1], k), h: qHeading(t), vis: true };
  }
  qRig.set([
    [0, 'idle'],
    // (the arms from idle: the hands hold the phone by reaching for it, over the pose)
    [11.8, ['walk/body', 'idle/arms'], { speed: 0.86, fade: 0.3 }],
    [15.85, 'idle', { fade: 0.45 }],
    [24.0, ['walk/body', 'idle/arms'], { speed: 1.1, fade: 0.25 }],
    [24.75, 'idle', { fade: 0.3 }],
    // (his answer: one hand talking, the other down at his side, his shoulders square: both hands up at his chest
    // read as a man clutching himself)
    [28.3, ['idle/noArmL', ['talk/armL', { from: 0.6 }]], { fade: 0.35 }],
    [31.45, 'idle', { fade: 0.4 }],
    // a step after the bag as it goes, his hand out for it
    [34.3, ['walk/body', 'idle/arms'], { speed: 1.1, fade: 0.12 }],
    [34.78, 'idle', { fade: 0.3 }],
    // the lunge: two upright steps at the van; the shove lands; back and down from the fall's stagger
    [35.45, 'jog', { from: 0.36, speed: 0.62, fade: 0.15 }],
    [36.12, 'death', { from: 0.72, speed: 0.9, loop: false, fade: 0.15 }],
    [T_UP, 'getup', { speed: 0.8, loop: false, fade: UP_FADE }],
    [47.15, 'idle', { fade: 0.5 }],
    // the call: his left hand talking while the right holds the phone up
    [54.35, ['idle/noArmL', ['talk/armL', { from: 0.6 }]], { fade: 0.3 }],
    [55.8, 'idle', { fade: 0.45 }],
    [59.9, ['idle/noArmL', ['talk/armL', { from: 1.3 }]], { fade: 0.3 }],
    [61.3, 'idle', { fade: 0.45 }],
    // he turns for his car across the cut, a few steps' worth on the spot
    [76.95, ['walk/body', 'idle/arms'], { speed: 0.9, fade: 0.3 }],
    [77.85, 'idle', { fade: 0.4 }],
  ]);
  // the phone: 'held' (in his right hand: up in front of him by upW, read low or on a video call at his chin by callK),
  // 'drop' (out of his hand at the shove), 'ground', 'pick' (the get-up's hand to it)
  const PHONE = [[0, 'none'], [11.45, 'held'], [36.12, 'drop'], [36.5, 'ground'], [45.45, 'pick'], [45.95, 'held']];
  const phoneAt = (t) => { let i = 0; for (let k = 0; k < PHONE.length; k++) if (PHONE[k][0] <= t) i = k; return { mode: PHONE[i][1], since: t - PHONE[i][0] }; };
  const upW = keys([[0, 1], [23.9, 1], [24.35, 0], [47.25, 0], [47.75, 1], [69.6, 1], [70.15, 0], [73.45, 0], [73.9, 1], [75.4, 1], [75.95, 0]]);
  const callK = keys([[49.7, 0], [50.25, 1], [69.1, 1], [69.6, 0], [73.4, 0], [73.5, 1]]); // (the tracker held up too: his face in the close)
  const pickW = keys([[45.45, 0], [45.66, 0.92], [45.76, 0.92], [45.95, 0]]);
  // what he looks at: [t, target(t) | null]
  // (14.0: up from the phone as his card lands, his face to us; 16.8: to his car, 'Car, then a lawyer'; 34.3: after
  // the bag; 41.3: on the pavement, his head rolling toward the lens)
  const LOOKS = [
    [11.6, 'phone'], [14.0, 'lens'], [14.85, 'phone'], [16.8, 'car'], [20.4, 'phone'], [21.6, 'van'], [24.0, null], [29.6, null],
    [34.3, 'bag'], [35.45, null], [41.3, 'cam'], [45.1, null],
    [47.3, 'phone'], [49.75, 'phone'], [69.3, null], [73.5, 'phone'], [75.45, 'lens'], [76.9, null],
  ];
  // (just off the lens, on the frame's open side: he talks past us, not into it)
  const offLens = () => { const c = V(...D.camera.pos), l = V(...D.camera.look), f = l.sub(c).setY(0).normalize(); c.y = Math.max(c.y, eyeOf()[1] + 0.05); return c.add(V(f.z, 0, -f.x).multiplyScalar(-0.45)); };
  const lookAt = (t) => { let i = 0; for (let k = 0; k < LOOKS.length; k++) if (LOOKS[k][0] <= t) i = k; return { what: LOOKS[i][1], since: t - LOOKS[i][0] }; };

  // ---- the bag: on him from his door; Hooks' hands on it from 33.6, ripped off him at T_GRAB, up to his chest (held up
  // to us) and run to the van
  const T_GRAB = 34.0;

  // ---- the van: in from Madison, stopped at the curb, then away west and left onto 5th Ave
  const vIn = spline([[157.6, 432], [157.4, 414], [155.6, 405.2], [149.5, 399.6], [138, 396.6], [126, 395.2], [116, 394.6]]);
  const vInS0 = travel([[18.6, 12.5], [20.9, 12.5], [21.7, 9.5], [22.7, 12], [23.25, 12], [25.0, 0]]);
  const vInS = (t) => vIn.length - (vInS0(25.0) - vInS0(t));
  const vOut = spline([[116, 394.6], [109, 396.4], [100, 397.4], [60, 397.5], [17, 397.5], [8.5, 399.2], [3.9, 405], [3.6, 418], [3.6, 490]]);
  const vOutS = travel([[39.3, 0], [41.4, 14], [44.0, 21], [45.4, 21], [46.6, 9], [47.8, 9.5], [49.6, 18], [55, 18]]);
  const T_GO = 39.3;
  function vanAt(t) {
    if (t < T_GO) { const s = vInS(t); if (s < -6) return null; const p = vIn.at(Math.max(0, s)); return { ...p, v: vInS0.speed(t) }; }
    const s = vOutS(t); if (s > vOut.length - 1) return null; const p = vOut.at(s); return { ...p, v: vOutS.speed(t) };
  }
  const vanDoor = keys([[25.15, 0, 'out'], [25.55, 1], [35.9, 1, 'in'], [36.3, 1], [38.75, 1, 'in'], [39.15, 0]]);

  // ---- the Suits: hop down, square up, take the bag, shove, back in. Knox faces Dan 2.4 m off; Hooks runs in north of
  // him (between Knox and the building) to Dan's left, rips the bag off his hip and runs it to the van
  const KNOX = [111.4, 390.98], SHOVE = [110.72, 391.0];
  const bPath = keys([[25.6, [115.85, 394.0]], [25.95, [115.55, 392.95], 'out'], [26.1, [115.4, 392.9]], [27.6, [113.1, 391.4]], [28.0, [112.8, 391.25]], [29.6, KNOX],
    [35.6, KNOX], [36.08, SHOVE], [36.75, [110.85, 391.0]], [37.7, [113.0, 391.8]], [38.5, [115.4, 392.9]], [38.85, [115.85, 394.0]]]);
  const bHead = angleKeys([[25.6, 0], [26.1, -1.2], [27.6, -1.65], [36.6, -1.65], [37.6, -1.75], [37.75, 0.9], [38.5, 0.3]]);
  const bY = keys([[25.6, 0.62], [25.95, 0.22], [38.5, 0.22], [38.85, 0.62]], 'smooth');
  // (standing, the upright stand; on the move, each gait's clip timed by the metres his path covers (bOdo): the hop down
  // and the run back to the van a run, the walk up and the shove's step a walk, backing off the back-step)
  const bOdo = odometer(bPath, 25.6, 38.85), go = ([n, mps], o, odo) => [n, { along: odo, mps, ...o }];
  knox.rig.set([
    [0, SUITS.idle],
    [25.6, ...go(SUITS.run, { fade: 0.1 }, bOdo)],
    [26.1, ...go(SUITS.walk, { fade: 0.25 }, bOdo)],
    [29.6, SUITS.idle, { fade: 0.4 }],
    [31.2, 'guard', { speed: 0.6, fade: 0.4 }],
    [35.6, ...go(SUITS.walk, { from: 0.1, fade: 0.15 }, bOdo)],
    [36.05, 'guard', { from: 0.2, speed: 0.3, fade: 0.12 }],
    [36.75, ...go(SUITS.back, { fade: 0.25 }, bOdo)],
    [37.7, ...go(SUITS.run, { fade: 0.2 }, bOdo)],
  ]);
  // the shove: both his hands to Dan's chest, his arms held out after him as he goes down, leaning into it
  const shoveW = keys([[35.8, 0], [36.06, 1], [36.72, 1], [36.98, 0]]);
  const shoveLean = keys([[35.85, 0], [36.1, 1], [36.6, 1], [36.95, 0]]);
  // (in at Dan's left for the bag at his hip; he holds it up to his chest, facing us, 34.0-34.9, before he runs: the
  // moment the film turns on)
  const HOOK = [109.47, 390.22];
  const sPath = keys([[25.95, [115.85, 394.0]], [26.3, [115.25, 392.95], 'out'], [26.5, [115.1, 392.85]], [27.9, [113.0, 390.3]],
    [32.55, [112.95, 390.25]], [33.05, [111.95, 390.15], 'linear'], [33.45, [110.45, 390.2]], [33.7, HOOK],
    [34.9, HOOK], [35.14, [111.2, 390.3]], [35.47, [112.9, 390.95], 'linear'], [35.77, [114.2, 392.0], 'linear'], [36.07, [115.4, 392.95]], [36.42, [115.85, 394.05]]]);
  const sHead = angleKeys([[25.95, 0], [26.5, -0.9], [27.9, -1.35], [28.4, -1.65], [32.5, -1.65], [32.65, -1.62], [33.45, -1.5], [33.7, -1.05], [34.02, -1.05], [34.32, -2.55], [34.9, -2.55], [35.27, -4.4], [35.72, -5.25], [36.02, -5.95]]);
  const sY = keys([[25.95, 0.62], [26.3, 0.22], [36.02, 0.22], [36.37, 0.62]], 'smooth');
  const scoop = keys([[33.6, 0], [33.88, 1, 'smooth'], [34.02, 1], [34.32, 0.15]]);
  const T_RUN = 34.9; // (Hooks runs for the van)
  const bLookBag = keys([[31.7, 0], [32.1, 0.85], [33.3, 0.85], [33.7, 0]]);
  // (the same, by sOdo: he runs in from the hop down (2.4 m/s, a jog's pace, not a walk's), runs in for the bag and
  // sprints it to the van)
  const sOdo = odometer(sPath, 25.95, 36.42);
  hooks.rig.set([
    [0, SUITS.idle],
    [25.95, ...go(SUITS.run, { fade: 0.1 }, sOdo)],
    [27.9, SUITS.idle, { fade: 0.4 }],
    [32.55, ...go(SUITS.run, { fade: 0.15 }, sOdo)],
    [33.65, SUITS.idle, { fade: 0.2 }],
    [T_RUN, ...go(SUITS.dash, { fade: 0.12 }, sOdo)],
  ]);

  // ---- the shots
  // (framing: aimAt puts a subject at a screen x (-1 left edge .. 1 right edge) and y (-1 bottom .. 1 top) from a
  // camera; ots stands behind a character's shoulder, side > 0 his right, < 0 his left)
  // (the frame a shot is composed for: on a phone held upright, the band's landscape frame, cine.js shotAspect; a shot
  // with band: false fills the upright screen, its own shape)
  const aspect = (band = true) => shotAspect(app.cameraSystem, band);
  function aimAt(from, subj, ndcX, fov, ndcY = 0, band = true) {
    const dx = subj[0] - from[0], dz = subj[2] - from[2], d = Math.hypot(dx, dz) || 1, tn = Math.tan(fov * PI / 360);
    const off = -ndcX * d * tn * aspect(band);
    return [subj[0] + (-dz / d) * off, subj[1] - ndcY * d * tn, subj[2] + (dx / d) * off];
  }
  function ots(x, z, h, back, side, y) { return [x - Math.sin(h) * back - Math.cos(h) * side, y, z - Math.cos(h) * back + Math.sin(h) * side]; }
  const eyeOf = () => { const h = B.head.getWorldPosition(V()); const f = fwd(P.mesh.rotation.y); return [h.x + f.x * EYE_FWD, h.y + EYE_UP, h.z + f.z * EYE_FWD]; };
  const wideCam = (t) => ({ pos: keys([[55.85, [104.2, 1.15, 402.6]], [59.8, [104.7, 1.17, 402.1]]], 'linear')(t), look: [109.45, 1.15, 390.9], fov: 30 });
  const callCam = (t) => { const pos = keys([[48.5, [111.55, 1.72, 392.2]], [55.85, [111.35, 1.72, 392.05]]], 'linear')(t); return { pos, look: aimAt(pos, [STAND[0] + 0.08, 1.66, STAND[1]], -0.4, 38, 0.08), fov: 38, shake: 0.6 }; };
  const closeCam = (t) => { const pos = keys([[69.2, [110.35, 1.8, 392.4]], [77, [110.17, 1.8, 392.2]]], 'linear')(t); return { pos, look: aimAt(pos, eyeAt(), -0.22, 34, 0.32), fov: 34, shake: 0.5 }; };
  // (where his head lies, found once on the pavement: the shot over his face is framed on it)
  let headS = null;
  const headAt = () => { if (!headS) { const h = B.head.getWorldPosition(V()); headS = [h.x, h.y, h.z]; } return headS; };
  const STREET = 1.32; // exposure in the shade of the street (the aerial keeps the grade's own)
  // (Mr. Big's shots: from his eyes in his study)
  const zr = (dx, dy, dz) => [boss.eye.x + dx, boss.eye.y + dy, boss.eye.z + dz];
  // Mr. Big on the call: leaning into the lens ('Mr. Big', 'guilty'), his head to one side, his cigar pointed at the lens
  // for the demand; the cigar at his lips as the call opens (the smoke he lets out as he starts to talk)
  const bossPuff = keys([[49.7, 1], [50.12, 0]]);
  const bossLean = keys([[50.55, 0], [52.6, 0.3], [54.2, 0.15], [57.1, 0.2], [57.7, 0.65], [59.6, 0.4], [61.35, 0.2], [63.2, 0.25], [63.9, 1], [65.0, 0.85], [66.6, 0.7]]);
  const bossTilt = keys([[61.35, 0], [63.3, 0], [63.9, 0.2], [65.0, 0.18], [65.5, 0.02]]);
  const bossPoint = keys([[65.15, 0], [65.6, 1], [66.4, 1], [66.8, 0.2]]);
  const shots = [
    // 1 the aerial: Murray Hill's roofs to the Empire State
    // (upright, it fills the tall screen: the tower is a tall subject, and the title is over it)
    { t: T.s1, exp: 1.04, cam: (t) => { const pos = keys([[0, [260, 140, 250]], [6, [200, 120, 330]]])(t); return { pos, look: aimAt(pos, keys([[0, [-80, 172, 686]], [6, [-80, 150, 686]]])(t), 0.52, 50, 0, false), fov: 50, band: false }; } },
    // 2 E 37th St from the Madison end, craning down to the roadster at the curb
    { t: T.s2, exp: 1.18, cam: (t) => ({ pos: keys([[6, [150, 7.0, 398.4]], [11, [124, 1.55, 397.6]]])(t), look: keys([[6, [70, 4, 392]], [11, [88, 0.9, 394.3]]])(t), fov: keys([[6, 40], [11, 30]])(t) }) },
    // 3 the door: it opens, Dan comes out reading, the bag at his hip; he looks up as his card lands; he walks toward us
    // to his mark (the shot ends before he walks into the lens)
    { t: T.s3, exp: STREET, cam: (t) => { const pos = keys([[11, [106.5, 0.95, 391.7]], [12.4, [106.55, 0.98, 391.68]], [14.8, [106.8, 1.36, 391.55]]])(t); return { pos, look: keys([[11, [112.1, 1.15, 388.0]], [13.2, [112.0, 1.12, 388.3]], [14.8, [110.2, 0.98, 389.9]]])(t), fov: keys([[12.6, 40], [14.8, 46]])(t) }; } },
    // 4 his phone (the overlay on the right): Dan on the left third
    { t: T.s4, exp: STREET, cam: (t) => { const pos = keys([[14.8, [105.25, 1.32, 393.18]], [18.9, [105.6, 1.34, 392.98]]], 'linear')(t); return { pos, look: aimAt(pos, [109, 0.74, 390.8], -0.42, 44), fov: 44 }; } },
    // 4b low on the street side, at the bag's height: the bag at his hip, him over it looking to his car ('Car, then a
    // lawyer'), the street running away behind him (the lens creeping in)
    { t: T.s4b, exp: STREET, cam: (t) => { const pos = keys([[18.9, [107.55, 0.34, 392.4]], [21, [107.75, 0.36, 392.2]]], 'linear')(t); return { pos, look: keys([[18.9, [109.0, 1.1, 390.95]], [21, [109.0, 1.16, 390.95]]])(t), fov: 50 }; } },
    // 5 low on the street, long lens: the van swings in from Madison and comes on, braking hard (the lens stays on it)
    { t: T.s5, exp: STREET, cam: (t) => {
      const v = vanAt(t), keyed = keys([[21, [154, 1.3, 404]], [22.4, [150, 1.2, 400.5]], [24.5, [119, 1.1, 395.4]]])(t);
      const w = keys([[21, 0], [22.2, 0.75], [24.0, 0.75], [24.5, 0.3]])(t);
      const look = v ? keyed.map((a, i) => lerp(a, [v.x, 1.15, v.z][i], w)) : keyed;
      return { pos: [121.5, 0.55, 400.9], look, fov: 26, shake: 0.7 };
    } },
    // 6 behind Dan, the reverse: the door rips open, the Suits hop down and come at him up the sidewalk (their faces)
    { t: T.s6, exp: STREET, cam: (t) => ({ pos: keys([[24.5, [106.6, 1.55, 391.7]], [27.5, [107.05, 1.58, 391.55]]], 'linear')(t), look: keys([[24.5, [116, 1.35, 393.4]], [26.0, [115.1, 1.45, 392.9]], [27.5, [112.8, 1.5, 391.7]]])(t), fov: 31, shake: 1.0 }) },
    // 7 over Knox's left shoulder onto Dan, the strap across his chest (the camera walks in with him)
    { t: T.s7, exp: STREET, cam: (t) => { const [bx, bz] = bPath(t), h = bHead(t), pos = ots(bx, bz, h, 1.95, -0.85, 1.78); return { pos, look: aimAt(pos, [109, 1.02, 390.8], -0.15, 38), fov: 38, shake: 1.1 }; } },
    // 8 from the building side, hip high: Hooks runs in past Knox to Dan's left, his hands on the bag, rips it off him
    // and holds it up to his chest, to us (his head in frame); Dan steps in reaching for it; whip after Hooks to the van
    { t: T.s8, exp: STREET, cam: (t) => ({ pos: keys([[32.5, [109.05, 1.05, 388.05]], [35.5, [109.25, 1.1, 388.15]]], 'linear')(t),
      look: keys([[32.5, [111.0, 0.95, 391.0]], [33.5, [110.1, 1.0, 390.65]], [33.95, [109.3, 1.02, 390.5]], [34.28, [109.4, 1.22, 390.35]], [T_RUN, [109.45, 1.24, 390.35]], [35.22, [111.6, 1.2, 391.0]], [35.5, [114.6, 1.25, 392.6]]])(t),
      fov: keys([[33.6, 50], [34.15, 40], [T_RUN, 40], [35.2, 46], [35.5, 50]])(t), shake: t > 33.8 && t < T_RUN ? 1.3 : t >= T_RUN ? 2.4 : 1.2 }) },
    // 9 behind Dan: he goes after them; cut to the two of them side on as Knox's hands land and Dan goes over; behind
    // him again as he lands at our feet
    { t: T.s9, exp: STREET, cam: (t) => ({ pos: [107.0, 1.32, 392.15], look: keys([[35.5, [110.5, 1.25, 391.0]], [36.0, [110.4, 1.2, 391.0]]])(t), fov: 42, shake: 1.6 }) },
    { t: T.s9b, exp: STREET, cam: (t) => ({ pos: keys([[36.0, [110.15, 1.18, 394.5]], [36.55, [110.0, 1.15, 394.45]]], 'linear')(t), look: keys([[36.0, [110.2, 1.1, 391.0]], [36.55, [109.9, 0.85, 391.0]]])(t), fov: 40, shake: t < 36.3 ? 4.5 : 2 }) },
    { t: T.s9c, exp: STREET, cam: (t) => ({ pos: [107.0, 1.32, 392.15], look: keys([[36.55, [109.6, 0.75, 391.0]], [37.3, [109.3, 0.6, 391.0]]])(t), fov: 42, shake: t < 36.9 ? 4 : 1.4 }) },
    // 10 behind the van: it tears away west past the roadster, Dan on the pavement on the right
    { t: T.s10, exp: STREET, cam: (t) => ({ pos: [124.5, 0.95, 396.8], look: keys([[38.5, [100, 1.05, 396.0]], [40.2, [100, 1.0, 396.2]], [41.3, [86, 1.0, 397.0]]])(t), fov: 36, shake: 0.9 }) },
    // 11a down with him on the pavement, over his face: dazed, his head rolling toward us; the camera creeps in, the
    // phone buzzing by his hand
    // (from his chest's side, looking down the length of him onto his face: the right way up)
    { t: T.s11a, exp: STREET, cam: (t) => { const hd = headAt(); return { pos: keys([[41.3, [hd[0] + 0.62, hd[1] + 0.66, hd[2] + 0.92]], [45, [hd[0] + 0.42, hd[1] + 0.48, hd[2] + 0.64]]], 'linear')(t), look: [hd[0] - 0.02, hd[1] - 0.03, hd[2] + 0.02], fov: 40 }; } },
    // 11b up he gets, the phone in his hand; it rings
    { t: T.s11b, exp: STREET, cam: (t) => ({ pos: keys([[45, [110.65, 1.1, 394.6]], [48.5, [110.55, 1.25, 394.3]]], 'linear')(t), look: keys([[45, [109.25, 0.55, 390.9]], [47.2, [109.45, 0.95, 390.95]], [48.5, [109.55, 1.25, 391.0]]])(t), fov: 42 }) },
    // the call: Dan on the left third, the call coming in over the right; he answers
    { t: T.call, exp: STREET, cam: callCam },
    // Mr. Big in his study, full frame (the city's frame is his: mission/mrbig.js)
    { t: T.bossA, exp: STREET, cam: callCam, boss: (t) => ({ pos: keys([[50.55, zr(0.36, -0.05, 2.1)], [54.25, zr(0.28, -0.03, 1.8)]], 'linear')(t), look: zr(0, -0.19, -0.1), fov: 34 }) },
    // Dan: 'Who is this?'
    { t: T.call2, exp: STREET, cam: callCam },
    // a lonely wide from across the street
    { t: T.wide, exp: STREET, cam: wideCam },
    // Mr. Big closer, the other side: 'They call me Mr. Big.'
    { t: T.bossB, exp: STREET, cam: wideCam, boss: (t) => ({ pos: keys([[57.1, zr(-0.32, 0.02, 1.68)], [59.8, zr(-0.26, 0.02, 1.46)]], 'linear')(t), look: zr(0, -0.2, 0), fov: 34 }) },
    // his face: 'Give it back.'
    { t: T.close1, exp: 1.5, cam: (t) => { const pos = keys([[59.8, [110.37, 1.8, 392.43]], [61.35, [110.33, 1.8, 392.38]]], 'linear')(t); return { pos, look: aimAt(pos, eyeAt(), -0.22, 34, 0.32), fov: 34, shake: 0.5 }; } },
    // Mr. Big: the stakes, leaning into the lens on 'guilty'; then close, his cigar at the lens: the demand
    { t: T.bossC, exp: 1.5, cam: closeCam, boss: (t) => ({ pos: keys([[61.35, zr(0.32, -0.04, 1.95)], [65, zr(0.2, -0.01, 1.4)]], 'linear')(t), look: zr(0, -0.16, 0), fov: 34 }) },
    { t: T.bossD, exp: 1.5, cam: closeCam, boss: (t) => ({ pos: keys([[65, zr(-0.12, -0.03, 1.3)], [66.6, zr(-0.1, -0.02, 1.16)]], 'linear')(t), look: zr(0.02, -0.19, 0), fov: 36 }) },
    // over his right shoulder onto the phone: Mr. Big on its screen
    { t: T.ots, exp: STREET, cam: (t) => {
      const k = smooth((t - T.ots) / 2.6), e = eyeAt(), F = fwd(PI / 2), R = right(PI / 2);
      const pos = [e[0] - F.x * lerp(0.62, 0.55, k) + R.x * 0.36, e[1] + lerp(0.14, 0.12, k), e[2] - F.z * lerp(0.62, 0.55, k) + R.z * 0.36];
      const pp = phone.getWorldPosition(V());
      return { pos, look: [pp.x + 0.0, pp.y + 0.0, pp.z - 0.05], fov: lerp(31, 27, k), shake: 0.5 };
    } },
    // his face: the tracker, the line to the lens
    { t: T.close, exp: 1.5, cam: closeCam },
    // 12 behind him, his car down the street: the title
    { t: T.s12, exp: STREET, cam: (t) => { const pos = keys([[77, ots(STAND[0], STAND[1], -1.41, 1.75, -0.8, 1.62)], [81, ots(STAND[0], STAND[1], -1.41, 1.45, -0.72, 1.6)]], 'linear')(t); return { pos, look: aimAt(pos, [88, 0.9, 394.4], -0.12, 32), fov: 32 }; } },
  ];
  const shotAt = (t) => { let s = shots[0]; for (const x of shots) if (x.t <= t) s = x; return s; };
  // (his eyes, steadied: the close's aim mustn't jitter with his breathing)
  let eyeS = null;
  const eyeAt = () => { const e = eyeOf(); if (!eyeS) eyeS = e; else eyeS = eyeS.map((a, i) => lerp(a, e[i], 0.08)); return eyeS; };

  // ---- the lines (speaker, colour, from, to, text): at most 15 characters a second
  const LINES = [
    ['Dan', WHITE, 13.4, 16.5, "'Delete your account.' Good morning to you too."],
    ['Dan', WHITE, 17.0, 20.6, 'Okay, okay. Car, then a lawyer, then I log off forever.'],
    ['Dan', WHITE, 20.75, 22.15, 'Kidding. Obviously.'],
    ['Knox', ACID, 25.75, 28.25, 'Yo! Banker boy! Huge fan. Sign my form?'],
    ['Dan', WHITE, 28.3, 31.45, "I don't sign forms on the street. I do 'please step back'."],
    ['Knox', ACID, 31.5, 34.9, "You've been let go. So now we're collecting something."],
    ['Dan', WHITE, 34.95, 36.35, 'Hey!'],
    ['Knox', ACID, 36.85, 39.8, 'Want it back? Pick up your phone. Stay humble.'],
    ['Mr. Big', ACID, 50.2, 54.2, 'Dan. Big fan. Great trades. Shame you never made any of them.'],
    ['Dan', WHITE, 54.4, 55.7, 'Who is this?'],
    ['Mr. Big', ACID, 55.9, 59.7, 'They call me Mr. Big. I run the bank. You ran errands.'],
    ['Dan', WHITE, 59.9, 61.2, 'Give it back.'],
    ['Mr. Big', ACID, 61.4, 64.9, 'Somebody has to be guilty. Your name is on every trade.'],
    ['Mr. Big', ACID, 65.0, 68.9, 'You sign the confession. Terms by text. And stop digging.'],
    ['Dan', WHITE, 69.7, 73.3, 'Did the CEO of my bank just ask me to confess?'],
    ['Dan', WHITE, 74.8, 76.8, 'Okay. You framed the wrong guy.'],
  ];
  const lineAt = (t) => LINES.find((l) => t >= l[2] && t < l[3]) || null;

  // ---- the voices: no words, but a voiced mumble under each phrase of a line as it starts (Dan a grown man's pitch,
  // Knox low; Mr. Big a low murmur on the line), and the Suits' walla under them as they come on
  const VOICE = { Dan: { f0: 120, p: -0.05 }, Knox: { f0: 104, p: 0.1 } };
  function voices() {
    const out = [];
    for (const [who, , a, b, text] of LINES) {
      // (a line with a recorded voice speaks it itself: wagmi/radio/voices.js, from the subtitle)
      const v = VOICE[who]; if (!v || text === 'Hey!' || W.voice?.has(who, text)) continue;
      const parts = text.match(/[^.?!]+[.?!']*/g) || [text], cps = text.length / (b - a);
      let at = a;
      for (const ph of parts) {
        const n = ph.trim().length; if (!n) continue;
        const dur = clamp(0.1 + n * 0.02, 0.2, 0.5), q = /\?/.test(ph);
        out.push([at + 0.03, () => sfx.play('mumble', { f0: v.f0 * (0.96 + Math.random() * 0.08), dur, gain: 0.3, p: v.p, q })]);
        at += ph.length / cps;
      }
    }
    // (the Suits' walla: the city's recorded crowd, loops.js crowd(), from 25.9 s to ~33 s)
    out.push([25.9, () => { const c = W.audio?.loop?.('crowd', { vol: 0.12 }); setTimeout(() => c?.stop(1.2), 6200); }]);
    return out;
  }

  // ---- the cues: once each, as the clock passes them (ui: also replayed on a seek into their span)
  // (it opens on the place, not on a second title (the owner, 24 Oct): the start gate's logo is taken down by the start
  // itself (run(): the trailer's black, or at once without one), never by a cue: run() draws frame 0 under the gate)
  let sound = {};
  const CUES = [
    [0.3, () => sfx.play('stinger', { gain: 0.3 })],
    [0.8, (r = 4.6) => ui.place('Murray Hill', 'E 37th St · Midtown · 5:45 PM', r), 4.6, true],
    [11.0, () => sfx.play('thunk', { gain: 0.12, f: 220, ring: false })],
    // (his card as he comes out of his door, ~13.1 s; the bag's once the lens has it at his hip, shot 4)
    [13.3, (r = 1.65) => ui.caption('Dan', 'the fall guy', YELLOW, r), 1.65, true],
    [15.0, (r = 1.6) => ui.caption('The laptop', 'the evidence', BLUE, r), 1.6, true],
    [15.3, () => { ui.phone.show('feed', { count: '18.4K', every: 520, items: [
      ['@rentisdue', 'delete your account.', '#EF4444', true], ['@pensionpaul', 'you front-ran my pension', '#FFC93C'], ['@retailrick', 'insider trading?? in THIS economy', '#B6FF3B', true],
      ['@hr_department', 'we know where u live', '#EF4444', true], ['@dogpark_dave', 'is moon ok tho', '#6CB8FF']] }); sfx.play('ding', { gain: 0.1 }); }, 2.85, true],
    [16.9, () => sfx.play('thunk', { gain: 0.1, f: 160, ring: false })],
    [18.45, () => ui.phone.hide()],
    [18.4, () => { sound.engine = sfx.engine(); sound.engine.set(0.5, 0); sound.bass = sfx.bass(); sound.bass.fadeTo(0, 0.1); }],
    [21.0, () => sfx.play('squeal', { gain: 0.25, dur: 1.0, p: 0.3 })],
    [23.3, () => sfx.play('squeal', { gain: 0.4, dur: 1.6, p: 0.1 })],
    [25.15, () => sfx.play('doorSlide', { gain: 0.8 })],
    [25.95, () => sfx.play('thunk', { gain: 0.2, f: 90, ring: false })],
    [26.3, () => sfx.play('thunk', { gain: 0.2, f: 90, ring: false })],
    [26.3, (r = 2.7) => ui.caption('The Suits', 'Knox & Hooks · JPBank security', ACID, r), 2.7, true],
    [33.6, () => sfx.play('whoosh', { gain: 0.15, dur: 0.4 })],
    [34.95, () => { if (!W.voice?.has('Dan', 'Hey!')) sfx.play('shout', { gain: 0.5, f0: 185, vowel: 'e', dur: 0.62 }); }],
    [36.06, () => { sfx.play('grunt', { gain: 0.5, f0: 105 }); sfx.play('shove', { gain: 0.85 }); sfx.play('hit', { gain: 0.5 }); }],
    [36.18, () => sfx.play('grunt', { gain: 0.55, f0: 165, vowel: 'o' })],
    [36.95, () => { sfx.play('fall', { gain: 0.85 }); sfx.play('grunt', { gain: 0.35, f0: 140, vowel: 'u', dur: 0.3 }); }],
    [35.9, () => sfx.play('doorSlide', { gain: 0.45, dur: 0.3 })],
    [39.1, () => sfx.play('thunk', { gain: 0.5, f: 65 })],
    [39.35, () => sfx.play('squeal', { gain: 0.45, dur: 1.5, p: -0.2 })],
    [42.4, () => sfx.play('buzz', { gain: 0.2, times: 3 })],
    [45.6, () => sfx.play('ring', { gain: 0.14, times: 2 })],
    [46.6, () => sfx.play('squeal', { gain: 0.08, dur: 0.8, p: -0.6 })],
    [48.5, () => { ui.phone.show('incoming', { name: 'UNKNOWN', what: 'Video call…' }); sfx.play('ring', { gain: 0.16, times: 1 }); }, 1.25, true],
    [49.7, () => { ui.phone.press(); sfx.play('thunk', { gain: 0.08, f: 400, ring: false }); }],
    [49.95, () => { ui.phone.hide(); sound.pulse = sfx.pulse({ bpm: 76 }); sound.pulse.fadeTo(0.35, 2); }],
    // Mr. Big's study, full frame, cut in hard and out hard (the call's frame over it: mission/ui.js call)
    [T.bossA, () => { ui.call(true); sfx.play('glitch', { gain: 0.12 }); }, T.call2 - T.bossA, true],
    [T.call2, () => ui.call(false)],
    [T.bossB, () => { ui.call(true, 'MR. BIG'); sfx.play('glitch', { gain: 0.12 }); }, T.close1 - T.bossB, true],
    [57.35, () => ui.caption('Mr. Big', 'CEO · JPBank', ACID, 2.4), 2.4, true],
    [T.close1, () => ui.call(false)],
    [T.bossC, () => { ui.call(true, 'MR. BIG'); sfx.play('glitch', { gain: 0.1 }); }, T.ots - T.bossC, true],
    [T.ots, () => ui.call(false)],
    [69.05, () => { sfx.play('hangup'); sound.pulse?.stop(1.5); }],
    [73.55, () => { ui.phone.show('tracker', { text: 'Laptop moving · 5th Ave' }); sfx.play('buzz', { gain: 0.13, times: 1 }); sfx.play('ding', { gain: 0.1 }); }, 2.95, true],
    [76.5, () => ui.phone.hide()],
    [77.5, () => { ui.title('Act I · Fall Guy', 'Bagged', 2.6); sfx.play('whoosh', { gain: 0.2 }); sfx.play('stinger', { gain: 0.42, notes: [130.81, 155.56, 196, 261.63] }); }, 3, true],
    ...voices(),
  ].sort((a, b) => a[0] - b[0]);
  // the phone's own screen through the scene
  const SCREENS = [[0, 'feed'], [36.1, 'off'], [42.35, 'incoming'], [49.7, 'video'], [69.05, 'ended'], [69.7, 'off'], [73.5, 'tracker']];
  const screenAt = (t) => { let s = 'off'; for (const [a, m] of SCREENS) if (a <= t) s = m; return s; };
  let cueAt = 0;
  function cues(t, seek) {
    if (seek) {
      // (the start gate's logo is not the opening's: left to the start, run())
      ui.phone.hide(); ui.caption(null); ui.titleOff(); ui.placeOff(); ui.call(false);
      // (what is left of each one's time: a cue that takes it holds only the rest of its span)
      cueAt = 0; while (cueAt < CUES.length && CUES[cueAt][0] <= t) { const c = CUES[cueAt]; if (c[3] && t < c[0] + (c[2] || 0)) c[1](c[0] + (c[2] || 0) - t); cueAt++; }
      return;
    }
    while (cueAt < CUES.length && CUES[cueAt][0] <= t) { try { CUES[cueAt][1](); } catch (e) { console.warn('[intro] cue', e); } cueAt++; }
  }

  // ---- posing helpers
  // (the mixer only writes a bone when its clip's value changes: a pose held still keeps whatever was done to the bone
  // over it the frame before, and a reach or a turn would pile up. So the bones worked on over the pose are put back
  // to the clean pose before each frame's)
  function keeper(list) {
    const bones = list.filter(Boolean), clean = bones.map((b) => b.quaternion.clone());
    return { restore() { bones.forEach((b, i) => b.quaternion.copy(clean[i])); }, save() { bones.forEach((b, i) => clean[i].copy(b.quaternion)); } };
  }
  const FINGERS = (side) => [2, 3, 4, 5].flatMap((f) => [1, 2, 3].map((j) => B[`finger${f}-${j}_${side}`])).filter(Boolean);
  const THUMB = (side) => [1, 2, 3].map((j) => B[`finger1-${j}_${side}`]).filter(Boolean);
  const qKeep = keeper([B.spine05, B.foot_L, B.foot_R, B.neck02, B.neck01, B.head, B.upperarm01_R, B.lowerarm01_R, B.upperarm01_L, B.lowerarm01_L, B.lowerarm02_R, B.lowerarm02_L, B.wrist_R, B.wrist_L,
    B.clavicle_R, B.clavicle_L, B.shoulder01_R, B.shoulder01_L, B.upperarm02_R, B.upperarm02_L, ...FINGERS('R'), ...THUMB('R'), ...FINGERS('L'), ...THUMB('L')]);
  // a hand turned so its fingers run along `along` and the back of it faces `facing` (world), by weight
  function orientHand(side, along, facing, w) {
    const wr = B[`wrist_${side}`], fm = B[`finger3-1_${side}`], ix = B[`finger2-1_${side}`], pk = B[`finger5-1_${side}`];
    if (!wr || !fm || !ix || !pk || w <= 0.001) return;
    const p0 = wr.getWorldPosition(V()), f = fm.getWorldPosition(V()).sub(p0).normalize();
    const across = ix.getWorldPosition(V()).sub(pk.getWorldPosition(V()));
    const n = (side === 'R' ? V().crossVectors(f, across) : V().crossVectors(across, f)).normalize();
    const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, n, V().crossVectors(f, n).normalize()));
    const fd = along.clone().normalize(), nd = facing.clone().addScaledVector(fd, -facing.dot(fd)).normalize();
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fd, nd, V().crossVectors(fd, nd).normalize()));
    const turn = q1.multiply(q0.invert());
    if (w < 0.999) turn.slerpQuaternions(new THREE.Quaternion(), turn.clone(), w);
    turnBone(wr, turn);
  }
  // (a hand turned about the forearm takes the forearm's twist bone part way with it: no wrung wrist)
  function shareTwist(side, k = 0.55) {
    const wr = B[`wrist_${side}`], tw = B[`lowerarm02_${side}`]; if (!tw || wr.parent !== tw) return;
    const d = wr.position.clone().normalize(), q = wr.quaternion, s = d.x * q.x + d.y * q.y + d.z * q.z;
    const part = new THREE.Quaternion().slerp(new THREE.Quaternion(d.x * s, d.y * s, d.z * s, q.w).normalize(), k);
    tw.quaternion.multiply(part); wr.quaternion.premultiply(part.invert()); tw.updateMatrixWorld(true);
  }
  // The fingers. Each curls about its own hinge (one axis for all its joints: the rig's bones all rest unturned), read
  // off the fist in his fight clip; the left hand's mirrored. A shape: the curls of the index, middle, ring and little
  // fingers [knuckle, middle, tip], the thumb's [base, middle, tip] and its base swung about the hand's length (radians),
  // set over the clip's own by weight.
  const HINGE = { 1: [0.92, -0.1, -0.38], 2: [0.45, 0.66, 0.6], 3: [0.43, 0.56, 0.71], 4: [0.39, 0.46, 0.8], 5: [0.35, 0.35, 0.87], len: [-0.42, -0.48, 0.77] };
  const hingeOf = (n, side) => { const [x, y, z] = HINGE[n]; return side === 'R' ? V(x, y, z).normalize() : V(x, -y, -z).normalize(); };
  const _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion();
  function shape(side, s, w = 1) {
    if (w <= 0.001) return;
    s.fingers.forEach((curl, i) => { const ax = hingeOf(i + 2, side); curl.forEach((a, j) => B[`finger${i + 2}-${j + 1}_${side}`]?.quaternion.slerp(_gq.setFromAxisAngle(ax, a), w)); });
    const [t1, t2, t3, sw] = s.thumb, ax = hingeOf(1, side);
    B[`finger1-1_${side}`]?.quaternion.slerp(_gq.setFromAxisAngle(hingeOf('len', side), sw).multiply(_gq2.setFromAxisAngle(ax, t1)), w);
    B[`finger1-2_${side}`]?.quaternion.slerp(_gq.setFromAxisAngle(ax, t2), w);
    B[`finger1-3_${side}`]?.quaternion.slerp(_gq.setFromAxisAngle(ax, t3), w);
    B[`wrist_${side}`].updateMatrixWorld(true);
  }
  // round the phone (the fingers round its far edge, the thumb over the screen); a loose fist; laid flat
  const SHAPES = {
    // (the fingers fitted to the phone as he holds it: nothing through it, the tips on the glass inside its far edge)
    phone: { fingers: [[-0.2, 0.7, 0.63], [0.35, 1.25, 1.13], [0.45, 1.2, 1.08], [0.55, 0.9, 0.81]], thumb: [0, 0.3, 0.2, 0] },
    lead: { fingers: [[0.75, 1.1, 0.6], [0.8, 1.2, 0.65], [0.85, 1.25, 0.65], [0.9, 1.25, 0.65]], thumb: [0.45, 0.4, 0.3, 0.15] },
    flat: { fingers: [[0.08, 0.15, 0.1], [0.1, 0.15, 0.1], [0.12, 0.18, 0.12], [0.15, 0.2, 0.12]], thumb: [0.1, 0.1, 0.05, -0.1] },
  };
  // a hand's frame: f along it (wrist to middle knuckle), a across it (to the index), p out of the palm; c the middle of
  // the palm
  function handFrame(side) {
    const w = B[`wrist_${side}`].getWorldPosition(V()), m = B[`finger3-1_${side}`].getWorldPosition(V());
    const len = w.distanceTo(m), f = m.clone().sub(w).divideScalar(len);
    const a = B[`finger2-1_${side}`].getWorldPosition(V()).sub(B[`finger5-1_${side}`].getWorldPosition(V()));
    a.addScaledVector(f, -a.dot(f)).normalize();
    return { w, f, a, p: side === 'R' ? V().crossVectors(a, f) : V().crossVectors(f, a), len, c: w.clone().addScaledVector(f, len * 0.5) };
  }
  // The phone in his right hand: its back on his palm, its screen out of it, the hand across it `tilt` from its length
  // (fingers to its far edge); its middle `along` the hand and `across` it (to the index) from the palm's, `depth` the
  // palm's flesh under the bones. Glued there: wherever the hand goes, so does the phone, and never through it.
  const HOLD = { tilt: 1.05, along: 0.012, across: -0.004, depth: 0.017 };
  const PHONE_HALF = 0.0045;
  function gluePhone() {
    const H = handFrame('R'), st = Math.sin(HOLD.tilt), ct = Math.cos(HOLD.tilt);
    const U = H.f.clone().multiplyScalar(ct).addScaledVector(H.a, st), N = H.p, S = V().crossVectors(U, N).normalize();
    _m.makeBasis(S, U, N); phone.quaternion.setFromRotationMatrix(_m);
    phone.position.copy(H.c).addScaledVector(H.f, HOLD.along).addScaledVector(H.a, HOLD.across).addScaledVector(N, HOLD.depth + PHONE_HALF);
  }
  // and the other way: where the right hand goes for the phone to be at C, its screen N, its top U (S its right): the
  // wrist's place and the hand's length and palm
  function handForPhone(C, S, U, N) {
    const st = Math.sin(HOLD.tilt), ct = Math.cos(HOLD.tilt), len = HAND_LEN();
    const f = U.clone().multiplyScalar(ct).addScaledVector(S, -st), a = U.clone().multiplyScalar(st).addScaledVector(S, ct);
    const w = C.clone().addScaledVector(N, -(HOLD.depth + PHONE_HALF)).addScaledVector(a, -HOLD.across).addScaledVector(f, -(HOLD.along + len * 0.5));
    return { w, f, back: N.clone().negate() };
  }
  let handLen = 0;
  const HAND_LEN = () => handLen || (handLen = B.wrist_R.getWorldPosition(V()).distanceTo(B['finger3-1_R'].getWorldPosition(V())));
  // His thumb on the glass: its last joint reached to a point on the screen ([x, y] from its middle, metres), the
  // knuckle out over the edge, the tip laid along the glass toward the far corner. Reading his feed it strokes up the
  // screen every so often; on the call it rests low by the edge.
  const THUMB_ON = { rest: [0.022, 0.012], up: [0.01, 0.042], r: 0.0095 };
  function thumbAt(t) {
    if (!(t < 24 && screenAt(t) === 'feed')) return THUMB_ON.rest;
    const c = ((t - 11.6) % 1.45) / 1.45, k = c < 0.22 ? smooth(c / 0.22) : 1 - smooth((c - 0.3) / 0.45);
    return [lerp(THUMB_ON.rest[0], THUMB_ON.up[0], k), lerp(THUMB_ON.rest[1], THUMB_ON.up[1], k)];
  }
  function thumbOn([x, y], w = 1) {
    if (w <= 0.001) return;
    const b1 = B['finger1-1_R'], b2 = B['finger1-2_R'], b3 = B['finger1-3_R']; if (!b1 || !b2 || !b3) return;
    phone.updateMatrixWorld(true);
    const e = phone.matrixWorld.elements, S = V(e[0], e[1], e[2]).normalize(), U = V(e[4], e[5], e[6]).normalize(), N = V(e[8], e[9], e[10]).normalize();
    const tg = phone.position.clone().addScaledVector(S, x).addScaledVector(U, y).addScaledVector(N, PHONE_HALF + THUMB_ON.r);
    const q3 = b3.quaternion.clone();
    reach(b1, b2, b3, tg, b2.getWorldPosition(V()).addScaledVector(N, 1).addScaledVector(S, 0.6), w);
    // (the last bone: along the glass, a little into it)
    const d = b3.position.clone().normalize().transformDirection(b3.matrixWorld), want = S.clone().multiplyScalar(-0.55).addScaledVector(U, 0.8).addScaledVector(N, -0.12).normalize();
    turnBone(b3, new THREE.Quaternion().setFromUnitVectors(d, want));
    if (w < 0.999) b3.quaternion.slerpQuaternions(q3, b3.quaternion.clone(), w);
    b3.updateMatrixWorld(true);
  }
  // (the loader drops the dots from the thug's bone names: 'upperArm.L' is 'upperArmL')
  const thugKeep = (d) => keeper(['spine', 'spine1', 'spine2', 'neck', 'head', 'upperArmL', 'forearmL', 'upperArmR', 'forearmR'].map((n) => d.bones[n]));
  // a Suit's head (and a little of his neck) turned toward a world point, by weight
  function thugLook(d, target, w) {
    const head = d.bones.head; if (!head) return;
    for (const [bone, share] of [[d.bones.neck, 0.4], [head, 1]]) {
      if (!bone) continue;
      const f = V(0, 0, 1).applyQuaternion(d.root.quaternion).normalize(), hp = head.getWorldPosition(V());
      // (his facing, tipped by how far his head is already bent: from the head bone's own up)
      const up = V(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      const fw = f.clone().addScaledVector(up, -f.dot(up)).normalize();
      const want = target.clone().sub(hp).normalize(), ang = Math.min(fw.angleTo(want), 0.9);
      if (ang < 1e-3) continue;
      turnBone(bone, new THREE.Quaternion().setFromAxisAngle(V().crossVectors(fw, want).normalize(), ang * share * w));
    }
  }
  const bKeep = thugKeep(knox), sKeep = thugKeep(hooks);
  function stand(who, x, z, y, h, t) {
    who.root.position.set(x, y, z); who.root.rotation.y = h;
    (who === knox ? bKeep : who === hooks ? sKeep : null)?.restore();
    who.rig.pose(t);
    who.root.updateMatrixWorld(true);
    (who === knox ? bKeep : who === hooks ? sKeep : null)?.save();
  }
  // two-bone reach (an arm) for a world point, its elbow toward pole (world)
  function reach(b1, b2, b3, target, pole, w = 1) {
    if (!b1 || !b2 || !b3 || w <= 0) return;
    const q1 = b1.quaternion.clone(), q2 = b2.quaternion.clone();
    const turn = (b, q) => { b.getWorldQuaternion(_q); const want = q.clone().multiply(_q); b.parent.getWorldQuaternion(_q); b.quaternion.copy(_q.invert().multiply(want)); b.updateMatrixWorld(true); };
    const a = b1.getWorldPosition(V()), b = b2.getWorldPosition(V()), c = b3.getWorldPosition(V());
    const la = a.distanceTo(b), lb = b.distanceTo(c), d = clamp(target.distanceTo(a), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
    const cur = V().subVectors(a, b).normalize().angleTo(V().subVectors(c, b).normalize());
    const want = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
    let n = V().crossVectors(V().subVectors(a, b), V().subVectors(c, b)); if (n.lengthSq() < 1e-8) n.set(1, 0, 0); n.normalize();
    turn(b2, new THREE.Quaternion().setFromAxisAngle(n, want - cur));
    b3.getWorldPosition(c);
    turn(b1, new THREE.Quaternion().setFromUnitVectors(V().subVectors(c, a).normalize(), V().subVectors(target, a).normalize()));
    if (pole) {
      b2.getWorldPosition(b);
      const ax = V().subVectors(target, a).normalize(), e = V().subVectors(b, a); e.addScaledVector(ax, -e.dot(ax));
      const p = pole.clone().sub(a); p.addScaledVector(ax, -p.dot(ax));
      if (e.lengthSq() > 1e-6 && p.lengthSq() > 1e-6) { let ang = e.angleTo(p); if (V().crossVectors(e, p).dot(ax) < 0) ang = -ang; turn(b1, new THREE.Quaternion().setFromAxisAngle(ax, ang)); }
    }
    if (w < 0.999) { b1.quaternion.slerpQuaternions(q1, b1.quaternion.clone(), w); b2.quaternion.slerpQuaternions(q2, b2.quaternion.clone(), w); b1.updateMatrixWorld(true); }
  }
  // turn a bone by a world rotation
  function turnBone(b, q) { b.getWorldQuaternion(_q); const want = q.clone().multiply(_q); b.parent.getWorldQuaternion(_q); b.quaternion.copy(_q.invert().multiply(want)); b.updateMatrixWorld(true); }
  // Dan's head (and a little of his neck) turned toward a world point, by weight, within a neck's reach
  function headLook(target, w, maxA = 1.0) {
    if (!target || w <= 0.01) return;
    for (const [bone, share] of [[B.neck02 || B.neck01, 0.35], [B.head, 1]]) {
      const f = qRig.headFwd.clone().applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const want = target.clone().sub(B.head.getWorldPosition(V())).normalize();
      const ang = Math.min(f.angleTo(want), maxA);
      if (ang < 1e-3) continue;
      const axis = V().crossVectors(f, want).normalize();
      turnBone(bone, new THREE.Quaternion().setFromAxisAngle(axis, ang * share * w));
    }
  }
  const fwd = (h, out = V()) => out.set(Math.sin(h), 0, Math.cos(h));
  const right = (h, out = V()) => out.set(-Math.cos(h), 0, Math.sin(h));
  // where the phone sits in front of him: C its middle, its screen (N) to his eyes, its top (U) away from him
  function phoneFrame(mode) {
    const h = P.mesh.rotation.y, F = fwd(h), R = right(h);
    const e = eyeOf(), eye = V(e[0], e[1], e[2]);
    // read: in front of his chest, a little to his right, near enough that his elbow stays bent by his side (not held
    // out on a flat palm), its screen tipped up toward his face more than square to his eyes; call: up at his chin
    const C = mode === 'call' ? eye.clone().addScaledVector(F, 0.31).add(V(0, -0.22, 0)).addScaledVector(R, 0.1)
      : eye.clone().addScaledVector(F, 0.26).add(V(0, -0.35, 0)).addScaledVector(R, 0.07);
    const N = eye.clone().sub(C).normalize();
    if (mode !== 'call') N.addScaledVector(F, -0.3).normalize();
    const U = V(0, 1, 0).addScaledVector(F, mode === 'call' ? 0.15 : 1.0); U.addScaledVector(N, -U.dot(N)).normalize();
    const S = V().crossVectors(U, N).normalize();
    return { C, N, U, S, F, R };
  }
  // the phone in his right hand (by his side, dropping it, picking it up): his fingers round it
  function phoneInHand(w = 1) { shape('R', SHAPES.phone, w); gluePhone(); thumbOn(THUMB_ON.rest, w); }
  let phoneGround = null; // (where it lies: under his hand as he gets up, found once)
  function findPhoneGround() {
    const sv = { p: P.mesh.position.clone(), h: P.mesh.rotation.y };
    P.mesh.position.set(GETUP0[0], cm.getGroundHeight(GETUP0[0], GETUP0[1], 'person'), GETUP0[1]); P.mesh.rotation.y = PI / 2;
    qKeep.restore(); qRig.pose(T_PICK); P.mesh.updateMatrixWorld(true);
    const hnd = (B['finger3-1_R'] || B.wrist_R).getWorldPosition(V());
    P.mesh.position.copy(sv.p); P.mesh.rotation.y = sv.h;
    return V(hnd.x, 0.226, hnd.z);
  }
  const T_PICK = 45.72;
  const PHONE_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(-PI / 2, 0, 0.7)); // (lying face up)
  const standK = keys([[0, 1], [35.4, 1], [35.7, 0], [46.4, 0], [47.4, 1]]);
  const flatK = keys([[36.45, 0], [36.95, 1], [45.2, 1], [45.5, 0]]);
  // his back laid on the pavement (k 0..1): the back of his head resting on it
  function layFlat(k) {
    const hip = B.spine05.getWorldPosition(V()), d = B.head.getWorldPosition(V()).sub(hip), flat = Math.hypot(d.x, d.z);
    if (flat < 0.05) return;
    const L = d.length(), want = Math.asin(clamp((P.position.y + 0.1 - hip.y) / L, -0.9, 0.9)), cur = Math.atan2(d.y, flat);
    const axis = V(d.x, 0, d.z).normalize().cross(V(0, 1, 0)).normalize();
    turnBone(B.spine05, new THREE.Quaternion().setFromAxisAngle(axis, -(cur - want) * k));
    // and square on his back, his shoulders level (the clip leaves him rolled onto his right side)
    const ax = B.head.getWorldPosition(V()).sub(B.spine05.getWorldPosition(V())).normalize();
    const sh = B.upperarm01_R.getWorldPosition(V()).sub(B.upperarm01_L.getWorldPosition(V()));
    const a0 = sh.clone().addScaledVector(ax, -sh.dot(ax)).normalize(), a1 = sh.clone().setY(0); a1.addScaledVector(ax, -a1.dot(ax)).normalize();
    let roll = a0.angleTo(a1); if (V().crossVectors(a0, a1).dot(ax) < 0) roll = -roll;
    turnBone(B.spine05, new THREE.Quaternion().setFromAxisAngle(ax, roll * k));
  }
  // His shoulders and arms down on the pavement. The fall's clip ends with his arms flung over his head and his
  // shoulders hunched up and back round his ears for it: laid down beside him from there, the near shoulder caved into
  // his chest and the elbow went through the pavement. So down there the shoulders go back to their rest (his idle's,
  // standing: down, easy) and each arm is laid out from it, as a man lies when he has been put down hard on his back:
  // the upper arm along the pavement a little out from his side [ARMS_DOWN: its angle out from his length], the elbow on
  // the stone, the forearm back in toward his hip a little [its angle], the hand palm down on the stone, rolled a little
  // onto its outer edge [roll], the fingers easy. Each joint is put where it lies (the wrist reached to its place, the
  // elbow to its own), so nothing goes through the stone or through him.
  const GIRDLE = (s) => [`clavicle_${s}`, `shoulder01_${s}`], ARM = (s) => [`upperarm01_${s}`, `upperarm02_${s}`, `lowerarm01_${s}`, `lowerarm02_${s}`, `wrist_${s}`];
  let armRest = null; // (the rest: found once, from his idle)
  function findArmRest() {
    qKeep.restore(); qRig.pose(1);
    const r = {}; for (const s of ['R', 'L']) for (const n of [...GIRDLE(s), ...ARM(s)]) if (B[n]) r[n] = B[n].quaternion.clone();
    return r;
  }
  function settleShoulders(k) {
    if (k <= 0.001 || !armRest) return;
    for (const s of ['R', 'L']) { for (const n of GIRDLE(s)) B[n]?.quaternion.slerp(armRest[n], k); B[`clavicle_${s}`]?.updateMatrixWorld(true); }
  }
  // (and once his back is flat, back onto the stone, his shoulder blades flat on it: each collarbone turned back about
  // his length until the shoulder's joint is SHOULDER_Y over it; standing's rest would have them rounded up off it)
  const SHOULDER_Y = 0.12;
  function shouldersDown(k) {
    if (k <= 0.001 || !armRest) return;
    const g = P.position.y, len = B.spine05.getWorldPosition(V()).sub(B.head.getWorldPosition(V())).setY(0).normalize(), up = V(0, 1, 0);
    for (const s of ['R', 'L']) {
      const cl = B[`clavicle_${s}`], c = cl.getWorldPosition(V()), v = B[`upperarm01_${s}`].getWorldPosition(V()).sub(c);
      const o = V().crossVectors(up, len); if (o.dot(v) < 0) o.negate();
      const n = V().crossVectors(o, up).normalize(); v.addScaledVector(len, -v.dot(len));
      const r = v.length(); if (r < 0.02) continue;
      const cur = Math.atan2(v.dot(up), v.dot(o)), want = Math.asin(clamp((g + SHOULDER_Y - c.y) / r, -0.95, 0.95));
      if (want < cur) turnBone(cl, new THREE.Quaternion().setFromAxisAngle(n, (want - cur) * k));
    }
  }
  // (radians: the upper arm out from his length, the forearm's; the hand rolled out; the heights of the elbow and the
  // wrist over the stone, the arm's flesh under the joint)
  const ARMS_DOWN = { R: { up: 0.5, fore: 0.2, roll: 0.35 }, L: { up: 0.6, fore: 0.3, roll: 0.45 } }, ELBOW_Y = 0.045, WRIST_Y = 0.035;
  function armsDown(k) {
    if (k <= 0.001 || !armRest) return;
    shouldersDown(k);
    const g = P.position.y, feet = B.spine05.getWorldPosition(V()).sub(B.head.getWorldPosition(V())).setY(0).normalize();
    const out = B.upperarm01_R.getWorldPosition(V()).sub(B.upperarm01_L.getWorldPosition(V())).setY(0).normalize(); // (to his right)
    for (const side of ['R', 'L']) {
      const b1 = B[`upperarm01_${side}`], b2 = B[`lowerarm01_${side}`], b3 = B[`wrist_${side}`], a = ARMS_DOWN[side];
      // (from the arm's rest, so the elbow bends on its own hinge)
      for (const n of ARM(side)) B[n]?.quaternion.slerp(armRest[n], k);
      b1.updateMatrixWorld(true);
      const o = side === 'R' ? out : out.clone().negate(), sh = b1.getWorldPosition(V()), el0 = b2.getWorldPosition(V());
      const la = sh.distanceTo(el0), lb = el0.distanceTo(b3.getWorldPosition(V()));
      const flat = (ang) => feet.clone().multiplyScalar(Math.cos(ang)).addScaledVector(o, Math.sin(ang));
      const dy1 = Math.min(0, g + ELBOW_Y - sh.y), el = sh.clone().addScaledVector(flat(a.up), Math.sqrt(Math.max(0, la * la - dy1 * dy1))); el.y = sh.y + dy1;
      const dy2 = Math.min(0, g + WRIST_Y - el.y), wr = el.clone().addScaledVector(flat(a.fore), Math.sqrt(Math.max(0, lb * lb - dy2 * dy2))); wr.y = el.y + dy2;
      reach(b1, b2, b3, wr, el, k);
      orientHand(side, flat(a.fore - 0.12), V(0, 1, 0).addScaledVector(o, a.roll), k);
      shareTwist(side, 0.55 * k);
      shape(side, SHAPES.flat, k);
    }
  }
  const armsK = keys([[36.5, 0], [36.95, 1], [45.2, 1], [45.42, 0]]);
  // his hand out after the bag as Hooks rips it away
  const reachK = keys([[34.32, 0], [34.62, 1], [35.25, 1], [35.5, 0]]);

  // ---- the frame: everything at time t
  const grade = app.postFX?.colorGrade, exp0 = grade?.exposure.value ?? 1.04;
  // the cutscene's own grade: the golden hour warmer and richer than the street's daylight (eased back at the end)
  const LOOK0 = grade ? { bal: grade.balance.value.clone(), sat: grade.saturation.value, con: grade.contrast.value } : null;
  const WARM = { bal: V(1.1, 1.0, 0.86), sat: 1.14, con: 1.15 };
  function setGrade(k, exp) {
    if (!grade) return;
    grade.exposure.value = exp;
    grade.balance.value.copy(LOOK0.bal).lerp(WARM.bal, k); grade.saturation.value = lerp(LOOK0.sat, WARM.sat, k); grade.contrast.value = lerp(LOOK0.con, WARM.con, k);
  }
  let t = 0, playing = false, rate = 1, lastT = -1, done = null, skipped = false;
  // (the bag as it sits on him this frame)
  const onP = V(), onQ = new THREE.Quaternion(), heldQ = new THREE.Quaternion(), _e = new THREE.Euler();
  const duck = keys([[35.95, 1], [36.05, 0.3], [36.95, 0.3], [37.6, 1]]);
  function frame(dt) {
    const seek = Math.abs(t - lastT) > 0.5 || lastT < 0;
    const sdt = seek ? 0 : dt * rate;
    if (seek) eyeS = null;
    // the van
    const vp = vanAt(t);
    van.group.visible = !!vp;
    if (vp) {
      van.group.position.set(vp.x, 0, vp.z); van.group.rotation.y = vp.h;
      van.setDoor(vanDoor(t));
      van.update(sdt, vp.v, clamp((vp.k || 0) * 2.6, -0.5, 0.5), clamp(-(vp.k || 0) * vp.v * vp.v * 0.004, -0.05, 0.05));
    }
    // the sound of the van: its engine and its bass by how far it is from the camera (ducked under the shove)
    if (sound.engine) {
      const c = D.camera.pos, d = vp ? Math.hypot(vp.x - c[0], vp.z - c[2]) : 999, near = clamp(14 / Math.max(6, d)), dk = duck(t);
      sound.engine.set(clamp((vp?.v || 0) / 20), vp ? 0.45 * near * dk : 0);
      sound.bass.fadeTo(vp ? 0.36 * near * (0.35 + 0.65 * vanDoor(t)) * dk : 0, 0.05); sound.bass.open(vp ? vanDoor(t) : 0);
      if (t > 50) { sound.engine.stop(0.5); sound.bass.stop(0.5); sound.engine = sound.bass = null; }
    }
    set.door(keys([[10.95, 0], [11.55, 1, 'out'], [15.9, 1], [16.9, 0]])(t));
    // Dan
    const q = danAt(t);
    P.position.set(q.x, cm.getGroundHeight(q.x, q.z, 'person'), q.z); P.heading = q.h; P.speed = 0; P.verticalVel = 0;
    P.mesh.position.copy(P.position); P.mesh.rotation.y = q.h; P.mesh.visible = q.vis;
    qKeep.restore();
    qRig.pose(t);
    qKeep.save();
    Qn.body.position.y = 0; Qn.body.rotation.x = 0;
    P.mesh.updateMatrixWorld(true);
    // (his clips stand him with his head a hand ahead of his hips, as if into a wind: on his feet his back is brought
    // upright over his hips, measured each frame; down on the pavement it is laid flat on it, where the clip left his
    // shoulders and head propped up off the ground)
    const sk = standK(t);
    if (sk > 0) upright(W, q.h, sk);
    // (on the pavement his shoulders settle, before his back is squared on it by them)
    const ak = armsK(t);
    settleShoulders(ak);
    const fk = flatK(t);
    if (fk > 0) layFlat(fk);
    // (where his bag sits on him as he stands this frame)
    bag.onHim(onP, onQ);
    // his hands and the phone
    const ph = phoneAt(t);
    phone.visible = ph.mode !== 'none' && q.vis;
    if (!phoneGround) { phoneGround = findPhoneGround(); armRest = findArmRest(); qKeep.restore(); qRig.pose(t); qKeep.save(); P.mesh.updateMatrixWorld(true); }
    // (on the pavement his arms lie on it beside him)
    armsDown(ak);
    if (ph.mode === 'held') {
      const up = upW(t);
      if (up > 0.001) {
        // where he holds it up: read low, or up at his chin on the call
        const ck = callK(t), fr = phoneFrame('read'), fc = phoneFrame('call'), F = fr.F, R = fr.R;
        const C = fr.C.clone().lerp(fc.C, ck), N = fr.N.clone().lerp(fc.N, ck).normalize(), U = fr.U.clone().lerp(fc.U, ck);
        U.addScaledVector(N, -U.dot(N)).normalize(); const S = V().crossVectors(U, N).normalize();
        // his right hand where it holds it there: the wrist reached to its place, the elbow down by his side, the hand
        // turned palm to the phone's back
        const hd = handForPhone(C, S, U, N), sh = B.upperarm01_R.getWorldPosition(V());
        reach(B.upperarm01_R, B.lowerarm01_R, B.wrist_R, hd.w, sh.clone().add(V(0, -1, 0)).addScaledVector(R, 0.5).addScaledVector(F, -0.3), up);
        orientHand('R', hd.f, hd.back, up);
        shareTwist('R', 0.55 * up);
      }
      // the phone in it, his thumb on the screen
      shape('R', SHAPES.phone); gluePhone(); thumbOn(thumbAt(t));
    } else if (ph.mode === 'drop') {
      // (out of his hand as he goes over, turning flat as it falls)
      phoneInHand(1 - smooth(ph.since / 0.2)); const k = ease.in(ph.since / 0.38);
      const from = phone.position.clone(); phone.position.lerpVectors(from, phoneGround, k); phone.position.y += Math.sin(k * PI) * 0.15;
      phone.quaternion.slerp(PHONE_DOWN, k);
    } else if (ph.mode === 'ground') {
      const buzz = (t > 42.4 && t < 44.3 && (t - 42.4) % 0.62 < 0.4) ? (Math.random() - 0.5) * 0.004 : 0;
      phone.position.set(phoneGround.x + buzz, phoneGround.y, phoneGround.z); phone.quaternion.copy(PHONE_DOWN);
    } else if (ph.mode === 'pick') {
      // the get-up's right hand comes down on it: a reach to it, then it is in his hand
      const sh = B.upperarm01_R.getWorldPosition(V());
      reach(B.upperarm01_R, B.lowerarm01_R, B.wrist_R, phoneGround.clone().add(V(0, 0.05, 0)), sh.clone().add(V(0, 0, 1)), pickW(t));
      if (t < T_PICK) { shape('R', SHAPES.flat, pickW(t)); phone.position.copy(phoneGround); phone.quaternion.copy(PHONE_DOWN); } else phoneInHand(smooth((t - T_PICK) / 0.12));
    }
    if (phone.visible) phone.show(screenAt(t), t);
    // (where he looks, and his hand out after the bag: once the bag is where it is this frame, below)
    // the Suits
    for (const [who, path, head, yy, from, to] of [[knox, bPath, bHead, bY, 25.6, 38.85], [hooks, sPath, sHead, sY, 25.95, 36.42]]) {
      who.root.visible = t >= from && t < to + 0.05;
      if (!who.root.visible) continue;
      const [x, z] = path(t);
      stand(who, x, z, yy(t), head(t), t);
    }
    // Knox looks down at the bag on 'collecting something'
    const bl = bLookBag(t);
    if (knox.root.visible && bl > 0.01) thugLook(knox, onP.clone().add(V(0, 0.08, 0)), bl);
    // Knox's shove: both hands to Dan's chest as he comes in, then out at full stretch after him as he goes over,
    // Knox leaning into it
    if (knox.root.visible && shoveW(t) > 0) {
      const r = right(knox.root.rotation.y), f = fwd(knox.root.rotation.y), w = shoveW(t), ln = shoveLean(t);
      for (const b of ['spine1', 'spine2']) if (knox.bones[b]) turnBone(knox.bones[b], new THREE.Quaternion().setFromAxisAngle(r, -0.16 * ln));
      const bc = knox.bones.spine2.getWorldPosition(V()), chest = (B.spine03 || B.spine02).getWorldPosition(V());
      const out = bc.clone().addScaledVector(f, 0.64).add(V(0, -0.04, 0)), k = smooth((t - 36.1) / 0.22);
      const tgt = chest.addScaledVector(f, -0.06).lerp(out, k);
      for (const [sd, sg] of [['L', -1], ['R', 1]]) reach(knox.bones['upperArm' + sd], knox.bones['forearm' + sd], knox.bones['hand' + sd], tgt.clone().addScaledVector(r, 0.13 * sg), bc.clone().addScaledVector(r, 0.7 * sg).add(V(0, -0.5, 0)), w);
    }
    // Hooks takes the bag: bent a little to it at Dan's hip, his hands on its top; ripped off him and up to his chest,
    // its front to us as he straightens, then run to the van (the strap off Dan with it, hanging from its rings)
    let held = false;
    bag.at(onP, onQ);
    if (hooks.root.visible) {
      const k = scoop(t), r = right(hooks.root.rotation.y), lf = r.clone().negate();
      // (bending forward: a negative turn about his right)
      if (k > 0) for (const b of ['spine', 'spine1', 'spine2']) { const bone = hooks.bones[b]; if (bone) turnBone(bone, new THREE.Quaternion().setFromAxisAngle(r, -0.17 * k)); }
      const chest = hooks.bones.spine2.getWorldPosition(V());
      if (t >= T_GRAB) {
        held = true;
        const f = fwd(hooks.root.rotation.y), lift = smooth((t - T_GRAB) / 0.32);
        const hp = chest.clone().addScaledVector(f, 0.24).add(V(0, -0.2, 0));
        heldQ.setFromEuler(_e.set(0, hooks.root.rotation.y, 0.1 * lift));
        bag.at(onP.clone().lerp(hp, lift), onQ.clone().slerp(heldQ, lift));
      }
      if (t >= T_GRAB || k > 0) {
        const [cl, cr] = bag.corners(lf), w = t >= T_GRAB ? 1 : k;
        reach(hooks.bones['upperArmL'], hooks.bones['forearmL'], hooks.bones['handL'], cl.add(V(0, 0.03, 0)), chest.clone().addScaledVector(r, -0.6).add(V(0, -0.5, 0)), w);
        reach(hooks.bones['upperArmR'], hooks.bones['forearmR'], hooks.bones['handR'], cr.add(V(0, 0.03, 0)), chest.clone().addScaledVector(r, 0.6).add(V(0, -0.5, 0)), w);
      }
    }
    // the bag: on him (its strap across him) from the door until it is ripped off; then in Hooks' hands, the strap
    // hanging from its rings; gone with him into the van
    const bagOn = t < T_GRAB && P.mesh.visible;
    bag.group.visible = bagOn || (held && hooks.root.visible); bag.strap.visible = bagOn;
    bag.sling.mesh.visible = bag.group.visible && !bagOn;
    if (bag.sling.mesh.visible) {
      if (seek) bag.sling.reset();
      const [ra, rb] = bag.rings(); bag.sling.update(seek ? 1 / 30 : sdt, ra, rb, 0.23);
    }
    // where he looks (after the bag: it is one of the things he looks at)
    const lk = lookAt(t);
    if (lk.what) {
      const tg = lk.what === 'phone' ? phone.getWorldPosition(V()) : lk.what === 'bag' ? bag.group.getWorldPosition(V()) : lk.what === 'car' ? V(MARK.car[0], 0.9, MARK.car[2])
        : lk.what === 'van' ? (vp ? V(vp.x, 1.4, vp.z) : null) : lk.what === 'lens' ? offLens() : lk.what === 'cam' ? V(...D.camera.pos) : null;
      if (lk.what === 'cam') headLook(tg, smooth((lk.since - 0.6) / 1.6) * 0.8, 1.4);
      else headLook(tg, smooth(lk.since / 0.35) * (lk.what === 'lens' ? 0.7 : lk.what === 'phone' ? lerp(0.85, 0.3, callK(t)) : 0.9));
    }
    // his left hand out after it
    const rk = reachK(t);
    if (rk > 0.001) {
      const sl = B.upperarm01_L.getWorldPosition(V()), m = bag.group.getWorldPosition(V());
      reach(B.upperarm01_L, B.lowerarm01_L, B.wrist_L, sl.clone().lerp(m, 0.6), sl.clone().add(V(0, -1, 0)).addScaledVector(fwd(q.h), -0.3), rk);
    }
    // the street's extras and parked cars
    street.update(t, sdt, seek, D.camera.pos);
    // the camera
    const s = shotAt(t), c = api.cam || s.cam(t);
    D.camera.pos = c.pos; D.camera.look = c.look; D.camera.fov = c.fov; D.camera.roll = 0; D.camera.band = c.band;
    D.camera.shake = c.shake && !api.cam ? handheld(t * 1.0, c.shake) : null;
    setGrade(t < 6 ? smooth(t / 6) : 1, s.exp ?? exp0);
    // Mr. Big's study: full frame in his shots, and on Dan's phone while the call is up
    const zc = api.bossCam || (!api.cam && s.boss ? s.boss(t) : null), feed = phone.visible && screenAt(t) === 'video';
    // (his room through the band too, upright: cine.js shotFov)
    boss.full(zc && app.cameraSystem.portK?.() ? { ...zc, fov: shotFov(app.cameraSystem, zc.fov, zc.band !== false) } : zc); boss.phone(feed);
    // (in his room the street goes quiet)
    if (zc && playing) W.audio?.duck?.('amb', 0.85, 0.12);
    if (zc || feed) boss.pose(t, { lean: bossLean(t), tilt: bossTilt(t), point: bossPoint(t), puff: bossPuff(t), stand: !!api.bossStand });
    // the words
    const L = borrow.quiet ? null : lineAt(t);
    if (!borrow.quiet) ui.sub(L ? L[0] : null, L ? L[4] : null, L ? L[1] : WHITE);
    const bossTalks = L && L[0] === 'Mr. Big';
    // (Mr. Big's recorded voice, when his line has one: the meters follow it; else the murmur on the line)
    const bossVoiced = bossTalks && W.voice?.has('Mr. Big', L[4]);
    if (sound.voice) sound.voice.talk(bossTalks && playing && !bossVoiced);
    if (bossTalks) { const lv = bossVoiced ? Math.min(1, 0.12 + W.voice.level() * 1.2) : 0.6 + 0.4 * Math.random(); ui.phone.talk(lv); ui.callTalk(lv); }
    if (!borrow.quiet) cues(t, seek);
    lastT = t;
  }

  // ---- the run
  const SET_HOLD = [
    { minX: 9, maxX: 164, minZ: 384.5, maxZ: 410 },     // E 37th St, curb to curb and both sidewalks
    { minX: -9, maxX: 9, minZ: 404, maxZ: 492 },        // 5th Ave south of 37th (the van's way out)
    { minX: 146, maxX: 164, minZ: 404, maxZ: 470 },     // Madison south of 37th (its way in)
  ];
  function startState() {
    app.selectTime?.('golden');
    place(W, { car: [MARK.car[0], MARK.car[2], MARK.car[3]], dan: [112, 386.7, 0] });
    P.mesh.visible = false;
    // (the gaits put away while the scene poses him: the rig's own copies of the clips do it)
    for (const a of Qn.mixer._actions) if (!qRig.owns(a)) a.setEffectiveWeight(0);
    // (the bag fitted again on him if he was not dressed yet when the cast was built: his rest, upright, here at his door)
    if (bag.fitted < 2000) {
      const ub = UPRIGHT_BONES.map((n) => B[n]).filter(Boolean), uq = ub.map((b) => b.quaternion.clone());
      try { qKeep.restore(); qRig.pose(0); Qn.body.position.y = 0; Qn.body.rotation.x = 0; P.mesh.updateMatrixWorld(true); upright(W, 0, 1); bag.fit(); } catch (e) { console.warn('[intro] bag fit', e); }
      ub.forEach((b, i) => b.quaternion.copy(uq[i])); Qn.body.rotation.x = 0; P.mesh.updateMatrixWorld(true);
    }
    app.trafficSystem.hold?.(SET_HOLD);
    street.show(true);
    W.cutscene = true;
    W._holdCam?.release(0); W._holdCam = null;
    // (no frame once it has finished: one more would pose him again, phone grip and all, and wake the scene's clips
    // under the game's own)
    W.directed = (dt) => { if (playing) { t = Math.min(END, t + dt * rate); if (t >= END) return finish(); } D.framed = true; frame(dt); };
    D.onFrame = (dt) => { if (playing) { t = Math.min(END, t + dt * rate); if (t >= END) return finish(); } frame(dt); };
    D.take();
    ui.cine(true);
    document.body.classList.add('wg-hidehint');
  }
  async function finish(skip = false) {
    if (!playing) return; playing = false;
    if (skip) {
      skipped = true;
      await ui.fade(1, 0.35);
      sfx.stopAll(0.4); W.voice?.stop(0.3);
      ui.phone.hide(); ui.caption(null); ui.sub(null); ui.gameTitle(false, true); ui.titleOff(); ui.placeOff(); ui.call(false);
      t = END; lastT = -1; cueAt = CUES.length; frame(0);
    }
    D.block(false); ui.skip(null); boss.full(null); boss.phone(false);
    // back to the game: Dan at his mark facing the car, standing; the gaits his own again
    for (const o of [van.group, knox.root, hooks.root, phone]) o.visible = false;
    bag.hide();
    street.show(false);
    set.door(0);
    // (his bones as the clip left them, not as the scene worked them: the gaits only write a bone when its value changes,
    // so a hand closed round the phone would stay closed for the game)
    qKeep.restore();
    qRig.stop();
    Qn.act('idle').setEffectiveWeight(1); Qn.body.rotation.x = 0;
    const q = danAt(END);
    place(W, { dan: [q.x, q.z, -1.41] });
    delete W.directed;
    D.onFrame = null;
    app.trafficSystem.hold?.([]);
    // the grade eased back to the street's own over the blend, not snapped
    const g0 = { e: grade?.exposure.value ?? exp0 }, secs = skip ? 0 : 1.5, t0 = performance.now();
    const ramp = () => { const k = secs ? smooth((performance.now() - t0) / 1000 / secs) : 1; setGrade(1 - k, lerp(g0.e, exp0, k)); if (k < 1) requestAnimationFrame(ramp); };
    ramp();
    const rel = D.release(secs);
    ui.cine(false); document.body.classList.remove('wg-hidehint');
    if (skip) ui.fade(0, 0.6);
    W.cutscene = false;
    await rel;
    sound.city?.fadeTo(0.22, 3);
    sound.pad?.stop(3);
    done?.();
  }

  const api = {
    cam: null, // (a fixed camera { pos, look, fov } in place of the shots: for looking at things; bossCam: in Mr. Big's
    bossCam: null, // study; bossStand: him up out of his chair, for looking at him)
    bossStand: false,
    get t() { return t; }, set rate(r) { rate = r; }, get rate() { return rate; },
    seek(x) { t = clamp(x, 0, END); }, play() { playing = true; }, pause() { playing = false; },
    get playing() { return playing; }, get skipped() { return skipped; }, END, shots, LINES,
  };
  // the cold open (wagmi/trailer.js) shoots on this set: the frame at any time x of it (quiet: no cues, no lines),
  // this director's camera, and off() to put the set and the cast away for a shot of its own
  const borrow = {
    D, quiet: false, hold: SET_HOLD,
    at(x, dt) { t = clamp(x, 0, END); frame(dt); },
    off() {
      for (const o of [van.group, knox.root, hooks.root, phone]) o.visible = false;
      bag.hide(); boss.full(null); boss.phone(false); qKeep.restore();
    },
  };
  async function run(gate) {
    startState();
    t = 0; frame(0);
    // the start gate (the browser's audio unlock with it), once the city is on screen
    while (!app.ready) await sleep(100);
    if (gate) await gate;
    sfx.unlock();
    // the trailer first (wagmi/trailer.js), then the opening from its first frame as before
    // (the opening has no title of its own: it opens on Murray Hill, the name already on the gate and in the trailer)
    if (W.trailer) { await W.trailer.play(borrow); W.trailer = null; startState(); t = 0; lastT = -1; frame(0); }
    else ui.gameTitle(false);
    sound.city = sfx.city(); sound.city?.fadeTo(0.5, 2.5);
    sound.pad = sfx.pad(); sound.pad?.fadeTo(0.16, 4);
    sound.voice = sfx.voice();
    D.block(true, { onSkip: () => finish(true) });
    playing = true; lastT = 0;
    W.introStarted = true;
    // the skip ring rides on the frame
    const skipLoop = () => { if (!playing) { ui.skip(null); return; } D.skipStep(1 / 60, ui); requestAnimationFrame(skipLoop); };
    requestAnimationFrame(skipLoop);
    await new Promise((res) => { done = res; });
  }
  return { api, run };
}
// his eyes from the head bone (the bone is at the top of his neck; the crown of his hair is 0.21 m above it)
const EYE_UP = 0.085, EYE_FWD = 0.085;
// Dan on his feet in a scene (k 0..1). His clips stand him leaning into a wind: his hips 0.2 m ahead of his ankles
// (the legs 17-18 degrees off the vertical). Measured each frame: the whole body tipped back about his feet until his
// hips are over the balls of his feet, the soles turned flat again, then his back turned upright at its base until his
// head is over his hips, LEAN forward. (body.rotation.x is set here: the caller zeroes it before the pose.) The bones it
// turns are UPRIGHT_BONES: put them back to the clip's pose before the next frame's, or the turns pile up.
const LEAN = 0.04, BALL = 0.05;
export const UPRIGHT_BONES = ['spine05', 'foot_L', 'foot_R'];
export function upright(W, h, k = 1) {
  const B = W.dan.bones, body = W.dan.body; if (!B.spine05 || !B.upperleg01_L) return;
  const turn = (b, axis, a) => { const q = new THREE.Quaternion().setFromAxisAngle(axis, a), w = new THREE.Quaternion(); b.getWorldQuaternion(w); q.multiply(w); b.parent.getWorldQuaternion(w); b.quaternion.copy(w.invert().multiply(q)); b.updateMatrixWorld(true); };
  const mid = (a, b) => B[a].getWorldPosition(V()).add(B[b].getWorldPosition(V())).multiplyScalar(0.5);
  const F = V(Math.sin(h), 0, Math.cos(h)), R = V(-Math.cos(h), 0, Math.sin(h)), L = R.clone().negate();
  W.person.mesh.updateMatrixWorld(true);
  // 1 the legs: hips over the balls of the feet
  const ank = mid('foot_L', 'foot_R'), hip0 = mid('upperleg01_L', 'upperleg01_R'), dl = hip0.clone().sub(ank);
  const legs = clamp(Math.atan2(dl.dot(F) - BALL, dl.y), -0.1, 0.45) * k;
  body.rotation.x = -legs; body.updateMatrixWorld(true);
  for (const f of ['foot_L', 'foot_R']) if (B[f]) turn(B[f], L, legs);
  // 2 the back: head over the hips
  const hip = mid('upperleg01_L', 'upperleg01_R'), d = B.head.getWorldPosition(V()).sub(hip);
  turn(B.spine05, R, (Math.atan2(d.dot(F), d.y) - LEAN) * k);
}
