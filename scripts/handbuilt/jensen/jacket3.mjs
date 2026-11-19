// Jensen's moto jacket, caricature round 3 (the critic):
//   chestWeightsPass(doc, K)  the dark round "dent" on the chest by the collar was a few front points carrying a share
//                             of the upper-arm bone (up to 0.26, their neighbours none): as the arms came down from the
//                             bind A-pose, those points were pulled into the chest and the leather pitted round them.
//                             On the chest front the arm bones' shares fade out (to nothing inside |x| 0.09 m) and each
//                             point's weights are renormalised
//   slimSleevesPass(doc, K)   the upper arms read inflated: every point riding the arm bones pulled in toward the arm's
//                             bone line (bind pose) by K.k of its distance, in proportion to its arm share
//   crispLeatherPass(doc, K)  the quilted shoulder ribs read as puffy stacked tubes: the leather's normal map at K.scale
// Original work (no new assets), CC0.
import { THREE } from '../young-hero/glb.mjs';
const sm = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const ARM = /^(upperarm|lowerarm)/;

function jacketPrims(doc) { const m = doc.getRoot().listMeshes().find((q) => q.getName() === 'moto-jacket'); if (!m) throw new Error('no moto-jacket'); return m.listPrimitives(); }

export function chestWeightsPass(doc, K = {}) {
  K = { xIn: 0.09, xOut: 0.135, y0: 1.24, y1: 1.48, z0: 0.045, ...K };
  const jn = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()); let n = 0, peak = 0;
  for (const p of jacketPrims(doc)) { const P = p.getAttribute('POSITION').getArray(), Ja = p.getAttribute('JOINTS_0').getArray(), Wacc = p.getAttribute('WEIGHTS_0'), W = Wacc.getArray().slice();
    const sc = Wacc.getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1;
    for (let v = 0; v < P.length / 3; v++) { const x = Math.abs(P[v * 3]), y = P[v * 3 + 1], z = P[v * 3 + 2]; if (y < K.y0 || y > K.y1 || z < K.z0) continue;
      const f = sm(K.xIn, K.xOut, x) * sm(K.y1, K.y1 - 0.02, y); if (f >= 1) continue; let arm = 0, s = 0;
      for (let k = 0; k < 4; k++) if (ARM.test(jn[Ja[v * 4 + k]] || '')) arm += W[v * 4 + k] / sc; if (arm <= 0) continue;
      const w = []; for (let k = 0; k < 4; k++) { w[k] = W[v * 4 + k] / sc; if (ARM.test(jn[Ja[v * 4 + k]] || '')) w[k] *= f; s += w[k]; }
      if (s <= 0) continue; for (let k = 0; k < 4; k++) W[v * 4 + k] = sc === 1 ? w[k] / s : Math.round((w[k] / s) * sc); peak = Math.max(peak, arm * (1 - f)); n++; }
    Wacc.setArray(W); }
  console.log('chest weights: points', n, 'arm share removed up to', peak.toFixed(2));
}

export function slimSleevesPass(doc, K = {}) {
  K = { k: 0.12, kLow: 0.06, ...K };
  const sk = doc.getRoot().listSkins()[0], J = sk.listJoints(), jn = J.map((j) => j.getName()), IB = sk.getInverseBindMatrices().getArray();
  const at = (name) => { const i = jn.indexOf(name); return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(IB.slice(i * 16, i * 16 + 16)).invert()); };
  const seg = {}; for (const s of ['L', 'R']) seg[s] = [at('upperarm01_' + s), at('lowerarm01_' + s), at('wrist_' + s)];
  const close = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t); };
  let n = 0;
  for (const p of jacketPrims(doc)) { const acc = p.getAttribute('POSITION'), P = acc.getArray().slice(), Ja = p.getAttribute('JOINTS_0').getArray(), Wacc = p.getAttribute('WEIGHTS_0'), W = Wacc.getArray();
    const sc = Wacc.getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1;
    for (let v = 0; v < P.length / 3; v++) { let up = 0, low = 0, side = '';
      for (let k = 0; k < 4; k++) { const nm = jn[Ja[v * 4 + k]] || '', w = W[v * 4 + k] / sc; if (/^upperarm/.test(nm)) { up += w; side = nm.slice(-1); } if (/^lowerarm/.test(nm)) { low += w; side = nm.slice(-1); } }
      const a = up * K.k + low * K.kLow; if (a <= 0.005 || !side) continue;
      const q = new THREE.Vector3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), [s0, s1, s2] = seg[side], c1 = close(q, s0, s1), c2 = close(q, s1, s2), c = q.distanceTo(c1) < q.distanceTo(c2) ? c1 : c2;
      q.lerp(c, a); P[v * 3] = q.x; P[v * 3 + 1] = q.y; P[v * 3 + 2] = q.z; n++; }
    acc.setArray(P); }
  console.log('slim sleeves: points', n, 'upper arm in', K.k, 'forearm in', K.kLow);
}

