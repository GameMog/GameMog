import { worldMode, type WorldMode } from './custom-game';
import { pickPass, type Pass, type Pick as PassPick } from './look';

/**
 * A Mog keeps its parent (the owner, 6 Oct 2026: "A DNA check after each pass: if the map, hero, crews, story or game
 * type disappear and the idea didn't ask for that, the builder gets a repair note to put them back").
 *
 * The case: Zcity Mogged with "set it at daytime driving around in a red ferrari testarossa GTA 5 style. city is called
 * "Oaktown"" came back a derby arena with nothing of Zcity in it: no city, no traversal, no OG, no infected, no vaccine.
 *
 * dna(code) reads what makes a world itself from its module's text: its kind of game, its place (a library map, the
 * city's time of day, the places its scenes name), the traversal, its hero, its crews and their names, the patrol car,
 * its scenes and their cast, its goal and story, its library kits, and a lap world's platform options.
 * compareDna(parent, child, idea) lists what the child dropped or changed that the idea does not ask for, each as a
 * short note the builder can act on. Pure (no I/O) and deterministic; every rule is a line of compareDna, and the
 * idea is read by readIdea's word lists, so a verdict can always be explained. Tested on real worlds by npm run check.
 */

export type HeroKind = 'human' | 'car' | 'creature' | 'own';
export type CrewKind = 'thug' | 'biker' | 'cop' | 'boss';
export type Dna = {
  kind: WorldMode;
  /** open.map: a library map ('city', 'ocean-drive'), or null for a place the world builds itself */
  map: string | null;
  city: { time: string | null; district: string | null } | null;
  traversal: boolean;
  hero: { kind: HeroKind; name: string | null; body: string | null; traits: string[] };
  /** an open world hero's moves and weapon: 'kicks: false', 'tank', 'fight: boxing', 'weapon: staff' */
  moves: string[];
  crews: Partial<Record<CrewKind, { names: string[]; as: 'people' | 'cars' | 'creatures' }>>;
  patrol: string | null;
  /** the places its scenes name on their location cards */
  places: string[];
  intro: { shots: number; cast: string[] } | null;
  outro: { shots: number; cast: string[] } | null;
  goal: { gm: number | null; title: string | null } | null;
  /** hud.gm: what the story calls the GM */
  fund: string | null;
  beats: number;
  coins: boolean;
  assets: string[];
  /** a lap world's platform options, and its track (control points and width, when the module gives them as numbers) */
  play: { vehicle: boolean; combat: boolean; bounty: boolean };
  track: { points: number | null; width: number | null } | null;
  /** every word the module uses, comments and names included (a world that builds its own place says what it is) */
  words: string[];
};
export type DnaKey = 'kind' | 'map' | 'time' | 'traversal' | 'patrol' | 'hero' | 'moves' | 'crews' | 'intro' | 'outro' | 'story' | 'places' | 'kits' | 'scenery' | 'track' | 'play';
/**
 * One thing the child dropped. A minor one (a library kit, the scenery's kits, a lap's track) is recorded and said in
 * a repair, but never sends a pass back on its own: the owner's list is the map, the hero, the crews, the story and the
 * game type, and what goes with them.
 */
export type DnaDrop = { key: DnaKey; note: string; minor?: true };
export type DnaVerdict = { dropped: DnaDrop[]; allowed: { key: DnaKey; why: string }[]; idea: Idea };
/** What the draft's report records (report.dna): what was dropped, what the idea allowed, and what became of a repair. */
export type DnaReport = { dropped: DnaDrop[]; allowed: { key: DnaKey; why: string }[]; repair?: string };

// ---------------------------------------------------------------------------------------------------------------
// reading a module: a small scanner (strings and comments skipped), an object literal's own entries, and identifiers
// resolved to what they were declared as, so `crew: MAIN_CREW` and `intro: INTRO` read as the objects they name

