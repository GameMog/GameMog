/**
 * A scanned model for the library, from a Poly Haven glTF: every node that
 * carries a mesh becomes a named part (a rock of a set, a fern of a clump, a
 * hydrant new or aged), with its transform baked in and its triangles cut to
 * a game budget by meshoptimizer (the scan's normal map keeps the detail the
 * triangles lose). Materials keep their scanned colour, normal and packed
 * AO/roughness/metalness maps, copied as they are.
 *
 * Output: model.bin.z (deflated: positions, normals, uvs, indices per part
 * and material) and the texture JPEGs; asset.json describes both.
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { CACHE, Packer } from './lib.ts';

type Mat4 = number[];
const I4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }): Mat4 {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

type Opts = { budget: number; parts?: (name: string) => boolean; errors?: number };

/**
 * Vertex clustering, for scans the careful cut cannot simplify: vertices in
 * one grid cell merge (position and normal averaged), but only with vertices
 * of the same patch of texture, so the seams between texture islands stay
 * where they are. The cell shrinks until the triangle budget is met.
 */
function cluster(p: { pos: Float32Array; nor: Float32Array; uv: Float32Array; idx: Uint32Array }, want: number) {
  const nv = p.pos.length / 3;
  let lo = 0, hi = 0;
  for (let c = 0; c < 3; c++) { let a = Infinity, b = -Infinity; for (let v = 0; v < nv; v++) { a = Math.min(a, p.pos[v * 3 + c]); b = Math.max(b, p.pos[v * 3 + c]); } hi = Math.max(hi, b - a); }
  let best: ReturnType<typeof run> | null = null, cell = hi / 20;
  function run(size: number) {
    const key = new Map<string, number>(), rep = new Uint32Array(nv), sums: number[][] = [];
    for (let v = 0; v < nv; v++) {
      const k = `${Math.floor(p.pos[v * 3] / size)},${Math.floor(p.pos[v * 3 + 1] / size)},${Math.floor(p.pos[v * 3 + 2] / size)},${Math.floor(p.uv[v * 2] * 16)},${Math.floor(p.uv[v * 2 + 1] * 16)}`;
      let r = key.get(k); if (r === undefined) { r = sums.length; key.set(k, r); sums.push([0, 0, 0, 0, 0, 0, 0, 0, 0]); }
      rep[v] = r; const S = sums[r];
      for (let c = 0; c < 3; c++) { S[c] += p.pos[v * 3 + c]; S[3 + c] += p.nor[v * 3 + c]; } S[6] += p.uv[v * 2]; S[7] += p.uv[v * 2 + 1]; S[8]++;
    }
    const tris: number[] = [];
    for (let t = 0; t < p.idx.length; t += 3) { const a = rep[p.idx[t]], b = rep[p.idx[t + 1]], c = rep[p.idx[t + 2]]; if (a !== b && b !== c && a !== c) tris.push(a, b, c); }
    const n = sums.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    sums.forEach((S, r) => { for (let c = 0; c < 3; c++) pos[r * 3 + c] = S[c] / S[8]; const l = Math.hypot(S[3], S[4], S[5]) || 1; for (let c = 0; c < 3; c++) nor[r * 3 + c] = S[3 + c] / l; uv[r * 2] = S[6] / S[8]; uv[r * 2 + 1] = S[7] / S[8]; });
    return { pos, nor, uv, idx: Uint32Array.from(tris) };
  }
  // the smallest cell whose result fits the budget
  for (let i = 0; i < 18; i++) {
    const r = run(cell);
    if (r.idx.length / 3 <= want) { best = r; cell *= 0.8; } else { if (best) break; cell *= 1.4; }
  }
  return best ?? run(hi / 8);
}

