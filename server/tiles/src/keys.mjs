// Key grammar for the tile service. Every storage key is built here from validated parts, never from raw URL text.
//   tile      tiles/{compilerVersion}/{z}/{x}/{y}
//   manifest  manifests/{compilerVersion}/{placeId}.json
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
  if (typeof v !== 'string' || !VERSION_RE.test(v) || v.includes('..')) throw new HttpError(400, `bad compiler version: ${String(v).slice(0, 60)}`);
  return v;
}

export function checkPlace(id) {
  if (typeof id !== 'string' || !PLACE_RE.test(id)) throw new HttpError(400, `bad place id: ${String(id).slice(0, 80)}`);
  return id;
}

function int(s, name) {
  if (typeof s === 'number' && Number.isInteger(s)) return s;
  if (typeof s !== 'string' || !/^(0|[1-9][0-9]{0,9})$/.test(s)) throw new HttpError(400, `bad tile ${name}`);
  return Number(s);
}

// { version, z, x, y } with z inside [minZoom, maxZoom] and x, y inside the zoom's grid.
export function parseTileKey(version, z, x, y, { minZoom = 0, maxZoom = 22 } = {}) {
  checkVersion(version);
  const Z = int(z, 'z'), X = int(x, 'x'), Y = int(y, 'y');
  if (Z < minZoom || Z > maxZoom) throw new HttpError(400, `tile z ${Z} outside ${minZoom}..${maxZoom}`);
  const n = 2 ** Z;
  if (X >= n || Y >= n) throw new HttpError(400, `tile ${Z}/${X}/${Y} outside the grid`);
  return { version, z: Z, x: X, y: Y };
}

export const tileStorageKey = (k) => `tiles/${k.version}/${k.z}/${k.x}/${k.y}`;
export const manifestStorageKey = (version, placeId) => `manifests/${version}/${placeId}.json`;
export const tileId = (k) => `${k.z}/${k.x}/${k.y}`;

// Web-Mercator (slippy map) tile maths.
export function lonToX(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
export function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
export function tileBbox(z, x, y) {
  const n = 2 ** z;
  const lon = (i) => (i / n) * 360 - 180;
  const lat = (j) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)]; // [west, south, east, north]
}

// Every tile at zoom z touching bbox [w, s, e, n], row-major (y, then x): the order is part of the manifest's bytes.
export function tilesForBbox(bbox, z, maxTiles = 1024) {
  const [w, s, e, n] = bbox;
  if (![w, s, e, n].every(Number.isFinite) || w >= e || s >= n || s < -85 || n > 85) throw new HttpError(400, 'bad bbox');
  const x0 = lonToX(w, z), x1 = lonToX(e, z), y0 = latToY(n, z), y1 = latToY(s, z);
  const count = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (count > maxTiles) throw new HttpError(413, `place covers ${count} tiles at z${z}, over the ${maxTiles} cap`);
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ z, x, y });
  return out;
}
