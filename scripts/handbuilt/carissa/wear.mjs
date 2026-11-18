// Hand-built Carissa, what she wears over the forged knit top, jeans and boots.
//  jacket   a camel wool jacket made from the knit top itself (the forge's coats lose their body on a woman: only the
//           sleeves and a yoke come out): the top's mesh subdivided once, pushed out along its normals (8 mm on the body,
//           6 mm on the sleeves), its front hung straight down from the bust (a jacket bridges, it does not shrink-wrap),
//           cut open down the front on a smooth line (a V to the bust, then straight, slightly apart), with a lapel laid
//           on each front edge (wide at the neck, gone at the break), a rolled collar at the back of the neck, and a
//           4 mm turned edge at every cut (front, hem, cuffs) so no edge reads paper-thin. Skinned exactly as the top.
//           Its cloth painted from the texel's place on her: a heathered camel twill, top-stitching 7 mm in from the
//           front edge and the hem, two flap pockets at the hips; a matching normal map and a matte roughness.
//  knit     the top (cream) as a fine rib knit: vertical ribs in colour and a normal map, a little heather
//  earrings small gold hoops at the lobes, on the head bone
//  boots    the work boots as dark-brown leather ankle boots: darker, smoother, a soft sheen; the laces dyed to match
import { body, prim, matOf, raster, rgba, setWebp, sharp, sm, h3, fbm, THREE, clamp } from '../young-hero/glb.mjs';

