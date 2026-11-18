// Hand-built Jensen, the jacket: MakeHuman's male_casualsuit05 (CC0; an open jacket with notched lapels and flap pockets
// over a striped shirt, one mesh) made into a black leather moto jacket over the sheet's black tee.
//  shirt    the jacket's own shirt pieces (the striped placket and collar: uv islands that are near-black (striped) in its
//           texture) taken out; the forge's black tee under it shows in the open front, with its crew neck
//  leather  the jacket's islands repainted as black leather at 2048: ambientCG Leather026's colour (CC0) laid over the
//           garment's own baked light (its seams, folds and stitching kept as shading), a deep warm black, the pocket
//           openings (unpainted in the pack's texture) filled in leather; the normal map the garment's own seams and
//           folds with Poly Haven leather_white's fine grain (CC0) over them at its size on the body; a roughness map
//           (G) round 0.42 varied by the grain, the seams and edges a little rougher, so the sun draws a soft sheen,
//           not plastic. Named garment 'leather-moto-jacket' (Mog City's polish weaves leather, not jersey, over it)
//  zip      a plain silver zip (no maker's mark) along both front edges of the opening below the lapels (the open
//           jacket's two zip tapes: one a coarse toothed chain, the other its matching side), metallic in the MR map,
//           and a plain pull at the left hem
//  shape    the jacket's sleeve heads eased onto the shoulder line (no pad look) and its body taken in a little at the
//           waist, so it reads cut close like a moto jacket, not boxy
// Sources (CC0, downloaded 18 Nov 2026; see storykit/handbuilt/jensen/SOURCES.md): ambientCG Leather026,
// Poly Haven leather_white.
import fs from 'node:fs';
import { prim, rgba, raster, sm, clamp, fbm, h3, sharp, THREE } from '../young-hero/glb.mjs';

const MATS = process.env.JH_MATERIALS || new URL('../../../.scratch/jensen/materials/', import.meta.url).pathname;
async function tile(file, S, ch = 3) { const { data } = await sharp(file).resize(S, S).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, S, ch: 3 }; }
const samp = (T, u, v, c) => { const x = ((Math.floor(u * T.S) % T.S) + T.S) % T.S, y = ((Math.floor(v * T.S) % T.S) + T.S) % T.S; return T.d[(y * T.S + x) * 3 + c]; };

export function jacketPrim(doc) { return doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((p) => ['male_casualsuit05', 'leather-moto-jacket'].includes(p.getMaterial()?.getExtras()?.garment)); }

