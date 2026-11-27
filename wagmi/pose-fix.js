// Mog City: a body's own corrections to Dan's sitting and phone clips, baked once onto the clips retargeted for it
// (retarget.js danOn). Dan's takes put a man's hands where a man's chest is: on Mandi (Mandi's Revenge, a scan body with
// a far fuller bust and wider hips, 26 Nov review) his sitTalk's hands pulled in to her chest and grabbed her top, his
// knees splayed wide, and his phone clips held an open, flat hand off the side of her head (the 'phone' take) or the
// head bowed to a hand at the mouth (the locomotion pack's phoneCall). Per frame of the clip, on a copy of the body's
// own bones, the pose is put right where it is read, in the body's own proportions, and the clip's keys rewritten:
//  - lady (sit, sitTalk): the back upright, the knees together (the feet a hand apart under them, soles as the clip had
//    them), each hand resting on its thigh, palm down, the fingers along the thigh and draped (the talk's hands keep a
//    little of the take's own movement, on the lap);
//  - ear (phone, phoneCall): the head up (a slight tilt to the phone), the hand that holds the phone cupped at the ear,
//    palm to the cheek, fingers up and curled round the phone's back, the wrist in line with the forearm (its twist
//    shared with the forearm's twist bone); phoneCall's spine and legs are idle's, as the street plays it (game.js
//    phoneLayer keeps only its neck, head and arms).
// Opt-in per body (a forged body's sheet, POSE_FIX, or its GLB's asset extras poseFix: { sit: 'lady', phone: 'ear' }).
//   import { poseFixOf, fixPoses } from './pose-fix.js';
//   const fix = poseFixOf(bodyGltf); if (fix) clips = fixPoses(THREE, clips, bodyGltf, fix);
// Off with ?posefix=0 (the clips as retargeted, for comparison).

// the bodies that take it, by their forge sheet: clip name -> fix
export const POSE_FIX = Object.freeze({
  mandi: Object.freeze({ sit: 'lady', sitTalk: 'lady', phone: 'ear', phoneCall: 'ear' }),
  // (Mandi's Revenge review, 27 Nov, Jay: Dan's takes on Jay's narrower, A-pose-bound frame read 'zombie': the trunk pitched over
  // the feet, the head out in front, the shoulders rolled forward, the arms hanging dead straight. Every standing clip)
  jay: Object.freeze({ '*': 'upright' }),
});
const FIXES = new Set(['lady', 'ear', 'upright']);
export const poseFixOn = () => { try { return new URLSearchParams(globalThis.location?.search || '').get('posefix') !== '0'; } catch { return true; } };
export function poseFixOf(gltf) {
  if (!poseFixOn()) return null;
  const x = gltf?.parser?.json?.asset?.extras || gltf?.asset?.extras || {};
  const own = x.poseFix && typeof x.poseFix === 'object' ? x.poseFix : null;
  const sheet = x.forge?.landmarks?.sheet || x.forge?.sheet || null;
  const m = own || (typeof sheet === 'string' && POSE_FIX[sheet]) || null;
  if (!m) return null;
  const out = {}; for (const [k, v] of Object.entries(m)) if (typeof k === 'string' && FIXES.has(v)) out[k] = v;   // ('*': every clip without its own)
  return Object.keys(out).length ? out : null;
}

const ARM = ['upperarm01_', 'lowerarm01_', 'wrist_'];
const LEG = ['upperleg01_', 'lowerleg01_', 'foot_'];
const FINGERS = [1, 2, 3, 4, 5];

