// Hand-built young hero: read / write the GLB the forge's way (meshopt FILTER, index order kept (face.js picks triangles
// by their first corner), positions at float precision, node transforms exactly as read), plus helpers to get at the
// shared body buffer (the skin family's primitives share one vertex set) and the bones.
import { createRequire } from 'node:module';
const TB = process.env.FORGE_TOOLBOX_DIR || new URL('../../../.scratch/tools/gltf/', import.meta.url).pathname;
export const require = createRequire(TB + 'node_modules/');
const { NodeIO, PropertyType } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } = require('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');
export const sharp = require('sharp');
export const THREE = await import(new URL('node_modules/three/build/three.module.js', 'file://' + (process.env.FORGE_GAMEMOG || new URL('../../../', import.meta.url).pathname).replace(/\/?$/, '/')).href);
export { MeshoptSimplifier, PropertyType };
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const encoder = Object.assign(Object.create(MeshoptEncoder), { encodeGltfBuffer: (a, n, s, mode) => MeshoptEncoder.encodeGltfBuffer(a, n, s, mode === 'TRIANGLES' ? 'INDICES' : mode) });
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': encoder });
const readJson = (g) => { const L = g.readUInt32LE(12); return JSON.parse(g.subarray(20, 20 + L).toString('utf8')); };
function writeJson(g, json) {
  const L0 = g.readUInt32LE(12), rest = g.subarray(20 + L0); let s = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (4 - (s.length % 4)) % 4; s = Buffer.concat([s, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + s.length + rest.length, 8); head.writeUInt32LE(s.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, s, rest]);
}
export async function read(file) { const fs = await import('node:fs'); const src = fs.readFileSync(file); const doc = await io.readBinary(src); doc.setLogger({ debug() {}, info() {}, warn() {}, error: console.error }); return { doc, src }; }
export async function write(doc, src, K = {}) {
  for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization/i.test(e.extensionName)) e.dispose();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = Buffer.from(await io.writeBinary(doc)), json = readJson(glb), sj = readJson(src);
  for (const bv of json.bufferViews) { const e = bv.extensions?.EXT_meshopt_compression; if (e && e.mode === 'TRIANGLES') e.mode = 'INDICES'; }
  if (sj.nodes.length !== json.nodes.length || sj.nodes.some((nd, i) => (nd.name ?? '') !== (json.nodes[i].name ?? ''))) throw new Error('node order changed');
  // (K.ownTRS: a pass that set the rest pose on purpose (jensen-cast/plumb.mjs bakeRestPass) keeps the document's TRS)
  if (!K.ownTRS) json.nodes.forEach((nd, i) => { for (const k of ['translation', 'rotation', 'scale', 'matrix']) { delete nd[k]; if (sj.nodes[i][k]) nd[k] = sj.nodes[i][k]; } });
  return writeJson(glb, json);
}
// the body: the skin primitive (largest skin-material one), its arrays, and per-vertex weight on a set of bones
export function body(doc) {
  const R = doc.getRoot(), prims = R.listMeshes().flatMap((m) => m.listPrimitives().map((p) => ({ m, p })));
  const sk = prims.filter(({ p }) => p.getMaterial()?.getName() === 'skin').sort((a, b) => b.p.getIndices().getCount() - a.p.getIndices().getCount())[0].p;
  const P = sk.getAttribute('POSITION'), skin = R.listSkins()[0], joints = skin.listJoints(), names = joints.map((j) => j.getName());
  const J = sk.getAttribute('JOINTS_0').getArray(), W = sk.getAttribute('WEIGHTS_0').getArray();
  const wOn = (re) => { const set = new Set(names.map((n, i) => (re.test(n) ? i : -1)).filter((i) => i >= 0)), n = P.getCount(), out = new Float32Array(n);
    const norm = sk.getAttribute('WEIGHTS_0').getNormalized(), sc = norm ? (W instanceof Uint8Array ? 255 : 65535) : 1;
    for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) if (set.has(J[v * 4 + k])) out[v] += W[v * 4 + k] / sc; return out; };
  return { prims, sk, P, pos: P.getArray(), uv: sk.getAttribute('TEXCOORD_0'), idx: sk.getIndices().getArray(), names, joints, skin, wOn };
}
export const prim = (doc, matName) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial()?.getName() === matName);
export const matOf = (doc, name) => doc.getRoot().listMaterials().find((m) => m.getName() === name);
// raster triangles in uv space: cb(x, y, l1, l2, l3, a, b, c) for every texel centre inside (with a small grow)
export function raster(tri, uvS, S, cb, grow = 0.02) {
  for (let q = 0; q < tri.length; q += 3) {
    const a = tri[q], b = tri[q + 1], c = tri[q + 2], A = uvS(a), Bv = uvS(b), C = uvS(c);
    const x0 = Math.max(0, Math.floor(Math.min(A[0], Bv[0], C[0]) - 1)), x1 = Math.min(S - 1, Math.ceil(Math.max(A[0], Bv[0], C[0]) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], Bv[1], C[1]) - 1)), y1 = Math.min(S - 1, Math.ceil(Math.max(A[1], Bv[1], C[1]) + 1));
    const d = (Bv[1] - C[1]) * (A[0] - C[0]) + (C[0] - Bv[0]) * (A[1] - C[1]); if (Math.abs(d) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((Bv[1] - C[1]) * (px - C[0]) + (C[0] - Bv[0]) * (py - C[1])) / d, l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -grow || l2 < -grow || l3 < -grow) continue;
      cb(x, y, l1, l2, l3, a, b, c);
    }
  }
}
export const h3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1440662683) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 0xffff) / 65535; };
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v), L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const fbm = (x, y, z, f, oct = 3) => { let s = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { s += a * noise3(x * f + o * 17.3, y * f + o * 31.1, z * f + o * 7.7); n += a; a *= 0.5; f *= 2.03; } return s / n; };
export const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export async function rgba(tex) { const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
export async function setWebp(tex, data, w, h, q = 88, ch = 4) { tex.setImage(await sharp(data, { raw: { width: w, height: h, channels: ch } }).webp({ quality: q, effort: 5 }).toBuffer()).setMimeType('image/webp'); }
