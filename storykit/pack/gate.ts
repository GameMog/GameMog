/**
 * Story Kit: the static gate for STORY PACK v2 (STORY-KIT-PLAN.md 2.2, stage 2). Pure data in, a verdict out, in well
 * under a second, with no network and no city loaded, so it runs on the Render server before anything is built.
 *
 *   gatePack(pack, { parent })  ->  { ok, problems, warnings, clamped, pack, lines }
 *
 *   problems  refusals: the pack does not play. Each names where and why.
 *   warnings  played, but worth a look (another city named in dialogue, two voices too alike).
 *   clamped   numbers moved into range (every number is clamped, never refused, except an age).
 *   pack      the pack with the clamps applied (null when refused).
 *   lines     every spoken line: { id, who, text, hash, status, clip } (the voice manifest, with pending filled in).
 *
 * Beyond the JSON Schema (schema.json, from schema.mjs) it holds these rules:
 *   1. base: the engine and a known build of the city on it (Mog City's engine, mogcity-1, plays New York only); on a
 *      Mog, equal to the parent's base (the city is locked), or, for a parent on the older storykit-1, mogcity-1 in the
 *      same city (mogBase: what the builder always writes).
 *   2. places: every "@key" exists in the city's place list (cities.ts) or is the pack's own alias of one; a drive
 *      target is on the lanes (no `foot` place, no `startOnly` one); no alias shadows a city key.
 *   3. verbs: every verb a mission asks for (declared, implied by its steps, or written in its text) is one its
 *      vehicle can do (VERBS below), or the pack is refused: never faked.
 *   4. kinds: nothing is renamed into another kind of thing: a car called a bike, bike words on a car mission, a person
 *      called a dog (a dog is a pet), a two-wheeler sheet (planned, not built) is refused.
 *   5. labels: on-screen words naming another city are refused (the Dognapped Mog: Chicago labels in New York).
 *   6. likeness: no field for a real person's likeness or voice; "looks like / sounds like <Name>" is refused.
 *   7. text: lengths (schema), no markup, the platform's blocked words, the never-mention list, known {tokens} only.
 *   8. references: speakers, passengers, gotos, meters, timelines, missions and the voice manifest all resolve.
 *   9. the cast registry (public/storykit/cast/registry.json, storykit/cast/README.md): a person may be a shipped model
 *      ({ model: 'mogcity/dan' }, no sheet: their own body, clips, face and recorded lines); its anchor, voice, name and
 *      role default to the registry's (filled in here). A model does only what its registry entry `can` (a Suit can't
 *      sit, so never a passenger, nor the hero). On a Mog, a person whose parent was a model and who now has a sheet is a
 *      replacement: it starts from the seed (storykit/cast/seeds.json) and the registry's anchor (a warning otherwise).
 *
 *  10. Mog City's engine (mogcity-1): a `scene` step (one of Mog City's authored set pieces, schema MOGCITY_SCENES) only
 *      there, and a warning when its hero is not Dan; the kinds its runner has no part for yet (MOGCITY_STUBS) and any
 *      weather but clear (Mog City draws none yet) are warnings.
 *  11. the title (the owner, 4 Nov): Mog City is the engine and the template, never a world's name, so no Create's or
 *      Mog's title or kicker names it, however it is written ("Mog City: Night Shift", "MOGCITY", "Mog-City", "M0G
 *      CITY"; namesMogCity). Only Mog City's own story as a world (storykit/packs/mog-city.json, gated with { own: true }
 *      by the repo's own checks, never by the store or the builder) may.
 *  12. a Mog keeps its parent's framework (frameworkProblems): the same meters (ids, kinds and numbers; a label may be
 *      reworded), the same clock (format and unit), and only the step kinds, fight rules and fight wins its parent uses.
 *      It changes the story, the cast, the cars, the voices and the dressing. A Create sets its own rules: its meters,
 *      clock, mission rules and HUD items, from the runtime's parts (the schema's closed lists).
 *  13. a search of the hero's own car (search on: 'ride', its part: trunk, door, hood): only on a mission with a vehicle and
 *      on Mog City's engine, its `at` a drive place (where he drives the car to); a part only with on: 'ride'.
 *
 *  14. the opening (openingProblems): wide on the city with the place card first, never a close-up of one person; a name
 *      card for the hero and the antagonist (and up to 3 others), each framed on its person and stood on the street;
 *      the premise in 2 to 4 spoken lines; the title once; 30 to 75 s. A Mog keeps its parent's (or writes its own by
 *      the same rules). Its lines are voiced as every other (ids OPEN.c<shot>). A Create without one passes the gate (a
 *      world from before it); the builder sends a new Create without one back (lib/storykit-build.ts).
 *
 *  15. a showcase (gatePack(pack, { showcase: true })): one of GameMog's own first-party worlds shipped from the repo
 *      (schema.mjs SHOWCASE_PACKS, gated so by the repo's checks only, like { own: true }; never the store, the builder or
 *      a Mog) may be longer than a Create: SHOWCASE's bytes, acts, missions per act, steps, lines, cast and opening length.
 *
 * toRunnerPack(pack) turns a passed pack into the runner's pack format (storykit: 1, with its engine): what the store
 * seals as a world and Mog City's runner plays (Mog City wagmi/storyrun/pack.js).
 */
import SCHEMA from './schema.json' with { type: 'json' };
import FORGE from '../../scripts/forge/character-sheet.schema.json' with { type: 'json' };
import VEHICLE_SCHEMA from '../vehicles/vehicle-sheet.schema.json' with { type: 'json' };
import { Validator, type Schema } from './validate.ts';
import { PLACES, CAM_POINTS, CITY_NAME, foreignIn, buildsFor, type CityId } from './cities.ts';
import { MOGCITY_STUBS, OPENING, SHOWCASE, SHOWCASE_PACKS, SHOWCASE_CARS } from './schema.mjs';
import { lintVoiceBlock, KOKORO_VOICES, lineHash as vdLineHash } from '../voices/voice-design.js';
import { isBlocked } from '../../lib/names.ts';
import { modelOf, nearVoice, can as modelCan } from './registry.ts';
import { neverMentioned } from '../../lib/episode.ts';
import { TOW_CLASSES } from '../vehicles/sheet.js';

type Json = any;
export type PackV2 = Json;
export type Line = { id: string; who: string; text: string; hash: string; status: 'ready' | 'pending'; clip: string | null };
export type GateResult = { ok: boolean; problems: string[]; warnings: string[]; clamped: string[]; pack: PackV2 | null; lines: Line[] };

export const PACK_ID = (SCHEMA as Schema).$id as string;
const LIMIT_BYTES = 160_000;
// the step kinds whose own `at` is a place (not the side step's seconds)
const AT_PLACE = new Set(['npc', 'roadblock', 'place', 'search', 'car']);
/** Mog City's engine (mc.gamemog.com): every Create and Mog is written for it. */
export const MOGCITY = 'mogcity-1';
const STUBS = new Set<string>(MOGCITY_STUBS as string[]);
/**
 * The base a Mog of this parent runs on: the parent's, except that a parent on the older engine (storykit-1) moves to
 * Mog City's, in the same city, at its build (a city Mog City does not play yet keeps the parent's base).
 */
export function mogBase(base: { engine: string; city: string; cityBuild: string }) {
  if (base.engine === MOGCITY) return { ...base };
  const b = buildsFor(MOGCITY, base.city as CityId);
  return b.length ? { engine: MOGCITY, city: base.city, cityBuild: b[0] } : { ...base };
}

// The vehicle sheet's schema (storykit/vehicles/vehicle-sheet.schema.json), imported as the pack's schema is: a
// `new URL(..., import.meta.url)` read here broke the build route under Next's bundler (every POST /api/generate a 500)
const VEHICLE: Schema | null = VEHICLE_SCHEMA as Schema;
const PLANNED: string[] = VEHICLE?.properties?.family?.['x-planned'] || ['heavy4', 'motorbike', 'scooter', 'bicycle'];
const validator = new Validator([SCHEMA as Schema, FORGE as Schema, ...(VEHICLE ? [VEHICLE] : [])], [/\.sheet\.identity\.age$/]);
// a showcase's schema (rule 15): the same schema with SHOWCASE's longer lists, under its own id
const SHOWCASE_ID = PACK_ID.replace(/\.json$/, '.showcase.json');
const showcaseValidator = (() => {
  const s: Json = JSON.parse(JSON.stringify(SCHEMA)); s.$id = SHOWCASE_ID;
  const acts = s.properties.acts, missions = acts.items.properties.missions, steps = missions.items.properties.steps;
  acts.maxItems = SHOWCASE.acts; missions.maxItems = SHOWCASE.missionsPerAct; steps.maxItems = SHOWCASE.steps;
  acts.items.properties.timeline.maxProperties = SHOWCASE.missionsPerAct;
  s.properties.voices.maxProperties = SHOWCASE.lines; s.properties.cast.maxItems = SHOWCASE.cast;
  s.properties.opening.properties.shots.maxItems = SHOWCASE.openingShots; s.properties.places.maxProperties = SHOWCASE.places;
  return new Validator([s as Schema, FORGE as Schema, ...(VEHICLE ? [VEHICLE] : [])], [/\.sheet\.identity\.age$/]);
})();

// ── rides ──
type Family = 'car4' | 'heavy4' | 'motorbike' | 'scooter' | 'bicycle' | 'foot';
type Ride = { id: string; label: string; family: Family; abilities: Set<string>; seats: number; stock?: string };
// the stock cars (storykit/vehicles sheets for trailhand and vandal; the roadster is Mog City's own): boost (Shift) is all they do beyond driving
export const STOCK: Record<string, Ride> = {
  trailhand: { id: 'trailhand', label: 'Trailhand', family: 'car4', abilities: new Set(['boost']), seats: 5, stock: 'trailhand' },
  vandal: { id: 'vandal', label: 'Vandal GT', family: 'car4', abilities: new Set(['boost']), seats: 4, stock: 'vandal' },
  roadster: { id: 'roadster', label: 'Roadster', family: 'car4', abilities: new Set(['boost']), seats: 2, stock: 'roadster' },
  gt: { id: 'gt', label: 'Vantor GT', family: 'car4', abilities: new Set(['boost']), seats: 2, stock: 'gt' },
};
const FOOT: Ride = { id: 'on-foot', label: 'on foot', family: 'foot', abilities: new Set(['dash']), seats: 1 };
const TWO_WHEEL: Family[] = ['motorbike', 'scooter', 'bicycle'];
// the city bodies a tow step can put on the hook (Mog City's NYC.BODY_SPECS)
const TOW_BODIES = ['sedan', 'suv', 'taxi', 'pickup', 'van', 'minivan'];

