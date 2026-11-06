// Mog City story runner: the world from ?pack=. Imported only when the address has ?pack= (wagmi/game.js); its load()
// is awaited there before Dan and the car are built, as wagmi/story's top-level await is.
// A world is the runner pack GameMog's Story Kit store seals (lib/storykit-store.ts world(): the gated pack v2 as the
// runner reads it: { storykit: 1, id, title, cast: { <name>: { color, model | glb } }, hero, car, places, acts,
// missions, voice: { cast, lines, clips } }). It is fetched from an allowed address only (allow.js), no redirects, at
// most 1 MB; a content-addressed one is checked against its name (SHA-256 of the body); then checked here (check()):
// the shapes the runner reads, closed lists for step kinds and modes, colours as #rrggbb, every text a string of
// bounded length, every file it names an allowed one (allow.js assetUrl), else it is refused and the game is Mog City
// as it is (free roam: the gate says why in the console). Its text is never put into HTML unescaped (ui.js esc and
// textContent; hud.js the same).
//   await load() -> world | null      world: { ok, why, url, hash, id, title, def (the checked JSON), asset(path) -> URL
//                                     or null, heroGLTF(loadGLB), sheetCar, modelCar, ... }
import { packUrl, packHash, assetUrl, hostOf } from './allow.js';
import { watch, error as hostError } from './host.js';
import { showTitle, plainTitle, isOwn } from './title.js';

export const STEP_KINDS = new Set(['drive', 'stops', 'walk', 'pursuit', 'timer', 'call', 'voicemail', 'voicenote', 'choice', 'cutscene',
  'place', 'set', 'say', 'wait', 'goto', 'end', 'label', 'transition', 'vignette', 'wallet', 'actEnd', 'comfort', 'tail',
  'stealth', 'patrol', 'convoy', 'trigger', 'beat', 'roadblock', 'passenger', 'npc', 'fight', 'dm', 'search', 'scene', 'tow', 'ally', 'car']);
const STOCK = new Set(['roadster', 'trailhand', 'vandal']);
// the hero cars Mog City builds in code besides Dan's roadster, by the name a world's `car.model` gives (wagmi/storyrun/gt.js)
export const MODEL_CARS = new Set(['mogcity/gt']);
const MAX_BYTES = 1_000_000, MAX_TEXT = 600;
const q = new URLSearchParams(location.search);
const COLOUR = /^#[0-9A-Fa-f]{6}$/;

