// Jensen's Blender parts -> the slim part files the build reads (storykit/handbuilt/jensen/parts/):
//   jacket.glb   the leather moto jacket (blender/jacket, s90_glb.mjs): mesh 'moto-jacket' (leather, hardware, zip-tape)
//   hair.glb     the groomed hair cards and cap (mesh 'hair') and the card brows (mesh 'brows') (blender/hair, build_glb.mjs)
//   glasses.glb  the browline glasses (blender/glasses, build.py): one rigid mesh, its node's offset baked into the points
//   fit-<tag>.bin.gz  the head each part was fitted on: the body's shared point set (float32 xyz), so the build can carry a
//                part onto a re-sculpted head (assemble.mjs warpPart)
// Each part keeps only its meshes, materials and textures (webp); joints are named in mesh extras.joints (the order of
// the skin it was made on), so the build re-binds them to his skin by name.
//   node scripts/handbuilt/jensen/blender/parts.mjs --jacket <jacket.glb> --hair <hair.glb> --glasses <glasses.glb>
//        --fit <tag>=<the head glb it was fitted on>  (--fit r3=... for jacket and hair, --fit it1=... for glasses)
//        --fitOf jacket=r3,hair=r3,glasses=it1
// (only the parts named are rewritten)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { read, io, require, sharp } from '../../young-hero/glb.mjs';
import { patchModes } from './assemble.mjs';
const { EXTTextureWebP, EXTMeshoptCompression } = require('@gltf-transform/extensions');
const { prune } = require('@gltf-transform/functions');
const OUT = process.env.JH_PARTS || new URL('../../../../storykit/handbuilt/jensen/parts/', import.meta.url).pathname;
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const fits = Object.fromEntries((args.flatMap((a, i) => (a === '--fit' ? [args[i + 1]] : []))).map((s) => s.split('=')));
const fitOf = Object.fromEntries((opt('fitOf') || 'jacket=r3,hair=r3,glasses=it1').split(',').map((s) => s.split('=')));
fs.mkdirSync(OUT, { recursive: true });

// the fitted-on head: the skin family's shared POSITION accessor (the largest 'skin' primitive's)
for (const [tag, file] of Object.entries(fits)) {
  const { doc } = await read(file);
  const sk = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial()?.getName() === 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0];
  const a = Float32Array.from(sk.getAttribute('POSITION').getArray()), gz = zlib.gzipSync(Buffer.from(a.buffer), { level: 9 });
  fs.writeFileSync(`${OUT}fit-${tag}.bin.gz`, gz); console.log('fit', tag, a.length / 3, 'points', (gz.length / 1024 | 0) + 'K');
}

async function webpOf(tex, K) {
  const img = sharp(Buffer.from(tex.getImage())); const m = await img.metadata();
  let s = img; if (K.size && m.width > K.size) s = s.resize(K.size, K.size, { kernel: 'lanczos3' }); if (!K.alpha) s = s.removeAlpha();
  const b = await s.webp({ quality: K.q, effort: 5, alphaQuality: 100 }).toBuffer();
  tex.setImage(b).setMimeType('image/webp').setURI(''); return b.length;
}
// keep only the named meshes (and what they use), joints named in extras, textures webp; write meshopt-compressed
async function slim(file, keep, out, K = {}) {
  const { doc } = await read(file), R = doc.getRoot(), skin = R.listSkins()[0], jn = skin ? skin.listJoints().map((j) => j.getName()) : ['head'];
  const scene = R.listScenes()[0], meshes = R.listMeshes().filter((m) => keep.includes(m.getName()));
  if (meshes.length !== keep.length) throw new Error(`${file}: meshes ${R.listMeshes().map((m) => m.getName())} lack one of ${keep}`);
  if (K.each) for (const m of meshes) K.each(doc, m, R.listNodes().find((n) => n.getMesh() === m));
  for (const n of R.listNodes()) n.dispose(); for (const s of R.listSkins()) s.dispose(); for (const a of R.listAnimations()) a.dispose();
  for (const m of R.listMeshes()) if (!keep.includes(m.getName())) m.dispose();
  for (const m of meshes) { m.setExtras({ ...m.getExtras(), joints: jn }); scene.addChild(doc.createNode(m.getName()).setMesh(m)); }
  await doc.transform(prune({ keepLeaves: false, keepAttributes: true, keepExtras: true }));
  let tb = 0; for (const t of R.listTextures()) tb += await webpOf(t, (K.tex && K.tex(t.getName())) || { q: 90 });
  doc.createExtension(EXTTextureWebP).setRequired(true);
  for (const e of R.listExtensionsUsed()) if (/meshopt|quantiz/i.test(e.extensionName)) e.dispose();
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = patchModes(Buffer.from(await io.writeBinary(doc))); fs.writeFileSync(OUT + out, glb);
  console.log(out, (glb.length / 1048576).toFixed(2), 'MB (textures', (tb / 1048576).toFixed(2), 'MB)');
  return glb;
}
const setFit = (tag) => (doc, m) => m.setExtras({ ...m.getExtras(), fit: `fit-${tag}.bin.gz` });
if (opt('jacket')) await slim(opt('jacket'), ['moto-jacket'], 'jacket.glb', { each: setFit(fitOf.jacket),
  // (the leather's normal carries the seams, stitching and grain at 0.35 mm a texel: kept at 4096; colour and ORM 2048)
  tex: (n) => (/normal/.test(n) ? { q: +(process.env.JH_NQ || 86), size: +(process.env.JH_NS || 4096) } : { q: 88, size: 2048 }) });
if (opt('hair')) await slim(opt('hair'), ['hair', 'brows'], 'hair.glb', { each: setFit(fitOf.hair), tex: () => ({ q: 92, alpha: true }) });
if (opt('glasses')) await slim(opt('glasses'), ['glasses'], 'glasses.glb', { each: (doc, m, node) => {
  // (rigid on the head joint: the node's offset into the points, JOINTS_0 = head, WEIGHTS_0 = 1)
  const t = node.getTranslation(); if (node.getRotation().some((q, i) => Math.abs(q - (i === 3 ? 1 : 0)) > 1e-6) || node.getScale().some((s) => Math.abs(s - 1) > 1e-6)) throw new Error('glasses: node must be a pure translation');
  const buf = doc.getRoot().listBuffers()[0];
  for (const p of m.listPrimitives()) { const P = p.getAttribute('POSITION'), a = P.getArray().slice(), n = P.getCount(); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) a[i * 3 + k] += t[k]; P.setArray(a);
    const J = new Uint8Array(n * 4), W = new Float32Array(n * 4); for (let i = 0; i < n; i++) W[i * 4] = 1;
    p.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf)).setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buf)); }
  m.setExtras({ ...m.getExtras(), fit: `fit-${fitOf.glasses}.bin.gz`, rigid: true });
  // (in the engine the clear nose pads read as two white discs on the nose: a faint grey silicone, mostly see-through)
  for (const p of m.listPrimitives()) { const mt = p.getMaterial(); if (mt?.getName() === 'glasses-pads') mt.setBaseColorFactor([0.42, 0.44, 0.46, 0.22]).setRoughnessFactor(0.25); }
} });
