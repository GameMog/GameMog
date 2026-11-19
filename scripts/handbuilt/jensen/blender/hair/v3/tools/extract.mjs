// dump the head's bind-space geometry from jensen.glb into ../work/head/*.bin (+ meta.json)
import { io } from './tk.mjs'; import fs from 'node:fs';
const [SRC, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const doc = await io.read(SRC), R = doc.getRoot(); const meta = {};
const w = (k, a) => { fs.writeFileSync(`${OUT}/${k}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength)); meta[k] = [a.constructor.name, a.length]; };
const body = R.listMeshes().find((m) => m.listPrimitives().some((p) => p.getMaterial()?.getName() === 'eyes'));
const prims = body.listPrimitives();
w('P', prims[0].getAttribute('POSITION').getArray().slice());
w('UV', prims[0].getAttribute('TEXCOORD_0').getArray().slice());
w('skinIX', new Uint32Array(prims.filter((p) => p.getMaterial().getName() === 'skin').flatMap((p) => [...p.getIndices().getArray()])));
w('eyesIX', new Uint32Array(prims.find((p) => p.getMaterial().getName() === 'eyes').getIndices().getArray()));
meta.targetNames = body.getExtras().targetNames;
const T = prims[0].listTargets(); const TD = new Float32Array(T.length * prims[0].getAttribute('POSITION').getCount() * 3);
T.forEach((t, i) => TD.set(t.getAttribute('POSITION').getArray(), i * prims[0].getAttribute('POSITION').getCount() * 3)); w('targets', TD);
for (const nm of ['hair', 'brows', 'glasses']) { const m = R.listMeshes().find((x) => x.getName() === nm); if (!m) continue; const p = m.listPrimitives()[0]; w(nm + 'P', p.getAttribute('POSITION').getArray().slice()); }
const sk = R.listSkins()[0], J = sk.listJoints(), hi = J.findIndex((j) => j.getName() === 'head');
const IBM = sk.getInverseBindMatrices().getArray(); meta.headIBM = [...IBM.slice(hi * 16, hi * 16 + 16)]; meta.headJoint = hi;
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta));
console.log(meta);
