// Hand-built Carissa, the hair: shoulder length, with volume and a side part, from the pack's long01 strand cards (CC0
// MakeHuman, the forge's 'long' cut, which hangs to her waist).
//  cut      every hair point below Y0 (just under the ears) drawn up toward Y0 by k, so the cards end at the shoulders
//           (the strands and their tapered, alpha-cut tips kept, only shorter); a slow wave in the hem (a soft U at the
//           back, longer at the front on the part's long side), so it never ends in one straight line
//  weights  the shortened lengths re-weighted from their new height: the head down to the jaw, then eased onto the neck
//           and the upper spine (the forge had them on spine01-04, all the way down the back)
//  volume   the hair lifted off the skull: the crown, the sides above the ears, the long side next to the part, and the
//           ends turned out a little at the shoulders (a lob's body, not a helmet: the forge's helmet gate)
//  part     the front's points swept from a part on her left (K.part): the short side back toward the ear, the long side
//           across the forehead and down past the cheek
//  collide  every hanging point kept outside the clothes (the jacket's outer surface) by K.clear
//  colour   dark brown with warm chestnut lights (the pack's strand painting re-ramped), a little sheen
import { body, prim, matOf, rgba, setWebp, sharp, sm, h3, fbm, THREE, require } from '../young-hero/glb.mjs';
import path from 'node:path';
const { KHRMaterialsSpecular } = require('@gltf-transform/extensions');
const PACK = path.resolve(new URL('../../../public/assets/human-pack-female/', import.meta.url).pathname) + '/';
export const HC = { Y0: 1.49, END: 1.352, part: 0.026, head: [0, 1.565, 0.03] };

export function hairCutPass(doc, K = {}) {
  K = { ...HC, ...K };
  const hp = prim(doc, 'hair')[0], A = hp.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(hp.getIndices().getArray())];
  let bottom = 9; for (const v of used) bottom = Math.min(bottom, a[v * 3 + 1]);
  const k = (K.Y0 - K.END) / (K.Y0 - bottom); let n = 0;
  for (const v of used) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (y >= K.Y0) continue;
    // (the hem: a soft U at the back (the middle 1.5 cm shorter), the front on the long side (her right) 2 cm longer, a
    // little irregular)
    const back = sm(0.02, -0.06, z), front = sm(0.0, 0.06, z), longSide = x < K.part ? 1 : 0.35;
    const extra = -0.012 * back * (1 - sm(0.02, 0.09, Math.abs(x))) + 0.02 * front * longSide + 0.006 * (fbm(x * 3, 0, z * 3, 40) - 0.5) + 0.018 * (fbm(x * 9, 1, z * 9, 60) - 0.5);
    const kk = k * (1 + extra / (K.Y0 - K.END));
    a[v * 3 + 1] = K.Y0 - (K.Y0 - y) * kk; n++; }
  A.setArray(a); console.log('hair cut: bottom', bottom.toFixed(3), 'k', k.toFixed(3), 'points', n);
  hairWeights(doc, hp);
}

function hairWeights(doc, hp) {
  const B = body(doc), a = hp.getAttribute('POSITION').getArray(), J = hp.getAttribute('JOINTS_0'), W = hp.getAttribute('WEIGHTS_0'), j = J.getArray().slice(), w = W.getArray().slice();
  const hi = B.names.indexOf('head'), n1 = B.names.indexOf('neck02'), n0 = B.names.indexOf('neck01'), s1 = B.names.indexOf('spine01'), used = [...new Set(hp.getIndices().getArray())];
  for (const v of used) { const y = a[v * 3 + 1]; if (y > 1.5) continue;
    const t = sm(1.5, 1.4, y), wh = 1 - 0.75 * t, wn = 0.5 * t, wn0 = 0.15 * t, ws = 0.1 * t, s = wh + wn + wn0 + ws;
    j.set([hi, n1, n0, s1], v * 4); w.set([wh / s, wn / s, wn0 / s, ws / s], v * 4); }
  J.setArray(j); W.setArray(w);
}

export function hairShapePass(doc, K = {}) {
  K = { ...HC, crown: 0.006, side: 0.007, flare: 0.006, sweep: 0.022, clear: 0.006, ...K };
  const hp = prim(doc, 'hair')[0], A = hp.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(hp.getIndices().getArray())];
  const C = new THREE.Vector3(...K.head); let n = 0;
  for (const v of used) { let x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2];
    // volume: out from the head's centre
    const crown = sm(1.6, 1.665, y), side = sm(1.44, 1.53, y) * (1 - sm(1.62, 1.66, y)) * sm(0.05, 0.075, Math.abs(x));
    // (the long side next to the part rises off it)
    const ridge = Math.exp(-(((x - (K.part - 0.025)) / 0.02) ** 2)) * sm(1.62, 1.66, y) * sm(-0.04, 0.02, z);
    const keepFront = 1 - sm(0.07, 0.11, z) * (1 - sm(1.64, 1.66, y));
    const amt = (K.crown * crown + K.side * side + 0.004 * ridge) * keepFront;
    if (amt > 1e-6) { const d = new THREE.Vector3(x, y, z).sub(C).normalize(); x += d.x * amt; y += d.y * amt * 0.6; z += d.z * amt; }
    // the ends: turned out from the neck toward the shoulders (body at the hem)
    if (y < 1.47) { const t = sm(1.47, K.END, y), r = Math.hypot(x, z - 0.0) || 1; x += (x / r) * K.flare * t * 0.8; z += (z / r) * K.flare * t * 0.5; }
    // the part: the front points on the short side (her left, x > part) swept back toward the ear; on the long side
    // swept across and down
    const front = sm(0.06, 0.1, z) * sm(1.56, 1.6, y);
    if (front > 0) { const d = x - K.part; if (d > 0) x += 0.002 * front * sm(0, 0.03, d); else { x -= K.sweep * 0.35 * front * sm(0, 0.04, -d); y -= 0.004 * front * sm(0, 0.04, -d); } }
    a[v * 3] = x; a[v * 3 + 1] = y; a[v * 3 + 2] = z; n++; }
  A.setArray(a); console.log('hair shape: points', n);
}

