// the walk: Tripo's legs, hips, spine and head under Dan's (Bandai) arms, his arms time-warped onto Tripo's stride so each
// arm swings against its leg (left heel strike to left heel strike in both)
import { poseAt, fk, carried, THREE } from './rig.mjs';
const ARM = /^(clavicle|shoulder01|upperarm|lowerarm|wrist|finger|metacarpal)/;
// left heel strike: the left foot furthest forward (z), per cycle
function strikes(rig, c, N = 240) { const z = []; for (let i = 0; i < N; i++) { const W = fk(rig, poseAt(rig, c, c.dur * i / N)); z.push(carried(rig, W, rig.ix('foot_L'), rig.ix('foot_L')).z - carried(rig, W, rig.ix('root'), rig.ix('root')).z); }
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
