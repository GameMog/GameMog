// Mog City: Mission 1 · Bagged (docs/MISSIONS.md 5), after the opening cutscene (wagmi/intro.js).
//   car     'Get in your car.'                       checkpoint 1 (Dan at his mark, the roadster at the curb)
//   drive   'Follow the laptop's tracker to Chelsea Park.'  the GPS, Jane on the phone, the tracker on the radar
//   arrival 'The swap' (a scene): his laptop bag driven off in a black SUV past him, the Suits cross the lawn for him
//   fight   'Beat up the Suits.'  SUITS 0/4 -> 0/5 checkpoint 2 (Dash runs in at two down)
//   search  'Search the van.'      hold F            checkpoint 3: his tracker, cut out, and a burner phone; Mr. Big's text
//   then MISSION PASSED, and six seconds later Jane's DM and the J at Bryant Park.
// Fails: 'Dan got knocked out.' (knocked out), 'You left the fight.' (150 m from it). Retry, Quit, Skip (after three).
// start(W, { at }) runs it from a phase ('car' | 'drive' | 'arrival' | 'fight' | 'search'); ?m1=<phase> starts there.
// The pause menu's 'Restart checkpoint' (mission/pause.js) knows it as 'm1'; its clocks are game time (W.clock: they
// stop while paused). The GPS follows every objective (gps.objective; gps.drive for the drive).
import * as THREE from 'three/webgpu';
import { place, getCast, upright, UPRIGHT_BONES } from '../intro.js';
import { createGPS } from './gps.js';
import { createMarker } from './marker.js';
import { missions, carry } from './pause.js';
import { createDirector, keys, angleKeys, spline, travel, handheld, clamp, lerp } from './cine.js';
import { buildChevron } from './m2-set.js';

const PI = Math.PI;
const WHITE = '#FFFFFF', ACID = '#B6FF3B', BLUE = '#6CB8FF';
const DEST = { x: -1139, z: 1160, name: 'Chelsea Park · 9th Ave & W 28th St' };
const ARENA = { x: -1200, z: 1157 };
const VAN = [-1240, 1120.2, PI / 2];
const SEARCH_AT = [-1240, 1123.6];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the getaway SUV: the city's own SUV body in black, acid-green rims, built once (C.suv); seat: where his laptop bag
// rides, on its back seat and wedged up in the open back window on the south side, so it shows from outside (the body
// and its glass are solid black: its outer face just out past the window's line; its own frame: nose to +z)
function buildSUV(scene) {
  const N = window.NYC, g = new THREE.Group(); g.name = 'wagmi-suv';
  const spec = N.BODY_SPECS && N.BODY_SPECS.suv;
  if (spec && N.buildCarGeometry && N.createLoftedCarMaterial) {
    const m = new THREE.Mesh(N.buildCarGeometry(spec, true), N.createLoftedCarMaterial(spec, 0x0c0d0f));
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  } else {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 4.6), new THREE.MeshStandardMaterial({ color: '#0c0d0f', roughness: 0.4 }));
    m.position.y = 0.95; g.add(m);
  }
  const acid = new THREE.MeshStandardMaterial({ color: '#B6FF3B', emissive: '#6FA81A', emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.3 });
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.032, 8, 28), acid); r.rotation.y = PI / 2; r.position.set(sx * 1.005, 0.39, z); g.add(r);
  }
  g.visible = false; scene.add(g);
  return { group: g, seat: new THREE.Vector3(-1.04, 1.06, -0.75) };
}
class Fail extends Error { constructor(reason, ko = false) { super(reason); this.reason = reason; this.ko = ko; } }
class Quit extends Error {}

export async function start(W, { at = 'car', fromIntro = false, keep = false } = {}) {
  window.mcStat?.('mission', 'Bagged');
  if (W.mission) W.mission.stop();
  const M = (W.mission = createMission(W, { keep }));
  return M.run(at, fromIntro);
}

// how far (x, z) is from the van's outline (its box: 5.6 x 2.0 m, along its heading): 0 against its side
function fromVan(x, z) {
  const dx = x - VAN[0], dz = z - VAN[1], s = Math.sin(VAN[2]), c = Math.cos(VAN[2]);
  const along = dx * s + dz * c, across = dx * c - dz * s;
  return Math.hypot(Math.max(0, Math.abs(along) - 2.8), Math.max(0, Math.abs(across) - 1.0));
}

