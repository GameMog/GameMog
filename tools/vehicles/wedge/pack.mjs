// usage (from tools/vehicles, its node_modules installed as for build-fleet.mjs):
//   Blender -b --factory-startup --python wedge/build.py -- <download>/scene.gltf /tmp/wedge-raw.glb
//   node wedge/pack.mjs /tmp/wedge-raw.glb ../../assets/vehicles/wedge/wedge.glb
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
  title: 'Tensore body, based on a 3D model by ALIEEEN', author: 'ALIEEEN (https://sketchfab.com/ALIEEEN)',
  license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', source: 'https://sketchfab.com/3d-models/cf52245eb68f48daa909c7ad2a8deaa3',
  changes: 'modified: every badge mesh removed, every texture removed, the doors cut free of the body, parts renamed; a look-alike with no connection to any car maker',
};
await doc.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(OUT, doc);
let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log('nodes', doc.getRoot().listNodes().length, 'meshes', doc.getRoot().listMeshes().length, 'materials', doc.getRoot().listMaterials().length, 'tris', tris);
