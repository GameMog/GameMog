// Mog City: Mission 4's gallery (the owner's call, 15 Nov: "build the gallery with original art slots now"), a
// self-contained module beside the open pavilion (m4-pavilion.js), on its spot and in its frame, so wiring it into the
// mission is a swap. Dan walks into this one (the owner's exception to "players can't enter buildings": it has its own
// colliders and floor, and a save checkpoint at its door). Loaded only when asked for (wagmi/mission/m4-gallery.js).
//   The beat: a giant gold statue of the Regent (an original figure, wagmi/gallery/art.js) seen through the glass as he
//   comes up the closed street; inside, three portraits of it, each in another crown, each frame's cartouche enamelled
//   with a sigil. Rook: "Look at the statue's reflection." From the brass medallion the black glass behind the statue
//   shows its crown's back, and on it the sigil that names the High Artwork. Taken within reach, the certificate goes
//   MR. BIG -> DAN. A wrong one lifted trips the alarm (what it costs is the mission's call: opts.onWrong).
//   The mark is the frame's, not the painting's: a real work hung in a slot (tokens.js) leaves the puzzle as it was.
//
//   const G = mount(W, { ui, onCheckpoint, setCertificateOwner, onClue, onTake, onWrong, interact, holdTraffic, wrong })
//     (built hidden; its lights are never in the scene, only in its own materials' lights node (building.js), so
//     mounting it recompiles none of the city's materials; G.show(true) to put it up)
//   G.show(on)            the set, its colliders, its floor, its lights (and the street held from traffic if asked)
//   G.reset({ sigil })    a fresh deal: the statue's mark (random unless given), the frames' sigils; nothing taken; the
//                         certificate MR. BIG; the checkpoint armed again
//   G.clue                { found, sigil, at: { x, z } (the medallion) }      G.findClue()  the clue found (no camera)
//   G.answer              the index (0..2) of the High Artwork among G.portraits
//   G.portraits           [{ x, z (where he stands to take it), title, crown, sigil, taken }]
//   G.takeArtwork(i)      take portrait i: { ok, right, strikes }; right flips the certificate (G.setCertificateOwner);
//                         wrong: G.strikes + 1, the alarm (G.alarm), opts.onWrong(i, portrait, { strikes })
//   G.alarm(secs)         the room's lights and its ceiling lines pulse red for secs (0: off)
//   G.setCertificateOwner(owner, glitch)   the certificate's OWNER line (and opts.setCertificateOwner(owner))
//   G.checkpoint          'gallery' (G.save() -> state, G.restore(state): the state as saved, no callbacks but the
//                         certificate's one owner, the checkpoint not fired again; G.respawn(): Dan inside the door)
//   G.update(dt)          each frame (its own loop runs when mounted with interact: the lab, below)
//   G.stats()             { draws, tris, texMB } of what it shows      unmount(G)  all of it out of the scene
//   G.prepare()           its shaders compiled in the background while hidden (a promise), so a later first
//                         G.show(true) doesn't hitch (m4-gallery.js mount starts it: G.ready)
//   opts.wrong            with interact: 'fail' (the lab's: a wrong piece fails it, retried from the door with a
//                         fresh deal, so the clue has to be found again) or 'alarm' (the alarm only; the mission decides)
// The lab: lab/gallery.html, or ?gallery=walk|clue|take|cert (&time=midnight|twilight): lab(W, mode) below.
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PAV, at } from '../mission/m4-set.js';
import { buildGallery, GAL, GSPOTS, STATUE, SW } from './building.js';
import { SIGILS, SIGIL_NAME, certCanvas } from './art.js';
import { fillSlots } from './tokens.js';
import { createDirector, keys } from '../mission/cine.js';
import { S as story } from '../story/index.js';