async function sha256(buf) {
  try { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { return null; }
}
async function getBytes(url) {
  const r = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status}`);
  if (r.url && r.url !== String(url)) throw new Error('redirected');
  const b = await r.arrayBuffer();
  if (b.byteLength > MAX_BYTES) throw new Error('too large');
  return b;
}

// what the city wears that Mog City draws (dressing.js): a blackout in one of these parts of Manhattan, Christmas, snow,
// rain. Everything else in a world's dressing (its time, its season, other holidays and weather) leaves the city as it is
export const BLACKOUTS = ['midtown', 'downtown', 'manhattan'];
export function asksDressing(d) {
  if (!d || typeof d !== 'object') return false;
  return BLACKOUTS.includes(d.blackout) || (Array.isArray(d.holiday) && d.holiday.includes('christmas')) || ['snow', 'rain', 'storm'].includes(d.weather);
}
// Mog City's own mission phases a step may name by `ref` (runner.js PART_IDS: m2.js / m3.js playPart)
export const PART_REFS = new Set(['m2.start', 'm2.go', 'm2.tail', 'm2.yard', 'm2.fight', 'm2.chase', 'm2.crash', 'm2.phone', 'm2.chat',
  'm3.garage', 'm3.square', 'm3.rally', 'm3.rigs', 'm3.dump', 'm3.escape', 'm3.ret', 'm3.home']);
// the lists a whole story may hold more of: its voice plan's lines (Mog City's own story has 445, every one recorded)
const LONG = { 'world.voice.lines': 2000 };
// the world's own checks (the store's gate ran before it was sealed; this is what the runner relies on)
export function check(w) {
  const errs = [];
  const bad = (m) => { if (errs.length < 12) errs.push(m); };
  const walk = (v, at, depth = 0) => {
    if (depth > 14) return bad(`${at}: nested too deep`);
    if (typeof v === 'string') { if (v.length > MAX_TEXT) bad(`${at}: text too long`); return; }
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad(`${at}: not a number`); return; }
    if (v === null || typeof v === 'boolean') return;
    if (Array.isArray(v)) { if (v.length > (LONG[at] || 400)) bad(`${at}: list too long`); v.forEach((x, i) => walk(x, `${at}[${i}]`, depth + 1)); return; }
    if (typeof v === 'object') { for (const k of Object.keys(v)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') bad(`${at}: key ${k}`); walk(v[k], `${at}.${k}`, depth + 1); } return; }
    bad(`${at}: ${typeof v}`);
  };
  if (!w || typeof w !== 'object' || Array.isArray(w)) return ['not a world'];
  walk(w, 'world');
  if (w.storykit !== 1) bad('storykit: not a runner world (1)');
  if (typeof w.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(w.id)) bad('id');
  if (typeof w.title !== 'string' || !w.title) bad('title');
  if (w.city && w.city !== 'ny') bad(`city ${w.city}: only New York runs on Mog City's engine so far`);
  if (!w.cast || typeof w.cast !== 'object') bad('cast');
  else for (const [name, c] of Object.entries(w.cast)) {
    if (!c || typeof c !== 'object') { bad(`cast ${name}`); continue; }
    if (c.color != null && !COLOUR.test(c.color)) bad(`cast ${name}: colour`);
    if (c.model != null && !/^mogcity\/[a-z0-9-]{2,30}$/.test(c.model)) bad(`cast ${name}: model ${c.model}`);
  }
  if (!Array.isArray(w.missions) || !w.missions.length) bad('missions');
  else for (const m of w.missions) {
    if (!m || typeof m.id !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(m.id)) { bad('mission id'); continue; }
    if (!Array.isArray(m.steps) || !m.steps.length) { bad(`${m.id}: steps`); continue; }
    const kinds = (list, at) => { for (const [i, s] of (list || []).entries()) { if (!s || !STEP_KINDS.has(s.type)) bad(`${m.id} ${at}[${i}]: kind ${s && s.type}`); else if (s.ref != null && s.type !== 'call' && !PART_REFS.has(s.ref)) bad(`${m.id} ${at}[${i}]: no Mog City part ${s.ref}`); else { kinds(s.during, `${at}[${i}].during`); kinds(s.do, `${at}[${i}].do`); } } };
    kinds(m.steps, 'steps');
    // (the shapes the play steps read: a stealth's watchers, a convoy's route, an ally's way there)
    const shapes = (list, at) => { for (const [i, s] of (list || []).entries()) {
      if (!s) continue;
      if (s.type === 'stealth' && !s.ref && !(Array.isArray(s.units) && s.units.length && s.units.length <= 8)) bad(`${m.id} ${at}[${i}]: stealth units`);
      if (s.type === 'convoy' && !(Array.isArray(s.route) && s.route.length >= 2)) bad(`${m.id} ${at}[${i}]: convoy route`);
      if (s.type === 'ally' && s.to !== 'player' && !(typeof s.to === 'string' || (s.to && typeof s.to === 'object'))) bad(`${m.id} ${at}[${i}]: ally to`);
      if (s.type === 'roadblock' && !s.at) bad(`${m.id} ${at}[${i}]: roadblock at`);
      if (s.type === 'convoy' && s.band != null && !(Array.isArray(s.band) && s.band.length === 2 && s.band[0] < s.band[1])) bad(`${m.id} ${at}[${i}]: convoy band`);
      shapes(s.during, `${at}[${i}].during`);
    } };
    shapes(m.steps, 'steps');
    if (m.vehicle != null && typeof m.vehicle !== 'string') bad(`${m.id}: vehicle`);
  }
  if (!Array.isArray(w.acts) || !w.acts.length) bad('acts');
  for (const mt of w.hud?.meters || []) if (mt && mt.goal != null && !(typeof mt.goal === 'number' && mt.goal > 0)) bad(`hud meter ${mt.id}: goal`);
  // (the opening, before Mission 1: its shots are a cutscene's, plus a place card, a name card and the title)
  if (w.opening != null) {
    const o = w.opening;
    if (typeof o !== 'object' || Array.isArray(o)) bad('opening');
    else {
      if (!Array.isArray(o.shots) || !o.shots.length || o.shots.length > 24) bad('opening.shots');
      else for (const [i, s] of o.shots.entries()) {
        if (!s || typeof s !== 'object' || Array.isArray(s)) { bad(`opening.shots[${i}]`); continue; }
        if (s.card != null && (typeof s.card !== 'object' || typeof s.card.who !== 'string')) bad(`opening.shots[${i}].card`);
        if (s.where != null && (typeof s.where !== 'object' || typeof s.where.name !== 'string')) bad(`opening.shots[${i}].where`);
        if (s.dur != null && !(s.dur > 0 && s.dur <= 15)) bad(`opening.shots[${i}].dur`);
      }
      if (o.stage != null && (!Array.isArray(o.stage) || o.stage.length > 8 || o.stage.some((x) => !x || typeof x.who !== 'string'))) bad('opening.stage');
    }
  }
  // (what the city wears: closed words only, dressing.js reads nothing else)
  if (w.dressing != null) {
    const d = w.dressing;
    if (typeof d !== 'object' || Array.isArray(d)) bad('dressing');
    else {
      for (const k of ['time', 'season', 'weather']) if (d[k] != null && (typeof d[k] !== 'string' || !/^[a-z-]{1,24}$/.test(d[k]))) bad(`dressing.${k}`);
      if (d.blackout != null && !BLACKOUTS.includes(d.blackout)) bad('dressing.blackout');
      if (d.holiday != null && (!Array.isArray(d.holiday) || d.holiday.some((h) => typeof h !== 'string' || !/^[a-z-]{1,24}$/.test(h)))) bad('dressing.holiday');
    }
  }
  if (w.car != null && !(typeof w.car === 'string' ? STOCK.has(w.car) : w.car && (typeof w.car.sheet === 'object' || MODEL_CARS.has(w.car.model)))) bad('car');
  // (a Mog City model as the hero's car: { model: 'mogcity/gt', paint?, plate?, label? }, wagmi/storyrun/gt.js)
  if (w.car && typeof w.car === 'object' && MODEL_CARS.has(w.car.model)) {
    if (w.car.paint != null && !COLOUR.test(w.car.paint)) bad('car.paint');
    if (w.car.plate != null && (typeof w.car.plate !== 'string' || !/^[A-Z0-9 ]{0,8}$/.test(w.car.plate))) bad('car.plate');
    if (w.car.label != null && (typeof w.car.label !== 'string' || w.car.label.length > 32)) bad('car.label');
  }
  return errs;
}

