import crypto from 'node:crypto';
import { gzipDeterministic, brotli, stableJson } from '../util.mjs';
import { domain, domainOfGeoid, tileId, TILE } from '../grid.mjs';
import { blockChildren, blockId } from '../keys.mjs';

// A fake hg1 compiler for tests, the load test and pre-warm dry runs: deterministic placeholder tiles seeded by build +
// tile id, an optional simulated compile time, block mode (an L2 block's 16 children from one call) and a stand-in
// session descriptor (the real one is Python's; this one uses the JS display twin, fine for a placeholder). Counts
// calls per tile id, per block and per descriptor.
export function createFakeCompiler({ version = 'fake-1', delayMs = 0, contentEncoding = 'gzip', failOn, refuseOn, block = true, padTiles = 0 } = {}) {
  const calls = new Map(), blockCalls = new Map();
  let total = 0, blocks = 0, describes = 0;
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : null);
  function tileBody(key) {
    const id = key.id || tileId(key.domain, key.c, key.r);
    calls.set(id, (calls.get(id) || 0) + 1);
    total++;
    if (failOn && failOn(key)) throw new Error(`fake compile failure at ${id}`);
    const seed = crypto.createHash('sha256').update(`${version}|${id}`).digest();
    const list = [];
    for (let i = 0; i < 24; i++) list.push({ u: seed.readUInt16BE((i * 2) % 30) % 51200, v: seed.readUInt16BE((i * 2 + 1) % 30) % 51200, h: 3 + (seed[i % 32] % 40) });
    const raw = Buffer.from(stableJson({ format: 'hometown-tile-placeholder', buildId: version, id, c: key.c, r: key.r, buildings: list }));
    const body = contentEncoding === 'gzip' ? gzipDeterministic(raw) : contentEncoding === 'br' ? brotli(raw) : raw;
    return { body, contentType: 'application/octet-stream', contentEncoding };
  }
  const C = {
    version,
    calls, blockCalls,
    get total() { return total; },
    get blocks() { return blocks; },
    get describes() { return describes; },
    async compileTile(key) {
      await wait();
      if (refuseOn && refuseOn(key)) throw Object.assign(new Error('refused'), { refused: 'no DEM under the tile (fake)' });
      return tileBody(key);
    },
    async compileCtx(key) {
      await wait();
      const raw = Buffer.from(stableJson({ format: 'hometown-ctx-placeholder', buildId: version, id: tileId(key.domain, key.c, key.r, 4) }));
      return { body: gzipDeterministic(raw), contentEncoding: 'gzip' };
    },
    async describePlace(place, stage = 1) {
      describes++;
      if (stage === 2) return { yOffset: 0, waterLevel: -10 };
      const dom = place.domain || (place.geoid ? domainOfGeoid(place.geoid) : 'conus');
      const d = domain(dom);
      const [w, s, e, n] = place.bbox;
      const [lon, lat] = place.anchor || [(w + e) / 2, (s + n) / 2];
      const [E, S] = d.forward(lon, lat), c0 = Math.floor(E / TILE), r0 = Math.floor(S / TILE);
      const pts = [[w, s], [e, s], [e, n], [w, n]].map(([x, y]) => d.forward(x, y));
      const pad = padTiles * TILE;
      const cA = Math.floor((Math.min(...pts.map((p) => p[0])) - pad) / TILE), cB = Math.floor((Math.max(...pts.map((p) => p[0])) + pad) / TILE);
      const rA = Math.floor((Math.min(...pts.map((p) => p[1])) - pad) / TILE), rB = Math.floor((Math.max(...pts.map((p) => p[1])) + pad) / TILE);
      const tiles = [];
      for (let r = rA; r <= rB; r++) for (let c = cA; c <= cB; c++) tiles.push(tileId(dom, c, r));
      const [ol] = d.inverse(c0 * TILE, r0 * TILE);
      return { domain: dom, origin: { c0, r0 }, k0: +d.scale(lon, lat).toFixed(9), gamma0: +d.gamma(ol).toFixed(6), anchor: { lon, lat }, tiles };
    },
    async buildRecord() { return { format: 'hometown-build', fake: true, buildId: version, grid: 'hg1' }; },
  };
  if (block) {
    C.compileBlock = async (b) => {
      await wait();
      blocks++;
      blockCalls.set(blockId(b), (blockCalls.get(blockId(b)) || 0) + 1);
      const children = [];
      for (const ch of blockChildren(b)) {
        if (refuseOn && refuseOn(ch)) { children.push({ id: ch.id, refused: 'no DEM under the tile (fake)' }); continue; }
        children.push({ id: ch.id, ...tileBody(ch) });
      }
      return { children };
    };
  }
  return C;
}
