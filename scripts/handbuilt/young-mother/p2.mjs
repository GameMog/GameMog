// Hand-built young mother, pass 2 (after the pass-1 review: the front hair edge a hard horizontal shelf at
// mid-forehead, a 3.7 cm forehead that kept her young, the bust a cone with two tears, the hood rim a shelf over the
// shoulders, a round short face, short waxy hands).
import { sm } from '../young-hero/glb.mjs';
// her adult hairline (her bind frame, metres): 1.566 on the midline (the brows' top is 1.52, so a 4.6 cm forehead, was
// 3.7), rounding down 4 mm by x 3 cm and 1.1 cm by 5 cm, then down the temples in front of the ears; a little irregular
export const HL = (x0) => { const x = Math.abs(x0); return 1.566 - 0.004 * sm(0, 0.03, x) - 0.008 * sm(0.025, 0.052, x) - 0.032 * sm(0.05, 0.066, x) + 0.0016 * (noise1(x0 * 140) - 0.5) + 0.0006 * (noise1(x0 * 520 + 7) - 0.5); };
const noise1 = (t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f), hh = (k) => { let h = (k * 374761393 + 1442695041) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 0xffff) / 65535; }; return hh(i) + (hh(i + 1) - hh(i)) * u; };
// the hair mesh's front edge on it (the swept side, her right, a little lower: the sweep covers the temple's corner)
// the sneakers' uppers no longer cut (pass 1's 0.32, and even 0.6, left long edges over the toe box: it strained 1.1-2.3 mm
// in the clips against the gate's 0.25, and at 0.32 the feet came through the uppers in 'wave': the forge's shoes and cloth
// gates failed); the soles, collar and laces still cut. (The file came out smaller this way: 2.65 MB.)
export const SHOES = { 'sneakers-soles': 0.7, 'sneakers-collar': 0.8, 'sneakers-laces': 0.7 };
// the hoodie's dye nearer the sheet's grey #6A6470 (pass 1's [78,72,90] was purple enough to turn pink-red under a 2700 K
// key: the forge's colour-shift gate)
export const CLOTH = { hoodie: [76, 72, 81] };
export const STYLE = { top: 1.5705, longEnd: 1.549, shortEnd: 1.562, sweep: 0.022, low: 1.512 };

// the skin texels' bind positions (and head weight), rastered from the skin primitives' uvs
import { body, prim, matOf, raster, rgba, setWebp, fbm, h3, noise3, THREE } from '../young-hero/glb.mjs';
export async function texelPos(doc) {
  const B = body(doc), p = B.pos, uv = B.uv.getArray(), tex = matOf(doc, 'skin').getBaseColorTexture(), img = await rgba(tex), S = img.w, N2 = S * S;
  const tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]), wHead = B.wOn(/^head$/);
  const pos = new Float32Array(N2 * 3).fill(NaN), head = new Float32Array(N2);
  raster(tris, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, a, b, c) => { const i = y * S + x;
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k]; head[i] = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c]; }, 0.03);
  return { B, tex, img, S, N2, pos, head };
}
// the forehead (pass-1 left it a pale, grainy patch with a step at the brows' top, where the forge's fringe paint was
// erased by a blur fill): repainted as one smooth field of her own skin, the tone of her upper cheek a touch lighter and
// less red, with the same low mottling; feathered in over 8 mm above the brows and out at the temples. Then her new
// hairline (HL) painted soft: fine dark-brown hairs feathered over 7 mm, never a solid edge, the scalp above it dark.
export async function foreheadPass(doc, K = {}) {
  K = { hair: [34, 25, 21], lift: 1.03, ...K };
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const acc = [0, 0, 0]; let n = 0;
  for (let i = 0; i < N2; i++) { const x = Math.abs(pos[i * 3]), y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (Number.isNaN(x) || head[i] < 0.9) continue;
    if (x > 0.03 && x < 0.045 && y > 1.47 && y < 1.488 && z > 0.1) { for (let k = 0; k < 3; k++) acc[k] += lin(d[i * 4 + k]); n++; } }
  const base = acc.map((s) => (s / n) * K.lift); base[0] *= 0.985; base[1] *= 1.0; base[2] *= 1.02;
  let rep = 0, hl = 0;
  for (let i = 0; i < N2; i++) { const X = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = Math.abs(X); if (Number.isNaN(X) || head[i] < 0.5 || z < 0.03 || y < 1.505 || x > 0.085) continue;
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]);
    const H = HL(X), L0 = 0.2126 * r + 0.7152 * g + 0.0722 * b, Lb = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2], lo = 1.502 + 0.012 * (1 - sm(0.048, 0.058, x));
    const w = Math.max(sm(1.521, 1.529, y), sm(lo, lo + 0.006, y) * sm(0.6, 0.85, L0 / Lb)) * (1 - sm(0.056, 0.066, x)) * sm(0.06, 0.085, z) * (1 - sm(H + 0.006, H + 0.012, y));
    if (w > 0) { const m = 1 + 0.05 * (fbm(X, y, z, 22) - 0.5) + 0.035 * (fbm(X + 4, y, z, 80) - 0.5) + 0.012 * (noise3(X * 1800, y * 1800, z * 1800) - 0.5), top = 1 - 0.035 * sm(1.53, H, y);
      r = r * (1 - w) + base[0] * m * top * w; g = g * (1 - w) + base[1] * m * top * w; b = b * (1 - w) + base[2] * m * top * w; rep++; }
    // the hairline: per-hair jitter (thin hairs ~0.12 mm, lengths 1-5 mm), growing up and back
    const zone = sm(0.04, 0.06, z) * (x < 0.085 ? 1 : 0); if (zone <= 0) { d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); continue; }
    const col = Math.floor((X + 0.25 * (y - H)) * 8000), len = 0.0008 + 0.0026 * h3(col, 1, 5), wav = 0.0015 * (fbm(X, 0, z, 60) - 0.5);
    const hair = h3(col, 2, 9) < 0.3 ? 1 : 0, solid = sm(H + 0.003, H + 0.008, y), wisp = hair * sm(H - len, H - len + 0.0012, y + wav) * 0.55, haze = sm(H - 0.002, H + 0.004, y + wav) * 0.45;
    const cov = Math.max(solid, wisp, haze) * 0.94 * zone; if (cov > 0) { hl++; const dv = 0.85 + 0.3 * h3(col, 3, 4); const t = [r, g, b].map((c, k) => Math.pow(Math.pow(c, 1 / 2.2) * (1 - cov) + Math.pow(lin(K.hair[k] * dv), 1 / 2.2) * cov, 2.2)); [r, g, b] = t; }
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); }
  await setWebp(tex, d, S, S, 90); console.log('forehead: base', base.map(enc), 'texels repainted', rep, 'hairline', hl);
}

