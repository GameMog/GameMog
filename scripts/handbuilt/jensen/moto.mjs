// Hand-built Jensen, round 4: the black leather moto jacket on the forge library's tailored jacket (forge-base.mjs: the
// double-breasted cut, its front edge off to his right (an asymmetric closure), hemmed at the belt, full sleeves to the
// wrist, natural shoulders, turned collar and lapels). This pass makes it a moto jacket:
//  buttons  the six buttons taken off (it zips)
//  leather  every piece (body, hem band, collar, lapels) repainted as black leather: ambientCG Leather026's colour (CC0)
//           as a fine mottle over a deep warm black, the library's own shading (its folds, seams and turned edges) kept
//           as a ratio round its middle; a roughness map (G) round 0.5 varied by Poly Haven leather_white's (CC0) grain,
//           the seams a little rougher, so the sun draws a soft leather sheen, not plastic. The library's own normal map
//           (its pebbled leather grain, seams and folds) is kept. Tagged garment 'leather-moto-jacket' (Mog City's polish
//           then weaves leather over it, not wool)
//  zips     plain silver (no maker's mark): the closure up the overlapping front edge from the hem to the lapels, two
//           slanted hand-warmer pockets low on the front, a slanted chest pocket on his left, a short zip at each cuff;
//           each zip a chain of teeth on a black tape, set in a darker welt with a little relief, a pull at its start
// Sources (CC0, downloaded 18 Nov 2026; see storykit/handbuilt/jensen/CREDITS.md): ambientCG Leather026, Poly Haven
// leather_white.
import { rgba, raster, fbm, sm, clamp, sharp } from '../young-hero/glb.mjs';

const MATS = process.env.JH_MATERIALS || new URL('../../../.scratch/jensen/materials/', import.meta.url).pathname;
async function tile(file, S) { const { data } = await sharp(file).resize(S, S).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, S }; }
const samp = (T, u, v, c) => { const x = ((Math.floor(u * T.S) % T.S) + T.S) % T.S, y = ((Math.floor(v * T.S) % T.S) + T.S) % T.S; return T.d[(y * T.S + x) * 3 + c]; };
const isMoto = (m) => m?.getExtras()?.garment === 'moto-jacket' || m?.getExtras()?.garment === 'leather-moto-jacket';

