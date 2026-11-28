// usage (from tools/vehicles, its node_modules installed as for build-fleet.mjs, plus sharp):
//   Blender -b --factory-startup --python gwagon/build.py -- /tmp/gwagon-raw.glb
//   node gwagon/pack.mjs /tmp/gwagon-raw.glb ../../assets/vehicles/gwagon/gwagon.glb
// pack: the Blender export welded, deduplicated, any texture shrunk, quantized and meshopt-compressed. The weld and the
// texture step follow manhattan-free-roam's tools/build-models.mjs (MIT, NOTICE): weld() before the rest, and every
// texture resized and re-encoded with sharp (textureCompress, at most TEX px a side). The Kastell's build makes no
// texture today (its plates and screen are drawn in code), so that step only guards a texture added later.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, prune, dedup, weld, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const [IN, OUT] = process.argv.slice(2);
const TEX = 1024;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(IN);
doc.getRoot().getAsset().extras = {
  title: 'Kastell', author: 'Mog City (tools/vehicles/gwagon/build.py)',
  license: 'the Mog City repository\'s own licence', changes: 'modelled from nothing in a script; a look-alike with no connection to any car maker, no badge or lettering',
};
// (prune keeps the vertex attributes: the paint's UVs serve a flake map the game makes, so no material of the file names them)
await doc.transform(weld(), dedup(), prune({ keepAttributes: true }));
if (doc.getRoot().listTextures().length) {
  const sharp = (await import('sharp')).default;
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 86 }));
}
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(OUT, doc);
let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log('nodes', doc.getRoot().listNodes().length, 'meshes', doc.getRoot().listMeshes().length, 'materials', doc.getRoot().listMaterials().length, 'tris', tris);