const topPrim = (doc) => prim(doc, 'clothes').map((p) => { const a = p.getAttribute('POSITION').getArray(), ix = p.getIndices().getArray(); let my = -9; for (const v of ix) my = Math.max(my, a[v * 3 + 1]); return { p, my }; }).sort((a, b) => b.my - a.my)[0].p;
// texel positions of a primitive's uv layout
function texPos(p, S, attrs = ['POSITION']) {
  const A = attrs.map((n) => p.getAttribute(n).getArray()), uv = p.getAttribute('TEXCOORD_0').getArray(), idx = [...p.getIndices().getArray()], out = A.map(() => new Float32Array(S * S * 3).fill(NaN));
  raster(idx, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, i0, i1, i2) => { const k = (y * S + x) * 3; A.forEach((a, j) => { for (let c = 0; c < 3; c++) out[j][k + c] = l1 * a[i0 * 3 + c] + l2 * a[i1 * 3 + c] + l3 * a[i2 * 3 + c]; }); }, 0.03);
  return out;
}
const toNormalMap = async (hgt, S, K2) => { const nm = Buffer.alloc(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, hx = (hgt[y * S + Math.min(S - 1, x + 1)] - hgt[y * S + Math.max(0, x - 1)]) / 2, hy = (hgt[Math.min(S - 1, y + 1) * S + x] - hgt[Math.max(0, y - 1) * S + x]) / 2;
    const nx = -hx * K2, ny = hy * K2, l = Math.hypot(nx, ny, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  return sharp(nm, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 88, effort: 5 }).toBuffer(); };

// the front opening's half-width at height y (a V from the neck to the bust's break, then straight and a little apart)
export const OPEN = (y) => y > 1.17 ? 0.024 + (0.07 - 0.024) * sm(1.17, 1.43, y) : 0.024 + 0.008 * sm(1.17, 0.93, y);
// the lapel's outer edge (|x|): its width over the opening edge, wide at the neck, nothing at the break
const LAPEL = (y) => OPEN(y) + 0.05 * sm(1.17, 1.34, y) * (1 - 0.7 * sm(1.36, 1.4, y));

export async function jacketPass(doc, K = {}) {
  K = { off: 0.0105, collar: false, offArm: 0.006, col: [44, 48, 32], edge: 0.004, ...K };
  const T = topPrim(doc), B = body(doc), R = doc.getRoot(), buf = R.listBuffers()[0];
  const mesh = R.listMeshes().find((m) => m.listPrimitives().includes(T));
  const sP = T.getAttribute('POSITION').getArray(), sN = T.getAttribute('NORMAL').getArray(), sNn = T.getAttribute('NORMAL').getNormalized(), sU = T.getAttribute('TEXCOORD_0').getArray(), sJ = T.getAttribute('JOINTS_0').getArray(), sW = T.getAttribute('WEIGHTS_0').getArray(), wNorm = T.getAttribute('WEIGHTS_0').getNormalized();
  const nsc = sNn ? (sN instanceof Int8Array ? 127 : 32767) : 1, wsc = wNorm ? (sW instanceof Uint8Array ? 255 : 65535) : 1;
  // compact the top's used vertices into a working set
  const used = [...new Set(T.getIndices().getArray())], map = new Map(used.map((v, i) => [v, i]));
  let V = used.map((v) => ({ p: [sP[v * 3], sP[v * 3 + 1], sP[v * 3 + 2]], n: [sN[v * 3] / nsc, sN[v * 3 + 1] / nsc, sN[v * 3 + 2] / nsc], uv: [sU[v * 2], sU[v * 2 + 1]], w: Object.fromEntries([0, 1, 2, 3].filter((k) => sW[v * 4 + k] > 0).map((k) => [sJ[v * 4 + k], sW[v * 4 + k] / wsc])), g: [sP[v * 3], sP[v * 3 + 1], sP[v * 3 + 2]].map((x) => Math.round(x * 2e4)).join('_') }));
  // (the top's uv seams split its points: one group per place, so the cut, the edges and the offset see one surface)
  { const gn = new Map(); for (const v of V) { const n = gn.get(v.g) || [0, 0, 0]; for (let k = 0; k < 3; k++) n[k] += v.n[k]; gn.set(v.g, n); } for (const v of V) v.n = gn.get(v.g).slice(); }
  let F = []; const ix = T.getIndices().getArray(); for (let q = 0; q < ix.length; q += 3) F.push([map.get(ix[q]), map.get(ix[q + 1]), map.get(ix[q + 2])]);
  // subdivide once (midpoints), positions/normals/uvs/weights averaged
  const mid = (a, b) => ({ p: a.p.map((x, k) => (x + b.p[k]) / 2), n: a.n.map((x, k) => (x + b.n[k]) / 2), uv: a.uv.map((x, k) => (x + b.uv[k]) / 2), g: [a.g, b.g].sort().join('|'), w: (() => { const w = {}; for (const [j, x] of Object.entries(a.w)) w[j] = (w[j] || 0) + x / 2; for (const [j, x] of Object.entries(b.w)) w[j] = (w[j] || 0) + x / 2; return w; })() });
  const sub = () => { const em = new Map(), NF = []; const e = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!em.has(k)) { em.set(k, V.length); V.push(mid(V[a], V[b])); } return em.get(k); };
    for (const [a, b, c] of F) { const ab = e(a, b), bc = e(b, c), ca = e(c, a); NF.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); } F = NF; };
  sub();
  const armJ = new Set(B.names.map((n, i) => (/^(upperarm|lowerarm|wrist)/.test(n) ? i : -1)).filter((i) => i >= 0));
  const armW = (v) => Object.entries(v.w).reduce((s, [j, x]) => s + (armJ.has(+j) ? x : 0), 0);
  // offset along the normal
  for (const v of V) { const l = Math.hypot(...v.n) || 1; v.n = v.n.map((x) => x / l); const o = K.off + (K.offArm - K.off) * sm(0.3, 0.8, armW(v)); v.p = v.p.map((x, k) => x + v.n[k] * o); }
  // the front hung from the bust: below the apex, front points not behind the line from the apex down (a slight fall)
  let apex = { y: 1.2, z: 0 }; for (const v of V) { const x = Math.abs(v.p[0]); if (x > 0.04 && x < 0.13 && v.p[1] > 1.1 && v.p[1] < 1.32 && v.p[2] > apex.z && armW(v) < 0.2) apex = { y: v.p[1], z: v.p[2], x }; }
  let hung = 0; for (const v of V) { const x = Math.abs(v.p[0]); if (v.p[1] >= apex.y || v.p[2] < 0.02 || armW(v) > 0.2) continue; const band = 1 - sm(0.13, 0.17, x);
    const zl = apex.z - (apex.y - v.p[1]) * 0.12 - 0.012 * sm(0.07, 0.15, x), d = zl - v.p[2]; if (d > 0) { v.p[2] += d * band; hung++; } }
  // smooth the body's surface a little (a jacket is stiffer than a knit): 3 Laplacian passes away from the sleeves
  const nb = new Map(), gp = new Map(); for (const v of V) gp.set(v.g, v.p); for (const [a, b, c] of F) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const ga = V[p].g, gb = V[q].g; if (!nb.has(ga)) nb.set(ga, new Set()); if (!nb.has(gb)) nb.set(gb, new Set()); nb.get(ga).add(gb); nb.get(gb).add(ga); }
  const gArm = new Map(); for (const v of V) gArm.set(v.g, armW(v));
  for (let it = 0; it < 3; it++) { const np = new Map(); for (const [g, p] of gp) { if (gArm.get(g) > 0.4) { np.set(g, p); continue; } const S = [0, 0, 0], L = nb.get(g); for (const h of L) for (let k = 0; k < 3; k++) S[k] += gp.get(h)[k]; np.set(g, p.map((x, k) => x * 0.6 + (S[k] / L.size) * 0.4)); } for (const [g, p] of np) gp.set(g, p); }
  for (const v of V) v.p = gp.get(v.g).slice();
  // re-push outward so the smoothing never sinks into the knit (at least K.off * 0.7 from the source surface along the normal)
  // (cheap: the smoothing moved points < 3 mm; the 8.5 mm offset leaves room)
  // the front opening cut: drop front triangles inside OPEN(y), then snap the cut's points onto the line
  const isFront = (v) => v.p[2] > 0.02 && armW(v) < 0.3;
  const cutF = [], gone = new Set(); F.forEach((f, i) => { const c = [0, 1, 2].map((k) => (V[f[0]].p[k] + V[f[1]].p[k] + V[f[2]].p[k]) / 3); if (c[2] > 0.03 && Math.abs(c[0]) < OPEN(c[1]) && f.every((j) => isFront(V[j]))) gone.add(i); else cutF.push(f); });
  F = cutF;
  const edgeCount = new Map(); const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a), gk = (a, b) => { const x = V[a].g, y = V[b].g; return x < y ? x + '#' + y : y + '#' + x; };
  // (open edges found by place, returned as vertex pairs from the faces)
  let open = []; const countEdges = () => { edgeCount.clear(); for (const [a, b, c] of F) for (const [p, q] of [[a, b], [b, c], [c, a]]) edgeCount.set(gk(p, q), (edgeCount.get(gk(p, q)) || 0) + 1);
    open = []; for (const [a, b, c] of F) for (const [p, q] of [[a, b], [b, c], [c, a]]) if (edgeCount.get(gk(p, q)) === 1) open.push([p, q]); };
  countEdges(); const bnd = new Set(); for (const [a, b] of open) bnd.add(a).add(b);
  let snapped = 0; for (const j of bnd) { const v = V[j]; if (!isFront(v) || v.p[2] < 0.03) continue; const x = Math.abs(v.p[0]), w = OPEN(v.p[1]); if (Math.abs(x - w) < 0.03) { v.p[0] = Math.sign(v.p[0] || 1) * w; snapped++; } }
  // the lapels: the front strip from the edge to LAPEL(y) copied 3 mm out, its outer edge snapped to the line
  const lap = []; const lapMap = new Map(); const addLap = (j) => { if (!lapMap.has(j)) { const v = V[j]; lapMap.set(j, V.length); V.push({ p: v.p.map((x, k) => x + v.n[k] * 0.003), n: v.n.slice(), uv: v.uv.slice(), w: { ...v.w }, g: 'L' + v.g }); } return lapMap.get(j); };
  for (const f of F) { const c = [0, 1, 2].map((k) => (V[f[0]].p[k] + V[f[1]].p[k] + V[f[2]].p[k]) / 3); if (c[1] < 1.17 || c[1] > 1.37 || c[2] < 0.03) continue; const x = Math.abs(c[0]); if (x < LAPEL(c[1]) + 0.02 && f.every((j) => isFront(V[j]))) lap.push(f.map(addLap)); }
  const lapEdges = new Map(); for (const [a, b, c] of lap) for (const [p, q] of [[a, b], [b, c], [c, a]]) lapEdges.set(gk(p, q), (lapEdges.get(gk(p, q)) || 0) + 1);
  const lapB = new Set(); for (const [a, b, c] of lap) for (const [p, q] of [[a, b], [b, c], [c, a]]) if (lapEdges.get(gk(p, q)) === 1) lapB.add(p).add(q);
  for (const j0 of new Set(lap.flat())) { const v = V[j0], x = Math.abs(v.p[0]), lw = LAPEL(v.p[1]); if (x > lw) v.p[0] = Math.sign(v.p[0]) * lw; } void lapB;
  F.push(...lap);
  // the collar: a rolled band up the back and sides of the neck from the jacket's neck edge (not in the front opening)
  countEdges(); const neckE = []; for (const [a, b] of open) { const ya = V[a].p[1], yb = V[b].p[1]; if (ya > 1.36 && yb > 1.36 && !(V[a].p[2] > 0.03 && Math.abs(V[a].p[0]) < OPEN(ya) + 0.025)) neckE.push([a, b]); }
  const up = new Map(); const upOf = (j) => { if (!up.has(j)) { const v = V[j], r = Math.hypot(v.p[0], v.p[2] - 0.0) || 1; up.set(j, V.length); V.push({ p: [v.p[0] + (v.p[0] / r) * 0.004, v.p[1] + 0.018, v.p[2] + ((v.p[2]) / r) * 0.004], n: v.n.slice(), uv: v.uv.slice(), w: { ...v.w }, g: 'C' + v.g }); } return up.get(j); };
  if (K.collar) for (const [a, b] of neckE) { const ua = upOf(a), ub = upOf(b); F.push([a, b, ub], [a, ub, ua]); }
  // the turned edge: every open edge (not the collar's top) given a 4 mm return inward
  countEdges(); const ret = new Map(); const retOf = (j) => { if (!ret.has(j)) { const v = V[j]; ret.set(j, V.length); V.push({ p: v.p.map((x, k) => x - v.n[k] * K.edge), n: v.n.map((x) => -x), uv: v.uv.slice(), w: { ...v.w }, g: 'R' + v.g }); } return ret.get(j); };
  const collarTop = new Set(up.values()); let edges = 0;
  for (const [a, b] of open) { if ((collarTop.has(a) && collarTop.has(b)) || (V[a].g[0] === 'L' && V[b].g[0] === 'L')) continue; const ra = retOf(a), rb = retOf(b); F.push([a, ra, rb], [a, rb, b]); edges++; }
  // normals from the final faces (smooth, area-weighted)
  const N = V.map(() => [0, 0, 0]); for (const [a, b, c] of F) { const A = new THREE.Vector3(...V[a].p), Bv = new THREE.Vector3(...V[b].p), C = new THREE.Vector3(...V[c].p), n = Bv.sub(A).cross(C.sub(A)); for (const j of [a, b, c]) { N[j][0] += n.x; N[j][1] += n.y; N[j][2] += n.z; } }
  // (the source normal decides the side: a face normal that disagrees with it is flipped by the double-sided material)
  // build the primitive
  const nV = V.length, P = new Float32Array(nV * 3), Nn = new Float32Array(nV * 3), U = new Float32Array(nV * 2), JJ = new Uint16Array(nV * 4), WW = new Float32Array(nV * 4);
  V.forEach((v, i) => { P.set(v.p, i * 3); let n = N[i]; const l = Math.hypot(...n); n = l > 1e-12 ? n.map((x) => x / l) : v.n; if (n[0] * v.n[0] + n[1] * v.n[1] + n[2] * v.n[2] < 0) n = n.map((x) => -x); Nn.set(n, i * 3); U.set(v.uv, i * 2);
    const top = Object.entries(v.w).sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((t, [, x]) => t + x, 0) || 1; top.forEach(([j, x], k) => { JJ[i * 4 + k] = +j; WW[i * 4 + k] = x / s; }); });
  if (!P.every(Number.isFinite)) throw new Error('jacket: a non-finite position');
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('jacket').setDoubleSided(true).setRoughnessFactor(1).setMetallicFactor(0);
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(F.flat()))).setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', Nn))
    .setAttribute('TEXCOORD_0', acc('VEC2', U)).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW));
  mesh.addPrimitive(p);
  await paintCloth(doc, p, mat, K, 'jacket');
  console.log('jacket: apex', apex, 'hung', hung, 'cut', gone.size, 'snapped', snapped, 'lapel tris', lap.length, 'collar edges', neckE.length, 'turned edges', edges, 'verts', nV, 'tris', F.length);
  if (K.sleeves !== false) await sleevesPass(doc, p, mesh, K);
}
// the cloth, painted from each texel's place
async function paintCloth(doc, p, mat, K, name, S = 1024) {
  const [pos] = texPos(p, S), img = Buffer.alloc(S * S * 3), hgt = new Float32Array(S * S), rough = Buffer.alloc(S * S * 3);
  const lin = (c) => (c / 255) ** 2.2, enc = (l) => Math.round(255 * Math.min(1, Math.max(0, l)) ** (1 / 2.2)), base = K.col.map(lin);
  for (let i = 0; i < S * S; i++) { let x0 = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(x0)) { x0 = 0; y = 1.2; z = 0; }
    const x = Math.abs(x0), tw = Math.sin(((x0 * 0.8 + y) / 0.0024) * Math.PI * 2), heather = 0.5 * (h3(Math.floor(x0 * 3000), Math.floor(y * 3000), Math.floor(z * 3000)) - 0.5) + (h3(Math.floor(x0 * 900), Math.floor(y * 1400), Math.floor(z * 900) + 7) - 0.5), mot = fbm(x0, y, z, 14) - 0.5;
    let k = 1 + 0.035 * tw + 0.07 * heather + 0.1 * mot, hh = 0.25 * tw + 0.2 * heather;
    // top-stitching: 7 mm in from the front edge (and the lapel's edge) and 12 mm over the hem
    const front = z > 0.03 ? 1 : 0, dE = Math.abs(x - OPEN(y)), st = front * Math.exp(-(((dE - 0.007) / 0.0006) ** 2)) * (y < 1.42 ? 1 : 0) * (h3(Math.floor(y * 400), 2, 3) > 0.25 ? 1 : 0);
    const hemY = 0.935, st2 = Math.exp(-(((y - (hemY + 0.012)) / 0.0006) ** 2)) * (h3(Math.floor((x0 + z) * 400), 4, 5) > 0.25 ? 1 : 0);
    const stitch = Math.max(st, st2); k *= 1 - 0.3 * stitch; hh -= 1.5 * Math.max(st, st2);
    // flap pockets at the hips: a flap 13 x 4.5 cm with its edge shadowed, x 0.06-0.19, y 1.0-1.045
    const px = x - 0.125, pf = front * (1 - sm(0.063, 0.066, Math.abs(px))) * sm(0.996, 0.999, y) * (1 - sm(1.042, 1.045, y)), lip = front * (1 - sm(0.063, 0.066, Math.abs(px))) * Math.exp(-(((y - 0.998) / 0.0018) ** 2));
    k *= 1 - 0.28 * lip; hh += 0.8 * pf - 1.2 * lip;
    // a soft darker inside (the turned edge and lining read darker)
    for (let c = 0; c < 3; c++) img[i * 3 + c] = enc(base[c] * k);
    hgt[i] = hh; rough[i * 3] = 255; rough[i * 3 + 1] = Math.round(255 * (0.8 + 0.06 * heather)); rough[i * 3 + 2] = 0; }
  const t = doc.createTexture(name); t.setImage(await sharp(img, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 86, effort: 5 }).toBuffer()).setMimeType('image/webp'); mat.setBaseColorTexture(t);
  const nt = doc.createTexture(name + '-normal'); nt.setImage(await toNormalMap(hgt, S, 0.45)).setMimeType('image/webp'); mat.setNormalTexture(nt);
  const rt = doc.createTexture(name + '-mr'); rt.setImage(await sharp(rough, { raw: { width: S, height: S, channels: 3 } }).resize(512, 512).webp({ quality: 85 }).toBuffer()).setMimeType('image/webp'); mat.setMetallicRoughnessTexture(rt);
}

