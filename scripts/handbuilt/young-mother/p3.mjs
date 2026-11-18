// Hand-built young mother, pass 3 (after the pass-2 review): a small point still showed at each bust apex through the
// fleece (front and 3/4 head views), and the drawcords ended in wavy, jagged tips at bust height that floated off the
// chest in profile.
import { prim, sm } from '../young-hero/glb.mjs';
import { flattenNormals } from './p2.mjs';

// the bust, one soft mass: the hoodie's whole front over the bust (x 2-14 cm, kept off the side seam, y 0.98-1.28: the under-bust too, where the fold turned to a point) Taubin-smoothed (lambda/mu, so
// the volume holds while the small bumps go), weighted 1 over the bust and fading out to the region's edge, on the welded
// surface (seams move together); then the normals of the region recomputed outward. There is no skin under the fleece
// there (the forge cut it), so nothing can come through.
export function bustSoftPass(doc, K = {}) {
  K = { iters: 80, lam: 0.5, mu: -0.53, nIters: 6, ...K };
  const p = prim(doc, 'hoodie')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), idx = p.getIndices().getArray(), n = a.length / 3;
  const grp = new Map(), gid = new Int32Array(n), gk = (v) => `${Math.round(a[v * 3] * 2e3)},${Math.round(a[v * 3 + 1] * 2e3)},${Math.round(a[v * 3 + 2] * 2e3)}`;
  for (let v = 0; v < n; v++) { const k = gk(v); if (!grp.has(k)) grp.set(k, grp.size); gid[v] = grp.get(k); }
  const G = grp.size, gp = new Float64Array(G * 3), nb = Array.from({ length: G }, () => new Set());
  for (let v = 0; v < n; v++) { const g = gid[v]; for (let k = 0; k < 3; k++) gp[g * 3 + k] = a[v * 3 + k]; }
  for (let q = 0; q < idx.length; q += 3) for (let e = 0; e < 3; e++) { const u = gid[idx[q + e]], w = gid[idx[q + (e + 1) % 3]]; if (u !== w) { nb[u].add(w); nb[w].add(u); } }
  const wgt = new Float64Array(G); for (let g = 0; g < G; g++) { const x = Math.abs(gp[g * 3]), y = gp[g * 3 + 1], z = gp[g * 3 + 2];
    wgt[g] = sm(0.015, 0.035, x) * (1 - sm(0.115, 0.145, x)) * sm(0.97, 1.02, y) * (1 - sm(1.25, 1.29, y)) * sm(0.05, 0.08, z); }
  const step = (f) => { const nx = gp.slice(); for (let g = 0; g < G; g++) { if (!wgt[g] || nb[g].size < 3) continue; const m = [0, 0, 0]; for (const h of nb[g]) for (let k = 0; k < 3; k++) m[k] += gp[h * 3 + k] / nb[g].size;
    for (let k = 0; k < 3; k++) nx[g * 3 + k] = gp[g * 3 + k] + f * wgt[g] * (m[k] - gp[g * 3 + k]); } gp.set(nx); };
  for (let it = 0; it < K.iters; it++) { step(K.lam); step(K.mu); }
  let moved = 0, maxd = 0; for (let v = 0; v < n; v++) { const g = gid[v]; const d = Math.hypot(gp[g * 3] - a[v * 3], gp[g * 3 + 1] - a[v * 3 + 1], gp[g * 3 + 2] - a[v * 3 + 2]); if (d > 1e-6) { moved++; maxd = Math.max(maxd, d); for (let k = 0; k < 3; k++) a[v * 3 + k] = gp[g * 3 + k]; } }
  if (!a.every(Number.isFinite)) throw new Error('bust soft: a non-finite position');
  A.setArray(a); console.log('bust soft: moved', moved, 'max mm', (maxd * 1000).toFixed(2));
  const NA = p.getAttribute('NORMAL'), na = NA.getArray().slice(), gn = new Float64Array(G * 3);
  for (let q = 0; q < idx.length; q += 3) { const [i0, i1, i2] = [idx[q], idx[q + 1], idx[q + 2]].map((v) => gid[v]);
    const e1 = [0, 1, 2].map((k) => gp[i1 * 3 + k] - gp[i0 * 3 + k]), e2 = [0, 1, 2].map((k) => gp[i2 * 3 + k] - gp[i0 * 3 + k]), c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const g of [i0, i1, i2]) for (let k = 0; k < 3; k++) gn[g * 3 + k] += c[k]; }
  // (then the normals themselves averaged with their neighbours a few rounds: a coarse fleece mesh's pole (many
  // triangles meeting at the apex) still caught the light as a point)
  for (let g = 0; g < G; g++) { const L = Math.hypot(gn[g * 3], gn[g * 3 + 1], gn[g * 3 + 2]) || 1; for (let k = 0; k < 3; k++) gn[g * 3 + k] /= L; }
  for (let it = 0; it < K.nIters; it++) { const nx = gn.slice(); for (let g = 0; g < G; g++) { if (!wgt[g] || !nb[g].size) continue; const m = [0, 0, 0]; for (const h of nb[g]) for (let k = 0; k < 3; k++) m[k] += gn[h * 3 + k];
    for (let k = 0; k < 3; k++) nx[g * 3 + k] = gn[g * 3 + k] + 0.6 * wgt[g] * (m[k] / nb[g].size - gn[g * 3 + k]); } gn.set(nx); }
  const sc = NA.getNormalized() ? (na instanceof Int8Array ? 127 : 32767) : 1; let rn = 0;
  for (let v = 0; v < n; v++) { const g = gid[v]; if (wgt[g] <= 0) continue; const L = Math.hypot(gn[g * 3], gn[g * 3 + 1], gn[g * 3 + 2]); if (!L) continue;
    const nw = [0, 1, 2].map((k) => gn[g * 3 + k] / L), sgn = a[v * 3] * nw[0] + (a[v * 3 + 2] - 0.02) * nw[2] < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) na[v * 3 + k] = Math.round(sgn * nw[k] * sc); rn++; }
  NA.setArray(na); console.log('bust soft: normals', rn);
}
// (and the normal map's bust region flattened wider than pass 2's (8.5 cm round each apex and a heavier blur, was 4.5): the bake's pucker
// shading went beyond it)
export async function bustMapPass(doc) {
  const ap = [[0.105, 1.13, 0.14], [-0.105, 1.13, 0.14]];
  await flattenNormals(doc, 'hoodie', (x, y, z) => { if (z < 0.05) return 0; let w = 0; for (const c of ap) w = Math.max(w, sm(0.085, 0.05, Math.hypot(x - c[0], y - c[1], (z - c[2]) * 0.5))); return w; }, 24);
}

