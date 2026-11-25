// the walk: Tripo's legs, hips, spine and head under Dan's (Bandai) arms, his arms time-warped onto Tripo's stride so each
// arm swings against its leg (left heel strike to left heel strike in both)
import { poseAt, fk, carried, THREE } from './rig.mjs';
const ARM = /^(clavicle|shoulder01|upperarm|lowerarm|wrist|finger|metacarpal)/;
// left heel strike: the left foot furthest forward (z), per cycle
export function strikes(rig, c, N = 240) { const z = []; for (let i = 0; i < N; i++) { const W = fk(rig, poseAt(rig, c, c.dur * i / N)); z.push(carried(rig, W, rig.ix('foot_L'), rig.ix('foot_L')).z - carried(rig, W, rig.ix('root'), rig.ix('root')).z); }
  const out = []; for (let i = 0; i < N; i++) { const a = z[(i - 1 + N) % N], b = z[i], d = z[(i + 1) % N]; if (b >= a && b > d && b > Math.max(...z) - 0.05) out.push(c.dur * i / N); } return out; }
const sampleTrack = (tr, t, w) => { const ti = tr.t, v = tr.v; let i = 0; while (i < ti.length - 1 && ti[i + 1] <= t) i++; const j = Math.min(ti.length - 1, i + 1), f = j === i ? 0 : Math.max(0, Math.min(1, (t - ti[i]) / (ti[j] - ti[i])));
  if (w === 4) return new THREE.Quaternion().fromArray(v, i * 4).slerp(new THREE.Quaternion().fromArray(v, j * 4), f).toArray(); return [0, 1, 2].map((k) => v[i * 3 + k] + (v[j * 3 + k] - v[i * 3 + k]) * f); };
export function hybridWalk(dan, legs, arms) {
  const sL = strikes(dan, legs), sA = strikes(dan, arms);
  const cycL = legs.dur / Math.max(1, sL.length), cycA = arms.dur / Math.max(1, sA.length);
  const tracks = {};
  for (const [bone, tr] of Object.entries(legs.tracks)) {
    if (!ARM.test(bone)) { tracks[bone] = tr; continue; }
    const a = arms.tracks[bone]?.rotation; if (!a) { tracks[bone] = tr; continue; }
    const times = tr.rotation.t, v = new Float32Array(times.length * 4);
    for (let i = 0; i < times.length; i++) { const ph = ((((times[i] - sL[0]) / cycL) % 1) + 1) % 1; const ta = (sA[0] + ph * cycA) % arms.dur; v.set(sampleTrack(a, ta, 4), i * 4); }
    for (let i = 1; i < times.length; i++) { const p = i * 4, q = (i - 1) * 4; if (v[p] * v[q] + v[p + 1] * v[q + 1] + v[p + 2] * v[q + 2] + v[p + 3] * v[q + 3] < 0) for (let k = 0; k < 4; k++) v[p + k] = -v[p + k]; }
    tracks[bone] = { rotation: { t: times, v } };
  }
  return { clip: { tracks, dur: legs.dur }, strikes: { legs: sL, arms: sA, cycL, cycA } };
}

