// Key grammar for the tile service on the national grid hg1 (src/grid.mjs). Every storage key is built here from
// validated parts, never from raw URL text.
//   tile      tiles/{buildId}/hg1-{domain}/0/{c}/{r}
//   ctx       ctx/{buildId}/hg1-{domain}/4/{C}/{R}            (context blocks: internal / admin)
//   manifest  manifests/{buildId}/{placeId}.json              (the session descriptor + tile set)
//   build     builds/{buildId}.json                           (what the buildId's hash covers)
//   dem       dem/{etag}/...                                  (the mirrored 3DEP blocks; written by the compiler)
// buildId = htc-{compilerVersion}-hg1-b{8 hex} (tools/hometown/compile.py build_id_of): it fits VERSION_RE.
import { checkTile, GRID, BLOCK_L } from './grid.mjs';

export const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,47}$/;
export const PLACE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const HASH_RE = /^[0-9a-f]{64}$/;

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) Object.assign(this, extra);
  }
}

export function checkVersion(v) {
  if (typeof v !== 'string' || !VERSION_RE.test(v) || v.includes('..')) throw new HttpError(400, `bad build id: ${String(v).slice(0, 60)}`);
  return v;
}
export const checkBuild = checkVersion;

export function checkPlace(id) {
  if (typeof id !== 'string' || !PLACE_RE.test(id)) throw new HttpError(400, `bad place id: ${String(id).slice(0, 80)}`);
  return id;
}

function grid400(fn) {
  try { return fn(); } catch (e) { throw new HttpError(400, e.message); }
}

// (buildId, 'hg1-conus', L, c, r) -> { buildId, grid, domain, L, c, r, id: 'hg1-conus/0/c/r' }; 400 on a bad domain,
// level, digit string, negative or out-of-bounds key
export function parseTileKey(buildId, gd, L, c, r, { levels = [0] } = {}) {
  checkVersion(buildId);
  const t = grid400(() => checkTile(gd, L, c, r, { levels }));
  return { buildId, ...t };
}
export const parseCtxKey = (buildId, gd, L, C, R) => parseTileKey(buildId, gd, L, C, R, { levels: [4] });

export const tileId = (k) => `${GRID}-${k.domain}/${k.L ?? 0}/${k.c}/${k.r}`;
export const tileStorageKey = (k) => `tiles/${k.buildId}/${GRID}-${k.domain}/0/${k.c}/${k.r}`;
export const ctxStorageKey = (k) => `ctx/${k.buildId}/${GRID}-${k.domain}/4/${k.c}/${k.r}`;
export const manifestStorageKey = (buildId, placeId) => `manifests/${buildId}/${placeId}.json`;
export const buildStorageKey = (buildId) => `builds/${buildId}.json`;
export const demStorageKey = (etag, rest) => `dem/${etag}/${rest}`;
// the L2 compile block a tile belongs to (never in a client key)
export const blockOf = (k, level = BLOCK_L) => ({ buildId: k.buildId, grid: k.grid || GRID, domain: k.domain, L: level, c: k.c >> level, r: k.r >> level });
export const blockId = (b) => `${GRID}-${b.domain}/${b.L}/${b.c}/${b.r}`;
export function blockChildren(b) {
  const n = 1 << b.L, out = [];
  for (let r = b.r * n; r < b.r * n + n; r++) for (let c = b.c * n; c < b.c * n + n; c++) out.push({ buildId: b.buildId, grid: GRID, domain: b.domain, L: 0, c, r, id: `${GRID}-${b.domain}/0/${c}/${r}` });
  return out;
}
