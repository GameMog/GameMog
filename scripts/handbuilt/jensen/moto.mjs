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
  const body = parts.find(({ p }) => /^(suit-db|uniform)$/.test(p.getMaterial().getName()))?.p; if (!body) throw new Error('moto: no jacket body (suit-db | uniform)');
  // (likeness round 1: the stand-collar cut (forge-base.mjs, the library's coat): its front edge at x = +0.055, over to
  // his left, the zip run up to the collar's foot; round 4's lapelled cut had its edge at -0.034 and stopped at the lapels)
  const band = body.getMaterial().getName() === 'uniform';
  if (band) { K.edgeX = 0.0485; K.closeTop ??= 1.425; }
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
  if (band) add([0.085, 1.318], [0.15, 1.322]); else add([0.08, 1.325], [0.145, 1.36]);
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
  // (likeness round 1, the owner's reference: a moto jacket's own construction, painted (colour, roughness, relief) from
  // where each texel is on him: a yoke seam across each front and the back, double-stitched; a padded panel on each
  // shoulder's cap, quilted in rows with a stitched border; the collar's tab fastened by two snaps on his left, and a
  // second snap tab where the zip ends under the collar. Stitch thread a dark grey, the snaps gunmetal)
  const snapsC = [[0.03, 1.468, 'uniform-collar'], [0.047, 1.465, 'uniform-collar'], [0.068, 1.405, 'uniform'], [0.087, 1.401, 'uniform']];
  const stitch = (d, along, w = 0.0028) => { const r = Math.abs(Math.abs(d) - w); return r < 0.0005 && (Math.floor(along / 0.0035) % 3) !== 0; };
  const detail = (q, part) => {
    const [x, y, z] = q, ax = Math.abs(x), sx = Math.sign(x) || 1;
    for (const [cx, cy, pn] of snapsC) { if (pn !== part || z < 0) continue; const d = Math.hypot(x - cx, y - cy); if (d < 0.0042) { const t = d / 0.0042;
        return { col: [lin(92), lin(92), lin(96)].map((k) => k * (t > 0.78 ? 0.55 : 0.85 + 0.35 * (1 - t))), metal: 1, rough: 0.32, n: [((x - cx) / 0.0042) * 0.8, ((y - cy) / 0.0042) * 0.8] }; }
      if (d < 0.0055) return { k: 0.6, n: [0, 0] }; }
    // the snap tabs' outlines: a strap 15 mm tall round each pair, stitched
    if (part === 'uniform' && z > 0.04) { const tx0 = 0.056, tx1 = 0.099, ty = 1.403 + (0.084 - x) * 0.2, dy = y - ty; if (x > tx0 && x < tx1 && Math.abs(dy) < 0.0085) { const e = Math.min(x - tx0, tx1 - x, 0.0085 - Math.abs(dy)); if (e < 0.0009) return { k: 0.45, n: [0, 0.4 * Math.sign(dy)] }; if (Math.abs(e - 0.0025) < 0.0004) return { k: 1.9 }; return { k: 1.05 }; } }
    if (part !== 'uniform') return null;
    // the yokes: across the front at 1.37 (rising a little to the shoulder) and across the back at 1.395
    if (y > 1.3 && y < 1.47 && ax < 0.2) { const front = z > 0.03, yl = front ? 1.372 + 0.12 * Math.max(0, ax - 0.06) : 1.395, d = y - yl;
      if ((front ? ax > 0.012 && !(x > 0.04 && x < 0.06) : true) && Math.abs(d) < 0.0045) { if (Math.abs(d) < 0.0007) return { k: 0.4, n: [0, 0.5 * Math.sign(d)], rough: 0.06 }; if (stitch(d, x, 0.0026)) return { k: 2.1 }; if (d > 0 && d < 0.0035) return { k: 1.08, n: [0, -0.15] }; } }
    // the shoulders' padded panels: an oval on each cap, quilted across in 11 mm rows, its border stitched
    { const C = [sx * 0.215, 1.405, 0.02], u = (ax - 0.215) / 0.06, v = (y - 1.405 - (ax - 0.215) * -0.55) / 0.04, w = (z - 0.02) / 0.075, r = Math.hypot(u, v * 0.0 + w);
      if (y > 1.36 - (ax - 0.17) * 0.6 && r < 1 && ax > 0.15) { const e = 1 - r; if (e < 0.04) return { k: 0.5, n: [0, 0] }; if (Math.abs(e - 0.085) < 0.018) return { k: 1.8 };
        const ph = (z + (ax - 0.215) * 0.15) / 0.011, f = ph - Math.floor(ph), seam = Math.abs(f - 0.5) > 0.44; if (seam) return { k: 0.62, n: [0, 0] };
        return { k: 0.9 + 0.22 * Math.sin(f * Math.PI), n: [0, Math.cos(f * Math.PI) * 0.45] }; } }
    return null; };
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
        if (pull || (inTeeth && tooth)) { col = (band ? [lin(74), lin(74), lin(78)] : [lin(178), lin(178), lin(180)]).map((k) => k * (0.72 + 0.3 * (1 - z.d / w))); metal = band ? 0.7 : 1; rough = band ? 0.45 : 0.3; nAdd = [0, pull ? 0 : (along % 0.0024) / 0.0024 - 0.5]; }
        else { col = [lin(11), lin(11), lin(12)]; rough = 0.72; nAdd = [0, 0]; } nz++; break; }
      if (band && !metal) { const D = detail(q, mat.getName()); if (D) { if (D.col) col = D.col; else col = col.map((c0) => c0 * D.k); if (D.metal != null) { metal = D.metal; rough = D.rough; } else rough += D.rough || 0; if (D.n) nAdd = D.n; } }
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