// the sleeves: the forged top is short-sleeved, so the jacket's arms come from the forge's overcoat on the same body
// (forged-coat.glb, the same sheet with an overcoat: its sleeves and shoulder caps come out clean, only its body is
// lost). Its triangles outside the shoulder line (|x| > K.cap) copied, re-skinned by joint name; the jacket's own short
// sleeves cut away beyond K.cap + 2 cm (the two overlap over the shoulder so no gap shows); a turned edge at the cuff.
async function sleevesPass(doc, jp, mesh, K) {
  K = { cap: 0.145, cutArm: 2, ...K };
  const { read } = await import('../young-hero/glb.mjs');
  const C = (await read(new URL('../../../storykit/handbuilt/carissa/forged-coat.glb', import.meta.url).pathname)).doc;
  const cp = prim(C, 'overcoat')[0], cn = body(C).names, B = body(doc), names = B.names;
  const cP = cp.getAttribute('POSITION').getArray(), cN = cp.getAttribute('NORMAL'), cNa = cN.getArray(), ns = cN.getNormalized() ? (cNa instanceof Int8Array ? 127 : 32767) : 1, cU = cp.getAttribute('TEXCOORD_0').getArray(), cJ = cp.getAttribute('JOINTS_0').getArray(), cWa = cp.getAttribute('WEIGHTS_0'), cW = cWa.getArray(), wsc = cWa.getNormalized() ? (cW instanceof Uint8Array ? 255 : 65535) : 1;
  const ix = cp.getIndices().getArray(), keep = [], vm = new Map();
  const armSet = new Set(cn.map((n, i) => (/^(upperarm|lowerarm|wrist|shoulder)/.test(n) ? i : -1)).filter((i) => i >= 0)), cArm = (v) => { let s = 0; for (let k = 0; k < 4; k++) if (armSet.has(cJ[v * 4 + k])) s += cW[v * 4 + k] / wsc; return s; };
  for (let q = 0; q < ix.length; q += 3) { const t = [ix[q], ix[q + 1], ix[q + 2]]; if (t.every((v) => Math.abs(cP[v * 3]) > K.cap || cArm(v) > 0.35)) keep.push(t); }
  const nV0 = new Set(keep.flat()).size; const P = [], N = [], U = [], J = [], W = [], I = [];
  const id = (v) => { if (!vm.has(v)) { vm.set(v, P.length / 3); P.push(cP[v * 3], cP[v * 3 + 1], cP[v * 3 + 2]); N.push(cNa[v * 3] / ns, cNa[v * 3 + 1] / ns, cNa[v * 3 + 2] / ns); U.push(cU[v * 2], cU[v * 2 + 1]);
    for (let k = 0; k < 4; k++) { J.push(Math.max(0, names.indexOf(cn[cJ[v * 4 + k]]))); W.push(cW[v * 4 + k] / wsc); } } return vm.get(v); };
  for (const t of keep) I.push(...t.map(id));
  const buf = doc.getRoot().listBuffers()[0], acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('jacket-sleeves').setDoubleSided(true).setRoughnessFactor(1).setMetallicFactor(0);
  const sp = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint32Array.from(I))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(N)))
    .setAttribute('TEXCOORD_0', acc('VEC2', Float32Array.from(U))).setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(J))).setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(W)));
  mesh.addPrimitive(sp); await paintCloth(doc, sp, mat, K, 'jacket-sleeves', 512);
  // the jacket's own short sleeves cut away past the overlap
  const a = jp.getAttribute('POSITION').getArray(), jx = jp.getIndices().getArray(), out = [], jJ = jp.getAttribute('JOINTS_0').getArray(), jW = jp.getAttribute('WEIGHTS_0').getArray(), aSet = new Set(names.map((n, i) => (/^(upperarm|lowerarm|wrist)/.test(n) ? i : -1)).filter((i) => i >= 0));
  const jArm = (v) => { let s = 0; for (let k = 0; k < 4; k++) if (aSet.has(jJ[v * 4 + k])) s += jW[v * 4 + k]; return s; };
  for (let q = 0; q < jx.length; q += 3) { const t = [jx[q], jx[q + 1], jx[q + 2]]; if (t.every((v) => Math.abs(a[v * 3]) > K.cap + 0.05 && jArm(v) > K.cutArm)) continue; out.push(...t); }
  jp.getIndices().setArray(Uint32Array.from(out));
  console.log('sleeves: coat triangles', keep.length, 'points', nV0, 'jacket triangles kept', out.length / 3);
}

