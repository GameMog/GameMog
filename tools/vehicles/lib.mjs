// shared helpers for the fleet build: matrices, primitive extraction into the engine frame, geometry buckets,
// simplification and GLB writing
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
export { MeshoptSimplifier };
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sha256File = (f) => sha256(readFileSync(f));
export const sha1s = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 10);

// ---- 4x4 column-major matrices --------------------------------------------------------------------------------------
export const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
export const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
export const trans = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
export const tp = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
// the normal matrix (inverse transpose of the upper 3x3), as a 9-array row-major
export function normalMat(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g), G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C;
  // inverse = adj^T / det; inverse transpose = adj / det (cofactor matrix / det), row-major rows: [A B C], [D E F], [G H I]
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}
export const tn = (n, x, y, z) => { const v = [n[0] * x + n[1] * y + n[2] * z, n[3] * x + n[4] * y + n[5] * z, n[6] * x + n[7] * y + n[8] * z]; const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---- primitives as plain arrays in a given frame -------------------------------------------------------------------
// each: { name (mesh node), path (ancestor names, nearest first), mat (material name), baseSha (its base texture's
// image), pos Float32Array, nor Float32Array, uv Float32Array|null, idx Uint32Array, flip (det<0) }
export function extract(doc, frame = null, filter = null) {
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const path = []; let p = node;
    while (p && p.propertyType === 'Node') { path.push(p.getName()); p = p.listParents().find((x) => x.propertyType === 'Node'); }
    if (filter && !filter(path, node)) continue;
    const W = frame ? mul(frame, node.getWorldMatrix()) : node.getWorldMatrix();
    const N = normalMat(W);
    const det = W[0] * (W[5] * W[10] - W[9] * W[6]) - W[4] * (W[1] * W[10] - W[9] * W[2]) + W[8] * (W[1] * W[6] - W[5] * W[2]);
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const P = prim.getAttribute('POSITION'), Nn = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
      const n = P.getCount(), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = T ? new Float32Array(n * 2) : null;
      const a = [], b = [], c = [];
      for (let i = 0; i < n; i++) {
        P.getElement(i, a); const w = tp(W, a[0], a[1], a[2]); pos.set(w, i * 3);
        if (Nn) { Nn.getElement(i, b); const v = tn(N, b[0], b[1], b[2]); nor.set(v, i * 3); }
        if (T) { T.getElement(i, c); uv[i * 2] = c[0]; uv[i * 2 + 1] = c[1]; }
      }
      let idx = prim.getIndices() ? Uint32Array.from(prim.getIndices().getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      if (det < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
      const mat = prim.getMaterial();
      const bt = mat?.getBaseColorTexture();
      out.push({ name: node.getName(), path, mat: mat?.getName() || '', baseSha: bt ? sha1s(bt.getImage()) : null, matRef: mat, pos, nor, uv, idx, hasNormals: !!Nn });
    }
  }
  return out;
}

export function bounds(prims) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = p.pos[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return { lo, hi, c: lo.map((v, k) => (v + hi[k]) / 2), s: lo.map((v, k) => hi[k] - v) };
}
export function centroid(prims) {
  let x = 0, y = 0, z = 0, n = 0;
  for (const p of prims) for (let i = 0; i < p.pos.length; i += 3) { x += p.pos[i]; y += p.pos[i + 1]; z += p.pos[i + 2]; n++; }
  return [x / n, y / n, z / n];
}
// apply a 4x4 to prims in place (positions; normals by its rotation part)
export function applyMat(prims, M) {
  const N = normalMat(M);
  for (const p of prims) {
    for (let i = 0; i < p.pos.length; i += 3) { const w = tp(M, p.pos[i], p.pos[i + 1], p.pos[i + 2]); p.pos[i] = w[0]; p.pos[i + 1] = w[1]; p.pos[i + 2] = w[2]; }
    for (let i = 0; i < p.nor.length; i += 3) { const v = tn(N, p.nor[i], p.nor[i + 1], p.nor[i + 2]); p.nor[i] = v[0]; p.nor[i + 1] = v[1]; p.nor[i + 2] = v[2]; }
  }
}

// ---- a bucket: one merged geometry (pos, nor, uv, fleet attr (paint, lamp, glass kind, flags), idx) ------------------
export class Bucket {
  constructor(name) { this.name = name; this.pos = []; this.nor = []; this.uv = []; this.fl = []; this.idx = []; this.n = 0; }
  // add a prim's triangles (tris: a list of triangle indices to keep, or null for all); uvMap(u, v, tri) -> [u, v];
  // fl: [paint 0..255, lamp id, glass kind, flags] per vertex (constant for the prim) or a function of the vertex
  add(p, { tris = null, uvMap = null, fl = [0, 0, 0, 0] } = {}) {
    const remap = new Map();
    const T = tris || Array.from({ length: p.idx.length / 3 }, (_, t) => t);
    for (const t of T) {
      for (let k = 0; k < 3; k++) {
        const vi = p.idx[t * 3 + k];
        const u0 = p.uv ? p.uv[vi * 2] : 0, v0 = p.uv ? p.uv[vi * 2 + 1] : 0;
        const m = uvMap ? uvMap(u0, v0, t) : [u0, v0];
        // (a per-triangle uv mapping can split a vertex: shared while its mapped uv is the same)
        const key = uvMap ? `${vi}:${m[0].toFixed(6)}:${m[1].toFixed(6)}` : vi;
        let o = remap.get(key);
        if (o === undefined) {
          o = this.n++; remap.set(key, o);
          this.pos.push(p.pos[vi * 3], p.pos[vi * 3 + 1], p.pos[vi * 3 + 2]);
          this.nor.push(p.nor[vi * 3], p.nor[vi * 3 + 1], p.nor[vi * 3 + 2]);
          this.uv.push(m[0], m[1]);
          const f = typeof fl === 'function' ? fl(vi) : fl;
          this.fl.push(f[0], f[1], f[2], f[3]);
        }
        this.idx.push(o);
      }
    }
  }
  get tris() { return this.idx.length / 3; }
  arrays() { return { pos: Float32Array.from(this.pos), nor: Float32Array.from(this.nor), uv: Float32Array.from(this.uv), fl: Uint8Array.from(this.fl), idx: Uint32Array.from(this.idx) }; }
}
// merge arrays objects
export function mergeArrays(list) {
  const n = list.reduce((s, a) => s + a.pos.length / 3, 0), m = list.reduce((s, a) => s + a.idx.length, 0);
  const o = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), uv: new Float32Array(n * 2), fl: new Uint8Array(n * 4), idx: new Uint32Array(m) };
  let v = 0, i = 0;
  for (const a of list) {
    const k = a.pos.length / 3;
    o.pos.set(a.pos, v * 3); o.nor.set(a.nor, v * 3); o.uv.set(a.uv, v * 2); o.fl.set(a.fl, v * 4);
    for (let j = 0; j < a.idx.length; j++) o.idx[i + j] = a.idx[j] + v;
    v += k; i += a.idx.length;
  }
  return o;
}
export function transformArrays(a, M) {
  const N = normalMat(M), o = { ...a, pos: Float32Array.from(a.pos), nor: Float32Array.from(a.nor) };
  for (let i = 0; i < o.pos.length; i += 3) { const w = tp(M, o.pos[i], o.pos[i + 1], o.pos[i + 2]); o.pos.set(w, i); const v = tn(N, o.nor[i], o.nor[i + 1], o.nor[i + 2]); o.nor.set(v, i); }
  return o;
}
// compact: drop unused vertices
export function compact(a, idx) {
  const map = new Int32Array(a.pos.length / 3).fill(-1); let n = 0;
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) { let m = map[idx[i]]; if (m < 0) m = map[idx[i]] = n++; out[i] = m; }
  const o = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), uv: new Float32Array(n * 2), fl: new Uint8Array(n * 4), idx: out };
  for (let v = 0; v < map.length; v++) { const m = map[v]; if (m < 0) continue; o.pos.set(a.pos.subarray(v * 3, v * 3 + 3), m * 3); o.nor.set(a.nor.subarray(v * 3, v * 3 + 3), m * 3); o.uv.set(a.uv.subarray(v * 2, v * 2 + 2), m * 2); o.fl.set(a.fl.subarray(v * 4, v * 4 + 4), m * 4); }
  return o;
}
// simplify to about `ratio` of the triangles (or a target count), attribute-aware (normals, uv); sloppy for the far LOD
export function simplify(a, target, { error = 0.02, sloppy = false, uvWeight = 0.5, nWeight = 0.25 } = {}) {
  const tgt = Math.max(3, Math.floor(target) * 3);
  if (a.idx.length <= tgt) return a;
  let res;
  if (sloppy) res = MeshoptSimplifier.simplifySloppy(a.idx, a.pos, 3, null, tgt, error);
  else {
    const n = a.pos.length / 3, attr = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { attr[i * 6] = a.nor[i * 3]; attr[i * 6 + 1] = a.nor[i * 3 + 1]; attr[i * 6 + 2] = a.nor[i * 3 + 2]; attr[i * 6 + 3] = a.uv[i * 2]; attr[i * 6 + 4] = a.uv[i * 2 + 1]; attr[i * 6 + 5] = a.fl[i * 4 + 1] / 8 + a.fl[i * 4] / 255; }
    // (the lamps and the paint edge kept: a vertex's lamp id and paint flag weigh heavily)
    res = MeshoptSimplifier.simplifyWithAttributes(a.idx, a.pos, 3, attr, 6, [nWeight, nWeight, nWeight, uvWeight, uvWeight, 4], null, tgt, error, []);
  }
  return compact(a, res[0]);
}