const PI = Math.PI;
const Q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (the lab's capture handles, G.still / G.timeScale, are read only on the lab's own path: ?gallery=)
const LAB = Q.has('gallery');
const CLUE_R = 0.8, REACH = 1.7;
// a point in the gallery's frame to the world, with a height
const wp = (a, y, b) => { const p = at(a, b); return [p.x, y, p.z]; };
// (the frame's b of a world point)
const frameB = (x, z) => { const dx = x - PAV.x, dz = z - PAV.z; return Math.sin(PAV.h) * dx + Math.cos(PAV.h) * dz; };
const frameA = (x, z) => { const dx = x - PAV.x, dz = z - PAV.z; return Math.cos(PAV.h) * dx - Math.sin(PAV.h) * dz; };

export function mount(W, opts = {}) {
  const app = W.app, cm = app.controllerManager;
  // (the gold's own reflections: a small studio environment, so it reads as gold at night too)
  let envMap = null;
  try { const pm = new THREE.PMREMGenerator(app.renderer); envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch (e) { console.warn('[gallery] env', e); }
  const B = buildGallery(W, { envMap });
  app.scene.add(B.group);
  let shown = false, t = 0, held = null, entered = false, alarmT = 0, disposed = false;
  const portraits = B.slots.map((s) => { const p = at(s.p.a, s.p.b - 1.25); return { x: p.x, z: p.z, title: s.title, crown: s.st.crown, sigil: null, taken: false, slot: s }; });
  const clue = { found: false, sigil: null, at: GSPOTS.clue };
  // the deal: the statue's mark, the frames' sigils (no callbacks: reset and restore say what changed)
  const deal = (mark, sigils) => {
    portraits.forEach((p, i) => { p.sigil = sigils[i]; p.taken = false; p.slot.slot.setBadge(B.badges[sigils[i]]); p.slot.slot.group.visible = true; p.slot.ghost.visible = false; });
    G.answer = sigils.indexOf(mark);
    clue.found = false; clue.sigil = mark; B.statue.setMark(mark);
    G.strikes = 0; G.alarm(0);
  };
  const certOwner = (owner) => { certCanvas(B.cert.canvas, owner, false, 7); B.cert.texture.needsUpdate = true; opts.setCertificateOwner?.(owner); };
  const G = {
    group: B.group, colliders: B.colliders, portraits, clue, checkpoint: 'gallery', y: SW, answer: 0, strikes: 0, B,
    get shown() { return shown; },
    show(on) {
      shown = !!on; B.group.visible = shown; if (shown && !B.group.parent) app.scene.add(B.group);
      for (const l of B.lights) l.intensity = shown ? l.userData.k : 0;
      const Cc = cm.colliders; for (let i = Cc.length - 1; i >= 0; i--) if (Cc[i].wagmi === 'gallery') Cc.splice(i, 1);
      if (shown) Cc.push(...B.colliders);
      cm._colliderCells = null;
      const P = (window.NYC.groundPatches = window.NYC.groundPatches || []), k = P.indexOf(B.patch);
      if (shown && k < 0) P.push(B.patch); else if (!shown && k >= 0) P.splice(k, 1);
      cm._patchCount = -1;
      if (opts.holdTraffic) { const ps = [at(-7, GAL.b0 - 30), at(7, GAL.b0 - 30), at(-7, GAL.b1 + 6), at(7, GAL.b1 + 6)]; held = shown ? [{ minX: Math.min(...ps.map((p) => p.x)), maxX: Math.max(...ps.map((p) => p.x)), minZ: Math.min(...ps.map((p) => p.z)), maxZ: Math.max(...ps.map((p) => p.z)) }] : []; app.trafficSystem?.hold?.(held); }
      if (!shown) for (const s of B.slots) s.slot.lod(Infinity);
    },
    reset({ sigil = null } = {}) {
      const mark = sigil && SIGILS.includes(sigil) ? sigil : SIGILS[Math.floor(Math.random() * 3)];
      // (the three sigils dealt to the three frames afresh; the one that matches the statue's mark is the answer)
      const d = SIGILS.slice(); for (let i = 2; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
      deal(mark, d);
      certOwner(story.t('MR. BIG'));
      entered = false;
    },
    findClue() { if (clue.found) return; clue.found = true; B.medal.pulse(0); opts.onClue?.(clue.sigil); },
    takeArtwork(i) {
      const p = portraits[i]; if (!p || p.taken) return { ok: false, right: false, strikes: G.strikes };
      const right = i === G.answer;
      if (!right) { G.strikes++; G.alarm(4); opts.onWrong?.(i, p, { strikes: G.strikes }); return { ok: false, right: false, strikes: G.strikes }; }
      p.taken = true; p.slot.slot.group.visible = false; p.slot.ghost.visible = true;
      opts.onTake?.(i, p);
      return { ok: true, right: true, strikes: G.strikes };
    },
    alarm(secs) { alarmT = secs; if (!secs) B.alarm(0); },
    setCertificateOwner(owner, glitch = false) { if (glitch) { certCanvas(B.cert.canvas, owner, true, Math.floor(t * 60) + 7); B.cert.texture.needsUpdate = true; } else certOwner(owner); },
    save() { return { id: 'gallery', sigil: clue.sigil, deal: portraits.map((p) => p.sigil), found: clue.found, taken: portraits.map((p) => p.taken), strikes: G.strikes }; },
    restore(s) {
      if (!s?.sigil || !s.deal) return;
      deal(s.sigil, s.deal);
      G.strikes = s.strikes || 0;
      if (s.found) { clue.found = true; B.medal.pulse(0); }
      s.taken?.forEach((k, i) => { if (k) { portraits[i].taken = true; portraits[i].slot.slot.group.visible = false; portraits[i].slot.ghost.visible = true; } });
      // (one owner, once: DAN if the High Artwork went with the save, else MR. BIG)
      certOwner(story.t(s.taken?.[G.answer] ? 'DAN' : 'MR. BIG'));
      // (restored at the checkpoint: it has fired)
      entered = true;
    },
    respawn() { const p = GSPOTS.inside; placeDan(W, p.x, p.z, PAV.h); },
    update(dt, cam = app.cameraSystem?.camera?.position) {
      if (!shown) return;
      t += dt;
      if (cam) {
        // (the portraits' full-size copies: at most one drawn a frame, ahead of need)
        let may = true;
        for (const s of B.slots) if (s.slot.lod(s.slot.at.distanceTo(cam), may)) may = false;
        // (the reflection only while the lens is in the front hall: from anywhere else it is behind walls)
        B.mirror.visible = frameB(cam.x, cam.z) < GAL.MB + 0.2;
      }
      if (!clue.found) B.medal.pulse(0.5 + 0.5 * Math.sin(t * 2.4));
      if (alarmT > 0) { alarmT = Math.max(0, alarmT - dt); B.alarm(alarmT > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 7)) : 0); }
      // (the checkpoint: the first time he is through the door)
      const P = W.person;
      if (!entered && P && frameB(P.position.x, P.position.z) > GAL.b0 + 0.8 && Math.abs(frameA(P.position.x, P.position.z)) < GAL.a) { entered = true; opts.onCheckpoint?.(G.save()); }
    },
    stats() {
      let draws = 0, tris = 0; const seen = new Set(); let texB = 0;
      B.group.traverseVisible((o) => {
        if (!o.isMesh) return; draws++;
        const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3;
        for (const k of ['map', 'emissiveMap']) { const tx = o.material?.[k]; if (tx && !seen.has(tx)) { seen.add(tx); const im = tx.image; if (im?.width) texB += im.width * im.height * 4 * (tx.generateMipmaps ? 1.33 : 1); } }
      });
      return { draws, tris: Math.round(tris), texMB: +(texB / 1048576).toFixed(2), lights: B.lights.length };
    },
    dispose() { disposed = true; G.show(false); B.dispose(); envMap?.dispose(); },
    // its shaders compiled in the background ahead of showing it (the phone check, round 3: a first show compiled them
    // in its first frame, a 2 s hitch); the city's are not touched (its lights are its materials' own). Slow: the async
    // pipelines took ~35 s in headless Chrome, so m4-gallery.js mount starts it (G.ready) and doesn't wait on it; a show
    // before it resolves compiles the rest then, as without it. Nothing to do once it is shown.
    async prepare() {
      const cam = app.cameraSystem?.camera, r = app.renderer; if (shown || !cam || !r?.compileAsync) return;
      // (out of the scene while it compiles, visible for the compile only: the city's frames meanwhile never draw it)
      app.scene.remove(B.group); B.group.visible = true; B.group.updateMatrixWorld(true);
      try { await r.compileAsync(B.group, cam, app.scene); } catch (e) { console.warn('[gallery] compile', e); }
      if (disposed) return; B.group.visible = shown; if (!B.group.parent) app.scene.add(B.group);
    },
  };
  G.reset({ sigil: opts.sigil || null });
  // (real works in the slots: off, and the list empty, until the owner switches it on: wagmi/gallery/tokens.js)
  fillSlots(Object.fromEntries(B.slots.map((s) => ['p' + (s.i + 1), { slot: s.slot, credit: s.credit }]))).catch(() => {});
  if (opts.interact) interact(W, G, opts);
  return G;
}
export function unmount(G) { G?.stop?.(); G?.dispose(); }