// keep the hanging hair outside the named meshes' surfaces (the nearest point's normal), eased over the lengths
export function hairCollidePass(doc, K = {}) {
  K = { clear: 0.007, mats: ['jacket', 'clothes'], ...K };
  const hp = prim(doc, 'hair')[0], A = hp.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(hp.getIndices().getArray())];
  const pts = []; for (const m of K.mats) for (const p of prim(doc, m)) { const P = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL').getArray(), ns = p.getAttribute('NORMAL').getNormalized() ? 127 : 1;
    for (const v of new Set(p.getIndices().getArray())) if (P[v * 3 + 1] > 1.25 && P[v * 3 + 1] < 1.5) pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3] / ns, N[v * 3 + 1] / ns, N[v * 3 + 2] / ns]); }
  const G = 0.015, grid = new Map(), key = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
  for (const q of pts) { const k = key(q[0], q[1], q[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q); }
  let pushed = 0;
  for (let it = 0; it < 2; it++) for (const v of used) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (y > 1.5 || y < 1.25) continue;
    const cx = Math.floor(x / G), cy = Math.floor(y / G), cz = Math.floor(z / G); let best = 1e9, q = null;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (const p of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) { const d = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2; if (d < best) { best = d; q = p; } }
    if (!q) continue; const nl = Math.hypot(q[3], q[4], q[5]) || 1, d = ((x - q[0]) * q[3] + (y - q[1]) * q[4] + (z - q[2]) * q[5]) / nl;
    if (d < K.clear) { const m = K.clear - d; a[v * 3] += (q[3] / nl) * m; a[v * 3 + 1] += (q[4] / nl) * m * 0.3; a[v * 3 + 2] += (q[5] / nl) * m; pushed++; } }
  A.setArray(a); console.log('hair collide: pushes', pushed);
}

export async function hairColourPass(doc, K = {}) {
  K = { root: [14, 10, 8], mid: [32, 23, 18], hi: [72, 52, 40], rough: 0.6, spec: 0.3, ...K };
  const mat = matOf(doc, 'hair'), tex = mat.getBaseColorTexture(), cur = await rgba(tex), S = cur.w;
  // (the forge's own strand painting re-ramped (its hairline strands and alpha belong together; the pack's colour under
  // the forge's alpha left pale specks at the temples), normalised between its 4th and 97th percentile)
  // (r4: the forge's strands read crimped in daylight; the pack's long01 painting, with its own alpha, is smooth)
  const pk = await sharp(PACK + 'hair-long01.png').resize(S, S, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer(), Ls = []; for (let i = 0; i < S * S; i += 7) if (pk[i * 4 + 3] > 60) Ls.push((pk[i * 4] + pk[i * 4 + 1] + pk[i * 4 + 2]) / 3); Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.04)] ?? 0, hi = Ls[Math.floor(Ls.length * 0.97)] ?? 255;
  const out = Buffer.alloc(S * S * 4); void PACK;
  const strand = (x, y) => { const sx = x + 6 * (fbm(x / S, y / S, 0.7, 6) - 0.5) * 8; const id = Math.floor(sx / 1.6); return (h3(id, 3, 9) - 0.5) + 0.6 * (fbm(id * 0.37, (y / S) * 6, 1.3, 2) - 0.5); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x;
    const L = (pk[i * 4] + pk[i * 4 + 1] + pk[i * 4 + 2]) / 3, st = strand(x, y), t0 = L > 115 ? 0.12 : Math.max(0, Math.min(1, (L - lo) / Math.max(1, Math.min(hi, 115) - lo))), t = Math.max(0, Math.min(1, t0 + 0.16 * st));
    const c = t < 0.5 ? K.root.map((r, k) => r + (K.mid[k] - r) * (t / 0.5)) : K.mid.map((m, k) => m + (K.hi[k] - m) * ((t - 0.5) / 0.5));
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(c[k])));
    out[i * 4 + 3] = pk[i * 4 + 3]; }
  await setWebp(tex, out, S, S, 86);
  mat.setRoughnessFactor(K.rough);
  // (the forge's 497 KB normal map was drawn for its own strands, not the pack's: dropped)
  if (K.dropNormal !== false) { const nt = mat.getNormalTexture(); mat.setNormalTexture(null); if (nt && !nt.listParents().some((p) => p !== doc.getRoot())) nt.dispose(); }
  const sp = mat.getExtension('KHR_materials_specular') || doc.createExtension(KHRMaterialsSpecular).createSpecular(); sp.setSpecularFactor(K.spec); mat.setExtension('KHR_materials_specular', sp);
}