export async function jacketPass(doc, K = {}) {
  K = { S: 2048, black: [26, 25, 26], tileM: 0.22, rough: 0.42, zipW: 0.0055, zipY0: 0.95, zipY1: 1.36, waist: 0.012, drop: 0.012, ...K };
  const p = jacketPrim(doc); if (!p) throw new Error('no male_casualsuit05 primitive');
  const mat = p.getMaterial(), tex = mat.getBaseColorTexture(), { data: O, w: OW } = await rgba(tex), nrmTex = mat.getNormalTexture();
  const ON = nrmTex ? await rgba(nrmTex) : null;
  const P = p.getAttribute('POSITION'), a = P.getArray().slice(), uv = p.getAttribute('TEXCOORD_0').getArray(), I0 = p.getIndices().getArray();
  const lum = (x, y) => { const i = (Math.min(OW - 1, Math.max(0, y)) * OW + Math.min(OW - 1, Math.max(0, x))) * 4; return [O[i], O[i + 1], O[i + 2]]; };
  // uv islands (triangles joined through shared points), each classed by the pack texture's colour under it
  const nT = I0.length / 3, par = new Int32Array(a.length / 3).map((_, i) => i), f = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < nT; t++) { const A = f(I0[t * 3]); par[f(I0[t * 3 + 1])] = A; par[f(I0[t * 3 + 2])] = A; }
  const isl = new Map(); for (let t = 0; t < nT; t++) { const r = f(I0[t * 3]); let s = isl.get(r); if (!s) isl.set(r, (s = { tris: [], L: 0, red: 0, n: 0 }));
    s.tris.push(t); const u = (uv[I0[t * 3] * 2] + uv[I0[t * 3 + 1] * 2] + uv[I0[t * 3 + 2] * 2]) / 3, v = (uv[I0[t * 3] * 2 + 1] + uv[I0[t * 3 + 1] * 2 + 1] + uv[I0[t * 3 + 2] * 2 + 1]) / 3;
    const c = lum(Math.floor(u * OW), Math.floor(v * OW)); s.L += (c[0] + c[1] + c[2]) / 3; s.red += c[0] - c[1]; s.n++; }
  const keep = [], gone = []; for (const s of isl.values()) { const L = s.L / s.n, red = s.red / s.n; (L < 30 ? gone : keep).push(...s.tris); }
  const I = Uint32Array.from(keep.flatMap((t) => [I0[t * 3], I0[t * 3 + 1], I0[t * 3 + 2]]));
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(I).setBuffer(p.getIndices().getBuffer()));
  console.log('jacket: islands', isl.size, 'shirt triangles out', gone.length, 'kept', keep.length);
  const used = [...new Set(I)];
  // the shape: cut close (moto, not boxy) and short (it ends at the belt)
  fitJacket(doc, p, a, used, K);
  P.setArray(a);
  // the zip line: the opening's free edges (edges with one triangle) on the front, below the lapels
  const ec = new Map(), ek = (x, y) => (x < y ? x + '_' + y : y + '_' + x);
  for (let t = 0; t < I.length; t += 3) for (const [x, y] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) ec.set(ek(x, y), (ec.get(ek(x, y)) || 0) + 1);
  // (free by place: the uv seams split points, so a free edge is one whose two ends' places have one triangle across them)
  const key = (v) => `${Math.round(a[v * 3] * 2000)},${Math.round(a[v * 3 + 1] * 2000)},${Math.round(a[v * 3 + 2] * 2000)}`, pc = new Map();
  for (let t = 0; t < I.length; t += 3) for (const [x, y] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const k2 = [key(x), key(y)].sort().join('|'); pc.set(k2, (pc.get(k2) || 0) + 1); }
  const zip = [];
  for (const [k2, n] of pc) { if (n !== 1) continue; const [A, B] = k2.split('|').map((s) => s.split(',').map((q) => +q / 2000));
    const mid = [0, 1, 2].map((c) => (A[c] + B[c]) / 2); if (mid[2] < 0.02 || Math.abs(mid[0]) > 0.14 || mid[1] < K.zipY0 || mid[1] > K.zipY1) continue; zip.push([A, B]); }
  console.log('jacket: zip edges', zip.length);
  const zipD = (q) => { let best = 1e9, along = 0; for (const [A, B] of zip) { const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
      const t = clamp(((q[0] - A[0]) * ab[0] + (q[1] - A[1]) * ab[1] + (q[2] - A[2]) * ab[2]) / L2), c = [A[0] + ab[0] * t, A[1] + ab[1] * t, A[2] + ab[2] * t], d = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
      if (d < best) { best = d; along = c[1]; } } return { d: best, along }; };
  // the tiles: leather colour, the fine grain's normal and roughness, at tileM metres a tile on the body
  const LC = await tile(MATS + 'Leather026_Color.jpg', 1024), LN = await tile(MATS + 'leather_white_nor_gl.jpg', 1024), LR = await tile(MATS + 'leather_white_rough.jpg', 1024);
  // metres per uv unit (median over edges)
  const rr = []; for (let t = 0; t < I.length; t += 9) { const x = I[t], y = I[t + 1], du = Math.hypot(uv[x * 2] - uv[y * 2], uv[x * 2 + 1] - uv[y * 2 + 1]); if (du > 1e-6) rr.push(Math.hypot(a[x * 3] - a[y * 3], a[x * 3 + 1] - a[y * 3 + 1], a[x * 3 + 2] - a[y * 3 + 2]) / du); }
  rr.sort((x, y) => x - y); const mpu = rr[rr.length >> 1], rep = mpu / K.tileM;
  // the garment's middle light (its painted panels), for the shading ratio
  let Ls = [], S = K.S; for (let t = 0; t < I.length; t += 3) { const u = (uv[I[t] * 2] + uv[I[t + 1] * 2] + uv[I[t + 2] * 2]) / 3, v = (uv[I[t] * 2 + 1] + uv[I[t + 1] * 2 + 1] + uv[I[t + 2] * 2 + 1]) / 3, c = lum(Math.floor(u * OW), Math.floor(v * OW)), L = (c[0] + c[1] + c[2]) / 3; if (L > 40) Ls.push(L); }
  Ls.sort((x, y) => x - y); const Lmid = Ls[Ls.length >> 1] || 90;
  const base = Buffer.alloc(S * S * 4), nor = Buffer.alloc(S * S * 4), mr = Buffer.alloc(S * S * 4);
  for (let i = 0; i < S * S; i++) { base.set([K.black[0], K.black[1], K.black[2], 255], i * 4); nor.set([128, 128, 255, 255], i * 4); mr.set([255, Math.round(K.rough * 255), 0, 255], i * 4); }
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  let nz = 0;
  raster(I, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, A, B, C) => {
    const i = y * S + x, q = [0, 1, 2].map((c) => l1 * a[A * 3 + c] + l2 * a[B * 3 + c] + l3 * a[C * 3 + c]);
    const u = x / S, v = y / S, ox = Math.floor(u * OW), oy = Math.floor(v * OW), c0 = lum(ox, oy), L0 = (c0[0] + c0[1] + c0[2]) / 3;
    // the garment's own light (seams, folds, stitches) as a ratio round its middle; unpainted (the pocket openings) = 1
    const shade = L0 < 30 ? 1 : Math.pow(clamp(L0 / Lmid, 0.45, 1.5), 0.85);
    const gu = u * rep, gv = v * rep, lc = [0, 1, 2].map((c) => samp(LC, gu, gv, c)), lcL = (lc[0] + lc[1] + lc[2]) / 3;
    const mott = 0.92 + 0.16 * fbm(q[0], q[1], q[2], 9), grain = 0.85 + 0.3 * (lcL / 60);
    let col = K.black.map((k, c) => lin(k) * shade * mott * clamp(grain, 0.7, 1.3) * (c === 0 ? 1.02 : c === 2 ? 0.98 : 1));
    // (wear: the edges of the panels, where the leather is folded over, a touch lighter and greyer)
    const edge = L0 >= 30 && L0 < Lmid * 0.75 ? 0 : 0;
    let rough = K.rough + (samp(LR, gu, gv, 1) / 255 - 0.5) * 0.3 + (shade < 0.8 ? 0.08 : 0) + edge, metal = 0;
    let n = [samp(LN, gu, gv, 0) / 127.5 - 1, samp(LN, gu, gv, 1) / 127.5 - 1];
    if (ON && L0 >= 30) { const j = (oy * OW + ox) * 4; n = [n[0] * 0.6 + (ON.data[j] / 127.5 - 1), n[1] * 0.6 + (ON.data[j + 1] / 127.5 - 1)]; }
    // the zip: two tapes along the opening, the teeth a fine chain across it, silver
    if (zip.length) { const z = zipD(q); if (z.d < K.zipW) { const tooth = (Math.floor(z.along / 0.0028) % 2) === 0, inTeeth = z.d < K.zipW * 0.55;
        if (inTeeth && tooth) { col = [lin(168), lin(168), lin(170)].map((k) => k * (0.75 + 0.35 * (1 - z.d / (K.zipW * 0.55)))); metal = 1; rough = 0.3; n = [0, (z.along % 0.0028) / 0.0028 - 0.5]; }
        else { col = [lin(14), lin(14), lin(15)]; rough = 0.7; n = [0, 0]; } nz++; } }
    base[i * 4] = enc(col[0]); base[i * 4 + 1] = enc(col[1]); base[i * 4 + 2] = enc(col[2]);
    const nl = Math.hypot(n[0], n[1], 1); nor[i * 4] = Math.round((n[0] / nl * 0.5 + 0.5) * 255); nor[i * 4 + 1] = Math.round((n[1] / nl * 0.5 + 0.5) * 255); nor[i * 4 + 2] = Math.round((1 / nl * 0.5 + 0.5) * 255);
    mr[i * 4 + 1] = Math.round(clamp(rough, 0.2, 0.95) * 255); mr[i * 4 + 2] = Math.round(metal * 255);
  }, 0.04);
  // the textures: a new set (the pack's texture may be shared), the material renamed and re-tagged as leather
  const mk = async (name, buf, q) => doc.createTexture(name).setImage(await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).removeAlpha().webp({ quality: q, effort: 5 }).toBuffer()).setMimeType('image/webp');
  const lm = doc.createMaterial('leather').setBaseColorTexture(await mk('leather-base', base, 90)).setNormalTexture(await mk('leather-normal', nor, 92)).setMetallicRoughnessTexture(await mk('leather-mr', mr, 90))
    .setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(true).setExtras({ ...mat.getExtras(), garment: 'leather-moto-jacket' });
  lm.getNormalTextureInfo(); p.setMaterial(lm);
  console.log('jacket: leather at', S, 'tile', K.tileM, 'm (rep', rep.toFixed(2), ') zip texels', nz, 'mid light', Lmid);
}

