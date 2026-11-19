// build: node build.mjs <jensen.glb> <out.glb> <mode: full|part> [browsDir]
//  full: jensen.glb with node jensen-hair's mesh (and, given browsDir, jensen-brows') replaced: for the studio/engine check
//  part: hair.glb for the assembler: jensen's skeleton + skin joints only + nodes jensen-hair and jensen-brows (no body)
import { io, require } from './tk.mjs'; import fs from 'node:fs';
const { EXTTextureWebP } = require('@gltf-transform/extensions'); const { prune } = require('@gltf-transform/functions');
const [SRC, OUT, MODE = 'full'] = process.argv.slice(2); const R = new URL('..', import.meta.url).pathname;
const doc = await io.read(SRC), Rt = doc.getRoot(), buf = Rt.listBuffers()[0];
const skin = Rt.listSkins()[0], joints = skin.listJoints(), HEAD = joints.findIndex((j) => j.getName() === 'head');
const rb = (f) => { const b = fs.readFileSync(f); return b; };
const f32 = (f) => { const b = rb(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
const u32 = (f) => { const b = rb(f); return new Uint32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const ex = (f) => fs.existsSync(f);
function prim(dir, k, mat) {
  const P = f32(`${dir}/${k}_P.bin`), N = f32(`${dir}/${k}_N.bin`), n = P.length / 3, C1 = f32(`${dir}/${k}_COL.bin`), IX = u32(`${dir}/${k}_IX.bin`);
  const COL = new Float32Array(n * 3); for (let i = 0; i < n; i++) COL[i * 3] = COL[i * 3 + 1] = COL[i * 3 + 2] = C1.length === n ? C1[i] : C1[i * 3];
  const J = new Uint8Array(n * 4), W = new Float32Array(n * 4); for (let i = 0; i < n; i++) { J[i * 4] = HEAD; W[i * 4] = 1; }
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc(IX, 'SCALAR')).setAttribute('POSITION', acc(P, 'VEC3')).setAttribute('NORMAL', acc(N, 'VEC3'))
    .setAttribute('COLOR_0', acc(COL, 'VEC3')).setAttribute('JOINTS_0', acc(J, 'VEC4')).setAttribute('WEIGHTS_0', acc(W, 'VEC4'));
  if (ex(`${dir}/${k}_UV.bin`)) p.setAttribute('TEXCOORD_0', acc(f32(`${dir}/${k}_UV.bin`), 'VEC2'));
  return p;
}
doc.createExtension(EXTTextureWebP).setRequired(true);
const tex = (f, name) => doc.createTexture(name).setImage(fs.readFileSync(f)).setMimeType('image/webp').setURI(name + '.webp');
const CJ = JSON.parse(fs.readFileSync(`${R}/cards.json`));
const hairMat = doc.createMaterial('hair').setBaseColorTexture(tex(`${R}/atlas/hair_basecolor.webp`, 'hair_basecolor')).setAlphaMode('MASK').setAlphaCutoff(CJ.cut ?? 0.4)
  .setDoubleSided(true).setRoughnessFactor(0.72).setMetallicFactor(0).setExtras({ hairTone: 'light', hairNormals: 'volume', atlas: 'v3/hair 32 tiles 128x1024' });
const capMat = doc.createMaterial('hairCap').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
const md = `${R}/work/mesh`;
const hm = doc.createMesh('hair'); hm.addPrimitive(prim(md, 'hair', hairMat)); hm.addPrimitive(prim(md, 'hairCap', capMat));
let hairNode = Rt.listNodes().find((n) => n.getName() === 'jensen-hair'), browNode = Rt.listNodes().find((n) => n.getName() === 'jensen-brows');
const scene = Rt.listScenes()[0];
const old = hairNode.getMesh(); hairNode.setMesh(hm); old.dispose();
if (ex(`${md}/brows_P.bin`)) {
  // the brows: the face's 33 targets carried from the skin under each brow point (see brows.py: brows_TGT.bin)
  const bm = doc.createMaterial('brows').setBaseColorTexture(tex(`${R}/atlas/brows_basecolor.webp`, 'brows_basecolor')).setAlphaMode('MASK').setAlphaCutoff(CJ.browCut ?? 0.3)
    .setDoubleSided(true).setRoughnessFactor(0.65).setMetallicFactor(0);
  const p = prim(md, 'brows', bm), n = p.getAttribute('POSITION').getCount();
  const names = browNode.getMesh().getExtras().targetNames, TG = f32(`${md}/brows_TGT.bin`);
  names.forEach((nm, t) => p.addTarget(doc.createPrimitiveTarget(nm).setAttribute('POSITION', acc(TG.slice(t * n * 3, (t + 1) * n * 3), 'VEC3'))));
  const bmesh = doc.createMesh('brows').addPrimitive(p).setExtras({ targetNames: names }).setWeights(new Array(names.length).fill(0));
  const o = browNode.getMesh(); browNode.setMesh(bmesh); o.dispose();
}
if (MODE === 'part') {
  for (const n of Rt.listNodes()) if (n.getMesh() && n !== hairNode && n !== browNode) n.dispose();
  for (const a of Rt.listAnimations()) a.dispose();
}
await doc.transform(prune());
await io.write(OUT, doc);
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB');
