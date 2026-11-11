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
// (a hero's wear: wear.js WEARS, kept here too so the check needs no three.js)
const WEARS = new Set(['rider']);

export const STEP_KINDS = new Set(['drive', 'stops', 'walk', 'pursuit', 'timer', 'call', 'voicemail', 'voicenote', 'choice', 'cutscene',
  'place', 'set', 'say', 'wait', 'goto', 'end', 'label', 'transition', 'vignette', 'wallet', 'actEnd', 'comfort', 'tail',
  'stealth', 'patrol', 'convoy', 'trigger', 'beat', 'roadblock', 'passenger', 'npc', 'fight', 'dm', 'search', 'scene', 'tow', 'ally', 'car',
  'collect', 'mount', 'dismount', 'herd', 'sneak', 'flee', 'drove', 'track']);
const STOCK = new Set(['roadster', 'trailhand', 'vandal']);
// the hero cars Mog City builds in code besides Dan's roadster, by the name a world's `car.model` gives (wagmi/storyrun/gt.js)
export const MODEL_CARS = new Set(['mogcity/gt', 'mogcity/horse']);
const MAX_BYTES = 1_000_000, MAX_TEXT = 600;
const q = new URLSearchParams(location.search);
const COLOUR = /^#[0-9A-Fa-f]{6}$/;
// the cities Mog City's engine plays (index.html: ?city=sf San Francisco, New York without it): a world plays in the
// city the page has loaded, one city a page (GameMog's frame names it with &city=)
const CITY_NAMES = { ny: 'New York', sf: 'San Francisco' };
const PAGE_CITY = q.get('city') === 'sf' ? 'sf' : 'ny';

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
// (SF 2040) San Francisco after Erebus (wagmi/apocalypse): a world for city 'sf' asks with dressing.apocalypse: true |
// 'dusk' | 'day' | 'night' (its look; true is dusk). New York's worlds cannot ask for it
export const APOCALYPSE = [true, 'dusk', 'day', 'night'];
export function asksApocalypse(d, city) { return city === 'sf' && !!d && typeof d === 'object' && APOCALYPSE.includes(d.apocalypse); }
// (SF 2040) the library's creatures a fight may name (wagmi/creatures/profiles.js: the ones that fight), only in a city
// that has them (San Francisco); how many at once (W.creatures.CAP); a collect step's looks and how many it sets out
export const CREATURES = new Set(['creature-knight', 'creature-ogre', 'creature-centaur', 'creature-ape', 'creature-mech', 'creature-scorpion', 'creature-trex']);
const CREATURE_CAP = 8, LOOKS = new Set(['crate', 'case', 'bag', 'can']), MAX_SUPPLIES = 24;
const isMark = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 20000);
const isPlaceRef = (v) => (typeof v === 'string' && /^@[\w-]{1,40}$/.test(v)) || (v && typeof v === 'object' && !Array.isArray(v) && typeof v['@'] === 'string');
// a creature fight's and a collect's shapes (runner.js creatureFight, STEPS.collect): [] when sound, else what is wrong
export function creatureStep(s, city) {
  const errs = [];
  if (s.type === 'fight' && (s.foes != null || s.boss != null || s.waves != null)) {
    if (city !== 'sf') errs.push('creatures fight in San Francisco only');
    if (!isPlaceRef(s.arena)) errs.push('arena');
    let n = 0;
    const foe = (o, at) => {
      const x = typeof o === 'string' ? { id: o } : o;
      if (!x || typeof x !== 'object' || !CREATURES.has(x.id)) { errs.push(`${at}: no creature ${x && x.id}`); return; }
      if (x.count != null && !(Number.isInteger(x.count) && x.count >= 1 && x.count <= CREATURE_CAP)) errs.push(`${at}: count`);
      if (x.height != null && !(typeof x.height === 'number' && x.height >= 0.5 && x.height <= 12)) errs.push(`${at}: height`);
      if (x.name != null && (typeof x.name !== 'string' || x.name.length > 32)) errs.push(`${at}: name`);
      n += x.count || 1;
    };
    if (s.foes != null) { if (!Array.isArray(s.foes) || !s.foes.length) errs.push('foes'); else s.foes.forEach((o, i) => foe(o, `foes[${i}]`)); }
    if (s.boss != null) {
      foe(s.boss, 'boss');
      const B = typeof s.boss === 'object' ? s.boss : {};
      if (B.phases != null && !(Array.isArray(B.phases) && B.phases.length <= 4 && B.phases.every((k) => typeof k === 'number' && k > 0 && k < 1))) errs.push('boss: phases');
      if (B.hold != null && !(typeof B.hold === 'object' && ['wake', 'leash'].every((k) => B.hold[k] == null || (typeof B.hold[k] === 'number' && B.hold[k] > 0 && B.hold[k] <= 200)))) errs.push('boss: hold');
      if (B.at != null && !isPlaceRef(B.at)) errs.push('boss: at');
      if (B.look != null && !['deacon'].includes(B.look)) errs.push('boss: look');
    }
    if (n > CREATURE_CAP) errs.push(`${n} creatures: ${CREATURE_CAP} fight at once at most`);
    // (waves: each a crew of its own after the last is down, from the arena or its own place; a boss in one may be a
    // creature an earlier flee kept: boss.from)
    if (s.waves != null) {
      if (!Array.isArray(s.waves) || !s.waves.length || s.waves.length > 6) errs.push('waves');
      else s.waves.forEach((w, i) => {
        if (!w || typeof w !== 'object' || (!w.foes && !w.boss)) { errs.push(`waves[${i}]`); return; }
        let m = 0; const was = n; n = 0;
        if (w.foes != null) { if (!Array.isArray(w.foes) || !w.foes.length) errs.push(`waves[${i}].foes`); else w.foes.forEach((o, j) => foe(o, `waves[${i}].foes[${j}]`)); }
        if (w.boss != null) foe(w.boss, `waves[${i}].boss`);
        m = n; n = was;
        if (m > CREATURE_CAP) errs.push(`waves[${i}]: ${m} creatures: ${CREATURE_CAP} fight at once at most`);
        if (w.from != null && !(isMark(w.from) || isPlaceRef(w.from))) errs.push(`waves[${i}].from`);
      });
    }
  }
  if (s.type === 'sneak') {
    if (!isPlaceRef(s.to)) errs.push('to');
    if (city !== 'sf') errs.push('creatures sleep in San Francisco only');
    if (!Array.isArray(s.sleepers) || !s.sleepers.length || s.sleepers.length > CREATURE_CAP) errs.push('sleepers');
    else s.sleepers.forEach((o, i) => { const x = typeof o === 'string' ? { id: o } : o; if (!x || !CREATURES.has(x.id)) errs.push(`sleepers[${i}]: no creature ${x && x.id}`); else if (x.at != null && !(isMark(x.at) || isPlaceRef(x.at))) errs.push(`sleepers[${i}].at`); });
  }
  if (s.type === 'flee') {
    if (!isPlaceRef(s.to)) errs.push('to');
    if (city !== 'sf') errs.push('creatures chase in San Francisco only');
    const x = typeof s.creature === 'string' ? { id: s.creature } : s.creature;
    if (!x || !CREATURES.has(x.id)) errs.push(`no creature ${x && x.id}`);
    if (x && x.at != null && !(isMark(x.at) || isPlaceRef(x.at))) errs.push('creature.at');
    if (s.keep && !s.id) errs.push('keep: needs an id');
  }
  if (s.type === 'drove') {
    if (typeof s.herd !== 'string' || !s.herd) errs.push('herd');
    if (!isPlaceRef(s.to)) errs.push('to');
    if (s.need != null && !(Number.isInteger(s.need) && s.need >= 1 && s.need <= 8)) errs.push('need');
  }
  if (s.type === 'track' && !isPlaceRef(s.at)) errs.push('at');
  if (s.type === 'collect') {
    if (!Array.isArray(s.items) || !s.items.length || s.items.length > MAX_SUPPLIES) errs.push('items');
    else s.items.forEach((r, i) => { if (!(isMark(r) || isPlaceRef(r) || (r && typeof r === 'object' && isMark(r.at)))) errs.push(`items[${i}]`); });
    if (s.need != null && !(Number.isInteger(s.need) && s.need >= 1 && s.need <= (s.items?.length || 0))) errs.push('need');
    if (s.kind != null && (typeof s.kind !== 'string' || !/^[a-z-]{1,20}$/.test(s.kind))) errs.push('kind');
    if (s.look != null && !LOOKS.has(s.look)) errs.push('look');
    if (s.color != null && !COLOUR.test(s.color)) errs.push('colour');
  }
  if (s.type === 'mount' && s.at != null && !isPlaceRef(s.at)) errs.push('at');
  if (s.type === 'herd' && !s.remove) {
    if (city !== 'sf') errs.push('wildlife in San Francisco only');
    if (s.creature != null && !['creature-horse', ...CREATURES].includes(s.creature)) errs.push(`no creature ${s.creature}`);
    if (!(isMark(s.at) || isPlaceRef(s.at))) errs.push('at');
    if (s.count != null && !(Number.isInteger(s.count) && s.count >= 1 && s.count <= 8)) errs.push('count');
  }
  return errs;
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
  if (w.city && !CITY_NAMES[w.city]) bad(`city ${w.city}: Mog City's engine plays New York and San Francisco`);
  else if ((w.city || 'ny') !== PAGE_CITY) bad(`city ${w.city || 'ny'}: this page plays ${CITY_NAMES[PAGE_CITY]} (?city=${w.city || 'ny'} for ${CITY_NAMES[w.city || 'ny']})`);
  if (!w.cast || typeof w.cast !== 'object') bad('cast');
  else for (const [name, c] of Object.entries(w.cast)) {
    if (!c || typeof c !== 'object') { bad(`cast ${name}`); continue; }
    if (c.color != null && !COLOUR.test(c.color)) bad(`cast ${name}: colour`);
    if (c.model != null && !/^mogcity\/[a-z0-9-]{2,30}$/.test(c.model)) bad(`cast ${name}: model ${c.model}`);
    if (c.scale != null && !(typeof c.scale === 'number' && c.scale >= 0.7 && c.scale <= 1.15)) bad(`cast ${name}: scale`);
    if (c.wear != null && !WEARS.has(c.wear)) bad(`cast ${name}: wear ${c.wear}`);
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
      for (const e of creatureStep(s, w.city || 'ny')) bad(`${m.id} ${at}[${i}]: ${e}`);
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
  // (the coda, after the credits: an opening's shape, index.js plays it with runner.opening)
  if (w.coda != null && (typeof w.coda !== 'object' || Array.isArray(w.coda) || !Array.isArray(w.coda.shots) || !w.coda.shots.length || w.coda.shots.length > 24
    || w.coda.shots.some((s) => !s || typeof s !== 'object' || (s.dur != null && !(s.dur > 0 && s.dur <= 15))))) bad('coda');
  // (what the city wears: closed words only, dressing.js reads nothing else)
  if (w.dressing != null) {
    const d = w.dressing;
    if (typeof d !== 'object' || Array.isArray(d)) bad('dressing');
    else {
      for (const k of ['time', 'season', 'weather']) if (d[k] != null && (typeof d[k] !== 'string' || !/^[a-z-]{1,24}$/.test(d[k]))) bad(`dressing.${k}`);
      if (d.blackout != null && !BLACKOUTS.includes(d.blackout)) bad('dressing.blackout');
      if (d.apocalypse != null && d.apocalypse !== false && (!APOCALYPSE.includes(d.apocalypse) || w.city !== 'sf')) bad('dressing.apocalypse: San Francisco only (true, dusk, day or night)');
      if (d.holiday != null && (!Array.isArray(d.holiday) || d.holiday.some((h) => typeof h !== 'string' || !/^[a-z-]{1,24}$/.test(h)))) bad('dressing.holiday');
    }
  }
  if (w.car != null && !(typeof w.car === 'string' ? STOCK.has(w.car) : w.car && (typeof w.car.sheet === 'object' || MODEL_CARS.has(w.car.model)))) bad('car');
  // (a Mog City model as the hero's car: { model: 'mogcity/gt', paint?, plate?, label?, body? }, wagmi/storyrun/gt.js;
  // it wears the downloaded body, wagmi/storyrun/vantor.js; body: 'built' the one built in code, gt.js)
  if (w.car && typeof w.car === 'object' && MODEL_CARS.has(w.car.model)) {
    if (w.car.paint != null && !COLOUR.test(w.car.paint)) bad('car.paint');
    if (w.car.plate != null && (typeof w.car.plate !== 'string' || !/^[A-Z0-9 ]{0,8}$/.test(w.car.plate))) bad('car.plate');
    if (w.car.label != null && (typeof w.car.label !== 'string' || w.car.label.length > 32)) bad('car.label');
    if (w.car.body != null && w.car.body !== 'ext' && w.car.body !== 'built') bad('car.body');
  }
  return errs;
}

// a forged body on Dan's clips: the hand-built cast (John, Milo, Pell, the old boss, the young hero) carry an extra node
// between each shoulder and upper arm, armhang_L / _R (not one of the skin's joints), turned 13 degrees in at rest.
// Dan's rig has none, so no clip of his moves it and it stayed at that turn under every clip: on top of Dan's upper-arm
// turn (made for an upper arm hung straight off the shoulder) it swung each arm in and forward, the hands in front of the
// belly and the arms inside the jacket (the owner: "i can't see John's arms", from behind square shoulders and nothing
// hanging). Levelled, the upper arm hangs off the shoulder as Dan's does and the clips put the arms where they put his.
export function unhang(root) {
  root?.traverse?.((o) => { if (/^armhang_[LR]$/.test(o.name)) o.quaternion.identity(); });
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
      unhang(g.scene);
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
