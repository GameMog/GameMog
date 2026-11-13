// Compiler interface. A compiler turns one tile key into one tile's bytes, and must be deterministic: the same
// version + tile + inputs give the same bytes (the cache keeps the first bytes it stored either way).
//
//   compiler = {
//     version: string,                       // the URL's {compilerVersion}; bump it on ANY change to the output
//     compileTile(key) -> Promise<{          // key = { version, z, x, y, bbox: [west, south, east, north] }
//       body: Buffer | Uint8Array,           // the tile, as stored and served
//       contentType?: string,                // default application/octet-stream
//       contentEncoding?: 'identity' | 'gzip' | 'br',   // how body is encoded (passed through to clients that accept it)
//     }>,
//   }
//
// The service never calls a compiler for a version that is not registered (an unknown version is a 404, so a typo
// or a scan cannot fill the cache), never calls it twice at once for one key (single-flight), and caps concurrent
// compiles across all keys (maxConcurrentCompiles).
export { createFakeCompiler } from './fake.mjs';
export { createSubprocessCompiler } from './subprocess.mjs';

export function compilerRegistry(list) {
  const m = new Map();
  for (const c of list) {
    if (!c || typeof c.compileTile !== 'function' || typeof c.version !== 'string') throw new Error('compiler needs version + compileTile');
    if (m.has(c.version)) throw new Error(`duplicate compiler version ${c.version}`);
    m.set(c.version, c);
  }
  return m;
}
