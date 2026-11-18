// Hand-built young mother, hair.
//  texture  the forge's comb-stroke repaint (black, with pale clumps and jagged guide lines that read as dreadlocks from
//           behind) replaced by the pack's own long01 strand painting (CC0 MakeHuman, same uvs) re-ramped to her
//           near-black with warm dark-brown highlights, plus a fine strand grain along the fall (u-noise, v-stretched) at
//           1024; the alpha kept as forged; the pack's pale scalp patches at the roots read as root-dark. A matching normal map from the strand height (across the fall only), and a
//           little more gloss (rough 0.46, specular 0.55) so a key or rim light draws a sheen down the lengths
import { matOf, rgba, setWebp, sharp, h3, fbm, sm, require } from '../young-hero/glb.mjs';
import path from 'node:path';
const { KHRMaterialsSpecular } = require('@gltf-transform/extensions');
const PACK = path.resolve(new URL('../../../public/assets/human-pack-female/', import.meta.url).pathname) + '/';
export async function hairTexPass(doc, K = {}) {
  K = { root: [9, 8, 7], mid: [24, 18, 15], hi: [58, 41, 30], rough: 0.5, spec: 0.38, ...K };
  const mat = matOf(doc, 'hair'), tex = mat.getBaseColorTexture(), cur = await rgba(tex), S = cur.w;
  const pk = await sharp(PACK + 'hair-long01.png').resize(S, S, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  const out = Buffer.alloc(S * S * 4), hgt = new Float32Array(S * S);
  // strand grain: thin lines along v (the fall), random brightness per strand, slowly varying along it
  const strand = (x, y) => { const sx = x + 6 * (fbm(x / S, y / S, 0.7, 6) - 0.5) * 8; const id = Math.floor(sx / 1.6); return (h3(id, 3, 9) - 0.5) + 0.6 * (fbm(id * 0.37, (y / S) * 6, 1.3, 2) - 0.5); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x;
    const L = (pk[i * 4] + pk[i * 4 + 1] + pk[i * 4 + 2]) / 3, st = strand(x, y), t0 = L > 115 ? 0.12 : Math.min(1, Math.pow(L / 78, 1.1)), t = Math.max(0, Math.min(1, t0 + 0.22 * st));
    const c = t < 0.5 ? K.root.map((r, k) => r + (K.mid[k] - r) * (t / 0.5)) : K.mid.map((m, k) => m + (K.hi[k] - m) * ((t - 0.5) / 0.5));
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(c[k])));
    out[i * 4 + 3] = cur.data[i * 4 + 3]; hgt[i] = 0.6 * st + 0.4 * t0; }
  await setWebp(tex, out, S, S, 86);
  const nm = Buffer.alloc(S * S * 3), NK = 1.4;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x, hx = (hgt[y * S + Math.min(S - 1, x + 1)] - hgt[y * S + Math.max(0, x - 1)]) / 2;
    const nx = -hx * NK, l = Math.hypot(nx, 1); nm[i * 3] = Math.round((nx / l * 0.5 + 0.5) * 255); nm[i * 3 + 1] = 128; nm[i * 3 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); }
  const nt = mat.getNormalTexture(); nt.setImage(await sharp(nm, { raw: { width: S, height: S, channels: 3 } }).resize(512, 512).webp({ quality: 80, effort: 5 }).toBuffer()).setMimeType('image/webp');
  mat.setRoughnessFactor(K.rough);
  const sp = mat.getExtension('KHR_materials_specular') || doc.createExtension(KHRMaterialsSpecular).createSpecular(); sp.setSpecularFactor(K.spec); mat.setExtension('KHR_materials_specular', sp);
}
// the style: the blunt brow-level fringe (it made her read 12-14) lifted into a side part. The fringe's points (the
// hair's front, between the temples) are drawn up toward a new front edge, yEdge(x): highest at the part (K.part, on
// her left), sweeping down across the forehead to the right temple (the long side) and a little on the short side;
// the long side's points also move toward the temple, so the hair falls diagonally from the part. Each moved point is
// then set back onto the forehead at its old height over the skin (2-6 mm), so nothing floats.
// the nape: the hood's crumpled back lay over the hair's inner face and poked through it; every hair point behind the
// neck is kept >= 8 mm behind the hood's back surface (a 1 cm grid of the hood's rearmost z), eased over 3 cm.
import { body, prim as primOf, THREE, fbm as fbm3 } from '../young-hero/glb.mjs';
export function hairStylePass(doc, K = {}) {
  K = { part: 0.024, top: 1.568, longEnd: 1.521, shortEnd: 1.548, sweep: 0.03, low: 1.512, clearHood: 0.008, ...K };
  const hp = primOf(doc, 'hair')[0], A = hp.getAttribute('POSITION'), a = A.getArray().slice(), used = [...new Set(hp.getIndices().getArray())];
  const B = body(doc), bp = B.pos, head = B.wOn(/^head$/), NA = B.sk.getAttribute('NORMAL'), N0 = NA.getArray(), nsc = NA.getNormalized() ? (N0 instanceof Int8Array ? 127 : 32767) : 1;
  const hj = hp.getAttribute('JOINTS_0').getArray(), hw = hp.getAttribute('WEIGHTS_0').getArray(), hi = B.names.indexOf('head');
  const hairHead = (v) => { let s = 0; for (let k = 0; k < 4; k++) if (hj[v * 4 + k] === hi) s += hw[v * 4 + k]; return s; };
  const skinIdx = [...new Set(primOf(doc, 'skin').flatMap((q) => [...q.getIndices().getArray()]))].filter((v) => head[v] > 0.6 && bp[v * 3 + 1] > 1.47 && bp[v * 3 + 2] > 0.0);
  const near = (x, y, z) => { let best = 1e9, bi = -1; for (const s of skinIdx) { const d = (x - bp[s * 3]) ** 2 + (y - bp[s * 3 + 1]) ** 2 + (z - bp[s * 3 + 2]) ** 2; if (d < best) { best = d; bi = s; } } return bi; };
  const nrm = (s) => { const n = new THREE.Vector3(N0[s * 3] / nsc, N0[s * 3 + 1] / nsc, N0[s * 3 + 2] / nsc); return n.normalize(); };
  const sdist = (x, y, z) => { const s = near(x, y, z), n = nrm(s); return { s, n, d: (x - bp[s * 3]) * n.x + (y - bp[s * 3 + 1]) * n.y + (z - bp[s * 3 + 2]) * n.z }; };
  const yEdge = (x) => { const d = x - K.part; return d < 0 ? K.top + (K.longEnd - K.top) * sm(0, 0.075, -d) : K.top + (K.shortEnd - K.top) * sm(0, 0.05, d); };
  let moved = 0;
  for (const v of used) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2];
    if (z < 0.07 || y < K.low - 0.004 || y > 1.61 || hairHead(v) < 0.5) continue;
    const front = sm(0.07, 0.1, z) * (1 - sm(0.058, 0.072, Math.abs(x))); if (front <= 0) continue;
    const yE = yEdge(x), yTop = yE + 0.014; if (y >= yTop) continue;
    const t = Math.min(1, (yTop - y) / Math.max(0.004, yTop - K.low)); // 0 at yTop .. 1 at the fringe's lowest
    const ny = yTop - t * (yTop - yE), side = x < K.part ? -1 : 1, nx = x + side * (side < 0 ? K.sweep : K.sweep * 0.4) * t * sm(0.0, 0.02, Math.abs(x - K.part));
    const before = sdist(x, y, z), off = Math.max(0.002, Math.min(0.006, before.d));
    let px = x + (nx - x) * front, py = y + (ny - y) * front, pz = z; const after = sdist(px, py, pz); pz += after.n.z * (off - after.d) * front; px += after.n.x * (off - after.d) * front; py += after.n.y * (off - after.d) * front;
    a[v * 3] = px; a[v * 3 + 1] = py; a[v * 3 + 2] = pz; moved++; }
  // the nape over the hood
  const hood = primOf(doc, 'hood')[0].getAttribute('POSITION').getArray(), grid = new Map(), cell = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  for (let v = 0; v < hood.length / 3; v++) { if (hood[v * 3 + 2] > 0.03) continue; const k = cell(hood[v * 3], hood[v * 3 + 1]); grid.set(k, Math.min(grid.get(k) ?? 9, hood[v * 3 + 2])); }
  const hoodZ = (x, y) => { let m = 9; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const g = grid.get(`${Math.round(x * 100) + dx},${Math.round(y * 100) + dy}`); if (g != null) m = Math.min(m, g); } return m; };
  let pushed = 0;
  for (const v of used) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z > 0.04 || y > 1.4 || y < 1.2) continue; const hz = hoodZ(x, y); if (hz > 1) continue;
    const want = hz - K.clearHood; if (z > want) { a[v * 3 + 2] = want; pushed++; } }
  A.setArray(a); console.log('hair style: fringe points moved', moved, 'nape points pushed behind the hood', pushed);
}