function placeDan(W, x, z, h) {
  const cm = W.app.controllerManager, p = W.person;
  if (cm.activeMode !== 'person') W.app.selectMode('person');
  p.position.set(x, cm.getGroundHeight(x, z, 'person'), z); p.heading = h; p.inVehicle = false; p.mesh.visible = true; p.speed = 0; p.verticalVel = 0;
  p.mesh.position.copy(p.position); p.mesh.rotation.y = p.heading;
}

/* ------------------------------------------------------- walking it -- */
// the gallery played on its own: the medallion and the portraits on hold-F, the clue's look in the black glass, the
// take, the certificate's flip, the alarm. ui: the mission's UI (wagmi/mission/ui.js createUI)
function interact(W, G, opts) {
  const app = W.app, cm = app.controllerManager, P = W.person, ui = opts.ui;
  const D = createDirector(W);
  let busy = false, live = true, last = performance.now(), told = false, rookUp = false;
  const clueAct = ui?.holdAct({ label: "look at the statue's reflection", verb: 'Walk up to', noun: 'the brass medallion', secs: 0.8, show: 5, reach: CLUE_R });
  const makeTake = () => ui?.holdAct({ label: 'take the painting', verb: 'Walk up to', noun: 'the painting', secs: 1.2, show: 4, reach: REACH });
  const takeActs = G.portraits.map(makeTake);
  const d2 = (x, z) => Math.hypot(P.position.x - x, P.position.z - z);
  // Rook's line down once the clue is found or he is out of the front hall (the look review, round 1: it stayed up in
  // the portrait room)
  const rookDown = () => { if (rookUp) { rookUp = false; ui?.dm?.(null); } };
  // (a cutscene's seconds since t0. On the lab's path only (?gallery=), G.timeScale under 1 slows them and G.still
  // (seconds) holds one there, for a capture; in the mission they are plain seconds)
  const clock = (t0) => (LAB && G.still != null ? G.still : ((performance.now() - t0) / 1000) * (LAB ? G.timeScale || 1 : 1));
  // the hold prompt below the art while he is in the gallery (ui.js puts it at 58% of the screen, over the middle of the
  // painting he is judging: the look review, round 2); a rule of this module's own, on a body class it alone sets
  const css = document.createElement('style'); css.id = 'gallery-hold-low';
  css.textContent = 'body.wg-gallery-low #wg .wg-hold { top: auto; bottom: max(12%, 84px); transform: translate(-50%, 0); }';
  document.head.appendChild(css);
  const low = (on) => document.body.classList.toggle('wg-gallery-low', !!on);
  async function clueView() {
    busy = true; W.cutscene = true; cm.resetInput?.(); ui?.hold?.(null); rookDown();
    // from his eyes on the medallion to the crown's back in the black glass: a slow push in on it
    const mark = B_markImage(G), eye = [P.position.x, P.position.y + 1.62, P.position.z];
    const look = mark.slice(), near = [eye[0] + (mark[0] - eye[0]) * 0.32, eye[1] + (mark[1] - eye[1]) * 0.32, eye[2] + (mark[2] - eye[2]) * 0.32];
    const pos = keys([[0, eye], [2.6, near]]), fov = keys([[0, 46], [2.6, 20]]);
    D.take(); const t0 = performance.now();
    await new Promise((res) => { D.onFrame = () => { const s = clock(t0); D.camera = { pos: pos(s), look, fov: fov(s), roll: 0 }; if (s > 3.6) { D.onFrame = null; res(); } }; });
    G.findClue();
    ui?.help(['The mark on the back of the crown: ', { [SIGIL_NAME[G.clue.sigil]]: 'yellow' }, '. Find the ', { frame: 'yellow' }, ' that wears it.'], 9);
    await D.release(0.6); W.cutscene = false; busy = false;
  }
  // the take: it lifts off its hooks, comes off the wall toward him, its top tipped to him, and down until its bottom
  // rail is at his waist, his hands under it (seen from the room's side, so the wall and the bare hooks show behind it)
  const _v = new THREE.Vector3();
  // (his elbows out and down, as he carries the can in the fight: wagmi/combat/hero.js POLE.L / POLE.R)
  const POLE_L = new THREE.Vector3(1, -0.8, -0.3), POLE_R = new THREE.Vector3(-1, -0.8, -0.3);
  async function takeMoment(i) {
    busy = true; W.cutscene = true; cm.resetInput?.(); ui?.hold?.(null); rookDown();
    const p = G.portraits[i], s = p.slot, grp = s.slot.group, y0 = grp.position.y, b0 = grp.position.z, hh = s.slot.outer.h / 2;
    const h = P.heading, right = [-Math.cos(h), Math.sin(h)];
    // (both hands round the bottom rail's front, shoulder width apart: the look review, round 2, saw one hand under a
    // painting that hung tilted in the air)
    const edge = (sx) => { grp.updateWorldMatrix(true, false); return grp.localToWorld(_v.set(sx * 0.36, -hh + 0.06, 0.1)).clone(); };
    // (off its hooks, out, and down until its bottom rail is just under his waist, carried, hardly tipped)
    const drop = Math.max(0.1, y0 - hh - SW - 0.86);
    D.take(); const t0 = performance.now();
    // (from the room's side of him: the wall, the bare hooks and the gap behind the frame in view)
    const side = s.p.a > 0.5 ? -1 : 1;
    // (three-quarters from his side, low: both hands on the rail in view, not behind his back)
    const cpos = wp(s.p.a + side * 3.0, SW + 1.95, s.p.b - 3.5), clook = wp(s.p.a + side * 0.1, SW + 1.55, s.p.b - 0.9);
    const ease = (x) => x * x * (3 - 2 * x), seg = (x, a, b) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))));
    await new Promise((res) => { D.onFrame = () => {
      const tt = clock(t0), lift = seg(tt, 0.35, 0.8), out = seg(tt, 0.8, 1.9);
      grp.position.y = y0 + lift * 0.06 - out * (drop + 0.06);
      grp.position.z = b0 - out * 0.66;
      grp.rotation.x = out * 0.05;
      // (each hand on the side nearer it)
      const a = edge(1), b = edge(-1), aR = (a.x - P.position.x) * right[0] + (a.z - P.position.z) * right[1] > 0;
      const w = seg(tt, 0.2, 0.8);
      W.dan?.reach?.('R', aR ? a : b, w, POLE_R); W.dan?.reach?.('L', aR ? b : a, w, POLE_L);
      D.camera = { pos: cpos, look: clook, fov: 50, roll: 0 };
      if (tt > 2.5) { D.onFrame = null; res(); }
    }; });
    W.dan?.reach?.('R', null, 0); W.dan?.reach?.('L', null, 0);
    grp.position.set(grp.position.x, y0, b0); grp.rotation.x = 0;
    G.takeArtwork(i);
    for (const t of takeActs) t?.stop();
    // the certificate: a glitch through it, then the new owner
    const cp = wp(0.5, SW + 1.8, GAL.VB + 2.9), cl = wp(0, SW + 1.75, GAL.VB);
    const t1 = performance.now(); let flipped = false;
    await new Promise((res) => { D.onFrame = () => {
      const s2 = clock(t1); D.camera = { pos: cp, look: cl, fov: 34, roll: 0 };
      if (s2 > 0.7 && s2 < 1.6) G.setCertificateOwner(Math.floor(s2 * 12) % 2 ? story.t('MR. BIG') : story.t('DAN'), true);
      if (s2 >= 1.6 && !flipped) { flipped = true; G.setCertificateOwner(story.t('DAN')); }
      if (s2 > 3.4) { D.onFrame = null; res(); }
    }; });
    ui?.help(['The ', { 'High Artwork': 'green' }, ' is yours. ', { [`${story.t('OWNER')} · ${story.t('DAN')}`]: 'green' }, '.'], 7);
    await D.release(0.6); W.cutscene = false; busy = false;
  }
  // a wrong piece lifted: the alarm. 'fail' (the lab's): the mission failed, retried from the door with a fresh deal (the
  // statue's mark too, so the clue is found again: guessing costs the whole way back); 'alarm': the alarm only
  async function wrongTake(i) {
    busy = true; rookDown(); ui?.hold?.(null);
    const r = G.takeArtwork(i);
    ui?.help([{ 'The alarm.': 'red' }, ' Not that one.'], 4);
    if ((opts.wrong || 'fail') === 'fail' && ui?.failed) {
      await sleep(1400);
      W.cutscene = true; cm.resetInput?.();
      await ui.failed('The alarm went off. Wrong piece.', { tip: 'Find the mark in the statue\'s reflection first: only one frame wears it.', retryLabel: 'Retry: from the door', quitLabel: 'Quit' });
      G.reset(); G.respawn(); app.cameraSystem?.resetForTeleport?.();
      for (let k = 0; k < takeActs.length; k++) { takeActs[k]?.stop(); takeActs[k] = makeTake(); }
      told = false; W.cutscene = false;
    } else { takeActs[i].stop(); takeActs[i] = makeTake(); }
    busy = false;
    return r;
  }
  (function loop() {
    if (!live) return; requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (W.paused) return;
    G.update(dt);
    // (nothing to hold through a take, the alarm or the fail card: the prompt down, every frame, while one resolves)
    if (busy) { ui?.hold?.(null); return; }
    if (!G.shown) { low(false); return; }
    const onFoot = cm.activeMode === 'person';
    const fb = frameB(P.position.x, P.position.z);
    const inside = fb > GAL.b0 + 0.5 && Math.abs(frameA(P.position.x, P.position.z)) < GAL.a;
    low(inside);
    if (inside && !told && !G.clue.found) { told = true; rookUp = true; ui?.dm?.('Rook', "Look at the statue's reflection.", 9); }
    if (rookUp && (G.clue.found || fb > GAL.MB + 0.6 || fb < GAL.b0 - 0.5)) rookDown();
    // (one prompt on the screen at a time: every act stepped, the nearest last, so its ring is the one shown)
    const acts = [];
    if (clueAct && !G.clue.found) acts.push([d2(G.clue.at.x, G.clue.at.z), clueAct, () => clueView().catch((e) => console.error('[gallery]', e))]);
    G.portraits.forEach((p, i) => {
      if (!takeActs[i] || p.taken) return;
      acts.push([d2(p.x, p.z), takeActs[i], () => (i === G.answer ? takeMoment(i) : wrongTake(i)).catch((e) => console.error('[gallery]', e))]);
    });
    acts.sort((x, y) => y[0] - x[0]);
    acts.forEach(([d, a, go], k) => { if (a.step(dt, k === acts.length - 1 ? d : Infinity, onFoot)) go(); });
  })();
  G.stop = () => { live = false; rookDown(); clueAct?.stop(); for (const a of takeActs) a?.stop(); low(false); css.remove(); };
  G.clueView = clueView; G.takeMoment = takeMoment; G.wrongTake = wrongTake; G.director = D;
}
// the mark's image in the black glass, in the world: the mark mirrored through b = MB
function B_markImage(G) {
  const m = G.B.statue.markAt;                        // (statue frame: faces +z, turned PI in the gallery's)
  const b = STATUE.b - m.z, bImg = 2 * GAL.MB - b;    // (turned PI: local -z is +b)
  return wp(STATUE.a, SW + STATUE.plinth + m.y, bImg);
}
export { B_markImage as markImage };

