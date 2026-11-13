/**
 * Hometown tile store: the key grammar (the national grid hg1). Every storage key is built or checked here, never from
 * raw URL text. The layout is the Python compiler's own store (MogCity tools/hometown/compile.py Store), so a store the
 * compiler filled on the Mac is uploaded file by file, and a compile on this server (HOMETOWN_COMPILE=on) writes into
 * it directly:
 *
 *   tiles/{buildId}/hg1-{domain}/0/{c}/{r}      a tile: gzip of HTL1, exactly as the compiler wrote it (public)
 *   ctx/{buildId}/hg1-{domain}/4/{C}/{R}        a context block (compile input; admin only)
 *   manifests/{buildId}/{placeId}.json          the place's session descriptor + tile set (public)
 *   builds/{buildId}.json                       what the buildId's hash covers (public)
 *
 * buildId = htc-{compilerVersion}-hg1-b{8 hex} (compile.py build_id_of). Nothing else is ever a key.
 */
export const DOMAINS = ['conus', 'ak', 'hi', 'pr', 'gu', 'as'] as const;
export type Domain = (typeof DOMAINS)[number];
export const BUILD_ID = /^htc-[0-9][0-9.]{0,9}-hg1-b[0-9a-f]{8}$/;
/** "us-<GEOID>" (search), and the short ids of the compiler's own test gazetteer ("okemah") */
export const PLACE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NUM = /^(0|[1-9][0-9]{0,6})$/;

export type Family = 'tiles' | 'ctx' | 'manifests' | 'builds';
export type Key = { family: Family; buildId: string; key: string; domain?: Domain; c?: number; r?: number; placeId?: string };

const dom = (s: string): Domain | null => {
  const m = /^hg1-([a-z]+)$/.exec(s);
  return m && (DOMAINS as readonly string[]).includes(m[1]) ? (m[1] as Domain) : null;
};

/** A storage key from its parts (["tiles", buildId, "hg1-conus", "0", c, r], ...), or null when any part is wrong. */
export function parseKey(parts: string[]): Key | null {
  const [family, buildId] = parts;
  if (!buildId || !BUILD_ID.test(buildId.replace(/\.json$/, ''))) return null;
  if ((family === 'tiles' || family === 'ctx') && parts.length === 6) {
    const d = dom(parts[2]);
    const level = family === 'tiles' ? '0' : '4';
    if (!d || parts[3] !== level || !NUM.test(parts[4]) || !NUM.test(parts[5])) return null;
    return { family, buildId, domain: d, c: Number(parts[4]), r: Number(parts[5]), key: parts.join('/') };
  }
  if (family === 'manifests' && parts.length === 3) {
    const m = /^(.+)\.json$/.exec(parts[2]);
    if (!m || !PLACE_ID.test(m[1])) return null;
    return { family, buildId, placeId: m[1], key: parts.join('/') };
  }
  if (family === 'builds' && parts.length === 2 && buildId.endsWith('.json')) {
    return { family, buildId: buildId.slice(0, -5), key: parts.join('/') };
  }
  return null;
}

export const parseKeyString = (key: string) => (/^[A-Za-z0-9._/-]{1,200}$/.test(key) && !key.split('/').some((s) => s === '' || s === '.' || s === '..') ? parseKey(key.split('/')) : null);
export const tileKey = (buildId: string, domain: Domain, c: number, r: number) => `tiles/${buildId}/hg1-${domain}/0/${c}/${r}`;
export const manifestKey = (buildId: string, placeId: string) => `manifests/${buildId}/${placeId}.json`;
export const buildKey = (buildId: string) => `builds/${buildId}.json`;
/** The L2 compile block a tile belongs to (compile.py --block hg1-{d}/2/{C}/{R}: 16 tiles in one process). */
export const blockOf = (domain: Domain, c: number, r: number) => `hg1-${domain}/2/${c >> 2}/${r >> 2}`;
/** Public families (a player's browser reads these); ctx is a compile input only. */
export const PUBLIC: Family[] = ['tiles', 'manifests', 'builds'];
export const contentType = (f: Family) => (f === 'manifests' || f === 'builds' ? 'application/json' : 'application/octet-stream');