// the jacket's fit: (1) short: the torso's hem raised to 5 cm over the jeans' waistband, the cloth from the chest down
// compressed into the shorter length (the sleeves left as they are); (2) close: every point standing more than tmax off
// the tee under it (8 mm on the chest and arms, 6 mm round the waist and hips, 5 mm at the shoulder's top: the boxy pad
// look) drawn in along the tee's normal, and every point closer than 6.5 mm (or inside it) pushed out; the moves smoothed
// over the garment's neighbours so no dents are left
function fitJacket(doc, p, a, used, K) {
  K = { cap: +(process.env.JH_CAP ?? 0.014), hemOver: 0.05, from: 1.18, torso: 0.008, arm: 0.008, top: 0.006, low: 0.006, minOff: 0.0065, pull: 0.85, smooth: 4, ...K };
  const R = doc.getRoot(), joints = R.listSkins()[0].listJoints().map((j) => j.getName()), J = p.getAttribute('JOINTS_0').getArray(), W = p.getAttribute('WEIGHTS_0'), Wa = W.getArray(), sc = W.getNormalized() ? (Wa instanceof Uint8Array ? 255 : 65535) : 1;
  const armW = (v) => { let s = 0; for (let k = 0; k < 4; k++) if (/^(upperarm|lowerarm|wrist|finger)/.test(joints[J[v * 4 + k]] || '')) s += Wa[v * 4 + k] / sc; return s; };
  // the jeans' waistband top
  let jt = -9; for (const q of R.listMeshes().flatMap((m) => m.listPrimitives())) { const e = q.getMaterial()?.getExtras() || {}; if (e.garment === 'male_casualsuit06' && e.layer === 1) { const pa = q.getAttribute('POSITION').getArray(); for (const v of new Set(q.getIndices().getArray())) jt = Math.max(jt, pa[v * 3 + 1]); } }
  let yLow = 9; for (const v of used) if (armW(v) < 0.3) yLow = Math.min(yLow, a[v * 3 + 1]);
  const hem = jt - K.hemOver, k = (K.from - hem) / (K.from - yLow); let nh = 0;
  if (jt > 0 && yLow < hem) for (const v of used) { const y = a[v * 3 + 1]; if (y >= K.from) continue; const t = 1 - armW(v); if (t <= 0) continue; a[v * 3 + 1] = y + (K.from - (K.from - y) * k - y) * t; nh++; }
  // what the jacket is worn over: the tee (its torso and short sleeves) and the skin still drawn (forearms, neck); the
  // forge's diet took the skin under the tee out of the GLB, so the tee stands in for the body there. Each with its normal:
  // a jacket point's offset is measured along the nearest one's normal (signed: below zero it is inside the tee)
  const ref = []; for (const q of R.listMeshes().flatMap((m) => m.listPrimitives())) { const e = q.getMaterial()?.getExtras() || {}, nm = q.getMaterial()?.getName();
    if (!((e.garment === 'male_casualsuit06' && e.layer >= 2) || nm === 'skin')) continue; const pa = q.getAttribute('POSITION').getArray(), na = q.getAttribute('NORMAL').getArray();
    for (const v of new Set(q.getIndices().getArray())) if (pa[v * 3 + 1] < 1.52) ref.push([pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2], na[v * 3], na[v * 3 + 1], na[v * 3 + 2]]); }
  const cell = 0.015, G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const r of ref) { const kk = key(r[0], r[1], r[2]); (G.get(kk) || G.set(kk, []).get(kk)).push(r); }
  const near = (x, y, z) => { let best = 1e9, br = null; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let r = 1; r <= 4 && !br; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let l = -r; l <= r; l++) { const L = G.get(`${cx + i},${cy + j},${cz + l}`); if (!L) continue;
      for (const b of L) { const d = Math.hypot(b[0] - x, b[1] - y, b[2] - z); if (d < best) { best = d; br = b; } } }
    if (!br) return null; const nl = Math.hypot(br[3], br[4], br[5]) || 1, n = [br[3] / nl, br[4] / nl, br[5] / nl]; return { s: (x - br[0]) * n[0] + (y - br[1]) * n[1] + (z - br[2]) * n[2], n }; };
  const list = [...used], D = new Map(); let np = 0, mm = 0, nout = 0;
  for (const v of list) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], q = near(x, y, z); if (!q) continue;
    const aw = armW(v), top = sm(0.1, 0.15, Math.abs(x)) * sm(1.3, 1.38, y), tmax = ((K.torso + (K.low - K.torso) * sm(1.15, 1.02, y)) * (1 - aw) + K.arm * aw) * (1 - top) + K.top * top;
    // (inside the tee or closer than minOff over it: pushed out along its normal; standing off more than tmax: drawn in)
    const m = q.s < K.minOff ? K.minOff - q.s : q.s > tmax ? -(q.s - tmax) * K.pull : 0; if (!m) continue;
    D.set(v, q.n.map((c) => c * m)); if (m > 0) nout++; else { np++; mm -= m; } }
  // (smoothed over the neighbours, welded by place across the uv seams)
  const pk = (v) => `${Math.round(a[v * 3] * 4000)},${Math.round(a[v * 3 + 1] * 4000)},${Math.round(a[v * 3 + 2] * 4000)}`, nb = new Map(), I = p.getIndices().getArray();
  for (let t = 0; t < I.length; t += 3) for (const [x, y] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) { const kx = pk(x), ky = pk(y); (nb.get(kx) || nb.set(kx, new Set()).get(kx)).add(ky); (nb.get(ky) || nb.set(ky, new Set()).get(ky)).add(kx); }
  let F = new Map(); for (const v of list) { const kx = pk(v); if (!F.has(kx)) F.set(kx, D.get(v) || [0, 0, 0]); }
  for (let it = 0; it < K.smooth; it++) { const F2 = new Map(); for (const [kx, d] of F) { const s = [...d]; let c = 1; for (const ky of nb.get(kx) || []) { const e = F.get(ky); if (!e) continue; for (let q = 0; q < 3; q++) s[q] += e[q]; c++; } F2.set(kx, s.map((x) => x / c)); } F = F2; }
  const keys = list.map(pk); list.forEach((v, i) => { const d = F.get(keys[i]); for (let q = 0; q < 3; q++) a[v * 3 + q] += d[q]; });
  // (the sleeve head's top corner, where the cloth bunches as the arm comes down from the bind pose: dropped and drawn in
  // toward the neck, so the shoulder rounds off instead of standing up as a pad)
  if (K.cap) for (const v of list) { const x = a[v * 3], y = a[v * 3 + 1], w = sm(0.13, 0.19, Math.abs(x)) * sm(0.3, 0.24, Math.abs(x)) * sm(1.33, 1.41, y); if (w <= 0) continue; a[v * 3 + 1] -= K.cap * w; a[v * 3] -= Math.sign(x) * K.cap * 0.6 * w; }
  console.log('jacket fit: hem', yLow.toFixed(3), '->', hem.toFixed(3), '(waistband', jt.toFixed(3) + ')', nh, 'points; pulled in', np, 'mean mm', ((mm / Math.max(1, np)) * 1000).toFixed(1), '; pushed out over the tee', nout);
}

