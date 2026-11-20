// Jensen Heist, cast round 3 (19 Nov, release blocker A: every body at most 6 MB, the platform's cap for a Mog's body,
// scripts/storykit-showcase-jensen.ts BODY_LIMITS): a lossless-looking diet run last on a built GLB, in place.
//   node scripts/handbuilt/jensen-cast/slim.mjs <in.glb> [out.glb]      (env SLIM='{"cap":{...}}' overrides the caps)
// What it does, none of it visible at a call tile or a close-up:
//   - materials and textures nothing draws any more (an earlier round's uniform under the leather, an old cut) disposed
//   - each texture held to a cap by its role (the face's skin keeps 4096 for its colour and 2048 for its normal; the
//     leather's normal 2048, its coat and ORM 1024; shoes 1024; everything else as it was), re-encoded as WebP only
//     where it shrinks
//   - the clips' keyframes resampled (gltf-transform resample: a key dropped only where the curve through its neighbours
//     already passes within 1e-4 of it)
//   - the hair cards' vertex colour as normalized bytes and their uvs as normalized shorts (core glTF accessor types;
//     the atlas's 2048 texels need far less than a float's precision)
// Original procedural work, CC0.
import fs from 'node:fs';
import { read, write, require, sharp } from '../young-hero/glb.mjs';
const { resample } = require('@gltf-transform/functions');
const DEF = { cap: { 'skin.n': 2048, 'skin.b': 4096, 'skin.o': 2048, 'leather.n': 2048, 'leather.o': 1024, 'leather_coat': 512, 'shoes': 1024, 'uniform': 1024, '*': 4096 }, q: 90, qn: 76 };
export async function slimDoc(doc, K0 = {}) {
const K = { ...DEF, ...K0, cap: { ...DEF.cap, ...(K0.cap || {}) } }, R = doc.getRoot();
// ---- orphans: a material on no primitive, then a texture on no material
let nm = 0, nt = 0;
for (const m of R.listMaterials()) if (!m.listParents().some((p) => p.propertyType === 'Primitive')) { m.dispose(); nm++; }
// (a texture an extension holds (a sheen, a clearcoat, a specular map) has that extension as its parent, not the material)
for (const t of R.listTextures()) if (!t.listParents().some((p) => p.propertyType !== 'Root')) { t.dispose(); nt++; }
// ---- textures to their caps
const role = (t) => { const ms = t.listParents().filter((p) => p.propertyType === 'Material'); const out = [];
  for (const m of ms) { const n = m.getName(); if (m.getNormalTexture() === t) out.push(n + '.n'); if (m.getBaseColorTexture() === t) out.push(n + '.b'); if (m.getOcclusionTexture() === t || m.getMetallicRoughnessTexture() === t) out.push(n + '.o'); out.push(n); }
  if (t.getName()) out.push(t.getName()); return out; };
let saved = 0; const rows = [];
for (const t of R.listTextures()) { const img = t.getImage(); if (!img) continue; const size = t.getSize(); if (!size) continue; const rs = role(t);
  const cap = Math.min(...rs.map((r) => K.cap[r] ?? Infinity), K.cap['*']), [w, h] = size;
  // (a normal map still dense (over 0.2 bytes a texel) re-encoded at K.qn even at its size: its fine grain is noise at q90)
  const isN = rs.some((r) => r.endsWith('.n')), dense = isN && img.byteLength / (w * h) > 0.2;
  if (Math.max(w, h) <= cap && !dense) continue;
  const k = Math.min(1, cap / Math.max(w, h)), W = Math.round(w * k), H = Math.round(h * k);
  const out = await sharp(Buffer.from(img)).resize(W, H, { kernel: 'lanczos3' }).webp({ quality: isN ? K.qn : K.q, effort: 5, alphaQuality: 100 }).toBuffer();
  if (out.length < img.byteLength) { t.setImage(out).setMimeType('image/webp'); saved += img.byteLength - out.length; rows.push(`${rs[0]} ${w}->${W} ${(img.byteLength / 1024).toFixed(0)}K->${(out.length / 1024).toFixed(0)}K`); } }
// ---- clips
const keys0 = R.listAccessors().filter((a) => a.listParents().some((p) => p.propertyType === 'AnimationSampler')).reduce((s, a) => s + a.getCount(), 0);
await doc.transform(resample({ tolerance: 1e-4 }));
const keys1 = R.listAccessors().filter((a) => a.listParents().some((p) => p.propertyType === 'AnimationSampler')).reduce((s, a) => s + a.getCount(), 0);
// ---- the hair cards' colour and uvs as normalized integers
let nq = 0;
for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { if (!/^hair/.test(p.getMaterial()?.getName() || '')) continue;
  const c = p.getAttribute('COLOR_0'); if (c && c.getComponentType() === 5126) { const A = c.getArray(), B = new Uint8Array(A.length); for (let i = 0; i < A.length; i++) B[i] = Math.round(Math.max(0, Math.min(1, A[i])) * 255); c.setArray(B).setNormalized(true); nq++; }
  const u = p.getAttribute('TEXCOORD_0'); if (u && u.getComponentType() === 5126) { const A = u.getArray(); if (A.every((x) => x >= 0 && x <= 1)) { const B = new Uint16Array(A.length); for (let i = 0; i < A.length; i++) B[i] = Math.round(A[i] * 65535); u.setArray(B).setNormalized(true); nq++; } } }
// ---- floats rounded to what can be seen (the asset library's way, scripts/assets/build.ts): positions to 1/16384 m
// (0.06 mm), the morphs' deltas to 1/65536 m, uvs to 1/32768 of the texture; meshopt then packs the zeroed low bits
const RND = { POSITION: 2 ** -14, T: 2 ** -16, TEXCOORD_0: 2 ** -15, ...K.round }; let nr = 0; const done = new Set();
const rnd = (a, q) => { if (!a || done.has(a) || a.getComponentType() !== 5126 || !q) return; done.add(a); const A = a.getArray().slice(); for (let i = 0; i < A.length; i++) A[i] = Math.round(A[i] / q) * q; a.setArray(A); nr++; };
// (the face's own family (the skin and what lies a hair's breadth over or under it: a stubble card, the mouth's bag) keeps
// its positions exact: rounded, a stubble card 0.05 mm off the cheek fell under it and the mouth's bag showed through)
const FACE = /^(skin|eyes|brows|lashes|teethUp|teethLow|beard|mouth-inside|tongue|cornea)$/;
for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) if (FACE.test(p.getMaterial()?.getName() || '')) done.add(p.getAttribute('POSITION'));
for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { rnd(p.getAttribute('POSITION'), RND.POSITION); rnd(p.getAttribute('TEXCOORD_0'), RND.TEXCOORD_0);
  for (const t of p.listTargets()) rnd(t.getAttribute('POSITION'), RND.T); }
