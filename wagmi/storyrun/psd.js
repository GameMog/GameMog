// Mog City story runner: pose-space correctives for a forged person's shoulders. A primitive whose GLB carries correctives
// has, in its extras (three: geometry.userData.psd), a list of drivers
//   { target: 'psd_run_L', bone: 'upperarm01_L', parent: 'clavicle_L', bindDir: [x,y,z], poseDir: [x,y,z] }
// and morph targets of those names. Each frame, before it is drawn, each driver's weight is the upper arm's turn toward
// its pose: its +y in its clavicle's space, measured from the neutral (bindDir: the arms hanging, idle) to the pose
// (poseDir), eased (smoothstep); a side's weights are shared out when they add past one, so two poses near each other
// never stack. Installed once on SkinnedMesh's prototype, so every clone of such a body is driven (cast.js and the hero
// clone their GLB); any mesh without the extras returns at once. A few matrix products per body per frame.
//   installPSD() -> true (idempotent)
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _b = new THREE.Vector3();
const STATE = new WeakMap();   // (per mesh: its drivers resolved to bones and morph indices, never in userData: clones copy that as JSON)

function stateOf(mesh, psd) {
  let st = STATE.get(mesh); if (st) return st;
  const bones = {}; for (const b of mesh.skeleton?.bones || []) bones[b.name] = b;
  const bySide = new Map();
  for (const e of psd) { const i = mesh.morphTargetDictionary?.[e.target]; if (i == null) continue;
    const s = bySide.get(e.bone) || { B: bones[e.bone], P: bones[e.parent], entries: [] }; s.entries.push({ i, pose: new THREE.Vector3().fromArray(e.poseDir), bind: new THREE.Vector3().fromArray(e.bindDir) }); bySide.set(e.bone, s); }
  st = { sides: [...bySide.values()].filter((s) => s.B && s.P), at: -1 }; STATE.set(mesh, st); return st;
}

export function psdTick(mesh) {
  const psd = mesh.geometry?.userData?.psd; if (!psd || !mesh.morphTargetInfluences) return;
  const st = stateOf(mesh, psd), now = performance.now(); if (st.at === now) return; st.at = now;   // (once a frame: the shadow passes draw it again)
  const inf = mesh.morphTargetInfluences;
  for (const s of st.sides) {
    _m.copy(s.P.matrixWorld).invert().multiply(s.B.matrixWorld);
    _v.set(_m.elements[4], _m.elements[5], _m.elements[6]).normalize();   // (its +y, in its parent's space)
    let sum = 0; const ws = s.entries.map((e) => {
      const full = Math.acos(THREE.MathUtils.clamp(e.bind.dot(e.pose), -1, 1)), a = Math.acos(THREE.MathUtils.clamp(_v.dot(e.pose), -1, 1));
      const x = THREE.MathUtils.clamp(1 - a / Math.max(full, 1e-6), 0, 1), w = x * x * (3 - 2 * x); sum += w; return w; });
    s.entries.forEach((e, k) => { inf[e.i] = sum > 1 ? ws[k] / sum : ws[k]; });
  }
}

let installed = false;
export function installPSD() {
  if (installed) return true; installed = true;
  const proto = THREE.SkinnedMesh.prototype, prev = proto.onBeforeRender;
  proto.onBeforeRender = function (...a) { if (this.geometry?.userData?.psd) psdTick(this); return prev.apply(this, a); };
  return true;
}
