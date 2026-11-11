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
//   createRunner(ctx) -> { play(def, { act }) -> Promise<'pass' | 'quit'>, opening(def.opening), stop(), state, M }
// ctx: { W, world, places, cast, hud, host, save, flags: { autoAnswer, autoChoose, autoCard } }
// Every kind of the pack schema is handled; the two with no Mog City part yet (patrol, wallet) say so in the console and
// pass, so a story still plays through (KINDS_STUB). stealth stands Mog City's own lookouts (m2-stealth.js) at the
// story's places; convoy and ally drive the story's own cars through the city (m2-drive.js); roadblock parks cars across
// a street (the GPS routes round it, a ram at speed goes through); passenger has a pick-up, a drop-off and rules. `scene` plays
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
import { createTimers, meterText, deltaText, progress, seen as inSight, band as bandRule, speedRule, MPH } from './rules.js';
import { createSets } from './sets.js';
import { createJuice } from './juice.js';
import { armTo } from '../mission/m3-set.js';

const PI = Math.PI;
export const KINDS_STUB = new Set(['patrol', 'wallet']);
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
// (a stealth with somewhere to get to or a time to last, and a roadblock with somewhere past it, are steps of their own;
// without, they run beside the steps after them until the mission ends)
const background = (d) => BACKGROUND.has(d.type) && !d.ref && !((d.type === 'stealth' && (d.to || d.secs)) || (d.type === 'roadblock' && d.to));
const QUIET_STEPS = new Set(['call', 'wait', 'say', 'choice', 'dm', 'voicemail', 'voicenote']);
const ENDS_WITH_HOST = new Set([...BACKGROUND, 'pursuit', 'beat', 'tail', 'convoy', 'call']);
const TIPS = {
  ko: ['Hit with [J]. When the cue over a man turns ', { yellow: 'yellow' }, ', counter with [Q]; when it is ', { red: 'red' }, ', roll away with [C].'],
  left: ['Stay with the fight until it is over: it is lost past 150 m.'],
  time: ['Take the quickest route: the ', { 'yellow line': 'yellow' }, ' on the radar. Hold [Shift] to boost.'],
  caught: ['Break their line of sight, then keep moving until the search circle runs out.'],
  seen: ['Keep out of the cones on the ground. Go round behind them, or take one down from behind with [E].'],
  // (in a car with no boost, a van or a truck: wagmi/storyrun/ride.js setClass)
  timeSlow: ['Take the quickest route: the ', { 'yellow line': 'yellow' }, ' on the radar, and keep your foot down on the straights.'],
  speed: ['Watch the ', { 'speed limit': 'yellow' }, ' on the right: ease off before it counts.'],
  wreck: ['Give the car room: hold back in the ', { 'band': 'blue' }, ', and brake early when it stops.'],
  lost: ['Stay close enough to keep them in sight, and back off if they slow down.'],
  // (the wild steps: a sneak heard, a flee caught)
  heard: ['Near them, walk: press [Q] and Ranger goes at a walk. Keep the ', { 'NOISE': 'yellow' }, ' bar from filling, and give them a wide berth.'],
  chased: ['Hold [Shift] to gallop and keep to the ', { 'yellow line': 'yellow' }, ': it is never quite as fast as a gallop. Jump what is in the way with [Space].'],
};
class Fail extends Error { constructor(reason, kind = null, o = {}) { super(reason); this.reason = reason; this.kind = kind; this.tip = o.tip || null; this.sounded = !!o.sounded; } }
class Stop extends Error {}

