// The Suits' hands. Their clips are Dan's own, retargeted onto the rig by anatomical frames (29 Oct, round 11:
// assets/anim/suits-dan.glb, .scratch/polish/round11/retarget/src/retarget.mjs): the arms, the trunk and the legs are
// his and are left as they are. The hands and fingers are not taken from the retarget (its fingers read as the rig's
// rest: segmented knuckles, splayed in the walk, the thumb out): at each key the hand is SET from the forearm and the
// fingers set outright, as the owner approved on 29 Oct (rounds 7-8, 344180b): the hang hand for the standing and
// walking clips, a loose half-fist for the runs, a fist for the blows, a relaxed open hand for the hit, the fall, the
// get-up and the stumbles. relaxArms(clips, model) does it once per clip (the clips are shared by every caller of
// loadGLB), key by key on a copy of the model's rig posed at each key; its name is its callers' (it brought the Bandai
// pack's arms in; there is no arm pass now).
import * as THREE from 'three/webgpu';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const done = new WeakSet();
// the hang hand (handsAbs 'hang'): the standing and walking clips and the gestures (a raised forearm keeps Dan's hand)
const HANG = new Set(['suitIdle', 'thugIdle', 'suitIdleGuide', 'suitWalk', 'suitWalk2', 'suitBack', 'suitLeft', 'suitRight', 'walk', 'jog', 'suitTauntBye', 'suitTauntByebye']);
// the runner's loose half-fist (handsAbs 'run')
const RUNS = new Set(['suitRun', 'suitDash', 'run', 'sprint']);
// the fist (fistsAbs), the whole clip: these are blows, the hand is closed throughout
const FISTS = new Set(['guard', 'thugPunch1', 'thugPunch2', 'thugKick', 'bruteSlam']);
// a relaxed open hand (handsAbs 'open': the hang hand in the body's own frame, no raised-forearm exception, the soft curl)
const OPEN = new Set(['hitReact', 'thugKnockdown', 'thugGetUp', 'thugStumbleBack', 'thugStumbleLeft', 'thugStumbleRight']);
const D = Math.PI / 180;

export function relaxArms(clips, model) {
  const all = (clips instanceof Map ? [...clips.values()] : Array.isArray(clips) ? clips : Object.values(clips));
  const list = all.filter((c) => c && (HANG.has(c.name) || RUNS.has(c.name) || FISTS.has(c.name) || OPEN.has(c.name)) && !done.has(c));
  if (!list.length || !model) return;
  const rig = skClone(model), B = {};
  rig.traverse((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
  if (!B.upperArmL || !B.forearmL || !B.handL || !B.upperArmR || !B.forearmR || !B.handR) return;
  rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.set(1, 1, 1);
  const H = handRest(rig, B); // (the hands' and fingers' rest, read before anything poses the copy)
  const mixer = new THREE.AnimationMixer(rig);
  for (const clip of list) {
    if (FISTS.has(clip.name)) fistsAbs(clip, mixer, rig, B, H);
    else handsAbs(clip, mixer, rig, B, H, RUNS.has(clip.name) ? 'run' : OPEN.has(clip.name) ? 'open' : 'hang');
    done.add(clip);
  }
}

// The hands (29 Oct, round 7; the owner: "if you need to model Dan, then do that because his are facing right direction
// everywhere"). The hand is not taken from the clip: at each key it is SET, from the forearm, as Dan's hand hangs from
// his: in line with the forearm (flexed FLEX deg toward the palm), the palm to the side of the thigh, turned BACK deg
// toward the rear; half the hand's roll off its rest taken in the forearm's twist bone (no wrung wrist); and the fingers
// set (not added to) as Dan's are: together, gently curled, the thumb resting along the index. A forearm raised (a wave,
// the guide's gesture) keeps the clip's own hand, its fingers as relaxed.
const HAND = { flex: 10, back: 35, twist: 0.5 };
// the fingers: each joint's curl toward the palm (deg, joints 1-2-3), and how much of the rest's splay is kept
const CURL = { index: [42, 40, 22], middle: [44, 44, 24], ring: [46, 50, 26], pinky: [46, 54, 28] }, SPLAY = 0.25;
const THUMB = { dir: [1, 0.3, -0.05], curl: [0, 4, 22] };
// (29 Oct, round 8; the owner on round 7's running hand and the guard's fists: "looks weird, not human, fix", "study
// dan") The run: a runner's loose hand, as Dan's: the fingers rolled into a soft half-fist, together, the thumb's pad
// resting on the side of the index's middle segment, the wrist straight (the clip's own hand never blended back in
// when the forearm comes up in the pump: that was the bent-back claw). The fist (the guard and the blows): the fingers
// rolled tight and together, the four knuckles in a line, the thumb across the middle segments of the index and middle
// fingers (Dan's jab: 90 / 114 / 58 deg at the three joints, measured in the bench), the wrist straight in line with
// the forearm.
const RUN = { curl: { index: [62, 82, 38], middle: [66, 86, 40], ring: [70, 90, 42], pinky: [74, 92, 44] }, splay: 0 };
const FIST = { curl: { index: [95, 120, 64], middle: [99, 124, 68], ring: [103, 128, 72], pinky: [108, 128, 76] }, splay: 0, flex: 5, thumb3: 28, out: 0.16 };
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
      alongL: along, palmL: palm.clone().applyQuaternion(wq(h).invert()).normalize() };
  }
  return out;
}