export function crispLeatherPass(doc, K = {}) {
  K = { scale: 0.55, ...K };
  const m = doc.getRoot().listMaterials().find((q) => q.getName() === 'leather'); if (!m || !m.getNormalTexture()) return;
  m.setNormalScale(K.scale); console.log('crisp leather: normal scale', K.scale);
}

// Round 5 (the critic: "still too smooth, glossy and plasticky; white or grey smudge patches on the shoulders and upper
// chest"): real leather's surface on the jacket's own maps, at 1024 texels per side of the atlas sampled up to its size:
//   a pebbled grain (soft cells about 5 texels across) in the normal map everywhere, crease wear (short wavy ridges
//   across the arm) at the elbows (where the upper and lower arm bones share the points) and soft creases at the front
//   pockets, a little lighter and rougher in the worn creases; the whole leather rougher with a thin, soft coat (the
//   glossy clearcoat's mirror of the sky was the grey smudge on the shoulders), and the quilted shoulder panels'
//   ribs a little deeper (the normal map's scale).
export async function leatherWearPass(doc, K = {}) {
  K = { grain: 0.28, crease: 0.9, pocket: 0.6, rough: 26, wearLight: 0.14, scale: 0.85, coat: 0.22, coatRough: 0.42, leatherRough: 0.66, ...K };
  const { raster, rgba, setWebp, noise3, fbm, sm: smo } = await import('../young-hero/glb.mjs');
  const mat = doc.getRoot().listMaterials().find((q) => q.getName() === 'leather'); if (!mat) return;
  const jn = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName());
  const S = 1024, POS = new Float32Array(S * S * 3).fill(NaN), ELB = new Float32Array(S * S);
  for (const p of jacketPrims(doc)) { if (p.getMaterial() !== mat) continue; const P = p.getAttribute('POSITION').getArray(), U = p.getAttribute('TEXCOORD_0'), J = p.getAttribute('JOINTS_0').getArray(), Wa = p.getAttribute('WEIGHTS_0'), W = Wa.getArray();
    const sc = Wa.getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1, uv = U.getArray(), n = P.length / 3, el = new Float32Array(n);
    for (let v = 0; v < n; v++) { let up = 0, lo = 0; for (let k = 0; k < 4; k++) { const nm = jn[J[v * 4 + k]] || '', w = W[v * 4 + k] / sc; if (/^upperarm/.test(nm)) up += w; if (/^lowerarm/.test(nm)) lo += w; } el[v] = Math.min(1, 4 * Math.min(up, lo)); }
    raster([...p.getIndices().getArray()], (v) => [uv[v * 2] * S, uv[v * 2 + 1] * S], S, (x, y, l1, l2, l3, a, b, c) => { const i = y * S + x;
      for (let k = 0; k < 3; k++) POS[i * 3 + k] = l1 * P[a * 3 + k] + l2 * P[b * 3 + k] + l3 * P[c * 3 + k]; ELB[i] = l1 * el[a] + l2 * el[b] + l3 * el[c]; }, 0.02); }
  // the height field per atlas texel at 1024: grain cells, the elbow's ridges, the pockets' soft creases
  const H = new Float32Array(S * S), WR = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) { const X = POS[i * 3]; if (Number.isNaN(X)) continue; const y = POS[i * 3 + 1], z = POS[i * 3 + 2], x = Math.abs(X);
    let h = 0, wr = 0;
    // (the elbow: ridges running round the arm, wavy and broken)
    const e = ELB[i]; if (e > 0.02) { const r = Math.sin(y * 260 + 6 * fbm(X, y, z, 30) + X * 40) * 0.5 + 0.5, brk = smo(0.35, 0.7, fbm(X + 5, y, z, 55)); h += K.crease * e * (Math.pow(r, 3) - 0.3) * brk; wr += e * Math.pow(r, 3) * brk; }
    // (the front pockets: a few soft diagonal creases round each zip pocket)
    const pk = smo(0.06, 0.09, x) * smo(0.2, 0.17, x) * smo(0.93, 0.97, y) * smo(1.16, 1.1, y) * (z > 0.04 ? 1 : 0); if (pk > 0) { const r = Math.sin((y + x * 0.6) * 220 + 5 * fbm(X, y, z, 25)) * 0.5 + 0.5; h += K.pocket * pk * (Math.pow(r, 4) - 0.2); wr += pk * Math.pow(r, 4) * 0.6; }
    H[i] = h; WR[i] = Math.min(1, wr); }
  // the normal map (at its own size): the grain (texture space) plus the height field's slope
  const nt = mat.getNormalTexture(); if (nt) { const { data: nm, w: NW } = await rgba(nt); const k = S / NW; let n = 0;
    for (let yy = 1; yy < NW - 1; yy++) for (let xx = 1; xx < NW - 1; xx++) { const j = (yy * NW + xx) * 4, si = Math.floor(yy * k) * S + Math.floor(xx * k); if (Number.isNaN(POS[si * 3])) continue;
      const gx = (noise3((xx + 1) * 0.2, yy * 0.2, 3.1) - noise3((xx - 1) * 0.2, yy * 0.2, 3.1)) + 0.5 * (noise3((xx + 1) * 0.55, yy * 0.55, 7) - noise3((xx - 1) * 0.55, yy * 0.55, 7));
      const gy = (noise3(xx * 0.2, (yy + 1) * 0.2, 3.1) - noise3(xx * 0.2, (yy - 1) * 0.2, 3.1)) + 0.5 * (noise3(xx * 0.55, (yy + 1) * 0.55, 7) - noise3(xx * 0.55, (yy - 1) * 0.55, 7));
      const sx0 = Math.min(S - 1, si + 1), sx1 = Math.max(0, si - 1), sy0 = Math.min(S * S - 1, si + S), sy1 = Math.max(0, si - S);
      const hx = (H[sx0] - H[sx1]) * 0.9, hy = (H[sy0] - H[sy1]) * 0.9;
      let nx = nm[j] / 127.5 - 1, ny = nm[j + 1] / 127.5 - 1, nz = nm[j + 2] / 127.5 - 1; nx += -(gx * K.grain + hx) * nz; ny += (gy * K.grain + hy) * nz; const L = Math.hypot(nx, ny, nz) || 1;
      nm[j] = Math.round((nx / L * 0.5 + 0.5) * 255); nm[j + 1] = Math.round((ny / L * 0.5 + 0.5) * 255); nm[j + 2] = Math.round((nz / L * 0.5 + 0.5) * 255); n++; }
    await setWebp(nt, nm, NW, NW, 90); console.log('leather wear: normal texels', n); }
  // roughness up (green), more in the worn creases; the creases' colour a little lighter (worn)
  const mr = mat.getMetallicRoughnessTexture(); if (mr) { const { data, w } = await rgba(mr); const k = S / w;
    for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) { const j = (yy * w + xx) * 4, si = Math.floor(yy * k) * S + Math.floor(xx * k); if (Number.isNaN(POS[si * 3])) continue;
      data[j + 1] = Math.min(255, data[j + 1] + K.rough + WR[si] * 40 + 10 * (noise3(xx * 0.3, yy * 0.3, 1) - 0.5)); }
    await setWebp(mr, data, w, w, 90); }
  const bt = mat.getBaseColorTexture(); if (bt && K.wearLight) { const { data, w } = await rgba(bt); const k = S / w;
    for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) { const j = (yy * w + xx) * 4, si = Math.floor(yy * k) * S + Math.floor(xx * k); if (Number.isNaN(POS[si * 3])) continue;
      const f = 1 + K.wearLight * WR[si] + 0.06 * (fbm(xx, yy, 0, 0.02) - 0.5); for (let c = 0; c < 3; c++) data[j + c] = Math.min(255, Math.round(data[j + c] * f)); }
    await setWebp(bt, data, w, w, 90); }
  mat.setRoughnessFactor(K.leatherRough).setNormalScale(K.scale); const cc = mat.getExtension('KHR_materials_clearcoat'); if (cc) cc.setClearcoatFactor(K.coat).setClearcoatRoughnessFactor(K.coatRough);
  const ex = mat.getExtras() || {}; mat.setExtras({ ...ex, look: { ...(ex.look || {}), leather: 'grain', coat: K.coat, coatRough: K.coatRough } });
  console.log('leather wear: grain', K.grain, 'coat', K.coat, 'rough', K.leatherRough);
}
