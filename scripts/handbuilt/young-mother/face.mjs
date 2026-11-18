// Hand-built young mother, the face's hair cards.
//  brows   the forge's brow cards (near-black, sitting low and flat over the lids: a heavy, scowling brow) recoloured to a
//          dark brown with warm depth, and lifted: 2 mm overall, the inner ends 3 mm (the scowl's slant gone), held on the
//          forehead (each point back 0.4 mm per mm lifted, as the brow ridge slopes); the skin pass paints a soft brown
//          underlay at the new place
//  lashes  mascara: near-black (the tint 0.6 grey to 0.12), and the outer third 1 mm longer, out and up
import { body, prim, matOf, rgba, setWebp, sm } from '../young-hero/glb.mjs';
export async function browsLashesPass(doc, K = {}) {
  K = { lift: 0.002, inner: 0.001, brow: [50, 36, 29], ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice();
  const bv = new Set(prim(doc, 'brows').flatMap((q) => [...q.getIndices().getArray()]));
  for (const v of bv) { const x = Math.abs(a[v * 3]), d = K.lift + K.inner * sm(0.03, 0.012, x); a[v * 3 + 1] += d; a[v * 3 + 2] -= 0.4 * d; }
  const lv = new Set(prim(doc, 'lashes').flatMap((q) => [...q.getIndices().getArray()]));
  // (the upper lashes: the points above the eye's centre line; outer third pushed out and up)
  let lm = 0; for (const v of lv) { const x = Math.abs(a[v * 3]), y = a[v * 3 + 1]; if (y < 1.5015) continue; const o = sm(0.036, 0.046, x); if (o <= 0) continue; a[v * 3] += Math.sign(a[v * 3]) * 0.0007 * o; a[v * 3 + 1] += 0.0008 * o; lm++; }
  P.setArray(a);
  const bt = matOf(doc, 'brows').getBaseColorTexture(), { data, w, h } = await rgba(bt);
  for (let i = 0; i < w * h; i++) { const L = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3 / 31; for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.min(255, Math.round(K.brow[c] * (0.8 + 0.2 * L))); }
  await setWebp(bt, data, w, h, 88);
  const lm8 = matOf(doc, 'lashes'); lm8.setBaseColorFactor([0.12, 0.1, 0.09, 1]); lm8.setAlphaCutoff(0.28);
  // (the brow cards' hairs only where dense (cut 0.48 to 0.72): a thin hard line over the painted brow otherwise)
  matOf(doc, 'brows').setAlphaCutoff(0.72);
  console.log('brows lifted', bv.size, 'lash points lengthened', lm);
}
// the face's shape, older (vertex fields on the head's points, symmetric, smooth, the mouth's 1.2 cm kept still so the
// carried mouth landmarks hold): the chin 1.6 mm lower and the jaw's angle 1.2 mm lower (a longer lower face), the
// cheeks' fullness 1.4 mm in, a soft hollow under the cheekbone (1.2 mm), the cheekbone 0.8 mm out and up
export function faceShapePass(doc, K = {}) {
  K = { chin: 0.0016, jaw: 0.0012, full: 0.0014, hollow: 0.0012, bone: 0.0008, ...K };
  const B = body(doc), P = B.P, a = P.getArray().slice(), head = B.wOn(/^(head|neck)/), n = a.length / 3;
  const g = (dx, dy, dz, sx, sy, sz) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2 + (dz / sz) ** 2));
  const MY = 1.437, MZ = 0.142; let moved = 0, maxd = 0;
  for (let v = 0; v < n; v++) { if (head[v] < 0.3) continue; const x0 = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], x = Math.abs(x0), sx = Math.sign(x0) || 1;
    if (y > 1.52 || y < 1.36 || z < 0.0) continue;
    const still = sm(0.009, 0.015, Math.hypot(x / 1.5, y - MY, (z - MZ) / 1.4));
    // (the lower face: below the mouth, more toward the chin; the jaw's angle)
    const chin = sm(MY - 0.012, MY - 0.03, y) * g(x0, 0, 0, 0.03, 1, 1) * sm(0.08, 0.12, z), jaw = g(x - 0.058, y - 1.415, z - 0.05, 0.02, 0.02, 0.035);
    const full = g(x - 0.05, y - 1.455, z - 0.105, 0.014, 0.014, 0.018), hol = g(x - 0.047, y - 1.442, z - 0.1, 0.01, 0.009, 0.014), bone = g(x - 0.052, y - 1.479, z - 0.103, 0.011, 0.008, 0.014);
    const dx = sx * (-K.full * full - K.hollow * hol + K.bone * bone * 0.7), dy = -K.chin * chin - K.jaw * jaw + K.bone * bone * 0.6, dz = -0.5 * K.full * full - 0.6 * K.hollow * hol - 0.4 * K.chin * chin;
    const s = still * Math.min(1, head[v]); const d = Math.hypot(dx, dy, dz) * s; if (d < 1e-6) continue;
    a[v * 3] += dx * s; a[v * 3 + 1] += dy * s; a[v * 3 + 2] += dz * s; moved++; maxd = Math.max(maxd, d); }
  P.setArray(a); console.log('face shape: moved', moved, 'max mm', (maxd * 1000).toFixed(2));
}