export async function buildModel(srcDir: string, outDir: string, opts: Opts) {
  await MeshoptSimplifier.ready;
  const dir = join(CACHE, srcDir);
  const file = readFileSync(join(dir, `${srcDir.replace(/^ph-model-/, '')}_1k.gltf`), 'utf8');
  const g = JSON.parse(file);
  const bin = readFileSync(join(dir, g.buffers[0].uri));
  const acc = (i: number) => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as string]!;
    const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride ?? 0;
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType as number]!;
    const bytes = T.BYTES_PER_ELEMENT;
    const out = new Float64Array(a.count * n);
    for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) {
      const at = off + (stride ? e * stride : e * n * bytes) + c * bytes;
      out[e * n + c] = a.componentType === 5126 ? bin.readFloatLE(at) : a.componentType === 5125 ? bin.readUInt32LE(at) : a.componentType === 5123 ? bin.readUInt16LE(at) : bin[at];
    }
    return { data: out, count: a.count, n };
  };

  // every mesh-carrying node, its world transform baked in
  type Prim = { part: string; material: number; pos: Float32Array; nor: Float32Array; uv: Float32Array; idx: Uint32Array };
  const prims: Prim[] = [];
  const walk = (ni: number, parent: Mat4) => {
    const n = g.nodes[ni], m = mul(parent, trs(n));
    if (n.mesh !== undefined) {
      const part = String(n.name ?? `part${ni}`).replace(/_LOD\d+$/, '');
      if (!opts.parts || opts.parts(part)) for (const p of g.meshes[n.mesh].primitives) {
        const P = acc(p.attributes.POSITION), N = acc(p.attributes.NORMAL), U = acc(p.attributes.TEXCOORD_0), X = acc(p.indices);
        const pos = new Float32Array(P.count * 3), nor = new Float32Array(P.count * 3), uv = new Float32Array(P.count * 2);
        for (let v = 0; v < P.count; v++) {
          const x = P.data[v * 3], y = P.data[v * 3 + 1], z = P.data[v * 3 + 2];
          pos[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
          const a = N.data[v * 3], b = N.data[v * 3 + 1], c = N.data[v * 3 + 2];
          let nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c;
          const l = Math.hypot(nx, ny, nz) || 1; nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
          uv[v * 2] = U.data[v * 2]; uv[v * 2 + 1] = U.data[v * 2 + 1];
        }
        prims.push({ part, material: p.material ?? 0, pos, nor, uv, idx: Uint32Array.from(X.data) });
      }
    }
    for (const c of n.children ?? []) walk(c, m);
  };
  for (const r of g.scenes[g.scene ?? 0].nodes) walk(r, I4);

  // cut to the budget, shared across the model by each primitive's share of it
  const total = prims.reduce((s, p) => s + p.idx.length / 3, 0);
  const pk = new Packer(), parts: Record<string, { subs: { material: number; key: string; vertices: number; triangles: number }[]; min: number[]; max: number[] }> = {};
  let kept = 0;
  prims.forEach((p, i) => {
    let idx = p.idx;
    const want = Math.max(24, Math.floor(opts.budget * (p.idx.length / 3) / total));
    if (p.idx.length / 3 > want) {
      const [out] = MeshoptSimplifier.simplify(p.idx, p.pos, 3, want * 3, opts.errors ?? 0.02, ['LockBorder']);
      idx = out;
      // a dense scan whose topology stops the careful cut: cluster it instead
      // (its normal map carries the detail the triangles lose)
      if (idx.length / 3 > want * 1.5) { const c = cluster(p, want); p.pos = c.pos; p.nor = c.nor; p.uv = c.uv; idx = c.idx; }
    }
    // keep only the vertices the cut mesh still uses
    const remap = new Int32Array(p.pos.length / 3).fill(-1); let nv = 0;
    for (const v of idx) if (remap[v] < 0) remap[v] = nv++;
    const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3), uv = new Float32Array(nv * 2), ix = nv < 65536 ? new Uint16Array(idx.length) : new Uint32Array(idx.length);
    for (let v = 0; v < remap.length; v++) {
      const r = remap[v]; if (r < 0) continue;
      pos.set(p.pos.subarray(v * 3, v * 3 + 3), r * 3); uv.set(p.uv.subarray(v * 2, v * 2 + 2), r * 2);
      for (let c = 0; c < 3; c++) nor[r * 3 + c] = Math.round(p.nor[v * 3 + c] * 127);
    }
    for (let k = 0; k < idx.length; k++) ix[k] = remap[idx[k]];
    const key = `p${i}`;
    pk.add(`${key}:pos`, pos, 3); pk.add(`${key}:nor`, nor, 3); pk.add(`${key}:uv`, uv, 2); pk.add(`${key}:idx`, ix, 1);
    const P = (parts[p.part] ??= { subs: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    P.subs.push({ material: p.material, key, vertices: nv, triangles: idx.length / 3 });
    for (let v = 0; v < nv; v++) for (let c = 0; c < 3; c++) { P.min[c] = Math.min(P.min[c], pos[v * 3 + c]); P.max[c] = Math.max(P.max[c], pos[v * 3 + c]); }
    kept += idx.length / 3;
  });
  mkdirSync(outDir, { recursive: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(outDir, 'model.bin.z'), deflateSync(pk.buffer(), { level: 9 }));

  // materials: the scanned maps, copied once each under a short name
  const copied = new Map<string, string>();
  const tex = (ti?: { index: number }) => {
    if (!ti) return null;
    const uri = g.images[g.textures[ti.index].source].uri as string;
    if (!copied.has(uri)) {
      const name = uri.split('/').pop()!.replace(/_1k\.jpg$/, '.jpg');
      copyFileSync(join(dir, uri), join(outDir, name)); copied.set(uri, name);
    }
    return copied.get(uri)!;
  };
  // a cut-out plant's mask ships beside its textures (Poly Haven's glTF colour is a JPEG)
  const slug = srcDir.replace(/^ph-model-/, '');
  const alphaFile = ['png', 'jpg'].map((x) => `textures/${slug}_alpha_1k.${x}`).find((f) => { try { readFileSync(join(dir, f)); return true; } catch { return false; } });
  const alphaName = alphaFile ? (copyFileSync(join(dir, alphaFile), join(outDir, 'alpha' + alphaFile.slice(-4))), 'alpha' + alphaFile.slice(-4)) : null;
  const materials = (g.materials ?? [{}]).map((m: any) => ({
    alphaMap: m.alphaMode && m.alphaMode !== 'OPAQUE' ? alphaName : null,
    name: m.name, map: tex(m.pbrMetallicRoughness?.baseColorTexture), normalMap: tex(m.normalTexture), armMap: tex(m.pbrMetallicRoughness?.metallicRoughnessTexture),
    color: m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1], roughness: m.pbrMetallicRoughness?.roughnessFactor ?? 1, metalness: m.pbrMetallicRoughness?.metallicFactor ?? 1,
    alpha: m.alphaMode === 'MASK' ? { test: m.alphaCutoff ?? 0.5 } : m.alphaMode === 'BLEND' ? { blend: true } : null, doubleSided: !!m.doubleSided,
    emissive: m.emissiveFactor ?? null,
  }));
  void dirname;
  return { layout: pk.layout, parts, materials, triangles: { source: total, kept }, file: 'model.bin.z' };
}
