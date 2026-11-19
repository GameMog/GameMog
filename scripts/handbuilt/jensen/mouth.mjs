// Jensen's mouth, caricature round 3 (the owner, 19 Nov: "hair and mouth need a bit more work"; the critic: the open grin
// read as a one-sided sneer: no upper teeth, only a pale inner-lip band and a dark slot):
//   teethForwardPass(doc, K)  the upper teeth set up and a touch forward, just behind the lips' inner faces (they sat
//                             6 mm low and 4 mm back, under the lower lip, so the grin's lifted upper lip showed none);
//                             the lips still cover them at rest
//   innerLipPass(doc, K)      the lips' inner faces and the mouth's inside painted a deep rose to dark red, by how far
//                             behind the lips' front each texel lies at rest (the pale skin there read as a flap)
//   faceMirrorMapsPass(doc)   the face's normal and roughness maps made mirror twins about the midline, as the albedo is
//                             (skinGradePass): a crease painted or baked on one side only read as a one-sided dimple and
//                             smirk under the studio key (tangent-space x flips in the mirror)
// Original work (no assets), CC0.
import { prim, matOf, rgba, setWebp, sm, raster } from '../young-hero/glb.mjs';
import { skinMap } from '../facekit.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { LM } from './landmarks.mjs';

export function teethForwardPass(doc, K = {}) {
  K = { up: 0.005, fwd: 0.0015, ...K };
  const p = prim(doc, 'teethUp')[0]; if (!p) { console.log('teeth: no teethUp'); return; }
  const acc = p.getAttribute('POSITION'), A = acc.getArray().slice(), vs = new Set(p.getIndices().getArray());
  // (the points the upper teeth own alone: the shared body set has nothing else on them)
  const others = new Set(); for (const q of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) if (q !== p && q.getAttribute('POSITION') === acc) for (const v of q.getIndices().getArray()) others.add(v);
  let n = 0; for (const v of vs) { if (others.has(v)) continue; A[v * 3 + 1] += K.up; A[v * 3 + 2] += K.fwd; n++; }
  acc.setArray(A); console.log('teeth: upper set up', K.up * 1000, 'mm, forward', K.fwd * 1000, 'mm; points', n);
}

export async function innerLipPass(doc, K = {}) {
  K = { band: 0.016, half: 0.028, rose: [150, 70, 72], deep: [62, 22, 26], nz0: 0.4, nz1: 0.1, d0: 0.001, d1: 0.003, d2: 0.009, ...K };
  const { MOUTHY } = LM, M = skinMap(doc), P = M.P.getArray(), n = M.n;
  const fam = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getAttribute('POSITION') === M.P && p.getMaterial()?.getName() === 'skin');
  // rest normals, welded by position (the uv seams share them)
  const key = (v) => `${Math.round(P[v * 3] * 1e5)},${Math.round(P[v * 3 + 1] * 1e5)},${Math.round(P[v * 3 + 2] * 1e5)}`, rep = new Int32Array(n), first = new Map();
  for (let v = 0; v < n; v++) { const k = key(v); if (!first.has(k)) first.set(k, v); rep[v] = first.get(k); }
  const N = new Float32Array(n * 3);
  for (const p of fam) { const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2];
    const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]), fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[rep[v] * 3 + k] += fn[k]; } }
  // the lips' front at rest: per 2 mm column across, the most forward skin point within the mouth's band
  const front = new Map(), col = (x) => Math.round(x / 0.002);
  for (const p of fam) for (const v of p.getIndices().getArray()) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (Math.abs(y - MOUTHY) > K.band || Math.abs(x) > K.half + 0.006 || z < 0.08) continue; const c = col(x); front.set(c, Math.max(front.get(c) ?? -9, z)); }
  const zf = (x) => { const c = col(x); let z = -9; for (const k of [c - 1, c, c + 1]) z = Math.max(z, front.get(k) ?? -9); return z; };
  // each point's share: the lips' inner faces (facing up, down or back, not forward) behind the lips' front
  const A = new Float32Array(n), B = new Float32Array(n); let nv = 0;
  for (let v = 0; v < n; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (Math.abs(y - MOUTHY) > K.band || Math.abs(x) > K.half || z < 0.08) continue;
    const r = rep[v], L = Math.hypot(N[r * 3], N[r * 3 + 1], N[r * 3 + 2]) || 1, nz = N[r * 3 + 2] / L, behind = zf(x) - z;
    A[v] = sm(K.nz0, K.nz1, nz) * sm(K.d0, K.d1, behind) * (1 - sm(K.half - 0.006, K.half, Math.abs(x))); B[v] = sm(K.d1, K.d2, behind); if (A[v] > 0) nv++; }
  const { B: BD, tex, img, S } = await texelPos(doc), d = img.data, uv = BD.uv.getArray(); let nt = 0;
  raster(fam.flatMap((p) => [...p.getIndices().getArray()]), (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, a, b, c) => {
    const w = l1 * A[a] + l2 * A[b] + l3 * A[c]; if (w <= 0.01) return; const dp = l1 * B[a] + l2 * B[b] + l3 * B[c], i = y * S + x;
    for (let k = 0; k < 3; k++) { const t = K.rose[k] + (K.deep[k] - K.rose[k]) * dp; d[i * 4 + k] = Math.round(d[i * 4 + k] * (1 - w) + t * w); } nt++; }, 0.02);
  await setWebp(tex, d, S, S, 90, 4); console.log('inner lips: points', nv, 'texels', nt);
}