// locks: strand cards over the front of the head (the hair mesh is a 2-5 mm shell there, so from the front it read as a
// cap with a cut edge). Two sets of ribbons that follow the scalp (each step projected back onto it, offset along its
// normal): (a) from the hairline, growing up and back and away from the part (the swept side, her right, more across),
// rooted 1.5 mm off the skin and rising to 6 mm over 2.5 cm, so the front edge is the strands' own soft roots; (b) from
// the part line, falling to each side over the top. A new 512x1024 strand atlas (4 columns of patterns: thin tapered
// strands at staggered roots and tips, near-black to warm dark brown), MASK, double-sided; weights from the nearest hair
// point (the head). Added as a second primitive of the hair's mesh (the node list unchanged).
import { require as req, sharp as shp, MeshoptSimplifier } from '../young-hero/glb.mjs';
const { KHRMaterialsSpecular: KSpec } = req('@gltf-transform/extensions');
export async function locksPass(doc, K = {}) {
  K = { part: 0.024, n: 44, nPart: 22, seg: 22, ...K };
  const B = body(doc), bp = B.pos, head = B.wOn(/^head$/), NA = B.sk.getAttribute('NORMAL'), N0 = NA.getArray(), nsc = NA.getNormalized() ? (N0 instanceof Int8Array ? 127 : 32767) : 1;
  const skinV = []; for (let v = 0; v < bp.length / 3; v++) if (head[v] > 0.5 && bp[v * 3 + 1] > 1.44) skinV.push(v);
  // (only the outer skin: drop points under the face's surface (eyes' sockets, mouth) by keeping the scalp/forehead/temples)
  const grid = new Map(), G = 0.01, key = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
  for (const v of skinV) { const k = key(bp[v * 3], bp[v * 3 + 1], bp[v * 3 + 2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v); }
  const near = (P) => { let best = 1e9, bi = -1; const cx = Math.floor(P.x / G), cy = Math.floor(P.y / G), cz = Math.floor(P.z / G);
    for (let r = 1; r <= 3 && bi < 0; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) { const L = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!L) continue;
      for (const s of L) { const d = (P.x - bp[s * 3]) ** 2 + (P.y - bp[s * 3 + 1]) ** 2 + (P.z - bp[s * 3 + 2]) ** 2; if (d < best) { best = d; bi = s; } } } return bi; };
  // (a smooth surface: the average of the 6 nearest points' positions and normals)
  const surf = (P) => { const s0 = near(P); if (s0 < 0) return null; const cand = []; const cx = Math.floor(P.x / G), cy = Math.floor(P.y / G), cz = Math.floor(P.z / G);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const s of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) cand.push([(P.x - bp[s * 3]) ** 2 + (P.y - bp[s * 3 + 1]) ** 2 + (P.z - bp[s * 3 + 2]) ** 2, s]);
    cand.sort((a, b) => a[0] - b[0]); const pt = new THREE.Vector3(), n = new THREE.Vector3(); let ws = 0;
    for (const [d, s] of cand.slice(0, 8)) { const w = 1 / (Math.sqrt(d) + 0.002); pt.x += bp[s * 3] * w; pt.y += bp[s * 3 + 1] * w; pt.z += bp[s * 3 + 2] * w; n.x += (N0[s * 3] / nsc) * w; n.y += (N0[s * 3 + 1] / nsc) * w; n.z += (N0[s * 3 + 2] / nsc) * w; ws += w; }
    pt.multiplyScalar(1 / ws); n.normalize(); return { pt, n }; };
  const ribbons = []; let seed = 1; const rnd = () => h3(seed++, 7, 13);
  const grow = (root, dirF, len, off0, off1, width, layer) => {
    const pts = [], nrm = []; let P = root.clone(); const step = len / K.seg;
    for (let i = 0; i <= K.seg; i++) { const s = surf(P); if (!s) break; const t = i / K.seg, off = off0 + (off1 - off0) * sm(0, 0.3, t) + 0.0006 * layer;
      const Q = s.pt.clone().addScaledVector(s.n, off + (P.clone().sub(s.pt).dot(s.n) - off) * 0); // (on the surface at the offset)
      // (keep along-surface position: P projected onto the tangent plane, then lifted to the offset)
      const tang = P.clone().sub(s.pt); tang.addScaledVector(s.n, -tang.dot(s.n)); Q.copy(s.pt).add(tang).addScaledVector(s.n, off);
      if (Q.z > 0.03 && Q.y < HL(Q.x) - 0.002) break; // (never down over the face)
      if (i && Q.distanceTo(pts[pts.length - 1]) > step * 2.5) break; // (a jump to another surface)
      pts.push(Q); nrm.push(s.n.clone());
      const D = dirF(Q, t); D.addScaledVector(s.n, -D.dot(s.n)).normalize(); P = Q.clone().addScaledVector(D, step); }
    // (cut at the first bad sample: a point with no finite position or normal, or one on top of the last)
    let m = pts.findIndex((q, i) => ![q.x, q.y, q.z, nrm[i].x, nrm[i].y, nrm[i].z].every(Number.isFinite) || (i && q.distanceTo(pts[i - 1]) < 1e-4)); if (m < 0) m = pts.length;
    if (m > 4) ribbons.push({ pts: pts.slice(0, m), nrm: nrm.slice(0, m), width, col: Math.floor(rnd() * 4) }); };
  // (a) from the hairline
  for (let i = 0; i < K.n; i++) { const u = (i + 0.5 * rnd()) / K.n, x = -0.054 + 0.108 * u, side = x < K.part ? -1 : 1, y = HL(x) - 0.0005;
    // (the root on the skin at (x, y): march z in from the front)
    let root = null; for (let z = 0.16; z > -0.02; z -= 0.0005) { const s = near(new THREE.Vector3(x, y, z)); if (s >= 0 && Math.abs(bp[s * 3 + 2] - z) < 0.0015 && Math.abs(bp[s * 3] - x) < 0.006 && Math.abs(bp[s * 3 + 1] - y) < 0.006) { root = new THREE.Vector3(bp[s * 3], y, bp[s * 3 + 2]); break; } }
    if (!root) continue;
    const across = side < 0 ? 0.75 : 0.45, nearPart = sm(0.035, 0.0, Math.abs(x - K.part));
    for (let layer = 0; layer < 2; layer++) {
      const r0 = root.clone(); r0.x += (rnd() - 0.5) * 0.002; r0.y += 0.003 * layer;
      grow(r0, (Q, t) => new THREE.Vector3(side * (across + 0.3 * nearPart) * (0.6 + 0.4 * t), 1.0 - 0.6 * t, -0.35 - 0.9 * t), 0.085 + 0.03 * rnd(), 0.0015 + 0.001 * layer, 0.0075 + 0.0015 * layer, 0.011 + 0.004 * rnd(), layer); } }
  // (b) from the part, over the top (z from the hairline back to the crown), each side
  const topY = (z) => { let best = -1; for (const v of skinV) if (Math.abs(bp[v * 3] - K.part) < 0.004 && Math.abs(bp[v * 3 + 2] - z) < 0.004) best = Math.max(best, bp[v * 3 + 1]); return best; };
  for (let i = 0; i < K.nPart; i++) { const z = 0.115 - (0.13 * i) / K.nPart, y = topY(z); if (y < 0) continue;
    for (const side of [-1, 1]) { const root = new THREE.Vector3(K.part + side * 0.0015, y, z);
      grow(root, (Q, t) => new THREE.Vector3(side, -0.2 * t, -0.25 - 0.4 * t), (side < 0 ? 0.1 : 0.075) + 0.02 * rnd(), 0.007, 0.0095, 0.012 + 0.004 * rnd(), 1); } }
  // geometry
  const hp = prim(doc, 'hair')[0], HA = hp.getAttribute('POSITION').getArray(), HJ = hp.getAttribute('JOINTS_0'), HW = hp.getAttribute('WEIGHTS_0'), hj = HJ.getArray(), hw = HW.getArray();
  const hUsed = [...new Set(hp.getIndices().getArray())];
  const nearHair = (Q) => { let best = 1e9, bi = 0; for (const v of hUsed) { const d = (Q.x - HA[v * 3]) ** 2 + (Q.y - HA[v * 3 + 1]) ** 2 + (Q.z - HA[v * 3 + 2]) ** 2; if (d < best) { best = d; bi = v; } } return bi; };
  const nV = ribbons.reduce((s, r) => s + r.pts.length * 2, 0), P = new Float32Array(nV * 3), Nn = new Float32Array(nV * 3), U = new Float32Array(nV * 2), JJ = new hj.constructor(nV * 4), WW = new hw.constructor(nV * 4), I = [];
  let o = 0;
  for (const r of ribbons) { const m = r.pts.length, base = o;
    for (let i = 0; i < m; i++) { const Q = r.pts[i], n = r.nrm[i], T = r.pts[Math.min(m - 1, i + 1)].clone().sub(r.pts[Math.max(0, i - 1)]).normalize(), S = new THREE.Vector3().crossVectors(n, T).normalize();
      const t = i / (m - 1), w = r.width * (1 - 0.45 * t) * (0.6 + 0.4 * sm(0, 0.08, t)), hv = nearHair(Q);
      for (const s of [-1, 1]) { const V = Q.clone().addScaledVector(S, (s * w) / 2); P.set([V.x, V.y, V.z], o * 3); Nn.set([n.x, n.y, n.z], o * 3); U.set([(r.col + (s < 0 ? 0.02 : 0.98)) / 4, t], o * 2);
        for (let q = 0; q < 4; q++) { JJ[o * 4 + q] = hj[hv * 4 + q]; WW[o * 4 + q] = hw[hv * 4 + q]; } o++; } }
    for (let i = 0; i < m - 1; i++) { const a = base + i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); /* (wound so the face's normal is the scalp's, outward) */ } }
  // atlas
  const TW = 512, TH = 1024, tx = Buffer.alloc(TW * TH * 4);
  const root = [9, 8, 7], mid = [26, 19, 16], hi = [60, 42, 31];
  for (let c = 0; c < 4; c++) for (let sx = 0; sx < 128; sx++) { const sid = c * 1000 + sx, on = h3(sid, 1, 2) < 0.62; if (!on) continue;
    const r0 = 0.02 + 0.07 * h3(sid, 2, 3), r1 = 0.6 + 0.4 * h3(sid, 3, 4), br = h3(sid, 4, 5), wv = 3 * h3(sid, 5, 6), fq = 2 + 4 * h3(sid, 6, 7), edge = Math.min(sx, 127 - sx) / 64;
    if (h3(sid, 7, 8) > 0.35 + 0.65 * sm(0, 0.35, edge)) continue;
    for (let y = 0; y < TH; y++) { const t = y / TH; if (t < r0 || t > r1) continue; const a = sm(r0, r0 + 0.05, t) * sm(r1, r1 - 0.12, t);
      const xf = c * 128 + sx + wv * Math.sin(t * fq * 6.28 + sid), xi = Math.floor(xf), fr = xf - xi, along = 0.5 + 0.5 * Math.sin(t * 9 + sid * 0.7);
      const L = Math.min(1, 0.25 + 0.55 * br + 0.25 * along) * (0.75 + 0.25 * sm(0, 0.3, t)), col = L < 0.5 ? root.map((r, k) => r + (mid[k] - r) * (L / 0.5)) : mid.map((m, k) => m + (hi[k] - m) * ((L - 0.5) / 0.5));
      for (const [xx, ww] of [[xi, 1 - fr], [xi + 1, fr]]) { if (xx < c * 128 || xx >= c * 128 + 128) continue; const j = (y * TW + xx) * 4, aa = Math.round(255 * a * ww);
        if (aa > tx[j + 3]) { tx[j] = col[0]; tx[j + 1] = col[1]; tx[j + 2] = col[2]; tx[j + 3] = aa; } } } }
  // (bleed colour into the transparent texels so filtering never pulls in black-transparent fringes)
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const j = (y * TW + x) * 4; if (tx[j + 3]) continue; tx[j] = mid[0]; tx[j + 1] = mid[1]; tx[j + 2] = mid[2]; }
  const R = doc.getRoot(), buf = R.listBuffers()[0], mesh = R.listMeshes().find((m) => m.listPrimitives().includes(hp));
  const hm = matOf(doc, 'hair'), mat = doc.createMaterial('hair-locks').setAlphaMode('MASK').setAlphaCutoff(K.cut ?? 0.42).setDoubleSided(true).setRoughnessFactor(0.48).setMetallicFactor(0);
  const lt = doc.createTexture('hair-locks'); await setWebp(lt, tx, TW, TH, 88); mat.setBaseColorTexture(lt);
  const sp = (hm.getExtension('KHR_materials_specular')); if (sp) { const s2 = doc.createExtension(KSpec).createSpecular().setSpecularFactor(sp.getSpecularFactor()); mat.setExtension('KHR_materials_specular', s2); }
  const acc = (type, arr, norm = false) => doc.createAccessor().setType(type).setArray(arr).setNormalized(norm).setBuffer(buf);
  const p = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', Uint16Array.from(I))).setAttribute('POSITION', acc('VEC3', P)).setAttribute('NORMAL', acc('VEC3', Nn))
    .setAttribute('TEXCOORD_0', acc('VEC2', U)).setAttribute('JOINTS_0', acc('VEC4', JJ)).setAttribute('WEIGHTS_0', acc('VEC4', WW, HW.getNormalized()));
  if (!P.every(Number.isFinite)) throw new Error('locks: a non-finite position');
  mesh.addPrimitive(p); console.log('locks: ribbons', ribbons.length, 'points', nV, 'tris', I.length / 3);
}

