// Mog City: Mission 4 · Shredder (docs/MISSIONS.md, Mission 4; the plan's lean cut), the first playable: every beat
// end to end, rough, with stand-ins (a Suit's body for Rook, placeholder sets and art, no crowd yet, murmurs under the
// lines not voiced yet). Started at Rook's R after Mission 3 (m3.js toRook), from the save's Continue and Replay
// (m3-save.js), or by ?m4=. The stolen work is only ever "the High Artwork"; Mr. Big is only ever on the phone or on
// video from his office. The phases, in order:
//   bench    (a scene, dusk) Rook on his bench: the laptop in the shredder truck, the High Artwork, the signing key's
//            ninety seconds, the wristband and the catering pass, the chopper; ACT II · INSIDERS / Shredder
//                                                                                              checkpoint 'bench'
//   seaport  'Go to the Seaport.'  the drive through Chinatown to South St; Jane's call (calls.js 'm4-seaport')
//                                                                                              checkpoint 'seaport'
//   arrival  (a scene, twilight) the waiter's jacket, Knox on the door: "Staff entrance. Smile less."
//   recon    'Find the artist's mark.'  MARK 0/3: the three Harbor Nocturnes on the art wall, hold F at each; two
//            Suits with sight cones (one walks the wall) and Knox on the door; a tray from the bar slows them all
//            (m4-heist.js). Fail: 'You were spotted.'                                          checkpoint 'recon'
//   unveil   (a scene) Fiona hosts, Mr. Big live on the big screen from his office; the case goes green
//   grab     'Open the case.'  WINDOW 40 s, the guests facing the screen: hold F to open, then the marks on its pad
//            in the Nocturnes' order (I, II, III), not the order found; a wrong one flashes red and starts over.
//            Fail: 'The window closed.'                                                       checkpoint 'grab'
//   flip     (a scene) OWNER · MR. BIG -> OWNER · DAN; every head turns to the empty case; "BANKER BOY." "Tip's
//            included."; the alarm, and the guests scatter
//   (the escape, beats 10-11: m4-escape.js; its sets m4-ferry.js, the helicopter m4-heli.js)
//   run      'Run to the helicopter.'  two Suits after him on foot from the entrance, 30 s; the Suits' chat; F at the
//            helicopter (on the plaza at the street's south end) to climb in.
//            Fail: 'The Suits caught you.', 'Dan got knocked out.'                           checkpoint 'run'
//   takeoff  (a scene) the skids up as Knox runs out of the street; Mr. Big on the phone: "That is my helicopter."
//   flight   'Fly to the riverfront.'  Dan flies (keys, touch, pad), west over the roofs through three guide rings to
//            the landing ring on the Battery Park City riverfront; set down in it, F to get out; Jane's one short
//            call at the controls. Fail: 'You flew off course.'                              checkpoint 'flight'
//   landing  (a scene) out on the riverfront, the rotors winding down; LATER · 11:40 PM, the light to midnight
//   ferry    'Catch the last ferry.'  the esplanade walk to the FERRY landing at Vesey St, 150 s
//            Fail: 'You missed the last ferry.'                                              checkpoint 'ferry'
//   boarding (a scene) down the gangway; the ferry pulls away, its wake on the night water
//   call     (a scene) the stern deck at midnight, the skyline behind him: Mr. Big on video from his office; the
//            tone pick; Rook patched in; the shredder powers down over the phone; HE HEARD IT STOP. / The laptop's
//            still out there.
//   then MISSION PASSED (TIME, HIGH ARTWORK TAKEN 1/1, SUITS DOWN, HITS TAKEN), the save, the next morning at Pier 11
//   with the car on South St, Rook's DM, the END OF EPISODE 1 card (MISSION 5 · COMING SOON) and Mission 5's teaser.
// URL: ?m4=bench|seaport|recon|grab|run|flight|ferry|call (and handoff: the R after Mission 3; end: the card;
// morning: free roam the next morning at Pier 11); &autopilot=1 the escape's test drive (m4-escape.js pilot).
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { place, getCast } from '../intro.js';
import { createGPS } from './gps.js';
import { createMarker } from './marker.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { missions, carry } from './pause.js';
import { runScene } from './m2-scenes.js';
import { buildFiona } from './m3-set.js';
import { between, toRook } from './m3.js';
import { watchStory, markDone, toNext } from './m3-save.js';
import { episodeEnd, openMissionSelect } from './episode.js';
import { buildPavilion, PAV, SPOTS, GLYPHS, at } from './m4-set.js';
import { createGuests, createRecon, createTray, createPad } from './m4-heist.js';
import { createM2UI } from './m2-ui.js';
import { benchScene, arrivalScene, unveilScene, flipScene, R_AT, WHITE, BLUE, ACID, PINK, fionaTalk } from './m4-scenes.js';
import { createEscape, pilot } from './m4-escape.js';
import { S as story } from '../story/index.js';
import { playTurns, beatOf } from '../radio/turns.js';

const PI = Math.PI;
const Q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Rook's bench: the curb of Chrystie St by it (southbound), Dan by the bench
// (out: where the scene leaves him, on the car's sidewalk. The bench is in the park behind its railing (a 0.9 m fence the
// length of the block, no way through): left by the bench, he had no way back to his car)
const BENCH = { car: [900.5, 3556, 0.13], dan: [931.5, 3561.5, -PI / 2], out: [902.7, 3557.2, -PI / 2] };
// after Mission 4: the next morning at Pier 11 (m3-save.js SPAWN.m5), and Mission 5's teaser on Broad St, in front of
// the stock exchange (outdoors: the plaza, never the building)
// (Dan at his car's door, on its street side, not on the corner's crosswalk where the city's walkers queue for the
// light and walk through him: the owner's review, 14 Nov)
// (the look review's round 4, 15 Nov: the car rode up on the curb. 1.5 m out now, its wheels in the parking lane, and
// he at its tail on the street side, out of the traffic's lane: stood beside it there, the traffic queued behind him
// and the follow camera dropped onto his head)
// (the look review's round 6: he stood 3 m behind the car's middle, in its rear end from the camera behind him: by its
// kerbside door now, the pavement's side)
// (round 7: still read as stood in the parking lane at its front corner: up on the pavement now, 0.75 m in from the
// kerb, level with the driver's door; and the pavement thinned round him for the beat, the city's walkers a wall of
// look-alikes there)
const MORNING = { car: [747.4, 5888.5, -0.36], dan: [745.46, 5887.98, -0.36] };
const MORNING_HOLD = [{ minX: 735, maxX: 760, minZ: 5876, maxZ: 5902 }];
// (round 7's review: held for the whole beat, the walkers piled up at its edge in rigid single-file queues along both
// pavements and the street stood empty of traffic. Held only a moment now: whoever is in the car's stretch is put
// somewhere else out of view, then the street is let go, walkers and traffic as the city's own)
// (round 8's review: under the highway the left pavement still filled with one long file of thirty walkers at the
// crossing, a queue. The street's crowd thinned for the morning's first moments, its own number back after: those
// over it are only put away out of sight, and the start is a jump, so the first frame is already the thinner one)
let quietT = 0, thinT = 0, limit0 = null;
const thin = (W, on) => {
  const C = W.street?.crowd; clearTimeout(thinT); if (!C) return;
  if (on) { if (limit0 == null) limit0 = C.limit; C.limit = limit0 * 0.5; thinT = setTimeout(() => thin(W, false), 25000); }
  else if (limit0 != null) { C.limit = limit0; limit0 = null; }
};
// the next morning's light: the city's golden hour (its low warm sun), with the windows' night glow down to what a
// lit shop shows by day (the look review's round 9: at golden's 0.48 the shop windows on South St still glowed a warm
// night amber in full daylight)
const morningLight = (W) => { W.app.selectTime?.('golden'); const U = window.NYC?.cityUniforms; if (U?.uInteriorGlow) U.uInteriorGlow.value = 0.12; };
const morningQuiet = (W, on) => { clearTimeout(quietT); W.app?.trafficSystem?.hold?.(on ? MORNING_HOLD : []); thin(W, on); if (on) quietT = setTimeout(() => W.app?.trafficSystem?.hold?.([]), 1500); };
const NYSE = { x: 301, z: 5770 };
const GRAB_SECS = 40;
const NUMERAL = 'I|II|III'.split('|');   // (one string: the voice build reads a three-string array as a line)

