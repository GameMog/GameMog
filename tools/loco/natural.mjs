import { poseAt, fk, carried, THREE } from './rig.mjs';
// a clip's own ground speed on a rig (the stance foot's backward speed, median) and its loop seam (deg, worst bone)
export function natural(rig, c, N = 60) { const P = []; for (let i = 0; i <= N; i++) { const W = fk(rig, poseAt(rig, c, c.dur * i / N)); P.push(['foot_L', 'foot_R'].map((a) => carried(rig, W, rig.ix(a), rig.ix(a)))); }
  const dt = c.dur / N, vs = [], mn = Math.min(...P.flat().map((p) => p.y)); for (let i = 0; i < N; i++) for (const s of [0, 1]) if (P[i][s].y < mn + 0.025 && P[i + 1][s].y < mn + 0.025) vs.push(-(P[i + 1][s].z - P[i][s].z) / dt); vs.sort((a, b) => a - b); return vs[vs.length >> 1]; }
export function seam(c) { let mx = 0; for (const [n, t] of Object.entries(c.tracks)) { const r = t.rotation; if (!r) continue; const a = new THREE.Quaternion().fromArray(r.v, 0), b = new THREE.Quaternion().fromArray(r.v, r.v.length - 4); mx = Math.max(mx, a.angleTo(b) * 57.3); } return mx; }
