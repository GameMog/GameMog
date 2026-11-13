/**
 * Hometown: the gate for a hometown story pack (base.city 'hometown'). gateHometown(pack, pkg, { parent }) is gatePack
 * (storykit/pack/gate.ts) with the town's table in place of cities.ts's static lists (rule 16: every "@key" is one of
 * the package's places, the town pinned exactly, a Mog keeping its parent's pin), plus the real-place safety rules
 * (safety.ts): no violence at a sensitive place, no private home, no address, no real business or private name.
 *
 * "A story plan" here is the pack's places as the missions use them: storyPlan(pack) lists every place a pack names,
 * where, in which mission and in what role (target: a fight, chase, roadblock, lookouts or patrol is set there; visit:
 * the hero goes there; scene: a camera or a backdrop looks at it).
 */
import { gatePack, type GateResult, type PackV2 } from '../pack/gate.ts';
import type { CityTable, Place } from '../pack/cities.ts';
import { packageProblems, cityLock, cityBuildOf, type CityPackage } from './city-package.ts';
import { classify, displayName, safetyProblems, type Ref } from './safety.ts';

/** The step kinds that make a mission violent, and whose own places are targets. */
export const VIOLENT_STEPS = new Set(['fight', 'pursuit', 'roadblock', 'stealth', 'patrol']);
export const VIOLENT_VERBS = new Set(['fight', 'ram', 'escape', 'chase']);
/** Keys under which a place is only looked at (a camera, a backdrop), never gone to. */
const SCENE_KEYS = new Set(['shots', 'cam', 'to_cam', 'look', 'lookTo', 'backdrop', 'shot']);

/** The town's table for the gate: its places (homes left out: never offered, refused when named), build and lock. */
export function cityTableOf(pkg: CityPackage): CityTable {
  const places: Record<string, Place> = {};
  for (const p of pkg.places) {
    const name = displayName(p);
    if (name === null) continue;
    places[p.id] = p.foot ? { name, foot: true } : { name };
  }
  return { name: `${pkg.name}, ${pkg.state}`, places, camPoints: [], builds: [cityBuildOf(pkg)], lock: cityLock(pkg), self: [pkg.name, `${pkg.name}, ${pkg.state}`] };
}

const stepsOf = (steps: PackV2[] = []): PackV2[] => steps.flatMap((s) => [s, ...stepsOf(s?.during), ...stepsOf(s?.do)]);
/** The missions with a fight, chase, roadblock, lookouts or patrol (or a violent verb). */
export function violentMissions(pack: PackV2): Set<string> {
  const out = new Set<string>();
  for (const m of (pack.acts ?? []).flatMap((a: PackV2) => a?.missions ?? [])) {
    if (stepsOf(m.steps).some((s) => VIOLENT_STEPS.has(s?.type)) || (m.verbs ?? []).some((v: string) => VIOLENT_VERBS.has(v))) out.add(m.id);
  }
  return out;
}

