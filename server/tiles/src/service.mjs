// The tile service core (no HTTP) on the national grid hg1: compile-on-first-request + cache forever, keyed by buildId
// (htc-{compilerVersion}-hg1-b{8 hex}: compiler version, libraries, image, Overture release, DEM snapshot, grid).
//
//   getTile(buildId, 'hg1-conus', 0, c, r)   LRU -> store -> (single-flight on the tile, then on its L2 BLOCK) compile the
//                                            block in one process, its 16 children stored ifAbsent -> serve the stored bytes
//   getCtx(buildId, 'hg1-conus', 4, C, R)    a context block (internal / admin)
//   getManifest(placeId, buildId?)           the place's session descriptor + tile set: the tile ids come only from the
//                                            compiler's descriptor (stage 1, Python), every tile's content hash, the
//                                            tileSetHash (sha256 over sorted 'hg1-{d}/0/{c}/{r} {sha256}' lines), and
//                                            stage 2's pinned yOffset / waterLevel (a failed stage 2 stores nothing)
//   createLock(placeId, buildId?)            lock v2 { format, formatVersion 2, place, buildId, grid, domain, origin {c0, r0},
//                                            k0, gamma0, yOffset, waterLevel, tiles: tileSetHash }: what a Mog stores
//   resolveLock(lock)                        the manifest the lock names; 409 on any mismatch (tile set, origin, k0, ...)
//   getLockedTile(lock, gd, L, c, r)         a tile of the locked set, checked against the manifest on every read (a lost
//                                            one is rebuilt by the pinned build only if it matches); a tile OUTSIDE the
//                                            set is served unlocked at the same buildId (compiled on demand while the
//                                            build is registered, 410 after: the edge of that world)
//   verifyLock(lock)                         every tile re-read and re-hashed (the reproducibility proof)
//   prewarmPlace(placeId, buildId)           compile a place's tiles + manifest (bin/prewarm.mjs)
// An unregistered buildId never compiles anything: a tile not in the store is 410.
import { HttpError, parseTileKey, parseCtxKey, tileStorageKey, ctxStorageKey, manifestStorageKey, buildStorageKey, checkVersion, checkPlace, HASH_RE, tileId, blockOf, blockId, blockChildren } from './keys.mjs';
import { GRID, DOMAINS, parseTileId } from './grid.mjs';
import { LRU } from './lru.mjs';
import { SingleFlight } from './singleflight.mjs';
import { sha256, decode, semaphore, mapLimit, stableJson } from './util.mjs';

const ENCODINGS = new Set(['identity', 'gzip', 'br']);
export const MANIFEST_FORMAT = 'hometown-tileset';
export const LOCK_FORMAT = 'hometown-city-lock';

// sorted lines '<id> <sha256 of the decoded tile>\n' (identical code in tools/hometown/assemble.py tile_set_hash and
// GameMog's storykit/hometown/city-package.ts)
export function tileSetHash(tiles) {
  return sha256(tiles.map((t) => `${t.id} ${t.contentHash ?? t.sha256}\n`).sort().join(''));
}

