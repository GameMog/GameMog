// Mog City's tile lifecycle (Milestone 3 groundwork, cities/sf/docs/STREAMING.md): a city served as square tiles
// around the player, each loaded at the level of detail of the ring it is in, kept in an LRU once it is out of every
// ring, and unloaded only when the budget needs the room. Built against an interface, not a file format: a TileSource
// says how a tile is fetched (today an adapter that slices the city already in memory, wagmi/world/tiles-mem.js;
// later the compiler's tiles, compiled on first request and cached by its version).
//
// TileSource (the interface):
//   id, version          the city and the compiler version: together the cache key's prefix ('sf@mem-1:12,-4')
//   grid, domain, c0, r0 optional, a source on the national grid (Hometown hg1): the key is then global,
//                        '<version = buildId>:hg1-<domain>/0/<c0 + ix>/<r0 + iz>' (STREAMING.md section 2)
//   size                 the tile's side, m (square tiles on a grid from the frame's origin: ix = floor(x / size))
//   has(ix, iz)          optional: false where the city has no tile (outside its data); never requested
//   load(ix, iz, lod)    -> Promise<tile payload>, lod 'near' | 'mid' | 'far' (what ring it is wanted for). The payload
//                        is { bytes, layers: { ... }, ms? }: the layers are the source's (heights, colliders, roads,
//                        ...), ms its own time spent (else the manager times the whole call)
//   unload(tile)         optional: the source's own clean-up when the manager drops a tile
//
// createTileManager(source, { rings, budget, concurrency, now }):
//   update(x, z)         the player is at (x, z): rings recomputed, missing or too-coarse tiles queued nearest first
//   ensureLoaded(x, z, r, lod = 'near') -> Promise<tile[]>: every tile the disc (x, z, r) touches, loaded at lod or
//                        finer (pinned until it resolves); ensureLoaded({ x, z, r }) and ({ minX, maxX, minZ, maxZ }) too
//   get(ix, iz), at(x, z), loaded()   the tiles in memory; keyOf(ix, iz) the cache key
//   on('load' | 'upgrade' | 'unload' | 'error', fn) -> off()   what systems hook (STREAMING.md: who does what)
//   stats()              counts, bytes, queue, loads, evictions, the slowest load (ms)
//   dispose()            every tile unloaded
// A tile: { key, ix, iz, lod, bounds: { minX, maxX, minZ, maxZ }, bytes, layers, ring, lastWanted }.
export const LODS = ['far', 'mid', 'near'];
const rank = (lod) => LODS.indexOf(lod);

