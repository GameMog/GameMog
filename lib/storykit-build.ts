import Anthropic from '@anthropic-ai/sdk';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, insertDraft, type GameRow } from './db';
import { gatePack, personName, mogBase, MOGCITY, LIKENESS_TEXT, type PackV2 } from '../storykit/pack/gate.ts';
import { isBlocked } from './names';
import { STORY_HERO_MAX, STORY_HERO_MODELS } from './storykit-site';
import { MODELS, seeds as castSeeds, recordedClip, recordedLines } from '../storykit/pack/registry.ts';
import { PLACES, CAM_POINTS, CITY_NAME, MOGCITY_BUILDS, buildsFor, type CityId } from '../storykit/pack/cities.ts';
import { ANCHORS, MOGCITY_SCENES, CREATE_HELD, OPENING } from '../storykit/pack/schema.mjs';
import { KOKORO_VOICES, COLOUR_VOICES, lintVoiceBlock, voiceKey, clipBase } from '../storykit/voices/voice-design.js';
import { realNameProblems as sheetBrandProblems } from '../storykit/vehicles/sheet.js';
import { NAMES_CHECK_SYSTEM, readNamesCheck, consented, type Consent } from './episode';
import { storykitLive } from './storykit-switch';
import { storyStore } from './storykit-store';
import { storykitMc } from './storykit-publish';
import { hometownSystem, hometownTurn, checkHometownReply } from './storykit-hometown';
import { townName, type CityPackage } from '../storykit/hometown/city-package.ts';
import { cityPackageByLock } from './hometown/towns';

/**
 * The Story Kit builder (4 Nov 2026; .scratch/storykit/STORY-KIT-PLAN.md 2.2 stage 1 and 5): GameMog's build route
 * writing a STORY PACK v2 instead of a world module, behind the server switch STORYKIT=on (off by default: with it off
 * no request reaches this file, and production builds exactly as before).
 *
 *   CREATE A WORLD   the creator picks a city (ny | sf) and writes a prompt
 *   MOG              the creator remixes a Story Kit world: its city (base) is copied and locked, the rest is remixed
 *
 * The builder model (STORY_MODEL, Opus 5.5 at high effort since 5 Nov) gets a prompt of its own: who GameMog is, storykit/BUILDER.md (the
 * chapter it reads: the pack, places, the city rule, the rename rule, verbs, people, voices, rides, dressing, steps,
 * words and the Dognapped lessons), then the picked city's place list and camera points, the anchors, the Kokoro voice
 * table, the three schemas (pack v2, the Character Forge sheet, the vehicle sheet) and Night Shift as the worked example.
 * It replies with two json blocks (the meta and the pack). Each pass is held to:
 *   1. the platform's own fields: the id (the platform's), the parent (a Mog's), the base (the picked city's on a
 *      Create, the parent's on a Mog: copied when left out, refused when changed);
 *   2. storykit/pack/gate.ts gatePack (with the parent on a Mog: the city lock), every problem it names;
 *   3. the builder's own rules: a Create's 6 to 9 missions, no em dash, the vehicle sheets' brand rule;
 *   4. real people and brands: the builder's own lists and an independent check of the texts it wrote (on a Mog, only
 *      the texts it did not inherit), by the same check episodes use.
 * A refused pass goes back with every problem, up to the build's pass limit (3, as a world's). A pass that passes is
 * stored twice, and nothing else is made on the server:
 *   - in the Story Kit store (lib/storykit-store.ts, GameMog's own disk): a store draft opened for the pack (the store
 *     gates it again), with its parent's files that still apply carried over by hash (a person whose sheet is unchanged
 *     keeps their GLB, a line unchanged in an unchanged voice keeps its clip: the same blobs, no bytes). Its id and its
 *     write token go to the creator's page once, in the done event (`story`), for the browser's work: forge the new
 *     people, voice the new lines, the autopilot run and the key art, each stored with that token;
 *   - as a GameMog draft (the drafts table, as every build), format 'world', its module
 *     `GameMog.world({ storykit: <pack> });`, and its meta's `storykit: { city, pack: <store draft id>, ... }` (the site's
 *     convention, lib/storykit-site.ts), with what it inherits by hash in its report.
 */

export const STORYKIT_MAX_ATTEMPTS = 3;
/** A story pass's reply: a Create's or a Mog's (64,000 tokens), and a Mog of a showcase's, whose pack is about 150 KB. */
export const STORYKIT_MAX_TOKENS = 64_000, STORYKIT_SHOWCASE_MAX_TOKENS = 128_000;
/** The cities a story can be set in: the ones Mog City's engine plays (New York so far; a city map added there joins). */
export const STORYKIT_CITIES = Object.keys(MOGCITY_BUILDS) as CityId[];
/** The server switch (lib/storykit-switch.ts): the build worker runs a story build when it is on or owner-only; who may
 * ask for one is the build route's check (app/api/generate/route.ts, storykitForRequest). */
export const storykitOn = () => storykitLive();
/** What a story build hears while the switch is off (the site's words, lib/storykit-site.ts). */
export const STORY_CLOSED = 'Story worlds are not open yet.';
/** A Create needs a story, not a scene (the plan: a short 3-act game of 6 to 9 missions). */
export const CREATE_MISSIONS = { min: 6, max: 9 };

/* ---------------------------------------------------------------- the kind -- */
const SHAPE = /^\s*GameMog\.world\(\{ storykit: (\{[\s\S]*\}) \}\);\s*$/;
export const storykitModule = (pack: PackV2) => `GameMog.world({ storykit: ${JSON.stringify(pack)} });\n`;
export const isStorykitWorld = (code?: string | null) => !!code && SHAPE.test(code);
export function storykitPackOf(code?: string | null): PackV2 | null {
  const m = code ? SHAPE.exec(code) : null;
  if (!m) return null;
  try { const p = JSON.parse(m[1]); return p && p.storykit === 2 ? p : null; } catch { return null; }
}
export const isStorykitParent = (parent?: { format: string; code?: string | null } | null) => !!parent && parent.format === 'world' && isStorykitWorld(parent.code);
/** Whether a game's meta is a story world's (mode 'storykit', as storykitMeta writes it), whatever the switch says. */
export function isStoryMeta(meta?: string | null) {
  if (!meta || !meta.includes('"storykit"')) return false;
  try { return (JSON.parse(meta) as { mode?: unknown }).mode === 'storykit'; } catch { return false; }
}
/** Whether a Mog's original is a story world: its meta says so, or its module is a pack. */
export const isStoryParent = (parent?: { format: string; code?: string | null; meta?: string | null } | null) => !!parent && parent.format === 'world' && (isStoryMeta(parent.meta) || isStorykitWorld(parent.code));
/**
 * A story world's pack and its store draft: the kept world its meta names (storykit.pack, a store draft id), else the
 * pack its module carries (no store draft: its files are not carried over). Null when neither can be read.
 */
