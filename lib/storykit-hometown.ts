/**
 * Hometown: the Story Kit builder grounded in a real town (Hometown Build Spec v1, "builder reads package places").
 * The prompt and context assembly for a story set in a town compiled from open data, and the check of each pass,
 * with no model call here: generateStorykit's loop (lib/storykit-build.ts) is what calls the model, and wiring a
 * hometown into it (the route, the store, the runner) is a later step. Until then nothing reaches this file from a
 * request, so no world on the site builds or plays differently.
 *
 *   hometownPlaceList(pkg)        the town as the builder reads it: its places by "@key" (homes left out, businesses by
 *                                 a generic descriptor, sensitive places marked), its districts, landmarks, arrivals
 *                                 and roads, and the real-place rules
 *   hometownSystem(pkg)           the builder's system prompt with the town in place of New York's place list
 *   hometownTurn(prompt, pkg, m)  the first turn: a Create in the town, or a Mog of a hometown world (the town locked)
 *   checkHometownReply(text, o)   one pass checked: the two blocks read, the platform's fields (the town's base, or the
 *                                 parent's on a Mog), the hometown gate (gatePack with the town's table + the safety
 *                                 rules), and on a Create the builder's own rules
 */
import { storykitSystem, parseStorykitReply, builderProblems, CREATE_MISSIONS, type StorykitMeta } from './storykit-build';
import { mogBase, type PackV2 } from '../storykit/pack/gate.ts';
import { hometownBase, townName, type CityPackage } from '../storykit/hometown/city-package.ts';
import { classify, displayName, sensitiveWord, descriptor } from '../storykit/hometown/safety.ts';
import { gateHometown, type HometownResult } from '../storykit/hometown/hometown-gate.ts';

/** How many landmarks the builder reads (the rest are still the town's; a big city has over a thousand). */
export const LANDMARKS_SHOWN = 60;

export const REAL_PLACE_RULES = `## Real places: the rules (a hometown is a real town)

- **No violence at a sensitive place.** Schools and childcare, hospitals and clinics, places of worship, police and fire stations, memorials and cemeteries, and shelters (marked **sensitive** below) are never where a fight, a chase, a roadblock, lookouts, a crash or an explosion happens, and never a place in a mission that has any of those. A mission may pass by one, and a mission with no violence in it may go there (drop the medicine at the clinic). No line or label puts violence there either ("blow up the school" is refused, however it is said).
- **No private homes.** Homes are not on the list and are never a story place. Never write a street address (a house number and a street): name the corner or the place.
- **No real private people.** Every person is invented. Never name a real resident, owner or official.
- **No real businesses or brands.** A business is on the list by what it is ("the diner on Broadway", "the gas station on Highway 62"): call it that or give it an invented name of your own; never its real name or a chain's.`;

/** The town as the builder reads it. */
export function hometownPlaceList(pkg: CityPackage): string {
  const base = hometownBase(pkg);
  const rows: string[] = [];
  for (const p of pkg.places) {
    const c = classify(p), name = displayName(p);
    if (name === null) continue; // (a home: never offered)
    const notes = [p.kind.replace(/_/g, ' ')];
    if (p.district) notes.push(pkg.districts.find((d) => d.id === p.district)?.name ?? p.district);
    if (c.business) notes.push(`a business: call it ${descriptor(p)} or an invented name, never its real one`);
    if (c.sensitive) notes.push(`**sensitive** (${sensitiveWord(c.sensitive)}): pass by or visit in a mission with no violence, never a target`);
    if (p.foot) notes.push('foot: off the lanes, walk there');
    rows.push(`- @${p.id}: ${name} (${notes.join('; ')})`);
  }
  const lm = pkg.landmarks.filter((l) => displayName(l) !== null && !classify(l).business).slice(0, LANDMARKS_SHOWN)
    .map((l) => `${displayName(l)}${classify(l).sensitive ? ' (sensitive)' : ''}`);
  const spawns = pkg.spawnPoints.map((s) => `@${s.id}`).filter((k) => pkg.places.some((p) => `@${p.id}` === k));
  return `## ${townName(pkg)}: the town's place list (base exactly ${JSON.stringify(base)})

${townName(pkg)} is a real town, built for the game from open map data (compiler ${pkg.compilerVersion}). Every place a pack names is one of these keys ("@key"), or the pack's own alias of one; never invent a key. A key here replaces Mog City's New York list: BUILDER.md's New York examples ("@les", "@foley") are not places in ${pkg.name}.

${rows.join('\n')}

Parts of town: ${pkg.districts.map((d) => d.name).join(', ') || 'none named'}.
Arrivals (a good Mission 1 start or opening place): ${spawns.join(', ') || 'any place on the lanes'}.
Landmarks (words only, for lines and labels; not keys): ${lm.join('; ') || 'none'}${pkg.landmarks.length > lm.length ? ` (and ${pkg.landmarks.length - lm.length} more not listed)` : ''}.
Roads: ${pkg.roadsSummary.streets} named streets, ${pkg.roadsSummary.km} km; the main ones: ${pkg.roadsSummary.main.join(', ')}.
Named camera points: none (use a place, the player or a cast member).

${REAL_PLACE_RULES}`;
}