export function createTileManager(source, opts = {}) {
  const size = source.size;
  // ring radii in tiles (Chebyshev: a square of side 2r + 1 round the player's tile)
  const rings = { near: 1, mid: 2, far: 4, ...(opts.rings || {}) };
  // the LRU's budget: tiles and bytes kept in memory, rings included (a ring always wins over the budget)
  const budget = { tiles: 160, bytes: 96e6, ...(opts.budget || {}) };
  const concurrency = Math.max(1, opts.concurrency || 2);
  const now = opts.now || (() => (globalThis.performance ? performance.now() : Date.now()));
  const tiles = new Map(); // gridKey -> tile
  const pending = new Map(); // gridKey -> { lod, promise }
  const queue = []; // { ix, iz, lod, d }
  const pins = new Map(); // gridKey -> count (ensureLoaded in flight)
  const handlers = { load: new Set(), upgrade: new Set(), unload: new Set(), error: new Set() };
  const failed = new Map(); // gridKey -> retry-after time (ms)
  const waiters = new Map(); // gridKey -> [{ lod, resolve, reject }] (ensureLoaded's)
  function settle(k, tile, error) {
    const list = waiters.get(k); if (!list) return;
    const keep = [];
    for (const w of list) { if (tile && enough(tile, w.lod)) w.resolve(tile); else if (error) w.reject(error); else keep.push(w); }
    if (keep.length) waiters.set(k, keep); else waiters.delete(k);
  }
  const st = { loads: 0, upgrades: 0, evictions: 0, errors: 0, slowestMs: 0, totalMs: 0 };
  let active = 0, center = null, wanted = new Map(), disposed = false;

  const gk = (ix, iz) => ix + ',' + iz;
  // (a source on the national grid hg1, wagmi/world/grid.js: a GLOBAL key, the build and the tile id, no city in it, so
  // neighbouring towns share entries: '<buildId>:hg1-conus/0/<c0 + ix>/<r0 + iz>'; else the city's own square grid)
  const keyOf = source.grid
    ? (ix, iz) => `${source.version}:${source.grid}-${source.domain}/0/${source.c0 + ix}/${source.r0 + iz}`
    : (ix, iz) => `${source.id}@${source.version}:${ix},${iz}`;
  const emit = (ev, ...a) => { for (const f of handlers[ev]) { try { f(...a); } catch (e) { console.warn('[tiles] ' + ev, e); } } };
  const bounds = (ix, iz) => ({ minX: ix * size, maxX: (ix + 1) * size, minZ: iz * size, maxZ: (iz + 1) * size });
  const ringOf = (ix, iz) => {
    if (!center) return null;
    const d = Math.max(Math.abs(ix - center.ix), Math.abs(iz - center.iz));
    return d <= rings.near ? 'near' : d <= rings.mid ? 'mid' : d <= rings.far ? 'far' : null;
  };
  const enough = (t, lod) => !!t && rank(t.lod) >= rank(lod);

  function request(ix, iz, lod, d) {
    const k = gk(ix, iz);
    if (source.has && !source.has(ix, iz)) return;
    if (enough(tiles.get(k), lod)) return;
    const p = pending.get(k);
    if (p && rank(p.lod) >= rank(lod)) return;
    if ((failed.get(k) || 0) > now()) return;
    const q = queue.find((e) => e.ix === ix && e.iz === iz);
    if (q) { if (rank(lod) > rank(q.lod)) q.lod = lod; q.d = Math.min(q.d, d); return; }
    queue.push({ ix, iz, lod, d });
  }

  function pump() {
    if (disposed) return;
    queue.sort((a, b) => a.d - b.d || rank(b.lod) - rank(a.lod));
    while (active < concurrency && queue.length) {
      const { ix, iz, lod } = queue.shift();
      const k = gk(ix, iz);
      if (enough(tiles.get(k), lod)) continue;
      active++;
      const t0 = now();
      const promise = Promise.resolve().then(() => source.load(ix, iz, lod)).then((payload) => {
        // (the source's own time when it says, payload.ms: a source that first waits for the city doesn't count the wait)
        const ms = Number.isFinite(payload?.ms) ? payload.ms : now() - t0;
        st.totalMs += ms; st.slowestMs = Math.max(st.slowestMs, ms);
        if (disposed) return null;
        const prev = tiles.get(k);
        if (enough(prev, lod)) { settle(k, prev); return prev; } // (a finer load finished first)
        const tile = { key: keyOf(ix, iz), ix, iz, lod, bounds: bounds(ix, iz), bytes: payload?.bytes || 0, layers: payload?.layers || {}, ring: ringOf(ix, iz), lastWanted: now() };
        tiles.set(k, tile);
        failed.delete(k);
        if (prev) { st.upgrades++; if (source.unload) source.unload(prev); emit('upgrade', tile, prev); }
        else { st.loads++; emit('load', tile); }
        settle(k, tile);
        return tile;
      }).catch((e) => {
        st.errors++;
        failed.set(k, now() + 2000);
        emit('error', { ix, iz, lod, error: e });
        settle(k, tiles.get(k), e);
        throw e;
      }).finally(() => {
        active--;
        if (pending.get(k)?.promise === promise) pending.delete(k);
        evict();
        pump();
      });
      promise.catch(() => {});
      pending.set(k, { lod, promise });
    }
  }

  // drop least recently wanted tiles outside every ring (and not pinned) while over budget
  function evict() {
    let bytes = 0; for (const t of tiles.values()) bytes += t.bytes;
    if (tiles.size <= budget.tiles && bytes <= budget.bytes) return;
    const cold = [...tiles.entries()].filter(([k, t]) => !t.ring && !pins.get(k)).sort((a, b) => a[1].lastWanted - b[1].lastWanted);
    for (const [k, t] of cold) {
      if (tiles.size <= budget.tiles && bytes <= budget.bytes) break;
      tiles.delete(k); bytes -= t.bytes; st.evictions++;
      if (source.unload) source.unload(t);
      emit('unload', t);
    }
  }

  function update(x, z) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const cx = Math.floor(x / size), cz = Math.floor(z / size);
    if (center && center.ix === cx && center.iz === cz && !queue.length && !failed.size) { pump(); return; }
    center = { ix: cx, iz: cz };
    const t = now(), next = new Map(), R = rings.far;
    for (let iz = cz - R; iz <= cz + R; iz++) for (let ix = cx - R; ix <= cx + R; ix++) {
      const lod = ringOf(ix, iz), k = gk(ix, iz);
      next.set(k, lod);
      const tile = tiles.get(k);
      if (tile) { tile.ring = lod; tile.lastWanted = t; }
      // (the tile's centre to the player, m: nearest first)
      request(ix, iz, lod, Math.hypot((ix + 0.5) * size - x, (iz + 0.5) * size - z));
    }
    for (const [k, tile] of tiles) if (!next.has(k)) tile.ring = null;
    // queued loads that fell out of every ring are dropped (unless an ensureLoaded pinned them)
    for (let i = queue.length - 1; i >= 0; i--) { const q = queue[i], k = gk(q.ix, q.iz); if (!next.has(k) && !pins.get(k)) queue.splice(i, 1); }
    wanted = next;
    evict();
    pump();
  }

  // the tiles a disc or a rectangle touches
  function cover(a, b, c) {
    let minX, maxX, minZ, maxZ;
    if (typeof a === 'number') { minX = a - (c || 0); maxX = a + (c || 0); minZ = b - (c || 0); maxZ = b + (c || 0); }
    else if (a && a.r != null) { minX = a.x - a.r; maxX = a.x + a.r; minZ = a.z - a.r; maxZ = a.z + a.r; }
    else if (a && a.minX != null) ({ minX, maxX, minZ, maxZ } = a);
    else return [];
    const out = [];
    for (let iz = Math.floor(minZ / size); iz <= Math.floor(maxZ / size); iz++) for (let ix = Math.floor(minX / size); ix <= Math.floor(maxX / size); ix++) {
      if (typeof a === 'number' || a.r != null) { // (a disc: skip the corners it doesn't reach)
        const x = typeof a === 'number' ? a : a.x, z = typeof a === 'number' ? b : a.z, r = typeof a === 'number' ? (c || 0) : a.r;
        const qx = Math.max(ix * size, Math.min(x, (ix + 1) * size)), qz = Math.max(iz * size, Math.min(z, (iz + 1) * size));
        if (Math.hypot(qx - x, qz - z) > r && !(r === 0 && ix === Math.floor(x / size) && iz === Math.floor(z / size))) continue;
      }
      if (source.has && !source.has(ix, iz)) continue;
      out.push([ix, iz]);
    }
    return out;
  }

  // ensureLoaded(x, z, r, lod) | ({ x, z, r }, lod) | ({ minX, maxX, minZ, maxZ }, lod) -> Promise<tile[]>
  function ensureLoaded(a, b, c, d) {
    const lod = typeof a === 'number' ? (d || 'near') : (b || 'near');
    if (!LODS.includes(lod)) return Promise.reject(new Error('ensureLoaded: lod ' + lod));
    const cells = typeof a === 'number' ? cover(a, b, c) : cover(a);
    const cx = typeof a === 'number' ? a : a.r != null ? a.x : (a.minX + a.maxX) / 2;
    const cz = typeof a === 'number' ? b : a.r != null ? a.z : (a.minZ + a.maxZ) / 2;
    for (const [ix, iz] of cells) { const k = gk(ix, iz); pins.set(k, (pins.get(k) || 0) + 1); failed.delete(k); request(ix, iz, lod, Math.hypot((ix + 0.5) * size - cx, (iz + 0.5) * size - cz) - 1e6); }
    pump();
    const one = ([ix, iz]) => new Promise((resolve, reject) => {
      const k = gk(ix, iz), t = tiles.get(k);
      if (enough(t, lod)) { t.lastWanted = now(); return resolve(t); }
      if (!waiters.has(k)) waiters.set(k, []);
      waiters.get(k).push({ lod, resolve, reject });
    });
    const unpin = () => { for (const [ix, iz] of cells) { const k = gk(ix, iz), n = (pins.get(k) || 1) - 1; if (n > 0) pins.set(k, n); else pins.delete(k); } evict(); };
    return Promise.all(cells.map(one)).then((r) => { unpin(); return r; }, (e) => { unpin(); throw e; });
  }

  function stats() {
    const byLod = { near: 0, mid: 0, far: 0 }, byRing = { near: 0, mid: 0, far: 0, cold: 0 };
    let bytes = 0;
    for (const t of tiles.values()) { bytes += t.bytes; byLod[t.lod]++; byRing[t.ring || 'cold']++; }
    return { source: source.grid ? `${source.version}:${source.grid}-${source.domain}` : `${source.id}@${source.version}`, size, rings, budget, tiles: tiles.size, bytes, byLod, byRing, queued: queue.length, loading: active, pinned: pins.size, center, ...st, meanMs: st.loads + st.upgrades ? +(st.totalMs / (st.loads + st.upgrades)).toFixed(2) : 0 };
  }

  function dispose() {
    disposed = true; queue.length = 0;
    for (const k of [...waiters.keys()]) settle(k, null, new Error('tiles disposed'));
    for (const t of tiles.values()) { if (source.unload) source.unload(t); emit('unload', t); }
    tiles.clear();
  }

  return {
    source, size, rings, budget, update, ensureLoaded, keyOf, stats, dispose,
    get: (ix, iz) => tiles.get(gk(ix, iz)) || null,
    at: (x, z) => tiles.get(gk(Math.floor(x / size), Math.floor(z / size))) || null,
    loaded: () => [...tiles.values()],
    ringOf, cover,
    on(ev, fn) { handlers[ev].add(fn); return () => handlers[ev].delete(fn); },
    get wanted() { return wanted; },
  };
}
