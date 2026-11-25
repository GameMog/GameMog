// cross-rig retarget onto Dan's 66-bone rig: global deltas against matched bind poses (the Bandai method).
//   D_s(t) = A Gsrc_s(t) inv(Gsrc_s(bind)) inv(A);  Gdan_b(t) = D_s(t) Gdan_b(ref), ref = Dan's bind with each limb swung
//   to point where the source's bind segment points. Root: the source hips' travel, leg-scaled, made in place.
import { loadRig, poseAt, fk, THREE } from './rig.mjs';
const { Vector3, Quaternion, Matrix4 } = THREE;
const S = (L, R) => [['L', L], ['R', R]];
export const MAPS = {
  mixamo: { root: 'mixamorig:Hips', n: (x) => 'mixamorig:' + x, bones: [['root', 'Hips'], ['spine05', 'Spine'], ['spine03', 'Spine1'], ['spine01', 'Spine2'], ['neck01', 'Neck'], ['head', 'Head'],
    ...['L', 'R'].flatMap((s) => { const m = s === 'L' ? 'Left' : 'Right'; return [[`clavicle_${s}`, m + 'Shoulder'], [`upperarm01_${s}`, m + 'Arm'], [`lowerarm01_${s}`, m + 'ForeArm'], [`wrist_${s}`, m + 'Hand'], [`upperleg01_${s}`, m + 'UpLeg'], [`lowerleg01_${s}`, m + 'Leg'], [`foot_${s}`, m + 'Foot']]; })] },
  ual: { root: 'root', n: (x) => x, bones: [['root', 'pelvis'], ['spine05', 'spine_01'], ['spine03', 'spine_02'], ['spine01', 'spine_03'], ['neck01', 'neck_01'], ['head', 'Head'],
    ...['L', 'R'].flatMap((s) => { const m = s.toLowerCase(); return [[`clavicle_${s}`, 'clavicle_' + m], [`upperarm01_${s}`, 'upperarm_' + m], [`lowerarm01_${s}`, 'lowerarm_' + m], [`wrist_${s}`, 'hand_' + m], [`upperleg01_${s}`, 'thigh_' + m], [`lowerleg01_${s}`, 'calf_' + m], [`foot_${s}`, 'foot_' + m]]; })] },
};
// target ref swings: [dan bone, dan end joint, src bone(dan name of its mapped bone), src end (dan name)]
const SWING = ['L', 'R'].flatMap((s) => [[`clavicle_${s}`, `upperarm01_${s}`], [`upperarm01_${s}`, `lowerarm01_${s}`], [`lowerarm01_${s}`, `wrist_${s}`], [`upperleg01_${s}`, `lowerleg01_${s}`], [`lowerleg01_${s}`, `foot_${s}`]]);
const SPINE_SWING = [['spine05', 'neck01'], ['neck01', 'head']];
const decomp = (m) => { const p = new Vector3(), q = new Quaternion(), s = new Vector3(); m.decompose(p, q, s); return { p, q }; };
export async function retargetClip(dan, srcFile, kind, clipName, { fps = 30, from = 0, to = null, outName = clipName } = {}) {
  const M = MAPS[kind], src = await loadRig(srcFile, { rootName: M.root });
  const sIx = (danName) => { const e = M.bones.find(([d]) => d === danName); return e ? src.ix(M.n(e[1])) : -1; };
  // source bind (world, incl. its armature) and facing
  const sB = src.bind.map(decomp);
  const fwdOf = (P) => { const lat = P('upperleg01_L').clone().sub(P('upperleg01_R')); lat.y = 0; return lat.normalize().cross(new Vector3(0, 1, 0)).normalize(); };
  const sF = fwdOf((n) => sB[sIx(n)].p);
  const A = new Quaternion().setFromUnitVectors(sF, new Vector3(0, 0, 1)); // (yaw: both Y up)
  // Dan ref: bind locals (rotation), FK in his armature (upright)
  const dB = dan.bind.map(decomp), N = dan.names.length;
  const refW = dB.map((x) => x.q.clone()), refP = dB.map((x) => x.p.clone());
  const kids = (k) => dan.parent.map((p, i) => (p === k ? i : -1)).filter((i) => i >= 0);
  const desc = (k) => { const out = []; const st = [k]; while (st.length) { const x = st.pop(); for (const c of kids(x)) { out.push(c); st.push(c); } } return out; };
  const swing = (b, e) => { const k = dan.ix(b), ke = dan.ix(e), sk = sIx(b), se = sIx(e); if (k < 0 || ke < 0 || sk < 0 || se < 0) return 0;
    const want = sB[se].p.clone().sub(sB[sk].p).applyQuaternion(A).normalize(), have = refP[ke].clone().sub(refP[k]).normalize();
    const r = new Quaternion().setFromUnitVectors(have, want);
    for (const c of [k, ...desc(k)]) { refW[c].premultiply(r); if (c !== k) refP[c].sub(refP[k]).applyQuaternion(r).add(refP[k]); }
    return have.angleTo(want) * 57.3; };
  const sw = {}; for (const [b, e] of [...SPINE_SWING, ...SWING]) sw[b] = +swing(b, e).toFixed(1);
  const refL = refW.map((q, k) => { const p = dan.parent[k]; return p < 0 ? q.clone() : refW[p].clone().invert().multiply(q); });
  // per frame
  const clip = src.anims[clipName]; const T1 = to ?? clip.dur, n = Math.round((T1 - from) * fps) + 1, times = [], rot = Array.from({ length: N }, () => []), rootP = [];
  const sLeg = sB[sIx('upperleg01_L')].p.y - sB[sIx('foot_L')].p.y, dLeg = dB[dan.ix('upperleg01_L')].p.y - dB[dan.ix('foot_L')].p.y, k = dLeg / sLeg;
  const hipS0 = sB[sIx('root')].p, hipD0 = dB[dan.ix('root')].p;
  for (let i = 0; i < n; i++) { const t = from + (T1 - from) * i / (n - 1); times.push(t - from);
    const W = fk(src, poseAt(src, clip, t)); const G = (danName) => decomp(W[sIx(danName)]).q;
    const Gd = new Array(N);
    for (let b = 0; b < N; b++) { const p = dan.parent[b]; const nm = dan.names[b], s = sIx(nm);
      if (s >= 0) { const D = A.clone().multiply(G(nm)).multiply(sB[s].q.clone().invert()).multiply(A.clone().invert()); Gd[b] = D.multiply(refW[b]); }
      else Gd[b] = (p < 0 ? new Quaternion() : Gd[p]).clone().multiply(refL[b]);
      rot[b].push(p < 0 ? Gd[b].clone() : Gd[p].clone().invert().multiply(Gd[b])); }
    const hp = decomp(W[sIx('root')]).p.sub(hipS0).applyQuaternion(A).multiplyScalar(k).add(hipD0); rootP.push(hp); }
  // in place: the horizontal travel's line taken out; speed = its slope
  const dz = rootP[n - 1].clone().sub(rootP[0]), dur = times[n - 1], speed = Math.hypot(dz.x, dz.z) / dur;
  for (let i = 0; i < n; i++) { const f = i / (n - 1); rootP[i].x -= dz.x * f; rootP[i].z -= dz.z * f; }
  const mx = rootP.reduce((a, p) => a + p.x, 0) / n, mz = rootP.reduce((a, p) => a + p.z, 0) / n; for (const p of rootP) { p.x -= mx - hipD0.x; p.z -= mz - hipD0.z; }
  // root local (Dan's armature upright: rotation none, its scale and translation)
  const aP = new Vector3(), aQ = new Quaternion(), aS = new Vector3(); dan.armM.decompose(aP, aQ, aS);
  const rootLocal = rootP.map((p) => p.clone().sub(aP).divideScalar(aS.x));
  // keep the rotations continuous (no sign flips)
  for (const r of rot) for (let i = 1; i < r.length; i++) if (r[i].dot(r[i - 1]) < 0) r[i].set(-r[i].x, -r[i].y, -r[i].z, -r[i].w);
  const tracks = {}; dan.names.forEach((nm, b) => { tracks[nm] = { rotation: { t: Float32Array.from(times), v: Float32Array.from(rot[b].flatMap((q) => q.toArray())) } }; });
  tracks.root.translation = { t: Float32Array.from(times), v: Float32Array.from(rootLocal.flatMap((p) => p.toArray())) };
  return { name: outName, clip: { tracks, dur }, speed: speed * 1, swings: sw, legScale: k };
}
