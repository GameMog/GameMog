// usage (from tools/vehicles, its node_modules installed as for build-fleet.mjs):
//   Blender -b --factory-startup --python gwagon/build.py -- <download>/gwagon-demuriagt.glb /tmp/gwagon-raw.glb
//   node gwagon/pack.mjs /tmp/gwagon-raw.glb ../../assets/vehicles/gwagon/gwagon.glb
// pack: the Blender export, deduplicated, quantized and meshopt-compressed, its credit in asset.extras
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const [IN, OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN);
for (const t of doc.getRoot().listTextures()) t.dispose();
doc.getRoot().getAsset().extras = {
  title: 'Kastell body, based on a 3D model by DemuriaGT', author: 'DemuriaGT (https://sketchfab.com/demuriagt)',
  license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', source: 'https://sketchfab.com/3d-models/aa1a732d4fdc44e0a20cee312a929d77',
  changes: 'modified: scaled to metres, the palette texture removed and the body split into parts by its colours, the front doors cut free, a cabin added (seats, dash, steering wheel), parts renamed; a look-alike with no connection to any car maker',
};
await doc.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(OUT, doc);
let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log('nodes', doc.getRoot().listNodes().length, 'meshes', doc.getRoot().listMeshes().length, 'materials', doc.getRoot().listMaterials().length, 'tris', tris);