/** What each verb needs. `ride`: any vehicle (not on foot); `ability`: one the ride lists; `family`: one of these. */
export const VERBS: Record<string, { ride?: true; ability?: string; family?: Family[]; seats?: true; foot?: true; why: string }> = {
  drive: { ride: true, why: 'driving needs a vehicle' },
  walk: { why: '' },
  boost: { ability: 'boost', why: 'it has no boost' },
  hop: { ability: 'hop', why: 'it cannot hop' },
  dash: { ability: 'dash', foot: true, why: 'it has no dash' },
  ram: { ability: 'ram', why: 'it has no rammer' },
  escape: { ride: true, why: 'a chase is between vehicles' },
  chase: { ride: true, why: 'a chase is between vehicles' },
  tail: { ride: true, why: 'a tail is followed in a vehicle' },
  follow: { ride: true, why: 'a convoy is followed in a vehicle' },
  carry: { seats: true, why: 'it has no seat for a passenger' },
  sneak: { why: '' },
  deliver: { why: '' },
  pedal: { family: ['bicycle'], why: 'only a bicycle has pedals' },
  lean: { family: ['motorbike', 'scooter', 'bicycle'], why: 'only a two-wheeler leans' },
  wheelie: { family: ['motorbike', 'bicycle'], why: 'only a bike pulls a wheelie' },
  tow: { ability: 'tow', why: 'it has no tow rig (a wrecker or a pickup with the tow ability)' },
  // (a fight is on foot: a mission in a car gets out for it, so every ride can)
  fight: { why: '' },
};
export function canDo(ride: Ride, verb: string): boolean {
  const v = VERBS[verb]; if (!v) return false;
  if (ride.family === 'foot') return !(v.ride || v.ability && !v.foot || v.family || v.seats);
  if (v.family && !v.family.includes(ride.family)) return false;
  if (v.ability && !ride.abilities.has(v.ability)) return false;
  if (v.seats && ride.seats < 2) return false;
  return true;
}

// words for kinds of ride; a word of another family than the mission's ride is a rename
const RIDE_WORDS: Record<'car4' | 'two', RegExp> = {
  car4: /\b(car|cars|cab|taxi|sedan|coupe|suv|hatchback|limo|limousine|minivan|van|truck|pickup truck|roadster|convertible)\b/i,
  two: /\b(bike|bikes|bicycle|bicycles|cycle|cycling|cyclist|motorbike|motorcycle|scooter|moped|bmx|fixie|pedal|pedals|pedalling|pedaling|handlebars?|kickstand|saddle|wheelie)\b/i,
};
// in dialogue a ride word only counts when it names a ride the player has (the bike, your bike), or a part of one
const SPOKEN_TWO = /\b(?:(?:my|your|the|our|his|her|their|this|that)\s+(?:bike|bicycle|motorbike|motorcycle|scooter|moped)|pedal(?:s|ling|ing)?|handlebars?|kickstand|wheelie)\b/i;
// verbs written in a mission's text; "hop in" (get in the car) is not a hop
const TEXT_VERBS: [RegExp, string][] = [
  [/\bhop(?:s|ped|ping)?\b(?!\s+(?:in|into|on|onto|out|off|over to|up front|aboard)\b)/i, 'hop'],
  [/\bwheelies?\b/i, 'wheelie'], [/\bpedal(?:s|led|ling|ed|ing)?\b/i, 'pedal'], [/\b(?:ram|rams|rammed|ramming)\b/, 'ram'],
  [/\b(?:tow|tows|towed|towing)\b(?!\s+truck)/i, 'tow'], [/\blean(?:s|ing)? into the (?:turn|corner|bend)\b/i, 'lean'],
];
const ANIMAL = /\b(dog|dogs|puppy|pup|hound|mutt|cat|kitten|horse|pony|parrot|hamster|rabbit|bunny)\b/i;
const LIKENESS_KEY = /likeness|look.?alike|resembl|celebrity|based.?on|real.?(?:name|person|people)|portrait|photo|face.?ref|voice.?ref|clone|impersonat/i;
/** Words that point at a real person's likeness (rule 6; the build route reads a story's hero look with it too). */
export const LIKENESS_TEXT = /\b(?:[Ll]ooks?|[Ss]ounds?|[Tt]alks?|[Dd]ressed)\s+(?:just\s+)?like\s+(?:a\s+young(?:er)?\s+|an\s+old(?:er)?\s+)?\p{Lu}\p{Ll}|\b[Rr]esembl\w*\s+\p{Lu}|\b[Pp]layed by\b|\b[Ii]n the (?:style|voice|image) of\b|\b[Ll]ook-?alike\b|\b[Dd]oppel?g[aä]nger\b|\b[Ii]mpersonat\w*|\b(?:[Aa]\s+)?(?:[Yy]ounger|[Oo]lder) version of\b/u;
const TOKENS = new Set(['n', 'of', 'name', 'ride', 'ride.name', 'ride.board', 'ride.go', 'ride.park']);

/** FNV-1a (32-bit) of a line's text: a clip in the manifest is for this exact text (the voice pass's own, voice-design.js). */
export const lineHash = (text: string): string => vdLineHash(text);

const SPEECH_KEYS = new Set(['reply', 'silenceReply', 'line']);
const FREE_KEYS = new Set(['title', 'kicker', 'tagline', 'name', 'stakes', 'passLine', 'note', 'timerLine', 'label', 'objective', 'why', 'role',
  'alert', 'peelText', 'text', 'prompt', 'defaultText', 'sub', 'caption', 'heading', 'lateLabel', 'silenceLabel', 'reply', 'silenceReply',
  'line', 'missing', 'signed', 'skip', 'date', 'due', 'hint', 'logline', 'presentation', 'gestures', 'wants', 'speech', 'traits', 'story',
  'description', 'nickname', 'oneLine', 'unitLabel', 'zero', 'street', 'note', 'fail', 'value']);

type Text = { at: string; text: string; speech: boolean; mission?: string };

/**
 * Whether a text names Mog City, however it is written: any case, any spacing or punctuation between its letters, a digit
 * for a letter, an accent ("Mog City", "MOGCITY", "Mog-City", "m.o.g. city", "M0G CITY", "Mög City"); "Smog City" does not.
 */
export function namesMogCity(text: unknown): boolean {
  const plain = String(text ?? '').normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[0134578@$]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's' } as Record<string, string>)[c] ?? c);
  return /(^|[^a-z])m[^a-z]*o[^a-z]*g[^a-z]*c[^a-z]*i[^a-z]*t[^a-z]*y(?![a-z])/.test(plain);
}

/** A step and every step started beside it (during, a trigger's do), all the way down. */
const allSteps = (steps: Json[] = []): Json[] => steps.flatMap((x) => [x, ...allSteps(x?.during), ...allSteps(x?.do)]);
const missionsOf = (p: PackV2): Json[] => (p?.acts ?? []).flatMap((a: Json) => a?.missions ?? []);
/**
 * What a Mog may not change of its parent's framework (its rules): the meters (ids, kinds and every number; the label
 * and prefix are words, a Mog may reword them), the clock (format and unit), and the kinds of mission it is made of (no
 * step kind, fight rule or fight win its parent does not use). The story, cast, cars, voices and dressing are the Mog's.
 */
export function frameworkProblems(pack: PackV2, parent: PackV2): string[] {
  const out: string[] = [];
  const RULE_KEYS = ['kind', 'start', 'min', 'max', 'pips', 'cool', 'heat'];
  const meters = (p: PackV2) => new Map<string, Json>((p?.hud?.meters ?? []).map((m: Json) => [m.id, m]));
  const was = meters(parent), now = meters(pack);
  for (const [id, m] of now) {
    const w = was.get(id);
    if (!w) { out.push(`hud.meters "${id}": a Mog keeps its parent's meters (${[...was.keys()].map((k) => `"${k}"`).join(', ') || 'none'}); it adds none. A new rule is a new world (Create).`); continue; }
    const diff = RULE_KEYS.filter((k) => JSON.stringify(m[k] ?? null) !== JSON.stringify(w[k] ?? null));
    if (diff.length) out.push(`hud.meters "${id}": a Mog keeps its parent's meter rules (${diff.map((k) => `${k} ${JSON.stringify(w[k] ?? null)}`).join(', ')}); only its label may be reworded.`);
  }
  for (const id of was.keys()) if (!now.has(id)) out.push(`hud.meters "${id}": a Mog keeps every meter its parent has; "${id}" is missing.`);
  const clock = (p: PackV2) => (p?.hud?.clock ? { format: p.hud.clock.format ?? null, unit: p.hud.clock.unit ?? null } : null);
  if (JSON.stringify(clock(pack)) !== JSON.stringify(clock(parent))) out.push(`hud.clock: a Mog keeps its parent's clock (${JSON.stringify(clock(parent))}); only its words (label, unitLabel, zero) may change.`);
  const used = (p: PackV2) => { const steps = missionsOf(p).flatMap((m: Json) => allSteps(m?.steps)); return { kinds: new Set<string>(steps.map((x) => x?.type)), rules: new Set<string>(steps.filter((x) => x?.type === 'fight').map((x) => x.rules ?? 'full')), wins: new Set<string>(steps.filter((x) => x?.type === 'fight').map((x) => x.win)) }; };
  const P = used(parent), N = used(pack);
  const extra = [...N.kinds].filter((k) => !P.kinds.has(k));
  if (extra.length) out.push(`${extra.map((k) => `'${k}'`).join(', ')}: a Mog keeps its parent's mission structure, the step kinds it is made of (${[...P.kinds].join(', ')}); it adds no new kind of step. Tell the idea through those, or make a new world (Create).`);
  // (a fight where the parent has none is already the new kind above)
  const fights = P.kinds.has('fight'), rules = fights ? [...N.rules].filter((k) => !P.rules.has(k)) : [], wins = fights ? [...N.wins].filter((k) => !P.wins.has(k)) : [];
  if (rules.length) out.push(`fight rules ${rules.map((k) => `"${k}"`).join(', ')}: a Mog keeps its parent's fight rules (${[...P.rules].map((k) => `"${k}"`).join(', ')}).`);
  if (wins.length) out.push(`fight win ${wins.map((k) => `"${k}"`).join(', ')}: a Mog keeps its parent's ways to win a fight (${[...P.wins].map((k) => `"${k}"`).join(', ')}).`);
  return out;
}

/**
 * The gate. `parent` is the pack a Mog remixes (its base and framework must be kept). `own`: Mog City's own story as a
 * world (storykit/packs/mog-city.json), whose title is Mog City's; only the repo's own checks pass it.
 */
