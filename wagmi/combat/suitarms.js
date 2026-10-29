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
// (the runs and the gestures: their arms keep their own pump and wave, only the hands and fingers are set (handsAbs))
const RUNS = new Set(['suitRun', 'suitDash']), WAVES = new Set(['suitTauntBye', 'suitTauntByebye']);
// (the rig's own fight clips: those that close the hand (f8b6255) get a real fist, set from the forearm: fistsAbs)
const FIGHT = new Set(['guard', 'thugPunch1', 'thugPunch2', 'thugKick', 'bruteSlam', 'hitReact', 'thugIdle', 'thugStumbleBack', 'thugStumbleLeft', 'thugStumbleRight']);
// the angle out from the body's middle plane (deg) that is kept: A, and K of the capture's angle over it
const UPPER = { A: 1.0, K: 0.15 }, FORE = { A: 4.0, K: 0.2 };
const D = Math.PI / 180;

export function relaxArms(clips, model) {
  const all = (clips instanceof Map ? [...clips.values()] : Array.isArray(clips) ? clips : Object.values(clips));
  const list = all.filter((c) => c && (CLIPS.has(c.name) || RUNS.has(c.name) || WAVES.has(c.name) || FIGHT.has(c.name)) && !done.has(c));
  if (!list.length || !model) return;
  const rig = skClone(model), B = {};
  rig.traverse((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
  if (!B.upperArmL || !B.forearmL || !B.handL || !B.upperArmR || !B.forearmR || !B.handR) return;
  rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.set(1, 1, 1);
  const H = handRest(rig, B); // (the hands' and fingers' rest, read before anything poses the copy)
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
    if (FIGHT.has(clip.name)) { if (isFist(clip, H)) fistsAbs(clip, mixer, rig, B, H); done.add(clip); continue; }
    if (RUNS.has(clip.name) || WAVES.has(clip.name)) { handsAbs(clip, mixer, rig, B, H, RUNS.has(clip.name) ? 'run' : 'hang'); done.add(clip); continue; }
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
    handsAbs(clip, mixer, rig, B, H);
    done.add(clip);
  }
}

// The hands (29 Oct, round 7; the owner: "if you need to model Dan, then do that because his are facing right direction
// everywhere"). The pack's hand turns are a retarget's: relative to this rig's hand they hold the palm 40-90 deg off
// (idle: turned forward and out; the walks: rolled back; the runs: bent back), and the fingers splay as the rig's rest
// does. Rolling the capture's hand (rounds 5-6) kept its error. So the hand is not taken from the capture at all: at
// each key it is SET, from the forearm, as Dan's hand hangs from his: in line with the forearm (flexed FLEX deg toward the
// palm), the palm to the side of the thigh, turned BACK deg toward the rear; half the hand's roll off its rest taken in
// the forearm's twist bone (no wrung wrist); and the fingers set (not added to) as Dan's are: together, gently curled,
// the thumb resting along the index. A forearm raised (a wave) keeps the capture's own hand, its fingers as relaxed.
const HAND = { flex: 10, back: 35, twist: 0.5 };
// the fingers: each joint's curl toward the palm (deg, joints 1-2-3), and how much of the rest's splay is kept
const CURL = { index: [42, 40, 22], middle: [44, 44, 24], ring: [46, 50, 26], pinky: [46, 54, 28] }, SPLAY = 0.25;
const THUMB = { dir: [1, 0.3, -0.05], curl: [0, 4, 22] };
// (29 Oct, round 8; the owner on round 7's running hand and the guard's fists: "looks weird, not human, fix", "study
// dan") The run: a runner's loose hand, as Dan's: the fingers rolled into a soft half-fist, together, the thumb's pad
// resting on the side of the index's middle segment, the wrist straight (the capture's own hand never blended back in
// when the forearm comes up in the pump: that was the bent-back claw). The fist (the rig's own guard and blows): the
// fingers rolled tight and together, the four knuckles in a line, the thumb across the middle segments of the index and
// middle fingers (Dan's jab: 90 / 114 / 58 deg at the three joints, measured in the bench), the wrist straight in line
// with the forearm (the clips cocked it back 65-80 deg: the blocky fist held against the face).
const RUN = { curl: { index: [62, 82, 38], middle: [66, 86, 40], ring: [70, 90, 42], pinky: [74, 92, 44] }, splay: 0 };
const FIST = { curl: { index: [95, 120, 64], middle: [99, 124, 68], ring: [103, 128, 72], pinky: [108, 128, 76] }, splay: 0, flex: 5, thumb3: 28, out: 0.16, ahead: 0.95, tiltMax: 55, wide: 0.3 };
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

// the hand frame from 'along' (wrist to the middle finger's knuckle) and 'across' (little finger's knuckle to the index's):
// a basis x along, z = along x across, y = z x along
const basis = (a, c) => { const x = a.clone().normalize(), z = new THREE.Vector3().crossVectors(x, c).normalize(), y = new THREE.Vector3().crossVectors(z, x); return new THREE.Matrix4().makeBasis(x, y, z); };

// the rest, once per call: each hand's frame in its own bone's space, and each finger bone's local turn for the hang,
// the run and the fist
function handRest(rig, B) {
  rig.updateMatrixWorld(true);
  const V = THREE.Vector3, Q = THREE.Quaternion, wp = (b) => b.getWorldPosition(new V()), wq = (b) => b.getWorldQuaternion(new Q());
  const out = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1, h = B['hand' + side], M1 = B['middle1' + side], I1 = B['index1' + side], P1 = B['pinky1' + side];
    if (!h || !M1 || !I1 || !P1) continue;
    // (in the hand's own space: the bones' rest positions)
    const along = M1.position.clone().normalize(), across = I1.position.clone().sub(P1.position).normalize();
    const HL = basis(along, across);
    // (world, at rest: the palm's normal, toward the palm: s * (along x across), checked on Knox's rest: the palm faces
    // the body in the A-pose)
    const hw = wp(h), aW = wp(M1).sub(hw).normalize(), cW = wp(I1).sub(wp(P1)).normalize(), hl = wp(M1).distanceTo(hw);
    const palm = new V().crossVectors(aW, cW).normalize().multiplyScalar(s);
    const mDir = wp(B['middle2' + side]).sub(wp(M1)).normalize();
    // the four fingers: rest x (the splay taken out but `splay` of it) x the curl (deg per joint)
    const fingers = (curl, splay) => {
      const fing = {};
      for (const f of FINGERS) for (let j = 1; j <= 3; j++) {
        const b = B[f + j + side]; if (!b) continue;
        const nx = B[f + (j + 1) + side], p = wp(b), d = (nx ? wp(nx).sub(p) : p.clone().sub(wp(B[f + (j - 1) + side]))).normalize();
        const iq = wq(b).invert();
        let q = b.quaternion.clone();
        if (j === 1 && f !== 'middle') {
          const dp = d.clone().addScaledVector(palm, -d.dot(palm)).normalize(), mp = mDir.clone().addScaledVector(palm, -mDir.dot(palm)).normalize();
          const ang = Math.atan2(new V().crossVectors(dp, mp).dot(palm), dp.dot(mp)) * (1 - splay);
          q.multiply(new Q().setFromAxisAngle(palm.clone().applyQuaternion(iq).normalize(), ang));
        }
        const ax = new V().crossVectors(d, palm).normalize().applyQuaternion(iq).normalize();
        q.multiply(new Q().setFromAxisAngle(ax, curl[f][j - 1] * D));
        fing[f + j + side] = q;
      }
      return fing;
    };
    // the hang's thumb: its first joint turned in toward the index (about the palm's normal), then a little curl
    const hang = fingers(CURL, SPLAY);
    for (let j = 1; j <= 3; j++) {
      const b = B['thumb' + j + side]; if (!b) continue;
      const nx = B['thumb' + (j + 1) + side], p = wp(b), d = (nx ? wp(nx).sub(p) : p.clone().sub(wp(B['thumb' + (j - 1) + side]))).normalize();
      const iq = wq(b).invert(); let q = b.quaternion.clone();
      if (j === 1) {
        const tip = wp(B['thumb3' + side]).sub(p).normalize(), want = aW.clone().multiplyScalar(THUMB.dir[0]).addScaledVector(cW, THUMB.dir[1]).addScaledVector(palm, THUMB.dir[2]).normalize();
        q.premultiply(b.parent.getWorldQuaternion(new Q()).invert().multiply(new Q().setFromUnitVectors(tip, want)).multiply(b.parent.getWorldQuaternion(new Q())));
      }
      const ax = new V().crossVectors(d, palm).normalize().applyQuaternion(iq).normalize();
      q.multiply(new Q().setFromAxisAngle(ax, THUMB.curl[j - 1] * D));
      hang['thumb' + j + side] = q;
    }
    // the run's and the fist's thumbs: the fingers posed on the rest copy, the thumb's tip brought onto its spot (CCD on
    // its first two joints, the second a hinge, the last joint's curl fixed), then the copy put back
    const T1 = B['thumb1' + side], T2 = B['thumb2' + side], T3 = B['thumb3' + side];
    const placeThumb = (fing, spot, curl3, way = null) => {
      if (!T1 || !T2 || !T3) return fing;
      const keep = new Map(); for (const n of [...Object.keys(fing), 'thumb1' + side, 'thumb2' + side, 'thumb3' + side]) keep.set(n, B[n].quaternion.clone());
      for (const [n, q] of Object.entries(fing)) B[n].quaternion.copy(q);
      // (thumb 3: its rest curled curl3 about its hinge)
      { const p3 = wp(T3), d = p3.clone().sub(wp(T2)).normalize(); const ax = new V().crossVectors(d, palm).normalize().applyQuaternion(wq(T3).invert()).normalize(); T3.quaternion.multiply(new Q().setFromAxisAngle(ax, curl3 * D)); }
      h.updateMatrixWorld(true);
      const target = spot(), len3 = wp(T3).distanceTo(wp(T2)) * 0.85, d3L = T3.position.clone().normalize();
      const tip = () => wp(T3).add(d3L.clone().applyQuaternion(wq(T3)).multiplyScalar(len3));
      const hingeOf = (b, nx) => new V().crossVectors(nx.sub(wp(b)).normalize(), palm).normalize().applyQuaternion(wq(b).invert()).normalize();
      const hinge = new Map([[T2, hingeOf(T2, wp(T3))], [T3, hingeOf(T3, tip())]]);
      const qr = new Q(), qp = new Q();
      // (with a waypoint: first the thumb's last joint brought onto it by the first two, then the tip by the last)
      const W = way && way(), plan = W ? [[T2, () => wp(T3), W], [T1, () => wp(T3), W], [T3, tip, target]] : [[T3, tip, target], [T2, tip, target], [T1, tip, target]];
      for (let it = 0; it < 30; it++) for (const [b, eff, goal] of plan) {
        if (W && b === T3 && it < 20) continue;
        const pb = wp(b), a = eff().sub(pb).normalize(), t = goal.clone().sub(pb).normalize();
        if (b !== T1) { // (a hinge: both lines into the plane square to its axis, in the bone's space)
          // (the last joint with a waypoint: it bends in the plane that holds the goal, set once the joint is placed)
          if (W && b === T3 && it === 20) hinge.set(T3, new V().crossVectors(a, t).normalize().applyQuaternion(wq(T3).invert()).normalize());
          const hinge2 = hinge.get(b);
          const iq = wq(b).invert(), al = a.applyQuaternion(iq), tl = t.applyQuaternion(iq);
          al.addScaledVector(hinge2, -al.dot(hinge2)).normalize(); tl.addScaledVector(hinge2, -tl.dot(hinge2)).normalize();
          const ang = Math.atan2(new V().crossVectors(al, tl).dot(hinge2), al.dot(tl));
          b.quaternion.multiply(qr.setFromAxisAngle(hinge2, THREE.MathUtils.clamp(ang, -0.3, 0.3)));
        } else { qr.setFromUnitVectors(a, t); qr.slerp(new Q(), 0.5); b.parent.getWorldQuaternion(qp); b.quaternion.premultiply(qp).premultiply(qr).premultiply(qp.invert()); }
        b.updateMatrixWorld(true);
      }
      const res = { ...fing, ['thumb1' + side]: T1.quaternion.clone(), ['thumb2' + side]: T2.quaternion.clone(), ['thumb3' + side]: T3.quaternion.clone() };
      for (const [n, q] of keep) B[n].quaternion.copy(q);
      h.updateMatrixWorld(true);
      return res;
    };
    const mid = (f, k = 0.5) => wp(B[f + '2' + side]).lerp(wp(B[f + '3' + side]), k);
    // the run: the thumb's pad on the side (toward the thumb) of the index's middle segment, a little to the palm's side
    const run = placeThumb(fingers(RUN.curl, RUN.splay), () => mid('index', 0.75).addScaledVector(cW, 0.12 * hl).addScaledVector(palm, 0.04 * hl), 12,
      () => wp(B['index2' + side]).addScaledVector(cW, 0.13 * hl).addScaledVector(aW, -0.05 * hl));
    // the fist: the thumb across the outside of the index's and middle's middle segments (out from the palm: a finger's
    // and a thumb's thickness)
    const fist = placeThumb(fingers(FIST.curl, FIST.splay), () => mid('middle', 0.5).addScaledVector(palm, FIST.out * hl), FIST.thumb3,
      () => mid('index', 0.35).addScaledVector(cW, 0.1 * hl).addScaledVector(palm, FIST.out * hl));
    out[side] = { HL, HLt: HL.clone().transpose(), fing: hang, run, fist, s, rest: h.quaternion.clone(), axL: h.position.clone().normalize(),
      alongL: along, idx2: B['index2' + side]?.quaternion.clone(), palmL: palm.clone().applyQuaternion(wq(h).invert()).normalize() };
  }
  return out;
}

