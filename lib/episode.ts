import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePack, CAST } from './episode/schema.js';
import { isBlocked, isReserved } from './names';

/**
 * Mog City episodes (the owner, 3 Nov 2026: "make Mog City moggable"; MogCity .scratch/moggable/PLAN.md section 4).
 *
 * The seventh kind of world, and the only one that is data: an episode's world module is exactly
 * `GameMog.world({ episode: <a Mog City story pack> });`, one strict JSON literal and no code. The game itself stays on
 * mc.gamemog.com; GameMog serves the pack (/g/<slug>/story.json) and the play frame is the city with `?story=` at it.
 * A pack changes words and looks, never structure: lib/episode/schema.js (a byte copy of Mog City's
 * wagmi/story/schema.js, its validatePack) holds it to the base pack's key sets, speakers, lengths and ranges.
 *
 * The owner's rules for the kind (3 Nov): made only as a Mog of an episode (Mog-only, like a Grand Prix), and a Mog of
 * one stays one; the title is always "MOG CITY: <their title>"; scores and dares are off; real brands are blocked; real
 * people, public figures included, only when the creator says it is them or they agreed (the consent step); the old
 * game's names are never mentioned (kept here only as SHA-256 hashes). Words are judged on what the Mog changed, never
 * on what it inherited.
 */

/** The SHA-256 of Mog City's wagmi/story/schema.js as copied (everything after the header of lib/episode/schema.js). */
export const SCHEMA_SHA = 'aeb0a96b943d2d8a1fa31689149416b525707c5b9199384cabf3464064a2b2b1';
/** The line in lib/episode/schema.js after which the file is Mog City's, byte for byte. */
export const SCHEMA_MARK = '// ---- copy below ----\n';
/** The most an episode module may hold (the default pack is about 60 KB; WORLD_MAX's 750 KB is far too loose for data). */
export const EPISODE_MAX = 160_000;
/** The base every pack names, and the engine's own name in every title. */
export const EPISODE_BASE = 'mog-city@1';
export const MOG_CITY = 'MOG CITY';
/** Where the game runs: mc.gamemog.com; outside production a local copy of Mog City may stand in (EPISODE_MC_ORIGIN, localhost only). */
export const MC_PROD = 'https://mc.gamemog.com';
export function mcOrigin() {
  const o = process.env.EPISODE_MC_ORIGIN;
  return o && process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(o) ? o : MC_PROD;
}
/** The play page's controls line for an episode (Mog City's own). */
// (Mog City's README "Controls", 3 Nov)
export const EPISODE_CONTROLS = 'W A S D and the mouse: move and look. Shift: sprint. Space: jump. F: get in or out of the car; W S A D drive, brake and steer, Shift boosts, Space hops, X puts the car back on the road. J or a left click: strike; K or a right click: heavy; Q or L: counter; C: dodge; E: grab. R and T: the radio. M: the map. B: the brief. Esc: pause, with every control. Hold Space to skip a cutscene. An Xbox or PlayStation controller works too.';

type Pack = {
  pack: 1; base: string; title: { episode: string }; names: Record<string, string>;
  cast: Record<string, { name: string; [k: string]: unknown }>; car: { paint: string };
  lines: Record<string, [string, string]>; copy: Record<string, string>; difficulty: Record<string, number>; consent?: unknown;
};
export type EpisodePack = Pack;

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
let base: { pack: Pack; limits: { lines?: Record<string, number>; copy?: Record<string, number> } } | null = null;
/** The default pack (Mog City as it is) and its per-entry limits, lib/episode/default.json and limits.json. */
export function episodeBase() {
  return base ??= { pack: JSON.parse(read('lib', 'episode', 'default.json')) as Pack, limits: JSON.parse(read('lib', 'episode', 'limits.json')) };
}

/* ------------------------------------------------------------- the kind -- */
/** The one shape an episode module has: the call around one JSON object, nothing before or after but white space. */
const SHAPE = /^\s*GameMog\s*\.\s*world\s*\(\s*\{\s*episode\s*:\s*(\{[\s\S]*\})\s*\}\s*\)\s*;?\s*$/;
/**
 * Whether a world is an episode: `episode: {` among GameMog.world's own keys (cheaply: the module starts with the call
 * and the key, as only an episode's can), never beside open, kart, shootout or gp (checkEpisode refuses those).
 */