// the drawcords, shorter and lying on the fleece: each cord's length below its top (where it leaves the hood) x K.len
// (they ended at the bust's apex, 1.14; now about 1.21, above it), then every point moved by a delta that is a smooth
// function of its height (pass 2 moved 3 mm slices one by one, which jagged the tips): x to the cord's smoothed centre
// line, z so the centre lies K.lift off the fleece's front (exactly, never further: in profile they floated).
export function cordsShortPass(doc, K = {}) {
  K = { len: 0.62, lift: 0.0035, win: 0.045, ...K };
  const p = prim(doc, 'hood-cords')[0], A = p.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(p.getIndices().getArray())];
  const ha = prim(doc, 'hoodie')[0].getAttribute('POSITION').getArray(), front = (x, y) => { let m = -1; for (let v = 0; v < ha.length / 3; v++) if (Math.abs(ha[v * 3] - x) < 0.007 && Math.abs(ha[v * 3 + 1] - y) < 0.007) m = Math.max(m, ha[v * 3 + 2]); return m; };
  let moved = 0;
  for (const side of [1, -1]) { const vs = used.filter((v) => Math.sign(a[v * 3]) === side); if (!vs.length) continue;
    const top = Math.max(...vs.map((v) => a[v * 3 + 1])), bot = Math.min(...vs.map((v) => a[v * 3 + 1]));
    for (const v of vs) a[v * 3 + 1] = top - (top - a[v * 3 + 1]) * K.len;
    // the centre line, sampled every 3 mm and smoothed along the length
    const Q = 0.003, ys = [], cx = [], cz = []; const nb2 = top - (top - bot) * K.len;
    for (let y = nb2; y <= top + 1e-9; y += Q) { const s = vs.filter((v) => Math.abs(a[v * 3 + 1] - y) < Q); if (!s.length) continue; ys.push(y); cx.push(s.reduce((t, v) => t + a[v * 3], 0) / s.length); cz.push(s.reduce((t, v) => t + a[v * 3 + 2], 0) / s.length); }
    const smooth = (arr, y) => { let s = 0, w = 0; for (let i = 0; i < ys.length; i++) { const d = ys[i] - y, ww = Math.exp(-((d / K.win) ** 2)); s += arr[i] * ww; w += ww; } return s / w; };
    const tx = ys.map((y) => smooth(cx, y)), fz = ys.map((y, i) => front(tx[i], y));
    // the target z: on the fleece where it is under the cord (the top 2 cm blends from the cord's own z, at the hood)
    const tz = ys.map((y, i) => { const want = fz[i] > 0 ? fz[i] + K.lift + 0.0015 : smooth(cz, y), b = sm(top - 0.005, top - 0.025, y); return smooth(cz, y) + (want - smooth(cz, y)) * b; });
    const tzs = ys.map((y) => { let s = 0, w = 0; for (let i = 0; i < ys.length; i++) { const ww = Math.exp(-(((ys[i] - y) / 0.03) ** 2)); s += tz[i] * ww; w += ww; } return s / w; });
    const at = (arr, y) => { if (y <= ys[0]) return arr[0]; if (y >= ys[ys.length - 1]) return arr[arr.length - 1]; let i = 0; while (ys[i + 1] < y) i++; const t = (y - ys[i]) / (ys[i + 1] - ys[i]); return arr[i] + (arr[i + 1] - arr[i]) * t; };
    const dX = ys.map((y, i) => tx[i] - cx[i]), dZ = ys.map((y, i) => tzs[i] - cz[i]);
    for (const v of vs) { const y = a[v * 3 + 1]; a[v * 3] += at(dX, y); a[v * 3 + 2] += at(dZ, y); moved++; }
    console.log('cords short: side', side, 'bottom', bot.toFixed(3), '->', nb2.toFixed(3)); }
  if (!a.every(Number.isFinite)) throw new Error('cords short: a non-finite position');
  A.setArray(a); console.log('cords short: points moved', moved);
}

