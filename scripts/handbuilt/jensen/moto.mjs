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
import { rgba, raster, fbm, sm, clamp, sharp, setWebp } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';

const MATS = process.env.JH_MATERIALS || new URL('../../../.scratch/jensen/materials/', import.meta.url).pathname;
async function tile(file, S) { const { data } = await sharp(file).resize(S, S).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, S }; }
const samp = (T, u, v, c) => { const x = ((Math.floor(u * T.S) % T.S) + T.S) % T.S, y = ((Math.floor(v * T.S) % T.S) + T.S) % T.S; return T.d[(y * T.S + x) * 3 + c]; };
const isMoto = (m) => m?.getExtras()?.garment === 'moto-jacket' || m?.getExtras()?.garment === 'leather-moto-jacket';

export async function motoPass(doc, K = {}) {
  K = { black: [15, 15, 16], tileM: 0.2, rough: 0.46, zipW: 0.0058, edgeX: -0.034, ...K }; // (likeness round 3: near-black, a firmer sheen)
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
  // (likeness round 3, the critic: the seams read as dashed tape: now a fine stitch, 0.35 mm thread, 2.4 mm stitches with
  // 0.8 mm gaps, beside a thin recessed seam line)
  const stitch = (d, along, w = 0.0028) => { const r = Math.abs(Math.abs(d) - w); return r < 0.00035 && (along % 0.0032) < 0.0024; };
  const detail = (q, part) => {
    const [x, y, z] = q, ax = Math.abs(x), sx = Math.sign(x) || 1;
    for (const [cx, cy, pn] of snapsC) { if (pn !== part || z < 0) continue; const d = Math.hypot(x - cx, y - cy); if (d < 0.0042) { const t = d / 0.0042;
        return { col: [lin(92), lin(92), lin(96)].map((k) => k * (t > 0.78 ? 0.55 : 0.85 + 0.35 * (1 - t))), metal: 1, rough: 0.32, n: [((x - cx) / 0.0042) * 0.8, ((y - cy) / 0.0042) * 0.8] }; }
      if (d < 0.0055) return { k: 0.6, n: [0, 0] }; }
    // the snap tabs' outlines: a strap 15 mm tall round each pair, stitched
    if (part === 'uniform' && z > 0.04) { const tx0 = 0.056, tx1 = 0.099, ty = 1.403 + (0.084 - x) * 0.2, dy = y - ty; if (x > tx0 && x < tx1 && Math.abs(dy) < 0.0085) { const e = Math.min(x - tx0, tx1 - x, 0.0085 - Math.abs(dy)); if (e < 0.0009) return { k: 0.45, n: [0, 0.4 * Math.sign(dy)] }; if (Math.abs(e - 0.0025) < 0.0004) return { k: 3.0 }; return { k: 1.05 }; } }
    if (part !== 'uniform') return null;
    // the yokes: across the front at 1.37 (rising a little to the shoulder) and across the back at 1.395
    if (y > 1.3 && y < 1.47 && ax < 0.2) { const front = z > 0.03, yl = front ? 1.372 + 0.12 * Math.max(0, ax - 0.06) : 1.395, d = y - yl;
      if ((front ? ax > 0.012 && !(x > 0.04 && x < 0.06) : true) && Math.abs(d) < 0.0045) { if (Math.abs(d) < 0.0009) return { k: 0.22, n: [0, 0.7 * Math.sign(d)], rough: 0.1 }; if (stitch(d, x, 0.0024)) return { k: 2.4 }; if (d > 0 && d < 0.0045) return { k: 1.1, n: [0, -0.3], rough: -0.04 }; } }
    // (likeness round 2b, the owner's reference: the fronts' horizontal panel seams across the chest and over the waist,
    // a raised welt with a double row of stitching each side, readable at a webcam's distance)
    if (z > 0.03 && ax > 0.012 && ax < 0.2 && !(x > 0.04 && x < 0.06)) for (const yl0 of [1.288, 1.168]) { const d = y - (yl0 + 0.02 * Math.max(0, ax - 0.1));
      if (Math.abs(d) < 0.006) { if (Math.abs(d) < 0.0009) return { k: 0.22, n: [0, 0.7 * Math.sign(d)], rough: 0.1 }; if (stitch(d, x, 0.0024) || stitch(d, x, 0.0038)) return { k: 2.4 }; if (Math.abs(d) < 0.0045) return { k: 1.1, n: [0, -0.3 * Math.sign(d)], rough: -0.04 }; } }
    // the shoulders' padded panels (likeness round 3: on tailorPass's raised pads, the same ellipsoid): a recessed seam
    // round each, a fine stitch inside it, the panel's leather a little smoother (rubbed), two soft quilting lines across
    { const d = Math.hypot((ax - 0.2) / 0.055, (y - 1.4) / 0.05, (z - 0.03) / 0.07);
      if (d < 1.02) { if (d > 0.95) return { k: 0.35, n: [0, 0] }; const ed = (0.95 - d) * 0.055; if (Math.abs(ed - 0.0028) < 0.00035 && (Math.abs(z * 1.3 + y) % 0.0032) < 0.0024) return { k: 2.2 };
        const ph = (z - 0.03) / 0.022 + 0.5, f = ph - Math.floor(ph); if (Math.abs(f - 0.5) > 0.47 && d < 0.85) return { k: 0.55, n: [0, 0.3] };
        return { k: 1.02 + 0.04 * Math.sin(f * Math.PI), n: [0, Math.cos(f * Math.PI) * 0.25], rough: -0.05 }; } }
    return null; };
  const LC = await tile(MATS + 'Leather026_Color.jpg', 1024), LR = await tile(MATS + 'leather_white_rough.jpg', 1024);
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  let nz = 0;
  for (const { p } of parts) {
    const mat = p.getMaterial(), tex = mat.getBaseColorTexture(); if (!tex || mat.getExtras()?.bandPainted) continue; const { data: O, w: S } = await rgba(tex); // (round 3: collar.mjs paints its own band)
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
      const L0 = (O[i * 4] + O[i * 4 + 1] + O[i * 4 + 2]) / 3, shade = Math.pow(clamp(L0 / Lmid, 0.75, 1.25), 0.5); // (round 3: the library's painted folds a third as strong: they read as lumps)
      const u = x / S, v = y / S, gu = u * rep, gv = v * rep, lcL = (samp(LC, gu, gv, 0) + samp(LC, gu, gv, 1) + samp(LC, gu, gv, 2)) / 3;
      const mott = 0.96 + 0.08 * fbm(q[0], q[1], q[2], 9), grain = clamp(0.94 + 0.12 * (lcL / 60), 0.9, 1.1); // (round 3: no grey-brown mottle)
      let col = K.black.map((k, c) => lin(k) * shade * mott * grain * (c === 0 ? 1.02 : c === 2 ? 0.98 : 1));
      let rough = K.rough + (samp(LR, gu, gv, 1) / 255 - 0.5) * 0.2 + (shade < 0.9 ? 0.05 : 0), metal = 0, nAdd = null;
      // (likeness round 2: worn leather, not vinyl: a broad sheen variation (rubbed smooth over the shoulders and chest,
      // drier elsewhere) and soft creases, mostly across the body and the sleeves, from a ridged noise; its slope tilts the
      // normal map's own grain)
      let crease = null; if (band) { const cr = (X, Y, Z) => 1 - Math.abs(2 * fbm(X * 0.8, Y * 2.6, Z * 0.8, 14, 2) - 1); const c0 = cr(...q), e = 0.004;
        crease = [(cr(q[0] + e, q[1], q[2]) - c0) / e * 0.0013, (cr(q[0], q[1] + e, q[2]) - c0) / e * 0.0013]; rough += (fbm(q[0], q[1], q[2], 4) - 0.5) * 0.22 - 0.06 * c0 * c0;
        col = col.map((c1) => c1 * (1.0 + 0.03 * c0 * c0)); } // (round 2b: the creases a third as deep: they read as crumpled paper)
      for (let zi = 0, ci = 0; zi < zips.length; zi++) { const Z = zips[zi], z = segD(q, Z.A, Z.B), W = K.zipW * (Z.kind === 'close' ? 1.15 : 1), tol = Z.tol || 0;
        if (Z.kind === 'close') ci++; if (z.d > W * 1.7 + tol) continue; if (Z.kind === 'cuff' && z.d > W * 1.7) continue;
        const along = (Z.kind === 'close' ? closeLen[ci - 1] : 0) + z.t * z.L, w = W * 0.85;
        if (z.d >= w) { col = col.map((c0) => c0 * 0.55); nAdd = [0, ((z.d - w) / (W * 0.85)) * 0.6]; rough += 0.08; continue; }
        // (likeness round 2: a dark gunmetal chain, fine teeth with a soft highlight on a near-black tape: it read as a white
        // dashed stripe)
        const TP = band ? 0.0017 : 0.0024, tooth = (Math.floor(along / TP) % 2) === 0, inTeeth = z.d < w * (band ? 0.42 : 0.5), pull = Z.kind !== 'close' && z.t < 0.1 && z.d < w * 0.95;
        if (pull || (inTeeth && (tooth || band))) { const f = band ? 0.75 + 0.35 * Math.sin(((along % TP) / TP) * Math.PI) : 0.72 + 0.3 * (1 - z.d / w); col = (band ? [lin(46), lin(46), lin(50)] : [lin(178), lin(178), lin(180)]).map((k) => k * f); metal = band ? 0.85 : 1; rough = band ? 0.38 : 0.3; nAdd = [0, pull ? 0 : (along % TP) / TP - 0.5]; }
        else { col = [lin(band ? 14 : 11), lin(band ? 14 : 11), lin(band ? 15 : 12)]; rough = 0.72; nAdd = [0, 0]; } nz++; break; }
      if (band && !metal) { const D = detail(q, mat.getName()); if (D) { if (D.col) col = D.col; else col = col.map((c0) => c0 * D.k); if (D.metal != null) { metal = D.metal; rough = D.rough; } else rough += D.rough || 0; if (D.n) nAdd = D.n; } }
      base[i * 4] = enc(col[0]); base[i * 4 + 1] = enc(col[1]); base[i * 4 + 2] = enc(col[2]);
      mr[i * 4 + 1] = Math.round(clamp(rough, 0.22, 0.95) * 255); mr[i * 4 + 2] = Math.round(metal * 255);
      if (nm && !nAdd && crease) { const X = Math.min(NS - 1, Math.floor(u * NS)), Y = Math.min(NS - 1, Math.floor(v * NS)), j = (Y * NS + X) * 4; let nx = nm[j] / 127.5 - 1 + crease[0] * 0.9, ny = nm[j + 1] / 127.5 - 1 - crease[1] * 0.9, nz2 = nm[j + 2] / 127.5 - 1; const l = Math.hypot(nx, ny, nz2) || 1; nm[j] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[j + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); nm[j + 2] = Math.round((nz2 / l * 0.5 + 0.5) * 255); }
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

// (likeness round 2b: the tee's crew neck in the jacket's open collar. The forge's tee sits under the jacket's front, so
// the collar's V showed a strip of bare neck down to the jacket (a slit, the neck a long column). The neck's skin there,
// below a crew line, painted as the tee's black knit with a 9 mm ribbed band at its edge, as his tee shows in the V)
export async function teeCrewPass(doc, K = {}) {
  K = { y0: 1.468, curve: 6, rib: 0.009, ...K };
  const { tex, img, S, N2, pos } = await texelPos(doc), d = img.data; let n = 0;
  for (let i = 0; i < N2; i++) { const x = pos[i * 3]; if (Number.isNaN(x)) continue; const y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (z < 0.0 || Math.abs(x) > 0.075 || y > K.y0 + 0.03 || y < 1.3) continue;
    const yc = K.y0 + K.curve * x * x, e = yc - y; if (e < -0.0008) continue; const a = clamp((e + 0.0008) / 0.0012);
    const inRib = e < K.rib, rib = inRib ? 0.85 + 0.3 * Math.max(0, Math.sin((x / 0.0016) * Math.PI)) : 1, edge = e < 0.0012 ? 1.25 : 1, sh = e > K.rib && e < K.rib + 0.0008 ? 0.7 : 1;
    const c = [17, 17, 18].map((q) => q * rib * edge * sh);
    for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.round(d[i * 4 + k] * (1 - a) + c[k] * a); n++; }
  await setWebp(tex, d, S, S, 90); console.log('tee crew: texels', n);
}

// (likeness round 2b, the critic and the owner: the jacket's front followed the chest under it, a rounded bust with the
// leather drawn in under it, a wetsuit's shape. A leather jacket hangs from the chest's fullest line straight to the
// hem. Each 1 cm column of the body's front (its points by height and depth) let out to the upper hull of its own
// profile: the hollow under the chest filled, the front falling straight, the chest's top a touch flatter (K.flat))
export function drapePass(doc, K = {}) {
  K = { y0: 1.0, y1: 1.43, xMax: 0.17, flat: 0.35, ...K };
  const p = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((q) => q.getMaterial()?.getName() === 'uniform'); if (!p) return;
  const P = p.getAttribute('POSITION'), a = P.getArray().slice(), n = a.length / 3, cols = new Map();
  for (let v = 0; v < n; v++) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z < 0.03 || Math.abs(x) > K.xMax || y < K.y0 || y > K.y1) continue; const c = Math.round(x / 0.01); (cols.get(c) || cols.set(c, []).get(c)).push(v); }
  let moved = 0, peak = 0;
  for (const vs of cols.values()) { const pts = vs.map((v) => [a[v * 3 + 1], a[v * 3 + 2]]).sort((p1, p2) => p1[0] - p2[0]); const H = [];
    for (const q of pts) { while (H.length >= 2) { const [o, b] = [H[H.length - 2], H[H.length - 1]]; if ((b[0] - o[0]) * (q[1] - o[1]) - (b[1] - o[1]) * (q[0] - o[0]) >= 0) H.pop(); else break; } H.push(q); }
    const hull = (y) => { for (let k = 0; k < H.length - 1; k++) if (y >= H[k][0] && y <= H[k + 1][0]) { const t = (y - H[k][0]) / (H[k + 1][0] - H[k][0] || 1); return H[k][1] + t * (H[k + 1][1] - H[k][1]); } return null; };
    const zs = pts.map((q) => q[1]), zMax = Math.max(...zs);
    for (const v of vs) { const y = a[v * 3 + 1], z = a[v * 3 + 2], h = hull(y); if (h == null) continue; const fe = sm(K.y0, K.y0 + 0.04, y) * sm(K.y1, K.y1 - 0.04, y);
      let nz = z + (h - z) * fe; nz -= K.flat * Math.max(0, nz - (zMax - 0.012)) * fe; if (Math.abs(nz - z) > 1e-5) { moved++; peak = Math.max(peak, Math.abs(nz - z)); a[v * 3 + 2] = nz; } } }
  P.setArray(a); console.log('drape: points', moved, 'peak mm', (peak * 1000).toFixed(1));
}

