// Hand-built young hero: the hair, cloth, eyes and arms passes.
//  hair    the near-black mop (texture mean 22/255) re-ramped to a dark brown with a real tonal range (roots ~16, strand
//          highlights ~95, warm), so a rim or key light reads strands from behind and above; the mesh pulled in toward the
//          scalp (its offset over 4 mm cut to 62%) for a close, short-curly silhouette instead of a helmet
//  jeans   the light acid-wash re-dyed to the sheet's dark indigo (#2C3646): the wash's large light patches flattened,
//          folds and seams kept (luminance split into low and high frequency)
//  hoodie  heathered fleece: fine two-tone fibre noise and a soft mottle on the flat charcoal
//  eyes    wet: KHR_materials_clearcoat 1 / 0.03 (any scene's lights make catchlights)
//  arms    post.clips.armSplay (read by the clips runtime at load): the upper arms carried 4 degrees off the sides
import { prim, matOf, rgba, setWebp, sharp, fbm, h3, sm, require, body } from './glb.mjs';
const { KHRMaterialsClearcoat } = require('@gltf-transform/extensions');
export async function hairPass(doc, K = {}) {
  K = { shrink: 0.52, ...K };
  const mat = matOf(doc, 'hair'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  for (let i = 0; i < w * h; i++) { const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3, t = Math.pow(Math.min(1, L / 52), 0.9), o = 13 + 64 * t;
    data[i * 4] = Math.round(o * 1.0); data[i * 4 + 1] = Math.round(o * 0.8); data[i * 4 + 2] = Math.round(o * 0.68); }
  await setWebp(tex, data, w, h, 88);
  if (K.shrink < 1) {
    const hp = prim(doc, 'hair')[0], P = hp.getAttribute('POSITION'), pa = P.getArray().slice(), used = new Set(hp.getIndices().getArray());
    const B = body(doc), bp = B.pos, head = B.wOn(/^head$/), skinIdx = new Set(prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]));
    const sc = [...skinIdx].filter((v) => head[v] > 0.5 && bp[v * 3 + 1] > 1.7);
    let moved = 0, mean = 0;
    for (const v of used) { let best = 1e9, bi = -1; for (const s of sc) { const d = (pa[v * 3] - bp[s * 3]) ** 2 + (pa[v * 3 + 1] - bp[s * 3 + 1]) ** 2 + (pa[v * 3 + 2] - bp[s * 3 + 2]) ** 2; if (d < best) { best = d; bi = s; } }
      const d = Math.sqrt(best); if (d < 0.004 || d > 0.06) continue; const kk = K.shrink + 0.34 * (fbm(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2], 28) - 0.5), nd = 0.004 + (d - 0.004) * kk, f = nd / d;
      for (let k = 0; k < 3; k++) pa[v * 3 + k] = bp[bi * 3 + k] + (pa[v * 3 + k] - bp[bi * 3 + k]) * f; moved++; mean += d - nd; }
    // (the shared vertex set: clothes use the other vertices; a new accessor so only the hair moves)
    P.setArray(pa); console.log('hair verts pulled', moved, 'mean mm', ((mean / moved) * 1000).toFixed(1));
  }
}
export async function jeansPass(doc) {
  const mat = matOf(doc, 'clothes'), tex = mat.getBaseColorTexture(), { data, w, h } = await rgba(tex);
  const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  const lo = await sharp(Buffer.from(L.map((x) => Math.round(x * 255))), { raw: { width: w, height: h, channels: 1 } }).blur(18).raw().toBuffer();
  // the jeans: blue-dominant texels in the lower half (the waistband's black and the shirt above stay)
  let n = 0; const base = [54, 66, 90], mask = new Uint8Array(w * h);
  for (let y = Math.floor(h * 0.44); y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const blue = sm(4, 18, b - r), notBg = (r + g + b) / 3 < 205 || b - r > 14 ? 1 : 0; const t = blue * notBg; if (t <= 0) continue; if (t > 0.5) mask[i] = 1;
    const l0 = Math.max(0.04, lo[i] / 255), hi = Math.min(2.2, L[i] / l0), wash = Math.pow(l0 / 0.55, 0.35), v = wash * Math.pow(hi, 1.15);
    const k = 0.78 + 0.22 * (h3(x, y, 3) - 0.5) * 0.4;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - t) + Math.min(255, base[c] * v * k * (c === 2 ? 1.05 : 1)) * t); n++; }
  // (the dye's mean set to the sheet's #2C3646 in the gates' measure: the fold/wash split darkened it to ~#0F131A)
  const tgt = [44, 54, 70], acc = [0, 0, 0]; let m = 0; for (let y = Math.floor(h * 0.44); y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!mask[i]) continue; for (let c = 0; c < 3; c++) acc[c] += (data[i * 4 + c] / 255) ** 2.2; m++; }
  const gain = tgt.map((t, c) => (t / 255) ** 2.2 / (acc[c] / m)); for (let i = 0; i < w * h; i++) if (mask[i]) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(255 * ((data[i * 4 + c] / 255) ** 2.2 * gain[c]) ** (1 / 2.2)));
  await setWebp(tex, data, w, h, 88); console.log('jeans texels', n, 'gain', gain.map((g) => g.toFixed(2)));
}
export async function hoodiePass(doc) {
  for (const name of ['hoodie', 'hoodie-hem', 'hood', 'hoodie-neckband']) {
    const mat = matOf(doc, name), tex = mat?.getBaseColorTexture(); if (!tex) continue; const { data, w, h } = await rgba(tex), s = 1024 / w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, fib = h3(x, y, 11) - 0.5, fib2 = h3(x >> 1, y * 3 >> 2, 5) - 0.5, mot = fbm(x * s / 1024, y * s / 1024, 0.3, 9) - 0.5;
      const m = 1 + 0.16 * fib + 0.1 * fib2 + 0.12 * mot; for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(data[i * 4 + c] * m))); }
    await setWebp(tex, data, w, h, 86);
  }
}
export function eyesPass(doc) {
  const ext = doc.createExtension(KHRMaterialsClearcoat), m = matOf(doc, 'eyes');
  m.setExtension('KHR_materials_clearcoat', ext.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.03)); m.setRoughnessFactor(0.12);
}
export function armsPass(doc, deg = 4) {
  const a = doc.getRoot().getAsset(); const ex = a.extras; ex.forge.post.clips.armSplay = deg; ex.forge.post.handbuilt = { ...(ex.forge.post.handbuilt || {}), armSplay: deg };
}
// shoes: the sneakers' ~41k triangles cut to ~11k (meshopt simplify, borders locked, then the unused vertices dropped);
// shoes are 4.1k on Mr. Big. The saving pays for the skin's new maps.
import { MeshoptSimplifier } from './glb.mjs';
export async function shoesPass(doc, K = { sneakers: 0.32, 'sneakers-soles': 0.45, 'sneakers-collar': 0.6, 'sneakers-laces': 0.6 }) {
  await MeshoptSimplifier.ready;
  for (const [name, ratio] of Object.entries(K)) for (const p of prim(doc, name)) {
    const idx = p.getIndices(), ia = Uint32Array.from(idx.getArray()), P = p.getAttribute('POSITION').getArray(), pos = Float32Array.from(P);
    const target = Math.floor((ia.length * ratio) / 3) * 3, [out, err] = MeshoptSimplifier.simplify(ia, pos, 3, target, 0.004, ['LockBorder']);
    // compact: keep only used vertices, remap every attribute
    const map = new Int32Array(pos.length / 3).fill(-1), order = []; for (const v of out) if (map[v] < 0) { map[v] = order.length; order.push(v); }
    for (const sem of p.listSemantics()) { const a = p.getAttribute(sem), arr = a.getArray(), n = a.getElementSize(), na = new arr.constructor(order.length * n);
      order.forEach((v, i) => { for (let k = 0; k < n; k++) na[i * n + k] = arr[v * n + k]; }); const acc = doc.createAccessor().setType(a.getType()).setArray(na).setNormalized(a.getNormalized()).setBuffer(a.getBuffer()); p.setAttribute(sem, acc); }
    const ni = order.length > 65535 ? new Uint32Array(out.length) : new Uint16Array(out.length); for (let i = 0; i < out.length; i++) ni[i] = map[out[i]];
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(ni).setBuffer(idx.getBuffer()));
    console.log(name, ia.length / 3, '->', out.length / 3, 'tris, err', err.toFixed(4));
  }
}
export async function sizePass(doc) {
  // hoodie colour at 1024 (its detail is in the 2048 normal map); hair normal re-encoded a little lower
  const t = matOf(doc, 'hoodie').getBaseColorTexture(); t.setImage(await sharp(Buffer.from(t.getImage())).resize(1024, 1024).webp({ quality: 84 }).toBuffer());
  const hn = matOf(doc, 'hair').getNormalTexture(); if (hn) hn.setImage(await sharp(Buffer.from(hn.getImage())).webp({ quality: 82, effort: 5 }).toBuffer());
  // (the hoodie's fleece normal 2048 -> 1024 under the store's 3 MB a person; the heather in the colour carries the fibre)
  const on = matOf(doc, 'hoodie').getNormalTexture(); on.setImage(await sharp(Buffer.from(on.getImage())).resize(1024, 1024).webp({ quality: 90, effort: 5 }).toBuffer());
}
// the hoodie's fit: the hem up ~5 cm (it fell to the crotch), the waist taken in and the belly's front flattened, every
// cloth vertex kept >= 7 mm off the body and the jeans under it (nearest-point check), so nothing pokes through
export function fitPass(doc, K = {}) {
  K = { hemTo: 1.0, waist: 0.035, belly: 0.025, clear: 0.007, ...K };
  const B = body(doc), bp = B.pos, skinIdx = new Set(prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]));
  const cl = prim(doc, 'clothes')[0], cp = cl.getAttribute('POSITION').getArray(), cIdx = new Set(cl.getIndices().getArray());
  const under = []; for (const v of skinIdx) if (bp[v * 3 + 1] > 0.9 && bp[v * 3 + 1] < 1.4 && Math.abs(bp[v * 3]) < 0.25) under.push([bp[v * 3], bp[v * 3 + 1], bp[v * 3 + 2]]);
  for (const v of cIdx) if (cp[v * 3 + 1] > 0.9) under.push([cp[v * 3], cp[v * 3 + 1], cp[v * 3 + 2]]);
  const hv = prim(doc, 'hoodie')[0].getAttribute('POSITION').getArray(); let zs = 0, zn = 0; for (let v = 0; v < hv.length / 3; v++) if (hv[v * 3 + 1] > 1.05 && hv[v * 3 + 1] < 1.15) { zs += hv[v * 3 + 2]; zn++; }
  const zc = zs / Math.max(1, zn); const _unused = under.filter((q) => q[1] > 1.05 && q[1] < 1.15).reduce((s, q) => s + q[2], 0) / Math.max(1, under.filter((q) => q[1] > 1.05 && q[1] < 1.15).length);
  const near = (x, y, z) => { let m = 1e9; for (const q of under) { const dy = q[1] - y; if (dy * dy > 0.0016) continue; const d = (q[0] - x) ** 2 + dy * dy + (q[2] - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  const Y0 = 1.17, k = (Y0 - K.hemTo) / (Y0 - 0.979);
  let n = 0, blocked = 0;
  for (const name of ['hoodie', 'hoodie-hem', 'hood-cords']) for (const p of prim(doc, name)) {
    const A = p.getAttribute('POSITION'), a = A.getArray().slice(), used = new Set(p.getIndices().getArray());
    for (const v of used) { let x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (y > Y0 + 0.08 || Math.abs(x) > 0.26) continue;
      // hem up: below Y0 the cloth is compressed toward Y0 (a blend over 8 cm above)
      const ny = y < Y0 ? Y0 - (Y0 - y) * k : y; let tx = x, tz = z, ty = ny;
      // waist in (peak ~1.08 m) and the belly's front flattened
      const wb = Math.exp(-(((ny - 1.08) / 0.07) ** 2)), bb = Math.exp(-(((ny - 1.1) / 0.08) ** 2)) * (z > zc ? 1 : 0);
      const rx = x, rz = z - zc, rl = Math.hypot(rx, rz) || 1; let din = K.waist * wb * (Math.abs(rx) / rl);
      tx = x - Math.sign(x) * din * Math.abs(rx) / rl; tz = z - K.belly * bb * Math.max(0, rz / rl);
      if (name !== 'hood-cords') { let s = 1; for (let it = 0; it < 6 && near(tx, ty, tz) < K.clear && s > 0; it++) { s -= 0.2; tx = x + (tx - x) * s; tz = z + (tz - z) * s; } if (s < 1) blocked++; }
      a[v * 3] = tx; a[v * 3 + 1] = ty; a[v * 3 + 2] = tz; n++; }
    A.setArray(a);
  }
  console.log('fit: moved', n, 'held back by clearance', blocked, 'zc', zc.toFixed(3));
}
// the hood's light shard from behind (135-225 deg): the hood's folded rim at its tip, its inside catching the key light
// (a flat-colour render showed it is the hood itself). The rim's vertices behind the neck get a dark vertex colour
// (COLOR_0, both faces), fading over the next ring, so the fold reads as a shadowed edge.
export function hoodRimPass(doc) {
  // (the hood is a closed shell: its folded underside, the faces turned down or in toward his back, darkened)
  for (const p of prim(doc, 'hood')) { const a = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL').getArray(), n = a.length / 3, col = new Float32Array(n * 4).fill(1); let c0 = 0;
    for (let v = 0; v < n; v++) { const y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z > 0.04 || y > 1.585) continue;
      const down = Math.max(0, -N[v * 3 + 1]), inward = Math.max(0, N[v * 3 + 2]), t = Math.min(1, 2.4 * Math.max(down, inward)) * sm(1.585, 1.54, y);
      const d = 1 - 0.8 * t; for (let k = 0; k < 3; k++) col[v * 4 + k] = d; if (t > 0.1) c0++; }
    p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col).setBuffer(p.getAttribute('POSITION').getBuffer())); console.log('hood underside darkened verts', c0); }
}
// teeth: the front row's strip broken into teeth (Mr. Big's runtime teethMap ideas, painted into the GLB): darker gaps
// between the teeth (found as the columns' luminance dips), a scalloped gum line at the root, a greyer translucent edge
// at the tip, laterals and canines a shade darker, all ~12% under the old brightness
export async function teethPass(doc) {
  for (const name of ['teethUp', 'teethLow']) {
    const tex = matOf(doc, name).getBaseColorTexture(), { data, w, h } = await rgba(tex), band = Math.floor(h * 0.3);
    const L = (i) => (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    const col = new Float32Array(w); for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = 0; y < band; y++) { const i = y * w + x; if (data[i * 4 + 3] > 128) { s += L(i); n++; } } col[x] = n ? s / n : 0; }
    const sm5 = (x) => { let s = 0, n = 0; for (let d = -6; d <= 6; d++) { const v = col[Math.min(w - 1, Math.max(0, x + d))]; s += v; n++; } return s / n; };
    const gaps = []; for (let x = 4; x < w - 4; x++) { const c = sm5(x); if (c < sm5(x - 10) - 3 && c < sm5(x + 10) - 3 && c <= sm5(x - 1) && c <= sm5(x + 1)) gaps.push(x); }
    const gapD = (x) => Math.min(...gaps.map((g) => Math.abs(g - x)), 99);
    for (let x = 0; x < w; x++) { let top = -1, bot = -1; for (let y = 0; y < band; y++) if (data[(y * w + x) * 4 + 3] > 128) { if (top < 0) top = y; bot = y; } if (top < 0) continue;
      const cx = Math.abs(x - w / 2) / (w / 2), shade = 1 - 0.12 - 0.08 * sm(0.18, 0.45, cx), gd = gapD(x);
      for (let y = top; y <= bot; y++) { const i = y * w + x, t = (y - top) / Math.max(1, bot - top);
        let r = data[i * 4] * shade, g = data[i * 4 + 1] * shade, b = data[i * 4 + 2] * shade;
        const gap = Math.exp(-((gd / 2.2) ** 2)); r *= 1 - 0.55 * gap; g *= 1 - 0.58 * gap; b *= 1 - 0.55 * gap;
        const gumY = 0.16 + 0.1 * Math.exp(-((gd / 9) ** 2)), gum = sm(gumY + 0.04, gumY - 0.03, t); r = r * (1 - gum) + 168 * gum; g = g * (1 - gum) + 84 * gum; b = b * (1 - gum) + 86 * gum;
        const tip = sm(0.78, 0.98, t) * (1 - gap); r = r * (1 - 0.18 * tip); g = g * (1 - 0.14 * tip); b = b * (1 - 0.06 * tip);
        const warm = sm(0.5, 0.2, t) * (1 - gum); g *= 1 - 0.03 * warm; b *= 1 - 0.08 * warm;
        data[i * 4] = Math.round(r); data[i * 4 + 1] = Math.round(g); data[i * 4 + 2] = Math.round(b); } }
    await setWebp(tex, data, w, h, 90); console.log(name, 'gaps', gaps.length);
  }
}
// the face's shape (the sheet: square jaw, strong chin, high cheekbones): small symmetric displacement fields on the
// head's skin (the beard and brows share its vertices, so they follow), smooth falloff, the lips' 1.4 cm kept still so
// face.js's mouth landmarks (below 75.1 / front 12.6) do not move
export function facePass(doc, K = {}) {
  K = { jaw: 0.003, chin: 0.002, cheek: 0.0016, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^(head|neck)/), n = a.length / 3;
  const g = (dx, dy, dz, s) => Math.exp(-(dx * dx + dy * dy + dz * dz) / (s * s));
  let moved = 0, maxd = 0;
  for (let v = 0; v < n; v++) { if (head[v] < 0.3) continue; const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0), sx = Math.sign(x0) || 1;
    const still = sm(0.008, 0.016, Math.hypot(x / 1.6, y - 1.672, (z - 0.15) / 1.5)); if (still <= 0) continue;
    const j = g(x - 0.06, y - 1.645, z - 0.055, 0.022), c = g(x0, y - 1.628, z - 0.148, 0.016), k = g(x - 0.052, y - 1.722, z - 0.112, 0.016);
    const dx = sx * (K.jaw * j + K.cheek * k), dy = -0.001 * j + 0.001 * k - 0.0005 * c, dz = K.chin * c + 0.0005 * k;
    const s = still * head[v]; a[v * 3] += dx * s; a[v * 3 + 1] += dy * s; a[v * 3 + 2] += dz * s; const d = Math.hypot(dx, dy, dz) * s; if (d > 1e-5) moved++; maxd = Math.max(maxd, d); }
  P.setArray(a); console.log('face: moved', moved, 'max mm', (maxd * 1000).toFixed(2));
}
