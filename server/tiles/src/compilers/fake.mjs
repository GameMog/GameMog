import crypto from 'node:crypto';
import { gzipDeterministic, brotli, stableJson } from '../util.mjs';

// A fake compiler for tests, the load test and pre-warm dry runs: deterministic placeholder tiles (a few pseudo-random
// "buildings" seeded by version + tile) with an optional simulated compile time. It counts calls per key.
export function createFakeCompiler({ version = 'fake-1', delayMs = 0, contentEncoding = 'gzip', buildings = 24, failOn } = {}) {
  const calls = new Map();
  let total = 0;
  return {
    version,
    calls,
    get total() { return total; },
    async compileTile(key) {
      const id = `${key.z}/${key.x}/${key.y}`;
      calls.set(id, (calls.get(id) || 0) + 1);
      total++;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (failOn && failOn(key)) throw new Error(`fake compile failure at ${id}`);
      const seed = crypto.createHash('sha256').update(`${version}|${id}`).digest();
      const [w, s, e, n] = key.bbox;
      const list = [];
      for (let i = 0; i < buildings; i++) {
        const a = seed.readUInt16BE((i * 2) % 30) / 65535, b = seed.readUInt16BE((i * 2 + 1) % 30) / 65535;
        list.push({ lon: +(w + (e - w) * a).toFixed(7), lat: +(s + (n - s) * b).toFixed(7), h: 3 + (seed[i % 32] % 40) });
      }
      const raw = Buffer.from(stableJson({ format: 'hometown-tile-placeholder', compiler: version, z: key.z, x: key.x, y: key.y, bbox: key.bbox, buildings: list }));
      const body = contentEncoding === 'gzip' ? gzipDeterministic(raw) : contentEncoding === 'br' ? brotli(raw) : raw;
      return { body, contentType: 'application/json', contentEncoding };
    },
  };
}
