// THE CHARACTER FORGE: the shared clip pack (forge v2). Dan's 74 clips on the cast's 66-bone rig, once, for every
// character: the skeleton's nodes (names and rest) and the clips only, no meshes, skins or textures. A character GLB
// carries none (post.mjs); the runtime binds this pack to each one by bone name and applies the two things that differ
// per person, from the character's asset extras (clips-runtime.mjs: rootScale, armSplay).
//   node clips.mjs <out-raw.glb>      (then the toolbox's diet/build.mjs packs it like a character)
import { createRequire } from 'module';
import { TOOLBOX, MOGCITY, GAMEMOG } from './paths.mjs';
import { LIMB_ENDS } from './clips-runtime.mjs';
const THREE = await import(GAMEMOG + '/node_modules/three/build/three.module.js');
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
// (forge v2.4: Dan's bind, joint by joint (world position and turn, from his skin's inverse binds), for the limbs' rest
// retarget at load (clips-runtime.mjs restCorrections; Mog City's wagmi/retarget.js reads it off dan.glb itself))
const danBind = {};
{ const sk = R.listSkins().find((s) => s.listJoints().some((j) => j.getName() === 'upperarm01_L')), J = sk.listJoints(), IBM = sk.getInverseBindMatrices();
  const want = new Set(Object.entries(LIMB_ENDS).flat());
  J.forEach((j, k) => { if (!want.has(j.getName())) return; const m = new THREE.Matrix4().fromArray(IBM.getElement(k, [])).invert(), p = new THREE.Vector3(), q = new THREE.Quaternion(); m.decompose(p, q, new THREE.Vector3());
    danBind[j.getName()] = [...p.toArray(), ...q.toArray()].map((x) => +x.toFixed(6)); }); }
// (the nodes kept: the joints and the frame above the root (its upright turn is set by the runtime, as in Mog City))
for (const n of R.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const s of R.listSkins()) s.dispose();
for (const n of R.listNodes()) if (!joints.has(n) && !n.listChildren().some((c) => joints.has(c))) n.dispose();
await doc.transform(prune({ propertyTypes: [PT.MESH, PT.PRIMITIVE, PT.MATERIAL, PT.TEXTURE, PT.ACCESSOR, PT.SKIN, PT.NODE], keepLeaves: true }));
// (forge v2.5: Mog City's locomotion pack's clips in place of Dan's by name (assets/anim/loco-walk.glb: the walk), as
// the engine plays them (wagmi/retarget.js loadLoco); FORGE_LOCO=0: Dan's own)
const LOCO = process.env.FORGE_LOCO === '0' ? null : process.env.FORGE_LOCO || MC + '/assets/anim/loco-walk.glb';
let locoFrom = null;
if (LOCO && (await import('node:fs')).existsSync(LOCO)) {
  const L = await io.read(LOCO), LR = L.getRoot(), byName = new Map(R.listNodes().map((n) => [n.getName(), n])), buf = R.listBuffers()[0];
  const dec = (a) => { let o = Float32Array.from(a.getArray()); if (a.getNormalized()) { const n0 = a.getArray(), f = n0 instanceof Int16Array ? 32767 : n0 instanceof Int8Array ? 127 : n0 instanceof Uint16Array ? 65535 : 255; o = Float32Array.from(n0, (x) => Math.max(-1, x / f)); } return o; };
  for (const la of LR.listAnimations()) {
    for (const a of R.listAnimations()) if (a.getName() === la.getName()) a.dispose();
    const A = doc.createAnimation(la.getName());
    for (const ch of la.listChannels()) { const node = byName.get(ch.getTargetNode()?.getName()); if (!node) continue; const sm = ch.getSampler();
      const S = doc.createAnimationSampler().setInput(doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(sm.getInput().getArray())).setBuffer(buf)).setOutput(doc.createAccessor().setType(sm.getOutput().getType()).setArray(dec(sm.getOutput())).setBuffer(buf)).setInterpolation(sm.getInterpolation());
      A.addSampler(S).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(S)); } }
  locoFrom = LR.getAsset().extras?.loco || null;
}
R.getAsset().extras = { forge: { clipPack: true, loco: locoFrom, from: SRC.split('/').pop(), clips: R.listAnimations().map((a) => a.getName()), danBind, licence: "Dan's clips as shipped in Mog City: Bandai Namco Research Motion Dataset, CC BY-NC 4.0 (GameMog is free, no paid tier). The walk, run and idle, and idleLook, swagger and phoneCall (forge.loco): Tripo AI presets (the owner's paid Tripo account; Tripo's terms: paid-plan output is the user's, commercial use allowed), the walk with a procedural arm swing. walkUal: Quaternius Universal Animation Library (Standard) Walk_Loop, CC0 1.0. Quaternius UAL (CC0 1.0) compared, not used." } };
await io.write(OUT, doc);
console.log(JSON.stringify({ clips: R.listAnimations().length, nodes: R.listNodes().length, channels: R.listAnimations().reduce((a, x) => a + x.listChannels().length, 0) }));