function skip(code: string, i: number): number {
  const c = code[i], n = code[i + 1];
  if (c === '/' && n === '/') { const e = code.indexOf('\n', i); return e < 0 ? code.length : e; }
  if (c === '/' && n === '*') { const e = code.indexOf('*/', i + 2); return e < 0 ? code.length : e + 2; }
  if (c === '"' || c === "'" || c === '`') { let j = i + 1; while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1; return j + 1; }
  return i;
}
/** The code with its comments blanked out, its strings kept. */
function uncomment(code: string) {
  let out = '', i = 0;
  while (i < code.length) {
    const k = skip(code, i);
    if (k === i) { out += code[i]; i++; continue; }
    out += code[i] === '/' ? ' ' : code.slice(i, k);
    i = k;
  }
  return out;
}
/** The bracketed text opening at i ('{', '[' or '('), its brackets included. */
function bracket(code: string, i: number): string {
  let depth = 0, j = i;
  while (j < code.length) {
    const k = skip(code, j);
    if (k !== j) { j = k; continue; }
    const c = code[j];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if ((c === '}' || c === ']' || c === ')') && --depth === 0) return code.slice(i, j + 1);
    j++;
  }
  return code.slice(i);
}
/** The top-level parts of a bracketed text, split at its own commas. */
function parts(text: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 1, j = 0;
  while (j < text.length) {
    const k = skip(text, j);
    if (k !== j) { j = k; continue; }
    const c = text[j];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { if (--depth === 0) { out.push(text.slice(start, j)); break; } }
    else if (c === ',' && depth === 1) { out.push(text.slice(start, j)); start = j + 1; }
    j++;
  }
  return out.map((p) => p.trim()).filter(Boolean);
}
/** An object literal's own entries, key to value text (`intro,` is `intro: intro`; `player(ctx) {}` a function). */
function entries(obj: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!obj.startsWith('{')) return out;
  for (const p of parts(obj)) {
    const kv = /^(?:(['"])([^'"]*)\1|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]*)$/.exec(p);
    if (kv) { out.set(kv[2] ?? kv[3], kv[4].trim()); continue; }
    const method = /^([A-Za-z_$][\w$]*)\s*(\([\s\S]*)$/.exec(p);
    if (method) { out.set(method[1], 'function ' + method[2]); continue; }
    if (/^[A-Za-z_$][\w$]*$/.test(p)) out.set(p, p);
  }
  return out;
}
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** What a value is: an identifier is looked up where it was declared (var, let, const or function), twice at most. */
function resolve(code: string, value: string | undefined, depth = 0): string {
  const v = (value ?? '').trim();
  if (!IDENT.test(v) || depth > 2 || ['true', 'false', 'null', 'undefined'].includes(v)) return v;
  const fn = new RegExp(`\\bfunction\\s+${v.replace(/\$/g, '\\$')}\\s*\\(`).exec(code);
  if (fn) return 'function ' + bracket(code, code.indexOf('(', fn.index)) + ' ' + bracket(code, code.indexOf('{', fn.index + fn[0].length));
  const decl = new RegExp(`(?:\\b(?:var|let|const)\\s+|,\\s*)${v.replace(/\$/g, '\\$')}\\s*=(?!=)\\s*`).exec(code);
  if (!decl) return v;
  const at = decl.index + decl[0].length, c = code[at];
  if (c === '{' || c === '[' || c === '(') return bracket(code, at);
  if (code.startsWith('function', at)) return 'function ' + bracket(code, code.indexOf('{', at));
  const end = code.slice(at).search(/[;,\n]/);
  return resolve(code, code.slice(at, end < 0 ? undefined : at + end), depth + 1);
}
const unescape = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1');
/** Every string literal in a text, unescaped. */
function strings(text: string): string[] {
  const out: string[] = [];
  let j = 0;
  while (j < text.length) {
    const k = skip(text, j);
    if (k !== j) { if (text[j] !== '/') out.push(unescape(text.slice(j + 1, k - 1))); j = k; continue; }
    j++;
  }
  return out;
}
/** A value that is one string literal, or null. */
function str(v: string | undefined): string | null {
  const m = /^(['"`])([\s\S]*)\1$/.exec((v ?? '').trim());
  return m ? unescape(m[2]) : null;
}
const on = (v: string | undefined) => v !== undefined && !/^(false|null|undefined|0)$/.test(v.trim());
const count = (v: string) => (v.startsWith('[') ? parts(v).length : 0);
const ASSET = /^(human|texture|sky|model|hdri|heightfield|music|city|car|creature|motion)-[a-z0-9-]+$/;
const CREWS: CrewKind[] = ['thug', 'biker', 'cop', 'boss'];

/** The text inside a function, its body's braces included ('' when it is not one). */
function body(fnText: string) {
  const at = fnText.indexOf('{', /^function\b/.test(fnText) ? fnText.indexOf(')') : 0);
  return at < 0 ? '' : bracket(fnText, at);
}

function heroOf(code: string, player: string): Dna['hero'] {
  const fn = resolve(code, player), own = body(fn) || fn;
  const kindOf = (t: string): HeroKind | null =>
    /\.assets\.car\s*\(/.test(t) ? 'car' : /\.assets\.(?:human|cyclist|skater)\s*\(/.test(t) ? 'human' : /\.assets\.creature\s*\(/.test(t) ? 'creature' : null;
  // the hero's own function, then the helpers it calls and the objects it passes them (fighter(ctx, PLAYER, 0))
  const called = [...own.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter((n) => !/^(function|return|if|for|while|switch|new|typeof)$/.test(n));
  const passed = [...own.matchAll(/[(,]\s*([A-Za-z_$][\w$]*)\s*(?=[,)])/g)].map((m) => m[1]).filter((n) => n !== 'ctx');
  const helpers = [...new Set(called)].map((n) => resolve(code, n)).filter((t) => t.startsWith('function'));
  const args = [...new Set(passed)].map((n) => resolve(code, n)).filter((t) => t.startsWith('{'));
  const all = [own, ...helpers, ...args].join('\n');
  const kind = kindOf(own) ?? helpers.map(kindOf).find(Boolean) ?? 'own';
  const name = /\bname\s*:\s*(['"])((?:\\.|(?!\1).)+)\1/.exec([own, ...args].join('\n'));
  // the body: named in the hero's own function, else the gender of the kit it passes, else the one body its helpers name
  const named = (t: string) => [...new Set([...t.matchAll(/['"]human-athlete-(male|female)['"]/g)].map((m) => m[1]))];
  const gender = named(own)[0] ?? /\b(?:gender|g)\s*:\s*['"](male|female)['"]/.exec(args.join('\n'))?.[1]
    ?? (named(helpers.join('\n')).length === 1 ? named(helpers.join('\n'))[0] : null);
  const traits = [
    /\bendo\s*:/.test(own) ? 'a chrome endoskeleton' : '',
    /\bsick\s*:\s*[\d.]/.test(own) ? 'sick' : '',
    kind === 'car' ? (/\bkind\s*:\s*['"](\w+)['"]/.exec(all)?.[1] ?? 'car') : '',
  ].filter(Boolean);
  return { kind, name: name ? unescape(name[2]) : null, body: kind === 'human' && gender ? `human-athlete-${gender}` : null, traits };
}

/** The scene (intro or outro) an open world plays: how many shots, and who is in it. */
function scene(code: string, v: string | undefined): Dna['intro'] {
  if (!on(v)) return null;
  const s = resolve(code, v), e = entries(s);
  const shots = resolve(code, e.get('shots') ?? (s.startsWith('[') ? s : ''));
  const cast = [...new Set([...s.matchAll(/\bname\s*:\s*(['"])((?:\\.|(?!\1).)+)\1/g)].map((m) => unescape(m[2])))];
  return { shots: count(shots), cast };
}

/** A world's DNA, read from its module. */
export function dna(source: string): Dna {
  const code = uncomment(source);
  const call = /\bGameMog\s*\.\s*world\s*\(\s*/.exec(code);
  const world = call ? entries(resolve(code, code[call.index + call[0].length] === '{' ? bracket(code, call.index + call[0].length) : code.slice(call.index + call[0].length).split(/[),]/)[0])) : new Map<string, string>();
  const open = entries(resolve(code, world.get('open')));
  const get = (k: string) => entries(resolve(code, open.get(k)));

  const city = open.has('city') ? get('city') : null;
  const goal = open.has('goal') ? get('goal') : null;
  const gm = goal?.get('gm') ? Number(resolve(code, goal.get('gm')).replace(/_/g, '')) : NaN;
  const story = get('story');
  const crewObj = get('crew');
  const crews: Dna['crews'] = {};
  const kind = worldMode(source);
  for (const k of CREWS) {
    const c = entries(resolve(code, crewObj.get(k)));
    if (!c.size || !(c.has('names') || c.has('look') || c.has('car') || c.has('body'))) continue;
    // in a derby every crew drives (a body there builds its own car)
    crews[k] = { names: [...new Set(strings(resolve(code, c.get('names'))))], as: kind === 'derby' || c.has('car') ? 'cars' : c.has('body') ? 'creatures' : 'people' };
  }
  const hero = get('hero');
  const moves = [
    ...['kicks', 'jump', 'dodge'].filter((k) => open.get(k) === 'false').map((k) => `${k}: false`),
    on(open.get('tank')) ? 'tank' : '',
    str(open.get('fight')) ? `fight: ${str(open.get('fight'))}` : '',
    str(hero.get('weapon')) ? `weapon: ${str(hero.get('weapon'))}` : '',
  ].filter(Boolean);
  const patrol = open.has('patrol') ? (str(get('patrol').get('car')) ?? (on(open.get('patrol')) ? 'on' : null)) : null;

  // the library kits: the assets list, and the lists it is built from (AI Alps joins MAIN_ASSETS, LAND_ASSETS, ...)
  const listed = resolve(code, world.get('assets'));
  const lists = [listed, ...[...listed.matchAll(/\b[A-Z_][A-Z0-9_]*\b/g)].map((m) => resolve(code, m[0]))];
  const assets = [...new Set(lists.flatMap(strings).filter((s) => ASSET.test(s)))];
  const play = entries(resolve(code, world.get('play')));
  const track = world.has('track') ? entries(resolve(code, world.get('track'))) : null;
  const points = track ? resolve(code, track.get('points')) : '', width = track ? Number(resolve(code, track.get('width'))) : NaN;

  return {
    kind,
    map: str(open.get('map')),
    city: city ? { time: str(city.get('time')), district: str(city.get('district')) } : null,
    traversal: on(open.get('traversal')),
    hero: heroOf(code, world.get('player') ?? ''),
    moves,
    crews,
    patrol,
    places: [...new Set([...code.matchAll(/\bplace\s*:\s*(['"])((?:\\.|(?!\1).)+)\1/g)].map((m) => unescape(m[2])).filter((p) => /[A-Za-z]{3}/.test(p) && !/\bGM\b/.test(p)))],
    intro: scene(code, open.get('intro')),
    outro: scene(code, open.get('outro')),
    goal: goal ? { gm: Number.isFinite(gm) ? gm : null, title: str(goal.get('title')) } : null,
    fund: str(get('hud').get('gm')),
    beats: count(resolve(code, story.get('beats'))),
    coins: open.get('coins') !== 'false',
    assets,
    play: { vehicle: on(play.get('vehicle')), combat: on(play.get('combat')), bounty: on(play.get('bounty')) },
    track: track ? { points: points.startsWith('[') ? count(points) || null : null, width: Number.isFinite(width) ? width : null } : null,
    words: [...new Set(source.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]{3,}/g) ?? [])].sort(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// reading the idea: what it asks for, by plain word lists

export type Idea = {
  /** the kind of game it asks for by name, when it names exactly one */
  kind: WorldMode | null;
  /** a place it names that the parent is not (a new setting), or null */
  place: string | null;
  /** the name it gives the place ("city is called Oaktown"): a rename, not a move */
  rename: string | null;
  time: boolean; hero: boolean; enemies: boolean; story: boolean; amount: boolean; cars: boolean; foot: boolean; fight: boolean;
  noScenes: boolean; noTraversal: boolean; noPolice: boolean; noCombat: boolean;
};

const words = (list: string[]) => new RegExp(`\\b(?:${list.join('|')})\\b`, 'i');
const KIND: Record<WorldMode, RegExp> = {
  derby: words(['derby', 'demolition', 'car combat', 'vehicular combat', 'car battles?', 'car fights?', 'car wars?', 'bumper cars?', 'twisted metal', 'smash-?up derby', 'ram(?:ming)? (?:them|the other cars|other cars|rivals)']),
  race: words(['race', 'races', 'racing', 'lap race', 'laps', 'circuit', 'grand prix', 'time trial', 'karting', 'kart race', 'formula (?:one|1)', 'f1', 'nascar', 'marathon']),
  survival: words(['open world', 'on foot', 'survival', 'survive', 'brawler', 'brawl', 'beat[- ]?(?:\'?em|them)[- ]?up', 'fist ?fights?', 'melee', 'street fights?', 'kung fu', 'martial arts']),
};
/**
 * Settings a world can be moved to (a rename's clause is taken out before these are looked for). The words that also
 * mean something else (a club to swing, a bar on the HUD, a sea of zombies, a full moon) count only after a word of
 * place: in, into, on, to, at, inside, across, through, around ("in a country dance club", "to the moon").
 */
const SETTINGS = ['new york', 'north pole', 'south pole', 'outer space', 'space station', 'coral reef', 'great wall', 'las vegas', 'ski resort', 'dance club', 'night ?club', 'honky ?tonk',
  'city', 'cities', 'metropolis', 'downtown', 'midtown', 'manhattan', 'suburbs?', 'village', 'beach', 'island', 'underwater', 'reef', 'lake', 'river', 'swamp', 'bog', 'marsh', 'jungle',
  'forest', 'forrest', 'woods', 'rainforest', 'desert', 'dunes', 'canyon', 'mountains?', 'alps', 'volcano', 'caves?', 'cavern', 'glacier', 'arctic', 'antarctica', 'tundra', 'mars',
  'planet', 'asteroid', 'galaxy', 'ruins', 'colosseum', 'harbou?r', 'boardwalk', 'carnival', 'fairground', 'subway', 'sewers?', 'pirate ship', 'spaceship',
  'miami', 'vegas', 'tokyo', 'paris', 'london', 'rome', 'texas', 'egypt', 'china', 'japan', 'mexico', 'hollywood', 'chicago'];
const SITES = ['moon', 'space', 'sea', 'ocean', 'castle', 'palace', 'temple', 'pyramids?', 'tomb', 'dungeon', 'stadium', 'mall', 'casino', 'club', 'bar', 'saloon', 'pub', 'tavern', 'disco',
  'warehouse', 'factory', 'prison', 'jail', 'school', 'hospital', 'airport', 'docks?', 'pier', 'circus', 'farm', 'ranch', 'mansion', 'chalet', 'resort', 'hotel'];
const SETTING = new RegExp(`\\b(${SETTINGS.join('|')})\\b`, 'gi');
const SITE = new RegExp(`\\b(?:in|into|on|onto|to|at|inside|across|through|around)\\s+(?:[a-z'-]+\\s+){0,3}?(${SITES.join('|')})\\b`, 'gi');
/** The words round a place that say nothing about which place it is. */
const STOP = new Set(['a', 'an', 'the', 'in', 'into', 'on', 'onto', 'to', 'at', 'inside', 'across', 'through', 'around', 'it', 'its', 'set', 'put', 'take', 'move', 'make', 'and',
  'of', 'with', 'for', 'from', 'him', 'her', 'them', 'us', 'setting', 'scene', 'world', 'place', 'level', 'map', 'some', 'somewhere', 'expect', 'would', 'nobody', 'all', 'way', 'back', 'out']);
/** The words that are the library maps themselves: naming one is not moving a world that is on it. */
const MAP_WORDS: Record<string, string[]> = {
  city: ['city', 'cities', 'metropolis', 'downtown', 'midtown', 'manhattan', 'new york'],
  'ocean-drive': ['beach', 'ocean', 'sea', 'miami', 'boardwalk'],
};
const RENAME = /\b(?:the\s+)?(?:city|town|place|world|map|island|club|bar|saloon|arena|planet|village|country|state|resort|it)\s+(?:is|should be|will be|becomes|gets)?\s*(?:called|named|renamed(?:\s+to)?)\s+("[^"]*"|“[^”]*”|'[^']*'|[A-Za-z][\w'-]*(?:\s+[A-Z][\w'-]*)*)|\b(?:call|name|rename)\s+(?:it|the\s+(?:city|town|place|world|map|island|club))\s+(?:to\s+)?("[^"]*"|“[^”]*”|'[^']*'|[A-Za-z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/gi;
const TIME = words(['day', 'days', 'daytime', 'daylight', 'day ?time', 'noon', 'midday', 'morning', 'afternoon', 'sunrise', 'sunset', 'dawn', 'dusk', 'twilight', 'evening', 'night', 'nights', 'nighttime', 'midnight', 'golden hour', 'sunny']);
const HERO = words(['main character', 'main characters', 'the hero', 'a hero', 'new hero', 'heroine', 'protagonist', 'player character', 'playable character', 'lead character', 'you play', 'play as', 'playing as', '(?:replace|swap|change) (?:the )?(?:og|player|character|hero|him|her)', 'turn (?:the )?(?:og|player|hero|him|her) into']);
const HERO_NAMED = /\b(?:[Pp]ut|[Ss]tarring|[Ff]eaturing|[Ss]tars)\s+(?:a\s+|an\s+)?[A-Z][\w'-]+/;
const ENEMIES = words(['enem(?:y|ies)', 'rivals?', 'crews?', 'gangs?', 'gangsters?', 'villains?', 'opponents?', 'foes?', 'bad guys', 'zombies?', 'infected', 'cops?', 'police', 'bikers?', 'thugs?', 'bosses?',
  'aliens?', 'monsters?', 'robots?', 'ninjas?', 'soldiers?', 'guards?', 'cowboys?', 'pirates?', 'stormtroopers?', 'demons?', 'mobsters?', 'mafia', 'creatures?', 'animals?', 'competitors?']);
const STORY = /\b(?:story|storyline|plot|mission|quest|goal|objective|narrative|instead of)\b|\b(?:needs?|wants?|must|has to|trying to|tries to)\s+(?:to\s+)?(?:buy|pay|win|save|rescue|find|steal|escape|get|clear|recover)\b|\b(?:gm|money|cash)\s+(?:for|to)\b/i;
const AMOUNT = /\b\d{1,3}(?:[,.]\d{3})+\b|\b\d+\s*(?:k|gm|coins|grand)\b/i;
const CARS = words(['cars?', 'drive', 'drives', 'driving', 'driver', 'kart', 'go-?kart', 'race ?car', 'trucks?', 'bus', 'motorbikes?', 'motorcycles?', 'ferrari', 'porsche', 'lamborghini', 'testarossa', 'convertible', 'hypercar', 'supercar', 'vehicles?']);
const FOOT = words(['on foot', 'runners?', 'running race', 'sprinters?']);
const FIGHT = words(['punch\\w*', 'kick\\w*', 'jump\\w*', 'dodg\\w*', 'block\\w*', 'combos?', '(?:fight|special|knockout|combat|signature|finishing|new) moves?', 'knock ?outs?', 'ko', 'fight\\w*', 'boxing', 'boxer', 'uppercuts?', 'haymakers?', 'weapons?', 'swords?', 'staff']);
const NO = (list: string[]) => new RegExp(`\\b(?:no|without|skip|cut|remove|drop|lose|stop)\\s+(?:the\\s+)?(?:${list.join('|')})\\b`, 'i');
const NO_SCENES = NO(['intro', 'opening', 'cut-?scenes?', 'scenes?', 'story', 'cinematics?', 'outro', 'ending', 'chapters?']);
const NO_TRAVERSAL = NO(['swing(?:ing)?', 'climb(?:ing)?', 'traversal', 'webs?', 'grappl\\w*', 'wall-?running', 'parkour']);
const NO_POLICE = NO(['police', 'cops', 'patrol(?: car)?']);
const NO_COMBAT = NO(['sword', 'combat', 'fighting']);

/** The kind of game an idea asks for by name, when it names exactly one (a Mog keeps its parent's otherwise). */
export function askedKind(idea: string): WorldMode | null {
  const asked = (Object.keys(KIND) as WorldMode[]).filter((k) => KIND[k].test(idea));
  return asked.length === 1 ? asked[0] : null;
}

/**
 * What an idea asks for, read against the parent it is about. A place it names is a new one unless the parent is
 * already there: for a world on a library map, the map's own words (city, midtown, ...) and the places its scenes name;
 * for a world that builds its own place, every word of the place as the idea puts it (with the two words before it, so
 * "a country dance club" is new next to AI Alps's club, and "the club" is not) already in the parent's module.
 */
export function readIdea(idea: string, parent?: Pick<Dna, 'map' | 'places'> & { words?: string[] }): Idea {
  let rename: string | null = null;
  const rest = idea.replace(RENAME, (_, a?: string, b?: string) => { rename ??= (a ?? b ?? '').replace(/^["“'”]|["“'”]$/g, '').trim() || null; return ' '; });
  const cards = (parent?.places ?? []).flatMap((p) => p.toLowerCase().split(/[^a-z]+/)).filter(Boolean);
  const mapWords = new Set([...(parent?.map ? MAP_WORDS[parent.map] ?? [parent.map] : []), ...cards]);
  const lexicon = new Set([...(parent?.words ?? []), ...cards]);
  const isOwn = (noun: string, phrase: string[]) => parent?.map || !parent?.words
    ? noun.split(/\s+/).some((w) => mapWords.has(w))
    : phrase.every((w) => lexicon.has(w));
  const mentions = [...rest.matchAll(SETTING), ...rest.matchAll(SITE)].map((m) => {
    const noun = m[1].toLowerCase(), at = m.index + m[0].length - m[1].length;
    const before = (rest.slice(0, at).toLowerCase().match(/[a-z'-]+/g) ?? []).slice(-2).filter((w) => !STOP.has(w));
    return { noun, phrase: [...before, ...noun.split(/\s+/)] };
  });
  // (a new city is a move even when the idea names it: "a new city called Oaktown")
  const moved = /\b(?:new|another|different|other)\s+(city|town|place|setting|location|world|map|planet|country)\b/i.exec(idea)?.[1]
    ?? mentions.filter((m) => !isOwn(m.noun, m.phrase)).map((m) => m.phrase.join(' '))[0] ?? null;
  return {
    kind: askedKind(idea), place: moved, rename,
    time: TIME.test(idea), hero: HERO.test(idea) || HERO_NAMED.test(idea), enemies: ENEMIES.test(idea), story: STORY.test(idea), amount: AMOUNT.test(idea),
    cars: CARS.test(idea), foot: FOOT.test(idea), fight: FIGHT.test(idea),
    noScenes: NO_SCENES.test(idea), noTraversal: NO_TRAVERSAL.test(idea), noPolice: NO_POLICE.test(idea), noCombat: NO_COMBAT.test(idea),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// what a world is, in words (the Mog prompt's keep-list and the repair's notes)

export const KIND_SAID: Record<WorldMode, string> = {
  race: 'an endless-lap race', survival: 'an open world on foot, surviving the crews', derby: 'a car combat arena (a derby)',
};
const list = (xs: string[], n = 3) => xs.length > n ? `${xs.slice(0, n).join(', ')} and more` : xs.join(', ');
const patrolSaid = (car: string) => (car === 'on' ? 'a patrol car' : `${/^[aeiou]|^suv$/i.test(car) ? 'an' : 'a'} ${car === 'suv' ? 'SUV' : car}`);
function heroSaid(h: Dna['hero']) {
  const what = h.kind === 'human' ? `a library human${h.body ? ` (${h.body})` : ''}` : h.kind === 'car' ? `a car${h.traits.length ? ` (${h.traits[h.traits.length - 1]})` : ''}` : h.kind === 'creature' ? 'a creature' : 'a character of its own';
  const traits = h.kind === 'car' ? [] : h.traits;
  return `${h.name ? `${h.name}, ` : ''}${what}${traits.length ? `, ${traits.join(', ')}` : ''}`;
}
function placeSaid(d: Dna) {
  if (!d.map) return d.places.length ? `its own place, ${list(d.places)}` : 'a place it builds itself';
  const city = d.city ? [d.city.district, d.city.time ? `at ${d.city.time}` : ''].filter(Boolean).join(', ') : '';
  return `the library map '${d.map}'${city ? ` (${city})` : ''}${d.places.length ? `, named ${list(d.places)}` : ''}`;
}
function crewsSaid(c: Dna['crews']) {
  return CREWS.filter((k) => c[k]).map((k) => `${k}: ${c[k]!.as === 'people' ? '' : `${c[k]!.as}, `}${list(c[k]!.names, 2) || 'unnamed'}`).join('; ');
}
function storySaid(d: Dna) {
  return [
    d.intro ? `the opening scene (${d.intro.shots} shots)` : '',
    d.goal ? `the goal${d.goal.title ? ` "${d.goal.title}"` : ''}${d.goal.gm ? ` at ${d.goal.gm.toLocaleString('en-US')} GM` : ''}${d.fund ? ` for the ${d.fund}` : ''}` : '',
    d.beats ? `${d.beats} story beats` : '',
    d.outro ? `the closing scene${d.outro.cast.length ? ` with ${list(d.outro.cast)}` : ''}` : '',
  ].filter(Boolean).join(', ');
}

/** The parent's DNA as the Mog prompt states it: the things a Mog keeps unless the idea replaces them. */
export function describeDna(d: Dna): string[] {
  const out = [`The kind of game: ${KIND_SAID[d.kind]}.`, `The place: ${placeSaid(d)}.`];
  if (d.traversal) out.push('The traversal: the hero runs up walls and swings between the buildings (open.traversal).');
  out.push(`The hero: ${heroSaid(d.hero)}${d.moves.length ? `; his moves: ${d.moves.join(', ')}` : ''}.`);
  if (Object.keys(d.crews).length) out.push(`The crews: ${crewsSaid(d.crews)}.`);
  if (d.patrol) out.push(`The patrol car: ${patrolSaid(d.patrol)} (open.patrol).`);
  const story = storySaid(d);
  if (story) out.push(`The story: ${story}.`);
  if (d.kind === 'race') {
    const p = [d.play.vehicle ? 'cars (play.vehicle)' : '', d.play.combat ? 'the sword (play.combat)' : '', d.play.bounty ? 'a lap bounty (play.bounty)' : ''].filter(Boolean);
    if (p.length) out.push(`The platform options: ${p.join(', ')}.`);
  }
  if (d.assets.length) out.push(`The library kits: ${d.assets.filter((a) => !a.startsWith('music-')).join(', ')}.`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// the comparison

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * What the child dropped or changed of its parent that the idea does not ask for. Each rule, and what lets it pass:
 * - kind: the kind of game (race, survival, derby) changed. Only an idea that names the new kind (KIND) changes it.
 * - map: the library map changed or went. Only an idea that names a place the parent is not (readIdea: SETTINGS, SITES,
 *   or "a new city") moves it, or one that asks for another kind; renaming the place ("city is called Oaktown") is not.
 * - time: the city's time of day changed. The idea names a time of day.
 * - traversal: the swinging and climbing went. The idea asks for another kind, or says no swinging.
 * - patrol: the patrol car went. The place moved, the kind changed, or the idea says no police.
 * - hero: the hero's kind (a person, a car, a creature), name or body changed. The idea names a new hero; or a car,
 *   when the idea asks for a derby, or cars in a lap race.
 * - moves: the same hero's moves and weapon changed. The idea talks of fighting (punches, kicks, moves, weapons).
 * - crews: a crew went, or became cars or creatures, or kept none of its names. The place moved, the idea names
 *   enemies, or the kind changed as asked.
 * - story: the goal's title and the GM's purpose both changed (or the goal went), the amount changed, or the story's
 *   beats went. The idea asks for a story (a mission, a goal, what the GM is for), or both the hero and the place are new.
 * - intro, outro: a scene went. The idea says no scenes (and with GM off there is no outro to keep).
 * - places: a world of its own whose places all went. The place moved, or the idea renames it.
 * - play: a lap world's cars, sword or bounty went (or cars came). The idea asks for that.
 * Minor (recorded, said in a repair, never a reason for one on their own):
 * - kits: a people kit (human-*) went while there are still people. Nothing lets it pass.
 * - scenery: more than half the scenery kits went while the place stayed.
 * - track: a lap world's track has another number of control points while the place stayed.
 */
export function compareDna(parent: Dna | string, child: Dna | string, ideaText: string): DnaVerdict {
  const p = typeof parent === 'string' ? dna(parent) : parent, c = typeof child === 'string' ? dna(child) : child;
  const idea = readIdea(ideaText, p);
  const dropped: DnaDrop[] = [], allowed: DnaVerdict['allowed'] = [];
  const rule = (key: DnaKey, changed: boolean, ok: string | false | null | undefined, note: () => string, minor = false) => {
    if (!changed) return;
    if (ok) allowed.push({ key, why: ok });
    else dropped.push({ key, note: note(), ...(minor ? { minor: true as const } : {}) });
  };
  const kindOk = p.kind !== c.kind && idea.kind === c.kind;
  const moved = idea.place ? `the idea names a new place (${idea.place})` : false;
  const kindWhy = kindOk ? `the idea asks for ${KIND_SAID[c.kind]}` : false;
  const renamed = idea.rename
    ? ` The idea only renames it: keep the place and put "${idea.rename}" on ${p.map === 'city' ? 'its billboards and shop signs (open.city.ads, signs)' : 'its signs'} and its title cards.`
    : '';

  rule('kind', p.kind !== c.kind, kindWhy,
    () => `The kind of game: the original is ${KIND_SAID[p.kind]}, this is ${KIND_SAID[c.kind]}, and the idea does not ask for that. Keep ${KIND_SAID[p.kind]}.`);
  rule('map', p.map !== c.map, moved || kindWhy,
    () => `The place: the original is on ${placeSaid(p)}; this ${c.map ? `moved it to the library map '${c.map}'` : 'builds a place of its own instead'}.${renamed}`);
  if (p.map === 'city' && c.map === 'city') {
    rule('time', !same(p.city?.time, c.city?.time), idea.time && 'the idea names a time of day',
      () => `The time of day: the original's city is at ${p.city?.time ?? 'its default time'}, this one at ${c.city?.time ?? 'the default'}.`);
  }
  rule('traversal', p.traversal && !c.traversal, kindWhy || (idea.noTraversal && 'the idea asks for no swinging'),
    () => 'The traversal: the original\'s hero runs up walls and swings between the buildings (open.traversal); this one cannot.');
  rule('patrol', !!p.patrol && !c.patrol, (p.map !== c.map && moved) || kindWhy || (idea.noPolice && 'the idea asks for no police'),
    () => `The patrol car: the original sends ${patrolSaid(p.patrol!)} down the avenue (open.patrol); this has none.`);

  const heroChanged = p.hero.kind !== c.hero.kind || (!!p.hero.name && !!c.hero.name && !same(p.hero.name, c.hero.name))
    || (!!p.hero.body && !!c.hero.body && p.hero.body !== c.hero.body) || p.hero.traits.includes('a chrome endoskeleton') !== c.hero.traits.includes('a chrome endoskeleton');
  const toCar = c.hero.kind === 'car' && ((kindOk && c.kind === 'derby') || (c.kind === 'race' && idea.cars));
  rule('hero', heroChanged, (idea.hero && 'the idea names a new hero') || (toCar && 'the idea asks for cars'),
    () => `The hero: the original's is ${heroSaid(p.hero)}; this one's is ${heroSaid(c.hero)}.`);
  if (p.kind === 'survival' && c.kind === 'survival' && !heroChanged) {
    const a = [...p.moves].sort().join(', '), b = [...c.moves].sort().join(', ');
    rule('moves', a !== b, idea.fight && 'the idea talks of fighting',
      () => `The hero's moves: the original's ${a ? `has ${a}` : 'fights with every move'}; this one's ${b ? `has ${b}` : 'fights with every move'}.`);
  }

  const lost = CREWS.filter((k) => p.crews[k]).filter((k) => {
    const a = p.crews[k]!, b = c.crews[k];
    if (!b || a.as !== b.as) return true;
    return a.names.length > 0 && !a.names.some((n) => b.names.some((m) => same(n, m)));
  });
  rule('crews', lost.length > 0, moved || (idea.enemies && 'the idea names the enemies') || kindWhy,
    () => `The crews: the original's ${lost.map((k) => `${k} (${p.crews[k]!.as === 'people' ? '' : `${p.crews[k]!.as}, `}${list(p.crews[k]!.names, 2) || 'unnamed'})`).join(', ')}; this world's ${crewsSaid(c.crews) || 'are gone'}.`);

  rule('intro', !!p.intro && !c.intro, idea.noScenes && 'the idea asks for no scenes', () => `The opening scene: the original has one (${p.intro!.shots} shots); this has none.`);
  rule('outro', !!p.outro && !c.outro, (idea.noScenes && 'the idea asks for no scenes') || (!c.coins && 'no GM, so no goal to close on'),
    () => `The closing scene: the original has one${p.outro!.cast.length ? ` with ${list(p.outro!.cast)}` : ''}; this has none.`);

  const mission = (!!p.goal?.title || !!p.fund) && c.coins && (!c.goal || ((!p.goal?.title || !same(p.goal.title, c.goal.title)) && (!p.fund || !same(p.fund, c.fund))));
  const amount = !!p.goal?.gm && !!c.goal?.gm && p.goal.gm !== c.goal.gm && !idea.amount;
  const beats = p.beats > 0 && c.beats === 0 && !idea.noScenes;
  rule('story', mission || amount || beats, (idea.story && 'the idea asks for a new story') || (idea.hero && moved && 'a new hero in a new place is a new story'),
    () => `The story: the original's is ${storySaid(p)}; this one's is ${storySaid(c) || 'gone'}.`);

  if (!p.map && p.places.length) {
    rule('places', !p.places.some((a) => c.places.some((b) => same(a, b))), moved || (idea.rename && 'the idea renames the place'),
      () => `The places it names: ${list(p.places)}; this world names ${list(c.places) || 'none'}.`);
  }
  const people = c.hero.kind === 'human' || Object.values(c.crews).some((k) => k.as === 'people');
  const kits = p.assets.filter((a) => a.startsWith('human-') && !c.assets.includes(a));
  rule('kits', people && kits.length > 0, false, () => `The library's people kits: ${kits.join(', ')} (in the original's assets list).`, true);
  const scenery = p.assets.filter((a) => !a.startsWith('human-') && !a.startsWith('music-'));
  const goneScenery = scenery.filter((a) => !c.assets.includes(a));
  rule('scenery', scenery.length > 0 && goneScenery.length * 2 > scenery.length, moved || kindWhy,
    () => `The scenery kits: ${goneScenery.join(', ')} (the original's assets list), while the place stays.`, true);

  if (p.kind === 'race' && c.kind === 'race') {
    const changes = [
      p.play.vehicle && !c.play.vehicle && !(idea.foot || idea.hero) ? 'the original races cars (play.vehicle) and this does not' : '',
      !p.play.vehicle && c.play.vehicle && !idea.cars ? 'the original races on foot and this races cars' : '',
      p.play.combat && !c.play.combat && !idea.noCombat ? 'the original has the sword (play.combat) and this does not' : '',
      p.play.bounty && !c.play.bounty && !/\bno (?:lap )?bounty\b/i.test(ideaText) ? 'the original pays a lap bounty (play.bounty) and this does not' : '',
    ].filter(Boolean);
    rule('play', changes.length > 0, false, () => `The platform options: ${changes.join('; ')}.`);
    const a = p.track, b = c.track;
    rule('track', !!a?.points && !!b?.points && a.points !== b.points, moved, () => `The track: the original's loop has ${a!.points} control points and this one's ${b!.points}, while the place stays.`, true);
  }
  return { dropped, allowed, idea };
}

/** The verdict as the draft's report keeps it. */
export const dnaReport = (v: DnaVerdict, repair?: string): DnaReport => ({ dropped: v.dropped, allowed: v.allowed, ...(repair ? { repair } : {}) });

/**
 * Which pass ships when the second was written to put back what the first dropped of its parent (and to answer its
 * notes, if it had any): the one that keeps more of the parent, if both pass; with the same DNA, the look decides
 * (lib/look.ts pickPass), and a repair that put nothing back ships only if it answered notes and looks no worse. A
 * repair that broke the world never ships. Putting the parent back outranks the look: a world that is not a variation
 * of its parent is not a Mog. Pure, so it is tested without a paid build (npm run check).
 */
export function pickMogPass(prev: Pass & { dropped: number }, next: Pass & { dropped?: number }): PassPick {
  const look = pickPass(prev, next);
  if (next.problems?.length || (prev.status === 'passed' && next.status !== 'passed') || next.dropped === undefined) return look;
  if (next.dropped < prev.dropped) return { keep: 'next', why: `the repair put back the parent's DNA (${prev.dropped} dropped, now ${next.dropped})${look.keep === 'prev' ? `, though ${look.why}` : ''}` };
  if (next.dropped > prev.dropped) return { keep: 'prev', why: `the repair dropped more of the parent (${next.dropped}, against ${prev.dropped})` };
  if (prev.dropped && !prev.notes?.length) return { keep: 'prev', why: `the repair did not put back the parent's DNA (${next.dropped} still dropped)` };
  return look;
}