// the jeans: a dark rinse (raw indigo, the wash's fades taken out: the pack's are light stone-wash), the folds kept
export async function jeansPass(doc, K = {}) {
  K = { tgt: [30, 34, 46], flat: 0.7, ...K };
  const m = doc.getRoot().listMaterials().find((x) => { const e = x.getExtras() || {}; return e.garment === 'male_casualsuit06' && e.layer === 1; }), tex = m.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  const blur = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).blur(14).raw().toBuffer(), mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { if (!(data[i * 4 + 2] > data[i * 4] + 4)) continue; mask[i] = 1; for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - K.flat) + blur[i * 4 + c] * K.flat); }
  const acc = [0, 0, 0]; let n = 0; for (let i = 0; i < w * h; i++) if (mask[i]) { for (let c = 0; c < 3; c++) acc[c] += (data[i * 4 + c] / 255) ** 2.2; n++; }
  const gain = K.tgt.map((t, c) => (t / 255) ** 2.2 / (acc[c] / n)); for (let i = 0; i < w * h; i++) if (mask[i]) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(255 * ((data[i * 4 + c] / 255) ** 2.2 * gain[c]) ** (1 / 2.2)));
  const { setWebp } = await import('../young-hero/glb.mjs'); await setWebp(tex, data, w, h, 88); m.setRoughnessFactor(0.88); console.log('jeans: texels', n, 'gain', gain.map((g) => g.toFixed(2)).join(','));
}