export async function faceMirrorMapsPass(doc, K = {}) {
  K = { y0: 1.44, half: 0.1, feather: 0.006, ...K };
  const { S, pos } = await texelPos(doc), mat = matOf(doc, 'skin'), c = 2000, key = (x, y, z) => `${Math.round(x * c)},${Math.round(y * c)},${Math.round(z * c)}`;
  const R = (i) => pos[i * 3 + 1] > K.y0 && pos[i * 3 + 2] > -0.02 && Math.abs(pos[i * 3]) < K.half;
  const G = new Map(); for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3 + 1]) || !R(i) || pos[i * 3] < 0) continue; const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); if (!G.has(k)) G.set(k, i); }
  const pairs = []; for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3 + 1]) || !R(i) || pos[i * 3] >= 0) continue; const x = -pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let q = -1, best = 1e9; const cx = Math.round(x * c), cy = Math.round(y * c), cz = Math.round(z * c);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const j = G.get(`${cx + a},${cy + b},${cz + e}`); if (j === undefined) continue; const dd = Math.hypot(pos[j * 3] - x, pos[j * 3 + 1] - y, pos[j * 3 + 2] - z); if (dd < best) { best = dd; q = j; } }
    if (q >= 0) pairs.push([i, q, sm(0, K.feather, x)]); }
  for (const [name, tex, flipX] of [['normal', mat.getNormalTexture(), true], ['mr', mat.getMetallicRoughnessTexture(), false]]) { if (!tex) continue;
    const { data, w, h } = await rgba(tex); if (w !== S || h !== S) { console.log('face mirror maps:', name, w, 'x', h, '(not the albedo size): resampled'); }
    const sx = w / S, sy = h / S, src = Buffer.from(data), at = (i) => (Math.min(h - 1, Math.floor(Math.floor(i / S) * sy)) * w + Math.min(w - 1, Math.floor((i % S) * sx)));
    for (const [i, q, f] of pairs) { const I = at(i), Q = at(q); for (let k = 0; k < 3; k++) { let v = src[Q * 4 + k]; if (flipX && k === 0) v = 255 - v; data[I * 4 + k] = Math.round(src[I * 4 + k] * (1 - f) + v * f); } }
    await setWebp(tex, data, w, h, 94, 4); console.log('face mirror maps:', name, 'texels', pairs.length); }
}