// the bust: the hoodie's front pinched to a point at each apex, with a fold that tore through (two dark slits: folded
// triangles showing their back). Each apex region (r 4.5 cm) relaxed: welded by position, Laplacian smoothing that
// fades out to the region's edge (the seams move together), then the apex rounded down (the cone's tip 30% of its height
// over a sphere through its base ring), and below it the fleece bridged: points under the apex down to the waist pulled
// out onto the straight line from the apex to the waist (a fleece hoodie hangs from the bust, it does not tuck under it).
export function bustPass(doc, K = {}) {
  K = { r: 0.045, iters: 40, pleat: 25, round: 0.32, bridge: 0.8, ...K };
  const p = prim(doc, 'hoodie')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), idx = p.getIndices().getArray(), n = a.length / 3;
  const grp = new Map(), gid = new Int32Array(n), gk = (v) => `${Math.round(a[v * 3] * 2e3)},${Math.round(a[v * 3 + 1] * 2e3)},${Math.round(a[v * 3 + 2] * 2e3)}`;
  for (let v = 0; v < n; v++) { const k = gk(v); if (!grp.has(k)) grp.set(k, grp.size); gid[v] = grp.get(k); }
  const G = grp.size, gp = new Float64Array(G * 3), gc = new Int32Array(G), nb = Array.from({ length: G }, () => new Set());
  for (let v = 0; v < n; v++) { const g = gid[v]; gp[g * 3] = a[v * 3]; gp[g * 3 + 1] = a[v * 3 + 1]; gp[g * 3 + 2] = a[v * 3 + 2]; gc[g]++; }
  for (let q = 0; q < idx.length; q += 3) for (let e = 0; e < 3; e++) { const u = gid[idx[q + e]], w = gid[idx[q + (e + 1) % 3]]; if (u !== w) { nb[u].add(w); nb[w].add(u); } }
  let moved = 0;
  // (the drawcords' channels: two sewn-looking vertical ridges down the front (x +-3 cm); relaxed into the fleece)
  { const wP = new Float64Array(G); for (let g = 0; g < G; g++) { const x = Math.abs(gp[g * 3]), y = gp[g * 3 + 1], z = gp[g * 3 + 2]; wP[g] = z > 0.09 ? (1 - sm(0.045, 0.06, x)) * sm(0.98, 1.03, y) * (1 - sm(1.3, 1.34, y)) : 0; }
    for (let it = 0; it < K.pleat; it++) { const nx = gp.slice(); for (let g = 0; g < G; g++) { if (!wP[g] || !nb[g].size) continue; const m = [0, 0, 0]; for (const h of nb[g]) for (let k = 0; k < 3; k++) m[k] += gp[h * 3 + k] / nb[g].size;
      for (let k = 0; k < 3; k++) nx[g * 3 + k] = gp[g * 3 + k] + 0.5 * wP[g] * (m[k] - gp[g * 3 + k]); } gp.set(nx); } }
  for (const side of [1, -1]) {
    let ap = -1, bz = -1; for (let g = 0; g < G; g++) { const x = gp[g * 3] * side, y = gp[g * 3 + 1], z = gp[g * 3 + 2]; if (x > 0.055 && x < 0.14 && y > 1.04 && y < 1.26 && z > bz) { bz = z; ap = g; } }
    const C = [gp[ap * 3], gp[ap * 3 + 1], gp[ap * 3 + 2]]; console.log('bust apex', side, C.map((c) => c.toFixed(3)).join(','));
    // (the whole bust's front, not only round the apex: the folds of the pucker run 4-6 cm out from it)
    const wgt = new Float64Array(G); for (let g = 0; g < G; g++) { const x = gp[g * 3] * side, y = gp[g * 3 + 1], z = gp[g * 3 + 2];
      wgt[g] = sm(0.035, 0.055, x) * (1 - sm(0.15, 0.17, x)) * sm(1.06, 1.09, y) * (1 - sm(1.24, 1.27, y)) * sm(0.07, 0.1, z); }
    for (let it = 0; it < K.iters; it++) { const nx = gp.slice();
      for (let g = 0; g < G; g++) { if (!wgt[g] || !nb[g].size) continue; const m = [0, 0, 0]; for (const h of nb[g]) for (let k = 0; k < 3; k++) m[k] += gp[h * 3 + k] / nb[g].size;
        for (let k = 0; k < 3; k++) nx[g * 3 + k] = gp[g * 3 + k] + 0.5 * wgt[g] * (m[k] - gp[g * 3 + k]); }
      gp.set(nx); }
    // the fleece bridged below the apex: the front's points from the apex's height down to the waist (y 1.0) out to the line
    let tip = -1, tz = -1; for (let g = 0; g < G; g++) { const x = gp[g * 3] * side, y = gp[g * 3 + 1], z = gp[g * 3 + 2]; if (x > 0.055 && x < 0.14 && y > 1.04 && y < 1.26 && z > tz) { tz = z; tip = g; } }
    // (the cone's point rounded: the height over its base ring (r 3.2 cm) reshaped from a cone's (1 - d/r) to a dome's
    // (1 - (d/r)^2), the top K.round lower)
    { const T0 = [gp[tip * 3], gp[tip * 3 + 1]], R = 0.032; let zr = 0, nr = 0; for (let g = 0; g < G; g++) { if (gp[g * 3 + 2] < 0.08) continue; const d = Math.hypot(gp[g * 3] - T0[0], gp[g * 3 + 1] - T0[1]); if (d > R - 0.004 && d < R + 0.004) { zr += gp[g * 3 + 2]; nr++; } }
      zr /= Math.max(1, nr); const E0 = gp[tip * 3 + 2] - zr;
      for (let g = 0; g < G; g++) { if (gp[g * 3 + 2] < 0.08) continue; const d = Math.hypot(gp[g * 3] - T0[0], gp[g * 3 + 1] - T0[1]); if (d >= R) continue; const e = gp[g * 3 + 2] - zr; if (e <= 0) continue;
        const want = E0 * (1 - K.round) * (1 - (d / R) ** 2), f = sm(R, R * 0.6, d); gp[g * 3 + 2] = zr + e + (Math.min(e, want) - e) * f + (want > e ? (want - e) * f * 0.5 : 0); }
      // (then the tip itself relaxed (r 1.8 cm, 12 rounds at full weight): no point left at the apex)
      for (let it = 0; it < 12; it++) { const nx = gp.slice(); for (let g = 0; g < G; g++) { if (gp[g * 3 + 2] < 0.08 || !nb[g].size) continue; const d = Math.hypot(gp[g * 3] - T0[0], gp[g * 3 + 1] - T0[1]); if (d > 0.018) continue;
        const w = sm(0.018, 0.008, d), m = [0, 0, 0]; for (const h of nb[g]) for (let k = 0; k < 3; k++) m[k] += gp[h * 3 + k] / nb[g].size; for (let k = 0; k < 3; k++) nx[g * 3 + k] = gp[g * 3 + k] + 0.6 * w * (m[k] - gp[g * 3 + k]); } gp.set(nx); }
      console.log('bust: apex height over ring mm', (E0 * 1000).toFixed(1)); }
    const T = [gp[tip * 3], gp[tip * 3 + 1], gp[tip * 3 + 2]];
    // (the waist's front z at the apex's x: the most forward point near (T.x, 1.0))
    let wz = -1; for (let g = 0; g < G; g++) if (Math.abs(gp[g * 3] - T[0]) < 0.015 && Math.abs(gp[g * 3 + 1] - 1.0) < 0.012) wz = Math.max(wz, gp[g * 3 + 2]);
    for (let g = 0; g < G; g++) { const x = gp[g * 3], y = gp[g * 3 + 1], z = gp[g * 3 + 2]; if (y > T[1] || y < 1.06 || z < 0.04) continue;
      const lat = Math.exp(-(((x - T[0]) / 0.045) ** 2)), u = (T[1] - y) / (T[1] - 1.0), line = T[2] + (wz - T[2]) * u, fade = sm(1.06, 1.09, y);
      if (z < line) gp[g * 3 + 2] = z + (line - z) * K.bridge * lat * fade; }
  }
  // (any point left behind by its neighbours (a dimple: the old pucker's centre) set to their mean, a few rounds)
  let desp = 0; for (let it = 0; it < 6; it++) for (let g = 0; g < G; g++) { const x = Math.abs(gp[g * 3]), y = gp[g * 3 + 1], z = gp[g * 3 + 2]; if (z < 0.06 || y < 1.0 || y > 1.3 || x > 0.17 || nb[g].size < 3) continue;
    const m = [0, 0, 0]; for (const h of nb[g]) for (let k = 0; k < 3; k++) m[k] += gp[h * 3 + k] / nb[g].size; if (Math.hypot(m[0] - gp[g * 3], m[1] - gp[g * 3 + 1], m[2] - gp[g * 3 + 2]) > 0.007) { for (let k = 0; k < 3; k++) gp[g * 3 + k] = m[k]; desp++; } }
  console.log('bust: dimples evened', desp);
  for (let v = 0; v < n; v++) { const g = gid[v]; for (let k = 0; k < 3; k++) { const d = gp[g * 3 + k] - a[v * 3 + k]; if (Math.abs(d) > 1e-6) { a[v * 3 + k] = gp[g * 3 + k]; moved++; } } }
  A.setArray(a); console.log('bust: hoodie coords moved', moved);
  // (the normals of every moved point recomputed from the welded surface (area-weighted); the baked ones still had the pucker)
  const NA = p.getAttribute('NORMAL'), na = NA.getArray().slice(), gn = new Float64Array(G * 3);
  for (let q = 0; q < idx.length; q += 3) { const [i0, i1, i2] = [idx[q], idx[q + 1], idx[q + 2]].map((v) => gid[v]);
    const e1 = [0, 1, 2].map((k) => gp[i1 * 3 + k] - gp[i0 * 3 + k]), e2 = [0, 1, 2].map((k) => gp[i2 * 3 + k] - gp[i0 * 3 + k]), c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const g of [i0, i1, i2]) for (let k = 0; k < 3; k++) gn[g * 3 + k] += c[k]; }
  const sc = NA.getNormalized() ? (na instanceof Int8Array ? 127 : 32767) : 1; let rn = 0;
  for (let v = 0; v < n; v++) { const g = gid[v], x = Math.abs(a[v * 3]), y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z < 0.06 || y < 0.98 || y > 1.3 || x > 0.17) continue;
    const L = Math.hypot(gn[g * 3], gn[g * 3 + 1], gn[g * 3 + 2]); if (!L) continue; const old = [0, 1, 2].map((k) => na[v * 3 + k] / sc), nw = [0, 1, 2].map((k) => gn[g * 3 + k] / L);
    const out = [a[v * 3], 0, a[v * 3 + 2] - 0.02], sgn = out[0] * nw[0] + out[2] * nw[2] < 0 ? -1 : 1; /* (outward from the torso's axis: the bake had some pointing in) */ for (let k = 0; k < 3; k++) na[v * 3 + k] = Math.round(sgn * nw[k] * sc); rn++; }
  NA.setArray(na); console.log('bust: normals recomputed', rn);
}