// her irises (the forge's EY fix came after round 8: her dark-brown iris was about (35, 13, 8) of 255, and with the
// pupil it read as a black hole in a close-up; the forge's eyes gate's floor is OKLab L 0.25): the iris's saturated
// texels scaled by one gain so their mean light is K.L of 255 (a dark brown, the forge's own 59; its pattern kept), and
// their red-brown turned toward a natural dark brown (scaled alone they read red: (89, 33, 21))
import { rgba, setWebp, matOf as matOf3 } from '../young-hero/glb.mjs';
export async function irisPass(doc, K = {}) {
  K = { L: 62, ...K };
  const t = matOf3(doc, 'eyes')?.getBaseColorTexture(); if (!t) return;
  const img = await rgba(t), d = img.data, lum = (i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  const sat = (i) => { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); return Math.min(1, Math.max(0, (mx - mn - 6) / 18)); };
  // (the iris: darker than the white, warmer than grey; its pupil (near black) left alone)
  let sw = 0, sl = 0; for (let i = 0; i < d.length; i += 4) { const k = sat(i); if (k && lum(i) > 6 && lum(i) < 120) { sw += k; sl += k * lum(i); } }
  const gain = Math.max(1, K.L / Math.max(1, sl / Math.max(1, sw))); let n = 0;
  for (let i = 0; i < d.length; i += 4) { const k = sat(i), L = lum(i); if (!k || L <= 6 || L >= 120) continue; const g = 1 + (gain - 1) * k * Math.min(1, (L - 6) / 8);
    const m = 0.65 * k, T = [1.37, 0.89, 0.58]; for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(d[i + c] * g * (1 - m) + L * g * T[c] * m)); n++; }
  await setWebp(t, d, img.w, img.h, 90); console.log('iris: mean', (sl / Math.max(1, sw)).toFixed(1), 'gain', gain.toFixed(2), 'texels', n);
}