// the tee under the fitted jacket moves as the jacket over it does: each covered point takes the jacket's skin weights at
// its nearest point (weighted apart, the arms' coming down lifted the tee through the jacket's back as matte black patches)
export function teeClearPass(doc, K = {}) {
  K = { gap: 0.004, min: 0.0015, max: 0.0035, ...K };
  const R = doc.getRoot(), jp = jacketPrim(doc), ja = jp.getAttribute('POSITION').getArray(), jv = [...new Set(jp.getIndices().getArray())];
  const sk = prim(doc, 'skin').sort((x, y) => y.getIndices().getCount() - x.getIndices().getCount())[0], bp = sk.getAttribute('POSITION').getArray();
  const grid = (pts, cell) => { const G = new Map(); for (const i of pts) { const k = `${Math.floor(i[1] / cell)},${Math.floor(i[2] / cell)},${Math.floor(i[3] / cell)}`; (G.get(k) || G.set(k, []).get(k)).push(i); } return G; };
  const nearIn = (G, cell, x, y, z, R0 = 3) => { let best = 1e9, bi = null; const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let i = -R0; i <= R0; i++) for (let j = -R0; j <= R0; j++) for (let l = -R0; l <= R0; l++) { const L = G.get(`${cx + i},${cy + j},${cz + l}`); if (!L) continue; for (const q of L) { const d = Math.hypot(q[1] - x, q[2] - y, q[3] - z); if (d < best) { best = d; bi = q; } } } return { d: best, q: bi }; };
  const cell = 0.015, BG = grid(Array.from({ length: bp.length / 3 }, (_, i) => [i, bp[i * 3], bp[i * 3 + 1], bp[i * 3 + 2]]).filter((q) => q[2] < 1.5), cell);
  // the jacket's offset off the body at each of its points
  const JG = grid(jv.map((v) => { const b = nearIn(BG, cell, ja[v * 3], ja[v * 3 + 1], ja[v * 3 + 2]); return [v, ja[v * 3], ja[v * 3 + 1], ja[v * 3 + 2], b.d]; }), cell);
  let n = 0;
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const e = p.getMaterial()?.getExtras() || {}; if (!(e.garment === 'male_casualsuit06' && e.layer >= 2)) continue;
    const P = p.getAttribute('POSITION'), a = P.getArray().slice(), TJ = p.getAttribute('JOINTS_0'), TW = p.getAttribute('WEIGHTS_0'), tj = TJ.getArray().slice(), tw = TW.getArray().slice();
    const JJ = jp.getAttribute('JOINTS_0').getArray(), JW = jp.getAttribute('WEIGHTS_0'), jw = JW.getArray(), wk = (TW.getNormalized() ? (tw instanceof Uint8Array ? 255 : 65535) : 1) / (JW.getNormalized() ? (jw instanceof Uint8Array ? 255 : 65535) : 1);
    for (const v of new Set(p.getIndices().getArray())) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], b = nearIn(BG, cell, x, y, z); if (!b.q) continue; const jq = nearIn(JG, cell, x, y, z, 4); if (!jq.q || jq.d > 0.04) continue;
      // (and it moves as the jacket over it does: the jacket's skin weights at its nearest point; with the two weighted
      // apart, the arms' coming down lifted the tee through the jacket's back)
      if (y < 1.45) for (let k = 0; k < 4; k++) { tj[v * 4 + k] = JJ[jq.q[0] * 4 + k]; tw[v * 4 + k] = Math.round(jw[jq.q[0] * 4 + k] * wk * 1e6) / 1e6; }
      n++; }
    P.setArray(a); TJ.setArray(tj); TW.setArray(tw); }
  console.log('tee weights from the jacket:', n, 'points');
}

// the tee: the forge's black tee a soft jersey black (not a dead flat black: a faint knit sheen and lift, so it reads as
// cotton against the leather)
export function teePass(doc, K = {}) {
  K = { col: [0.034, 0.034, 0.038], rough: 0.9, ...K };
  for (const m of doc.getRoot().listMaterials()) { const e = m.getExtras() || {}; if (e.garment !== 'male_casualsuit06' || e.layer !== 2) continue; m.setRoughnessFactor(K.rough); }
}