// a cloth normal map flattened where a weight field (of the bind position) says: blended toward its own heavy blur (the
// broad shading kept, the baked crease gone). Used for the hoodie's two star-shaped puckers baked at the bust's apex
// and the sewn-pleat ridges either side of the drawcords.
export async function flattenNormals(doc, name, wf, sigma = 10) {
  const mat = matOf(doc, name), nt = mat?.getNormalTexture(); if (!nt) return;
  const pr = prim(doc, name)[0], a = pr.getAttribute('POSITION').getArray(), uv = pr.getAttribute('TEXCOORD_0').getArray(), idx = [...pr.getIndices().getArray()];
  const { data, info } = await shp(Buffer.from(nt.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }), S = info.width;
  const bl = await shp(data, { raw: { width: S, height: S, channels: 3 } }).blur(sigma).raw().toBuffer();
  const W = new Float32Array(S * S);
  raster(idx, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, p, q, r) => { const P = [0, 1, 2].map((k) => l1 * a[p * 3 + k] + l2 * a[q * 3 + k] + l3 * a[r * 3 + k]); W[y * S + x] = Math.max(W[y * S + x], wf(P[0], P[1], P[2])); }, 0.05);
  let n = 0; for (let i = 0; i < S * S; i++) { const w = W[i]; if (w <= 0) continue; n++; for (let k = 0; k < 3; k++) data[i * 3 + k] = Math.round(data[i * 3 + k] * (1 - w) + bl[i * 3 + k] * w); }
  nt.setImage(await shp(data, { raw: { width: S, height: S, channels: 3 } }).webp({ quality: 80, effort: 5 }).toBuffer()).setMimeType('image/webp'); console.log('normals flattened', name, n, 'texels');
}
export async function hoodieNormalsPass(doc) {
  const ap = [[0.112, 1.142, 0.158], [-0.112, 1.142, 0.158]];
  await flattenNormals(doc, 'hoodie', (x, y, z) => { if (z < 0.06) return 0; let w = 0; for (const c of ap) w = Math.max(w, sm(0.045, 0.02, Math.hypot(x - c[0], y - c[1], z - c[2])));
    const pl = (1 - sm(0.045, 0.06, Math.abs(x))) * sm(0.98, 1.03, y) * (1 - sm(1.3, 1.34, y)) * 0.8; return Math.max(w, pl); });
}