export function isEpisodeWorld(code?: string | null) {
  return !!code && /^\s*GameMog\s*\.\s*world\s*\(\s*\{\s*episode\s*:\s*\{/.test(code);
}
/** The module an episode's pack is stored as (compact JSON: the story route serves exactly that text). */
export const episodeModule = (pack: unknown) => `GameMog.world({ episode: ${JSON.stringify(pack)} });\n`;
/** The pack in an episode module, or null. */
export function packOf(code?: string | null): Pack | null {
  const m = code ? SHAPE.exec(code) : null;
  if (!m) return null;
  try { const p = JSON.parse(m[1]); return p && typeof p === 'object' && !Array.isArray(p) ? p as Pack : null; } catch { return null; }
}
/** The story JSON the routes serve for an episode module (its pack, compact), and its hash (SHA-256 hex, as Mog City reports it). */
export function storyOf(code?: string | null): { text: string; hash: string } | null {
  const p = packOf(code);
  if (!p) return null;
  const text = JSON.stringify(p);
  return { text, hash: createHash('sha256').update(text).digest('hex') };
}
/** "MOG CITY: <their title>": the runtime's lockup and the game's title on GameMog. */
export const episodeTitle = (pack: Pick<Pack, 'title'>) => `${MOG_CITY}: ${pack.title.episode}`;

/**
 * An episode module's own static check (in place of the runtime's: an episode is data, never run on the runtime): the
 * shape, the size, strict JSON, and the pack against the schema and the base pack (validatePack).
 */
export function checkEpisode(code: string): string[] {
  if (code.length > EPISODE_MAX) return [`The episode is ${Math.round(code.length / 1000)}KB; keep it under ${Math.round(EPISODE_MAX / 1000)}KB.`];
  if (!SHAPE.test(code)) return ['An episode is exactly GameMog.world({ episode: <the story pack as JSON> }); with nothing else in the module.'];
  const p = packOf(code);
  if (!p) return ['The episode\'s story pack is not valid JSON (strict JSON: double quotes, no comments, no trailing commas).'];
  const b = episodeBase(), v = validatePack(p, b.pack, b.limits) as { ok: boolean; errors: string[] };
  return v.ok ? [] : v.errors.slice(0, 20).map((e) => `The story pack breaks the schema at ${e}.`);
}

/* ------------------------------------------------- what a Mog changed -- */
export type Changed = { at: string; text: string };
/** Every text a pack holds, by its place: the title, the names, each cast name, each line and each copy entry. */
function texts(p: Pack): Map<string, string> {
  const out = new Map<string, string>();
  out.set('/title/episode', p.title?.episode ?? '');
  for (const [k, v] of Object.entries(p.names ?? {})) out.set(`/names/${k}`, String(v));
  for (const [k, c] of Object.entries(p.cast ?? {})) out.set(`/cast/${k}/name`, String(c?.name ?? ''));
  for (const [k, l] of Object.entries(p.lines ?? {})) out.set(`/lines/${k}`, String(l?.[1] ?? ''));
  for (const [k, t] of Object.entries(p.copy ?? {})) out.set(`/copy/${k}`, String(t));
  return out;
}
/** The texts a pack changed against its parent's (the inherited ones are never judged again). */
export function changedStrings(pack: Pack, parent: Pack): Changed[] {
  const was = texts(parent), out: Changed[] = [];
  for (const [at, text] of texts(pack)) if (was.get(at) !== text) out.push({ at, text });
  return out;
}
/** What a pack changed against the default pack, for its page and its creator: lines rewritten (read by the browser's voice) and kept (their recordings). */
export function changeReport(pack: Pack) {
  const b = episodeBase().pack, lines = Object.keys(b.lines);
  const rewritten = lines.filter((id) => pack.lines?.[id]?.[1] !== b.lines[id][1]).length;
  const renamed = Object.keys(b.cast).filter((id) => pack.cast?.[id]?.name !== b.cast[id].name).length;
  const copy = Object.keys(b.copy).filter((id) => pack.copy?.[id] !== b.copy[id]).length;
  return { lines: lines.length, rewritten, kept: lines.length - rewritten, renamed, copy };
}

/* --------------------------------------------------------------- words -- */
/**
 * The old game's names, never to be mentioned in Mog City (the owner): SHA-256 of each normalised word or phrase
 * (lower case, everything but letters and digits a space; a phrase also with its spaces taken out), so the public repo
 * holds no plaintext. A text is matched on every run of one to three of its words, as written and run together.
 */
export const NEVER_HASHES = [
  '7327d4d86dcf6bd569c05303ab188992c7ed923898b393c1cddf63973d7245ff', 'f88d1e5ca5e2b109e8d3d0c0e18a502e5746c6077df64644694f74a580df98e7',
  'dc7796d0e5b3b4895327d14e2aaaaede3b3fb79807dd0520824d042ae98c257e', '74f4465e33524366a8b9192634ef68370fb5da8de46dd8cdbf91735f20bf4444',
  'a50128d59f482a86171394eb7a2d1824df7c5d2788c4b2cbc5600ead757d5fd9', '3be0e6fa29e179d84ac9174fdd9c9a17426206ca3e404da927b4c9ab16c139bf',
  'e0f815fb33ac48cfabd072f1364bcc09aa9af1156142a67aec0aa7cb1f577431', '21a301158facee68e37d903ae15451a3bdd947c63f47a0495a229821de950039',
  '94c5a029ed5b75fc7896ed0aa8ebd50b7142a66b6dc046f5009fbce31d0fc3ba',
];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/** Whether a text mentions a name the list (NEVER_HASHES, or `list` in a check) holds. Leetspeak digits read as letters too. */
export function neverMentioned(text: string, list: readonly string[] = NEVER_HASHES): boolean {
  const set = new Set(list);
  const plain = text.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  for (const form of [plain, plain.replace(/[0134578@$]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's' })[c] ?? c)]) {
    const w = form.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) {
      const g = w.slice(i, i + n);
      if (set.has(sha(g.join(' '))) || (n > 1 && set.has(sha(g.join(''))))) return true;
    }
  }
  return false;
}

