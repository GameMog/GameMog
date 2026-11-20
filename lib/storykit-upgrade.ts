import { createHash } from 'node:crypto';
import type { HometownLock } from '../storykit/pack/cities.ts';
import type { CityPackage, PackagePlace } from '../storykit/hometown/city-package.ts';
import { classify } from '../storykit/hometown/safety.ts';

/**
 * A hometown story pinned to an older build of its town (14 Nov: "The Courtesy Lane", published on the spawn district of
 * Bal Harbour at compiler 0.8.0, kept that district for ever: the 0.8.0 whole town was never built once the builder moved
 * to 0.10.0, so Mog City's growing.js polled /api/towns/<place>?build=<0.8.0> and was told 'district' every time, and the
 * story places outside the district window (wagmi/world/pkg.js: the window less 150 m) stayed "not found on the map").
 *
 * The upgrade: when the town's CURRENT build has its whole town (a 'full' bundle stored) and the story's pin is another
 * build, the story plays the current whole town, but only when that is safe:
 *   - the frame is the same (place, grid, domain, origin, k0, gamma0, yOffset, waterLevel: the lock fields that place a
 *     coordinate), so a mark of the story's own ({ at: [x, z] }) and every place stand where they stood;
 *   - the town's box is the same (boxMoved: its frame's playBox at both builds, else its tile set): the frame can stay
 *     while the box moves (compiler 0.14.0 keeps the origin and moves a capped town onto its downtown core, Oakland
 *     5.6 km), and no place check covers a mark of the story's own, which a moved box could leave off the map;
 *   - every place the world names ("@key" directly or through one of its aliases, world.places) is on the new map: the
 *     same id, the same kind, within MOVE_M of where the pinned build had it, and not a home. A place's id is the
 *     compiler's (kind + a counter), so a recompile may hand an id to another place: the kind and the spot say it is
 *     the same one. A changed name only is a note (the 0.10.0 compiler writes "96th St" where 0.8.0 wrote "96Th St").
 * Then the play page and growing.js's poll offer the current whole town with the world re-pinned to it (upgradedWorld:
 * the sealed world with `hometown` replaced, nothing else; content-addressed like every sealed world, kept as a file of
 * the world's store draft so it is never swept). Mog City's check (wagmi/storyrun/pack.js: the pin is the bundle's lock
 * field by field) is unchanged and passes: the pin IS the new lock.
 * Otherwise the story keeps its pinned build ('held', with why), and the owner may re-pin it (admin: lib/storykit-
 * publish.ts repinStoryWorld, which re-gates the pack against the new town's table before anything changes).
 *
 * Pure here (storyUpgradeWith and its helpers, with the store and the builder passed in: scripts/hometown-towns-check.ts);
 * the server's own reads are lib/storykit-publish.ts storyUpgrade.
 */

/** how far a place may have moved between builds and still be the same place (m; the compiler snaps to a lane within
 *  60 m, and a recompile of Bal Harbour moved its furthest place 12 m) */
export const MOVE_M = 30;
/** the lock fields that place a coordinate: equal, or no upgrade */
export const FRAME_KEYS = ['place', 'grid', 'domain', 'origin', 'k0', 'gamma0', 'yOffset', 'waterLevel'] as const;

type World = Record<string, any>;
const KEY = /^@([a-z0-9][a-z0-9_-]{0,39})$/;

/** A world's place references: every "@key" it names outside its own alias table, each resolved through that table to
 *  the package's place id ({ key, via, missions }), and the aliases that are marks of the world's own ({ at }). */
