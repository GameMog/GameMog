/**
 * The WHY. V-07 for the library (`model-why-v07`): the owner's own single-seater race car, given to everyone under
 * CC0-1.0 by the owner (14 Oct 2026, docs/RULES.md §1f). CC0 gives away the model, not the trademark: the WHY. name and
 * wordmark painted on it stay the owner's. Built from the car why.com/A1 serves (a meshoptimizer-compressed GLB and its
 * textures, pinned by SHA-256 in assets-src/sources.json as `why-v07`).
 *
 * What the build does, in order:
 * - decodes the GLB (meshopt + quantised attributes) and keeps positions, normals, the first uv set and the baked ambient
 *   occlusion (the vertex colour's green; its red, the studio's light visibility, is dropped); no name, scene or extra of
 *   the source survives;
 * - restores each tyre's contact patch: the source clamps the tyre's lowest vertices flat on the ground (a 141 mm flat),
 *   which would turn with the wheel; each is put back on its profile ring (the tyre is a 192 x 156 lathe grid);
 * - cuts out the steering wheel (the carbon frame, its display and its two grips, the components that lie wholly inside
 *   its box), so it can turn about its column;
 * - turns the car to GameMog's frame: +Z forward, +Y up, +X to the car's left, metres, the origin at the wheelbase
 *   midpoint on the ground (where the source has it);
 * - splits it into moving parts, each with its pivot: `body` (everything that does not move, the rear brake ducts and the
 *   suspension included), `wheel-fl/fr/rl/rr` (tyre, rim, cover, hub, nut: they spin about the axle), `steer-fl/fr` (the
 *   front brake drums and scoops: they steer with the wheel but do not spin) and `steering-wheel`;
 * - merges each part's meshes by material: `paint` (the tub, the sidepods and the plain painted parts, through one
 *   recolourable livery mask), `carbon`, `tyre-front`, `tyre-rear`, `trim` (every plain-coloured material, chosen per
 *   vertex from a palette by a `slot` attribute) and `led` (the lamps);
 * - cuts levels of detail with meshoptimizer's attribute-aware simplifier (normals and, on paint, uvs weighted), the tyres
 *   resampled on their own lathe grid instead, so they stay round when they spin; and two proxies for distant cars, one
 *   draw each, coloured per vertex by the same palette;
 * - unmixes the owner's baked livery, in linear light, into the mask (R upper colour, G coachline, B letters, A race
 *   number; the gold full stop is G and B together), and sizes the tyre and carbon maps for a game.
 *
 * Output: model.bin.z (every level's arrays, deflated), the textures, and asset.json (the format is the library's
 * 'model' kind, so `ctx.assets.model` reads its top level, plus `lods` and `car`; see the asset's own notes).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { CACHE, Packer, decodeImage, encodePng } from './lib.ts';

type V3 = [number, number, number];
type Prim = { node: string; mat: string; pos: Float64Array; nor: Float64Array; uv: Float64Array; ao: Float64Array; idx: Uint32Array };
type Group = 'paint' | 'carbon' | 'tyre-front' | 'tyre-rear' | 'trim' | 'led';
type Piece = { part: string; group: Group; src: string; uvMap: 'tub' | 'pod' | 'top' | 'carbon' | 'tyre' | 'none'; slot: number; lathe: boolean; pos: Float32Array; nor: Float32Array; uv: Float32Array; ao: Float32Array; idx: Uint32Array };

/* ------------------------------------------------------------------ GLB -- */
async function decodeGlb(path: string): Promise<Prim[]> {
  await MeshoptDecoder.ready;
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  const jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bl = b.readUInt32LE(20 + jl), bin = b.subarray(28 + jl, 28 + jl + bl);
  const views = (J.bufferViews as any[]).map((v) => {
    const ext = v.extensions?.EXT_meshopt_compression;
    if (!ext) return null;
    const src = bin.subarray(ext.byteOffset || 0, (ext.byteOffset || 0) + ext.byteLength), out = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter || 'NONE');
    return { data: out, stride: ext.byteStride as number };
  });
  const W: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, SIZE: Record<number, number> = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
  const acc = (i: number) => {
    const a = J.accessors[i], n = W[a.type], size = SIZE[a.componentType], v = views[a.bufferView];
    let data: Uint8Array, stride: number;
    if (v) { data = v.data; stride = v.stride; } else { const bv = J.bufferViews[a.bufferView]; data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); stride = bv.byteStride || 0; }
    stride = stride || size * n;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength), off = a.byteOffset || 0, out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      const o = off + k * stride + c * size;
      let x = 0;
      switch (a.componentType) {
        case 5126: x = dv.getFloat32(o, true); break;
        case 5125: x = dv.getUint32(o, true); break;
        case 5123: x = dv.getUint16(o, true); if (a.normalized) x /= 65535; break;
        case 5122: x = dv.getInt16(o, true); if (a.normalized) x = Math.max(x / 32767, -1); break;
        case 5121: x = dv.getUint8(o); if (a.normalized) x /= 255; break;
        case 5120: x = dv.getInt8(o); if (a.normalized) x = Math.max(x / 127, -1); break;
      }
      out[k * n + c] = x;
    }
    return out;
  };
  // gltfpack hangs each quantised mesh under the named node of its part ('wheel_front_L:tyre', 'body:paintTub'): the
  // name is read only to sort the meshes into parts here, and goes no further
  const parent = new Array(J.nodes.length).fill(-1);
  (J.nodes as any[]).forEach((n, i) => (n.children || []).forEach((c: number) => (parent[c] = i)));
  const named = (i: number) => { let k = i; while (k >= 0 && !J.nodes[k].name) k = parent[k]; return k >= 0 ? String(J.nodes[k].name) : ''; };
  const prims: Prim[] = [];
  (J.nodes as any[]).forEach((n, i) => {
    if (n.mesh === undefined) return;
    if (n.rotation || n.matrix) throw new Error('v07: a rotated mesh node is not expected');
    for (let k = parent[i]; k >= 0; k = parent[k]) { const p = J.nodes[k]; if (p.translation || p.rotation || p.scale || p.matrix) throw new Error('v07: a transformed parent node is not expected'); }
    const s = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0];
    for (const p of J.meshes[n.mesh].primitives) {
      const pos = acc(p.attributes.POSITION);
      for (let v = 0; v < pos.length; v += 3) for (let c = 0; c < 3; c++) pos[v + c] = pos[v + c] * s[c] + t[c];
      const col = acc(p.attributes.COLOR_0), nv = pos.length / 3, ao = new Float64Array(nv);
      for (let v = 0; v < nv; v++) ao[v] = col[v * 4 + 1];
      prims.push({ node: named(i), mat: String(J.materials[p.material].name), pos, nor: acc(p.attributes.NORMAL), uv: acc(p.attributes.TEXCOORD_0), ao, idx: Uint32Array.from(acc(p.indices)) });
    }
  });
  return prims;
}

function bbox(pos: ArrayLike<number>) {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < pos.length; v += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], pos[v + c]); hi[c] = Math.max(hi[c], pos[v + c]); }
  return { lo, hi, mid: [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2) as V3 };
}

/* ------------------------------------------------- the tyres' contact patch -- */
// GLB frame: the axle runs along z. Each tyre is a lathe grid: a profile row is one uv v, its vertices one ring; a
// column is one uv u. The source pressed the vertices below its ground (y 0.5 mm) flat; each goes back to its ring's
// radius at its own column's angle, and takes the ring's normal turned to that angle.
function restoreTyre(t: Prim, cx: number, cy: number) {
  const nv = t.pos.length / 3;
  let minY = Infinity; for (let v = 0; v < nv; v++) minY = Math.min(minY, t.pos[v * 3 + 1]);
  const flat = (v: number) => t.pos[v * 3 + 1] <= minY + 1e-6;
  let fx0 = Infinity, fx1 = -Infinity, flats = 0;
  for (let v = 0; v < nv; v++) if (flat(v)) { flats++; fx0 = Math.min(fx0, t.pos[v * 3]); fx1 = Math.max(fx1, t.pos[v * 3]); }
  const rows = new Map<number, number[]>();
  for (let v = 0; v < nv; v++) { const k = Math.round(t.uv[v * 2 + 1] * 1e5); let r = rows.get(k); if (!r) rows.set(k, (r = [])); r.push(v); }
  const ang = (v: number) => Math.atan2(t.pos[v * 3 + 1] - cy, t.pos[v * 3] - cx);
  // which way u runs round the axle (the same for every row)
  let dir = 0;
  for (const vs of rows.values()) {
    const ok = vs.filter((v) => !flat(v)).sort((a, b) => t.uv[a * 2] - t.uv[b * 2]);
    for (let i = 1; i < ok.length && !dir; i++) { const du = t.uv[ok[i] * 2] - t.uv[ok[i - 1] * 2]; if (du > 1e-4 && du < 0.05) { let d = ang(ok[i]) - ang(ok[i - 1]); d = Math.atan2(Math.sin(d), Math.cos(d)); dir = Math.sign(d); } }
    if (dir) break;
  }
  let moved = 0, worstFit = 0;
  for (const vs of rows.values()) {
    const ok = vs.filter((v) => !flat(v));
    const radii = ok.map((v) => Math.hypot(t.pos[v * 3] - cx, t.pos[v * 3 + 1] - cy)).sort((a, b) => a - b), r = radii[radii.length >> 1];
    // the ring's phase: angle = phase + dir * 2 pi u, from its untouched vertices (a circular mean)
    let sx = 0, sy = 0;
    for (const v of ok) { const p = ang(v) - dir * 2 * Math.PI * t.uv[v * 2]; sx += Math.cos(p); sy += Math.sin(p); }
    const phase = Math.atan2(sy, sx);
    for (const v of ok) { const p = ang(v) - dir * 2 * Math.PI * t.uv[v * 2] - phase; worstFit = Math.max(worstFit, Math.abs(Math.atan2(Math.sin(p), Math.cos(p))) * r); }
    const ref = ok[0], refA = ang(ref);
    for (const v of vs) {
      if (!flat(v)) continue;
      const a = phase + dir * 2 * Math.PI * t.uv[v * 2];
      t.pos[v * 3] = cx + r * Math.cos(a); t.pos[v * 3 + 1] = cy + r * Math.sin(a);
      const d = a - refA, c = Math.cos(d), s = Math.sin(d), nx = t.nor[ref * 3], ny = t.nor[ref * 3 + 1];
      t.nor[v * 3] = nx * c - ny * s; t.nor[v * 3 + 1] = nx * s + ny * c; t.nor[v * 3 + 2] = t.nor[ref * 3 + 2];
      moved++;
    }
  }
  // every ring round again: the largest spread of radius within a ring, after
  let spread = 0;
  for (const vs of rows.values()) { const rs = vs.map((v) => Math.hypot(t.pos[v * 3] - cx, t.pos[v * 3 + 1] - cy)); spread = Math.max(spread, Math.max(...rs) - Math.min(...rs)); }
  let low = Infinity; for (let v = 0; v < nv; v++) low = Math.min(low, t.pos[v * 3 + 1]);
  return { flats, moved, flatLength: fx1 - fx0, ringSpread: spread, phaseFit: worstFit, lowest: low };
}

