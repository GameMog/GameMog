// Step 10: write jacket.glb: the jacket's three primitives (leather, hardware, zip-tape) skinned to Jensen's own skin
// (jensen.glb's 66 joints, node tree and inverse binds copied as they are), positions in his bind space.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.FORGE_TOOLBOX_DIR.replace(/\/?$/, '/') + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions'); const { prune } = require('@gltf-transform/functions');
const { MeshoptDecoder } = require('meshoptimizer'); const sharp = require('sharp');
await MeshoptDecoder.ready;
const H = new URL('.', import.meta.url).pathname, X = H + 'export/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read((process.env.JH_GLB || new URL('../../../../../storykit/handbuilt/jensen/jensen.glb', import.meta.url).pathname)); const R = doc.getRoot();
for (const e of R.listExtensionsUsed()) if (/meshopt|quantization|webp/i.test(e.extensionName)) e.dispose();
const skin = R.listSkins()[0];
const meshNodes = R.listNodes().filter((n) => n.getMesh());
const bodyNode = meshNodes.find((n) => n.getName() === '') || meshNodes[0];
for (const n of meshNodes) n.setMesh(null);
for (const n of meshNodes) if (n !== bodyNode) n.dispose();
for (const m of R.listMeshes()) m.dispose();
for (const m of R.listMaterials()) m.dispose();
for (const t of R.listTextures()) t.dispose();
await doc.transform(prune({ keepLeaves: true }));
const buf = R.listBuffers()[0] || doc.createBuffer();
const rd = (f, T) => { const b = fs.readFileSync(X + f); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const acc = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buf);
async function tex(file, name, mime = 'image/jpeg', q = 92, size = null) {
  let s = sharp(H + 'tex/' + file); if (size) s = s.resize(size, size);
  const img = mime === 'image/png' ? await s.png({ compressionLevel: 9 }).toBuffer() : await s.jpeg({ quality: q, chromaSubsampling: '4:4:4' }).toBuffer();
  return doc.createTexture(name).setImage(img).setMimeType(mime).setURI(name + (mime === 'image/png' ? '.png' : '.jpg'));
}
const extras = { layer: 5, kind: 'cloth', garment: 'leather-moto-jacket' };
const leather = doc.createMaterial('leather').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true)
  .setBaseColorTexture(await tex('leather_basecolor.png', 'leather_basecolor', 'image/jpeg', 92))
  .setNormalTexture(await tex('leather_normal.png', 'leather_normal', 'image/jpeg', 94))
  .setExtras({ ...extras, part: 'shell' });
const orm = await tex('leather_orm.png', 'leather_orm', 'image/jpeg', 92);
leather.setMetallicRoughnessTexture(orm).setOcclusionTexture(orm);
const hardware = doc.createMaterial('hardware').setBaseColorFactor([0.56, 0.56, 0.58, 1]).setMetallicFactor(1).setRoughnessFactor(0.26).setExtras({ ...extras, part: 'hardware', metal: 'nickel' });
const tape = doc.createMaterial('zip-tape').setBaseColorFactor([0.012, 0.012, 0.013, 1]).setMetallicFactor(0).setRoughnessFactor(0.8).setExtras({ ...extras, part: 'zip-tape' });
const mesh = doc.createMesh('moto-jacket');
const info = JSON.parse(fs.readFileSync(X + 'info.json'));
for (const [name, mat] of [['leather', leather], ['hardware', hardware], ['zip-tape', tape]]) {
  const idx = rd(name + '.idx.bin', Uint32Array); const nV = info[name].verts;
  const p = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', acc(rd(name + '.pos.bin', Float32Array), 'VEC3'))
    .setAttribute('NORMAL', acc(rd(name + '.nor.bin', Float32Array), 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(rd(name + '.uv.bin', Float32Array), 'VEC2'))
    .setAttribute('JOINTS_0', acc(rd(name + '.j.bin', Uint16Array), 'VEC4'))
    .setAttribute('WEIGHTS_0', acc(rd(name + '.w.bin', Float32Array), 'VEC4'))
    .setIndices(acc(nV < 65536 ? Uint16Array.from(idx) : idx, 'SCALAR'));
  mesh.addPrimitive(p);
}
bodyNode.setName('moto-jacket').setMesh(mesh).setSkin(skin);
const ax = R.getAsset(); ax.extras = { ...(ax.extras || {}), jacket: { what: "Jensen Heist's black leather moto jacket (Blender build, 18 Nov 2026)", bind: 'jensen.glb skin, same 66 joints / inverse binds', tris: Object.values(info).reduce((a, b) => a + b.tris, 0),
  credits: 'Leather grain: ambientCG Leather026 (CC0), Poly Haven leather_white by Rob Tuytel (CC0). Geometry, pattern, stitching and hardware: original work.' } };
await doc.transform(prune({ keepLeaves: true }));
await io.write(H + 'jacket.glb', doc);
const st = fs.statSync(H + 'jacket.glb'); console.log('jacket.glb', (st.size / 1048576).toFixed(2), 'MB', JSON.stringify(info));