export function gatePack(input: unknown, opts: { parent?: PackV2 | null; own?: boolean; showcase?: boolean } = {}): GateResult {
  const problems: string[] = [], warnings: string[] = [], clamped: string[] = [];
  const refuse = (s: string) => problems.push(s);
  const done = (pack: PackV2 | null, lines: Line[] = []): GateResult => ({ ok: problems.length === 0, problems, warnings, clamped, pack: problems.length ? null : pack, lines });

  if (!input || typeof input !== 'object' || Array.isArray(input)) { refuse('The story pack is not a JSON object.'); return done(null); }
  const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  // 15. a showcase (a first-party world shipped from the repo, SHOWCASE_PACKS: never the builder's or the store's) may be
  // longer: SHOWCASE's bytes, acts, missions, steps, lines, cast and opening
  const show = !!opts.showcase;
  if (show && (opts.parent || !SHOWCASE_PACKS.includes((input as Json).id))) { refuse(`A showcase is one of GameMog's own worlds (${SHOWCASE_PACKS.join(', ')}), never a Mog; "${(input as Json).id}" is not one.`); return done(null); }
  const maxBytes = show ? SHOWCASE.bytes : LIMIT_BYTES;
  if (bytes > maxBytes) { refuse(`The pack is ${bytes} bytes; the limit is ${maxBytes}.`); return done(null); }
  // a likeness field anywhere, even one the schema would only call unknown, gets its own refusal
  scanKeys(input, '', (at, k, o) => {
    if (LIKENESS_KEY.test(k)) refuse(`${at ? at + '.' : ''}${k}: a pack has no field for a real person's face, voice or likeness.`);
    // a coordinate where a place goes: places are names, so a label can never sit on the wrong spot
    if (k === 'x' && typeof o.x === 'number' && typeof o.z === 'number') refuse(`${at || '(the pack)'}: { x, z } is a coordinate; a pack names places ("@key" from the city's place list).`);
  });
  if ((input as Json).storykit !== 2) { refuse(`storykit must be 2 (this gate reads pack v2), not ${JSON.stringify((input as Json).storykit)}.`); return done(null); }
  // a two-wheeler sheet: planned, not built, said plainly before the schema's enum error
  for (const [i, v] of ((input as Json).vehicles || []).entries?.() || []) {
    if (v && PLANNED.includes(v.family)) refuse(`vehicles[${i}] (${v.id || '?'}): a ${v.family} is planned, not built yet; the pack is refused, never faked with a car.`);
  }
  if (problems.length) return done(null);

  const checked = show ? showcaseValidator.check(SHOWCASE_ID, input) : validator.check(PACK_ID, input);
  clamped.push(...checked.clamped);
  if (checked.problems.length) { problems.push(...dedupe(checked.problems)); return done(null); }
  const pack: PackV2 = checked.value;
  const city = pack.base.city as CityId;

  // 1. base: the engine plays the city at that build (Mog City's engine, mogcity-1: New York only so far)
  const engine = pack.base.engine as string, mc = engine === MOGCITY, builds = buildsFor(engine, city);
  if (!builds.length) refuse(`base: ${mc ? "Mog City's engine (mogcity-1)" : engine} does not play ${CITY_NAME[city]} yet${mc ? '; only New York (base.city "ny")' : ''}.`);
  else if (!builds.includes(pack.base.cityBuild)) refuse(`base.cityBuild "${pack.base.cityBuild}" is not a build of ${CITY_NAME[city]} on ${engine} (${builds.join(', ')}).`);
  if (opts.parent) {
    const parent = opts.parent;
    if (pack.parent !== parent.id) refuse(`A Mog names its parent: parent must be "${parent.id}", not ${JSON.stringify(pack.parent ?? null)}.`);
    // (the city is locked; a parent on the older engine may move to Mog City's, the same city, never back: mogBase. The
    // builder always moves it, lib/storykit-build.ts platformFields)
    const want = mogBase(parent.base), keeps = [parent.base, want].some((b) => JSON.stringify(sortKeys(pack.base)) === JSON.stringify(sortKeys(b)));
    if (!keeps) refuse(`A Mog keeps its parent's base: ${JSON.stringify(want)}, not ${JSON.stringify(pack.base)} (the city is locked; dressing may change).`);
    if (pack.id === parent.id) refuse('A Mog needs its own id, not its parent\'s.');
    // 12. a Mog keeps its parent's framework: the same rules, meters and kinds of mission; its own story, cast, cars, voices, dressing
    for (const p of frameworkProblems(pack, parent)) refuse(p);
  } else if (pack.parent) refuse(`This pack is a Mog of "${pack.parent}": it is checked against that parent, and none was given.`);
  // 11. the title is the world's own: Mog City is the engine, never a Create's or a Mog's name
  if (!opts.own) for (const k of ['title', 'kicker'] as const) if (namesMogCity(pack[k])) {
    refuse(`${k}: "${pack[k]}" names Mog City. Mog City is the engine this world plays on, never its name: give ${opts.parent ? 'this Mog' : 'this world'} a title of its own${k === 'kicker' ? ' and a kicker without it (or none)' : ' ("Night Shift", never "Mog City: Night Shift")'}.`);
  }

  // Mog City draws no weather yet: anything but clear is kept as the pack's setting and not shown until the owner has
  // seen it (weather is behind this setting only, never on by default)
  if (mc && pack.dressing.weather !== 'clear') warnings.push(`dressing.weather "${pack.dressing.weather}": Mog City shows no weather yet; the city plays clear (the setting is kept for when it does). Let the words carry it.`);
  const heroIsDan = pack.cast.some((c: Json) => c.id === pack.hero && c.model === 'mogcity/dan');

  // dressing: a season and holiday that agree (a Christmas story in a summer city was the Dognapped complaint)
  const d = pack.dressing, hol: string[] = d.holiday || [];
  if (d.weather === 'snow' && d.season !== 'winter') refuse(`dressing: snow in ${d.season}; snow is winter weather.`);
  const holidaySeason: Record<string, string> = { christmas: 'winter', 'new-year': 'winter', hanukkah: 'winter', halloween: 'autumn', thanksgiving: 'autumn', 'independence-day': 'summer' };
  for (const h of hol) if (holidaySeason[h] && holidaySeason[h] !== d.season) refuse(`dressing: ${h} in ${d.season}; it is a ${holidaySeason[h]} holiday.`);

  // ids
  const cast = new Map<string, Json>(), pets = new Map<string, Json>(), rides = new Map<string, Ride>();
  for (const c of pack.cast) { if (cast.has(c.id)) refuse(`cast: two people are "${c.id}".`); cast.set(c.id, c); }
  for (const p of pack.pets || []) { if (pets.has(p.id) || cast.has(p.id)) refuse(`pets: "${p.id}" is already used.`); pets.set(p.id, p); }
  // 9. a shipped model: no sheet; its anchor, voice, name and role default to the registry's (written into the pack)
  const parentCast = new Map<string, Json>((opts.parent?.cast || []).map((c: Json) => [c.id, c]));
  for (const c of pack.cast) {
    const at = `cast "${c.id}"`, m = c.model ? modelOf(c.model) : null;
    if (c.model) {
      if (!m) { refuse(`${at}: "${c.model}" is not in the cast registry.`); continue; }
      if (c.sheet) refuse(`${at}: "${c.model}" is a shipped body as it is, so it has no sheet. To change how they look, drop the model and write a sheet from their seed (a forged replacement).`);
      if (m.kind === 'voice') c.voiceOnly = true;
      c.anchor ??= m.anchor || 'none'; c.name ??= m.name; c.role ??= m.role;
      if (!c.voice) { c.voice = nearVoice(c.model); if (!c.voice) refuse(`${at}: "${c.model}" has no voice; give it a voice block.`); }
    } else {
      // (a voice-only person has no sheet to carry them: their name and role are their own, on the caller card)
      if ((c.name || c.role) && !c.voiceOnly) refuse(`${at}: name and role are a model person's; a sheet carries its own (sheet.name, sheet.role).`);
      if (c.voiceOnly) c.anchor ??= 'none';
      if (!c.anchor) refuse(`${at}: needs an anchor (the archetype the sheet varies from; none for the base body).`);
      if (!c.voice) refuse(`${at}: needs a voice block.`);
      // a Mog's forged replacement of a shipped person: from the nearest anchor (the registry's)
      const was = parentCast.get(c.id), wm = was?.model && modelOf(was.model);
      if (wm && c.sheet && wm.anchor && c.anchor !== wm.anchor) warnings.push(`${at}: replaces ${wm.name} (${was.model}) with a forged sheet; start from their seed and the anchor "${wm.anchor}", not "${c.anchor}".`);
    }
  }
  for (const [i, v] of pack.vehicles.entries()) {
    const r: Ride = v.stock
      ? { ...STOCK[v.stock], id: v.id || v.stock }
      : { id: v.id, label: v.label, family: v.family, abilities: new Set(v.abilities || []), seats: seatsOf(v) };
    if (rides.has(r.id) || r.id === 'on-foot') refuse(`vehicles[${i}]: "${r.id}" is already used.`);
    if (v.stock && SHOWCASE_CARS.includes(v.stock) && !show) refuse(`vehicles[${i}]: the ${STOCK[v.stock].label} is driven only in GameMog's own showcase worlds.`);
    if (v.stock && !SHOWCASE_CARS.includes(v.stock) && (v.label || v.plate)) refuse(`vehicles[${i}]: a label and a plate are the Vantor GT's (stock "gt") only.`);
    // (a tow rig sits on a bed: a wrecker's or a pickup's; storykit/vehicles/sheet.js)
    if (!v.stock && r.abilities.has('tow') && (!TOW_CLASSES.includes(v.class) || (v.body?.rear && v.body.rear !== 'bed'))) refuse(`vehicles[${i}] (${r.id}): "tow" needs a tow rig, which only a ${TOW_CLASSES.join(' or a ')} with its bed carries (this is a ${v.class}).`);
    rides.set(r.id, r);
    // 4. a ride named as another kind of thing (the Dognapped bike was the red hypercar renamed)
    for (const [field, text] of [['id', r.id.replace(/[.-]/g, ' ')], ['label', v.label], ['noun', v.noun], ['nickname', v.story?.nickname], ['oneLine', v.story?.oneLine]] as const) {
      if (typeof text !== 'string') continue;
      const two = TWO_WHEEL.includes(r.family);
      const m = (two ? RIDE_WORDS.car4 : RIDE_WORDS.two).exec(text);
      if (m) refuse(`vehicles[${i}] (${r.id}).${field}: "${text}" calls a ${familyWord(r.family)} a "${m[1]}". A ride is never renamed into another kind of thing.`);
      const a = ANIMAL.exec(text); if (a && field !== 'oneLine') refuse(`vehicles[${i}] (${r.id}).${field}: "${text}" names an animal; a pet is a pet (pets[]).`);
    }
  }
  if (pack.ride && !rides.has(pack.ride)) refuse(`ride "${pack.ride}" is not one of the vehicles.`);

  // cast: sheet, voice, anchor
  const voiceIds = new Map<string, string>(), blocks: { id: string; base: string; mix: string; pitch: number; speed: number }[] = [];
  for (const c of pack.cast) {
    const at = `cast "${c.id}"`;
    if (c.voiceOnly && c.sheet) refuse(`${at}: voiceOnly (heard, never seen) has no sheet.`);
    if (!c.voiceOnly && !c.sheet && !c.model) refuse(`${at}: a person who is seen needs a Character Forge sheet (or voiceOnly: true).`);
    if (c.sheet) {
      if (c.sheet.id !== c.id) refuse(`${at}: its sheet's id is "${c.sheet.id}"; they must match.`);
      if (c.sheet.voice?.id !== c.voice?.id) refuse(`${at}: its sheet speaks with "${c.sheet.voice?.id}", its voice block is "${c.voice?.id}"; they must match.`);
    }
    if (c.sheet || c.model) {
      for (const [field, text] of [['name', c.sheet?.name ?? c.name], ['role', c.sheet?.role ?? c.role]] as const) {
        const a = ANIMAL.exec(text || '');
        // a person whose name or role IS an animal ("Biscuit the dog", "the family dog"); "dog walker" is a person
        if (a && new RegExp(`\\b${a[1]}\\s*$|^(?:the|a|an)?\\s*(?:\\w+\\s+){0,2}${a[1]}$`, 'i').test(String(text).trim())) refuse(`${at}.${c.sheet ? 'sheet.' : ''}${field}: "${text}" makes a person into a ${a[1]}. Animals are pets (pets[]), never a person renamed.`);
      }
    }
    if (!c.voice) continue;   // (refused above: a person needs a voice block)
    if (voiceIds.has(c.voice.id)) refuse(`${at}: the voice "${c.voice.id}" is already ${voiceIds.get(c.voice.id)}'s.`);
    voiceIds.set(c.voice.id, c.id);
    // the voice block through the voice pass's own lint (storykit/voices/voice-design.js)
    const blend = c.voice.blend || null;
    const base = c.voice.kokoro || (blend ? Object.entries(blend as Record<string, number>).filter(([id]) => id in KOKORO_VOICES).sort((x, y) => y[1] - x[1])[0]?.[0] : undefined);
    if (!base) { refuse(`${at}.voice: needs an English stock voice (kokoro, or one in the blend) as its base.`); continue; }
    const lint = lintVoiceBlock({ id: c.voice.id, base, blend: blend || { [base]: 1 }, speed: c.voice.speed, pitch: c.voice.pitch, description: c.voice.description });
    for (const p of lint.problems) {
      if (/likeness/.test(p)) refuse(`${at}.voice.description: ${p}`);
      else if (/not an English stock voice/.test(p)) refuse(`${at}.voice: ${p}`);
      else clamped.push(`${at}.voice: ${p}`);
    }
    // (the whole mix, not only its base: a 50/50 blend of two stock voices is not the base voice alone, 5 Nov: Mog
    // City's crowd, am_michael with af_sarah, was warned as sounding like Dan's plain am_michael)
    const mix = Object.entries((lint.block.blend || { [lint.block.base]: 1 }) as Record<string, number>).filter(([, w]) => w > 0).sort(([x], [y]) => (x < y ? -1 : 1)).map(([id, w]) => `${id}:${Math.round(w * 20) / 20}`).join(',');
    blocks.push({ id: c.id, base: lint.block.base, mix, pitch: lint.block.pitch, speed: lint.block.speed });
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    if (a.base === b.base && a.mix === b.mix && Math.abs(a.pitch - b.pitch) < 0.75 && Math.abs(a.speed - b.speed) < 0.06) warnings.push(`cast "${a.id}" and "${b.id}" share ${a.base} at almost the same pitch and speed: they will sound alike.`);
  }
  if (pack.hero) {
    const h = cast.get(pack.hero); if (!h) refuse(`hero "${pack.hero}" is not in the cast.`); else if (h.voiceOnly) refuse(`hero "${pack.hero}" is voiceOnly; the player is seen.`);
    else if (h.model && !modelCan(h.model, 'hero')) refuse(`hero "${pack.hero}": ${h.model} can't be the player (its rig has no gaits for the player's moves); pick another, or give them a sheet.`);
  }
  for (const p of pack.pets || []) {
    if (p.owner && !cast.has(p.owner)) refuse(`pets "${p.id}": owner "${p.owner}" is not in the cast.`);
    if (p.model && modelOf(p.model)?.species !== p.species) refuse(`pets "${p.id}": ${p.model} is a ${modelOf(p.model)?.species}, not a ${p.species}.`);
    if (p.follows && (!pack.hero || (p.owner && p.owner !== pack.hero))) refuse(`pets "${p.id}": follows stays with the player, so its owner is the hero ("${pack.hero || 'none'}"), not "${p.owner}".`);
    const a = ANIMAL.exec(p.name); if (a && !/^(dog|dogs|puppy|pup|hound|mutt)$/i.test(a[1])) refuse(`pets "${p.id}": "${p.name}" names a ${a[1]}, but it is a ${p.species}.`);
  }

  // 2. places: the pack's aliases
  const cityPlaces = PLACES[city];
  const aliases: Record<string, Json> = pack.places || {};
  for (const [k, a] of Object.entries(aliases)) {
    if (cityPlaces[k]) refuse(`places.${k}: ${CITY_NAME[city]} already has a place "${k}" (${cityPlaces[k].name}); an alias needs its own key.`);
    if (!cityPlaces[a['@']]) refuse(`places.${k}: "${a['@']}" is not a place in ${CITY_NAME[city]}.`);
    if (a.face && !cityPlaces[a.face] && !aliases[a.face]) refuse(`places.${k}.face: "${a.face}" is not a place in ${CITY_NAME[city]}.`);
  }
  const placeOf = (key: string) => (aliases[key] ? cityPlaces[aliases[key]['@']] : cityPlaces[key]);
  const meters = new Set<string>((pack.hud?.meters || []).map((m: Json) => m.id));

  // the missions
  const texts: Text[] = [], lines: Line[] = [];
  const missionIds = new Set<string>(), actIds = new Set<string>();
  const allMissions = pack.acts.flatMap((a: Json) => a.missions);
  { const most = show ? SHOWCASE.acts * SHOWCASE.missionsPerAct : 9; if (allMissions.length > most) refuse(`${allMissions.length} missions; a story has at most ${most}.`); }
  for (const m of allMissions) { if (missionIds.has(m.id)) refuse(`Two missions are ${m.id}.`); missionIds.add(m.id); }
  for (const act of pack.acts) {
    if (actIds.has(act.id)) refuse(`Two acts are "${act.id}".`); actIds.add(act.id);
    const own = new Set(act.missions.map((m: Json) => m.id));
    for (const k of Object.keys(act.timeline || {})) if (!own.has(k)) refuse(`act "${act.id}".timeline: ${k} is not one of its missions.`);
    if (act.end) { collect(act.end, `act "${act.id}".end`, texts); checkCard(act.end, `act "${act.id}".end`); }
    collect({ name: act.name }, `act "${act.id}"`, texts);
  }
  function checkCard(card: Json, at: string) {
    if (card.meter && !meters.has(card.meter)) refuse(`${at}.meter: "${card.meter}" is not a meter.`);
    if (card.quote?.by && !cast.has(card.quote.by)) refuse(`${at}.quote.by: "${card.quote.by}" is not in the cast.`);
  }

  for (const m of allMissions) {
    const M = `mission ${m.id}`;
    const ride = m.vehicle === 'on-foot' ? FOOT : rides.get(m.vehicle);
    if (!ride) { refuse(`${M}: vehicle "${m.vehicle}" is not one of the vehicles (or on-foot).`); continue; }
    if (m.next && !missionIds.has(m.next)) refuse(`${M}.next: ${m.next} is not a mission.`);
    for (const h of m.hiddenMeters || []) if (!meters.has(h)) refuse(`${M}.hiddenMeters: "${h}" is not a meter.`);
    const need = new Map<string, string>(); // verb -> where it came from
    for (const v of m.verbs || []) need.set(v, 'its verbs');
    // step ids for goto / until
    const ids = new Set<string>();
    const eachStep = (steps: Json[], f: (s: Json, at: string, lineAt: string, side: boolean) => void, at = `${M}.steps`, lineAt = m.id, side = false) => steps.forEach((s, i) => {
      const here = `${at}[${i}]`, lid = `${lineAt}.${side ? 'd' : 's'}${i}`;
      f(s, here, lid, side);
      if (s.during) eachStep(s.during, f, `${here}.during`, lid, true);
      if (s.do) eachStep(s.do, f, `${here}.do`, lid.replace(/\.d(\d+)$/, '.x$1'), true);
    });
    eachStep(m.steps, (s) => { if (s.id) { if (ids.has(s.id)) refuse(`${M}: two steps are "${s.id}".`); ids.add(s.id); } });
    const place = (ref: Json, at: string, use: 'drive' | 'walk' | 'start' | 'any') => {
      const key = typeof ref === 'string' ? ref.slice(1) : ref?.['@'];
      if (!key) return;
      const p = placeOf(key);
      if (!p) { refuse(`${at}: "@${key}" is not a place in ${CITY_NAME[city]}${suggest(key, [...Object.keys(cityPlaces), ...Object.keys(aliases)])}.`); return; }
      if (use === 'drive' && p.foot) refuse(`${at}: ${p.name} ("@${key}") is off the lanes, a walk target; drive to a corner near it, then walk.`);
      if ((use === 'drive' || use === 'walk') && p.startOnly) refuse(`${at}: ${p.name} ("@${key}") has no lanes in the route graph; it is a start point only.`);
      if (use === 'start' && p.foot && ride.family !== 'foot') refuse(`${at}: ${p.name} ("@${key}") is off the lanes; a ${ride.label} can't start there.`);
      if (ref && typeof ref === 'object' && ref.face && !placeOf(ref.face)) refuse(`${at}.face: "@${ref.face}" is not a place in ${CITY_NAME[city]}.`);
    };
    const cam = (ref: Json, at: string) => {
      // { rel: <cast id> }: in front of someone on the street (a close-up); they need a body, never a voice-only person
      if (ref && typeof ref === 'object') { if (ref.rel && ref.rel !== 'player') who(ref.rel, `${at}.rel`, true); return; }
      if (typeof ref !== 'string' || ref === 'player') return;
      if (ref.startsWith('@')) return place(ref, at, 'any');
      if (!CAM_POINTS[city].includes(ref)) refuse(`${at}: "${ref}" is not a camera point of ${CITY_NAME[city]}${CAM_POINTS[city].length ? ` (${CAM_POINTS[city].join(', ')})` : ' (it has none; use a place or the player)'}.`);
    };
    const who = (id: Json, at: string, body = false) => {
      if (id == null) return;
      if (pets.has(id)) { if (!body) refuse(`${at}: "${id}" is a pet; pets don't speak lines.`); return; }
      const c = cast.get(id);
      if (!c) refuse(`${at}: "${id}" is not in the cast${suggest(id, [...cast.keys()])}.`);
      else if (body && c.voiceOnly) refuse(`${at}: "${id}" is voiceOnly (heard, never seen); they can't appear here.`);
    };
    const set = (s: Json, at: string) => {
      for (const one of [s].flat().filter(Boolean)) for (const k of Object.keys(one.meters || {})) if (!meters.has(k)) refuse(`${at}: the meter "${k}" is not one of the story's meters (${[...meters].join(', ') || 'none'}).`);
    };
    const line = (id: string, speaker: string, text: string) => { if (speaker && text) lines.push({ id, who: speaker, text, hash: lineHash(text), status: 'pending', clip: null }); };
    // a choice: a step, or the one at the end of an answered call (call.choice)
    const choice = (s: Json, at: string, lid: string) => {
      who(s.who, `${at}.who`);
      if (s.who) line(`${lid}.p`, s.who, s.prompt);
      s.options.forEach((o: Json, j: number) => { if (o.goto && !ids.has(o.goto)) refuse(`${at}.options[${j}].goto: no step is "${o.goto}".`); set(o.set, `${at}.options[${j}].set`); if (o.reply) { if (!s.who) refuse(`${at}.options[${j}]: a reply needs the choice's speaker (who).`); else line(`${lid}.o${j}`, s.who, o.reply); } });
      if (s.silenceReply && s.who) line(`${lid}.sr`, s.who, s.silenceReply);
      if (s.default != null && s.default >= s.options.length) refuse(`${at}.default: option ${s.default} does not exist.`);
    };

    place(m.start, `${M}.start`, 'start');
    set(m.reward, `${M}.reward`);
    collect({ title: m.title, stakes: m.stakes, passLine: m.passLine, note: m.note, timerLine: m.timerLine, label: m.label }, M, texts, m.id);

    const allyIds = new Set<string>(), timerNames = new Set<string>(), carNames = new Set<string>();
    eachStep(m.steps, (s, at, lid, side) => {
      if (!side && s.at != null && !AT_PLACE.has(s.type)) warnings.push(`${at}: "at" only means something on a side step (during, do).`);
      if (side && (s.during || s.do)) refuse(`${at}: a side step can't carry its own side steps.`);
      for (const k of ['goto', 'until'] as const) if (s[k] && !ids.has(s[k])) refuse(`${at}.${k}: no step is "${s[k]}".`);
      if (s.backdrop?.place) place(s.backdrop.place, `${at}.backdrop.place`, 'any');
      if (s.after) set(s.after, `${at}.after`);
      if (s.set) set(s.set, `${at}.set`);
      collect(s, at, texts, m.id, s.type);
      // (Mog City's runner has no part for these yet: they pass at once, unplayed; MOGCITY_STUBS)
      if (mc && STUBS.has(s.type)) warnings.push(`${at}: '${s.type}' has no Mog City part yet; it passes at once without playing, so nothing in the story may rest on it.`);
      switch (s.type) {
        case 'drive': need.set('drive', at); [s.to].flat().forEach((p: Json, j: number) => place(p, Array.isArray(s.to) ? `${at}.to[${j}]` : `${at}.to`, 'drive'));
          if (typeof s.stopTimer === 'string' && !timerNames.has(s.stopTimer)) refuse(`${at}.stopTimer: no timer step before it starts "${s.stopTimer}".`);
          break;
        case 'stops': need.set('drive', at); s.stops.forEach((p: Json, j: number) => { place(p, `${at}.stops[${j}]`, 'drive'); if (p.set) set(p.set, `${at}.stops[${j}].set`); }); break;
        case 'walk': need.set('walk', at); place(s.to, `${at}.to`, 'walk'); break;
        case 'pursuit': need.set(s.goal === 'lose' ? 'escape' : 'chase', at); if (s.to) place(s.to, `${at}.to`, 'drive'); break;
        case 'tail': need.set('tail', at); s.route.forEach((p: Json, j: number) => place(p, `${at}.route[${j}]`, 'drive')); break;
        case 'convoy':
          need.set('follow', at); s.route.forEach((p: Json, j: number) => place(p, `${at}.route[${j}]`, 'drive'));
          if (s.who) who(s.who, `${at}.who`);
          // (an ally's car by its id: an ally step before it in the mission drives it there first)
          if (s.ally && !allyIds.has(s.ally)) refuse(`${at}.ally: no ally step before it in ${M} drives a car "${s.ally}".`);
          if (s.car && !TOW_BODIES.includes(s.car) && !pack.vehicles.some((x: Json) => x.id === s.car)) refuse(`${at}.car: "${s.car}" is neither a city body (${TOW_BODIES.join(', ')}) nor a vehicle sheet of this pack.`);
          break;
        case 'car':
          if (s.remove) { if (!s.name) refuse(`${at}: a car is taken away by its name.`); else if (!carNames.has(s.name)) refuse(`${at}: no car step before it parks a car "${s.name}".`); break; }
          if (s.name) carNames.add(s.name);
          if (!s.at) refuse(`${at}: a parked car stands at a place (at).`); else place(s.at, `${at}.at`, 'drive');
          if (!mc) refuse(`${at}: a parked car plays on Mog City's engine (base.engine "mogcity-1").`);
          if (s.car && !TOW_BODIES.includes(s.car) && !pack.vehicles.some((x: Json) => x.id === s.car)) refuse(`${at}.car: "${s.car}" is neither a city body (${TOW_BODIES.join(', ')}) nor a vehicle sheet of this pack.`);
          break;
        case 'ally':
          if (s.who) who(s.who, `${at}.who`);
          if (s.from) place(s.from, `${at}.from`, 'drive'); if (s.to !== 'player') place(s.to, `${at}.to`, 'drive');
          if (!mc) refuse(`${at}: an ally's car plays on Mog City's engine (base.engine "mogcity-1").`);
          if (s.car && !TOW_BODIES.includes(s.car) && !pack.vehicles.some((x: Json) => x.id === s.car)) refuse(`${at}.car: "${s.car}" is neither a city body (${TOW_BODIES.join(', ')}) nor a vehicle sheet of this pack.`);
          allyIds.add(s.ally || 'ally');
          break;
        case 'timer':
          // (a timer stopped, or tightened, by its name: one a timer step before it in the mission started)
          if (!s.stop && s.add == null) timerNames.add(s.name || 'mission');
          else if (s.add != null && !timerNames.has(s.name || 'mission')) refuse(`${at}: it adds to the timer "${s.name || 'mission'}", which no timer step before it starts.`);
          else if (s.stop && s.name && !timerNames.has(s.name)) refuse(`${at}: it stops the timer "${s.name}", which no timer step before it starts.`);
          break;
        case 'stealth': need.set(s.mode === 'car' ? 'drive' : 'sneak', at); s.units.forEach((u: Json, j: number) => place(u, `${at}.units[${j}]`, 'any')); if (s.to) place(s.to, `${at}.to`, 'any'); if (s.onDetect?.goto && !ids.has(s.onDetect.goto)) refuse(`${at}.onDetect.goto: no step is "${s.onDetect.goto}".`); if (s.onDetect?.set) set(s.onDetect.set, `${at}.onDetect.set`); break;
        case 'patrol': if (s.near) place(s.near, `${at}.near`, 'any'); break;
        case 'roadblock': place(s.at, `${at}.at`, 'drive'); if (s.to) { place(s.to, `${at}.to`, 'drive'); need.set('drive', at); } if (!mc) refuse(`${at}: a roadblock plays on Mog City's engine (base.engine "mogcity-1").`); break;
        case 'trigger': if (s.area) place(s.area, `${at}.area`, 'any'); if (s.say) { who(s.say.who, `${at}.say.who`); line(`${lid}.say`, s.say.who, s.say.text); } break;
        case 'beat': for (const k of ['cam', 'look', 'to', 'lookTo']) cam(s.shot[k], `${at}.shot.${k}`); if (s.say) { who(s.say.who, `${at}.say.who`); line(`${lid}.say`, s.say.who, s.say.text); } break;
        case 'place': place(s.at, `${at}.at`, 'start'); break;
        case 'transition': if (s.place) place(s.place, `${at}.place`, 'start'); break;
        case 'cutscene': if (s.place) place(s.place, `${at}.place`, 'any'); if (s.set) { for (const p of setProblems(s.set, `${at}.set`, cast, pack.hero)) refuse(p); s.shots.forEach((sh: Json, j: number) => { for (const p of setShotProblems(s.set, sh, `${at}.shots[${j}]`, pack.hero)) refuse(p); }); } s.shots.forEach((sh: Json, j: number) => { for (const k of ['cam', 'look', 'to', 'lookTo']) cam(sh[k], `${at}.shots[${j}].${k}`); if (sh.line && !sh.say) refuse(`${at}.shots[${j}]: a line needs a speaker (say).`); if (sh.say) { who(sh.say, `${at}.shots[${j}].say`); line(`${lid}.c${j}`, sh.say, sh.line); } }); break;
        case 'vignette': if (s.place) place(s.place, `${at}.place`, 'any'); s.shots.forEach((sh: Json, j: number) => { for (const k of ['cam', 'look', 'to', 'lookTo']) cam(sh[k], `${at}.shots[${j}].${k}`); if (sh.line && !sh.say) refuse(`${at}.shots[${j}]: a line needs a speaker (say).`); if (sh.say) { who(sh.say, `${at}.shots[${j}].say`); line(`${lid}.v${j}`, sh.say, sh.line); } }); break;
        case 'say': who(s.who, `${at}.who`); line(lid, s.who, s.text); break;
        case 'voicemail': case 'voicenote': who(s.who, `${at}.who`); line(lid, s.who, s.text); break;
        case 'call':
          who(s.who, `${at}.who`); set(s.answer, `${at}.answer`); set(s.decline, `${at}.decline`);
          (s.lines || []).forEach((l: Json, j: number) => { who(l.who, `${at}.lines[${j}].who`); line(`${lid}.l${j}`, l.who, l.text); });
          // the car phone's extra blocks, wrap and hold lines (Mog City's calls)
          (s.extra || []).forEach((b: Json[], k: number) => b.forEach((l: Json, j: number) => { who(l.who, `${at}.extra[${k}][${j}].who`); line(`${lid}.e${k}.l${j}`, l.who, l.text); }));
          (s.wrap || []).forEach((l: Json, j: number) => { who(l.who, `${at}.wrap[${j}].who`); line(`${lid}.w.l${j}`, l.who, l.text); });
          for (const k of ['pause', 'resume'] as const) (s.hold?.[k] || []).forEach((l: Json, j: number) => { who(l.who, `${at}.hold.${k}[${j}].who`); line(`${lid}.h${k[0]}.l${j}`, l.who, l.text); });
          if (s.hold && !s.inCar) warnings.push(`${at}: hold lines only play on a call with inCar: true.`);
          if (s.interrupts && !side) warnings.push(`${at}: interrupts (call waiting) only waits on a live car-phone call; as a step of its own it is an ordinary call unless one is on.`);
          if (s.auto && (s.decline || s.voicemail || s.outgoing)) refuse(`${at}: an auto call answers itself; it has no decline, voicemail or dialling.`);
          if (s.voicemail) { who(s.voicemail.from, `${at}.voicemail.from`); line(`${lid}.vm`, s.voicemail.from || s.who, s.voicemail.text); if (s.voicemail.set) set(s.voicemail.set, `${at}.voicemail.set`); }
          if (s.choice) choice(s.choice, `${at}.choice`, `${lid}.ch`);
          break;
        case 'choice': choice(s, at, lid); break;
        case 'dm': if (s.from) who(s.from, `${at}.from`); else if (!s.name) refuse(`${at}: a DM is from a cast member (from) or a name ("Unknown number").`); break;
        case 'search':
          need.set('walk', at); place(s.at, `${at}.at`, s.on === 'ride' ? 'drive' : 'any');
          // (a search of the hero's own car: held at the car wherever he parked it, so the mission needs a car to search, on Mog City's engine)
          if (s.on === 'ride') {
            if (ride.family === 'foot') refuse(`${at}: on: "ride" searches the hero's own car, and ${M} is on foot; give the mission a vehicle, or search the place (on: "place").`);
            if (!mc) refuse(`${at}: on: "ride" (a search of the hero's car, wherever he parked it) plays on Mog City's engine (base.engine "mogcity-1").`);
          } else if (s.part) refuse(`${at}.part: a part of the car only goes with on: "ride".`);
          else if (s.on !== 'place' && /\b(trunk|boot|tailgate|glove ?box)\b/i.test(`${s.label || ''} ${s.objective || ''}`)) warnings.push(`${at}: it names a car's trunk or glovebox; if that is the hero's own car, write on: "ride" so the hold is at the car wherever he parks it.`);
          break;
        case 'tow':
          need.set('tow', at); place(s.target, `${at}.target`, 'drive'); place(s.to, `${at}.to`, 'drive');
          if (!mc) refuse(`${at}: a tow plays on Mog City's engine (base.engine "mogcity-1").`);
          if (s.car && !TOW_BODIES.includes(s.car)) { const v = pack.vehicles.find((x: Json) => (x.id || x.stock) === s.car); if (!v) refuse(`${at}.car: "${s.car}" is neither a city body (${TOW_BODIES.join(', ')}) nor a vehicle of this pack.`); else if (v.stock) refuse(`${at}.car: "${s.car}" is a stock car; the car on the hook is a city body or a vehicle sheet.`); }
          break;
        case 'comfort': who(s.who, `${at}.who`, true); (s.lines || []).forEach((l: Json, j: number) => { who(l.who, `${at}.lines[${j}].who`); line(`${lid}.l${j}`, l.who, l.text); }); break;
        case 'passenger':
          who(s.who, `${at}.who`, true);
          { const c = cast.get(s.who); if (c?.model && !modelCan(c.model, 'sit')) refuse(`${at}: ${c.name} (${c.model}) has no seated clips, so can't ride as a passenger.`); }
          if (s.board !== false) need.set('carry', at);
          if (s.from) place(s.from, `${at}.from`, 'drive'); if (s.to) place(s.to, `${at}.to`, 'drive');
          if (s.set) set(s.set, `${at}.set`);
          (s.comfort?.lines || []).forEach((l: Json, j: number) => { who(l.who, `${at}.comfort.lines[${j}].who`); line(`${lid}.c${j}`, l.who, l.text); });
          if (s.comfort?.set) set(s.comfort.set, `${at}.comfort.set`);
          if ((s.limit || s.comfort) && !s.to) refuse(`${at}: a speed limit or comfort goes with a ride somewhere (to).`);
          break;
        case 'scene': if (!mc) refuse(`${at}: a scene plays one of Mog City's own set pieces; it needs Mog City's engine (base.engine "mogcity-1").`);
          else if (!heroIsDan) warnings.push(`${at}: "${s.name}" is Mog City's own set piece, with Dan, the Suits and Mr. Big as they are; it fits a story whose hero is Dan (mogcity/dan).`);
          break;
        case 'npc': if (s.who) who(s.who, `${at}.who`, true); if (s.at && !s.at.rel) place(s.at, `${at}.at`, 'any'); if (!s.remove && !s.at) refuse(`${at}: an npc stands somewhere (at) or is removed (remove).`); break;
        case 'fight':
          need.set('fight', at); place(s.arena, `${at}.arena`, 'any');
          s.enemies.forEach((e: Json, j: number) => { who(e, `${at}.enemies[${j}]`, true); if (e === pack.hero) refuse(`${at}.enemies[${j}]: "${e}" is the hero, the one fighting.`); });
          if (s.win === 'survive' && !s.timer) refuse(`${at}: a survive fight needs a timer (how long to hold on).`);
          break;
        case 'actEnd': checkCard(s, at); break;
      }
    });

    // 3 and 4: the mission's words and verbs against its ride
    for (const t of texts.filter((x) => x.mission === m.id)) {
      for (const [re, verb] of TEXT_VERBS) if (re.test(t.text) && !need.has(verb)) need.set(verb, `${t.at} ("${clip(t.text)}")`);
      if (ride.family === 'car4') {
        const hit = t.speech ? SPOKEN_TWO.exec(t.text) : RIDE_WORDS.two.exec(t.text);
        if (hit) refuse(`${t.at}: "${clip(t.text)}" says "${hit[0]}", but ${M} is driven in the ${ride.label}, a car. Bike words on a car are a rename: refused.`);
      } else if (TWO_WHEEL.includes(ride.family) && !t.speech) {
        const hit = RIDE_WORDS.car4.exec(t.text);
        if (hit) refuse(`${t.at}: "${clip(t.text)}" says "${hit[1]}", but ${M} is ridden on a ${familyWord(ride.family)}.`);
      } else if (ride.family === 'foot' && !t.speech && /\b(?:drive|driving)\b/i.test(t.text)) refuse(`${t.at}: "${clip(t.text)}" says drive, but ${M} is on foot.`);
    }
    for (const [verb, from] of need) if (!canDo(ride, verb)) refuse(`${M}: "${verb}" (from ${from}) can't be done ${ride.family === 'foot' ? 'on foot' : `in the ${ride.label}`}: ${VERBS[verb].why}. Give the mission a ride that can, or drop the verb; it is never faked.`);
    const seats = m.steps.filter((s: Json) => s.type === 'passenger' && s.board !== false).length;
    if (ride.family !== 'foot' && seats >= ride.seats) refuse(`${M}: ${seats} passengers board the ${ride.label}, which seats ${ride.seats} with the driver.`);
  }

  // pack-wide texts (title, places, cast, rides, hud)
  collect({ title: pack.title, kicker: pack.kicker, tagline: pack.tagline }, 'pack', texts);
  for (const [k, a] of Object.entries(aliases)) collect({ name: a.name }, `places.${k}`, texts);
  for (const c of pack.cast) { collect(c.sheet || { name: c.name, role: c.role }, `cast "${c.id}"${c.sheet ? '.sheet' : ''}`, texts); collect({ description: c.voice?.description }, `cast "${c.id}".voice`, texts); }
  for (const p of pack.pets || []) collect({ name: p.name }, `pets "${p.id}"`, texts);
  for (const v of pack.vehicles) if (!v.stock) collect({ label: v.label, nickname: v.story?.nickname, oneLine: v.story?.oneLine }, `vehicles "${v.id}"`, texts);
  for (const mt of pack.hud?.meters || []) collect({ label: mt.label }, `hud.meters "${mt.id}"`, texts);
  if (pack.hud?.clock) collect({ label: pack.hud.clock.label, unitLabel: pack.hud.clock.unitLabel, zero: pack.hud.clock.zero }, 'hud.clock', texts);

  // 14. the opening: the world's own, before Mission 1 (openingProblems); a Mog keeps its parent's unless it writes its own
  if (pack.opening) {
    for (const p of openingProblems(pack, { cast, pets, placeOf, camPoints: CAM_POINTS[city], cityName: CITY_NAME[city], keys: [...Object.keys(cityPlaces), ...Object.keys(aliases)], secs: show ? SHOWCASE.openingSecs : undefined })) refuse(p);
    collect(pack.opening, 'opening', texts);
    pack.opening.shots.forEach((sh: Json, j: number) => { if (sh.say && sh.line && cast.has(sh.say)) lines.push({ id: `OPEN.c${j}`, who: sh.say, text: sh.line, hash: lineHash(sh.line), status: 'pending', clip: null }); });
  } else if (opts.parent?.opening) refuse(`opening: the original has an opening (its place card, its people's name cards, its premise). A Mog keeps it: copy the original's "opening" exactly, or, when the idea changes the story or its people, write the Mog's own, by the same rules.`);

  // 5, 6, 7: every text
  for (const t of texts) {
    if (/<\s*\/?\s*[a-z!]/i.test(t.text)) refuse(`${t.at}: "${clip(t.text)}" carries markup; a pack is words only.`);
    if (/[\p{Cc}\p{Cf}]/u.test(t.text.replace(/\n/g, ''))) refuse(`${t.at}: has invisible or control characters.`);
    if (isBlocked(t.text)) refuse(`${t.at}: has a word GameMog doesn't allow.`);
    if (neverMentioned(t.text)) refuse(`${t.at}: names something GameMog never mentions.`);
    for (const tok of t.text.matchAll(/\{([^{}]{0,24})\}/g)) if (!TOKENS.has(tok[1])) refuse(`${t.at}: {${tok[1]}} is not a token (${[...TOKENS].map((x) => `{${x}}`).join(' ')}).`);
    const foreign = foreignIn(t.text, city);
    if (foreign.length) {
      const say = `${t.at}: "${clip(t.text)}" names ${foreign.map((f) => `${f.city} ("${f.word}")`).join(', ')}, but the story is set in ${CITY_NAME[city]}.`;
      if (t.speech) warnings.push(`${say} (dialogue, so allowed)`);
      else refuse(`${say} On-screen labels name the city the story is in.`);
    }
    if (/^cast /.test(t.at) || /\.voice$/.test(t.at)) { const lk = LIKENESS_TEXT.exec(t.text); if (lk) refuse(`${t.at}: "${clip(t.text)}" (${lk[0]}) points at a real person's likeness; people and voices are invented.`); }
  }

  // 8. the voice manifest
  const byId = new Map(lines.map((l) => [l.id, l]));
  for (const [id, e] of Object.entries((pack.voices || {}) as Record<string, Json>)) {
    const l = byId.get(id);
    if (!l) { refuse(`voices.${id}: there is no such line${suggest(id, [...byId.keys()])}.`); continue; }
    const speaker = cast.get(l.who);
    if (e.voice !== l.who && e.voice !== speaker?.voice?.id) refuse(`voices.${id}: the line is ${l.who}'s, the clip is "${e.voice}"'s.`);
    if (e.status === 'ready' && !e.clip) refuse(`voices.${id}: ready, but no clip.`);
    if (e.status === 'pending' && e.clip) refuse(`voices.${id}: pending, but it names a clip.`);
    if (e.hash && e.hash !== l.hash) refuse(`voices.${id}: its clip is for an older text of the line (hash ${e.hash}, the line is ${l.hash}).`);
    if (e.status === 'ready' && !e.hash) warnings.push(`voices.${id}: a ready clip without its line's hash can't be checked against the text.`);
    l.status = e.status; l.clip = e.clip ?? null;
  }
  return done(pack, lines);
}

