/**
 * Hometown: the CityPackage, what the Story Kit builder reads about a town (Hometown Build Spec v1, "builder reads
 * package places"). A town is compiled from open data (Overture buildings, roads and places, OSM, USGS 3DEP) into
 * cached tiles keyed by the compiler version; the package is the story-facing summary of one compiled town, in the
 * shape of Mog City's world contract (MogCity wagmi/world/: places, landmarks, spawnPoints, districtAt, roads):
 *
 *   placeId          the town's id ("us-ok-okemah"); with compilerVersion and tileSet.hash it is the town's LOCK
 *   name, state      "Okemah", "Oklahoma"
 *   compilerVersion  the build the tiles were made by: on the national grid hg1 the buildId
 *                    ("htc-0.3.0-hg1-becc45523": compiler version, libraries, sources, grid), before it a version
 *   tileSet          { hash, count }: the pinned tile set (tileSetHash over every tile's "hg1-{domain}/0/{c}/{r}" id and
 *                    the SHA-256 of its decoded bytes; the same code as MogCity's tile service and compiler)
 *   grid, domain, buildId, origin {c0, r0}, k0, gamma0, yOffset, waterLevel
 *                    on hg1 (MogCity tools/hometown/grid.py): the session frame the descriptor pinned. A Mog's story
 *                    coordinates are relative to this origin, so the lock (v2) pins all of it
 *   places[]         { id, kind, name, x, z, tags[], foot?, heading?, district? }: the story places a pack names by
 *                    "@id" (world.places); kind is the OSM / Overture kind ("hospital", "fast_food", "park"), tags the
 *                    source's own ("amenity=hospital", "brand=...", "overture=elementary_school")
 *   landmarks[]      { id, name, kind, x, z, tags? }: named sites, words only (never a pack's "@key")
 *   districts[]      { id, name, x, z }: the parts of town (world.districtAt), x, z a centre
 *   spawnPoints[]    { id, x, z, heading, mode? }: arrivals (world.spawnPoints)
 *   roadsSummary     { streets, km, main[] }: what the road graph is like, for the words
 *
 * Frame: metres, +x east, -z north (Mog City's). A pack never carries a coordinate: places are names (gate.ts).
 * Pure data and pure functions: no network, no model, no city loaded.
 */
import { createHash } from 'node:crypto';
import { MOGCITY } from '../pack/gate.ts';
import { HOMETOWN, type HometownLock } from '../pack/cities.ts';

export type PackagePlace = { id: string; kind: string; name: string; x: number; z: number; tags: string[]; foot?: boolean; heading?: number; district?: string };
export type PackageLandmark = { id: string; name: string; kind: string; x: number; z: number; tags?: string[] };
export type District = { id: string; name: string; x: number; z: number };
export type SpawnPoint = { id: string; x: number; z: number; heading: number; mode?: 'car' | 'foot'; name?: string };
export type RoadsSummary = { streets: number; km: number; main: string[] };
export type CityPackage = {
  v: 1;
  placeId: string;
  name: string;
  state: string;
  compilerVersion: string;
  tileSet: { hash: string; count: number };
  places: PackagePlace[];
  landmarks: PackageLandmark[];
  districts: District[];
  spawnPoints: SpawnPoint[];
  roadsSummary: RoadsSummary;
  // (the national grid hg1: the session frame; absent on a package from before it, San Francisco's adapter)
  grid?: 'hg1';
  domain?: HometownDomain;
  buildId?: string;
  origin?: { c0: number; r0: number };
  k0?: number;
  gamma0?: number;
  yOffset?: number;
  waterLevel?: number;
};
export type HometownDomain = 'conus' | 'ak' | 'hi' | 'pr' | 'gu' | 'as';
export const DOMAINS: HometownDomain[] = ['conus', 'ak', 'hi', 'pr', 'gu', 'as'];
export const BUILD_ID = /^htc-[0-9][0-9.]{0,9}-hg1-b[0-9a-f]{8}$/;

export const PLACE_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
export const COMPILER_VERSION = /^[a-z0-9][a-z0-9.-]{0,29}$/;
export const TILE_HASH = /^[0-9a-f]{16,64}$/;
/** a pack's "@key" (schema.mjs placeKey) */
export const PLACE_KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const KIND = /^[a-z0-9_:.=-]{1,60}$/;

/**
 * The tile set's hash: SHA-256 over every tile's "id sha256\n" line, sorted (order-free, any tile changed changes it).
 * The same bytes as MogCity's server/tiles/src/service.mjs tileSetHash and tools/hometown/assemble.py tile_set_hash.
 */
export function tileSetHash(tiles: { id: string; sha256: string }[]): string {
  const lines = tiles.map((t) => `${t.id} ${t.sha256}\n`).sort();
  return createHash('sha256').update(lines.join('')).digest('hex');
}

/**
 * The town's lock: what a hometown pack pins in base.hometown, and a Mog keeps exactly. On the national grid it is
 * lock v2: the place, the build (compiler: the buildId), the tile set AND the session frame (grid, domain, origin, k0,
 * gamma0, yOffset, waterLevel), so a Mog never plays a recompiled town nor one whose frame moved.
 */
export const cityLock = (pkg: CityPackage): HometownLock => (pkg.grid === 'hg1'
  ? { place: pkg.placeId, compiler: pkg.compilerVersion, tiles: pkg.tileSet.hash, formatVersion: 2, grid: 'hg1', domain: pkg.domain!, origin: { c0: pkg.origin!.c0, r0: pkg.origin!.r0 },
    k0: pkg.k0!, gamma0: pkg.gamma0!, yOffset: pkg.yOffset!, waterLevel: pkg.waterLevel! }
  : { place: pkg.placeId, compiler: pkg.compilerVersion, tiles: pkg.tileSet.hash });