export async function load() {
  watch();
  const raw = q.get('pack');
  const out = { ok: false, why: null, url: null, hash: null, id: null, title: null, def: null };
  const url = packUrl(raw, location, hostOf(q.get('host')));
  if (!url) { out.why = 'address not allowed'; hostError('load', 'the world did not load: its address is not allowed'); plainTitle(); return out; }
  out.url = url;
  try {
    const bytes = await getBytes(url);
    const h = await sha256(bytes), want = packHash(url);
    if (want && h !== want) throw new Error('its bytes do not match its name');
    const def = JSON.parse(new TextDecoder().decode(bytes));
    const errs = check(def);
    if (errs.length) throw new Error('refused: ' + errs.slice(0, 4).join('; '));
    Object.assign(out, { ok: true, hash: h, id: def.id, title: def.title, def });
  } catch (err) { out.why = String(err.message || err); }
  if (!out.ok) { console.warn('[storyrun] world refused:', out.why); hostError('load', `the world did not load: ${out.why}`); plainTitle(); return out; }
  showTitle(out.def, null, isOwn(out));
  const W = out, def = W.def;
  W.asset = (p) => (typeof p === 'string' && /^assets\/[\w/.-]+$/.test(p) && !p.includes('..') ? p : assetUrl(p, url));
  // (the cast by display name; the hero's)
  W.castOf = (name) => (name && Object.prototype.hasOwnProperty.call(def.cast, name) ? def.cast[name] : null);
  W.heroName = def.hero || null;
  const hero = W.castOf(W.heroName);
  // the hero's body: a registry Dan is Dan's own file; a forged hero is their GLB, with Dan's clips on it (one rig)
  W.heroGlb = hero && !hero.model && hero.glb ? W.asset(hero.glb) : null;
  W.heroGLTF = async (loadGLB) => {
    const dan = await loadGLB('assets/characters/dan.glb');
    if (!W.heroGlb) return dan;
    try {
      const g = await loadGLB(W.heroGlb);
      const names = new Set(dan.animations.map((c) => c.name));
      g.animations = [...dan.animations, ...g.animations.filter((c) => !names.has(c.name))];
      return g;
    } catch (err) { console.warn('[storyrun] hero body', err); return dan; }
  };
  // the player's car: a vehicle sheet (wagmi/storyrun/vehicles) or a stock one (the roadster is Dan's own)
  W.sheetCar = def.car && typeof def.car === 'object' && def.car.sheet ? def.car.sheet : null;
  W.stockCar = typeof def.car === 'string' ? def.car : null;
  // (or one of Mog City's own models: the Vantor GT, built by wagmi/storyrun/gt.js with the roadster's handling)
  W.modelCar = def.car && typeof def.car === 'object' && MODEL_CARS.has(def.car.model) ? def.car : null;
  // (trailhand and vandal are their sheets: none in this repo yet, so Dan's roadster stands in for them)
  return W;
}
