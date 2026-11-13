// The tile service core (no HTTP): compile-on-first-request + cache forever, keyed by compiler version.
//
//   getTile(version, z, x, y)        LRU -> store -> (single-flight) compile -> store(ifAbsent) -> serve the stored bytes
//   getManifest(placeId, version?)   the place's tile set at that version: every tile's content hash + the tileSetHash
//   createLock(placeId, version?)    { placeId, compilerVersion, tileSetHash }: what a Mog stores to keep its city LOCKED
//   resolveLock(lock)                the manifest that lock names; 409 if the stored tile set does not hash to it
//   verifyLock(lock)                 re-reads every tile's bytes and re-hashes them (the reproducibility proof)
//   prewarmPlace(placeId, version)   compile a place's missing tiles + manifest (bin/prewarm.mjs)
import { HttpError, parseTileKey, tileStorageKey, manifestStorageKey, tileBbox, tilesForBbox, checkVersion, checkPlace, HASH_RE, tileId } from './keys.mjs';
import { LRU } from './lru.mjs';
import { SingleFlight } from './singleflight.mjs';
import { sha256, decode, semaphore, mapLimit, stableJson } from './util.mjs';

const ENCODINGS = new Set(['identity', 'gzip', 'br']);
export const MANIFEST_FORMAT = 'hometown-tileset';
export const LOCK_FORMAT = 'hometown-city-lock';

export function tileSetHash(tiles) {
  // One line per tile, in manifest order: "z/x/y <sha256 of the tile's decoded content>"
  return sha256(tiles.map((t) => `${t.z}/${t.x}/${t.y} ${t.contentHash}\n`).join(''));
}