// the drawcords: they lay on the fleece with the cloth bake's ripples (in a 3/4 view two wavy ridges, read as sewn
// pleats). Each cord's centre line (3 mm slices) smoothed along its length (a 4 cm window) and held 2.5 mm off the
// fleece's front, every point moved with its slice, so the cords run as two clean strings from the neck.
export function cordsPass(doc, K = {}) {
  K = { win: 0.02, lift: 0.0025, ...K };
  const p = prim(doc, 'hood-cords')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(p.getIndices().getArray())];
  const ha = prim(doc, 'hoodie')[0].getAttribute('POSITION').getArray(), front = (x, y) => { let m = -1; for (let v = 0; v < ha.length / 3; v++) if (Math.abs(ha[v * 3] - x) < 0.008 && Math.abs(ha[v * 3 + 1] - y) < 0.008) m = Math.max(m, ha[v * 3 + 2]); return m; };
  let moved = 0;
  for (const side of [1, -1]) { const vs = used.filter((v) => Math.sign(a[v * 3]) === side), sl = new Map(), Q = 0.003;
    for (const v of vs) { const k = Math.round(a[v * 3 + 1] / Q); if (!sl.has(k)) sl.set(k, []); sl.get(k).push(v); }
    const ks = [...sl.keys()].sort((x, y) => x - y), cen = new Map(ks.map((k) => [k, [0, 2].map((t) => sl.get(k).reduce((s, v) => s + a[v * 3 + t], 0) / sl.get(k).length)]));
    for (const k of ks) { const y = k * Q; let sx = 0, sz = 0, sw = 0; for (const j of ks) { const d = (j - k) * Q; if (Math.abs(d) > K.win * 1.5) continue; const w = Math.exp(-((d / K.win) ** 2)); sx += cen.get(j)[0] * w; sz += cen.get(j)[1] * w; sw += w; }
      let tx = sx / sw, tz = sz / sw; const f = front(tx, y); if (f > 0) tz = Math.max(tz, f + K.lift + 0.002);
      const dx = tx - cen.get(k)[0], dz = tz - cen.get(k)[1]; for (const v of sl.get(k)) { a[v * 3] += dx; a[v * 3 + 2] += dz; moved++; } } }
  A.setArray(a); console.log('cords: points moved', moved);
}