/** The builder's system prompt for a story in this town. */
export function hometownSystem(pkg: CityPackage): string {
  const s = storykitSystem('ny', hometownPlaceList(pkg));
  const from = "Mog City's open-world New York";
  if (!s.includes(from)) throw new Error('storykitSystem no longer names Mog City\'s New York in its first line; update hometownSystem');
  return s.replace(from, `Mog City's engine playing ${townName(pkg)}, a real US town built from open map data`);
}

const IN_TOWN = (pkg: CityPackage) => `The story happens in ${townName(pkg)}, not New York: wherever BUILDER.md says New York, read ${pkg.name}, and every on-screen word places the story here.`;

/** The first turn: a Create in the town, or a Mog of a hometown world (its town locked: only the game, people and missions change). */
export function hometownTurn(prompt: string, pkg: CityPackage, mog?: { parent: PackV2; instruction: string }): string {
  if (mog) {
    const shown = { ...mog.parent }; delete shown.voices;
    return `MOG. The original: "${mog.parent.title}". It is set in ${townName(pkg)}, and a Mog keeps that town exactly: its base is ${JSON.stringify(mogBase(mog.parent.base))} (the same place, compiler version and tile set). The town is locked; rewrite only the game, the characters and the missions.

Its complete story pack:

\`\`\`json
${JSON.stringify(shown)}
\`\`\`

The challenger's idea:

${mog.instruction}

${IN_TOWN(pkg)} Start from the original's pack and change what the idea asks for; every place stays one of the town's keys, under the real-place rules. Reply with the two blocks.`;
  }
  return `CREATE A WORLD in ${townName(pkg)}. The creator picked ${townName(pkg)} and wrote:

${prompt}

Its base is exactly ${JSON.stringify(hometownBase(pkg))}. ${IN_TOWN(pkg)} Write a new story pack: ${CREATE_MISSIONS.min} to ${CREATE_MISSIONS.max} missions in 1 to 3 acts in the town's real places, its own cast, rides and voices, a title of its own that never names Mog City, and an opening that sets the place, brings on the hero and the antagonist with name cards and says the premise before Mission 1. Hold to the real-place rules. Reply with the two blocks.`;
}

/** The platform's fields on a hometown pass: the id, the parent (a Mog's), the town's base (a Mog: the parent's, locked). */
export function hometownFields(pack: PackV2, id: string, pkg: CityPackage, parent?: PackV2 | null): string[] {
  pack.id = id;
  if (parent) pack.parent = parent.id; else delete pack.parent;
  const want = parent ? mogBase(parent.base) : hometownBase(pkg);
  if (pack.base == null) { pack.base = JSON.parse(JSON.stringify(want)); return []; }
  return JSON.stringify(sortKeys(pack.base)) === JSON.stringify(sortKeys(want)) ? [] : [parent
    ? `base: a Mog keeps its parent's town exactly, ${JSON.stringify(want)}, not ${JSON.stringify(pack.base)}. The town is locked: carry the idea into ${townName(pkg)}.`
    : `base: the creator picked ${townName(pkg)}, so the base is exactly ${JSON.stringify(want)}, not ${JSON.stringify(pack.base)}.`];
}
const sortKeys = (o: unknown): unknown => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys((o as Record<string, unknown>)[k])])) : o);

export type HometownPass = { problems: string[]; meta?: StorykitMeta; pack: PackV2 | null; gated: HometownResult | null };
/**
 * One builder pass in a town, checked: what the build loop would send back (problems) or keep (pack). The real-name
 * check the build loop runs after this (a model call, lib/storykit-build.ts checkNames) is not run here.
 */
export function checkHometownReply(text: string, o: { pkg: CityPackage; id: string; parent?: PackV2 | null }): HometownPass {
  const { meta, pack: raw, problems } = parseStorykitReply(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: raw ? [...problems, 'The story pack is not a JSON object.'] : problems, meta, pack: null, gated: null };
  problems.push(...hometownFields(raw, o.id, o.pkg, o.parent));
  const gated = gateHometown(raw, o.pkg, { parent: o.parent ?? null, meta });
  problems.push(...gated.problems);
  // the builder's own rules on a Create (6 to 9 missions, the opening, Mission 1's payoff, no em dash ...); a Mog's are
  // held to its parent by the gate's framework rule
  if (!o.parent) problems.push(...builderProblems(raw, {}, meta));
  return { problems, meta, pack: problems.length ? null : gated.pack, gated };
}