// ---- a GLB of named meshes (geometry only), quantized normals / uvs, meshopt-compressed ---------------------------------
// meshes: [{ name, arrays, mat (material name) }], extras: asset.extras
export async function writeGLB(file, meshes, extras) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('fleet');
  const mats = new Map();
  for (const m of meshes) {
    const a = m.arrays;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(a.pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(a.nor).setBuffer(buf))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(a.uv).setBuffer(buf))
      .setAttribute('_FLEET', doc.createAccessor().setType('VEC4').setArray(a.fl).setNormalized(true).setBuffer(buf))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(a.pos.length / 3 > 65535 ? a.idx : Uint16Array.from(a.idx)).setBuffer(buf));
    let mat = mats.get(m.mat || 'fleet');
    if (!mat) { mat = doc.createMaterial(m.mat || 'fleet'); mats.set(m.mat || 'fleet', mat); }
    prim.setMaterial(mat);
    const mesh = doc.createMesh(m.name).addPrimitive(prim);
    scene.addChild(doc.createNode(m.name).setMesh(mesh));
  }
  doc.getRoot().getAsset().extras = extras;
  await doc.transform(quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 8, quantizeTexcoord: 16 }));
  await doc.transform(prune({ keepAttributes: true, keepIndices: true }));
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const glb = await io.writeBinary(doc);
  return Buffer.from(glb);
}
