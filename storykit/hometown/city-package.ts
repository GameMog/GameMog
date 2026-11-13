/**
 * Hometown: the CityPackage, what the Story Kit builder reads about a town (Hometown Build Spec v1, "builder reads
 * package places"). A town is compiled from open data (Overture buildings, roads and places, OSM, USGS 3DEP) into
 * cached tiles keyed by the compiler version; the package is the story-facing summary of one compiled town, in the
 * shape of Mog City's world contract (MogCity wagmi/world/: places, landmarks, spawnPoints, districtAt, roads):
 *
 *   placeId          the town's id ("us-ok-okemah"); with compilerVersion and tileSet.hash it is the town's LOCK
 *   name, state      "Okemah", "Oklahoma"
 *   compilerVersion  the city compiler's version the tiles were built with ("htc-0.1.0")
 *   tileSet          { hash, count }: the pinned tile set (tileSetHash over every tile's id and SHA-256)
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
};

export const PLACE_ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
export const COMPILER_VERSION = /^[a-z0-9][a-z0-9.-]{0,29}$/;
export const TILE_HASH = /^[0-9a-f]{16,64}$/;
/** a pack's "@key" (schema.mjs placeKey) */
export const PLACE_KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const KIND = /^[a-z0-9_:.=-]{1,60}$/;

/** The tile set's hash: SHA-256 over every tile's "id sha256" line, sorted (order-free, any tile changed changes it). */
export function tileSetHash(tiles: { id: string; sha256: string }[]): string {
  const lines = tiles.map((t) => `${t.id} ${t.sha256}`).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The town's lock: what a hometown pack pins in base.hometown, and a Mog keeps exactly. */
export const cityLock = (pkg: CityPackage): HometownLock => ({ place: pkg.placeId, compiler: pkg.compilerVersion, tiles: pkg.tileSet.hash });
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