export function storyParentPack(parent: { code?: string | null; meta?: string | null }): { pack: PackV2; store: string | null } | null {
  try {
    const id = (JSON.parse(parent.meta ?? '{}') as { storykit?: { pack?: unknown } }).storykit?.pack;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) {
      const row = storyStore().db.prepare("SELECT pack FROM drafts WHERE id = ? AND state = 'kept'").get(id) as { pack: string } | undefined;
      if (row) return { pack: JSON.parse(row.pack), store: id };
    }
  } catch { /* the module's pack, below */ }
  const pack = storykitPackOf(parent.code);
  return pack ? { pack, store: null } : null;
}
/**
 * The hero a story Create asks for (lib/storykit-site.ts STORY_HERO_MAX): nothing (null, undefined or blank: the builder
 * invents the hero, as before), the creator's words for the hero's look (a string), or Mog City's Dan ({ model: 'dan' },
 * the only shipped hero offered). Anything else is refused, with the page's words, before a slot is taken or anything is
 * spent: another type, a look over the cap, markup, a word GameMog doesn't allow, a look pointing at a real person's
 * likeness (the gate's rule 6: "looks like <Name>"), or any other model or key.
 */
export type StoryHero = { look: string } | { model: (typeof STORY_HERO_MODELS)[number] };
export function readStoryHero(v: unknown): { ok: true; hero: StoryHero | null } | { ok: false; error: string } {
  if (v == null) return { ok: true, hero: null };
  if (typeof v === 'string') {
    const look = v.replace(/\s+/g, ' ').trim();
    if (!look) return { ok: true, hero: null };
    if (look.length > STORY_HERO_MAX) return { ok: false, error: `Keep your hero to ${STORY_HERO_MAX} characters.` };
    if (/[<>{}`]/.test(look)) return { ok: false, error: 'Describe your hero in words: no code or markup.' };
    if (isBlocked(look)) return { ok: false, error: 'Your hero has a word GameMog doesn\'t allow.' };
    if (LIKENESS_TEXT.test(look)) return { ok: false, error: 'Describe your hero in your own words: heroes are invented, never made to look like a real person.' };
    return { ok: true, hero: { look } };
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === 'model' && (STORY_HERO_MODELS as readonly unknown[]).includes(o.model)) return { ok: true, hero: { model: o.model as (typeof STORY_HERO_MODELS)[number] } };
  }
  return { ok: false, error: 'That hero could not be read: describe how they look, or play as Dan.' };
}
/** The shipped person a story played as Dan casts as its hero (public/storykit/cast/registry.json). */
export const DAN = 'mogcity/dan';

export const readCity = (v: unknown): CityId | null => (typeof v === 'string' && (STORYKIT_CITIES as string[]).includes(v) ? v as CityId : null);
/** The base a Create in a city runs on: Mog City's engine (mogcity-1, mc.gamemog.com) and its build of the city. */
export const baseOf = (city: CityId) => ({ engine: MOGCITY, city, cityBuild: buildsFor(MOGCITY, city)[0] });

/* -------------------------------------------------------------- the prompt -- */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const compact = (...p: string[]) => JSON.stringify(JSON.parse(read(...p)));

/** The city's place list as the builder reads it: every key, its real name, and whether a drive can end there. */
export function placeList(city: CityId) {
  const rows = Object.entries(PLACES[city]).map(([k, p]) => `- @${k}: ${p.name}${p.foot ? ' (foot: off the lanes, walk there)' : ''}${p.startOnly ? ' (start only: no lanes; a start or a place step, never a drive target)' : ''}`);
  const cams = CAM_POINTS[city].length ? CAM_POINTS[city].map((c) => `\`${c}\``).join(', ') : 'none (use a place, the player or a cast member)';
  return `## ${CITY_NAME[city]}: Mog City's place list (base.city "${city}", cityBuild "${baseOf(city).cityBuild}")\n\n${rows.join('\n')}\n\nNamed camera points: ${cams}.`;
}
/** The anchors as the builder reads them (storykit/anchors.json): each hand-tuned sheet's id, who they are and when to
 * pick them, and the archetypes the schema allows that have no sheet yet. */
export function anchorTable() {
  const A = JSON.parse(read('storykit', 'anchors.json')).anchors as { id: string; label: string; who: string; pick: string }[];
  const rows = A.map((a) => `| \`${a.id}\` | ${a.label} | ${a.who} | ${a.pick} |`);
  const bare = (ANCHORS as string[]).filter((a) => a !== 'none' && !A.some((x) => x.id === a));
  return `## The anchors (cast[].anchor)\n\nEach is a hand-tuned person the forge already builds well. Pick the nearest for each cast member by age, sex, build and job, then write their sheet as a variation of it (a new face, name, heritage, hair, colours and clothes for the story), keeping what the anchor gets right: the build band, the wardrobe items it wears, its posture. Two cast members may share an anchor; never the same silhouette.\n\n| anchor | label | who | pick it for |\n|---|---|---|---|\n${rows.join('\n')}\n\nArchetypes without a sheet yet (the nearest above is the safer start): ${bare.map((a) => `\`${a}\``).join(', ')}; \`none\` starts from the base body.`;
}
/** The Kokoro voices a block may use, as a table. */
export function voiceTable() {
  const rows = Object.entries(KOKORO_VOICES as Record<string, { sex: string; lang: string; grade: string; f0: number }>).map(([id, v]) => `| ${id} | ${v.sex} | ${v.lang} | ${v.grade} | ${v.f0} |`);
  return `## The voices (English stock voices: a base, or up to 3 in a blend)\n\n| id | sex | accent | grade | median Hz |\n|---|---|---|---|---|\n${rows.join('\n')}\n\nOther-language colour voices, only inside a blend and at most 0.35 of it: ${(COLOUR_VOICES as string[]).join(', ')}.`;
}

/** The cast registry for the builder: each shipped person and pet, its anchor, voice and recorded lines, and the seed sheet a Mog starts from when it changes one. */
export function shippedCast() {
  const hand = Object.keys(MODELS).filter((k) => MODELS[k].built === 'hand');
  const rows = Object.entries(MODELS).map(([k, m]) => `| \`${k}\` | ${m.kind} | ${m.name} | ${m.role} | ${m.anchor || ''} | ${m.voice?.near?.id || ''} | ${m.can.join(', ')} | ${m.voice?.recorded ? recordedLines(k).length : 0} |`);
  const rec = Object.keys(MODELS).filter((k) => MODELS[k].voice?.recorded).map((k) => `- \`${k}\`: ${recordedLines(k).slice(0, 6).map((l) => JSON.stringify(l.text)).join(' ')}${recordedLines(k).length > 6 ? ' ...' : ''}`);
  return `## The shipped cast (cast[].model, pets[].model)

| model | kind | name | role | anchor | voice id | can | recorded lines |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Each one's voice block (left out, the registry's is used; copy it exactly to keep their recordings):

${Object.entries(MODELS).filter(([, m]) => m.voice).map(([k, m]) => `- \`${k}\`: ${JSON.stringify(m.voice!.near)}`).join('\n')}

Some of their recorded lines (the same words in the same voice play the recording):

${rec.join('\n')}

A Mog that changes how one of them looks replaces the model with a sheet started from their seed sheet (given with the parent when it has them).${hand.length ? `

Hand-built people (${hand.map((k) => `\`${k}\``).join(', ')}) belong to no world: polished by hand to the shipped cast's standard, they fit any story in any city, in any part, and can be its hero (\`{ "id": "...", "model": "${hand[0]}", "color": "..." }\`, set \`name\` to rename them; they have no recorded lines, so every line is voiced in their voice block). ${hand.map((k) => `\`${k}\` is ${MODELS[k].name}, ${MODELS[k].role.replace(/ \(.*\)$/, '')}`).join('; ')}. For a lead who fits one of them, prefer them over a forged sheet on the same anchor.` : ''}`;
}
/** The seed sheets of the shipped people a parent pack uses (a Mog's request), or ''. */
export function seedsFor(pack: PackV2) {
  const used = [...new Set((pack.cast || []).map((c: PackV2) => c.model).filter((k: unknown) => typeof k === 'string' && castSeeds()[k as string]))] as string[];
  if (!used.length) return '';
  return `\n\nThe seed sheets of its shipped people (cast[].model). To change how one of them looks (a new face, clothes, age, build), drop their model and write a sheet from their seed: the sheet's id is the cast id, its voice.id the voice block's, the anchor the registry's, and change only what the idea asks for. A rename alone keeps the model (set name).\n\n\`\`\`json\n${JSON.stringify(Object.fromEntries(used.map((k) => [k, castSeeds()[k]])))}\n\`\`\``;
}