/**
 * A set (a cutscene's `set`, one of the opening's `sets`: Mog City's runner stages it in a room of its own, sets.js):
 * its people are the cast's seen people (or the hero), each once; whom they face, hug or hold is one of them.
 */
export function setProblems(def: Json, at: string, cast: Map<string, Json>, hero: string): string[] {
  const out: string[] = [], ids = new Set<string>();
  (def.people || []).forEach((p: Json, i: number) => {
    const w = `${at}.people[${i}]`, c = cast.get(p.who);
    if (!c) out.push(`${w}.who: "${p.who}" is not in the cast.`);
    else if (c.voiceOnly) out.push(`${w}.who: "${p.who}" is voiceOnly (heard, never seen); they can't stand in a set.`);
    if (ids.has(p.who)) out.push(`${w}.who: "${p.who}" stands in this set twice.`);
    ids.add(p.who);
  });
  const known = (id: Json) => id == null || typeof id === 'number' || id === 'player' || ids.has(id) || (id === hero && ids.has(hero));
  (def.people || []).forEach((p: Json, i: number) => {
    const w = `${at}.people[${i}]`;
    if (!known(p.face)) out.push(`${w}.face: "${p.face}" is not in this set.`);
    if (p.hug && !known(p.hug)) out.push(`${w}.hug: "${p.hug}" is not in this set.`);
    if (p.hold && !known(p.hold.who)) out.push(`${w}.hold: "${p.hold.who}" is not in this set.`);
    if (p.look && p.look !== 'lens' && p.look !== 'prop' && !known(p.look)) out.push(`${w}.look: "${p.look}" is not in this set.`);
  });
  return out;
}
/** A shot in a set: the people its camera is on, and its act's, stand in that set (the hero as 'player' or by id). */
export function setShotProblems(def: Json, sh: Json, at: string, hero: string): string[] {
  const out: string[] = [], ids = new Set<string>((def.people || []).map((p: Json) => p.who));
  const inSet = (id: string) => ids.has(id) || ((id === 'player' || id === hero) && ids.has(hero));
  for (const k of ['cam', 'look', 'to', 'lookTo']) { const r = sh[k]; if (r && typeof r === 'object' && r.rel && !inSet(r.rel)) out.push(`${at}.${k}.rel: "${r.rel}" is not in the set (${[...ids].join(', ') || 'nobody'}).`); }
  (sh.act || []).forEach((a: Json, i: number) => { if (!inSet(a.who)) out.push(`${at}.act[${i}].who: "${a.who}" is not in the set.`); for (const k of ['face', 'hug']) if (typeof a[k] === 'string' && !inSet(a[k])) out.push(`${at}.act[${i}].${k}: "${a[k]}" is not in the set.`); });
  return out;
}