export function createTileService({
  store, compilers, places, currentVersion,
  zoom = 16, minZoom = 10, maxZoom = 18, maxTilesPerPlace = 1024,
  lru = new LRU(), maxConcurrentCompiles = 4, manifestConcurrency = 8, log = () => {},
}) {
  if (!store) throw new Error('tile service needs a store');
  if (currentVersion) checkVersion(currentVersion);
  const flight = new SingleFlight();
  const compileSlots = semaphore(maxConcurrentCompiles);
  const stats = { compiles: 0, compileErrors: 0, storeHits: 0, lruHits: 0, lostRaces: 0 };

  const remember = (k, entry) => { lru.set(k, entry, entry.body.length + 512); return entry; };

  async function fromStore(k) {
    const o = await store.get(k);
    if (!o) return null;
    stats.storeHits++;
    return remember(k, { body: o.body, meta: o.meta });
  }

  async function compileAndStore(key, k) {
    const compiler = compilers.get(key.version);
    if (!compiler) throw new HttpError(404, `no tile ${tileId(key)} at compiler version ${key.version} (not cached, and that version has no compiler)`);
    const t0 = Date.now();
    let out;
    try {
      out = await compileSlots.run(() => compiler.compileTile({ ...key, bbox: tileBbox(key.z, key.x, key.y) }));
    } catch (e) {
      stats.compileErrors++;
      throw new HttpError(502, `compile failed for ${key.version}/${tileId(key)}: ${e.message}`);
    }
    stats.compiles++;
    const body = Buffer.from(out.body);
    const contentEncoding = out.contentEncoding || 'identity';
    if (!ENCODINGS.has(contentEncoding)) throw new HttpError(502, `compiler returned unknown encoding ${contentEncoding}`);
    const raw = decode(body, contentEncoding); // also proves the bytes decode before they are cached forever
    const meta = {
      contentType: out.contentType || 'application/octet-stream', contentEncoding,
      hash: sha256(body), contentHash: sha256(raw), bytes: body.length, rawBytes: raw.length,
      compilerVersion: key.version, tile: tileId(key),
    };
    const { created } = await store.put(k, body, meta, { ifAbsent: true });
    log({ event: 'compiled', key: k, ms: Date.now() - t0, bytes: body.length, created });
    if (!created) {
      // Another process stored this key first: serve ITS bytes, so every client of this key sees one set of bytes.
      stats.lostRaces++;
      const won = await fromStore(k);
      if (won) return { ...won, source: 'store' };
    }
    return { ...remember(k, { body, meta }), source: 'compiled' };
  }

  async function getTile(version, z, x, y) {
    const key = parseTileKey(version, z, x, y, { minZoom, maxZoom });
    const k = tileStorageKey(key);
    const hit = lru.get(k);
    if (hit) { stats.lruHits++; return { ...hit, source: 'memory' }; }
    return flight.do(k, async () => {
      const stored = await fromStore(k);
      if (stored) return { ...stored, source: 'store' };
      return compileAndStore(key, k);
    });
  }

  async function buildManifest(placeId, version) {
    const place = await places.resolve(placeId);
    if (!place) throw new HttpError(404, `unknown place ${placeId}`);
    const list = tilesForBbox(place.bbox, zoom, maxTilesPerPlace);
    const tiles = await mapLimit(list, manifestConcurrency, async (t) => {
      const e = await getTile(version, t.z, t.x, t.y);
      return { z: t.z, x: t.x, y: t.y, contentHash: e.meta.contentHash, hash: e.meta.hash, bytes: e.meta.bytes };
    });
    const manifest = {
      format: MANIFEST_FORMAT, formatVersion: 1,
      placeId, name: place.name, bbox: place.bbox, compilerVersion: version, zoom,
      tileCount: tiles.length, bytes: tiles.reduce((a, t) => a + t.bytes, 0),
      tileSetHash: tileSetHash(tiles),
      tileUrl: `/tiles/${version}/{z}/{x}/{y}`,
      tiles,
    };
    return manifest;
  }

  async function getManifest(placeId, version = currentVersion) {
    checkPlace(placeId);
    if (!version) throw new HttpError(400, 'no compiler version given and the service has no current version');
    checkVersion(version);
    const k = manifestStorageKey(version, placeId);
    const hit = lru.get(k);
    if (hit) return { ...hit, source: 'memory' };
    return flight.do(k, async () => {
      const stored = await fromStore(k);
      if (stored) return { ...stored, source: 'store' };
      // Only build manifests for versions this service can compile: an old pinned version resolves from storage only.
      if (!compilers.has(version)) throw new HttpError(404, `no manifest for ${placeId} at compiler version ${version}`);
      const m = await buildManifest(placeId, version);
      const body = Buffer.from(stableJson(m));
      const meta = { contentType: 'application/json', contentEncoding: 'identity', hash: sha256(body), contentHash: sha256(body), bytes: body.length, rawBytes: body.length, tileSetHash: m.tileSetHash };
      const { created } = await store.put(k, body, meta, { ifAbsent: true });
      if (!created) { const won = await fromStore(k); if (won) return { ...won, source: 'store' }; }
      return { ...remember(k, { body, meta }), source: 'compiled' };
    });
  }

  const manifestJson = async (placeId, version) => JSON.parse((await getManifest(placeId, version)).body.toString('utf8'));

  async function createLock(placeId, version = currentVersion) {
    const m = await manifestJson(placeId, version);
    return { format: LOCK_FORMAT, formatVersion: 1, placeId: m.placeId, compilerVersion: m.compilerVersion, tileSetHash: m.tileSetHash };
  }

  function checkLock(lock) {
    if (!lock || typeof lock !== 'object') throw new HttpError(400, 'bad lock');
    checkPlace(lock.placeId);
    checkVersion(lock.compilerVersion);
    if (typeof lock.tileSetHash !== 'string' || !HASH_RE.test(lock.tileSetHash)) throw new HttpError(400, 'bad lock tileSetHash');
    return lock;
  }

  async function resolveLock(lock) {
    checkLock(lock);
    const entry = await getManifest(lock.placeId, lock.compilerVersion);
    if (entry.meta.tileSetHash !== lock.tileSetHash) {
      throw new HttpError(409, `lock mismatch for ${lock.placeId}@${lock.compilerVersion}: stored tile set ${entry.meta.tileSetHash}, lock ${lock.tileSetHash}`);
    }
    return entry;
  }

  // The proof: every tile the lock's manifest lists is read back and re-hashed, and the tile set is re-hashed.
  async function verifyLock(lock) {
    const entry = await resolveLock(lock);
    const m = JSON.parse(entry.body.toString('utf8'));
    const tiles = await mapLimit(m.tiles, manifestConcurrency, async (t) => {
      const e = await getTile(m.compilerVersion, t.z, t.x, t.y);
      const contentHash = sha256(decode(e.body, e.meta.contentEncoding));
      if (contentHash !== t.contentHash || sha256(e.body) !== t.hash) throw new HttpError(409, `tile ${t.z}/${t.x}/${t.y} changed under lock`);
      return { ...t, contentHash };
    });
    const h = tileSetHash(tiles);
    if (h !== lock.tileSetHash) throw new HttpError(409, 'tile set hash changed under lock');
    return { ok: true, tiles: tiles.length, bytes: m.bytes, tileSetHash: h };
  }

  async function prewarmPlace(placeId, version = currentVersion) {
    const before = stats.compiles;
    const entry = await getManifest(placeId, version);
    const m = JSON.parse(entry.body.toString('utf8'));
    // A manifest read from storage still has its tiles checked (a store wiped of tiles but not manifests heals here).
    if (entry.source === 'store') await mapLimit(m.tiles, manifestConcurrency, (t) => getTile(version, t.z, t.x, t.y));
    return { placeId, version, tiles: m.tileCount, bytes: m.bytes, tileSetHash: m.tileSetHash, compiled: stats.compiles - before };
  }

  return {
    getTile, getManifest, createLock, resolveLock, verifyLock, prewarmPlace,
    stats, lru, flight, store, compilers, currentVersion, zoom,
  };
}
