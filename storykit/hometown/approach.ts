/**
 * Hometown: can a player get to a town's place, and to which part of it (the owner, 14 Nov: "putting rings inside
 * buildings does not work especially since you can NOT enter buildings on the platform"). Every place a mission sends
 * the player must be outdoors, on ground a person (a car, for a car's step) can stand on, and reachable from the
 * streets. Mog City holds a story to it in its test drive (MogCity wagmi/storyrun/reach.js); this is the Story Kit's
 * side, before and after that drive:
 *
 *   approachOf(place)     'foot': a person can walk up to its middle (cx, cz) | 'car': only its street front, its lane
 *                         point (x, z), is outdoors: a parking structure whose middle is inside a building | 'none': a
 *                         test drive found it unreachable. The town's own data says so when it can (place.approach, the
 *                         compiler's: the hook for its own reach flags); else a guess from what it is and how far its
 *                         middle is from its street (STRUCTURE kinds, CENTRE_FAR m), else 'foot'.
 *   targetsOf(pack)       every step that sends the player to a place: its mission, step, kind, the pack's key and
 *                         whether it is held at the place's middle (an on-foot search, a collect, a tow: Mog City's runner
 *                         holds those at cx, cz) or at its street front (a drive's end, a walk, a fight, a person stood up)
 *   approachProblems(pack, pkg)   what the gate sends back to the builder: a step at a place it cannot be played at
 *   withUnreachable(pkg, ids)     the package with those places marked 'none' (what test drives found: lib/storykit-reach.ts)
 *   swapPlace(pack, reach, pkg, gate)   the builder's own fix for a drive's reach failure: the failed step's place swapped
 *                         for the nearest reachable place of the same kind the gate passes, or null (none: the builder is
 *                         asked to pick another place, the drive's reason says so)
 *
 * Pure functions: no network, no database, no model.
 */
import type { CityPackage, PackagePlace } from './city-package.ts';
import { classify, displayName } from './safety.ts';

export type Approach = 'foot' | 'car' | 'none';
/** The kinds whose middle may be a structure's inside (a parking garage under a tower): judged by CENTRE_FAR. */
export const STRUCTURE = /(^|_)(parking|garage|car_park|multi_storey|parking_garage|parking_entrance)(_|$)/;
/** m: a structure kind's middle farther than this from its street front is taken to be inside it. */
export const CENTRE_FAR = 15;

/** How a player reaches a place (see the header). */
export function approachOf(p: Pick<PackagePlace, 'kind' | 'x' | 'z' | 'cx' | 'cz' | 'approach'>): Approach {
  if (p.approach === 'foot' || p.approach === 'car' || p.approach === 'none') return p.approach;
  if (Number.isFinite(p.cx) && Number.isFinite(p.cz) && STRUCTURE.test(p.kind) && Math.hypot((p.cx as number) - p.x, (p.cz as number) - p.z) > CENTRE_FAR) return 'car';
  return 'foot';
}

/** A test drive's finding: an id alone is unreachable ('none'); [id, 'car'] reachable only at its street front. */
export type Mark = string | [string, 'car' | 'none'];
/** The package with these places marked (a copy; 'none' wins over 'car', and neither ever loosens the town's own flag). */
export function withUnreachable(pkg: CityPackage, marks: Iterable<Mark>): CityPackage {
  const m = new Map<string, 'car' | 'none'>();
  for (const x of marks) { const [id, a] = typeof x === 'string' ? [x, 'none' as const] : x; if (m.get(id) !== 'none') m.set(id, a); }
  if (!m.size) return pkg;
  const rank = { foot: 0, car: 1, none: 2 } as const;
  return { ...pkg, places: pkg.places.map((p) => { const a = m.get(p.id); return a && rank[a] > rank[approachOf(p)] ? { ...p, approach: a } : p; }) };
}
/** What a drive's reach failure says of its place: a step held at the place's middle that failed leaves its street front
 *  playable ('car'); a step at the street front that failed, nothing ('none'). */
export const markOf = (pack: PackV2, r: { mission: string; at?: string; place?: string; type?: string | null }): [string, 'car' | 'none'] | null => {
  if (!r.place) return null;
  const centre = !!r.at && targetsOf(pack).some((t) => t.mission === r.mission && t.key === r.at && t.centre && (!r.type || t.type === r.type));
  return [r.place, centre ? 'car' : 'none'];
};