// ---- skin weights as normalized bytes (core glTF), each vertex's four renormalized to sum to exactly 255
let nw = 0;
for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const a = p.getAttribute('WEIGHTS_0'); if (!a || done.has(a) || a.getComponentType() !== 5126) continue; done.add(a);
  const A = a.getArray(), B = new Uint8Array(A.length);
  for (let i = 0; i < A.length; i += 4) { const s = A[i] + A[i + 1] + A[i + 2] + A[i + 3] || 1; let t = 0, mx = i; for (let k = 0; k < 4; k++) { B[i + k] = Math.round((A[i + k] / s) * 255); t += B[i + k]; if (A[i + k] > A[mx]) mx = i + k; } B[mx] += 255 - t; }
  a.setArray(B).setNormalized(true); nw++; }
// (accessors left with no parent after the resample: out)
for (const a of R.listAccessors()) if (!a.listParents().some((p) => p.propertyType !== 'Root')) a.dispose();
const msg = ['orphans', nm, 'materials', nt, 'textures; textures -', (saved / 1048576).toFixed(2), 'MiB', rows.join(', '), '; clip keys', keys0, '->', keys1, '; hair accessors quantized', nq, '; float accessors rounded', nr, '; weights as bytes', nw].join(' ');
return msg; }

if (import.meta.url === 'file://' + process.argv[1]) {
  const [IN, OUT = IN] = process.argv.slice(2), { doc, src } = await read(IN), before = fs.statSync(IN).size;
  const msg = await slimDoc(doc, JSON.parse(process.env.SLIM || '{}')), glb = await write(doc, src); fs.writeFileSync(OUT, glb);
  console.log('slim:', IN.split('/').pop(), (before / 1048576).toFixed(2), '->', (glb.length / 1048576).toFixed(2), 'MiB;', msg);
}
