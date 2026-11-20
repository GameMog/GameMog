// Hand-built cast: a GLB's make-up at a glance (meshes, vertex/triangle counts, materials and their maps, texture sizes
// and bytes, morphs, skins, clips). Read-only.   node scripts/handbuilt/inspect.mjs <a.glb> [b.glb ...]
import { createRequire } from 'node:module';
const TB = process.env.FORGE_TOOLBOX_DIR || new URL('../../.scratch/tools/gltf/', import.meta.url).pathname;
const require = createRequire(TB + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');
const sharp = require('sharp');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f), R = doc.getRoot();
  console.log('\n==', f);
  const texInfo = new Map();
  for (const t of R.listTextures()) { const img = t.getImage(); let m = {}; try { m = await sharp(Buffer.from(img)).metadata(); } catch {}
    texInfo.set(t, `${m.width}x${m.height} ${t.getMimeType()} ${(img.byteLength / 1024).toFixed(0)}KB`); }
  for (const m of R.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), mat = p.getMaterial();
    console.log(`mesh ${m.getName() || '-'} mat=${mat?.getName()} v=${pos?.getCount()} tris=${idx ? idx.getCount() / 3 : '-'} attrs=${p.listSemantics().join(',')} morphs=${p.listTargets().length}`);
  }
  for (const mat of R.listMaterials()) {
    const maps = [['base', mat.getBaseColorTexture()], ['normal', mat.getNormalTexture()], ['mr', mat.getMetallicRoughnessTexture()], ['occ', mat.getOcclusionTexture()], ['emis', mat.getEmissiveTexture()]].filter(([, t]) => t).map(([k, t]) => `${k}:${texInfo.get(t)}`);
    const ext = mat.listExtensions().map((e) => e.extensionName).join(',');
    console.log(`material ${mat.getName()} rough=${mat.getRoughnessFactor()} metal=${mat.getMetallicFactor()} alpha=${mat.getAlphaMode()}${mat.getAlphaMode() === 'MASK' ? '@' + mat.getAlphaCutoff() : ''} ds=${mat.getDoubleSided()} color=${mat.getBaseColorFactor().map((x) => x.toFixed(2))} ${maps.join(' ')} ${ext}`);
  }
  console.log('skins', R.listSkins().map((s) => s.listJoints().length), 'clips', R.listAnimations().length, 'nodes', R.listNodes().length);
  const ex = R.getAsset().extras; if (ex) console.log('extras keys', JSON.stringify(Object.keys(ex.forge || ex)).slice(0, 400));
}