export function worldPlaces(world: World): { ids: Map<string, { via: Set<string>; missions: Set<string> }>; marks: string[]; unresolved: string[] } {
  const aliases = (world?.places && typeof world.places === 'object' ? world.places : {}) as Record<string, any>;
  const named = new Map<string, Set<string>>();   // the key as written -> the missions that name it
  const add = (k: string, m: string) => { if (!named.has(k)) named.set(k, new Set()); if (m) named.get(k)!.add(m); };
  const walk = (v: unknown, m: string, depth = 0) => {
    if (depth > 24) return;
    if (typeof v === 'string') { const x = KEY.exec(v); if (x) add(x[1], m); return; }
    if (Array.isArray(v)) { for (const y of v) walk(y, m, depth + 1); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o['@'] === 'string') add(o['@'], m);
    for (const [k, y] of Object.entries(o)) if (k !== '@') walk(y, m, depth + 1);
  };
  // (the people, the voice plan, the art and the car hold no places: only what plays is walked)
  for (const [k, v] of Object.entries(world ?? {})) {
    if (k === 'places' || k === 'voice' || k === 'cast' || k === 'art' || k === 'clips' || k === 'hometown') continue;
    if (k === 'missions' && Array.isArray(v)) { for (const mm of v) walk(mm, typeof mm?.id === 'string' ? mm.id : ''); continue; }
    walk(v, '');
  }
  const ids = new Map<string, { via: Set<string>; missions: Set<string> }>(), marks: string[] = [], unresolved: string[] = [];
  for (const [k, missions] of named) {
    const a = Object.prototype.hasOwnProperty.call(aliases, k) ? aliases[k] : null;
    let id: string | null = k;
    if (a && typeof a === 'object') {
      if (typeof a['@'] === 'string') id = a['@'].replace(/^@/, '');
      else if (Array.isArray(a.at)) { marks.push(k); id = null; }
      else { unresolved.push(k); id = null; }
    }
    if (!id) continue;
    const e = ids.get(id) ?? { via: new Set<string>(), missions: new Set<string>() };
    if (id !== k) e.via.add(k);
    for (const m of missions) e.missions.add(m);
    ids.set(id, e);
  }
  // (an alias the world defines but nothing names is still part of the story's map: checked too)
  for (const [k, a] of Object.entries(aliases)) {
    if (named.has(k) || !a || typeof a !== 'object') continue;
    if (typeof a['@'] === 'string') { const id = a['@'].replace(/^@/, ''); const e = ids.get(id) ?? { via: new Set<string>(), missions: new Set<string>() }; e.via.add(k); ids.set(id, e); }
    else if (Array.isArray(a.at)) marks.push(k);
  }
  return { ids, marks, unresolved };
}

/**
 * The places a world names that its town's spawn district does not have (16 Nov, Colter Land: Bozeman's whole town
 * failed to build, so its play page served the spawn district for good and 8 of the story's 14 places were "not found
 * on the map"). Each as the world says it (@alias (id)) with the package's name. A place the package does not have at
 * all is listed too; a mark of the world's own ({ at }) is not (it stands wherever the map is). Empty for a package with
 * no district (lock v2: the whole town or nothing).
 */
export function outsideDistrict(world: World, pkg: CityPackage): string[] {
  if (pkg.lockVersion !== 3) return [];
  const { ids } = worldPlaces(world);
  const by = new Map(pkg.places.map((p) => [p.id, p] as [string, PackagePlace]));
  const out: string[] = [];
  for (const id of [...ids.keys()].sort()) {
    const p = by.get(id);
    if (!p || !p.inDistrict) out.push(`${said(id, ids.get(id)!.via)}${p ? `: ${p.name}` : ''}`);
  }
  return out;
}

/** '' when two locks put a coordinate in the same spot (FRAME_KEYS), else the first field that differs. */
export function frameMoved(a: HometownLock | null | undefined, b: HometownLock | null | undefined): string {
  if (!a || !b) return 'lock';
  for (const k of FRAME_KEYS) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return k;
  return '';
}

/** A town's box at one build: the box the compiler built it over (its frame's playBox) and the tiles it pinned. */
export type TownBox = { playBox?: { gx0: number; gs0: number; gx1: number; gs1: number } | null; tiles?: string[] | null };
/**
 * '' when the town was built over the same box at both builds, else what differs. The frame (FRAME_KEYS) can stay while
 * the box moves (compiler 0.14.0 keeps the origin and moves a capped town's box onto its downtown core: Oakland 5.6 km),
 * and a mark of the story's own ({ at }) is checked by no place: a moved box could leave it off the map. The playBoxes
 * are compared when both builds carry one, else the tile sets; neither readable at either build: moved (nothing to compare).
 */
