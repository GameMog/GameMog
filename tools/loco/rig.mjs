// minimal rig loader + FK + skinning evaluator (Node), three math
import { createRequire } from 'module';
const require = createRequire((process.env.FORGE_TOOLBOX_DIR || '../GameMog-storykit/.scratch/tools/gltf') + '/node_modules/');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');
export const THREE = await import((process.env.THREE_MODULE || new URL('../../../node_modules/three/build/three.module.js', import.meta.url).pathname));
const { Matrix4, Quaternion, Vector3 } = THREE;
await MeshoptDecoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const arm0 = (J) => J.find((j) => j.getName() === 'root')?.listParents().find((x) => x.propertyType === 'Node');
const dec = (acc) => { let o = Float32Array.from(acc.getArray()); if (acc.getNormalized()) { const n0 = acc.getArray(), f = n0 instanceof Int16Array ? 32767 : n0 instanceof Int8Array ? 127 : n0 instanceof Uint16Array ? 65535 : 255; o = Float32Array.from(n0, (x) => Math.max(-1, x / f)); } return o; };
export async function loadRig(f, { uprightArmature = false, rootName = 'root' } = {}) {
  const d = await io.read(f), R = d.getRoot(), sk = R.listSkins()[0], J = sk.listJoints(), IBM = sk.getInverseBindMatrices();
  const names = J.map((j) => j.getName());
  // (nearest joint ancestor; a non-joint node between (armhang_L/R) kept as its translation only: the engine levels it, pack.js unhang)
  const via = J.map(() => null);
  const parent = J.map((j, k) => { let p = j.listParents().find((x) => x.propertyType === 'Node'); const mid = [];
    while (p && !J.includes(p) && p.getName() !== arm0(J)?.getName()) { mid.push(p); p = p.listParents().find((x) => x.propertyType === 'Node'); }
    if (mid.length && p && J.includes(p)) via[k] = mid.reduce((m, n) => m.premultiply(new Matrix4().compose(new Vector3(...n.getTranslation()), /^armhang/.test(n.getName()) ? new Quaternion() : new Quaternion(...n.getRotation()), new Vector3(...n.getScale()))), new Matrix4());
    return p && J.includes(p) ? J.indexOf(p) : -1; });
  const rest = J.map((j) => ({ t: new Vector3(...j.getTranslation()), q: new Quaternion(...j.getRotation()), s: new Vector3(...j.getScale()) }));
  const ibm = J.map((j, k) => new Matrix4().fromArray(IBM.getElement(k, [])));
  const bind = ibm.map((m) => m.clone().invert());
  const arm = J[names.indexOf(rootName)].listParents().find((x) => x.propertyType === 'Node');
  const armM = new Matrix4().compose(new Vector3(...arm.getTranslation()), uprightArmature ? new Quaternion() : new Quaternion(...arm.getRotation()), new Vector3(...arm.getScale()));
  const anims = loadAnims(R);
  return { doc: d, names, parent, via, rest, ibm, bind, armM, anims, ix: (n) => names.indexOf(n) };
}
export function loadAnims(R) {
  const out = {};
  for (const a of R.listAnimations()) {
    const tr = {}; let dur = 0;
    for (const ch of a.listChannels()) { const n = ch.getTargetNode()?.getName(); if (!n) continue; const s = ch.getSampler(); const t = Float32Array.from(s.getInput().getArray()); dur = Math.max(dur, t[t.length - 1]); (tr[n] ||= {})[ch.getTargetPath()] = { t, v: dec(s.getOutput()) }; }
    out[a.getName()] = { tracks: tr, dur };
  }
  return out;
}
export async function loadPack(f) { const d = await io.read(f); return loadAnims(d.getRoot()); }
function sample(track, t, w) {
  const ti = track.t, v = track.v; let i = 0; while (i < ti.length - 1 && ti[i + 1] <= t) i++;
  const j = Math.min(ti.length - 1, i + 1), f = j === i ? 0 : Math.max(0, Math.min(1, (t - ti[i]) / (ti[j] - ti[i])));
  if (w === 4) { const a = new Quaternion().fromArray(v, i * 4), b = new Quaternion().fromArray(v, j * 4); return a.slerp(b, f); }
  return new Vector3(v[i*3] + (v[j*3]-v[i*3])*f, v[i*3+1] + (v[j*3+1]-v[i*3+1])*f, v[i*3+2] + (v[j*3+2]-v[i*3+2])*f);
}
// local pose of every joint at t. mod(name, path, value) to retarget
export function poseAt(rig, clip, t, mod) {
  return rig.names.map((n, k) => {
    const tr = clip?.tracks[n]; let q = tr?.rotation ? sample(tr.rotation, t, 4) : rig.rest[k].q.clone();
    let p = tr?.translation ? sample(tr.translation, t, 3) : rig.rest[k].t.clone();
    if (mod) ({ q, p } = mod(n, k, q, p, !!tr?.rotation, !!tr?.translation));
    return { q, p, s: rig.rest[k].s };
  });
}
export function fk(rig, pose) {
  const W = [];
  for (let k = 0; k < rig.names.length; k++) { const L = new Matrix4().compose(pose[k].p, pose[k].q, pose[k].s); const p = rig.parent[k]; W[k] = (p < 0 ? rig.armM.clone() : W[p].clone()); if (rig.via?.[k]) W[k].multiply(rig.via[k]); W[k].multiply(L); }
  return W;
}
// where bind point of joint b lands, carried by joint a's skin matrix
export function carried(rig, W, a, b) { const S = W[a].clone().multiply(rig.ibm[a]); return new Vector3().setFromMatrixPosition(rig.bind[b]).applyMatrix4(S); }
export const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
// the skinned vertices (a subsample) for ground contact: min y of the posed mesh
export async function loadSkinVerts(f, every = 3) {
  const d = await io.read(f), R = d.getRoot(), sk = R.listSkins()[0], J = sk.listJoints();
  const out = [];
  for (const n of R.listNodes()) { if (n.getSkin() !== sk || !n.getMesh()) continue;
    for (const p of n.getMesh().listPrimitives()) { const P = p.getAttribute('POSITION'), JJ = p.getAttribute('JOINTS_0'), WW = p.getAttribute('WEIGHTS_0'); if (!P || !JJ) continue;
      const a = [0,0,0], j = [0,0,0,0], w = [0,0,0,0];
      for (let v = 0; v < P.getCount(); v += every) { P.getElement(v, a); JJ.getElement(v, j); WW.getElement(v, w); if (a[1] > 0.35) continue; out.push([a[0], a[1], a[2], j[0], j[1], j[2], j[3], w[0], w[1], w[2], w[3]]); } } }
  return out;
}
export function skinMinY(rig, W, verts) {
  const S = W.map((m, k) => m.clone().multiply(rig.ibm[k]).elements); let mn = 1e9;
  for (const v of verts) { let y = 0; for (let i = 0; i < 4; i++) { const wt = v[7 + i]; if (!wt) continue; const e = S[v[3 + i]]; y += wt * (e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13]); } if (y < mn) mn = y; }
  return mn;
}