export function fixPoses(THREE, clips, bodyGltf, fix) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
  const src = bodyGltf.scene.getObjectByName('root'); if (!src?.parent) return clips;
  // (a copy of the armature, bones only, as the game stands it: the export's armature turn out, the arm-hang levelled)
  const arm = src.parent.clone(true);
  arm.position.set(0, 0, 0); arm.quaternion.identity();
  const B = {}; arm.traverse((o) => { if (/^armhang_[LR]$/.test(o.name)) o.quaternion.identity(); if (o.isBone || o.name) B[o.name] ??= o; });
  if (!B.root || !B.wrist_L || !B.wrist_R || !B.upperleg01_L || !B.head || !B.spine05) return clips;
  const rest = new Map(); arm.traverse((o) => rest.set(o, { q: o.quaternion.clone(), p: o.position.clone() }));
  const reset = () => { for (const [o, r] of rest) { o.quaternion.copy(r.q); o.position.copy(r.p); } };
  arm.updateMatrixWorld(true);
  const wp = (b, v = V()) => b.getWorldPosition(v), wq = (b, q = Q()) => b.getWorldQuaternion(q);
  // (the hand's own frame, read off the rest pose: its fingers' way (wrist to the middle knuckle), its palm's (the way the
  // fingertips curl), in the wrist's frame)
  const hand = {};
  for (const s of ['L', 'R']) {
    const w = B['wrist_' + s], k3 = B['finger3-1_' + s], t3 = B['finger3-3_' + s];
    if (!k3 || !t3) return clips;
    const iw = wq(w).invert();
    const fd = wp(k3).sub(wp(w)).applyQuaternion(iw).normalize();
    let n = wp(t3).sub(wp(k3)).applyQuaternion(iw); n.addScaledVector(fd, -n.dot(fd));
    if (n.lengthSq() < 1e-10) n = V(0, 0, 1); n.normalize();
    hand[s] = { fd, n };
  }
  // the head's forward and up in its own frame (standing in the rest pose, facing +z)
  const ih = wq(B.head).invert(), headF = V(0, 0, 1).applyQuaternion(ih), headU = V(0, 1, 0).applyQuaternion(ih);
  const restH = wp(B.head).y - wp(B.root).y;

  /* -------------------------------------------------------------- the moves -- */
  const _q = Q(), _p = Q();
  // a bone turned by q in the world (its children with it)
  function turn(b, q) { const pw = b.parent.getWorldQuaternion(_p); b.quaternion.premultiply(pw.clone().invert().multiply(q).multiply(pw)); b.updateMatrixWorld(true); }
  function setWorld(b, q) { const pw = b.parent.getWorldQuaternion(_p); b.quaternion.copy(pw.invert().multiply(q)); b.updateMatrixWorld(true); }
  // (the world turn that puts the local basis (a, b) on the world one (A, B))
  function frameQ(a, b, A, Bv) {
    const m1 = new THREE.Matrix4().makeBasis(a, b, a.clone().cross(b)), m2 = new THREE.Matrix4().makeBasis(A, Bv, A.clone().cross(Bv));
    return Q().setFromRotationMatrix(m2.multiply(m1.transpose()));
  }
  // two-bone reach: b1's chain to the point, the middle joint toward the pole
  function reach(names, s, target, pole) {
    const b1 = B[names[0] + s], b2 = B[names[1] + s], b3 = B[names[2] + s];
    const a = wp(b1), b = wp(b2); let c = wp(b3);
    const la = a.distanceTo(b), lb = b.distanceTo(c), d = Math.min(la + lb - 1e-3, Math.max(0.05, target.distanceTo(a)));
    const cur = a.clone().sub(b).normalize().angleTo(c.clone().sub(b).normalize());
    const want = Math.acos(Math.min(1, Math.max(-1, (la * la + lb * lb - d * d) / (2 * la * lb))));
    const n = V().crossVectors(a.clone().sub(b), c.clone().sub(b)); if (n.lengthSq() < 1e-10) n.set(1, 0, 0); n.normalize();
    turn(b2, _q.setFromAxisAngle(n, want - cur));
    c = wp(b3);
    turn(b1, _q.setFromUnitVectors(c.sub(a).normalize(), target.clone().sub(a).normalize()));
    const ax = target.clone().sub(a).normalize(), e = wp(b2).sub(a), p = pole.clone().sub(a);
    e.addScaledVector(ax, -e.dot(ax)); p.addScaledVector(ax, -p.dot(ax));
    if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) { let g = e.angleTo(p); if (V().crossVectors(e, p).dot(ax) < 0) g = -g; turn(b1, _q.setFromAxisAngle(ax, g)); }
  }
  // the hand set to a world frame (fingers' way F, palm's way N), its twist about the forearm shared with the twist bone
  function handTo(s, F, N) {
    const w = B['wrist_' + s], tw = B['lowerarm02_' + s], h = hand[s];
    const want = frameQ(h.fd, h.n, F, N);
    if (tw && w.parent === tw) {
      const L = tw.getWorldQuaternion(Q()).invert().multiply(want), ax = w.position.clone().normalize();
      const pr = V(L.x, L.y, L.z), d = pr.dot(ax), twist = Q().set(ax.x * d, ax.y * d, ax.z * d, L.w);
      if (twist.lengthSq() > 1e-10) { twist.normalize(); tw.quaternion.multiply(Q().slerp(twist, 0.5)); tw.updateMatrixWorld(true); }
    }
    setWorld(w, want);
  }
  // fingers: back to their rest, each joint curled by deg toward the palm (the thumb by thumb of that)
  function curl(s, deg, thumb = 0.5) {
    for (const f of FINGERS) for (let j = 1; j <= 3; j++) {
      const b = B[`finger${f}-${j}_${s}`]; if (!b) continue;
      b.quaternion.copy(rest.get(b).q); b.updateMatrixWorld(true);
      const kid = B[`finger${f}-${j + 1}_${s}`], dir = kid ? wp(kid).sub(wp(b)) : b.parent ? wp(b).sub(wp(b.parent)) : null; if (!dir || dir.lengthSq() < 1e-12) continue;
      dir.normalize(); const N = hand[s].n.clone().applyQuaternion(wq(B['wrist_' + s])), ax = V().crossVectors(dir, N);
      if (ax.lengthSq() < 1e-10) continue; ax.normalize();
      const a = (deg[j - 1] * (f === 1 ? thumb : 1) * Math.PI) / 180;
      turn(b, _q.setFromAxisAngle(ax, a));
    }
  }
  const side = (s) => (s === 'L' ? 1 : -1); // (her left is +x, facing +z)

  // standing upright: the trunk over the hips (no more than UP_LEAN forward), the chest lifted, the head back over the
  // shoulders, the shoulders back and down, a soft bend at the elbows, the hands relaxed
  const UP_LEAN = 0.03, UP_CHEST = 0.07, UP_HEAD = 0.015, UP_CLAV_BACK = 0.12, UP_CLAV_DOWN = 0.06, UP_ELBOW = 0.22;
  function upright(ctx) {
    const X = V(1, 0, 0);
    if (B.neck01) {   // (the trunk: hips to the neck's base pitched back toward UP_LEAN)
      const n = wp(B.neck01).sub(wp(B.spine05)); const pitch = Math.atan2(n.z, n.y);
      if (pitch > UP_LEAN) turn(B.spine05, _q.setFromAxisAngle(X, -(pitch - UP_LEAN) * 0.8));
    }
    if (B.spine01) turn(B.spine01, _q.setFromAxisAngle(X, -UP_CHEST));   // (chest up)
    if (B.neck01 && B.head) {   // (the head over the shoulders: its offset forward of the neck's base taken back to UP_HEAD)
      const nb = wp(B.neck01), h = wp(B.head), dz = h.z - nb.z, dy = h.y - nb.y;
      if (dz > UP_HEAD && dy > 0.02) turn(B.neck01, _q.setFromAxisAngle(X, -Math.atan2(dz - UP_HEAD, dy)));
      levelHead(0.6, 0);   // (and the face back to level: the neck's turn back must not tip the chin up)
    }
    for (const s of ['L', 'R']) {
      const c = B['clavicle_' + s]; if (c) { turn(c, _q.setFromAxisAngle(V(0, 1, 0), side(s) * UP_CLAV_BACK)); turn(c, _q.setFromAxisAngle(V(0, 0, 1), -side(s) * UP_CLAV_DOWN)); }
      const ua = B['upperarm01_' + s], la = B['lowerarm01_' + s], wr = B['wrist_' + s];
      if (ua && la && wr && ctx.elbow !== false) {   // (a soft elbow: at least UP_ELBOW of bend, the forearm forward)
        const a = wp(la).sub(wp(ua)).normalize(), b = wp(wr).sub(wp(la)).normalize(), bend = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
        if (bend < UP_ELBOW) { const ax = V().crossVectors(b, V(0, 0, 1)); if (ax.lengthSq() > 1e-8) { ax.normalize(); turn(la, _q.setFromAxisAngle(ax, -(UP_ELBOW - bend))); } }
      }
      if (ctx.relax) curl(s, [14, 18, 12], 0.4);
    }
  }

  // sitting like a lady: the back up, the knees together, the hands on the thighs
  function lady(ctx) {
    const root = wp(B.root);
    // (the back: hips to the base of the neck, 6 degrees forward of upright, no lean to the side)
    if (B.neck01) {
      const n = wp(B.neck01).sub(root).normalize(), up = V(0, Math.cos(0.1), Math.sin(0.1));
      turn(B.spine05, _q.setFromUnitVectors(n, up));
    }
    // (the head level: its forward on the horizon, nodding only as the take did, a third of it)
    levelHead(0.75, 0);
    // (the legs: each knee in to a hand's width from the middle, where its thigh can reach; the feet under the knees)
    const feet = {};
    for (const s of ['L', 'R']) feet[s] = wq(B['foot_' + s]);
    for (const s of ['L', 'R']) {
      const hip = wp(B['upperleg01_' + s]), knee = wp(B['lowerleg01_' + s]), foot = wp(B['foot_' + s]);
      const th = hip.distanceTo(knee), sh = knee.distanceTo(foot);
      const fwd = Math.max(0.2, knee.z - hip.z);
      const kx = root.x + side(s) * 0.075, ky = Math.min(knee.y, hip.y + 0.02);
      const kd = V(kx, ky, hip.z + fwd).sub(hip).normalize();
      const kneeW = hip.clone().addScaledVector(kd, th);
      turn(B['upperleg01_' + s], _q.setFromUnitVectors(knee.clone().sub(hip).normalize(), kd));
      // (the shin straight down from there, a touch back, the foot a little out)
      const k2 = wp(B['lowerleg01_' + s]), f2 = wp(B['foot_' + s]);
      const fd = V(root.x + side(s) * 0.1 - k2.x, -1, -0.12 + (s === 'L' ? 0.0 : -0.06)).normalize();
      turn(B['lowerleg01_' + s], _q.setFromUnitVectors(f2.sub(k2).normalize(), fd));
      setWorld(B['foot_' + s], feet[s]);
      ctx.thigh[s] = { hip, knee: kneeW, len: th, sh };
    }
    // (the hands: the wrist a little past the middle of the thigh, resting on its top, fingers toward the knee)
    for (const s of ['L', 'R']) {
      const t = ctx.thigh[s], along = t.knee.clone().sub(t.hip).normalize();
      const at = t.hip.clone().lerp(t.knee, 0.5); at.y += ctx.lap; at.x += side(s) * 0.015;
      if (ctx.sway) at.add(ctx.sway[s]);
      const sh = wp(B['upperarm01_' + s]);
      const pole = V(sh.x + side(s) * 0.35, sh.y - 0.35, sh.z - 0.25);
      reach(ARM, s, at, pole);
      const F = V(along.x * 0.4 - side(s) * 0.12, Math.min(0, along.y) - 0.12, Math.max(0.6, along.z)).normalize();
      const N = V(0, -1, 0); N.addScaledVector(F, -N.dot(F)).normalize();
      handTo(s, F, N);
      curl(s, [12, 16, 10], 0.4);
    }
  }
  // the head's forward put on the horizon (and tilted toward a side, roll rad) by w, half of it from the neck
  function levelHead(w, roll) {
    const cur = wq(B.head), f = headF.clone().applyQuaternion(cur), u = headU.clone().applyQuaternion(cur);
    const F = V(f.x, 0, f.z); if (F.lengthSq() < 1e-6) F.set(0, 0, 1); F.normalize();
    const R = V(F.z, 0, -F.x), U = V(0, 1, 0).applyAxisAngle(F, roll);
    U.addScaledVector(F, -U.dot(F)).normalize(); void R;
    const want = frameQ(headF, headU, F, U).multiply(Q()).normalize();
    const now = frameQ(headF, headU, f, u.addScaledVector(f, -u.dot(f)).normalize());
    const d = want.clone().multiply(now.clone().invert());
    const dw = Q().slerp(d, w);
    if (B.neck01) turn(B.neck01, Q().slerp(dw, 0.5));
    turn(B.head, Q().slerp(dw, 0.5));
  }
  // on the phone: the head up, the hand cupped at the ear
  function ear(ctx) {
    const s = ctx.hand;
    levelHead(0.85, side(s) * 0.12);
    const hq = wq(B.head), F = headF.clone().applyQuaternion(hq).normalize(), U = headU.clone().applyQuaternion(hq);
    U.addScaledVector(F, -U.dot(F)).normalize();
    const Lt = V().crossVectors(U, F).normalize(); // (her left, in the head's frame)
    const out = Lt.clone().multiplyScalar(side(s));
    // (the ear: up and out from the head's joint; the palm a phone's thickness out from it, the wrist under the palm)
    const earP = wp(B.head).addScaledVector(U, ctx.earUp).addScaledVector(out, ctx.earOut).addScaledVector(F, ctx.earFwd);
    const fingers = U.clone().multiplyScalar(0.9).addScaledVector(F, -0.25).addScaledVector(out, 0.05).normalize();
    const palm = out.clone().negate(); palm.addScaledVector(fingers, -palm.dot(fingers)).normalize();
    const wrist = earP.clone().addScaledVector(out, 0.03).addScaledVector(fingers, -0.095).addScaledVector(F, 0.02);
    const sh = wp(B['upperarm01_' + s]);
    const pole = sh.clone().addScaledVector(out, 0.12).addScaledVector(U, -0.6).addScaledVector(F, 0.45);
    reach(ARM, s, wrist, pole);
    handTo(s, fingers, palm);
    // (the fingers round the phone's back, the thumb along its front edge)
    curl(s, [22, 26, 14], 0.6);
  }

  /* ----------------------------------------------------- the clips rewritten -- */
  const byName = new Map(clips.map((c) => [c.name, c]));
  const idle = byName.get('idle');
  const LOWER = /^(root|spine0[1-5]|pelvis_|upperleg|lowerleg|foot_|toe)/;
  const NAMES = /^(root|spine|neck|head|clavicle|shoulder01|upperarm|lowerarm|wrist|finger|upperleg|lowerleg|foot_)/;
  function bake(clip, kind) {
    const base = kind === 'ear' && clip.name === 'phoneCall' && idle ? idle : null;
    const tr = clip.tracks.map((t) => { const dot = t.name.lastIndexOf('.'); return { t, b: B[t.name.slice(0, dot)], path: t.name.slice(dot + 1), i: t.createInterpolant() }; }).filter((x) => x.b && (x.path === 'quaternion' || x.path === 'position'));
    const bt = base ? base.tracks.map((t) => { const dot = t.name.lastIndexOf('.'); return { b: B[t.name.slice(0, dot)], path: t.name.slice(dot + 1), i: t.createInterpolant(), d: base.duration }; }).filter((x) => x.b && LOWER.test(x.b.name) && (x.path === 'quaternion' || x.path === 'position')) : [];
    let times = null; for (const x of tr) if (x.path === 'quaternion' && (!times || x.t.times.length > times.length)) times = x.t.times;
    if (!times || !times.length) return clip;
    const set = (x, t) => { const v = x.i.evaluate(t); if (x.path === 'quaternion') x.b.quaternion.fromArray(v); else x.b.position.fromArray(v); };
    const pose = (t) => { reset(); for (const x of tr) if (!(base && LOWER.test(x.b.name))) set(x, t); for (const x of bt) set(x, t % x.d); arm.updateMatrixWorld(true); };
    // (which hand holds the phone: the one the take has highest; the hips' height for the lap)
    const ctx = { thigh: {}, lap: 0.085, earUp: 0.02, earOut: 0.08, earFwd: 0.01, relax: kind === 'upright' && /^(idle|walk|talk|stand)/i.test(clip.name), elbow: kind !== 'upright' || !/wave|cheer|point|phone|run/i.test(clip.name) };
    if (kind === 'ear') { let l = 0, r = 0; for (const t of times) { pose(t); l += wp(B.wrist_L).y; r += wp(B.wrist_R).y; } ctx.hand = l > r ? 'L' : 'R'; }
    // (a talk on the lap: a third of the take's own wrist movement about its middle, the right hand freer)
    let mean = null;
    if (kind === 'lady' && /talk/i.test(clip.name)) {
      mean = { L: V(), R: V() }; for (const t of times) { pose(t); for (const s of ['L', 'R']) mean[s].add(wp(B['wrist_' + s])); }
      for (const s of ['L', 'R']) mean[s].divideScalar(times.length);
    }
    const keep = new Map(); arm.traverse((o) => { if (NAMES.test(o.name) && rest.has(o)) keep.set(o.name, { o, v: new Float32Array(times.length * 4) }); });
    const rootP = new Float32Array(times.length * 3);
    times.forEach((t, k) => {
      pose(t);
      if (mean) { ctx.sway = {}; for (const s of ['L', 'R']) { const d = wp(B['wrist_' + s]).sub(mean[s]).multiplyScalar(s === 'R' ? 0.3 : 0.15); d.y = Math.max(-0.02, Math.min(0.06, d.y)); d.clampLength(0, 0.07); ctx.sway[s] = d; } }
      try { (kind === 'lady' ? lady : kind === 'upright' ? upright : ear)(ctx); } catch (err) { if (k === 0) console.warn('[pose-fix]', clip.name, err); }
      for (const { o, v } of keep.values()) o.quaternion.toArray(v, k * 4);
      B.root.position.toArray(rootP, k * 3);
    });
    const k = clip.clone(); k.tracks = k.tracks.filter((t) => { const n = t.name.slice(0, t.name.lastIndexOf('.')); return !(t.name.endsWith('.quaternion') && keep.has(n)) && !(base && n === 'root' && t.name.endsWith('.position')); });
    for (const [n, { v }] of keep) k.tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', Float32Array.from(times), v));
    if (base) k.tracks.push(new THREE.VectorKeyframeTrack('root.position', Float32Array.from(times), rootP));
    k.userData = { ...(clip.userData || {}), poseFix: kind };
    return k;
  }
  void restH;
  return clips.map((c) => { const kind = fix[c.name] || (fix['*'] && !/sit|lie|crouch|kneel/i.test(c.name) ? fix['*'] : null); if (!kind) return c; try { return bake(c, kind); } catch (err) { console.warn('[pose-fix]', c.name, err); return c; } });
}