/** The seconds an opening's shot is on screen: its dur (3), or its line's reading time when longer (the runner's). */
export const shotSecs = (sh: Json) => Math.max(sh?.dur ?? 3, sh?.line ? Math.max(1.4, String(sh.line).length / 15) : 0);
/**
 * Rule 14, the opening (Mog City's runner plays it before Mission 1, as Mog City's own opening plays before its Mission 1):
 * it opens wide on the city with the place card (never on a close-up of one person); it brings on the hero (the pack's
 * hero, card is "hero") and who is in their way (card is "antagonist") with a name card each, and up to OPENING.allies
 * others ("ally"), each once, each card framed on its person (the shot looks at them: { rel: <who> }, the hero also
 * 'player'), every person a shot looks at or a card names stood on the street (stage) unless they are the hero; it says
 * the premise in OPENING.lines spoken lines (say + line); the title once; OPENING.secs seconds in all.
 */
export function openingProblems(pack: PackV2, ctx: { cast: Map<string, Json>; pets: Map<string, Json>; placeOf: (k: string) => Json; camPoints: string[]; cityName: string; keys: string[]; secs?: number[] }): string[] {
  const SECS = ctx.secs || OPENING.secs;
  const out: string[] = [], o = pack.opening, at = 'opening', { cast } = ctx;
  const placeOk = (ref: Json, where: string) => { const key = typeof ref === 'string' ? ref.slice(1) : ref?.['@']; if (key && !ctx.placeOf(key)) out.push(`${where}: "@${key}" is not a place in ${ctx.cityName}${suggest(key, ctx.keys)}.`); };
  const body = (id: string, where: string) => { const c = cast.get(id); if (!c) { out.push(`${where}: "${id}" is not in the cast${suggest(id, [...cast.keys()])}.`); return false; } if (c.voiceOnly) { out.push(`${where}: "${id}" is voiceOnly (heard, never seen); they can't be seen in the opening.`); return false; } return true; };
  placeOk(o.place, `${at}.place`);
  const staged = new Set<string>();
  (o.stage || []).forEach((s: Json, i: number) => {
    const w = `${at}.stage[${i}]`;
    if (s.who === pack.hero) { out.push(`${w}: "${s.who}" is the hero, who stands at the opening's place already.`); return; }
    if (ctx.pets.has(s.who)) staged.add(s.who); else if (body(s.who, `${w}.who`)) staged.add(s.who);
    if (s.at && !s.at.rel) placeOk(s.at, `${w}.at`);
  });
  // (a set's people are seen too: the shot in the set looks at them there)
  const sets: Record<string, Json> = o.sets || {};
  for (const [k, def] of Object.entries(sets)) { for (const p of setProblems(def, `${at}.sets.${k}`, cast, pack.hero)) out.push(p); for (const p of def.people || []) if (p.who !== pack.hero) staged.add(p.who); }
  const seen = (id: string) => id === 'player' || id === pack.hero || staged.has(id);
  const camOk = (ref: Json, where: string) => {
    if (ref && typeof ref === 'object') { if (ref.rel && !seen(ref.rel)) out.push(`${where}.rel: "${ref.rel}" is not on the street for the opening: stand them there (opening.stage).`); return; }
    if (typeof ref !== 'string' || ref === 'player') return;
    if (ref.startsWith('@')) return placeOk(ref, where);
    if (!ctx.camPoints.includes(ref)) out.push(`${where}: "${ref}" is not a camera point of ${ctx.cityName}.`);
  };
  const lens = (r: Json) => (r && typeof r === 'object' ? Math.hypot(r.right || 0, r.up || 0, r.fwd || 0) : Infinity);
  const shots: Json[] = o.shots || [];
  let lines = 0, titles = 0, secs = 0;
  const cards = new Map<string, { is: string; j: number }>();
  shots.forEach((sh: Json, j: number) => {
    const w = `${at}.shots[${j}]`;
    for (const k of ['cam', 'look', 'to', 'lookTo']) if (sh[k] != null) camOk(sh[k], `${w}.${k}`);
    if (sh.set != null) { if (!sets[sh.set]) out.push(`${w}.set: "${sh.set}" is not one of the opening's sets (${Object.keys(sets).join(', ') || 'none'}).`); else out.push(...setShotProblems(sets[sh.set], sh, w, pack.hero)); }
    else if (sh.act) out.push(`${w}.act: a shot on the street has no set to change.`);
    if (sh.line && !sh.say) out.push(`${w}: a line needs a speaker (say).`);
    if (sh.say) { if (cast.has(sh.say)) lines++; else out.push(`${w}.say: "${sh.say}" is not in the cast.`); }
    if (sh.title) titles++;
    secs += shotSecs(sh);
    const c = sh.card;
    if (c) {
      if (cards.has(c.who)) out.push(`${w}.card: "${c.who}" already has a name card (shot ${cards.get(c.who)!.j}); each person is brought on once.`);
      else cards.set(c.who, { is: c.is, j });
      if (!seen(c.who) && body(c.who, `${w}.card.who`)) out.push(`${w}.card: "${c.who}" is not on the street for the opening: stand them there (opening.stage).`);
      if (c.is === 'hero' && c.who !== pack.hero) out.push(`${w}.card: the hero's card is the pack's hero, "${pack.hero}", not "${c.who}".`);
      if (c.is !== 'hero' && c.who === pack.hero) out.push(`${w}.card: "${c.who}" is the hero; their card is "is": "hero".`);
      const on = (r: Json) => r && typeof r === 'object' && (r.rel === c.who || (c.who === pack.hero && r.rel === 'player'));
      if (!on(sh.look) && !on(sh.lookTo)) out.push(`${w}.card: a name card is framed on its person: the shot looks at "${c.who}" (look { "rel": "${c.who === pack.hero ? 'player' : c.who}" }).`);
    }
  });
  const first = shots[0];
  if (first && first.set) out.push(`${at}.shots[0]: an opening opens on the city (no set): the place card over the street, wide.`);
  if (first && !first.where) out.push(`${at}.shots[0]: an opening opens on the city with the place card (where: { name, sub }): where we are, the street and the time.`);
  if (first && (first.card || (first.cam && typeof first.cam === 'object' && first.cam.rel !== 'player' && lens(first.cam) < OPENING.wide))) out.push(`${at}.shots[0]: an opening never opens on a close-up of one person: its first shot is wide on the city (a place, a camera point, or ${OPENING.wide} m or more from who it is near).`);
  const of = (is: string) => [...cards.entries()].filter(([, v]) => v.is === is).map(([k]) => k);
  if (!of('hero').length) out.push(`${at}: the hero ("${pack.hero}") gets a name card (card { "who": "${pack.hero}", "is": "hero", "role": "..." }), on a shot that looks at them.`);
  if (!of('antagonist').length) out.push(`${at}: who is in the hero's way gets a name card too (card { "is": "antagonist" }): the player meets them here, not in a later voicemail.`);
  if (of('ally').length > OPENING.allies) out.push(`${at}: ${of('ally').length} others have name cards; at most ${OPENING.allies} besides the hero and the antagonist (the rest meet the player in the missions).`);
  if (lines < OPENING.lines[0] || lines > OPENING.lines[1]) out.push(`${at}: ${lines} spoken line${lines === 1 ? '' : 's'}; the premise is said in ${OPENING.lines[0]} to ${OPENING.lines[1]} (say + line): what the hero wants tonight, who is in the way, what is at stake.`);
  if (titles !== 1) out.push(`${at}: the world's title is shown once (title: true on one shot, the last is the usual place); this opening has ${titles}.`);
  if (secs < SECS[0] || secs > SECS[1]) out.push(`${at}: ${Math.round(secs)} s; an opening is ${SECS[0]} to ${SECS[1]} s (each shot its dur, or its line's reading time when longer).`);
  return out;
}