// the rig's own fight clips: does this one close the hand (the index's middle joint turned > 60 deg off its rest)?
function isFist(clip, H) {
  const t = clip.tracks.find((k) => k.name === 'index2L.quaternion'), r = H.L?.idx2;
  if (!t || !r) return false;
  const i = Math.floor(t.times.length / 2), q = new THREE.Quaternion().fromArray(t.values, i * 4);
  return 2 * Math.acos(Math.min(1, Math.abs(q.dot(r)))) > 60 * D;
}

// the fists: at each key the hand turned (the least turn) so its line runs on with the forearm's, flexed FIST.flex
// toward the palm, its roll the clip's own; the fingers and thumb set closed (handRest's fist)
function fistsAbs(clip, mixer, rig, B, H) {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const byBone = {}; for (const t of clip.tracks) { const [bn, prop] = t.name.split('.'); if (prop === 'quaternion') byBone[bn] = t; }
  const act = mixer.clipAction(clip); act.play();
  const wp = (b) => b.getWorldPosition(new V());
  const out = {};
  for (const side of ['L', 'R']) {
    const R = H[side]; if (!R) continue;
    const F = B['forearm' + side], Hb = B['hand' + side], tH = byBone['hand' + side];
    const times = [...new Set([...(tH ? tH.times : [0, clip.duration]), ...(byBone['forearm' + side]?.times || []), ...(byBone['forearmTwist' + side]?.times || [])])].sort((a, b) => a - b);
    const vH = new Float32Array(times.length * 4), vF = new Float32Array(times.length * 4), qh = new Q(), qs = new Q(), qp = new Q(), qr = new Q();
    const M1 = B['middle1' + side], U = B['upperArm' + side];
    times.forEach((time, i) => {
      act.time = time; mixer.update(0); rig.updateMatrixWorld(true);
      // (a fist held up at the face: the clip presses it to the cheek, a cocked wrist was what kept it off the face; the
      // forearm tipped forward about the elbow until the fist is FIST.ahead of a forearm's length out in front of the head)
      if (B.head && M1 && U) {
        const right = wp(B.upperArmL).sub(wp(B.upperArmR)).setY(0).normalize(), fwd = new V().crossVectors(right, new V(0, 1, 0));
        const fist = () => wp(Hb).lerp(wp(M1), 0.6), head = wp(B.head), need = FIST.ahead * wp(F).distanceTo(wp(Hb));
        const ahead = () => fist().sub(head).dot(fwd);
        if (fist().y > wp(U).y && ahead() < need) {
          const q0 = F.quaternion.clone(), tilt = (ang) => { F.quaternion.copy(q0); qr.setFromAxisAngle(right, ang); F.parent.getWorldQuaternion(qp); F.quaternion.premultiply(qp).premultiply(qr).premultiply(qp.invert()); F.updateMatrixWorld(true); };
          const a0 = ahead(); tilt(0.05); const sgn = ahead() > a0 ? 1 : -1; let ang = 0;
          for (; ang < FIST.tiltMax * D; ang += 2 * D) { tilt(sgn * ang); if (ahead() >= need) break; }
          // (and out to its own side of the face, so the two fists do not meet in front of the nose)
          const sd = side === 'L' ? 1 : -1, wide = FIST.wide * wp(F).distanceTo(wp(Hb)), lat = () => fist().sub(head).dot(right) * sd;
          if (lat() < wide) { const q1 = F.quaternion.clone(), roll = (a) => { F.quaternion.copy(q1); qr.setFromAxisAngle(fwd, a); F.parent.getWorldQuaternion(qp); F.quaternion.premultiply(qp).premultiply(qr).premultiply(qp.invert()); F.updateMatrixWorld(true); };
            roll(0.05); const sg = lat() > (roll(0), lat()) ? 1 : -1; let a = 0; for (; a < 30 * D; a += 2 * D) { roll(sg * a); if (lat() >= wide) break; }  }
        }
      }
      F.quaternion.toArray(vF, i * 4);
      const ax = wp(Hb).sub(wp(F)).normalize();
      Hb.getWorldQuaternion(qh);
      const along = R.alongL.clone().applyQuaternion(qh), palm = R.palmL.clone().applyQuaternion(qh);
      palm.addScaledVector(ax, -palm.dot(ax)); if (palm.lengthSq() < 1e-6) palm.set(0, 0, 0); else palm.normalize();
      const A = ax.clone().multiplyScalar(Math.cos(FIST.flex * D)).addScaledVector(palm, Math.sin(FIST.flex * D)).normalize();
      qs.setFromUnitVectors(along, A);
      Hb.parent.getWorldQuaternion(qp);
      qp.invert().multiply(qs.multiply(qh)).toArray(vH, i * 4);
    });
    out['hand' + side] = { times, vals: vH }; out['forearm' + side] = { times, vals: vF };
    for (const [bn, q] of Object.entries(R.fist)) { const v = new Float32Array(8); q.toArray(v, 0); q.toArray(v, 4); out[bn] = { times: [0, clip.duration], vals: v }; }
  }
  act.stop(); mixer.uncacheAction(clip);
  for (const [bn, o] of Object.entries(out)) {
    const tr = byBone[bn];
    if (!tr) clip.tracks.push(new THREE.QuaternionKeyframeTrack(bn + '.quaternion', o.times, o.vals));
    else { tr.times = Float32Array.from(o.times); tr.values = Float32Array.from(o.vals); }
  }
}

