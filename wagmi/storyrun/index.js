// Mog City story runner: a Story Kit world played on Mog City's engine and presentation. Installed by wagmi/game.js in
// place of the opening and Mog City's own missions (intro.js, m2.js, m3.js) only when the address has ?pack=; without
// it nothing here is imported. The world itself is wagmi/game.js's PACK (pack.js load()).
// What it sets up, in Mog City's own way:
//   - mission/ui.js (the HUD, the pause menu and its game clock) and mission/audio.js, story mode on, the sandbox's
//     toolbar put away; the hero's face (face.js) on Dan's body, as the opening does;
//   - the start gate (ui.gate) with the world's title under MOG CITY's lettering, over the live city;
//   - the places (places.js), the cast (cast.js: registry people native, forged ones from the world's files), the
//     voices (the world's clips into W.voice), the HUD additions (hud.js);
//   - the story: acts in order, each mission on the runner (runner.js); between missions free roam to the next one's
//     start, marked the Mog City way (a letter corona in the giver's colour, the yellow route, a DM); MISSION PASSED,
//     the save (localStorage, per world), the pause menu's Mission select (W.storyList / W.replay); the end card.
//   - a framing GameMog told what happens (host.js), and the test drive (?autopilot: autopilot.js).
// URL: ?pack=<world> [&host=<gamemog origin>&game=<id>] [&mission=<ID>] [&nogate] [&autopilot=1 &autoanswer=1
//      &autochoose=<n> &autocontinue=1 &autocard=1 &flowfast=1 &missionsecs=<s>] [&keyart=1]
import * as THREE from 'three/webgpu';
import { createUI } from '../mission/ui.js';
import { createAudio } from '../mission/audio.js';
import { createGPS } from '../mission/gps.js';
import { createMarker } from '../mission/marker.js';
import { createFace } from '../face.js';
import { outBesideCar } from '../intro.js';
import { S as story } from '../story/index.js';
import { createPlaces } from './places.js';
import { createCast } from './cast.js';
import { createHud } from './hud.js';
import { createRunner } from './runner.js';
import { tell, result as tellResult, log as hostLog } from './host.js';

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
    ui.bootOff(); outBesideCar(W);
    console.warn('[storyrun] no story: free roam');
    return;
  }
  const def = world.def;
  // the title: the world's under MOG CITY's lettering (the tab, the instant title's tag line)
  try { document.title = story.title().replace(story.episode, def.title); } catch {}
  try { const tag = document.querySelector('#wg-boot .wg-boot-tag'); if (tag) tag.textContent = def.title; const g = document.querySelector('#wg .wg-gtitle .tag'); if (g) g.textContent = def.title; } catch {}
  const heroName = world.heroName || 'Dan';
  if (W.dan && !W.dan.face) W.dan.face = createFace(W, { speaker: heroName, inner: W.dan.body, bones: W.dan.bones, hair: true, open: 0.42 });
  W.gps = W.gps || createGPS(W);
  const places = createPlaces(W, def), cast = createCast(W, world), hud = createHud(ui);
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
  // every frame, as Mog City's missions do (m1.js): the GPS route followed, the HUD told whether he is on foot
  (function frame() {
    requestAnimationFrame(frame);
    if (W.paused) return;
    try { W.gps.update(); } catch (e) { console.warn('[storyrun] gps', e); }
    document.body.classList.toggle('wg-onfoot', W.app.controllerManager.activeMode !== 'car');
  })();
  W.storyrun = { world, places, cast, hud, runner, save, host: hostLog, get choosing() { return hud.choosing; } };
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

  // the start: on foot by the car while the gate is up
  outBesideCar(W);
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
      missionSecs: +(Q.get('missionsecs') || 240),
      onTimeout: (m, d, i) => { tell('mission-fail', { id: m.id, why: `The test drive timed out at step ${i + 1} (${d?.type}${d?.id ? ' ' + d.id : ''}).`, step: d?.id || null, kind: d?.type || null, timeout: true }); runner.M?.fail?.({ reason: `The test drive timed out at step ${i + 1} (${d?.type}).` }); },
    });
    W.storyrun.autopilot = autopilot;
  }

  // the first mission: ?mission=, else the first not passed
  let k = Math.max(0, order.findIndex((o) => o.def.id === Q.get('mission')));
  if (!Q.get('mission')) { const n = order.findIndex((o) => !save.done[o.def.id]); k = n < 0 ? 0 : n; }
  const marker = createMarker(THREE, W.app.scene, { color: '#FFC93C', radius: 2.4, height: 2.2, alpha: 0.25 });
  let first = true;
  while (k < order.length) {
    const { def: m, act } = order[k];
    // between missions: free roam, the next one's start marked with its giver's letter (not before the first, nor in a
    // test drive's fast flow)
    if (!first && !flags.flowFast) await between(m);
    first = false;
    if (replayAsk) { k = Math.max(0, order.findIndex((o) => o.def.id === replayAsk)); replayAsk = null; continue; }
    const r = await runner.play(m, { act });
    if (replayAsk) { k = Math.max(0, order.findIndex((o) => o.def.id === replayAsk)); replayAsk = null; first = true; continue; }
    if (r.how === 'pass') {
      save.done[m.id] = true; Object.assign(save.meters, r.state.meters); Object.assign(save.flags, r.state.flags); writeSave();
      sfx.play('passed');
      const stats = [['Time', fmt(r.secs)], ...((def.hud?.meters || []).filter((x) => x.kind !== 'hidden').map((x) => [x.label || x.id, String(Math.round(r.state.meters[x.id] ?? 0))]))];
      tell('mission-end', { id: m.id, how: 'pass', secs: Math.round(r.secs) });
      tellResult(world, m.id, r.secs);
      await ui.passed({ title: m.title, stats, note: m.passLine || '' }, flags.autoCard ? 1.5 : 6);
      // (the act's end card, after its last mission)
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

  async function between(m) {
    const p = places.at(m.start); if (!p) return;
    const giver = Object.keys(def.cast || {}).find((n) => (m.steps || []).some((s) => s.who === n && n !== heroName)) || heroName;
    const color = cast.color(giver), letter = (giver[0] || 'M').toUpperCase();
    marker.group.traverse?.((o) => { if (o.material?.color) o.material.color.set(color); });
    marker.at(p.x, 0, p.z);
    W.gps.objective(['Go to ', { [`${m.title}`]: 'yellow' }, '.'], { x: p.x, z: p.z, name: m.title }, { blip: false });
    W.gps.blip('next', { x: p.x, z: p.z, kind: 'letter', letter, edge: true, name: m.title, label: true });
    ui.step(`pack:free:${m.id}`);
    if (giver !== heroName) { sfx.play('ding', { gain: 0.25 }); ui.dm(giver, `${m.stakes || m.title}`, 7); }
    const cm = W.app.controllerManager;
    await new Promise((res) => {
      const f = () => {
        if (replayAsk) return res();
        const e = cm.getActiveEntity();
        W.gps.update();
        if (Math.hypot(e.position.x - p.x, e.position.z - p.z) < 6) return res();
        requestAnimationFrame(f);
      };
      f();
    });
    marker.hide(); W.gps.unblip('next'); W.gps.clear(); ui.objective(null);
  }
  async function actEnd(e) {
    await ui.fade(0.9, 0.5);
    await hud.card({ kicker: e.title || 'END OF ACT', text: e.heading || def.title, sub: (e.story || []).join(' ') || (e.quote ? `"${e.quote.text}"` : '') }, flags.autoCard ? 1 : Math.max(3, e.minSecs || 0));
    if (e.next) await hud.card({ kicker: e.next.kicker || 'NEXT', text: e.next.text, sub: e.next.sub || '' }, flags.autoCard ? 0.8 : (e.next.secs || 3));
    await ui.fade(0, 0.5);
  }
}
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