// the knit tucked 3 mm in wherever the jacket covers it (it showed through the jacket's front at the hip in 3/4)
export function knitTuckPass(doc, K = {}) {
  K = { d: 0.005, arm: 0.3, ...K };
  const T = topPrim(doc), A = T.getAttribute('POSITION'), a = A.getArray().slice(), N = T.getAttribute('NORMAL'), n = N.getArray(), ns = N.getNormalized() ? (n instanceof Int8Array ? 127 : 32767) : 1; let m = 0;
  for (const v of new Set(T.getIndices().getArray())) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1], z = a[v * 3 + 2]; const cov = z < 0.02 || x > OPEN(y) + 0.012 ? 1 : sm(OPEN(y) + 0.004, OPEN(y) + 0.012, x); if (cov <= 0 || y > 1.36) continue;
    const dd = K.d + 0.014 * sm(0.08, 0.12, x) * sm(1.05, 1.12, y); for (let k = 0; k < 3; k++) a[v * 3 + k] -= (n[v * 3 + k] / ns) * dd * cov; m++; }
  A.setArray(a);
  // (its short sleeves dropped: the jacket's sleeves cover the whole arm, and the knit's sleeve hem poked through them
  // at the armpit as a white shard)
  const B = body(doc), arm = new Set(B.names.map((nm, i) => (/^(upperarm|lowerarm|shoulder)/.test(nm) ? i : -1)).filter((i) => i >= 0)), J = T.getAttribute('JOINTS_0').getArray(), W = T.getAttribute('WEIGHTS_0').getArray(), wn = T.getAttribute('WEIGHTS_0').getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1;
  const aw = (v) => { let s = 0; for (let k = 0; k < 4; k++) if (arm.has(J[v * 4 + k])) s += W[v * 4 + k] / wn; return s; };
  const ix = T.getIndices().getArray(), keep = []; for (let q = 0; q < ix.length; q += 3) { const t = [ix[q], ix[q + 1], ix[q + 2]]; if (t.every((v) => aw(v) > K.arm)) continue; keep.push(...t); }
  T.getIndices().setArray(new ix.constructor(keep)); console.log('knit tucked', m, 'sleeve triangles dropped', ix.length / 3 - keep.length / 3);
}
export async function knitPass(doc, K = {}) {
  K = { col: [206, 194, 176], ...K };
  const T = topPrim(doc), mat = T.getMaterial(), tex = mat.getBaseColorTexture(), img = await rgba(tex), S = img.w, [pos] = texPos(T, S);
  const lin = (c) => (c / 255) ** 2.2, enc = (l) => Math.round(255 * Math.min(1, Math.max(0, l)) ** (1 / 2.2));
  // (the top's own shading kept as a gain about its mean: folds stay)
  let m = 0, n = 0; for (let i = 0; i < S * S; i++) if (!Number.isNaN(pos[i * 3])) { m += (img.data[i * 4] + img.data[i * 4 + 1] + img.data[i * 4 + 2]) / 3; n++; } m /= Math.max(1, n);
  for (let i = 0; i < S * S; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(x)) continue;
    const L = (img.data[i * 4] + img.data[i * 4 + 1] + img.data[i * 4 + 2]) / 3, sh = Math.pow(Math.max(0.3, Math.min(1.4, L / m)), 0.7);
    const ang = Math.atan2(x, z), rib = Math.sin(ang * 260) * 0.5 + Math.sin((x + z) / 0.0016) * 0.0, he = h3(Math.floor(x * 2500), Math.floor(y * 2500), Math.floor(z * 2500)) - 0.5;
    const k = sh * (1 + 0.05 * rib + 0.05 * he);
    // (where the jacket covers the knit, the knit is dyed the jacket's olive and darker: a gap between the jacket's body
    // and its sleeves then reads as the jacket's shade, never as a white shard)
    const hid = (z < 0.02 || Math.abs(x) > OPEN(y) + 0.02) && y < 1.37 ? 1 : 0, J = [44, 48, 32];
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = enc(lin(hid ? J[c] : K.col[c]) * (hid ? 0.7 : k)); }
  await setWebp(tex, img.data, S, S, 88); console.log('knit: texels', n);
}