// the mouth's inside, back to the forge's: the skin paint (pass 1: lips lighter at the centre, glossy, lip lines in the
// normal map) reached the inner lips and the mouth's lining, and with the study light's specular the open mouth read
// light (the forge's mouth gate: median L 0.43 at the other 3/4, limit 0.30; round 8 passed). Every skin texel more than
// K.depth behind her lips' front (and inside the mouth's box) takes round 8's colour again, matte, with a flat normal.
import { read as read3, body as body3, raster as raster3, sharp as sharp3 } from '../young-hero/glb.mjs';
export async function mouthInsidePass(doc, K = {}) {
  K = { depth: 0.004, MY: 1.437, ...K };
  const R8 = (await read3(new URL('../../../storykit/handbuilt/young-mother/r8-forged.glb', import.meta.url).pathname)).doc;
  const mat = matOf3(doc, 'skin'), tex = mat.getBaseColorTexture(), img = await rgba(tex), S = img.w, ref = await rgba(matOf3(R8, 'skin').getBaseColorTexture());
  if (ref.w !== S) throw new Error('mouth: the round-8 skin is another size');
  const B = body3(doc), p = B.pos, uv = B.uv.getArray(), wHead = B.wOn(/^head$/), tris = prim(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]);
  let front = -1; for (let v = 0; v < p.length / 3; v++) if (wHead[v] > 0.5 && Math.abs(p[v * 3]) < 0.008 && Math.abs(p[v * 3 + 1] - K.MY) < 0.01) front = Math.max(front, p[v * 3 + 2]);
  const inside = new Float32Array(S * S);
  raster3(tris, (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, a, b, c) => { const P = [0, 1, 2].map((k) => l1 * p[a * 3 + k] + l2 * p[b * 3 + k] + l3 * p[c * 3 + k]), w = l1 * wHead[a] + l2 * wHead[b] + l3 * wHead[c];
    if (w < 0.5 || Math.abs(P[0]) > 0.032 || Math.abs(P[1] - K.MY) > 0.02) return; inside[y * S + x] = Math.max(inside[y * S + x], sm(front - K.depth + 0.0015, front - K.depth - 0.0015, P[2])); }, 0.03);
  let n = 0; for (let i = 0; i < S * S; i++) { const t = inside[i]; if (!t) continue; n++; for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.round(img.data[i * 4 + k] * (1 - t) + ref.data[i * 4 + k] * t); }
  await setWebp(tex, img.data, S, S, 88);
  // (the normal and roughness maps there: flat and matte)
  // (the normal and roughness maps there: flat, and matte (G 255, no metal))
  for (const [t, flat] of [[mat.getNormalTexture(), [128, 128, 255]], [mat.getMetallicRoughnessTexture(), [null, 255, 0]]]) { if (!t) continue;
    const { data, info } = await sharp3(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, f = S / W;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const s = inside[Math.floor(y * f) * S + Math.floor(x * f)]; if (!s) continue; const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) if (flat[k] !== null) data[i + k] = Math.round(data[i + k] * (1 - s) + flat[k] * s); }
    t.setImage(await sharp3(data, { raw: { width: W, height: W, channels: 3 } }).webp({ quality: 90 }).toBuffer()).setMimeType('image/webp'); }
  console.log('mouth inside: lips front z', front.toFixed(4), 'texels', n);
}