function createMission(W, { keep = false } = {}) {
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, ui = W.ui, sfx = W.sfx;
  const gps = W.gps || (W.gps = createGPS(W));
  const marker = W.marker || (W.marker = createMarker(THREE, app.scene, { color: '#FFC93C', radius: 3 }));
  // story mode: the sandbox's shortcuts off (a click on the full map sets the waypoint, it doesn't teleport)
  app.mapSystem.onTeleport = null;
  app.mapSystem.waypoint = null; // (no default route to Times Square: the missions set the GPS)
  ui.story(true); // (the teleport, the time of day, the telemetry and the camera picker put away: ui.js)

  /* ------------------------------------------------------------ helpers -- */
  let tok = { dead: false, err: null };
  const fail = (reason, ko) => { if (!tok.dead) { tok.dead = true; tok.err = new Fail(reason, ko); } };
  // (game time, and nothing asked of the world while the pause menu is up)
  const now = () => (W.clock ? W.clock.now() : performance.now());
  const wait = (cond, t = tok) => new Promise((res, rej) => {
    const f = () => { if (t.dead) return rej(t.err || new Quit()); if (W.paused) return requestAnimationFrame(f); let ok = false; try { ok = cond(); } catch (e) { return rej(e); } if (ok) res(); else requestAnimationFrame(f); };
    f();
  });
  const delay = (secs, t = tok) => { const end = now() + secs * 1000; return wait(() => now() >= end, t); };
  const gsleep = (ms) => new Promise((r) => { const end = now() + ms; const f = () => (now() >= end ? r() : setTimeout(f, Math.max(16, end - now()))); setTimeout(f, Math.max(0, ms)); });
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const inCar = () => cm.activeMode === 'car';
  const me = () => (inCar() ? car.position : P.position);
  // (on his way: the car over 3 m/s, or on foot over 1.5)
  const moving = () => (inCar() ? Math.abs(car.speed || 0) > 3 : Math.abs(P.speed || 0) > 1.5);
  // lines: [speaker, colour, text, pause after]; each held for its reading time (15 characters a second, 1.4 s at least),
  // a voice mumbling each phrase of it as it goes (no words: the subtitles are the words)
  const VOICE = { Dan: 120, Knox: 104, Jane: 205, Dash: 128 };
  function voice(who, text, secs) {
    // (a line with a recorded voice speaks it itself: wagmi/radio/voices.js, from the subtitle)
    const f0 = VOICE[who]; if (!f0 || W.voice?.has(who, text)) return;
    const parts = text.match(/[^.?!]+[.?!']*/g) || [text];
    let at = 0;
    for (const ph of parts) {
      const n = ph.trim().length; if (!n) continue;
      setTimeout(() => sfx.play('mumble', { f0: f0 * (0.96 + Math.random() * 0.08), dur: Math.min(0.5, Math.max(0.2, 0.1 + n * 0.02)), gain: who === 'Jane' && inCar() ? 0.2 : 0.28, q: /\?/.test(ph) }), at * 1000 + 30);
      at += ph.length / text.length * secs;
    }
  }
  async function say(lines, t = tok) {
    for (const [who, color, text, pause = 0.25] of lines) {
      if (t.dead) break;
      // (held for its reading time, or as long as its voice takes to say it)
      const secs = Math.max(1.4, text.length / 15, (W.voice?.dur(who, text) || 0) + 0.15);
      ui.sub(who, text, color); voice(who, text, secs);
      await gsleep(secs * 1000);
      ui.sub(null); await gsleep(pause * 1000);
    }
  }
  // Jane's call on the drive: a ring, the caller card, the lines
  async function janeCall(t) {
    sfx.play('ring', { gain: 0.16, times: 1 });
    ui.caller('Jane', BLUE, 'Incoming call');
    await gsleep(1800);
    if (t.dead) { ui.caller(null); return; }
    ui.caller('Jane', BLUE, 'On call');
    await say([
      ['Jane', BLUE, "Dan. Why is your laptop doing forty down Fifth Avenue?"],
      ['Dan', WHITE, 'Because some guys in a van took it.'],
      ['Jane', BLUE, "...Okay. I'm on the tracker. They're cutting west. Who were they?"],
      ['Dan', WHITE, 'Guys from my old job.'],
      ['Jane', BLUE, 'So, JPBank. Great, narrows it down.', 1.2],
      ['Jane', BLUE, "Tracker stopped. Chelsea Park, Ninth and Twenty-Eighth. Don't do anything stupid."],
      ['Dan', WHITE, 'Define stupid.'],
      ['Jane', BLUE, 'Going there alone.'],
      ['Dan', WHITE, "Then I'm already doing it."],
    ], t);
    ui.caller(null);
  }
  // (kept through a checkpoint restart: the card counts the whole mission)
  const stats = carry(W, 'm1', keep, () => ({ t0: now(), hits: 0, ko: 0 }));
  let lastHp = null;
  const fails = {};
  const frameHooks = new Set();
  let running = true;
  (function loop() {
    if (!running) return;
    if (W.paused) { requestAnimationFrame(loop); return; }
    gps.update();
    document.body.classList.toggle('wg-onfoot', !inCar());
    for (const f of frameHooks) { try { f(); } catch (e) { console.warn('[m1]', e); } }
    const hp = W.combat?.player?.hp; if (hp != null) { if (lastHp != null && hp < lastHp - 0.5) stats.hits++; lastHp = hp; }
    requestAnimationFrame(loop);
  })();
  const hook = (f) => { frameHooks.add(f); return () => frameHooks.delete(f); };
  function tidy() {
    frameHooks.clear(); ui.objective(null); ui.sub(null); ui.help(null); ui.counter(null); ui.caller(null); ui.hold(null); ui.phone.hide();
    gps.clear(); app.mapSystem.waypoint = null; for (const id of [...gps.blips.keys()]) gps.unblip(id); marker.hide();
  }
  const holds = (rects) => app.trafficSystem.hold?.(rects);
  function parkHolds() {
    holds([
      { minX: -1300, maxX: -1143, minZ: 1108, maxZ: 1200 }, // W 28th St along the park, and the lawn
      { minX: -1143, maxX: -1125, minZ: 1100, maxZ: 1215 }, // 9th Ave by the park (the roadster is parked in it)
    ]);
  }
  function setVan(C, on) {
    C.van.group.visible = on;
    if (on) { C.van.group.position.set(VAN[0], 0, VAN[1]); C.van.group.rotation.y = VAN[2]; C.van.setDoor(0); C.van.update(0, 0, 0); }
  }

  /* ------------------------------------------------------- the phases -- */
  const PHASES = {
    // 1 · to the car
    async car(fresh) {
      if (fresh) place(W, { car: [88, 394.4, -PI / 2], dan: [109, 390.8, -1.41] });
      gps.objective(['Get in your ', { car: 'blue' }, '.'], { follow: () => car.position, name: car.label || "Dan's car" });
      gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name: car.label || "Dan's car" });
      await delay(0.6);
      ui.help('Press [F] to get in a vehicle.', 10);
      await wait(inCar);
      gps.unblip('car'); ui.help(null);
      ui.place(car.label || "Dan's car", '', 3);
    },
    // 2 · the drive: the GPS, Jane's call, the laptop's tracker running ahead on the radar
    async drive(fresh) {
      // (from the pause menu or ?m1=drive: the car at its mark, Dan a step from its door, and in he gets, the door up
      // and all (wagmi/game.js WAGMI.ride); without the ride, at the wheel at once)
      if (fresh) {
        place(W, { car: [88, 394.4, -PI / 2], dan: [86.6, 391.7, 0.35] });
        if (W.ride?.getIn) { W.ride.getIn(); await wait(() => !W.ride.phase); }
        if (!inCar()) { P.inVehicle = true; P.mesh.visible = false; P.speed = 0; app.selectMode('car'); }
      }
      marker.at(DEST.x, 0, DEST.z);
      // the route follows the objective: out of the car on the way, to the car ('Get back in your car.'); within 250 m
      // of the park on foot, on to it on foot (the fight is on foot anyway); back in, to the park again (gps.drive)
      const nav = gps.drive({ dest: DEST, objective: ["Follow the laptop's tracker to ", { 'Chelsea Park': 'yellow' }, '.'], onFoot: 250 });
      const t0 = now(), tk = tok;
      // the tracker: a laptop blip running down 5th Ave, west on 34th St, south on 9th Ave to the park, where it stops
      const tag = [[3.6, 470], [3.6, 641], [-1134, 641], [-1134, 1117], [-1180, 1122]];
      const segs = tag.slice(1).map((p, i) => Math.hypot(p[0] - tag[i][0], p[1] - tag[i][1])), tagLen = segs.reduce((a, b) => a + b, 0);
      const tagAt = (k) => { let s = k * tagLen; for (let i = 0; i < segs.length; i++) { if (s <= segs[i]) { const u = s / segs[i]; return [lerp(tag[i][0], tag[i + 1][0], u), lerp(tag[i][1], tag[i + 1][1], u)]; } s -= segs[i]; } return tag[tag.length - 1]; };
      // [t, text, mode]: a help about driving only while he drives (the leg can be walked: gps.drive)
      const helps = [
        [2, ['Your destination is marked with a ', { '●': 'yellow' }, ' on the Radar.']],
        [8, ['GPS shows the quickest legal route with a ', { 'yellow line': 'yellow' }, '.'], 'car'],
        [20, 'Hold [Shift] to boost.', 'car'],
      ];
      let callAt = null, called = false;
      const places = [['Garment District', (p) => p.x < -300 && p.z < 700], ["Hell's Kitchen", (p) => p.x < -880 && p.z < 700], ['Chelsea', (p) => p.z > 760]];
      const seen = new Set();
      const off = hook(() => {
        const t = (now() - t0) / 1000;
        // (the objective says to follow the tag: it stays on the radar where it stopped, by the park, as Jane says)
        { const [x, z] = tagAt(Math.min(1, t / 20)); gps.blip('tag', { x, z, kind: 'laptop', edge: true, name: "Laptop tracker" }); }
        while (helps.length && t >= helps[0][0]) { const [, text, mode] = helps.shift(); ui.help(text, 7, mode ? { mode } : {}); }
        // Jane calls six seconds after he sets off, in the car or on foot (or 10 s in, if he hasn't)
        if (callAt == null && (moving() || t > 10)) callAt = t + 6;
        if (callAt != null && !called && t >= callAt) { called = true; janeCall(tk); }
        const p = me();
        if (W.cast && !W.cast.van.group.visible && dist(p, DEST.x, DEST.z) < 320) setVan(W.cast, true);
        for (const [name, test] of places) if (!seen.has(name) && test(p)) { seen.add(name); ui.place(name, 'New York', 3); }
        nav.step();
      });
      await wait(() => (inCar() ? dist(car.position, DEST.x, DEST.z) < 6 && Math.abs(car.speed) < 8 : dist(P.position, DEST.x, DEST.z) < 6));
      off(); nav.stop(); gps.unblip('tag'); gps.unblip('car');
    },
    // the arrival: his laptop bag goes off in the SUV past him; the Suits by their van cross the lawn for him
    async arrival() {
      gps.clear(); marker.hide(); ui.objective(null); ui.help(null);
      await scene('arrival');
    },
    // 3 · the fight (checkpoint 2)
    async fight(fresh) {
      // (him on the lawn at once: the cast can take a few seconds to build the first time, from ?m1=fight)
      if (fresh) place(W, { car: [DEST.x, DEST.z, 0], dan: [-1145.5, 1160, -PI / 2] });
      const C = await getCast(W);
      setVan(C, true);
      parkHolds();
      const combat = W.combat;
      if (!combat?.spawnCrew) { ui.help('The fight is coming soon.', 4); await delay(3); return; }
      combat.clear?.();
      combat.player.hp = combat.player.maxHp; lastHp = combat.player.hp;
      const autoGetUp = combat.player.autoGetUp; combat.player.autoGetUp = false;
      const offDown = combat.player.onDown(() => fail('Dan got knocked out.', true));
      try {
        // (where the arrival leaves them: a few steps off him on the lawn's edge)
        const crews = [combat.spawnCrew({ x: -1153, z: 1160, count: 4 }).engage()];
        let total = 4, dashIn = false, warned = false;
        const down = () => crews.reduce((n, c) => n + c.enemies.length - c.alive(), 0);
        const objective = () => gps.objective(['Beat up the ', { Suits: 'red' }, '.'], null);
        objective();
        ui.counter('SUITS', `0/${total}`);
        delay(1.5).then(() => ui.help(['Suits are marked with a ', { 'red dot': 'red' }, ' on the Radar.'], 7)).catch(() => {});
        hook(() => {
          // the blips: every Suit still up within 150 m
          const live = new Set();
          for (const e of combat.enemies) if (e.alive && dist(e.pos, P.position.x, P.position.z) < 150) { live.add('e:' + e.id); gps.blip('e:' + e.id, { x: e.pos.x, z: e.pos.z, kind: 'enemy' }); }
          for (const id of [...gps.blips.keys()]) if (id.startsWith('e:') && !live.has(id)) gps.unblip(id);
          ui.counter('SUITS', `${down()}/${total}`);
          // Dash runs in along W 28th St at two down: from about 30 m off him on the line to the street, so the last
          // fight reads as one fight (from the street itself, 110 m out, he took half a minute to walk in)
          if (!dashIn && down() >= 2) {
            dashIn = true; total = 5;
            const dx = -1262 - P.position.x, dz = 1124 - P.position.z, k = Math.min(1, 30 / Math.max(1, Math.hypot(dx, dz)));
            crews.push(combat.spawnCrew({ x: P.position.x + dx * k, z: P.position.z + dz * k, count: 1, props: false }).engage());
            say([['Dash', ACID, 'Wait! Did I miss the brief?'], ['Knox', ACID, 'You always miss the brief!']]).catch(() => {});
          }
          // too far from the fight
          const d = dist(me(), ARENA.x, ARENA.z);
          if (d > 150) fail('You left the fight.');
          else if (d > 90 && !warned) { warned = true; gps.objective(['Get back to the ', { fight: 'yellow' }, '.'], { x: ARENA.x, z: ARENA.z, name: 'The fight · Chelsea Park' }); }
          else if (d < 80 && warned) { warned = false; objective(); }
        });
        await wait(() => dashIn && crews.every((c) => c.alive() === 0));
        stats.ko = total;
      } finally { offDown?.(); combat.player.autoGetUp = autoGetUp; }
      await delay(1.2);
      tidy();
    },
    // 4 · the van (checkpoint 3): hold F at its door; his tracker (cut out of the bag), a burner, Mr. Big's text
    async search(fresh) {
      // (him at the van and the objective up at once; the cast, the van with it, can take a few seconds to build the
      // first time, from ?m1=search or a restart)
      if (fresh) place(W, { car: [DEST.x, DEST.z, 0], dan: [-1240, 1125.5, PI] });
      gps.objective(['Search the ', { van: 'green' }, '.'], { x: SEARCH_AT[0], z: SEARCH_AT[1], name: "The Suits' van" }, { blip: false });
      gps.blip('van', { x: VAN[0], z: VAN[1], kind: 'object', edge: true, name: "The Suits' van" });
      const C = await getCast(W);
      setVan(C, true);
      parkHolds();
      // the van made plain: a green ring of light round the whole of it and a chevron over it; the prompt comes up a
      // few metres out, and the search works from any side of it (the scene walks him round to its door)
      const ring = createMarker(THREE, app.scene, { color: '#4ADE80', radius: 3.9, height: 1.1, alpha: 0.2 }); ring.at(VAN[0], 0.02, VAN[1]);
      const chev = buildChevron(W, '#4ADE80');
      // (reach: anywhere on the sidewalk along it, 4.6 m off its side, or round its ends in the road)
      const act = ui.holdAct({ label: 'search the van', noun: 'the van', secs: 1.0, show: 10, reach: 4.6 });
      try {
        let last = now();
        await wait(() => {
          const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
          chev.at(VAN[0], 3.3, VAN[1], dt);
          return act.step(dt, fromVan(P.position.x, P.position.z), !inCar());
        });
      } finally { act.stop(); ring.hide(); app.scene.remove(ring.group); chev.hide(); app.scene.remove(chev.group); }
      gps.unblip('van'); gps.objective(null, null); ui.help(null);
      await scene('tracker');
    },
  };
  const ORDER = ['car', 'drive', 'arrival', 'fight', 'search'];
  const CHECKPOINT = { car: 'car', drive: 'car', arrival: 'fight', fight: 'fight', search: 'search' };
  // the fail screen (ui.failed): a tip by the reason, what Retry does by the checkpoint it goes back to, what Skip does
  // by the phase he failed in (a skip goes on past every phase of that checkpoint: M.run)
  const TIPS = {
    'Dan got knocked out.': ['Hit them with [J]. When the cue over a Suit turns ', { yellow: 'yellow' }, ', counter with [Q]; when it is ', { red: 'red' }, ', roll away with [C].'],
    'You left the fight.': ['Stay at Chelsea Park until the Suits are down: the fight is lost past 150 m.'],
  };
  const RETRY = { car: 'Retry: from the start', fight: 'Retry: the fight', search: 'Retry: the van search' };
  const SKIP = { car: 'Skip the drive: start at Chelsea Park', drive: 'Skip the drive: start at Chelsea Park', arrival: 'Skip the fight: start at the van search', fight: 'Skip the fight: start at the van search' };

  /* ------------------------------------------------------- the scenes -- */
  // short scenes on the director: the arrival at the park, the tracker in the van (hold Space to skip)
  async function scene(name) {
    const C = await getCast(W);
    const D = createDirector(W), Q = W.dan;
    const grade = app.postFX?.colorGrade, exp0 = grade?.exposure.value ?? 1.04;
    W.cutscene = true;
    ui.cine(true); ui.objective(null);
    if (name === 'arrival') {
      // the car where he stopped (straightened), Dan out of it on the park's sidewalk
      place(W, { car: [DEST.x, DEST.z, 0], dan: [-1145.5, 1160, -PI / 2] });
      setVan(C, true);
      parkHolds();
    }
    for (const a of Q.mixer._actions) if (!C.qRig.owns(a)) a.setEffectiveWeight(0);
    let t = 0, END = 0, done = false, skip = false;
    // (its clock, for looking at it: W.sceneClock.seek(t), .rate 0 holds it, .cam { pos, look, fov } in place of the shots)
    const clock = W.sceneClock = { rate: 1, cam: null, get t() { return t; }, seek(x) { t = clamp(x, 0, END); } };
    const shots = [], cues = [], st = { dead: false };
    let pose = () => {}, cleanup = () => {};
    const danAt = (x, z, h) => { P.position.set(x, cm.getGroundHeight(x, z, 'person'), z); P.heading = h; P.mesh.position.copy(P.position); P.mesh.rotation.y = h; P.mesh.visible = true; };
    // (his pose, then his back upright over his hips: the bone turned over the clip put back first, or a held pose
    // would pile the turns up)
    const ub = UPRIGHT_BONES.map((n) => Q.bones[n]).filter(Boolean), ub0 = ub.map((b) => b.quaternion.clone());
    const poseDan = (t, h, k = 1) => { ub.forEach((b, i) => b.quaternion.copy(ub0[i])); C.qRig.pose(t); ub.forEach((b, i) => ub0[i].copy(b.quaternion)); Q.body.position.y = 0; Q.body.rotation.x = 0; upright(W, h, k); };
    if (name === 'arrival') {
      // 'The swap' (docs/MISSIONS.md 5.5): A1 the long lens across W 28th St: Tank slams the black SUV's door on the
      // laptop bag, up on its back seat at the open window, and it peels out from the curb, tyres chirping, and tears past
      // the lens; A2 9th Ave, 3/4 behind Dan by his car: the SUV comes round the corner and whips past him ('HEY!'); A3
      // after it, going south;
      // then the four of them across the lawn for him: A4 over his shoulder as they walk up, A5 Knox coming on, A6 the two
      // of them face to face (Dan's answer), A7 Knox over Dan's shoulder.
      // (the lines run 9.2-19.1 s; the four stop a few steps off him, where the fight then starts)
      END = 19.4;
      const T = { a2: 3.2, a3: 6.4, a4: 8.6, a5: 11.4, a6: 13.0, a7: 15.5 };
      const suv = C.suv || (C.suv = buildSUV(app.scene));
      // the SUV's way out (s = metres along it): out from the curb into the lane, the corner of 9th Ave at s 78-100, past
      // Dan (z 1160) at s 123. Across the cut into A2 it jumps on (s 26 -> 70): A1 sees it peel out and go by the lens,
      // A2 sees it take the corner and go by him at 5.8 s.
      const sPath = spline([[-1222, 1120.2], [-1215, 1119.3], [-1207, 1117.9], [-1196, 1117.5], [-1170, 1118.2], [-1150, 1119.6], [-1139.5, 1122.5], [-1134.5, 1129], [-1131.2, 1140], [-1131, 1175], [-1131, 1500]]);
      const sA = travel([[0.85, 0], [1.35, 5], [2.2, 13], [T.a2, 21]]);
      const sB = travel([[T.a2, 20], [3.7, 16], [4.4, 16], [5.0, 24], [5.8, 27], [6.4, 28], [8.6, 20], [12, 20]]);
      const sS = (t) => (t < T.a2 ? sA(t) : 70 + sB(t));
      sS.speed = (t) => (t < T.a2 ? sA.speed(t) : sB.speed(t));
      const crew = [[C.knox, -1236.5, 1124.4], [C.hooks, -1238.8, 1125.0], [C.tank, -1223.2, 1122.2], [C.brick, -1244.2, 1125.3]];
      // (A1 by the van, Tank at the SUV's back door and away from it; across the cut, on the lawn walking up to him at
      // 1.4 m/s, Knox in front, each stopping a few steps off him: [from x, z, to x, z])
      // (standing to talk; their fists up as Knox says his last word: the fight is next)
      const lawn = [[-1154.7, 1160.9, -1148.4, 1160.4], [-1156.6, 1157.4, -1150.3, 1158.2], [-1157.0, 1163.7, -1150.6, 1162.6], [-1159.4, 1159.1, -1152.3, 1159.8]];
      const stopAt = lawn.map(([x0, z0, x1, z1]) => T.a4 + Math.hypot(x1 - x0, z1 - z0) / 1.4), FISTS = 18.3;
      // (standing, the Suits' upright stand; walking, their walk at the pace they cover the ground (1.4 m/s across the
      // lawn, Tank 1.63 by the SUV) over the speed it was captured at (C.SUITS, intro.js), so their feet stay planted)
      const SU = C.SUITS || { idle: 'thugIdle', walk: ['walk', 0.82] }, [WK, WMPS] = SU.walk;
      const walkUp = (i) => [[T.a4, WK, { speed: 1.4 / WMPS, fade: 0.2 }], [stopAt[i], SU.idle, { fade: 0.35 }], [FISTS + i * 0.15, 'guard', { fade: 0.3 }]];
      crew.forEach(([d], i) => d.rig.set([[0, SU.idle], ...walkUp(i)]));
      C.tank.rig.set([[0, SU.idle], [0.75, WK, { speed: 4.0 / (T.a2 - 0.75) / WMPS, fade: 0.2 }], [T.a2, SU.idle, { fade: 0.3 }], ...walkUp(2)]);
      const tankX = keys([[0.75, -1223.2], [T.a2, -1227.2]], 'linear');
      // Dan: watching the corner, then the SUV going by him, turning after it; across the cut, facing Knox
      const qh = angleKeys([[0, 2.87], [4.4, 2.87], [5.0, 2.3], [5.6, 1.6], [6.4, 1.05], [T.a4 - 0.05, 1.05], [T.a4, -1.46]]);
      C.qRig.set([[0, 'idle'], [5.3, ['idle/body', 'talk/arms'], { fade: 0.15 }], [6.3, 'idle', { fade: 0.3 }], [T.a4 + 4.4, ['idle/body', 'talk/arms'], { fade: 0.3 }], [T.a4 + 6.8, 'idle', { fade: 0.4 }]]);
      const suvAt = (t) => { const d = sS(t); return d < sPath.length - 0.5 ? sPath.at(d) : null; };
      const smooth01 = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
      // A1 a long lens from the park's edge behind it, down W 28th St: Tank at the SUV's back door, the bag at its
      // window; it swings out from the curb and tears off down the block, the lens going with it (it shrinks: it is leaving)
      shots.push({ t: 0, cam: (t) => {
        const p = suvAt(t), base = [-1222.6, 1.05, 1121.2], w = smooth01((t - 0.85) / 0.5);
        return { pos: [-1236, 1.35, 1129.5], look: p ? base.map((a, i) => lerp(a, [p.x + 0.6, 1.0, p.z][i], w)) : base, fov: 14, shake: t > 0.85 ? 0.9 : 0.3 };
      } });
      // A2 behind Dan (his left shoulder in the left third), looking up 9th Ave to the corner; the lens goes after the SUV
      shots.push({ t: T.a2, cam: (t) => {
        const p = suvAt(t), base = [-1136, 1.3, 1126], w = p ? smooth01((t - 4.9) / 0.8) : 0;
        const look = p ? base.map((a, i) => lerp(a, [p.x, 1.0, p.z][i], w)) : base;
        return { pos: [-1144.2, 1.6, 1166.0], look, fov: 40, shake: t > 5.5 && t < 6.2 ? 2.2 : 0.9 };
      } });
      // A3 after it: its tail lights going away south down 9th Ave
      shots.push({ t: T.a3, cam: (t) => { const p = suvAt(t); return { pos: [-1127.6, 1.45, 1166], look: p ? [lerp(-1131, p.x, 0.7), 1.0, p.z + 4] : [-1131, 1.0, 1300], fov: keys([[T.a3, 32], [T.a4, 13]])(t), shake: 0.6 }; } });
      // A4 over his right shoulder: the four walking up across the grass at him, Knox talking as he comes
      shots.push({ t: T.a4, cam: (t) => ({ pos: keys([[T.a4, [-1143.7, 1.74, 1159.3]], [T.a5, [-1144.0, 1.72, 1159.35]]], 'linear')(t), look: keys([[T.a4, [-1154, 1.25, 1160.2]], [T.a5, [-1152, 1.3, 1160.2]]])(t), fov: 26, shake: 0.35 }) });
      // A5 Knox from beside Dan, walking up into a medium shot, the others behind him
      shots.push({ t: T.a5, cam: () => { const b = C.knox.root.position; return { pos: [-1146.0, 1.6, 1161.3], look: [b.x, 1.45, b.z], fov: 30, shake: 0.4 }; } });
      // A6 the two of them face to face (Dan answers), from the sidewalk: Knox three-quarters on, Hooks behind him
      shots.push({ t: T.a6, cam: (t) => ({ pos: keys([[T.a6, [-1145.3, 1.55, 1164.9]], [T.a7, [-1145.35, 1.55, 1164.6]]], 'linear')(t), look: [-1146.9, 1.35, 1160.2], fov: 30, shake: 0.35 }) });
      // A7 over Dan's right shoulder, close on Knox, pushing in
      shots.push({ t: T.a7, cam: (t) => ({ pos: keys([[T.a7, [-1144.3, 1.7, 1159.05]], [END, [-1144.55, 1.68, 1159.1]]], 'linear')(t), look: [-1148.4, 1.55, 1160.4], fov: keys([[T.a7, 26], [END, 21]])(t), shake: 0.3 }) });
      let engine = null;
      const bagP = new THREE.Vector3(), bagQ = new THREE.Quaternion(), bagE = new THREE.Euler();
      pose = (t, dt) => {
        crew.forEach(([d, x, z], i) => {
          d.root.visible = true;
          let px = x, pz = z, h = PI / 2 + 0.2;
          if (d === C.tank && t < T.a4) { px = tankX(t); pz = t < 0.75 ? z : lerp(z, 1123.8, clamp((t - 0.75) / 2.2)); h = t < 0.6 ? PI : -PI / 2 - 0.2; }
          if (t >= T.a4) { const k = clamp((t - T.a4) / (stopAt[i] - T.a4)); const [x0, z0, x1, z1] = lawn[i]; px = lerp(x0, x1, k); pz = lerp(z0, z1, k); h = Math.atan2(-1145.5 - px, 1160 - pz); }
          d.root.position.set(px, cm.getGroundHeight(px, pz, 'person'), pz); d.root.rotation.y = h;
          d.rig.pose(t);
        });
        const h = qh(t);
        danAt(-1145.5, 1160, h);
        poseDan(t, h);
        // the SUV, his laptop bag on its back seat, up at the open window (its front out, its length along the car; the
        // strap and sling stay off: it is just the bag)
        const p = suvAt(t);
        suv.group.visible = !!p;
        if (p) { suv.group.position.set(p.x, 0, p.z); suv.group.rotation.y = p.h; }
        const bag = C.bag;
        bag.group.visible = !!p; bag.strap.visible = false; bag.sling.mesh.visible = false; C.moon.group.visible = false; C.leash.mesh.visible = false;
        if (p) {
          suv.group.updateMatrixWorld(true);
          bagQ.setFromEuler(bagE.set(0, p.h - PI / 2, 0));
          bag.at(bagP.copy(suv.seat).applyMatrix4(suv.group.matrixWorld), bagQ);
        }
        if (engine) engine.set(clamp(sS.speed(t) / 30), p ? 0.5 * clamp(16 / Math.max(5, Math.hypot(p.x - D.camera.pos[0], p.z - D.camera.pos[2]))) : 0);
      };
      cleanup = () => { suv.group.visible = false; C.bag.hide(); engine?.stop(0.4); };
      cues.push([0.2, () => ui.place('Chelsea Park', 'Chelsea · New York', 3)]);
      cues.push([0.45, () => sfx.play('thunk', { gain: 0.45, f: 70 })]);
      cues.push([0.85, () => { engine = sfx.engine(); sfx.play('squeal', { gain: 0.42, dur: 0.6, p: -0.3 }); }]);
      cues.push([2.75, () => sfx.play('whoosh', { gain: 0.3, dur: 0.5 })]);
      cues.push([3.8, () => sfx.play('squeal', { gain: 0.35, dur: 1.1, p: -0.2 })]);
      cues.push([5.5, () => { ui.sub('Dan', 'HEY!', WHITE); if (!W.voice?.has('Dan', 'HEY!')) sfx.play('shout', { gain: 0.5, f0: 190, vowel: 'e', dur: 0.7 }); }]);
      cues.push([5.7, () => sfx.play('whoosh', { gain: 0.35, dur: 0.6 })]);
      cues.push([6.6, () => ui.sub(null)]);
      cues.push([T.a4 + 0.6, () => say([['Knox', ACID, "Told you to check your DMs. You didn't check your DMs."], ['Dan', WHITE, 'Been a little busy getting framed.'], ['Knox', ACID, "Nothing personal, kid. It's just extremely personal."]], st)]);
      holds([
        { minX: -1300, maxX: -1143, minZ: 1108, maxZ: 1200 }, { minX: -1143, maxX: -1125, minZ: 1100, maxZ: 1215 },
        { minX: -1140, maxX: -1122, minZ: 1215, maxZ: 1520 }, // (9th Ave south: the SUV's way out)
      ]);
    } else if (name === 'tracker') {
      END = 15.5;
      // his tracker, cut out of the bag: a small dark puck (4 cm) with a blue light, a ragged scrap of the bag's black
      // lining still stuck to it
      const tracker = new THREE.Group();
      {
        const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.021, 0.011, 24), new THREE.MeshStandardMaterial({ color: '#17191C', roughness: 0.55, metalness: 0.2 })); tracker.add(puck);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 10, 8), new THREE.MeshStandardMaterial({ color: '#2F7FD8', emissive: '#3E9BFF', emissiveIntensity: 2.2 })); led.position.set(0.009, 0.0058, 0.004); tracker.add(led);
        const scrap = new THREE.Shape([[-0.034, -0.012], [-0.018, -0.03], [0.006, -0.024], [0.03, -0.034], [0.036, -0.008], [0.026, 0.014], [0.034, 0.03], [0.004, 0.026], [-0.022, 0.034], [-0.03, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)));
        const lining = new THREE.Mesh(new THREE.ShapeGeometry(scrap), new THREE.MeshStandardMaterial({ color: '#0E0F11', roughness: 0.9, side: THREE.DoubleSide }));
        lining.rotation.x = -PI / 2; lining.position.set(-0.012, -0.006, 0.006); lining.rotation.z = 0.5; tracker.add(lining);
        tracker.scale.setScalar(1.4);
      }
      const burner = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.1), new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.6, emissive: '#3A5A10', emissiveIntensity: 0 }));
      app.scene.add(tracker, burner);
      // on the lip of the van's door (its park side, toward +z)
      const lipX = VAN[0] - 0.12, lipZ = VAN[1] + 1.1, lipY = 0.555;
      tracker.position.set(lipX - 0.12, lipY, lipZ); burner.position.set(lipX + 0.16, lipY, lipZ + 0.01); burner.rotation.y = 0.4;
      const QX = VAN[0] - 0.1, QZ = VAN[1] + 1.65;
      // he steps up to the door, picks the two up, turns away from the van with them; the burner buzzes
      const qz = keys([[0, QZ + 0.9], [2.4, QZ + 0.9], [3.5, QZ, 'out']]), qh = keys([[0, PI], [4.8, PI], [5.6, 0.25]]);
      C.qRig.set([[0, 'idle'], [2.4, 'walk', { speed: 0.8, fade: 0.25 }], [3.45, 'pickup', { loop: false, fade: 0.25 }], [4.5, 'idle', { fade: 0.3 }],
        [4.8, ['walk/body', 'idle/arms'], { speed: 0.9, fade: 0.25 }], [5.6, ['idle/body', ['talk/arms', { from: 1.47, speed: 0.05 }]], { fade: 0.4 }], [13.6, 'idle', { fade: 0.5 }]]);
      shots.push({ t: 0, cam: (t) => ({ pos: keys([[0, [VAN[0] + 1.25, 0.95, VAN[1] + 1.75]], [3.4, [VAN[0] + 1.05, 0.9, VAN[1] + 1.65]]], 'linear')(t), look: [lipX + 0.05, 0.62, lipZ], fov: 32, shake: 0.4 }) });
      shots.push({ t: 3.4, cam: (t) => ({ pos: keys([[3.4, [VAN[0] + 2.6, 1.5, VAN[1] + 3.4]], [9, [VAN[0] + 2.3, 1.5, VAN[1] + 3.2]]], 'linear')(t), look: [QX, 1.0, QZ - 0.1], fov: 38, shake: 0.5 }) });
      shots.push({ t: 9, cam: (t) => ({ pos: keys([[9, [QX + 0.55, 1.55, QZ + 1.45]], [15.5, [QX + 0.5, 1.55, QZ + 1.3]]], 'linear')(t), look: [QX - 0.05, 1.42, QZ], fov: 34, shake: 0.4 }) });
      const doorK = keys([[0.4, 0, 'out'], [1.0, 1]]);
      const _r = new THREE.Vector3(), _l = new THREE.Vector3();
      pose = (t) => {
        C.van.setDoor(doorK(t));
        danAt(QX, qz(t), qh(t));
        poseDan(t, qh(t), t > 3.2 && t < 4.6 ? 0.3 : 1); P.mesh.updateMatrixWorld(true);
        // picked up: one in each hand from then on
        if (t > 3.85) {
          const B = Q.bones; B['finger3-1_R'].getWorldPosition(_r); B['finger3-1_L'].getWorldPosition(_l);
          burner.position.copy(_r); tracker.position.copy(_l); tracker.rotation.set(0.6, 0, 0.2);
          burner.material.emissiveIntensity = t > 6 ? 1.2 : 0;
        }
      };
      cleanup = () => app.scene.remove(tracker, burner);
      cues.push([1.1, () => sfx.play('doorSlide', { gain: 0.35 })]);
      cues.push([2.0, () => say([['Dan', WHITE, "My tracker. Cut right out."]], st)]);
      cues.push([6.0, () => { sfx.play('buzz', { gain: 0.2, times: 2 }); sfx.play('ding', { gain: 0.14 }); }]);
      cues.push([6.6, () => ui.phone.show('burner', { text: 'nice moves.\nyour laptop says hi.\nkeep this phone on.\n\n- Mr. Big' })]);
      cues.push([10.6, () => ui.phone.hide()]);
      cues.push([11.0, () => say([['Dan', WHITE, "He's got my laptop. And my number."], ['Dan', WHITE, 'Cool. Cool cool cool.']], st)]);
    }
    cues.sort((a, b) => a[0] - b[0]);
    const shotAt = (x) => { let s = shots[0]; for (const sh of shots) if (sh.t <= x) s = sh; return s; };
    let ci = 0;
    const frame = (dt) => {
      if (!done) t = Math.min(END, t + dt * clock.rate);
      pose(t, dt);
      const c = clock.cam || shotAt(t).cam(t);
      D.camera.pos = c.pos; D.camera.look = c.look; D.camera.fov = c.fov; D.camera.shake = c.shake ? handheld(t, c.shake) : null;
      if (grade) grade.exposure.value = 1.3;
      while (ci < cues.length && cues[ci][0] <= t) { try { cues[ci][1](); } catch (e) { console.warn(e); } ci++; }
    };
    W.directed = (dt) => { D.framed = true; frame(dt); };
    D.onFrame = frame;
    D.take();
    D.block(true, { onSkip: () => { skip = true; } });
    await new Promise((res) => { const f = () => { D.skipStep(1 / 60, ui); if (t >= END || skip) res(); else requestAnimationFrame(f); }; f(); });
    done = true; st.dead = true;
    D.block(false); ui.skip(null); ui.sub(null); ui.phone.hide();
    for (const d of [C.knox, C.hooks, C.tank, C.brick]) d.root.visible = false;
    C.qRig.stop(); Q.act('idle').setEffectiveWeight(1); Q.body.rotation.x = 0;
    cleanup();
    delete W.directed; delete W.sceneClock; D.onFrame = null;
    if (grade) grade.exposure.value = exp0;
    // (after the tracker: turned along the sidewalk toward 9th Ave and his car, so the camera comes down behind him with
    // the street ahead, not low behind him against the van's side)
    if (name === 'tracker') { C.van.setDoor(1); place(W, { dan: [VAN[0] - 0.1, VAN[1] + 2.6, PI / 2] }); }
    else place(W, { dan: [-1145.5, 1160, -PI / 2] });
    const rel = D.release(skip ? 0.4 : 1.2);
    ui.cine(false); W.cutscene = false;
    await rel;
  }

  /* -------------------------------------------------- passed, hand-off -- */
  async function passed() {
    tidy();
    holds([]);
    const secs = Math.round((now() - stats.t0) / 1000);
    sfx.play('passed');
    await ui.passed({ title: 'Bagged', stats: [['TIME', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`], ['SUITS DOWN', `${stats.ko || 5}/5`], ['HITS TAKEN', String(stats.hits)]], reward: '+4,210', note: '#FallGuyFightsBack is trending' }, 6);
    W.followers = (W.followers || 0) + 4210;
    await sleep(4000);
    // the way on (mission/m2.js): Jane's DM, 'Meet Jane at Bryant Park.', the route to the J and its corona there, the
    // J kept on the radar with a nudge when he wanders; into the corona, Mission 2
    try { (await import('./m2.js')).handoff(W); } catch (e) { console.error('[m1] hand-off', e); }
  }

  /* ------------------------------------------------------- the runner -- */
  const M = {
    get phase() { return M._phase; },
    stop() { running = false; tok.dead = true; tidy(); },
    async run(at = 'car', fromIntro = false) {
      let i = Math.max(0, ORDER.indexOf(at)), fresh = !fromIntro;
      // (stopped, by a restart from the pause menu: this run goes no further)
      while (i < ORDER.length && running) {
        const phase = (M._phase = ORDER[i]);
        tok = { dead: false, err: null };
        ui.step('m1:' + phase);
        try {
          await PHASES[phase](fresh);
          fresh = false; i++;
        } catch (e) {
          if (e instanceof Quit) return;
          if (!(e instanceof Fail)) { console.error('[m1]', phase, e); tidy(); return; }
          // knocked out: the world grey, then the fail screen
          tidy(); cm.resetInput?.();
          if (e.ko) { ui.ko(true); sfx.play('failed'); await sleep(2600); ui.ko(false); } else sfx.play('failed');
          const cp = CHECKPOINT[phase]; fails[cp] = (fails[cp] || 0) + 1;
          const choice = await ui.failed(e.reason, { skip: fails[cp] >= 3, tip: TIPS[e.reason], retryLabel: RETRY[cp], skipLabel: SKIP[phase], quitLabel: 'Quit: back to free roam' });
          W.combat?.clear?.();
          if (choice === 'quit') { holds([]); M.stop(); return; }
          if (choice === 'skip') { i = ORDER.indexOf(cp) + 1; while (i < ORDER.length && CHECKPOINT[ORDER[i]] === cp) i++; fresh = true; continue; }
          i = ORDER.indexOf(cp); fresh = true;
        }
      }
      if (!running) return;
      M._phase = 'passed';
      await passed();
    },
    fail,
  };
  // the pause menu's 'Restart checkpoint': any phase up to the one he is in, from its start
  const LABELS = { car: 'Get in the car', drive: 'Drive to Chelsea Park', arrival: 'Chelsea Park · the swap', fight: 'The fight', search: 'Search the van' };
  missions(W).register({
    id: 'm1', act: 'Act I · Mission 1', title: 'Bagged',
    checkpoints: ORDER.map((id) => ({ id, label: LABELS[id] })),
    active: () => running && !!M._phase && M._phase !== 'passed',
    at: () => M._phase,
    restart: (at) => { W.combat?.clear?.(); holds([]); ui.ko(false); start(W, { at, keep: true }).catch((e) => console.error('[m1]', e)); },
  });
  return M;
}