export async function motoPass(doc, K = {}) {
  K = { black: [24, 23, 24], tileM: 0.2, rough: 0.5, zipW: 0.0058, edgeX: -0.034, ...K };
  const R = doc.getRoot(), prims = R.listMeshes().flatMap((m) => m.listPrimitives().map((p) => ({ m, p }))).filter(({ p }) => isMoto(p.getMaterial()));
  // the buttons off
  for (const { m, p } of prims) if (/buttons/.test(p.getMaterial().getName())) { m.removePrimitive(p); if (!m.listPrimitives().length) for (const n of R.listNodes()) if (n.getMesh() === m) n.setMesh(null); }
  const parts = prims.filter(({ p }) => !/buttons/.test(p.getMaterial().getName()));
  const body = parts.find(({ p }) => p.getMaterial().getName() === 'suit-db')?.p; if (!body) throw new Error('moto: no jacket body (suit-db)');
  const BA = body.getAttribute('POSITION').getArray(), BV = [...new Set(body.getIndices().getArray())];
  // the hem's height and the V's bottom (the highest point of the closure edge's line on the front below the lapels)
  let hem = 9; for (const v of BV) if (BA[v * 3 + 2] > 0.05) hem = Math.min(hem, BA[v * 3 + 1]);
  const front = (x, y) => { let best = -9, bp = null; for (const v of BV) { if (Math.abs(BA[v * 3] - x) > 0.012 || Math.abs(BA[v * 3 + 1] - y) > 0.012) continue; if (BA[v * 3 + 2] > best) { best = BA[v * 3 + 2]; bp = [BA[v * 3], BA[v * 3 + 1], BA[v * 3 + 2]]; } } return bp; };
  const zips = [];
  const add = (P, Q, kind = 'pocket') => { const A = front(...P), B = front(...Q); if (A && B) zips.push({ A, B, kind }); };
  // the closure: the overlapping front's edge (the library's double-breasted edge, x = edgeX) from the hem to 2 cm under
  // the lapels' meeting point, laid as segments along the front so it follows the chest's curve
  const yTop = +(K.closeTop ?? 1.3);
  { let prev = null; for (let y = hem + 0.006; y <= yTop + 1e-6; y += 0.03) { const P = front(K.edgeX + 0.0035, Math.min(y, yTop)); if (prev && P) zips.push({ A: prev, B: P, kind: 'close' }); prev = P; } }
  // the pockets: two slanted hand-warmers, a slanted chest zip on his left (+x)
  for (const s of [1, -1]) add([s * 0.072, hem + 0.035], [s * 0.128, hem + 0.135]);
  add([0.08, 1.325], [0.145, 1.36]);
  // the cuffs: from each sleeve's end, on its outer side (the top of the arm in the bind pose), 7 cm toward the elbow
  for (const s of [1, -1]) { const sl = BV.filter((v) => Math.sign(BA[v * 3]) === s && Math.abs(BA[v * 3]) > 0.25); if (!sl.length) continue;
    const end = sl.reduce((m, v) => (Math.abs(BA[v * 3]) > Math.abs(BA[m * 3]) ? v : m), sl[0]), ex = Math.abs(BA[end * 3]);
    const ring = sl.filter((v) => Math.abs(BA[v * 3]) > ex - 0.025), top = ring.reduce((m, v) => (BA[v * 3 + 1] > BA[m * 3 + 1] ? v : m), ring[0]);
    const el = sl.filter((v) => Math.abs(BA[v * 3]) < ex - 0.1 && Math.abs(BA[v * 3]) > ex - 0.14); const ec = [0, 1, 2].map((c) => el.reduce((q, v) => q + BA[v * 3 + c], 0) / Math.max(1, el.length));
    const T = [BA[top * 3], BA[top * 3 + 1], BA[top * 3 + 2]], ax = [0, 1, 2].map((c) => T[c] - ec[c]), L = Math.hypot(...ax) || 1;
    zips.push({ A: T.map((t, c) => t - (ax[c] / L) * 0.006), B: T.map((t, c) => t - (ax[c] / L) * 0.07), kind: 'cuff', tol: 0.01 }); }
  console.log('moto: hem', hem.toFixed(3), 'zips', zips.length, zips.map((z) => z.kind).join(','));
  const segD = (q, A, B) => { const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9, t = clamp(((q[0] - A[0]) * ab[0] + (q[1] - A[1]) * ab[1] + (q[2] - A[2]) * ab[2]) / L2);
    return { d: Math.hypot(q[0] - A[0] - ab[0] * t, q[1] - A[1] - ab[1] * t, q[2] - A[2] - ab[2] * t), t, L: Math.sqrt(L2) }; };
  // (the closure as one chain: its distance along from the hem, so its teeth run on without a break between segments)
  const closeLen = []; { let acc = 0; for (const z of zips) if (z.kind === 'close') { closeLen.push(acc); acc += Math.hypot(z.B[0] - z.A[0], z.B[1] - z.A[1], z.B[2] - z.A[2]); } }
  const LC = await tile(MATS + 'Leather026_Color.jpg', 1024), LR = await tile(MATS + 'leather_white_rough.jpg', 1024);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  let nz = 0;
  for (const { p } of parts) {
    const mat = p.getMaterial(), tex = mat.getBaseColorTexture(); if (!tex) continue; const { data: O, w: S } = await rgba(tex);
    const nt = mat.getNormalTexture(), N = nt ? await rgba(nt) : null, NS = N?.w || 0;
    const a = p.getAttribute('POSITION').getArray(), uv = p.getAttribute('TEXCOORD_0').getArray(), I = p.getIndices().getArray();
    // metres per uv unit (median), for the leather tile's size on the body
    const rr = []; for (let t = 0; t < I.length; t += 6) { const x = I[t], y = I[t + 1], du = Math.hypot(uv[x * 2] - uv[y * 2], uv[x * 2 + 1] - uv[y * 2 + 1]); if (du > 1e-6) rr.push(Math.hypot(a[x * 3] - a[y * 3], a[x * 3 + 1] - a[y * 3 + 1], a[x * 3 + 2] - a[y * 3 + 2]) / du); }
    rr.sort((x, y) => x - y); const rep = (rr[rr.length >> 1] || 1) / K.tileM;
    // the piece's middle light (its painted shading), for the ratio
    const Ls = []; for (let i = 0; i < S * S; i += 7) Ls.push((O[i * 4] + O[i * 4 + 1] + O[i * 4 + 2]) / 3); Ls.sort((x, y) => x - y); const Lmid = Math.max(8, Ls[Ls.length >> 1]);
    const base = Buffer.alloc(S * S * 4), mr = Buffer.alloc(S * S * 4); for (let i = 0; i < S * S; i++) { base.set([K.black[0], K.black[1], K.black[2], 255], i * 4); mr.set([255, Math.round(K.rough * 255), 0, 255], i * 4); }
    const nm = N ? Buffer.from(N.data) : null;
    raster(I, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, A, B, C) => {
      const i = y * S + x, q = [0, 1, 2].map((c) => l1 * a[A * 3 + c] + l2 * a[B * 3 + c] + l3 * a[C * 3 + c]);
      const L0 = (O[i * 4] + O[i * 4 + 1] + O[i * 4 + 2]) / 3, shade = Math.pow(clamp(L0 / Lmid, 0.5, 1.6), 0.9);
      const u = x / S, v = y / S, gu = u * rep, gv = v * rep, lcL = (samp(LC, gu, gv, 0) + samp(LC, gu, gv, 1) + samp(LC, gu, gv, 2)) / 3;
      const mott = 0.92 + 0.16 * fbm(q[0], q[1], q[2], 9), grain = clamp(0.85 + 0.3 * (lcL / 60), 0.75, 1.25);
      let col = K.black.map((k, c) => lin(k) * shade * mott * grain * (c === 0 ? 1.02 : c === 2 ? 0.98 : 1));
      let rough = K.rough + (samp(LR, gu, gv, 1) / 255 - 0.5) * 0.25 + (shade < 0.8 ? 0.06 : 0), metal = 0, nAdd = null;
      for (let zi = 0, ci = 0; zi < zips.length; zi++) { const Z = zips[zi], z = segD(q, Z.A, Z.B), W = K.zipW * (Z.kind === 'close' ? 1.15 : 1), tol = Z.tol || 0;
        if (Z.kind === 'close') ci++; if (z.d > W * 1.7 + tol) continue; if (Z.kind === 'cuff' && z.d > W * 1.7) continue;
        const along = (Z.kind === 'close' ? closeLen[ci - 1] : 0) + z.t * z.L, w = W * 0.85;
        if (z.d >= w) { col = col.map((c0) => c0 * 0.55); nAdd = [0, ((z.d - w) / (W * 0.85)) * 0.6]; rough += 0.08; continue; }
        const tooth = (Math.floor(along / 0.0024) % 2) === 0, inTeeth = z.d < w * 0.5, pull = Z.kind !== 'close' && z.t < 0.1 && z.d < w * 0.95;
        if (pull || (inTeeth && tooth)) { col = [lin(178), lin(178), lin(180)].map((k) => k * (0.72 + 0.3 * (1 - z.d / w))); metal = 1; rough = 0.3; nAdd = [0, pull ? 0 : (along % 0.0024) / 0.0024 - 0.5]; }
        else { col = [lin(11), lin(11), lin(12)]; rough = 0.72; nAdd = [0, 0]; } nz++; break; }
      base[i * 4] = enc(col[0]); base[i * 4 + 1] = enc(col[1]); base[i * 4 + 2] = enc(col[2]);
      mr[i * 4 + 1] = Math.round(clamp(rough, 0.22, 0.95) * 255); mr[i * 4 + 2] = Math.round(metal * 255);
      if (nm && nAdd) { const X = Math.min(NS - 1, Math.floor(u * NS)), Y = Math.min(NS - 1, Math.floor(v * NS)), j = (Y * NS + X) * 4; let nx = nAdd[0], ny = nAdd[1], nz2 = 1; const l = Math.hypot(nx, ny, nz2); nm[j] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[j + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[j + 2] = Math.round((nz2 / l * 0.5 + 0.5) * 255); }
    }, 0.04);
    const mk = async (name, buf, q, w = S) => doc.createTexture(name).setImage(await sharp(buf, { raw: { width: w, height: w, channels: 4 } }).removeAlpha().webp({ quality: q, effort: 5 }).toBuffer()).setMimeType('image/webp');
    mat.setBaseColorTexture(await mk(mat.getName() + '-leather', base, 90)).setMetallicRoughnessTexture(await mk(mat.getName() + '-mr', mr, 90)).setRoughnessFactor(1).setMetallicFactor(1);
    if (nm) mat.setNormalTexture(await mk(mat.getName() + '-normal', nm, 92, NS));
    mat.setExtras({ ...mat.getExtras(), garment: 'leather-moto-jacket' });
  }
  console.log('moto: leather on', parts.length, 'pieces; zip texels', nz);
}