export function createTileService({
  store, compilers, places, currentVersion, blockLevel = 2, maxTilesPerPlace = 1024,
  lru = new LRU(), maxConcurrentCompiles = 4, manifestConcurrency = 8, log = () => {},
}) {
  if (!store) throw new Error('tile service needs a store');
  if (currentVersion) checkVersion(currentVersion);
  const flight = new SingleFlight();
  const compileSlots = semaphore(maxConcurrentCompiles);
  const stats = { compiles: 0, blockCompiles: 0, compileErrors: 0, refused: 0, storeHits: 0, lruHits: 0, lostRaces: 0, lockMismatches: 0, lockRepairs: 0, unlockedServed: 0 };

  const remember = (k, entry) => { lru.set(k, entry, entry.body.length + 512); return entry; };

  async function fromStore(k) {
    const o = await store.get(k);
    if (!o) return null;
    stats.storeHits++;
    return remember(k, { body: o.body, meta: o.meta });
  }

  // compiler output -> { body, meta } checked (decodes) before it can be cached forever
  function checked(key, out, what) {
    let body, contentEncoding, raw;
    try {
      if (!out || out.body == null) throw new Error('no body');
      body = Buffer.from(out.body);
      contentEncoding = out.contentEncoding || 'identity';
      if (!ENCODINGS.has(contentEncoding)) throw new Error(`unknown encoding ${contentEncoding}`);
      raw = decode(body, contentEncoding);
    } catch (e) {
      stats.compileErrors++;
      throw new HttpError(502, `compile failed for ${key.buildId}/${what}: unusable compiler output (${e.message})`);
    }
    return { body, meta: { contentType: out.contentType || 'application/octet-stream', contentEncoding, hash: sha256(body), contentHash: sha256(raw), bytes: body.length, rawBytes: raw.length, buildId: key.buildId, tile: what } };
  }

  function compilerFor(key, expect) {
    const compiler = compilers.get(key.buildId);
    if (!compiler) {
      if (expect) throw new HttpError(410, `tile ${tileId(key)} of locked tile set ${expect.lock} is missing from storage, and build ${key.buildId} is not available to rebuild it`);
      throw new HttpError(410, `no tile ${tileId(key)} in build ${key.buildId}: not stored, and that build is not registered (the edge of its world)`);
    }
    return compiler;
  }

  async function run(fn, what) {
    try { return await compileSlots.run(fn); } catch (e) {
      if (e instanceof HttpError) throw e;
      if (e && e.refused) { stats.refused++; throw new HttpError(422, `${what} refused by the compiler: ${e.refused}`); }
      stats.compileErrors++;
      throw new HttpError(502, `compile failed for ${what}: ${e.message}`);
    }
  }

  async function storeOne(k, entry, key) {
    const { created } = await store.put(k, entry.body, entry.meta, { ifAbsent: true });
    if (!created) {
      stats.lostRaces++;
      const won = await fromStore(k);
      if (won) return { ...won, source: 'store' };
      throw new HttpError(503, `${k} was stored by another writer but is not readable yet; retry`);
    }
    return { ...remember(k, entry), source: 'compiled' };
  }

  // one tile on its own (lock repairs; compilers without block mode). expect = { hash, contentHash, lock }: bytes that
  // do not match the lock's manifest are refused and NOT stored.
  async function compileOne(key, k, expect) {
    const compiler = compilerFor(key, expect);
    const t0 = Date.now();
    const out = await run(() => compiler.compileTile(key), `${key.buildId}/${tileId(key)}`);
    const entry = checked(key, out, tileId(key));
    stats.compiles++;
    if (expect && (entry.meta.hash !== expect.hash || entry.meta.contentHash !== expect.contentHash)) {
      stats.lockMismatches++;
      throw new HttpError(409, `tile ${tileId(key)} recompiled at ${key.buildId} does not match locked tile set ${expect.lock} (content ${entry.meta.contentHash}, lock ${expect.contentHash}); not stored`);
    }
    const e = await storeOne(k, entry, key);
    log({ event: 'compiled', key: k, ms: Date.now() - t0, bytes: entry.body.length });
    if (expect && e.source === 'compiled') stats.lockRepairs++;
    return e;
  }

  // the tile's L2 block compiled in one process; every child stored ifAbsent (single-flight on the block: N concurrent
  // GETs of any of its 16 tiles = one compile)
  function compileBlock(key) {
    const blk = blockOf(key, blockLevel);
    const bk = `block:${key.buildId}:${blockId(blk)}`;
    return flight.do(bk, async () => {
      const compiler = compilerFor(key);
      const t0 = Date.now();
      const out = await run(() => compiler.compileBlock(blk), `${key.buildId}/${blockId(blk)}`);
      stats.blockCompiles++;
      const want = new Map(blockChildren(blk).map((ch) => [ch.id, ch]));
      const res = new Map();
      for (const ch of out?.children || []) {
        const ck = want.get(ch.id);
        if (!ck) { stats.compileErrors++; throw new HttpError(502, `compile of ${blockId(blk)} returned a tile outside it: ${ch.id}`); }
        if (ch.refused) { res.set(ch.id, { refused: ch.refused }); continue; }
        const entry = checked(ck, ch, ch.id);
        stats.compiles++;
        res.set(ch.id, await storeOne(tileStorageKey(ck), entry, ck));
      }
      log({ event: 'compiled-block', block: blockId(blk), ms: Date.now() - t0, children: res.size });
      return res;
    });
  }

  function tileEntry(key, expect) {
    const k = tileStorageKey(key);
    const hit = lru.get(k);
    if (hit) { stats.lruHits++; return Promise.resolve({ ...hit, source: 'memory' }); }
    return flight.do(k, async () => {
      const stored = await fromStore(k);
      if (stored) return { ...stored, source: 'store' };
      const compiler = compilerFor(key, expect);
      if (expect || !blockLevel || typeof compiler.compileBlock !== 'function') return compileOne(key, k, expect);
      const res = await compileBlock(key);
      const mine = res.get(key.id);
      if (mine?.refused) { stats.refused++; throw new HttpError(422, `tile ${key.id} refused by the compiler: ${mine.refused}`); }
      if (mine) return mine;
      // (the block's children are stored; a block another process compiled first)
      const again = await fromStore(k);
      if (again) return { ...again, source: 'store' };
      throw new HttpError(502, `compile of ${blockId(blockOf(key, blockLevel))} did not produce ${key.id}`);
    });
  }

  async function getTile(buildId, gd, L, c, r) {
    return tileEntry(parseTileKey(buildId, gd, L, c, r));
  }

  async function getCtx(buildId, gd, L, C, R) {
    const key = parseCtxKey(buildId, gd, L, C, R);
    const k = ctxStorageKey(key);
    const hit = lru.get(k);
    if (hit) { stats.lruHits++; return { ...hit, source: 'memory' }; }
    return flight.do(k, async () => {
      const stored = await fromStore(k);
      if (stored) return { ...stored, source: 'store' };
      const compiler = compilerFor(key);
      if (typeof compiler.compileCtx !== 'function') throw new HttpError(404, `build ${buildId} has no context-block compiler`);
      const out = await run(() => compiler.compileCtx(key), `${buildId}/${tileId(key)}`);
      return storeOne(k, checked(key, out, tileId(key)), key);
    });
  }

  async function registerBuild(buildId) {
    const compiler = compilers.get(buildId);
    if (!compiler?.buildRecord) return null;
    const rec = Buffer.from(stableJson(await compiler.buildRecord()));
    await store.put(buildStorageKey(buildId), rec, { contentType: 'application/json', contentEncoding: 'identity', hash: sha256(rec), contentHash: sha256(rec), bytes: rec.length, rawBytes: rec.length }, { ifAbsent: true });
    return rec;
  }

  async function buildManifest(placeId, buildId) {
    const place = await places.resolve(placeId);
    if (!place) throw new HttpError(404, `unknown place ${placeId}`);
    const compiler = compilers.get(buildId);
    await registerBuild(buildId);
    // (the tile list is the compiler's: Python owns the projection; the service never derives it)
    const d1 = await run(() => compiler.describePlace(place, 1), `${buildId}/${placeId} descriptor`);
    if (!d1 || !DOMAINS[d1.domain] || !Array.isArray(d1.tiles)) throw new HttpError(502, `descriptor for ${placeId} is unusable`);
    if (d1.tiles.length > maxTilesPerPlace) throw new HttpError(413, `place covers ${d1.tiles.length} tiles, over the ${maxTilesPerPlace} cap`);
    const ids = d1.tiles.map((id) => { try { return parseTileId(id); } catch (e) { throw new HttpError(502, `descriptor tile ${id}: ${e.message}`); } });
    const tiles = await mapLimit(ids, manifestConcurrency, async (t) => {
      const e = await tileEntry({ buildId, grid: GRID, domain: t.domain, L: 0, c: t.c, r: t.r, id: t.id });
      return { id: t.id, contentHash: e.meta.contentHash, hash: e.meta.hash, bytes: e.meta.bytes };
    });
    // stage 2 pins the session's height datum and engine water level, which a lock carries and resolveLock checks: a
    // manifest stored without them would be served (and locked) forever with nulls. A failed or unusable stage 2 fails
    // the request instead, and nothing is stored, so the next request tries again.
    const d2 = await run(() => compiler.describePlace(place, 2), `${buildId}/${placeId} descriptor stage 2`);
    if (!d2 || !Number.isFinite(d2.yOffset) || !Number.isFinite(d2.waterLevel)) throw new HttpError(502, `descriptor stage 2 for ${placeId} has no yOffset / waterLevel; manifest not stored`);
    return {
      format: MANIFEST_FORMAT, formatVersion: 2,
      placeId, name: place.name, buildId, grid: GRID, domain: d1.domain,
      origin: { c0: d1.origin.c0, r0: d1.origin.r0 }, k0: d1.k0, gamma0: d1.gamma0, anchor: d1.anchor || null, playBox: d1.playBox || null,
      yOffset: d2.yOffset, waterLevel: d2.waterLevel,
      tileCount: tiles.length, bytes: tiles.reduce((a, t) => a + t.bytes, 0),
      tileSetHash: tileSetHash(tiles),
      tileUrl: `/tiles/${buildId}/${GRID}-${d1.domain}/0/{c}/{r}`,
      tiles,
    };
  }

  async function getManifest(placeId, buildId = currentVersion) {
    checkPlace(placeId);
    if (!buildId) throw new HttpError(400, 'no build id given and the service has no current build');
    checkVersion(buildId);
    const k = manifestStorageKey(buildId, placeId);
    const hit = lru.get(k);
    if (hit) return { ...hit, source: 'memory' };
    return flight.do(k, async () => {
      const stored = await fromStore(k);
      if (stored) return { ...stored, source: 'store' };
      if (!compilers.has(buildId)) throw new HttpError(404, `no manifest for ${placeId} in build ${buildId}`);
      const m = await buildManifest(placeId, buildId);
      const body = Buffer.from(stableJson(m));
      const meta = { contentType: 'application/json', contentEncoding: 'identity', hash: sha256(body), contentHash: sha256(body), bytes: body.length, rawBytes: body.length, tileSetHash: m.tileSetHash };
      return storeOne(k, { body, meta }, { buildId });
    });
  }

  const manifestJson = async (placeId, buildId) => JSON.parse((await getManifest(placeId, buildId)).body.toString('utf8'));

  async function createLock(placeId, buildId = currentVersion) {
    const m = await manifestJson(placeId, buildId);
    return { format: LOCK_FORMAT, formatVersion: 2, place: m.placeId, buildId: m.buildId, grid: m.grid, domain: m.domain, origin: m.origin,
      k0: m.k0, gamma0: m.gamma0, yOffset: m.yOffset, waterLevel: m.waterLevel, tiles: m.tileSetHash };
  }

  // a lock v2, or the parts a lock URL carries ({ place, buildId, tiles })
  function checkLock(lock) {
    if (!lock || typeof lock !== 'object') throw new HttpError(400, 'bad lock');
    checkPlace(lock.place);
    checkVersion(lock.buildId);
    if (typeof lock.tiles !== 'string' || !HASH_RE.test(lock.tiles)) throw new HttpError(400, 'bad lock tile set hash');
    if (lock.formatVersion != null && (lock.format !== LOCK_FORMAT || lock.formatVersion !== 2)) throw new HttpError(400, 'not a lock v2');
    if (lock.grid != null && lock.grid !== GRID) throw new HttpError(400, `lock on grid ${lock.grid}, this service serves ${GRID}`);
    if (lock.domain != null && !DOMAINS[lock.domain]) throw new HttpError(400, 'bad lock domain');
    return lock;
  }

  const parsedManifests = new WeakMap();
  function parseManifest(entry) {
    let p = parsedManifests.get(entry.body);
    if (!p) {
      const manifest = JSON.parse(entry.body.toString('utf8'));
      p = { manifest, index: new Map(manifest.tiles.map((t) => [t.id, t])), tileSetHash: tileSetHash(manifest.tiles) };
      parsedManifests.set(entry.body, p);
    }
    return p;
  }

  const lockId = (lock) => `${lock.place}@${lock.buildId}#${lock.tiles.slice(0, 12)}`;

  async function resolveLock(lock) {
    checkLock(lock);
    const entry = await getManifest(lock.place, lock.buildId);
    const p = parseManifest(entry), m = p.manifest;
    const bad = [];
    if (entry.meta.tileSetHash !== lock.tiles || p.tileSetHash !== lock.tiles) bad.push(`tile set ${p.tileSetHash}`);
    if (m.placeId !== lock.place || m.buildId !== lock.buildId) bad.push('place / build');
    // (the frame a Mog's story coordinates are relative to: a lock whose origin or scale differs is refused)
    if (lock.domain != null && lock.domain !== m.domain) bad.push(`domain ${m.domain}`);
    if (lock.origin != null && (lock.origin.c0 !== m.origin.c0 || lock.origin.r0 !== m.origin.r0)) bad.push(`origin ${m.origin.c0},${m.origin.r0}`);
    if (lock.k0 != null && lock.k0 !== m.k0) bad.push(`k0 ${m.k0}`);
    if (lock.gamma0 != null && lock.gamma0 !== m.gamma0) bad.push(`gamma0 ${m.gamma0}`);
    if (lock.yOffset != null && m.yOffset != null && lock.yOffset !== m.yOffset) bad.push(`yOffset ${m.yOffset}`);
    if (lock.waterLevel != null && m.waterLevel != null && lock.waterLevel !== m.waterLevel) bad.push(`waterLevel ${m.waterLevel}`);
    if (bad.length) {
      stats.lockMismatches++;
      throw new HttpError(409, `lock mismatch for ${lockId(lock)}: stored ${bad.join(', ')}`);
    }
    return entry;
  }

  async function lockedTile(lock, t) {
    const p = parseTileId(t.id);
    const key = { buildId: lock.buildId, grid: GRID, domain: p.domain, L: 0, c: p.c, r: p.r, id: t.id };
    const e = await tileEntry(key, { hash: t.hash, contentHash: t.contentHash, lock: lockId(lock) });
    if (e.meta.hash !== t.hash || e.meta.contentHash !== t.contentHash) {
      stats.lockMismatches++;
      throw new HttpError(409, `tile ${t.id} stored in ${lock.buildId} does not match locked tile set ${lockId(lock)}`);
    }
    return e;
  }

  async function getLockedTile(lock, gd, L, c, r) {
    const entry = await resolveLock(lock);
    const key = parseTileKey(lock.buildId, gd, L, c, r);
    const t = parseManifest(entry).index.get(key.id);
    if (t) return lockedTile(lock, t);
    // outside the locked set: the same build, unlocked (compiled on demand while the build is registered, else 410)
    const e = await tileEntry(key);
    stats.unlockedServed++;
    return { ...e, unlocked: true };
  }

  async function verifyLock(lock) {
    const entry = await resolveLock(lock);
    const m = parseManifest(entry).manifest;
    let repaired = 0;
    const tiles = await mapLimit(m.tiles, manifestConcurrency, async (t) => {
      const e = await lockedTile(lock, t);
      if (e.source === 'compiled') repaired++;
      const contentHash = sha256(decode(e.body, e.meta.contentEncoding));
      if (contentHash !== t.contentHash || sha256(e.body) !== t.hash) throw new HttpError(409, `tile ${t.id} changed under lock`);
      return { ...t, contentHash };
    });
    const h = tileSetHash(tiles);
    if (h !== lock.tiles) throw new HttpError(409, 'tile set hash changed under lock');
    return { ok: true, tiles: tiles.length, bytes: m.bytes, tileSetHash: h, repaired };
  }

  async function prewarmPlace(placeId, buildId = currentVersion) {
    const before = stats.compiles;
    const entry = await getManifest(placeId, buildId);
    const m = JSON.parse(entry.body.toString('utf8'));
    if (entry.source === 'store') await mapLimit(m.tiles, manifestConcurrency, (t) => { const p = parseTileId(t.id); return getTile(buildId, `${GRID}-${p.domain}`, 0, p.c, p.r); });
    return { placeId, version: buildId, tiles: m.tileCount, bytes: m.bytes, tileSetHash: m.tileSetHash, compiled: stats.compiles - before, tileIds: m.tiles.map((t) => t.id) };
  }

  return {
    getTile, getCtx, getManifest, createLock, resolveLock, getLockedTile, verifyLock, prewarmPlace, registerBuild,
    stats, lru, flight, store, compilers, currentVersion, blockLevel,
  };
}
