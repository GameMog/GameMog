// THE CHARACTER FORGE: the shared clip pack (forge v2). Dan's 74 clips on the cast's 66-bone rig, once, for every
// character: the skeleton's nodes (names and rest) and the clips only, no meshes, skins or textures. A character GLB
// carries none (post.mjs); the runtime binds this pack to each one by bone name and applies the two things that differ
// per person, from the character's asset extras (clips-runtime.mjs: rootScale, armSplay).
//   node clips.mjs <out-raw.glb>      (then the toolbox's diet/build.mjs packs it like a character)
import { createRequire } from 'module';
import { TOOLBOX, MOGCITY } from './paths.mjs';
const require = createRequire(TOOLBOX);
const { NodeIO, PropertyType: PT } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { prune } = require('@gltf-transform/functions');
const { MeshoptDecoder } = require('meshoptimizer');
await MeshoptDecoder.ready;
const MC = MOGCITY;
const SRC = process.env.FORGE_CLIPS || MC + '/assets/characters/dan.glb';
const [OUT] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(SRC), R = doc.getRoot();
for (const e of R.listExtensionsUsed()) if (/meshopt|quantization|texture/i.test(e.extensionName)) e.dispose();
const joints = new Set(R.listSkins()[0].listJoints());
// (the nodes kept: the joints and the frame above the root (its upright turn is set by the runtime, as in Mog City))
for (const n of R.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const s of R.listSkins()) s.dispose();
for (const n of R.listNodes()) if (!joints.has(n) && !n.listChildren().some((c) => joints.has(c))) n.dispose();
await doc.transform(prune({ propertyTypes: [PT.MESH, PT.PRIMITIVE, PT.MATERIAL, PT.TEXTURE, PT.ACCESSOR, PT.SKIN, PT.NODE], keepLeaves: true }));
R.getAsset().extras = { forge: { clipPack: true, from: SRC.split('/').pop(), clips: R.listAnimations().map((a) => a.getName()), licence: "Dan's clips as shipped in Mog City (Bandai Namco motion data is CC BY-NC: free GameMog only)" } };
await io.write(OUT, doc);
console.log(JSON.stringify({ clips: R.listAnimations().length, nodes: R.listNodes().length, channels: R.listAnimations().reduce((a, x) => a + x.listChannels().length, 0) }));
