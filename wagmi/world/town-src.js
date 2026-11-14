// A Hometown town from GameMog (Hometown e2e, Phase A): ?city=pkg&town=<place>&tc=<buildId>&ts=<tile set hash>. The town
// is a bundle GameMog built and keeps, addressed by its lock (GameMog lib/hometown/bundle.ts):
//   {host}/towns/{place}/{buildId}/{tiles}/geodata.json   { format: 'hometown-bundle', formatVersion: 1, GEO, PLACE_DATA, PKG }
//   {host}/towns/{place}/{buildId}/{tiles}/data/*.bin.gz  the package's data files (data-loader.js, relative to NYC.BASE)
// The host is https://gamemog.com; on a page served from localhost, the ?host= of a local dev server (as allow.js reads
// a world's own address). The bundle's lock (PKG.lock, the compiler's lock v2) must be the one the address names, and a
// story world plays here only when its own pin (world.hometown, the pack's base.hometown) is that lock field by field
// (wagmi/storyrun/pack.js). A plain module: index.html imports it to boot, pack.js to check, node --test to test.
//   townFromQuery(q, here)   { place, buildId, tiles, host, base } or null (not a town address, or a host refused)
//   loadTown(t, fetchFn)     the bundle's { GEO, PLACE_DATA, PKG }, checked; throws on anything else
//   townLockMismatch(pin, lock)  '' when the world's pin is the bundle's lock, else the first field that differs
// A growing town (the production builder, lock v3: tiles = sha256(buildId + the sorted tile ids), the same for every
// variant): &tv=district-{c}-{r}|full names the variant, its bundle at {host}/towns/{place}/{buildId}/{tiles}/{tv}/
// (wagmi/world/growing.js plays a district and swaps to full). No tv: the one bundle of a lock v2 town, as before.
export const GAMEMOG = 'https://gamemog.com';
export const TOWN_ID = /^us-[0-9]{7}$/;
export const BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const TILE_SET = /^[0-9a-f]{64}$/;
export const VARIANT = /^(full|district-[0-9]{1,7}-[0-9]{1,7})$/;
// the lock versions this engine plays: v2 (tiles = the content hash of every tile) and v3 (tiles named by id)
export const LOCK_VERSIONS = [2, 3];
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;
const LOCAL = (h) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h);
export const BUNDLE_FORMAT = 'hometown-bundle';
// the bundle formats this engine reads: every formatVersion GameMog has ever served stays readable (the engine is unversioned)
export const BUNDLE_VERSIONS = [1];

export function townFromQuery(q, here = globalThis.location) {
  if (!q || q.get('city') !== 'pkg') return null;
  const place = q.get('town') || '', buildId = q.get('tc') || '', tiles = q.get('ts') || '';
  const tv = q.get('tv');
  if (!TOWN_ID.test(place) || !BUILD_ID.test(buildId) || buildId.includes('..') || !TILE_SET.test(tiles) || (tv != null && !VARIANT.test(tv))) return null;
  let host = GAMEMOG;
  if (here && LOCAL(here.hostname || '')) { const h = q.get('host') || ''; if (DEV_ORIGIN.test(h)) host = h; }
  return { place, buildId, tiles, tv: tv || null, host, base: `${host}/towns/${place}/${buildId}/${tiles}/${tv ? tv + '/' : ''}` };
}

export async function loadTown(t, fetchFn = globalThis.fetch) {
  const r = await fetchFn(`${t.base}geodata.json`, { credentials: 'omit', redirect: 'error' });
  if (!r.ok) throw new Error(`town ${t.place}: ${r.status}`);
  const b = await r.json();
  if (!b || b.format !== BUNDLE_FORMAT || !BUNDLE_VERSIONS.includes(b.formatVersion)) throw new Error(`town ${t.place}: not a town bundle this engine reads`);
  const L = b.PKG && b.PKG.lock;
  if (!L || L.format !== 'hometown-city-lock' || L.place !== t.place || L.buildId !== t.buildId || L.tiles !== t.tiles) throw new Error(`town ${t.place}: the bundle is not the town the address names`);
  if (L.formatVersion != null && !LOCK_VERSIONS.includes(L.formatVersion)) throw new Error(`town ${t.place}: a lock this engine does not read`);
  // (a variant's bundle says which variant it is: a district bundle served as full, or the reverse, is refused)
  if (t.tv && (b.PKG.variant || 'full') !== t.tv) throw new Error(`town ${t.place}: the bundle is not the variant the address names`);
  if (!b.GEO || !b.PLACE_DATA || b.PKG.id !== t.place) throw new Error(`town ${t.place}: the bundle is incomplete`);
  return { GEO: b.GEO, PLACE_DATA: b.PLACE_DATA, PKG: b.PKG };
}

// a world's pin (GameMog's base.hometown: compiler = the build id) against the bundle's lock (the compiler's: buildId)
const FIELDS = [['place', 'place'], ['compiler', 'buildId'], ['tiles', 'tiles'], ['grid', 'grid'], ['domain', 'domain'], ['origin', 'origin'], ['k0', 'k0'], ['gamma0', 'gamma0'], ['yOffset', 'yOffset'], ['waterLevel', 'waterLevel']];
export function townLockMismatch(pin, lock) {
  if (!pin || typeof pin !== 'object') return 'no town pinned';
  if (!lock || typeof lock !== 'object') return 'no town loaded';
  // (v2 and v3 both play; a pin that says which version it pinned must be that one: a v3 tiles id is not a v2 content hash)
  if (lock.formatVersion != null && !LOCK_VERSIONS.includes(lock.formatVersion)) return 'formatVersion';
  if (pin.formatVersion != null && lock.formatVersion != null && pin.formatVersion !== lock.formatVersion) return 'formatVersion';
  for (const [a, b] of FIELDS) if (JSON.stringify(pin[a] ?? null) !== JSON.stringify(lock[b] ?? null)) return a;
  return '';
}