export function boxMoved(a: TownBox | null | undefined, b: TownBox | null | undefined): string {
  if (!a || !b) return `the town's box at the ${!a ? 'pinned' : 'current'} build cannot be read, so no spot of the story can be checked to be on the map`;
  if (a.playBox && b.playBox) {
    const k = (['gx0', 'gs0', 'gx1', 'gs1'] as const).find((x) => a.playBox![x] !== b.playBox![x]);
    if (!k) return '';
    const cx = (p: NonNullable<TownBox['playBox']>) => [(p.gx0 + p.gx1) / 2, (p.gs0 + p.gs1) / 2];
    const [ax, az] = cx(a.playBox), [bx, bz] = cx(b.playBox);
    return `the town's box moved between the builds (its centre ${(Math.hypot(ax - bx, az - bz) / 100000).toFixed(1)} km): a spot of the story's own could be off the new map`;
  }
  if (Array.isArray(a.tiles) && Array.isArray(b.tiles) && a.tiles.length && b.tiles.length) {
    const A = new Set(a.tiles), same = A.size === new Set(b.tiles).size && b.tiles.every((t) => A.has(t));
    return same ? '' : `the town's tiles changed between the builds (${A.size} -> ${new Set(b.tiles).size}): its box moved, and a spot of the story's own could be off the new map`;
  }
  return `the town's box at the ${a.playBox || a.tiles?.length ? 'current' : 'pinned'} build cannot be read, so no spot of the story can be checked to be on the map`;
}

export type PlaceCheck = { ok: boolean; why: string[]; notes: string[]; ids: string[] };
const said = (id: string, via: Set<string>) => (via.size ? `@${[...via].sort().join(', @')} (${id})` : `@${id}`);
/**
 * Every place the world names, on the new build's map and the same place as on the pinned build's (kind, spot, not a
 * home). Without the pinned build's places nothing can be compared: not ok.
 */
export function checkPlaces(world: World, oldPkg: CityPackage | null, newPkg: CityPackage | null): PlaceCheck {
  const { ids, unresolved } = worldPlaces(world);
  const why: string[] = [], notes: string[] = [];
  const list = [...ids.keys()].sort();
  if (!newPkg) return { ok: false, why: ['the current build\'s places cannot be read'], notes, ids: list };
  if (!oldPkg) return { ok: false, why: ['the pinned build\'s places can no longer be read, so no place can be checked to be the same one'], notes, ids: list };
  for (const k of unresolved) why.push(`@${k}: an alias with neither a place nor a spot`);
  const by = (p: CityPackage) => new Map(p.places.map((x) => [x.id, x] as [string, PackagePlace]));
  const was = by(oldPkg), now = by(newPkg);
  for (const id of list) {
    const e = ids.get(id)!, a = was.get(id), b = now.get(id), name = said(id, e.via);
    if (!b) { why.push(`${name} is not on the current build's map`); continue; }
    if (classify(b).residence) { why.push(`${name} is a home on the current build's map`); continue; }
    if (!a) { notes.push(`${name} was not on the pinned build's map; it is now (${b.name})`); continue; }
    if (a.kind !== b.kind) { why.push(`${name} was ${a.kind} (${a.name}) and is ${b.kind} (${b.name}) on the current build: another place has its id`); continue; }
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > MOVE_M) { why.push(`${name} (${b.name}) moved ${Math.round(d)} m (at most ${MOVE_M})`); continue; }
    if (a.name !== b.name) notes.push(`${name}: "${a.name}" is now "${b.name}"`);
  }
  return { ok: why.length === 0, why, notes, ids: list };
}

export type StoryUpgrade =
  /** nothing to do: the world plays its own pin (no hometown, the current build, or no current build known) */
  | { state: 'current'; from: HometownLock | null; build: string | null }
  /** a newer build is current, but its whole town is not built yet: the pinned build plays meanwhile */
  | { state: 'waiting'; from: HometownLock; build: string }
  /** it plays the current whole town: `world` is the upgraded world's SHA-256 (null when it was not asked to be made) */
  | { state: 'upgrade'; from: HometownLock; to: HometownLock; tilesId: string; build: string; world: string | null; notes: string[]; ids: string[] }
  /** it keeps its pinned build, and why */
  | { state: 'held'; from: HometownLock; to: HometownLock | null; build: string; why: string[]; notes: string[]; ids: string[] };