/** The cityBuild Mog City's engine plays the town at: one per compiler version. */
export const cityBuildOf = (pkg: CityPackage) => `${HOMETOWN}-${pkg.compilerVersion}`;
/** The base a hometown Create runs on (a Mog copies its parent's). */
export const hometownBase = (pkg: CityPackage) => ({ engine: MOGCITY, city: HOMETOWN, cityBuild: cityBuildOf(pkg), hometown: cityLock(pkg) });
export const townName = (pkg: CityPackage) => `${pkg.name}, ${pkg.state}`;

/** What is wrong with a package (empty: it can be read). */
export function packageProblems(pkg: unknown): string[] {
  const out: string[] = [];
  const p = pkg as CityPackage;
  if (!p || typeof p !== 'object') return ['the city package is not an object'];
  if (p.v !== 1) out.push(`v must be 1, not ${JSON.stringify(p.v)}`);
  if (typeof p.placeId !== 'string' || !PLACE_ID.test(p.placeId)) out.push(`placeId ${JSON.stringify(p.placeId)} is not a place id (${PLACE_ID})`);
  for (const k of ['name', 'state'] as const) if (typeof p[k] !== 'string' || !p[k].trim() || p[k].length > 60) out.push(`${k} is 1 to 60 characters`);
  if (typeof p.compilerVersion !== 'string' || !COMPILER_VERSION.test(p.compilerVersion)) out.push(`compilerVersion ${JSON.stringify(p.compilerVersion)} is not a version (${COMPILER_VERSION})`);
  if (p.grid !== undefined) {
    // (the national grid: the frame the descriptor pinned, all of it, and the build named twice the same)
    const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (p.grid !== 'hg1') out.push(`grid ${JSON.stringify(p.grid)} is not hg1`);
    if (!DOMAINS.includes(p.domain as HometownDomain)) out.push(`domain ${JSON.stringify(p.domain)} is not one of ${DOMAINS.join(', ')}`);
    if (typeof p.buildId !== 'string' || !BUILD_ID.test(p.buildId) || p.buildId !== p.compilerVersion) out.push(`buildId ${JSON.stringify(p.buildId)} is a build id (${BUILD_ID}) equal to compilerVersion`);
    if (!p.origin || !Number.isInteger(p.origin.c0) || !Number.isInteger(p.origin.r0) || p.origin.c0 < 0 || p.origin.r0 < 0) out.push('origin is { c0, r0 }: tile indices');
    if (!num(p.k0, 0.9, 1.1) || !num(p.gamma0, -40, 40) || !Number.isInteger(p.yOffset) || !num(p.waterLevel, -1000, 1000)) out.push('k0, gamma0, yOffset (an integer) and waterLevel are the pinned frame\'s numbers');
  }
  if (!p.tileSet || typeof p.tileSet.hash !== 'string' || !TILE_HASH.test(p.tileSet.hash) || !(Number.isInteger(p.tileSet.count) && p.tileSet.count > 0)) out.push('tileSet is { hash: hex, count: a positive integer }');
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const ids = new Set<string>();
  if (!Array.isArray(p.places) || !p.places.length) out.push('places: at least one');
  for (const [i, q] of (Array.isArray(p.places) ? p.places : []).entries()) {
    const at = `places[${i}]`;
    if (!q || typeof q !== 'object') { out.push(`${at}: not an object`); continue; }
    if (typeof q.id !== 'string' || !PLACE_KEY.test(q.id)) out.push(`${at}: id ${JSON.stringify(q.id)} is not a pack place key (${PLACE_KEY})`);
    else if (ids.has(q.id)) out.push(`${at}: two places are "${q.id}"`);
    else ids.add(q.id);
    if (typeof q.kind !== 'string' || !KIND.test(q.kind)) out.push(`${at}: kind ${JSON.stringify(q.kind)}`);
    if (typeof q.name !== 'string' || !q.name.trim() || q.name.length > 80) out.push(`${at}: name is 1 to 80 characters`);
    if (!finite(q.x) || !finite(q.z)) out.push(`${at}: x and z are numbers`);
    if (!Array.isArray(q.tags) || q.tags.some((t) => typeof t !== 'string')) out.push(`${at}: tags is a list of strings`);
  }
  for (const [list, need] of [['landmarks', ['id', 'name', 'kind']], ['districts', ['id', 'name']], ['spawnPoints', ['id']]] as const) {
    const xs = (p as Record<string, unknown>)[list];
    if (!Array.isArray(xs)) { out.push(`${list}: a list`); continue; }
    xs.forEach((q: Record<string, unknown>, i: number) => {
      for (const k of need) if (typeof q?.[k] !== 'string' || !(q[k] as string).trim()) out.push(`${list}[${i}].${k}: a string`);
      if (!finite(q?.x) || !finite(q?.z)) out.push(`${list}[${i}]: x and z are numbers`);
    });
  }
  if (Array.isArray(p.spawnPoints) && !p.spawnPoints.length) out.push('spawnPoints: at least one');
  const r = p.roadsSummary;
  if (!r || !Number.isInteger(r.streets) || !finite(r.km) || !Array.isArray(r.main)) out.push('roadsSummary is { streets, km, main[] }');
  return out;
}