export function earringsPass(doc, K = {}) {
  K = { R: 0.0055, r: 0.0007, ...K };
  const B = body(doc), p = B.pos, wH = B.wOn(/^head$/), R0 = doc.getRoot(), buf = R0.listBuffers()[0], hi = B.names.indexOf('head');
  // the lobe: the lowest outer ear point, each side
  const lobes = []; for (const s of [1, -1]) { let best = null; for (let v = 0; v < p.length / 3; v++) { if (wH[v] < 0.8) continue; const x = p[v * 3] * s, y = p[v * 3 + 1], z = p[v * 3 + 2]; if (x < 0.066 || y < 1.49 || y > 1.56 || z < -0.01 || z > 0.07) continue; if (!best || y < best[1]) best = [p[v * 3], y, z]; } lobes.push(best); }
  const P = [], Nn = [], I = []; const SEG = 24, RS = 8;
  for (const L of lobes) { if (!L) continue; const c = [L[0] + Math.sign(L[0]) * 0.0012, L[1] - K.R + 0.0012, L[2]], base = P.length / 3;
    for (let i = 0; i < SEG; i++) { const a = (i / SEG) * Math.PI * 2, cx = 0, cy = Math.cos(a) * K.R, cz = Math.sin(a) * K.R; // (the hoop in the y-z plane, along the jaw)
      for (let j = 0; j < RS; j++) { const b = (j / RS) * Math.PI * 2, n = [Math.sin(b), Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b)]; P.push(c[0] + cx + n[0] * K.r, c[1] + cy + n[1] * K.r, c[2] + cz + n[2] * K.r); Nn.push(...n); } }
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RS; j++) { const a = base + i * RS + j, b = base + ((i + 1) % SEG) * RS + j, c2 = base + ((i + 1) % SEG) * RS + ((j + 1) % RS), d = base + i * RS + ((j + 1) % RS); I.push(a, b, c2, a, c2, d); } }
  const nV = P.length / 3, JJ = new Uint16Array(nV * 4), WW = new Float32Array(nV * 4); for (let i = 0; i < nV; i++) { JJ[i * 4] = hi; WW[i * 4] = 1; }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mat = doc.createMaterial('earrings').setBaseColorFactor([0.95, 0.76, 0.42, 1]).setMetallicFactor(1).setRoughnessFactor(0.28);
  const mesh = R0.listMeshes().find((m) => m.listPrimitives().includes(B.sk));
  mesh.addPrimitive(doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint16Array.from(I))).setAttribute('POSITION', acc('VEC3', Float32Array.from(P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(Nn))).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW)));
  console.log('earrings at', JSON.stringify(lobes.map((l) => l && l.map((x) => +x.toFixed(4)))));
}