// (likeness round 3, the critic: the jacket read as a lumpy, rounded, crumpled rubber shell with a barrel chest; the
// reference is a fitted moto cut: a flat chest, straight sides, defined shoulders, padded shoulder caps. On the body
// piece ('uniform'), its points welded by position:
//  smooth   Taubin smoothing (no shrink) over the torso, its open edges held, so the library's and the drape's lumps go
//  flat     the front's depth over the chest drawn K.flat of the way toward its own smoothed plane (no barrel)
//  pads     each shoulder cap's padded panel raised K.pad (a soft dome, its border sharper, as a sewn-in pad is), so it
//           shows from the front as a rounded panel over the cap)
export function tailorPass(doc, K = {}) {
  K = { iters: 14, lam: 0.5, mu: -0.53, flat: 0.35, pad: 0.0045, padC: [0.2, 1.4, 0.03], padR: [0.055, 0.05, 0.07], ...K };
  const p = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((q) => q.getMaterial()?.getName() === 'uniform'); if (!p) return;
  const P = p.getAttribute('POSITION'), a = P.getArray().slice(), n = a.length / 3, I = p.getIndices().getArray();
  const key = new Map(), rep = new Int32Array(n); for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  const edges = new Map(), nb = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const A = rep[I[t + e]], B = rep[I[t + (e + 1) % 3]]; if (A === B) continue; const k = A < B ? A + ',' + B : B + ',' + A; edges.set(k, (edges.get(k) || 0) + 1);
    for (const [u, w] of [[A, B], [B, A]]) (nb.get(u) || nb.set(u, new Set()).get(u)).add(w); }
  const open = new Set(); for (const [k, c] of edges) if (c === 1) for (const v of k.split(',')) open.add(+v);
  let hem = 9; for (let v = 0; v < n; v++) hem = Math.min(hem, a[v * 3 + 1]);
  const mask = new Float32Array(n); for (const v of nb.keys()) { if (open.has(v)) continue; const x = Math.abs(a[v * 3]), y = a[v * 3 + 1]; mask[v] = sm(0.25, 0.2, x) * sm(hem + 0.01, hem + 0.05, y) * sm(1.5, 1.45, y); }
  const step = (f) => { const o = a.slice(); for (const [v, s] of nb) { const m = mask[v]; if (!m) continue; let cx = 0, cy = 0, cz = 0; for (const w of s) { cx += o[w * 3]; cy += o[w * 3 + 1]; cz += o[w * 3 + 2]; } const k = s.size;
      a[v * 3] = o[v * 3] + f * m * (cx / k - o[v * 3]); a[v * 3 + 1] = o[v * 3 + 1] + f * m * (cy / k - o[v * 3 + 1]); a[v * 3 + 2] = o[v * 3 + 2] + f * m * (cz / k - o[v * 3 + 2]); } };
  const a0 = a.slice(); for (let i = 0; i < K.iters; i++) { step(K.lam); step(K.mu); }
  // the chest: each front point's depth toward the front's mean depth at its height (1 cm rows), between the chest's
  // fullest line and the waist, held at the sides
  { const rows = new Map(); for (const v of nb.keys()) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z < 0.04 || Math.abs(x) > 0.15 || y < 1.12 || y > 1.42) continue; const r = Math.round(y / 0.01); (rows.get(r) || rows.set(r, []).get(r)).push(v); }
    for (const vs of rows.values()) { const zs = vs.map((v) => a[v * 3 + 2]), zMax = Math.max(...zs); for (const v of vs) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1], w = K.flat * sm(0.15, 0.08, x) * sm(1.12, 1.18, y) * sm(1.42, 1.36, y) * (open.has(v) ? 0 : 1);
        const z = a[v * 3 + 2], zT = zMax - 0.004 - 0.5 * (x / 0.15) ** 2 * 0.03; if (z > zT) a[v * 3 + 2] = z + (zT - z) * w; } } }
  // the pads (normals from the smoothed shape, welded)
  const nrm = new Float32Array(n * 3); for (let t = 0; t < I.length; t += 3) { const [A, B, C] = [rep[I[t]], rep[I[t + 1]], rep[I[t + 2]]]; const ux = a[B * 3] - a[A * 3], uy = a[B * 3 + 1] - a[A * 3 + 1], uz = a[B * 3 + 2] - a[A * 3 + 2], vx = a[C * 3] - a[A * 3], vy = a[C * 3 + 1] - a[A * 3 + 1], vz = a[C * 3 + 2] - a[A * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const V of [A, B, C]) { nrm[V * 3] += nx; nrm[V * 3 + 1] += ny; nrm[V * 3 + 2] += nz; } }
  let padded = 0; for (const v of nb.keys()) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], sx = Math.sign(x) || 1, [c0, c1, c2] = K.padC, [r0, r1, r2] = K.padR;
    const d = Math.hypot((Math.abs(x) - c0) / r0, (y - c1) / r1, (z - c2) / r2); if (d >= 1) continue; const h = K.pad * (1 - sm(0.72, 1, d)) * (0.85 + 0.15 * (1 - d * d)); let nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    const L = Math.hypot(nx, ny, nz) || 1; // (outward: away from the shoulder joint's middle)
    const ox = x - sx * (c0 - 0.03), oy = y - (c1 - 0.04), oz = z - c2, s = Math.sign(nx * ox + ny * oy + nz * oz) || 1; a[v * 3] += (nx / L) * h * s; a[v * 3 + 1] += (ny / L) * h * s; a[v * 3 + 2] += (nz / L) * h * s; padded++; }
  let peak = 0; for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[r * 3 + c]; peak = Math.max(peak, Math.hypot(a[v * 3] - a0[v * 3], a[v * 3 + 1] - a0[v * 3 + 1], a[v * 3 + 2] - a0[v * 3 + 2])); }
  P.setArray(a); p.getAttribute('NORMAL') && recomputeNormals(p, rep); console.log('tailor: smoothed + flat + pads', padded, 'peak mm', (peak * 1000).toFixed(1));
}
// the body piece's normals again after its points moved (welded, so the uv seams do not show)
function recomputeNormals(p, rep) {
  const a = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray(), n = a.length / 3, acc = new Float32Array(n * 3);
  for (let t = 0; t < I.length; t += 3) { const A = I[t], B = I[t + 1], C = I[t + 2]; const ux = a[B * 3] - a[A * 3], uy = a[B * 3 + 1] - a[A * 3 + 1], uz = a[B * 3 + 2] - a[A * 3 + 2], vx = a[C * 3] - a[A * 3], vy = a[C * 3 + 1] - a[A * 3 + 1], vz = a[C * 3 + 2] - a[A * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const V of [A, B, C]) { const r = rep[V]; acc[r * 3] += nx; acc[r * 3 + 1] += ny; acc[r * 3 + 2] += nz; } }
  const N = p.getAttribute('NORMAL'), out = new Float32Array(n * 3); for (let v = 0; v < n; v++) { const r = rep[v], L = Math.hypot(acc[r * 3], acc[r * 3 + 1], acc[r * 3 + 2]) || 1; out[v * 3] = acc[r * 3] / L; out[v * 3 + 1] = acc[r * 3 + 1] / L; out[v * 3 + 2] = acc[r * 3 + 2] / L; }
  if (N.getArray() instanceof Float32Array) N.setArray(out); else { const q = new Int8Array(n * 3); for (let i = 0; i < n * 3; i++) q[i] = Math.round(out[i] * 127); N.setArray(q); }
}
