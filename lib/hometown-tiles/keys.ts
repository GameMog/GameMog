/**
 * Hometown tile store: the key grammar (the national grid hg1). Every storage key is built or checked here, never from
 * raw URL text. The layout is the Python compiler's own store (MogCity tools/hometown/compile.py Store), so a store the
 * compiler filled (on a worker, or on the Mac) is uploaded file by file:
 *
 *   tiles/{buildId}/hg1-{domain}/0/{c}/{r}      a tile: gzip of HTL1, exactly as the compiler wrote it (public)
 *   ctx/{buildId}/hg1-{domain}/4/{C}/{R}        a context block (compile input; workers and admin only)
 *   manifests/{buildId}/{placeId}.json          the place's session descriptor + tile set (public)
 *   builds/{buildId}.json                       what the buildId's hash covers (public)
 *   frames/{buildId}/{placeId}.json             a town's frame: session frame, yOffset, waterLevel, spawns, places, lock
 *                                               v3, computed with no compiled tile (public; the Story Kit reads it)
 *   bundles/{buildId}/{placeId}/{tilesId}/{variant}/{file}
 *                                               a playable package (the legacy assembler's) of one window: variant
 *                                               `full` or `district-{c}-{r}`; file geodata.json, citypackage.json,
 *                                               lock.json, bundle.json (its file list, uploaded LAST), data/{terrain,
 *                                               buildings,groundmask}.bin.gz, data/far/{t}-{C}-{R}.bin.gz (public)
 *   far/{buildId}/hg1-{domain}/{1|3|5}/{C}/{R}  a far tile: gzip of SFB1 (public; shared by every town near it)
 *   src/overture/{release}/hg1-{domain}/4/{C}/{R}/{file}
 *                                               a staged Overture region (fetch.py --regions): its layer parquets and
 *                                               region.json, then files.json (every file's sha256) LAST (workers only)
 *   dem/{13|1}/{name}/{etag}/{meta.json|k.bin}  the DEM mirror (compile.py dem.COG; workers only)
 *
 * buildId = htc-{compilerVersion}-hg1-b{8 hex} (compile.py build_id_of). Nothing else is ever a key.
 */
export const DOMAINS = ['conus', 'ak', 'hi', 'pr', 'gu', 'as'] as const;
export type Domain = (typeof DOMAINS)[number];
export const BUILD_ID = /^htc-[0-9][0-9.]{0,9}-hg1-b[0-9a-f]{8}$/;
/** "us-<GEOID>" (search), and the short ids of the compiler's own test gazetteer ("okemah") */
export const PLACE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const TILES_ID = /^[0-9a-f]{64}$/;
export const VARIANT = /^(full|district-(0|[1-9][0-9]{0,6})-(0|[1-9][0-9]{0,6}))$/;
export const RELEASE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$/;
const NUM = /^(0|[1-9][0-9]{0,6})$/;
const BUNDLE_FILE = /^(geodata\.json|citypackage\.json|lock\.json|bundle\.json|data\/(terrain|buildings|groundmask)\.bin\.gz|data\/far\/[a-c]-[0-9]{1,6}-[0-9]{1,6}\.bin\.gz)$/;
const SRC_FILE = /^(overture-[a-z_]+-[a-z_]+(-extras)?\.parquet|region\.json|files\.json)$/;
const DEM_NAME = /^n[0-9]{2}w[0-9]{3}$/;
const ETAG = /^[A-Za-z0-9-]{4,64}$/;

export type Family = 'tiles' | 'ctx' | 'manifests' | 'builds' | 'frames' | 'bundles' | 'far' | 'src' | 'dem';
export const FAMILIES: Family[] = ['tiles', 'ctx', 'manifests', 'builds', 'frames', 'bundles', 'far', 'src', 'dem'];
/** Families made per build (collected with their build); src and dem are sources, shared across builds. */
export const BUILD_FAMILIES: Family[] = ['tiles', 'ctx', 'manifests', 'builds', 'frames', 'bundles', 'far'];
export type Key = {
  family: Family; buildId: string; key: string; domain?: Domain; c?: number; r?: number; L?: number; placeId?: string;
  tilesId?: string; variant?: string; file?: string; release?: string; product?: string; name?: string; etag?: string;
};

const dom = (s: string): Domain | null => {
  const m = /^hg1-([a-z]+)$/.exec(s);
  return m && (DOMAINS as readonly string[]).includes(m[1]) ? (m[1] as Domain) : null;
};