/* ---------------------------------------------------- the steering wheel -- */
// Its box, in the GLB frame: centred on (0.98, 0.61, 0) and tilted back 22 degrees about the lateral axis (the owner's
// modeler's own figures: a 300 x 176 mm frame, grips reaching 188 mm out, 40 mm deep). Only components that lie wholly
// inside it are the wheel; the column (titanium) and the cockpit lining it touches stay with the body.
const SW_CENTRE = [0.98, 0.61, 0], SW_TILT = (22 * Math.PI) / 180;
function inWheelBox(x: number, y: number, z: number) {
  const ds = -(x - SW_CENTRE[0]), dz = y - SW_CENTRE[1], c = Math.cos(SW_TILT), s = Math.sin(SW_TILT);
  const a = ds * c - dz * s, h = ds * s + dz * c;
  return a > -0.043 && a < 0.038 && Math.abs(z) < 0.203 && Math.abs(h) < 0.103;
}
function splitWheel(p: Prim): { inside: Uint32Array; rest: Uint32Array } {
  const nv = p.pos.length / 3, up = new Int32Array(nv).map((_, i) => i);
  const find = (i: number): number => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  const key = new Map<string, number>();
  for (let v = 0; v < nv; v++) { const k = `${p.pos[v * 3].toFixed(5)},${p.pos[v * 3 + 1].toFixed(5)},${p.pos[v * 3 + 2].toFixed(5)}`; const o = key.get(k); if (o === undefined) key.set(k, v); else up[find(v)] = find(o); }
  for (let t = 0; t < p.idx.length; t += 3) { const r = find(p.idx[t]); up[find(p.idx[t + 1])] = r; up[find(p.idx[t + 2])] = r; }
  const out = new Set<number>();
  for (let v = 0; v < nv; v++) if (!inWheelBox(p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2])) out.add(find(v));
  const inside: number[] = [], rest: number[] = [];
  for (let t = 0; t < p.idx.length; t += 3) (out.has(find(p.idx[t])) ? rest : inside).push(p.idx[t], p.idx[t + 1], p.idx[t + 2]);
  return { inside: Uint32Array.from(inside), rest: Uint32Array.from(rest) };
}

/* -------------------------------------------------------------- symmetric 3x3 eigen -- */
function smallestAxis(pts: V3[]): V3 {
  const m = [0, 0, 0]; for (const p of pts) for (let c = 0; c < 3; c++) m[c] += p[c] / pts.length;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += (p[i] - m[i]) * (p[j] - m[j]);
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(A[p][q]) < 1e-18) continue;
    const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
    for (let k = 0; k < 3; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
    for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
  }
  let k = 0; for (let i = 1; i < 3; i++) if (A[i][i] < A[k][k]) k = i;
  return [V[0][k], V[1][k], V[2][k]];
}

/* ------------------------------------------------------------- the livery mask -- */
// The owner's bake mixes its five paints in linear light (2 x 2 samples a texel, the letters drawn over with their own
// coverage), so each texel is unmixed in linear light into weights of those paints. Palette: the bake's own values.
const LIN8 = Float64Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const hexLin = (h: string): V3 => [1, 3, 5].map((i) => LIN8[parseInt(h.slice(i, i + 2), 16)]) as V3;
const PAINT = { upper: [0.83, 0.82, 0.79] as V3, lower: [0.012, 0.012, 0.013] as V3, coach: [0.72, 0.12, 0.035] as V3, ink: hexLin('#080806'), gold: hexLin('#a08c5a') };
type Paint = keyof typeof PAINT;
// where the letters and the number are, in texels of the 4096 x 2048 tub livery, with 12 texels of margin: the two
// wordmarks with their gold stops are every texel that is no blend of the three body paints (x 2616-3064, y 655-898 and
// x 2615-3063, y 1138-1399, measured 15 Oct), the number the coachline-coloured 7 on the nose (x 258-398, y 866-1180).
// Only in a wordmark box may a texel hold ink or gold; the coachline colour in the number's box is the race number.
const WORDMARK_BOXES = [[2604, 643, 3076, 910], [2603, 1126, 3075, 1411]], NUMBER_BOX = [246, 854, 410, 1192];
const inBox = (b: number[], x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

/** Least-squares weights of a few paints for one colour, on the simplex (each >= 0, summing to 1). */
function unmix(c: V3, set: Paint[]): { w: number[]; err: number } {
  const P = set.map((k) => PAINT[k]);
  const res = (w: number[]) => { let e = 0; for (let ch = 0; ch < 3; ch++) { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * P[i][ch]; e += (s - c[ch]) ** 2; } return e; };
  let best: { w: number[]; err: number } = { w: set.map((_, i) => (i === 0 ? 1 : 0)), err: Infinity };
  const take = (w: number[]) => { const e = res(w); if (e < best.err) best = { w, err: e }; };
  // corners and edges
  for (let i = 0; i < P.length; i++) { const w = set.map((_, k) => (k === i ? 1 : 0)); take(w); }
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const d = [0, 1, 2].map((ch) => P[i][ch] - P[j][ch]), q = [0, 1, 2].map((ch) => c[ch] - P[j][ch]);
    const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; if (dd < 1e-12) continue;
    const t = Math.min(1, Math.max(0, (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / dd));
    take(set.map((_, k) => (k === i ? t : k === j ? 1 - t : 0)));
  }
  // the inside of a triangle of three paints
  if (P.length >= 3) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    // c - Pk = a (Pi - Pk) + b (Pj - Pk): normal equations
    const u = [0, 1, 2].map((ch) => P[i][ch] - P[k][ch]), v = [0, 1, 2].map((ch) => P[j][ch] - P[k][ch]), q = [0, 1, 2].map((ch) => c[ch] - P[k][ch]);
    const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    const uq = u[0] * q[0] + u[1] * q[1] + u[2] * q[2], vq = v[0] * q[0] + v[1] * q[1] + v[2] * q[2], det = uu * vv - uv * uv;
    if (Math.abs(det) < 1e-14) continue;
    const a = (uq * vv - vq * uv) / det, b = (vq * uu - uq * uv) / det;
    if (a >= 0 && b >= 0 && a + b <= 1) take(set.map((_, m) => (m === i ? a : m === j ? b : m === k ? 1 - a - b : 0)));
  }
  return best;
}