// The mouth's morphs relaxed (round 3, the critic: dark wedges and a notch in the lower lip on 'aa'): a few lower-lip and
// lip-to-chin triangles folded over (their normal turned) as the jaw opened, and the hole-fill points by the corners (no
// MakeHuman vertex: no delta of their own) stayed put while the lips moved round them. For each target, the deltas of
// the points of every triangle that folds (and of the unmapped points) are eased toward their neighbours' mean until no
// triangle near the mouth folds; the lips' seam is not crossed (its two sides are not joined by any triangle).
export function relaxMorphsPass(doc, K = {}) {
  K = { re: /^(jawOpen|viseme_|mouth)/, y: [1.515, 1.585], half: 0.045, zMin: 0.09, cos: 0.3, iters: 40, lam: 0.6, mixes: [['mouthSmileLeft', 'mouthSmileRight', 0.6]], ...K };
  const M = skinMap(doc), P = M.P.getArray(), n = M.n;
  const fam = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getAttribute('POSITION') === M.P);
  const skp = fam.filter((p) => p.getMaterial()?.getName() === 'skin'), inZ = (v) => P[v * 3 + 1] > K.y[0] && P[v * 3 + 1] < K.y[1] && Math.abs(P[v * 3]) < K.half && P[v * 3 + 2] > K.zMin;
  const tri = []; for (const p of skp) { const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) if (inZ(I[t]) || inZ(I[t + 1]) || inZ(I[t + 2])) tri.push(I[t], I[t + 1], I[t + 2]); }
  const nb = new Map(); for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) for (let f = 0; f < 3; f++) if (e !== f) (nb.get(tri[t + e]) || nb.set(tri[t + e], new Set()).get(tri[t + e])).add(tri[t + f]);
  const fn = (Q, a, b, c) => { const e1 = [0, 1, 2].map((k) => Q[b * 3 + k] - Q[a * 3 + k]), e2 = [0, 1, 2].map((k) => Q[c * 3 + k] - Q[a * 3 + k]); return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; };
  const N0 = []; for (let t = 0; t < tri.length; t += 3) N0.push(fn(P, tri[t], tri[t + 1], tri[t + 2]));
  const folds = (D, w = 1) => { const Q = P.slice(); for (let i = 0; i < Q.length; i++) Q[i] += D[i] * w; const out = new Set();
    for (let t = 0, k = 0; t < tri.length; t += 3, k++) { const a = N0[k], b = fn(Q, tri[t], tri[t + 1], tri[t + 2]), la = Math.hypot(...a), lb = Math.hypot(...b); if (la < 1e-12 || lb < 1e-14) continue; if ((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb) < K.cos) { out.add(tri[t]); out.add(tri[t + 1]); out.add(tri[t + 2]); } }
    return out; };
  const unmapped = [...nb.keys()].filter((v) => M.map[v] < 0 && inZ(v));
  const ease = (D, set) => { const o = D.slice(); for (const v of set) { const s = nb.get(v); if (!s) continue; const c = [0, 0, 0]; for (const u of s) for (let k = 0; k < 3; k++) c[k] += o[u * 3 + k]; for (let k = 0; k < 3; k++) D[v * 3 + k] = o[v * 3 + k] + K.lam * (c[k] / s.size - o[v * 3 + k]); } };
  const accs = new Map(); for (const t of fam[0].listTargets()) if (K.re.test(t.getName())) accs.set(t.getName(), t.getAttribute('POSITION'));
  const log = [];
  for (const [name, acc] of accs) { const D = acc.getArray().slice(); let f0 = folds(D).size, it = 0;
    for (; it < K.iters; it++) { const f = folds(D); if (!f.size && it > 2) break; const set = new Set([...f, ...unmapped]); for (const v of [...f]) for (const u of nb.get(v) || []) if (inZ(u)) set.add(u); ease(D, set); }
    acc.setArray(D); const f1 = folds(D).size; if (f0 || f1) log.push(`${name} ${f0}->${f1}`); }
  // (the smile pair at the engine's warm weight, together)
  for (const [a, b, w] of K.mixes) { const A = accs.get(a), B = accs.get(b); if (!A || !B) continue; for (let it = 0; it < K.iters; it++) { const DA = A.getArray().slice(), DB = B.getArray().slice(), S = DA.map((x, i) => x + DB[i]); const f = folds(S, w); if (!f.size) break;
      const set = new Set(f); for (const v of [...f]) for (const u of nb.get(v) || []) if (inZ(u)) set.add(u); ease(DA, set); ease(DB, set); A.setArray(DA); B.setArray(DB); }
    log.push(`${a}+${b}@${w} ${folds(A.getArray().map((x, i) => x + B.getArray()[i]), w).size}`); }
  console.log('morph relax: unmapped points', unmapped.length, '; folded points before -> after:', log.join(', '));
}
