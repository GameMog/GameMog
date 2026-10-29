// The Suits' arms at rest: the motion capture pack (assets/anim/bandai/suits.glb) holds the arms out from the body in
// its standing and walking clips (the upper arm ~6 deg off the side and the forearm a further ~12, so the hands hang
// 25-30 cm out from the middle, well clear of the trousers: an A-shape, a mannequin's stance). A man in a suit lets his
// arms fall: the upper arm straight down by the jacket's side, the forearm in with it, the hand at the trouser seam.
// relaxArms(clips, model) brings them in, once per clip (the clips are shared by every caller of loadGLB), key by key on
// a copy of the model's rig posed at each key: each upper arm and forearm turned in toward the body's middle plane only,
// so the swing of the walk forward and back is the capture's own; a forearm raised (a gesture) is left as it is.
import * as THREE from 'three/webgpu';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const done = new WeakSet();
const CLIPS = new Set(['suitIdle', 'suitIdleGuide', 'suitWalk', 'suitWalk2', 'suitBack', 'suitLeft', 'suitRight']);
// the angle out from the body's middle plane (deg) that is kept: A, and K of the capture's angle over it
const UPPER = { A: 1.0, K: 0.15 }, FORE = { A: 4.0, K: 0.2 };
const D = Math.PI / 180;

export function relaxArms(clips, model) {
  const list = (clips instanceof Map ? [...clips.values()] : Array.isArray(clips) ? clips : Object.values(clips)).filter((c) => c && CLIPS.has(c.name) && !done.has(c));
  if (!list.length || !model) return;
  const rig = skClone(model), B = {};
  rig.traverse((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
  if (!B.upperArmL || !B.forearmL || !B.handL || !B.upperArmR || !B.forearmR || !B.handR) return;
  rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.set(1, 1, 1);
  const mixer = new THREE.AnimationMixer(rig);
  const vS = new THREE.Vector3(), vE = new THREE.Vector3(), vH = new THREE.Vector3(), d = new THREE.Vector3();
  const qp = new THREE.Quaternion(), qr = new THREE.Quaternion(), d2 = new THREE.Vector3();
  // the bone from a to b brought in toward the body's middle plane: the side (x) part of its line cut to what is left
  // of its angle off that plane over P.A (x P.K), the rest of the line (down, forward or back: the swing) kept in
  // proportion; qr: the world turn that does it
  const inward = (a, b, s, P, w) => {
    d.subVectors(b, a).normalize();
    const lat = Math.asin(THREE.MathUtils.clamp(s * d.x, -1, 1)), A = P.A * D;
    if (lat <= A || w <= 0) return qr.identity();
    const lat2 = lat - (lat - (A + (lat - A) * P.K)) * w, yz = Math.hypot(d.y, d.z), k = Math.cos(lat2) / Math.max(1e-6, yz);
    d2.set(s * Math.sin(lat2), d.y * k, d.z * k).normalize();
    return qr.setFromUnitVectors(d, d2);
  };
  // turn bone by the world turn qr: local' = parentW^-1 * qr * parentW * local
  const turn = (bone) => { bone.parent.getWorldQuaternion(qp); bone.quaternion.premultiply(qp).premultiply(qr).premultiply(qp.invert()); bone.updateMatrixWorld(true); };
  for (const clip of list) {
    const tr = {}; for (const t of clip.tracks) { const [bn, prop] = t.name.split('.'); if (prop === 'quaternion' && /^(upperArm|forearm)[LR]$/.test(bn)) tr[bn] = t; }
    const act = mixer.clipAction(clip); act.play();
    const fresh = {};
    for (const [bn, t] of Object.entries(tr)) {
      const vals = t.values.slice(), side = bn.endsWith('L') ? 'L' : 'R', s = side === 'L' ? 1 : -1, isFore = bn.startsWith('forearm');
      const U = B['upperArm' + side], F = B['forearm' + side], H = B['hand' + side];
      for (let i = 0; i < t.times.length; i++) {
        act.time = t.times[i]; mixer.update(0); rig.updateMatrixWorld(true);
        // the forearm's lift from straight down (3D): a gesture (raised past ~60 deg) keeps its own line
        U.getWorldPosition(vS); F.getWorldPosition(vE); H.getWorldPosition(vH);
        const lift = Math.acos(THREE.MathUtils.clamp((vE.y - vH.y) / Math.max(1e-6, vE.distanceTo(vH)), -1, 1));
        const w = 1 - THREE.MathUtils.smoothstep(lift, 55 * D, 75 * D);
        inward(vS, vE, s, UPPER, w); turn(U);
        let q = U.quaternion;
        if (isFore) {
          F.getWorldPosition(vE); H.getWorldPosition(vH);
          inward(vE, vH, s, FORE, w); turn(F); q = F.quaternion;
        }
        q.toArray(vals, i * 4);
      }
      fresh[bn] = vals;
    }
    act.stop(); mixer.uncacheAction(clip);
    for (const [bn, t] of Object.entries(tr)) t.values = fresh[bn];
    done.add(clip);
  }
}
