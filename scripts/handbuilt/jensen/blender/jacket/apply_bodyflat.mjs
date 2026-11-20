// ASSEMBLER tool (v3b body flatten, owner 19 Nov "chest and stomach should NOT protrude"): moves the torso-front skin
// vertices of a Jensen GLB by the body_flat.json field (glTF bind positions -> z delta, inverse-distance from the 4 nearest
// field points within 1.5 cm, so it survives re-exports that round or rebuild the skin) on every primitive whose material is 'skin'. Only POSITION changes: the moves are <= 1.5 cm and smooth, so the normals are kept
// (and that skin is hidden under the jacket in the shipped GLB anyway). Morph targets are untouched (talk morphs = head).
//   node apply_bodyflat.mjs <in.glb> <out.glb>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.FORGE_TOOLBOX_DIR.replace(/\/?$/, '/') + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const H = new URL('.', import.meta.url).pathname;
const BF = JSON.parse(fs.readFileSync(H + 'body_flat.json'));
const C = 0.01, cell = (x, y, z) => Math.floor(x / C) + ',' + Math.floor(y / C) + ',' + Math.floor(z / C);
const grid = new Map(); for (let i = 0; i < BF.dz.length; i++) { const k = cell(BF.pos[3 * i], BF.pos[3 * i + 1], BF.pos[3 * i + 2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
function field(x, y, z) {   // inverse-distance from the 4 nearest field points within 1.5 cm, else 0
  const c = []; const fx = Math.floor(x / C), fy = Math.floor(y / C), fz = Math.floor(z / C);
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let d = -2; d <= 2; d++) for (const i of grid.get((fx + a) + ',' + (fy + b) + ',' + (fz + d)) || []) {
    const r = Math.hypot(BF.pos[3 * i] - x, BF.pos[3 * i + 1] - y, BF.pos[3 * i + 2] - z); if (r < 0.015) c.push([r, BF.dz[i]]); }
  if (!c.length) return 0; c.sort((p, q) => p[0] - q[0]); let sw = 0, s = 0; for (const [r, v] of c.slice(0, 4)) { const w = 1 / (r + 1e-4); sw += w; s += w * v; } return s / sw;
}
const [inp, out] = process.argv.slice(2); const doc = await io.read(inp);
const done = new Set(); let total = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  if (p.getMaterial()?.getName() !== 'skin') continue;
  const pa = p.getAttribute('POSITION'); if (done.has(pa)) continue; done.add(pa);
  const a = pa.getArray().slice(); let n = 0;
  let mx = 0; for (let i = 0; i < a.length; i += 3) { const dz = field(a[i], a[i + 1], a[i + 2]); if (Math.abs(dz) > 1e-5) { a[i + 2] += dz; n++; mx = Math.max(mx, Math.abs(dz)); } }
  console.log('primitive', p.getMaterial().getName(), 'moved', n, 'max %s mm'.replace('%s', (mx * 1000).toFixed(1)));
  pa.setArray(a); total += n;
}
console.log('skin vertices moved:', total);
await io.write(out, doc);
