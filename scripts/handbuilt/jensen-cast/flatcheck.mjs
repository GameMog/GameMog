// Jensen Heist cast round 3: rule 1 measured on built bodies (castpass3.mjs frontProfile): the largest forward deviation of
// the garment's front from the sternum-belt line, standing, per body.   node flatcheck.mjs <a.glb> [b.glb ...]
import { read } from '../young-hero/glb.mjs';
import { frontProfile } from './castpass3.mjs';
for (const f of process.argv.slice(2)) { const { doc } = await read(f); const r = frontProfile(doc);
  console.log(f.split('/').pop().padEnd(16), 'max', (r.dev * 1000).toFixed(1).padStart(5), 'mm at y', r.devY.toFixed(2), '| sternum', r.ys.toFixed(2), 'belt', r.yb.toFixed(2), '|', r.prof.filter((_, i) => i % 3 === 0).map(([y, d]) => d).join(' ')); }
