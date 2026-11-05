// Mog City story runner: a Story Kit world played on Mog City's engine and presentation. Installed by wagmi/game.js in
// place of the opening and Mog City's own missions (intro.js, m2.js, m3.js) only when the address has ?pack=; without
// it nothing here is imported. The world itself is wagmi/game.js's PACK (pack.js load()).
// What it sets up, in Mog City's own way:
//   - mission/ui.js (the HUD, the pause menu and its game clock) and mission/audio.js, story mode on, the sandbox's
//     toolbar put away; the hero's face (face.js) on Dan's body, as the opening does;
//   - the start gate (ui.gate) with the world's own title in the lockup's lettering (no MOG CITY), over the live city;
//   - the places (places.js), the cast (cast.js: registry people native, forged ones from the world's files), the
//     voices (the world's clips into W.voice), the HUD additions (hud.js), a pet that follows the hero (pet.js);
//   - the world's opening (def.opening, runner.js opening()) on a first start, before Mission 1, as Mog City's own;
//   - the story: acts in order, each mission on the runner (runner.js); between missions free roam to the next one's
//     start, marked the Mog City way (a letter corona in the giver's colour, the yellow route, a DM); MISSION PASSED,
//     the save (localStorage, per world), the pause menu's Mission select (W.storyList / W.replay); the end card.
//   - a framing GameMog told what happens (host.js), and the test drive (?autopilot: autopilot.js).
// URL: ?pack=<world> [&host=<gamemog origin>&game=<id>] [&mission=<ID> [&step=<step id>]] [&opening=0|1] [&nogate] [&autopilot=1 &autoanswer=1
//      &autochoose=<n> &autocontinue=1 &autocard=1 &flowfast=1 &missionsecs=<s> &skipscenes=<s>] [&keyart=1]
import * as THREE from 'three/webgpu';
import { createUI } from '../mission/ui.js';
import { createAudio } from '../mission/audio.js';
import { createGPS } from '../mission/gps.js';
import { createMarker } from '../mission/marker.js';
import { createFace } from '../face.js';
import { outBesideCar } from '../intro.js';
import { createPlaces } from './places.js';
import { createCast } from './cast.js';
import { createHud } from './hud.js';
import { createRunner } from './runner.js';
import { tell, result as tellResult, log as hostLog } from './host.js';
import { showTitle, plainTitle, isOwn, ownTitle } from './title.js';
import { asksDressing } from './pack.js';