// the walk's arms, option A: Tripo's own (hanging close to the body) with a modest fore-and-aft swing put on, against
// the legs: each upper arm turned about the body's side-to-side axis by -k x its own side's thigh swing (normalised to
// `amp` deg at its peak), its forearm `elbow` deg more on the forward swing; option B: Dan's arms, their swing scaled
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (a * Math.PI) / 180);
function worldRot(rig, W, name) { const q = new THREE.Quaternion(); W[rig.ix(name)].decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; }
export function swingArms(dan, base, { amp = 18, back = 4, elbow = 10, signal = null } = {}) {
  const tracks = { ...base.tracks }, times = base.tracks.upperarm01_L.rotation.t, n = times.length;
  const thigh = { L: [], R: [] }, frames = [];
  for (let i = 0; i < n; i++) { const W = fk(dan, poseAt(dan, signal || base, times[i])); frames.push(fk(dan, poseAt(dan, base, times[i])));
    for (const s of ['L', 'R']) { const a = carried(dan, W, dan.ix('upperleg01_' + s), dan.ix('upperleg01_' + s)), b = carried(dan, W, dan.ix('upperleg01_' + s), dan.ix('lowerleg01_' + s)); const d = b.sub(a); thigh[s].push(Math.atan2(d.z, -d.y)); } }
  for (const s of ['L', 'R']) {
    const m = thigh[s].reduce((x, y) => x + y, 0) / n, pk = Math.max(...thigh[s].map((x) => Math.abs(x - m))) || 1;
    const ua = new Float32Array(n * 4), fa = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = -(thigh[s][i] - m) / pk, sw = x > 0 ? amp * x : back * x; // (+: arm forward, as its own leg goes back; less back than forward: the hand stays off the back line)
      const W = frames[i], Wp = worldRot(dan, W, 'shoulder01_' + s), Lua = new THREE.Quaternion().fromArray(base.tracks['upperarm01_' + s].rotation.v, i * 4);
      const R1 = qx(-sw);
      Wp.clone().invert().multiply(R1).multiply(Wp).multiply(Lua).toArray(ua, i * 4);
      const Wfa = worldRot(dan, W, 'lowerarm01_' + s), Wu2 = worldRot(dan, W, 'upperarm02_' + s);
      const Wu2n = R1.clone().multiply(Wu2), R2 = qx(-elbow * Math.max(0, sw) / amp);
      Wu2n.invert().multiply(R2).multiply(R1).multiply(Wfa).toArray(fa, i * 4);
    }
    tracks['upperarm01_' + s] = { rotation: { t: times, v: ua } }; tracks['lowerarm01_' + s] = { rotation: { t: times, v: fa } };
  }
  return { tracks, dur: base.dur };
}
// option B: an arm's local turns pulled toward the clip's mean by k (its swing scaled)
export function scaleArms(clip, k = 0.4) {
  const tracks = { ...clip.tracks };
  for (const [bone, tr] of Object.entries(clip.tracks)) { if (!ARM.test(bone) || !tr.rotation) continue; const v = tr.rotation.v, n = v.length / 4;
    const mean = new THREE.Quaternion(0, 0, 0, 0); for (let i = 0; i < n; i++) { const q = new THREE.Quaternion().fromArray(v, i * 4); if (q.dot(new THREE.Quaternion().fromArray(v, 0)) < 0) q.set(-q.x, -q.y, -q.z, -q.w); mean.x += q.x; mean.y += q.y; mean.z += q.z; mean.w += q.w; } mean.normalize();
    const o = new Float32Array(v.length); for (let i = 0; i < n; i++) mean.clone().slerp(new THREE.Quaternion().fromArray(v, i * 4), k).toArray(o, i * 4); tracks[bone] = { rotation: { t: tr.rotation.t, v: o } }; }
  return { tracks, dur: clip.dur };
}

// one clip's upper body over another's legs (a seated call's arms and head over a standing idle): the bones from
// `fromBone` up and out (the spine above it, the neck, head, shoulders, arms) from `upper`, the rest from `lower`,
// on `lower`'s times (`upper` looped)
const UPPER = (b) => /^(spine0[1-3]|neck|head|clavicle|shoulder01|upperarm|lowerarm|wrist|finger|metacarpal|jaw|eye|tongue|special)/.test(b);
export function upperOver(lower, upper) {
  const tracks = {};
  for (const [bone, tr] of Object.entries(lower.tracks)) {
    const u = upper.tracks[bone]?.rotation; if (!UPPER(bone) || !u) { tracks[bone] = tr; continue; }
    const times = tr.rotation.t, v = new Float32Array(times.length * 4);
    for (let i = 0; i < times.length; i++) v.set(sampleTrack(u, times[i] % upper.dur, 4), i * 4);
    tracks[bone] = { rotation: { t: times, v } };
  }
  return { tracks, dur: lower.dur };
}
