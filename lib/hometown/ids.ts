/**
 * Hometown: one place id and one lock shape across search, the town builder, the Story Kit and Mog City.
 *
 * Place id. The canonical id is the search's: "us-" and the Census GEOID ("us-4054200" is Okemah, OK;
 * lib/places/types.ts). The town builder compiles a town under that id (it writes its own places file per job, so the
 * compiler's descriptor, manifest, lock and PKG.id all carry it), the Story Kit's CityPackage.placeId is it, and Mog City's
 * engine reads it from ?town=. The compiler's hand-kept places.json (MogCity tools/hometown/places.json) has older dev ids
 * for the same towns; LEGACY_PLACE_IDS maps them. "phoenix" and "pittsburgh" there are bare test boxes with no Census
 * place, so they have no canonical id and are never built from the search.
 *
 * Lock shape. The Story Kit's lock (storykit/pack/cities.ts HometownLock, what base.hometown pins and gate rule 16
 * compares) names the build `compiler`; the compiler and MogCity's tile service (server/tiles checkLock) name it
 * `buildId` and add `format: 'hometown-city-lock'`. The two carry the same facts, so this adapter is deliberate and
 * lossless: serviceLock() is what is written to a bundle's lock.json and what the tile service and the engine compare
 * (NYC.PKG.lock), storyLock() is what a pack pins. Neither side's shape changes.
 */
import { createHash } from 'node:crypto';
import type { HometownLock } from '../../storykit/pack/cities.ts';

/** Lock v3's tiles: sha256(buildId + "\n" + sorted tile ids joined by "\n"). The compiler's --frame computes the same. */
export function tilesIdOf(buildId: string, tileIds: string[]): string {
  return createHash('sha256').update(`${buildId}\n${[...tileIds].sort().join('\n')}`).digest('hex');
}

/** A canonical place id: "us-" + the 7-digit Census GEOID. */
export const TOWN_ID = /^us-[0-9]{7}$/;
export const placeIdOfGeoid = (geoid: string) => `us-${geoid}`;
export const geoidOf = (placeId: string): string | null => (TOWN_ID.test(placeId) ? placeId.slice(3) : null);

/** The compiler's older dev ids (tools/hometown/places.json) for towns that have a Census id. */
export const LEGACY_PLACE_IDS: Record<string, string> = { okemah: 'us-4054200' };
/** Any id seen in the wild as the canonical one, or null (a bare test box, or not a place id). */
export function canonicalPlaceId(id: string): string | null {
  if (TOWN_ID.test(id)) return id;
  return Object.prototype.hasOwnProperty.call(LEGACY_PLACE_IDS, id) ? LEGACY_PLACE_IDS[id] : null;
}

/**
 * The compiler's and the tile service's lock (tools/hometown/assemble.py, server/tiles/src/service.mjs createLock).
 *   v2  tiles = the tile set's CONTENT hash (every tile compiled first)
 *   v3  tiles = tilesIdOf(buildId, ids) = sha256(buildId + "\n" + the sorted tile ids joined by "\n"): known from the
 *       frame, before any tile is compiled (production builder, SPEC 4.2). Tiles are pure functions of (key, build), so
 *       it pins the same bytes; the content hashes stay in the full manifest, still checked on upload.
 * Both are accepted everywhere; v2 worlds keep playing.
 */
export type ServiceLock = {
  format: 'hometown-city-lock'; formatVersion: 2 | 3; place: string; buildId: string; tiles: string;
  grid: 'hg1'; domain: string; origin: { c0: number; r0: number }; k0: number; gamma0: number; yOffset: number; waterLevel: number;
};
export const LOCK_FORMAT = 'hometown-city-lock';

/** The Story Kit's lock (base.hometown) as the tile service and the engine read it. */
export function serviceLock(l: HometownLock): ServiceLock {
  return { format: LOCK_FORMAT, formatVersion: l.formatVersion === 3 ? 3 : 2, place: l.place, buildId: l.compiler, grid: 'hg1', domain: l.domain!, origin: { c0: l.origin!.c0, r0: l.origin!.r0 },
    k0: l.k0!, gamma0: l.gamma0!, yOffset: l.yOffset!, waterLevel: l.waterLevel!, tiles: l.tiles };
}
/** A service lock as the Story Kit pins it (the inverse of serviceLock). Null when it is not a lock v2 or v3. */
export function storyLock(s: unknown): HometownLock | null {
  const l = s as ServiceLock;
  if (!l || l.format !== LOCK_FORMAT || (l.formatVersion !== 2 && l.formatVersion !== 3) || l.grid !== 'hg1' || typeof l.place !== 'string' || typeof l.buildId !== 'string' || typeof l.tiles !== 'string') return null;
  return { place: l.place, compiler: l.buildId, tiles: l.tiles, formatVersion: l.formatVersion, grid: 'hg1', domain: l.domain, origin: { c0: l.origin.c0, r0: l.origin.r0 },
    k0: l.k0, gamma0: l.gamma0, yOffset: l.yOffset, waterLevel: l.waterLevel };
}
/** Every field equal (the engine's check, wagmi/storyrun/pack.js, compares the same fields). */
export const sameServiceLock = (a: ServiceLock, b: ServiceLock) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (o: unknown): unknown => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys((o as Record<string, unknown>)[k])])) : o);