/** The changed texts' words (and the game's own title, tagline and blurb), against the platform's rules: what to send back. */
export function wordProblems(changed: Changed[], extra: string[] = []): string[] {
  const out: string[] = [];
  const all = [...changed, ...extra.map((text, i) => ({ at: `/meta/${i}`, text }))];
  const blocked = all.filter((c) => isBlocked(c.text)).map((c) => c.at);
  if (blocked.length) out.push(`These texts carry words GameMog does not allow (slurs, abuse or sexual words): ${blocked.slice(0, 8).join(', ')}. Rewrite them.`);
  const never = all.filter((c) => neverMentioned(c.text)).map((c) => c.at);
  if (never.length) out.push(`These texts name something Mog City never mentions: ${never.slice(0, 8).join(', ')}. Use other words.`);
  const reserved = changed.filter((c) => /^\/cast\/[a-z]+\/name$/.test(c.at) && isReserved(c.text)).map((c) => c.at);
  if (reserved.length) out.push(`These names read as GameMog's own (GameMog, Admin, Official...): ${reserved.join(', ')}. Pick other names.`);
  return out;
}

/* ------------------------------------------------- real people, consent -- */
/**
 * The creator's consent for real people (the owner, 3 Nov: "real people allowed with consent, including public figures,
 * when it is them or they agreed"): the names, the basis (it is them, or they have the person's permission), and the
 * confirmation that each is an adult and nothing in the Mog presents something false and damaging about them as true.
 * Kept in the game's meta (never the creator's browser id, which is the games row's private creator_player).
 */
