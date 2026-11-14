// Compiler interface (hg1). A compiler is one BUILD (its version is the buildId: htc-{compilerVersion}-hg1-b{8 hex});
// it must be deterministic: the same build + tile id give the same bytes (the cache keeps the first bytes it stored).
//
//   compiler = {
//     version: string,                                    // the buildId in every URL and storage key
//     compileTile(key) -> Promise<{ body, contentType?, contentEncoding? }>
//                                                         // key = { buildId, grid 'hg1', domain, L 0, c, r, id }
//     compileBlock?(block) -> Promise<{ children: [{ id, body, contentEncoding? } | { id, refused }] }>
//                                                         // an L2 block (4 x 4 tiles) in one process: the service
//                                                         // single-flights the block and stores the children ifAbsent
//     compileCtx?(key) -> Promise<{ body, ... }>          // a context block, key L 4
//     describePlace(place, stage 1 | 2) -> Promise<descriptor>
//                                                         // stage 1: { domain, origin {c0, r0}, k0, gamma0, tiles: [ids] }
//                                                         // (the tile list; the service never derives it), stage 2:
//                                                         // { yOffset, waterLevel, ... } once the tiles exist
//     buildRecord?() -> object                            // stored at builds/{buildId}.json
//   }
// A refusal (the tile has no DEM under it) is an error with .refused = reason: 422, never cached.
// The service never compiles for a build that is not registered (410), never runs one block twice at once
// (single-flight), and caps concurrent compiles across all keys (maxConcurrentCompiles).
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