class Fail extends Error { constructor(reason, ko = false) { super(reason); this.reason = reason; this.ko = ko; } }
class Quit extends Error {}

/* -------------------------------------------------------- the install -- */
export async function install(W) {
  watchStory(W);
  const at = Q.get('m4'); if (!at) return;
  await boot(W);
  if (at === 'handoff') {
    // (as Mission 3 leaves him: dusk by Gears' garage, Rook's R across town)
    W.app.selectTime?.('twilight');
    place(W, { car: [-1548, 1603.6, PI / 2], dan: [-1551, 1607.4, PI] });
    toRook(W, { quick: true });
    return;
  }
  if (at === 'end') { morningLight(W); place(W, MORNING); morningQuiet(W, true); endEpisode(W, { secs: 0.4 }).catch((e) => console.error('[m4] end', e)); return; }
  if (at === 'morning') { morningLight(W); place(W, MORNING); morningQuiet(W, true); toM5(W, { quick: true }); return; }
  start(W, { at }).catch((e) => console.error('[m4]', e));
  // (the test drive: ?m4=...&autopilot=1, the escape played as a player could: m4-escape.js pilot)
  if (Q.has('autopilot')) W._m4pilot = pilot(W);
}
async function boot(W) {
  if (!W.ui) {
    W.ui = createUI(); W.sfx = createAudio();
    const unlock = () => { W.sfx.unlock(); removeEventListener('keydown', unlock, true); removeEventListener('pointerdown', unlock, true); };
    addEventListener('keydown', unlock, true); addEventListener('pointerdown', unlock, true);
  }
  W.ui.story(true); document.body.classList.add('wg-onfoot');
  W.app.mapSystem.onTeleport = null; W.app.mapSystem.waypoint = null;
  for (let i = 0; i < 600 && !W.app.ready; i++) await sleep(100);
}

export async function start(W, { at = 'bench', keep = false } = {}) {
  if (W.mission) W.mission.stop();
  W.between?.stop();
  const M = (W.mission = createMission(W, { keep }));
  return M.run(at);
}

/* ----------------------------------------------------- after Mission 4 -- */
// Mission 5's teaser (not built yet): its blip on Broad St in front of the stock exchange, labelled as one everywhere it
// shows, never "a new mission is available". quick: no help line (the save's Continue)
export function toM5(W, { quick = false } = {}) {
  between(W, {
    letter: 'J', at: NYSE, name: 'Mission 5 (coming soon) · the stock exchange',
    objective: [{ 'Mission 5': 'yellow' }, ' is coming soon. It starts at the ', { 'stock exchange': 'yellow' }, '.'],
    sign: ['MISSION 5', 'COMING SOON'],
    onArrive: () => { W.ui?.place('The stock exchange · Broad St', 'Financial District · New York', 3); W.ui?.help(['Mission 5 is coming soon. The ', { 'vault truck': 'red' }, ' leaves from here at nine.'], 9); },
  });
  if (!quick) W.ui?.help(['Free roam. ', { 'Mission 5': 'yellow' }, ' is coming soon: its ', { J: 'yellow' }, ' on the Radar is a teaser.'], 8);
}
// the END OF EPISODE 1 card (episode.js) after secs, then free roam with Mission 5's teaser, or the pause menu's
// Mission select (the teaser set too, for a Resume without a replay)
export async function endEpisode(W, { secs = 0 } = {}) {
  if (secs) await sleep(secs * 1000);
  W.ui?.dm?.(null); W.ui?.help?.(null);
  const choice = await episodeEnd(W, { next: story.t('MISSION 5 · COMING SOON'), line: story.t("The laptop's still out there.") });
  if (W.mission?.running) return choice;
  morningQuiet(W, false);
  if (choice === 'replay') { toM5(W, { quick: true }); openMissionSelect(W); }
  else toM5(W);
  return choice;
}