/** Mog City's authored set pieces a `scene` step may name (schema MOGCITY_SCENES), for the builder. */
export function sceneTable() {
  return `## Mog City's set pieces (the scene step)\n\n| name | what plays |\n|---|---|\n${Object.entries(MOGCITY_SCENES as Record<string, string>).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}\n\nThey are Mog City's own code with its own people (Dan, the Suits, Mr. Big): write one only in a story whose hero is Dan (\`mogcity/dan\`), a Mog of Mog City. Any other story writes its own cutscenes.`;
}

/**
 * The worked example as Mog City's engine plays it: Night Shift (storykit/packs/test-night-shift.json, written for the
 * older engine) on mogcity-1, with what Mog City has no part for yet taken out (its passenger steps) and the weather
 * left clear (Mog City draws none yet; the snow is in the words).
 */
export function exampleWorld(): PackV2 {
  const p = JSON.parse(read('storykit', 'packs', 'test-night-shift.json')) as PackV2;
  p.base = baseOf('ny');
  p.dressing = { ...p.dressing, weather: 'clear' };
  const stubs = new Set(CREATE_HELD as string[]);
  for (const a of p.acts) for (const m of a.missions) m.steps = m.steps.filter((x: PackV2) => !stubs.has(x.type)).map((x: PackV2) => (x.during ? { ...x, during: x.during.filter((d: PackV2) => !stubs.has(d.type)) } : x));
  // (the opening, BUILDER.md: Night Shift was written before it, so the example gives it one, and the man in the grey
  // car who wants Mrs. Kwon's books, the antagonist it brings on, a forged person from the fixer anchor)
  const ray = p.cast.find((c: PackV2) => c.id === 'ray');
  if (ray && !p.cast.some((c: PackV2) => c.id === 'vic')) {
    const vic = JSON.parse(JSON.stringify(ray));
    vic.id = 'vic'; vic.anchor = 'fixer'; vic.color = '#9B2D3A';
    vic.voice = { id: 'vic-v1', kokoro: 'bm_lewis', speed: 0.92, pitch: -0.8, description: 'a man in his fifties, low and unhurried, never raises his voice' };
    Object.assign(vic.sheet, { id: 'vic', name: 'Vic Lasko', role: 'the loan shark in the grey car', logline: 'Fifty-two, lends to the shops on Orchard Street and wants the only record of it burned.' });
    vic.sheet.identity = { ...vic.sheet.identity, age: 52 };
    vic.sheet.voice = { ...vic.sheet.voice, id: 'vic-v1' };
    p.cast.push(vic);
  }
  p.opening = {
    place: '@bowery', time: 'midnight',
    stage: [{ who: 'kwon', at: '@kwon-corner' }, { who: 'vic', at: '@foley' }],
    shots: [
      { cam: { rel: 'player', right: -8, up: 34, fwd: -55 }, to: { rel: 'player', right: -11, up: 13, fwd: -25 }, look: 'player', dur: 7.5, where: { name: 'The Bowery', sub: 'E Houston St · Lower East Side · 12:30 AM' } },
      { cam: { rel: 'player', right: 0.7, up: 0.05, fwd: 2.3 }, look: { rel: 'player' }, dur: 6.5, card: { who: 'dez', is: 'hero', role: 'night-shift cab driver' }, say: 'dez', line: 'Five years of nights in this cab. One more fare, then home before the snow shuts the city.' },
      { cam: { rel: 'kwon', right: 1, up: 0.25, fwd: 3.2 }, look: { rel: 'kwon' }, dur: 6, card: { who: 'kwon', is: 'ally', role: 'the last fare of the night' }, say: 'kwon', line: 'Fifty years of the shop\'s books, and only one bag to carry them in.' },
      { cam: { rel: 'vic', right: -1.2, up: 0.2, fwd: 3 }, look: { rel: 'vic' }, dur: 6.5, card: { who: 'vic', is: 'antagonist', role: 'the loan shark in the grey car' }, say: 'vic', line: 'Every name in that bag owes me. Find the old woman before the snow stops.' },
      { cam: { rel: 'player', right: -9, up: 10, fwd: -18 }, look: 'player', dur: 6, title: true },
    ],
  };
  return p;
}

/** The builder's system prompt. `places` is the city's place list (placeList(city)); a hometown passes its town's
 * (lib/storykit-hometown.ts hometownPlaceList), everything else is the same. */
export function storykitSystem(city: CityId, places: string = placeList(city)) {
  return `You write story worlds for GameMog, a platform where people describe a game and get it playable at a link, and Mog games: remix one, which players then compare with the original. A story world runs on Mog City's engine (mc.gamemog.com): Mog City's open-world New York, its HUD, phone calls, cutscenes, fights, chases and free roam between missions. You write its story pack, never code.

${read('storykit', 'BUILDER.md').trim()}

${places}

${sceneTable()}

${anchorTable()}

${voiceTable()}

## The story pack schema (JSON Schema)

\`\`\`json
${compact('storykit', 'pack', 'schema.json')}
\`\`\`

${shippedCast()}

## The Character Forge sheet schema (cast[].sheet)

\`\`\`json
${compact('scripts', 'forge', 'character-sheet.schema.json')}
\`\`\`

## The vehicle sheet schema (vehicles[], a full sheet)

\`\`\`json
${compact('storykit', 'vehicles', 'vehicle-sheet.schema.json')}
\`\`\`

## Worked example: Night Shift (New York, a winter night, three people, one cab)

It passes the gate and plays end to end on Mog City's engine. Yours should be fuller (6 to 9 missions for a Create), with its own people, cars and voices, and its Mission 1 should end on a payoff the player does (see "Mission 1").

\`\`\`json
${JSON.stringify(exampleWorld())}
\`\`\``;
}

/** `mog.lineage`: the game the published Mog's family credits (its draft's parent) when it is not the story world it was
 * built from: a Mog of /g/mog-city is built from Mog City's own story world and joins /g/mog-city's family
 * (lib/storykit-mogcity.ts). */
export type StorykitInput = { city?: CityId; hero?: StoryHero | null; mog?: { parent: GameRow; instruction: string; lineage?: GameRow };
  /** a hometown Create (base.city 'hometown'): the town's CityPackage, read from its bundle by the build route (lib/hometown/towns.ts) */
  town?: CityPackage };
const parentOf = (input: StorykitInput) => (input.mog ? storyParentPack(input.mog.parent) : null);

