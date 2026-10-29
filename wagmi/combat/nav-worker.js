// Mog City: the fight's navmesh, built off the main thread (wagmi/combat/nav.js sends the local area's triangles: the
// ground and the walls of what stands on it; this builds a solo navmesh with Recast and sends it back, exported).
// Recast Navigation (recast-navigation-js 0.43.1, MIT; Recast & Detour, zlib): js/vendor/recast/, see NOTICE.
import { init, exportNavMesh } from '../../js/vendor/recast/core.mjs';
import { generateSoloNavMesh } from '../../js/vendor/recast/generators.mjs';
import Recast from '../../js/vendor/recast/recast-navigation.wasm.js';

const ready = init(Recast);
self.onmessage = async ({ data }) => {
  const { id, positions, indices, cfg } = data;
  try {
    await ready;
    const t0 = performance.now();
    const r = generateSoloNavMesh(positions, indices, cfg);
    if (!r.success) { self.postMessage({ id, error: String(r.error || 'failed') }); return; }
    const bin = exportNavMesh(r.navMesh);
    r.navMesh.destroy();
    self.postMessage({ id, bin, ms: performance.now() - t0 }, [bin.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