export async function bootsPass(doc, K = {}) {
  K = { col: [58, 38, 28], ...K };
  for (const m of doc.getRoot().listMaterials()) { const n = m.getName(); if (!/^work-boots/.test(n)) continue;
    const tex = m.getBaseColorTexture(); if (tex) { const { data, w, h } = await rgba(tex); let s = 0; for (let i = 0; i < w * h; i++) s += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3; s /= w * h;
      for (let i = 0; i < w * h; i++) { const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, k = Math.pow(Math.max(0.2, L / s), 0.6); for (let c = 0; c < 3; c++) data[i * 4 + c] = clamp(Math.round(K.col[c] * k * (n.endsWith('soles') ? 0.55 : 1)), 0, 255); }
      await setWebp(tex, data, w, h, 86); }
    else m.setBaseColorFactor([...K.col.map((c) => ((c / 255) ** 2.2) * (n.endsWith('soles') ? 0.5 : 1)), 1]);
    if (!n.endsWith('soles')) m.setRoughnessFactor(0.5); }
}

// the jeans darker and the wash quieter (the young hero's re-dye reads mid-blue in the sun): the lower garment's texels
// toward a deep indigo, their fold detail kept
export async function jeansDarkPass(doc, K = {}) {
  K = { k: 0.6, ...K };
  const lo = prim(doc, 'clothes').map((p) => { const a = p.getAttribute('POSITION').getArray(), ix = p.getIndices().getArray(); let my = -9; for (const v of ix) my = Math.max(my, a[v * 3 + 1]); return { p, my }; }).sort((a, b) => a.my - b.my)[0].p;
  const tex = lo.getMaterial().getBaseColorTexture(), img = await rgba(tex), S = img.w, [pos] = texPos(lo, S); let n = 0;
  for (let i = 0; i < S * S; i++) { if (Number.isNaN(pos[i * 3])) continue; const d = img.data, L = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round((d[i * 4 + c] * 0.6 + L * 0.4 * [0.82, 0.92, 1.25][c]) * K.k); n++; }
  await setWebp(tex, img.data, S, S, 88); console.log('jeans darker: texels', n);
}