export type Consent = { names: string[]; basis: 'self' | 'permission'; adult: true; at: number };
export const CONSENT_MAX_NAMES = 3;
const nameRe = /^[\p{L}][\p{L}\p{M} .'-]{1,39}$/u;
/** The consent the composer sent, read for what it must be: null when there is none, an error the page can say. */
export function readConsent(input: unknown, now = Date.now()): { ok: true; consent: Consent | null } | { ok: false; error: string } {
  if (input == null || input === false) return { ok: true, consent: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'The consent did not come through.' };
  const o = input as Record<string, unknown>;
  const names = (Array.isArray(o.names) ? o.names : []).filter((x): x is string => typeof x === 'string')
    .map((s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!names.length) return { ok: false, error: 'Name the real person your Mog names.' };
  if (names.length > CONSENT_MAX_NAMES) return { ok: false, error: `Up to ${CONSENT_MAX_NAMES} real people in one Mog.` };
  if (!names.every((n) => nameRe.test(n))) return { ok: false, error: 'Write each name in letters (2 to 40).' };
  if (names.some((n) => isBlocked(n) || isReserved(n))) return { ok: false, error: 'Pick another name.' };
  if (o.basis !== 'self' && o.basis !== 'permission') return { ok: false, error: 'Say whether you are this person or have their permission.' };
  if (o.adult !== true) return { ok: false, error: 'Confirm they are an adult and nothing in it is false and damaging about them.' };
  return { ok: true, consent: { names: [...new Set(names)], basis: o.basis, adult: true, at: now } };
}
const tokens = (s: string) => s.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 1);
/** Whether a real person found in a Mog is one the creator consented for: one's words all within the other's ("Musk" in "Elon Musk"). */
export function consented(person: string, consent: Consent | null | undefined): boolean {
  const p = tokens(person);
  if (!p.length || !consent) return false;
  return consent.names.some((n) => { const c = tokens(n); return c.length > 0 && (p.every((t) => c.includes(t)) || c.every((t) => p.includes(t))); });
}
/** What to send back for the real people and brands a Mog names (the builder's own list and the check's, together). */
export function realNameProblems(found: { people: string[]; brands: string[] }, consent: Consent | null | undefined): string[] {
  const out: string[] = [];
  const brands = [...new Set(found.brands.map((b) => b.trim()).filter(Boolean))];
  if (brands.length) out.push(`Real companies, brands and products are never named in a Mog (found: ${brands.slice(0, 6).map((b) => `"${b}"`).join(', ')}): give each an original name of the city's own, and keep every inherited name exactly as it is.`);
  const people = [...new Set(found.people.map((p) => p.trim()).filter(Boolean))].filter((p) => !consented(p, consent));
  if (people.length) out.push(`Real people are named only with their consent, and the creator gave it for ${consent?.names.length ? consent.names.map((n) => `"${n}"`).join(', ') : 'nobody'} (found: ${people.slice(0, 6).map((p) => `"${p}"`).join(', ')}): give anyone else an original name.`);
  return out;
}

/** The instruction for the independent check of real names (the builder's own list is not taken on its word). */
export const NAMES_CHECK_SYSTEM = 'You check text written for a video game. List every real person (living or dead, public figure or not) and every real company, brand, product, team or organisation that the texts name or clearly refer to. Fictional characters, invented names, ordinary words and generic places (a city, a street, a park) do not count. A name that is also an ordinary first name counts only when the text clearly means a real, specific person. Reply with one JSON object and nothing else: {"people": ["..."], "brands": ["..."]}.';
/** The check's turn: the changed texts, numbered, as they will be shown (tokens such as {jane} are the cast's names). */
export function namesCheckTurn(changed: Changed[], pack: Pack) {
  const cast = Object.entries(pack.cast).map(([id, c]) => `{${id}} = ${c.name}`).join(', ');
  const names = Object.entries(pack.names).map(([k, v]) => `{${k}} = ${v}`).join(', ');
  return `Tokens in braces are filled in by the game: ${cast}; ${names}.\n\nThe texts:\n${changed.slice(0, 600).map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`;
}
/** The check's reply, read for what it must be. */
export function readNamesCheck(text: string): { people: string[]; brands: string[] } | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 80)).slice(0, 40);
    return { people: arr(o.people), brands: arr(o.brands) };
  } catch { return null; }
}

/* ------------------------------------------------------------- the gate -- */
type Parent = { format: string; code?: string | null; meta?: string | null };
/** Whether a Mog's original is a Mog City episode. */
export const isEpisodeParent = (parent?: Parent | null) => !!parent && parent.format === 'world' && isEpisodeWorld(parent.code);

/**
 * What a pass gets wrong of an episode's kind and words (as gpKindProblems for a Grand Prix): an episode is made only
 * as a Mog of one, and a Mog of one stays one; its pack passes the schema against the base; the texts it changed
 * against its parent's pass the platform's words, the never-mention list, and (the title, tagline and blurb too) the
 * same. The real-name rules need the check's model call: realNameProblems, from the build.
 */
export function episodeKindProblems(code: string, mog?: { parent: Parent }, meta?: { title?: string; tagline?: string; blurb?: string }): string[] {
  const is = isEpisodeWorld(code), parent = isEpisodeParent(mog?.parent), out: string[] = [];
  if (is && !parent) return ['A Mog City episode (episode: { ... }) is only made as a Mog of one; build the closest world of the other kinds instead.'];
  if (parent && !is) return ['This is a Mog of a Mog City episode, and it stays one: reply with its story pack, as the original\'s.'];
  if (!is) return out;
  out.push(...checkEpisode(code));
  if (out.length) return out;
  const pack = packOf(code)!, was = packOf(mog!.parent.code) ?? episodeBase().pack;
  out.push(...wordProblems(changedStrings(pack, was), [meta?.tagline ?? '', meta?.blurb ?? '']));
  return out;
}

/** Cast names in the order the page lists them (the hero first), for the game's meta.cast (at most 8). */
export function episodeCast(pack: Pack) {
  const order: [string, string, string][] = [['dan', '#E7E7E3', 'player'], ['jane', '#4C8DFF', 'ally'], ['mrbig', '#C9A227', 'boss'], ['gears', '#E07B39', 'ally'], ['fiona', '#D9467A', 'ally'], ['knox', '#3B3F4A', 'rival'], ['mack', '#5A6270', 'rival'], ['moon', '#B08A5A', 'dog']];
  return order.filter(([id]) => pack.cast[id]).map(([id, color, role]) => ({ name: String(pack.cast[id].name).slice(0, 24), color: id === 'dan' ? pack.car.paint : color, role }));
}
/** The speaker ids the pack's lines may use (Mog City's CAST), for the manual. */
export const EPISODE_CAST = CAST as Record<string, string>;