type PackV2 = Record<string, any>;
export type Target = { mission: string; step: number; at: string; type: string; key: string; centre: boolean; label?: string };
const keyOf = (v: unknown): string | null => (typeof v === 'string' ? (/^@([a-z0-9][a-z0-9_-]{0,39})$/.exec(v)?.[1] ?? null) : v && typeof v === 'object' && !Array.isArray(v) && typeof (v as any)['@'] === 'string' ? (v as any)['@'] : null);
/** Every step that sends the player somewhere, with the pack's key of the place (an alias or the town's own key). */
export function targetsOf(pack: PackV2): Target[] {
  const out: Target[] = [];
  for (const a of pack.acts ?? []) for (const m of a?.missions ?? []) {
    const each = (s: PackV2, i: number, at: string) => {
      if (!s || typeof s !== 'object') return;
      const add = (v: unknown, centre: boolean, sub = '') => { const k = keyOf(v); if (k) out.push({ mission: m.id, step: i, at: `${at}${sub}`, type: s.type, key: k, centre, ...(typeof s.label === 'string' ? { label: s.label } : {}) }); };
      switch (s.type) {
        // (a search of the ride is held at the car wherever it is parked; any other at the place's middle)
        case 'search': add(s.at, !(s.on === 'ride' || (s.part && s.on !== 'place')), '.at'); break;
        case 'walk': add(s.to, false, '.to'); break;
        case 'drive': for (const [j, t] of [].concat(s.to ?? []).entries()) add(t, false, `.to${Array.isArray(s.to) ? `[${j}]` : ''}`); break;
        // (the story's horse: he stands on the place's footpath side, and a ride ends at its front, as a drive's does)
        case 'mount': add(s.at, false, '.at'); break;
        case 'ride': for (const [j, t] of [].concat(s.to ?? []).entries()) add(t, false, `.to${Array.isArray(s.to) ? `[${j}]` : ''}`); break;
        case 'stops': for (const [j, t] of (s.stops ?? []).entries()) add(t, false, `.stops[${j}]`); break;
        case 'pursuit': case 'roadblock': add(s.to, false, '.to'); break;
        case 'fight': add(s.arena, false, '.arena'); add(s.crewAt, true, '.crewAt'); break;
        case 'npc': if (!(s.at && s.at.rel)) add(s.at, false, '.at'); break;
        case 'place': add(s.at, false, '.at'); break;
        case 'collect': for (const [j, t] of (s.items ?? []).entries()) add(t, true, `.items[${j}]`); break;
        case 'tow': add(s.target, true, '.target'); add(s.to, false, '.to'); break;
      }
      for (const [j, x] of (s.during ?? []).entries()) each(x, i, `${at}.during[${j}]`);
    };
    const M = `mission ${m.id}`;
    { const k = keyOf(m.start); if (k) out.push({ mission: m.id, step: -1, at: `${M}.start`, type: 'start', key: k, centre: false }); }
    (m.steps ?? []).forEach((s: PackV2, i: number) => each(s, i, `${M}.steps[${i}]`));
  }
  return out;
}
const placeIdOf = (pack: PackV2, key: string) => (pack.places?.[key]?.['@'] as string | undefined) ?? key;

/** What a step at a place it cannot be played at gets sent back to the builder. */
export function approachProblems(pack: PackV2, pkg: CityPackage): string[] {
  const by = new Map(pkg.places.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const t of targetsOf(pack)) {
    const p = by.get(placeIdOf(pack, t.key)); if (!p) continue;
    const a = approachOf(p), what = t.type === 'search' ? `the search${t.label ? ` "${t.label}"` : ''}` : t.type === 'start' ? 'the mission\'s start' : `the ${t.type}`;
    if (a === 'none') out.push(`${t.at}: @${t.key} (${p.name}) could not be reached by a player in a test drive (no player can get there, and buildings cannot be entered): send ${what} to another place.`);
    else if (a === 'car' && t.centre) out.push(`${t.at}: ${what} is held at the middle of @${t.key} (${p.name}), a parking structure whose middle is inside a building, where nobody can stand: hold it at a place with open ground (a lot, a park, a corner, a dock)${t.type === 'search' ? ', or make it a search of the ride ("on": "ride")' : ''}.`);
  }
  return out;
}

export type Reach = { mission: string; step: number; type?: string | null; at?: string; place?: string; kind?: string; why?: string };
export type Swap = { mission: string; alias: string; from: string; to: string; name: string; kind: string; how: 'alias' | 'mission' };
/**
 * A drive's reach failure fixed the builder's way: the failed step's place (reach.at, the pack's key; reach.place, the
 * town's) swapped for the nearest place of the same kind a player can reach (approachOf: 'foot' for a step held at a
 * place's middle, else not 'none'), not a home, not the same, and passing `gate` (the hometown gate: the safety rules,
 * the spawn district) with it. A pack alias is repointed (every mission naming it then goes there: the story's one
 * place); a key named directly is swapped in the failed mission only. Null when no place will do.
 */
export function swapPlace(pack: PackV2, reach: Reach, pkg: CityPackage, gate: (p: PackV2) => boolean): { pack: PackV2; swap: Swap } | null {
  const key = reach.at; if (!key) return null;
  const alias = !!pack.places?.[key] && typeof pack.places[key]['@'] === 'string';
  const from = reach.place ?? placeIdOf(pack, key);
  const old = pkg.places.find((p) => p.id === from); if (!old || old.kind === 'arrival') return null;
  const centre = targetsOf(pack).some((t) => t.mission === reach.mission && t.key === key && t.centre);
  const used = new Set(Object.values(pack.places ?? {}).map((a: any) => a?.['@']).concat(targetsOf(pack).map((t) => placeIdOf(pack, t.key))));
  const cands = pkg.places
    .filter((p) => p.id !== from && p.kind === old.kind && displayName(p) !== null && !classify(p).residence && !p.astray)
    .filter((p) => { const a = approachOf(p); return a !== 'none' && (!centre || a === 'foot'); })
    .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || Math.hypot(a.x - old.x, a.z - old.z) - Math.hypot(b.x - old.x, b.z - old.z));
  for (const c of cands.slice(0, 16)) {
    const next = JSON.parse(JSON.stringify(pack)) as PackV2;
    if (alias) next.places[key]['@'] = c.id;
    else {
      // (the town's own key named in the failed mission: every ref to it there, "@key" or { "@": key }, goes to the new one)
      const m = (next.acts ?? []).flatMap((a: PackV2) => a?.missions ?? []).find((x: PackV2) => x.id === reach.mission); if (!m) return null;
      const swapRefs = (v: any): any => (typeof v === 'string' ? (v === `@${key}` ? `@${c.id}` : v) : Array.isArray(v) ? v.map(swapRefs)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === '@' && x === key ? c.id : swapRefs(x)])) : v);
      m.start = swapRefs(m.start); m.steps = swapRefs(m.steps);
    }
    if (gate(next)) return { pack: next, swap: { mission: reach.mission, alias: key, from, to: c.id, name: displayName(c) ?? c.name, kind: c.kind, how: alias ? 'alias' : 'mission' } };
  }
  return null;
}
