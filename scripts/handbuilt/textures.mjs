// Hand-built cast: write a GLB's textures out as PNGs named <material>-<slot>.png (read-only on the GLB).
//   node scripts/handbuilt/textures.mjs <a.glb> <outDir>
import { createRequire } from 'node:module'; import fs from 'node:fs';
const TB = process.env.FORGE_TOOLBOX_DIR || new URL('../../.scratch/tools/gltf/', import.meta.url).pathname;
const require = createRequire(TB + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer'); const sharp = require('sharp'); await MeshoptDecoder.ready;
const [F, O] = process.argv.slice(2); fs.mkdirSync(O, { recursive: true });
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(F);
for (const m of doc.getRoot().listMaterials()) for (const [k, t] of [['base', m.getBaseColorTexture()], ['normal', m.getNormalTexture()], ['mr', m.getMetallicRoughnessTexture()]])
  if (t) await sharp(Buffer.from(t.getImage())).png().toFile(`${O}/${m.getName()}-${k}.png`);
console.log(fs.readdirSync(O).join(' '));