/** The first turn: a Create's city and request, or a Mog's parent pack whole, its locks and the idea. */
export function storykitTurn(prompt: string, input: StorykitInput) {
  if (input.mog) {
    const p = input.mog.parent, pack = parentOf(input)!.pack;
    const shown = { ...pack }; delete shown.voices;
    const city = pack.base.city as CityId;
    return `MOG. The original: "${p.title}", generation ${p.generation}. ${p.tagline ?? ''}
${p.mog_prompt ? `The idea it was made from: ${p.mog_prompt}\n` : ''}It is set in ${CITY_NAME[city]}, and a Mog keeps that city: its base is exactly ${JSON.stringify(mogBase(pack.base))}${pack.base.engine !== MOGCITY ? ' (the original was written for the older engine; the Mog plays on Mog City\'s, so steps Mog City has no part for go, and the rest is copied)' : ''}.

Its complete story pack:

\`\`\`json
${JSON.stringify(shown)}
\`\`\`${seedsFor(pack)}

The challenger's idea:

${input.mog.instruction}

Start from the original's pack and change what the idea asks for, and nothing else: it must be recognisably a remix of "${p.title}". Copy every person, sheet, voice block, ride and line the idea does not change exactly as they are, so their bodies, voices and recorded lines carry over. A Mog keeps the original's framework: the same meters (a label may be reworded), the same clock, and only the kinds of step, fight rules and fight wins the original uses; it changes the story, the cast, the cars, the voices and the dressing. Give it its own title and tagline, never naming Mog City (Mog City is the engine, not a world's name). ${pack.opening ? 'Keep the original\'s opening exactly as it is (copy its "opening": its clips carry over), unless the idea changes the story or its people (a new hero, a new villain, a new night); then write the Mog\'s own opening by the same rules (BUILDER.md, The opening).' : 'The original has no opening: when the idea changes the story or its people, give the Mog an opening of its own (BUILDER.md, The opening).'} Reply with the two blocks.`;
  }
  const city = input.city!;
  return `CREATE A WORLD in ${CITY_NAME[city]}. The creator picked ${CITY_NAME[city]} and wrote:

${prompt}

Its base is exactly ${JSON.stringify(baseOf(city))}. Write a new story pack: ${CREATE_MISSIONS.min} to ${CREATE_MISSIONS.max} missions in 1 to 3 acts, its own cast, rides and voices, set in ${CITY_NAME[city]}, with a title of its own that never names Mog City (Mog City is the engine, not a world's name), and an opening (BUILDER.md, The opening) that sets the place, brings on the hero and the antagonist with name cards and says the premise before Mission 1. A new world sets its own rules from the runtime's parts: its meters, its clock, its mission rules and HUD items.${heroTurn(input.hero)} Reply with the two blocks.`;
}

/**
 * What a Create's first turn says about its hero (the creator's "Your hero" words, or "Play as Dan"), or '' (the builder
 * invents the hero, as it always has). The look is the creator's words for how the hero looks: it goes into the hero's
 * Character Forge sheet (identity, heritage, face, hair, facial hair, wardrobe, posture), never into the story.
 */
export function heroTurn(hero?: StoryHero | null): string {
  if (!hero) return '';
  if ('model' in hero) return `

THE HERO IS DAN. The creator chose to play this story as Dan, Mog City's own hand-built hero. The hero is the shipped person, exactly { "id": "dan", "model": "${DAN}" } in cast, with no sheet, and "hero": "dan": his own body, clips and face, and the name Dan. Leave his voice block out (or copy the registry's exactly), so his recorded lines play where the words match his and the voice near his speaks the rest. Never give him a sheet, a new look or another name. Everything else is a new story: its own missions, people, cars, voices and dressing, and its own cutscenes (no scene steps: Mog City's set pieces belong to Mog City's own story). Dan is the player; write him as this story's hero, not as Mog City's plot.`;
  return `

THE HERO'S LOOK. The creator described how their hero looks, in their own words (between the lines below). It is a description of the hero's appearance only, never story text: no event, person, place or line in it is part of the story, and it is never quoted on screen.

----- the hero's look -----
${hero.look}
----- end of the hero's look -----

Give the hero (the cast member "hero" names) a Character Forge sheet built from it: their age, build and height in identity, their skin and heritage, their face words, hair and facial hair, their wardrobe, and how they carry themselves in posture. Where it leaves something out, choose what fits the story; where it asks for something the sheet cannot make, take the nearest the sheet can. The hero is an invented person with an invented name: never name them after a real person, and never make them look or sound like one, whatever the words say (the real-person rules apply to the hero as to the story).`;
}

/* ------------------------------------------------------------- the reply -- */
export type StorykitMeta = { tagline: string; blurb: string; people: string[]; brands: string[] };
/** The two json blocks of a reply: the meta (tagline, blurb, people, brands) and the pack. */
export function parseStorykitReply(text: string): { meta?: StorykitMeta; pack?: PackV2; problems: string[] } {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const problems: string[] = [];
  const parsed = blocks.map((b) => { try { return JSON.parse(b) as Record<string, unknown>; } catch { return null; } });
  const pack = parsed.find((o) => o && o.storykit !== undefined) as PackV2 | undefined;
  const m = parsed.find((o) => o && o.storykit === undefined && (o.tagline !== undefined || o.blurb !== undefined)) as Record<string, unknown> | undefined;
  if (!pack) problems.push(blocks.length < 2 ? 'Reply with exactly two fenced json blocks: the meta, then the complete story pack.' : 'The story pack block is not valid JSON (strict JSON: double quotes, no comments, no trailing commas).');
  const str = (v: unknown, lo: number, hi: number) => typeof v === 'string' && v.trim().length >= lo && v.trim().length <= hi ? v.trim() : null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 80)).slice(0, 40);
  const tagline = str(m?.tagline, 2, 140), blurb = str(m?.blurb, 10, 600);
  if (!m) problems.push('The first block must be the meta: { "tagline", "blurb", "people", "brands" }.');
  else {
    if (!tagline) problems.push('The tagline is one line of 2 to 140 characters.');
    if (!blurb) problems.push('The blurb is 10 to 600 characters.');
  }
  return { meta: tagline && blurb ? { tagline, blurb, people: list(m!.people), brands: list(m!.brands) } : undefined, pack, problems };
}

const sortKeys = (o: unknown): unknown => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys((o as Record<string, unknown>)[k])])) : Array.isArray(o) ? o.map(sortKeys) : o);
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
export const hashOf = (o: unknown) => createHash('sha1').update(JSON.stringify(sortKeys(o))).digest('hex').slice(0, 12);

/**
 * The platform's own fields, before the gate: the id is the draft's; a Mog names its parent; the base is the picked
 * city's (a Create) or the parent's (a Mog), copied when the pass left it out and refused when it wrote another.
 */
export function platformFields(pack: PackV2, id: string, input: StorykitInput): string[] {
  const out: string[] = [];
  pack.id = id;
  const parent = parentOf(input)?.pack ?? null;
  if (parent) pack.parent = parent.id; else delete pack.parent;
  const want = parent ? mogBase(parent.base) : baseOf(input.city!);
  if (pack.base == null) pack.base = { ...want };
  else if (!same(pack.base, want)) {
    out.push(parent
      ? `base: a Mog keeps its parent's city and build exactly, ${JSON.stringify(want)}, not ${JSON.stringify(pack.base)}. The city is locked: carry the idea into ${CITY_NAME[want.city as CityId]}.`
      : `base: the creator picked ${CITY_NAME[want.city as CityId]}, so the base is exactly ${JSON.stringify(want)}, not ${JSON.stringify(pack.base)}. Set the story there.`);
  }
  return out;
}

