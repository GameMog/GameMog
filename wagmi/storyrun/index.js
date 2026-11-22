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
//      &autochoose=<n> &autocontinue=1 &autocard=1 &flowfast=1 &missionsecs=<s> &skipscenes=<s>] [&keyart=1 [&keyshot=hood|rideoff]]
import * as THREE from 'three/webgpu';
import { createUI } from '../mission/ui.js';
import { createAudio } from '../mission/audio.js';
import { createGPS } from '../mission/gps.js';
import { createMarker } from '../mission/marker.js';
import { createFace } from '../face.js';
import { wear } from './wear.js';
import { outBesideCar } from '../intro.js';
import { createPlaces } from './places.js';
import { createCast } from './cast.js';
import { createHud } from './hud.js';
import { createRunner } from './runner.js';
import { tell, result as tellResult, log as hostLog } from './host.js';
import { showTitle, plainTitle, isOwn, ownTitle } from './title.js';
import { asksDressing, asksApocalypse, HOURS } from './pack.js';
import { passCard, medalOf, medalRows, medalRank, creditsRoll } from './rules.js';
import { CREDITS } from '../credits.js';
import { world as cityWorld } from '../world/index.js';
import { createDirector } from '../mission/cine.js'; import { importRetry } from '../net.js';
import { keyShotOf, hoodShot, rideOffShot } from './keyshots.js';

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
  else if (W.dan?.face) W.dan.face.speaker = heroName; // (Dan's face made before the world: it answers to the hero's lines)
  // (the hero dressed for the world: its cast entry's wear, wear.js; Dan's own body only)
  { const h = world.castOf(heroName); if (h?.wear && !h.glb) wear(W, h.wear); }
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
  // (`resume`: the mission he was in and its last checkpoint, for Continue: { id, cp } (runner.js snapshot))
  const save = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.done)) return { done: Object.fromEntries(s.done.map((id) => [id, true])), meters: s.meters || {}, flags: s.flags || {}, resume: s.resume && typeof s.resume.id === 'string' ? s.resume : null, medals: s.medals && typeof s.medals === 'object' && !Array.isArray(s.medals) ? s.medals : {} }; } catch {} return { done: {}, meters: {}, flags: {}, resume: null, medals: {} }; })();
  const writeSave = () => { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, done: Object.keys(save.done), meters: save.meters, flags: save.flags, resume: save.resume, medals: save.medals, at: Date.now() })); } catch {} };
  const flags = {
    autopilot: Q.has('autopilot'), autoAnswer: Q.has('autoanswer') || Q.has('autopilot'), autoChoose: Q.has('autochoose') ? Math.max(0, +Q.get('autochoose') || 0) : (Q.has('autopilot') ? 0 : null),
    autoCard: Q.has('autocard'), autoContinue: Q.has('autocontinue'), flowFast: Q.has('flowfast'), autoRetry: Q.has('autopilot'), failStop: Q.has('failstop'), stealthFair: Q.has('stealthfair'),
  };
  const host = { tell };
  // (every checkpoint reached is saved for Continue, but not a test drive's: it would start the next one mid-story)
  const onCheckpoint = (id, cp) => {
    // (a growing town swaps to the whole town at a checkpoint, wagmi/world/growing.js: told before the save is written,
    // which it then waits for)
    try { window.dispatchEvent(new CustomEvent('mc:checkpoint', { detail: { id } })); } catch {}
    if (flags.autopilot || Q.has('nosave')) return; save.resume = { id, cp }; writeSave();
  };
  const runner = createRunner({ W, world, places, cast, hud, host, save, flags, onCheckpoint });
  // a pet that goes with the hero (pets[] "follows": pet.js), only when the world has one
  let pets = null;
  if (Object.values(def.cast || {}).some((c) => c && c.pet && c.pet.follows)) {
    try { pets = (await importRetry(() => import('./pet.js'))).createPets(W, world); } catch (e) { console.warn('[storyrun] pets', e); }
  }
  // every frame, as Mog City's missions do (m1.js): the GPS route followed, the HUD told whether he is on foot
  let lastT = performance.now();
  (function frame() {
    requestAnimationFrame(frame);
    const t = performance.now(), dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    if (W.paused) return;
    try { W.gps.update(); } catch (e) { console.warn('[storyrun] gps', e); }
    if (pets) try { pets.update(dt); } catch (e) { console.warn('[storyrun] pets', e); pets = null; }
    if (W.storyrun?.fronts) try { W.storyrun.fronts.update(dt); } catch (e) { console.warn('[storyrun] fronts', e); W.storyrun.fronts = null; }
    if (W.storyrun?.ranch) W.storyrun.ranch.update(dt);
    document.body.classList.toggle('wg-onfoot', W.app.controllerManager.activeMode !== 'car');
  })();
  // the end credits' sections (rules.js creditsRoll), from what the world has when its story ends: its pack, its city's
  // map data (credits.js: a town's own data only, New York's and San Francisco's their own), whether its lines are
  // heard (its clips, or Mog City's own recordings of a Mog's lines), and the credits.js lines it carries (the models
  // its cars wear and its type, added when they are built; the moves its people play; its bodies' finishing detail)
  const endRoll = () => {
    const mapSec = CREDITS.find((c) => /^The (map|city)/.test(c.heading));
    const place = window.NYC?.PKG?.name ? String(window.NYC.PKG.name).split(',')[0] : (cityWorld.id !== 'pkg' && cityWorld.name) || '';
    const voiced = nClips > 0 || (def.voice?.lines || []).some((l) => l && l.rec && W.voice?.has?.(l.who, l.text));
    const bodies = Object.values(def.cast || {}).some((c) => c && !c.pet && c.glb);
    const assets = [];
    for (const sec of CREDITS) for (const l of sec.lines || []) {
      if (sec.heading === 'Vehicles' || sec.heading === 'Type' || l.roll === 'moves' || (l.roll === 'bodies' && bodies)) assets.push(l);
    }
    return creditsRoll(def, { map: mapSec?.lines || [], place, voiced, assets });
  };
  W.storyrun = { world, places, cast, hud, runner, save, pets, host: hostLog, reach: runner.reach, endRoll, get choosing() { return hud.choosing; } };
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
    try { const D = await importRetry(() => import('./dressing.js')); W.storyrun.dressing = D.createDressing(W, def.dressing); } catch (e) { console.warn('[storyrun] dressing', e); }
  }
  // (SF 2040: San Francisco after Erebus, wagmi/apocalypse, when a world for 'sf' asks for it in its dressing (or the
  // address has ?apocalypse); loaded only then. Before the time of day below, which it then keeps in its own look)
  if (asksApocalypse(def.dressing, def.city) || (def.city === 'sf' && Q.has('apocalypse'))) {
    // (its camps kept clear of the story's lairs: 26 m round every boss fight's arena)
    const clear = [];
    for (const m of def.missions || []) for (const st of m.steps || []) if (st.type === 'fight' && st.boss && st.arena) { try { const p = places.at(st.arena); if (p) clear.push([p.cx ?? p.x, p.cz ?? p.z, 26]); } catch {} }
    try { const A = await importRetry(() => import('../apocalypse/index.js')); await A.createApocalypse(W, { time: typeof def.dressing?.apocalypse === 'string' ? def.dressing.apocalypse : Q.get('apocalypse') || 'dusk', clear }); } catch (e) { console.warn('[storyrun] apocalypse', e); }
  }
  // a story's diner dressed as a diner (fronts.js: its street front, the neon with its own name), when the world has one
  if (Object.values(def.places || {}).some((a) => /\bdiner\b/i.test(String(a?.name || '')))) {
    try { const FR = await importRetry(() => import('./fronts.js')); W.storyrun.fronts = FR.createFronts(W, def, places); } catch (e) { console.warn('[storyrun] fronts', e); }
  }
  // a story's night is a lit city night, readable (nightlit.js: its fill, moon and exposure lifted at night only)
  try { const NL = await importRetry(() => import('./nightlit.js')); W.storyrun.nightLit = NL.createNightLit(W, def.dressing || {}); } catch (e) { console.warn('[storyrun] night', e); }
  // a ranch dressed at a place (ranch.js: world.ranches), only when the world asks: built while the gate is up, its place
  // and marks the ranch's once it stands (places.js setRanch)
  if (Array.isArray(def.ranches) && def.ranches.length) {
    try {
      const RM = await importRetry(() => import('./ranch.js'));
      const ranch = await RM.createRanches(W, def, places);
      W.storyrun.ranch = ranch;
      ranch.ready.then((list) => { if (list.length) places.setRanch(ranch.place); }).catch((e) => console.warn('[storyrun] ranch', e));
    } catch (e) { console.warn('[storyrun] ranch', e); }
  }
  // the start: on foot by the car while the gate is up, the city at the world's time of day (a night world's gate at night)
  outBesideCar(W);
  // (a world that says no time at all, in its dressing or its first mission, is in daylight)
  const firstTime = (() => { const first = order[0]?.def; return first?.time || order[0]?.act?.timeline?.[first?.id]?.time || def.dressing?.time || (def.dressing ? 'day' : null); })();
  { const T = HOURS, id = firstTime; try { if (id) W.app.selectTime(T[id] || id); } catch {} }
  const gate = Q.has('nogate') ? null : ui.gate({ when: () => W.app.ready, onStart: () => { W.audio?.unlock?.(); sfx.unlock(); }, fine: 'Community entertainment project. Have fun!',
    // (a Hometown town: its map data credited on the title, OSMF's startup screen for a game, cities/pkg/js/pkg-hud.js)
    credit: () => (window.NYC?.PKG ? (window.NYC.PKG_CREDIT ? `Map data ${window.NYC.PKG_CREDIT.short}` : null) : '') });
  if (!gate) ui.bootOff();
  for (let i = 0; i < 600 && !W.app.ready; i++) await sleep(100);
  if (gate) await gate;
  ui.gameTitle(false);
  if (Q.has('nogate')) sfx.unlock?.();
  // (jh-drive round 2) &freedrive: the world as built (its town, its car, its hero, its time of day) with no story: no
  // opening, no mission, free roam from behind the wheel, for driving and handling tests (SJ, Colter Land, SF 2040)
  if (Q.has('freedrive')) {
    console.info('[storyrun] freedrive: no story');
    // (behind the wheel once the world has settled: the test drives start from the seat)
    await sleep(1500);
    try { if (W.app.controllerManager.activeMode !== 'car') W.ride?.getIn?.(true); } catch (e) { console.warn('[storyrun] freedrive', e); }
    tell('freedrive', { id: def.id });
    return;
  }

  // (the ranch up before the first mission names it; never held more than 25 s)
  if (W.storyrun.ranch) await Promise.race([W.storyrun.ranch.ready.catch(() => null), sleep(25000)]);
  let autopilot = null;
  if (flags.autopilot) {
    const { startAutopilot } = await importRetry(() => import('./autopilot.js'));
    autopilot = startAutopilot(W, runner, {
      missionSecs: +(Q.get('missionsecs') || 240), skipScenes: +(Q.get('skipscenes') || 0), realPace: Q.has('realpace'), fair: Q.has('fair'),
      onTimeout: (m, d, i) => { tell('mission-fail', { id: m.id, why: `The test drive timed out at step ${i + 1} (${d?.type}${d?.id ? ' ' + d.id : ''}).`, step: d?.id || null, kind: d?.type || null, timeout: true }); runner.M?.fail?.({ reason: `The test drive timed out at step ${i + 1} (${d?.type}).` }); },
      // (the autopilot could finish a step only as no player could: through a wall, from inside a building; reach.js)
      onUnreachable: (info) => runner.unreachable(info),
      reach: runner.reach,
    });
    W.storyrun.autopilot = autopilot;
  }

  // the key art (?keyart=1, a test drive): one frame of the first drive, the HUD hidden, a wide and a square JPEG
  if (Q.has('keyart')) keyArt(W, runner).then((art) => { if (art) { W.storyrun.keyart = { wide: art.wide.slice(0), square: art.square.slice(0) }; tell('keyart', art, [art.wide, art.square]); } else tell('keyart', { wide: null, square: null, why: 'no frame' }); });

  // the first mission: ?mission=, else the first not passed
  let k = Math.max(0, order.findIndex((o) => o.def.id === Q.get('mission')));
  if (!Q.get('mission')) { const n = order.findIndex((o) => !save.done[o.def.id]); k = n < 0 ? 0 : n; }
  // Continue: the mission he was in when he left, at its last checkpoint (not with ?mission=, ?step= or a test drive)
  let resume = null;
  if (!Q.get('mission') && !Q.get('step') && !flags.autopilot && save.resume && !save.done[save.resume.id]) {
    const j = order.findIndex((o) => o.def.id === save.resume.id);
    if (j >= 0) { k = j; resume = save.resume.cp; }
  }
  const k0 = k;
  if (resume) await hud.card({ kicker: 'CONTINUE', text: order[k].def.title, sub: 'From your last checkpoint' }, 2.4);
  // the world's opening (def.opening: runner.js opening()), before Mission 1 as Mog City's opening is before its Mission
  // 1: on a story's first start (nothing passed, no ?mission=), or asked for (?opening=1); ?opening=0 leaves it out
  if (def.opening && Array.isArray(def.opening.shots) && def.opening.shots.length && Q.get('opening') !== '0'
    && (Q.get('opening') === '1' || (k === 0 && !resume && !Q.get('mission') && !Object.keys(save.done).length))) {
    try { await runner.opening(def.opening, { time: firstTime }); } catch (e) { console.warn('[storyrun] opening', e); }
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
    // (what the meters stood at going in: the MISSION PASSED card's gains are from here)
    const before = Object.fromEntries((def.hud?.meters || []).map((x) => [x.id, save.meters[x.id] ?? x.start ?? 0]));
    const r = await runner.play(m, { act, from: k === k0 && Q.get('step') ? Q.get('step') : null, resume: k === k0 ? resume : null });
    resume = null;
    if (replayAsk) { k = Math.max(0, order.findIndex((o) => o.def.id === replayAsk)); replayAsk = null; first = true; continue; }
    if (r.how === 'pass') {
      save.done[m.id] = true; if (save.resume?.id === m.id) save.resume = null; Object.assign(save.meters, r.state.meters); Object.assign(save.flags, r.state.flags); writeSave();
      sfx.play('passed');
      // (the card's stats: the mission's own list, Mission 1's TIME, SUITS DOWN, HITS TAKEN; else the time and the meters)
      const P0 = m.pass || {};
      // (a stat by name, or { label, stat, of } for one of the run's counts: Mission 2's QUIET TAKEDOWNS n/3)
      const STAT = { time: () => ['TIME', fmt(r.secs)], ko: () => [P0.koLabel || 'DOWN', P0.koOf ? `${r.stats?.ko || P0.koOf}/${P0.koOf}` : String(r.stats?.ko || 0)], hits: () => ['HITS TAKEN', String(r.stats?.hits || 0)] };
      const statOf = (x) => (typeof x === 'string' ? STAT[x]?.() : x && x.label ? [x.label, x.stat ? `${r.stats?.[x.stat] ?? 0}${x.of ? '/' + x.of : ''}` : String(x.value ?? '')] : null);
      const stats = Array.isArray(P0.stats) ? P0.stats.map(statOf).filter(Boolean)
        : [['Time', fmt(r.secs)], ...((def.hud?.meters || []).filter((x) => x.kind !== 'hidden').map((x) => [x.label || x.id, String(Math.round(r.state.meters[x.id] ?? 0))]))];
      // (its medal, from its time and damage against the pack's targets (mission.medals, rules.js medalOf); the best this
      // device has had kept with the save, local only: no server scoring)
      const best0 = save.medals[m.id] || null, medal = medalOf(m.medals, r);
      const mc = medalRows(m.medals, r, best0);
      if (medal && medalRank(medal) > medalRank(best0)) { save.medals[m.id] = medal; writeSave(); }
      tell('mission-end', { id: m.id, how: 'pass', secs: Math.round(r.secs), ...(m.medals ? { damage: r.damage ?? 0, medal: medal || 'none', whole: !!r.whole } : {}) });
      tellResult(world, m.id, r.secs);
      // the card: Mog City's own (its stats, as the shipped game's: a world that lists pass.stats, Mog City's own story),
      // else the story's MISSION PASSED (hud.passed): what was gained ('+$85,000'), the meter's way to its goal ('$430,000
      // / $1,000,000', the bar filling), the pass line, and NEXT: the next mission's title and stakes; with a sting
      if (Array.isArray(P0.stats)) await ui.passed({ title: m.title, stats, note: m.passLine || '', ...(P0.reward ? { reward: P0.reward } : {}) }, flags.autoCard ? 1.5 : 6);
      else {
        sfx.play('stinger', { gain: 0.42, notes: [261.63, 329.63, 392, 523.25] });
        const nx = order[k + 1]?.def || null;
        const card = passCard({ title: m.title, passLine: m.passLine || '', meters: def.hud?.meters || [], before, after: r.state.meters, next: nx ? { title: nx.title, stakes: nx.stakes } : null });
        W.storyrun.lastCard = card;
        if (mc) card.medal = mc;
        await hud.passed({ ...card, stats: [['TIME', fmt(r.secs)], ...(mc ? mc.rows : []), ...card.stands] }, flags.autoCard ? 2.2 : 7);
      }
      // (free roam from here to the next mission: the GPS routed to its start at once, its marker over the spot (guide.js,
      // runner.js nextSource), before its afterword and its between(); the RC playtest, P9)
      routeNext(order[k + 1]?.def || null);
      // (the act's end card, after its last mission)
      // (after the card: the mission's own afterword, Mog City's way: DMs, a line of his; Mission 2's Jane and Rook)
      await afterPass(m);
      const last = act && (act.order || []).filter((id) => byId.has(id)).slice(-1)[0] === m.id;
      // (the story's last act: its NEXT card (Pickup Time's FREE ROAM) is held back until after STORY COMPLETE and the
      // title lockup, so the end reads MISSION PASSED, the act's stats, STORY COMPLETE, the title, FREE ROAM)
      if (last && act.end) await actEnd(act.end, { holdNext: k === order.length - 1 });
      k++;
    } else if (r.how === 'fail') {
      tell('mission-end', { id: m.id, how: 'fail', why: r.why, ...(r.reach ? { reach: r.reach } : {}) });
      // (the test drive's stop, on the page too: it ended there with the hero stood on foot, no objective and nothing
      // said (Colter Land's WR-1 and RD-2 under ?autopilot=1, 16 Nov). Its MISSION FAILED and why, the drive let go;
      // Retry plays the mission again, Skip the next one, Quit is free roam. A framing GameMog has its mission-end)
      autopilot?.stop();
      const pick = await ui.failed(r.why || 'The test drive stopped here.', { skip: k + 1 < order.length, retryLabel: 'Retry: the mission again', skipLabel: 'Skip: the next mission', quitLabel: 'Quit: free roam' });
      if (pick === 'retry') continue;
      if (pick === 'skip') { k++; first = true; continue; }
      break;
    } else {
      tell('mission-end', { id: m.id, how: 'quit' });
      // (quit: free roam, the mission's start marked again)
      first = false;
    }
  }
  if (k >= order.length) {
    tell('story-end', { id: def.id });
    // (the story's end, unmistakable: STORY COMPLETE over the world's title and its closing line, held, then its title
    // lockup, then free roam)
    await hud.passed({ head: 'STORY COMPLETE', title: def.title, line: def.tagline || 'Thanks for playing.' }, flags.autoCard ? 2.2 : 6);
    // (the title lockup over a fade, and under it the city back in daylight: a story that ends at night (Pickup Time's
    // PT-15) does not leave free roam in the dark)
    await ui.fade(0.97, 0.6);
    try {
      try { W.app.selectTime('midday'); } catch {}
      await hud.card({ kicker: def.kicker || '', text: def.title, sub: def.tagline || 'Thanks for playing.' }, flags.autoCard ? 1 : 4);
      // (the end credits (endRoll, rules.js creditsRoll): the title, its cast, the voices, what it is made with, the
      // map's data, the engine, GameMog Community, rolled over the dark; any key, a click or a tap skips them)
      // (every story world has them, the standard roll (the owner, 21 Nov); Mog City's own story keeps its own end)
      if (!isOwn(world)) {
        try {
          const roll = endRoll();
          tell('credits', { id: def.id, sections: roll.length });
          await hud.roll(roll, { secs: flags.autoCard ? 3 : 0 });
        } catch (e) { console.warn('[storyrun] credits', e); }
      }
      const fin = order[order.length - 1]?.act?.end?.next;
      if (fin) await hud.card({ kicker: fin.kicker || 'NEXT', text: fin.text, sub: fin.sub || '' }, flags.autoCard ? 0.8 : (fin.secs || 3));
    } finally { await ui.fade(0, 0.6); }
    // (after the credits: the world's coda, a post-credits scene (def.coda: an opening's shape, its place and shots),
    // then free roam where it leaves him)
    if (def.coda && Array.isArray(def.coda.shots) && def.coda.shots.length) {
      try { await runner.opening(def.coda, { time: def.coda.time || null }); } catch (e) { console.warn('[storyrun] coda', e); }
      tell('coda', { id: def.id });
      try { W.app.selectTime('midday'); } catch {}
    }
    ui.objective(['Free roam. ', { 'Esc': 'yellow' }, ' for Mission select.'], 8);
  }
  autopilot?.stop();

  // (a mission's `between` says how its way in looks, Mog City's J and G: { letter, name, objective, step (the free-roam
  // step its car call belongs to, calls.js: 'free:J' rings m2-handoff), dm: false (its afterword already said it),
  // help, note (the GPS's one stall line: [who, text]), radius, carR (how near a stopped car counts) }; else the giver's letter and a DM of the stakes)
  // (the GPS on the next mission's start as soon as the last one has passed: the route on the radar, the turn cues,
  // the marker over the spot. None in a test drive's fast flow, nor for a mission its start is cut to (ride: false))
  function routeNext(m) {
    W.nextMission = null;
    const p = m && !flags.flowFast && m.between?.ride !== false ? places.at(m.start) : null;
    if (!p) return;
    W.nextMission = { id: m.id, x: p.x, z: p.z, name: m.between?.name || m.title };
    try { W.gps.objective(['Go to ', { [p.name || m.title]: 'yellow' }, ' for ', { [m.title]: 'yellow' }, '.'], { x: p.x, z: p.z, name: W.nextMission.name }, { blip: false }); } catch (e) { console.warn('[storyrun] next route', e); }
  }
  async function between(m) {
    const p = places.at(m.start); if (!p) { W.nextMission = null; return; }
    const B = m.between || {};
    // (`between.ride: false`: no ride there in free roam, the mission's start is cut to (its card covers it: a new day,
    // a long ride already taken); its radio lines still said, over the start)
    W.nextMission = B.ride === false ? null : { id: m.id, x: p.x, z: p.z, name: B.name || m.title };
    if (B.ride === false) {
      // (a short fade over the cut, back up once the mission has put him at its start)
      if (B.fade !== false) { try { await ui.fade(1, 0.5); } catch {} setTimeout(() => { try { ui.fade(0, 0.8); } catch {} }, 700); }
      if (Array.isArray(B.radio) && B.radio.length) {
        const btok = { dead: false, err: null, parent: null };
        (async () => { await sleep((B.radioAt ?? 2.5) * 1000); for (const l of B.radio) { const [who, text] = Array.isArray(l) ? l : [l.who, l.text]; await runner.say(who, text, btok, { phone: who !== heroName }); } })().catch(() => {});
      }
      return;
    }
    const giver = Object.keys(def.cast || {}).find((n) => (m.steps || []).some((s) => s.who === n && n !== heroName)) || heroName;
    const color = '#FFC93C', letter = String(B.letter || giver[0] || 'M').slice(0, 1).toUpperCase(), name = B.name || m.title;
    marker.group.traverse?.((o) => { if (o.material?.color) o.material.color.set(B.letter ? color : cast.color(giver)); });
    const cm = W.app.controllerManager, gy = cm.getGroundHeight(p.x, p.z, 'person');
    marker.at(p.x, gy, p.z);
    const words = (t) => { const out = []; const re = /\*\*(.+?)\*\*(?:\{(yellow|red|blue|green)\})?/g; let at = 0, x; while ((x = re.exec(t))) { if (x.index > at) out.push(t.slice(at, x.index)); out.push({ [x[1]]: x[2] || 'yellow' }); at = x.index + x[0].length; } if (at < t.length) out.push(t.slice(at)); return out; };
    ui.step(B.step || `pack:free:${m.id}`);
    // (none of its own: the mission's first step's, when that step is the walk or drive to where it starts ('Find Bunny at
    // the chess tables'), else where to go and for what ('Go to the chess tables, Washington Square for The Vig'). It was
    // 'Go to The Vig', the mission's title read as a place: the owner after PT-7's fail, "i think i'm in the VIG")
    const s0 = (m.steps || [])[0], at0 = s0 && (s0.type === 'walk' || s0.type === 'drive') && !s0.if && typeof s0.objective === 'string' && !/[{}]/.test(s0.objective) ? places.at([].concat(s0.to)[0]) : null;
    const own = at0 && Math.hypot(at0.x - p.x, at0.z - p.z) < 40 ? words(s0.objective) : null;
    W.gps.objective(B.objective ? words(B.objective) : own || ['Go to ', { [p.name || name]: 'yellow' }, ' for ', { [`${m.title}`]: 'yellow' }, '.'], { x: p.x, z: p.z, name }, { blip: false });
    W.gps.unblip('dest');
    W.gps.blip('next', { x: p.x, z: p.z, kind: 'letter', letter, pulse: 6, edge: true, name, label: true });
    if (B.note) W.gps.stallNote = B.note;
    // (the car call of this stretch of free roam wraps 200 m from the corona: calls.js reads W.between.at)
    const wasB = W.between; W.between = { at: { x: p.x, z: p.z }, stop() {} };
    if (B.dm !== false && giver !== heroName) { sfx.play('ding', { gain: 0.25 }); ui.dm(giver, `${m.stakes || m.title}`, 7); }
    if (B.help) setTimeout(() => ui.help(words(B.help), 9), 1800);
    // (the band on the way: `radio`, lines said over the radio a few seconds into the free roam, [who, text] each, its
    // `radioAt` s in (4); cut off when he gets there)
    const btok = { dead: false, err: null, parent: null };
    if (Array.isArray(B.radio) && B.radio.length) (async () => {
      await sleep((B.radioAt ?? 4) * 1000);
      for (const l of B.radio) { if (btok.dead) return; const [who, text] = Array.isArray(l) ? l : [l.who, l.text]; await runner.say(who, text, btok, { phone: who !== heroName }); }
    })().catch(() => {});
    // (the world's meters stay up between missions: the ransom raised so far)
    runner.showMeters(save.meters, []);
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
        if (inCar ? d < (B.carR ?? r + 4.5) && Math.hypot(car.speed, car.slipV || 0) < 3 : d < r + 0.6) return res();
        requestAnimationFrame(f);
      };
      f();
    });
    btok.dead = true; ui.sub(null); W.nextMission = null;
    W.between = wasB === W.between ? null : wasB;
    if (W.gps.stallNote === B.note) W.gps.stallNote = null;
    marker.hide(); W.gps.unblip('next'); W.gps.unblip('car'); W.gps.clear(); ui.objective(null); ui.help(null); hud.meters([]);
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
  // an act's cards (END OF ACT, its stats, the next act's title) are titles over the game, not a blackout: the city under
  // a light dim (ACT_DIM, module scope; the card's own vignette behind its words, hud.js .sr-card, which sits above the
  // dim), each card about 3-4 s, and the dim always taken off after, whatever happens meanwhile (was 0.9 over the cards:
  // the owner's "the screen goes black" at ACT II, the card's words dark grey under it)
  async function actEnd(e, { holdNext = false } = {}) {
    try {
      await ui.fade(ACT_DIM, 0.5);
      await hud.card({ kicker: e.title || 'END OF ACT', text: e.heading || (isOwn(world) ? def.title : ownTitle(def.title)), sub: (e.story || []).join(' ') || (e.quote ? `"${e.quote.text}"` : '') }, flags.autoCard ? 1 : Math.min(4, Math.max(3, e.minSecs || 0)));
      // (its numbers and its last word, when it has them: the big card, its head the act's title (the story's end: the
      // story's own title), its stats in rows, the quote and who said it under them)
      if ((e.stats || []).length) {
        await ui.fade(0, 0.4);
        await hud.passed({ head: e.title || 'END OF ACT', title: e.heading || '', stats: e.stats.map((x) => [x.label, x.value]), line: e.quote ? `"${e.quote.text}"${e.quote.by ? ' · ' + e.quote.by : ''}` : '' }, flags.autoCard ? 1.6 : Math.max(5, e.minSecs || 0));
        await ui.fade(ACT_DIM, 0.4);
      }
      // (the act's cliffhanger, r8: a hard cut to black on the hook into the next act, action.js)
      if (e.cliff && W.action) { await ui.fade(0, 0.2); await W.action.cliff(e.cliff, flags.autoCard ? 1.2 : 3.6); }
      if (e.next && !holdNext) await hud.card({ kicker: e.next.kicker || 'NEXT', text: e.next.text, sub: e.next.sub || '' }, flags.autoCard ? 0.8 : Math.min(4, e.next.secs || 3.4));
    } finally { await ui.fade(0, 0.5); }
  }
}
// (an act card's dim: at most half, so the city reads under the card: actEnd)
const ACT_DIM = 0.3;
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// one frame straight after the city renders it (a WebGPU canvas is read in that task), cropped to 1280x720 and 512x512
function grab(W) {
  return new Promise((resolve) => {
    const rp = W.app.renderPipeline, canvas = W.app.renderer?.domElement;
    if (!rp || !canvas) return resolve(null);
    const render = rp.render, own = Object.prototype.hasOwnProperty.call(rp, 'render');
    let t = 0, shot = false, over = false;
    // (once: the frames drawn while the first one is encoded are not taken, and a later grab's hook is never undone by
    // this one's: the key art's square is a grab of its own, right after the wide)
    const done = (v) => { if (over) return; over = true; if (own) rp.render = render; else delete rp.render; clearTimeout(t); resolve(v); };
    rp.render = function (...a) {
      const r = render.apply(this, a);
      if (shot) return r;
      shot = true;
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
// The key art (GameMog, 5 Nov: story thumbnails "need to pop like the rest"; 16 Nov, the owner: the hero standing next to
// the ride, as Pickup Time's cast stands by its car). A few seconds into the first drive the car is stopped where it
// is, the test drive let go of, and the hero stood beside it on foot (the engine's own body and look, idle, as he is
// out of the car in play), by its front wheel on whichever side is clear (STAND: the road's side first), turned to the
// lens, the traffic and the pavement's people held off the spot; the director frames both from a low three-quarter
// front on his side (STAND), the HUD hidden, the warm key light between them. The square is its own shot, the same lens
// opened out so both are in the middle square. With no clear side, or anything not as it should be, the moving car's
// hero shot as before (KEY_SHOT: 8 m ahead, 2.6 m to the side, a long 30 degree lens, kept on the car as it drives; its
// side clear of the street's things, cs.segClear), and with neither, the chase camera's own view. Key art never fails:
// a frame is always taken. GameMog letters the title over the head of it (lib/story-art.ts). The game after it is not
// played on (the frame is thrown away), but nothing here throws.
const KEY_SHOT = { fwd: 8, side: 2.6, up: 0.8, fov: 30, lookUp: 0.85, lookFwd: 0.4, lamp: 9 };
// (the stand: him `out` m off the car's flank, `fwd` of its length ahead of its middle; the lens `dist` m from the point
// between them at `ang` off the car's nose toward his side, `up` m high, looking at `lookUp`; the square's lens `sqFov`,
// on the point between him and the car's nose, so both sit in the middle square)
const STAND = { out: 0.8, fwd: 0.5, ang: 0.62, dist: 7.6, up: 1.0, lookUp: 1.5, fov: 32, sqFov: 50, lamp: 10 };
async function keyArt(W, runner) {
  const TRAVEL = new Set(['drive', 'stops', 'pursuit', 'tail', 'tow']);
  for (let i = 0; i < 1800; i++) {
    const M = runner.M, d = M?.def.steps[M.i];
    if (d && TRAVEL.has(d.type) && !W.cutscene && W.app.controllerManager.activeMode === 'car') break;
    await sleep(100);
  }
  await sleep(3500);
  const st = document.createElement('style'); st.textContent = '#wg, #wg-tick, #wg-prompt, #sr-guide, .hud, #touch-controls, .hud-bottom-left, .hud-top-right { visibility: hidden !important; }';
  document.head.appendChild(st);
  let D = null, S = null;
  const frames = (n = 2) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  try {
    // (a staged composition the address asks for, &keyshot=hood | rideoff (keyshots.js), else the stand; either, if it
    // finds nothing to do, the next)
    const want = keyShotOf(Q), staged = want === 'hood' ? hoodShot : want === 'rideoff' ? rideOffShot : null;
    if (staged) S = await staged(W, runner).catch((e) => { console.warn('[storyrun] key ' + want, e); return null; });
    if (!S) S = await standShot(W, runner).catch((e) => { console.warn('[storyrun] key stand', e); return null; });
    if (S) {
      D = S.D;
      await frames(); await sleep(450);
      const wide = await grab(W);
      if (wide) {
        S.square(); await frames(); await sleep(250);
        const sq = await grab(W);
        return { wide: wide.wide, square: sq ? sq.square : wide.square };
      }
    }
    D = heroShot(W, runner);
    await frames();
    if (D) await sleep(450);
    return await grab(W);
  } catch (e) {
    console.warn('[storyrun] key art', e);
    try { return await grab(W); } catch { return null; }
  } finally {
    st.remove();
    try { S?.done(); } catch {}
    if (D) { runner.lamp?.(null); D.release(0).catch?.(() => {}); }
  }
}
/**
 * The hero stood by his stopped car and the director on the two of them: { D, square(), done() }, or null with nothing
 * changed but the car stopped (no car, a horse, not in it, a scene on, no side clear for him and the lens).
 */
async function standShot(W, runner) {
  const app = W.app, cs = app.cameraSystem, cm = app.controllerManager, car = W.car, P = W.person;
  if (!car || !P?.mesh || cm.activeMode !== 'car' || W.cutscene || W.directed || car.kind === 'horse' || car.wet) return null;
  const B = car.body || { hx: 1.0, z0: -2.3, z1: 2.4 }, S = STAND;
  // (the car's own frame: x across it, +x its left, the driver's side; z along it, +z its nose)
  const toW = (lx, lz) => { const c = Math.cos(car.heading), s = Math.sin(car.heading); return { x: car.position.x + lx * c + lz * s, z: car.position.z - lx * s + lz * c }; };
  const V = (p, y) => new THREE.Vector3(p.x, y, p.z);
  const ground = (p) => cm.getGroundHeight(p.x, p.z, 'person');
  // (somewhere a person stands: no building over it (the way game.js's ride finds a wall), no post or bin, about the car's
  // own ground: not a ledge, not a hole)
  const standable = (p) => {
    const g = ground(p); if (!Number.isFinite(g) || Math.abs(g - car.position.y) > 0.6) return false;
    const v = new THREE.Vector3(p.x, g, p.z); cm.resolveHorizontalCollision(v, 0.4, g + 1.0); if (Math.hypot(v.x - p.x, v.z - p.z) > 0.02) return false;
    for (const b of W.crash?.props?.around?.(p.x, p.z, 2) || []) if (!b.taken && Math.hypot(b.x - p.x, b.z - p.z) < (b.w ? Math.max(b.w, b.d) / 2 : b.r || 0.3) + 0.45) return false;
    return true;
  };
  const shot = (side) => {
    const hero = toW(side * (B.hx + S.out), B.z1 * S.fwd);
    const mid = toW(side * B.hx * 0.55, B.z1 * 0.3);
    const a = car.heading + side * S.ang, cam = { x: mid.x + Math.sin(a) * S.dist, z: mid.z + Math.cos(a) * S.dist };
    return { hero, mid, cam };
  };
  // stopped where it is: the test drive let go of the wheel, the car still, its wheels straight
  W.storyrun?.autopilot?.stop?.();
  for (const k of ['forward', 'backward', 'left', 'right', 'boost']) try { cm.setTouchInput(k, 0); } catch {}
  const still = () => Object.assign(car, { speed: 0, vx: 0, vz: 0, angularVel: 0, steerAngle: 0, steerK: 0, halt: 0 });
  for (let t0 = performance.now(); performance.now() - t0 < 900;) { still(); await new Promise((r) => requestAnimationFrame(r)); }
  if (cm.activeMode !== 'car' || W.cutscene || W.directed) return null;
  // (his side: the road's (the driver's) first; his spot and a little round it stood on, the lens's spot open, and the
  // lens's lines to him and to the car's face clear of the street's things)
  let side = 0, pick = null;
  for (const s of [1, -1]) {
    const c = shot(s), y = car.position.y;
    if (!standable(c.hero) || !standable(toW(s * (B.hx + S.out + 0.5), B.z1 * S.fwd))) continue;
    if (!cs.segClear) { side = s; pick = c; break; }
    const eye = V(c.cam, y + S.up);
    if (cs.segClear(V(c.hero, y + 1.2), eye, car) > 0.97 && cs.segClear(V(toW(0, B.z1 * 0.8), y + 0.8), eye, car) > 0.97 && cs.segClear(V(c.mid, y + 1.0), eye, car) > 0.97) { side = s; pick = c; break; }
  }
  if (!side) return null;
  // (the traffic and the pavement's people kept off the car, him and the lens: hold zones, as a cutscene's)
  const xs = [pick.hero.x, pick.cam.x, car.position.x], zs = [pick.hero.z, pick.cam.z, car.position.z], m = 5;
  const rect = { minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minZ: Math.min(...zs) - m, maxZ: Math.max(...zs) + m };
  try { app.trafficSystem?.hold?.([rect]); } catch {}
  try { W.street?.crowd?.hold?.([rect]); } catch {}
  // him out of the car, on his feet beside it (the engine's own on-foot body, as getting out puts him), turned to the lens
  const face = () => Math.atan2(pick.cam.x - P.position.x, pick.cam.z - P.position.z) - side * 0.18;
  still();
  P.position.set(pick.hero.x, ground(pick.hero), pick.hero.z);
  P.speed = 0; P.verticalVel = 0; P.inVehicle = false; P.mesh.visible = true;
  app.selectMode('person');
  P.heading = face(); P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading;
  const D = createDirector(W);
  let fov = S.fov, look = pick.mid;
  const nose = toW(side * B.hx * 0.6, B.z1), nt = Math.min(1, Math.max(0, +(W.storyrun?.nightLit?.night?.() || 0)));
  const frame = () => {
    still();
    if (cm.activeMode === 'person') { P.speed = 0; P.heading = face(); if (P.mesh) P.mesh.rotation.y = P.heading; }
    const y = car.position.y, a = car.heading + side * S.ang;
    D.camera = { pos: [pick.cam.x, y + S.up, pick.cam.z], look: [look.x, y + S.lookUp, look.z], fov, roll: 0, shake: null, band: false };
    // (the warm key between the lens and the two of them, out in front of him and the car's nose: his face and the
    // car's lit; stronger and a little lower on a night street (nightlit.js), so all of him reads, not his face alone)
    const k = { x: (pick.hero.x + nose.x) / 2 + Math.sin(a) * 2.8, z: (pick.hero.z + nose.z) / 2 + Math.cos(a) * 2.8 };
    runner.lamp?.([k.x, y + 2.2 - 0.5 * nt, k.z], S.lamp * (1 + 2.2 * nt), 9.5 + 3 * nt);
  };
  // (a beat on his feet first: the idle running, the driver's seat let go of, the people held off)
  for (let t0 = performance.now(); performance.now() - t0 < 1200;) { frame(); await new Promise((r) => requestAnimationFrame(r)); }
  if (cm.activeMode !== 'person' || !P.mesh.visible || W.cutscene) { try { app.trafficSystem?.hold?.([]); W.street?.crowd?.hold?.([]); } catch {} return null; }
  frame(); D.onFrame = frame; D.take();
  W.storyrun && (W.storyrun.keyShot = { side, stand: true });
  return {
    D,
    square() { fov = S.sqFov; look = { x: (pick.hero.x + nose.x) / 2, z: (pick.hero.z + nose.z) / 2 }; frame(); },
    done() { try { app.trafficSystem?.hold?.([]); } catch {} try { W.street?.crowd?.hold?.([]); } catch {} },
  };
}
/** The director on the hero shot, or null (no car, or no clear side): the chase camera's view is shot instead. */
function heroShot(W, runner) {
  try {
    const app = W.app, cs = app.cameraSystem, cm = app.controllerManager, ent = cm.getActiveEntity();
    if (!ent || cm.activeMode !== 'car' || W.cutscene) return null;
    const S = KEY_SHOT;
    const at = (side) => {
      const h = ent.heading, p = ent.position, g = p.y;
      return {
        pos: [p.x + Math.sin(h) * S.fwd - Math.cos(h) * S.side * side, g + S.up, p.z + Math.cos(h) * S.fwd + Math.sin(h) * S.side * side],
        look: [p.x + Math.sin(h) * S.lookFwd, g + S.lookUp, p.z + Math.cos(h) * S.lookFwd],
      };
    };
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    // (the road's side first, the driver's: the kerb side has the pavement's people between the lens and the car)
    let side = 0;
    for (const s of [-1, 1]) {
      const c = at(s);
      if (!cs.segClear || cs.segClear(V(c.look), V(c.pos), ent) > 0.97) { side = s; break; }
    }
    if (!side) return null;
    const D = createDirector(W);
    // (and the car's face lit: the cutscenes' warm key light, 3 m out in front of the car on the lens's side, 1.7 m up;
    // a night street leaves a car's paint black against its own headlights)
    const frame = () => {
      const c = at(side), h = ent.heading, p = ent.position;
      D.camera = { pos: c.pos, look: c.look, fov: S.fov, roll: 0, shake: null, band: false };
      runner.lamp?.([p.x + Math.sin(h) * 3 - Math.cos(h) * 1.2 * side, p.y + 1.7, p.z + Math.cos(h) * 3 + Math.sin(h) * 1.2 * side], S.lamp, 7.5);
    };
    frame(); D.onFrame = frame; D.take();
    W.storyrun && (W.storyrun.keyShot = { side });
    return D;
  } catch (e) { console.warn('[storyrun] key shot', e); return null; }
}
