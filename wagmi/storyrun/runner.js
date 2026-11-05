// Mog City story runner: plays one mission of a world, step by step, on Mog City's own parts. The semantics are the
// Story Kit's (GameMog storykit/BUILDER.md, public/storykit/framework/missions/README.md): steps in order, `during`
// side steps alongside (a call while driving: from `at` s in, ended with their step unless persist or until), `if`
// skips a step, `goto` / `end` jump, `checkpoint: true` is where Retry goes back to, a set's meters and flags, the one
// mission timer (hard: fails; soft: LATE and on). The presentation is Mog City's, every piece of it: mission/ui.js's
// objective line, tracker, subtitles, place card, caller card, DMs, counter, hold ring, MISSION PASSED / FAILED (Retry,
// Quit, Skip after three fails) and title cards; gps.js routes and blips, marker.js coronas, turns.js's next-turn
// banner (the GPS draws it in the car); cine.js's director for cutscenes (bars, hold Space to skip); calls.js's car
// phone; combat's fights; pursuit's chases; m2-drive.js for a car to tail; the pause menu's checkpoints. hud.js adds a
// choice, a timer and meters in the same look.
//   createRunner(ctx) -> { play(def, { act }) -> Promise<'pass' | 'quit'>, stop(), state, M }
// ctx: { W, world, places, cast, hud, host, save, flags: { autoAnswer, autoChoose, autoCard } }
// Every kind of the pack schema is handled; the few with no Mog City part yet (convoy, patrol, roadblock, wallet, and a
// stealth without a ref) say so in the console and pass, so a story still plays through (KINDS_STUB). `scene` plays
// one of Mog City's own authored set pieces by name (SCENES: the opening, Mission 1's swap and tracker, Missions 2 and
// 3's scenes), never a copy. A step with a `ref` (PART_REFS: 'm2.tail', 'm3.escape'...) is one of Mog City's own mission
// phases, played by its own code (m2.js / m3.js playPart): its rules, objective, calls, cast and fail reasons; the
// world keeps the order, the checkpoints, the fail screen and the card. `passenger`: a cast member walks to the car and
// rides in a seat of it (the roadster's passenger seat, a sheet car's front or back), seen through the glass, and gets
// out again; `comfort`: a passenger's comfort meter (braking, cornering and knocks drain it, smooth driving refills it).
import * as THREE from 'three/webgpu';
import { createGPS } from '../mission/gps.js';
import { createMarker } from '../mission/marker.js';
import { createDirector, keys, handheld, clamp } from '../mission/cine.js';
import { missions as registry } from '../mission/pause.js';
import { place as putAt, outBesideCar } from '../intro.js';
import { test, value, flagName } from './cond.js';

const PI = Math.PI;
export const KINDS_STUB = new Set(['convoy', 'patrol', 'roadblock', 'wallet', 'stealth']);
// Mog City's own mission phases a step can play by ref ('m2.tail'): m2.js and m3.js playPart
const PART_IDS = { m2: ['start', 'go', 'tail', 'yard', 'fight', 'chase', 'crash', 'phone', 'chat'], m3: ['garage', 'square', 'rally', 'rigs', 'dump', 'escape', 'ret', 'home'] };
const PART_MOD = { m2: () => import('../mission/m2.js'), m3: () => import('../mission/m3.js') };
export const partOf = (ref) => { const [m, n, x] = String(ref || '').split('.'); return !x && Object.prototype.hasOwnProperty.call(PART_IDS, m) && PART_IDS[m].includes(n) ? [m, n] : null; };
export const PART_REFS = Object.entries(PART_IDS).flatMap(([m, l]) => l.map((n) => `${m}.${n}`));
// the authored set pieces a `scene` step can name: Mog City's own code, as the shipped game plays them
export const SCENES = {
  opening: (W) => import('../intro.js').then((m) => m.playOpening(W)),
  'm1.arrival': (W) => import('../mission/m1.js').then((m) => m.playScene(W, 'arrival')),
  'm1.tracker': (W) => import('../mission/m1.js').then((m) => m.playScene(W, 'tracker')),
  // (set dressing, at once: the park as Mission 1 dresses it, the van at its mark, the street there held clear)
  'm1.park': (W) => import('../mission/m1.js').then((m) => m.playScene(W, 'park')),
  // (the Suits' van alone at its mark, as Mission 1's drive puts it there 320 m out: a drive's dressNear)
  'm1.van': (W) => import('../mission/m1.js').then((m) => m.playScene(W, 'van')),
  // Missions 2 and 3's authored scenes, their phases of the same name (the runner plays them as parts: runPart)
  ...Object.fromEntries(['m2.start', 'm2.crash', 'm2.chat', 'm3.garage', 'm3.rally', 'm3.dump', 'm3.home'].map((id) => [id, (W, o) => PART_MOD[id.slice(0, 2)]().then((m) => m.playPart(W, id.slice(3), o))])),
};
const TRAVEL = new Set(['drive', 'stops', 'walk', 'pursuit', 'tail', 'search', 'tow']);
const BACKGROUND = new Set(['trigger', 'comfort', 'patrol', 'stealth', 'roadblock']);
const ENDS_WITH_HOST = new Set([...BACKGROUND, 'pursuit', 'beat', 'tail', 'convoy', 'call']);
const TIPS = {
  ko: ['Hit with [J]. When the cue over a man turns ', { yellow: 'yellow' }, ', counter with [Q]; when it is ', { red: 'red' }, ', roll away with [C].'],
  left: ['Stay with the fight until it is over: it is lost past 150 m.'],
  time: ['Take the quickest route: the ', { 'yellow line': 'yellow' }, ' on the radar. Hold [Shift] to boost.'],
  caught: ['Break their line of sight, then keep moving until the search circle runs out.'],
  lost: ['Stay close enough to keep them in sight, and back off if they slow down.'],
};
class Fail extends Error { constructor(reason, kind = null, o = {}) { super(reason); this.reason = reason; this.kind = kind; this.tip = o.tip || null; this.sounded = !!o.sounded; } }
class Stop extends Error {}