/** A storage key from its parts (["tiles", buildId, "hg1-conus", "0", c, r], ...), or null when any part is wrong. */
export function parseKey(parts: string[]): Key | null {
  const [family, buildId] = parts;
  const key = parts.join('/');
  if (family === 'src') {
    // src/overture/{release}/hg1-{d}/4/{C}/{R}/{file}
    if (parts.length !== 8 || parts[1] !== 'overture' || !RELEASE.test(parts[2]) || parts[4] !== '4' || !NUM.test(parts[5]) || !NUM.test(parts[6]) || !SRC_FILE.test(parts[7])) return null;
    const d = dom(parts[3]);
    return d ? { family, buildId: '', key, release: parts[2], domain: d, c: Number(parts[5]), r: Number(parts[6]), L: 4, file: parts[7] } : null;
  }
  if (family === 'dem') {
    // dem/{13|1}/{name}/{etag}/{meta.json | k.bin}
    if (parts.length !== 5 || (parts[1] !== '13' && parts[1] !== '1') || !DEM_NAME.test(parts[2]) || !ETAG.test(parts[3]) || !/^(meta\.json|(0|[1-9][0-9]{0,5})\.bin)$/.test(parts[4])) return null;
    return { family, buildId: '', key, product: parts[1], name: parts[2], etag: parts[3], file: parts[4] };
  }
  if (!buildId || !BUILD_ID.test(buildId.replace(/\.json$/, ''))) return null;
  if ((family === 'tiles' || family === 'ctx') && parts.length === 6) {
    const d = dom(parts[2]);
    const level = family === 'tiles' ? '0' : '4';
    if (!d || parts[3] !== level || !NUM.test(parts[4]) || !NUM.test(parts[5])) return null;
    return { family, buildId, domain: d, c: Number(parts[4]), r: Number(parts[5]), L: Number(level), key };
  }
  if (family === 'far' && parts.length === 6) {
    const d = dom(parts[2]);
    if (!d || !/^[135]$/.test(parts[3]) || !NUM.test(parts[4]) || !NUM.test(parts[5])) return null;
    return { family, buildId, domain: d, L: Number(parts[3]), c: Number(parts[4]), r: Number(parts[5]), key };
  }
  if ((family === 'manifests' || family === 'frames') && parts.length === 3) {
    const m = /^(.+)\.json$/.exec(parts[2]);
    if (!m || !PLACE_ID.test(m[1])) return null;
    return { family, buildId, placeId: m[1], key };
  }
  if (family === 'bundles' && parts.length >= 6 && parts.length <= 8) {
    const [, , placeId, tilesId, variant] = parts;
    const file = parts.slice(5).join('/');
    if (!PLACE_ID.test(placeId) || !TILES_ID.test(tilesId) || !VARIANT.test(variant) || !BUNDLE_FILE.test(file)) return null;
    return { family, buildId, placeId, tilesId, variant, file, key };
  }
  if (family === 'builds' && parts.length === 2 && buildId.endsWith('.json')) {
    return { family, buildId: buildId.slice(0, -5), key };
  }
  return null;
}

export const parseKeyString = (key: string) => (/^[A-Za-z0-9._/-]{1,200}$/.test(key) && !key.split('/').some((s) => s === '' || s === '.' || s === '..') ? parseKey(key.split('/')) : null);
export const tileKey = (buildId: string, domain: Domain, c: number, r: number) => `tiles/${buildId}/hg1-${domain}/0/${c}/${r}`;
export const ctxKey = (buildId: string, domain: Domain, C: number, R: number) => `ctx/${buildId}/hg1-${domain}/4/${C}/${R}`;
export const manifestKey = (buildId: string, placeId: string) => `manifests/${buildId}/${placeId}.json`;
export const frameKey = (buildId: string, placeId: string) => `frames/${buildId}/${placeId}.json`;
export const bundleKey = (buildId: string, placeId: string, tilesId: string, variant: string, file: string) => `bundles/${buildId}/${placeId}/${tilesId}/${variant}/${file}`;
export const farKey = (buildId: string, domain: Domain, L: number, C: number, R: number) => `far/${buildId}/hg1-${domain}/${L}/${C}/${R}`;
export const srcKey = (release: string, domain: Domain, C: number, R: number, file: string) => `src/overture/${release}/hg1-${domain}/4/${C}/${R}/${file}`;
export const buildKey = (buildId: string) => `builds/${buildId}.json`;
/** The L2 compile block a tile belongs to (compile.py --block hg1-{d}/2/{C}/{R}: 16 tiles in one process). */
export const blockOf = (domain: Domain, c: number, r: number) => `hg1-${domain}/2/${c >> 2}/${r >> 2}`;
/** Public families (a player's browser reads these); ctx, src and dem are compile inputs only. */
export const PUBLIC: Family[] = ['tiles', 'manifests', 'builds', 'frames', 'bundles', 'far'];
/** What a worker's token may PUT (never anything the GC or the owner's tools decide). */
export const WORKER_PUT: Family[] = ['tiles', 'ctx', 'manifests', 'builds', 'frames', 'bundles', 'far', 'src', 'dem'];
export const contentType = (f: Family, key = '') => (f === 'manifests' || f === 'builds' || f === 'frames' || key.endsWith('.json') ? 'application/json' : 'application/octet-stream');
/** Upload size limits by family (SPEC 3.1): src layers up to 64 MB, a DEM piece 2 MB, everything else 16 MB. */
export const MAX_UPLOAD = 16 * 1024 * 1024;
export const maxUploadOf = (f: Family) => (f === 'src' ? 64 * 1024 * 1024 : f === 'dem' ? 2 * 1024 * 1024 : MAX_UPLOAD);
/** The build a key counts towards (GC, access journal), or null for the shared sources (src, dem). */
export const buildOfKey = (key: string): string | null => {
  const [f, b] = key.split('/');
  return (BUILD_FAMILIES as string[]).includes(f) && b ? b.replace(/\.json$/, '') : null;
};
