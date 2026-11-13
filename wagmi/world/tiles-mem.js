// The in-memory TileSource (wagmi/world/tiles.js): the city the page already loaded whole, sliced into tiles on
// request, so the tile lifecycle, its rings and budget, and the systems' hooks run today, before the compiler's tiles
// exist (cities/sf/docs/STREAMING.md). No new data files: every layer is a slice of a table already in memory (copied
// for the typed arrays, references for the records).
//   layers, by level (near ⊇ mid ⊇ far):
//     heights  { x0, z0, step, n, h: Float32Array (n x n) }: the ground (Terrain.heightAt; the city's ground in New York),
//              step 2 m near, 8 m mid, 32 m far
//     mask     { x0, z0, cell: 1, n, m: Uint8Array }: San Francisco's 1 m ground classes (near only, inside its core)
//     roads    the drivable graph's edges touching the tile (traffic network: { sx, sz, dx, dz, len, lanes, ... })
//     nodes    the junctions in the tile (mid, near)
//     blocks   the curb islands overlapping it (mid, near)
//     places   the place library's places in it (mid, near)
//     colliders the solids overlapping it (near only; the controllers' collider list)
// Tiles start at the frame's origin (ix = floor(x / size)); has(ix, iz) is the city's flight bounds (else 12 km round).
const N = () => globalThis.window?.NYC || {};
const APP = () => globalThis.window?.__NYC_APP || null;
const STEP = { near: 2, mid: 8, far: 32 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (options: size m a side, version the cache key's; id the source's own (else the world's), has(ix, iz) where its
// tiles are (else the flight bounds): a Hometown package's compiled grid, wagmi/world/pkg.js)
export function createMemoryTileSource(world, { size = 256, version = 'mem-1', id = world.id, has = null } = {}) {
  let edgeIndex = null, nodeIndex = null, colIndex = null, placeIndex = null;
  // the city is up: its traffic graph and controllers exist (a tile asked for before then waits)
  async function ready() {
    for (let i = 0; !(APP()?.trafficSystem?.network && APP()?.controllerManager); i++) await sleep(i < 50 ? 100 : 500);
  }
  const cellKey = (ix, iz) => ix + ',' + iz;
  function bucket(list, box) {
    const m = new Map();
    for (const o of list) {
      const b = box(o); if (!b) continue;
      for (let iz = Math.floor(b.minZ / size); iz <= Math.floor(b.maxZ / size); iz++) for (let ix = Math.floor(b.minX / size); ix <= Math.floor(b.maxX / size); ix++) {
        const k = cellKey(ix, iz); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(o);
      }
    }
    return m;
  }
  // (indexes built once, the first time a tile is asked for: one pass over each table)
  function indexes() {
    if (edgeIndex) return;
    const net = APP().trafficSystem.network, cm = APP().controllerManager;
    edgeIndex = bucket(net.edges, (e) => {
      const ex = e.sx + e.dx * e.len, ez = e.sz + e.dz * e.len;
      return { minX: Math.min(e.sx, ex), maxX: Math.max(e.sx, ex), minZ: Math.min(e.sz, ez), maxZ: Math.max(e.sz, ez) };
    });
    nodeIndex = bucket(net.nodes || [], (n) => (Number.isFinite(n.x) ? { minX: n.x, maxX: n.x, minZ: n.z, maxZ: n.z } : null));
    colIndex = bucket(cm.colliders || [], (c) => (Number.isFinite(c.minX) ? c : null));
    const P = world.places;
    placeIndex = bucket(Object.entries(P).map(([key, p]) => ({ key, ...p })), (p) => ({ minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z }));
  }
  function heights(ix, iz, lod) {
    const step = STEP[lod], n = Math.round(size / step) + 1, h = new Float32Array(n * n), x0 = ix * size, z0 = iz * size, T = N().Terrain;
    const at = T?.loaded ? (x, z) => T.heightAt(x, z) : (x, z) => world.groundY(x, z, 'person');
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = at(x0 + i * step, z0 + j * step);
    return { x0, z0, step, n, h };
  }
  // San Francisco's 1 m ground mask under the tile (null outside its core box or in New York)
  function mask(ix, iz) {
    const G = N().DATA?.groundMask; if (!G) return null;
    const H = G.header, x0 = ix * size, z0 = iz * size;
    const i0 = Math.round((x0 - H.originX) / H.cell), j0 = Math.round((z0 - H.originZ) / H.cell), n = Math.round(size / H.cell);
    if (i0 + n <= 0 || j0 + n <= 0 || i0 >= H.w || j0 >= H.h) return null;
    const m = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      const jj = j0 + j; if (jj < 0 || jj >= H.h) continue;
      const a = Math.max(0, i0), b = Math.min(H.w, i0 + n);
      if (b > a) m.set(G.mask.subarray(jj * H.w + a, jj * H.w + b), a - i0 + j * n);
    }
    return { x0, z0, cell: H.cell, n, m };
  }
  const inside = (o, b) => o.maxX >= b.minX && o.minX <= b.maxX && o.maxZ >= b.minZ && o.minZ <= b.maxZ;

  const FB = () => N().FLIGHT_BOUNDS || { minX: -12000, maxX: 12000, minZ: -12000, maxZ: 12000 };
  return {
    id, version, size,
    has(ix, iz) { if (has) return has(ix, iz); const b = FB(); return (ix + 1) * size > b.minX && ix * size < b.maxX && (iz + 1) * size > b.minZ && iz * size < b.maxZ; },
    async load(ix, iz, lod) {
      await ready();
      // (a task of its own per tile: slicing never piles into one frame)
      await sleep(0);
      const t0 = performance.now();
      indexes();
      const k = cellKey(ix, iz), b = { minX: ix * size, maxX: (ix + 1) * size, minZ: iz * size, maxZ: (iz + 1) * size };
      const layers = { heights: heights(ix, iz, lod) };
      let bytes = layers.heights.h.byteLength;
      if (lod !== 'far') {
        layers.roads = edgeIndex.get(k) || [];
        layers.nodes = nodeIndex.get(k) || [];
        layers.blocks = world.blocksInRect(b.minX, b.maxX, b.minZ, b.maxZ);
        layers.places = placeIndex.get(k) || [];
        // (records referenced, not copied: an estimate of what a compiled tile would carry for them)
        bytes += layers.roads.length * 160 + layers.nodes.length * 64 + layers.blocks.length * 400 + layers.places.length * 64;
      }
      if (lod === 'near') {
        layers.colliders = (colIndex.get(k) || []).filter((c) => inside(c, b));
        layers.mask = mask(ix, iz);
        bytes += layers.colliders.length * 120 + (layers.mask ? layers.mask.m.byteLength : 0);
      }
      return { bytes, layers, ms: performance.now() - t0 };
    },
  };
}