export function createRunner(ctx) {
  const { W, world, places, cast, hud, host } = ctx;
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, ui = W.ui, sfx = W.sfx;
  const gps = W.gps || (W.gps = createGPS(W));
  const marker = W.marker || (W.marker = createMarker(THREE, app.scene, { color: '#FFC93C', radius: 3 }));
  const def0 = world.def;
  const now = () => (W.clock ? W.clock.now() : performance.now());
  const inCar = () => cm.activeMode === 'car';
  const me = () => (inCar() ? car.position : P.position);
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const heroName = world.heroName || def0.hero || 'Dan';
  let M = null;

  /* ------------------------------------------------------------------ tokens -- */
  const tokOf = (parent = null) => ({ dead: false, err: null, parent });
  const deadOf = (t) => { for (let x = t; x; x = x.parent) if (x.dead) return x; return null; };
  const wait = (cond, t) => new Promise((res, rej) => {
    const f = () => {
      const d = deadOf(t); if (d) return rej(d.err || new Stop());
      if (W.paused) return requestAnimationFrame(f);
      let ok = false; try { ok = cond(); } catch (e) { return rej(e); }
      if (ok) res(); else requestAnimationFrame(f);
    };
    f();
  });
  const delay = (secs, t) => { const end = now() + secs * 1000; return wait(() => now() >= end, t); };
  const kill = (t, err = null) => { if (t && !t.dead) { t.dead = true; t.err = err; } };

  /* -------------------------------------------------------------- the words -- */
  const tokens = (s) => String(s ?? '')
    .replace(/\{ride\.name\}|\{ride\}/g, car.label || 'your car').replace(/\{ride\.board\}/g, 'Get in').replace(/\{ride\.go\}/g, 'Drive').replace(/\{ride\.park\}/g, 'Stop')
    .replace(/\{name\}/g, heroName);
  // '**bold**' -> Mog City's one coloured noun (yellow: a place); '**bold**{red}' names its colour (yellow, red, blue, green)
  const parts = (s, color = 'yellow') => {
    const out = []; const re = /\*\*(.+?)\*\*(?:\{(yellow|red|blue|green)\})?/g; let at = 0, m; s = tokens(s);
    while ((m = re.exec(s))) { if (m.index > at) out.push(s.slice(at, m.index)); out.push({ [m[1]]: m[2] || color }); at = m.index + m[0].length; }
    if (at < s.length) out.push(s.slice(at));
    return out.length ? out : [s];
  };
  const colorOf = (who) => (who ? cast.color(who) : '#FFFFFF');
  const VOICED = (who, text) => !!W.voice?.speaks?.(who, text) || !!W.voice?.has?.(who, text);
  function mumble(who, text, secs) {
    if (!sfx || VOICED(who, text)) return;
    const f0 = cast.f0(who), ph = text.match(/[^.?!]+[.?!']*/g) || [text];
    let at = 0;
    for (const p of ph) { const n = p.trim().length; if (!n) continue; setTimeout(() => sfx.play('mumble', { f0: f0 * (0.96 + Math.random() * 0.08), dur: Math.min(0.5, Math.max(0.2, 0.1 + n * 0.02)), gain: 0.26, q: /\?/.test(p) }), at * 1000 + 30); at += p.length / text.length * secs; }
  }
  // a line: its subtitle (its recording or clip plays from it: radio/voices.js), held for its reading time or its voice
  async function say(who, text, t, { secs = null, phone = false } = {}) {
    text = tokens(text);
    const rec = W.voice?.dur?.(who, text) || 0;
    const hold = Math.max(1.4, text.length / 15, rec + 0.15, secs || 0);
    if (phone) W.voice?.fx?.(who, 'phone');
    ui.sub(who || null, text, colorOf(who));
    mumble(who, text, hold);
    M?.log.push(['say', who, text]);
    try { await delay(hold, t); } finally { ui.sub(null); if (phone) W.voice?.fx?.(who); }
    await delay(0.25, t);
  }
  const tuple = (l) => (Array.isArray(l) ? { who: l[0], text: l[1], secs: l[2] } : l);
  // the runner pack writes call speakers upper-cased: back to the cast's own name
  const castName = (w) => { if (!w) return w; if (world.castOf(w)) return w; const k = Object.keys(def0.cast || {}).find((n) => n.toUpperCase() === String(w).toUpperCase()); return k || w; };

  /* ---------------------------------------------------------- state and sets -- */
  const meterDefs = () => (def0.hud?.meters || []);
  function showMeters() {
    const hidden = new Set(M?.def.hiddenMeters || []);
    hud.meters(meterDefs().filter((m) => m.kind !== 'hidden' && !hidden.has(m.id)).map((m) => {
      const v = Math.round(M.state.meters[m.id] ?? m.start ?? 0);
      return { label: m.label || m.id, text: m.kind === 'money' ? `${m.prefix ?? '$'}${v}` : m.kind === 'pips' ? '●'.repeat(Math.max(0, Math.min(m.pips || 5, v))) + '○'.repeat(Math.max(0, (m.pips || 5) - v)) : `${m.prefix ?? ''}${v}` };
    }));
  }
  const cond = (c) => test(c, M.state, ctx.save.done);
  function applySet(set) {
    if (!set) return;
    if (Array.isArray(set)) { for (const e of set) applySet(e); return; }
    if (set.if && !cond(set.if)) return;
    for (const [k, raw] of Object.entries(set.meters || {})) {
      const cur = M.state.meters[k] || 0, md = meterDefs().find((m) => m.id === k);
      let next = raw && typeof raw === 'object' ? (raw.to != null ? raw.to : cur + (raw.add || 0)) : cur + raw;
      if (md) { if (md.min != null) next = Math.max(md.min, next); if (md.max != null) next = Math.min(md.max, next); }
      M.state.meters[k] = next;
    }
    for (const [k0, v] of Object.entries(set.flags || {})) { const k = flagName(k0); M.state.flags[k] = v && typeof v === 'object' && 'add' in v ? (+M.state.flags[k] || 0) + v.add : v; }
    if (set.label) M.state.label = set.label;
    showMeters();
  }

  /* --------------------------------------------------------------- the world -- */
  const placeOf = (ref, why) => { const p = places.at(ref); if (!p) throw new Fail(`The story names a place this city doesn't have (${typeof ref === 'string' ? ref : ref?.['@']}).`, 'place'); return p; };
  // the player at a place: at the wheel (the car on its lane) or on foot beside the car
  function putPlayer(p, mode = 'car') {
    if (mode === 'walk' || mode === 'person') {
      putAt(W, { car: [p.x, p.z, p.heading ?? 0] });
      outBesideCar(W);
    } else {
      putAt(W, { car: [p.x, p.z, p.heading ?? 0], dan: [p.x, p.z, p.heading ?? 0] });
      P.inVehicle = true; P.mesh.visible = false; P.speed = 0; app.selectMode('car');
    }
    app.cameraSystem.resetForTeleport?.();
  }
  const setTime = (id) => { const T = { dusk: 'twilight', night: 'midnight', day: 'midday', morning: 'golden', dawn: 'twilight' }; try { if (id) app.selectTime(T[id] || id); } catch {} };

  /* ---------------------------------------------------------- the timer -- */
  function createTimer() {
    const T = { running: false, left: 0, opts: {}, late: false, over: 0, fired: false };
    let last = now();
    T.start = (secs, o = {}) => Object.assign(T, { running: true, left: secs, opts: o, late: false, over: 0, fired: false });
    T.stop = () => { T.running = false; hud.timer(null); };
    T.add = (s) => { if (T.running && !T.late) T.left += s; };
    T.tick = () => {
      const t = now(), dt = (t - last) / 1000; last = t;
      if (!T.running || W.paused || W.cutscene) return null;
      if (T.late) { T.over += dt; hud.timer(T.over, T.opts.label, true); return null; }
      T.left -= dt; hud.timer(T.left, T.opts.label || 'TIME');
      if (T.left <= 0 && !T.fired) { T.fired = true; if (T.opts.fail === 'soft') T.late = true; else T.running = false; return T.opts; }
      return null;
    };
    return T;
  }

  /* --------------------------------------------------------------- the steps -- */
  const STEPS = {};
  // place: the player there (in the car, or on foot), the time of day
  STEPS.place = async (d) => { const p = placeOf(d.at); putPlayer(p, (typeof d.at === 'object' && d.at.mode) || (M.def.vehicle ? 'car' : 'walk')); setTime(d.time); M.timer.add(d.bonus || 0); };
  STEPS.say = async (d, t) => { const who = castName(d.who); if (d.wait === false) { say(who, d.text, M.tok, { secs: d.secs }).catch(() => {}); return; } await say(who, d.text, t, { secs: d.secs }); };
  STEPS.wait = async (d, t) => { const end = now() + (d.secs || 0) * 1000; await wait(() => now() >= end || (d.call && !W.calls?.live && now() > end - (d.secs || 0) * 1000 + 300), t); };
  STEPS.dm = async (d, t) => { sfx.play('ding', { gain: 0.3 }); ui.dm(d.from || d.name || 'Unknown number', tokens(d.text), d.secs || 8); M.log.push(['dm', d.from, d.text]); await delay(d.wait ? (d.secs || 8) : 1.2, t); };
  STEPS.set = async (d) => applySet(d.set);
  STEPS.label = async (d) => { M.state.label = d.label; };
  STEPS.goto = async (d) => ({ goto: d.to });
  STEPS.end = async (d) => { if (d.fail) throw new Fail(tokens(d.fail)); return { end: true }; };
  STEPS.timer = async (d) => {
    if (d.stop) { M.timer.stop(); return; }
    M.timer.start(value(d.seconds, M.state, ctx.save.done) || 60, { label: d.label, fail: d.fail || 'hard', why: d.why, flag: d.flag, set: d.set, lateLabel: d.lateLabel });
  };

  // drive: the corona, the GPS ('get there' the Mog City way: gps.drive), there inside the radius and slowed down
  async function goTo(p, d, t, { name = p.name, objective = null, onFoot = 250, needsCar = false } = {}) {
    const radius = d.radius || 8, stopV = d.stopSpeed ?? 4;
    marker.at(p.x, 0, p.z); M.dest = p;
    const dest = { x: p.x, z: p.z, name };
    const nav = gps.drive({ dest, objective: objective ? parts(objective) : ['Go to ', { [name]: 'yellow' }, '.'], onFoot, needsCar });
    M.nav = nav;
    try {
      await wait(() => {
        nav.step();
        if (inCar()) return dist(car.position, p.x, p.z) < radius && (d.stop === false || Math.abs(car.speed) < stopV);
        return dist(P.position, p.x, p.z) < Math.max(3, radius * 0.75);
      }, t);
    } finally { nav.stop(); M.nav = null; M.dest = null; marker.hide(); gps.clear(); }
    if (inCar() && d.stop !== false) { car.speed = 0; car.vx = car.vz = 0; car.angularVel = 0; }
    // (the arrival's ding and place card, unless a scene straight after is the arrival: card false)
    if (d.card !== false) { sfx.play('ding', { gain: 0.22 }); ui.place(name, '', 3); }
  }
  STEPS.drive = async (d, t) => {
    const list = [].concat(d.to).map((r) => placeOf(r));
    const p = list.length > 1 ? list.reduce((a, b) => (dist(me(), b.x, b.z) < dist(me(), a.x, a.z) ? b : a)) : list[0];
    // (a thing on the radar running ahead along a path over `secs`, then stopped where it ends: Mission 1's laptop tracker)
    const bl = d.blip && Array.isArray(d.blip.path) && d.blip.path.length > 1 ? d.blip : null;
    let blipOn = !!bl;
    if (bl) {
      const path = bl.path, segs = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1])), L = segs.reduce((a, b) => a + b, 0) || 1, t0 = now();
      const at = (k) => { let s0 = k * L; for (let i = 0; i < segs.length; i++) { if (s0 <= segs[i]) { const u = s0 / (segs[i] || 1); return [path[i][0] + (path[i + 1][0] - path[i][0]) * u, path[i][1] + (path[i + 1][1] - path[i][1]) * u]; } s0 -= segs[i]; } return path[path.length - 1]; };
      (function f() { if (!blipOn) return; const [x, z] = at(Math.min(1, (now() - t0) / 1000 / (bl.secs || 20))); gps.blip('tag', { x, z, kind: bl.kind || 'object', edge: true, name: bl.name || '' }); requestAnimationFrame(f); })();
    }
    // (the areas he drives through, each one's place card once, Mission 1's Garment District, Hell's Kitchen and
    // Chelsea: a box on the map, { name, sub, minX, maxX, minZ, maxZ }; and a set piece dressed once he is `within` m of
    // the mark, Mission 1's van at the park 320 m out: dressNear { dress, within })
    const areas = Array.isArray(d.areas) ? d.areas.filter((a) => a && a.name) : [], seen = new Set();
    let near = d.dressNear && Object.prototype.hasOwnProperty.call(SCENES, d.dressNear.dress) ? d.dressNear : null;
    if (areas.length || near) wait(() => {
      const q = me();
      for (const a of areas) if (!seen.has(a) && q.x >= (a.minX ?? -Infinity) && q.x <= (a.maxX ?? Infinity) && q.z >= (a.minZ ?? -Infinity) && q.z <= (a.maxZ ?? Infinity)) { seen.add(a); ui.place(a.name, a.sub ?? '', 3); }
      if (near && dist(q, p.x, p.z) < (near.within || 300)) { const n = near; near = null; SCENES[n.dress](W).catch((e) => console.warn('[storyrun] dress', n.dress, e)); }
      return false;
    }, t).catch(() => {});
    try { await goTo(p, d, t, { objective: d.objective || `Drive to **${p.name}**.` }); } finally { blipOn = false; if (bl) gps.unblip('tag'); }
    M.timer.add(d.bonus || 0);
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };
  STEPS.stops = async (d, t) => {
    const n = d.stops.length;
    for (let k = 0; k < n; k++) {
      const s = d.stops[k], p = placeOf(s), label = (typeof s === 'object' && s.name) || p.name;
      ui.counter('STOPS', `${k}/${n}`);
      await goTo({ ...p, name: label }, d, t, { name: label, objective: d.objective ? d.objective.replace(/\{n\}/g, k + 1).replace(/\{of\}/g, n).replace(/\{name\}/g, label) : `Stop at **${label}**.` });
      if (typeof s === 'object') { applySet(s.set); M.timer.add(s.bonus || 0); }
    }
    ui.counter('STOPS', `${n}/${n}`); await delay(1, t); ui.counter(null);
  };
  STEPS.walk = async (d, t) => {
    const p = d.enterCar && !d.to ? null : placeOf(d.to);
    if (d.leaveCar && inCar()) {
      gps.objective(['Get out of your ', { car: 'blue' }, '.'], null);
      ui.help('Press [F] to get out.', 8);
      await wait(() => !inCar() && !W.ride?.phase, t);
    }
    if (d.enterCar) {
      gps.objective(d.objective ? parts(d.objective, 'blue') : ['Get in your ', { [car.label || 'car']: 'blue' }, '.'], { follow: () => car.position, name: car.label });
      gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name: car.label });
      ui.help('Press [F] to get in a vehicle.', 8);
      try { await wait(inCar, t); } finally { gps.unblip('car'); ui.help(null); }
      return;
    }
    const r = d.radius || 3;
    gps.objective(parts(d.objective || `Walk to **${p.name}**.`), { x: p.x, z: p.z, name: p.name });
    const ring = createMarker(THREE, app.scene, { color: '#FFC93C', radius: Math.max(1.2, r * 0.6), height: d.beam ? 6 : 1.1, alpha: 0.22 }); ring.at(p.x, 0, p.z);
    try { await wait(() => !inCar() && dist(P.position, p.x, p.z) < r, t); } finally { ring.hide(); app.scene.remove(ring.group); gps.clear(); }
  };
  // search: hold F there on foot (the van's search, ui.holdAct). The hold counts at the spot its ring is drawn on (a
  // corner's centre, cx/cz, when the place is a corner: the ring and the hold were 7 m apart there, VR 5 Nov).
  // A search of the player's own car (on: 'ride', or a search whose words name its trunk, boot, glovebox or hood, or the
  // car by name: carSearch) is held at the car wherever he parked it: its trunk (or door, or hood), the ring, the blip and
  // the route following the car; the place stays the route's target while he is still driving there, more than 40 m out.
  // F at the car then searches it rather than getting in (W.carF, as the tow's hook-up)
  STEPS.search = async (d, t) => {
    const p = placeOf(d.at), on = carSearch(d);
    if (on) return searchCar(d, p, on, t);
    const reach = d.radius || 3.2, hx = p.cx ?? p.x, hz = p.cz ?? p.z;
    gps.objective(parts(d.objective || `Search **${d.label}**.`, 'green'), { x: p.x, z: p.z, name: d.label }, { blip: false });
    gps.blip('search', { x: p.x, z: p.z, kind: 'object', edge: true, name: d.label });
    const ring = createMarker(THREE, app.scene, { color: '#4ADE80', radius: d.ring || reach * 0.8, height: 1.1, alpha: 0.2 }); ring.at(hx, 0.02, hz);
    const act = ui.holdAct({ label: d.label, noun: d.noun || d.label.replace(/^\w+\s+((over|off|up|in|out|down|back|on|away|through|for)\s+)?/i, ''), secs: d.secs || 1.0, show: reach + 6, reach });
    M.holding = { x: hx, z: hz, act };
    let last = now();
    try { await wait(() => { const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt; return act.step(dt, dist(P.position, hx, hz), !inCar()) || (M.auto && !inCar() && dist(P.position, hx, hz) < reach); }, t); }
    finally { act.stop(); ring.hide(); app.scene.remove(ring.group); gps.unblip('search'); gps.clear(); M.holding = null; }
    sfx.play('ding', { gain: 0.25 });
  };
  // which part of the player's car a search is of, or null (a search at the place). on: 'ride' says so (part: trunk,
  // door, hood; trunk if left out), on: 'place' says not; else the step's words: a trunk, boot, tailgate, glovebox, hood
  // or bonnet, or the car's own name ('Search the Vesper's trunk', its sheet's label 'Vesper V12'), unless they name some
  // other vehicle ('search the van's trunk': the van is the story's, not his)
  const CAR_PARTS = [['door', /\b(glove ?box|glove compartment|door pocket|dash ?board)\b/i], ['hood', /\b(hood|bonnet)\b/i], ['trunk', /\b(trunk|boot|tailgate)\b/i]];
  const OTHER_RIDES = /\b(van|truck|lorry|taxi|cab|bus|ambulance|suv|sedan|pickup|wagon|limo|limousine|hearse|coupe|motorbike|moped|scooter|wrecker|tow truck|cruiser|squad car)\b/gi;
  function carSearch(d) {
    if (d.on === 'place') return null;
    if (d.on === 'ride') return ['trunk', 'door', 'hood'].includes(d.part) ? d.part : 'trunk';
    const words = `${d.label || ''} ${d.noun || ''} ${d.objective || ''}`.replace(/\*\*|\{(yellow|red|blue|green)\}/g, '');
    const sheet = (def0.rides && M.def.vehicle && def0.rides[M.def.vehicle]) || def0.car?.sheet || null;
    const label = String(sheet?.label || car.label || ''), noun = String(sheet?.noun || '').toLowerCase();
    const name = label.split(/\s+/).find((w) => w.length >= 3 && /^[A-Z]/.test(w));
    const named = !!name && new RegExp(`\\b${name.replace(/[^\w]/g, '')}\\b`, 'i').test(words);
    const other = (words.match(OTHER_RIDES) || []).some((w) => w.toLowerCase() !== noun && !label.toLowerCase().includes(w.toLowerCase()));
    if (other && !named) return null;
    const part = CAR_PARTS.find(([, re]) => re.test(words));
    return part ? part[0] : named ? 'trunk' : null;
  }
  async function searchCar(d, p, part, t) {
    const b = car.body || { hx: 1.05, z0: -2.3, z1: 2.4 }, hx = b.hx || 1.05;
    const reach = part === 'door' ? 1.5 : 1.7, FAR = 40;
    // (the car's frame: along its length, across it; a point or a segment of its outline in the world)
    const local = (x, z) => { const s = Math.sin(car.heading), c = Math.cos(car.heading), dx = x - car.position.x, dz = z - car.position.z; return [dx * s + dz * c, dx * c - dz * s]; };
    const world_ = (along, across) => { const s = Math.sin(car.heading), c = Math.cos(car.heading); return { x: car.position.x + along * s + across * c, z: car.position.z + along * c - across * s }; };
    // how far he is from the part: the rear bumper's width (trunk), the front's (hood), a front door's length on either side
    const partDist = () => {
      const [al, ac] = local(P.position.x, P.position.z);
      if (part === 'door') { const sd = Math.abs(Math.abs(ac) - hx), lo = (b.z1 ?? 2.4) * -0.2, hi = (b.z1 ?? 2.4) * 0.45; return Math.hypot(sd, Math.max(0, lo - al, al - hi)); }
      // (off the end of the car the full reach; along its side, past the bumper, only its corner)
      const zz = part === 'hood' ? (b.z1 ?? 2.4) : (b.z0 ?? -2.3), out = part === 'hood' ? al - zz : zz - al;
      return Math.hypot(Math.max(0, Math.abs(ac) - hx), out >= 0 ? out : -out * 1.8);
    };
    // where he goes: a step behind the trunk (in front of the hood, beside the door on the side he is on)
    const anchor = () => {
      if (part === 'door') { const [, ac] = local(P.position.x, P.position.z); return world_((b.z1 ?? 2.4) * 0.15, (ac < 0 ? -1 : 1) * (hx + 0.7)); }
      return part === 'hood' ? world_((b.z1 ?? 2.4) + 0.8, 0) : world_((b.z0 ?? -2.3) - 0.8, 0);
    };
    const what = part === 'door' ? 'the glovebox' : part === 'hood' ? 'the hood' : 'the trunk';
    const label = d.label || `search ${what}`, noun = d.noun || (/^\w+\s+(the|his|her|its|their|my|your)\b/i.test(label) && CAR_PARTS.some(([, re]) => re.test(label)) ? label.replace(/^\w+\s+/, '') : what);
    const objective = parts(d.objective || `Search ${what.replace('the ', 'the **')}**.`, 'green');
    const tgt = { follow: anchor, name: car.label || what, still: true };
    const ring = createMarker(THREE, app.scene, { color: '#4ADE80', radius: 1.0, height: 0.9, alpha: 0.22 });
    const act = ui.holdAct({ label, noun, secs: d.secs || 1.0, show: reach + 7, reach });
    const carF0 = W.carF;
    W.carF = () => !inCar() && partDist() <= reach + 0.4;
    M.holding = { car: part, act, get x() { return anchor().x; }, get z() { return anchor().z; } };
    let mode = null, helped = false, last = now();
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        const want = inCar() && dist(car.position, p.x, p.z) > FAR ? 'place' : 'car';
        if (want !== mode) { mode = want; gps.objective(objective, want === 'place' ? { x: p.x, z: p.z, name: p.name } : tgt, { blip: false }); }
        const a = anchor(), q = mode === 'place' ? p : a;
        gps.blip('search', { x: q.x, z: q.z, kind: 'object', edge: true, name: mode === 'place' ? p.name : (car.label || what) });
        if (mode === 'car') ring.at(a.x, 0.02, a.z); else ring.hide();
        if (mode === 'car' && inCar() && Math.abs(car.speed || 0) < 1 && !helped) { helped = true; ui.help('Press [F] to get out.', 6); }
        const dd = partDist();
        return act.step(dt, dd, !inCar()) || (M.auto && !inCar() && dd < reach);
      }, t);
    } finally { act.stop(); ring.hide(); app.scene.remove(ring.group); gps.unblip('search'); gps.clear(); M.holding = null; W.carF = carF0; }
    M.log.push(['search', 'car', part]);
    sfx.play('ding', { gain: 0.25 });
  }

  // npc: a cast member at a place, or beside the player, facing him
  // (an npc step's own id names who it stood up: { remove: 'knox-door' } hides Knox, as { remove: 'Knox' } does)
  const npcIds = new Map();
  STEPS.npc = async (d) => {
    const who = castName(d.who);
    if (d.remove) { cast.hide(castName(npcIds.get(d.remove) || d.remove)); return; }
    if (d.id) npcIds.set(d.id, who);
    let x, z;
    if (d.at && d.at.rel === 'player') {
      const e = cm.getActiveEntity(), h = e.heading, r = d.at.right || 0, f = d.at.fwd || 0;
      x = e.position.x - Math.cos(h) * r + Math.sin(h) * f; z = e.position.z + Math.sin(h) * r + Math.cos(h) * f;
    } else { const p = placeOf(d.at || '@' + Object.keys(def0.places || {})[0]); x = p.x; z = p.z; }
    const fig = await cast.spawn(who, { x, z, heading: Math.atan2(me().x - x, me().z - z) });
    if (fig) M.npcs.add(who);
  };

  // the cutscene camera: a point is 'player' (his head), '@place', or { rel: 'player' | <cast name>, right, up, fwd }
  const _v = new THREE.Vector3();
  function camPt(ref, fallbackUp = 1.5) {
    const e = cm.getActiveEntity();
    if (!ref || ref === 'player') return [e.position.x, e.position.y + (inCar() ? 1.2 : 1.55), e.position.z];
    if (typeof ref === 'string' && ref.startsWith('@')) { const p = places.at(ref); if (p) return [p.cx ?? p.x, cm.getGroundHeight(p.cx ?? p.x, p.cz ?? p.z, 'person') + fallbackUp, p.cz ?? p.z]; }
    if (typeof ref === 'object' && ref.rel) {
      const fig = ref.rel !== 'player' ? cast.get(castName(ref.rel)) : null;
      const base = fig ? fig.head(_v) : _v.set(e.position.x, e.position.y + (inCar() ? 1.2 : 1.55), e.position.z);
      const h = fig ? fig.heading : e.heading, f = ref.fwd || 0, r = ref.right || 0;
      return [base.x + Math.sin(h) * f - Math.cos(h) * r, base.y + (ref.up || 0), base.z + Math.cos(h) * f + Math.sin(h) * r];
    }
    return [e.position.x, e.position.y + 1.5, e.position.z];
  }
  // the cutscene's key light on the face it looks at, placed as Mog City's night scene places it (m2-scenes.js
  // burnerMeet's keyL: loc(0.8, 0.5, 1.9), 1.9 m out in front of the face, 0.8 m to one side, 0.5 m up, 2.6): from the
  // camera's side of the face but off its axis, so the face is modelled, not flattened. (VR, 5 Nov: it was put between
  // the lens and the face, 0.5 m from a close-up's face and straight on: seven times the light, a flat pale mask.) In
  // the scene from the start at 0 (no material rebuilt when a cutscene starts), up only while a cutscene runs
  const keyL = new THREE.PointLight('#FFE6CC', 0, 4.5, 2); app.scene.add(keyL);
  // (a close-up, the lens within CLOSE m of what it looks at: the city's screen-space reflections off for the shot. The
  // glass behind a face, a bus's windows, a shop front, would 'reflect' the face itself from the screen, stretched
  // and striped: VR, 5 Nov, 'a ghost in the bus window'. The reflection's strength is a uniform: nothing is rebuilt)
  const CLOSE = 3.5, ssrOf = () => app.postFX?.ssrPass || null;
  function keyLight(p, l) {
    const dx = p[0] - l[0], dz = p[2] - l[2], dy = p[1] - l[1], n = Math.hypot(dx, dy, dz) || 1, h = Math.hypot(dx, dz) || 1;
    const fx = dx / h, fz = dz / h, out = Math.min(1.9, n * 0.9);
    keyL.position.set(l[0] + fx * out - fz * 0.8, l[1] + 0.5, l[2] + fz * out + fx * 0.8);
    keyL.intensity = n < 6 ? 2.6 : 0;
    return n;
  }
  async function shotList(shots, t, { skippable = true, beat = false } = {}) {
    const D = createDirector(W);
    const ssr0 = ssrOf()?.intensity.value ?? 0;
    W.cutscene = !beat; if (!beat) { ui.cine(true); ui.objective(null); }
    let skip = false;
    const local = tokOf(t);
    if (skippable && !beat) D.block(true, { onSkip: () => { skip = true; kill(local); } });
    D.take();
    let lastFrame = now();
    const stepSkip = () => { const tt = now(); D.skipStep(Math.min(0.05, (tt - lastFrame) / 1000), ui); lastFrame = tt; };
    try {
      for (const s of shots) {
        if (skip) break;
        if (s.if && !cond(s.if)) continue;
        const dur = s.dur || 3, A = camPt(s.cam), B = s.to ? camPt(s.to) : A, LA = camPt(s.look, 1.4), LB = s.lookTo ? camPt(s.lookTo, 1.4) : LA;
        const pos = keys([[0, A], [dur, B]]), look = keys([[0, LA], [dur, LB]]);
        const t0 = now();
        const sub = s.sub && (Array.isArray(s.sub) ? s.sub : ['', s.sub]);
        if (s.caption) ui.caption(s.caption, '', '#FFC93C', Math.min(dur, 3));
        if (s.say && Array.isArray(s.say)) { const [w, x] = s.say; ui.sub(castName(w), tokens(x), colorOf(castName(w))); mumble(castName(w), x, dur); }
        else if (sub && sub[1]) { const w = castName(sub[0]); ui.sub(w || null, tokens(sub[1]), colorOf(w)); if (w) mumble(w, sub[1], dur); M.log.push(['say', w, sub[1]]); }
        else if (s.text) ui.sub(null, tokens(s.text));
        const len = Math.max(dur, sub && sub[1] ? Math.max(1.4, sub[1].length / 15, (W.voice?.dur?.(castName(sub[0]), tokens(sub[1])) || 0) + 0.15) : 0);
        try {
          await wait(() => {
            const k = Math.min(dur, (now() - t0) / 1000), hh = handheld(k + t0 / 1000, 0.4);
            const p = pos(k), l = look(k);
            D.camera = { pos: [p[0] + hh.x, p[1] + hh.y, p[2]], look: l, fov: s.fov || 40, roll: 0, shake: hh };
            { const n = keyLight(p, l), ssr = ssrOf(); if (ssr) ssr.intensity.value = n < CLOSE ? 0 : ssr0; }
            if (!beat) stepSkip();
            return (now() - t0) / 1000 >= len;
          }, local);
        } catch (e) { if (!(e instanceof Stop) || !skip) throw e; }
        ui.sub(null);
      }
    } finally {
      ui.sub(null); ui.caption(null); ui.skip(null); keyL.intensity = 0; if (ssrOf()) ssrOf().intensity.value = ssr0;
      if (!beat) D.block(false);
      await D.release(0.6);
      W.cutscene = false; if (!beat) ui.cine(false);
    }
  }
  STEPS.cutscene = async (d, t) => {
    if (d.place) { const p = placeOf(d.place); putPlayer(p, inCar() ? 'car' : 'walk'); }
    await shotList(d.shots, t);
  };
  STEPS.beat = async (d, t) => {
    if (d.say) { const s = tuple(d.say); say(castName(s.who), s.text, M.tok).catch(() => {}); }
    await shotList([{ ...d.shot, dur: d.dur || 1.8 }], t, { beat: true });
  };
  STEPS.vignette = async (d, t) => {
    const filmed = d.shots.filter((s) => s.cam);
    if (filmed.length === d.shots.length) return shotList(d.shots, t);
    // (an off-map room: the city behind a veil, each shot's words over it)
    await ui.fade(0.92, 0.5); ui.cine(true);
    try {
      for (const s of d.shots) {
        if (s.if && !cond(s.if)) continue;
        if (s.caption) ui.caption(s.caption, '', s.color || '#FFC93C', s.dur || 3);
        if (s.say) { const sy = tuple(s.say); await say(castName(sy.who), sy.text, t); }
        else { if (s.text || s.sub) ui.sub(null, tokens(s.text || s.sub)); await delay(s.dur || 3, t); ui.sub(null); }
      }
    } finally { ui.cine(false); ui.caption(null); await ui.fade(0, 0.5); }
  };
  STEPS.transition = async (d, t) => {
    await ui.fade(0.97, 0.6);
    try {
      if (d.place) putPlayer(placeOf(d.place), inCar() ? 'car' : 'walk');
      setTime(d.time); applySet(d.set);
      await hud.card({ kicker: d.kicker || d.clock || '', text: tokens(d.text), sub: tokens(d.sub || '') }, ctx.flags.flowFast ? 0.8 : (d.secs || 2.6));
    } finally { await ui.fade(0, 0.6); }
  };
  STEPS.actEnd = async (d, t) => {
    const stats = (d.stats || []).map((s) => [s.label, s.value]);
    ui.passed({ title: tokens(d.heading || d.title || ''), stats, note: d.quote ? `"${d.quote.text}"${d.quote.by ? ' · ' + d.quote.by : ''}` : '' }, ctx.flags.autoCard ? 1.5 : Math.max(4, d.minSecs || 0));
    await delay(ctx.flags.autoCard ? 1.6 : Math.max(4, d.minSecs || 0) + 0.4, t);
    if (d.next) await hud.card({ kicker: d.next.kicker || 'NEXT', text: d.next.text, sub: d.next.sub || '' }, ctx.flags.autoCard ? 0.8 : (d.next.secs || 3));
  };

  // a choice: hud.choice; each option's set, reply and goto; the silence when it times out
  async function choose(c, t) {
    const options = c.options.map((o) => ({ text: tokens(o.text), locked: false }));
    const who = castName(c.who);
    const shown = hud.choice({ prompt: tokens(c.prompt), who, color: colorOf(who), options, secs: c.timeout || 0 });
    // (a test drive takes option n after a beat, as a player would)
    if (ctx.flags.autoChoose != null) { const pick = hud.choosing; setTimeout(() => { if (hud.choosing === pick) pick?.pick(Math.min(options.length - 1, ctx.flags.autoChoose)); }, 1200); }
    let i = await Promise.race([shown, wait(() => false, t).catch((e) => { hud.choosing?.cancel(); throw e; })]);
    if (i < 0 && c.default != null) i = c.default;
    M.log.push(['choice', c.prompt, i]);
    if (c.fork) M.state.forks = { ...(M.state.forks || {}), [c.fork]: i };
    if (i < 0) {
      if (c.silenceValue && c.flag) M.state.flags[flagName(c.flag)] = c.silenceValue;
      if (c.silenceReply) { const s = tuple(c.silenceReply); await say(castName(s.who), s.text, t); }
      return {};
    }
    const o = c.options[i];
    if (c.flag) M.state.flags[flagName(c.flag)] = o.value ?? i;
    applySet(o.set);
    if (o.reply) { const s = tuple(o.reply); await say(castName(s.who), s.text, t); }
    return o.goto ? { goto: o.goto } : {};
  }
  STEPS.choice = async (d, t) => choose(d, t);

  // a call: the car phone (auto / inCar: calls.js, its rules: only at the wheel, on hold on foot, wraps when its leg
  // ends) or a phone that rings (E or Y answers, X or N declines; the caller card, Mog City's), then its choice
  STEPS.call = async (d, t, ride) => {
    const who = castName(d.who), color = colorOf(who);
    const lines = (d.lines || []).map(tuple), toTup = (l) => [castName(l.who), colorOf(castName(l.who)), tokens(l.text)];
    // one of Mog City's own car-phone calls by its id (calls.js CALLS: its lines, recordings and rules), wrapped and
    // hurried by the distance left to the leg's mark, as its mission does
    if (d.ref && W.calls?.CALLS && Object.prototype.hasOwnProperty.call(W.calls.CALLS, d.ref)) {
      const near = (k) => (k ? () => !!M.dest && dist(me(), M.dest.x, M.dest.z) < k : undefined);
      W.calls.start(d.ref, { step: ui.stepId, wrapWhen: near(d.wrapNear), hurryWhen: near(d.hurryNear) });
      M.log.push(['call', d.ref]);
      if (ride) { await wait(() => false, t).catch(() => {}); if (W.calls.owes?.(d.ref)) W.calls.stop({ quiet: true, of: 'pack:' }); return; }
      await wait(() => W.calls.state()?.id !== d.ref || W.calls.owes?.(d.ref) !== 'main', t);
      return;
    }
    // (the car phone: an inCar call, or one that answers itself while he drives or is at the wheel; an `auto` call on
    // foot, as a video call outside his building, is answered at once and played on the phone below: calls.js would
    // hold it for a car he is not in)
    if ((d.inCar || (d.auto && (ride || inCar()))) && W.calls?.define) {
      const id = `pack:${M.def.id}:${M.i}:${ride ? 'd' : 's'}:${who}`;
      const f0 = {}; for (const n of new Set([who, ...lines.map((l) => castName(l.who))])) f0[n] = cast.f0(n);
      W.calls.define(id, { who, color, f0, step: ui.stepId, main: lines.map(toTup), extra: (d.extra || []).map((b) => b.map(tuple).map(toTup)), wrap: (d.wrap || []).map(tuple).map(toTup),
        pause: (d.hold?.pause || []).map(tuple).map(toTup), resume: (d.hold?.resume || []).map(tuple).map(toTup), trigger: d.inCar || d.auto ? 'enter-car' : 'phase-start', delay: 2, wrapAfterMain: !ride });
      const hostDone = { v: false };
      W.calls.start(id, { step: ui.stepId, wrapWhen: () => hostDone.v });
      M.log.push(['call', who]);
      if (ride) { await wait(() => false, t).catch(() => {}); hostDone.v = true; W.calls.wrap?.(); return; }
      // (as its own step: until it has said its main lines, at the wheel)
      await wait(() => W.calls.live === id || !W.calls.state() || W.calls.state()?.id !== id, t);
      await wait(() => W.calls.state()?.id !== id || W.calls.owes?.(id) !== 'main', t);
      if (d.choice) return choose(d.choice, t);
      return;
    }
    sfx.play('ring', { gain: 0.16, times: d.auto ? 1 : 2 });
    ui.caller(who, color, d.auto ? (d.role || 'Incoming call') : 'Incoming call');
    let answer = d.auto ? true : null;
    const onKey = (e) => { if (W.paused || e.repeat) return; if (['KeyE', 'KeyY'].includes(e.code)) { answer = true; e.stopImmediatePropagation(); } else if (['KeyX', 'KeyN'].includes(e.code)) { answer = false; e.stopImmediatePropagation(); } };
    addEventListener('keydown', onKey, true);
    if (!d.auto) ui.help('Press [E|ANSWER] to answer, [X|DECLINE] to decline.', (d.ring || 8) + 1);
    const t0 = now();
    try {
      await wait(() => answer != null || (ctx.flags.autoAnswer && now() - t0 > 1500) || (now() - t0) / 1000 > (d.ring || 8), t);
      if (d.auto) await wait(() => now() - t0 > 900, t);
    } finally { removeEventListener('keydown', onKey, true); ui.help(null); }
    if (answer == null && ctx.flags.autoAnswer) answer = true;
    if (!answer) {
      ui.caller(null); sfx.play('hangup', { gain: 0.12 });
      applySet(d.decline);
      M.state.declined = (M.state.declined || 0) + 1;
      if (d.voicemail) { await voicemail({ who: castName(d.voicemail.from) || who, text: d.voicemail.text, secs: d.voicemail.secs }, t); applySet(d.voicemail.set); }
      return;
    }
    applySet(d.answer);
    ui.caller(who, color, d.role || 'On call');
    M.log.push(['call', who]);
    try {
      for (const l of lines) await say(castName(l.who), l.text, t, { secs: l.secs, phone: castName(l.who) !== heroName });
      if (d.choice) return await choose(d.choice, t);
    } finally { ui.caller(null); sfx.play('hangup', { gain: 0.12 }); }
  };
  async function voicemail(d, t, label = 'Voicemail') {
    const who = castName(d.who);
    sfx.play('ding', { gain: 0.25 });
    ui.caller(who, colorOf(who), label);
    try { await say(who, d.text, t, { secs: d.secs, phone: true }); } finally { ui.caller(null); }
  }
  STEPS.voicemail = async (d, t) => { await voicemail(d, t); applySet(d.set); };
  STEPS.voicenote = async (d, t) => { await voicemail(d, t, 'Voice note'); applySet(d.set); };

  // a fight on foot: combat's crew at the arena (the Suits' men, as many as the step names: a man the forge made
  // fights in a Suit's body until the cast66 enemy adapter lands), the counter, out cold or 150 m off fails
  STEPS.fight = async (d, t) => {
    const combat = W.combat;
    if (!combat?.spawnCrew) { console.warn('[storyrun] no fight on this page'); return; }
    const p = placeOf(d.arena);
    if (inCar()) { putAt(W, { car: [car.position.x, car.position.z, car.heading] }); outBesideCar(W); }
    if (dist(P.position, p.x, p.z) > 30) { putPlayer(p, 'walk'); }
    const ax = P.position.x, az = P.position.z;
    app.trafficSystem.hold?.([{ minX: ax - 40, maxX: ax + 40, minZ: az - 40, maxZ: az + 40 }]);
    combat.clear?.();
    // (the rules: the step's, else combat's own: Mog City's first fight teaches, FIGHT BASICS)
    if (d.rules) try { combat.debug?.rules?.(d.rules); } catch {}
    combat.player.maxHp = d.hp || combat.player.maxHp; combat.player.hp = combat.player.maxHp;
    const autoGetUp = combat.player.autoGetUp; combat.player.autoGetUp = d.win === 'survive';
    let down = false;
    const offDown = combat.player.onDown(() => { if (d.win !== 'survive') down = true; });
    const n = Math.max(1, d.enemies.length), f = P.heading;
    // (where they stand: the step's place, else 7 m ahead of him)
    const at0 = d.crewAt ? placeOf(d.crewAt) : null;
    const crews = [combat.spawnCrew({ x: at0 ? (at0.cx ?? at0.x) : ax + Math.sin(f) * 7, z: at0 ? (at0.cz ?? at0.z) : az + Math.cos(f) * 7, count: n, props: true }).engage()];
    const crew = { alive: () => crews.reduce((a, c) => a + c.alive(), 0) };
    M.crew = crew;
    let total = n, more = d.reinforce || null, lastK = 0, talk = false, lastHp = combat.player.hp;
    const fightSay = (lines) => { talk = true; (async () => { for (const l of lines.map(tuple)) await say(castName(l.who), l.text, M.tok); })().catch(() => {}).finally(() => { talk = false; }); };
    const label = d.counter || 'DOWN';
    ui.counter(label, `0/${n}`);
    gps.objective(parts(d.objective || (d.win === 'survive' ? 'Stay on your feet.' : 'Beat them all.'), 'red'), null);
    const t0 = now();
    if (d.win === 'survive' || d.timer) M.fightTimer = { left: d.timer || 60 };
    try {
      await wait(() => {
        const alive = crew.alive(), k = total - alive;
        // (the hits he takes, for the MISSION PASSED card)
        const hp = combat.player.hp; if (hp < lastHp - 0.5) M.stats.hits++; lastHp = hp;
        // more of them run in at `at` down (Mission 1's Dash), from about 30 m off him; a bark at each count
        if (more && k >= (more.at ?? 1)) {
          const src = more.from ? placeOf(more.from) : null, dx = src ? src.x - P.position.x : -Math.sin(f) * 30, dz = src ? src.z - P.position.z : -Math.cos(f) * 30, kk = Math.min(1, 30 / Math.max(1, Math.hypot(dx, dz)));
          crews.push(combat.spawnCrew({ x: P.position.x + dx * kk, z: P.position.z + dz * kk, count: more.count || 1, props: false }).engage());
          total += more.count || 1; if (more.say) fightSay(more.say); more = null; return false;
        }
        if (k !== lastK) { lastK = k; const b = d.barks?.[k]; if (b && !talk && alive > 0) fightSay([b]); }
        ui.counter(label, `${k}/${total}`);
        for (const e of combat.enemies) if (e.alive) gps.blip('e:' + e.id, { x: e.pos.x, z: e.pos.z, kind: 'enemy' }); else gps.unblip('e:' + e.id);
        if (down) throw new Fail(tokens(d.why || `${heroName} got knocked out.`), 'ko');
        if (dist(me(), ax, az) > 150) throw new Fail('You left the fight.', 'left');
        const secs = (now() - t0) / 1000;
        if (d.timer) hud.timer(d.timer - secs, d.win === 'survive' ? 'HOLD ON' : 'TIME');
        if (d.win === 'survive') return secs >= (d.timer || 60);
        if (d.timer && secs > d.timer) throw new Fail(tokens(d.why || 'You ran out of time.'), 'time');
        return alive === 0 && !more;
      }, t);
      M.stats.ko += total;
    } finally {
      offDown?.(); combat.player.autoGetUp = autoGetUp; if (d.rules) try { combat.debug?.rules?.(null); } catch {}
      for (const id of [...gps.blips.keys()]) if (id.startsWith('e:')) gps.unblip(id);
      ui.counter(null); hud.timer(null); M.crew = null; M.fightTimer = null;
    }
    if (d.win === 'survive') combat.clear?.();
    await delay(1.0, t);
  };

  // a chase: pursuit's heat and cars; lose them, reach a place with them on you, or keep going (escort) for `until` s
  STEPS.pursuit = async (d, t, ride) => {
    const pu = W.pursuit; if (!pu?.start) { console.warn('[storyrun] no pursuit on this page'); return; }
    if (!inCar()) { /* (the chase needs the car: the GPS sends him back to it) */ }
    const chase = pu.start({ heat: d.level || 2, kind: d.kind === 'police' ? 'police' : 'suits', count: value(d.count, M.state, ctx.save.done) || undefined, lose: d.goal !== 'escort', ...(d.loseTime ? { escape: d.loseTime } : {}) });
    let lost = false, caught = false;
    chase?.on?.('lost', () => { lost = true; }); chase?.on?.('caught', () => { caught = true; });
    M.chase = chase;
    try {
      if (d.goal === 'reach' && d.to) {
        const p = placeOf(d.to);
        await Promise.race([goTo(p, d, t, { objective: d.objective || `Get to **${p.name}**.`, needsCar: true }), wait(() => { if (caught) throw new Fail('They caught you.', 'caught'); return false; }, t)]);
      } else if (ride) {
        await wait(() => { if (caught) throw new Fail('They caught you.', 'caught'); return false; }, t);
      } else {
        gps.objective(parts(d.objective || (d.goal === 'escort' ? 'Keep going.' : 'Lose them.'), 'red'), null);
        const t0 = now();
        await wait(() => { if (caught) throw new Fail('They caught you.', 'caught'); return d.goal === 'escort' ? (now() - t0) / 1000 > (d.until || 45) : lost || (M.auto && M.loseAssist); }, t);
      }
      M.timer.add(d.bonus || 0); if (d.flag) M.state.flags[flagName(d.flag)] = true;
    } finally { try { chase?.stop?.(); } catch {} M.chase = null; M.loseAssist = false; gps.clear(); }
  };

  // a tail: a car on the planner's route through the step's places (m2-drive.js: it lives in the traffic, brakes for
  // what is ahead of it), the city's own body in the step's colour; too close for too long and it bolts, too far and it
  // is lost
  STEPS.tail = async (d, t) => {
    const route = d.route.map((r) => placeOf(r));
    const pts = [];
    for (let k = 0; k + 1 < route.length; k++) { const seg = gps.plan({ x: route[k].x, z: route[k].z }, { x: route[k + 1].x, z: route[k + 1].z }, route[k].heading) || [[route[k].x, route[k].z], [route[k + 1].x, route[k + 1].z]]; for (const q of seg) if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 3) pts.push(q); }
    const { createDriver } = await import('../mission/m2-drive.js');
    const N = window.NYC, g = new THREE.Group(), spec = N.BODY_SPECS?.[d.car === 'lowered' ? 'sedan' : d.car || 'sedan'];
    if (spec && N.buildCarGeometry) { const m = new THREE.Mesh(N.buildCarGeometry(spec, true), N.createLoftedCarMaterial(spec, new THREE.Color(d.color || '#1b1d22').getHex())); m.castShadow = true; g.add(m); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 4.6), new THREE.MeshStandardMaterial({ color: d.color || '#1b1d22' })); m.position.y = 0.8; g.add(m); }
    app.scene.add(g);
    const D = createDriver(W, { obj: g, path: pts, halfW: 1.0, halfL: 2.4 });
    D.place(0);
    // (the followed car, for the test drive's autopilot: autopilot.js jumps a long tail on, as it does a long leg)
    M.tail = D;
    const name = d.name || 'the car';
    gps.objective(parts(d.objective || `Follow **${name}**. Don't get too close.`, 'red'), { follow: () => D.pos, name });
    gps.blip('tail', { x: D.pos.x, z: D.pos.z, kind: 'enemy', edge: true, name });
    let close = 0, far = 0, last = now(), opened = false, lastLeft = 0;
    const ring = d.ring || 25, lostDist = d.lostDist || 160, t0 = now();
    // (a tail that starts where the last leg ended, on top of the car to follow: being close counts only once it has
    // pulled away to half the ring, or after 6 s; MM, 5 Nov: Mission 2's van "spotted" a player parked at its mark)
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        const dd = dist(me(), D.pos.x, D.pos.z);
        const want = dd < ring ? (d.speed || 13) * 1.4 : dd > lostDist * 0.6 ? (d.speed || 13) * 0.5 : (d.speed || 13);
        D.step(dt, want);
        gps.blip('tail', { x: D.pos.x, z: D.pos.z, kind: 'enemy', edge: true, name });
        // (the metres the followed car has left, told to a framing GameMog each second: a long tail is progress, not stuck)
        if (tt - lastLeft > 1000) { lastLeft = tt; host.tell('progress', { mission: M.def.id, step: d.id || null, kind: 'tail', i: M.i, n: M.def.steps.length, left: Math.max(0, Math.round(D.length - D.s)) }); }
        if (dd >= ring * 0.5 || now() - t0 > 6000) opened = true;
        close = dd < ring * 0.5 && opened ? close + dt : Math.max(0, close - dt);
        far = dd > lostDist ? far + dt : 0;
        if (close > (d.spotTime || 4)) throw new Fail(`${name.replace(/^the /, 'The ')} spotted you.`, 'lost');
        if (far > (d.lostTime || 8)) throw new Fail(`You lost ${name}.`, 'lost');
        return D.done;
      }, t);
    } finally { app.scene.remove(g); gps.unblip('tail'); gps.clear(); if (M.tail === D) M.tail = null; }
  };

  // a trigger: once (or every time) the player is in an area, on a street, or a condition holds: its line, set and side steps
  STEPS.trigger = async (d, t) => {
    const area = d.area ? placeOf('@' + d.area['@']) : null;
    let fired = false;
    const turns = gps.turns;
    await wait(() => {
      const hit = (area ? dist(me(), area.x, area.z) < d.area.r : true) && (d.when ? cond(d.when) : true) && (d.street ? String(turns?.nameAt?.(me().x, me().z) || '').toLowerCase().includes(d.street.toLowerCase()) : true);
      if (hit && !fired) {
        fired = true;
        if (d.cue) try { sfx.play(d.cue, { gain: 0.3 }); } catch {}
        if (d.say) { const s = tuple(d.say); say(castName(s.who), s.text, M.tok).catch(() => {}); }
        applySet(d.set); if (d.flag) M.state.flags[flagName(d.flag)] = true;
        for (const x of d.do || []) side(x, M.tok, true);
        if (d.once !== false) return true;
      }
      if (!hit) fired = false;
      return false;
    }, t);
  };
  // scene: one of Mog City's own set pieces (SCENES), its camera, cast, lines and skip its own
  STEPS.scene = async (d, t) => {
    if (partOf(d.name)) { M.log.push(['scene', d.name]); ui.objective(null); await runPart(d.name, d, t); if (d.time) setTime(d.time); return; }
    const play = Object.prototype.hasOwnProperty.call(SCENES, d.name) ? SCENES[d.name] : null;
    if (!play) { console.info(`[storyrun] ${M.def.id}: no Mog City scene '${d.name}'; it passes`); return; }
    M.log.push(['scene', d.name]);
    ui.objective(null);
    await play(W);
    if (d.time) setTime(d.time);
  };
  // one of Mog City's own mission phases (a step's ref, a scene's name): m2.js / m3.js playPart, one instance per mission
  // module through the world's mission (the van the go set rolling is the one tailed); fresh: the first step of this
  // try, where the shipped restart puts him; keep: a retry (the card's stats carried, as the shipped restart does).
  // Its fail is the world's fail screen with Mog City's own reason and tip; the step's token dying ends the phase.
  async function runPart(ref, d, t) {
    const [m, n] = partOf(ref);
    const mod = await PART_MOD[m]();
    M.partMods.set(m, mod);
    const go = mod.playPart(W, n, { fresh: M.fresh, keep: M.keep, chat: d.chat !== false });
    let r;
    try { r = await Promise.race([go, wait(() => false, t)]); }
    catch (e) { go.catch(() => {}); mod.endParts(W); M.partMods.delete(m); throw e; }
    if (r?.stats) M.partStats = r.stats;
    if (r?.fail != null) throw new Fail(r.fail, r.ko ? 'ko' : 'part', { tip: r.tip, sounded: r.sounded });
    if (r?.quit) throw new Stop();
    M.timer.add(d.bonus || 0); if (d.flag) M.state.flags[flagName(d.flag)] = true;
    return r;
  }

  // a passenger: a cast member walks to the car's door and rides in a seat of it (the roadster's passenger seat; a sheet
  // car's front or its back bench: 'rear' behind the passenger, 'rear-left' behind him), seated on the sit clip, his hips
  // on the seat's mark in the car's own frame, so he is seen through the glass and goes where the car goes; board false:
  // out at that door and a few steps off, then gone. A car with no seat left for him (the roadster's two taken): he
  // rides unseen, and the console says so.
  const riders = new Map();
  const _rv = new THREE.Vector3();
  function seatOf(rs, seat) {
    const [hx, hy, hz] = rs.seat.hip, taken = new Set([...riders.values()].map((r) => r.seat));
    const rear = rs.rear || null;
    const marks = { front: [-hx, hy, hz], rear: rear ? rear.pass : null, 'rear-left': rear ? rear.drv : null };
    const order = [seat || 'front', 'front', 'rear', 'rear-left'];
    for (const k of order) if (marks[k] && !taken.has(k)) return [k, marks[k]];
    return [null, null];
  }
  function doorPoint(side, out = 1.5) {
    // (the car's side, in the world: x across it, +x the driver's side)
    const h = car.heading, x = side * ((car.roadster?.width || 1.9) / 2 + out);
    return { x: car.position.x + Math.cos(h) * x, z: car.position.z - Math.sin(h) * x };
  }
  STEPS.passenger = async (d, t) => {
    const who = castName(d.who), rs = car.roadster;
    if (d.board === false) {
      const r = riders.get(who); if (!r) return;
      await wait(() => Math.abs(car.speed || 0) < 1.5, t);
      riders.delete(who);
      const f = r.f, side = r.mark[0] > 0 ? 1 : -1, at = doorPoint(side, 0.9);
      app.scene.attach(f.root); f.root.rotation.set(0, car.heading + side * PI / 2, 0); f.heading = f.root.rotation.y;
      f.root.position.set(at.x, cm.getGroundHeight(at.x, at.z, 'person'), at.z);
      f.play?.('walk') || f.play?.('idle');
      const t0 = now(), secs = d.secs || 2.5, from = { x: at.x, z: at.z }, to = doorPoint(side, 3.2);
      try { await wait(() => { const k = Math.min(1, (now() - t0) / 1000 / secs); f.root.position.x = from.x + (to.x - from.x) * k; f.root.position.z = from.z + (to.z - from.z) * k; return k >= 1; }, t); }
      finally { f.play?.('idle'); cast.hide(who); M.log.push(['passenger-out', who]); }
      return;
    }
    if (!rs?.anchor || !rs.seat?.hip) { console.info(`[storyrun] ${M.def.id}: no seat on this car for ${who}`); return; }
    await wait(() => Math.abs(car.speed || 0) < 1.5, t);
    const [seatName, mark] = seatOf(rs, d.seat);
    const side = mark && mark[0] > 0 ? 1 : -1, door = doorPoint(side, 2.6), at = doorPoint(side, 0.7);
    const f = await cast.spawn(who, { x: door.x, z: door.z, heading: Math.atan2(at.x - door.x, at.z - door.z) });
    if (!f) { console.info(`[storyrun] ${M.def.id}: ${who} has no body to ride (a voice or a pet); passes`); return; }
    // (to the door, walking)
    f.play?.('walk');
    const t0 = now(), secs = Math.max(1, (d.secs || 3) * 0.7);
    await wait(() => { const k = Math.min(1, (now() - t0) / 1000 / secs), a = doorPoint(side, 2.6 - 1.9 * k); f.at(a.x, a.z, Math.atan2(car.position.x - a.x, car.position.z - a.z)); return k >= 1; }, t);
    if (!mark) { cast.hide(who); riders.set(who, { f, seat: 'unseen', mark: [side, 0, 0] }); console.info(`[storyrun] ${M.def.id}: no seat left for ${who}; rides unseen`); return; }
    // (in: the sit clip, his hips on the seat's mark, facing the way the car does)
    rs.anchor.add(f.root); f.root.rotation.set(0, 0, 0); f.root.position.set(0, 0, 0); f.heading = 0;
    if (!(f.play?.('sit'))) try { const nat = f.native; if (nat?.rig && (nat.clips || []).includes('sit')) nat.rig.set([[0, 'sit']]); } catch {}
    f.mixer?.update?.(0.016); f.root.updateMatrixWorld(true);
    const hip = f.bones?.root || f.bones?.pelvis || null;
    if (hip) { rs.anchor.worldToLocal(hip.getWorldPosition(_rv)); f.root.position.set(mark[0] - _rv.x, mark[1] - _rv.y, mark[2] - _rv.z); }
    else f.root.position.set(mark[0], mark[1] - 0.95, mark[2]);
    f.root.visible = true;
    riders.set(who, { f, seat: seatName, mark });
    M.log.push(['passenger', who, seatName]);
    sfx.play('thunk', { gain: 0.18, f: 120 });
    await delay(0.4, t);
  };
  function dropRiders() { for (const [who, r] of riders) { app.scene.attach(r.f.root); cast.hide(who); } riders.clear(); }

  // comfort: a passenger's comfort (1 calm .. 0 can't take it), a bar in the tail meter's look; hard braking, fast
  // corners and knocks drain it (its drain weights), smooth driving refills it (refill /s); its lines at their levels;
  // at 0 a soft one sets its flag and set and goes on, a hard one fails with its why
  STEPS.comfort = async (d, t) => {
    const who = castName(d.who), label = String(d.label || 'COMFORT').toUpperCase();
    const w = { brake: 1, lateral: 1, hit: 1, bump: 0.5, time: 0, ...(d.drain || {}) }, refill = d.refill ?? 0.04;
    let k = d.start ?? 1, out = false, last = now(), lv = car.speed || 0, lh = car.heading, lx = car.position.x, lz = car.position.z, calm = 0;
    const said = new Set();
    const offHit = W.crash?.on?.('hit', (e) => { if (inCar() && !W.cutscene) k -= 0.14 * w.hit * Math.min(2, Math.max(0.4, (e?.speed || 8) / 8)); });
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        if (!dt || W.cutscene) return false;
        if (inCar()) {
          const v = car.speed || 0, jumped = Math.hypot(car.position.x - lx, car.position.z - lz) > 12;
          const acc = (v - lv) / dt, yaw = Math.atan2(Math.sin(car.heading - lh), Math.cos(car.heading - lh)) / dt;
          lv = v; lh = car.heading; lx = car.position.x; lz = car.position.z;
          if (!jumped) {
            const brake = Math.max(0, -acc * Math.sign(v || 1) - 4), lat = Math.max(0, Math.abs(v * yaw) - 5);
            const drain = brake * 0.02 * w.brake + lat * 0.015 * w.lateral + w.time;
            if (drain > 0.002) { k -= drain * dt; calm = 0; } else { calm += dt; if (calm > 1) k += refill * dt; }
            k = Math.max(0, Math.min(1, k));
          }
        }
        hud.bar(label, k, k < 0.3 ? 'SHAKEN' : k < 0.6 ? 'UNEASY' : 'CALM');
        for (const l of d.lines || []) if (k < l.below && !said.has(l)) { said.add(l); say(castName(l.who), l.text, M.tok).catch(() => {}); }
        if (k <= 0 && !out) {
          out = true;
          if (d.fail === 'hard') throw new Fail(tokens(d.why || `${who} couldn't take any more.`), 'comfort');
          if (d.flag) M.state.flags[flagName(d.flag)] = true;
          applySet(d.set);
          ui.help(tokens(d.why || `${who} is shaken. Drive smoother.`), 5);
        }
        return false;
      }, t);
    } finally { offHit?.(); hud.bar(null); }
  };

  // tow: the hero's wrecker (a sheet with the tow ability: its wheel-lift and light bar, rs.tow) hooks a car and hauls it.
  // A car stands at the target place, parked on the kerb (the city's own body, sedan by default, or a ride of the
  // world's by its id, built from its sheet); he drives up to it (the GPS), backs the truck's tail up to its nose
  // (a green ring where the tail goes), holds F at the wheel to hook it: the light bar on, the lift out and down under
  // its front wheels, then up. Then he tows it to `to`: its front wheels in the cradle, its back wheels rolling on the
  // road, trailing the hitch as a trailer does (its back axle follows the front's along the line between them, so it
  // swings wide behind him in a turn and folds when he reverses), pitched nose up by the lift's height, bobbing on the
  // truck's starts and stops and knocked aside by walls; the truck slower and heavier for it. At the drop-off, slowed,
  // the lift lets it down and it stays there, parked. M.tow says where it is for the test drive (autopilot.js).
  const parked = [];
  const _tv = new THREE.Vector3(), _tq = new THREE.Quaternion(), _te = new THREE.Euler(0, 0, 0, 'YXZ');
  async function towCar(d) {
    const N = window.NYC, ride = d.car && def0.rides?.[d.car];
    if (ride) {
      try {
        const { buildVehicle } = await import('./vehicles/build-vehicle.js');
        const v = buildVehicle(THREE, ride.sheet || ride);
        v.group.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
        return { obj: v.group, rs: v, wr: v.shape.WR, zF: v.shape.AXF, zR: v.shape.AXR, half: v.width / 2, nose: v.shape.ZF };
      } catch (e) { console.warn('[storyrun] tow car', d.car, e); }
    }
    const spec = N.BODY_SPECS?.[['sedan', 'suv', 'taxi', 'pickup', 'van', 'minivan'].includes(d.car) ? d.car : 'sedan'] || null, g = new THREE.Group();
    if (spec && N.buildCarGeometry) { const m = new THREE.Mesh(N.buildCarGeometry(spec, true), N.createLoftedCarMaterial(spec, new THREE.Color(d.color || '#D9D6CF').getHex())); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    else { const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 4.6), new THREE.MeshStandardMaterial({ color: d.color || '#D9D6CF' })); m.position.y = 0.8; g.add(m); }
    const wz = spec?.wheelZ || 1.4;
    return { obj: g, rs: null, wr: spec?.wheelRadius || 0.35, zF: wz, zR: -wz, half: (spec?.wheelX || 0.8) + 0.15, nose: spec?.zFront || 2.25 };
  }
  STEPS.tow = async (d, t) => {
    for (const c of parked.splice(0)) app.scene.remove(c.obj);
    const p = placeOf(d.target), dest = placeOf(d.to), name = d.name || 'the car', rs = car.roadster, rig = rs?.tow || null;
    const T = await towCar(d); app.scene.add(T.obj);
    const wb = T.zF - T.zR, gy = (x, z) => cm.getGroundHeight(x, z, 'car');
    // (parked on the kerb at the place, facing along its lane)
    // (mid-block, before the corner the place names: back along its lane, on the kerb side)
    const h0 = p.heading ?? 0, side = 3.2, back = d.back ?? 18;
    const st = { fx: 0, fz: 0, rx: 0, rz: 0, fy: 0, pitch: 0, pv: 0, h: h0, spin: 0 };
    const cx = (p.cx ?? p.x) - Math.cos(h0) * side - Math.sin(h0) * back, cz = (p.cz ?? p.z) + Math.sin(h0) * side - Math.cos(h0) * back;
    st.fx = cx + Math.sin(h0) * T.zF; st.fz = cz + Math.cos(h0) * T.zF; st.rx = cx + Math.sin(h0) * T.zR; st.rz = cz + Math.cos(h0) * T.zR;
    const pose = (dt = 0) => {
      // the body from its two axles: the front at the hitch's height (fy over the ground), the back on the road
      const h = Math.atan2(st.fx - st.rx, st.fz - st.rz), gR = gy(st.rx, st.rz), lift = Math.max(0, st.fy);
      const want = Math.asin(Math.min(0.5, lift / wb));
      st.pv += ((want - st.pitch) * 90 - st.pv * 11) * dt; st.pitch += st.pv * dt; if (!dt) st.pitch = want;
      st.h = h;
      _te.set(-st.pitch, h, 0); _tq.setFromEuler(_te);
      T.obj.quaternion.copy(_tq);
      _tv.set(0, T.wr, T.zR).applyQuaternion(_tq);
      T.obj.position.set(st.rx - _tv.x, gR + T.wr - _tv.y, st.rz - _tv.z);
      if (T.rs) T.rs.update(dt, st.spin, 0);
    };
    pose();
    M.towing = T; M.tow = { phase: 'reach', name };
    const front = () => ({ x: st.fx, z: st.fz });
    // where the truck's lift reaches when it is out (its crossbar), in the world
    const liftZ = rig ? rs.shape.ZR - 1.05 : (car.body?.z0 ?? -2.3) - 0.9;
    const reachOf = () => { const c = Math.cos(car.heading), sn = Math.sin(car.heading); return { x: car.position.x + liftZ * sn, z: car.position.z + liftZ * c }; };
    // (the spot the truck backs to: in front of the car, facing its way, its lift's crossbar under the front wheels)
    const spot = { x: st.fx - Math.sin(h0) * liftZ, z: st.fz - Math.cos(h0) * liftZ, h: h0 };
    M.tow.spot = spot; M.tow.front = front;
    gps.blip('tow', { x: cx, z: cz, kind: 'object', edge: true, name });
    // 1. up to it
    try {
      await goTo({ x: spot.x + Math.sin(h0) * 9, z: spot.z + Math.cos(h0) * 9, name }, { radius: 14, stop: false, card: false }, t, { objective: d.objective || `Drive to **${name}**.`, needsCar: true });
    } catch (e) { gps.unblip('tow'); throw e; }
    // 2. back up to its nose and hold F at the wheel
    M.tow.phase = 'hook';
    const ring = createMarker(THREE, app.scene, { color: '#4ADE80', radius: 1.3, height: 0.6, alpha: 0.22 }); ring.at(spot.x + Math.sin(h0) * (liftZ * 0.5), 0.02, spot.z + Math.cos(h0) * (liftZ * 0.5));
    gps.objective(parts(d.hookObjective || `Back up to **${name}**, then hold **F** to hook it.`, 'green'), { x: cx, z: cz, name }, { blip: false });
    const act = ui.holdAct({ label: `hook up ${name}`, verb: 'Back up to', noun: name, secs: d.secs || 1.2, show: 14, reach: 1.6 });
    W.carF = () => !!M?.tow && M.tow.phase === 'hook' && inCar();
    let last = now();
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        const r = reachOf(), dd = Math.hypot(r.x - st.fx, r.z - st.fz), al = Math.abs(Math.atan2(Math.sin(car.heading - h0), Math.cos(car.heading - h0)));
        const ok = inCar() && Math.abs(car.speed || 0) < 1.2 && al < 0.45;
        M.tow.d = dd; M.tow.al = al;
        return act.step(dt, ok ? dd : Math.max(dd, 1.7), inCar());
      }, t);
    } finally { act.stop(); ring.hide(); app.scene.remove(ring.group); gps.unblip('tow'); gps.clear(); W.carF = null; }
    // the hook-up: the light bar on, the lift out and down under its wheels, then up with its nose
    M.tow.phase = 'hooking';
    rs.setBeacon?.(true); sfx.play('thunk', { gain: 0.25, f: 90 });
    const hk = now(), hold0 = { x: car.position.x, z: car.position.z, h: car.heading };
    await wait(() => {
      const k = (now() - hk) / 1000;
      car.speed = 0; car.position.x = hold0.x; car.position.z = hold0.z; car.heading = hold0.h;
      rig?.set(Math.min(1, k / 0.8), Math.max(0, Math.min(1, (k - 0.9) / 0.8)));
      if (k > 0.9) { const H = rig ? rig.hitch(_tv) : _tv.set(reachOf().x, 0.45 * Math.min(1, (k - 0.9) / 0.8), reachOf().z); const a = Math.min(1, (k - 0.9) / 0.5); st.fx += (H.x - st.fx) * a; st.fz += (H.z - st.fz) * a; st.fy = Math.max(0, H.y - gy(H.x, H.z) - 0.07); pose(0.016); }
      return k > 1.8;
    }, t);
    sfx.play('ding', { gain: 0.22 }); M.log.push(['tow', 'hooked', name]);
    // 3. haul it: the truck slower and heavier
    M.tow.phase = 'haul';
    // (the chase camera back and up over what is on the hook, so the road ahead shows past it)
    const keep = { topSpeed: car.topSpeed, boostSpeed: car.boostSpeed, accel: car.accel, boostAccel: car.boostAccel, mass: car.mass, chaseDistance: car.chaseDistance, chaseHeight: car.chaseHeight };
    Object.assign(car, { topSpeed: keep.topSpeed * 0.72, boostSpeed: keep.boostSpeed * 0.75, accel: keep.accel * 0.6, boostAccel: keep.boostAccel * 0.65, mass: (keep.mass || 2) * 1.6,
      chaseDistance: (keep.chaseDistance || 6) + (T.nose - T.zR) * 0.9 + 1.5, chaseHeight: (keep.chaseHeight || 2) + 1.1 });
    M.towKeep = keep;
    let lastV = car.speed || 0;
    const follow = (dt) => {
      const H = rig ? rig.hitch(_tv) : _tv.set(reachOf().x, gy(reachOf().x, reachOf().z) + 0.5, reachOf().z);
      st.fx = H.x; st.fz = H.z; st.fy = Math.max(0, H.y - gy(H.x, H.z) - 0.07);
      // (the back axle follows the front's along the line between them: a trailer)
      let dx = st.rx - st.fx, dz = st.rz - st.fz, L = Math.hypot(dx, dz) || 1;
      if (L > wb * 3) { dx = -Math.sin(car.heading); dz = -Math.cos(car.heading); L = 1; }
      st.rx = st.fx + dx / L * wb; st.rz = st.fz + dz / L * wb;
      // (into a wall: knocked back out of it)
      const q = { x: st.rx, y: 0, z: st.rz }; cm.resolveHorizontalCollision(q, T.half, 1.0); st.rx = q.x; st.rz = q.z;
      // (the truck's starts and stops rock it on its back springs)
      const acc = dt > 0 ? ((car.speed || 0) - lastV) / dt : 0; lastV = car.speed || 0;
      st.pv += -acc * 0.006; st.spin = car.speed || 0;
      pose(dt);
    };
    let lastF = now(), live = true;
    (function loop() { if (!live) return; const tt = now(), dt = Math.min(0.05, (tt - lastF) / 1000); lastF = tt; if (!W.paused) try { follow(dt); } catch (e) { console.warn('[storyrun] tow', e); } requestAnimationFrame(loop); })();
    try {
      await goTo(dest, { radius: d.radius || 10, stopSpeed: 2.5 }, t, { objective: d.dropObjective || `Tow **${name}** to **${dest.name}**.`, needsCar: true });
      // 4. let it down there
      M.tow.phase = 'drop';
      const k0 = now();
      await wait(() => { const k = (now() - k0) / 1000; car.speed = 0; rig?.set(1, Math.max(0, 1 - k / 0.7)); if (k > 0.8) rig?.set(Math.max(0, 1 - (k - 0.8) / 0.6), 0); return k > 1.5; }, t);
    } finally {
      live = false;
      if (M.towKeep) { Object.assign(car, M.towKeep); M.towKeep = null; }
      rs.setBeacon?.(false); rig?.set(0, 0);
    }
    // (left there, on its wheels, a little back from the truck)
    const bx = Math.sin(st.h), bz = Math.cos(st.h); st.fx -= bx * 0.5; st.fz -= bz * 0.5; st.rx -= bx * 0.5; st.rz -= bz * 0.5; st.fy = 0; st.pitch = 0; st.pv = 0; pose(0);
    parked.push(T); M.towing = null; M.tow = null;
    M.timer.add(d.bonus || 0); if (d.flag) M.state.flags[flagName(d.flag)] = true;
    M.log.push(['tow', 'dropped', name]);
  };

  for (const k of KINDS_STUB) STEPS[k] = async (d) => { if (!M.stubbed.has(k)) { M.stubbed.add(k); console.info(`[storyrun] ${M.def.id}: '${k}' has no Mog City part yet; it passes`); } applySet(d.set); };

  /* ------------------------------------------------------- side steps -- */
  function side(d, hostTok, persist = false) {
    if (d.if && !cond(d.if)) return null;
    const st = tokOf(persist || d.persist || d.until ? M.tok : hostTok);
    const s = { def: d, tok: st, until: typeof d.until === 'string' ? d.until : null };
    M.sides.add(s);
    (async () => {
      try {
        if (d.at) await delay(d.at, st);
        const r = await (d.ref && partOf(d.ref) && d.type !== 'call' ? runPart(d.ref, d, st) : STEPS[d.type](d, st, true));
        if (d.after) applySet(d.after);
        if (r?.end) M.endNow = true;
        if (r?.goto) M.gotoNow = r.goto;
      } catch (e) {
        if (e instanceof Fail) M.fail(e);
        else if (!(e instanceof Stop)) console.warn('[storyrun] side step', d.type, e);
      } finally { M.sides.delete(s); }
    })();
    return s;
  }

  /* --------------------------------------------------------- a mission -- */
  function snapshot(i) {
    const e = cm.getActiveEntity();
    return { i, stats: { ...M.stats }, state: JSON.parse(JSON.stringify(M.state)), timer: { running: M.timer.running, left: M.timer.left, opts: M.timer.opts }, at: { x: e.position.x, z: e.position.z, heading: e.heading, mode: inCar() ? 'car' : 'walk' } };
  }
  function tidy() {
    for (const s of M.sides) kill(s.tok, new Stop());
    M.sides.clear();
    W.calls?.stop({ quiet: true, of: 'pack:' });
    try { M.chase?.stop?.(); } catch {}
    if (M.crew) W.combat?.clear?.();
    hud.clear(); M.timer.stop();
    ui.objective(null); ui.sub(null); ui.help(null); ui.counter(null); ui.caller(null); ui.hold(null); ui.phone?.hide?.(); ui.offer?.(null);
    gps.clear(); app.mapSystem.waypoint = null; for (const id of [...gps.blips.keys()]) gps.unblip(id); marker.hide();
    for (const n of M.npcs) cast.hide(n); M.npcs.clear();
    dropRiders();
    // (a tow cut short: the car on the hook put away, the truck as it was)
    if (M.towing) { app.scene.remove(M.towing.obj); M.towing = null; }
    if (M.towKeep) { Object.assign(car, M.towKeep); M.towKeep = null; }
    M.tow = null; W.carF = null; car.roadster?.tow?.set(0, 0); car.roadster?.setBeacon?.(false);
    // (Mog City's own mission phases it played: their instances stopped, all they put in the world put away)
    for (const mod of M.partMods.values()) try { mod.endParts(W); } catch (e) { console.warn('[storyrun] parts', e); }
    M.partMods.clear();
    app.trafficSystem.hold?.([]);
    if (W.cutscene) W.cutscene = false;
  }

  async function attempt(def, cp, act) {
    const steps = def.steps;
    const find = (id) => steps.findIndex((s) => s.id === id);
    M = {
      def, i: cp ? cp.i : 0, tok: tokOf(), sides: new Set(), npcs: new Set(), stubbed: new Set(), log: [], t0: now(), timer: createTimer(),
      partMods: new Map(), partStats: null, fresh: true, keep: !!cp,
      state: cp ? JSON.parse(JSON.stringify(cp.state)) : { meters: { ...ctx.save.meters }, flags: { ...ctx.save.flags }, forks: {} },
      cp: cp || null, auto: !!ctx.flags.autopilot, stats: cp?.stats ? { ...cp.stats } : { hits: 0, ko: 0 },
      fail(e) { if (!M.tok.dead) kill(M.tok, e instanceof Fail ? e : new Fail(e?.reason || e?.message || String(e), 'timeout')); },
    };
    for (const m of meterDefs()) if (M.state.meters[m.id] == null) M.state.meters[m.id] = m.start ?? 0;
    W.mission = { id: def.id, phase: null, stop: () => kill(M.tok, new Stop()), pack: true };
    showMeters();
    // the mission timer and the countdown's end
    const timerLoop = (async () => {
      try { await wait(() => { const ex = M.timer.tick(); if (ex) { if (ex.fail === 'soft') { if (ex.flag) M.state.flags[flagName(ex.flag)] = true; applySet(ex.set); ui.help(tokens(ex.why || 'Late.'), 4); } else throw new Fail(tokens(ex.why || 'You ran out of time.'), 'time'); } return false; }, M.tok); }
      catch (e) { if (e instanceof Fail) M.fail(e); }
    })();
    if (cp && cp.from) {
      // (a start at a step, Mission select or ?step=: where its `from` puts him)
      const fr = cp.from;
      if (fr.car || fr.dan) { const c = fr.car && placeOf(fr.car), q = fr.dan && placeOf(fr.dan); putAt(W, { ...(c ? { car: [c.x, c.z, c.heading ?? 0] } : {}), ...(q ? { dan: [q.x, q.z, q.heading ?? 0] } : {}) }); if (!q) putPlayer(c, fr.mode || 'car'); }
      else { const p = placeOf(fr); putPlayer(p, (typeof fr === 'object' && fr.mode) || 'walk'); }
      M.cp = snapshot(cp.i);
      // (getIn: a step from his car door, and in he gets, the door up and all: the shipped ?m1=drive's way in, the ride's)
      if (fr.getIn && W.ride?.getIn && !inCar()) { W.ride.getIn(); await wait(() => !W.ride.phase, M.tok).catch(() => {}); }
      if (fr.getIn && !inCar() && fr.car) putPlayer(placeOf(fr.car), 'car');
    } else if (cp) {
      putPlayer(cp.at, cp.at.mode);
      if (cp.timer.running) M.timer.start(cp.timer.left, cp.timer.opts);
    } else {
      M.cp = { ...snapshot(0) };
      if (def.start) { const p = placeOf(def.start); putPlayer(p, (typeof def.start === 'object' && def.start.mode) || (def.vehicle ? 'car' : 'walk')); M.cp = snapshot(0); }
    }
    setTime(def.time || (act?.timeline?.[def.id]?.time) || def0.dressing?.time);
    // (the title card, unless the mission's first scene draws its own: Mog City's opening ends on ACT I · BAGGED)
    if (def.card !== false && !(cp && cp.from)) ui.title(act?.name || '', def.title, ctx.flags.autoCard ? 1.2 : 2.6);
    host.tell('mission-start', { id: def.id, title: def.title });
    let i = M.i;
    while (i < steps.length) {
      const d = steps[i];
      if (d.if && !cond(d.if)) { i++; continue; }
      if (d.checkpoint && (!M.cp || M.cp.i !== i)) M.cp = snapshot(i);
      M.i = i; W.mission.phase = d.id || `${d.type}:${i}`;
      ui.step(`pack:${def.id}:${i}`);
      host.tell('progress', { mission: def.id, step: d.id || null, kind: d.type, i, n: steps.length });
      if (BACKGROUND.has(d.type) && !d.ref) { side(d, M.tok, true); if (d.after) applySet(d.after); i++; continue; }
      // (set dressing a step needs, a Mog City set piece: 'm1.park'; at once, before the step)
      if (d.dress && Object.prototype.hasOwnProperty.call(SCENES, d.dress)) { try { await SCENES[d.dress](W); } catch (e) { console.warn('[storyrun] dress', d.dress, e); } }
      const st = tokOf(M.tok);
      // (the step's help lines, Mog City's tips: [secs in, text, 'car' | 'person' only])
      for (const h of Array.isArray(d.help) ? d.help : []) if (Array.isArray(h)) delay(h[0] || 0, st).then(() => ui.help(parts(String(h[1] || '')), h[3] || 7, h[2] ? { mode: h[2] } : {})).catch(() => {});
      for (const x of d.during || []) side(x, st);
      for (const k of ['trigger', 'comfort', 'patrol', 'stealth']) for (const x of [].concat(d[k] || [])) side({ at: 0, ...x, type: k }, st);
      let r;
      const run = d.ref && partOf(d.ref) && d.type !== 'call' ? runPart(d.ref, d, st) : STEPS[d.type](d, st);
      try { r = (await Promise.race([run, wait(() => M.gotoNow || M.endNow, st).then(() => ({}))])) || {}; }
      finally {
        kill(st, new Stop());
        for (const s of [...M.sides]) if (s.tok.parent === st || (s.until && steps[i + 1]?.id === s.until)) kill(s.tok, new Stop());
      }
      if (deadOf(M.tok)) throw deadOf(M.tok).err || new Stop();
      M.fresh = false;
      if (d.after) applySet(d.after);
      if (M.endNow || r.end || d.end) break;
      const to = M.gotoNow || r.goto || d.goto; M.gotoNow = null;
      const j = to ? find(to) : -1;
      if (to && j < 0) console.warn('[storyrun] no step', to);
      i = j >= 0 ? j : i + 1;
    }
    kill(M.tok, new Stop()); await timerLoop;
    applySet(def.reward);
    // (the card's counts from Mog City's own phases it played: their Suits down, takedowns, rigs, hits)
    const ps = M.partStats;
    if (ps) { M.stats.ko += ps.ko || 0; M.stats.hits += ps.hits || 0; for (const k of ['quiet', 'smashed', 'lookouts']) if (ps[k] != null) M.stats[k] = ps[k]; }
    return { secs: (now() - M.t0) / 1000, stats: M.stats };
  }

  // a mission, with Mog City's fail screen: Retry (from its checkpoint), Quit, and Skip after three fails
  async function play(def, { act = null, from = null } = {}) {
    let cp = null, fails = 0;
    // (?step=<id>: from that step, where its `from` puts him; a dev and Mission select start)
    if (from) { const i = def.steps.findIndex((s) => s.id === from); if (i >= 0) cp = { i, from: def.steps[i].from || def.start, state: { meters: { ...ctx.save.meters }, flags: { ...ctx.save.flags }, forks: {} }, timer: { running: false } }; }
    const reg = registry(W).register({
      id: 'pack:' + def.id, title: def.title, act: act?.name || '',
      checkpoints: [{ id: 'start', label: 'Start' }, ...def.steps.map((s, i) => [s, i]).filter(([s]) => s.checkpoint).map(([s, i]) => ({ id: 'cp' + i, label: s.id || s.type }))],
      active: () => !!M && M.def === def && !M.tok.dead,
      at: () => (M?.cp && M.cp.i > 0 ? 'cp' + M.cp.i : 'start'),
      restart: (id) => { restartTo = id; kill(M.tok, new Stop()); },
    });
    let restartTo = null;
    try {
      for (;;) {
        try {
          const r = await attempt(def, cp, act);
          tidy();
          return { how: 'pass', secs: r.secs, stats: r.stats, state: M.state, log: M.log };
        } catch (e) {
          const at = M; tidy();
          if (restartTo) { cp = restartTo === 'start' ? null : at.cp; restartTo = null; continue; }
          if (!(e instanceof Fail)) { if (!(e instanceof Stop)) console.error('[storyrun]', def.id, e); return { how: 'quit' }; }
          fails++;
          const step = def.steps[at.i];
          host.tell('mission-fail', { id: def.id, why: e.reason, step: step?.id || null, kind: step?.type || null });
          if (!e.sounded) sfx.play('failed');
          if (ctx.flags.autopilot && (ctx.flags.failStop || fails >= 3 || e.kind === 'timeout' || e.kind === 'place')) return { how: 'fail', why: e.reason };
          const pick = ctx.flags.autoRetry ? (await new Promise((r) => setTimeout(r, 1200)), 'retry') : await ui.failed(e.reason, { skip: fails >= 3, tip: e.tip || TIPS[e.kind] || null, retryLabel: at.cp && at.cp.i > 0 ? 'Retry: from the checkpoint' : 'Retry: from the start' });
          if (pick === 'quit') return { how: 'quit' };
          if (pick === 'skip') { cp = { ...at.cp, i: Math.min(def.steps.length, (at.i || 0) + 1) }; continue; }
          cp = at.cp && at.cp.i > 0 ? at.cp : null;
        }
      }
    } finally { registry(W).unregister?.(reg.id); }
  }
  return { play, get M() { return M; }, tidy: () => M && tidy(), say, putPlayer, placeOf, goTo };
}