// the fists (the guard and the blows, the whole clip): at each key the hand turned (the least turn) so its line runs on
// with the forearm's, flexed FIST.flex toward the palm, its roll the clip's own; the fingers and thumb set closed
// (handRest's fist). The forearm is Dan's: left alone.
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
    const vH = new Float32Array(times.length * 4), qh = new Q(), qs = new Q(), qp = new Q();
    times.forEach((time, i) => {
      act.time = time; mixer.update(0); rig.updateMatrixWorld(true);
      const ax = wp(Hb).sub(wp(F)).normalize();
      Hb.getWorldQuaternion(qh);
      const along = R.alongL.clone().applyQuaternion(qh), palm = R.palmL.clone().applyQuaternion(qh);
      palm.addScaledVector(ax, -palm.dot(ax)); if (palm.lengthSq() < 1e-6) palm.set(0, 0, 0); else palm.normalize();
      const A = ax.clone().multiplyScalar(Math.cos(FIST.flex * D)).addScaledVector(palm, Math.sin(FIST.flex * D)).normalize();
      qs.setFromUnitVectors(along, A);
      Hb.parent.getWorldQuaternion(qp);
      qp.invert().multiply(qs.multiply(qh)).toArray(vH, i * 4);
    });
    out['hand' + side] = { times, vals: vH };
    for (const [bn, q] of Object.entries(R.fist)) { const v = new Float32Array(8); q.toArray(v, 0); q.toArray(v, 4); out[bn] = { times: [0, clip.duration], vals: v }; }
  }
  act.stop(); mixer.uncacheAction(clip);
  for (const [bn, o] of Object.entries(out)) {
    const tr = byBone[bn];
    if (!tr) clip.tracks.push(new THREE.QuaternionKeyframeTrack(bn + '.quaternion', o.times, o.vals));
    else { tr.times = Float32Array.from(o.times); tr.values = Float32Array.from(o.vals); }
  }
}

// the hang hand ('hang': the standing and walking clips, the gestures), the runner's half-fist ('run') and the relaxed
// open hand ('open': the hit, the fall, the get-up, the stumbles): the hand set from the forearm at each key, the
// fingers set. 'hang' reads the body's sides in the world (he stands) and keeps the clip's own hand on a raised forearm
// (a gesture); 'run' and 'open' set the hand everywhere, 'open' in the body's own frame (across the shoulders, up the
// trunk): a man on the floor has no raised forearm and no world-up.
function handsAbs(clip, mixer, rig, B, H, mode = 'hang') {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const byBone = {}; for (const t of clip.tracks) { const [bn, prop] = t.name.split('.'); if (prop === 'quaternion') byBone[bn] = t; }
  const act = mixer.clipAction(clip); act.play();
  const at = (time) => { act.time = time; mixer.update(0); rig.updateMatrixWorld(true); };
  const wp = (b) => b.getWorldPosition(new V());
  const body = mode === 'open' && B.thighL && B.thighR && B.neck;
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
      const right = wp(B.upperArmL).sub(wp(B.upperArmR)), up = new V(0, 1, 0);
      if (body) { up.copy(wp(B.neck)).sub(wp(B.thighL).add(wp(B.thighR)).multiplyScalar(0.5)).normalize(); right.addScaledVector(up, -right.dot(up)); } else right.setY(0);
      right.normalize(); const fwd = new V().crossVectors(right, up).normalize();
      const e = wp(F), h = wp(Hb), ax = h.clone().sub(e).normalize();
      const lift = Math.acos(THREE.MathUtils.clamp(-ax.y, -1, 1)), w = mode === 'hang' ? 1 - THREE.MathUtils.smoothstep(lift, 60 * D, 85 * D) : 1;
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
      // (a raised forearm: the clip's own hand, blended in past 60 deg)
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
