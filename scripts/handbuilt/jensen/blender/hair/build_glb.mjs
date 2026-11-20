// hair.glb: Jensen's skeleton and skin (from jensen.glb, unchanged) + three new skinned meshes in his bind space:
//   node 'jensen-hair'  mesh 'hair':  primitives hair (cards, MASK, atlas) and hairCap (opaque under-shell)
//   node 'jensen-brows' mesh 'brows': primitive brows (MASK) with the face's 33 morph targets (carried from the skin)
// every vertex 100% on the 'head' joint.
//   node build_glb.mjs <jensen.glb> <out.glb>
import { io, require } from './tk.mjs';
import fs from 'node:fs';
const { EXTTextureWebP } = require('@gltf-transform/extensions');
const { prune } = require('@gltf-transform/functions');
const [SRC, OUT] = process.argv.slice(2), D = new URL('.', import.meta.url).pathname;
const doc = await io.read(SRC), R = doc.getRoot();
const skin = R.listSkins()[0], joints = skin.listJoints(), HEAD = joints.findIndex((j) => j.getName() === 'head');
// the face's skin and its targets, read before the old meshes go
const skinPrim = R.listMeshes().flatMap((m) => m.listPrimitives().map((p) => ({ m, p }))).filter(({ p }) => p.getMaterial()?.getName() === 'skin').sort((a, b) => b.p.getIndices().getCount() - a.p.getIndices().getCount())[0];
const SP = skinPrim.p.getAttribute('POSITION').getArray(), used = [...new Set(skinPrim.p.getIndices().getArray())];
const names = skinPrim.m.getExtras()?.targetNames || skinPrim.p.listTargets().map((t, i) => t.getName() || 't' + i);
const TD = skinPrim.p.listTargets().map((t) => t.getAttribute('POSITION').getArray().slice());
console.log('head joint', HEAD, 'targets', names.length);
// out with every old mesh
for (const n of R.listNodes()) if (n.getMesh() && !joints.includes(n)) n.dispose();
for (const m of R.listMeshes()) m.dispose();
const buf = R.listBuffers()[0];
const rb = (k) => fs.readFileSync(`${D}/meshes/${k}.bin`);
const f32 = (k) => { const b = rb(k); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
const u32 = (k) => { const b = rb(k); return new Uint32Array(b.buffer, b.byteOffset, b.length / 4).slice(); };
const acc = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
function prim(k, mat) {
  const P = f32(k + '_P'), N = f32(k + '_N'), UV = f32(k + '_UV'), C1 = f32(k + '_COL'), IX = u32(k + '_IX'), n = P.length / 3;
  const COL = new Float32Array(n * 3); for (let i = 0; i < n; i++) COL[i * 3] = COL[i * 3 + 1] = COL[i * 3 + 2] = C1[i];
  const J = new Uint8Array(n * 4), W = new Float32Array(n * 4); for (let i = 0; i < n; i++) { J[i * 4] = HEAD; W[i * 4] = 1; }
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc(IX, 'SCALAR'))
    .setAttribute('POSITION', acc(P, 'VEC3')).setAttribute('NORMAL', acc(N, 'VEC3')).setAttribute('TEXCOORD_0', acc(UV, 'VEC2'))
    .setAttribute('COLOR_0', acc(COL, 'VEC3')).setAttribute('JOINTS_0', acc(J, 'VEC4')).setAttribute('WEIGHTS_0', acc(W, 'VEC4'));
  return { p, P, n };
}
const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
const tex = (f, name) => doc.createTexture(name).setImage(fs.readFileSync(f)).setMimeType('image/webp').setURI(name + '.webp');
const hairMat = doc.createMaterial('hair').setBaseColorTexture(tex(`${D}/atlas/hair_basecolor.webp`, 'hair_basecolor')).setAlphaMode('MASK').setAlphaCutoff(0.35)
  .setDoubleSided(true).setRoughnessFactor(0.6).setMetallicFactor(0).setExtras({ hairTone: 'light', hairNormals: 'volume', atlas: 'blender/hair v2 16 tiles 256x1024' });
const capMat = doc.createMaterial('hairCap').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
const browMat = doc.createMaterial('brows').setBaseColorTexture(tex(`${D}/atlas/brows_basecolor.webp`, 'brows_basecolor')).setAlphaMode('MASK').setAlphaCutoff(0.3)
  .setDoubleSided(true).setRoughnessFactor(0.65).setMetallicFactor(0);
const scene = R.listScenes()[0];
const hm = doc.createMesh('hair'); hm.addPrimitive(prim('hair', hairMat).p); hm.addPrimitive(prim('hairCap', capMat).p);
scene.addChild(doc.createNode('jensen-hair').setMesh(hm).setSkin(skin));
// brows: each vertex carries the deltas of the skin under it (every skin point within 8 mm, weight (1 - d/r)^2, the still
// ones too: facekit.mjs's carryRiders averages only the moving points, which pulled the brows' lower edge down with
// the lids on a blink), so they ride browInnerUp/browOuterUp/frowns with the skin
const b = prim('brows', browMat), r = 0.008, cell = 0.008, G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
for (const v of used) { const k = key(SP[v * 3], SP[v * 3 + 1], SP[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); }
const bm = doc.createMesh('brows'); bm.addPrimitive(b.p);
let moved = 0;
names.forEach((nm, t) => {
  const Dt = TD[t], out = new Float32Array(b.n * 3);
  for (let i = 0; i < b.n; i++) {
    const x = b.P[i * 3], y = b.P[i * 3 + 1], z = b.P[i * 3 + 2]; let w = 0; const s = [0, 0, 0];
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) { const L = G.get(`${Math.floor(x / cell) + a},${Math.floor(y / cell) + c},${Math.floor(z / cell) + e}`); if (!L) continue;
      for (const v of L) { if (SP[v * 3 + 1] < y - 0.001) continue; const d = Math.hypot(SP[v * 3] - x, SP[v * 3 + 1] - y, SP[v * 3 + 2] - z); if (d > r) continue; const q = (1 - d / r) ** 2; w += q; for (let k = 0; k < 3; k++) s[k] += Dt[v * 3 + k] * q; } }
    if (w > 0) { for (let k = 0; k < 3; k++) out[i * 3 + k] = s[k] / w; moved++; }
  }
  b.p.addTarget(doc.createPrimitiveTarget(nm).setAttribute('POSITION', acc(out, 'VEC3')));
});
bm.setWeights(names.map(() => 0)).setExtras({ targetNames: names });
scene.addChild(doc.createNode('jensen-brows').setMesh(bm).setSkin(skin));
await doc.transform(prune({ keepLeaves: true }));
for (const e of R.listExtensionsUsed()) if (/meshopt|quantiz/i.test(e.extensionName)) e.dispose();
await io.write(OUT, doc);
console.log('wrote', OUT, (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB; brow vertex-targets moved', moved);
