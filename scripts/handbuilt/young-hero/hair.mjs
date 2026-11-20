// Hand-built young hero, pass 2: the hair as Mr. Big's beard is made, shells over the scalp, in place of the forged
// card mop (a helmet whose temple and fringe cards showed as see-through spikes).
//  where    the scalp the forge painted (the skin texture's dark area under the mop: luminance < ~45) grown over the head's
//           triangles, smoothed over the mesh, its edge broken by noise (a random hairline, no comb teeth); the ears clear
//  cut      a taper: ~11 mm on the crown and top, ~7 mm over the temples, faded to ~2 mm at the nape and over the ears,
//           the depth varying by clump so the outline is not a shell
//  shells   K.layers copies of the scalp's triangles out along the skin's normals (each its own primitive's points, on the
//           hair mesh's node: the same skin and joints as the head, the source point's weights), vertex colour = the
//           layer's root-to-tip shade and its alpha cut (Mr. Big's [1 .. .62] scheme), the uv turned a little per layer
//           round a small circle so each clump twists (a coil, not a pile)
//  texture  in the skin's uv space (only the scalp's texels drawn): 3D cells ~2.4 mm (tight curls), each a clump whose
//           height falls off from its centre, split into strands by a fine grain; dark brown with warm tips
//  scalp    the skin under it painted the hair's root colour with a grain, so between the clumps reads as dense hair
import { body, prim, matOf, raster, fbm, h3, sm, clamp, rgba, setWebp, THREE } from './glb.mjs';
export async function shellHairPass(doc, K = {}) {
  K = { layers: 6, top: 0.011, side: 0.0072, nape: 0.0022, cell: 0.0024, S: 2048, Lcut: 45, swirl: 0.35, front: 0, base: [30, 21, 15], tip: [56, 39, 27], ...K };
  const R = doc.getRoot(), B = body(doc), p = B.pos, uv = B.uv.getArray(), NA = B.sk.getAttribute('NORMAL'), N0 = NA.getArray(), nsc = NA.getNormalized() ? (N0 instanceof Int8Array ? 127 : N0 instanceof Int16Array ? 32767 : 1) : 1, N = Float32Array.from(N0, (x) => Math.max(-1, x / nsc));
  for (let v = 0; v < N.length / 3; v++) { const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; for (let k = 0; k < 3; k++) N[v * 3 + k] /= l; }
  const head = B.wOn(/^head$/), skinMat = matOf(doc, 'skin'), skinTex = skinMat.getBaseColorTexture();
  const { data: sk, w: SW } = await rgba(skinTex);
  const tris = B.sk.getIndices().getArray(), nV = p.length / 3;
  // coverage per vertex from the painted scalp
  // (the scalp read from the forged texture, K.src, before the skin pass repainted round the ears)
  const s0 = K.src?.data || sk, W0 = K.src?.w || SW;
  const Lv = (v) => { const x = Math.min(W0 - 1, Math.floor(uv[v * 2] * W0)), y = Math.min(W0 - 1, Math.floor(uv[v * 2 + 1] * W0)), i = (y * W0 + x) * 4; return (s0[i] + s0[i + 1] + s0[i + 2]) / 3; };
  let c = new Float32Array(nV); const used = new Set(tris);
  for (const v of used) { if (head[v] < 0.5 || p[v * 3 + 1] < 1.64) continue; const x = Math.abs(p[v * 3]), y = p[v * 3 + 1], z = p[v * 3 + 2];
    // (the sides: the forged paint left the temples and round the ears bare (the mop covered them): a fade's side
    // hair added by shape: above and behind the ear with a 6 mm gap, a sideburn in front of it, the temple's edge)
    const ex = (y - 1.738) / 0.046, ez = (z - 0.046) / 0.03, earD = Math.hypot(ex, ez), zFront = 0.09 + 0.05 * sm(1.745, 1.81, y);
    const side = sm(0.04, 0.058, x) * sm(1.728, 1.742, y + 0.006 * (fbm(x, y, z, 120) - 0.5)) * sm(zFront + 0.004, zFront - 0.004, z + 0.005 * (fbm(x, y, z + 2, 140) - 0.5)) * sm(1.02, 1.18, earD);
    // (the sideburn kept to the head's side below the brows (x > 6.6 cm): the forge's face gate counts hair at the
    // temple's front, inside the cheeks' width, as hair on the face)
    const faceGuard = 1 - (1 - sm(0.063, 0.068, x)) * sm(1.772, 1.764, y);
    c[v] = Math.max(sm(K.Lcut + 25, K.Lcut - 10, Lv(v)), side) * sm(0.98, 1.1, earD) * faceGuard; }
  // smooth over the mesh (3 rounds), then a noisy edge
  const nb = Array.from({ length: nV }, () => []); for (let q = 0; q < tris.length; q += 3) for (let k = 0; k < 3; k++) { const a = tris[q + k], b = tris[q + (k + 1) % 3]; nb[a].push(b); nb[b].push(a); }
  for (let it = 0; it < 3; it++) { const o = new Float32Array(c); for (const v of used) { if (!nb[v].length) continue; let s = c[v] * 2; for (const u of nb[v]) s += c[u]; o[v] = s / (nb[v].length + 2); } c = o; }
  for (const v of used) { if (c[v] <= 0) continue; const x0 = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]; const fr = K.front * sm(0.06, 0.1, z) * sm(1.76, 1.8, y), ax = Math.abs(x0);
    // (pass 3: the front hairline was a straight, hard band (a swim cap at eye level): a slow wave along it, the
    // corners rounded back at the temples, and more jitter, so the edge reads as grown hair, not a cut)
    const wave = fr * (0.32 * (fbm(x0 * 1.3, y, z, 28) - 0.5) + 0.16 * (h3(Math.floor(x0 * 260), 7, 3) - 0.5)) - fr * 0.14 * sm(0.022, 0.05, ax);
    c[v] = sm(0.16, 0.46, c[v] + wave + 0.22 * (fbm(x0, y, z, 90) - 0.5) + 0.1 * (h3(Math.floor(x0 * 900), Math.floor(y * 900), Math.floor(z * 900)) - 0.5)); }
  // the cut: depth per vertex
  const depth = new Float32Array(nV);
  for (const v of used) { if (c[v] <= 0) continue; const x = Math.abs(p[v * 3]), y = p[v * 3 + 1], z = p[v * 3 + 2];
    const topness = sm(1.79, 1.845, y), back = sm(0.02, -0.04, z), sideness = sm(0.05, 0.075, x) * (1 - topness);
    let d = K.side + (K.top - K.side) * topness; d = d * (1 - back * sm(1.8, 1.72, y)) + K.nape * back * sm(1.8, 1.72, y); d = d * (1 - 0.45 * sideness * sm(1.81, 1.77, y));
    d *= 0.82 + 0.36 * fbm(p[v * 3], y, z, 60);
    // (pass 3: at the front the depth tapers over the edge's band (the silhouette's step went), the top kept)
    const fr = K.front * sm(0.06, 0.1, z) * sm(1.76, 1.8, y);
    depth[v] = d * Math.pow(c[v], 0.7 + 1.3 * fr); }
  // the shells' triangles: skin triangles with any coverage
  const T = []; for (let q = 0; q < tris.length; q += 3) { const a = tris[q], b = tris[q + 1], cc = tris[q + 2]; if (c[a] + c[b] + c[cc] > 0.02 && head[a] > 0.3) T.push(a, b, cc); }
  const src = [...new Set(T)], idxOf = new Map(src.map((v, i) => [v, i])), nS = src.length, L = K.layers;
  // texture: per texel of the shells' source triangles, its 3D position -> a clump
  const S = K.S, tex = Buffer.alloc(S * S * 4), uvS = (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S];
  const cellOf = (x, y, z) => { const g = K.cell, ix = Math.floor(x / g), iy = Math.floor(y / g), iz = Math.floor(z / g); let best = 1e9, id = 0, sec = 1e9;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const cx = ix + dx, cy = iy + dy, cz = iz + dz, fx = (cx + h3(cx, cy, cz)) * g, fy = (cy + h3(cy, cz, cx + 9)) * g, fz = (cz + h3(cz + 3, cx, cy)) * g, d = (x - fx) ** 2 + (y - fy) ** 2 + (z - fz) ** 2;
      if (d < best) { sec = best; best = d; id = h3(cx * 7 + 1, cy * 13 + 2, cz * 3 + 5); } else if (d < sec) sec = d; }
    return { r: Math.sqrt(best) / g, edge: (Math.sqrt(sec) - Math.sqrt(best)) / g, id }; };
  let texels = 0; const covT = new Float32Array(S * S).fill(-1);
  const enc = (l) => Math.round(255 * Math.pow(clamp(l), 1 / 2.2)), lin = (x) => Math.pow(x / 255, 2.2);
  raster(T, uvS, S, (x, y, l1, l2, l3, a, b, cc) => { const i = y * S + x; if (covT[i] >= 0) return;
    const X = l1 * p[a * 3] + l2 * p[b * 3] + l3 * p[cc * 3], Y = l1 * p[a * 3 + 1] + l2 * p[b * 3 + 1] + l3 * p[cc * 3 + 1], Z = l1 * p[a * 3 + 2] + l2 * p[b * 3 + 2] + l3 * p[cc * 3 + 2];
    const cv = l1 * c[a] + l2 * c[b] + l3 * c[cc]; covT[i] = cv; texels++;
    const { r, edge, id } = cellOf(X, Y, Z), grain = h3(Math.floor(X * 6000), Math.floor(Y * 6000), Math.floor(Z * 6000)), str = fbm(X, Y, Z, 1400, 2);
    // the clump's height: a dome from the centre, gaps along the cells' borders, broken into strands by the grain
    let hgt = (0.55 + 0.45 * id) * (1 - Math.pow(Math.min(1, r * 1.05), 2)) * sm(0.02, 0.16, edge);
    hgt *= 0.62 + 0.38 * sm(0.3, 0.7, str) + 0.18 * (grain - 0.5); hgt *= sm(0.05, 0.4, cv);
    // (pass 3: the front edge's band thinned to sparse clumps, a soft transition; the curls' crowns lifted in tone so
    // the top keeps its coil under a key light instead of reading as one dark mass)
    const frT = K.front * sm(0.06, 0.1, Z) * sm(1.76, 1.8, Y); if (frT > 0) hgt *= 1 - frT * sm(0.75, 0.2, cv) * (0.55 + 0.45 * sm(0.45, 0.6, id));
    const al = hgt > 0.04 ? 0.5 + 0.5 * clamp(hgt) : 0;
    // colour: dark brown, the clump's top warmer and lighter, per-clump tone, strand grain
    const tone = 0.82 + 0.36 * id, hi = sm(0.4, 0.95, hgt) * (0.6 + 0.4 * str), base = [lin(K.base[0]), lin(K.base[1]), lin(K.base[2])], tip = [lin(K.tip[0]), lin(K.tip[1]), lin(K.tip[2])];
    const g2 = (0.9 + 0.2 * grain) * tone; const o = i * 4;
    for (let k = 0; k < 3; k++) tex[o + k] = enc((base[k] * (1 - hi) + tip[k] * hi) * g2);
    tex[o + 3] = Math.round(255 * al); }, 0.04);
  // (bleed the drawn texels' colour 3 px into the empty ones round them, alpha 0, so mip/filtering does not pull in black)
  // (the islands' borders, the head's midline seam among them, grown 6 px: colour, alpha (the first 3 px) and coverage,
  // so the filtered texture does not pull in empty texels there: they drew a light line down the middle of the scalp)
  for (let it = 0; it < 6; it++) { const prev = Buffer.from(tex), pc = Float32Array.from(covT); for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) { const i = y * S + x; if (pc[i] >= 0) continue; for (const j of [i - 1, i + 1, i - S, i + S]) if (pc[j] >= 0) { for (let k = 0; k < 3; k++) tex[i * 4 + k] = prev[j * 4 + k]; tex[i * 4 + 3] = it < 3 ? prev[j * 4 + 3] : 0; covT[i] = pc[j]; break; } } }
  // the scalp under it: the skin texture's texels with coverage painted the root colour, with a grain
  let painted = 0; for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) { const ti = Math.floor((y * S) / SW) * S + Math.floor((x * S) / SW), cv = covT[ti]; if (!(cv > 0)) continue;
    const i = (y * SW + x) * 4, t = sm(0.0, 0.5, cv), gr = 0.8 + 0.4 * h3(x, y, 77), root = [26 * gr, 19 * gr, 15 * gr];
    for (let k = 0; k < 3; k++) sk[i + k] = Math.round(sk[i + k] * (1 - t) + root[k] * t); painted++; }
  // (the atlas's empty background (one flat tan) round the scalp's island painted the root colour too, 32 px out: at a
  // distance the mip levels mixed it in along the island's edge, the head's back midline, as a light parting line)
  { const bg = [sk[(2 * SW + 2) * 4], sk[(2 * SW + 2) * 4 + 1], sk[(2 * SW + 2) * 4 + 2]], isBg = (i) => Math.abs(sk[i * 4] - bg[0]) + Math.abs(sk[i * 4 + 1] - bg[1]) + Math.abs(sk[i * 4 + 2] - bg[2]) < 10;
    let front = []; for (let y = 1; y < SW - 1; y++) for (let x = 1; x < SW - 1; x++) { const i = y * SW + x, ti = Math.floor((y * S) / SW) * S + Math.floor((x * S) / SW); if (covT[ti] > 0.3) front.push(i); }
    const done = new Uint8Array(SW * SW); for (const i of front) done[i] = 1; let grown = 0;
    for (let it = 0; it < 32 && front.length; it++) { const nx = []; for (const i of front) for (const j of [i - 1, i + 1, i - SW, i + SW]) { if (done[j] || !isBg(j)) continue; done[j] = 1; for (let k = 0; k < 3; k++) sk[j * 4 + k] = [26, 19, 15][k]; nx.push(j); grown++; } front = nx; }
    console.log('scalp paint grown into the background', grown); }
  await setWebp(skinTex, sk, SW, SW, 90);
  // geometry: L layers, each nS points
  const J = B.sk.getAttribute('JOINTS_0'), W = B.sk.getAttribute('WEIGHTS_0'), Ja = J.getArray(), Wa = W.getArray();
  const nP = nS * L, P = new Float32Array(nP * 3), Nn = new Float32Array(nP * 3), U = new Float32Array(nP * 2), C = new Float32Array(nP * 4), JJ = new Ja.constructor(nP * 4), WW = new Wa.constructor(nP * 4);
  // (uv per mm, for the swirl: the local scale from a scalp triangle)
  let mpt = 0, mn = 0; for (let q = 0; q < T.length && mn < 200; q += 3) { const [a, b] = [T[q], T[q + 1]], d3 = Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]), du = Math.hypot(uv[a * 2] - uv[b * 2], uv[a * 2 + 1] - uv[b * 2 + 1]); if (du > 1e-6) { mpt += d3 / du; mn++; } }
  mpt /= mn; const swirlUv = (K.swirl * K.cell) / mpt; console.log('hair shells: scalp metres per uv', mpt.toFixed(3), '(texel mm', ((mpt / S) * 1000).toFixed(2) + ')', 'texels', texels, 'scalp painted', painted);
  for (let k = 0; k < L; k++) { const t = (k + 1) / L, hk = (k + 0.6) / (L + 0.2), ca = 1 / (1 + hk), shade = 0.5 + 0.5 * Math.pow(t, 0.8), ang = k * 1.1;
    for (let i = 0; i < nS; i++) { const v = src[i], o = k * nS + i, d = depth[v] * t;
      for (let q = 0; q < 3; q++) { P[o * 3 + q] = p[v * 3 + q] + N[v * 3 + q] * d; Nn[o * 3 + q] = N[v * 3 + q]; }
      U[o * 2] = uv[v * 2] + swirlUv * Math.cos(ang) * (k ? 1 : 0); U[o * 2 + 1] = uv[v * 2 + 1] + swirlUv * Math.sin(ang) * (k ? 1 : 0);
      C[o * 4] = C[o * 4 + 1] = C[o * 4 + 2] = shade; C[o * 4 + 3] = ca;
      for (let q = 0; q < 4; q++) { JJ[o * 4 + q] = Ja[v * 4 + q]; WW[o * 4 + q] = Wa[v * 4 + q]; } } }
  const I = new Uint32Array(T.length * L); for (let k = 0; k < L; k++) for (let q = 0; q < T.length; q++) I[k * T.length + q] = k * nS + idxOf.get(T[q]);
  // the hair mesh: its card primitive out (and the points it alone used dropped from the shared set), the shells in
  const old = prim(doc, 'hair')[0], mesh = R.listMeshes().find((m) => m.listPrimitives().includes(old)), buf = R.listBuffers()[0], mat = matOf(doc, 'hair');
  const acc = (type, arr, norm = false) => doc.createAccessor().setType(type).setArray(arr).setNormalized(norm).setBuffer(buf);
  const sp = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', nP > 65535 ? I : Uint16Array.from(I)))
    .setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', Nn)).setAttribute('TEXCOORD_0', acc('VEC2', U))
    .setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW, W.getNormalized())).setAttribute('COLOR_0', acc('VEC4', C));
  mesh.removePrimitive(old); mesh.addPrimitive(sp);
  const ht = doc.createTexture('hair-shells'); await setWebp(ht, tex, S, S, 86); ht.setMimeType('image/webp');
  const oldN = mat.getNormalTexture(), oldB = mat.getBaseColorTexture();
  mat.getExtension('KHR_materials_specular')?.setSpecularFactor(0.3); mat.setBaseColorTexture(ht).setNormalTexture(null).setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(false).setRoughnessFactor(K.rough ?? 0.58);
  for (const t of [oldN, oldB]) if (t && !t.listParents().some((x) => x !== R)) t.dispose();
  // the clothes' points: the card mop shared them (hair 3962 = clothes 3962): compact the clothes to their own
  compactPrim(doc, prim(doc, 'clothes')[0]);
  console.log('hair shells', L, 'x', T.length / 3, 'tris =', (I.length / 3), 'points', nP);
  return { c, depth };
}
export function compactPrim(doc, p) {
  const idx = p.getIndices(), ia = idx.getArray(), map = new Int32Array(p.getAttribute('POSITION').getCount()).fill(-1), order = [];
  for (const v of ia) if (map[v] < 0) { map[v] = order.length; order.push(v); }
  if (order.length === map.length) return;
  for (const sem of p.listSemantics()) { const a = p.getAttribute(sem), arr = a.getArray(), n = a.getElementSize(), na = new arr.constructor(order.length * n);
    order.forEach((v, i) => { for (let k = 0; k < n; k++) na[i * n + k] = arr[v * n + k]; }); p.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(na).setNormalized(a.getNormalized()).setBuffer(a.getBuffer())); }
  const ni = order.length > 65535 ? new Uint32Array(ia.length) : new Uint16Array(ia.length); for (let i = 0; i < ia.length; i++) ni[i] = map[ia[i]];
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(ni).setBuffer(idx.getBuffer())); console.log('compacted', p.getMaterial()?.getName(), map.length, '->', order.length);
}