// the tee under the short jacket: its hem (9 cm under the jacket's at the forge's length, a long undershirt's) taken up
// to `hem` (3-4 cm showing under the leather, over the jeans' waistband), the cloth from `from` down drawn up into the
// shorter length; the sleeves left as they are
export function teeHemPass(doc, K = {}) {
  K = { hem: 0.975, from: 1.07, ...K };
  const R = doc.getRoot(), jn = R.listSkins()[0].listJoints().map((j) => j.getName()); let n = 0;
  for (const p of R.listMeshes().flatMap((m) => m.listPrimitives())) { const e = p.getMaterial()?.getExtras() || {}; if (!(e.garment === 'male_casualsuit06' && e.layer === 2)) continue;
    const P = p.getAttribute('POSITION'), a = P.getArray().slice(), J = p.getAttribute('JOINTS_0').getArray(), W = p.getAttribute('WEIGHTS_0'), Wa = W.getArray(), sc = W.getNormalized() ? (Wa instanceof Uint8Array ? 255 : 65535) : 1;
    const used = [...new Set(p.getIndices().getArray())]; let lo = 9; for (const v of used) lo = Math.min(lo, a[v * 3 + 1]); if (lo >= K.hem) continue;
    const k = (K.from - K.hem) / (K.from - lo);
    for (const v of used) { const y = a[v * 3 + 1]; if (y >= K.from) continue; let arm = 0; for (let q = 0; q < 4; q++) if (/^(upperarm|lowerarm|wrist|finger)/.test(jn[J[v * 4 + q]] || '')) arm += Wa[v * 4 + q] / sc; const t = 1 - Math.min(1, arm * 2); if (t <= 0) continue;
      a[v * 3 + 1] = y + (K.from - (K.from - y) * k - y) * t; n++; }
    P.setArray(a); console.log('tee hem:', lo.toFixed(3), '->', K.hem, 'points', n); }
}