// (likeness round 1) the stand collar made a moto jacket's band: the library's uniform collar (about 1.5 cm) raised to
// k times its height, each point by its share of the band's height at its angle round the neck (so the foot stays
// sewn into the neckline), the top drawn in a little toward the neck's middle so it stands close, not flared
export function collarPass(doc, K = {}) {
  K = { k: 1.9, inT: 0.12, ...K };
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { if (p.getMaterial()?.getName() !== 'uniform-collar') continue;
    const P = p.getAttribute('POSITION'), a = P.getArray().slice(), n = a.length / 3; let cx = 0, cz = 0; for (let v = 0; v < n; v++) { cx += a[v * 3]; cz += a[v * 3 + 2]; } cx /= n; cz /= n;
    const NB = 36, lo = new Float32Array(NB).fill(9), hi = new Float32Array(NB).fill(-9), bin = (v) => Math.floor(((Math.atan2(a[v * 3] - cx, a[v * 3 + 2] - cz) + Math.PI) / (2 * Math.PI)) * NB) % NB;
    for (let v = 0; v < n; v++) { const b = bin(v); lo[b] = Math.min(lo[b], a[v * 3 + 1]); hi[b] = Math.max(hi[b], a[v * 3 + 1]); }
    for (let v = 0; v < n; v++) { const b = bin(v), H = hi[b] - lo[b]; if (H <= 0.002) continue; const f = (a[v * 3 + 1] - lo[b]) / H;
      a[v * 3 + 1] = lo[b] + f * H * K.k; const pull = K.inT * f * f; a[v * 3] += (cx - a[v * 3]) * pull * 0.25; a[v * 3 + 2] += (cz - a[v * 3 + 2]) * pull * 0.25; }
    P.setArray(a); console.log('collar: raised x', K.k); }
}

// (likeness round 1) under the stand-collar jacket, the tee and its bound neckline are cut away over the shoulders'
// tops (more than 5.5 cm out from the neck's middle, above 1.38 m): the jacket covers them there, and in the idle and
// talk clips their edges came up through the jacket's shoulders beside the collar as black shards
export function teeShoulderPass(doc, K = {}) {
  K = { x: 0.055, y: 1.38, ...K };
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const m = p.getMaterial(), e = m?.getExtras() || {};
    if (!(m?.getName() === 'neckline' || (e.garment === 'male_casualsuit06' && e.layer === 2))) continue;
    const a = p.getAttribute('POSITION').getArray(), I = p.getIndices(), ia = I.getArray(), keep = [];
    const out = (v) => Math.abs(a[v * 3]) > K.x && a[v * 3 + 1] > K.y;
    for (let t = 0; t < ia.length; t += 3) { if (out(ia[t]) && out(ia[t + 1]) && out(ia[t + 2])) continue; keep.push(ia[t], ia[t + 1], ia[t + 2]); }
    console.log('tee shoulders:', m.getName(), (ia.length - keep.length) / 3, 'triangles cut'); I.setArray(new ia.constructor(keep)); }
}