/** The mask of one livery texture, at its own size: RGBA weights as floats (R upper, G coach + gold, B ink + gold, A number). */
function liveryWeights(file: string, tub: boolean) {
  const img = decodeImage(file), { w: W, h: H } = img, out = new Float32Array(W * H * 4);
  const memo = new Map<number, Float32Array>();
  let worst = 0, over1 = 0, inkOutside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
    const zone = tub && WORDMARK_BOXES.some((bx) => inBox(bx, x, y)) ? 1 : tub && inBox(NUMBER_BOX, x, y) ? 2 : 0;
    const key = ((zone * 256 + r) * 256 + g) * 256 + b;
    let m = memo.get(key);
    if (!m) {
      const set: Paint[] = zone === 1 ? ['upper', 'ink', 'gold'] : zone === 2 ? ['upper', 'coach'] : ['upper', 'lower', 'coach'];
      const u = unmix([LIN8[r], LIN8[g], LIN8[b]], set), wt: Record<string, number> = {};
      set.forEach((k, i) => (wt[k] = u.w[i]));
      // the error in 8-bit sRGB of the colour the weights rebuild
      let e = 0;
      for (let ch = 0; ch < 3; ch++) { let s = 0; set.forEach((k, i) => (s += u.w[i] * PAINT[k][ch])); const enc = s <= 0.0031308 ? s * 12.92 : 1.055 * Math.pow(s, 1 / 2.4) - 0.055; e = Math.max(e, Math.abs(enc * 255 - [r, g, b][ch])); }
      m = Float32Array.of(wt.upper ?? 0, zone === 2 ? 0 : (wt.coach ?? 0) + (wt.gold ?? 0), (wt.ink ?? 0) + (wt.gold ?? 0), zone === 2 ? wt.coach ?? 0 : 0, e);
      memo.set(key, m);
    }
    out.set(m.subarray(0, 4), o);
    worst = Math.max(worst, m[4]); if (m[4] > 1.5) over1++;
    if (zone !== 1 && r < 0x14 && g < 0x14 && b < 0x14) inkOutside++;
  }
  return { W, H, w: out, worst, over1, inkOutside };
}

/** Area-resample a float RGBA image into a w x h block (box filter with fractional coverage). */
function resample(src: Float32Array, W: number, H: number, w: number, h: number) {
  const out = new Float32Array(w * h * 4), sx = W / w, sy = H / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy, y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx, x1 = x0 + sx, acc = [0, 0, 0, 0]; let a = 0;
      for (let j = Math.floor(y0); j < Math.ceil(y1); j++) {
        const wy = Math.min(y1, j + 1) - Math.max(y0, j);
        for (let i = Math.floor(x0); i < Math.ceil(x1); i++) {
          const wx = Math.min(x1, i + 1) - Math.max(x0, i), k = wx * wy, o = (j * W + i) * 4;
          for (let c = 0; c < 4; c++) acc[c] += src[o + c] * k; a += k;
        }
      }
      for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = acc[c] / a;
    }
  }
  return out;
}

// The atlas: the tub's mask on top (2048 x 1024), the sidepods' below it (1024 x 496), and a solid upper-colour block for
// the plain painted parts (engine-cover top, halo, nose top), with 16-texel gutters of repeated edge texels between them
export const ATLAS = { w: 2048, h: 1536, tub: [0, 0, 2048, 1024], pod: [0, 1040, 1024, 496], top: [1040, 1040, 1008, 496] } as const;
function atlasUv(map: 'tub' | 'pod' | 'top', u: number, v: number): [number, number] {
  if (map === 'top') return [(ATLAS.top[0] + ATLAS.top[2] / 2) / ATLAS.w, (ATLAS.top[1] + ATLAS.top[3] / 2) / ATLAS.h];
  const [x, y, w, h] = map === 'tub' ? ATLAS.tub : ATLAS.pod;
  // the source's uvs are for an image uploaded flipped (row 0 at v = 1); the library's are not (row 0 at v = 0)
  return [(x + u * w) / ATLAS.w, (y + (1 - v) * h) / ATLAS.h];
}

/* ------------------------------------------------------------------- textures -- */
function sips(args: string[]) { execFileSync('sips', args, { stdio: 'ignore' }); }
function decodeAbs(path: string) {
  const tmp = join(tmpdir(), `gm-v07-${process.pid}-${Math.random().toString(36).slice(2)}.bmp`);
  sips(['-s', 'format', 'bmp', path, '--out', tmp]);
  const b = readFileSync(tmp); rmSync(tmp);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), hRaw = b.readInt32LE(22), bpp = b.readUInt16LE(28), h = Math.abs(hRaw);
  const stride = Math.ceil((w * bpp) / 32) * 4, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { const row = hRaw > 0 ? h - 1 - y : y; for (let x = 0; x < w; x++) { const p = off + row * stride + x * (bpp / 8), q = (y * w + x) * 4; data[q] = b[p + 2]; data[q + 1] = b[p + 1]; data[q + 2] = b[p]; data[q + 3] = bpp === 32 ? b[p + 3] : 255; } }
  return { w, h, data };
}
/** A cached map at a game size as JPEG; 'normal' turns its green over (the library's uvs run the other way in v); 'arm'
 * is the source's roughness map, which already packs occlusion 1 (R), roughness (G) and metalness 0 (B) the way the
 * library's armMap reads them (measured: R 255 and B 0 at every texel): R and B are set again after the resize. */