function handsAbs(clip, mixer, rig, B, H, mode = 'hang') {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const byBone = {}; for (const t of clip.tracks) { const [bn, prop] = t.name.split('.'); if (prop === 'quaternion') byBone[bn] = t; }
  const act = mixer.clipAction(clip); act.play();
  const at = (time) => { act.time = time; mixer.update(0); rig.updateMatrixWorld(true); };
  const wp = (b) => b.getWorldPosition(new V());
  const out = {};
  for (const side of ['L', 'R']) {
    const R = H[side]; if (!R) continue;
    const s = R.s, F = B['forearm' + side], Hb = B['hand' + side], T = B['forearmTwist' + side];
    const tH = byBone['hand' + side], tT = T && byBone['forearmTwist' + side];
    const times = [...new Set([...(tH ? tH.times : [0, clip.duration]), ...(tT ? tT.times : []), ...(byBone['forearm' + side]?.times || [])])].sort((a, b) => a - b);
    const vH = new Float32Array(times.length * 4), vT = new Float32Array(times.length * 4);
    const qp = new Q(), qw = new Q(), m = new THREE.Matrix4();
    times.forEach((time, i) => {
      at(time);
      const right = wp(B.upperArmL).sub(wp(B.upperArmR)).setY(0).normalize(), up = new V(0, 1, 0), fwd = new V().crossVectors(right, up);
      const e = wp(F), h = wp(Hb), ax = h.clone().sub(e).normalize();
      const lift = Math.acos(THREE.MathUtils.clamp(-ax.y, -1, 1)), w = mode === 'run' ? 1 : 1 - THREE.MathUtils.smoothstep(lift, 60 * D, 85 * D);
      // the palm: toward the body's middle plane, square to the forearm, turned BACK toward the rear
      const inn = right.clone().multiplyScalar(-s), back = fwd.clone().negate();
      const P = inn.multiplyScalar(Math.cos(HAND.back * D)).addScaledVector(back, Math.sin(HAND.back * D));
      P.addScaledVector(ax, -P.dot(ax));
      if (P.lengthSq() < 1e-6) P.copy(back).addScaledVector(ax, -back.dot(ax));
      P.normalize();
      // along: the forearm's line, flexed toward the palm; across: from the palm and along (palm = s * along x across)
      const A = ax.clone().multiplyScalar(Math.cos(HAND.flex * D)).addScaledVector(P, Math.sin(HAND.flex * D)).normalize();
      const C = new V().crossVectors(P, A).multiplyScalar(s).normalize();
      // the hand's world turn: target basis x rest basis^T; local = forearm^-1 x world
      m.multiplyMatrices(basis(A, C), R.HLt); qw.setFromRotationMatrix(m);
      F.getWorldQuaternion(qp); const want = qp.invert().multiply(qw);
      // (a raised forearm: the capture's own hand, blended in past 60 deg)
      const q = w >= 1 ? want : Hb.quaternion.clone().slerp(want, w);
      q.toArray(vH, i * 4);
      // the twist bone: half the hand's roll about the forearm's line, off its rest
      const dq = q.clone().multiply(R.rest.clone().invert()), a = R.axL, dot = dq.x * a.x + dq.y * a.y + dq.z * a.z;
      const tw = new Q(a.x * dot, a.y * dot, a.z * dot, dq.w); if (tw.lengthSq() < 1e-9) tw.identity(); else tw.normalize();
      new Q().slerp(tw, HAND.twist).toArray(vT, i * 4);
    });
    out['hand' + side] = { times, vals: vH };
    if (T) out['forearmTwist' + side] = { times, vals: vT };
    for (const [bn, q] of Object.entries(mode === 'run' ? R.run : R.fing)) { const v = new Float32Array(8); q.toArray(v, 0); q.toArray(v, 4); out[bn] = { times: [0, clip.duration], vals: v }; }
  }
  act.stop(); mixer.uncacheAction(clip);
  for (const [bn, o] of Object.entries(out)) {
    const tr = byBone[bn];
    if (!tr) clip.tracks.push(new THREE.QuaternionKeyframeTrack(bn + '.quaternion', o.times, o.vals));
    else { tr.times = Float32Array.from(o.times); tr.values = Float32Array.from(o.vals); }
  }
}
