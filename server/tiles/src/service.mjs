// The tile service core (no HTTP): compile-on-first-request + cache forever, keyed by compiler version.
//
//   getTile(version, z, x, y)        LRU -> store -> (single-flight) compile -> store(ifAbsent) -> serve the stored bytes
//   getManifest(placeId, version?)   the place's tile set at that version: every tile's content hash + the tileSetHash
//   createLock(placeId, version?)    { placeId, compilerVersion, tileSetHash }: what a Mog stores to keep its city LOCKED
//   resolveLock(lock)                the manifest that lock names; 409 if the stored manifest (its meta or its tile list)
//                                    does not hash to the lock's tileSetHash
//   getLockedTile(lock, z, x, y)     a tile of the locked tile set, checked against the lock's manifest on every read;
//                                    a lost tile is recompiled with the pinned compiler (stored only if it matches),
//                                    or 410 when that compiler is gone; 409 if the bytes differ from the manifest
//   verifyLock(lock)                 re-reads every tile's bytes and re-hashes them (the reproducibility proof); repairs
//                                    lost tiles the same way getLockedTile does
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
  const stats = { compiles: 0, compileErrors: 0, storeHits: 0, lruHits: 0, lostRaces: 0, lockMismatches: 0, lockRepairs: 0 };

  const remember = (k, entry) => { lru.set(k, entry, entry.body.length + 512); return entry; };

  async function fromStore(k) {
    const o = await store.get(k);
    if (!o) return null;
    stats.storeHits++;
    return remember(k, { body: o.body, meta: o.meta });
  }

  // expect = { hash, contentHash, lock } when the tile is read under a city lock: bytes that do not match the lock's
  // manifest are refused and NOT stored (storing them would make the lock unresolvable for good).
  async function compileAndStore(key, k, expect) {
    const compiler = compilers.get(key.version);
    if (!compiler) {
      if (expect) throw new HttpError(410, `tile ${tileId(key)} of locked tile set ${expect.lock} is missing from storage, and compiler version ${key.version} is not available to rebuild it`);
      throw new HttpError(404, `no tile ${tileId(key)} at compiler version ${key.version} (not cached, and that version has no compiler)`);
    }
    const t0 = Date.now();
    let out;
    try {
      out = await compileSlots.run(() => compiler.compileTile({ ...key, bbox: tileBbox(key.z, key.x, key.y) }));
    } catch (e) {
      stats.compileErrors++;
      throw new HttpError(502, `compile failed for ${key.version}/${tileId(key)}: ${e.message}`);
    }
    let body, contentEncoding, raw;
    try {
      if (!out || out.body == null) throw new Error('no body');
      body = Buffer.from(out.body);
      contentEncoding = out.contentEncoding || 'identity';
      if (!ENCODINGS.has(contentEncoding)) throw new Error(`unknown encoding ${contentEncoding}`);
      raw = decode(body, contentEncoding); // also proves the bytes decode before they are cached forever
    } catch (e) {
      // Output that cannot be stored is a failed compile, not a server bug: 502, counted as such, nothing cached.
      stats.compileErrors++;
      throw new HttpError(502, `compile failed for ${key.version}/${tileId(key)}: unusable compiler output (${e.message})`);
    }
    stats.compiles++;
    const meta = {
      contentType: out.contentType || 'application/octet-stream', contentEncoding,
      hash: sha256(body), contentHash: sha256(raw), bytes: body.length, rawBytes: raw.length,
      compilerVersion: key.version, tile: tileId(key),
    };
    if (expect && (meta.hash !== expect.hash || meta.contentHash !== expect.contentHash)) {
      stats.lockMismatches++;
      throw new HttpError(409, `tile ${tileId(key)} recompiled at ${key.version} does not match locked tile set ${expect.lock} (content ${meta.contentHash}, lock ${expect.contentHash}); not stored`);
    }
    const { created } = await store.put(k, body, meta, { ifAbsent: true });
    log({ event: 'compiled', key: k, ms: Date.now() - t0, bytes: body.length, created });
    if (!created) {
      // Another process stored this key first: serve ITS bytes, so every client of this key sees one set of bytes.
      stats.lostRaces++;
      const won = await fromStore(k);
      if (won) return { ...won, source: 'store' };
      // The store says the key exists but it cannot be read back yet: never serve bytes that are not the stored copy.
      throw new HttpError(503, `tile ${key.version}/${tileId(key)} was stored by another writer but is not readable yet; retry`);
    }
    if (expect) stats.lockRepairs++;
    return { ...remember(k, { body, meta }), source: 'compiled' };
  }

  function tileEntry(key, expect) {
    const k = tileStorageKey(key);
    const hit = lru.get(k);
    if (hit) { stats.lruHits++; return Promise.resolve({ ...hit, source: 'memory' }); }
    return flight.do(k, async () => {
      const stored = await fromStore(k);
      if (stored) return { ...stored, source: 'store' };
      return compileAndStore(key, k, expect);
    });
  }

  async function getTile(version, z, x, y) {
    return tileEntry(parseTileKey(version, z, x, y, { minZoom, maxZoom }));
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
      if (!created) {
        const won = await fromStore(k);
        if (won) return { ...won, source: 'store' };
        throw new HttpError(503, `manifest ${placeId}@${version} was stored by another writer but is not readable yet; retry`);
      }
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

  // A manifest body parsed once: the tile index for locked reads and the tile set hash recomputed from its tile list.
  const parsedManifests = new WeakMap();
  function parseManifest(entry) {
    let p = parsedManifests.get(entry.body);
    if (!p) {
      const manifest = JSON.parse(entry.body.toString('utf8'));
      p = { manifest, index: new Map(manifest.tiles.map((t) => [tileId(t), t])), tileSetHash: tileSetHash(manifest.tiles) };
      parsedManifests.set(entry.body, p);
    }
    return p;
  }

  const lockId = (lock) => `${lock.placeId}@${lock.compilerVersion}#${lock.tileSetHash.slice(0, 12)}`;

  async function resolveLock(lock) {
    checkLock(lock);
    const entry = await getManifest(lock.placeId, lock.compilerVersion);
    const p = parseManifest(entry);
    if (entry.meta.tileSetHash !== lock.tileSetHash || p.tileSetHash !== lock.tileSetHash
      || p.manifest.placeId !== lock.placeId || p.manifest.compilerVersion !== lock.compilerVersion) {
      throw new HttpError(409, `lock mismatch for ${lock.placeId}@${lock.compilerVersion}: stored tile set ${entry.meta.tileSetHash} (tile list hashes to ${p.tileSetHash}), lock ${lock.tileSetHash}`);
    }
    return entry;
  }

  async function lockedTile(lock, t) {
    const key = { version: lock.compilerVersion, z: t.z, x: t.x, y: t.y };
    const e = await tileEntry(key, { hash: t.hash, contentHash: t.contentHash, lock: lockId(lock) });
    if (e.meta.hash !== t.hash || e.meta.contentHash !== t.contentHash) {
      stats.lockMismatches++;
      throw new HttpError(409, `tile ${tileId(t)} stored at ${lock.compilerVersion} does not match locked tile set ${lockId(lock)}`);
    }
    return e;
  }

  // A tile of a locked city: only tiles the lock's manifest lists, checked against the manifest on every read.
  async function getLockedTile(lock, z, x, y) {
    const entry = await resolveLock(lock);
    const key = parseTileKey(lock.compilerVersion, z, x, y, { minZoom, maxZoom });
    const t = parseManifest(entry).index.get(tileId(key));
    if (!t) throw new HttpError(404, `tile ${tileId(key)} is not in locked tile set ${lockId(lock)}`);
    return lockedTile(lock, t);
  }

  // The proof: every tile the lock's manifest lists is read back and re-hashed, and the tile set is re-hashed.
  // A lost tile is rebuilt with the pinned compiler when it is still registered (and kept only if it matches).
  async function verifyLock(lock) {
    const entry = await resolveLock(lock);
    const m = parseManifest(entry).manifest;
    let repaired = 0;
    const tiles = await mapLimit(m.tiles, manifestConcurrency, async (t) => {
      const e = await lockedTile(lock, t);
      if (e.source === 'compiled') repaired++;
      const contentHash = sha256(decode(e.body, e.meta.contentEncoding));
      if (contentHash !== t.contentHash || sha256(e.body) !== t.hash) throw new HttpError(409, `tile ${t.z}/${t.x}/${t.y} changed under lock`);
      return { ...t, contentHash };
    });
    const h = tileSetHash(tiles);
    if (h !== lock.tileSetHash) throw new HttpError(409, 'tile set hash changed under lock');
    return { ok: true, tiles: tiles.length, bytes: m.bytes, tileSetHash: h, repaired };
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
    getTile, getManifest, createLock, resolveLock, getLockedTile, verifyLock, prewarmPlace,
    stats, lru, flight, store, compilers, currentVersion, zoom,
  };
}