function map(src: string, out: string, w: number, h: number, kind: 'color' | 'normal' | 'arm', quality: number) {
  const tmp = join(tmpdir(), `gm-v07-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    sips(['-s', 'format', 'png', '-z', String(h), String(w), join(CACHE, src), '--out', tmp + '.png']);
    if (kind !== 'color') {
      const img = decodeAbs(tmp + '.png'), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (kind === 'normal') d[i + 1] = 255 - d[i + 1];
        else { d[i] = 255; d[i + 2] = 0; }
        d[i + 3] = 255;
      }
      writeFileSync(tmp + '.png', encodePng(img.w, img.h, d));
    }
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), tmp + '.png', '--out', out]);
  } finally { rmSync(tmp + '.png', { force: true }); }
}

/* --------------------------------------------------------------- the lathe grid -- */
type Lathe = { rows: number[]; cols: number[]; at: Int32Array; nr: number; nc: number };
function latheGrid(p: { uv: Float32Array; pos: Float32Array; idx: Uint32Array }): Lathe | null {
  const nv = p.uv.length / 2, rs = new Set<number>(), cs = new Set<number>();
  for (let v = 0; v < nv; v++) { rs.add(Math.round(p.uv[v * 2 + 1] * 1e5)); cs.add(Math.round(p.uv[v * 2] * 1e5)); }
  const rows = [...rs].sort((a, b) => a - b), cols = [...cs].sort((a, b) => a - b), nr = rows.length, nc = cols.length;
  const ri = new Map(rows.map((r, i) => [r, i])), ci = new Map(cols.map((c, i) => [c, i])), at = new Int32Array(nr * nc).fill(-1);
  for (let v = 0; v < nv; v++) { const k = ri.get(Math.round(p.uv[v * 2 + 1] * 1e5))! * nc + ci.get(Math.round(p.uv[v * 2] * 1e5))!; if (at[k] >= 0) return null; at[k] = v; }
  if (at.some((x) => x < 0) || p.idx.length !== (nr - 1) * (nc - 1) * 6) return null;
  return { rows, cols, at, nr, nc };
}
/** The tyre at an error: every k-th column (the largest k whose chord stays within half the error) and the profile's rows
 * thinned by Douglas-Peucker to half the error; quads wound to face the way the vertex normals do. */
function latheCut(p: Piece, L: Lathe, err: number, centre: V3) {
  const R = (v: number) => Math.hypot(p.pos[v * 3 + 1] - centre[1], p.pos[v * 3 + 2] - centre[2]);
  const n = L.nc - 1, rMax = Math.max(...Array.from({ length: L.nr }, (_, i) => R(L.at[i * L.nc])));
  let k = 1; for (const d of [96, 64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1]) if (n % d === 0 && rMax * (1 - Math.cos((Math.PI * d) / n)) <= err / 2) { k = d; break; }
  // the profile: radius and the axle-wise offset of each row (the first column stands for its ring)
  const prof = Array.from({ length: L.nr }, (_, i) => { const v = L.at[i * L.nc]; return [R(v), p.pos[v * 3]]; });
  const keep = new Array(L.nr).fill(false); keep[0] = keep[L.nr - 1] = true;
  const dp = (a: number, b: number) => {
    let far = -1, fd = 0; const [ax, ay] = prof[a], [bx, by] = prof[b], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((prof[i][0] - ax) * dy - (prof[i][1] - ay) * dx) / l; if (d > fd) { fd = d; far = i; } }
    if (far > 0 && fd > err / 2) { keep[far] = true; dp(a, far); dp(far, b); }
  };
  dp(0, L.nr - 1);
  const rows = keep.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), cols: number[] = [];
  for (let j = 0; j <= n; j += k) cols.push(j);
  const idx: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    const P = (v: number) => [p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]];
    const A = P(a), B = P(b), C = P(c), u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    let s = 0; for (const v of [a, b, c]) for (let q = 0; q < 3; q++) s += f[q] * p.nor[v * 3 + q];
    if (s >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < cols.length; j++) {
    const a = L.at[rows[i] * L.nc + cols[j]], b = L.at[rows[i] * L.nc + cols[j + 1]], c = L.at[rows[i + 1] * L.nc + cols[j + 1]], d = L.at[rows[i + 1] * L.nc + cols[j]];
    tri(a, b, c); tri(a, c, d);
  }
  return { idx: Uint32Array.from(idx), columns: cols.length - 1, rows: rows.length, rowsKept: rows, colsKept: cols };
}

/* ---------------------------------------------------------------- the palette -- */
// The plain-coloured materials, as the owner's viewer paints them (sRGB, roughness, metalness), plus what the proxies use
// for the textured ones. `livery` marks a colour a car's scheme sets: 'nut' (the owner's car: its own darker vermilion; a
// rival's: its coachline), 'tcam' (the T-camera: the driver's own colour), 'upper'/'lower'/'coach' (the proxies' paint).
export const PALETTE = [
  { name: 'black', color: '#040404', roughness: 0.92, metalness: 0 },
  { name: 'cockpit', color: '#2a2b2e', roughness: 0.92, metalness: 0, sheen: 0.8 },
  { name: 'mirror', color: '#e6e8ea', roughness: 0.015, metalness: 1 },
  { name: 'glass', color: '#08090a', roughness: 0.04, metalness: 0, clearcoat: 1, emissive: '#18323a', emissiveIntensity: 0.25 },
  { name: 'titanium', color: '#8e8984', roughness: 0.3, metalness: 1 },
  { name: 'steel', color: '#a4a5a8', roughness: 0.22, metalness: 1 },
  { name: 'boot', color: '#141414', roughness: 0.55, metalness: 0 },
  { name: 'exhaust', color: '#a88d6a', roughness: 0.34, metalness: 1 },
  { name: 'rim', color: '#303134', roughness: 0.36, metalness: 1 },
  { name: 'machined', color: '#d7d8da', roughness: 0.16, metalness: 1 },
  { name: 'nut', color: '#b0301b', roughness: 0.26, metalness: 1, livery: 'nut' },
  { name: 'accent', color: '#d9481f', roughness: 0.3, metalness: 0, clearcoat: 1, livery: 'tcam' },
  // the proxies only
  { name: 'upper', color: '#ebeae6', roughness: 0.28, metalness: 0, clearcoat: 1, livery: 'upper' },
  { name: 'lower', color: '#1d1d1e', roughness: 0.28, metalness: 0, clearcoat: 1, livery: 'lower' },
  { name: 'coach', color: '#dd6135', roughness: 0.28, metalness: 0, clearcoat: 1, livery: 'coach' },
  { name: 'carbon', color: '#1b1b1c', roughness: 0.45, metalness: 0, clearcoat: 0.55 },
  { name: 'tyre', color: '#1c1c1c', roughness: 0.85, metalness: 0 },
  { name: 'led', color: '#200202', roughness: 0.25, metalness: 0, emissive: '#ff2412', emissiveIntensity: 3 },
];
const SLOT = Object.fromEntries(PALETTE.map((p, i) => [p.name, i])) as Record<string, number>;

/* --------------------------------------------------------------------- the build -- */
// meshoptimizer's attribute-aware cut throughout (car.md, 14 Oct: a position-only cut crumples the front wing's shading).
// far: car.md's position-only 16 mm cut (11.6k) crumples the wing and the wheel covers in Chrome, and with lod0's weights
// a 16 mm cut keeps 20.8k (the suspension's 72 small steel joints alone hold 2.4k), so far takes a 20 mm cut with lighter
// weights that also drops every separate piece smaller than the error (meshoptimizer's Prune: the joints, small bolts)
export const LODS: { name: string; error: number; weights?: number[]; prune?: boolean; use: string }[] = [
  { name: 'lod0', error: 0.002, use: 'the player\'s car and the cockpit camera; a desktop hero' },
  { name: 'lod1', error: 0.004, use: 'near cars; a phone\'s hero' },
  { name: 'mid', error: 0.008, use: 'cars at middle distance' },
  { name: 'far', error: 0.02, weights: [0.15, 0.3], prune: true, use: 'distant cars' },
];
// what each proxy keeps besides the wheels: the far one only the shapes that make the silhouette (tub, sidepods, engine
// cover, halo, floor, wings, the painted bits); the middle one also the suspension, the brake ducts, the mirrors and lamps
const SILHOUETTE = (p: Piece) => !p.part.startsWith('wheel-') && p.part !== 'steering-wheel' && !p.part.startsWith('steer-') && !p.src.startsWith('suspension:')
  && !['body:cockpit', 'body:titanium', 'body:mirror', 'body:led', 'rearWing:led', 'rearWing:titanium', 'rearWing:exhaust', 'wheel_rear_L:carbon', 'wheel_rear_R:carbon', 'wheel_rear_L:black', 'wheel_rear_R:black'].includes(p.src);
const PROXIES = [
  { name: 'proxy-mid', budget: 5000, lathe: 0.014, keep: (p: Piece) => !p.part.startsWith('wheel-') && p.part !== 'steering-wheel' && !['body:cockpit', 'body:titanium', 'rearWing:titanium', 'rearWing:exhaust'].includes(p.src), use: 'cars further out than mid: one draw, no moving parts' },
  { name: 'proxy-far', budget: 1500, lathe: 0.056, keep: SILHOUETTE, use: 'the furthest cars: one draw, no moving parts' },
];
const GROUP_MATERIAL: Record<Group, number> = { paint: 0, carbon: 1, 'tyre-front': 2, 'tyre-rear': 3, trim: 4, led: 5 };
const CARBON_TILE = 0.016; // metres of the carbon texture's one tile (the owner's viewer)

export async function buildRaceCar(srcDir: string, outDir: string) {
  await MeshoptSimplifier.ready;
  MeshoptSimplifier.useExperimentalFeatures = true;
  const log: string[] = [];
  const prims = await decodeGlb(join(CACHE, srcDir, 'v07.glb'));
  const sourceTriangles = prims.reduce((s, p) => s + p.idx.length / 3, 0);

  // the axles: along and up, the middle of the parts that are round about them (rim, cover, hub, nut); across, the
  // middle of the tyre (the steering pivot stands in its plane)
  const axle: Record<string, V3> = {};
  for (const c of ['front_L', 'front_R', 'rear_L', 'rear_R']) {
    const ps = prims.filter((p) => p.node.startsWith(`wheel_${c}:`) && ['rim', 'wheelCover', 'machined', 'nut'].includes(p.mat));
    const all = new Float64Array(ps.reduce((s, p) => s + p.pos.length, 0)); let o = 0; for (const p of ps) { all.set(p.pos, o); o += p.pos.length; }
    const b = bbox(all), tyre = prims.find((p) => p.node === `wheel_${c}:tyre`);
    if (!tyre || ps.length !== 4) throw new Error(`v07: wheel ${c} is not tyre, rim, cover, hub and nut`);
    axle[c] = [b.mid[0], b.mid[1], bbox(tyre.pos).mid[2]];
  }
  // the contact patches
  for (const t of prims.filter((p) => p.mat === 'tyre')) {
    const c = t.node.replace(/^wheel_/, '').replace(/:tyre$/, ''), r = restoreTyre(t, axle[c][0], axle[c][1]);
    log.push(`${t.node.replace(/^wheel_/, 'tyre ').replace(/:tyre$/, '')}: ${r.flats} flattened vertices (a ${(r.flatLength * 1000).toFixed(0)} mm flat) put back on their rings; widest ring after ${(r.ringSpread * 1000).toFixed(2)} mm, column angles fit within ${(r.phaseFit * 1000).toFixed(2)} mm, lowest point ${(r.lowest * 1000).toFixed(1)} mm`);
  }

  // GLB frame (x forward, y up, z right) to GameMog's (+Z forward, +Y up, +X left): X = -z, Y = y, Z = x
  const turn = (a: ArrayLike<number>) => { const o = new Float32Array(a.length); for (let v = 0; v < a.length; v += 3) { o[v] = -a[v + 2]; o[v + 1] = a[v + 1]; o[v + 2] = a[v]; } return o; };
  const turnPt = (p: ArrayLike<number>): V3 => [-p[2], p[1], p[0]];
  const pieces: Piece[] = [];
  const corner = (c: string) => (c.startsWith('front') ? 'f' : 'r') + (c.endsWith('L') ? 'l' : 'r');
  const wheelPts: V3[] = [];
  for (const p of prims) {
    const [grp, mat] = [p.node.split(':')[0], p.mat];
    let part = 'body';
    const w = /^wheel_(front|rear)_([LR])$/.exec(grp);
    if (w) {
      const c = corner(`${w[1]}_${w[2]}`);
      if (['tyre', 'rim', 'wheelCover', 'machined', 'nut'].includes(mat)) part = `wheel-${c}`;
      else if (w[1] === 'front') part = `steer-${c}`;
    }
    const group: Group = ['paintTub', 'paintPod', 'paint'].includes(mat) ? 'paint' : ['carbon', 'wheelCover'].includes(mat) ? 'carbon'
      : mat === 'tyre' ? (w![1] === 'front' ? 'tyre-front' : 'tyre-rear') : mat === 'led' ? 'led' : 'trim';
    const uvMap: Piece['uvMap'] = mat === 'paintTub' ? 'tub' : mat === 'paintPod' ? 'pod' : mat === 'paint' ? 'top' : group === 'carbon' ? 'carbon' : mat === 'tyre' ? 'tyre' : 'none';
    if (group === 'trim' && SLOT[mat] === undefined) throw new Error(`v07: no palette slot for ${mat}`);
    const mk = (idx: Uint32Array, prt: string): Piece => ({ part: prt, group, src: `${grp}:${mat}`, uvMap, slot: group === 'trim' ? SLOT[mat] : 0, lathe: mat === 'tyre',
      pos: turn(p.pos), nor: turn(p.nor), uv: Float32Array.from(p.uv), ao: Float32Array.from(p.ao), idx });
    if (grp === 'body' && ['carbon', 'glass', 'cockpit'].includes(mat)) {
      const s = splitWheel(p);
      if (s.inside.length) {
        pieces.push(mk(s.inside, 'steering-wheel'));
        log.push(`steering wheel: ${s.inside.length / 3} ${mat} triangles cut out of the body`);
        if (mat === 'carbon') { const pp = new Set(s.inside); for (const v of pp) wheelPts.push(turnPt(p.pos.subarray(v * 3, v * 3 + 3))); }
      }
      pieces.push(mk(s.rest, part));
    } else pieces.push(mk(p.idx, part));
  }
  // pivots
  const origin: Record<string, V3> = { body: [0, 0, 0] };
  for (const c of ['front_L', 'front_R', 'rear_L', 'rear_R']) { const a = turnPt(axle[c]), k = corner(c); origin[`wheel-${k}`] = a; if (k[0] === 'f') origin[`steer-${k}`] = a; }
  const swB = bbox(wheelPts.flat()), swAxis0 = smallestAxis(wheelPts);
  // the column's axis points from the wheel to the driver (rearward, -Z)
  const swAxis = (swAxis0[2] > 0 ? swAxis0.map((x) => -x) : swAxis0) as V3;
  // the wheel's centre: its frame's middle along the axis' cross-section (the bbox middle, which the frame's symmetry centres)
  origin['steering-wheel'] = swB.mid;
  log.push(`steering wheel: centre ${swB.mid.map((x) => x.toFixed(3)).join(', ')}, column axis toward the driver ${swAxis.map((x) => x.toFixed(4)).join(', ')} (${((Math.acos(Math.min(1, Math.abs(swAxis[2]))) * 180) / Math.PI).toFixed(1)} degrees off level)`);

  /* ---------------- levels of detail ---------------- */
  const pk = new Packer();
  type Sub = { material: number; key: string; vertices: number; triangles: number };
  type PartOut = { subs: Sub[]; min: number[]; max: number[]; origin: number[]; motion: string };
  const lodsOut: { name: string; error: number | null; use: string; triangles: number; draws: number; parts: Record<string, PartOut> }[] = [];
  const lathes = new Map<Piece, Lathe | null>();
  for (const p of pieces) if (p.lathe) { lathes.set(p, latheGrid(p)); if (!lathes.get(p)) log.push(`${p.src}: not a whole lathe grid, cut like the rest`); }
  const tyreCentre = (p: Piece) => origin[p.part];
  const motion = (part: string) => (part.startsWith('wheel-') ? 'spin' : part.startsWith('steer-') ? 'steer' : part === 'steering-wheel' ? 'turn' : 'static');

  function cut(p: Piece, err: number, weights: readonly number[] = [0.5, 1], prune = false) {
    if (p.lathe && lathes.get(p)) return latheCut(p, lathes.get(p)!, err, tyreCentre(p)).idx;
    const nv = p.pos.length / 3, at = new Float32Array(nv * 5);
    for (let v = 0; v < nv; v++) { for (let c = 0; c < 3; c++) at[v * 5 + c] = p.nor[v * 3 + c]; at[v * 5 + 3] = p.uv[v * 2]; at[v * 5 + 4] = p.uv[v * 2 + 1]; }
    const [nw, uw] = weights, uvw = p.group === 'paint' ? uw : 0;
    // (car.md's measured recipe: normals weighted 0.5, uvs 1.0 on the textured paint, an absolute error)
    return MeshoptSimplifier.simplifyWithAttributes(p.idx, p.pos, 3, at, 5, [nw, nw, nw, uvw, uvw], null, 0, err, prune ? ['ErrorAbsolute', 'Prune'] : ['ErrorAbsolute'])[0];
  }
  function uvOf(p: Piece, v: number): [number, number] {
    const u = p.uv[v * 2], w = p.uv[v * 2 + 1];
    if (p.uvMap === 'tub' || p.uvMap === 'pod' || p.uvMap === 'top') return atlasUv(p.uvMap, u, w);
    if (p.uvMap === 'carbon') return [u / CARBON_TILE, 1 - w / CARBON_TILE];
    if (p.uvMap === 'tyre') return [u, 1 - w];
    return [0, 0];
  }
  function emit(lod: string, part: string, group: Group, list: { p: Piece; idx: Uint32Array }[], o: V3) {
    let nv = 0, ni = 0; const remaps: Int32Array[] = [];
    for (const { p, idx } of list) { const r = new Int32Array(p.pos.length / 3).fill(-1); for (const v of idx) if (r[v] < 0) r[v] = nv++; remaps.push(r); ni += idx.length; }
    if (!ni) return null;
    const pos = new Float32Array(nv * 3), nor = new Int8Array(nv * 3), uv = new Float32Array(nv * 2), ao = new Uint8Array(nv), slot = new Uint8Array(nv);
    const ix = nv < 65536 ? new Uint16Array(ni) : new Uint32Array(ni);
    let k = 0;
    list.forEach(({ p, idx }, li) => {
      const r = remaps[li];
      for (let v = 0; v < r.length; v++) {
        const q = r[v]; if (q < 0) continue;
        for (let c = 0; c < 3; c++) { pos[q * 3 + c] = p.pos[v * 3 + c] - o[c]; nor[q * 3 + c] = Math.round(Math.max(-1, Math.min(1, p.nor[v * 3 + c])) * 127); }
        const [a, b] = uvOf(p, v); uv[q * 2] = a; uv[q * 2 + 1] = b;
        ao[q] = Math.round(Math.max(0, Math.min(1, p.ao[v])) * 255);
        slot[q] = p.slot;
      }
      for (const v of idx) ix[k++] = r[v];
    });
    const key = `${lod}/${part}/${group}`;
    pk.add(`${key}:pos`, pos, 3); pk.add(`${key}:nor`, nor, 3); pk.add(`${key}:uv`, uv, 2); pk.add(`${key}:ao`, ao, 1);
    if (group === 'trim') pk.add(`${key}:slot`, slot, 1);
    pk.add(`${key}:idx`, ix, 1);
    const b = bbox(pos);
    return { sub: { material: GROUP_MATERIAL[group], key, vertices: nv, triangles: ni / 3 }, lo: b.lo, hi: b.hi };
  }

  for (const L of LODS) {
    const parts: Record<string, PartOut> = {};
    // the steering wheel turns only where a camera can see it turn: in lod0 and lod1; further out it stays in the body
    const own = (p: Piece) => (p.part === 'steering-wheel' && (L.name === 'mid' || L.name === 'far') ? 'body' : p.part);
    const cutIdx = new Map<Piece, Uint32Array>(); for (const p of pieces) cutIdx.set(p, cut(p, L.error, L.weights, L.prune));
    const names = [...new Set(pieces.map(own))].sort((a, b) => (a === 'body' ? -1 : b === 'body' ? 1 : a < b ? -1 : 1));
    let tris = 0, draws = 0;
    for (const part of names) {
      const o = origin[part];
      const P: PartOut = { subs: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], origin: o.map((x) => +x.toFixed(5)), motion: motion(part) };
      for (const group of ['paint', 'carbon', 'tyre-front', 'tyre-rear', 'trim', 'led'] as Group[]) {
        const list = pieces.filter((p) => own(p) === part && p.group === group).map((p) => ({ p, idx: cutIdx.get(p)! })).filter((x) => x.idx.length);
        const e = emit(L.name, part, group, list, o);
        if (!e) continue;
        P.subs.push(e.sub); tris += e.sub.triangles; draws++;
        for (let c = 0; c < 3; c++) { P.min[c] = Math.min(P.min[c], +e.lo[c].toFixed(5)); P.max[c] = Math.max(P.max[c], +e.hi[c].toFixed(5)); }
      }
      parts[part] = P;
    }
    lodsOut.push({ name: L.name, error: L.error, use: L.use, triangles: tris, draws, parts });
    const tyre = pieces.find((p) => p.lathe && lathes.get(p));
    const tc = tyre ? latheCut(tyre, lathes.get(tyre)!, L.error, tyreCentre(tyre)) : null;
    log.push(`${L.name} (${L.error * 1000} mm): ${tris} triangles, ${draws} draws${tc ? `; each tyre ${tc.idx.length / 3} triangles (${tc.columns} columns x ${tc.rows - 1} bands)` : ''}`);
  }

  /* ---------------- proxies: one draw each, coloured from the palette ---------------- */
  const maskTub = liveryWeights(`${srcDir}/textures/livery_tub.png`, true), maskPod = liveryWeights(`${srcDir}/textures/livery_pod.png`, false);
  const paintSlot = (p: Piece, v: number) => {
    if (p.uvMap === 'top') return SLOT.upper;
    const m = p.uvMap === 'tub' ? maskTub : maskPod, u = p.uv[v * 2], w = p.uv[v * 2 + 1];
    const x = Math.min(m.W - 1, Math.max(0, Math.floor(u * m.W))), y = Math.min(m.H - 1, Math.max(0, Math.floor((1 - w) * m.H))), o = (y * m.W + x) * 4;
    const up = m.w[o] + m.w[o + 2], co = m.w[o + 1] + m.w[o + 3], lo = 1 - up - co;
    return up >= co && up >= lo ? SLOT.upper : co >= lo ? SLOT.coach : SLOT.lower;
  };
  const proxySlot = (p: Piece, v: number) => p.group === 'paint' ? paintSlot(p, v) : p.group === 'carbon' ? SLOT.carbon : p.group === 'led' ? SLOT.led : p.group === 'trim' ? p.slot : SLOT.tyre;
  for (const X of PROXIES) {
    // the wheels: each tyre on its own lathe grid, closed at each side by a disc (the cover's carbon outside, the rim's
    // grey inside); the rest of the car, welded into one surface and collapsed by quadric error to what is left
    const W = { pos: [] as number[], nor: [] as number[], ao: [] as number[], slot: [] as number[], idx: [] as number[] };
    for (const p of pieces.filter((q) => q.lathe && lathes.get(q))) {
      const L = lathes.get(p)!, o = origin[p.part], c = latheCut(p, L, X.lathe, o), map = new Map<number, number>();
      const add = (v: number) => { let r = map.get(v); if (r === undefined) { r = W.pos.length / 3; map.set(v, r); for (let k = 0; k < 3; k++) { W.pos.push(p.pos[v * 3 + k]); W.nor.push(p.nor[v * 3 + k]); } W.ao.push(p.ao[v]); W.slot.push(SLOT.tyre); } return r; };
      for (const v of c.idx) W.idx.push(add(v));
      for (const row of [c.rowsKept[0], c.rowsKept[c.rowsKept.length - 1]]) {
        const ring = c.colsKept.slice(0, -1).map((col) => L.at[row * L.nc + col]);
        const mx = ring.reduce((s2, v) => s2 + p.pos[v * 3], 0) / ring.length, out = Math.abs(mx) > Math.abs(o[0]), nx = Math.sign(mx - o[0]) || 1;
        const ctr = W.pos.length / 3; W.pos.push(mx, o[1], o[2]); W.nor.push(nx, 0, 0); W.ao.push(1); W.slot.push(out ? SLOT.carbon : SLOT.rim);
        const rim = ring.map((v) => { const r = W.pos.length / 3; W.pos.push(mx, p.pos[v * 3 + 1], p.pos[v * 3 + 2]); W.nor.push(nx, 0, 0); W.ao.push(p.ao[v]); W.slot.push(out ? SLOT.carbon : SLOT.rim); return r; });
        for (let j = 0; j < rim.length; j++) {
          const a = rim[j], b = rim[(j + 1) % rim.length];
          // wound to face along nx
          const ay = W.pos[a * 3 + 1] - o[1], az = W.pos[a * 3 + 2] - o[2], by = W.pos[b * 3 + 1] - o[1], bz = W.pos[b * 3 + 2] - o[2];
          if ((ay * bz - az * by) * nx > 0) W.idx.push(ctr, a, b); else W.idx.push(ctr, b, a);
        }
      }
    }
    const wheelTris = W.idx.length / 3;
    const body = pieces.filter((p) => X.keep(p)).map((p) => ({ p, idx: cut(p, 0.008) }));
    const q = qemProxy(body, X.budget - wheelTris, proxySlot);
    const nW = W.pos.length / 3, n = q.pos.length / 3 + nW, ni = q.idx.length + W.idx.length;
    const pos = new Float32Array(n * 3), nor = new Int8Array(n * 3), ao = new Uint8Array(n), slot = new Uint8Array(n), idx = n < 65536 ? new Uint16Array(ni) : new Uint32Array(ni);
    pos.set(q.pos); nor.set(q.nor); ao.set(q.ao); slot.set(q.slot); idx.set(q.idx);
    const q0 = q.pos.length / 3;
    for (let v = 0; v < nW; v++) { for (let k = 0; k < 3; k++) { pos[(q0 + v) * 3 + k] = W.pos[v * 3 + k]; nor[(q0 + v) * 3 + k] = Math.round(Math.max(-1, Math.min(1, W.nor[v * 3 + k])) * 127); } ao[q0 + v] = Math.round(W.ao[v] * 255); slot[q0 + v] = W.slot[v]; }
    for (let k = 0; k < W.idx.length; k++) idx[q.idx.length + k] = q0 + W.idx[k];
    const key = `${X.name}/body/trim`;
    pk.add(`${key}:pos`, pos, 3); pk.add(`${key}:nor`, nor, 3); pk.add(`${key}:uv`, new Float32Array(n * 2), 2);
    pk.add(`${key}:ao`, ao, 1); pk.add(`${key}:slot`, slot, 1); pk.add(`${key}:idx`, idx, 1);
    const b = bbox(pos);
    lodsOut.push({ name: X.name, error: null, use: X.use, triangles: ni / 3, draws: 1,
      parts: { body: { subs: [{ material: GROUP_MATERIAL.trim, key, vertices: n, triangles: ni / 3 }], min: b.lo.map((x) => +x.toFixed(5)), max: b.hi.map((x) => +x.toFixed(5)), origin: [0, 0, 0], motion: 'static' } } });
    log.push(`${X.name}: ${ni / 3} triangles (budget ${X.budget}): the wheels ${wheelTris} on their lathe grids, the rest ${q.idx.length / 3} by quadric collapse from ${q.from} (welded to ${q.welded} vertices)`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'model.bin.z'), deflateSync(pk.buffer(), { level: 9 }));

  /* ---------------- the livery mask atlas ---------------- */
  {
    const A = new Float32Array(ATLAS.w * ATLAS.h * 4);
    const put = (img: Float32Array, w: number, h: number, x0: number, y0: number) => { for (let y = 0; y < h; y++) A.set(img.subarray(y * w * 4, (y + 1) * w * 4), ((y0 + y) * ATLAS.w + x0) * 4); };
    const [, , tw, th] = ATLAS.tub, [px, py, pw, ph] = ATLAS.pod, [qx, qy, qw, qh] = ATLAS.top;
    put(resample(maskTub.w, maskTub.W, maskTub.H, tw, th), tw, th, 0, 0);
    put(resample(maskPod.w, maskPod.W, maskPod.H, pw, ph), pw, ph, px, py);
    for (let y = qy; y < qy + qh; y++) for (let x = qx; x < qx + qw; x++) A[(y * ATLAS.w + x) * 4] = 1;
    // gutters: the tub's last row down to the middle of the gap, the blocks' first rows up to it, and the sidepods' last
    // column across to the top block
    const copy = (fx: number, fy: number, tx: number, ty: number) => A.copyWithin((ty * ATLAS.w + tx) * 4, (fy * ATLAS.w + fx) * 4, (fy * ATLAS.w + fx) * 4 + 4);
    for (let y = py; y < py + ph; y++) for (let x = px + pw; x < qx; x++) copy(x < (px + pw + qx) / 2 ? px + pw - 1 : qx, y, x, y);
    for (let y = th; y < py; y++) for (let x = 0; x < ATLAS.w; x++) copy(x, y < (th + py) / 2 ? th - 1 : py, x, y);
    const bytes = new Uint8Array(ATLAS.w * ATLAS.h * 4);
    for (let i = 0; i < A.length; i++) bytes[i] = Math.round(Math.max(0, Math.min(1, A[i])) * 255);
    writeFileSync(join(outDir, 'mask.png'), encodePng(ATLAS.w, ATLAS.h, bytes));
    for (const [n, m] of [['tub', maskTub], ['sidepods', maskPod]] as const) log.push(`livery ${n}: unmixed ${m.W} x ${m.H} texels, the worst rebuilt within ${m.worst.toFixed(2)}/255 (${m.over1} texels over 1.5/255), ${m.inkOutside} letter-dark texels outside the letters' boxes`);
  }
  /* ---------------- the tyre and carbon maps ---------------- */
  const T = `${srcDir}/textures`;
  for (const end of ['front', 'rear']) {
    map(`${T}/tyre_${end}_color.png`, join(outDir, `tyre-${end}.jpg`), 1024, 256, 'color', 85);
    map(`${T}/tyre_${end}_normal.png`, join(outDir, `tyre-${end}-normal.jpg`), 1024, 256, 'normal', 90);
    map(`${T}/tyre_${end}_rough.png`, join(outDir, `tyre-${end}-arm.jpg`), 1024, 256, 'arm', 90);
  }
  map(`${T}/carbon_color.png`, join(outDir, 'carbon.jpg'), 512, 512, 'color', 88);
  map(`${T}/carbon_normal.png`, join(outDir, 'carbon-normal.jpg'), 512, 512, 'normal', 90);
  map(`${T}/carbon_rough.png`, join(outDir, 'carbon-arm.jpg'), 512, 512, 'arm', 90);

  /* ---------------- materials ---------------- */
  const lin = (h: string) => [...hexLin(h), 1].map((x) => +x.toFixed(5));
  const materials = [
    { name: 'paint', map: null, normalMap: null, armMap: null, alphaMap: null, color: lin('#ebeae6'), roughness: 0.28, metalness: 0, alpha: null, doubleSided: false, emissive: null, clearcoat: 1, clearcoatRoughness: 0.03, livery: 'mask.png' },
    { name: 'carbon', map: 'carbon.jpg', normalMap: 'carbon-normal.jpg', armMap: 'carbon-arm.jpg', alphaMap: null, color: [1, 1, 1, 1], roughness: 1, metalness: 0, alpha: null, doubleSided: false, emissive: null, normalScale: 0.24, clearcoat: 0.55, clearcoatRoughness: 0.32, specularIntensity: 0.55 },
    { name: 'tyre-front', map: 'tyre-front.jpg', normalMap: 'tyre-front-normal.jpg', armMap: 'tyre-front-arm.jpg', alphaMap: null, color: [1, 1, 1, 1], roughness: 1, metalness: 0, alpha: null, doubleSided: false, emissive: null, wrapT: 'clamp', specularIntensity: 0.55, sheen: 0.18 },
    { name: 'tyre-rear', map: 'tyre-rear.jpg', normalMap: 'tyre-rear-normal.jpg', armMap: 'tyre-rear-arm.jpg', alphaMap: null, color: [1, 1, 1, 1], roughness: 1, metalness: 0, alpha: null, doubleSided: false, emissive: null, wrapT: 'clamp', specularIntensity: 0.55, sheen: 0.18 },
    { name: 'trim', map: null, normalMap: null, armMap: null, alphaMap: null, color: lin('#303134'), roughness: 0.5, metalness: 0.5, alpha: null, doubleSided: false, emissive: null, palette: 'slot' },
    { name: 'led', map: null, normalMap: null, armMap: null, alphaMap: null, color: lin('#200202'), roughness: 0.25, metalness: 0, alpha: null, doubleSided: false, emissive: lin('#ff2412').slice(0, 3) },
    // not drawn: it carries the livery mask, so the runtime's loader fetches it with the rest (premultiplied alpha off)
    { name: 'livery-mask', map: 'mask.png', normalMap: null, armMap: null, alphaMap: null, color: [1, 1, 1, 1], roughness: 1, metalness: 0, alpha: null, doubleSided: false, emissive: null, unused: true },
  ];
  /* ---------------- what a world needs to drive it ---------------- */
  const lod0 = lodsOut[0], r5 = (v: number[]) => v.map((x) => +x.toFixed(4));
  // the whole car, wheels straight, from lod0's parts where they stand
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of Object.values(lod0.parts)) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P.min[c] + P.origin[c]); hi[c] = Math.max(hi[c], P.max[c] + P.origin[c]); }
  const ofSrc = (src: string) => pieces.filter((p) => p.src === src);
  const comps = (ps: Piece[]) => { // the separate pieces of a material, each its bounding box (car space)
    const out: { lo: V3; hi: V3 }[] = [];
    for (const p of ps) {
      const nv = p.pos.length / 3, up = new Int32Array(nv).map((_, i) => i), find = (i: number): number => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
      for (let t = 0; t < p.idx.length; t += 3) { const r = find(p.idx[t]); up[find(p.idx[t + 1])] = r; up[find(p.idx[t + 2])] = r; }
      const boxes = new Map<number, { lo: V3; hi: V3 }>();
      for (const v of p.idx) { const r = find(v); let b = boxes.get(r); if (!b) boxes.set(r, (b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] })); for (let c = 0; c < 3; c++) { b.lo[c] = Math.min(b.lo[c], p.pos[v * 3 + c]); b.hi[c] = Math.max(b.hi[c], p.pos[v * 3 + c]); } }
      out.push(...boxes.values());
    }
    return out;
  };
  const mid = (b: { lo: V3; hi: V3 }) => r5([0, 1, 2].map((c) => (b.lo[c] + b.hi[c]) / 2));
  const rain = comps(ofSrc('body:led')), plates = comps(ofSrc('rearWing:led')), pipe = comps(ofSrc('rearWing:exhaust'));
  const tyreOf = (k: string) => pieces.find((p) => p.part === `wheel-${k}` && p.lathe)!;
  const tyreSize = (k: string) => { const p = tyreOf(k), b = bbox(Float32Array.from(p.pos)), o = origin[`wheel-${k}`]; return { radius: +(b.hi[1] - o[1]).toFixed(4), width: +(b.hi[0] - b.lo[0]).toFixed(4), lowest: +b.lo[1].toFixed(4) }; };
  const box = (b: number[]) => [b[0] / 4096, (b[1] / 2048) * (ATLAS.tub[3] / ATLAS.h), b[2] / 4096, (b[3] / 2048) * (ATLAS.tub[3] / ATLAS.h)].map((x) => +x.toFixed(5));
  const car = {
    frame: 'GameMog\'s: +Z forward, +Y up, +X to the car\'s left; metres; the origin at the wheelbase midpoint on the ground. Every part\'s geometry is local to its origin (its pivot), given in car space.',
    size: { length: +(hi[2] - lo[2]).toFixed(4), width: +(hi[0] - lo[0]).toFixed(4), height: +(hi[1] - lo[1]).toFixed(4), min: r5(lo), max: r5(hi) },
    wheelbase: +(origin['wheel-fl'][2] - origin['wheel-rl'][2]).toFixed(4),
    track: { front: +(origin['wheel-fl'][0] - origin['wheel-fr'][0]).toFixed(4), rear: +(origin['wheel-rl'][0] - origin['wheel-rr'][0]).toFixed(4) },
    tyres: { front: tyreSize('fl'), rear: tyreSize('rl'), note: 'Round again: the source pressed each tyre flat where it meets the ground. The axle stands at its loaded height, so a round tyre reaches below the ground plane by -lowest; the road hides it.' },
    corners: Object.fromEntries(['fl', 'fr', 'rl', 'rr'].map((k) => [k, { spin: `wheel-${k}`, steer: k[0] === 'f' ? `steer-${k}` : null, centre: r5(origin[`wheel-${k}`]) }])),
    spin: { axis: [1, 0, 0], sense: 'A positive angle about +X rolls the car forward (+Z): add distance / radius.' },
    steer: { axis: [0, 1, 0], sense: 'A positive angle about +Y turns the front wheels to the car\'s left (+X). Parent a front wheel\'s spin part to its steer part (both pivot at the wheel centre). The suspension arms stay in the body and do not follow.' },
    steeringWheel: { part: 'steering-wheel', centre: r5(origin['steering-wheel']), axis: r5(swAxis), sense: 'A positive angle about this axis (the column, pointing to the driver) turns it anticlockwise as the driver sees it: a left turn. In lod0 and lod1 only; mid and far keep it in the body.' },
    lamps: { rain: rain.map(mid), endplates: plates.map(mid).sort((a, b) => b[0] - a[0]) },
    // the pipe's exit: the middle of its rearmost piece, at its rear face
    exhaust: (() => { const b = pipe.reduce((m, x) => (x.lo[2] < m.lo[2] ? x : m)); return r5([(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, b.lo[2]]); })(),
    livery: {
      mask: 'mask.png', atlas: ATLAS,
      channels: 'Linear weights: R the upper colour, G the coachline, B the letters, A the race number; the gold full stop is G and B together (gold = min(G, B)), and what is left (1 - R - G - B + gold - A) is the lower colour. Sample it as data (no colour-space conversion, premultiplied alpha off) and mix the scheme\'s linear colours with the weights.',
      owner: { upper: '#ebeae6', lower: '#1d1d1e', coach: '#dd6135', letters: '#080806', gold: '#a08c5a', number: '#dd6135', nut: '#b0301b', tcam: '#d9481f' },
      slots: { wordmark: WORDMARK_BOXES.map(box), number: box(NUMBER_BOX), note: 'Atlas uv rectangles [u0, v0, u1, v1] of the two WHY. wordmarks (the engine-cover flanks) and the race number (the nose top), where another scheme hides them (letters and number weights to the upper colour) or draws its own.' },
      marks: 'The WHY. name and wordmark are the owner\'s trademarks: CC0 gives away the model, not the marks.',
    },
    palette: PALETTE,
    trim: 'Materials "trim" (and every proxy) colour each vertex from palette[slot]: the slot is a Uint8 attribute (layout key ":slot").',
    ao: 'Every sub has a Uint8 ambient-occlusion attribute (layout key ":ao", 0 to 1 normalised), baked by ray tracing in the source: apply it to indirect light.',
  };
  const kept = lod0.triangles;
  const asset = { format: 'gmasset/1', kind: 'model', file: 'model.bin.z', layout: pk.layout, parts: lod0.parts, materials, triangles: { source: sourceTriangles, kept }, lods: lodsOut, car };
  return { asset, log };
}