/** Every text of a pack a player reads or hears, with where it is (enums, ids, colours and references are left out). */
const NOT_TEXT = new Set(['id', 'type', '@', 'face', 'if', 'goto', 'until', 'flag', 'clip', 'hash', 'status', 'cue', 'tag', 'value', 'silenceValue', 'fork',
  'rel', 'cam', 'look', 'to', 'lookTo', 'place', 'start', 'who', 'say', 'by', 'owner', 'vehicle', 'ride', 'hero', 'anchor', 'kokoro', 'stock', 'storykit', 'parent', 'base', 'voices', 'blend']);
export function packTexts(pack: PackV2): { at: string; text: string }[] {
  const out: { at: string; text: string }[] = [];
  const walk = (v: unknown, at: string, key: string) => {
    if (NOT_TEXT.has(key)) return;
    if (typeof v === 'string') { if (/[A-Z\s]/.test(v) && !/^#[0-9a-f]{6}$/i.test(v) && !/^@/.test(v)) out.push({ at, text: v }); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k, k);
  };
  walk(pack, '', '');
  return out;
}

/** The builder's own rules, beyond the gate. */
export function builderProblems(pack: PackV2, input: StorykitInput, meta?: StorykitMeta): string[] {
  const out: string[] = [];
  const missions = (pack.acts ?? []).reduce((n: number, a: PackV2) => n + (a?.missions?.length ?? 0), 0);
  if (!input.mog && (missions < CREATE_MISSIONS.min || missions > CREATE_MISSIONS.max)) out.push(`A new story has ${CREATE_MISSIONS.min} to ${CREATE_MISSIONS.max} missions (in 1 to 3 acts); this one has ${missions}.`);
  // (a Mog copies the lines the idea leaves alone exactly, so their recordings carry over: only its own words are held
  // to this, never a text its original already has, as Mog City's own "'The face of insider trad—' and then black.")
  const had = new Set(input.mog ? packTexts(parentOf(input)?.pack ?? {}).map((t) => t.text) : []);
  const dash = [...packTexts(pack), ...(meta ? [{ at: 'meta.tagline', text: meta.tagline }, { at: 'meta.blurb', text: meta.blurb }] : [])].find((t) => /—/.test(t.text) && !had.has(t.text));
  if (dash) out.push(`${dash.at}: never an em dash in text a player sees (a comma, a colon or a full stop instead).`);
  for (const v of pack.vehicles ?? []) if (v && !v.stock && typeof v === 'object') for (const p of sheetBrandProblems(v) as string[]) out.push(`vehicles "${v.id}": ${p}.`);
  const all = (pack.acts ?? []).flatMap((a: PackV2) => a?.missions ?? []);
  const kinds = (steps: PackV2[] = []): PackV2[] => steps.flatMap((x) => [x, ...kinds(x?.during), ...kinds(x?.do)]);
  // a new story is written for what a Create may use: none of the kinds held back (CREATE_HELD: Mog City's stubs and the
  // play steps kept for GameMog's own showcase worlds first; a Mog may keep its parent's)
  const stubs = new Set(CREATE_HELD as string[]);
  if (!input.mog) {
    const used = [...new Set(all.flatMap((m: PackV2) => kinds(m.steps)).map((x: PackV2) => x?.type).filter((k: string) => stubs.has(k)))];
    if (used.length) out.push(`${used.map((k) => `'${k}'`).join(', ')}: a Create does not write ${used.length > 1 ? 'these' : 'this'} yet (${[...stubs].join(', ')}; BUILDER.md, What a Create does not write yet). Write the story without ${used.length > 1 ? 'them' : 'it'}: a person rides along in the story's words and calls, a deadline is a timer, a lookout is a fight or a chase.`);
    // (a title naming Mog City, a Create's or a Mog's, is the gate's: storykit/pack/gate.ts rule 11)
    const hero = (pack.cast ?? []).find((c: PackV2) => c?.id === pack.hero);
    if (hero?.model !== 'mogcity/dan' && all.some((m: PackV2) => kinds(m.steps).some((x: PackV2) => x?.type === 'scene'))) out.push('A scene step plays Mog City\'s own set pieces with its own people, so only a story whose hero is Dan (mogcity/dan) writes one: write this story\'s own cutscenes instead.');
  }
  // the hero as the creator asked (a Create only): played as Dan, the shipped Dan with no sheet and no scene step; given a
  // look, a forged hero (a sheet, which the look is written into)
  if (!input.mog && input.hero) {
    const hero = (pack.cast ?? []).find((c: PackV2) => c?.id === pack.hero);
    if ('model' in input.hero) {
      if (!hero || hero.model !== DAN || hero.sheet || hero.voiceOnly) out.push(`The creator plays this story as Dan: the hero is the shipped person { "id": "dan", "model": "${DAN}" }, with no sheet, and "hero" names him.`);
      else if (all.some((m: PackV2) => kinds(m.steps).some((x: PackV2) => x?.type === 'scene'))) out.push('This is a new story played as Dan, not Mog City\'s own: write its own cutscenes, no scene steps (Mog City\'s set pieces).');
    } else if (!hero?.sheet) out.push('The creator described how their hero looks: the hero is a forged person with a Character Forge sheet written from that look, not a shipped model.');
  }
  // a search of the hero's own car says so (on: "ride"): the hold is then at the car wherever he parked it. Written as a
  // search at the place, it waits at the corner, and a player who parked a block away finds nothing there (the Velvet
  // Run, 5 Nov: "Search the Vesper's trunk." at First Avenue, given up)
  for (const m of all) {
    const v = (pack.vehicles ?? []).find((x: PackV2) => x && (x.id || x.stock) === m?.vehicle), name = String(v?.label || '').split(/\s+/).find((w: string) => w.length >= 3 && /^[A-Z]/.test(w));
    for (const x of kinds(m?.steps)) {
      if (x?.type !== 'search' || x.on || m?.vehicle === 'on-foot') continue;
      const words = `${x.label || ''} ${x.objective || ''}`;
      if (/\b(trunk|boot|tailgate|glove ?box)\b/i.test(words) || (name && new RegExp(`\\b${name.replace(/\W/g, '')}\\b`, 'i').test(words))) out.push(`mission ${m.id}: the search "${x.label}" is of the hero's own car: write "on": "ride" (and "part": "trunk", "door" or "hood"), so the hold is at the car wherever the player parks it.`);
    }
  }
  // the opening (the owner, 5 Nov, after The Velvet Run: "no opening cinematic explaining the situation and introducing
  // the main characters"): a Create has one, and the gate holds it to the rules (storykit/pack/gate.ts rule 14); a Mog
  // keeps its parent's (the gate refuses one dropped) or writes its own
  if (!input.mog && !pack.opening) out.push(`opening: a new story opens with an opening before Mission 1 (BUILDER.md, The opening): a wide shot of ${CITY_NAME[(pack.base?.city ?? input.city ?? 'ny') as CityId] ?? 'the city'} with the place card (where), a name card for the hero ("is": "hero") and for who is in their way ("is": "antagonist"), the premise in ${OPENING.lines[0]} to ${OPENING.lines[1]} spoken lines, and the title; ${OPENING.secs[0]} to ${OPENING.secs[1]} s. Never leave the premise or the villain for a later voicemail.`);
  // Mission 1 ends on a payoff the player does (the owner's review of the first build, 4 Nov)
  const m1 = all[0];
  if (m1?.steps?.length) {
    const p = payoffProblem(m1);
    if (p) out.push(`mission ${m1.id} (Mission 1): ${p}`);
  }
  return out;
}

/** What a player does with their hands (the kinds a payoff can be); what may follow it (words, pictures, the score). */
const PLAYED = new Set(['drive', 'stops', 'walk', 'search', 'tow', 'fight', 'pursuit', 'tail']);
const AFTER = new Set(['say', 'cutscene', 'beat', 'scene', 'set', 'dm', 'wait', 'label', 'npc', 'call', 'voicemail', 'voicenote', 'transition', 'actEnd']);
/**
 * Mission 1's payoff (the owner, 4 Nov: it ends in a clear playable payoff, e.g. reaching and towing the ambulance): its
 * last steps are something the player does (reach the place, hold F at the thing, tow the car, win the fight, lose the chase), then
 * at most the words and pictures of what it won. A mission that ends on a choice, a timer or an `end` does not pay off.
 */
export function payoffProblem(m: PackV2): string | null {
  // (a step Mog City has no part for passes unplayed: it is neither the payoff nor in its way)
  const stubs = new Set(CREATE_HELD as string[]);
  const steps: PackV2[] = (m.steps ?? []).filter((x: PackV2) => !stubs.has(x?.type));
  let i = steps.length - 1;
  while (i >= 0 && AFTER.has(steps[i]?.type)) i--;
  if (i < 0) return 'it never asks the player to do anything: it must end on a payoff they play (reach the place and act there, tow the car, win the fight, lose the chase), then show what it won.';
  const last = steps[i];
  if (!PLAYED.has(last?.type) || last?.end || last?.goto) return `it ends on a '${last?.type}' step; end Mission 1 on a payoff the player plays (in a wrecker: a tow of the ambulance to the depot; a drive or walk to the goal, then a search there (hold F: "search the van"); a fight won or a chase lost), then at most the lines and the cutscene of what it won.`;
  if (!steps.slice(i + 1).some((x) => ['say', 'cutscene', 'beat', 'scene', 'dm', 'call'].includes(x?.type)) && !m.passLine) return 'its payoff is played but never shown: follow it with a line or a short cutscene of what it won, or give it a passLine.';
  return null;
}

/**
 * The real people and brands a pass names, found by its own lists and by the check: sent back, all of them, but a real
 * person the creator consented for (the consent step, as an episode's: lib/episode.ts consented) may be named.
 */
export function realNameSentBack(found: { people: string[]; brands: string[] }, consent?: Consent | null): string[] {
  const out: string[] = [];
  const people = [...new Set(found.people.map((p) => p.trim()).filter(Boolean))].filter((p) => !consented(p, consent)), brands = [...new Set(found.brands.map((b) => b.trim()).filter(Boolean))];
  if (people.length) out.push(`Real people are never named in a story world without their consent, and the creator gave it for ${consent?.names.length ? consent.names.map((n) => `"${n}"`).join(', ') : 'nobody'} (found: ${people.slice(0, 6).map((p) => `"${p}"`).join(', ')}): write an original character with an original name in their place. A likeness or a voice is never copied, consent or not.`);
  if (brands.length) out.push(`Real companies, brands and products are never named (found: ${brands.slice(0, 6).map((b) => `"${b}"`).join(', ')}): give each an original name of the city's own.`);
  return out;
}
/** The texts the independent check reads: the tagline and blurb, and every text (a Create) or every text the parent does not have (a Mog). */
export function namesBatches(pack: PackV2, meta: StorykitMeta, parent: PackV2 | null, size = 300) {
  const had = new Set(parent ? packTexts(parent).map((t) => t.text) : []);
  const all = [{ at: 'meta.tagline', text: meta.tagline }, { at: 'meta.blurb', text: meta.blurb }, ...packTexts(pack).filter((t) => !had.has(t.text))];
  const out: { at: string; text: string }[][] = [];
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

/* --------------------------------------------------------- inheritance -- */
/** A cast member's voice block as the voice pass reads it (scripts/storykit-pack.ts voiceBlockOf). */
function blockOf(c: PackV2) {
  const blend = c.voice.blend || null;
  const base = c.voice.kokoro || Object.entries((blend || {}) as Record<string, number>).filter(([id]) => id in KOKORO_VOICES).sort((x, y) => y[1] - x[1])[0]?.[0];
  return lintVoiceBlock({ id: c.voice.id, base, blend: blend || { [base]: 1 }, speed: c.voice.speed, pitch: c.voice.pitch, description: c.voice.description }).block;
}
/** Every spoken line's clip name (<line hash>-<voice key>), as the voice pass names it; a choice's prompt is not spoken. */
function clipsOf(pack: PackV2, lines: { id: string; who: string; text: string }[]) {
  const blocks = new Map(pack.cast.map((c: PackV2) => [c.id, blockOf(c)]));
  // (a line with a shipped recording, the cast registry's, is never rendered: storykit/pack/registry.ts)
  return lines.filter((l) => !/\.p$/.test(l.id) && blocks.has(l.who)).map((l) => ({ id: l.id, who: l.who, clip: clipBase(l.text, blocks.get(l.who)) as string, rec: !!recordedClip(pack.cast.find((c: PackV2) => c.id === l.who)?.voice, l.text) }));
}
export type Inheritance = {
  parent: string | null;
  cast: { id: string; sheet: 'inherited' | 'changed' | 'new' | 'voice-only' | 'model'; voice: 'inherited' | 'changed' | 'new'; sheetHash: string | null; voiceKey: string }[];
  lines: { total: number; inherited: number; render: number; clips: { id: string; clip: string; from: string | null }[] };
  vehicles: { id: string; state: 'inherited' | 'changed' | 'new' }[];
  todo: { forge: string[]; voice: number };
};
/**
 * What a passed pack inherits from its parent, by hash: a person whose sheet hashes the same keeps their forged body
 * (no forge), a voice block with the same key keeps the voice, and a line whose clip name (text hash + voice key) the
 * parent has keeps the parent's clip. What is left is the creator's browser's to make (todo).
 */
export function inheritance(pack: PackV2, lines: { id: string; who: string; text: string }[], parent: PackV2 | null): Inheritance {
  const pCast = new Map<string, PackV2>((parent?.cast ?? []).map((c: PackV2) => [c.id, c]));
  const cast = pack.cast.map((c: PackV2) => {
    const p = pCast.get(c.id), sheetHash = c.sheet ? hashOf(c.sheet) : null, key = voiceKey(blockOf(c)) as string;
    const sheet = c.model && !c.voiceOnly ? 'model' as const : !c.sheet ? 'voice-only' as const : p?.sheet && hashOf(p.sheet) === sheetHash ? 'inherited' as const : p ? 'changed' as const : 'new' as const;
    const voice = p && voiceKey(blockOf(p)) === key ? 'inherited' as const : p ? 'changed' as const : 'new' as const;
    return { id: c.id, sheet, voice, sheetHash, voiceKey: key };
  });
  let parentClips = new Set<string>();
  if (parent) {
    const bare = { ...parent }; delete bare.parent;
    // (the parent is a stored, gated world: read for its lines under the longest limits, so a showcase parent such as
    // Pickup Time, longer than a Create, still lists its lines and its clips carry over)
    parentClips = new Set(clipsOf(parent, gatePack(bare, { showcaseLine: true }).lines).map((l) => l.clip));
  }
  const all = clipsOf(pack, lines), recorded = all.filter((l) => l.rec).length;
  const clips = all.filter((l) => !l.rec).map((l) => ({ id: l.id, clip: l.clip, from: parentClips.has(l.clip) ? parent!.id as string : null }));
  const inherited = clips.filter((c) => c.from).length + recorded;
  const pVeh = new Map<string, PackV2>((parent?.vehicles ?? []).map((v: PackV2) => [v.id || v.stock, v]));
  const vehicles = pack.vehicles.map((v: PackV2) => { const id = v.id || v.stock, p = pVeh.get(id); return { id, state: p && same(p, v) ? 'inherited' as const : p ? 'changed' as const : 'new' as const }; });
  return {
    parent: parent?.id ?? null, cast, vehicles,
    lines: { total: all.length, inherited, render: all.length - inherited, clips },
    todo: { forge: cast.filter((c: Inheritance['cast'][number]) => c.sheet === 'new' || c.sheet === 'changed').map((c: Inheritance['cast'][number]) => c.id), voice: all.length - inherited },
  };
}

/** The meta a Story Kit draft is stored with (`storykit.pack`: its store draft's id, the site's convention). */
export function storykitMeta(pack: PackV2, m: StorykitMeta, inherit: Inheritance, store: string, consent?: Consent | null) {
  const name = (c: PackV2) => personName(c) || c.id;
  const hero = pack.cast.find((c: PackV2) => c.id === pack.hero);
  const cast = [...(hero ? [hero] : []), ...pack.cast.filter((c: PackV2) => c !== hero)].slice(0, 8).map((c: PackV2) => ({ name: String(name(c)).slice(0, 40), color: c.color, role: c === hero ? 'player' : 'rival' }));
  return {
    title: String(pack.title).slice(0, 40), tagline: m.tagline, blurb: m.blurb, genre: 'Story world', cast,
    palette: { sky: '#0B1220', ground: '#2A2D34', accent: hero?.color ?? '#F2C230' },
    mode: 'storykit' as const, scoring: 'none' as const, runtime: 1,
    options: { hazards: 'same' as const, music: null, open: true, coins: false },
    ...(consent ? { consent } : {}),
    storykit: {
      city: pack.base.city, pack: store, packId: pack.id, base: pack.base, parent: inherit.parent,
      // (a hometown: the town it plays, as base.hometown pins it; the play address names it, lib/storykit-publish.ts)
      ...(pack.base.hometown ? { hometown: pack.base.hometown } : {}),
      missions: pack.acts.reduce((n: number, a: PackV2) => n + a.missions.length, 0), acts: pack.acts.length,
      cast: pack.cast.length, vehicles: pack.vehicles.length, dressing: pack.dressing,
    },
  };
}

/* ------------------------------------------------------------- the build -- */
type Emit = (e: import('./generate-game').GameEvent) => void;
/** The story builder's effort (the owner, 5 Nov: Opus 5.5 at high effort, lib/generate-game.ts STORY_MODEL). */
const STORY_EFFORT = 'high' as const;

type Hooks = { signal?: AbortSignal; usage?: (pass: { attempt: number; model: string; usage: Anthropic.Beta.BetaUsage; partial?: boolean }) => void };

/** The independent check of real names over every batch; null when any batch could not be read (the build fails closed). */
async function checkNames(client: Anthropic, model: string, batches: { at: string; text: string }[][], pack: PackV2, attempt: number, hooks: Hooks) {
  const found = { people: [] as string[], brands: [] as string[] };
  const cast = pack.cast.map((c: PackV2) => personName(c) || c.id).join(', ');
  for (const texts of batches) {
    try {
      const r = await client.beta.messages.create({ model, max_tokens: 2000, system: NAMES_CHECK_SYSTEM,
        messages: [{ role: 'user', content: `The story's own invented people: ${cast}.\n\nThe texts:\n${texts.map((t, i) => `${i + 1}. ${t.text}`).join('\n')}` }] }, { signal: hooks.signal });
      hooks.usage?.({ attempt, model: r.model, usage: r.usage });
      if (r.stop_reason === 'max_tokens') return null;
      const one = readNamesCheck(r.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n'));
      if (!one) return null;
      found.people.push(...one.people); found.brands.push(...one.brands);
    } catch { return null; }
  }
  return found;
}

/**
 * STORYKIT_FAKE_REPLY=<file> (development only, refused when NODE_ENV=production): the builder replays that file's
 * { meta, pack } as the model's reply on every pass and the real-name check finds nothing, with no model call at all.
 * For local end-to-end runs (a hometown Create from the search to the play page) without spending a generation.
 */
export function fakeReply(): string | null {
  const f = process.env.STORYKIT_FAKE_REPLY;
  if (!f || process.env.NODE_ENV === 'production') return null;
  const r = JSON.parse(readFileSync(join(process.cwd(), f), 'utf8')) as { meta: unknown; pack: unknown };
  return '```json\n' + JSON.stringify(r.meta) + '\n```\n\n```json\n' + JSON.stringify(r.pack) + '\n```';
}

export async function generateStorykit(
  input: { prompt: string; model: string; storykit: StorykitInput; consent?: Consent | null } & Hooks,
  emit: Emit,
) {
  if (!storykitOn()) return emit({ type: 'error', error: STORY_CLOSED });
  const sk = input.storykit, from = parentOf(sk), parent = from?.pack ?? null;
  // a Mog of a showcase (Pickup Time, or a Mog of one: the store traces its line) keeps the showcase's limits (gate rule
  // 15), and its whole pack is written back, so its reply may be twice as long (the owner, 7 Nov: Mogs of Pickup Time open)
  const showcaseLine = !!from?.store && storyStore().showcaseLine(from.store);
  if (sk.mog && !parent) return emit({ type: 'error', error: 'The story world you are mogging could not be read.' });
  // a hometown (base.city 'hometown'): a Create in the town the build route read (sk.town), or a Mog of a hometown world,
  // whose town is read by its parent's lock (never the town's current build): the town is locked
  const town: CityPackage | null = sk.town ?? (parent?.base.city === 'hometown' ? cityPackageByLock(parent.base.hometown) : null);
  if (parent?.base.city === 'hometown' && !town) return emit({ type: 'error', error: 'The town this story world is set in could not be read.' });
  const city = (town ? 'hometown' : parent?.base.city ?? sk.city) as CityId;
  if (!town) {
    if (!city || !PLACES[city]) return emit({ type: 'error', error: 'Pick a city for the story world.' });
    // (every story world plays on Mog City's engine, which plays New York so far: an older world set elsewhere is not mogged)
    if (!STORYKIT_CITIES.includes(city)) return emit({ type: 'error', error: `Story worlds play on Mog City's engine, which plays ${STORYKIT_CITIES.map((c) => CITY_NAME[c]).join(' and ')} so far.` });
  }
  const stopped = () => !!input.signal?.aborted;
  const started = Date.now();
  const fake = fakeReply();
  const client = fake ? (null as unknown as Anthropic) : new Anthropic();
  const system = town ? hometownSystem(town) : storykitSystem(city);
  const first = town ? hometownTurn(input.prompt, town, sk.mog && parent ? { parent, instruction: sk.mog.instruction } : undefined) + (sk.mog ? '' : heroTurn(sk.hero)) : storykitTurn(input.prompt, sk);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: first }];
  const draftId = randomUUID(), packId = `sk-${draftId.slice(0, 8)}`;
  let lastProblems: string[] = [];
  const passes: { attempt: number; stop: string | null; replyChars: number; sentBack: string[] }[] = [];
  for (let attempt = 1; attempt <= STORYKIT_MAX_ATTEMPTS; attempt++) {
    if (stopped()) return;
    emit({ type: 'stage', stage: attempt === 1 ? 'thinking' : 'repairing', attempt });
    let final: Anthropic.Beta.BetaMessage;
    let live: { currentMessage: Anthropic.Beta.BetaMessage | undefined } | undefined;
    if (fake) {
      emit({ type: 'stage', stage: 'writing', attempt });
      final = { content: [{ type: 'text', text: fake }], stop_reason: 'end_turn', model: 'fixture', usage: {} } as unknown as Anthropic.Beta.BetaMessage;
    } else try {
      const stream = live = client.beta.messages.stream({
        model: input.model, max_tokens: showcaseLine ? STORYKIT_SHOWCASE_MAX_TOKENS : STORYKIT_MAX_TOKENS, system, messages,
        thinking: { type: 'adaptive' }, output_config: { effort: STORY_EFFORT }, cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      }, { signal: input.signal });
      let chars = 0, last = 0, writing = false;
      stream.on('text', (delta) => {
        if (!writing) { writing = true; emit({ type: 'stage', stage: 'writing', attempt }); }
        chars += delta.length;
        if (chars - last > 1500) { last = chars; emit({ type: 'progress', chars }); }
      });
      final = await stream.finalMessage();
    } catch (e) {
      const cut = live?.currentMessage;
      if (cut) input.usage?.({ attempt, model: cut.model, usage: cut.usage, partial: true });
      if (stopped()) return;
      const error = e instanceof Anthropic.RateLimitError ? 'The model is rate limited right now. Try again in a minute.'
        : e instanceof Anthropic.APIError ? `The Anthropic API returned ${e.status}: ${e.message}` : (e as Error).message;
      return emit({ type: 'error', error });
    }
    if (!fake) input.usage?.({ attempt, model: final.model, usage: final.usage });
    if (final.stop_reason === 'refusal') return emit({ type: 'error', error: 'The model declined this request. Try describing the story differently.' });

    const text = final.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n');
    emit({ type: 'stage', stage: 'checking', attempt });
    const { meta, pack: raw, problems } = parseStorykitReply(text);
    const account = { attempt, stop: final.stop_reason ?? null, replyChars: text.length, sentBack: [] as string[] };
    passes.push(account);
    if (final.stop_reason === 'max_tokens') problems.push('The reply was cut off at the length limit. Reply again with both blocks, the pack as compact JSON (no indentation), and shorter texts where you can.');
    let gated: ReturnType<typeof gatePack> | null = null;
    if (town && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      // (a hometown pass: the town's base (a Mog: its parent's, locked), its gate (rule 16 with the town's table) and the
      // real-place safety rules, then the builder's own rules on a Create: lib/storykit-hometown.ts)
      const h = checkHometownReply(text, { pkg: town, id: packId, parent });
      problems.push(...h.problems.slice(0, 40));
      if (h.problems.length > 40) problems.push(`... and ${h.problems.length - 40} more of the same kinds: check the whole pack against the rules.`);
      gated = h.gated;
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      problems.push(...platformFields(raw, packId, sk));
      gated = gatePack(raw, { parent, showcaseLine });
      problems.push(...gated.problems.slice(0, 40));
      if (gated.problems.length > 40) problems.push(`... and ${gated.problems.length - 40} more of the same kinds: check the whole pack against the rules.`);
      problems.push(...builderProblems(raw, sk, meta));
    } else if (raw) problems.push('The story pack is not a JSON object.');
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && gated) {
      if (!problems.length && meta && gated.pack) {
        const checked = fake ? { people: [], brands: [] } : await checkNames(client, input.model, namesBatches(gated.pack, meta, parent), gated.pack, attempt, input);
        if (stopped()) return;
        if (!checked) return emit({ type: 'error', error: 'The names in this story could not be checked right now. Try again in a minute.' });
        problems.push(...realNameSentBack({ people: [...meta.people, ...checked.people], brands: [...meta.brands, ...checked.brands] }, input.consent));
      }
    }

    if (!problems.length && meta && gated?.pack) {
      const pack = gated.pack;
      const inherit = inheritance(pack, gated.lines, parent);
      // the store draft the creator's browser fills (its parent's files that still apply carried over by hash); a world
      // whose original has no store draft is opened without one (the gate above already held it to its parent)
      const bare = { ...pack }; if (!from?.store) delete bare.parent;
      const opened = storyStore().open(bare, { parent: from?.store ?? null });
      if (!opened.ok) return emit({ type: 'error', error: opened.error, problems: 'problems' in opened ? opened.problems : undefined });
      const stored = storykitMeta(pack, meta, inherit, opened.id, input.consent);
      const code = storykitModule(pack);
      // the browser's work, still to do: forge the new people, voice the new lines, the autopilot run and the key art
      // (STORY-KIT-PLAN 2.2 stages 3 to 6); until it reports, the draft is unverified, never a pass
      const report = {
        ok: true, problems: [] as string[], advisories: [] as string[], levelReached: 0, kind: 'storykit', status: 'unverified',
        codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16), warnings: gated.warnings, clamped: gated.clamped,
        inherit, store: { draft: opened.id, files: opened.inherited }, trail: { passes, shipped: attempt, why: 'it passed the gate' },
      };
      db.prepare('DELETE FROM drafts WHERE id = ?').run(draftId);
      insertDraft({ id: draftId, prompt: input.prompt, meta: stored, code, report, format: 'world', parentId: (sk.mog?.lineage ?? sk.mog?.parent)?.id ?? null, mogPrompt: sk.mog?.instruction ?? null });
      // the show's first word on the browser's work (app/create/story-show.tsx StoryWork): who is to be forged and who is
      // inherited, and how many lines are voiced already
      const name = (c: PackV2) => String(personName(c) || c.id);
      emit({ type: 'story', city, ...(town ? { town: townName(town) } : {}), title: pack.title, voices: { done: inherit.lines.inherited, total: inherit.lines.total },
        cast: pack.cast.filter((c: PackV2) => c.sheet || (c.model && !c.voiceOnly)).map((c: PackV2) => { const st = inherit.cast.find((x) => x.id === c.id)?.sheet;
          return { id: c.id, name: name(c), color: c.color, role: c.sheet?.role ?? c.role, state: st === 'model' || (st === 'inherited' && opened.inherited) ? 'done' : 'waiting' }; }) });
      return emit({ type: 'done', draftId, meta: stored as never, runtime: report as never, attempts: attempt, ms: Date.now() - started, mc: storykitMc(),
        story: { draft: opened.id, token: opened.token, pack: pack.id, city, forge: inherit.todo.forge, voice: inherit.todo.voice, inherited: opened.inherited } });
    }

    lastProblems = problems;
    account.sentBack = problems.slice(0, 20).map((p) => p.slice(0, 400));
    emit({ type: 'problems', attempt, problems });
    messages.push({ role: 'assistant', content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({ role: 'user', content: `Your story pack was checked by the gate and refused. Fix every one of these and reply with both blocks again, the complete pack:\n\n${problems.map((p) => `- ${p}`).join('\n')}` });
  }
  emit({ type: 'error', error: `The story still had problems after ${STORYKIT_MAX_ATTEMPTS} attempts.`, problems: lastProblems });
}
