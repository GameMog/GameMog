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
    if (WALKS.has(clip.name)) handsIn(clip, mixer, rig, B);
    done.add(clip);
  }
}

// The hands in the walks (29 Oct): with the arms in, the capture's hands still turn their palms a little forward and out
// as they swing (the index ahead of the little finger by only ~40-60 deg in suitWalk2 and suitBack): a palm shown to the
// camera. A man walking in a suit carries his palm to the side of his thigh, a touch back, the fingers softly curled.
// handsIn rolls each hand about its forearm, key by key, until the palm faces in at the thigh ROLL.back deg behind
// straight in (the hand's width, little finger to index, that far in from straight ahead), half the roll taken in the twist bone
// so the wrist does not wring; and it curls the fingers a little more (the ring and little fingers, still in the
// capture, as much as the middle). A hand raised past ~60 deg (a gesture) is left as it is, as the arms are.
const WALKS = new Set(['suitWalk', 'suitWalk2', 'suitBack', 'suitLeft', 'suitRight']);
const ROLL = { back: 18, max: 80, twist: 0.5, flex: 6, straight: 0.85 };
// extra curl, rad, per joint 1-2-3 (the clip's index and middle are curled ~10 deg a joint; ring and little at rest)
const CURL = { index: [0.1, 0.22, 0.12], middle: [0.14, 0.26, 0.14], ring: [0.3, 0.42, 0.25], pinky: [0.34, 0.46, 0.26] };

function handsIn(clip, mixer, rig, B) {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const byBone = {}; for (const t of clip.tracks) { const [bn, prop] = t.name.split('.'); if (prop === 'quaternion') byBone[bn] = t; }
  const act = mixer.clipAction(clip); act.play();
  const at = (time) => { act.time = time; mixer.update(0); rig.updateMatrixWorld(true); };
  const wp = (b) => b.getWorldPosition(new V());
  const out = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, F = B['forearm' + side], H = B['hand' + side], T = B['forearmTwist' + side];
    const M1 = B['middle1' + side], M3 = B['middle3' + side], I1 = B['index1' + side], P1 = B['pinky1' + side];
    if (!F || !H || !M1 || !M3 || !I1 || !P1 || !byBone['hand' + side]) continue;
    const tH = byBone['hand' + side], tT = T && byBone['forearmTwist' + side];
    const times = [...new Set([...tH.times, ...(tT ? tT.times : [])])].sort((a, b) => a - b);
    const vH = new Float32Array(times.length * 4), vT = tT ? new Float32Array(times.length * 4) : null;
    const qr = new Q(), qp = new Q();
    const turnW = (bone, q) => { bone.parent.getWorldQuaternion(qp); bone.quaternion.premultiply(qp).premultiply(q).premultiply(qp.invert()); bone.updateMatrixWorld(true); };
    let curlAx = null;
    times.forEach((time, i) => {
      at(time);
      const right = wp(B.upperArmL).sub(wp(B.upperArmR)).setY(0).normalize(), up = new V(0, 1, 0), fwd = new V().crossVectors(right, up);
      const e = wp(F), h = wp(H), ax = h.clone().sub(e).normalize();
      // a raised forearm (a gesture) keeps its hand
      const lift = Math.acos(THREE.MathUtils.clamp(-ax.y, -1, 1)), w = 1 - THREE.MathUtils.smoothstep(lift, 55 * D, 75 * D);
      // first the wrist: the capture bends the hand out and back off the forearm's line (the palm shown ahead); in line
      // with the forearm instead, the fingers a touch in toward the thigh (ROLL.flex deg)
      let hd = wp(M1).sub(h).normalize();
      if (!curlAx) { const pn = wp(M3).sub(wp(M1)); pn.addScaledVector(hd, -pn.dot(hd)); curlAx = { pn: pn.normalize() }; }
      const inW = right.clone().multiplyScalar(-s); inW.addScaledVector(ax, -inW.dot(ax)).normalize();
      const hw = ax.clone().addScaledVector(inW, Math.tan(ROLL.flex * D)).normalize();
      turnW(H, qr.setFromUnitVectors(hd, hd.clone().lerp(hw, ROLL.straight * w).normalize()));
      hd = wp(M1).sub(h).normalize();
      // the hand's width, little finger to index: straight ahead when the palm is at the thigh (out when it turns forward)
      const wid = wp(I1).sub(wp(P1)).normalize();
      // (the palm a touch back from straight in: the index a touch in from straight ahead)
      const want = fwd.clone().multiplyScalar(Math.cos(ROLL.back * D)).addScaledVector(right, -s * Math.sin(ROLL.back * D));
      const a = wid.clone().addScaledVector(ax, -wid.dot(ax)), b = want.addScaledVector(ax, -want.dot(ax));
      let ang = 0;
      if (a.lengthSq() > 1e-6 && b.lengthSq() > 1e-6) { a.normalize(); b.normalize(); ang = Math.atan2(new V().crossVectors(a, b).dot(ax), a.dot(b)); }
      ang = THREE.MathUtils.clamp(ang, -ROLL.max * D, ROLL.max * D) * w;
      turnW(H, qr.setFromAxisAngle(ax, ang)); H.quaternion.toArray(vH, i * 4);
      if (tT) { turnW(T, qr.setFromAxisAngle(ax, ang * ROLL.twist)); T.quaternion.toArray(vT, i * 4); }
    });
    out['hand' + side] = { times, vals: vH };
    if (tT) out['forearmTwist' + side] = { times, vals: vT };
    // the fingers: a turn about the hand's width (index to little finger) toward the palm, in each bone's own frame
    if (curlAx) {
      // (the palm's side: the way the capture's own curl of the middle finger already bends, at the first key)
      at(times[0]);
      { const h = wp(H), hd = wp(M1).sub(h).normalize(), wid = wp(I1).sub(wp(P1)).normalize(); curlAx.wid = wid; curlAx.sg = Math.sign(new V().crossVectors(wid, hd).dot(curlAx.pn)) || 1; }
      for (const [fn, cv] of Object.entries(CURL)) for (let j = 0; j < 3; j++) {
        const bn = fn + (j + 1) + side, bone = B[bn]; if (!bone) continue;
        const wq = bone.getWorldQuaternion(new Q()), axL = curlAx.wid.clone().multiplyScalar(curlAx.sg).applyQuaternion(wq.invert()).normalize();
        const dq = new Q().setFromAxisAngle(axL, cv[j]), tr = byBone[bn];
        if (tr) { const v = tr.values.slice(), q = new Q(); for (let k = 0; k < tr.times.length; k++) q.fromArray(v, k * 4).multiply(dq).toArray(v, k * 4); out[bn] = { times: tr.times, vals: v, keep: true }; }
        else { const q = bone.quaternion.clone().multiply(dq), v = new Float32Array(8); q.toArray(v, 0); q.toArray(v, 4); out[bn] = { times: [0, clip.duration], vals: v, add: true }; }
      }
    }
  }
  act.stop(); mixer.uncacheAction(clip);
  for (const [bn, o] of Object.entries(out)) {
    const tr = byBone[bn];
    if (o.add || !tr) clip.tracks.push(new THREE.QuaternionKeyframeTrack(bn + '.quaternion', o.times, o.vals));
    else { tr.times = Float32Array.from(o.times); tr.values = Float32Array.from(o.vals); }
  }
}