/* ------------------------------------------------------------------ proxies -- */
// The car's surface for a proxy: every kept piece welded into one mesh by position (seams and touching shells joined),
// then edges collapsed in order of quadric error (Garland and Heckbert: each vertex carries the planes of its faces, open
// edges a perpendicular plane each, so the outline holds), refusing a collapse that would turn a face over, until the
// budget is met. Each vertex keeps the slot and the occlusion of the side with more area. Normals are split at creases
// sharper than 60 degrees, so a wing's edge stays an edge.
function qemProxy(list: { p: Piece; idx: Uint32Array }[], budget: number, slotOf: (p: Piece, v: number) => number) {
  const key = new Map<string, number>(), P: number[] = [], slot: number[] = [], ao: number[] = [], F: number[] = [];
  for (const { p, idx } of list) {
    const rep = new Map<number, number>();
    for (const v of idx) {
      if (rep.has(v)) continue;
      const k = `${Math.round(p.pos[v * 3] * 1e4)},${Math.round(p.pos[v * 3 + 1] * 1e4)},${Math.round(p.pos[v * 3 + 2] * 1e4)}`;
      let r = key.get(k);
      if (r === undefined) { r = P.length / 3; key.set(k, r); P.push(p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2]); slot.push(slotOf(p, v)); ao.push(p.ao[v]); }
      rep.set(v, r);
    }
    for (let t = 0; t < idx.length; t += 3) { const a = rep.get(idx[t])!, b = rep.get(idx[t + 1])!, c = rep.get(idx[t + 2])!; if (a !== b && b !== c && a !== c) F.push(a, b, c); }
  }
  const nv = P.length / 3, nf = F.length / 3, from = nf;
  const alive = new Uint8Array(nf).fill(1), vAlive = new Uint8Array(nv).fill(1), ver = new Uint32Array(nv), area = new Float64Array(nv);
  const faces: number[][] = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) faces[F[f * 3 + k]].push(f);
  const Q = new Float64Array(nv * 10);
  const addPlane = (v: number, a: number, b: number, c: number, d: number, w: number) => { const q = v * 10; Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d; Q[q + 4] += w * b * b; Q[q + 5] += w * b * c; Q[q + 6] += w * b * d; Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d; };
  const normal = (a: number[], b: number[], c: number[]) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
  const pt = (v: number) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const edgeFaces = new Map<string, number>();
  for (let f = 0; f < nf; f++) {
    const [a, b, c] = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]], n = normal(pt(a), pt(b), pt(c)), l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-14) continue;
    const ar = l / 2, nn = n.map((x) => x / l), d = -(nn[0] * P[a * 3] + nn[1] * P[a * 3 + 1] + nn[2] * P[a * 3 + 2]);
    for (const v of [a, b, c]) { addPlane(v, nn[0], nn[1], nn[2], d, ar); area[v] += ar / 3; }
    for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x < y ? `${x},${y}` : `${y},${x}`; edgeFaces.set(k, (edgeFaces.get(k) ?? 0) + 1); }
  }
  // open edges: a plane through the edge, perpendicular to its face, weighted by the edge's length squared
  for (let f = 0; f < nf; f++) {
    const [a, b, c] = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]], n = normal(pt(a), pt(b), pt(c)), l = Math.hypot(n[0], n[1], n[2]); if (l < 1e-14) continue;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const k = x < y ? `${x},${y}` : `${y},${x}`; if (edgeFaces.get(k) !== 1) continue;
      const e = [P[y * 3] - P[x * 3], P[y * 3 + 1] - P[x * 3 + 1], P[y * 3 + 2] - P[x * 3 + 2]], el = Math.hypot(e[0], e[1], e[2]); if (el < 1e-9) continue;
      const m = [e[1] * n[2] - e[2] * n[1], e[2] * n[0] - e[0] * n[2], e[0] * n[1] - e[1] * n[0]], ml = Math.hypot(m[0], m[1], m[2]); if (ml < 1e-14) continue;
      const mm = m.map((t) => t / ml), d = -(mm[0] * P[x * 3] + mm[1] * P[x * 3 + 1] + mm[2] * P[x * 3 + 2]);
      for (const v of [x, y]) addPlane(v, mm[0], mm[1], mm[2], d, el * el * 4);
    }
  }
  const evalQ = (q: Float64Array, x: number, y: number, z: number) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const tmp = new Float64Array(10);
  const best = (a: number, b: number) => {
    for (let i = 0; i < 10; i++) tmp[i] = Q[a * 10 + i] + Q[b * 10 + i];
    const [A, B, C, D, E, Fq, G, H, I] = [tmp[0], tmp[1], tmp[2], tmp[4], tmp[5], tmp[7], tmp[3], tmp[6], tmp[8]];
    // solve [A B C; B D E; C E Fq] x = -[G H I]
    const m00 = A, m01 = B, m02 = C, m11 = D, m12 = E, m22 = Fq;
    const c00 = m11 * m22 - m12 * m12, c01 = m02 * m12 - m01 * m22, c02 = m01 * m12 - m02 * m11, dt = m00 * c00 + m01 * c01 + m02 * c02;
    const cands: number[][] = [pt(a), pt(b), [(P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2]];
    if (Math.abs(dt) > 1e-12) {
      const c11 = m00 * m22 - m02 * m02, c12 = m01 * m02 - m00 * m12, c22 = m00 * m11 - m01 * m01;
      const x = -(c00 * G + c01 * H + c02 * I) / dt, y = -(c01 * G + c11 * H + c12 * I) / dt, z = -(c02 * G + c12 * H + c22 * I) / dt;
      // a solution far off the edge (a near-flat quadric) is not trusted
      const mid = cands[2], len = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
      if (Math.hypot(x - mid[0], y - mid[1], z - mid[2]) < 2 * len + 0.01) cands.push([x, y, z]);
    }
    let bp = cands[0], bc = Infinity;
    for (const c of cands) { const e = evalQ(tmp, c[0], c[1], c[2]); if (e < bc) { bc = e; bp = c; } }
    return { cost: Math.max(0, bc), p: bp };
  };
  // a binary heap of [cost, a, b, ver a, ver b]
  const heap: number[][] = [];
  const push = (e: number[]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  for (const k of edgeFaces.keys()) { const [a, b] = k.split(',').map(Number); push([best(a, b).cost, a, b, 0, 0]); }
  let live = nf;
  const flips = (v: number, other: number, np: number[]) => {
    for (const f of faces[v]) {
      if (!alive[f]) continue;
      const vs = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]]; if (vs.includes(other)) continue;
      const before = normal(pt(vs[0]), pt(vs[1]), pt(vs[2])), after = normal(...(vs.map((x) => (x === v ? np : pt(x))) as [number[], number[], number[]]));
      const lb = Math.hypot(before[0], before[1], before[2]), la = Math.hypot(after[0], after[1], after[2]);
      if (la < 1e-14 || before[0] * after[0] + before[1] * after[1] + before[2] * after[2] < 0.2 * lb * la) return true;
    }
    return false;
  };
  while (live > budget && heap.length) {
    const [cost, a, b, va, vb] = pop();
    if (!vAlive[a] || !vAlive[b] || ver[a] !== va || ver[b] !== vb) continue;
    const r = best(a, b);
    if (Math.abs(r.cost - cost) > 1e-12 * (1 + cost)) { push([r.cost, a, b, ver[a], ver[b]]); continue; }
    if (cost < 1e3 && (flips(a, b, r.p) || flips(b, a, r.p))) { push([cost + 1e3, a, b, ver[a], ver[b]]); continue; }
    // b into a
    P[a * 3] = r.p[0]; P[a * 3 + 1] = r.p[1]; P[a * 3 + 2] = r.p[2];
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    if (area[b] > area[a]) { slot[a] = slot[b]; ao[a] = ao[b]; }
    area[a] += area[b]; vAlive[b] = 0;
    for (const f of faces[b]) {
      if (!alive[f]) continue;
      const vs = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]];
      if (vs.includes(a)) { alive[f] = 0; live--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === b) F[f * 3 + k] = a;
      faces[a].push(f);
    }
    faces[a] = faces[a].filter((f) => alive[f]); faces[b] = [];
    ver[a]++;
    const nb = new Set<number>(); for (const f of faces[a]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== a) nb.add(w); }
    for (const w of nb) push([best(a, w).cost, a, w, ver[a], ver[w]]);
  }
  // out: crease-split normals
  const fl: number[] = []; for (let f = 0; f < nf; f++) if (alive[f]) fl.push(f);
  const fn = new Map<number, number[]>(); for (const f of fl) fn.set(f, normal(pt(F[f * 3]), pt(F[f * 3 + 1]), pt(F[f * 3 + 2])));
  const outP: number[] = [], outN: number[] = [], outS: number[] = [], outA: number[] = [], outI: number[] = [], seen = new Map<string, number>();
  const unit = (n: number[]) => { const l = Math.hypot(n[0], n[1], n[2]) || 1; return n.map((x) => x / l); };
  for (const f of fl) {
    const nf0 = unit(fn.get(f)!);
    for (let k = 0; k < 3; k++) {
      const v = F[f * 3 + k], s = [0, 0, 0];
      for (const g of faces[v]) { if (!alive[g]) continue; const n = fn.get(g)!, u = unit(n); if (u[0] * nf0[0] + u[1] * nf0[1] + u[2] * nf0[2] > 0.5) for (let c = 0; c < 3; c++) s[c] += n[c]; }
      const n = unit(s[0] || s[1] || s[2] ? s : nf0), id = `${v}:${Math.round(n[0] * 50)},${Math.round(n[1] * 50)},${Math.round(n[2] * 50)}`;
      let o = seen.get(id);
      if (o === undefined) { o = outP.length / 3; seen.set(id, o); outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); outN.push(...n.map((x) => Math.round(x * 127))); outS.push(slot[v]); outA.push(Math.round(Math.max(0, Math.min(1, ao[v])) * 255)); }
      outI.push(o);
    }
  }
  return { pos: Float32Array.from(outP), nor: Int8Array.from(outN), slot: Uint8Array.from(outS), ao: Uint8Array.from(outA), idx: Uint32Array.from(outI), from, welded: nv };
}