// the hood, down: its rim lay as a thick ridge over both shoulders in front (a padded yoke, against the no-shoulder-pads
// rule). Every hood point in front of the back (z > -0.05) squashed toward the fleece under it (a 1 cm grid of the
// hoodie's top surface): its height over the fleece x K.squash (never under 3 mm), and the rim drawn in toward the neck
// (x K.narrow beyond 6 cm), fading out behind, so the hood lies as soft folded fleece round the neck.
export function hoodPass(doc, K = {}) {
  K = { squash: 0.5, narrow: 0.9, ...K };
  const ha = prim(doc, 'hoodie')[0].getAttribute('POSITION').getArray(), grid = new Map(), c = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
  for (let v = 0; v < ha.length / 3; v++) { if (ha[v * 3 + 1] < 1.2) continue; const k = c(ha[v * 3], ha[v * 3 + 2]); grid.set(k, Math.max(grid.get(k) ?? -9, ha[v * 3 + 1])); }
  const top = (x, z) => { let m = -9; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const g = grid.get(`${Math.round(x * 100) + dx},${Math.round(z * 100) + dz}`); if (g != null) m = Math.max(m, g); } return m; };
  let n = 0;
  for (const p of prim(doc, 'hood')) { const A = p.getAttribute('POSITION'), a = A.getArray().slice();
    for (let v = 0; v < a.length / 3; v++) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], f = sm(-0.07, -0.02, z); if (f <= 0) continue;
      const nx = Math.abs(x) > 0.06 ? Math.sign(x) * (0.06 + (Math.abs(x) - 0.06) * K.narrow) : x, s = top(nx, z);
      let ny = y; if (s > 0 && y > s) ny = Math.max(s + 0.003, s + (y - s) * K.squash);
      a[v * 3] = x + (nx - x) * f; a[v * 3 + 1] = y + (ny - y) * f; n++; }
    A.setArray(a); }
  console.log('hood: points moved', n);
}

