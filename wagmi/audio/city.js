// Mog City: New York's own sound, always on (the amb bus), shaped by where the camera is (where: traffic 0..1, the
// cars about; crowd 0..1, the people about; park 0..1; avenue 0..1, near an avenue and its subway line):
//   a bed      the low roar of traffic blocks away, steady; the block's engines (a few cars and trucks down the street,
//              idling at the light, pulling away up through a gear, gone, the next one along); the city's air (rooftop
//              fans and window units, a soft rumble of noise, no tones); a thin grain of tyres; the crowd's walla (real
//              people talking, recorded: louder and brighter the more people are about, never over the street)
//   events     a distant honk now and then (rarer in a park), a siren a long way off now and then, the subway
//              rumbling under the avenue, someone calling out down the block, pigeons cooing and taking off, sparrows in
//              the parks, a building site's clangs, jackhammer and backing truck, a doorman whistling for a cab, a
//              helicopter going over, the crowd's footfalls
// Nothing in the bed swells and falls on its own: broadband noise breathing slowly is the sea, not a street. The noise
// is kept low and steady and the street's life is in tones (engines, horns, sirens, voices) that come and go.
// Calmer in parks (the traffic falls away, the birds come up); the whole bus is muffled inside the car (core.js).
import { SOUNDS } from './sounds.js';
import { motorLoad } from './motors.js';

// the crowd's walla: real people talking (CC0 recordings, see NOTICE: Crowd sounds), cut into a seamless loop of a street's
// crowd (assets/sfx/city/crowd-walla.m4a): fetched and decoded once, when the city's sound starts
const WALLA_URL = new URL('../../assets/sfx/city/crowd-walla.m4a', import.meta.url);
let walla = null;
export function loadWalla(ctx) {
  return (walla ||= fetch(WALLA_URL).then((r) => { if (!r.ok) throw new Error(r.status + ' crowd-walla'); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b)).catch((e) => { walla = null; throw e; }));
}

