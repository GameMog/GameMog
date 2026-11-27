// clips on Dan's rig -> a GLB of his skeleton's nodes and the clips only (as the forge's clip pack)
import { io } from './rig.mjs';
import { createRequire } from 'module';
const require = createRequire((process.env.FORGE_TOOLBOX_DIR || '../GameMog-storykit/.scratch/tools/gltf') + '/node_modules/');
const { PropertyType: PT } = require('@gltf-transform/core');
const { prune } = require('@gltf-transform/functions');
export async function writePack(out, clips, extras) {
  const doc = await io.read(new URL('../../assets/characters/dan.glb', import.meta.url).pathname), R = doc.getRoot();
  for (const e of R.listExtensionsUsed()) if (/meshopt|quantization|texture/i.test(e.extensionName)) e.dispose();
  const joints = new Set(R.listSkins()[0].listJoints());
  for (const n of R.listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const s of R.listSkins()) s.dispose();
  for (const a of R.listAnimations()) a.dispose();
  for (const n of R.listNodes()) if (!joints.has(n) && !n.listChildren().some((c) => joints.has(c))) n.dispose();
  const byName = new Map(R.listNodes().map((n) => [n.getName(), n])), buf = R.listBuffers()[0];
  for (const { name, clip } of clips) { const A = doc.createAnimation(name);
    for (const [bone, t] of Object.entries(clip.tracks)) { const node = byName.get(bone); if (!node) continue;
      for (const [path, k] of [['rotation', t.rotation], ['translation', t.translation]]) { if (!k) continue;
        const S = doc.createAnimationSampler().setInput(doc.createAccessor().setType('SCALAR').setArray(k.t).setBuffer(buf)).setOutput(doc.createAccessor().setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(k.v).setBuffer(buf)).setInterpolation('LINEAR');
        A.addSampler(S).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(S)); } } }
  await doc.transform(prune({ propertyTypes: [PT.MESH, PT.PRIMITIVE, PT.MATERIAL, PT.TEXTURE, PT.ACCESSOR, PT.SKIN, PT.NODE], keepLeaves: true }));
  R.getAsset().extras = extras;
  await io.write(out, doc);
}