/* ------------------------------------------------------------ the lab -- */
// ?gallery=walk (Dan up the street from it, the gold through the glass), clue (on the medallion), take (before the
// High Artwork, the clue found), cert (it taken, OWNER · DAN); &time=midnight (default) | twilight; &sigil=star|moon|eye
export async function lab(W, mode) {
  const { createUI } = await import('../mission/ui.js');
  if (!W.ui) W.ui = createUI();
  W.ui.story(true); document.body.classList.add('wg-onfoot');
  for (let i = 0; i < 600 && !W.app.ready; i++) await sleep(100);
  await sleep(600);
  const app = W.app, time = Q.get('time') || 'midnight';
  app.selectTime?.(time);
  if (time === 'midnight') {
    // (the mission's night, as m4.js toNight lifts it: a faint moon, the sky's fill up)
    const ls = app.lightingSystem; if (ls) { ls.hemiLight.intensity = 3.6; ls.hemiLight.color.setHex(0x4a62a0); ls.hemiLight.groundColor.setHex(0x4e4246); ls.sunLight.intensity = 0.38; ls.sunLight.color.setHex(0x9db8ec); ls.sunLight.castShadow = false; ls.bakeEnvironmentMap?.(); ls.scene.environmentIntensity = 0.72; }
    const grade = app.postFX?.colorGrade; if (grade) { grade.exposure.value = 1.28; grade.saturation.value = 0.84; }
  }
  const log = (window.__gallery = { checkpoints: [], takes: [], wrong: [], certOwner: null, certOwners: [], clue: null });
  const G = mount(W, {
    ui: W.ui, interact: true, holdTraffic: true, sigil: Q.get('sigil'), wrong: Q.get('wrong') || 'fail',
    onCheckpoint: (s) => log.checkpoints.push(s), onTake: (i) => log.takes.push(i), onWrong: (i, p, info) => log.wrong.push([i, info.strikes]),
    onClue: (s) => { log.clue = s; }, setCertificateOwner: (o) => { log.certOwner = o; log.certOwners.push(o); },
  });
  G.show(true);
  log.G = G; log.W = W; log.markImage = () => B_markImage(G); log.place = (a, b, h) => { const p = at(a, b); placeDan(W, p.x, p.z, PAV.h + h); };
  log.frame = () => { const p = W.person.position; return { a: +frameA(p.x, p.z).toFixed(2), b: +frameB(p.x, p.z).toFixed(2), y: +p.y.toFixed(2) }; };
  // the car parked up the street, where the mission's drive ends (m4-set.js SPOTS.carAt)
  const c = W.car, ca = at(0, -44); c.position.set(ca.x, 0, ca.z); c.heading = PAV.h; c.speed = 0; c.mesh.position.copy(c.position); c.mesh.rotation.y = c.heading;
  const toward = PAV.h; // (facing down the street, to the south: into the gallery)
  if (mode === 'clue') { const p = GSPOTS.clue; placeDan(W, p.x, p.z, Math.atan2(GSPOTS.statue.x - p.x, GSPOTS.statue.z - p.z)); }
  else if (mode === 'take' || mode === 'cert') {
    G.findClue(); const p = G.portraits[G.answer]; placeDan(W, p.x, p.z, toward);
    if (mode === 'cert') { G.takeArtwork(G.answer); G.setCertificateOwner(story.t('DAN')); }
  } else { const p = GSPOTS.approach; placeDan(W, p.x, p.z, toward); }
  app.cameraSystem?.resetForTeleport?.();
  W.ui.place?.('The Gilded Regent · South St', 'Seaport · New York', 3);
}
