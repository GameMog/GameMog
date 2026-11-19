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