// the face, older again (on top of pass 1's fields; the mouth's 1.2 cm still kept so the mouth landmarks hold): the chin
// a further 1.2 mm down and 0.4 mm forward (a longer lower face), the mid-face's width 0.8 mm in at the cheeks' widest,
// and an eye socket: the band between the upper lid and the brow 0.9 mm deeper (a lid crease the light can find)
export function faceMorePass(doc, K = {}) {
  K = { chin: 0.0012, chinZ: 0.0004, mid: 0.0008, socket: 0.0009, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^(head|neck)/), n = a.length / 3;
  const g = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  const MY = 1.437, MZ = 0.142; let moved = 0, maxd = 0;
  for (let v = 0; v < n; v++) { if (head[v] < 0.3) continue; const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0), sx = Math.sign(x0) || 1;
    if (y > 1.53 || y < 1.36 || z < 0.0) continue;
    const still = sm(0.009, 0.015, Math.hypot(x / 1.5, y - MY, (z - MZ) / 1.4));
    const chin = sm(MY - 0.012, MY - 0.03, y) * g(x0, 0, 0, 0.03, 1, 1) * sm(0.08, 0.12, z), mid = g(x - 0.058, y - 1.468, z - 0.08, 0.012, 0.018, 0.03);
    const sock = g(x - 0.033, y - 1.5095, z - 0.13, 0.011, 0.0035, 0.012);
    const dx = -sx * K.mid * mid, dy = -K.chin * chin, dz = K.chinZ * chin - K.socket * sock, s = still * Math.min(1, head[v]), d = Math.hypot(dx, dy, dz) * s; if (d < 1e-6) continue;
    a[v * 3] += dx * s; a[v * 3 + 1] += dy * s; a[v * 3 + 2] += dz * s; moved++; maxd = Math.max(maxd, d); }
  P.setArray(a); console.log('face more: moved', moved, 'max mm', (maxd * 1000).toFixed(2));
}