/** A passed v2 pack as the runner's pack format (storykit: 1): the world Mog City's runner plays (wagmi/storyrun/pack.js). */
export function toRunnerPack(pack: PackV2, opts: { cast?: Record<string, string>; clips?: string } = {}): Json {
  const name = (id: string) => personName(pack.cast.find((c: Json) => c.id === id)) || pack.pets?.find((p: Json) => p.id === id)?.name || titleCase(id);
  // a shipped model's body: its GLB beside the page (the registry's), for a person who is seen
  // (a hand-built one (registry built: 'hand') is not Mog City's own: the runner draws it as a forged person, from the
  // world's stored copy of its GLB (opts.cast, the work page stores it) or the registry's file, on the clip pack, with
  // no model key: the runner reads a model as one of Mog City's people, and a model hero as Dan)
  const bodyOf = (c: Json) => { const m = c.model && !c.voiceOnly ? modelOf(c.model) : null; if (!m?.glb) return null;
    return m.built === 'hand' ? { glb: opts.cast?.[c.id] || m.glb, idle: m.clips?.idle, walk: m.clips?.walk } : { model: c.model, glb: m.glb }; };
  // a stock car is its engine id; a vehicle sheet is its own id (the engine registers it from car / rides)
  const stockOf = (rideId: string) => { const v = pack.vehicles.find((x: Json) => (x.id || x.stock) === rideId); return v ? (v.stock || v.id) : undefined; };
  const sheets = pack.vehicles.filter((v: Json) => !v.stock);
  // (the Vantor GT, a showcase's: Mog City builds it in code, wagmi/storyrun/gt.js; the runner reads car { model, label, plate, paint })
  const carOf = (rideId: string) => { const v = pack.vehicles.find((x: Json) => (x.id || x.stock) === rideId); return v?.stock === 'gt' ? { model: 'mogcity/gt', ...(v.label ? { label: v.label } : {}), ...(v.plate ? { plate: v.plate } : {}), ...(v.paint ? { paint: v.paint } : {}) } : stockOf(rideId); };
  const heroRide = pack.ride || (pack.vehicles[0].id || pack.vehicles[0].stock);
  const heroSheet = sheets.find((v: Json) => v.id === heroRide);
  // a camera point on a cast member ({ rel: id }) names them as the runner does (by name)
  const camRef = (r: Json) => (r && typeof r === 'object' && r.rel && r.rel !== 'player' ? { ...r, rel: name(r.rel) } : r);
  // a set's people by name (who, whom they face, hug or hold), as the runner reads them (sets.js)
  const ref = (id: Json) => (typeof id === 'string' && id !== 'player' ? name(id) : id);
  const personOf = (p: Json) => { const o: Json = { ...p, who: ref(p.who) }; if (typeof p.face === 'string') o.face = ref(p.face); if (p.look && p.look !== 'lens' && p.look !== 'prop') o.look = ref(p.look); if (p.hug) o.hug = ref(p.hug); if (p.hold) o.hold = { ...p.hold, who: ref(p.hold.who) }; return o; };
  const setOf = (d: Json) => (d ? { ...d, people: (d.people || []).map(personOf) } : d);
  const shots = (list: Json[]) => list.map((sh: Json) => { const c: Json = { ...sh }; for (const k of ['cam', 'look', 'to', 'lookTo']) if (c[k]) c[k] = camRef(c[k]); if (c.act) c.act = c.act.map(personOf); return c; });
  const choiceOf = (s: Json): Json => {
    const o: Json = { ...s, who: s.who ? name(s.who) : s.who };
    o.options = s.options.map((op: Json) => (op.reply ? { ...op, reply: tuple(s.who, op.reply) } : op));
    if (s.silenceReply) o.silenceReply = tuple(s.who, s.silenceReply);
    return o;
  };
  // v2 writes speakers as cast ids and lines as objects; the runner wants display names and [who, text, secs] tuples
  const tuple = (who: string, text: string, secs?: number) => (secs == null ? [name(who), text] : [name(who), text, secs]);
  const step = (s: Json): Json => {
    const o: Json = { ...s };
    if (o.during) o.during = o.during.map(step);
    if (o.do) o.do = o.do.map(step);
    if (typeof o.who === 'string') o.who = name(o.who);
    const callLines = (ls: Json[]) => ls.map((l: Json) => tuple(l.who, l.text, l.secs).map((x, i) => (i === 0 ? String(x).toUpperCase() : x)));
    if (s.type === 'call' && o.lines) o.lines = callLines(o.lines);
    if (s.type === 'call' && o.extra) o.extra = o.extra.map(callLines);
    if (s.type === 'call' && o.wrap) o.wrap = callLines(o.wrap);
    if (s.type === 'call' && o.hold) o.hold = { pause: callLines(o.hold.pause || []), resume: callLines(o.hold.resume || []) };
    if (s.type === 'dm') { o.from = s.from ? name(s.from) : s.name; delete o.name; }
    if (s.type === 'comfort' && o.lines) o.lines = o.lines.map((l: Json) => ({ ...l, who: name(l.who) }));
    if (s.type === 'passenger' && o.comfort?.lines) o.comfort = { ...o.comfort, lines: o.comfort.lines.map((l: Json) => ({ ...l, who: name(l.who) })) };
    if (o.voicemail?.from) o.voicemail = { ...o.voicemail, from: name(o.voicemail.from) };
    if ((s.type === 'trigger' || s.type === 'beat') && o.say) o.say = tuple(o.say.who, o.say.text);
    if (s.type === 'choice') Object.assign(o, choiceOf(s));
    if (s.type === 'call' && s.choice) o.choice = choiceOf(s.choice);
    // a cutscene's line: [speaker, text] under the shot; a bare sub has no speaker
    if (s.type === 'cutscene' && s.set) o.set = setOf(s.set);
    if (s.type === 'cutscene') o.shots = shots(s.shots).map((sh: Json) => { const c = { ...sh }; if (c.say) c.sub = tuple(c.say, c.line); else if (typeof c.sub === 'string') c.sub = ['', c.sub]; delete c.say; delete c.line; return c; });
    if (s.type === 'beat' && o.shot) o.shot = shots([o.shot])[0];
    if (s.type === 'fight') o.enemies = s.enemies.map(name);
    if (s.type === 'actEnd' && o.quote?.by) o.quote = { ...o.quote, by: name(o.quote.by) };
    if (s.type === 'vignette') o.shots = shots(o.shots).map((sh: Json) => { const c = { ...sh }; if (c.say) c.say = tuple(c.say, c.line); delete c.line; return c; });
    return o;
  };
  const missions = pack.acts.flatMap((a: Json) => a.missions.map((m: Json) => {
    const o: Json = { ...m, city: CITY_NAME[pack.base.city as CityId], steps: m.steps.map(step) };
    delete o.verbs;
    if (m.vehicle === 'on-foot') { delete o.vehicle; o.start = typeof m.start === 'string' ? { '@': m.start.slice(1), mode: 'walk' } : { ...m.start, mode: 'walk' }; } else o.vehicle = stockOf(m.vehicle);
    return o;
  }));
  const end = (e: Json) => (e?.quote?.by ? { ...e, quote: { ...e.quote, by: name(e.quote.by) } } : e);
  return {
    storykit: 1, engine: pack.base.engine, id: pack.id, title: pack.title, kicker: pack.kicker, tagline: pack.tagline, city: pack.base.city,
    car: heroSheet ? { sheet: heroSheet } : carOf(heroRide), hud: pack.hud, dressing: pack.dressing,
    ...(sheets.some((v: Json) => v !== heroSheet) ? { rides: Object.fromEntries(sheets.filter((v: Json) => v !== heroSheet).map((v: Json) => [v.id, v])) } : {}),
    // a seen person's body: their forged GLB (opts.cast: cast id -> path next to the page) and the shared clip pack
    cast: Object.fromEntries([
      ...pack.cast.map((c: Json) => [name(c.id), { color: c.color, role: c.sheet?.role ?? c.role, ...(bodyOf(c) || (opts.cast?.[c.id] && c.sheet ? { glb: opts.cast[c.id], idle: c.sheet.posture?.idle, walk: c.sheet.posture?.walk } : {})) }]),
      // a pet's body: the registry's pet (Mog City's Moon) or a dog built the same way in its coat and size
      ...(pack.pets || []).map((p: Json) => [p.name, { color: p.coat || '#E9E2D6', pet: { species: p.species, breed: p.breed, size: p.size, coat: p.coat, model: p.model, owner: p.owner ? name(p.owner) : null, follows: !!p.follows } }])
    ]),
    ...(opts.clips ? { clips: opts.clips } : {}),
    // the player: the hero's display name, when they have a body (the engine puts it on foot and at the wheel)
    ...(pack.hero && (opts.cast?.[pack.hero] || bodyOf(pack.cast.find((c: Json) => c.id === pack.hero) || {})) ? { hero: name(pack.hero) } : {}),
    places: pack.places,
    // the opening, as the runner plays it: speakers, cards and stage by display name, a line under its shot
    ...(pack.opening ? { opening: {
      place: pack.opening.place, ...(pack.opening.time ? { time: pack.opening.time } : {}),
      stage: (pack.opening.stage || []).map((s: Json) => ({ ...s, who: name(s.who) })),
      ...(pack.opening.sets ? { sets: Object.fromEntries(Object.entries(pack.opening.sets).map(([k, d]) => [k, setOf(d)])) } : {}),
      shots: shots(pack.opening.shots).map((sh: Json) => { const c = { ...sh }; if (c.say) c.sub = tuple(c.say, c.line); else if (typeof c.sub === 'string') c.sub = ['', c.sub]; delete c.say; delete c.line; if (c.card) c.card = { ...c.card, who: name(c.card.who) }; return c; }),
    } } : {}),
    acts: pack.acts.map((a: Json) => ({ id: a.id, name: a.name, order: a.missions.map((m: Json) => m.id), timeline: a.timeline, ...(a.end ? { end: end(a.end) } : {}) })),
    missions,
  };
}