export function createCity(M, E) {
  const out = M.bus.amb, R = M.R;
  const layer = (buf, type, f, q, rate = 1, at = 2) => { const s = M.src(buf, { rate }), fl = M.filt(type, f, q), g = M.gain(0, out); s.connect(fl); fl.connect(g); s.start(0, R() * at); return { s, fl, g }; };
  // the far traffic: a low roar, nothing in it above a few hundred hertz (nor much of the deepest, felt more than heard),
  // and steady
  const roar = layer(M.brown, 'bandpass', 120, 0.55, 0.8);
  // the road: a thin band of tyre grain, well under the engines; a breath of air over the top
  const road = layer(M.pink, 'bandpass', 1050, 0.9);
  const hiss = layer(M.white, 'highpass', 3600, 0.5);
  // the city's air: rooftop fans and window units, a soft wide rumble of noise just under everything (no tones: steady
  // sines at the mains' 120 and 180 and a fan's blade rate read as a drone, a hum in the head, not a street)
  const air = layer(M.pink, 'bandpass', 340, 0.7), AIR = 0.012;

  // the block's engines: three cars or trucks somewhere down the street, each on its own little story: idling at the
  // light, then pulling away up through a gear (or not), fading off, and a while later another one, somewhere else.
  // Each a real engine (motors.js, after Slop New York: a car's, an SUV's or a bus's diesel; its own gearbox makes the
  // change up), made for its story and let go after it; placed at a pan and a distance, not in the world
  const engOut = M.gain(0, out), ENG = 4.5;   // (ENG: their level, a little under the old saws' (they were louder than the street's own cars))
  const engines = [0, 1, 2].map((i) => ({ sp: M.spot(engOut, null, { ref: 8, verb: 0.5 }), g: null, mv: null, st: 'gap', t: 0.5 + i * 1.7 + R() * 2, kind: 'sedan', v: 0, pan: 0, d: 60, speed: 0, acc: 0, vmax: 12, next: 0, seed: R() }));
  for (const e of engines) e.g = M.gain(0, e.sp.in);
  // an engine's next step (the place: how much traffic, how much city)
  function engine(e, traffic, city, avenue) {
    const t = M.now(), F = (p, v, k) => p.setTargetAtTime(v, t, k);
    if (e.st === 'gap') {
      // a new one: a car (or on an avenue now and then a truck or a bus) a block or so off, idling
      if (city < 0.3 && R() < 0.8) { e.t = 4 + R() * 6; return; }
      const truck = R() < 0.12 + 0.2 * avenue;
      e.kind = truck ? 'bus' : R() < 0.3 ? 'suv' : 'sedan';
      if (!M.motors?.ready(e.kind)) { e.t = 1; return; }
      e.pan = R() * 1.8 - 0.9; e.d = (truck ? 45 : 30) + R() * (90 - 40 * avenue);
      e.v = (0.5 + 0.5 * R()) * (truck ? 1.25 : 1);
      e.sp.fixed(e.pan, e.d);
      e.mv?.dispose(); e.mv = M.motors.voice(e.kind, e.g); e.seed = R(); e.next = 0;
      e.speed = 0; e.acc = 0; e.vmax = truck ? 9 + R() * 3 : 12 + R() * 5;
      F(e.g.gain, e.v * 0.55, 1.2);
      e.st = 'idle'; e.t = 2 + R() * 6;
    } else if (e.st === 'idle') {
      // green: away up through first (most of them), or just fading off (it was round the corner)
      if (R() < 0.75) { e.acc = e.kind === 'bus' ? 0.9 + R() * 0.3 : 1.1 + R() * 0.7; F(e.g.gain, e.v, 0.35); e.st = 'pull'; e.t = (e.kind === 'bus' ? 6 : 4.5) + R() * 2; }
      else { F(e.g.gain, 0, 1.5); e.st = 'away'; e.t = 4; }
    } else if (e.st === 'pull') {
      // gone down the avenue: quieter, duller, drifting across (still pulling a while: its next gear)
      F(e.g.gain, 0, 1.6);
      e.sp.fixed(Math.max(-1, Math.min(1, e.pan + (R() - 0.5) * 0.8)), e.d * 1.8, 1.5);
      e.st = 'away'; e.t = 5 + R() * 2;
    } else if (e.st === 'away') {
      F(e.g.gain, 0, 0.08); e.st = 'gone'; e.t = 0.4;
    } else {
      e.mv?.dispose(); e.mv = null; e.acc = 0;
      e.st = 'gap'; e.t = 0.4 + R() * 4 / (0.3 + traffic);
    }
  }
  // the crowd's walla (M.babble, the crowd bed: loops.js's crowd() plays it too), through a low-pass that opens as the
  // crowd comes close (a few people far off are a dull murmur; a packed sidewalk is voices)
  let murmur = null;
  const WALLA = 0.2;   // (on a packed sidewalk: about 2 dB under the rest of the street's bed together)
  const startMurmur = (buf) => { if (murmur) return; M.babble = buf; murmur = layer(buf, 'lowpass', 3000, 0.5, 1, buf.duration - 0.5); };
  if (M.babble) startMurmur(M.babble);
  else if (M.live) loadWalla(M.ctx).then(startMurmur).catch((e) => console.warn('[audio] no crowd walla:', e));

  // an event somewhere about: pan -1..1, d metres away
  const at = (name, o) => E.play(name, { bus: 'amb', ...o, pan: o.pan ?? R() * 1.8 - 0.9, d: o.d ?? 60 });
  const T = { honk: 1, siren: 20 + R() * 40, subway: 25 + R() * 30, coo: 3, chirp: 2, flutter: 30, build: 15 + R() * 30, whistle: 40 + R() * 40, heli: 90 + R() * 120, steps: 0, call: 4 + R() * 8 };
  let farSiren = null, heli = null, subway = null;
  const w = { traffic: 0.5, crowd: 0.3, park: 0, avenue: 0.5 };
  let bedTraffic = 0.5;

  function update(dt, where) {
    // the place, eased (a cut doesn't snap it)
    const k = Math.min(1, dt / 1.2);
    for (const key in w) w[key] += ((where[key] ?? w[key]) - w[key]) * k;
    const { traffic, crowd, park, avenue } = w, city = 1 - 0.75 * park, t = M.now();
    // (the bed follows the traffic slowly: cars bunching past are the traffic voices' to make, not a swell in the bed)
    bedTraffic += (traffic - bedTraffic) * Math.min(1, dt / 6);
    const tb = bedTraffic, set = (p, v) => p.setTargetAtTime(v, t, 0.6);
    set(roar.g.gain, city * (0.05 + 0.05 * avenue + 0.06 * tb));
    set(road.g.gain, city * (0.01 + 0.022 * avenue + 0.016 * tb));
    set(hiss.g.gain, city * (0.003 + 0.005 * tb));
    set(air.g.gain, AIR * (1 - park) * (1 - 0.4 * tb));
    set(engOut.gain, ENG * city * city * (0.58 + 0.5 * tb));
    for (const e of engines) {
      if ((e.t -= dt) <= 0) engine(e, tb, city, avenue);
      // (its revs: what it does, ~15 times a second; once it's away the throttle eases to a cruise)
      if (!e.mv) continue;
      e.speed = Math.min(e.vmax, e.speed + e.acc * dt);
      if ((e.next -= dt) <= 0) { e.next = 0.066; const acc = e.speed < e.vmax ? e.acc * (e.st === 'away' ? 0.5 : 1) : 0; e.mv.update({ speed: e.speed, load: motorLoad(e.speed, acc, e.kind), seed: e.seed }); }
    }
    // (the walla: a breath of it with anyone about, its full level only on a packed sidewalk, and even then under the
    // traffic; the low-pass from a far murmur's 1.6 kHz to a near crowd's 9)
    if (murmur) { set(murmur.g.gain, WALLA * (0.1 + 0.9 * crowd * crowd)); set(murmur.fl.frequency, 1600 + 7400 * crowd); }

    // events, each on its own clock (faster where it belongs)
    for (const key in T) T[key] -= dt;
    // (Mog City, 28 Oct, owner: "way too much honking": a far horn now and then, short and soft; one every 25-70 s on a
    // busy avenue, a few minutes apart in a park. A horn up close is a crash's: wagmi/audio/traffic.js, wagmi/crash)
    if (T.honk <= 0) { at('horn', { d: 90 + R() * 200, vol: 0.3 + R() * 0.3, len: M.pick(['tap', 'beep', 'double']), verb: 0.7 }); T.honk = (25 + R() * 45) / (0.3 + 0.7 * traffic * city); }
    if (T.siren <= 0 && !farSiren) {
      // a siren somewhere out there: in, along, away, its pitch sliding as it goes
      const dur = 12 + R() * 14, p0 = R() * 2 - 1, p1 = Math.max(-1, Math.min(1, p0 + (R() - 0.5) * 1.4)), d0 = 220 + R() * 380;
      const L = E.loop('siren', { bus: 'amb', vol: 0, pan: p0, d: d0 * 2, ref: 22, verb: 0.9 });
      farSiren = { L, t: 0, dur, p0, p1, d0, mode: R() < 0.7 ? 'wail' : 'yelp', sw: 4 };
      T.siren = 35 + R() * 70;
    }
    if (farSiren) {
      const s = farSiren; s.t += dt; s.sw -= dt;
      const k2 = s.t / s.dur, env = Math.sin(Math.PI * Math.min(1, k2)), dop = 1.025 - 0.05 * k2;
      if (s.sw <= 0) { s.mode = s.mode === 'wail' ? 'yelp' : 'wail'; s.sw = 3 + R() * 5; }
      // (in from twice as far, closest halfway, away again)
      s.L.set({ mode: s.mode, dop, vol: 0.5 * env * (0.6 + 0.4 * city), pan: s.p0 + (s.p1 - s.p0) * k2, d: s.d0 * (1 + Math.abs(1 - 2 * k2)) });
      if (k2 >= 1) { s.L.stop(0.5); farSiren = null; }
    }
    if (T.subway <= 0) {
      T.subway = 30 + R() * 50;
      if (avenue > 0.35 && park < 0.5) subway = { t: 0, dur: 7 + R() * 4, n: 0 };
    }
    if (subway) {
      // under the grates: the rumble swelling and going, the wheels' da-dum over the joints, a far squeal of steel
      const s = subway; s.t += dt;
      const k2 = s.t / s.dur, env = Math.sin(Math.PI * Math.min(1, k2));
      if (!s.L) { s.L = E.loop('rumble', { bus: 'amb', vol: 0, f: 90 }); s.Q = E.loop('squeal', { bus: 'amb', vol: 0, f: 2600 }); }
      s.L.set({ vol: 0.3 * env * avenue });
      s.Q.set({ vol: 0.01 * env * env * avenue });
      if (s.t > s.n * 0.62 && k2 < 0.9) { s.n++; for (const dd of [0, 0.13]) E.play('kerb', { bus: 'amb', k: 0.3 * env, vol: avenue, pan: 0, d: 12 + dd }); }
      if (k2 >= 1) { s.L.stop(0.5); s.Q.stop(0.5); subway = null; }
    }
    // (no pigeon coo: it read as an owl hooting in the background, the owner, 24 Oct)
    if (T.chirp <= 0) { if (park > 0.2) at('chirps', { d: 8 + R() * 30, vol: park }); T.chirp = 1 + R() * 4; }
    if (T.flutter <= 0) { at('flutter', { d: 4 + R() * 14, vol: 0.6 }); T.flutter = 20 + R() * 40; }
    if (T.build <= 0) {
      T.build = 30 + R() * 60;
      if (park < 0.5) {
        const d = 40 + R() * 110, pan = R() * 1.8 - 0.9, kind = R();
        if (kind < 0.45) { const n = 3 + Math.floor(R() * 5), f = 360 + R() * 140; let dl = 0; for (let i = 0; i < n; i++) { at('clang', { d, pan, f, vol: 0.8, delay: dl }); dl += 0.55 + R() * 0.25; } }
        else if (kind < 0.8) at('jackhammer', { d, pan, vol: 0.7 });
        else at('beeper', { d: d * 1.5, pan, n: 4 + Math.floor(R() * 5), vol: 0.5 });
      }
    }
    // someone down the block calling out to someone (more of it where people are)
    if (T.call <= 0) { if (park < 0.7 || crowd > 0.3) at('call', { d: 30 + R() * 90, vol: 0.4 + 0.4 * R(), verb: 0.85 }); T.call = (5 + R() * 14) / (0.35 + crowd); }
    if (T.whistle <= 0) { if (park < 0.5) at('whistle', { d: 30 + R() * 60, vol: 0.4 + 0.6 * crowd }); T.whistle = 50 + R() * 70; }
    if (T.heli <= 0 && !heli) { heli = { t: 0, dur: 18 + R() * 10, p0: R() * 2 - 1 }; heli.L = E.loop('heli', { bus: 'amb', vol: 0, pan: heli.p0, d: 300, ref: 30 }); T.heli = 120 + R() * 180; }
    if (heli) {
      // going over: in from far off, overhead, away the other side
      const h = heli; h.t += dt;
      const k2 = h.t / h.dur;
      h.L.set({ vol: 0.55, pan: h.p0 * (1 - 2 * k2), d: 60 + 340 * Math.abs(1 - 2 * k2) });
      if (k2 >= 1) { h.L.stop(0.5); heli = null; }
    }
    // the crowd's footfalls
    if (T.steps <= 0) { if (crowd > 0.05) at('crowdStep', { d: 4 + R() * 12, vol: 0.12 + 0.2 * R(), surface: park > 0.6 ? 'grass' : 'hard', verb: 0.15 }); T.steps = 1 / (0.5 + 7 * crowd); }
  }
  // (force(name): an event now, for tests and scenes: honk, siren, subway, coo, chirp, flutter, build, whistle, heli, call)
  return { update, startMurmur, force(name) { if (name in T) T[name] = 0; }, get where() { return w; }, get engines() { return engines.map((e) => ({ st: e.st, kind: e.kind, on: !!e.mv })); } };
}