/* ---------------------------------------------------------- the mission -- */
function createMission(W, { keep = false, quiet = false } = {}) {
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, ui = W.ui, sfx = W.sfx;
  const gps = W.gps || (W.gps = createGPS(W));
  const heli = cm.entities.helicopter;
  app.mapSystem.onTeleport = null;
  ui.story(true);

  /* ------------------------------------------------------------ helpers -- */
  let tok = { dead: false, err: null };
  const fail = (reason, ko) => { if (!tok.dead) { tok.dead = true; tok.err = new Fail(reason, ko); } };
  const now = () => (W.clock ? W.clock.now() : performance.now());
  const wait = (cond, t = tok) => new Promise((res, rej) => {
    const f = () => { if (t.dead) return rej(t.err || new Quit()); if (W.paused) return requestAnimationFrame(f); let ok = false; try { ok = cond(); } catch (e) { return rej(e); } if (ok) res(); else requestAnimationFrame(f); };
    f();
  });
  const delay = (secs, t = tok) => { const end = now() + secs * 1000; return wait(() => now() >= end, t); };
  const gsleep = (ms) => new Promise((r) => { const end = now() + ms; const f = () => (now() >= end ? r() : setTimeout(f, Math.max(16, end - now()))); setTimeout(f, Math.max(0, ms)); });
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const flying = () => cm.activeMode === 'helicopter';
  // (where he is: in the car, in the helicopter, or on foot)
  const me = () => (flying() ? heli.position : cm.activeMode === 'car' ? car.position : P.position);
  const gy = (x, z) => cm.getGroundHeight(x, z, 'person');
  // the light: one progression for the whole mission, held per scene (the owner's review, 14 Nov): 'dusk' from Rook's
  // bench to the riverfront landing, then 'midnight' (LATER · 11:40 PM). Dusk is the city's twilight with the sun
  // gone down: its direct light low and red, its glow just under the horizon, the sky a step toward night, so no shot
  // turns to daylight when the camera faces west (the bench's reverse, the flight to the river); the sky's fill and the
  // environment raised in its place, so faces still read in the close shots and the pavilion's deck under its bulbs
  // (the look review's round 4, 15 Nov: one curve held: dusk for Rook's bench and the drive to the Seaport, then night
  // from the pavilion on (the arrival, the marks, the unveiling, the run, the flight, the landing, the ferry), so no
  // sunset band comes back in the air after the night-time unveiling)
  // (the look review's round 2, 15 Nov: the sun's glow just over the horizon had left the sky over the pavilion black,
  // and put a sun disc with its glare on the river in the flight and an orange sunset on the landing. Now one blue hour
  // from the bench to the landing: the sky's sun a little under the horizon with its disc off, only a low afterglow in
  // the west; the sky's night colour a deep blue mixed in, so the sky overhead reads blue; the direct light a cool
  // lavender afterglow from higher and fainter, not a sunset's orange (its glare off the river was a second sun), and
  // the sky's fill raised)
  let dusk = false, night0 = null;
  const DUSK_SUN_K = 1.2;
  const DUSK_SUN = new THREE.Vector3(-0.52, 0.45, -0.77).normalize(), DUSK_SKY = new THREE.Vector3(-0.52, -0.01, -0.77).normalize();
  function toDusk() {
    const ls = app.lightingSystem, U = window.NYC?.cityUniforms; if (!ls) return;
    app.selectTime?.('twilight');
    // (the park's lawn a neon green at dusk under Rook's lamp, the look review's round 4: a little less saturation)
    { const grade = app.postFX?.colorGrade; if (grade) grade.saturation.value = Math.min(grade.saturation.value, 0.9); }
    if (dusk) return;
    ls.sunLight.intensity = DUSK_SUN_K; ls.sunLight.color.setHex(0xb0a0d0); sunLow = false; ls.sunLight.position.copy(DUSK_SUN); ls.sunLight.updateMatrixWorld();
    ls.hemiLight.intensity = 2.9; ls.hemiLight.color.setHex(0x5a74b8); ls.hemiLight.groundColor.setHex(0x5e4a4c);
    ls.sky.sunPosition.value.copy(DUSK_SKY); ls.sky.mieCoefficient.value = 0.003; ls.sky.mieDirectionalG.value = 0.78;
    if (night0 == null) night0 = ls.uNightSkyColor.value.getHex();
    ls.uSkyExposure.value = 0.22; ls.uNightFactor.value = 0.5; ls.uNightSkyColor.value.setHex(0x22386e); ls.scene.fog.color.setHex(0x26304e);
    if (U) { U.uSunColor.value.setHex(0x5a4a66); U.uSkySunDir.value.copy(DUSK_SKY); U.uSkyHorizonColor.value.setHex(0x6a4a66); U.uInteriorGlow.value = 1.4; }
    ls.bakeEnvironmentMap?.(); ls.sky.showSunDisc.value = 0; ls.scene.environmentIntensity = 0.8; dusk = true;
  }
  // (out of dusk: the preset put back whole, even when it is twilight's own id; the sky's night colour and its disc)
  function undusk(id) {
    if (!dusk) return; dusk = false; const ls = app.lightingSystem; if (!ls) return;
    if (night0 != null) ls.uNightSkyColor.value.setHex(night0);
    ls.applyPreset(id || 'twilight', true);
  }
  // night, after LATER · 11:40 PM: the city's midnight with a moon's fill under it (the owner's review, 14 Nov: the
  // esplanade walk read as black). The moon a step brighter and bluer, the sky's fill and the environment raised, the
  // camera's exposure a little up, so Dan, the path and the trees read under the lamps; the sky stays night
  let night = false;
  function toNight() {
    const ls = app.lightingSystem, U = window.NYC?.cityUniforms, grade = app.postFX?.colorGrade; if (!ls) return;
    if (night) return; app.selectTime?.('midnight');
    // (the look review's round 3, 15 Nov: with no shadow to hold it back, a 2.2 moon lit the esplanade's crowns a
    // daylight green from one side, and through them from the other (their translucency), and left them black eleven
    // seconds on; a faint moon, the fill doing the work, so the lamps' pools are what lights the trees)
    // (round 4: fainter still, 0.38, the fill up a little in its place: at 0.7 it lit the plaza's tree at the take-off
    // a lime green from one side)
    ls.hemiLight.intensity = 3.6; ls.hemiLight.color.setHex(0x4a62a0); ls.hemiLight.groundColor.setHex(0x4e4246);
    ls.sunLight.intensity = 0.38; ls.sunLight.color.setHex(0x9db8ec);
    ls.uSkyExposure.value = 0.034; if (U?.uCanyonBounce) U.uCanyonBounce.value = 0.32;
    // (the look review's round 4, 15 Nov: the lawns read a neon green at night under the lamps; the night's colour
    // a little less saturated, as the eye sees it in the dark)
    if (grade) { grade.exposure.value = 1.28; grade.saturation.value = 0.84; }
    // (the round 2 review, 15 Nov: under the esplanade's trees the moon's shadow left him black from the shoulders
    // down; a moon this low casts none worth keeping, so none at all until the morning)
    shadow0 = ls.sunLight.castShadow; ls.sunLight.castShadow = false;
    ls.bakeEnvironmentMap?.(); ls.scene.environmentIntensity = 0.72; night = true;
    shoreDim(0.3);
  }
  // (the look review's rounds 6-8: across the river the far shore's granite bulkheads, pale stone under the night's fill,
  // read as a brown band under the lit towers. Darker at night, as wet stone in the dark; put back after)
  function shoreDim(k) {
    const bk = app.scene.getObjectByName('BoroughBulkheads'), m = bk?.material; if (!m?.colorNode) return;
    if (!bk.userData.dim) { bk.userData.dim = uniform(1); m.colorNode = m.colorNode.mul(bk.userData.dim); m.needsUpdate = true; }
    bk.userData.dim.value = k;
  }
  let shadow0 = null;
  function unnight() {
    if (!night) return; night = false; const ls = app.lightingSystem; shoreDim(1);
    if (ls && shadow0 != null) ls.sunLight.castShadow = shadow0;
    ls?.applyPreset('midnight', true); app.selectTime?.('midnight');
  }
  const light = (id) => {
    if (id === 'dusk') { unnight(); return toDusk(); }
    if (id === 'midnight') { undusk('midnight'); return toNight(); }
    unnight();
    if (dusk) { undusk(id); app.selectTime?.(id); return; } // (its colour grade and the time buttons with it)
    if (app.lightingSystem?.activePresetId !== id) app.selectTime?.(id);
  };
  // the lines: subtitles (their recorded voices play from them), held for their reading time or their voice, a murmur
  // where there is no voice yet (every new Mission 4 line, until the voice build has them); onLine(who, i) as each starts
  const VOICE = { Dan: 120, Jane: 205, Fiona: 236, Knox: 98, 'Mr. Big': 104, Rook: 150 };
  // (each held as long as its voice, or its reading time with none, and handed over as the beat says: radio/turns.js)
  function mumble(who, text, secs) {
    if (!VOICE[who] || W.voice?.speaks?.(who, text)) return;
    const parts = text.match(/[^.?!]+[.?!']*/g) || [text]; let a = 0;
    for (const ph of parts) { const n = ph.trim().length; if (n) setTimeout(() => sfx?.play('mumble', { f0: VOICE[who] * (0.96 + Math.random() * 0.08), dur: Math.min(0.5, Math.max(0.2, 0.1 + n * 0.02)), gain: 0.24, q: /\?/.test(ph) }), a * 1000 + 30); a += ph.length / text.length * secs; }
  }
  async function say(lines, t = tok, onLine = null) {
    await playTurns(W, lines.map(([who, color, words, b]) => ({ who, color, text: story.line(who, words), ...beatOf(b) })), {
      dead: () => t.dead, sleep: gsleep, hide: () => ui.sub(null),
      show: ({ who, text, color }, i, secs) => { ui.sub(who, text, color); onLine?.(who, i); mumble(who, text, secs); },
    });
  }
  const objective = (parts, target = null) => {
    if (gps.objective) gps.objective(parts, target, { blip: !!target && !target.follow });
    else { ui.objective(parts); if (target && !target.follow) gps.set(target); else gps.clear(); }
  };
  const holds = (rects) => app.trafficSystem.hold?.(rects);
  // the pavilion's street, closed: its box (the traffic and the city's walkers kept out of it)
  const PAV_HOLD = (() => { const ps = [at(-7, -48), at(7, -48), at(-7, 42), at(7, 42)]; return { minX: Math.min(...ps.map((p) => p.x)), maxX: Math.max(...ps.map((p) => p.x)), minZ: Math.min(...ps.map((p) => p.z)), maxZ: Math.max(...ps.map((p) => p.z)) }; })();
  const stats = carry(W, 'm4', keep, () => ({ t0: now(), hits: 0, ko: 0 }));
  let lastHp = null;
  const fails = {};
  const hooks = new Set();
  let running = true;
  const heist = { frame: null };   // (the pavilion's own per-frame, once it is defined below)
  // (his car parked at the street's closed end, its engine off: its headlights out. The look review's round 3, 15 Nov:
  // their beams reached under the barrier onto the deck as a hard yellow wedge by the red carpet. Black, not off: the
  // city sets their strength every frame, and a light switched off would recompile the scene's shaders)
  const beams = (cm.entities.car?.headLights || []).map((s) => [s, s.color.getHex()]);
  let beamsOut = false, sunLow = false;
  // (the shops' awning spot lights out around the pavilion while it is up: the look review's round 4, 15 Nov. The
  // hard-edged yellow pie sectors on the boardwalk, the deck and outside the canopy were theirs, not the sun's: the
  // city hangs a pool of them on the awnings nearest the camera, each cut off at 12 m, so on the closed street they
  // fell through the glass as sectors. Set after the city places them each frame, so it keeps every other street's)
  const CB = app.cityBlocks, storeLights = [];
  app.scene.getObjectByName('StoreClusteredLights')?.traverse((o) => { if (o.isSpotLight) storeLights.push(o); });
  W._m4shops = () => {
    if (!running || !S.pav?.shown) return;
    for (const l of storeLights) if (l.intensity > 0 && dist(l.position, PAV.x, PAV.z) < 70) l.intensity = 0;
  };
  if (CB?.updateLights && !CB.__m4) { CB.__m4 = true; const u0 = CB.updateLights; CB.updateLights = function (c) { u0.call(this, c); W._m4shops?.(); }; }
  const beamsOff = (off) => { if (off === beamsOut) return; beamsOut = off; for (const [s, c] of beams) s.color.setHex(off ? 0 : c); };
  (function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (W.paused) return;
    gps.update();
    heist.frame?.();
    document.body.classList.toggle('wg-onfoot', cm.activeMode === 'person');
    for (const f of hooks) { try { f(); } catch (e) { console.warn('[m4]', e); } }
    beamsOff(cm.activeMode !== 'car' && dist(car.position, PAV.x, PAV.z) < 150);
    // (the low sky's direct light faint at the pavilion: through a gap between the blocks it laid a hard-edged yellow
    // wedge on the deck by the red carpet, the look review's round 3; set as it changes, so a scene's own may hold)
    const low = dusk && !!S.pav?.shown && dist(me(), PAV.x, PAV.z) < 150;
    if (low !== sunLow) { sunLow = low; const ls = app.lightingSystem; if (ls) ls.sunLight.intensity = low ? DUSK_SUN_K * 0.3 : DUSK_SUN_K; }
    const hp = W.combat?.player?.hp; if (hp != null) { if (lastHp != null && hp < lastHp - 0.5) stats.hits++; lastHp = hp; }
  })();
  const hook = (f) => { hooks.add(f); return () => hooks.delete(f); };
  let lastT = now();
  const frameDt = () => { const t = now(), d = Math.min(0.05, (t - lastT) / 1000); lastT = t; return d; };
  const marker = (x, z, { color = '#FFC93C', radius = 2.4, height = 2.2, y = null, alpha = 0.3 } = {}) => { const m = createMarker(THREE, app.scene, { color, radius, height, alpha }); m.at(x, y ?? gy(x, z), z); return { m, off() { m.hide(); app.scene.remove(m.group); } }; };

  /* -------------------------------------------------- the sets, the cast -- */
  // (built once a session, kept on W: a restart reuses them)
  const S = W._m4 || (W._m4 = { C: null, pav: null, landing: null, ferry: null, fiona: null, setsP: null, heli0: null, guests: null, tray: null, pad: null });
  Object.assign(S, { crew: null, feedOn: false, recon: null });
  // (the look review's round 7: "Find the artist's mark." and "Catch the last ferry." drawn mid-screen over his back, the
  // objective card over the radar saying the same. In Mission 4 the card alone says it: the line's theme hold, cut to
  // nothing, ui.js objective)
  const OBJ_SECS = '--wg-obj-secs', objLine = (on) => { try { if (on) document.documentElement.style.removeProperty(OBJ_SECS); else document.documentElement.style.setProperty(OBJ_SECS, '0.01'); } catch {} };
  objLine(false);
  const U = W.m2ui || (W.m2ui = createM2UI(ui));
  function sets() {
    return S.setsP || (S.setsP = (async () => {
      if (!S.C) S.C = await getCast(W);
      if (!S.pav) { S.pav = buildPavilion(W, { feed: S.C.boss?.screenTexture || S.C.boss?.texture || null }); S.guests = createGuests(W, S.pav); S.tray = createTray(W, S.pav); S.pad = createPad(W, GLYPHS); }
      // (Fiona: Mission 3's, if it built her this session)
      if (!S.fiona) S.fiona = W._m3?.fiona || await buildFiona(W);
      fionaNight(true);
      return S;
    })());
  }
  // (Fiona dressed for the gala, Mission 4 only: the owner's call, 15 Nov: no shades and no puffer at a night gala.
  // Her down coat cut into a tailored evening jacket: its funnel collar cut down to a low stand collar (the collar's
  // rows in its UV layout, past the seam row), its baffles smoothed away (the coat's own welded vertices relaxed toward
  // their neighbours, the cuffs, hem and neckline held where they are so her wrists and the skirt still meet them),
  // in deep garnet velvet; her tee and long skirt (both under it) a floor-length black crepe; her shades off her face, her
  // trainers black patent, her platinum hair sleeked. All of it put back when the mission ends, for Mission 3's day)
  let gala0 = null;
  function tailored(g0, collar = 0.29, collarU = 0.75, iters = 8, lam = 0.6) {
    const P = g0.attributes.position, UV = g0.attributes.uv, I = g0.index.array, keep = [];
    for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t + 1], I[t + 2]]; if (!v.every((i) => UV.getY(i) < collar && UV.getX(i) < collarU)) keep.push(...v); }
    // (the coat's vertices welded by place: its UV seams split them, and each side must move as one)
    const ids = new Map(), grp = new Map(); let ng = 0;
    for (const v of keep) if (!grp.has(v)) { const k = `${Math.round(P.getX(v) * 2000)},${Math.round(P.getY(v) * 2000)},${Math.round(P.getZ(v) * 2000)}`; let gi = ids.get(k); if (gi === undefined) ids.set(k, gi = ng++); grp.set(v, gi); }
    const p = new Float64Array(ng * 3), nb = Array.from({ length: ng }, () => new Set()), edges = new Map(), fixed = new Uint8Array(ng);
    for (const [v, gi] of grp) { p[gi * 3] = P.getX(v); p[gi * 3 + 1] = P.getY(v); p[gi * 3 + 2] = P.getZ(v); }
    for (let t = 0; t < keep.length; t += 3) for (let i = 0; i < 3; i++) {
      const a = grp.get(keep[t + i]), b = grp.get(keep[t + (i + 1) % 3]); nb[a].add(b); nb[b].add(a);
      const k = a < b ? a * ng + b : b * ng + a; edges.set(k, (edges.get(k) || 0) + 1);
    }
    for (const [k, n] of edges) if (n === 1) { fixed[Math.floor(k / ng)] = 1; fixed[k % ng] = 1; }
    let cur = p;
    for (let it = 0; it < iters; it++) {
      const nx = new Float64Array(cur);
      for (let i = 0; i < ng; i++) {
        if (fixed[i] || !nb[i].size) continue; let x = 0, y = 0, z = 0; for (const j of nb[i]) { x += cur[j * 3]; y += cur[j * 3 + 1]; z += cur[j * 3 + 2]; }
        const n = nb[i].size; nx[i * 3] += lam * (x / n - cur[i * 3]); nx[i * 3 + 1] += lam * (y / n - cur[i * 3 + 1]); nx[i * 3 + 2] += lam * (z / n - cur[i * 3 + 2]);
      }
      cur = nx;
    }
    const g = g0.clone(), PA = g.attributes.position;
    for (const [v, gi] of grp) PA.setXYZ(v, cur[gi * 3], cur[gi * 3 + 1], cur[gi * 3 + 2]);
    // (its normals made afresh, as floats: the file's are packed bytes, which the sums would clip; turned to agree
    // with the file's where the winding runs the other way)
    g.setIndex(keep); g.deleteAttribute('normal'); g.computeVertexNormals();
    const N = g.attributes.normal, N0 = g0.attributes.normal; let agree = 0;
    for (let t = 0; t < keep.length; t += 9) { const v = keep[t]; agree += Math.sign(N.getX(v) * N0.getX(v) + N.getY(v) * N0.getY(v) + N.getZ(v) * N0.getZ(v)); }
    if (agree < 0) for (let i = 0; i < N.array.length; i++) N.array[i] = -N.array[i];
    return g;
  }
  // (the look review's round 7: the low stand collar still read as the puffer's bunched funnel, a crumpled roll up to her
  // jaw. Everything over her collarbones laid onto a neat band round her neck now (an ellipse round it, its top a clean
  // line a little lower at the front so her chin clears it), the tee's neckline under it the same way a shade smaller:
  // a real stand collar)
  function standCollar(g0, { cz = 0.03, rx = 0.078, rz = 0.074, y0 = 1.37, y1 = 1.395, back = 1.435, front = 1.41 } = {}) {
    const g = g0.clone(), P = g.attributes.position;
    for (const v of new Set(g.index.array)) {
      const x = P.getX(v), y = P.getY(v), z = P.getZ(v), w = Math.max(0, Math.min(1, (y - y0) / (y1 - y0))); if (w <= 0) continue;
      const s = w * w * (3 - 2 * w), dz = z - cz, a = Math.atan2(x / rx, dz / rz), e = Math.min(1, Math.hypot(x / rx, dz / rz));
      const cap = back + (front - back) * Math.max(0, Math.cos(a)), ny = Math.min(y, cap);
      P.setXYZ(v, x + (Math.sin(a) * e * rx - x) * s, y + (ny - y) * s, z + (cz + Math.cos(a) * e * rz - z) * s);
    }
    g.deleteAttribute('normal'); g.computeVertexNormals();
    return g;
  }
  // (the look review's round 8: the coat's own vertices laid onto that band left a torn, frayed rim at the throat, spikes
  // either side of it at a normal distance. A real collar now: a thin closed band of its own round her neck, a little
  // flared where it sits on her shoulders, its top a rolled edge lower at the front, skinned to the coat's own bones
  // (each of its points takes the weights of the coat's nearest), the coat's and the tee's necklines tucked inside it)
  const COL = { cz: 0.036, rx: 0.08, rz: 0.075, yb: 1.366, back: 1.44, front: 1.414 };
  // (the coat's neckline and the tee's laid inside the band's inner wall, under its top)
  const COAT_NECK = { cz: COL.cz, rx: 0.069, rz: 0.064, y0: 1.368, y1: 1.386, back: 1.43, front: 1.404 }, TEE_NECK = { cz: COL.cz, rx: 0.065, rz: 0.06, y0: 1.368, y1: 1.386, back: 1.425, front: 1.398 };
  function collarBand(coat, mat) {
    const { cz, rx, rz, yb, back, front } = COL, N = 64;
    // (its profile, bottom to top and over the lip: [scale of its ellipse, height up from its bottom (0..1 of the way
    // to its top), drop under its top in metres])
    const prof = [[1.1, 0, 0], [1.02, 0.25, 0], [0.98, 0.6, 0], [0.955, 1, 0.005], [0.945, 1, 0.0005], [0.925, 1, 0], [0.905, 1, 0.003], [0.9, 1, 0.022]];
    const R = prof.length, pos = new Float32Array(N * R * 3), idx = [];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2, top = back + (front - back) * Math.max(0, Math.cos(a)) ** 1.5;
      prof.forEach(([s, h, d], r) => { const k = (j * R + r) * 3; pos[k] = Math.sin(a) * rx * s; pos[k + 1] = yb + (top - yb) * h - d; pos[k + 2] = cz + Math.cos(a) * rz * s; });
    }
    for (let j = 0; j < N; j++) for (let r = 0; r < R - 1; r++) { const a = j * R + r, b = ((j + 1) % N) * R + r; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
    // (outward: its outer face out; flipped if the winding came round the other way)
    g.computeVertexNormals(); { const n = g.attributes.normal; if (n.getZ(0) < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); } }
    // (the coat's weights, from its nearest point at its neck)
    const CP = coat.geometry.attributes.position, SI = coat.geometry.attributes.skinIndex, SW = coat.geometry.attributes.skinWeight, near = [];
    for (const v of new Set(coat.geometry.index.array)) if (CP.getY(v) > 1.33) near.push(v);
    const si = new Float32Array(N * R * 4), sw = new Float32Array(N * R * 4);
    for (let i = 0; i < N * R; i++) {
      let best = -1, bd = 1e9; const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      for (const v of near) { const d = (CP.getX(v) - x) ** 2 + (CP.getY(v) - y) ** 2 + (CP.getZ(v) - z) ** 2; if (d < bd) { bd = d; best = v; } }
      for (let c = 0; c < 4; c++) { si[i * 4 + c] = SI.getComponent(best, c); sw[i * 4 + c] = SW.getComponent(best, c); }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(si), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const m = new THREE.SkinnedMesh(g, mat); m.name = 'galaCollar'; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.position.copy(coat.position); m.quaternion.copy(coat.quaternion); m.scale.copy(coat.scale);
    coat.parent.add(m); m.bind(coat.skeleton, coat.bindMatrix);
    return m;
  }
  function fionaNight(on) {
    const F = S.fiona; if (!F) return;
    if (on && !gala0) {
      gala0 = [];
      const keep = (o, m, props) => gala0.push([o, m, Object.fromEntries(props.map((p) => [p, p === 'color' ? m.color.getHex() : m[p]])), o.visible]);
      F.root.traverse((o) => {
        const m = o.isMesh && o.material; if (!m) return;
        if (m.name === 'puffer') {
          keep(o, m, ['color', 'roughness', 'map', 'normalMap']);
          o.userData.gala ||= standCollar(tailored(o.geometry), COAT_NECK); gala0.at(-1).push(o.geometry, m); o.geometry = o.userData.gala;
          // (round 7's review: a plum track top, not velvet; no pile sheen, no nap. A velvet of its own now, its sheen a
          // rose glow at every edge turned from the pavilion's bulbs, the face of the pile darker)
          o.material = o.userData.velvet ||= new THREE.MeshPhysicalMaterial({ name: 'puffer', color: 0x45182a, roughness: 0.55, sheen: 0.85, sheenColor: new THREE.Color('#C86C8E'), sheenRoughness: 0.32 });
          const band = o.userData.collar ||= collarBand(o, new THREE.MeshPhysicalMaterial({ name: 'galaCollar', color: 0x45182a, roughness: 0.55, sheen: 0.85, sheenColor: new THREE.Color('#C86C8E'), sheenRoughness: 0.32 })); band.visible = true; gala0.push([band, null, {}, false]);
          return;
        } else if (m.name === 'clothes') {
          keep(o, m, ['color', 'roughness', 'map', 'normalMap']); m.map = null; m.normalMap = null; m.color.setHex(0x141418); m.roughness = 0.85;
          o.userData.gala ||= standCollar(o.geometry, TEE_NECK); gala0.at(-1).push(o.geometry); o.geometry = o.userData.gala;
        }
        else if (m.name === 'shoes') { keep(o, m, ['color', 'roughness']); m.color.setHex(0x16161a); m.roughness = 0.18; }
        else if (m.name === 'hair') { keep(o, m, ['roughness']); m.roughness = 0.4; }
        else return;
        m.needsUpdate = true;
      });
      if (F.shades) { gala0.push([F.shades, null, {}, F.shades.visible]); F.shades.visible = false; }
    }
    if (!on && gala0) {
      for (const [o, m, p, vis, geo, mat] of gala0) {
        o.visible = vis; if (geo) o.geometry = geo; if (mat) o.material = mat; if (!m) continue;
        for (const [k, v] of Object.entries(p)) { if (k === 'color') m.color.setHex(v); else m[k] = v; }
        m.needsUpdate = true;
      }
      gala0 = null;
    }
  }
  // (Rook's stand-in: a Suit's body, until his own model is signed off; Knox is Knox)
  const rook = () => S.C?.hooks, knox = () => S.C?.knox;
  // (inside, past Knox on the door: where the recon starts)
  const IN = at(0.8, -12.2);
  // (where the run starts, after the flip)
  const RUN0 = at(1.4, 3.6);
  // Mr. Big's feed from his office, live on the pavilion's screen (his study drawn into its texture each frame)
  let feedHook = null;
  function feed(on) {
    S.feedOn = !!on; S.pav?.feed(on); S.C?.boss?.screen ? S.C.boss.screen(on) : S.C?.boss?.phone(on);
    feedHook?.(); feedHook = on ? hook(() => S.C?.boss?.pose(now() / 1000 % 60, {})) : null;
  }
  function showPav(on) {
    if (!S.pav) return;
    if (on && !S.pav.shown) { S.pav.reset(); S.pav.show(true); S.guests?.reset(); S.guests?.show(true); S.sawMarks = false; }
    if (!on) { S.pav.show(false); feed(false); S.guests?.show(false); S.tray?.drop(); }
    holds(on ? [PAV_HOLD] : []);
  }
  // Knox on the door, idling, every frame he's up out of a scene
  let knoxHook = null;
  function knoxOnDoor(on) {
    knoxHook?.(); knoxHook = null; const K = knox(); if (!K) return;
    if (!on) { K.root.visible = false; return; }
    const d = SPOTS.door; K.root.visible = true; K.root.position.set(d.x, gy(d.x, d.z), d.z); K.root.rotation.set(0, PAV.h + PI + 0.6, 0);
    K.rig.set([[0, S.C.SUITS?.idle || 'thugIdle']]);
    knoxHook = hook(() => { if (!W.cutscene) K.rig.pose(now() / 1000 % 30); });
  }
  // the pavilion's frame: the key's glow, the alarm, the art's near textures, the guests, the tray at his shoulder
  let heistT = now();
  function heistFrame() {
    const t = now(), dt = Math.min(0.05, (t - heistT) / 1000); heistT = t;
    if (!S.pav?.shown) return;
    const cp = app.cameraSystem.camera.position;
    S.pav.update(dt, cp); S.guests?.update(dt, cp); S.tray?.follow();
  }
  heist.frame = heistFrame;
  function tidy() {
    W.calls?.stop({ quiet: true, of: 'm4:' });
    hooks.clear(); feedHook = null; knoxHook = null;
    ui.objective(null); ui.sub(null); ui.help(null); ui.counter(null); ui.caller(null); ui.hold(null); ui.phone?.hide?.();
    gps.clear(); for (const id of [...gps.blips.keys()]) gps.unblip(id);
    if (S.feedOn) { S.C?.boss?.screen?.(false); S.C?.boss?.phone(false); } S.feedOn = false;
    S.crew = null;
    S.recon?.dispose(); S.recon = null; S.pad?.show(false); S.tray?.stopAct(); U.clear();
  }
  function teardown() {
    tidy(); holds([]); undusk(); unnight(); beamsOff(false); objLine(true);
    showPav(false);
    for (const who of [rook(), knox(), S.fiona]) if (who) who.root.visible = false;
    fionaNight(false); S.setsP = null;
    if (P.inVehicle && cm.activeMode !== 'car' && !flying()) P.inVehicle = false;
    ESC.teardown();
  }
  function inTheCar(x, z, h) { place(W, { car: [x, z, h] }); P.inVehicle = true; P.mesh.visible = false; P.speed = 0; app.selectMode('car'); }
  function endCall(id) { if (W.calls?.owes?.(id)) W.calls.stop({ quiet: true, of: 'm4:' }); }
  async function scene(def, { fadeIn = false } = {}) {
    W.cutscene = true; ui.cine(true); cm.resetInput?.();
    def.setup?.();
    if (fadeIn) ui.fade(0, 0.7);
    return runScene(W, def);
  }

  // the escape (m4-escape.js), with the mission's helpers
  const ESC = createEscape(W, {
    now, wait, delay, gsleep, say, hook, marker, objective, light, showPav, scene, stats, sets, S, PAV,
    fail: (r, ko) => fail(r, ko), knox,
    // (where the run starts, after the flip, and where the Suits come from: the pavilion's frame)
    // (14 Nov, the owner's review: from beside the case, not behind it, so the follow camera starts clear of the case;
    // the Suits from the staff entrance, out of the fight's 12 m as he starts to run)
    runFrom: () => ({ ...RUN0, h: PAV.h }), suitsFrom: () => at(0.5, -15.5),
    crew: (c) => { S.crew = c; }, downed: () => { stats.ko = S.crew ? S.crew.enemies.filter((e) => !e.alive).length : 0; S.crew = null; },
  });

  /* --------------------------------------------------------- the phases -- */
  const PHASES = {
    // beat 1: Rook on his bench, dusk
    async bench(fresh) {
      light('dusk');
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      await ui.fade(1, 0.4);
      W.combat?.clear?.();
      await sets();
      // (his car at the curb of Chrystie St, whichever way he came)
      if (fresh || dist(car.position, R_AT.x, R_AT.z) > 60) place(W, { car: BENCH.car });
      place(W, { dan: BENCH.dan });
      await scene(benchScene(W, { say, rook: rook(), pav: S.pav }), { fadeIn: true });
      if (rook()) rook().root.visible = false;
      place(W, { dan: BENCH.out });
      ui.title('ACT II · INSIDERS', 'Shredder');
      await delay(2.4);
    },
    // beat 4: through Chinatown to the Seaport, Jane on the car phone
    async seaport(fresh) {
      light('dusk');
      if (fresh) inTheCar(...BENCH.car);
      await sets();
      const dest = { x: SPOTS.carAt.x, z: SPOTS.carAt.z, name: 'The Seaport · South St', still: true };
      const drive = gps.drive({ dest, objective: ['Go to the ', { Seaport: 'yellow' }, '.'] });
      W.calls?.start('m4-seaport', { wrapWhen: () => dist(me(), dest.x, dest.z) < 250, hurryWhen: () => dist(me(), dest.x, dest.z) < 450 });
      let up = false;
      const off = hook(() => { drive.step(); if (!up && dist(me(), PAV.x, PAV.z) < 700) { up = true; showPav(true); knoxOnDoor(true); } });
      // (the review, round 3: at the curb with Jane's main lines still to say, the scene waits for them, the wheel still
      // his: "Jane's still talking." once. Out of the car the call is on hold and the scene goes on; 40 s at most)
      const there = () => { const d = dist(me(), dest.x, dest.z); return cm.activeMode === 'car' ? d < 10 && Math.abs(car.speed) < 6 : d < 4; };
      let heldAt = null;
      try {
        await wait(() => {
          if (!there()) return false;
          if (cm.activeMode !== 'car' || W.calls?.owes?.('m4-seaport') !== 'main') return true;
          if (heldAt == null) { heldAt = now(); ui.help("Jane's still talking.", 4); }
          return now() - heldAt > 40000;
        });
      }
      finally { off(); drive.stop(); if (heldAt != null) ui.help(null); }
      if (cm.activeMode === 'car') { car.speed = 0; car.vx = car.vz = 0; car.angularVel = 0; }
      endCall('m4-seaport');
      showPav(true);
    },
    // beat 5: in the waiter's jacket, past Knox at the staff entrance
    async arrival() {
      await sets(); light('midnight'); showPav(true);
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      await ui.fade(1, 0.3);
      if (cm.activeMode !== 'person') place(W, { dan: [SPOTS.dan0.x, SPOTS.dan0.z, PAV.h] });
      knoxOnDoor(false);
      await scene(arrivalScene(W, { say, knox: knox() }), { fadeIn: true });
      knoxOnDoor(true);
      place(W, { dan: [IN.x, IN.z, PAV.h] });
    },
    // beat 6: the artist's mark, once in each of the three Harbor Nocturnes on the art wall; the Suits watching
    async recon(fresh) {
      await sets(); light('midnight');
      if (fresh) { place(W, { car: [SPOTS.carAt.x, SPOTS.carAt.z, PAV.h], dan: [IN.x, IN.z, PAV.h] }); }
      showPav(true); knoxOnDoor(true);
      S.guests?.mode('chat');
      for (const p of S.pav.panels) p.found = false;
      const R = S.recon = createRecon(W, S.pav, { U, knox: knox() });
      document.body.classList.add('m4-recon');
      await R.spawn(); R.tray = S.tray;
      objective(['Find the ', { "artist's mark": 'green' }, '.'], null);
      ui.counter('MARK', '0/3');
      ui.dm?.('Jane', 'his mark is hidden once in each harbor nocturne. grab a tray from the bar first. nobody looks at a waiter.', 10);
      delay(1.2).then(() => ui.help(['Take a ', { tray: 'yellow' }, ' from the bar, then hold [F] at each ', { 'Harbor Nocturne': 'green' }, " on the art wall. Keep out of the Suits' sight."], 9)).catch(() => {});
      // (a soft ring on the deck where he stands to study each one, no column of light: the look review's round 4,
      // 15 Nov, the green cylinders were huge in the shot, cut into the art wall and clipped the frame)
      const marks = S.pav.panels.map((p) => ({ p, mk: marker(p.x, p.z, { color: '#4ADE80', radius: 0.5, height: 1.2, alpha: 0.18, y: S.pav.y }) }));
      for (const { mk } of marks) mk.m.fade(0);
      for (const { p } of marks) gps.blip('mark' + p.num, { x: p.x, z: p.z, kind: 'object', name: p.title });
      const acts = new Map(marks.map(({ p }) => [p, ui.holdAct({ label: 'study the painting', verb: 'Walk up to', noun: 'the painting', secs: 1.4, show: 4, reach: 1.5 })]));
      let tipped = false;
      const off = hook(() => {
        const dt = frameDt(), onFoot = cm.activeMode === 'person';
        // (the look review's round 8: the three study rings on the deck showed from a scene's camera over the pavilion;
        // a guide for his feet, so only while he plays)
        for (const { p, mk } of marks) if (!p.found) mk.m.group.visible = !W.cutscene;
        if (!S.tray.held && S.tray.step(dt, onFoot)) { ui.help(['A ', { tray: 'yellow' }, ': the Suits are slower to notice a waiter.'], 4); }
        for (const { p, mk } of marks) {
          if (p.found) continue;
          if (acts.get(p).step(dt, dist(P.position, p.x, p.z), onFoot)) {
            p.found = true; acts.get(p).stop(); mk.off(); gps.unblip('mark' + p.num); sfx?.play('ding', { gain: 0.14 });
            const n = S.pav.panels.filter((q) => q.found).length; ui.counter('MARK', `${n}/3`);
            ui.help([`${p.title}: the `, { [p.glyph]: 'green' }, '.'], 6);
          }
        }
        const seen = R.step(dt);
        if (seen && !tipped) {
          tipped = true; const by = R.by;
          U.banner('SPOTTED!', by ? `${by.name} saw you.` : 'They saw you.');
          fail('You were spotted.');
        }
        if (dist(me(), PAV.x, PAV.z) > 160) fail('You left the pavilion.');
      });
      try { await wait(() => S.pav.panels.every((p) => p.found)); }
      finally { document.body.classList.remove('m4-recon'); off(); for (const a of acts.values()) a.stop(); for (const { mk } of marks) mk.off(); ui.counter(null); S.tray.stopAct(); for (const { p } of marks) gps.unblip('mark' + p.num); }
      S.sawMarks = true;
      R.dispose(); S.recon = null; W.combat?.clear?.();
      ui.objective(['You found the ', { "artist's mark": 'green' }, '.'], 3);
      await delay(1.2);
    },
    // beat 7: the unveiling, Mr. Big on the big screen from his office; the guests gather facing it
    async unveil(fresh) {
      await sets(); light('midnight'); showPav(true); knoxOnDoor(true);
      if (fresh) for (const p of S.pav.panels) p.found = true;
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      await ui.fade(1, 0.3);
      S.pav.caseState('locked'); S.pav.cert(story.t('MR. BIG'));
      S.guests?.mode('watch', { snap: true });
      feed(true);
      place(W, { dan: [at(-1.2, -1.4).x, at(-1.2, -1.4).z, PAV.h] });
      await scene(unveilScene(W, { say, fiona: S.fiona, pav: S.pav, guests: S.guests }), { fadeIn: true });
      S.pav.caseState('open');
      place(W, { dan: [at(-1.2, -1.4).x, at(-1.2, -1.4).z, PAV.h] });
    },
    // beat 8: the grab, while the guests face the screen: open the case, then its pad, the marks in the Nocturnes' order
    async grab(fresh) {
      await sets(); light('midnight'); showPav(true); knoxOnDoor(true);
      if (fresh) { for (const p of S.pav.panels) p.found = true; feed(true); S.pav.caseState('open'); S.guests?.mode('watch', { snap: true }); place(W, { dan: [at(-1.2, -1.4).x, at(-1.2, -1.4).z, PAV.h] }); }
      if (S.fiona) { const F = SPOTS.riser; S.fiona.root.visible = true; S.fiona.root.position.set(F.x, S.pav.y + 0.35, F.z); S.fiona.root.rotation.set(0, PAV.h + PI, 0); S.fiona.rig.set([[0, fionaTalk(S.fiona)]]); }
      const fionaOn = S.fiona ? hook(() => S.fiona.rig.pose(now() / 1000 % 60)) : null;
      const C = SPOTS.case, t0 = now();
      S.pad.order = S.pav.order; S.pad.reset();
      objective(['Open the ', { case: 'green' }, '.'], null);
      gps.blip('case', { x: C.x, z: C.z, kind: 'object', name: 'The display case' });
      ui.help(['The window is open for ', { '40 seconds': 'yellow' }, '. Hold [F] at the case, then press the marks in the order of the ', { Nocturnes: 'green' }, ': I, II, III.'], 8);
      // (skipped the marks: Jane read them off the art wall for him)
      if (!S.sawMarks) ui.dm?.('Jane', `the marks, in order: ${S.pav.order.map((g, i) => `${NUMERAL[i]} ${g}`).join(', ')}.`, 14);
      else ui.dm?.('Jane', 'I, II, III. the order of the nocturnes, not the order you found them.', 9);
      // (Fiona keeps them looking at the screen)
      delay(4).then(() => say([
        ['Fiona', PINK, 'While the key wakes up: what does the High Artwork mean to you?'],
        ['Mr. Big', ACID, 'It means it is mine, Fiona.'],
        ['Fiona', PINK, 'Wow. Chills, everybody.'],
        ['Mr. Big', ACID, 'Ninety seconds, then I sign. Nobody touch anything.'],
      ])).catch(() => {});
      let opened = false;
      const act = ui.holdAct({ label: 'open the case', verb: 'Walk up to', noun: 'the case', secs: 1.0, show: 7, reach: 1.8 });
      const off = hook(() => {
        const dt = frameDt(), left = GRAB_SECS - (now() - t0) / 1000;
        ui.counter('WINDOW', String(Math.max(0, Math.ceil(left))));
        if (left <= 0) { fail('The window closed.'); return; }
        const d = dist(P.position, C.x, C.z), onFoot = cm.activeMode === 'person';
        if (!opened) {
          if (act.step(dt, d, onFoot)) { act.stop(); opened = true; sfx?.play('ding', { gain: 0.12 }); objective(['Press the ', { marks: 'green' }, ' in order: I, II, III.'], null); }
        } else S.pad.show(onFoot && d < 2.2);
      });
      try { await wait(() => S.pad.done); }
      finally { off(); fionaOn?.(); act.stop(); S.pad.show(false); ui.counter(null); gps.unblip('case'); }
      stats.wrong = S.pad.wrong;
    },
    // beat 9: the flip, the empty case, every head turning; the alarm, the guests scatter
    async flip() {
      // (midnight here too: ?m4=flip, straight in, played the flip in the afternoon)
      await sets(); light('midnight'); showPav(true);
      W.cutscene = true; ui.cine(true); cm.resetInput?.();
      knoxOnDoor(false);
      await scene(flipScene(W, { say, fiona: S.fiona, knox: knox(), pav: S.pav, guests: S.guests, tray: S.tray }));
      feed(false);
      S.pav.caseState('alarm'); sfx?.play('siren', { gain: 0.2, dur: 3.2 });
      S.guests?.mode('scatter'); S.tray?.drop();
      place(W, { dan: [RUN0.x, RUN0.z, PAV.h] });
    },
    // beats 10-11, the escape (m4-escape.js): the run to the helicopter, the take-off, the flight, the landing, the walk
    // to the last ferry, the boarding, the hostage call on its stern deck
    run: (f) => ESC.run(f), takeoff: (f) => ESC.takeoff(f), flight: (f) => ESC.flight(f), landing: (f) => ESC.landing(f),
    ferry: (f) => ESC.ferry(f), boarding: (f) => ESC.boarding(f), call: (f) => ESC.call(f),
  };
  const ORDER = ['bench', 'seaport', 'arrival', 'recon', 'unveil', 'grab', 'flip', 'run', 'takeoff', 'flight', 'landing', 'ferry', 'boarding', 'call'];
  const CHECKPOINT = { bench: 'bench', seaport: 'seaport', arrival: 'seaport', recon: 'recon', unveil: 'grab', grab: 'grab', flip: 'grab', run: 'run', takeoff: 'run', flight: 'flight', landing: 'flight', ferry: 'ferry', boarding: 'ferry', call: 'ferry' };
  const PHASE_OF = { bench: 'bench', seaport: 'seaport', recon: 'recon', grab: 'unveil', run: 'run', flight: 'flight', ferry: 'ferry', call: 'call' };
  const LABELS = { bench: "Rook's bench", seaport: 'To the Seaport', recon: "The artist's mark", grab: 'The grab', run: 'Run for it', flight: 'The flight', ferry: 'The last ferry' };
  const TIPS = {
    'The window closed.': ['Stand at the ', { case: 'green' }, ' and keep [F] held to open it, then press the marks in the order of the ', { Nocturnes: 'green' }, ' (I, II, III), not the order you found them.'],
    'You were spotted.': ['Take a ', { tray: 'yellow' }, ' from the bar first, and study the paintings while the Suit on the art wall walks away from you.'],
    'The Suits caught you.': ['Sprint straight down South St to the ', { helicopter: 'yellow' }, ' at its closed end: the Suits start at the entrance behind you.'],
    'Dan got knocked out.': ["Don't stop to fight: the ", { helicopter: 'yellow' }, ' is the way out.'],
    'You missed the last ferry.': ['Walk the esplanade along the river, the route on the Radar: the ', { 'FERRY landing': 'yellow' }, ' is at Vesey St.'],
    'You flew off course.': ['Follow the ', { 'yellow rings': 'yellow' }, ' west to Battery Park City, by the Hudson: the line on the Radar points the way.'],
    'You left the pavilion.': ['The three panels are inside the pavilion, on South St.'],
  };
  const RETRY = { bench: "Retry: from Rook's bench", seaport: 'Retry: to the Seaport', recon: "Retry: the artist's mark", grab: 'Retry: the unveiling', run: 'Retry: the run', flight: 'Retry: the flight', ferry: 'Retry: the last ferry' };
  const SKIP = { recon: 'Skip the marks: start at the unveiling', grab: 'Skip the grab: start at the run', flip: 'Skip the grab: start at the run', run: 'Skip the run: start in the air', flight: 'Skip the flight: start on the riverfront', ferry: 'Skip the walk: start on the ferry' };

  /* --------------------------------------------------- passed, hand-off -- */
  async function passed() {
    // (the next morning: under the black the call ends on, Pier 11, the car on South St where Gears left it)
    teardown();
    light('golden'); morningLight(W);
    place(W, MORNING); morningQuiet(W, true);
    ui.caption('THE NEXT MORNING', 'Pier 11 · Wall St', '#FFC93C', 2.6);
    await gsleep(900);
    ui.fade(0, 0.9);
    await gsleep(1600);
    const secs = Math.round((now() - stats.t0) / 1000);
    sfx?.play('passed'); W.audio?.play?.('missionPassed');
    await ui.passed({ title: 'Shredder', stats: [
      ['TIME', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`], ['HIGH ARTWORK TAKEN', '1/1'],
      ['SUITS DOWN', String(stats.ko || 0)], ['HITS TAKEN', String(stats.hits)],
    ], note: 'You hold the key · the shredder stopped' }, 6);
    W.progress = { ...(W.progress || {}), m4: true };
    markDone(W, 'm4');
    await gsleep(4500);
    sfx?.play('buzz', { gain: 0.18, times: 2 }); sfx?.play('ding', { gain: 0.14 }); W.audio?.play?.('phoneBuzz');
    ui.dm('Unknown number', "they took it off my truck. vault truck. stock exchange at 9. he doesn't know it was me. yet. -R", 11);
    await gsleep(5500);
    await endEpisode(W);
  }

  /* ------------------------------------------------------- the runner -- */
  const M = {
    get phase() { return M._phase; },
    get running() { return running && !!M._phase && M._phase !== 'passed'; },
    stop() { running = false; tok.dead = true; teardown(); W.combat?.clear?.(); },
    async run(at = 'bench') {
      let i = Math.max(0, ORDER.indexOf(PHASE_OF[at] || at)), fresh = true;
      while (i < ORDER.length && running) {
        const phase = (M._phase = ORDER[i]);
        tok = { dead: false, err: null };
        ui.step('m4:' + phase);
        try {
          await PHASES[phase](fresh);
          tok.dead = true; tok.err = new Quit();
          fresh = false; i++;
        } catch (e) {
          if (e instanceof Quit) return;
          if (!(e instanceof Fail)) { console.error('[m4]', phase, e); tidy(); W.cutscene = false; ui.cine(false); return; }
          tidy(); cm.resetInput?.();
          if (e.ko) { ui.ko(true); sfx?.play('failed'); await sleep(2600); ui.ko(false); } else sfx?.play('failed');
          const cp = CHECKPOINT[phase]; fails[cp] = (fails[cp] || 0) + 1;
          const choice = await ui.failed(e.reason, { skip: fails[cp] >= 3 && !!SKIP[phase], tip: TIPS[e.reason], retryLabel: RETRY[cp], skipLabel: SKIP[phase], quitLabel: 'Quit: back to free roam' });
          W.combat?.clear?.(); S.crew = null;
          if (W.combat?.player) W.combat.player.hp = W.combat.player.maxHp;
          if (choice === 'quit') { M.stop(); toNext(W, { quick: true }); return; }
          if (choice === 'skip') { i = ORDER.indexOf(PHASE_OF[cp]) + 1; if (cp === 'grab') i = ORDER.indexOf('flip'); fresh = true; continue; }
          i = ORDER.indexOf(PHASE_OF[cp]); fresh = true;
        }
      }
      if (!running) return;
      M._phase = 'passed';
      await passed();
      running = false; beamsOff(false);
    },
    fail,
    S,
    stats,
    // (one phase alone, fresh or not: the test drive's hook later, as m3.js playPart)
    async part(name, fresh) {
      M._phase = name; tok = { dead: false, err: null };
      ui.step('m4:' + name);
      try { await PHASES[name](fresh); tok.dead = true; tok.err = new Quit(); return { ok: true, stats }; }
      catch (e) {
        if (e instanceof Quit) return { quit: true };
        if (!(e instanceof Fail)) throw e;
        tidy(); cm.resetInput?.();
        return { fail: e.reason, ko: e.ko, tip: TIPS[e.reason] || null, stats };
      }
    },
  };
  if (!quiet) missions(W).register({
    id: 'm4', act: 'Act II · Mission 4', title: 'Shredder',
    checkpoints: ['bench', 'seaport', 'recon', 'grab', 'run', 'flight', 'ferry'].map((id) => ({ id, label: LABELS[id] })),
    active: () => running && !!M._phase && M._phase !== 'passed',
    at: () => CHECKPOINT[M._phase] || 'bench',
    restart: (at) => { ui.ko(false); start(W, { at, keep: true }).catch((e) => console.error('[m4]', e)); },
  });
  return M;
}

// (Mission 4's phases one at a time, for the test drive later: wagmi/storyrun/runner.js does not list them yet)
export async function playPart(W, name, { fresh = false, keep = false } = {}) {
  let M = W._m4part;
  if (!M) M = W._m4part = createMission(W, { keep, quiet: true });
  return M.part(name, fresh);
}
export function endParts(W) { const M = W._m4part; W._m4part = null; if (M) M.stop(); }