export type UpgradeDeps = {
  /** the build the town is served at now (lib/hometown-build/towns.ts servingBuild) */
  current(place: string): string | null;
  /** the whole town's bundle at a build, by its stored lock (a 'full' bundle only), or null */
  full(place: string, build: string): { tilesId: string; lock: HometownLock } | null;
  /** the town's box at a build (its frame's playBox and tiles: lib/hometown-build/frame.ts), or null */
  box(place: string, build: string): TownBox | null;
  /** a lock's CityPackage (lib/hometown/towns.ts cityPackageByLock) */
  pkg(lock: HometownLock): CityPackage | null;
  /** a sealed world by its SHA-256 */
  world(hash: string): World | null;
  /** keep the upgraded world (its bytes) with the store draft whose world `from` is; its SHA-256, or null */
  derive?(from: string, body: Uint8Array): string | null;
};

/** The sealed world re-pinned: `hometown` replaced, nothing else (same id: the player's progress is the same save). */
export const upgradedWorld = (world: World, to: HometownLock): World => ({ ...world, hometown: to });
export const worldBytes = (world: World) => new TextEncoder().encode(JSON.stringify(world));
export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** What a sealed world plays (see the top of this file). `derive`: make and keep the upgraded world when it upgrades. */
export function storyUpgradeWith(deps: UpgradeDeps, worldHash: string, opts: { derive?: boolean } = {}): StoryUpgrade | null {
  const w = /^[0-9a-f]{64}$/.test(worldHash) ? deps.world(worldHash) : null;
  if (!w || w.city !== 'hometown' || !w.hometown || typeof w.hometown !== 'object') return null;
  const from = w.hometown as HometownLock;
  const build = deps.current(from.place);
  if (!build || build === from.compiler) return { state: 'current', from, build };
  const full = deps.full(from.place, build);
  if (!full) return { state: 'waiting', from, build };
  const to = full.lock;
  if (to.place !== from.place || to.compiler !== build) return { state: 'held', from, to: null, build, why: ['the current whole town\'s lock does not name this town and build'], notes: [], ids: [] };
  const moved = frameMoved(from, to);
  if (moved) return { state: 'held', from, to, build, why: [`the town's frame moved between the builds (${moved}): every spot of the story would move with it`], notes: [], ids: [] };
  const boxed = boxMoved(deps.box(from.place, from.compiler), deps.box(to.place, build));
  if (boxed) return { state: 'held', from, to, build, why: [boxed], notes: [], ids: [] };
  const c = checkPlaces(w, deps.pkg(from), deps.pkg(to));
  if (!c.ok) return { state: 'held', from, to, build, why: c.why, notes: c.notes, ids: c.ids };
  let world: string | null = null;
  if (opts.derive) {
    world = deps.derive ? deps.derive(worldHash, worldBytes(upgradedWorld(w, to))) : null;
    if (!world) return { state: 'held', from, to, build, why: ['the store could not keep the upgraded world'], notes: c.notes, ids: c.ids };
  }
  return { state: 'upgrade', from, to, tilesId: full.tilesId, build, world, notes: c.notes, ids: c.ids };
}

/** A short line for the owner (admin) and the logs. */
export function upgradeWords(u: StoryUpgrade | null): string {
  if (!u) return 'not a hometown story';
  if (u.state === 'current') return u.build ? `plays its own build (${u.build})` : 'no current build is known: it plays its pinned build';
  if (u.state === 'waiting') return `pinned to ${u.from.compiler}; ${u.build} is current but its whole town is not built yet`;
  if (u.state === 'upgrade') return `pinned to ${u.from.compiler}; plays the whole town at ${u.build} (all ${u.ids.length} of its places are the same places)`;
  return `pinned to ${u.from.compiler}, kept there: ${u.why.join('; ')}`;
}