export function createRunner(ctx) {
  const { W, world, places, cast, hud, host } = ctx;
  const app = W.app, cm = app.controllerManager, P = W.person, car = W.car, ui = W.ui, sfx = W.sfx;
  const gps = W.gps || (W.gps = createGPS(W));
  const marker = W.marker || (W.marker = createMarker(THREE, app.scene, { color: '#FFC93C', radius: 3 }));
  // (the action beats' punch: alerts, stings, a beat of slow motion, the clock's red edge: juice.js)
  const juice = W.juice || (W.juice = createJuice(W));
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
  // (the ride's own words where it has them, a horse's 'Mount', 'Ride', 'Halt': wagmi/horse fitHorse; a car's Mog City's)
  const rideWord = (k, dflt) => (car.words && car.words[k]) || dflt;
  const COLOUR6 = /^#[0-9A-Fa-f]{6}$/;
  const tokens = (s) => String(s ?? '')
    .replace(/\{ride\.name\}|\{ride\}/g, car.label || 'your car').replace(/\{ride\.board\}/g, rideWord('board', 'Get in')).replace(/\{ride\.go\}/g, rideWord('go', 'Drive')).replace(/\{ride\.park\}/g, rideWord('park', 'Stop'))
    .replace(/\{name\}/g, heroName);
  // '**bold**' -> Mog City's one coloured noun (yellow: a place); '**bold**{red}' names its colour (yellow, red, blue, green)
  const parts = (s, color = 'yellow') => {
    const out = []; const re = /\*\*(.+?)\*\*(?:\{(yellow|red|blue|green)\})?/g; let at = 0, m; s = tokens(s);
    while ((m = re.exec(s))) { if (m.index > at) out.push(s.slice(at, m.index)); out.push({ [m[1]]: m[2] || color }); at = m.index + m[0].length; }
    if (at < s.length) out.push(s.slice(at));
    return out.length ? out : [s];
  };
  const colorOf = (who) => (who ? cast.color(who) : '#FFFFFF');
  let saying = 0; // (lines being said now: the idle nudge waits for them)
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
    // (a recorded line still playing, a car-phone call's or the last step's, is heard out first, up to 6 s)
    if (W.voice?.left?.() > 0.08) { const t0 = now(); await wait(() => !(W.voice.left() > 0.08) || now() - t0 > 6000, t); }
    const rec = W.voice?.dur?.(who, text) || 0;
    const hold = Math.max(1.4, text.length / 15, rec + 0.15, secs || 0);
    if (phone) W.voice?.fx?.(who, 'phone');
    ui.sub(who || null, text, colorOf(who));
    mumble(who, text, hold);
    M?.log.push(['say', who, text]);
    saying++;
    try { await delay(hold, t); } finally { saying--; ui.sub(null); if (phone) W.voice?.fx?.(who); }
    await delay(0.25, t);
  }
  const tuple = (l) => (Array.isArray(l) ? { who: l[0], text: l[1], secs: l[2] } : l);
  // the runner pack writes call speakers upper-cased: back to the cast's own name
  const castName = (w) => { if (!w) return w; if (world.castOf(w)) return w; const k = Object.keys(def0.cast || {}).find((n) => n.toUpperCase() === String(w).toUpperCase()); return k || w; };

  /* ---------------------------------------------------------- state and sets -- */
  const meterDefs = () => (def0.hud?.meters || []);
  // the world's meters on the HUD (rules.js meterText: money with commas, and its goal: '$430,000 / $1,000,000', its
  // progress under it); from = a mission's state, or the save between missions
  function showMeters(from = M?.state.meters, hiddenIds = M?.def.hiddenMeters) {
    const hidden = new Set(hiddenIds || []);
    hud.meters(meterDefs().filter((m) => m.kind !== 'hidden' && !hidden.has(m.id)).map((m) => {
      const v = Math.round(from?.[m.id] ?? m.start ?? 0);
      return { label: m.label || m.id, text: meterText(m, v), k: progress(m, v) };
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
      // (a change while he plays, flashed beside the meter: '+$85,000', '-$5,000'; with a till's ring for money)
      if (M.live && md && md.kind !== 'hidden' && Math.round(next - cur)) { hud.delta?.(md.label || md.id, deltaText(md, next - cur), next > cur); if (md.kind === 'money') sfx.play(next > cur ? 'ding' : 'thunk', next > cur ? { gain: 0.22 } : { gain: 0.2, f: 110, ring: false }); }
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
  const TIME_IDS = { dusk: 'twilight', night: 'midnight', day: 'midday', morning: 'golden', dawn: 'twilight' };
  const setTime = (id) => { try { if (id) app.selectTime(TIME_IDS[id] || id); } catch {} };
  // a mission's own time of day (its `time`, or its act's timeline's) is pinned: held through its cutscenes and Mog City's
  // set pieces (which set their own: twilight, golden), put back the moment anything else changes it; a step's own time
  // (place, transition, scene) moves the pin. A mission without one keeps the city's time as its scenes leave it
  const pinTo = (id) => { if (M) M.pin = id ? (TIME_IDS[id] || id) : null; if (id) setTime(id); };
  function holdPin() {
    if (!M?.pin || M.inScene) return;
    const cur = app.lightingSystem?.activePresetId;
    if (cur && cur !== M.pin) setTime(M.pin);
  }

  /* ---------------------------------------------------------- the timer -- */
  // the mission's timers (rules.js createTimers), by name: a timer step starts one ('mission' when it names none), and it
  // runs across the steps after it until a timer step stops it, the mission ends, or it runs out: a hard one fails the
  // mission, a soft one costs its set (money off the meter) and runs on as LATE. The HUD shows the soonest to run out,
  // its last ten seconds red, pulsing and ticking. Paused in the pause menu and in cutscenes.
  function createTimer() {
    const TT = createTimers();
    let last = now(), tickAt = -1;
    const T = {
      timers: TT,
      get running() { return TT.running; },
      start: (secs, o = {}, name = 'mission') => TT.start(name, secs, o),
      stop: (name = null) => { TT.stop(name); if (!TT.running) hud.timer(null); },
      add: (s, name = null) => TT.add(name, s),
      tick() {
        const t = now(), dt = (t - last) / 1000; last = t;
        if (!TT.running || W.paused || W.cutscene) return [];
        const out = TT.tick(dt), sh = TT.shown();
        if (!sh) hud.timer(null);
        else if (sh.late) hud.timer(sh.over, sh.opts.lateLabel || sh.opts.label || 'LATE', true);
        else {
          hud.timer(sh.left, sh.opts.label || 'TIME');
          const sec = Math.ceil(sh.left); if (sh.left <= 10 && sec !== tickAt) { tickAt = sec; sfx.play('thunk', { gain: 0.12, f: 880, ring: false }); if (sh.opts.fail !== 'soft') juice.pulse(1 - sh.left / 10); }
        }
        return out;
      },
    };
    return T;
  }

  /* --------------------------------------------------------------- the steps -- */
  const STEPS = {};
  // place: the player there (in the car, or on foot), the time of day
  STEPS.place = async (d) => { const p = placeOf(d.at); putPlayer(p, (typeof d.at === 'object' && d.at.mode) || (M.def.vehicle ? 'car' : 'walk')); if (d.time) { if (M.pin) pinTo(d.time); else setTime(d.time); } M.timer.add(d.bonus || 0); };
  STEPS.say = async (d, t) => { const who = castName(d.who); if (d.wait === false) { say(who, d.text, M.tok, { secs: d.secs }).catch(() => {}); return; } await say(who, d.text, t, { secs: d.secs }); };
  // (a wait for the calls, call: true: up to secs, over once the car phone is done and no call that rang beside the
  // step before (a persist call waiting, Delgado ringing mid-chase) is still being said)
  const ringingBeside = () => [...M.sides].some((s) => s.def.type === 'call' && !(s.def.inCar || (s.def.auto && !s.def.interrupts)) && !deadOf(s.tok));
  STEPS.wait = async (d, t) => { const end = now() + (d.secs || 0) * 1000; await wait(() => now() >= end || (d.call && !W.calls?.live && !ringingBeside() && now() > end - (d.secs || 0) * 1000 + 300), t); };
  STEPS.dm = async (d, t) => { sfx.play('ding', { gain: 0.3 }); ui.dm(d.from || d.name || 'Unknown number', tokens(d.text), d.secs || 8); M.log.push(['dm', d.from, d.text]); await delay(d.wait ? (d.secs || 8) : 1.2, t); };
  STEPS.set = async (d) => applySet(d.set);
  STEPS.label = async (d) => { M.state.label = d.label; };
  STEPS.goto = async (d) => ({ goto: d.to });
  STEPS.end = async (d) => { if (d.fail) throw new Fail(tokens(d.fail)); return { end: true }; };
  // timer: { name, seconds, label, fail: hard | soft, why, set, flag, lateLabel } starts one; { name, stop: true } stops
  // it (every one when it names none); { name, add: s } puts seconds on (or, negative, takes them off) a running one
  STEPS.timer = async (d) => {
    const name = d.name || 'mission';
    if (d.stop) { M.timer.stop(d.name || null); return; }
    if (d.add != null && d.seconds == null) { M.timer.add(d.add, name); return; }
    const secs = value(d.seconds, M.state, ctx.save.done) || 60;
    M.timer.start(secs, { label: d.label, fail: d.fail || 'hard', why: d.why, flag: d.flag, set: d.set, lateLabel: d.lateLabel }, name);
    // (a clock that fails the mission says so as it starts: its label, its time, and what running out costs)
    if ((d.fail || 'hard') === 'hard' && d.label) juice.alert(`${d.label} · ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`, { sub: d.why ? tokens(d.why) : '', tone: 'yellow', sting: 'up', secs: 2.8 });
  };

  // drive: the corona, the GPS ('get there' the Mog City way: gps.drive), there inside the radius and slowed down
  async function goTo(p, d, t, { name = p.name, objective = null, onFoot = 250, needsCar = false } = {}) {
    const radius = d.radius || 8, stopV = d.stopSpeed ?? 4;
    marker.at(p.x, groundY(p.x, p.z), p.z); M.dest = p;
    const dest = { x: p.x, z: p.z, name };
    const nav = gps.drive({ dest, objective: objective ? parts(objective) : ['Go to ', { [name]: 'yellow' }, '.'], onFoot, needsCar });
    M.nav = nav;
    // (the metres left along the route, told to a framing GameMog each second as a tail's are: a long leg or a long chase
    // to a place is progress, not stuck. 7 Nov: PT-11's pursuit to Bryant Park ran 137 s, past the test drive's 90 s,
    // and every Mog of Pickup Time and a Create's chase to the precinct were stopped there)
    let told = 0;
    try {
      await wait(() => {
        nav.step();
        const tt = now();
        if (tt - told > 1000) { told = tt; const q = me(), L = gps.length; host.tell('progress', { mission: M.def?.id, step: d.id || null, kind: d.type, i: M.i, n: M.def?.steps.length, left: Math.max(0, Math.round(Number.isFinite(L) && L > 0 ? L : dist(q, p.x, p.z))) }); }
        if (inCar()) return dist(car.position, p.x, p.z) < radius && (d.stop === false || Math.abs(car.speed) < stopV);
        return dist(P.position, p.x, p.z) < Math.max(3, radius * 0.75);
      }, t);
    } finally { nav.stop(); M.nav = null; M.dest = null; marker.hide(); gps.clear(); }
    if (inCar() && d.stop !== false) { car.speed = 0; car.vx = car.vz = 0; car.angularVel = 0; }
    // (the arrival's ding and place card, unless a scene straight after is the arrival: card false)
    if (d.card !== false) { sfx.play('ding', { gain: 0.22 }); ui.place(name, '', 3); if (M) M.cardAt = now(); }
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
    try { await goTo(p, d, t, { objective: d.objective || `${rideWord('go', 'Drive')} to **${p.name}**.` }); } finally { blipOn = false; if (bl) gps.unblip('tag'); }
    M.timer.add(d.bonus || 0);
    if (d.stopTimer) M.timer.stop(d.stopTimer === true ? null : d.stopTimer);
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
      const horse = car.kind === 'horse';
      gps.objective(horse ? ['Get down from ', { [car.label || 'your horse']: 'blue' }, '.'] : ['Get out of your ', { car: 'blue' }, '.'], null);
      ui.help(horse ? 'Press [F] to dismount.' : 'Press [F] to get out.', 8);
      await wait(() => !inCar() && !W.ride?.phase, t);
    }
    if (d.enterCar) {
      const horse = car.kind === 'horse';
      gps.objective(d.objective ? parts(d.objective, 'blue') : horse ? [`${rideWord('board', 'Mount')} `, { [car.label || 'your horse']: 'blue' }, '.'] : ['Get in your ', { [car.label || 'car']: 'blue' }, '.'], { follow: () => car.position, name: car.label });
      gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name: car.label });
      ui.help(horse ? 'Press [F] to mount.' : 'Press [F] to get in a vehicle.', 8);
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
    // (the route and the blip lead to that same spot: they went to the place's lane point, up to 7 m off the corner's
    // centre, so the autopilot stood at the lane point beside a ring it never reached; MCM, 5 Nov: a Mog of Mog City's
    // own story stuck at Mission 1's '@chelseapark' van search)
    gps.objective(parts(d.objective || `Search **${d.label}**.`, 'green'), { x: hx, z: hz, name: d.label }, { blip: false });
    gps.blip('search', { x: hx, z: hz, kind: 'object', edge: true, name: d.label });
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
    // (back on his feet after a fight in his own body: STEPS.fight puppet)
    cast.get(who)?.restore?.();
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
    // (a shot in a set: its own room's points, sets.js)
    if (setRun?.active) return setRun.point(ref, fallbackUp);
    // (a point the runner works out itself: a boss's wake beat)
    if (Array.isArray(ref) && ref.length === 3) return ref;
    const e = cm.getActiveEntity();
    if (!ref || ref === 'player') return [e.position.x, e.position.y + (inCar() ? (car.kind === 'horse' ? 2.55 : 1.2) : 1.55), e.position.z];
    if (typeof ref === 'string' && ref.startsWith('@')) { const p = places.at(ref); if (p) return [p.cx ?? p.x, cm.getGroundHeight(p.cx ?? p.x, p.cz ?? p.z, 'person') + fallbackUp, p.cz ?? p.z]; }
    if (typeof ref === 'object' && ref.rel) {
      const fig = ref.rel !== 'player' ? cast.get(castName(ref.rel)) : null;
      const base = fig ? fig.head(_v) : _v.set(e.position.x, e.position.y + (inCar() ? (car.kind === 'horse' ? 2.55 : 1.2) : 1.55), e.position.z);
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
  // (a shot's warm: true, a scene's tender moment: the key a low sun's amber, stronger, and kept on the people in a
  // wider shot too)
  function keyLight(p, l, warm = false) {
    const dx = p[0] - l[0], dz = p[2] - l[2], dy = p[1] - l[1], n = Math.hypot(dx, dy, dz) || 1, h = Math.hypot(dx, dz) || 1;
    const fx = dx / h, fz = dz / h, out = Math.min(1.9, n * 0.9);
    keyL.position.set(l[0] + fx * out - fz * 0.8, l[1] + 0.5, l[2] + fz * out + fx * 0.8);
    // (at night a lamp, a doorway, headlights: the face's key is warmer and stronger, and a wide shot keeps a softer
    // practical on its people, 2 m out, so the cast reads on a night street)
    const nt = W.storyrun?.nightLit?.night?.() || 0;
    keyL.color.set(nt > 0.5 ? '#FFD9AE' : '#FFE6CC'); keyL.distance = n < 6 ? 4.5 : 9;
    keyL.intensity = n < 6 ? 2.6 * (1 + 0.9 * nt) : 3.2 * nt;
    if (warm) { keyL.color.set('#FFB27A'); keyL.intensity = n < 6 ? 3.4 * (1 + 0.6 * nt) : 7; keyL.distance = n < 6 ? 5 : 11; }
    return n;
  }
  // (opening: the world's opening (opening()), its shots' place card, title and name cards played as Mog City's opening
  // plays them; never on a mission's cutscene)
  // a cutscene staged in a set (sets.js: Mr. Big's study's way, a room of its own drawn in place of the city's frame),
  // made the first time a world asks for one; on the street, the traffic is held clear round the hero for it (nobody
  // is driven through), and let go after
  let setRun = null;
  const setsOf = () => setRun || (setRun = createSets(W, { cast, castName, heroName, idleOf: (n) => world.castOf(n)?.idle || null }));
  function holdStreet() {
    const e = cm.getActiveEntity(), x = e.position.x, z = e.position.z;
    try { app.trafficSystem.hold?.([{ minX: x - 45, maxX: x + 45, minZ: z - 45, maxZ: z + 45 }]); } catch {}
    return () => { try { app.trafficSystem.hold?.([]); } catch {} };
  }
  // (a cutscene on the street on foot: the hero and whoever stands with him are walked up onto the pavement first, the
  // same step for all of them so they keep their places to each other, each then onto the kerb's paving if still off
  // it; the road's own sidewalk map: road-network.js onSidewalk)
  function toPavement() {
    const net = app.trafficSystem?.network; if (!net?.onSidewalk || inCar()) return;
    // (on the paving: off every roadway, curb to curb, past the ends of its block into the crossing too, and on the
    // map's sidewalk where it has one)
    const onRoad = (x, z) => { for (const e of net.edges || []) { if (!e.len) continue; const qx = x - e.sx, qz = z - e.sz, al = qx * e.dx + qz * e.dz; if (al < -12 || al > e.len + 12) continue; if (Math.abs(qx * e.rx + qz * e.rz) < (e.half || 4) + 0.6) return true; } return false; };
    const on = (x, z) => { try { return !onRoad(x, z) && (!!net.onSidewalk?.(x, z) || !!net.walkable?.(x - 0.35, x + 0.35, z - 0.35, z + 0.35)); } catch { return true; } };
    const near = (x, z) => { if (on(x, z)) return [x, z]; for (let r = 0.5; r <= 22; r += 0.5) for (let a = 0; a < 24; a++) { const q = (a * PI) / 12, px = x + Math.cos(q) * r, pz = z + Math.sin(q) * r; if (on(px, pz)) return [px, pz]; } return null; };
    const hx = P.position.x, hz = P.position.z, hp = near(hx, hz); if (!hp) { console.warn('[storyrun] pavement: none within 22 m of', Math.round(hx), Math.round(hz)); return; }
    let dx = hp[0] - hx, dz = hp[1] - hz;
    if (dx || dz) { const n = Math.hypot(dx, dz), ex = hp[0] + (dx / n) * 1.0, ez = hp[1] + (dz / n) * 1.0; if (on(ex, ez)) { hp[0] = ex; hp[1] = ez; } dx = hp[0] - hx; dz = hp[1] - hz; putAt(W, { dan: [hp[0], hp[1], P.heading] }); }
    for (const n of M?.npcs || []) {
      const f = cast.get(n); if (!f || !f.root.visible) continue;
      const q = near(f.root.position.x + dx, f.root.position.z + dz); if (!q) continue;
      f.at(q[0], q[1], Math.atan2(hp[0] - q[0], hp[1] - q[1]));
    }
    app.cameraSystem.resetForTeleport?.();
  }
  // a street cutscene's people moved by its shots (`act` on a shot, as a set's: [{ who, walk: { to, secs, after, clip },
  // face, hug }]): `walk.to` a point as a camera's ({ rel: 'player' | <who>, fwd, right }), walked or run there over
  // `secs` (clip 'run' | 'walk'), then stood; `hug: 'player' | <who>` their arms round that one's upper back (a two-bone
  // reach on the clip, every frame after it, as sets.js hugs), `hug: null` lets go; `face` turns them to someone.
  // The people stay as they are left until the step's cutscene ends (cast.hide at the mission's end lets them go).
  const MH_ARM = ['upperarm01_', 'lowerarm01_', 'wrist_'];
  const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _h3 = new THREE.Vector3(), _hf = new THREE.Vector3(), _hr = new THREE.Vector3();
  const bonesOf = (who) => (who === 'player' || who === heroName ? W.dan?.bones : cast.get(castName(who))?.bones) || null;
  const rootOf = (who) => (who === 'player' || who === heroName ? P.position : cast.get(castName(who))?.root.position) || null;
  // (hug: one name, both arms round that one; or { L: <who>, R: <who> }, an arm round each, as a father holds his wife
  // and his daughter at once. Each arm comes round over half a second from when its own one is first named: t0 per side)
  function hugArms(fig, hug, t0) {
    const B = fig.bones; if (!B) return;
    for (const [side, sg] of [['L', 1], ['R', -1]]) {
      const who = typeof hug === 'string' ? hug : hug?.[side]; if (!who) continue;
      const ob = bonesOf(who); if (!ob) continue;
      const sp = ob.spine03 || ob.spine02 || ob.neck01; if (!sp) continue;
      const ts = typeof t0 === 'number' ? t0 : t0?.[side] ?? now();
      const u = Math.min(1, Math.max(0, (now() - ts) / 550)), k = 0.95 * u * u * (3 - 2 * u);
      let hw = 0.17; if (ob.upperarm01_L && ob.upperarm01_R) { ob.upperarm01_L.getWorldPosition(_h1); ob.upperarm01_R.getWorldPosition(_h2); hw = Math.min(0.24, Math.max(0.1, _h1.distanceTo(_h2) / 2)); }
      sp.getWorldPosition(_h1);
      // (a child's spine bone sits near her back, a grown-up's mid-chest: the hands go to the back's surface either way)
      const orr = rootOf(who), small = !!orr && _h1.y - orr.y < 1.15;
      const dx = _h1.x - fig.root.position.x, dz = _h1.z - fig.root.position.z, n = Math.hypot(dx, dz) || 1;
      _hf.set(dx / n, 0, dz / n); _hr.set(_hf.z, 0, -_hf.x);
      // (someone shorter reaches round lower: the hands under the other's shoulder blades, not above their own head)
      const myTop = (B.neck01 ? B.neck01.getWorldPosition(_h3).y : fig.root.position.y + 1.5);
      if (_h1.y > myTop - 0.12) _h1.y = myTop - 0.12;
      // (an arm round one of two goes round that one's far side: across their back to the shoulder blade away from him)
      // (an arm round one of two: the hand on that one's back by the spine, the arm across their near side)
      const one = typeof hug === 'string', reach = sg * hw * (one ? 0.6 : 0.3), back = small ? hw * 0.12 : hw * (one ? 0.62 : 0.95);
      // (round a child: high across her shoulder blades, just under her neck, the hands on her back where they are seen
      // from behind her, the forearms over her shoulders' backs; not down at her waist, his arms hanging)
      if (small) { const nk = ob.neck01 || ob.neck02; if (nk) { nk.getWorldPosition(_h3); _h1.y = Math.max(_h1.y, _h3.y - 0.13); } }
      const tg = _h2.copy(_h1).addScaledVector(_hf, small ? hw * 0.55 : back).addScaledVector(_hr, small ? sg * hw * 0.5 : reach); tg.y += side === 'L' ? 0.035 : -0.045;
      const pole = new THREE.Vector3().copy(_h1).addScaledVector(_hf, -0.15).addScaledVector(_hr, sg * (hw + 0.55)); pole.y = tg.y - (small ? 0.05 : 0.25);
      try { armTo(B, side, tg.clone(), pole, k, MH_ARM); } catch {}
    }
  }
  // (the hero's own arms in a street cutscene: { who: <hero>, hug, after } held over his clip each frame (W.dan.post,
  // after his pose), let go when the cutscene ends (heroHug(null)))
  let heroHugOn = null;
  function heroHug(hug, after = 0) {
    const Q = W.dan; if (!Q) return;
    if (!hug) { heroHugOn = null; if (Q.post === heroPost) Q.post = null; return; }
    const at = now() + after * 1000, prev = heroHugOn, t0 = {};
    for (const side of ['L', 'R']) { const who = typeof hug === 'string' ? hug : hug[side]; const was = prev && (typeof prev.hug === 'string' ? prev.hug : prev.hug?.[side]); t0[side] = was && was === who ? prev.t0[side] : at; }
    heroHugOn = { hug, t0, at };
    Q.post = heroPost;
  }
  const heroFig = { get bones() { return W.dan?.bones; }, root: P };
  function heroPost() {
    const h = heroHugOn; if (!h || !W.cutscene) return;
    // (until its own moment, the hug before it is kept: a hand that was round her stays round her)
    if (now() < h.at && h.prev) { hugArms(heroFig, h.prev.hug, h.prev.t0); return; }
    hugArms(heroFig, h.hug, h.t0);
  }
  function playClip(fig, name) {
    if (fig.play) return fig.play(name);
    const R = fig.native?.rig, have = fig.native?.clips || [];
    if (R && have.includes(name)) { try { R.set([[0, name]]); return true; } catch {} }
    return false;
  }
  function streetAct(list) {
    for (const a of list || []) {
      if (!a || typeof a.who !== 'string') continue;
      if (a.who === 'player' || castName(a.who) === heroName) { if ('hug' in a) { const prev = heroHugOn; heroHug(a.hug, a.after || 0); if (heroHugOn && prev && a.after) heroHugOn.prev = prev; } continue; }
      const fig = cast.get(castName(a.who)); if (!fig) continue;
      const faceTo = (who) => { const q = rootOf(who); if (q) { fig.heading = Math.atan2(q.x - fig.root.position.x, q.z - fig.root.position.z); fig.root.rotation.y = fig.heading; } };
      if (a.face) faceTo(a.face);
      let walking = null;
      if (a.walk && a.walk.to) {
        const to = camPt(a.walk.to), x0 = fig.root.position.x, z0 = fig.root.position.z, t0 = now() + (a.walk.after || 0) * 1000, dur = Math.max(0.3, a.walk.secs || 1.2) * 1000;
        walking = { to, x0, z0, t0, dur, started: false };
      }
      const hug = 'hug' in a ? a.hug : undefined;
      let hugT = null;
      fig.post = (dt) => {
        if (walking) {
          const tt = now(); if (tt < walking.t0) return;
          if (!walking.started) { walking.started = true; playClip(fig, a.walk.clip || 'run'); }
          const u = Math.min(1, (tt - walking.t0) / walking.dur), e = 1 - (1 - u) * (1 - u);
          const x = walking.x0 + (walking.to[0] - walking.x0) * e, z = walking.z0 + (walking.to[2] - walking.z0) * e;
          fig.heading = Math.atan2(walking.to[0] - walking.x0, walking.to[2] - walking.z0);
          fig.root.position.set(x, cm.getGroundHeight(x, z, 'person'), z); fig.root.rotation.y = fig.heading;
          if (u >= 1) { walking = null; playClip(fig, 'idle'); if (hug) faceTo(hug); }
          return;
        }
        if (hug) { if (hugT == null) { hugT = now(); faceTo(hug); } hugArms(fig, hug, hugT); }
      };
      if (hug === null && !walking) fig.post = null;
    }
  }
  async function shotList(shots, t, { skippable = true, beat = false, opening = false, set = null } = {}) {
    const D = createDirector(W);
    const ssr0 = ssrOf()?.intensity.value ?? 0;
    W.cutscene = !beat;
    // (a recorded line still playing, a car-phone call's or the last step's, is heard out before the first shot, up to
    // 4 s: the cutscene's first line cut it with a second left, PT-3's 'Dino sticker' as the minivan scene began. The
    // scene is on first, so a call hangs up after the line it is saying and starts no other: calls.js end())
    if (!beat && W.voice?.left?.() > 0.08) { const t0 = now(); try { await wait(() => !(W.voice.left() > 0.08) || now() - t0 > 4000, t); } catch (e) { W.cutscene = false; throw e; } }
    if (!beat) { ui.cine(true); ui.objective(null); }
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
        // (the shot's set: its own, else the cutscene's; false or none, the street)
        if (setRun) { const id = s.set === false ? null : (s.set || set); setRun.use(id && setRun.has(id) ? id : null); if (s.act) setRun.act(s.act); }
        // (on the street: the shot's changes to the people in it, a run to someone and a hug: streetAct)
        if (s.act && !setRun?.active) streetAct(s.act);
        const dur = s.dur || 3, A = camPt(s.cam), B = s.to ? camPt(s.to) : A, LA = camPt(s.look, 1.4), LB = s.lookTo ? camPt(s.lookTo, 1.4) : LA;
        // (an opening's name card: the lens settles on its person through the first part of the shot, then the frame
        // freezes on them, their body held mid-move, as their name and role come up: openCard())
        const card = opening && s.card && s.card.who ? s.card : null, hold = card ? Math.min(dur * 0.42, 1.6) : dur;
        const pos = keys([[0, A], [hold, B]]), look = keys([[0, LA], [hold, LB]]);
        const t0 = now();
        const sub = s.sub && (Array.isArray(s.sub) ? s.sub : ['', s.sub]);
        if (s.caption) ui.caption(s.caption, '', '#FFC93C', Math.min(dur, 3));
        let frozen = null;
        if (opening) openBeat(s, dur);
        if (s.say && Array.isArray(s.say)) { const [w, x] = s.say; ui.sub(castName(w), tokens(x), colorOf(castName(w))); mumble(castName(w), x, dur); }
        else if (sub && sub[1]) { const w = castName(sub[0]); ui.sub(w || null, tokens(sub[1]), colorOf(w)); if (w) mumble(w, sub[1], dur); M?.log.push(['say', w, sub[1]]); }
        else if (s.text) ui.sub(null, tokens(s.text));
        const len = Math.max(dur, sub && sub[1] ? Math.max(1.4, sub[1].length / 15, (W.voice?.dur?.(castName(sub[0]), tokens(sub[1])) || 0) + 0.15) : 0);
        try {
          await wait(() => {
            const k = Math.min(dur, (now() - t0) / 1000), still = card && k >= hold, hh = handheld(k + t0 / 1000, still ? 0 : 0.4);
            if (still && !frozen) frozen = openCard(card, dur - hold);
            const p = pos(Math.min(k, hold)), l = look(Math.min(k, hold));
            D.camera = { pos: [p[0] + hh.x, p[1] + hh.y, p[2]], look: l, fov: s.fov || 40, roll: 0, shake: hh };
            if (setRun?.active) setRun.frame({ pos: D.camera.pos, look: l, fov: s.fov || 40 });
            { const n = keyLight(p, l, !!s.warm), ssr = ssrOf(); if (ssr) ssr.intensity.value = n < CLOSE ? 0 : ssr0; }
            if (!beat) stepSkip();
            return (now() - t0) / 1000 >= len;
          }, local);
        } catch (e) { if (!(e instanceof Stop) || !skip) throw e; }
        finally { frozen?.(); if (opening && s.title) ui.gameTitle(false); }
        ui.sub(null);
      }
    } finally {
      ui.sub(null); ui.caption(null); ui.skip(null); keyL.intensity = 0; if (ssrOf()) ssrOf().intensity.value = ssr0;
      if (!beat) heroHug(null);
      setRun?.use(null);
      if (opening) { ui.placeOff(); ui.gameTitle(false, true); }
      if (!beat) D.block(false);
      await D.release(0.6);
      W.cutscene = false; if (!beat) ui.cine(false);
    }
  }
  /* ------------------------------------------------------------- the opening -- */
  // A world's opening (def.opening), played once before Mission 1 as Mog City's own opening plays (intro.js): the city
  // first, with the place card (ui.place: 'Murray Hill' / 'E 37th St · Midtown · 5:45 PM'), the people who matter each
  // brought on with a name card (ui.caption: the name in white, the role in their colour, as 'Dan / the fall guy' and
  // 'The Suits / Knox & Hooks · JPBank security'), here on a held frame, the premise in a few spoken lines, and the
  // world's title in its own lockup (the start gate's: title.js). Hold Space to skip, as every cutscene.
  //   opening: { place, time, stage: [{ who, at: '@place' | { rel: 'player', right, fwd }, heading }], shots: [{ cam,
  //              to, look, lookTo, dur, fov, sub: [who, text], where: { name, sub }, card: { who, role }, title }] }
  // The hero stands at `place` on foot by the car; each staged person is stood where `at` says, facing the hero when
  // near him (else along the place); all of them are put away after it (a mission stands its own people up).
  function openBeat(s, dur) {
    if (s.where && s.where.name) { ui.place(tokens(s.where.name), tokens(s.where.sub || ''), Math.min(dur, 4.6)); sfx.play('stinger', { gain: 0.3 }); }
    if (s.title) { ui.gameTitle(true); sfx.play('whoosh', { gain: 0.2 }); sfx.play('stinger', { gain: 0.42, notes: [130.81, 155.56, 196, 261.63] }); }
  }
  function openCard(card, secs) {
    const who = castName(card.who), hero = cast.isHero(who) || who === heroName, inSet = setRun?.active ? setRun.figure(who) : null, fig = inSet || cast.get(who);
    // (the card above the subtitle line, which sits where Mog City's captions do: its line is said under it)
    const capEl = document.querySelector('#wg .wg-cap'); if (capEl) capEl.style.bottom = 'calc(var(--bar) + 10vh + 92px)';
    ui.caption(who, tokens(card.role || world.castOf(who)?.role || ''), colorOf(who), Math.max(1.2, secs + 0.2));
    sfx.play('thunk', { gain: 0.16, f: 140, ring: false }); sfx.play('whoosh', { gain: 0.12, dur: 0.35 });
    // (the frame held: their clip stopped where it was, the lens still)
    const mixer = hero && !inSet ? W.dan?.mixer : null, ts = mixer ? mixer.timeScale : 1;
    if (fig) fig.hold = true; if (mixer) mixer.timeScale = 0;
    return () => { if (fig) fig.hold = false; if (mixer) mixer.timeScale = ts; setTimeout(() => { if (capEl && !capEl.classList.contains('on')) capEl.style.bottom = ''; }, 600); };
  }
  async function opening(o, { time = null } = {}) {
    const t = tokOf(null), staged = [];
    if (o.place) putPlayer(placeOf(o.place), 'walk');
    // (its own time, else Mission 1's: index.js firstTime)
    if (o.time || time) setTime(o.time || time);
    const e = cm.getActiveEntity();
    for (const s of o.stage || []) {
      const who = castName(s.who);
      if (!who || cast.isHero(who) || who === heroName) continue;
      let x, z, h = null;
      if (s.at && s.at.rel === 'player') {
        const hh = e.heading, r = s.at.right || 0, f = s.at.fwd || 0;
        x = e.position.x - Math.cos(hh) * r + Math.sin(hh) * f; z = e.position.z + Math.sin(hh) * r + Math.cos(hh) * f;
      } else { const p = places.at(s.at); if (!p) { console.warn('[storyrun] opening: no place', s.at); continue; } x = p.x; z = p.z; h = p.heading ?? 0; }
      if (s.heading != null) h = (s.heading * PI) / 180;
      else if (h == null || Math.hypot(e.position.x - x, e.position.z - z) < 30) h = Math.atan2(e.position.x - x, e.position.z - z);
      try { const fig = await cast.spawn(who, { x, z, heading: h }); if (fig) staged.push(who); } catch (err) { console.warn('[storyrun] opening: cast', who, err); }
    }
    // (its sets, stood up and compiled before the first shot; the street round the hero held clear of traffic)
    if (o.sets && Object.keys(o.sets).length) try { await setsOf().prepare(o.sets); } catch (err) { console.warn('[storyrun] opening: sets', err); }
    // (the hero stays where the world's wide shots are framed on him, by his car, and the traffic is held off him: the
    // people who talk are in the sets)
    const free = holdStreet();
    host.tell('opening', { phase: 'start', shots: (o.shots || []).length });
    const t0 = now();
    try { await shotList(o.shots || [], t, { opening: true }); }
    finally {
      free(); if (setRun) await setRun.release();
      // (to black, and back up on Mission 1 once it has put him at its start)
      try { await ui.fade(1, 0.45); } catch {}
      setTimeout(() => ui.fade(0, 0.8), 650);
      for (const n of staged) { const f = cast.get(n); if (f) f.hold = false; cast.hide(n); }
      { const c = document.querySelector('#wg .wg-cap'); if (c) c.style.bottom = ''; }
      host.tell('opening', { phase: 'end', secs: Math.round((now() - t0) / 1000) });
    }
  }
  STEPS.cutscene = async (d, t) => {
    if (d.place) { const p = placeOf(d.place); putPlayer(p, inCar() ? 'car' : 'walk'); }
    // (in a set: its room and its people; else on the street with the traffic held)
    if (d.set && typeof d.set === 'object') {
      try { await setsOf().prepare({ cut: d.set }); } catch (err) { console.warn('[storyrun] set', err); }
      try { await shotList(d.shots, t, { set: 'cut' }); } finally { await setRun?.release(); }
      return;
    }
    const free = holdStreet();
    try { toPavement(); } catch (err) { console.warn('[storyrun] pavement', err); }
    try { await shotList(d.shots, t); } finally { free(); }
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
      if (d.time) { if (M.pin) pinTo(d.time); else setTime(d.time); } applySet(d.set);
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
    // call waiting (interrupts: true): a call that rings while a car-phone call is on comes up as a second card, CALL
    // WAITING; answered, the live call goes on hold (its pause line, as when he gets out: calls.js hold), this one is
    // said on the phone, then the live one is back (its resume line) and goes on from where it was; declined (or not
    // answered), its voicemail, and the live call never stopped
    // (a ride-along call of the step before still finishing (calls.js def.finish): it hangs up after the line it is
    // saying, then this one rings; a call waiting is the exception, it holds the call instead)
    if (!d.interrupts && !ride && W.calls?.yieldFinishing?.()) { const t0 = now(); await wait(() => !W.calls.state()?.finishing || now() - t0 > 9000, t); await delay(0.4, t); }
    // (a ride-along call of this step still ringing, or about to (rung after the car rolls, 1.5 s of ringing): it is
    // given up to 6 s to be answered, so the call waiting finds it on the line instead of ringing over it)
    if (d.interrupts && W.calls?.state) {
      const pending = () => { const s = W.calls.state(); return !!s?.id && String(s.id).startsWith('pack:') && (s.state === 'wait' || s.state === 'ring'); };
      if (pending()) { const t0 = now(); await wait(() => !pending() || now() - t0 > 6000, t); }
    }
    if (d.interrupts && W.calls?.live && W.calls.state?.()?.state === 'talk') return callWaiting(d, t, who, color, lines);
    // (the car phone: an inCar call, or one that answers itself while he drives or is at the wheel; an `auto` call on
    // foot, as a video call outside his building, is answered at once and played on the phone below: calls.js would
    // hold it for a car he is not in)
    if ((d.inCar || (d.auto && (ride || inCar()))) && W.calls?.define) {
      const id = `pack:${M.def.id}:${M.i}:${ride ? 'd' : 's'}:${who}`;
      const f0 = {}; for (const n of new Set([who, ...lines.map((l) => castName(l.who))])) f0[n] = cast.f0(n);
      W.calls.define(id, { who, color, f0, step: ui.stepId, main: lines.map(toTup), extra: (d.extra || []).map((b) => b.map(tuple).map(toTup)), wrap: (d.wrap || []).map(tuple).map(toTup),
        pause: (d.hold?.pause || []).map(tuple).map(toTup), resume: (d.hold?.resume || []).map(tuple).map(toTup), trigger: d.inCar || d.auto ? 'enter-car' : 'phase-start', delay: 2, wrapAfterMain: !ride, finish: !!ride });
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
  async function callWaiting(d, t, who, color, lines) {
    const live = W.calls.state()?.id;
    sfx.play('ring', { gain: 0.12, times: 1 });
    const show = (status) => ui.caller(who, color, status);
    show('Call waiting');
    let answer = d.auto ? true : null;
    const onKey = (e) => { if (W.paused || e.repeat) return; if (['KeyE', 'KeyY'].includes(e.code)) { answer = true; e.stopImmediatePropagation(); } else if (['KeyX', 'KeyN'].includes(e.code)) { answer = false; e.stopImmediatePropagation(); } };
    addEventListener('keydown', onKey, true);
    if (!d.auto) ui.help('Call waiting: [E|ANSWER] to answer, [X|DECLINE] to decline.', (d.ring || 8) + 1);
    const t0 = now();
    try { await wait(() => answer != null || (ctx.flags.autoAnswer && now() - t0 > 1500) || (now() - t0) / 1000 > (d.ring || 8), t); }
    finally { removeEventListener('keydown', onKey, true); ui.help(null); }
    if (answer == null && ctx.flags.autoAnswer) answer = true;
    M.log.push(['call-waiting', who, live, !!answer]);
    if (!answer) {
      applySet(d.decline); M.state.declined = (M.state.declined || 0) + 1;
      if (W.calls.state()?.id === live) ui.caller(null);
      if (d.voicemail) { await voicemail({ who: castName(d.voicemail.from) || who, text: d.voicemail.text, secs: d.voicemail.secs }, t); applySet(d.voicemail.set); }
      return;
    }
    // (the live call on hold: its line playing finished, its pause line, then this one's card over it)
    W.calls.hold?.(true);
    // (on hold once its line playing is done, its hold line said: 'Go, I'll hold.' heard out before the new caller)
    { const t0 = now(); await wait(() => W.calls.state()?.id !== live || (W.calls.state()?.held && !W.calls.talking) || now() - t0 > 15000, t).catch(() => {}); }
    await delay(0.3, t);
    applySet(d.answer); show(d.role || 'On call');
    try {
      for (const l of lines) { show(d.role || 'On call'); await say(castName(l.who), l.text, t, { secs: l.secs, phone: castName(l.who) !== heroName }); }
      if (d.choice) return await choose(d.choice, t);
    } finally { sfx.play('hangup', { gain: 0.1 }); ui.caller(null); W.calls.hold?.(false); }
  }
  async function voicemail(d, t, label = 'Voicemail') {
    const who = castName(d.who);
    sfx.play('ding', { gain: 0.25 });
    ui.caller(who, colorOf(who), label);
    try { await say(who, d.text, t, { secs: d.secs, phone: true }); } finally { ui.caller(null); }
  }
  STEPS.voicemail = async (d, t) => { await voicemail(d, t); applySet(d.set); };
  STEPS.voicenote = async (d, t) => { await voicemail(d, t, 'Voice note'); applySet(d.set); };

  // a fight on foot: combat's crew at the arena (the Suits' men, as many as the step names), the counter, out cold or
  // 150 m off fails. A man the forge made (a cast member with his own body: Pickup Time's Pedro Delgado) fights in it:
  // the Suit combat spawns for him (its brain, its hits, its knockdowns and ragdoll) is not drawn, and his own body is its
  // puppet (puppet): where it stands and how it tumbles, and each of its clips played as Dan's clip for the same move
  // (DAN_OF: a jab as his jab, a knockdown as his fall), at the same point through it, so his blows land when its do
  const DAN_OF = { suitIdle: 'fight', thugIdle: 'fight', suitIdleGuide: 'argue', guard: 'fight', suitWalk: 'guardF', suitWalk2: 'guardF', walk: 'guardF', jog: 'jog', suitRun: 'jog', run: 'run', sprint: 'sprint', suitDash: 'run',
    suitBack: 'guardB', suitLeft: 'guardL', suitRight: 'guardR', thugPunch1: 'jab', thugPunch2: 'cross', thugKick: 'ffKick', bruteSlam: 'hook', hitReact: 'hit', thugKnockdown: 'fall', thugGetUp: 'getup',
    thugStumbleBack: 'hitChest', thugStumbleLeft: 'hitHead', thugStumbleRight: 'hitHead', suitTauntBye: 'shrug', suitTauntByebye: 'shrug' };
  function puppet(e, who) {
    const c = def0.cast?.[who];
    if (!c || c.model || !c.glb || cast.isHero(who)) return null;
    const hide = () => e.inner.traverse((o) => { if (o.isMesh) o.visible = false; });
    hide();
    const P0 = { e, fig: null, sync() {} };
    cast.get(who)?.restore?.();
    cast.spawn(who, { x: e.pos.x, z: e.pos.z, heading: e.root.rotation.y }).then((fig) => {
      if (!fig?.clip || !fig.mixer) { e.inner.traverse((o) => { if (o.isMesh) o.visible = true; }); return; }
      M.npcs.add(who); P0.fig = fig;
      const inner = fig.root.children[0], q0 = inner.quaternion.clone(), p0 = inner.position.clone();
      fig.mixer.stopAllAction();
      let curN = null, act = null;
      P0.sync = () => {
        if (!e.root.parent) return;
        hide();
        fig.root.visible = true; fig.root.position.copy(e.root.position); fig.root.rotation.y = fig.heading = e.root.rotation.y;
        inner.quaternion.copy(e.inner.quaternion).multiply(q0); inner.position.copy(p0).add(e.inner.position);
        const n = e.curName, idle = e.state === 'idle';
        const want = idle && /^(suitIdle|thugIdle|guard)$/.test(n) ? 'idle' : idle && /walk/i.test(n || '') ? 'walk' : DAN_OF[n] || 'fight';
        if (want !== curN) {
          curN = want;
          const cl = fig.clip(want) || fig.clip('fight') || fig.clip('idle');
          if (cl) { const a = fig.mixer.clipAction(cl); a.reset(); a.enabled = true; a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 0; a.play(); if (act && act !== a) a.crossFadeFrom(act, 0.12, false); act = a; }
        }
        if (act && e.cur) {
          const dur = e.cur.getClip().duration || 1, k = e.cur.loop === THREE.LoopOnce ? Math.min(1, e.cur.time / dur) : ((e.cur.time / dur) % 1 + 1) % 1;
          act.time = k * act.getClip().duration * 0.999;
        }
      };
      fig.restore = () => { inner.quaternion.copy(q0); inner.position.copy(p0); fig.mixer.stopAllAction(); fig.play?.(c.idle || 'idle'); fig.restore = null; };
    }).catch((err) => console.warn('[storyrun] fight body', who, err));
    return P0;
  }
  STEPS.fight = async (d, t) => {
    const combat = W.combat;
    if (!combat?.spawnCrew) { console.warn('[storyrun] no fight on this page'); return; }
    // (the library's creatures for foes, or a boss: creatureFight; New York's fights never name them)
    if (d.foes || d.boss || d.waves) return creatureFight(d, t);
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
    // (a forged man in his own body: puppet)
    const puppets = d.enemies.map((who, k) => (crews[0].enemies[k] ? puppet(crews[0].enemies[k], castName(who)) : null)).filter(Boolean);
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
        for (const pp of puppets) pp.sync();
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
    // (a puppet goes on with its man's fall for the beat after)
    if (puppets.length) { const t1 = now(); await wait(() => { for (const pp of puppets) pp.sync(); return now() - t1 > 1000; }, t); }
    else await delay(1.0, t);
  };

  // a fight with the library's creatures (W.creatures, where the city has them: San Francisco): `foes` a crew round the
  // arena ([id | { id, count, height, name, heavy, stats }], ids creature-knight / -ogre / -centaur / -ape / -mech /
  // -scorpion / -trex), and a `boss` ({ id, name, height, phases, stats, at, hold: { wake, leash } }) at the arena's
  // middle (or its own `at` place) under the boss bar, in its lair when it has `hold` (it waits at home until he comes
  // within `wake` m or hits it, then fights within `leash` m of home). Done when every one of them is down; out cold,
  // or 150 m off, fails. On a horse he may stay in the saddle and fight from it (wagmi/horse/saddle.js); on foot as ever.
  //   { type: 'fight', arena: '@place', foes: [...], boss: {...}, objective, counter, hp, timer, why, barks }
  async function creatureFight(d, t) {
    const combat = W.combat, C = W.creatures;
    if (!C?.fight) { console.warn('[storyrun] no creatures on this page: the fight passes'); return; }
    const p = placeOf(d.arena), cx = p.cx ?? p.x, cz = p.cz ?? p.z;
    // (too far to have ridden there: put at the arena's edge, as a fight of men puts him in it)
    if (dist(me(), cx, cz) > 80) putPlayer(p, inCar() ? 'car' : 'walk');
    const ex = me().x, ez = me().z;
    app.trafficSystem.hold?.([{ minX: Math.min(ex, cx) - 45, maxX: Math.max(ex, cx) + 45, minZ: Math.min(ez, cz) - 45, maxZ: Math.max(ez, cz) + 45 }]);
    // (the fight's slate cleared, unless it fights a creature an earlier step kept: a flee's chaser, on him already)
    const keeps = [d.boss, ...(d.waves || []).map((w) => w.boss)].some((b) => b && b.from && M.kept?.has(b.from));
    if (!keeps) combat.clear?.();
    combat.player.maxHp = d.hp || combat.player.maxHp; combat.player.hp = combat.player.maxHp;
    const autoGetUp = combat.player.autoGetUp; combat.player.autoGetUp = true;
    let down = false;
    const offDown = combat.player.onDown(() => { down = true; });
    const handles = [];
    let lastK = 0, talk = false, lastHp = combat.player.hp, bossName = null, loading = 0;
    const fightSay = (lines) => { talk = true; (async () => { for (const l of lines.map(tuple)) await say(castName(l.who), l.text, M.tok); })().catch(() => {}).finally(() => { talk = false; }); };
    // (a wave: its foes round its place (the arena, or its own `from`: they come from there), its boss at the middle or
    // at its own `at`, or a creature an earlier step kept (boss.from: a flee's id, already on him))
    function spawnWave(w) {
      const foes = (Array.isArray(w.foes) ? w.foes : []).map((x) => (typeof x === 'string' ? { id: x } : x));
      const B = w.boss ? (typeof w.boss === 'string' ? { id: w.boss } : w.boss) : null;
      const src = w.from ? markOf(w.from) : { x: cx, z: cz };
      const mine = [];
      if (foes.length) mine.push(C.fight({ foes, at: src }));
      if (B) {
        const kept = B.from ? M.kept?.get(B.from) : null;
        let h = kept;
        if (kept) M.kept.delete(B.from);
        else {
          const bp = B.at ? placeOf(B.at) : null, at = bp ? { x: bp.cx ?? bp.x, z: bp.cz ?? bp.z } : src;
          h = C.spawn(B.id, { at, height: B.height, name: B.name, heavy: B.heavy, stats: B.stats, yaw: B.yaw != null ? (B.yaw * PI) / 180 : undefined,
            boss: { name: B.name, phases: B.phases }, hold: B.hold ? { wake: B.hold.wake ?? 20, leash: B.hold.leash ?? 40 } : null, aggro: !B.hold });
        }
        bossName = B.name || bossName;
        mine.push(h);
        watchWake(h, B.name, w);
        if (kept) { try { h.engage(); } catch {} }
      }
      // (a wave that comes from somewhere: in at a run, not waiting to be found)
      if (w.from) for (const h of mine) { h.ready.then(() => { try { h.engage(); } catch {} }); }
      for (const h of mine) { loading++; Promise.resolve(h.ready).finally(() => { loading--; }); }
      handles.push(...mine);
      M.creatures = handles;
      return mine;
    }
    // (the lair's boss woken: its name called, and the step's line for it)
    function watchWake(boss, name, w) {
      let woke = false;
      boss.on('wake', () => {
        if (woke) return; woke = true; juice.alert(name || 'Boss', { sub: (w.alert || d.alert) ? tokens(w.alert || d.alert) : '', tone: 'red', sting: 'up', jolt: 0.4, secs: 2.4 }); const wl = w.wake || d.wake; if (wl && !talk) fightSay([wl]);
        // (the wake framed: a low lens behind his shoulder looking up at it, its whole height in the frame, while it shows
        // itself; then the fight's own camera. wakeShot: false leaves it out)
        const f = boss.fighters[0];
        if (f && d.wakeShot !== false && w.wakeShot !== false) {
          const hx = P.position.x, hz = P.position.z, dx = f.pos.x - hx, dz = f.pos.z - hz, n = Math.hypot(dx, dz) || 1, fx = dx / n, fz = dz / n, H = f.height || 3;
          const back = 2.6 + H * 0.35, gy = cm.getGroundHeight(hx, hz, 'person');
          const cam = [hx - fx * back + fz * 1.4, gy + 0.9 + H * 0.12, hz - fz * back - fx * 1.4], cam2 = [hx - fx * (back + 1.2) + fz * 1.8, gy + 1.2 + H * 0.18, hz - fz * (back + 1.2) - fx * 1.8];
          const look = [f.pos.x, f.pos.y + H * 0.62, f.pos.z];
          // (first close on it from low down, looking up: its size; then over his shoulder: the two of them)
          const by = cm.getGroundHeight(f.pos.x, f.pos.z, 'person'), qx = f.pos.x - fx * H * 1.5 + fz * H * 0.55, qz = f.pos.z - fz * H * 1.5 - fx * H * 0.55;
          const close = [qx, by + 0.5, qz], close2 = [qx - fx * H * 0.25, by + 0.7, qz - fz * H * 0.25], up = [f.pos.x, by + H * 0.78, f.pos.z];
          // (a step's wakeCam: [x, y, z], the second a wide from there instead, the boss against what is behind it (The
          // Matriarch on the hill's top against the crater's glow in the west), its lens rising a little)
          const wc = Array.isArray(d.wakeCam) && d.wakeCam.length === 3 ? d.wakeCam : null;
          const second = wc ? { cam: wc, to: [wc[0], wc[1] + 1.2, wc[2]], look: [f.pos.x, by + H * 0.55, f.pos.z], dur: 2.4, fov: d.wakeFov || 40 } : { cam, to: cam2, look, dur: 1.6, fov: 44 };
          shotList([{ cam: close, to: close2, look: up, dur: 1.7, fov: 50 }, second], M.tok, { beat: true }).catch(() => {});
        }
      });
    }
    // waves: the step's own foes and boss first (when it has them), then each of `waves` in turn, once the last is down
    const waves = [...(d.foes || d.boss ? [{ foes: d.foes, boss: d.boss }] : []), ...(Array.isArray(d.waves) ? d.waves : [])];
    const nW = waves.length;
    let wi = 0;
    const first = spawnWave(waves[0]);
    await Promise.race([Promise.all(first.map((h) => h.ready)), wait(() => false, t)]);
    const fighters = () => handles.flatMap((h) => h.fighters);
    const crew = { alive: () => fighters().filter((f) => !f.out).length, creatures: true };
    M.crew = crew;
    const label = d.counter || 'DOWN';
    const tally = () => { const all = fighters(), k = all.filter((f) => f.out).length; if (nW > 1) ui.counter('WAVE', `${wi + 1}/${nW}`); else if (all.length > 1 && !cardLeft()) ui.counter(label, `${k}/${all.length}`); return k; };
    tally();
    gps.objective(parts(d.objective || (bossName ? `Beat **${bossName}**.` : 'Beat them all.'), 'red'), null);
    if (nW > 1) juice.alert(`WAVE 1/${nW}`, { sub: waves[0].alert ? tokens(waves[0].alert) : '', tone: 'red', sting: 'up', secs: 2 });
    const t0 = now();
    let between = 0;
    try {
      await wait(() => {
        const all = fighters(), alive = all.filter((f) => !f.out).length, k = all.length - alive;
        const hp = combat.player.hp; if (hp < lastHp - 0.5) M.stats.hits++; lastHp = hp;
        if (k !== lastK) { lastK = k; const b = d.barks?.[k]; if (b && !talk && alive > 0) fightSay([b]); }
        tally();
        for (const f of all) if (!f.out && !f.disposed) gps.blip('e:' + f.id, { x: f.pos.x, z: f.pos.z, kind: 'enemy', edge: !!f.boss || nW > 1, name: f.boss ? (f.name || '') : '' }); else gps.unblip('e:' + f.id);
        if (down) throw new Fail(tokens(d.why || `${heroName} got knocked out.`), 'ko');
        const secs = (now() - t0) / 1000;
        // (not in its first seconds: a hero just put at the arena's edge (from 80 m out) is read where he was for a frame)
        if (secs > 2 && dist(me(), cx, cz) > 150) throw new Fail('You left the fight.', 'left');
        if (d.timer) { hud.timer(d.timer - secs, 'TIME'); if (secs > d.timer) throw new Fail(tokens(d.why || 'You ran out of time.'), 'time'); }
        if (alive > 0 || !all.length || loading > 0) return false;
        if (wi + 1 >= nW) return true;
        // (a wave down: a breather (`pause` s, 5), its line, then the next, called by name)
        if (!between) {
          between = now();
          const w = waves[wi + 1];
          if (w.say) fightSay([w.say]);
          // (he is healed a little between waves: a third of what he has lost)
          combat.player.hp = Math.min(combat.player.maxHp, combat.player.hp + (combat.player.maxHp - combat.player.hp) / 3);
          gps.objective(parts(w.objective || 'Get ready.', 'red'), null);
        }
        if (now() - between > (waves[wi + 1].pause ?? 5) * 1000) {
          between = 0; wi++;
          const w = waves[wi];
          spawnWave(w);
          juice.alert(`WAVE ${wi + 1}/${nW}`, { sub: w.alert ? tokens(w.alert) : '', tone: 'red', sting: 'up', jolt: 0.3, secs: 2 });
          gps.objective(parts(w.objective || d.objective || 'Beat them all.', 'red'), null);
        }
        return false;
      }, t);
      M.stats.ko += fighters().length;
    } finally {
      offDown?.(); combat.player.autoGetUp = autoGetUp;
      for (const id of [...gps.blips.keys()]) if (id.startsWith('e:')) gps.unblip(id);
      ui.counter(null); hud.timer(null); M.crew = null;
    }
    // (a beat for the last one's fall, then the street let go)
    await delay(1.6, t);
    app.trafficSystem.hold?.([]);
  }
  // (the counter's corner is the place card's: how long the card just put up (a ride's arrival) has left)
  const cardLeft = () => Math.max(0, (M?.cardAt || 0) + 3300 - now());
  const dropCreatures = () => { for (const h of M?.creatures || []) try { h.remove(); } catch {} if (M) M.creatures = null; };

  // collect: supplies set out at spots (`items`: '@place' | { at: [x, z] } | [x, z]), each a glowing pickup with a soft
  // beam over it (crate, case, bag or can: `look`), on the radar; ridden or walked over it is taken (within `radius` m,
  // more in the saddle). The HUD's counter keeps the tally ('FOOD 3/5'); done when `need` are taken (all of them when it
  // names none). The route goes to the nearest one left.
  //   { type: 'collect', kind: 'food', label: 'Food', items: [...], need, look, color, radius, objective }
  const LOOKS = { crate: '#A8743C', case: '#E8E4DA', bag: '#8A7A55', can: '#B9C2C8' };
  function supplyMesh(look, color) {
    const g = new THREE.Group(), glow = new THREE.Color(color);
    const mat = (c, e = 0.18) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: look === 'can' ? 0.6 : 0 }); m.emissive = glow.clone(); m.emissiveIntensity = e; return m; };
    if (look === 'case') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.22), mat(LOOKS.case, 0.12)); b.position.y = 0.21; g.add(b);
      const crossM = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 }); crossM.emissive = glow.clone(); crossM.emissiveIntensity = 0.9;
      for (const [w, h] of [[0.26, 0.08], [0.08, 0.26]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.232), crossM); c.position.y = 0.21; g.add(c); }
      const hdl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mat('#333333', 0)); hdl.position.y = 0.45; g.add(hdl);
    } else if (look === 'bag') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(LOOKS.bag)); b.scale.set(1, 1.15, 0.8); b.position.y = 0.32; g.add(b);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.14, 8), mat(LOOKS.bag)); n.position.y = 0.66; g.add(n);
    } else if (look === 'can') {
      for (const [x, z] of [[-0.12, 0], [0.12, 0.02], [0, 0.18]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 12), mat(LOOKS.can, 0.25)); c.position.set(x, 0.13, z); g.add(c); }
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.46, 0.5), mat(LOOKS.crate)); b.position.y = 0.23; g.add(b);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.54), mat('#6E4A26', 0.1)); lid.position.y = 0.47; g.add(lid);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.06), mat(color, 0.9)); band.position.set(0, 0.32, 0.26); g.add(band);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  const groundY = (x, z) => (window.NYC?.CITY === 'sf' ? cm.getGroundHeight(x, z, 'person') : 0);
  STEPS.collect = async (d, t) => {
    const kind = d.kind || 'supplies', label = d.label || kind.charAt(0).toUpperCase() + kind.slice(1), color = COLOUR6.test(d.color || '') ? d.color : '#FFC93C';
    const items = (d.items || []).map((r, i) => {
      const q = Array.isArray(r) ? { x: r[0], z: r[1] } : r && Array.isArray(r.at) ? { x: r.at[0], z: r.at[1] } : (() => { const pp = placeOf(r); return { x: pp.cx ?? pp.x, z: pp.cz ?? pp.z }; })();
      return { i, x: q.x, z: q.z, taken: false, name: (r && r.name) || label };
    });
    const need = Math.min(items.length, d.need || items.length);
    const look = d.look || ({ food: 'crate', medicine: 'case', water: 'can' }[kind] || 'crate');
    // (each one drawn: the pickup, a soft beam over it seen down the street, a slow bob and turn)
    for (const it of items) {
      const y = groundY(it.x, it.z);
      it.obj = supplyMesh(look, color); it.obj.position.set(it.x, y, it.z); it.obj.rotation.y = it.i * 1.7; app.scene.add(it.obj);
      it.beam = createMarker(THREE, app.scene, { color, radius: 0.55, height: 9, alpha: 0.32 }); it.beam.at(it.x, y, it.z); it.y = y;
      gps.blip('sup:' + it.i, { x: it.x, z: it.z, kind: 'object', name: it.name });
    }
    M.collect = { items, need, kind };
    let n = 0, cur = null, nav = null, last = now();
    const COUNTER = label.toUpperCase();
    // (the tally's corner is the place card's: after a card just up (a ride's arrival), it comes up once the card has gone)
    const tally = (txt) => { const w = cardLeft(); if (w > 0) setTimeout(() => { if (M?.collect) ui.counter(COUNTER, txt); }, w); else ui.counter(COUNTER, txt); };
    tally(`0/${need}`);
    // (the objective with the tally after it: 'Scavenge food along Market St · 3/5', its full stop dropped for it)
    const objective = parts(d.objective || `Collect **${label.toLowerCase()}**.`, 'green');
    if (typeof objective[objective.length - 1] === 'string') objective[objective.length - 1] = objective[objective.length - 1].replace(/\.\s*$/, '');
    const next = () => { let b = null, bd = Infinity; const q = me(); for (const it of items) if (!it.taken) { const dd = dist(q, it.x, it.z); if (dd < bd) { bd = dd; b = it; } } return b; };
    const stopNav = () => { if (nav) { nav.stop(); nav = null; } };
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        for (const it of items) if (!it.taken) { it.obj.rotation.y += dt * 0.9; it.obj.position.y = it.y + 0.06 + Math.sin(tt / 420 + it.i) * 0.05; }
        const q = me(), r = (d.radius || 2.2) + (inCar() ? 1.6 : 0);
        for (const it of items) if (!it.taken && dist(q, it.x, it.z) < r) {
          it.taken = true; n++; app.scene.remove(it.obj); it.beam.hide(); app.scene.remove(it.beam.group); gps.unblip('sup:' + it.i);
          sfx.play('ding', { gain: 0.28 }); tally(`${n}/${need}`);
          juice.alert(`${label} ${n}/${need}`, { tone: n >= need ? 'green' : 'yellow', secs: 1.3 });
          M.log.push(['collect', kind, n]);
          host.tell('progress', { mission: M.def?.id, step: d.id || null, kind: 'collect', i: M.i, n: M.def?.steps.length, got: n, need });
          if (d.barks?.[n]) { const b = tuple(d.barks[n]); say(castName(b.who), b.text, M.tok).catch(() => {}); }
        }
        if (n >= need) return true;
        // (the route to the nearest one left, re-aimed when another is nearer by a margin or that one is taken)
        const b = next();
        if (b && (b !== cur || !nav) && (!cur || cur.taken || dist(q, b.x, b.z) < dist(q, cur.x, cur.z) - 15)) {
          stopNav(); cur = b; M.dest = b;
          nav = gps.drive({ dest: { x: b.x, z: b.z, name: b.name }, objective: [...objective, ` · ${n}/${need}`], onFoot: 250 });
        }
        nav?.step();
        return false;
      }, t);
    } finally {
      stopNav(); M.dest = null; gps.clear();
      for (const it of items) { if (!it.taken) { app.scene.remove(it.obj); it.beam.hide(); app.scene.remove(it.beam.group); } gps.unblip('sup:' + it.i); }
      M.collect = null;
    }
    ui.counter(COUNTER, `${need}/${need}`); await delay(1.0, t); ui.counter(null);
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };

  // herd: wildlife set out where the story says (W.creatures.herd: they graze, drift and run from him), at once; they stay
  // until the mission ends, or a herd step with { remove: <its id> } lets them go. Not a step to wait on.
  //   { type: 'herd', id, creature: 'creature-horse', at: '@place' | [x, z], count, radius, height }
  STEPS.herd = async (d) => {
    const C = W.creatures; M.herds = M.herds || new Map();
    if (d.remove) { const h = M.herds.get(d.remove); if (h) { h.remove(); M.herds.delete(d.remove); } return; }
    if (!C?.herd) { console.warn('[storyrun] no wildlife on this page'); return; }
    const q = Array.isArray(d.at) ? { x: d.at[0], z: d.at[1] } : (() => { const pp = placeOf(d.at); return { x: pp.cx ?? pp.x, z: pp.cz ?? pp.z }; })();
    const h = C.herd(d.creature || 'creature-horse', { at: q, count: d.count || 4, radius: d.radius || 10, height: d.height });
    M.herds.set(d.id || 'herd' + M.herds.size, h);
  };

  // mount / dismount: on to the world's horse (its car { model: 'mogcity/horse' }: wagmi/horse), or off it. A mount with
  // `at` stands the horse there first (W.horse.give); else it is where he left it (blipped, the route to it)
  STEPS.mount = async (d, t) => {
    const H = W.horse;
    if (inCar()) { if (d.arm && H?.arm) try { H.arm(d.arm); } catch {} return; }
    if (H && d.at) { const p = placeOf(d.at); H.give({ x: p.cx ?? p.x, z: p.cz ?? p.z, heading: p.heading ?? 0 }); }
    const name = car.label || 'your horse';
    gps.objective(d.objective ? parts(d.objective, 'blue') : [`${rideWord('board', 'Get in')} `, { [name]: 'blue' }, '.'], { follow: () => car.position, name });
    gps.blip('car', { x: car.position.x, z: car.position.z, kind: 'car', edge: true, name });
    ui.help(`Press [F] to ${rideWord('board', 'get in').toLowerCase()}.`, 8);
    try { await wait(() => inCar() && !W.ride?.phase, t); } finally { gps.unblip('car'); ui.help(null); gps.clear(); }
    // (something put in his hand for the saddle's blows: `arm` 'bat' | 'bottle', wagmi/horse arm)
    if (d.arm && H?.arm) try { H.arm(d.arm); } catch (e) { console.warn('[storyrun] arm', e); }
  };
  STEPS.dismount = async (d, t) => {
    if (!inCar()) return;
    gps.objective(d.objective ? parts(d.objective, 'blue') : [W.horse ? 'Get down.' : 'Get out.'], null);
    ui.help(`Press [F] to ${W.horse ? 'dismount' : 'get out'}.`, 8);
    if (d.quick || M.auto) { await wait(() => Math.abs(car.speed || 0) < 1.5, t); W.ride?.getOut?.(true); }
    try { await wait(() => !inCar() && !W.ride?.phase, t); } finally { ui.help(null); }
  };

  /* ---------------------------------------------- the wild steps (SF 2040) -- */
  // sneak, flee, drove and track: the verbs of a ride through a city of creatures (W.creatures, San Francisco only).
  // Each tells the test drive what it needs in M.wild ({ kind, walk, push, near }: autopilot.js).
  const markOf = (r) => { if (Array.isArray(r)) return { x: r[0], z: r[1] }; const pp = placeOf(r); return { x: pp.cx ?? pp.x, z: pp.cz ?? pp.z }; };
  const paceNow = () => (inCar() ? Math.abs(car.speed || 0) : Math.abs(P.speed || 0));
  // (how loud he is: a horse's walk, trot or gallop by its speed (wagmi/horse/drive.js PACE 1.8 / 4.5 / 12), a man's
  // walk or run; and how far a sleeper hears each, in metres)
  const gaitNow = () => { const v = paceNow(); return inCar() ? (v < 2.6 ? 'walk' : v < 7 ? 'trot' : 'gallop') : (v < 2.4 ? 'walk' : 'run'); };
  const HEAR = { walk: 6, trot: 17, gallop: 36, run: 11 };
  const arrived = (p, radius) => (inCar() ? dist(car.position, p.x, p.z) < radius : dist(P.position, p.x, p.z) < Math.max(3, radius * 0.75));
  // a whistle, three short blasts (a ranger's "I'm here"), or one: synthesized, near (loud) or far (soft and dull)
  function whistle(k = 1, n = 3) {
    const ac = sfx?.unlock?.(); if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime + 0.02, lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 + 4200 * k;
    const out = ac.createGain(); out.gain.value = 0.05 + 0.2 * k; lp.connect(out); out.connect(ac.destination);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.32, o = ac.createOscillator(), v = ac.createOscillator(), vg = ac.createGain(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = 2650; v.frequency.value = 38; vg.gain.value = 70; v.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.02); g.gain.setValueAtTime(1, t + 0.17); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(lp); o.start(t); v.start(t); o.stop(t + 0.25); v.stop(t + 0.25);
    }
    setTimeout(() => { try { out.disconnect(); } catch {} }, 2000);
  }
  const growl = () => { sfx.play('thunk', { gain: 0.35, f: 55, ring: true }); sfx.play('grunt', { gain: 0.22, f0: 70, vowel: 'o', dur: 0.5 }); };
  // the creatures a step keeps for a later one (flee's chaser, fought at the bottom of the hill: a fight's boss.from)
  const keptOf = () => (M.kept = M.kept || new Map());

  // sneak: past sleeping creatures to a place, without waking them. They lie in their lairs (`sleepers`, on the radar);
  // each hears him within HEAR m for his gait (a horse's gallop 36, trot 17, walk 6; a man running 11, walking 6), times
  // its `ears`. While one hears him the NOISE bar fills (faster the nearer he is), and drains when none does; at a
  // half it stirs (a growl, the step's `warn` line); full, or hit, they wake: the step fails (`why`, the tip: walk) or,
  // with `woke: <step id>`, goes there (a fight). There, they are let be (gone with the step).
  //   { type: 'sneak', to: '@place', radius, sleepers: [{ id, at, name, height, yaw, ears }], objective, help, warn, why, woke }
  STEPS.sneak = async (d, t) => {
    const C = W.creatures, p = placeOf(d.to), radius = d.radius || 10;
    const hs = [];
    if (C?.spawn) for (const s of d.sleepers || []) {
      const o = typeof s === 'string' ? { id: s, at: d.to } : s;
      hs.push({ o, h: C.spawn(o.id, { at: markOf(o.at), height: o.height, name: o.name, yaw: o.yaw != null ? (o.yaw * PI) / 180 : undefined, hold: { wake: 1.5, leash: 30 }, aggro: false }) });
    }
    M.creatures = [...(M.creatures || []), ...hs.map((x) => x.h)];
    await Promise.race([Promise.all(hs.map((x) => x.h.ready)), wait(() => false, t)]);
    let noise = 0, warned = false, woke = false, last = now();
    for (const x of hs) x.h.on('wake', () => { woke = true; });
    marker.at(p.x, groundY(p.x, p.z), p.z); M.dest = p;
    const nav = gps.drive({ dest: { x: p.x, z: p.z, name: p.name }, objective: parts(d.objective || `Get to **${p.name}** without waking them.`), onFoot: 250 });
    M.nav = nav;
    ui.help(parts(d.help || 'Near them, slow to a walk: [Q] walks Ranger. Keep the NOISE bar from filling.'), 10);
    M.wild = { kind: 'sneak', walk: false, near: Infinity };
    try {
      await wait(() => {
        nav.step();
        const tt = now(), dt = Math.min(0.1, (tt - last) / 1000); last = tt;
        const hear = HEAR[gaitNow()] || 10, q = me();
        let heat = 0, near = Infinity, nearAt = null;
        for (const x of hs) for (const f of x.h.fighters) {
          if (f.out || f.disposed) continue;
          const dd = dist(q, f.pos.x, f.pos.z) - (f.T?.radius || 0), r = hear * (x.o.ears || 1);
          if (dd < near) { near = dd; nearAt = { x: f.pos.x, z: f.pos.z, r: hear * (x.o.ears || 1) + (f.T?.radius || 0) }; }
          if (dd < r) heat = Math.max(heat, 1 - Math.max(0, dd) / r);
          gps.blip('sl:' + f.id, { x: f.pos.x, z: f.pos.z, kind: 'enemy', name: x.o.name || '' });
        }
        M.wild.near = near; M.wild.nearAt = nearAt; M.wild.walk = near < HEAR.trot * 1.6; M.wild.gait = gaitNow(); M.wild.noise = noise;
        noise = clamp(noise + (heat > 0 ? (0.18 + heat * 1.1) * dt : -0.2 * dt), 0, 1);
        hud.bar('NOISE', noise, heat > 0 ? (noise > 0.55 ? 'It stirs' : 'It can hear you') : near < 60 ? 'Quiet' : '');
        if (noise > 0.5 && !warned) { warned = true; growl(); juice.pulse(0.5); if (d.warn) { const b = tuple(d.warn); say(castName(b.who), b.text, M.tok).catch(() => {}); } }
        if (noise < 0.15) warned = false;
        if (noise >= 1 || woke) { woke = true; return true; }
        return arrived(p, radius);
      }, t);
    } finally {
      nav.stop(); M.nav = null; M.dest = null; marker.hide(); gps.clear(); hud.bar(null); ui.help(null); M.wild = null;
      for (const x of hs) { for (const f of x.h.fighters) gps.unblip('sl:' + f.id); }
    }
    if (woke) {
      M.log.push(['sneak', 'woke']);
      for (const x of hs) try { x.h.engage(); } catch {}
      juice.alert(d.alert || 'They heard you', { tone: 'red', sting: 'up', jolt: 0.35, secs: 2 });
      await delay(1.2, t);
      for (const x of hs) try { x.h.remove(); } catch {}
      M.creatures = (M.creatures || []).filter((h) => !hs.some((x) => x.h === h));
      if (d.woke) return { goto: d.woke };
      throw new Fail(tokens(d.why || 'They heard you.'), 'heard');
    }
    for (const x of hs) try { x.h.remove(); } catch {}
    M.creatures = (M.creatures || []).filter((h) => !hs.some((x) => x.h === h));
    if (d.card !== false) { sfx.play('ding', { gain: 0.22 }); ui.place(p.name, '', 3); M.cardAt = now(); }
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };

  // flee: a creature on his heels, to a place. It comes from `from` (a place, or `behind` m back along his way), fast:
  // never quite as fast as a gallop, gaining on anything slower, and closing up when it falls far behind (it never
  // loses him: the chase stays close). Within its reach (`catch` m past its body) for `grace` s in all, it has him: the
  // step fails ('caught'). Knocked out, too. It comes from its own `creature.at` (a place or [x, z]), else `behind` m back. There, it stops; with `keep: true` it is kept for the next fight (its
  // boss.from: this step's id), else it is let go.
  //   { type: 'flee', to: '@place', radius, creature: { id, name, height, boss: true, phases, at }, behind, speed,
  //     catch, grace, objective, alert, keep, barks: { <secs in>: [who, text] } }
  STEPS.flee = async (d, t) => {
    const C = W.creatures, p = placeOf(d.to), radius = d.radius || 14;
    const B = typeof d.creature === 'string' ? { id: d.creature } : d.creature || {};
    let h = null;
    if (C?.spawn && B.id) {
      const e = cm.getActiveEntity(), back = d.behind || 30;
      const at = B.at ? markOf(B.at) : { x: e.position.x - Math.sin(e.heading) * back, z: e.position.z - Math.cos(e.heading) * back };
      h = C.spawn(B.id, { at, height: B.height, name: B.name, stats: B.stats, boss: B.boss ? { name: B.name, phases: B.phases } : null, aggro: true });
      M.creatures = [...(M.creatures || []), h];
      await Promise.race([h.ready, wait(() => false, t)]);
      try { h.engage(); } catch {}
    }
    const f = h?.fighters?.[0] || null, speed0 = f?.T?.speed;
    juice.alert(B.name || 'Run', { sub: tokens(d.alert || 'Ride!'), tone: 'red', sting: 'up', jolt: 0.45, secs: 2.2 });
    marker.at(p.x, groundY(p.x, p.z), p.z); M.dest = p;
    const nav = gps.drive({ dest: { x: p.x, z: p.z, name: p.name }, objective: parts(d.objective || `Ride for **${p.name}**!`, 'red'), onFoot: 250 });
    M.nav = nav;
    const top = d.speed || 11, reach = d.catch ?? 2.5, grace = d.grace ?? 1.6, t0 = now();
    let held = 0, last = now(), down = false;
    const offDown = W.combat?.player?.onDown?.(() => { down = true; });
    const barks = Object.entries(d.barks || {}).map(([k, l]) => [+k, l]).sort((a, b) => a[0] - b[0]);
    M.wild = { kind: 'flee' };
    try {
      await wait(() => {
        nav.step();
        const tt = now(), dt = Math.min(0.1, (tt - last) / 1000); last = tt;
        const secs = (tt - t0) / 1000;
        while (barks.length && secs >= barks[0][0]) { const b = tuple(barks.shift()[1]); say(castName(b.who), b.text, M.tok).catch(() => {}); }
        if (f && !f.out && !f.disposed) {
          const q = me(), gap = dist(q, f.pos.x, f.pos.z) - (f.T?.radius || 0), v = paceNow();
          // (its pace: a little under his when he gallops, its own top when he is slower; far behind, it closes up)
          f.T.speed = Math.min(top, Math.max(top * 0.82, v * 0.94));
          if (gap > 32) { const dx = q.x - f.pos.x, dz = q.z - f.pos.z, n = Math.hypot(dx, dz) || 1, s = Math.min(gap - 32, (v + 3) * dt); f.moveXZ?.(dx / n * s, dz / n * s); }
          held = gap < reach ? held + dt : Math.max(0, held - dt * 0.5);
          hud.bar(B.name ? B.name.toUpperCase() : 'BEHIND YOU', clamp(1 - gap / 40, 0, 1), `${Math.max(0, Math.round(gap))} m`);
          gps.blip('chaser', { x: f.pos.x, z: f.pos.z, kind: 'enemy', edge: true, name: B.name || '' });
          if (held > grace) throw new Fail(tokens(d.why || `${B.name || 'It'} caught you.`), 'chased');
        }
        if (down) throw new Fail(tokens(d.why || `${heroName} got knocked out.`), 'ko');
        return arrived(p, radius);
      }, t);
    } finally {
      offDown?.(); nav.stop(); M.nav = null; M.dest = null; marker.hide(); gps.clear(); hud.bar(null); gps.unblip('chaser'); M.wild = null;
    }
    if (f && speed0 != null) f.T.speed = speed0;
    if (h && d.keep && d.id) keptOf().set(d.id, h);
    else if (h) { try { h.remove(); } catch {} M.creatures = (M.creatures || []).filter((x) => x !== h); }
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };

  // drove: a herd (a herd step's, by its id) driven into a pen. They run from him (W.creatures.herd), so he rides round
  // behind them; running, they drift toward the pen (`pull` m/s), and once in it (within `radius` m) they stay. The
  // route goes to the herd, the pen is a ring and a blip; the counter keeps the tally ('HERD 2/3'). Done when `need`
  // are in (all of them when it names none).
  //   { type: 'drove', herd: '<herd id>', to: '@place', radius, need, pull, label, objective, help, barks }
  STEPS.drove = async (d, t) => {
    // (a start past the herd's own step (a checkpoint, ?step=): that step stood up now)
    if (!M.herds?.get(d.herd)) { const hs = M.def.steps.find((s) => s.type === 'herd' && s.id === d.herd && !s.remove); if (hs) await STEPS.herd(hs, t); }
    const hd = M.herds?.get(d.herd);
    if (!hd) { console.warn('[storyrun] drove: no herd', d.herd); return; }
    await Promise.race([hd.ready, wait(() => false, t)]);
    const p = placeOf(d.to), px = p.cx ?? p.x, pz = p.cz ?? p.z, R = d.radius || 14, pull = d.pull ?? 1.6;
    const A = hd.animals || [], need = Math.min(A.length, d.need || A.length), label = (d.label || 'Herd').toUpperCase();
    const ring = createMarker(THREE, app.scene, { color: '#4ADE80', radius: R, height: 1.4, alpha: 0.16 }); ring.at(px, groundY(px, pz), pz);
    gps.blip('pen', { x: px, z: pz, kind: 'object', edge: true, name: p.name || 'the pen' });
    ui.counter(label, `0/${need}`);
    if (d.help !== false) ui.help(parts(d.help || 'They run from Ranger. Ride round behind them and push them toward the **green ring**.'), 10);
    const objective = parts(d.objective || `Drive the herd into **${p.name}**`, 'green');
    let nav = null, navAt = 0, last = now(), got = 0;
    const t0 = now(), penned = new Set();
    M.wild = { kind: 'drove', push: null };
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.1, (tt - last) / 1000); last = tt;
        const q = me(), assist = M.auto && (tt - t0) / 1000 > 45;
        let cx = 0, cz = 0, n = 0;
        for (const a of A) {
          const dp = Math.hypot(a.pos.x - px, a.pos.z - pz);
          if (penned.has(a)) {
            // (in: kept in the pen, grazing)
            if (dp > R * 0.8) { a.pos.x += (px - a.pos.x) / dp * Math.min(dp - R * 0.8, 3 * dt); a.pos.z += (pz - a.pos.z) / dp * Math.min(dp - R * 0.8, 3 * dt); }
            if (a.state === 'flee') { a.state = 'graze'; a.t = 0; a.next = 6; }
            continue;
          }
          if (dp < R) { penned.add(a); got++; sfx.play('ding', { gain: 0.26 }); juice.alert(`${d.label || 'Herd'} ${got}/${need}`, { tone: got >= need ? 'green' : 'yellow', secs: 1.3 });
            if (d.barks?.[got]) { const b = tuple(d.barks[got]); say(castName(b.who), b.text, M.tok).catch(() => {}); }
            continue; }
          cx += a.pos.x; cz += a.pos.z; n++;
          // (running from him, and he near: a drift toward the pen; the test drive's after 45 s is a firm one)
          const dq = dist(q, a.pos.x, a.pos.z), k = assist ? 4 : a.state === 'flee' && dq < 45 ? pull : 0;
          if (k > 0) { a.pos.x += (px - a.pos.x) / dp * k * dt; a.pos.z += (pz - a.pos.z) / dp * k * dt; }
        }
        ui.counter(label, `${got}/${need}`);
        if (got >= need) return true;
        if (n) {
          cx /= n; cz /= n;
          // (where to ride: behind the herd, the far side from the pen; the route there, re-aimed every 2 s)
          const ax = cx - px, az = cz - pz, L = Math.hypot(ax, az) || 1, bx = cx + ax / L * 14, bz = cz + az / L * 14;
          M.wild.push = { x: bx, z: bz, cx, cz };
          if (!nav || tt - navAt > 2000) { nav?.stop(); navAt = tt; nav = gps.drive({ dest: { x: bx, z: bz, name: d.label || 'the herd' }, objective: [...objective, ` · ${got}/${need}`], onFoot: 250 }); M.dest = { x: bx, z: bz }; }
          nav.step();
          gps.blip('herd', { x: cx, z: cz, kind: 'object', name: d.label || 'the herd' });
        }
        return false;
      }, t);
    } finally {
      nav?.stop(); M.dest = null; gps.clear(); gps.unblip('pen'); gps.unblip('herd'); ring.hide(); app.scene.remove(ring.group); ui.help(null); M.wild = null;
    }
    ui.counter(label, `${need}/${need}`); await delay(1.0, t); ui.counter(null);
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };

  // track: something heard, not seen. No route and no marker: a SIGNAL bar that fills as he gets nearer, and a sound
  // from the place every `every` s (`cue`: 'whistle', three short blasts, louder and brighter the nearer he is), with a
  // word ('Colder', 'Warmer', 'Close'). After `hint` s (90) the route is given as a last resort. Done within `radius` m.
  //   { type: 'track', at: '@place', radius, label, every, cue: 'whistle' | 'ding', call: [who, text], objective, hint }
  STEPS.track = async (d, t) => {
    const p = placeOf(d.at), px = p.cx ?? p.x, pz = p.cz ?? p.z, radius = d.radius || 12, every = (d.every || 7) * 1000, label = (d.label || 'Signal').toUpperCase();
    const d0 = Math.max(60, dist(me(), px, pz));
    gps.objective(parts(d.objective || `Follow the sound to **${p.name}**.`), null);
    let nav = null, lastPing = 0, best = d0, word = '';
    const t0 = now(), hint = (d.hint ?? 90) * 1000;
    const help = d.help ?? 'No route for this one: listen, and watch the bar fill as you get closer.';
    if (help) ui.help(parts(help), 9);
    M.wild = { kind: 'track' };
    try {
      await wait(() => {
        const tt = now(), dd = dist(me(), px, pz), k = clamp(1 - dd / d0, 0, 1);
        // (the test drive, or a player still lost after `hint` s: the route, as a last resort)
        if (!nav && (M.auto || tt - t0 > hint)) { nav = gps.drive({ dest: { x: px, z: pz, name: p.name }, objective: parts(d.objective || `Follow the sound to **${p.name}**.`), onFoot: 250 }); M.dest = { x: px, z: pz }; if (!M.auto) ui.help('The route is on the map.', 5); }
        nav?.step();
        if (tt - lastPing > every * (0.45 + 0.55 * (1 - k))) {
          lastPing = tt;
          if ((d.cue || 'whistle') === 'whistle') whistle(0.15 + 0.85 * k); else sfx.play('ding', { gain: 0.08 + 0.3 * k });
          word = dd < best - 8 ? 'Warmer' : dd > best + 15 ? 'Colder' : word; best = Math.min(best, dd);
          if (d.call && tt - t0 < 1000) { const b = tuple(d.call); say(castName(b.who), b.text, M.tok).catch(() => {}); }
        }
        hud.bar(label, k, dd < radius * 3 ? 'Close' : word);
        return dd < radius;
      }, t);
    } finally { nav?.stop(); M.dest = null; gps.clear(); hud.bar(null); ui.help(null); M.wild = null; }
    sfx.play('ding', { gain: 0.24 });
    if (d.card !== false) { ui.place(p.name, '', 3); M.cardAt = now(); }
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };

  // a chase: pursuit's heat and cars; lose them, reach a place with them on you, or keep going (escort) for `until` s
  STEPS.pursuit = async (d, t, ride) => {
    const pu = W.pursuit; if (!pu?.start) { console.warn('[storyrun] no pursuit on this page'); return; }
    if (!inCar()) { /* (the chase needs the car: the GPS sends him back to it) */ }
    // (in a ride with no boost, a van or a truck (ride.js noBoost: 25.9 m/s flat out), the crew's cars are held to nine
    // tenths of its top speed instead of the heat's own (30 m/s at heat 2, made to chase the GT): at real pace the slice
    // van in PT-11 was run down and pinned by three faster cars; they still close in on a ram and on any mistake)
    const h0 = d.level || 2, vcap = car.noBoost ? Math.min(pu.RULE?.vmax ? pu.RULE.vmax(h0) : 24 + 3 * h0, (car.topSpeed || 26) * 0.9) : null;
    const chase = pu.start({ heat: h0, kind: d.kind === 'police' ? 'police' : 'suits', count: value(d.count, M.state, ctx.save.done) || undefined, lose: d.goal !== 'escort', ...(d.loseTime ? { escape: d.loseTime } : {}), ...(vcap ? { vmax: vcap } : {}) });
    let lost = false, caught = false;
    chase?.on?.('lost', () => { lost = true; juice.alert('Lost them', { tone: 'green', sting: 'down', secs: 1.8 }); }); chase?.on?.('caught', () => { caught = true; });
    // (the chase's alarm: who is on him, and the camera jolted)
    juice.alert(d.kind === 'police' ? 'Police' : "Delgado's crew", { sub: d.alert ? tokens(d.alert) : d.kind === 'police' ? 'Lose the cops.' : ride ? 'They found you. Keep moving.' : 'Lose them.', tone: 'red', sting: 'up', jolt: 0.35 });
    M.chase = chase;
    // (a chase that starts with his car standing, parked or in a queue at a light: the traffic round it cleared, and for
    // a chase to a place the first 180 m of the way there too (d.clear m round the car, 32 by default; 0 leaves it),
    // kept clear until he has driven past it, 25 s at most. PT-14's chase began with the car boxed in by a bus and two
    // taxis on Broadway at W 64th, and the queue at the W 65th light behind them; they caught him before he got going)
    const cr = d.clear ?? 32;
    let clearT = 0;
    if (cr > 0 && Math.abs(car.speed || 0) < 4 && dist(me(), car.position.x, car.position.z) < 60) {
      const c0 = { x: car.position.x, z: car.position.z }, rects = [{ minX: c0.x - cr, maxX: c0.x + cr, minZ: c0.z - cr, maxZ: c0.z + cr }];
      const way = [[c0.x, c0.z]];
      if (d.goal === 'reach' && d.to) {
        try {
          const p = placeOf(d.to), r = gps.plan({ x: c0.x, z: c0.z }, { x: p.x, z: p.z }, car.heading) || [];
          let L = 0;
          for (let k = 1; k < r.length && L < 180; k++) {
            const [ax, az] = r[k - 1], [bx, bz] = r[k], seg = Math.hypot(bx - ax, bz - az);
            for (let u = 0; u < seg && L + u < 180; u += 15) { const x = ax + (bx - ax) * u / seg, z = az + (bz - az) * u / seg; rects.push({ minX: x - 14, maxX: x + 14, minZ: z - 14, maxZ: z + 14 }); way.push([x, z]); }
            L += seg;
          }
        } catch (e) { console.warn('[storyrun] chase clear', e); }
      }
      try { app.trafficSystem.hold?.(rects); } catch {}
      const t0 = now(), end = way[way.length - 1];
      clearT = setInterval(() => {
        if (now() - t0 > 25000 || (dist(car.position, c0.x, c0.z) > cr + 12 && dist(car.position, end[0], end[1]) < 20) || dist(car.position, c0.x, c0.z) > 230) { clearInterval(clearT); clearT = 0; try { app.trafficSystem.hold?.([]); } catch {} }
      }, 250);
    }
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
    } finally { if (clearT) { clearInterval(clearT); try { app.trafficSystem.hold?.([]); } catch {} } try { chase?.stop?.(); } catch {} M.chase = null; M.loseAssist = false; gps.clear(); }
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
    let close = 0, far = 0, last = now(), opened = false, lastLeft = 0, warnAt = 0;
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
        // (held up in traffic, the followed car is a car in a queue: one car back at a light is not being made, only on
        // its bumper is; owner's PT-8 run, 6 Nov: the SUV stopped on W 23rd St and the car queued behind it was "spotted")
        const held = (D.v || 0) < 3, tooClose = held ? dd < 7 : dd < ring * 0.5;
        close = tooClose && opened ? close + dt : Math.max(0, close - dt);
        far = dd > lostDist ? far + dt : 0;
        // (the warning before the fail: too close, or about to lose it)
        if (tt - warnAt > 3500 && (close > (d.spotTime || 4) * 0.4 || far > (d.lostTime || 8) * 0.35)) { warnAt = tt; juice.alert(close > 0 ? 'Too close' : 'Losing them', { sub: close > 0 ? 'Back off or they make you.' : `Catch up to ${name}.`, tone: 'yellow', secs: 1.6 }); }
        if (close > (d.spotTime || 4)) throw new Fail(`${name.replace(/^the /, 'The ')} spotted you.`, 'lost');
        if (far > (d.lostTime || 8)) throw new Fail(`You lost ${name}.`, 'lost');
        return D.done;
      }, t);
    } finally { app.scene.remove(g); gps.unblip('tail'); gps.clear(); if (M.tail === D) M.tail = null; }
  };

  // a cue's sound (a trigger's `cue`): one of Mog City's sounds by name, or a walkie-talkie's: 'walkie' one beep with a
  // squelch, 'walkie2' two, 'walkie3' three (the crew closing in), made from the sound bank's own tones
  function cue(name) {
    const m = /^walkie(\d)?$/.exec(name);
    if (!m) { sfx.play(name, { gain: 0.3 }); return; }
    const n = Math.min(3, +(m[1] || 1));
    sfx.play('glitch', { gain: 0.06 });
    for (let i = 0; i < n; i++) setTimeout(() => sfx.play('thunk', { gain: 0.16, f: 1250, ring: false }), 90 + i * 170);
  }
  // a trigger: once (or every time) the player is in an area, on a street, or a condition holds: its line, set and side steps
  STEPS.trigger = async (d, t) => {
    const area = d.area ? placeOf('@' + d.area['@']) : null;
    let fired = false;
    const turns = gps.turns;
    await wait(() => {
      const hit = (area ? dist(me(), area.x, area.z) < d.area.r : true) && (d.when ? cond(d.when) : true) && (d.street ? String(turns?.nameAt?.(me().x, me().z) || '').toLowerCase().includes(d.street.toLowerCase()) : true);
      if (hit && !fired) {
        fired = true;
        if (d.cue) try { cue(d.cue); } catch {}
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
    if (partOf(d.name)) { M.log.push(['scene', d.name]); ui.objective(null); M.inScene = true; try { await runPart(d.name, d, t); } finally { M.inScene = false; } if (d.time) pinTo(d.time); holdPin(); if (d.time && !M.pin) setTime(d.time); return; }
    const play = Object.prototype.hasOwnProperty.call(SCENES, d.name) ? SCENES[d.name] : null;
    if (!play) { console.info(`[storyrun] ${M.def.id}: no Mog City scene '${d.name}'; it passes`); return; }
    M.log.push(['scene', d.name]);
    ui.objective(null);
    M.inScene = true;
    try { await play(W); } finally { M.inScene = false; }
    if (d.time) { if (M.pin) pinTo(d.time); else setTime(d.time); }
    holdPin();
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
    // (Mog City's own phases set their own time of day: a pinned mission's is put back after, holdPin)
    M.inScene = true;
    try { r = await Promise.race([go, wait(() => false, t)]); }
    catch (e) { go.catch(() => {}); mod.endParts(W); M.partMods.delete(m); throw e; }
    finally { M.inScene = false; }
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
      const q = { x: st.rx, y: 0, z: st.rz }; cm.resolveHorizontalCollision(q, T.half, (cm.baseHeight?.(st.rx, st.rz) || 0) + 1.0); st.rx = q.x; st.rz = q.z;
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

  /* ------------------------------------------------- a passenger's ride -- */
  // passenger with from / to: he drives to `from` (the pick-up), they get in (boardStep, above), and he drives them to
  // `to` under their rules: a speed limit (limit, in mph, on the HUD with his speed: over it for limitSecs s, a hard
  // one fails, a soft one costs its set and is said), and their comfort (comfort: a comfort step's own fields, run
  // beside the drive: its bar, its lines). At `to` they get out (drop: false keeps them in, for a later step).
  const boardStep = STEPS.passenger;
  STEPS.passenger = async (d, t) => {
    if (d.board === false || (!d.from && !d.to)) return boardStep(d, t);
    const who = castName(d.who);
    if (d.from) { const p = placeOf(d.from); await goTo(p, { radius: d.radius || 10 }, t, { objective: d.pickObjective || `Pick up **${who}**{blue} at **${p.name}**.`, needsCar: true }); }
    await boardStep({ ...d, from: null, to: null }, t);
    if (!d.to) return;
    const q = placeOf(d.to), st = tokOf(t), limit = d.limit || 0, rule = { over: 0 };
    if (d.comfort) side({ ...d.comfort, type: 'comfort', who: d.who, at: 0 }, st);
    let warned = 0, last = now();
    M.ride = { who, limit };
    try {
      await Promise.race([
        goTo(q, { radius: d.radius || 10 }, st, { objective: d.objective || `Take **${who}**{blue} to **${q.name}**.`, needsCar: true }),
        limit ? wait(() => {
          const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
          if (!inCar() || W.cutscene) return false;
          const mph = Math.abs(car.speed || 0) * MPH;
          ui.counter(mph > limit ? 'SLOW DOWN' : 'SPEED LIMIT', `${Math.round(mph)} / ${limit} MPH`);
          const r = speedRule(rule, car.speed || 0, dt, { max: limit / MPH, grace: d.limitSecs ?? 3 });
          if (r === 'warn' && tt - warned > 6000) { warned = tt; ui.help(tokens(d.warn || `${who} wants you to slow down.`), 3); }
          if (r === 'over') {
            if (d.fail === 'hard') throw new Fail(tokens(d.why || `You drove too fast with ${who} in the car.`), 'speed');
            rule.over = 0; applySet(d.set); if (d.flag) M.state.flags[flagName(d.flag)] = true;
            ui.help(tokens(d.why || `Too fast. ${who} didn't like that.`), 4);
          }
          return false;
        }, st) : new Promise(() => {}),
      ]);
    } finally { kill(st, new Stop()); for (const s of [...M.sides]) if (s.tok.parent === st) kill(s.tok, new Stop()); ui.counter(null); M.ride = null; }
    if (d.drop !== false) await boardStep({ who: d.who, board: false, secs: d.secs }, t);
  };

  /* ------------------------------------------- cars of the story's, driving -- */
  // A car the story drives (an ally's, a convoy's lead): its body as a tow's (towCar: a ride of the world's by id, or the
  // city's own body in a colour), on the planner's route through its places (m2-drive.js createDriver: it lives in the
  // traffic, brakes for what is ahead of it, and is solid to his car: a knock is onHit). M.allies by id: an ally's car
  // stays where it stopped for the rest of the mission, and a later ally or convoy step takes it on from there.
  function routeOf(list) {
    const pts = [];
    for (let k = 0; k + 1 < list.length; k++) {
      const a = list[k], b = list[k + 1];
      const seg = gps.plan({ x: a.x, z: a.z }, { x: b.x, z: b.z }, a.heading) || [[a.x, a.z], [b.x, b.z]];
      for (const q of seg) if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 3) pts.push(q);
    }
    return pts.length > 1 ? pts : [[list[0].x, list[0].z], [list[0].x + Math.sin(list[0].heading || 0) * 5, list[0].z + Math.cos(list[0].heading || 0) * 5]];
  }
  const ALLY_BODY = { hearse: 'van', van: 'van', sedan: 'sedan', suv: 'suv' };
  async function storyCar(id, d, at, name) {
    let A = M.allies.get(id);
    if (A) { if (d.name) A.name = name; return A; }
    const T = await towCar({ car: d.car || ALLY_BODY[d.lead] || 'sedan', color: d.color || '#5B1E2B' });
    T.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    app.scene.add(T.obj);
    A = { id, T, name, who: castName(d.who) || null, x: at.x, z: at.z, h: at.heading ?? 0, D: null };
    T.obj.position.set(at.x, cm.getGroundHeight(at.x, at.z, 'car'), at.z); T.obj.rotation.set(0, A.h, 0);
    M.allies.set(id, A);
    return A;
  }
  // drive A through `to` (a list of places, or 'player': to wherever he is, re-planned when it gets there and he has
  // moved on, up to 4 times). rules: { want(D, pd) -> m/s, hit(sp), tick(D, pd, dt) -> true when done }. Far from him
  // (300 m+, out of sight) it goes at twice its pace or more: `secs` is about how long it takes to get there.
  async function driveCar(A, to, d, t, rules = {}) {
    const { createDriver } = await import('../mission/m2-drive.js');
    const toPlayer = to === 'player', near = d.near || 14, base = d.speed || 13;
    const plan = () => routeOf([{ x: A.x, z: A.z, heading: A.h }, ...(toPlayer ? [{ x: me().x, z: me().z }] : to)]);
    let D = null, replans = 0, planned = now();
    const make = () => {
      D = createDriver(W, { obj: A.T.obj, path: plan(), halfW: A.T.half || 1.0, halfL: 2.35, onWheels: (dt, v, steer) => { try { A.T.rs?.update?.(dt, v, steer); } catch {} }, onHit: (sp) => rules.hit?.(sp) });
      D.place(0); A.D = D; planned = now();
    };
    make();
    const pace = d.secs ? D.length / d.secs : 0;
    let last = now(), told = 0;
    const blip = () => gps.blip('ally:' + A.id, { x: D.pos.x, z: D.pos.z, kind: 'friend', edge: true, name: A.name, label: true });
    blip();
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        if (!dt || W.cutscene) return false;
        const pd = dist(me(), D.pos.x, D.pos.z);
        let want = rules.want ? rules.want(D, pd) : base;
        // (out of his sight it makes up the time: on along its route at the pace that gets it there in secs)
        if (!rules.want && pd > 300) { want = Math.max(want, base * 2); if (pace > D.v && D.s < D.length - 60) D.s = Math.min(D.length - 60, D.s + (pace - D.v) * dt); }
        D.step(dt, want);
        A.x = D.pos.x; A.z = D.pos.z; A.h = D.heading;
        blip();
        if (tt - told > 1000) { told = tt; host.tell('progress', { mission: M.def.id, step: d.id || null, kind: d.type, i: M.i, n: M.def.steps.length, left: Math.max(0, Math.round(D.length - D.s)) }); }
        if (rules.tick && rules.tick(D, pd, dt)) return true;
        // (to him: there once it has pulled up beside or behind him, stopped (its route ends at his car, which it brakes for))
        if (toPlayer && pd < near && D.v < 0.8 && D.s > D.length * 0.5) return true;
        if (!D.done) return false;
        if (toPlayer && pd > near * 1.6 && replans < 4 && tt - planned > 2500) { replans++; make(); return false; }
        return !rules.tick;
      }, t);
    } finally { A.x = D.pos.x; A.z = D.pos.z; A.h = D.heading; A.D = null; gps.unblip('ally:' + A.id); }
  }
  // ally: a friend's car driving itself through the city (Carissa's): from `from` (or where it last stopped) to `to`, a
  // place or 'player' (wherever he is: it arrives where he is). Its blue blip on the radar the whole way; a step of its
  // own waits for it (the objective says so: d.objective, else 'Wait for <name>.'); as a side step (during) it drives
  // while the steps go on. There, its driver gets out beside it with out: true.
  STEPS.ally = async (d, t) => {
    const who = castName(d.who), name = tokens(d.name || (who ? `${who}'s car` : 'the car'));
    const A = await storyCar(d.ally || 'ally', d, placeOf(d.from || M.def.start), name);
    if (d.objective) gps.objective(parts(d.objective, 'blue'), null);
    M.ally = A;
    try { await driveCar(A, d.to === 'player' ? 'player' : [placeOf(d.to)], d, t); } finally { if (M.ally === A) M.ally = null; }
    M.log.push(['ally', A.id, 'arrived']);
    if (d.out && who) {
      const h = A.h, x = A.x + Math.cos(h) * 2.2, z = A.z - Math.sin(h) * 2.2;
      const f = await cast.spawn(who, { x, z, heading: Math.atan2(me().x - x, me().z - z) }); if (f) M.npcs.add(who);
    }
    if (d.flag) M.state.flags[flagName(d.flag)] = true;
  };
  // convoy: a car to stay with to its place (Carissa's, by its ally id; else one of the story's: lead, car, colour): its
  // route through the step's places at its pace, slowing for him when he falls behind; a band [near, far] m to keep in
  // (a bar: WITH THEM, TOO CLOSE, TOO FAR, draining outside it, refilling in it); knocks into it are its damage (hp, 100).
  // Out of the band too long (the bar empty): hard (the default) fails, soft costs its set and goes on, null only says
  // so. Wrecked: fails. Done when it is there and he is in the band's far end.
  STEPS.convoy = async (d, t) => {
    const route = d.route.map((r) => placeOf(r));
    const known = d.ally && M.allies.get(d.ally);
    const A = await storyCar(d.ally || 'convoy', d, route[0], tokens(d.name || known?.name || 'the car'));
    const [near, far] = Array.isArray(d.band) ? d.band : [6, 60];
    const st = { k: 1, out: 0 }, label = String(d.label || 'CONVOY').toUpperCase(), speed = d.speed || 11;
    let hp = d.hp || 100, wrecked = false, lastHit = 0;
    gps.objective(parts(d.objective || `Follow **${A.name}**{blue}.`, 'blue'), { follow: () => (A.D ? A.D.pos : { x: A.x, z: A.z }), name: A.name });
    M.convoy = { A, near, far };
    try {
      await driveCar(A, known ? route : route.slice(1), { ...d, near: far }, t, {
        want: (D, pd) => (pd > far * 0.8 ? speed * 0.3 : pd < near ? speed * 1.15 : speed),
        hit: (sp) => {
          if (now() - lastHit < 400 || sp < 1.5) return; lastHit = now();
          hp -= sp * (d.knock ?? 7); sfx.play('hit', { gain: 0.3 });
          if (hp <= 0) wrecked = true; else ui.help(tokens(d.hitLine || `Careful: that's ${A.name}.`), 2.5);
        },
        tick: (D, pd, dt) => {
          if (wrecked) throw new Fail(tokens(d.wreckWhy || `You wrecked ${A.name}.`), 'wreck');
          const w = bandRule(st, pd, dt, { near, far, drain: d.drain ?? 0.1, refill: d.refill ?? 0.08 });
          hud.bar(label, st.k, w === 'far' ? 'TOO FAR' : w === 'close' ? 'TOO CLOSE' : 'WITH THEM');
          if ((d.hp || hp < 100)) ui.counter('DAMAGE', `${Math.round(100 - Math.max(0, hp) / (d.hp || 100) * 100)}%`);
          if (st.k <= 0) {
            if (d.fail === 'soft') { st.k = 0.5; applySet(d.set); if (d.flag) M.state.flags[flagName(d.flag)] = true; ui.help(tokens(d.why || `You fell behind ${A.name}.`), 4); }
            else if (d.fail !== null) throw new Fail(tokens(d.why || `You lost ${A.name}.`), 'lost');
          }
          return D.done && pd < far;
        },
      });
    } finally { hud.bar(null); ui.counter(null); gps.clear(); M.convoy = null; }
    if (d.flag && d.fail !== 'soft') M.state.flags[flagName(d.flag)] = true;
  };

  /* --------------------------------------------------------------- stealth -- */
  // stealth: Mog City's own lookouts (m2-stealth.js, Mission 2's yard: a crew of one each, a cone on the ground going
  // yellow to red, the '?' over the head filling to '!', a sprint near one heard, E from behind takes one down) stood at
  // the step's units: '@place', on the kerb beside its lane, looking `heading` (degrees; across the street when left out),
  // sweeping, or walking `roam` m up and down the block. Goals: secs (stay unseen that long), to (get there unseen), or
  // neither (a watch kept beside the steps after it, the mission long). Seen (or one of them hit in the open):
  // onDetect 'fail' (the default: SPOTTED!, then the fail screen), { set } (it costs, and they look away a moment),
  // { goto } (the story goes on there), { pursuit } (they come after him: a chase to lose).
  STEPS.stealth = async (d, t) => {
    const [{ createStealth }, { createM2UI }] = await Promise.all([import('../mission/m2-stealth.js'), import('../mission/m2-ui.js')]);
    const U = W.m2ui || (W.m2ui = createM2UI(ui));
    const posts = d.units.map((u) => {
      // (on the pavement on the kerb side of its lane: the first point that is pavement going out from the lane, 2 to 16 m)
      const p = placeOf(u['@'] ? '@' + u['@'] : u), h = p.heading ?? 0, side = u.side ?? -1;
      let kerb = u.kerb ?? null;
      if (kerb == null) { kerb = 6.5; for (let k = 2; k <= 16; k += 0.5) if (cm.isPointOnSidewalk?.(p.x + Math.cos(h) * k * side, p.z - Math.sin(h) * k * side)) { kerb = k + 1.2; break; } }
      const x = p.x + Math.cos(h) * kerb * side, z = p.z - Math.sin(h) * kerb * side;
      const yaw = u.heading != null ? (u.heading * PI) / 180 : h - (PI / 2) * side;
      // (a beat along its lane, or `dir` degrees (0 the lane's way, 90 +x: down a cross street from a corner's place))
      if (u.roam > 0) { const r = Math.min(80, u.roam), hd = u.dir != null ? (u.dir * PI) / 180 : h; return { path: [[x, z], [x + Math.sin(hd) * r, z + Math.cos(hd) * r]], yaw: u.heading != null ? yaw : hd, speed: u.speed || 1.1, pause: u.pause ?? 2.5, name: u.name }; }
      return { at: [x, z], yaw, sweep: u.sweep ?? 0.8, period: 7, name: u.name };
    });
    const S = createStealth(W, { posts, U });
    await S.spawn();
    // (a moment to see them before they can see him: the step starts with him wherever the last one left him)
    S.grace = d.grace ?? 3;
    // (detect: the seconds a lookout has to keep him in sight 10 m off before he is seen; Mission 2's own is about 0.9 s.
    // Pickup Time's sneak says 2.5: time to see the bar empty and step back out of the cone. Up close it is at once.)
    if (d.detect > 0) S.rate = 0.92 / d.detect;
    M.stealth = S;
    const dest = d.to ? placeOf(d.to) : null, secs = d.secs || 0, onD = d.onDetect || 'fail';
    if (d.hint) ui.help(parts(d.hint), 8);
    if (dest) gps.objective(parts(d.objective || `Get to **${dest.name}** without being seen.`, 'yellow'), { x: dest.cx ?? dest.x, z: dest.cz ?? dest.z, name: dest.name });
    else if (secs) gps.objective(parts(d.objective || "Stay out of their sight."), null);
    let ring = null;
    if (dest) { ring = createMarker(THREE, app.scene, { color: '#FFC93C', radius: d.radius || 2.5, height: 1.1, alpha: 0.22 }); ring.at(dest.cx ?? dest.x, 0.02, dest.cz ?? dest.z); }
    let last = now(), unseen = 0, pursuing = null;
    const blipAll = () => { for (const L of S.lookouts) if (L.watching && L.e.alive) gps.blip('lk:' + L.id, { x: L.e.pos.x, z: L.e.pos.z, kind: 'enemy' }); else gps.unblip('lk:' + L.id); };
    try {
      await wait(() => {
        const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
        if (!dt || W.cutscene) return false;
        // (the test drive is never seen: it checks that the story plays through, the cones and all, not the sneaking)
        // (&stealthfair: the test drive sneaks for itself, seen if it is seen: a check that the sneak can be done)
        if (M.auto && !ctx.flags.stealthFair) S.grace = 5;
        const r0 = S.step(dt); blipAll();
        // (the cones read on a sunlit street: Mog City's are drawn for its twilight yard)
        for (const L of S.lookouts) if (L.cone.visible) L.cone.material.opacity = Math.max(L.cone.material.opacity * 2.4, 0.2);
        if (secs) { unseen += dt; hud.timer(Math.max(0, secs - unseen), d.label || 'STAY HIDDEN'); }
        // (how close he is to being seen, on the HUD: the most suspicious lookout's '?' as a bar, full while nobody has
        // noticed him, emptying as one does, so a player sees it coming, not just the SPOTTED! when it has)
        if (d.meter !== false && (dest || secs)) {
          const k = S.lookouts.reduce((a, L) => (L.watching && L.e.alive ? Math.max(a, L.sus) : a), 0);
          hud.bar(d.label || 'UNSEEN', 1 - k, k >= 0.66 ? 'THEY SEE YOU' : k > 0.05 ? 'SUSPICIOUS' : 'HIDDEN');
        }
        if (r0) {
          M.log.push(['stealth', 'seen', S.by?.name || '']);
          U.banner('SPOTTED!', tokens(d.why || `${S.by?.name || 'A lookout'} saw you.`), { color: '#EF4444', secs: 2.2 });
          sfx.play('stinger', { gain: 0.35, notes: [146.83, 138.59, 130.81, 123.47] });
          if (onD === 'fail') throw new Fail(tokens(d.why || 'You were spotted.'), 'seen');
          if (onD.set) { applySet(onD.set); for (const L of S.lookouts) { L.sus = 0; L.look = null; } S.by = null; S.grace = 4; unseen = 0; return false; }
          if (onD.goto) { M.gotoNow = onD.goto; return true; }
          if (onD.pursuit && !pursuing) { S.alarm(); pursuing = side({ type: 'pursuit', goal: 'lose', level: onD.pursuit.level || 2, count: onD.pursuit.count }, M.tok, true); return !dest && !secs; }
        }
        if (dest) return dist(me(), dest.cx ?? dest.x, dest.cz ?? dest.z) < (d.radius || 2.5) * (inCar() ? 3 : 1);
        if (secs) return unseen >= secs;
        return false;
      }, t);
    } finally {
      if (secs) hud.timer(null);
      if (d.meter !== false && (dest || secs)) hud.bar(null);
      ring?.hide(); if (ring) app.scene.remove(ring.group);
      for (const L of S.lookouts) gps.unblip('lk:' + L.id);
      try { S.dispose(); } catch {} U.banner?.(null);
      W.combat?.clear?.();
      if (M.stealth === S) M.stealth = null;
      gps.clear();
    }
  };

  /* ------------------------------------------------------------- a parked car -- */
  // car: one of the story's cars parked at the kerb at a place (a city body in a colour, or a ride of the world's by id:
  // the green minivan at Canal, Carissa's SUV), along its lane or `heading` degrees, `back` m short of the corner; solid
  // to his car (crash's standing vehicles). `name` names it; { name, remove: true } takes it away. A search beside it is a
  // search at the place
  STEPS.car = async (d) => {
    const id = d.name || d.id || d.car || 'car';
    if (d.remove) { const c = M.parked.get(id); if (c) { app.scene.remove(c.obj); M.parked.delete(id); } return; }
    const p = placeOf(d.at), h = d.heading != null ? (d.heading * PI) / 180 : p.heading ?? 0, back = d.back ?? 16, side = d.kerb ?? 3.2;
    const T = await towCar({ car: d.car, color: d.color || '#2F5D3A' });
    T.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const x = (p.cx ?? p.x) - Math.cos(h) * side - Math.sin(h) * back, z = (p.cz ?? p.z) + Math.sin(h) * side - Math.cos(h) * back;
    // (ahead of the car's body: the lane point is its middle)
    T.obj.position.set(x, cm.getGroundHeight(x, z, 'car'), z); T.obj.rotation.set(0, h, 0);
    T.obj.name = 'wagmi-parked';
    const old = M.parked.get(id); if (old) app.scene.remove(old.obj);
    app.scene.add(T.obj); M.parked.set(id, T);
  };

  /* -------------------------------------------------------------- roadblock -- */
  // roadblock: `cars` cars (2 by default; police: NYPD cruisers, their bars lit; crew: the black cars of the story's
  // crew) parked across the street at `at`, before its corner, with `crew` men stood beside them (they don't fight unless
  // he gets out among them). The GPS routes round it (gps.avoid: r m round it); the traffic goes round them. Rammed at
  // speed (ramSpeed m/s, 11: ram false stops that) a car is knocked out of the way and he is through, slowed.
  // With `to` it is a step of its own: get past it to there; without, the block stays up beside the steps after it.
  STEPS.roadblock = async (d, t) => {
    const p = placeOf(d.at), h = p.heading ?? 0, n = Math.max(1, Math.min(4, d.cars || 2));
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const back = d.back ?? 10, c0 = { x: (p.cx ?? p.x) - fx * back, z: (p.cz ?? p.z) - fz * back };
    // (across the whole street: centred on its middle, the corner's line, not the lane's)
    const { buildChaseCar } = await import('../pursuit/cars.js');
    const TS = app.trafficSystem, police = d.kind === 'police';
    const B = { id: 'rb:' + (++blockSeq), at: c0, r: d.r || 16, cars: [], avoid: { x: c0.x, z: c0.z, r: d.r || 16 }, crew: null, hit: null };
    for (let i = 0; i < n; i++) {
      const c = buildChaseCar(police ? 'police' : 'suits', i), g = c.group, off = (i - (n - 1) / 2) * 3.6;
      g.name = 'wagmi-parked';
      const x = c0.x + rx * off + fx * (i % 2 ? 1.2 : -1.2), z = c0.z + rz * off + fz * (i % 2 ? 1.2 : -1.2), yaw = h + PI / 2 + (i % 2 ? 0.32 : -0.32);
      g.position.set(x, cm.getGroundHeight(x, z, 'car'), z); g.rotation.set(0, yaw, 0);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      app.scene.add(g);
      const bl = { x, z, yaw, halfW: c.hw || 0.95, halfL: c.hl || 2.3, vx: 0, vz: 0 };
      if (Array.isArray(TS.blockers)) TS.blockers.push(bl);
      B.cars.push({ g, bl, knocked: false, v: null });
    }
    gps.avoid?.push(B.avoid);
    if (d.crew && W.combat?.spawnCrew) try { B.crew = W.combat.spawnCrew({ x: c0.x + fx * 4 + rx * 5, z: c0.z + fz * 4 + rz * 5, count: Math.min(4, d.crew), aggro: false, props: false }); } catch (e) { console.warn('[storyrun] roadblock crew', e); }
    gps.blip(B.id, { x: c0.x, z: c0.z, kind: 'enemy', edge: false, name: tokens(d.text || 'Roadblock') });
    M.blocks.push(B);
    // rammed: a hit on one of them at speed knocks it aside (no longer solid), spinning, and he goes on through slowed
    const ramAt = d.ram === false ? Infinity : (d.ramSpeed || 11);
    let last = now();
    B.hit = W.crash?.on?.('hit', (e) => {
      if (e?.other !== 'wagmi-parked' || !(e.speed >= ramAt)) return;
      let best = null, bd = 6; for (const c of B.cars) { if (c.knocked) continue; const q = Math.hypot(c.g.position.x - car.position.x, c.g.position.z - car.position.z); if (q < bd) { bd = q; best = c; } }
      if (!best) return;
      best.knocked = true; best.g.name = 'wagmi-knocked';
      const k = TS.blockers?.indexOf(best.bl); if (k >= 0) TS.blockers.splice(k, 1);
      const s = Math.sin(car.heading), co = Math.cos(car.heading), side = ((best.g.position.x - car.position.x) * co - (best.g.position.z - car.position.z) * s) >= 0 ? 1 : -1;
      best.v = { x: s * e.speed * 0.6 + co * side * 4, z: co * e.speed * 0.6 - s * side * 4, spin: side * 3.2, t: 0 };
      car.speed = Math.max(car.speed || 0, e.speed * 0.55);
      sfx.play('boom', { gain: 0.35 }); M.state.flags[flagName(d.flag || 'rammed roadblock')] = true; M.log.push(['roadblock', 'rammed']);
      // (through it: a beat of slow motion on the hit, the camera thrown, the word)
      juice.slow(0.7, 0.3); juice.alert('Through!', { tone: 'green', sting: 'hit', secs: 1.6, jolt: 0.6 });
    });
    const anim = () => {
      const tt = now(), dt = Math.min(0.05, (tt - last) / 1000); last = tt;
      if (!warned && dist(me(), c0.x, c0.z) < 170) { warned = true; juice.alert(police ? 'Police roadblock' : 'Roadblock', { sub: 'Ram it at speed, or find a way round.', tone: 'red', sting: 'hit', secs: 2.6 }); }
      for (const c of B.cars) if (c.v && c.v.t < 1.6) { c.v.t += dt; const f = Math.max(0, 1 - c.v.t / 1.6); c.g.position.x += c.v.x * dt * f; c.g.position.z += c.v.z * dt * f; c.g.rotation.y += c.v.spin * dt * f; c.g.position.y = cm.getGroundHeight(c.g.position.x, c.g.position.z, 'car'); }
    };
    if (d.text) ui.help(parts(d.text), 6);
    // (its alarm as he comes up on it, not when it is stood up blocks away)
    let warned = false;
    const dest = d.to ? placeOf(d.to) : null;
    try {
      if (dest) await Promise.race([goTo(dest, d, t, { objective: d.objective || `Get past the roadblock to **${dest.name}**.`, needsCar: !!M.def.vehicle }), wait(() => { anim(); return false; }, t)]);
      else await wait(() => { anim(); return false; }, t);
    } finally { dropBlock(B); }
  };
  let blockSeq = 0;
  function dropBlock(B) {
    const i = M.blocks.indexOf(B); if (i < 0) return;
    M.blocks.splice(i, 1); gps.unblip(B.id);
    const TS = app.trafficSystem;
    for (const c of B.cars) { app.scene.remove(c.g); const k = TS.blockers?.indexOf(c.bl); if (k >= 0) TS.blockers.splice(k, 1); }
    const k = gps.avoid?.indexOf(B.avoid); if (k >= 0) gps.avoid.splice(k, 1);
    try { B.hit?.(); } catch {}
  }

  for (const k of KINDS_STUB) STEPS[k] = async (d) => { if (!M.stubbed.has(k)) { M.stubbed.add(k); console.info(`[storyrun] ${M.def.id}: '${k}' has no Mog City part yet; it passes`); } applySet(d.set); };

  /* ------------------------------------------------------- side steps -- */
  function side(d, hostTok, persist = false) {
    if (d.if && !cond(d.if)) return null;
    const st = tokOf(persist || d.persist || d.until ? M.tok : hostTok);
    const s = { def: d, tok: st, until: typeof d.until === 'string' ? d.until : null };
    M.sides.add(s);
    (async () => {
      try {
        // (a side step's at is seconds in; a roadblock's or a car's at is its place, never a delay: a roadblock kept
        // beside the steps after it waited on delay('@toll') for ever and never stood up)
        if (typeof d.at === 'number' && d.at > 0) await delay(d.at, st);
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

  /* ------------------------------------------------------- the idle nudge -- */
  // a player who has stopped getting anywhere is told again what to do: on a step he travels or acts in, after `idle`
  // s (the step's, the mission's, the world's; 25) with no 4 m covered and nothing said, the step's `nudge` line
  // ([who, text], else the mission's or the world's `nudge`, its {objective} the step's objective in plain words) said
  // over the radio, the objective flashed again with its help; then again every 40 s, at most three times a step.
  const IDLE_STEPS = new Set(['drive', 'walk', 'collect', 'search', 'mount', 'sneak', 'drove', 'track', 'stops']);
  const plain = (o) => tokens(String(o || '')).replace(/\*\*(.+?)\*\*(\{\w+\})?/g, '$1');
  function idleNudge(d, t) {
    const line = d.nudge || M.def.nudge || def0.nudge;
    if (!line && !d.objective) return;
    const after = (d.idle || M.def.idle || def0.idle || 25) * 1000;
    let at = me(), since = now(), told = 0;
    wait(() => {
      const q = me(), tt = now();
      if (W.cutscene || W.paused || saying > 0 || W.calls?.live || M.crew) { since = tt; return false; }
      if (dist(q, at.x, at.z) > 4) { at = { x: q.x, z: q.z }; since = tt; return false; }
      if (tt - since > (told ? 40000 : after) && told < 3) {
        told++; since = tt;
        if (d.objective) { ui.help(parts(d.objective), 6); juice.alert('Objective', { sub: plain(d.objective), tone: 'yellow', secs: 2.4 }); }
        if (line) { const b = tuple(line); say(castName(b.who), String(b.text).replace(/\{objective\}/g, plain(d.objective).replace(/\.$/, '').toLowerCase()), M.tok, { phone: castName(b.who) !== heroName }).catch(() => {}); }
        M.log.push(['nudge', d.id || d.type]);
      }
      return false;
    }, t).catch(() => {});
  }

  /* --------------------------------------------------------- a mission -- */
  function snapshot(i) {
    const e = cm.getActiveEntity();
    return { i, stats: { ...M.stats }, state: JSON.parse(JSON.stringify(M.state)), timers: M.timer.timers.snapshot(), pin: M.pin, at: { x: e.position.x, z: e.position.z, heading: e.heading, mode: inCar() ? 'car' : 'walk' } };
  }
  function tidy() {
    for (const s of M.sides) kill(s.tok, new Stop());
    M.sides.clear();
    W.calls?.stop({ quiet: true, of: 'pack:' });
    try { M.chase?.stop?.(); } catch {}
    if (M.crew) W.combat?.clear?.();
    if (M.creatures) dropCreatures();
    if (M.kept) { for (const h of M.kept.values()) try { h.remove(); } catch {} M.kept = null; }
    M.wild = null; hud.bar?.(null);
    if (M.herds) { for (const h of M.herds.values()) try { h.remove(); } catch {} M.herds = null; }
    hud.clear(); M.timer.stop(); juice.clear(); juice.live = false;
    ui.objective(null); ui.sub(null); ui.help(null); ui.counter(null); ui.caller(null); ui.hold(null); ui.phone?.hide?.(); ui.offer?.(null);
    gps.clear(); app.mapSystem.waypoint = null; for (const id of [...gps.blips.keys()]) gps.unblip(id); marker.hide();
    for (const n of M.npcs) cast.hide(n); M.npcs.clear();
    dropRiders();
    // (a tow cut short: the car on the hook put away, the truck as it was)
    if (M.towing) { app.scene.remove(M.towing.obj); M.towing = null; }
    if (M.towKeep) { Object.assign(car, M.towKeep); M.towKeep = null; }
    M.tow = null; W.carF = null; car.roadster?.tow?.set(0, 0); car.roadster?.setBeacon?.(false);
    // (the story's cars, its roadblocks, its lookouts: put away)
    for (const A of M.allies.values()) { app.scene.remove(A.T.obj); gps.unblip('ally:' + A.id); } M.allies.clear(); M.ally = null; M.convoy = null; M.ride = null;
    for (const B of [...M.blocks]) dropBlock(B);
    for (const c of M.parked.values()) app.scene.remove(c.obj); M.parked.clear();
    if (M.stealth) { try { M.stealth.dispose(); } catch {} M.stealth = null; W.m2ui?.clear?.(); }
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
      cp: cp || null, auto: !!ctx.flags.autopilot, stats: cp?.stats ? { ...cp.stats } : { hits: 0, ko: 0 }, live: false, pin: null, inScene: false, allies: new Map(), blocks: [], parked: new Map(),
      fail(e) { if (!M.tok.dead) kill(M.tok, e instanceof Fail ? e : new Fail(e?.reason || e?.message || String(e), 'timeout')); },
    };
    for (const m of meterDefs()) if (M.state.meters[m.id] == null) M.state.meters[m.id] = m.start ?? 0;
    W.mission = { id: def.id, phase: null, stop: () => kill(M.tok, new Stop()), pack: true };
    juice.live = true;
    showMeters();
    // the mission timer and the countdown's end
    const timerLoop = (async () => {
      try {
        await wait(() => {
          for (const x of M.timer.tick()) {
            const o = x.opts;
            if (o.fail === 'soft') { if (o.flag) M.state.flags[flagName(o.flag)] = true; applySet(o.set); ui.help(tokens(o.why || 'Late.'), 4); sfx.play('failed', { gain: 0.18 }); }
            else throw new Fail(tokens(o.why || 'You ran out of time.'), 'time');
          }
          holdPin();
          return false;
        }, M.tok);
      }
      catch (e) { if (e instanceof Fail) M.fail(e); }
    })();
    // (the mission's own ride: a world's rides sheet its vehicle names is worn by the hero's car for it (ride.js
    // wearRide); every other mission puts the hero car's own body back)
    { const sheet = (def0.rides && def.vehicle && def0.rides[def.vehicle]) || null;
      if (sheet || car.roadster?.__worn?.id) { try { const R = await import('./ride.js'); R.wearRide(THREE, car, sheet); } catch (e) { console.warn('[storyrun] ride', e); } } }
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
      M.timer.timers.restore(cp.timers);
    } else {
      M.cp = { ...snapshot(0) };
      if (def.start) { const p = placeOf(def.start); putPlayer(p, (typeof def.start === 'object' && def.start.mode) || (def.vehicle ? 'car' : 'walk')); M.cp = snapshot(0); }
    }
    // (the mission's time of day: its own, pinned (holdPin), else the world's; a world that says none is in daylight)
    const own = def.time || act?.timeline?.[def.id]?.time || null;
    if (cp?.pin) pinTo(cp.pin); else if (own) pinTo(own); else setTime(def0.dressing ? (def0.dressing.time || 'day') : null);
    M.live = true;
    // (the title card, unless the mission's first scene draws its own: Mog City's opening ends on ACT I · BAGGED)
    if (def.card !== false && !(cp && cp.from)) ui.title(act?.name || '', def.title, ctx.flags.autoCard ? 1.2 : 2.6);
    host.tell('mission-start', { id: def.id, title: def.title });
    let i = M.i;
    while (i < steps.length) {
      const d = steps[i];
      if (d.if && !cond(d.if)) { i++; continue; }
      if (d.checkpoint && (!M.cp || M.cp.i !== i)) { M.cp = snapshot(i); try { ctx.onCheckpoint?.(def.id, M.cp); } catch {} }
      M.i = i; W.mission.phase = d.id || `${d.type}:${i}`;
      ui.step(`pack:${def.id}:${i}`);
      host.tell('progress', { mission: def.id, step: d.id || null, kind: d.type, i, n: steps.length });
      if (background(d)) { side(d, M.tok, true); if (d.after) applySet(d.after); i++; continue; }
      // (set dressing a step needs, a Mog City set piece: 'm1.park'; at once, before the step)
      if (d.dress && Object.prototype.hasOwnProperty.call(SCENES, d.dress)) { try { await SCENES[d.dress](W); } catch (e) { console.warn('[storyrun] dress', d.dress, e); } }
      const st = tokOf(M.tok);
      // (a step with nothing to go and do, a call after a drive, a wait, a line, a choice: the last step's objective, done
      // now ('Take the van to Murray Hill Grammar' under the headmaster's call), comes down; its own objective if it has one)
      if (QUIET_STEPS.has(d.type) && !d.ref) ui.objective(d.objective ? parts(d.objective) : null);
      // (the step's help lines, Mog City's tips: [secs in, text, 'car' | 'person' only])
      for (const h of Array.isArray(d.help) ? d.help : []) if (Array.isArray(h)) delay(h[0] || 0, st).then(() => ui.help(parts(String(h[1] || '')), h[3] || 7, h[2] ? { mode: h[2] } : {})).catch(() => {});
      for (const x of d.during || []) side(x, st);
      if (IDLE_STEPS.has(d.type) && !d.ref) idleNudge(d, st);
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
  // (resume: a checkpoint saved in an earlier session (index.js Continue), its snapshot as attempt() took it)
  async function play(def, { act = null, from = null, resume = null } = {}) {
    let cp = resume && Number.isInteger(resume.i) && resume.i > 0 && resume.i < def.steps.length && resume.at ? resume : null, fails = 0;
    // (?step=<id>: from that step, where its `from` puts him; a dev and Mission select start)
    if (from) { const i = def.steps.findIndex((s) => s.id === from); if (i >= 0) cp = { i, from: def.steps[i].from || def.start, state: { meters: { ...ctx.save.meters }, flags: { ...ctx.save.flags }, forks: {} }, timers: [] }; }
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
          // (the attempt is over: its token killed, as a pass kills it. A step that throws its Fail (a pursuit's 'They
          // caught you') left it alive, and that attempt's timer loop ran on for good, ticking and pinning whatever
          // mission came after: after PT-14's retry it held PT-15's midnight over the story's free roam)
          const at = M; kill(at.tok, e instanceof Fail ? e : new Stop()); tidy();
          if (restartTo) { cp = restartTo === 'start' ? null : at.cp; restartTo = null; continue; }
          if (!(e instanceof Fail)) { if (!(e instanceof Stop)) console.error('[storyrun]', def.id, e); return { how: 'quit' }; }
          fails++;
          const step = def.steps[at.i];
          host.tell('mission-fail', { id: def.id, why: e.reason, step: step?.id || null, kind: step?.type || null });
          if (!e.sounded) sfx.play('failed');
          if (ctx.flags.autopilot && (ctx.flags.failStop || fails >= 3 || e.kind === 'timeout' || e.kind === 'place')) return { how: 'fail', why: e.reason };
          const pick = ctx.flags.autoRetry ? (await new Promise((r) => setTimeout(r, 1200)), 'retry') : await ui.failed(e.reason, { skip: fails >= 3, tip: e.tip || TIPS[e.kind === 'time' && car.noBoost ? 'timeSlow' : e.kind] || null, retryLabel: at.cp && at.cp.i > 0 ? 'Retry: from the checkpoint' : 'Retry: from the start' });
          if (pick === 'quit') return { how: 'quit' };
          if (pick === 'skip') { cp = { ...at.cp, i: Math.min(def.steps.length, (at.i || 0) + 1) }; continue; }
          cp = at.cp && at.cp.i > 0 ? at.cp : null;
        }
      }
    } finally { registry(W).unregister?.(reg.id); }
  }
  // the key light lent to the key art's hero shot (index.js heroShot): placed where it says, at its strength and reach,
  // or back to off (null). Its position, strength and reach are uniforms: nothing is rebuilt
  const lamp = (at, intensity = 0, reach = 4.5) => {
    if (!at) { keyL.intensity = 0; keyL.distance = 4.5; return; }
    keyL.position.set(at[0], at[1], at[2]); keyL.intensity = intensity; keyL.distance = reach;
  };
  return { play, opening, get M() { return M; }, tidy: () => M && tidy(), say, putPlayer, placeOf, goTo, lamp, showMeters, streetAct };
}