const Q = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function install(W) {
  const world = W.pack;
  const ui = (W.ui = createUI()), sfx = (W.sfx = createAudio());
  ui.story(true); document.body.classList.add('wg-onfoot');
  W.app.mapSystem.waypoint = null; W.app.mapSystem.onTeleport = null;
  // (the sandbox's mode keys 1-4 are the developers': F gets in and out; a choice's number keys are its own)
  addEventListener('keydown', (e) => { if (/^Digit[1-4]$/.test(e.code) && !Q.has('sandbox') && !document.body.classList.contains('wg-offering') && !W.storyrun?.choosing) e.stopImmediatePropagation(); }, true);
  if (!world || !world.ok) {
    tell('ready', { gameId: Q.get('game') || null, hash: null, story: { v: 2, ok: false, id: null, hash: null, why: world?.why || 'no world' } });
    plainTitle(); ui.bootOff(); outBesideCar(W);
    console.warn('[storyrun] no story: free roam');
    return;
  }
  const def = world.def;
  // the title: the world's own, alone (never MOG CITY's lockup: Mog City is the engine), on the tab, the instant title
  // and the start gate (title.js)
  showTitle(def, document.querySelector('#wg .wg-gtitle'), isOwn(world));
  const heroName = world.heroName || 'Dan';
  if (W.dan && !W.dan.face) W.dan.face = createFace(W, { speaker: heroName, inner: W.dan.body, bones: W.dan.bones, hair: true, open: 0.42 });
  W.gps = W.gps || createGPS(W);
  const places = createPlaces(W, def), cast = createCast(W, world), hud = createHud(ui);
  // the caller card: a forged caller's own headshot in its tile (the world's art 'head-<id>'), else Mog City's initial
  // (Jane keeps her live feed: calls.js)
  const heads = {};
  for (const name of Object.keys(def.cast || {})) {
    const id = def.voice?.cast?.[name]?.id || String(name).split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
    const u = def.art && typeof def.art['head-' + id] === 'string' ? world.asset(def.art['head-' + id]) : null;
    if (u && /^[\w:/.-]+$/.test(u)) heads[name] = u;
  }
  const caller0 = ui.caller;
  ui.caller = function (name, color, status) {
    const r = caller0.apply(this, arguments);
    const u = name && Object.prototype.hasOwnProperty.call(heads, name) ? heads[name] : null;
    if (u) { const av = document.querySelector('#wg .wg-caller .av'); if (av) { av.textContent = ''; av.style.background = `${color || '#6CB8FF'} url("${u}") center / cover no-repeat`; } }
    return r;
  };
  const nClips = cast.registerVoices();
  // the save, per world (never Mog City's own)
  const KEY = `mc.pack.${def.id}.v1`;
  const save = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.done)) return { done: Object.fromEntries(s.done.map((id) => [id, true])), meters: s.meters || {}, flags: s.flags || {} }; } catch {} return { done: {}, meters: {}, flags: {} }; })();
  const writeSave = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, done: Object.keys(save.done), meters: save.meters, flags: save.flags, at: Date.now() })); } catch {} };
  const flags = {
    autopilot: Q.has('autopilot'), autoAnswer: Q.has('autoanswer') || Q.has('autopilot'), autoChoose: Q.has('autochoose') ? Math.max(0, +Q.get('autochoose') || 0) : (Q.has('autopilot') ? 0 : null),
    autoCard: Q.has('autocard'), autoContinue: Q.has('autocontinue'), flowFast: Q.has('flowfast'), autoRetry: Q.has('autopilot'), failStop: Q.has('failstop'),
  };
  const host = { tell };
  const runner = createRunner({ W, world, places, cast, hud, host, save, flags });
  // a pet that goes with the hero (pets[] "follows": pet.js), only when the world has one
  let pets = null;
  if (Object.values(def.cast || {}).some((c) => c && c.pet && c.pet.follows)) {
    try { pets = (await import('./pet.js')).createPets(W, world); } catch (e) { console.warn('[storyrun] pets', e); }
  }
  // every frame, as Mog City's missions do (m1.js): the GPS route followed, the HUD told whether he is on foot
  let lastT = performance.now();
  (function frame() {
    requestAnimationFrame(frame);
    const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (W.paused) return;
    try { W.gps.update(); } catch (e) { console.warn('[storyrun] gps', e); }
    if (pets) try { pets.update(dt); } catch (e) { console.warn('[storyrun] pets', e); pets = null; }
    document.body.classList.toggle('wg-onfoot', W.app.controllerManager.activeMode !== 'car');
  })();
  W.storyrun = { world, places, cast, hud, runner, save, pets, host: hostLog, get choosing() { return hud.choosing; } };
  // the missions in story order (the acts' order lists, then any left out)
  const acts = def.acts || [];
  const byId = new Map(def.missions.map((m) => [m.id, m]));
  const order = [];
  for (const a of acts) for (const id of a.order || []) if (byId.has(id) && !order.some((o) => o.def.id === id)) order.push({ def: byId.get(id), act: a });
  for (const m of def.missions) if (!order.some((o) => o.def.id === m.id)) order.push({ def: m, act: acts[0] || null });
  // Mission select: the story's missions, a passed one replayable
  W.storyList = () => order.filter((o) => !o.def.hidden).map((o) => ({ id: o.def.id, title: o.def.title, act: o.act?.name || '', passed: !!save.done[o.def.id] }));
  let replayAsk = null;
  W.replay = async (id) => { replayAsk = id; runner.M?.tok && (runner.M.tok.dead = true, runner.M.tok.err = null); };
  tell('ready', { gameId: Q.get('game') || null, hash: world.hash, story: { v: 2, ok: true, id: def.id, hash: world.hash, clips: nClips } });
  console.log('[storyrun]', def.id, `${order.length} missions`, `${nClips} clips`, places.missing.length ? `places missing: ${places.missing.join(',')}` : '');

  // what the city wears (dressing.js: a blackout, Christmas, snow or rain), only when the world asks for one; before
  // the time of day below, so the world's times keep its look
  if (asksDressing(def.dressing)) {
    try { const D = await import('./dressing.js'); W.storyrun.dressing = D.createDressing(W, def.dressing); } catch (e) { console.warn('[storyrun] dressing', e); }
  }
  // the start: on foot by the car while the gate is up, the city at the world's time of day (a night world's gate at night)
  outBesideCar(W);
  { const T = { dusk: 'twilight', night: 'midnight', day: 'midday', morning: 'golden', dawn: 'twilight' }, first = order[0]?.def, id = first?.time || order[0]?.act?.timeline?.[first?.id]?.time || def.dressing?.time; try { if (id) W.app.selectTime(T[id] || id); } catch {} }
  const gate = Q.has('nogate') ? null : ui.gate({ when: () => W.app.ready, onStart: () => { W.audio?.unlock?.(); sfx.unlock(); }, fine: 'Community entertainment project. Have fun!' });
  if (!gate) ui.bootOff();
  for (let i = 0; i < 600 && !W.app.ready; i++) await sleep(100);
  if (gate) await gate;
  ui.gameTitle(false);
  if (Q.has('nogate')) sfx.unlock?.();

  let autopilot = null;
  if (flags.autopilot) {
    const { startAutopilot } = await import('./autopilot.js');
    autopilot = startAutopilot(W, runner, {
      missionSecs: +(Q.get('missionsecs') || 240), skipScenes: +(Q.get('skipscenes') || 0),
      onTimeout: (m, d, i) => { tell('mission-fail', { id: m.id, why: `The test drive timed out at step ${i + 1} (${d?.type}${d?.id ? ' ' + d.id : ''}).`, step: d?.id || null, kind: d?.type || null, timeout: true }); runner.M?.fail?.({ reason: `The test drive timed out at step ${i + 1} (${d?.type}).` }); },
    });
    W.storyrun.autopilot = autopilot;
  }

  // the key art (?keyart=1, a test drive): one frame of the first drive, the HUD hidden, a wide and a square JPEG
  if (Q.has('keyart')) keyArt(W, runner).then((art) => { if (art) { W.storyrun.keyart = { wide: art.wide.slice(0), square: art.square.slice(0) }; tell('keyart', art, [art.wide, art.square]); } else tell('keyart', { wide: null, square: null, why: 'no frame' }); });

  // the first mission: ?mission=, else the first not passed
  let k = Math.max(0, order.findIndex((o) => o.def.id === Q.get('mission')));
  if (!Q.get('mission')) { const n = order.findIndex((o) => !save.done[o.def.id]); k = n < 0 ? 0 : n; }
  const k0 = k;
  // the world's opening (def.opening: runner.js opening()), before Mission 1 as Mog City's opening is before its Mission
  // 1: on a story's first start (nothing passed, no ?mission=), or asked for (?opening=1); ?opening=0 leaves it out
  if (def.opening && Array.isArray(def.opening.shots) && def.opening.shots.length && Q.get('opening') !== '0'
    && (Q.get('opening') === '1' || (k === 0 && !Q.get('mission') && !Object.keys(save.done).length))) {
    try { await runner.opening(def.opening); } catch (e) { console.warn('[storyrun] opening', e); }
  }
  const marker = createMarker(THREE, W.app.scene, { color: '#FFC93C', radius: 2.4, height: 2.2, alpha: 0.25 });
  let first = true;
  while (k < order.length) {
    const { def: m, act } = order[k];
    // between missions: free roam, the next one's start marked with its giver's letter (not before the first, nor in a
    // test drive's fast flow)
    if (!first && !flags.flowFast) await between(m);
    first = false;
    if (replayAsk) { k = Math.max(0, order.findIndex((o) => o.def.id === replayAsk)); replayAsk = null; continue; }
    const r = await runner.play(m, { act, from: k === k0 && Q.get('step') ? Q.get('step') : null });
    if (replayAsk) { k = Math.max(0, order.findIndex((o) => o.def.id === replayAsk)); replayAsk = null; first = true; continue; }
    if (r.how === 'pass') {
      save.done[m.id] = true; Object.assign(save.meters, r.state.meters); Object.assign(save.flags, r.state.flags); writeSave();
      sfx.play('passed');
      // (the card's stats: the mission's own list, Mission 1's TIME, SUITS DOWN, HITS TAKEN; else the time and the meters)
      const P0 = m.pass || {};
      // (a stat by name, or { label, stat, of } for one of the run's counts: Mission 2's QUIET TAKEDOWNS n/3)
      const STAT = { time: () => ['TIME', fmt(r.secs)], ko: () => [P0.koLabel || 'DOWN', P0.koOf ? `${r.stats?.ko || P0.koOf}/${P0.koOf}` : String(r.stats?.ko || 0)], hits: () => ['HITS TAKEN', String(r.stats?.hits || 0)] };
      const statOf = (x) => (typeof x === 'string' ? STAT[x]?.() : x && x.label ? [x.label, x.stat ? `${r.stats?.[x.stat] ?? 0}${x.of ? '/' + x.of : ''}` : String(x.value ?? '')] : null);
      const stats = Array.isArray(P0.stats) ? P0.stats.map(statOf).filter(Boolean)
        : [['Time', fmt(r.secs)], ...((def.hud?.meters || []).filter((x) => x.kind !== 'hidden').map((x) => [x.label || x.id, String(Math.round(r.state.meters[x.id] ?? 0))]))];
      tell('mission-end', { id: m.id, how: 'pass', secs: Math.round(r.secs) });
      tellResult(world, m.id, r.secs);
      await ui.passed({ title: m.title, stats, note: m.passLine || '', ...(P0.reward ? { reward: P0.reward } : {}) }, flags.autoCard ? 1.5 : 6);
      // (the act's end card, after its last mission)
      // (after the card: the mission's own afterword, Mog City's way: DMs, a line of his; Mission 2's Jane and Rook)
      await afterPass(m);
      const last = act && (act.order || []).filter((id) => byId.has(id)).slice(-1)[0] === m.id;
      if (last && act.end) await actEnd(act.end);
      k++;
    } else if (r.how === 'fail') {
      tell('mission-end', { id: m.id, how: 'fail', why: r.why }); break;
    } else {
      tell('mission-end', { id: m.id, how: 'quit' });
      // (quit: free roam, the mission's start marked again)
      first = false;
    }
  }
  if (k >= order.length) {
    tell('story-end', { id: def.id });
    await hud.card({ kicker: def.kicker || '', text: def.title, sub: def.tagline || 'Thanks for playing.' }, flags.autoCard ? 1 : 4);
    ui.objective(['Free roam. ', { 'Esc': 'yellow' }, ' for Mission select.'], 8);
  }
  autopilot?.stop();

  // (a mission's `between` says how its way in looks, Mog City's J and G: { letter, name, objective, step (the free-roam
  // step its car call belongs to, calls.js: 'free:J' rings m2-handoff), dm: false (its afterword already said it),
  // help, note (the GPS's one stall line: [who, text]), radius, carR (how near a stopped car counts) }; else the giver's letter and a DM of the stakes)
  async function between(m) {
    const p = places.at(m.start); if (!p) return;
    const B = m.between || {};
    const giver = Object.keys(def.cast || {}).find((n) => (m.steps || []).some((s) => s.who === n && n !== heroName)) || heroName;
    const color = '#FFC93C', letter = String(B.letter || giver[0] || 'M').slice(0, 1).toUpperCase(), name = B.name || m.title;
    marker.group.traverse?.((o) => { if (o.material?.color) o.material.color.set(B.letter ? color : cast.color(giver)); });
    const cm = W.app.controllerManager, gy = cm.getGroundHeight(p.x, p.z, 'person');
    marker.at(p.x, gy, p.z);
    const words = (t) => { const out = []; const re = /\*\*(.+?)\*\*(?:\{(yellow|red|blue|green)\})?/g; let at = 0, x; while ((x = re.exec(t))) { if (x.index > at) out.push(t.slice(at, x.index)); out.push({ [x[1]]: x[2] || 'yellow' }); at = x.index + x[0].length; } if (at < t.length) out.push(t.slice(at)); return out; };
    ui.step(B.step || `pack:free:${m.id}`);
    W.gps.objective(B.objective ? words(B.objective) : ['Go to ', { [`${m.title}`]: 'yellow' }, '.'], { x: p.x, z: p.z, name }, { blip: false });
    W.gps.unblip('dest');
    W.gps.blip('next', { x: p.x, z: p.z, kind: 'letter', letter, pulse: 6, edge: true, name, label: true });
    if (B.note) W.gps.stallNote = B.note;
    // (the car call of this stretch of free roam wraps 200 m from the corona: calls.js reads W.between.at)
    const wasB = W.between; W.between = { at: { x: p.x, z: p.z }, stop() {} };
    if (B.dm !== false && giver !== heroName) { sfx.play('ding', { gain: 0.25 }); ui.dm(giver, `${m.stakes || m.title}`, 7); }
    if (B.help) setTimeout(() => ui.help(words(B.help), 9), 1800);
    const r = B.radius || 2.2, t0 = performance.now();
    let jumped = false;
    await new Promise((res) => {
      const f = () => {
        if (replayAsk) return res();
        const e = cm.getActiveEntity(), inCar = cm.activeMode === 'car', car = W.car;
        if (!W.paused && !W.cutscene) W.gps.update();
        // (a test drive drives into it: put down by the corona once its call has had a moment)
        if (flags.autopilot && flags.autoContinue && !jumped && performance.now() - t0 > 4000) { jumped = true; W.storyrun.runner.putPlayer({ x: p.x, z: p.z + 3, heading: Math.PI }, 'car'); }
        const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
        if (inCar ? d < (B.carR ?? r + 4.5) && Math.abs(car.speed) < 3 : d < r + 0.6) return res();
        requestAnimationFrame(f);
      };
      f();
    });
    W.between = wasB === W.between ? null : wasB;
    if (W.gps.stallNote === B.note) W.gps.stallNote = null;
    marker.hide(); W.gps.unblip('next'); W.gps.unblip('car'); W.gps.clear(); ui.objective(null); ui.help(null);
  }
  // after a mission's card: its afterword, in order: { dm: { from, text, secs }, say: [who, text], wait: secs }
  async function afterPass(m) {
    const tok = { dead: false, err: null, parent: null };
    for (const a of m.after || []) {
      try {
        if (a.dm) { sfx.play('buzz', { gain: 0.18, times: 1 }); sfx.play('ding', { gain: 0.16 }); W.audio?.play?.('phoneBuzz'); ui.dm(a.dm.from || 'Unknown number', a.dm.text, a.dm.secs || 9); await sleep((flags.flowFast ? 1.2 : (a.wait ?? Math.min(7, a.dm.secs || 9))) * 1000); }
        else if (a.say) await runner.say(a.say[0], a.say[1], tok);
        else if (a.wait) await sleep((flags.flowFast ? 0.3 : a.wait) * 1000);
      } catch (e) { console.warn('[storyrun] after', e); }
    }
  }
  async function actEnd(e) {
    await ui.fade(0.9, 0.5);
    await hud.card({ kicker: e.title || 'END OF ACT', text: e.heading || (isOwn(world) ? def.title : ownTitle(def.title)), sub: (e.story || []).join(' ') || (e.quote ? `"${e.quote.text}"` : '') }, flags.autoCard ? 1 : Math.max(3, e.minSecs || 0));
    if (e.next) await hud.card({ kicker: e.next.kicker || 'NEXT', text: e.next.text, sub: e.next.sub || '' }, flags.autoCard ? 0.8 : (e.next.secs || 3));
    await ui.fade(0, 0.5);
  }
}
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// one frame straight after the city renders it (a WebGPU canvas is read in that task), cropped to 1280x720 and 512x512
function grab(W) {
  return new Promise((resolve) => {
    const rp = W.app.renderPipeline, canvas = W.app.renderer?.domElement;
    if (!rp || !canvas) return resolve(null);
    const render = rp.render, own = Object.prototype.hasOwnProperty.call(rp, 'render');
    let t = 0;
    const done = (v) => { if (own) rp.render = render; else delete rp.render; clearTimeout(t); resolve(v); };
    rp.render = function (...a) {
      const r = render.apply(this, a);
      try {
        const out = (w, h) => {
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const k = Math.max(w / canvas.width, h / canvas.height), sw = w / k, sh = h / k;
          c.getContext('2d').drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, w, h);
          return new Promise((res) => c.toBlob((b) => (b ? b.arrayBuffer().then(res) : res(null)), 'image/jpeg', 0.84));
        };
        Promise.all([out(1280, 720), out(512, 512)]).then(([wide, square]) => done(wide && square ? { wide, square } : null));
      } catch { done(null); }
      return r;
    };
    t = setTimeout(() => done(null), 4000);
  });
}
async function keyArt(W, runner) {
  const TRAVEL = new Set(['drive', 'stops', 'pursuit', 'tail', 'tow']);
  for (let i = 0; i < 1800; i++) {
    const M = runner.M, d = M?.def.steps[M.i];
    if (d && TRAVEL.has(d.type) && !W.cutscene && W.app.controllerManager.activeMode === 'car') break;
    await sleep(100);
  }
  await sleep(3500);
  const st = document.createElement('style'); st.textContent = '#wg, .hud, #touch-controls, .hud-bottom-left, .hud-top-right { visibility: hidden !important; }';
  document.head.appendChild(st);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try { return await grab(W); } finally { st.remove(); }
}
