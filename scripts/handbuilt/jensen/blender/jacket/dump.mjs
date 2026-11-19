// Dump jensen.glb (bind-space primitives, joints, textures) and cast-clips (animations) for Blender work.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.FORGE_TOOLBOX_DIR.replace(/\/?$/, '/') + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions'); const { MeshoptDecoder } = require('meshoptimizer');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const OUT = 'dump/';
const doc = await io.read((process.env.JH_GLB || new URL('../../../../../storykit/handbuilt/jensen/jensen.glb', import.meta.url).pathname)); const R = doc.getRoot();
const sk = R.listSkins()[0]; const ibm = sk.getInverseBindMatrices().getArray(); const J = sk.listJoints();
const joints = J.map((j, i) => ({ name: j.getName(), bind: [-ibm[i*16+12], -ibm[i*16+13], -ibm[i*16+14]], parent: j.getParent?.()?.getName?.() ?? null }));
// parent lookup
const parentOf = new Map(); for (const n of R.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
joints.forEach((jj, i) => { let p = parentOf.get(J[i]); jj.via = []; while (p && !J.includes(p)) { jj.via.unshift({ name: p.getName(), t: p.getTranslation(), r: p.getRotation(), s: p.getScale() }); p = parentOf.get(p); } jj.parent = p ? p.getName() : null; jj.rest = { t: J[i].getTranslation(), r: J[i].getRotation(), s: J[i].getScale() }; });
const prims = []; let k = 0; const texSeen = new Map();
const saveTex = (t) => { if (!t) return null; if (texSeen.has(t)) return texSeen.get(t); const ext = t.getMimeType() === 'image/png' ? 'png' : t.getMimeType() === 'image/webp' ? 'webp' : 'jpg'; const f = 'tex' + texSeen.size + '.' + ext; fs.writeFileSync(OUT + f, t.getImage()); texSeen.set(t, f); return f; };
for (const n of R.listNodes()) { const m = n.getMesh(); if (!m) continue;
  for (const p of m.listPrimitives()) { const id = 'p' + (k++); const mat = p.getMaterial();
    const w = (name, arr) => { if (!arr) return null; fs.writeFileSync(OUT + id + '.' + name + '.bin', Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)); return arr.constructor.name; };
    const a = (s) => p.getAttribute(s)?.getArray();
    const info = { id, node: n.getName(), mat: mat?.getName(), extras: mat?.getExtras(), count: p.getAttribute('POSITION').getCount(),
      types: { pos: w('pos', a('POSITION')), nor: w('nor', a('NORMAL')), uv: w('uv', a('TEXCOORD_0')), j: w('j', a('JOINTS_0')), w: w('w', a('WEIGHTS_0')), idx: w('idx', p.getIndices()?.getArray()) },
      base: mat ? mat.getBaseColorFactor() : null, rough: mat?.getRoughnessFactor(), metal: mat?.getMetallicFactor(), alpha: mat?.getAlphaMode(), cutoff: mat?.getAlphaCutoff(),
      tex: { base: saveTex(mat?.getBaseColorTexture()), normal: saveTex(mat?.getNormalTexture()), mr: saveTex(mat?.getMetallicRoughnessTexture()) },
      targets: p.listTargets().length };
    prims.push(info); } }
fs.writeFileSync(OUT + 'body.json', JSON.stringify({ joints, prims }, null, 1));
// clips
const cdoc = await io.read(new URL('../../../../../public/storykit/cast/cast-clips.glb', import.meta.url).pathname);
const clips = {};
for (const an of cdoc.getRoot().listAnimations()) { const c = {}; for (const ch of an.listChannels()) { const s = ch.getSampler(); c[ch.getTargetNode().getName() + '|' + ch.getTargetPath()] = { t: Array.from(s.getInput().getArray()), v: Array.from(s.getOutput().getArray()), interp: s.getInterpolation() }; } clips[an.getName()] = c; }
const crest = {}; for (const n of cdoc.getRoot().listNodes()) crest[n.getName()] = { t: n.getTranslation(), r: n.getRotation() };
fs.writeFileSync(OUT + 'clips.json', JSON.stringify({ clips, rest: crest }));
console.log(prims.map(p => p.id + ' ' + p.node + ' ' + p.mat + ' ' + p.count + ' tex ' + JSON.stringify(p.tex)).join('\n'));
console.log(joints.slice(0,4));