/** Every place a pack names: { key, at, mission, role }. */
export function storyPlan(pack: PackV2): Ref[] {
  const refs: Ref[] = [];
  const walk = (v: unknown, at: string, mission: string | null, role: Ref['role']) => {
    if (typeof v === 'string') { const m = /^@([a-z0-9][a-z0-9_-]{0,39})$/.exec(v); if (m) refs.push({ key: m[1], at, mission, role }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${at}[${i}]`, mission, role)); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o['@'] === 'string') refs.push({ key: o['@'], at, mission, role });
    for (const [k, x] of Object.entries(o)) {
      if (k === '@') continue;
      if (k === 'face' && typeof x === 'string') { refs.push({ key: x, at: `${at}.face`, mission, role: 'scene' }); continue; }
      walk(x, `${at}.${k}`, mission, SCENE_KEYS.has(k) ? 'scene' : role);
    }
  };
  for (const a of pack.acts ?? []) for (const m of a?.missions ?? []) {
    const M = `mission ${m.id}`;
    walk(m.start, `${M}.start`, m.id, 'visit');
    (m.steps ?? []).forEach((s: PackV2, i: number) => {
      const each = (st: PackV2, at: string) => {
        const { during, do: side, ...own } = st ?? {};
        walk(own, at, m.id, VIOLENT_STEPS.has(st?.type) ? 'target' : 'visit');
        (during ?? []).forEach((d: PackV2, j: number) => each(d, `${at}.during[${j}]`));
        (side ?? []).forEach((d: PackV2, j: number) => each(d, `${at}.do[${j}]`));
      };
      each(s, `${M}.steps[${i}]`);
    });
  }
  if (pack.opening) walk(pack.opening, 'opening', null, 'scene');
  return refs;
}

/** Keys whose strings are not words a player reads or hears (ids, enums, references, colours). Not here, though they
 * hold enums or references too: 'fail' (an end step's fail line is the MISSION FAILED text), 'stops' and 'units' (a
 * stop's and a lookout's `name` are on screen); their enum values ('hard', 'police') and "@key"s are skipped by the walk. */
const NOT_TEXT = new Set(['id', 'type', '@', 'face', 'if', 'goto', 'until', 'flag', 'clip', 'hash', 'status', 'cue', 'tag', 'value', 'silenceValue', 'fork',
  'rel', 'cam', 'look', 'to', 'lookTo', 'place', 'start', 'who', 'say', 'by', 'owner', 'vehicle', 'ride', 'hero', 'anchor', 'kokoro', 'stock', 'storykit',
  'parent', 'base', 'voices', 'blend', 'enemies', 'model', 'from', 'at', 'arena', 'target', 'near', 'route', 'area', 'verbs', 'kind',
  'family', 'class', 'time', 'season', 'weather', 'holiday', 'win', 'rules', 'mode', 'goal', 'roles', 'seat', 'format', 'unit', 'item', 'style',
  'color', 'colour', 'tone', 'undertone', 'body', 'frame', 'weight', 'muscle', 'jaw', 'eyes', 'stance', 'pace', 'car', 'lead', 'on', 'part', 'name_key']);
/** Every text of a pack a player reads or hears, with where it is. */
export function playerTexts(pack: PackV2): { at: string; text: string }[] {
  const out: { at: string; text: string }[] = [];
  const walk = (v: unknown, at: string, key: string) => {
    if (NOT_TEXT.has(key)) return;
    if (typeof v === 'string') { if (/[A-Za-z]/.test(v) && /\s|[A-Z]/.test(v) && !/^#[0-9a-f]{6}$/i.test(v) && !/^@/.test(v)) out.push({ at, text: v }); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k, k);
  };
  walk(pack, '', '');
  return out;
}

export type HometownResult = GateResult & { safety: string[]; plan: Ref[] };
/**
 * The hometown gate: the package read, gatePack with the town's table (rule 16), then the safety rules. A Mog passes its
 * parent: the town is then its parent's pin exactly (gate.ts), and the package given must be that same town.
 */
export function gateHometown(input: unknown, pkg: CityPackage, opts: { parent?: PackV2 | null; meta?: { tagline?: string; blurb?: string } } = {}): HometownResult {
  const bad = packageProblems(pkg);
  if (bad.length) return { ok: false, problems: bad.map((p) => `city package: ${p}`), warnings: [], clamped: [], pack: null, lines: [], safety: [], plan: [] };
  const gated = gatePack(input, { parent: opts.parent ?? null, city: cityTableOf(pkg) });
  const pack = (gated.pack ?? input) as PackV2;
  const plan = pack && typeof pack === 'object' ? storyPlan(pack) : [];
  const texts = pack && typeof pack === 'object' ? playerTexts(pack) : [];
  if (opts.meta?.tagline) texts.push({ at: 'meta.tagline', text: opts.meta.tagline });
  if (opts.meta?.blurb) texts.push({ at: 'meta.blurb', text: opts.meta.blurb });
  const safety = pack && typeof pack === 'object' ? safetyProblems({ pkg, refs: plan, violentMissions: violentMissions(pack), texts, aliases: pack.places ?? {} }) : [];
  const district = pack && typeof pack === 'object' ? districtProblems(pack, pkg, plan) : [];
  const problems = [...gated.problems, ...safety, ...district];
  return { ...gated, ok: problems.length === 0, problems, pack: problems.length ? null : gated.pack, safety, plan };
}

/**
 * The spawn-district rule (production builder, lock v3): a town is playable in its spawn district first while the rest
 * builds, so mission 1's places and the story's start must all be in it (inDistrict). Missions 2 and later may use any
 * place. A package from a whole town (lock v2) has no district: the rule does not apply.
 */
export function districtProblems(pack: PackV2, pkg: CityPackage, plan: Ref[] = storyPlan(pack)): string[] {
  if (pkg.lockVersion !== 3) return [];
  const first = (pack.acts ?? [])[0]?.missions?.[0]?.id as string | undefined;
  const aliases = (pack.places ?? {}) as Record<string, { '@'?: string }>;
  const by = new Map(pkg.places.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const r of plan) {
    const early = (first && r.mission === first) || (r.mission === null && /^(spawn|start)/.test(r.at));
    if (!early) continue;
    const id = aliases[r.key]?.['@'] ?? r.key, p = by.get(id);
    if (p && !p.inDistrict) out.push(`${r.at}: @${r.key} is outside the part of town built first; mission 1 and the start stay near the spawn (use a place marked near the start)`);
  }
  return out;
}

/** The package's places a plan names that do not exist (the gate refuses these too; this is the plan's own view). */
export function unknownPlaces(pack: PackV2, pkg: CityPackage): string[] {
  const ids = new Set(pkg.places.filter((p) => !classify(p).residence).map((p) => p.id)), aliases = pack.places ?? {};
  return storyPlan(pack).filter((r) => !ids.has(aliases[r.key]?.['@'] ?? r.key)).map((r) => `${r.at}: @${r.key}`);
}
