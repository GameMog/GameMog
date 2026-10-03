// OWNER: citylife engineer. Pedestrians + pigeons entry point used by city.js.
//   buildPeds({scene, blocks, parkPaths, props?, traffic?}) -> Promise<{update(dt, camera|cameraPos), crowd, pigeons}>
// The crowd itself lives in npc/crowd.js (Blender-modelled GPU-skinned people), birds in npc/pigeons.js.
import { createCrowd } from './npc/crowd.js';
import { createPigeons } from './npc/pigeons.js';
import { buildRoads } from './npc/roads.js';

export async function buildPeds({ scene, blocks, parkPaths, props = null, traffic = null, clip = null, density = 1 }) { // GameMog: clip, density (npc/crowd.js)
  const roads = traffic?.roads || buildRoads();
  const phase = props?.phase || (() => 2);
  let crowd = null;
  try {
    crowd = await createCrowd({ scene, blocks, parkPaths, props, roads, phase, clip, density });
  } catch (e) {
    console.warn('[city] crowd assets missing', e);
  }
  const pigeons = createPigeons({ scene, blocks, parkPaths, props, clip });
  let cam = null;
  // debug: ?nocrowd / ?nopigeons disable the systems (bisecting perf)
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const noCrowd = q.has('nocrowd'), noPigeons = q.has('nopigeons');
  return {
    crowd, pigeons,
    update(dt, camOrPos) {
      if (camOrPos && camOrPos.isCamera) cam = camOrPos;
      else if (!cam) cam = (typeof window !== 'undefined' && window.__ctx?.camera) || null;
      if (!cam) return;
      if (!noCrowd) crowd?.update(dt, cam);
      if (!noPigeons) pigeons.update(dt, cam);
    },
  };
}