// ── helpers ──
/** A person's display name: their sheet's, or a model person's own (the registry's unless renamed). */
export const personName = (c: Json): string | undefined => c?.sheet?.name || c?.name;
function collect(o: Json, at: string, out: Text[], mission?: string, stepType?: string) {
  const walk = (v: Json, path: string, key: string, parent: Json) => {
    if (typeof v === 'string') {
      if (!FREE_KEYS.has(key)) return;
      if ((key === 'fail' && /^(hard|soft)$/.test(v)) || (key === 'value' && !/\.stats\[/.test(path))) return;
      const speech = SPEECH_KEYS.has(key) || (key === 'text' && (!!parent?.who || /\.(voicemail|say)$/.test(path.replace(/\.text$/, '')) || stepType === 'say' || stepType === 'voicemail' || stepType === 'voicenote') && !/\.(shots|backdrop|next|quote)\b/.test(path));
      out.push({ at: path, text: v, speech, mission });
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, key, parent)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'during' || k === 'do') continue; walk(x, `${path}.${k}`, k, v); }
  };
  if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) { if (k === 'during' || k === 'do' || x == null) continue; walk(x, `${at}.${k}`, k, o); }
}
function scanKeys(v: Json, at: string, f: (at: string, key: string, owner: Json) => void) {
  if (Array.isArray(v)) v.forEach((x, i) => scanKeys(x, `${at}[${i}]`, f));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { f(at, k, v); scanKeys(x, at ? `${at}.${k}` : k, f); }
}
function seatsOf(v: Json) { const cls = v.class || ''; return /coupe|sports|supercar|roadster/.test(cls) ? 2 : /wrecker/.test(cls) ? 3 : /minivan|van|limo|suv|wagon/.test(cls) ? 6 : 4; }
const familyWord = (f: Family) => ({ car4: 'car', heavy4: 'truck', motorbike: 'motorbike', scooter: 'scooter', bicycle: 'bicycle', foot: 'walker' })[f];
const clip = (s: string) => (s.length > 60 ? s.slice(0, 57) + '...' : s);
const dedupe = (a: string[]) => [...new Set(a)];
const titleCase = (s: string) => s.replace(/(^|-)([a-z])/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());
const sortKeys = (o: Json): Json => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : o);
function suggest(key: string, list: string[]) {
  const near = list.map((k) => ({ k, d: lev(key, k) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d)[0];
  return near ? ` (did you mean "${near.k}"?)` : '';
}
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
